/**
 * AI模型管理 API
 *
 * GET    /api/models?category=image|video  — 获取模型列表
 * POST   /api/models                       — 新增模型（管理员）
 * PUT    /api/models?id=xxx                — 修改模型（管理员）
 * DELETE /api/models?id=xxx                — 删除模型（管理员）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.COZE_SUPABASE_URL!,
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** GET — 获取模型列表（公开，按category过滤） */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category'); // image | video

    const supabase = getAdminClient();
    let query = supabase
      .from('ai_models')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ModelsAPI] 查询失败:', error);
      return NextResponse.json({ error: '获取模型列表失败' }, { status: 500 });
    }

    return NextResponse.json({ models: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取模型列表失败';
    console.error('[ModelsAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — 新增模型（管理员） */
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 检查管理员权限
    const { supabase: authSupabase } = authResult;
    const { data: profile } = await authSupabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', authResult.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '无管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { name, endpoint_id, category, description, sort_order } = body;

    if (!name || !endpoint_id || !category) {
      return NextResponse.json({ error: '模型名称、接入点ID、类型为必填项' }, { status: 400 });
    }

    if (!['image', 'video'].includes(category)) {
      return NextResponse.json({ error: '类型必须是 image 或 video' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('ai_models')
      .insert({
        name,
        endpoint_id,
        category,
        description: description || '',
        sort_order: sort_order || 0,
        is_active: true,
      })
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '模型接入点ID已存在' }, { status: 409 });
      }
      console.error('[ModelsAPI] 新增失败:', error);
      return NextResponse.json({ error: '新增模型失败' }, { status: 500 });
    }

    return NextResponse.json({ model: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '新增模型失败';
    console.error('[ModelsAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT — 修改模型（管理员） */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { supabase: authSupabase } = authResult;
    const { data: profile } = await authSupabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', authResult.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '无管理员权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '缺少模型ID' }, { status: 400 });
    }

    const body = await request.json();
    const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) updateFields.name = body.name;
    if (body.endpoint_id !== undefined) updateFields.endpoint_id = body.endpoint_id;
    if (body.category !== undefined) updateFields.category = body.category;
    if (body.description !== undefined) updateFields.description = body.description;
    if (body.sort_order !== undefined) updateFields.sort_order = body.sort_order;
    if (body.is_active !== undefined) updateFields.is_active = body.is_active;

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('ai_models')
      .update(updateFields)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[ModelsAPI] 修改失败:', error);
      return NextResponse.json({ error: '修改模型失败' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '模型不存在' }, { status: 404 });
    }

    return NextResponse.json({ model: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '修改模型失败';
    console.error('[ModelsAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE — 删除模型（管理员） */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { supabase: authSupabase } = authResult;
    const { data: profile } = await authSupabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', authResult.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '无管理员权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '缺少模型ID' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { error } = await supabase
      .from('ai_models')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[ModelsAPI] 删除失败:', error);
      return NextResponse.json({ error: '删除模型失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除模型失败';
    console.error('[ModelsAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
