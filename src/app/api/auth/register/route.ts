import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/** 将手机号映射为虚拟邮箱，复用 Supabase 邮箱密码认证 */
function phoneToVirtualEmail(phone: string): string {
  return `${phone}@phone.local`;
}

/** 检查系统开关 */
async function isFeatureOpen(key: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('system_config').select('value').eq('key', key).single();
    const v = data?.value;
    return v === true || v === 'true';
  } catch {
    return true;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 检查注册开关
    const registrationOpen = await isFeatureOpen('registration_open');
    if (!registrationOpen) {
      return NextResponse.json({ error: '注册暂时关闭，请稍后再试' }, { status: 403 });
    }

    const { phone, password, nickname } = await request.json();

    if (!phone || !password) {
      return NextResponse.json({ error: '手机号和密码不能为空' }, { status: 400 });
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少6位' }, { status: 400 });
    }

    const virtualEmail = phoneToVirtualEmail(phone);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: virtualEmail,
      password,
      options: {
        data: {
          nickname: nickname || `用户${phone.slice(-4)}`,
          phone,
        },
      },
    });

    if (error) {
      if (error.message.includes('already registered')) {
        return NextResponse.json({ error: '该手机号已注册，请直接登录' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Create profile（无注册赠送）
    const userId = data.user?.id;
    if (userId) {
      await supabase.from('profiles').insert({
        user_id: userId,
        nickname: nickname || `用户${phone.slice(-4)}`,
        phone,
        credits: 0,
        free_credits: 0,
        paid_credits: 0,
        vip_level: 'free',
        is_admin: false,
        daily_image_count: 0,
        daily_video_count: 0,
        daily_music_count: 0,
        daily_digital_count: 0,
      });
    }

    // Fetch profile
    const profileUserId = data.user?.id;
    const { data: profile } = profileUserId
      ? await supabase.from('profiles').select('*').eq('user_id', profileUserId).maybeSingle()
      : { data: null };

    // Set session cookies
    const response = NextResponse.json({
      user: { id: data.user?.id || '', email: data.user?.email || '', phone },
      profile: profile || null,
      access_token: data.session?.access_token || '',
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
