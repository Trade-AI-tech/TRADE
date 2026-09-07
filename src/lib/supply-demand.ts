import type { CandleData } from '@/types';

/**
 * supply-demand.ts — หาโซนดีมาน/ซัพพลายจากแท่งเทียน
 *
 * ═══ ต่างจาก findSupportResistance() ยังไง ══════════════════════════════════════════
 * findSupportResistance หา "เส้น" จาก swing high/low — คือจุดที่ราคาเคยกลับตัว
 * ไฟล์นี้หา "โซน" จากร่องรอยของออเดอร์ที่ยังค้างอยู่ ซึ่งเป็นคนละแนวคิดกัน:
 *
 *   swing low = ราคาเคยลงไปถึงตรงนั้นแล้วเด้ง  → บอกแค่ว่า "เคยเกิดอะไรขึ้นที่ราคานี้"
 *   demand zone = ตรงนั้นมีคนตั้งซื้อไว้เยอะจนดันราคาขึ้นแรง แล้วออเดอร์ซื้อที่เหลือ
 *                 ยังค้างอยู่  → บอกว่า "ถ้าราคากลับมา น่าจะมีแรงซื้อรออยู่"
 *
 * ความต่างที่ใช้งานได้จริงคือ **โซนมีความกว้าง** จึงวาง SL ได้ตามโครงสร้าง (พ้นขอบนอก)
 * ไม่ใช่ตามสูตร ATR ที่ไม่รู้ว่าโครงสร้างอยู่ตรงไหน
 *
 * ═══ วิธีหา: ฐาน + ขาออก ════════════════════════════════════════════════════════════
 * รูปแบบที่มองหาคือ [ขาเข้า] [ฐาน 1..6 แท่ง] [ขาออกแรง]
 *
 *   ขาออกขึ้น → demand zone (โซนซื้อ)   RBR = ขึ้น-ฐาน-ขึ้น (ตามเทรนด์)
 *                                        DBR = ลง-ฐาน-ขึ้น (กลับตัว)
 *   ขาออกลง  → supply zone (โซนขาย)    DBD = ลง-ฐาน-ลง (ตามเทรนด์)
 *                                        RBD = ขึ้น-ฐาน-ลง (กลับตัว)
 *
 * เหตุผลที่ฐานคือตัวโซน ไม่ใช่จุดต่ำสุด: ราคาที่วิ่งออกไปแรง ๆ แปลว่ามีออเดอร์ฝั่งเดียว
 * เยอะเกินกว่าอีกฝั่งจะรับไหว — ออเดอร์ที่ "ยังไม่ได้จับคู่" ก็ค้างอยู่ตรงที่มันตั้งไว้
 * ซึ่งคือช่วงราคาของแท่งฐาน ไม่ใช่ปลายไส้
 *
 * ═══ ขอบโซน: ทำไม proximal ใช้ตัวลำ แต่ distal ใช้ไส้ ══════════════════════════════
 *   proximal (ขอบใน — ฝั่งที่ราคาแตะก่อน) = ปลายลำเทียน
 *   distal   (ขอบนอก — ฝั่งไกล)          = ปลายไส้
 *
 * ไม่สมมาตรโดยตั้งใจ: ใช้ลำเป็น proximal ทำให้ "ถือว่าแตะโซนแล้ว" ช้าลง (เข้าไม้ยากขึ้น)
 * ใช้ไส้เป็น distal ทำให้ SL กว้างขึ้น (รอดจากการแกว่งได้มากขึ้น) — ทั้งสองด้าน
 * เลือกทางที่อนุรักษ์นิยมกว่า ถ้าสลับกันจะได้ตัวเลขแบ็คเทสต์ที่สวยกว่าความจริง
 *
 * ═══ กติกาเรื่องเวลา: โซนไม่ได้ "มีอยู่" ตั้งแต่วันที่มันก่อตัว ══════════════════════
 * นี่คือจุดที่โค้ดโซนพังกันบ่อยที่สุด และเป็นจุดที่แบ็คเทสต์จะสวยเกินจริงแบบเงียบ ๆ
 * โซนจะ "รู้ได้" ก็ต่อเมื่อขาออกวิ่งไปไกลพอแล้ว ซึ่งเกิดหลังแท่งฐานหลายแท่ง
 * ทุกโซนจึงพก knownFromIndex ติดตัว = ดัชนีแท่งแรกที่เรารู้ได้จริงว่าโซนนี้มีอยู่
 * และ findZones(candles, atIndex) จะไม่คืนโซนที่ยัง knownFromIndex > atIndex เด็ดขาด
 *
 *   ⇒ ผลที่ตามมา: โซนที่เพิ่งก่อตัวเมื่อวานอาจยังใช้ไม่ได้วันนี้ ซึ่งถูกแล้ว
 */

