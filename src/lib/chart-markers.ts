import { isLiveSignalRow } from './signal-flips';

/**
 * chart-markers.ts — แปลง "แถวสัญญาณ" เป็น "หมุดบนกราฟ"
 *
 * ═══ หมุดแปลว่าอะไร (อ่านก่อนแก้ข้อความหรือเกณฑ์ใด ๆ) ═══════════════════════════
 * หมุดหนึ่งอัน = **ระบบเคยออกสัญญาณตรงจุดนั้น** เท่านั้น ไม่ใช่คำแนะนำให้เข้าไม้
 * และไม่ใช่การบอกว่าราคาจะไปทางไหนต่อ — งานวิจัยของรีโปนี้วัดแล้วว่าไม่มีเซ็ตอัพไหน
 * พิสูจน์ได้ว่ามีขอบหลังหักต้นทุน ทุกข้อความรอบหมุดจึงพูดได้แค่ข้อเท็จจริงที่เกิดไปแล้ว
 *
 * ═══ ทำไมต้องเป็นไฟล์ pure ═══════════════════════════════════════════════════════
 * ตรรกะ "สัญญาณใบไหนควรขึ้นกราฟ และควรเกาะแท่งไหน" คือจุดที่ผิดแล้วมองไม่เห็น:
 * หมุดที่วางผิดแท่งดูเหมือนหมุดที่ถูกต้องทุกประการ ไฟล์นี้จึงไม่แตะ DOM ไม่อ่านนาฬิกา
 * ไม่ยิงเน็ต รับข้อมูลเข้ามาตรง ๆ ทั้งหมด เพื่อให้ scripts/test-chart-api.mjs
 * ยืนยันด้วย node เปล่า ๆ ได้ (แบบเดียวกับ signal-flips.ts / push-digest.ts)
 *
 * ═══ เงื่อนไข "ยังเปิดอยู่" ═══════════════════════════════════════════════════════
 * ใช้ isLiveSignalRow จาก signal-flips.ts **ตัวเดียวกับที่หน้า /signals และตัวแจ้งเตือนใช้**
 * ห้ามเขียนเงื่อนไขใหม่ที่นี่ — ถ้ากราฟกับหน้าสัญญาณตอบไม่ตรงกันว่าใบไหนยังเปิด
 * เจ้าของจะเห็นหมุดของไม้ที่ ledger ปิดไปแล้ว ซึ่งคืออาการเดิมที่เขารายงานเมื่อ 2026-09-01
 */

/** รูปแถวที่ฟังก์ชันนี้อ่านจริง — แคบไว้เพื่อให้เทสต์ป้อน object ธรรมดาได้ */
export interface MarkerSourceSignal {
  id: string;
  symbol: string;
  action: string;
  timeframe?: string | null;
  status?: string | null;
  outcome?: string | null;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  strength?: string | null;
  confidence?: number | null;
  cost_r?: number | null;
  created_at: string;
}

/** หนึ่งหมุดที่พร้อมส่งให้ตัววาดกราฟ — ทุกช่องเป็นค่าที่ยืนยันแล้วว่าใช้ได้ */
export interface ChartSignalMarker {
  id: string;
  action: 'BUY' | 'SELL';
  /**
   * เวลาของ **แท่งที่หมุดไปเกาะ** เป็น epoch วินาที ไม่ใช่เวลาที่สัญญาณเกิด
   * (ตัววาดกราฟรับได้เฉพาะเวลาที่มีแท่งอยู่จริง — เวลาที่ไม่ตรงแท่งจะถูกทิ้งเงียบ ๆ)
   */
  time: number;
  /** เวลาที่สัญญาณเกิดจริง เป็น epoch วินาที — ใช้แสดงในกล่องรายละเอียด */
  createdSec: number;
  createdAt: string;
  entry: number;
  /** null = แถวนั้นไม่มีเลขที่ใช้ได้ ตัววาดต้องไม่ลากเส้น (ห้ามเดา) */
  stopLoss: number | null;
  takeProfit: number | null;
  strength: string;
  confidence: number | null;
  costR: number | null;
  /** timeframe ของสัญญาณตามที่อยู่ใน DB (ตัวพิมพ์ใหญ่) */
  timeframe: string;
  /**
   * true = สัญญาณใบนี้มาจากกรอบเวลาอื่นกับที่กำลังดูอยู่
   * UI **ต้อง** บอกผู้ใช้ตรง ๆ เมื่อค่านี้เป็น true — หมุดของ 1D ที่ลอยอยู่บนกราฟ 15m
   * โดยไม่มีป้ายกำกับ อ่านได้ว่า "ระบบออกสัญญาณนี้จากกราฟที่คุณกำลังดู" ซึ่งไม่จริง
   */
  foreign: boolean;
}

const parseSec = (iso: string): number => {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
};

/** เลขราคาที่ใช้ได้จริง — 0/ติดลบ/NaN คือ "ไม่มีข้อมูล" ไม่ใช่ราคา */
const price = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/**
 * หาแท่งที่เวลาไม่เกิน `sec` แท่งท้ายสุด — คืน index หรือ -1 เมื่อ sec อยู่ก่อนแท่งแรก
 * ค้นแบบทวิภาค เพราะเลน 15m มีได้ถึง ~2,600 แท่ง และหน้าเว็บเรียกใหม่ทุกครั้งที่ poll
 * ต้องการให้ bars เรียงจากเก่าไปใหม่ ซึ่งเป็นสิ่งที่ /api/chart รับประกันไว้แล้ว
 */
