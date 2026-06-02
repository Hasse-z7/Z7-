import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const token =
      request.cookies.get('sb-access-token')?.value ||
      request.headers.get('x-session');

    if (!token) {
      return NextResponse.json({ user: null, profile: null });
    }

    const supabase = getSupabaseClient(token);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ user: null, profile: null });
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // 每日登录赠送5算力点
    if (profile) {
      const today = new Date().toISOString().split('T')[0];
      const lastLogin = profile.last_login_at
        ? new Date(profile.last_login_at).toISOString().split('T')[0]
        : null;

      if (lastLogin !== today) {
        const newCredits = (profile.credits || 0) + 5;

        await supabase
          .from('profiles')
          .update({ credits: newCredits, last_login_at: new Date().toISOString() })
          .eq('user_id', user.id);

        // 记录算力流水
        await supabase.from('credits_transactions').insert({
          user_id: user.id,
          amount: 5,
          balance_after: newCredits,
          type: 'daily_login',
          description: '每日登录赠送5算力点',
        });

        // 更新本地profile对象以返回最新数据
        profile.credits = newCredits;
        profile.last_login_at = new Date().toISOString();
      }
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email || '' },
      profile: profile || null,
    });
  } catch {
    return NextResponse.json({ user: null, profile: null });
  }
}
