import { NextRequest, NextResponse } from 'next/server';
import { fetchCandles, fetchQuotes } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal-engine';
import { sendSignalAlert } from '@/lib/telegram';
import { isDemoMode, createServerClient } from '@/lib/supabase';
import type { Signal } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Daily cron: scan all watchlists across all users,
 * generate signals, save to DB, send Telegram alerts.
 *
 * Protected by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoMode()) {
    return NextResponse.json({
      success: true,
      demo: true,
      message: 'Cron executed in demo mode - no real scanning performed',
      timestamp: new Date().toISOString(),
    });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase unavailable' }, { status: 500 });
  }

  try {
    // 1. Load all active watchlist items (grouped implicitly by user)
    const { data: watchlist, error: wlErr } = await supabase
      .from('watchlist')
      .select('*')
      .eq('is_active', true);

    if (wlErr) throw wlErr;
    if (!watchlist?.length) {
      return NextResponse.json({ success: true, scanned: 0, message: 'No watchlist items' });
    }

    // 2. Update market prices (dedupe by symbol)
    const uniqueSymbols = new Map<string, { symbol: string; market: string }>();
    for (const w of watchlist) uniqueSymbols.set(w.symbol, { symbol: w.symbol, market: w.market });

    const quotes = await fetchQuotes(Array.from(uniqueSymbols.values()));
    if (quotes.length > 0) {
      await supabase.from('market_prices').upsert(quotes, { onConflict: 'symbol' });
    }

    // 3. Generate signals per watchlist entry
    const signalsToInsert: Signal[] = [];
    const alertsToSend: Array<{ userId: string; signal: Signal }> = [];

    for (const item of watchlist) {
      try {
        const candles = await fetchCandles(item.symbol, item.market, '1d', '3mo');
        if (candles.length < 50) continue;

        const signal = generateSignal({
          symbol: item.symbol,
          name: item.name,
          market: item.market,
          candles,
          timeframe: '1D',
        });

        if (!signal || signal.action === 'HOLD') continue;
        // Only alert on strong/very_strong by default
        if (signal.strength === 'weak') continue;

        signal.user_id = item.user_id;
        signalsToInsert.push(signal);
        alertsToSend.push({ userId: item.user_id, signal });
      } catch (e) {
        console.error('scan error for', item.symbol, e);
      }
    }

    // 4. Insert signals
    if (signalsToInsert.length > 0) {
      await supabase.from('signals').insert(signalsToInsert);
    }

    // 5. Send Telegram alerts (load per-user config)
    let alertsSent = 0;
    const userIds = [...new Set(alertsToSend.map(a => a.userId))];

    for (const userId of userIds) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('telegram_bot_token, telegram_chat_id, telegram_enabled')
        .eq('id', userId)
        .single();

      if (!profile?.telegram_enabled || !profile.telegram_bot_token || !profile.telegram_chat_id) continue;

      const userAlerts = alertsToSend.filter(a => a.userId === userId);
      for (const { signal } of userAlerts) {
        const res = await sendSignalAlert(
          { botToken: profile.telegram_bot_token, chatId: profile.telegram_chat_id },
          signal
        );
        if (res.success) {
          alertsSent++;
          await supabase
            .from('signals')
            .update({ telegram_sent: true })
            .eq('id', signal.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      scanned: watchlist.length,
      signalsGenerated: signalsToInsert.length,
      alertsSent,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('cron error:', err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
