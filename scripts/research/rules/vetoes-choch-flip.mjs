/**
 * วีโต้ #4 — Change of Character (CHoCH): โครงสร้างเพิ่งพลิก ห้ามฝั่งเดิม
 *
 * ─────────────────────────── กฎนี้มาจากแนวคิดอะไร ───────────────────────────
 *
 * โครงสร้างตลาดอ่านจากลำดับจุดกลับตัว: ขาขึ้นคือ "ยอดสูงขึ้น + ก้นสูงขึ้น" (HH + HL)
 * ตราบใดที่ลำดับนี้ยังอยู่ การซื้อย่อคือการเล่นตามน้ำ แต่วินาทีที่ราคาปิดต่ำกว่า **ก้นล่าสุด**
 * ลำดับนั้นขาดลง — คนที่ถือ long ตั้งแต่ก้นเดิมเริ่มขาดทุน และ "ผู้ซื้อที่เคยชนะทุกครั้ง"
 * เพิ่งแพ้เป็นครั้งแรก นั่นคือความหมายของคำว่า character เปลี่ยน
 *
 * ประเด็นสำคัญคือกฎนี้ไม่ได้แปลว่า "ให้กลับข้างไปขายทันที" — หลัง CHoCH ตลาดมักเหวี่ยงแรง
 * และยังไม่มีโครงสร้างใหม่ให้อ้างอิง สิ่งที่มีหลักฐานรองรับกว่าคือ "ฝั่งเดิมใช้ไม่ได้แล้วชั่วคราว"
 * กฎนี้จึงเป็นวีโต้ข้างเดียวล้วน ๆ: ห้ามฝั่งที่เพิ่งแพ้ ไม่ออกสัญญาณให้ฝั่งตรงข้าม
 *
 * ─────────────────────────── ทำไมเกณฑ์ถึงเป็นแบบนี้ ───────────────────────────
 *
 * · pivot ต้องยืนยันด้วยแท่งขวา L แท่ง — pivot ที่ใช้ได้ล่าสุดจึงอยู่ที่ดัชนี t − L เสมอ
 *   ข้อนี้เป็นหัวใจของความซื่อสัตย์ของกฎแนวโครงสร้างทั้งตระกูล: "ก้นล่าสุด" ที่คนมองกราฟ
 *   ย้อนหลังเห็น เป็นก้นที่ ณ เวลานั้นยังไม่มีใครรู้ว่าเป็นก้น การใช้มันคือการมองอนาคต
 *
 * · แท่งที่นับว่า "ทะลุ" ต้องอยู่ที่ดัชนี >= pl + L (pl = ดัชนีของก้น) เพราะก่อนหน้านั้น
 *   ก้นยังไม่ถูกยืนยัน จะบอกว่า "ทะลุก้น" ในตอนที่ยังไม่รู้ว่ามีก้นอยู่ตรงนั้นไม่ได้
 *
 * · ทะลุวัดด้วย "ราคาปิด" ไม่ใช่ไส้เทียน และต้องเลยไปอีก breakBufferAtr เท่าของ ATR
 *   ไส้ที่แหย่ลงไปแล้วดึงกลับคือรูปแบบที่ตรงข้ามกับ CHoCH โดยสิ้นเชิง (มันคือการกวาด stop
 *   แล้วไปต่อทางเดิม) ถ้านับไส้ด้วย กฎนี้จะวีโต้ผิดฝั่งในจังหวะที่แพงที่สุดพอดี
 *
 * · "เพิ่งพลิก" มีอายุ: นับเฉพาะการทะลุครั้งแรกที่เกิดภายใน freshBars แท่งหลังสุด
 *   เพราะหลังจากนั้นตลาดสร้างโครงสร้างใหม่ไปแล้ว การห้ามต่อคือการถือความเชื่อค้างไว้
 *   คะแนนจึงลดตามอายุของการทะลุ (พลิกเมื่อแท่งที่แล้ว = แรงสุด)
 *
 * · ขาของโครงสร้าง (|ยอดล่าสุด − ก้นล่าสุด|) ต้องใหญ่อย่างน้อย minLegAtr เท่าของ ATR
 *   ไม่งั้นการแกว่งเล็ก ๆ ในตลาดนิ่งจะถูกอ่านเป็น "โครงสร้าง" แล้ววีโต้ทั้งวัน
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. โครงสร้างอ่านจาก pivot แค่ 2 คู่ (ยอดล่าสุด/ก่อนหน้า · ก้นล่าสุด/ก่อนหน้า) ตลาดจริงมี
 *    โครงสร้างซ้อนกันหลายชั้น กฎนี้เห็นชั้นเดียวคือชั้นที่ pivotLookback กำหนดเท่านั้น
 * 2. เพราะต้องรอ pivot ยืนยัน วีโต้จึงมาช้ากว่าที่คนอ่านกราฟสดจะเห็นเสมอ อย่างน้อย L แท่ง
 *    — ราคาที่ต้องจ่ายเพื่อไม่โกง ไม่ใช่จุดอ่อนที่ปรับพารามิเตอร์แล้วหาย
 * 3. ต้องมี pivot ครบ 4 ตัวใน scanBars แท่งย้อนหลัง ไม่งั้นเงียบ ในตลาดที่เทรนด์ยาว
 *    ไม่ค่อยแกว่ง (เช่นช่วง carry trade ของ JPY) กฎนี้จะไม่มีอะไรพูดเลยเป็นช่วง ๆ
 * 4. เงื่อนไข HH+HL / LH+LL เข้มกว่าที่คนส่วนใหญ่ใช้ (หลายสำนักดูแค่ก้นสูงขึ้นอย่างเดียว)
 *    ทำให้ยิงถี่น้อยลงมาก ตัวเลขความถี่จริงต้องดูจากรายงาน ไม่ใช่เดา
 * 5. วีโต้นี้ไม่รู้จักบริบท TF ใหญ่ (needsHtf = false) CHoCH บน 1H ที่สวนเทรนด์ 1D
 *    กับที่ตามเทรนด์ 1D มีน้ำหนักไม่เท่ากันเลย แต่กฎนี้ปฏิบัติกับทั้งสองแบบเหมือนกัน
 *
 * ─────────────────── วัดจริงแล้วได้อะไร (train + validation) ───────────────────
 *
 * วิธีวัด: เปิดไม้สมมติทั้งสองฝั่งที่ทุกแท่งด้วยเรขาคณิต/ต้นทุนเดียวกับตัวรัน แล้วเทียบไม้ที่
 * "ถูกห้าม" กับ "ปล่อยผ่าน" · ประชากรอ้างอิง 1D: long +0.0344 R · short −0.0392 R
 *
 *   1D  ยิงวีโต้ bull 4.6% · bear 4.7% (ไม่มีทางยิงสองฝั่งพร้อมกัน — วัดได้ 0.0% ตามคาด)
 *       long : ห้าม 2,857 ไม้ +0.0168 R | ปล่อย 59,737 ไม้ +0.0352 R → ห้ามถูก (+0.018 R)
 *       short: ห้าม 2,943 ไม้ −0.0288 R | ปล่อย 59,651 ไม้ −0.0397 R → ห้ามผิด (−0.011 R)
 *   1H  ยิงวีโต้ bull 4.2% · bear 4.2%
 *       long : ห้าม 7,364 ไม้ −0.0676 R | ปล่อย 168,904 ไม้ −0.0867 R → ห้ามผิด (−0.019 R)
 *       short: ห้าม 7,364 ไม้ −0.1179 R | ปล่อย 168,904 ไม้ −0.1134 R → ห้ามถูก (+0.005 R)
 *
 * อ่านว่า: ผลกลับทิศกันระหว่างสองกรอบเวลา บน 1D การห้าม long หลังโครงสร้างขาขึ้นพังได้ผล
 * แต่บน 1H การห้าม long แบบเดียวกันกลับตัดไม้ที่ดีกว่าค่าเฉลี่ยทิ้ง เมื่อสัญญาณสองกรอบเวลา
 * ขัดกันเองด้วยขนาดผลระดับ 0.02 R บนไม้ไม่กี่พันไม้ คำอธิบายที่ประหยัดที่สุดคือ "ยังแยกจาก
 * ความบังเอิญไม่ออก" ไม่ใช่ "1D ใช้ได้ 1H ใช้ไม่ได้" · ตัวเลขนี้ยังไม่ได้แตะชุด test
 *
 * (เกร็ด: จำนวนไม้ที่ห้ามบน 1H เท่ากันเป๊ะทั้งสองฝั่ง (7,364) เป็นเรื่องบังเอิญล้วน — แยกราย
 * สินทรัพย์แล้วไม่เท่ากันสักตัว เช่น XAUUSD 342/279 · GBPJPY 628/753 บังเอิญบวกกันได้เท่ากัน)
 */

