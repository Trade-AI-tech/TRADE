/**
 * Decayed Vote — confluence ในหน้าต่างเวลา โดยเงื่อนไขที่เพิ่งเกิดมีน้ำหนักกว่าที่เกิดนานแล้ว
 *
 * ─────────────────────────────── แนวคิดที่มา ───────────────────────────────
 *
 * การนับ confluence แบบ "ต้องเกิดพร้อมกันในแท่งเดียว" มีปัญหาที่รู้กันดีสองข้อ:
 * (ก) มันแทบไม่เคยเกิด เพราะอินดิเคเตอร์คนละตัวมีความหน่วงคนละแบบ MACD ตัดขึ้นวันนี้
 *     Stochastic อาจตัดไปแล้วเมื่อสามแท่งก่อน การบังคับให้ตรงแท่งคือการทิ้งกรณีที่ดีทิ้งไปเฉย ๆ
 * (ข) พอแก้ด้วยการเปิดหน้าต่าง "เกิดภายใน N แท่ง" ก็เจอปัญหาใหม่ทันที คือเหตุการณ์ที่เกิด
 *     เมื่อ 12 แท่งก่อนถูกนับเท่ากับเหตุการณ์ที่เพิ่งเกิดเมื่อกี้ ทั้งที่หลักฐานเก่ากว่าย่อมเก่ากว่า
 *
 * กฎนี้แก้ (ข) ด้วยการถ่วงน้ำหนักตามอายุแบบเรขาคณิต: น้ำหนัก = decayBase^(t − i)
 * เหตุการณ์ที่แท่งปัจจุบันได้ 1.0 เต็ม · ถอยไปหนึ่งแท่งได้ 0.85 · ถอยไปห้าแท่งเหลือ 0.44
 * ผลคือ "หน้าต่าง" ไม่มีขอบคมอีกต่อไป หลักฐานค่อย ๆ จางแทนที่จะหายวับตอนพ้นแท่งที่ N
 *
 * นับเฉพาะ "เหตุการณ์" (การตัดกัน / การเบรก) ไม่นับ "สถานะ" โดยตั้งใจ เพราะสถานะเช่น
 * rsi > 50 ค้างอยู่ได้เป็นร้อยแท่ง การถ่วงน้ำหนักตามอายุจึงไม่มีความหมายกับมัน
 * ส่วนการตัดกันเกิดที่แท่งใดแท่งหนึ่งชัดเจน "อายุ" จึงเป็นตัวเลขที่ตีความได้จริง
 *
 * ─────────────────────────────── ทำไมเกณฑ์เป็นแบบนี้ ───────────────────────────────
 *
 * · decayBase = 0.85 กับ windowBars = 12 — ที่ขอบหน้าต่างน้ำหนักเหลือ 0.85^11 ≈ 0.17
 *   ซึ่งเล็กพอที่การตัดหน้าต่างทิ้งตรงนั้นจะไม่ทำให้ผลกระโดด (ถ้าใช้ 0.97 การตัดที่ 12
 *   จะยังตัดของที่มีน้ำหนัก 0.7 ทิ้ง ซึ่งกลายเป็นขอบคมแบบที่ตั้งใจจะเลี่ยงตั้งแต่แรก)
 * · minWeight = 1.6 จากคะแนนเต็ม 5 — ต้องมีอย่างน้อยสองเหตุการณ์ที่ยังใหม่ หรือสามเหตุการณ์
 *   ที่เริ่มเก่า เหตุการณ์เดียวไม่มีทางถึงเส้น (สูงสุดของเหตุการณ์เดียวคือ 1.0)
 * · minNetWeight = 1.0 — ในหน้าต่างเดียวกันมักมีเหตุการณ์ฝั่งตรงข้ามปนอยู่เสมอ
 *   การหักลบก่อนแล้วค่อยเทียบเส้น ทำให้ช่วง "ตัดไปตัดมา" ไม่ถูกอ่านเป็นสัญญาณแรง
 *
 * ─────────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────────
 *
 * 1. decayBase เป็นตัวเลขที่ตั้งเอง ไม่ได้ประมาณจากข้อมูลว่าหลักฐานหมดอายุเร็วแค่ไหนจริง ๆ
 *    และค่าเดียวถูกใช้กับทั้ง 1D และ 1H ทั้งที่ "หนึ่งแท่ง" ของสองกรอบเวลาไม่เท่ากันเลย
 * 2. นับได้แค่ "เหตุการณ์ล่าสุดของแต่ละชนิด" ชนิดละหนึ่งครั้ง — ถ้า MACD ตัดขึ้นสองรอบ
 *    ในหน้าต่างเดียว รอบเก่าถูกทิ้ง เจตนาคือกันไม่ให้ช่วงตลาดออกข้าง (ที่ตัดกันถี่ ๆ)
 *    สะสมน้ำหนักจนดูเหมือนหลักฐานแน่น แต่ผลข้างเคียงคือมันมองไม่เห็นความถี่ของการตัด
 * 3. เหตุการณ์ทั้งห้ายังสัมพันธ์กันสูง (MACD/Stochastic/RSI ล้วนอ่านราคาปิดชุดเดียวกัน)
 *    น้ำหนักรวม 3.0 จึงไม่ได้แปลว่ามีหลักฐานอิสระสามชิ้น
 * 4. เป็นกฎแบบสถานะโดยพฤตินัย — หลังเหตุการณ์กลุ่มหนึ่งเกิด คะแนนจะยืนเหนือเส้นได้
 *    ติดกันหลายแท่งจนกว่าน้ำหนักจะจางพอ ไม้ที่ได้จึงซ้อนทับกัน (แต่ซ้อนน้อยกว่ากฎสถานะแท้ ๆ
 *    เพราะการจางบังคับให้สัญญาณดับเองภายในไม่กี่แท่ง)
 */

