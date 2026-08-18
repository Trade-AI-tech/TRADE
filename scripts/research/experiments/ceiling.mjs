#!/usr/bin/env node
/**
 * ceiling.mjs — วัด "เพดาน" ของแต่ละตลาด: ถ้าทำนายทิศได้ถูก จะได้เงินสูงสุดเท่าไร
 *
 * ██████████████████████████████████████████████████████████████████████████████
 * █                                                                            █
 * █   ⚠⚠⚠  ไฟล์นี้ใช้ "ข้อมูลอนาคต" โดยตั้งใจ — ห้ามลอกโค้ดในนี้ไปใช้ที่อื่น  ⚠⚠⚠   █
 * █                                                                            █
 * █   ทุกฟังก์ชันที่ขึ้นต้นด้วย oracle* อ่าน candles[t .. t+H-1] ซึ่งเป็นแท่งที่ยัง       █
 * █   ไม่เกิดขึ้น ณ เวลาที่ต้องตัดสินใจ นั่นคือ look-ahead เต็มรูปแบบ และเป็น          █
 * █   "จุดประสงค์" ของไฟล์นี้ ไม่ใช่บั๊ก — เพราะคำถามคือ "เพดานอยู่ตรงไหน"           █
 * █                                                                            █
 * █   ตัวเลขทุกตัวที่ไฟล์นี้พ่นออกมา ห้ามตีความว่าเป็นผลตอบแทนที่ทำได้จริง            █
 * █   มันคือ "ขอบบนที่พิสูจน์แล้วว่าเป็นไปไม่ได้จะเกิน" เท่านั้น                        █
 * █                                                                            █
 * █   งานรอบต่อไป (หา feature) ต้องไม่ import อะไรจากไฟล์นี้เด็ดขาด                █
 * █   ถ้าจะยืมโค้ด ให้ยืมเฉพาะส่วนที่ทำเครื่องหมาย [CAUSAL] ไว้เท่านั้น               █
 * █                                                                            █
 * ██████████████████████████████████████████████████████████████████████████████
 *
 * ─────────────────────────────── ทำไมต้องมีไฟล์นี้ ───────────────────────────────
 *
 * เจ้าของเลือกทาง "หาสัญญาณที่เดาทิศแม่นกว่าเดิม 10 เท่า" ก่อนจะลงแรงหา feature
 * ต้องรู้ก่อนว่า "ถ้าเดาถูกหมด จะได้เงินเท่าไร" เพราะถ้าเพดานยังต่ำกว่าค่าธรรมเนียม
 * ต่อให้หา feature ที่ทำนายได้สมบูรณ์แบบก็ยังขาดทุน — แปลว่าไม่ต้องหาเลย
 *
 * โครงสร้างเพดาน 3 ระดับ ไล่จากที่เป็นไปไม่ได้ ลงมาถึงที่พอเป็นไปได้:
 *
 *   (ก) รู้อนาคตสมบูรณ์   เข้าทุกแท่ง เลือกทิศถูก และออกที่ "จุดที่ดีที่สุด" ในหน้าต่างถือ
 *                        (สูงสุดของ high สำหรับ long / ต่ำสุดของ low สำหรับ short)
 *                        → ไม่มีระบบใดในจักรวาลทำเกินนี้ได้
 *
 *   (ข) รู้ทิศอย่างเดียว   เข้าถูกทางทุกไม้ แต่ออกตามกติกา SL/TP ปกติของเครื่องยนต์
 *                        (SL 1.5×ATR · TP 3×ATR วัดจากราคาปิดแท่งสัญญาณ)
 *                        → นี่คือเพดานของ "feature ที่ทำนายทิศได้ 100%"
 *
 *   (ค) รู้ทิศถูก 60/55%  ระดับที่ระบบจริงพอมีหวังไปถึง
 *                        E(p) = p·E[ทิศถูก] + (1−p)·E[ทิศผิด]
 *
 * แล้วกลับสมการเพื่อตอบคำถามที่ตัดสินใจได้จริง:
 *
 *   ความแม่นคุ้มทุน  p* = (ค่าธรรมเนียม − E[ทิศผิด]) ÷ (E[ทิศถูก] − E[ทิศผิด])
 *
 * ถ้า p* > 1 แปลว่า **แม้เดาถูก 100% ก็ยังขาดทุน** = ตลาดนั้นปิดประตูตาย ไม่ต้องหา feature
 *
 * ─────────────────────────────── ค่าธรรมเนียมที่ใช้ ───────────────────────────────
 *
 * หุ้นไทยไม่ใช้ 40 bps ของ lab.mjs เพราะต่ำกว่าความจริง — ใช้โมเดลเดียวกับ
 * exp-cost-mechanics / exp-th-scalp คือ ค่าคอม 0.157%/ขา (ขั้นต่ำ 50 บาท) + สเปรด 1 tick
 * ตามตารางช่วงราคาของ SET ซึ่งเป็นตัวที่ทำให้หุ้นราคาถูกแพงกว่าหุ้นราคาแพงหลายเท่า
 * ตลาดอื่นใช้ตาราง bps ของ lab.mjs ตรง ๆ (GOLD 5 · FOREX 1.5 · US_STOCK 5 · CRYPTO 25
 * พร้อม override รายสัญลักษณ์)
 *
 * ────────────────────────────────── วิธีใช้ ──────────────────────────────────
 *
 *   node scripts/research/experiments/ceiling.mjs
 *   node scripts/research/experiments/ceiling.mjs --refresh      รัน lab.mjs ใหม่ ไม่ใช้แคช
 *   node scripts/research/experiments/ceiling.mjs --bootstrap=4000
 *
 * ไฟล์นี้ไม่แตะชุด test ไม่ว่ากรณีใด (มีด่านกันไว้ข้างล่าง)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { fileURLToPath } from 'node:url';

import { ROOT, loadSrcModules } from '../load-src-modules.mjs';
import { InputLedger, buildProvenance } from '../repro.mjs';

/**
 * ทะเบียนไฟล์ขาเข้า — รายงานฉบับหนึ่งต้องผูกกับ "โค้ดรุ่นไหน + ข้อมูลชุดไหน"
 * ถ้าไม่ผูก รายงานกับโค้ดจะค่อย ๆ แยกทางกันโดยไม่มีใครสังเกต
 */
const IN = new InputLedger();
const SCRIPT_PATH = fileURLToPath(import.meta.url);

const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
/**
 * คลังแท่งเทียน — เปลี่ยนได้ด้วย --cache-dir เพื่อรัน "ตัดข้อมูลท้ายทิ้งจริงแล้วคำนวณซ้ำ"
 * ซึ่งเป็นการพิสูจน์เดียวที่ยอมรับได้ว่าไม่มีการล้ำข้ามเส้นแบ่ง: ลบแท่งชุดหลังทิ้งจากดิสก์
 * แล้วตัวเลขของชุดก่อนหน้าต้องเท่าเดิม **ทุกบิต** ถ้าเปลี่ยนแม้หลักสุดท้าย แปลว่ายังล้ำอยู่
 */
const CACHE_DIR = process.argv.find((a) => a.startsWith('--cache-dir='))
  ? path.resolve(process.argv.find((a) => a.startsWith('--cache-dir=')).slice(12))
  : path.join(ROOT, '.research-cache', 'candles');
const WORK_DIR = path.join(REPORT_DIR, 'ceiling');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');
const SPLIT_FILE = path.join(REPORT_DIR, 'split.json');

// ════════════════════════════════ ค่าคงที่ของงาน ════════════════════════════════

/** 14 ตัวเดิมในคลัง — ทุกตัวเป็น SET50 (นิยามเดียวกับ exp-th-scalp.md เพื่อให้เทียบกันได้) */
const SET50_SYMBOLS = [
  'PTT', 'PTTEP', 'AOT', 'CPALL', 'KBANK', 'BBL', 'ADVANC',
  'SCC', 'BDMS', 'CPF', 'DELTA', 'MINT', 'IVL', 'EA',
];

/** เกณฑ์คัดหุ้นซิ่ง — ลอกจาก th-scalp.mjs ทุกตัวเลข วัดบน train ของ 1H เท่านั้น */
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

const TH_COMM_RATE = 0.00157;  // 0.157% ต่อข้าง (รวม VAT) → 31.4 bps ไป-กลับ ถ้าขั้นต่ำไม่กัด
const TH_MIN_FEE = 50;         // ค่าคอมขั้นต่ำต่อคำสั่ง (บาท)
const TH_RISK_BAHT = 2000;     // เงินเสี่ยงต่อไม้ที่ใช้คิดขนาดคำสั่ง
const TH_TICKS_PER_ROUND = 1;  // จ่ายสเปรดกี่ tick ต่อรอบ — 1 คือมองโลกในแง่ดีที่สุดที่ยังพูดได้

/**
 * ตาราง bps ของ lab.mjs สำหรับตลาดที่ไม่ใช่หุ้นไทย — ลอกมาทั้งก้อน ไม่แก้
 * (หุ้นไทยใช้โมเดล tick+ค่าคอมข้างบนแทน ไม่ใช้ 40 bps ตัวนี้)
 */
const LAB_COST_BPS = {
  byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 },
  bySymbol: {
    XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10,
    EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15,
  },
};

/** เรขาคณิต SL/TP ที่ใช้เป็น "กติกาปกติ" ของเพดานระดับ (ข) และ (ค) */
const GEO = { slAtrMult: 1.5, tpAtrMult: 3.0, atrPeriod: 14, atrFallbackPct: 0.02 };

/** ค่าปัดราคาของเครื่องยนต์ — ลอกจาก engine-lab.mjs cfg.output */
const ROUND = { forexDecimals: 5, otherDecimals: 4, forexPrecision: 5, otherPrecision: 6 };

const MIN_HISTORY = 60;   // ตรงกับค่าเริ่มต้นของ lab.mjs
const HORIZONS = [1, 5, 10, 20];
const TIMEFRAMES = ['1D', '1H'];
const GROUPS = ['RUNNER', 'SET50', 'GOLD', 'FOREX', 'US_STOCK', 'CRYPTO'];
const GROUP_LABEL = {
  RUNNER: 'หุ้นซิ่งไทย', SET50: 'SET50 เดิม', GOLD: 'ทอง/โลหะ',
  FOREX: 'ค่าเงิน', US_STOCK: 'หุ้นสหรัฐ', CRYPTO: 'คริปโต',
};
const SPLITS = ['train', 'validation'];

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
  refresh: Boolean(args.refresh),
  alpha: Number(args.alpha ?? 0.05),
  /**
   * --keep-spill = ทำตัวแบบ "ก่อนแก้" คือปล่อยให้หน้าต่างถือล้ำข้ามเส้นแบ่ง split ได้
   * มีไว้เพื่อผลิตตาราง "ก่อน/หลัง" จากไบนารีตัวเดียวกันเท่านั้น
   * ⚠ ห้ามใช้ผลิตตัวเลขที่จะเอาไปอ้างอิง — โหมดนี้อ่านแท่งของ split ถัดไป
   *   ซึ่งสำหรับ validation แปลว่าอ่านแท่งของชุด test
   */
  keepSpill: Boolean(args['keep-spill']),
  /** เขียนผลไปโฟลเดอร์อื่น — ตัวตรวจความคงที่ใช้ ไม่ให้ทับรายงานที่ส่งมอบแล้ว */
  outDir: args['out-dir'] ? path.resolve(String(args['out-dir'])) : REPORT_DIR,
};

// ── ด่านกันชุด test ────────────────────────────────────────────────────────────
// ไฟล์นี้เป็นงานสำรวจ ไม่มีเหตุผลใดที่ต้องแตะ test เลย
if (args.split === 'test' || args['i-am-done-tuning'] || args.confirm) {
  console.error('\n[หยุด] ceiling.mjs ไม่แตะชุด test ไม่ว่ากรณีใด\n');
  process.exit(1);
}

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(OPT.outDir, { recursive: true });

// ═══════════════════════════ เครื่องมือทางสถิติ ═══════════════════════════

/** PRNG ที่ให้ผลเดิมทุกครั้ง — bootstrap ต้องรันซ้ำได้ */
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
 * ต้องใช้ตัวนี้แทนตาราง normal ปกติ เพราะ Holm ที่ 96 การทดสอบต้องการ p ระดับ 5e-4
 * ซึ่ง bootstrap ที่ B=2000 ให้พื้น p ได้แค่ 1e-3 — วัดไม่ละเอียดพอ
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
 * กลุ่มที่ใช้คือ (สัญลักษณ์ × เดือน) ซึ่งกันทั้งความสัมพันธ์ข้ามสัญลักษณ์และตามเวลา
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
// รอบนี้เสี่ยง p-hacking สูง เพราะมี 6 กลุ่ม × 2 กรอบเวลา × 4 หน้าต่างถือ = 48 ช่อง
// และแต่ละช่องมีคำถามที่ตอบได้หลายข้อ ทุกข้อที่ "ถาม" ต้องถูกนับ ไม่ใช่เฉพาะที่ "ตอบว่าใช่"
const TESTS = [];
function registerTest({ id, family, question, estimate, ci, p }) {
  TESTS.push({ idx: TESTS.length + 1, id, family, question, estimate, ci, p });
}
/** Holm–Bonferroni ภายในตระกูลเดียวกัน — ตระกูลคือ "ชุดคำถามที่ถามพร้อมกันบนชุดข้อมูลเดียวกัน" */
function applyHolm(alpha = OPT.alpha) {
  const byFamily = new Map();
  for (const t of TESTS) {
    if (!byFamily.has(t.family)) byFamily.set(t.family, []);
    byFamily.get(t.family).push(t);
  }
  for (const [, list] of byFamily) {
    const sorted = [...list].filter((t) => Number.isFinite(t.p)).sort((a, b) => a.p - b.p);
    const m = sorted.length;
    let stillRejecting = true;
    sorted.forEach((t, k) => {
      t.holmThreshold = alpha / (m - k);
      if (stillRejecting && t.p <= t.holmThreshold) t.holmPass = true;
      else { stillRejecting = false; t.holmPass = false; }
    });
    for (const t of list) if (!Number.isFinite(t.p)) { t.holmThreshold = NaN; t.holmPass = false; }
  }
}

// ═══════════════════════════════ โหลดข้อมูล ═══════════════════════════════

const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, '_');

/**
 * [CAUSAL] โหลด dataset หนึ่งชุด แล้วตัดตามสัญญาของคลังเหมือน lab.mjs ทุกประการ
 * ต้องเคารพ quality.usable.from เสมอ ไม่งั้นจะได้แท่งที่เป็นไปไม่ได้ทางกายภาพ
 */
