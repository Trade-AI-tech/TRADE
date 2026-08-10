import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/supabase';
import { createRouteClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/**
 * ปลายทางหลังยืนยันอีเมล / OAuth
 *
 * ต้องแลก code ด้วย client ที่ผูกกับ cookie (ไม่ใช่ service-role)
 * ไม่งั้น session จะไม่ถูกเขียนลง browser และผู้ใช้จะยังไม่ได้ล็อกอิน
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code && !isDemoMode()) {
    const supabase = createRouteClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(error.message)}`
      );
    }
  }

  return NextResponse.redirect(`${origin}/auth/login`);
}
