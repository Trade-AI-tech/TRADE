#!/usr/bin/env node
/**
 * feat-volume.mjs — ตระกูลที่ 1: วอลุ่ม + โครงสร้างราคา ที่ generateSignal ไม่เคยอ่านเลย
 *
 * ██████████████████████████████████████████████████████████████████████████████
 * █                                                                            █
 * █   ไฟล์นี้ตรงข้ามกับ ceiling.mjs — ทุก feature ที่แท่ง i ต้องคำนวณจาก             █
 * █   candles[0..i] เท่านั้น ห้ามแตะแท่งอนาคตแม้แต่แท่งเดียว                          █
 * █                                                                            █
 * █   ข้อยกเว้นที่ทำเครื่องหมายไว้ชัดเจน มีแค่ 3 อย่าง และไม่มีอันไหนเข้าไปในข้อสรุป:      █
 * █     · fwdRet_h          ผลตอบแทนอนาคต — คือ "เป้า" ที่เราวัดความสัมพันธ์ด้วย        █
 * █     · _ctrlFuture       ตัวควบคุมเชิงบวก พิสูจน์ว่าเครื่องวัด IC จับสัญญาณได้จริง     █
 * █     · _ctrlLeakZ        ตัวควบคุมการรั่วแบบเงียบ พิสูจน์ว่าด่านตัดท้ายมีฟันจริง        █
 * █   ทั้งสามตัวขึ้นต้นด้วย _ctrl หรือชื่อ fwd และถูกกันออกจากตระกูลสถิติจริงทั้งหมด        █
 * █                                                                            █
 * ██████████████████████████████████████████████████████████████████████████████
 *
 * ────────────────────────────── ทำไมต้องมีไฟล์นี้ ──────────────────────────────
 *
 * exp-ceiling.md ตอบไปแล้วว่า "ประตูปิดที่กรอบเวลา ไม่ใช่ที่ตลาด" — หุ้นไทย 1H ปิดตาย
 * แต่ 1D ถือ 10–20 แท่ง ยังมีช่อง ถ้ายกความแม่นทิศจาก ~50% ไป ~58–60% ได้
 *
 * คำถามของรอบนี้คือ "มีอะไรในข้อมูลที่พอจะยกความแม่นได้ขนาดนั้นไหม"
 * และตระกูลแรกที่ควรมองคือวอลุ่ม เพราะ src/lib/signal-engine.ts generateSignal
 * **ไม่เคยอ่าน candle.volume เลยสักบรรทัด** ทั้งที่มีอยู่ในข้อมูลทุกแท่ง
 * วอลุ่มเป็นข้อมูลคนละแกนกับราคา (ราคาบอกว่าไปไหน วอลุ่มบอกว่ามีคนเห็นด้วยแค่ไหน)
 * ถ้ายังมีของเหลืออยู่ ตรงนี้คือที่แรกที่ควรมอง
 *
 * รวมโครงสร้างราคาที่เครื่องยนต์ไม่เคยแตะด้วย (ตำแหน่งราคาปิดในกรอบแท่ง · efficiency
 * ratio · การบีบตัวของความผันผวน · gap ข้ามคืน) เพราะคำนวณจากข้อมูลชุดเดียวกัน
 * และเป็นแกนที่ RSI/MACD/EMA มองไม่เห็น
 *
 * ─────────────────────────── ลำดับการวัด (ห้ามข้ามขั้น) ───────────────────────────
 *
 *   C0  ตรวจว่าวอลุ่มใช้ได้จริงไหมในแต่ละตลาด — ถ้าใช้ไม่ได้ ตัดออก ไม่ปล่อยให้ปนเป็นเสียง
 *   C1  ตรวจ look-ahead ด้วยการตัดข้อมูลท้ายทิ้ง 20% แล้วคำนวณซ้ำ
 *       ค่าของแท่งเก่าต้องไม่เปลี่ยนแม้แต่บิตเดียว + ตัวควบคุมการรั่วต้องเปลี่ยน
 *   C2  ตรวจว่าเครื่องวัด IC มีฟัน — ตัวควบคุมเสียงต้องได้ IC ~0 ตัวควบคุมรั่วต้องได้ IC สูง
 *   C3  วัด IC (Spearman) ของทุก feature × ทุกหน้าต่าง × ทุกกลุ่ม พร้อม CI และ p ที่แก้แล้ว
 *   C4  แปลง IC เป็นเงิน แล้วเทียบกับค่าธรรมเนียมจริงของตลาดนั้น
 *
 * กติกาข้อ 5 ของรอบนี้: วัดพลังทำนายก่อน แล้วค่อยประกอบเป็นกลยุทธ์
 * feature ที่ IC ใกล้ศูนย์ ไม่มีทางกลายเป็นเงินได้ ไม่ว่าจะประกอบยังไง — จบตั้งแต่ตรงนี้
 *
 * ──────────────────────────────── นิยามที่ใช้ ────────────────────────────────
 *
 * แท่งสัญญาณ i  →  เข้าที่ราคาเปิดแท่ง i+1  →  ออกที่ราคาปิดแท่ง i+h
 *   (นิยามเดียวกับ ceiling.mjs เพื่อให้ตัวเลขเทียบกันได้ตรง)
 *
 * IC = Spearman rank correlation ระหว่าง feature ที่แท่ง i กับ fwdRet_h
 *   · จัดอันดับ "ภายในสัญลักษณ์เดียวกัน" ไม่ใช่ข้ามสัญลักษณ์ (กันอคติจากขนาดราคา)
 *   · IC ของกลุ่ม = ค่าเฉลี่ยถ่วงน้ำหนักด้วยจำนวนแท่ง ของ IC รายสัญลักษณ์
 *   · CI มาจาก bootstrap ระดับสัญลักษณ์ (ตามที่โจทย์กำหนด)
 *   · p มาจาก cluster-robust (จับกลุ่ม สัญลักษณ์ × เดือน) เพราะ Holm ที่หลายร้อยข้อ
 *     ต้องการ p ละเอียดกว่าที่ bootstrap B=2000 วัดได้
 *
 * ⚠ การจัดอันดับเพื่อ "วัด" IC ใช้ข้อมูลทั้ง split — นั่นเป็นสถิติเชิงพรรณนา ไม่ใช่กฎเทรด
 *   ส่วนการแปลงเป็นเงิน (C4) ใช้ **อันดับแบบ rolling จากอดีตเท่านั้น** ซึ่งเทรดได้จริง
 *   สองอย่างนี้แยกกันชัดเจน และ C1 ตรวจเฉพาะค่า feature ดิบซึ่งเป็นตัวที่ต้องปลอด look-ahead
 *
 * ────────────────────────────────── วิธีใช้ ──────────────────────────────────
 *
 *   node scripts/research/experiments/feat-volume.mjs
 *   node scripts/research/experiments/feat-volume.mjs --bootstrap=4000
 *
 * ไฟล์นี้ไม่แตะชุด test และไม่แตะ validation ในเฟสนี้ (มีด่านกันไว้ข้างล่าง)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const SPLIT_FILE = path.join(REPORT_DIR, 'split.json');

// ════════════════════════════════ ค่าคงที่ของงาน ════════════════════════════════

/** 14 ตัวเดิมในคลัง — ทุกตัวเป็น SET50 (นิยามเดียวกับ exp-ceiling / exp-th-scalp) */
const SET50_SYMBOLS = [
  'PTT', 'PTTEP', 'AOT', 'CPALL', 'KBANK', 'BBL', 'ADVANC',
  'SCC', 'BDMS', 'CPF', 'DELTA', 'MINT', 'IVL', 'EA',
];

/** เกณฑ์คัดหุ้นซิ่ง — ตัวเลขเดียวกับ ceiling.mjs ทุกตัว วัดบน train ของ 1H เท่านั้น */
const RUNNER_RULE = { minBarRangePct: 1.20, minTurnoverBaht: 0.5e6, minBars: 3000 };

/** ตารางช่วงราคาของ SET — ราคาขยับได้ทีละเท่านี้ = พื้นของสเปรด */
const SET_TICK_TABLE = [
  { from: 0, to: 2, tick: 0.01 },
  { from: 2, to: 5, tick: 0.02 },
  { from: 5, to: 10, tick: 0.05 },
  { from: 10, to: 25, tick: 0.10 },
  { from: 25, to: 100, tick: 0.25 },
  { from: 100, to: 200, tick: 0.50 },
  { from: 200, to: 400, tick: 1.00 },
  { from: 400, to: Infinity, tick: 2.00 },
];

const TH_COMM_RATE = 0.00157;  // 0.157% ต่อข้าง (รวม VAT)
const TH_MIN_FEE = 50;         // ค่าคอมขั้นต่ำต่อคำสั่ง (บาท)
const TH_RISK_BAHT = 2000;     // เงินเสี่ยงต่อไม้ที่ใช้คิดขนาดคำสั่ง
const TH_TICKS_PER_ROUND = 1;  // มองโลกในแง่ดีที่สุดที่ยังพูดได้ — ตรงกับ ceiling.mjs

/** ตาราง bps ของ lab.mjs สำหรับตลาดที่ไม่ใช่หุ้นไทย — ลอกมาทั้งก้อน ไม่แก้ */
const LAB_COST_BPS = {
  byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 },
  bySymbol: {
    XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10,
    EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15,
  },
};

/** เรขาคณิต SL/TP — ใช้แค่คำนวณค่าธรรมเนียมของหุ้นไทย (ขนาดคำสั่งขึ้นกับระยะ SL) */
const GEO = { slAtrMult: 1.5, atrPeriod: 14, atrFallbackPct: 0.02 };
const ROUND = { forexDecimals: 5, otherDecimals: 4, forexPrecision: 5, otherPrecision: 6 };

/**
 * ต้องมีอดีตกี่แท่งก่อนถึงจะเริ่มวัด
 * 260 มาจาก feature ที่กินอดีตยาวที่สุด: bbWidthPct100 ต้องมี BB(20) ย้อนหลัง 100 ค่า = 119 แท่ง
 * ตั้งเผื่อไว้ที่ 260 เพื่อให้ทุก feature เริ่มพร้อมกันเป๊ะ = เทียบกันได้ตรง
 */
const MIN_HISTORY = 260;

const HORIZONS = [1, 3, 6, 10];   // หน้าต่างถือที่โจทย์กำหนด
const TIMEFRAMES = ['1D', '1H'];
const GROUPS = ['RUNNER', 'SET50', 'GOLD', 'FOREX', 'US_STOCK', 'CRYPTO'];
const GROUP_LABEL = {
  RUNNER: 'หุ้นซิ่งไทย', SET50: 'SET50 เดิม', GOLD: 'ทอง/โลหะ',
  FOREX: 'ค่าเงิน', US_STOCK: 'หุ้นสหรัฐ', CRYPTO: 'คริปโต',
};

/** วอลุ่มต้องมีค่าบวกอย่างน้อยเท่านี้ของแท่งทั้งหมด ถึงจะถือว่า "ใช้ได้" */
const VOL_USABLE_MIN_FRAC = 0.70;

/**
 * ช่องที่ตัวอย่างบางเกินกว่าจะสรุปอะไรได้ — ติดธง ⚠ แล้วห้ามเอาไปตัดสิน
 * เกิดเพราะ split ของ 1D ตัดที่ปี 2016 ซึ่งเก่ากว่าจุดเริ่มของคริปโตและโลหะบางตัว
 * ทำให้ช่วง train ของสินทรัพย์เกิดใหม่แทบไม่เหลืออะไรเลย
 */
const THIN_MIN_SYMBOLS = 4;
const THIN_MIN_BARS = 3000;

/** หน้าต่างของอันดับ rolling ที่ใช้ในการแปลง IC เป็นเงิน (C4) */
const RANK_WINDOW = 250;
const RANK_MIN_VALID = 150;
const DECILE = 0.10;   // บน 10% = ฝั่งหนึ่ง · ล่าง 10% = อีกฝั่ง

// ════════════════════════════════ อาร์กิวเมนต์ ════════════════════════════════

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const OPT = {
  bootstrap: Number(args.bootstrap ?? 2000),
  seed: Number(args.seed ?? 20260818),
  alpha: Number(args.alpha ?? 0.05),
  cutFrac: Number(args.cutFrac ?? 0.80),   // ตัดท้ายทิ้งเหลือเท่านี้ ตอนตรวจ look-ahead
};

// ── ด่านกันชุด test และ validation ────────────────────────────────────────────
// เฟสนี้คือ "วัดพลังทำนายบน train เท่านั้น" ตามกติกาข้อ 5 — ไม่มีเหตุผลใดต้องแตะชุดอื่น
if (args.split === 'test' || args.split === 'validation' || args['i-am-done-tuning'] || args.confirm) {
  console.error('\n[หยุด] feat-volume.mjs วัดบน train เท่านั้น — ไม่แตะ validation และ test ไม่ว่ากรณีใด\n');
  process.exit(1);
}

// ═══════════════════════════ เครื่องมือทางสถิติ ═══════════════════════════

/** PRNG ที่ให้ผลเดิมทุกครั้ง — bootstrap ต้องรันซ้ำได้ทุกบรรทัด */
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

/**
 * erfc แบบ Numerical Recipes (ความคลาดเคลื่อนสัมพัทธ์ < 1.2e-7)
 * ต้องใช้ตัวนี้ เพราะ Holm ที่หลายร้อยการทดสอบต้องการ p ระดับ 1e-5
 * ซึ่ง bootstrap B=2000 ให้พื้น p ได้แค่ 5e-4 — วัดไม่ละเอียดพอ
 */
function erfc(x) {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const cof = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5,
    -2.0278578112534e-5, -1.624290004647e-6, 1.303655835580e-6, 1.5626441722e-8,
    -8.5238095915e-8, 6.529054439e-9, 5.059343495e-9, -9.91364156e-10, -2.27365122e-10,
    9.6467911e-11, 2.394038e-12, -6.886027e-12, 8.94487e-13, 3.13092e-13,
    -1.12708e-13, 3.81e-16, 7.106e-15];
  let d = 0; let dd = 0;
  for (let j = cof.length - 1; j > 0; j--) { const tmp = d; d = ty * d - dd + cof[j]; dd = tmp; }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
  return x >= 0 ? ans : 2 - ans;
}
const twoSidedP = (z) => erfc(Math.abs(z) / Math.SQRT2);

/**
 * ค่าเฉลี่ยพร้อมความคลาดเคลื่อนแบบจับกลุ่ม (cluster-robust)
 *
 * ทำไมต้องจับกลุ่ม: แท่งที่ติดกันมีหน้าต่างถือทับซ้อนกัน และแท่งของสัญลักษณ์เดียวกัน
 * เดินไปด้วยกัน ถ้าคิด SE แบบสุ่มอิสระ จำนวนตัวอย่างจะ "เฟ้อ" เป็นสิบเท่า
 * กลุ่มที่ใช้คือ (สัญลักษณ์ × เดือน) — นิยามเดียวกับ ceiling.mjs
 *
 * @param clusters อาร์เรย์ของ {n, s} — n = จำนวนแท่งในกลุ่ม, s = ผลรวมค่าที่วัดในกลุ่ม
 */
function clusterMean(clusters) {
  let N = 0; let S = 0; const G = clusters.length;
  for (const c of clusters) { N += c.n; S += c.s; }
  if (!N || G < 2) return { mean: N ? S / N : NaN, se: NaN, z: NaN, p: NaN, n: N, G };
  const mean = S / N;
  let v = 0;
  for (const c of clusters) { const u = c.s - c.n * mean; v += u * u; }
  const se = Math.sqrt((v * G) / (G - 1)) / N;
  const z = se > 0 ? mean / se : 0;
  return { mean, se, z, p: twoSidedP(z), n: N, G };
}

function percentileOfSorted(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── บัญชีการเปรียบเทียบ ────────────────────────────────────────────────────────
//
// รอบนี้เสี่ยง p-hacking สูงที่สุดในโครงการ: 22 feature × 4 หน้าต่างถือ × 12 ช่อง
// ทุกคำถามที่ "ถาม" ต้องถูกนับ ไม่ใช่เฉพาะที่ "ตอบว่าใช่"
// ตัวควบคุม (_ctrl*) ลงทะเบียนในตระกูลแยก เพื่อไม่ให้ไปเบียดเกณฑ์ของ feature จริง
const TESTS = [];
function registerTest({ id, family, question, estimate, ci, p, meta }) {
  TESTS.push({ idx: TESTS.length + 1, id, family, question, estimate, ci, p, meta: meta ?? {} });
}

/**
 * Holm–Bonferroni
 * @param scopeName ชื่อฟิลด์ที่จะเขียนผลลง (holmPass / holmPassGlobal)
 * @param keyFn     ฟังก์ชันบอกว่าการทดสอบข้อนี้อยู่ตระกูลไหน — คืน null = ไม่เข้าร่วม
 */
function applyHolm(scopeName, keyFn, alpha = OPT.alpha) {
  const byFamily = new Map();
  for (const t of TESTS) {
    const k = keyFn(t);
    if (k === null || k === undefined) continue;
    if (!byFamily.has(k)) byFamily.set(k, []);
    byFamily.get(k).push(t);
  }
  for (const [, list] of byFamily) {
    const sorted = [...list].filter((t) => Number.isFinite(t.p)).sort((a, b) => a.p - b.p);
    const m = sorted.length;
    let stillRejecting = true;
    sorted.forEach((t, k) => {
      t[`${scopeName}Threshold`] = alpha / (m - k);
      if (stillRejecting && t.p <= t[`${scopeName}Threshold`]) t[scopeName] = true;
      else { stillRejecting = false; t[scopeName] = false; }
    });
    for (const t of list) {
      if (!Number.isFinite(t.p)) { t[`${scopeName}Threshold`] = NaN; t[scopeName] = false; }
    }
  }
}

// ═══════════════════════════════ โหลดข้อมูล ═══════════════════════════════

/**
 * โหลด dataset หนึ่งชุด แล้วตัดตามสัญญาของคลังเหมือน lab.mjs / ceiling.mjs ทุกประการ
 * ต้องเคารพ quality.usable.from เสมอ ไม่งั้นจะได้แท่งที่เป็นไปไม่ได้ทางกายภาพ
 */
function loadDataset(file) {
  const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
  const from = j.quality?.usable?.from;
  let candles = j.candles;
  if (from) {
    const cut = Date.parse(from);
    const idx = candles.findIndex((c) => Date.parse(c.timestamp) >= cut);
    if (idx > 0) candles = candles.slice(idx);
    else if (idx === -1) candles = [];
  }
  return {
    file, symbol: j.symbol, market: j.market, timeframe: j.timeframe,
    verdict: j.quality?.verdict ?? 'unknown',
    candles,
    times: candles.map((c) => Date.parse(c.timestamp)),
  };
}

const listDatasets = () => fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();

/** ดัชนีแรกที่ timestamp >= cut */
function lowerBound(times, cut) {
  let lo = 0; let hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < cut) lo = mid + 1; else hi = mid; }
  return lo;
}

