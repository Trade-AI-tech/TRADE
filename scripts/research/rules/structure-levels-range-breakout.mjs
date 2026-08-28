/**
 * Range Detection + Breakout vs False Breakout — แยก "ทะลุจริง" ออกจาก "ทะลุหลอก"
 *
 * ─────────────────────────────── แนวคิดที่มา ───────────────────────────────
 *
 * การทะลุกรอบไม่ใช่สัญญาณในตัวมันเอง มันเป็นสัญญาณก็ต่อเมื่อ (ก) มีกรอบจริงอยู่ก่อน
 * และ (ข) การทะลุนั้นไม่ถูกดึงกลับ กฎนี้จึงแยกงานเป็นสามชั้นที่วัดได้ทีละชั้น:
 *
 *   ชั้นที่ 1 — "มีกรอบไหม" กรอบต้องแคบเทียบกับความผันผวน (สูงไม่เกิน maxRangeAtr × ATR)
 *              ต้องมีขอบบนและขอบล่างที่ถูกแตะฝั่งละอย่างน้อย minTouchesPerSide ครั้ง
 *              (กรอบที่ราคาผ่านครั้งเดียวไม่ใช่กรอบ เป็นแค่ช่วงที่บังเอิญเงียบ)
 *              และ ADX ต้องต่ำ เพราะกรอบกับเทรนด์เป็นคนละสภาวะกันโดยนิยาม
 *   ชั้นที่ 2 — "ทะลุจริง" ปิดพ้นขอบอย่างน้อย breakoutCloseAtr × ATR และต้องเป็นการปิด
 *              นอกกรอบ "ครั้งแรก" ในโซนสังเกต ไม่ใช่แท่งที่สามของขาที่ออกไปแล้ว
 *   ชั้นที่ 3 — "ทะลุหลอก" มีแท่งในโซนสังเกตปิดพ้นขอบไปแล้ว แต่แท่งนี้ปิดกลับเข้ากรอบ
 *              ลึกอย่างน้อย falseBackInsideAtr × ATR → สวนกลับไปทางตรงข้ามกับที่ทะลุ
 *
 * ─────────────────────── ทำไมต้องมี "โซนสังเกต" แยกจากกรอบ ───────────────────────
 *
 * ถ้านิยามกรอบจากหน้าต่างที่รวมแท่งที่ทะลุเข้าไปด้วย ขอบกรอบจะขยับตามแท่งที่ทะลุเสมอ
 * แล้วจะไม่มีวันตรวจเจอการทะลุเลย (นิยามวนกลับมากินตัวเอง) กฎนี้จึงตรึงกรอบไว้จาก
 * หน้าต่างที่จบก่อนหน้า probeBars แท่ง แล้วใช้ probeBars แท่งท้ายเป็นโซนตัดสินล้วน ๆ
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. ขอบกรอบมาจาก max/min ดิบ แท่งเดียวที่แหลมออกไปทำให้กรอบกว้างเกินจริงและกฎเงียบไปเลย
 * 2. โซนสังเกตยาวตายตัว probeBars แท่ง — การทะลุที่ค่อย ๆ ล้มเหลวภายในสิบแท่งจะถูกมองข้าม
 *    ส่วนการทะลุที่ล้มเหลวเร็วมาก (ในแท่งเดียวกัน) ก็จับไม่ได้เพราะดูจากราคาปิดเท่านั้น
 * 3. ADX(14) เองก็เป็นตัวช้า สภาวะเพิ่งเปลี่ยนจากกรอบเป็นเทรนด์จะยังผ่านด่าน ADX อยู่พักหนึ่ง
 * 4. ไม่ได้ใช้ volume ยืนยันการทะลุ ทั้งที่ volume คือหลักฐานคลาสสิกของการทะลุจริง
 *    เหตุผลคือแคช FOREX 11 ตัวจาก 13 ตัวมี volume = 0 (ind.volumeRatio เป็น NaN)
 *    ถ้าบังคับใช้ volume กฎนี้จะเหลือวัดได้แค่ทองคำกับเงิน ซึ่งเป็นกลุ่มตัวอย่างที่เล็กเกินไป
 * 5. ทั้งฝั่งทะลุจริงและทะลุหลอกใช้กรอบเดียวกันและเกณฑ์ ATR ชุดเดียวกัน ทั้งที่ในความจริง
 *    การทะลุหลอกมักต้องการระยะเผื่อที่ต่างจากการทะลุจริง — ตั้งใจไม่แยกเพื่อไม่ให้มี
 *    พารามิเตอร์ให้จูนเพิ่มโดยไม่มีเหตุผลรองรับ
 */

