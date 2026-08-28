/**
 * Family Quorum Gate — บังคับให้สัญญาณมาจากคนละ "ตระกูล" ไม่ใช่จากญาติกันเอง
 *
 * ─────────────────────────────── แนวคิดที่มา ───────────────────────────────
 *
 * ปัญหาของการนับ confluence แบบเดิมคือมันนับ "จำนวนเงื่อนไข" ไม่ใช่ "จำนวนหลักฐาน"
 * close>ma50 · ma50>ma200 · rsi>50 · macd>signal สี่ข้อนี้ดูเหมือนสี่เสียง แต่ในทางสถิติ
 * มันคือเสียงเดียวกันพูดสี่รอบ เพราะทุกข้ออ่านจาก "ราคาที่กำลังขึ้น" ตัวเดียวกัน
 * เวลาเทรนด์กลับตัว มันผิดพร้อมกันทั้งสี่ข้อ — ความมั่นใจที่ได้จึงเป็นของปลอม
 *
 * กฎนี้จึงจัดเงื่อนไขเป็น 4 ตระกูลที่ "อ่านคนละอย่าง" แล้วนับที่ระดับตระกูล:
 *   TREND     — ทิศของโครงสร้างค่าเฉลี่ย (close vs ma50, ma50 vs ma200)
 *   MOMENTUM  — อัตราเร่ง (macd เทียบ signal + ทิศของ histogram)
 *   MEANREV   — ตำแหน่งในกรอบ (%B ของ Bollinger หรือ RSI สุดขั้ว)
 *   STRUCTURE — ยอด/ก้นที่ยืนยันแล้ว (higher-high + higher-low)
 * ในตระกูลเดียวกันพูดกี่รอบก็ได้เสียงเดียว ข้ามตระกูลเท่านั้นที่เพิ่มน้ำหนัก
 *
 * ─────────────────────────────── ทำไมเกณฑ์เป็นแบบนี้ ───────────────────────────────
 *
 * · minFamilies = 3 จาก 4 — 2 จาก 4 หลวมเกินจนกลายเป็น "เทรนด์ + โมเมนตัม" ซึ่งเป็น
 *   คู่ที่สัมพันธ์กันสูงที่สุดอยู่แล้ว ส่วน 4 จาก 4 แทบเป็นไปไม่ได้เพราะ MEANREV
 *   ขัดกับ TREND โดยธรรมชาติ (เทรนด์แรง = ไม่ oversold)
 * · maxOpposingFamilies = 1 — ยอมให้มีตระกูลที่เห็นตรงข้ามได้หนึ่งเสียง ด้วยเหตุผลข้างบน:
 *   ถ้าตั้ง 0 กฎจะตายเพราะ MEANREV เกือบจะขวางทุกครั้งที่เทรนด์ยังแรง
 * · MEANREV ใช้ OR ระหว่าง %B กับ RSI ไม่ใช่ AND — สองตัวนี้วัดเรื่องเดียวกัน
 *   การใช้ AND คือการขอให้ "เรื่องเดียวกัน" ยืนยันสองครั้ง ซึ่งแค่ทำให้สัญญาณหายไปเฉย ๆ
 *
 * ─────────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────────
 *
 * 1. เป็นกฎแบบ "สถานะ" ไม่ใช่ "จังหวะ" — ตราบใดที่โควรัมยังครบ มันออกสัญญาณทุกแท่ง
 *    ไม้ที่ได้จึงซ้อนทับกันหนักมาก จำนวนไม้ที่เห็นในรายงาน "ไม่ใช่" จำนวนโอกาสอิสระ
 *    ค่า CI ที่ cluster ตาม symbol ช่วยได้บางส่วน แต่ยังไม่ได้แก้เรื่องการซ้อนทับในตัวเดียวกัน
 * 2. การแบ่งตระกูลเป็นการตัดสินใจของมนุษย์ ไม่ได้มาจากการวัดสหสัมพันธ์จริง
 *    MOMENTUM (MACD) กับ TREND (MA) ยังสัมพันธ์กันสูงกว่าที่ชื่อตระกูลทำให้รู้สึก
 * 3. STRUCTURE ต้องรอ pivot ยืนยัน (i + pivotLookback <= t) จึงช้ากว่าอีกสามตระกูลเสมอ
 *    ตอนตลาดกลับตัวเร็ว ๆ ตระกูลนี้จะยังเถียงอยู่กับโครงสร้างเก่าอีกอย่างน้อย 5 แท่ง
 * 4. ma200 ต้องใช้ 200 แท่ง ช่วงต้นชุดของทุก symbol จึงไม่มีวันออกสัญญาณ — ไม่ใช่บั๊ก
 *    แต่แปลว่า "จำนวนแท่งที่มีสิทธิ์ออกสัญญาณ" น้อยกว่าจำนวนแท่งทั้งหมดอยู่พอสมควร
 */