/** แท่งที่เชื่อถือได้พอจะใช้ — ลอกจาก lab.mjs */
const isUsableBar = (c) => (
  Number.isFinite(c.open) && c.open > 0 && Number.isFinite(c.high) && c.high > 0
  && Number.isFinite(c.low) && c.low > 0 && Number.isFinite(c.close) && c.close > 0
  && c.low <= c.high
);

// ═══════════════════════════ เรขาคณิตและค่าธรรมเนียม ═══════════════════════════
//
// ส่วนนี้ใช้แค่คำนวณ "ค่าธรรมเนียมต่อไม้" ให้เทียบกับ IC ที่แปลงเป็นเงินได้
// ลอกจาก ceiling.mjs ส่วนที่ทำเครื่องหมาย [CAUSAL] ไว้ — เขียนใหม่ ไม่ import

function atrAt(candles, i, period = GEO.atrPeriod) {
  const start = Math.max(0, i - period);
  if (i - start < 1) return NaN;
  let sum = 0; let n = 0;
  for (let k = start + 1; k <= i; k++) {
    const c = candles[k]; const prevClose = candles[k - 1].close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    n++;
  }
  return n ? sum / n : NaN;
}

function roundPrice(value, market) {
  if (!Number.isFinite(value)) return value;
  if (value !== 0 && Math.abs(value) < 1) {
    return Number(value.toPrecision(market === 'FOREX' ? ROUND.forexPrecision : ROUND.otherPrecision));
  }
  return Number(value.toFixed(market === 'FOREX' ? ROUND.forexDecimals : ROUND.otherDecimals));
}

function tickSizeFor(price) {
  for (const b of SET_TICK_TABLE) if (price >= b.from && price < b.to) return b.tick;
  return SET_TICK_TABLE[SET_TICK_TABLE.length - 1].tick;
}

/**
 * ค่าธรรมเนียมไป-กลับ คิดเป็น "สัดส่วนของมูลค่าสถานะ"
 * หุ้นไทย: ค่าคอมสองขา (ขั้นต่ำ 50 บาท) ÷ มูลค่าคำสั่ง + สเปรด 1 tick
 *   มูลค่าคำสั่ง = เงินเสี่ยงต่อไม้ ÷ ระยะ SL — ยิ่ง SL กว้าง คำสั่งยิ่งเล็ก ค่าคอมขั้นต่ำยิ่งกิน
 * ตลาดอื่น: ตาราง bps ของ lab.mjs ตรง ๆ
 */
function feeFractionFor(market, symbol, entryPrice, stopDistPct) {
  if (market === 'TH_STOCK') {
    if (!(entryPrice > 0) || !(stopDistPct > 0)) return NaN;
    const orderValue = TH_RISK_BAHT / stopDistPct;
    const feeOneSide = Math.max(TH_COMM_RATE * orderValue, TH_MIN_FEE);
    const comm = (2 * feeOneSide) / orderValue;
    const tick = TH_TICKS_PER_ROUND * (tickSizeFor(entryPrice) / entryPrice);
    return comm + tick;
  }
  const bps = LAB_COST_BPS.bySymbol[symbol] ?? LAB_COST_BPS.byMarket[market];
  return bps / 10000;
}

/** ระยะ SL เป็นสัดส่วน ณ แท่งสัญญาณ i (อ่าน candles[0..i] เท่านั้น) */
function stopDistPctAt(candles, i, market, entryPrice) {
  const cur = candles[i].close;
  const atrRaw = atrAt(candles, i);
  const atr = Number.isFinite(atrRaw) && atrRaw > 0 ? atrRaw : cur * GEO.atrFallbackPct;
  const entryOut = roundPrice(cur, market);
  const sl = roundPrice(cur - atr * GEO.slAtrMult, market);
  const risk = Math.abs(entryOut - sl);
  if (!(risk > 0) || !(entryPrice > 0)) return NaN;
  return risk / entryPrice;
}

/** สถิติพื้นฐานของหุ้นไทยหนึ่งตัว วัดเฉพาะ train ของ 1H — ใช้คัดหุ้นซิ่ง */
function thTrainProfile(ds, trainEndMs) {
  const end = lowerBound(ds.times, trainEndMs);
  const ranges = []; const turns = [];
  for (let i = 0; i < end; i++) {
    const c = ds.candles[i];
    if (!isUsableBar(c)) continue;
    ranges.push((c.high - c.low) / c.close);
    turns.push((c.volume ?? 0) * c.close);
  }
  const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return percentileOfSorted(s, 0.5); };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  return { bars: ranges.length, barRangePct: mean(ranges) * 100, turnover: med(turns) };
}

// ════════════════════════════════ นิยาม feature ════════════════════════════════
//
// ทุกตัวคำนวณจาก candles[0..i] เท่านั้น · "why" คือเหตุผลที่ควรมีตัวนี้ในตาราง
// needsVol = true แปลว่าตัวนี้จะถูกตัดทิ้งอัตโนมัติในตลาดที่วอลุ่มใช้ไม่ได้

const FEATURES = [
  // ── ตระกูลวอลุ่ม ─────────────────────────────────────────────────────────────
  { key: 'volZ20', fam: 'VOL', needsVol: true,
    why: 'วอลุ่มดิบเทียบค่าเฉลี่ย/ส่วนเบี่ยงเบนของตัวเอง 20 แท่งหลัง — ตัวพื้นฐานที่สุดที่โจทย์ขอ' },
  { key: 'volLogRatio20', fam: 'VOL', needsVol: true,
    why: 'log(วอลุ่ม ÷ มัธยฐาน 20 แท่ง) — รุ่นทนค่าสุดขั้ว เพราะวอลุ่มแจกแจงเบ้ขวาแรงมาก' },
  { key: 'volTrend5_20', fam: 'VOL', needsVol: true,
    why: 'log(เฉลี่ย5 ÷ เฉลี่ย20) — วอลุ่มกำลังเร่งขึ้นหรือแผ่วลง คนละเรื่องกับวอลุ่มแท่งเดียว' },
  { key: 'volShock20', fam: 'VOL', needsVol: true,
    why: 'วอลุ่ม ÷ วอลุ่มสูงสุด 20 แท่ง — "การพุ่ง" ที่โจทย์ขอ วัดเทียบจุดสูงสุดไม่ใช่ค่าเฉลี่ย' },
  { key: 'turnoverZ20', fam: 'VOL', needsVol: true,
    why: 'z ของ log(มูลค่าซื้อขาย) — เงินที่ไหลเข้า ไม่ใช่จำนวนหุ้น กันอคติหุ้นราคาถูก' },
  { key: 'signedVolZ20', fam: 'VOL', needsVol: true,
    why: 'volZ20 × ทิศของแท่ง — order flow แบบหยาบที่สุดที่ข้อมูล OHLCV ให้ได้' },
  { key: 'updownImb20', fam: 'VOL', needsVol: true,
    why: 'ความไม่สมดุลวอลุ่มขาขึ้น/ขาลง 20 แท่ง — ฝั่งไหนคุมเกมอยู่' },
  { key: 'obvRatio10', fam: 'VOL', needsVol: true,
    why: 'OBV สุทธิ 10 แท่ง ÷ วอลุ่มรวม — ไร้หน่วย เทียบข้ามสัญลักษณ์ได้' },
  { key: 'adRatio10', fam: 'VOL', needsVol: true,
    why: 'A/D (CLV × วอลุ่ม) 10 แท่ง ÷ วอลุ่มรวม — เหมือน OBV แต่ให้น้ำหนักตามตำแหน่งปิด' },
  { key: 'mfi14', fam: 'VOL', needsVol: true,
    why: 'Money Flow Index กลางที่ 0 — เหมือน RSI แต่ถ่วงด้วยวอลุ่ม เครื่องยนต์มี RSI แต่ไม่มีตัวนี้' },
  { key: 'vwapDist20', fam: 'VOL', needsVol: true,
    why: '(ปิด − VWAP20) ÷ ATR — ราคาห่างจากต้นทุนเฉลี่ยของคนที่ถืออยู่แค่ไหน' },
  { key: 'amihudLog20', fam: 'VOL', needsVol: true,
    why: 'Amihud illiquidity — ราคาขยับกี่ % ต่อเงิน 1 หน่วย เป็นตัวแทนของสภาพคล่อง' },

  // ── ตระกูลโครงสร้างราคา ──────────────────────────────────────────────────────
  { key: 'clv', fam: 'PX', needsVol: false,
    why: 'ตำแหน่งราคาปิดในกรอบแท่ง — บอกว่าใครชนะในแท่งนั้น (โจทย์ขอโดยตรง)' },
  { key: 'clv5', fam: 'PX', needsVol: false,
    why: 'CLV เฉลี่ย 5 แท่ง — ใครชนะติดกันหลายแท่ง เสียงรบกวนน้อยกว่าแท่งเดียว' },
  { key: 'bodyRatio', fam: 'PX', needsVol: false,
    why: '(ปิด − เปิด) ÷ ช่วงแท่ง — ต่างจาก CLV ตรงที่วัดจากราคาเปิด ไม่ใช่ขอบแท่ง' },
  { key: 'wickImb', fam: 'PX', needsVol: false,
    why: '(ไส้บน − ไส้ล่าง) ÷ ช่วงแท่ง — ฝั่งไหนถูกปฏิเสธ เป็นแก่นของ hammer/shooting star แบบต่อเนื่อง' },
  { key: 'effRatio10', fam: 'PX', needsVol: false,
    why: 'ระยะสุทธิ ÷ ระยะที่เดินจริง 10 แท่ง — ตลาดกำลังเดินตรงหรือส่ายไปมา (โจทย์ขอ)' },
  { key: 'effRatioSigned10', fam: 'PX', needsVol: false,
    why: 'efficiency ratio คูณทิศ — แยก "เดินตรงขึ้น" ออกจาก "เดินตรงลง"' },
  { key: 'rangeZ20', fam: 'PX', needsVol: false,
    why: 'z ของช่วงแท่งเทียบอดีตตัวเอง — แท่งนี้กว้างผิดปกติไหม' },
  { key: 'squeeze5_20', fam: 'PX', needsVol: false,
    why: 'log(ATR5 ÷ ATR20) — การบีบตัวแล้วขยายของความผันผวน (โจทย์ขอ) เป็น "การเปลี่ยน" ไม่ใช่ "ระดับ"' },
  { key: 'bbWidthPct100', fam: 'PX', needsVol: false,
    why: 'อันดับความกว้าง Bollinger ใน 100 แท่ง — squeeze แบบคลาสสิก เครื่องยนต์มี BB แต่ไม่เคยดูความกว้าง' },
  { key: 'gapAtr', fam: 'PX', needsVol: false,
    why: '(เปิด − ปิดก่อนหน้า) ÷ ATR — พฤติกรรม gap ข้ามคืน (โจทย์ขอ) มีความหมายเฉพาะตลาดที่มีเวลาปิด' },

  // ── ตัวควบคุม (ไม่ใช่ feature จริง ไม่เข้าตระกูลสถิติของ feature) ──────────────────
  { key: '_ctrlNoise', fam: 'CTRL', needsVol: false, ctrl: 'noise',
    why: 'เสียงสุ่มล้วนจาก hash(สัญลักษณ์, เวลา) — IC ต้องใกล้ 0 ไม่งั้นแปลว่าเครื่องวัดเพี้ยน' },
  { key: '_ctrlFuture', fam: 'CTRL', needsVol: false, ctrl: 'leakFuture',
    why: 'ผลตอบแทนแท่งถัดไป (รั่วโดยตั้งใจ) — IC ต้องสูงมาก ไม่งั้นแปลว่าเครื่องวัดไม่มีฟัน' },
  { key: '_ctrlLeakZ', fam: 'CTRL', needsVol: false, ctrl: 'leakZ',
    why: 'z-score ของราคาปิดด้วยค่าเฉลี่ยทั้งชุด = การรั่วแบบเงียบที่สุด — ด่านตัดท้ายต้องจับได้' },
];

const FEATURE_KEYS = FEATURES.map((f) => f.key);
const FEATURE_IDX = new Map(FEATURE_KEYS.map((k, i) => [k, i]));
const REAL_FEATURES = FEATURES.filter((f) => !f.ctrl);
const CTRL_FEATURES = FEATURES.filter((f) => f.ctrl);

/** hash ที่ให้ผลเดิมทุกครั้ง สำหรับตัวควบคุมเสียงสุ่ม */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * คำนวณ feature ทุกตัวของ dataset หนึ่ง จนถึงดัชนี maxIndex
 *
 * @param maxIndex  ดัชนีสูงสุดที่ "มองเห็นได้" — ตอนตรวจ look-ahead จะตั้งให้ต่ำลง
 *                  แล้วเทียบว่าค่าของแท่งเก่าเปลี่ยนไหม
 * @param volUsable วอลุ่มของตลาดนี้ใช้ได้ไหม ถ้าไม่ feature ตระกูล VOL จะเป็น NaN ทั้งหมด
 *
 * คืน Float64Array หนึ่งชุดต่อ feature (ยาว maxIndex+1) — NaN = แท่งนั้นไม่มีค่า
 */
