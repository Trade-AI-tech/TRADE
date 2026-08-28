/**
 * Liquidity Sweep / Failed Break of Swing Point (การกลับตัวหลังโดนล่าสตอป)
 *
 * ─────────────────────────── กฎนี้มาจากแนวคิดอะไร ───────────────────────────
 *
 * คนวางสตอปไว้ใต้ก้นล่าสุดเป็นเรื่องปกติ ก้นที่ยืนยันแล้วและยังไม่เคยถูกแตะอีกเลย
 * จึงเป็นจุดที่ "มีของกองอยู่" ตามสมมติฐานนี้ เมื่อราคาแทงลงไปใต้ก้นนั้นแล้ว
 * กลับขึ้นมาปิดเหนือมันได้ในแท่งเดียวกัน สิ่งที่เห็นคือการเบรกที่ล้มเหลว —
 * ตรงข้ามกับ structure-bos-displacement-close ที่วัดการเบรกที่สำเร็จ
 *
 * สองกฎนี้จึงเป็นคู่ตรงข้ามกันโดยตั้งใจ วัดบนฐานเดียวกันแล้วเทียบได้ตรง ๆ ว่า
 * ในจักรวาลนี้ "เบรกจริง" หรือ "เบรกหลอก" เป็นเหตุการณ์ที่มีค่ามากกว่ากัน
 *
 * ─────────────────────────── ทำไมเกณฑ์ถึงเป็นแบบนี้ ───────────────────────────
 *
 * · ต้องแทงลงไปจริงอย่างน้อย minPierceAtr × ATR — แตะพอดีเป๊ะไม่นับ เพราะการแตะ
 *   ระดับเดิมเกิดตลอดเวลาและไม่ได้แปลว่ามีใครโดนล้างสตอป
 * · ต้องปิดกลับ "เหนือ" ระดับเดิมบวกบัฟเฟอร์ ในแท่งเดียวกัน — ถ้ายอมให้ปิดใต้ระดับ
 *   แล้วค่อยกลับขึ้นแท่งถัดไป นั่นคือคนละเหตุการณ์ (และตัดสินไม่ได้ ณ แท่ง t)
 * · ไส้เทียนล่างต้องยาวทั้งเทียบ ATR และเทียบช่วงของแท่งเอง กับราคาปิดต้องอยู่
 *   ค่อนไปทางบนของแท่ง — สามอย่างนี้คือรูปร่างของ "ถูกปฏิเสธ" ที่วัดเป็นตัวเลขได้
 * · ระดับต้องยัง "บริสุทธิ์": ไม่มีแท่งไหนตั้งแต่ pivot เกิดจนถึงแท่งก่อนหน้าที่
 *   ลงไปต่ำกว่ามันเลย ถ้าเคยถูกแทงไปแล้ว ของที่กองอยู่ก็ถูกกวาดไปแล้วรอบก่อน
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. "มีสตอปกองอยู่ใต้ก้น" เป็นสมมติฐาน ไม่ใช่สิ่งที่วัดได้จากแคชแท่งเทียน
 *    เราวัดได้แค่รูปร่างของแท่ง ไม่ได้วัดว่ามีใครโดนล้างจริงหรือเปล่า
 * 2. เกณฑ์ "ระดับต้องยังบริสุทธิ์" ทำให้สัญญาณน้อยมากโดยตั้งใจ ถ้าจำนวนไม้ต่ำจน
 *    ช่วงความเชื่อมั่นกว้างเกินอ่าน ให้ถือว่าเป็นข้อจำกัดของกฎ ไม่ใช่ผลลัพธ์ที่แปลได้
 * 3. บนกรอบ 1D แท่งเดียวกินเวลาทั้งวัน ไส้ยาวใต้ก้นจึงอาจเป็นข่าวตอนเช้าแล้วฟื้น
 *    ตอนบ่าย ซึ่งไม่ใช่กลไกล่าสตอปแบบที่กฎนี้อ้าง — โครงสร้างของแท่งเหมือนกัน
 *    แต่เหตุการณ์ข้างในต่างกัน และกฎแยกไม่ออก
 * 4. ATR ที่ใช้เป็นตัวหารคือ ATR ณ แท่งที่มีไส้ยาวผิดปกติพอดี ซึ่งตัวมันเองก็ถูก
 *    แท่งนั้นดันขึ้นไปแล้วบางส่วน เกณฑ์จึงเข้มขึ้นเองเล็กน้อยในวันที่ผันผวนจัด
 */

