import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('sb-access-token')?.value;

    if (!token) {
      return NextResponse.json({ user: null, profile: null });
    }

    const supabase = getSupabaseClient(token);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ user: null, profile: null });
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      user: { id: user.id, email: user.email || '' },
      profile: profile || null,
    });
  } catch {
    return NextResponse.json({ user: null, profile: null });
  }
}
