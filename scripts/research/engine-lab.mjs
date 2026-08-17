#!/usr/bin/env node
/**
 * engine-lab.mjs — สำเนาเครื่องคำนวณสัญญาณที่ "ทุกตัวเลขปรับได้จากภายนอก"
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ไฟล์นี้เป็นสำเนาของ src/lib/signal-engine.ts (ฟังก์ชัน generateSignal)
 *  ต้นฉบับคือ src/lib/signal-engine.ts เสมอ — ไฟล์นี้ไม่ใช่
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ทำไมต้องมีสำเนา ทั้งที่รู้ว่าสำเนาคือหนี้
 *   ต้นฉบับฝังตัวเลขไว้ทั้งหมด: netScore>=3 · RSI 30/70/50 · ATR×1.5/×3 · 1.5% · 0.995/1.005
 *   · น้ำหนัก +1/+2 · เกณฑ์ strength 3/5/8 · confidence 40+score×6
 *   จะทดสอบ 50 แบบต้องแก้ไฟล์จริง 50 รอบ ซึ่งทำวิจัยไม่ได้ และเสี่ยงลืมแก้กลับ
 *   ไฟล์นี้จึงเป็น "โต๊ะทดลอง" ที่แก้ค่าได้โดยไม่แตะโค้ดที่ผู้ใช้ใช้จริง
 *
 * ─────────────────────────── วิธีซิงก์เมื่อต้นฉบับเปลี่ยน ───────────────────────────
 *
 *  1. เปิด src/lib/signal-engine.ts ดูว่าเปลี่ยนอะไร
 *  2. แก้ตามในฟังก์ชัน generateSignalLab() ด้านล่าง — โครงถูกจัดให้ "เรียงบล็อกตรงกับ
 *     ต้นฉบับบรรทัดต่อบรรทัด" (RSI → MACD cross → MACD hist → Trend → BB → Patterns
 *     → S/R → News → ตัดสิน → ATR → SL/TP ชั้น 1/2/3 → confidence → ttl → indicators)
 *     ทุกตัวเลขที่เพิ่มใหม่ต้องกลายเป็นคีย์ใน DEFAULT_CONFIG โดยค่าเริ่มต้น = ค่าในต้นฉบับ
 *  3. รัน `npm run lab:parity` — ถ้าไม่ตรงมันจะพิมพ์ทุกเคสที่ต่างพร้อมค่าทั้งสองฝั่ง
 *  4. ห้ามแก้ check-lab-parity.mjs ให้ยอมรับความต่าง — ต้นฉบับคือกฎที่ชี้ขาดสัญญาณของผู้ใช้
 *
 *  ตัวตรวจ parity จับ "สำเนาล้าสมัย" ได้เอง เพราะมันโหลด src/lib/signal-engine.ts
 *  ตัวจริงมาเทียบทุกครั้งที่รัน ไม่ได้เทียบกับผลที่บันทึกไว้ล่วงหน้า
 *  แปลว่าพอมีคนแก้ต้นฉบับแล้วไม่ซิงก์ที่นี่ CI จะแดงทันที
 *
 * ────────────────────────────────── วิธีใช้ ──────────────────────────────────
 *
 *   import { loadLabEngine, DEFAULT_CONFIG, resolveConfig } from './engine-lab.mjs';
 *
 *   const lab = await loadLabEngine();                      // config เริ่มต้น = ของเดิมเป๊ะ
 *   const sig = lab.generateSignal({ symbol, name, market, candles, timeframe });
 *
 *   const lab2 = await loadLabEngine({                      // ปรับค่า
 *     decision: { buyNetScore: 4, sellNetScore: -4 },
 *     rules: { rsi: { enabled: false } },                   // ปิดกฎเป็นรายตัว
 *     exits: { slAtrMult: 2, tpAtrMult: 4 },
 *   });
 *
 *   node scripts/research/engine-lab.mjs                    // พิมพ์ config เริ่มต้นทั้งก้อน
 *
 * หมายเหตุสำคัญ: ไฟล์นี้ "ไม่ได้เขียน indicator ใหม่" — มันรับ src/lib/indicators.ts
 * ตัวจริงเข้ามาใช้ ดังนั้นความเสี่ยงที่สำเนาจะเพี้ยนถูกจำกัดอยู่แค่ตรรกะของ engine
 * ไม่ลามไปถึงคณิตศาสตร์ของ RSI/MACD/ATR
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrcModules } from './load-src-modules.mjs';

// ════════════════════════════════ ค่าเริ่มต้น = ของเดิมเป๊ะ ════════════════════════════════
//
// ทุกค่าในนี้ถูกคัดลอกมาจาก src/lib/signal-engine.ts ตรง ๆ
// เปลี่ยนค่าใดค่าหนึ่งที่นี่ = เปลี่ยนพฤติกรรมเริ่มต้น = parity แตก (ตั้งใจให้เป็นอย่างนั้น)

export const DEFAULT_CONFIG = deepFreeze({
  /** candles.length < ค่านี้ → คืน null (ต้นฉบับ: 50) */
  minCandles: 50,

  /** คาบของ indicator — ต้นฉบับเรียกด้วยค่า default ของ src/lib/indicators.ts ทั้งหมด */
  indicators: {
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    maFastPeriod: 20,   // EMA20
    maMidPeriod: 50,    // SMA50
    maSlowPeriod: 200,  // SMA200 — คำนวณเฉพาะเมื่อมีแท่งครบตามคาบนี้จริง ไม่ย่อคาบให้สั้นลง
    bbPeriod: 20,
    bbStdDev: 2,
    atrPeriod: 14,
    srLookback: 5,
  },

  /** ระยะที่ยังนับว่า "ราคาอยู่ติดแนวรับ/แนวต้าน" (ต้นฉบับ: 0.015 = 1.5%) */
  levels: {
    maxDistancePct: 0.015,
  },

  /**
   * กฎให้คะแนน — enabled:false = ปิดกฎนั้นทั้งดุ้น (ไม่ได้คะแนน และไม่มี reason)
   * มีไว้เพื่อวัดว่ากฎไหนช่วย กฎไหนทำร้าย โดยไม่ต้องรื้อโครงคะแนน
   */
  rules: {
    rsi: {
      enabled: true,
      zones: { enabled: true, oversold: 30, overbought: 70, score: 2, weight: 0.2 },
      cross: { enabled: true, mid: 50, score: 1, weight: 0.15 },
    },
    macdCross: { enabled: true, score: 2, weight: 0.2 },
    /** ต้นฉบับให้คะแนน histogram แต่ไม่ push reason — จงใจคงไว้อย่างนั้น */
    macdHistogram: { enabled: true, score: 1 },
    trend: { enabled: true, scoreWithSlowMA: 2, scoreWithoutSlowMA: 1, weight: 0.2 },
    bollinger: { enabled: true, score: 1, weight: 0.15 },
    patterns: {
      enabled: true,
      bullish: ['Bullish Engulfing', 'Hammer'],
      bearish: ['Bearish Engulfing', 'Shooting Star'],
      score: 2,
      weight: 0.2,
    },
    supportResistance: { enabled: true, score: 1, weight: 0.15 },
    news: { enabled: true, bullThreshold: 0.3, bearThreshold: -0.3, scoreMultiplier: 2, weight: 0.2 },
  },

  /** เกณฑ์ตัดสิน action / strength / confidence */
  decision: {
    buyNetScore: 3,
    sellNetScore: -3,
    strengthModerate: 3,
    strengthStrong: 5,
    strengthVeryStrong: 8,
    confidenceBase: 40,
    confidencePerScore: 6,
    confidenceCap: 95,
    maxReasons: 5,
  },

  /** การวาง SL/TP */
  exits: {
    /** false = ไม่เอาระดับแนวรับ/แนวต้านมาใช้วาง SL/TP (ใช้ ATR ล้วน) — คนละสวิตช์กับกฎให้คะแนน */
    useSupportResistance: true,
    slAtrMult: 1.5,
    tpAtrMult: 3,
    holdAtrMult: 1,
    /** ตัวคูณเผื่อ slippage ทับระดับที่เลือกมา (ต้นฉบับ: BUY ใช้ 0.995 / SELL ใช้ 1.005) */
    buyLevelBuffer: 0.995,
    sellLevelBuffer: 1.005,
    /** ATR ใช้ไม่ได้ (NaN หรือ <= 0) → ถอยไปใช้สัดส่วนของราคา */
    atrFallbackPct: 0.02,
  },

  /** รูปแบบผลลัพธ์ที่ไหลออกไปเป็นสัญญาณจริง */
  output: {
    forexDecimals: 5,
    otherDecimals: 4,
    forexPrecision: 5,
    otherPrecision: 6,
    indicatorDecimals: 4,
    rsiDecimals: 2,
    /** อายุสัญญาณรายชั่วโมง — timeframe ที่ไม่อยู่ในตารางนี้ใช้ defaultTtlHours */
    ttlHoursByTimeframe: { '1H': 48 },
    defaultTtlHours: 168, // 7 วัน
  },
});

