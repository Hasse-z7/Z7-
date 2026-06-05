import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getAuthUser } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null; // 'image' or 'audio'

    if (!file) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }

    // Validate file type
    if (type === 'image' && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: '请上传图片文件' }, { status: 400 });
    }
    if (type === 'audio' && !file.type.startsWith('audio/')) {
      return NextResponse.json({ error: '请上传音频文件' }, { status: 400 });
    }
    if (type === 'video' && !file.type.startsWith('video/')) {
      return NextResponse.json({ error: '请上传视频文件' }, { status: 400 });
    }

    // Max file size: 100MB for video, 20MB for others
    const MAX_SIZE = type === 'video' ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '文件大小不能超过20MB' }, { status: 400 });
    }

    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const folder = type === 'audio' ? 'audio' : type === 'video' ? 'videos' : 'images';
    const ext = file.name.split('.').pop() || 'bin';
    const fileName = `${folder}/${user.id}_${Date.now()}.${ext}`;

    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    const url = await storage.generatePresignedUrl({
      key,
      expireTime: 86400, // 1 day for upload preview
    });

    return NextResponse.json({ url, key });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : '上传失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