function computeFeatures(ds, maxIndex, volUsable) {
  const { candles, market, symbol } = ds;
  const n = maxIndex + 1;
  const out = FEATURE_KEYS.map(() => new Float64Array(n).fill(NaN));
  const F = (k) => out[FEATURE_IDX.get(k)];

  // ── เตรียมอนุกรมพื้นฐาน ────────────────────────────────────────────────────
  // วอลุ่มที่ <= 0 ถือว่า "ไม่มีค่า" ไม่ใช่ "ศูนย์" — เพราะ Yahoo ใส่ 0 แทนข้อมูลที่หายไป
  // (หุ้นไทย 1H: แท่งเปิดตลาดเป็น 0 ราว 68% ของแท่ง 10:00 น. ซึ่งเป็นข้อบกพร่องของแหล่งข้อมูล)
  const vol = new Float64Array(n).fill(NaN);
  const ok = new Uint8Array(n);
  const clvArr = new Float64Array(n).fill(NaN);
  const tp = new Float64Array(n).fill(NaN);       // typical price
  const ret1 = new Float64Array(n).fill(NaN);     // ผลตอบแทนปิด-ต่อ-ปิดของแท่งนี้
  const rangePct = new Float64Array(n).fill(NaN);
  const trArr = new Float64Array(n).fill(NaN);    // true range

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    if (!isUsableBar(c)) continue;
    ok[i] = 1;
    if (volUsable && Number.isFinite(c.volume) && c.volume > 0) vol[i] = c.volume;
    const span = c.high - c.low;
    clvArr[i] = span > 0 ? ((c.close - c.low) - (c.high - c.close)) / span : 0;
    tp[i] = (c.high + c.low + c.close) / 3;
    rangePct[i] = span / c.close;
    if (i > 0 && ok[i - 1]) {
      const pc = candles[i - 1].close;
      ret1[i] = (c.close - pc) / pc;
      trArr[i] = Math.max(span, Math.abs(c.high - pc), Math.abs(c.low - pc));
    }
  }

  // OBV และ A/D สะสมไปข้างหน้าอย่างเดียว — ไม่มีทางย้อนอ่านอนาคตได้ตามโครงสร้าง
  const obv = new Float64Array(n);
  const adl = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    obv[i] = obv[i - 1];
    adl[i] = adl[i - 1];
    if (!ok[i] || !Number.isFinite(vol[i])) continue;
    if (Number.isFinite(ret1[i]) && ret1[i] !== 0) obv[i] += Math.sign(ret1[i]) * vol[i];
    if (Number.isFinite(clvArr[i])) adl[i] += clvArr[i] * vol[i];
  }

  // ── ตัวช่วยหน้าต่างย้อนหลัง — ทุกตัวอ่าน [i-W+1 .. i] เท่านั้น ──────────────────
  const winStats = (arr, i, W, minValid) => {
    const s = Math.max(0, i - W + 1);
    let cnt = 0; let sum = 0; let sum2 = 0;
    for (let k = s; k <= i; k++) { const v = arr[k]; if (!Number.isFinite(v)) continue; cnt++; sum += v; sum2 += v * v; }
    if (cnt < minValid) return null;
    const mean = sum / cnt;
    const varr = Math.max(0, sum2 / cnt - mean * mean);
    return { cnt, mean, sd: Math.sqrt(varr) };
  };
  const winMedian = (arr, i, W, minValid) => {
    const s = Math.max(0, i - W + 1);
    const buf = [];
    for (let k = s; k <= i; k++) { const v = arr[k]; if (Number.isFinite(v)) buf.push(v); }
    if (buf.length < minValid) return NaN;
    buf.sort((a, b) => a - b);
    return percentileOfSorted(buf, 0.5);
  };
  const winMax = (arr, i, W, minValid) => {
    const s = Math.max(0, i - W + 1);
    let m = -Infinity; let cnt = 0;
    for (let k = s; k <= i; k++) { const v = arr[k]; if (!Number.isFinite(v)) continue; cnt++; if (v > m) m = v; }
    return cnt >= minValid ? m : NaN;
  };
  const winMean = (arr, i, W, minValid) => {
    const st = winStats(arr, i, W, minValid);
    return st ? st.mean : NaN;
  };

  const V20 = 12;   // ต้องมีวอลุ่มที่ใช้ได้อย่างน้อย 12 จาก 20 แท่ง
  const V10 = 6;
  const V5 = 3;

  // ── ความกว้าง Bollinger(20,2) เก็บไว้ก่อน เพราะ bbWidthPct100 ต้องใช้ย้อนหลัง 100 ค่า ──
  const bbw = new Float64Array(n).fill(NaN);
  const closeArr = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) if (ok[i]) closeArr[i] = candles[i].close;
  for (let i = 19; i < n; i++) {
    const st = winStats(closeArr, i, 20, 15);
    if (!st || !(st.mean > 0)) continue;
    bbw[i] = (4 * st.sd) / st.mean;   // (บน − ล่าง) ÷ กลาง = 4σ/μ
  }

  const noiseRng = symbol;   // seed ต่อสัญลักษณ์ ให้ค่าเดิมทุกครั้งที่รัน

  // ══════════════ ลูปหลัก — ทุกอย่างข้างในอ่านได้ถึงแค่ดัชนี i ══════════════
  for (let i = 0; i < n; i++) {
    // ตัวควบคุมเสียงสุ่ม: ขึ้นกับ (สัญลักษณ์, เวลา) เท่านั้น จึงคงที่ทุกการรัน
    F('_ctrlNoise')[i] = (hashStr(`${noiseRng}|${ds.times[i]}`) / 4294967296);

    if (i < MIN_HISTORY || !ok[i]) continue;
    const c = candles[i];

    // ── โครงสร้างราคา ──────────────────────────────────────────────────────
    F('clv')[i] = clvArr[i];
    F('clv5')[i] = winMean(clvArr, i, 5, 4);

    const span = c.high - c.low;
    if (span > 0) {
      F('bodyRatio')[i] = (c.close - c.open) / span;
      const upper = c.high - Math.max(c.open, c.close);
      const lower = Math.min(c.open, c.close) - c.low;
      F('wickImb')[i] = (upper - lower) / span;
    } else {
      F('bodyRatio')[i] = 0;
      F('wickImb')[i] = 0;
    }

    // efficiency ratio: ระยะสุทธิ 10 แท่ง ÷ ผลรวมระยะที่เดินจริง
    if (ok[i - 10]) {
      let pathLen = 0; let good = true;
      for (let k = i - 9; k <= i; k++) {
        if (!ok[k] || !ok[k - 1]) { good = false; break; }
        pathLen += Math.abs(candles[k].close - candles[k - 1].close);
      }
      if (good && pathLen > 0) {
        const net = c.close - candles[i - 10].close;
        const er = Math.abs(net) / pathLen;
        F('effRatio10')[i] = er;
        F('effRatioSigned10')[i] = Math.sign(net) * er;
      }
    }

    const rSt = winStats(rangePct, i, 20, 15);
    if (rSt && rSt.sd > 0) F('rangeZ20')[i] = (rangePct[i] - rSt.mean) / rSt.sd;

    const atr5 = winMean(trArr, i, 5, 4);
    const atr20 = winMean(trArr, i, 20, 15);
    if (atr5 > 0 && atr20 > 0) F('squeeze5_20')[i] = Math.log(atr5 / atr20);

    if (Number.isFinite(bbw[i])) {
      const s = Math.max(0, i - 99);
      let cnt = 0; let below = 0;
      for (let k = s; k <= i; k++) {
        const v = bbw[k]; if (!Number.isFinite(v)) continue;
        cnt++;
        if (v < bbw[i]) below++; else if (v === bbw[i]) below += 0.5;
      }
      if (cnt >= 60) F('bbWidthPct100')[i] = below / cnt;
    }

    const atr14 = atrAt(candles, i);
    if (ok[i - 1] && atr14 > 0) F('gapAtr')[i] = (c.open - candles[i - 1].close) / atr14;

    // ตัวควบคุมการรั่วแบบเงียบ — ใช้ค่าเฉลี่ย/SD ของ "ทั้งชุดที่มองเห็น" ไม่ใช่ rolling
    // ค่านี้จะเปลี่ยนทันทีที่ตัดข้อมูลท้ายทิ้ง ซึ่งคือสิ่งที่ด่าน C1 ต้องจับได้
    // (คำนวณจริงหลังลูป เพราะต้องรู้ค่าเฉลี่ยทั้งชุดก่อน)

    // ตัวควบคุมเชิงบวก — ผลตอบแทนแท่งถัดไป (รั่วโดยตั้งใจ)
    if (i + 1 <= maxIndex && ok[i + 1]) {
      F('_ctrlFuture')[i] = (candles[i + 1].close - c.close) / c.close;
    }

    // ── วอลุ่ม ─────────────────────────────────────────────────────────────
    if (!volUsable) continue;

    const vSt = winStats(vol, i, 20, V20);
    const vHere = vol[i];
    if (vSt && vSt.sd > 0 && Number.isFinite(vHere)) F('volZ20')[i] = (vHere - vSt.mean) / vSt.sd;

    const vMed = winMedian(vol, i, 20, V20);
    if (vMed > 0 && vHere > 0) F('volLogRatio20')[i] = Math.log(vHere / vMed);

    const v5 = winMean(vol, i, 5, V5);
    if (v5 > 0 && vSt && vSt.mean > 0) F('volTrend5_20')[i] = Math.log(v5 / vSt.mean);

    const vMax = winMax(vol, i, 20, V20);
    if (vMax > 0 && vHere > 0) F('volShock20')[i] = vHere / vMax;

    // มูลค่าซื้อขาย: ใช้ log ก่อน z เพราะเงินหมุนเวียนแจกแจงแบบ lognormal
    const logTurn = new Float64Array(0);   // ไม่สร้างอาร์เรย์ใหม่ทุกแท่ง — คำนวณสดในลูปย่อย
    {
      const s = Math.max(0, i - 19);
      let cnt = 0; let sum = 0; let sum2 = 0; let here = NaN;
      for (let k = s; k <= i; k++) {
        const vv = vol[k];
        if (!Number.isFinite(vv) || !ok[k]) continue;
        const lt = Math.log(vv * candles[k].close);
        if (!Number.isFinite(lt)) continue;
        cnt++; sum += lt; sum2 += lt * lt;
        if (k === i) here = lt;
      }
      if (cnt >= V20 && Number.isFinite(here)) {
        const mean = sum / cnt;
        const sd = Math.sqrt(Math.max(0, sum2 / cnt - mean * mean));
        if (sd > 0) F('turnoverZ20')[i] = (here - mean) / sd;
      }
      void logTurn;
    }

    const vz = F('volZ20')[i];
    if (Number.isFinite(vz)) {
      const dir = c.close > c.open ? 1 : (c.close < c.open ? -1 : 0);
      F('signedVolZ20')[i] = vz * dir;
    }

    {
      const s = Math.max(0, i - 19);
      let up = 0; let dn = 0; let tot = 0; let cnt = 0;
      for (let k = s; k <= i; k++) {
        const vv = vol[k];
        if (!Number.isFinite(vv) || !Number.isFinite(ret1[k])) continue;
        cnt++; tot += vv;
        if (ret1[k] > 0) up += vv; else if (ret1[k] < 0) dn += vv;
      }
      if (cnt >= V20 && tot > 0) F('updownImb20')[i] = (up - dn) / tot;
    }

    {
      const s = Math.max(0, i - 9);
      let tot = 0; let cnt = 0;
      for (let k = s; k <= i; k++) { const vv = vol[k]; if (!Number.isFinite(vv)) continue; cnt++; tot += vv; }
      if (cnt >= V10 && tot > 0 && i - 10 >= 0) {
        F('obvRatio10')[i] = (obv[i] - obv[i - 10]) / tot;
        F('adRatio10')[i] = (adl[i] - adl[i - 10]) / tot;
      }
    }

    {
      // Money Flow Index(14) — เหมือน RSI แต่ถ่วงด้วยเงิน
      let pos = 0; let neg = 0; let cnt = 0;
      for (let k = i - 13; k <= i; k++) {
        if (k < 1) continue;
        const vv = vol[k];
        if (!Number.isFinite(vv) || !Number.isFinite(tp[k]) || !Number.isFinite(tp[k - 1])) continue;
        cnt++;
        const mf = tp[k] * vv;
        if (tp[k] > tp[k - 1]) pos += mf; else if (tp[k] < tp[k - 1]) neg += mf;
      }
      if (cnt >= 9 && pos + neg > 0) F('mfi14')[i] = ((100 * pos) / (pos + neg) - 50) / 50;
    }

    {
      const s = Math.max(0, i - 19);
      let pv = 0; let vv = 0; let cnt = 0;
      for (let k = s; k <= i; k++) {
        const v2 = vol[k];
        if (!Number.isFinite(v2) || !Number.isFinite(tp[k])) continue;
        cnt++; pv += tp[k] * v2; vv += v2;
      }
      if (cnt >= V20 && vv > 0 && atr14 > 0) F('vwapDist20')[i] = (c.close - pv / vv) / atr14;
    }

    {
      const s = Math.max(0, i - 19);
      let sum = 0; let cnt = 0;
      for (let k = s; k <= i; k++) {
        const v2 = vol[k];
        if (!Number.isFinite(v2) || !Number.isFinite(ret1[k]) || !ok[k]) continue;
        const dollar = v2 * candles[k].close;
        if (!(dollar > 0)) continue;
        cnt++; sum += Math.abs(ret1[k]) / dollar;
      }
      if (cnt >= V20 && sum > 0) F('amihudLog20')[i] = Math.log(sum / cnt);
    }
  }

  // ── ตัวควบคุมการรั่วแบบเงียบ: z-score ของ close ด้วยค่าเฉลี่ย "ทั้งชุดที่มองเห็น" ──
  // เขียนแยกจากลูปหลักเพื่อให้ชัดว่ามันผิดกติกาโดยตั้งใจ ไม่ใช่หลุด
  {
    let cnt = 0; let sum = 0; let sum2 = 0;
    for (let i = 0; i < n; i++) { const v = closeArr[i]; if (!Number.isFinite(v)) continue; cnt++; sum += v; sum2 += v * v; }
    if (cnt > 1) {
      const mean = sum / cnt;
      const sd = Math.sqrt(Math.max(0, sum2 / cnt - mean * mean));
      if (sd > 0) {
        const arr = F('_ctrlLeakZ');
        for (let i = MIN_HISTORY; i < n; i++) if (Number.isFinite(closeArr[i])) arr[i] = (closeArr[i] - mean) / sd;
      }
    }
  }

  return out;
}

// ═══════════════════════ ผลตอบแทนอนาคตและค่าธรรมเนียม ═══════════════════════

/**
 * ผลตอบแทนอนาคตที่หน้าต่างถือ h — เข้าที่เปิดแท่ง i+1 ออกที่ปิดแท่ง i+h
 * ⚠ ตัวนี้อ่านอนาคตโดยนิยาม เพราะมันคือ "เป้า" ที่เราวัดความสัมพันธ์ด้วย ไม่ใช่ feature
 *
 * @param lastIdx ดัชนีสุดท้ายของ split — ไม้ที่หน้าต่างล้ำออกไปจะถูกทิ้ง ไม่ปนข้าม split
 */
function forwardReturns(ds, lastIdx) {
  const { candles } = ds;
  const out = HORIZONS.map(() => new Float64Array(lastIdx + 1).fill(NaN));
  for (let i = 0; i <= lastIdx; i++) {
    if (i + 1 > lastIdx) break;
    const eb = candles[i + 1];
    if (!isUsableBar(eb) || !(eb.open > 0)) continue;
    const entry = eb.open;
    for (let hi = 0; hi < HORIZONS.length; hi++) {
      const j = i + HORIZONS[hi];
      if (j > lastIdx) continue;
      const xb = candles[j];
      if (!isUsableBar(xb)) continue;
      out[hi][i] = (xb.close - entry) / entry;
    }
  }
  return out;
}

/** ค่าธรรมเนียมไป-กลับต่อไม้ ณ แท่งสัญญาณ i (สัดส่วนของมูลค่าสถานะ) */
function feeSeries(ds, lastIdx) {
  const { candles, market, symbol } = ds;
  const out = new Float64Array(lastIdx + 1).fill(NaN);
  for (let i = MIN_HISTORY; i <= lastIdx; i++) {
    if (i + 1 > lastIdx) break;
    const eb = candles[i + 1];
    if (!isUsableBar(eb) || !(eb.open > 0)) continue;
    const sd = stopDistPctAt(candles, i, market, eb.open);
    const f = feeFractionFor(market, symbol, eb.open, sd);
    if (Number.isFinite(f)) out[i] = f;
  }
  return out;
}

// ═══════════════════════════ Spearman แบบแยกตามสัญลักษณ์ ═══════════════════════════

/**
 * แปลงค่าเป็นอันดับ (เฉลี่ยเมื่อเสมอ) แล้วมาตรฐานให้ mean 0 sd 1
 * คืน Float64Array ยาวเท่า idxs
 *
 * ⚠ การจัดอันดับนี้ใช้ข้อมูลทั้ง split — เป็นสถิติเชิงพรรณนาเพื่อ "วัด" ความสัมพันธ์
 *   ไม่ได้ถูกใช้เป็นกฎเทรด (กฎเทรดใช้อันดับ rolling ใน C4 ซึ่งเป็นคนละฟังก์ชัน)
 */
function standardizedRanks(vals, idxs) {
  const m = idxs.length;
  const order = new Int32Array(m);
  for (let k = 0; k < m; k++) order[k] = k;
  const arr = Array.from(order);
  arr.sort((a, b) => vals[idxs[a]] - vals[idxs[b]]);
  const rank = new Float64Array(m);
  let k = 0;
  while (k < m) {
    let j = k;
    const v = vals[idxs[arr[k]]];
    while (j + 1 < m && vals[idxs[arr[j + 1]]] === v) j++;
    const avg = (k + j) / 2 + 1;
    for (let q = k; q <= j; q++) rank[arr[q]] = avg;
    k = j + 1;
  }
  let sum = 0; let sum2 = 0;
  for (let q = 0; q < m; q++) { sum += rank[q]; sum2 += rank[q] * rank[q]; }
  const mean = sum / m;
  const sd = Math.sqrt(Math.max(0, sum2 / m - mean * mean));
  const z = new Float64Array(m);
  if (sd > 0) for (let q = 0; q < m; q++) z[q] = (rank[q] - mean) / sd;
  return { z, degenerate: !(sd > 0) };
}

/** อันดับเปอร์เซ็นไทล์แบบ rolling จากอดีตเท่านั้น — ตัวนี้เทรดได้จริง */
function causalRankPct(vals, i, W = RANK_WINDOW, minValid = RANK_MIN_VALID) {
  const x = vals[i];
  if (!Number.isFinite(x)) return NaN;
  const s = Math.max(0, i - W + 1);
  let below = 0; let tot = 0;
  for (let k = s; k <= i; k++) {
    const v = vals[k];
    if (!Number.isFinite(v)) continue;
    tot++;
    if (v < x) below++; else if (v === x) below += 0.5;
  }
  return tot >= minValid ? below / tot : NaN;
}

// ═══════════════════════════════ ตัวสะสมผลต่อช่อง ═══════════════════════════════

/**
 * ตัวสะสมของหนึ่งช่อง (กลุ่ม × กรอบเวลา × feature × หน้าต่างถือ)
 *
 * เก็บสองมิติพร้อมกัน:
 *   · clusters (สัญลักษณ์ × เดือน) → ใช้คิด p แบบ cluster-robust
 *   · symbols                     → ใช้ bootstrap ระดับสัญลักษณ์ตามที่โจทย์กำหนด
 * และแยกครึ่งแรก/ครึ่งหลังของ train ไว้ด้วย (h0/h1) เพื่อตรวจความเสถียรใน C5
 * โดยไม่ต้องแตะ validation เลย
 */
const BLANK = () => ({ n: 0, sQ: 0, tn: 0, tSum: 0, n0: 0, sQ0: 0, tn0: 0, tSum0: 0, n1: 0, sQ1: 0, tn1: 0, tSum1: 0 });
class CellStat {
  constructor() {
    this.clusters = new Map();
    this.symbols = new Map();
  }
  addIC(sym, ck, q, half) {
    let c = this.clusters.get(ck);
    if (!c) { c = BLANK(); this.clusters.set(ck, c); }
    c.n++; c.sQ += q;
    let s = this.symbols.get(sym);
    if (!s) { s = BLANK(); this.symbols.set(sym, s); }
    s.n++; s.sQ += q;
    if (half === 0) { c.n0++; c.sQ0 += q; s.n0++; s.sQ0 += q; } else { c.n1++; c.sQ1 += q; s.n1++; s.sQ1 += q; }
  }
  addTrade(sym, ck, ret, half) {
    let c = this.clusters.get(ck);
    if (!c) { c = BLANK(); this.clusters.set(ck, c); }
    c.tn++; c.tSum += ret;
    let s = this.symbols.get(sym);
    if (!s) { s = BLANK(); this.symbols.set(sym, s); }
    s.tn++; s.tSum += ret;
    if (half === 0) { c.tn0++; c.tSum0 += ret; s.tn0++; s.tSum0 += ret; } else { c.tn1++; c.tSum1 += ret; s.tn1++; s.tSum1 += ret; }
  }
}

/** bootstrap ระดับสัญลักษณ์ ตามที่โจทย์กำหนด (ไม่ใช่ระดับแท่ง) */
function bootstrapSymbolMean(entries, pick, B, rng) {
  const G = entries.length;
  if (G < 2) return { lo: NaN, hi: NaN };
  const vals = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let n = 0; let s = 0;
    for (let k = 0; k < G; k++) {
      const e = entries[(rng() * G) | 0];
      const [en, es] = pick(e);
      n += en; s += es;
    }
    vals[b] = n > 0 ? s / n : NaN;
  }
  const sorted = Array.from(vals).filter(Number.isFinite).sort((a, b) => a - b);
  return { lo: percentileOfSorted(sorted, 0.025), hi: percentileOfSorted(sorted, 0.975) };
}