export const meta = {
  id: 'confluence-core-family-quorum',
  name: 'โควรัมข้ามตระกูล: ต้องมีอย่างน้อย 3 ใน 4 ตระกูลเห็นตรงกัน',
  family: 'confluence',
  needsHtf: false,
  params: {
    /** จำนวนตระกูลขั้นต่ำที่ต้องเห็นตรงกัน (จากทั้งหมด 4) */
    minFamilies: 3,
    /** จำนวนตระกูลที่ยอมให้เห็นตรงข้ามได้ */
    maxOpposingFamilies: 1,
    /** MOMENTUM: เทียบ histogram กับกี่แท่งก่อนหน้า เพื่อดูว่าเร่งขึ้นหรือชะลอ */
    momHistLookback: 1,
    /** MEANREV: %B (ตำแหน่งราคาในกรอบ Bollinger) ต่ำกว่านี้ = ฝั่งซื้อ */
    meanRevPercentBLow: 0.25,
    /** MEANREV: %B สูงกว่านี้ = ฝั่งขาย */
    meanRevPercentBHigh: 0.75,
    /** MEANREV: RSI ต่ำกว่านี้ = ฝั่งซื้อ (ใช้ OR กับ %B) */
    meanRevRsiLow: 40,
    /** MEANREV: RSI สูงกว่านี้ = ฝั่งขาย */
    meanRevRsiHigh: 60,
    /** STRUCTURE: ต้องมีแท่งซ้ายและขวาข้างละเท่านี้ pivot ถึงจะ "ยืนยัน" */
    pivotLookback: 5,
    /** STRUCTURE: ย้อนหา pivot ได้ลึกสุดกี่แท่ง (กันลูปยาวโดยไม่จำเป็น) */
    pivotScanBars: 150,
    /** จำนวนตระกูลทั้งหมด — ใช้เป็นตัวหารของ score */
    familyCount: 4,
  },
};

/** ยอดที่ยืนยันแล้ว: high ที่ i ต้องสูงกว่าทุกแท่งในช่วง [i-L, i+L] แบบเข้ม (กันยอดเสมอ) */
function isSwingHigh(bars, i, L) {
  const h = bars[i].high;
  if (!Number.isFinite(h)) return false;
  for (let j = i - L; j <= i + L; j++) {
    if (j === i) continue;
    const x = bars[j].high;
    if (!Number.isFinite(x)) return false;
    if (x >= h) return false;
  }
  return true;
}

/** ก้นที่ยืนยันแล้ว — เหตุผลเดียวกับ isSwingHigh */
function isSwingLow(bars, i, L) {
  const l = bars[i].low;
  if (!Number.isFinite(l)) return false;
  for (let j = i - L; j <= i + L; j++) {
    if (j === i) continue;
    const x = bars[j].low;
    if (!Number.isFinite(x)) return false;
    if (x <= l) return false;
  }
  return true;
}

/** ทิศของค่าเฉลี่ย: +1 ขึ้น · −1 ลง · 0 ไม่ออกความเห็น (รวมกรณีข้อมูลไม่พอ) */
function voteTrend(bars, t, ind) {
  const close = bars[t].close;
  const ma50 = ind.ma50[t];
  const ma200 = ind.ma200[t];
  if (!Number.isFinite(close) || !Number.isFinite(ma50) || !Number.isFinite(ma200)) return 0;
  if (close > ma50 && ma50 > ma200) return 1;
  if (close < ma50 && ma50 < ma200) return -1;
  return 0;
}

