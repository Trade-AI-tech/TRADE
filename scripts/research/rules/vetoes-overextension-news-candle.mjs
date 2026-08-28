/**
 * วีโต้ #2 — ห้ามไล่ราคาหลังแท่งที่ยืดผิดปกติ (overextension) และหลังแท่งข่าว
 *
 * ─────────────────────────── กฎนี้มาจากแนวคิดอะไร ───────────────────────────
 *
 * ปัญหาของการเข้าไม้ "ตามสัญญาณ" คือสัญญาณส่วนใหญ่จุดติดหลังราคาวิ่งไปแล้ว ถ้าราคาวิ่งไป
 * พอประมาณก็ยังพอไล่ทัน แต่ถ้าเพิ่งวิ่งไปสามเท่าของความผันผวนปกติในแท่งเดียว การเข้าไม้ตรงนั้น
 * แปลว่าเราจ่ายราคาที่แพงที่สุดของรอบ และเอา SL ไปวางในที่ที่แท่งย่อธรรมดาก็ชนได้
 *
 * ที่สำคัญกว่านั้น ตัวรันวาง SL ที่ 1.5 × ATR ซึ่ง ATR "ยังไม่ทันรู้" ว่าเพิ่งมีแท่งยักษ์ผ่านไป
 * (ATR เป็นค่าเฉลี่ย 14 แท่ง แท่งเดียวขยับมันได้นิดเดียว) เท่ากับเราวาง SL ด้วยความผันผวน
 * ของเมื่อวาน ในตลาดที่ความผันผวนของวันนี้เปลี่ยนไปแล้ว — นั่นคือช่วงที่ระบบเสียเปรียบที่สุด
 *
 * กฎนี้เป็นวีโต้ล้วน สามองค์ประกอบ:
 *   A. แท่งเดียวยืดไปทางเดียว (body ใหญ่)      → ห้าม "ไล่" ฝั่งเดียวกับที่มันวิ่งไป
 *   B. ราคาสะสมวิ่งไปทางเดียวหลายแท่งติด        → ห้ามไล่ฝั่งนั้นเช่นกัน (ยืดแบบสะสม)
 *   C. แท่งช่วงกว้างผิดปกติ (กลิ่นข่าว)          → ห้ามทั้งสองฝั่ง และห้ามต่ออีก coolDownBars แท่ง
 *
 * A/B เป็นวีโต้ "มีทิศ" เพราะปัญหาคือการไล่ ส่วน C เป็นวีโต้สองฝั่งเพราะปัญหาคือ "ยังไม่รู้ว่า
 * ราคาสมดุลใหม่อยู่ตรงไหน" — ทั้งซื้อและขายในนาทีนั้นคือการเดา ไม่ใช่การอ่านโครงสร้าง
 *
 * ─────────────────────────── ทำไมเกณฑ์ถึงเป็นแบบนี้ ───────────────────────────
 *
 * · ตัวหารทุกอันคือ ATR ของ "แท่งก่อนหน้า" (atrRefLag = 1) ไม่ใช่ ATR ของแท่งปัจจุบัน
 *   เพราะ ATR ที่ดัชนี t รวม TR ของแท่ง t เข้าไปแล้ว แท่งยักษ์จึงไปโป่งตัวหารของตัวเอง
 *   ทำให้อัตราส่วนหดลงและตรวจไม่เจอ — ยิ่งแท่งใหญ่ ยิ่งตรวจไม่เจอ ซึ่งกลับหัวจากที่ต้องการ
 *   (การใช้ atr[t−1] ยังเป็น causal สมบูรณ์ เพราะ t−1 < t)
 * · แยก "body" (A) กับ "range" (C) ออกจากกันโดยตั้งใจ แท่งข่าวจริงมักมีไส้ยาวทั้งสองข้าง
 *   body อาจเล็กแต่ range มหาศาล — ถ้าวัดแต่ body จะพลาดแท่งที่อันตรายที่สุดไปทั้งกลุ่ม
 * · เกณฑ์สะสม (B) ใช้ close[t] − close[t−runLookback] ไม่ใช่ผลรวมของ body เพราะสิ่งที่แพง
 *   สำหรับคนเข้าทีหลังคือระยะทางสุทธิที่ราคาเดินไป ไม่ใช่ผลรวมของการแกว่งไปกลับ
 * · cooldown นับย้อนหลังแค่ coolDownBars แท่ง (รวมแท่งปัจจุบัน) เพราะ "ห้ามตลอดไป" ไม่ใช่วีโต้
 *   แต่เป็นการเลิกเทรดสินทรัพย์นั้น ระยะสั้น ๆ พอให้ตลาดหาราคาใหม่ได้คือสิ่งที่ต้องการ
 *
 * ─────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────
 *
 * 1. **volume ใช้ไม่ได้กับข้อมูลชุดนี้เกือบทั้งหมด** — แคช FOREX ทุกตัวมี volume = 0 ทุกแท่ง
 *    (volumeRatio จึงเป็น NaN) มีแค่ GOLD/XAUUSD กับ GOLD/XAGUSD บนกรอบ 1D ที่มีค่าจริง
 *    จึงจงใจไม่เอา volume มาเป็น "เงื่อนไข" ของวีโต้เลย ใช้แค่บวกคะแนนเท่านั้น
 *    ถ้าใครเอาไปเป็นเงื่อนไข วีโต้จะเงียบสนิทกับ 11 จาก 13 สินทรัพย์โดยไม่มีใครสังเกต
 * 2. กฎนี้ไม่รู้จัก "ปฏิทินข่าว" จริง ๆ มันเดาจากรูปแท่งย้อนหลัง แท่งกว้างที่เกิดจากสภาพคล่อง
 *    บางตอนตลาดปิด (เช่น ต้นสัปดาห์ของคู่ JPY) จะถูกนับเป็นข่าวด้วย — false positive ที่ยอมรับ
 * 3. เกณฑ์เป็นค่าคงที่เดียวกันหมดทั้ง 13 สินทรัพย์และทั้งสองกรอบเวลา ทั้งที่การกระจายตัวของ
 *    range/ATR ของ XAGUSD กับ EURGBP ไม่เหมือนกัน — ค่าที่ตั้งไว้จึงเป็นค่ากลาง ๆ ไม่ใช่ค่าที่ดีที่สุด
 *    ของใครเลย (ตั้งใจ: กันการ fit ค่าให้เข้ากับสินทรัพย์ที่บังเอิญเด่นในชุดข้อมูล)
 * 4. วีโต้ตัวนี้ตัดไม้ที่ "ดีมาก" ทิ้งด้วยแน่นอน เพราะเบรกเอาต์จริงก็เริ่มด้วยแท่งใหญ่เหมือนกัน
 *    มันเลือกฝั่ง "ไม่ไล่" เป็นค่าตั้งต้น ซึ่งจะดีหรือแย่ต้องวัดคู่กับกฎที่ออกสัญญาณจริงเท่านั้น
 *
 * ─────────────────── วัดจริงแล้วได้อะไร (train + validation) ───────────────────
 *
 * วิธีวัด: เปิดไม้สมมติทั้งสองฝั่งที่ทุกแท่งด้วยเรขาคณิต/ต้นทุนเดียวกับตัวรัน แล้วเทียบไม้ที่
 * "ถูกห้าม" กับ "ปล่อยผ่าน" · ประชากรอ้างอิง 1D: long +0.0344 R · short −0.0392 R
 *
 *   1D  ยิงวีโต้ bull 5.0% · bear 4.7% (ห้ามสองฝั่งพร้อมกัน 2.7%)
 *       long : ห้าม 3,115 ไม้ +0.0651 R | ปล่อย 59,479 ไม้ +0.0327 R → ห้ามผิด (−0.032 R)
 *       short: ห้าม 2,934 ไม้ −0.0056 R | ปล่อย 59,660 ไม้ −0.0409 R → ห้ามผิด (−0.035 R)
 *   1H  ยิงวีโต้ bull 10.4% · bear 10.2% — ห้ามถูกทั้งสองฝั่ง แต่แค่ +0.007 / +0.003 R
 *
 * อ่านว่า: **ข้อ 4 ข้างบนเกิดขึ้นจริงและเกิดแรงบน 1D** แท่งที่กฎนี้เรียกว่า "ยืดเกินจนห้ามไล่"
 * คือแท่งที่ให้ผลดีที่สุดในประชากรทั้งสองฝั่ง โมเมนตัมบน 1D ของจักรวาลนี้ไปต่อมากกว่าจะย่อ
 * — กฎนี้ในรูปแบบปัจจุบันจึงเป็นตัวถ่วงบน 1D และเป็นกลาง ๆ บน 1H ไม่ควรเอาไปใช้บน 1D
 * โดยไม่กลับเงื่อนไขหรือหาหลักฐานเพิ่ม (ตัวเลขนี้ยังไม่ได้แตะชุด test)
 */

