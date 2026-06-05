import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/projects — 获取用户的项目列表（含作品数量统计）
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const { supabase } = authResult;

    // 获取项目列表
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', authResult.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 获取每个项目的作品数量和首个图片作品（用于默认封面）
    const { data: worksCounts, error: countError } = await supabase
      .from('user_works')
      .select('project_id, work_type, file_url, thumbnail_url')
      .eq('user_id', authResult.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const countMap: Record<string, { images: number; videos: number; firstImageUrl: string | null }> = {};
    for (const w of worksCounts || []) {
      if (!w.project_id) continue;
      if (!countMap[w.project_id]) countMap[w.project_id] = { images: 0, videos: 0, firstImageUrl: null };
      if (w.work_type === 'image') countMap[w.project_id].images++;
      if (w.work_type === 'video') countMap[w.project_id].videos++;
      // 优先使用图片作品作为封面（视频file_url是视频不是图片）
      if (!countMap[w.project_id].firstImageUrl) {
        if (w.work_type === 'image' && w.file_url) {
          countMap[w.project_id].firstImageUrl = w.file_url;
        } else if (w.work_type === 'video' && w.thumbnail_url) {
          countMap[w.project_id].firstImageUrl = w.thumbnail_url;
        }
      }
    }

    const enriched = (projects || []).map((p: { id: string; [key: string]: unknown }) => ({
      ...p,
      image_count: countMap[p.id]?.images || 0,
      video_count: countMap[p.id]?.videos || 0,
      default_cover: countMap[p.id]?.firstImageUrl || null,
    }));

    return NextResponse.json({ projects: enriched });
  } catch (err) {
    console.error('Projects fetch error:', err);
    return NextResponse.json({ error: '获取项目列表失败' }, { status: 500 });
  }
}

// POST /api/projects — 创建项目
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const { supabase } = authResult;
    const body = await request.json();
    const name = (body.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: authResult.user.id,
        name,
        is_default: body.is_default || false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '项目名称已存在' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project: data });
  } catch (err) {
    console.error('Project create error:', err);
    return NextResponse.json({ error: '创建项目失败' }, { status: 500 });
  }
}

// PUT /api/projects — 更新项目（重命名）
export async function PUT(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const { supabase } = authResult;
    const body = await request.json();
    const { id, name, cover_url } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少项目ID' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined && name.trim()) {
      updates.name = name.trim();
    }
    if (cover_url !== undefined) {
      updates.cover_url = cover_url;
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .eq('user_id', authResult.user.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '项目名称已存在' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project: data });
  } catch (err) {
    console.error('Project update error:', err);
    return NextResponse.json({ error: '更新项目失败' }, { status: 500 });
  }
}

// DELETE /api/projects?id=xxx — 删除项目（仅空项目）
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const { supabase } = authResult;
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少项目ID' }, { status: 400 });
    }

    // 检查项目是否有作品
    const { count, error: countError } = await supabase
      .from('user_works')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', id)
      .eq('user_id', authResult.user.id)
      .is('deleted_at', null);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if (count && count > 0) {
      return NextResponse.json({ error: '该项目包含作品，无法删除。请先删除或移动作品。' }, { status: 400 });
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', authResult.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Project delete error:', err);
    return NextResponse.json({ error: '删除项目失败' }, { status: 500 });
  }
}
