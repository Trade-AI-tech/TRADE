#!/usr/bin/env node
/**
 * rule-lab.mjs — ตัวรันที่วัด "กฎเทรดทีละข้อ" ให้เห็นตัวเลขก่อนจะเอาไปประกอบเป็นระบบ
 *
 * ─────────────────────────────── ทำไมต้องมีไฟล์นี้ ───────────────────────────────
 *
 * lab.mjs วัด "เครื่องยนต์ทั้งเครื่อง" ซึ่งตอบได้แค่ว่าเครื่องรวม ๆ ดีหรือแย่ แต่ตอบไม่ได้ว่า
 * ชิ้นไหนในเครื่องเป็นตัวถ่วง เวลาเครื่องได้ −0.03 R/ไม้ เราไม่รู้เลยว่ามันเกิดจากกฎสิบข้อ
 * ที่แย่พอ ๆ กัน หรือกฎเก้าข้อที่กลาง ๆ บวกกฎหนึ่งข้อที่พังยับ ไฟล์นี้จึงวัดทีละข้อ
 * บนเงื่อนไขการเข้า-ออกที่ตายตัวเหมือนกันหมด เพื่อให้เอาผลมาวางเทียบกันได้ตรง ๆ
 *
 * "เงื่อนไขตายตัวเหมือนกันหมด" สำคัญกว่า "เงื่อนไขที่ดีที่สุด" — ถ้าแต่ละกฎออกไม้ด้วย
 * SL/TP ของตัวเอง ตัวเลขที่ได้จะวัดคนละอย่างกันแล้วเอามาเรียงอันดับไม่ได้
 *
 * ─────────────────────────────── สิ่งที่ตัวรันรับประกัน ───────────────────────────────
 *
 * 1. อินดิเคเตอร์ทุกตัวเป็น causal — ค่าที่ดัชนี i คำนวณจาก bars[0..i] เท่านั้น
 *    (สูตรลอกจาก src/lib/indicators.ts แล้วแปลงจาก "ค่าล่าสุดค่าเดียว" เป็น series)
 * 2. ชุด test แตะไม่ได้ — ตัดแท่งทิ้งตั้งแต่ตอนโหลด แล้วมี guard ที่ throw ถ้ายังหลุดเข้ามา
 *    วิธีนี้ทำให้ "เผลอ" ไม่ได้ เพราะแท่ง test ไม่ได้อยู่ในหน่วยความจำตั้งแต่แรก
 * 3. HTF ไม่มองอนาคต — เลือกแท่ง 1D ที่ "ปิดครบวันแล้ว" ก่อนเวลาแท่ง 1H ปัจจุบันเท่านั้น
 * 4. กฎที่แอบอ่านอนาคตถูกตัดออกอัตโนมัติ — เรียก evaluate ซ้ำด้วยข้อมูลที่ตัดปลาย
 *    ถ้าผลไม่เท่าเดิม กฎนั้นตกทันที ไม่มีการเตือนแล้วปล่อยผ่าน
 *
 * ─────────────────────────────── สิ่งที่ตัวรันไม่ได้ทำ ───────────────────────────────
 *
 * · ไม่ปรับขนาดไม้ ไม่ทบต้น ไม่จำกัดจำนวนไม้พร้อมกัน — ทุกสัญญาณกลายเป็นไม้เสมอ
 *   ตัวเลขจึงเป็น "คุณภาพของสัญญาณ" ไม่ใช่ "ผลของพอร์ต"
 * · ไม่แก้ระยะ SL ตามเพดานต้นทุน (applyStopFloor ใน src/lib/costs.ts) เพราะนั่นเป็นชั้น
 *   นโยบายที่ทำงานหลังกฎตัดสินใจ ถ้าใส่เข้ามาที่นี่ กฎที่ ATR แคบจะถูกช่วยแบบเงียบ ๆ
 *   แล้วเราจะแยกไม่ออกว่าที่ดีขึ้นเป็นเพราะกฎหรือเพราะนโยบาย
 *
 * ──────────────────────────────────── วิธีใช้ ────────────────────────────────────
 *
 *   node scripts/research/rule-lab.mjs --self-test
 *   node scripts/research/rule-lab.mjs --rules=_example-rsi-oversold
 *   node scripts/research/rule-lab.mjs --timeframes=1H --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SELF_DIR, '..', '..');
const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const RULES_DIR = path.join(SELF_DIR, 'rules');
const REPORTS_DIR = path.join(SELF_DIR, 'reports');
const OUT_FILE = path.join(REPORTS_DIR, 'rule-lab.json');

/** เส้นแบ่งที่ lab.mjs สร้างไว้ — ต้องใช้ตัวเดียวกันเป๊ะ ไม่งั้นผลเทียบข้ามไฟล์ไม่ได้ */
const SPLIT_FILE = path.join(SELF_DIR, 'report', 'split.json');
/** ใช้เฉพาะตอนไม่มีไฟล์ split — ต้องเป็นสัดส่วนเดียวกับ SPLIT_RATIOS ใน lab.mjs */
const SPLIT_RATIOS = { train: 0.6, validation: 0.2, test: 0.2 };

/** จักรวาลที่ใช้จริง 13 ตัว — ตรึงไว้เป็นรายการ ไม่ scan โฟลเดอร์ เพราะแคชมีตัวอื่นปนอยู่ */
const UNIVERSE = [
  { market: 'GOLD', symbol: 'XAUUSD' },
  { market: 'GOLD', symbol: 'XAGUSD' },
  { market: 'FOREX', symbol: 'EURUSD' },
  { market: 'FOREX', symbol: 'GBPUSD' },
  { market: 'FOREX', symbol: 'USDJPY' },
  { market: 'FOREX', symbol: 'AUDUSD' },
  { market: 'FOREX', symbol: 'USDCHF' },
  { market: 'FOREX', symbol: 'USDCAD' },
  { market: 'FOREX', symbol: 'NZDUSD' },
  { market: 'FOREX', symbol: 'EURJPY' },
  { market: 'FOREX', symbol: 'GBPJPY' },
  { market: 'FOREX', symbol: 'EURGBP' },
  { market: 'FOREX', symbol: 'AUDJPY' },
];

// ════════════════════════════ กติกาการเดินไม้ (ตายตัว) ════════════════════════════

const ATR_PERIOD = 14;
/** ระยะ SL = 1.5 เท่าของ ATR ณ แท่งสัญญาณ */
const SL_ATR_MULT = 1.5;
/** TP = 2 เท่าของระยะ SL — ตรงกับ MIN_RR_GEOMETRY = 2.0 ใน src/lib/signal-engine.ts */
const RR_TARGET = 2.0;
/** เพดานถือต่อกรอบเวลา — ตรงกับ MAX_HOLD_BARS ใน scripts/resolve-signals.mjs */
const MAX_HOLD_BARS = { '1D': 20, '1H': 24 };
/**
 * แท่งแรกที่ยอมให้ออกสัญญาณ — ต้องมี TR ครบ 14 ตัวก่อน ไม่งั้น ATR คำนวณจากแท่งไม่กี่แท่ง
 * แล้วระยะ SL ของไม้แรก ๆ จะแคบจนต้นทุนกลืนทุกอย่าง (ตัวหารของ cost_R คือระยะ SL)
 */
const WARMUP_BARS = ATR_PERIOD;
const DAY_MS = 24 * 60 * 60 * 1000;

// ════════════════════════════════ ต้นทุนการเทรด ════════════════════════════════
//
// ลอกจาก COST_BPS + costRFor ใน src/lib/costs.ts (ซึ่งลอกมาจาก lab.mjs อีกที)
// ⚠ ทุกตัวเป็นการประมาณจากตารางค่าธรรมเนียมสาธารณะ ไม่ใช่ใบเสร็จจริง

const COST_BPS = {
  byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 },
  bySymbol: {
    XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10,
    EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15,
    EURTHB: 20, JPYTHB: 20, GBPTHB: 20, AUDTHB: 20,
  },
};

