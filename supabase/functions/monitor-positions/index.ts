// supabase/functions/monitor-positions/index.ts
//
// เฝ้าดูออเดอร์ที่ยังเปิดอยู่ของผู้ใช้ทุกคน → อัปเดตกำไร/ขาดทุนตามราคาล่าสุด
// และ "ปิด" ออเดอร์ที่ราคาแตะ SL/TP
//
// ⚠ ระบบนี้เป็นสมุดบันทึกการเทรด ไม่ได้ต่อกับโบรกเกอร์
//   การปิดออเดอร์ที่นี่คือการ *บันทึกย้อนหลัง* ว่าถ้ามีคำสั่ง SL/TP วางไว้จริง
//   ออเดอร์จะถูกตัดที่ระดับไหน — ไม่มีคำสั่งซื้อขายใดถูกส่งออกไปทั้งสิ้น
//
// ── ทำไมต้องมีไฟล์นี้ ───────────────────────────────────────────────────────
// ตัวเดิมคือ Next.js route /api/cron/monitor-positions ที่รันบน Vercel
// บัญชี Vercel ถูก pause เพราะใช้เกินโควตาแผน Hobby (Fluid Active CPU / Fast Origin Transfer)
// ทุกโดเมนจึงตอบ HTTP 402 Payment Required รวมถึง route นี้ด้วย
// ย้ายมาไว้บน Supabase Edge Function เพราะผู้ใช้จ่ายแผน Supabase Pro อยู่แล้ว
// (รวม Edge Functions + pg_cron + pg_net) จึงเรียกได้จากในฐานข้อมูลเองโดยไม่ต้องพึ่ง Vercel
//
// ── วิธีนำขึ้น (deploy ผ่านหน้า Dashboard เท่านั้น) ─────────────────────────
// เครื่องผู้ใช้ไม่มี SUPABASE_ACCESS_TOKEN จึงรัน `supabase functions deploy` ไม่ได้
// ต้องไปที่ Dashboard → Edge Functions → Create function → ชื่อ `monitor-positions`
// แล้ววางเนื้อไฟล์นี้ทั้งไฟล์ลงไป
// ด้วยเหตุนี้ไฟล์นี้จึงต้อง **self-contained ทั้งไฟล์** import ได้เฉพาะ URL
// ห้าม import ไฟล์ในโปรเจกต์ด้วย relative path เพราะบน Dashboard ไม่มีไฟล์พวกนั้นอยู่
//
// ── ตัวแปรลับที่ต้องตั้ง ────────────────────────────────────────────────────
// Dashboard → Edge Functions → monitor-positions → Secrets
//   MONITOR_SECRET = สตริงสุ่มยาว ๆ (ผู้ใช้ตั้งเอง)
// ส่วน SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY แพลตฟอร์มใส่ให้อัตโนมัติ ไม่ต้องตั้งเอง
//
// ── วิธีเรียก ───────────────────────────────────────────────────────────────
// ส่ง secret มาทาง header ได้ 2 ทาง:
//   1) x-monitor-secret: <MONITOR_SECRET>        ← แนะนำทางนี้
//   2) authorization: Bearer <MONITOR_SECRET>
//
// ⚠ สวิตช์ "Verify JWT" ของ Edge Function เปิดเป็นค่าเริ่มต้น — **ปล่อยเปิดไว้ อย่าไปปิด**
//   ประตูหน้าของ Supabase จะบังคับให้ header `authorization` เป็น JWT ของโปรเจกต์
//   (anon key / service role key) และปฏิเสธคำขอ **ก่อน** โค้ดในไฟล์นี้ได้ทำงานเลย
//   ตัวจับเวลา (supabase/scripts/schedule_monitor.sql) จึงส่ง anon key มาทาง authorization
//   เพื่อผ่านด่านนั้น แล้วส่ง MONITOR_SECRET มาทาง `x-monitor-secret` เป็นสิทธิ์จริง
//   โค้ดข้างล่างอ่าน x-monitor-secret ก่อน authorization เสมอ สอง header จึงอยู่ด้วยกันได้
//   ทาง (2) มีไว้เผื่อทดสอบตอนปิด Verify JWT เท่านั้น — ปิดจริงเมื่อไหร่ ใครก็ยิงฟังก์ชันได้
//   โดยไม่ต้องมี key ของโปรเจกต์ เหลือ MONITOR_SECRET เป็นด่านเดียว
//
// ไม่ได้ตั้งค่า CORS ไว้โดยตั้งใจ เพราะตัวเรียกคือ pg_cron/pg_net ที่ยิงจากฝั่งเซิร์ฟเวอร์
// ไม่ใช่เบราว์เซอร์ — ไม่มีเหตุผลให้หน้าเว็บใดยิง route ที่ปิดออเดอร์ของทุกคนได้

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ═══════════════════════════════════════════════════════════════════════════
// สำเนาตรรกะเงินจาก src/lib/position-monitor.ts
//
// บล็อกที่คั่นด้วย marker ข้างล่างนี้เป็น **สำเนาคำต่อคำ** ของไฟล์
// src/lib/position-monitor.ts ทั้งไฟล์ (ตั้งแต่บรรทัดแรกถึงบรรทัดสุดท้าย
// รวมคอมเมนต์ภาษาไทยและคำว่า export ทุกตัว)
//
// ทำไมต้องสำเนาแทนที่จะ import:
//   การ deploy ทำผ่านหน้า Dashboard ด้วยการวางโค้ดไฟล์เดียว ตัว Dashboard มองไม่เห็น
//   ไฟล์อื่นในโปรเจกต์ จึง import '../../../src/lib/position-monitor.ts' ไม่ได้
//   และ Deno ก็ไม่รู้จัก path alias '@/lib/...' ของ Next.js ด้วย
//
// ⚠ กฎเหล็ก: **แก้ที่ไหนต้องแก้อีกที่เสมอ**
//   นี่คือกฎที่ชี้ขาดว่าออเดอร์ของผู้ใช้กำไรหรือขาดทุนเท่าไร และผ่านการทดสอบ 23 เคสมาแล้ว
//   ถ้าสองที่นี้ไม่ตรงกัน เว็บกับตัวเฝ้าออเดอร์จะบันทึกตัวเลขคนละชุดโดยไม่มีใครรู้
//   ห้ามเขียนใหม่ ห้ามย่อ ห้าม "ปรับให้อ่านง่ายขึ้น" ในสำเนานี้เด็ดขาด
//
// สัญญาสำหรับสคริปต์ตรวจ drift (scripts/check-monitor-parity.mjs):
//   คอมเมนต์คู่คั่นบน/ล่างที่ครอบสำเนาอยู่ถัดจากย่อหน้านี้ลงไป
//   ให้ดึงข้อความที่อยู่ระหว่างคู่นั้น (ไม่นับตัวคั่นเอง) มา .trim()
//   แล้วเทียบกับเนื้อไฟล์ src/lib/position-monitor.ts ที่ .trim() แล้ว ต้องตรงกันทุกตัวอักษร
//   ไม่ตรง = ให้ล้มด้วย exit code ไม่เป็นศูนย์ พร้อมบอกบรรทัดแรกที่ต่างกัน
//
//   ⚠ ห้ามยกข้อความของตัวคั่นมาเขียนซ้ำในคอมเมนต์ไหนก็ตามของไฟล์นี้
//     เพราะสคริปต์ตรวจ drift จับตัวคั่นจาก "รูปคำ" ไม่ได้จับจากตำแหน่ง
//     เขียนซ้ำเมื่อไหร่จะเกิดตัวคั่นปลอม แล้วสคริปต์จะดึงบล็อกผิดก้อน
// ═══════════════════════════════════════════════════════════════════════════

