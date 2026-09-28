import type { CandleData } from '@/types';
import { atrSeries } from './supply-demand';

/**
 * smc.ts — Smart Money Concepts: โครงสร้างตลาด · BOS/CHoCH · Order Block · FVG · กวาดสภาพคล่อง
 *
 * ═══ ทำไมมีไฟล์นี้ ═══════════════════════════════════════════════════════════════════
 * เจ้าของขอ (2026-09-28) ให้ใช้เทคนิค SMC แทน หลังจากเครื่องยนต์เดิม (RSI/MACD/MA/
 * แนวรับต้าน) ได้ −13.7 R จาก 37 สัญญาณจริงตั้งแต่ 14 ก.ย. — SELL 23 ใบไม่ถึง TP เลยสักใบ
 * ไฟล์นี้คือเครื่องมือหาองค์ประกอบของ SMC เท่านั้น **ไม่ได้ตัดสินว่าจะเข้าไม้**
 * การตัดสินใจว่าองค์ประกอบไหนใช้ได้จริงเป็นงานของ scripts/research/smc-lab.mjs ที่วัดก่อน
 *
 * ═══ นิยามที่ใช้ (เลือกแบบที่เป็นที่รู้จักที่สุด ไม่ได้ปรับให้ผลออกมาดี) ═══════════════
 *
 *   swing high/low   fractal ความยาว swingLength ทั้งสองข้าง — **รู้ได้หลังแท่งขวาปิดครบ**
 *                    (confirmedAt = index + swingLength) ก่อนหน้านั้นห้ามใช้
 *   BOS              ราคา *ปิด* ทะลุ swing ล่าสุดที่ยังไม่ถูกใช้ ในทิศเดียวกับเทรนด์เดิม
 *   CHoCH            เหมือน BOS แต่สวนเทรนด์เดิม = สัญญาณแรกของการเปลี่ยนทิศ
 *   กวาดสภาพคล่อง     ไส้ทะลุ swing แต่ *ปิด* กลับเข้ามา = กินสต็อปแล้วไม่ไปต่อ
 *                    swing ที่ถูกกวาดถือว่าใช้ไปแล้ว ทะลุซ้ำภายหลังไม่นับเป็น BOS
 *   Order Block      แท่งที่ low ต่ำสุด (ขาขึ้น) / high สูงสุด (ขาลง) ระหว่าง swing ที่ถูกทะลุ
 *                    กับแท่งที่ทะลุ — นิยามเดียวกับ indicator SMC ที่คนใช้กันมากที่สุด
 *                    โซน = high–low ทั้งแท่ง · proximal = ขอบที่ราคาย้อนมาถึงก่อน
 *   FVG              สามแท่งที่ low แท่งที่ 3 > high แท่งที่ 1 (ขาขึ้น) หรือกลับกัน
 *                    กรองช่องเล็กกว่า fvgMinAtr × ATR ทิ้ง (ช่องจิ๋วคือสัญญาณรบกวน)
 *   displacement     ขาที่ทะลุโครงสร้างมี FVG ทิศเดียวกันอยู่ = วิ่งแรงจริง ไม่ใช่ค่อย ๆ ไหล
 *
 * ═══ กติกาเรื่องเวลา (สำคัญที่สุดในไฟล์) ════════════════════════════════════════════
 * ทุกชิ้นพก knownAt = ดัชนีแท่งแรกที่รู้ได้จริง ค่าทุกตัวของชิ้นนั้นคำนวณจากแท่ง ≤ knownAt
 * ล้วน ๆ จึงตัดแท่งอนาคตทิ้งแล้วต้องได้ชิ้นเดิมเป๊ะ — scripts/test-smc.mjs ตรวจด้วยข้อมูลทองจริง
 * พร้อม negative control · บทเรียนจาก zone-lab: บั๊กอ่านอนาคตทำให้ผลบวกเกินจริงเท่าตัวโดยไม่มี error
 */

export const SMC_PARAMS = {
  /** จำนวนแท่งแต่ละข้างของ fractal — เท่ากับ lookback ของ findSupportResistance (5) ไม่ได้จูน */
  swingLength: 5,
  /** FVG ต้องกว้างอย่างน้อยกี่เท่าของ ATR */
  fvgMinAtr: 0.25,
  atrPeriod: 14,
} as const;

export type Dir = 1 | -1;

export interface SwingPoint {
  kind: 'high' | 'low';
  index: number;
  price: number;
  /** แท่งที่ยืนยันได้ว่าเป็น swing (index + swingLength) */
  confirmedAt: number;
}

export interface FairValueGap {
  dir: Dir;
  /** ดัชนีแท่งที่ 3 ของรูปแบบ = แท่งที่รู้ได้ */
  index: number;
  top: number;
  bottom: number;
  /** ขอบที่ราคาย้อนกลับมาแตะก่อน (ขาขึ้น = top) */
  proximal: number;
  distal: number;
  sizeAtr: number;
  knownAt: number;
}

