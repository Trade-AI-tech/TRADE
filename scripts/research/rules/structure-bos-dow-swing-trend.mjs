/**
 * Swing Structure & Break of Structure — Dow theory เขียนเป็นอัลกอริทึม
 *
 * ─────────────────────────── กฎนี้มาจากแนวคิดอะไร ───────────────────────────
 *
 * Dow บอกว่าเทรนด์ขาขึ้นคือ "ยอดสูงขึ้นและก้นสูงขึ้นต่อเนื่อง" และเทรนด์ยังมีผลอยู่
 * จนกว่าจะถูกหักล้าง ประโยคนี้ใช้เทรดไม่ได้จนกว่าจะตอบสามคำถามให้เป็นตัวเลข:
 *   (1) "ยอด/ก้น" คือแท่งไหน — ตอบด้วย pivot ที่ยืนยันแล้วเท่านั้น
 *   (2) "สูงขึ้น" แค่ไหนถึงนับ — ตอบด้วยระยะเทียบ ATR ไม่ใช่มากกว่าเฉย ๆ
 *   (3) เข้าไม้ตอนไหน — ตอบด้วย "ย่อแล้วกลับไปต่อ" ไม่ใช่เข้าทุกแท่งที่เทรนด์ยังอยู่
 *
 * ไฟล์นี้จึงเป็น Dow เวอร์ชัน "เข้าตอนย่อ" โดยตั้งใจไม่แตะจังหวะเบรก เพราะจังหวะเบรก
 * เป็นงานของ structure-bos-displacement-close — ถ้าสองกฎยิงจุดเดียวกัน เอาผลมาเทียบกัน
 * แล้วจะแยกไม่ออกว่าอะไรทำงาน
 *
 * ─────────────────────────── ทำไมเกณฑ์ถึงเป็นแบบนี้ ───────────────────────────
 *
 * · ต้องเห็น HH และ HL พร้อมกัน (สองยอดสองก้น) ไม่ใช่แค่ราคาอยู่เหนือเส้นค่าเฉลี่ย
 *   — Dow พูดถึงลำดับของ swing ไม่ได้พูดถึงค่าเฉลี่ย
 * · การย่อต้องอยู่ในกรอบ minRetrace..maxRetrace ของขาล่าสุด ย่อน้อยเกินไปแปลว่ายัง
 *   ไม่ได้ย่อจริง (เข้าไปก็คือไล่ราคา) ย่อมากเกินไปแปลว่าขานั้นกำลังจะถูกหักล้างอยู่แล้ว
 * · โครงสร้างต้องไม่ถูกทำลาย: จุดต่ำสุดหลังยอดล่าสุดต้องยังอยู่เหนือ HL เดิม
 *   ถ้าหลุดแล้วก็ไม่ใช่ขาขึ้นตาม Dow อีกต่อไป ไม่ว่าอินดิเคเตอร์จะบอกอะไร
 * · ทริกเกอร์ = ปิดเหนือ high ของแท่งก่อนหน้า (ฝั่ง bear = ปิดใต้ low) เป็นสัญญาณ
 *   "กลับไปทางเดิม" ที่ตัดสินได้ด้วยข้อมูลถึงแท่ง t เท่านั้น
 * · และต้องยังปิดต่ำกว่ายอดล่าสุด (bull) — เกินเมื่อไรนั่นคือ BOS ซึ่งเป็นกฎอีกข้อ
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. "ย่อแล้วไปต่อ" กับ "ย่อแล้วไปเลย" หน้าตาเหมือนกันทุกประการ ณ แท่งที่ยิงสัญญาณ
 *    กฎนี้แยกไม่ออก และไม่มีอะไรในนี้แยกออกได้ — มันแลกด้วย win rate เอา RR
 * 2. ทริกเกอร์ปิดเหนือ high แท่งก่อนเป็นเกณฑ์หยาบมาก บนกรอบ 1H แท่งเดียวคือ
 *    การแกว่งเล็กน้อย สัญญาณจึงถี่กว่าที่ควร และหลายไม้เป็นไม้เดียวกันที่ยิงซ้ำ
 *    (ไม่มี cooldown ในกฎนี้โดยตั้งใจ เพื่อให้เทียบกับกฎอื่นบนฐานเดียวกัน)
 * 3. retracement วัดจาก "ก้นต่ำสุดตั้งแต่ยอด" ซึ่งขยับได้เรื่อย ๆ ระหว่างย่อ
 *    ไม้ที่ยิงคนละแท่งจึงอ้างอิง retracement คนละค่า ทั้งที่เป็นการย่อครั้งเดียวกัน
 * 4. ไม่มีตัวกรอง regime เลย — ในตลาด sideways ที่ pivot สลับไปมา กฎจะยิงทั้งสองทาง
 *    สลับกันตลอด แล้วโดนต้นทุนกินทีละนิดจนติดลบ นี่คือกรณีที่คาดว่าจะแย่ที่สุด
 */

