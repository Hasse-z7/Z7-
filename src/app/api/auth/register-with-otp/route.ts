import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { rateLimitResponse } from '@/lib/ip-rate-limiter';

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

/**
 * 注册流程（验证码+密码）：
 * 1. 前端先调用 /api/auth/send-otp 发送验证码
 * 2. 前端再调用本接口，传入 phone + code + password + nickname
 * 3. 后端先验证OTP，验证通过后创建账号（虚拟邮箱+密码）
 */
export async function POST(request: NextRequest) {
  const rateLimited = rateLimitResponse(request, 'auth');
  if (rateLimited) return rateLimited;

  try {
    // 检查注册开关
    const registrationOpen = await isFeatureOpen('registration_open');
    if (!registrationOpen) {
      return NextResponse.json({ error: '注册暂时关闭，请稍后再试' }, { status: 403 });
    }

    const { phone, code, password, nickname } = await request.json();

    if (!phone || !code || !password) {
      return NextResponse.json({ error: '手机号、验证码和密码不能为空' }, { status: 400 });
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少6位' }, { status: 400 });
    }

    // Step 1: 先验证验证码
    const supabase = getSupabaseClient();
    const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
      phone: `+86${phone}`,
      token: code,
      type: 'sms',
    });

    if (otpError) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 400 });
    }

    // Step 2: 验证码通过，检查是否已有账号
    const userId = otpData.user?.id;
    if (!userId) {
      return NextResponse.json({ error: '验证失败，请重试' }, { status: 400 });
    }

    // 检查是否已有 profile（已有账号说明是老用户登录，不是注册）
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('user_id, phone')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingProfile) {
      // 老用户：直接登录，设置密码（如果还没设置的话）
      // 更新虚拟邮箱和密码
      const virtualEmail = phoneToVirtualEmail(phone);
      const adminSupabase = getSupabaseClient();
      await adminSupabase.auth.admin.updateUserById(userId, {
        email: virtualEmail,
        password,
        email_confirm: true,
      });

      // 更新 profile phone（如果为空）
      if (!existingProfile.phone) {
        await supabase.from('profiles').update({ phone }).eq('user_id', userId);
      }

      // 返回登录成功
      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
      const response = NextResponse.json({
        user: { id: userId, email: virtualEmail, phone },
        profile: profile || null,
        access_token: otpData.session?.access_token || '',
        message: '密码设置成功，已自动登录',
      });

      if (otpData.session?.access_token) {
        response.cookies.set('sb-access-token', otpData.session.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        });
        response.cookies.set('sb-refresh-token', otpData.session.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        });
      }

      return response;
    }

    // Step 3: 新用户 - 设置虚拟邮箱和密码
    const virtualEmail = phoneToVirtualEmail(phone);
    const adminSupabase = getSupabaseClient();
    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(userId, {
      email: virtualEmail,
      password,
      email_confirm: true,
    });

    if (updateError) {
      return NextResponse.json({ error: '设置密码失败，请重试' }, { status: 500 });
    }

    // Step 4: 创建 profile
    const nicknameFinal = nickname || `用户${phone.slice(-4)}`;
    await supabase.from('profiles').insert({
      user_id: userId,
      nickname: nicknameFinal,
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

    // Step 5: 返回登录成功
    const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    const response = NextResponse.json({
      user: { id: userId, email: virtualEmail, phone },
      profile: profile || null,
      access_token: otpData.session?.access_token || '',
      message: '注册成功',
    });

    if (otpData.session?.access_token) {
      response.cookies.set('sb-access-token', otpData.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
      response.cookies.set('sb-refresh-token', otpData.session.refresh_token, {
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