/** คีย์ที่รับคีย์ย่อยอิสระ (ไม่ใช่ schema ตายตัว) — ตรวจชนิดค่าแทนการตรวจชื่อคีย์ */
const FREEFORM_PATHS = new Set(['output.ttlHoursByTimeframe']);

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepFreeze(obj) {
  for (const v of Object.values(obj)) {
    if (isPlainObject(v) || Array.isArray(v)) deepFreeze(v);
  }
  return Object.freeze(obj);
}

/**
 * รวม config ที่ผู้ใช้ส่งมาเข้ากับค่าเริ่มต้น
 *
 * โยน error ทันทีเมื่อเจอคีย์ที่ไม่รู้จัก — จงใจ ไม่ใช่ความเข้มงวดเกินเหตุ
 * เพราะพิมพ์ `slAtrMultiplier` ผิดจาก `slAtrMult` แล้วระบบเงียบ = รันสวีป 50 แบบ
 * ด้วยค่าเริ่มต้นทั้ง 50 แบบ แล้วสรุปว่า "ปรับแล้วผลไม่ต่าง" ซึ่งเป็นข้อสรุปที่ผิด
 */
export function resolveConfig(patch = {}) {
  const cfg = structuredClone(DEFAULT_CONFIG);
  if (patch !== null && patch !== undefined) {
    if (!isPlainObject(patch)) throw new Error('config ต้องเป็น object');
    applyPatch(cfg, patch, '');
  }
  validateConfig(cfg);
  return cfg;
}

