import type { CandleData } from '@/types';
import type { Dir, StructureEvent, FairValueGap } from './smc';
import { applyStopFloor } from './costs';

/**
 * smc-setups.ts — กติกา "เข้าไม้ที่โซน SMC" ชุดเดียว ที่ห้องแล็บ · ชุดทดสอบ · ตัวสแกนจริง ใช้ร่วมกัน
 *
 * ═══ ทำไมต้องเป็นไฟล์เดียว ═════════════════════════════════════════════════════════════
 * ผลวัดมีความหมายก็ต่อเมื่อระบบจริงทำ *สิ่งเดียวกับที่ถูกวัด* ทุกตัวเลข — ระยะ SL · ขยาย SL ·
 * RR · การแตะครั้งแรก · หมดอายุ · ราคาเข้า ถ้าแล็บกับตัวสแกนเขียนกติกาคนละที่ วันไหนที่
 * ใครแก้ฝั่งเดียว ตัวเลขในรายงานจะกลายเป็นของกลยุทธ์ที่ไม่มีอยู่จริงโดยไม่มี error ให้เห็น
 * (รีโปนี้เจอมาแล้วกับเครื่องยนต์ที่ต้องมี check:parity:scan คอยเฝ้า) จึงให้ทุกฝ่าย import จากที่นี่
 *
 * ค่าทุกตัวคือค่าที่ล็อกไว้ก่อนรัน scripts/research/smc-lab.mjs (2026-09-28) — ห้ามจูน
 * ถ้าจะเปลี่ยน ต้องวัดใหม่ทั้งชุด และชุด test ใช้ยืนยันซ้ำไม่ได้แล้ว
 */
export const SMC_SETUP_PARAMS = {
  /** TP = RR × ระยะเสี่ยง */
  rr: 2,
  /** SL วางพ้นขอบนอกของโซนไปอีกเท่านี้ของความสูงโซน */
  stopBuffer: 0.25,
  /** ไม่ถูกแตะภายในกี่แท่งหลังรู้ว่ามีโซน = ทิ้ง */
  expiryBars: 50,
} as const;

export interface TouchZone {
  dir: Dir;
  proximal: number;
  distal: number;
}

/** ทิศโครงสร้าง ณ ปิดแท่ง i (0 = ยังไม่เคยทะลุ) — ใช้เฉพาะ event ที่ knownAt ≤ i */
export function trendSeries(n: number, events: readonly StructureEvent[]): (0 | Dir)[] {
  const out = new Array<0 | Dir>(n).fill(0);
  const evs = [...events].sort((a, b) => a.knownAt - b.knownAt);
  let k = 0;
  let cur: 0 | Dir = 0;
  for (let i = 0; i < n; i++) {
    while (k < evs.length && evs[k].knownAt <= i) cur = evs[k++].dir;
    out[i] = cur;
  }
  return out;
}

/**
 * แท่งแรกหลัง fromIdx ที่ราคาแตะขอบใน (proximal) — คืน −1 ถ้าไม่มี
 *
 * ปิดทะลุขอบนอกก่อนหรือในแท่งที่แตะ = โซนพัง ไม่มีไม้ · ไม่แตะภายใน expiryBars = หมดอายุ
 *
 * @param lastIdx แท่งสุดท้ายที่ยอมให้เป็นแท่งแตะได้
 *   แล็บส่ง n − 2 (ต้องเหลือแท่งถัดไปในชุดให้เข้าที่ราคาเปิด)
 *   ตัวสแกนส่ง n − 1 (แท่งถัดไปคือแท่งที่กำลังก่อตัว ซึ่งไม่อยู่ในชุดแท่งปิด)
 *   สองแบบนี้คือกติกาเดียวกัน ต่างแค่ว่าราคาเปิดของแท่งถัดไปมาจากไหน
 */
export function firstTouch(candles: readonly CandleData[], zone: TouchZone, fromIdx: number, lastIdx: number): number {
  const last = Math.min(fromIdx + SMC_SETUP_PARAMS.expiryBars, lastIdx);
  for (let k = fromIdx + 1; k <= last; k++) {
    const c = candles[k];
    const broken = zone.dir === 1 ? c.close < zone.distal : c.close > zone.distal;
    const touched = zone.dir === 1 ? c.low <= zone.proximal : c.high >= zone.proximal;
    if (broken) return -1;
    if (touched) return k;
  }
  return -1;
}

export interface SetupLevels {
  entry: number;
  stop: number;
  target: number;
  risk: number;
}

