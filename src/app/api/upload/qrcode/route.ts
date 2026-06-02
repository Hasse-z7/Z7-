import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { S3Storage } from 'coze-coding-dev-sdk';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const paymentMethod = formData.get('payment_method') as string | null; // 'wechat' or 'alipay'

    if (!file || !paymentMethod) {
      return NextResponse.json(
        { error: '请提供收款码图片和支付方式' },
        { status: 400 }
      );
    }

    if (!['wechat', 'alipay'].includes(paymentMethod)) {
      return NextResponse.json(
        { error: '支付方式仅支持 wechat 或 alipay' },
        { status: 400 }
      );
    }

    // Upload to S3 storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `qrcodes/${paymentMethod}_${Date.now()}.${ext}`;

    const fileKey = await storage.uploadFile({
      fileContent: fileBuffer,
      fileName,
      contentType: file.type || 'image/jpeg',
    });

    // Generate presigned URL for display
    const imageUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400 * 30, // 30 days
    });

    // Save to database - upsert by type
    const supabase = getSupabaseClient();

    // Check if record exists
    const { data: existing } = await supabase
      .from('payment_qrcodes')
      .select('id')
      .eq('type', paymentMethod)
      .single();

    let result;
    if (existing) {
      // Update existing
      result = await supabase
        .from('payment_qrcodes')
        .update({
          file_key: fileKey,
          file_url: imageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('type', paymentMethod)
        .select()
        .single();
    } else {
      // Insert new
      result = await supabase
        .from('payment_qrcodes')
        .insert({
          type: paymentMethod,
          file_key: fileKey,
          file_url: imageUrl,
          is_active: true,
        })
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      qrcode: result.data,
      fileKey,
      imageUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传收款码失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