function costBpsFor(symbol, market) {
  const bps = COST_BPS.bySymbol[symbol] ?? COST_BPS.byMarket[market];
  if (bps === undefined) throw new Error(`ไม่มีค่าประมาณต้นทุนสำหรับ ${market}/${symbol}`);
  return bps;
}

/** ต้นทุนไป-กลับของไม้หนึ่ง คิดเป็นสัดส่วนของเงินที่เสี่ยง (หน่วย R) */
function costRFor(entry, stop, symbol, market) {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0) || !Number.isFinite(entry)) return null;
  return ((costBpsFor(symbol, market) / 10000) * Math.abs(entry)) / risk;
}

// ══════════════════════ อินดิเคเตอร์ — port จาก src/lib/indicators.ts ══════════════════════
//
// กติกาเดียวกับต้นฉบับ: ช่วงที่ข้อมูลไม่พอคืน NaN เสมอ ไม่เดาค่า
// ตัวที่ต้นฉบับคืน "ค่าล่าสุดค่าเดียว" (ATR · volumeRatio) ถูกแปลงเป็น series โดยให้
// out[i] เท่ากับผลของการเรียกฟังก์ชันต้นฉบับด้วย candles.slice(0, i+1) เป๊ะ ๆ
// — self-test ข้อ indicator-vs-source ตรวจข้อนี้ด้วยการเรียกต้นฉบับซ้ำทีละดัชนีจริง ๆ

function SMA(values, period) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j];
    result.push(sum / period);
  }
  return result;
}

function EMA(values, period) {
  const result = new Array(values.length).fill(NaN);
  const start = values.findIndex((v) => Number.isFinite(v));
  if (start === -1 || values.length - start < period) return result;

  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = start; i < start + period; i++) sum += values[i];
  let ema = sum / period;
  result[start + period - 1] = ema;

  for (let i = start + period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

/** RSI แบบ Wilder smoothing */
function RSI(values, period = 14) {
  const result = new Array(values.length).fill(NaN);
  if (values.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function MACD(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = EMA(values, fast);
  const emaSlow = EMA(values, slow);
  const macdLine = emaFast.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(emaSlow[i]) ? v - emaSlow[i] : NaN);
  const signalLine = EMA(macdLine, signal);
  const histogram = macdLine.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(signalLine[i]) ? v - signalLine[i] : NaN);
  return { macdLine, signalLine, histogram };
}

function BollingerBands(values, period = 20, stdDev = 2) {
  const ma = SMA(values, period);
  const upper = [];
  const lower = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { upper.push(NaN); lower.push(NaN); continue; }
    let sumSq = 0;
    for (let j = 0; j < period; j++) {
      const diff = values[i - j] - ma[i];
      sumSq += diff * diff;
    }
    const sd = Math.sqrt(sumSq / period);
    upper.push(ma[i] + stdDev * sd);
    lower.push(ma[i] - stdDev * sd);
  }
  return { upper, middle: ma, lower };
}

/** ต้นฉบับ ATR() คืนค่าล่าสุดค่าเดียวจาก candles.slice(-(period+1)) — ตรงนี้กางเป็น series */
function ATRSeries(candles, period = 14) {
  const n = candles.length;
  const out = new Array(n).fill(NaN);
  if (n < 2) return out;

  const tr = new Array(n).fill(NaN); // tr[i] คิดจากคู่แท่ง i-1 กับ i
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }

  // หน้าต่างเลื่อน: ที่ดัชนี i ใช้ TR ตัวหลังสุด min(i, period) ตัว ซึ่งตรงกับที่ต้นฉบับ
  // ได้จาก slice(-(period+1)) พอดี (ช่วงต้นชุดต้นฉบับก็หารด้วยจำนวนที่มีจริง ไม่ใช่ period)
  let sum = 0;
  for (let i = 1; i < n; i++) {
    sum += tr[i];
    if (i > period) sum -= tr[i - period];
    out[i] = sum / Math.min(i, period);
  }
  return out;
}

/** Stochastic — %K ตำแหน่งราคาปิดในกรอบ high/low · กรอบแบน (hi===lo) คืน NaN ไม่ใช่ 50 */
function Stochastic(candles, kPeriod = 14, dPeriod = 3) {
  const k = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { k.push(NaN); continue; }
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      const c = candles[i - j];
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
    }
    const range = hi - lo;
    k.push(range > 0 ? ((candles[i].close - lo) / range) * 100 : NaN);
  }
  return { k, d: SMA(k, dPeriod) };
}

/** ADX แบบ Wilder — ต้นฉบับคืน series อยู่แล้ว ลอกมาทั้งดุ้น */
function ADX(candles, period = 14) {
  const n = candles.length;
  const adx = new Array(n).fill(NaN);
  const plusDI = new Array(n).fill(NaN);
  const minusDI = new Array(n).fill(NaN);
  if (n < period * 2 + 1) return { adx, plusDI, minusDI };

  const tr = [];
  const pDM = [];
  const mDM = [];
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    const up = c.high - p.high;
    const down = p.low - c.low;
    pDM.push(up > down && up > 0 ? up : 0);
    mDM.push(down > up && down > 0 ? down : 0);
  }

  const wilder = (a) => {
    const out = new Array(a.length).fill(NaN);
    let acc = 0;
    for (let i = 0; i < a.length; i++) {
      if (i < period - 1) { acc += a[i]; continue; }
      if (i === period - 1) { acc += a[i]; out[i] = acc; continue; }
      acc = acc - acc / period + a[i];
      out[i] = acc;
    }
    return out;
  };

  const trS = wilder(tr);
  const pS = wilder(pDM);
  const mS = wilder(mDM);

  const dx = new Array(tr.length).fill(NaN);
  for (let i = 0; i < trS.length; i++) {
    if (!Number.isFinite(trS[i]) || trS[i] === 0) continue;
    const pdi = (pS[i] / trS[i]) * 100;
    const mdi = (mS[i] / trS[i]) * 100;
    plusDI[i + 1] = pdi;
    minusDI[i + 1] = mdi;
    const sum = pdi + mdi;
    if (sum > 0) dx[i] = (Math.abs(pdi - mdi) / sum) * 100;
  }

  const first = dx.findIndex(Number.isFinite);
  if (first < 0 || first + period > dx.length) return { adx, plusDI, minusDI };
  let acc = 0;
  for (let i = first; i < first + period; i++) acc += dx[i];
  let cur = acc / period;
  adx[first + period] = cur;
  for (let i = first + period; i < dx.length; i++) {
    if (!Number.isFinite(dx[i])) continue;
    cur = (cur * (period - 1) + dx[i]) / period;
    adx[i + 1] = cur;
  }
  return { adx, plusDI, minusDI };
}

/** ต้นฉบับ volumeRatio() คืนค่าเดียว — กางเป็น series · ค่าเฉลี่ยไม่รวมแท่งปัจจุบันโดยตั้งใจ */
function volumeRatioSeries(candles, period = 20) {
  const n = candles.length;
  const out = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) { // ต้นฉบับต้องมี period+1 แท่ง → ดัชนีเริ่มที่ period
    let sum = 0;
    let ok = true;
    for (let j = i - period; j < i; j++) {
      if (!Number.isFinite(candles[j].volume)) { ok = false; break; }
      sum += candles[j].volume;
    }
    if (!ok) continue;
    const avg = sum / period;
    const last = candles[i].volume;
    if (!(avg > 0) || !Number.isFinite(last)) continue;
    out[i] = last / avg;
  }
  return out;
}

/** ต้นฉบับ ATR() ตัวจริง — เก็บไว้เพื่อให้ self-test เทียบกับ ATRSeries ได้ตรง ๆ */
function ATRScalar(candles, period = 14) {
  if (candles.length < 2) return NaN;
  const slice = candles.slice(-(period + 1));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i];
    const prevClose = slice[i - 1].close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    n++;
  }
  return n ? sum / n : NaN;
}

