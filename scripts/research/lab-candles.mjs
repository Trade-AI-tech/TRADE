#!/usr/bin/env node
/**
 * lab-candles.mjs — เครื่องปั่นแท่งเทียนสังเคราะห์แบบ deterministic สำหรับงานวิจัย/parity
 *
 * ทำไมต้อง deterministic
 *   ถ้าเคสทดสอบไม่ซ้ำเดิม CI จะเขียวบ้างแดงบ้างโดยที่โค้ดไม่เปลี่ยน แล้วคนจะเลิกเชื่อผลของมัน
 *   ทุกอย่างในไฟล์นี้จึงรับ seed เข้ามา และห้ามแตะ Math.random เด็ดขาด
 *
 * ไฟล์นี้ไม่มีตรรกะการตัดสินใจใด ๆ — เป็นแค่แหล่งข้อมูลอินพุต
 */

/** mulberry32 — PRNG เล็ก ๆ ที่ให้ลำดับเดิมทุกครั้งเมื่อ seed เท่าเดิม */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** hash สตริงแบบง่าย (FNV-1a) ใช้ผสมชื่อเคสเข้ากับ seed หลักให้แต่ละชุดไม่ซ้ำแต่คงที่ */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * โปรไฟล์ราคา — คืน "อัตราเปลี่ยนแปลงเชิงสัดส่วน" ของแต่ละแท่ง (คูณ ไม่ใช่บวก)
 * ใช้สัดส่วนเพราะราคาจะไม่มีวันติดลบเอง และใช้ได้กับทั้งราคา 0.000001 และ 100000
 *
 * ต้องมีทั้งขึ้น/ลง/ออกข้าง/พลิกกลับ เพราะแต่ละแบบเดินคนละกิ่งของเครื่องยนต์:
 *   trend → กิ่ง uptrend/downtrend · vshape/crash → ดัน RSI เข้าโซน oversold/overbought
 *   flat → ATR ยุบจนต้องใช้ fallback · squeeze → ราคาทะลุ Bollinger Band
 */
export const PROFILES = {
  up: (i, rnd) => 0.009 + (rnd() - 0.5) * 0.010,
  down: (i, rnd) => -0.009 + (rnd() - 0.5) * 0.010,
  side: (i, rnd) => Math.sin(i / 7) * 0.004 + (rnd() - 0.5) * 0.008,
  chop: (i, rnd) => (rnd() - 0.5) * 0.060,
  flat: (i, rnd) => (rnd() - 0.5) * 0.0000004,
  spike: (i, rnd) => (i % 17 === 0 ? (rnd() < 0.5 ? -0.08 : 0.08) : (rnd() - 0.5) * 0.002),
  crash: (i, rnd) => (i % 23 < 18 ? -0.014 : 0.020) + (rnd() - 0.5) * 0.006,
  vshape: (i, rnd) => (i < 0.5 ? 0 : 0) + (rnd() - 0.5) * 0.004, // ถูกแทนที่ใน synthCandles (ต้องรู้ความยาว)
  squeeze: (i, rnd) => (rnd() - 0.5) * (0.0006 + (i / 200) * 0.05),
  stair: (i, rnd) => (i % 10 < 7 ? 0.0002 : 0.012) + (rnd() - 0.5) * 0.003,
};

export const PROFILE_KEYS = Object.keys(PROFILES);

/**
 * สร้างแท่งเทียน length แท่งจากราคาเริ่ม base
 * high/low ถูกวางคร่อม open/close เสมอ (แท่งถูกกติกา) ยกเว้นจะโดน corruption ทีหลัง
 */
export function synthCandles({ profile = 'side', base = 100, length = 120, seed = 1, intervalMs = 86400000 } = {}) {
  const step = PROFILES[profile];
  if (!step) throw new Error(`ไม่รู้จักโปรไฟล์ "${profile}" — มีให้เลือก: ${PROFILE_KEYS.join(', ')}`);

  const rnd = mulberry32((seed ^ fnv1a(profile) ^ Math.imul(length, 0x9e3779b1)) >>> 0);
  const baseEpoch = Date.UTC(2026, 0, 5, 0, 0, 0);

  const candles = [];
  let prevClose = base;
  for (let i = 0; i < length; i++) {
    const open = prevClose;
    // vshape ต้องรู้ความยาวทั้งชุดถึงจะรู้ว่าอยู่ครึ่งไหน จึงคำนวณตรงนี้แทนในตาราง
    const delta = profile === 'vshape'
      ? (i < length / 2 ? -0.011 : 0.011) + (rnd() - 0.5) * 0.006
      : step(i, rnd);
    const close = open * (1 + delta);
    const wick = Math.abs(close / open - 1) * 0.6 + 0.004;
    const high = Math.max(open, close) * (1 + rnd() * wick);
    const low = Math.min(open, close) * (1 - rnd() * wick);
    candles.push({
      timestamp: new Date(baseEpoch + i * intervalMs).toISOString(),
      open,
      high,
      low,
      close,
      volume: Math.round(1000 + rnd() * 50000),
    });
    prevClose = close;
  }
  return candles;
}

