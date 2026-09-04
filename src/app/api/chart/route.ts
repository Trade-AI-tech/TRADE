import { NextRequest, NextResponse } from 'next/server';
import { fetchChart } from '@/lib/market-data';
import { isDemoMode } from '@/lib/supabase';
import { getSessionUser } from '@/lib/supabase-server';
import { generateCandleData } from '@/lib/demo-data';
import { SYMBOL_UNIVERSE } from '@/lib/universe';
import {
  CHART_CACHE_SEC,
  CHART_MAX_BARS,
  DEFAULT_TIMEFRAME_KEY,
  resolveTimeframe,
} from '@/lib/chart-timeframes';
import type { ChartBar } from '@/lib/chart-timeframes';
import { errorMessage } from '@/lib/errors';
import type { CandleData } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * /api/chart — แท่งเทียนสำหรับหน้ากราฟ (อ่านอย่างเดียว ไม่เขียนอะไรลง DB เลย)
 *
 * ═══ ทำไมต้องมี route ใหม่ ═════════════════════════════════════════════════════
 * ก่อนหน้านี้ไม่มี route ไหนส่งแท่งเทียนให้ฝั่ง client เลยสักตัว — ทุกผู้เรียกของ
 * fetchChart อยู่ฝั่งเบื้องหลังทั้งหมด (ตัวสแกน · ตัวเฝ้าออเดอร์ · backtest ที่คืนผลสรุป)
 * หน้ากราฟจึงต้องมีทางของตัวเอง และต้องวิ่งผ่าน fetchChart ตัวจริงเพื่อให้แท่งที่ผู้ใช้เห็น
 * ผ่านด่าน candle-sanitizer ชุดเดียวกับที่เครื่องยนต์ใช้คิด (Yahoo ส่งแท่งเป็นไปไม่ได้มาจริง
 * ~3.3% ของแคชวิจัย — ถ้ากราฟไม่ผ่านด่าน ผู้ใช้จะเห็นแท่งที่ไม่เคยมีอยู่ในโลก)
 *
 * ═══ แท่งปิดกับแท่งสดต้องแยกกัน ════════════════════════════════════════════════
 * คืนสองช่องแยกโดยตั้งใจ: `bars` = แท่งที่ปิดแล้วเท่านั้น · `forming` = แท่งที่ยังก่อตัว
 * ฝั่งกราฟเอาไปต่อท้ายเพื่อให้ผู้ใช้เห็นราคาปัจจุบัน แต่ฝั่งไหนก็ตามที่ต้องคำนวณให้ตรงกับ
 * สัญญาณ ต้องใช้ `bars` อย่างเดียว — ถ้ายัดรวมกันมาก้อนเดียว ความรู้ว่า "ใบไหนยังไม่ปิด"
 * จะหายไปที่ขอบเครือข่าย แล้วไม่มีใครได้มันคืน (ดูเหตุผลเต็มที่ splitClosedBars)
 *
 * ═══ รูปแท่งที่ส่งออก ══════════════════════════════════════════════════════════
 * ส่งเป็น {t,o,h,l,c} โดย t เป็น epoch **วินาที** ไม่ใช่ CandleData (ISO + volume) ของรีโป
 * เพราะเลน 15m คืนแท่งเป็นพันและหน้าเว็บ poll ทุกนาที — รูป ISO บวก volume ทำให้ก้อน
 * ใหญ่ขึ้นเกือบเท่าตัวโดยที่กราฟไม่ได้ใช้ทั้งคู่ (ตัววาดกราฟรับ epoch วินาทีอยู่แล้ว)
 * นี่คือ route เดียวที่ใช้รูปนี้ และมันมีผู้ใช้เดียวคือหน้ากราฟ
 *
 * ═══ ขนาดก้อนที่ส่งออกเป็นเรื่องของผู้ใช้ ไม่ใช่รายละเอียดภายใน ═══════════════════
 * หน้านี้ถูกเปิดค้างบนมือถือที่ใช้เน็ตมือถือ และ poll ทุก 60 วินาที ขนาดคำตอบจึงแปลง
 * เป็นค่าเน็ตของเจ้าของตรง ๆ — สองด่านที่คุมมันคือการปัดทศนิยม (ดู toWire) และเพดาน
 * จำนวนแท่ง (ดู CHART_MAX_BARS) วัดจริงที่ 2,209 แท่ง: 230.8 KB → ~73 KB (gzip 72.9 → ~20 KB)
 */

/** จักรวาลที่อนุญาตให้ขอกราฟได้ — กันไม่ให้ route นี้กลายเป็น proxy เปิดของ Yahoo */
const ALLOWED = new Map(
  SYMBOL_UNIVERSE.map((u) => [u.symbol.trim().toUpperCase(), u])
);