/** ต้นฉบับ volumeRatio() ตัวจริง — เหตุผลเดียวกับ ATRScalar */
function volumeRatioScalar(candles, period = 20) {
  if (candles.length < period + 1) return NaN;
  const prev = candles.slice(-(period + 1), -1);
  let sum = 0;
  for (const c of prev) {
    if (!Number.isFinite(c.volume)) return NaN;
    sum += c.volume;
  }
  const avg = sum / prev.length;
  const last = candles[candles.length - 1].volume;
  if (!(avg > 0) || !Number.isFinite(last)) return NaN;
  return last / avg;
}

/** ชุดอินดิเคเตอร์ที่ส่งให้กฎ — ทุกตัวยาวเท่า bars และเป็น causal */
function computeIndicators(bars) {
  const closes = bars.map((b) => b.close);
  return {
    rsi: RSI(closes, 14),
    ma50: SMA(closes, 50),
    ma200: SMA(closes, 200),
    atr: ATRSeries(bars, ATR_PERIOD),
    adx: ADX(bars, 14).adx,
    volumeRatio: volumeRatioSeries(bars, 20),
    macd: MACD(closes, 12, 26, 9),
    bb: BollingerBands(closes, 20, 2),
    stoch: Stochastic(bars, 14, 3),
  };
}

/** ตัดปลาย series ทุกตัวให้เหลือ 0..upto — ใช้ตอนตรวจ causality ของกฎ */
function sliceInd(ind, upto) {
  const cut = (a) => a.slice(0, upto + 1);
  return {
    rsi: cut(ind.rsi),
    ma50: cut(ind.ma50),
    ma200: cut(ind.ma200),
    atr: cut(ind.atr),
    adx: cut(ind.adx),
    volumeRatio: cut(ind.volumeRatio),
    macd: {
      macdLine: cut(ind.macd.macdLine),
      signalLine: cut(ind.macd.signalLine),
      histogram: cut(ind.macd.histogram),
    },
    bb: { upper: cut(ind.bb.upper), middle: cut(ind.bb.middle), lower: cut(ind.bb.lower) },
    stoch: { k: cut(ind.stoch.k), d: cut(ind.stoch.d) },
  };
}

// ═══════════════════════════ ตัวช่วยเล็ก ๆ / สถิติ ═══════════════════════════

/** PRNG ที่ให้ผลเดิมทุกครั้ง — ลอกจาก mulberry32 ใน lab.mjs */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentileOfSorted(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Φ(z) — Zelen & Severo 26.2.17 คลาดเคลื่อน < 1.5e-7 พอสำหรับ p-value ในรายงาน */
function normalCdf(z) {
  const s = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
    + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + s * y);
}

/**
 * bootstrap ช่วงความเชื่อมั่นแบบ cluster ตาม symbol
 *
 * ทำไมต้อง cluster: ไม้ใน symbol เดียวกันไม่เป็นอิสระต่อกันเลย (ตลาดเดียว เทรนด์เดียว)
 * การสุ่มราย-ไม้จึงให้ช่วงที่แคบเกินจริงมาก และทำให้กฎที่ "บังเอิญเข้าทางทองคำ"
 * ดูเหมือนมีนัยสำคัญทั้งที่หลักฐานมาจากสินทรัพย์เดียว
 *
 * p-value สองหาง = 2 × min(สัดส่วนที่ค่าเฉลี่ยจำลอง ≤ 0, สัดส่วนที่ ≥ 0) หนีบไว้ที่ 1
 * และมี pTTestCluster (คลาสสิก cluster-robust) ไว้เทียบว่าสองวิธีเห็นตรงกันไหม
 */
function bootstrapClusterStats(trades, { B, seed }) {
  if (!trades.length) return null;

  const clusters = new Map();
  for (const t of trades) {
    let e = clusters.get(t.symbol);
    if (!e) { e = { sum: 0, count: 0, values: [] }; clusters.set(t.symbol, e); }
    e.sum += t.rNet;
    e.count++;
    e.values.push(t.rNet);
  }
  const keys = [...clusters.keys()];
  const sums = keys.map((k) => clusters.get(k).sum);
  const cnts = keys.map((k) => clusters.get(k).count);
  const G = keys.length;

  const rnd = mulberry32(seed);
  const means = new Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    let c = 0;
    for (let g = 0; g < G; g++) {
      const pick = (rnd() * G) | 0;
      s += sums[pick];
      c += cnts[pick];
    }
    means[b] = c > 0 ? s / c : 0;
  }
  means.sort((a, b) => a - b);

  let le0 = 0;
  let ge0 = 0;
  for (const m of means) { if (m <= 0) le0++; if (m >= 0) ge0++; }
  const pBoot = Math.min(1, 2 * Math.min(le0 / B, ge0 / B));

  // cluster-robust t-test: Var(mean) ≈ G/(G−1) × Σ_g (Σ_i (r_i − mean))² / N²
  const N = trades.length;
  const mean = trades.reduce((a, t) => a + t.rNet, 0) / N;
  let ss = 0;
  for (const k of keys) {
    let sg = 0;
    for (const v of clusters.get(k).values) sg += v - mean;
    ss += sg * sg;
  }
  let pT = null;
  let z = null;
  if (G > 1 && ss > 0) {
    const varMean = (G / (G - 1)) * ss / (N * N);
    const se = Math.sqrt(varMean);
    if (se > 0) {
      z = mean / se;
      pT = 2 * (1 - normalCdf(Math.abs(z)));
    }
  }

  return {
    B,
    clusters: G,
    lo95: percentileOfSorted(means, 0.025),
    hi95: percentileOfSorted(means, 0.975),
    median: percentileOfSorted(means, 0.5),
    pLE0: le0 / B,
    pTwoTailed: pBoot,
    pTTestCluster: pT,
    zCluster: z,
  };
}

const n4 = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const pctS = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

// ═══════════════════════════ โหลดข้อมูล + เส้นแบ่ง ═══════════════════════════

function cacheFileFor(market, symbol, timeframe) {
  return path.join(CACHE_DIR, `${market}__${symbol}__${timeframe}.json`);
}