function applyPatch(base, patch, prefix) {
  for (const key of Object.keys(patch)) {
    const p = prefix ? `${prefix}.${key}` : key;
    const value = patch[key];
    if (value === undefined) continue; // ไม่ระบุ = ใช้ค่าเริ่มต้น

    if (!(key in base)) {
      throw new Error(`ไม่รู้จักคีย์ config "${p}" — คีย์ที่มีในระดับนี้: ${Object.keys(base).join(', ')}`);
    }

    if (FREEFORM_PATHS.has(p)) {
      if (!isPlainObject(value)) throw new Error(`config "${p}" ต้องเป็น object`);
      for (const [k, v] of Object.entries(value)) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
          throw new Error(`config "${p}.${k}" ต้องเป็นตัวเลข > 0 (ได้ ${v})`);
        }
      }
      base[key] = { ...value };
      continue;
    }

    const cur = base[key];
    if (Array.isArray(cur)) {
      if (!Array.isArray(value)) throw new Error(`config "${p}" ต้องเป็น array`);
      base[key] = [...value];
      continue;
    }
    if (isPlainObject(cur)) {
      if (!isPlainObject(value)) throw new Error(`config "${p}" ต้องเป็น object`);
      applyPatch(cur, value, p);
      continue;
    }
    if (typeof cur !== typeof value) {
      throw new Error(`config "${p}" ต้องเป็น ${typeof cur} (ได้ ${typeof value})`);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`config "${p}" ต้องเป็นตัวเลขที่ใช้ได้ (ได้ ${value})`);
    }
    base[key] = value;
  }
}

/**
 * ตรวจค่าที่ "ถ้าผิดจะไปพังลึก ๆ กลางการรัน" ให้พังตั้งแต่ตอนตั้งค่าแทน
 * เช่น toFixed รับได้แค่ 0–100 และ toPrecision รับได้แค่ 1–100 — เกินนั้นโยน RangeError
 * กลางทางแล้วอ่านไม่ออกว่ามาจาก config ตัวไหน
 */
