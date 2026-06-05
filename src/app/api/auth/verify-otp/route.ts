import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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
    // 检查注册开关（新用户注册时）
    const { phone, code } = await request.json();

    if (!phone || !code) {
      return NextResponse.json({ error: '手机号和验证码不能为空' }, { status: 400 });
    }

    const cleanPhone = phone.replace(/\s/g, '');
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.verifyOtp({
      phone: `+86${cleanPhone}`,
      token: code,
      type: 'sms',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 检查是否为新用户（需要创建 profile）
    const userId = data.user?.id;
    if (userId) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!existingProfile) {
        // 新用户：检查注册开关
        const registrationOpen = await isFeatureOpen('registration_open');
        if (!registrationOpen) {
          // 删除刚创建的auth用户，阻止注册
          const adminSupabase = getSupabaseClient();
          await adminSupabase.auth.admin.deleteUser(userId);
          return NextResponse.json({ error: '注册暂时关闭，请稍后再试' }, { status: 403 });
        }
        // 创建 profile（无注册赠送）
        const phoneSuffix = cleanPhone.slice(-4);
        const nickname = `用户${phoneSuffix}`;
        await supabase.from('profiles').insert({
          user_id: userId,
          nickname,
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
    }

    // Fetch profile
    const profileUserId = data.user?.id;
    const { data: profile } = profileUserId
      ? await supabase.from('profiles').select('*').eq('user_id', profileUserId).maybeSingle()
      : { data: null };

    // Set session cookies
    const response = NextResponse.json({
      user: { id: data.user?.id || '', email: data.user?.email || '', phone: data.user?.phone || '' },
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
    const message = err instanceof Error ? err.message : '验证码验证失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
