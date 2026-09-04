import type { MarketPrice, CandleData } from '@/types';
import { DEMO_PRICES, generateCandleData } from './demo-data';
import { isDemoMode } from './supabase';
import { sanitizeCandles } from './candle-sanitizer';

/**
 * Market data fetcher using Yahoo Finance public chart API (v8).
 * ไม่ต้องใช้ API key
 *
 * หมายเหตุ: endpoint /v7/finance/quote ตอบ 401 แล้ว (Yahoo บังคับ cookie+crumb)
 * เราจึงดึงทั้งราคาปัจจุบันและแท่งเทียนจาก /v8/finance/chart ครั้งเดียวจบ
 */

const CHART_HOSTS = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart',
];

// '15m' อยู่ในชนิดนี้เพราะตัวสแกนจริง (scripts/scan-universe.mjs) ยิง interval=15m
// ผ่าน fetchChart มาตั้งแต่เลน 15m เปิด แต่ชนิดยังไม่เคยตามไปรับ — ผลคือ BAR_SECONDS
// ข้างล่างจะไม่มีช่องของมันถ้าไม่ประกาศไว้ที่นี่
export type ChartInterval = '15m' | '1h' | '1d' | '1wk';
export type ChartRange = '1mo' | '3mo' | '6mo' | '1y' | '2y';

/**
 * ความยาวหนึ่งแท่งเป็นวินาที — ใช้ตัดสินว่าแท่งท้ายสุด "ปิดครบคาบ" หรือยัง
 * (รายวันใช้เป็นเพดานบนเท่านั้น เพราะคาบจริงของมันคือรอบซื้อขาย ไม่ใช่ 24 ชม.เป๊ะ ๆ)
 */
export const BAR_SECONDS: Record<ChartInterval, number> = {
  '15m': 900,
  '1h': 3600,
  '1d': 86400,
  '1wk': 604800,
};

/** เบาะแสเรื่อง "รอบซื้อขาย" ที่ Yahoo ส่งมาใน meta — ทุกช่องเป็น epoch วินาที */
export interface BarSessionHints {
  /** meta.currentTradingPeriod.regular.start */
  start?: number | null;
  /** meta.currentTradingPeriod.regular.end */
  end?: number | null;
  /** meta.regularMarketTime — เวลาซื้อขายล่าสุด */
  lastTradeAt?: number | null;
}

/**
 * แท่งท้ายสุดของชุด "ปิดครบคาบแล้ว" หรือยัง
 *
 * เบาะแสรอบซื้อขายมีไว้ทำให้แท่งถูกนับว่าปิด **เร็วขึ้น** เท่านั้น ไม่มีทางทำให้ช้าลง
 * (บรรทัดแรกคือเพดานบน: ผ่านคาบเต็มไปแล้วยังไงก็ปิด) — ตั้งใจให้เป็นแบบนี้เพราะถ้า meta
 * ของ Yahoo เพี้ยนหรือหายไป ผลที่แย่ที่สุดคือ "รอนานกว่าที่ควร" ไม่ใช่ "เอาแท่งสดมาใช้"
 */