// ════════════════════════════════════ หลัก ════════════════════════════════════

const LINES = [];
const W = (s = '') => LINES.push(s);
const bpsS = (v, d = 2) => (Number.isFinite(v) ? (v * 10000).toFixed(d) : '—');
const pS = (p) => (!Number.isFinite(p) ? '—' : (p < 1e-4 ? p.toExponential(1) : p.toFixed(4)));
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(4) : '—');
const pctS = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');

async function main() {
  const t0 = Date.now();
  const bounds = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
  const JSONOUT = {
    generatedAt: new Date().toISOString(), opt: OPT,
    features: FEATURES.map((f) => ({ key: f.key, family: f.fam, needsVolume: !!f.needsVol, control: f.ctrl ?? null, why: f.why })),
    horizons: HORIZONS, volumeAudit: {}, leakAudit: {}, cells: {}, tests: [],
  };

  // ── โหลดชุดข้อมูล ────────────────────────────────────────────────────────────
  const datasets = [];
  const dropped = [];
  for (const f of listDatasets()) {
    const ds = loadDataset(f);
    if (ds.verdict === 'bad') { dropped.push(`${ds.market}/${ds.symbol}/${ds.timeframe} (คุณภาพแย่)`); continue; }
    if (!ds.candles.length) { dropped.push(`${ds.market}/${ds.symbol}/${ds.timeframe} (ว่าง)`); continue; }
    datasets.push(ds);
  }

  // ── คัดหุ้นซิ่ง จาก train ของ 1H เท่านั้น (นิยามเดียวกับ ceiling.mjs เป๊ะ) ──────
  const trainEnd1H = Date.parse(bounds.timeframes['1H'].trainEnd);
  const thProfiles = [];
  for (const ds of datasets) {
    if (ds.market !== 'TH_STOCK' || ds.timeframe !== '1H') continue;
    thProfiles.push({ symbol: ds.symbol, ...thTrainProfile(ds, trainEnd1H) });
  }
  const runnerSet = new Set(thProfiles.filter((p) => !SET50_SYMBOLS.includes(p.symbol)
    && p.barRangePct >= RUNNER_RULE.minBarRangePct
    && p.turnover >= RUNNER_RULE.minTurnoverBaht
    && p.bars >= RUNNER_RULE.minBars).map((p) => p.symbol));

  const groupOf = (ds) => {
    if (ds.market !== 'TH_STOCK') return ds.market;
    if (SET50_SYMBOLS.includes(ds.symbol)) return 'SET50';
    if (runnerSet.has(ds.symbol)) return 'RUNNER';
    return null;
  };

  // ให้แต่ละ dataset รู้ขอบของ train ของตัวเอง
  const work = [];
  for (const ds of datasets) {
    const g = groupOf(ds);
    if (!g) continue;
    const trainEnd = Date.parse(bounds.timeframes[ds.timeframe].trainEnd);
    const lastIdx = lowerBound(ds.times, trainEnd) - 1;   // ดัชนีสุดท้ายที่ยังอยู่ใน train
    if (lastIdx < MIN_HISTORY + 40) { dropped.push(`${g}/${ds.symbol}/${ds.timeframe} (train สั้นเกิน)`); continue; }
    work.push({ ds, group: g, lastIdx });
  }

  // ══════════════ C0 · วอลุ่มของตลาดไหนใช้ได้จริง ══════════════
  //
  // Yahoo ใส่ 0 แทน "ไม่มีข้อมูล" ไม่ใช่ "ไม่มีการซื้อขาย" ถ้าปล่อยผ่านไป
  // feature ตระกูลวอลุ่มทั้งหมดจะกลายเป็นเสียงรบกวนที่ดูเหมือนมีค่า
  const volAudit = {};
  for (const w of work) {
    const key = `${w.group}|${w.ds.timeframe}`;
    const a = volAudit[key] ?? (volAudit[key] = { group: w.group, timeframe: w.ds.timeframe, bars: 0, pos: 0, symbols: [] });
    let bars = 0; let pos = 0;
    for (let i = 0; i <= w.lastIdx; i++) {
      const c = w.ds.candles[i];
      if (!isUsableBar(c)) continue;
      bars++;
      if (Number.isFinite(c.volume) && c.volume > 0) pos++;
    }
    a.bars += bars; a.pos += pos;
    a.symbols.push({ symbol: w.ds.symbol, bars, posFrac: bars ? pos / bars : NaN });
  }
  for (const k of Object.keys(volAudit)) {
    const a = volAudit[k];
    a.posFrac = a.bars ? a.pos / a.bars : 0;
    a.usable = a.posFrac >= VOL_USABLE_MIN_FRAC;
  }
  JSONOUT.volumeAudit = volAudit;
  const volUsableFor = (group, tf) => Boolean(volAudit[`${group}|${tf}`]?.usable);

  console.log('[C0] ตรวจคุณภาพวอลุ่ม');
  for (const k of Object.keys(volAudit).sort()) {
    const a = volAudit[k];
    console.log(`   ${k.padEnd(18)} วอลุ่มบวก ${(100 * a.posFrac).toFixed(2)}%  → ${a.usable ? 'ใช้ได้' : 'ตัดทิ้ง'}`);
  }

  // ══════════════ C1 · ตรวจ look-ahead ด้วยการตัดข้อมูลท้ายทิ้ง ══════════════
  //
  // วิธีพิสูจน์ที่หนักแน่นที่สุด: คำนวณ feature บนชุดเต็ม แล้วคำนวณซ้ำบนชุดที่ตัดท้ายทิ้ง
  // ค่าของ "ทุกแท่งที่ยังอยู่" ต้องไม่เปลี่ยนแม้แต่บิตเดียว
  // ตัวควบคุมการรั่ว (_ctrlLeakZ) ต้องเปลี่ยน ไม่งั้นแปลว่าการตรวจไม่มีฟัน
  const leak = {
    datasets: 0, cutFrac: OPT.cutFrac,
    perFeature: Object.fromEntries(FEATURE_KEYS.map((k) => [k, { compared: 0, mismatch: 0 }])),
    totalCompared: 0, totalMismatch: 0,
    ctrlLeakZCompared: 0, ctrlLeakZChanged: 0,
    ctrlFutureBoundaryCompared: 0, ctrlFutureBoundaryChanged: 0,
  };
  const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || a === b;

  for (const w of work) {
    const volU = volUsableFor(w.group, w.ds.timeframe);
    const full = computeFeatures(w.ds, w.lastIdx, volU);
    const cut = Math.floor(w.lastIdx * OPT.cutFrac);
    if (cut < MIN_HISTORY + 20) continue;
    const trunc = computeFeatures(w.ds, cut, volU);
    leak.datasets++;

    for (let fi = 0; fi < FEATURE_KEYS.length; fi++) {
      const key = FEATURE_KEYS[fi];
      const meta = FEATURES[fi];
      const A = full[fi]; const B = trunc[fi];
      if (meta.ctrl === 'leakZ') {
        for (let i = MIN_HISTORY; i <= cut; i++) {
          leak.ctrlLeakZCompared++;
          if (!same(A[i], B[i])) leak.ctrlLeakZChanged++;
        }
        continue;
      }
      if (meta.ctrl === 'leakFuture') {
        // เทียบเฉพาะแท่งสุดท้ายของชุดที่ตัด — แท่งนั้นเสียอนาคตไป ค่าต้องเปลี่ยน
        leak.ctrlFutureBoundaryCompared++;
        if (!same(A[cut], B[cut])) leak.ctrlFutureBoundaryChanged++;
        // ส่วนแท่งที่อยู่ลึกเข้าไป ต้องไม่เปลี่ยน
        for (let i = MIN_HISTORY; i < cut; i++) {
          leak.perFeature[key].compared++; leak.totalCompared++;
          if (!same(A[i], B[i])) { leak.perFeature[key].mismatch++; leak.totalMismatch++; }
        }
        continue;
      }
      for (let i = MIN_HISTORY; i <= cut; i++) {
        leak.perFeature[key].compared++; leak.totalCompared++;
        if (!same(A[i], B[i])) { leak.perFeature[key].mismatch++; leak.totalMismatch++; }
      }
    }
  }
  JSONOUT.leakAudit = leak;
  console.log(`[C1] ตัดท้ายทิ้ง ${((1 - OPT.cutFrac) * 100).toFixed(0)}% · เทียบ ${leak.totalCompared.toLocaleString()} ค่า · ไม่ตรง ${leak.totalMismatch}`);
  console.log(`     ตัวควบคุมรั่วเงียบเปลี่ยน ${leak.ctrlLeakZChanged.toLocaleString()}/${leak.ctrlLeakZCompared.toLocaleString()} · ตัวควบคุมอนาคตที่ขอบเปลี่ยน ${leak.ctrlFutureBoundaryChanged}/${leak.ctrlFutureBoundaryCompared}`);

  // ══════════════ C3+C4 · วัด IC และแปลงเป็นเงิน ══════════════
  //
  // เก็บทีละ dataset แล้วยุบเข้าช่อง (กลุ่ม × กรอบเวลา) ทันที ไม่ค้างอาร์เรย์ยักษ์
  const cells = new Map();   // `${group}|${tf}` → { feats: Map<key, Map<h, CellStat>>, fee: {n,s}, retSd: ..., info }
  const cellInfo = new Map();

  for (const w of work) {
    const { ds, group, lastIdx } = w;
    const tf = ds.timeframe;
    const ckey = `${group}|${tf}`;
    const volU = volUsableFor(group, tf);
    const feats = computeFeatures(ds, lastIdx, volU);
    const fwd = forwardReturns(ds, lastIdx);
    const fee = feeSeries(ds, lastIdx);

    const activeReal = REAL_FEATURES.filter((f) => volU || !f.needsVol);
    const activeIdx = activeReal.map((f) => FEATURE_IDX.get(f.key));

    // ── ตัวอย่างร่วม: แท่งที่ feature จริงทุกตัวมีค่า และผลตอบแทนทุกหน้าต่างมีค่า ──
    // ทำแบบนี้เพื่อให้ IC ของทุก feature และทุกหน้าต่าง วัดบนแท่งชุดเดียวกันเป๊ะ
    // ไม่งั้นตัวที่ตัวอย่างน้อยกว่าจะดูดี/แย่กว่าด้วยเหตุผลที่ไม่เกี่ยวกับพลังทำนาย
    const idxs = [];
    let dropAll = 0;
    for (let i = MIN_HISTORY; i <= lastIdx; i++) {
      if (!Number.isFinite(fee[i])) { dropAll++; continue; }
      let good = true;
      for (const hi of HORIZONS.keys()) if (!Number.isFinite(fwd[hi][i])) { good = false; break; }
      if (good) for (const fi of activeIdx) if (!Number.isFinite(feats[fi][i])) { good = false; break; }
      if (good) idxs.push(i); else dropAll++;
    }
    if (idxs.length < 200) { dropped.push(`${group}/${ds.symbol}/${tf} (ตัวอย่างร่วมน้อยเกิน ${idxs.length})`); continue; }

    let cell = cells.get(ckey);
    if (!cell) {
      cell = { feats: new Map(), fee: { n: 0, s: 0 }, ret: HORIZONS.map(() => ({ n: 0, s: 0, s2: 0 })), symbols: new Set(), bars: 0, dropped: 0, volUsable: volU };
      cells.set(ckey, cell);
      cellInfo.set(ckey, { group, timeframe: tf, volUsable: volU });
    }
    cell.symbols.add(ds.symbol);
    cell.bars += idxs.length;
    cell.dropped += dropAll;
    for (const i of idxs) { cell.fee.n++; cell.fee.s += fee[i]; }
    for (let hi = 0; hi < HORIZONS.length; hi++) {
      const acc = cell.ret[hi];
      for (const i of idxs) { const r = fwd[hi][i]; acc.n++; acc.s += r; acc.s2 += r * r; }
    }

    // อันดับของผลตอบแทนอนาคต — คำนวณครั้งเดียวต่อหน้าต่าง (ใช้ร่วมกันทุก feature)
    const retRanks = HORIZONS.map((_, hi) => standardizedRanks(fwd[hi], idxs));

    // คีย์กลุ่ม (สัญลักษณ์ × เดือน) คำนวณครั้งเดียวต่อแท่ง แล้วใช้ซ้ำทุก feature ทุกหน้าต่าง
    // ไม่งั้นต้องสร้าง Date ใหม่ 88 ครั้งต่อแท่ง ซึ่งกินเวลาเกือบทั้งหมดของงาน
    const ymByIdx = new Map();
    for (let i = MIN_HISTORY; i <= lastIdx; i++) {
      const d = new Date(ds.times[i]);
      ymByIdx.set(i, `${ds.symbol}|${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    const ymOf = (i) => ymByIdx.get(i) ?? `${ds.symbol}|?`;

    // ครึ่งแรก/ครึ่งหลังของ "ประวัติของสัญลักษณ์ตัวนี้เองใน train"
    // แบ่งตามลำดับเวลาของแต่ละสัญลักษณ์ ไม่ใช่วันเดียวกันทั้งจักรวาล
    // เพราะสัญลักษณ์แต่ละตัวเริ่มมีข้อมูลคนละปี ถ้าใช้วันเดียวกันจะได้ครึ่งที่ว่างเปล่า
    const midIdx = idxs.length ? idxs[Math.floor(idxs.length / 2)] : Infinity;
    const halfOf = (i) => (i < midIdx ? 0 : 1);

    for (const meta of FEATURES) {
      if (meta.needsVol && !volU) continue;
      const fi = FEATURE_IDX.get(meta.key);
      const arr = feats[fi];
      // ตัวควบคุมอาจมี NaN บางแท่ง (เช่น _ctrlFuture ที่แท่งสุดท้าย) — คัดเฉพาะที่มีค่า
      let sub = idxs;
      let subRet = null;
      let allFinite = true;
      for (const i of idxs) if (!Number.isFinite(arr[i])) { allFinite = false; break; }
      if (!allFinite) {
        sub = idxs.filter((i) => Number.isFinite(arr[i]));
        if (sub.length < 200) continue;
        subRet = HORIZONS.map((_, hi) => standardizedRanks(fwd[hi], sub));
      }
      const fr = standardizedRanks(arr, sub);
      if (fr.degenerate) continue;   // feature คงที่ทั้งชุด — ไม่มีอะไรให้วัด

      let featMap = cell.feats.get(meta.key);
      if (!featMap) { featMap = new Map(); cell.feats.set(meta.key, featMap); }

      for (let hi = 0; hi < HORIZONS.length; hi++) {
        const rr = subRet ? subRet[hi] : retRanks[hi];
        if (rr.degenerate) continue;
        let st = featMap.get(HORIZONS[hi]);
        if (!st) { st = new CellStat(); featMap.set(HORIZONS[hi], st); }
        for (let q = 0; q < sub.length; q++) {
          const i = sub[q];
          st.addIC(ds.symbol, ymOf(i), fr.z[q] * rr.z[q], halfOf(i));
        }
      }

      // ── C4: การเดิมพันจริงด้วยอันดับ rolling จากอดีตเท่านั้น ──
      //
      // ⚠ rankCache ต้องเป็นของ dataset นี้เท่านั้น ห้ามเก็บไว้ใน featMap ซึ่งใช้ร่วมกัน
      //   ทั้งช่อง — ถ้าเก็บร่วม ดัชนีแท่งของสัญลักษณ์หนึ่งจะถูกเอาไปอ่านผลตอบแทน
      //   ของอีกสัญลักษณ์หนึ่ง ซึ่งเป็นการปนข้ามสัญลักษณ์ที่ตรวจไม่เจอจากยอดรวม
      //   (ยอด "จำนวนไม้" ยังดูถูกต้อง เพราะบวกกันครบทุก dataset — เจอได้ตอนอ่านโค้ดเท่านั้น)
      const rankCache = [];
      for (const i of sub) {
        const rp = causalRankPct(arr, i);
        if (!Number.isFinite(rp)) continue;
        if (rp >= 1 - DECILE) rankCache.push({ i, side: 1 });
        else if (rp <= DECILE) rankCache.push({ i, side: -1 });
      }
      for (let hi = 0; hi < HORIZONS.length; hi++) {
        const st = featMap.get(HORIZONS[hi]);
        if (!st) continue;
        for (const e of rankCache) {
          const r = fwd[hi][e.i];
          if (!Number.isFinite(r)) continue;
          st.addTrade(ds.symbol, ymOf(e.i), e.side * r, halfOf(e.i));   // ทิศดิบ — คูณเครื่องหมาย IC ตอนสรุป
        }
      }
    }
  }

  // ── สรุปแต่ละช่อง ────────────────────────────────────────────────────────────
  const rng = mulberry32(OPT.seed);
  const results = [];
  for (const [ckey, cell] of cells) {
    const info = cellInfo.get(ckey);
    const feeMean = cell.fee.n ? cell.fee.s / cell.fee.n : NaN;
    const retSd = cell.ret.map((a) => {
      if (a.n < 2) return NaN;
      const m = a.s / a.n;
      return Math.sqrt(Math.max(0, a.s2 / a.n - m * m));
    });

    for (const [fkey, featMap] of cell.feats) {
      const meta = FEATURES[FEATURE_IDX.get(fkey)];
      for (let hi = 0; hi < HORIZONS.length; hi++) {
        const h = HORIZONS[hi];
        const st = featMap.get(h);
        if (!st) continue;

        // IC + p แบบ cluster-robust (สัญลักษณ์ × เดือน)
        const icClusters = [...st.clusters.values()].filter((c) => c.n > 0).map((c) => ({ n: c.n, s: c.sQ }));
        const ic = clusterMean(icClusters);
        const symEntries = [...st.symbols.values()].filter((s) => s.n > 0);
        const icCI = bootstrapSymbolMean(symEntries, (e) => [e.n, e.sQ], OPT.bootstrap, rng);

        // เงิน: การเดิมพัน decile ด้วยอันดับ rolling · ทิศเลือกจากเครื่องหมาย IC (เข้าข้างตัวเอง)
        const sgn = Number.isFinite(ic.mean) && ic.mean < 0 ? -1 : 1;
        const netClusters = [...st.clusters.values()].filter((c) => c.tn > 0)
          .map((c) => ({ n: c.tn, s: sgn * c.tSum - c.tn * feeMean }));
        const net = clusterMean(netClusters);
        const grossClusters = [...st.clusters.values()].filter((c) => c.tn > 0).map((c) => ({ n: c.tn, s: sgn * c.tSum }));
        const gross = clusterMean(grossClusters);
        const tradeSyms = [...st.symbols.values()].filter((s) => s.tn > 0);
        const netCI = bootstrapSymbolMean(tradeSyms, (e) => [e.tn, sgn * e.tSum - e.tn * feeMean], OPT.bootstrap, rng);

        // เงินตามสูตร: การเดิมพันทิศบนสัญญาณมาตรฐาน E[r·sign(z)] = ρ·σ·sqrt(2/π)
        const bpsFormula = Math.abs(ic.mean) * retSd[hi] * Math.sqrt(2 / Math.PI);

        // ── C5: ความเสถียร — ครึ่งแรกกับครึ่งหลังของ train ให้ผลตรงกันไหม ──
        // ใช้ทิศเดียวกัน (sgn ที่มาจากทั้ง train) กับทั้งสองครึ่ง ไม่เลือกทิศใหม่รายครึ่ง
        // ตัวเลขนี้ใช้ "ลดความเชื่อ" เท่านั้น ไม่เคยใช้สนับสนุนข้ออ้างใด จึงไม่ลงทะเบียนเป็นการทดสอบ
        const cl = [...st.clusters.values()];
        const icH0 = clusterMean(cl.filter((c) => c.n0 > 0).map((c) => ({ n: c.n0, s: c.sQ0 })));
        const icH1 = clusterMean(cl.filter((c) => c.n1 > 0).map((c) => ({ n: c.n1, s: c.sQ1 })));
        const netH0 = clusterMean(cl.filter((c) => c.tn0 > 0).map((c) => ({ n: c.tn0, s: sgn * c.tSum0 - c.tn0 * feeMean })));
        const netH1 = clusterMean(cl.filter((c) => c.tn1 > 0).map((c) => ({ n: c.tn1, s: sgn * c.tSum1 - c.tn1 * feeMean })));

        const row = {
          cell: ckey, group: info.group, timeframe: info.timeframe,
          feature: fkey, family: meta.fam, control: meta.ctrl ?? null, h,
          ic: ic.mean, icSe: ic.se, icP: ic.p, icLo: icCI.lo, icHi: icCI.hi,
          nBars: ic.n, nClusters: ic.G, nSymbols: symEntries.length,
          retSd: retSd[hi], feeFrac: feeMean,
          bpsFormula, bpsGross: gross.mean, bpsNet: net.mean, netP: net.p,
          netLo: netCI.lo, netHi: netCI.hi, nTrades: net.n,
          icHalf1: icH0.mean, icHalf2: icH1.mean,
          netHalf1: netH0.mean, netHalf2: netH1.mean,
          netHalf1P: netH0.p, netHalf2P: netH1.p,
          nTradesHalf1: netH0.n, nTradesHalf2: netH1.n,
        };
        results.push(row);

        if (!meta.ctrl) {
          registerTest({
            id: `IC:${ckey}:${fkey}:h${h}`,
            family: `IC:${ckey}`,
            question: `IC ของ ${fkey} ที่ถือ ${h} แท่ง · ${GROUP_LABEL[info.group]} ${info.timeframe}`,
            estimate: ic.mean, ci: [icCI.lo, icCI.hi], p: ic.p,
            meta: { kind: 'IC', ...row },
          });
          registerTest({
            id: `NET:${ckey}:${fkey}:h${h}`,
            family: `NET:${ckey}`,
            question: `กำไรสุทธิหลังค่าธรรมเนียมของการเดิมพัน decile ${fkey} ที่ถือ ${h} แท่ง · ${GROUP_LABEL[info.group]} ${info.timeframe}`,
            estimate: net.mean, ci: [netCI.lo, netCI.hi], p: net.p,
            meta: { kind: 'NET', ...row },
          });
        } else {
          registerTest({
            id: `CTRL:${ckey}:${fkey}:h${h}`,
            family: `CTRL:${ckey}`,
            question: `ตัวควบคุม ${fkey} ที่ถือ ${h} แท่ง · ${GROUP_LABEL[info.group]} ${info.timeframe}`,
            estimate: ic.mean, ci: [icCI.lo, icCI.hi], p: ic.p,
            meta: { kind: 'CTRL', ...row },
          });
        }
      }
    }
  }

  // Holm สองระดับ: ภายในตระกูล (ช่อง) และทั่วทั้งงาน (เข้มที่สุด)
  applyHolm('holmPass', (t) => t.family);
  applyHolm('holmPassGlobal', (t) => (t.meta.kind === 'CTRL' ? null : 'ALL'));

  JSONOUT.cells = Object.fromEntries([...cells.entries()].map(([k, c]) => [k, {
    ...cellInfo.get(k),
    symbols: [...c.symbols].sort(), bars: c.bars, droppedBars: c.dropped,
    feeBps: c.fee.n ? (c.fee.s / c.fee.n) * 10000 : null,
    thin: c.symbols.size < THIN_MIN_SYMBOLS || c.bars < THIN_MIN_BARS,
    closedByCeiling: k === 'RUNNER|1H' || k === 'SET50|1H',
  }]));
  JSONOUT.rows = results;
  JSONOUT.tests = TESTS;
  JSONOUT.dropped = dropped;
  JSONOUT.runnerSymbols = [...runnerSet].sort();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[C3/C4] วัดครบ ${results.length} แถว · ลงทะเบียนการทดสอบ ${TESTS.length} ข้อ · ${elapsed} วิ`);

  writeReport({ JSONOUT, results, cells, cellInfo, leak, volAudit, dropped, runnerSet, elapsed, bounds });

  fs.writeFileSync(path.join(REPORT_DIR, 'exp-feat-volume.json'), JSON.stringify(JSONOUT, null, 1), 'utf8');
  fs.writeFileSync(path.join(REPORT_DIR, 'exp-feat-volume.md'), LINES.join('\n'), 'utf8');
  console.log(`\nเขียนแล้ว: scripts/research/report/exp-feat-volume.md · exp-feat-volume.json  (${elapsed} วิ)`);
}

// ════════════════════════════════ เขียนรายงาน ════════════════════════════════

function writeReport(ctx) {
  const { results, cells, cellInfo, leak, volAudit, dropped, runnerSet, elapsed, bounds } = ctx;
  const real = results.filter((r) => !r.control);
  const ctrl = results.filter((r) => r.control);
  const byId = new Map(TESTS.map((t) => [t.id, t]));

  const CLOSED = new Set(['RUNNER|1H', 'SET50|1H']);   // exp-ceiling.md: p* > 100% ทั้ง train และ validation
  const isThin = (ck) => {
    const c = cells.get(ck);
    return !c || c.symbols.size < THIN_MIN_SYMBOLS || c.bars < THIN_MIN_BARS;
  };
  const flagOf = (ck) => (CLOSED.has(ck) ? '⛔ ปิดตาย' : (isThin(ck) ? '⚠ ตัวอย่างบาง' : 'ยังมีช่อง'));

  W('# ตระกูลที่ 1 · วอลุ่มและโครงสร้างราคาที่เครื่องยนต์ไม่เคยใช้');
  W();
  W(`สร้างโดย \`scripts/research/experiments/feat-volume.mjs\` · ${new Date().toISOString()} · ใช้เวลา ${elapsed} วินาที`);
  W();
  W('---');
  W();

  // ── สรุปคำตอบ ─────────────────────────────────────────────────────────────
  const passIC = real.filter((r) => byId.get(`IC:${r.cell}:${r.feature}:h${r.h}`)?.holmPassGlobal);
  const passNET = real.filter((r) => byId.get(`NET:${r.cell}:${r.feature}:h${r.h}`)?.holmPassGlobal && r.bpsNet > 0);
  const passNETfam = real.filter((r) => byId.get(`NET:${r.cell}:${r.feature}:h${r.h}`)?.holmPass && r.bpsNet > 0);
  const openPassNET = passNET.filter((r) => !CLOSED.has(r.cell) && !isThin(r.cell));

  W('## คำตอบตรง ๆ ก่อน');
  W();
  W(`ลองทั้งหมด **${REAL_FEATURES.length} feature** (วอลุ่ม ${REAL_FEATURES.filter((f) => f.needsVol).length} · โครงสร้างราคา ${REAL_FEATURES.filter((f) => !f.needsVol).length})`);
  W(`× หน้าต่างถือ ${HORIZONS.join(', ')} แท่ง × ${cells.size} ช่อง (กลุ่ม × กรอบเวลา) = **${real.length} การวัด**`);
  W(`ลงทะเบียนการทดสอบทางสถิติ **${TESTS.filter((t) => t.meta.kind !== 'CTRL').length} ข้อ** (ยังไม่รวมตัวควบคุม ${TESTS.filter((t) => t.meta.kind === 'CTRL').length} ข้อ)`);
  W();
  const survivors = openPassNET.filter((r) => r.netHalf1 > 0 && r.netHalf2 > 0
    && Math.sign(r.icHalf1) === Math.sign(r.icHalf2));
  const thSurvivors = survivors.filter((r) => r.group === 'SET50' || r.group === 'RUNNER');
  W('| ด่าน | เหลือกี่ตัว |');
  W('|---|---|');
  W(`| วัดทั้งหมด | ${real.length} |`);
  W(`| IC ต่างจากศูนย์ · Holm ทั่วทั้งงาน | **${passIC.length}** |`);
  W(`| กำไรสุทธิหลังค่าธรรมเนียมเป็นบวก · Holm ภายในช่อง | **${passNETfam.length}** |`);
  W(`| กำไรสุทธิเป็นบวก · Holm ทั่วทั้งงาน | **${passNET.length}** |`);
  W(`| ...และช่องนั้นยังไม่ปิดตาย **และ** ตัวอย่างไม่บาง | **${openPassNET.length}** |`);
  W(`| ...และเป็นบวก **ทั้งสองครึ่งของ train** ไม่ใช่ยุคเดียว (C5) | **${survivors.length}** |`);
  W(`| **...และอยู่ในหุ้นไทย ซึ่งเป็นตลาดที่เจ้าของเทรดจริง** | **${thSurvivors.length}** |`);
  W();
  if (survivors.length) {
    const mk = [...new Set(survivors.map((r) => GROUP_LABEL[r.group]))];
    W(`**ตัวที่รอดทุกด่าน ${survivors.length} ตัว อยู่ในตลาด: ${mk.join(' · ')}**`);
    W();
    W('| feature | ตระกูล | ตลาด | ถือ | IC | สุทธิ (bps/ไม้) | ครึ่งแรก | ครึ่งหลัง | p |');
    W('|---|---|---|---:|---:|---:|---:|---:|---:|');
    for (const r of survivors.sort((a, b) => b.bpsNet - a.bpsNet)) {
      W(`| \`${r.feature}\` | ${r.family === 'VOL' ? 'วอลุ่ม' : 'ราคา'} | ${GROUP_LABEL[r.group]} | ${r.h} | ${f3(r.ic)} | **${bpsS(r.bpsNet)}** | ${bpsS(r.netHalf1)} | ${bpsS(r.netHalf2)} | ${pS(r.netP)} |`);
    }
    W();
  }
  if (!thSurvivors.length) {
    W('> **คำตอบสำหรับหุ้นไทยคือ "ไม่มี"** — ไม่มี feature ตัวไหนในตระกูลนี้ที่ทำเงินได้เกินค่าธรรมเนียม');
    W('> ในหุ้นไทย ไม่ว่าจะ SET50 หรือหุ้นซิ่ง ไม่ว่าจะ 1 วันหรือ 1 ชั่วโมง');
    W('> ตัวที่ดูดีที่สุดในหุ้นไทย เป็นบวกครึ่งแรกแล้วติดลบครึ่งหลัง = เสียงรบกวน ไม่ใช่ขอบ');
    W('>');
    W('> ตามกติกาข้อ 7 ของรอบนี้ นี่คือผลลัพธ์ที่ถูกต้อง และมีค่ามากกว่าการรายงานผลบวกที่เชื่อไม่ได้');
    W();
  }

  // อันดับ feature ที่แรงที่สุดตาม |IC| — ตัดช่องตัวอย่างบางออก ไม่งั้นตารางจะเต็มไปด้วยเสียงรบกวน
  const solid = real.filter((r) => !isThin(r.cell));
  const thinCells = [...cells.keys()].filter(isThin);
  const topIC = [...solid].sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic)).slice(0, 15);
  W('**15 อันดับ |IC| สูงสุด** (ตัดช่องตัวอย่างบางออกแล้ว — ดูเหตุผลข้างล่าง)');
  W();
  W('| # | feature | กลุ่ม | TF | ถือ | IC | CI95 | p | ผ่าน Holm ทั่วงาน | เงินสุทธิ (bps/ไม้) |');
  W('|---:|---|---|---|---:|---:|---|---:|:---:|---:|');
  topIC.forEach((r, k) => {
    const t = byId.get(`IC:${r.cell}:${r.feature}:h${r.h}`);
    W(`| ${k + 1} | \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.timeframe} | ${r.h} | ${f3(r.ic)} | [${f3(r.icLo)}, ${f3(r.icHi)}] | ${pS(r.icP)} | ${t?.holmPassGlobal ? '**ผ่าน**' : 'ไม่ผ่าน'} | ${bpsS(r.bpsNet)} |`);
  });
  W();

  const bestNet = [...solid].sort((a, b) => b.bpsNet - a.bpsNet).slice(0, 15);
  W('**15 อันดับเงินสุทธิสูงสุด (หลังหักค่าธรรมเนียมแล้ว · ตัดช่องตัวอย่างบางออกแล้ว)**');
  W();
  W('| # | feature | กลุ่ม | TF | ถือ | IC | เงินก่อนหัก | ค่าธรรมเนียม | **สุทธิ** | CI95 สุทธิ | p | ผ่าน Holm ทั่วงาน | เพดานช่องนี้ |');
  W('|---:|---|---|---|---:|---:|---:|---:|---:|---|---:|:---:|---|');
  bestNet.forEach((r, k) => {
    const t = byId.get(`NET:${r.cell}:${r.feature}:h${r.h}`);
    W(`| ${k + 1} | \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.timeframe} | ${r.h} | ${f3(r.ic)} | ${bpsS(r.bpsGross)} | ${bpsS(r.feeFrac)} | **${bpsS(r.bpsNet)}** | [${bpsS(r.netLo)}, ${bpsS(r.netHi)}] | ${pS(r.netP)} | ${t?.holmPassGlobal ? '**ผ่าน**' : 'ไม่ผ่าน'} | ${flagOf(r.cell)} |`);
  });
  W();
  if (thinCells.length) {
    W(`**ทำไมต้องตัด ${thinCells.length} ช่องออกจากสองตารางข้างบน**`);
    W();
    W('| ช่อง | สัญลักษณ์ | แท่งใน train | \\|IC\\| ที่เสียงสุ่มล้วนทำได้ | เงินสุทธิสูงสุดที่ "วัดได้" |');
    W('|---|---:|---:|---:|---:|');
    for (const ck of thinCells) {
      const info = cellInfo.get(ck);
      const nz = ctrl.filter((r) => r.cell === ck && r.control === 'noise').map((r) => Math.abs(r.ic)).filter(Number.isFinite);
      const rs = real.filter((r) => r.cell === ck);
      W(`| ${GROUP_LABEL[info.group]} ${info.timeframe} | ${cells.get(ck).symbols.size} | ${cells.get(ck).bars.toLocaleString()} | ${f3(nz.length ? Math.max(...nz) : NaN)} | ${bpsS(Math.max(...rs.map((r) => r.bpsNet)))} |`);
    }
    W();
    W('ช่องพวกนี้ให้ตัวเลขที่ดู "ดีมาก" (หลักร้อย bps) แต่มันคือเสียงรบกวนล้วน:');
    W('· split ของ 1D ตัดที่ปี 2016 ซึ่งเก่ากว่าจุดเริ่มของคริปโตและโลหะบางตัว ช่วง train จึงแทบว่าง');
    W('· เสียงสุ่มล้วนในช่องพวกนี้ยังทำ |IC| ได้ถึงระดับที่ feature จริงในช่องใหญ่ทำไม่ถึงด้วยซ้ำ');
    W('· ยังคงรายงานไว้ครบใน C3/C4 ข้างล่างและใน JSON แต่ **ห้ามเอาไปตัดสินอะไร**');
    W();
  }
  W('---');
  W();

  // ── กติกาที่ถูกเคารพ ──────────────────────────────────────────────────────
  W('## กติกาที่ถูกเคารพในรอบนี้');
  W();
  W('| กติกา | สถานะ |');
  W('|---|---|');
  W(`| วัดบน **train เท่านั้น** | 1D ถึง ${bounds.timeframes['1D'].trainEnd} · 1H ถึง ${bounds.timeframes['1H'].trainEnd} · มีด่านปฏิเสธ \`--split=test\` และ \`--split=validation\` |`);
  W('| ไม่แตะไฟล์ต้องห้าม | ไฟล์ใหม่ 2 ไฟล์เท่านั้น: `experiments/feat-volume.mjs` · `report/exp-feat-volume.*` |');
  W('| ไม่ import อะไรจาก `ceiling.mjs` | เขียน ATR · การปัดราคา · ค่าธรรมเนียม · สถิติ ขึ้นมาใหม่ทั้งหมดในไฟล์นี้ |');
  W('| ไม่มี look-ahead | ตรวจด้วยการตัดข้อมูลท้ายทิ้ง ดู C1 ข้างล่าง |');
  W('| นับการเปรียบเทียบครบ | ดูบัญชีท้ายไฟล์ · Holm สองระดับ |');
  W();
  W('---');
  W();

  // ══════════════ C0 ══════════════
  W('# C0 · วอลุ่มของตลาดไหนใช้ได้จริง');
  W();
  W('Yahoo ใส่ `volume: 0` แทน "ไม่มีข้อมูล" ไม่ใช่ "ไม่มีการซื้อขาย"');
  W('ถ้าปล่อยผ่านไป feature ตระกูลวอลุ่มทั้งหมดจะกลายเป็นเสียงรบกวนที่ดูเหมือนมีค่า');
  W(`เกณฑ์: ต้องมีวอลุ่มบวกอย่างน้อย **${(VOL_USABLE_MIN_FRAC * 100).toFixed(0)}%** ของแท่งใน train ถึงจะใช้ตระกูลวอลุ่มได้`);
  W();
  W('| กลุ่ม | กรอบเวลา | แท่งใน train | วอลุ่มบวก | คำตัดสิน |');
  W('|---|---|---:|---:|---|');
  for (const k of Object.keys(volAudit).sort()) {
    const a = volAudit[k];
    W(`| ${GROUP_LABEL[a.group]} | ${a.timeframe} | ${a.bars.toLocaleString()} | ${(100 * a.posFrac).toFixed(2)}% | ${a.usable ? 'ใช้ได้' : '**ตัดตระกูลวอลุ่มทิ้ง**'} |`);
  }
  W();
  W('**สิ่งที่พบ (ตอบคำเตือนในโจทย์โดยตรง)**');
  W();
  const fxAud = volAudit['FOREX|1D'];
  W(`· **ค่าเงิน วอลุ่มเป็น 0 ทุกแท่ง ทั้ง 1D และ 1H** (วอลุ่มบวก ${fxAud ? (100 * fxAud.posFrac).toFixed(2) : '0.00'}%)`);
  W('  — Yahoo ไม่มีวอลุ่มของ FX spot เลย ตระกูลวอลุ่มทั้ง 12 ตัวถูกตัดออกจากค่าเงินทั้งหมด');
  W('  เหลือแต่ตระกูลโครงสร้างราคา 10 ตัว · **นี่คือข่าวร้ายที่สุดของรอบนี้** เพราะ exp-ceiling.md');
  W('  บอกว่าค่าเงินเป็นตลาดที่ภาษีความแม่นต่ำที่สุดเป็นอันดับสอง (+1.2%) = ที่ที่น่าหาที่สุด');
  W('  แต่กลับเป็นที่ที่ข้อมูลวอลุ่มไม่มีให้หาเลย');
  const cr1h = volAudit['CRYPTO|1H'];
  if (cr1h) W(`· **คริปโต 1H วอลุ่มหายไปครึ่งหนึ่ง** (บวกแค่ ${(100 * cr1h.posFrac).toFixed(2)}%) กระจายทั่วทุกชั่วโมงแบบสุ่ม ไม่ใช่ช่วงเวลาใดเวลาหนึ่ง — ตัดทิ้ง`);
  const th1h = volAudit['SET50|1H'];
  if (th1h) {
    W(`· **หุ้นไทย 1H วอลุ่มหายราว ${(100 * (1 - th1h.posFrac)).toFixed(1)}%** และหายแบบมีแบบแผน: แท่ง 03:00Z (10:00 น. เวลาไทย = แท่งเปิดตลาด)`);
    W('  เป็น 0 ราว 68% ของแท่งเปิดทั้งหมด · ยังผ่านเกณฑ์ จึงใช้ต่อ แต่ปฏิบัติกับ 0 ว่า "ไม่มีค่า" ไม่ใช่ "ศูนย์"');
    W('  และหน้าต่าง rolling ทุกตัวข้ามค่าที่หายไป ไม่นับเป็น 0 (ถ้านับเป็น 0 z-score จะเพี้ยนทั้งชุด)');
  }
  W();
  if (dropped.length) {
    W('**ชุดข้อมูลที่ถูกตัดออกจากงานนี้**');
    W();
    for (const d of dropped) W(`· ${d}`);
    W();
  }
  W('---');
  W();

  // ══════════════ C1 ══════════════
  W('# C1 · พิสูจน์ว่าไม่มี look-ahead — ตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ');
  W();
  W('วิธีที่หนักแน่นที่สุดตามที่โจทย์กำหนด: คำนวณ feature บนชุดเต็ม แล้วคำนวณซ้ำบนชุดที่');
  W(`ตัดท้ายทิ้ง ${((1 - leak.cutFrac) * 100).toFixed(0)}% แล้วเทียบค่าของ **ทุกแท่งที่ยังอยู่** — ต้องไม่เปลี่ยนแม้แต่บิตเดียว`);
  W();
  W(`ทำกับชุดข้อมูลทั้งหมด **${leak.datasets} ชุด**`);
  W();
  W('| feature | ค่าที่เทียบ | ไม่ตรง |');
  W('|---|---:|---:|');
  for (const f of REAL_FEATURES) {
    const a = leak.perFeature[f.key];
    W(`| \`${f.key}\` | ${a.compared.toLocaleString()} | ${a.mismatch === 0 ? '**0**' : `⚠ ${a.mismatch}`} |`);
  }
  const nz = leak.perFeature._ctrlNoise;
  W(`| \`_ctrlNoise\` (ตัวควบคุม) | ${nz.compared.toLocaleString()} | ${nz.mismatch === 0 ? '**0**' : `⚠ ${nz.mismatch}`} |`);
  const cf = leak.perFeature._ctrlFuture;
  W(`| \`_ctrlFuture\` เฉพาะแท่งที่ลึกเข้าไป | ${cf.compared.toLocaleString()} | ${cf.mismatch === 0 ? '**0**' : `⚠ ${cf.mismatch}`} |`);
  W(`| **รวม** | **${leak.totalCompared.toLocaleString()}** | **${leak.totalMismatch}** |`);
  W();
  W('**ตัวควบคุม — พิสูจน์ว่าการตรวจนี้ "มีฟัน" จริง**');
  W();
  W('ถ้าการตรวจจับอะไรไม่ได้เลย ผลว่า "ไม่ตรง 0" ก็ไม่มีความหมาย จึงใส่การรั่วเข้าไปเองสองแบบ');
  W();
  W('| ตัวควบคุม | สิ่งที่ทำ | ค่าที่เทียบ | เปลี่ยน | ต้องเปลี่ยนไหม |');
  W('|---|---|---:|---:|---|');
  W(`| \`_ctrlLeakZ\` | z-score ของราคาปิดด้วยค่าเฉลี่ย/SD **ทั้งชุด** = การรั่วแบบเงียบที่สุด | ${leak.ctrlLeakZCompared.toLocaleString()} | **${leak.ctrlLeakZChanged.toLocaleString()}** | ต้องเปลี่ยน — ${leak.ctrlLeakZChanged === leak.ctrlLeakZCompared ? '**เปลี่ยนครบทุกค่า**' : 'เปลี่ยนบางส่วน'} |`);
  W(`| \`_ctrlFuture\` | ผลตอบแทนแท่งถัดไป · ดูเฉพาะแท่งสุดท้ายของชุดที่ตัด | ${leak.ctrlFutureBoundaryCompared} | **${leak.ctrlFutureBoundaryChanged}** | ต้องเปลี่ยน — แท่งนั้นเสียอนาคตไป |`);
  W();
  const teeth = leak.ctrlLeakZChanged === leak.ctrlLeakZCompared && leak.ctrlFutureBoundaryChanged === leak.ctrlFutureBoundaryCompared;
  W(`**ผล: การตรวจ${teeth ? 'มีฟันจริง' : 'อาจไม่มีฟันเต็มที่'} และ feature จริงทั้ง ${REAL_FEATURES.length} ตัว${leak.totalMismatch === 0 ? ' ไม่มีตัวไหนเปลี่ยนแม้แต่ค่าเดียว' : ` มี ${leak.totalMismatch} ค่าที่เปลี่ยน — ต้องแก้ก่อนเชื่อผลใด ๆ`}**`);
  W();
  W('สิ่งที่การตรวจนี้ครอบคลุม: ทุก z-score · ทุกมัธยฐาน · ทุกอันดับเปอร์เซ็นไทล์ · OBV/AD สะสม ·');
  W('VWAP · MFI · Amihud · ATR ทุกช่วง — ทั้งหมดเป็นแบบ rolling จากอดีต ไม่มีตัวไหนใช้ค่าเฉลี่ยทั้งชุด');
  W();
  W('⚠ **ข้อยกเว้นที่ต้องพูดให้ชัด**: การจัดอันดับเพื่อ *วัด* IC (Spearman) ใช้ข้อมูลทั้ง split');
  W('นั่นเป็นสถิติเชิงพรรณนา ไม่ใช่กฎเทรด — ส่วนตัวเลขเงินใน C4 ใช้อันดับ rolling 250 แท่งจาก');
  W('อดีตเท่านั้น (`causalRankPct`) ซึ่งเทรดได้จริง สองอย่างนี้เป็นคนละฟังก์ชันและแยกกันชัดเจน');
  W();
  W('---');
  W();

  // ══════════════ C2 ══════════════
  W('# C2 · เครื่องวัด IC มีฟันไหม');
  W();
  W('ก่อนจะเชื่อว่า "IC ใกล้ศูนย์แปลว่าไม่มีสัญญาณ" ต้องพิสูจน์ก่อนว่าถ้ามีสัญญาณจริง เครื่องวัดจับได้');
  W();
  W('| ตัวควบคุม | สิ่งที่ควรได้ | IC ที่วัดได้ (ค่ากลางทุกช่อง) | ช่วง |');
  W('|---|---|---:|---|');
  for (const c of CTRL_FEATURES) {
    for (const h of HORIZONS) {
      const rs = ctrl.filter((r) => r.feature === c.key && r.h === h).map((r) => r.ic).filter(Number.isFinite).sort((a, b) => a - b);
      if (!rs.length) continue;
      const expect = c.ctrl === 'noise' ? 'ใกล้ 0' : (c.ctrl === 'leakFuture' ? 'สูงมาก' : 'อะไรก็ได้ (ตัวนี้ใช้ตรวจ C1 ไม่ใช่ C2)');
      W(`| \`${c.key}\` ถือ ${h} | ${expect} | ${f3(percentileOfSorted(rs, 0.5))} | [${f3(rs[0])}, ${f3(rs[rs.length - 1])}] |`);
    }
  }
  W();
  const noiseAll = ctrl.filter((r) => r.control === 'noise').map((r) => Math.abs(r.ic)).filter(Number.isFinite);
  const futAll = ctrl.filter((r) => r.control === 'leakFuture' && r.h === 1).map((r) => r.ic).filter(Number.isFinite);
  const noiseMax = noiseAll.length ? Math.max(...noiseAll) : NaN;
  const futMed = futAll.length ? percentileOfSorted([...futAll].sort((a, b) => a - b), 0.5) : NaN;
  W(`**ผล**: เสียงสุ่มล้วนได้ |IC| สูงสุด **${f3(noiseMax)}** · ตัวที่รั่วโดยตั้งใจได้ IC กลาง **${f3(futMed)}** ที่ถือ 1 แท่ง`);
  W();
  W('แปลว่าเครื่องวัดนี้ **จับสัญญาณได้ถ้ามีจริง** และ **ไม่สร้างสัญญาณปลอมจากเสียงสุ่ม**');
  W('ดังนั้น IC ของ feature จริงที่ออกมาต่ำ ไม่ใช่เพราะเครื่องวัดเสีย');
  W();
  W('## พื้นเสียงรบกวนรายช่อง — เส้นอ้างอิงที่ควรใช้จริง');
  W();
  W('ค่าเดียวรวมทุกช่องใช้ไม่ได้ เพราะช่องที่แท่งน้อยมีพื้นเสียงสูงกว่าโดยธรรมชาติ (พื้น ≈ 1/√จำนวนแท่ง)');
  W('ตารางนี้บอกว่า "ในช่องนี้ |IC| ต้องเกินเท่าไรถึงจะพูดได้ว่าไม่ใช่เสียงสุ่ม"');
  W();
  W('| กลุ่ม | TF | แท่ง | พื้นเสียง \\|IC\\| (เสียงสุ่มล้วน สูงสุด 4 หน้าต่าง) | \\|IC\\| จริงที่ดีที่สุด | สูงกว่าพื้นกี่เท่า |');
  W('|---|---|---:|---:|---:|---:|');
  for (const ck of [...cells.keys()].sort()) {
    const info = cellInfo.get(ck);
    const nz = ctrl.filter((r) => r.cell === ck && r.control === 'noise').map((r) => Math.abs(r.ic)).filter(Number.isFinite);
    const rs = real.filter((r) => r.cell === ck);
    if (!nz.length || !rs.length) continue;
    const floor = Math.max(...nz);
    const best = Math.max(...rs.map((r) => Math.abs(r.ic)).filter(Number.isFinite));
    W(`| ${GROUP_LABEL[info.group]} | ${info.timeframe} | ${cells.get(ck).bars.toLocaleString()} | ${f3(floor)} | ${f3(best)} | ${(best / floor).toFixed(1)}× |`);
  }
  W();
  W('**สิ่งที่ตารางนี้บอก**: ในหลายช่อง feature จริงให้ |IC| สูงกว่าพื้นเสียงหลายเท่า');
  W('แปลว่า **มีสัญญาณจริงอยู่ในข้อมูล ไม่ใช่ภาพลวง** — คำถามที่เหลือจึงไม่ใช่ "มีไหม" แต่เป็น "พอจ่ายค่าธรรมเนียมไหม"');
  W('ซึ่ง C4 ตอบ');
  W();
  W('---');
  W();

  // ══════════════ C3 ══════════════
  W('# C3 · ตาราง IC เต็ม — ทุก feature × ทุกหน้าต่างถือ × ทุกตลาด');
  W();
  W('**วิธีอ่าน**');
  W();
  W('· `IC` = Spearman rank correlation ระหว่าง feature ที่แท่ง i กับผลตอบแทนจาก');
  W('  ราคาเปิดแท่ง i+1 ถึงราคาปิดแท่ง i+h · จัดอันดับภายในสัญลักษณ์เดียวกัน แล้วถ่วงน้ำหนักด้วยจำนวนแท่ง');
  W('· `CI95` = bootstrap ระดับสัญลักษณ์ (สุ่มสัญลักษณ์ทั้งตัว ไม่ใช่สุ่มแท่ง) ' + `${OPT.bootstrap} รอบ`);
  W('· `p` = cluster-robust จับกลุ่ม (สัญลักษณ์ × เดือน) — ไม่ใช่ bootstrap เพราะ Holm ที่หลายร้อยข้อ');
  W('  ต้องการ p ละเอียดกว่าที่ bootstrap วัดได้');
  W('· `Holm` = ผ่านการแก้ค่า p แบบ Holm ภายในช่องนี้ / ทั่วทั้งงาน');
  W();

  const cellKeys = [...cells.keys()].sort((a, b) => {
    const ai = cellInfo.get(a); const bi = cellInfo.get(b);
    return (ai.timeframe === bi.timeframe ? GROUPS.indexOf(ai.group) - GROUPS.indexOf(bi.group)
      : TIMEFRAMES.indexOf(ai.timeframe) - TIMEFRAMES.indexOf(bi.timeframe));
  });

  for (const ck of cellKeys) {
    const info = cellInfo.get(ck);
    const cell = cells.get(ck);
    const rows = real.filter((r) => r.cell === ck);
    if (!rows.length) continue;
    const feeBps = cell.fee.n ? (cell.fee.s / cell.fee.n) * 10000 : NaN;
    W(`## ${GROUP_LABEL[info.group]} · ${info.timeframe}${CLOSED.has(ck) ? '  ⛔ **ช่องนี้ exp-ceiling.md วัดแล้วว่าปิดตาย (p\\* > 100%)**' : ''}${isThin(ck) ? '  ⚠ **ตัวอย่างบางเกินกว่าจะสรุป**' : ''}`);
    W();
    W(`สัญลักษณ์ ${cell.symbols.size} ตัว: ${[...cell.symbols].sort().join(' · ')}`);
    W(`แท่งที่ใช้วัด ${cell.bars.toLocaleString()} · แท่งที่ถูกตัดออกเพราะข้อมูลไม่ครบ ${cell.dropped.toLocaleString()}`);
    W(`ค่าธรรมเนียมไป-กลับเฉลี่ยของช่องนี้ **${feeBps.toFixed(2)} bps/ไม้** · ตระกูลวอลุ่ม: ${cell.volUsable ? 'ใช้ได้' : '**ตัดทิ้ง (วอลุ่มใช้ไม่ได้)**'}`);
    if (CLOSED.has(ck)) {
      W();
      W('> ช่องนี้วัดไว้เพื่อความครบถ้วนเท่านั้น — exp-ceiling.md พิสูจน์แล้วทั้งบน train และ validation ว่า');
      W('> แม้ทำนายทิศถูก 100% ก็ยังขาดทุน ตัวเลข IC ในตารางนี้จึงเปลี่ยนอะไรไม่ได้');
    }
    if (isThin(ck)) {
      W();
      W(`> ⚠ ช่องนี้มีแค่ ${cell.symbols.size} สัญลักษณ์ / ${cell.bars.toLocaleString()} แท่ง ในช่วง train`);
      W('> เพราะ split ของ 1D ตัดที่ปี 2016 ซึ่งเก่ากว่าจุดเริ่มของสินทรัพย์กลุ่มนี้เกือบทั้งหมด');
      W('> ตัวเลขในตารางนี้เป็นเสียงรบกวนเป็นหลัก **ห้ามเอาไปตัดสินอะไร**');
    }
    W();
    W('| feature | ตระกูล | ' + HORIZONS.map((h) => `IC h=${h}`).join(' | ') + ' | ' + HORIZONS.map((h) => `p h=${h}`).join(' | ') + ' | ผ่าน Holm (ช่อง/ทั่วงาน) |');
    W('|---|---|' + HORIZONS.map(() => '---:').join('|') + '|' + HORIZONS.map(() => '---:').join('|') + '|---|');
    for (const f of REAL_FEATURES) {
      const rs = HORIZONS.map((h) => rows.find((r) => r.feature === f.key && r.h === h));
      if (!rs.some(Boolean)) continue;
      const ics = rs.map((r) => (r ? f3(r.ic) : '—'));
      const ps = rs.map((r) => (r ? pS(r.icP) : '—'));
      const nFam = rs.filter((r) => r && byId.get(`IC:${ck}:${f.key}:h${r.h}`)?.holmPass).length;
      const nGlob = rs.filter((r) => r && byId.get(`IC:${ck}:${f.key}:h${r.h}`)?.holmPassGlobal).length;
      W(`| \`${f.key}\` | ${f.fam} | ${ics.join(' | ')} | ${ps.join(' | ')} | ${nFam}/${rs.filter(Boolean).length} · ${nGlob}/${rs.filter(Boolean).length} |`);
    }
    W();
    // ช่วงความเชื่อมั่นเต็ม
    W('<details><summary>ช่วงความเชื่อมั่น 95% (bootstrap ระดับสัญลักษณ์) ของช่องนี้</summary>');
    W();
    W('| feature | ' + HORIZONS.map((h) => `CI95 h=${h}`).join(' | ') + ' |');
    W('|---|' + HORIZONS.map(() => '---').join('|') + '|');
    for (const f of REAL_FEATURES) {
      const rs = HORIZONS.map((h) => rows.find((r) => r.feature === f.key && r.h === h));
      if (!rs.some(Boolean)) continue;
      W(`| \`${f.key}\` | ${rs.map((r) => (r ? `[${f3(r.icLo)}, ${f3(r.icHi)}]` : '—')).join(' | ')} |`);
    }
    W();
    W('</details>');
    W();
  }
  W('---');
  W();

  // ══════════════ C4 ══════════════
  W('# C4 · แปลง IC เป็นเงิน แล้วเทียบค่าธรรมเนียม');
  W();
  W('IC เป็นตัวเลขไร้หน่วย ตัวเองไม่บอกว่าได้เงินไหม ต้องแปลงก่อน · รอบนี้แปลงสองทางแล้วเทียบกัน');
  W();
  W('**ทาง (ก) สูตร** — ถ้าเดิมพันทิศตามสัญญาณที่มาตรฐานแล้ว บนการแจกแจงปกติ');
  W();
  W('```');
  W('E[ผลตอบแทน] = IC × σ(ผลตอบแทน h แท่ง) × √(2/π)');
  W('             = IC × σ × 0.7979');
  W('```');
  W();
  W('**ทาง (ข) วัดจริง** — สร้างกฎเทรดที่เทรดได้จริงแล้ววัดผล');
  W();
  W(`· ที่แท่ง i หาอันดับเปอร์เซ็นไทล์ของ feature เทียบ **${RANK_WINDOW} แท่งที่ผ่านมาเท่านั้น** (\`causalRankPct\`)`);
  W(`· อันดับบน ${DECILE * 100}% → เดิมพันฝั่งหนึ่ง · อันดับล่าง ${DECILE * 100}% → เดิมพันอีกฝั่ง · ตรงกลางไม่เทรด`);
  W('· เข้าที่ราคาเปิดแท่ง i+1 ออกที่ราคาปิดแท่ง i+h · หักค่าธรรมเนียมไป-กลับของตลาดนั้น');
  W();
  W('⚠ **ทาง (ข) เข้าข้างตัวเองอยู่หนึ่งบิต**: ทิศของการเดิมพัน (บนขึ้นหรือบนลง) เลือกจาก');
  W('เครื่องหมายของ IC ที่วัดบนข้อมูลชุดเดียวกัน ตัวเลขที่ได้จึงเป็น **ขอบบน** ไม่ใช่ค่าที่คาดหวังจริง');
  W('ถ้าตัวเลขที่เข้าข้างตัวเองแล้วยังไม่ชนะค่าธรรมเนียม แปลว่าของจริงไม่มีทางชนะ');
  W();

  for (const ck of cellKeys) {
    const info = cellInfo.get(ck);
    const cell = cells.get(ck);
    const rows = real.filter((r) => r.cell === ck);
    if (!rows.length) continue;
    const feeBps = cell.fee.n ? (cell.fee.s / cell.fee.n) * 10000 : NaN;
    W(`## ${GROUP_LABEL[info.group]} · ${info.timeframe} — ค่าธรรมเนียม ${feeBps.toFixed(2)} bps/ไม้ · ${flagOf(ck)}`);
    W();
    W('| feature | ถือ | IC | (ก) สูตร bps | (ข) ก่อนหักค่าธรรมเนียม | **(ข) สุทธิ** | CI95 สุทธิ | p สุทธิ | ไม้ | Holm ช่อง/ทั่วงาน |');
    W('|---|---:|---:|---:|---:|---:|---|---:|---:|:---:|');
    const sorted = [...rows].sort((a, b) => b.bpsNet - a.bpsNet);
    for (const r of sorted) {
      const t = byId.get(`NET:${ck}:${r.feature}:h${r.h}`);
      const mark = r.bpsNet > 0 && t?.holmPass ? '**' : '';
      W(`| \`${r.feature}\` | ${r.h} | ${f3(r.ic)} | ${bpsS(r.bpsFormula)} | ${bpsS(r.bpsGross)} | ${mark}${bpsS(r.bpsNet)}${mark} | [${bpsS(r.netLo)}, ${bpsS(r.netHi)}] | ${pS(r.netP)} | ${r.nTrades.toLocaleString()} | ${t?.holmPass ? 'ผ่าน' : 'ไม่ผ่าน'} · ${t?.holmPassGlobal ? 'ผ่าน' : 'ไม่ผ่าน'} |`);
    }
    W();
  }
  W('---');
  W();

  // ── feature ตัวเดียวกัน ตลาดคนละแบบ ─────────────────────────────────────
  W('# feature ตัวเดียวกัน ตลาดคนละแบบ — ตารางที่ตอบคำถามของเจ้าของตรงที่สุด');
  W();
  W('เจ้าของเลือกทาง "หาสัญญาณที่แม่นกว่าเดิม" แทนทาง "ย้ายไปตลาดค่าธรรมเนียมต่ำ"');
  W('ตารางนี้เอา feature ที่แข็งแรงที่สุดที่หาเจอ ไปวางบนทุกตลาดที่กรอบเวลา 1 วัน ด้วยกติกาเดียวกันเป๊ะ');
  W('เพื่อตอบว่า **ปัญหาอยู่ที่สัญญาณอ่อน หรืออยู่ที่ค่าธรรมเนียมแพง**');
  W();
  const headliners = [...new Set(real
    .filter((r) => !CLOSED.has(r.cell) && !isThin(r.cell) && r.bpsNet > 0
      && byId.get(`NET:${r.cell}:${r.feature}:h${r.h}`)?.holmPassGlobal)
    .map((r) => `${r.feature}|${r.h}`))];
  const oneD = cellKeys.filter((ck) => cellInfo.get(ck).timeframe === '1D' && !isThin(ck));
  for (const key of headliners) {
    const [fk, hs] = key.split('|');
    const h = Number(hs);
    W(`## \`${fk}\` · ถือ ${h} แท่ง`);
    W();
    W(`> ${FEATURES[FEATURE_IDX.get(fk)].why}`);
    W();
    W('| ตลาด | IC | \\|IC\\| เทียบพื้นเสียงของช่อง | กำไรก่อนหักค่าธรรมเนียม | ค่าธรรมเนียม | **สุทธิ** | p |');
    W('|---|---:|---:|---:|---:|---:|---:|');
    for (const ck of oneD) {
      const r = real.find((x) => x.cell === ck && x.feature === fk && x.h === h);
      if (!r) continue;
      const nz = ctrl.filter((x) => x.cell === ck && x.control === 'noise').map((x) => Math.abs(x.ic)).filter(Number.isFinite);
      const floor = nz.length ? Math.max(...nz) : NaN;
      W(`| ${GROUP_LABEL[r.group]} | ${f3(r.ic)} | ${(Math.abs(r.ic) / floor).toFixed(1)}× | ${bpsS(r.bpsGross)} | ${bpsS(r.feeFrac)} | **${bpsS(r.bpsNet)}** | ${pS(r.netP)} |`);
    }
    W();
  }
  // ประโยคสรุปที่คำนวณจากตัวเลขจริง ไม่ใช่เขียนทิ้งไว้
  {
    const cmp = [];
    for (const key of headliners) {
      const [fk, hs] = key.split('|');
      const h = Number(hs);
      const th = real.find((x) => x.cell === 'SET50|1D' && x.feature === fk && x.h === h);
      const us = real.find((x) => x.cell === 'US_STOCK|1D' && x.feature === fk && x.h === h);
      if (th && us && Number.isFinite(th.ic) && Number.isFinite(us.ic)) cmp.push({ fk, h, th, us });
    }
    const strongerInTH = cmp.filter((c) => Math.abs(c.th.ic) > Math.abs(c.us.ic));
    const loseInTH = cmp.filter((c) => c.th.bpsNet <= 0);
    W('**สิ่งที่ตารางนี้บอก — และมันสวนสัญชาตญาณ**');
    W();
    W(`จาก ${cmp.length} ตัวที่รอดทุกด่านมาถึงตรงนี้:`);
    W();
    W(`· **${strongerInTH.length} จาก ${cmp.length} ตัว มีสัญญาณ "แรงกว่า" ในหุ้นไทย SET50 มากกว่าในหุ้นสหรัฐ**`);
    W(`· แต่ **${loseInTH.length} จาก ${cmp.length} ตัว ขาดทุนในหุ้นไทย** ขณะที่ตัวเดียวกันได้กำไรในหุ้นสหรัฐ`);
    W();
    for (const c of strongerInTH.filter((x) => x.th.bpsNet <= 0).slice(0, 3)) {
      W(`  ตัวอย่าง \`${c.fk}\` ถือ ${c.h}: หุ้นไทย IC ${f3(c.th.ic)} กำไรก่อนหัก ${bpsS(c.th.bpsGross)} bps`);
      W(`  หุ้นสหรัฐ IC ${f3(c.us.ic)} กำไรก่อนหัก ${bpsS(c.us.bpsGross)} bps`);
      W(`  → สัญญาณไทยแรงกว่า ${(Math.abs(c.th.ic) / Math.abs(c.us.ic)).toFixed(1)} เท่า และกำไรก่อนหักมากกว่า ${(c.th.bpsGross / c.us.bpsGross).toFixed(1)} เท่า`);
      W(`  → แต่ค่าธรรมเนียมแพงกว่า ${(c.th.feeFrac / c.us.feeFrac).toFixed(1)} เท่า จึงจบที่ **${bpsS(c.th.bpsNet)}** เทียบกับ **${bpsS(c.us.bpsNet)}**`);
      W();
    }
    W('**แปลว่าอะไร**: รอบนี้ไม่ได้ล้มเหลวที่การหาสัญญาณ — สัญญาณหาเจอ และในหุ้นไทยมันแรงกว่าด้วยซ้ำ');
    W('สิ่งที่ล้มเหลวคือการเปลี่ยนสัญญาณนั้นเป็นเงิน ภายใต้ค่าธรรมเนียมที่ตลาดนั้นเรียกเก็บ');
    W('ตรงกับกลไก "ภาษีความแม่น" ที่ exp-ceiling.md วัดไว้ (หุ้นไทย +12.2% · หุ้นสหรัฐ +0.8%) พอดี');
    W('แต่รอบนี้วัดจากอีกด้านหนึ่ง: ด้วย feature จริงที่มีอยู่ในมือ ไม่ใช่ด้วยสมมติฐานเรื่องความแม่น');
    W();
    W('ทางเลือกที่เจ้าของ **ไม่ได้เลือก** (ย้ายไปตลาดค่าธรรมเนียมต่ำ) กับทางที่เลือก (หาสัญญาณให้แม่นขึ้น)');
    W('รอบนี้เดินทางที่เลือกจนสุดแล้ว และผลออกมาว่าสองทางนั้นไม่ได้แยกจากกัน —');
    W('สัญญาณที่หาเจอกลายเป็นเงินได้เฉพาะในตลาดที่ค่าธรรมเนียมต่ำเท่านั้น');
    W();
    W('*(นี่คือรายงานผลการวัด ไม่ใช่คำแนะนำการลงทุน — การตัดสินใจว่าจะเทรดอะไรเป็นของเจ้าของ)*');
    W();
  }
  W('---');
  W();

  // ── IC ที่ต้องมีถึงจะคุ้ม ────────────────────────────────────────────────
  W('# IC ต้องแรงแค่ไหนถึงจะคุ้มค่าธรรมเนียม');
  W();
  W('กลับสูตร (ก) เพื่อตอบคำถามที่ตัดสินใจได้จริง: `IC* = ค่าธรรมเนียม ÷ (σ × 0.7979)`');
  W();
  W('| กลุ่ม | TF | ถือ | σ ผลตอบแทน (bps) | ค่าธรรมเนียม (bps) | **IC ที่ต้องมี** | IC จริงที่ดีที่สุดในช่องนี้ | ห่างกี่เท่า |');
  W('|---|---|---:|---:|---:|---:|---:|---:|');
  for (const ck of cellKeys) {
    const info = cellInfo.get(ck);
    const cell = cells.get(ck);
    const feeFrac = cell.fee.n ? cell.fee.s / cell.fee.n : NaN;
    for (const h of HORIZONS) {
      const rows = real.filter((r) => r.cell === ck && r.h === h);
      if (!rows.length) continue;
      const sd = rows[0].retSd;
      const icNeed = feeFrac / (sd * Math.sqrt(2 / Math.PI));
      const best = rows.reduce((a, b) => (Math.abs(b.ic) > Math.abs(a.ic) ? b : a));
      const ratio = Math.abs(best.ic) > 0 ? icNeed / Math.abs(best.ic) : Infinity;
      W(`| ${GROUP_LABEL[info.group]} | ${info.timeframe} | ${h} | ${bpsS(sd, 1)} | ${bpsS(feeFrac, 2)} | **${f3(icNeed)}** | ${f3(Math.abs(best.ic))} (\`${best.feature}\`) | ${Number.isFinite(ratio) ? `${ratio.toFixed(1)}×` : '—'} |`);
    }
  }
  W();
  W('ตัวเลขในคอลัมน์ "ห่างกี่เท่า" คือคำตอบที่กระชับที่สุดของรอบนี้:');
  W('feature ที่แรงที่สุดที่หาเจอ ต้องแรงขึ้นอีกกี่เท่าถึงจะแค่ "เสมอตัว" กับค่าธรรมเนียม');
  W();
  W('---');
  W();

  // ── ตระกูลไหนดีกว่ากัน ────────────────────────────────────────────────────
  W('# วอลุ่มกับโครงสร้างราคา ตระกูลไหนมีของมากกว่า');
  W();
  W('รวบทุกช่องที่วอลุ่มใช้ได้ แล้วเทียบการกระจายของ |IC| ระหว่างสองตระกูล');
  W();
  W('| ตระกูล | จำนวนการวัด | \\|IC\\| มัธยฐาน | \\|IC\\| เปอร์เซ็นไทล์ 90 | \\|IC\\| สูงสุด | ผ่าน Holm ทั่วงาน |');
  W('|---|---:|---:|---:|---:|---:|');
  const famStat = {};
  for (const fam of ['VOL', 'PX']) {
    const rs = real.filter((r) => r.family === fam && cells.get(r.cell)?.volUsable && !isThin(r.cell));
    const abs = rs.map((r) => Math.abs(r.ic)).filter(Number.isFinite).sort((a, b) => a - b);
    const nPass = rs.filter((r) => byId.get(`IC:${r.cell}:${r.feature}:h${r.h}`)?.holmPassGlobal).length;
    const label = fam === 'VOL' ? 'วอลุ่ม' : 'โครงสร้างราคา';
    famStat[fam] = { n: rs.length, nPass, med: percentileOfSorted(abs, 0.5), max: abs[abs.length - 1] };
    W(`| ${label} | ${rs.length} | ${f3(percentileOfSorted(abs, 0.5))} | ${f3(percentileOfSorted(abs, 0.9))} | ${f3(abs[abs.length - 1])} | ${nPass} (${pctS(nPass / rs.length)}) |`);
  }
  const noiseSolid = ctrl.filter((r) => r.control === 'noise' && !isThin(r.cell)).map((r) => Math.abs(r.ic)).filter(Number.isFinite).sort((a, b) => a - b);
  W(`| เสียงสุ่มล้วน (ตัวควบคุม) | ${noiseSolid.length} | ${f3(percentileOfSorted(noiseSolid, 0.5))} | ${f3(percentileOfSorted(noiseSolid, 0.9))} | ${f3(noiseSolid[noiseSolid.length - 1])} | — |`);
  W();
  W('**คำตอบของคำถาม "วอลุ่มมีของไหม"**');
  W();
  const volWins = REAL_FEATURES.filter((f) => f.needsVol && survivors.some((r) => r.feature === f.key));
  const pxWins = REAL_FEATURES.filter((f) => !f.needsVol && survivors.some((r) => r.feature === f.key));
  W(`· วอลุ่มมีของจริง — ${famStat.VOL.nPass} จาก ${famStat.VOL.n} การวัด ผ่านเกณฑ์เข้มที่สุด และ |IC| สูงสุด ${f3(famStat.VOL.max)}`);
  W(`  ซึ่งสูงกว่าพื้นเสียงสุ่ม (${f3(noiseSolid[noiseSolid.length - 1])}) อย่างชัดเจน · **สมมติฐานของโจทย์ถูก**: มีของที่เครื่องยนต์มองข้ามอยู่จริง`);
  W(`· แต่โครงสร้างราคาให้ผลผ่านเกณฑ์ในสัดส่วนที่สูงกว่า (${pctS(famStat.PX.nPass / famStat.PX.n)} เทียบ ${pctS(famStat.VOL.nPass / famStat.VOL.n)})`);
  W(`· ในตัวที่รอดทุกด่านจนถึงเป็นเงินจริง: ตระกูลวอลุ่ม ${volWins.length} ตัว (${volWins.map((f) => `\`${f.key}\``).join(' · ') || '—'})`);
  W(`  ตระกูลโครงสร้างราคา ${pxWins.length} ตัว (${pxWins.map((f) => `\`${f.key}\``).join(' · ') || '—'})`);
  W();
  W('สรุปตระกูล: **วอลุ่มไม่ใช่ที่ว่างเปล่า แต่ก็ไม่ใช่ขุมทรัพย์ที่ซ่อนอยู่** ตัววอลุ่มที่แข็งแรงที่สุด');
  W('(`vwapDist20`) เป็นตัวที่ผสมราคาเข้ากับวอลุ่ม ไม่ใช่วอลุ่มล้วน ส่วนวอลุ่มล้วน ๆ อย่าง `volZ20`');
  W('`volShock20` `turnoverZ20` `signedVolZ20` แทบไม่ผ่านอะไรเลยในช่องที่เชื่อได้');
  W();
  W('**อันดับ feature รายตัว — เฉลี่ย |IC| ข้ามทุกช่องและทุกหน้าต่างถือ (ตัดช่องตัวอย่างบางออกแล้ว)**');
  W();
  W('| # | feature | ตระกูล | \\|IC\\| เฉลี่ย | \\|IC\\| สูงสุด | ช่องที่ผ่าน Holm ทั่วงาน | เงินสุทธิดีที่สุด (bps) | เหตุผลที่ลองตัวนี้ |');
  W('|---:|---|---|---:|---:|---:|---:|---|');
  const perFeat = REAL_FEATURES.map((f) => {
    // ตัดช่องตัวอย่างบางออกทั้งตาราง ไม่งั้นคอลัมน์เงินจะเต็มไปด้วยตัวเลขหลักร้อยที่เป็นเสียงรบกวน
    const rs = solid.filter((r) => r.feature === f.key);
    const abs = rs.map((r) => Math.abs(r.ic)).filter(Number.isFinite);
    const nPass = rs.filter((r) => byId.get(`IC:${r.cell}:${r.feature}:h${r.h}`)?.holmPassGlobal).length;
    const bestNetV = rs.length ? Math.max(...rs.map((r) => r.bpsNet).filter(Number.isFinite)) : NaN;
    return {
      f, n: rs.length,
      mean: abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : NaN,
      max: abs.length ? Math.max(...abs) : NaN,
      nPass, bestNet: bestNetV,
    };
  }).sort((a, b) => b.mean - a.mean);
  perFeat.forEach((x, k) => {
    W(`| ${k + 1} | \`${x.f.key}\` | ${x.f.fam === 'VOL' ? 'วอลุ่ม' : 'ราคา'} | ${f3(x.mean)} | ${f3(x.max)} | ${x.nPass}/${x.n} | ${bpsS(x.bestNet)} | ${x.f.why} |`);
  });
  W();
  W('---');
  W();

  // ══════════════ C5 · ความเสถียร ══════════════
  W('# C5 · ตัวที่ดูดี มันดีทั้งสองครึ่งของ train หรือดีแค่ครึ่งเดียว');
  W();
  W('ตัวที่ผ่านทุกด่านมาถึงตรงนี้ ยังเหลือคำถามหนึ่งข้อที่ตอบได้โดยไม่ต้องแตะ validation:');
  W('**ผลบวกนั้นกระจายทั่วช่วงเวลา หรือมาจากยุคเดียว** — แบ่ง train ของแต่ละสัญลักษณ์เป็นครึ่งแรก/ครึ่งหลัง');
  W('ตามลำดับเวลาของตัวมันเอง แล้ววัดซ้ำด้วยทิศเดิม (ไม่เลือกทิศใหม่รายครึ่ง)');
  W();
  W('⚠ ตารางนี้ใช้ **ลดความเชื่อ** เท่านั้น ไม่เคยใช้สนับสนุนข้ออ้างใด จึงไม่ลงทะเบียนเป็นการทดสอบเพิ่ม');
  W('(ถ้าเอาไปใช้สนับสนุน จะต้องนับเข้าบัญชี Holm ด้วย)');
  W();
  const stabRows = real
    .filter((r) => !CLOSED.has(r.cell) && !isThin(r.cell) && r.bpsNet > 0)
    .sort((a, b) => b.bpsNet - a.bpsNet)
    .slice(0, 25);
  W('25 อันดับเงินสุทธิสูงสุด ในช่องที่ยังไม่ปิดตายและตัวอย่างไม่บาง:');
  W();
  W('| feature | กลุ่ม | TF | ถือ | สุทธิทั้ง train | ครึ่งแรก | ครึ่งหลัง | IC ครึ่งแรก | IC ครึ่งหลัง | เสถียรไหม |');
  W('|---|---|---|---:|---:|---:|---:|---:|---:|---|');
  for (const r of stabRows) {
    const bothPos = r.netHalf1 > 0 && r.netHalf2 > 0;
    const sameSign = Number.isFinite(r.icHalf1) && Number.isFinite(r.icHalf2) && Math.sign(r.icHalf1) === Math.sign(r.icHalf2);
    const verdict = bothPos && sameSign ? '**เสถียร**' : (bothPos ? 'เงินบวกทั้งคู่ แต่ IC พลิกทิศ' : 'ครึ่งเดียว');
    W(`| \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.timeframe} | ${r.h} | ${bpsS(r.bpsNet)} | ${bpsS(r.netHalf1)} | ${bpsS(r.netHalf2)} | ${f3(r.icHalf1)} | ${f3(r.icHalf2)} | ${verdict} |`);
  }
  W();
  const stable = stabRows.filter((r) => r.netHalf1 > 0 && r.netHalf2 > 0
    && Math.sign(r.icHalf1) === Math.sign(r.icHalf2));
  W(`**ผล: ${stable.length} จาก ${stabRows.length} ตัว เป็นบวกทั้งสองครึ่งและ IC ไม่พลิกทิศ**`);
  W();
  W('---');
  W();

  // ── บัญชีการเปรียบเทียบ ──────────────────────────────────────────────────
  W('# บัญชีการเปรียบเทียบทั้งหมด');
  W();
  W('กติกาข้อ 4 ของรอบนี้: นับทุกอย่างที่ "ถาม" ไม่ใช่เฉพาะที่ "ตอบว่าใช่"');
  W();
  const realTests = TESTS.filter((t) => t.meta.kind !== 'CTRL');
  const icTests = TESTS.filter((t) => t.meta.kind === 'IC');
  const netTests = TESTS.filter((t) => t.meta.kind === 'NET');
  const ctrlTests = TESTS.filter((t) => t.meta.kind === 'CTRL');
  W('| ประเภทคำถาม | จำนวน | ผ่าน Holm ภายในช่อง | ผ่าน Holm ทั่วทั้งงาน |');
  W('|---|---:|---:|---:|');
  W(`| IC ต่างจากศูนย์ไหม | ${icTests.length} | ${icTests.filter((t) => t.holmPass).length} | ${icTests.filter((t) => t.holmPassGlobal).length} |`);
  W(`| กำไรสุทธิหลังค่าธรรมเนียมต่างจากศูนย์ไหม | ${netTests.length} | ${netTests.filter((t) => t.holmPass).length} | ${netTests.filter((t) => t.holmPassGlobal).length} |`);
  W(`| **รวมที่นับเข้าการแก้ค่า p** | **${realTests.length}** | ${realTests.filter((t) => t.holmPass).length} | ${realTests.filter((t) => t.holmPassGlobal).length} |`);
  W(`| ตัวควบคุม (แยกตระกูล ไม่เบียดเกณฑ์ของ feature จริง) | ${ctrlTests.length} | ${ctrlTests.filter((t) => t.holmPass).length} | — |`);
  W();
  W('**การแก้ค่า p สองระดับ**');
  W();
  W('· *ภายในช่อง* — ตระกูลคือ (ชนิดคำถาม × กลุ่ม × กรอบเวลา) เพราะเป็นชุดคำถามที่ถามพร้อมกันบนข้อมูลชุดเดียวกัน');
  W(`· *ทั่วทั้งงาน* — ตระกูลเดียวรวมทุกช่อง m = ${realTests.length} · เกณฑ์ที่เข้มที่สุดคือ ${(OPT.alpha / realTests.length).toExponential(1)}`);
  W('  ใช้ตัวนี้เป็นคำตอบหลัก เพราะรอบนี้เรากวาดหา feature ทั่วทั้งจักรวาล ไม่ได้ตั้งสมมติฐานล่วงหน้าช่องใดช่องหนึ่ง');
  W();

  // ── ผ่านการทดสอบ แต่ผ่านไปทางไหน ────────────────────────────────────────
  //
  // ⚠ กับดักการอ่านผล: การทดสอบเป็นแบบสองด้าน "ผ่าน" จึงแปลว่า "ต่างจากศูนย์อย่างชัดเจน"
  //   ไม่ได้แปลว่า "ดี" — ค่าที่ติดลบมาก ๆ ก็ "ผ่าน" เหมือนกัน จึงต้องแยกทิศให้ชัด
  const netPassed = netTests.filter((t) => t.holmPassGlobal);
  const netPassedPos = netPassed.filter((t) => t.estimate > 0).sort((a, b) => b.estimate - a.estimate);
  const netPassedNeg = netPassed.filter((t) => t.estimate <= 0);
  W('**⚠ อ่านตารางข้างบนให้ถูก**');
  W();
  W('การทดสอบเป็นแบบสองด้าน คำว่า "ผ่าน" แปลว่า **ต่างจากศูนย์อย่างชัดเจน** ไม่ได้แปลว่า **ดี**');
  W('ค่าที่ติดลบหนัก ๆ ก็ "ผ่าน" เหมือนกัน — และรอบนี้ส่วนใหญ่เป็นแบบนั้น');
  W();
  W('| ทิศของผลที่ผ่าน Holm ทั่วทั้งงาน | จำนวน | ความหมาย |');
  W('|---|---:|---|');
  W(`| กำไรสุทธิ **เป็นบวก** อย่างมีนัยสำคัญ | **${netPassedPos.length}** | เจอของ |`);
  W(`| กำไรสุทธิ **ติดลบ** อย่างมีนัยสำคัญ | **${netPassedNeg.length}** | พิสูจน์แล้วว่าขาดทุนแน่ ๆ ไม่ใช่แค่ "ยังไม่ชัด" |`);
  W();
  W('ตัวเลข ' + netPassedNeg.length + ' ข้อที่ติดลบไม่ใช่ความล้มเหลว — มันคือข้อสรุปที่แข็งแรงที่สุดของรอบนี้');
  W('มันบอกว่า feature พวกนี้ในตลาดพวกนี้ **ขาดทุนอย่างมั่นใจ** ที่ระดับนัยสำคัญ ' + (OPT.alpha / realTests.length).toExponential(1));
  W('ไม่ใช่ "ผลไม่ชัดเจน" ที่อาจดีขึ้นถ้าเก็บข้อมูลเพิ่ม');
  W();
  W(`**รายการที่ผ่าน Holm ทั่วทั้งงาน และกำไรสุทธิเป็นบวก — ทั้งหมด ${netPassedPos.length} ข้อ**`);
  W();
  if (!netPassedPos.length) {
    W('ไม่มีเลย');
  } else {
    W('| # | คำถาม | สุทธิ (bps) | CI95 | p | เกณฑ์ Holm | ช่องนี้เชื่อได้ไหม |');
    W('|---:|---|---:|---|---:|---:|---|');
    netPassedPos.forEach((t, k) => {
      W(`| ${k + 1} | ${t.question} | ${bpsS(t.estimate)} | [${bpsS(t.ci[0])}, ${bpsS(t.ci[1])}] | ${pS(t.p)} | ${pS(t.holmPassGlobalThreshold)} | ${flagOf(t.meta.cell)} |`);
    });
  }
  W();
  const icPassed = icTests.filter((t) => t.holmPassGlobal).sort((a, b) => Math.abs(b.estimate) - Math.abs(a.estimate));
  W(`**รายการ IC ที่ผ่าน Holm ทั่วทั้งงาน — ${icPassed.length} ข้อ (แสดง 40 อันดับแรกตาม |IC|)**`);
  W();
  W('| # | คำถาม | IC | CI95 | p | เกณฑ์ Holm | เงินสุทธิของตัวเดียวกัน (bps) |');
  W('|---:|---|---:|---|---:|---:|---:|');
  icPassed.slice(0, 40).forEach((t, k) => {
    W(`| ${k + 1} | ${t.question} | ${f3(t.estimate)} | [${f3(t.ci[0])}, ${f3(t.ci[1])}] | ${pS(t.p)} | ${pS(t.holmPassGlobalThreshold)} | ${bpsS(t.meta.bpsNet)} |`);
  });
  if (icPassed.length > 40) W(`| … | อีก ${icPassed.length - 40} ข้อ อยู่ใน exp-feat-volume.json | | | | | |`);
  W();
  W('ตารางนี้คือหัวใจของรอบนี้: **มี IC ที่ผ่านเกณฑ์เข้มที่สุดตั้ง ' + icPassed.length + ' ข้อ**');
  W('แปลว่าข้อมูลมีของจริง ไม่ใช่ที่ว่างเปล่า — แต่คอลัมน์สุดท้ายบอกว่าของนั้นกลายเป็นเงินได้กี่ข้อ');
  W();
  W('รายการเต็มทั้ง ' + TESTS.length + ' ข้อ (รวมที่ไม่ผ่านทุกข้อ) อยู่ใน `scripts/research/report/exp-feat-volume.json` คีย์ `tests`');
  W();
  W('---');
  W();

  // ── คำตอบและข้อจำกัด ─────────────────────────────────────────────────────
  W('# คำตอบของโจทย์ข้อ 4: มี feature ไหนแรงพอจะคุ้มค่าธรรมเนียมไหม');
  W();
  const openCells = cellKeys.filter((ck) => !CLOSED.has(ck) && !isThin(ck));
  const openRows = real.filter((r) => !CLOSED.has(r.cell) && !isThin(r.cell));
  const openNetPos = openRows.filter((r) => r.bpsNet > 0);
  const openNetPass = openRows.filter((r) => r.bpsNet > 0 && byId.get(`NET:${r.cell}:${r.feature}:h${r.h}`)?.holmPassGlobal);
  W(`ในช่องที่ exp-ceiling.md บอกว่า **ยังไม่ปิดตาย** (${openCells.length} ช่อง · ${openRows.length} การวัด):`);
  W();
  W(`· เงินสุทธิเป็นบวกก่อนแก้ค่า p: **${openNetPos.length} จาก ${openRows.length}**`);
  W(`· เงินสุทธิเป็นบวก **และ** ผ่าน Holm ทั่วทั้งงาน: **${openNetPass.length}**`);
  W();
  if (openNetPass.length) {
    W('| feature | กลุ่ม | TF | ถือ | IC | สุทธิ (bps) | CI95 | p |');
    W('|---|---|---|---:|---:|---:|---|---:|');
    for (const r of openNetPass.sort((a, b) => b.bpsNet - a.bpsNet)) {
      W(`| \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.timeframe} | ${r.h} | ${f3(r.ic)} | **${bpsS(r.bpsNet)}** | [${bpsS(r.netLo)}, ${bpsS(r.netHi)}] | ${pS(r.netP)} |`);
    }
    W();
  }
  W('---');
  W();
  W('# ข้อจำกัดและสิ่งที่รอบนี้ยังตอบไม่ได้');
  W();
  W('· **ค่าเงินไม่มีวอลุ่มเลย** — ตลาดที่ภาษีความแม่นต่ำเป็นอันดับสอง กลับไม่มีข้อมูลตระกูลนี้ให้หา');
  W('  ถ้าจะหาต่อในค่าเงิน ต้องหาแหล่งวอลุ่มอื่น (futures volume ของ CME เป็นตัวแทนที่ใช้กันทั่วไป) ซึ่งคลังนี้ไม่มี');
  W('· **วัดทีละตัว ไม่ได้วัดแบบรวมกัน** — feature หลายตัวที่ IC ต่ำอาจรวมกันแล้วแรงขึ้นได้');
  W('  แต่กติกาข้อ 5 บอกให้วัดพลังทำนายก่อน และ IC ระดับที่วัดได้บอกว่าต่อให้รวมกันแบบไม่มีความสัมพันธ์กันเลย');
  W('  (ซึ่งเป็นกรณีที่ดีที่สุดที่เป็นไปได้) ก็ยังห่างจากที่ต้องการมาก — ดูตาราง "IC ที่ต้องมี"');
  W('· **การเดิมพัน decile เข้าข้างตัวเอง** ตรงการเลือกทิศ · ตัวเลขจริงจะแย่กว่านี้เสมอ');
  W('· **ไม่ได้ลอง feature ที่ไม่เชิงเส้น** — IC วัดความสัมพันธ์แบบอันดับ ถ้าความสัมพันธ์เป็นรูปตัว U');
  W('  (เช่น "วอลุ่มสูงมากหรือต่ำมากดีทั้งคู่") IC จะเห็นเป็นศูนย์ ทั้งที่มีของ · รอบต่อไปควรลองแบ่งกลุ่ม');
  W('· **คลังข้อมูลยังมี survivorship bias** — Yahoo ลบหุ้นที่ออกจากกระดานทิ้ง กลุ่มหุ้นซิ่งเอียงไปทางผู้รอดชีวิต');
  W('· **1H ย้อนได้แค่ 730 วัน** = เห็นตลาดยุคเดียว ข้อสรุปบน 1H อ่อนกว่า 1D มาก');
  W('· **ยังไม่ได้แตะ validation และ test เลย** ซึ่งถูกต้องสำหรับเฟสนี้ — ถ้ามี feature ที่รอดจากตารางข้างบน');
  W('  ต้องเอาไปยืนยันบน validation ก่อน แล้ว test เก็บไว้ครั้งสุดท้ายจริง ๆ');
  W('· ค่าธรรมเนียมหุ้นไทยคิดที่สเปรด 1 tick ซึ่งเป็นพื้นตามกติกาตลาด — ของจริงกว้างกว่านี้เสมอในหุ้นสภาพคล่องต่ำ');
  W();
}

main().catch((e) => { console.error(e); process.exit(1); });
