import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/** 找回密码：通过手机验证码验证身份后重置密码 */
export async function POST(request: NextRequest) {
  try {
    const { phone, code, newPassword } = await request.json();

    if (!phone || !code || !newPassword) {
      return NextResponse.json({ error: '手机号、验证码和新密码不能为空' }, { status: 400 });
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: '密码至少6位' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 1. 先用手机号+验证码验证身份
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });

    if (verifyError) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 400 });
    }

    // 2. 验证成功后，用返回的 session 更新密码
    const userId = verifyData.user?.id;
    const sessionAccessToken = verifyData.session?.access_token;

    if (!userId || !sessionAccessToken) {
      return NextResponse.json({ error: '验证失败，请重试' }, { status: 400 });
    }

    // 使用验证 OTP 后获得的 session 来更新密码
    const userClient = getSupabaseClient(sessionAccessToken);
    const { error: updateError } = await userClient.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return NextResponse.json({ error: '重置密码失败，请重试' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '密码重置成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '重置密码失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