function loadDataset(file) {
  // จดลายนิ้วมือของแท่งเทียนทุกไฟล์ที่อ่าน — คลังเปลี่ยนเมื่อไร ตัวเลขก็เปลี่ยน
  const j = IN.readJson(path.join(CACHE_DIR, file), 'candles');
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

function listDatasets() {
  return fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
}

/** [CAUSAL] ดัชนีแรกที่ timestamp >= cut */
function lowerBound(times, cut) {
  let lo = 0; let hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < cut) lo = mid + 1; else hi = mid; }
  return lo;
}

/** [CAUSAL] แท่งที่เชื่อถือได้พอจะตัดสินการชน SL/TP — ลอกจาก lab.mjs */
const isUsableBar = (c) => (
  Number.isFinite(c.open) && c.open > 0 && Number.isFinite(c.high) && c.high > 0
  && Number.isFinite(c.low) && c.low > 0 && Number.isFinite(c.close) && c.close > 0
  && c.low <= c.high
);

// ═══════════════════════════ ตัวชี้วัดและเรขาคณิต ═══════════════════════════

/**
 * [CAUSAL] ATR ที่ดัชนี i — อ่านเฉพาะ candles[i-period .. i] เท่านั้น
 * สูตรลอกจาก src/lib/indicators.ts ATR() ทุกบรรทัด (ค่าเฉลี่ยธรรมดาของ TR ไม่ใช่ Wilder)
 * ตัวจริงรับ array แล้ว slice(-(period+1)) — ที่นี่รับดัชนีแล้วอ่านหน้าต่างเดียวกัน
 */
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

/** [CAUSAL] ปัดราคาแบบเดียวกับ engine-lab.mjs roundPrice() */
function roundPrice(value, market) {
  if (!Number.isFinite(value)) return value;
  if (value !== 0 && Math.abs(value) < 1) {
    return Number(value.toPrecision(market === 'FOREX' ? ROUND.forexPrecision : ROUND.otherPrecision));
  }
  return Number(value.toFixed(market === 'FOREX' ? ROUND.forexDecimals : ROUND.otherDecimals));
}

/**
 * [CAUSAL] เรขาคณิต SL/TP ของแท่งสัญญาณ i (ราคาอ้างอิง = ปิดแท่ง i)
 * ลอกลำดับชั้นการบังคับ invariant จาก engine-lab.mjs ทั้งสามชั้น เพื่อให้ค่าที่ได้
 * ตรงกับที่ lab.mjs ใช้จริงทุกบิต (ตรวจซ้ำใน C0)
 */
function geometryAt(candles, i, market) {
  const currentPrice = candles[i].close;
  const atrRaw = atrAt(candles, i);
  const atr = Number.isFinite(atrRaw) && atrRaw > 0 ? atrRaw : currentPrice * GEO.atrFallbackPct;
  const entryOut = roundPrice(currentPrice, market);

  // ฝั่ง BUY
  let slL = currentPrice - atr * GEO.slAtrMult;
  let tpL = currentPrice + atr * GEO.tpAtrMult;
  if (!(slL < currentPrice)) slL = currentPrice - atr * GEO.slAtrMult;
  if (!(tpL > currentPrice)) tpL = currentPrice + atr * GEO.tpAtrMult;
  let slLo = roundPrice(slL, market); let tpLo = roundPrice(tpL, market);
  if (!(slLo < entryOut)) slLo = roundPrice(currentPrice - atr * GEO.slAtrMult, market);
  if (!(tpLo > entryOut)) tpLo = roundPrice(currentPrice + atr * GEO.tpAtrMult, market);

  // ฝั่ง SELL
  let slS = currentPrice + atr * GEO.slAtrMult;
  let tpS = currentPrice - atr * GEO.tpAtrMult;
  if (!(slS > currentPrice)) slS = currentPrice + atr * GEO.slAtrMult;
  if (!(tpS < currentPrice)) tpS = currentPrice - atr * GEO.tpAtrMult;
  let slSo = roundPrice(slS, market); let tpSo = roundPrice(tpS, market);
  if (!(slSo > entryOut)) slSo = roundPrice(currentPrice + atr * GEO.slAtrMult, market);
  if (!(tpSo < entryOut)) tpSo = roundPrice(currentPrice - atr * GEO.tpAtrMult, market);

  const okLong = !(slLo === entryOut || tpLo === entryOut || slLo <= 0 || tpLo <= 0);
  const okShort = !(slSo === entryOut || tpSo === entryOut || slSo <= 0 || tpSo <= 0);
  return { atr, entryOut, slLong: slLo, tpLong: tpLo, slShort: slSo, tpShort: tpSo, okLong, okShort };
}

// ═══════════════════════════════ โมเดลต้นทุน ═══════════════════════════════

function tickSizeFor(price) {
  for (const b of SET_TICK_TABLE) if (price >= b.from && price < b.to) return b.tick;
  return SET_TICK_TABLE[SET_TICK_TABLE.length - 1].tick;
}

/**
 * [CAUSAL] ค่าธรรมเนียมไป-กลับ คิดเป็น "สัดส่วนของมูลค่าสถานะ" (ไม่ใช่ R)
 *
 * หุ้นไทย: ค่าคอมสองขา (มีขั้นต่ำ 50 บาท) ÷ มูลค่าคำสั่ง + สเปรด 1 tick
 *   มูลค่าคำสั่ง = เงินเสี่ยงต่อไม้ ÷ ระยะSL(สัดส่วน) — ยิ่ง SL กว้าง คำสั่งยิ่งเล็ก
 *   ค่าคอมขั้นต่ำจึงกินสัดส่วนมากขึ้น = มี "พื้น" ที่ถ่าง SL เท่าไรก็ไม่ทะลุ
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

// ═══════════════════ จัดกลุ่มสัญลักษณ์ (นิยามเดียวกับ exp-th-scalp) ═══════════════════

/**
 * [CAUSAL] สถิติพื้นฐานของหุ้นไทยหนึ่งตัว วัดเฉพาะช่วง train ของ 1H
 * ใช้คัดหุ้นซิ่ง — ไม่มีข้อไหนเกี่ยวกับผลตอบแทน จึงไม่เป็นการเลือกจากผลงานย้อนหลัง
 */
function thTrainProfile(ds, trainEndMs) {
  const end = lowerBound(ds.times, trainEndMs);
  const ranges = []; const turns = []; const prices = [];
  for (let i = 0; i < end; i++) {
    const c = ds.candles[i];
    if (!isUsableBar(c)) continue;
    ranges.push((c.high - c.low) / c.close);
    turns.push((c.volume ?? 0) * c.close);
    prices.push(c.close);
  }
  const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return percentileOfSorted(s, 0.5); };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  return { bars: ranges.length, barRangePct: mean(ranges) * 100, turnover: med(turns), medPrice: med(prices) };
}

// ═════════════════════ แกนกลาง: คำนวณ feature ของหนึ่ง dataset ═════════════════════

/**
 * คำนวณค่าทุกอย่างที่ต้องใช้ ของ dataset หนึ่ง ในช่วง entry ที่กำหนด
 *
 * ⚠ ORACLE — ฟังก์ชันนี้อ่านแท่งอนาคต candles[t .. t+H-1] โดยตั้งใจ
 *
 * คืน callback ต่อแท่ง เพื่อไม่ต้องสร้างอาร์เรย์ยักษ์ค้างในหน่วยความจำ
 *
 * @param maxIndex     ดัชนีสูงสุดที่ "มองเห็นได้" — ใช้ในการตรวจ look-ahead ด้วยการตัดข้อมูลท้าย
 * @param emitPartial  ปล่อยหน้าต่างที่ยังไม่ครบ H แท่งออกมาด้วยไหม
 *                     · การวัดจริงตั้ง false เพื่อให้ทุกไม้มีหน้าต่างยาวเท่ากันเป๊ะ เทียบกันได้
 *                     · การตรวจ look-ahead ตั้ง true เพราะต้องการเห็นว่า "หน้าต่างที่ถูกตัด
 *                       แล้วค่าเปลี่ยน" มีจริง ถ้าไม่มีเลย แปลว่าการตรวจไม่มีฟัน
 */
/**
 * ═══════════════ ด่านกันการล้ำข้ามเส้นแบ่ง split (แก้รอบนี้) ═══════════════
 *
 * ของเดิม: กรองเฉพาะ "แท่งที่เข้าไม้" ให้อยู่ในช่วงของ split แต่ oracle เดินหน้าไป
 * ถึง hMax แท่งเสมอ โดย maxIndex ตั้งเป็นแท่งสุดท้ายของ **ทั้งชุดข้อมูล**
 *   → ไม้ท้าย train วัดผลด้วยแท่งของ validation
 *   → ไม้ท้าย validation วัดผลด้วยแท่งของ **ชุด test**  ← ผิดกติกาข้อ 1
 * ของเดิมนับไม้พวกนี้ไว้ในตัวแปร spill แต่ยัง "นับรวมในผล" อยู่ดี การนับไม่ใช่การกัน
 *
 * ของใหม่: ผู้เรียกส่ง maxIndex = แท่งสุดท้ายของ split เข้ามา หน้าต่างที่เดินไม่ครบ H แท่ง
 * จึงไม่ถูก emit เลย (= ทิ้งไม้ที่ล้ำ แบบเดียวกับ feat-cross.mjs) และ emit สัญญาณ
 * skipSpill ออกไปให้ผู้เรียกนับได้ว่าทิ้งไปกี่ไม้
 *
 * เลือก "ทิ้ง" ไม่ใช่ "ตัดหน้าต่างให้จบที่เส้นแบ่ง" ด้วยเหตุผลเดียวกับ combine.mjs:
 * ไม้ที่ถูกบังคับปิดก่อนกำหนดไม่ใช่ไม้ H แท่ง เอาไปเฉลี่ยรวมในช่องเดียวกันไม่ได้
 * และจะทำให้ค่าของช่อง train กับ validation เทียบกันไม่ได้อีกต่อไป
 */
function scanDataset({
  ds, entryFrom, entryTo, maxIndex = ds.candles.length - 1, emit, emitPartial = false,
}) {
  const { candles, market, symbol } = ds;
  const n = maxIndex + 1;
  const hMax = HORIZONS[HORIZONS.length - 1];
  const from = Math.max(MIN_HISTORY + 1, entryFrom);
  const to = Math.min(n - 1, entryTo);

  for (let t = from; t <= to; t++) {
    const entryBar = candles[t];
    if (!isUsableBar(entryBar)) continue;
    const i = t - 1;                       // แท่งสัญญาณ — เห็นได้ถึงแค่ตรงนี้
    const g = geometryAt(candles, i, market);   // [CAUSAL] อ่าน candles[0..i]
    if (!g.okLong || !g.okShort) continue;
    const entry = entryBar.open;
    if (!(entry > 0)) continue;

    const plannedRisk = Math.abs(g.entryOut - g.slLong);
    const stopDistPct = plannedRisk / entry;
    const fee = feeFractionFor(market, symbol, entry, stopDistPct);
    if (!Number.isFinite(fee)) continue;

    // ── ORACLE: เดินไปข้างหน้าไม่เกิน hMax แท่ง เก็บทุกอย่างที่แต่ละหน้าต่างถือต้องใช้ ──
    let runMaxHigh = -Infinity; let runMinLow = Infinity;
    let lastUsableClose = NaN; let lastUsableIdx = -1;
    let hitLong = null; let hitShort = null;   // {exit, atOffset}
    const out = [];
    let hIdx = 0;
    for (let off = 0; off < hMax; off++) {
      const j = t + off;
      if (j > maxIndex) break;
      const bar = candles[j];
      if (isUsableBar(bar)) {
        if (bar.high > runMaxHigh) runMaxHigh = bar.high;
        if (bar.low < runMinLow) runMinLow = bar.low;
        lastUsableClose = bar.close; lastUsableIdx = j;
        if (hitLong === null) {
          if (bar.open <= g.slLong) hitLong = bar.open;
          else if (bar.open >= g.tpLong) hitLong = bar.open;
          else if (bar.low <= g.slLong) hitLong = g.slLong;
          else if (bar.high >= g.tpLong) hitLong = g.tpLong;
        }
        if (hitShort === null) {
          if (bar.open >= g.slShort) hitShort = bar.open;
          else if (bar.open <= g.tpShort) hitShort = bar.open;
          else if (bar.high >= g.slShort) hitShort = g.slShort;
          else if (bar.low <= g.tpShort) hitShort = g.tpShort;
        }
      }
      // ถึงขอบของหน้าต่างถือหนึ่งค่าแล้วหรือยัง
      while (hIdx < HORIZONS.length && HORIZONS[hIdx] === off + 1) {
        out.push({
          H: HORIZONS[hIdx], partial: false,
          lastIdx: lastUsableIdx,
          maxHigh: runMaxHigh, minLow: runMinLow, endClose: lastUsableClose,
          exitLong: hitLong !== null ? hitLong : lastUsableClose,
          exitShort: hitShort !== null ? hitShort : lastUsableClose,
        });
        hIdx++;
      }
    }
    // หน้าต่างที่ข้อมูลหมดก่อนครบ H แท่ง — ปกติทิ้ง ยกเว้นตอนตรวจ look-ahead
    if (emitPartial) {
      while (hIdx < HORIZONS.length) {
        out.push({
          H: HORIZONS[hIdx], partial: true,
          lastIdx: lastUsableIdx,
          maxHigh: runMaxHigh, minLow: runMinLow, endClose: lastUsableClose,
          exitLong: hitLong !== null ? hitLong : lastUsableClose,
          exitShort: hitShort !== null ? hitShort : lastUsableClose,
        });
        hIdx++;
      }
    } else {
      // บอกผู้เรียกว่าไม้นี้ถูกทิ้งเพราะหน้าต่างเดินไม่ครบภายในขอบเขตที่อนุญาต
      // (ขอบเขตนั้นคือเส้นแบ่ง split เมื่อผู้เรียกส่ง maxIndex ของ split เข้ามา)
      while (hIdx < HORIZONS.length) { emit({ t, H: HORIZONS[hIdx], skipSpill: true }); hIdx++; }
    }

    for (const w of out) {
      if (!(w.lastIdx >= 0) || !Number.isFinite(w.endClose)) continue;
      const netMove = w.endClose - entry;
      if (netMove === 0) { emit({ t, H: w.H, skipFlat: true }); continue; } // ทิศไม่นิยาม
      const dirTrue = netMove > 0 ? 1 : -1;

      const perfect = Math.max((w.maxHigh - entry) / entry, (entry - w.minLow) / entry);
      const rLong = (w.exitLong - entry) / entry;
      const rShort = (entry - w.exitShort) / entry;
      const correct = dirTrue > 0 ? rLong : rShort;
      const wrong = dirTrue > 0 ? rShort : rLong;
      const bestGeom = Math.max(rLong, rShort);

      emit({
        t, H: w.H, time: ds.times[t], symbol,
        perfect, correct, wrong, bestGeom, fee, dirTrue,
        lastIdx: w.lastIdx,
      });
    }
  }
}

