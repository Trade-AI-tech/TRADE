// supabase/functions/scan-signals/index.ts
//
// สแกนตลาดตาม watchlist ของผู้ใช้ทุกคน → สร้างสัญญาณ BUY/SELL (1D + 1H) → บันทึกลง signals
// → ส่ง Telegram ให้คนที่ตั้งค่าไว้ (ถ้ามี)
//
// ── ⚠ ไฟล์นี้ "ไม่ส่ง Web Push" อีกต่อไป (แก้เมื่อ 2026-08-17) ────────────────
// เดิมตรงนี้วนยิง push ทีละสัญญาณ (หนึ่งสัญญาณ = หนึ่งครั้งที่โทรศัพท์สั่น) ซึ่งขัดสเปก
// ของเจ้าของตรง ๆ ว่า "ชั่วโมงนึงแจ้งเตือน 1 ครั้ง" และไฟล์นี้เป็น Deno ไฟล์เดียวจบ
// จึง import ตัวรวมชุด (src/lib/push-digest.ts) มาใช้ไม่ได้ — ทางเลือกมีแค่
//   (ก) ก๊อปตรรกะรวมชุดมาเป็นสำเนาที่สาม แล้วเฝ้าไม่ให้เพี้ยนตลอดไป หรือ
//   (ข) ไม่ส่งจากที่นี่ ปล่อยให้แถวใน signals ค้างเป็น push_sent = false (ค่าเริ่มต้น)
//       แล้วให้ "ตัวส่งกลาง" ตัวเดียวของระบบเก็บไปแจ้งเป็นชุดเดียวต่อชั่วโมง
// เลือก (ข) เพราะสำเนาที่สามคือหนี้ที่เพี้ยนเงียบได้ (มีเครื่องตรวจ parity คุมแค่
// indicators/signal-engine เท่านั้น ไม่ได้คุมตรรกะแจ้งเตือน)
//
// ตัวส่งกลางตอนนี้คือ scripts/scan-universe.mjs (รันจาก .github/workflows/scan-universe.yml
// ทุกชั่วโมง) ซึ่งเรียก sendPendingSignalsToUser ใน src/lib/push-server.ts
//
// ⚠ ผลข้างเคียงที่ต้องรู้ก่อน deploy ไฟล์นี้: ถ้าเอาไฟล์นี้ขึ้นแล้วตั้ง pg_cron ให้ยิง
//   โดยที่ตัวส่งกลางไม่ได้ทำงาน (เช่นโควตา GitHub Actions หมด) จะได้สัญญาณใหม่ในฐานข้อมูล
//   แต่ไม่มีแจ้งเตือนเด้งเลย และถ้ายังไม่ได้รัน migration 006 (วัดจริง 2026-08-17: ยังไม่ได้รัน)
//   ตัวส่งกลางจะแจ้งเฉพาะสัญญาณที่ "รอบของมันเองสแกนเจอ" เท่านั้น = ของที่ไฟล์นี้สร้างจะเงียบ
//   ทางที่ถูกคือรัน 006 ก่อน แล้วค่อยพิจารณาว่าจะมีตัวสแกนสองตัวไปทำไม
//
// ── ทำไมต้องมีไฟล์นี้ ───────────────────────────────────────────────────────
// ตัวสแกนเดิมคือ Next.js route /api/cron/scan-markets บน Vercel ซึ่งรันได้แค่วันละครั้ง
// (Vercel Cron ของแผน Hobby จำกัดความถี่ และบัญชีนี้เคยถูกระงับเพราะเกินโควตามาแล้วรอบหนึ่ง)
// สัญญาณจากแท่งรายชั่วโมงต้องการรอบสแกนทุกชั่วโมง จึงย้ายงานสแกนหลักมาไว้บน
// Supabase Edge Function (ผู้ใช้จ่ายแผน Pro อยู่แล้ว: Edge Functions + pg_cron + pg_net)
// route ฝั่ง Vercel ยังอยู่และทำงานวันละครั้งเหมือนเดิม — ตัวกันสัญญาณซ้ำของทั้งสองระบบ
// อ่านจากตาราง signals เดียวกัน จึงไม่สร้างสัญญาณซ้ำข้ามกันเอง
//
// ── วิธีนำขึ้น (deploy ผ่านหน้า Dashboard เท่านั้น) ─────────────────────────
// เครื่องผู้ใช้ไม่มี SUPABASE_ACCESS_TOKEN จึงรัน `supabase functions deploy` ไม่ได้
// ต้องไปที่ Dashboard → Edge Functions → Create function → ชื่อ `scan-signals`
// แล้ววางเนื้อไฟล์นี้ทั้งไฟล์ลงไป
// ด้วยเหตุนี้ไฟล์นี้จึงต้อง **self-contained ทั้งไฟล์** import ได้เฉพาะ URL / npm: / jsr:
// ห้าม import ไฟล์ในโปรเจกต์ด้วย relative path เพราะบน Dashboard ไม่มีไฟล์พวกนั้นอยู่
//
// ── ตัวแปรลับที่ต้องตั้ง (Dashboard → Edge Functions → Secrets) ─────────────
//   MONITOR_SECRET    = สตริงสุ่มยาว ๆ — ใช้ค่าเดียวกับของ monitor-positions ได้เลย
//                       (ฝั่งคนตั้ง pg_cron จะได้เก็บใน Vault ชุดเดียวไม่ต้องจำสองค่า)
//   ส่วน SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY แพลตฟอร์มใส่ให้อัตโนมัติ ไม่ต้องตั้งเอง
//
//   ไม่ต้องตั้ง VAPID_* ให้ฟังก์ชันนี้แล้ว (ไม่ได้ส่ง push จากที่นี่) — กุญแจ VAPID
//   ยังจำเป็นสำหรับตัวส่งกลางฝั่ง Node เท่านั้น
//
// ── วิธีเรียก / การตั้งเวลา ─────────────────────────────────────────────────
// ตั้ง pg_cron + pg_net ยิงทุกชั่วโมงตามแบบแผนเดียวกับ supabase/scripts/schedule_monitor.sql
// (Vault เก็บ url / secret / anon key แล้วประกอบ header ตอนยิง) — ส่ง secret ได้ 2 ทาง:
//   1) x-monitor-secret: <MONITOR_SECRET>        ← แนะนำทางนี้
//   2) authorization: Bearer <MONITOR_SECRET>    ← เผื่อทดสอบตอนปิด Verify JWT เท่านั้น
//
// ⚠ สวิตช์ "Verify JWT" ของ Edge Function เปิดเป็นค่าเริ่มต้น — **ปล่อยเปิดไว้ อย่าไปปิด**
//   ประตูหน้าของ Supabase จะบังคับให้ header `authorization` เป็น JWT ของโปรเจกต์
//   (anon key / service role key) และปฏิเสธคำขอ **ก่อน** โค้ดในไฟล์นี้ได้ทำงานเลย
//   คนยิงจึงต้องแนบ anon key มาทาง authorization เพื่อผ่านด่านนั้น แล้วส่ง MONITOR_SECRET
//   ตัวจริงมาทาง x-monitor-secret — โค้ดอ่าน x-monitor-secret ก่อน authorization เสมอ
//   สอง header จึงอยู่ด้วยกันได้ · ปิด Verify JWT เมื่อไหร่ ใครก็ยิงฟังก์ชันได้โดยไม่ต้องมี
//   key ของโปรเจกต์ เหลือ MONITOR_SECRET เป็นด่านเดียว
//
// ไม่ได้ตั้งค่า CORS ไว้โดยตั้งใจ เพราะตัวเรียกคือ pg_cron/pg_net ที่ยิงจากฝั่งเซิร์ฟเวอร์
// ไม่ใช่เบราว์เซอร์ — ไม่มีเหตุผลให้หน้าเว็บใดสั่งสแกนแล้วยิงแจ้งเตือนถึงผู้ใช้ทุกคนได้

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ═══════════════════════════════════════════════════════════════════════════
// ชนิดข้อมูลที่ใช้ในไฟล์นี้
//
// ปกติมาจาก @/types แต่ Deno resolve path alias ของ Next.js ไม่ได้ และ Dashboard
// ก็มองไม่เห็นไฟล์นั้น จึงประกาศไว้ตรงนี้แทน
// Signal ประกาศครบทุก field เพราะ generateSignal ในบล็อกข้างล่างคืนอ็อบเจกต์เต็มก้อน
// และแถวนั้นถูก insert ลงตาราง signals ทั้งแถว
// ═══════════════════════════════════════════════════════════════════════════