/** อ่านแคชแล้วทำให้เป็นรูปแบบเดียว: มี ts (ms) ติดมาด้วยเพื่อไม่ต้อง parse ซ้ำในลูปร้อน */
function loadRawBars(market, symbol, timeframe) {
  const file = cacheFileFor(market, symbol, timeframe);
  if (!fs.existsSync(file)) throw new Error(`ไม่พบแคช ${file}`);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bars = j.candles.map((c) => ({
    timestamp: c.timestamp,
    ts: Date.parse(c.timestamp),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
  for (let i = 0; i < bars.length; i++) {
    if (!Number.isFinite(bars[i].ts)) throw new Error(`${file}: timestamp อ่านไม่ออกที่แท่ง ${i}`);
    if (i > 0 && bars[i].ts <= bars[i - 1].ts) {
      throw new Error(`${file}: timestamp ไม่เรียงจากน้อยไปมากที่แท่ง ${i}`);
    }
  }
  return bars;
}

/**
 * เส้นแบ่ง train/validation/test
 * ใช้ไฟล์ที่ lab.mjs เขียนไว้เป็นหลัก — เส้นแบ่งต้องนิ่งและเป็นตัวเดียวกันทั้งงานวิจัย
 * ถ้าไม่มีไฟล์ค่อยคำนวณเองด้วยสัดส่วนเดียวกัน (ควอนไทล์ของแท่งทั้งจักรวาล แยกตาม TF)
 */
function loadSplitBoundaries(timeframes) {
  if (fs.existsSync(SPLIT_FILE)) {
    const j = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
    if (JSON.stringify(j.ratios) === JSON.stringify(SPLIT_RATIOS)) {
      const missing = timeframes.filter((tf) => !j.timeframes?.[tf]);
      if (!missing.length) return { source: SPLIT_FILE, ...j };
    }
  }
  const out = { source: 'computed', ratios: SPLIT_RATIOS, timeframes: {} };
  for (const tf of timeframes) {
    const times = [];
    for (const u of UNIVERSE) {
      for (const b of loadRawBars(u.market, u.symbol, tf)) times.push(b.ts);
    }
    times.sort((a, b) => a - b);
    const n = times.length;
    if (!n) throw new Error(`ไม่มีแท่งเลยสำหรับ ${tf} — คำนวณเส้นแบ่งไม่ได้`);
    const iTrain = Math.floor(n * SPLIT_RATIOS.train);
    const iVal = Math.floor(n * (SPLIT_RATIOS.train + SPLIT_RATIOS.validation));
    out.timeframes[tf] = {
      bars: n,
      first: new Date(times[0]).toISOString(),
      last: new Date(times[n - 1]).toISOString(),
      trainEnd: new Date(times[iTrain]).toISOString(),
      validationEnd: new Date(times[iVal]).toISOString(),
      barsTrain: iTrain,
      barsValidation: iVal - iTrain,
      barsTest: n - iVal,
    };
  }
  return out;
}

function measurableCutMs(bounds, timeframe) {
  const b = bounds.timeframes?.[timeframe];
  if (!b) throw new Error(`เส้นแบ่งไม่มีกรอบเวลา ${timeframe}`);
  const cut = Date.parse(b.validationEnd);
  if (!Number.isFinite(cut)) throw new Error(`validationEnd ของ ${timeframe} อ่านไม่ออก`);
  return cut;
}

/**
 * guard ชุด test — เรียกทุกครั้งก่อนใช้ bars ชุดไหนก็ตาม
 *
 * ป้องกันสองชั้น: (1) ตัดแท่ง test ทิ้งตั้งแต่ตอนโหลด แท่งพวกนั้นจึงไม่เคยอยู่ในหน่วยความจำ
 * (2) ตัวนี้ throw ถ้ายังมีหลุดมา — ไม่ console.warn เพราะคำเตือนที่ไม่หยุดโปรแกรม
 * จะถูกกลืนไปกับ log อื่นแล้วผลที่ปนเปื้อนก็ไหลเข้ารายงานเหมือนไม่มีอะไรเกิดขึ้น
 */
function assertNoTestBars(bars, timeframe, bounds, where) {
  const cut = measurableCutMs(bounds, timeframe);
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].ts >= cut) {
      throw new Error(
        `[guard/test-set] ${where}: แท่งที่ ${i} (${bars[i].timestamp}) อยู่ในชุด test ของ ${timeframe} `
        + `— ขอบเขตที่วัดได้คือก่อน ${new Date(cut).toISOString()} เท่านั้น`
      );
    }
  }
  return true;
}

/** ตัดชุดให้เหลือเฉพาะ train + validation แล้วผ่าน guard ทันที */
function loadMeasurableDataset(market, symbol, timeframe, bounds) {
  const cut = measurableCutMs(bounds, timeframe);
  const all = loadRawBars(market, symbol, timeframe);
  const bars = all.filter((b) => b.ts < cut);
  assertNoTestBars(bars, timeframe, bounds, `${market}/${symbol}/${timeframe}`);
  return { market, symbol, timeframe, bars, droppedTestBars: all.length - bars.length };
}

// ═══════════════════════════════ การจับคู่ HTF ═══════════════════════════════

/**
 * ดัชนีแท่ง 1D ล่าสุดที่ "ปิดครบวันแล้ว" ก่อนเวลาของแท่ง 1H — คืน -1 ถ้าไม่มี
 *
 * เงื่อนไข ts_day + 1 วัน <= ts_hour ไม่ใช่แค่ ts_day < ts_hour เพราะ timestamp ของ
 * แท่งวันคือ "เวลาเปิด" ของวันนั้น แท่งวันเดียวกันจึงมี timestamp น้อยกว่าแท่ง 1H
 * ตอนบ่ายเสมอ ทั้งที่วันนั้นยังไม่จบ การใช้ < เฉย ๆ คือการเอา high/low/close ของทั้งวัน
 * ไปตัดสินใจตอนสิบโมงเช้า ซึ่งเป็นการมองอนาคตแบบที่หาไม่เจอด้วยตาเปล่า
 */
function findHtfIndex(dayTs, hourTs) {
  let lo = 0;
  let hi = dayTs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dayTs[mid] + DAY_MS <= hourTs) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

// ═══════════════════════════════ การเดินไม้ ═══════════════════════════════

/**
 * เดินไม้หนึ่งไม้จากสัญญาณที่แท่ง signalIdx
 *
 * · เข้าที่ราคาเปิดของแท่งถัดไป ไม่ใช่ราคาปิดของแท่งสัญญาณ — ราคาปิดคือราคาที่เรา
 *   "เพิ่งรู้" ตอนแท่งจบ ซึ่งในโลกจริงส่งคำสั่งทันไม่ได้แล้ว
 * · SL ชนะเมื่อแท่งเดียวแตะทั้งคู่ (อนุรักษ์นิยม ตรงกับ scripts/resolve-signals.mjs)
 * · ตัวหารของ R คือระยะ SL ที่วางแผนไว้ตอนเข้า ไม่ใช่ระยะจริงหลังราคากระโดด
 *
 * @returns {object|null} null = เปิดไม้ไม่ได้ (ไม่มีแท่งถัดไป / ATR ใช้ไม่ได้)
 */
function simulateTrade(bars, signalIdx, side, atrAtSignal, symbol, market, maxHold) {
  const entryIdx = signalIdx + 1;
  if (entryIdx >= bars.length) return null;
  if (!Number.isFinite(atrAtSignal) || !(atrAtSignal > 0)) return null;

  const entry = bars[entryIdx].open;
  if (!Number.isFinite(entry)) return null;

  const isLong = side === 'long';
  const risk = SL_ATR_MULT * atrAtSignal;
  const stop = isLong ? entry - risk : entry + risk;
  const target = isLong ? entry + RR_TARGET * risk : entry - RR_TARGET * risk;
  if (!(risk > 0)) return null;

  const lastIdx = Math.min(entryIdx + maxHold - 1, bars.length - 1);
  let exitPrice = null;
  let exitReason = null;
  let exitIdx = lastIdx;
  let mfe = -Infinity;
  let mae = Infinity;

  for (let i = entryIdx; i <= lastIdx; i++) {
    const b = bars[i];
    const favour = isLong ? (b.high - entry) / risk : (entry - b.low) / risk;
    const adverse = isLong ? (b.low - entry) / risk : (entry - b.high) / risk;
    if (favour > mfe) mfe = favour;
    if (adverse < mae) mae = adverse;

    const hitStop = isLong ? b.low <= stop : b.high >= stop;
    const hitTarget = isLong ? b.high >= target : b.low <= target;

    if (hitStop) { exitPrice = stop; exitReason = 'sl'; exitIdx = i; break; }
    if (hitTarget) { exitPrice = target; exitReason = 'tp'; exitIdx = i; break; }
  }

  if (exitPrice === null) {
    // ไม่จบในเพดาน (หรือข้อมูลหมดก่อน) → ปิดที่ราคาปิดของแท่งสุดท้ายที่เดินถึง
    exitPrice = bars[lastIdx].close;
    exitReason = lastIdx === entryIdx + maxHold - 1 ? 'timeout' : 'dataEnd';
    exitIdx = lastIdx;
  }

  const rawR = isLong ? (exitPrice - entry) / risk : (entry - exitPrice) / risk;
  const costR = costRFor(entry, stop, symbol, market);
  if (costR === null) return null;

  return {
    symbol,
    market,
    side,
    signalIdx,
    entryIdx,
    exitIdx,
    entryTime: bars[entryIdx].timestamp,
    exitTime: bars[exitIdx].timestamp,
    entry,
    stop,
    target,
    risk,
    exitPrice,
    exitReason,
    barsHeld: exitIdx - entryIdx + 1,
    rawR,
    costR,
    rNet: rawR - costR,
    mfeR: Number.isFinite(mfe) ? mfe : null,
    maeR: Number.isFinite(mae) ? mae : null,
  };
}

// ═══════════════════════════════ การโหลดกฎ ═══════════════════════════════