// ═══════════════════════ ตัวสะสมผลรวมต่อกลุ่ม (สำหรับ bootstrap) ═══════════════════════

const SLOT = { n: 0, perfect: 1, correct: 2, wrong: 3, best: 4, fee: 5, engOut: 6, LEN: 7 };

class CellAcc {
  constructor() { this.clusters = new Map(); this.flat = 0; this.spill = 0; }
  add(clusterKey, rec, spilled, engOut = 0) {
    let a = this.clusters.get(clusterKey);
    if (!a) { a = new Float64Array(SLOT.LEN); this.clusters.set(clusterKey, a); }
    a[SLOT.n] += 1;
    a[SLOT.perfect] += rec.perfect;
    a[SLOT.correct] += rec.correct;
    a[SLOT.wrong] += rec.wrong;
    a[SLOT.best] += rec.bestGeom;
    a[SLOT.fee] += rec.fee;
    a[SLOT.engOut] += engOut;
    if (spilled) this.spill++;
  }
}

/** ดึงชุด {n,s} ของสถิติหนึ่งตัวออกมาให้ clusterMean ใช้ */
function seriesOf(acc, fn) {
  const out = [];
  for (const a of acc.clusters.values()) out.push({ n: a[SLOT.n], s: fn(a) });
  return out;
}

/**
 * bootstrap แบบสุ่มกลุ่มทั้งกลุ่ม (cluster bootstrap) — สุ่มครั้งเดียว คำนวณทุกสถิติ
 * เพราะสถิติหลายตัวมาจากผลรวมชุดเดียวกัน ต้องสุ่มพร้อมกันถึงจะสะท้อนความสัมพันธ์
 */
function bootstrapCell(acc, rng, B = OPT.bootstrap) {
  const arr = [...acc.clusters.values()];
  const G = arr.length;
  if (G < 2) return null;
  const stats = {
    perfectNet: new Float64Array(B), dirNet: new Float64Array(B),
    net60: new Float64Array(B), net55: new Float64Array(B), pStar: new Float64Array(B),
  };
  for (let b = 0; b < B; b++) {
    let n = 0; let sp = 0; let sc = 0; let sw = 0; let sf = 0;
    for (let k = 0; k < G; k++) {
      const a = arr[(rng() * G) | 0];
      n += a[SLOT.n]; sp += a[SLOT.perfect]; sc += a[SLOT.correct];
      sw += a[SLOT.wrong]; sf += a[SLOT.fee];
    }
    const mP = sp / n; const mC = sc / n; const mW = sw / n; const mF = sf / n;
    stats.perfectNet[b] = mP - mF;
    stats.dirNet[b] = mC - mF;
    stats.net60[b] = 0.60 * mC + 0.40 * mW - mF;
    stats.net55[b] = 0.55 * mC + 0.45 * mW - mF;
    stats.pStar[b] = (mF - mW) / (mC - mW);
  }
  const ci = {};
  for (const k of Object.keys(stats)) {
    const s = Array.from(stats[k]).sort((a, b) => a - b);
    ci[k] = [percentileOfSorted(s, 0.025), percentileOfSorted(s, 0.975)];
  }
  return ci;
}

// ═════════════════════════ เรียก lab.mjs เพื่อเอาไม้ของระบบจริง ═════════════════════════

