import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/works — 获取作品列表（支持 type, project_id, trash 参数）
export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workType = searchParams.get('type');
    const projectId = searchParams.get('project_id');
    const trash = searchParams.get('trash') === 'true';

    let query = supabase
      .from('user_works')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (workType) {
      query = query.eq('work_type', workType);
    }

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (trash) {
      // 回收站：已软删除的
      query = query.not('deleted_at', 'is', null);
    } else {
      // 正常列表：未删除的
      query = query.is('deleted_at', null);
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

// POST /api/works — 创建作品
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { title, work_type, file_url, thumbnail_url, prompt, metadata, project_id } = await request.json();

    const { data, error } = await supabase.from('user_works').insert({
      user_id: user.id,
      title,
      work_type,
      file_url,
      thumbnail_url,
      prompt,
      metadata,
      project_id: project_id || null,
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

// PUT /api/works — 软删除/恢复/永久删除作品
export async function PUT(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { action, ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '缺少作品ID' }, { status: 400 });
    }

    if (action === 'soft_delete') {
      // 软删除：移入回收站
      const { error } = await supabase
        .from('user_works')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
        .eq('user_id', user.id)
        .is('deleted_at', null);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, action: 'soft_delete' });
    }

    if (action === 'restore') {
      // 恢复：从回收站还原
      const { error } = await supabase
        .from('user_works')
        .update({ deleted_at: null })
        .in('id', ids)
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, action: 'restore' });
    }

    if (action === 'permanent_delete') {
      // 永久删除
      const { error } = await supabase
        .from('user_works')
        .delete()
        .in('id', ids)
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, action: 'permanent_delete' });
    }

    if (action === 'save_to_project') {
      // 将作品保存到项目（创建项目+关联作品）
      const { project_name } = body;
      if (!project_name) {
        return NextResponse.json({ error: '缺少项目名称' }, { status: 400 });
      }

      // 创建项目
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({ user_id: user.id, name: project_name })
        .select('id')
        .maybeSingle();

      if (projectError || !project) {
        return NextResponse.json({ error: '创建项目失败' }, { status: 500 });
      }

      // 更新作品的 project_id
      const { error: updateError } = await supabase
        .from('user_works')
        .update({ project_id: project.id })
        .in('id', ids)
        .eq('user_id', user.id)
        .is('project_id', null);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // 同时更新关联的视频任务
      await supabase
        .from('video_tasks')
        .update({ project_id: project.id })
        .in('id', ids)
        .eq('user_id', user.id)
        .is('project_id', null);

      return NextResponse.json({ success: true, action: 'save_to_project', project_id: project.id });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/works?id=xxx — 软删除单个作品（兼容旧调用）
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

    // 软删除：移入回收站
    const { error } = await supabase
      .from('user_works')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', workId)
      .eq('user_id', user.id)
      .is('deleted_at', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除作品失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
