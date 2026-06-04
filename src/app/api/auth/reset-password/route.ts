import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: '邮箱不能为空' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/reset-password`,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: '密码重置邮件已发送' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '发送重置邮件失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