export interface OrderBlock {
  dir: Dir;
  /** ดัชนีของแท่ง OB */
  index: number;
  top: number;
  bottom: number;
  proximal: number;
  distal: number;
  /** แท่งที่ทะลุโครงสร้าง = แท่งที่รู้ว่านี่คือ OB */
  knownAt: number;
  /** ขาที่ทะลุโครงสร้างมี FVG ทิศเดียวกัน (วิ่งแรงจริง) */
  displacement: boolean;
}

export interface LiquiditySweep {
  /** 1 = กวาด swing low (สต็อปฝั่งซื้อโดนกิน → มองขึ้น) · -1 = กวาด swing high */
  dir: Dir;
  index: number;
  level: number;
  swingIndex: number;
  knownAt: number;
}

export interface StructureEvent {
  kind: 'BOS' | 'CHoCH';
  dir: Dir;
  level: number;
  swingIndex: number;
  /** แท่งที่ปิดทะลุ = แท่งที่รู้ได้ */
  index: number;
  knownAt: number;
  /** ก่อนทะลุครั้งนี้ ขาเดียวกันเพิ่งกวาดสภาพคล่องฝั่งตรงข้ามมา (โมเดลกลับตัวของ SMC) */
  sweptBefore: boolean;
  /** null เมื่อ OB อยู่ผิดฝั่งของราคาปิดตอนทะลุ (ใช้เป็นจุดย้อนกลับไม่ได้) */
  ob: OrderBlock | null;
}

export interface SmcAnalysis {
  swings: SwingPoint[];
  events: StructureEvent[];
  fvgs: FairValueGap[];
  sweeps: LiquiditySweep[];
  /** ทิศของโครงสร้าง ณ แท่งสุดท้าย (0 = ยังไม่มีการทะลุเลย) */
  trend: 0 | Dir;
}

function findSwings(candles: CandleData[], L: number): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = L; i + L < candles.length; i++) {
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= L; k++) {
      // ซ้ายเข้ม ขวาไม่เข้ม: ยอดเท่ากันสองยอด นับยอดแรกเป็น swing (ยอดที่สองไม่สูงกว่า)
      if (!(candles[i].high > candles[i - k].high) || !(candles[i].high >= candles[i + k].high)) isHigh = false;
      if (!(candles[i].low < candles[i - k].low) || !(candles[i].low <= candles[i + k].low)) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ kind: 'high', index: i, price: candles[i].high, confirmedAt: i + L });
    if (isLow) out.push({ kind: 'low', index: i, price: candles[i].low, confirmedAt: i + L });
  }
  return out;
}

function findFvgs(candles: CandleData[], atr: number[]): FairValueGap[] {
  const out: FairValueGap[] = [];
  for (let i = 2; i < candles.length; i++) {
    const a = atr[i];
    if (!Number.isFinite(a) || a <= 0) continue;
    const c1 = candles[i - 2];
    const c3 = candles[i];
    if (c3.low > c1.high) {
      const size = c3.low - c1.high;
      if (size >= SMC_PARAMS.fvgMinAtr * a) {
        out.push({ dir: 1, index: i, top: c3.low, bottom: c1.high, proximal: c3.low, distal: c1.high, sizeAtr: size / a, knownAt: i });
      }
    } else if (c3.high < c1.low) {
      const size = c1.low - c3.high;
      if (size >= SMC_PARAMS.fvgMinAtr * a) {
        out.push({ dir: -1, index: i, top: c1.low, bottom: c3.high, proximal: c3.high, distal: c1.low, sizeAtr: size / a, knownAt: i });
      }
    }
  }
  return out;
}

/**
 * วิเคราะห์ SMC ทั้งชุด — ทุกชิ้นในผลลัพธ์รู้ได้ ณ knownAt ของมันเอง
 * (ผู้เรียกที่ต้องการ "สิ่งที่รู้ ณ แท่ง i" กรองด้วย knownAt ≤ i ได้เลย)
 */
