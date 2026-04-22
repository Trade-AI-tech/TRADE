import { NextRequest, NextResponse } from 'next/server';
import { fetchCandles } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal-engine';
import { isDemoMode, createServerClient } from '@/lib/supabase';
import { DEMO_WATCHLIST, DEMO_SIGNALS } from '@/lib/demo-data';
import type { Signal } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Scan all watched symbols → generate signals
 * Called by Header "สแกนตลาด" button and daily cron
 */
export async function POST(req: NextRequest) {
  try {
    // Demo mode: just return fresh demo signals
    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        scanned: DEMO_WATCHLIST.length,
        signals: DEMO_SIGNALS.filter(s => s.action !== 'HOLD'),
        message: 'สแกนตลาดเสร็จสิ้น (Demo Mode)',
      });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase unavailable' }, { status: 500 });
    }

    // Get user from header (simplified - in production use auth middleware)
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch active watchlist
    const { data: watchlist, error: wlErr } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (wlErr) throw wlErr;

    const signals: Signal[] = [];

    for (const item of watchlist || []) {
      const candles = await fetchCandles(item.symbol, item.market, '1d', '3mo');
      if (candles.length < 50) continue;

      const signal = generateSignal({
        symbol: item.symbol,
        name: item.name,
        market: item.market,
        candles,
        timeframe: '1D',
      });

      if (signal && signal.action !== 'HOLD') {
        signal.user_id = userId;
        signals.push(signal);
      }
    }

    // Insert signals into DB
    if (signals.length > 0) {
      await supabase.from('signals').insert(signals);
    }

    return NextResponse.json({
      success: true,
      scanned: watchlist?.length || 0,
      signals,
      message: `สแกนตลาดเสร็จสิ้น พบ ${signals.length} สัญญาณ`,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