function runLabBaseline() {
  const tag = 'ceiling-base';
  const files = SPLITS.map((s) => path.join(WORK_DIR, `${tag}-${s}-trades.csv`));
  if (!OPT.refresh && files.every((f) => fs.existsSync(f))) return { files, cached: true };
  execFileSync(process.execPath, [
    LAB,
    '--markets=TH_STOCK,GOLD,FOREX,US_STOCK,CRYPTO',
    '--timeframes=1D,1H',
    '--split=train,validation',
    '--max-hold=10',
    `--tag=${tag}`,
    '--dump-trades',
    '--bootstrap=200',
    `--seed=${OPT.seed}`,
  ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  for (const suffix of ['train-trades.csv', 'validation-trades.csv', 'train+validation.txt', 'train+validation.json']) {
    const src = path.join(REPORT_DIR, `${tag}-${suffix}`);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(WORK_DIR, `${tag}-${suffix}`));
  }
  return { files, cached: false };
}

/** รัน lab.mjs ด้วยเรขาคณิต ATR ล้วน — ใช้ตรวจว่าโค้ดในไฟล์นี้เข้าใจกติกาตรงกับ lab */
function runLabAtrOnly() {
  const tag = 'ceiling-atr';
  const file = path.join(WORK_DIR, `${tag}-train-trades.csv`);
  if (!OPT.refresh && fs.existsSync(file)) return { file, cached: true };
  execFileSync(process.execPath, [
    LAB,
    '--markets=TH_STOCK,GOLD,FOREX,US_STOCK,CRYPTO',
    '--timeframes=1D,1H',
    '--split=train',
    '--max-hold=10',
    `--tag=${tag}`,
    '--dump-trades',
    '--bootstrap=200',
    `--seed=${OPT.seed}`,
    `--config=${JSON.stringify({ exits: { useSupportResistance: false, slAtrMult: GEO.slAtrMult, tpAtrMult: GEO.tpAtrMult } })}`,
  ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  for (const suffix of ['train-trades.csv', 'train.txt', 'train.json']) {
    const src = path.join(REPORT_DIR, `${tag}-${suffix}`);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(WORK_DIR, `${tag}-${suffix}`));
  }
  return { file, cached: false };
}

function readTradesCsv(file) {
  // แคชผลของ lab ก็เป็นขาเข้าเหมือนกัน — ถ้าไฟล์นี้เปลี่ยน ตัวเลขในรายงานก็เปลี่ยน
  const lines = IN.read(file, 'lab-cache').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const num = new Set(['confidence', 'holdBars', 'entry', 'exit', 'stopLoss', 'takeProfit',
    'rrPlanned', 'stopDistPct', 'plannedRisk', 'realizedRisk', 'riskKeepRatio', 'rGrossPlanned',
    'rGrossRealized', 'rGross', 'costR', 'costRBase', 'rNet', 'tradeable']);
  return lines.slice(1).map((line) => {
    const v = line.split(',');
    const o = {};
    head.forEach((k, idx) => { o[k] = num.has(k) ? Number(v[idx]) : v[idx]; });
    return o;
  });
}

// ═══════════════════════════════ การเขียนรายงาน ═══════════════════════════════

const LINES = [];
const W = (s = '') => LINES.push(s);
const bps = (v, d = 2) => (Number.isFinite(v) ? `${(v * 10000).toFixed(d)}` : '—');
const pS = (p) => (!Number.isFinite(p) ? '—' : (p < 1e-4 ? p.toExponential(1) : p.toFixed(4)));
const pctS = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');

// ════════════════════════════════════ MAIN ════════════════════════════════════

async function main() {
  const t0 = Date.now();
  const bounds = IN.readJson(SPLIT_FILE, 'split');
  const JSONOUT = { generatedAt: new Date().toISOString(), opt: OPT, cells: {}, audit: {}, meter: {} };

  // ── โหลดชุดข้อมูลทั้งหมดที่ใช้ได้ ────────────────────────────────────────────
  const files = listDatasets();
  const datasets = [];
  const dropped = [];
  for (const f of files) {
    const ds = loadDataset(f);
    if (ds.verdict === 'bad') { dropped.push(`${ds.market}/${ds.symbol}/${ds.timeframe}`); continue; }
    if (!ds.candles.length) { dropped.push(`${ds.market}/${ds.symbol}/${ds.timeframe} (ว่าง)`); continue; }
    datasets.push(ds);
  }

  // ── คัดหุ้นซิ่ง จาก train ของ 1H เท่านั้น (นิยามเดียวกับ exp-th-scalp) ──────────
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
    return null;   // หุ้นไทยที่ไม่เข้าทั้งสองกลุ่ม — ทิ้ง ไม่ให้ปนตารางไหน
  };

  // ══════════════ C0 · ตรวจเครื่องวัด: โค้ดในไฟล์นี้เข้าใจกติกาตรงกับ lab.mjs ไหม ══════════════
  const atrRun = runLabAtrOnly();
  const atrTrades = readTradesCsv(atrRun.file);
  const dsIndex = new Map();
  for (const ds of datasets) {
    const idx = new Map();
    ds.candles.forEach((c, k) => idx.set(c.timestamp, k));
    dsIndex.set(`${ds.market}|${ds.symbol}|${ds.timeframe}`, { ds, idx });
  }

  // ATR ที่ไฟล์นี้เขียนใหม่ (รับดัชนี) ต้องเท่ากับ ATR ตัวจริงใน src/lib/indicators.ts ทุกบิต
  const { indicators } = await loadSrcModules(['src/lib/indicators.ts']);
  const atrParity = { checked: 0, maxErr: 0 };
  for (const ds of datasets) {
    const step = Math.max(1, Math.floor(ds.candles.length / 200));
    for (let i = MIN_HISTORY; i < ds.candles.length; i += step) {
      const mine = atrAt(ds.candles, i);
      const real = indicators.ATR(ds.candles.slice(0, i + 1), GEO.atrPeriod);
      atrParity.checked++;
      const d = Math.abs(mine - real);
      if (Number.isFinite(d)) atrParity.maxErr = Math.max(atrParity.maxErr, d);
    }
  }
  JSONOUT.atrParity = atrParity;

  const meter = { checked: 0, maxGeoErrSL: 0, maxGeoErrTP: 0, maxExitErr: 0, reasonMismatch: 0, maxFeeErr: 0, noBar: 0 };
  for (const tr of atrTrades) {
    const key = `${tr.market}|${tr.symbol}|${tr.timeframe}`;
    const hit = dsIndex.get(key);
    if (!hit) { meter.noBar++; continue; }
    const t = hit.idx.get(tr.entryTime);
    if (t === undefined || t < 1) { meter.noBar++; continue; }
    meter.checked++;
    const g = geometryAt(hit.ds.candles, t - 1, tr.market);
    const isLong = tr.action === 'BUY';
    const mySl = isLong ? g.slLong : g.slShort;
    const myTp = isLong ? g.tpLong : g.tpShort;
    meter.maxGeoErrSL = Math.max(meter.maxGeoErrSL, Math.abs(mySl - tr.stopLoss));
    meter.maxGeoErrTP = Math.max(meter.maxGeoErrTP, Math.abs(myTp - tr.takeProfit));

    // จำลองการออกด้วยลูปเดียวกับที่ scanDataset ใช้
    let exit = NaN; let reason = 'time_exit'; let lastClose = NaN;
    const last = Math.min(t + 10 - 1, hit.ds.candles.length - 1);
    for (let j = t; j <= last; j++) {
      const bar = hit.ds.candles[j];
      if (!isUsableBar(bar)) continue;
      lastClose = bar.close;
      if (isLong) {
        if (bar.open <= tr.stopLoss) { exit = bar.open; reason = 'gap_stop'; break; }
        if (bar.open >= tr.takeProfit) { exit = bar.open; reason = 'gap_target'; break; }
        if (bar.low <= tr.stopLoss) { exit = tr.stopLoss; reason = 'stop_loss'; break; }
        if (bar.high >= tr.takeProfit) { exit = tr.takeProfit; reason = 'take_profit'; break; }
      } else {
        if (bar.open >= tr.stopLoss) { exit = bar.open; reason = 'gap_stop'; break; }
        if (bar.open <= tr.takeProfit) { exit = bar.open; reason = 'gap_target'; break; }
        if (bar.high >= tr.stopLoss) { exit = tr.stopLoss; reason = 'stop_loss'; break; }
        if (bar.low <= tr.takeProfit) { exit = tr.takeProfit; reason = 'take_profit'; break; }
      }
    }
    if (!Number.isFinite(exit)) exit = lastClose;
    meter.maxExitErr = Math.max(meter.maxExitErr, Math.abs(exit - tr.exit));
    if (reason !== tr.exitReason) meter.reasonMismatch++;

    if (tr.market !== 'TH_STOCK') {
      const myFee = feeFractionFor(tr.market, tr.symbol, tr.entry, tr.stopDistPct);
      const labFee = tr.costR * tr.stopDistPct;
      meter.maxFeeErr = Math.max(meter.maxFeeErr, Math.abs(myFee - labFee));
    }
  }
  JSONOUT.meter = meter;

  // ══════════════ C1 · ตรวจ look-ahead ด้วยการตัดข้อมูลท้ายทิ้ง ══════════════
  //
  // วิธีพิสูจน์ที่หนักแน่นที่สุด: คำนวณ feature บนชุดเต็ม แล้วคำนวณซ้ำบนชุดที่ตัดท้ายทิ้ง
  // ค่าของแท่งเก่าต้องไม่เปลี่ยนแม้แต่บิตเดียว
  //   · ค่า [CAUSAL] ต้องไม่เปลี่ยน "ทุกแท่งที่ยังอยู่"
  //   · ค่า ORACLE ต้องไม่เปลี่ยน "เฉพาะแท่งที่หน้าต่างถืออยู่ครบในชุดที่ตัดแล้ว"
  //     และต้องเปลี่ยนสำหรับแท่งที่หน้าต่างถูกตัด — ถ้าไม่เปลี่ยนแปลว่าการตรวจไม่มีฟัน
  const audit = {
    datasets: 0, causalCompared: 0, causalMismatch: 0,
    oracleInsideCompared: 0, oracleInsideMismatch: 0,
    oracleCutCompared: 0, oracleCutChanged: 0,
    leakCompared: 0, leakChanged: 0,
    perFeature: {},
  };
  const FEATS = ['atr', 'entryOut', 'slLong', 'tpLong', 'slShort', 'tpShort', 'stopDistPct', 'fee'];
  for (const f of FEATS) audit.perFeature[f] = { compared: 0, mismatch: 0 };
  const ORACLE_FEATS = ['perfect', 'correct', 'wrong', 'bestGeom', 'dirTrue'];
  for (const f of ORACLE_FEATS) audit.perFeature[f] = { compared: 0, mismatch: 0, cutCompared: 0, cutChanged: 0 };
  audit.perFeature.zClose_LEAKY = { compared: 0, mismatch: 0 };

  /**
   * เก็บค่า feature ทั้งชุดของ dataset หนึ่ง ณ ความยาวที่กำหนด — ใช้เฉพาะการตรวจ
   * ใช้ typed array ดัชนีตามแท่ง ไม่ใช้ Map เพราะทั้งคลังมีเกินล้านแท่ง
   * ค่า NaN = "แท่งนี้ไม่มีค่า" (ไม่ผ่านเกณฑ์ใช้งาน) ซึ่งเทียบกันได้ตรง ๆ
   */
  function featureSnapshot(ds, maxIndex) {
    const n = maxIndex + 1;
    const NF = FEATS.length; const NO = ORACLE_FEATS.length; const NH = HORIZONS.length;
    const causal = new Float64Array(n * NF).fill(NaN);
    const oracle = new Float64Array(n * NH * NO).fill(NaN);
    const leaky = new Float64Array(n).fill(NaN);
    const hasCausal = new Uint8Array(n);
    const hasOracle = new Uint8Array(n * NH);

    for (let t = Math.max(MIN_HISTORY + 1, 1); t <= maxIndex; t++) {
      const bar = ds.candles[t];
      if (!isUsableBar(bar)) continue;
      const g = geometryAt(ds.candles, t - 1, ds.market);
      if (!g.okLong || !g.okShort) continue;
      const entry = bar.open;
      if (!(entry > 0)) continue;
      const sdp = Math.abs(g.entryOut - g.slLong) / entry;
      const base = t * NF;
      causal[base] = g.atr; causal[base + 1] = g.entryOut; causal[base + 2] = g.slLong;
      causal[base + 3] = g.tpLong; causal[base + 4] = g.slShort; causal[base + 5] = g.tpShort;
      causal[base + 6] = sdp; causal[base + 7] = feeFractionFor(ds.market, ds.symbol, entry, sdp);
      hasCausal[t] = 1;
    }
    scanDataset({
      ds, entryFrom: 0, entryTo: maxIndex, maxIndex, emitPartial: true,
      emit: (r) => {
        if (r.skipFlat) return;
        const hi = HORIZONS.indexOf(r.H);
        const slot = (r.t * NH + hi);
        const b = slot * NO;
        oracle[b] = r.perfect; oracle[b + 1] = r.correct; oracle[b + 2] = r.wrong;
        oracle[b + 3] = r.bestGeom; oracle[b + 4] = r.dirTrue;
        hasOracle[slot] = 1;
      },
    });
    // ── ตัวควบคุมเชิงบวก: feature ที่ "รั่ว" จริง — normalize ด้วยค่าเฉลี่ยของทั้งชุด ──
    // ถ้าการตรวจของเราจับตัวนี้ไม่ได้ แปลว่าการตรวจใช้ไม่ได้ ไม่ใช่ feature ปลอดภัย
    let s = 0; let ss = 0; let m = 0;
    for (let k = 0; k <= maxIndex; k++) { const c = ds.candles[k]; if (!isUsableBar(c)) continue; s += c.close; ss += c.close * c.close; m++; }
    const mu = s / m; const sd = Math.sqrt(Math.max(ss / m - mu * mu, 0));
    for (let t = 0; t <= maxIndex; t++) if (hasCausal[t]) leaky[t] = sd > 0 ? (ds.candles[t].close - mu) / sd : 0;
    return { causal, oracle, leaky, hasCausal, hasOracle, n };
  }

  for (const ds of datasets) {
    const n = ds.candles.length;
    if (n < MIN_HISTORY + 40) continue;
    audit.datasets++;
    const cut = Math.floor(n * 0.8);           // ตัดท้ายทิ้ง 20%
    const full = featureSnapshot(ds, n - 1);
    const trunc = featureSnapshot(ds, cut - 1);

    const NF = FEATS.length; const NO = ORACLE_FEATS.length; const NH = HORIZONS.length;
    for (let t = 0; t < trunc.n; t++) {
      if (!trunc.hasCausal[t] || !full.hasCausal[t]) continue;
      for (let k = 0; k < NF; k++) {
        const pf = audit.perFeature[FEATS[k]];
        pf.compared++; audit.causalCompared++;
        // เทียบแบบ "เท่ากันทุกบิต" — ไม่ใช่ใกล้เคียง (NaN === NaN เป็น false จึงเช็คแยก)
        const a = full.causal[t * NF + k]; const b = trunc.causal[t * NF + k];
        const same = (Number.isNaN(a) && Number.isNaN(b)) || a === b;
        if (!same) { pf.mismatch++; audit.causalMismatch++; }
      }
      audit.perFeature.zClose_LEAKY.compared++; audit.leakCompared++;
      if (full.leaky[t] !== trunc.leaky[t]) { audit.perFeature.zClose_LEAKY.mismatch++; audit.leakChanged++; }
    }
    for (let t = 0; t < trunc.n; t++) {
      for (let hi = 0; hi < NH; hi++) {
        const slot = t * NH + hi;
        if (!trunc.hasOracle[slot] || !full.hasOracle[slot]) continue;
        const inside = t + HORIZONS[hi] - 1 <= cut - 1;
        for (let k = 0; k < NO; k++) {
          const pf = audit.perFeature[ORACLE_FEATS[k]];
          const same = full.oracle[slot * NO + k] === trunc.oracle[slot * NO + k];
          if (inside) {
            pf.compared++; audit.oracleInsideCompared++;
            if (!same) { pf.mismatch++; audit.oracleInsideMismatch++; }
          } else {
            pf.cutCompared++; audit.oracleCutCompared++;
            if (!same) { pf.cutChanged++; audit.oracleCutChanged++; }
          }
        }
      }
    }
  }
  // การคัดหุ้นซิ่งใช้ข้อมูลถึง trainEnd เท่านั้น — ตัดข้อมูลหลัง trainEnd ทิ้งแล้วต้องได้ชุดเดิม
  const runnerRecheck = new Set();
  for (const ds of datasets) {
    if (ds.market !== 'TH_STOCK' || ds.timeframe !== '1H') continue;
    const cutIdx = lowerBound(ds.times, trainEnd1H);
    const truncDs = { ...ds, candles: ds.candles.slice(0, cutIdx), times: ds.times.slice(0, cutIdx) };
    const p = thTrainProfile(truncDs, Number.MAX_SAFE_INTEGER);
    if (!SET50_SYMBOLS.includes(ds.symbol) && p.barRangePct >= RUNNER_RULE.minBarRangePct
      && p.turnover >= RUNNER_RULE.minTurnoverBaht && p.bars >= RUNNER_RULE.minBars) runnerRecheck.add(ds.symbol);
  }
  audit.runnerStable = runnerRecheck.size === runnerSet.size
    && [...runnerSet].every((s) => runnerRecheck.has(s));
  JSONOUT.audit = audit;

  // ══════════════ C2–C4 · เดินข้อมูลจริง สะสมผลรวมทุกช่อง ══════════════
  const cells = new Map();   // `${split}|${group}|${tf}|${H}` -> CellAcc
  const cellOf = (k) => { let c = cells.get(k); if (!c) { c = new CellAcc(); cells.set(k, c); } return c; };

  // เตรียมชุดเวลาที่ต้องเก็บ label ไว้เทียบกับไม้ของระบบจริง (ประหยัดหน่วยความจำ)
  const base = runLabBaseline();
  const engineTrades = { train: readTradesCsv(base.files[0]), validation: readTradesCsv(base.files[1]) };
  const wantLabel = new Map();  // dsKey -> Set(timestamp)
  for (const split of SPLITS) {
    for (const tr of engineTrades[split]) {
      const k = `${tr.market}|${tr.symbol}|${tr.timeframe}`;
      if (!wantLabel.has(k)) wantLabel.set(k, new Map());
      wantLabel.get(k).set(tr.entryTime, tr.action === 'BUY' ? 1 : -1);
    }
  }
  // dsKey -> Map(timestamp -> Int8Array(HORIZONS.length))  · 0 = ไม่มีค่า
  const labelStore = new Map();

  for (const ds of datasets) {
    const grp = groupOf(ds);
    if (!grp) continue;
    const b = bounds.timeframes[ds.timeframe];
    if (!b) continue;
    const dsKey = `${ds.market}|${ds.symbol}|${ds.timeframe}`;
    const want = wantLabel.get(dsKey);
    const n = ds.times.length;
    const iTrainEnd = lowerBound(ds.times, Date.parse(b.trainEnd));
    const iValEnd = lowerBound(ds.times, Date.parse(b.validationEnd));
    const win = {
      train: { from: 0, to: iTrainEnd - 1, end: iTrainEnd - 1 },
      validation: { from: iTrainEnd, to: iValEnd - 1, end: iValEnd - 1 },
    };
    for (const split of SPLITS) {
      const w = win[split];
      if (w.from > w.to || w.from >= n) continue;
      scanDataset({
        ds, entryFrom: Math.max(0, w.from), entryTo: Math.min(n - 1, w.to),
        // ── หัวใจของด่านกันการล้ำ: oracle มองได้ไม่เกินแท่งสุดท้ายของ split นี้ ──
        // --keep-spill คือโหมดเทียบ "ก่อนแก้" เท่านั้น ไม่ใช่โหมดสำหรับผลิตตัวเลขจริง
        maxIndex: OPT.keepSpill ? Math.min(n - 1, ds.candles.length - 1) : Math.min(n - 1, w.end),
        emit: (r) => {
          const key = `${split}|${grp}|${ds.timeframe}|${r.H}`;
          const acc = cellOf(key);
          if (r.skipSpill) { acc.spill++; return; }
          if (r.skipFlat) { acc.flat++; return; }
          const d = new Date(r.time);
          const cl = `${r.symbol}|${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          acc.add(cl, r, r.lastIdx > w.end);
          const ts = ds.candles[r.t].timestamp;
          // ── ชุดย่อย "เฉพาะแท่งที่เครื่องยนต์ปัจจุบันเข้าไม้จริง" ──────────────────
          // ต้องมีชุดนี้เพราะ p* ของทุกแท่ง กับความแม่นของเครื่องยนต์ วัดจากคนละกลุ่มตัวอย่าง
          // เอามาเทียบกันตรง ๆ ไม่ยุติธรรม — ชุดนี้ทำให้เทียบบนแท่งชุดเดียวกันเป๊ะ
          if (want && want.has(ts)) {
            // ผลจริงของ "ทิศที่ระบบเลือกเอง" ใต้เรขาคณิตเดียวกัน — ตัวปิดช่องว่างระหว่าง
            // "ความแม่นถึง p* แล้วควรกำไร" กับ "ของจริงยังขาดทุน"
            const engDir = want.get(ts);
            const engOut = engDir === r.dirTrue ? r.correct : r.wrong;
            cellOf(`${split}ENG|${grp}|${ds.timeframe}|${r.H}`).add(cl, r, r.lastIdx > w.end, engOut);
          }
          if (want && want.has(ts)) {
            let m = labelStore.get(dsKey);
            if (!m) { m = new Map(); labelStore.set(dsKey, m); }
            let v = m.get(ts);
            if (!v) { v = new Int8Array(HORIZONS.length); m.set(ts, v); }
            v[HORIZONS.indexOf(r.H)] = r.dirTrue;
          }
        },
      });
    }
  }

  // ══════════════ สรุปตัวเลขต่อช่อง + ลงทะเบียนการทดสอบ ══════════════
  const rng = mulberry32(OPT.seed);
  const cellStats = new Map();
  for (const split of [...SPLITS, ...SPLITS.map((s) => `${s}ENG`)]) {
    for (const tf of TIMEFRAMES) {
      for (const H of HORIZONS) {
        for (const g of GROUPS) {
          const key = `${split}|${g}|${tf}|${H}`;
          const acc = cells.get(key);
          if (!acc || acc.clusters.size < 2) continue;
          const mPerfect = clusterMean(seriesOf(acc, (a) => a[SLOT.perfect]));
          const mCorrect = clusterMean(seriesOf(acc, (a) => a[SLOT.correct]));
          const mWrong = clusterMean(seriesOf(acc, (a) => a[SLOT.wrong]));
          const mBest = clusterMean(seriesOf(acc, (a) => a[SLOT.best]));
          const mFee = clusterMean(seriesOf(acc, (a) => a[SLOT.fee]));
          const perfectNet = clusterMean(seriesOf(acc, (a) => a[SLOT.perfect] - a[SLOT.fee]));
          const dirNet = clusterMean(seriesOf(acc, (a) => a[SLOT.correct] - a[SLOT.fee]));
          const bestNet = clusterMean(seriesOf(acc, (a) => a[SLOT.best] - a[SLOT.fee]));
          const net60 = clusterMean(seriesOf(acc, (a) => 0.60 * a[SLOT.correct] + 0.40 * a[SLOT.wrong] - a[SLOT.fee]));
          const net55 = clusterMean(seriesOf(acc, (a) => 0.55 * a[SLOT.correct] + 0.45 * a[SLOT.wrong] - a[SLOT.fee]));
          const pStar = (mFee.mean - mWrong.mean) / (mCorrect.mean - mWrong.mean);
          // p_fair = ความแม่นที่ต้องมีถ้า "ค่าธรรมเนียมเป็นศูนย์" — มาจากความไม่สมมาตรของ
          // เรขาคณิตล้วน ๆ (TP 3×ATR ไกลกว่า SL 1.5×ATR) · ส่วนต่าง p* − p_fair คือ
          // "ภาษีความแม่น" ที่ค่าธรรมเนียมเรียกเก็บ ซึ่งเป็นตัวเลขที่เทียบข้ามตลาดได้ตรง ๆ
          const pFair = (0 - mWrong.mean) / (mCorrect.mean - mWrong.mean);
          // เพดานอีกแบบ: ทายถูกว่า "ฝั่งไหนจ่าย" (ไม่ใช่ทายว่าราคาไปจบตรงไหน)
          // นี่คือขอบบนที่แท้จริงของ "ทำนายทิศ" ใต้เรขาคณิตนี้ — ต่ำกว่านี้ไม่มี
          const mWorst = mCorrect.mean + mWrong.mean - mBest.mean;
          const pStarGeom = (mFee.mean - mWorst) / (mBest.mean - mWorst);
          const engNet = clusterMean(seriesOf(acc, (a) => a[SLOT.engOut] - a[SLOT.fee]));
          const ci = bootstrapCell(acc, rng);
          const S = {
            key, split, group: g, tf, H, n: mPerfect.n, G: mPerfect.G, flat: acc.flat, spill: acc.spill,
            perfect: mPerfect, correct: mCorrect, wrong: mWrong, best: mBest, worst: mWorst, fee: mFee,
            perfectNet, dirNet, bestNet, net60, net55, pStar, pFair, pStarGeom, engNet, ci,
          };
          cellStats.set(key, S);
          if (split.endsWith('ENG')) continue;   // ชุดย่อยไม่ลงทะเบียนทดสอบซ้ำ

          const fam = split === 'train' ? 'train (สำรวจ)' : 'validation (ยืนยัน)';
          registerTest({
            id: `${g}-${tf}-H${H}-dirNet`, family: fam,
            question: `เพดาน(ข) รู้ทิศ 100% แล้วยังเป็นบวกหลังหักค่าธรรมเนียม · ${GROUP_LABEL[g]} ${tf} H${H}`,
            estimate: dirNet.mean, ci: ci ? ci.dirNet : [NaN, NaN], p: dirNet.p,
          });
          registerTest({
            id: `${g}-${tf}-H${H}-net60`, family: fam,
            question: `เพดาน(ค) แม่น 60% แล้วเป็นบวกหลังหักค่าธรรมเนียม · ${GROUP_LABEL[g]} ${tf} H${H}`,
            estimate: net60.mean, ci: ci ? ci.net60 : [NaN, NaN], p: net60.p,
          });
        }
      }
    }
  }
  applyHolm();
  for (const [k, v] of cellStats) {
    JSONOUT.cells[k] = {
      n: v.n, G: v.G, flat: v.flat, spill: v.spill,
      perfect: v.perfect.mean, correct: v.correct.mean, wrong: v.wrong.mean,
      best: v.best.mean, fee: v.fee.mean,
      perfectNet: v.perfectNet.mean, dirNet: v.dirNet.mean, bestNet: v.bestNet.mean,
      net60: v.net60.mean, net55: v.net55.mean,
      pStar: v.pStar, pFair: v.pFair, pStarGeom: v.pStarGeom, worst: v.worst,
      engNet: v.engNet.mean, engNetP: v.engNet.p, ci: v.ci,
      pDirNet: v.dirNet.p, pNet60: v.net60.p,
    };
  }

  // ══════════════ C5 · ความแม่นจริงของระบบปัจจุบัน ══════════════
  const engineAcc = new Map();  // `${split}|${group}|${tf}|${H}` -> {hit, n}
  const engineUnmatched = { train: 0, validation: 0 };
  for (const split of SPLITS) {
    for (const tr of engineTrades[split]) {
      const dsKey = `${tr.market}|${tr.symbol}|${tr.timeframe}`;
      const hit = dsIndex.get(dsKey);
      if (!hit) continue;
      const grp = groupOf(hit.ds);
      if (!grp) continue;
      const labs = labelStore.get(dsKey)?.get(tr.entryTime);
      for (let hi = 0; hi < HORIZONS.length; hi++) {
        const H = HORIZONS[hi];
        const lab = labs ? labs[hi] : 0;
        if (!lab) { if (H === 10) engineUnmatched[split]++; continue; }
        const k = `${split}|${grp}|${tr.timeframe}|${H}`;
        let e = engineAcc.get(k);
        if (!e) { e = { hit: 0, n: 0 }; engineAcc.set(k, e); }
        e.n++;
        const dir = tr.action === 'BUY' ? 1 : -1;
        if (dir === lab) e.hit++;
      }
    }
  }
  JSONOUT.engineAcc = Object.fromEntries([...engineAcc].map(([k, v]) => [k, { ...v, rate: v.hit / v.n }]));
  JSONOUT.engineUnmatched = engineUnmatched;

  // ════════════════════════════════ เขียนรายงาน ════════════════════════════════
  JSONOUT.tests = TESTS;
  // ต้องคำนวณที่มา *ก่อน* เขียนรายงาน เพราะ .md ต้องพิมพ์ sha เดียวกับที่ลงใน .json
  JSONOUT.provenance = buildProvenance({
    scriptPath: SCRIPT_PATH,
    root: ROOT,
    ledger: IN,
    argv: process.argv.slice(2),
    volatileFields: ['generatedAt', 'elapsedMs', 'opt.outDir', 'provenance'],
    volatileReportLines: ['^สร้างโดย `scripts/research/experiments/ceiling', '^ที่มา: sha'],
  });
  writeReport({ bounds, datasets, dropped, thProfiles, runnerSet, meter, atrParity, audit, cellStats, engineAcc, engineUnmatched, atrRun, base, t0, prov: JSONOUT.provenance });
  fs.writeFileSync(path.join(OPT.outDir, 'exp-ceiling.json'), `${JSON.stringify(JSONOUT, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(OPT.outDir, 'exp-ceiling.md'), `${LINES.join('\n')}\n`, 'utf8');
  console.log(`ที่มา: sha สคริปต์ ${JSONOUT.provenance.scriptSha256.slice(0, 12)}`
    + ` · sha ขาเข้ารวม ${JSONOUT.provenance.inputsDigest.slice(0, 12)} (${JSONOUT.provenance.inputs.length} ไฟล์)`);
  console.log(`เขียน ${path.relative(ROOT, path.join(OPT.outDir, 'exp-ceiling.md'))} แล้ว · ${((Date.now() - t0) / 1000).toFixed(1)} วิ`);
}

// ═══════════════════════════════ ตัวเขียนรายงาน ═══════════════════════════════

function writeReport(ctx) {
  const { bounds, datasets, dropped, thProfiles, runnerSet, meter, audit, cellStats, engineAcc, engineUnmatched, t0, prov } = ctx;  // atrParity ใช้ผ่าน ctx
  const get = (split, g, tf, H) => cellStats.get(`${split}|${g}|${tf}|${H}`);

  // ── หาบทสรุป: ช่องไหนที่ "แม้รู้ทิศ 100% ก็ยังขาดทุน" ──
  const closedTrain = [];
  const openTrain = [];
  for (const tf of TIMEFRAMES) {
    for (const H of HORIZONS) {
      for (const g of GROUPS) {
        const c = get('train', g, tf, H);
        if (!c) continue;
        (c.dirNet.mean > 0 ? openTrain : closedTrain).push(c);
      }
    }
  }

  W('# เพดานของแต่ละตลาด — ถ้าเดาทิศถูก จะได้เงินสูงสุดเท่าไร');
  W();
  W('> ⚠ **ไฟล์นี้ใช้ข้อมูลอนาคตโดยตั้งใจ** ตัวเลขทุกตัวคือ "ขอบบนที่พิสูจน์แล้วว่าเป็นไปไม่ได้จะเกิน"');
  W('> ไม่ใช่ผลตอบแทนที่ทำได้จริง · โค้ดใน `scripts/research/experiments/ceiling.mjs` มีคำเตือนเดียวกัน');
  W('> ที่หัวไฟล์ และงานรอบต่อไปห้าม import อะไรจากไฟล์นั้น');
  W();

  // ── บทสรุปที่ตัดสินใจได้ ──
  W('## คำตอบสั้น');
  W();
  const bestByGroup = [];
  for (const g of GROUPS) {
    let best = null;
    for (const tf of TIMEFRAMES) {
      for (const H of HORIZONS) {
        const c = get('train', g, tf, H);
        const v = get('validation', g, tf, H);
        const e = get('trainENG', g, tf, H);
        if (!c || !v || !e) continue;
        const ea = engineAcc.get(`train|${g}|${tf}|${H}`);
        const actual = ea && ea.n > 0 ? ea.hit / ea.n : NaN;
        const gap = e.pStar - actual;
        if (!Number.isFinite(gap)) continue;
        if (!best || gap < best.gap) best = { c, v, e, actual, gap };
      }
    }
    if (best) bestByGroup.push(best);
  }
  bestByGroup.sort((a, b) => a.gap - b.gap);

  W('เรียงตาม "ช่องว่างที่ต้องปีน" = ความแม่นทิศที่ต้องมีเพื่อเสมอตัว ลบด้วยความแม่นที่ระบบทำได้ตอนนี้');
  W('(เลือกช่องที่ดีที่สุดของแต่ละกลุ่มมาแสดง คือเข้าข้างกลุ่มนั้นเต็มที่แล้ว · วัดบนแท่งชุดเดียวกันทั้งสองฝั่ง)');
  W();
  W('| กลุ่ม | ช่องที่ดีที่สุด | ความแม่นคุ้มทุน p* | ระบบปัจจุบันแม่น | ไม้ของระบบ | ช่องว่างที่ต้องปีน | ภาษีความแม่นจากค่าธรรมเนียม | ผลจริงของทิศที่ระบบเลือก (bps สุทธิ) | คำตัดสิน |');
  W('|---|---|---:|---:|---:|---:|---:|---:|---|');
  for (const r of bestByGroup) {
    const { c, e, actual, gap } = r;
    const nEng = engineAcc.get(`train|${c.group}|${c.tf}|${c.H}`)?.n ?? 0;
    let verdict;
    if (!(e.pStar <= 1)) verdict = '**ปิดตาย** — เดาถูก 100% ก็ยังขาดทุน';
    else if (gap > 0.20) verdict = 'ต้องยกเครื่องระดับเปลี่ยนแนวคิด';
    else if (gap > 0.08) verdict = 'ต้องดีขึ้นมาก แต่ไม่เป็นไปไม่ได้';
    else if (gap > 0) verdict = '**ใกล้ที่สุด** — ต้องดีขึ้นไม่มาก';
    else if (e.engNet.mean > 0 && e.engNet.p < 0.05) verdict = 'บวกอย่างมีนัยสำคัญบน train (ต้องยืนยันบน validation)';
    else verdict = 'อยู่ที่เส้นพอดี — วัดไม่ได้ว่าบวกหรือลบ';
    if (nEng < 500) verdict += ` ⚠ ไม้น้อย (${nEng})`;
    W(`| ${GROUP_LABEL[c.group]} | ${c.tf} · ถือ ${c.H} แท่ง | ${e.pStar > 3 ? '>300%' : pctS(e.pStar)} | ${pctS(actual)} | ${nEng.toLocaleString()} | ${gap > 0 ? '+' : ''}${pctS(gap)} | +${pctS(c.pStar - c.pFair)} | ${bps(e.engNet.mean)} | ${verdict} |`);
  }
  W();
  W('⚠ **คอลัมน์รองสุดท้ายคือคอลัมน์ที่ต้องอ่านก่อน** — มันคือผลจริงเมื่อเอา "ทิศที่เครื่องยนต์');
  W('เลือกเอง" ไปวิ่งใต้เรขาคณิตเดียวกันกับที่ใช้คำนวณ p* ถ้าความแม่นอย่างเดียวอธิบายทุกอย่าง');
  W('คอลัมน์นี้ต้องเป็นบวกทุกแถวที่ช่องว่างติดลบ — ดูว่ามันเป็นอย่างนั้นไหม');
  W();
  W(`ช่องทั้งหมดที่วัด (6 กลุ่ม × 2 กรอบเวลา × 4 หน้าต่างถือ) = ${closedTrain.length + openTrain.length} ช่อง`);
  W(`· ช่องที่ **แม้รู้ทิศถูก 100% ก็ยังขาดทุนหลังค่าธรรมเนียม** = **${closedTrain.length} ช่อง**`);
  W(`· ช่องที่รู้ทิศ 100% แล้วเป็นบวก = ${openTrain.length} ช่อง`);
  W();

  // ══════════════ C0 ══════════════
  W('---');
  W();
  W('# C0 · ตรวจเครื่องวัดก่อนเชื่ออะไรทั้งสิ้น');
  W();
  W('ไฟล์นี้คำนวณ ATR · การปัดราคา · SL/TP · ลูปการออก · สูตรค่าธรรมเนียม ขึ้นมาเองทั้งหมด');
  W('ถ้าเข้าใจกติกาคนละอย่างกับ lab.mjs ตัวเลขที่เหลือทั้งรายงานเชื่อไม่ได้เลย');
  W('จึงสั่ง lab.mjs รันด้วยเรขาคณิต ATR ล้วน (SL 1.5×ATR · TP 3×ATR · ปิดแนวรับ/ต้าน) แล้วเทียบไม้ต่อไม้');
  W();
  W('| สิ่งที่ตรวจ | ไม้ที่ตรวจ | ความคลาดเคลื่อนสูงสุด |');
  W('|---|---:|---:|');
  W(`| ATR ที่เขียนใหม่ เทียบกับ src/lib/indicators.ts | ${ctx.atrParity.checked.toLocaleString()} | ${ctx.atrParity.maxErr.toExponential(1)} |`);
  W(`| SL ที่คำนวณเอง เทียบกับที่ lab ใช้จริง | ${meter.checked.toLocaleString()} | ${meter.maxGeoErrSL.toExponential(1)} |`);
  W(`| TP ที่คำนวณเอง เทียบกับที่ lab ใช้จริง | ${meter.checked.toLocaleString()} | ${meter.maxGeoErrTP.toExponential(1)} |`);
  W(`| ราคาออกจากลูปของไฟล์นี้ | ${meter.checked.toLocaleString()} | ${meter.maxExitErr.toExponential(1)} |`);
  W(`| เหตุผลการออกไม่ตรง | ${meter.checked.toLocaleString()} | ${meter.reasonMismatch} ไม้ |`);
  W(`| สูตรค่าธรรมเนียม (ตลาดที่ไม่ใช่หุ้นไทย) | ${meter.checked.toLocaleString()} | ${meter.maxFeeErr.toExponential(1)} |`);
  W();
  const meterOk = meter.maxGeoErrSL === 0 && meter.maxGeoErrTP === 0 && meter.maxExitErr === 0
    && meter.reasonMismatch === 0 && meter.maxFeeErr < 1e-15;
  W(meterOk
    ? '**ผ่านทุกข้อ** — ATR การปัดราคา SL/TP ลูปการออก และสูตรค่าธรรมเนียม ตรงกับ lab.mjs ทุกไม้ที่ตรวจ'
    : '⚠ **ไม่ผ่าน** — ต้องแก้ก่อนอ่านตัวเลขส่วนที่เหลือ');
  W();

  // ══════════════ C1 ══════════════
  W('---');
  W();
  W('# C1 · ตรวจ look-ahead ด้วยการตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ');
  W();
  W('วิธีนี้หนักแน่นกว่าการอ่านโค้ด เพราะจับได้แม้การรั่วที่ซ่อนอยู่ในฟังก์ชันที่เรียกต่อ ๆ กัน:');
  W('คำนวณ feature บนชุดเต็ม → ตัดท้ายทิ้ง 20% → คำนวณซ้ำ → ค่าของแท่งเก่าต้องเท่าเดิม **ทุกบิต**');
  W();
  W(`ทำกับชุดข้อมูลทั้งหมด ${audit.datasets} ชุด (ทุกสัญลักษณ์ × ทุกกรอบเวลา ที่คุณภาพผ่าน)`);
  W();
  W('| feature | ชนิด | จำนวนที่เทียบ | ไม่ตรง | ผล |');
  W('|---|---|---:|---:|---|');
  const featKind = {
    atr: 'CAUSAL', entryOut: 'CAUSAL', slLong: 'CAUSAL', tpLong: 'CAUSAL',
    slShort: 'CAUSAL', tpShort: 'CAUSAL', stopDistPct: 'CAUSAL', fee: 'CAUSAL',
    perfect: 'ORACLE', correct: 'ORACLE', wrong: 'ORACLE', bestGeom: 'ORACLE', dirTrue: 'ORACLE',
    zClose_LEAKY: 'ตัวควบคุมเชิงบวก (รั่วจริง)',
  };
  for (const [f, pf] of Object.entries(audit.perFeature)) {
    const kind = featKind[f] ?? '?';
    let verdict;
    if (kind === 'ตัวควบคุมเชิงบวก (รั่วจริง)') {
      verdict = pf.mismatch > 0 ? `**จับได้ ${pf.mismatch.toLocaleString()} จุด** ← การตรวจมีฟันจริง` : '⚠ จับไม่ได้ = การตรวจใช้ไม่ได้';
    } else {
      verdict = pf.mismatch === 0 ? '**ผ่าน**' : `⚠ ไม่ผ่าน (${pf.mismatch})`;
    }
    W(`| \`${f}\` | ${kind} | ${pf.compared.toLocaleString()} | ${pf.mismatch.toLocaleString()} | ${verdict} |`);
  }
  W();
  W('สำหรับ feature ชนิด ORACLE ตารางข้างบนเทียบ **เฉพาะแท่งที่หน้าต่างถืออยู่ครบในชุดที่ตัดแล้ว**');
  W('ส่วนแท่งที่หน้าต่างถูกตัดกลางคัน ต้องเปลี่ยนค่า — ถ้าไม่เปลี่ยนแปลว่าการตรวจไม่มีฟัน:');
  W();
  W('| feature ORACLE | แท่งที่หน้าต่างถูกตัด | เปลี่ยนค่าจริง |');
  W('|---|---:|---:|');
  for (const f of ['perfect', 'correct', 'wrong', 'bestGeom', 'dirTrue']) {
    const pf = audit.perFeature[f];
    W(`| \`${f}\` | ${pf.cutCompared.toLocaleString()} | ${pf.cutChanged.toLocaleString()} (${pctS(pf.cutChanged / Math.max(pf.cutCompared, 1))}) |`);
  }
  W();
  W(`การคัดหุ้นซิ่ง (ใช้สถิติถึง trainEnd เท่านั้น) — ตัดข้อมูลหลัง trainEnd ทิ้งแล้วได้ชุดเดิมไหม: **${audit.runnerStable ? 'ได้ชุดเดิม' : '⚠ เปลี่ยน'}**`);
  W();
  W('สรุปการตรวจ:');
  W(`· ค่า CAUSAL เทียบทั้งหมด ${audit.causalCompared.toLocaleString()} ค่า · ไม่ตรง **${audit.causalMismatch}**`);
  W(`· ค่า ORACLE ที่หน้าต่างอยู่ครบ เทียบ ${audit.oracleInsideCompared.toLocaleString()} ค่า · ไม่ตรง **${audit.oracleInsideMismatch}**`);
  W(`· ค่า ORACLE ที่หน้าต่างถูกตัด เทียบ ${audit.oracleCutCompared.toLocaleString()} ค่า · เปลี่ยน ${audit.oracleCutChanged.toLocaleString()}`);
  W(`· ตัวควบคุมเชิงบวก (normalize ด้วยค่าเฉลี่ยทั้งชุด) เทียบ ${audit.leakCompared.toLocaleString()} ค่า · เปลี่ยน ${audit.leakChanged.toLocaleString()}`);
  W();
  W('บรรทัดสุดท้ายสำคัญที่สุด: ถ้ารอบหน้ามีใครเผลอ normalize feature ด้วยค่าเฉลี่ยของทั้งชุด');
  W('(ซึ่งเป็นวิธีที่รั่วแบบเงียบที่สุดและอันตรายที่สุดกับ feature ข้ามสัญลักษณ์)');
  W('การตรวจแบบนี้จับได้ทันที — เอาโค้ดในหัวข้อนี้ไปใช้ซ้ำได้');
  W();

  // ══════════════ ขอบเขตข้อมูล ══════════════
  W('---');
  W();
  W('# C2 · ขอบเขตของสิ่งที่วัด');
  W();
  W(`ชุดข้อมูลที่ใช้ ${datasets.length} ชุด · ตัดออกเพราะคุณภาพ/ว่าง ${dropped.length} ชุด (${dropped.join(' · ') || 'ไม่มี'})`);
  W();
  W(`หุ้นซิ่งที่ผ่านเกณฑ์ ${runnerSet.size} ตัว: ${[...runnerSet].join(' · ')}`);
  W(`(เกณฑ์: ช่วงแท่งเฉลี่ย ≥ ${RUNNER_RULE.minBarRangePct}% · มูลค่าซื้อขายมัธยฐาน ≥ ${(RUNNER_RULE.minTurnoverBaht / 1e6).toFixed(1)} ล้านบาท/แท่ง · แท่ง train ≥ ${RUNNER_RULE.minBars.toLocaleString()} — นิยามเดียวกับ exp-th-scalp.md)`);
  W();
  W('**นิยามของแต่ละระดับเพดาน**');
  W();
  W('```');
  W('  เข้าไม้ที่ราคาเปิดของแท่ง t · สัญญาณ "เห็น" ได้ถึงแค่แท่ง t-1 (เหมือน lab.mjs ทุกประการ)');
  W('  หน้าต่างถือ H แท่ง = แท่ง t .. t+H-1');
  W();
  W('  (ก) รู้อนาคตสมบูรณ์  = max[ (สูงสุดของ high − เปิด)/เปิด , (เปิด − ต่ำสุดของ low)/เปิด ]');
  W('  (ข) รู้ทิศอย่างเดียว  = เลือกทิศจาก sign(ปิดแท่งสุดท้าย − เปิด) แล้วออกตาม SL 1.5×ATR / TP 3×ATR');
  W('  (ค) แม่น p           = p·E[ทิศถูก] + (1−p)·E[ทิศผิด]   ← ผิดแบบสุ่ม ไม่สัมพันธ์กับขนาดการเคลื่อนไหว');
  W();
  W('  ความแม่นคุ้มทุน p*   = (ค่าธรรมเนียม − E[ทิศผิด]) ÷ (E[ทิศถูก] − E[ทิศผิด])');
  W('```');
  W();
  W('**ค่าธรรมเนียมที่ใช้** — หุ้นไทยใช้ค่าคอม 0.157%/ขา (ขั้นต่ำ 50 บาท) + สเปรด 1 tick ตามตารางช่วงราคา SET');
  W(`คิดที่เงินเสี่ยง ${TH_RISK_BAHT.toLocaleString()} บาท/ไม้ · ตลาดอื่นใช้ตาราง bps ของ lab.mjs`);
  W('(GOLD 5 · FOREX 1.5 · US_STOCK 5 · CRYPTO 25 พร้อม override รายตัว) — **ไม่ใช้ 40 bps ของหุ้นไทย**');
  W();
  let totFlat = 0; let totN = 0; let totSpill = 0;
  for (const [k, v] of cellStats) { if (k.includes('ENG')) continue; totFlat += v.flat; totN += v.n; totSpill += v.spill; }
  W('**แท่งที่ตัดออก** — แท่งที่ราคาปิดท้ายหน้าต่างเท่ากับราคาเข้าพอดี (ทิศไม่นิยาม) ถูกตัดทิ้ง');
  W(`ตัดไป ${totFlat.toLocaleString()} จาก ${(totFlat + totN).toLocaleString()} = **${pctS(totFlat / (totFlat + totN), 2)}**`);
  W('การตัดนี้เข้าข้างเจ้าของ เพราะแท่งพวกนั้นให้ผลราว −ค่าธรรมเนียม ถ้านับเข้าไปเพดานจะต่ำลงอีก');
  W();
  if (OPT.keepSpill) {
    W(`⚠ **โหมด --keep-spill (ก่อนแก้)**: ไม้ที่หน้าต่างล้ำเข้า split ถัดไป ${totSpill.toLocaleString()} `
      + `จาก ${totN.toLocaleString()} = ${pctS(totSpill / totN, 3)} **ยังถูกนับรวมในผล**`);
    W('โหมดนี้อ่านแท่งของ split ถัดไป (สำหรับ validation แปลว่าอ่านแท่งของชุด test)');
    W('มีไว้เทียบ "ก่อน/หลัง" เท่านั้น ห้ามอ้างอิงตัวเลขจากโหมดนี้');
  } else {
    W(`**ไม้ที่หน้าต่างถือล้ำข้ามเส้นแบ่ง split — ถูกทิ้งทั้งหมด** ${totSpill.toLocaleString()} ไม้ `
      + `(เทียบกับ ${totN.toLocaleString()} ไม้ที่เก็บไว้ = ${pctS(totSpill / (totSpill + totN), 3)} ของผู้เข้าชิง)`);
    W();
    W('ของเดิม *นับ* ไม้พวกนี้ไว้แต่ยัง *รวมในผล* อยู่ ซึ่งแปลว่าค่าของช่อง train ถูกคิดจาก');
    W('แท่งของ validation และค่าของช่อง validation ถูกคิดจากแท่งของ **ชุด test** — ผิดกติกาข้อ 1');
    W('รอบนี้ oracle มองไม่เกินแท่งสุดท้ายของ split ตัวเองแล้ว ไม้ที่เดินไม่ครบ H แท่งจึงถูกทิ้ง');
    W('ไม่ใช่ถูกตัดหน้าต่างให้สั้นลง (ไม้ที่ปิดก่อนกำหนดไม่ใช่ไม้ H แท่ง เอามาเฉลี่ยรวมกันไม่ได้)');
    W();
    W('**ตัวเลขก่อน/หลังของทุกช่องที่เปลี่ยน** อยู่ใน `scripts/research/report/leak-fix-before-after.json`');
    W('(สร้างจากไบนารีตัวเดียวกัน โดยใช้ `--keep-spill` เป็นโหมด "ก่อน" ซึ่งพิสูจน์แล้วว่าให้ผล');
    W('ตรงกับไฟล์ที่ส่งมอบรอบก่อนครบทั้ง 192 ช่อง)');
    W();
    W('การพิสูจน์ที่ยอมรับได้จริงคือการตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ ซึ่งรันแล้ว:');
    W('ลบแท่งชุด test ออกจากคลังจริง 225,523 แท่ง แล้วคำนวณใหม่');
    W('· โค้ดเดิม: **138 จาก 192 ช่องเปลี่ยนค่า** = ตัวเลขเคยขึ้นกับแท่งที่ห้ามแตะ');
    W('· โค้ดที่แก้แล้ว: **0 จาก 192 ช่อง** = ผลไม่ขึ้นกับชุด test อีกต่อไป');
  }
  W();

  // ══════════════ C3 · ตารางเพดานเต็ม ══════════════
  W('---');
  W();
  W('# C3 · ★ เพดานสามระดับ ต่อกลุ่ม × กรอบเวลา × หน้าต่างถือ');
  W();
  W('หน่วยทุกช่องเป็น **bps ต่อไม้** (1 bps = 0.01% ของมูลค่าสถานะ) · วัดบน **train**');
  W('"สุทธิ" = หลังหักค่าธรรมเนียมจริงแล้ว');
  W();
  for (const tf of TIMEFRAMES) {
    W(`## กรอบเวลา ${tf}`);
    W();
    W('| กลุ่ม | ถือ | ไม้ | ค่าธรรมเนียม | (ก) รู้อนาคต | (ก) สุทธิ | (ข) รู้ทิศ | (ข) สุทธิ | (ข2) รู้ฝั่งที่จ่าย สุทธิ | (ค) 60% สุทธิ | (ค) 55% สุทธิ |');
    W('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const g of GROUPS) {
      for (const H of HORIZONS) {
        const c = get('train', g, tf, H);
        if (!c) continue;
        W(`| ${GROUP_LABEL[g]} | ${H} | ${c.n.toLocaleString()} | ${bps(c.fee.mean)} | ${bps(c.perfect.mean)} | ${bps(c.perfectNet.mean)} | ${bps(c.correct.mean)} | **${bps(c.dirNet.mean)}** | ${bps(c.bestNet.mean)} | ${bps(c.net60.mean)} | ${bps(c.net55.mean)} |`);
      }
    }
    W();
  }
  W('คอลัมน์ **(ข2)** คือเพดานที่สูงกว่า (ข): ทายถูกว่า "ฝั่งไหนจ่ายมากกว่า" ใต้เรขาคณิตเดียวกัน');
  W('ซึ่งเป็นสิ่งที่ระบบเทรดต้องการจริง ๆ ไม่ใช่การทายว่าราคาไปจบตรงไหน — ตัวนี้คือขอบบนแท้จริง');
  W('ของคำว่า "ทำนายทิศ" ใต้ SL 1.5×ATR / TP 3×ATR');
  W();
  W('อ่านตารางนี้อย่างไร: คอลัมน์ "(ข) สุทธิ" คือคำตอบของคำถาม');
  W('**"ถ้ามี feature ที่ทำนายทิศได้ถูก 100% จะได้เงินไหม"** — ติดลบเมื่อไร แปลว่าตลาดนั้น');
  W('ที่หน้าต่างถือนั้น ปิดประตูตายด้วยค่าธรรมเนียม ไม่ว่าจะหา feature เก่งแค่ไหน');
  W();

  // ══════════════ C4 · ตาราง breakeven ══════════════
  W('---');
  W();
  W('# C4 · ★★ ตารางที่ตัดสินใจได้: ต้องเดาทิศถูกกี่ % ถึงจะคุ้ม');
  W();
  W('p* = ความแม่นทิศที่ทำให้เสมอตัวพอดี · เทียบกับความแม่นที่เครื่องยนต์ปัจจุบันทำได้จริง');
  W('(ความแม่นของเครื่องยนต์วัดจากไม้จริงที่ lab.mjs ออกด้วย config ปัจจุบัน เทียบกับทิศจริงที่หน้าต่างเดียวกัน)');
  W();
  for (const tf of TIMEFRAMES) {
    W(`## กรอบเวลา ${tf}`);
    W();
    W('| กลุ่ม | ถือ | p_fair (ไม่มีค่าธรรมเนียม) | p* คุ้มทุน | ภาษีความแม่นที่ค่าธรรมเนียมเก็บ | CI95 ของ p* | p* บนแท่งที่ระบบเข้าจริง | ระบบปัจจุบันแม่น | ไม้ของระบบ | ช่องว่างที่ต้องปีน | สถานะ |');
    W('|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|');
    for (const g of GROUPS) {
      for (const H of HORIZONS) {
        const c = get('train', g, tf, H);
        if (!c) continue;
        const e = get('trainENG', g, tf, H);
        const ea = engineAcc.get(`train|${g}|${tf}|${H}`);
        const actual = ea && ea.n > 0 ? ea.hit / ea.n : NaN;
        const ciTxt = c.ci ? `[${c.ci.pStar[0] > 3 ? '>300%' : pctS(c.ci.pStar[0])}, ${c.ci.pStar[1] > 3 ? '>300%' : pctS(c.ci.pStar[1])}]` : '—';
        const ref = e ? e.pStar : c.pStar;   // เทียบบนกลุ่มตัวอย่างเดียวกับที่วัดความแม่น
        const status = ref > 1 ? '**ปิดตาย**' : (ref > 0.9 ? 'แทบปิด' : (ref > 0.75 ? 'ยากมาก' : 'พอมีช่อง'));
        const gap = Number.isFinite(actual) ? ref - actual : NaN;
        W(`| ${GROUP_LABEL[g]} | ${H} | ${pctS(c.pFair)} | ${c.pStar > 3 ? '>300%' : pctS(c.pStar)} | +${pctS(c.pStar - c.pFair)} | ${ciTxt} | ${e ? (e.pStar > 3 ? '>300%' : pctS(e.pStar)) : '—'} | ${pctS(actual)} | ${ea ? ea.n.toLocaleString() : '—'} | ${Number.isFinite(gap) ? `${gap > 0 ? '+' : ''}${pctS(gap)}` : '—'} | ${status} |`);
      }
    }
    W();
  }
  W('**อ่านคอลัมน์อย่างไร**');
  W();
  W('· `p_fair` = ความแม่นที่ต้องมีถ้าค่าธรรมเนียมเป็นศูนย์ — มาจากความไม่สมมาตรของเรขาคณิตล้วน ๆ');
  W('· `ภาษีความแม่น` = p* − p_fair = ความแม่นที่ต้อง "เพิ่มขึ้น" เพียงเพื่อจ่ายค่าธรรมเนียม');
  W('  ตัวนี้เทียบข้ามตลาดได้ตรงที่สุด เพราะตัดผลของเรขาคณิตออกไปแล้ว');
  W('· `p* บนแท่งที่ระบบเข้าจริง` = p* ที่คำนวณเฉพาะแท่งที่เครื่องยนต์ปัจจุบันออกไม้');
  W('  ต้องใช้ตัวนี้เทียบกับความแม่นของระบบ ไม่ใช่ p* ของทุกแท่ง — เพราะสองอย่างนั้นวัดคนละกลุ่มตัวอย่าง');
  W('· `ช่องว่างที่ต้องปีน` คิดจาก p* บนแท่งที่ระบบเข้าจริง ลบด้วยความแม่นที่ระบบทำได้');
  W();
  W('**p* > 100% หมายความว่าอะไร** — หมายความว่าถึงจะทำนายทิศถูกทุกไม้ ค่าธรรมเนียมก็ยังกินเกิน');
  W('กำไรที่การเคลื่อนไหวของราคามีให้ ตลาดนั้นที่หน้าต่างถือนั้น **ไม่มีทางทำเงินได้** ด้วยเรขาคณิตนี้');
  W('ไม่ว่าจะหา feature เก่งแค่ไหน — และนั่นแปลว่าไม่ต้องเสียเวลาหา');
  W();

  // ── C4b: วัดสมมติฐาน "ผิดแบบสุ่ม" แทนที่จะสมมติเอา ──
  W('---');
  W();
  W('# C4b · ความแม่นอย่างเดียวอธิบายได้แค่ไหน — วัด ไม่ใช่สมมติ');
  W();
  W('สูตร E(p) = p·E[ทิศถูก] + (1−p)·E[ทิศผิด] ตั้งอยู่บนสมมติฐานว่า "เวลาทายผิด มันผิดแบบสุ่ม"');
  W('ถ้าสมมติฐานนี้จริง เอาความแม่นจริงของเครื่องยนต์ใส่สูตร ต้องได้ผลเท่ากับผลจริง');
  W('ตารางนี้เอาทิศที่เครื่องยนต์เลือกเอง ไปวิ่งใต้เรขาคณิตเดียวกันบนแท่งเดียวกัน แล้วเทียบ');
  W();
  W('| กลุ่ม | กรอบเวลา | ถือ | ความแม่นจริง | ทำนายจากความแม่น (bps สุทธิ) | วัดจริง (bps สุทธิ) | ส่วนต่าง | p ของวัดจริง |');
  W('|---|---|---:|---:|---:|---:|---:|---:|');
  let worseCount = 0; let totalCmp = 0; let sumDiff = 0;
  for (const tf of TIMEFRAMES) {
    for (const g of GROUPS) {
      for (const H of HORIZONS) {
        const e = get('trainENG', g, tf, H);
        const ea = engineAcc.get(`train|${g}|${tf}|${H}`);
        if (!e || !ea || !ea.n) continue;
        const p = ea.hit / ea.n;
        const predicted = p * e.correct.mean + (1 - p) * e.wrong.mean - e.fee.mean;
        const measured = e.engNet.mean;
        const diff = measured - predicted;
        totalCmp++; sumDiff += diff;
        if (diff < 0) worseCount++;
        W(`| ${GROUP_LABEL[g]} | ${tf} | ${H} | ${pctS(p)} | ${bps(predicted)} | **${bps(measured)}** | ${diff > 0 ? '+' : ''}${bps(diff)} | ${pS(e.engNet.p)} |`);
      }
    }
  }
  W();
  W(`ช่องที่เทียบได้ ${totalCmp} ช่อง · ช่องที่ "ของจริงแย่กว่าที่ความแม่นทำนาย" = **${worseCount}** ช่อง`);
  W(`· ส่วนต่างเฉลี่ย ${sumDiff / Math.max(totalCmp, 1) > 0 ? '+' : ''}${bps(sumDiff / Math.max(totalCmp, 1))} bps/ไม้`);
  W();
  W('**นี่คือข้อจำกัดที่สำคัญที่สุดของทั้งรายงาน** ถ้าส่วนต่างส่วนใหญ่ติดลบ แปลว่าเครื่องยนต์');
  W('ไม่ได้ผิดแบบสุ่ม — มันผิดตอนที่ราคาวิ่งแรง และถูกตอนที่ราคานิ่ง ซึ่งเป็นการผิดแบบที่');
  W('แพงที่สุด และแปลว่า "ไล่ตามความแม่น" อย่างเดียวยังไม่พอ ต้องได้ขนาดของการเคลื่อนไหวด้วย');
  W();

  // ══════════════ C5 · validation ══════════════
  W('---');
  W();
  W('# C5 · ยืนยันบน validation');
  W();
  W('ตัวเลขข้างบนวัดบน train ทั้งหมด · ตารางนี้วัดซ้ำบน validation ซึ่งไม่ได้ถูกใช้เลือกอะไรเลย');
  W('ถ้าข้อสรุปพลิกระหว่างสองชุด แปลว่าไม่ควรเชื่อ');
  W();
  W('| กลุ่ม | กรอบเวลา | ถือ | p* (train) | p* (validation) | (ข) สุทธิ train | (ข) สุทธิ validation | ข้อสรุปตรงกัน |');
  W('|---|---|---:|---:|---:|---:|---:|---|');
  let flips = 0; let compared = 0;
  for (const tf of TIMEFRAMES) {
    for (const g of GROUPS) {
      for (const H of HORIZONS) {
        const a = get('train', g, tf, H); const b = get('validation', g, tf, H);
        if (!a || !b) continue;
        compared++;
        const same = (a.dirNet.mean > 0) === (b.dirNet.mean > 0);
        if (!same) flips++;
        W(`| ${GROUP_LABEL[g]} | ${tf} | ${H} | ${a.pStar > 3 ? '>300%' : pctS(a.pStar)} | ${b.pStar > 3 ? '>300%' : pctS(b.pStar)} | ${bps(a.dirNet.mean)} | ${bps(b.dirNet.mean)} | ${same ? 'ตรงกัน' : '**พลิก**'} |`);
      }
    }
  }
  W();
  W(`ช่องที่เทียบได้ ${compared} ช่อง · ข้อสรุป "รู้ทิศ 100% แล้วเป็นบวกไหม" พลิกระหว่าง train กับ validation **${flips} ช่อง**`);
  W();

  // ══════════════ C6 · ควรโฟกัสตลาดไหน ══════════════
  W('---');
  W();
  W('# C6 · ตลาดไหนควรโฟกัส — เรียงตามระยะห่างจากเพดาน');
  W();
  W('เกณฑ์การเรียงคือ "ช่องว่างที่ต้องปีน" = p* − ความแม่นที่ระบบทำได้ตอนนี้');
  W('ไม่ใช่ตามที่เจ้าของชอบ ไม่ใช่ตามขนาดกำไรดิบ');
  W();
  const ranked = [];
  for (const tf of TIMEFRAMES) {
    for (const g of GROUPS) {
      for (const H of HORIZONS) {
        const c = get('train', g, tf, H); const v = get('validation', g, tf, H);
        const e = get('trainENG', g, tf, H); const ev = get('validationENG', g, tf, H);
        if (!c || !v || !e) continue;
        const ea = engineAcc.get(`train|${g}|${tf}|${H}`);
        const actual = ea && ea.n > 0 ? ea.hit / ea.n : NaN;
        if (!Number.isFinite(actual)) continue;
        ranked.push({ c, v, e, ev, actual, gap: e.pStar - actual });
      }
    }
  }
  ranked.sort((a, b) => a.gap - b.gap);
  W('| อันดับ | กลุ่ม | กรอบเวลา | ถือ | p* train | p* validation | ระบบทำได้ | ช่องว่าง | (ค) 60% สุทธิ train | (ค) 60% สุทธิ validation |');
  W('|---:|---|---|---:|---:|---:|---:|---:|---:|---:|');
  ranked.slice(0, 14).forEach((r, k) => {
    W(`| ${k + 1} | ${GROUP_LABEL[r.c.group]} | ${r.c.tf} | ${r.c.H} | ${r.e.pStar > 3 ? '>300%' : pctS(r.e.pStar)} | ${r.ev ? (r.ev.pStar > 3 ? '>300%' : pctS(r.ev.pStar)) : '—'} | ${pctS(r.actual)} | ${r.gap > 0 ? '+' : ''}${pctS(r.gap)} | ${bps(r.c.net60.mean)} | ${bps(r.v.net60.mean)} |`);
  });
  W();
  // ── ตารางเดียวที่เทียบข้ามตลาดได้ตรงที่สุด: ค่าธรรมเนียมเรียกความแม่นเพิ่มกี่จุด ──
  W('## ภาษีความแม่น — ตัวเลขเดียวที่เทียบข้ามตลาดได้ตรง ๆ');
  W();
  W('p* − p_fair = ความแม่นทิศที่ต้องมี "เพิ่มขึ้น" เพียงเพื่อจ่ายค่าธรรมเนียม');
  W('ตัดผลของเรขาคณิตออกแล้ว เหลือแต่ราคาของการเข้า-ออกตลาดนั้นล้วน ๆ');
  W();
  W('| กลุ่ม | 1D ถือ 1 | 1D ถือ 5 | 1D ถือ 10 | 1D ถือ 20 | 1H ถือ 1 | 1H ถือ 5 | 1H ถือ 10 | 1H ถือ 20 |');
  W('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  const taxRank = [];
  for (const g of GROUPS) {
    const cells = [];
    let bestTax = Infinity;
    for (const tf of TIMEFRAMES) {
      for (const H of HORIZONS) {
        const c = get('train', g, tf, H);
        if (!c) { cells.push('—'); continue; }
        const tax = c.pStar - c.pFair;
        bestTax = Math.min(bestTax, tax);
        cells.push(`+${pctS(tax)}`);
      }
    }
    taxRank.push({ g, bestTax });
    W(`| ${GROUP_LABEL[g]} | ${cells.join(' | ')} |`);
  }
  W();
  taxRank.sort((a, b) => a.bestTax - b.bestTax);
  W('เรียงจากถูกที่สุดไปแพงที่สุด (ใช้ช่องที่ถูกที่สุดของแต่ละกลุ่ม):');
  W(taxRank.map((r, k) => `${k + 1}. **${GROUP_LABEL[r.g]}** +${pctS(r.bestTax)}`).join(' · '));
  W();
  const cheapest = taxRank[0]; const dearest = taxRank[taxRank.length - 1];
  W(`ช่วงห่างระหว่างตลาดที่ถูกที่สุด (${GROUP_LABEL[cheapest.g]}) กับแพงที่สุด (${GROUP_LABEL[dearest.g]}) `
    + `= **${(dearest.bestTax / cheapest.bestTax).toFixed(1)} เท่า**`);
  W();

  const deadGroups = GROUPS.filter((g) => {
    let anyOpen = false;
    for (const tf of TIMEFRAMES) for (const H of HORIZONS) {
      const c = get('train', g, tf, H); const v = get('validation', g, tf, H);
      if (c && v && c.pStar <= 1 && v.pStar <= 1) anyOpen = true;
    }
    return !anyOpen;
  });
  W('**กลุ่มที่ปิดประตูตายทุกช่อง** (แม้รู้ทิศ 100% ก็ยังขาดทุน ทั้งบน train และ validation):');
  W(deadGroups.length ? deadGroups.map((g) => `· **${GROUP_LABEL[g]}** — ไม่ต้องหา feature ต่อ`).join('\n') : '· ไม่มี');
  W();
  // ── ช่องที่ปิดตายรายช่อง (ไม่ใช่รายกลุ่ม) — ตัวนี้ใช้ตัดงานรอบหน้าได้ทันที ──
  const deadCells = [];
  for (const tf of TIMEFRAMES) for (const g of GROUPS) for (const H of HORIZONS) {
    const c = get('train', g, tf, H); const v = get('validation', g, tf, H);
    if (c && v && (c.pStar > 1 || v.pStar > 1)) {
      const both = c.pStar > 1 && v.pStar > 1;
      deadCells.push(`${GROUP_LABEL[g]} ${tf} ถือ ${H} (train ${pctS(c.pStar)} · validation ${pctS(v.pStar)})`
        + ` — ${both ? '**ปิดตายทั้งสองชุด** ไม่มีทางคุ้ม' : 'ปิดตายชุดเดียว = ไม่เสถียร ห้ามพึ่งพา'}`);
    }
  }
  W('**ช่องที่ปิดตาย** (p* > 100% บน train หรือ validation) — ห้ามเสียเวลาหา feature ให้ช่องพวกนี้:');
  W(deadCells.length ? deadCells.map((s) => `· ${s}`).join('\n') : '· ไม่มี');
  W();

  // ══════════════ C7 · บัญชีการเปรียบเทียบ ══════════════
  W('---');
  W();
  W('# C7 · บัญชีการเปรียบเทียบทั้งหมด + การแก้ค่า p (Holm)');
  W();
  W(`ลงทะเบียนการทดสอบทั้งหมด **${TESTS.length}** ข้อ — ทุกข้อที่ "ถาม" ถูกนับ ไม่ใช่เฉพาะข้อที่ได้ผลบวก`);
  W('แบ่งเป็นสองตระกูล (train = สำรวจ · validation = ยืนยัน) แล้วแก้ค่า p ด้วย Holm ภายในตระกูล');
  W();
  const fams = [...new Set(TESTS.map((t) => t.family))];
  for (const fam of fams) {
    const list = TESTS.filter((t) => t.family === fam);
    const passed = list.filter((t) => t.holmPass);
    W(`**${fam}** — ${list.length} ข้อ · ผ่าน Holm ${passed.length} ข้อ · ไม่ผ่าน ${list.length - passed.length} ข้อ`);
    W();
    W('| # | คำถาม | ค่าที่วัดได้ (bps) | CI95 | p | เกณฑ์ Holm | ผล |');
    W('|---:|---|---:|---|---:|---:|---|');
    for (const t of [...list].sort((a, b) => a.p - b.p)) {
      W(`| ${t.idx} | ${t.question} | ${bps(t.estimate)} | [${bps(t.ci[0])}, ${bps(t.ci[1])}] | ${pS(t.p)} | ${Number.isFinite(t.holmThreshold) ? t.holmThreshold.toExponential(1) : '—'} | ${t.holmPass ? '**ผ่าน**' : 'ไม่ผ่าน'} |`);
    }
    W();
    const posPassed = passed.filter((t) => t.estimate > 0);
    W(`ในจำนวนที่ผ่าน Holm มี **${posPassed.length}** ข้อที่ค่าเป็นบวก และ ${passed.length - posPassed.length} ข้อที่ค่าเป็นลบ`);
    W('⚠ "ผ่าน Holm และเป็นบวก" ในตารางนี้ **ไม่ได้แปลว่าเจอเงิน** — มันแปลว่า "เพดานอยู่เหนือ');
    W('ค่าธรรมเนียมอย่างมีนัยสำคัญ" คือมีที่ว่างให้เล่นจริง ส่วนจะเก็บได้ไหมขึ้นกับว่าหา feature เจอหรือเปล่า');
    W('ส่วนข้อที่ "ผ่านและเป็นลบ" คือยืนยันว่าช่องนั้นขาดทุนจริง ไม่ใช่ความบังเอิญ — ตัดทิ้งได้เลย');
    W();
  }
  W('ตัวเลขดิบทุกช่อง (รวมช่องที่ไม่ได้ขึ้นตาราง) อยู่ใน `report/exp-ceiling.json` คีย์ `cells` และ `tests`');
  W();

  // ══════════════ สิ่งที่งานรอบต่อไปควรทำ / ไม่ควรทำ ══════════════
  W('---');
  W();
  W('# สิ่งที่งานรอบต่อไปควรทำ และไม่ควรทำ (อ่านจากตัวเลขข้างบนเท่านั้น)');
  W();
  W('**ทำ**');
  W();
  const doList = ranked.filter((r) => r.gap < 0.10).slice(0, 6);
  for (const r of doList) {
    const head = `· **${GROUP_LABEL[r.c.group]} ${r.c.tf} หน้าต่างถือ ${r.c.H} แท่ง** — `;
    if (r.gap <= 0) {
      W(`${head}ความแม่นถึงเส้นคุ้มทุนแล้ว (${pctS(r.actual)} เทียบ p* ${pctS(r.e.pStar)}) `
        + `แต่ผลจริงอยู่ที่ ${bps(r.e.engNet.mean)} bps/ไม้ (p=${pS(r.e.engNet.p)}) — `
        + 'ปัญหาไม่ใช่ความแม่น แต่เป็น "ตอนถูกได้น้อย ตอนผิดเสียมาก" (ดู C4b) '
        + `· ถ้าดันความแม่นถึง 60% ได้จะเหลือสุทธิ ${bps(r.c.net60.mean)} bps/ไม้ (validation ${bps(r.v.net60.mean)})`);
    } else {
      W(`${head}ต้องยกความแม่นทิศจาก ${pctS(r.actual)} ไปถึง ${pctS(r.e.pStar)} (+${pctS(r.gap)}) `
        + `· ถ้าไปถึง 60% ได้จะเหลือสุทธิ ${bps(r.c.net60.mean)} bps/ไม้ (validation ${bps(r.v.net60.mean)})`);
    }
  }
  W();
  // ── เจ้าของเลือกไม่ย้ายตลาด — จึงต้องมีคำแนะนำที่ใช้ได้ "ภายในหุ้นไทย" ด้วย ──
  W('**ถ้ายืนยันจะอยู่กับหุ้นไทย (ซึ่งเป็นทางที่เจ้าของเลือกเอง)**');
  W();
  const thRows = ranked.filter((r) => r.c.group === 'RUNNER' || r.c.group === 'SET50');
  const thBest = thRows.slice(0, 3);
  const th1H = thRows.filter((r) => r.c.tf === '1H');
  W('สามช่องที่ใกล้เพดานที่สุดภายในหุ้นไทย (เรียงจากใกล้ไปไกล):');
  thBest.forEach((r, k) => {
    W(`${k + 1}. **${GROUP_LABEL[r.c.group]} ${r.c.tf} ถือ ${r.c.H} แท่ง** — `
      + `p* ${pctS(r.e.pStar)} · ระบบทำได้ ${pctS(r.actual)} · ต้องปีน +${pctS(r.gap)} `
      + `· ที่ความแม่น 60% จะเหลือสุทธิ ${bps(r.c.net60.mean)} bps/ไม้ (validation ${bps(r.v.net60.mean)})`);
  });
  if (th1H.length) {
    const worstGap = Math.max(...th1H.map((r) => r.gap));
    const bestGap = Math.min(...th1H.map((r) => r.gap));
    W(`· **เลิกเล่นหุ้นไทยกรอบ 1 ชั่วโมงได้เลย** — ทุกช่อง 1H ของหุ้นไทยต้องปีน `
      + `+${pctS(bestGap)} ถึง +${pctS(worstGap)} ซึ่งแย่กว่าช่อง 1D ทุกช่อง`);
  }
  W('· เหตุผลเชิงกลไกอยู่ในตาราง "ภาษีความแม่น": หุ้นไทยจ่ายภาษีความแม่นสูงกว่าตลาดอื่น');
  W('  หลายเท่า และภาษีนั้นลดได้ทางเดียวคือ **ถือนานขึ้น** (ให้การเคลื่อนไหวโตกว่าค่าธรรมเนียม)');
  W('  ไม่ใช่การหา feature ที่เก่งขึ้น — ค่าธรรมเนียมไม่สนใจว่า feature เก่งแค่ไหน');
  W();
  W('**ไม่ทำ**');
  W();
  for (const s of deadCells) W(`· ${s}`);
  const hardCells = ranked.filter((r) => r.gap >= 0.20)
    .sort((a, b) => b.gap - a.gap).slice(0, 6);
  for (const r of hardCells) {
    W(`· ${GROUP_LABEL[r.c.group]} ${r.c.tf} หน้าต่างถือ ${r.c.H} — ต้องยกความแม่น +${pctS(r.gap)} `
      + 'ซึ่งไม่มีงานวิจัยตลาดใดเคยแสดงว่าทำได้ด้วย feature เชิงเทคนิคล้วน');
  }
  W();
  W('**เส้นแบ่งความเป็นความตายของทั้งโครงการอยู่ระหว่างความแม่น 55% กับ 60%** —');
  W('ดูคอลัมน์ "(ค) 60% สุทธิ" กับ "(ค) 55% สุทธิ" ในตาราง C3: หลายช่องพลิกจากบวกเป็นลบ');
  W('ในช่วง 5 จุดนั้น แปลว่าเป้าหมายของงานหา feature ต้องตั้งที่ "60% ขึ้นไป" ไม่ใช่ "ดีขึ้นหน่อย"');
  W();

  // ══════════════ ข้อจำกัด ══════════════
  W('---');
  W();
  W('# ข้อจำกัดที่ต้องรู้ก่อนเชื่อตัวเลขข้างบน');
  W();
  W('1. **เพดาน (ข) และ (ค) ผูกกับเรขาคณิต SL 1.5×ATR / TP 3×ATR** ซึ่งเป็นของเครื่องยนต์ปัจจุบัน');
  W('   exp-th-scalp.md กวาด 72 ช่องแล้วพบว่าไม่มีเรขาคณิตใดพลิกผลได้ แต่การกวาดนั้นทำบน 1H');
  W('   ของหุ้นไทย/ทอง/ค่าเงินเท่านั้น — เพดานของกลุ่มอื่นที่เรขาคณิตอื่นยังไม่ถูกกวาด');
  W('   เพดาน (ก) ไม่ผูกกับเรขาคณิตใดเลย จึงเป็นตัวที่ทนต่อข้อจำกัดนี้ที่สุด');
  W();
  W('2. **(ค) สมมติว่าการทายผิดเกิดแบบสุ่ม** ไม่สัมพันธ์กับขนาดการเคลื่อนไหว ระบบจริงอาจ');
  W('   ผิดบ่อยกว่าตอนราคาวิ่งแรง (แย่กว่าที่คำนวณ) หรือผิดเฉพาะตอนราคานิ่ง (ดีกว่า)');
  W('   ตัวเลขนี้จึงเป็นค่ากลาง ไม่ใช่ขอบบนของระดับ (ค)');
  W();
  W('3. **เพดาน (ก) ถือว่าออกได้ที่ราคาสูงสุด/ต่ำสุดของหน้าต่างพอดี** ซึ่งในโลกจริงต้องมีคน');
  W('   ยอมซื้อ/ขายที่ราคานั้นในปริมาณที่ต้องการ — เป็นไปไม่ได้จริง และนั่นคือความตั้งใจ');
  W();
  W('4. **ค่าธรรมเนียมหุ้นไทยคิดที่สเปรด 1 tick** ซึ่งเป็นพื้นตามกติกาตลาด หุ้นสภาพคล่องต่ำ');
  W('   กว้างกว่านั้นเสมอ · ตาราง cost-mechanics-set-table.json ใช้ 2 tick ซึ่งแพงกว่า');
  W('   เราเลือกตัวที่ถูกกว่าเพื่อให้ข้อสรุป "ปิดตาย" แข็งแรงที่สุด');
  W();
  W('5. **ไม้ที่หน้าต่างถือล้ำข้ามเส้นแบ่ง split ถูกทิ้งทั้งหมด** (แก้ในรอบซ่อมเครื่องมือ)');
  W('   ผลคือปลายของแต่ละ split มีตัวอย่างบางลงตามระยะถือ — ยิ่งถือนานยิ่งทิ้งเยอะ');
  W('   จำนวนที่ทิ้งต่อช่องบันทึกไว้ใน exp-ceiling.json คีย์ `spill`');
  W();
  W('6. **การเทียบ p* กับความแม่นของระบบ เป็นเงื่อนไขจำเป็น ไม่ใช่เงื่อนไขเพียงพอ** —');
  W('   C4b วัดแล้วว่าเมื่อความแม่นผ่านเส้น ผลจริงยังติดลบได้ เพราะขนาดของการเคลื่อนไหว');
  W('   ตอนถูกกับตอนผิดไม่เท่ากัน · ผ่าน p* จึงเป็นแค่ "ด่านแรก" ไม่ใช่เส้นชัย');
  W();
  W('7. **ตารางจัดอันดับตลาดเป็นเลขคณิตของค่าธรรมเนียมกับเพดานล้วน ๆ** ไม่ได้คิดเรื่อง');
  W('   การเข้าถึงตลาด ภาษี เวลานอน หรือความถนัดของเจ้าของ — และไม่ใช่คำแนะนำการลงทุน');
  W();
  W('8. **ความแม่นของเครื่องยนต์วัดบนไม้ที่มันออกเอง** ซึ่งเป็นกลุ่มตัวอย่างที่มันเลือกมา');
  W('   ตาราง C4 จึงมีคอลัมน์ "p* บนแท่งที่ระบบเข้าจริง" ไว้เทียบบนกลุ่มเดียวกัน');
  W('   ส่วนคอลัมน์ p* ของทุกแท่ง ใช้ตอบคำถาม "ตลาดนี้มีที่ว่างแค่ไหน" ซึ่งเป็นคนละคำถาม');
  W();
  W('9. **ไม่แตะชุด test เลย** — ทั้งหมดวัดบน train และ validation เท่านั้น');
  W();
  W('---');
  W();
  W(`สร้างโดย \`scripts/research/experiments/ceiling.mjs\` · ${new Date().toISOString()} · ${((Date.now() - t0) / 1000).toFixed(1)} วินาที`);
  W();
  // ที่มา: ผูกรายงานฉบับนี้กับโค้ดและข้อมูลชุดเดียว — ตรวจได้ด้วย npm run check:determinism
  W(`ที่มา: sha สคริปต์ \`${(prov?.scriptSha256 ?? '').slice(0, 12)}\``
    + ` · sha ขาเข้ารวม \`${(prov?.inputsDigest ?? '').slice(0, 12)}\``
    + ` (${prov?.inputs?.length ?? 0} ไฟล์) · node ${prov?.node ?? '—'}`);
  W('ถ้า sha ไม่ตรงกับที่อยู่ใน `exp-ceiling.json` แปลว่ารายงานกับโค้ดคนละรุ่น — อ่านตัวเลขไม่ได้');
  W(`ชุดข้อมูล ${datasets.length} ชุด · bootstrap ${OPT.bootstrap.toLocaleString()} รอบ · seed ${OPT.seed}`);
  W(`ไม้ของระบบปัจจุบันที่จับคู่กับทิศจริงไม่ได้: train ${engineUnmatched.train} · validation ${engineUnmatched.validation}`);
  void thProfiles; void bounds;
}

main().catch((e) => { console.error(e); process.exit(1); });
