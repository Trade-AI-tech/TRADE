/**
 * กฎ: ใช้ Efficiency Ratio เป็น "สวิตช์เลือกตระกูลกฎ" (Efficiency Ratio Router)
 *
 * ─────────────────────────────── แนวคิดที่มา ───────────────────────────────
 *
 * Efficiency Ratio ของ Kaufman = ระยะทางสุทธิ ÷ ระยะทางที่เดินจริง ในหน้าต่างเดียวกัน
 * ค่าใกล้ 1 แปลว่าราคาเดินตรงไปทางเดียว (ตลาดมีเทรนด์) ใกล้ 0 แปลว่าเดินไปเดินมา
 * แล้วกลับมาที่เดิม (ตลาดแกว่ง) มันวัด "รูปทรงของการเดิน" ตรง ๆ ไม่ต้องผ่านการปรับเรียบ
 * แบบ ADX จึงตอบสนองไวกว่าและอ่านง่ายกว่าเวลาเอาไปใช้เป็นสวิตช์
 *
 * จุดต่างจากกฎ regime ทั่วไป: ที่นี่ regime ไม่ได้ทำหน้าที่ "ฟิลเตอร์" (คือปล่อยสัญญาณผ่าน
 * หรือไม่ปล่อย) แต่ทำหน้าที่ "เลือกว่าจะใช้ตระกูลกฎไหนถาม" — ตลาดมีเทรนด์ถามกฎตามเทรนด์
 * (ราคาเทียบ MA50 + ทิศของ MACD histogram) ตลาดแกว่งถามกฎสวนทาง (หลุดขอบ Bollinger
 * พร้อม RSI สุดขั้ว) เหตุผลคือกฎสวนทางกับกฎตามเทรนด์ให้สัญญาณ "ตรงข้ามกัน" ในสถานการณ์
 * เดียวกัน การเอา regime ไปกรองกฎเดียวจึงทิ้งครึ่งหนึ่งของโอกาสไปเปล่า ๆ ทั้งที่อีกครึ่ง
 * มีกฎที่เหมาะกับมันอยู่แล้ว
 *
 * ─────────────────────────── ทำไมตั้งเกณฑ์แบบนี้ ───────────────────────────
 *
 * · erPeriod = 20 ให้ ER มองย้อนพอที่จะไม่แกว่งตามสองสามแท่ง แต่ยังสั้นพอจะเปลี่ยน regime
 *   ได้ภายในรอบเดียวของตลาด (บน 1D ≈ หนึ่งเดือน บน 1H ≈ หนึ่งวันเต็มกว่า ๆ)
 * · มี "โซนตาย" ระหว่าง chopThreshold กับ trendThreshold ที่กฎไม่ตอบอะไรเลย โดยตั้งใจ —
 *   ถ้าแบ่งด้วยเส้นเดียว ทุกครั้งที่ ER สั่นรอบเส้น กฎจะสลับตระกูลไปมาแล้วออกสัญญาณ
 *   ตรงข้ามกันในสองแท่งติดกัน ซึ่งเป็นพฤติกรรมที่วัดผลแล้วตีความไม่ได้เลย
 * · สาขาเทรนด์ใช้เงื่อนไขสองชั้นที่ต้องเห็นตรงกัน (ตำแหน่งเทียบ MA50 = ทิศระยะกลาง,
 *   MACD histogram = โมเมนตัมกำลังเร่งหรือชะลอ) เพื่อไม่ให้เข้าไม้สวนโมเมนตัมที่กำลังหมด
 * · สาขาสวนทางบังคับให้ราคา "ปิดนอกแถบ Bollinger" ไม่ใช่แค่แตะ และต้องมี RSI สุดขั้ว
 *   ประกอบ เพราะการหลุดแถบเฉย ๆ เกิดตอนเริ่มเทรนด์ใหม่ได้พอ ๆ กับตอนแกว่งสุดขั้ว
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. สองสาขาไม่สมมาตรกันเลยเรื่องความถี่ และวัดออกมาแล้วว่าหนักกว่าที่คาด (train+validation
 *    ทั้งจักรวาล): 1D ออกสัญญาณจากสาขาเทรนด์ 9,045 ครั้ง แต่สาขาสวนทางแค่ 350 ครั้ง (3.7%)
 *    · 1H เทรนด์ 27,941 ครั้ง สวนทาง 1,223 ครั้ง (4.2%) ทั้งที่จำนวน "แท่ง" ที่อยู่ใน
 *    regime แกว่งมีมากกว่าฝั่งเทรนด์เสียอีก (1D: แกว่ง 50.8% ของแท่ง เทียบกับเทรนด์ 15.8%)
 *    — ความไม่สมมาตรจึงไม่ได้มาจากสวิตช์ แต่มาจากเงื่อนไขในสาขาสวนทางที่หายากกว่ามาก
 *    ผลรวมของกฎนี้จึงเป็นผลของสาขาเทรนด์เกือบล้วน ห้ามอ่านผลรวมว่าเป็นคำตอบว่า
 *    "การ route ได้ผล" — ถ้าจะสรุปเรื่อง routing ต้องวัดสองสาขาแยกกันเป็นคนละกฎ
 * 2. ER ไม่บอกทิศ บอกแค่ว่าเดินตรงหรือเดินวน ทิศทั้งหมดมาจากกฎในสาขา ถ้ากฎในสาขาห่วย
 *    สวิตช์ที่แม่นแค่ไหนก็ช่วยไม่ได้ — กฎนี้วัด "สวิตช์ + สาขา" รวมกัน แยกกันไม่ออก
 * 3. เส้นแบ่ง 0.20 / 0.40 เลือกจากช่วงที่ ER มักอยู่ ไม่ได้กวาดหาค่าที่ดีที่สุด และไม่ได้
 *    ปรับตาม TF ทั้งที่การกระจายตัวของ ER บน 1H กับ 1D ไม่เหมือนกัน — เส้นเดียวกันจึง
 *    อาจแบ่ง 1H ได้ไม่ดีเท่า 1D (หรือกลับกัน) ตัวเลขที่ได้ต้องอ่านแยก TF เสมอ
 * 4. ไม่ได้ใช้ ctx.htf เลย (needsHtf = false) — "regime" ที่นี่คือ regime ของ TF ตัวเอง
 *    ไม่ใช่ของ TF ใหญ่ ถ้าอยากได้ regime จาก TF ใหญ่ต้องเขียนเป็นอีกกฎหนึ่ง ไม่ใช่แก้ไฟล์นี้
 *    เพราะจะกลายเป็นสองกฎที่วัดคนละอย่างใต้ชื่อเดียวกัน
 */

