import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { package_id, payment_method } = await request.json();

    if (!package_id || !payment_method) {
      return NextResponse.json({ error: '请选择充值套餐和支付方式' }, { status: 400 });
    }

    // Get package info
    const { data: pkg, error: pkgError } = await supabase
      .from('recharge_packages')
      .select('*')
      .eq('id', package_id)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json({ error: '套餐不存在' }, { status: 404 });
    }

    // Create order
    const orderNo = `ORD${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        order_no: orderNo,
        package_id: pkg.id,
        package_name: pkg.name,
        amount: pkg.price,
        credits_granted: pkg.credits + (pkg.bonus_credits || 0),
        payment_method,
        status: 'pending',
      })
      .select()
      .maybeSingle();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    return NextResponse.json({ order });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建订单失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