export type ZoneSide = 'demand' | 'supply';
export type ZoneKind = 'RBR' | 'DBR' | 'DBD' | 'RBD';

/**
 * โซนที่ก่อตัวแล้ว — ทุกค่าในนี้ "ตายตัวตั้งแต่เกิด" ไม่เปลี่ยนอีกเลยไม่ว่าเวลาผ่านไปแค่ไหน
 *
 * แยกจาก Zone โดยตั้งใจ เพราะสองอย่างนี้มีอายุต่างกัน: รูปร่างโซนตัดสินครั้งเดียวตอน
 * ขาออกจบ ส่วนสภาพโซน (แตะกี่ครั้ง ตายหรือยัง) เปลี่ยนทุกแท่ง การแยกทำให้คำนวณ
 * รูปร่างรอบเดียวแล้วเดินสภาพไปข้างหน้าได้ ไม่ต้องสแกนใหม่ทุกแท่ง (O(n) แทน O(n²))
 */
export interface ZoneCandidate {
  side: ZoneSide;
  kind: ZoneKind;
  /** ขอบที่ราคาแตะก่อน — demand คือขอบบน, supply คือขอบล่าง */
  proximal: number;
  /** ขอบไกล — ใช้วาง SL ให้พ้นออกไป */
  distal: number;
  /** เวลาของแท่งฐานใบแรก/ใบสุดท้าย (ใช้วาดกล่องบนกราฟ) */
  startTime: string;
  endTime: string;
  /** ดัชนีแท่งฐานใบแรก/ใบสุดท้าย ในชุดที่ส่งเข้ามา */
  startIndex: number;
  endIndex: number;
  /** แท่งแรกที่ "รู้ได้" ว่าโซนนี้มีอยู่ — ห้ามใช้โซนนี้ก่อนแท่งนี้ */
  knownFromIndex: number;
  /** ขาออกวิ่งไปไกลกี่เท่าของ ATR */
  departureAtr: number;
  /** จำนวนแท่งฐาน */
  baseBars: number;
}

/** สภาพของโซน ณ เวลาหนึ่ง — เปลี่ยนได้ทุกแท่ง */
export interface ZoneState {
  /** ราคากลับมาแตะโซนนี้กี่ครั้งแล้ว (0 = ยังสด) */
  touches: number;
  /** ราคาปิดพ้นขอบนอกไปแล้ว = โครงสร้างพัง โซนใช้ไม่ได้อีก */
  broken: boolean;
}

export type Zone = ZoneCandidate & ZoneState & {
  /** คะแนนคุณภาพ 0–5 */
  score: number;
};

/** ─── ค่าคงที่ทั้งหมดอยู่ที่เดียว เพื่อให้ห้องแล็บปรับแล้ววัดผลได้ ─────────────────── */
export const ZONE_PARAMS = {
  /** ลำเทียนต้องกินพื้นที่กี่ส่วนของช่วงราคาถึงนับว่าเป็นแท่ง "แรง" */
  explosiveBodyRatio: 0.6,
  /** และช่วงราคาต้องกว้างอย่างน้อยกี่เท่าของ ATR */
  explosiveRangeAtr: 1.0,
  /** ฐานยาวได้มากสุดกี่แท่ง — ยาวกว่านี้แปลว่าออเดอร์ถูกดูดซับไปหมดแล้ว */
  maxBaseBars: 6,
  /** ขาออกต้องวิ่งไปไกลอย่างน้อยกี่เท่าของ ATR ถึงจะนับว่าเป็นโซนจริง */
  minDepartureAtr: 2.0,
  /** ให้เวลาขาออกวิ่งกี่แท่ง */
  departureBars: 6,
  /** แตะกี่ครั้งแล้วถือว่าโซนหมดแรง (ตัดทิ้ง) */
  maxTouches: 2,
  /** คาบ ATR ที่ใช้วัดความแรง */
  atrPeriod: 14,
} as const;

