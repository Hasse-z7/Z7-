import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { addFreeCredits, DAILY_LOGIN_BONUS } from '@/lib/credits-helpers';

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

    // 每日登录赠送5算力点（写入free_credits）
    if (profile) {
      const today = new Date().toISOString().split('T')[0];
      const lastLogin = profile.last_login_at
        ? new Date(profile.last_login_at).toISOString().split('T')[0]
        : null;

      if (lastLogin !== today) {
        try {
          const { newTotalCredits } = await addFreeCredits(
            supabase,
            user.id,
            DAILY_LOGIN_BONUS,
            'daily_login',
            '每日登录赠送5算力点',
          );

          // 更新 last_login_at
          await supabase
            .from('profiles')
            .update({ last_login_at: new Date().toISOString() })
            .eq('user_id', user.id);

          // 更新本地profile对象以返回最新数据
          profile.credits = newTotalCredits;
          profile.free_credits = (profile.free_credits || 0) + DAILY_LOGIN_BONUS;
          profile.last_login_at = new Date().toISOString();
        } catch {
          // 日志赠送失败不影响正常返回
        }
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
