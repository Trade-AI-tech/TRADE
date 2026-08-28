/**
 * กฎตัวอย่าง — RSI ต่ำ = ซื้อ / RSI สูง = ขาย
 *
 * ไฟล์นี้ไม่ได้มีไว้ให้เชื่อว่าใช้ได้จริง มันมีไว้พิสูจน์ว่า "ท่อ" ทำงาน:
 * ตัวรันหากฎเจอ · เรียก evaluate ได้ · ผ่านด่าน causality · เดินไม้ · คิด R · ออกตัวเลข
 * กฎ mean-reversion แบบไม่มีตัวกรองอะไรเลยเป็นตัวที่ "รู้อยู่แล้วว่าน่าจะแย่" จึงเหมาะ
 * เป็นเส้นฐาน — ถ้ากฎจริงชนะมันไม่ได้ กฎจริงก็ยังไม่มีค่าอะไร
 *
 * ขึ้นต้นด้วย _ เพื่อให้เรียงอยู่บนสุดและอ่านออกทันทีว่าไม่ใช่กฎที่ตั้งใจใช้จริง
 */

export const meta = {
  id: '_example-rsi-oversold',
  name: 'ตัวอย่าง: RSI ต่ำซื้อ / RSI สูงขาย',
  family: 'confluence',
  needsHtf: false,
  params: {
    // ประกาศไว้ตรงนี้ทั้งหมด ไม่ฝังเป็นตัวเลขลอยในเงื่อนไข เพราะเวลาจะกวาดค่าพารามิเตอร์
    // จะได้เห็นทันทีว่ามีอะไรให้กวาดบ้าง และรายงานจะได้บันทึกไปด้วยว่ารันด้วยค่าอะไร
    oversold: 30,
    overbought: 70,
    /** ตัวหารสำหรับแปลงระยะห่างจากเส้นเป็นคะแนน 0..1 — RSI ต่ำกว่าเส้น 30 จุดถือว่าเต็ม */
    scoreSpan: 30,
  },
};

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null, score: number}}
 */
export function evaluate(ctx) {
  const { oversold, overbought, scoreSpan } = meta.params;
  const rsi = ctx.ind.rsi[ctx.t];

  // NaN ต้องแปลว่า "ไม่ผ่าน" เสมอ — การเขียน rsi < 30 แล้วปล่อยให้ NaN ตกไปเป็น false
  // เองนั้นบังเอิญถูกสำหรับฝั่ง bull แต่ผิดทันทีถ้าใครกลับเครื่องหมายเป็น !(rsi >= 30)
  // จึงตัดจบด้วย isFinite ก่อน ไม่พึ่งพฤติกรรมของ NaN ในตัวเปรียบเทียบ
  if (!Number.isFinite(rsi)) return { bull: false, bear: false, veto: null, score: 0 };

  const bull = rsi < oversold;
  const bear = rsi > overbought;

  // ความแรง = ห่างจากเส้นไปเท่าไร หนีบไว้ที่ 1 เพื่อไม่ให้ไม้สุดขั้วไม้เดียวครองอันดับ
  let score = 0;
  if (bull) score = Math.min(1, (oversold - rsi) / scoreSpan);
  else if (bear) score = Math.min(1, (rsi - overbought) / scoreSpan);

  return { bull, bear, veto: null, score };
}
