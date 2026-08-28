/**
 * Causal Swing Pivots + Structure State (HH/HL/LH/LL)
 *
 * ─────────────────────────── กฎนี้มาจากแนวคิดอะไร ───────────────────────────
 *
 * ก่อนจะพูดเรื่อง BOS หรือ sweep ได้ ต้องมี "โครงสร้าง" ให้พูดถึงก่อน และโครงสร้าง
 * ที่ใช้ได้จริงต้องมาจาก pivot ที่ยืนยันแล้วเท่านั้น — pivot ที่ยังไม่ยืนยันคือความเห็น
 * ไม่ใช่ข้อมูล ไฟล์นี้จึงเป็น "กฎฐาน" ที่ตอบคำถามเดียว: ถ้าเราติดป้าย HH/HL/LH/LL
 * ให้ pivot ที่ยืนยันแล้วล้วน ๆ แล้วเข้าไม้ตอนที่ป้ายใหม่เพิ่งถูกติด มันได้ผลไหม
 *
 * ─────────────────────────── ทำไมเกณฑ์ถึงเป็นแบบนี้ ───────────────────────────
 *
 * · pivot ยืนยันเมื่อมีแท่งขนาบขวาครบ lookback แท่ง → pivot ที่ใหม่สุดที่ใช้ได้อยู่ที่
 *   index <= t − lookback เสมอ นี่คือราคาที่ต้องจ่ายเพื่อไม่มองอนาคต ไม่ใช่ข้อบกพร่อง
 * · "สูงกว่า/ต่ำกว่า" ต้องวัดด้วยระยะที่มีความหมาย ไม่ใช่ต่างกัน 1 pip แล้วเรียก HH
 *   จึงบังคับให้ห่างกันอย่างน้อย minStepAtr × ATR — ระยะที่เล็กกว่านั้นคือ noise ของสเปรด
 * · ยิงเฉพาะตอน pivot ใหม่ "เพิ่งยืนยัน" (อายุ <= maxAgeBars แท่ง) ไม่ใช่ทุกแท่งที่
 *   โครงสร้างยังเป็นขาขึ้น เพราะถ้ายิงทุกแท่ง ตัวเลขที่ได้จะกลายเป็น "ค่าเฉลี่ยของ
 *   การถือ long ตลอดเทรนด์" ซึ่งวัดตลาด ไม่ได้วัดกฎ
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. ช้าโดยธรรมชาติ — สัญญาณมาช้ากว่าจุดกลับตัวจริงอย่างน้อย lookback แท่งเสมอ
 *    ในตลาดที่วิ่งแรง ราคาไปไกลแล้วกว่าที่ป้ายจะติด
 * 2. lookback เดียวใช้กับทุกสินทรัพย์ทุกกรอบเวลา ทั้งที่ความถี่ของ swing ต่างกันมาก
 *    (XAGUSD กับ EURGBP ไม่ได้แกว่งเป็นจังหวะเดียวกัน) ยังไม่ได้ปรับตามความผันผวน
 * 3. ป้าย HH/HL ดูแค่ pivot ล่าสุดกับตัวก่อนหน้า — โครงสร้างที่ซ้อนกันหลายชั้น
 *    (swing ใหญ่ขาลง แต่ swing เล็กขาขึ้น) กฎนี้เห็นแค่ชั้นเดียวตาม lookback ที่ตั้งไว้
 * 4. ตอนตลาด sideways pivot จะสลับ HH/LH ไปมาถี่ ๆ แล้วกฎจะยิงสองทางสลับกัน
 *    ตัวกรอง minStepAtr ช่วยได้บ้างแต่ไม่หมด
 */

export const meta = {
  id: 'structure-bos-swing-pivot-state',
  name: 'โครงสร้าง swing แบบยืนยันแล้ว (HH/HL/LH/LL)',
  family: 'structure',
  needsHtf: false,
  params: {
    /** จำนวนแท่งที่ต้องขนาบสองข้าง pivot — ขวาครบเมื่อไรถึงเรียกว่ายืนยัน */
    pivotLookback: 3,
    /** ย้อนหลังหา pivot ไกลสุดกี่แท่ง — กันไม่ให้ต้นทุนต่อแท่งโตตามความยาวชุดข้อมูล */
    scanWindow: 240,
    /** ต้องการ pivot สูง/ต่ำ อย่างละกี่ตัวถึงจะตัดสินได้ */
    minHighs: 2,
    minLows: 2,
    /** เก็บ pivot มากสุดกี่ตัวต่อฝั่ง (ใช้คิดคะแนนย้อนหลัง) */
    maxPivots: 4,
    /** ระยะขั้นต่ำที่ถือว่า "สูงกว่า/ต่ำกว่า" จริง คิดเป็นเท่าของ ATR */
    minStepAtr: 0.25,
    /** อายุสูงสุดของ pivot ที่ใหม่สุด นับจากแท่งที่มันยืนยัน (0 = ยิงเฉพาะแท่งยืนยัน) */
    maxAgeBars: 2,
    /** คิดคะแนนจากคู่ pivot ย้อนหลังกี่คู่ */
    scoreDepth: 3,
  },
};

