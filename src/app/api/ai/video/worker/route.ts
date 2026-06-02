/**
 * 视频生成 Worker
 *
 * 消费 video_tasks 表中的排队任务：
 *   1. 读取 queued 状态的任务
 *   2. 调用方舟 API 提交视频生成
 *   3. 轮询方舟任务直到完成/失败/超时
 *   4. 成功：记录结果，锁定算力消耗
 *   5. 失败/超时：全额退还算力，记录返还流水
 *
 * 触发方式：
 *   - 提交任务时 fire-and-forget 调用
 *   - 前端轮询 status 时发现 queued 任务自动触发
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { submitVideoTask, pollArkTask } from '@/lib/ark-client';
import { refundCredits, recordTransaction } from '@/lib/credits-helpers';
import type { DeductionResult } from '@/lib/credits-helpers';

// 防止并发处理同一任务
const processingTasks = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const taskId = body.task_id as string | undefined;

    if (taskId) {
      // 处理指定任务
      await processTask(taskId);
    } else {
      // 处理下一个排队任务
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

  // 查找最早的 queued 任务
  const { data: tasks, error } = await supabase
    .from('video_tasks')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !tasks || tasks.length === 0) {
    return; // 没有排队任务
  }

  await processTask(tasks[0].id);
}

/**
 * 处理单个任务
 */
async function processTask(taskId: string): Promise<void> {
  // 防止并发
  if (processingTasks.has(taskId)) {
    return;
  }
  processingTasks.add(taskId);

  try {
    const supabase = getSupabaseClient();

    // 读取任务详情
    const { data: task, error: taskError } = await supabase
      .from('video_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    if (taskError || !task) {
      console.error('[VideoWorker] 任务不存在:', taskId);
      return;
    }

    // 跳过非排队状态的任务
    if (task.status !== 'queued' && task.status !== 'processing') {
      return;
    }

    console.info(`[VideoWorker] 开始处理任务 ${taskId.slice(0, 8)} (用户: ${task.user_id.slice(0, 8)})`);

    // ========== 1. 标记为处理中 ==========
    await supabase
      .from('video_tasks')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', taskId);

    // ========== 2. 提交到方舟 API ==========
    let arkTaskId: string;
    let apiKeyIndex: number;

    try {
      const result = await submitVideoTask({
        prompt: task.prompt,
        negativePrompt: task.negative_prompt || undefined,
        ratio: task.ratio || '16:9',
        duration: task.duration || 5,
        fps: task.fps || 24,
        referenceImages: task.reference_images || [],
        audioUrl: task.audio_url || undefined,
        audioEnabled: task.audio_enabled,
      });

      arkTaskId = result.taskId;
      apiKeyIndex = result.apiKeyIndex;

      // 记录方舟调用日志
      await logArkUsage(supabase, {
        videoTaskId: taskId,
        userId: task.user_id,
        apiKeyIndex,
        arkTaskId,
        action: 'submit',
        requestParams: {
          prompt: task.prompt,
          ratio: task.ratio,
          duration: task.duration,
        },
      });

      // 更新任务：标记为轮询中，记录方舟任务ID
      await supabase
        .from('video_tasks')
        .update({
          status: 'polling',
          ark_task_id: arkTaskId,
          api_key_index: apiKeyIndex,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

    } catch (submitError: unknown) {
      const errMsg = submitError instanceof Error ? submitError.message : '提交方舟任务失败';

      // 记录方舟调用失败日志
      await logArkUsage(supabase, {
        videoTaskId: taskId,
        userId: task.user_id,
        apiKeyIndex: 0,
        action: 'submit_failed',
        errorMessage: errMsg,
      });

      // 任务提交失败 → 退还算力
      await handleTaskFailure(supabase, taskId, task, errMsg);
      return;
    }

    // ========== 3. 轮询方舟任务结果 ==========
    try {
      const arkResult = await pollArkTask(arkTaskId, apiKeyIndex, async (status) => {
        // 状态变更时更新数据库
        const mappedStatus = status === 'running' ? 'polling' : 'polling';
        await supabase
          .from('video_tasks')
          .update({
            status: mappedStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', taskId);
      });

      // ========== 4. 任务成功：提取结果 ==========
      let videoUrl = '';
      let lastFrameUrl = '';

      if (arkResult.output?.content) {
        for (const item of arkResult.output.content) {
          if (item.type === 'video_url' && item.video_url?.url) {
            videoUrl = item.video_url.url;
          }
          if (item.type === 'image_url' && item.image_url?.url) {
            lastFrameUrl = item.image_url.url;
          }
        }
      }

      if (!videoUrl) {
        throw new Error('方舟返回成功但无视频URL');
      }

      // 更新任务为成功
      await supabase
        .from('video_tasks')
        .update({
          status: 'succeeded',
          video_url: videoUrl,
          last_frame_url: lastFrameUrl || null,
          ark_tokens_consumed: arkResult.usage?.total_tokens || 0,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      // 记录方舟成功日志
      await logArkUsage(supabase, {
        videoTaskId: taskId,
        userId: task.user_id,
        apiKeyIndex,
        arkTaskId,
        action: 'succeeded',
        tokensConsumed: arkResult.usage?.total_tokens || 0,
        responseData: arkResult.output,
      });

      // 保存到用户作品
      await supabase.from('user_works').insert({
        user_id: task.user_id,
        work_type: 'video',
        file_url: videoUrl,
        prompt: task.prompt || '',
        credits_cost: task.credits_cost,
      });

      console.info(`[VideoWorker] 任务成功 ${taskId.slice(0, 8)}: 视频=${videoUrl.slice(0, 60)}...`);

    } catch (pollError: unknown) {
      const errMsg = pollError instanceof Error ? pollError.message : '视频生成失败';

      // 判断是否超时
      const isTimeout = errMsg.includes('超时');

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

      // 记录方舟失败日志
      await logArkUsage(supabase, {
        videoTaskId: taskId,
        userId: task.user_id,
        apiKeyIndex,
        arkTaskId,
        action: 'failed',
        errorMessage: errMsg,
      });

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

  // 退还预扣算力
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

  // 记录返还流水
  await recordTransaction(supabase, {
    userId: task.user_id,
    amount: task.credits_cost,
    balanceAfter: 0, // refundCredits内部已更新，这里记录0占位
    type: 'refund',
    description: `AI视频失败退还: ${errorMessage.slice(0, 50)}`,
    creditsType: 'refund',
    relatedId: taskId,
  });

  // 更新任务状态
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
    apiKeyIndex: number;
    action: string;
    arkTaskId?: string;
    tokensConsumed?: number;
    httpStatus?: number;
    errorMessage?: string;
    requestParams?: Record<string, unknown>;
    responseData?: unknown;
  },
): Promise<void> {
  try {
    await supabase.from('ark_usage_logs').insert({
      video_task_id: log.videoTaskId,
      user_id: log.userId,
      api_key_index: log.apiKeyIndex,
      ark_task_id: log.arkTaskId || null,
      action: log.action,
      tokens_consumed: log.tokensConsumed || 0,
      http_status: log.httpStatus || null,
      error_message: log.errorMessage || null,
      request_params: log.requestParams || null,
      response_data: log.responseData || null,
    });
  } catch (err) {
    console.error('[VideoWorker] 记录方舟日志失败:', err);
  }
}