function tailBarClosed(ts: number, barSec: number, nowSec: number, session: BarSessionHints): boolean {
  if (nowSec >= ts + barSec) return true;
  // เบาะแสรอบซื้อขายเป็นของ "รอบวัน" จึงใช้ได้กับแท่งรายวันเท่านั้น
  // (รายสัปดาห์ไม่มีเบาะแสของคาบตัวเอง · รายชั่วโมง/15 นาทีมีคาบตายตัวอยู่แล้ว)
  //
  // ⚠ ข้อจำกัดที่รู้ตัว — เลน '1wk': แท่งรายสัปดาห์ปิดจริงตั้งแต่ตลาดปิดวันศุกร์ แต่บรรทัด
  //   ข้างบนจะนับว่ามันปิดก็ต่อเมื่อครบ 7 วันเต็ม (จันทร์ถัดไป) ช่วงศุกร์เย็น–จันทร์เช้า
  //   แท่งที่ปิดแล้วจึงถูกทิ้งเป็น "ยังก่อตัว" = อินดิเคเตอร์รายสัปดาห์ช้าไปหนึ่งแท่ง
  //   ยังไม่แก้เพราะ (ก) ไม่มีเส้นทางโปรดักชันไหนเรียก fetchChart ด้วย '1wk' เลย
  //   ชนิดนี้ประกาศไว้ล่วงหน้าเฉย ๆ  (ข) meta ของ Yahoo ไม่มีเบาะแสว่า "สัปดาห์นี้
  //   ซื้อขายวันสุดท้ายเมื่อไหร่" การเดาเอาจะทำให้แท่งของสัปดาห์ที่ยังเดินอยู่ถูกนับว่าปิด
  //   ซึ่งคือทิศที่อันตราย (เอาแท่งสดไปคำนวณ) ตรงข้ามกับหลักของฟังก์ชันนี้ที่ยอมช้า
  //   ดีกว่ายอมผิด — ถ้าวันไหนเปิดเลนรายสัปดาห์จริง ต้องกลับมาแก้พร้อมข้อมูลรอบซื้อขาย
  if (barSec !== 86400) return false;
  const start = Number(session.start);
  // มีรอบใหม่เริ่มไปแล้ว = รอบของแท่งนี้จบไปแล้วแน่นอน
  // (หุ้นไทยตอนตลาดปิด Yahoo ชี้ start ไปรอบพรุ่งนี้ — กรณีนี้จึงเข้าทางนี้พอดี)
  if (Number.isFinite(start) && ts < start) return true;
  const end = Number(session.end);
  if (Number.isFinite(end) && nowSec >= end) return true;
  return false;
}

/**
 * แยกดัชนีของแท่งที่ "ปิดแล้ว" ออกจากแท่งที่ "ยังก่อตัวอยู่"
 *
 * ── บั๊กที่ฟังก์ชันนี้มาปิด (เจ้าของรายงานเมื่อ 2026-09-01) ────────────────────────
 * "สัญญาณที่แจ้งเตือนมาไม่ตรงกับสถานะกราฟปัจจุบัน" — ตัวสแกนยิงที่นาทีที่ 2/17/32/47
 * จึงหยิบแท่ง 15m ที่เพิ่งเปิดมา 2 นาทีไปคำนวณเหมือนเป็นแท่งสมบูรณ์ RSI/MACD/แพทเทิร์น
 * ทั้งชุดจึงคำนวณจากแท่งที่ยังเปลี่ยนได้ พอแท่งนั้นปิดจริง ค่าที่คำนวณไว้ก็ไม่ตรงกับ
 * กราฟที่เจ้าของเปิดดูอีกต่อไป = สัญญาณอ้างกราฟที่ไม่เคยมีอยู่จริง
 *
 * เกณฑ์ลอกมาจาก scripts/collect-15m.mjs (parseChart) ซึ่งวัดกับคำตอบจริงของ Yahoo แล้ว:
 *   1. ts % 60 !== 0        → Yahoo ประทับแท่งสดด้วยเวลาซื้อขายล่าสุดตรง ๆ (มีเศษวินาที)
 *                             ของจริงที่วัดได้ 2026-09-03: แท่งท้ายสุด 06:09:52Z
 *   2. ts === regularMarketTime → Yahoo บอกเองว่าแท่งนี้คือแท่งของราคาล่าสุด
 *   3. ยังปิดไม่ครบคาบ      → ตรวจ "เฉพาะแท่งท้ายสุดที่เหลือ" ใบเดียว
 *
 * ข้อ 3 ต่างจาก collect-15m ตรงที่ตรวจใบเดียว ไม่ใช่ทุกใบ — จำเป็นเพราะไฟล์นี้รับ
 * รายวันด้วย และแท่งรายวันของ Yahoo ประทับที่ "เวลาเปิดรอบ" ซึ่งห่างจากเวลาปิดรอบ
 * ไม่เท่ากับ 24 ชม. (วัดจริง GC=F: start 04:00Z → end 03:59Z ของวันถัดไป · หุ้นไทยห่างกัน
 * ~17 ชม.) ถ้าตรวจทุกใบด้วยกติกา now >= ts + 24 ชม. แท่งของ "เมื่อวานที่ปิดไปแล้ว"
 * จะโดนทิ้งไปด้วยทุกวัน แล้วอินดิเคเตอร์รายวันจะขยับช้าไปหนึ่งแท่งโดยไม่มีใครเห็น
 * ตรวจใบเดียวปลอดภัยเพราะแท่งอินทราเดย์ที่เรียงติดกันเป็นไปไม่ได้ที่จะยังไม่ปิดสองใบซ้อน
 * (ใบก่อนหน้าห่างอย่างน้อยหนึ่งคาบเสมอ)
 */