export function analyzeSmc(candles: CandleData[]): SmcAnalysis {
  const P = SMC_PARAMS;
  const n = candles.length;
  const empty: SmcAnalysis = { swings: [], events: [], fvgs: [], sweeps: [], trend: 0 };
  if (n < P.swingLength * 2 + 3) return empty;

  const atr = atrSeries(candles, P.atrPeriod);
  const swings = findSwings(candles, P.swingLength);
  const fvgs = findFvgs(candles, atr);

  const byConfirm = new Map<number, SwingPoint[]>();
  for (const s of swings) (byConfirm.get(s.confirmedAt) ?? byConfirm.set(s.confirmedAt, []).get(s.confirmedAt)!).push(s);

  const events: StructureEvent[] = [];
  const sweeps: LiquiditySweep[] = [];
  let trend: 0 | Dir = 0;
  let lastHigh: { sw: SwingPoint; used: boolean } | null = null;
  let lastLow: { sw: SwingPoint; used: boolean } | null = null;

  const makeEvent = (dir: Dir, sw: SwingPoint, j: number): StructureEvent => {
    // จุดเริ่มของขา = แท่งที่สุดขั้วฝั่งตรงข้ามระหว่าง swing ที่ถูกทะลุกับแท่งที่ทะลุ
    let o = sw.index + 1;
    for (let k = sw.index + 1; k <= j; k++) {
      if (dir === 1 ? candles[k].low < candles[o].low : candles[k].high > candles[o].high) o = k;
    }
    const oc = candles[o];
    const proximal = dir === 1 ? oc.high : oc.low;
    const distal = dir === 1 ? oc.low : oc.high;
    const displacement = fvgs.some((f) => f.dir === dir && f.index - 2 >= o && f.index <= j);
    const onRightSide = dir === 1 ? proximal < candles[j].close : proximal > candles[j].close;
    const ob: OrderBlock | null =
      o < j && onRightSide && proximal !== distal
        ? { dir, index: o, top: oc.high, bottom: oc.low, proximal, distal, knownAt: j, displacement }
        : null;
    const sweptBefore = sweeps.some((s) => s.dir === dir && s.index > sw.index && s.index <= j);
    return {
      kind: trend === -dir ? 'CHoCH' : 'BOS',
      dir, level: sw.price, swingIndex: sw.index, index: j, knownAt: j, sweptBefore, ob,
    };
  };

  for (let j = 0; j < n; j++) {
    const c = candles[j];
    // ใช้ได้เฉพาะ swing ที่ยืนยันก่อนแท่งนี้ (ลงทะเบียนท้ายลูปของแท่งก่อนหน้า)
    if (lastHigh && !lastHigh.used) {
      if (c.close > lastHigh.sw.price) {
        events.push(makeEvent(1, lastHigh.sw, j));
        lastHigh.used = true;
        trend = 1;
      } else if (c.high > lastHigh.sw.price) {
        sweeps.push({ dir: -1, index: j, level: lastHigh.sw.price, swingIndex: lastHigh.sw.index, knownAt: j });
        lastHigh.used = true;
      }
    }
    if (lastLow && !lastLow.used) {
      if (c.close < lastLow.sw.price) {
        events.push(makeEvent(-1, lastLow.sw, j));
        lastLow.used = true;
        trend = -1;
      } else if (c.low < lastLow.sw.price) {
        sweeps.push({ dir: 1, index: j, level: lastLow.sw.price, swingIndex: lastLow.sw.index, knownAt: j });
        lastLow.used = true;
      }
    }
    for (const s of byConfirm.get(j) ?? []) {
      if (s.kind === 'high') lastHigh = { sw: s, used: false };
      else lastLow = { sw: s, used: false };
    }
  }

  return { swings, events, fvgs, sweeps, trend };
}

/**
 * Order block ที่ยังไม่ถูกทะลุ ณ แท่ง atIndex — ใช้วาดบนกราฟ
 * "ทะลุ" = ปิดพ้นขอบนอก (distal) แล้ว · แค่แตะ/เข้าไปในโซนยังไม่นับว่าตาย
 */
export function activeOrderBlocks(candles: CandleData[], a: SmcAnalysis, atIndex = candles.length - 1): OrderBlock[] {
  const out: OrderBlock[] = [];
  for (const e of a.events) {
    const ob = e.ob;
    if (!ob || ob.knownAt > atIndex) continue;
    let broken = false;
    for (let k = ob.knownAt + 1; k <= atIndex; k++) {
      if (ob.dir === 1 ? candles[k].close < ob.distal : candles[k].close > ob.distal) { broken = true; break; }
    }
    if (!broken) out.push(ob);
  }
  return out;
}

/** FVG ที่ราคายังไม่เติมเต็ม (ยังไม่ได้เทรดผ่านทั้งช่อง) ณ แท่ง atIndex */
export function unfilledFvgs(candles: CandleData[], a: SmcAnalysis, atIndex = candles.length - 1): FairValueGap[] {
  const out: FairValueGap[] = [];
  for (const f of a.fvgs) {
    if (f.knownAt > atIndex) continue;
    let filled = false;
    for (let k = f.knownAt + 1; k <= atIndex; k++) {
      if (f.dir === 1 ? candles[k].low <= f.distal : candles[k].high >= f.distal) { filled = true; break; }
    }
    if (!filled) out.push(f);
  }
  return out;
}