// >>> BEGIN COPY OF src/lib/position-monitor.ts — ห้ามแก้เฉพาะที่นี่ ต้องแก้ต้นฉบับด้วย
/**
 * ตรรกะเฝ้าออเดอร์ที่เปิดอยู่ — ตัดสินว่าราคาไปแตะ SL/TP แล้วหรือยัง และคำนวณกำไร/ขาดทุน
 *
 * ไฟล์นี้ตั้งใจให้เป็นตรรกะบริสุทธิ์ ไม่แตะฐานข้อมูลและไม่ยิง network
 * เพราะเป็นกฎที่ชี้ขาดว่าออเดอร์ของผู้ใช้จะถูกบันทึกว่ากำไร/ขาดทุนเท่าไร
 * ต้องเรียกซ้ำกี่ครั้งก็ได้ผลเดิม และทดสอบได้โดยไม่ต้องมี Supabase หรือ Yahoo
 *
 * ย้ำให้ชัด: "ปิดออเดอร์อัตโนมัติ" ในที่นี้คือการบันทึกลงสมุดเทรดว่า
 * ถ้ามีคำสั่ง SL/TP วางไว้จริงกับโบรกเกอร์ ราคาจะโดนตัดตรงไหน
 * ระบบไม่ได้ต่อกับโบรกเกอร์ และไม่เคยส่งคำสั่งซื้อขายจริง
 */

export type CloseReason = 'manual' | 'stop_loss' | 'take_profit';

export interface PriceWindow {
  price: number;
  low: number;
  high: number;
}

export interface PositionInput {
  direction: 'long' | 'short';
  entry_price: number;
  quantity: number;
  fees: number;
  stop_loss: number | null;
  take_profit: number | null;
}

export interface PositionOutcome {
  pnl: number;
  pnl_percent: number;
  hit: CloseReason | null;
  exit_price: number | null;
  /**
   * ด้านที่ถูก "เมิน" เพราะระดับที่ตั้งไว้อยู่ผิดฝั่งของราคาเข้า
   * (เช่น long ที่ตั้ง stop_loss ไว้สูงกว่า entry)
   * ปล่อยออเดอร์ไว้เฉย ๆ ปลอดภัยกว่าปิดทิ้งด้วยป้ายที่ขัดกับตัวเลข
   * แต่ต้องรายงานออกไปให้เห็น ไม่ใช่กลืนเงียบ
   */
  ignored: Array<'stop_loss' | 'take_profit'>;
}

/**
 * ค่าที่ผ่าน PostgREST มาอาจเป็น string (postgres numeric ถูก serialize เป็น string
 * เพื่อกันความแม่นยำหาย) จึงต้อง Number() ทุกครั้งก่อนเอาไปเทียบหรือคำนวณ
 * ไม่งั้น '105' <= 100 จะเทียบแบบ string แล้วได้ผลผิด
 */
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * ระดับราคาที่จะเอาไปตรวจต้องเป็นบวกเสมอ ถ้าเจอ 0 หรือค่าติดลบให้ถือว่า "ไม่ได้ตั้งไว้"
 * เหตุผล: ฝั่ง short ตรวจด้วย high >= stop_loss ถ้าปล่อย stop_loss = 0 หลุดเข้ามา
 * เงื่อนไขจะเป็นจริงตลอดและปิดออเดอร์ทิ้งทันทีทั้งที่ผู้ใช้ไม่ได้ตั้ง SL
 */
function toPriceLevel(value: unknown): number | null {
  const n = toFiniteNumber(value);
  return n !== null && n > 0 ? n : null;
}

/** ปัด 4 ตำแหน่งให้ตรงกับที่ /api/trades PATCH เขียนลง DB ตัวเลขจะได้ไม่ขัดกันระหว่าง 2 ทาง */
function round4(n: number): number {
  return Number.isFinite(n) ? Number(n.toFixed(4)) : 0;
}

