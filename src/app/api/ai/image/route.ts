import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { generateImage } from '@/lib/coze-api';
import { deductCredits, refundCredits, recordTransaction, CREDITS_PER_IMAGE } from '@/lib/credits-helpers';

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, size, image_urls, mode, imageCount } = body;

    if (!prompt && !image_urls?.length) {
      return NextResponse.json({ error: '请输入描述或上传图片' }, { status: 400 });
    }

    const { supabase } = authResult;

    // 计算算力消耗：批量生成按实际张数扣点
    const count = imageCount || 1;
    const creditsCost = CREDITS_PER_IMAGE * count;

    // ========== 1. 先扣算力，再调用AI模型 ==========
    const deduction = await deductCredits(supabase, authResult.user.id, creditsCost);

    if (!deduction.success) {
      return NextResponse.json(
        { error: deduction.error, redirect: deduction.redirect },
        { status: 402 },
      );
    }

    // ========== 2. 调用AI模型生成图片 ==========
    let generatedUrls: string[];
    try {
      generatedUrls = await generateImage(prompt || '', size || '2K', image_urls);
    } catch (aiError: unknown) {
      // AI调用失败，退还已扣除的算力
      await refundCredits(supabase, authResult.user.id, deduction);

      // 记录退还流水
      await recordTransaction(supabase, {
        userId: authResult.user.id,
        amount: creditsCost,
        balanceAfter: deduction.newTotalCredits,
        type: 'refund',
        description: `AI生图失败退还(${count}张)`,
        creditsType: 'refund',
      });

      const message = aiError instanceof Error ? aiError.message : '生成失败';
      console.error('AI image generation error:', message);
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
      description: `AI生图(${count}张) - ${mode || 'text2img'}`,
      creditsType,
    });

    // ========== 4. 保存作品 ==========
    if (generatedUrls[0]) {
      await supabase.from('user_works').insert({
        user_id: authResult.user.id,
        work_type: 'image',
        file_url: generatedUrls[0],
        prompt: prompt || '',
        credits_cost: creditsCost,
      });
    }

    return NextResponse.json({
      image_urls: generatedUrls,
      credits_cost: creditsCost,
      remaining_credits: deduction.newTotalCredits,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('AI image generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
