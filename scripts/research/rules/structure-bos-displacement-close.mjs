/**
 * Break of Structure (BOS) พร้อม displacement + ยืนยันด้วยราคาปิด
 *
 * ─────────────────────────── กฎนี้มาจากแนวคิดอะไร ───────────────────────────
 *
 * BOS คือจุดที่ "ราคาทำลายโครงสร้างเดิม" — แต่คำว่าทำลายมีสองความหมายที่ให้ผลคนละเรื่อง
 * ไส้เทียนแทงผ่านยอดเก่า (ซึ่งเกิดตลอดเวลาและมักเป็นการล่าสตอป) กับ "ปิด" เหนือยอดเก่า
 * ด้วยแท่งที่มีแรง กฎนี้เลือกอย่างหลังโดยตั้งใจ และบังคับสามชั้นพร้อมกัน:
 *
 *   1. ปิดเหนือยอด/ใต้ก้นที่ยืนยันแล้ว บวกบัฟเฟอร์เทียบ ATR (ไม่ใช่แค่แตะ)
 *   2. แท่งที่เบรกต้องมี displacement — ตัวเทียนหนาเทียบ ATR และหนาเทียบช่วงของแท่งเอง
 *      แท่งที่ปิดผ่านแบบตัวนิดเดียวไส้ยาว คือความลังเล ไม่ใช่การเบรก
 *   3. ต้องเป็นการปิดผ่าน "ครั้งแรก" นับตั้งแต่ pivot นั้นเกิด — ไม่งั้นกฎจะยิงซ้ำ
 *      ทุกแท่งที่ราคายังลอยอยู่เหนือยอดเก่า แล้วตัวเลขจะกลายเป็นการวัดว่า
 *      "ถือตามเทรนด์ดีไหม" แทนที่จะวัดว่า "จังหวะเบรกมีค่าไหม"
 *
 * ─────────────────────────── ทำไมเกณฑ์ถึงเป็นแบบนี้ ───────────────────────────
 *
 * · บัฟเฟอร์คิดเป็นเท่าของ ATR ไม่ใช่ pip คงที่ เพราะกฎเดียวกันต้องใช้ได้ทั้ง XAGUSD
 *   และ EURGBP ซึ่งความผันผวนต่างกันเป็นสิบเท่า
 * · displacement วัดสองแบบพร้อมกัน (เทียบ ATR และเทียบช่วงของแท่งเอง) เพราะแท่งใหญ่
 *   ที่ไส้ยาวสองข้างก็ผ่านเกณฑ์แรกได้ ทั้งที่ไม่มีทิศทางอะไรเลย
 * · ยอด/ก้นที่ใช้ต้องไม่เก่าเกิน maxPivotAge — เบรกยอดที่เกิดเมื่อ 200 แท่งก่อน
 *   ไม่ใช่เหตุการณ์เดียวกับเบรกยอดที่เพิ่งเกิดเมื่อวาน แม้จะเขียนเป็นเงื่อนไขเดียวกันได้
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. เข้าไม้ที่ราคาเปิดแท่งถัดไป (ตัวรันบังคับ) แปลว่าเข้าหลังแท่ง displacement จบแล้ว
 *    — ซื้อที่ปลายแท่งแรง ซึ่งเป็นจุดที่ระยะไปหา SL ไกลที่สุดพอดี กฎนี้จึงเสียเปรียบ
 *    ตั้งแต่ยังไม่เริ่มนับ และควรถูกอ่านคู่กับ maeR/mfeR ไม่ใช่ดู avgR อย่างเดียว
 * 2. ไม่แยกว่า BOS นี้ไปทางเดียวกับโครงสร้างใหญ่หรือสวน — BOS ที่สวนเทรนด์ใหญ่
 *    (ซึ่งจริง ๆ คือ CHoCH) ถูกนับรวมอยู่ในตัวเลขเดียวกันหมด
 * 3. เกณฑ์ "ปิดผ่านครั้งแรกนับจาก pivot" ทำให้ในตลาดที่แกว่งรอบยอดเดิม กฎยิงได้
 *    หลายครั้งอยู่ดี ถ้ามี pivot ใหม่แทรกขึ้นมาระหว่างนั้น
 * 4. ไม่มีการวัดว่าเบรกแล้ว "ยืน" ได้ไหม เพราะการรอยืนยันเพิ่มคือการมองอนาคต
 *    ณ แท่งที่ตัดสิน — ข้อจำกัดนี้แก้ไม่ได้ในกรอบของกฎรายแท่ง
 */

