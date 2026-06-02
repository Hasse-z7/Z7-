import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { generateVideo } from '@/lib/coze-api';
import { deductCredits, refundCredits, recordTransaction, CREDITS_PER_SECOND } from '@/lib/credits-helpers';

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, image_url, mode, duration, ratio, resolution, audio } = body;

    if (!prompt && !image_url) {
      return NextResponse.json({ error: '请输入描述或上传图片' }, { status: 400 });
    }

    const { supabase } = authResult;

    // 计算算力消耗：3点/秒 × 视频时长
    const videoDuration = duration || 5;
    const creditsCost = CREDITS_PER_SECOND * videoDuration;

    // ========== 1. 先扣算力，再调用AI模型 ==========
    const deduction = await deductCredits(supabase, authResult.user.id, creditsCost);

    if (!deduction.success) {
      return NextResponse.json(
        { error: deduction.error, redirect: deduction.redirect },
        { status: 402 },
      );
    }

    // ========== 2. 调用AI模型生成视频 ==========
    let result: { videoUrl: string; lastFrameUrl?: string };
    try {
      result = await generateVideo(request, {
        prompt,
        imageUrl: image_url,
        duration: videoDuration,
        resolution: resolution || '720p',
        ratio: ratio || '16:9',
        generateAudio: audio !== false,
      });
    } catch (aiError: unknown) {
      // AI调用失败，退还已扣除的算力
      await refundCredits(supabase, authResult.user.id, deduction);

      // 记录退还流水
      await recordTransaction(supabase, {
        userId: authResult.user.id,
        amount: creditsCost,
        balanceAfter: deduction.newTotalCredits,
        type: 'refund',
        description: `AI视频失败退还(${videoDuration}秒)`,
        creditsType: 'refund',
      });

      const message = aiError instanceof Error ? aiError.message : '生成失败';
      console.error('AI video generation error:', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // ========== 3. 记录消耗流水 ==========
    const creditsType = deduction.freeDeducted > 0 && deduction.paidDeducted > 0
      ? 'mixed'
      : deduction.freeDeducted > 0 ? 'free' : 'paid';

    await recordTransaction(supabase, {
      userId: authResult.user.id,
      amount: -creditsCost,
      balanceAfter: deduction.newTotalCredits,
      type: 'consumption',
      description: `AI视频(${videoDuration}秒) - ${mode || 'text2video'}`,
      creditsType,
    });

    // ========== 4. 保存作品 ==========
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
      remaining_credits: deduction.newTotalCredits,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('AI video generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
