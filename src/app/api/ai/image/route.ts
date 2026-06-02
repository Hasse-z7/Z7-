import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthUser } from '@/lib/auth-helpers';
import { generateImage } from '@/lib/coze-api';

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, size, image_urls, mode } = body;

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

    // Check credits
    const creditsCost = 5;
    if (profile.credits < creditsCost) {
      return NextResponse.json({ error: '算力不足，请充值', redirect: '/recharge' }, { status: 402 });
    }

    // Check daily limit for free users
    const isVip = profile.vip_level && profile.vip_level !== 'free';
    const today = new Date().toISOString().split('T')[0];
    const lastDate = profile.daily_count_reset_date?.split('T')[0];
    const dailyImageCount = lastDate === today ? (profile.daily_image_count || 0) : 0;

    if (!isVip && dailyImageCount >= 3) {
      return NextResponse.json({ error: '今日免费生成次数已用完，升级VIP可无限使用' }, { status: 403 });
    }

    // Generate image
    const imageUrls = await generateImage(prompt || '', size || '2K', image_urls);

    // Deduct credits
    const newCredits = profile.credits - creditsCost;
    const newDailyCount = dailyImageCount + 1;

    await supabase
      .from('profiles')
      .update({
        credits: newCredits,
        daily_image_count: newDailyCount,
        daily_count_reset_date: lastDate === today ? profile.daily_count_reset_date : new Date().toISOString(),
      })
      .eq('user_id', authResult.user.id);

    // Record credits transaction
    await supabase.from('credits_transactions').insert({
      user_id: authResult.user.id,
      amount: -creditsCost,
      balance_after: newCredits,
      type: 'consumption',
      description: `AI生图 - ${mode || 'text2img'}`,
    });

    // Save work
    await supabase.from('user_works').insert({
      user_id: authResult.user.id,
      work_type: 'image',
      file_url: imageUrls[0],
      prompt: prompt || '',
      credits_cost: creditsCost,
    });

    return NextResponse.json({
      image_urls: imageUrls,
      credits_cost: creditsCost,
      remaining_credits: newCredits,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成失败';
    console.error('AI image generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