export function findBarIndexAtOrBefore(barTimes: readonly number[], sec: number): number {
  let lo = 0;
  let hi = barTimes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (barTimes[mid] <= sec) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * แปลงชุดสัญญาณเป็นหมุด — คืนเฉพาะใบที่ผ่านครบทุกด่าน
 *
 * ด่านที่ใบหนึ่งต้องผ่าน (ตกข้อเดียว = ไม่ขึ้นกราฟ):
 *   1. symbol ตรงกับที่กราฟกำลังแสดง (เทียบแบบไม่สนตัวพิมพ์/ช่องว่าง)
 *   2. action เป็น BUY หรือ SELL — HOLD/CLOSE ไม่มี "จุดเข้า" ให้ปัก
 *   3. ยังเปิดอยู่จริงตาม isLiveSignalRow (status active + ledger ยังไม่ปิดบัญชี)
 *      ใบที่หมดอายุหรือถูกปิดบัญชีแล้วต้องหายจากกราฟ ไม่ใช่ค้างเป็นหมุดที่ดูยังมีชีวิต
 *   4. created_at อ่านเป็นเวลาได้
 *   5. มีราคาเข้าที่ใช้ได้ (> 0) — ไม่มีจุดเข้าก็ไม่มีอะไรให้ปัก
 *   6. เวลาที่เกิดต้องอยู่ในช่วงที่กราฟครอบคลุม คือ **ไม่เก่ากว่าแท่งแรก**
 *      ใบที่เก่ากว่านั้นถูกตัดทิ้ง ไม่ใช่ดันไปกองที่แท่งแรก — หมุดที่กองอยู่ขอบซ้าย
 *      อ่านได้ว่าระบบออกสัญญาณตอนนั้นจริง ซึ่งเป็นการโกหกด้วยตำแหน่ง
 *
 * การเกาะแท่ง: ใบหนึ่งเกาะ "แท่งท้ายสุดที่เปิดไปแล้วตอนสัญญาณเกิด" เสมอ
 * ใบที่เกิดหลังแท่งท้ายสุดของกราฟ (เช่นตลาดปิดอยู่ ยังไม่มีแท่งใหม่) จึงเกาะแท่งท้ายสุด
 * ซึ่งคือแท่งที่ตลาดเคลื่อนไหวล่าสุดจริง ๆ — ตรงกับที่ตาคนคาดหวัง
 *
 * ผลลัพธ์เรียงตามเวลาแท่งจากเก่าไปใหม่ (ตัววาดกราฟบังคับให้หมุดเรียงเวลาขึ้น
 * ถ้าเรียงผิดมันจะโยน error ทั้งชุด) ใบที่ตกแท่งเดียวกันเรียงตาม created_at จริง
 */
export function buildSignalMarkers(
  signals: readonly MarkerSourceSignal[],
  barTimes: readonly number[],
  opts: { symbol: string; timeframe: string }
): ChartSignalMarker[] {
  if (!barTimes.length) return [];
  const wantSymbol = String(opts.symbol ?? '').trim().toUpperCase();
  const viewTf = String(opts.timeframe ?? '').trim().toUpperCase();
  const firstBar = barTimes[0];

  const out: ChartSignalMarker[] = [];

  for (const s of signals) {
    if (String(s.symbol ?? '').trim().toUpperCase() !== wantSymbol) continue;
    if (s.action !== 'BUY' && s.action !== 'SELL') continue;
    if (!isLiveSignalRow(s)) continue;

    const createdSec = parseSec(s.created_at);
    if (!Number.isFinite(createdSec)) continue;
    if (createdSec < firstBar) continue; // เก่ากว่าช่วงที่กราฟครอบคลุม

    const entry = price(s.entry_price);
    if (entry === null) continue;

    const idx = findBarIndexAtOrBefore(barTimes, createdSec);
    if (idx < 0) continue; // ผ่านด่าน 6 มาแล้วจึงไม่ควรเกิด แต่ไม่เดาแทน

    const tf = String(s.timeframe ?? '').trim().toUpperCase();
    out.push({
      id: s.id,
      action: s.action,
      time: barTimes[idx],
      createdSec,
      createdAt: s.created_at,
      entry,
      stopLoss: price(s.stop_loss),
      takeProfit: price(s.take_profit),
      strength: String(s.strength ?? '').trim() || 'unknown',
      confidence:
        typeof s.confidence === 'number' && Number.isFinite(s.confidence) ? s.confidence : null,
      costR: typeof s.cost_r === 'number' && Number.isFinite(s.cost_r) ? s.cost_r : null,
      timeframe: tf,
      // กรอบเวลาที่อ่านไม่ออก (แถวเก่าที่ timeframe เป็น NULL) ถือว่าไม่ใช่กรอบนี้
      // ปลอดภัยกว่าเดาว่าใช่ — ผลคือ UI ติดป้ายบอกที่มา ซึ่งไม่มีทางผิดฝั่ง
      foreign: tf !== viewTf,
    });
  }

  out.sort((a, b) => a.time - b.time || a.createdSec - b.createdSec || (a.id < b.id ? -1 : 1));
  return out;
}