export function splitClosedBars(
  timestamps: readonly (number | null | undefined)[],
  interval: ChartInterval,
  nowMs: number,
  session: BarSessionHints = {}
): { closed: number[]; forming: number[] } {
  const barSec = BAR_SECONDS[interval] ?? 86400;
  const nowSec = Math.floor(nowMs / 1000);
  const lastTradeAt = Number(session.lastTradeAt);

  const closed: number[] = [];
  const forming: number[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const ts = Number(timestamps[i]);
    if (!Number.isFinite(ts)) {
      forming.push(i);
      continue;
    }
    if (ts % 60 !== 0 || (Number.isFinite(lastTradeAt) && lastTradeAt === ts)) {
      forming.push(i);
      continue;
    }
    closed.push(i);
  }

  if (closed.length > 0) {
    const lastIdx = closed[closed.length - 1];
    if (!tailBarClosed(Number(timestamps[lastIdx]), barSec, nowSec, session)) {
      closed.pop();
      forming.push(lastIdx);
    }
  }

  forming.sort((a, b) => a - b);
  return { closed, forming };
}

/**
 * Map our internal symbol to a Yahoo Finance symbol
 */
export function toYahooSymbol(symbol: string, market: string): string {
  const s = symbol.trim().toUpperCase();

  if (market === 'GOLD') {
    if (s === 'XAUUSD' || s === 'GOLD') return 'GC=F';
    if (s === 'XAGUSD' || s === 'SILVER') return 'SI=F';
    return s;
  }
  if (market === 'FOREX') {
    return s.endsWith('=X') ? s : `${s}=X`;
  }
  if (market === 'TH_STOCK') {
    return s.endsWith('.BK') ? s : `${s}.BK`;
  }
  if (market === 'CRYPTO') {
    return s.includes('-') ? s : `${s}-USD`;
  }
  return s;
}

interface ChartPayload {
  /**
   * ราคาสด — ประกอบจาก meta.regularMarketPrice เป็นหลัก จึงไม่ได้รับผลกระทบจากการ
   * ตัดแท่งที่ยังก่อตัวออกจาก candles (เจตนา: ผู้ใช้ต้องเห็นราคาสด ไม่ใช่ราคาเก่า 15 นาที)
   */
  quote: MarketPrice | null;
  /**
   * **แท่งที่ปิดแล้วเท่านั้น** — ชุดที่ใช้คำนวณอินดิเคเตอร์/แพทเทิร์น/สัญญาณ
   * แท่งที่ยังก่อตัวอยู่ถูกแยกไปที่ formingCandle ข้างล่าง (ดู splitClosedBars)
   */
  candles: CandleData[];
  /**
   * แท่งที่ "ยังก่อตัวอยู่" ใบล่าสุด — null เมื่อรอบซื้อขายปิดแล้วหรือ Yahoo ยังไม่ส่งมา
   *
   * มีไว้ให้ผู้เรียกที่ต้องการ "ของสดของรอบปัจจุบัน" จริง ๆ ไม่ใช่ให้เอาไปคำนวณสัญญาณ
   * ผู้ใช้จริงตอนนี้คือ /api/cron/monitor-positions ที่ใช้ timestamp ของแท่งรอบปัจจุบัน
   * เป็นเบาะแสหา sessionStart — ถ้ามันได้แท่งของ "เมื่อวาน" ไปแทน sessionStart จะเลื่อน
   * ไปข้างหลัง แล้วออเดอร์จะถูกตรวจด้วยช่วง [low_24h, high_24h] บ่อยกว่าที่ควร = ปิดไม้ผิด
   */
  formingCandle: CandleData | null;
  /**
   * meta.currentTradingPeriod.regular.start เป็น ISO — เวลาเปิดรอบซื้อขายตาม Yahoo
   * ส่งดิบออกไปให้ผู้เรียกตัดสินเอง เพราะเชื่อเดี่ยว ๆ ไม่ได้ทุกตลาด
   * (หุ้นไทยตอนตลาดปิด ค่านี้ชี้ไปรอบพรุ่งนี้) — ดู resolveSessionStart ใน position-monitor.ts
   */
  regularStart: string | null;
}