/** แปลง ISO string เป็น epoch ms — คืน null ถ้าอ่านไม่ได้ */
function toEpoch(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * หาเวลาเริ่มของ "รอบซื้อขายที่ high_24h/low_24h เป็นเจ้าของ"
 *
 * ผู้เรียกมีเบาะแส 2 ทางจาก Yahoo แต่ทั้งคู่เชื่อเดี่ยว ๆ ไม่ได้สักทาง
 * (ตรวจกับข้อมูลจริงทั้ง 5 ตลาดแล้ว):
 *
 *   timestamp ของแท่งรายวันแท่งสุดท้าย
 *     หุ้น US / หุ้นไทย / crypto → เป็นเวลาเปิดรอบจริง ใช้ได้
 *     ทอง (GC=F) และ forex (=X) ตอนตลาดเปิด → Yahoo ใส่ค่าเท่ากับ regularMarketTime
 *       คือ "เวลาปัจจุบัน" ไม่ใช่เวลาเปิดรอบ ใช้แล้วออเดอร์ทุกไม้จะนับว่า "เปิดก่อนรอบ"
 *       แล้วโดนตรวจด้วยช่วงราคาทั้งวันรวมช่วงก่อนที่มันจะมีอยู่จริง
 *
 *   meta.currentTradingPeriod.regular.start
 *     ทอง / forex → ถูกต้อง
 *     หุ้นไทยตอนตลาดปิด → ชี้ไปรอบ "พรุ่งนี้" ซึ่งอยู่ในอนาคต
 *       (เจอจริง: แท่งสุดท้าย 08-11T03:00Z แต่ regular.start = 08-12T03:00Z)
 *       ใช้แล้วพังแบบเดียวกัน
 *
 * กฎที่ถูกกับทุกตลาด: ตัดค่าที่อยู่ในอนาคตทิ้ง แล้วเอาค่าที่ "เร็วกว่า"
 * เร็วกว่าปลอดภัยกว่าเสมอ เพราะ resolvePriceWindow ถือว่า opened_at >= sessionStart
 * แปลว่า "เปิดระหว่างรอบ" → ถอยไปใช้ [price, price] ซึ่งไม่มีทางปิดออเดอร์ผิด
 * ยิ่ง sessionStart เร็ว ยิ่งเข้าเงื่อนไขนั้นบ่อย = อนุรักษ์นิยมขึ้น
 *
 * ไม่เหลือเบาะแสที่ใช้ได้เลย → คืน null ให้ผู้เรียกถอยไปใช้ [price, price]
 */
export function resolveSessionStart(
  lastCandleTimestamp: string | null | undefined,
  regularStart: string | null | undefined,
  now: number = Date.now()
): string | null {
  const usable: number[] = [];
  for (const raw of [lastCandleTimestamp, regularStart]) {
    const t = toEpoch(raw);
    // ค่าที่ยังมาไม่ถึงเป็นรอบถัดไป ไม่ใช่รอบที่ high/low เป็นเจ้าของ
    if (t !== null && t <= now) usable.push(t);
  }
  if (usable.length === 0) return null;
  return new Date(Math.min(...usable)).toISOString();
}

/**
 * เลือกหน้าต่างราคา [low, high] ที่จะใช้ตรวจ SL/TP
 *
 * `sessionStart` คือเวลาเปิดของรอบซื้อขายที่ high_24h/low_24h เป็นเจ้าของ
 * ผู้เรียกต้องส่งมาจาก timestamp ของแท่งเทียนรายวันแท่งล่าสุดที่ Yahoo ให้มา
 *
 * - opened_at เก่ากว่า sessionStart → ใช้ [low_24h, high_24h] จับ wick ที่แทงถึง SL/TP
 *   แล้วเด้งกลับได้ ถ้าดูแต่ราคาปัจจุบันจะพลาดไม้ที่โดน stop ไปแล้วจริง ๆ
 * - opened_at อยู่ "ระหว่าง" รอบเดียวกัน → ใช้ [price, price] เท่านั้น
 *   เพราะ high/low ของรอบนั้นอาจเกิดขึ้นก่อนออเดอร์จะเปิด เอามาตรวจจะปิดออเดอร์ผิดตัว
 * - ไม่รู้ sessionStart หรือ high/low ใช้ไม่ได้ → ถอยมาใช้ [price, price]
 *
 * เคยใช้วิธีเทียบ "วัน UTC" ของ quote.updated_at แทน sessionStart แล้วพัง:
 * updated_at คือเวลาที่ยิง fetch ไม่ใช่วันของรอบซื้อขาย พอ cron รันหลังเที่ยงคืน UTC
 * แต่ตลาดยังไม่เปิดรอบใหม่ ออเดอร์ที่เพิ่งเปิดในรอบเดิมจะถูกตรวจกับช่วงราคาทั้งรอบ
 * รวมช่วงก่อนที่ออเดอร์จะมีอยู่จริง — ซึ่งเป็นสิ่งที่กฎนี้ตั้งใจกันไว้ตั้งแต่แรก
 *
 * หมายเหตุ: ถ้าราคาปัจจุบันใช้ไม่ได้ จะคืนหน้าต่างศูนย์ ซึ่ง evaluatePosition ถือเป็น
 * "ข้อมูลไม่พอ" แล้วปฏิเสธการตัดสิน ไม่ได้แปลว่าราคาเป็น 0 จริง
 */
export function resolvePriceWindow(
  quote: { price: number; low_24h: number; high_24h: number; updated_at: string },
  openedAt: string,
  sessionStart?: string | null
): PriceWindow {
  const price = toPriceLevel(quote?.price);
  if (price === null) return { price: 0, low: 0, high: 0 };

  // ค่า default ที่ปลอดภัยที่สุด: ตรวจด้วยราคาปัจจุบันจุดเดียว
  const flat: PriceWindow = { price, low: price, high: price };

  const low = toPriceLevel(quote.low_24h);
  const high = toPriceLevel(quote.high_24h);
  if (low === null || high === null || high < low) return flat;

  const sessionAt = toEpoch(sessionStart);
  const openAt = toEpoch(openedAt);
  if (sessionAt === null || openAt === null) return flat;
  if (openAt >= sessionAt) return flat;

  // ราคาปัจจุบันเป็นราคาที่ซื้อขายกันจริง ถ้า feed ส่ง high/low มาไม่ครอบราคานี้
  // ให้ขยายหน้าต่างให้ครอบไว้ เพื่อคง invariant low <= price <= high
  return { price, low: Math.min(low, price), high: Math.max(high, price) };
}

/**
 * ตัดสินว่าออเดอร์โดน SL/TP หรือยัง แล้วคำนวณกำไร/ขาดทุน
 * ถ้ายังไม่โดนอะไร pnl ที่ได้คือ unrealized ที่ราคาปัจจุบัน (hit = null, exit_price = null)
 *
 * กฎการตรวจ
 *   long : stopHit = (low  <= stop_loss) ; tpHit = (high >= take_profit)
 *   short: stopHit = (high >= stop_loss) ; tpHit = (low  <= take_profit)
 *
 * โดนทั้ง SL และ TP ในหน้าต่างเดียวกัน → ถือว่า SL โดนก่อนเสมอ
 * เพราะเรามีแค่ช่วง [low, high] ของทั้งวัน เรียงลำดับเวลาไม่ได้ว่าอันไหนมาก่อน
 * เลือกทางที่แย่กว่าไว้ก่อนดีกว่าบันทึกกำไรที่อาจไม่เคยเกิดขึ้นจริง
 *
 * exit_price คือ "ระดับ SL/TP ที่โดน" ไม่ใช่ราคาปัจจุบัน เพราะคำสั่ง stop จริง
 * จะถูกตัดที่ระดับที่ตั้งไว้ ไม่ใช่ราคาตอนที่ cron มาเห็นทีหลัง
 *
 * ด้านที่เป็น null (ไม่ได้ตั้ง SL หรือ TP) จะถูกข้ามไป ไม่ใช่ถือว่าโดน
 */
export function evaluatePosition(pos: PositionInput, win: PriceWindow): PositionOutcome {
  // ข้อมูลไม่พอให้ตัดสิน — คืน hit/exit_price เป็น null เพื่อให้ผู้เรียกปล่อยออเดอร์ไว้เฉย ๆ
  // (pnl ต้องเป็นตัวเลขตามสัญญาของ type จึงเป็น 0 ไม่ใช่การเดาว่ากำไรเท่ากับศูนย์)
  const idle: PositionOutcome = { pnl: 0, pnl_percent: 0, hit: null, exit_price: null, ignored: [] };

  // entry_price เป็น 0 หรือติดลบ จะทำให้ pnl_percent กลายเป็น Infinity/NaN จึงต้องกันตั้งแต่ต้นทาง
  const entry = toPriceLevel(pos?.entry_price);
  const price = toPriceLevel(win?.price);
  if (entry === null || price === null) return idle;

  // จำนวนที่อ่านไม่ได้หรือติดลบให้เป็น 0 ไม่งั้นกำไรจะกลับทิศทั้งที่ทิศทางออเดอร์ไม่ได้เปลี่ยน
  const rawQty = toFiniteNumber(pos.quantity) ?? 0;
  const quantity = rawQty > 0 ? rawQty : 0;
  const fees = toFiniteNumber(pos.fees) ?? 0;

  // หน้าต่างที่ส่งเข้ามาอาจเพี้ยน (มาจากที่อื่นหรือถูกแก้ระหว่างทาง) ตรวจซ้ำอีกชั้น
  let low = price;
  let high = price;
  const rawLow = toPriceLevel(win.low);
  const rawHigh = toPriceLevel(win.high);
  if (rawLow !== null && rawHigh !== null && rawHigh >= rawLow) {
    low = Math.min(rawLow, price);
    high = Math.max(rawHigh, price);
  }

  const isLong = pos.direction === 'long';
  const rawStop = toPriceLevel(pos.stop_loss);
  const rawTake = toPriceLevel(pos.take_profit);

  // ระดับที่อยู่ผิดฝั่งของราคาเข้าต้องถูกเมิน ไม่ใช่เอาไปตัดสิน
  //
  // long ที่ตั้ง stop_loss ไว้ "สูงกว่า" entry จะเข้าเงื่อนไข low <= stop ตั้งแต่วินาทีแรก
  // แล้วปิดออเดอร์ทิ้งพร้อมป้าย "ชน Stop Loss" ทั้งที่ตัวเลขออกมาเป็นกำไร
  // (ทดสอบจริง: entry 100 / stop 100.893 → hit=stop_loss แต่ pnl=+8.93)
  // สาเหตุต้นทางคือ signal-engine เคยเลือกแนวรับที่อยู่เหนือราคามาตั้งเป็น SL ได้
  //
  // ปล่อยออเดอร์ไว้เฉย ๆ ปลอดภัยกว่าปิดผิด เพราะการปิดย้อนกลับไม่ได้
  // และส่ง Telegram ที่ขัดกับความจริงออกไปแล้วเรียกคืนไม่ได้ — แต่ต้องรายงานว่าเมินอะไรไป
  const ignored: Array<'stop_loss' | 'take_profit'> = [];

  const stopOnRightSide = rawStop !== null && (isLong ? rawStop < entry : rawStop > entry);
  const takeOnRightSide = rawTake !== null && (isLong ? rawTake > entry : rawTake < entry);

  if (rawStop !== null && !stopOnRightSide) ignored.push('stop_loss');
  if (rawTake !== null && !takeOnRightSide) ignored.push('take_profit');

  const stop = stopOnRightSide ? rawStop : null;
  const take = takeOnRightSide ? rawTake : null;

  let hit: CloseReason | null = null;
  let exitPrice: number | null = null;

  if (stop !== null && (isLong ? low <= stop : high >= stop)) {
    hit = 'stop_loss';
    exitPrice = stop;
  } else if (take !== null && (isLong ? high >= take : low <= take)) {
    hit = 'take_profit';
    exitPrice = take;
  }

  // สูตรเดียวกับที่ /api/trades PATCH ใช้ตอนผู้ใช้ปิดออเดอร์เอง ตัวเลขจะได้ไม่ขัดกัน
  const sign = isLong ? 1 : -1;
  const settlePrice = exitPrice ?? price;
  const diff = (settlePrice - entry) * sign;
  const pnl = diff * quantity - fees;
  const pnlPercent = (diff / entry) * 100;

  return {
    pnl: round4(pnl),
    pnl_percent: round4(pnlPercent),
    hit,
    // ไม่ปัดระดับ SL/TP เพราะคู่เงิน forex ใช้ทศนิยม 5 ตำแหน่ง ปัดเหลือ 4 แล้วราคาจะเพี้ยน
    exit_price: exitPrice,
    ignored,
  };
}
// <<< END COPY OF src/lib/position-monitor.ts

// ═══════════════════════════════════════════════════════════════════════════
// ชนิดข้อมูลที่ใช้ในไฟล์นี้
//
// ปกติมาจาก @/types แต่ Deno resolve path alias ของ Next.js ไม่ได้ และ Dashboard
// ก็มองไม่เห็นไฟล์นั้น จึงประกาศเฉพาะ field ที่ใช้จริงไว้ตรงนี้
// ═══════════════════════════════════════════════════════════════════════════

type MarketType = 'GOLD' | 'FOREX' | 'TH_STOCK' | 'US_STOCK' | 'CRYPTO';
type TradeDirection = 'long' | 'short';

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

interface AlertPreferences {
  buy_signals: boolean;
  sell_signals: boolean;
  stop_loss_hit: boolean;
  take_profit_hit: boolean;
  news_alerts: boolean;
  strong_signals_only?: boolean;
}

/**
 * รูปแถวที่ดึงมาใช้จริง — ประกาศไว้เฉพาะที่นี่เพราะ Trade ใน @/types
 * ยังไม่มีคอลัมน์ current_price / close_reason / last_checked_at ที่ตัวเฝ้าออเดอร์เพิ่มเข้ามา
 */
interface OpenTradeRow {
  id: string;
  user_id: string;
  signal_id: string | null;
  symbol: string;
  name: string;
  market: MarketType;
  direction: TradeDirection;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  quantity: number;
  fees: number | null;
  opened_at: string;
}

interface SymbolTarget {
  symbol: string;
  market: MarketType;
}

interface TelegramProfileRow {
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
  alert_preferences: Partial<AlertPreferences> | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// สำเนาตรรกะดึงราคาจาก src/lib/market-data.ts (เฉพาะส่วนที่ route นี้ใช้)
//
// ที่ต้องสำเนาเพราะเหตุผลเดียวกับบล็อกด้านบน — Dashboard มองไม่เห็นไฟล์ในโปรเจกต์
// ต่างจากต้นฉบับ 2 จุด (เป็นเรื่องรันไทม์ล้วน ๆ ไม่ได้แตะวิธีอ่านตัวเลข):
//   1) ถอด `next: { revalidate: 300 }` ออก — เป็นออปชันแคชของ Next.js ที่ Deno ไม่รู้จัก
//      ที่นี่ไม่ต้องการแคชอยู่แล้ว เพราะเรียกทุก 30 นาทีและต้องได้ราคาสด
//   2) เพิ่ม timeout ต่อคำขอ — Edge Function มีเพดานเวลาทำงาน ถ้า Yahoo ค้าง
//      สัญลักษณ์เดียวจะกินเวลาทั้งรอบจนออเดอร์ตัวอื่นไม่ได้ตรวจ
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
// สำเนาตรรกะแจ้งเตือนจาก src/lib/telegram.ts (เฉพาะเส้นทาง "ออเดอร์ปิด")
// ข้อความที่ผู้ใช้เห็นต้องตรงกับที่เว็บส่งทุกตัวอักษร ไม่งั้นจะดูเหมือนคนละระบบ
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
 * ข้อมูลขั้นต่ำที่ต้องใช้ตอนแจ้งเตือนออเดอร์ปิด
 * ตั้งเป็นชนิดแคบ ๆ แทนที่จะรับ Trade ทั้งก้อน เพราะฝั่ง cron มีแค่ค่าที่คำนวณเสร็จแล้ว
 * ยังไม่ต้องอ่านแถวเต็มกลับมาจาก DB
 */
interface ClosedTradeSummary {
  symbol: string;
  name: string;
  market: string;
  direction: 'long' | 'short';
  entry_price: number;
  quantity: number;
  pnl: number;
  pnl_percent: number;
}

/**
 * ราคาคริปโตเศษเหรียญทำให้ toFixed(2) กลายเป็น "0.00" จนดูเหมือนไม่มีกำไร/ขาดทุนเลย
 * ค่าที่เล็กกว่า 1 จึงเก็บทศนิยมไว้มากกว่าแล้วค่อยตัดศูนย์ท้ายทิ้ง
 */
function fmtNum(value: number): string {
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Format a closed-trade notification
 * ใช้ตอน cron ตรวจเจอว่าราคาแตะ SL/TP แล้วปิดออเดอร์ในสมุดให้อัตโนมัติ
 */
function formatTradeClosedMessage(
  trade: ClosedTradeSummary,
  reason: 'stop_loss' | 'take_profit',
  exitPrice: number
): string {
  const isTakeProfit = reason === 'take_profit';
  const headEmoji = isTakeProfit ? '🎯' : '🛑';
  const headText = isTakeProfit
    ? 'ปิดออเดอร์อัตโนมัติ — ถึงเป้าทำกำไร (Take Profit)'
    : 'ปิดออเดอร์อัตโนมัติ — ชนจุดตัดขาดทุน (Stop Loss)';

  // ทิศทางกำไร/ขาดทุนตัดสินจาก pnl จริง ไม่ใช่จาก reason
  // เพราะ TP ที่ตั้งผิดฝั่งหรือค่าธรรมเนียมสูงก็ทำให้ "ถึงเป้า" แล้วยังติดลบได้
  const pnlKnown = Number.isFinite(trade.pnl) && Number.isFinite(trade.pnl_percent);
  const isProfit = pnlKnown && trade.pnl >= 0;
  const pnlEmoji = !pnlKnown ? '⚪' : isProfit ? '🟢' : '🔴';
  const pnlLabel = !pnlKnown ? 'กำไร/ขาดทุน' : isProfit ? 'กำไร' : 'ขาดทุน';

  // ข้อมูลไม่พอห้ามเดาเป็น 0 — บอกตรง ๆ ว่าคำนวณไม่ได้
  const sign = isProfit ? '+' : '';
  const pnlText = pnlKnown
    ? `${sign}${fmtNum(trade.pnl)} (${sign}${fmtNum(trade.pnl_percent)}%)`
    : 'คำนวณไม่ได้ (ข้อมูลไม่พอ)';

  const directionText = trade.direction === 'long' ? 'Long (ซื้อ)' : 'Short (ขาย)';

  const lines = [
    `${headEmoji} *${esc(headText)}*`,
    ``,
    `📊 *${esc(trade.symbol)}* \\- ${esc(trade.name)}`,
    `💹 Market: ${esc(trade.market)}`,
    `↕️ ทิศทาง: ${esc(directionText)}`,
    ``,
    `💵 ราคาเข้า: ${esc(trade.entry_price)}`,
    `🚪 ราคาออก: ${esc(exitPrice)}`,
    `🔢 จำนวน: ${esc(trade.quantity)}`,
    ``,
    `${pnlEmoji} *${esc(pnlLabel)}:* ${esc(pnlText)}`,
    ``,
    // ต้องเตือนทุกครั้ง กันเข้าใจผิดว่าระบบไปปิดออเดอร์ให้ที่โบรกเกอร์แล้ว
    `⚠️ ${esc('นี่คือการบันทึกในสมุดเทรดเท่านั้น ระบบไม่ได้ส่งคำสั่งซื้อขายไปยังโบรกเกอร์จริง')}`,
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
 * Send closed-trade alert
 */
async function sendTradeClosedAlert(
  config: TelegramConfig,
  trade: ClosedTradeSummary,
  reason: 'stop_loss' | 'take_profit',
  exitPrice: number
): Promise<{ success: boolean; error?: string }> {
  const message = formatTradeClosedMessage(trade, reason, exitPrice);
  return sendTelegramMessage(config, message);
}

// ═══════════════════════════════════════════════════════════════════════════
// ตัวงานหลัก
// ═══════════════════════════════════════════════════════════════════════════

/** ป้ายภาษาไทยของสาเหตุที่ปิด ใช้ในบันทึก telegram_alerts */
const REASON_LABEL: Record<'stop_loss' | 'take_profit', string> = {
  stop_loss: 'ชน Stop Loss',
  take_profit: 'ชน Take Profit',
};

/**
 * เพดานเวลาที่ยอมให้วนต่อ
 *
 * Edge Function ถูกตัดกลางคันได้เมื่อทำงานนานเกินเพดานของแพลตฟอร์ม
 * ถ้าโดนตัดตอนนั้น response จะไม่ออกเลย และจะไม่มีใครรู้ว่าตรวจไปถึงไหน
 * จึงหยุดวนเองก่อนถึงเพดาน แล้ว "รายงานออกไปว่าตรวจไม่ครบกี่ตัว" — ห้ามเงียบ
 * ของที่ตรวจไม่ทันรอบนี้ยังเป็น status='open' อยู่ รอบถัดไปจะหยิบไปตรวจต่อเอง
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
  // route นี้เข้มกว่าตัวอื่นโดยตั้งใจ เพราะมันเขียนทับ trades ของผู้ใช้ทุกคน
  // (status/exit_price/pnl/closed_at) ด้วย service-role — ปิดออเดอร์ไปแล้วย้อนกลับไม่ได้
  // และ Telegram ที่ส่งออกไปก็เรียกคืนไม่ได้
  // ถ้าลืมตั้ง secret แล้วเปิดโล่ง ใครก็ยิงปิดออเดอร์ของทุกคนได้
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
    // 1. ออเดอร์ที่ยังเปิดอยู่ของทุกผู้ใช้
    const { data: tradeRows, error: tradeErr } = await supabase
      .from('trades')
      .select(
        'id, user_id, signal_id, symbol, name, market, direction, entry_price, stop_loss, take_profit, quantity, fees, opened_at'
      )
      .eq('status', 'open');

    if (tradeErr) throw tradeErr;
    const openTrades = (tradeRows ?? []) as OpenTradeRow[];

    // 2. สัญญาณที่ยัง active — ต้องรีเฟรช current_price ให้ด้วย ถึงจะไม่มีออเดอร์เปิดอยู่เลยก็ตาม
    const { data: signalRows, error: signalErr } = await supabase
      .from('signals')
      .select('symbol, market')
      .eq('status', 'active');

    if (signalErr) throw signalErr;
    const activeSignals = (signalRows ?? []) as SymbolTarget[];

    // 3. ดึงราคาครั้งเดียวต่อ symbol แล้วใช้ซ้ำทั้งกับออเดอร์และสัญญาณ
    const uniqueKeys = new Map<string, SymbolTarget>();
    const signalKeys = new Map<string, SymbolTarget>();

    for (const t of openTrades) {
      uniqueKeys.set(`${t.symbol}|${t.market}`, { symbol: t.symbol, market: t.market });
    }
    for (const s of activeSignals) {
      const key = `${s.symbol}|${s.market}`;
      uniqueKeys.set(key, { symbol: s.symbol, market: s.market });
      signalKeys.set(key, { symbol: s.symbol, market: s.market });
    }

    const quotes = new Map<string, MarketPrice>();
    /**
     * เวลาเปิดของ "รอบซื้อขาย" ที่ high_24h/low_24h เป็นเจ้าของ
     * = timestamp ของแท่งเทียนรายวันแท่งล่าสุดที่ fetchChart คืนมา
     * resolvePriceWindow ต้องใช้ค่านี้ตัดสินว่าเอาช่วง [low, high] มาตรวจ SL/TP ได้ไหม
     * ไม่มีค่า → null แล้วมันจะถอยไปใช้ [price, price] เอง (ปลอดภัย แค่จับ wick ไม่ได้)
     */
    const sessionStarts = new Map<string, string | null>();
    const prices: MarketPrice[] = [];
    const skipped = new Set<string>();

    /** จำนวนสัญลักษณ์ที่ไม่ได้ดึงราคาเลยเพราะหมดงบเวลา (ไม่ใช่เพราะ Yahoo ล้ม) */
    let symbolsNotFetched = 0;

    const fetchTargets = [...uniqueKeys.entries()];
    for (let i = 0; i < fetchTargets.length; i++) {
      const [key, target] = fetchTargets[i];

      if (outOfTime()) {
        // ตัวที่เหลือไม่ได้ดึงเลย — ใส่ skipped ไว้ด้วยเพื่อไม่ให้หายไปเงียบ ๆ
        for (let j = i; j < fetchTargets.length; j++) skipped.add(fetchTargets[j][1].symbol);
        symbolsNotFetched = fetchTargets.length - i;
        break;
      }

      try {
        // ต้องเป็น interval '1d' เพราะแท่งล่าสุดคือ "รอบวันนี้" ที่ high_24h/low_24h อ้างถึง
        // range สั้นสุดที่ ChartRange รองรับก็พอ — ใช้แค่แท่งสุดท้าย ไม่ได้ใช้ประวัติย้อนหลัง
        const chart = await fetchChart(target.symbol, target.market, '1d', '1mo');
        if (!chart.quote) {
          skipped.add(target.symbol);
          continue;
        }
        quotes.set(key, chart.quote);
        sessionStarts.set(
          key,
          resolveSessionStart(
            chart.candles[chart.candles.length - 1]?.timestamp ?? null,
            chart.regularStart,
          ),
        );
        prices.push(chart.quote);
      } catch (e) {
        // symbol เดียวล้มไม่ควรทำให้ทั้ง job ตาย ออเดอร์ตัวอื่นยังต้องได้รับการตรวจ
        console.error('fetchChart failed for', target.symbol, e);
        skipped.add(target.symbol);
      }
    }

    /**
     * ยุบให้เหลือแถวเดียวต่อ symbol ก่อน upsert
     *
     * market_prices มี primary key เป็น symbol อย่างเดียว แต่ prices ถูกเก็บมาจากคีย์ `symbol|market`
     * symbol เดียวกันที่ผู้ใช้คนละคนตั้ง market ไว้ไม่ตรงกัน (เช่น XAUUSD คนหนึ่งตั้ง GOLD อีกคนตั้ง FOREX)
     * จะกลายเป็นสองแถวใน batch เดียว แล้ว postgres โยน
     * "ON CONFLICT DO UPDATE command cannot affect row a second time" → ราคาทั้ง batch หายหมด
     */
    const uniquePrices = [...new Map(prices.map((p) => [p.symbol, p])).values()];

    let pricesUpdated = 0;
    if (uniquePrices.length > 0) {
      const { error: priceErr } = await supabase
        .from('market_prices')
        .upsert(uniquePrices, { onConflict: 'symbol' });
      // นับเฉพาะตอนเขียนสำเร็จจริง ไม่งั้นจะรายงานเลขที่ไม่เคยลง DB
      if (priceErr) console.error('market_prices upsert failed:', priceErr);
      else pricesUpdated = uniquePrices.length;
    }

    // 4. ตรวจออเดอร์ทีละตัว
    const now = new Date().toISOString();

    let checked = 0;
    let stopLoss = 0;
    let takeProfit = 0;
    let alertsSent = 0;
    let alertsFailed = 0;
    /** ออเดอร์ที่ไม่ได้แตะเลยเพราะหมดงบเวลา — ต้องรายงาน ไม่ใช่ปล่อยให้เข้าใจว่าตรวจครบ */
    let tradesNotChecked = 0;

    /**
     * ระดับ SL/TP ที่ evaluatePosition เมินเพราะตั้งไว้ผิดฝั่งของ entry
     * (เช่น long ที่ตั้ง stop_loss สูงกว่าราคาเข้า) — ออเดอร์พวกนี้จะไม่มีวันถูก cron ปิดให้
     * ต้องรายงานออกไป ไม่ใช่กลืนเงียบ ไม่งั้นจะดีบักไม่ได้ว่าทำไมออเดอร์ค้างอยู่ตลอด
     */
    const ignoredLevels: Array<{
      tradeId: string;
      symbol: string;
      ignored: Array<'stop_loss' | 'take_profit'>;
    }> = [];

    // ดึง profiles ครั้งเดียวต่อ user แล้วใช้ซ้ำ — คนเดียวปิดหลายไม้ในรอบเดียวไม่ต้องยิงซ้ำ
    const profiles = new Map<string, TelegramProfileRow | null>();

    /**
     * แจ้งเตือนไม้ที่เพิ่งปิด — ต้องเรียก "ทันที" หลังเขียน DB สำเร็จ
     *
     * ถ้าเก็บสะสมไว้แล้วส่งรวดเดียวตอนท้ายไฟล์ แล้วฟังก์ชันถูกตัดที่เพดานเวลาระหว่างกลาง
     * ออเดอร์จะปิดไปแล้วแต่ผู้ใช้ไม่ได้รับแจ้ง และรอบถัดไปจะหาไม้นั้นไม่เจอ
     * เพราะไม่ใช่ status='open' อีกต่อไป → การแจ้งเตือนหายถาวร กู้ไม่ได้
     */
    const notifyClosed = async (
      trade: OpenTradeRow,
      hit: 'stop_loss' | 'take_profit',
      exitPrice: number,
      summary: ClosedTradeSummary
    ) => {
      if (!profiles.has(trade.user_id)) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('telegram_bot_token, telegram_chat_id, telegram_enabled, alert_preferences')
          .eq('id', trade.user_id)
          .maybeSingle();
        profiles.set(trade.user_id, (profile as TelegramProfileRow) ?? null);
      }

      const profile = profiles.get(trade.user_id);
      if (!profile?.telegram_enabled || !profile.telegram_bot_token || !profile.telegram_chat_id) return;

      // ไม่ได้ตั้งค่าไว้ = ส่ง, ตั้งเป็น false เท่านั้นถึงจะเงียบ
      const prefs = (profile.alert_preferences ?? {}) as Partial<AlertPreferences>;
      if (hit === 'stop_loss' && prefs.stop_loss_hit === false) return;
      if (hit === 'take_profit' && prefs.take_profit_hit === false) return;

      const res = await sendTradeClosedAlert(
        { botToken: profile.telegram_bot_token, chatId: profile.telegram_chat_id },
        summary,
        hit,
        exitPrice
      );

      // บันทึกทุกครั้งไม่ว่าสำเร็จหรือไม่ — signal_id เป็น null ได้ถ้าผู้ใช้เปิดออเดอร์เอง
      await supabase.from('telegram_alerts').insert({
        user_id: trade.user_id,
        signal_id: trade.signal_id,
        message: `${REASON_LABEL[hit]} ${trade.symbol} @ ${exitPrice}`,
        success: res.success,
        error: res.error ?? null,
      });

      if (res.success) {
        alertsSent++;
      } else {
        alertsFailed++;
        console.error('telegram send failed:', res.error);
      }
    };

    for (let i = 0; i < openTrades.length; i++) {
      const trade = openTrades[i];

      // เช็คก่อนเริ่มไม้ถัดไป ไม่ใช่ระหว่างกลาง — ไม้ที่เริ่มแล้วต้องทำให้จบ
      // ไม่งั้นอาจปิดออเดอร์ใน DB แล้วออกจากลูปก่อนส่ง Telegram ซึ่งกู้ไม่ได้
      if (outOfTime()) {
        tradesNotChecked = openTrades.length - i;
        break;
      }

      const key = `${trade.symbol}|${trade.market}`;
      const quote = quotes.get(key);
      // ไม่มีราคาก็ไม่ตัดสินอะไรทั้งนั้น ดีกว่าเดาแล้วปิดออเดอร์ผิด (symbol อยู่ใน skipped แล้ว)
      if (!quote) continue;

      const entryPrice = Number(trade.entry_price);
      if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
        // entry ใช้ไม่ได้ → pnl_percent จะกลายเป็น Infinity/NaN แล้วเขียนลง numeric ไม่ได้
        console.error('invalid entry_price on trade', trade.id);
        skipped.add(trade.symbol);
        continue;
      }

      try {
        // พารามิเตอร์ที่ 3 คือ sessionStart — ขาดไปแล้วจะตกกลับไปใช้ตรรกะ [price, price] เสมอ
        const priceWindow = resolvePriceWindow(quote, trade.opened_at, sessionStarts.get(key) ?? null);
        // ราคาใช้ไม่ได้ → evaluatePosition จะคืน pnl 0 ตามสัญญาของ type ซึ่งไม่ใช่กำไรจริง
        // เขียนทับของเดิมไปจะกลายเป็นการเดาค่าให้ผู้ใช้ ปล่อยแถวไว้เฉย ๆ ดีกว่า
        if (!Number.isFinite(priceWindow.price) || priceWindow.price <= 0) {
          skipped.add(trade.symbol);
          continue;
        }

        const out = evaluatePosition(
          {
            direction: trade.direction,
            entry_price: entryPrice,
            quantity: Number(trade.quantity),
            fees: Number(trade.fees ?? 0),
            stop_loss: trade.stop_loss === null ? null : Number(trade.stop_loss),
            take_profit: trade.take_profit === null ? null : Number(trade.take_profit),
          },
          priceWindow
        );

        checked++;

        // เก็บก่อนแตกกิ่ง เพราะไม้ที่มีระดับผิดฝั่งมักไม่เข้ากิ่งปิดออเดอร์เลย
        if (out.ignored.length > 0) {
          ignoredLevels.push({ tradeId: trade.id, symbol: trade.symbol, ignored: out.ignored });
        }

        // cron ปิดออเดอร์ได้เฉพาะเพราะราคาแตะ SL/TP เท่านั้น 'manual' เป็นของผู้ใช้กดเอง
        // และถ้าไม่มี exit_price ก็ไม่มีระดับราคาให้บันทึก → ถือว่ายังไม่โดน ปล่อยออเดอร์ไว้
        const hit = out.hit === 'stop_loss' || out.hit === 'take_profit' ? out.hit : null;
        const exitPrice = out.exit_price;

        if (hit === null || exitPrice === null) {
          // ยังไม่โดนอะไร — อัปเดตกำไร/ขาดทุนลอยตัวเท่านั้น
          const { error: updErr } = await supabase
            .from('trades')
            .update({
              pnl: out.pnl,
              pnl_percent: out.pnl_percent,
              current_price: priceWindow.price,
              last_checked_at: now,
            })
            .eq('id', trade.id)
            .eq('status', 'open');
          if (updErr) console.error('update open trade failed:', trade.id, updErr);
          continue;
        }

        // .eq('status','open') กัน job สองรอบทับกัน / ผู้ใช้เพิ่งกดปิดเอง — ปิดซ้ำจะทับ exit_price ของจริง
        const { data: updated, error: closeErr } = await supabase
          .from('trades')
          .update({
            status: 'closed',
            exit_price: exitPrice,
            pnl: out.pnl,
            pnl_percent: out.pnl_percent,
            close_reason: hit,
            closed_at: now,
            current_price: priceWindow.price,
            last_checked_at: now,
          })
          .eq('id', trade.id)
          .eq('status', 'open')
          .select();

        if (closeErr) {
          console.error('close trade failed:', trade.id, closeErr);
          continue;
        }
        // ไม่โดนแถว = มีคนปิดไปก่อนแล้ว ห้ามนับและห้ามแจ้งเตือนซ้ำ
        if (!updated || updated.length === 0) continue;

        if (hit === 'stop_loss') stopLoss++;
        else takeProfit++;

        // แจ้งเตือนทันทีหลังปิดสำเร็จ ก่อนจะไปยุ่งกับ signals หรือไม้ถัดไป (เหตุผลอยู่ที่ notifyClosed)
        // ห่อ try ไว้เพราะ Telegram ล้มไม่ควรทำให้ไม้ที่เหลือไม่ได้ตรวจ — ออเดอร์ปิดไปแล้วเรียกคืนไม่ได้
        try {
          await notifyClosed(trade, hit, exitPrice, {
            // ประกอบเองจากค่าที่เพิ่งเขียนลงไป ไม่ใช้แถวดิบจาก PostgREST
            // เพราะ numeric ถูก serialize เป็น string ข้อความแจ้งเตือนจะกลายเป็น "คำนวณไม่ได้"
            symbol: trade.symbol,
            name: trade.name,
            market: trade.market,
            direction: trade.direction,
            entry_price: entryPrice,
            quantity: Number(trade.quantity),
            pnl: out.pnl,
            pnl_percent: out.pnl_percent,
          });
        } catch (e) {
          console.error('notify closed trade failed:', trade.id, e);
        }
      } catch (e) {
        console.error('evaluate position failed for', trade.symbol, e);
      }
    }

    // 5. รีเฟรชราคาปัจจุบันของสัญญาณที่ยัง active (อัปเดตทีเดียวต่อ symbol)
    /** สัญญาณที่ไม่ได้รีเฟรชเพราะหมดงบเวลา — ราคาเก่าค้างอยู่ ต้องบอกให้รู้ */
    let signalsNotRefreshed = 0;
    const signalTargets = [...signalKeys.entries()];
    for (let i = 0; i < signalTargets.length; i++) {
      const [key, target] = signalTargets[i];

      if (outOfTime()) {
        signalsNotRefreshed = signalTargets.length - i;
        break;
      }

      const quote = quotes.get(key);
      if (!quote) continue;

      const { error: sigErr } = await supabase
        .from('signals')
        .update({ current_price: quote.price })
        .eq('status', 'active')
        .eq('symbol', target.symbol)
        .eq('market', target.market);
      if (sigErr) console.error('signals current_price update failed:', target.symbol, sigErr);
    }

    // ── สรุปผล ────────────────────────────────────────────────────────────────
    const timedOut = symbolsNotFetched > 0 || tradesNotChecked > 0 || signalsNotRefreshed > 0;

    // ข้อความภาษาไทยสำหรับคน ประกอบเฉพาะเมื่อมีเรื่องต้องบอกจริง ๆ
    const messages: string[] = [];
    if (openTrades.length === 0) messages.push('ไม่มีออเดอร์ที่เปิดอยู่');
    if (timedOut) {
      const parts: string[] = [];
      if (tradesNotChecked > 0) parts.push(`ออเดอร์ที่ยังไม่ได้ตรวจ ${tradesNotChecked} ไม้`);
      if (symbolsNotFetched > 0) parts.push(`สัญลักษณ์ที่ยังไม่ได้ดึงราคา ${symbolsNotFetched} ตัว`);
      if (signalsNotRefreshed > 0) parts.push(`สัญญาณที่ยังไม่ได้รีเฟรชราคา ${signalsNotRefreshed} รายการ`);
      messages.push(
        `หยุดกลางคันเพราะใกล้ชนเพดานเวลาของ Edge Function (${parts.join(', ')}) ` +
          `ของที่เหลือยังเปิดอยู่ตามเดิม รอบถัดไปจะตรวจต่อให้เอง`
      );
    }

    return jsonResponse({
      success: true,
      // นับเฉพาะออเดอร์ที่มีราคาให้ตรวจจริง ตัวที่ดึงราคาไม่ได้อยู่ใน skipped
      checked,
      closed: stopLoss + takeProfit,
      stopLoss,
      takeProfit,
      pricesUpdated,
      alertsSent,
      alertsFailed,
      skipped: [...skipped],
      // ว่าง = ไม่มีไม้ไหนตั้ง SL/TP ผิดฝั่ง
      ignoredLevels,
      // false = ตรวจครบทุกไม้ในรอบนี้
      timedOut,
      ...(timedOut
        ? { incomplete: { tradesNotChecked, symbolsNotFetched, signalsNotRefreshed } }
        : {}),
      elapsedMs: Date.now() - startedAt,
      ...(messages.length > 0 ? { message: messages.join(' · ') } : {}),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('monitor-positions error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});
