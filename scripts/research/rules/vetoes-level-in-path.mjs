/**
 * วีโต้ #3 — มีแนวต้าน/แนวรับขวางอยู่ระหว่างราคาปัจจุบันกับเป้า
 *
 * ─────────────────────────── กฎนี้มาจากแนวคิดอะไร ───────────────────────────
 *
 * ระบบนี้ออกไม้ด้วยเรขาคณิตตายตัว: SL = 1.5 × ATR และ TP = 2 เท่าของระยะ SL แปลว่าทุกไม้
 * ต้องการให้ราคาเดินไป 3 × ATR ก่อนจะเจอ SL ที่ 1.5 × ATR การจะได้ RR 2:1 จริงจึงไม่ได้ขึ้นกับ
 * "ทิศถูกไหม" อย่างเดียว แต่ขึ้นกับว่า "ทางเดินโล่งหรือเปล่า" ด้วย
 *
 * ถ้าระหว่างราคาปัจจุบันกับเป้ามียอดเก่าที่คนเคยขายค้างไว้อยู่ตรงกลาง ไม้นั้นมีโอกาสสูงที่จะ
 * วิ่งไปครึ่งทาง ชนแนว แล้วถอยกลับมากินSL — ซึ่งในบัญชี R จะบันทึกเป็น −1 เต็ม ๆ ทั้งที่
 * "ทิศถูกแล้ว" การกรองตรงนี้จึงไม่ใช่การหาไม้ที่ดีกว่า แต่เป็นการเลิกจ่ายค่าไม้ที่ถูกทิศแต่ไปไม่ถึง
 *
 * ─────────────────────────── ทำไมเกณฑ์ถึงเป็นแบบนี้ ───────────────────────────
 *
 * · เป้าคำนวณจาก slAtrMult × rrTarget × ATR ให้ตรงกับกติกาเดินไม้ของ rule-lab.mjs เป๊ะ ๆ
 *   (SL_ATR_MULT = 1.5, RR_TARGET = 2.0) ประกาศซ้ำไว้ใน params เพราะไฟล์กฎเข้าถึงค่าคงที่
 *   ของตัวรันไม่ได้ — ถ้าวันไหนตัวรันเปลี่ยนเรขาคณิต ต้องมาแก้ที่นี่ด้วย ไม่งั้นกฎจะวัด
 *   "ทางเดินไปยังเป้าที่ไม่มีอยู่จริง" (ข้อจำกัดข้อ 3)
 *
 * · แนวต้าน/แนวรับ = จุดกลับตัว (pivot) ที่ **ยืนยันแล้ว** เท่านั้น: high[p] ต้องสูงสุดในหน้าต่าง
 *   [p − L, p + L] ซึ่งแปลว่า pivot ที่ใช้ได้ล่าสุดอยู่ที่ดัชนี t − L เสมอ ไม่มีทางใช้ pivot ที่ยัง
 *   ไม่มีแท่งขวาครบ — นี่คือจุดที่กฎแนว price-action ส่วนใหญ่แอบมองอนาคตโดยไม่รู้ตัว
 *
 * · "ขวางอยู่" นิยามเป็นสัดส่วนของระยะทางไปยังเป้า ไม่ใช่ระยะเป็นจุด: แนวต้องอยู่ในช่วง
 *   [pathFracMin, pathFracMax] ของทาง เพราะ
 *   - แนวที่ติดราคาปัจจุบันมาก ๆ (< pathFracMin) ราคามันทะลุ/ยืนอยู่แถวนั้นแล้ว ไม่ใช่กำแพงข้างหน้า
 *   - แนวที่เกือบถึงเป้า (> pathFracMax) กว่าจะถึงตรงนั้นไม้ก็แทบได้กำไรเต็มแล้ว
 *   ใช้สัดส่วนทำให้เกณฑ์เดียวใช้ได้กับทั้ง 13 สินทรัพย์ที่สเกลราคาต่างกันสิบเท่า
 *
 * · แนวมี "ความหนา" levelTolAtr เพราะแนวต้านในโลกจริงไม่ใช่เส้นบาง ๆ ที่ราคาเดียว
 *   สำหรับฝั่งซื้อจึงนับขอบล่างของโซน (high − tol) เป็นจุดที่เริ่มโดนกด — ฝั่งขายกลับด้าน
 *
 * · แนวต้องยัง "ไม่ถูกทะลุ" (requireIntact): ต้องไม่มีราคาปิดไหนเลยตั้งแต่วันที่ pivot นั้น
 *   ถูกยืนยัน (q + L) จนถึงแท่งปัจจุบัน ที่ปิดเลยยอดนั้นไปได้ ยอดที่ราคาเคยปิดผ่านไปแล้ว
 *   ไม่ใช่แนวต้านอีกต่อไป มันคือแนวรับที่ราคาเพิ่งกลับมาหา การนับมันเป็นกำแพงคือการอ่านผิดทิศ
 *   — ข้อนี้ไม่ใช่การจูนตัวเลข แต่เป็นการแก้นิยามที่หลวมเกินไป วัดผลของมันไว้ท้ายไฟล์
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. นับ pivot ทุกอันเท่ากันหมด ไม่แยกว่า "ยอดที่ถูกทดสอบ 4 ครั้ง" ต่างจาก "ยอดที่โผล่มาครั้งเดียว"
 *    ในความจริงสองอันนี้แข็งไม่เท่ากันเลย กฎนี้จึงวีโต้เกินจำเป็นในตลาดที่มีสัญญาณรบกวนเยอะ
 * 2. ไม่มีแนวจากแหล่งอื่น: ไม่นับเลขกลม ไม่นับ MA ไม่นับแนวของ TF ใหญ่กว่า (needsHtf = false)
 *    ทั้งที่ในทางปฏิบัติแนวของ 1D กดไม้ 1H ได้จริง — ตัดออกเพื่อให้กฎนี้วัดแนวคิดเดียว
 * 3. ค่า slAtrMult/rrTarget ถูก "คัดลอก" มาจากตัวรัน ไม่ได้อ่านมาจากตัวรันจริง ๆ ถ้าสองที่
 *    ไม่ตรงกันเมื่อไร กฎนี้จะยังทำงานเงียบ ๆ ต่อไปโดยวัดผิดเป้า — เป็นหนี้ทางเทคนิคที่รู้ตัว
 * 4. ยิ่ง scanBars ยาว ยิ่งเจอแนวเยอะ ยิ่งวีโต้ถี่ ค่า 150 เป็นการเลือกโดยดูจากปริมาณข้อมูลที่มี
 *    (1D มีราว 4,600 แท่งต่อสินทรัพย์ · 1H ราว 13,500) ไม่ได้มาจากการกวาดหาค่าที่ดีที่สุด
 *    — ถ้าจะกวาดต้องกวาดบน train แล้วยืนยันบน validation ซึ่งยังไม่ได้ทำในไฟล์นี้
 * 5. **ความถี่สูงเกินจนเกือบไม่ใช่ตัวกรอง** — วัดแล้วยิงวีโต้ราว 52% ของแท่งในแต่ละฝั่ง
 *    วีโต้ที่ห้ามครึ่งหนึ่งของเวลาให้ข้อมูลน้อยกว่าที่หน้าตามันดู สาเหตุเชิงโครงสร้าง: ทางไปเป้า
 *    กว้าง 2.25 ATR (จาก 0.15–0.90 ของ 3 ATR) และใน 150 แท่งมี pivot ยืนยันแล้วราว 20 จุด
 *    โอกาสที่จะมีสักจุดตกในแถบนั้นจึงสูงมากโดยธรรมชาติ ไม่ใช่บั๊ก
 *
 * ─────────────────── วัดจริงแล้วได้อะไร (train + validation) ───────────────────
 *
 * วิธีวัด: เปิดไม้สมมติทั้งสองฝั่งที่ทุกแท่งด้วยเรขาคณิต/ต้นทุนเดียวกับตัวรัน แล้วเทียบไม้ที่
 * "ถูกห้าม" กับ "ปล่อยผ่าน" · ประชากรอ้างอิง 1D: long +0.0344 R · short −0.0392 R
 *
 *   1D  ยิงวีโต้ bull 52.3% · bear 52.0%
 *       long : ห้าม 32,711 ไม้ +0.0202 R | ปล่อย 29,883 ไม้ +0.0498 R → ห้ามถูก (+0.030 R)
 *       short: ห้าม 32,566 ไม้ −0.0141 R | ปล่อย 30,028 ไม้ −0.0665 R → ห้ามผิด (−0.052 R)
 *   1H  ยิงวีโต้ bull 52.3% · bear 51.8% — long +0.003 R · short −0.009 R (ใกล้ศูนย์ทั้งคู่)
 *
 * เกณฑ์ requireIntact เป็นการแก้นิยาม ไม่ใช่การจูน: ก่อนใส่ อัตรายิงอยู่ที่ 71% ต่อฝั่ง
 * และผลต่อฝั่ง long บน 1D อยู่ที่ +0.035 R — ใส่แล้วยิงถี่น้อยลงมาก ผลเกือบเท่าเดิม
 *
 * อ่านว่า: สิ่งที่กฎนี้วัดได้จริงน่าจะไม่ใช่ "กำแพงขวางทาง" แต่เป็น "ราคาอยู่ตรงไหนของกรอบ"
 * เพราะผลออกมาเป็นภาพสะท้อนซ้าย-ขวาพอดี (ห้าม long ตอนยังมียอดเก่าอยู่ข้างบน = ดี ·
 * ห้าม short ตอนยังมีก้นเก่าอยู่ข้างล่าง = แย่) ซึ่งเป็นลายเซ็นของโมเมนตัมขาขึ้นในชุดข้อมูลนี้
 * มากกว่าจะเป็นเรื่องแนวรับแนวต้าน ก่อนเอาไปใช้ควรเพิ่มเกณฑ์ความแข็งของแนว (จำนวนครั้งที่
 * ถูกทดสอบ) แล้ววัดใหม่ ไม่ใช่เอาไปใช้ทั้งอย่างนี้ · ตัวเลขนี้ยังไม่ได้แตะชุด test
 */

