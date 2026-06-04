import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { addPaidCredits } from '@/lib/credits-helpers';

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

    // Get order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    }

    if (order.status === 'completed') {
      return NextResponse.json({ error: '订单已核验完成，请勿重复操作' }, { status: 400 });
    }

    // Mark order as completed (manual verification)
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'completed', verified_at: new Date().toISOString() })
      .eq('id', order_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Add paid credits (充值算力写入paid_credits)
    const { newTotalCredits } = await addPaidCredits(
      supabase,
      user.id,
      order.credits_granted,
      'recharge',
      `充值${order.credits_granted}算力点 - ${order.package_name || '套餐'}`,
      String(order.id),
    );

    // If VIP package, update VIP level and expiry
    if (order.package_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('vip_level, vip_expire_at')
        .eq('user_id', user.id)
        .maybeSingle();

      const { data: pkg } = await supabase
        .from('recharge_packages')
        .select('type, duration_days')
        .eq('id', order.package_id)
        .maybeSingle();

      if (pkg?.duration_days && pkg.duration_days > 0 && profile) {
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
        }).eq('user_id', user.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: `充值成功！已到账 ${order.credits_granted} 算力点`,
      credits_added: order.credits_granted,
      new_balance: newTotalCredits,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '订单核验失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