async function loadRules(filter) {
  if (!fs.existsSync(RULES_DIR)) throw new Error(`ไม่พบโฟลเดอร์กฎ ${RULES_DIR}`);
  const files = fs.readdirSync(RULES_DIR).filter((f) => f.endsWith('.mjs')).sort();
  const out = [];
  for (const f of files) {
    const slug = f.replace(/\.mjs$/, '');
    if (filter && !filter.includes(slug)) continue;
    const mod = await import(pathToFileURL(path.join(RULES_DIR, f)).href);
    if (!mod.meta || typeof mod.evaluate !== 'function') {
      throw new Error(`${f}: ต้อง export ทั้ง meta และ evaluate`);
    }
    if (mod.meta.id !== slug) {
      throw new Error(`${f}: meta.id (${mod.meta.id}) ไม่ตรงกับชื่อไฟล์ (${slug})`);
    }
    if (!['confluence', 'mtf', 'structure'].includes(mod.meta.family)) {
      throw new Error(`${f}: meta.family ต้องเป็น confluence | mtf | structure`);
    }
    out.push({ slug, file: f, meta: mod.meta, evaluate: mod.evaluate });
  }
  if (filter) {
    const missing = filter.filter((s) => !out.some((r) => r.slug === s));
    if (missing.length) throw new Error(`ไม่พบกฎ: ${missing.join(', ')}`);
  }
  return out;
}

/** ผลลัพธ์ของ evaluate ต้องเป็นรูปนี้เท่านั้น — รับหลวม ๆ แล้วเจอปัญหาทีหลังแพงกว่า */
function assertVerdictShape(v, where) {
  if (!v || typeof v !== 'object') throw new Error(`${where}: evaluate ต้องคืน object`);
  if (typeof v.bull !== 'boolean' || typeof v.bear !== 'boolean') {
    throw new Error(`${where}: bull/bear ต้องเป็น boolean`);
  }
  if (!(v.veto === null || v.veto === 'bull' || v.veto === 'bear' || v.veto === 'both')) {
    throw new Error(`${where}: veto ต้องเป็น null | 'bull' | 'bear' | 'both'`);
  }
  if (typeof v.score !== 'number' || !Number.isFinite(v.score) || v.score < 0 || v.score > 1) {
    throw new Error(`${where}: score ต้องเป็นตัวเลข 0..1 (ได้ ${v.score})`);
  }
  return v;
}

function verdictEqual(a, b) {
  return a.bull === b.bull && a.bear === b.bear && a.veto === b.veto
    && (a.score === b.score || (Number.isNaN(a.score) && Number.isNaN(b.score)));
}

/**
 * ตรวจว่ากฎไม่แอบอ่านอนาคต — เรียกสองครั้งที่ดัชนี t เดียวกัน
 * ครั้งแรกด้วยชุดเต็ม ครั้งที่สองด้วย bars.slice(0, t+1) และ ind ที่ตัดปลายเท่ากัน
 */
function probeRuleCausality(rule, prepared, { samples = 30, seed = 1234567 } = {}) {
  const { bars, ind, htfFor } = prepared;
  const rnd = mulberry32(seed);
  const lo = Math.min(WARMUP_BARS + 250, Math.max(0, bars.length - 2));
  const span = Math.max(1, bars.length - 1 - lo);
  const failures = [];

  for (let s = 0; s < samples; s++) {
    const t = lo + ((rnd() * span) | 0);
    if (t < 0 || t >= bars.length) continue;

    const htfFull = htfFor ? htfFor(t) : null;
    const full = assertVerdictShape(
      rule.evaluate({ bars, t, ind, htf: htfFull }), `${rule.slug} @${t} (full)`);

    const cutBars = bars.slice(0, t + 1);
    const cutInd = sliceInd(ind, t);
    let cutHtf = null;
    if (htfFull) {
      cutHtf = {
        bars: htfFull.bars.slice(0, htfFull.t + 1),
        t: htfFull.t,
        ind: sliceInd(htfFull.ind, htfFull.t),
      };
    }
    const cut = assertVerdictShape(
      rule.evaluate({ bars: cutBars, t, ind: cutInd, htf: cutHtf }), `${rule.slug} @${t} (cut)`);

    if (!verdictEqual(full, cut)) {
      failures.push({ t, full, cut });
      if (failures.length >= 3) break;
    }
  }
  return failures;
}

// ═══════════════════════════════ ลูปหลัก ═══════════════════════════════

/**
 * เตรียมชุดข้อมูลหนึ่งชุด: bars ที่ตัด test ทิ้งแล้ว + อินดิเคเตอร์ + ตัวจับคู่ HTF
 *
 * ⚠ HTF ถูกตัดที่ validationEnd ของ "กรอบเวลาที่กำลังวัด" ไม่ใช่ของตัวมันเอง
 *   เพราะแท่ง 1H ทั้งชุดอยู่ในยุคหลัง validationEnd ของ 1D (1H ย้อนได้แค่ ~730 วัน)
 *   ถ้าตัด 1D ที่เส้นของ 1D เอง จะไม่เหลือแท่ง HTF ให้ใช้เลยแม้แต่แท่งเดียว
 *   ผลข้างเคียงที่ต้องรู้: บริบท 1D ที่กฎ mtf เห็น เป็นแท่งที่อยู่ในช่วง test ของ 1D
 *   — ไม่ใช่การมองอนาคตของไม้ 1H (ยังผ่านเงื่อนไข +1 วันเสมอ) แต่แปลว่าห้ามเอาผล
 *   1H ที่ได้จากกฎ mtf ไปอ้างว่าชุด test ของ 1D ยังบริสุทธิ์อยู่ ดู overlaps ใน split.json
 */
function prepareDataset(u, tf, bounds, cache) {
  const key = `${u.market}__${u.symbol}__${tf}`;
  if (cache.has(key)) return cache.get(key);

  const ds = loadMeasurableDataset(u.market, u.symbol, tf, bounds);
  assertNoTestBars(ds.bars, tf, bounds, `prepare ${key}`);
  const ind = computeIndicators(ds.bars);

  let htfFor = null;
  let htfInfo = null;
  if (tf === '1H') {
    const cut = measurableCutMs(bounds, '1H');
    const dayAll = loadRawBars(u.market, u.symbol, '1D').filter((b) => b.ts < cut);
    if (dayAll.length) {
      const dayInd = computeIndicators(dayAll);
      const dayTs = dayAll.map((b) => b.ts);
      htfInfo = { bars: dayAll.length, first: dayAll[0].timestamp, last: dayAll.at(-1).timestamp };
      htfFor = (t) => {
        const j = findHtfIndex(dayTs, ds.bars[t].ts);
        if (j < 0) return null;
        return { bars: dayAll, t: j, ind: dayInd };
      };
    }
  }

  const prepared = { ...ds, ind, htfFor, htfInfo };
  cache.set(key, prepared);
  return prepared;
}

