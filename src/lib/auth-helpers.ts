import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Get authenticated user from request (supports both cookie and x-session header)
 */
export async function getAuthUser(request: NextRequest): Promise<{ user: User | null; supabase: SupabaseClient }> {
  // Try cookie first
  const cookieToken = request.cookies.get('sb-access-token')?.value;
  // Then try header
  const headerToken = request.headers.get('x-session');
  const token = cookieToken || headerToken;

  if (!token) {
    return { user: null, supabase: getSupabaseClient() };
  }

  const supabase = getSupabaseClient(token);
  const { data: { user } } = await supabase.auth.getUser(token);

  return { user, supabase };
}
