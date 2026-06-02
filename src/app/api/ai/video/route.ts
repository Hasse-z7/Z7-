/**
 * AI视频生成 API（异步任务架构）
 *
 * 流程：
 *   1. 用户提交请求 → 校验算力 → 预扣算力 → 创建任务记录 → 返回 task_id
 *   2. Worker 进程异步消费任务 → 调用方舟API → 轮询结果
 *   3. 前端轮询 /api/ai/video/status?task_id=xxx 获取状态
 *
 * 算力规则：3算力/秒 × 视频时长
 * 优先消耗免费算力，再消耗付费算力
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { deductCredits, recordTransaction, CREDITS_PER_SECOND } from '@/lib/credits-helpers';
import { isCircuitBreakerOpen } from '@/lib/ark-config';

export async function POST(request: NextRequest) {
  try {
    // ========== 0. 认证校验 ==========
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // ========== 1. 熔断检查 ==========
    if (isCircuitBreakerOpen()) {
      return NextResponse.json(
        { error: '系统繁忙，请稍后再试' },
        { status: 503 },
      );
    }

    // ========== 2. 解析请求参数 ==========
    const body = await request.json();
    const {
      prompt,
      negative_prompt,
      image_url,
      images,
      mode,
      duration,
      ratio,
      resolution,
      audio,
      audio_url,
      model_id,
    } = body;

    if (!prompt && !image_url && (!images || images.length === 0)) {
      return NextResponse.json({ error: '请输入描述或上传图片' }, { status: 400 });
    }

    // ========== 2.1 校验模型ID ==========
    if (!model_id || typeof model_id !== 'string' || !model_id.startsWith('ark-')) {
      return NextResponse.json({ error: '请选择有效的生成模型' }, { status: 400 });
    }

    const { supabase } = authResult;

    // ========== 3. 计算算力消耗 ==========
    const videoDuration = duration || 5;
    const creditsCost = CREDITS_PER_SECOND * videoDuration;

    // ========== 4. 预扣算力 ==========
    const deduction = await deductCredits(supabase, authResult.user.id, creditsCost);

    if (!deduction.success) {
      return NextResponse.json(
        { error: (deduction as { error: string }).error, redirect: '/recharge' },
        { status: 402 },
      );
    }

    // ========== 5. 创建异步任务记录 ==========
    const referenceImages: string[] = [];
    if (images && Array.isArray(images)) {
      referenceImages.push(...images.filter((url: string) => typeof url === 'string'));
    } else if (image_url) {
      referenceImages.push(image_url);
    }

    const { data: task, error: taskError } = await supabase
      .from('video_tasks')
      .insert({
        user_id: authResult.user.id,
        status: 'queued',
        prompt: prompt || '',
        negative_prompt: negative_prompt || '',
        ratio: ratio || '16:9',
        duration: videoDuration,
        quality: resolution || '720p',
        fps: 24,
        mode: mode || (referenceImages.length > 0 ? 'img2video' : 'text2video'),
        reference_images: referenceImages,
        audio_url: audio_url || null,
        audio_enabled: audio !== false,
        credits_cost: creditsCost,
        free_deducted: deduction.freeDeducted,
        paid_deducted: deduction.paidDeducted,
        model_endpoint: model_id,
      })
      .select('id')
      .maybeSingle();

    if (taskError || !task) {
      // 创建任务失败，退还预扣算力
      const { refundCredits } = await import('@/lib/credits-helpers');
      await refundCredits(supabase, authResult.user.id, deduction);

      console.error('[VideoAPI] 创建任务失败:', taskError);
      return NextResponse.json({ error: '创建任务失败，请重试' }, { status: 500 });
    }

    // ========== 6. 记录预扣流水 ==========
    const creditsType = deduction.freeDeducted > 0 && deduction.paidDeducted > 0
      ? 'mixed'
      : deduction.freeDeducted > 0 ? 'free' : 'paid';

    await recordTransaction(supabase, {
      userId: authResult.user.id,
      amount: -creditsCost,
      balanceAfter: deduction.newTotalCredits,
      type: 'consumption',
      description: `AI视频预扣(${videoDuration}秒) - ${model_id.slice(0, 16)}... - 任务 ${task.id.slice(0, 8)}`,
      creditsType,
      relatedId: task.id,
    });

    // ========== 7. 触发 Worker 处理（fire-and-forget） ==========
    const baseUrl = process.env.DEPLOY_RUN_PORT
      ? `http://localhost:${process.env.DEPLOY_RUN_PORT}`
      : 'http://localhost:5000';

    fetch(`${baseUrl}/api/ai/video/worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: task.id }),
    }).catch(err => {
      console.error('[VideoAPI] 触发Worker失败（将在下次轮询时恢复）:', err);
    });

    // ========== 8. 立即返回任务ID ==========
    return NextResponse.json({
      task_id: task.id,
      status: 'queued',
      credits_cost: creditsCost,
      remaining_credits: deduction.newTotalCredits,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('[VideoAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
