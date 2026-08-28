/**
 * กฎ: ตำแหน่งของราคาในกรอบของ TF ใหญ่ (HTF Range Position)
 *
 * ─────────────────────────────── แนวคิดที่มา ───────────────────────────────
 *
 * คนที่ดูกราฟใหญ่ก่อนจะเข้าไม้ในกราฟเล็ก ส่วนใหญ่ไม่ได้ดู "ทิศ" อย่างเดียว แต่ดูว่า
 * ตอนนี้ราคายืนอยู่ตรงไหนของกรอบที่กราฟใหญ่สร้างไว้ — ซื้อที่ก้นกรอบกับซื้อที่เพดานกรอบ
 * เป็นคนละดีลกันสิ้นเชิงแม้เทรนด์จะเหมือนกัน กฎนี้จึงแปลง "บน/กลาง/ล่างของ range"
 * ให้เป็นตัวเลขเดียว p ∈ [0,1] แล้วเทรดแบบสวนกรอบ: ก้นกรอบ = ซื้อ เพดานกรอบ = ขาย
 *
 * ─────────────────────────── ทำไมตั้งเกณฑ์แบบนี้ ───────────────────────────
 *
 * · กรอบมาจาก "สูงสุด/ต่ำสุดแบบเลื่อนหน้าต่าง" ของแท่ง HTF ย้อนหลัง htfLookback แท่ง
 *   ไม่ใช่ swing pivot โดยตั้งใจ — pivot ต้องรอแท่งหลังยืนยันถึงจะใช้ได้ ทำให้กรอบที่เห็น
 *   ล้าหลังไปหลายแท่งเสมอ ส่วน rolling extreme ใช้ได้ทันทีที่แท่ง HTF ปิด และยัง causal
 *   เต็มร้อยเพราะอ่านแค่ htf.bars[i] ที่ i <= htf.t (ซึ่งตัวรันการันตีว่าปิดไปแล้ว)
 * · ต้องมีการ "ข้ามเข้าโซน" (แท่งก่อนยังไม่อยู่ในโซน แท่งนี้เข้ามาแล้ว) ไม่ใช่แค่ "อยู่ในโซน"
 *   เพราะถ้าเอาแค่อยู่ในโซน ราคาที่แช่ก้นกรอบสิบแท่งจะออกสิบสัญญาณที่แทบเป็นไม้เดียวกัน
 *   ตัวเลข avg R จะกลายเป็นค่าเฉลี่ยของไม้ซ้ำ ๆ ไม่กี่เหตุการณ์ แล้วอ่านผิดว่ามีหลักฐานเยอะ
 * · minRangeAtrMult กันกรอบที่แคบจนไม่มีความหมาย — ถ้ากรอบทั้งกรอบเล็กกว่า ATR ไม่กี่เท่า
 *   คำว่า "ก้นกรอบ" กับ "เพดานกรอบ" ห่างกันไม่ถึงหนึ่งการแกว่งปกติ การแบ่งโซนก็ไร้ความหมาย
 * · บังคับ 0 <= p <= 1 คือบังคับว่าราคายัง "อยู่ในกรอบ" จริง ๆ ถ้าราคาหลุดใต้ก้นกรอบไปแล้ว
 *   (p < 0) นั่นคือ breakdown ไม่ใช่ย่อลงมาที่ฐาน การซื้อตรงนั้นคือรับมีดคนละเรื่องกับกฎนี้
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. กฎนี้เป็น mean-reversion เต็มตัว มันจะแพ้ทางตลาดที่วิ่งเทรนด์ยาว ๆ โดยธรรมชาติ —
 *    ทุกครั้งที่เทรนด์ลงจริง ราคาจะ "ข้ามเข้าโซนล่าง" แล้วกฎจะสั่งซื้อสวนไปเรื่อย ๆ
 *    เกณฑ์ p >= 0 ช่วยได้แค่บางส่วน เพราะกรอบเลื่อนตามราคาลงไปด้วย
 * 2. needsHtf = true แปลว่าบนกรอบ 1D กฎนี้จะไม่ออกสัญญาณเลยสักไม้ (แคชไม่มี TF ที่ใหญ่กว่า 1D)
 *    ศูนย์ไม้ของ 1D จึงเป็นเรื่องเชิงโครงสร้าง ไม่ใช่เพราะเกณฑ์แน่นเกินไป
 * 3. บริบท 1D ที่เห็นตอนวัดกรอบ 1H เป็นแท่งที่อยู่ในช่วง test ของ 1D (ข้อจำกัดของตัวรันเอง)
 *    — ไม่ใช่การมองอนาคตของไม้ 1H แต่ห้ามเอาผลนี้ไปอ้างว่าชุด test ของ 1D ยังบริสุทธิ์
 * 4. htfLookback = 20 แท่งวัน ≈ หนึ่งเดือนทำการ เป็นค่าที่เลือกจากความหมาย ไม่ได้กวาดหา
 *    ค่าที่ดีที่สุด ตัวเลขที่ได้จึงอ่านว่า "กฎรูปนี้ให้ผลเท่านี้" ไม่ใช่ "ดีที่สุดที่รูปนี้ทำได้"
 */

