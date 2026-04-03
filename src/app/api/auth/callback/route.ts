import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isDemoMode } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code && !isDemoMode()) {
    const supabase = createServerClient();
    if (supabase) {
      // Exchange the auth code for a session
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Redirect to dashboard (or login if auth failed)
  return NextResponse.redirect(`${origin}/dashboard`);
}
