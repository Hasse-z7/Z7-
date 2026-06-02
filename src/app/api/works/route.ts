import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workType = searchParams.get('type');

    let query = supabase
      .from('user_works')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (workType) {
      query = query.eq('work_type', workType);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ works: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取作品列表失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { title, work_type, file_url, thumbnail_url, prompt, metadata } = await request.json();

    const { data, error } = await supabase.from('user_works').insert({
      user_id: user.id,
      title,
      work_type,
      file_url,
      thumbnail_url,
      prompt,
      metadata,
    }).select().maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ work: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存作品失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workId = searchParams.get('id');

    if (!workId) {
      return NextResponse.json({ error: '缺少作品ID' }, { status: 400 });
    }

    const { error } = await supabase
      .from('user_works')
      .delete()
      .eq('id', workId)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除作品失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
