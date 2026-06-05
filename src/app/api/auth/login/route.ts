import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { rateLimitResponse } from '@/lib/ip-rate-limiter';

/** 将手机号映射为虚拟邮箱，复用 Supabase 邮箱密码认证 */
function phoneToVirtualEmail(phone: string): string {
  return `${phone}@phone.local`;
}

export async function POST(request: NextRequest) {
  // IP限流：登录5次/分钟
  const rateLimited = rateLimitResponse(request, 'auth');
  if (rateLimited) return rateLimited;

  try {
    const { phone, password } = await request.json();

    if (!phone || !password) {
      return NextResponse.json({ error: '手机号和密码不能为空' }, { status: 400 });
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }

    const virtualEmail = phoneToVirtualEmail(phone);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: virtualEmail,
      password,
    });

    if (error) {
      // 友好化错误信息
      if (error.message.includes('Invalid login credentials')) {
        return NextResponse.json({ error: '手机号或密码错误' }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', data.user.id)
      .maybeSingle();

    // Set session token in httpOnly cookie
    const response = NextResponse.json({
      user: { id: data.user.id, email: data.user.email || '', phone },
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
    const message = err instanceof Error ? err.message : '登录失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE = logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('sb-access-token');
  response.cookies.delete('sb-refresh-token');
  return response;
}
