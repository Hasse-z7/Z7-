import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('payment_qrcodes')
      .select('*');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ qrcodes: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取收款码失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = getSupabaseClient();
    // This would be called by admin to upload QR codes
    // The actual upload is handled via storage API
    return NextResponse.json({ message: 'Use storage API to upload QR code images' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传收款码失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
