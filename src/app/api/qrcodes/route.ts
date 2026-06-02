import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { S3Storage } from 'coze-coding-dev-sdk';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('payment_qrcodes')
      .select('*')
      .eq('is_active', true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Generate fresh presigned URLs for each QR code
    const qrcodes = await Promise.all(
      (data || []).map(async (qrcode: { file_key: string; type: string; is_active: boolean; id: number; file_url: string }) => {
        let freshUrl = qrcode.file_url;
        if (qrcode.file_key) {
          try {
            freshUrl = await storage.generatePresignedUrl({
              key: qrcode.file_key,
              expireTime: 86400, // 1 day
            });
          } catch {
            // Fall back to stored URL if presign fails
            freshUrl = qrcode.file_url;
          }
        }
        return { ...qrcode, file_url: freshUrl };
      })
    );

    return NextResponse.json({ qrcodes });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取收款码失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
