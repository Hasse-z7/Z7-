'use client';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Browser-side Supabase client
// In the Coze sandbox, credentials are auto-configured via the server-side client
// Browser uses API routes for auth instead of direct Supabase access
let cachedClient: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient() {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Return null client - auth should go through API routes
    // This prevents crashes while still allowing the app to work
    return null as unknown as ReturnType<typeof createSupabaseClient>;
  }

  cachedClient = createSupabaseClient(url, anonKey);
  return cachedClient;
}
