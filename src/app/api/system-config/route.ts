import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/system-config - Get all system configs (public: only safe keys)
export async function GET(request: NextRequest) {
  const token = request.headers.get('x-session') || 
    request.cookies.get('sb-access-token')?.value;
  
  const supabase = getSupabaseClient(token || undefined);
  
  // Check if admin
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();
    isAdmin = profile?.is_admin === true;
  }

  // Public keys (visible to all users)
  const publicKeys = [
    'registration_open',
    'maintenance_mode', 
    'image_generation_open',
    'video_generation_open',
    'music_generation_open',
    'digital_human_open',
    'announcement',
  ];

  let query = supabase
    .from('system_config')
    .select('key, value, description');

  if (!isAdmin) {
    query = query.in('key', publicKeys);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Convert array to object
  const config: Record<string, string> = {};
  for (const row of data || []) {
    config[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
  }

  return NextResponse.json({ config });
}

// PUT /api/system-config - Update config (admin only)
export async function PUT(request: NextRequest) {
  const token = request.headers.get('x-session') || 
    request.cookies.get('sb-access-token')?.value;
  
  const supabase = getSupabaseClient(token || undefined);
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const body = await request.json();
  const { key, value } = body;

  if (!key || value === undefined) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 });
  }

  const { error } = await supabase
    .from('system_config')
    .upsert({ 
      key, 
      value: typeof value === 'string' ? value : JSON.stringify(value),
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