export const meta = {
  id: 'confluence-core-decayed-vote',
  name: 'โหวตถ่วงน้ำหนักตามอายุ: เหตุการณ์ใหม่หนักกว่าเหตุการณ์เก่า',
  family: 'confluence',
  needsHtf: false,
  params: {
    /** ย้อนหลังกี่แท่งถึงจะเลิกนับ (อายุ 0 = แท่งปัจจุบัน) */
    windowBars: 12,
    /** ฐานของการจาง — น้ำหนัก = decayBase^อายุ */
    decayBase: 0.85,
    /** น้ำหนักรวมฝั่งเดียวขั้นต่ำ (คะแนนเต็ม = eventCount) */
    minWeight: 1.6,
    /** ส่วนต่างน้ำหนักสองฝั่งขั้นต่ำ */
    minNetWeight: 1.0,
    /** เหตุการณ์เบรก: เทียบกับ high/low สูงสุด-ต่ำสุดของกี่แท่งก่อนหน้า */
    donchianLookback: 20,
    /** เส้นกลางของ RSI ที่ใช้เป็นเหตุการณ์ตัด */
    rsiMid: 50,
    /** จำนวนชนิดเหตุการณ์ — ใช้เป็นตัวหารของ score */
    eventCount: 5,
  },
};

/** ตัดขึ้น/ตัดลงของสองเส้นที่ดัชนี i — ต้องการค่าที่ i และ i−1 ครบทั้งสี่ตัว */
function crossVote(a, b, i) {
  if (i < 1) return 0;
  const a1 = a[i];
  const b1 = b[i];
  const a0 = a[i - 1];
  const b0 = b[i - 1];
  if (![a1, b1, a0, b0].every(Number.isFinite)) return 0;
  if (a1 > b1 && a0 <= b0) return 1;
  if (a1 < b1 && a0 >= b0) return -1;
  return 0;
}

/** ตัดเส้นคงที่ (ใช้กับ RSI เทียบ 50) */
function crossLevelVote(series, level, i) {
  if (i < 1) return 0;
  const v1 = series[i];
  const v0 = series[i - 1];
  if (!Number.isFinite(v1) || !Number.isFinite(v0)) return 0;
  if (v1 > level && v0 <= level) return 1;
  if (v1 < level && v0 >= level) return -1;
  return 0;
}

/** ราคาปิดทะลุกรอบ high/low ของ lb แท่งก่อนหน้า (ไม่รวมแท่ง i เอง) */
function breakoutVote(bars, i, lb) {
  const from = i - lb;
  if (from < 0) return 0;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = from; j < i; j++) {
    const h = bars[j].high;
    const l = bars[j].low;
    if (!Number.isFinite(h) || !Number.isFinite(l)) return 0;
    if (h > hi) hi = h;
    if (l < lo) lo = l;
  }
  const c = bars[i].close;
  if (!Number.isFinite(c) || !Number.isFinite(hi) || !Number.isFinite(lo)) return 0;
  if (c > hi) return 1;
  if (c < lo) return -1;
  return 0;
}

export function evaluate(ctx) {
  const p = meta.params;
  const { bars, t, ind } = ctx;

  // อายุของ "เหตุการณ์ล่าสุด" ของแต่ละชนิด แยกฝั่ง — −1 คือยังไม่เจอในหน้าต่างนี้
  const bullAge = new Array(p.eventCount).fill(-1);
  const bearAge = new Array(p.eventCount).fill(-1);

  for (let age = 0; age < p.windowBars; age++) {
    const i = t - age;
    if (i < 1) break; // ทุกเหตุการณ์ต้องใช้แท่ง i−1 ด้วย

    const done = (e) => bullAge[e] >= 0 && bearAge[e] >= 0;
    const record = (e, v) => {
      if (v > 0 && bullAge[e] < 0) bullAge[e] = age;
      else if (v < 0 && bearAge[e] < 0) bearAge[e] = age;
    };

    if (!done(0)) record(0, crossVote(ind.macd.macdLine, ind.macd.signalLine, i));
    if (!done(1)) record(1, crossVote(ind.stoch.k, ind.stoch.d, i));
    if (!done(2)) {
      // ราคาปิดตัดเส้น 50 — สร้าง "เส้นราคา" ชั่วคราวไม่ได้ จึงเทียบตรง ๆ ทีละแท่ง
      const c1 = bars[i].close;
      const c0 = bars[i - 1].close;
      const m1 = ind.ma50[i];
      const m0 = ind.ma50[i - 1];
      let v = 0;
      if ([c1, c0, m1, m0].every(Number.isFinite)) {
        if (c1 > m1 && c0 <= m0) v = 1;
        else if (c1 < m1 && c0 >= m0) v = -1;
      }
      record(2, v);
    }
    if (!done(3)) record(3, crossLevelVote(ind.rsi, p.rsiMid, i));
    if (!done(4)) record(4, breakoutVote(bars, i, p.donchianLookback));
  }

  let bullW = 0;
  let bearW = 0;
  for (let e = 0; e < p.eventCount; e++) {
    if (bullAge[e] >= 0) bullW += p.decayBase ** bullAge[e];
    if (bearAge[e] >= 0) bearW += p.decayBase ** bearAge[e];
  }

  const net = bullW - bearW;
  const bull = bullW >= p.minWeight && net >= p.minNetWeight;
  const bear = bearW >= p.minWeight && -net >= p.minNetWeight;

  const score = bull || bear
    ? Math.max(0, Math.min(1, Math.abs(net) / p.eventCount))
    : 0;

  return { bull, bear, veto: null, score };
}
