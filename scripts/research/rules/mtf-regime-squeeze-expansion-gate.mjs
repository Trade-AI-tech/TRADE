/**
 * กฎ: ประตูบีบตัว → ขยายตัว (Squeeze -> Expansion Gate)
 *
 * ─────────────────────────────── แนวคิดที่มา ───────────────────────────────
 *
 * ความผันผวนเป็นวัฏจักร ช่วงที่แถบ Bollinger บีบแคบคือช่วงที่ตลาดสะสมพลังและไม่มีทิศ
 * ส่วนแท่งที่แถบเริ่ม "กางออก" คือจุดที่ตลาดเลือกทางแล้ว กฎนี้จึงแยกหน้าที่ออกเป็นสองชั้น
 * ชัด ๆ: ชั้นแรกตัดสิน "จังหวะ" (บีบมาก่อน แล้วเพิ่งกางออกที่แท่งนี้) ชั้นที่สองตัดสิน "ทิศ"
 * ด้วยการโหวตจากสามตัวที่มองคนละมุม — ตำแหน่งเทียบเส้นกลาง Bollinger (ราคาสัมพัทธ์),
 * MACD histogram (โมเมนตัม), และ RSI เทียบ 50 (แรงซื้อ-ขายสะสม)
 *
 * เหตุผลที่ต้องแยกจังหวะออกจากทิศ: การบีบตัวบอกแค่ว่า "กำลังจะมีอะไรเกิด" ไม่ได้บอกว่า
 * จะไปทางไหน ถ้าเอาการบีบตัวไปผูกกับทิศเดียวตายตัว (เช่นบีบแล้วซื้ออย่างเดียว) กฎจะ
 * ถูกทดสอบด้วยตลาดขาลงแล้วพังโดยที่เราแยกไม่ออกว่าพังเพราะจังหวะผิดหรือเพราะทิศผิด
 *
 * ─────────────────────────── ทำไมตั้งเกณฑ์แบบนี้ ───────────────────────────
 *
 * · วัดความบีบด้วย "อันดับเปอร์เซ็นไทล์ของ bandwidth ในหน้าต่างย้อนหลัง" ไม่ใช่ค่าคงที่
 *   เพราะ bandwidth ของทองคำกับของ EURGBP อยู่คนละสเกลกันสิบเท่า เกณฑ์ตายตัวค่าเดียว
 *   จะกลายเป็น "กฎนี้เทรดเฉพาะคู่เงินที่ผันผวนต่ำ" โดยไม่ได้ตั้งใจ
 * · เงื่อนไขบีบวัดที่แท่ง t-1 ส่วนเงื่อนไขกางวัดที่ t เทียบกับ t-1 — เพราะนิยามของ
 *   "เพิ่งออกจากการบีบ" ต้องการสองสถานะที่ต่อกัน ถ้าวัดความบีบที่แท่ง t เอง แท่งที่กาง
 *   แรง ๆ จะดันตัวเองออกจากเปอร์เซ็นไทล์ต่ำทันทีและกฎจะแทบไม่ยิงเลย
 * · ต้องกางอย่างน้อย expansionMult เท่า ไม่ใช่แค่ "กว้างขึ้น" เพราะ bandwidth ขยับขึ้นลง
 *   ทีละเศษเสี้ยวตลอดเวลาอยู่แล้ว เกณฑ์ "มากกว่าแท่งก่อน" เฉย ๆ จะยิงประมาณครึ่งหนึ่ง
 *   ของทุกแท่ง ซึ่งไม่ใช่เหตุการณ์ที่เรียกว่า expansion
 * · โหวตต้องครบสามเสียงที่อ่านค่าได้ (ไม่ใช่ NaN) แล้วต้องเห็นตรงกันอย่างน้อย minAgreeVotes
 *   เสียง — สามเสียงโหวตทำให้ไม่มีทางเสมอเมื่อทุกเสียงเลือกข้าง และการเรียกร้อง 2 ใน 3
 *   ทำให้ทิศมาจาก "ความเห็นพ้อง" ไม่ใช่จากตัวชี้วัดตัวเดียวที่บังเอิญเอียง
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. กฎนี้ยิงตอนความผันผวน "เพิ่งกระโดด" ซึ่งเป็นแท่งเดียวกับที่ ATR ยังไม่ทันขยับตาม
 *    (ATR เป็นค่าเฉลี่ยเคลื่อนที่ ตามหลังเสมอ) ตัวรันคิดระยะ SL จาก ATR ณ แท่งสัญญาณ
 *    ระยะ SL ของกฎนี้จึงมีแนวโน้มแคบเกินจริงอย่างเป็นระบบ แปลว่าโดน SL ง่ายกว่าที่ควร
 *    และ cost_R สูงกว่ากฎอื่นด้วย (ตัวหารของ cost_R คือระยะ SL) — ข้อนี้เป็นอคติที่ฝัง
 *    อยู่ในโครงการทดสอบ ไม่ใช่ในตัวกฎ แต่มันกดผลของกฎนี้ลงจริง ๆ ต้องอ่านตัวเลข avgCostR
 *    ประกอบเสมอ
 * 2. bandwidth หารด้วยเส้นกลาง (SMA20) จึงเป็นสัดส่วนของราคา — ใช้ได้กับข้อมูลราคาบวก
 *    เท่านั้น ถ้าวันหนึ่งจักรวาลมีสินทรัพย์ที่ราคาติดลบได้ (สเปรด, ส่วนต่าง) สูตรนี้พัง
 *    ตอนนี้กันด้วยการบังคับ middle > 0 ซึ่งทำให้เคสแบบนั้นกลายเป็น "ไม่ออกสัญญาณ"
 * 3. เปอร์เซ็นไทล์คิดจากหน้าต่าง bwLookback แท่งล่าสุดเท่านั้น ถ้าตลาดเข้าสู่ยุคที่ผันผวน
 *    ต่ำยาวนาน หน้าต่างจะเลื่อนตามจนทุกแท่งดู "ไม่บีบ" เมื่อเทียบกับเพื่อนบ้าน กฎจะเงียบ
 *    ไปทั้งยุคทั้งที่ในเชิงสัมบูรณ์นั่นคือช่วงที่บีบที่สุด — เป็นราคาที่ยอมจ่ายเพื่อให้
 *    เกณฑ์เทียบกันได้ข้ามสินทรัพย์
 * 4. ทั้งสามเสียงโหวตคำนวณจากราคาปิดชุดเดียวกัน จึงสัมพันธ์กันสูง "2 ใน 3" ไม่ได้แปลว่า
 *    มีหลักฐานอิสระสามชิ้น และวัดจริงแล้วพบว่ามันแทบไม่ได้ทำหน้าที่กรองอะไรเลย: ทุกแท่ง
 *    ที่ผ่านประตูจังหวะบน train+validation (1D 1,066 แท่ง · 1H 3,788 แท่ง) ผ่านเกณฑ์
 *    2 ใน 3 หมด 100% และถึงจะเรียกร้องเอกฉันท์ 3 เสียง ก็ยังเหลือ 96.2% (1D) กับ
 *    93.9% (1H) อยู่ดี แปลว่าในทางปฏิบัติ "ทิศ" ของกฎนี้ถูกกำหนดโดยชั้นโหวตก็จริง
 *    แต่ชั้นโหวตไม่ได้ปฏิเสธสัญญาณไหนเลย ตัวกรองที่ทำงานจริงมีแค่ประตูจังหวะชั้นแรก
 *    (minAgreeVotes จึงเป็นพารามิเตอร์ที่ขยับแล้วแทบไม่เปลี่ยนอะไร — ถ้าอยากให้ชั้นทิศ
 *    มีน้ำหนักจริงต้องเปลี่ยนไปใช้ตัวชี้วัดที่ไม่ได้มาจากราคาปิดชุดเดียวกัน)
 */

