import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { generateImage } from '@/lib/coze-api';
import { generateImageViaDmxapi, generateImageViaMj, isDmxapiModel } from '@/lib/dmxapi-client';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { deductCredits, refundCredits, recordTransaction, DEFAULT_CREDITS_PER_IMAGE } from '@/lib/credits-helpers';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { acquireAISlot, releaseSlot, checkUserCategoryRateLimit, getCategoryRateLimitMessage } from '@/lib/rate-limiter';
import { rateLimitResponse } from '@/lib/ip-rate-limiter';

/** 检查系统开关 */
async function isFeatureOpen(key: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('system_config').select('value').eq('key', key).single();
    const v = data?.value;
    return v === true || v === 'true';
  } catch {
    return true; // 查询失败默认开放
  }
}

/** 验证项目是否属于该用户，不存在则返回null */
async function resolveProject(supabase: ReturnType<typeof getSupabaseClient> extends Promise<infer T> ? T : ReturnType<typeof getSupabaseClient>, userId: string, projectId?: string) {
  if (!projectId) return null;
  const { data } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  return data?.id || null;
}

export async function POST(request: NextRequest) {
  // IP限流：图片生成10次/分钟
  const rateLimited = rateLimitResponse(request, 'image');
  if (rateLimited) return rateLimited;

  try {
    // 检查系统开关
    const imageOpen = await isFeatureOpen('image_generation_open');
    if (!imageOpen) {
      return NextResponse.json({ error: 'AI生图功能暂时关闭，请稍后再试' }, { status: 503 });
    }
    const maintenanceMode = await isFeatureOpen('maintenance_mode');
    if (maintenanceMode) {
      return NextResponse.json({ error: '系统维护中，请稍后再试' }, { status: 503 });
    }

    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 智能体侧用户分类限流：出图≤10次/分钟
    const userCategoryCheck = checkUserCategoryRateLimit(authResult.user.id, 'image');
    if (!userCategoryCheck.allowed) {
      return NextResponse.json(
        { error: getCategoryRateLimitMessage('image') },
        { status: 429 }
      );
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
      .select('endpoint_id, name, platform, is_free, credits_cost')
      .eq('endpoint_id', model_endpoint)
      .eq('category', 'image')
      .eq('is_active', true)
      .maybeSingle();

    if (modelError || !modelData) {
      return NextResponse.json({ error: '请选择有效的生成模型' }, { status: 400 });
    }

    const modelPlatform = modelData.platform || 'coze';
    const isFreeModel = modelData.is_free === true;
    const creditsPerImage = modelData.credits_cost || DEFAULT_CREDITS_PER_IMAGE; // 模型独立定价

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

    // 计算算力消耗（使用模型独立定价）
    const count = imageCount || 1;
    const creditsCost = actuallyFree ? 0 : creditsPerImage * count;

    // ========== 1. 扣算力（免费跳过） ==========
    let deduction: Awaited<ReturnType<typeof deductCredits>> | null = null;
    if (creditsCost > 0) {
      deduction = await deductCredits(supabase, authResult.user.id, creditsCost);

      if (!deduction.success) {
        return NextResponse.json(
          { error: deduction.error, redirect: deduction.redirect },
          { status: 402 },
        );
      }
    }

    // ========== 2. 获取并发槽位 ==========
    let slotId: string;
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('vip_level')
        .eq('user_id', authResult.user.id)
        .maybeSingle();
      slotId = await acquireAISlot({
        userId: authResult.user.id,
        model: model_endpoint,
        isVip: (profileData?.vip_level || 0) > 0,
      });
    } catch (rateError: unknown) {
      const message = rateError instanceof Error ? rateError.message : '系统繁忙';
      // 退还已扣除的算力
      if (deduction) {
        await refundCredits(supabase, authResult.user.id, deduction);
      }
      return NextResponse.json({ error: message }, { status: 429 });
    }

    // ========== 3. 调用AI模型生成图片 ==========
    let generatedUrls: string[];
    try {
      if (model_endpoint.startsWith('mj_')) {
        // Midjourney models via dmxapi.cn MJ API
        const mjMode = model_endpoint.includes('turbo') ? 'turbo' : model_endpoint.includes('relax') ? 'relax' : 'fast';
        const result = await generateImageViaMj({
          prompt: prompt || '',
          mode: mjMode,
        });
        generatedUrls = [result.imageUrl];
      } else if (isDmxapiModel(modelPlatform)) {
        // Use dmxapi.cn for OpenAI-compatible models
        const result = await generateImageViaDmxapi({
          prompt: prompt || '',
          model: model_endpoint,
          size: size || '1024x1024',
          n: count,
        });
        generatedUrls = result.urls;
      } else {
        // Use Coze SDK for platform models
        generatedUrls = await generateImage(prompt || '', size || '2K', image_urls, model_endpoint, HeaderUtils.extractForwardHeaders(request.headers) as Record<string, string>);
      }
    } catch (aiError: unknown) {
      // AI调用失败，退还已扣除的算力
      releaseSlot(slotId);
      if (deduction) {
        await refundCredits(supabase, authResult.user.id, deduction);
        await recordTransaction(supabase, {
          userId: authResult.user.id,
          amount: creditsCost,
          balanceAfter: deduction.newTotalCredits,
          type: 'refund',
          description: `AI生图失败退还(${count}张) - 模型:${model_endpoint}`,
          creditsType: 'refund',
        });
      }

      const message = aiError instanceof Error ? aiError.message : '生成失败';
      console.error('AI image generation error:', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // ========== 3. 记录消耗流水（免费模型记录0消耗） ==========
    if (deduction) {
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
    }

    // ========== 4. 释放并发槽位 ==========
    releaseSlot(slotId);

    // ========== 5. 确定项目（未选项目则project_id为null） ==========
    const resolvedProjectId = await resolveProject(supabase, authResult.user.id, project_id);

    // ========== 5. 保存作品 ==========
    let workId: string | null = null;
    if (generatedUrls[0]) {
      const { data: insertedWork } = await supabase.from('user_works').insert({
        user_id: authResult.user.id,
        work_type: 'image',
        file_url: generatedUrls[0],
        prompt: prompt || '',
        credits_cost: creditsCost,
        project_id: resolvedProjectId,
      }).select('id').maybeSingle();
      workId = insertedWork?.id || null;

      // 自动更新项目封面：用第一张生成的图片作为项目封面
      if (resolvedProjectId && generatedUrls[0]) {
        const { data: existingProject } = await supabase
          .from('projects')
          .select('cover_url')
          .eq('id', resolvedProjectId)
          .maybeSingle();
        if (!existingProject?.cover_url) {
          await supabase
            .from('projects')
            .update({ cover_url: generatedUrls[0] })
            .eq('id', resolvedProjectId);
        }
      }
    }

    // 获取用户当前总算力
    const { data: currentProfile } = await supabase.from('profiles').select('free_credits, paid_credits').eq('user_id', authResult.user.id).maybeSingle();
    const remainingCredits = (currentProfile?.free_credits || 0) + (currentProfile?.paid_credits || 0);

    return NextResponse.json({
      image_urls: generatedUrls,
      credits_cost: creditsCost,
      remaining_credits: remainingCredits,
      is_free: actuallyFree,
      project_id: resolvedProjectId,
      work_id: workId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('AI image generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
