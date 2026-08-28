/**
 * Touch-Count Clustered Support / Resistance — แนวที่ "ถูกแตะหลายครั้ง" ไม่ใช่ swing เปล่า ๆ
 *
 * ─────────────────────────────── แนวคิดที่มา ───────────────────────────────
 *
 * swing high/low เดี่ยว ๆ เป็นแค่จุดที่ราคาเคยกลับตัวหนึ่งครั้ง ซึ่งเกิดได้ด้วยความบังเอิญล้วน ๆ
 * สิ่งที่พอจะเรียกว่า "แนว" ได้ต้องเป็นราคาที่ตลาดกลับมาแล้วกลับมาอีกหลายรอบ กฎนี้จึงไม่ใช้
 * pivot ดิบ แต่เอา pivot ทั้งหมดในหน้าต่างมาจัดกลุ่มด้วยระยะที่วัดเป็นเท่าของ ATR
 * แล้วนับว่ากลุ่มนั้นมีสมาชิกกี่ตัว — จำนวนสมาชิกคือ "จำนวนครั้งที่ถูกแตะ"
 *
 * ใช้ระยะเป็นเท่าของ ATR ไม่ใช่เปอร์เซ็นต์ตายตัว เพราะเกณฑ์ "ใกล้กันพอจะเป็นแนวเดียวกัน"
 * ของทองคำกับของ EURGBP ไม่ใช่ตัวเลขเดียวกัน แต่เป็นสัดส่วนเดียวกันของความผันผวน
 *
 * รวม pivot high กับ pivot low เข้ากลุ่มเดียวกันโดยตั้งใจ เพราะแนวต้านที่ถูกทะลุแล้ว
 * กลายเป็นแนวรับ (polarity flip) เป็นพฤติกรรมที่กฎนี้อยากจับ ถ้าแยกสองฝั่งจะนับไม่ครบ
 *
 * ─────────────────────────── ทำไมเกณฑ์ถึงตั้งแบบนี้ ───────────────────────────
 *
 * · pivot ต้องยืนยันแล้วเท่านั้น (index <= t − pivotLookback) แนวที่สร้างจากจุดที่ยัง
 *   ไม่ยืนยันคือแนวที่รู้ได้เฉพาะคนที่เห็นอนาคต
 * · ต้อง "แตะแล้วเด้ง" ในแท่งเดียวกัน ไม่ใช่แค่ราคาอยู่ใกล้แนว — วัดด้วยตำแหน่งราคาปิด
 *   ในกรอบแท่ง (closeLocation) ต้องอยู่ครึ่งบนชัด ๆ สำหรับฝั่งซื้อ
 * · บังคับว่าแท่งก่อนหน้า "ยังไม่แตะ" โซนนี้ เพื่อให้ยิงครั้งเดียวตอนเข้าโซน
 *   ไม่ใช่ยิงทุกแท่งตลอดเวลาที่ราคานั่งอยู่ในโซน (ซึ่งจะทำให้ไม้เดียวถูกนับหลายรอบ)
 * · minCloseLocation ตั้งที่ 0.6 ทำให้แถบของ bull (>= 0.6) กับ bear (<= 0.4) ไม่ทับกัน
 *   จึงเป็นไปไม่ได้ที่กฎจะออกสองฝั่งพร้อมกัน
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. "จำนวนครั้งที่ถูกแตะ" นับจาก pivot ที่ยืนยันแล้วเท่านั้น แนวที่ราคาไถไปตามทั้งสิบแท่ง
 *    แต่ไม่เกิด pivot สักตัวจะถูกนับเป็น 0 ทั้งที่ตาคนเห็นว่าเป็นแนวชัด ๆ
 * 2. กลุ่มถูกคำนวณใหม่ทุกแท่ง ตัวตนของแนวจึงไม่ต่อเนื่อง — แนวเดียวกันอาจมีจำนวนสมาชิก
 *    ขยับขึ้นลงเมื่อ ATR เปลี่ยน เพราะความกว้างของกลุ่มผูกกับ ATR ปัจจุบัน
 * 3. หน้าต่างวัดเป็น "จำนวนแท่ง" ไม่ใช่ "เวลา" — บน 1H หน้าต่าง 250 แท่งคือราว 10 วัน
 *    ซึ่งสั้นกว่าที่นักเทรดส่วนใหญ่หมายถึงเวลาพูดถึงแนวรับแนวต้านมาก
 * 4. ไม่มีตัวกรองเทรนด์ ในเทรนด์ลงแรง แนวรับจะถูกทะลุเป็นเรื่องปกติ กฎนี้จะซื้อรับมีดตก
 * 5. ไม่ได้ใช้ volume ยืนยันการแตะแนว เพราะแคช FOREX 11 ตัวจาก 13 ตัวมี volume = 0
 *    (ind.volumeRatio เป็น NaN) ถ้าใส่เงื่อนไข volume กฎนี้จะเหลือแค่ทองคำกับเงิน
 */