export const meta = {
  id: 'structure-bos-displacement-close',
  name: 'BOS: ปิดผ่านโครงสร้างด้วยแท่ง displacement',
  family: 'structure',
  needsHtf: false,
  params: {
    pivotLookback: 3,
    scanWindow: 240,
    maxPivots: 2,
    /** ต้องปิดพ้นระดับอย่างน้อยกี่เท่าของ ATR ถึงนับว่าเบรก */
    breakBufferAtr: 0.10,
    /** ตัวเทียนต้องหนาอย่างน้อยกี่เท่าของ ATR */
    minBodyAtr: 0.60,
    /** ตัวเทียนต้องกินสัดส่วนเท่าไรของช่วงแท่ง (high−low) */
    minBodyFrac: 0.50,
    /** ยอด/ก้นที่ถูกเบรกต้องไม่เก่ากว่ากี่แท่ง */
    maxPivotAge: 60,
    /** ตัวหารของคะแนน: ตัวเทียนหนากี่เท่า ATR ถึงให้คะแนนเต็ม */
    scoreSpanAtr: 2.0,
  },
};

/** pivot ที่ยืนยันแล้วเท่านั้น — เงื่อนไขยืนยันคือ i + lookback <= t */
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

/** มีแท่งไหนในช่วง [from..to] ปิดพ้นระดับไปแล้วหรือยัง — ใช้บังคับ "ครั้งแรกเท่านั้น" */
function anyCloseBeyond(bars, from, to, level, above) {
  for (let i = from; i <= to; i++) {
    const c = bars[i].close;
    if (!Number.isFinite(c)) continue;
    if (above ? c > level : c < level) return true;
  }
  return false;
}

const NO_SIGNAL = { bull: false, bear: false, veto: null, score: 0 };

export function evaluate(ctx) {
  const p = meta.params;
  const { bars, t } = ctx;
  const atr = ctx.ind.atr[t];
  if (!Number.isFinite(atr) || !(atr > 0)) return NO_SIGNAL;

  const bar = bars[t];
  if (!Number.isFinite(bar.open) || !Number.isFinite(bar.close)
    || !Number.isFinite(bar.high) || !Number.isFinite(bar.low)) return NO_SIGNAL;

  const range = bar.high - bar.low;
  if (!(range > 0)) return NO_SIGNAL;

  const body = bar.close - bar.open;
  const absBody = Math.abs(body);
  // displacement ต้องผ่านทั้งสองด่าน: หนาเทียบ ATR และหนาเทียบช่วงของแท่งเอง
  if (!(absBody >= p.minBodyAtr * atr)) return NO_SIGNAL;
  if (!(absBody / range >= p.minBodyFrac)) return NO_SIGNAL;

  const { highs, lows } = findConfirmedPivots(
    bars, t, p.pivotLookback, p.scanWindow, p.maxPivots);

  const buffer = p.breakBufferAtr * atr;
  const score = Math.max(0, Math.min(1, (absBody / atr) / p.scoreSpanAtr));

  // ── BOS ขาขึ้น: แท่งเขียวแรงปิดเหนือยอดที่ยืนยันแล้ว และเป็นการปิดผ่านครั้งแรก ──
  if (body > 0 && highs.length >= 1) {
    const H = highs[0];
    if (t - H.idx <= p.maxPivotAge) {
      const level = H.price + buffer;
      if (bar.close > level && !anyCloseBeyond(bars, H.idx + 1, t - 1, level, true)) {
        return { bull: true, bear: false, veto: null, score };
      }
    }
  }

  // ── BOS ขาลง: กระจกเงาของด้านบน ──
  if (body < 0 && lows.length >= 1) {
    const L = lows[0];
    if (t - L.idx <= p.maxPivotAge) {
      const level = L.price - buffer;
      if (bar.close < level && !anyCloseBeyond(bars, L.idx + 1, t - 1, level, false)) {
        return { bull: false, bear: true, veto: null, score };
      }
    }
  }

  return NO_SIGNAL;
}