export const meta = {
  id: 'structure-bos-dow-swing-trend',
  name: 'Dow: HH/HL แล้วเข้าตอนย่อกลับไปต่อ',
  family: 'structure',
  needsHtf: false,
  params: {
    /** แท่งขนาบสองข้างที่ทำให้ pivot ยืนยัน */
    pivotLookback: 3,
    /** ย้อนหาไกลสุดกี่แท่ง */
    scanWindow: 240,
    /** เก็บ pivot ต่อฝั่งกี่ตัว (ใช้แค่ 2 ตัวล่าสุด แต่เผื่อไว้ให้คะแนน) */
    maxPivots: 3,
    /** ระยะขั้นต่ำที่นับว่า "สูงขึ้น/ต่ำลง" จริง คิดเป็นเท่าของ ATR */
    minStepAtr: 0.25,
    /** ขาล่าสุด (ก้นถึงยอด) ต้องยาวอย่างน้อยกี่เท่าของ ATR ถึงจะเอามาคิดสัดส่วนย่อ */
    minLegAtr: 1.0,
    /** กรอบการย่อที่ยอมรับ คิดเป็นสัดส่วนของขาล่าสุด */
    minRetrace: 0.20,
    maxRetrace: 0.80,
    /** pivot ใหม่สุดต้องไม่เก่ากว่ากี่แท่ง — โครงสร้างเก่าเกินไปถือว่าหมดอายุ */
    maxPivotAge: 60,
    /** ตัวหารของคะแนน: ขั้นบันไดโครงสร้างเฉลี่ยกี่เท่า ATR ถึงให้คะแนนเต็ม */
    scoreSpanAtr: 1.5,
  },
};

/** เหมือน structure-bos-swing-pivot-state — จงใจก๊อปมาไว้ในไฟล์ให้กฎอ่านจบได้ในไฟล์เดียว */
function findConfirmedPivots(bars, t, lookback, scanWindow, maxPivots) {
  const highs = [];
  const lows = [];
  const newest = t - lookback;
  const oldest = Math.max(lookback, t - scanWindow);

  for (let i = newest; i >= oldest; i--) {
    if (highs.length >= maxPivots && lows.length >= maxPivots) break;
    const c = bars[i];
    if (!Number.isFinite(c.high) || !Number.isFinite(c.low)) continue;

    if (highs.length < maxPivots) {
      let ok = true;
      for (let j = 1; j <= lookback; j++) {
        const l = bars[i - j];
        const r = bars[i + j];
        if (!Number.isFinite(l.high) || !Number.isFinite(r.high)) { ok = false; break; }
        if (!(c.high > l.high) || !(c.high >= r.high)) { ok = false; break; }
      }
      if (ok) highs.push({ idx: i, price: c.high });
    }

    if (lows.length < maxPivots) {
      let ok = true;
      for (let j = 1; j <= lookback; j++) {
        const l = bars[i - j];
        const r = bars[i + j];
        if (!Number.isFinite(l.low) || !Number.isFinite(r.low)) { ok = false; break; }
        if (!(c.low < l.low) || !(c.low <= r.low)) { ok = false; break; }
      }
      if (ok) lows.push({ idx: i, price: c.low });
    }
  }
  return { highs, lows };
}

/** ต่ำสุด/สูงสุดในช่วง [from..to] — คืน NaN ถ้าช่วงว่างหรือมีค่าที่อ่านไม่ได้ */
function lowestLow(bars, from, to) {
  if (from > to) return NaN;
  let m = Infinity;
  for (let i = from; i <= to; i++) {
    const v = bars[i].low;
    if (!Number.isFinite(v)) return NaN;
    if (v < m) m = v;
  }
  return m;
}