/**
 * ระดับ SL/TP จากโซนและราคาเข้า — ลำดับการคำนวณต้องเหมือนตอนวัดเป๊ะ:
 *   SL ตามโครงสร้าง → ทิ้งถ้าราคาเข้าอยู่ผิดฝั่งของ SL แล้ว → TP = RR × ระยะ → ขยาย SL ตาม
 *   ชั้นนโยบาย production (applyStopFloor ขยาย TP ตามสัดส่วนเพื่อรักษา RR)
 * คืน null เมื่อราคาเข้าทะลุ SL ไปแล้ว (เปิดแท่งถัดไปแบบกระโดดผ่านโซน)
 */
export function levelsFromZone(
  zone: TouchZone,
  entry: number,
  opts: { stopFloor: boolean; symbol: string; market: string }
): SetupLevels | null {
  if (!Number.isFinite(entry)) return null;
  const isLong = zone.dir === 1;
  const height = Math.abs(zone.proximal - zone.distal);
  let stop = isLong ? zone.distal - height * SMC_SETUP_PARAMS.stopBuffer : zone.distal + height * SMC_SETUP_PARAMS.stopBuffer;
  if (isLong ? !(entry > stop) : !(entry < stop)) return null;
  let target = isLong ? entry + SMC_SETUP_PARAMS.rr * (entry - stop) : entry - SMC_SETUP_PARAMS.rr * (stop - entry);
  if (opts.stopFloor) {
    const f = applyStopFloor(entry, stop, target, opts.symbol, opts.market);
    if (f) {
      stop = f.stop_loss;
      target = f.take_profit;
    }
  }
  return { entry, stop, target, risk: Math.abs(entry - stop) };
}

/** FVG ที่ทิศตรงกับโครงสร้าง ณ แท่งที่รู้ว่ามี FVG — ตัวเลือกของเซ็ตอัพ "FVG ตามเทรนด์" */
export function fvgTrendCandidates(n: number, events: readonly StructureEvent[], fvgs: readonly FairValueGap[]): FairValueGap[] {
  const trend = trendSeries(n, events);
  return fvgs.filter((f) => trend[f.knownAt] === f.dir);
}

export interface LiveFvgSetup {
  fvg: FairValueGap;
  touchIdx: number;
  levels: SetupLevels;
}

/**
 * ตัวสแกนจริง: แท่งปิดล่าสุดเป็น "การแตะครั้งแรก" ของ FVG ตามเทรนด์หรือไม่
 *
 * ถ้าใช่ → เข้าที่ราคาเปิดของแท่งที่กำลังก่อตัว (= แท่งถัดจากแท่งที่แตะ เหมือนตอนวัด)
 * แตะก่อนหน้านั้น = สัญญาณผ่านไปแล้ว ไม่ไล่ตามด้วยราคาอื่น (ราคาอื่นคือคนละกลยุทธ์กับที่วัด)
 *
 * มีหลาย FVG ถูกแตะพร้อมกันในแท่งเดียว → เลือกใบที่เกิดล่าสุด (ตัดสินแบบกำหนดได้แน่นอน)
 * ตอนวัด แต่ละใบนับเป็นไม้แยก — ที่ส่งแจ้งเตือนใบเดียวเพราะหลายใบทิศเดียวกันในแท่งเดียว
 * คือเรื่องเดียวกัน ส่งซ้ำคือสแปม · ความต่างนี้บันทึกไว้ใน exp-smc-gold.md
 */
export function latestFvgTrendSetup(
  candles: readonly CandleData[],
  events: readonly StructureEvent[],
  fvgs: readonly FairValueGap[],
  formingOpen: number | null | undefined,
  opts: { stopFloor: boolean; symbol: string; market: string }
): LiveFvgSetup | null {
  const n = candles.length;
  if (n < 3 || typeof formingOpen !== 'number' || !Number.isFinite(formingOpen)) return null;
  const last = n - 1;
  let best: LiveFvgSetup | null = null;
  for (const f of fvgTrendCandidates(n, events, fvgs)) {
    if (f.knownAt >= last) continue; // ต้องมีอย่างน้อยหนึ่งแท่งหลังรู้ว่ามี FVG
    if (firstTouch(candles, f, f.knownAt, last) !== last) continue;
    const levels = levelsFromZone(f, formingOpen, opts);
    if (!levels) continue;
    if (!best || f.knownAt > best.fvg.knownAt) best = { fvg: f, touchIdx: last, levels };
  }
  return best;
}