/**
 * ตัวบิดข้อมูลให้ "เสีย" แบบที่ข้อมูลจริงจาก Yahoo เคยเสียมาแล้ว (และแบบที่ยังไม่เคยแต่เป็นไปได้)
 *
 * เหตุผลที่ parity ต้องยิงเคสพวกนี้: กิ่ง Number.isFinite / <= 0 / NaN กระจายอยู่ทั่วเครื่องยนต์
 * ถ้าสำเนาเผลอเปลี่ยน `!(a < b)` เป็น `a >= b` เคสปกติจะยังตรงกันหมด แต่เคส NaN จะแตกทันที
 * ตัวบิดพวกนี้คือด่านที่จับความต่างชนิดนั้น
 */
export const CORRUPTIONS = {
  none: (c) => c,

  /** ปิดกลาง ๆ เป็น NaN — indicator สายกลางจะพัง แต่ค่าล่าสุดยังคำนวณได้บางตัว */
  nanCloseMiddle: (c, rnd) => {
    const i = Math.floor(rnd() * Math.max(1, c.length - 2)) + 1;
    c[i] = { ...c[i], close: NaN };
    return c;
  },

  /** ปิดแท่งสุดท้ายเป็น NaN — ต้องตกด่าน currentPrice ทั้งสองฝั่ง */
  nanCloseLast: (c) => {
    c[c.length - 1] = { ...c[c.length - 1], close: NaN };
    return c;
  },

  /** ราคาปิดแท่งสุดท้าย 0 — ต้องตกด่าน currentPrice <= 0 */
  zeroCloseLast: (c) => {
    c[c.length - 1] = { ...c[c.length - 1], close: 0 };
    return c;
  },

  /** ราคาติดลบกลางชุด — ไม่มีด่านไหนกันไว้ ผลลัพธ์จะแปลกแต่ต้อง "แปลกเหมือนกัน" ทั้งสองฝั่ง */
  negativeMiddle: (c, rnd) => {
    const i = Math.floor(rnd() * Math.max(1, c.length - 2)) + 1;
    c[i] = { ...c[i], close: -Math.abs(c[i].close), low: -Math.abs(c[i].low) * 2 };
    return c;
  },

  /** high ต่ำกว่า low — แท่งกลับหัว ทำให้ ATR/pattern ได้ค่าติดลบ */
  highLowSwapped: (c, rnd) => {
    const i = Math.floor(rnd() * c.length);
    const { high, low } = c[i];
    c[i] = { ...c[i], high: low, low: high };
    return c;
  },

  /** ฟิลด์หาย — Yahoo ส่ง null มาจริงในแท่งที่ตลาดหยุด (ที่นี่จำลองเป็น undefined) */
  missingHigh: (c, rnd) => {
    const i = Math.floor(rnd() * c.length);
    const copy = { ...c[i] };
    delete copy.high;
    c[i] = copy;
    return c;
  },

  missingLow: (c, rnd) => {
    const i = Math.floor(rnd() * c.length);
    const copy = { ...c[i] };
    delete copy.low;
    c[i] = copy;
    return c;
  },

  /** Infinity โผล่กลางชุด */
  infiniteHigh: (c, rnd) => {
    const i = Math.floor(rnd() * c.length);
    c[i] = { ...c[i], high: Infinity };
    return c;
  },

  /** ทุกแท่งเหมือนกันเป๊ะ — ATR = 0 ต้องถอยไปใช้ fallback, RSI ต้องได้ 100 (avgLoss = 0) */
  allIdentical: (c) => {
    const first = { ...c[0], open: c[0].close, high: c[0].close, low: c[0].close };
    return c.map((x, i) => ({ ...first, timestamp: x.timestamp }));
  },

  /** แท่งเดียวใหญ่ผิดปกติ 1e12 เท่า — ทดสอบ overflow ของ toFixed/toPrecision */
  hugeOutlier: (c, rnd) => {
    const i = Math.floor(rnd() * c.length);
    c[i] = { ...c[i], high: c[i].high * 1e12 };
    return c;
  },

  /**
   * high = 1e308 (เกือบชนเพดาน double) — ดัน ATR ให้ใหญ่จน stopLoss ติดลบมหาศาล
   * เป็นทางเดียวที่พบว่าไปแตะกิ่ง `stopOut <= 0` ของด่านชั้นที่ 3 ได้
   */
  extremeHigh: (c, rnd) => {
    const i = Math.max(1, c.length - 1 - Math.floor(rnd() * 5));
    c[i] = { ...c[i], high: 1e308 };
    return c;
  },

  /** ราคาแท่งสุดท้ายเล็กจนปัดทศนิยมแล้วยุบ — ด่านชั้นที่ 3 ของ signal-engine */
  microLast: (c) => {
    const i = c.length - 1;
    c[i] = { ...c[i], close: 1e-9, open: 1e-9, high: 1.0000001e-9, low: 0.9999999e-9 };
    return c;
  },

  /** volume หาย (เครื่องยนต์ไม่ได้ใช้ แต่ต้องพิสูจน์ว่าไม่ใช้จริง) */
  missingVolume: (c) => c.map((x) => { const y = { ...x }; delete y.volume; return y; }),
};

export const CORRUPTION_KEYS = Object.keys(CORRUPTIONS);

/** ใช้ตัวบิดกับสำเนาของชุดแท่ง (ไม่แตะต้นฉบับ) */
export function applyCorruption(candles, kind, rnd) {
  const fn = CORRUPTIONS[kind];
  if (!fn) throw new Error(`ไม่รู้จัก corruption "${kind}"`);
  return fn(candles.map((c) => ({ ...c })), rnd);
}
