/**
 * 算力管理工具库
 *
 * 统一处理算力的扣除、退还、检查和流水记录。
 * 核心规则：
 *   - 1元 = 10算力点
 *   - 优先消耗免费算力 (free_credits)，再消耗付费算力 (paid_credits)
 *   - 先扣除算力，再调用AI模型；AI失败则退还已扣除的算力
 *   - 所有充值/消耗/赠送都记录到 credits_transactions 表
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ==================== 算力消耗常量 ====================

export const CREDITS_PER_IMAGE = 2;   // 生图：2算力/张
export const CREDITS_PER_SECOND = 3;  // 视频：3算力/秒
export const CREDITS_PER_MUSIC = 10;  // 音乐：10算力/首
export const REGISTER_BONUS = 0;       // 注册赠送（已取消）
export const DAILY_LOGIN_BONUS = 0;    // 每日登录赠送（已取消）

// ==================== 类型定义 ====================

interface UserProfile {
  credits: number;
  free_credits: number;
  paid_credits: number;
  [key: string]: unknown;
}

/** 扣除结果，包含 free/paid 的具体扣除量，用于退还 */
export interface DeductionResult {
  success: true;
  totalDeducted: number;
  freeDeducted: number;
  paidDeducted: number;
  newFreeCredits: number;
  newPaidCredits: number;
  newTotalCredits: number;
}

export interface DeductionError {
  success: false;
  error: string;
  redirect?: string;
}

// ==================== 核心函数 ====================

/**
 * 检查并扣除算力（优先消耗免费算力）
 *
 * 流程：
 * 1. 读取用户 free_credits 和 paid_credits
 * 2. 检查总算力是否足够
 * 3. 优先从 free_credits 扣除，不足部分从 paid_credits 扣除
 * 4. 更新 profiles 表
 * 5. 返回扣除明细（用于失败时退还）
 */
export async function deductCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
): Promise<DeductionResult | DeductionError> {
  if (amount <= 0) {
    return { success: false, error: '扣除算力数量必须大于0' };
  }

  // 1. 读取用户算力
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits, free_credits, paid_credits')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    return { success: false, error: '用户资料不存在' };
  }

  const freeCredits = profile.free_credits || 0;
  const paidCredits = profile.paid_credits || 0;
  const totalCredits = freeCredits + paidCredits;

  // 2. 检查总算力是否足够
  if (totalCredits < amount) {
    return {
      success: false,
      error: '算力余额不足，请前往充值',
      redirect: '/recharge',
    };
  }

  // 3. 优先消耗免费算力，再消耗付费算力
  let freeDeducted = 0;
  let paidDeducted = 0;

  if (freeCredits >= amount) {
    // 免费算力足够，全部从免费算力扣除
    freeDeducted = amount;
  } else {
    // 免费算力不足，先扣完免费算力，剩余从付费算力扣除
    freeDeducted = freeCredits;
    paidDeducted = amount - freeCredits;
  }

  const newFreeCredits = freeCredits - freeDeducted;
  const newPaidCredits = paidCredits - paidDeducted;
  const newTotalCredits = newFreeCredits + newPaidCredits;

  // 4. 更新 profiles 表
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      credits: newTotalCredits,
      free_credits: newFreeCredits,
      paid_credits: newPaidCredits,
    })
    .eq('user_id', userId);

  if (updateError) {
    return { success: false, error: '扣除算力失败，请重试' };
  }

  return {
    success: true,
    totalDeducted: amount,
    freeDeducted,
    paidDeducted,
    newFreeCredits,
    newPaidCredits,
    newTotalCredits,
  };
}

/**
 * 退还算力（AI生成失败时调用）
 *
 * 将之前扣除的算力按 free/paid 比例退还回用户账户
 */
export async function refundCredits(
  supabase: SupabaseClient,
  userId: string,
  deduction: DeductionResult,
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits, free_credits, paid_credits')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profile) return;

  const newFreeCredits = (profile.free_credits || 0) + deduction.freeDeducted;
  const newPaidCredits = (profile.paid_credits || 0) + deduction.paidDeducted;
  const newTotalCredits = newFreeCredits + newPaidCredits;

  await supabase
    .from('profiles')
    .update({
      credits: newTotalCredits,
      free_credits: newFreeCredits,
      paid_credits: newPaidCredits,
    })
    .eq('user_id', userId);
}

/**
 * 记录算力流水
 *
 * @param creditsType - 'free' | 'paid' | 'mixed' | 'refund'
 */
export async function recordTransaction(
  supabase: SupabaseClient,
  params: {
    userId: string;
    amount: number;
    balanceAfter: number;
    type: string;
    description: string;
    creditsType?: string;
    relatedId?: string;
  },
): Promise<void> {
  await supabase.from('credits_transactions').insert({
    user_id: params.userId,
    amount: params.amount,
    balance_after: params.balanceAfter,
    type: params.type,
    description: params.description,
    credits_type: params.creditsType || 'mixed',
    related_id: params.relatedId || null,
  });
}

/**
 * 增加免费算力（注册赠送、每日登录等）
 */
export async function addFreeCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  type: string,
  description: string,
): Promise<{ newTotalCredits: number }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits, free_credits, paid_credits')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profile) {
    throw new Error('用户资料不存在');
  }

  const newFreeCredits = (profile.free_credits || 0) + amount;
  const newTotalCredits = newFreeCredits + (profile.paid_credits || 0);

  await supabase
    .from('profiles')
    .update({
      credits: newTotalCredits,
      free_credits: newFreeCredits,
    })
    .eq('user_id', userId);

  await recordTransaction(supabase, {
    userId,
    amount,
    balanceAfter: newTotalCredits,
    type,
    description,
    creditsType: 'free',
  });

  return { newTotalCredits };
}

/**
 * 增加付费算力（充值到账）
 */
export async function addPaidCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  type: string,
  description: string,
  relatedId?: string,
): Promise<{ newTotalCredits: number }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits, free_credits, paid_credits')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profile) {
    throw new Error('用户资料不存在');
  }

  const newPaidCredits = (profile.paid_credits || 0) + amount;
  const newTotalCredits = (profile.free_credits || 0) + newPaidCredits;

  await supabase
    .from('profiles')
    .update({
      credits: newTotalCredits,
      paid_credits: newPaidCredits,
    })
    .eq('user_id', userId);

  await recordTransaction(supabase, {
    userId,
    amount,
    balanceAfter: newTotalCredits,
    type,
    description,
    creditsType: 'paid',
    relatedId,
  });

  return { newTotalCredits };
}
