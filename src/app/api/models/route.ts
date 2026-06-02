/**
 * AI模型管理 API
 *
 * GET  - 获取模型列表（前端下拉框用，只返回is_active的）
 * POST - 新增模型（管理员）
 * PUT  - 更新模型（管理员）
 * DELETE - 删除模型（管理员）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// ==================== GET: 获取模型列表 ====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category'); // 'image' | 'video'
    const admin = searchParams.get('admin'); // 管理员查看全部

    // 非管理员只看活跃模型
    let query = getSupabaseClient()
      .from('ai_models')
      .select('*');

    if (category) {
      query = query.eq('category', category);
    }

    if (admin !== 'true') {
      query = query.eq('is_active', true);
    }

    query = query.order('sort_order', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('[ModelsAPI] 查询失败:', error);
      return NextResponse.json({ error: '查询模型列表失败' }, { status: 500 });
    }

    return NextResponse.json({ models: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '查询失败';
    console.error('[ModelsAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ==================== POST: 新增模型 ====================

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 检查管理员权限
    const { data: profile } = await authResult.supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', authResult.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { name, endpoint_id, category, description, sort_order } = body;

    if (!name || !endpoint_id || !category) {
      return NextResponse.json({ error: '模型名称、接入点ID和分类为必填项' }, { status: 400 });
    }

    if (!['image', 'video'].includes(category)) {
      return NextResponse.json({ error: '分类只能是 image 或 video' }, { status: 400 });
    }

    // 验证endpoint_id格式 (ark-开头)
    if (!endpoint_id.startsWith('ark-')) {
      return NextResponse.json({ error: '接入点ID格式不正确，应以 ark- 开头' }, { status: 400 });
    }

    const { data, error } = await getSupabaseClient()
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
        return NextResponse.json({ error: '该接入点ID已存在' }, { status: 409 });
      }
      console.error('[ModelsAPI] 新增失败:', error);
      return NextResponse.json({ error: '新增模型失败' }, { status: 500 });
    }

    return NextResponse.json({ model: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '操作失败';
    console.error('[ModelsAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ==================== PUT: 更新模型 ====================

export async function PUT(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { data: profile } = await authResult.supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', authResult.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, endpoint_id, category, description, is_active, sort_order } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少模型ID' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (endpoint_id !== undefined) updates.endpoint_id = endpoint_id;
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data, error } = await getSupabaseClient()
      .from('ai_models')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '该接入点ID已存在' }, { status: 409 });
      }
      console.error('[ModelsAPI] 更新失败:', error);
      return NextResponse.json({ error: '更新模型失败' }, { status: 500 });
    }

    return NextResponse.json({ model: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '操作失败';
    console.error('[ModelsAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ==================== DELETE: 删除模型 ====================

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { data: profile } = await authResult.supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', authResult.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少模型ID' }, { status: 400 });
    }

    const { error } = await getSupabaseClient()
      .from('ai_models')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[ModelsAPI] 删除失败:', error);
      return NextResponse.json({ error: '删除模型失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '操作失败';
    console.error('[ModelsAPI] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
