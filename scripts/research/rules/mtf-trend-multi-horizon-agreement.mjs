/**
 * Multi-Horizon Trend Agreement — MA หลายคาบต้องเรียงตัว และต้องเห็นตรงกันหลายช่วงเวลา
 *
 * ─────────────────────────────── มาจากแนวคิดอะไร ───────────────────────────────
 *
 * "MA stack" คือความคิดที่ว่าเทรนด์ที่แท้จริงจะทิ้งร่องรอยเป็นการเรียงลำดับของค่าเฉลี่ย
 * ราคาอยู่เหนือคาบสั้น และคาบสั้นอยู่เหนือคาบยาว (ขาขึ้น) เพราะค่าเฉลี่ยคาบสั้นคือราคา
 * เฉลี่ยของคนที่เพิ่งเข้า และคาบยาวคือของคนที่เข้ามานาน การเรียงตัวจึงแปลว่า
 * "ผู้ถือทุกรุ่นกำลังกำไร" ซึ่งเป็นสภาพที่แรงขายจากคนติดดอยยังไม่เกิด
 *
 * แต่การเรียงตัวเฉย ๆ เกิดได้จากราคาที่แทบไม่ขยับ กฎนี้จึงบวกอีกสองมิติเข้าไป
 * (ก) ความชันของ MA ต้องไปทางเดียวกันเมื่อวัดด้วย "ช่วงเวลาสองขนาด" — คาบสั้นวัดสั้น
 *     คาบยาววัดยาว ซึ่งคือความหมายของ multi-horizon agreement ในกฎนี้
 * (ข) ลำดับ MA50 กับ MA200 ต้องเป็นทิศนี้มาตั้งแต่ persistBars แท่งก่อน ไม่ใช่เพิ่งสลับ
 *
 * ─────────────────────────────── ทำไมตั้งเกณฑ์แบบนี้ ───────────────────────────────
 *
 * · ระยะห่าง MA50 ลบ MA200 ต้องถึง minSepAtr เท่าของ ATR เพราะสองเส้นที่แทบทับกันให้
 *   "ลำดับ" ที่พลิกไปมาได้ด้วยการขยับของราคาเพียงเศษเสี้ยว — ลำดับแบบนั้นไม่ใช่ข้อมูล
 * · ใช้ ATR เป็นหน่วยของระยะห่าง เพราะเกณฑ์ต้องใช้ได้เหมือนกันทั้ง XAUUSD (หลักพัน)
 *   และ EURGBP (หลักทศนิยม) การตั้งเป็นเปอร์เซ็นต์ราคาก็ได้ แต่จะไม่ปรับตามความผันผวน
 * · ยิงเฉพาะแท่งที่เงื่อนไขทั้งชุด "เพิ่งครบ" (แท่งก่อนหน้ายังไม่ครบ) เพราะเงื่อนไขแบบนี้
 *   เป็นจริงต่อเนื่องได้เป็นร้อยแท่ง ถ้ายิงทุกแท่งจะได้ไม้ทับกันเป็นพันไม้จากเทรนด์เดียว
 *   แล้วช่วงความเชื่อมั่นที่ตัวรันคำนวณจะแคบเกินจริงอย่างรุนแรง
 * · ถ้าประเมินแท่งก่อนหน้าไม่ได้ (ข้อมูลไม่พอ) จะไม่ยิง — ไม่ยอมให้ "คำนวณไม่ได้" ถูกอ่าน
 *   เป็น "แท่งก่อนหน้ายังไม่ครบเงื่อนไข" ซึ่งจะทำให้ NaN กลายเป็นสัญญาณเข้าไม้
 *
 * ─────────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────────
 *
 * 1. ตัวรันให้ MA มาแค่สองคาบ (ma50 · ma200) "หลายคาบ" ของกฎนี้จึงมีแค่สองชั้นจริง ๆ
 *    ส่วนมิติที่เหลือมาจากการวัดความชันด้วยช่วงต่างขนาดและการบังคับความต่อเนื่อง
 *    ถ้ามี MA คาบกลางเพิ่ม กฎนี้จะแยกแยะได้ละเอียดกว่านี้มาก
 * 2. MA200 ต้องการ 200 แท่ง และเงื่อนไขความชันยาวต้องการอีก slopeLongBars แท่ง กฎจึง
 *    เริ่มทำงานหลังผ่านไปราว 250 แท่ง — บน 1D คือเกือบหนึ่งปีของทุก symbol
 * 3. เป็นกฎตามเทรนด์เต็มตัว จุดที่มันยิงคือ "เทรนด์ยืนยันตัวเองแล้ว" ซึ่งตามนิยามคือหลัง
 *    การเคลื่อนไหวส่วนแรกจบไปแล้ว มันจึงเสียเปรียบโดยธรรมชาติกับ TP ที่ตั้งไว้ 2R คงที่
 * 4. เงื่อนไขที่ต้อง "เพิ่งครบ" ทำให้กฎยิงน้อย ถ้าจำนวนไม้ต่ำจนช่วงความเชื่อมั่นกว้างมาก
 *    ให้ถือว่าเป็นข้อจำกัดของการวัด ไม่ใช่หลักฐานว่ากฎไม่มีเอดจ์
 */

