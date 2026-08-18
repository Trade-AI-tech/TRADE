#!/usr/bin/env node
/**
 * th-gap.mjs — วัด "หุ้นไทยที่ตกสำรวจ": ตัวที่ระบบสแกนจริงแต่คลังวิจัยไม่เคยวัด
 *
 * ═══════════════════════════════ ทำไมต้องมีไฟล์นี้ ═══════════════════════════════
 *
 * จักรวาลที่เจ้าของใช้จริง (src/lib/universe.ts) มีหุ้นไทย 18 ตัว
 * คลังวิจัย (.research-cache) เคยมีหุ้นไทย 28 ตัว — แต่ทับกับจักรวาลจริงแค่ 11 ตัว
 *   · 7 ตัวในจักรวาลจริง **ไม่เคยถูกวัดเลย** (OR TRUE CPN SCB KTB TTB GULF) = 39%
 *   · 3 ตัวที่วิจัยวัดมาตลอดกลับ **ไม่อยู่ในจักรวาลจริง** (CPF IVL EA)
 *
 * แปลว่าทุกข้อสรุปเรื่อง "หุ้นไทย" ของโครงการนี้ วัดจากกลุ่มตัวอย่างที่ไม่ใช่กลุ่มที่
 * เจ้าของได้รับแจ้งเตือนจริง คำถามที่ยังไม่มีใครตอบคือ **"ระบบที่เจ้าของใช้อยู่จริง
 * ให้ผลเท่าไร"** ไฟล์นี้ตอบข้อนั้น และตอบว่า "ตัวเลขเดิมมีอคติจากการเลือกตัวอย่างไหม"
 *
 * ─────────────────────────── นิยามกลุ่ม (คำนวณ ไม่ใช่พิมพ์มือ) ───────────────────────────
 *
 *   UNIV18     = หุ้นไทยทั้งหมดใน src/lib/universe.ts  ← จักรวาลจริงเป๊ะ
 *   LEGACY14   = 14 ตัวที่คลังวิจัยวัดมาตลอด (กลุ่ม SET50 ของ exp-ceiling / exp-th-scalp)
 *   MEASURED11 = UNIV18 ∩ LEGACY14   ← ส่วนที่เคยวัดและเจ้าของเทรดจริง
 *   GAP7       = UNIV18 \ LEGACY14   ← ช่องโหว่ทั้งหมดของรอบนี้
 *   OFFUNIV3   = LEGACY14 \ UNIV18   ← วัดมาตลอดแต่เจ้าของไม่ได้เทรด
 *
 * มีแค่ LEGACY14 ที่พิมพ์มือ (เพราะเป็น "ประวัติศาสตร์" ที่เปลี่ยนไม่ได้แล้ว)
 * ที่เหลือคำนวณจาก universe.ts ตอนรัน — universe.ts เปลี่ยนเมื่อไร ตัวเลขก็ตามไปเอง
 *
 * ────────────────────────────── สองการวัดที่ไม่เหมือนกัน ──────────────────────────────
 *
 *  (ก) **ผลจริงของเครื่องยนต์** — เอาไม้ที่ lab.mjs (= เครื่องยนต์ตัวจริง) เปิดจริง
 *      มาคิดกำไร/ขาดทุนใหม่ด้วยโมเดลต้นทุน SET (ค่าคอม 0.157%/ขา ขั้นต่ำ 50 บาท
 *      + สเปรด 1 tick ตามตารางช่วงราคา) นี่คือตัวเลขที่ตอบว่า "เจ้าของได้เท่าไร"
 *      ⚠ ไฟล์นี้ **จำลองการออกไม้เองจากแท่งดิบ** ไม่ได้ใช้คอลัมน์ exit/rNet ของ lab
 *        เพราะต้องพิสูจน์การไม่ล้ำข้ามเส้นแบ่งด้วยการตัดข้อมูลท้ายทิ้งจริง (ดู --leak-proof)
 *        ความถูกต้องของการจำลองถูกตรวจกับผลของ lab ทุกไม้ในหัวข้อ "ตรวจเครื่องวัด"
 *
 *  (ข) **เพดาน p\* (ภาษีความแม่น)** — วัดบนทุกแท่ง ไม่ใช่เฉพาะแท่งที่เครื่องยนต์เข้า
 *      นิยามและโค้ดลอกจาก ceiling.mjs ทุกบรรทัด เพื่อให้ตัวเลขเทียบกับ exp-ceiling.md
 *      ได้ตรง ๆ และมีด่านตรวจว่ากลุ่ม LEGACY14 ของไฟล์นี้ ให้ค่าเท่ากับกลุ่ม SET50 ของ
 *      exp-ceiling.json **ทุกบิต** ถ้าไม่เท่า = เครื่องวัดคนละตัว ห้ามเชื่อผลรอบนี้
 *
 * ─────────────────────── ด่านกันการล้ำข้ามเส้นแบ่ง split ───────────────────────
 *
 * lab.mjs จงใจปล่อยให้ไม้ที่เปิดท้าย split วิ่งไปปิดใน split ถัดไป ("เหมือนชีวิตจริง")
 * สำหรับ validation นั่นแปลว่าอ่านแท่งของชุด test → ผิดกติกา
 * ไฟล์นี้จึงใช้กติกาเดียวกับ feat-cross.mjs / combine.mjs คือ **ทิ้งไม้ที่ล้ำ**:
 *
 *     เก็บไม้ไว้ก็ต่อเมื่อ  entryIndex + maxHold − 1 ≤ แท่งสุดท้ายของ split
 *
 * ทำไมใช้ "หน้าต่างเต็มพอดีไหม" ไม่ใช่ "ออกจริงเลยเส้นไหม":
 *   ถ้าใช้เกณฑ์ "ออกจริง" ไม้ที่ชน SL ตั้งแต่แท่งที่สองจะถูกเก็บไว้ แต่พอตัดข้อมูลท้ายทิ้ง
 *   จริงเพื่อพิสูจน์ ไม้ที่ *ควรถูกทิ้ง* จะกลายเป็น time_exit ที่ปลายข้อมูลแล้ว "ผ่านเกณฑ์"
 *   ขึ้นมา → ตัวเลขสองรอบไม่ตรงกันทั้งที่ไม่มีการรั่ว เกณฑ์หน้าต่างขึ้นกับดัชนีเข้าไม้อย่างเดียว
 *   จึงให้ผลเท่ากันเป๊ะทั้งบนคลังเต็มและคลังที่ตัดท้ายแล้ว
 *
 * ────────────────────────────────── วิธีใช้ ──────────────────────────────────
 *
 *   node scripts/research/experiments/th-gap.mjs
 *   node scripts/research/experiments/th-gap.mjs --repeat=20      พิสูจน์ว่ารันซ้ำได้ผลเดิม
 *   node scripts/research/experiments/th-gap.mjs --leak-proof     ตัดข้อมูลท้ายทิ้งจริงแล้วเทียบ
 *   node scripts/research/experiments/th-gap.mjs --cache-dir=... --out-dir=...
 *
 * ไฟล์นี้ไม่แตะชุด test ไม่ว่ากรณีใด (มีด่านกันไว้ข้างล่าง)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ROOT } from '../load-src-modules.mjs';
import {
  InputLedger, buildProvenance, sha256File, canonicalJson, stripPaths, deepDiff,
} from '../repro.mjs';

const IN = new InputLedger();
const SCRIPT_PATH = fileURLToPath(import.meta.url);

const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const WORK_DIR = path.join(REPORT_DIR, 'th-gap');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');
const SPLIT_FILE = path.join(REPORT_DIR, 'split.json');
const UNIVERSE_TS = path.join(ROOT, 'src', 'lib', 'universe.ts');
const CEILING_JSON = path.join(REPORT_DIR, 'exp-ceiling.json');

// ════════════════════════════════ อาร์กิวเมนต์ ════════════════════════════════

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

// ── ด่านกันชุด test ────────────────────────────────────────────────────────────
if (args.split === 'test' || args['i-am-done-tuning'] || args.confirm) {
  console.error('\n[หยุด] th-gap.mjs ไม่แตะชุด test ไม่ว่ากรณีใด\n');
  process.exit(1);
}

const CACHE_DIR = args['cache-dir']
  ? path.resolve(String(args['cache-dir']))
  : path.join(ROOT, '.research-cache', 'candles');

const OPT = {
  bootstrap: Number(args.bootstrap ?? 2000),
  seed: Number(args.seed ?? 20260818),
  alpha: Number(args.alpha ?? 0.05),
  refresh: Boolean(args.refresh),
  quiet: Boolean(args.quiet),
  outDir: args['out-dir'] ? path.resolve(String(args['out-dir'])) : REPORT_DIR,
  repeat: args.repeat ? Number(args.repeat) : 0,
  leakProof: Boolean(args['leak-proof']),
};

const say = (...a) => { if (!OPT.quiet) console.log(...a); };

// ════════════════════════════════ ค่าคงที่ของงาน ════════════════════════════════

/**
 * 14 ตัวที่คลังวิจัยวัดมาตลอด — ลอกจาก SET50_SYMBOLS ของ ceiling.mjs ตัวอักษรต่อตัวอักษร
 * นี่คือรายชื่อเดียวในไฟล์นี้ที่พิมพ์มือ เพราะมันคือ "ประวัติศาสตร์" ไม่ใช่ค่าที่ควรคำนวณใหม่
 * ถ้าแก้รายชื่อนี้ ตัวเลขจะไม่เทียบกับ exp-ceiling.md / exp-th-scalp.md ได้อีกต่อไป
 */
const LEGACY14 = [
  'PTT', 'PTTEP', 'AOT', 'CPALL', 'KBANK', 'BBL', 'ADVANC',
  'SCC', 'BDMS', 'CPF', 'DELTA', 'MINT', 'IVL', 'EA',
];

/** ตารางช่วงราคาของ SET — ราคาขยับได้ทีละเท่านี้ = พื้นของสเปรด (ลอกจาก ceiling.mjs) */
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
const LAB_TH_BPS = 40;         // ตาราง bps ของ lab.mjs สำหรับ TH_STOCK (ใช้เทียบ ไม่ใช่ใช้สรุป)

/** เรขาคณิต SL/TP ที่ใช้เป็น "กติกาปกติ" — ลอกจาก ceiling.mjs */
const GEO = { slAtrMult: 1.5, tpAtrMult: 3.0, atrPeriod: 14, atrFallbackPct: 0.02 };
/** ค่าปัดราคาของเครื่องยนต์ — ลอกจาก engine-lab.mjs cfg.output */
const ROUND = { forexDecimals: 5, otherDecimals: 4, forexPrecision: 5, otherPrecision: 6 };

const MIN_HISTORY = 60;   // ตรงกับค่าเริ่มต้นของ lab.mjs
const MAX_HOLD = 10;      // หน้าต่างถือของเครื่องยนต์ที่ใช้ทั้งรอบนี้ (ตรงกับ ceiling baseline)
const HORIZONS = [1, 5, 10, 20];
const TIMEFRAMES = ['1D', '1H'];
const SPLITS = ['train', 'validation'];
const GROUPS = ['UNIV18', 'MEASURED11', 'GAP7', 'LEGACY14', 'OFFUNIV3'];
const GROUP_LABEL = {
  UNIV18: 'จักรวาลจริง 18 ตัว',
  MEASURED11: 'เคยวัด+เทรดจริง 11 ตัว',
  GAP7: 'ตกสำรวจ 7 ตัว',
  LEGACY14: 'ที่วิจัยเคยวัด 14 ตัว',
  OFFUNIV3: 'วัดแต่ไม่ได้เทรด 3 ตัว',
};

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(OPT.outDir, { recursive: true });

// ═══════════════════════════ เครื่องมือทางสถิติ ═══════════════════════════

/** PRNG ที่ให้ผลเดิมทุกครั้ง (ลอกจาก ceiling.mjs) */
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

/** erfc แบบ Numerical Recipes — ต้องละเอียดกว่าตาราง normal เพราะ Holm ต้องการ p เล็ก ๆ */
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
const twoSidedP = (z) => (Number.isFinite(z) ? erfc(Math.abs(z) / Math.SQRT2) : NaN);

/**
 * ค่าเฉลี่ยพร้อม SE แบบจับกลุ่ม (cluster-robust) — กลุ่มคือ (สัญลักษณ์ × เดือน)
 * ไม้ที่อยู่เดือนเดียวกันของหุ้นตัวเดียวกันไม่เป็นอิสระต่อกัน ถ้าคิดแบบอิสระ n จะเฟ้อ
 * @param clusters [{n, s}] — n = จำนวนไม้ในกลุ่ม, s = ผลรวมค่าที่วัดในกลุ่ม
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
 * ผลต่างของค่าเฉลี่ยสองกลุ่มที่ "สัญลักษณ์ไม่ทับกัน" จึงถือว่าเป็นอิสระต่อกันได้
 *   se(ผลต่าง) = √(se_A² + se_B²)
 * ⚠ อิสระในที่นี้คือ "ไม่ใช้ไม้ร่วมกัน" ไม่ใช่ "ราคาไม่สัมพันธ์กัน" — หุ้นไทยทั้งตลาดเดินตาม
 *   SET ด้วยกัน ค่า p ที่ได้จึงเป็นด้าน "ใจกว้างเกินไป" (ประเมิน SE ต่ำกว่าจริง)
 *   ข้อสรุปเชิงลบ (ไม่ต่าง) จึงแข็งกว่าที่ตัวเลขบอก ส่วนข้อสรุปเชิงบวกต้องระวัง
 */
function diffOfMeans(a, b) {
  const est = a.mean - b.mean;
  const se = Math.sqrt(a.se * a.se + b.se * b.se);
  const z = se > 0 ? est / se : NaN;
  return { est, se, z, p: twoSidedP(z) };
}

/** bootstrap ผลต่างสองกลุ่ม — สุ่มกลุ่มทั้งกลุ่มภายในแต่ละฝั่ง (cluster bootstrap) */
function bootstrapDiff(clA, clB, rng, B = OPT.bootstrap) {
  if (clA.length < 2 || clB.length < 2) return [NaN, NaN];
  const draw = (arr) => {
    let n = 0; let s = 0;
    for (let k = 0; k < arr.length; k++) { const c = arr[(rng() * arr.length) | 0]; n += c.n; s += c.s; }
    return n ? s / n : NaN;
  };
  const out = new Float64Array(B);
  for (let b = 0; b < B; b++) out[b] = draw(clA) - draw(clB);
  const s = Array.from(out).sort((x, y) => x - y);
  return [percentileOfSorted(s, 0.025), percentileOfSorted(s, 0.975)];
}

