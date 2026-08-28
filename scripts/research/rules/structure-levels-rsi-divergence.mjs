/**
 * RSI Divergence ที่ pivot ที่ "ยืนยันแล้ว" — โมเมนตัม × โครงสร้าง
 *
 * ─────────────────────────────── แนวคิดที่มา ───────────────────────────────
 *
 * ราคาทำจุดต่ำใหม่ แต่แรงที่พาลงมาอ่อนกว่ารอบก่อน = คนขายกำลังหมดแรง
 * ปัญหาของ divergence ที่คนส่วนใหญ่ใช้คือวัดจาก "จุดต่ำที่ตาเห็น" ซึ่งเป็นจุดต่ำก็ต่อเมื่อ
 * มองย้อนหลังแล้วเท่านั้น กฎนี้จึงบังคับว่า pivot จะนับได้ต่อเมื่อมีแท่งหลังมันครบ
 * pivotLookback แท่งแล้ว — pivot ล่าสุดที่ใช้ได้จึงอยู่ที่ index = t − pivotLookback เสมอ
 * ราคาที่จ่ายคือสัญญาณมาช้า pivotLookback แท่ง ซึ่งเป็นราคาที่ต้องจ่ายจริงในโลกจริง
 *
 * ─────────────────────────── ทำไมเกณฑ์ถึงตั้งแบบนี้ ───────────────────────────
 *
 * · ยิงครั้งเดียวตอน pivot ที่สองเพิ่งถูกยืนยัน (t === p2 + pivotLookback) ไม่ยิงซ้ำ
 *   ทุกแท่งหลังจากนั้น เพราะถ้ายิงซ้ำ ไม้ที่ได้จะเป็นไม้เดียวกันนับหลายรอบ
 *   แล้วสถิติจะบวมโดยที่ไม่มีข้อมูลใหม่เข้ามาเลย
 * · จุดต่ำใหม่ต้อง "ต่ำกว่าจริง" อย่างน้อย minPriceGapAtr × ATR ไม่ใช่ต่ำกว่าแค่ 1 tick
 *   เพราะจุดต่ำที่ต่ำกว่าเดิมนิดเดียวคือ noise ไม่ใช่การทำ lower low
 * · RSI ต้องต่างกันอย่างน้อย minRsiGap จุด ด้วยเหตุผลเดียวกัน
 * · บังคับให้ divergence ฝั่งซื้อเกิดตอน RSI ทั้งสอง pivot อยู่ต่ำกว่า rsiMidline
 *   (และฝั่งขายอยู่สูงกว่า) เพราะ divergence กลางโซนเฉย ๆ คือความบังเอิญของเส้น
 *   ไม่ใช่สภาวะที่แรงกำลังหมด
 * · ใช้ pivot ก่อนหน้า "ตัวที่อยู่ติดกัน" ตัวเดียว ไม่ไล่หาคู่ที่สวยที่สุดในอดีต
 *   เพราะการเลือกคู่ได้อิสระคือช่องให้ curve-fit โดยไม่รู้ตัว
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. สัญญาณมาช้า pivotLookback แท่งเสมอ และเข้าไม้ที่แท่งถัดไปอีก — รวมแล้วช้า 6 แท่ง
 *    จากจุดต่ำจริง ในกรอบ 1H ที่เพดานถือมีแค่ 24 แท่ง ความช้านี้กินไปหนึ่งในสี่ของอายุไม้
 * 2. วัด divergence จากคู่ pivot คู่เดียว ไม่รองรับ divergence สามขา (ซึ่งของจริงเจอบ่อย)
 *    และไม่รู้จัก hidden divergence เลย
 * 3. ในเทรนด์ลงแรง ๆ ราคาทำ lower low ทุกครั้งพร้อม RSI ที่ยกตัวเพราะ RSI อิ่มตัวที่ก้น
 *    กฎนี้จะยิงซื้อสวนซ้ำ ๆ ในเทรนด์ลง และไม่มีตัวกรองเทรนด์มากันไว้ (ตั้งใจไม่ใส่
 *    เพื่อให้วัดตัว divergence ล้วน ๆ ว่ามีค่าเท่าไร ก่อนจะไปประกอบกับกฎอื่น)
 * 4. RSI ผูกกับคาบ 14 ตายตัวตามที่ตัวรันคำนวณมาให้ เปลี่ยนคาบไม่ได้จากในไฟล์นี้
 */

