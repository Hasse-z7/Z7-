import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // Check if admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '无管理员权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab') || 'users';

    if (tab === 'users') {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ users: data });
    }

    if (tab === 'orders') {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ orders: data });
    }

    if (tab === 'credits') {
      const { data, error } = await supabase
        .from('credits_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ transactions: data });
    }

    return NextResponse.json({ error: '无效的tab参数' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取数据失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