function validateConfig(cfg) {
  const intAtLeast1 = (v, name) => {
    if (!Number.isInteger(v) || v < 1) throw new Error(`config "${name}" ต้องเป็นจำนวนเต็ม >= 1 (ได้ ${v})`);
  };
  for (const k of ['rsiPeriod', 'macdFast', 'macdSlow', 'macdSignal', 'maFastPeriod', 'maMidPeriod', 'maSlowPeriod', 'bbPeriod', 'atrPeriod', 'srLookback']) {
    intAtLeast1(cfg.indicators[k], `indicators.${k}`);
  }
  if (!Number.isInteger(cfg.minCandles) || cfg.minCandles < 0) {
    throw new Error(`config "minCandles" ต้องเป็นจำนวนเต็ม >= 0 (ได้ ${cfg.minCandles})`);
  }
  for (const k of ['forexDecimals', 'otherDecimals', 'indicatorDecimals', 'rsiDecimals']) {
    const v = cfg.output[k];
    if (!Number.isInteger(v) || v < 0 || v > 100) throw new Error(`config "output.${k}" ต้องเป็นจำนวนเต็ม 0–100 (ได้ ${v})`);
  }
  for (const k of ['forexPrecision', 'otherPrecision']) {
    const v = cfg.output[k];
    if (!Number.isInteger(v) || v < 1 || v > 100) throw new Error(`config "output.${k}" ต้องเป็นจำนวนเต็ม 1–100 (ได้ ${v})`);
  }
  if (cfg.output.defaultTtlHours <= 0) throw new Error('config "output.defaultTtlHours" ต้อง > 0');
  if (!Number.isInteger(cfg.decision.maxReasons) || cfg.decision.maxReasons < 0) {
    throw new Error('config "decision.maxReasons" ต้องเป็นจำนวนเต็ม >= 0');
  }
  if (!Array.isArray(cfg.rules.patterns.bullish) || !Array.isArray(cfg.rules.patterns.bearish)) {
    throw new Error('config "rules.patterns.bullish/bearish" ต้องเป็น array ของชื่อ pattern');
  }
}

/** คืนเฉพาะค่าที่ต่างจาก DEFAULT_CONFIG เป็น map แบน ๆ — ใช้ติดป้ายผลการทดลองว่า "แบบไหน" */
export function configDiff(cfg) {
  const out = {};
  const walk = (a, b, prefix) => {
    for (const key of Object.keys(b)) {
      const p = prefix ? `${prefix}.${key}` : key;
      const av = a?.[key];
      const bv = b[key];
      if (isPlainObject(bv) && isPlainObject(av) && !FREEFORM_PATHS.has(p)) {
        walk(av, bv, p);
      } else if (JSON.stringify(av) !== JSON.stringify(bv)) {
        out[p] = bv;
      }
    }
  };
  walk(DEFAULT_CONFIG, cfg, '');
  return out;
}

// ═════════════════════════════════════ ตัวเครื่องยนต์ ═════════════════════════════════════

/** uuid v4 — ต้องเป็น uuid จริงเพราะคอลัมน์ signals.id เป็น type uuid (ลอกจากต้นฉบับ) */
function newUuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * ปัดทศนิยมให้เหมาะกับ "ขนาดของราคา" ไม่ใช่ชนิดตลาดอย่างเดียว (ลอกจากต้นฉบับ)
 * ราคาต่ำกว่า 1 ใช้เลขนัยสำคัญ เพราะ toFixed(4) ทำให้เหรียญราคาถูกยุบเป็น 0
 */
function roundPrice(value, market, out) {
  if (!Number.isFinite(value)) return value;
  if (value !== 0 && Math.abs(value) < 1) {
    const digits = market === 'FOREX' ? out.forexPrecision : out.otherPrecision;
    return Number(value.toPrecision(digits));
  }
  return Number(value.toFixed(market === 'FOREX' ? out.forexDecimals : out.otherDecimals));
}

/**
 * แปลงสัดส่วนเป็นข้อความเปอร์เซ็นต์ให้เหมือนต้นฉบับเป๊ะ (0.015 → "1.5")
 * ต้อง normalize ด้วย toFixed ก่อน เพราะ 0.0175*100 ได้ 1.7500000000000002 ในเลขทศนิยมลอยตัว
 */
function pctText(fraction) {
  return String(Number((fraction * 100).toFixed(6)));
}

/**
 * generateSignal เวอร์ชันรับ config
 *
 * โครงเรียงตรงกับ src/lib/signal-engine.ts บล็อกต่อบล็อก เพื่อให้ diff ตอนซิงก์อ่านง่าย
 * @param {object} input   { symbol, name, market, candles, timeframe?, newsSentiment? }
 * @param {object} cfg     ผลจาก resolveConfig()
 * @param {object} ind     namespace ของ src/lib/indicators.ts
 */
