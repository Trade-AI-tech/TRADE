import { NextRequest, NextResponse } from 'next/server';
import { fetchChart } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal-engine';
import { sendSignalAlert } from '@/lib/telegram';
import { isDemoMode } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-server';
import type { Signal, MarketPrice, AlertPreferences, CandleData } from '@/types';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * ไม่สร้างสัญญาณซ้ำของ user+symbol+action+timeframe เดิมภายในกี่ชั่วโมง
 * แยกหน้าต่างตาม timeframe: แท่งรายวันออกสัญญาณใหม่วันละครั้งก็พอ (20 ชม.)
 * แต่แท่งรายชั่วโมงตลาดเดินเร็วกว่ามาก ถ้าล็อกไว้ 20 ชม. เท่ากันจะกลายเป็นปิดปาก 1H ทั้งวัน
 */
const DEDUPE_HOURS_1D = 20;
const DEDUPE_HOURS_1H = 4;

/**
 * งบเวลาโดยประมาณก่อนชน maxDuration 60 วิ — การเพิ่ม 1H ทำให้ fetch ต่อ symbol เพิ่มเป็น 2
 * จึงไล่ 1D ให้ครบก่อน แล้วค่อยเก็บ 1H ถ้าเกินงบให้หยุดเพิ่ม 1H และรายงานจำนวนที่ข้าม ไม่เงียบ
 */
const TIME_BUDGET_MS = 45_000;

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

  const startedAt = Date.now();
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

    // 3. สัญญาณที่ยัง active อยู่ ใช้กันสร้างซ้ำ — query ด้วยหน้าต่างที่กว้างสุด (ของ 1D)
    // แล้วกรองหน้าต่างแคบของ 1H ในโค้ด เพราะ timeframe เป็น text ใน DB
    // การผูกเงื่อนไข or ตาม timeframe ใน query อ่านยากและพังเงียบได้ง่ายกว่า
    const since = new Date(Date.now() - DEDUPE_HOURS_1D * 3600_000).toISOString();
    const { data: recent } = await supabase
      .from('signals')
      .select('user_id, symbol, action, timeframe, created_at')
      .eq('status', 'active')
      .gte('created_at', since);

    const cutoff1H = Date.now() - DEDUPE_HOURS_1H * 3600_000;
    const seen = new Set<string>();
    for (const r of recent ?? []) {
      // แถว 1H ที่เก่ากว่าหน้าต่าง 4 ชม. ไม่นับเป็นตัวกันซ้ำ — ปล่อยให้ออกสัญญาณใหม่ได้
      if (r.timeframe === '1H' && new Date(r.created_at).getTime() < cutoff1H) continue;
      seen.add(`${r.user_id}:${r.symbol}:${r.action}:${r.timeframe}`);
    }

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

      const key = `${item.user_id}:${signal.symbol}:${signal.action}:${signal.timeframe}`;
      if (seen.has(key)) continue;
      seen.add(key);

      signal.user_id = item.user_id;
      signalsToInsert.push(signal);
    }

    // 4.5 รอบ 1H — เริ่มหลัง 1D ครบทั้งชุดแล้วเท่านั้น
    // เหตุผลของลำดับ: ถ้าสลับ 1D/1H ต่อ symbol แล้วเวลาหมดกลางทาง จะเสียครึ่ง ๆ กลาง ๆ
    // ทั้งสองความละเอียด — แบบนี้อย่างแย่ที่สุด 1D ยังครบเหมือนพฤติกรรมเดิมทุกอย่าง
    let hourlySkippedForTime = 0;
    const hourlyCharts = new Map<string, CandleData[]>();
    const uniqueList = [...uniqueKeys];
    for (let i = 0; i < uniqueList.length; i++) {
      // เกินงบเวลา → หยุดเพิ่ม 1H แล้วรายงานจำนวนที่ข้ามใน response ห้ามเงียบ
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        hourlySkippedForTime = uniqueList.length - i;
        break;
      }
      const [key, s] = uniqueList[i];
      try {
        // ไม่เก็บ quote จากรอบนี้ — ราคาปัจจุบันถูก upsert จากรอบ 1D ไปแล้ว
        const chart = await fetchChart(s.symbol, s.market, '1h', '3mo');
        // แท่งรายชั่วโมงไม่ถึง 50 → วิเคราะห์ไม่ได้ (Yahoo ให้ intraday ย้อนหลังจำกัด
        // และบาง symbol ไม่มีข้อมูลรายชั่วโมงเลย) ข้ามเงียบ ๆ เกณฑ์เดียวกับ 1D ข้างบน
        if (chart.candles.length >= 50) hourlyCharts.set(key, chart.candles);
      } catch (e) {
        console.error('fetchChart 1h failed for', s.symbol, e);
      }
    }

    for (const item of watchlist) {
      const hourly = hourlyCharts.get(`${item.symbol}|${item.market}`);
      if (!hourly) continue;

      const signal = generateSignal({
        symbol: item.symbol,
        name: item.name,
        market: item.market,
        candles: hourly,
        timeframe: '1H',
      });

      // เกณฑ์เดียวกับ 1D ทุกอย่าง: HOLD ไม่บันทึก และ strength weak ไม่บันทึก
      if (!signal || signal.action === 'HOLD' || signal.strength === 'weak') continue;

      const key = `${item.user_id}:${signal.symbol}:${signal.action}:${signal.timeframe}`;
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
      // จำนวน symbol ที่ไม่ได้สแกน 1H เพราะเวลาใกล้ชน maxDuration — ต้องเห็นใน log ของ cron
      hourlySkippedForTime,
      alertsSent,
      alertsFailed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('cron error:', err);
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