type MarketType = 'GOLD' | 'FOREX' | 'TH_STOCK' | 'US_STOCK' | 'CRYPTO';
type SignalAction = 'BUY' | 'SELL' | 'HOLD' | 'CLOSE';
type SignalStrength = 'weak' | 'moderate' | 'strong' | 'very_strong';
type SignalStatus = 'active' | 'triggered' | 'expired' | 'cancelled';

interface AlertPreferences {
  buy_signals: boolean;
  sell_signals: boolean;
  stop_loss_hit: boolean;
  take_profit_hit: boolean;
  news_alerts: boolean;
  strong_signals_only?: boolean;
}

interface MarketPrice {
  symbol: string;
  name: string;
  market: MarketType;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  high_24h: number;
  low_24h: number;
  updated_at: string;
}

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SignalReason {
  type: 'technical' | 'news' | 'pattern' | 'fundamental';
  label: string;
  detail: string;
  weight: number;
}

interface Signal {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  market: MarketType;
  action: SignalAction;
  strength: SignalStrength;
  status: SignalStatus;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  current_price: number;
  confidence: number;
  timeframe: string;
  reasons: SignalReason[];
  indicators: Record<string, number>;
  news_sentiment: number | null;
  telegram_sent: boolean;
  expires_at: string | null;
  created_at: string;
}

/** แถว watchlist เฉพาะ field ที่ตัวสแกนใช้จริง */
interface WatchlistRow {
  user_id: string;
  symbol: string;
  name: string;
  market: MarketType;
}

interface TelegramProfileRow {
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
  alert_preferences: Partial<AlertPreferences> | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// สำเนาตรรกะวิเคราะห์จาก src/lib/indicators.ts และ src/lib/signal-engine.ts
//
// สองบล็อกที่คั่นด้วย marker ข้างล่างเป็นสำเนา "คำต่อคำ" ของไฟล์ต้นทาง
// ตัดออกเฉพาะบรรทัด import ส่วนหัวของแต่ละไฟล์ (สองไฟล์นี้ import ชนิดจาก '@/types'
// และ import หากันเอง ซึ่งพออยู่ในไฟล์เดียวกันแล้วไม่จำเป็น และ Deno ก็ resolve ไม่ได้)
// ชนิดที่เคยมาจาก '@/types' ประกาศไว้ข้างบนแทน — ลำดับบล็อก: indicators มาก่อน
// เพราะ signal-engine เรียกใช้ฟังก์ชันในนั้น
//
// ทำไมต้องสำเนาแทนที่จะ import: การ deploy ทำผ่านหน้า Dashboard ด้วยการวางโค้ดไฟล์เดียว
// ตัว Dashboard มองไม่เห็นไฟล์อื่นในโปรเจกต์ จึง import ด้วย relative path ไม่ได้
//
// ⚠ กฎเหล็ก: **แก้ที่ไหนต้องแก้อีกที่เสมอ**
//   นี่คือกฎที่ชี้ขาดว่าสัญญาณ BUY/SELL และระดับ SL/TP ของผู้ใช้เป็นตัวเลขไหน
//   ถ้าสองที่นี้ไม่ตรงกัน เว็บกับตัวสแกนจะให้สัญญาณคนละชุดโดยไม่มีใครรู้
//   ห้ามเขียนใหม่ ห้ามย่อ ห้าม "ปรับให้อ่านง่ายขึ้น" ในบล็อกทั้งสองเด็ดขาด
//
// สัญญาสำหรับสคริปต์ตรวจ drift (ตกลงกันแล้วทั้งสองฝั่ง):
//   ดึงข้อความระหว่างคู่ marker ของแต่ละไฟล์ (ไม่นับตัว marker เอง) มา .trim()
//   แล้วเทียบกับเนื้อไฟล์ต้นทางที่ "ตัดบรรทัด import ส่วนหัวออกแล้ว .trim()"
//   ต้องตรงกันทุกตัวอักษร ไม่ตรง = ล้มด้วย exit code ไม่เป็นศูนย์
//
//   ⚠ รูปแบบ marker ดูจากบรรทัดจริงที่ครอบบล็อกข้างล่างเท่านั้น
//     ห้ามยกข้อความของ marker มาเขียนซ้ำในคอมเมนต์ไหนก็ตามของไฟล์นี้
//     เพราะจะเกิดตัวคั่นปลอมให้สคริปต์ดึงบล็อกผิดก้อน
// ═══════════════════════════════════════════════════════════════════════════

// >>> BEGIN COPY OF src/lib/indicators.ts — ห้ามแก้เฉพาะที่นี่ ต้องแก้ต้นฉบับด้วย
/**
 * Technical indicators — pure functions, no dependencies
 * คำนวณ RSI, MACD, MA, Bollinger Bands, Support/Resistance
 *
 * กติกา: ช่วงที่ยังมีข้อมูลไม่พอจะคืน NaN เสมอ (ไม่เดาค่า)
 * ผู้เรียกต้องเช็ค Number.isFinite ก่อนใช้
 */

export function SMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j];
    result.push(sum / period);
  }
  return result;
}

/**
 * EMA มาตรฐาน — seed ด้วย SMA ของ period แรก และคืน NaN ก่อนหน้านั้น
 * รองรับ input ที่มี NaN นำหน้า (เช่น MACD line) โดยข้ามไปเริ่มที่ค่าจริงตัวแรก
 */
export function EMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  const start = values.findIndex((v) => Number.isFinite(v));
  if (start === -1 || values.length - start < period) return result;

  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = start; i < start + period; i++) sum += values[i];
  let ema = sum / period;
  result[start + period - 1] = ema;

  for (let i = start + period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

/**
 * RSI แบบ Wilder smoothing (ตรงกับที่ TradingView / MT4 ใช้)
 */
export function RSI(values: number[], period: number = 14): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function MACD(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = EMA(values, fast);
  const emaSlow = EMA(values, slow);
  const macdLine = emaFast.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(emaSlow[i]) ? v - emaSlow[i] : NaN
  );
  const signalLine = EMA(macdLine, signal);
  const histogram = macdLine.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(signalLine[i]) ? v - signalLine[i] : NaN
  );
  return { macdLine, signalLine, histogram };
}

export function BollingerBands(values: number[], period = 20, stdDev = 2) {
  const ma = SMA(values, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { upper.push(NaN); lower.push(NaN); continue; }
    let sumSq = 0;
    for (let j = 0; j < period; j++) {
      const diff = values[i - j] - ma[i];
      sumSq += diff * diff;
    }
    const sd = Math.sqrt(sumSq / period);
    upper.push(ma[i] + stdDev * sd);
    lower.push(ma[i] - stdDev * sd);
  }
  return { upper, middle: ma, lower };
}

/**
 * Support & Resistance — find swing highs/lows
 */
export function findSupportResistance(candles: CandleData[], lookback = 5) {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const supports: number[] = [];
  const resistances: number[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingHigh = true, isSwingLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isSwingHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isSwingLow = false;
    }
    if (isSwingHigh) resistances.push(highs[i]);
    if (isSwingLow) supports.push(lows[i]);
  }

  // Get most recent 3 unique levels, sorted
  const uniq = (arr: number[]) => [...new Set(arr.map(v => Number(v.toFixed(4))))];
  return {
    supports: uniq(supports).slice(-3).sort((a, b) => b - a),
    resistances: uniq(resistances).slice(-3).sort((a, b) => a - b),
  };
}

/**
 * Candlestick patterns detection
 */
export function detectPatterns(candles: CandleData[]): string[] {
  if (candles.length < 3) return [];
  const patterns: string[] = [];
  const [, prev1, curr] = candles.slice(-3);

  const body = (c: CandleData) => Math.abs(c.close - c.open);
  const range = (c: CandleData) => c.high - c.low;
  const isBullish = (c: CandleData) => c.close > c.open;
  const isBearish = (c: CandleData) => c.close < c.open;

  // Bullish Engulfing
  if (isBearish(prev1) && isBullish(curr) &&
      curr.open < prev1.close && curr.close > prev1.open) {
    patterns.push('Bullish Engulfing');
  }

  // Bearish Engulfing
  if (isBullish(prev1) && isBearish(curr) &&
      curr.open > prev1.close && curr.close < prev1.open) {
    patterns.push('Bearish Engulfing');
  }

  // Hammer (long lower shadow, small body, little upper shadow)
  const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
  const upperShadow = curr.high - Math.max(curr.open, curr.close);
  if (lowerShadow > body(curr) * 2 && upperShadow < body(curr) * 0.5) {
    patterns.push('Hammer');
  }

  // Shooting Star
  if (upperShadow > body(curr) * 2 && lowerShadow < body(curr) * 0.5) {
    patterns.push('Shooting Star');
  }

  // Doji (open ≈ close)
  if (body(curr) < range(curr) * 0.1 && range(curr) > 0) {
    patterns.push('Doji');
  }

  return patterns;
}

