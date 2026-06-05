/**
 * 支付宝主动查单接口
 *
 * 用途：
 * 1. 前端轮询订单状态（用户扫码后每隔3秒查询一次）
 * 2. 后端兜底校验（定时任务查漏补缺）
 *
 * 查单逻辑：
 * - 先查数据库订单状态
 * - 如果订单仍为 pending，调用支付宝 tradeQuery 接口
 * - 如果支付宝返回 TRADE_SUCCESS，执行算力发放
 * - 发放完成后返回 completed
 *
 * 重要：禁止前端触发直接发放算力，只有回调或查单确认才能发放
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { tradeQuery } from '@/lib/alipay';
import { addPaidCredits } from '@/lib/credits-helpers';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.COZE_SUPABASE_URL!,
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { order_id } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: '缺少订单ID' }, { status: 400 });
    }

    // 查询订单
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    }

    // 已完成的订单直接返回
    if (order.status === 'completed') {
      return NextResponse.json({
        status: 'completed',
        credits_granted: order.credits_granted,
        message: '充值已到账',
      });
    }

    // 已关闭的订单
    if (order.status === 'closed' || order.status === 'cancelled') {
      return NextResponse.json({
        status: order.status,
        message: '订单已关闭',
      });
    }

    // pending 状态：主动查单
    if (order.status === 'pending' && order.payment_method === 'alipay') {
      const queryResult = await tradeQuery({ outTradeNo: order.order_no });

      if (queryResult.success && (queryResult.trade_status === 'TRADE_SUCCESS' || queryResult.trade_status === 'TRADE_FINISHED')) {
        // 支付宝确认支付成功，执行算力发放
        const adminClient = getSupabaseAdmin();

        // 原子更新订单状态（乐观锁）
        const { error: updateError } = await adminClient
          .from('orders')
          .update({
            status: 'completed',
            paid_at: new Date().toISOString(),
            verified_at: new Date().toISOString(),
            alipay_trade_no: queryResult.trade_no || null,
            alipay_buyer_id: queryResult.buyer_user_id || null,
          })
          .eq('id', order.id)
          .eq('status', 'pending');

        if (!updateError) {
          // 发放算力
          const { newTotalCredits } = await addPaidCredits(
            adminClient,
            order.user_id,
            order.credits_granted,
            'recharge',
            `支付宝充值${order.credits_granted}算力点 - ${order.package_name || '套餐'}`,
            String(order.id),
          );

          // VIP套餐处理
          if (order.package_id) {
            const { data: pkg } = await adminClient
              .from('recharge_packages')
              .select('type, duration_days')
              .eq('id', order.package_id)
              .maybeSingle();

            if (pkg?.duration_days && pkg.duration_days > 0) {
              const { data: profile } = await adminClient
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

                await adminClient.from('profiles').update({
                  vip_level: vipLevel,
                  vip_expire_at: newExpiry.toISOString(),
                }).eq('user_id', order.user_id);
              }
            }
          }

          console.log('[Alipay Query] 查单确认支付成功，算力已发放:', {
            orderNo: order.order_no,
            credits: order.credits_granted,
            newBalance: newTotalCredits,
          });

          return NextResponse.json({
            status: 'completed',
            credits_granted: order.credits_granted,
            new_balance: newTotalCredits,
            message: '充值成功！算力已到账',
          });
        }
      }

      // 未支付或其他状态
      if (queryResult.success) {
        return NextResponse.json({
          status: 'pending',
          trade_status: queryResult.trade_status,
          message: '等待支付',
        });
      }

      // 查单失败，仍返回pending（不影响用户等待）
      return NextResponse.json({
        status: 'pending',
        message: '查询中，请稍候',
      });
    }

    // 非支付宝订单
    return NextResponse.json({
      status: order.status,
      message: '订单状态查询',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
