import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * ตรวจ session จริงผ่าน Supabase และต่ออายุ token ให้ในตัว
 *
 * เดิมโค้ดเช็คแค่ว่ามี cookie ชื่อ `sb-<ref>-auth-token` อยู่ไหม
 * ซึ่งพังเมื่อ token ยาวเกิน 4KB แล้วถูกหั่นเป็น `...auth-token.0` / `.1`
 * (ล็อกอินสำเร็จแต่โดนเด้งกลับหน้า login วนไม่จบ)
 */
export async function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  if (!data.user && !request.nextUrl.pathname.startsWith('/auth')) {
    const loginUrl = new URL('/auth/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/signals/:path*',
    '/markets/:path*',
    '/trades/:path*',
    '/news/:path*',
    '/settings/:path*',
    '/backtest/:path*',
  ],
};