export const meta = {
  id: 'vetoes-choch-flip',
  name: 'วีโต้: โครงสร้างเพิ่งพลิก (CHoCH) ห้ามฝั่งเดิม',
  family: 'structure',
  needsHtf: false,
  params: {
    /** แท่งซ้าย/ขวาที่ใช้ยืนยัน pivot — pivot ล่าสุดที่ใช้ได้อยู่ที่ดัชนี t − pivotLookback */
    pivotLookback: 5,
    /** ย้อนหลังหา pivot ได้ไกลสุดกี่แท่ง */
    scanBars: 200,
    /** การทะลุจะนับว่า "เพิ่งเกิด" ก็ต่อเมื่อห่างจากแท่งปัจจุบันไม่เกินกี่แท่ง */
    freshBars: 10,
    /** ราคาปิดต้องเลยแนวไปอีกกี่เท่าของ ATR ถึงจะนับว่าทะลุ (กันไส้/เสียงรบกวน) */
    breakBufferAtr: 0.10,
    /** |ยอดล่าสุด − ก้นล่าสุด| ต้องใหญ่อย่างน้อยกี่เท่าของ ATR ถึงจะนับว่าเป็นโครงสร้าง */
    minLegAtr: 0.5,
  },
};

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

const NO_VETO = { bull: false, bear: false, veto: null, score: 0 };

