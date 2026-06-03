/**
 * 视频生成 Worker
 *
 * 消费 video_tasks 表中的排队任务：
 *   1. 读取 queued 状态的任务
 *   2. 通过 coze-coding-dev-sdk 调用视频生成模型
 *   3. SDK内部处理异步提交+轮询，最长等待15分钟
 *   4. 成功：记录结果，锁定算力消耗
 *   5. 失败/超时：全额退还算力，记录返还流水
 *
 * 支持所有SDK视频模型：doubao-seedance-1-5-pro-251215 等
 *
 * 触发方式：
 *   - 提交任务时 fire-and-forget 调用
 *   - 前端轮询 status 时发现 queued 任务自动触发
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { generateVideo } from '@/lib/coze-api';
import { refundCredits, recordTransaction } from '@/lib/credits-helpers';
import type { DeductionResult } from '@/lib/credits-helpers';

// 防止并发处理同一任务
const processingTasks = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const taskId = body.task_id as string | undefined;

    if (taskId) {
      await processTask(taskId);
    } else {
      await processNextQueuedTask();
    }

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Worker执行失败';
    console.error('[VideoWorker] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 处理下一个排队中的任务
 */
async function processNextQueuedTask(): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: tasks, error } = await supabase
    .from('video_tasks')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !tasks || tasks.length === 0) {
    return;
  }

  await processTask(tasks[0].id);
}

/**
 * 处理单个任务
 */
async function processTask(taskId: string): Promise<void> {
  if (processingTasks.has(taskId)) {
    return;
  }
  processingTasks.add(taskId);

  try {
    const supabase = getSupabaseClient();

    const { data: task, error: taskError } = await supabase
      .from('video_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    if (taskError || !task) {
      console.error('[VideoWorker] 任务不存在:', taskId);
      return;
    }

    if (task.status !== 'queued') {
      return;
    }

    console.info(`[VideoWorker] 开始处理任务 ${taskId.slice(0, 8)} (用户: ${task.user_id.slice(0, 8)}, 模型: ${task.model_endpoint || 'default'})`);

    // ========== 1. 标记为处理中 ==========
    await supabase
      .from('video_tasks')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', taskId);

    // ========== 2. 构建参考图URL ==========
    let primaryImageUrl: string | undefined;
    if (task.reference_images && Array.isArray(task.reference_images) && task.reference_images.length > 0) {
      // 使用第一张图作为主参考图
      const firstRef = task.reference_images[0] as string | { url: string };
      primaryImageUrl = typeof firstRef === 'string' ? firstRef : firstRef.url;
    }

    // ========== 3. 通过SDK调用视频生成 ==========
    try {
      const result = await generateVideo(
        // 构造一个最小化的NextRequest用于HeaderUtils
        new NextRequest(new URL('http://localhost:5000/api/ai/video/worker')),
        {
          prompt: task.prompt || undefined,
          imageUrl: primaryImageUrl,
          duration: task.duration || 5,
          resolution: task.quality || '720p',
          ratio: task.ratio || '16:9',
          generateAudio: task.audio_enabled ?? true,
          modelEndpoint: task.model_endpoint || 'doubao-seedance-1-5-pro-251215',
        },
      );

      // ========== 4. 任务成功 ==========
      await supabase
        .from('video_tasks')
        .update({
          status: 'succeeded',
          video_url: result.videoUrl,
          last_frame_url: result.lastFrameUrl || null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      // 记录方舟调用成功日志
      await logArkUsage(supabase, {
        videoTaskId: taskId,
        userId: task.user_id,
        action: 'succeeded',
        modelEndpoint: task.model_endpoint,
        responseData: { videoUrl: result.videoUrl },
      });

      // 保存到用户作品（关联项目的project_id）
      await supabase.from('user_works').insert({
        user_id: task.user_id,
        work_type: 'video',
        file_url: result.videoUrl,
        prompt: task.prompt || '',
        credits_cost: task.credits_cost,
        project_id: task.project_id || null,
      });

      console.info(`[VideoWorker] 任务成功 ${taskId.slice(0, 8)}: 视频=${result.videoUrl.slice(0, 60)}...`);

    } catch (genError: unknown) {
      const errMsg = genError instanceof Error ? genError.message : '视频生成失败';
      const isTimeout = errMsg.includes('超时') || errMsg.includes('timeout') || errMsg.includes('Timeout');

      // 记录方舟失败日志
      await logArkUsage(supabase, {
        videoTaskId: taskId,
        userId: task.user_id,
        action: isTimeout ? 'timeout' : 'failed',
        modelEndpoint: task.model_endpoint,
        errorMessage: errMsg,
      });

      // 更新任务状态
      await supabase
        .from('video_tasks')
        .update({
          status: isTimeout ? 'timeout' : 'failed',
          error_message: errMsg,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      // 退还算力
      await handleTaskFailure(supabase, taskId, task, errMsg);
    }

  } finally {
    processingTasks.delete(taskId);
  }
}

/**
 * 处理任务失败：全额退还算力
 */
async function handleTaskFailure(
  supabase: ReturnType<typeof getSupabaseClient>,
  taskId: string,
  task: {
    user_id: string;
    credits_cost: number;
    free_deducted: number;
    paid_deducted: number;
  },
  errorMessage: string,
): Promise<void> {
  console.warn(`[VideoWorker] 任务失败 ${taskId.slice(0, 8)}: ${errorMessage}，退还算力`);

  const deduction: DeductionResult = {
    success: true,
    totalDeducted: task.credits_cost,
    freeDeducted: task.free_deducted || 0,
    paidDeducted: task.paid_deducted || 0,
    newFreeCredits: 0,
    newPaidCredits: 0,
    newTotalCredits: 0,
  };

  await refundCredits(supabase, task.user_id, deduction);

  await recordTransaction(supabase, {
    userId: task.user_id,
    amount: task.credits_cost,
    balanceAfter: 0,
    type: 'refund',
    description: `AI视频失败退还: ${errorMessage.slice(0, 50)}`,
    creditsType: 'refund',
    relatedId: taskId,
  });

  await supabase
    .from('video_tasks')
    .update({
      status: 'refunded',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

/**
 * 记录方舟调用日志
 */
async function logArkUsage(
  supabase: ReturnType<typeof getSupabaseClient>,
  log: {
    videoTaskId: string;
    userId: string;
    action: string;
    modelEndpoint?: string;
    errorMessage?: string;
    responseData?: unknown;
  },
): Promise<void> {
  try {
    await supabase.from('ark_usage_logs').insert({
      video_task_id: log.videoTaskId,
      user_id: log.userId,
      api_key_index: 0,
      action: log.action,
      tokens_consumed: 0,
      error_message: log.errorMessage || null,
      request_params: { model: log.modelEndpoint },
      response_data: log.responseData || null,
    });
  } catch (err) {
    console.error('[VideoWorker] 记录日志失败:', err);
  }
}
