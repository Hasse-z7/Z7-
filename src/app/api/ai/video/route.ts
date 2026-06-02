import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthUser } from '@/lib/auth-helpers';
import { generateVideo } from '@/lib/coze-api';

// 算力消耗规则：3算力点/秒，按视频时长计算
const CREDITS_PER_SECOND = 3;

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, image_url, mode, duration, ratio, resolution } = body;

    if (!prompt && !image_url) {
      return NextResponse.json({ error: '请输入描述或上传图片' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', authResult.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: '用户资料不存在' }, { status: 404 });
    }

    // 计算算力消耗：3点/秒 × 视频时长
    const videoDuration = duration || 5;
    const creditsCost = CREDITS_PER_SECOND * videoDuration;

    if (profile.credits < creditsCost) {
      return NextResponse.json(
        { error: '算力余额不足，请前往充值页面充值', redirect: '/recharge' },
        { status: 402 }
      );
    }

    // Generate video
    const result = await generateVideo(request, {
      prompt,
      imageUrl: image_url,
      duration: videoDuration,
      resolution: resolution || '720p',
      ratio: ratio || '16:9',
    });

    // Deduct credits
    const newCredits = profile.credits - creditsCost;

    await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('user_id', authResult.user.id);

    // Record credits transaction
    await supabase.from('credits_transactions').insert({
      user_id: authResult.user.id,
      amount: -creditsCost,
      balance_after: newCredits,
      type: 'consumption',
      description: `AI视频(${videoDuration}秒) - ${mode || 'text2video'}`,
    });

    // Save work
    if (result.videoUrl) {
      await supabase.from('user_works').insert({
        user_id: authResult.user.id,
        work_type: 'video',
        file_url: result.videoUrl,
        prompt: prompt || '',
        credits_cost: creditsCost,
      });
    }

    return NextResponse.json({
      video_url: result.videoUrl,
      last_frame_url: result.lastFrameUrl,
      credits_cost: creditsCost,
      remaining_credits: newCredits,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('AI video generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