export const meta = {
  id: 'structure-levels-touch-cluster-sr',
  name: 'แนวรับ/ต้านจากการจัดกลุ่ม pivot ตามจำนวนครั้งที่ถูกแตะ',
  family: 'structure',
  needsHtf: false,
  params: {
    /** จำนวนแท่งสองข้างที่ต้องเอาชนะถึงจะนับเป็น pivot */
    pivotLookback: 4,
    /** ย้อนหลังกี่แท่งในการเก็บ pivot มาสร้างแนว */
    windowBars: 250,
    /** pivot ที่ราคาห่างกันไม่เกินกี่เท่าของ ATR ถือเป็นแนวเดียวกัน */
    clusterAtr: 0.5,
    /** ตัดเฉพาะ pivot ที่อยู่ในรัศมีนี้จากราคาปิด — ทั้งเพื่อความหมายและความเร็ว */
    searchRadiusAtr: 8,
    /** ต้องมี pivot ในกลุ่มอย่างน้อยกี่ตัวถึงจะเรียกว่าแนว */
    minTouches: 3,
    /** แท่งปัจจุบันต้องเข้าใกล้แนวภายในกี่เท่าของ ATR ถึงจะนับว่า "แตะ" */
    proximityAtr: 0.35,
    /** ตำแหน่งราคาปิดในกรอบแท่ง (0 = ปิดที่ก้น, 1 = ปิดที่ยอด) ที่ยอมรับสำหรับฝั่งซื้อ */
    minCloseLocation: 0.6,
    /** ตัวหารแปลงจำนวนครั้งที่ถูกแตะส่วนเกินเป็นคะแนน 0..1 */
    scoreTouchSpan: 4,
  },
};

/**
 * แคช pivot ต่ออาร์เรย์ bars หนึ่งก้อน — เหตุผลเดียวกับในไฟล์ divergence
 * ปลอดภัยกับ causality เพราะ pivot ที่ p ตัดสินจาก bars[p−L..p+L] และผู้เรียกขอได้แค่
 * p <= t − L เท่านั้น จึงไม่มีทางอ่านเลยแท่งปัจจุบัน
 */
const PIVOT_CACHE = new WeakMap();

function confirmedPivots(bars, lookback, uptoPivotIdx) {
  let m = PIVOT_CACHE.get(bars);
  if (!m || m.lookback !== lookback) {
    m = { lookback, scanned: -1, highs: [], lows: [] };
    PIVOT_CACHE.set(bars, m);
  }
  for (let p = Math.max(m.scanned + 1, lookback); p <= uptoPivotIdx; p++) {
    const c = bars[p];
    let isHigh = Number.isFinite(c.high);
    let isLow = Number.isFinite(c.low);
    for (let k = 1; k <= lookback && (isHigh || isLow); k++) {
      const a = bars[p - k];
      const b = bars[p + k];
      if (isHigh && !(c.high >= a.high && c.high > b.high)) isHigh = false;
      if (isLow && !(c.low <= a.low && c.low < b.low)) isLow = false;
    }
    if (isHigh) m.highs.push(p);
    if (isLow) m.lows.push(p);
  }
  if (uptoPivotIdx > m.scanned) m.scanned = uptoPivotIdx;
  return m;
}