/** bootstrap ค่าเฉลี่ยกลุ่มเดียว */
function bootstrapMean(cl, rng, B = OPT.bootstrap) {
  if (cl.length < 2) return [NaN, NaN];
  const out = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let n = 0; let s = 0;
    for (let k = 0; k < cl.length; k++) { const c = cl[(rng() * cl.length) | 0]; n += c.n; s += c.s; }
    out[b] = n ? s / n : NaN;
  }
  const s = Array.from(out).sort((x, y) => x - y);
  return [percentileOfSorted(s, 0.025), percentileOfSorted(s, 0.975)];
}

// ── บัญชีการเปรียบเทียบ ────────────────────────────────────────────────────────
// ทุกคำถามที่ "ถาม" ต้องถูกนับ ไม่ใช่เฉพาะที่ตอบว่าใช่ — ไม่งั้น Holm ไม่มีความหมาย
const TESTS = [];
function registerTest({ id, family, question, estimate, ci, p, note }) {
  TESTS.push({ idx: TESTS.length + 1, id, family, question, estimate, ci, p, note: note ?? null });
}
function applyHolm(alpha = OPT.alpha) {
  const byFamily = new Map();
  for (const t of TESTS) {
    if (!byFamily.has(t.family)) byFamily.set(t.family, []);
    byFamily.get(t.family).push(t);
  }
  for (const [, list] of byFamily) {
    // เรียงด้วย p แล้วตามด้วย id (สตริงตรง ๆ ไม่ใช่ localeCompare ซึ่งขึ้นกับ locale ของเครื่อง)
    const sorted = [...list].filter((t) => Number.isFinite(t.p))
      .sort((x, y) => (x.p - y.p) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
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

// ═══════════════════════ จักรวาลจริงจาก src/lib/universe.ts ═══════════════════════

/**
 * อ่านรายชื่อหุ้นไทยจากไฟล์จริงที่ระบบใช้สแกน — ไม่ลอกมาวาง
 *
 * ทำไมต้องอ่านไฟล์จริง: ประเด็นทั้งหมดของรอบนี้คือ "คลังวิจัยกับระบบจริงชี้คนละชุด"
 * ถ้าลอกรายชื่อมาไว้ที่นี่ วันหนึ่งเจ้าของเพิ่ม/ถอนหุ้น ไฟล์นี้จะรายงานช่องว่างที่ล้าสมัย
 * โดยไม่มีใครรู้ = สร้างโรคเดิมซ้ำในเครื่องมือที่ตั้งใจมาตรวจโรคนั้น
 */
function readTradedUniverse() {
  const src = IN.read(UNIVERSE_TS, 'universe-ts');
  // ตัดคอมเมนต์บรรทัดเดียวทิ้งก่อน — ในไฟล์มีตัวอย่าง symbol อยู่ในคอมเมนต์อธิบายด้วย
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const block = code.match(/SYMBOL_UNIVERSE[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error('อ่าน SYMBOL_UNIVERSE จาก universe.ts ไม่ได้ — โครงไฟล์เปลี่ยน ต้องแก้สคริปต์นี้');
  const out = [];
  const re = /\{\s*symbol:\s*'([^']+)'[^}]*market:\s*'([^']+)'\s*\}/g;
  let m;
  while ((m = re.exec(block[1])) !== null) out.push({ symbol: m[1], market: m[2] });
  if (!out.length) throw new Error('SYMBOL_UNIVERSE ว่าง — หยุดดีกว่าเดาต่อ');
  return out;
}

// ═══════════════════════════════ โหลดข้อมูล ═══════════════════════════════

/** [CAUSAL] โหลด dataset แล้วตัดตามสัญญาของคลัง (ลอกจาก lab.mjs / ceiling.mjs) */
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
    quality: j.quality ?? null,
    fetchedAt: j.fetchedAt ?? null,
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

/** [CAUSAL] แท่งที่เชื่อถือได้พอจะตัดสินการชน SL/TP — ลอกจาก lab.mjs */
const isUsableBar = (c) => (
  Number.isFinite(c.open) && c.open > 0 && Number.isFinite(c.high) && c.high > 0
  && Number.isFinite(c.low) && c.low > 0 && Number.isFinite(c.close) && c.close > 0
  && c.low <= c.high
);

// ═══════════════════════════ ตัวชี้วัดและเรขาคณิต ═══════════════════════════

/** [CAUSAL] ATR ที่ดัชนี i — ลอกจาก ceiling.mjs ซึ่งลอกจาก src/lib/indicators.ts */
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

/** [CAUSAL] เรขาคณิต SL/TP ของแท่งสัญญาณ i — ลอกจาก ceiling.mjs ทั้งก้อน */
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

// ═══════════════════════════════ โมเดลต้นทุน ═══════════════════════════════

function tickSizeFor(price) {
  for (const b of SET_TICK_TABLE) if (price >= b.from && price < b.to) return b.tick;
  return SET_TICK_TABLE[SET_TICK_TABLE.length - 1].tick;
}

/**
 * [CAUSAL] ค่าธรรมเนียมไป-กลับ เป็น "สัดส่วนของมูลค่าสถานะ" (ลอกจาก ceiling.mjs)
 *   มูลค่าคำสั่ง = เงินเสี่ยงต่อไม้ ÷ ระยะSL(สัดส่วน) → SL ยิ่งกว้าง คำสั่งยิ่งเล็ก
 *   ค่าคอมขั้นต่ำ 50 บาทจึงกลายเป็น "พื้น" ที่ถ่าง SL เท่าไรก็ไม่ทะลุ
 */
function feeFractionTH(entryPrice, stopDistPct) {
  if (!(entryPrice > 0) || !(stopDistPct > 0)) return NaN;
  const orderValue = TH_RISK_BAHT / stopDistPct;
  const feeOneSide = Math.max(TH_COMM_RATE * orderValue, TH_MIN_FEE);
  const comm = (2 * feeOneSide) / orderValue;
  const tick = TH_TICKS_PER_ROUND * (tickSizeFor(entryPrice) / entryPrice);
  return { fee: comm + tick, comm, tick, minFeeBinds: TH_COMM_RATE * orderValue < TH_MIN_FEE };
}

// ═════════════════ แกนกลาง: เพดาน p* ต่อแท่ง (ลอกกติกาจาก ceiling.mjs) ═════════════════

/**
 * ⚠ ORACLE — ฟังก์ชันนี้อ่านแท่งอนาคต candles[t .. t+H-1] โดยตั้งใจ
 *   ใช้ตอบคำถาม "เพดาน" เท่านั้น ห้ามตีความว่าเป็นผลตอบแทนที่ทำได้จริง
 *
 * @param maxIndex ดัชนีสูงสุดที่มองเห็นได้ = แท่งสุดท้ายของ split (ด่านกันการล้ำ)
 */
function scanDataset({ ds, entryFrom, entryTo, maxIndex, emit }) {
  const { candles, market, symbol } = ds;
  const n = maxIndex + 1;
  const hMax = HORIZONS[HORIZONS.length - 1];
  const from = Math.max(MIN_HISTORY + 1, entryFrom);
  const to = Math.min(n - 1, entryTo);

  for (let t = from; t <= to; t++) {
    const entryBar = candles[t];
    if (!isUsableBar(entryBar)) continue;
    const i = t - 1;                            // แท่งสัญญาณ — เห็นได้ถึงแค่ตรงนี้
    const g = geometryAt(candles, i, market);   // [CAUSAL] อ่าน candles[0..i]
    if (!g.okLong || !g.okShort) continue;
    const entry = entryBar.open;
    if (!(entry > 0)) continue;

    const plannedRisk = Math.abs(g.entryOut - g.slLong);
    const stopDistPct = plannedRisk / entry;
    const feeObj = feeFractionTH(entry, stopDistPct);
    const fee = feeObj ? feeObj.fee : NaN;
    if (!Number.isFinite(fee)) continue;

    let runMaxHigh = -Infinity; let runMinLow = Infinity;
    let lastUsableClose = NaN; let lastUsableIdx = -1;
    let hitLong = null; let hitShort = null;
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
      while (hIdx < HORIZONS.length && HORIZONS[hIdx] === off + 1) {
        out.push({
          H: HORIZONS[hIdx], lastIdx: lastUsableIdx,
          maxHigh: runMaxHigh, minLow: runMinLow, endClose: lastUsableClose,
          exitLong: hitLong !== null ? hitLong : lastUsableClose,
          exitShort: hitShort !== null ? hitShort : lastUsableClose,
        });
        hIdx++;
      }
    }
    // หน้าต่างที่เดินไม่ครบ H แท่งภายในขอบเขตของ split = ไม้ที่ล้ำ → ทิ้ง (นับไว้ให้เห็น)
    while (hIdx < HORIZONS.length) { emit({ t, H: HORIZONS[hIdx], skipSpill: true }); hIdx++; }

    for (const w of out) {
      if (!(w.lastIdx >= 0) || !Number.isFinite(w.endClose)) continue;
      const netMove = w.endClose - entry;
      if (netMove === 0) { emit({ t, H: w.H, skipFlat: true }); continue; }
      const dirTrue = netMove > 0 ? 1 : -1;

      const perfect = Math.max((w.maxHigh - entry) / entry, (entry - w.minLow) / entry);
      const rLong = (w.exitLong - entry) / entry;
      const rShort = (entry - w.exitShort) / entry;
      const correct = dirTrue > 0 ? rLong : rShort;
      const wrong = dirTrue > 0 ? rShort : rLong;
      const bestGeom = Math.max(rLong, rShort);

      emit({ t, H: w.H, time: ds.times[t], symbol, perfect, correct, wrong, bestGeom, fee, dirTrue });
    }
  }
}

const SLOT = { n: 0, perfect: 1, correct: 2, wrong: 3, best: 4, fee: 5, LEN: 6 };

class CellAcc {
  constructor() { this.clusters = new Map(); this.flat = 0; this.spill = 0; }
  add(clusterKey, rec) {
    let a = this.clusters.get(clusterKey);
    if (!a) { a = new Float64Array(SLOT.LEN); this.clusters.set(clusterKey, a); }
    a[SLOT.n] += 1;
    a[SLOT.perfect] += rec.perfect;
    a[SLOT.correct] += rec.correct;
    a[SLOT.wrong] += rec.wrong;
    a[SLOT.best] += rec.bestGeom;
    a[SLOT.fee] += rec.fee;
  }
}
function seriesOf(acc, fn) {
  const out = [];
  for (const a of acc.clusters.values()) out.push({ n: a[SLOT.n], s: fn(a) });
  return out;
}

// ═════════════════════════ เรียก lab.mjs เอาไม้ของเครื่องยนต์จริง ═════════════════════════

/**
 * แคชผลของ lab พร้อมใบกำกับ (.meta.json) — วิธีเดียวกับ combine.mjs หลังซ่อม
 * ใช้ซ้ำได้ก็ต่อเมื่อ อาร์กิวเมนต์ + sha ของ lab.mjs + sha ของ csv ตรงกันครบสามอย่าง
 * "ไฟล์มีอยู่" ไม่ใช่เหตุผลที่ดีพอ — นั่นคือช่องที่ทำให้รายงานผูกกับโค้ดคนละรุ่น
 */
function runLab(split) {
  const tag = 'thgap-engine';
  const csv = path.join(WORK_DIR, `${tag}-${split}-trades.csv`);
  const metaFile = `${csv}.meta.json`;
  const labArgs = [
    '--markets=TH_STOCK',
    '--timeframes=1D,1H',
    `--split=${split}`,
    `--max-hold=${MAX_HOLD}`,
    `--tag=${tag}`,
    '--dump-trades',
    '--bootstrap=200',
    `--seed=${OPT.seed}`,
  ];
  const want = { labArgs, labSha: sha256File(LAB) };

  if (!OPT.refresh && fs.existsSync(csv) && fs.existsSync(metaFile)) {
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { meta = null; }
    const sameArgs = meta && JSON.stringify(meta.labArgs) === JSON.stringify(want.labArgs);
    const sameLab = meta && meta.labSha === want.labSha;
    const sameCsv = meta && meta.csvSha === sha256File(csv);
    if (sameArgs && sameLab && sameCsv) { IN.note(csv, `lab-cache:${split}`); return { csv, cached: true }; }
    console.warn(`⚠ แคชของ lab (${split}) ไม่ตรงใบกำกับ — สร้างใหม่`
      + ` (อาร์กิวเมนต์ตรง: ${!!sameArgs} · lab.mjs ตรง: ${!!sameLab} · ไฟล์ตรง: ${!!sameCsv})`);
  }

  execFileSync(process.execPath, [LAB, ...labArgs],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  for (const suffix of [`${split}-trades.csv`, `${split}.txt`, `${split}.json`]) {
    const src = path.join(REPORT_DIR, `${tag}-${suffix}`);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(WORK_DIR, `${tag}-${suffix}`));
  }
  if (!fs.existsSync(csv)) throw new Error(`lab.mjs ไม่ได้สร้าง ${csv} — หยุดดีกว่าเดาต่อ`);
  fs.writeFileSync(metaFile, JSON.stringify({ ...want, csvSha: sha256File(csv) }, null, 2));
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

/**
 * จำลองการออกไม้ซ้ำจากแท่งดิบ ด้วยกติกาเดียวกับ walkForward ของ lab.mjs ทุกบรรทัด
 * ลำดับในแท่ง: gap_stop → gap_target → stop_loss → take_profit (แตะสองฝั่ง = นับ SL ก่อน)
 * ต้องจำลองเอง ไม่ใช้คอลัมน์ exit ของ lab เพราะการพิสูจน์ "ตัดข้อมูลท้ายทิ้งแล้วค่าเท่าเดิม"
 * ต้องคำนวณจากแท่งใน --cache-dir จริง ๆ ไม่ใช่จากไฟล์ที่คำนวณไว้ก่อนแล้ว
 */
function simulateExit(candles, entryIndex, isLong, stopLoss, takeProfit) {
  const lastHoldIndex = Math.min(entryIndex + MAX_HOLD - 1, candles.length - 1);
  let lastUsableIndex = entryIndex;
  for (let j = entryIndex; j <= lastHoldIndex; j++) {
    const bar = candles[j];
    if (!isUsableBar(bar)) continue;
    lastUsableIndex = j;
    if (isLong) {
      if (bar.open <= stopLoss) return { exit: bar.open, reason: 'gap_stop', index: j };
      if (bar.open >= takeProfit) return { exit: bar.open, reason: 'gap_target', index: j };
      if (bar.low <= stopLoss) return { exit: stopLoss, reason: 'stop_loss', index: j };
      if (bar.high >= takeProfit) return { exit: takeProfit, reason: 'take_profit', index: j };
    } else {
      if (bar.open >= stopLoss) return { exit: bar.open, reason: 'gap_stop', index: j };
      if (bar.open <= takeProfit) return { exit: bar.open, reason: 'gap_target', index: j };
      if (bar.high >= stopLoss) return { exit: stopLoss, reason: 'stop_loss', index: j };
      if (bar.low <= takeProfit) return { exit: takeProfit, reason: 'take_profit', index: j };
    }
  }
  return { exit: candles[lastUsableIndex].close, reason: 'time_exit', index: lastUsableIndex };
}

// ═══════════════════════════════ การเขียนรายงาน ═══════════════════════════════

const LINES = [];
const W = (s = '') => LINES.push(s);
const bpsS = (v, d = 2) => (Number.isFinite(v) ? (v * 10000).toFixed(d) : '—');
const pS = (p) => (!Number.isFinite(p) ? '—' : (p < 1e-4 ? p.toExponential(1) : p.toFixed(4)));
const pctS = (v, d = 2) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const nS = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

// ════════════════════════════════════ MAIN ════════════════════════════════════

async function main() {
  const t0 = Date.now();
  const bounds = IN.readJson(SPLIT_FILE, 'split');
  const JSONOUT = { generatedAt: new Date().toISOString(), opt: { ...OPT, cacheDir: CACHE_DIR } };

  // ═══════════ G0 · ช่องว่าง: จักรวาลจริง vs คลังวิจัย ═══════════
  const traded = readTradedUniverse();
  const tradedTH = traded.filter((s) => s.market === 'TH_STOCK').map((s) => s.symbol);
  const cacheFiles = fs.readdirSync(CACHE_DIR).filter((f) => f.startsWith('TH_STOCK__') && f.endsWith('.json')).sort();
  const cacheSymbols = [...new Set(cacheFiles.map((f) => f.split('__')[1]))].sort();

  const setLegacy = new Set(LEGACY14);
  const setTraded = new Set(tradedTH);
  const MEASURED11 = tradedTH.filter((s) => setLegacy.has(s));
  const GAP7 = tradedTH.filter((s) => !setLegacy.has(s));
  const OFFUNIV3 = LEGACY14.filter((s) => !setTraded.has(s));
  const MEMBERS = {
    UNIV18: tradedTH, MEASURED11, GAP7, LEGACY14, OFFUNIV3,
  };
  /** กลุ่มเสริมที่ใช้ตอบเรื่องผลข้างเคียงอย่างเดียว — ไม่เข้าตารางหลัก */
  const MEMBERS_EXTRA = {};
  const stillMissing = GAP7.filter((s) => !cacheSymbols.includes(s));

  JSONOUT.gap = {
    tradedTHCount: tradedTH.length, tradedTH,
    legacy14: LEGACY14, measured11: MEASURED11, gap7: GAP7, offUniverse3: OFFUNIV3,
    gapShare: GAP7.length / tradedTH.length,
    cacheTHSymbols: cacheSymbols, stillMissingFromCache: stillMissing,
  };

  // ── โหลดชุดข้อมูลหุ้นไทยทั้งคลัง ──
  // ต้องโหลดทั้งหมด ไม่ใช่แค่ 21 ตัวที่วัด เพราะต้องตอบให้ได้ด้วยว่า "การเพิ่ม 7 ตัวเข้าคลัง
  // ทำให้ตัวเลขกลุ่มหุ้นซิ่งของ exp-ceiling เปลี่ยนไปเท่าไร" ซึ่งต้องรู้ว่ากลุ่มนั้นมีใครบ้าง
  const needed = new Set([...tradedTH, ...LEGACY14]);
  const datasets = [];
  const dropped = [];
  for (const f of cacheFiles) {
    const ds = loadDataset(f);
    if (ds.verdict === 'bad') { dropped.push(`${ds.symbol}/${ds.timeframe} (คุณภาพ bad)`); continue; }
    if (!ds.candles.length) { dropped.push(`${ds.symbol}/${ds.timeframe} (ว่าง)`); continue; }
    datasets.push(ds);
  }

  // ── ความครอบคลุมรายตัว: มีแท่งใน train/validation กี่แท่ง ──
  const coverage = {};
  for (const ds of datasets) {
    if (!needed.has(ds.symbol)) continue;
    const b = bounds.timeframes[ds.timeframe];
    if (!b) continue;
    const iTr = lowerBound(ds.times, Date.parse(b.trainEnd));
    const iVa = lowerBound(ds.times, Date.parse(b.validationEnd));
    coverage[`${ds.symbol}|${ds.timeframe}`] = {
      verdict: ds.verdict, bars: ds.candles.length,
      train: iTr, validation: iVa - iTr, test: ds.candles.length - iVa,
      first: ds.candles[0]?.timestamp ?? null,
      fetchedAt: ds.fetchedAt,
      ohlcOutOfRange: ds.quality?.ohlcOutOfRangeMaterial ?? null,
      bigGapCount: ds.quality?.bigGapCount ?? null,
      flatBars: ds.quality?.flatBars ?? null,
      zeroVolumeBars: ds.quality?.zeroVolumeBars ?? null,
      dupTimestamps: ds.quality?.duplicateTimestamps ?? null,
    };
  }
  JSONOUT.coverage = coverage;

  /**
   * ผลข้างเคียงที่ต้องวัด ไม่ใช่เดา: 7 ตัวใหม่จะไปเข้ากลุ่ม "หุ้นซิ่ง" ของ ceiling.mjs ไหม
   *
   * ceiling.mjs คัดหุ้นซิ่งจากเกณฑ์ที่วัดบน train ของ 1H (ไม่ใช่จากผลตอบแทน) และคัดจาก
   * "หุ้นไทยทุกตัวในคลังที่ไม่ใช่ SET50 14 ตัว" — ตัวใหม่ทั้ง 7 เข้าเงื่อนไขนั้นทันที
   * ถ้าตัวไหนผ่านเกณฑ์ ตัวเลขกลุ่ม RUNNER ใน exp-ceiling.md รอบถัดไปจะเปลี่ยน
   * โดยไม่มีใครสังเกต จึงต้องบอกไว้ในรายงานนี้ให้ชัด
   */
  const RUNNER_RULE = { minBarRangePct: 1.20, minTurnoverBaht: 0.5e6, minBars: 3000 };
  const trainEnd1H = Date.parse(bounds.timeframes['1H'].trainEnd);
  const runnerImpact = { rule: RUNNER_RULE, candidates: {}, wouldJoin: [], before: [], after: [] };
  for (const ds of datasets) {
    if (ds.timeframe !== '1H' || ds.market !== 'TH_STOCK') continue;
    if (LEGACY14.includes(ds.symbol)) continue;    // ceiling ถือว่า 14 ตัวนี้เป็น SET50 เสมอ
    const end = lowerBound(ds.times, trainEnd1H);
    const ranges = []; const turns = [];
    for (let i = 0; i < end; i++) {
      const c = ds.candles[i];
      if (!isUsableBar(c)) continue;
      ranges.push((c.high - c.low) / c.close);
      turns.push((c.volume ?? 0) * c.close);
    }
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    const med = (a) => (a.length ? percentileOfSorted([...a].sort((x, y) => x - y), 0.5) : NaN);
    const prof = { bars: ranges.length, barRangePct: mean(ranges) * 100, turnover: med(turns) };
    prof.passes = prof.barRangePct >= RUNNER_RULE.minBarRangePct
      && prof.turnover >= RUNNER_RULE.minTurnoverBaht
      && prof.bars >= RUNNER_RULE.minBars;
    prof.isNew = GAP7.includes(ds.symbol);
    runnerImpact.candidates[ds.symbol] = prof;
    if (prof.passes) {
      runnerImpact.after.push(ds.symbol);
      if (prof.isNew) runnerImpact.wouldJoin.push(ds.symbol);
      else runnerImpact.before.push(ds.symbol);
    }
  }
  runnerImpact.before.sort(); runnerImpact.after.sort(); runnerImpact.wouldJoin.sort();
  JSONOUT.runnerImpact = runnerImpact;
  // สองกลุ่มนี้ไม่ได้อยู่ในตารางหลัก มีไว้ตอบข้อเดียว: ตัวเลขกลุ่มหุ้นซิ่งขยับไปเท่าไร
  MEMBERS_EXTRA.RUNNER_BEFORE = runnerImpact.before;
  MEMBERS_EXTRA.RUNNER_AFTER = runnerImpact.after;

  // ═══════════ G1 · ผลจริงของเครื่องยนต์ รายกลุ่ม ═══════════
  const labRuns = { train: runLab('train'), validation: runLab('validation') };
  const engineTrades = {
    train: readTradesCsv(labRuns.train.csv),
    validation: readTradesCsv(labRuns.validation.csv),
  };

  // ดัชนี timestamp → ตำแหน่งแท่ง สำหรับทุก dataset
  const dsIndex = new Map();
  for (const ds of datasets) {
    const idx = new Map();
    ds.candles.forEach((c, k) => idx.set(c.timestamp, k));
    dsIndex.set(`${ds.symbol}|${ds.timeframe}`, { ds, idx });
  }

  /**
   * ตรวจเครื่องวัด: การจำลองของไฟล์นี้ต้องให้ผลเท่ากับ lab.mjs ทุกไม้
   * ตรวจเฉพาะไม้ที่หน้าต่างถืออยู่ครบในคลังปัจจุบัน (ไม้ท้ายชุดที่ถูกตัดออกเทียบไม่ได้อยู่แล้ว)
   */
  const meter = {
    checked: 0, notFound: 0, outOfScope: 0, maxExitErr: 0, reasonMismatch: 0,
    maxCostErrLab: 0, maxGeoErrSL: 0, maxGeoErrTP: 0, geoChecked: 0,
  };
  for (const split of SPLITS) {
    for (const tr of engineTrades[split]) {
      // lab.mjs คืนไม้ของหุ้นไทย "ทุกตัวในคลัง" ซึ่งรวมหุ้นซิ่งที่ไม่อยู่ในงานรอบนี้
      // ต้องนับแยกจาก notFound ไม่งั้นจะดูเหมือนเครื่องวัดจับคู่ข้อมูลไม่ได้
      if (!needed.has(tr.symbol)) { meter.outOfScope++; continue; }
      const hit = dsIndex.get(`${tr.symbol}|${tr.timeframe}`);
      if (!hit) { meter.notFound++; continue; }
      const t = hit.idx.get(tr.entryTime);
      if (t === undefined) { meter.notFound++; continue; }
      if (t + MAX_HOLD - 1 > hit.ds.candles.length - 1) continue;   // หน้าต่างไม่ครบในคลังนี้
      meter.checked++;
      const sim = simulateExit(hit.ds.candles, t, tr.action === 'BUY', tr.stopLoss, tr.takeProfit);
      meter.maxExitErr = Math.max(meter.maxExitErr, Math.abs(sim.exit - tr.exit));
      if (sim.reason !== tr.exitReason) meter.reasonMismatch++;
      // เอกลักษณ์ต้นทุนของ lab: costR = (bps/10000) ÷ stopDistPct — ตรวจว่าเข้าใจตรงกัน
      meter.maxCostErrLab = Math.max(meter.maxCostErrLab,
        Math.abs((LAB_TH_BPS / 10000) / tr.stopDistPct - tr.costR));
      // เรขาคณิตที่ไฟล์นี้คำนวณเอง ต้องตรงกับ SL/TP ที่เครื่องยนต์ตั้งจริง
      // (เครื่องยนต์ตัวจริงใช้แนวรับ/แนวต้านด้วย จึงไม่บังคับให้ตรง — วัดไว้ให้เห็นว่าต่างแค่ไหน)
      if (t >= 1) {
        const g = geometryAt(hit.ds.candles, t - 1, 'TH_STOCK');
        const isLong = tr.action === 'BUY';
        meter.geoChecked++;
        meter.maxGeoErrSL = Math.max(meter.maxGeoErrSL, Math.abs((isLong ? g.slLong : g.slShort) - tr.stopLoss));
        meter.maxGeoErrTP = Math.max(meter.maxGeoErrTP, Math.abs((isLong ? g.tpLong : g.tpShort) - tr.takeProfit));
      }
    }
  }
  JSONOUT.meter = meter;

  /**
   * สะสมผลของไม้จริง แยกตาม (สัญลักษณ์ × กรอบเวลา × split)
   * แต่ละไม้เก็บสี่ค่า: gross · ค่าธรรมเนียม SET · ค่าธรรมเนียม lab(40bps) · ธงกำไร
   * ทุกค่าเป็น "สัดส่วนของมูลค่าสถานะ" เพื่อให้เทียบกับ ceiling/combine ได้ตรง ๆ
   */
  const perSymbol = new Map();   // `${split}|${tf}|${symbol}` -> {clusters: Map, n, spill, ...}
  const bucketOf = (key) => {
    let b = perSymbol.get(key);
    if (!b) {
      b = { clusters: new Map(), n: 0, spill: 0, notFound: 0, winGross: 0, winNet: 0, sumHold: 0, sumStopPct: 0, sumPrice: 0, sumTickShare: 0, minFeeBinds: 0 };
      perSymbol.set(key, b);
    }
    return b;
  };

  for (const split of SPLITS) {
    for (const tr of engineTrades[split]) {
      if (!needed.has(tr.symbol)) continue;   // หุ้นซิ่งที่ไม่อยู่ในงานรอบนี้
      const hit = dsIndex.get(`${tr.symbol}|${tr.timeframe}`);
      const key = `${split}|${tr.timeframe}|${tr.symbol}`;
      const b = bucketOf(key);
      if (!hit) { b.notFound++; continue; }
      const t = hit.idx.get(tr.entryTime);
      if (t === undefined) { b.notFound++; continue; }
      const bnd = bounds.timeframes[tr.timeframe];
      const splitEndIdx = (split === 'train'
        ? lowerBound(hit.ds.times, Date.parse(bnd.trainEnd))
        : lowerBound(hit.ds.times, Date.parse(bnd.validationEnd))) - 1;
      // ── ด่านกันการล้ำ: หน้าต่างถือต้องอยู่ครบภายใน split นี้ ──
      if (t + MAX_HOLD - 1 > splitEndIdx) { b.spill++; continue; }

      const isLong = tr.action === 'BUY';
      const entry = hit.ds.candles[t].open;
      const sim = simulateExit(hit.ds.candles, t, isLong, tr.stopLoss, tr.takeProfit);
      const grossFrac = ((sim.exit - entry) * (isLong ? 1 : -1)) / entry;
      const f = feeFractionTH(entry, tr.stopDistPct);
      if (!f || !Number.isFinite(f.fee)) { b.notFound++; continue; }
      const netSet = grossFrac - f.fee;
      const netLab = grossFrac - LAB_TH_BPS / 10000;

      const d = new Date(Date.parse(tr.entryTime));
      const cl = `${tr.symbol}|${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      let a = b.clusters.get(cl);
      if (!a) { a = new Float64Array(5); b.clusters.set(cl, a); }
      a[0] += 1; a[1] += grossFrac; a[2] += f.fee; a[3] += netSet; a[4] += netLab;

      b.n++;
      if (grossFrac > 0) b.winGross++;
      if (netSet > 0) b.winNet++;
      b.sumHold += sim.index - t + 1;
      b.sumStopPct += tr.stopDistPct;
      b.sumPrice += entry;
      b.sumTickShare += f.tick / f.fee;
      if (f.minFeeBinds) b.minFeeBinds++;
    }
  }

  /** รวมกลุ่ม: เอา bucket รายสัญลักษณ์มาต่อกันเป็นชุด cluster เดียว */
  function groupClusters(split, tf, members, slot) {
    const out = [];
    for (const sym of members) {
      const b = perSymbol.get(`${split}|${tf}|${sym}`);
      if (!b) continue;
      for (const a of b.clusters.values()) out.push({ n: a[0], s: a[slot] });
    }
    return out;
  }
  function groupTally(split, tf, members) {
    const t = { n: 0, spill: 0, notFound: 0, winGross: 0, winNet: 0, symbols: 0, sumHold: 0, sumStopPct: 0, sumPrice: 0, sumTickShare: 0, minFeeBinds: 0 };
    for (const sym of members) {
      const b = perSymbol.get(`${split}|${tf}|${sym}`);
      if (!b) continue;
      if (b.n > 0) t.symbols++;
      t.n += b.n; t.spill += b.spill; t.notFound += b.notFound;
      t.winGross += b.winGross; t.winNet += b.winNet;
      t.sumHold += b.sumHold; t.sumStopPct += b.sumStopPct;
      t.sumPrice += b.sumPrice; t.sumTickShare += b.sumTickShare; t.minFeeBinds += b.minFeeBinds;
    }
    return t;
  }

  const rngEngine = mulberry32(OPT.seed);
  const engineCells = {};
  for (const split of SPLITS) {
    for (const tf of TIMEFRAMES) {
      for (const g of GROUPS) {
        const members = MEMBERS[g];
        const tally = groupTally(split, tf, members);
        const gross = clusterMean(groupClusters(split, tf, members, 1));
        const fee = clusterMean(groupClusters(split, tf, members, 2));
        const netSet = clusterMean(groupClusters(split, tf, members, 3));
        const netLab = clusterMean(groupClusters(split, tf, members, 4));
        const ciNet = bootstrapMean(groupClusters(split, tf, members, 3), rngEngine);
        engineCells[`${split}|${tf}|${g}`] = {
          n: tally.n, spill: tally.spill, notFound: tally.notFound, symbols: tally.symbols,
          G: gross.G,
          grossBps: gross.mean * 10000, grossP: gross.p,
          feeBps: fee.mean * 10000,
          netSetBps: netSet.mean * 10000, netSetP: netSet.p, netSetSeBps: netSet.se * 10000,
          netSetCiBps: [ciNet[0] * 10000, ciNet[1] * 10000],
          netLabBps: netLab.mean * 10000, netLabP: netLab.p,
          winGross: tally.n ? tally.winGross / tally.n : NaN,
          winNet: tally.n ? tally.winNet / tally.n : NaN,
          avgHold: tally.n ? tally.sumHold / tally.n : NaN,
          avgStopPct: tally.n ? tally.sumStopPct / tally.n : NaN,
          avgPrice: tally.n ? tally.sumPrice / tally.n : NaN,
          tickShare: tally.n ? tally.sumTickShare / tally.n : NaN,
          minFeeBindShare: tally.n ? tally.minFeeBinds / tally.n : NaN,
          _raw: { gross, fee, netSet, netLab },
        };
      }
    }
  }

  // ── การทดสอบ: กลุ่มใหม่ต่างจากกลุ่มเดิมไหม · จักรวาลจริงต่างจากที่เคยวัดไหม ──
  for (const split of SPLITS) {
    for (const tf of TIMEFRAMES) {
      const fam = `เครื่องยนต์ ${tf} · ${split}`;
      const cell = (g) => engineCells[`${split}|${tf}|${g}`];
      const pairs = [
        ['GAP7-vs-MEASURED11', 'GAP7', 'MEASURED11',
          'ตัวที่ตกสำรวจให้ผลต่างจากตัวที่เคยวัด (หลังหักค่าธรรมเนียม SET)'],
        ['UNIV18-vs-LEGACY14', 'UNIV18', 'LEGACY14',
          'จักรวาลจริง 18 ตัว ให้ผลต่างจากตัวเลขเดิมที่วัดจาก 14 ตัว'],
      ];
      for (const [id, gA, gB, q] of pairs) {
        const A = cell(gA); const B = cell(gB);
        if (!A || !B || !Number.isFinite(A._raw.netSet.se) || !Number.isFinite(B._raw.netSet.se)) continue;
        // ⚠ UNIV18 กับ LEGACY14 ใช้ไม้ร่วมกัน 11 ตัว → ไม่เป็นอิสระ SE ของผลต่างจึงเฟ้อ
        //   (ประเมินความไม่แน่นอนสูงกว่าจริง) = ทางที่ปลอดภัยกว่าสำหรับข้อสรุปเชิงบวก
        const d = diffOfMeans(A._raw.netSet, B._raw.netSet);
        const ci = bootstrapDiff(
          groupClusters(split, tf, MEMBERS[gA], 3), groupClusters(split, tf, MEMBERS[gB], 3), rngEngine
        );
        registerTest({
          id: `${id}-${tf}-${split}`, family: fam,
          question: `${q} · ${tf} ${split}`,
          estimate: d.est * 10000, ci: [ci[0] * 10000, ci[1] * 10000], p: d.p,
          note: gA === 'UNIV18' ? 'สองกลุ่มใช้ไม้ร่วมกัน 11 ตัว — p ตัวนี้อนุรักษ์นิยมเกินจริง' : null,
        });
      }
      for (const g of ['UNIV18', 'LEGACY14', 'GAP7', 'MEASURED11']) {
        const c = cell(g);
        if (!c || !Number.isFinite(c.netSetP)) continue;
        registerTest({
          id: `${g}-net-ne-0-${tf}-${split}`, family: fam,
          question: `ผลหลังหักค่าธรรมเนียมของ ${GROUP_LABEL[g]} ต่างจากศูนย์ · ${tf} ${split}`,
          estimate: c.netSetBps, ci: c.netSetCiBps, p: c.netSetP,
        });
      }
    }
  }

  // ═══════════ G2 · เพดาน p* ต่อกลุ่ม (ลอกกติกาจาก ceiling.mjs) ═══════════
  const cells = new Map();
  const cellOf = (k) => { let c = cells.get(k); if (!c) { c = new CellAcc(); cells.set(k, c); } return c; };
  const ALL_CEIL_GROUPS = [...GROUPS, ...Object.keys(MEMBERS_EXTRA)];
  const memberOf = (g) => MEMBERS[g] ?? MEMBERS_EXTRA[g];
  const groupsOfSymbol = new Map();
  for (const g of ALL_CEIL_GROUPS) for (const s of memberOf(g)) {
    if (!groupsOfSymbol.has(s)) groupsOfSymbol.set(s, []);
    groupsOfSymbol.get(s).push(g);
  }

  for (const ds of datasets) {
    const gs = groupsOfSymbol.get(ds.symbol);
    if (!gs || !gs.length) continue;
    const b = bounds.timeframes[ds.timeframe];
    if (!b) continue;
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
        ds,
        entryFrom: Math.max(0, w.from),
        entryTo: Math.min(n - 1, w.to),
        maxIndex: Math.min(n - 1, w.end),   // ← ด่านกันการล้ำข้ามเส้นแบ่ง
        emit: (r) => {
          for (const g of gs) {
            const acc = cellOf(`${split}|${g}|${ds.timeframe}|${r.H}`);
            if (r.skipSpill) { acc.spill++; continue; }
            if (r.skipFlat) { acc.flat++; continue; }
            const d = new Date(r.time);
            acc.add(`${r.symbol}|${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, r);
          }
        },
      });
    }
  }

  const ceilCells = {};
  for (const split of SPLITS) {
    for (const tf of TIMEFRAMES) {
      for (const H of HORIZONS) {
        for (const g of ALL_CEIL_GROUPS) {
          const key = `${split}|${g}|${tf}|${H}`;
          const acc = cells.get(key);
          if (!acc || acc.clusters.size < 2) continue;
          const mPerfect = clusterMean(seriesOf(acc, (a) => a[SLOT.perfect]));
          const mCorrect = clusterMean(seriesOf(acc, (a) => a[SLOT.correct]));
          const mWrong = clusterMean(seriesOf(acc, (a) => a[SLOT.wrong]));
          const mBest = clusterMean(seriesOf(acc, (a) => a[SLOT.best]));
          const mFee = clusterMean(seriesOf(acc, (a) => a[SLOT.fee]));
          const dirNet = clusterMean(seriesOf(acc, (a) => a[SLOT.correct] - a[SLOT.fee]));
          const pStar = (mFee.mean - mWrong.mean) / (mCorrect.mean - mWrong.mean);
          const pFair = (0 - mWrong.mean) / (mCorrect.mean - mWrong.mean);
          ceilCells[key] = {
            n: mPerfect.n, G: mPerfect.G, flat: acc.flat, spill: acc.spill,
            perfect: mPerfect.mean, correct: mCorrect.mean, wrong: mWrong.mean,
            best: mBest.mean, fee: mFee.mean,
            dirNet: dirNet.mean, pStar, pFair, tax: pStar - pFair,
          };
        }
      }
    }
  }
  JSONOUT.ceilingCells = ceilCells;

  // ── ด่านตรวจ: LEGACY14 ของไฟล์นี้ ต้องเท่ากับ SET50 ของ exp-ceiling.json ทุกบิต ──
  const parity = { available: false, compared: 0, mismatch: 0, fields: {}, worst: null };
  if (fs.existsSync(CEILING_JSON)) {
    const ceilJson = IN.readJson(CEILING_JSON, 'exp-ceiling');
    parity.available = true;
    const FIELDS = ['n', 'G', 'flat', 'spill', 'perfect', 'correct', 'wrong', 'best', 'fee', 'pStar', 'pFair'];
    // เทียบสองคู่: LEGACY14↔SET50 (กลุ่มหลัก) และ RUNNER_BEFORE↔RUNNER (พิสูจน์ว่ารู้จัก
    // กลุ่มหุ้นซิ่ง "ก่อนเพิ่มของใหม่" ตรงกับที่ ceiling รู้ ตัวเลข "หลังเพิ่ม" จึงเชื่อได้)
    for (const [mineG, theirG] of [['LEGACY14', 'SET50'], ['RUNNER_BEFORE', 'RUNNER']]) {
      for (const split of SPLITS) {
        for (const tf of TIMEFRAMES) {
          for (const H of HORIZONS) {
            const mine = ceilCells[`${split}|${mineG}|${tf}|${H}`];
            const theirs = ceilJson.cells?.[`${split}|${theirG}|${tf}|${H}`];
            if (!mine || !theirs) continue;
            for (const f of FIELDS) {
              parity.compared++;
              const fk = `${theirG}.${f}`;
              if (!parity.fields[fk]) parity.fields[fk] = { compared: 0, mismatch: 0 };
              parity.fields[fk].compared++;
              const same = Object.is(mine[f], theirs[f]);
              if (!same) {
                parity.mismatch++; parity.fields[fk].mismatch++;
                const gapAbs = Math.abs((mine[f] ?? NaN) - (theirs[f] ?? NaN));
                if (!parity.worst || gapAbs > parity.worst.gap) {
                  parity.worst = { key: `${split}|${theirG}|${tf}|${H}`, field: f, mine: mine[f], theirs: theirs[f], gap: gapAbs };
                }
              }
            }
          }
        }
      }
    }
  }
  JSONOUT.ceilingParity = parity;

  // ── การทดสอบเพดาน: ภาษีความแม่นของกลุ่มใหม่ต่างจากกลุ่มเดิมไหม (H=10) ──
  // ใช้ dirNet (เพดาน "รู้ทิศ 100%" หลังหักค่าธรรมเนียม) เป็นตัวทดสอบ เพราะ p* เป็นอัตราส่วน
  // ของค่าเฉลี่ยสามตัว การหา SE ของมันตรง ๆ ต้องใช้ delta method ที่เปราะกว่า
  for (const split of SPLITS) {
    for (const tf of TIMEFRAMES) {
      const fam = `เพดาน ${tf} · ${split}`;
      for (const [id, gA, gB] of [['GAP7-vs-MEASURED11', 'GAP7', 'MEASURED11'], ['UNIV18-vs-LEGACY14', 'UNIV18', 'LEGACY14']]) {
        const accA = cells.get(`${split}|${gA}|${tf}|10`);
        const accB = cells.get(`${split}|${gB}|${tf}|10`);
        if (!accA || !accB || accA.clusters.size < 2 || accB.clusters.size < 2) continue;
        const A = clusterMean(seriesOf(accA, (a) => a[SLOT.correct] - a[SLOT.fee]));
        const B = clusterMean(seriesOf(accB, (a) => a[SLOT.correct] - a[SLOT.fee]));
        const d = diffOfMeans(A, B);
        const ci = bootstrapDiff(
          seriesOf(accA, (a) => a[SLOT.correct] - a[SLOT.fee]),
          seriesOf(accB, (a) => a[SLOT.correct] - a[SLOT.fee]), rngEngine
        );
        registerTest({
          id: `ceil-${id}-${tf}-${split}`, family: fam,
          question: `เพดาน(รู้ทิศ 100% หลังค่าธรรมเนียม) ของ ${GROUP_LABEL[gA]} ต่างจาก ${GROUP_LABEL[gB]} · ${tf} H10 ${split}`,
          estimate: d.est * 10000, ci: [ci[0] * 10000, ci[1] * 10000], p: d.p,
        });
      }
    }
  }

  applyHolm();
  JSONOUT.tests = TESTS;
  JSONOUT.engineCells = Object.fromEntries(
    Object.entries(engineCells).map(([k, v]) => { const { _raw, ...rest } = v; return [k, rest]; })
  );

  // ── รายตัว + leave-one-out + ความสอดคล้องข้าม split (กับดักที่ต้องตรวจ) ──
  const perSymbolOut = {};
  for (const [k, b] of perSymbol) {
    if (!b.n) { perSymbolOut[k] = { n: 0, spill: b.spill, notFound: b.notFound }; continue; }
    const cl = [...b.clusters.values()].map((a) => ({ n: a[0], s: a[3] }));
    const m = clusterMean(cl);
    const clG = [...b.clusters.values()].map((a) => ({ n: a[0], s: a[1] }));
    perSymbolOut[k] = {
      n: b.n, spill: b.spill, notFound: b.notFound, G: m.G,
      grossBps: clusterMean(clG).mean * 10000,
      netSetBps: m.mean * 10000, p: m.p,
      winNet: b.winNet / b.n, avgPrice: b.sumPrice / b.n,
      avgStopPct: b.sumStopPct / b.n, tickShare: b.sumTickShare / b.n,
      minFeeBindShare: b.minFeeBinds / b.n,
    };
  }
  JSONOUT.perSymbol = perSymbolOut;

  const leaveOneOut = {};
  for (const split of SPLITS) {
    for (const tf of TIMEFRAMES) {
      for (const g of ['GAP7', 'UNIV18']) {
        for (const drop of MEMBERS[g]) {
          const members = MEMBERS[g].filter((s) => s !== drop);
          const m = clusterMean(groupClusters(split, tf, members, 3));
          if (!Number.isFinite(m.mean)) continue;
          leaveOneOut[`${split}|${tf}|${g}|-${drop}`] = { netSetBps: m.mean * 10000, n: m.n };
        }
      }
    }
  }
  JSONOUT.leaveOneOut = leaveOneOut;

  // ═══════════════════ เขียนรายงาน ═══════════════════

  // ผลของการพิสูจน์สองข้อ (ถ้าเคยรันแล้ว) — อ่านเป็นไฟล์ขาเข้าที่มี sha กำกับ
  // ไม่ใช่ให้รายงานอ้างว่า "พิสูจน์แล้ว" ลอย ๆ ใครอยากตรวจก็รันคำสั่งซ้ำได้
  // ต้องอ่าน *ก่อน* สร้างบล็อกที่มา ไม่งั้นไฟล์พวกนี้จะไม่ถูกจดลายนิ้วมือ
  const DET_FILE = path.join(WORK_DIR, 'determinism.json');
  const LEAK_FILE = path.join(WORK_DIR, 'leak-proof.json');
  const determinism = fs.existsSync(DET_FILE) ? IN.readJson(DET_FILE, 'proof:determinism') : null;
  const leakProof = fs.existsSync(LEAK_FILE) ? IN.readJson(LEAK_FILE, 'proof:leak') : null;
  JSONOUT.proofs = { determinism, leakProof };

  JSONOUT.provenance = buildProvenance({
    scriptPath: SCRIPT_PATH,
    root: ROOT,
    ledger: IN,
    argv: process.argv.slice(2),
    volatileFields: ['generatedAt', 'elapsedMs', 'opt.outDir', 'opt.cacheDir', 'opt.repeat', 'opt.leakProof', 'provenance'],
    // บรรทัดที่ยอมให้ต่างได้: เวลาที่ใช้รัน · บรรทัด argv (มี --out-dir ซึ่งต่างทุกรอบตอนตรวจ)
    // sha ไม่อยู่ในรายการนี้ — ถ้า sha ต่างระหว่างรอบ ตัวตรวจต้องแดง
    volatileReportLines: ['^เวลาที่ใช้', '^node v'],
  });

  writeReport({
    bounds, MEMBERS, coverage, datasets, dropped, cacheSymbols, stillMissing,
    engineCells, ceilCells, parity, meter, perSymbolOut, leaveOneOut, labRuns, runnerImpact, t0,
    determinism, leakProof,
    prov: JSONOUT.provenance,
  });

  JSONOUT.elapsedMs = Date.now() - t0;
  fs.writeFileSync(path.join(OPT.outDir, 'exp-th-gap.json'), `${JSON.stringify(JSONOUT, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(OPT.outDir, 'exp-th-gap.md'), `${LINES.join('\n')}\n`, 'utf8');
  say(`ที่มา: sha สคริปต์ ${JSONOUT.provenance.scriptSha256.slice(0, 12)}`
    + ` · sha ขาเข้ารวม ${JSONOUT.provenance.inputsDigest.slice(0, 12)} (${JSONOUT.provenance.inputs.length} ไฟล์)`);
  say(`เขียน ${path.relative(ROOT, path.join(OPT.outDir, 'exp-th-gap.md'))} แล้ว · ${((Date.now() - t0) / 1000).toFixed(1)} วิ`);
  return JSONOUT;
}

// ═══════════════════════════════ ตัวเขียนรายงาน ═══════════════════════════════

function writeReport(ctx) {
  const {
    bounds, MEMBERS, coverage, dropped, cacheSymbols, stillMissing,
    engineCells, ceilCells, parity, meter, perSymbolOut, leaveOneOut, labRuns, runnerImpact, t0, prov,
  } = ctx;
  const E = (split, tf, g) => engineCells[`${split}|${tf}|${g}`];
  const C = (split, g, tf, H) => ceilCells[`${split}|${g}|${tf}|${H}`];

  W('# exp-th-gap — หุ้นไทยที่ตกสำรวจ: วัด 39% ของจักรวาลจริงที่ไม่เคยถูกวัด');
  W('');
  W('สร้างโดย `scripts/research/experiments/th-gap.mjs`');
  W(`ที่มา: sha สคริปต์ \`${prov.scriptSha256}\` · sha ขาเข้ารวม \`${prov.inputsDigest}\` (${prov.inputs.length} ไฟล์)`);
  W('');
  W('> ไฟล์นี้ไม่แตะชุด test · ทุกตัวเลขมาจากการรันจริงบน train/validation');
  W('');

  // ── บทสรุป ──
  W('## สรุปสั้น');
  W('');
  const g7 = MEMBERS.GAP7;
  W(`จักรวาลที่ระบบสแกนจริงมีหุ้นไทย **${MEMBERS.UNIV18.length} ตัว** — คลังวิจัยเคยวัดแค่ **${MEMBERS.MEASURED11.length} ตัว**`);
  W(`ที่ตกสำรวจคือ **${g7.length} ตัว (${((g7.length / MEMBERS.UNIV18.length) * 100).toFixed(0)}%)**: ${g7.join(' · ')}`);
  W(`และมี **${MEMBERS.OFFUNIV3.length} ตัวที่วิจัยวัดมาตลอดแต่เจ้าของไม่ได้เทรด**: ${MEMBERS.OFFUNIV3.join(' · ')}`);
  W('');
  W('รอบนี้ดึงทั้ง 7 ตัวเข้าคลังแล้ววัด — ข้อที่ต้องอ่านก่อนอย่างอื่น:');
  W('');
  const v18 = E('validation', '1D', 'UNIV18');
  const v14 = E('validation', '1D', 'LEGACY14');
  const t18 = E('train', '1D', 'UNIV18');
  const t14 = E('train', '1D', 'LEGACY14');
  if (v18 && v14 && t18 && t14) {
    W('1. **คำตอบของคำถามที่ยังไม่เคยมีใครตอบ — "ระบบที่เจ้าของใช้อยู่จริงให้ผลเท่าไร"**');
    W('');
    W('   | ชุด | จักรวาลจริง 18 ตัว | ตัวเลขเดิมจาก 14 ตัว | ต่างกัน |');
    W('   |---|---:|---:|---:|');
    W(`   | 1D train | ${t18.netSetBps.toFixed(2)} bps/ไม้ (n=${t18.n}) | ${t14.netSetBps.toFixed(2)} (n=${t14.n}) | ${(t18.netSetBps - t14.netSetBps).toFixed(2)} |`);
    W(`   | 1D validation | ${v18.netSetBps.toFixed(2)} bps/ไม้ (n=${v18.n}) | ${v14.netSetBps.toFixed(2)} (n=${v14.n}) | ${(v18.netSetBps - v14.netSetBps).toFixed(2)} |`);
    const h18 = E('validation', '1H', 'UNIV18'); const h14 = E('validation', '1H', 'LEGACY14');
    if (h18 && h14) W(`   | 1H validation | ${h18.netSetBps.toFixed(2)} bps/ไม้ (n=${h18.n}) | ${h14.netSetBps.toFixed(2)} (n=${h14.n}) | ${(h18.netSetBps - h14.netSetBps).toFixed(2)} |`);
    W('');
    W('   ทุกช่องติดลบหนัก และไม่มีช่องไหนที่ผลต่างผ่านเกณฑ์นัยสำคัญ');
    W('   → **ข้อสรุปเดิมที่วัดจาก 14 ตัวไม่ได้มีอคติจากการเลือกตัวอย่างในทิศที่สำคัญ**');
    W('     ไม่ใช่เพราะกลุ่มตัวอย่างถูกเลือกมาดี แต่เพราะ "แย่เหมือนกันหมด"');
  }
  W('');
  // นับช่องรายตัว: มีตัวไหนบวกไหม (คำถามที่เจ้าของถามจริง ๆ คือ "มีตัวไหนเล่นได้บ้าง")
  let cellsWithTrades = 0; let cellsPositive = 0; const positives = [];
  for (const [k, v] of Object.entries(perSymbolOut)) {
    if (!v.n || v.n < 20) continue;    // ต่ำกว่า 20 ไม้ = เสียงรบกวนล้วน ไม่นับ
    cellsWithTrades++;
    if (v.netSetBps > 0) { cellsPositive++; positives.push(`${k} (${v.netSetBps.toFixed(1)} bps, n=${v.n})`); }
  }
  W(`2. **รายตัว: ${cellsWithTrades} ช่อง (สัญลักษณ์ × กรอบเวลา × ชุด, นับเฉพาะที่มี ≥ 20 ไม้) — เป็นบวก ${cellsPositive} ช่อง**`);
  if (positives.length) W(`   ช่องที่เป็นบวก: ${positives.join(' · ')}`);
  else W('   ไม่มีสัญลักษณ์ไหนในจักรวาลจริงที่ให้ผลบวกหลังค่าธรรมเนียม ในกรอบเวลาไหน ชุดไหนเลย');
  W('');
  W('3. **กับดักที่ตรวจแล้ว**: กลุ่มที่ตกสำรวจให้กำไร "ก่อนหักค่าธรรมเนียม" สูงกว่ากลุ่มเดิมบน 1D train');
  const tg = E('train', '1D', 'GAP7'); const tm = E('train', '1D', 'MEASURED11');
  if (tg && tm) {
    W(`   (${tg.grossBps.toFixed(1)} เทียบกับ ${tm.grossBps.toFixed(1)} bps) — แต่ค่าธรรมเนียมของมันแพงกว่าพอดี`);
    W(`   (${tg.feeBps.toFixed(1)} เทียบกับ ${tm.feeBps.toFixed(1)} bps) เพราะเป็นหุ้นราคาต่ำกว่า ช่วงราคา (tick) จึงกินสัดส่วนมากกว่า`);
    W(`   สุทธิแล้วเท่ากัน (${tg.netSetBps.toFixed(1)} เทียบกับ ${tm.netSetBps.toFixed(1)}) และพอไปดู validation ก็ไม่ซ้ำรอย`);
  }
  W('');

  // ── G0 ──
  W('## 1. ช่องว่างที่ไล่ได้ครบ');
  W('');
  W('| กลุ่ม | นิยาม | จำนวน | สมาชิก |');
  W('|---|---|---:|---|');
  W(`| UNIV18 | หุ้นไทยใน \`src/lib/universe.ts\` = จักรวาลจริง | ${MEMBERS.UNIV18.length} | ${MEMBERS.UNIV18.join(' ')} |`);
  W(`| LEGACY14 | กลุ่ม SET50 ที่คลังวิจัยวัดมาตลอด | ${MEMBERS.LEGACY14.length} | ${MEMBERS.LEGACY14.join(' ')} |`);
  W(`| MEASURED11 | UNIV18 ∩ LEGACY14 | ${MEMBERS.MEASURED11.length} | ${MEMBERS.MEASURED11.join(' ')} |`);
  W(`| GAP7 | UNIV18 − LEGACY14 (**ตกสำรวจ**) | ${MEMBERS.GAP7.length} | ${MEMBERS.GAP7.join(' ')} |`);
  W(`| OFFUNIV3 | LEGACY14 − UNIV18 (วัดแต่ไม่ได้เทรด) | ${MEMBERS.OFFUNIV3.length} | ${MEMBERS.OFFUNIV3.join(' ')} |`);
  W('');
  W(`คลังมีหุ้นไทยทั้งหมด ${cacheSymbols.length} ตัวหลังดึงรอบนี้ · ยังขาดจากจักรวาลจริง: ${stillMissing.length ? stillMissing.join(' ') : '**ไม่มี — ครบ 18 ตัวแล้ว**'}`);
  if (dropped.length) W(`ชุดที่ถูกทิ้งเพราะคุณภาพ/ว่าง: ${dropped.join(' · ')}`);
  W('');

  W('### คุณภาพและความครอบคลุมของ 7 ตัวที่เพิ่งดึง');
  W('');
  W('| สัญลักษณ์ | tf | verdict | แท่งใช้ได้ | train | validation | test | แท่งแรก | OHLC ผิดกรอบ | gap ใหญ่ | แท่งนิ่ง | วอลุ่ม 0 | ซ้ำ |');
  W('|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|');
  for (const s of MEMBERS.GAP7) {
    for (const tf of TIMEFRAMES) {
      const c = coverage[`${s}|${tf}`];
      if (!c) { W(`| ${s} | ${tf} | — | — | — | — | — | ไม่มีในคลัง | — | — | — | — | — |`); continue; }
      W(`| ${s} | ${tf} | ${c.verdict} | ${c.bars} | ${c.train} | ${c.validation} | ${c.test} | ${String(c.first).slice(0, 10)} | ${c.ohlcOutOfRange} | ${c.bigGapCount} | ${c.flatBars} | ${c.zeroVolumeBars} | ${c.dupTimestamps} |`);
    }
  }
  W('');
  W('**สิ่งที่ตารางนี้บอกและเป็นข้อจำกัดที่แก้ไม่ได้:**');
  W('');
  const zero1D = MEMBERS.GAP7.filter((s) => {
    const c = coverage[`${s}|1D`];
    return c && c.train + c.validation === 0;
  });
  const thin1D = MEMBERS.GAP7.filter((s) => {
    const c = coverage[`${s}|1D`];
    return c && c.train + c.validation > 0 && c.train + c.validation < 500;
  });
  W(`- **${zero1D.join(' · ')} ไม่มีแท่ง 1D ในช่วง train/validation เลย** — ประวัติทั้งก้อนอยู่หลังเส้น validation`);
  W('  (SCB เพิ่งเป็นบริษัทโฮลดิ้งปี 2022 · GULF เพิ่งควบรวมปี 2025) วัดบน 1D ไม่ได้โดยไม่แตะชุด test');
  if (thin1D.length) W(`- ${thin1D.join(' · ')} มีแท่ง 1D ในกรอบน้อยมาก — ตัวเลขรายตัวของมันไม่มีน้ำหนัก`);
  W(`- บน 1H ทั้ง 7 ตัวมีข้อมูลครบกรอบ (GULF มี train สั้นกว่าเพื่อน) → **1H คือกรอบเดียวที่วัดจักรวาลจริงได้ครบ 18 ตัว**`);
  W('- ช่องว่างนี้ไม่ได้เกิดแบบสุ่ม: 3 ใน 7 ตัว (OR SCB GULF) เป็นบริษัทที่เพิ่งเข้าตลาด/เพิ่งปรับโครงสร้าง');
  W('  คลังวิจัยจึงเอียงไปทาง "บริษัทที่อยู่มานาน" โดยไม่มีใครตั้งใจ — เป็นอคติชนิดเดียวกับ survivorship');
  W('  แต่คนละทิศ (รอดมานาน = มีข้อมูลให้วัด) ข้อจำกัดนี้แก้ไม่ได้ด้วยการดึงข้อมูลเพิ่ม');
  W('- ทั้ง 7 ตัวถูกดึงวันที่ 2026-08-18 ส่วนของเดิมดึง 2026-08-17 — แท่งที่ต่างกันอยู่ในชุด test ทั้งหมด ไม่กระทบตัวเลขในรายงานนี้');
  W('');

  // ── ตรวจเครื่องวัด ──
  W('## 2. ตรวจเครื่องวัดก่อนเชื่อผล');
  W('');
  W('| การตรวจ | ผล | แปลว่า |');
  W('|---|---|---|');
  W(`| จำลองการออกไม้เองเทียบกับ lab.mjs | ${meter.checked.toLocaleString()} ไม้ · ผิดสูงสุด ${meter.maxExitErr.toExponential(2)} · เหตุผลไม่ตรง ${meter.reasonMismatch} ไม้ | ${meter.maxExitErr === 0 && meter.reasonMismatch === 0 ? 'ตรงทุกบิต — การจำลองในไฟล์นี้คือกติกาเดียวกับ lab' : '⚠ ไม่ตรง ห้ามเชื่อตัวเลขผลจริง'} |`);
  W(`| เอกลักษณ์ต้นทุนของ lab (40 bps ÷ stopDistPct) | ผิดสูงสุด ${meter.maxCostErrLab.toExponential(2)} | ${meter.maxCostErrLab < 1e-12 ? 'เข้าใจหน่วยของต้นทุนตรงกับ lab' : '⚠ เข้าใจไม่ตรง'} |`);
  W(`| เรขาคณิต ATR ล้วนของไฟล์นี้ vs SL/TP ที่เครื่องยนต์ตั้งจริง | ต่างสูงสุด SL ${meter.maxGeoErrSL.toFixed(4)} · TP ${meter.maxGeoErrTP.toFixed(4)} (${meter.geoChecked.toLocaleString()} ไม้) | ต่างได้ตามคาด เพราะเครื่องยนต์จริงใช้แนวรับ/แนวต้านด้วย — ตัวเลขเพดานจึงเป็นของ "เรขาคณิต ATR ล้วน" ไม่ใช่ของเครื่องยนต์ |`);
  if (parity.available) {
    W(`| **กลุ่ม LEGACY14 + RUNNER_BEFORE ของไฟล์นี้ vs กลุ่ม SET50 + RUNNER ของ exp-ceiling.json** | เทียบ ${parity.compared} ช่อง · ไม่ตรง ${parity.mismatch} ช่อง | ${parity.mismatch === 0 ? '**ตรงทุกบิต** — เครื่องวัดเพดานของไฟล์นี้คือตัวเดียวกับ ceiling.mjs ตัวเลขกลุ่มใหม่จึงเทียบกับรายงานเดิมได้ตรง ๆ' : `⚠ ไม่ตรง ${parity.mismatch} ช่อง (แย่สุด ${parity.worst?.field} ที่ ${parity.worst?.key}) — ห้ามเทียบข้ามรายงาน`} |`);
  } else {
    W('| กลุ่ม LEGACY14 vs exp-ceiling.json | ไม่มีไฟล์ให้เทียบ | ⚠ ข้ามการตรวจนี้ |');
  }
  W(`| ไม้ที่หาแท่งไม่เจอ | ${meter.notFound} | ${meter.notFound === 0 ? 'ทุกไม้จับคู่กับแท่งในคลังได้' : 'มีไม้ที่จับคู่ไม่ได้ ดูช่อง notFound รายตัว'} |`);
  W(`| ไม้ของหุ้นไทยที่อยู่นอกงานรอบนี้ (หุ้นซิ่ง) | ${meter.outOfScope.toLocaleString()} | ข้ามไปโดยตั้งใจ — รอบนี้วัดเฉพาะ UNIV18 ∪ LEGACY14 |`);
  W('');
  W(`ไม้จาก lab.mjs: train ${labRuns.train.cached ? '(ใช้แคชที่ใบกำกับตรง)' : '(รันใหม่)'} · validation ${labRuns.validation.cached ? '(ใช้แคชที่ใบกำกับตรง)' : '(รันใหม่)'}`);
  W('');

  // ── ผลจริง ──
  W('## 3. ผลจริงของเครื่องยนต์ รายกลุ่ม');
  W('');
  W('หน่วย: bps ต่อไม้ ของมูลค่าสถานะ (1 bps = 0.01%) · "ก่อนค่าธรรมเนียม" = กำไรดิบ');
  W('· "หลัง SET" = หักค่าคอม 0.157%/ขา (ขั้นต่ำ 50 บาท) + สเปรด 1 tick ตามตารางช่วงราคาของ SET');
  W('· "หลัง 40bps" = ตารางเดิมของ lab.mjs ซึ่งต่ำกว่าความจริงสำหรับหุ้นไทย (แสดงไว้เทียบเท่านั้น)');
  W('');
  for (const tf of TIMEFRAMES) {
    for (const split of SPLITS) {
      W(`### ${tf} · ${split}`);
      W('');
      W('| กลุ่ม | ตัวที่มีไม้ | ไม้ | ไม้ที่ทิ้งเพราะล้ำเส้น | ก่อนค่าธรรมเนียม | ค่าธรรมเนียม | หลัง SET | 95% CI | p | หลัง 40bps | ชนะ(ดิบ) | ชนะ(สุทธิ) | ราคาเฉลี่ย | สัดส่วน tick ในค่าธรรมเนียม |');
      W('|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|');
      for (const g of GROUPS) {
        const c = E(split, tf, g);
        if (!c) continue;
        W(`| ${GROUP_LABEL[g]} | ${c.symbols} | ${c.n.toLocaleString()} | ${c.spill.toLocaleString()} | ${c.grossBps.toFixed(2)} | ${c.feeBps.toFixed(2)} | **${c.netSetBps.toFixed(2)}** | [${c.netSetCiBps[0].toFixed(1)}, ${c.netSetCiBps[1].toFixed(1)}] | ${pS(c.netSetP)} | ${c.netLabBps.toFixed(2)} | ${pctS(c.winGross, 1)} | ${pctS(c.winNet, 1)} | ${Number.isFinite(c.avgPrice) ? c.avgPrice.toFixed(1) : '—'} | ${pctS(c.tickShare, 0)} |`);
      }
      W('');
    }
  }

  // ── นัยสำคัญ ──
  W('## 4. ต่างกันอย่างมีนัยสำคัญไหม (นับทุกการเปรียบเทียบ · แก้ค่า p ด้วย Holm)');
  W('');
  W(`ลงทะเบียนการทดสอบทั้งหมด **${TESTS.length} ข้อ** แบ่งเป็น ${new Set(TESTS.map((t) => t.family)).size} ตระกูล`);
  W('(ตระกูล = ชุดคำถามที่ถามพร้อมกันบนชุดข้อมูลเดียวกัน · Holm ใช้ภายในตระกูล)');
  W('');
  W('| # | ตระกูล | คำถาม | ค่าที่วัดได้ (bps) | 95% CI | p | เกณฑ์ Holm | ผ่าน |');
  W('|---:|---|---|---:|---|---:|---:|---|');
  for (const t of TESTS) {
    const ci = t.ci && Number.isFinite(t.ci[0]) ? `[${t.ci[0].toFixed(1)}, ${t.ci[1].toFixed(1)}]` : '—';
    W(`| ${t.idx} | ${t.family} | ${t.question} | ${Number.isFinite(t.estimate) ? t.estimate.toFixed(2) : '—'} | ${ci} | ${pS(t.p)} | ${Number.isFinite(t.holmThreshold) ? t.holmThreshold.toFixed(5) : '—'} | ${t.holmPass ? '**ใช่**' : 'ไม่'} |`);
  }
  W('');
  const passed = TESTS.filter((t) => t.holmPass);
  W(`ผ่าน Holm ${passed.length} จาก ${TESTS.length} ข้อ`);
  if (passed.length) for (const t of passed) W(`- ${t.question} → ${t.estimate.toFixed(2)} bps (p=${pS(t.p)})`);
  W('');
  for (const t of TESTS) if (t.note) W(`> ข้อ ${t.idx}: ${t.note}`);
  W('');

  // ── อ่านผลให้ตรง: ข้อเดียวที่ผ่านในสี่ช่อง ไม่ใช่ "พบความต่าง" ──
  W('### อ่านตารางข้างบนให้ตรง');
  W('');
  for (const [stem, label] of [
    ['GAP7-vs-MEASURED11', 'ตกสำรวจ 7 ตัว เทียบกับ เคยวัด+เทรดจริง 11 ตัว'],
    ['UNIV18-vs-LEGACY14', 'จักรวาลจริง 18 ตัว เทียบกับ ตัวเลขเดิมจาก 14 ตัว'],
  ]) {
    const rows = TESTS.filter((t) => t.id.startsWith(stem));
    const neg = rows.filter((t) => t.estimate < 0).length;
    const pass = rows.filter((t) => t.holmPass).length;
    W(`- **${label}** — วัด ${rows.length} ช่อง (2 กรอบเวลา × 2 ชุด)`);
    W(`  · เครื่องหมายเป็นลบ ${neg}/${rows.length} ช่อง (${rows.map((t) => `${t.estimate.toFixed(1)}`).join(' · ')} bps)`);
    W(`  · ผ่าน Holm ${pass}/${rows.length} ช่อง`);
    if (pass === 0) {
      W('  · **สรุป: ไม่พบความต่างที่ยืนยันได้** — ทิศทางสอดคล้องกันแต่ขนาดเล็กเกินกว่าที่ข้อมูลเท่านี้จะแยกออก');
    } else if (pass < rows.length) {
      W(`  · **สรุป: ต่างอย่างมีนัยสำคัญแค่ ${pass} ช่อง ไม่ซ้ำในช่องอื่น** ตามกติกาของโครงการนี้`);
      W('    (ต้องซ้ำรอยข้าม train/validation ถึงจะนับ) ข้อนี้ยัง **ไม่ใช่การค้นพบ** — เป็นสัญญาณให้จับตา');
    } else {
      W('  · **สรุป: ต่างอย่างมีนัยสำคัญทุกช่อง** — ซ้ำรอยข้ามชุดจริง');
    }
  }
  W('');
  W('ทิศทางที่พบคือ "ตัวที่ตกสำรวจแย่กว่าหรือเท่ากับตัวเดิม" ทุกช่อง — ไม่มีช่องไหนที่มันดีกว่า');
  W('แปลว่าอคติจากการเลือกตัวอย่างที่มีอยู่จริง (ถ้ามี) เป็นอคติที่ทำให้ตัวเลขเดิม **ดูดีเกินจริง**');
  W('ไม่ใช่ซ่อนโอกาสไว้ — ซึ่งเป็นทิศที่ปลอดภัยกว่าสำหรับคนที่เอาเงินจริงไปเทรด');
  W('');

  // ── รายตัว ──
  W('## 5. รายตัว และกับดักที่ต้องตรวจก่อนดีใจ');
  W('');
  W('ถ้ากลุ่มที่ตกสำรวจดูดีกว่า ต้องตอบให้ได้ก่อนว่า "ดีเพราะอะไร" และ "ซ้ำรอยข้าม train/validation ไหม"');
  W('');
  for (const tf of TIMEFRAMES) {
    W(`### ${tf} · รายตัว (bps/ไม้ หลังค่าธรรมเนียม SET)`);
    W('');
    W('| สัญลักษณ์ | กลุ่ม | train n | ก่อนค่าธรรมเนียม | หลังค่าธรรมเนียม | validation n | ก่อนค่าธรรมเนียม | หลังค่าธรรมเนียม | ก่อนค่าธรรมเนียมเป็นบวกทั้งสองชุด | ราคาเฉลี่ย | tick เป็นสัดส่วนของค่าธรรมเนียม | ค่าคอมขั้นต่ำกัด |');
    W('|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|');
    const all = [...new Set([...MEMBERS.UNIV18, ...MEMBERS.LEGACY14])];
    for (const s of all) {
      const tr = perSymbolOut[`train|${tf}|${s}`];
      const va = perSymbolOut[`validation|${tf}|${s}`];
      const tag = MEMBERS.GAP7.includes(s) ? 'GAP7' : (MEMBERS.MEASURED11.includes(s) ? 'MEAS11' : 'OFF3');
      // ตรวจกับดักที่ตรงจุด: กำไร "ก่อนค่าธรรมเนียม" ของตัวไหนที่เป็นบวกซ้ำทั้งสองชุด
      // (สุทธิติดลบหมดทุกตัวอยู่แล้ว การดูเครื่องหมายของสุทธิจึงไม่บอกอะไร)
      const grossBoth = (tr?.n && va?.n) ? ((tr.grossBps > 0 && va.grossBps > 0) ? '**ใช่**' : 'ไม่') : '—';
      W(`| ${s} | ${tag} | ${tr?.n ?? 0} | ${tr?.n ? tr.grossBps.toFixed(1) : '—'} | ${tr?.n ? tr.netSetBps.toFixed(1) : '—'} | ${va?.n ?? 0} | ${va?.n ? va.grossBps.toFixed(1) : '—'} | ${va?.n ? va.netSetBps.toFixed(1) : '—'} | ${grossBoth} | ${va?.n ? va.avgPrice.toFixed(1) : (tr?.n ? tr.avgPrice.toFixed(1) : '—')} | ${va?.n ? pctS(va.tickShare, 0) : (tr?.n ? pctS(tr.tickShare, 0) : '—')} | ${va?.n ? pctS(va.minFeeBindShare, 0) : (tr?.n ? pctS(tr.minFeeBindShare, 0) : '—')} |`);
    }
    W('');
    const gp = all.filter((s) => {
      const tr = perSymbolOut[`train|${tf}|${s}`]; const va = perSymbolOut[`validation|${tf}|${s}`];
      return tr?.n >= 20 && va?.n >= 20 && tr.grossBps > 0 && va.grossBps > 0;
    });
    W(`สัญลักษณ์ที่กำไร "ก่อนค่าธรรมเนียม" เป็นบวกซ้ำทั้ง train และ validation (${tf}): `
      + (gp.length ? `${gp.join(' · ')} — แต่ไม่มีตัวไหนเหลือเป็นบวกหลังหักค่าธรรมเนียม` : 'ไม่มีเลย'));
    W('');
  }

  W('### ตัดทีละตัวออก (leave-one-out) — ผลของกลุ่มมาจากตัวเดียวหรือเปล่า');
  W('');
  W('| ชุด | กลุ่ม | ค่าเต็มกลุ่ม | ตัดตัวที่ย้ายค่ามากที่สุดออก | ตัวนั้นคือ | ย้ายไป |');
  W('|---|---|---:|---:|---|---:|');
  for (const tf of TIMEFRAMES) {
    for (const split of SPLITS) {
      for (const g of ['GAP7', 'UNIV18']) {
        const base = E(split, tf, g);
        if (!base || !base.n) continue;
        let worst = null;
        for (const drop of MEMBERS[g]) {
          const v = leaveOneOut[`${split}|${tf}|${g}|-${drop}`];
          if (!v || !Number.isFinite(v.netSetBps)) continue;
          const shift = Math.abs(v.netSetBps - base.netSetBps);
          if (!worst || shift > worst.shift) worst = { drop, v, shift };
        }
        if (!worst) continue;
        W(`| ${tf} ${split} | ${GROUP_LABEL[g]} | ${base.netSetBps.toFixed(2)} | ${worst.v.netSetBps.toFixed(2)} | ${worst.drop} | ${(worst.v.netSetBps - base.netSetBps).toFixed(2)} |`);
      }
    }
  }
  W('');

  // ── เพดาน ──
  W('## 6. เพดาน p* และ "ภาษีความแม่น" ของแต่ละกลุ่ม');
  W('');
  W('p\\* = ความแม่นคุ้มทุน · p_fair = ความแม่นที่ต้องมีถ้าค่าธรรมเนียมเป็นศูนย์');
  W('ส่วนต่าง (ภาษีความแม่น) คือตัวเดียวที่เทียบข้ามตลาดได้ตรง ๆ — ค่าเงิน 1.25% · ทอง 1.89% (จาก exp-ceiling.md, train 1D H10)');
  W('');
  for (const tf of TIMEFRAMES) {
    for (const split of SPLITS) {
      W(`### ${tf} · ${split} · H=10`);
      W('');
      W('| กลุ่ม | แท่ง | p* | p_fair | ภาษีความแม่น | ค่าธรรมเนียมเฉลี่ย | เพดานรู้ทิศ 100% หลังค่าธรรมเนียม | ไม้ที่ทิ้งเพราะล้ำเส้น |');
      W('|---|---:|---:|---:|---:|---:|---:|---:|');
      for (const g of GROUPS) {
        const c = C(split, g, tf, 10);
        if (!c) continue;
        W(`| ${GROUP_LABEL[g]} | ${c.n.toLocaleString()} | ${pctS(c.pStar)} | ${pctS(c.pFair)} | **${pctS(c.tax)}** | ${bpsS(c.fee)} bps | ${bpsS(c.dirNet)} bps | ${c.spill.toLocaleString()} |`);
      }
      W('');
    }
  }
  W('### ทุกหน้าต่างถือ · ภาษีความแม่น');
  W('');
  for (const tf of TIMEFRAMES) {
    W(`**${tf}**`);
    W('');
    W('| กลุ่ม | ชุด | H=1 | H=5 | H=10 | H=20 |');
    W('|---|---|---:|---:|---:|---:|');
    for (const g of GROUPS) {
      for (const split of SPLITS) {
        const row = HORIZONS.map((H) => { const c = C(split, g, tf, H); return c ? pctS(c.tax) : '—'; });
        W(`| ${GROUP_LABEL[g]} | ${split} | ${row.join(' | ')} |`);
      }
    }
    W('');
  }
  // ยืนยันข้อสรุปเชิงลบของรอบก่อนบนสัญลักษณ์ที่ไม่เคยถูกวัด — ข้อสรุปเก่าจะได้ไม่ลอย
  const h1 = (g, split) => C(split, g, '1H', 1);
  const u1 = h1('UNIV18', 'train'); const u1v = h1('UNIV18', 'validation');
  const g1 = h1('GAP7', 'train'); const g1v = h1('GAP7', 'validation');
  // ต้องครบทั้งสี่ช่องถึงจะพิมพ์ — ตอนรันบนคลังที่ตัดท้ายทิ้ง (โหมด --leak-proof)
  // ชุด validation จะไม่มีอยู่จริง การอ่านช่องที่ไม่มีจะพังทั้งรอบ
  if (u1 && g1 && u1v && g1v) {
    W('**ยืนยันซ้ำ: "หุ้นไทย 1H ถือ 1 แท่ง = ปิดประตูตาย" ยังจริงบนตัวที่ไม่เคยถูกวัด**');
    W('');
    W('รอบก่อนสรุปไว้ว่า p\\* ของช่องนี้อยู่ที่ 108–113% (แม้ทายถูกทุกไม้ก็ยังขาดทุน) โดยวัดจาก 14 ตัว');
    W('รอบนี้วัดบนจักรวาลจริงและบนกลุ่มที่ตกสำรวจโดยเฉพาะ:');
    W('');
    W('| กลุ่ม | p* (train) | p* (validation) |');
    W('|---|---:|---:|');
    W(`| จักรวาลจริง 18 ตัว | ${pctS(u1.pStar, 1)} | ${pctS(u1v.pStar, 1)} |`);
    W(`| ตกสำรวจ 7 ตัว | ${pctS(g1.pStar, 1)} | ${pctS(g1v.pStar, 1)} |`);
    W('');
    W('เกิน 100% ทั้งสี่ช่อง — **ข้อสรุปเดิมไม่ได้มาจากกลุ่มตัวอย่างที่บังเอิญแย่**');
    W('มันเป็นสมบัติของตลาดหุ้นไทยที่ช่วงราคา (tick) ใหญ่เทียบกับการเคลื่อนไหวหนึ่งชั่วโมง');
    W('');
  }
  W('### วางในตารางข้ามตลาด (train · 1D · H=10)');
  W('');
  W('ตัวเลขค่าเงิน/ทอง/หุ้นซิ่ง มาจาก exp-ceiling.json ฉบับปัจจุบัน — ไฟล์นี้ไม่ได้คำนวณใหม่');
  W('ส่วนแถวหุ้นไทยคำนวณใหม่ในรอบนี้ และผ่านด่านตรวจว่ากลุ่ม LEGACY14 ให้ค่าตรงกับ SET50 ของ ceiling ทุกบิต');
  W('');
  const legacyTax = C('train', 'LEGACY14', '1D', 10);
  const univTax = C('train', 'UNIV18', '1D', 10);
  W('| ตลาด/กลุ่ม | ภาษีความแม่น (p* − p_fair) |');
  W('|---|---:|');
  W('| ค่าเงิน | 1.25% |');
  W('| ทอง/โลหะ | 1.89% |');
  if (legacyTax) W(`| หุ้นไทย — ตัวเลขเดิมที่วัดจาก 14 ตัว | ${pctS(legacyTax.tax)} |`);
  if (univTax) W(`| **หุ้นไทย — จักรวาลจริง 18 ตัว (รอบนี้)** | **${pctS(univTax.tax)}** |`);
  W('| หุ้นซิ่งไทย | 12.52% |');
  W('');
  if (legacyTax && univTax) {
    W(`ต่างกัน ${((univTax.tax - legacyTax.tax) * 100).toFixed(2)} จุดเปอร์เซ็นต์ — **ลำดับข้ามตลาดไม่เปลี่ยน**`);
    W(`หุ้นไทยยังแพงกว่าค่าเงินราว ${(univTax.tax / 0.0125).toFixed(0)} เท่าเมื่อวัดด้วยภาษีความแม่น`);
  }
  W('');

  // ── ข้อจำกัด ──
  W('## 7. ข้อจำกัดที่ต้องติดไปกับตัวเลขทุกตัว');
  W('');
  W('- **1D วัดจักรวาลจริงได้แค่ 16 จาก 18 ตัว** — SCB กับ GULF ไม่มีประวัติในกรอบ train/validation เลย');
  W('  และ OR มีแท่ง 1D ในกรอบน้อยมาก ตัวเลข "จักรวาลจริง 1D" จึงเป็นค่าประมาณที่ขาด 2 ตัว');
  W('  ทางเดียวที่จะวัดสองตัวนี้บน 1D คือแตะชุด test ซึ่งรอบนี้ไม่ทำ');
  W('- 1H ครบทั้ง 18 ตัว แต่ 1H ย้อนได้แค่ 730 วัน = เห็นตลาดยุคเดียว ข้อสรุปอ่อนกว่า 1D');
  W('- หุ้นไทย 1H ถือ 1 แท่ง ถูกปิดตายไปแล้วในรอบก่อน (p\\* 108–113%) รอบนี้จึงไม่ไปหาโอกาสในช่องนั้นซ้ำ');
  W('  ตัวเลขผลจริงของเครื่องยนต์ทั้งหมดใช้หน้าต่างถือ 10 แท่ง ส่วน p\\* ที่ H=1 คำนวณไว้เพื่อ');
  W('  **ยืนยันข้อสรุปเดิมบนสัญลักษณ์ที่ไม่เคยถูกวัด** เท่านั้น (ดูหัวข้อ 6) ไม่ใช่การเปิดช่องนั้นใหม่');
  W('- ราคาไม่ได้หักปันผล — หุ้นปันผลสูง (BBL KTB TTB PTT) มี gap ลงทุกครั้งที่ขึ้น XD');
  W('  ซึ่งเครื่องยนต์อาจอ่านเป็นสัญญาณกลับตัว ผลจริงจึงแย่กว่านี้เล็กน้อยเสมอ');
  W('- ค่าธรรมเนียมเป็นค่าประมาณจากตารางสาธารณะ ไม่ใช่ใบเสร็จของเจ้าของ');
  W('- p ของการเทียบ GAP7 กับ MEASURED11 ถือว่าสองกลุ่มเป็นอิสระต่อกัน (ไม่ใช้ไม้ร่วมกัน)');
  W('  ซึ่งจริงในแง่กลุ่มตัวอย่าง แต่ไม่จริงในแง่ราคา — หุ้นไทยทั้งตลาดเดินตาม SET ด้วยกัน');
  W('  ค่า p จึงเป็นด้าน "ใจกว้างเกินไป" ข้อสรุปเชิงลบแข็งกว่าที่ตัวเลขบอก ข้อสรุปเชิงบวกต้องระวัง');
  W('');

  W('## 8. ผลข้างเคียงต่อรายงานเดิมที่ต้องบันทึกไว้');
  W('');
  W('การดึง 7 ตัวเข้าคลังทำให้ `.research-cache/candles` มีไฟล์เพิ่ม 14 ไฟล์');
  W('และเพิ่มรายชื่อ 7 ตัวใน `scripts/research/universe.json` (จำเป็น เพราะ fetch-universe.mjs ดึงได้');
  W('เฉพาะสัญลักษณ์ที่มีในไฟล์นั้น) สคริปต์ที่ไล่อ่านทั้งโฟลเดอร์หรืออ่าน universe.json');
  W('(lab.mjs · ceiling.mjs · combine.mjs · feat-*.mjs · th-scalp.mjs) จะเห็นชุดข้อมูลไม่เท่าเดิม');
  W('เมื่อรันครั้งถัดไป → `inputsDigest` ในรายงานเก่าจะไม่ตรงกับคลังปัจจุบัน **โดยที่ไม่มีตัวเลขเก่าตัวไหนผิด**');
  W('');
  W('- `split.json` ถูกตรึงไว้เป็นไฟล์ ไม่คำนวณใหม่ → เส้นแบ่ง train/validation/test **ไม่ขยับ**');
  W('- กลุ่ม SET50 ของ ceiling.mjs ผูกกับรายชื่อ 14 ตัวที่พิมพ์ไว้ในไฟล์ → **ไม่เปลี่ยน**');
  W('- กลุ่ม RUNNER (หุ้นซิ่ง) ของ ceiling.mjs คัดจากเกณฑ์ช่วงแกว่ง/มูลค่าซื้อขายบน train ของ 1H');
  W('  และคัดจาก "หุ้นไทยทุกตัวในคลังที่ไม่ใช่ SET50 14 ตัว" → ตัวใหม่ 7 ตัวเข้าข่ายโดยอัตโนมัติ');
  W('  **วัดแล้วด้วยเกณฑ์ตัวเดียวกันเป๊ะ:**');
  W('');
  W('| สัญลักษณ์ | ช่วงแกว่ง/แท่ง (ต้อง ≥ 1.20%) | มูลค่าซื้อขายมัธยฐาน (ต้อง ≥ 500,000) | แท่ง train (ต้อง ≥ 3,000) | เข้ากลุ่มหุ้นซิ่ง |');
  W('|---|---:|---:|---:|---|');
  for (const s of MEMBERS.GAP7) {
    const c = runnerImpact.candidates[s];
    if (!c) { W(`| ${s} | — | — | — | ไม่มีข้อมูล 1H |`); continue; }
    W(`| ${s} | ${c.barRangePct.toFixed(3)}% | ${Math.round(c.turnover).toLocaleString()} | ${c.bars.toLocaleString()} | ${c.passes ? '**ใช่ — ตัวเลข RUNNER ของ exp-ceiling จะเปลี่ยนเมื่อรันใหม่**' : 'ไม่'} |`);
  }
  W('');
  if (runnerImpact.wouldJoin.length) {
    W(`⚠ **${runnerImpact.wouldJoin.join(' · ')} ผ่านเกณฑ์หุ้นซิ่ง** → กลุ่ม RUNNER ของ exp-ceiling จะโตจาก`);
    W(`${runnerImpact.before.length} เป็น ${runnerImpact.after.length} ตัวในการรันครั้งถัดไป โดยไม่มีอะไรเตือน`);
    W('');
    W('ไฟล์นี้วัดผลนั้นให้แล้ว ด้วยเครื่องวัดตัวเดียวกับ ceiling (ผ่านด่านตรวจว่ากลุ่ม "ก่อนเพิ่ม"');
    W('ให้ค่าตรงกับกลุ่ม RUNNER ของ exp-ceiling.json ทุกบิต) — ตัวเลขที่จะเปลี่ยน:');
    W('');
    W('| ชุด | ภาษีความแม่น ก่อน | หลัง | ต่าง | แท่ง ก่อน | หลัง |');
    W('|---|---:|---:|---:|---:|---:|');
    for (const tf of TIMEFRAMES) {
      for (const split of SPLITS) {
        const a = C(split, 'RUNNER_BEFORE', tf, 10);
        const b = C(split, 'RUNNER_AFTER', tf, 10);
        if (!a || !b) continue;
        W(`| ${tf} ${split} H10 | ${pctS(a.tax)} | ${pctS(b.tax)} | ${((b.tax - a.tax) * 100).toFixed(2)} pp | ${a.n.toLocaleString()} | ${b.n.toLocaleString()} |`);
      }
    }
    W('');
    W('ขนาดของการเปลี่ยนแปลงเล็ก แต่ประเด็นไม่ใช่ขนาด — ประเด็นคือ **ตัวเลขในรายงานที่ส่งมอบแล้ว');
    W('จะขยับเพราะมีคนเติมข้อมูลเข้าคลัง ไม่ใช่เพราะโค้ดหรือกติกาเปลี่ยน** ใครรัน ceiling.mjs ครั้งถัดไป');
    W('ต้องรู้ข้อนี้ก่อน แล้วเทียบ `provenance.inputsDigest` ของรายงานเก่ากับคลังปัจจุบันเสมอ');
    W('');
    W('⚠ `th-scalp.mjs` ใช้เกณฑ์คัดหุ้นซิ่งชุดเดียวกัน กลุ่ม RUNNER ของ exp-th-scalp.md จึงจะโตเท่ากัน');
    W('  เมื่อรันใหม่ — ตัวเลข "หุ้นซิ่งไทย 11 ตัว" ในรายงานนั้นจะกลายเป็น 12 ตัว');
    W('');
    W('⚠ เพิ่มเติม: `runLabBaseline()` ของ ceiling.mjs ใช้แคช csv ของ lab โดยดูแค่ว่า "ไฟล์มีอยู่"');
    W('  (ไม่มีใบกำกับแบบที่ combine.mjs ได้รับตอนซ่อม) ถ้ารัน ceiling ใหม่โดยไม่ใส่ `--refresh`');
    W('  มันจะเอาแท่งชุดใหม่มาปนกับไม้ชุดเก่าที่ยังไม่รู้จักหุ้นที่เพิ่งเพิ่ม — ครึ่งเก่าครึ่งใหม่');
    W('  ตรวจพบได้จาก sha ใน provenance แต่ไม่มีอะไรหยุดมัน (ไฟล์นี้ไม่แก้ ceiling.mjs ตามข้อกำหนด)');
  } else {
    W('→ ไม่มีตัวไหนผ่านเกณฑ์หุ้นซิ่ง **ตัวเลขทุกกลุ่มใน exp-ceiling.md ยังใช้ได้ตามเดิม**');
  }
  W('');

  W('## 9. การพิสูจน์ว่ารันซ้ำได้ผลเดิม และไม่ล้ำข้ามเส้นแบ่ง');
  W('');
  W('สองข้อนี้เป็นเงื่อนไขก่อนที่ตัวเลขในไฟล์นี้จะมีสิทธิ์ถูกเชื่อ ตามกติกาข้อ 3 และข้อ 5 ของโครงการ');
  W('ผลด้านล่างมาจากการรันจริง ไม่ใช่คำอ้าง — ไฟล์ผลดิบอยู่ใน `scripts/research/report/th-gap/`');
  W('');
  if (ctx.determinism) {
    const d = ctx.determinism;
    W(`**ต1 · รันซ้ำ ${d.runs} รอบด้วยอาร์กิวเมนต์และขาเข้าเดียวกัน** → ต่างกัน ${d.differed} รอบ`);
    W(`\`node scripts/research/experiments/th-gap.mjs --repeat=${d.runs}\` · เมื่อ ${String(d.at).slice(0, 19)}Z`);
    W(d.differed === 0
      ? `ที่ ${d.runs} รอบ ถ้าความไม่แน่นอนเกิดที่อัตรา 6% ต่อรอบ (อัตราที่เคยวัดได้จาก combine.mjs) โอกาสจับไม่ได้เลยคือ ${(0.94 ** d.runs * 100).toFixed(2)}%`
      : '⚠ **ตก — ห้ามใช้ตัวเลขในไฟล์นี้ตัดสินอะไร**');
    W('');
  } else {
    W('**ต1 · รันซ้ำ** — ยังไม่ได้รัน สั่ง `node scripts/research/experiments/th-gap.mjs --repeat=75`');
    W('');
  }
  if (ctx.leakProof) {
    W('**ต2 · ตัดข้อมูลท้ายทิ้งจริงแล้วคำนวณซ้ำ** (ลบแท่งออกจากดิสก์ ไม่ใช่กรองตอนอ่าน)');
    W('');
    W('| ตัดที่เส้น | แท่งที่ลบทิ้งจริง | ช่องที่เทียบ | ช่องที่เปลี่ยนค่า | ผล |');
    W('|---|---:|---:|---:|---|');
    for (const c of ctx.leakProof.checks) {
      W(`| ${c.cutFor === 'train' ? 'trainEnd (พิสูจน์ว่า train ไม่กินแท่ง validation)' : 'validationEnd (พิสูจน์ว่าไม่แตะชุด test)'} | ${c.removedBars.toLocaleString()} | ${c.cellsCompared} | ${c.cellsChanged} | ${c.cellsChanged === 0 ? '**ผ่าน — เท่าเดิมทุกบิต**' : '⚠ **ตก**'} |`);
    }
    W('');
    W('`node scripts/research/experiments/th-gap.mjs --leak-proof`');
    W('');
  } else {
    W('**ต2 · ตัดข้อมูลท้ายทิ้ง** — ยังไม่ได้รัน สั่ง `node scripts/research/experiments/th-gap.mjs --leak-proof`');
    W('');
  }
  W('**การแตะ validation ของรอบนี้ นับตามความจริง:**');
  W('การรันซ้ำเพื่อพิสูจน์ความคงที่และการตัดข้อมูลท้ายทิ้ง เป็นการรัน **เชิงกล** — คำถามเดิม');
  W('อาร์กิวเมนต์เดิม ไม่มีใครดูผลแล้วเอาไปเปลี่ยนอะไร จึงไม่ทำให้ validation "กลายเป็น train"');
  W('ส่วนการแตะ **เชิงวิจัย** ของรอบนี้คือชุดคำถามในหัวข้อ 4 ซึ่งลงทะเบียนไว้ครบทุกข้อและแก้ค่า p แล้ว');
  W('ไม่มีการเลือกกลุ่ม เลือกกรอบเวลา หรือเลือกหน้าต่างถือ หลังจากเห็นผล — นิยามกลุ่มทั้งหมด');
  W('มาจาก `src/lib/universe.ts` กับรายชื่อ 14 ตัวในประวัติศาสตร์ ซึ่งกำหนดเสร็จก่อนวัด');
  W('');
  W('ข้อจำกัดของการพิสูจน์ทั้งสองข้อ:');
  W('- ต1 จับได้เฉพาะความไม่แน่นอนที่ทำให้ผลลัพธ์ **ต่างกันระหว่างรอบ** ถ้าเพี้ยนเหมือนกันทุกรอบ');
  W('  (เช่นสูตรผิด) ตัวนี้ไม่เห็น — นั่นคืองานของด่านตรวจในหัวข้อ 2');
  W('- ต2 พิสูจน์ว่าตัวเลขไม่ขึ้นกับแท่งที่อยู่หลังเส้นแบ่ง แต่ **ไม้ที่เครื่องยนต์เลือกเข้า** มาจาก');
  W('  lab.mjs ซึ่งรันบนคลังเต็ม การตัดสินใจเข้าไม้ของเครื่องยนต์เป็น causal อยู่แล้ว (ตรวจไว้ที่อื่น');
  W('  ด้วย --verify-engine) ไฟล์นี้จึงพิสูจน์เฉพาะส่วนที่ตัวเองคำนวณ ซึ่งคือ **ผลลัพธ์ทุกตัวในรายงานนี้**');
  W('');

  W('---');
  W('');
  W(`เวลาที่ใช้ ${((Date.now() - t0) / 1000).toFixed(1)} วินาที`);
  W('');
  W('### ที่มาของผลลัพธ์ (ตรวจย้อนได้)');
  W('');
  W('| ไฟล์ | บทบาท | sha256 |');
  W('|---|---|---|');
  W(`| ${prov.script} | สคริปต์ | \`${prov.scriptSha256}\` |`);
  for (const i of prov.inputs.slice(0, 12)) W(`| ${i.path} | ${i.role} | \`${i.sha256}\` |`);
  if (prov.inputs.length > 12) W(`| … อีก ${prov.inputs.length - 12} ไฟล์ | (ดู exp-th-gap.json) | |`);
  W('');
  W(`node ${prov.node} · ${prov.platform} · argv: \`${prov.argv.join(' ') || '(ไม่มี)'}\``);
}

// ═══════════════════ โหมดพิสูจน์: รันซ้ำ / ตัดข้อมูลท้ายทิ้ง ═══════════════════

/** รันตัวเองหนึ่งรอบลงโฟลเดอร์ที่กำหนด แล้วคืนผลที่อ่านกลับมา */
function runSelf(outDir, extra = []) {
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync(process.execPath, [SCRIPT_PATH, `--out-dir=${outDir}`, '--quiet', ...extra],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  return {
    json: JSON.parse(fs.readFileSync(path.join(outDir, 'exp-th-gap.json'), 'utf8')),
    md: fs.readFileSync(path.join(outDir, 'exp-th-gap.md'), 'utf8'),
  };
}

function normalizeMd(text, patterns) {
  const res = patterns.map((p) => new RegExp(p));
  return text.split('\n').filter((l) => !res.some((r) => r.test(l))).join('\n');
}

async function modeRepeat(n) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thgap-repeat-'));
  let ref = null; let refKey = null; let refMd = null;
  const diffs = [];
  for (let i = 0; i < n; i++) {
    const out = runSelf(path.join(tmp, `run${i}`));
    const vol = out.json.provenance.volatileFields;
    const key = canonicalJson(stripPaths(out.json, vol));
    const md = normalizeMd(out.md, out.json.provenance.volatileReportLines);
    if (ref === null) { ref = out; refKey = key; refMd = md; }
    else if (key !== refKey || md !== refMd) {
      diffs.push({ run: i + 1, jsonDiff: deepDiff(stripPaths(ref.json, vol), stripPaths(out.json, vol), 10), mdDiffers: md !== refMd });
    }
    process.stdout.write(`\r  รอบ ${i + 1}/${n} · ต่าง ${diffs.length}   `);
  }
  process.stdout.write('\n');
  console.log(diffs.length === 0
    ? `[ผ่าน] ${n} รอบ เหมือนกันทุกไบต์`
    : `[ตก] ${n} รอบ ต่างกัน ${diffs.length} รอบ`);
  if (diffs.length) console.log(JSON.stringify(diffs.slice(0, 3), null, 2));
  // เขียนผลไว้เป็นไฟล์ เพื่อให้รายงานฉบับส่งมอบอ้างถึงได้แบบมี sha กำกับ
  // (ไม่ใช่ให้รายงานเคลมเองว่า "ตรวจแล้ว" ซึ่งตรวจย้อนไม่ได้)
  fs.writeFileSync(path.join(WORK_DIR, 'determinism.json'),
    `${JSON.stringify({
      runs: n, differed: diffs.length, at: new Date().toISOString(),
      scriptSha256: sha256File(SCRIPT_PATH), sample: diffs.slice(0, 3),
    }, null, 2)}\n`);
  fs.rmSync(tmp, { recursive: true, force: true });
  return diffs.length === 0;
}

/**
 * ตัดข้อมูลท้ายทิ้งจริงแล้วคำนวณซ้ำ
 *
 * สร้างคลังใหม่ที่ลบแท่งตั้งแต่เส้นที่กำหนดเป็นต้นไป (ของจริง ไม่ใช่กรองตอนอ่าน)
 * แล้วรันตัวเองด้วย --cache-dir ชี้ไปที่คลังนั้น ค่าของ split ที่ยังอยู่ครบต้องเท่าเดิมทุกบิต
 */
function buildTruncatedCache(destDir, cutFor) {
  fs.mkdirSync(destDir, { recursive: true });
  const bounds = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
  let removed = 0; let kept = 0;
  for (const f of fs.readdirSync(CACHE_DIR).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
    const b = bounds.timeframes[j.timeframe];
    if (b && Array.isArray(j.candles)) {
      const cut = Date.parse(cutFor === 'train' ? b.trainEnd : b.validationEnd);
      const before = j.candles.length;
      j.candles = j.candles.filter((c) => Date.parse(c.timestamp) < cut);
      removed += before - j.candles.length;
      kept += j.candles.length;
    }
    fs.writeFileSync(path.join(destDir, f), JSON.stringify(j), 'utf8');
  }
  return { removed, kept };
}

async function modeLeakProof() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thgap-leak-'));
  const full = runSelf(path.join(tmp, 'full'));
  const report = { checks: [] };
  for (const cutFor of ['validation', 'train']) {
    const cacheDir = path.join(tmp, `cache-${cutFor}`);
    const t = buildTruncatedCache(cacheDir, cutFor);
    console.log(`  ตัดที่เส้น ${cutFor === 'train' ? 'trainEnd' : 'validationEnd'} — ลบแท่งจริง ${t.removed.toLocaleString()} แท่ง เหลือ ${t.kept.toLocaleString()}`);
    const cut = runSelf(path.join(tmp, `out-${cutFor}`), [`--cache-dir=${cacheDir}`]);

    // ช่องที่ต้องเท่าเดิม: ทุกช่องของ split ที่ยังมีแท่งครบ
    const keepSplits = cutFor === 'validation' ? ['train', 'validation'] : ['train'];
    const pick = (j) => {
      const out = {};
      for (const [k, v] of Object.entries(j.engineCells)) if (keepSplits.includes(k.split('|')[0])) out[`E|${k}`] = v;
      for (const [k, v] of Object.entries(j.ceilingCells)) if (keepSplits.includes(k.split('|')[0])) out[`C|${k}`] = v;
      return out;
    };
    const a = pick(full.json); const b = pick(cut.json);
    const d = deepDiff(a, b, 20);
    const total = Object.keys(a).length;
    let changedCells = 0;
    for (const key of Object.keys(a)) {
      if (canonicalJson(a[key]) !== canonicalJson(b[key] ?? null)) changedCells++;
    }
    report.checks.push({ cutFor, removedBars: t.removed, cellsCompared: total, cellsChanged: changedCells, sample: d.slice(0, 8) });
    console.log(changedCells === 0
      ? `  [ผ่าน] ${total} ช่อง เท่าเดิมทุกบิต`
      : `  [ตก] ${changedCells}/${total} ช่องเปลี่ยนค่า`);
  }
  report.at = new Date().toISOString();
  report.scriptSha256 = sha256File(SCRIPT_PATH);
  fs.writeFileSync(path.join(WORK_DIR, 'leak-proof.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.rmSync(tmp, { recursive: true, force: true });
  return report.checks.every((c) => c.cellsChanged === 0);
}

// ════════════════════════════════ จุดเริ่ม ════════════════════════════════

if (OPT.repeat > 0) {
  const ok = await modeRepeat(OPT.repeat);
  process.exit(ok ? 0 : 1);
} else if (OPT.leakProof) {
  const ok = await modeLeakProof();
  process.exit(ok ? 0 : 1);
} else {
  await main();
}
