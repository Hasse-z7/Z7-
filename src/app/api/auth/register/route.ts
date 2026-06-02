import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const { email, password, nickname } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nickname: nickname || email.split('@')[0] } },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Create profile
    const userId = data.user?.id;
    if (userId) {
      await supabase.from('profiles').insert({
        user_id: userId,
        nickname: nickname || email.split('@')[0],
        credits: 10,
        vip_level: 'free',
        is_admin: false,
        daily_image_count: 0,
        daily_video_count: 0,
        daily_music_count: 0,
        daily_digital_count: 0,
      });

      // Grant registration bonus
      await supabase.from('credits_transactions').insert({
        user_id: userId,
        amount: 10,
        balance_after: 10,
        type: 'register_bonus',
        description: '新人注册赠送10算力',
      });
    }

    // Fetch profile
    const profileUserId = data.user?.id;
    const { data: profile } = profileUserId
      ? await supabase.from('profiles').select('*').eq('user_id', profileUserId).maybeSingle()
      : { data: null };

    // Set session cookies
    const response = NextResponse.json({
      user: { id: data.user?.id || '', email: data.user?.email || '' },
      profile: profile || null,
    });

    if (data.session?.access_token) {
      response.cookies.set('sb-access-token', data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
      response.cookies.set('sb-refresh-token', data.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : '注册失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