function voteMomentum(t, ind, lb) {
  const prev = t - lb;
  if (prev < 0) return 0;
  const line = ind.macd.macdLine[t];
  const sig = ind.macd.signalLine[t];
  const h = ind.macd.histogram[t];
  const hPrev = ind.macd.histogram[prev];
  if (![line, sig, h, hPrev].every(Number.isFinite)) return 0;
  if (line > sig && h > hPrev) return 1;
  if (line < sig && h < hPrev) return -1;
  return 0;
}

function voteMeanRev(bars, t, ind, p) {
  const close = bars[t].close;
  const up = ind.bb.upper[t];
  const lo = ind.bb.lower[t];
  const rsi = ind.rsi[t];

  // %B ใช้ได้ต่อเมื่อกรอบกว้างจริง — กรอบแบน (up === lo) หารไม่ได้ ต้องถือว่า "ไม่มีความเห็น"
  let pb = NaN;
  if (Number.isFinite(close) && Number.isFinite(up) && Number.isFinite(lo) && up - lo > 0) {
    pb = (close - lo) / (up - lo);
  }
  const pbLow = Number.isFinite(pb) && pb <= p.meanRevPercentBLow;
  const pbHigh = Number.isFinite(pb) && pb >= p.meanRevPercentBHigh;
  const rsiLow = Number.isFinite(rsi) && rsi <= p.meanRevRsiLow;
  const rsiHigh = Number.isFinite(rsi) && rsi >= p.meanRevRsiHigh;

  const bull = pbLow || rsiLow;
  const bear = pbHigh || rsiHigh;
  if (bull && bear) return 0; // ขัดกันเอง (เช่น %B ต่ำแต่ RSI สูง) — ไม่เดาให้
  if (bull) return 1;
  if (bear) return -1;
  return 0;
}

function voteStructure(bars, t, p) {
  const L = p.pivotLookback;
  // pivot ที่ใช้ได้ต้องมีแท่งขวาครบ L แท่ง → ดัชนีมากสุดที่ยืนยันได้คือ t - L
  const highest = t - L;
  const lowest = Math.max(L, t - p.pivotScanBars);
  const highs = [];
  const lows = [];
  for (let i = highest; i >= lowest && (highs.length < 2 || lows.length < 2); i--) {
    if (highs.length < 2 && isSwingHigh(bars, i, L)) highs.push(i);
    if (lows.length < 2 && isSwingLow(bars, i, L)) lows.push(i);
  }
  if (highs.length < 2 || lows.length < 2) return 0;

  // highs[0] คือยอดที่ใหม่กว่า highs[1] เสมอ (ลูปเดินถอยหลัง)
  const hUp = bars[highs[0]].high > bars[highs[1]].high;
  const hDown = bars[highs[0]].high < bars[highs[1]].high;
  const lUp = bars[lows[0]].low > bars[lows[1]].low;
  const lDown = bars[lows[0]].low < bars[lows[1]].low;
  if (hUp && lUp) return 1;
  if (hDown && lDown) return -1;
  return 0;
}

export function evaluate(ctx) {
  const p = meta.params;
  const { bars, t, ind } = ctx;

  const votes = [
    voteTrend(bars, t, ind),
    voteMomentum(t, ind, p.momHistLookback),
    voteMeanRev(bars, t, ind, p),
    voteStructure(bars, t, p),
  ];

  let up = 0;
  let down = 0;
  for (const v of votes) {
    if (v > 0) up++;
    else if (v < 0) down++;
  }

  const bull = up >= p.minFamilies && down <= p.maxOpposingFamilies;
  const bear = down >= p.minFamilies && up <= p.maxOpposingFamilies;

  // ความแรง = ส่วนต่างเสียงเทียบจำนวนตระกูลทั้งหมด — 3:1 ได้ 0.5 · 4:0 ได้ 1
  let score = 0;
  if (bull) score = Math.max(0, Math.min(1, (up - down) / p.familyCount));
  else if (bear) score = Math.max(0, Math.min(1, (down - up) / p.familyCount));

  return { bull: bull && !bear, bear: bear && !bull, veto: null, score };
}