export const meta = {
  id: 'mtf-trend-multi-horizon-agreement',
  name: 'MA หลายคาบเรียงตัวและเห็นตรงกันหลายช่วงเวลา',
  family: 'mtf',
  needsHtf: false,
  params: {
    /** ช่วงวัดความชันของ MA50 (แท่ง) — ช่วงสั้น */
    slopeShortBars: 10,
    /** ช่วงวัดความชันของ MA200 (แท่ง) — ช่วงยาว */
    slopeLongBars: 50,
    /** ลำดับ MA50 กับ MA200 ต้องเป็นทิศเดียวกันมาแล้วอย่างน้อยเท่านี้แท่ง */
    persistBars: 20,
    /** ระยะห่างขั้นต่ำระหว่าง MA50 กับ MA200 (หน่วย: เท่าของ ATR) */
    minSepAtr: 0.5,
    /** ตัวหารแปลงระยะห่าง MA50 ลบ MA200 เป็นคะแนน 0..1 (หน่วย ATR) */
    scoreSepAtr: 2.0,
  },
};

const NEUTRAL = { bull: false, bear: false, veto: null, score: 0 };
const finite = (v) => Number.isFinite(v);

/**
 * ประเมินการเรียงตัวที่แท่งดัชนี i
 * @returns {null|{up: boolean, down: boolean, sep: number, atr: number}}
 *          null = คำนวณไม่ได้ ต้องถือว่า "ไม่รู้" ไม่ใช่ "ไม่ผ่าน" เพื่อไม่ให้เงื่อนไขความสดเพี้ยน
 */
function stackAt(bars, ind, i, p) {
  if (i - p.slopeShortBars < 0 || i - p.slopeLongBars < 0 || i - p.persistBars < 0) return null;

  const close = bars[i].close;
  const m50 = ind.ma50[i];
  const m200 = ind.ma200[i];
  const atr = ind.atr[i];
  const m50Back = ind.ma50[i - p.slopeShortBars];
  const m200Back = ind.ma200[i - p.slopeLongBars];
  const m50Persist = ind.ma50[i - p.persistBars];
  const m200Persist = ind.ma200[i - p.persistBars];

  if (!finite(close) || !finite(m50) || !finite(m200) || !finite(atr) || !(atr > 0)) return null;
  if (!finite(m50Back) || !finite(m200Back)) return null;
  if (!finite(m50Persist) || !finite(m200Persist)) return null;

  const sep = m50 - m200;
  const needSep = p.minSepAtr * atr;

  const up = close > m50
    && sep >= needSep
    && m50 > m50Back
    && m200 > m200Back
    && m50Persist > m200Persist;

  const down = close < m50
    && -sep >= needSep
    && m50 < m50Back
    && m200 < m200Back
    && m50Persist < m200Persist;

  return { up, down, sep, atr };
}

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null, score: number}}
 */
export function evaluate(ctx) {
  const p = meta.params;
  const { bars, t, ind } = ctx;

  const now = stackAt(bars, ind, t, p);
  if (!now) return NEUTRAL;
  const prev = stackAt(bars, ind, t - 1, p);
  if (!prev) return NEUTRAL;

  const bull = now.up && !prev.up;
  const bear = now.down && !prev.down;
  if (bull && bear) return NEUTRAL; // เป็นไปไม่ได้ตามตรรกะ แต่กันไว้ดีกว่าให้ตัวรันนับ conflict

  const score = bull || bear
    ? Math.min(1, Math.abs(now.sep) / (p.scoreSepAtr * now.atr))
    : 0;

  return { bull, bear, veto: null, score };
}