export const meta = {
  id: 'mtf-regime-htf-range-position',
  name: 'ตำแหน่งราคาในกรอบใหญ่ (บน/กลาง/ล่างของ range)',
  family: 'mtf',
  needsHtf: true,
  params: {
    /** จำนวนแท่ง HTF ที่ใช้ประกอบกรอบ (20 แท่งวัน ≈ 1 เดือนทำการ) */
    htfLookback: 20,
    /** p <= ค่านี้ = อยู่ "ก้นกรอบ" */
    lowZone: 0.25,
    /** p >= ค่านี้ = อยู่ "เพดานกรอบ" */
    highZone: 0.75,
    /** กรอบต้องกว้างอย่างน้อยกี่เท่าของ ATR(HTF) ถึงจะนับว่าเป็นกรอบที่มีความหมาย */
    minRangeAtrMult: 2.0,
  },
};

/** ผลลัพธ์กลาง ๆ ใช้ทุกจุดที่ข้อมูลไม่พอ — NaN ต้องแปลว่า "ไม่ผ่าน" เสมอ */
const NONE = Object.freeze({ bull: false, bear: false, veto: null, score: 0 });

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null, score: number}}
 */
export function evaluate(ctx) {
  const { htfLookback, lowZone, highZone, minRangeAtrMult } = meta.params;
  const { bars, t, htf } = ctx;

  if (!htf) return { ...NONE };
  if (!Number.isInteger(t) || t < 1) return { ...NONE };

  const j = htf.t;
  const from = j - htfLookback + 1;
  // ยังสะสมแท่ง HTF ไม่ครบหน้าต่าง = ยังไม่มีกรอบให้พูดถึง ไม่ใช่ "กรอบสั้น ๆ ก็เอา"
  if (!Number.isInteger(j) || from < 0) return { ...NONE };

  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i <= j; i++) {
    const b = htf.bars[i];
    if (!b || !Number.isFinite(b.high) || !Number.isFinite(b.low)) return { ...NONE };
    if (b.high > hi) hi = b.high;
    if (b.low < lo) lo = b.low;
  }

  const range = hi - lo;
  if (!Number.isFinite(range) || !(range > 0)) return { ...NONE };

  const htfAtr = htf.ind.atr[j];
  if (!Number.isFinite(htfAtr) || !(htfAtr > 0)) return { ...NONE };
  if (!(range >= minRangeAtrMult * htfAtr)) return { ...NONE };

  const cNow = bars[t].close;
  const cPrev = bars[t - 1].close;
  if (!Number.isFinite(cNow) || !Number.isFinite(cPrev)) return { ...NONE };

  const p = (cNow - lo) / range;
  const pPrev = (cPrev - lo) / range;
  if (!Number.isFinite(p) || !Number.isFinite(pPrev)) return { ...NONE };

  // "เพิ่งข้ามเข้าโซน" เท่านั้น — และต้องยังอยู่ในกรอบ (0 <= p <= 1) ไม่ใช่หลุดกรอบไปแล้ว
  const bull = p >= 0 && p <= lowZone && pPrev > lowZone;
  const bear = p <= 1 && p >= highZone && pPrev < highZone;

  let score = 0;
  if (bull) score = clamp01((lowZone - p) / lowZone);
  else if (bear) score = clamp01((p - highZone) / (1 - highZone));

  return { bull, bear, veto: null, score };
}
