import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthUser } from '@/lib/auth-helpers';
import { generateImage } from '@/lib/coze-api';

// 算力消耗规则：单张图消耗2算力点，批量按实际张数扣点
const CREDITS_PER_IMAGE = 2;

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

    const supabase = getSupabaseClient();

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', authResult.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: '用户资料不存在' }, { status: 404 });
    }

    // 计算算力消耗：批量生成按实际张数扣点
    const count = imageCount || 1;
    const creditsCost = CREDITS_PER_IMAGE * count;

    if (profile.credits < creditsCost) {
      return NextResponse.json(
        { error: '算力余额不足，请前往充值页面充值', redirect: '/recharge' },
        { status: 402 }
      );
    }

    // Generate image
    const generatedUrls = await generateImage(prompt || '', size || '2K', image_urls);

    // Deduct credits
    const newCredits = profile.credits - creditsCost;

    await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('user_id', authResult.user.id);

    // Record credits transaction
    await supabase.from('credits_transactions').insert({
      user_id: authResult.user.id,
      amount: -creditsCost,
      balance_after: newCredits,
      type: 'consumption',
      description: `AI生图(${count}张) - ${mode || 'text2img'}`,
    });

    // Save work
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
      remaining_credits: newCredits,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('AI image generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
