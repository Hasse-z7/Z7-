import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { generateImage } from '@/lib/coze-api';
import { deductCredits, refundCredits, recordTransaction, CREDITS_PER_IMAGE } from '@/lib/credits-helpers';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/** 自动创建或获取项目：无project_id时按日期命名自动创建 */
async function ensureProject(supabase: ReturnType<typeof getSupabaseClient> extends Promise<infer T> ? T : ReturnType<typeof getSupabaseClient>, userId: string, projectId?: string) {
  if (projectId) {
    // 验证项目存在且属于该用户
    const { data } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
    if (data) return projectId;
  }
  // 自动创建：按日期命名
  const now = new Date();
  const dateName = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}项目`;
  // 检查同名项目是否已存在
  const { data: existing } = await supabase.from('projects').select('id').eq('user_id', userId).eq('name', dateName).maybeSingle();
  if (existing) return existing.id;
  // 创建新项目
  const { data: created, error } = await supabase.from('projects').insert({ user_id: userId, name: dateName }).select('id').maybeSingle();
  if (error || !created) return null;
  return created.id;
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, size, image_urls, mode, imageCount, model_endpoint, project_id } = body;

    if (!prompt && !image_urls?.length) {
      return NextResponse.json({ error: '请输入描述或上传图片' }, { status: 400 });
    }

    // 校验模型Endpoint ID
    if (!model_endpoint) {
      return NextResponse.json({ error: '请选择有效的生成模型' }, { status: 400 });
    }

    // 验证模型是否存在于数据库且为image类型
    const adminClient = getSupabaseClient();
    const { data: modelData, error: modelError } = await adminClient
      .from('ai_models')
      .select('endpoint_id, name')
      .eq('endpoint_id', model_endpoint)
      .eq('category', 'image')
      .eq('is_active', true)
      .maybeSingle();

    if (modelError || !modelData) {
      return NextResponse.json({ error: '请选择有效的生成模型' }, { status: 400 });
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
      generatedUrls = await generateImage(prompt || '', size || '2K', image_urls, model_endpoint);
    } catch (aiError: unknown) {
      // AI调用失败，退还已扣除的算力
      await refundCredits(supabase, authResult.user.id, deduction);

      // 记录退还流水
      await recordTransaction(supabase, {
        userId: authResult.user.id,
        amount: creditsCost,
        balanceAfter: deduction.newTotalCredits,
        type: 'refund',
        description: `AI生图失败退还(${count}张) - 模型:${model_endpoint}`,
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
      description: `AI生图(${count}张) - ${mode || 'text2img'} - 模型:${model_endpoint}`,
      creditsType,
    });

    // ========== 4. 确定项目 ==========
    const resolvedProjectId = await ensureProject(supabase, authResult.user.id, project_id);

    // ========== 5. 保存作品 ==========
    if (generatedUrls[0]) {
      await supabase.from('user_works').insert({
        user_id: authResult.user.id,
        work_type: 'image',
        file_url: generatedUrls[0],
        prompt: prompt || '',
        credits_cost: creditsCost,
        project_id: resolvedProjectId,
      });
    }

    return NextResponse.json({
      image_urls: generatedUrls,
      credits_cost: creditsCost,
      remaining_credits: deduction.newTotalCredits,
      project_id: resolvedProjectId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('AI image generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