/** ผู้เรียกต้องรับประกัน p − L >= 0 และ p + L <= t */
function isSwingHigh(bars, p, L) {
  const h = bars[p].high;
  if (!Number.isFinite(h)) return false;
  for (let j = p - L; j <= p + L; j++) {
    if (j === p) continue;
    const hj = bars[j].high;
    if (!Number.isFinite(hj)) return false;
    if (hj > h) return false;
  }
  return true;
}

function isSwingLow(bars, p, L) {
  const l = bars[p].low;
  if (!Number.isFinite(l)) return false;
  for (let j = p - L; j <= p + L; j++) {
    if (j === p) continue;
    const lj = bars[j].low;
    if (!Number.isFinite(lj)) return false;
    if (lj < l) return false;
  }
  return true;
}

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null|'bull'|'bear'|'both', score: number}}
 */
export function evaluate(ctx) {
  const p = meta.params;
  const { bars, t, ind } = ctx;
  const L = p.pivotLookback;

  const atr = ind.atr[t];
  if (!Number.isFinite(atr) || !(atr > 0)) return NO_VETO;

  const newest = t - L;
  const oldest = Math.max(L, newest - p.scanBars + 1);
  if (newest < oldest) return NO_VETO;

  // ── เก็บยอด/ก้นที่ยืนยันแล้ว สองตัวล่าสุดของแต่ละฝั่ง (ไล่จากใหม่ไปเก่า) ──
  const highs = []; // [{ idx, level }] เรียงจากใหม่ไปเก่า
  const lows = [];
  for (let q = newest; q >= oldest; q--) {
    if (highs.length < 2 && isSwingHigh(bars, q, L)) highs.push({ idx: q, level: bars[q].high });
    if (lows.length < 2 && isSwingLow(bars, q, L)) lows.push({ idx: q, level: bars[q].low });
    if (highs.length >= 2 && lows.length >= 2) break;
  }
  if (highs.length < 2 || lows.length < 2) return NO_VETO;

  const sh1 = highs[0];
  const sh2 = highs[1];
  const sl1 = lows[0];
  const sl2 = lows[1];
  if (!Number.isFinite(sh1.level) || !Number.isFinite(sh2.level)) return NO_VETO;
  if (!Number.isFinite(sl1.level) || !Number.isFinite(sl2.level)) return NO_VETO;

  // ขาต้องใหญ่พอ ไม่งั้นเป็นการแกว่งในกรอบแคบ ไม่ใช่โครงสร้าง
  if (!(Math.abs(sh1.level - sl1.level) >= p.minLegAtr * atr)) return NO_VETO;

  const uptrend = sh1.level > sh2.level && sl1.level > sl2.level;
  const downtrend = sh1.level < sh2.level && sl1.level < sl2.level;
  if (!uptrend && !downtrend) return NO_VETO;

  const buffer = p.breakBufferAtr * atr;

  if (uptrend) {
    // ขาขึ้นพัง = ปิดต่ำกว่าก้นล่าสุด · เริ่มนับจากแท่งที่ก้นนั้นถูกยืนยัน (sl1.idx + L)
    const ref = sl1.level - buffer;
    const from = sl1.idx + L;
    for (let b = from; b <= t; b++) {
      const c = bars[b].close;
      if (!Number.isFinite(c)) continue;
      if (c < ref) {
        const age = t - b;
        if (age >= p.freshBars) return NO_VETO; // พลิกไปนานแล้ว ไม่ใช่ "เพิ่ง"
        return { bull: false, bear: false, veto: 'bull', score: clamp01(1 - age / p.freshBars) };
      }
    }
    return NO_VETO;
  }

  // ขาลงพัง = ปิดสูงกว่ายอดล่าสุด
  const ref = sh1.level + buffer;
  const from = sh1.idx + L;
  for (let b = from; b <= t; b++) {
    const c = bars[b].close;
    if (!Number.isFinite(c)) continue;
    if (c > ref) {
      const age = t - b;
      if (age >= p.freshBars) return NO_VETO;
      return { bull: false, bear: false, veto: 'bear', score: clamp01(1 - age / p.freshBars) };
    }
  }
  return NO_VETO;
}