type CandleClass = 'up' | 'down' | 'base';

/**
 * ATR แบบ series — ค่าที่ดัชนี i คำนวณจาก candles[0..i] เท่านั้น
 *
 * ไม่เรียก ATR() จาก indicators.ts เพราะตัวนั้นคืน "ค่าเดียวของแท่งล่าสุด" การเรียกมัน
 * ซ้ำทีละแท่งได้ผลถูกแต่เป็น O(n²) และไฟล์นี้ต้องวิ่งบนแท่งหลักหมื่นในห้องแล็บ
 * สูตรตรงกันเป๊ะ (true range เฉลี่ยแบบ simple ไม่ใช่ Wilder) — test เทียบไว้แล้ว
 */
function atrSeries(candles: CandleData[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length < 2) return out;

  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
  }

  let sum = 0;
  for (let i = 1; i < candles.length; i++) {
    sum += trs[i];
    if (i > period) sum -= trs[i - period];
    const n = Math.min(i, period);
    out[i] = sum / n;
  }
  return out;
}

function classify(c: CandleData, atr: number): CandleClass {
  const range = c.high - c.low;
  if (!(range > 0) || !Number.isFinite(atr) || atr <= 0) return 'base';
  const bodyRatio = Math.abs(c.close - c.open) / range;

  if (bodyRatio >= ZONE_PARAMS.explosiveBodyRatio && range >= atr * ZONE_PARAMS.explosiveRangeAtr) {
    return c.close > c.open ? 'up' : 'down';
  }
  return 'base';
}

/**
 * หาโซนทุกใบที่เคยก่อตัวในชุดนี้ — ยังไม่กรองว่าใบไหนยังใช้ได้
 *
 * ผลลัพธ์ไม่ขึ้นกับว่าถามเมื่อไหร่: โซนใบเดิมจะได้ค่าเดิมเสมอ ต่อให้ต่อแท่งเพิ่มไปอีกเป็นพัน
 * (เพราะทุกค่าตัดสินจบภายในหน้าต่างขาออกของตัวเอง) — คุณสมบัตินี้คือสิ่งที่ทำให้
 * ห้องแล็บเดินหน้าทีละแท่งได้โดยไม่ต้องสแกนใหม่ และเป็นสิ่งที่ด่าน causality ตรวจ
 */