/**
 * Average True Range — ใช้กำหนดระยะ SL/TP ตามความผันผวนจริง
 */
export function ATR(candles: CandleData[], period = 14): number {
  if (candles.length < 2) return NaN;
  const slice = candles.slice(-(period + 1));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i];
    const prevClose = slice[i - 1].close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    sum += tr;
    n++;
  }
  return n ? sum / n : NaN;
}

/**
 * Determine trend from MA alignment
 * ถ้าไม่มีข้อมูลยาวพอสำหรับ MA200 จะตัดสินจาก MA20/MA50 แทน
 */
export function determineTrend(
  close: number,
  ma20: number,
  ma50: number,
  ma200: number
): 'uptrend' | 'downtrend' | 'sideways' {
  if (!Number.isFinite(ma20) || !Number.isFinite(ma50)) return 'sideways';

  if (Number.isFinite(ma200)) {
    if (close > ma20 && ma20 > ma50 && ma50 > ma200) return 'uptrend';
    if (close < ma20 && ma20 < ma50 && ma50 < ma200) return 'downtrend';
    return 'sideways';
  }

  if (close > ma20 && ma20 > ma50) return 'uptrend';
  if (close < ma20 && ma20 < ma50) return 'downtrend';
  return 'sideways';
}
// <<< END COPY OF src/lib/indicators.ts

// >>> BEGIN COPY OF src/lib/signal-engine.ts — ห้ามแก้เฉพาะที่นี่ ต้องแก้ต้นฉบับด้วย
interface SignalInput {
  symbol: string;
  name: string;
  market: Signal['market'];
  candles: CandleData[];
  timeframe?: string;
  newsSentiment?: number;
}

/** uuid v4 — ต้องเป็น uuid จริงเพราะคอลัมน์ signals.id เป็น type uuid */
function newUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * ปัดทศนิยมให้เหมาะกับ "ขนาดของราคา" ไม่ใช่ชนิดตลาดอย่างเดียว
 *
 * เดิมใช้ toFixed(4) กับทุกตลาดที่ไม่ใช่ FOREX แล้วพังกับเหรียญราคาถูก:
 *   PEPE-USD ราคาจริง 0.0000061957 → Number((0.0000061957).toFixed(4)) = 0
 *   SHIB-USD ราคาจริง 0.00000468   → 0
 * ผลคือ entry_price / stop_loss / take_profit เป็น 0 ทั้งชุด สัญญาณถูกบันทึกลง DB ได้
 * (คอลัมน์เป็น numeric NOT NULL ซึ่ง 0 ผ่าน) แล้ว UI คำนวณ RR ออกมาเป็น NaN
 *
 * ราคาต่ำกว่า 1 จึงเปลี่ยนไปใช้ "เลขนัยสำคัญ" แทนจำนวนตำแหน่งคงที่
 * 6 ตัวพอสำหรับ meme coin และไม่ทำให้คู่เงิน forex (0.x–1.x) เสียความละเอียดที่เคยมี
 */
function roundPrice(value: number, market: Signal['market']): number {
  if (!Number.isFinite(value)) return value;
  if (value !== 0 && Math.abs(value) < 1) {
    const digits = market === 'FOREX' ? 5 : 6;
    return Number(value.toPrecision(digits));
  }
  return Number(value.toFixed(market === 'FOREX' ? 5 : 4));
}

/**
 * Core signal generator
 * รวม technical analysis → คำนวณสัญญาณเข้า/ออก พร้อม SL/TP และเหตุผล
 */