export const meta = {
  id: 'structure-levels-range-breakout',
  name: 'กรอบราคา: ทะลุจริง vs ทะลุหลอก',
  family: 'structure',
  needsHtf: false,
  params: {
    /** ความยาวหน้าต่างที่ใช้นิยามกรอบ (แท่ง) */
    rangeBars: 20,
    /** ความยาวโซนสังเกตท้ายสุดที่ใช้ตัดสินการทะลุ (แท่ง) */
    probeBars: 4,
    /** ความสูงกรอบต้องไม่เกินกี่เท่าของ ATR ถึงจะเรียกว่าเป็นกรอบ */
    maxRangeAtr: 3.0,
    /** ระยะเผื่อในการนับว่าแท่งหนึ่ง "แตะขอบ" (เท่าของ ATR) */
    edgeTolAtr: 0.25,
    /** ต้องแตะขอบฝั่งละกี่ครั้งเป็นอย่างน้อย */
    minTouchesPerSide: 2,
    /** ADX สูงกว่านี้ถือว่าเป็นเทรนด์ ไม่ใช่กรอบ */
    maxAdx: 25,
    /** ปิดพ้นขอบอย่างน้อยกี่เท่าของ ATR ถึงนับว่าทะลุ */
    breakoutCloseAtr: 0.25,
    /** ปิดกลับเข้ากรอบลึกอย่างน้อยกี่เท่าของ ATR ถึงนับว่าทะลุหลอก */
    falseBackInsideAtr: 0.15,
    /** ตัวหารแปลงระยะ (เท่าของ ATR) เป็นคะแนน 0..1 */
    scoreSpanAtr: 1.0,
  },
};

const NONE = { bull: false, bear: false, veto: null, score: 0 };

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null, score: number}}
 */
export function evaluate(ctx) {
  const P = meta.params;
  const { bars, t, ind } = ctx;

  const anchorEnd = t - 1 - P.probeBars;
  const anchorStart = anchorEnd - P.rangeBars + 1;
  if (anchorStart < 0) return NONE;

  const atr = ind.atr[t];
  if (!Number.isFinite(atr) || !(atr > 0)) return NONE;

  const adx = ind.adx[t];
  // NaN = ไม่ผ่าน ต้องเช็ค isFinite ก่อน ไม่พึ่งพฤติกรรมของ NaN ในตัวเปรียบเทียบ
  if (!Number.isFinite(adx) || adx > P.maxAdx) return NONE;

  const close = bars[t].close;
  if (!Number.isFinite(close)) return NONE;

  // ── ชั้นที่ 1: นิยามกรอบจากหน้าต่างที่จบก่อนโซนสังเกต ──
  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (let i = anchorStart; i <= anchorEnd; i++) {
    const b = bars[i];
    if (!Number.isFinite(b.high) || !Number.isFinite(b.low)) return NONE;
    if (b.high > rangeHigh) rangeHigh = b.high;
    if (b.low < rangeLow) rangeLow = b.low;
  }
  const height = rangeHigh - rangeLow;
  if (!(height > 0) || height > P.maxRangeAtr * atr) return NONE;

  const edgeTol = P.edgeTolAtr * atr;
  let touchHigh = 0;
  let touchLow = 0;
  for (let i = anchorStart; i <= anchorEnd; i++) {
    if (bars[i].high >= rangeHigh - edgeTol) touchHigh++;
    if (bars[i].low <= rangeLow + edgeTol) touchLow++;
  }
  if (touchHigh < P.minTouchesPerSide || touchLow < P.minTouchesPerSide) return NONE;

  // ── หาการปิดนอกกรอบครั้งล่าสุดในโซนสังเกต (ไม่รวมแท่งปัจจุบัน) ──
  let lastOutDir = 0; // +1 = เคยปิดเหนือกรอบ · −1 = เคยปิดใต้กรอบ · 0 = ยังไม่เคยออก
  for (let i = t - P.probeBars; i <= t - 1; i++) {
    const c = bars[i].close;
    if (!Number.isFinite(c)) continue;
    if (c > rangeHigh) lastOutDir = 1;
    else if (c < rangeLow) lastOutDir = -1;
  }

  const span = P.scoreSpanAtr * atr;

  // ── ชั้นที่ 3: ทะลุหลอก — เคยออกไปแล้วแต่แท่งนี้ปิดกลับเข้ากรอบลึกพอ ──
  if (lastOutDir !== 0) {
    const backIn = P.falseBackInsideAtr * atr;
    if (lastOutDir === 1 && close <= rangeHigh - backIn) {
      return { bull: false, bear: true, veto: null, score: Math.min(1, (rangeHigh - close) / span) };
    }
    if (lastOutDir === -1 && close >= rangeLow + backIn) {
      return { bull: true, bear: false, veto: null, score: Math.min(1, (close - rangeLow) / span) };
    }
    // ยังยืนอยู่นอกกรอบ = การทะลุยังไม่ตัดสิน และไม่ใช่ "ทะลุครั้งแรก" แล้ว → ไม่มีความเห็น
    return NONE;
  }

  // ── ชั้นที่ 2: ทะลุจริง — แท่งนี้เป็นการปิดนอกกรอบครั้งแรกของโซนสังเกต ──
  const out = P.breakoutCloseAtr * atr;
  if (close >= rangeHigh + out) {
    return { bull: true, bear: false, veto: null, score: Math.min(1, (close - rangeHigh) / span) };
  }
  if (close <= rangeLow - out) {
    return { bull: false, bear: true, veto: null, score: Math.min(1, (rangeLow - close) / span) };
  }
  return NONE;
}