const EMPTY: ChartPayload = { quote: null, candles: [], formingCandle: null, regularStart: null };

/**
 * อายุแคชเริ่มต้นของคำตอบจาก Yahoo (วินาที) — ค่าที่ทุกเส้นทางเดิมใช้มาตลอด
 *
 * 5 นาทีเหมาะกับผู้เรียกฝั่งเบื้องหลัง (ตัวสแกนรอบละ 15 นาที · ตัวเฝ้าออเดอร์) เพราะ
 * พวกมันคิดจาก "แท่งที่ปิดแล้ว" ซึ่งเปลี่ยนค่าแค่ตอนแท่งปิด แคชนานจึงไม่ทำให้ผลเพี้ยน
 * มีแต่ประหยัดคำขอ — ห้ามลดค่านี้เพื่อผู้เรียกรายเดียว ให้ส่ง revalidateSec เข้ามาแทน
 */
export const CHART_REVALIDATE_SEC = 300;

/**
 * ดึง chart จาก Yahoo — ได้ทั้ง quote และ candles ในคำขอเดียว
 * ลอง query1 ก่อน ถ้าไม่ติดค่อยไป query2
 *
 * `revalidateSec` เป็นทางเลือกและ**ค่าเริ่มต้นเท่าของเดิมเป๊ะ** (300) ผู้เรียกเดิมทุกตัว
 * จึงได้พฤติกรรมเดียวกับก่อนมีพารามิเตอร์นี้ทุกประการ · มีไว้ให้เส้นทางที่ผู้ใช้
 * "นั่งดูอยู่หน้าจอ" (หน้ากราฟ) ขอคำตอบที่สดกว่าได้ — Next Data Cache แช่คำตอบไว้
 * ตามค่านี้ ต่อให้ route ตั้ง dynamic ยังไงก็ไม่ทะลุ ถ้าไม่ลดตรงนี้ ราคาบนกราฟจะค้าง
 * เป็นก้อนละ 5 นาทีจนดูเหมือนกราฟแข็ง
 */
