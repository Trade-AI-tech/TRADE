import { NextRequest, NextResponse } from 'next/server';
import { fetchChart } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal-engine';
import { sendSignalAlert } from '@/lib/telegram';
import { sendPendingSignalsToUser } from '@/lib/push-server';
import { isDemoMode } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-server';
import type { Signal, MarketPrice, AlertPreferences, CandleData } from '@/types';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * ⚠ route นี้ไม่มีตัวจับเวลายิงอัตโนมัติแล้ว — เหลือไว้ให้ "กดเรียกเอง" อย่างเดียว
 *
 * ที่เอา cron ออกจาก vercel.json (เดิม `{path:'/api/cron/scan-markets', schedule:'0 1 * * *'}`)
 * ไม่ใช่เพราะ route พัง แต่เพราะมีตัวสแกนที่ทำงานจริงอยู่แล้วคือ .github/workflows/scan-universe.yml
 * (รายชั่วโมง นาทีที่ 25 · สแกนทั้งจักรวาล ∪ watchlist) และการมีตัวสแกนสองตัวเขียนตาราง
 * signals ใบเดียวกันมีผลข้างเคียงที่วัดได้จริงสองข้อ:
 *   1. ตัวกันสัญญาณซ้ำเป็นแบบ "อ่านก่อนเขียน" — สองตัวที่รันใกล้กันกันซ้ำไม่อยู่
 *      (เหตุผลเดียวกับที่ .github/workflows/scan-markets.yml ปิด schedule ไปแล้วเมื่อ 2026-08-17)
 *   2. ตอนนี้ฐานข้อมูลยังไม่ได้รัน migration 006 (วัดจริง: signals.push_sent ตอบ 42703)
 *      = ทำงานในโหมดถอยที่ "รอบที่ถูกกันความถี่ไม่ได้เก็บตก" รอบ 01:00 ของ Vercel
 *      จะกินโควตาแจ้งเตือนของชั่วโมงนั้นไป แล้วรอบ 01:25 ที่สแกนกว้างกว่าจะเงียบทั้งรอบ
 *
 * กดเรียกเองได้เหมือนเดิมทุกอย่าง (ใช้ไล่ปัญหา):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/scan-markets
 *   หรือกด Run workflow ที่ .github/workflows/scan-markets.yml
 * อยากได้ตัวจับเวลาฝั่ง Vercel กลับ: ใส่บล็อก crons กลับใน vercel.json แล้วปิด scan-universe.yml ก่อน
 */

/**
 * ตัวให้คะแนน "โอกาสจบใน ~1 ชม." — ต้องเป็นชุดเดียวกับที่หน้า /signals ใช้
 *
 * ทำไมต้องพยายามโหลดให้ได้ทั้งที่ route นี้เป็นทางไล่ปัญหา: เจ้าของสั่งไว้ว่าลำดับในแจ้งเตือน
 * ต้องตรงกับลำดับบนเว็บ ถ้า route นี้ยิงใบที่เรียงคนละกติกา ก็จะเจอภาพเดิมที่เขาบ่นมา
 *
 * ทำไมไม่ import ตรง ๆ: src/lib/speed-scorecard.ts เป็นไฟล์ของงานวิจัยที่ทำขนานอยู่
 * ถ้าวันไหนมันหายไป (หรือยังไม่ถูกสร้าง) การ import ตรง ๆ จะทำให้ทั้งโปรเจกต์ build ไม่ผ่าน
 * = ทั้งเว็บล่ม ไม่ใช่แค่ลำดับเพี้ยน · require.context ให้ผลเป็น "ชุดว่าง" แทนที่จะเป็น error
 * (วิธีเดียวกับที่ src/app/signals/page.tsx ใช้อยู่ — ตัวยึด ^...$ จำเป็น ไม่งั้นจะไปจับ
 *  speed-scorecard.data.json ซึ่งเป็นไฟล์ข้อมูล ไม่ใช่ตัวให้คะแนน)
 */
