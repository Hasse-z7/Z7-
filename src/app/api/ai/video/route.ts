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
    const { prompt, image_url, duration, resolution, ratio } = body;

    if (!prompt) {
      return NextResponse.json({ error: '请输入提示词' }, { status: 400 });
    }

    // Check credits (video costs 20)
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, vip_level, daily_video_count')
      .eq('user_id', user.id)
      .maybeSingle();

    const cost = 20;
    if (!profile || profile.credits < cost) {
      return NextResponse.json({ error: '算力不足，请充值', needRecharge: true }, { status: 402 });
    }

    if (profile.vip_level === 'free' && profile.daily_video_count >= 2) {
      return NextResponse.json({ error: '免费用户每日限2次视频生成，升级VIP解锁更多', needVip: true }, { status: 403 });
    }

    const result = await CozeAPI.generateVideo({
      prompt,
      imageUrl: image_url,
      duration,
      resolution,
      ratio,
    });

    // Deduct credits
    const newCredits = profile.credits - cost;
    await supabase.from('profiles').update({
      credits: newCredits,
      daily_video_count: profile.daily_video_count + 1,
    }).eq('user_id', user.id);

    await supabase.from('credits_transactions').insert({
      user_id: user.id,
      amount: -cost,
      balance_after: newCredits,
      type: 'consumption',
      description: `AI视频生成消耗${cost}算力`,
    });

    if (result.video_url) {
      await supabase.from('user_works').insert({
        user_id: user.id,
        title: prompt.slice(0, 50),
        work_type: 'video',
        file_url: result.video_url,
        thumbnail_url: '',
        prompt,
        credits_cost: cost,
      });
    }

    return NextResponse.json({ ...result, remaining_credits: newCredits });
  } catch (err) {
    const message = err instanceof Error ? err.message : '视频生成失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
