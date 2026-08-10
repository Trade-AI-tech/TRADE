import { createBrowserClient } from '@supabase/ssr';

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

// หมายเหตุ: client ฝั่ง server อยู่ที่ src/lib/supabase-server.ts
// แยกไฟล์เพราะมันดึง next/headers ซึ่ง import จาก client component ไม่ได้

// Singleton browser client
let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (isDemoMode()) return null;
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