function highestHigh(bars, from, to) {
  if (from > to) return NaN;
  let m = -Infinity;
  for (let i = from; i <= to; i++) {
    const v = bars[i].high;
    if (!Number.isFinite(v)) return NaN;
    if (v > m) m = v;
  }
  return m;
}

const NO_SIGNAL = { bull: false, bear: false, veto: null, score: 0 };

export function evaluate(ctx) {
  const p = meta.params;
  const { bars, t } = ctx;
  if (t < 1) return NO_SIGNAL;

  const atr = ctx.ind.atr[t];
  if (!Number.isFinite(atr) || !(atr > 0)) return NO_SIGNAL;

  const bar = bars[t];
  const prev = bars[t - 1];
  if (!Number.isFinite(bar.close) || !Number.isFinite(prev.high) || !Number.isFinite(prev.low)) {
    return NO_SIGNAL;
  }

  const { highs, lows } = findConfirmedPivots(
    bars, t, p.pivotLookback, p.scanWindow, p.maxPivots);
  if (highs.length < 2 || lows.length < 2) return NO_SIGNAL;

  const step = p.minStepAtr * atr;
  const H1 = highs[0];
  const H2 = highs[1];
  const L1 = lows[0];
  const L2 = lows[1];

  const newestIdx = Math.max(H1.idx, L1.idx);
  if (t - newestIdx > p.maxPivotAge) return NO_SIGNAL;

  const upStructure = (H1.price - H2.price >= step) && (L1.price - L2.price >= step);
  const downStructure = (H2.price - H1.price >= step) && (L2.price - L1.price >= step);
  if (!upStructure && !downStructure) return NO_SIGNAL;

  // คะแนนเดียวกันทั้งสองฝั่ง: ขั้นบันไดของโครงสร้างเฉลี่ย คิดเป็นเท่าของ ATR
  const stairAtr = upStructure
    ? ((H1.price - H2.price) + (L1.price - L2.price)) / (2 * atr)
    : ((H2.price - H1.price) + (L2.price - L1.price)) / (2 * atr);
  const score = Math.max(0, Math.min(1, stairAtr / p.scoreSpanAtr));

  // ── ฝั่งซื้อ: ขาขึ้น + ยอดล่าสุดเกิดหลังก้นล่าสุด (แปลว่ากำลังอยู่ในจังหวะย่อ) ──
  if (upStructure && H1.idx > L1.idx) {
    const legHigh = H1.price;
    const legLow = L1.price;
    const leg = legHigh - legLow;
    if (!(leg >= p.minLegAtr * atr)) return NO_SIGNAL;

    const since = lowestLow(bars, H1.idx + 1, t);
    if (!Number.isFinite(since)) return NO_SIGNAL;
    if (!(since > legLow)) return NO_SIGNAL; // หลุด HL แล้ว = โครงสร้างขาขึ้นตาย

    const retrace = (legHigh - since) / leg;
    if (!(retrace >= p.minRetrace && retrace <= p.maxRetrace)) return NO_SIGNAL;

    const resumed = bar.close > prev.high;   // กลับไปทางเดิม
    const notBreakout = bar.close < legHigh; // ยังไม่เบรก — เบรกเป็นงานของกฎ BOS
    if (resumed && notBreakout) return { bull: true, bear: false, veto: null, score };
    return NO_SIGNAL;
  }

  // ── ฝั่งขาย: ขาลง + ก้นล่าสุดเกิดหลังยอดล่าสุด (กำลังเด้งขึ้นสวน) ──
  if (downStructure && L1.idx > H1.idx) {
    const legHigh = H1.price;
    const legLow = L1.price;
    const leg = legHigh - legLow;
    if (!(leg >= p.minLegAtr * atr)) return NO_SIGNAL;

    const since = highestHigh(bars, L1.idx + 1, t);
    if (!Number.isFinite(since)) return NO_SIGNAL;
    if (!(since < legHigh)) return NO_SIGNAL; // ทะลุ LH แล้ว = โครงสร้างขาลงตาย

    const retrace = (since - legLow) / leg;
    if (!(retrace >= p.minRetrace && retrace <= p.maxRetrace)) return NO_SIGNAL;

    const resumed = bar.close < prev.low;
    const notBreakout = bar.close > legLow;
    if (resumed && notBreakout) return { bull: false, bear: true, veto: null, score };
    return NO_SIGNAL;
  }

  return NO_SIGNAL;
}
