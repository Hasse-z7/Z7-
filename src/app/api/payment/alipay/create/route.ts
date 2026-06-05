/**
 * 支付宝当面付下单接口
 *
 * 流程：
 * 1. 用户选择套餐 → 创建订单（status=pending）
 * 2. 调用支付宝 precreate 接口 → 获取二维码链接
 * 3. 前端展示二维码，用户扫码支付
 * 4. 支付成功后支付宝回调 notify 网关 → 发放算力
 * 5. 前端轮询 query 接口 → 确认支付状态
 *
 * 禁止前端支付成功直接发放算力，全靠后端回调+查单
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { precreate } from '@/lib/alipay';
import { rateLimitResponse } from '@/lib/ip-rate-limiter';

export async function POST(request: NextRequest) {
  // IP限流：充值3次/分钟
  const rateLimited = rateLimitResponse(request, 'recharge');
  if (rateLimited) return rateLimited;

  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { package_id } = await request.json();
    if (!package_id) {
      return NextResponse.json({ error: '请选择充值套餐' }, { status: 400 });
    }

    // 查询套餐信息
    const { data: pkg, error: pkgError } = await supabase
      .from('recharge_packages')
      .select('*')
      .eq('id', package_id)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json({ error: '套餐不存在' }, { status: 404 });
    }

    // 生成商户订单号
    const orderNo = `AP${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // 创建订单
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        order_no: orderNo,
        package_id: pkg.id,
        package_name: pkg.name,
        amount: pkg.price,
        credits_granted: pkg.credits + (pkg.bonus_credits || 0),
        payment_method: 'alipay',
        status: 'pending',
      })
      .select()
      .maybeSingle();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    // 调用支付宝当面付下单
    const result = await precreate({
      outTradeNo: orderNo,
      totalAmount: pkg.price.toFixed(2),
      subject: `燃冬AI - ${pkg.name}`,
      timeoutExpress: '30m',
    });

    if (!result.success) {
      // 下单失败，更新订单状态为closed
      await supabase
        .from('orders')
        .update({ status: 'closed' })
        .eq('id', order.id);

      return NextResponse.json({ error: result.error || '支付宝下单失败' }, { status: 500 });
    }

    return NextResponse.json({
      order: {
        id: order.id,
        order_no: orderNo,
        amount: pkg.price,
        credits_granted: order.credits_granted,
        status: 'pending',
      },
      qr_code: result.qr_code, // 支付宝二维码链接，前端用此生成二维码
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建订单失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
