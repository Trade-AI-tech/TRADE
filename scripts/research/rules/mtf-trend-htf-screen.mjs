/**
 * HTF Trend Gate (Elder Screen 1) — "กระแสน้ำ" ของกรอบใหญ่เป็นตัวกำหนดว่าวันนี้เล่นได้ทางไหน
 *
 * ─────────────────────────────── มาจากแนวคิดอะไร ───────────────────────────────
 *
 * Triple Screen ของ Alexander Elder แบ่งการตัดสินใจเป็นชั้น ๆ ชั้นแรก (Screen 1) ไม่ได้
 * หาจุดเข้า แต่ตอบคำถามเดียวว่า "ตอนนี้กระแสน้ำไหลไปทางไหน" แล้วห้ามเทรดสวนกระแส
 * เครื่องมือที่ Elder ใช้คือ "ความชันของ MACD-histogram" บนกรอบใหญ่ ไม่ใช่ค่าสัมบูรณ์
 * ของมัน เพราะความชันเปลี่ยนก่อนที่เส้นจะตัดกัน — ชั้นแรกจึงเป็นตัวบอกทิศ ไม่ใช่ตัวจับจังหวะ
 *
 * ─────────────────────────────── ทำไมตั้งเกณฑ์แบบนี้ ───────────────────────────────
 *
 * · ทิศกระแสน้ำ = เครื่องหมายของ hist[T] − hist[T−histSlopeBars] บนกรอบใหญ่ ตรงตามต้นตำรับ
 * · กฎยิงไม้เฉพาะ "แท่งที่กระแสน้ำเพิ่งเปลี่ยนทิศ" (ทิศของแท่งใหญ่ล่าสุดต่างจากทิศของแท่ง
 *   ใหญ่ก่อนหน้า) ไม่ใช่ยิงทุกแท่งที่กระแสน้ำเป็นบวก เพราะอย่างหลังจะกลายเป็นการเปิดไม้
 *   ทุกชั่วโมงตลอดเทรนด์ แล้วตัวเลขที่ได้จะวัดความยาวของเทรนด์แทนที่จะวัดคุณค่าของประตู
 * · ต่อให้เงื่อนไขบนกรอบใหญ่เป็นจริงทั้งวัน กฎก็ยิงแค่ครั้งเดียว — เพราะบังคับว่า bars[t]
 *   ต้องเป็น "แท่งเล็กแท่งแรก" ที่มองเห็นแท่งใหญ่ตัวนี้ (htf.bars[T] ปิดไปก่อน bars[t]
 *   แต่ยังไม่ปิดก่อน bars[t−1]) ตรวจจากเวลาโดยตรง ไม่ต้องเดา
 * · เพิ่มเงื่อนไข ADX กรอบใหญ่ >= htfMinAdx ซึ่ง "ไม่ใช่ของ Elder" แต่ใส่เพราะความชันของ
 *   histogram ในตลาดออกข้างพลิกไปมาแทบทุกแท่ง ประตูที่พลิกทุกวันไม่ใช่ประตู
 * · เมื่อกระแสน้ำมีทิศ กฎจะคง veto ฝั่งตรงข้ามไว้ "ทุกแท่ง" ไม่ใช่เฉพาะแท่งที่ยิงไม้
 *   เพราะประตูเป็นสถานะ ไม่ใช่เหตุการณ์ — ส่วนนี้จะมีผลจริงตอนเอาไปประกอบกับกฎอื่น
 *
 * ─────────────────────────────── ข้อจำกัดที่รู้ตัว ───────────────────────────────
 *
 * 1. needsHtf=true จึงวัดได้เฉพาะ 1H — บน 1D ไม่มี TF ที่ใหญ่กว่าในตัวรัน ผลเป็น 0 ไม้
 *    โดยโครงสร้าง ไม่ใช่เพราะเกณฑ์แน่นเกินไป
 * 2. Elder ตั้งใจให้ Screen 1 ทำงานคู่กับ Screen 2 (รอย่อแล้วค่อยเข้า) การวัด Screen 1
 *    เดี่ยว ๆ แบบนี้คือการเข้า "ตลาดราคาเปิดแท่งถัดไป" ทันทีที่ประตูเปลี่ยนทิศ ซึ่งเป็น
 *    จุดเข้าที่แย่ที่สุดเท่าที่ Screen 1 จะให้ได้ ตัวเลขที่ออกมาจึงเป็นขอบล่างของแนวคิดนี้
 * 3. htfBarMs ตรึงไว้ที่ 1 วัน เพราะคู่ TF เดียวที่ตัวรันจับให้คือ 1H -> 1D ถ้าวันหนึ่งมี
 *    คู่อื่น ต้องแก้ค่านี้ ไม่ใช่แก้ตรรกะ
 * 4. MACD-histogram มีหน่วยเป็นราคา การหารด้วย ATR ตอนคิดคะแนนจึงพอเทียบข้ามสินทรัพย์ได้
 *    แต่ไม่ได้แปลว่าคะแนนของทองกับของ EURGBP มีความหมายเท่ากันเป๊ะ
 */