export const meta = {
  id: 'structure-levels-rsi-divergence',
  name: 'RSI Divergence ที่ pivot ยืนยันแล้ว',
  family: 'confluence',
  needsHtf: false,
  params: {
    /** จำนวนแท่งสองข้างที่ต้องเอาชนะถึงจะนับเป็น pivot — และคือความช้าของสัญญาณด้วย */
    pivotLookback: 5,
    /** ระยะห่างขั้นต่ำระหว่าง pivot สองตัว (แท่ง) — ใกล้กว่านี้คือคลื่นเดียวกัน */
    minPivotGap: 5,
    /** ระยะห่างสูงสุด — ไกลกว่านี้คนละบริบทตลาดแล้ว เทียบโมเมนตัมกันไม่มีความหมาย */
    maxPivotGap: 60,
    /** RSI ต้องต่างกันอย่างน้อยกี่จุดถึงจะเรียกว่า divergence */
    minRsiGap: 3,
    /** ราคาต้องทำจุดสุดขั้วใหม่เกินเดิมอย่างน้อยกี่เท่าของ ATR */
    minPriceGapAtr: 0.25,
    /** เส้นแบ่งโซน — bull ต้องอยู่ใต้เส้นทั้งคู่ · bear ต้องอยู่เหนือเส้นทั้งคู่ */
    rsiMidline: 50,
    /** ตัวหารแปลงช่องว่าง RSI เป็นคะแนน 0..1 */
    scoreRsiSpan: 15,
  },
};

/**
 * แคช pivot ต่อ "ตัวตนของอาร์เรย์ bars" หนึ่งชุด
 *
 * ทำไมปลอดภัยกับ causality: pivot ที่ index p ตัดสินจาก bars[p−L..p+L] เท่านั้น
 * และผู้เรียกขอได้แค่ p <= t − L เสมอ แปลว่าไม่มีทางอ่านเลย bars[t]
 * ส่วนตอนตรวจ causality ตัวรันส่ง bars.slice(0, t+1) ซึ่งเป็นอาร์เรย์คนละก้อน
 * จึงได้แคชใหม่และคำนวณใหม่ทั้งหมด — ผลต้องเท่ากันโดยโครงสร้าง
 *
 * ทำไมต้องมี: ตัวรันเรียก evaluate ทุกแท่งของ 13 ตัว × 2 กรอบเวลา (~2.6 แสนครั้ง)
 * ถ้าสแกน pivot ใหม่ทั้งหน้าต่างทุกครั้งจะช้าจนวัดไม่ไหว
 */
const PIVOT_CACHE = new WeakMap();

/**
 * คืนรายการ index ของ pivot high / pivot low ที่ยืนยันแล้วถึง uptoPivotIdx
 * @param {Array} bars
 * @param {number} lookback
 * @param {number} uptoPivotIdx  index สูงสุดที่ยอมให้เป็น pivot (ต้อง <= t − lookback)
 */
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
      // เข้ม > ทางขวา หลวม >= ทางซ้าย เพื่อให้กรณีค่าเท่ากันตัดสินได้ค่าเดียวเสมอ
      if (isHigh && !(c.high >= a.high && c.high > b.high)) isHigh = false;
      if (isLow && !(c.low <= a.low && c.low < b.low)) isLow = false;
    }
    if (isHigh) m.highs.push(p);
    if (isLow) m.lows.push(p);
  }
  if (uptoPivotIdx > m.scanned) m.scanned = uptoPivotIdx;
  return m;
}

/** index ของ pivot ตัวสุดท้ายในรายการที่ < before — คืน −1 ถ้าไม่มี */
function lastPivotBefore(list, before) {
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < before) { ans = list[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

const NONE = { bull: false, bear: false, veto: null, score: 0 };

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null, score: number}}
 */
