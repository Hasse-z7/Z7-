import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { rateLimitResponse } from '@/lib/ip-rate-limiter';

export async function POST(request: NextRequest) {
  const rateLimited = rateLimitResponse(request, 'auth');
  if (rateLimited) return rateLimited;
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: '手机号不能为空' }, { status: 400 });
    }

    // 验证手机号格式（中国大陆11位）
    const cleanPhone = phone.replace(/\s/g, '');
    if (!/^1[3-9]\d{9}$/.test(cleanPhone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone: `+86${cleanPhone}`,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: '验证码已发送' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '发送验证码失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
