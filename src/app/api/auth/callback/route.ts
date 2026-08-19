import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/supabase';
import { createRouteClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// ชนิด OTP ที่ยอมรับ — กันไม่ให้ค่าจาก query string หลุดเข้า verifyOtp ตรง ๆ
const OTP_TYPES: readonly EmailOtpType[] = [
  'magiclink', 'signup', 'invite', 'recovery', 'email_change', 'email',
];

/**
 * ปลายทางหลังยืนยันอีเมล / OAuth
 *
 * รับได้สองแบบ:
 *
 * 1. ?token_hash=&type=  → verifyOtp ฝั่ง server
 *    ไม่ต้องพึ่ง state ใด ๆ ในเบราว์เซอร์ จึงเปิดลิงก์จากเบราว์เซอร์ตัวไหนก็ได้
 *
 * 2. ?code=              → exchangeCodeForSession (PKCE)
 *    ต้องมี code_verifier ใน cookie ของเบราว์เซอร์ตัวเดียวกับที่ขอลิงก์
 *    ถ้าเปิดลิงก์คนละเบราว์เซอร์ (เช่นกดจากในแอปเมล หรือขอจาก PWA แล้วเปิดใน Safari)
 *    cookie จะไม่ติดมาด้วยและ exchange จะพังเสมอ — เจอจริงกับผู้ใช้จริงมาแล้ว
 *    จึงต้องคงทางที่ 1 ไว้เป็นทางหลักสำหรับลิงก์ในอีเมล
 *
 * ทั้งสองทางต้องแลกด้วย client ที่ผูกกับ cookie (ไม่ใช่ service-role)
 * ไม่งั้น session จะไม่ถูกเขียนลง browser และผู้ใช้จะยังไม่ได้ล็อกอิน
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const rawType = searchParams.get('type');
  const next = searchParams.get('next') ?? '/dashboard';

  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(message)}`);

  if (isDemoMode()) return NextResponse.redirect(`${origin}/auth/login`);

  const supabase = createRouteClient();
  if (!supabase) return NextResponse.redirect(`${origin}/auth/login`);

  if (tokenHash) {
    const type = (OTP_TYPES as readonly string[]).includes(rawType ?? '')
      ? (rawType as EmailOtpType)
      : 'magiclink';
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return fail(error.message);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return fail(error.message);
  }

  return NextResponse.redirect(`${origin}/auth/login`);
}
