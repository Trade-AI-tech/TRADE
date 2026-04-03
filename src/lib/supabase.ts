import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Check if we're in demo mode (no real Supabase configured)
export function isDemoMode(): boolean {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
      || !process.env.NEXT_PUBLIC_SUPABASE_URL
      || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
  }
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
    || !process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
}

// Browser client (for components)
export function createClient() {
  if (isDemoMode()) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Server client (for API routes / Server Components)
export function createServerClient() {
  if (isDemoMode()) return null;
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Singleton browser client
let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (isDemoMode()) return null;
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