export const meta = {
  id: 'mtf-regime-squeeze-expansion-gate',
  name: 'ประตูบีบตัวแล้วขยายตัว ทิศจากเสียงโหวตสามเสียง',
  family: 'structure',
  needsHtf: false,
  params: {
    /** หน้าต่างที่ใช้จัดอันดับความบีบของ bandwidth */
    bwLookback: 60,
    /** bandwidth ที่แท่งก่อนต้องอยู่ในอันดับล่างไม่เกินสัดส่วนนี้ของหน้าต่าง */
    squeezePctRank: 0.20,
    /** bandwidth แท่งนี้ต้องเป็นกี่เท่าของแท่งก่อนถึงจะเรียกว่า "กางออก" */
    expansionMult: 1.15,
    /** ต้องมีเสียงโหวตเห็นตรงกันกี่เสียงจากสามเสียง */
    minAgreeVotes: 2,
    /** เส้นกลางของ RSI ที่ใช้แบ่งข้างในการโหวต */
    rsiMid: 50,
    /** อัตราการกางที่เกิน 1 เท่านี้ ให้ถือว่า score เต็ม (เช่น 0.5 = กาง 50%) */
    scoreSpan: 0.5,
  },
};

const NONE = Object.freeze({ bull: false, bear: false, veto: null, score: 0 });

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** bandwidth ของ Bollinger เป็นสัดส่วนของเส้นกลาง — คืน NaN ถ้าอ่านค่าไม่ได้ */
function bandwidthAt(bb, i) {
  const up = bb.upper[i];
  const lo = bb.lower[i];
  const mid = bb.middle[i];
  if (!Number.isFinite(up) || !Number.isFinite(lo) || !Number.isFinite(mid)) return NaN;
  if (!(mid > 0)) return NaN;
  const w = (up - lo) / mid;
  return Number.isFinite(w) && w >= 0 ? w : NaN;
}

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null, score: number}}
 */