export function generateSignal(input: SignalInput): Signal | null {
  const { symbol, name, market, candles, timeframe = '1D', newsSentiment } = input;

  if (candles.length < 50) return null;

  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const rsi = RSI(closes, 14);
  const macd = MACD(closes);
  const ema20 = EMA(closes, 20);
  const ma50 = SMA(closes, 50);
  // MA200 คำนวณเฉพาะเมื่อมีข้อมูลครบ 200 แท่งจริง ไม่ย่อ period ให้สั้นลง
  const ma200 = closes.length >= 200 ? SMA(closes, 200) : [];

  const bb = BollingerBands(closes, 20, 2);

  const last = closes.length - 1;
  const rsiNow = rsi[last];
  const rsiPrev = rsi[last - 1];
  const macdNow = macd.macdLine[last];
  const macdSignal = macd.signalLine[last];
  const macdHist = macd.histogram[last];
  const ma20Now = ema20[last];
  const ma50Now = ma50[last];
  const ma200Now = ma200.length ? ma200[last] : NaN;
  const hasMA200 = Number.isFinite(ma200Now);

  const sr = findSupportResistance(candles);
  const patterns = detectPatterns(candles);
  const trend = determineTrend(currentPrice, ma20Now, ma50Now, ma200Now);

  // Scoring system
  let bullScore = 0;
  let bearScore = 0;
  const reasons: SignalReason[] = [];

  // RSI
  if (Number.isFinite(rsiNow)) {
    if (rsiNow < 30) {
      bullScore += 2;
      reasons.push({ type: 'technical', label: 'RSI Oversold', detail: `RSI(14) = ${rsiNow.toFixed(1)} อยู่ในโซน oversold`, weight: 0.2 });
    } else if (rsiNow > 70) {
      bearScore += 2;
      reasons.push({ type: 'technical', label: 'RSI Overbought', detail: `RSI(14) = ${rsiNow.toFixed(1)} อยู่ในโซน overbought`, weight: 0.2 });
    } else if (Number.isFinite(rsiPrev) && rsiNow > 50 && rsiPrev < 50) {
      bullScore += 1;
      reasons.push({ type: 'technical', label: 'RSI Cross 50', detail: 'RSI ตัดขึ้นผ่าน 50', weight: 0.15 });
    } else if (Number.isFinite(rsiPrev) && rsiNow < 50 && rsiPrev > 50) {
      bearScore += 1;
      reasons.push({ type: 'technical', label: 'RSI Cross 50', detail: 'RSI ตัดลงต่ำกว่า 50', weight: 0.15 });
    }
  }

  // MACD
  if (Number.isFinite(macdNow) && Number.isFinite(macdSignal)
      && Number.isFinite(macd.macdLine[last - 1]) && Number.isFinite(macd.signalLine[last - 1])) {
    if (macdNow > macdSignal && macd.macdLine[last - 1] <= macd.signalLine[last - 1]) {
      bullScore += 2;
      reasons.push({ type: 'technical', label: 'MACD Bullish Cross', detail: 'MACD ตัดขึ้น Signal Line', weight: 0.2 });
    } else if (macdNow < macdSignal && macd.macdLine[last - 1] >= macd.signalLine[last - 1]) {
      bearScore += 2;
      reasons.push({ type: 'technical', label: 'MACD Bearish Cross', detail: 'MACD ตัดลง Signal Line', weight: 0.2 });
    }
  }

  if (Number.isFinite(macdHist) && Number.isFinite(macd.histogram[last - 1])) {
    if (macdHist > 0 && macd.histogram[last - 1] < macdHist) {
      bullScore += 1;
    } else if (macdHist < 0 && macd.histogram[last - 1] > macdHist) {
      bearScore += 1;
    }
  }

  // Trend
  const trendDetail = hasMA200
    ? (t: string) => `MA20 ${t} MA50 ${t} MA200 ยืนยัน${t === '>' ? 'uptrend' : 'downtrend'}`
    : (t: string) => `MA20 ${t} MA50 (ข้อมูลไม่ถึง 200 แท่ง จึงไม่ใช้ MA200 ยืนยัน)`;

  if (trend === 'uptrend') {
    bullScore += hasMA200 ? 2 : 1;
    reasons.push({ type: 'technical', label: 'Uptrend', detail: trendDetail('>'), weight: 0.2 });
  } else if (trend === 'downtrend') {
    bearScore += hasMA200 ? 2 : 1;
    reasons.push({ type: 'technical', label: 'Downtrend', detail: trendDetail('<'), weight: 0.2 });
  }

  // Bollinger Bands
  if (Number.isFinite(bb.lower[last]) && currentPrice < bb.lower[last]) {
    bullScore += 1;
    reasons.push({ type: 'technical', label: 'BB Lower Touch', detail: 'ราคาต่ำกว่า Bollinger Lower Band', weight: 0.15 });
  } else if (Number.isFinite(bb.upper[last]) && currentPrice > bb.upper[last]) {
    bearScore += 1;
    reasons.push({ type: 'technical', label: 'BB Upper Touch', detail: 'ราคาสูงกว่า Bollinger Upper Band', weight: 0.15 });
  }

  // Patterns
  for (const p of patterns) {
    if (p === 'Bullish Engulfing' || p === 'Hammer') {
      bullScore += 2;
      reasons.push({ type: 'pattern', label: p, detail: `รูปแบบ ${p} ปรากฏในแท่งล่าสุด`, weight: 0.2 });
    } else if (p === 'Bearish Engulfing' || p === 'Shooting Star') {
      bearScore += 2;
      reasons.push({ type: 'pattern', label: p, detail: `รูปแบบ ${p} ปรากฏในแท่งล่าสุด`, weight: 0.2 });
    }
  }

  // Support/Resistance
  //
  // ต้องกรอง "ฝั่ง" ไม่ใช่แค่ระยะทาง: แนวรับต้องอยู่ใต้ราคาปัจจุบัน แนวต้านต้องอยู่เหนือ
  // เดิมใช้ Math.abs ซึ่งวัดแต่ระยะห่างโดยไม่สนว่าอยู่ฝั่งไหนของราคา
  // พอราคาหลุดลงใต้แนวรับเดิม แนวรับนั้นจะกลายเป็นระดับที่อยู่ "เหนือ" ราคาปัจจุบัน
  // แต่ยังผ่านเกณฑ์ 1.5% แล้วถูกส่งต่อไปตั้งเป็น stopLoss ของสัญญาณ BUY
  // ผลคือ SL สูงกว่าราคาเข้า ซึ่งขัดกับความหมายของ stop loss โดยสิ้นเชิง
  // และ position-monitor จะเมินมันทิ้ง (ignored) ทำให้ออเดอร์ไม่มี SL คุ้มครองจริง
  //
  // ในทางเทคนิค ระดับที่ราคาทะลุลงมาแล้วไม่ใช่แนวรับอีกต่อไป — มันกลายเป็นแนวต้าน
  // supports เรียงจากมากไปน้อย / resistances เรียงจากน้อยไปมาก
  // เมื่อกรองฝั่งแล้ว find จึงได้ระดับที่ "ใกล้ราคาที่สุด" ของฝั่งนั้นพอดี
  const nearSupport = sr.supports.find(s => s < currentPrice && (currentPrice - s) / currentPrice < 0.015);
  const nearResistance = sr.resistances.find(r => r > currentPrice && (r - currentPrice) / currentPrice < 0.015);
  if (nearSupport) {
    bullScore += 1;
    reasons.push({ type: 'technical', label: 'At Support', detail: `ราคาอยู่เหนือแนวรับ ${nearSupport.toFixed(2)} ไม่เกิน 1.5%`, weight: 0.15 });
  }
  if (nearResistance) {
    bearScore += 1;
    reasons.push({ type: 'technical', label: 'At Resistance', detail: `ราคาอยู่ใต้แนวต้าน ${nearResistance.toFixed(2)} ไม่เกิน 1.5%`, weight: 0.15 });
  }

  // News sentiment
  if (newsSentiment !== undefined) {
    if (newsSentiment > 0.3) {
      bullScore += Math.round(newsSentiment * 2);
      reasons.push({ type: 'news', label: 'Bullish News', detail: `ข่าวเชิงบวก (sentiment: ${newsSentiment.toFixed(2)})`, weight: 0.2 });
    } else if (newsSentiment < -0.3) {
      bearScore += Math.round(Math.abs(newsSentiment) * 2);
      reasons.push({ type: 'news', label: 'Bearish News', detail: `ข่าวเชิงลบ (sentiment: ${newsSentiment.toFixed(2)})`, weight: 0.2 });
    }
  }

  // Decide action
  let action: SignalAction = 'HOLD';
  let strength: SignalStrength = 'weak';
  const totalScore = Math.max(bullScore, bearScore);
  const netScore = bullScore - bearScore;

  if (netScore >= 3) action = 'BUY';
  else if (netScore <= -3) action = 'SELL';

  if (totalScore >= 8) strength = 'very_strong';
  else if (totalScore >= 5) strength = 'strong';
  else if (totalScore >= 3) strength = 'moderate';

  // SL/TP จาก ATR จริง
  const atrRaw = ATR(candles, 14);
  const atr = Number.isFinite(atrRaw) && atrRaw > 0 ? atrRaw : currentPrice * 0.02;

  let stopLoss: number;
  let takeProfit: number;

  if (action === 'BUY') {
    // แนวรับผ่านการกรองฝั่งมาแล้วว่าอยู่ใต้ราคา / แนวต้านอยู่เหนือราคา
    // จึงไม่ต้องเช็คทิศซ้ำตรงนี้ (ชั้นที่ 2 ด้านล่างจะตรวจค่าที่คำนวณเสร็จแล้วอีกที)
    stopLoss = nearSupport ? nearSupport * 0.995 : currentPrice - atr * 1.5;
    takeProfit = nearResistance ? nearResistance * 0.995 : currentPrice + atr * 3;
  } else if (action === 'SELL') {
    stopLoss = nearResistance ? nearResistance * 1.005 : currentPrice + atr * 1.5;
    takeProfit = nearSupport ? nearSupport * 1.005 : currentPrice - atr * 3;
  } else {
    stopLoss = currentPrice - atr;
    takeProfit = currentPrice + atr;
  }

  // ชั้นที่ 2 — บังคับ invariant ปิดท้าย
  //
  // ทำไมต้องมีทั้งที่ชั้นที่ 1 กรองฝั่งไปแล้ว: เพราะบล็อกข้างบนไม่ได้ใช้ระดับแนวรับ/แนวต้าน
  // ตรง ๆ แต่คูณ 0.995 / 1.005 ทับลงไปเพื่อเผื่อ slippage ตัวคูณนั้นเลื่อนค่าข้ามฝั่ง entry ได้
  // ตัวอย่างจริง: BUY ที่มีแนวต้านอยู่เหนือราคาแค่ 0.2% (100 → 100.2)
  //   takeProfit = 100.2 * 0.995 = 99.699 ซึ่ง "ต่ำกว่า" ราคาเข้า
  //   กลายเป็นเป้ากำไรที่อยู่ฝั่งขาดทุน และ position-monitor จะเมินทิ้ง (ignored)
  // ฝั่ง SELL ก็สมมาตรกัน: แนวรับที่อยู่ใต้ราคาไม่ถึง 0.5% พอคูณ 1.005 แล้วเด้งข้ามขึ้นเหนือ entry
  //
  // ชั้นที่ 1 กันที่ "ต้นทาง" (เลือกระดับผิดฝั่ง) ชั้นนี้กันที่ "ปลายทาง" (ค่าที่คำนวณเสร็จแล้ว)
  // ต้องมีทั้งคู่ เพราะสิ่งที่ไหลออกไปเป็นสัญญาณจริงคือค่าหลังคูณ ไม่ใช่ระดับที่เลือกมา
  // ด้านไหนไม่ผ่านให้ถอยไปใช้สูตร ATR ของด้านนั้น ซึ่งอิงจาก currentPrice จึงอยู่ถูกฝั่งเสมอ
  // (HOLD ไม่ต้องบังคับ เพราะไม่ได้เอาไปเปิดออเดอร์)
  //
  // เขียนเป็น !(a < b) ไม่ใช่ (a >= b) เพื่อให้ NaN ตกเข้าเงื่อนไข fallback ด้วย
  if (action === 'BUY') {
    if (!(stopLoss < currentPrice)) stopLoss = currentPrice - atr * 1.5;
    if (!(takeProfit > currentPrice)) takeProfit = currentPrice + atr * 3;
  } else if (action === 'SELL') {
    if (!(stopLoss > currentPrice)) stopLoss = currentPrice + atr * 1.5;
    if (!(takeProfit < currentPrice)) takeProfit = currentPrice - atr * 3;
  }

  // ชั้นที่ 2.5 — เป้าต้อง "ไกลพอคุ้มความเสี่ยง" ไม่ใช่แค่ "อยู่ถูกฝั่ง"
  //
  // ── บั๊กที่ชั้นนี้มาแก้ (วัดเมื่อ 2026-08-25) ─────────────────────────────────
  // บล็อกข้างบนหยิบ "แนวต้านตัวแรกที่อยู่ใกล้กว่า 1.5%" มาเป็นเป้าทันที โดยไม่ดูเลยว่า
  // มันห่างจากราคาเข้าแค่ไหนเทียบกับระยะ SL ที่ตั้งไว้ ผลคือถ้ามีแนวต้านห่างแค่ 0.1%
  // ขณะ SL กว้าง 0.6% จะได้เป้าที่ใกล้กว่าจุดตัดขาดทุนหลายเท่า
  //
  // ยิงเครื่องยนต์กับ 13 สัญลักษณ์จริงได้ RR ดังนี้:
  //     15m  0.14 · 0.15 · 0.16 · 0.18 · 0.21      (มัธยฐาน 0.16)
  //     1H   0.29 · 0.29
  // RR 0.16 = เสี่ยง 1 บาทเพื่อลุ้น 0.16 บาท ต้องชนะ 86% ถึงเสมอตัว ซึ่งไม่มีระบบไหนทำได้
  // ด่าน RR ของ SIGNAL_GATE ตัดทิ้งทั้งหมดอย่างถูกต้อง แต่ต้นเหตุอยู่ที่การวางเป้า ไม่ใช่ที่ด่าน
  //
  // ── ตัวเลข 2.0 มาจากไหน ─────────────────────────────────────────────────────
  // เป็นอัตราส่วนที่เครื่องยนต์ตัวนี้ใช้อยู่แล้วในสูตรสำรองของตัวเอง: SL = 1.5×ATR
  // และ TP = 3×ATR → RR = 2.0 ชั้นนี้จึงไม่ได้ตั้งค่าใหม่ แต่บังคับให้เส้นทางที่ใช้
  // แนวรับ/แนวต้าน เคารพอัตราส่วนเดียวกับเส้นทางสำรอง แทนที่จะหลุดไปคนละเรื่อง
  //
  // ⚠ สิ่งที่แลกไป: เป้าที่ไกลขึ้นถูกแตะน้อยลง ไม้จะจบด้วย "หมดเวลา" มากขึ้นแทน "แตะเป้า"
  //   นี่เป็นการแลกอัตราชนะกับกำไรต่อไม้ที่ชนะ — ไม่ใช่ของฟรี และต้องวัดผลจริงเสมอ
  const MIN_RR_GEOMETRY = 2.0;
  if (action === 'BUY' || action === 'SELL') {
    const risk = Math.abs(currentPrice - stopLoss);
    if (risk > 0) {
      const reward = Math.abs(takeProfit - currentPrice);
      const minReward = risk * MIN_RR_GEOMETRY;
      if (!(reward >= minReward)) {
        takeProfit = action === 'BUY' ? currentPrice + minReward : currentPrice - minReward;
      }
    }
  }

  // ชั้นที่ 3 — ตรวจ invariant อีกครั้ง "หลังปัดทศนิยม"
  //
  // ชั้นที่ 2 บังคับบนค่าดิบ แต่สิ่งที่เขียนลง DB จริงคือค่าที่ผ่าน roundPrice มาแล้ว
  // ถ้าระยะห่างจาก entry เล็กกว่าครึ่งหน่วยปัด ค่าที่ออกไปจะ "เท่ากับ" entry พอดี
  // เช่น BUY ที่ currentPrice 99.99996 กับ takeProfit 99.9999875 → ปัดแล้วได้ 100.0000 เท่ากันทั้งคู่
  // สัญญาณนั้นจะมี take_profit = entry_price ซึ่ง position-monitor จะเมินทิ้ง (ignored)
  // แปลว่าออเดอร์ที่เปิดจากสัญญาณนี้จะไม่มีวันถูกปิดอัตโนมัติ โดยไม่มีอะไรบอกผู้ใช้
  const entryOut = roundPrice(currentPrice, market);
  let stopOut = roundPrice(stopLoss, market);
  let takeOut = roundPrice(takeProfit, market);

  if (action === 'BUY') {
    if (!(stopOut < entryOut)) stopOut = roundPrice(currentPrice - atr * 1.5, market);
    if (!(takeOut > entryOut)) takeOut = roundPrice(currentPrice + atr * 3, market);
  } else if (action === 'SELL') {
    if (!(stopOut > entryOut)) stopOut = roundPrice(currentPrice + atr * 1.5, market);
    if (!(takeOut < entryOut)) takeOut = roundPrice(currentPrice - atr * 3, market);
  }

  // ATR เล็กเกินกว่าจะรอดการปัด (หรือราคาเล็กจนทุกอย่างยุบเป็นค่าเดียวกัน)
  // ยอมไม่ออกสัญญาณ ดีกว่าออกสัญญาณที่ SL/TP ใช้งานไม่ได้จริง
  if (action !== 'HOLD' && (stopOut === entryOut || takeOut === entryOut || stopOut <= 0 || takeOut <= 0)) {
    return null;
  }

  const confidence = Math.min(95, 40 + totalScore * 6);

  // อายุสัญญาณตาม timeframe — สัญญาณจากแท่งรายชั่วโมง "เก่า" เร็วกว่าสัญญาณรายวันมาก:
  // setup บนแท่ง 1H มักเดินจบภายในไม่กี่สิบแท่ง (ราววันสองวัน) ถ้าปล่อยให้ active ค้าง 7 วัน
  // เท่ากับโชว์ผู้ใช้ว่าโอกาสยังอยู่ทั้งที่ตลาดเดินผ่านจุดนั้นไปนานแล้ว → 1H หมดอายุใน 48 ชม.
  // timeframe อื่นคงอายุ 7 วันตามพฤติกรรมเดิม
  const ttlMs = timeframe === '1H' ? 48 * 3600_000 : 7 * 86400000;

  const indicators: Record<string, number> = {};
  const put = (k: string, v: number, d = 4) => {
    if (Number.isFinite(v)) indicators[k] = Number(v.toFixed(d));
  };
  put('rsi', rsiNow, 2);
  put('macd', macdNow);
  put('macd_signal', macdSignal);
  put('ma20', ma20Now);
  put('ma50', ma50Now);
  put('ma200', ma200Now);
  put('atr', atr);

  return {
    id: newUuid(),
    user_id: '',
    symbol, name, market,
    action, strength, status: 'active',
    entry_price: entryOut,
    stop_loss: stopOut,
    take_profit: takeOut,
    current_price: entryOut,
    confidence,
    timeframe,
    reasons: reasons.slice(0, 5),
    indicators,
    news_sentiment: newsSentiment ?? null,
    telegram_sent: false,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    created_at: new Date().toISOString(),
  };
}
// <<< END COPY OF src/lib/signal-engine.ts