export function evaluate(ctx) {
  const P = meta.params;
  const { bars, t, ind } = ctx;

  // ต้องมีที่ว่างพอให้มี pivot สองตัวที่ห่างกันได้ตามเกณฑ์
  if (t < P.pivotLookback * 2 + P.minPivotGap) return NONE;

  // pivot ตัวที่สองต้องเป็นตัวที่ "เพิ่งยืนยันที่แท่งนี้พอดี" — ยิงครั้งเดียวต่อหนึ่งเหตุการณ์
  const p2 = t - P.pivotLookback;
  const piv = confirmedPivots(bars, P.pivotLookback, p2);

  const isLow = piv.lows.length > 0 && piv.lows[piv.lows.length - 1] === p2;
  const isHigh = piv.highs.length > 0 && piv.highs[piv.highs.length - 1] === p2;
  // ถ้าแคชเคยถูกไล่ไปไกลกว่านี้ (เกิดตอนตัวรันสุ่มดัชนีตรวจ causality) ตัวสุดท้ายในรายการ
  // อาจเลย p2 ไปแล้ว จึงต้องเช็คแบบไม่พึ่งตำแหน่งสุดท้าย
  const p2IsLow = isLow || binaryHas(piv.lows, p2);
  const p2IsHigh = isHigh || binaryHas(piv.highs, p2);
  if (!p2IsLow && !p2IsHigh) return NONE;

  const atr = ind.atr[p2];
  if (!Number.isFinite(atr) || !(atr > 0)) return NONE;

  let bull = false;
  let bear = false;
  let score = 0;

  if (p2IsLow) {
    const p1 = lastPivotBefore(piv.lows, p2);
    if (p1 >= 0) {
      const gap = p2 - p1;
      const lo1 = bars[p1].low;
      const lo2 = bars[p2].low;
      const r1 = ind.rsi[p1];
      const r2 = ind.rsi[p2];
      if (
        gap >= P.minPivotGap && gap <= P.maxPivotGap
        && Number.isFinite(lo1) && Number.isFinite(lo2)
        && Number.isFinite(r1) && Number.isFinite(r2)
        && lo2 < lo1 - P.minPriceGapAtr * atr   // ราคาทำ lower low จริง
        && r2 > r1 + P.minRsiGap                // แต่ RSI ทำ higher low
        && r1 < P.rsiMidline && r2 < P.rsiMidline
      ) {
        bull = true;
        score = Math.min(1, (r2 - r1) / P.scoreRsiSpan);
      }
    }
  }

  if (p2IsHigh) {
    const p1 = lastPivotBefore(piv.highs, p2);
    if (p1 >= 0) {
      const gap = p2 - p1;
      const hi1 = bars[p1].high;
      const hi2 = bars[p2].high;
      const r1 = ind.rsi[p1];
      const r2 = ind.rsi[p2];
      if (
        gap >= P.minPivotGap && gap <= P.maxPivotGap
        && Number.isFinite(hi1) && Number.isFinite(hi2)
        && Number.isFinite(r1) && Number.isFinite(r2)
        && hi2 > hi1 + P.minPriceGapAtr * atr
        && r2 < r1 - P.minRsiGap
        && r1 > P.rsiMidline && r2 > P.rsiMidline
      ) {
        bear = true;
        score = Math.max(score, Math.min(1, (r1 - r2) / P.scoreRsiSpan));
      }
    }
  }

  // แท่งเดียวเป็นทั้ง pivot high และ pivot low ได้ในทางทฤษฎี (หน้าต่างแบน)
  // ถ้าเกิดขึ้นแล้วเห็น divergence ทั้งสองฝั่ง แปลว่ากฎนี้ไม่มีความเห็น ไม่ใช่มีสองความเห็น
  if (bull && bear) return NONE;

  return { bull, bear, veto: null, score: bull || bear ? score : 0 };
}

/** มี v อยู่ในอาร์เรย์เรียงขึ้นหรือไม่ */
function binaryHas(list, v) {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] === v) return true;
    if (list[mid] < v) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}