type WebpackRequireContext = { keys(): string[]; (id: string): unknown };
declare const require: { context(dir: string, useSubdirectories: boolean, regExp: RegExp): WebpackRequireContext };

function loadSpeedScorer(): ((signal: Signal) => unknown) | null {
  try {
    const ctx = require.context('../../../../lib', false, /^\.\/speed-scorecard(\.tsx?)?$/);
    for (const key of ctx.keys()) {
      const mod = ctx(key) as Record<string, unknown> | null;
      const fn = mod?.speedScore ?? mod?.default;
      if (typeof fn === 'function') return fn as (signal: Signal) => unknown;
    }
    return null;
  } catch {
    return null;
  }
}

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
 * สแกน watchlist ของผู้ใช้ทุกคน → สร้างสัญญาณ → บันทึก → แจ้งเตือน (Web Push + Telegram)
 *
 * ทำงานโดยไม่มี session จึงใช้ service-role client
 * ป้องกันด้วย CRON_SECRET header
 *
 * ⚠ ไม่มีตัวจับเวลาเรียกอัตโนมัติแล้ว (ดูเหตุผลในคอมเมนต์ข้างบน) — เป็นเครื่องมือไล่ปัญหา
 *   กดเรียกเมื่อไหร่ก็ได้ ตัวจำกัดความถี่ฝั่งแจ้งเตือนกันไม่ให้สั่นเกินชั่วโมงละครั้งเอง
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

    // 5. แจ้งเตือน — Push เข้าโทรศัพท์เป็นช่องทางหลัก, Telegram เป็นของเสริมถ้าตั้งไว้
    //
    // สองช่องทางนี้ต้อง "ไม่ผูกกัน": เดิมโค้ดข้ามทั้ง user ไปเลยเมื่อ Telegram ยังไม่ได้ตั้งค่า
    // ถ้าเอา push มาต่อท้ายในกิ่งเดียวกัน คนที่ไม่ใช้ Telegram (คือเจ้าของระบบ)
    // จะไม่ได้รับแจ้งเตือนสักช่องทางเดียว ทั้งที่กดเปิดแจ้งเตือนบนมือถือไว้แล้ว
    let alertsSent = 0;
    let alertsFailed = 0;
    let pushSent = 0;
    let pushFailed = 0;
    let pushPruned = 0;
    /** จำนวน "ครั้งที่โทรศัพท์สั่น" ทั้งรอบ — ตัวเลขที่ต้องจับตา ไม่ใช่จำนวนสัญญาณ */
    let pushNotifications = 0;
    let pushThrottled = 0;
    const pushErrors: string[] = [];
    /** เหตุผลภาษาไทยของการตัดสินใจแจ้งเตือนรายคน — ไว้ไล่ปัญหาโดยไม่ต้องเปิด log ของ Vercel */
    const pushReasons: string[] = [];
    // โหลดครั้งเดียวต่อรอบ แล้วห่อกัน error กลางการเรียง (push-digest ห่อไว้อีกชั้นแล้ว
    // แต่ที่นี่ห่อไว้ด้วยเพราะเราเป็นคนเรียกไฟล์ของคนอื่นเข้ามาเอง)
    const rawSpeedScorer = loadSpeedScorer();
    const speedScore = rawSpeedScorer
      ? (signal: Signal) => {
          try {
            return rawSpeedScorer(signal) as never;
          } catch {
            return null;
          }
        }
      : null;
    const userIds = [...new Set(signalsToInsert.map(s => s.user_id))];

    for (const userId of userIds) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('telegram_bot_token, telegram_chat_id, telegram_enabled, alert_preferences')
        .eq('id', userId)
        .maybeSingle();

      // ไม่มีแถว profile ก็ยังต้องแจ้งเตือน — ใช้ค่าเริ่มต้นคือ "ส่งทุกสัญญาณ"
      // การเงียบเพราะ profile หายไปคือความล้มเหลวที่ผู้ใช้มองไม่เห็น
      const prefs = (profile?.alert_preferences ?? {}) as AlertPreferences;

      /** ตัวกรองตามความชอบผู้ใช้ — ส่งเป็นฟังก์ชันให้ตัวส่งกลางใช้กับของค้างจากรอบก่อนด้วย */
      const allow = (signal: Signal) => {
        if (signal.action === 'BUY' && prefs.buy_signals === false) return false;
        if (signal.action === 'SELL' && prefs.sell_signals === false) return false;
        if (prefs.strong_signals_only && signal.strength !== 'strong' && signal.strength !== 'very_strong') return false;
        return true;
      };
      const mine = signalsToInsert.filter(s => s.user_id === userId).filter(allow);

      // 5a. Push เข้าเครื่อง — ทำก่อนเสมอ ไม่ขึ้นกับสถานะ Telegram
      //
      // ⚠ เดิมตรงนี้วนยิงทีละสัญญาณ (`for (const signal of mine) sendPushToUser(...)`)
      //   watchlist 3 แถวจึงเด้งได้ 3 ครั้งติดในรอบเดียว ซึ่งขัดสเปก "ชั่วโมงละ 1 ครั้ง" ตรง ๆ
      //   และเป็นพฤติกรรมที่ iOS ลงโทษด้วยการตัดสิทธิ์ push เงียบ ๆ
      //
      //   ตอนนี้ยกให้ sendPendingSignalsToUser ตัดสินทั้งหมด: รวมของค้างจากรอบก่อน + ของรอบนี้
      //   → จัดลำดับ → ยุบตัวซ้ำ → ยิง "ใบเดียว" ต่อคนต่อชั่วโมง แล้วปั๊มว่าแจ้งแล้ว
      //   ตรรกะเดียวกับที่ scripts/scan-universe.mjs ใช้ = ไม่มีทางเถียงกันเอง
      //
      // ⚠ รอบที่ไม่มีสัญญาณใหม่เลยจะไม่เข้าลูปนี้ (userIds มาจาก signalsToInsert)
      //   ของค้างจึงถูกเก็บตกโดยตัวสแกนหลักรายชั่วโมง ไม่ใช่โดยการกดเรียก route นี้เอง
      const pushRes = await sendPendingSignalsToUser(supabase, userId, mine, { filter: allow, speedScore });
      pushSent += pushRes.sent;
      pushFailed += pushRes.failed;
      pushPruned += pushRes.pruned;
      pushNotifications += pushRes.notifications;
      if (pushRes.throttled) pushThrottled++;
      if (pushRes.reason && pushReasons.length < 5 && !pushReasons.includes(pushRes.reason)) {
        pushReasons.push(pushRes.reason);
      }
      // เก็บเหตุผลไว้ใน response ของ cron ให้ไล่ปัญหาได้โดยไม่ต้องเปิด log ของ Vercel
      // (จำกัดจำนวนกันยาวเกิน — สาเหตุมักซ้ำกันทุกแถวอยู่แล้ว)
      for (const e of pushRes.errors) if (pushErrors.length < 5 && !pushErrors.includes(e)) pushErrors.push(e);

      // 5b. Telegram — เฉพาะคนที่ตั้งค่าไว้ครบ
      if (!profile?.telegram_enabled || !profile.telegram_bot_token || !profile.telegram_chat_id) continue;

      for (const signal of mine) {
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
      pushSent,
      pushFailed,
      pushPruned,
      // จำนวนใบแจ้งเตือนที่ยิงจริงทั้งรอบ = จำนวนครั้งที่โทรศัพท์สั่น (ควรเป็น 0 หรือ 1 ต่อคน)
      pushNotifications,
      // จำนวนคนที่ถูกกันเพราะชั่วโมงนี้แจ้งไปแล้ว — ไม่ใช่ความผิดพลาด แต่ต้องเห็น
      pushThrottled,
      pushReasons,
      pushErrors,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('cron error:', err);
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