/**
 * หา pivot ที่ "ยืนยันแล้ว" ไล่จากใหม่ไปเก่า
 *
 * เงื่อนไขยืนยัน: i + lookback <= t เท่านั้น — ลูปจึงเริ่มที่ t − lookback ไม่ใช่ t
 * ฝั่งซ้ายใช้ > เข้ม ฝั่งขวาใช้ >= เพื่อให้ราคาที่เท่ากันติดกันเลือก pivot ได้ตัวเดียว
 * (ถ้าใช้ >= ทั้งสองฝั่ง แท่งราคาเท่ากันสองแท่งจะกลายเป็น pivot ทั้งคู่)
 */
function findConfirmedPivots(bars, t, lookback, scanWindow, maxPivots) {
  const highs = [];
  const lows = [];
  const newest = t - lookback;
  const oldest = Math.max(lookback, t - scanWindow);

  for (let i = newest; i >= oldest; i--) {
    if (highs.length >= maxPivots && lows.length >= maxPivots) break;
    const c = bars[i];
    if (!Number.isFinite(c.high) || !Number.isFinite(c.low)) continue;

    if (highs.length < maxPivots) {
      let ok = true;
      for (let j = 1; j <= lookback; j++) {
        const l = bars[i - j];
        const r = bars[i + j];
        if (!Number.isFinite(l.high) || !Number.isFinite(r.high)) { ok = false; break; }
        if (!(c.high > l.high) || !(c.high >= r.high)) { ok = false; break; }
      }
      if (ok) highs.push({ idx: i, price: c.high });
    }

    if (lows.length < maxPivots) {
      let ok = true;
      for (let j = 1; j <= lookback; j++) {
        const l = bars[i - j];
        const r = bars[i + j];
        if (!Number.isFinite(l.low) || !Number.isFinite(r.low)) { ok = false; break; }
        if (!(c.low < l.low) || !(c.low <= r.low)) { ok = false; break; }
      }
      if (ok) lows.push({ idx: i, price: c.low });
    }
  }
  return { highs, lows }; // ใหม่สุดอยู่ index 0
}

const NO_SIGNAL = { bull: false, bear: false, veto: null, score: 0 };

export function evaluate(ctx) {
  const p = meta.params;
  const { bars, t } = ctx;
  const atr = ctx.ind.atr[t];

  // NaN ตัดจบก่อนทุกครั้ง — ถ้าปล่อยให้ NaN ไหลเข้าไปเทียบ ผลลัพธ์จะเป็น false
  // โดยบังเอิญในบางเงื่อนไข แล้วพังเงียบ ๆ ทันทีที่มีใครกลับเครื่องหมาย
  if (!Number.isFinite(atr) || !(atr > 0)) return NO_SIGNAL;
  if (t - p.pivotLookback < p.pivotLookback) return NO_SIGNAL;

  const { highs, lows } = findConfirmedPivots(
    bars, t, p.pivotLookback, p.scanWindow, p.maxPivots);
  if (highs.length < p.minHighs || lows.length < p.minLows) return NO_SIGNAL;

  const step = p.minStepAtr * atr;

  // อายุของโครงสร้าง = จำนวนแท่งนับจากแท่งที่ pivot ใหม่สุด "ยืนยัน" (idx + lookback)
  const newestIdx = Math.max(highs[0].idx, lows[0].idx);
  const age = t - (newestIdx + p.pivotLookback);
  if (!(age >= 0 && age <= p.maxAgeBars)) return NO_SIGNAL;

  // ป้ายของคู่ล่าสุด — ต้องห่างกันเกิน step ถึงจะนับ ไม่งั้นถือว่าไม่มีป้าย
  const highDiff = highs[0].price - highs[1].price;
  const lowDiff = lows[0].price - lows[1].price;
  const isHH = highDiff >= step;
  const isLH = -highDiff >= step;
  const isHL = lowDiff >= step;
  const isLL = -lowDiff >= step;

  const bull = isHH && isHL;
  const bear = isLH && isLL;
  if (!bull && !bear) return NO_SIGNAL;

  // คะแนน = สัดส่วนคู่ pivot ย้อนหลังที่ยังเห็นตรงกับทิศทางนี้ (รวมคู่ล่าสุดด้วย)
  // กฎที่โครงสร้างต่อเนื่องมาหลายขาควรได้คะแนนสูงกว่ากฎที่เพิ่งพลิกมาขาเดียว
  const depth = Math.min(p.scoreDepth, highs.length - 1, lows.length - 1);
  let agree = 0;
  let total = 0;
  for (let k = 0; k < depth; k++) {
    const dh = highs[k].price - highs[k + 1].price;
    const dl = lows[k].price - lows[k + 1].price;
    total += 2;
    if (bull) {
      if (dh >= step) agree++;
      if (dl >= step) agree++;
    } else {
      if (-dh >= step) agree++;
      if (-dl >= step) agree++;
    }
  }
  const score = total > 0 ? agree / total : 0;

  return { bull, bear, veto: null, score };
}
