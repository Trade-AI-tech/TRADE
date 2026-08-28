/**
 * Multi-Timeframe Alignment Gate — ยอมให้เข้าไม้ก็ต่อเมื่อ "กรอบใหญ่ที่ปิดแล้ว" ชี้ทางเดียวกับกรอบเล็ก
 *
 * ─────────────────────────────── มาจากแนวคิดอะไร ───────────────────────────────
 *
 * ความเชื่อพื้นฐานของการเทรดตามเทรนด์คือ สัญญาณกรอบเล็กที่สวนทางกรอบใหญ่มักเป็นแค่
 * เสียงรบกวนของการย่อ ส่วนสัญญาณที่ไปทางเดียวกับกรอบใหญ่มีโอกาสได้แรงส่งต่อ
 * กฎนี้จึงไม่ได้ "หาสัญญาณใหม่" แต่เอาสัญญาณกรอบเล็กที่ง่ายที่สุด (ราคาตัดขึ้น/ลง MA50)
 * มาผ่านประตูของกรอบใหญ่ เพื่อวัดตรง ๆ ว่าการจัดแนวสองกรอบเวลามีค่าจริงหรือไม่
 *
 * ─────────────────────────────── ทำไมตั้งเกณฑ์แบบนี้ ───────────────────────────────
 *
 * · ทิศกรอบใหญ่ไม่ได้ดูแค่ "ราคาอยู่เหนือ MA50" เพราะในตลาดออกข้าง ราคาจะสลับข้าง MA
 *   ไปมาทุกสองสามแท่ง แล้วประตูก็จะเปิดสลับทิศจนไร้ความหมาย จึงบังคับเพิ่มว่า MA50
 *   ของกรอบใหญ่ต้อง "เคลื่อนที่จริง" อย่างน้อย htfMinSlopeAtr เท่าของ ATR ในช่วง
 *   htfSlopeLookback แท่ง — ใช้ ATR เป็นตัวหารเพราะเกณฑ์เป็นสัดส่วนของความผันผวน
 *   จึงเทียบกันได้ทั้งทอง เยน และคู่เงินที่สเกลราคาต่างกันเป็นพันเท่า
 * · ฝั่งกรอบเล็กใช้ "การตัดสด" (แท่งก่อนหน้าอยู่คนละข้างของ MA50) ไม่ใช่ "อยู่เหนือ MA50"
 *   เฉย ๆ เพราะเงื่อนไขแบบหลังเป็นจริงติดกันเป็นร้อยแท่ง แล้วกฎจะยิงไม้ทับกันเองจน
 *   ตัวเลขที่ได้กลายเป็นการวัด "เทรนด์ยาวแค่ไหน" มากกว่าวัดคุณภาพของจุดเข้า
 * · เมื่อกรอบใหญ่ไม่มีทิศ (ความชันไม่ถึงเกณฑ์ หรือคำนวณไม่ได้) กฎคืน veto='both'
 *   ปิดประตูทั้งสองฝั่ง — เพราะบทบาทของกฎนี้คือประตู ไม่ใช่คนเดา
 *
 * ─────────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────────
 *
 * 1. needsHtf=true จึงวัดได้เฉพาะกรอบ 1H เท่านั้น บนกรอบ 1D ตัวรันไม่มี TF ที่ใหญ่กว่า
 *    ให้ (ctx.htf เป็น null เสมอ) ผลของ 1D จึงเป็น 0 ไม้ "โดยโครงสร้าง" ไม่ใช่เพราะ
 *    เกณฑ์แน่นเกินไป — อย่าอ่านช่องนั้นว่ากฎแย่
 * 2. แท่ง 1D ที่ใช้เป็นบริบทอยู่ในช่วง test ของ 1D (ข้อจำกัดของตัวรันเอง ดู split.json)
 *    ผลชุดนี้จึงห้ามเอาไปอ้างว่าชุด test ของ 1D ยังบริสุทธิ์
 * 3. ประตูนี้ "ตามหลัง" เสมอ ตอนเทรนด์กรอบใหญ่กลับตัว MA50 ยังชี้ทางเก่าอยู่หลายแท่ง
 *    กฎจะยังเปิดประตูผิดทางในช่วงนั้น เป็นราคาที่ต้องจ่ายของตัวกรองที่ใช้ค่าเฉลี่ย
 * 4. การตัด MA50 บนกรอบเล็กเป็นทริกเกอร์ที่ "ช้าและธรรมดามาก" ตัวเลขที่ออกมาจึงวัด
 *    คุณค่าของ "การจัดแนว" เป็นหลัก ไม่ได้วัดว่าทริกเกอร์นี้ดีที่สุด
 */

