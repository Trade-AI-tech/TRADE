import { NextRequest, NextResponse } from 'next/server';
import { fetchChart } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal-engine';
import { sendSignalAlert } from '@/lib/telegram';
import { isDemoMode } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-server';
import type { Signal, MarketPrice, AlertPreferences } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEDUPE_HOURS = 20;

/**
 * Daily cron: สแกน watchlist ของผู้ใช้ทุกคน → สร้างสัญญาณ → บันทึก → ส่ง Telegram
 *
 * ทำงานโดยไม่มี session จึงใช้ service-role client
 * ป้องกันด้วย CRON_SECRET header
 */
export async function GET(req: NextRequest) {
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

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase unavailable' }, { status: 500 });
  }

  try {
    // 1. watchlist ทั้งหมดที่เปิดใช้งาน
    const { data: watchlist, error: wlErr } = await supabase
      .from('watchlist')
      .select('*')
      .eq('is_active', true);

    if (wlErr) throw wlErr;
    if (!watchlist?.length) {
      return NextResponse.json({ success: true, scanned: 0, message: 'No watchlist items' });
    }

    // 2. ดึง chart ครั้งเดียวต่อ symbol แล้วใช้ซ้ำกับทุก user ที่ติดตาม symbol เดียวกัน
    const uniqueKeys = new Map<string, { symbol: string; market: string }>();
    for (const w of watchlist) uniqueKeys.set(`${w.symbol}|${w.market}`, { symbol: w.symbol, market: w.market });

    const charts = new Map<string, Awaited<ReturnType<typeof fetchChart>>>();
    const prices: MarketPrice[] = [];

    for (const [key, s] of uniqueKeys) {
      try {
        const chart = await fetchChart(s.symbol, s.market, '1d', '1y');
        charts.set(key, chart);
        if (chart.quote) prices.push(chart.quote);
      } catch (e) {
        console.error('fetchChart failed for', s.symbol, e);
      }
    }

    // symbol เดียวกันอาจโผล่มาจากคนละ market ได้ (เช่น watchlist คนละคนใส่ market ไม่ตรงกัน)
    // upsert ที่มี symbol ซ้ำใน batch เดียว Postgres จะโยน
    // "ON CONFLICT DO UPDATE command cannot affect row a second time" แล้วทิ้งทั้ง batch
    // ยุบให้เหลือแถวเดียวต่อ symbol ก่อน (Map เก็บตัวหลังสุดที่ fetch สำเร็จ)
    const uniquePrices = [...new Map(prices.map(p => [p.symbol, p])).values()];

    // นับเฉพาะตอนเขียนสำเร็จจริง — เดิมรายงาน prices.length เสมอแม้ upsert จะล้ม
    // ทำให้ log ของ cron ขึ้นเขียวทั้งที่ราคาไม่เคยลง DB แล้วหน้าตลาดค้างราคาเก่าเงียบ ๆ
    let pricesUpdated = 0;
    if (uniquePrices.length > 0) {
      const { error: priceErr } = await supabase
        .from('market_prices')
        .upsert(uniquePrices, { onConflict: 'symbol' });
      if (priceErr) console.error('market_prices upsert failed:', priceErr);
      else pricesUpdated = uniquePrices.length;
    }

    // 3. สัญญาณที่ยัง active อยู่ ใช้กันสร้างซ้ำ
    const since = new Date(Date.now() - DEDUPE_HOURS * 3600_000).toISOString();
    const { data: recent } = await supabase
      .from('signals')
      .select('user_id, symbol, action')
      .eq('status', 'active')
      .gte('created_at', since);
    const seen = new Set((recent ?? []).map(r => `${r.user_id}:${r.symbol}:${r.action}`));

    // 4. สร้างสัญญาณรายรายการ
    const signalsToInsert: Signal[] = [];

    for (const item of watchlist) {
      const chart = charts.get(`${item.symbol}|${item.market}`);
      if (!chart || chart.candles.length < 50) continue;

      const signal = generateSignal({
        symbol: item.symbol,
        name: item.name,
        market: item.market,
        candles: chart.candles,
        timeframe: '1D',
      });

      if (!signal || signal.action === 'HOLD' || signal.strength === 'weak') continue;

      const key = `${item.user_id}:${signal.symbol}:${signal.action}`;
      if (seen.has(key)) continue;
      seen.add(key);

      signal.user_id = item.user_id;
      signalsToInsert.push(signal);
    }

    if (signalsToInsert.length > 0) {
      const { error: insErr } = await supabase.from('signals').insert(signalsToInsert);
      if (insErr) throw insErr;
    }

    // 5. แจ้งเตือน Telegram ตามการตั้งค่าของแต่ละคน
    let alertsSent = 0;
    let alertsFailed = 0;
    const userIds = [...new Set(signalsToInsert.map(s => s.user_id))];

    for (const userId of userIds) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('telegram_bot_token, telegram_chat_id, telegram_enabled, alert_preferences')
        .eq('id', userId)
        .maybeSingle();

      if (!profile?.telegram_enabled || !profile.telegram_bot_token || !profile.telegram_chat_id) continue;

      const prefs = (profile.alert_preferences ?? {}) as AlertPreferences;

      for (const signal of signalsToInsert.filter(s => s.user_id === userId)) {
        if (signal.action === 'BUY' && prefs.buy_signals === false) continue;
        if (signal.action === 'SELL' && prefs.sell_signals === false) continue;
        if (prefs.strong_signals_only && signal.strength !== 'strong' && signal.strength !== 'very_strong') continue;

        const res = await sendSignalAlert(
          { botToken: profile.telegram_bot_token, chatId: profile.telegram_chat_id },
          signal
        );

        await supabase.from('telegram_alerts').insert({
          user_id: userId,
          signal_id: signal.id,
          message: `${signal.action} ${signal.symbol} @ ${signal.entry_price}`,
          success: res.success,
          error: res.error ?? null,
        });

        if (res.success) {
          alertsSent++;
          await supabase.from('signals').update({ telegram_sent: true }).eq('id', signal.id);
        } else {
          alertsFailed++;
          console.error('telegram send failed:', res.error);
        }
      }
    }

    // 6. หมดอายุสัญญาณเก่า
    const { error: expErr } = await supabase
      .from('signals')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());
    if (expErr) console.error('expire signals failed:', expErr);

    return NextResponse.json({
      success: true,
      scanned: watchlist.length,
      pricesUpdated,
      signalsGenerated: signalsToInsert.length,
      alertsSent,
      alertsFailed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('cron error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