/** symbol เริ่มต้น = ตัวเดียวในจักรวาลตอนนี้ (เจ้าของสั่งเทรดทองอย่างเดียว 2026-08-29) */
const DEFAULT_SYMBOL = SYMBOL_UNIVERSE[0]?.symbol ?? 'XAUUSD';

/**
 * ทศนิยมของราคาที่ส่งออกสาย — ค่าเดียวกับ roundPrice() ใน src/lib/signal-engine.ts
 *
 * ไม่ได้ตั้งขึ้นใหม่เพื่อเลนนี้ ลอกความละเอียดมาตรฐานของรีโปมาตรง ๆ เพื่อไม่ให้เกิด
 * "ความละเอียดของราคา" เวอร์ชันที่สองที่วันหนึ่งจะเพี้ยนจากตัวหลัก
 */
const PRICE_DECIMALS = (market: string): number => (market === 'FOREX' ? 5 : 4);

/**
 * CandleData → ChartBar · เวลาที่ parse ไม่ได้คืน null แล้วผู้เรียกทิ้งแท่งนั้น (ห้ามเดา)
 *
 * ── ทำไมต้องปัดทศนิยม (วัดมาแล้ว) ────────────────────────────────────────────────
 * Yahoo ส่งราคามาเป็น float เต็มความละเอียดของ IEEE754 เช่น 3745.7998046875 = 18 อักขระ
 * ต่อหนึ่งค่า × 4 ค่าต่อแท่ง คิดเป็น 107 ไบต์ต่อแท่ง วัดที่ 2,209 แท่งได้ 230.8 KB
 * ต่อคำตอบหนึ่งก้อน (gzip 72.9 KB) ปัดเหลือความละเอียดมาตรฐานของรีโปแล้วได้ 72.6 ไบต์
 * ต่อแท่ง = 156.6 KB (gzip 42.8 KB) โดยที่ไม่มีใครมองเห็นความต่าง —
 * กราฟวาดด้วย precision 2 (ดู priceFormat ใน GoldChart.tsx) ซึ่งหยาบกว่านี้ 100 เท่า
 *
 * การปัดเป็น monotonic (ปัดเข้ากริดคงที่) กรอบแท่งจึงไม่มีทางพลิก:
 * ถ้า h ≥ max(o,c) ก่อนปัด แล้ว round(h) ≥ max(round(o),round(c)) เสมอ
 * — แท่งที่ผ่านด่าน candle-sanitizer มาแล้วจะไม่กลายเป็นแท่งที่เป็นไปไม่ได้เพราะการปัด
 */
function toWire(c: CandleData, decimals: number): ChartBar | null {
  const ms = new Date(c.timestamp).getTime();
  if (!Number.isFinite(ms)) return null;
  const round = (v: number) => Number(v.toFixed(decimals));
  return {
    t: Math.floor(ms / 1000),
    o: round(c.open),
    h: round(c.high),
    l: round(c.low),
    c: round(c.close),
  };
}

/**
 * ทุกคำตอบต้องมีหัวแคชสั้น ๆ และห้ามให้ CDN ถือไว้
 *
 * `private` เพราะคำตอบผูกกับ session (route นี้ต้องล็อกอิน) — ตัวกลางที่แคชร่วมกัน
 * จะเสิร์ฟข้ามผู้ใช้ · `no-store` เพราะหน้าเว็บ poll เองอยู่แล้ว การให้เบราว์เซอร์
 * เก็บคำตอบไว้แม้แค่ไม่กี่วินาทีจะทำให้ "เวลาที่ดึงล่าสุด" บนจอโกหก
 * ชั้นแคชที่ยังมีอยู่จริงคือ Next Data Cache ฝั่ง server (CHART_CACHE_SEC วินาที)
 * ซึ่งบอกผู้ใช้ตรง ๆ ผ่านช่อง cacheSec ในคำตอบ
 */
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