function runRuleOnTimeframe(rule, tf, bounds, cache, opts) {
  const maxHold = MAX_HOLD_BARS[tf];
  if (!maxHold) throw new Error(`ไม่ได้กำหนดเพดานถือของกรอบเวลา ${tf}`);

  const trades = [];
  let signals = 0;
  let conflicts = 0;
  let vetoed = 0;
  let skippedNoAtr = 0;
  const perSymbol = new Map();

  for (const u of UNIVERSE) {
    const ds = prepareDataset(u, tf, bounds, cache);
    // guard ชั้นที่สอง — เรียกซ้ำก่อนเดินลูปจริง เผื่อมีใครแก้ prepareDataset ในอนาคต
    assertNoTestBars(ds.bars, tf, bounds, `run ${rule.slug} ${u.symbol}/${tf}`);

    const { bars, ind } = ds;
    const last = bars.length - 2; // ต้องมีแท่งถัดไปให้เข้าไม้เสมอ
    let sym = 0;

    for (let t = WARMUP_BARS; t <= last; t++) {
      const htf = ds.htfFor ? ds.htfFor(t) : null;
      if (rule.meta.needsHtf && !htf) continue;

      const v = assertVerdictShape(
        rule.evaluate({ bars, t, ind, htf }), `${rule.slug} ${u.symbol}/${tf} @${t}`);

      const bull = v.bull && v.veto !== 'bull' && v.veto !== 'both';
      const bear = v.bear && v.veto !== 'bear' && v.veto !== 'both';
      if ((v.bull && !bull) || (v.bear && !bear)) vetoed++;
      if (!bull && !bear) continue;
      if (bull && bear) { conflicts++; continue; } // กฎขัดแย้งกับตัวเอง — ไม่เดาให้
      signals++;

      const trade = simulateTrade(
        bars, t, bull ? 'long' : 'short', ind.atr[t], u.symbol, u.market, maxHold);
      if (!trade) { skippedNoAtr++; continue; }

      // guard ชั้นที่สาม — แท่งทางออกต้องยังอยู่ในชุดที่วัดได้
      if (trade.exitIdx >= bars.length) {
        throw new Error(`[guard/test-set] ${rule.slug}: ทางออกของไม้หลุดออกนอกชุดที่วัดได้`);
      }
      trade.score = v.score;
      trades.push(trade);
      sym++;
    }
    perSymbol.set(u.symbol, sym);
  }

  const n = trades.length;
  const sumR = trades.reduce((a, t) => a + t.rNet, 0);
  const sumRaw = trades.reduce((a, t) => a + t.rawR, 0);
  const sumCost = trades.reduce((a, t) => a + t.costR, 0);
  const wins = trades.filter((t) => t.rNet > 0).length;
  const byExit = {};
  for (const t of trades) byExit[t.exitReason] = (byExit[t.exitReason] ?? 0) + 1;

  return {
    rule: rule.slug,
    name: rule.meta.name,
    family: rule.meta.family,
    needsHtf: rule.meta.needsHtf === true,
    params: rule.meta.params ?? {},
    timeframe: tf,
    split: 'train+validation',
    measuredBefore: new Date(measurableCutMs(bounds, tf)).toISOString(),
    signals,
    conflicts,
    vetoed,
    skippedNoAtr,
    trades: n,
    avgR: n ? sumR / n : null,
    avgRawR: n ? sumRaw / n : null,
    avgCostR: n ? sumCost / n : null,
    winRate: n ? wins / n : null,
    totalR: sumR,
    avgBarsHeld: n ? trades.reduce((a, t) => a + t.barsHeld, 0) / n : null,
    byExit,
    tradesPerSymbol: Object.fromEntries(perSymbol),
    ci: bootstrapClusterStats(trades, { B: opts.bootstrap, seed: opts.seed }),
  };
}

// ═══════════════════════════════ self-test ═══════════════════════════════

const approxEq = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function seriesEqual(a, b, upto, label, out) {
  for (let i = 0; i <= upto; i++) {
    const x = a[i];
    const y = b[i];
    const bothNaN = Number.isNaN(x) && Number.isNaN(y);
    if (!bothNaN && !(x === y)) {
      out.push(`${label}: ดัชนี ${i} ไม่ตรง (${x} != ${y})`);
      return false;
    }
  }
  return true;
}

function flattenInd(ind) {
  return {
    rsi: ind.rsi, ma50: ind.ma50, ma200: ind.ma200, atr: ind.atr, adx: ind.adx,
    volumeRatio: ind.volumeRatio,
    'macd.macdLine': ind.macd.macdLine,
    'macd.signalLine': ind.macd.signalLine,
    'macd.histogram': ind.macd.histogram,
    'bb.upper': ind.bb.upper, 'bb.middle': ind.bb.middle, 'bb.lower': ind.bb.lower,
    'stoch.k': ind.stoch.k, 'stoch.d': ind.stoch.d,
  };
}