export const meta = {
  id: 'mtf-trend-alignment-gate',
  name: 'ประตูจัดแนวสองกรอบเวลา (กรอบใหญ่ต้องปิดแท่งแล้ว)',
  family: 'mtf',
  needsHtf: true,
  params: {
    /** ช่วงวัดความชันของ MA50 กรอบใหญ่ (หน่วย: แท่งของกรอบใหญ่) */
    htfSlopeLookback: 10,
    /** MA50 กรอบใหญ่ต้องขยับอย่างน้อยกี่เท่าของ ATR กรอบใหญ่ ถึงจะนับว่ามีทิศ */
    htfMinSlopeAtr: 0.25,
    /** ตัวหารแปลงระยะห่าง close-MA50 ของกรอบใหญ่เป็นคะแนน 0..1 (หน่วย ATR) */
    scoreAtrSpan: 2.0,
  },
};

/** ปิดประตูทั้งสองฝั่ง — ใช้กับทุกกรณีที่ "ตัดสินไม่ได้" เพื่อไม่ให้ NaN กลายเป็นการอนุญาต */
const BLOCK = { bull: false, bear: false, veto: 'both', score: 0 };

const finite = (v) => Number.isFinite(v);

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null|'bull'|'bear'|'both', score: number}}
 */
export function evaluate(ctx) {
  const { htfSlopeLookback, htfMinSlopeAtr, scoreAtrSpan } = meta.params;
  const { bars, t, ind, htf } = ctx;

  if (!htf) return BLOCK;
  const T = htf.t;
  if (!Number.isInteger(T) || T - htfSlopeLookback < 0) return BLOCK;
  if (t < 1) return BLOCK;

  // ── ทิศของกรอบใหญ่ อ่านจากแท่ง htf.bars[T] ซึ่งตัวรันรับประกันแล้วว่าปิดไปก่อน bars[t] ──
  const hClose = htf.bars[T].close;
  const hMa = htf.ind.ma50[T];
  const hMaBack = htf.ind.ma50[T - htfSlopeLookback];
  const hAtr = htf.ind.atr[T];
  if (!finite(hClose) || !finite(hMa) || !finite(hMaBack) || !finite(hAtr) || !(hAtr > 0)) {
    return BLOCK;
  }

  const slope = hMa - hMaBack;
  const minMove = htfMinSlopeAtr * hAtr;
  const htfUp = hClose > hMa && slope >= minMove;
  const htfDown = hClose < hMa && -slope >= minMove;
  if (!htfUp && !htfDown) return BLOCK;

  const veto = htfUp ? 'bear' : 'bull';

  // ── ทริกเกอร์กรอบเล็ก: ราคาตัด MA50 "สด ๆ" ที่แท่งนี้ ──
  const c = bars[t].close;
  const cPrev = bars[t - 1].close;
  const m = ind.ma50[t];
  const mPrev = ind.ma50[t - 1];
  if (!finite(c) || !finite(cPrev) || !finite(m) || !finite(mPrev)) {
    // ทิศกรอบใหญ่ยังบอกได้ แต่ยิงไม้ไม่ได้ — ประตูยังทำหน้าที่ของมันต่อไป
    return { bull: false, bear: false, veto, score: 0 };
  }

  const crossUp = c > m && cPrev <= mPrev;
  const crossDown = c < m && cPrev >= mPrev;

  const bull = htfUp && crossUp;
  const bear = htfDown && crossDown;

  // ความแรง = กรอบใหญ่ยืดออกจากเส้นไปแล้วกี่ ATR (ยิ่งห่าง ยิ่งเป็นเทรนด์ที่ชัด)
  const score = bull || bear
    ? Math.min(1, Math.abs(hClose - hMa) / (scoreAtrSpan * hAtr))
    : 0;

  return { bull, bear, veto, score };
}
