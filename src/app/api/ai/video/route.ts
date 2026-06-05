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
import { deductCredits, refundCredits, recordTransaction, CREDITS_PER_SECOND } from '@/lib/credits-helpers';
import { isCircuitBreakerOpen } from '@/lib/ark-config';
import { createClient } from '@supabase/supabase-js';
import { acquireAISlot, releaseSlot } from '@/lib/rate-limiter';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/** 检查系统开关 */
async function isFeatureOpen(key: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('system_config').select('value').eq('key', key).single();
    return data?.value === 'true';
  } catch {
    return true;
  }
}

/** 验证项目是否属于该用户，不存在则返回null */
async function resolveProject(supabase: import('@supabase/supabase-js').SupabaseClient, userId: string, projectId?: string): Promise<string | null> {
  if (!projectId) return null;
  const { data } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle() as { data: { id: string } | null };
  return data?.id || null;
}

/** 获取模型接入点ID：从前端传来的model_id查询数据库，无效则报错 */
async function resolveModelEndpoint(modelId: string | undefined, category: string): Promise<{ endpointId: string; modelName: string; isFree: boolean; platform: string }> {
  // 未传model_id，返回错误
  if (!modelId) {
    throw new Error('请选择有效的生成模型');
  }

  const supabase = createClient(
    process.env.COZE_SUPABASE_URL!,
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 先按 id (UUID) 查找
  const { data: byId } = await supabase
    .from('ai_models')
    .select('endpoint_id, name, category, is_active, is_free, platform')
    .eq('id', modelId)
    .maybeSingle();

  if (byId) {
    if (!byId.is_active) throw new Error('该模型已停用，请选择其他模型');
    if (byId.category !== category) throw new Error('该模型不适用于当前功能');
    return { endpointId: byId.endpoint_id, modelName: byId.name, isFree: byId.is_free === true, platform: byId.platform || 'coze' };
  }

  // 再按 endpoint_id 精确查找
  const { data: byEndpoint } = await supabase
    .from('ai_models')
    .select('endpoint_id, name, category, is_active, is_free, platform')
    .eq('endpoint_id', modelId)
    .maybeSingle();

  if (byEndpoint) {
    if (!byEndpoint.is_active) throw new Error('该模型已停用，请选择其他模型');
    if (byEndpoint.category !== category) throw new Error('该模型不适用于当前功能');
    return { endpointId: byEndpoint.endpoint_id, modelName: byEndpoint.name, isFree: byEndpoint.is_free === true, platform: byEndpoint.platform || 'coze' };
  }

  throw new Error('请选择有效的生成模型');
}

export async function POST(request: NextRequest) {
  try {
    // ========== 0. 系统开关检查 ==========
    const videoOpen = await isFeatureOpen('video_generation_open');
    if (!videoOpen) {
      return NextResponse.json({ error: 'AI生视频功能暂时关闭，请稍后再试' }, { status: 503 });
    }
    const maintenanceMode = await isFeatureOpen('maintenance_mode');
    if (maintenanceMode) {
      return NextResponse.json({ error: '系统维护中，请稍后再试' }, { status: 503 });
    }

    // ========== 认证校验 ==========
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // ========== 熔断检查 ==========
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
      first_frame_url,
      last_frame_url,
      images,
      mode,
      duration,
      ratio,
      resolution,
      audio,
      audio_url,
      model_id,
      project_id,
    } = body;

    if (!prompt && !image_url && !first_frame_url && (!images || images.length === 0)) {
      return NextResponse.json({ error: '请输入描述或上传图片' }, { status: 400 });
    }

    // ========== 2.5 校验模型ID ==========
    let modelEndpoint: string;
    let modelName: string;
    let isFreeModel: boolean;
    let modelPlatform: string;
    try {
      const resolved = await resolveModelEndpoint(model_id, 'video');
      modelEndpoint = resolved.endpointId;
      modelName = resolved.modelName;
      isFreeModel = resolved.isFree;
      modelPlatform = resolved.platform;
    } catch (modelError: unknown) {
      const msg = modelError instanceof Error ? modelError.message : '请选择有效的生成模型';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { supabase } = authResult;

    // 获取用户免费额度，判断免费模型是否真正免费
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('free_credits, paid_credits')
      .eq('user_id', authResult.user.id)
      .maybeSingle();
    const userFreeCredits = userProfile?.free_credits || 0;
    // 免费模型：仅当用户有免费额度时才免费，否则正常扣费
    const actuallyFree = isFreeModel && userFreeCredits > 0;

    // ========== 2.8 确定项目（未选项目则project_id为null） ==========
    const resolvedProjectId = await resolveProject(supabase, authResult.user.id, project_id);

    // ========== 3. 计算算力消耗 ==========
    const videoDuration = duration || 5;
    const creditsCost = actuallyFree ? 0 : CREDITS_PER_SECOND * videoDuration;

    // ========== 4. 预扣算力（免费跳过） ==========
    let deduction: Awaited<ReturnType<typeof deductCredits>> | null = null;
    if (creditsCost > 0) {
      deduction = await deductCredits(supabase, authResult.user.id, creditsCost);

      if (!deduction.success) {
        return NextResponse.json(
          { error: (deduction as { error: string }).error, redirect: '/recharge' },
          { status: 402 },
        );
      }
    }

    // ========== 4.5 获取并发槽位 ==========
    let slotId: string;
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('vip_level')
        .eq('user_id', authResult.user.id)
        .maybeSingle();
      slotId = await acquireAISlot({
        userId: authResult.user.id,
        model: modelEndpoint,
        isVip: (profileData?.vip_level || 0) > 0,
      });
    } catch (rateError: unknown) {
      const message = rateError instanceof Error ? rateError.message : '系统繁忙';
      if (deduction) {
        await refundCredits(supabase, authResult.user.id, deduction);
      }
      return NextResponse.json({ error: message }, { status: 429 });
    }

    // ========== 5. 创建异步任务记录 ==========
    const referenceImages: string[] = [];
    const effectiveFirstFrame = first_frame_url || image_url;
    if (images && Array.isArray(images)) {
      referenceImages.push(...images.filter((url: string) => typeof url === 'string'));
    } else if (effectiveFirstFrame) {
      referenceImages.push(effectiveFirstFrame);
    }

    // Determine mode based on input
    let effectiveMode = mode;
    if (!effectiveMode) {
      if (effectiveFirstFrame && last_frame_url) {
        effectiveMode = 'frame2video'; // 首尾帧生视频
      } else if (effectiveFirstFrame) {
        effectiveMode = 'img2video';
      } else {
        effectiveMode = 'text2video';
      }
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
        mode: effectiveMode,
        reference_images: referenceImages,
        last_frame_url: last_frame_url || null,
        audio_url: audio_url || null,
        audio_enabled: audio !== false,
        credits_cost: creditsCost,
        free_deducted: deduction?.freeDeducted ?? 0,
        paid_deducted: deduction?.paidDeducted ?? 0,
        model_endpoint: modelEndpoint,
        model_platform: modelPlatform,
        project_id: resolvedProjectId,
      })
      .select('id')
      .maybeSingle();

    if (taskError || !task) {
      // 创建任务失败，退还预扣算力
      releaseSlot(slotId);
      if (deduction) {
        await refundCredits(supabase, authResult.user.id, deduction);
      }

      console.error('[VideoAPI] 创建任务失败:', taskError);
      return NextResponse.json({ error: '创建任务失败，请重试' }, { status: 500 });
    }

    // ========== 6. 记录预扣流水（免费模型跳过） ==========
    if (deduction) {
      const creditsType = deduction.freeDeducted > 0 && deduction.paidDeducted > 0
        ? 'mixed'
        : deduction.freeDeducted > 0 ? 'free' : 'paid';

      await recordTransaction(supabase, {
        userId: authResult.user.id,
        amount: -creditsCost,
        balanceAfter: deduction.newTotalCredits,
        type: 'consumption',
        description: `AI视频预扣(${videoDuration}秒) [${modelName}] - 任务 ${task.id.slice(0, 8)}`,
        creditsType,
        relatedId: task.id,
      });
    }

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

    // ========== 7.5 释放并发槽位（任务已入队） ==========
    releaseSlot(slotId);

    // ========== 8. 立即返回任务ID ==========
    // 获取用户当前总算力
    const { data: currentProfile } = await supabase.from('profiles').select('free_credits, paid_credits').eq('user_id', authResult.user.id).maybeSingle();
    const remainingCredits = (currentProfile?.free_credits || 0) + (currentProfile?.paid_credits || 0);

    return NextResponse.json({
      task_id: task.id,
      status: 'queued',
      credits_cost: creditsCost,
      remaining_credits: remainingCredits,
      is_free: actuallyFree,
      project_id: resolvedProjectId,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('[VideoAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