const fail = (error: string, status: number) =>
  NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;

  // ── ตรวจ input ก่อนแตะอะไรทั้งสิ้น — ค่าที่ไม่รองรับต้องได้ 400 พร้อมเหตุผลภาษาไทย
  //    ห้ามถอยไปกรอบเวลาอื่นเงียบ ๆ เพราะผู้ใช้จะเห็นกราฟคนละกรอบกับที่ปุ่มบอก
  const tfKey = params.get('timeframe') ?? params.get('interval') ?? DEFAULT_TIMEFRAME_KEY;
  const tf = resolveTimeframe(tfKey);
  if (!tf) {
    return fail(`กรอบเวลา "${tfKey}" ไม่รองรับ — ใช้ได้แค่ 15m, 1H, 1D`, 400);
  }

  const symbol = String(params.get('symbol') ?? DEFAULT_SYMBOL).trim().toUpperCase();
  const target = ALLOWED.get(symbol);
  if (!target) {
    return fail(`ไม่รองรับสัญลักษณ์ "${symbol}" — ระบบนี้สแกนเฉพาะ ${[...ALLOWED.keys()].join(', ')}`, 400);
  }

  const base = {
    symbol: target.symbol,
    market: target.market,
    name: target.name,
    timeframe: tf.key,
    interval: tf.interval,
    range: tf.range,
    pollMs: tf.pollMs,
    cacheSec: CHART_CACHE_SEC,
  };

  // โหมด demo ไม่มี Supabase ให้ถามว่าใครล็อกอิน — ตอบข้อมูลจำลองไปเลยแบบเดียวกับ
  // route อื่นในรีโป (ผู้เรียกรู้ตัวจาก demo: true) แท่งจำลองไม่มีแท่งสดจึงส่ง forming: null
  const decimals = PRICE_DECIMALS(target.market);

  if (isDemoMode()) {
    const demoBars = generateCandleData(target.symbol, 3500, 250)
      .map((c) => toWire(c, decimals))
      .filter((b): b is ChartBar => b !== null)
      .slice(-CHART_MAX_BARS);
    return NextResponse.json(
      {
        success: true,
        demo: true,
        ...base,
        bars: demoBars,
        forming: null,
        quote: null,
        servedAt: new Date().toISOString(),
      },
      { headers: NO_STORE }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return fail('กรุณาเข้าสู่ระบบ', 401);
  }

  try {
    // อายุแคชสั้นกว่าค่าเริ่มต้น เพราะเลนนี้มีคนนั่งดูอยู่จริง (ดู CHART_CACHE_SEC)
    const chart = await fetchChart(
      target.symbol,
      target.market,
      tf.interval,
      tf.range,
      CHART_CACHE_SEC
    );

    // ตัดเหลือแท่งท้ายสุดตามเพดาน — ของเก่าที่เกินมาไม่มีใครได้ดู มีแต่ค่าเน็ต
    // (เหตุผลเต็ม + การพิสูจน์ว่าเพดานนี้ไม่กินหมุดของใบที่ยังเปิด อยู่ที่ CHART_MAX_BARS)
    // ตัดหลังแปลงเสมอ ไม่ใช่ก่อน — แท่งที่เวลาอ่านไม่ออกต้องถูกทิ้งก่อนนับ ไม่งั้น
    // จำนวนแท่งที่ส่งจริงจะน้อยกว่าเพดานโดยไม่มีใครรู้ว่าทำไม
    const bars = chart.candles
      .map((c) => toWire(c, decimals))
      .filter((b): b is ChartBar => b !== null)
      .slice(-CHART_MAX_BARS);

    // ไม่มีแท่งเลย = ต้นทางล่ม/ตอบรูปแบบที่อ่านไม่ออก (fetchChart กลืน error แล้วคืนก้อนว่าง)
    // ตอบ 502 ไม่ใช่ 200 พร้อม body ว่าง — หน้าเว็บต้องแยก "ตลาดไม่มีข้อมูล" ออกจาก
    // "เราดึงไม่สำเร็จ" ได้ ไม่งั้นผู้ใช้จะนั่งดูกราฟเปล่าโดยไม่รู้ว่าควรกดลองใหม่
    if (bars.length === 0) {
      return fail(
        `ดึงแท่งเทียน ${target.symbol} (${tf.key}) จากแหล่งข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง`,
        502
      );
    }

    // เรียงเวลาขึ้นและไม่ซ้ำ — ตัววาดกราฟโยน error ทั้งชุดถ้าเจอเวลาย้อนหรือซ้ำ
    // fetchChart คืนของเรียงอยู่แล้ว ด่านนี้จึงเป็นตัวกันของแปลกจากต้นทาง ไม่ใช่การเรียงใหม่
    // (เรียงใหม่เงียบ ๆ จะซ่อนอาการว่าต้นทางเพี้ยน ซึ่งเป็นสิ่งที่ต้องเห็น)
    for (let i = 1; i < bars.length; i++) {
      if (bars[i].t <= bars[i - 1].t) {
        return fail(
          `แท่งเทียนจากแหล่งข้อมูลเรียงเวลาผิดที่ตำแหน่ง ${i} — ไม่แสดงกราฟที่เชื่อไม่ได้`,
          502
        );
      }
    }

    // แท่งสดต้องอยู่ "หลัง" แท่งปิดใบสุดท้ายเสมอ ถ้าไม่ใช่แปลว่า Yahoo ส่งของทับกันมา
    // ทิ้งแท่งสดทิ้งดีกว่าเอาไปวางทับแท่งปิด (กราฟจะมีแท่งซ้อนที่อธิบายไม่ได้)
    const formingRaw = chart.formingCandle ? toWire(chart.formingCandle, decimals) : null;
    const forming = formingRaw && formingRaw.t > bars[bars.length - 1].t ? formingRaw : null;

    return NextResponse.json(
      {
        success: true,
        ...base,
        bars,
        forming,
        quote: chart.quote,
        servedAt: new Date().toISOString(),
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    return fail(errorMessage(err), 500);
  }
}
