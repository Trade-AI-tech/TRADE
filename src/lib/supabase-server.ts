import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { isDemoMode } from './supabase';

/**
 * Supabase clients สำหรับฝั่ง server เท่านั้น (route handlers / server components)
 *
 * ⚠ ห้าม import ไฟล์นี้จาก client component — มันดึง next/headers
 */

/**
 * Client ที่ผูกกับ session ของผู้ใช้ที่ล็อกอินอยู่ (ผ่าน cookie)
 * ทุก query จะถูกบังคับด้วย RLS ตาม auth.uid() → ปลอมตัวเป็นคนอื่นไม่ได้
 */
export function createRouteClient() {
  if (isDemoMode()) return null;

  const cookieStore = cookies();
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // เรียกจาก Server Component — ปล่อยผ่าน (middleware จะ refresh ให้)
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            /* เช่นเดียวกับ set */
          }
        },
      },
    }
  );
}

/**
 * ผู้ใช้ปัจจุบันจาก session cookie — verify กับ Supabase จริง ไม่เชื่อ header จาก client
 */
export async function getSessionUser() {
  const supabase = createRouteClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/**
 * Client สิทธิ์ service-role — ข้าม RLS
 * ใช้เฉพาะงานเบื้องหลังที่ไม่มี session (cron) เท่านั้น
 * ห้ามใช้ร่วมกับ user id ที่รับมาจาก request
 */
export function createAdminClient() {
  if (isDemoMode()) return null;
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