export const meta = {
  id: 'mtf-trend-htf-screen',
  name: 'ประตูเทรนด์กรอบใหญ่ Elder Screen 1 (ยิงตอนกระแสน้ำเปลี่ยนทิศ)',
  family: 'mtf',
  needsHtf: true,
  params: {
    /** ความชันของ MACD-histogram กรอบใหญ่ วัดข้ามกี่แท่งใหญ่ */
    histSlopeBars: 1,
    /** ADX กรอบใหญ่ต้องถึงเท่านี้ ประตูถึงจะยอมเปิด (กันตลาดออกข้างที่ความชันพลิกทุกแท่ง) */
    htfMinAdx: 20,
    /** ความยาวหนึ่งแท่งของกรอบใหญ่ (ms) — 1D · ใช้หา "แท่งเล็กแท่งแรก" ที่เห็นแท่งใหญ่นี้ */
    htfBarMs: 86400000,
    /** ตัวหารแปลงขนาดการเปลี่ยนของ histogram เป็นคะแนน 0..1 (หน่วย ATR กรอบใหญ่) */
    scoreAtrSpan: 0.5,
  },
};

const BLOCK = { bull: false, bear: false, veto: 'both', score: 0 };
const finite = (v) => Number.isFinite(v);

/** ทิศของกระแสน้ำที่แท่งใหญ่ดัชนี i — คืน 0 เมื่อคำนวณไม่ได้หรือความชันเป็นศูนย์พอดี */
function tideAt(histSeries, i, slopeBars) {
  if (i - slopeBars < 0) return { dir: 0, delta: NaN };
  const now = histSeries[i];
  const back = histSeries[i - slopeBars];
  if (!finite(now) || !finite(back)) return { dir: 0, delta: NaN };
  const delta = now - back;
  return { dir: delta > 0 ? 1 : delta < 0 ? -1 : 0, delta };
}

/**
 * @param {{bars: Array, t: number, ind: object, htf: object|null}} ctx
 * @returns {{bull: boolean, bear: boolean, veto: null|'bull'|'bear'|'both', score: number}}
 */
export function evaluate(ctx) {
  const { histSlopeBars, htfMinAdx, htfBarMs, scoreAtrSpan } = meta.params;
  const { bars, t, htf } = ctx;

  if (!htf) return BLOCK;
  const T = htf.t;
  // ต้องอ่านทิศของแท่งใหญ่ก่อนหน้าได้ด้วย จึงต้องมีแท่งใหญ่อย่างน้อย histSlopeBars+1 แท่ง
  if (!Number.isInteger(T) || T - histSlopeBars - 1 < 0) return BLOCK;
  if (t < 1) return BLOCK;

  const hist = htf.ind.macd.histogram;
  const now = tideAt(hist, T, histSlopeBars);
  if (now.dir === 0) return BLOCK; // กระแสน้ำนิ่ง/อ่านไม่ได้ = ประตูปิดทั้งสองฝั่ง

  const veto = now.dir > 0 ? 'bear' : 'bull';

  const prev = tideAt(hist, T - 1, histSlopeBars);
  if (prev.dir === 0) return { bull: false, bear: false, veto, score: 0 };
  const flipped = now.dir !== prev.dir;

  const hAdx = htf.ind.adx[T];
  const hAtr = htf.ind.atr[T];
  if (!finite(hAdx) || !finite(hAtr) || !(hAtr > 0)) {
    return { bull: false, bear: false, veto, score: 0 };
  }
  const hasForce = hAdx >= htfMinAdx;

  // "แท่งเล็กแท่งแรกที่เห็นแท่งใหญ่ตัวนี้" — เงื่อนไขเดียวกับที่ตัวรันใช้จับคู่ HTF
  // (ts_ใหญ่ + 1 แท่งใหญ่ <= ts_เล็ก) แต่ต้องยังไม่เป็นจริงที่แท่งเล็กก่อนหน้า
  const hTs = htf.bars[T].ts;
  const tsNow = bars[t].ts;
  const tsPrev = bars[t - 1].ts;
  if (!finite(hTs) || !finite(tsNow) || !finite(tsPrev)) {
    return { bull: false, bear: false, veto, score: 0 };
  }
  const firstBarSeeingHtf = hTs + htfBarMs <= tsNow && hTs + htfBarMs > tsPrev;

  const fire = flipped && hasForce && firstBarSeeingHtf;
  const bull = fire && now.dir > 0;
  const bear = fire && now.dir < 0;

  const score = fire && finite(now.delta)
    ? Math.min(1, Math.abs(now.delta) / (scoreAtrSpan * hAtr))
    : 0;

  return { bull, bear, veto, score };
}