export function evaluate(ctx) {
  const {
    bwLookback, squeezePctRank, expansionMult, minAgreeVotes, rsiMid, scoreSpan,
  } = meta.params;
  const { bars, t, ind } = ctx;

  if (!Number.isInteger(t) || t < 1) return { ...NONE };
  // ต้องมี bandwidth ครบหน้าต่าง [t-bwLookback .. t-1] ถึงจะจัดอันดับได้อย่างมีความหมาย
  if (t - bwLookback < 0) return { ...NONE };

  const bwNow = bandwidthAt(ind.bb, t);
  const bwPrev = bandwidthAt(ind.bb, t - 1);
  if (!Number.isFinite(bwNow) || !Number.isFinite(bwPrev) || !(bwPrev > 0)) return { ...NONE };

  // ── ชั้นที่ 1: จังหวะ ── บีบมาก่อน (อันดับล่างของหน้าต่าง) แล้วเพิ่งกางออกที่แท่งนี้
  let below = 0;
  for (let i = t - bwLookback; i <= t - 1; i++) {
    const w = bandwidthAt(ind.bb, i);
    // แท่งที่อ่าน bandwidth ไม่ได้ = จัดอันดับไม่ครบ = ไม่ผ่าน (ห้ามให้ NaN กลายเป็นผ่าน)
    if (!Number.isFinite(w)) return { ...NONE };
    if (w <= bwPrev) below++;
  }
  const rank = below / bwLookback;
  const squeezed = rank <= squeezePctRank;
  if (!squeezed) return { ...NONE };

  const ratio = bwNow / bwPrev;
  if (!Number.isFinite(ratio) || !(ratio >= expansionMult)) return { ...NONE };

  // ── ชั้นที่ 2: ทิศ ── โหวตสามเสียง ต้องอ่านค่าได้ครบทั้งสามก่อน
  const close = bars[t].close;
  const mid = ind.bb.middle[t];
  const hist = ind.macd.histogram[t];
  const rsi = ind.rsi[t];
  if (!Number.isFinite(close) || !Number.isFinite(mid)
    || !Number.isFinite(hist) || !Number.isFinite(rsi)) {
    return { ...NONE };
  }

  let bullVotes = 0;
  let bearVotes = 0;
  if (close > mid) bullVotes++; else if (close < mid) bearVotes++;
  if (hist > 0) bullVotes++; else if (hist < 0) bearVotes++;
  if (rsi > rsiMid) bullVotes++; else if (rsi < rsiMid) bearVotes++;

  const bull = bullVotes >= minAgreeVotes && bullVotes > bearVotes;
  const bear = bearVotes >= minAgreeVotes && bearVotes > bullVotes;
  if (!bull && !bear) return { ...NONE };

  const score = scoreSpan > 0 ? clamp01((ratio - 1) / scoreSpan) : 0;
  return { bull, bear, veto: null, score };
}
