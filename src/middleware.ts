import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  // In demo mode, allow all routes
  if (isDemoMode) {
    return NextResponse.next();
  }

  // Check Supabase auth session cookie
  const supabaseAuth = request.cookies.get('sb-access-token')
    || request.cookies.get(`sb-${getSupabaseProjectRef()}-auth-token`);

  if (!supabaseAuth && !request.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return NextResponse.next();
}

// Extract project ref from Supabase URL for cookie name
function getSupabaseProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] || 'placeholder';
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/signals/:path*',
    '/markets/:path*',
    '/trades/:path*',
    '/news/:path*',
    '/settings/:path*',
  ],
};