export const meta = {
  id: 'vetoes-level-in-path',
  name: 'วีโต้: มีแนวขวางระหว่างราคากับเป้า',
  family: 'structure',
  needsHtf: false,
  params: {
    /** จำนวนแท่งซ้าย/ขวาที่ใช้ยืนยัน pivot — pivot ล่าสุดที่ใช้ได้จึงอยู่ที่ดัชนี t − pivotLookback */
    pivotLookback: 5,
    /** ย้อนหลังหา pivot ได้ไกลสุดกี่แท่ง */
    scanBars: 150,
    /** ลอกจากกติกาเดินไม้ของ rule-lab.mjs — SL_ATR_MULT และ RR_TARGET */
    slAtrMult: 1.5,
    rrTarget: 2.0,
    /** แนวต้องอยู่ในช่วงกี่ % ของระยะทางไปยังเป้า ถึงจะเรียกว่า "ขวาง" */
    pathFracMin: 0.15,
    pathFracMax: 0.90,
    /** ความหนาของโซนแนว คิดเป็นเท่าของ ATR */
    levelTolAtr: 0.15,
    /** นับเฉพาะแนวที่ยังไม่มีราคาปิดทะลุผ่านไป นับตั้งแต่แท่งที่ pivot ถูกยืนยัน */
    requireIntact: true,
  },
};

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