export function generateSignalLab(input, cfg, ind) {
  const { symbol, name, market, candles, timeframe = '1D', newsSentiment } = input;

  if (candles.length < cfg.minCandles) return null;

  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const IC = cfg.indicators;
  const rsi = ind.RSI(closes, IC.rsiPeriod);
  const macd = ind.MACD(closes, IC.macdFast, IC.macdSlow, IC.macdSignal);
  const emaFast = ind.EMA(closes, IC.maFastPeriod);
  const maMid = ind.SMA(closes, IC.maMidPeriod);
  // MA200 คำนวณเฉพาะเมื่อมีข้อมูลครบตามคาบจริง ไม่ย่อ period ให้สั้นลง
  const maSlow = closes.length >= IC.maSlowPeriod ? ind.SMA(closes, IC.maSlowPeriod) : [];

  const bb = ind.BollingerBands(closes, IC.bbPeriod, IC.bbStdDev);

  const last = closes.length - 1;
  const rsiNow = rsi[last];
  const rsiPrev = rsi[last - 1];
  const macdNow = macd.macdLine[last];
  const macdSignal = macd.signalLine[last];
  const macdHist = macd.histogram[last];
  const ma20Now = emaFast[last];
  const ma50Now = maMid[last];
  const ma200Now = maSlow.length ? maSlow[last] : NaN;
  const hasMA200 = Number.isFinite(ma200Now);

  const sr = ind.findSupportResistance(candles, IC.srLookback);
  const patterns = ind.detectPatterns(candles);
  const trend = ind.determineTrend(currentPrice, ma20Now, ma50Now, ma200Now);

  // ── ระบบให้คะแนน ────────────────────────────────────────────────────────────
  let bullScore = 0;
  let bearScore = 0;
  const reasons = [];

  // RSI
  const R = cfg.rules;
  if (R.rsi.enabled && Number.isFinite(rsiNow)) {
    // ต้นฉบับเป็น if/else-if ยาวเส้นเดียว: โซน oversold/overbought กินก่อน ถ้าไม่เข้าโซนค่อยดูการตัด 50
    // แยกเป็นสองก้อนที่นี่เพื่อปิดทีละกฎย่อยได้ แต่เมื่อเปิดทั้งคู่ ลำดับการตัดสินเหมือนเดิมทุกประการ
    let claimedByZone = false;
    if (R.rsi.zones.enabled) {
      if (rsiNow < R.rsi.zones.oversold) {
        claimedByZone = true;
        bullScore += R.rsi.zones.score;
        reasons.push({ type: 'technical', label: 'RSI Oversold', detail: `RSI(${IC.rsiPeriod}) = ${rsiNow.toFixed(1)} อยู่ในโซน oversold`, weight: R.rsi.zones.weight });
      } else if (rsiNow > R.rsi.zones.overbought) {
        claimedByZone = true;
        bearScore += R.rsi.zones.score;
        reasons.push({ type: 'technical', label: 'RSI Overbought', detail: `RSI(${IC.rsiPeriod}) = ${rsiNow.toFixed(1)} อยู่ในโซน overbought`, weight: R.rsi.zones.weight });
      }
    }
    if (!claimedByZone && R.rsi.cross.enabled && Number.isFinite(rsiPrev)) {
      const mid = R.rsi.cross.mid;
      if (rsiNow > mid && rsiPrev < mid) {
        bullScore += R.rsi.cross.score;
        reasons.push({ type: 'technical', label: 'RSI Cross 50', detail: 'RSI ตัดขึ้นผ่าน 50', weight: R.rsi.cross.weight });
      } else if (rsiNow < mid && rsiPrev > mid) {
        bearScore += R.rsi.cross.score;
        reasons.push({ type: 'technical', label: 'RSI Cross 50', detail: 'RSI ตัดลงต่ำกว่า 50', weight: R.rsi.cross.weight });
      }
    }
  }

  // MACD cross
  if (R.macdCross.enabled
      && Number.isFinite(macdNow) && Number.isFinite(macdSignal)
      && Number.isFinite(macd.macdLine[last - 1]) && Number.isFinite(macd.signalLine[last - 1])) {
    if (macdNow > macdSignal && macd.macdLine[last - 1] <= macd.signalLine[last - 1]) {
      bullScore += R.macdCross.score;
      reasons.push({ type: 'technical', label: 'MACD Bullish Cross', detail: 'MACD ตัดขึ้น Signal Line', weight: R.macdCross.weight });
    } else if (macdNow < macdSignal && macd.macdLine[last - 1] >= macd.signalLine[last - 1]) {
      bearScore += R.macdCross.score;
      reasons.push({ type: 'technical', label: 'MACD Bearish Cross', detail: 'MACD ตัดลง Signal Line', weight: R.macdCross.weight });
    }
  }

  // MACD histogram — ต้นฉบับให้คะแนนแต่ไม่ push reason (คงไว้ตามเดิม)
  if (R.macdHistogram.enabled && Number.isFinite(macdHist) && Number.isFinite(macd.histogram[last - 1])) {
    if (macdHist > 0 && macd.histogram[last - 1] < macdHist) {
      bullScore += R.macdHistogram.score;
    } else if (macdHist < 0 && macd.histogram[last - 1] > macdHist) {
      bearScore += R.macdHistogram.score;
    }
  }

  // Trend
  const trendDetail = hasMA200
    ? (t) => `MA20 ${t} MA50 ${t} MA200 ยืนยัน${t === '>' ? 'uptrend' : 'downtrend'}`
    : (t) => `MA20 ${t} MA50 (ข้อมูลไม่ถึง ${IC.maSlowPeriod} แท่ง จึงไม่ใช้ MA200 ยืนยัน)`;

  if (R.trend.enabled) {
    if (trend === 'uptrend') {
      bullScore += hasMA200 ? R.trend.scoreWithSlowMA : R.trend.scoreWithoutSlowMA;
      reasons.push({ type: 'technical', label: 'Uptrend', detail: trendDetail('>'), weight: R.trend.weight });
    } else if (trend === 'downtrend') {
      bearScore += hasMA200 ? R.trend.scoreWithSlowMA : R.trend.scoreWithoutSlowMA;
      reasons.push({ type: 'technical', label: 'Downtrend', detail: trendDetail('<'), weight: R.trend.weight });
    }
  }

  // Bollinger Bands
  if (R.bollinger.enabled) {
    if (Number.isFinite(bb.lower[last]) && currentPrice < bb.lower[last]) {
      bullScore += R.bollinger.score;
      reasons.push({ type: 'technical', label: 'BB Lower Touch', detail: 'ราคาต่ำกว่า Bollinger Lower Band', weight: R.bollinger.weight });
    } else if (Number.isFinite(bb.upper[last]) && currentPrice > bb.upper[last]) {
      bearScore += R.bollinger.score;
      reasons.push({ type: 'technical', label: 'BB Upper Touch', detail: 'ราคาสูงกว่า Bollinger Upper Band', weight: R.bollinger.weight });
    }
  }

  // Patterns
  if (R.patterns.enabled) {
    for (const p of patterns) {
      if (R.patterns.bullish.includes(p)) {
        bullScore += R.patterns.score;
        reasons.push({ type: 'pattern', label: p, detail: `รูปแบบ ${p} ปรากฏในแท่งล่าสุด`, weight: R.patterns.weight });
      } else if (R.patterns.bearish.includes(p)) {
        bearScore += R.patterns.score;
        reasons.push({ type: 'pattern', label: p, detail: `รูปแบบ ${p} ปรากฏในแท่งล่าสุด`, weight: R.patterns.weight });
      }
    }
  }

  // Support/Resistance
  //
  // กรอง "ฝั่ง" ไม่ใช่แค่ระยะทาง: แนวรับต้องอยู่ใต้ราคาปัจจุบัน แนวต้านต้องอยู่เหนือ
  // ระดับที่ราคาทะลุลงมาแล้วไม่ใช่แนวรับอีกต่อไป ถ้าเอาไปตั้ง SL ของ BUY จะได้ SL เหนือราคาเข้า
  //
  // การ "หา" ระดับทำเสมอ เพราะทั้งกฎให้คะแนนและการวาง SL/TP ต่างใช้ระดับเดียวกัน
  // แต่ละฝั่งมีสวิตช์ของตัวเอง (rules.supportResistance / exits.useSupportResistance)
  const maxDist = cfg.levels.maxDistancePct;
  const nearSupport = sr.supports.find((s) => s < currentPrice && (currentPrice - s) / currentPrice < maxDist);
  const nearResistance = sr.resistances.find((r) => r > currentPrice && (r - currentPrice) / currentPrice < maxDist);
  if (R.supportResistance.enabled) {
    if (nearSupport) {
      bullScore += R.supportResistance.score;
      reasons.push({ type: 'technical', label: 'At Support', detail: `ราคาอยู่เหนือแนวรับ ${nearSupport.toFixed(2)} ไม่เกิน ${pctText(maxDist)}%`, weight: R.supportResistance.weight });
    }
    if (nearResistance) {
      bearScore += R.supportResistance.score;
      reasons.push({ type: 'technical', label: 'At Resistance', detail: `ราคาอยู่ใต้แนวต้าน ${nearResistance.toFixed(2)} ไม่เกิน ${pctText(maxDist)}%`, weight: R.supportResistance.weight });
    }
  }

  // News sentiment
  if (R.news.enabled && newsSentiment !== undefined) {
    if (newsSentiment > R.news.bullThreshold) {
      bullScore += Math.round(newsSentiment * R.news.scoreMultiplier);
      reasons.push({ type: 'news', label: 'Bullish News', detail: `ข่าวเชิงบวก (sentiment: ${newsSentiment.toFixed(2)})`, weight: R.news.weight });
    } else if (newsSentiment < R.news.bearThreshold) {
      bearScore += Math.round(Math.abs(newsSentiment) * R.news.scoreMultiplier);
      reasons.push({ type: 'news', label: 'Bearish News', detail: `ข่าวเชิงลบ (sentiment: ${newsSentiment.toFixed(2)})`, weight: R.news.weight });
    }
  }

  // ── ตัดสิน action ────────────────────────────────────────────────────────────
  const D = cfg.decision;
  let action = 'HOLD';
  let strength = 'weak';
  const totalScore = Math.max(bullScore, bearScore);
  const netScore = bullScore - bearScore;

  if (netScore >= D.buyNetScore) action = 'BUY';
  else if (netScore <= D.sellNetScore) action = 'SELL';

  if (totalScore >= D.strengthVeryStrong) strength = 'very_strong';
  else if (totalScore >= D.strengthStrong) strength = 'strong';
  else if (totalScore >= D.strengthModerate) strength = 'moderate';

  // ── SL/TP จาก ATR จริง ───────────────────────────────────────────────────────
  const X = cfg.exits;
  const atrRaw = ind.ATR(candles, IC.atrPeriod);
  const atr = Number.isFinite(atrRaw) && atrRaw > 0 ? atrRaw : currentPrice * X.atrFallbackPct;

  const slLevelSupport = X.useSupportResistance ? nearSupport : undefined;
  const slLevelResistance = X.useSupportResistance ? nearResistance : undefined;

  let stopLoss;
  let takeProfit;

  if (action === 'BUY') {
    stopLoss = slLevelSupport ? slLevelSupport * X.buyLevelBuffer : currentPrice - atr * X.slAtrMult;
    takeProfit = slLevelResistance ? slLevelResistance * X.buyLevelBuffer : currentPrice + atr * X.tpAtrMult;
  } else if (action === 'SELL') {
    stopLoss = slLevelResistance ? slLevelResistance * X.sellLevelBuffer : currentPrice + atr * X.slAtrMult;
    takeProfit = slLevelSupport ? slLevelSupport * X.sellLevelBuffer : currentPrice - atr * X.tpAtrMult;
  } else {
    stopLoss = currentPrice - atr * X.holdAtrMult;
    takeProfit = currentPrice + atr * X.holdAtrMult;
  }

  // ชั้นที่ 2 — บังคับ invariant บนค่าดิบ
  // ตัวคูณเผื่อ slippage เลื่อนค่าข้ามฝั่ง entry ได้ (แนวต้านเหนือราคา 0.2% พอคูณ 0.995 แล้วตกไปใต้ราคา)
  // เขียนเป็น !(a < b) ไม่ใช่ (a >= b) เพื่อให้ NaN ตกเข้าเงื่อนไข fallback ด้วย
  if (action === 'BUY') {
    if (!(stopLoss < currentPrice)) stopLoss = currentPrice - atr * X.slAtrMult;
    if (!(takeProfit > currentPrice)) takeProfit = currentPrice + atr * X.tpAtrMult;
  } else if (action === 'SELL') {
    if (!(stopLoss > currentPrice)) stopLoss = currentPrice + atr * X.slAtrMult;
    if (!(takeProfit < currentPrice)) takeProfit = currentPrice - atr * X.tpAtrMult;
  }

  // ชั้นที่ 3 — ตรวจ invariant อีกครั้ง "หลังปัดทศนิยม"
  // สิ่งที่ไหลออกไปจริงคือค่าที่ผ่าน roundPrice แล้ว ถ้าระยะเล็กกว่าครึ่งหน่วยปัดจะยุบเท่ากับ entry
  const O = cfg.output;
  const entryOut = roundPrice(currentPrice, market, O);
  let stopOut = roundPrice(stopLoss, market, O);
  let takeOut = roundPrice(takeProfit, market, O);

  if (action === 'BUY') {
    if (!(stopOut < entryOut)) stopOut = roundPrice(currentPrice - atr * X.slAtrMult, market, O);
    if (!(takeOut > entryOut)) takeOut = roundPrice(currentPrice + atr * X.tpAtrMult, market, O);
  } else if (action === 'SELL') {
    if (!(stopOut > entryOut)) stopOut = roundPrice(currentPrice + atr * X.slAtrMult, market, O);
    if (!(takeOut < entryOut)) takeOut = roundPrice(currentPrice - atr * X.tpAtrMult, market, O);
  }

  // ATR เล็กเกินกว่าจะรอดการปัด — ยอมไม่ออกสัญญาณ ดีกว่าออกสัญญาณที่ SL/TP ใช้งานไม่ได้จริง
  if (action !== 'HOLD' && (stopOut === entryOut || takeOut === entryOut || stopOut <= 0 || takeOut <= 0)) {
    return null;
  }

  const confidence = Math.min(D.confidenceCap, D.confidenceBase + totalScore * D.confidencePerScore);

  // อายุสัญญาณตาม timeframe — สัญญาณจากแท่งรายชั่วโมง "เก่า" เร็วกว่าสัญญาณรายวันมาก
  const ttlHours = Object.prototype.hasOwnProperty.call(O.ttlHoursByTimeframe, timeframe)
    ? O.ttlHoursByTimeframe[timeframe]
    : O.defaultTtlHours;
  const ttlMs = ttlHours * 3600_000;

  const indicators = {};
  const put = (k, v, d = O.indicatorDecimals) => {
    if (Number.isFinite(v)) indicators[k] = Number(v.toFixed(d));
  };
  put('rsi', rsiNow, O.rsiDecimals);
  put('macd', macdNow);
  put('macd_signal', macdSignal);
  put('ma20', ma20Now);
  put('ma50', ma50Now);
  put('ma200', ma200Now);
  put('atr', atr);

  return {
    id: newUuid(),
    user_id: '',
    symbol, name, market,
    action, strength, status: 'active',
    entry_price: entryOut,
    stop_loss: stopOut,
    take_profit: takeOut,
    current_price: entryOut,
    confidence,
    timeframe,
    reasons: reasons.slice(0, D.maxReasons),
    indicators,
    news_sentiment: newsSentiment ?? null,
    telegram_sent: false,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    created_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════ ตัวช่วยประกอบร่าง ═══════════════════════════════════

/**
 * ผูก config + indicators เข้ากับเครื่องยนต์ให้เรียกง่ายเหมือนต้นฉบับ
 * @param {object} indicators namespace ของ src/lib/indicators.ts (ตัวจริง ไม่ใช่สำเนา)
 */
export function createLabEngine(indicators, configPatch = {}) {
  const config = resolveConfig(configPatch);
  return {
    config,
    diff: configDiff(config),
    generateSignal: (input) => generateSignalLab(input, config, indicators),
  };
}

/** โหลด src/lib/indicators.ts ตัวจริงแล้วประกอบเครื่องยนต์ให้เลย */
export async function loadLabEngine(configPatch = {}) {
  const { indicators } = await loadSrcModules(['src/lib/indicators.ts']);
  return createLabEngine(indicators, configPatch);
}

// ─────────────────────────────── รันตรง ๆ = พิมพ์ config ───────────────────────────────

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const patchArg = process.argv.find((a) => a.startsWith('--config='));
  let cfg;
  try {
    const patch = patchArg ? JSON.parse(patchArg.slice('--config='.length)) : {};
    cfg = resolveConfig(patch);
  } catch (err) {
    // พิมพ์ข้อความอย่างเดียว ไม่ต้องมี stack — คนที่พิมพ์คีย์ผิดอยากอ่านว่าคีย์ไหนผิด
    console.error(`\n[config ใช้ไม่ได้] ${err?.message ?? err}\n`);
    process.exit(1);
  }
  console.log(JSON.stringify(cfg, null, 2));
  const diff = configDiff(cfg);
  const keys = Object.keys(diff);
  console.log('');
  console.log(keys.length === 0
    ? 'ต่างจากค่าเริ่มต้น: ไม่ต่าง (พฤติกรรมเท่ากับ src/lib/signal-engine.ts)'
    : `ต่างจากค่าเริ่มต้น ${keys.length} ค่า: ${keys.map((k) => `${k}=${JSON.stringify(diff[k])}`).join(' · ')}`);
}