export function findZoneCandidates(candles: CandleData[]): ZoneCandidate[] {
  if (candles.length < 10) return [];

  const atr = atrSeries(candles, ZONE_PARAMS.atrPeriod);
  const cls = candles.map((c, i) => classify(c, atr[i]));
  const P = ZONE_PARAMS;
  const zones: ZoneCandidate[] = [];

  // s = แท่งฐานใบแรก · ต้องมีแท่งขาเข้าอยู่ก่อนหน้าอย่างน้อย 1 ใบ
  for (let s = 1; s < candles.length; s++) {
    const legIn = cls[s - 1];
    if (legIn === 'base') continue;

    for (let len = 1; len <= P.maxBaseBars; len++) {
      const e = s + len - 1;
      const out = e + 1;
      if (out >= candles.length) break;
      // ทุกแท่งในช่วง [s..e] ต้องเป็นฐาน — เจอแท่งแรงกลางฐานเมื่อไหร่ก็จบ
      if (cls[e] !== 'base') break;
      const legOut = cls[out];
      if (legOut === 'base') continue;

      const baseBars = candles.slice(s, e + 1);
      const baseAtr = atr[e];
      if (!Number.isFinite(baseAtr) || baseAtr <= 0) continue;

      const side: ZoneSide = legOut === 'up' ? 'demand' : 'supply';
      const kind: ZoneKind =
        side === 'demand' ? (legIn === 'up' ? 'RBR' : 'DBR') : (legIn === 'down' ? 'DBD' : 'RBD');

      // ขอบโซน — proximal จากลำเทียน, distal จากไส้ (เหตุผลอยู่หัวไฟล์)
      const bodyTop = Math.max(...baseBars.map(b => Math.max(b.open, b.close)));
      const bodyBottom = Math.min(...baseBars.map(b => Math.min(b.open, b.close)));
      const wickTop = Math.max(...baseBars.map(b => b.high));
      const wickBottom = Math.min(...baseBars.map(b => b.low));

      const proximal = side === 'demand' ? bodyTop : bodyBottom;
      const distal = side === 'demand' ? wickBottom : wickTop;
      // โซนที่ไม่มีความหนา (ลำเทียนกินเต็มช่วง) วาง SL ไม่ได้ ข้ามไป
      if (side === 'demand' ? !(distal < proximal) : !(distal > proximal)) continue;

      // ขาออกวิ่งไปไกลแค่ไหน — วัดจาก proximal ตลอดหน้าต่าง departureBars แท่ง
      //
      // ⚠ หน้าต่างต้องครบก่อนถึงจะตัดสิน และ knownFromIndex คือ "ปลายหน้าต่าง"
      // ไม่ใช่แท่งที่วิ่งครบระยะ — เพราะ departureAtr วัดจากทั้งหน้าต่าง
      // ถ้าประกาศรู้ตั้งแต่กลางหน้าต่าง โซนจะพกคะแนนที่คำนวณจากแท่งซึ่ง ณ ตอนนั้น
      // ยังไม่เกิด (score += 1 เมื่อ departureAtr >= 3) — คือรู้อนาคตของตัวเอง
      // ผลข้างเคียงที่ยอมรับ: โซนใช้ได้ช้าลงไม่เกิน departureBars แท่ง ซึ่งแทบไม่มีผล
      // เพราะราคาแทบไม่เคยย้อนกลับมาที่โซนภายในไม่กี่แท่งหลังวิ่งออกไปแรง ๆ
      const winEnd = out + P.departureBars - 1;
      if (winEnd >= candles.length) break; // หน้าต่างยังไม่ครบ ยังตัดสินไม่ได้

      let extreme = side === 'demand' ? -Infinity : Infinity;
      for (let k = out; k <= winEnd; k++) {
        extreme = side === 'demand'
          ? Math.max(extreme, candles[k].high)
          : Math.min(extreme, candles[k].low);
      }
      const travelled = side === 'demand' ? extreme - proximal : proximal - extreme;
      if (travelled < baseAtr * P.minDepartureAtr) continue; // วิ่งไม่ไกลพอ ไม่นับเป็นโซน

      zones.push({
        side, kind, proximal, distal,
        startTime: candles[s].timestamp,
        endTime: candles[e].timestamp,
        startIndex: s, endIndex: e,
        knownFromIndex: winEnd,
        departureAtr: travelled / baseAtr,
        baseBars: len,
      });
      break; // ฐานนี้จบแล้ว ไม่ต้องลองความยาวอื่นจากจุดเริ่มเดียวกัน
    }
  }

  return zones;
}

/**
 * สภาพของโซน ณ แท่งที่ atIndex — แตะไปกี่ครั้งแล้ว และตายหรือยัง
 *
 * "แตะ" นับเป็นครั้ง ไม่ใช่นับแท่ง: ราคาที่ค้างอยู่ในโซนสิบแท่งคือการแตะครั้งเดียว
 * ต้องออกจากโซนก่อนถึงจะนับครั้งใหม่ ไม่งั้นโซนที่ราคาแกว่งอยู่แถวนั้นจะ "หมดอายุ"
 * ทันทีทั้งที่ยังไม่มีใครทดสอบมันซ้ำจริง ๆ
 */
export function zoneStateAt(candles: CandleData[], z: ZoneCandidate, atIndex: number): ZoneState {
  let touches = 0;
  let inside = false;
  const last = Math.min(atIndex, candles.length - 1);
  for (let k = z.knownFromIndex + 1; k <= last; k++) {
    const c = candles[k];
    // ปิดพ้น distal = โครงสร้างพัง โซนตาย
    if (z.side === 'demand' ? c.close < z.distal : c.close > z.distal) return { touches, broken: true };
    const isIn = z.side === 'demand' ? c.low <= z.proximal : c.high >= z.proximal;
    if (isIn && !inside) touches++;
    inside = isIn;
  }
  return { touches, broken: false };
}

