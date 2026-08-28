/**
 * Round-Number Grid — เลขกลมเป็นได้ทั้ง "โซนกลับตัว" และ "จุดไหลต่อ"
 *
 * ─────────────────────────────── แนวคิดที่มา ───────────────────────────────
 *
 * คำสั่งของคนกระจุกอยู่ที่เลขกลม (1.1500 · 160.00 · 4400) เพราะคนตั้ง limit และ stop
 * ที่เลขที่พูดออกมาแล้วจำได้ ผลคือเลขกลมมีสองพฤติกรรมที่ตรงข้ามกันและเกิดพอ ๆ กัน:
 *   · โซนกลับตัว — มี limit ฝั่งตรงข้ามรออยู่ ราคาแทงทะลุด้วยไส้แล้วถูกดันกลับ
 *   · จุดไหลต่อ — stop ที่กองอยู่ถูกกวาดพร้อมกัน ราคาปิดพ้นไปแล้วไหลต่อ
 * กฎนี้จึงไม่เลือกข้าง แต่ให้ "รูปร่างของแท่ง" เป็นตัวบอกว่าเกิดอันไหน:
 * ปิดกลับมาฝั่งเดิมหลังแทงเลย = กลับตัว · ปิดพ้นเลขกลมอย่างเด็ดขาด = ไหลต่อ
 *
 * ────────────────────── ตะแกรงเลขกลมเลือกยังไงให้วัดได้ ──────────────────────
 *
 * "เลขกลม" มีหลายชั้น (0.0010 · 0.0050 · 0.0100 …) จะใช้ชั้นไหนขึ้นกับว่าสินทรัพย์นั้น
 * เดินวันละเท่าไร ตะแกรงที่ถี่กว่าความผันผวนมากจะโดนแตะทุกแท่งจนไม่มีความหมาย
 * ส่วนตะแกรงที่ห่างเกินไปก็แทบไม่ถูกแตะเลย กฎนี้จึงเลือก "ชั้นที่ละเอียดที่สุดที่ยังกว้าง
 * อย่างน้อย stepMinAtrMult × ATR" จากบันได 1 · 2 · 5 × 10^k ซึ่งทุกขั้นบนบันไดนี้เป็น
 * เลขกลมจริงที่ผูกกับศูนย์ ไม่ใช่ตะแกรงที่ลอยตามราคา
 *
 * ────────────────────────── ทำไมเงื่อนไขถึงไม่ชนกันเอง ──────────────────────────
 *
 * ทุกเงื่อนไขตัดสินกับเลขกลมตัวที่ใกล้ราคาปิดที่สุดตัวเดียว ฝั่งซื้อทุกแบบต้องการ
 * close >= level ส่วนฝั่งขายทุกแบบต้องการ close <= level จึงเป็นไปไม่ได้ที่จะออกสองฝั่ง
 * พร้อมกัน ยกเว้นกรณี close = level เป๊ะ ซึ่งมีตัวกันไว้ให้คืน "ไม่มีความเห็น"
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. ชั้นของตะแกรงผูกกับ ATR ปัจจุบัน แปลว่าเลขกลมชุดที่กฎมองเห็นเปลี่ยนไปตามเวลา
 *    ระดับที่เป็นแนวเมื่อเดือนก่อนอาจไม่อยู่บนตะแกรงของวันนี้ — ซึ่งขัดกับความจริงที่ว่า
 *    ความสำคัญของ 1.1500 ไม่ได้ขึ้นกับว่าตลาดผันผวนแค่ไหนในสัปดาห์นี้
 * 2. บันได 1 · 2 · 5 ทำให้บางครั้งได้ตะแกรงที่ขั้น 2 (เช่น 1.1520 · 1.1540) ซึ่ง "กลม"
 *    น้อยกว่าขั้น 1 กับ 5 อย่างเห็นได้ชัด แต่ถ้าตัดขั้น 2 ทิ้ง ตะแกรงจะกระโดดห่างได้ถึง 5 เท่า
 *    จนแทบไม่มีสัญญาณ — เลือกความหนาแน่นแลกกับความกลม และนี่คือจุดอ่อนที่ยอมรับ
 * 3. ดูแค่แท่งปัจจุบันกับราคาปิดของแท่งก่อนหน้า ไม่ได้ดูว่าเลขกลมนั้นเคยถูกทดสอบมาแล้วกี่ครั้ง
 *    เลขกลมที่เพิ่งถูกทะลุเมื่อวานกับที่ไม่ถูกแตะมาสามเดือนถูกปฏิบัติเหมือนกันทุกประการ
 * 4. ไม่รู้จักเลขกลมที่ไม่ได้อยู่บนตะแกรงทศนิยม เช่นราคาที่คนจำเพราะเป็นจุดสูงสุดของปี
 * 5. เงื่อนไข "ไหลต่อ" ยิงได้ซ้ำเมื่อราคาไต่ผ่านเลขกลมหลายตัวติดกันในเทรนด์แรง ๆ
 *    ซึ่งจะทำให้ไม้ในเทรนด์เดียวถูกนับหลายไม้ ตัวกัน (prevClose ต้องอยู่อีกฝั่งของเลขกลม)
 *    ช่วยได้แค่ไม่ให้ยิงซ้ำที่เลขกลมตัวเดิม
 */