export const meta = {
  id: 'vetoes-overextension-news-candle',
  name: 'วีโต้: แท่งยืดผิดปกติ / แท่งข่าว ห้ามไล่ราคา',
  family: 'confluence',
  needsHtf: false,
  params: {
    /** ใช้ ATR ของแท่งก่อนหน้ากี่แท่งเป็นตัวหาร (1 = แท่งที่แล้ว) เพื่อไม่ให้แท่งยักษ์โป่งตัวหารตัวเอง */
    atrRefLag: 1,
    /** A: |close − open| ของแท่งปัจจุบัน ต้องเกินกี่เท่าของ ATR อ้างอิงถึงจะเรียกว่า "ยืด" */
    bodyAtrMult: 1.8,
    /** B: ระยะทางสุทธิ runLookback แท่งย้อนหลัง ต้องเกินกี่เท่าของ ATR อ้างอิง */
    runLookback: 5,
    runAtrMult: 3.0,
    /** C: high − low ต้องเกินกี่เท่าของ ATR อ้างอิง ถึงจะถือว่าเป็นแท่งข่าว */
    rangeAtrMult: 2.5,
    /** C: หลังเจอแท่งข่าวแล้วห้ามเทรดต่ออีกกี่แท่ง (นับรวมแท่งข่าวเป็นแท่งที่ 1) */
    coolDownBars: 3,
    /** volumeRatio ที่ถือว่าผิดปกติ — ใช้บวกคะแนนอย่างเดียว ไม่ใช่เงื่อนไข (ดูข้อจำกัดข้อ 1) */
    volSpikeRatio: 2.0,
    volScoreBoost: 0.25,
    /** เกินเกณฑ์ไปอีกกี่เท่าถือว่าคะแนนเต็ม 1 (1.0 = อัตราส่วนสองเท่าของเกณฑ์ได้เต็ม) */
    scoreSpanMult: 1.0,
  },
};

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