/** คะแนนคุณภาพ: สดคือดีที่สุด · ขาออกแรงคือดี · ฐานสั้นคือดี */
export function zoneScore(z: ZoneCandidate, touches: number): number {
  let score = ZONE_PARAMS.maxTouches + 1 - touches;   // 0 แตะ = 3
  if (z.departureAtr >= 3) score += 1;
  if (z.baseBars <= 3) score += 1;
  return Math.min(score, 5);
}

/**
 * หาโซนทั้งหมดที่ "รู้ได้แล้วและยังใช้ได้" ณ แท่งที่ atIndex
 *
 * @param atIndex ดัชนีแท่งปัจจุบัน (ไม่ส่ง = แท่งสุดท้าย) — โซนที่ยังไม่ถึงเวลารู้จะไม่ถูกคืน
 */
export function findZones(candles: CandleData[], atIndex?: number): Zone[] {
  const now = atIndex ?? candles.length - 1;
  if (candles.length < 10 || now < 0) return [];

  const out: Zone[] = [];
  for (const z of findZoneCandidates(candles)) {
    if (z.knownFromIndex > now) continue;
    const st = zoneStateAt(candles, z, now);
    if (st.broken || st.touches > ZONE_PARAMS.maxTouches) continue;
    out.push({ ...z, ...st, score: zoneScore(z, st.touches) });
  }
  return dedupe(out);
}

/**
 * โซนที่ทับกันเองต้องเหลือตัวเดียว
 *
 * ฐานยาว ๆ ทำให้เกิดโซนซ้อนกันหลายใบจากบริเวณเดียว ถ้าไม่ตัดออก การนับ
 * "มีโซนรออยู่กี่ใบ" จะเฟ้อ และคะแนนที่อิงจำนวนโซนจะบวมตามความยาวฐาน
 * เก็บใบที่คะแนนสูงกว่า เท่ากันเก็บใบที่ใหม่กว่า
 */
function dedupe(zones: Zone[]): Zone[] {
  const kept: Zone[] = [];
  const sorted = [...zones].sort((a, b) => b.score - a.score || b.endIndex - a.endIndex);
  for (const z of sorted) {
    const overlaps = kept.some(k =>
      k.side === z.side &&
      Math.min(k.proximal, k.distal) <= Math.max(z.proximal, z.distal) &&
      Math.max(k.proximal, k.distal) >= Math.min(z.proximal, z.distal)
    );
    if (!overlaps) kept.push(z);
  }
  return kept.sort((a, b) => a.endIndex - b.endIndex);
}

/**
 * โซนที่ใกล้ราคาที่สุดในแต่ละฝั่ง — ตัวที่เครื่องยนต์เอาไปใช้จริง
 *
 * demand ต้องอยู่ "ใต้" ราคา และ supply ต้องอยู่ "เหนือ" ราคา
 * โซนที่ราคาทะลุเข้าไปแล้ว (อยู่ระหว่างกลาง) ไม่คืนให้ เพราะมันไม่ใช่แนวรับ/แนวต้าน
 * ของราคาปัจจุบันอีกต่อไป — บทเรียนเดียวกับที่ signal-engine เคยเจอกับ nearSupport
 * ที่ไม่กรองฝั่งแล้วได้ SL สูงกว่าราคาเข้า
 */
export function nearestZones(zones: Zone[], price: number, maxDistancePct = 0.03) {
  const within = (z: Zone) => Math.abs(price - z.proximal) / price <= maxDistancePct;

  const demand = zones
    .filter(z => z.side === 'demand' && z.proximal < price && within(z))
    .sort((a, b) => b.proximal - a.proximal)[0];

  const supply = zones
    .filter(z => z.side === 'supply' && z.proximal > price && within(z))
    .sort((a, b) => a.proximal - b.proximal)[0];

  return { demand: demand ?? null, supply: supply ?? null };
}
