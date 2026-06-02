import { NextRequest, NextResponse } from 'next/server';
import { CozeAPI } from '@/lib/coze-api';
import { getAuthUser } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, size, template_id } = body;

    if (!prompt) {
      return NextResponse.json({ error: '请输入提示词' }, { status: 400 });
    }

    // Check credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, vip_level, daily_image_count')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile || profile.credits < 5) {
      return NextResponse.json({ error: '算力不足，请充值', needRecharge: true }, { status: 402 });
    }

    // Check daily limit for free users
    if (profile.vip_level === 'free' && profile.daily_image_count >= 3) {
      return NextResponse.json({ error: '免费用户每日限3次生图，升级VIP解锁更多', needVip: true }, { status: 403 });
    }

    // Generate image via Coze API
    const result = await CozeAPI.generateImage({ prompt, size });

    // Deduct credits and update daily count
    const newCredits = profile.credits - 5;
    await supabase.from('profiles').update({
      credits: newCredits,
      daily_image_count: profile.daily_image_count + 1,
    }).eq('user_id', user.id);

    // Record transaction
    await supabase.from('credits_transactions').insert({
      user_id: user.id,
      amount: -5,
      balance_after: newCredits,
      type: 'consumption',
      description: 'AI生图消耗5算力',
    });

    // Save work
    if (result.image_urls?.[0]) {
      await supabase.from('user_works').insert({
        user_id: user.id,
        title: prompt.slice(0, 50),
        work_type: 'image',
        file_url: result.image_urls[0],
        thumbnail_url: result.image_urls[0],
        prompt,
        credits_cost: 5,
      });
    }

    return NextResponse.json({ ...result, remaining_credits: newCredits });
  } catch (err) {
    const message = err instanceof Error ? err.message : '生图失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