export const meta = {
  id: 'structure-bos-liquidity-sweep',
  name: 'กวาดสภาพคล่อง: เบรกก้น/ยอดแล้วปิดกลับ',
  family: 'structure',
  needsHtf: false,
  params: {
    pivotLookback: 3,
    scanWindow: 240,
    maxPivots: 2,
    /** ต้องแทงพ้นระดับอย่างน้อยกี่เท่าของ ATR */
    minPierceAtr: 0.15,
    /** ต้องปิดกลับพ้นระดับอย่างน้อยกี่เท่าของ ATR */
    reclaimBufferAtr: 0.05,
    /** ไส้ฝั่งที่ถูกปฏิเสธต้องยาวอย่างน้อยกี่เท่าของ ATR */
    minWickAtr: 0.40,
    /** ไส้ฝั่งนั้นต้องกินสัดส่วนเท่าไรของช่วงแท่ง */
    minWickFrac: 0.40,
    /** ราคาปิดต้องอยู่สูงกว่า (bull) / ต่ำกว่า (bear) กี่ส่วนของช่วงแท่ง */
    minCloseLoc: 0.55,
    /** ระดับที่ถูกกวาดต้องไม่เก่ากว่ากี่แท่ง */
    maxPivotAge: 60,
    /** ตัวหารของคะแนน: แทงพ้นกี่เท่า ATR ถึงให้คะแนนเต็ม */
    scoreSpanAtr: 1.0,
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

/** ระดับยัง "บริสุทธิ์" ไหม — ไม่มีแท่งใดในช่วงที่ลงต่ำกว่า/ขึ้นสูงกว่าระดับเลย */
function untouched(bars, from, to, level, below) {
  for (let i = from; i <= to; i++) {
    const v = below ? bars[i].low : bars[i].high;
    if (!Number.isFinite(v)) return false; // อ่านไม่ได้ = ไม่ยืนยันว่าบริสุทธิ์
    if (below ? v < level : v > level) return false;
  }
  return true;
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

  const { highs, lows } = findConfirmedPivots(
    bars, t, p.pivotLookback, p.scanWindow, p.maxPivots);

  const minPierce = p.minPierceAtr * atr;
  const reclaim = p.reclaimBufferAtr * atr;
  const bodyTop = Math.max(bar.open, bar.close);
  const bodyBottom = Math.min(bar.open, bar.close);

  let bull = false;
  let bear = false;
  let score = 0;

  // ── กวาดก้น แล้วปิดกลับขึ้นมา = ฝั่งซื้อ ──
  if (lows.length >= 1) {
    const L = lows[0];
    const pierce = L.price - bar.low;
    const lowerWick = bodyBottom - bar.low;
    const closeLoc = (bar.close - bar.low) / range;
    if (t - L.idx <= p.maxPivotAge
      && pierce >= minPierce
      && bar.close >= L.price + reclaim
      && lowerWick >= p.minWickAtr * atr
      && lowerWick / range >= p.minWickFrac
      && closeLoc >= p.minCloseLoc
      && untouched(bars, L.idx + 1, t - 1, L.price, true)) {
      bull = true;
      score = Math.max(score, Math.min(1, (pierce / atr) / p.scoreSpanAtr));
    }
  }

  // ── กวาดยอด แล้วปิดกลับลงมา = ฝั่งขาย ──
  if (highs.length >= 1) {
    const H = highs[0];
    const pierce = bar.high - H.price;
    const upperWick = bar.high - bodyTop;
    const closeLoc = (bar.high - bar.close) / range;
    if (t - H.idx <= p.maxPivotAge
      && pierce >= minPierce
      && bar.close <= H.price - reclaim
      && upperWick >= p.minWickAtr * atr
      && upperWick / range >= p.minWickFrac
      && closeLoc >= p.minCloseLoc
      && untouched(bars, H.idx + 1, t - 1, H.price, false)) {
      bear = true;
      score = Math.max(score, Math.min(1, (pierce / atr) / p.scoreSpanAtr));
    }
  }

  // แท่งเดียวกวาดทั้งสองฝั่งเกิดได้จริงในวันข่าว — ปล่อยให้ตัวรันนับเป็น conflict
  // แล้วข้ามไป ดีกว่าเดาให้เองว่าฝั่งไหนสำคัญกว่า
  return { bull, bear, veto: null, score: bull || bear ? score : 0 };
}