// ═══════════════════════════════════════════════════════════════════════════
// ตรรกะดึงราคาจาก Yahoo — ยกชุดมาจาก Edge Function ตัวเฝ้าราคา (monitor-positions)
// ซึ่งยกมาจาก src/lib/market-data.ts อีกที
// เหตุผลที่ต่างจาก market-data 2 จุด (ถอดแคชของ Next.js + เพิ่ม timeout ต่อคำขอ)
// อธิบายไว้ที่หัวบล็อกเดียวกันใน supabase/functions/monitor-positions/index.ts แล้ว
// ═══════════════════════════════════════════════════════════════════════════

const CHART_HOSTS = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart',
];

/** กันคำขอเดียวค้างจนกินเวลาทั้งรอบ (ต่อ 1 host ไม่ใช่ต่อ 1 สัญลักษณ์) */
const FETCH_TIMEOUT_MS = 8000;

type ChartInterval = '1d' | '1h' | '1wk';
type ChartRange = '1mo' | '3mo' | '6mo' | '1y' | '2y';

/**
 * Map our internal symbol to a Yahoo Finance symbol
 */
function toYahooSymbol(symbol: string, market: string): string {
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
  quote: MarketPrice | null;
  candles: CandleData[];
  /**
   * meta.currentTradingPeriod.regular.start เป็น ISO — เวลาเปิดรอบซื้อขายตาม Yahoo
   * ส่งดิบออกไปให้ผู้เรียกตัดสินเอง เพราะเชื่อเดี่ยว ๆ ไม่ได้ทุกตลาด
   * (หุ้นไทยตอนตลาดปิด ค่านี้ชี้ไปรอบพรุ่งนี้) — ดู resolveSessionStart ในบล็อกสำเนาด้านบน
   */
  regularStart: string | null;
}

const EMPTY: ChartPayload = { quote: null, candles: [], regularStart: null };

/**
 * ดึง chart จาก Yahoo — ได้ทั้ง quote และ candles ในคำขอเดียว
 * ลอง query1 ก่อน ถ้าไม่ติดค่อยไป query2
 *
 * ต้องคืน candles ด้วย ไม่ใช่แค่ quote เพราะผู้เรียกใช้ timestamp ของแท่งสุดท้าย
 * เป็น sessionStart ให้ resolvePriceWindow — ขาดไปแล้วจะตกกลับไปใช้ [price, price] เสมอ
 * แล้วจับ wick ที่แทงถึง SL/TP ระหว่างวันไม่ได้
 */
