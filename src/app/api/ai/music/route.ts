import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { generateMusic } from '@/lib/coze-api';
import { rateLimitResponse } from '@/lib/ip-rate-limiter';
import { checkUserCategoryRateLimit, getCategoryRateLimitMessage } from '@/lib/rate-limiter';
import { deductCredits, refundCredits, recordTransaction, CREDITS_PER_MUSIC } from '@/lib/credits-helpers';

export async function POST(request: NextRequest) {
  // IP限流：AI音乐5次/分钟（归入反推解析类）
  const rateLimited = rateLimitResponse(request, 'analyze');
  if (rateLimited) return rateLimited;

  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 智能体侧用户分类限流：AI音乐5次/分钟
    const userCategoryCheck = checkUserCategoryRateLimit(authResult.user.id, 'prompt_analyze');
    if (!userCategoryCheck.allowed) {
      return NextResponse.json(
        { error: getCategoryRateLimitMessage('prompt_analyze') },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { prompt, style } = body;

    if (!prompt) {
      return NextResponse.json({ error: '请输入音乐描述' }, { status: 400 });
    }

    const { supabase } = authResult;
    const creditsCost = CREDITS_PER_MUSIC;

    // ========== 1. 先扣算力，再调用AI模型 ==========
    const deduction = await deductCredits(supabase, authResult.user.id, creditsCost);

    if (!deduction.success) {
      return NextResponse.json(
        { error: deduction.error, redirect: deduction.redirect },
        { status: 402 },
      );
    }

    // ========== 2. 调用AI模型生成音乐 ==========
    let musicDescription: string;
    try {
      musicDescription = await generateMusic(prompt, style);
    } catch (aiError: unknown) {
      // AI调用失败，退还已扣除的算力
      await refundCredits(supabase, authResult.user.id, deduction);

      // 记录退还流水
      await recordTransaction(supabase, {
        userId: authResult.user.id,
        amount: creditsCost,
        balanceAfter: deduction.newTotalCredits,
        type: 'refund',
        description: 'AI音乐失败退还',
        creditsType: 'refund',
      });

      const message = aiError instanceof Error ? aiError.message : '生成失败';
      console.error('AI music generation error:', message);
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
      description: `AI音乐 - ${style || '通用'}`,
      creditsType,
    });

    // ========== 4. 保存作品 ==========
    await supabase.from('user_works').insert({
      user_id: authResult.user.id,
      work_type: 'music',
      file_url: '',
      prompt: prompt,
      credits_cost: creditsCost,
      metadata: { description: musicDescription, style },
    });

    return NextResponse.json({
      description: musicDescription,
      style: style || '通用',
      credits_cost: creditsCost,
      remaining_credits: deduction.newTotalCredits,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('AI music generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