async function selfTest(opts) {
  const checks = [];
  const add = (name, pass, detail) => { checks.push({ name, pass, detail: detail ?? null }); };

  const bounds = loadSplitBoundaries(['1D', '1H']);

  // ── 1. causality ของอินดิเคเตอร์ ── ค่าที่ดัชนี 44 จาก 45 แท่ง = จาก 60 แท่ง
  {
    const ds = loadMeasurableDataset('GOLD', 'XAUUSD', '1D', bounds);
    const a = computeIndicators(ds.bars.slice(0, 45));
    const b = computeIndicators(ds.bars.slice(0, 60));
    const errs = [];
    const fa = flattenInd(a);
    const fb = flattenInd(b);
    for (const k of Object.keys(fa)) seriesEqual(fa[k], fb[k], 44, k, errs);
    add('indicator-causality-45-vs-60', errs.length === 0, errs.slice(0, 5).join(' · ') || undefined);
  }

  // ── 1b. causality บนข้อมูลจริงที่ลึกกว่านั้น (กันเคสที่ 45 แท่งยังไม่พ้นช่วงอุ่นเครื่อง) ──
  {
    const ds = loadMeasurableDataset('FOREX', 'EURUSD', '1H', bounds);
    const errs = [];
    const full = computeIndicators(ds.bars);
    for (const k of [300, 777, 1500, 4000]) {
      if (k >= ds.bars.length) continue;
      const cut = computeIndicators(ds.bars.slice(0, k + 1));
      const ff = flattenInd(full);
      const fc = flattenInd(cut);
      for (const name of Object.keys(ff)) seriesEqual(ff[name], fc[name], k, `${name}@${k}`, errs);
    }
    add('indicator-causality-deep', errs.length === 0, errs.slice(0, 5).join(' · ') || undefined);
  }

  // ── 1c. series ที่กางจากฟังก์ชัน "ค่าเดียว" ต้องเท่ากับต้นฉบับที่เรียกทีละดัชนี ──
  {
    const ds = loadMeasurableDataset('GOLD', 'XAGUSD', '1D', bounds);
    const bars = ds.bars.slice(0, 400);
    const atrS = ATRSeries(bars, ATR_PERIOD);
    const volS = volumeRatioSeries(bars, 20);
    const errs = [];
    for (let i = 0; i < bars.length; i++) {
      const ref = ATRScalar(bars.slice(0, i + 1), ATR_PERIOD);
      const got = atrS[i];
      if (!((Number.isNaN(ref) && Number.isNaN(got)) || approxEq(ref, got, 1e-9))) {
        errs.push(`ATR ดัชนี ${i}: ${got} != ${ref}`);
      }
      const rv = volumeRatioScalar(bars.slice(0, i + 1), 20);
      const gv = volS[i];
      if (!((Number.isNaN(rv) && Number.isNaN(gv)) || approxEq(rv, gv, 1e-9))) {
        errs.push(`volumeRatio ดัชนี ${i}: ${gv} != ${rv}`);
      }
      if (errs.length >= 3) break;
    }
    add('indicator-series-matches-source', errs.length === 0, errs.join(' · ') || undefined);
  }

  // ── 2. การจับคู่ HTF ไม่มองอนาคต ──
  {
    const cut = measurableCutMs(bounds, '1H');
    const hour = loadMeasurableDataset('FOREX', 'GBPJPY', '1H', bounds).bars;
    const day = loadRawBars('FOREX', 'GBPJPY', '1D').filter((b) => b.ts < cut);
    const dayTs = day.map((b) => b.ts);
    const errs = [];
    let paired = 0;
    const rnd = mulberry32(9876543);
    for (let s = 0; s < 500; s++) {
      const t = (rnd() * hour.length) | 0;
      const j = findHtfIndex(dayTs, hour[t].ts);
      if (j < 0) continue;
      paired++;
      // เงื่อนไขหลัก: แท่งวันที่เลือก + 1 วัน ต้องไม่เกินเวลาแท่ง 1H
      if (!(dayTs[j] + DAY_MS <= hour[t].ts)) {
        errs.push(`@${t}: ${day[j].timestamp} + 1 วัน > ${hour[t].timestamp}`);
      }
      // และต้องเป็นแท่งล่าสุดที่ใช้ได้ — แท่งถัดไปต้องละเมิดเงื่อนไขแล้ว
      if (j + 1 < dayTs.length && dayTs[j + 1] + DAY_MS <= hour[t].ts) {
        errs.push(`@${t}: ยังมีแท่งวันที่ใหม่กว่าใช้ได้อยู่ (${day[j + 1].timestamp})`);
      }
      if (errs.length >= 3) break;
    }
    add('htf-pairing-no-lookahead', errs.length === 0 && paired > 100,
      errs.slice(0, 3).join(' · ') || (paired <= 100 ? `จับคู่ได้แค่ ${paired} ครั้ง` : undefined));
  }

  // ── 3. guard ของชุด test ต้อง throw เมื่อจงใจป้อนช่วงที่กินเข้า test ──
  {
    let threw = false;
    let detail;
    try {
      // ชุดดิบ (ไม่ตัด) ของ 1D ยืดถึง 2026 ซึ่งเลย validationEnd ของ 1D ไปไกล
      assertNoTestBars(loadRawBars('GOLD', 'XAUUSD', '1D'), '1D', bounds, 'self-test');
    } catch (e) {
      threw = /guard\/test-set/.test(String(e.message));
      detail = String(e.message).slice(0, 120);
    }
    add('test-set-guard-throws', threw, threw ? undefined : `ไม่ throw — ${detail ?? 'เงียบไปเฉย ๆ'}`);

    // และต้อง "ไม่" throw กับชุดที่ตัดแล้ว ไม่งั้น guard เข้มเกินจนวัดอะไรไม่ได้
    let ok = true;
    try { assertNoTestBars(loadMeasurableDataset('GOLD', 'XAUUSD', '1D', bounds).bars, '1D', bounds, 'self-test'); }
    catch { ok = false; }
    add('test-set-guard-allows-measurable', ok);
  }

  // ── 4. ตัวคิด R — เคสที่รู้คำตอบด้วยมือ ──
  {
    // entry 100 · ATR 2 → risk 4.5? ไม่ใช่ — SL_ATR_MULT 1.5 × 2 = 3 · TP = 2 × 3 = 6
    // FOREX/EURUSD 1.5 bps → cost_R = (1.5/10000 × 100) / 3 = 0.005
    const mk = (rows) => rows.map((r, i) => ({
      timestamp: new Date(Date.UTC(2020, 0, 1 + i)).toISOString(),
      ts: Date.UTC(2020, 0, 1 + i),
      open: r[0], high: r[1], low: r[2], close: r[3], volume: 0,
    }));
    const errs = [];
    const chk = (label, got, wantRaw, wantReason) => {
      if (!got) { errs.push(`${label}: ไม่ได้ไม้`); return; }
      if (!approxEq(got.rawR, wantRaw, 1e-9)) errs.push(`${label}: rawR ${got.rawR} != ${wantRaw}`);
      if (!approxEq(got.costR, 0.005, 1e-12)) errs.push(`${label}: costR ${got.costR} != 0.005`);
      if (!approxEq(got.rNet, wantRaw - 0.005, 1e-9)) errs.push(`${label}: rNet ผิด`);
      if (got.exitReason !== wantReason) errs.push(`${label}: exitReason ${got.exitReason} != ${wantReason}`);
    };

    // A: long ชน TP (106) → rawR = +2
    chk('A/long-tp', simulateTrade(
      mk([[99, 99, 99, 99], [100, 101, 99.5, 100], [100, 107, 100, 106.5]]),
      0, 'long', 2, 'EURUSD', 'FOREX', 20), 2, 'tp');

    // B: long ชน SL (97) → rawR = −1
    chk('B/long-sl', simulateTrade(
      mk([[99, 99, 99, 99], [100, 101, 99.5, 100], [100, 101, 96, 96.5]]),
      0, 'long', 2, 'EURUSD', 'FOREX', 20), -1, 'sl');

    // C: แท่งเดียวแตะทั้งคู่ → SL ชนะเสมอ → rawR = −1
    chk('C/both-sl-wins', simulateTrade(
      mk([[99, 99, 99, 99], [100, 101, 99.5, 100], [100, 107, 96, 103]]),
      0, 'long', 2, 'EURUSD', 'FOREX', 20), -1, 'sl');

    // D: ครบเพดาน 2 แท่งโดยไม่โดนอะไร → ปิดที่ปิดของแท่งที่สอง (101.5) → rawR = +0.5
    chk('D/timeout', simulateTrade(
      mk([[99, 99, 99, 99], [100, 101, 99.5, 100], [100, 102, 99, 101.5], [1, 1, 1, 1]]),
      0, 'long', 2, 'EURUSD', 'FOREX', 2), 0.5, 'timeout');

    // E: short ชน TP (94) → rawR = +2
    chk('E/short-tp', simulateTrade(
      mk([[99, 99, 99, 99], [100, 100.5, 99, 100], [100, 100, 93, 93.5]]),
      0, 'short', 2, 'EURUSD', 'FOREX', 20), 2, 'tp');

    // F: ต้นทุนต้องแพงขึ้นเมื่อ SL แคบลง — ATR 0.2 → risk 0.3 → cost_R = 0.05
    const f = simulateTrade(
      mk([[99, 99, 99, 99], [100, 100.1, 99.9, 100], [100, 100.7, 99.9, 100.65]]),
      0, 'long', 0.2, 'EURUSD', 'FOREX', 20);
    if (!f || !approxEq(f.costR, 0.05, 1e-12)) errs.push(`F/cost-scales: costR ${f && f.costR} != 0.05`);

    // G: ทองคำ 3 bps บน entry 2000 กับ risk 3 → cost_R = (3/10000 × 2000)/3 = 0.2
    const g = simulateTrade(
      mk([[1999, 1999, 1999, 1999], [2000, 2001, 1999, 2000], [2000, 2007, 2000, 2006.5]]),
      0, 'long', 2, 'XAUUSD', 'GOLD', 20);
    if (!g || !approxEq(g.costR, 0.2, 1e-12)) errs.push(`G/gold-cost: costR ${g && g.costR} != 0.2`);

    add('r-math-known-cases', errs.length === 0, errs.slice(0, 4).join(' · ') || undefined);
  }

  // ── 5. causality ของกฎทุกข้อที่โหลดได้ ──
  {
    const rules = await loadRules(opts.rules);
    const cache = new Map();
    const errs = [];
    if (!rules.length) errs.push('ไม่มีกฎให้ตรวจเลย');
    for (const rule of rules) {
      for (const tf of opts.timeframes) {
        const ds = prepareDataset({ market: 'FOREX', symbol: 'EURUSD' }, tf, bounds, cache);
        const f = probeRuleCausality(rule, ds, { samples: 60, seed: 424242 });
        if (f.length) errs.push(`${rule.slug}/${tf}: ต่างกันที่ดัชนี ${f.map((x) => x.t).join(',')}`);
      }
    }
    add('rule-causality', errs.length === 0, errs.slice(0, 4).join(' · ') || undefined);
  }

  const passed = checks.every((c) => c.pass);
  return { passed, checks };
}