const NO_VETO = { bull: false, bear: false, veto: null, score: 0 };

/** อัตราส่วนที่เกินเกณฑ์ แปลงเป็นคะแนน 0..1 — ต่ำกว่าเกณฑ์คืน 0 */
function excessScore(ratio, threshold, spanMult) {
  if (!Number.isFinite(ratio) || !(threshold > 0) || !(spanMult > 0)) return 0;
  return clamp01((ratio / threshold - 1) / spanMult);
}

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null|'bull'|'bear'|'both', score: number}}
 */
export function evaluate(ctx) {
  const p = meta.params;
  const { bars, t, ind } = ctx;

  let vetoBull = false;
  let vetoBear = false;
  let score = 0;

  const refIdx = t - p.atrRefLag;
  if (refIdx < 0) return NO_VETO;
  const atrRef = ind.atr[refIdx];
  if (!Number.isFinite(atrRef) || !(atrRef > 0)) return NO_VETO;

  const cur = bars[t];
  const open = cur.open;
  const close = cur.close;
  const high = cur.high;
  const low = cur.low;
  if (!Number.isFinite(open) || !Number.isFinite(close)) return NO_VETO;
  if (!Number.isFinite(high) || !Number.isFinite(low)) return NO_VETO;

  // ── A. แท่งเดียวยืดไปทางเดียว → ห้ามไล่ฝั่งนั้น ──
  const body = close - open;
  const bodyRatio = Math.abs(body) / atrRef;
  if (bodyRatio >= p.bodyAtrMult) {
    const s = excessScore(bodyRatio, p.bodyAtrMult, p.scoreSpanMult);
    if (body > 0) { vetoBull = true; if (s > score) score = s; }
    else if (body < 0) { vetoBear = true; if (s > score) score = s; }
    // body === 0 แต่ ratio ผ่านเกณฑ์เป็นไปไม่ได้ (0 / atr = 0) จึงไม่ต้องมีสาขาที่สาม
  }

  // ── B. ยืดแบบสะสมหลายแท่ง → ห้ามไล่ฝั่งนั้น ──
  const runIdx = t - p.runLookback;
  if (runIdx >= 0) {
    const past = bars[runIdx].close;
    if (Number.isFinite(past)) {
      const run = close - past;
      const runRatio = Math.abs(run) / atrRef;
      if (runRatio >= p.runAtrMult) {
        const s = excessScore(runRatio, p.runAtrMult, p.scoreSpanMult);
        if (run > 0) { vetoBull = true; if (s > score) score = s; }
        else if (run < 0) { vetoBear = true; if (s > score) score = s; }
      }
    }
  }

  // ── C. แท่งข่าว (ช่วงกว้างผิดปกติ) ภายใน coolDownBars แท่งหลังสุด → ห้ามทั้งสองฝั่ง ──
  // ไล่ย้อนหลังจากแท่งปัจจุบัน ทุกดัชนีที่แตะ <= t เสมอ จึงไม่มีทางมองอนาคต
  for (let k = 0; k < p.coolDownBars; k++) {
    const b = t - k;
    if (b < 0) break;
    const rIdx = b - p.atrRefLag;
    if (rIdx < 0) break;
    const atrB = ind.atr[rIdx];
    if (!Number.isFinite(atrB) || !(atrB > 0)) continue;
    const bb = bars[b];
    if (!Number.isFinite(bb.high) || !Number.isFinite(bb.low)) continue;
    const rangeRatio = (bb.high - bb.low) / atrB;
    if (rangeRatio >= p.rangeAtrMult) {
      vetoBull = true;
      vetoBear = true;
      const s = excessScore(rangeRatio, p.rangeAtrMult, p.scoreSpanMult);
      if (s > score) score = s;
    }
  }

  if (!vetoBull && !vetoBear) return NO_VETO;

  // volume เป็นตัวเสริมความมั่นใจเท่านั้น — NaN (ซึ่งคือกรณีปกติของ FOREX ในชุดนี้)
  // แปลว่า "ไม่มีข้อมูลยืนยัน" ไม่ใช่ "ยืนยันว่าไม่ผิดปกติ" จึงไม่ลดคะแนน แค่ไม่บวก
  const vr = ind.volumeRatio[t];
  if (Number.isFinite(vr) && vr >= p.volSpikeRatio) score = clamp01(score + p.volScoreBoost);

  const veto = vetoBull && vetoBear ? 'both' : (vetoBull ? 'bull' : 'bear');
  return { bull: false, bear: false, veto, score: clamp01(score) };
}
