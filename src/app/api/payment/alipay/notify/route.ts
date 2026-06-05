/**
 * 支付宝当面付异步通知网关
 *
 * 流程：
 * 1. RSA2验签 → 验签失败返回 "fail"
 * 2. 校验订单号、金额、交易状态 TRADE_SUCCESS
 * 3. 数据库原子更新订单状态 + 增加算力
 * 4. 返回 "success"（固定英文小写）
 *
 * 重要：
 * - 禁止前端支付成功直接发放算力
 * - 全靠网关回调 + 后端主动查单双重校验
 * - 必须返回纯文本 "success" 或 "fail"（支付宝协议要求）
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyNotifySign, tradeQuery } from '@/lib/alipay';
import { addPaidCredits } from '@/lib/credits-helpers';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.COZE_SUPABASE_URL!,
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  console.log('[Alipay Notify] 收到异步通知');

  try {
    // 解析支付宝POST的form数据
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    console.log('[Alipay Notify] 通知参数 out_trade_no:', params.out_trade_no, 'trade_status:', params.trade_status);

    // ==================== 第一步：RSA2验签 ====================
    const signValid = verifyNotifySign(params);
    if (!signValid) {
      console.error('[Alipay Notify] RSA2验签失败', { out_trade_no: params.out_trade_no });
      return new NextResponse('fail', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    console.log('[Alipay Notify] RSA2验签通过');

    // ==================== 第二步：校验订单号、金额、交易状态 ====================
    const outTradeNo = params.out_trade_no;       // 商户订单号
    const tradeStatus = params.trade_status;       // 交易状态
    const tradeNo = params.trade_no;               // 支付宝交易号
    const totalAmount = params.total_amount;       // 实付金额
    const buyerId = params.buyer_id;               // 买家ID

    if (!outTradeNo || !tradeStatus) {
      console.error('[Alipay Notify] 缺少必要参数');
      return new NextResponse('fail', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // 只处理 TRADE_SUCCESS（交易支付成功）和 TRADE_FINISHED（交易完结）
    if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
      console.log('[Alipay Notify] 交易状态非成功:', tradeStatus, '忽略');
      // 非 success 状态也要返回 success，避免支付宝持续重试
      return new NextResponse('success', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    const supabase = getSupabaseAdmin();

    // 查询订单
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_no', outTradeNo)
      .maybeSingle();

    if (orderError || !order) {
      console.error('[Alipay Notify] 订单不存在:', outTradeNo);
      return new NextResponse('fail', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // 已处理过的订单直接返回success（幂等）
    if (order.status === 'completed') {
      console.log('[Alipay Notify] 订单已处理过，返回success:', outTradeNo);
      return new NextResponse('success', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // 校验金额（支付宝传的是元，如 "10.00"）
    const paidAmount = parseFloat(totalAmount || '0');
    const orderAmount = order.amount;
    if (Math.abs(paidAmount - orderAmount) > 0.01) {
      console.error('[Alipay Notify] 金额不匹配:', { paid: paidAmount, order: orderAmount });
      return new NextResponse('fail', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // ==================== 第三步：主动查单二次校验 ====================
    // 防止伪造通知，调用支付宝查询接口确认交易状态
    const queryResult = await tradeQuery({ outTradeNo });
    if (!queryResult.success || (queryResult.trade_status !== 'TRADE_SUCCESS' && queryResult.trade_status !== 'TRADE_FINISHED')) {
      console.error('[Alipay Notify] 主动查单验证失败:', JSON.stringify(queryResult));
      return new NextResponse('fail', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // 二次校验金额
    if (queryResult.total_amount) {
      const queryAmount = parseFloat(queryResult.total_amount);
      if (Math.abs(queryAmount - orderAmount) > 0.01) {
        console.error('[Alipay Notify] 主动查单金额不匹配:', { query: queryAmount, order: orderAmount });
        return new NextResponse('fail', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
    }

    console.log('[Alipay Notify] 主动查单验证通过，开始发放算力');

    // ==================== 第四步：原子更新订单状态 + 发放算力 ====================
    // 更新订单状态
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        paid_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
        alipay_trade_no: tradeNo || queryResult.trade_no || null,
        alipay_buyer_id: buyerId || queryResult.buyer_user_id || null,
      })
      .eq('id', order.id)
      .eq('status', 'pending'); // 乐观锁：只更新pending状态

    if (updateError) {
      console.error('[Alipay Notify] 更新订单状态失败:', updateError.message);
      return new NextResponse('fail', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // 检查更新是否生效（乐观锁验证）
    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('status')
      .eq('id', order.id)
      .maybeSingle();

    if (!updatedOrder || updatedOrder.status !== 'completed') {
      console.log('[Alipay Notify] 订单已被其他进程处理，跳过');
      return new NextResponse('success', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // 发放算力（充值写入paid_credits）
    const { newTotalCredits } = await addPaidCredits(
      supabase,
      order.user_id,
      order.credits_granted,
      'recharge',
      `支付宝充值${order.credits_granted}算力点 - ${order.package_name || '套餐'}`,
      String(order.id),
    );

    // VIP套餐处理
    if (order.package_id) {
      const { data: pkg } = await supabase
        .from('recharge_packages')
        .select('type, duration_days')
        .eq('id', order.package_id)
        .maybeSingle();

      if (pkg?.duration_days && pkg.duration_days > 0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('vip_level, vip_expire_at')
          .eq('user_id', order.user_id)
          .maybeSingle();

        if (profile) {
          const currentExpiry = profile.vip_expire_at ? new Date(profile.vip_expire_at) : new Date();
          const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
          const newExpiry = new Date(baseDate.getTime() + pkg.duration_days * 24 * 60 * 60 * 1000);

          let vipLevel = profile.vip_level;
          if (pkg.type === 'vip_month') vipLevel = 'vip_month';
          else if (pkg.type === 'vip_quarter') vipLevel = 'vip_quarter';
          else if (pkg.type === 'vip_year') vipLevel = 'vip_year';

          await supabase.from('profiles').update({
            vip_level: vipLevel,
            vip_expire_at: newExpiry.toISOString(),
          }).eq('user_id', order.user_id);
        }
      }
    }

    console.log('[Alipay Notify] 算力发放成功:', {
      orderNo: outTradeNo,
      userId: order.user_id,
      credits: order.credits_granted,
      newBalance: newTotalCredits,
    });

    // ==================== 第五步：固定返回success ====================
    return new NextResponse('success', { status: 200, headers: { 'Content-Type': 'text/plain' } });

  } catch (err) {
    console.error('[Alipay Notify] 处理异常:', err);
    return new NextResponse('fail', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
}
