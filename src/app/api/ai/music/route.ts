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
    const { prompt, style } = body;

    if (!prompt) {
      return NextResponse.json({ error: '请输入提示词' }, { status: 400 });
    }

    // Check credits (music costs 10)
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, vip_level, daily_music_count')
      .eq('user_id', user.id)
      .maybeSingle();

    const cost = 10;
    if (!profile || profile.credits < cost) {
      return NextResponse.json({ error: '算力不足，请充值', needRecharge: true }, { status: 402 });
    }

    if (profile.vip_level === 'free' && profile.daily_music_count >= 3) {
      return NextResponse.json({ error: '免费用户每日限3次音乐生成，升级VIP解锁更多', needVip: true }, { status: 403 });
    }

    const result = await CozeAPI.generateMusic({ prompt, style });

    // Deduct credits
    const newCredits = profile.credits - cost;
    await supabase.from('profiles').update({
      credits: newCredits,
      daily_music_count: profile.daily_music_count + 1,
    }).eq('user_id', user.id);

    await supabase.from('credits_transactions').insert({
      user_id: user.id,
      amount: -cost,
      balance_after: newCredits,
      type: 'consumption',
      description: `AI音乐生成消耗${cost}算力`,
    });

    if (result.audio_url) {
      await supabase.from('user_works').insert({
        user_id: user.id,
        title: prompt.slice(0, 50),
        work_type: 'audio',
        file_url: result.audio_url,
        thumbnail_url: '',
        prompt,
        credits_cost: cost,
        metadata: { style, lyrics: result.lyrics },
      });
    }

    return NextResponse.json({ ...result, remaining_credits: newCredits });
  } catch (err) {
    const message = err instanceof Error ? err.message : '音乐生成失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