export async function fetchChart(
  symbol: string,
  market: string,
  interval: ChartInterval = '1d',
  range: ChartRange = '1y',
  revalidateSec: number = CHART_REVALIDATE_SEC
): Promise<ChartPayload> {
  const yahooSymbol = toYahooSymbol(symbol, market);
  // กันค่าเพี้ยน (NaN/ติดลบ) ไม่ให้กลายเป็น cache ที่ไม่มีวันหมดอายุ
  const revalidate = Number.isFinite(revalidateSec) && revalidateSec >= 0
    ? Math.floor(revalidateSec)
    : CHART_REVALIDATE_SEC;

  for (const host of CHART_HOSTS) {
    try {
      const res = await fetch(
        `${host}/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          next: { revalidate },
        }
      );
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const meta = result.meta ?? {};

      // epoch วินาที → ISO ให้ผู้เรียกใช้ต่อได้ทันที ไม่มีค่าก็ปล่อย null ไม่เดา
      const regularStartEpoch = Number(meta.currentTradingPeriod?.regular?.start);
      const regularStart = Number.isFinite(regularStartEpoch)
        ? new Date(regularStartEpoch * 1000).toISOString()
        : null;
      const timestamps: number[] = result.timestamp || [];
      const ohlc = result.indicators?.quote?.[0];
      if (!ohlc) continue;

      // ── แยกแท่งที่ปิดแล้วออกจากแท่งที่ยังก่อตัว ก่อนประกอบเป็น CandleData ────────
      // ลำดับนี้ลอกจาก scripts/collect-15m.mjs (ตัด → ประกอบ → ด่านตรวจแท่ง) โดยตั้งใจ
      // ที่สำคัญคือ "ตัดก่อนเข้าด่าน": กติกา interior spike ของด่านยกเว้นแท่งสุดท้าย
      // ให้เสมอ (ไม่มีเพื่อนบ้านขวาให้เทียบ) — ถ้าตัดทีหลัง ข้อยกเว้นนั้นจะไปตกกับแท่งสด
      // ซึ่งเราทิ้งอยู่แล้ว แปลว่าแท่งปิดใบสุดท้ายจะไม่เคยถูกยกเว้นตามที่ด่านตั้งใจ
      const split = splitClosedBars(timestamps, interval, Date.now(), {
        start: Number(meta.currentTradingPeriod?.regular?.start),
        end: Number(meta.currentTradingPeriod?.regular?.end),
        lastTradeAt: Number(meta.regularMarketTime),
      });

      const barAt = (i: number): CandleData => ({
        timestamp: new Date(Number(timestamps[i]) * 1000).toISOString(),
        open: ohlc.open?.[i] ?? 0,
        high: ohlc.high?.[i] ?? 0,
        low: ohlc.low?.[i] ?? 0,
        close: ohlc.close?.[i] ?? 0,
        volume: ohlc.volume?.[i] ?? 0,
      });

      const rawCandles: CandleData[] = split.closed.map(barAt).filter((c) => c.close > 0);

      // แท่งสดใบล่าสุด — ไม่เข้าชุดคำนวณ แต่ยังต้องส่งออกไป (ดูคอมเมนต์ที่ ChartPayload)
      const formingBars = split.forming
        .filter((i) => Number.isFinite(Number(timestamps[i])))
        .map(barAt)
        .filter((c) => c.close > 0);
      const formingCandle = formingBars.length > 0 ? formingBars[formingBars.length - 1] : null;

      // ด่านตรวจแท่ง — บรรทัดข้างบนคือคอขวดเดียวที่ raw JSON ของ Yahoo กลายเป็น CandleData
      // ของทุกเส้นทางโปรดักชัน (ตัวสแกน GitHub Actions โหลดไฟล์นี้ตัวจริง + ทุก API route)
      // Yahoo ส่งแท่งเป็นไปไม่ได้มาจริง ~3.3% ของแคชวิจัย จึงต้องกรองตรงนี้ครั้งเดียวให้คลุมหมด
      // เหตุผลเต็มและเกณฑ์ต่อตลาดอยู่ใน candle-sanitizer.ts
      const { candles, dropped, repaired } = sanitizeCandles(rawCandles, market);
      if (dropped > 0 || repaired > 0) {
        // รายงานเป็น warning ไม่ใช่ error — แท่งเสียประปรายเป็นเรื่องปกติของ Yahoo
        // แต่ต้องเห็นใน log เสมอ ข้อมูลเสียที่ถูกซ่อมเงียบ ๆ จะไม่มีใครตามไปแก้ที่ต้นทาง
        console.warn(`fetchChart ${yahooSymbol} ${interval}: ซ่อมกรอบ ${repaired} แท่ง · ทิ้งแท่งเสีย ${dropped} แท่ง`);
      }

      // ราคาสดยังมาจาก meta เป็นอันดับแรกเหมือนเดิม · ถ้า meta ไม่มี ให้ถอยไปหาแท่งสด
      // ก่อนแท่งปิด ไม่งั้นการตัดแท่งสดออกจะทำให้ราคาบนหน้าเว็บย้อนไปหนึ่งแท่งเต็ม ๆ
      const price = Number(
        meta.regularMarketPrice ?? formingCandle?.close ?? candles[candles.length - 1]?.close
      );
      if (!price || !Number.isFinite(price)) return { quote: null, candles, formingCandle, regularStart };

      // ใช้แท่งก่อนหน้าเป็นฐานคำนวณการเปลี่ยนแปลง (เชื่อถือได้กว่า meta.chartPreviousClose
      // ซึ่งเป็นราคาปิดก่อนเริ่มช่วงที่ขอมา ไม่ใช่ของเมื่อวาน)
      //
      // ฐานที่ถูกคือ "แท่งก่อนแท่งที่ราคาสดอยู่" เสมอ — เมื่อแท่งท้ายสุดที่ Yahoo ส่งมายัง
      // ก่อตัวอยู่ ราคาสดเป็นของแท่งนั้น ฐานจึงเป็นแท่งปิดใบสุดท้าย (= index −2 ของชุดเดิม
      // ก่อนตัดพอดี ตัวเลขจึงเท่าเดิมทุกประการ) · เมื่อไม่มีแท่งก่อตัว ราคาสดคือราคาปิด
      // ของแท่งปิดใบสุดท้าย ฐานจึงต้องถอยไปอีกหนึ่งใบ
      // ตัดสินจาก "ดัชนีสุดท้ายของชุดดิบอยู่ฝั่งก่อตัวไหม" ไม่ใช่จาก formingCandle
      // เพราะแท่งก่อตัวที่ Yahoo ส่ง close เป็น null มาจะถูกกรองทิ้งจนเหลือ null ทั้งที่
      // ราคาสดยังเป็นของรอบนั้นอยู่
      const lastRawIsForming = timestamps.length > 0 && split.forming.includes(timestamps.length - 1);
      const prevClose = lastRawIsForming
        ? candles[candles.length - 1]?.close ?? Number(meta.chartPreviousClose ?? price)
        : candles.length >= 2
          ? candles[candles.length - 2].close
          : Number(meta.chartPreviousClose ?? price);
      const change = price - prevClose;

      // ช่องที่ต้องเป็น "ของรอบปัจจุบัน" ให้ถอยไปหาแท่งสดก่อน แล้วค่อยถอยไปแท่งปิด
      // (พฤติกรรมเดิมเป๊ะ: ก่อนแก้ ค่าพวกนี้ตกไปหา candles ใบท้ายสุด ซึ่งก็คือแท่งสดใบนี้)
      const liveCandle = formingCandle ?? candles[candles.length - 1] ?? null;

      const quote: MarketPrice = {
        symbol,
        name: meta.longName || meta.shortName || symbol,
        market: market as MarketPrice['market'],
        price,
        change,
        change_percent: prevClose ? (change / prevClose) * 100 : 0,
        volume: Number(meta.regularMarketVolume ?? liveCandle?.volume ?? 0),
        high_24h: Number(meta.regularMarketDayHigh ?? liveCandle?.high ?? price),
        low_24h: Number(meta.regularMarketDayLow ?? liveCandle?.low ?? price),
        updated_at: new Date().toISOString(),
      };

      return { quote, candles, formingCandle, regularStart };
    } catch (err) {
      console.error('fetchChart error:', yahooSymbol, err);
    }
  }

  return EMPTY;
}

/**
 * ราคาปัจจุบันตัวเดียว
 */
export async function fetchQuote(symbol: string, market: string): Promise<MarketPrice | null> {
  if (isDemoMode()) {
    return DEMO_PRICES.find((p) => p.symbol === symbol) ?? null;
  }
  const { quote } = await fetchChart(symbol, market, '1d', '3mo');
  return quote;
}

/**
 * แท่งเทียน — default 1 ปี เพื่อให้ MA200 มีความหมายจริง
 */
export async function fetchCandles(
  symbol: string,
  market: string,
  interval: ChartInterval = '1d',
  range: ChartRange = '1y'
): Promise<CandleData[]> {
  if (isDemoMode()) {
    const price = DEMO_PRICES.find((p) => p.symbol === symbol);
    return generateCandleData(symbol, price?.price || 100, 250);
  }
  const { candles } = await fetchChart(symbol, market, interval, range);
  return candles;
}

/**
 * ดึงราคาหลายตัวพร้อมกัน (จำกัดความถี่เพื่อไม่ให้โดน Yahoo throttle)
 */
export async function fetchQuotes(
  symbols: Array<{ symbol: string; market: string }>
): Promise<MarketPrice[]> {
  if (isDemoMode()) {
    return DEMO_PRICES.filter((p) => symbols.some((s) => s.symbol === p.symbol));
  }

  const out: MarketPrice[] = [];
  const BATCH = 5;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((s) => fetchQuote(s.symbol, s.market)));
    for (const r of results) if (r) out.push(r);
  }
  return out;
}