export const meta = {
  id: 'mtf-regime-efficiency-ratio-router',
  name: 'สวิตช์ตาม Efficiency Ratio: เทรนด์ตาม / แกว่งสวน',
  family: 'confluence',
  needsHtf: false,
  params: {
    /** หน้าต่างของ Efficiency Ratio */
    erPeriod: 20,
    /** ER >= ค่านี้ = ตลาดเดินตรง → ใช้สาขาตามเทรนด์ */
    trendThreshold: 0.40,
    /** ER <= ค่านี้ = ตลาดเดินวน → ใช้สาขาสวนทาง */
    chopThreshold: 0.20,
    /** RSI ที่ถือว่าถูกกดต่ำพอในสาขาสวนทาง */
    rsiOversold: 35,
    /** RSI ที่ถือว่าถูกดันสูงพอในสาขาสวนทาง */
    rsiOverbought: 65,
  },
};

const NONE = Object.freeze({ bull: false, bear: false, veto: null, score: 0 });

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null, score: number}}
 */
export function evaluate(ctx) {
  const {
    erPeriod, trendThreshold, chopThreshold, rsiOversold, rsiOverbought,
  } = meta.params;
  const { bars, t, ind } = ctx;

  if (!Number.isInteger(t) || t < erPeriod) return { ...NONE };

  // ── Efficiency Ratio: อ่านเฉพาะ bars[t-erPeriod .. t] ทั้งหมดอยู่ในอดีตของ t ──
  const cNow = bars[t].close;
  const cFar = bars[t - erPeriod].close;
  if (!Number.isFinite(cNow) || !Number.isFinite(cFar)) return { ...NONE };

  let path = 0;
  for (let i = t - erPeriod + 1; i <= t; i++) {
    const a = bars[i].close;
    const b = bars[i - 1].close;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { ...NONE };
    path += Math.abs(a - b);
  }
  // ราคานิ่งสนิททั้งหน้าต่าง = หารด้วยศูนย์ ไม่ใช่ "ตลาดเดินวนสุดขีด" จึงต้องตัดทิ้ง
  if (!(path > 0) || !Number.isFinite(path)) return { ...NONE };

  const er = Math.abs(cNow - cFar) / path;
  if (!Number.isFinite(er)) return { ...NONE };

  // ── สาขาที่ 1: ตลาดเดินตรง → ตามเทรนด์ ──
  if (er >= trendThreshold) {
    const ma50 = ind.ma50[t];
    const hist = ind.macd.histogram[t];
    if (!Number.isFinite(ma50) || !Number.isFinite(hist)) return { ...NONE };

    const bull = cNow > ma50 && hist > 0;
    const bear = cNow < ma50 && hist < 0;
    if (!bull && !bear) return { ...NONE };

    const score = clamp01((er - trendThreshold) / (1 - trendThreshold));
    return { bull, bear, veto: null, score };
  }

  // ── สาขาที่ 2: ตลาดเดินวน → สวนทาง ──
  if (er <= chopThreshold) {
    const upper = ind.bb.upper[t];
    const lower = ind.bb.lower[t];
    const rsi = ind.rsi[t];
    if (!Number.isFinite(upper) || !Number.isFinite(lower) || !Number.isFinite(rsi)) {
      return { ...NONE };
    }

    const bull = cNow < lower && rsi < rsiOversold;
    const bear = cNow > upper && rsi > rsiOverbought;
    if (!bull && !bear) return { ...NONE };

    const score = chopThreshold > 0 ? clamp01((chopThreshold - er) / chopThreshold) : 0;
    return { bull, bear, veto: null, score };
  }

  // ── โซนตายระหว่างสองเส้น: ไม่ตอบอะไรเลย ──
  return { ...NONE };
}
