#!/usr/bin/env node
/**
 * fx-magnitude.mjs — ปริศนาค่าเงิน: ผ่านเส้นความแม่นแล้ว ทำไมยังไม่ได้เงิน
 *
 * ══════════════════════════════ โจทย์ ══════════════════════════════
 *
 * exp-ceiling วัดไว้ว่า ค่าเงิน 1D หน้าต่างถือ 10 แท่ง เฉพาะแท่งที่เครื่องยนต์เข้าไม้จริง:
 *     ความแม่นคุ้มทุน p* = 51.79%   ·   ความแม่นจริงของเครื่องยนต์ = 52.10%
 * แปลว่า "ผ่านเส้นแล้ว" แต่ผลจริงกลับเป็นลบ (ไม่ต่างจากศูนย์อย่างมีนัยสำคัญ)
 *
 * สมมติฐานที่ ceiling ตั้งไว้แต่ยังไม่มีใครวัดตรง ๆ:
 *     "ระบบไม่ได้ผิดแบบสุ่ม — มันถูกตอนราคานิ่ง และผิดตอนราคาวิ่ง"
 * ถ้าจริง ความแม่นเป็น % ไม่มีความหมาย เพราะไม้ที่ถูกตัวเล็ก ไม้ที่ผิดตัวใหญ่
 *
 * ═════════════════ ทำไม p* ถึงเทียบกับความแม่นดิบไม่ได้ (คณิตศาสตร์) ═════════════════
 *
 * ให้ไม้ที่ i มี  c_i = ผลตอบแทนถ้าเลือกทิศ "ถูก"  ·  w_i = ถ้าเลือกทิศ "ผิด"
 *                f_i = ค่าธรรมเนียม               ·  h_i ∈ {0,1} = เครื่องยนต์ทายถูกไหม
 * ผลจริงของไม้นั้นคือ  o_i = h_i·c_i + (1−h_i)·w_i
 *
 * เขียนใหม่:   o_i = w_i + h_i·s_i        โดย s_i = c_i − w_i  ("ส่วนต่างเดิมพัน" ของไม้นั้น)
 * เฉลี่ยทั้งชุด: E[o] = E[w] + E[s]·p_w   โดย **p_w = Σ h_i·s_i ÷ Σ s_i**
 *
 *     p_w คือ "ความแม่นแบบถ่วงด้วยขนาดเดิมพัน" ไม่ใช่ความแม่นดิบ p̂ = Σh_i/N
 *
 * เงื่อนไขคุ้มทุน E[o] − E[f] ≥ 0 กลายเป็น
 *     p_w  ≥  (E[f] − E[w]) ÷ E[s]  =  p*      ← p* ตัวเดิมเป๊ะ ไม่ได้เปลี่ยนนิยาม
 *
 * **สรุป: p* คือเส้นคุ้มทุนของ p_w ไม่ใช่ของ p̂**
 * การเอา p̂ ไปเทียบกับ p* ถูกต้องก็ต่อเมื่อ h_i เป็นอิสระจาก s_i เท่านั้น
 * ซึ่งเป็นข้อสมมติที่ไม่มีใครเคยตรวจ — และเป็นข้อสมมติเดียวกับที่สมมติฐานข้างบนท้าทาย
 *
 * ช่องว่างจึงแตกออกได้แบบ **เท่ากันเป๊ะ ไม่ใช่ประมาณ**:
 *     ผลจริง            = E[s]·(p_w − p*)
 *     ผลที่ p̂ ทำนายไว้   = E[s]·(p̂  − p*)
 *     ส่วนต่าง           = E[s]·(p_w − p̂)     ← "ภาษีการเลือกขนาด"
 *
 * ไฟล์นี้จึงวัดสามอย่างตามลำดับ ไม่ข้ามขั้น:
 *   ① แยกไม้ตามขนาดการเคลื่อนไหวจริง แล้วดูว่าความแม่นตกตามขนาดไหม  (วินิจฉัย)
 *   ② คำนวณ p_w แล้วเทียบกับ p* และ p̂  (ตัวเลขที่บอกว่าห่างแค่ไหนจริง ๆ)
 *   ③ ถ้าสมมติฐานถูก → หาว่า *อะไรที่มองเห็นได้ ณ เวลาตัดสินใจ* ทำนาย "ขนาด" ได้
 *      แล้วลองใช้จริงสามทาง: คัดไม้ · ปรับขนาดไม้ · (SL/TP ไม่ทำ ดูเหตุผลข้างล่าง)
 *
 * ═══════════════ สองกรอบของคำว่า "ทายถูก" — ต้องแยกให้ขาด ═══════════════
 *
 * กรอบ A "ทายทิศของการเคลื่อนไหวสุทธิ" (กรอบที่ ceiling ใช้ และที่ตั้งโจทย์ไว้)
 *   ทิศจริง = เครื่องหมายของ (ราคาปิดท้ายหน้าต่าง − ราคาเข้า)
 *   c = ผลของทิศนั้นใต้กติกา SL/TP · w = ผลของทิศตรงข้าม
 *   ⚠ s_i = c_i − w_i **ติดลบได้** เมื่อราคาแกว่งไปโดนฝั่งตรงข้ามก่อนแล้วค่อยกลับมาปิดอีกทาง
 *     (long โดน SL แล้วราคาเด้งกลับมาปิดเหนือจุดเข้า → ทายทิศถูกแต่ขาดทุนมากกว่าทายผิด)
 *
 * กรอบ B "ทายว่าฝั่งไหนจ่าย"
 *   ฝั่งจริง = ฝั่งที่ให้ผลตอบแทนสูงกว่าใต้กติกา SL/TP เดียวกัน
 *   c = max(ผลlong, ผลshort) · w = min(...) → s_i ≥ 0 เสมอ น้ำหนักไม่มีทางติดลบ
 *   p* ของกรอบนี้คือ pStarGeom ที่ ceiling รายงานไว้แล้ว
 *
 * ผลจริงต่อไม้ (o_i) **เท่ากันทั้งสองกรอบ** เพราะเป็นผลของทิศที่เครื่องยนต์เลือกเอง
 * ต่างกันแค่ "เอาอะไรมาเรียกว่าถูก" ไฟล์นี้รายงานทั้งสองกรอบทุกที่ เพราะกรอบ A คือ
 * กรอบที่ตั้งโจทย์ไว้ ส่วนกรอบ B คือกรอบที่คณิตศาสตร์ไม่พัง
 *
 * ═══════════════════════ ⚠⚠ ข้อมูลอนาคตอยู่ตรงไหนบ้าง ⚠⚠ ═══════════════════════
 *
 * · ทุกอย่างที่ขึ้นต้นด้วย real* (realMag, realS, ควอนไทล์ของขนาดจริง) **อ่านอนาคต**
 *   ใช้ได้เฉพาะ "แบ่งกลุ่มเพื่อวินิจฉัย" เท่านั้น — ตอบคำถามว่า *อาการ* เป็นแบบไหน
 *   ⛔ ห้ามเอาไปสร้าง feature · ห้ามเอาไปเป็นเงื่อนไขเข้าไม้ · ห้ามเอาไปตั้งเกณฑ์คัดไม้
 *   ทุกฟังก์ชันที่แตะค่าพวกนี้มีคำว่า ORACLE กำกับ ถ้าเห็นชื่อ ORACLE ในเส้นทางที่
 *   นำไปสู่การตัดสินใจเข้าไม้ = บั๊ก
 * · ทุกอย่างที่ขึ้นต้นด้วย cz* (cz = causal) อ่านได้ถึงแค่ "แท่งสัญญาณ" i = t−1 เท่านั้น
 *   ตัวคัดไม้และตัวปรับขนาดไม้ในหัวข้อ ③ ใช้เฉพาะ cz*
 *
 * ═══════════════════════ สิ่งที่ไฟล์นี้จงใจไม่ทำ ═══════════════════════
 *
 * · ปรับ TP/SL ตามขนาดที่คาด — รอบก่อนกวาดไปแล้ว 72 ช่อง ติดลบครบ 72
 *   การเอาตัวทำนายขนาดมาคูณ multiplier เป็นการเดินซ้ำรอยเดิมด้วยชื่อใหม่
 *   สิ่งที่ *ไม่ซ้ำ* คือการปรับ **ขนาดไม้** (เงินที่ลง) ซึ่งไม่เปลี่ยนจุดออก ทำแทน
 * · ถือนานขึ้น (40/60/120/250 แท่ง) — วัดแล้วแย่ลง
 * · หุ้นสหรัฐและคริปโต — อยู่นอกจักรวาลที่เจ้าของเทรด ไม่แตะ
 *   จักรวาลของไฟล์นี้คือ ค่าเงิน (หลัก) · ทอง · หุ้นไทย (สองตัวหลังไว้เทียบ)
 *
 * ════════════════════════════════ วิธีใช้ ════════════════════════════════
 *
 *   node scripts/research/experiments/fx-magnitude.mjs
 *   node scripts/research/experiments/fx-magnitude.mjs --determinism-runs=75   ตรวจตัวเอง
 *   node scripts/research/experiments/fx-magnitude.mjs --cache-dir=<คลังที่ตัดท้ายแล้ว>
 *   node scripts/research/experiments/fx-magnitude.mjs --keep-spill            โหมด "ก่อนแก้"
 *
 * ไฟล์นี้ไม่แตะชุด test ไม่ว่ากรณีใด (ด่านกันอยู่ข้างล่าง)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ROOT } from '../load-src-modules.mjs';
import {
  InputLedger, buildProvenance, sha256File, canonicalJson, stripPaths, deepDiff, runsNeeded,
} from '../repro.mjs';

const IN = new InputLedger();
const SCRIPT_PATH = fileURLToPath(import.meta.url);

const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const WORK_DIR = path.join(REPORT_DIR, 'fx-magnitude');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');
const SPLIT_FILE = path.join(REPORT_DIR, 'split.json');

/**
 * คลังแท่งเทียน — เปลี่ยนได้ด้วย --cache-dir เพื่อรันการพิสูจน์ตามกติกาข้อ 3:
 * ลบแท่งชุดหลังทิ้งจากดิสก์จริง แล้วตัวเลขของชุดก่อนหน้าต้องเท่าเดิม **ทุกบิต**
 */
const DEFAULT_CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const CACHE_DIR = process.argv.find((a) => a.startsWith('--cache-dir='))
  ? path.resolve(process.argv.find((a) => a.startsWith('--cache-dir=')).slice('--cache-dir='.length))
  : DEFAULT_CACHE_DIR;
/**
 * lab.mjs อ่านคลังจากที่อยู่ตายตัวของมันเอง (ไม่มี --cache-dir) จึงต้องแยกให้ชัด
 * ว่า "คลังที่ไฟล์นี้อ่าน" กับ "คลังที่ lab อ่าน" เป็นคนละตัวได้
 *
 * ผลต่อการพิสูจน์เรื่องการล้ำ: รายการ **จุดเข้าไม้** ของเครื่องยนต์มาจากคลังเต็มเสมอ
 * ซึ่งยอมรับได้ เพราะสิ่งที่ไฟล์นี้หยิบจาก lab มีแค่ (สัญลักษณ์ · กรอบเวลา · เวลาเข้า · ทิศ)
 * ทั้งสี่อย่างเป็นผลของเครื่องยนต์ที่ตัดสินใจจากอดีตล้วน ๆ ไม่ได้ใช้แท่งอนาคตเลย
 * ส่วน **จุดออกและผลตอบแทน** ซึ่งเป็นที่เดียวที่แท่งอนาคตเข้ามาเกี่ยว ไฟล์นี้คำนวณเองใหม่ทั้งหมด
 * การพิสูจน์ด้วยการตัดข้อมูลท้ายทิ้งจึงครอบคลุมทุกที่ที่ไฟล์นี้แตะอนาคต
 */
const LAB_CACHE_DIR = DEFAULT_CACHE_DIR;

// ════════════════════════════════ อาร์กิวเมนต์ ════════════════════════════════

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

// ── ด่านกันชุด test ─────────────────────────────────────────────────────────────
if (args.split === 'test' || args['i-am-done-tuning'] || args.confirm) {
  console.error('\n[หยุด] fx-magnitude.mjs ไม่แตะชุด test ไม่ว่ากรณีใด\n');
  process.exit(1);
}

const OPT = {
  bootstrap: Number(args.bootstrap ?? 2000),
  seed: Number(args.seed ?? 20260818),
  alpha: Number(args.alpha ?? 0.05),
  refresh: Boolean(args.refresh),
  /** โหมด "ก่อนแก้": ปล่อยให้หน้าต่างถือล้ำข้ามเส้นแบ่ง split — มีไว้ทำตารางก่อน/หลังเท่านั้น */
  keepSpill: Boolean(args['keep-spill']),
  outDir: args['out-dir'] ? path.resolve(String(args['out-dir'])) : REPORT_DIR,
  /** การรันซ้ำเชิงกล (ตัวตรวจความคงที่) — บันทึกแยกจากการกวาดเชิงวิจัยในสมุด */
  rerunProbe: Boolean(args['rerun-probe']),
  determinismRuns: args['determinism-runs'] ? Number(args['determinism-runs']) : 0,
};

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(OPT.outDir, { recursive: true });

// ════════════════════════════════ ค่าคงที่ของงาน ════════════════════════════════

/**
 * จักรวาลของไฟล์นี้ = จักรวาลที่เจ้าของเทรดจริง
 * ค่าเงินคือตัวเอกของโจทย์ · ทองกับหุ้นไทยใส่ไว้เพื่อตอบว่า "อาการนี้เฉพาะค่าเงินหรือทุกที่"
 */
const MARKETS = ['FOREX', 'GOLD', 'TH_STOCK'];
const PRIMARY_MARKET = 'FOREX';
const PRIMARY_TF = '1D';
const PRIMARY_H = 10;

/** ต้องเป็นชุดนี้เป๊ะ เพราะการเดินหน้าต่างของ ceiling ใช้ hMax = ค่าสุดท้าย — ถ้าต่างจะเทียบไม่ได้ */
const HORIZONS = [1, 5, 10, 20];
const TIMEFRAMES = ['1D', '1H'];
const SPLITS = ['train', 'validation'];

const GEO = { slAtrMult: 1.5, tpAtrMult: 3.0, atrPeriod: 14, atrFallbackPct: 0.02 };
const ROUND = { forexDecimals: 5, otherDecimals: 4, forexPrecision: 5, otherPrecision: 6 };
const MIN_HISTORY = 60;

/** ตาราง bps ของ lab.mjs — ลอกมาทั้งก้อน ไม่แก้ (ต้องตรงกับ ceiling ถึงจะเทียบกันได้) */
const LAB_COST_BPS = {
  byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 },
  bySymbol: {
    XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10,
    EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15,
  },
};

/** โมเดลต้นทุนหุ้นไทย — ลอกจาก ceiling.mjs ทุกตัวเลข */
const SET_TICK_TABLE = [
  { from: 0, to: 2, tick: 0.01 }, { from: 2, to: 5, tick: 0.02 },
  { from: 5, to: 10, tick: 0.05 }, { from: 10, to: 25, tick: 0.10 },
  { from: 25, to: 100, tick: 0.25 }, { from: 100, to: 200, tick: 0.50 },
  { from: 200, to: 400, tick: 1.00 }, { from: 400, to: Infinity, tick: 2.00 },
];
const TH_COMM_RATE = 0.00157;
const TH_MIN_FEE = 50;
const TH_RISK_BAHT = 2000;
const TH_TICKS_PER_ROUND = 1;

/** จำนวนกลุ่มควอนไทล์ที่ใช้ทุกที่ในไฟล์นี้ — 5 กลุ่มคือค่าที่เลือกไว้ก่อนเห็นข้อมูล */
const NQ = 5;

/** วิธีปรับขนาดไม้ + หน่วยของค่าที่วัดได้ (ต้องระบุ ไม่งั้นตารางพิมพ์ผิดหน่วย) */
const SIZE_LABEL = {
  equalNotional: 'เงินเท่ากันทุกไม้',
  equalRisk: 'เสี่ยงเท่ากันทุกไม้ (หน่วย R) — สิ่งที่ lab.mjs ใช้อยู่แล้ว',
  invPredVol: 'น้ำหนัก ∝ 1/ATR% ที่คาด',
  invPredVol2: 'น้ำหนัก ∝ 1/ATR%² ที่คาด',
  propPredVol: 'น้ำหนัก ∝ ATR% ที่คาด',
};
const SIZE_UNIT = {
  equalNotional: 'bps', equalRisk: 'R', invPredVol: 'bps', invPredVol2: 'bps', propPredVol: 'bps',
};

// ═══════════════════════════ เครื่องมือทางสถิติ ═══════════════════════════

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

/** erfc แบบ Numerical Recipes — ลอกจาก ceiling.mjs (ต้องละเอียดพอสำหรับ Holm หลายสิบข้อ) */
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
 * ค่าเฉลี่ยพร้อม SE แบบจับกลุ่ม — กลุ่มคือ (สัญลักษณ์ × เดือน)
 * ไม้ที่อยู่ใกล้กันมีหน้าต่างถือทับกัน ถ้าคิดว่าอิสระ SE จะเล็กเกินจริงหลายเท่า
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

/**
 * อันดับเฉลี่ยแบบจัดการค่าเสมอ (สำหรับ Spearman)
 * ⚠ ตัวเปรียบเทียบต้องตัดสินได้เสมอ: ถ้าค่าเท่ากันให้ใช้ดัชนีเดิมตัดสิน
 *   ไม่งั้นลำดับขึ้นกับอัลกอริทึม sort ของเครื่อง = ผลไม่คงที่ข้ามเครื่อง
 */
function ranksOf(values) {
  const n = values.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => (values[a] - values[b]) || (a - b));
  const r = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[idx[j + 1]] === values[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return r;
}

// ── บัญชีการเปรียบเทียบ ────────────────────────────────────────────────────────
//
// กติกาข้อ 4: นับ *ทุกข้อที่ถาม* ไม่ใช่เฉพาะข้อที่ตอบว่าใช่
const TESTS = [];
/**
 * @param unit หน่วยของ estimate — ต้องระบุเสมอ ไม่งั้นตารางจะพิมพ์ผิดหน่วย
 *             'bps' ผลตอบแทนเป็นสัดส่วน · 'pp' จุดเปอร์เซ็นต์ · 'rho' สหสัมพันธ์ · 'R' หน่วยความเสี่ยง
 *             (รอบแรกของไฟล์นี้เคยพิมพ์ ρ=0.0085 ออกมาเป็น "84.87" เพราะเดาหน่วยจากขนาดตัวเลข)
 */
