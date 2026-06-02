/**
 * 方舟额度监控 API
 *
 * GET /api/ai/video/quota
 *
 * 返回：
 *   - 各 API Key 的在线状态、请求计数、额度预警
 *   - 熔断器状态
 *   - 近期方舟调用统计
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getKeyPoolStatus, getCircuitBreakerStatus } from '@/lib/ark-config';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 检查是否管理员
    const { supabase } = authResult;
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', authResult.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '无权限访问' }, { status: 403 });
    }

    // 获取 Key 池状态
    const keyPool = getKeyPoolStatus();

    // 获取熔断器状态
    const circuitBreaker = getCircuitBreakerStatus();

    // 获取近24小时方舟调用统计
    const adminSupabase = getSupabaseClient();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentLogs } = await adminSupabase
      .from('ark_usage_logs')
      .select('action, tokens_consumed, api_key_index, created_at')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    // 统计
    const stats = {
      total_calls: recentLogs?.length || 0,
      succeeded: recentLogs?.filter(l => l.action === 'succeeded').length || 0,
      failed: recentLogs?.filter(l => l.action === 'failed' || l.action === 'submit_failed').length || 0,
      total_tokens: recentLogs?.reduce((sum, l) => sum + (l.tokens_consumed || 0), 0) || 0,
    };

    // 对账：用户算力消耗 vs 方舟成本
    const { data: userConsumption } = await adminSupabase
      .from('credits_transactions')
      .select('amount')
      .eq('type', 'consumption')
      .like('description', '%视频%')
      .gte('created_at', twentyFourHoursAgo);

    const { data: userRefunds } = await adminSupabase
      .from('credits_transactions')
      .select('amount')
      .eq('type', 'refund')
      .like('description', '%视频%')
      .gte('created_at', twentyFourHoursAgo);

    const billing = {
      user_credits_consumed: Math.abs(userConsumption?.reduce((s, t) => s + (t.amount || 0), 0) || 0),
      user_credits_refunded: userRefunds?.reduce((s, t) => s + (t.amount || 0), 0) || 0,
      ark_tokens_consumed: stats.total_tokens,
      ark_successful_calls: stats.succeeded,
    };

    return NextResponse.json({
      key_pool: keyPool,
      circuit_breaker: circuitBreaker,
      last_24h_stats: stats,
      billing_reconciliation: billing,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '查询失败';
    console.error('[VideoQuota] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