/** ตำแหน่งแรกในอาร์เรย์เรียงขึ้นที่ค่า >= v */
function lowerBound(list, v) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < v) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** เก็บราคาของ pivot ที่อยู่ในช่วง index [from, to] และอยู่ในรัศมีจาก ref */
function collectLevels(bars, list, from, to, pick, ref, radius, out) {
  for (let i = lowerBound(list, from); i < list.length; i++) {
    const p = list[i];
    if (p > to) break;
    const price = pick(bars[p]);
    if (!Number.isFinite(price)) continue;
    if (Math.abs(price - ref) > radius) continue;
    out.push(price);
  }
}

const NONE = { bull: false, bear: false, veto: null, score: 0 };

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null, score: number}}
 */
export function evaluate(ctx) {
  const P = meta.params;
  const { bars, t, ind } = ctx;

  if (t < P.pivotLookback * 2 + 2) return NONE;

  const atr = ind.atr[t];
  if (!Number.isFinite(atr) || !(atr > 0)) return NONE;

  const cur = bars[t];
  const prev = bars[t - 1];
  const { high, low, close } = cur;
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return NONE;
  if (!Number.isFinite(prev.low) || !Number.isFinite(prev.high)) return NONE;

  const barRange = high - low;
  if (!(barRange > 0)) return NONE; // แท่งแบนสนิท ไม่มีข้อมูลเรื่องการปฏิเสธราคา
  const closeLoc = (close - low) / barRange;

  const lastPivotIdx = t - P.pivotLookback;
  const from = Math.max(0, t - P.windowBars);
  if (lastPivotIdx < from) return NONE;

  const piv = confirmedPivots(bars, P.pivotLookback, lastPivotIdx);
  const radius = P.searchRadiusAtr * atr;
  const prices = [];
  collectLevels(bars, piv.highs, from, lastPivotIdx, (b) => b.high, close, radius, prices);
  collectLevels(bars, piv.lows, from, lastPivotIdx, (b) => b.low, close, radius, prices);
  if (prices.length < P.minTouches) return NONE;

  prices.sort((a, b) => a - b);

  // จัดกลุ่มแบบไล่จากราคาต่ำไปสูง ตัดกลุ่มใหม่เมื่อช่องว่างเกิน clusterAtr × ATR
  const gap = P.clusterAtr * atr;
  const tol = P.proximityAtr * atr;
  const clusters = [];
  let sum = prices[0];
  let count = 1;
  let last = prices[0];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] - last > gap) {
      clusters.push({ level: sum / count, touches: count });
      sum = prices[i];
      count = 1;
    } else {
      sum += prices[i];
      count++;
    }
    last = prices[i];
  }
  clusters.push({ level: sum / count, touches: count });

  // เลือกแนวรับที่ดีที่สุด: ถูกแตะมากที่สุด · เสมอกันเลือกตัวที่ใกล้ราคาปิดที่สุด
  let bestSup = null;
  let bestRes = null;
  for (const c of clusters) {
    if (c.touches < P.minTouches) continue;

    // แนวรับ: อยู่ไม่เหนือราคาปิด · แท่งนี้ลงไปแตะ · แท่งก่อนหน้ายังไม่แตะ (เข้าโซนครั้งแรก)
    if (c.level <= close && low <= c.level + tol && prev.low > c.level + tol) {
      if (!bestSup || c.touches > bestSup.touches
        || (c.touches === bestSup.touches && close - c.level < close - bestSup.level)) {
        bestSup = c;
      }
    }

    // แนวต้าน: กระจกเงาของด้านบน
    if (c.level >= close && high >= c.level - tol && prev.high < c.level - tol) {
      if (!bestRes || c.touches > bestRes.touches
        || (c.touches === bestRes.touches && c.level - close < bestRes.level - close)) {
        bestRes = c;
      }
    }
  }

  const bull = bestSup !== null && closeLoc >= P.minCloseLocation;
  const bear = bestRes !== null && closeLoc <= 1 - P.minCloseLocation;
  // minCloseLocation = 0.6 ทำให้สองเงื่อนไขนี้ทับกันไม่ได้ แต่กันไว้เผื่อมีคนแก้ค่าเป็น 0.5
  if (bull && bear) return NONE;
  if (!bull && !bear) return NONE;

  const touches = bull ? bestSup.touches : bestRes.touches;
  const score = Math.min(1, (touches - P.minTouches + 1) / P.scoreTouchSpan);
  return { bull, bear, veto: null, score };
}