const NO_VETO = { bull: false, bear: false, veto: null, score: 0 };

/**
 * p เป็นยอดที่ยืนยันแล้วหรือไม่ — high[p] ต้องไม่ต่ำกว่าทุกแท่งในหน้าต่าง [p−L, p+L]
 * ผู้เรียกต้องรับประกันว่า p − L >= 0 และ p + L <= t (ไม่งั้นจะอ่านนอกชุด/อ่านอนาคต)
 */
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

/** ก้นที่ยืนยันแล้ว — เงื่อนไขเดียวกับ isSwingHigh แต่กลับด้าน */
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

  const close = bars[t].close;
  const atr = ind.atr[t];
  if (!Number.isFinite(close)) return NO_VETO;
  if (!Number.isFinite(atr) || !(atr > 0)) return NO_VETO;

  const dist = p.slAtrMult * p.rrTarget * atr; // ระยะจากราคาปิดถึงเป้า
  if (!(dist > 0)) return NO_VETO;
  const tol = p.levelTolAtr * atr;

  // ขอบเขตการค้นหา: ตัวสุดท้ายที่ยืนยันได้คือ t − L · ตัวแรกสุดต้องมีแท่งซ้ายครบ L แท่ง
  const newest = t - L;
  const oldest = Math.max(L, newest - p.scanBars + 1);
  if (newest < oldest) return NO_VETO;

  // ระยะของแนวที่ "ขวางที่สุด" (ใกล้ราคาที่สุด) ของแต่ละฝั่ง เก็บเป็นสัดส่วนของทาง
  let bullFrac = Infinity;
  let bearFrac = Infinity;

  // ค่าสุดขั้วของราคาปิดตั้งแต่แท่งที่ pivot ตัวที่กำลังพิจารณาถูกยืนยัน จนถึงแท่งปัจจุบัน
  // ไล่ q จากใหม่ไปเก่า หน้าต่างจึงโตทีละแท่ง อัปเดตแบบ O(1) ไม่ต้องสแกนซ้ำ
  let maxCloseSince = -Infinity;
  let minCloseSince = Infinity;

  for (let q = newest; q >= oldest; q--) {
    const confirmIdx = q + L; // แท่งที่ pivot นี้ถูกยืนยัน (<= t เสมอ)
    const cc = bars[confirmIdx].close;
    if (Number.isFinite(cc)) {
      if (cc > maxCloseSince) maxCloseSince = cc;
      if (cc < minCloseSince) minCloseSince = cc;
    } else {
      // ปิดอ่านไม่ได้ = ไม่รู้ว่าทะลุไปแล้วหรือยัง → ถือว่า "ไม่ผ่าน" คือไม่นับเป็นแนวอีกต่อไป
      maxCloseSince = Infinity;
      minCloseSince = -Infinity;
    }

    // ── ฝั่งซื้อ: หายอด (แนวต้าน) เหนือราคา ──
    const hi = bars[q].high;
    if (Number.isFinite(hi)) {
      const level = hi - tol; // ขอบล่างของโซนแนวต้าน = จุดที่เริ่มโดนกด
      const frac = (level - close) / dist;
      // เช็กช่วงก่อนค่อยพิสูจน์ pivot เพราะการเช็กช่วงถูกกว่ามาก และตัดผู้สมัครทิ้งได้เกือบหมด
      if (frac >= p.pathFracMin && frac <= p.pathFracMax && frac < bullFrac) {
        const intact = !p.requireIntact || maxCloseSince <= hi;
        if (intact && isSwingHigh(bars, q, L)) bullFrac = frac;
      }
    }

    // ── ฝั่งขาย: หาก้น (แนวรับ) ใต้ราคา ──
    const lo = bars[q].low;
    if (Number.isFinite(lo)) {
      const level = lo + tol;
      const frac = (close - level) / dist;
      if (frac >= p.pathFracMin && frac <= p.pathFracMax && frac < bearFrac) {
        const intact = !p.requireIntact || minCloseSince >= lo;
        if (intact && isSwingLow(bars, q, L)) bearFrac = frac;
      }
    }
  }

  const vetoBull = Number.isFinite(bullFrac);
  const vetoBear = Number.isFinite(bearFrac);
  if (!vetoBull && !vetoBear) return NO_VETO;

  // ความแรง = แนวอยู่ใกล้ราคาแค่ไหน (ยิ่งใกล้ยิ่งขวางเร็ว ยิ่งอันตราย)
  // frac 0.15 → 0.85 · frac 0.90 → 0.10 · ถ้าวีโต้ทั้งสองฝั่งเอาฝั่งที่ใกล้กว่า
  const nearest = Math.min(vetoBull ? bullFrac : Infinity, vetoBear ? bearFrac : Infinity);
  const score = clamp01(1 - nearest);

  const veto = vetoBull && vetoBear ? 'both' : (vetoBull ? 'bull' : 'bear');
  return { bull: false, bear: false, veto, score };
}