async function fetchChart(
  symbol: string,
  market: string,
  interval: ChartInterval = '1d',
  range: ChartRange = '1y'
): Promise<ChartPayload> {
  const yahooSymbol = toYahooSymbol(symbol, market);

  for (const host of CHART_HOSTS) {
    try {
      // ต้องครอบทั้ง fetch และ res.json() ไว้ในนาฬิกาเดียวกัน
      // เพราะ fetch คืนค่าทันทีที่ได้ header ส่วน body ยังไหลอยู่ ถ้า clearTimeout ตรงนี้
      // แล้วค่อยไป await res.json() ปลายทางที่ส่ง header 200 แล้วค้าง body ไว้จะทำให้
      // รอบนั้นค้างไม่มีกำหนด จนแพลตฟอร์มตัดฟังก์ชันทิ้งโดยไม่มี response ออกมาเลย
      // (ทดสอบแล้วค้างที่ 20 วินาทีขึ้นไปทั้งที่ตั้ง timeout ไว้ 8 วินาที)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any;
      try {
        const res = await fetch(
          `${host}/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: controller.signal,
          }
        );
        if (!res.ok) continue;
        json = await res.json();
      } finally {
        clearTimeout(timer);
      }

      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const meta = result.meta ?? {};

      // epoch วินาที -> ISO ให้ผู้เรียกใช้ต่อได้ทันที ไม่มีค่าก็ปล่อย null ไม่เดา
      const regularStartEpoch = Number(meta.currentTradingPeriod?.regular?.start);
      const regularStart = Number.isFinite(regularStartEpoch)
        ? new Date(regularStartEpoch * 1000).toISOString()
        : null;
      const timestamps: number[] = result.timestamp || [];
      const ohlc = result.indicators?.quote?.[0];
      if (!ohlc) continue;

      const candles: CandleData[] = timestamps
        .map((ts, i) => ({
          timestamp: new Date(ts * 1000).toISOString(),
          open: ohlc.open?.[i] ?? 0,
          high: ohlc.high?.[i] ?? 0,
          low: ohlc.low?.[i] ?? 0,
          close: ohlc.close?.[i] ?? 0,
          volume: ohlc.volume?.[i] ?? 0,
        }))
        .filter((c) => c.close > 0);

      const price = Number(meta.regularMarketPrice ?? candles[candles.length - 1]?.close);
      if (!price || !Number.isFinite(price)) return { quote: null, candles, regularStart };

      // ใช้แท่งก่อนหน้าเป็นฐานคำนวณการเปลี่ยนแปลง (เชื่อถือได้กว่า meta.chartPreviousClose
      // ซึ่งเป็นราคาปิดก่อนเริ่มช่วงที่ขอมา ไม่ใช่ของเมื่อวาน)
      const prevClose =
        candles.length >= 2 ? candles[candles.length - 2].close : Number(meta.chartPreviousClose ?? price);
      const change = price - prevClose;

      const quote: MarketPrice = {
        symbol,
        name: meta.longName || meta.shortName || symbol,
        market: market as MarketType,
        price,
        change,
        change_percent: prevClose ? (change / prevClose) * 100 : 0,
        volume: Number(meta.regularMarketVolume ?? candles[candles.length - 1]?.volume ?? 0),
        high_24h: Number(meta.regularMarketDayHigh ?? candles[candles.length - 1]?.high ?? price),
        low_24h: Number(meta.regularMarketDayLow ?? candles[candles.length - 1]?.low ?? price),
        updated_at: new Date().toISOString(),
      };

      return { quote, candles, regularStart };
    } catch (err) {
      console.error('fetchChart error:', yahooSymbol, err);
    }
  }

  return EMPTY;
}

// ═══════════════════════════════════════════════════════════════════════════
// ตรรกะแจ้งเตือน Telegram จาก src/lib/telegram.ts (เฉพาะเส้นทาง "สัญญาณใหม่")
// ข้อความที่ผู้ใช้เห็นต้องตรงกับที่เว็บส่งทุกตัวอักษร ไม่งั้นจะดูเหมือนคนละระบบ
//
// sendTelegramMessage ในชุดนี้ยกมาจากตัวเฝ้าราคา ซึ่งต่างจาก src/lib/telegram.ts
// จุดเดียว: เพิ่ม AbortController timeout ต่อคำขอ — Edge Function มีเพดานเวลาทำงาน
// ถ้า Telegram ค้าง คำขอเดียวจะกินเวลาทั้งรอบจนสัญญาณของ user อื่นไม่ได้แจ้ง
// ═══════════════════════════════════════════════════════════════════════════

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * MarkdownV2 สงวนอักขระเหล่านี้ไว้ ต้อง escape ทุกตัว
 * รวมถึง "." ในราคา เช่น 2650.50 — ถ้าไม่ escape Telegram จะตอบ 400
 */
const RESERVED = /([_*[\]()~`>#+\-=|{}.!\\])/g;

function esc(value: string | number): string {
  return String(value).replace(RESERVED, '\\$1');
}

/**
 * Format a signal as a Telegram message
 */
export function formatSignalMessage(signal: Signal): string {
  const emoji = {
    BUY: '🟢',
    SELL: '🔴',
    HOLD: '🟡',
    CLOSE: '⚪',
  }[signal.action];

  const strengthEmoji = {
    weak: '⭐',
    moderate: '⭐⭐',
    strong: '⭐⭐⭐',
    very_strong: '⭐⭐⭐⭐',
  }[signal.strength];

  const lines = [
    `${emoji} *${esc(signal.action)} SIGNAL* ${strengthEmoji}`,
    ``,
    `📊 *${esc(signal.symbol)}* \\- ${esc(signal.name)}`,
    `💹 Market: ${esc(signal.market)}`,
    `⏰ Timeframe: ${esc(signal.timeframe)}`,
    `🎯 Confidence: *${esc(signal.confidence)}%*`,
    ``,
    `💵 *Entry:* ${esc(signal.entry_price)}`,
    `🛑 *Stop Loss:* ${esc(signal.stop_loss)}`,
    `🎯 *Take Profit:* ${esc(signal.take_profit)}`,
    ``,
    `📝 *Reasons:*`,
    ...signal.reasons.slice(0, 4).map(r => `• ${esc(r.label)}: ${esc(r.detail)}`),
  ];

  return lines.join('\n');
}

/**
 * Send message to Telegram
 * ถ้า MarkdownV2 parse ไม่ผ่าน จะส่งซ้ำเป็นข้อความธรรมดาแทนที่จะเงียบหาย
 */
async function sendTelegramMessage(
  config: TelegramConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) {
    return { success: false, error: 'Missing bot token or chat ID' };
  }

  const post = async (body: Record<string, unknown>) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const base = { chat_id: config.chatId, disable_web_page_preview: true };
    const data = await post({ ...base, text: message, parse_mode: 'MarkdownV2' });
    if (data.ok) return { success: true };

    // fallback: ถอด markdown ออกแล้วส่งเป็น plain text
    const plain = message.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1').replace(/\*/g, '');
    const retry = await post({ ...base, text: plain });
    if (retry.ok) return { success: true };

    return { success: false, error: retry.description || data.description || 'Unknown error' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Send signal alert
 */
export async function sendSignalAlert(
  config: TelegramConfig,
  signal: Signal
): Promise<{ success: boolean; error?: string }> {
  const message = formatSignalMessage(signal);
  return sendTelegramMessage(config, message);
}

// ═══════════════════════════════════════════════════════════════════════════
// Web Push — ถูกถอดออกจากไฟล์นี้แล้ว (2026-08-17)
//
// เดิมตรงนี้มีชุดเครื่องมือส่ง push ครบชุด (แปลงกุญแจ VAPID → ตั้ง ApplicationServer →
// ประกอบข้อความรายสัญญาณ → ยิงทีละเครื่อง) แล้ววนเรียกในลูป "หนึ่งสัญญาณ = หนึ่งใบ"
// ซึ่งทำให้โทรศัพท์สั่นเท่าจำนวนสัญญาณของรอบนั้น
//
// ตอนนี้ไฟล์นี้ทำหน้าที่ "สแกน + บันทึก" อย่างเดียว แถวที่ insert จะมี push_sent = false
// ตามค่าเริ่มต้นของ migration 006 แล้วตัวส่งกลาง (src/lib/push-server.ts →
// sendPendingSignalsToUser) กวาดไปแจ้งเป็นชุดเดียวต่อชั่วโมง พร้อมจัดลำดับให้ตรงกับหน้าเว็บ
//
// ⚠ ห้ามใส่ตัวส่ง push กลับเข้ามาในไฟล์นี้ ถ้าอยากให้ Edge Function แจ้งเตือนเองได้จริง
//   ต้องย้าย "ตรรกะรวมชุด+จัดลำดับ+จำกัดความถี่" ทั้งก้อนมาเป็นสำเนาที่มีเครื่องตรวจ parity
//   ของตัวเองก่อน (แบบเดียวกับ indicators/signal-engine) ไม่ใช่เขียนใหม่ให้พอใช้
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// ตัวงานหลัก
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ไม่สร้างสัญญาณซ้ำของ user+symbol+action+timeframe เดิมภายในกี่ชั่วโมง
 * แยกหน้าต่างตาม timeframe: แท่งรายวันออกสัญญาณใหม่วันละครั้งก็พอ (20 ชม.)
 * แต่แท่งรายชั่วโมงตลาดเดินเร็วกว่ามาก ถ้าล็อกไว้ 20 ชม. เท่ากันจะกลายเป็นปิดปาก 1H ทั้งวัน
 * (ค่าเดียวกับ /api/cron/scan-markets ฝั่ง Vercel — สองระบบต้องกันซ้ำด้วยกติกาเดียวกัน)
 */
const DEDUPE_HOURS_1D = 20;
const DEDUPE_HOURS_1H = 4;

/**
 * เพดานเวลาที่ยอมให้วนต่อ
 *
 * Edge Function ถูกตัดกลางคันได้เมื่อทำงานนานเกินเพดานของแพลตฟอร์ม
 * ถ้าโดนตัดตอนนั้น response จะไม่ออกเลย และจะไม่มีใครรู้ว่าสแกนไปถึงไหน
 * จึงหยุดวนเองก่อนถึงเพดาน แล้ว "รายงานออกไปว่าข้ามอะไรบ้าง" — ห้ามเงียบ
 * symbol ที่ไม่ได้สแกนรอบนี้ pg_cron จะเรียกซ้ำในชั่วโมงถัดไปอยู่แล้ว
 */
const TIME_BUDGET_MS = 50_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * เทียบ secret แบบไม่ลัดวงจร เพื่อไม่ให้เวลาที่ใช้เทียบบอกใบ้ว่าเดาถูกกี่ตัว
 * (ความยาวไม่เท่ากันตัดทิ้งได้เลย ความยาวไม่ใช่ความลับ)
 */
function secretMatches(presented: string | null, expected: string): boolean {
  if (!presented || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

serve(async (req: Request) => {
  const startedAt = Date.now();
  /** เลยงบเวลาแล้วหรือยัง — เช็คก่อนเริ่มงานชิ้นถัดไปทุกครั้ง */
  const outOfTime = () => Date.now() - startedAt > TIME_BUDGET_MS;

  // ── ยาม: fail-closed ──────────────────────────────────────────────────────
  //
  // ไม่มี MONITOR_SECRET = ปฏิเสธ ไม่ใช่ปล่อยผ่าน
  //
  // route นี้เขียนตาราง signals ของผู้ใช้ทุกคนด้วย service-role และส่ง Telegram ถึงผู้ใช้จริง
  // ข้อความที่ส่งออกไปแล้วเรียกคืนไม่ได้ และสัญญาณที่ถูกยัดเข้าตารางจะถูกตัวส่งกลาง
  // หยิบไปเด้งเข้ามือถือให้เองในรอบถัดไป — ถ้าลืมตั้ง secret แล้วเปิดโล่ง
  // ใครก็สั่งสแปมสัญญาณปลอมถึงผู้ใช้ทุกคนได้
  const expectedSecret = Deno.env.get('MONITOR_SECRET');
  const authHeader = req.headers.get('authorization');
  const bearer = authHeader && /^Bearer\s+/i.test(authHeader)
    ? authHeader.replace(/^Bearer\s+/i, '')
    : null;
  const presented = req.headers.get('x-monitor-secret') ?? bearer;

  if (!expectedSecret || !secretMatches(presented, expectedSecret)) {
    // ไม่บอกว่าพลาดเพราะ "ยังไม่ตั้ง secret" หรือ "secret ผิด" — บอกไปก็ช่วยคนเดาเท่านั้น
    if (!expectedSecret) {
      console.error('MONITOR_SECRET ยังไม่ได้ตั้งใน Edge Function Secrets — ปฏิเสธทุกคำขอไว้ก่อน');
    }
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { success: false, error: 'Supabase unavailable', message: 'ไม่พบ SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY' },
      500
    );
  }

  // ทำงานโดยไม่มี session ของผู้ใช้ จึงใช้ service-role และไม่ต้องเก็บ session ไว้
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. watchlist ทั้งหมดที่เปิดใช้งาน
    const { data: wlRows, error: wlErr } = await supabase
      .from('watchlist')
      .select('*')
      .eq('is_active', true);

    if (wlErr) throw wlErr;
    const watchlist = (wlRows ?? []) as WatchlistRow[];

    if (watchlist.length === 0) {
      return jsonResponse({
        success: true,
        scanned: 0,
        pricesUpdated: 0,
        signalsGenerated: 0,
        telegramSent: 0,
        telegramFailed: 0,
        // ฟังก์ชันนี้ไม่ส่ง push เอง — ตัวส่งกลางเป็นคนแจ้งเป็นชุดเดียวต่อชั่วโมง
        pushSentBy: 'central-digest-sender',
        skipped: [],
        hourlySkippedForTime: 0,
        timedOut: false,
        elapsedMs: Date.now() - startedAt,
        message: 'ไม่มีรายการใน watchlist ที่เปิดใช้งาน',
        timestamp: new Date().toISOString(),
      });
    }

    // 2. ดึง chart รายวันครั้งเดียวต่อ symbol แล้วใช้ซ้ำกับทุก user ที่ติดตาม symbol เดียวกัน
    //    ไล่ 1D ให้ครบทั้งชุดก่อน แล้วค่อยเก็บ 1H ตามงบเวลาที่เหลือ (ดูเหตุผลที่ข้อ 6)
    const uniqueKeys = new Map<string, { symbol: string; market: MarketType }>();
    for (const w of watchlist) {
      uniqueKeys.set(`${w.symbol}|${w.market}`, { symbol: w.symbol, market: w.market });
    }

    const charts = new Map<string, ChartPayload>();
    const prices: MarketPrice[] = [];
    /** symbol ที่รอบนี้ไม่ได้อะไรเลย (fetch ล้ม/ข้อมูลไม่พอ/หมดงบเวลา) — ต้องเห็นใน response */
    const skipped = new Set<string>();
    /** จำนวน symbol ที่ไม่ได้ดึง 1D เลยเพราะหมดงบเวลา (ไม่ใช่เพราะ Yahoo ล้ม) */
    let dailyNotFetched = 0;

    const uniqueList = [...uniqueKeys.entries()];
    for (let i = 0; i < uniqueList.length; i++) {
      const [key, s] = uniqueList[i];

      if (outOfTime()) {
        // ตัวที่เหลือไม่ได้ดึงเลย — ใส่ skipped ไว้ด้วยเพื่อไม่ให้หายไปเงียบ ๆ
        for (let j = i; j < uniqueList.length; j++) skipped.add(uniqueList[j][1].symbol);
        dailyNotFetched = uniqueList.length - i;
        break;
      }

      try {
        const chart = await fetchChart(s.symbol, s.market, '1d', '1y');
        charts.set(key, chart);
        if (chart.quote) prices.push(chart.quote);
        // ไม่มีทั้งราคาและแท่งพอวิเคราะห์ (< 50) = symbol นี้ไม่ได้อะไรเลยรอบนี้
        if (!chart.quote && chart.candles.length < 50) skipped.add(s.symbol);
      } catch (e) {
        // symbol เดียวล้มไม่ควรทำให้ทั้ง job ตาย ตัวอื่นยังต้องได้สแกน
        console.error('fetchChart failed for', s.symbol, e);
        skipped.add(s.symbol);
      }
    }

    // symbol เดียวกันอาจโผล่มาจากคนละ market ได้ (เช่น watchlist คนละคนใส่ market ไม่ตรงกัน)
    // upsert ที่มี symbol ซ้ำใน batch เดียว Postgres จะโยน
    // "ON CONFLICT DO UPDATE command cannot affect row a second time" แล้วทิ้งทั้ง batch
    // ยุบให้เหลือแถวเดียวต่อ symbol ก่อน (Map เก็บตัวหลังสุดที่ fetch สำเร็จ)
    const uniquePrices = [...new Map(prices.map((p) => [p.symbol, p])).values()];

    // นับเฉพาะตอนเขียนสำเร็จจริง — ไม่งั้นจะรายงานเลขที่ไม่เคยลง DB
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
    //
    // ตัวกันซ้ำนี้อ่านจากตาราง signals ที่ทั้ง route ฝั่ง Vercel (รันวันละครั้ง) และ
    // ฟังก์ชันนี้ (รันทุกชั่วโมง) เขียนร่วมกัน สองระบบจึงกันซ้ำข้ามกันเองไปในตัว
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

    // 4. สร้างสัญญาณ 1D รายรายการ
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

      // HOLD ไม่บันทึก และ strength weak ไม่บันทึก — เกณฑ์เดียวกับ route ฝั่ง Vercel
      if (!signal || signal.action === 'HOLD' || signal.strength === 'weak') continue;

      const key = `${item.user_id}:${signal.symbol}:${signal.action}:${signal.timeframe}`;
      if (seen.has(key)) continue;
      seen.add(key);

      signal.user_id = item.user_id;
      signalsToInsert.push(signal);
    }

    // 5. รอบ 1H — เริ่มหลัง 1D ครบทั้งชุดแล้วเท่านั้น
    // เหตุผลของลำดับ: ถ้าสลับ 1D/1H ต่อ symbol แล้วเวลาหมดกลางทาง จะเสียครึ่ง ๆ กลาง ๆ
    // ทั้งสองความละเอียด — แบบนี้อย่างแย่ที่สุด 1D ยังครบเหมือนพฤติกรรมเดิมทุกอย่าง
    let hourlySkippedForTime = 0;
    const hourlyCharts = new Map<string, CandleData[]>();
    for (let i = 0; i < uniqueList.length; i++) {
      // เกินงบเวลา → หยุดเพิ่ม 1H แล้วรายงานจำนวนที่ข้ามใน response ห้ามเงียบ
      if (outOfTime()) {
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

    // 6. บันทึกสัญญาณทั้งชุด — insert ล้มคือล้มทั้งงาน เพราะแจ้งเตือนสัญญาณที่ไม่ได้ลง DB
    //    จะพาผู้ใช้ไปเปิดหน้า /signals แล้วไม่เจออะไร
    if (signalsToInsert.length > 0) {
      const { error: insErr } = await supabase.from('signals').insert(signalsToInsert);
      if (insErr) throw insErr;
    }

    // 7. Telegram ตามการตั้งค่าของแต่ละคน (ไม่ได้ตั้งค่า = ส่ง, ตั้ง false เท่านั้นถึงเงียบ)
    //
    // ⚠ Web Push ไม่อยู่ในลูปนี้แล้ว — แถวที่เพิ่ง insert ค้างเป็น push_sent = false
    //   แล้วตัวส่งกลางกวาดไปแจ้งเป็นชุดเดียวต่อชั่วโมง (เหตุผลเต็มอยู่หัวไฟล์)
    //
    // ลูปนี้ "ไม่" เช็คงบเวลา โดยตั้งใจ: สัญญาณถูก insert ไปแล้ว ถ้าข้ามการส่ง Telegram รอบนี้
    // รอบถัดไปจะมองเป็นสัญญาณซ้ำ (ตัวกันซ้ำ 20/4 ชม. ข้อ 3) แล้วไม่สร้างใหม่
    // = ข้อความนั้นหายถาวร กู้ไม่ได้ — ยอมเสี่ยงเกินงบดีกว่าเงียบ และความเสี่ยงค้างนาน
    // ถูกกดด้วยเพดานเวลารอต่อคำขอ (FETCH_TIMEOUT_MS) อยู่แล้ว
    let telegramSent = 0;
    let telegramFailed = 0;

    const userIds = [...new Set(signalsToInsert.map((s) => s.user_id))];

    for (const userId of userIds) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('telegram_bot_token, telegram_chat_id, telegram_enabled, alert_preferences')
        .eq('id', userId)
        .maybeSingle();

      const profile = (profileRow as TelegramProfileRow | null) ?? null;
      const prefs = (profile?.alert_preferences ?? {}) as Partial<AlertPreferences>;
      // Telegram ต้องครบสามอย่าง: เปิดสวิตช์ + มี token + มี chat id — ขาดอย่างใดข้ามช่องทางนี้
      const telegram =
        profile?.telegram_enabled && profile.telegram_bot_token && profile.telegram_chat_id
          ? { botToken: profile.telegram_bot_token, chatId: profile.telegram_chat_id }
          : null;
      if (!telegram) continue;

      for (const signal of signalsToInsert.filter((s) => s.user_id === userId)) {
        if (signal.action === 'BUY' && prefs.buy_signals === false) continue;
        if (signal.action === 'SELL' && prefs.sell_signals === false) continue;
        if (prefs.strong_signals_only && signal.strength !== 'strong' && signal.strength !== 'very_strong') continue;

        const res = await sendSignalAlert(telegram, signal);

        // บันทึกทุกครั้งไม่ว่าสำเร็จหรือไม่ — ไว้ไล่ย้อนว่าเคยพยายามส่งอะไรไปแล้วบ้าง
        await supabase.from('telegram_alerts').insert({
          user_id: userId,
          signal_id: signal.id,
          message: `${signal.action} ${signal.symbol} @ ${signal.entry_price}`,
          success: res.success,
          error: res.error ?? null,
        });

        if (res.success) {
          telegramSent++;
          await supabase.from('signals').update({ telegram_sent: true }).eq('id', signal.id);
        } else {
          telegramFailed++;
          console.error('telegram send failed:', res.error);
        }
      }
    }

    // 8. หมดอายุสัญญาณเก่า (พฤติกรรมเดียวกับ route ฝั่ง Vercel)
    const { error: expErr } = await supabase
      .from('signals')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());
    if (expErr) console.error('expire signals failed:', expErr);

    // ── สรุปผล ────────────────────────────────────────────────────────────────
    const timedOut = dailyNotFetched > 0 || hourlySkippedForTime > 0;

    // ข้อความภาษาไทยสำหรับคน ประกอบเฉพาะเมื่อมีเรื่องต้องบอกจริง ๆ
    const messages: string[] = [];
    // ต้องบอกทุกรอบที่สร้างสัญญาณ ไม่งั้นคนอ่าน log จะเข้าใจว่ารอบนี้แจ้งเตือนไปแล้ว
    if (signalsToInsert.length > 0) {
      messages.push(
        `สร้างสัญญาณ ${signalsToInsert.length} ตัว และยังไม่ได้แจ้งเตือน (push_sent = false) ` +
          'ฟังก์ชันนี้ไม่ส่ง Web Push เอง — ตัวส่งกลางจะกวาดไปแจ้งเป็นชุดเดียวต่อชั่วโมง'
      );
    }
    if (timedOut) {
      const parts: string[] = [];
      if (dailyNotFetched > 0) parts.push(`1D ที่ยังไม่ได้ดึง ${dailyNotFetched} ตัว`);
      if (hourlySkippedForTime > 0) parts.push(`1H ที่ยังไม่ได้ดึง ${hourlySkippedForTime} ตัว`);
      messages.push(
        `หยุดดึงข้อมูลบางส่วนเพราะใกล้ชนเพดานเวลาของ Edge Function (${parts.join(', ')}) ` +
          `รอบถัดไปจะสแกนต่อให้เอง`
      );
    }

    return jsonResponse({
      success: true,
      scanned: watchlist.length,
      pricesUpdated,
      signalsGenerated: signalsToInsert.length,
      telegramSent,
      telegramFailed,
      // ฟังก์ชันนี้ไม่ส่ง push เอง — ค่าคงที่นี้มีไว้ให้คนที่ไล่ปัญหาเห็นว่า "ใครเป็นคนส่ง"
      // โดยไม่ต้องเดาจากการที่ตัวเลข pushSent หายไปเฉย ๆ
      pushSentBy: 'central-digest-sender',
      skipped: [...skipped],
      hourlySkippedForTime,
      // false = ดึงข้อมูลครบทั้ง 1D และ 1H ในรอบนี้
      timedOut,
      ...(timedOut ? { incomplete: { dailyNotFetched, hourlySkippedForTime } } : {}),
      elapsedMs: Date.now() - startedAt,
      ...(messages.length > 0 ? { message: messages.join(' · ') } : {}),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('scan-signals error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});