export const meta = {
  id: 'structure-levels-round-number-grid',
  name: 'ตะแกรงเลขกลม: โซนกลับตัวและจุดไหลต่อ',
  family: 'structure',
  needsHtf: false,
  params: {
    /** ขั้นบันไดที่ใช้สร้างตะแกรง — คูณกับกำลังของสิบ ทุกขั้นเป็นเลขกลมที่ผูกกับศูนย์ */
    mantissas: [1, 2, 5],
    /** เลือกขั้นที่ละเอียดที่สุดที่ยังกว้างอย่างน้อยกี่เท่าของ ATR */
    stepMinAtrMult: 1.0,
    /** ตัวกันเพดาน ถ้าขั้นที่เลือกได้กว้างเกินนี้ถือว่าไม่มีตะแกรงที่ใช้ได้ */
    stepMaxAtrMult: 3.0,
    /** ปิดพ้นเลขกลมอย่างน้อยกี่เท่าของ ATR ถึงนับว่า "ไหลต่อ" */
    breakAtr: 0.25,
    /** ไส้ต้องแทงเลยเลขกลมอย่างน้อยกี่เท่าของ ATR ถึงนับว่า "ถูกปฏิเสธ" */
    wickAtr: 0.25,
    /** ตำแหน่งราคาปิดในกรอบแท่งที่ยอมรับสำหรับการกลับตัวฝั่งซื้อ (ฝั่งขายใช้ 1 − ค่านี้) */
    minCloseLocation: 0.6,
    /** ตัวหารแปลงระยะ (เท่าของ ATR) เป็นคะแนน 0..1 */
    scoreSpanAtr: 0.75,
  },
};

/**
 * ขั้นตะแกรงที่ละเอียดที่สุดบนบันได mantissas × 10^k ที่ยังกว้าง >= target
 * คืน NaN ถ้าคำนวณไม่ได้ — ผู้เรียกต้องถือว่า NaN คือ "ไม่ผ่าน"
 */
function gridStep(target, mantissas) {
  if (!Number.isFinite(target) || !(target > 0)) return NaN;
  const k = Math.floor(Math.log10(target));
  // ไล่สองชั้น: ชั้น k อาจมีขั้นที่ใหญ่พอแล้ว ถ้าไม่มี ชั้น k+1 ขั้นแรกใหญ่พอแน่นอน
  for (let e = k; e <= k + 1; e++) {
    const base = 10 ** e;
    for (const m of mantissas) {
      const s = m * base;
      if (Number.isFinite(s) && s >= target) return s;
    }
  }
  return NaN;
}

const NONE = { bull: false, bear: false, veto: null, score: 0 };

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null, score: number}}
 */
export function evaluate(ctx) {
  const P = meta.params;
  const { bars, t, ind } = ctx;

  if (t < 1) return NONE;

  const atr = ind.atr[t];
  if (!Number.isFinite(atr) || !(atr > 0)) return NONE;

  const cur = bars[t];
  const prevClose = bars[t - 1].close;
  const { high, low, close } = cur;
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return NONE;
  if (!Number.isFinite(prevClose)) return NONE;
  if (!(close > 0)) return NONE; // ตะแกรงนิยามจากขนาดของราคา ราคาต้องเป็นบวก

  const step = gridStep(P.stepMinAtrMult * atr, P.mantissas);
  if (!Number.isFinite(step) || !(step > 0) || step > P.stepMaxAtrMult * atr) return NONE;

  // เลขกลมตัวที่ใกล้ราคาปิดที่สุด — ทุกเงื่อนไขในกฎนี้ตัดสินกับตัวนี้ตัวเดียว
  const level = Math.round(close / step) * step;
  if (!Number.isFinite(level)) return NONE;

  const barRange = high - low;
  if (!(barRange > 0)) return NONE;
  const closeLoc = (close - low) / barRange;

  const breakDist = P.breakAtr * atr;
  const wickDist = P.wickAtr * atr;
  const span = P.scoreSpanAtr * atr;

  let bull = false;
  let bear = false;
  let score = 0;

  // ── ไหลต่อ: แท่งก่อนหน้าปิดอีกฝั่งของเลขกลม แท่งนี้ปิดพ้นไปอย่างเด็ดขาด ──
  if (prevClose <= level && close >= level + breakDist) {
    bull = true;
    score = Math.max(score, Math.min(1, (close - level) / span));
  }
  if (prevClose >= level && close <= level - breakDist) {
    bear = true;
    score = Math.max(score, Math.min(1, (level - close) / span));
  }

  // ── กลับตัว: ไส้แทงเลยเลขกลมไปแล้วราคาปิดถูกดันกลับมาฝั่งเดิม ──
  if (low <= level - wickDist && close >= level && closeLoc >= P.minCloseLocation) {
    bull = true;
    score = Math.max(score, Math.min(1, (level - low) / span));
  }
  if (high >= level + wickDist && close <= level && closeLoc <= 1 - P.minCloseLocation) {
    bear = true;
    score = Math.max(score, Math.min(1, (high - level) / span));
  }

  // เกิดได้เฉพาะกรณี close = level เป๊ะ แล้วไส้ยาวทั้งสองข้าง — กฎไม่มีความเห็น ไม่ใช่มีสอง
  if (bull && bear) return NONE;
  if (!bull && !bear) return NONE;

  return { bull, bear, veto: null, score };
}