function registerTest({ id, family, question, estimate, ci, p, note, unit }) {
  TESTS.push({ idx: TESTS.length + 1, id, family, question, estimate, ci, p, note: note ?? '', unit: unit ?? 'bps' });
}
function applyHolm(alpha = OPT.alpha) {
  const byFamily = new Map();
  for (const t of TESTS) {
    if (!byFamily.has(t.family)) byFamily.set(t.family, []);
    byFamily.get(t.family).push(t);
  }
  for (const [, list] of byFamily) {
    // ⚠ ตัวเปรียบเทียบต้องตัดสินได้เสมอ — p เท่ากันให้ใช้ id ตัดสิน (เทียบสตริงตรง ๆ
    //   ไม่ใช้ localeCompare เพราะผลขึ้นกับ locale ของเครื่อง)
    const sorted = [...list].filter((t) => Number.isFinite(t.p))
      .sort((a, b) => (a.p - b.p) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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

/** [CAUSAL] โหลด dataset แล้วตัดตามสัญญาของคลัง เหมือน lab.mjs / ceiling.mjs ทุกประการ */
function loadDataset(file) {
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

/** [CAUSAL] ดัชนีแรกที่ timestamp >= cut */
function lowerBound(times, cut) {
  let lo = 0; let hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < cut) lo = mid + 1; else hi = mid; }
  return lo;
}

const isUsableBar = (c) => (
  Number.isFinite(c.open) && c.open > 0 && Number.isFinite(c.high) && c.high > 0
  && Number.isFinite(c.low) && c.low > 0 && Number.isFinite(c.close) && c.close > 0
  && c.low <= c.high
);

// ═══════════════════════════ ตัวชี้วัดและเรขาคณิต ═══════════════════════════

/** [CAUSAL] ATR ที่ดัชนี i — อ่านเฉพาะ candles[i−period .. i] · สูตรเดียวกับ src/lib/indicators.ts */
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

/** [CAUSAL] ปัดราคาแบบเดียวกับ engine-lab.mjs */
function roundPrice(value, market) {
  if (!Number.isFinite(value)) return value;
  if (value !== 0 && Math.abs(value) < 1) {
    return Number(value.toPrecision(market === 'FOREX' ? ROUND.forexPrecision : ROUND.otherPrecision));
  }
  return Number(value.toFixed(market === 'FOREX' ? ROUND.forexDecimals : ROUND.otherDecimals));
}

/** [CAUSAL] เรขาคณิต SL/TP ของแท่งสัญญาณ i — ลอกลำดับชั้น invariant จาก ceiling.mjs ทั้งหมด */
function geometryAt(candles, i, market) {
  const currentPrice = candles[i].close;
  const atrRaw = atrAt(candles, i);
  const atr = Number.isFinite(atrRaw) && atrRaw > 0 ? atrRaw : currentPrice * GEO.atrFallbackPct;
  const entryOut = roundPrice(currentPrice, market);

  let slL = currentPrice - atr * GEO.slAtrMult;
  let tpL = currentPrice + atr * GEO.tpAtrMult;
  if (!(slL < currentPrice)) slL = currentPrice - atr * GEO.slAtrMult;
  if (!(tpL > currentPrice)) tpL = currentPrice + atr * GEO.tpAtrMult;
  let slLo = roundPrice(slL, market); let tpLo = roundPrice(tpL, market);
  if (!(slLo < entryOut)) slLo = roundPrice(currentPrice - atr * GEO.slAtrMult, market);
  if (!(tpLo > entryOut)) tpLo = roundPrice(currentPrice + atr * GEO.tpAtrMult, market);

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

function tickSizeFor(price) {
  for (const b of SET_TICK_TABLE) if (price >= b.from && price < b.to) return b.tick;
  return SET_TICK_TABLE[SET_TICK_TABLE.length - 1].tick;
}

/** [CAUSAL] ค่าธรรมเนียมไป-กลับ เป็นสัดส่วนของมูลค่าสถานะ — ลอกจาก ceiling.mjs */
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

// ═════════════ ตัวทำนาย "ขนาด" ที่มองเห็นได้จริง ณ เวลาตัดสินใจ [CAUSAL] ═════════════

/**
 * ⚠ ทุกตัวในนี้อ่านได้ถึงแค่ candles[0..i] โดย i = แท่งสัญญาณ = t−1
 *   (t คือแท่งที่เข้าไม้ ราคาเข้าคือ open ของแท่ง t ซึ่งยังไม่รู้ตอนคำนวณ feature)
 *
 * เลือกมาจากของที่ "รู้กันมานาน" ว่าทำนายความผันผวนได้ (volatility clustering)
 * ไม่ใช่ของที่เพิ่งนึกออก — เพราะยิ่งลองเยอะ ยิ่งต้องหารด้วย Holm เยอะ
 *
 *   czAtrPct     ATR(14) เทียบราคา — ระดับความผันผวนล่าสุด
 *   czRv20/czRv5 ส่วนเบี่ยงเบนของผลตอบแทนราย 20/5 แท่ง — ระดับความผันผวนอีกวิธี
 *   czRvRatio    rv5 ÷ rv20 — ความผันผวน "กำลังขยาย" หรือ "กำลังหด"
 *   czAtrRatio   ATR(5) ÷ ATR(20) — เหมือนกันแต่วัดด้วย true range
 *   czRange10    ค่าเฉลี่ยของ (สูง−ต่ำ)/ปิด 10 แท่งล่าสุด
 *   czAbsRet5    |ราคาปิดเปลี่ยนไปกี่ % ใน 5 แท่ง| — โมเมนตัมแบบไม่สนทิศ
 *   czEwmaVol    EWMA ของผลตอบแทนกำลังสอง (λ=0.94 ตาม RiskMetrics) เดินสะสมจากต้นชุด
 *
 *   czFeeOverAtr **ตัวที่คณิตศาสตร์ของ p\* ชี้มาตรง ๆ**: ค่าธรรมเนียม ÷ ATR%
 *                เพราะ p* = (E[f] − E[w]) ÷ E[s] และ E[s] โตตาม ATR ส่วน E[f] ไม่โตตาม
 *                → ไม้ที่ "ค่าธรรมเนียมแพงเทียบกับระยะที่ราคาน่าจะวิ่ง" คือไม้ที่เส้นคุ้มทุนสูง
 *                ต่างจากการกรองด้วยความผันผวนเฉย ๆ เพราะค่าเงินในคลังมีค่าธรรมเนียมต่างกัน
 *                ถึง 10 เท่า (EURUSD 1.5 bps ↔ USDTHB 15 bps) การกรองด้วย ATR อย่างเดียว
 *                จึงมองไม่เห็นว่าคู่ไหนแพง — ตัวนี้เห็น และเป็นตัวเดียวที่ใช้ค่าธรรมเนียมจริง
 *                ⚠ ยังเป็น [CAUSAL] เต็มตัว: ค่าธรรมเนียมรู้ล่วงหน้า · ATR อ่านถึงแท่งสัญญาณ
 */
const CZ_NAMES = ['czAtrPct', 'czRv20', 'czRv5', 'czRvRatio', 'czAtrRatio', 'czRange10', 'czAbsRet5', 'czEwmaVol', 'czFeeOverAtr'];
const CZ_LABEL = {
  czAtrPct: 'ATR(14)/ราคา', czRv20: 'ผันผวน 20 แท่ง', czRv5: 'ผันผวน 5 แท่ง',
  czRvRatio: 'ผันผวน 5÷20', czAtrRatio: 'ATR 5÷20', czRange10: 'ช่วงแท่งเฉลี่ย 10',
  czAbsRet5: '|ผลตอบแทน 5 แท่ง|', czEwmaVol: 'EWMA ผันผวน (λ=0.94)',
  czFeeOverAtr: 'ค่าธรรมเนียม ÷ ATR% (ภาษีความแม่นที่คาด)',
};
/**
 * ทิศของตัวทำนาย: +1 = ค่ามาก แปลว่า "คาดว่าจะวิ่งแรง" · −1 = ค่ามาก แปลว่า "คาดว่าจะนิ่ง"
 *
 * ⚠ ต้องมีตารางนี้ ไม่งั้นการนับเครื่องหมายของแนวโน้มจะปนกัน: czFeeOverAtr วิ่งสวนทางกับ
 *   ตัวอื่นทั้งหมด (ค่าธรรมเนียมคงที่ ÷ ATR ที่โต = ค่าน้อย) ถ้าไม่กลับทิศก่อนนับ
 *   จะได้ข้อสรุปว่า "เครื่องหมายไม่ไปทางเดียวกัน" ทั้งที่ความจริงไปทางเดียวกัน
 */
const CZ_SIGN = {
  czAtrPct: 1, czRv20: 1, czRv5: 1, czRvRatio: 1, czAtrRatio: 1,
  czRange10: 1, czAbsRet5: 1, czEwmaVol: 1, czFeeOverAtr: -1,
};
/** ป้ายของกลุ่มปลาย เมื่อจัดตามทิศแล้ว */
const qLabelHigh = (f) => (CZ_SIGN[f] > 0 ? 'สูงสุด 20% (คาดว่าวิ่ง)' : 'ต่ำสุด 20% (คาดว่าวิ่ง)');
const qLabelLow = (f) => (CZ_SIGN[f] > 0 ? 'ต่ำสุด 20% (คาดว่านิ่ง)' : 'สูงสุด 20% (คาดว่านิ่ง)');

/**
 * [CAUSAL] คำนวณตัวทำนายทั้งชุดล่วงหน้าทีเดียวต่อ dataset
 * ทำแบบสะสมไปข้างหน้า (prefix) เพื่อให้แน่ใจว่าไม่มีทางอ่านแท่งหลัง i ได้เลย
 * — ถ้าเขียนแบบ slice ย้อนหลังทีละแท่ง โอกาสพลาด index ไปข้างหน้าสูงกว่ามาก
 */
function buildCausalFeatures(ds) {
  const n = ds.candles.length;
  const F = {};
  for (const k of CZ_NAMES) F[k] = new Float64Array(n).fill(NaN);

  // ผลตอบแทนราย 1 แท่ง (log) — r[k] ใช้ candles[k] กับ candles[k−1] เท่านั้น
  const r = new Float64Array(n).fill(NaN);
  for (let k = 1; k < n; k++) {
    const a = ds.candles[k - 1].close; const b = ds.candles[k].close;
    if (a > 0 && b > 0) r[k] = Math.log(b / a);
  }
  // EWMA เดินสะสมไปข้างหน้า — ค่าที่ k ใช้ r[1..k]
  const LAMBDA = 0.94;
  let ew = NaN;
  const ewArr = new Float64Array(n).fill(NaN);
  for (let k = 1; k < n; k++) {
    if (!Number.isFinite(r[k])) { ewArr[k] = ew; continue; }
    ew = Number.isFinite(ew) ? LAMBDA * ew + (1 - LAMBDA) * r[k] * r[k] : r[k] * r[k];
    ewArr[k] = ew;
  }

  const stdWin = (end, w) => {
    if (end - w < 0) return NaN;
    let s = 0; let ss = 0; let m = 0;
    for (let k = end - w + 1; k <= end; k++) { if (!Number.isFinite(r[k])) return NaN; s += r[k]; ss += r[k] * r[k]; m++; }
    if (m < 2) return NaN;
    const mu = s / m;
    return Math.sqrt(Math.max(ss / m - mu * mu, 0));
  };

  for (let i = MIN_HISTORY; i < n; i++) {
    const c = ds.candles[i];
    if (!isUsableBar(c)) continue;
    const atr14 = atrAt(ds.candles, i, 14);
    const atr5 = atrAt(ds.candles, i, 5);
    const atr20 = atrAt(ds.candles, i, 20);
    F.czAtrPct[i] = Number.isFinite(atr14) && c.close > 0 ? atr14 / c.close : NaN;
    F.czAtrRatio[i] = Number.isFinite(atr5) && Number.isFinite(atr20) && atr20 > 0 ? atr5 / atr20 : NaN;
    const rv20 = stdWin(i, 20); const rv5 = stdWin(i, 5);
    F.czRv20[i] = rv20; F.czRv5[i] = rv5;
    F.czRvRatio[i] = Number.isFinite(rv5) && Number.isFinite(rv20) && rv20 > 0 ? rv5 / rv20 : NaN;
    let sr = 0; let m = 0; let ok = true;
    for (let k = i - 9; k <= i; k++) {
      const cc = ds.candles[k];
      if (!isUsableBar(cc)) { ok = false; break; }
      sr += (cc.high - cc.low) / cc.close; m++;
    }
    F.czRange10[i] = ok && m ? sr / m : NaN;
    const c5 = ds.candles[i - 5];
    F.czAbsRet5[i] = (i >= 5 && isUsableBar(c5) && c5.close > 0) ? Math.abs(c.close / c5.close - 1) : NaN;
    F.czEwmaVol[i] = Number.isFinite(ewArr[i]) ? Math.sqrt(ewArr[i]) : NaN;
  }
  return F;
}

// ═════════════════════════ แกนกลาง: เดินหน้าต่างถือของไม้หนึ่ง ═════════════════════════

/**
 * ⚠ ORACLE — ฟังก์ชันนี้อ่านแท่ง candles[t .. t+H−1] ซึ่งยังไม่เกิด ณ เวลาตัดสินใจ
 *
 * ═══════════ ด่านกันการล้ำข้ามเส้นแบ่ง split ═══════════
 * ผู้เรียกส่ง maxIndex = ดัชนีแท่งสุดท้ายของ split เข้ามา ถ้าหน้าต่างเดินไม่ครบ H แท่ง
 * ภายในขอบเขตนั้น = **ทิ้งไม้ทั้งไม้** (คืน null) ไม่ใช่ตัดหน้าต่างให้สั้นลง
 *
 * ทำไมเลือก "ทิ้ง" ไม่ใช่ "ตัดให้จบที่เส้นแบ่ง": ไม้ที่ถูกบังคับปิดก่อนกำหนดไม่ใช่ไม้ H แท่ง
 * เอาไปเฉลี่ยรวมช่องเดียวกับไม้เต็มหน้าต่างไม่ได้ — วิธีเดียวกับ feat-cross.mjs และ
 * ceiling.mjs หลังแก้ (feat-cross ใช้ `if (i + maxH >= trainEndIdx) drop`)
 *
 * ของเดิมทั่วโครงการเคยปล่อยให้ล้ำ แล้ว "นับไว้ในตัวแปร spill" เฉย ๆ — การนับไม่ใช่การกัน
 */
function walkWindow(ds, t, g, entry, maxIndex, hWanted) {
  const { candles } = ds;
  let runMaxHigh = -Infinity; let runMinLow = Infinity;
  let lastUsableClose = NaN; let lastUsableIdx = -1;
  let hitLong = null; let hitShort = null;
  const out = new Map();
  let hIdx = 0;
  const hMax = HORIZONS[HORIZONS.length - 1];

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
    while (hIdx < HORIZONS.length && HORIZONS[hIdx] === off + 1) {
      const H = HORIZONS[hIdx];
      if (!hWanted || hWanted.has(H)) {
        out.set(H, {
          H, lastIdx: lastUsableIdx,
          maxHigh: runMaxHigh, minLow: runMinLow, endClose: lastUsableClose,
          exitLong: hitLong !== null ? hitLong : lastUsableClose,
          exitShort: hitShort !== null ? hitShort : lastUsableClose,
        });
      }
      hIdx++;
    }
  }
  return out;   // H ที่ไม่อยู่ใน map = หน้าต่างเดินไม่ครบภายในขอบเขต = ต้องทิ้ง
}

/** แปลงหน้าต่างที่เดินแล้ว เป็นค่าที่ใช้คิดเงิน (ยังเป็น ORACLE อยู่) */
function windowToRecord(w, entry) {
  if (!(w.lastIdx >= 0) || !Number.isFinite(w.endClose)) return null;
  const netMove = w.endClose - entry;
  if (netMove === 0) return null;              // ทิศไม่นิยาม — ทิ้ง (เหมือน ceiling)
  const dirTrue = netMove > 0 ? 1 : -1;
  const rLong = (w.exitLong - entry) / entry;
  const rShort = (entry - w.exitShort) / entry;
  const perfect = Math.max((w.maxHigh - entry) / entry, (entry - w.minLow) / entry);
  return {
    dirTrue,
    rLong,
    rShort,
    perfect,
    correct: dirTrue > 0 ? rLong : rShort,     // กรอบ A
    wrong: dirTrue > 0 ? rShort : rLong,
    best: Math.max(rLong, rShort),             // กรอบ B
    worst: Math.min(rLong, rShort),
    bestDir: rLong >= rShort ? 1 : -1,
    realMag: Math.abs(netMove) / entry,        // ⚠ ORACLE — ใช้แบ่งกลุ่มวินิจฉัยเท่านั้น
  };
}

// ═══════════════════════ ตัวสะสม + bootstrap แบบจับกลุ่ม ═══════════════════════

/**
 * สะสมผลรวมรายกลุ่ม (สัญลักษณ์ × เดือน) แล้ว bootstrap ด้วยการสุ่ม "ทั้งกลุ่ม"
 * ทุกสถิติที่ต้องการต้องมาจากการสุ่มครั้งเดียวกัน ไม่งั้นความสัมพันธ์ระหว่างสถิติหาย
 *
 * ช่องที่เก็บ (ผลรวมในกลุ่ม):
 *   n · h (จำนวนที่ทายถูกกรอบ A) · hB (กรอบ B) · c · w · f · o · s (=c−w) · sB (=best−worst)
 *   hs (Σ h·s) · hsB · oR (Σ (o−f)/stopDistPct) · nR
 */
const SLOT = {
  n: 0, h: 1, hB: 2, c: 3, w: 4, f: 5, o: 6, s: 7, sB: 8, hs: 9, hsB: 10,
  best: 11, worst: 12, oR: 13, nR: 14, perfect: 15, LEN: 16,
};

class Acc {
  constructor() { this.g = new Map(); }
  add(key, rec) {
    let a = this.g.get(key);
    if (!a) { a = new Float64Array(SLOT.LEN); this.g.set(key, a); }
    a[SLOT.n] += 1;
    a[SLOT.h] += rec.hit ? 1 : 0;
    a[SLOT.hB] += rec.hitB ? 1 : 0;
    a[SLOT.c] += rec.correct;
    a[SLOT.w] += rec.wrong;
    a[SLOT.f] += rec.fee;
    a[SLOT.o] += rec.engOut;
    a[SLOT.s] += rec.s;
    a[SLOT.sB] += rec.sB;
    a[SLOT.hs] += (rec.hit ? 1 : 0) * rec.s;
    a[SLOT.hsB] += (rec.hitB ? 1 : 0) * rec.sB;
    a[SLOT.best] += rec.best;
    a[SLOT.worst] += rec.worst;
    if (Number.isFinite(rec.netR)) { a[SLOT.oR] += rec.netR; a[SLOT.nR] += 1; }
    a[SLOT.perfect] += rec.perfect;
    return a;
  }
  get size() { return this.g.size; }
}

/** สถิติทั้งชุดจากผลรวมรายกลุ่ม — ใช้ทั้งกับของจริงและกับ bootstrap replicate */
function statsFromSums(S) {
  const N = S[SLOT.n];
  if (!N) return null;
  const C = S[SLOT.c] / N; const W = S[SLOT.w] / N; const F = S[SLOT.f] / N;
  const O = S[SLOT.o] / N; const s = S[SLOT.s] / N; const sB = S[SLOT.sB] / N;
  const B = S[SLOT.best] / N; const Wo = S[SLOT.worst] / N;
  return {
    n: N,
    pHat: S[SLOT.h] / N,
    pHatB: S[SLOT.hB] / N,
    pW: S[SLOT.s] !== 0 ? S[SLOT.hs] / S[SLOT.s] : NaN,
    pWB: S[SLOT.sB] !== 0 ? S[SLOT.hsB] / S[SLOT.sB] : NaN,
    meanCorrect: C, meanWrong: W, meanFee: F, meanS: s, meanSB: sB,
    meanBest: B, meanWorst: Wo,
    netEng: O - F,
    pStar: s !== 0 ? (F - W) / s : NaN,
    pStarB: sB !== 0 ? (F - Wo) / sB : NaN,
    pFair: s !== 0 ? (0 - W) / s : NaN,
    netBlind: W + s * (S[SLOT.h] / N) - F,        // ผลที่ p̂ ทำนายไว้ (กรอบ A)
    netBlindB: Wo + sB * (S[SLOT.hB] / N) - F,    // ผลที่ p̂ ทำนายไว้ (กรอบ B)
    netR: S[SLOT.nR] ? S[SLOT.oR] / S[SLOT.nR] : NaN,
    nR: S[SLOT.nR],
    meanPerfect: S[SLOT.perfect] / N,
  };
}

function sumAll(acc) {
  const S = new Float64Array(SLOT.LEN);
  for (const a of acc.g.values()) for (let k = 0; k < SLOT.LEN; k++) S[k] += a[k];
  return S;
}

/**
 * bootstrap แบบสุ่มกลุ่มทั้งกลุ่ม คืนช่วงความเชื่อมั่นของทุกสถิติที่ขอ
 * @param picks รายชื่อฟังก์ชัน (stats)=>number ที่ต้องการช่วง
 */
function bootstrapAcc(acc, rng, picks, B = OPT.bootstrap) {
  const arr = [...acc.g.values()];
  const G = arr.length;
  const names = Object.keys(picks);
  if (G < 2) return Object.fromEntries(names.map((k) => [k, [NaN, NaN]]));
  const store = Object.fromEntries(names.map((k) => [k, new Float64Array(B)]));
  const S = new Float64Array(SLOT.LEN);
  for (let b = 0; b < B; b++) {
    S.fill(0);
    for (let k = 0; k < G; k++) {
      const a = arr[(rng() * G) | 0];
      for (let q = 0; q < SLOT.LEN; q++) S[q] += a[q];
    }
    const st = statsFromSums(S);
    for (const k of names) store[k][b] = st ? picks[k](st) : NaN;
  }
  const out = {};
  for (const k of names) {
    const sorted = Array.from(store[k]).filter((v) => Number.isFinite(v)).sort((a, b2) => a - b2);
    out[k] = sorted.length
      ? [percentileOfSorted(sorted, 0.025), percentileOfSorted(sorted, 0.975)]
      : [NaN, NaN];
  }
  return out;
}

/** ค่าเฉลี่ยพร้อม p แบบ cluster ของสถิติเชิงเส้นตัวเดียว (ใช้กับ netEng, hit rate ฯลฯ) */
function clusterOf(acc, fn) {
  const cl = [];
  for (const a of acc.g.values()) cl.push({ n: a[SLOT.n], s: fn(a) });
  return clusterMean(cl);
}

// ═══════════════════════════ การเรียก lab.mjs (มีใบกำกับ) ═══════════════════════════

/**
 * แคชผลของ lab.mjs — ต้องมีใบกำกับ ไม่ใช่ "ไฟล์มีอยู่ก็ใช้เลย"
 * เหตุผลเดียวกับที่ combine.mjs เพิ่งถูกแก้: ไฟล์ที่สร้างจากอาร์กิวเมนต์ชุดอื่น หรือจาก
 * lab.mjs รุ่นเก่า หรือที่เขียนค้างครึ่งเดียว จะถูกใช้ต่อเงียบ ๆ แล้วให้คำตอบคนละอย่าง
 */
function runLab(split) {
  const tag = 'fxmag-engine';
  const csv = path.join(WORK_DIR, `${tag}-${split}-trades.csv`);
  const metaFile = `${csv}.meta.json`;
  const labArgs = [
    `--markets=${MARKETS.join(',')}`,
    `--timeframes=${TIMEFRAMES.join(',')}`,
    `--split=${split}`,
    `--max-hold=${PRIMARY_H}`,
    `--tag=${tag}`,
    '--dump-trades',
    '--bootstrap=200',
    `--seed=${OPT.seed}`,
  ];
  const labSha = sha256File(LAB);
  const want = { labArgs, labSha };

  if (!OPT.refresh && fs.existsSync(csv) && fs.existsSync(metaFile)) {
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { meta = null; }
    const sameArgs = meta && JSON.stringify(meta.labArgs) === JSON.stringify(want.labArgs);
    const sameLab = meta && meta.labSha === want.labSha;
    const sameCsv = meta && meta.csvSha === sha256File(csv);
    const sameCache = meta && meta.labCacheDir === LAB_CACHE_DIR;
    if (sameArgs && sameLab && sameCsv && sameCache) {
      IN.note(csv, `lab-cache:${split}`);
      return { csv, cached: true };
    }
    console.warn(`⚠ แคชของ lab (${split}) ไม่ตรงใบกำกับ — สร้างใหม่`
      + ` (อาร์กิวเมนต์: ${!!sameArgs} · lab.mjs: ${!!sameLab} · ไฟล์: ${!!sameCsv} · คลัง: ${!!sameCache})`);
  }

  execFileSync(process.execPath, [LAB, ...labArgs],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  for (const suffix of [`${split}-trades.csv`, `${split}.txt`, `${split}.json`]) {
    const src = path.join(REPORT_DIR, `${tag}-${suffix}`);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(WORK_DIR, `${tag}-${suffix}`));
  }
  if (!fs.existsSync(csv)) throw new Error(`lab.mjs ไม่ได้สร้าง ${csv} — หยุดดีกว่าเดาต่อ`);
  const meta = { ...want, labCacheDir: LAB_CACHE_DIR, csvSha: sha256File(csv) };
  fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
  IN.note(csv, `lab-cache:${split}`);
  return { csv, cached: false };
}

function readTradesCsv(file) {
  const lines = IN.read(file, 'lab-trades').trim().split(/\r?\n/);
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

// ═══════════════════════ ด่านตรวจตัวเอง (โรค "ค่าข้ามช่อง") ═══════════════════════

/**
 * รอบซ่อมเครื่องมือพบว่า combine.mjs เคยเขียนค่าของช่องหนึ่งลงในสล็อตของอีกช่อง
 * ระดับหน่วยความจำ (1 ใน 75 รอบ) โดยไม่มี error — แก้ที่ต้นเหตุไม่ได้ ทำได้แค่
 * "ให้มันหยุดดัง ๆ แทนที่จะพิมพ์ตัวเลขสวย ๆ ออกมา" ไฟล์นี้ใช้หลักเดียวกัน 3 ด่าน:
 *
 *   ด1 คำนวณสถิติของทุกช่องสองรอบจากผลรวมชุดเดิม แล้วเทียบทุกบิต
 *   ด2 ตรวจข้ามช่อง: สองช่องที่จำนวนไม้ต่างกัน ห้ามมีค่าเฉลี่ยตรงกันทุกบิต
 *   ด3 ตรวจอัตลักษณ์ทางคณิตศาสตร์ที่ต้องจริงเสมอ (ดูด้านล่าง) ถ้าไม่จริง = ค่าปนกัน
 */
function selfCheckCells(cellMapRaw, tag) {
  const bad = [];
  // ⚠ ต้องติดป้ายชื่อชุด (tag) ไว้ ไม่งั้นช่องของ "ประชากร" กับของ "เครื่องยนต์" มีคีย์ซ้ำกัน
  //   แล้วตอนด่านฟ้อง จะไม่รู้ว่ามาจากชุดไหน = ตามหาต้นเหตุไม่เจอ
  const cellMap = new Map([...cellMapRaw].map(([k, v]) => [`${tag}:${k}`, v]));
  // ── ด1 · คำนวณซ้ำจากผลรวมเดิม ต้องได้เท่ากันทุกบิต ──
  for (const [key, cell] of cellMap) {
    const again = statsFromSums(cell.sums);
    for (const k of Object.keys(cell.stats)) {
      const a = cell.stats[k]; const b = again[k];
      const same = (Number.isNaN(a) && Number.isNaN(b)) || a === b;
      if (!same) bad.push(`ด1 ${key}.${k}: คำนวณสองรอบได้ ${a} กับ ${b}`);
    }
  }
  // ── ด2 · ช่องที่ขนาดตัวอย่างต่างกัน ห้ามมีค่าเฉลี่ยตรงกันทุกบิต ──
  const keys = [...cellMap.keys()];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const A = cellMap.get(keys[i]).stats; const B = cellMap.get(keys[j]).stats;
      if (A.n === B.n) continue;
      if (!Number.isFinite(A.netEng) || !Number.isFinite(B.netEng)) continue;
      if (A.netEng === B.netEng && A.meanCorrect === B.meanCorrect) {
        bad.push(`ด2 "${keys[i]}" (${A.n} ไม้) กับ "${keys[j]}" (${B.n} ไม้) `
          + `มีค่าเฉลี่ยตรงกันทุกบิต (${A.netEng}) — เป็นไปไม่ได้ทางสถิติ = หน่วยความจำปนกัน`);
      }
    }
  }
  // ── ด3 · อัตลักษณ์ที่ต้องจริงเสมอ ──
  for (const [key, cell] of cellMap) {
    const S = cell.stats;
    if (!S.n) continue;
    // (ก) netEng ต้องเท่ากับ E[w] + E[s]·p_w − E[f] เป๊ะ (คลาดเคลื่อนได้แค่ระดับ float)
    const idA = S.meanWrong + S.meanS * S.pW - S.meanFee;
    const idB = S.meanWorst + S.meanSB * S.pWB - S.meanFee;
    const tol = 1e-12 + 1e-9 * Math.abs(S.netEng);
    if (Number.isFinite(S.pW) && Math.abs(idA - S.netEng) > tol) {
      bad.push(`ด3 ${key}: อัตลักษณ์กรอบ A ไม่จริง (${idA} vs ${S.netEng})`);
    }
    if (Number.isFinite(S.pWB) && Math.abs(idB - S.netEng) > tol) {
      bad.push(`ด3 ${key}: อัตลักษณ์กรอบ B ไม่จริง (${idB} vs ${S.netEng})`);
    }
    // (ข) กรอบ B: น้ำหนักต้องไม่ติดลบ → p_w ต้องอยู่ใน [0,1]
    if (Number.isFinite(S.pWB) && (S.pWB < -1e-12 || S.pWB > 1 + 1e-12)) {
      bad.push(`ด3 ${key}: p_w กรอบ B = ${S.pWB} อยู่นอก [0,1] ทั้งที่น้ำหนักต้องไม่ติดลบ`);
    }
    // (ค) ความแม่นดิบต้องอยู่ใน [0,1]
    for (const k of ['pHat', 'pHatB']) {
      if (Number.isFinite(S[k]) && (S[k] < 0 || S[k] > 1)) bad.push(`ด3 ${key}: ${k} = ${S[k]} นอก [0,1]`);
    }
    // (ง) best ≥ worst เสมอ
    if (Number.isFinite(S.meanBest) && S.meanBest < S.meanWorst) {
      bad.push(`ด3 ${key}: meanBest (${S.meanBest}) < meanWorst (${S.meanWorst})`);
    }
  }
  return bad;
}

// ═══════════════════════════ สมุดบันทึกการแตะ validation ═══════════════════════════

const TOUCH_FILE = path.join(WORK_DIR, 'VALIDATION-TOUCHES.md');
function noteValidationTouch() {
  const head = `# สมุดบันทึกการแตะชุด validation ของ fx-magnitude.mjs

ชนิด \`วิจัย\` = การกวาดที่อาจนำไปสู่การตัดสินใจ (นี่คือตัวเลขที่ทำให้ validation ปนเปื้อนทีละนิด)
ชนิด \`กลไก\` = การรันซ้ำเพื่อเทียบไบต์ว่าได้ผลเดิมไหม ไม่มีการตัดสินใจใด ๆ

| เมื่อไร | ชนิด | อาร์กิวเมนต์ | หมายเหตุ |
|---|---|---|---|
`;
  if (!fs.existsSync(TOUCH_FILE)) fs.writeFileSync(TOUCH_FILE, head, 'utf8');
  const kind = OPT.rerunProbe ? 'กลไก' : 'วิจัย';
  const note = OPT.rerunProbe ? 'รันซ้ำเชิงกล — ไม่มีการตัดสินใจ' : 'กวาด validation เพื่อยืนยันผลจาก train';
  const argStr = process.argv.slice(2).join(' ') || '(ไม่มี)';
  fs.appendFileSync(TOUCH_FILE, `| ${new Date().toISOString()} | ${kind} | ${argStr} | ${note} |\n`, 'utf8');
}

/** นับแถวในสมุด แยกชนิด — ตัวเลขนี้ต้องขึ้นรายงาน ไม่งั้นไม่มีใครเห็นว่าแตะไปกี่ครั้ง */
function countTouches() {
  if (!fs.existsSync(TOUCH_FILE)) return { research: 0, mechanical: 0, total: 0 };
  const lines = fs.readFileSync(TOUCH_FILE, 'utf8').split('\n')
    .filter((l) => /^\| \d{4}-\d{2}-\d{2}T/.test(l));
  let research = 0; let mechanical = 0;
  for (const l of lines) {
    const kind = l.split('|')[2]?.trim();
    if (kind === 'กลไก') mechanical++; else research++;
  }
  return { research, mechanical, total: lines.length };
}

// ═══════════════════════════════ การเขียนรายงาน ═══════════════════════════════

const LINES = [];
const W = (s = '') => LINES.push(s);
const bps = (v, d = 2) => (Number.isFinite(v) ? `${(v * 10000).toFixed(d)}` : '—');
const pS = (p) => (!Number.isFinite(p) ? '—' : (p < 1e-4 ? p.toExponential(1) : p.toFixed(4)));
const pctS = (v, d = 2) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const numS = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');

// ════════════════════════════════════ MAIN ════════════════════════════════════

async function main() {
  const t0 = Date.now();
  noteValidationTouch();

  const bounds = IN.readJson(SPLIT_FILE, 'split');
  const OUT = {
    generatedAt: new Date().toISOString(),
    opt: { ...OPT },
    cacheDir: path.relative(ROOT, CACHE_DIR).split('\\').join('/'),
    cells: {}, buckets: {}, ic: {}, rules: {}, sizing: {}, symbolSplit: {},
    population: {}, audit: {}, alt: {},
  };

  // ── ใบรับรองการพิสูจน์เรื่องการล้ำ (สร้างด้วย --prove-no-leak) ──
  // อ่านมาแปะในรายงานพร้อม sha ของโค้ดที่ถูกพิสูจน์ ถ้า sha ไม่ตรงกับโค้ดบนดิสก์
  // ต้องขึ้นคำเตือน ไม่ใช่แสดงผ่านเฉย ๆ — นี่คือโรคเดียวกับ "รายงานสร้างจากโค้ดคนละรุ่น"
  const proofFile = path.join(WORK_DIR, 'leak-proof.json');
  if (fs.existsSync(proofFile)) {
    const pf = IN.readJson(proofFile, 'leak-proof');
    OUT.leakProof = { ...pf, scriptMatches: pf.scriptSha256 === sha256File(SCRIPT_PATH) };
  }
  const stFile = path.join(WORK_DIR, 'self-test.json');
  if (fs.existsSync(stFile)) {
    const st = IN.readJson(stFile, 'self-test');
    OUT.selfTest = { ...st, scriptMatches: st.scriptSha256 === sha256File(SCRIPT_PATH) };
  }

  // ── โหลดชุดข้อมูลของจักรวาลที่เจ้าของเทรด ────────────────────────────────────
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
  const datasets = [];
  const dropped = [];
  for (const f of files) {
    const mk = f.split('__')[0];
    if (!MARKETS.includes(mk)) continue;          // นอกจักรวาลของเจ้าของ — ไม่แตะเลย
    const ds = loadDataset(f);
    if (ds.verdict === 'bad') { dropped.push(`${ds.market}/${ds.symbol}/${ds.timeframe} (คุณภาพ bad)`); continue; }
    if (!ds.candles.length) { dropped.push(`${ds.market}/${ds.symbol}/${ds.timeframe} (ว่าง)`); continue; }
    datasets.push(ds);
  }

  const dsIndex = new Map();
  for (const ds of datasets) {
    const idx = new Map();
    ds.candles.forEach((c, k) => idx.set(c.timestamp, k));
    dsIndex.set(`${ds.market}|${ds.symbol}|${ds.timeframe}`, { ds, idx });
  }

  // ── ไม้ของเครื่องยนต์จริง ─────────────────────────────────────────────────────
  const labRun = { train: runLab('train'), validation: runLab('validation') };
  const engineTrades = {
    train: readTradesCsv(labRun.train.csv),
    validation: readTradesCsv(labRun.validation.csv),
  };

  // ══════════════════ C0 · ตรวจเครื่องวัด: เทียบกับ exp-ceiling ที่ส่งมอบแล้ว ══════════════════
  //
  // ถ้าโค้ดในไฟล์นี้เข้าใจกติกาไม่ตรงกับ ceiling ตัวเลขทุกตัวข้างล่างก็เชื่อไม่ได้
  // จึงคำนวณ "ช่องประชากร" (ทุกแท่งที่เข้าไม้ได้ ไม่ใช่เฉพาะแท่งที่เครื่องยนต์เข้า)
  // ด้วยนิยามเดียวกับ ceiling แล้วเทียบตัวเลขที่ ceiling ส่งมอบไว้ทุกช่องที่เทียบได้
  const popCells = new Map();     // `${split}|${market}|${tf}|${H}` -> Acc
  const popOf = (k) => { let a = popCells.get(k); if (!a) { a = new Acc(); popCells.set(k, a); } return a; };

  // ── ตัวสะสมไม้ของเครื่องยนต์ (ตัวเอกของงานนี้) ──────────────────────────────
  const engRecords = [];          // ทุกไม้ พร้อม feature causal + ค่า oracle
  const spillStat = { dropped: 0, kept: 0, flat: 0, noBar: 0, noGeom: 0, noFeat: 0 };

  for (const ds of datasets) {
    const b = bounds.timeframes[ds.timeframe];
    if (!b) continue;
    const dsKey = `${ds.market}|${ds.symbol}|${ds.timeframe}`;
    const n = ds.times.length;
    const iTrainEnd = lowerBound(ds.times, Date.parse(b.trainEnd));
    const iValEnd = lowerBound(ds.times, Date.parse(b.validationEnd));
    const win = {
      train: { from: 0, to: iTrainEnd - 1, end: iTrainEnd - 1 },
      validation: { from: iTrainEnd, to: iValEnd - 1, end: iValEnd - 1 },
    };
    const CZ = buildCausalFeatures(ds);

    // ค้นหาว่าเครื่องยนต์เข้าไม้ที่แท่งไหนบ้าง (timestamp -> ทิศ) แยกตาม split
    const engAt = { train: new Map(), validation: new Map() };
    for (const split of SPLITS) {
      for (const tr of engineTrades[split]) {
        if (`${tr.market}|${tr.symbol}|${tr.timeframe}` !== dsKey) continue;
        engAt[split].set(tr.entryTime, tr);
      }
    }

    for (const split of SPLITS) {
      const w = win[split];
      if (w.from > w.to || w.from >= n) continue;
      // ⚠ ขอบเขตที่ oracle มองได้ = แท่งสุดท้ายของ split นี้เท่านั้น
      //   --keep-spill = โหมด "ก่อนแก้" ปล่อยให้มองข้าม split ได้ (ใช้ทำตารางเทียบเท่านั้น)
      const maxIndex = OPT.keepSpill ? n - 1 : Math.min(n - 1, w.end);
      const from = Math.max(MIN_HISTORY + 1, w.from);
      const to = Math.min(n - 1, w.to);

      for (let t = from; t <= to; t++) {
        const entryBar = ds.candles[t];
        if (!isUsableBar(entryBar)) continue;
        const i = t - 1;
        const g = geometryAt(ds.candles, i, ds.market);
        if (!g.okLong || !g.okShort) continue;
        const entry = entryBar.open;
        if (!(entry > 0)) continue;
        const stopDistPct = Math.abs(g.entryOut - g.slLong) / entry;
        const fee = feeFractionFor(ds.market, ds.symbol, entry, stopDistPct);
        if (!Number.isFinite(fee)) continue;

        const wins = walkWindow(ds, t, g, entry, maxIndex, null);
        const ts = entryBar.timestamp;
        const tr = engAt[split].get(ts);
        const d = new Date(ds.times[t]);
        const cl = `${ds.symbol}|${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

        for (const H of HORIZONS) {
          const wr = wins.get(H);
          if (!wr) continue;                      // หน้าต่างล้ำเส้นแบ่ง → ทิ้งทั้งไม้
          const rec = windowToRecord(wr, entry);
          if (!rec) continue;

          // ── ช่องประชากร: "ถ้าทายทิศถูกทุกไม้" โดยไม่อ้างอิงเครื่องยนต์ ──
          // ค่าที่จะอ่านจากช่องนี้คือ meanCorrect / meanWrong / meanFee / pStar (เทียบกับ ceiling)
          //
          // ⚠ ต้องตั้ง hit/hitB ให้ **สอดคล้องกับ engOut ที่ใส่เข้าไป** ไม่งั้นด่านตรวจอัตลักษณ์
          //   ในหัวข้อ ด3 จะฟ้อง (และมันฟ้องถูก): engOut ที่นี่คือ "ผลของทิศที่ถูก" = correct
          //   · กรอบ A ทิศที่ถูกคือทิศจริงเสมอ → hit = true
          //   · กรอบ B ถือว่า "ถูก" ก็ต่อเมื่อทิศจริงบังเอิญเป็นฝั่งที่จ่ายด้วย
          //     (ไม่ใช่เสมอไป — ราคาแกว่งไปโดนฝั่งตรงข้ามก่อนแล้วค่อยกลับมาปิดอีกทางได้)
          popOf(`${split}|${ds.market}|${ds.timeframe}|${H}`).add(cl, {
            hit: true, hitB: rec.bestDir === rec.dirTrue,
            correct: rec.correct, wrong: rec.wrong, fee,
            engOut: rec.correct, s: rec.correct - rec.wrong, sB: rec.best - rec.worst,
            best: rec.best, worst: rec.worst, netR: NaN, perfect: rec.perfect,
          });

          if (!tr) continue;
          // ── ไม้ของเครื่องยนต์จริง ──
          const engDir = tr.action === 'BUY' ? 1 : -1;
          const hit = engDir === rec.dirTrue;
          const hitB = engDir === rec.bestDir;
          const engOut = engDir > 0 ? rec.rLong : rec.rShort;
          const czv = {};
          let featOk = true;
          for (const k of CZ_NAMES) {
            // czFeeOverAtr ต้องใช้ค่าธรรมเนียมของไม้นั้น ซึ่งขึ้นกับราคาเข้า → คำนวณตรงนี้
            // ไม่ใช่ใน buildCausalFeatures (ที่นั่นรู้แค่แท่งเทียน ไม่รู้ตารางค่าธรรมเนียม)
            // ⚠ ยังเป็น [CAUSAL]: fee มาจากตารางที่รู้ล่วงหน้า + geometry ของแท่งสัญญาณ i
            czv[k] = k === 'czFeeOverAtr'
              ? (CZ.czAtrPct[i] > 0 ? fee / CZ.czAtrPct[i] : NaN)
              : CZ[k][i];
            if (!Number.isFinite(czv[k])) featOk = false;
          }
          engRecords.push({
            split, market: ds.market, symbol: ds.symbol, tf: ds.timeframe, H,
            cluster: cl, time: ds.times[t],
            hit, hitB, engDir, dirTrue: rec.dirTrue,
            correct: rec.correct, wrong: rec.wrong, best: rec.best, worst: rec.worst,
            s: rec.correct - rec.wrong, sB: rec.best - rec.worst,
            engOut, fee, stopDistPct, perfect: rec.perfect,
            netR: stopDistPct > 0 ? (engOut - fee) / stopDistPct : NaN,
            realMag: rec.realMag,               // ⚠ ORACLE
            cz: czv, featOk,
          });
          if (H === PRIMARY_H) spillStat.kept++;
        }
        // นับไม้ที่ถูกทิ้งเพราะล้ำเส้นแบ่ง (เฉพาะไม้ของเครื่องยนต์ ที่ H หลัก)
        if (tr && !wins.get(PRIMARY_H)) spillStat.dropped++;
      }
    }
  }

  // ── สรุปช่องประชากร แล้วเทียบกับ exp-ceiling.json ที่ส่งมอบแล้ว ──
  const popStats = new Map();
  for (const [k, acc] of popCells) {
    if (acc.size < 2) continue;
    const S = sumAll(acc);
    popStats.set(k, { sums: S, stats: statsFromSums(S) });
  }
  const ceilFile = path.join(REPORT_DIR, 'exp-ceiling.json');
  const meterRows = [];
  if (fs.existsSync(ceilFile)) {
    const ceil = IN.readJson(ceilFile, 'ceiling-report');
    // ceiling จัดกลุ่ม TH_STOCK เป็น SET50/RUNNER ไม่ใช่ตลาด จึงเทียบได้เฉพาะ FOREX กับ GOLD
    for (const split of SPLITS) {
      for (const mk of ['FOREX', 'GOLD']) {
        for (const tf of TIMEFRAMES) {
          for (const H of HORIZONS) {
            const mine = popStats.get(`${split}|${mk}|${tf}|${H}`);
            const theirs = ceil.cells?.[`${split}|${mk}|${tf}|${H}`];
            if (!mine || !theirs) continue;
            meterRows.push({
              cell: `${split}|${mk}|${tf}|${H}`,
              nMine: mine.stats.n, nTheirs: theirs.n,
              dCorrect: mine.stats.meanCorrect - theirs.correct,
              dWrong: mine.stats.meanWrong - theirs.wrong,
              dFee: mine.stats.meanFee - theirs.fee,
              dPStar: mine.stats.pStar - theirs.pStar,
              exact: mine.stats.n === theirs.n
                && mine.stats.meanCorrect === theirs.correct
                && mine.stats.meanWrong === theirs.wrong
                && mine.stats.meanFee === theirs.fee,
            });
          }
        }
      }
    }
  }
  OUT.audit.meterVsCeiling = {
    compared: meterRows.length,
    exact: meterRows.filter((r) => r.exact).length,
    rows: meterRows,
  };
  OUT.population = Object.fromEntries([...popStats].map(([k, v]) => [k, v.stats]));

  // ══════════════════ ตัวสะสมช่องหลัก: ไม้ของเครื่องยนต์ ══════════════════
  const rng = mulberry32(OPT.seed);
  const cellAcc = new Map();
  const cellRecs = new Map();
  for (const r of engRecords) {
    const key = `${r.split}|${r.market}|${r.tf}|${r.H}`;
    let a = cellAcc.get(key);
    if (!a) { a = new Acc(); cellAcc.set(key, a); cellRecs.set(key, []); }
    a.add(r.cluster, r);
    cellRecs.get(key).push(r);
  }
  const cellMap = new Map();
  for (const [k, acc] of cellAcc) {
    if (acc.size < 2) continue;
    const S = sumAll(acc);
    cellMap.set(k, { sums: S, stats: statsFromSums(S), acc });
  }

  // ── ด่านตรวจตัวเอง: ถ้าเจอ = หยุดรอบนี้ ไม่พิมพ์ตัวเลขออกมา ──
  const selfBad = [...selfCheckCells(cellMap, 'เครื่องยนต์'), ...selfCheckCells(popStats, 'ประชากร')];
  if (selfBad.length) {
    console.error('\n[หยุด] ด่านตรวจตัวเองพบความผิดปกติ — ไม่พิมพ์ตัวเลขใด ๆ ออกมา:\n');
    for (const b of selfBad) console.error(`  · ${b}`);
    console.error('\nอาการแบบนี้เคยเกิดกับ combine.mjs (ค่าของช่องหนึ่งไปโผล่ในสล็อตของอีกช่อง)\n');
    process.exit(3);
  }

  // ช่วงความเชื่อมั่นของทุกช่อง
  const PICKS = {
    netEng: (s) => s.netEng,
    pHat: (s) => s.pHat,
    pW: (s) => s.pW,
    pStar: (s) => s.pStar,
    pWminusPStar: (s) => s.pW - s.pStar,
    pHatMinusPStar: (s) => s.pHat - s.pStar,
    pWminusPHat: (s) => s.pW - s.pHat,
    pHatB: (s) => s.pHatB,
    pWB: (s) => s.pWB,
    pStarB: (s) => s.pStarB,
    pWBminusPStarB: (s) => s.pWB - s.pStarB,
    pHatBminusPStarB: (s) => s.pHatB - s.pStarB,
    magTax: (s) => s.meanS * (s.pW - s.pHat),
    netR: (s) => s.netR,
  };
  for (const [k, cell] of cellMap) {
    cell.ci = bootstrapAcc(cell.acc, rng, PICKS);
    cell.netP = clusterOf(cell.acc, (a) => a[SLOT.o] - a[SLOT.f]).p;
    cell.netRP = clusterOf(cell.acc, (a) => a[SLOT.oR]).p;
    OUT.cells[k] = { ...cell.stats, ci: cell.ci, netP: cell.netP, netRP: cell.netRP };
  }

  const PRIMARY = (split) => cellMap.get(`${split}|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`);

  // ════════════ ① ควอนไทล์ของ "ขนาดการเคลื่อนไหวจริง" (⚠ ORACLE · วินิจฉัยเท่านั้น) ════════════
  //
  // ⛔⛔ ห้ามเอาการแบ่งกลุ่มนี้ไปทำ feature หรือเงื่อนไขเข้าไม้ — มันใช้ราคาที่ยังไม่เกิด
  //     มีไว้ตอบคำถามเดียว: "อาการของระบบเป็นแบบไหน เมื่อมองย้อนกลับไป"
  function bucketByOracleMagnitude(recs) {
    const vals = recs.map((r) => r.realMag).filter(Number.isFinite).sort((a, b2) => a - b2);
    if (vals.length < NQ * 10) return null;
    const cuts = [];
    for (let q = 1; q < NQ; q++) cuts.push(percentileOfSorted(vals, q / NQ));
    const accs = Array.from({ length: NQ }, () => new Acc());
    for (const r of recs) {
      if (!Number.isFinite(r.realMag)) continue;
      let b2 = 0;
      while (b2 < NQ - 1 && r.realMag > cuts[b2]) b2++;
      accs[b2].add(r.cluster, r);
    }
    return accs.map((a, q) => {
      const S = sumAll(a);
      const st = statsFromSums(S);
      return {
        q: q + 1,
        lo: q === 0 ? 0 : cuts[q - 1],
        hi: q === NQ - 1 ? Infinity : cuts[q],
        ...st,
        acc: a,
      };
    });
  }

  const bucketOut = {};
  for (const split of SPLITS) {
    const key = `${split}|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`;
    const recs = cellRecs.get(key) ?? [];
    const bs = bucketByOracleMagnitude(recs);
    if (!bs) continue;
    bucketOut[split] = bs.map(({ acc, ...rest }) => rest);
    // ทดสอบแนวโน้ม: ความแม่นของกลุ่มขนาดใหญ่สุด ต่างจากกลุ่มขนาดเล็กสุดไหม
    //
    // ตัวประมาณ: ต่อกลุ่ม (สัญลักษณ์×เดือน) สร้าง u = h5/π5 − h1/π1 แล้วเฉลี่ยแบบ cluster
    // พิสูจน์ว่าได้ p̂5 − p̂1 จริง: Σu/ΣN = (H5(N1+N5)/N5 − H1(N1+N5)/N1)/(N1+N5) = H5/N5 − H1/N1 ✓
    const q1 = bs[0]; const q5 = bs[NQ - 1];
    const cl = [];
    const byCluster = new Map();
    for (const r of recs) {
      if (!Number.isFinite(r.realMag)) continue;
      const inQ1 = r.realMag <= q1.hi;
      const inQ5 = r.realMag > bs[NQ - 2].hi;
      if (!inQ1 && !inQ5) continue;
      let e = byCluster.get(r.cluster);
      if (!e) { e = { n1: 0, h1: 0, n5: 0, h5: 0 }; byCluster.set(r.cluster, e); }
      if (inQ1) { e.n1++; e.h1 += r.hit ? 1 : 0; } else { e.n5++; e.h5 += r.hit ? 1 : 0; }
    }
    // ประมาณผลต่างด้วย "ผลรวมถ่วง" แบบเดียวกับ clusterMean บนตัวแปร h·(1/π5 หรือ −1/π1)
    let N1 = 0; let N5 = 0;
    for (const e of byCluster.values()) { N1 += e.n1; N5 += e.n5; }
    const pi1 = N1 / (N1 + N5); const pi5 = N5 / (N1 + N5);
    for (const e of byCluster.values()) {
      const s = (pi5 > 0 ? e.h5 / pi5 : 0) - (pi1 > 0 ? e.h1 / pi1 : 0);
      cl.push({ n: e.n1 + e.n5, s });
    }
    const dm = clusterMean(cl);
    registerTest({
      id: `Q5-Q1-hit-${split}`,
      family: split === 'train' ? 'วินิจฉัย (train)' : 'ยืนยัน (validation)',
      question: `① ความแม่นของไม้ "ขนาดจริงใหญ่สุด 20%" ต่างจาก "เล็กสุด 20%" · ${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H}`,
      estimate: q5.pHat - q1.pHat, ci: [NaN, NaN], p: dm.p, unit: 'pp',
      note: `Q1 ${pctS(q1.pHat)} → Q5 ${pctS(q5.pHat)}`,
    });
  }
  OUT.buckets = bucketOut;

  // ════════ ①ข · รูปที่อ่านง่ายที่สุดของสมมติฐาน: "ไม้ที่ถูกตัวเล็ก ไม้ที่ผิดตัวใหญ่" ════════
  //
  // ควอนไทล์ตอบได้แค่หยาบ ๆ ตัวเลขที่ตอบสมมติฐานตรงที่สุดคือเทียบขนาดเดิมพันของ
  // "ไม้ที่ทายถูก" กับ "ไม้ที่ทายผิด" ตรง ๆ:
  //     ถ้า E[s | ถูก] < E[s | ผิด] → ระบบชนะไม้เล็ก แพ้ไม้ใหญ่ = สมมติฐานถูก
  //     ถ้าเท่ากัน → ความแม่นเป็นอิสระจากขนาด = p̂ เทียบ p* ได้ = ต้องหาคำอธิบายอื่น
  // ⚠ ORACLE — s และ realMag อ่านอนาคต ใช้วินิจฉัยเท่านั้น
  const hitMagOut = {};
  for (const split of SPLITS) {
    hitMagOut[split] = {};
    for (const mk of MARKETS) {
      for (const tf of TIMEFRAMES) {
        const recs = cellRecs.get(`${split}|${mk}|${tf}|${PRIMARY_H}`);
        if (!recs || !recs.length) continue;
        const mean = (arr, f) => (arr.length ? arr.reduce((a, r) => a + f(r), 0) / arr.length : NaN);
        const hitR = recs.filter((r) => r.hit); const missR = recs.filter((r) => !r.hit);
        const hitB = recs.filter((r) => r.hitB); const missB = recs.filter((r) => !r.hitB);
        const e = {
          nHit: hitR.length, nMiss: missR.length,
          sHit: mean(hitR, (r) => r.s), sMiss: mean(missR, (r) => r.s),
          sBHit: mean(hitB, (r) => r.sB), sBMiss: mean(missB, (r) => r.sB),
          magHit: mean(hitR, (r) => r.realMag), magMiss: mean(missR, (r) => r.realMag),
        };
        e.sRatio = e.sHit / e.sMiss;
        e.sBRatio = e.sBHit / e.sBMiss;
        e.magRatio = e.magHit / e.magMiss;
        hitMagOut[split][`${mk}|${tf}`] = e;
        if (mk === PRIMARY_MARKET && tf === PRIMARY_TF) {
          // ทดสอบ: ขนาดเดิมพันของไม้ที่ถูก ต่างจากไม้ที่ผิดไหม (กรอบ B · น้ำหนักไม่ติดลบ)
          const byC = new Map();
          let N1 = 0; let N0 = 0;
          for (const r of recs) { if (r.hitB) N1++; else N0++; }
          const pi1 = N1 / (N1 + N0); const pi0 = N0 / (N1 + N0);
          for (const r of recs) {
            let x = byC.get(r.cluster);
            if (!x) { x = { n: 0, s: 0 }; byC.set(r.cluster, x); }
            x.n += 1;
            x.s += r.hitB ? (r.sB / pi1) : (-r.sB / pi0);
          }
          const dmS = clusterMean([...byC.values()]);
          registerTest({
            id: `sB-hit-vs-miss-${split}`,
            family: split === 'train' ? 'วินิจฉัย (train)' : 'ยืนยัน (validation)',
            question: `①ข ขนาดเดิมพันของไม้ที่ทายถูก ต่างจากไม้ที่ทายผิด (กรอบ B) · ${mk} ${tf} H${PRIMARY_H}`,
            estimate: e.sBHit - e.sBMiss, ci: [NaN, NaN], p: dmS.p, unit: 'bps',
            note: `ถูก ${bps(e.sBHit)} bps · ผิด ${bps(e.sBMiss)} bps · อัตราส่วน ${numS(e.sBRatio, 3)}`,
          });
        }
      }
    }
  }
  OUT.hitMag = hitMagOut;

  // ════════════ ② p_w เทียบกับ p* และ p̂ — ตัวเลขที่บอกว่าห่างแค่ไหนจริง ๆ ════════════
  for (const split of SPLITS) {
    for (const mk of MARKETS) {
      for (const tf of TIMEFRAMES) {
        const cell = cellMap.get(`${split}|${mk}|${tf}|${PRIMARY_H}`);
        if (!cell) continue;
        const fam = split === 'train' ? 'วินิจฉัย (train)' : 'ยืนยัน (validation)';
        const S = cell.stats;
        // ทดสอบ: ความแม่นแบบถ่วงขนาด ต่ำกว่าเส้นคุ้มทุนไหม (กรอบ A)
        const clA = [];
        // สร้างตัวแปรเชิงเส้นที่มีค่าเฉลี่ย = netEng → ทดสอบเดียวกับ "กำไรสุทธิ ≠ 0"
        for (const a of cell.acc.g.values()) clA.push({ n: a[SLOT.n], s: a[SLOT.o] - a[SLOT.f] });
        const netStat = clusterMean(clA);
        registerTest({
          id: `netEng-${split}-${mk}-${tf}`, family: fam,
          question: `② ผลจริงของเครื่องยนต์ต่างจากศูนย์ · ${mk} ${tf} H${PRIMARY_H}`,
          estimate: S.netEng, ci: cell.ci.netEng, p: netStat.p, unit: 'bps',
          note: `p̂=${pctS(S.pHat)} · p_w=${pctS(S.pW)} · p*=${pctS(S.pStar)}`,
        });
      }
    }
  }

  // ── แยกช่องว่างเป็น "ภายในสัญลักษณ์" กับ "ระหว่างสัญลักษณ์" ──
  //
  // p_w − p̂ = Σ_g ω_g·(p_w,g − p̂_g)  +  Σ_g (ω_g − ν_g)·p̂_g
  //           └── ภายใน: เลือกขนาดผิดในสัญลักษณ์เดียวกัน ──┘   └── ระหว่าง: น้ำหนักเทไปที่
  //                                                              สัญลักษณ์ที่เดิมพันใหญ่ ──┘
  // ω_g = ส่วนแบ่งของ Σs · ν_g = ส่วนแบ่งของจำนวนไม้
  function decomposeWithinBetween(recs, frameB = false) {
    const bySym = new Map();
    let sumS = 0; let N = 0; let sumHS = 0; let sumH = 0;
    for (const r of recs) {
      const s = frameB ? r.sB : r.s;
      const h = (frameB ? r.hitB : r.hit) ? 1 : 0;
      let e = bySym.get(r.symbol);
      if (!e) { e = { n: 0, h: 0, s: 0, hs: 0 }; bySym.set(r.symbol, e); }
      e.n++; e.h += h; e.s += s; e.hs += h * s;
      sumS += s; N++; sumHS += h * s; sumH += h;
    }
    if (!N || sumS === 0) return null;
    const pW = sumHS / sumS; const pHat = sumH / N;
    let within = 0; let between = 0;
    const rows = [];
    // ⚠ เรียงชื่อสัญลักษณ์ด้วยการเทียบสตริงตรง ๆ (ไม่ใช้ localeCompare — ผลขึ้นกับ locale)
    const syms = [...bySym.keys()].sort((a, b2) => (a < b2 ? -1 : a > b2 ? 1 : 0));
    for (const sym of syms) {
      const e = bySym.get(sym);
      const omega = e.s / sumS;
      const nu = e.n / N;
      const pwg = e.s !== 0 ? e.hs / e.s : NaN;
      const phg = e.h / e.n;
      if (Number.isFinite(pwg)) within += omega * (pwg - phg);
      between += (omega - nu) * phg;
      rows.push({ symbol: sym, n: e.n, omega, nu, pW: pwg, pHat: phg, meanS: e.s / e.n });
    }
    return { pW, pHat, gap: pW - pHat, within, between, rows };
  }

  const decomp = {};
  for (const split of SPLITS) {
    const recs = cellRecs.get(`${split}|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`) ?? [];
    if (!recs.length) continue;
    decomp[split] = { frameA: decomposeWithinBetween(recs, false), frameB: decomposeWithinBetween(recs, true) };
  }
  OUT.symbolSplit = decomp;

  // ════════════ คำอธิบายทางเลือก (เผื่อสมมติฐานผิด) ════════════
  //
  // ถ้าความแม่นไม่ขึ้นกับขนาด ต้องมีอย่างอื่นอธิบาย — วัดสามอย่างที่เป็นไปได้จริง:
  //   ก. ค่าธรรมเนียมของไม้ที่เครื่องยนต์เลือก แพงกว่าค่าเฉลี่ยของประชากรไหม
  //   ข. p* ของแท่งที่เครื่องยนต์เข้า ต่างจาก p* ของทุกแท่งไหม (เลือกจังหวะที่เดิมพันแย่)
  //   ค. ไม้ยาว/สั้น (long/short) ไม่สมมาตรไหม
  const alt = {};
  for (const split of SPLITS) {
    const cell = cellMap.get(`${split}|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`);
    const pop = popStats.get(`${split}|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`);
    if (!cell || !pop) continue;
    const recs = cellRecs.get(`${split}|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`);
    const longs = recs.filter((r) => r.engDir > 0);
    const shorts = recs.filter((r) => r.engDir < 0);
    const mean = (a, f) => (a.length ? a.reduce((x, y) => x + f(y), 0) / a.length : NaN);
    alt[split] = {
      feeEngine: cell.stats.meanFee,
      feePopulation: pop.stats.meanFee,
      feeRatio: cell.stats.meanFee / pop.stats.meanFee,
      pStarEngineBars: cell.stats.pStar,
      pStarAllBars: pop.stats.pStar,
      meanSEngineBars: cell.stats.meanS,
      meanSAllBars: pop.stats.meanS,
      longShare: recs.length ? longs.length / recs.length : NaN,
      longHit: mean(longs, (r) => (r.hit ? 1 : 0)),
      shortHit: mean(shorts, (r) => (r.hit ? 1 : 0)),
      longNet: mean(longs, (r) => r.engOut - r.fee),
      shortNet: mean(shorts, (r) => r.engOut - r.fee),
      negSShare: recs.length ? recs.filter((r) => r.s < 0).length / recs.length : NaN,
      negSWeightShare: (() => {
        let neg = 0; let tot = 0;
        for (const r of recs) { tot += Math.abs(r.s); if (r.s < 0) neg += Math.abs(r.s); }
        return tot ? neg / tot : NaN;
      })(),
    };
  }
  OUT.alt = alt;

  // ════════════ ③ ตัวทำนาย "ขนาด" ที่มองเห็นได้จริง (IC) ════════════
  //
  // เป้าหมายสองตัว:
  //   realMag = |ราคาเคลื่อนสุทธิ| ในหน้าต่างถือ   (ขนาดตรง ๆ)
  //   sB      = ส่วนต่างเดิมพันกรอบ B (best−worst)  (ขนาดที่แปลงเป็นเงินได้จริง)
  // ใช้ Spearman เพราะทั้งสองตัวมีหางหนามาก — Pearson จะถูกไม่กี่ไม้ครอบงำ
  //
  // ⚠ วิธีคิดช่วงความเชื่อมั่น: จัดอันดับทีเดียวบนข้อมูลทั้งชุด แล้ว bootstrap ความสัมพันธ์
  //   เชิงเส้นของ "อันดับที่ตรึงไว้แล้ว" แบบสุ่มทั้งกลุ่ม — ประหยัดกว่าจัดอันดับใหม่ทุกรอบ
  //   และให้ผลเดิมทุกครั้ง (การจัดอันดับใหม่ในแต่ละ replicate จะเปลี่ยนนิยามของตัวแปร)
  function icOf(recs, featName, targetFn, rngIC) {
    const use = recs.filter((r) => r.featOk && Number.isFinite(r.cz[featName]) && Number.isFinite(targetFn(r)));
    if (use.length < 100) return null;
    const x = ranksOf(use.map((r) => r.cz[featName]));
    const y = ranksOf(use.map(targetFn));
    // ผลรวมรายกลุ่มของ x, y, x², y², xy → bootstrap ได้ด้วย O(G) ต่อรอบ
    const byC = new Map();
    for (let k = 0; k < use.length; k++) {
      const c = use[k].cluster;
      let e = byC.get(c);
      if (!e) { e = new Float64Array(6); byC.set(c, e); }
      e[0] += 1; e[1] += x[k]; e[2] += y[k]; e[3] += x[k] * x[k]; e[4] += y[k] * y[k]; e[5] += x[k] * y[k];
    }
    const corrOf = (S) => {
      const n = S[0];
      if (n < 3) return NaN;
      const cov = S[5] / n - (S[1] / n) * (S[2] / n);
      const vx = S[3] / n - (S[1] / n) ** 2;
      const vy = S[4] / n - (S[2] / n) ** 2;
      return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : NaN;
    };
    const total = new Float64Array(6);
    for (const e of byC.values()) for (let q = 0; q < 6; q++) total[q] += e[q];
    const rho = corrOf(total);
    const arr = [...byC.values()];
    const G = arr.length;
    const reps = new Float64Array(OPT.bootstrap);
    const S = new Float64Array(6);
    for (let b = 0; b < OPT.bootstrap; b++) {
      S.fill(0);
      for (let k = 0; k < G; k++) { const a = arr[(rngIC() * G) | 0]; for (let q = 0; q < 6; q++) S[q] += a[q]; }
      reps[b] = corrOf(S);
    }
    const sorted = Array.from(reps).filter(Number.isFinite).sort((a, b2) => a - b2);
    const ci = sorted.length ? [percentileOfSorted(sorted, 0.025), percentileOfSorted(sorted, 0.975)] : [NaN, NaN];
    // p แบบสองหาง จากสัดส่วน replicate ที่ข้ามศูนย์ (พื้น p = 1/B — บอกไว้ในรายงาน)
    let le = 0;
    for (const v of sorted) if (v <= 0) le++;
    const frac = sorted.length ? le / sorted.length : NaN;
    const p = Number.isFinite(frac) ? Math.min(1, 2 * Math.min(frac, 1 - frac)) : NaN;
    return { rho, ci, p, n: use.length, G };
  }

  const icOut = {};
  for (const split of SPLITS) {
    const recs = cellRecs.get(`${split}|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`) ?? [];
    if (!recs.length) continue;
    icOut[split] = {};
    for (const f of CZ_NAMES) {
      const rngIC = mulberry32(OPT.seed + 1);
      const a = icOf(recs, f, (r) => r.realMag, rngIC);
      const rngIC2 = mulberry32(OPT.seed + 2);
      const b2 = icOf(recs, f, (r) => r.sB, rngIC2);
      const rngIC3 = mulberry32(OPT.seed + 3);
      const c2 = icOf(recs, f, (r) => (r.hit ? 1 : 0), rngIC3);
      icOut[split][f] = { vsRealMag: a, vsSpreadB: b2, vsHit: c2 };
      const fam = split === 'train' ? 'ทำนายขนาด (train)' : 'ยืนยัน (validation)';
      if (a) {
        registerTest({
          id: `IC-${f}-realMag-${split}`, family: fam,
          question: `③ ${CZ_LABEL[f]} ทำนาย "ขนาดการเคลื่อนไหวจริง" ได้ · ${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H}`,
          estimate: a.rho, ci: a.ci, p: a.p, unit: 'rho', note: `n=${a.n} · กลุ่ม=${a.G}`,
        });
      }
      if (b2) {
        registerTest({
          id: `IC-${f}-spreadB-${split}`, family: fam,
          question: `③ ${CZ_LABEL[f]} ทำนาย "ส่วนต่างเดิมพัน (กรอบ B)" ได้ · ${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H}`,
          estimate: b2.rho, ci: b2.ci, p: b2.p, unit: 'rho', note: `n=${b2.n} · กลุ่ม=${b2.G}`,
        });
      }
      if (c2) {
        registerTest({
          id: `IC-${f}-hit-${split}`, family: fam,
          question: `③ ${CZ_LABEL[f]} ทำนาย "เครื่องยนต์จะทายถูกไหม" ได้ · ${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H}`,
          estimate: c2.rho, ci: c2.ci, p: c2.p, unit: 'rho', note: `n=${c2.n} · กลุ่ม=${c2.G}`,
        });
      }
    }
  }
  OUT.ic = icOut;

  // ════════════ ④ เอาไปใช้จริงได้ไหม: คัดไม้ตามขนาดที่ "คาด" (causal ล้วน) ════════════
  //
  // เกณฑ์แบ่งกลุ่มทั้งหมดคำนวณจาก **train เท่านั้น** แล้วแช่แข็ง เอาไปใช้กับ validation ตรง ๆ
  // ถ้าคำนวณเกณฑ์ใหม่บน validation = ใช้ข้อมูล validation ตัดสิน = ปนเปื้อน
  const trainRecs = cellRecs.get(`train|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`) ?? [];
  const valRecs = cellRecs.get(`validation|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`) ?? [];
  const ruleOut = {};
  for (const f of CZ_NAMES) {
    const vals = trainRecs.filter((r) => r.featOk && Number.isFinite(r.cz[f])).map((r) => r.cz[f]).sort((a, b2) => a - b2);
    if (vals.length < NQ * 20) continue;
    const cuts = [];
    for (let q = 1; q < NQ; q++) cuts.push(percentileOfSorted(vals, q / NQ));
    const bucketize = (recs) => {
      const accs = Array.from({ length: NQ }, () => new Acc());
      for (const r of recs) {
        if (!r.featOk || !Number.isFinite(r.cz[f])) continue;
        let b2 = 0;
        while (b2 < NQ - 1 && r.cz[f] > cuts[b2]) b2++;
        accs[b2].add(r.cluster, r);
      }
      return accs.map((a, q) => {
        const S = sumAll(a);
        return { q: q + 1, ...statsFromSums(S), netP: a.size >= 2 ? clusterOf(a, (x) => x[SLOT.o] - x[SLOT.f]).p : NaN };
      });
    };
    ruleOut[f] = { cutsFromTrain: cuts, train: bucketize(trainRecs), validation: bucketize(valRecs) };

    // ── รูปที่ "ใช้ได้จริง" ของสมมติฐาน: ความแม่นตกไหมเมื่อ *คาดว่า* จะผันผวนแรง ──
    //
    // ต่างจาก ① ตรงที่การแบ่งกลุ่มตรงนี้ใช้ค่าที่มองเห็นได้จริง ณ เวลาตัดสินใจ
    // ถ้าความแม่นตกจริงในกลุ่มที่คาดว่าผันผวนแรง = สมมติฐานถูกในรูปที่เอาไปใช้ได้
    // และอธิบายได้ว่าทำไมการ "เลือกเทรดตอนคาดว่าวิ่ง" ถึงยิ่งแย่ แม้ p* จะต่ำลง
    // ⚠ จัดทิศให้ตรงกันทุกตัวทำนายก่อนวัด: qHi = กลุ่มที่ "คาดว่าวิ่งแรงที่สุด" เสมอ
    //   (สำหรับ czFeeOverAtr นั่นคือ Q1 ไม่ใช่ Q5) ถ้าไม่จัดทิศ การนับเครื่องหมายจะไร้ความหมาย
    const qHi = CZ_SIGN[f] > 0 ? NQ - 1 : 0;
    const qLo = CZ_SIGN[f] > 0 ? 0 : NQ - 1;
    for (const split of SPLITS) {
      const recs = split === 'train' ? trainRecs : valRecs;
      const bq = (r) => { let b2 = 0; while (b2 < NQ - 1 && r.cz[f] > cuts[b2]) b2++; return b2; };
      const byC = new Map();
      let nLo = 0; let nHi = 0;
      for (const r of recs) {
        if (!r.featOk || !Number.isFinite(r.cz[f])) continue;
        const q = bq(r);
        if (q === qLo) nLo++; else if (q === qHi) nHi++;
      }
      if (nLo < 20 || nHi < 20) continue;
      const piLo = nLo / (nLo + nHi); const piHi = nHi / (nLo + nHi);
      for (const r of recs) {
        if (!r.featOk || !Number.isFinite(r.cz[f])) continue;
        const q = bq(r);
        if (q !== qLo && q !== qHi) continue;
        let e = byC.get(r.cluster);
        if (!e) { e = { n: 0, s: 0 }; byC.set(r.cluster, e); }
        e.n += 1;
        e.s += q === qHi ? ((r.hit ? 1 : 0) / piHi) : (-(r.hit ? 1 : 0) / piLo);
      }
      const dm = clusterMean([...byC.values()]);
      const pLo = ruleOut[f][split][qLo].pHat; const pHi = ruleOut[f][split][qHi].pHat;
      registerTest({
        id: `TREND-${f}-${split}`,
        family: split === 'train' ? 'วินิจฉัย (train)' : 'ยืนยัน (validation)',
        question: `④ข ความแม่นตกเมื่อ *คาดว่า* จะผันผวนแรง (${CZ_LABEL[f]}) · ${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H}`,
        estimate: pHi - pLo, ci: [NaN, NaN], p: dm.p, unit: 'pp',
        note: `คาดว่านิ่ง ${pctS(pLo)} → คาดว่าวิ่ง ${pctS(pHi)} · n=${nLo}+${nHi}`,
      });
    }
    // ลงทะเบียนเฉพาะสองกลุ่มปลาย = กฎที่ตัดสินใจได้จริง ("เทรดเฉพาะตอนคาดว่านิ่ง/วิ่ง")
    // ป้ายกำกับต้องตามทิศของตัวทำนาย ไม่ใช่ตามหมายเลขควอนไทล์ (ดู CZ_SIGN)
    const endLabels = CZ_SIGN[f] > 0
      ? [[0, qLabelLow(f)], [NQ - 1, qLabelHigh(f)]]
      : [[0, qLabelHigh(f)], [NQ - 1, qLabelLow(f)]];
    for (const [qi, label] of endLabels) {
      for (const split of SPLITS) {
        const row = ruleOut[f][split][qi];
        if (!row || !row.n) continue;
        registerTest({
          id: `RULE-${f}-Q${qi + 1}-${split}`,
          family: split === 'train' ? 'ใช้งาน (train)' : 'ยืนยัน (validation)',
          question: `④ เทรดเฉพาะ ${CZ_LABEL[f]} ${label} แล้วผลสุทธิต่างจากศูนย์ · ${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H}`,
          estimate: row.netEng, ci: [NaN, NaN], p: row.netP, unit: 'bps',
          note: `n=${row.n} · p̂=${pctS(row.pHat)} · p_w=${pctS(row.pW)} · p*=${pctS(row.pStar)}`,
        });
      }
    }
  }
  OUT.rules = ruleOut;

  // ════════════ ⑤ ปรับ "ขนาดไม้" แทนการปรับ SL/TP ════════════
  //
  // ทำไมทำอันนี้แทน SL/TP: การปรับ SL/TP เปลี่ยน "จุดออก" ซึ่งรอบก่อนกวาดไปแล้ว 72 ช่อง
  // ติดลบครบ 72 การเอาตัวทำนายขนาดมาคูณ multiplier คือเดินซ้ำรอยเดิมด้วยชื่อใหม่
  // ส่วนการปรับ **ขนาดไม้** ไม่แตะจุดออกเลย — เปลี่ยนแค่ว่าไม้ไหนมีน้ำหนักเท่าไรในพอร์ต
  // จึงเป็นคำถามใหม่จริง ๆ และเป็นสิ่งที่เทรดเดอร์ทำอยู่แล้วโดยธรรมชาติ
  //
  //   ก. เงินเท่ากันทุกไม้ (equal notional)  = ค่าเฉลี่ยของ (o − f)      ← ตัวตั้งต้น
  //   ข. เสี่ยงเท่ากันทุกไม้ (equal risk)     = ค่าเฉลี่ยของ (o − f)/ระยะSL  ← สิ่งที่ lab ใช้
  //   ค. น้ำหนัก ∝ 1/ความผันผวนที่คาด (causal)
  //   ง. น้ำหนัก ∝ 1/ความผันผวนที่คาด² (กดไม้ผันผวนแรงกว่าเดิมอีกชั้น)
  //   จ. น้ำหนัก ∝ ความผันผวนที่คาด (ตรงข้ามกับ ค. — ต้องวัด ไม่ใช่เดา)
  //
  // ⚠ สิ่งที่พบตอนวัดรอบแรก และต้องเขียนไว้ให้ชัด: **ข. กับ ค. เป็นวิธีเดียวกันเกือบเป๊ะ**
  //   เพราะระยะ SL = 1.5×ATR ดังนั้น 1/ระยะSL ∝ 1/ATR% และค่าเฉลี่ยถ่วงน้ำหนักไม่สนใจ
  //   การคูณน้ำหนักด้วยค่าคงที่ → "คิดเป็นหน่วย R" ที่ lab.mjs ใช้อยู่แล้ว **คือ**
  //   การปรับขนาดตามผกผันความผันผวนอยู่แล้ว ไม่ใช่คันโยกใหม่ที่ยังไม่ได้ดึง
  //   (ต่างกันเล็กน้อยเพราะ ATR ของ ค. วัดที่แท่งสัญญาณ ส่วน ข. วัดจากราคา SL ที่ปัดแล้ว
  //    เทียบกับ open ของแท่งเข้า)
  const sizingOut = {};
  for (const split of SPLITS) {
    const recs = split === 'train' ? trainRecs : valRecs;
    if (!recs.length) continue;
    const schemes = {};
    const mkAcc = (wfn) => {
      const byC = new Map();
      for (const r of recs) {
        const wt = wfn(r);
        if (!Number.isFinite(wt) || wt <= 0) continue;
        let e = byC.get(r.cluster);
        if (!e) { e = { w: 0, wx: 0, n: 0 }; byC.set(r.cluster, e); }
        e.w += wt; e.wx += wt * (r.engOut - r.fee); e.n++;
      }
      let Wt = 0; let WX = 0; const cl = [];
      for (const e of byC.values()) { Wt += e.w; WX += e.wx; }
      const mean = Wt ? WX / Wt : NaN;
      // SE แบบจับกลุ่มบนค่าเฉลี่ยถ่วงน้ำหนัก
      let v = 0;
      for (const e of byC.values()) { const u = e.wx - e.w * mean; v += u * u; cl.push(e); }
      const G = cl.length;
      const se = (G > 1 && Wt) ? Math.sqrt((v * G) / (G - 1)) / Wt : NaN;
      const z = se > 0 ? mean / se : NaN;
      return { mean, se, p: Number.isFinite(z) ? twoSidedP(z) : NaN, G, n: recs.length };
    };
    schemes.equalNotional = mkAcc(() => 1);
    // เสี่ยงเท่ากัน: น้ำหนัก ∝ 1/ระยะSL → ค่าเฉลี่ยกลายเป็นหน่วย R
    schemes.equalRisk = mkAcc((r) => (r.stopDistPct > 0 ? 1 / r.stopDistPct : NaN));
    schemes.invPredVol = mkAcc((r) => (r.featOk && r.cz.czAtrPct > 0 ? 1 / r.cz.czAtrPct : NaN));
    schemes.invPredVol2 = mkAcc((r) => (r.featOk && r.cz.czAtrPct > 0 ? 1 / (r.cz.czAtrPct ** 2) : NaN));
    schemes.propPredVol = mkAcc((r) => (r.featOk && r.cz.czAtrPct > 0 ? r.cz.czAtrPct : NaN));
    // หลักฐานว่า "เสี่ยงเท่ากัน" กับ "ผกผันความผันผวน" เป็นวิธีเดียวกัน: สหสัมพันธ์ของน้ำหนักสองชุด
    {
      const a = []; const b3 = [];
      for (const r of recs) {
        if (!(r.stopDistPct > 0) || !r.featOk || !(r.cz.czAtrPct > 0)) continue;
        a.push(1 / r.stopDistPct); b3.push(1 / r.cz.czAtrPct);
      }
      const ra = ranksOf(a); const rb = ranksOf(b3);
      let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
      for (let k = 0; k < ra.length; k++) { sx += ra[k]; sy += rb[k]; sxx += ra[k] * ra[k]; syy += rb[k] * rb[k]; sxy += ra[k] * rb[k]; }
      const m = ra.length;
      const cov = sxy / m - (sx / m) * (sy / m);
      const vx = sxx / m - (sx / m) ** 2; const vy = syy / m - (sy / m) ** 2;
      schemes.riskVsInvVolRankCorr = (vx > 0 && vy > 0) ? cov / Math.sqrt(vx * vy) : NaN;
    }
    sizingOut[split] = schemes;
    for (const [k, v] of Object.entries(schemes)) {
      if (!v || typeof v !== 'object') continue;   // riskVsInvVolRankCorr เป็นตัวเลข ไม่ใช่ผลทดสอบ
      registerTest({
        id: `SIZE-${k}-${split}`,
        family: split === 'train' ? 'ใช้งาน (train)' : 'ยืนยัน (validation)',
        question: `⑤ ปรับขนาดไม้แบบ "${k}" แล้วผลสุทธิต่างจากศูนย์ · ${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H}`,
        estimate: v.mean, ci: [NaN, NaN], p: v.p, unit: SIZE_UNIT[k], note: `กลุ่ม=${v.G}`,
      });
    }
  }
  OUT.sizing = sizingOut;

  applyHolm();
  OUT.tests = TESTS;
  OUT.spill = spillStat;
  OUT.touches = countTouches();
  OUT.datasets = datasets.map((d) => `${d.market}/${d.symbol}/${d.timeframe}`);
  OUT.dropped = dropped;
  // ถ้าโค้ดมาถึงบรรทัดนี้ได้ แปลว่าด่านตรวจตัวเองไม่เจออะไร (เจอเมื่อไรจะ exit ไปแล้ว)
  // บันทึกจำนวนช่องที่ตรวจจริง ไม่ใช่เขียนเลข 0 ทิ้งไว้เฉย ๆ ให้ดูเหมือนผ่าน
  OUT.selfCheck = {
    gates: ['ด1 คำนวณซ้ำเทียบทุกบิต', 'ด2 ตรวจข้ามช่อง', 'ด3 อัตลักษณ์ทางคณิตศาสตร์'],
    cellsChecked: cellMap.size + popStats.size,
    findings: 0,
  };
  OUT.elapsedMs = Date.now() - t0;

  OUT.provenance = buildProvenance({
    scriptPath: SCRIPT_PATH,
    root: ROOT,
    ledger: IN,
    argv: process.argv.slice(2),
    volatileFields: ['generatedAt', 'elapsedMs', 'opt.outDir', 'opt.rerunProbe', 'opt.determinismRuns', 'provenance', 'touches'],
    volatileReportLines: ['^สร้างโดย `scripts/research/experiments/fx-magnitude', '^ที่มา: sha', '^ใช้เวลา ', '^สมุดบันทึกการแตะ validation'],
  });

  writeReport({ OUT, cellMap, popStats, decomp, bucketOut, icOut, ruleOut, sizingOut, alt, meterRows, dropped, spillStat, t0 });

  fs.writeFileSync(path.join(OPT.outDir, 'exp-fx-magnitude.json'), `${JSON.stringify(OUT, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(OPT.outDir, 'exp-fx-magnitude.md'), `${LINES.join('\n')}\n`, 'utf8');
  console.log(`ที่มา: sha สคริปต์ ${OUT.provenance.scriptSha256.slice(0, 12)}`
    + ` · sha ขาเข้ารวม ${OUT.provenance.inputsDigest.slice(0, 12)} (${OUT.provenance.inputs.length} ไฟล์)`);
  console.log(`เขียน ${path.relative(ROOT, path.join(OPT.outDir, 'exp-fx-magnitude.md'))} แล้ว`
    + ` · ${((Date.now() - t0) / 1000).toFixed(1)} วิ`);
}

// ═══════════════════════════════ ตัวเขียนรายงาน ═══════════════════════════════

function writeReport(ctx) {
  const { OUT, cellMap, popStats, decomp, bucketOut, icOut, ruleOut, sizingOut, alt, meterRows, dropped, spillStat } = ctx;
  const prov = OUT.provenance;
  const P = (split) => cellMap.get(`${split}|${PRIMARY_MARKET}|${PRIMARY_TF}|${PRIMARY_H}`);

  W('# ปริศนาค่าเงิน: ผ่านเส้นความแม่นแล้ว ทำไมยังไม่ได้เงิน');
  W();
  W('สร้างโดย `scripts/research/experiments/fx-magnitude.mjs`');
  W(`ที่มา: sha สคริปต์ \`${prov.scriptSha256}\` · sha ขาเข้ารวม \`${prov.inputsDigest}\` (${prov.inputs.length} ไฟล์)`);
  W(`node ${prov.node} · ${prov.platform} · argv: \`${prov.argv.join(' ') || '(ไม่มี)'}\``);
  W(`ใช้เวลา ${(OUT.elapsedMs / 1000).toFixed(1)} วินาที`);
  W();
  W('> **จักรวาลของรายงานนี้** = จักรวาลที่เจ้าของเทรดจริง: ค่าเงิน (ตัวเอกของโจทย์) · ทอง · หุ้นไทย');
  W('> ไม่มีหุ้นสหรัฐและคริปโตในไฟล์นี้เลย แม้แต่เป็นตัวเทียบ');
  W();
  W('> ⚠ **ข้อมูลอนาคตอยู่ตรงไหน** — ทุกตัวเลขที่มีคำว่า "ขนาดจริง" (realMag) หรือควอนไทล์ของมัน');
  W('> อ่านราคาที่ยังไม่เกิด ณ เวลาตัดสินใจ ใช้ได้เฉพาะ **แบ่งกลุ่มเพื่อวินิจฉัยอาการ** เท่านั้น');
  W('> ⛔ ห้ามเอาไปสร้าง feature · ห้ามเป็นเงื่อนไขเข้าไม้ · ห้ามตั้งเกณฑ์คัดไม้จากมัน');
  W('> ทุกเกณฑ์ที่ใช้ตัดสินใจในหัวข้อ ④ และ ⑤ มาจากค่าที่ขึ้นต้นด้วย `cz` ซึ่งอ่านได้แค่ถึงแท่งสัญญาณ');
  W();

  // ── บทสรุป ──
  const tr = P('train'); const va = P('validation');
  W('## บทสรุปสั้น');
  W();
  W('### คำตอบของปริศนา');
  W();
  W('ปริศนาตั้งไว้ว่า "ความแม่น 52.1% ผ่านเส้นคุ้มทุน 51.8% แล้วแต่ยังขาดทุน"');
  W('**คำตอบคือ 52.1% ไม่ได้ผ่านเส้นอะไรเลย — เพราะมันเป็นคนละตัวเลขกับตัวที่ p\\* เป็นเส้นคุ้มทุนของมัน**');
  W();
  if (tr) {
    const S = tr.stats; const ci = tr.ci;
    W(`**${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H} · ชุด train · ${S.n} ไม้**`);
    W();
    W('| ตัวเลข | ค่า | หมายความว่า |');
    W('|---|---|---|');
    W(`| ความแม่นดิบ p̂ | ${pctS(S.pHat)} | นับหัวไม้ ไม่สนขนาด — **ตัวที่โจทย์เอาไปเทียบ** |`);
    W(`| เส้นคุ้มทุน p* | ${pctS(S.pStar)} | (E[f] − E[w]) ÷ E[s] |`);
    W(`| ความแม่นถ่วงขนาด p_w | **${pctS(S.pW)}** | **ตัวที่ p\\* เป็นเส้นคุ้มทุนของมันจริง ๆ** |`);
    W(`| p_w − p* | **${pctS(S.pW - S.pStar)}** [${pctS(ci.pWminusPStar[0])}, ${pctS(ci.pWminusPStar[1])}] | ติดลบ = ยังไม่ถึงเส้น |`);
    W(`| p_w − p̂ | ${pctS(S.pW - S.pHat)} [${pctS(ci.pWminusPHat[0])}, ${pctS(ci.pWminusPHat[1])}] | ระยะที่ตัวเลขผิดตัวหลอกไว้ |`);
    W(`| ผลจริง | **${bps(S.netEng)} bps/ไม้** | = E[s]·(p_w − p*) — เท่ากันเป๊ะ ไม่ใช่ประมาณ |`);
    W(`| ผลที่ p̂ ทำนายไว้ | ${bps(S.netBlind)} bps/ไม้ | = E[s]·(p̂ − p*) |`);
    W();
  }
  if (va) {
    const S = va.stats;
    W(`**และบน validation ปริศนาไม่เคยมีอยู่จริง** (${S.n} ไม้): p̂ = ${pctS(S.pHat)} · p_w = ${pctS(S.pW)}`);
    W(`· p* = ${pctS(S.pStar)} — **ทั้งสองตัวต่ำกว่าเส้นคุ้มทุน** ผลจริง ${bps(S.netEng)} bps/ไม้`);
    W('ที่ผ่านเส้นบน train แล้วไม่ผ่านบน validation คือรูปแบบปกติของการ overfit ไม่ใช่ปริศนา');
    W();
  }
  W('### สมมติฐานของ ceiling — วัดตรง ๆ แล้วไม่ผ่าน');
  W();
  W('สมมติฐาน: "ระบบไม่ได้ผิดแบบสุ่ม — มันถูกตอนราคานิ่ง และผิดตอนราคาวิ่ง"');
  W('วัดสามทางที่ตอบสมมติฐานนี้ตรง ๆ · **ไม่มีทางไหนผ่าน Holm เลย**');
  W();
  const sumTest = (id) => {
    const t = TESTS.find((x) => x.id === id);
    if (!t) return '—';
    const e = t.unit === 'pp' ? `${(t.estimate * 100).toFixed(2)} pp` : `${bps(t.estimate)} bps`;
    return `${e} (p=${pS(t.p)}${t.holmPass ? ' ✓' : ' ✗'})`;
  };
  W('| วิธีวัด | train | validation |');
  W('|---|---|---|');
  W(`| ① ความแม่นของไม้ขนาดใหญ่สุด 20% − เล็กสุด 20% (ขนาด**จริง**) | ${sumTest('Q5-Q1-hit-train')} | ${sumTest('Q5-Q1-hit-validation')} |`);
  W(`| ①ข ขนาดเดิมพันของไม้ที่ถูก − ของไม้ที่ผิด | ${sumTest('sB-hit-vs-miss-train')} | ${sumTest('sB-hit-vs-miss-validation')} |`);
  W(`| ④ข ความแม่น Q5 − Q1 ตามความผันผวนที่**คาด** (ATR%) | ${sumTest('TREND-czAtrPct-train')} | ${sumTest('TREND-czAtrPct-validation')} |`);
  W();
  // นับเครื่องหมายของแนวโน้มจากตัวเลขจริง ไม่ใช่พิมพ์ตัวเลขที่จำมา — ถ้าข้อมูลเปลี่ยน ประโยคต้องเปลี่ยนตาม
  const trendSigns = (split) => {
    const list = TESTS.filter((t) => t.id.startsWith('TREND-') && t.id.endsWith(`-${split}`));
    return { neg: list.filter((t) => t.estimate < 0).length, total: list.length };
  };
  const sgT = trendSigns('train'); const sgV = trendSigns('validation');
  W('สรุป: **ความแม่นของระบบไม่ขึ้นกับขนาดการเคลื่อนไหวอย่างที่สมมติฐานว่าไว้**');
  W(`บน train แนวโน้มติดลบ ${sgT.neg} จาก ${sgT.total} ตัวทำนาย (ถ้าไม่มีผลจริง คาดว่าราวครึ่งหนึ่ง)`);
  W(`บน validation ติดลบ ${sgV.neg} จาก ${sgV.total} — เครื่องหมายไปทางเดียวกันหมด แต่ไม่มีตัวไหน`);
  W('มีนัยสำคัญเดี่ยว ๆ และตัวทำนายเหล่านี้สัมพันธ์กันเองสูงมาก จึงไม่ใช่หลักฐานอิสระหลายชิ้น');
  W('อ่านว่า "ยังไม่พบ" ไม่ใช่ "พิสูจน์แล้วว่าไม่มี" — ขนาดตัวอย่าง validation (1326 ไม้) เล็กเกินจะแยกได้');
  W();
  W('---');
  W();

  // ── ต0 · ตรวจเครื่องวัด ──
  W('## ต0 · ตรวจเครื่องวัด — โค้ดในไฟล์นี้เข้าใจกติกาตรงกับ exp-ceiling ไหม');
  W();
  W('ไฟล์นี้เขียนเรขาคณิต SL/TP · โมเดลต้นทุน · การเดินหน้าต่างถือ ขึ้นมาใหม่ทั้งหมด');
  W('ถ้าเข้าใจไม่ตรงกับ ceiling ตัวเลขทุกตัวข้างล่างก็เชื่อไม่ได้ จึงคำนวณ "ช่องประชากร"');
  W('(ทุกแท่งที่เข้าไม้ได้ ไม่ใช่เฉพาะแท่งที่เครื่องยนต์เข้า) ด้วยนิยามเดียวกัน แล้วเทียบทุกบิต');
  W();
  const exact = meterRows.filter((r) => r.exact).length;
  W(`เทียบได้ **${meterRows.length}** ช่อง (FOREX + GOLD × 1D/1H × H1/5/10/20 × train/validation)`);
  W(`ตรงกันทุกบิต **${exact}/${meterRows.length}** ช่อง`);
  W();
  if (meterRows.length) {
    W('| ช่อง | n (ที่นี่) | n (ceiling) | Δ E[c] | Δ E[w] | Δ E[f] | Δ p* | ตรงทุกบิต |');
    W('|---|---|---|---|---|---|---|---|');
    for (const r of meterRows) {
      W(`| ${r.cell} | ${r.nMine} | ${r.nTheirs} | ${r.dCorrect.toExponential(1)} | ${r.dWrong.toExponential(1)}`
        + ` | ${r.dFee.toExponential(1)} | ${r.dPStar.toExponential(1)} | ${r.exact ? '✓' : '✗'} |`);
    }
    W();
  } else {
    W('_ไม่พบ exp-ceiling.json ในโฟลเดอร์รายงาน — ข้ามการตรวจนี้ (ตัวเลขข้างล่างจึงยังไม่ถูกสอบเทียบ)_');
    W();
  }

  W('### ด่านตรวจตัวเอง — และหลักฐานว่ามันมีฟันจริง');
  W();
  W('ทุกรอบที่รัน ไฟล์นี้ตรวจตัวเอง 3 ด่านก่อนพิมพ์อะไรออกมา ถ้าด่านไหนติด = หยุดทั้งรอบ');
  W('ไม่พิมพ์ตัวเลขใด ๆ (โรคที่รักษา: combine.mjs เคยเขียนค่าของช่องหนึ่งลงในสล็อตของอีกช่อง');
  W('ระดับหน่วยความจำ 1 ใน 75 รอบ โดยไม่มี error แล้วพิมพ์ 194.79 bps ออกมาแทนค่าจริง 0.32)');
  W();
  W('· **ด1** คำนวณสถิติของทุกช่องสองรอบจากผลรวมชุดเดิม แล้วเทียบทุกบิต');
  W('· **ด2** ตรวจข้ามช่อง — สองช่องที่จำนวนไม้ต่างกัน ห้ามมีค่าเฉลี่ยตรงกันทุกบิต');
  W('· **ด3** ตรวจอัตลักษณ์ E[o] = E[w] + E[s]·p_w ทั้งสองกรอบ + ขอบเขตของ p_w กรอบ B ใน [0,1]');
  W();
  const st = OUT.selfTest;
  if (!st) {
    W('> ⚠ **ยังไม่มีใบรับรองว่าด่านมีฟัน** — ด่านที่ไม่เคยยิง กับด่านที่ยิงไม่ได้ ดูเหมือนกันทุกประการ');
    W('> สั่ง `node scripts/research/experiments/fx-magnitude.mjs --self-test` ก่อนเชื่อ');
  } else if (!st.scriptMatches) {
    W('> ⚠ **ใบรับรองเป็นของโค้ดคนละรุ่น** (`' + String(st.scriptSha256).slice(0, 12) + '`');
    W('> ขณะที่โค้ดบนดิสก์คือ `' + prov.scriptSha256.slice(0, 12) + '`) → ต้องทดสอบใหม่');
  } else {
    W('พิสูจน์ด้วยการ**ป้อนความผิดพลาดเข้าไปเอง**บนสำเนาชั่วคราว (`--self-test`)');
    W();
    W('| กรณี | ความผิดพลาดที่ป้อน | ด่านฟ้อง | ด1 | ด2 | ด3 | ผลที่ต้องได้ |');
    W('|---|---|---|---|---|---|---|');
    const CASE_DESC = {
      ควบคุม: 'ไม่แก้อะไรเลย', ก1: 'คำนวณซ้ำได้คนละคำตอบ (1 ใน 7)',
      ก2: 'ผลรวมของช่องหนึ่งไปโผล่ในอีกช่อง', ก3: 'ตัวเลขถูกเขียนทับหลังคำนวณเสร็จ',
    };
    for (const [name, r] of Object.entries(st.cases)) {
      W(`| ${name} | ${CASE_DESC[name] ?? ''} | ${r.findings} | ${r.byGate['ด1']} | ${r.byGate['ด2']}`
        + ` | ${r.byGate['ด3']} | ${name === 'ควบคุม' ? '0 (ห้ามฟ้อง)' : '> 0 (ต้องจับได้)'} |`);
    }
    W();
    W(`ผล: **${st.verdict ? 'ผ่าน' : 'ไม่ผ่าน'}** — ${st.note}`);
  }
  W();
  W('### ด่านกันการล้ำข้ามเส้นแบ่ง split');
  W();
  W('หน้าต่างถือของไม้ที่เข้าใกล้ปลาย split จะกินแท่งของ split ถัดไป ซึ่งสำหรับ validation');
  W('แปลว่ากินแท่งของ **ชุด test** ไฟล์นี้เลือกวิธีเดียวกับ `feat-cross.mjs` และ `ceiling.mjs`');
  W('หลังแก้ คือ **ทิ้งไม้ทั้งไม้** ไม่ใช่ตัดหน้าต่างให้สั้นลง (ไม้ที่ถูกบังคับปิดก่อนกำหนด');
  W('ไม่ใช่ไม้ H แท่ง เอาไปเฉลี่ยรวมช่องเดียวกันไม่ได้)');
  W();
  W(`ไม้ของเครื่องยนต์ทุกตลาดรวมกันที่ H=${PRIMARY_H}: เก็บไว้ **${spillStat.kept}** · ทิ้งเพราะล้ำเส้นแบ่ง **${spillStat.dropped}**`);
  W();
  W('#### ใบรับรองการพิสูจน์ (สั่งสร้างใหม่ได้ด้วย `--prove-no-leak`)');
  W();
  const pf = OUT.leakProof;
  if (!pf) {
    W('> ⚠ **ยังไม่มีใบรับรอง** — ตัวเลขในรายงานนี้ยังไม่ผ่านการพิสูจน์ด้วยการตัดข้อมูลท้ายทิ้งจริง');
    W('> สั่ง `node scripts/research/experiments/fx-magnitude.mjs --prove-no-leak` ก่อนเชื่อ');
  } else if (!pf.scriptMatches) {
    W('> ⚠ **ใบรับรองเป็นของโค้ดคนละรุ่น** — พิสูจน์ไว้กับ sha `' + String(pf.scriptSha256).slice(0, 12) + '`');
    W('> แต่โค้ดบนดิสก์ตอนนี้คือ `' + prov.scriptSha256.slice(0, 12) + '` → ใบรับรองใช้ไม่ได้ ต้องพิสูจน์ใหม่');
  } else {
    W(`ลบแท่งชุด test ทิ้งจากดิสก์จริง **${pf.barsRemoved.toLocaleString('en-US')}** แท่ง`
      + ` (เหลือ ${pf.barsKept.toLocaleString('en-US')} แท่ง จาก ${pf.filesTruncated} ไฟล์) แล้วคำนวณซ้ำ`);
    W();
    W('| การเปรียบเทียบ | ช่องเครื่องยนต์ | ช่องประชากร | การทดสอบ | ต้องได้ |');
    W('|---|---|---|---|---|');
    W(`| หลังลบชุด test ทิ้งจริง | ${pf.vsCut.cells.diff}/${pf.vsCut.cells.n}`
      + ` | ${pf.vsCut.population.diff}/${pf.vsCut.population.n}`
      + ` | ${pf.vsCut.tests.diff}/${pf.vsCut.tests.n} | **0 ทุกช่อง** |`);
    W(`| เปิดโหมด \`--keep-spill\` (ปล่อยให้ล้ำ) | ${pf.vsSpill.cells.diff}/${pf.vsSpill.cells.n}`
      + ` | ${pf.vsSpill.population.diff}/${pf.vsSpill.population.n}`
      + ` | ${pf.vsSpill.tests.diff}/${pf.vsSpill.tests.n} | **มากกว่า 0** (ไม่งั้นด่านไม่มีฟัน) |`);
    W();
    W(`ชุดข้อมูลที่หายไปเมื่อลบชุด test ทิ้ง: ${pf.datasetsGone.join(' · ') || '(ไม่มี)'}`);
    W('(ชุดพวกนี้มีแต่แท่งของยุค test เท่านั้น จึงไม่เคยมีไม้ใน train/validation อยู่แล้ว —');
    W('ยืนยันได้จากตัวเลขในตาราง: ไม่มีช่องไหนเปลี่ยนค่าเลยเมื่อมันหายไป)');
    W();
    W(`ผล: **${pf.verdict ? 'ผ่าน' : 'ไม่ผ่าน'}** — ${pf.note}`);
  }
  W();

  // ── ① ควอนไทล์ของขนาดจริง ──
  W('---');
  W();
  W('## ① แยกไม้ตามขนาดการเคลื่อนไหวจริง แล้วความแม่นเป็นยังไง');
  W();
  W('> ⚠ **ORACLE — วินิจฉัยเท่านั้น** การแบ่งกลุ่มนี้ใช้ราคาที่ยังไม่เกิด ณ เวลาตัดสินใจ');
  W('> ห้ามเอาไปสร้าง feature หรือเงื่อนไขเข้าไม้ ไม่ว่ากรณีใด');
  W();
  W('แบ่งไม้ของเครื่องยนต์เป็น 5 กลุ่มเท่า ๆ กัน ตาม |ราคาเคลื่อนสุทธิ| ในหน้าต่างถือ');
  W();
  for (const split of SPLITS) {
    const bs = bucketOut[split];
    if (!bs) continue;
    W(`**ชุด ${split}** · ${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H}`);
    W();
    W('| กลุ่ม | ขนาดจริง | n | ความแม่น p̂ | ความแม่นถ่วง p_w | p* | E[s] (bps) | ผลจริง (bps) |');
    W('|---|---|---|---|---|---|---|---|');
    for (const b of bs) {
      const range = b.q === NQ ? `> ${pctS(b.lo, 3)}` : `≤ ${pctS(b.hi, 3)}`;
      W(`| Q${b.q} | ${range} | ${b.n} | ${pctS(b.pHat)} | ${pctS(b.pW)} | ${pctS(b.pStar)}`
        + ` | ${bps(b.meanS)} | ${bps(b.netEng)} |`);
    }
    W();
  }

  W('### ①ข รูปที่ตรงที่สุดของสมมติฐาน: "ไม้ที่ถูกตัวเล็ก ไม้ที่ผิดตัวใหญ่" จริงไหม');
  W();
  W('ควอนไทล์ตอบได้แค่หยาบ ๆ ตัวเลขที่ตอบตรงที่สุดคือเทียบขนาดเดิมพันของไม้ที่ทายถูก');
  W('กับไม้ที่ทายผิด ตรง ๆ · ถ้า E[s | ถูก] < E[s | ผิด] = สมมติฐานถูก · ถ้าเท่ากัน = ต้องหาคำอธิบายอื่น');
  W();
  W('| ชุด | ตลาด | กรอบเวลา | E[sᴮ \\| ถูก] | E[sᴮ \\| ผิด] | อัตราส่วน | E[ขนาดจริง \\| ถูก] | E[ขนาดจริง \\| ผิด] | อัตราส่วน |');
  W('|---|---|---|---|---|---|---|---|---|');
  for (const split of SPLITS) {
    for (const mk of MARKETS) {
      for (const tf of TIMEFRAMES) {
        const e = ctx.OUT.hitMag?.[split]?.[`${mk}|${tf}`];
        if (!e) continue;
        W(`| ${split} | ${mk} | ${tf} | ${bps(e.sBHit)} | ${bps(e.sBMiss)} | ${numS(e.sBRatio, 3)}`
          + ` | ${pctS(e.magHit, 3)} | ${pctS(e.magMiss, 3)} | ${numS(e.magRatio, 3)} |`);
      }
    }
  }
  W();
  W('(sᴮ = ส่วนต่างเดิมพันกรอบ B = ผลของฝั่งที่จ่าย − ผลของฝั่งที่ไม่จ่าย · หน่วย bps)');
  W();

  // ── ② p_w ──
  W('---');
  W();
  W('## ② ความแม่นแบบถ่วงขนาด (p_w) — ตัวที่ p* เป็นเส้นคุ้มทุนของมันจริง ๆ');
  W();
  W('```');
  W('o_i = w_i + h_i·s_i           s_i = c_i − w_i');
  W('E[o] = E[w] + E[s]·p_w        p_w = Σ h_i·s_i ÷ Σ s_i');
  W('คุ้มทุน ⇔ p_w ≥ (E[f] − E[w]) ÷ E[s] = p*');
  W('```');
  W();
  W('เอา p̂ ไปเทียบ p* ถูกต้องเฉพาะเมื่อ h_i เป็นอิสระจาก s_i — ซึ่งไม่มีใครเคยตรวจ');
  W();
  W('### กรอบ A · "ทายทิศของการเคลื่อนไหวสุทธิ" (กรอบเดียวกับ exp-ceiling)');
  W();
  W('| ชุด | ตลาด | กรอบเวลา | n | p̂ | p_w | p* | p_w − p* [CI95] | ผลจริง (bps) | ภาษีการเลือกขนาด (bps) |');
  W('|---|---|---|---|---|---|---|---|---|---|');
  for (const split of SPLITS) {
    for (const mk of MARKETS) {
      for (const tf of TIMEFRAMES) {
        const cell = cellMap.get(`${split}|${mk}|${tf}|${PRIMARY_H}`);
        if (!cell) continue;
        const S = cell.stats; const ci = cell.ci;
        W(`| ${split} | ${mk} | ${tf} | ${S.n} | ${pctS(S.pHat)} | ${pctS(S.pW)} | ${pctS(S.pStar)}`
          + ` | ${pctS(S.pW - S.pStar)} [${pctS(ci.pWminusPStar[0])}, ${pctS(ci.pWminusPStar[1])}]`
          + ` | ${bps(S.netEng)} | ${bps(S.netEng - S.netBlind)} |`);
      }
    }
  }
  W();
  W('### กรอบ B · "ทายว่าฝั่งไหนจ่าย" (น้ำหนักไม่มีทางติดลบ)');
  W();
  W('| ชุด | ตลาด | กรอบเวลา | n | p̂ᴮ | p_wᴮ | p*ᴮ | p_wᴮ − p*ᴮ [CI95] |');
  W('|---|---|---|---|---|---|---|---|');
  for (const split of SPLITS) {
    for (const mk of MARKETS) {
      for (const tf of TIMEFRAMES) {
        const cell = cellMap.get(`${split}|${mk}|${tf}|${PRIMARY_H}`);
        if (!cell) continue;
        const S = cell.stats; const ci = cell.ci;
        W(`| ${split} | ${mk} | ${tf} | ${S.n} | ${pctS(S.pHatB)} | ${pctS(S.pWB)} | ${pctS(S.pStarB)}`
          + ` | ${pctS(S.pWB - S.pStarB)} [${pctS(ci.pWBminusPStarB[0])}, ${pctS(ci.pWBminusPStarB[1])}] |`);
      }
    }
  }
  W();
  W('### แยกช่องว่าง p_w − p̂ เป็น "ภายในสัญลักษณ์" กับ "ระหว่างสัญลักษณ์"');
  W();
  W('ถ้าช่องว่างมาจาก **ภายใน** = ระบบเลือกขนาดผิดในคู่เงินเดียวกัน (สมมติฐานเดิม)');
  W('ถ้ามาจาก **ระหว่าง** = ระบบไปกระจุกอยู่ในคู่ที่เดิมพันใหญ่ (คนละโรค คนละยา)');
  W();
  W('| ชุด | กรอบ | p_w − p̂ | ภายในสัญลักษณ์ | ระหว่างสัญลักษณ์ |');
  W('|---|---|---|---|---|');
  for (const split of SPLITS) {
    const d = decomp[split];
    if (!d) continue;
    for (const [fr, obj] of [['A', d.frameA], ['B', d.frameB]]) {
      if (!obj) continue;
      W(`| ${split} | ${fr} | ${pctS(obj.gap)} | ${pctS(obj.within)} | ${pctS(obj.between)} |`);
    }
  }
  W();

  // ── คำอธิบายทางเลือก ──
  W('### คำอธิบายทางเลือก (เผื่อสมมติฐาน "ผิดตอนราคาวิ่ง" ไม่ใช่ตัวการ)');
  W();
  W('| ตัวเลข | train | validation | อ่านยังไง |');
  W('|---|---|---|---|');
  const A = alt.train ?? {}; const B = alt.validation ?? {};
  const row = (label, k, fmt, how) => W(`| ${label} | ${fmt(A[k])} | ${fmt(B[k])} | ${how} |`);
  row('ค่าธรรมเนียมเฉลี่ยของไม้ที่เครื่องยนต์เลือก', 'feeEngine', (v) => bps(v), 'bps');
  row('ค่าธรรมเนียมเฉลี่ยของทุกแท่ง', 'feePopulation', (v) => bps(v), 'bps');
  row('อัตราส่วน (เครื่องยนต์ ÷ ประชากร)', 'feeRatio', (v) => numS(v, 4), '> 1 = เลือกไม้ที่แพงกว่า');
  row('p* บนแท่งที่เครื่องยนต์เข้า', 'pStarEngineBars', (v) => pctS(v), '');
  row('p* บนทุกแท่ง', 'pStarAllBars', (v) => pctS(v), 'ต่างกัน = เลือกจังหวะที่เดิมพันต่างจากค่าเฉลี่ย');
  row('สัดส่วนไม้ฝั่ง long', 'longShare', (v) => pctS(v), '');
  row('ความแม่นฝั่ง long', 'longHit', (v) => pctS(v), '');
  row('ความแม่นฝั่ง short', 'shortHit', (v) => pctS(v), 'ต่างกันมาก = ไม่สมมาตร');
  row('ผลสุทธิฝั่ง long (bps)', 'longNet', (v) => bps(v), '');
  row('ผลสุทธิฝั่ง short (bps)', 'shortNet', (v) => bps(v), '');
  row('สัดส่วนไม้ที่ s < 0 (กรอบ A)', 'negSShare', (v) => pctS(v), 'ทายทิศถูกแต่แพ้ทายผิด');
  row('สัดส่วนน้ำหนัก |s| ที่ติดลบ', 'negSWeightShare', (v) => pctS(v), 'ยิ่งมาก กรอบ A ยิ่งใช้ไม่ได้');
  W();

  // ── ③ IC ──
  W('---');
  W();
  W('## ③ อะไรทำนาย "ขนาด" ได้ (ตัวที่มองเห็นจริง ณ เวลาตัดสินใจ)');
  W();
  W('Spearman ρ ระหว่างตัวทำนาย (อ่านได้ถึงแท่งสัญญาณ) กับสามเป้าหมาย');
  W(`ช่วงความเชื่อมั่นจาก bootstrap แบบสุ่มกลุ่ม (สัญลักษณ์ × เดือน) B=${OPT.bootstrap} · พื้นของ p = ${(1 / OPT.bootstrap).toFixed(5)}`);
  W();
  for (const split of SPLITS) {
    const ic = icOut[split];
    if (!ic) continue;
    W(`**ชุด ${split}** · ${PRIMARY_MARKET} ${PRIMARY_TF} H${PRIMARY_H}`);
    W();
    W('| ตัวทำนาย | ρ กับ ขนาดจริง | ρ กับ ส่วนต่างเดิมพัน (B) | ρ กับ ทายถูกไหม |');
    W('|---|---|---|---|');
    for (const f of CZ_NAMES) {
      const e = ic[f];
      if (!e) continue;
      const c = (o) => (o ? `${numS(o.rho, 4)} [${numS(o.ci[0], 3)}, ${numS(o.ci[1], 3)}]` : '—');
      W(`| ${CZ_LABEL[f]} | ${c(e.vsRealMag)} | ${c(e.vsSpreadB)} | ${c(e.vsHit)} |`);
    }
    W();
  }

  // ── ④ กฎคัดไม้ ──
  W('---');
  W();
  W('## ④ เอาไปใช้จริงได้ไหม — คัดไม้ตามขนาดที่ "คาด"');
  W();
  W('เกณฑ์ควอนไทล์ทั้งหมดคำนวณจาก **train เท่านั้น** แล้วแช่แข็ง เอาไปใช้กับ validation ตรง ๆ');
  W('(ถ้าคำนวณเกณฑ์ใหม่บน validation = ใช้ validation ตัดสิน = ปนเปื้อน)');
  W();
  W('> ⚠ ข้อควรระวังที่ตั้งไว้ก่อนวัด: ถ้าระบบผิดตอนราคาวิ่งจริง การเลือกเทรดเฉพาะตอน');
  W('> คาดว่าวิ่งแรงจะทำให้ **แย่ลง** ไม่ใช่ดีขึ้น — ตัวเลขข้างล่างคือคำตอบ ไม่ใช่การเดา');
  W();
  for (const f of CZ_NAMES) {
    const r = ruleOut[f];
    if (!r) continue;
    W(`**${CZ_LABEL[f]}**`);
    W();
    W('| กลุ่ม | n | E[s] (bps) | p* | p̂ | p_w | ผลจริง (bps) | ‖ | n | E[s] (bps) | p* | p̂ | p_w | ผลจริง (bps) |');
    W('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    W('| | **train** | | | | | | ‖ | **validation** | | | | | |');
    for (let q = 0; q < NQ; q++) {
      const t2 = r.train[q]; const v2 = r.validation[q];
      const cols = (x) => `${x?.n ?? 0} | ${bps(x?.meanS)} | ${pctS(x?.pStar)} | ${pctS(x?.pHat)}`
        + ` | ${pctS(x?.pW)} | ${bps(x?.netEng)}`;
      W(`| Q${q + 1} | ${cols(t2)} | ‖ | ${cols(v2)} |`);
    }
    W();
  }
  W('อ่านตารางนี้ยังไง: ตัวทำนายความผันผวนทำให้ **E[s] โตจาก Q1 ไป Q5 อย่างชัดเจน**');
  W('ซึ่งเป็นสิ่งที่หัวข้อ ③ พิสูจน์ไว้แล้ว แต่ p\\* กลับ**ไม่**ตกตามที่เลขคาดไว้เท่าไร');
  W('เพราะ E[w] (ผลของการทายผิด) ก็ติดลบมากขึ้นตามความผันผวนไปด้วย');
  W('ผลสุทธิจึงขึ้นกับว่า p̂ ขยับไปทางไหน — ดูตาราง ④ข ในบัญชีการทดสอบข้างล่าง');
  W();
  W('### ④ข ความแม่นตกไหมเมื่อ *คาดว่า* จะผันผวนแรง (รูปที่ใช้ตัดสินใจได้จริง)');
  W();
  W('นี่คือรูปเดียวของสมมติฐาน ceiling ที่เอาไปใช้ได้ เพราะแบ่งกลุ่มด้วยค่าที่มองเห็น ณ เวลาตัดสินใจ');
  W();
  W('ทุกแถวจัดทิศให้ตรงกันแล้ว: ซ้าย = กลุ่มที่ *คาดว่านิ่งที่สุด* · ขวา = *คาดว่าวิ่งแรงที่สุด*');
  W('(ตัว "ค่าธรรมเนียม ÷ ATR%" วิ่งสวนทางกับตัวอื่น จึงถูกกลับทิศก่อนนับ — ดู `CZ_SIGN` ในโค้ด)');
  W();
  W('| ตัวทำนาย | train: นิ่ง → วิ่ง | Δ | p | validation: นิ่ง → วิ่ง | Δ | p |');
  W('|---|---|---|---|---|---|---|');
  for (const f of CZ_NAMES) {
    const tT = TESTS.find((t) => t.id === `TREND-${f}-train`);
    const tV = TESTS.find((t) => t.id === `TREND-${f}-validation`);
    if (!tT && !tV) continue;
    const qHi = CZ_SIGN[f] > 0 ? NQ - 1 : 0;
    const qLo = CZ_SIGN[f] > 0 ? 0 : NQ - 1;
    const cell = (t, r2) => (t && r2
      ? `${pctS(r2[qLo].pHat)} → ${pctS(r2[qHi].pHat)} | ${(t.estimate * 100).toFixed(2)} pp | ${pS(t.p)}`
      : '— | — | —');
    W(`| ${CZ_LABEL[f]} | ${cell(tT, ruleOut[f]?.train)} | ${cell(tV, ruleOut[f]?.validation)} |`);
  }
  W();

  // ── ⑤ ขนาดไม้ ──
  W('---');
  W();
  W('## ⑤ ปรับ "ขนาดไม้" แทนการปรับ SL/TP');
  W();
  W('ทำไมไม่ปรับ SL/TP: รอบก่อนกวาดไปแล้ว 72 ช่อง ติดลบครบ 72 การเอาตัวทำนายขนาด');
  W('มาคูณ multiplier คือเดินซ้ำรอยเดิมด้วยชื่อใหม่ ส่วนการปรับขนาดไม้ไม่แตะจุดออกเลย');
  W();
  W('| วิธี | หน่วย | ผล train | p (train) | ผล validation | p (val) |');
  W('|---|---|---|---|---|---|');
  for (const k of Object.keys(SIZE_LABEL)) {
    const a = sizingOut.train?.[k]; const b2 = sizingOut.validation?.[k];
    const fmt = (v) => (SIZE_UNIT[k] === 'R' ? numS(v, 5) : bps(v));
    W(`| ${SIZE_LABEL[k]} | ${SIZE_UNIT[k]} | ${fmt(a?.mean)} | ${pS(a?.p)} | ${fmt(b2?.mean)} | ${pS(b2?.p)} |`);
  }
  W();
  W('> **สิ่งที่พบระหว่างวัด และเปลี่ยนความหมายของตารางนี้:**');
  W('> "เสี่ยงเท่ากันทุกไม้" กับ "น้ำหนัก ∝ 1/ATR%" เป็นวิธีเดียวกันเกือบเป๊ะ เพราะระยะ SL = 1.5×ATR');
  W('> ทำให้ 1/ระยะSL ∝ 1/ATR% และค่าเฉลี่ยถ่วงน้ำหนักไม่สนใจการคูณด้วยค่าคงที่');
  W(`> สหสัมพันธ์อันดับของน้ำหนักสองชุด: train ${numS(sizingOut.train?.riskVsInvVolRankCorr, 4)}`
    + ` · validation ${numS(sizingOut.validation?.riskVsInvVolRankCorr, 4)}`);
  W('>');
  W('> แปลว่า **การคิดผลเป็นหน่วย R ที่ lab.mjs ทำอยู่แล้ว คือการปรับขนาดตามผกผันความผันผวนอยู่แล้ว**');
  W('> ไม่ใช่คันโยกใหม่ที่ยังไม่ได้ดึง — คันโยกนี้ถูกดึงไปแล้วตั้งแต่ต้น และผลก็ยังติดลบ');
  W();

  // ── บัญชีการทดสอบ ──
  W('---');
  W();
  W('## บัญชีการเปรียบเทียบทั้งหมด (Holm ภายในตระกูล)');
  W();
  W(`ลงทะเบียนไว้ **${TESTS.length}** ข้อ — นับทุกข้อที่ถาม ไม่ใช่เฉพาะข้อที่ตอบว่าใช่`);
  W();
  W('> ⚠ **อ่านคอลัมน์ "ผ่าน" ให้ถูก** — ทุกข้อเป็นการทดสอบ **สองหาง** ว่า "ต่างจากศูนย์ไหม"');
  W('> เครื่องหมาย ✓ จึงแปลว่า "ต่างจากศูนย์อย่างมีนัยสำคัญ" **ไม่ได้แปลว่าดี**');
  W('> ถ้าค่าที่วัดได้ติดลบแล้ว ✓ = พิสูจน์แล้วว่า**ขาดทุนจริง** ไม่ใช่กำไร');
  W('> คอลัมน์ "ทิศ" ข้างล่างบอกไว้แล้วว่าข้อไหนเป็นแบบไหน');
  W();
  {
    const sig = TESTS.filter((t) => t.holmPass && ['bps', 'R'].includes(t.unit));
    const win = sig.filter((t) => t.estimate > 0).length;
    const lose = sig.filter((t) => t.estimate < 0).length;
    W(`สรุปเฉพาะข้อที่วัด "เงิน" และผ่าน Holm: **กำไร ${win} ข้อ · ขาดทุน ${lose} ข้อ**`);
    W();
  }
  const fams = [...new Set(TESTS.map((t) => t.family))].sort((a, b2) => (a < b2 ? -1 : a > b2 ? 1 : 0));
  for (const fam of fams) {
    const list = TESTS.filter((t) => t.family === fam);
    const pass = list.filter((t) => t.holmPass).length;
    W(`### ${fam} — ${list.length} ข้อ · ผ่าน Holm ${pass} ข้อ`);
    W();
    W('| # | คำถาม | ค่าที่วัดได้ | ทิศ | p | เกณฑ์ Holm | ผ่าน | หมายเหตุ |');
    W('|---|---|---|---|---|---|---|---|');
    for (const t of list) {
      // หน่วยมาจากตัว registerTest เอง ห้ามเดาจากขนาดตัวเลข
      const est = t.unit === 'bps' ? `${bps(t.estimate)} bps`
        : t.unit === 'pp' ? `${(t.estimate * 100).toFixed(2)} pp`
          : t.unit === 'R' ? `${numS(t.estimate, 5)} R`
            : numS(t.estimate, 4);
      // ⚠ ทุกข้อเป็นการทดสอบสองหาง ✓ = "ต่างจากศูนย์" ไม่ใช่ "ดี"
      //   ถ้าไม่มีคอลัมน์นี้ ข้อที่ขาดทุนอย่างมีนัยสำคัญจะอ่านเหมือนข้อที่ทำเงินได้
      const money = ['bps', 'R'].includes(t.unit);
      const dir = !Number.isFinite(t.estimate) ? '—'
        : money
          ? (t.estimate > 0 ? 'กำไร' : t.estimate < 0 ? '**ขาดทุน**' : 'ศูนย์')
          : (t.estimate > 0 ? 'บวก' : t.estimate < 0 ? 'ลบ' : 'ศูนย์');
      W(`| ${t.idx} | ${t.question} | ${est} | ${dir} | ${pS(t.p)} | ${pS(t.holmThreshold)}`
        + ` | ${t.holmPass ? '✓' : '✗'} | ${t.note} |`);
    }
    W();
  }

  // ── ข้อสรุปที่ตัดสินใจได้ ──
  W('---');
  W();
  W('## ข้อสรุปที่ตัดสินใจได้ (อยู่ในสามตลาดที่เจ้าของเทรดเท่านั้น)');
  W();
  W('**1. ปริศนาปิดแล้ว และคำตอบคือ "ไม่เคยมีปริศนา"**');
  W('ตัวเลข 52.1% ที่ว่า "ผ่านเส้น" เป็นความแม่นดิบ ซึ่งไม่ใช่ตัวที่ p\\* เป็นเส้นคุ้มทุนของมัน');
  W('ตัวที่ใช่คือ p_w และมันต่ำกว่าเส้น อัตลักษณ์ที่ปิดช่องว่างนี้เป็นสมการที่เท่ากันเป๊ะ');
  W('ไม่ใช่การประมาณ และตรวจซ้ำอัตโนมัติทุกรอบในด่าน ด3');
  W();
  W('**2. สมมติฐาน "ถูกตอนนิ่ง ผิดตอนวิ่ง" ยังไม่พบหลักฐาน**');
  W('วัดสามทาง (ควอนไทล์ของขนาดจริง · ขนาดเดิมพันของไม้ถูก vs ผิด · แนวโน้มตามความผันผวนที่คาด)');
  W('ไม่มีทางไหนผ่าน Holm ทั้ง train และ validation');
  W('ที่น่าสนใจคือหุ้นไทยให้ผล **ตรงข้าม** กับสมมติฐาน (p_w > p̂ = ชนะไม้ใหญ่)');
  W('แต่ก็ยังขาดทุนหนักที่สุด เพราะ p\\* สูงถึง 59–79% ซึ่งเป็นกำแพงค่าธรรมเนียม ไม่ใช่เรื่องขนาด');
  W();
  W('**3. "ขนาด" ทำนายได้จริงและยืนยันบน validation แต่เอาไปทำเงินไม่ได้**');
  W('ρ ≈ 0.28–0.30 กับขนาดจริง และ ≈ 0.35–0.41 กับส่วนต่างเดิมพัน ทั้งบน train และ validation');
  W('ขณะที่ ρ กับ "ทายถูกไหม" ≈ 0 ทุกตัว — **ขนาดทำนายได้ ทิศทำนายไม่ได้** ตรงตามตำรา');
  W('แต่กฎที่สร้างจากมันติดลบทุกกลุ่มบน validation ยกเว้นกลุ่ม "คาดว่านิ่ง" ที่บวกเฉียดศูนย์');
  W('และไม่มีข้อไหนผ่าน Holm');
  W();
  W('**4. คันโยก "ปรับขนาดไม้ตามความผันผวน" ถูกดึงไปแล้วตั้งแต่ต้น**');
  W('การคิดผลเป็นหน่วย R (ซึ่ง lab.mjs และเครื่องยนต์จริงใช้อยู่) เท่ากับการถ่วงด้วย 1/ATR อยู่แล้ว');
  W('(สหสัมพันธ์อันดับของน้ำหนัก 0.9998–0.9999) จึงไม่ใช่ทางเลือกใหม่ที่ยังไม่ได้ลอง');
  W();
  W('### ภาษีความแม่นที่ค่าธรรมเนียมเรียกเก็บ — เฉพาะแท่งที่เครื่องยนต์เข้าไม้จริง');
  W();
  W('(p\\* − p_fair · เป็นตัวเดียวที่เทียบข้ามตลาดได้ตรง เพราะหักผลของเรขาคณิต SL/TP ออกแล้ว)');
  W();
  W('| ชุด | ตลาด | กรอบเวลา | p_fair | p* | ภาษีความแม่น | ผลจริง (bps) |');
  W('|---|---|---|---|---|---|---|');
  for (const split of SPLITS) {
    for (const mk of MARKETS) {
      for (const tf of TIMEFRAMES) {
        const cell = cellMap.get(`${split}|${mk}|${tf}|${PRIMARY_H}`);
        if (!cell) continue;
        const S = cell.stats;
        W(`| ${split} | ${mk} | ${tf} | ${pctS(S.pFair)} | ${pctS(S.pStar)}`
          + ` | **${pctS(S.pStar - S.pFair)}** | ${bps(S.netEng)} |`);
      }
    }
  }
  W();
  W('ค่าเงินยังเป็นตลาดที่ภาษีความแม่นต่ำที่สุดในจักรวาลของเจ้าของ ตรงกับที่ exp-ceiling วัดไว้');
  W('แต่ "ภาษีต่ำ" ไม่ได้แปลว่า "ทำเงินได้" — มันแปลว่าเส้นที่ต้องข้ามอยู่ใกล้ 50% เท่านั้น');
  W('และเครื่องยนต์ปัจจุบันยังข้ามไม่ได้แม้แต่เส้นที่ใกล้ 50%');
  W();
  W('### สิ่งที่ **ไม่ควร** ลงแรงต่อ (ปิดจากรอบนี้)');
  W();
  W('· หา feature ที่ทำนาย "ขนาด" เพิ่ม — ทำนายได้แล้ว (ρ≈0.3 ยืนบน validation) แต่แปลงเป็นเงินไม่ได้');
  {
    // ระบุให้ชัดว่ามีกฎไหน "ผ่าน Holm" แบบขาดทุน — นั่นคือผลลัพธ์เชิงลบที่แข็งที่สุดที่รอบนี้ได้
    const losers = TESTS.filter((t) => t.holmPass && t.id.startsWith('RULE-') && t.estimate < 0);
    W(`· คัดไม้ด้วยระบอบความผันผวน — กวาด ${CZ_NAMES.length} ตัวทำนาย × ${NQ} กลุ่ม × 2 ชุด`);
    if (losers.length) {
      W(`  ไม่มีกฎไหนพิสูจน์ได้ว่ากำไร แต่มี **${losers.length} กฎที่พิสูจน์ได้ว่าขาดทุนจริง** (ผ่าน Holm ทางลบ):`);
      for (const t of losers) W(`  · ${t.question.replace(/^④ /, '')} → ${bps(t.estimate)} bps (p=${pS(t.p)})`);
    } else {
      W('  ไม่มีกฎไหนผ่าน Holm เลย ไม่ว่าทางบวกหรือทางลบ');
    }
  }
  W('· ปรับขนาดไม้ตามความผันผวน — เท่ากับสิ่งที่ระบบทำอยู่แล้ว');
  W();
  W('### สิ่งที่ยังเปิดอยู่');
  W();
  W('· **ทิศ** ยังเป็นของที่ทำนายไม่ได้เลย (ρ กับ "ทายถูกไหม" ≈ 0 ทุกตัวทำนาย ทั้งสองชุด)');
  W('  ถ้าจะมีทางออก มันต้องมาจากตรงนี้ ไม่ใช่จากขนาด');
  W('· ค่าเงินยังเป็นสนามที่เส้นคุ้มทุนใกล้ 50% ที่สุด (ภาษี ~1–3%) จึงยังเป็นที่ที่คุ้มจะลองต่อที่สุด');
  W('  ในสามตลาดที่เจ้าของเทรด — ทองรองลงมา หุ้นไทยแทบปิดประตูด้วยค่าธรรมเนียม');
  W('· หุ้นไทยในคลังยังวัดไม่ครบจักรวาลจริง (เรื่องนี้อยู่นอกขอบเขตรอบนี้)');
  W();

  // ── ข้อจำกัด ──
  W('---');
  W();
  W('## ข้อจำกัดที่ต้องรู้ก่อนเชื่อตัวเลขข้างบน');
  W();
  W('· ตัวเลขทุกตัวเป็นผลย้อนหลังภายใต้โมเดลต้นทุนโดยประมาณ ไม่ใช่ใบเสร็จจริงของเจ้าของ');
  W('· ควอนไทล์ของ "ขนาดจริง" ในหัวข้อ ① ใช้ข้อมูลอนาคต ห้ามตีความว่าเป็นกฎที่เทรดได้');
  W('· 1H ย้อนได้แค่ ~730 วัน = เห็นตลาดยุคเดียว ข้อสรุปจาก 1H อ่อนกว่า 1D มาก');
  W('· ไม้ที่หน้าต่างถือล้ำเส้นแบ่ง split ถูกทิ้ง — ตัวอย่างจึงเอียงออกจากปลาย split เล็กน้อย');
  W('· กรอบ A มีไม้ที่ s < 0 (ทายทิศถูกแต่แพ้ทายผิด) ทำให้ p_w กรอบ A ตีความเป็น "ความน่าจะเป็น" ตรง ๆ ไม่ได้');
  W('  กรอบ B ไม่มีปัญหานี้ ถ้าสองกรอบให้ข้อสรุปต่างกัน ให้เชื่อกรอบ B');
  W('· ค่าเฉลี่ยรายไม้ถูกครอบงำด้วยไม้ไม่กี่ไม้ได้ง่าย (รอบซ่อมเครื่องมือวัดไว้ว่า ทิ้งแถวแค่ 0.138%');
  W('  ทำให้ตัวเลขพาดหัวขยับ 12.6%) — ทุกข้อสรุปในไฟล์นี้จึงต้องดูช่วงความเชื่อมั่น ไม่ใช่ค่ากลางอย่างเดียว');
  W(`· สมุดบันทึกการแตะ validation: วิจัย ${OUT.touches.research} ครั้ง · กลไก ${OUT.touches.mechanical} ครั้ง`
    + ` (\`scripts/research/report/fx-magnitude/VALIDATION-TOUCHES.md\`)`);
  if (dropped.length) W(`· ชุดข้อมูลที่ถูกตัดออก: ${dropped.join(' · ')}`);
  W();
}

// ═══════════════════════ โหมดตรวจความคงที่ของตัวเอง ═══════════════════════

/**
 * รันตัวเอง N รอบลงโฟลเดอร์ชั่วคราว แล้วเทียบทุกไบต์ (หลังตัดช่องที่ประกาศว่าไม่คงที่)
 *
 * ทำไมต้องมีในไฟล์นี้เอง แทนที่จะไปเพิ่มใน check-determinism.mjs:
 * ไฟล์นั้นเป็นเครื่องมือที่เพิ่งซ่อมและมีเจ้าของอื่นอยู่ — แก้แล้วเสี่ยงชนกัน
 * โพรโทคอลที่ใช้ตรงกันทุกข้อ (ตัด volatileFields ที่สคริปต์ประกาศเอง แล้วเทียบ canonical JSON)
 *
 * ค่าเริ่มต้นของ N มาจากสูตรเดียวกัน: P(จับไม่ได้) = (1−p)^N + p^N ที่ p=0.06 conf=0.99 → 75
 */
function runDeterminismSelfCheck(n) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fxmag-det-'));
  console.log(`ตรวจความคงที่ของ fx-magnitude.mjs · ${n} รอบ · โฟลเดอร์ชั่วคราว ${tmp}`);
  console.log(`(N=${n} · ที่อัตราเพี้ยน 6% ให้ความมั่นใจ ${((1 - ((0.94 ** n) + (0.06 ** n))) * 100).toFixed(1)}%)`);
  const digests = [];
  const raws = [];
  for (let k = 0; k < n; k++) {
    const out = path.join(tmp, `run-${String(k).padStart(3, '0')}`);
    fs.mkdirSync(out, { recursive: true });
    try {
      execFileSync(process.execPath, [SCRIPT_PATH, `--out-dir=${out}`, '--rerun-probe'],
        { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
    } catch (e) {
      console.error(`รอบ ${k}: สคริปต์หยุดกลางคัน — ${(e.stderr ? e.stderr.toString() : e.message).slice(0, 400)}`);
      return 2;
    }
    const j = JSON.parse(fs.readFileSync(path.join(out, 'exp-fx-magnitude.json'), 'utf8'));
    const stripped = stripPaths(j, j.provenance.volatileFields);
    const canon = canonicalJson(stripped);
    raws.push(stripped);
    digests.push(canon);
    process.stdout.write(`\rรอบ ${k + 1}/${n} เสร็จ   `);
  }
  process.stdout.write('\n');
  const uniq = new Map();
  digests.forEach((d, i) => {
    if (!uniq.has(d)) uniq.set(d, []);
    uniq.get(d).push(i);
  });
  if (uniq.size === 1) {
    console.log(`✓ ${n} รอบ ให้ผลเหมือนกันทุกไบต์`);
    fs.rmSync(tmp, { recursive: true, force: true });
    return 0;
  }
  console.error(`✗ พบผลต่างกัน ${uniq.size} แบบ จาก ${n} รอบ`);
  const groups = [...uniq.values()];
  const a = raws[groups[0][0]]; const b = raws[groups[1][0]];
  for (const d of deepDiff(a, b, 30)) console.error(`  · ${d.path}: ${d.a}  ≠  ${d.b}`);
  console.error(`ไฟล์ดิบอยู่ที่ ${tmp} — ห้ามใช้ตัวเลขจากสคริปต์นี้ตัดสินอะไรจนกว่าจะแก้ได้`);
  return 1;
}

// ═══════════════════ โหมดพิสูจน์ว่าไม่ล้ำข้ามเส้นแบ่ง (กติกาข้อ 3) ═══════════════════

/**
 * การพิสูจน์เดียวที่ยอมรับได้: **ลบแท่งชุด test ทิ้งจากดิสก์จริง แล้วคำนวณซ้ำ**
 * ถ้าตัวเลขของชุด train/validation เปลี่ยนแม้บิตเดียว แปลว่ายังอ่านอนาคตอยู่
 *
 * ทำเป็นโหมดในตัวไฟล์เอง ไม่ใช่สคริปต์ข้างนอกที่รันครั้งเดียวแล้วหาย เพราะ
 * การพิสูจน์ที่รันซ้ำไม่ได้ ก็คือคำกล่าวอ้าง ไม่ใช่การพิสูจน์
 *
 * ทำสามอย่างในรอบเดียว:
 *   พ1 สร้างคลังที่ลบแท่งตั้งแต่ validationEnd เป็นต้นไปออกจริง (= ทั้งชุด test)
 *   พ2 รันตัวเองสองรอบ (คลังเต็ม · คลังที่ตัดแล้ว) แล้วเทียบทุกช่อง
 *   พ3 รันโหมด --keep-spill เทียบกับปกติ เพื่อพิสูจน์ว่า **ด่านมีฟันจริง**
 *      (ถ้าเปิดด่านแล้วไม่มีอะไรเปลี่ยนเลย แปลว่าด่านไม่ได้ทำอะไร ไม่ใช่ว่าไม่มีการล้ำ)
 */
function runLeakProof() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fxmag-leak-'));
  const cutDir = path.join(tmp, 'candles-notest');
  fs.mkdirSync(cutDir, { recursive: true });

  const bounds = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
  const cutAt = {};
  for (const [tf, b] of Object.entries(bounds.timeframes)) cutAt[tf] = Date.parse(b.validationEnd);

  let removed = 0; let kept = 0; let files = 0;
  for (const f of fs.readdirSync(DEFAULT_CACHE_DIR).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(DEFAULT_CACHE_DIR, f), 'utf8'));
    const c = cutAt[j.timeframe];
    if (c === undefined) { fs.copyFileSync(path.join(DEFAULT_CACHE_DIR, f), path.join(cutDir, f)); continue; }
    const before = j.candles.length;
    j.candles = j.candles.filter((x) => Date.parse(x.timestamp) < c);
    removed += before - j.candles.length; kept += j.candles.length; files++;
    fs.writeFileSync(path.join(cutDir, f), JSON.stringify(j));
  }
  console.log(`พ1 · สร้างคลังที่ลบชุด test ทิ้งจริง: ${files} ไฟล์ · เหลือ ${kept} แท่ง · ลบทิ้ง ${removed} แท่ง`);

  const runInto = (name, extra) => {
    const out = path.join(tmp, name);
    fs.mkdirSync(out, { recursive: true });
    execFileSync(process.execPath, [SCRIPT_PATH, `--out-dir=${out}`, '--rerun-probe', ...extra],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
    return JSON.parse(fs.readFileSync(path.join(out, 'exp-fx-magnitude.json'), 'utf8'));
  };

  const full = runInto('full', []);
  const cut = runInto('cut', [`--cache-dir=${cutDir}`]);
  const spill = runInto('spill', ['--keep-spill']);

  // เทียบเฉพาะสิ่งที่เป็น "ตัวเลขผลลัพธ์" — รายชื่อชุดข้อมูลย่อมต่างเมื่อลบข้อมูลทิ้ง
  // (ชุดที่มีแต่แท่งของยุค test จะกลายเป็นว่างแล้วถูกตัดออก — ต้องตรวจว่ามันไม่มีไม้เลย)
  const cmp = (a, b) => {
    const out = { cells: { n: 0, diff: 0 }, population: { n: 0, diff: 0 }, tests: { n: 0, diff: 0 } };
    for (const grp of ['cells', 'population']) {
      const keys = [...new Set([...Object.keys(a[grp] ?? {}), ...Object.keys(b[grp] ?? {})])].sort();
      out[grp].n = keys.length;
      for (const k of keys) if (canonicalJson(a[grp]?.[k]) !== canonicalJson(b[grp]?.[k])) out[grp].diff++;
    }
    const m = Math.max(a.tests.length, b.tests.length);
    out.tests.n = m;
    for (let i = 0; i < m; i++) if (canonicalJson(a.tests[i]) !== canonicalJson(b.tests[i])) out.tests.diff++;
    return out;
  };

  const vsCut = cmp(full, cut);
  const vsSpill = cmp(full, spill);
  const gone = full.datasets.filter((d) => !cut.datasets.includes(d));

  const totalCut = vsCut.cells.diff + vsCut.population.diff + vsCut.tests.diff;
  const totalSpill = vsSpill.cells.diff + vsSpill.population.diff + vsSpill.tests.diff;

  console.log(`พ2 · ตัดชุด test ทิ้งแล้วคำนวณซ้ำ — ช่องที่เปลี่ยนค่า:`);
  console.log(`     ช่องเครื่องยนต์ ${vsCut.cells.diff}/${vsCut.cells.n}`
    + ` · ช่องประชากร ${vsCut.population.diff}/${vsCut.population.n}`
    + ` · การทดสอบ ${vsCut.tests.diff}/${vsCut.tests.n}`);
  console.log(`     ชุดข้อมูลที่หายไปเพราะมีแต่แท่งยุค test: ${gone.join(' · ') || '(ไม่มี)'}`);
  console.log(`พ3 · เปิดโหมด --keep-spill (ปล่อยให้ล้ำ) — ช่องที่เปลี่ยนค่า:`);
  console.log(`     ช่องเครื่องยนต์ ${vsSpill.cells.diff}/${vsSpill.cells.n}`
    + ` · ช่องประชากร ${vsSpill.population.diff}/${vsSpill.population.n}`
    + ` · การทดสอบ ${vsSpill.tests.diff}/${vsSpill.tests.n}`);

  const verdict = totalCut === 0 && totalSpill > 0;
  const proof = {
    provedAt: new Date().toISOString(),
    scriptSha256: sha256File(SCRIPT_PATH),
    barsRemoved: removed, barsKept: kept, filesTruncated: files,
    vsCut, vsSpill, datasetsGone: gone,
    verdict,
    note: verdict
      ? 'ตัดชุด test ทิ้งจริงแล้วทุกตัวเลขเท่าเดิมทุกบิต และด่านมีฟันจริง (เปิดโหมดล้ำแล้วค่าเปลี่ยน)'
      : (totalCut !== 0 ? 'ยังล้ำอยู่ — ตัวเลขเปลี่ยนเมื่อลบชุด test ทิ้ง'
        : 'ด่านไม่มีฟัน — เปิดโหมดล้ำแล้วไม่มีอะไรเปลี่ยน แปลว่าการตรวจนี้พิสูจน์อะไรไม่ได้'),
  };
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'leak-proof.json'), `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  console.log(verdict ? `\n✓ ${proof.note}` : `\n✗ ${proof.note}`);
  console.log(`เขียนใบรับรองไว้ที่ ${path.relative(ROOT, path.join(WORK_DIR, 'leak-proof.json'))}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  return verdict ? 0 : 1;
}

// ═══════════════ โหมดพิสูจน์ว่า "ด่านตรวจตัวเอง" มีฟันจริง (--self-test) ═══════════════

/**
 * รอบซ่อมเครื่องมือทิ้งข้อกังวลไว้ว่า "ยังไม่เคยเห็นด่านตรวจตัวเองยิงจริงในสนาม"
 * ด่านที่ไม่เคยยิง กับด่านที่ยิงไม่ได้ ดูเหมือนกันทุกประการจากภายนอก
 *
 * โหมดนี้จึงทำสิ่งเดียวที่แยกสองอย่างนั้นออกจากกันได้: **ใส่ความผิดพลาดลงไปเอง**
 * แล้วดูว่าด่านจับได้ไหม ทำบนสำเนาชั่วคราวเสมอ ไม่แตะไฟล์จริง
 *
 * ต้องมีตัวควบคุมด้วย (สำเนาที่ไม่แก้อะไรเลย ต้องไม่ฟ้อง) ไม่งั้นด่านที่ฟ้องทุกอย่าง
 * ก็จะ "ผ่าน" การทดสอบนี้ได้ ทั้งที่ใช้งานจริงไม่ได้
 *
 * ความผิดพลาดสามแบบ เลียนแบบอาการจริงของ combine.mjs:
 *   ก1 คำนวณสถิติซ้ำแล้วได้คนละคำตอบ (1 ใน 7 ครั้ง)
 *   ก2 ผลรวมของช่องหนึ่งไปโผล่ในอีกช่อง — ตรงกับอาการ 194.79 ของรอบก่อนที่สุด
 *   ก3 ตัวเลขถูกเขียนทับหลังคำนวณเสร็จ จนอัตลักษณ์ทางคณิตศาสตร์พัง
 */
function runSelfTest() {
  const tmpDir = path.join(path.dirname(SCRIPT_PATH), '.self-test-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fxmag-selftest-'));
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  // สำเนาอยู่ลึกลงไปหนึ่งชั้น จึงต้องขยับเส้นทาง import ให้ยังหาเจอ
  const fixImports = (s) => s
    .replace("from '../load-src-modules.mjs'", "from '../../load-src-modules.mjs'")
    .replace("from '../repro.mjs'", "from '../../repro.mjs'");
  const ANCHOR = '  // ── ด่านตรวจตัวเอง: ถ้าเจอ = หยุดรอบนี้ ไม่พิมพ์ตัวเลขออกมา ──';
  const inject = (code) => {
    const s = src.replace(ANCHOR, `${code}${ANCHOR}`);
    if (s === src) throw new Error('ใส่ความผิดพลาดไม่สำเร็จ — จุดยึดในโค้ดเปลี่ยนไปแล้ว');
    return s;
  };

  const cases = {
    ควบคุม: src,
    ก1: (() => {
      let s = src.replace('function statsFromSums(S) {\n  const N = S[SLOT.n];',
        'let __f = 0;\nfunction statsFromSums(S) {\n  __f++;\n  const N = S[SLOT.n];');
      s = s.replace('    netEng: O - F,', '    netEng: (O - F) * (__f % 7 === 0 ? 1.0000001 : 1),');
      if (s === src) throw new Error('ใส่ความผิดพลาด ก1 ไม่สำเร็จ');
      return s;
    })(),
    ก2: inject(`  {
    const ks = [...cellMap.keys()];
    const donor = cellMap.get(ks[0]); const victim = cellMap.get(ks[1]);
    if (donor && victim) { victim.sums = donor.sums.map((x) => x * 2); victim.stats = statsFromSums(victim.sums); }
  }
`),
    ก3: inject(`  { const first = cellMap.get([...cellMap.keys()][0]); if (first) first.stats.pW = first.stats.pHat; }
`),
  };

  const results = {};
  let ok = true;
  for (const [name, code] of Object.entries(cases)) {
    const f = path.join(tmpDir, `case-${name}.mjs`);
    fs.writeFileSync(f, fixImports(code), 'utf8');
    let stderr = ''; let exitCode = 0;
    try {
      execFileSync(process.execPath, [f, '--bootstrap=50', `--out-dir=${path.join(outRoot, name)}`, '--rerun-probe'],
        { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
    } catch (e) {
      exitCode = e.status ?? 1;
      stderr = e.stderr ? e.stderr.toString() : '';
    }
    const lines = stderr.split('\n').filter((l) => /^\s+· ด\d/.test(l));
    const byGate = { 'ด1': 0, 'ด2': 0, 'ด3': 0 };
    for (const l of lines) { const m = l.match(/· (ด\d)/); if (m) byGate[m[1]]++; }
    const caught = exitCode === 3 && lines.length > 0;
    results[name] = { exitCode, findings: lines.length, byGate, caught, sample: lines[0]?.trim().slice(0, 160) ?? '' };
    if (name === 'ควบคุม') { if (caught || exitCode !== 0) ok = false; } else if (!caught) ok = false;
    console.log(`${name.padEnd(8)} exit=${exitCode} · ด่านฟ้อง ${lines.length} ข้อ`
      + ` (ด1=${byGate['ด1']} ด2=${byGate['ด2']} ด3=${byGate['ด3']})`
      + `${name === 'ควบคุม' ? '  ← ต้องเป็น 0' : '  ← ต้องมากกว่า 0'}`);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(outRoot, { recursive: true, force: true });
  const cert = {
    testedAt: new Date().toISOString(), scriptSha256: sha256File(SCRIPT_PATH),
    cases: results, verdict: ok,
    note: ok ? 'ด่านตรวจตัวเองจับความผิดพลาดที่ป้อนเข้าไปได้ทุกแบบ และไม่ฟ้องตัวควบคุม'
      : 'ด่านตรวจตัวเองใช้ไม่ได้ — จับไม่ได้ หรือฟ้องตัวควบคุม',
  };
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'self-test.json'), `${JSON.stringify(cert, null, 2)}\n`, 'utf8');
  console.log(`\n${ok ? '✓' : '✗'} ${cert.note}`);
  return ok ? 0 : 1;
}

if (args['self-test']) {
  process.exit(runSelfTest());
} else if (OPT.determinismRuns > 0) {
  const n = OPT.determinismRuns === 1 ? runsNeeded(0.06, 0.99) : OPT.determinismRuns;
  process.exit(runDeterminismSelfCheck(n));
} else if (args['prove-no-leak']) {
  process.exit(runLeakProof());
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}
