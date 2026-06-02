/**
 * 视频生成任务状态查询 API
 *
 * 前端轮询此接口获取任务状态：
 *   GET /api/ai/video/status?task_id=xxx
 *
 * 返回：
 *   - queued:    排队中
 *   - processing: 渲染中（已提交到方舟）
 *   - polling:   渲染中（方舟处理中）
 *   - succeeded: 生成成功，附带 video_url
 *   - failed:    生成失败，附带 error
 *   - timeout:   超时
 *   - refunded:  已退算力
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const taskId = request.nextUrl.searchParams.get('task_id');
    if (!taskId) {
      return NextResponse.json({ error: '缺少 task_id 参数' }, { status: 400 });
    }

    const { supabase } = authResult;

    // 查询任务状态
    const { data: task, error } = await supabase
      .from('video_tasks')
      .select('id, status, video_url, last_frame_url, error_message, credits_cost, created_at, completed_at')
      .eq('id', taskId)
      .eq('user_id', authResult.user.id) // 只能查自己的任务
      .maybeSingle();

    if (error || !task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    // 如果任务还在排队，尝试触发 Worker 处理（兜底机制）
    if (task.status === 'queued') {
      const baseUrl = process.env.DEPLOY_RUN_PORT
        ? `http://localhost:${process.env.DEPLOY_RUN_PORT}`
        : 'http://localhost:5000';

      fetch(`${baseUrl}/api/ai/video/worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      }).catch(() => {
        // 静默失败，下次轮询会再次触发
      });
    }

    // 映射状态为前端可读文本
    const statusMap: Record<string, string> = {
      queued: '排队中',
      processing: '渲染中',
      polling: '渲染中',
      succeeded: '生成成功',
      failed: '生成失败',
      timeout: '生成超时',
      refunded: '已退算力',
    };

    return NextResponse.json({
      task_id: task.id,
      status: task.status,
      status_text: statusMap[task.status] || task.status,
      video_url: task.video_url || null,
      last_frame_url: task.last_frame_url || null,
      error_message: task.error_message || null,
      credits_cost: task.credits_cost,
      created_at: task.created_at,
      completed_at: task.completed_at,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '查询失败';
    console.error('[VideoStatus] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