// ═══════════════════════════════ CLI ═══════════════════════════════

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function printSummaryTable(rows) {
  const W = { rule: 26, tf: 4, n: 7, avg: 9, win: 8, tot: 11, ci: 21, p: 8 };
  console.log('');
  console.log(`${pad('กฎ', W.rule)} ${pad('TF', W.tf)} ${padL('ไม้', W.n)} ${padL('avg R', W.avg)}`
    + ` ${padL('ชนะ', W.win)} ${padL('R รวม', W.tot)} ${padL('CI95 (cluster)', W.ci)} ${padL('p', W.p)}`);
  console.log('─'.repeat(W.rule + W.tf + W.n + W.avg + W.win + W.tot + W.ci + W.p + 7));
  for (const r of rows) {
    const ci = r.ci ? `[${n4(r.ci.lo95)}, ${n4(r.ci.hi95)}]` : 'n/a';
    const p = r.ci ? n4(r.ci.pTwoTailed, 4) : 'n/a';
    console.log(`${pad(r.rule.slice(0, W.rule), W.rule)} ${pad(r.timeframe, W.tf)}`
      + ` ${padL(r.trades, W.n)} ${padL(n4(r.avgR), W.avg)} ${padL(pctS(r.winRate), W.win)}`
      + ` ${padL(n4(r.totalR, 2), W.tot)} ${padL(ci, W.ci)} ${padL(p, W.p)}`);
  }
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
rule-lab.mjs — วัดกฎเทรดทีละข้อบน train+validation

  --rules=a,b,c        เลือกกฎ (ค่าเริ่มต้น = ทุกไฟล์ใน scripts/research/rules/)
  --timeframes=1D,1H   กรอบเวลา (ค่าเริ่มต้น 1D,1H)
  --bootstrap=2000     จำนวนรอบ bootstrap
  --seed=20260817      เมล็ด PRNG
  --json               พิมพ์ JSON แทนตาราง
  --self-test          ตรวจความถูกต้องของท่อทั้งท่อ แล้ว exit != 0 ถ้าไม่ผ่าน
`);
    return 0;
  }

  const timeframes = String(args.timeframes ?? '1D,1H').split(',').map((s) => s.trim()).filter(Boolean);
  for (const tf of timeframes) {
    if (!MAX_HOLD_BARS[tf]) throw new Error(`ไม่รองรับกรอบเวลา ${tf} (มีแค่ ${Object.keys(MAX_HOLD_BARS).join(', ')})`);
  }
  const ruleFilter = args.rules ? String(args.rules).split(',').map((s) => s.trim()).filter(Boolean) : null;
  const opts = {
    timeframes,
    rules: ruleFilter,
    bootstrap: Number(args.bootstrap ?? 2000),
    seed: Number(args.seed ?? 20260817) >>> 0,
  };

  if (args['self-test']) {
    const res = await selfTest(opts);
    console.log('\n── self-test ──');
    for (const c of res.checks) {
      console.log(`  ${c.pass ? 'ผ่าน  ' : 'ไม่ผ่าน'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
    }
    console.log(res.passed ? '\nself-test ผ่านครบทุกข้อ\n' : '\nself-test ไม่ผ่าน\n');
    return res.passed ? 0 : 1;
  }

  const t0 = Date.now();
  const bounds = loadSplitBoundaries(timeframes);
  const rules = await loadRules(ruleFilter);
  if (!rules.length) throw new Error(`ไม่มีกฎใน ${RULES_DIR}`);

  const cache = new Map();
  const rows = [];
  const excluded = [];

  for (const rule of rules) {
    let leaks = false;
    for (const tf of timeframes) {
      const probeDs = prepareDataset({ market: 'FOREX', symbol: 'EURUSD' }, tf, bounds, cache);
      const f = probeRuleCausality(rule, probeDs, { samples: 40, seed: opts.seed ^ 0x5bf03635 });
      if (f.length) {
        excluded.push({ rule: rule.slug, timeframe: tf, reason: 'causality', at: f.map((x) => x.t) });
        leaks = true;
      }
    }
    // กฎที่อ่านอนาคตถูกตัดออกทั้งตัว ไม่ใช่ตัดเฉพาะ TF ที่จับได้ — ถ้ามันโกงที่หนึ่ง
    // ตัวเลขจากอีกที่ก็เชื่อไม่ได้อยู่ดี
    if (leaks) continue;

    for (const tf of timeframes) rows.push(runRuleOnTimeframe(rule, tf, bounds, cache, opts));
  }

  const htfNote = timeframes.includes('1H') && rules.some((r) => r.meta.needsHtf)
    ? 'บริบท 1D ที่กฎ mtf เห็นบนกรอบ 1H เป็นแท่งที่อยู่ในช่วง test ของ 1D '
      + '(1H ย้อนได้แค่ ~730 วัน จึงไม่มีทางเลี่ยง) — ไม่ใช่การมองอนาคตของไม้ 1H '
      + 'แต่ห้ามอ้างว่าชุด test ของ 1D ยังไม่ถูกแตะ ดู overlaps ใน split.json'
    : null;

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    splitSource: bounds.source ?? SPLIT_FILE,
    splitRatios: bounds.ratios ?? SPLIT_RATIOS,
    measuredSplits: ['train', 'validation'],
    measuredBefore: Object.fromEntries(
      timeframes.map((tf) => [tf, new Date(measurableCutMs(bounds, tf)).toISOString()])),
    universe: UNIVERSE.map((u) => `${u.market}/${u.symbol}`),
    timeframes,
    tradeRules: {
      entry: 'ราคาเปิดของแท่งถัดไปจากแท่งสัญญาณ',
      slAtrMult: SL_ATR_MULT,
      atrPeriod: ATR_PERIOD,
      rr: RR_TARGET,
      maxHoldBars: MAX_HOLD_BARS,
      tieBreak: 'SL ชนะเมื่อแท่งเดียวแตะทั้ง SL และ TP',
      riskModel: 'planned (|entry − stop| ที่ล็อกตอนเข้า)',
      warmupBars: WARMUP_BARS,
    },
    costModel: { source: 'src/lib/costs.ts', bps: COST_BPS, formula: 'cost_R = (bps/10000 × |entry|) / |entry − stop|' },
    bootstrap: { B: opts.bootstrap, seed: opts.seed, cluster: 'symbol' },
    notes: [
      'ตัวเลขทุกตัวมาจาก train + validation เท่านั้น ชุด test ถูกตัดทิ้งตั้งแต่ตอนโหลด',
      'ต้นทุนใน COST_BPS เป็นการประมาณจากตารางค่าธรรมเนียมสาธารณะ ไม่ใช่ใบเสร็จจริง',
      'ไม่มีการปรับขนาดไม้/ทบต้น/จำกัดไม้พร้อมกัน ตัวเลขคือคุณภาพสัญญาณ ไม่ใช่ผลของพอร์ต',
      'p-value จาก bootstrap แบบ cluster ตาม symbol — ราย-ไม้จะแคบเกินจริงเพราะไม้ในตัวเดียวกันสัมพันธ์กัน',
      `pTwoTailed ละเอียดได้แค่ 1/${opts.bootstrap} — ค่า 0 อ่านว่า "< ${(1 / opts.bootstrap).toExponential(1)}" ไม่ใช่ศูนย์จริง `
        + 'ให้ดู pTTestCluster ประกอบว่าสองวิธีเห็นตรงกันไหม',
      `cluster มีแค่ ${UNIVERSE.length} ก้อน (เท่าจำนวน symbol) — CI แบบ cluster ที่ G น้อยขนาดนี้ยังกว้างไม่พอในทางทฤษฎี `
        + 'ให้ถือว่าเป็นขอบล่างของความไม่แน่นอน ไม่ใช่ค่าที่แม่นแล้ว',
      ...(htfNote ? [htfNote] : []),
    ],
    excluded,
    results: rows,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nวัดบน train+validation · จักรวาล ${UNIVERSE.length} ตัว · กฎ ${rules.length} ข้อ`
      + ` · bootstrap ${opts.bootstrap} รอบ (cluster ตาม symbol, seed ${opts.seed})`);
    for (const tf of timeframes) {
      console.log(`  ${tf}: ใช้แท่งก่อน ${new Date(measurableCutMs(bounds, tf)).toISOString()}`);
    }
    printSummaryTable(rows);
    for (const r of rows) {
      console.log(`${r.rule} / ${r.timeframe}: สัญญาณ ${r.signals} · ไม้ ${r.trades}`
        + ` · avg raw ${n4(r.avgRawR)} − ต้นทุน ${n4(r.avgCostR)} = ${n4(r.avgR)} R`
        + ` · ถือเฉลี่ย ${n4(r.avgBarsHeld, 1)} แท่ง · ทางออก ${JSON.stringify(r.byExit)}`);
    }
    if (excluded.length) {
      console.log('\nกฎที่ถูกตัดออกเพราะอ่านอนาคต:');
      for (const e of excluded) console.log(`  ${e.rule} (${e.timeframe}) ที่ดัชนี ${e.at.join(',')}`);
    }
    if (htfNote) console.log(`\n⚠ ${htfNote}`);
    console.log(`\nเขียนผลลง ${OUT_FILE}\n`);
  }
  return 0;
}

main()
  .then((code) => { process.exitCode = code ?? 0; })
  .catch((e) => {
    console.error(`\nrule-lab ล้มเหลว: ${e.message}\n${e.stack ?? ''}`);
    process.exitCode = 1;
  });
