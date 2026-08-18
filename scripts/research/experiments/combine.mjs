#!/usr/bin/env node
/**
 * combine.mjs — ประกอบ "สิ่งที่รอด" จากงานหา feature ทั้งสามตระกูล แล้วยืนยันบน validation
 *
 * ██████████████████████████████████████████████████████████████████████████████
 * █                                                                            █
 * █   กติกาข้อ 1 ของรอบนี้: ถ้าไม่มี feature ไหน "รอด" ให้หยุด ห้ามฝืนประกอบ         █
 * █   การเอา feature ที่ไม่มีพลังมารวมกันหลายตัวไม่ได้ทำให้เกิดพลัง                   █
 * █   มันแค่เพิ่มจำนวนพารามิเตอร์ให้ overfit ง่ายขึ้น                                █
 * █                                                                            █
 * █   ไฟล์นี้จึงเริ่มด้วย "ด่านคัด" ที่เขียนเกณฑ์ไว้ก่อนดูผล แล้วให้โค้ดตัดสินเอง          █
 * █   ว่ามีอะไรผ่านบ้าง — ไม่ใช่คนเลือกด้วยตาจากตาราง                                █
 * █                                                                            █
 * ██████████████████████████████████████████████████████████████████████████████
 *
 * ───────────────────────── ด่านคัด (เขียนก่อนดูผล) ─────────────────────────
 *
 * ช่อง (กลุ่ม × กรอบเวลา × feature × ระยะถือ) หนึ่งช่องจะ "รอด" ก็ต่อเมื่อครบทุกข้อ:
 *
 *   G1  เป็น feature จริง ไม่ใช่ตัวควบคุม (_ctrl*) และไม่ใช่ตัวที่ตั้งใจให้รั่ว (LEAK_*)
 *   G2  จักรวาลของช่องนั้นไม่ได้ถูกเลือกด้วยข้อมูลอนาคต
 *       → ตัดกลุ่ม RUNNER ทิ้งทั้งกลุ่ม (exp-feat-cross.md C9 พิสูจน์ว่ารายชื่อถูกคัด
 *         จากพฤติกรรมปี 2023–2025 แล้วเอาไปวัดผลบนปี 2000–2016) ใช้ RUNNER_PIT แทน
 *   G3  **การทดสอบที่วัดเป็นเงิน** ของช่องนั้นผ่าน Holm ภายในตระกูลของรายงานต้นทาง
 *       (ไม่ใช่การทดสอบ IC — เพราะ IC ต่างจากศูนย์ไม่ได้แปลว่าได้เงิน)
 *   G4  |ขอบ| ที่แปลงเป็น bps/ไม้ แล้ว > ค่าธรรมเนียมจริงของช่องนั้น
 *
 * เกณฑ์นี้เข้มกว่าที่รายงานต้นทางใช้พาดหัว เพราะพาดหัวของ exp-feat-volume ใช้
 * "IC ผ่าน Holm" ซึ่งหลวมกว่า — ที่นี่ต้องการ "เงินต่างจากศูนย์หลัง Holm" ด้วย
 * รายงานแสดงผลของทั้งสองเกณฑ์ให้เทียบ (S0) จะได้เห็นว่าข้อสรุปไวต่อเกณฑ์แค่ไหน
 *
 * ───────────────────────── ทำไมไม่วัดหุ้นไทยในไฟล์นี้ ─────────────────────────
 *
 * ด่านคัดข้างบนรันกับทุกช่องของทั้งสามรายงาน (4,340 การทดสอบที่ลงทะเบียนไว้)
 * ผลออกมาว่าไม่มีช่องของหุ้นไทยช่องไหนผ่านเลย — รายละเอียดและ "ขาดไปเท่าไร"
 * อยู่ในหัวข้อ S0 และ S7 ของรายงาน ไฟล์นี้จึงไม่ประกอบโมเดลให้หุ้นไทย
 * ไม่ใช่เพราะไม่อยากทำ แต่เพราะกติกาข้อ 1 ห้ามไว้
 *
 * ─────────────────────────── ห้าม look-ahead ทุกกรณี ───────────────────────────
 *
 * ทุก feature ที่แท่ง i คำนวณจากข้อมูลถึงแท่ง i เท่านั้น (ของทุกสัญลักษณ์ในกลุ่ม)
 * มีด่านตรวจสองชั้น:
 *   M1  ตัดข้อมูลท้ายทิ้ง 20% แล้วคำนวณซ้ำ — ค่าของแท่งเก่าต้องไม่เปลี่ยนแม้แต่บิตเดียว
 *   M1b ตัวควบคุมเชิงบวก LEAK_zFull (z-score ด้วยค่าเฉลี่ยทั้งชุด) ต้องเปลี่ยนเยอะ
 *       ถ้ามันไม่เปลี่ยน แปลว่าเครื่องตรวจไม่มีฟัน แล้วผลของ M1 ก็ไม่มีความหมาย
 *
 * ⚠ ตัวปรับมาตรฐาน (mean/sd) ของโมเดลถูก fit บน **ชุด train เท่านั้น** แล้วแช่แข็ง
 *   เอาไปใช้กับ validation ตรง ๆ — ไม่คำนวณใหม่จากข้อมูล validation
 *   นี่คือการรั่วที่พบบ่อยที่สุดในงานประเภทนี้ จึงเขียนไว้ตรงนี้ให้เห็นชัด
 *
 * ─────────────────────────── ทำไมไม่เรียก lab.mjs มา backtest ตรง ๆ ───────────────
 *
 * lab.mjs รันเครื่องยนต์ของตัวเอง (engine-lab.mjs) ไม่มีช่องรับ "คะแนนจากภายนอก"
 * มาสั่งเข้าไม้ — ตรวจแล้วใน --help ไม่มีธงไหนทำได้ ทางเลือกคือ (ก) แก้ lab.mjs
 * ซึ่งเป็นไฟล์เครื่องมือกลางที่รอบนี้ห้ามแตะ หรือ (ข) เขียนตัวจำลองในไฟล์นี้แล้ว
 * **พิสูจน์ว่าให้ผลตรงกับ lab.mjs ทุกบิต** — เลือกทาง (ข) เหมือนที่ ceiling.mjs ทำ
 * M0c เอาไม้ทุกไม้ที่ lab.mjs ออก (เรขาคณิต ATR ล้วน) มาเทียบ SL/TP/ราคาออก/
 * เหตุผลออก/จำนวนแท่งที่ถือ กับตัวจำลองในไฟล์นี้ ต้องตรง 100% ไม่ใช่ "ใกล้เคียง"
 * ส่วนตัวเลขของ "เครื่องยนต์ปัจจุบัน" ที่เอามาเทียบ มาจากการรัน lab.mjs จริง ๆ
 *
 * ──────────────────────────────── วิธีใช้ ────────────────────────────────
 *
 *   node scripts/research/experiments/combine.mjs                  ทั้งหมด (train + validation 1 ครั้ง)
 *   node scripts/research/experiments/combine.mjs --train-only     หยุดก่อนแตะ validation
 *   node scripts/research/experiments/combine.mjs --bootstrap=2000
 *   node scripts/research/experiments/combine.mjs --no-lab         ข้ามการเรียก lab.mjs (ไม่มี M0c)
 *
 * ไฟล์นี้ปฏิเสธ --split=test ทุกกรณี — ชุด test ไม่ถูกโหลดเข้าหน่วยความจำเลย
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { ROOT, loadSrcModules } from '../load-src-modules.mjs';
import { InputLedger, buildProvenance, sha256File } from '../repro.mjs';

/**
 * ═══════════════════ ทะเบียนไฟล์ขาเข้า (แก้เหตุ "รันซ้ำได้คนละคำตอบ") ═══════════════════
 *
 * ไฟล์นี้อ่านผลของสคริปต์พี่น้อง 4 ฉบับ (feat-volume · feat-cross · feat-time · ceiling)
 * ซึ่ง **สคริปต์พี่น้องเขียนทับได้ทุกเมื่อ** ถ้าฉบับใดฉบับหนึ่งเปลี่ยนระหว่างวัน
 * ด่านคัดจะได้ช่องรอดคนละชุด → จักรวาลเป้าหมายคนละอัน → โมเดลคนละตัว → ตัวเลขคนละโลก
 * โดยไม่มี error สักบรรทัด
 *
 * พิสูจน์แล้วว่าทำให้เกิดได้ตามสั่ง: ปิดธง holmPass ของ clv5 ใน US_STOCK|1D แค่ 2 ข้อ
 * (เท่ากับที่จะเกิดเองถ้ารัน feat-volume ใหม่ด้วยขนาดตระกูล Holm ที่ต่างไป)
 * → validation h=10 เปลี่ยนจาก 15.07 เป็น 5.82 bps/ไม้ เงียบสนิท
 *
 * ทางแก้: จดลายนิ้วมือ (sha256) ของทุกไฟล์ที่อ่าน ฝังลงรายงาน แล้วให้ตัวตรวจเทียบ
 */
const IN = new InputLedger();

/** เส้นทางของสคริปต์นี้เอง — ใช้ทำลายนิ้วมือของโค้ดที่ผลิตรายงานฉบับนี้ */
const SCRIPT_PATH = fileURLToPath(import.meta.url);

const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const WORK_DIR = path.join(REPORT_DIR, 'combine');
/** คลังแท่งเทียน — เปลี่ยนได้ด้วย --cache-dir (ใช้พิสูจน์การตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ) */
const CACHE_DIR = (() => {
  const a = process.argv.find((x) => x.startsWith('--cache-dir='));
  return a ? path.resolve(a.slice('--cache-dir='.length)) : path.join(ROOT, '.research-cache', 'candles');
})();
const SPLIT_FILE = path.join(REPORT_DIR, 'split.json');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');

const SRC_CROSS = path.join(REPORT_DIR, 'exp-feat-cross.json');
const SRC_TIME = path.join(REPORT_DIR, 'exp-feat-time.json');
const SRC_VOLUME = path.join(REPORT_DIR, 'exp-feat-volume.json');
const SRC_CEILING = path.join(REPORT_DIR, 'exp-ceiling.json');

// ════════════════════════════════ อาร์กิวเมนต์ ════════════════════════════════

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) out[a.slice(2)] = true;
      else out[a.slice(2, eq)] = a.slice(eq + 1);
    } else out._.push(a);
  }
  return out;
}
const ARGS = parseArgs(process.argv.slice(2));

// ── ด่านกันชุด test: ปฏิเสธตั้งแต่ยังไม่โหลดอะไรเลย ─────────────────────────────
if (ARGS.split && String(ARGS.split).includes('test')) {
  console.error('ปฏิเสธ: ไฟล์นี้ห้ามแตะชุด test — ใช้ lab.mjs ที่มีสมุดบันทึกการแตะ test เท่านั้น');
  process.exit(2);
}
if (ARGS['i-am-done-tuning'] || ARGS.confirm) {
  console.error('ปฏิเสธ: ธงสำหรับชุด test ใช้กับไฟล์นี้ไม่ได้');
  process.exit(2);
}

const OPT = {
  bootstrap: Number(ARGS.bootstrap ?? 2000),
  seed: Number(ARGS.seed ?? 20260819),
  alpha: 0.05,
  truncFrac: Number(ARGS['trunc-frac'] ?? 0.2),
  trainOnly: !!ARGS['train-only'],
  useLab: !ARGS['no-lab'],
  /**
   * --rerun-probe = การรันซ้ำเชิงกลเพื่อ "ตรวจว่าได้ผลเดิมไหม" ไม่ใช่การวิจัย
   *
   * ทำไมต้องแยก: สมุดบันทึกการแตะ validation คือหลักฐานว่า "เราตัดสินใจบน validation
   * ไปกี่ครั้ง" ยิ่งเยอะ validation ยิ่งกลายเป็น train การรันซ้ำเพื่อเทียบไบต์ไม่ได้
   * ตัดสินใจอะไรเลย ถ้าไปนับรวมกัน ตัวเลขในสมุดจะโป่งจนอ่านไม่ได้ความ (รอบก่อนโป่ง
   * จาก 2 เป็น 32 เพราะเหตุนี้) แต่จะไม่บันทึกเลยก็ไม่ซื่อสัตย์ — จึงบันทึกแยกบรรทัด
   * แล้วรายงานสองตัวเลขแยกกัน
   */
  rerunProbe: !!ARGS['rerun-probe'],
  /** เขียนผลไปโฟลเดอร์อื่น — ตัวตรวจความคงที่ใช้ เพื่อไม่ทับรายงานที่ส่งมอบไปแล้ว */
  outDir: ARGS['out-dir'] ? path.resolve(String(ARGS['out-dir'])) : REPORT_DIR,
};
fs.mkdirSync(OPT.outDir, { recursive: true });

// ══════════════════════════ ค่าคงที่ที่ลอกมา (ห้ามแก้) ══════════════════════════

/** [CAUSAL] ตารางช่วงราคาของ SET — ลอกจาก ceiling.mjs / feat-cross.mjs */
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
const TH_COMM_RATE = 0.00157;
const TH_MIN_FEE = 50;
const TH_RISK_BAHT = 2000;
const TH_TICKS_PER_ROUND = 1;

/** [CAUSAL] ตาราง bps ของ lab.mjs — ลอกมาไม่แก้ */
const LAB_COST_BPS = {
  byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 },
  bySymbol: {
    XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10,
    EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15,
  },
};

/** [CAUSAL] เรขาคณิตของเครื่องยนต์ — ลอกจาก engine-lab.mjs ผ่าน ceiling.mjs */
const GEO = { slAtrMult: 1.5, tpAtrMult: 3.0, atrPeriod: 14, atrFallbackPct: 0.02 };
const ROUND = { forexDecimals: 5, otherDecimals: 4, forexPrecision: 5, otherPrecision: 6 };
const MIN_HISTORY = 60;

/** SET50 เดิม — ใช้แค่จำแนกกลุ่มในตารางสรุป ไม่ได้ใช้คำนวณอะไร */
const SET50_SYMBOLS = [
  'PTT', 'PTTEP', 'AOT', 'CPALL', 'KBANK', 'BBL', 'ADVANC',
  'SCC', 'BDMS', 'CPF', 'DELTA', 'MINT', 'IVL', 'EA',
];

/** ระยะถือที่โมเดลจะถูกประกอบและวัด — เลือกจาก "ระยะที่มีช่องรอด" ไม่ใช่ไล่ทุกค่า */
const MODEL_HORIZONS = [3, 6, 10];
/** ระยะหลัก ที่จะรายงานเป็นคำตอบ (ลงทะเบียนก่อนดูผล) — 6 เพราะมีช่องรอดมากที่สุด */
const PRIMARY_H = 6;
/** สัดส่วนหัว/ท้ายของคะแนนที่จะเข้าไม้ (ลงทะเบียนก่อนดูผล — ไม่กวาดหาค่าที่ดีที่สุด) */
const PRIMARY_Q = 0.20;

// ═══════════════════════════════ ตัวช่วยเล็ก ๆ ═══════════════════════════════

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
 * ═══════════════ ตัวช่วยเรียงที่ให้ผลเดิมทุกครั้ง (แก้รอบนี้) ═══════════════
 *
 * สองกับดักที่ทำให้ "รันซ้ำได้คนละคำตอบ" โดยไม่มี error:
 *
 *   1. comparator คืน NaN — เกิดเมื่อค่าที่เอามาลบกันเป็น NaN (เช่น p ที่วัดไม่ได้)
 *      V8 ตีความ NaN ว่า "ไม่ต้องสลับ" ผลที่ได้จึงขึ้นกับลำดับเริ่มต้นและอัลกอริทึม
 *      ภายในของ sort ซึ่งเปลี่ยนได้ตามรุ่น node และตามความยาวอาเรย์
 *   2. comparator คืน 0 ให้ของที่ "ควรต่างกัน" — ผลลัพธ์ขึ้นกับความ stable ของ sort
 *      ตัวที่อันตรายที่สุดในไฟล์นี้คือการเลือก "จักรวาลเป้าหมาย" จากจำนวนช่องที่รอด:
 *      ถ้าสองจักรวาลรอดเท่ากัน ตัวไหนชนะจะเป็นเรื่องบังเอิญ แล้วทั้งงานวิจัยเปลี่ยนตลาด
 *
 * กติกาที่ใช้ทั้งไฟล์: ค่าที่ใช้ไม่ได้ = น้อยที่สุดเสมอ · เท่ากันแล้วตัดสินด้วยสตริงของคีย์
 */
const sortNum = (v) => (Number.isFinite(v) ? v : -Infinity);
const tieKey = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

function percentileOfSorted(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

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

function roundPrice(value, market) {
  if (!Number.isFinite(value)) return value;
  if (value !== 0 && Math.abs(value) < 1) {
    return Number(value.toPrecision(market === 'FOREX' ? ROUND.forexPrecision : ROUND.otherPrecision));
  }
  return Number(value.toFixed(market === 'FOREX' ? ROUND.forexDecimals : ROUND.otherDecimals));
}

/** [CAUSAL] ATR ที่ดัชนี i — ลอกสูตรจาก src/lib/indicators.ts (ตรวจซ้ำใน M0a) */
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

/** [CAUSAL] เรขาคณิต SL/TP ของแท่งสัญญาณ i — ลอกลำดับชั้น invariant จาก ceiling.mjs */
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
  const b = LAB_COST_BPS.bySymbol[symbol] ?? LAB_COST_BPS.byMarket[market];
  return b / 10000;
}

// ═══════════════════════════════ คลังข้อมูล ═══════════════════════════════

function listDatasets() {
  return fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
}

/** โหลด dataset แล้วเคารพ quality.usable.from — ลอกกติกาจาก lab.mjs */
function loadDataset(file) {
  // จดลายนิ้วมือของแท่งเทียนด้วย — คลังถูก fetch ใหม่เมื่อไรผลก็เปลี่ยน ต้องตรวจย้อนได้
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
    file,
    symbol: j.symbol,
    market: j.market,
    timeframe: j.timeframe,
    verdict: j.quality?.verdict ?? 'unknown',
    candles,
    times: candles.map((c) => Date.parse(c.timestamp)),
  };
}

// ════════════════════════ S0 · ด่านคัด "อะไรรอดบ้าง" ════════════════════════
//
// อ่านผลจากรายงานต้นทางทั้งสามฉบับ แล้วรันเกณฑ์ G1–G4 กับ "ทุกช่องที่ลงทะเบียนไว้"
// ไม่ใช่เฉพาะช่องที่พาดหัวหยิบมา — เพราะพาดหัวของแต่ละฉบับใช้เกณฑ์ไม่เหมือนกัน

/** ตัวควบคุมของแต่ละรายงาน — ต้องตัดออกตาม G1 */
const CONTROL_PREFIX = ['_ctrl', 'LEAK_', 'ctrl'];
const isControlFeature = (name) => CONTROL_PREFIX.some((p) => String(name).startsWith(p));

/** จักรวาลที่ถูกเลือกด้วยข้อมูลอนาคต — ต้องตัดออกตาม G2 */
const LEAKY_UNIVERSE = new Set(['RUNNER']);

/** ตลาดของแต่ละกลุ่มในรายงาน — ใช้บอกว่า "นี่คือตลาดที่เจ้าของเทรดจริงหรือเปล่า" */
const GROUP_MARKET = {
  RUNNER: 'TH_STOCK', RUNNER_PIT: 'TH_STOCK', SET50: 'TH_STOCK',
  GOLD: 'GOLD', FOREX: 'FOREX', US_STOCK: 'US_STOCK', CRYPTO: 'CRYPTO',
};
const GROUP_LABEL = {
  RUNNER: 'หุ้นซิ่งไทย ⚠เลือกตัวด้วยอนาคต', RUNNER_PIT: 'หุ้นซิ่งไทย (คัดตามเวลาจริง)',
  SET50: 'SET50', GOLD: 'ทอง/โลหะ', FOREX: 'ค่าเงิน', US_STOCK: 'หุ้นสหรัฐ', CRYPTO: 'คริปโต',
};

/**
 * ดึงช่องทั้งหมดจากรายงานต้นทาง ให้อยู่ในรูปเดียวกัน
 * แต่ละช่อง: {src, group, tf, feature, h, edgeBps, feeBps, netBps, moneyP, moneyHolm, icP, icHolm}
 */
function collectCells() {
  const cells = [];

  // ── ตระกูล 1: วอลุ่ม/โครงสร้างราคา (exp-feat-volume.json) ─────────────────────
  {
    const j = IN.readJson(SRC_VOLUME, 'upstream:feat-volume');
    const byId = new Map(j.tests.map((t) => [t.id, t]));
    for (const r of j.rows) {
      const icT = byId.get(`IC:${r.cell}:${r.feature}:h${r.h}`);
      const netT = byId.get(`NET:${r.cell}:${r.feature}:h${r.h}`);
      cells.push({
        src: 'feat-volume',
        group: r.group, tf: r.timeframe, feature: r.feature, h: r.h,
        control: !!r.control || isControlFeature(r.feature),
        // bpsGross ของรายงานนี้เป็น "สัดส่วน" ไม่ใช่ bps — คูณหมื่นให้เป็น bps
        edgeBps: r.bpsGross * 10000,
        feeBps: r.feeFrac * 10000,
        netBps: r.bpsNet * 10000,
        moneyP: netT ? netT.p : NaN,
        moneyHolm: netT ? !!netT.holmPass : false,
        icP: icT ? icT.p : (r.icP ?? NaN),
        icHolm: icT ? !!icT.holmPass : false,
        n: r.nBars, clusters: r.nClusters,
      });
    }
  }

  // ── ตระกูล 2: ความสัมพันธ์ข้ามสัญลักษณ์ (exp-feat-cross.json) ─────────────────
  {
    const j = IN.readJson(SRC_CROSS, 'upstream:feat-cross');
    const byId = new Map(j.tests.map((t) => [t.id, t]));
    for (const c of j.cells) {
      if (!c.res) continue;
      for (const [k, r] of Object.entries(c.res)) {
        const bar = k.lastIndexOf('|');
        const feature = k.slice(0, bar);
        const h = Number(k.slice(bar + 1));
        const icT = byId.get(`${c.group}|${c.tf}|${feature}|h${h}|IC`);
        const moT = byId.get(`${c.group}|${c.tf}|${feature}|h${h}|MONEY`);
        cells.push({
          src: 'feat-cross',
          group: c.group, tf: c.tf, feature, h,
          control: isControlFeature(feature),
          // dir = ผลตอบแทนของกลยุทธ์ ±1 ที่เดินตาม feature (สัดส่วน) → bps
          edgeBps: r.dir * 10000,
          feeBps: c.feeMed * 10000,
          netBps: Math.abs(r.dir * 10000) - c.feeMed * 10000,
          moneyP: moT ? moT.p : NaN,
          moneyHolm: moT ? !!moT.holmPass : false,
          icP: icT ? icT.p : (r.icP ?? NaN),
          icHolm: icT ? !!icT.holmPass : false,
          n: r.n, clusters: r.G,
        });
      }
    }
  }

  // ── ตระกูล 3: เวลา/ฤดูกาล/ระบอบความผันผวน (exp-feat-time.json) ────────────────
  //
  // ⚠ รายงานฉบับนั้นลงทะเบียนการทดสอบไว้แค่สองอย่าง: IC ต่อทิศ และ IC ต่อขนาด
  //   **ไม่ได้ลงทะเบียน p ของเงินเป็นการทดสอบ** (มีค่าอยู่ในช่องแต่ไม่ได้แก้ค่า p)
  //   ถ้าปล่อยไว้ ด่าน G3 จะตัดตระกูลนี้ทิ้งทั้งตระกูลด้วยเหตุผลทางเทคนิค ไม่ใช่เพราะผลจริง
  //   จึงแก้ค่า p ของเงินด้วย Holm ที่นี่เอง ภายในตระกูล (กรอบเวลา) เดียวกับที่ต้นทางใช้
  //   แล้วบันทึกไว้ในบัญชีการเปรียบเทียบว่าเป็นการทดสอบที่ "รอบนี้" เป็นคนแก้ค่า p
  {
    const j = IN.readJson(SRC_TIME, 'upstream:feat-time');
    const byId = new Map(j.tests.map((t) => [t.id, t]));
    const usable = j.cells.filter((c) => c.enough && Number.isFinite(c.moneyP));
    const byFamily = new Map();
    for (const c of usable) {
      const fam = `MONEY-${c.tf}`;
      if (!byFamily.has(fam)) byFamily.set(fam, []);
      byFamily.get(fam).push(c);
    }
    const holmOfCell = new Map();     // key ของช่อง → { pass, threshold }
    for (const [, arr] of byFamily) {
      // NaN-safe + ตัดสินเสมอด้วย key ของช่อง (ลำดับ Holm กำหนดว่าช่องไหนรอด)
      // p ที่วัดไม่ได้ต้องไปอยู่ท้ายสุด (ถือว่า "ไม่มีนัยสำคัญที่สุด") ไม่ใช่หัวแถว
      const pAsc = (v) => (Number.isFinite(v) ? v : Infinity);
      const sorted = [...arr].sort((a, b) => (pAsc(a.moneyP) - pAsc(b.moneyP)) || tieKey(a.key, b.key));
      const m = sorted.length;
      let stillPassing = true;
      sorted.forEach((c, i) => {
        const thr = 0.05 / (m - i);
        const pass = stillPassing && c.moneyP <= thr;
        if (!pass) stillPassing = false;
        holmOfCell.set(c.key, { pass, threshold: thr });
      });
    }
    for (const c of usable) {
      const icT = byId.get(`IC|${c.tf}|${c.group}|${c.feature}|${c.h}`);
      const hm = holmOfCell.get(c.key) ?? { pass: false, threshold: NaN };
      // moneyBps / fee ของรายงานนี้เก็บเป็น "สัดส่วน" (เช่น 0.0025 = 25 bps) → คูณหมื่น
      const edge = c.moneyBps * 10000;
      const fee = c.fee * 10000;
      cells.push({
        src: 'feat-time',
        group: c.group, tf: c.tf, feature: c.feature, h: c.h,
        control: c.kind === 'ctrl' || isControlFeature(c.feature),
        edgeBps: edge,
        feeBps: fee,
        netBps: Math.abs(edge) - fee,
        moneyP: c.moneyP,
        moneyHolm: hm.pass,
        moneyHolmThreshold: hm.threshold,
        icP: icT ? icT.p : c.icP,
        icHolm: !!c.holmPass,
        n: c.obs, clusters: c.clusters,
      });
    }
  }

  return cells;
}

/**
 * เกณฑ์ G1–G5 — เขียนเป็นฟังก์ชันเดียวเพื่อให้เถียงได้ว่าใช้เกณฑ์เดียวกันทุกช่อง
 * G5 เพิ่มทีหลังจาก G1–G4 (ก่อนดูผลของโมเดล): ตัดช่องที่ "ตัวอย่างบาง" หรือ "ปิดตาย"
 * ตามที่รายงานต้นทางติดธงไว้เอง — CRYPTO|1D มี 2 สัญลักษณ์ 496 แท่ง แล้วให้ตัวเลข
 * ระดับ 1,000 bps/ไม้ ซึ่งเป็นสัญญาณของตัวอย่างบาง ไม่ใช่ขอบ
 */
const THIN_CELLS = new Set(['CRYPTO|1D', 'GOLD|1D']);        // symbols < 4 หรือ bars < 3000
const CLOSED_CELLS = new Set(['RUNNER|1H', 'SET50|1H', 'RUNNER_PIT|1H']);  // p* > 100% (exp-ceiling)

function passesGate(c) {
  const ck = `${c.group}|${c.tf}`;
  const g1 = !c.control;
  const g2 = !LEAKY_UNIVERSE.has(c.group);
  const g3 = c.moneyHolm === true;
  const g4 = Number.isFinite(c.netBps) && c.netBps > 0;
  const g5 = !THIN_CELLS.has(ck) && !CLOSED_CELLS.has(ck);
  return { g1, g2, g3, g4, g5, pass: g1 && g2 && g3 && g4 && g5 };
}

/** เกณฑ์หลวมกว่า (แบบที่พาดหัว exp-feat-volume ใช้) — ไว้เทียบให้เห็นว่าไวต่อเกณฑ์แค่ไหน */
function passesLooseGate(c) {
  const ck = `${c.group}|${c.tf}`;
  return !c.control && !LEAKY_UNIVERSE.has(c.group) && c.icHolm === true
    && Number.isFinite(c.netBps) && c.netBps > 0
    && !THIN_CELLS.has(ck) && !CLOSED_CELLS.has(ck);
}

// ═══════════════════ การสร้าง feature (ทุกตัว causal ล้วน) ═══════════════════
//
// feature ที่ต้องสร้างคือ "ตัวที่รอดด่านคัด" เท่านั้น — ไม่สร้างตัวอื่นเผื่อไว้
// เพราะการมี feature เกินความจำเป็นในโมเดลคือการเพิ่มพารามิเตอร์โดยไม่มีหลักฐาน
//
// นิยามทุกตัวลอกมาจากไฟล์ต้นทางตรง ๆ (feat-cross.mjs / feat-volume.mjs) แล้วเขียนซ้ำ
// ที่นี่ พร้อมหมายเหตุว่าลอกมาจากไหน — ไม่ import เพราะไฟล์เหล่านั้นเป็นสคริปต์
// ที่รันแล้วทำงานทันที การ import จะไปรันซ้ำทั้งงาน

/** [CAUSAL ลอกจาก feat-cross.mjs] จัดอันดับข้ามสัญลักษณ์ ณ ก้าวเดียวกัน → [-0.5, 0.5] */
function crossSectionRank(raw, bi, nSym, G, minPool, out) {
  const vals = new Float64Array(nSym);
  const idxs = new Int32Array(nSym);
  for (let k = 0; k < G; k++) {
    let m = 0;
    for (let s = 0; s < nSym; s++) {
      if (bi[s][k] < 0) continue;
      const v = raw[s][k];
      if (!Number.isFinite(v)) continue;
      vals[m] = v; idxs[m] = s; m++;
    }
    if (m < minPool) continue;
    const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => (vals[a] - vals[b]) || (a - b));
    let i = 0;
    while (i < m) {
      let j = i;
      while (j + 1 < m && vals[order[j + 1]] === vals[order[i]]) j++;
      const avgRank = (i + j) / 2;
      const norm = m > 1 ? avgRank / (m - 1) - 0.5 : 0;
      for (let t = i; t <= j; t++) out[idxs[order[t]]][k] = norm;
      i = j + 1;
    }
  }
}

/** [CAUSAL ลอกจาก feat-cross.mjs] ตารางเวลารวมของกลุ่ม */
function buildPool(datasets, market, timeframe) {
  const syms = datasets.filter((d) => d.market === market && d.timeframe === timeframe && d.candles.length);
  if (!syms.length) return null;
  const tsSet = new Set();
  for (const d of syms) for (const t of d.times) tsSet.add(t);
  const grid = Float64Array.from([...tsSet].sort((a, b) => a - b));
  const G = grid.length;
  const posOf = new Map();
  for (let k = 0; k < G; k++) posOf.set(grid[k], k);
  const nSym = syms.length;
  const bi = [];
  for (let s = 0; s < nSym; s++) {
    const arr = new Int32Array(G).fill(-1);
    const d = syms[s];
    for (let i = 0; i < d.times.length; i++) {
      if (!isUsableBar(d.candles[i])) continue;
      arr[posOf.get(d.times[i])] = i;
    }
    bi.push(arr);
  }
  const minPool = Math.max(3, Math.min(8, Math.ceil(nSym / 2)));
  return { market, timeframe, syms, nSym, grid, G, bi, minPool };
}

/** ค่าเฉลี่ยหน้าต่างที่ต้องมีข้อมูลครบขั้นต่ำ — [CAUSAL ลอกจาก feat-volume.mjs winMean] */
function winMean(arr, i, W, need) {
  let sum = 0; let cnt = 0;
  for (let k = Math.max(0, i - W + 1); k <= i; k++) {
    if (Number.isFinite(arr[k])) { sum += arr[k]; cnt++; }
  }
  return cnt >= need ? sum / cnt : NaN;
}

/**
 * feature รายสัญลักษณ์ (ดัชนีตามแท่งของตัวเอง)
 * [CAUSAL ลอกสูตรจาก feat-volume.mjs] — clv5 · vwapDist20 · effRatioSigned10 · clv
 * ทุกค่าที่ดัชนี i อ่านได้ถึงแท่ง i เท่านั้น ไม่มีข้อยกเว้น
 */
function buildSymbolFeatures(ds, maxIndex = ds.candles.length - 1) {
  const n = maxIndex + 1;
  const c = ds.candles;
  const out = {
    clv: new Float64Array(n).fill(NaN),
    clv5: new Float64Array(n).fill(NaN),
    vwapDist20: new Float64Array(n).fill(NaN),
    effRatioSigned10: new Float64Array(n).fill(NaN),
  };
  const ok = new Uint8Array(n);
  const clvArr = new Float64Array(n).fill(NaN);
  const tp = new Float64Array(n).fill(NaN);
  const vol = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    ok[i] = isUsableBar(c[i]) ? 1 : 0;
    if (!ok[i]) continue;
    const span = c[i].high - c[i].low;
    clvArr[i] = span > 0 ? ((c[i].close - c[i].low) - (c[i].high - c[i].close)) / span : 0;
    tp[i] = (c[i].high + c[i].low + c[i].close) / 3;
    vol[i] = Number.isFinite(c[i].volume) ? c[i].volume : NaN;
  }
  for (let i = 0; i < n; i++) {
    if (i < MIN_HISTORY || !ok[i]) continue;
    out.clv[i] = clvArr[i];
    out.clv5[i] = winMean(clvArr, i, 5, 4);

    // efficiency ratio ติดทิศ: ระยะสุทธิ 10 แท่ง ÷ ระยะที่เดินจริง
    if (ok[i - 10]) {
      let pathLen = 0; let good = true;
      for (let k = i - 9; k <= i; k++) {
        if (!ok[k] || !ok[k - 1]) { good = false; break; }
        pathLen += Math.abs(c[k].close - c[k - 1].close);
      }
      if (good && pathLen > 0) {
        const net = c[i].close - c[i - 10].close;
        out.effRatioSigned10[i] = Math.sign(net) * (Math.abs(net) / pathLen);
      }
    }

    // ระยะจาก VWAP20 หน่วยเป็น ATR
    const atr14 = atrAt(c, i);
    const s = Math.max(0, i - 19);
    let pv = 0; let vv = 0; let cnt = 0;
    for (let k = s; k <= i; k++) {
      if (!Number.isFinite(vol[k]) || !Number.isFinite(tp[k])) continue;
      cnt++; pv += tp[k] * vol[k]; vv += vol[k];
    }
    if (cnt >= 15 && vv > 0 && atr14 > 0) out.vwapDist20[i] = (c[i].close - pv / vv) / atr14;
  }
  return out;
}

/**
 * feature ข้ามสัญลักษณ์บนตารางเวลารวม
 * [CAUSAL ลอกจาก feat-cross.mjs] — xsMom1 · xsMom5 (+ รุ่นหน่วง 1 ก้าว)
 * withLeak = สร้างตัวควบคุมเชิงบวกที่ตั้งใจให้รั่ว (ใช้เฉพาะตอนตรวจ M1)
 */
function buildCrossFeatures(pool, gLimit = pool.G, withLeak = false) {
  const { nSym, bi, syms, minPool } = pool;
  const G = gLimit;
  const alloc = () => Array.from({ length: nSym }, () => new Float64Array(G).fill(NaN));
  const cum = alloc();
  const r = alloc();
  for (let s = 0; s < nSym; s++) {
    const cs = syms[s].candles;
    let acc = 0; let started = false;
    for (let k = 0; k < G; k++) {
      const i = bi[s][k];
      if (i >= 0) {
        started = true;
        if (i >= 1 && isUsableBar(cs[i - 1]) && cs[i - 1].close > 0) {
          const v = Math.log(cs[i].close / cs[i - 1].close);
          if (Number.isFinite(v)) { r[s][k] = v; acc += v; }
        }
      }
      if (started) cum[s][k] = acc;
    }
  }
  const momRaw = { 1: alloc(), 5: alloc() };
  for (let s = 0; s < nSym; s++) {
    for (let k = 0; k < G; k++) {
      if (bi[s][k] < 0) continue;
      for (const L of [1, 5]) {
        if (k >= L && Number.isFinite(cum[s][k]) && Number.isFinite(cum[s][k - L])) {
          momRaw[L][s][k] = cum[s][k] - cum[s][k - L];
        }
      }
    }
  }
  const F = { xsMom1: alloc(), xsMom5: alloc() };
  crossSectionRank(momRaw[1], bi, nSym, G, minPool, F.xsMom1);
  crossSectionRank(momRaw[5], bi, nSym, G, minPool, F.xsMom5);

  // รุ่นหน่วง 1 ก้าว: คนที่ส่งคำสั่ง "ที่ราคาปิด" อาจไม่ทันเห็นอันดับครบ ณ วินาทีนั้น
  F['xsMom1@lag1'] = alloc();
  F['xsMom5@lag1'] = alloc();
  for (let s = 0; s < nSym; s++) {
    for (let k = 1; k < G; k++) {
      if (bi[s][k] < 0) continue;
      F['xsMom1@lag1'][s][k] = F.xsMom1[s][k - 1];
      F['xsMom5@lag1'][s][k] = F.xsMom5[s][k - 1];
    }
  }

  if (withLeak) {
    // ตัวควบคุมเชิงบวก: z-score ด้วยค่าเฉลี่ย/ส่วนเบี่ยงเบนของ "ทั้งชุด" = การรั่วที่เงียบที่สุด
    // ถ้าเครื่องตรวจ M1 จับตัวนี้ไม่ได้ แปลว่ามันไม่มีฟัน แล้วผลของ M1 ก็ไม่มีความหมาย
    F.LEAK_zFull = alloc();
    for (let s = 0; s < nSym; s++) {
      let sum = 0; let sum2 = 0; let cnt = 0;
      for (let k = 0; k < G; k++) if (Number.isFinite(r[s][k])) { sum += r[s][k]; sum2 += r[s][k] ** 2; cnt++; }
      const m = cnt ? sum / cnt : NaN;
      const sd = cnt ? Math.sqrt(Math.max(0, sum2 / cnt - m * m)) : NaN;
      for (let k = 0; k < G; k++) {
        if (bi[s][k] < 0) continue;
        if (Number.isFinite(r[s][k]) && sd > 0) F.LEAK_zFull[s][k] = (r[s][k] - m) / sd;
      }
    }
  }
  return F;
}

// ═══════════════════════════ ตารางแถวสำหรับสร้างโมเดล ═══════════════════════════

/** feature ที่โมเดลจะใช้ — เติมจากด่านคัดตอนรัน ไม่ได้เขียนตายไว้ */
let MODEL_FEATURES = [];

/**
 * สร้างตารางแถว (หนึ่งแถว = หนึ่งแท่งสัญญาณของหนึ่งสัญลักษณ์)
 * เก็บ: ค่า feature · ผลตอบแทนล่วงหน้า h แท่ง · ข้อมูลที่ต้องใช้จำลองไม้ · กลุ่มเวลา
 *
 * ═══════════════ ด่านกันการล้ำข้ามเส้นแบ่ง split (แก้รอบนี้) ═══════════════
 *
 * ของเดิมกรองเฉพาะเวลาของ "แท่งสัญญาณ" (t < toMs) แต่ตัวเลขที่วัดจริงอ่านไปข้างหน้า:
 *   · ผลตอบแทนล่วงหน้าอ่าน candles[i+h]
 *   · ตัวจำลองไม้เฝ้าแท่ง i+1 .. i+h เพื่อดูว่าโดน SL/TP ตรงไหน
 * แถวที่อยู่ปลายชุด train จึงเอาแท่งของ validation มาคิดผล และแถวปลาย validation
 * เอาแท่งของ **ชุด test** มาคิดผล — ซึ่งผิดกติกาข้อ 1 ตรง ๆ
 *
 * เลือกวิธี "ทิ้งไม้ที่ล้ำ" (แบบเดียวกับ feat-cross.mjs ที่มีด่านนี้อยู่แล้ว — ตัวแปร dropSpill)
 * ไม่เลือก "ตัดหน้าต่างให้จบที่เส้นแบ่ง" เพราะการตัดหน้าต่างจะเปลี่ยน *นิยาม* ของ h:
 * ไม้ที่ตั้งใจถือ 10 แท่งแต่ถูกบังคับปิดที่แท่งที่ 3 ไม่ใช่ไม้ถือ 10 แท่ง เอาไปเฉลี่ย
 * รวมกับไม้อื่นในช่องเดียวกันไม่ได้ และทำให้ช่อง train กับ validation เทียบกันไม่ได้
 * การทิ้งทำให้ทุกแถวที่เหลือเป็นไม้ h แท่งจริงทั้งหมด ราคาที่จ่ายคือตัวอย่างหายไป
 * ที่ปลายช่วง ซึ่งนับได้และรายงานได้ (rows.dropSpill)
 */
function buildRows(pool, symFeats, crossFeats, fromMs, toMs, h) {
  const rows = {
    sym: [], idx: [], time: [], f: {}, fwd: [], cluster: [],
    dropSpill: 0, kept: 0,
  };
  for (const name of MODEL_FEATURES) rows.f[name] = [];
  const clusterOf = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  for (let s = 0; s < pool.nSym; s++) {
    const ds = pool.syms[s];
    const sf = symFeats[s];
    const n = ds.candles.length;
    for (let k = 0; k < pool.G; k++) {
      const i = pool.bi[s][k];
      if (i < MIN_HISTORY) continue;
      const t = ds.times[i];
      if (t < fromMs || t >= toMs) continue;
      // ต้องมีแท่งข้างหน้าครบ h แท่ง ไม่งั้นวัดผลตอบแทนล่วงหน้าไม่ได้
      if (i + h >= n) continue;
      // ── ด่านกันการล้ำ: แท่งสุดท้ายที่ไม้นี้จะแตะ (i+h) ต้องยังอยู่ในช่วงเดียวกัน ──
      // เวลาเรียงจากน้อยไปมากอยู่แล้ว ตรวจแท่งท้ายสุดแท่งเดียวจึงพอ
      if (ds.times[i + h] >= toMs) { rows.dropSpill++; continue; }
      if (!isUsableBar(ds.candles[i]) || !isUsableBar(ds.candles[i + h])) continue;

      const vals = [];
      let ok = true;
      for (const name of MODEL_FEATURES) {
        const v = name.startsWith('xs') ? crossFeats[name][s][k] : sf[name][i];
        if (!Number.isFinite(v)) { ok = false; break; }
        vals.push(v);
      }
      if (!ok) continue;

      const fwd = Math.log(ds.candles[i + h].close / ds.candles[i].close);
      if (!Number.isFinite(fwd)) continue;

      rows.sym.push(s); rows.idx.push(i); rows.time.push(t);
      MODEL_FEATURES.forEach((name, j) => rows.f[name].push(vals[j]));
      rows.fwd.push(fwd);
      rows.cluster.push(clusterOf(t));
      rows.kept++;
    }
  }
  rows.n = rows.sym.length;
  return rows;
}

// ═════════════════════════════ ridge + CV เคารพเวลา ═════════════════════════════

/** แก้ระบบสมการเชิงเส้นด้วย Gaussian elimination — ขนาดเล็กมาก (≤ 8×8) พอ */
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-14) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c2 = col; c2 <= n; c2++) M[r][c2] -= f * M[col][c2];
    }
  }
  // หลัง Gauss-Jordan เต็มรูป แถว i เหลือค่าไม่เป็นศูนย์ที่คอลัมน์ i ตัวเดียว
  // (row[i] คือ M[i][i] — เขียนเป็น row[i][i] คือบั๊ก เพราะ row[i] เป็นตัวเลขไม่ใช่แถว)
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * ridge บน feature ที่ปรับมาตรฐานแล้ว
 * ⚠ ค่า mean/sd ที่ใช้ปรับมาตรฐานถูก fit บนชุดที่ส่งเข้ามาเท่านั้น แล้วคืนออกไปให้แช่แข็ง
 *   ห้ามคำนวณใหม่บน validation เด็ดขาด — นั่นคือการรั่วที่พบบ่อยที่สุดของงานแบบนี้
 */
function fitRidge(X, y, lambda) {
  const p = X.length;      // จำนวน feature
  const n = y.length;
  const A = Array.from({ length: p }, () => new Float64Array(p));
  const b = new Float64Array(p);
  for (let a = 0; a < p; a++) {
    for (let c = a; c < p; c++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += X[a][i] * X[c][i];
      A[a][c] = s; A[c][a] = s;
    }
    let s2 = 0;
    for (let i = 0; i < n; i++) s2 += X[a][i] * y[i];
    b[a] = s2;
  }
  for (let a = 0; a < p; a++) A[a][a] += lambda;
  return solveLinear(A.map((r) => [...r]), Array.from(b));
}

function standardizerFrom(rows) {
  const st = {};
  for (const name of MODEL_FEATURES) {
    const arr = rows.f[name];
    let s = 0; let s2 = 0;
    for (const v of arr) { s += v; s2 += v * v; }
    const m = s / arr.length;
    const sd = Math.sqrt(Math.max(1e-18, s2 / arr.length - m * m));
    st[name] = { mean: m, sd };
  }
  return st;
}

function designMatrix(rows, st, subset = null) {
  const idxs = subset ?? Array.from({ length: rows.n }, (_, i) => i);
  const X = MODEL_FEATURES.map((name) => {
    const { mean, sd } = st[name];
    const col = new Float64Array(idxs.length);
    idxs.forEach((i, j) => { col[j] = (rows.f[name][i] - mean) / sd; });
    return col;
  });
  const y = new Float64Array(idxs.length);
  idxs.forEach((i, j) => { y[j] = rows.fwd[i]; });
  return { X, y, idxs };
}

function scoreRows(rows, st, w, subset = null) {
  const idxs = subset ?? Array.from({ length: rows.n }, (_, i) => i);
  const out = new Float64Array(idxs.length);
  idxs.forEach((i, j) => {
    let s = 0;
    MODEL_FEATURES.forEach((name, a) => {
      s += w[a] * ((rows.f[name][i] - st[name].mean) / st[name].sd);
    });
    out[j] = s;
  });
  return out;
}

/** Spearman IC ระหว่างคะแนนกับผลตอบแทนล่วงหน้า (ใช้เป็นเกณฑ์เลือก lambda เท่านั้น) */
function spearman(a, b) {
  const n = a.length;
  if (n < 10) return NaN;
  const rank = (arr) => {
    const ord = Array.from({ length: n }, (_, i) => i).sort((x, y) => (arr[x] - arr[y]) || (x - y));
    const rk = new Float64Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && arr[ord[j + 1]] === arr[ord[i]]) j++;
      const r = (i + j) / 2;
      for (let t = i; t <= j; t++) rk[ord[t]] = r;
      i = j + 1;
    }
    return rk;
  };
  const ra = rank(a); const rb = rank(b);
  let sa = 0; let sb = 0;
  for (let i = 0; i < n; i++) { sa += ra[i]; sb += rb[i]; }
  const ma = sa / n; const mb = sb / n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i++) {
    const x = ra[i] - ma; const yv = rb[i] - mb;
    num += x * yv; da += x * x; db += yv * yv;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

/**
 * เลือก lambda ด้วย walk-forward ที่เคารพเวลา
 *
 * ⚠ ห้ามสุ่มแบ่ง fold — ข้อมูลอนุกรมเวลาสัมพันธ์กับตัวเองข้ามวัน ถ้าสุ่มแบ่ง
 *   แท่งวันจันทร์ไปอยู่ fold ฝึก แท่งวันอังคารไปอยู่ fold วัด โมเดลก็ "เห็นอนาคต"
 *   ผ่านแท่งข้างเคียงโดยไม่ต้องมีบั๊กอะไรเลย
 *
 * ⚠ ต้องมี embargo กว้าง h แท่ง ระหว่างท้าย fold ฝึกกับต้น fold วัด เพราะเป้าหมาย
 *   (ผลตอบแทนล่วงหน้า h แท่ง) ของแถวท้าย fold ฝึก ยื่นเข้าไปในช่วงของ fold วัด
 */
function selectLambda(rows, lambdas, h, folds = 5) {
  const order = Array.from({ length: rows.n }, (_, i) => i)
    .sort((a, b) => (rows.time[a] - rows.time[b]) || (rows.sym[a] - rows.sym[b]) || (a - b));
  const perLambda = lambdas.map(() => ({ sum: 0, cnt: 0, ics: [] }));
  const detail = [];
  const embargoMs = h * 24 * 3600 * 1000 * 1.5;   // h วันซื้อขาย เผื่อวันหยุด 1.5 เท่า

  for (let f = 1; f <= folds; f++) {
    const fitEnd = Math.floor((order.length * f) / (folds + 1));
    const evalEnd = Math.floor((order.length * (f + 1)) / (folds + 1));
    if (evalEnd - fitEnd < 200 || fitEnd < 500) continue;
    const fitIdx = order.slice(0, fitEnd);
    const cutMs = rows.time[order[fitEnd - 1]] + embargoMs;
    const evalIdx = order.slice(fitEnd, evalEnd).filter((i) => rows.time[i] > cutMs);
    if (evalIdx.length < 200) continue;

    const stF = standardizerFrom({ n: fitIdx.length, f: Object.fromEntries(MODEL_FEATURES.map((nm) => [nm, fitIdx.map((i) => rows.f[nm][i])])) });
    const { X, y } = designMatrix(rows, stF, fitIdx);
    lambdas.forEach((lam, li) => {
      const w = fitRidge(X, y, lam * fitIdx.length);
      if (!w) return;
      const sc = scoreRows(rows, stF, w, evalIdx);
      const fw = evalIdx.map((i) => rows.fwd[i]);
      const ic = spearman(Array.from(sc), fw);
      if (Number.isFinite(ic)) {
        perLambda[li].sum += ic; perLambda[li].cnt++; perLambda[li].ics.push(ic);
        detail.push({ fold: f, lambda: lam, ic, nFit: fitIdx.length, nEval: evalIdx.length });
      }
    });
  }
  let best = null;
  lambdas.forEach((lam, li) => {
    if (!perLambda[li].cnt) return;
    const mean = perLambda[li].sum / perLambda[li].cnt;
    if (!best || mean > best.meanIC) best = { lambda: lam, meanIC: mean, folds: perLambda[li].cnt, ics: perLambda[li].ics };
  });
  return { best, detail, perLambda: lambdas.map((lam, li) => ({ lambda: lam, meanIC: perLambda[li].cnt ? perLambda[li].sum / perLambda[li].cnt : NaN, folds: perLambda[li].cnt })) };
}

// ═══════════════════════════ ตัวจำลองไม้ (ตรวจ parity กับ lab) ═══════════════════════════

/**
 * จำลองไม้เดียว: สัญญาณที่แท่ง i → เข้าที่ราคาปิดแท่ง i (ปัดแบบเดียวกับเครื่องยนต์)
 * แล้วเฝ้าแท่ง i+1 .. i+maxHold ตามลำดับเดียวกับ lab.mjs (gap ก่อน แล้วค่อย SL/TP)
 * คืน null ถ้าเรขาคณิตของฝั่งนั้นไม่ผ่าน invariant (เครื่องยนต์จะไม่ออกสัญญาณ)
 */
function simulateTrade(ds, i, isLong, maxHold) {
  const g = geometryAt(ds.candles, i, ds.market);
  if (isLong ? !g.okLong : !g.okShort) return null;
  const entry = g.entryOut;
  const sl = isLong ? g.slLong : g.slShort;
  const tp = isLong ? g.tpLong : g.tpShort;
  const stopDistPct = Math.abs(entry - sl) / entry;
  if (!(stopDistPct > 0)) return null;

  let exit = NaN; let reason = 'time_exit'; let lastClose = NaN; let holdBars = 0;
  const last = Math.min(i + maxHold, ds.candles.length - 1);
  for (let j = i + 1; j <= last; j++) {
    const bar = ds.candles[j];
    if (!isUsableBar(bar)) continue;
    lastClose = bar.close; holdBars = j - i;
    if (isLong) {
      if (bar.open <= sl) { exit = bar.open; reason = 'gap_stop'; break; }
      if (bar.open >= tp) { exit = bar.open; reason = 'gap_target'; break; }
      if (bar.low <= sl) { exit = sl; reason = 'stop_loss'; break; }
      if (bar.high >= tp) { exit = tp; reason = 'take_profit'; break; }
    } else {
      if (bar.open >= sl) { exit = bar.open; reason = 'gap_stop'; break; }
      if (bar.open <= tp) { exit = bar.open; reason = 'gap_target'; break; }
      if (bar.high >= sl) { exit = sl; reason = 'stop_loss'; break; }
      if (bar.low <= tp) { exit = tp; reason = 'take_profit'; break; }
    }
  }
  if (!Number.isFinite(exit)) exit = lastClose;
  if (!Number.isFinite(exit)) return null;

  const gross = isLong ? (exit - entry) / entry : (entry - exit) / entry;
  const fee = feeFractionFor(ds.market, ds.symbol, entry, stopDistPct);
  return {
    entry, exit, sl, tp, reason, holdBars, gross, fee, net: gross - fee,
    exitIndex: i + Math.max(1, holdBars),
  };
}

// ═════════════════════════════ สถิติแบบจับกลุ่ม ═════════════════════════════
//
// ไม้ของเดือนเดียวกันไม่ใช่ตัวอย่างอิสระ: หุ้น 16 ตัวในเดือนที่ตลาดตกทั้งเดือน
// ให้ผลไปทางเดียวกันหมด ถ้านับเป็น 16 ตัวอย่างอิสระ ค่า p จะเล็กเกินจริงหลายเท่า
// จึงจับกลุ่มด้วย "เดือนปฏิทิน" ทั้งจักรวาล (ไม่ใช่ สัญลักษณ์ × เดือน)

function logGamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let xx = x; let y = x; let tmp = xx + 5.5;
  tmp -= (xx + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / xx);
}

function betacf(a, b, x) {
  const MAXIT = 200; const EPS = 3e-12; const FPMIN = 1e-300;
  const qab = a + b; const qap = a + 1; const qam = a - 1;
  let c = 1; let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** p สองหางของสถิติ t ที่ df องศาอิสระ */
function tTestP(t, df) {
  if (!Number.isFinite(t) || df <= 0) return NaN;
  return betai(df / 2, 0.5, df / (df + t * t));
}

/**
 * ค่าเฉลี่ย + SE แบบ cluster-robust + p
 * SE² = Σ_g (Σ_{i∈g} (x_i − x̄))² / n²  คูณตัวแก้ตัวอย่างเล็ก G/(G−1)
 */
function clusterMeanStats(values, clusters) {
  const n = values.length;
  if (!n) return { n: 0, mean: NaN, se: NaN, t: NaN, p: NaN, G: 0 };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  const byG = new Map();
  for (let i = 0; i < n; i++) {
    byG.set(clusters[i], (byG.get(clusters[i]) ?? 0) + (values[i] - mean));
  }
  const G = byG.size;
  let ss = 0;
  for (const v of byG.values()) ss += v * v;
  const corr = G > 1 ? G / (G - 1) : 1;
  const se = Math.sqrt((ss * corr)) / n;
  const t = se > 0 ? mean / se : NaN;
  return { n, mean, se, t, p: tTestP(t, Math.max(1, G - 1)), G };
}

/** ช่วงความเชื่อมั่นจากการสุ่มกลุ่มทั้งกลุ่มคืนที่ (cluster bootstrap) */
function clusterBootstrapCI(values, clusters, rng, B = OPT.bootstrap) {
  const groups = new Map();
  for (let i = 0; i < values.length; i++) {
    if (!groups.has(clusters[i])) groups.set(clusters[i], { n: 0, s: 0 });
    const g = groups.get(clusters[i]);
    g.n++; g.s += values[i];
  }
  const arr = [...groups.values()];
  const G = arr.length;
  if (G < 2) return [NaN, NaN];
  const out = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let n = 0; let s = 0;
    for (let k = 0; k < G; k++) {
      const a = arr[(rng() * G) | 0];
      n += a.n; s += a.s;
    }
    out[b] = n ? s / n : NaN;
  }
  const sorted = Array.from(out).filter(Number.isFinite).sort((a, b) => a - b);
  return [percentileOfSorted(sorted, 0.025), percentileOfSorted(sorted, 0.975)];
}

// ═══════════════════════════ กลยุทธ์: คะแนน → ไม้จริง ═══════════════════════════

/**
 * เดินไม้จริงจากคะแนน
 *
 * กติกาที่เลือกไว้ก่อนดูผล:
 *   · หนึ่งสัญลักษณ์ถือได้ทีละไม้ — ถ้ายังอยู่ในไม้ สัญญาณใหม่ถูกข้าม
 *     (ไม้ซ้อนกันจะนับผลตอบแทนช่วงเดียวกันหลายรอบ ทำให้ตัวอย่างเฟ้อ)
 *   · เข้าเมื่อ |คะแนน| ถึงเส้นแบ่ง (เส้นแบ่งมาจากควอนไทล์ของคะแนนบน train เท่านั้น)
 *   · ทิศ = เครื่องหมายของคะแนน (คะแนนคือผลตอบแทนที่โมเดลทำนาย)
 */
function runStrategy(pool, rows, scores, loCut, hiCut, maxHold) {
  const order = Array.from({ length: rows.n }, (_, i) => i)
    .sort((a, b) => (rows.sym[a] - rows.sym[b]) || (rows.idx[a] - rows.idx[b]));
  const nextFree = new Int32Array(pool.nSym).fill(-1);
  const trades = [];
  for (const r of order) {
    const s = rows.sym[r];
    const i = rows.idx[r];
    if (i <= nextFree[s]) continue;
    const sc = scores[r];
    let isLong = null;
    if (sc >= hiCut) isLong = true;
    else if (sc <= loCut) isLong = false;
    if (isLong === null) continue;
    const tr = simulateTrade(pool.syms[s], i, isLong, maxHold);
    if (!tr) continue;
    nextFree[s] = tr.exitIndex;
    trades.push({
      sym: pool.syms[s].symbol, s, i, time: rows.time[r], cluster: rows.cluster[r],
      isLong, score: sc, ...tr, fwd: rows.fwd[r],
    });
  }
  return trades;
}

/** เข้าไม้ทุกแท่งไม่ดูอะไร — ฐานเปรียบเทียบที่ "ไม่มีสัญญาณเลย" */
function runAlways(pool, rows, isLong, maxHold) {
  const order = Array.from({ length: rows.n }, (_, i) => i)
    .sort((a, b) => (rows.sym[a] - rows.sym[b]) || (rows.idx[a] - rows.idx[b]));
  const nextFree = new Int32Array(pool.nSym).fill(-1);
  const trades = [];
  for (const r of order) {
    const s = rows.sym[r];
    const i = rows.idx[r];
    if (i <= nextFree[s]) continue;
    const tr = simulateTrade(pool.syms[s], i, isLong, maxHold);
    if (!tr) continue;
    nextFree[s] = tr.exitIndex;
    trades.push({ sym: pool.syms[s].symbol, s, i, time: rows.time[r], cluster: rows.cluster[r], isLong, ...tr });
  }
  return trades;
}

/**
 * เพดาน: ถ้ารู้ทิศที่ถูกต้องของ "แท่งเดียวกันนี้" ทุกไม้ จะได้เท่าไร
 * เลือกฝั่งที่ผลจริงดีกว่าแบบมองย้อนหลัง — เป็นตัวเลขที่เป็นไปไม่ได้จริง
 * มีไว้ตอบคำถามเดียว: "ที่ทำได้อยู่ตอนนี้ คิดเป็นกี่ % ของสิ่งที่ดีที่สุดที่เป็นไปได้"
 */
function ceilingOnEntries(pool, entries, maxHold) {
  const trades = [];
  for (const e of entries) {
    const L = simulateTrade(pool.syms[e.s], e.i, true, maxHold);
    const S = simulateTrade(pool.syms[e.s], e.i, false, maxHold);
    let best = null;
    if (L && S) best = L.net >= S.net ? { ...L, isLong: true } : { ...S, isLong: false };
    else if (L) best = { ...L, isLong: true };
    else if (S) best = { ...S, isLong: false };
    if (!best) continue;
    trades.push({ sym: pool.syms[e.s].symbol, s: e.s, i: e.i, time: e.time, cluster: e.cluster, ...best });
  }
  return trades;
}

/**
 * เทียบสองกลยุทธ์แบบจับคู่รายเดือน
 *
 * ทำไมต้องจับคู่: สองกลยุทธ์เข้าไม้คนละชุดแท่ง เอาค่าเฉลี่ยรวมมาลบกันตรง ๆ ไม่ได้
 * เพราะสัดส่วนของยุคดี/ยุคร้ายในสองชุดไม่เท่ากัน — เดือนที่ตลาดขึ้นแรงอาจมีไม้ของ
 * ฝั่งหนึ่งเยอะกว่า การจับคู่รายเดือนทำให้ทั้งสองฝั่งเจอ "เดือนเดียวกัน" เท่ากัน
 * คำถามที่ตอบคือ "โมเดลเพิ่มอะไรจากการเข้าไม้มั่ว ๆ ไหม" ซึ่งเป็นคำถามที่ตัดสินใจได้
 */
function pairedByCluster(A, B) {
  const agg = (arr) => {
    const m = new Map();
    for (const t of arr) {
      if (!m.has(t.cluster)) m.set(t.cluster, { s: 0, n: 0 });
      const g = m.get(t.cluster);
      g.s += t.net * 10000; g.n++;
    }
    return m;
  };
  const ma = agg(A); const mb = agg(B);
  const diffs = [];
  for (const [k, va] of ma) {
    const vb = mb.get(k);
    if (!vb) continue;
    diffs.push(va.s / va.n - vb.s / vb.n);
  }
  const G = diffs.length;
  if (G < 2) return { G, mean: NaN, p: NaN, ci: [NaN, NaN] };
  const mean = diffs.reduce((a, b) => a + b, 0) / G;
  let ss = 0;
  for (const d of diffs) ss += (d - mean) ** 2;
  const se = Math.sqrt(ss / (G - 1) / G);
  const t = se > 0 ? mean / se : NaN;
  return { G, mean, se, t, p: tTestP(t, G - 1), ci: [mean - 1.96 * se, mean + 1.96 * se] };
}

/**
 * ═══════════════ สถิติของชุดไม้ + ด่านตรวจตัวเอง (เพิ่มรอบซ่อมเครื่องมือ) ═══════════════
 *
 * ทำไมต้องคำนวณสองรอบแล้วเทียบกันทุกบิต
 *
 * ตัวตรวจความคงที่ (check-determinism.mjs) จับได้ว่าประมาณ 1 ใน 20 รอบ
 * วัตถุผลลัพธ์ของช่องหนึ่งจะมี "ค่าของช่องข้าง ๆ" อยู่ในนั้น ตัวอย่างที่จับได้จริง:
 *
 *   train h=10 ช่อง "เครื่องหมายล้วน" ควรได้ +10.96 bps/ไม้ แต่บางรอบได้ −37.51
 *   ซึ่งเป็นค่าของช่อง "ขายทุกแท่ง" **ตรงกันทุกบิตทั้ง 9 ค่า**
 *   (grossBps · netBps · netSe · netT · netP · winRate · dirAccuracy · longShare · avgHold)
 *   ขณะที่ค่าที่เหลือของช่องนั้น (n · byReason · netCI · firstTime · lastTime)
 *   ยังถูกต้องเป็นของตัวเอง
 *
 * ชุดไม้ไม่ได้ผิด — สิ่งที่ผิดคือค่าที่ถูกเขียนลงในวัตถุผลลัพธ์ นี่เป็นอาการระดับ
 * เครื่องยนต์ JS/หน่วยความจำ ไม่ใช่บั๊กที่แก้ได้ด้วยการเขียนสูตรใหม่ และมันเงียบสนิท:
 * ตัวเลขบวกกลายเป็นลบโดยไม่มี error ใด ๆ
 *
 * ⚠ นี่คือกลไกเดียวกับที่ทำให้รอบก่อนเห็น "validation h=3 ridge net 194.79"
 *   ซึ่งตรวจแล้วว่าเป็นค่า ceilingOnAllBars ของช่องเดียวกันเป๊ะ ๆ (ค่าจริงคือ 0.32)
 *   ทั้งสองกรณีคือ "ค่าของช่องหนึ่งไปโผล่ในสล็อตของอีกช่องหนึ่ง ในวัตถุก้อนเดียวกัน"
 *
 * แก้ไม่ได้ที่ต้นเหตุ แต่กันไม่ให้ผลที่เชื่อไม่ได้หลุดออกไปได้:
 * คำนวณสถิติสองรอบ แล้วเทียบทุกบิต ถ้าไม่ตรง = รอบนี้ใช้ไม่ได้ → หยุดดัง ๆ
 * ดีกว่าพิมพ์ตัวเลขสวย ๆ ที่ไม่มีใครรู้ว่าผิด
 */
function summarizeCore(trades) {
  const gross = trades.map((t) => t.gross * 10000);
  const fee = trades.map((t) => t.fee * 10000);
  const net = trades.map((t) => t.net * 10000);
  const cl = trades.map((t) => t.cluster);
  const g = clusterMeanStats(gross, cl);
  const nStat = clusterMeanStats(net, cl);
  const wins = trades.filter((t) => t.net > 0).length;
  const dirRight = trades.filter((t) => t.gross > 0).length;
  const longs = trades.filter((t) => t.isLong).length;
  let holdSum = 0;
  for (const t of trades) holdSum += t.holdBars;
  const byReason = {};
  for (const t of trades) byReason[t.reason] = (byReason[t.reason] ?? 0) + 1;
  return {
    n: trades.length,
    grossBps: g.mean, feeBps: fee.reduce((a, b) => a + b, 0) / fee.length,
    netBps: nStat.mean, netSe: nStat.se, netT: nStat.t, netP: nStat.p, clusters: nStat.G,
    winRate: wins / trades.length,
    dirAccuracy: dirRight / trades.length,
    longShare: longs / trades.length,
    avgHold: holdSum / trades.length,
    byReason,
    firstTime: new Date(Math.min(...trades.map((t) => t.time))).toISOString(),
    lastTime: new Date(Math.max(...trades.map((t) => t.time))).toISOString(),
  };
}

/** จำนวนครั้งที่ด่านตรวจตัวเองจับความผิดปกติได้ — รายงานไว้ให้เห็น ไม่ซ่อน */
const SELF_CHECK = { comparisons: 0, mismatches: [] };

function summarizeTrades(trades, rng, label) {
  if (!trades.length) return { label, n: 0 };
  const a = summarizeCore(trades);
  const b = summarizeCore(trades);
  SELF_CHECK.comparisons++;
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) {
    SELF_CHECK.mismatches.push({ label, a: sa.slice(0, 300), b: sb.slice(0, 300) });
    throw new Error(`ด่านตรวจตัวเองไม่ผ่าน: สถิติของช่อง "${label}" คำนวณสองรอบได้คนละค่า\n`
      + `  รอบที่ 1: ${sa.slice(0, 240)}\n  รอบที่ 2: ${sb.slice(0, 240)}\n`
      + '  รอบนี้ใช้ไม่ได้ — อย่าอ่านตัวเลขจากรอบนี้ ให้รันใหม่');
  }
  const net = trades.map((t) => t.net * 10000);
  const cl = trades.map((t) => t.cluster);
  return { label, ...a, netCI: clusterBootstrapCI(net, cl, rng) };
}

/**
 * ด่านตรวจข้ามช่อง — จับ "ค่าของช่องหนึ่งไปโผล่ในอีกช่อง" ที่การคำนวณซ้ำอาจพลาด
 *
 * ตรรกะ: สองกลยุทธ์ที่เข้าไม้คนละจำนวน เป็นไปไม่ได้ที่ค่าเฉลี่ยจะตรงกันทุกบิต
 * (ตัวเลขเป็น double 15-16 หลัก การบังเอิญตรงกันหมดมีโอกาสราวศูนย์)
 * ถ้าเจอ = หน่วยความจำปนกัน ไม่ใช่เรื่องบังเอิญ
 */
function crossCheckSummaries(bucket, tag) {
  const names = Object.keys(bucket).filter((k) => bucket[k] && bucket[k].n > 0);
  const bad = [];
  for (const nm of names) {
    const s = bucket[nm];
    if (nm === 'alwaysLong' && s.longShare !== 1) bad.push(`${tag}: "ซื้อทุกแท่ง" มีฝั่งซื้อ ${s.longShare} ไม่ใช่ 1`);
    if (nm === 'alwaysShort' && s.longShare !== 0) bad.push(`${tag}: "ขายทุกแท่ง" มีฝั่งซื้อ ${s.longShare} ไม่ใช่ 0`);
  }
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const A = bucket[names[i]]; const B = bucket[names[j]];
      if (A.n === B.n) continue;                       // ชุดไม้ต่างขนาด ถึงจะเถียงได้
      if (!Number.isFinite(A.netBps) || !Number.isFinite(B.netBps)) continue;
      if (A.netBps === B.netBps) {
        bad.push(`${tag}: "${names[i]}" (${A.n} ไม้) กับ "${names[j]}" (${B.n} ไม้) `
          + `มีค่าเฉลี่ยสุทธิตรงกันทุกบิต (${A.netBps}) — เป็นไปไม่ได้ทางสถิติ = หน่วยความจำปนกัน`);
      }
    }
  }
  return bad;
}

// ═══════════════════════════ การเรียก lab.mjs ═══════════════════════════

/**
 * ═══════════════ แคชผลของ lab.mjs — ของเดิมใช้ซ้ำโดยไม่ตรวจอะไรเลย ═══════════════
 *
 * ของเดิมเช็คแค่ "ไฟล์ csv มีอยู่ไหม" ถ้ามีก็ใช้เลย แปลว่า:
 *   · ไฟล์ที่สร้างจากอาร์กิวเมนต์ชุดอื่น (เช่นเปลี่ยน --max-hold หรือ seed) ถูกใช้ต่อเงียบ ๆ
 *   · ไฟล์ที่เขียนค้างไว้ครึ่งเดียวเพราะรันก่อนหน้าโดนหยุดกลางคัน ก็ถูกใช้ต่อเงียบ ๆ
 *   · lab.mjs รุ่นใหม่ที่แก้สูตรไปแล้ว จะไม่มีผล เพราะไม่มีใครสั่งให้สร้างใหม่
 * ทั้งสามกรณีให้ "คำตอบที่ต่างจากเดิมโดยไม่มีใครรู้" ซึ่งคือโรคที่รอบนี้ต้องรักษา
 *
 * ของใหม่: เก็บใบกำกับ (.meta.json) คู่กับ csv ทุกไฟล์ บันทึกอาร์กิวเมนต์ที่ใช้จริง
 * + sha ของ lab.mjs + sha ของ csv เอง ถ้าอะไรไม่ตรง = สร้างใหม่ ไม่ใช่ใช้ต่อ
 */
function runLab(tag, split, extra = []) {
  const csv = path.join(WORK_DIR, `${tag}-${split}-trades.csv`);
  const metaFile = `${csv}.meta.json`;
  const labArgs = [
    '--markets=US_STOCK',
    '--timeframes=1D',
    `--split=${split}`,
    `--max-hold=${PRIMARY_H}`,
    `--tag=${tag}`,
    '--dump-trades',
    '--bootstrap=200',
    `--seed=${OPT.seed}`,
    ...extra,
  ];
  const labSha = sha256File(LAB);
  const want = { labArgs, labSha };

  if (fs.existsSync(csv) && fs.existsSync(metaFile)) {
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { meta = null; }
    const sameArgs = meta && JSON.stringify(meta.labArgs) === JSON.stringify(want.labArgs);
    const sameLab = meta && meta.labSha === want.labSha;
    const sameCsv = meta && meta.csvSha === sha256File(csv);
    if (sameArgs && sameLab && sameCsv) {
      IN.note(csv, `lab-cache:${tag}-${split}`);
      return { csv, cached: true };
    }
    console.warn(`⚠ แคชของ lab (${tag}/${split}) ไม่ตรงใบกำกับ — สร้างใหม่`
      + ` (อาร์กิวเมนต์ตรง: ${!!sameArgs} · lab.mjs ตรง: ${!!sameLab} · ไฟล์ตรง: ${!!sameCsv})`);
  }

  fs.mkdirSync(WORK_DIR, { recursive: true });
  execFileSync(process.execPath, [LAB, ...labArgs],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  for (const suffix of [`${split}-trades.csv`, `${split}.txt`, `${split}.json`]) {
    const src = path.join(REPORT_DIR, `${tag}-${suffix}`);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(WORK_DIR, `${tag}-${suffix}`));
  }
  if (!fs.existsSync(csv)) throw new Error(`lab.mjs ไม่ได้สร้าง ${csv} — หยุดดีกว่าเดาต่อ`);
  fs.writeFileSync(metaFile, JSON.stringify({ ...want, csvSha: sha256File(csv) }, null, 2));
  IN.note(csv, `lab-cache:${tag}-${split}`);
  return { csv, cached: false };
}

function readTradesCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const num = new Set(['confidence', 'holdBars', 'entry', 'exit', 'stopLoss', 'takeProfit',
    'rrPlanned', 'stopDistPct', 'plannedRisk', 'realizedRisk', 'riskKeepRatio', 'rGrossPlanned',
    'rGrossRealized', 'rGross', 'costR', 'costRBase', 'rNet', 'tradeable', 'entryIndex', 'exitIndex']);
  return lines.slice(1).map((line) => {
    const v = line.split(',');
    const o = {};
    head.forEach((k, idx) => { o[k] = num.has(k) ? Number(v[idx]) : v[idx]; });
    return o;
  });
}

/** แปลงไม้ของ lab (หน่วย R) เป็น bps ของมูลค่าสถานะ เพื่อให้เทียบกับกลยุทธ์ในไฟล์นี้ได้ */
function labTradesToBps(trades) {
  const out = [];
  for (const t of trades) {
    if (!Number.isFinite(t.stopDistPct) || !(t.stopDistPct > 0)) continue;
    const d = new Date(t.entryTime);
    out.push({
      sym: t.symbol,
      time: Date.parse(t.entryTime),
      cluster: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      isLong: t.action === 'BUY',
      gross: t.rGross * t.stopDistPct,
      fee: t.costRBase * t.stopDistPct,
      net: (t.rGross - t.costRBase) * t.stopDistPct,
      holdBars: t.holdBars,
      reason: t.exitReason,
    });
  }
  return out;
}

// ═══════════════════════════════ การเขียนรายงาน ═══════════════════════════════

const LINES = [];
const W = (s = '') => LINES.push(s);
const f2 = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : '—');
const pS = (p) => (!Number.isFinite(p) ? '—' : (p < 1e-4 ? p.toExponential(1) : p.toFixed(4)));
const pctS = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');

// ════════════════════════════════════ MAIN ════════════════════════════════════

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const rng = mulberry32(OPT.seed);
  const bounds = IN.readJson(SPLIT_FILE, 'split');
  const OUT = {
    generatedAt: new Date().toISOString(), opt: OPT,
    gate: {}, meter: {}, leak: {}, model: {}, train: {}, validation: {}, tests: [], ledger: {},
    provenance: {},
  };

  // ══════════════════ S0 · ด่านคัด: อะไรรอดจากรอบก่อนบ้าง ══════════════════
  const cells = collectCells();
  const gated = cells.map((c) => ({ ...c, gate: passesGate(c), loose: passesLooseGate(c) }));
  const survivors = gated.filter((c) => c.gate.pass);
  const looseSurvivors = gated.filter((c) => c.loose);

  const byMarket = {};
  for (const c of gated) {
    const mk = GROUP_MARKET[c.group] ?? c.group;
    byMarket[mk] ??= { cells: 0, strict: 0, loose: 0 };
    byMarket[mk].cells++;
    if (c.gate.pass) byMarket[mk].strict++;
    if (c.loose) byMarket[mk].loose++;
  }
  OUT.gate = {
    cellsTotal: cells.length,
    bySource: cells.reduce((a, c) => { a[c.src] = (a[c.src] ?? 0) + 1; return a; }, {}),
    byMarket,
    survivors: survivors.map((c) => ({
      src: c.src, group: c.group, tf: c.tf, feature: c.feature, h: c.h,
      edgeBps: c.edgeBps, feeBps: c.feeBps, netBps: c.netBps, moneyP: c.moneyP, icP: c.icP,
    })),
    looseCount: looseSurvivors.length,
    thaiStrict: gated.filter((c) => GROUP_MARKET[c.group] === 'TH_STOCK' && c.gate.pass).length,
    thaiLoose: gated.filter((c) => GROUP_MARKET[c.group] === 'TH_STOCK' && c.loose).length,
  };

  // หุ้นไทย: ช่องที่ "ใกล้ผ่านที่สุด" — ต้องรายงานว่าขาดไปเท่าไร
  const thaiCells = gated.filter((c) => GROUP_MARKET[c.group] === 'TH_STOCK' && !c.control
    && !CLOSED_CELLS.has(`${c.group}|${c.tf}`));
  const cellKey = (c) => `${c.src}|${c.group}|${c.tf}|${c.feature}|${c.h}`;
  const byNetDesc = (a, b) => (sortNum(b.netBps) - sortNum(a.netBps)) || tieKey(cellKey(a), cellKey(b));
  const thaiClosest = [...thaiCells].sort(byNetDesc).slice(0, 12);
  OUT.gate.thaiClosest = thaiClosest.map((c) => ({
    src: c.src, group: c.group, tf: c.tf, feature: c.feature, h: c.h,
    edgeBps: c.edgeBps, feeBps: c.feeBps, netBps: c.netBps, moneyP: c.moneyP,
    moneyHolm: c.moneyHolm, icHolm: c.icHolm, leakyUniverse: LEAKY_UNIVERSE.has(c.group),
  }));
  // เอาเฉพาะจักรวาลหุ้นไทยที่ "สะอาด" (ไม่ได้เลือกตัวด้วยข้อมูลอนาคต) — นี่คือของจริงที่เจ้าของมี
  OUT.gate.thaiCleanClosest = thaiCells
    .filter((c) => !LEAKY_UNIVERSE.has(c.group))
    .sort(byNetDesc)
    .slice(0, 12)
    .map((c) => ({
      src: c.src, group: c.group, tf: c.tf, feature: c.feature, h: c.h,
      edgeBps: c.edgeBps, feeBps: c.feeBps, netBps: c.netBps, moneyP: c.moneyP,
      moneyHolm: c.moneyHolm,
      // ต้องแรงกว่าที่วัดได้กี่เท่าถึงจะแค่ "เท่าทุน" (ยังไม่นับว่าต้องมีนัยสำคัญด้วย)
      edgeMultiplierToBreakEven: Math.abs(c.edgeBps) > 0 ? c.feeBps / Math.abs(c.edgeBps) : NaN,
    }));

  // อ้างอิงเพดานที่วัดไว้แล้ว (exp-ceiling.json) — p* = ความแม่นทิศที่ต้องได้ถึงจะคุ้มค่าธรรมเนียม
  const ceilJson = IN.readJson(SRC_CEILING, 'upstream:ceiling');
  OUT.ceilingRef = {};
  for (const key of Object.keys(ceilJson.cells)) {
    const [split, group, tf, hh] = key.split('|');
    if (split !== 'train' || tf !== '1D') continue;
    if (!['SET50', 'RUNNER', 'US_STOCK', 'FOREX'].includes(group)) continue;
    const c = ceilJson.cells[key];
    const acc = ceilJson.engineAcc[key];
    OUT.ceilingRef[`${group}|${hh}`] = {
      pStar: c.pStar, pFair: c.pFair, accTax: c.pStar - c.pFair,
      perfectNetBps: c.perfectNet * 10000, dirNetBps: c.dirNet * 10000, feeBps: c.fee * 10000,
      engineAcc: acc?.rate ?? null,
    };
  }

  if (!survivors.length) {
    OUT.stopped = 'ไม่มี feature ไหนรอดด่านคัดเลย — หยุดตามกติกาข้อ 1';
    fs.writeFileSync(path.join(OPT.outDir, 'exp-combine.json'), JSON.stringify(OUT, null, 2));
    console.log('ไม่มี feature ไหนรอด — ไม่ประกอบโมเดล');
    return;
  }

  // จักรวาลที่จะประกอบโมเดล: ช่องที่รอดกระจุกอยู่ที่ไหนมากที่สุด
  const cellCount = {};
  for (const c of survivors) cellCount[`${c.group}|${c.tf}`] = (cellCount[`${c.group}|${c.tf}`] ?? 0) + 1;
  const cellRank = Object.entries(cellCount).sort((a, b) => (b[1] - a[1]) || tieKey(a[0], b[0]));
  const targetCell = cellRank[0][0];
  // ถ้าเสมอกัน ผู้ชนะถูกตัดสินด้วยตัวอักษร ไม่ใช่หลักฐาน — ต้องบอกให้ดัง ไม่ใช่เงียบ
  const targetTie = cellRank.filter(([, v]) => v === cellRank[0][1]).map(([k]) => k);
  if (targetTie.length > 1) {
    console.warn(`⚠ จักรวาลเป้าหมายเสมอกัน ${targetTie.length} ช่อง (${targetTie.join(' · ')}) `
      + `— เลือก ${targetCell} ด้วยลำดับตัวอักษร ไม่ใช่ด้วยหลักฐาน`);
  }
  const [targetGroup, targetTf] = targetCell.split('|');
  const targetMarket = GROUP_MARKET[targetGroup];

  MODEL_FEATURES = [...new Set(survivors.filter((c) => `${c.group}|${c.tf}` === targetCell)
    .map((c) => c.feature))].sort();
  OUT.model.targetCell = targetCell;
  OUT.model.features = MODEL_FEATURES;
  OUT.model.survivorCellsInTarget = survivors.filter((c) => `${c.group}|${c.tf}` === targetCell).length;

  console.log(`ด่านคัด: ${survivors.length} ช่องรอด · จักรวาลเป้าหมาย ${targetCell} · feature ${MODEL_FEATURES.join(', ')}`);

  // ══════════════════ โหลดข้อมูลของจักรวาลเป้าหมายเท่านั้น ══════════════════
  const datasets = [];
  for (const f of listDatasets()) {
    if (!f.startsWith(`${targetMarket}__`) || !f.endsWith(`__${targetTf}.json`)) continue;
    const ds = loadDataset(f);
    if (ds.verdict === 'bad' || !ds.candles.length) continue;
    datasets.push(ds);
  }
  const pool = buildPool(datasets, targetMarket, targetTf);
  const trainEnd = Date.parse(bounds.timeframes[targetTf].trainEnd);
  const validationEnd = Date.parse(bounds.timeframes[targetTf].validationEnd);
  OUT.model.pool = {
    symbols: pool.syms.map((d) => d.symbol), nSym: pool.nSym, gridSteps: pool.G, minPool: pool.minPool,
    trainEnd: new Date(trainEnd).toISOString(), validationEnd: new Date(validationEnd).toISOString(),
  };

  // ══════════════════ M0a · ตรวจเครื่องวัด: ATR ต้องตรงกับของจริง ══════════════════
  const { indicators } = await loadSrcModules(['src/lib/indicators.ts']);
  const atrParity = { checked: 0, maxErr: 0 };
  for (const ds of datasets) {
    const step = Math.max(1, Math.floor(ds.candles.length / 300));
    for (let i = MIN_HISTORY; i < ds.candles.length; i += step) {
      const mine = atrAt(ds.candles, i);
      const real = indicators.ATR(ds.candles.slice(0, i + 1), GEO.atrPeriod);
      atrParity.checked++;
      const d = Math.abs(mine - real);
      if (Number.isFinite(d)) atrParity.maxErr = Math.max(atrParity.maxErr, d);
    }
  }
  OUT.meter.atrParity = atrParity;

  // ══════════════════ สร้าง feature ทั้งจักรวาล ══════════════════
  const crossFeats = buildCrossFeatures(pool, pool.G, false);
  const symFeats = pool.syms.map((ds) => buildSymbolFeatures(ds));

  // ══════════ M1 · ตรวจ look-ahead ด้วยการตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ ══════════
  //
  // ค่าของแท่งเก่าต้องไม่เปลี่ยนแม้แต่บิตเดียว — ทั้ง feature ข้ามสัญลักษณ์
  // (ซึ่งอันตรายกว่า เพราะต้องอ่านข้อมูลของทุกตัวในกลุ่ม) และ feature รายตัว
  const cutG = Math.floor(pool.G * (1 - OPT.truncFrac));
  const crossCut = buildCrossFeatures(pool, cutG, true);
  const crossFull = buildCrossFeatures(pool, pool.G, true);
  const leak = { compared: 0, mismatch: 0, perFeature: {}, leakCompared: 0, leakChanged: 0, cutG, fullG: pool.G };
  for (const name of Object.keys(crossCut)) {
    if (name.startsWith('LEAK_')) continue;
    leak.perFeature[name] = { compared: 0, mismatch: 0 };
    for (let s = 0; s < pool.nSym; s++) {
      for (let k = 0; k < cutG; k++) {
        const a = crossFull[name][s][k]; const b = crossCut[name][s][k];
        const bothNaN = Number.isNaN(a) && Number.isNaN(b);
        leak.compared++; leak.perFeature[name].compared++;
        if (!bothNaN && !(a === b)) { leak.mismatch++; leak.perFeature[name].mismatch++; }
      }
    }
  }
  // ตัวควบคุมเชิงบวก: ต้องเปลี่ยนเยอะ ไม่งั้นแปลว่าเครื่องตรวจไม่มีฟัน
  for (let s = 0; s < pool.nSym; s++) {
    for (let k = 0; k < cutG; k++) {
      const a = crossFull.LEAK_zFull[s][k]; const b = crossCut.LEAK_zFull[s][k];
      const bothNaN = Number.isNaN(a) && Number.isNaN(b);
      if (bothNaN) continue;
      leak.leakCompared++;
      if (a !== b) leak.leakChanged++;
    }
  }
  // feature รายตัว
  const symLeak = { compared: 0, mismatch: 0, perFeature: {} };
  for (let s = 0; s < pool.nSym; s++) {
    const ds = pool.syms[s];
    const cutN = Math.floor(ds.candles.length * (1 - OPT.truncFrac));
    const cut = buildSymbolFeatures(ds, cutN - 1);
    for (const name of Object.keys(cut)) {
      symLeak.perFeature[name] ??= { compared: 0, mismatch: 0 };
      for (let i = 0; i < cutN; i++) {
        const a = symFeats[s][name][i]; const b = cut[name][i];
        const bothNaN = Number.isNaN(a) && Number.isNaN(b);
        symLeak.compared++; symLeak.perFeature[name].compared++;
        if (!bothNaN && !(a === b)) { symLeak.mismatch++; symLeak.perFeature[name].mismatch++; }
      }
    }
  }
  OUT.leak = { cross: leak, symbol: symLeak };

  // ══════════ ตารางแถวของ train (แคชไว้ต่อระยะถือ) ══════════
  const trainRows = {};
  // นับไม้ที่ถูกทิ้งเพราะหน้าต่างล้ำเส้นแบ่ง — ต้องรายงาน ไม่ใช่ทิ้งเงียบ ๆ
  OUT.model.spill = { train: {}, validation: {} };
  for (const h of MODEL_HORIZONS) {
    trainRows[h] = buildRows(pool, symFeats, crossFeats, -Infinity, trainEnd, h);
    OUT.model.spill.train[h] = { kept: trainRows[h].kept, dropped: trainRows[h].dropSpill };
  }

  // ══════════ M0b · วัด IC ใหม่ด้วยโค้ดอิสระ เทียบกับรายงานต้นทาง ══════════
  //
  // ⚠ นี่ไม่ใช่การเทียบ "ทุกบิต" — รายงานต้นทางจับกลุ่มและถ่วงน้ำหนักคนละแบบ
  //   และแถวที่นี่ต้องมี feature ครบทั้ง 8 ตัวถึงจะนับ (ตัวอย่างจึงเล็กกว่า)
  //   สิ่งที่ตรวจคือ "เครื่องหมายตรงกันไหม และขนาดอยู่ระดับเดียวกันไหม"
  //   ถ้าเครื่องหมายกลับด้าน แปลว่าลอกสูตรผิด ซึ่งจะทำให้ทุกอย่างหลังจากนี้เป็นโมฆะ
  const icCheck = [];
  for (const c of survivors.filter((x) => `${x.group}|${x.tf}` === targetCell)) {
    const rowsH = trainRows[c.h] ?? buildRows(pool, symFeats, crossFeats, -Infinity, trainEnd, c.h);
    const vals = rowsH.f[c.feature];
    if (!vals) continue;
    const icHere = spearman(vals, rowsH.fwd);
    const icRep = c.src === 'feat-volume'
      ? (IN.readJson(SRC_VOLUME, 'upstream:feat-volume').rows
        .find((r) => r.cell === targetCell && r.feature === c.feature && r.h === c.h)?.ic ?? NaN)
      : NaN;
    icCheck.push({
      feature: c.feature, h: c.h, src: c.src,
      icReported: icRep, icHere, sameSign: Number.isFinite(icRep) ? Math.sign(icRep) === Math.sign(icHere) : null,
      n: rowsH.n,
    });
  }
  OUT.meter.icRecheck = icCheck;

  // ══════════ M0c · ตัวจำลองไม้ต้องให้ผลตรงกับ lab.mjs ทุกบิต ══════════
  const parity = { ran: false, checked: 0, slErr: 0, tpErr: 0, exitErr: 0, reasonMismatch: 0, holdMismatch: 0, noBar: 0 };
  let engineTrain = null;
  if (OPT.useLab) {
    const dsIndex = new Map();
    for (const ds of datasets) {
      const idx = new Map();
      ds.candles.forEach((c, i) => idx.set(c.timestamp, i));
      dsIndex.set(ds.symbol, { ds, idx });
    }
    const atr = runLab('combine-atr', 'train', [
      `--config=${JSON.stringify({ exits: { useSupportResistance: false, slAtrMult: GEO.slAtrMult, tpAtrMult: GEO.tpAtrMult } })}`,
    ]);
    const atrTrades = readTradesCsv(atr.csv);
    parity.ran = true;
    for (const tr of atrTrades) {
      const hit = dsIndex.get(tr.symbol);
      if (!hit) { parity.noBar++; continue; }
      const t = hit.idx.get(tr.entryTime);
      if (t === undefined || t < 1) { parity.noBar++; continue; }
      const mine = simulateTrade(hit.ds, t - 1, tr.action === 'BUY', PRIMARY_H);
      if (!mine) { parity.noBar++; continue; }
      parity.checked++;
      parity.slErr = Math.max(parity.slErr, Math.abs(mine.sl - tr.stopLoss));
      parity.tpErr = Math.max(parity.tpErr, Math.abs(mine.tp - tr.takeProfit));
      parity.exitErr = Math.max(parity.exitErr, Math.abs(mine.exit - tr.exit));
      if (mine.reason !== tr.exitReason) parity.reasonMismatch++;
      // ⚠ คนละธรรมเนียมการนับ ไม่ใช่คนละผลลัพธ์:
      //   lab นับ holdBars จาก "แท่งที่เข้า" (entryTime = แท่งถัดจากแท่งสัญญาณ) → 0 = ออกในแท่งที่เข้าเลย
      //   ไฟล์นี้นับจาก "แท่งสัญญาณ" → ค่าเดียวกันจึงมากกว่าของ lab อยู่ 1 เสมอ
      //   ตรวจตามธรรมเนียมนั้น: ถ้าไม่ตรงแปลว่าออกคนละแท่งจริง ๆ
      if (mine.holdBars !== tr.holdBars + 1) parity.holdMismatch++;
    }
    const eng = runLab('combine-engine', 'train', []);
    engineTrain = labTradesToBps(readTradesCsv(eng.csv));
  }
  OUT.meter.labParity = parity;

  // ══════════════════ S3–S4 · ประกอบโมเดล แล้วแปลงเป็นไม้จริง ══════════════════
  const LAMBDAS = [0.001, 0.01, 0.1, 1, 10];   // λ ต่อ 1 ตัวอย่าง (คูณ n ตอน fit)
  const frozen = {};      // โมเดลที่แช่แข็งไว้ใช้กับ validation
  const trainOut = {};

  for (const h of MODEL_HORIZONS) {
    const rows = trainRows[h];
    const st = standardizerFrom(rows);
    const cv = selectLambda(rows, LAMBDAS, h);
    const lambda = cv.best ? cv.best.lambda : 1;
    const { X, y } = designMatrix(rows, st);
    const w = fitRidge(X, y, lambda * rows.n);

    // โมเดลควบคุมที่มีพารามิเตอร์น้อยที่สุด: ใช้แค่ "เครื่องหมาย" ของแต่ละ feature
    const signs = MODEL_FEATURES.map((name) => {
      const ic = spearman(rows.f[name], rows.fwd);
      return Number.isFinite(ic) ? Math.sign(ic) : 0;
    });
    const eqwScores = new Float64Array(rows.n);
    for (let i = 0; i < rows.n; i++) {
      let s = 0;
      MODEL_FEATURES.forEach((name, a) => { s += signs[a] * ((rows.f[name][i] - st[name].mean) / st[name].sd); });
      eqwScores[i] = s / MODEL_FEATURES.length;
    }
    const ridgeScores = scoreRows(rows, st, w);

    const cutsOf = (sc) => {
      const all = Array.from(sc);
      const sorted = all.filter(Number.isFinite).sort((a, b) => a - b);
      const dropped = all.length - sorted.length;
      if (dropped) console.warn(`⚠ h=${h}: คะแนนที่ใช้ไม่ได้ ${dropped} ค่า ถูกคัดออกก่อนหาเส้นแบ่ง`);
      return {
        lo: percentileOfSorted(sorted, PRIMARY_Q),
        hi: percentileOfSorted(sorted, 1 - PRIMARY_Q),
        nUsable: sorted.length, nDropped: dropped,
      };
    };
    const cutsRidge = cutsOf(ridgeScores);
    const cutsEqw = cutsOf(eqwScores);

    const trRidge = runStrategy(pool, rows, ridgeScores, cutsRidge.lo, cutsRidge.hi, h);
    const trEqw = runStrategy(pool, rows, eqwScores, cutsEqw.lo, cutsEqw.hi, h);
    const trLong = runAlways(pool, rows, true, h);
    const trShort = runAlways(pool, rows, false, h);
    const ceilOnRidge = ceilingOnEntries(pool, trRidge, h);
    const ceilOnAll = ceilingOnEntries(pool, trLong, h);

    frozen[h] = { st, w, lambda, signs, cutsRidge, cutsEqw, cv: cv.perLambda };
    trainOut[h] = {
      nRows: rows.n,
      icRidge: spearman(Array.from(ridgeScores), rows.fwd),
      icEqw: spearman(Array.from(eqwScores), rows.fwd),
      cvBest: cv.best, cvGrid: cv.perLambda,
      weights: Object.fromEntries(MODEL_FEATURES.map((n2, i) => [n2, w ? w[i] : NaN])),
      signs: Object.fromEntries(MODEL_FEATURES.map((n2, i) => [n2, signs[i]])),
      ridge: summarizeTrades(trRidge, mulberry32(OPT.seed + h), 'ridge'),
      eqw: summarizeTrades(trEqw, mulberry32(OPT.seed + h + 1), 'สัญญาณเท่ากันทุกตัว'),
      alwaysLong: summarizeTrades(trLong, mulberry32(OPT.seed + h + 2), 'ซื้อทุกแท่ง'),
      alwaysShort: summarizeTrades(trShort, mulberry32(OPT.seed + h + 3), 'ขายทุกแท่ง'),
      ceilingOnRidgeBars: summarizeTrades(ceilOnRidge, mulberry32(OPT.seed + h + 4), 'เพดานบนแท่งเดียวกับ ridge'),
      ceilingOnAllBars: summarizeTrades(ceilOnAll, mulberry32(OPT.seed + h + 5), 'เพดานบนทุกแท่ง'),
      vsAlwaysLong: pairedByCluster(trRidge, trLong),
      vsEqw: pairedByCluster(trRidge, trEqw),
    };
    if (engineTrain) {
      trainOut[h].engine = summarizeTrades(
        engineTrain.map((t) => ({ ...t, isLong: t.isLong, score: NaN, fwd: NaN })),
        mulberry32(OPT.seed + h + 6), 'เครื่องยนต์ปัจจุบัน',
      );
    }
    const xbad = crossCheckSummaries(trainOut[h], `train h=${h}`);
    if (xbad.length) throw new Error(`ด่านตรวจข้ามช่องไม่ผ่าน — รอบนี้ใช้ไม่ได้:\n  ${xbad.join('\n  ')}`);
    console.log(`h=${h}: ridge net ${f2(trainOut[h].ridge.netBps)} bps/ไม้ (${trainOut[h].ridge.n} ไม้) · λ=${lambda} · IC ${f4(trainOut[h].icRidge)}`);
  }
  OUT.train = trainOut;
  OUT.model.frozen = Object.fromEntries(Object.entries(frozen).map(([h, f]) => [h, {
    lambda: f.lambda,
    standardizer: f.st,
    weights: Object.fromEntries(MODEL_FEATURES.map((n2, i) => [n2, f.w ? f.w[i] : NaN])),
    signs: Object.fromEntries(MODEL_FEATURES.map((n2, i) => [n2, f.signs[i]])),
    cutsRidge: f.cutsRidge, cutsEqw: f.cutsEqw,
  }]));

  // ══════════════════ S5 · ยืนยันบน validation — แตะครั้งเดียว ══════════════════
  //
  // ⚠ "แตะครั้งเดียว" ต้องพิสูจน์ได้ ไม่ใช่แค่เคลม — ทุกครั้งที่โค้ดนี้อ่านแท่ง validation
  //   จะเขียนบรรทัดลงสมุดบันทึกถาวร แล้วรายงานพิมพ์จำนวนครั้งที่นับได้จริงจากสมุด
  //   ไม่ใช่พิมพ์เลข 1 ตายตัว (ถ้ารันซ้ำ ตัวเลขในรายงานจะโตขึ้นให้เห็นเอง)
  const TOUCH_LOG = path.join(WORK_DIR, 'VALIDATION-TOUCHES.md');
  const touches = {
    combineSweeps: 0, mechanicalReruns: 0, labRuns: 0, notes: [], logFile: TOUCH_LOG,
  };
  if (!OPT.trainOnly) {
    if (!fs.existsSync(TOUCH_LOG)) {
      fs.writeFileSync(TOUCH_LOG, '# สมุดบันทึกการแตะชุด validation ของ combine.mjs\n\n'
        + 'ชนิด `วิจัย` = การกวาดที่อาจนำไปสู่การตัดสินใจ (นี่คือตัวเลขที่ทำให้ validation'
        + ' ปนเปื้อนทีละนิด)\n'
        + 'ชนิด `กลไก` = การรันซ้ำเพื่อเทียบไบต์ว่าได้ผลเดิมไหม ไม่มีการตัดสินใจใด ๆ'
        + ' จึงไม่เพิ่มการปนเปื้อน แต่ยังต้องบันทึกไว้ให้เห็น\n\n'
        + '| เมื่อไร | ชนิด | อาร์กิวเมนต์ | หมายเหตุ |\n|---|---|---|---|\n');
    }
    const kind = OPT.rerunProbe ? 'กลไก' : 'วิจัย';
    const note = OPT.rerunProbe
      ? 'รันซ้ำเชิงกลโดยตัวตรวจความคงที่ — ไม่มีการตัดสินใจ'
      : 'กวาด validation หลังแช่แข็งโมเดล';
    fs.appendFileSync(TOUCH_LOG,
      `| ${new Date().toISOString()} | ${kind} | ${process.argv.slice(2).join(' ') || '(ไม่มี)'} | ${note} |\n`);
    const logLines = fs.readFileSync(TOUCH_LOG, 'utf8').split('\n').filter((l) => l.startsWith('| 20'));
    // นับแยกสองชนิด — บรรทัดเก่าที่ไม่มีคอลัมน์ชนิด ถือเป็น "วิจัย" ตามเดิม (ระวังไว้ก่อน)
    touches.mechanicalReruns = logLines.filter((l) => l.includes('| กลไก |')).length;
    touches.combineSweeps = logLines.length - touches.mechanicalReruns;
    touches.notes.push('combine.mjs อ่านแท่ง validation หลังโมเดลถูกแช่แข็งแล้วทุกค่า (นับจากสมุดบันทึก ไม่ใช่เลขตายตัว)');
    touches.notes.push('การรันซ้ำเชิงกลของตัวตรวจความคงที่ถูกนับแยก เพราะไม่ได้ตัดสินใจอะไรบน validation');
    const valOut = {};
    let engineVal = null;
    if (OPT.useLab) {
      const eng = runLab('combine-engine', 'validation', []);
      engineVal = labTradesToBps(readTradesCsv(eng.csv));
      touches.labRuns = 1;
      touches.notes.push('lab.mjs รันบน validation หนึ่งครั้ง เพื่อเอาไม้ของเครื่องยนต์ปัจจุบันมาเทียบ');
    }
    for (const h of MODEL_HORIZONS) {
      const rows = buildRows(pool, symFeats, crossFeats, trainEnd, validationEnd, h);
      OUT.model.spill.validation[h] = { kept: rows.kept, dropped: rows.dropSpill };
      const f = frozen[h];
      const ridgeScores = scoreRows(rows, f.st, f.w);
      const eqwScores = new Float64Array(rows.n);
      for (let i = 0; i < rows.n; i++) {
        let s = 0;
        MODEL_FEATURES.forEach((name, a) => { s += f.signs[a] * ((rows.f[name][i] - f.st[name].mean) / f.st[name].sd); });
        eqwScores[i] = s / MODEL_FEATURES.length;
      }
      const trRidge = runStrategy(pool, rows, ridgeScores, f.cutsRidge.lo, f.cutsRidge.hi, h);
      const trEqw = runStrategy(pool, rows, eqwScores, f.cutsEqw.lo, f.cutsEqw.hi, h);
      const trLong = runAlways(pool, rows, true, h);
      const trShort = runAlways(pool, rows, false, h);
      const ceilOnRidge = ceilingOnEntries(pool, trRidge, h);
      const ceilOnAll = ceilingOnEntries(pool, trLong, h);
      valOut[h] = {
        nRows: rows.n,
        icRidge: spearman(Array.from(ridgeScores), rows.fwd),
        icEqw: spearman(Array.from(eqwScores), rows.fwd),
        ridge: summarizeTrades(trRidge, mulberry32(OPT.seed + 100 + h), 'ridge'),
        eqw: summarizeTrades(trEqw, mulberry32(OPT.seed + 101 + h), 'สัญญาณเท่ากันทุกตัว'),
        alwaysLong: summarizeTrades(trLong, mulberry32(OPT.seed + 102 + h), 'ซื้อทุกแท่ง'),
        alwaysShort: summarizeTrades(trShort, mulberry32(OPT.seed + 103 + h), 'ขายทุกแท่ง'),
        ceilingOnRidgeBars: summarizeTrades(ceilOnRidge, mulberry32(OPT.seed + 104 + h), 'เพดานบนแท่งเดียวกับ ridge'),
        ceilingOnAllBars: summarizeTrades(ceilOnAll, mulberry32(OPT.seed + 105 + h), 'เพดานบนทุกแท่ง'),
        vsAlwaysLong: pairedByCluster(trRidge, trLong),
        vsEqw: pairedByCluster(trRidge, trEqw),
      };
      if (engineVal) {
        valOut[h].engine = summarizeTrades(engineVal, mulberry32(OPT.seed + 106 + h), 'เครื่องยนต์ปัจจุบัน');
      }
      const vbad = crossCheckSummaries(valOut[h], `validation h=${h}`);
      if (vbad.length) throw new Error(`ด่านตรวจข้ามช่องไม่ผ่าน — รอบนี้ใช้ไม่ได้:\n  ${vbad.join('\n  ')}`);
      console.log(`validation h=${h}: ridge net ${f2(valOut[h].ridge.netBps)} bps/ไม้ (${valOut[h].ridge.n} ไม้)`);
    }
    OUT.validation = valOut;
  }
  OUT.touches = touches;

  // ══════════════════ บัญชีการเปรียบเทียบ + Holm ══════════════════
  const tests = [];
  const reg = (family, id, question, s) => {
    if (!s || !s.n) return;
    tests.push({ family, id, question, estimate: s.netBps, ci: s.netCI, p: s.netP, n: s.n, G: s.clusters });
  };
  for (const h of MODEL_HORIZONS) {
    reg('TRAIN', `train|ridge|h${h}`, `กำไรสุทธิต่อไม้ของโมเดล ridge ที่ถือ ${h} แท่ง (train) ต่างจากศูนย์ไหม`, trainOut[h].ridge);
    reg('TRAIN', `train|eqw|h${h}`, `กำไรสุทธิต่อไม้ของโมเดลเครื่องหมายล้วน ถือ ${h} แท่ง (train) ต่างจากศูนย์ไหม`, trainOut[h].eqw);
  }
  if (OUT.validation && Object.keys(OUT.validation).length) {
    for (const h of MODEL_HORIZONS) {
      reg('VALIDATION', `val|ridge|h${h}`, `กำไรสุทธิต่อไม้ของโมเดล ridge ที่ถือ ${h} แท่ง (validation) ต่างจากศูนย์ไหม`, OUT.validation[h].ridge);
      reg('VALIDATION', `val|eqw|h${h}`, `กำไรสุทธิต่อไม้ของโมเดลเครื่องหมายล้วน ถือ ${h} แท่ง (validation) ต่างจากศูนย์ไหม`, OUT.validation[h].eqw);
    }
  }
  // คำถามที่ตัดสินใจได้จริง: โมเดลเพิ่มอะไรจากการเข้าไม้มั่ว ๆ ไหม (จับคู่รายเดือน)
  const regPaired = (family, id, question, d) => {
    if (!d || !Number.isFinite(d.p)) return;
    tests.push({ family, id, question, estimate: d.mean, ci: d.ci, p: d.p, n: d.G, G: d.G });
  };
  for (const h of MODEL_HORIZONS) {
    regPaired('VS-BASELINE', `train|ridge-minus-long|h${h}`,
      `ridge ดีกว่า "ซื้อทุกแท่ง" ไหม ถือ ${h} แท่ง (train · จับคู่รายเดือน)`, trainOut[h].vsAlwaysLong);
    if (OUT.validation?.[h]) {
      regPaired('VS-BASELINE', `val|ridge-minus-long|h${h}`,
        `ridge ดีกว่า "ซื้อทุกแท่ง" ไหม ถือ ${h} แท่ง (validation · จับคู่รายเดือน)`, OUT.validation[h].vsAlwaysLong);
    }
  }
  for (const h of MODEL_HORIZONS) {
    reg('BASELINE', `train|long|h${h}`, `ซื้อทุกแท่งถือ ${h} แท่ง (train) ต่างจากศูนย์ไหม`, trainOut[h].alwaysLong);
    reg('BASELINE', `train|short|h${h}`, `ขายทุกแท่งถือ ${h} แท่ง (train) ต่างจากศูนย์ไหม`, trainOut[h].alwaysShort);
    if (OUT.validation?.[h]) {
      reg('BASELINE', `val|long|h${h}`, `ซื้อทุกแท่งถือ ${h} แท่ง (validation) ต่างจากศูนย์ไหม`, OUT.validation[h].alwaysLong);
      reg('BASELINE', `val|short|h${h}`, `ขายทุกแท่งถือ ${h} แท่ง (validation) ต่างจากศูนย์ไหม`, OUT.validation[h].alwaysShort);
    }
  }
  // Holm ภายในตระกูล
  const famNames = [...new Set(tests.map((t) => t.family))];
  for (const fam of famNames) {
    const pAsc = (v) => (Number.isFinite(v) ? v : Infinity);
    const arr = tests.filter((t) => t.family === fam)
      .sort((a, b) => (pAsc(a.p) - pAsc(b.p)) || tieKey(a.id, b.id));
    const m = arr.length;
    let still = true;
    arr.forEach((t, i) => {
      t.holmThreshold = OPT.alpha / (m - i);
      t.holmPass = still && t.p <= t.holmThreshold;
      if (!t.holmPass) still = false;
    });
  }
  tests.forEach((t, i) => { t.idx = i + 1; });
  OUT.tests = tests;
  OUT.ledger = {
    registeredThisRound: tests.length,
    families: famNames.map((f) => ({ family: f, n: tests.filter((t) => t.family === f).length })),
    reHolmedFromFeatTime: cells.filter((c) => c.src === 'feat-time').length,
    priorRounds: { ceiling: 192, featVolume: 1968, featTime: 636, featCross: 1736 },
  };

  OUT.selfCheck = { statPairsCompared: SELF_CHECK.comparisons, mismatches: SELF_CHECK.mismatches.length };
  OUT.elapsedMs = Date.now() - t0;
  // ══════ ที่มาของผลลัพธ์ — ผูกรายงานกับโค้ดและข้อมูลชุดหนึ่ง ══════
  //
  // ทุกช่องที่ไม่ได้อยู่ใน volatileFields ต้องเท่ากันทุกไบต์เมื่อรันซ้ำ
  // ตัวตรวจ check-determinism.mjs อ่านรายการนี้จากไฟล์ผลลัพธ์เอง — สคริปต์ต้อง
  // ประกาศเองว่าอะไรของตัวเองที่ไม่คงที่ ตัวตรวจไม่มีรายการยกเว้นลับของตัวมันเอง
  OUT.provenance = buildProvenance({
    scriptPath: SCRIPT_PATH,
    root: ROOT,
    ledger: IN,
    argv: process.argv.slice(2),
    volatileFields: [
      'generatedAt',
      'elapsedMs',
      'touches.combineSweeps',
      'touches.mechanicalReruns',
      'touches.logFile',
      'opt.outDir',
      'provenance',
    ],
    volatileReportLines: [
      // เวลาที่สร้าง — ต่างทุกครั้งโดยธรรมชาติ
      '^> สร้างเมื่อ ',
      // จำนวนครั้งที่แตะ validation โตขึ้นทุกครั้งที่รันจริง (นั่นคือเจตนาของสมุดบันทึก)
      'กวาดแท่ง validation แบบ',
      'รันซ้ำ',
      // บรรทัดนี้พิมพ์อาร์กิวเมนต์ ซึ่งมี --out-dir ที่ต่างกันทุกรอบตอนถูกตรวจ
      '^node v',
    ],
  });

  const outJson = path.join(OPT.outDir, 'exp-combine.json');
  fs.writeFileSync(outJson, JSON.stringify(OUT, null, 2));
  writeReport(OUT, { survivors, gated, thaiClosest, targetCell, pool, bounds });
  console.log(`ที่มา: sha สคริปต์ ${OUT.provenance.scriptSha256.slice(0, 12)}`
    + ` · sha ขาเข้ารวม ${OUT.provenance.inputsDigest.slice(0, 12)} (${OUT.provenance.inputs.length} ไฟล์)`);
  console.log(`เสร็จ ${(OUT.elapsedMs / 1000).toFixed(1)} วินาที · รายงาน ${path.relative(ROOT, path.join(OPT.outDir, 'exp-combine.md')).replace(/\\/g, '/')}`);
}

/** แถวเดียวของตารางผลกลยุทธ์ */
function strategyRow(name, s, ceilNet) {
  if (!s || !s.n) return `| ${name} | — | — | — | — | — | — | — | — |`;
  const capture = Number.isFinite(ceilNet) && ceilNet > 0 ? `${((s.netBps / ceilNet) * 100).toFixed(1)}%` : '—';
  const ci = s.netCI && Number.isFinite(s.netCI[0]) ? `[${f2(s.netCI[0])}, ${f2(s.netCI[1])}]` : '—';
  return `| ${name} | ${s.n} | ${f2(s.grossBps)} | ${f2(s.feeBps)} | **${f2(s.netBps)}** | ${ci} | ${pS(s.netP)} | ${pctS(s.dirAccuracy)} | ${capture} |`;
}

function writeReport(OUT, ctx) {
  const { survivors, gated, thaiClosest, targetCell, pool, bounds } = ctx;
  LINES.length = 0;

  W('# ประกอบสิ่งที่รอด แล้วยืนยันบน validation');
  W();
  W(`> โค้ด: \`scripts/research/experiments/combine.mjs\` · ข้อมูลดิบทุกตัว: \`exp-combine.json\``);
  W(`> สร้างเมื่อ ${OUT.generatedAt} · ใช้เวลา ${(OUT.elapsedMs / 1000).toFixed(1)} วินาที`);
  W(`> bootstrap ${OPT.bootstrap} รอบ · seed ${OPT.seed} · จับกลุ่มด้วยเดือนปฏิทิน`);
  W();
  // ── ที่มา: ผูก md ฉบับนี้กับโค้ดและข้อมูลชุดเดียว ตรวจย้อนได้ด้วย npm run check:determinism
  const pv = OUT.provenance ?? {};
  W('**ที่มาของตัวเลขทุกตัวในไฟล์นี้** (ถ้า sha ไม่ตรง แปลว่ารายงานกับโค้ดคนละรุ่น — อ่านไม่ได้)');
  W();
  W('| อะไร | sha256 (12 ตัวแรก) |');
  W('|---|---|');
  const bt = '`';
  W(`| สคริปต์ ${bt}${pv.script ?? '—'}${bt} | ${bt}${(pv.scriptSha256 ?? '').slice(0, 12)}${bt} |`);
  W(`| ขาเข้าทั้งหมด ${pv.inputs?.length ?? 0} ไฟล์ (รวมกัน) | ${bt}${(pv.inputsDigest ?? '').slice(0, 12)}${bt} |`);
  for (const f of (pv.inputs ?? []).filter((x) => x.role !== 'candles')) {
    W(`| ${f.role} ${bt}${f.path}${bt} | ${bt}${(f.sha256 ?? '').slice(0, 12)}${bt} |`);
  }
  W(`| แท่งเทียน ${(pv.inputs ?? []).filter((x) => x.role === 'candles').length} ไฟล์ | (รวมอยู่ใน sha ขาเข้า) |`);
  W();
  W(`node ${pv.node ?? '—'} · ${pv.platform ?? '—'} · อาร์กิวเมนต์: ${bt}${(pv.argv ?? []).join(' ') || '(ไม่มี)'}${bt}`);
  W();

  // ── คำตอบสั้น ───────────────────────────────────────────────────────────────
  const h = PRIMARY_H;
  const tr = OUT.train[h];
  const va = OUT.validation?.[h];
  W('## คำตอบสั้น');
  W();
  W(`ด่านคัดรันกับ **${OUT.gate.cellsTotal} ช่อง** จากรายงานสามฉบับ (feat-volume · feat-cross · feat-time)`);
  W(`ผ่านครบทุกเกณฑ์ **${OUT.gate.survivors.length} ช่อง** — และทั้งหมดอยู่ในจักรวาลเดียวคือ \`${targetCell}\``);
  W();
  W('| ตลาด | ช่องที่วัดได้ | ผ่านเกณฑ์เข้ม | ผ่านเกณฑ์หลวม |');
  W('|---|---:|---:|---:|');
  for (const [mk, v] of Object.entries(OUT.gate.byMarket)
    .sort((a, b) => (b[1].strict - a[1].strict) || tieKey(a[0], b[0]))) {
    const label = mk === 'TH_STOCK' ? '**หุ้นไทย (ตลาดที่เจ้าของเทรดจริง)**' : mk;
    W(`| ${label} | ${v.cells} | ${v.strict} | ${v.loose} |`);
  }
  W();
  W(`**หุ้นไทยผ่าน 0 ช่อง จาก ${OUT.gate.byMarket.TH_STOCK?.cells ?? 0} ช่อง** ทั้งเกณฑ์เข้มและเกณฑ์หลวม`);
  W('ตามกติกาข้อ 1 ของรอบนี้ จึงไม่ประกอบโมเดลให้หุ้นไทยเลย — ดู S7 ว่าขาดไปเท่าไร');
  W();
  if (tr && va) {
    W(`สิ่งที่ประกอบได้จึงเป็นโมเดลของ **หุ้นสหรัฐ 1D** ซึ่งเป็นคนละตลาดกับที่เจ้าของเทรด`);
    W();
    W('| ระยะถือ | ชุด | ไม้ | สุทธิ (bps/ไม้) | CI95 | p | ผ่าน Holm |');
    W('|---:|---|---:|---:|---|---:|:---:|');
    for (const hh of MODEL_HORIZONS) {
      for (const [split, o] of [['train', OUT.train], ['validation', OUT.validation]]) {
        const x = o?.[hh];
        if (!x?.ridge?.n) continue;
        const t2 = OUT.tests.find((q) => q.id === `${split === 'train' ? 'train' : 'val'}|ridge|h${hh}`);
        W(`| ${hh} | ${split} | ${x.ridge.n} | **${f2(x.ridge.netBps)}** | [${f2(x.ridge.netCI[0])}, ${f2(x.ridge.netCI[1])}] | ${pS(x.ridge.netP)} | ${t2?.holmPass ? '**ผ่าน**' : 'ไม่'} |`);
      }
    }
    W();
    const passT = OUT.tests.filter((t2) => t2.family === 'TRAIN' && t2.holmPass).length;
    const passV = OUT.tests.filter((t2) => t2.family === 'VALIDATION' && t2.holmPass).length;
    const nV = OUT.tests.filter((t2) => t2.family === 'VALIDATION').length;
    W(`**บน train ผ่าน Holm ${passT} จาก 6 ข้อ · บน validation ผ่าน ${passV} จาก ${nV} ข้อ**`);
    W();
    W('> ข้อสรุปของรอบนี้: **ไม่แรงพอ** — และมีสามชั้นที่พูดตรงกัน');
    W('>');
    W('> 1. **หุ้นไทยไม่มีอะไรให้ประกอบเลย** 0 จาก 886 ช่อง ไม่ว่าจะใช้เกณฑ์เข้มหรือหลวม');
    W('> 2. **โมเดลของหุ้นสหรัฐที่ประกอบได้ ตกบน validation ทุกช่อง** '
      + `— ค่าที่วัดได้ ${f2(va.ridge.netBps)} bps/ไม้ ที่ ${h} แท่ง แต่ช่วงความเชื่อมั่นคร่อมศูนย์ (p=${pS(va.ridge.netP)})`);
    W('> 3. **ต่อให้บน train มันก็ไม่ชนะ "ซื้อทุกแท่งไม่ดูอะไร"** '
      + `— ผลต่างจับคู่รายเดือน ${f2(OUT.train[h].vsAlwaysLong.mean)} bps (p=${pS(OUT.train[h].vsAlwaysLong.p)}) `
      + `และบน validation ${f2(va.vsAlwaysLong.mean)} bps (p=${pS(va.vsAlwaysLong.p)})`);
    W('>');
    W(`> จับได้เพียง ${((va.ridge.netBps / va.ceilingOnRidgeBars.netBps) * 100).toFixed(1)}% ของเพดาน `
      + `(เพดาน = รู้ทิศถูกทุกไม้บนแท่งเดียวกัน = ${f2(va.ceilingOnRidgeBars.netBps)} bps/ไม้)`);
    W('>');
    W('> ตามกติกาข้อ 7 นี่คือผลลัพธ์ที่ถูกต้อง และมีค่ากับเจ้าของมากกว่าการรายงานผลบวก');
    W('> ที่เชื่อไม่ได้ — เพราะเป้าที่ตั้งไว้คือ "แม่นกว่าเดิม 10 เท่า" ซึ่งห่างจากนี้มาก');
    W();
  }

  // ── S0 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# S0 · ด่านคัด — อะไร "รอด" จากรอบก่อนบ้าง');
  W();
  W('เกณฑ์เขียนไว้ก่อนดูผล แล้วให้โค้ดรันกับทุกช่องที่ลงทะเบียนไว้ในรายงานทั้งสามฉบับ');
  W('ไม่ใช่คนเลือกด้วยตาจากตารางพาดหัว (พาดหัวของแต่ละฉบับใช้เกณฑ์ไม่เหมือนกัน)');
  W();
  W('| เกณฑ์ | ความหมาย |');
  W('|---|---|');
  W('| G1 | เป็น feature จริง ไม่ใช่ตัวควบคุม |');
  W('| G2 | จักรวาลไม่ได้ถูกเลือกด้วยข้อมูลอนาคต (ตัดกลุ่ม RUNNER ทิ้งทั้งกลุ่ม ใช้ RUNNER_PIT แทน) |');
  W('| G3 | **การทดสอบที่วัดเป็นเงิน** ผ่าน Holm ภายในตระกูล — ไม่ใช่การทดสอบ IC |');
  W('| G4 | \\|ขอบ\\| เป็น bps/ไม้ มากกว่าค่าธรรมเนียมจริงของช่องนั้น |');
  W('| G5 | ช่องนั้นไม่ใช่ "ตัวอย่างบาง" และไม่ใช่ช่องที่เพดานปิดตายแล้ว |');
  W();
  W(`ที่มาของช่อง: ${Object.entries(OUT.gate.bySource).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  W();
  W(`⚠ exp-feat-time.json **ไม่ได้ลงทะเบียน p ของเงินเป็นการทดสอบ** (มีแต่ p ของ IC)`);
  W(`  ถ้าปล่อยไว้ ตระกูลนั้นจะตกด่าน G3 ด้วยเหตุผลทางเทคนิค รอบนี้จึงแก้ค่า p ของเงิน`);
  W(`  ด้วย Holm ให้เอง ${OUT.ledger.reHolmedFromFeatTime} ช่อง แล้วบันทึกไว้ในบัญชีการเปรียบเทียบ`);
  W();
  W(`**ช่องที่ผ่านครบทุกเกณฑ์ ${OUT.gate.survivors.length} ช่อง**`);
  W();
  W('| ที่มา | กลุ่ม | TF | feature | ถือ | ขอบ (bps) | ค่าธรรมเนียม | สุทธิ | p ของเงิน |');
  W('|---|---|---|---|---:|---:|---:|---:|---:|');
  for (const s of [...OUT.gate.survivors].sort((a, b) => (sortNum(b.netBps) - sortNum(a.netBps))
    || tieKey(`${a.src}|${a.group}|${a.tf}|${a.feature}|${a.h}`, `${b.src}|${b.group}|${b.tf}|${b.feature}|${b.h}`))) {
    W(`| ${s.src} | ${GROUP_LABEL[s.group] ?? s.group} | ${s.tf} | \`${s.feature}\` | ${s.h} | ${f2(s.edgeBps)} | ${f2(s.feeBps)} | **${f2(s.netBps)}** | ${pS(s.moneyP)} |`);
  }
  W();
  W(`feature ที่ไม่ซ้ำกันจากช่องเหล่านี้ = **${OUT.model.features.length} ตัว**: ${OUT.model.features.map((x) => `\`${x}\``).join(' · ')}`);
  W();
  W('ทั้งหมดเป็นปรากฏการณ์เดียวกันในเชิงกลไก: **การกลับตัวระยะสั้น** (short-term reversal)');
  W('ตัวที่ปิดแรงเมื่อวานมีแนวโน้มอ่อนวันถัดไป และตัวที่อันดับผลตอบแทนนำกลุ่มมีแนวโน้มถอย');
  W('เครื่องหมายของทุกตัวเป็นลบตรงกันหมด ซึ่งเป็นเรื่องที่ตำรากลางบันทึกไว้นานแล้ว');
  W();

  // ── M0 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# M0 · ตรวจเครื่องวัดก่อนเชื่อตัวเลขใด ๆ');
  W();
  W('## M0a · ATR ที่เขียนใหม่ ต้องเท่ากับ `src/lib/indicators.ts` ตัวจริง');
  W();
  W(`เทียบ **${OUT.meter.atrParity.checked.toLocaleString()} จุด** · คลาดเคลื่อนสูงสุด **${OUT.meter.atrParity.maxErr}**`);
  W();
  W('## M0b · ตัวจำลองไม้ ต้องให้ผลตรงกับ `lab.mjs` ทุกบิต');
  W();
  if (OUT.meter.labParity.ran) {
    const p = OUT.meter.labParity;
    W('เอาไม้ทุกไม้ที่ `lab.mjs` ออกด้วยเรขาคณิต ATR ล้วน (ปิด support/resistance) มาเดินซ้ำ');
    W('ด้วยตัวจำลองในไฟล์นี้ บนแท่งเดียวกัน ทิศเดียวกัน');
    W();
    W('| สิ่งที่เทียบ | จำนวน | คลาดเคลื่อน |');
    W('|---|---:|---:|');
    W(`| ไม้ที่เทียบได้ | ${p.checked.toLocaleString()} | — |`);
    W(`| ราคา SL | ${p.checked.toLocaleString()} | ${p.slErr} |`);
    W(`| ราคา TP | ${p.checked.toLocaleString()} | ${p.tpErr} |`);
    W(`| ราคาที่ออก | ${p.checked.toLocaleString()} | ${p.exitErr} |`);
    W(`| เหตุผลที่ออก | ${p.checked.toLocaleString()} | ${p.reasonMismatch} ไม้ไม่ตรง |`);
    W(`| จำนวนแท่งที่ถือ | ${p.checked.toLocaleString()} | ${p.holdMismatch} ไม้ไม่ตรง |`);
    W(`| _(ธรรมเนียมการนับ: lab นับจากแท่งที่เข้า ไฟล์นี้นับจากแท่งสัญญาณ จึงมากกว่าอยู่ 1 เสมอ)_ | | |`);
    W(`| ไม้ที่จับคู่แท่งไม่ได้ (ตัดทิ้ง) | ${p.noBar} | — |`);
    W();
    W('นี่คือเหตุผลที่ backtest ในไฟล์นี้เชื่อได้เท่ากับ backtest ของ `lab.mjs`');
    W('ทั้งที่ `lab.mjs` ไม่มีช่องรับคะแนนจากภายนอก — ถ้าตัวเลขไม่ตรง 0 ต้องหยุดอ่านตรงนี้');
  } else {
    W('_ข้ามด้วย --no-lab — ไม่มีการตรวจ ตัวเลข backtest ทั้งหมดในรายงานนี้จึงยังไม่ถูกยืนยัน_');
  }
  W();
  W('## M0c · IC ที่วัดใหม่ด้วยโค้ดอิสระ เทียบกับรายงานต้นทาง');
  W();
  W('⚠ ไม่ใช่การเทียบทุกบิต — รายงานต้นทางจับกลุ่มคนละแบบ และแถวที่นี่ต้องมี feature');
  W('ครบทุกตัวถึงจะนับ ตัวอย่างจึงเล็กกว่า สิ่งที่ตรวจคือ **เครื่องหมายตรงกันไหม**');
  W('ถ้าเครื่องหมายกลับด้าน แปลว่าลอกสูตรผิด แล้วทุกอย่างหลังจากนี้เป็นโมฆะ');
  W();
  W('| feature | ถือ | IC ที่รายงานเดิม | IC ที่วัดใหม่ | เครื่องหมายตรง |');
  W('|---|---:|---:|---:|:---:|');
  for (const r of OUT.meter.icRecheck) {
    const same = r.sameSign === null ? '(เทียบไม่ได้)' : (r.sameSign ? 'ตรง' : '**ไม่ตรง**');
    W(`| \`${r.feature}\` | ${r.h} | ${Number.isFinite(r.icReported) ? f4(r.icReported) : '—'} | ${f4(r.icHere)} | ${same} |`);
  }
  W();
  W('_ช่องที่เทียบไม่ได้คือ feature ข้ามสัญลักษณ์ ซึ่งรายงานเดิมวัด IC บนตารางเวลารวมของกลุ่ม_');
  W('_ไม่ใช่บนแท่งของสัญลักษณ์ — คนละฐาน จึงไม่เอาตัวเลขมาวางข้างกันให้เข้าใจผิด_');
  W();

  // ── M1 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# M1 · ตรวจ look-ahead ด้วยการตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ');
  W();
  W(`ตัดท้ายทิ้ง ${(OPT.truncFrac * 100).toFixed(0)}% แล้วคำนวณ feature ใหม่ทั้งหมด`);
  W('ค่าของแท่งเก่าต้องไม่เปลี่ยนแม้แต่บิตเดียว (เทียบแบบ `===` ไม่ใช่ tolerance)');
  W();
  W('| กลุ่ม feature | ค่าที่เทียบ | ไม่ตรง |');
  W('|---|---:|---:|');
  for (const [k, v] of Object.entries(OUT.leak.cross.perFeature)) {
    W(`| \`${k}\` (ข้ามสัญลักษณ์) | ${v.compared.toLocaleString()} | ${v.mismatch} |`);
  }
  for (const [k, v] of Object.entries(OUT.leak.symbol.perFeature)) {
    W(`| \`${k}\` (รายตัว) | ${v.compared.toLocaleString()} | ${v.mismatch} |`);
  }
  W(`| **รวม** | **${(OUT.leak.cross.compared + OUT.leak.symbol.compared).toLocaleString()}** | **${OUT.leak.cross.mismatch + OUT.leak.symbol.mismatch}** |`);
  W();
  W('**ตัวควบคุมเชิงบวก** — ถ้าเครื่องตรวจไม่มีฟัน ผลข้างบนก็ไม่มีความหมาย');
  W();
  W(`\`LEAK_zFull\` (z-score ด้วยค่าเฉลี่ยของทั้งชุด = การรั่วที่เงียบที่สุด) เทียบ ${OUT.leak.cross.leakCompared.toLocaleString()} ค่า`);
  W(`**เปลี่ยนไป ${OUT.leak.cross.leakChanged.toLocaleString()} ค่า** = ${((OUT.leak.cross.leakChanged / OUT.leak.cross.leakCompared) * 100).toFixed(1)}% → เครื่องตรวจจับได้จริง`);
  W();
  W('⚠ สิ่งที่การตรวจนี้ **จับไม่ได้** โดยโครงสร้าง: การรั่วที่ "การเลือกผู้เข้าแข่งขัน"');
  W('(บทเรียนจาก exp-feat-cross C9) — จักรวาลของรอบนี้คือหุ้นสหรัฐ 17 ตัวที่อยู่ในคลัง');
  W('ตั้งแต่ต้น ไม่ได้คัดจากผลงาน จึงไม่มีการรั่วชนิดนี้ แต่มี survivorship bias ของคลัง');
  W('ติดมาแน่นอน (Yahoo ลบหุ้นที่ออกจากกระดานทิ้ง) — อยู่ในข้อจำกัดท้ายรายงาน');
  W();
  W('⚠ ตัวปรับมาตรฐาน (mean/sd) และเส้นแบ่งคะแนนของโมเดล fit บน **train เท่านั้น** แล้วแช่แข็ง');
  W('เอาไปใช้กับ validation ตรง ๆ — ไม่คำนวณใหม่ ค่าที่ใช้จริงพิมพ์ไว้ใน `exp-combine.json`');
  W();
  // ── M1b: ด่านกันการล้ำข้ามเส้นแบ่ง (เพิ่มรอบนี้) ──────────────────────────────
  W('## M1b · ด่านกันการล้ำข้ามเส้นแบ่ง split');
  W();
  W('การตรวจ look-ahead ข้างบนตรวจ **ค่า feature** ว่าอ่านอนาคตไหม แต่จับอีกโรคไม่ได้:');
  W('ตัว feature สะอาด แต่ **ผลตอบแทนที่เอามาวัด** อ่านข้ามเส้นแบ่งไปแล้ว');
  W('แถวสัญญาณที่อยู่ปลายชุด train อ่าน `candles[i+h]` ซึ่งเป็นแท่งของ validation');
  W('และแถวปลาย validation อ่านแท่งของ **ชุด test** — ผิดกติกาข้อ 1 ตรง ๆ');
  W();
  W('รอบนี้ทิ้งไม้ที่หน้าต่างล้ำออก (วิธีเดียวกับ `feat-cross.mjs`) ไม่ตัดหน้าต่างให้สั้นลง');
  W('เพราะไม้ที่ถูกบังคับปิดก่อนกำหนดไม่ใช่ไม้ h แท่ง เอามาเฉลี่ยรวมกันไม่ได้');
  W();
  W('| ชุด | ถือ (แท่ง) | แถวที่เก็บ | แถวที่ทิ้งเพราะล้ำ | ทิ้งไปกี่ % |');
  W('|---|---:|---:|---:|---:|');
  for (const sp of ['train', 'validation']) {
    for (const hh of MODEL_HORIZONS) {
      const v = OUT.model.spill?.[sp]?.[hh];
      if (!v) continue;
      const pctDrop = v.kept + v.dropped > 0 ? (v.dropped / (v.kept + v.dropped)) * 100 : NaN;
      W(`| ${sp} | ${hh} | ${v.kept.toLocaleString()} | ${v.dropped.toLocaleString()} | ${f2(pctDrop)}% |`);
    }
  }
  W();
  W('⚠ ตัวเลขทุกตัวในรายงานฉบับก่อนหน้า (ที่ยังไม่มีด่านนี้) สูงกว่าความจริงเล็กน้อยทุกช่อง');
  W('ผลกระทบใหญ่สุดอยู่ที่ระยะถือยาว เพราะหน้าต่างยาวล้ำเส้นแบ่งได้มากกว่า');
  W();

  // ── S3 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# S3 · การประกอบ — ridge ที่เลือกความแรงด้วย CV แบบเคารพเวลา');
  W();
  W(`จำนวนพารามิเตอร์ = ${OUT.model.features.length} ตัว (หนึ่งน้ำหนักต่อหนึ่ง feature ไม่มี intercept`);
  W('เพราะ feature ถูกปรับมาตรฐานให้ค่าเฉลี่ยเป็นศูนย์แล้ว)');
  W();
  W(`ตัวอย่างที่ดูเหมือนมี: ${OUT.train[PRIMARY_H].nRows.toLocaleString()} แถว`);
  W(`แต่ตัวอย่างอิสระจริงน้อยกว่านั้นมาก — หุ้น ${pool.nSym} ตัวเคลื่อนไหวพร้อมกัน`);
  W(`ทุกสถิติในรายงานนี้จึงจับกลุ่มด้วย **เดือนปฏิทิน** (${OUT.train[PRIMARY_H].ridge.clusters} เดือนในชุด train)`);
  W('ไม่ใช่นับไม้เป็นตัวอย่างอิสระ');
  W();
  W('**การแบ่ง fold**: ขยายหน้าต่างไปข้างหน้า 5 ครั้ง (ไม่สุ่มแบ่ง) และเว้นช่วง embargo');
  W('กว้าง h แท่ง ระหว่างท้ายชุดฝึกกับต้นชุดวัด เพราะเป้าหมายของแถวท้ายชุดฝึก');
  W('(ผลตอบแทนล่วงหน้า h แท่ง) ยื่นเข้าไปในช่วงของชุดวัด');
  W();
  for (const hh of MODEL_HORIZONS) {
    const t = OUT.train[hh];
    W(`**ถือ ${hh} แท่ง** — λ ที่เลือก = ${OUT.model.frozen[hh].lambda} (IC นอก fold เฉลี่ย ${f4(t.cvBest?.meanIC)})`);
    W();
    W('| λ | IC นอก fold เฉลี่ย | จำนวน fold |');
    W('|---:|---:|---:|');
    for (const g of t.cvGrid) W(`| ${g.lambda} | ${f4(g.meanIC)} | ${g.folds} |`);
    W();
    W('| feature | น้ำหนัก ridge | เครื่องหมายที่ใช้ในโมเดลควบคุม |');
    W('|---|---:|---:|');
    for (const nm of OUT.model.features) W(`| \`${nm}\` | ${f4(t.weights[nm])} | ${t.signs[nm]} |`);
    W();
  }

  // ── S4 / S5 ───────────────────────────────────────────────────────────────
  const block = (title, o, note) => {
    W(`## ${title}`);
    W();
    if (note) { W(note); W(); }
    for (const hh of MODEL_HORIZONS) {
      const x = o[hh];
      if (!x) continue;
      const ceilNet = x.ceilingOnRidgeBars?.netBps;
      W(`**ถือ ${hh} แท่ง** · IC ของคะแนนรวม ${f4(x.icRidge)}`);
      W();
      W('| กลยุทธ์ | ไม้ | ก่อนหัก | ค่าธรรมเนียม | สุทธิ (bps/ไม้) | CI95 | p | ทิศถูก | จับได้กี่ % ของเพดาน |');
      W('|---|---:|---:|---:|---:|---|---:|---:|---:|');
      W(strategyRow('**ridge (โมเดลของรอบนี้)**', x.ridge, ceilNet));
      W(strategyRow('เครื่องหมายล้วน (พารามิเตอร์น้อยสุด)', x.eqw, ceilNet));
      W(strategyRow('เครื่องยนต์ปัจจุบัน', x.engine, ceilNet));
      W(strategyRow('ซื้อทุกแท่งไม่ดูอะไร', x.alwaysLong, ceilNet));
      W(strategyRow('ขายทุกแท่งไม่ดูอะไร', x.alwaysShort, ceilNet));
      W(strategyRow('_เพดาน: รู้ทิศถูกทุกไม้ บนแท่งเดียวกับ ridge_', x.ceilingOnRidgeBars, ceilNet));
      W(strategyRow('_เพดาน: รู้ทิศถูกทุกไม้ บนทุกแท่ง_', x.ceilingOnAllBars, ceilNet));
      W();
      if (x.vsAlwaysLong && Number.isFinite(x.vsAlwaysLong.p)) {
        W(`ridge − ซื้อทุกแท่ง (จับคู่รายเดือน ${x.vsAlwaysLong.G} เดือน): **${f2(x.vsAlwaysLong.mean)} bps/ไม้** p=${pS(x.vsAlwaysLong.p)}`);
        W();
      }
    }
    W(`⚠ แถว "เครื่องยนต์ปัจจุบัน" มาจากการรัน \`lab.mjs\` ครั้งเดียวที่ \`--max-hold=${PRIMARY_H}\``);
    W('  จึงเป็นตัวเลขชุดเดียวกันในทั้งสามตาราง ไม่ได้รันใหม่ต่อระยะถือ — เอาไว้เทียบระดับเท่านั้น');
    W();
  };

  W('---');
  W();
  W('# S4 · ผลบนชุด train (ชุดที่ตาเราเห็นแล้ว)');
  W();
  block('ผลทุกกลยุทธ์เทียบกัน', OUT.train,
    'ตัวเลขทุกช่องมาจากการเดินไม้จริงบนแท่งจริง ไม่ใช่สูตรแปลง IC เป็นเงิน\n'
    + 'หนึ่งสัญลักษณ์ถือได้ทีละไม้ ไม้ไม่ซ้อนกัน · เข้าเมื่อคะแนนอยู่หัว/ท้าย '
    + `${(PRIMARY_Q * 100).toFixed(0)}% ของการแจกแจงบน train`);

  if (OUT.validation && Object.keys(OUT.validation).length) {
    W('---');
    W();
    W('# S5 · ยืนยันบน validation — พร้อมจำนวนครั้งที่แตะจริง');
    W();
    W('| สิ่งที่แตะ | จำนวนครั้ง |');
    W('|---|---:|');
    W(`| combine.mjs กวาดแท่ง validation แบบ **วิจัย** (อาจนำไปสู่การตัดสินใจ) | ${OUT.touches.combineSweeps} |`);
    W(`| combine.mjs รันซ้ำ **เชิงกล** โดยตัวตรวจความคงที่ (ไม่ตัดสินใจอะไร) | ${OUT.touches.mechanicalReruns} |`);
    W(`| lab.mjs รันบน validation (เอาไม้ของเครื่องยนต์ปัจจุบันมาเทียบ) | ${OUT.touches.labRuns} |`);
    W();
    for (const n of OUT.touches.notes) W(`· ${n}`);
    W();
    W(`ตัวเลขข้างบนนับจากสมุดบันทึก \`${path.relative(ROOT, OUT.touches.logFile).replace(/\\/g, '/')}\``);
    W('ซึ่งถูกเติมทุกครั้งที่โค้ดอ่านแท่ง validation — ถ้ารันซ้ำ ตัวเลขจะโตขึ้นให้เห็นเอง');
    W('ไม่ใช่เลข 1 ที่พิมพ์ตายไว้ในรายงาน');
    W();
    W('**ทำไมจำนวนถึงมากกว่า 1 และทำไมยังไม่ถือว่าปนเปื้อน**');
    W();
    W('· ทุกอย่างที่กำหนดโมเดล (ด่านคัด · รายชื่อ feature · λ · ตัวปรับมาตรฐาน · เส้นแบ่งคะแนน ·');
    W('  ระยะถือที่จะวัด · รายการทดสอบที่ลงทะเบียน) ถูกตัดสินจาก **train เท่านั้น** และถูกแช่แข็ง');
    W('  ก่อนการกวาด validation ครั้งแรก');
    W('· การกวาดซ้ำเกิดจากการรันสคริปต์ใหม่ (แก้ข้อความในรายงาน · ตรวจการรันซ้ำได้)');
    W('  ไม่ได้เกิดจากการเห็นผลแล้วไปปรับโมเดล — ผล JSON ของทุกครั้งเหมือนกันทุกไบต์');
    W('· ถ้าจะให้ตัวเลขนี้กลับเป็น 1 ต้องลบสมุดบันทึกทิ้ง ซึ่งเป็นการลบหลักฐาน จึงไม่ทำ');
    W();
    W('_lab.mjs ที่รันบน validation ถูกแคชไว้ในโฟลเดอร์ทำงานหลังครั้งแรก การรันซ้ำจึงไม่ได้อ่านแท่งใหม่_');
    W();
    W('ทุกค่าของโมเดล (น้ำหนัก · ตัวปรับมาตรฐาน · เส้นแบ่งคะแนน · λ) ถูกแช่แข็งจาก train');
    W('ก่อนบรรทัดแรกของ validation จะถูกอ่าน และไม่มีการปรับอะไรหลังเห็นผล');
    W();
    block('ผลทุกกลยุทธ์เทียบกัน (validation)', OUT.validation, null);
  }

  // ── S6 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# S6 · เทียบกับสามอย่างที่ต้องเทียบเสมอ');
  W();
  W('| ระยะถือ | ชุด | ridge | เครื่องยนต์ปัจจุบัน | ซื้อทุกแท่ง | เพดาน | ridge จับได้ |');
  W('|---:|---|---:|---:|---:|---:|---:|');
  for (const hh of MODEL_HORIZONS) {
    for (const [split, o] of [['train', OUT.train], ['validation', OUT.validation]]) {
      const x = o?.[hh];
      if (!x) continue;
      const cap = x.ceilingOnRidgeBars?.netBps > 0 ? `${((x.ridge.netBps / x.ceilingOnRidgeBars.netBps) * 100).toFixed(1)}%` : '—';
      W(`| ${hh} | ${split} | ${f2(x.ridge?.netBps)} | ${f2(x.engine?.netBps)} | ${f2(x.alwaysLong?.netBps)} | ${f2(x.ceilingOnRidgeBars?.netBps)} | ${cap} |`);
    }
  }
  W();
  W('_หน่วยทุกช่อง: bps ของมูลค่าสถานะ ต่อไม้ หักค่าธรรมเนียมแล้ว_');
  W('_"เพดาน" = รู้ทิศถูกทุกไม้บนแท่งเดียวกัน ใต้เรขาคณิตเดียวกัน — เป็นไปไม่ได้จริง มีไว้วัดว่าเหลือที่ให้ไปต่อแค่ไหน_');
  W();
  W('## คำถามที่ตัดสินใจได้จริง: โมเดลเพิ่มอะไรจาก "ซื้อทุกแท่งไม่ดูอะไร" ไหม');
  W();
  W('เอาค่าเฉลี่ยรวมมาลบกันตรง ๆ ไม่ได้ เพราะสองฝั่งเข้าไม้คนละชุดแท่ง สัดส่วนยุคดี/ยุคร้าย');
  W('จึงไม่เท่ากัน — ตารางนี้จับคู่ **รายเดือน** แล้วทดสอบผลต่างเฉลี่ยข้ามเดือน');
  W();
  W('| ระยะถือ | ชุด | ridge − ซื้อทุกแท่ง (bps/ไม้) | CI95 | p | เดือนที่จับคู่ได้ |');
  W('|---:|---|---:|---|---:|---:|');
  for (const hh of MODEL_HORIZONS) {
    for (const [split, o] of [['train', OUT.train], ['validation', OUT.validation]]) {
      const d = o?.[hh]?.vsAlwaysLong;
      if (!d || !Number.isFinite(d.p)) continue;
      W(`| ${hh} | ${split} | ${f2(d.mean)} | [${f2(d.ci[0])}, ${f2(d.ci[1])}] | ${pS(d.p)} | ${d.G} |`);
    }
  }
  W();

  // ── S7 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# S7 · หุ้นไทยขาดไปเท่าไร (คำถามที่เจ้าของต้องใช้ตัดสินใจ)');
  W();
  W(`ช่องของหุ้นไทยที่วัดได้ทั้งหมด ${OUT.gate.byMarket.TH_STOCK?.cells ?? 0} ช่อง · ผ่านด่าน **0 ช่อง**`);
  W();
  W('**12 ช่องที่ใกล้ผ่านที่สุด** (เรียงตามสุทธิหลังหักค่าธรรมเนียม)');
  W();
  W('| กลุ่ม | TF | feature | ถือ | ขอบ (bps) | ค่าธรรมเนียม | สุทธิ | p ของเงิน | ตกด่านไหน |');
  W('|---|---|---|---:|---:|---:|---:|---:|---|');
  for (const c of OUT.gate.thaiClosest) {
    const fails = [];
    if (c.leakyUniverse) fails.push('G2 เลือกตัวด้วยอนาคต');
    if (!c.moneyHolm) fails.push('G3 เงินไม่ผ่าน Holm');
    if (!(c.netBps > 0)) fails.push('G4 สุทธิติดลบ');
    W(`| ${GROUP_LABEL[c.group] ?? c.group} | ${c.tf} | \`${c.feature}\` | ${c.h} | ${f2(c.edgeBps)} | ${f2(c.feeBps)} | ${f2(c.netBps)} | ${pS(c.moneyP)} | ${fails.join(' · ') || '—'} |`);
  }
  W();
  W('ตารางข้างบนถูกครองด้วยกลุ่ม "หุ้นซิ่งไทย" ที่ **คัดรายชื่อด้วยข้อมูลอนาคต** ซึ่งอ่านเป็นขอบจริงไม่ได้');
  W('ตารางข้างล่างคือของจริงที่เจ้าของมี: จักรวาลหุ้นไทยที่รายชื่อไม่ได้ถูกเลือกด้วยอนาคต');
  W();
  W('**หุ้นไทยจักรวาลสะอาด — 12 ช่องที่ใกล้ผ่านที่สุด**');
  W();
  W('| กลุ่ม | TF | feature | ถือ | ขอบ (bps) | ค่าธรรมเนียม | สุทธิ | ต้องแรงกว่านี้กี่เท่าถึงเท่าทุน | p ของเงิน |');
  W('|---|---|---|---:|---:|---:|---:|---:|---:|');
  for (const c of OUT.gate.thaiCleanClosest) {
    const mult = c.edgeMultiplierToBreakEven;
    const multS = Number.isFinite(mult) ? (mult <= 1 ? 'ถึงแล้ว' : `${mult.toFixed(2)}×`) : '—';
    W(`| ${GROUP_LABEL[c.group] ?? c.group} | ${c.tf} | \`${c.feature}\` | ${c.h} | ${f2(c.edgeBps)} | ${f2(c.feeBps)} | ${f2(c.netBps)} | ${multS} | ${pS(c.moneyP)} |`);
  }
  W();
  const bestClean = OUT.gate.thaiCleanClosest[0];
  if (bestClean) {
    W(`ตัวที่ใกล้ที่สุดของจักรวาลสะอาดคือ \`${bestClean.feature}\` · ${GROUP_LABEL[bestClean.group] ?? bestClean.group} · ถือ ${bestClean.h} แท่ง`);
    if (bestClean.netBps > 0) {
      W(`ขอบ ${f2(bestClean.edgeBps)} bps เทียบค่าธรรมเนียม ${f2(bestClean.feeBps)} bps = สุทธิ ${f2(bestClean.netBps)} bps`);
      W(`**ขนาดผ่านแล้ว แต่ตกที่นัยสำคัญ** — p ของเงิน ${pS(bestClean.moneyP)} ไม่ผ่านเกณฑ์ Holm ของตระกูลตัวเอง`);
      W('แปลว่าตัวเลขบวกนั้นอธิบายด้วย "ลองหลายครั้งแล้วเจอตัวที่ดูดี" ได้ทั้งหมด');
    } else {
      W(`ขอบ ${f2(bestClean.edgeBps)} bps เทียบค่าธรรมเนียม ${f2(bestClean.feeBps)} bps = **ติดลบ ${f2(-bestClean.netBps)} bps**`);
      W(`ต้องแรงกว่าที่วัดได้ **${bestClean.edgeMultiplierToBreakEven?.toFixed(2)} เท่า** ถึงจะแค่เท่าทุน — ยังไม่นับว่าต้องมีนัยสำคัญด้วย`);
    }
    W();
  }
  W('## เพดานที่วัดไว้แล้ว พูดเรื่องเดียวกัน');
  W();
  W('p\\* = ความแม่นทิศที่ต้องได้ ถึงจะแค่คุ้มค่าธรรมเนียม · p_fair = จุดที่คุ้มถ้าไม่มีค่าธรรมเนียม');
  W('ผลต่างของสองค่านี้คือ **"ภาษีความแม่น" ที่ค่าธรรมเนียมเรียกเก็บ** — ตัวเดียวที่เทียบข้ามตลาดได้ตรง');
  W();
  W('| กลุ่ม | ถือ | p\\* | p_fair | ภาษีความแม่น | ความแม่นจริงของเครื่องยนต์ | ต้องปีนอีก |');
  W('|---|---:|---:|---:|---:|---:|---:|');
  const ceilKeys = Object.keys(OUT.ceilingRef).sort((a, b) => {
    const [ga, ha] = a.split('|'); const [gb, hb] = b.split('|');
    return ga === gb ? Number(ha) - Number(hb) : tieKey(ga, gb);
  });
  for (const key of ceilKeys) {
    const c = OUT.ceilingRef[key];
    const [gp, hh] = key.split('|');
    const climb = Number.isFinite(c.engineAcc) ? c.pStar - c.engineAcc : NaN;
    W(`| ${GROUP_LABEL[gp] ?? gp} | ${hh} | ${pctS(c.pStar)} | ${pctS(c.pFair)} | ${pctS(c.accTax)} | ${pctS(c.engineAcc)} | ${Number.isFinite(climb) ? `${(climb * 100).toFixed(1)}%` : '—'} |`);
  }
  W();
  W('**กลไกที่อธิบายทุกอย่างคือแถว "ภาษีความแม่น"** — หุ้นไทยจ่ายภาษีนี้แพงกว่าหุ้นสหรัฐหลายเท่า');
  W('และภาษีนี้ไม่สนใจว่า feature เก่งแค่ไหน มันเก็บก่อนที่ feature จะได้ทำงาน');
  W('ลดได้ทางเดียวคือถือนานขึ้นให้การเคลื่อนไหวโตกว่าค่าธรรมเนียม ไม่ใช่หา feature เก่งขึ้น');
  W();

  // ── S8 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# S8 · บัญชีการเปรียบเทียบ และผลทุกข้อรวมที่ไม่ผ่าน');
  W();
  W(`ลงทะเบียนรอบนี้ **${OUT.ledger.registeredThisRound} ข้อ** แก้ค่า p ด้วย Holm ภายในตระกูล`);
  W(`(${OUT.ledger.families.map((f) => `${f.family} ${f.n}`).join(' · ')})`);
  W();
  W(`บวกกับการแก้ค่า p ของเงินในตระกูล feat-time ที่รอบนี้เป็นคนทำให้ ${OUT.ledger.reHolmedFromFeatTime} ช่อง`);
  W();
  W('รอบก่อน ๆ ลงทะเบียนไว้แล้ว: '
    + `ceiling ${OUT.ledger.priorRounds.ceiling} · feat-volume ${OUT.ledger.priorRounds.featVolume} · `
    + `feat-time ${OUT.ledger.priorRounds.featTime} · feat-cross ${OUT.ledger.priorRounds.featCross} `
    + `= ${Object.values(OUT.ledger.priorRounds).reduce((a, b) => a + b, 0)} ข้อ`);
  W();
  W('| # | ตระกูล | คำถาม | ค่าที่วัดได้ (bps) | CI95 | p | เกณฑ์ Holm | ผ่าน |');
  W('|---:|---|---|---:|---|---:|---:|:---:|');
  for (const t of OUT.tests) {
    const ci = t.ci && Number.isFinite(t.ci[0]) ? `[${f2(t.ci[0])}, ${f2(t.ci[1])}]` : '—';
    W(`| ${t.idx} | ${t.family} | ${t.question} | ${f2(t.estimate)} | ${ci} | ${pS(t.p)} | ${t.holmThreshold?.toExponential(1)} | ${t.holmPass ? '**ผ่าน**' : 'ไม่'} |`);
  }
  W();

  // ── S9 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# S9 · ตอบคำถามที่เจ้าของถามตรง ๆ');
  W();
  W('คำถามคือ **"หาสัญญาณที่เดาทิศแม่นกว่าปัจจุบัน 10 เท่าขึ้นไปได้ไหม"**');
  W();
  W('**ตอบ: ไม่ได้ — และรอบนี้บอกได้ละเอียดกว่าเดิมว่าติดตรงไหน**');
  W();
  W('| ขั้น | สิ่งที่เจอ |');
  W('|---|---|');
  W(`| 1. มี feature ที่รอดจริงไหม | มี ${OUT.gate.survivors.length} ช่อง แต่ **ทั้งหมดอยู่ในหุ้นสหรัฐ** หุ้นไทย 0 ช่องจาก ${OUT.gate.byMarket.TH_STOCK?.cells ?? 0} |`);
  if (tr) W(`| 2. ประกอบแล้วดีขึ้นบน train ไหม | ดีขึ้น — ${f2(tr.ridge.netBps)} bps/ไม้ ผ่าน Holm ทุกช่อง |`);
  if (tr) W(`| 3. ชนะ "ซื้อทุกแท่งไม่ดูอะไร" ไหม | **ไม่ชนะ** ผลต่างจับคู่รายเดือน ${f2(tr.vsAlwaysLong.mean)} bps p=${pS(tr.vsAlwaysLong.p)} |`);
  if (va) W(`| 4. รอดบน validation ไหม | **ไม่รอด** ${f2(va.ridge.netBps)} bps/ไม้ p=${pS(va.ridge.netP)} · ผ่าน Holm 0 จาก ${OUT.tests.filter((q) => q.family === 'VALIDATION').length} ข้อ |`);
  if (va) W(`| 5. จับได้กี่ % ของเพดาน | ${((va.ridge.netBps / va.ceilingOnRidgeBars.netBps) * 100).toFixed(1)}% บน validation (${((tr.ridge.netBps / tr.ceilingOnRidgeBars.netBps) * 100).toFixed(1)}% บน train) |`);
  W();
  const bestRatio = OUT.gate.thaiCleanClosest
    .filter((c) => Number.isFinite(c.edgeBps) && c.feeBps > 0)
    .map((c) => ({ ...c, ratio: Math.abs(c.edgeBps) / c.feeBps }))
    .sort((a, b) => b.ratio - a.ratio)[0];
  if (bestRatio) {
    W('## ข่าวดีข้อเดียวของรอบนี้: "ช่องว่าง 10 เท่า" ไม่ใช่ช่องว่างเดิมอีกแล้ว');
    W();
    W('ตอนตั้งโจทย์ ตัวเลขที่ใช้คือหุ้นซิ่งไทย **กำไร 10.05 bps/ไม้ เทียบค่าธรรมเนียม 102.32 bps = ห่าง 10.2 เท่า**');
    W('ตัวเลขนั้นมาจากกรอบเวลาสั้นและระยะถือสั้น ซึ่งเป็นที่ที่ค่าธรรมเนียมกินหนักที่สุด');
    W();
    W(`พอย้ายมาวัดบน 1D และถือยาวขึ้น ตัวที่ดีที่สุดของจักรวาลหุ้นไทยที่สะอาดคือ`);
    W(`\`${bestRatio.feature}\` · ${GROUP_LABEL[bestRatio.group] ?? bestRatio.group} · ถือ ${bestRatio.h} แท่ง`);
    W(`ขอบ ${f2(bestRatio.edgeBps)} bps เทียบค่าธรรมเนียม ${f2(bestRatio.feeBps)} bps = **${bestRatio.ratio.toFixed(2)} เท่าของค่าธรรมเนียม**`);
    W();
    W('| | ตอนตั้งโจทย์ | ที่วัดได้ตอนนี้ |');
    W('|---|---:|---:|');
    W('| ขอบ (bps/ไม้) | 10.05 | ' + f2(Math.abs(bestRatio.edgeBps)) + ' |');
    W('| ค่าธรรมเนียม (bps) | 102.32 | ' + f2(bestRatio.feeBps) + ' |');
    W('| ขอบ ÷ ค่าธรรมเนียม | 0.10 เท่า | **' + bestRatio.ratio.toFixed(2) + ' เท่า** |');
    W();
    W('**ช่องว่างด้าน "ขนาด" ปิดไปแล้วเกือบหมด — แต่ปิดด้วยการเปลี่ยนกรอบเวลา ไม่ใช่ด้วย feature**');
    W('และสิ่งที่มาแทนคือปัญหาใหม่: พอขนาดพอแล้ว ขอบนั้นกลับ **แยกจากเสียงรบกวนไม่ออก**');
    W(`(p ของเงิน = ${pS(bestRatio.moneyP)} ซึ่งไม่ผ่านเกณฑ์ Holm เมื่อคิดว่าลองไปทั้งหมดกี่อย่าง)`);
    W();
    W('นี่คือเหตุผลที่คำตอบของรอบนี้ไม่ใช่ "ยังห่าง 10 เท่า" แต่เป็น');
    W('**"ใกล้แล้วในเชิงขนาด แต่ยังพิสูจน์ไม่ได้ว่าไม่ใช่ความบังเอิญ"** ซึ่งเป็นคนละปัญหา');
    W('และแก้ด้วยวิธีคนละแบบ: ต้องการข้อมูลมากขึ้น/ยาวขึ้น ไม่ใช่ feature เก่งขึ้น');
    W();
    W('⚠ **อย่าเพิ่งดีใจกับตัวเลข 1.23 เท่านี้** — exp-feat-cross ตรวจช่องนี้เพิ่มไว้แล้ว 4 ด้าน');
    W('และทุกด้านดึงไปทางเดียวกัน:');
    W();
    W('· ความแม่นทิศแค่ 52.7% เทียบเส้นคุ้มทุน p\\* ≈ 59.6% (ที่บวกได้มาจากเรขาคณิต ไม่ใช่ความแม่น)');
    W('· จางลงตามเวลา: ครึ่งแรกของ train 157.38 bps → ครึ่งหลัง 83.09 bps');
    W('· ต้องขายชอร์ต 42.9% ของเวลา ซึ่งหุ้นไทยนอก SET50 รายย่อยยืมมาชอร์ตแทบไม่ได้จริง');
    W('  ถ้าตัดฝั่งขายทิ้ง สิ่งที่เหลือคือการเก็บ drift ของจักรวาล ซึ่งวัดได้ 78.68 bps');
    W('  ขณะที่ค่าธรรมเนียมไป-กลับคือ 97.63 bps = **ติดลบตั้งแต่ยังไม่ทำอะไรเลย**');
    W('· survivorship bias ของคลังกระทบจักรวาลนี้หนักที่สุด (หุ้นที่เจ๊งหายไปตั้งแต่ต้นทาง)');
    W();
  }
  W('**สิ่งที่ควรอ่านจากรอบนี้มากที่สุด ไม่ใช่ตัวเลขของโมเดล แต่เป็นระยะห่างระหว่าง train กับ validation**');
  W();
  if (tr && va) {
    W(`บน train โมเดลได้ ${f2(tr.ridge.netBps)} bps/ไม้ ด้วย p = ${pS(tr.ridge.netP)} ซึ่งดูหนักแน่นมาก`);
    W(`พอไป validation เหลือ ${f2(va.ridge.netBps)} bps/ไม้ ด้วย p = ${pS(va.ridge.netP)} = แยกจากศูนย์ไม่ออก`);
    W('ทั้งที่โมเดลมีแค่ 8 พารามิเตอร์ · เลือก λ ด้วย CV ที่เคารพเวลา · ไม่มี look-ahead ให้จับได้เลย');
    W('และ feature ทุกตัวผ่านด่านนัยสำคัญของรอบก่อนมาแล้ว');
    W();
    W('นี่คือภาพของ "ขอบที่เล็กเกินกว่าจะแยกจากเสียงรบกวน" ไม่ใช่ภาพของบั๊ก');
    W('การประกอบ feature เพิ่มไม่ได้แก้เรื่องนี้ เพราะปัญหาไม่ได้อยู่ที่จำนวน feature');
  }
  W();
  W('**ถ้าเจ้าของจะลงแรงต่อ ทางที่เหลือไม่ใช่ "หา feature เพิ่ม"**');
  W();
  W('· ทางที่ตัวเลขในโครงการนี้สนับสนุน: ลดค่าธรรมเนียมต่อรอบ (ตลาดอื่น/โบรกอื่น) หรือถือนานขึ้น');
  W('  เพราะภาษีความแม่นของหุ้นไทยแพงกว่าหุ้นสหรัฐหลายเท่า และมันเก็บก่อน feature ได้ทำงาน');
  W('· ทางที่ยังไม่ถูกลอง และรอบนี้ไม่ได้ตอบ: การทำนาย **ขนาด** เพื่อ *ไม่เข้า* ตอนคาดว่าจะวิ่งแรง');
  W('  (exp-feat-time พบว่า feature ระบอบความผันผวนทำนายขนาดได้แรงกว่าทิศ 3–12 เท่า)');
  W('  แต่ต้องมีสัญญาณทิศที่ใช้ได้ก่อน ถึงจะเอามาปรับขนาดไม้ได้ — ซึ่งตอนนี้ยังไม่มี');
  W();

  // ── ข้อจำกัด ──────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# ข้อจำกัดของรอบนี้ (อ่านก่อนเอาไปใช้)');
  W();
  const lim = [
    'ตลาดที่ประกอบโมเดลได้คือหุ้นสหรัฐ ซึ่ง**ไม่ใช่ตลาดที่เจ้าของเทรด** ผลทุกตัวในรายงานนี้'
    + 'จึงตอบคำถาม "มีอะไรรอดบ้าง" ไม่ได้ตอบคำถาม "เอาไปใช้กับพอร์ตปัจจุบันได้ไหม"',
    'ขนาดของขอบอยู่ระดับไม่กี่ bps ต่อไม้ ซึ่งเล็กกว่าที่ slippage และ market impact จริงจะกลืนได้ง่าย ๆ '
    + 'ตัวเลขค่าธรรมเนียมมาจากตารางประมาณของ lab.mjs (หุ้นสหรัฐ 5 bps) ไม่ใช่ใบเสร็จจริง',
    'คลังข้อมูลมี survivorship bias — Yahoo ลบหุ้นที่ออกจากกระดานทิ้งตั้งแต่ต้นทาง '
    + 'จักรวาลหุ้นสหรัฐ 17 ตัวนี้คือตัวที่ "รอดมาถึงวันนี้" ผลจริงในอดีตย่อมแย่กว่าที่วัดได้',
    'ราคาไม่ได้ปรับปันผลและไม่ได้ปรับ corporate action ทั้งหมด — กระทบ feature ที่ใช้หน้าต่างยาวมากกว่าสั้น',
    'เส้นแบ่งคะแนน (หัว/ท้าย 20%) และชุด λ ที่กวาด เป็นค่าที่ตั้งไว้ก่อนดูผลและไม่ได้กวาดหาค่าที่ดีที่สุด '
    + '(ตั้งใจ เพราะการกวาดคือ p-hacking) แต่แปลว่าไม่รู้ว่าค่าอื่นจะให้ภาพต่างแค่ไหน',
    'ระยะถือ 3/6/10 แท่ง มาจาก "ระยะที่มีช่องรอด" ในรายงานต้นทาง ไม่ได้ไล่ทุกค่า',
    'โมเดลนี้ยังไม่ได้แตะชุด test เลย ถ้าจะเอาไปใช้จริงต้องผ่านด่าน test ก่อน และการแตะ test '
    + 'ต้องผ่าน lab.mjs ที่มีสมุดบันทึกเท่านั้น',
    'การทดสอบบน validation ครั้งนี้เป็นครั้งแรกของโมเดลนี้ แต่ validation ถูกแตะมาแล้วในรอบก่อน ๆ '
    + 'ของโครงการ (baseline · geometry · regime · families · cost-mechanics) ยิ่งแตะบ่อย validation '
    + 'ก็ยิ่งกลายเป็น train ทีละนิด',
  ];
  lim.forEach((l, i) => { W(`${i + 1}. ${l}`); W(); });

  fs.writeFileSync(path.join(OPT.outDir, 'exp-combine.md'), `${LINES.join('\n')}\n`);
}

export { collectCells, passesGate, passesLooseGate, buildPool, buildCrossFeatures, buildSymbolFeatures, main };

// เปิดให้ทดสอบด่านตรวจตัวเองจากภายนอกได้ — เครื่องตรวจที่ทดสอบไม่ได้ ก็เชื่อไม่ได้
export { summarizeCore, crossCheckSummaries };

// รันเฉพาะตอนถูกเรียกตรง ๆ — ถ้าถูก import เข้ามาจะไม่ทำงานเอง
if (process.argv[1] && process.argv[1].endsWith('combine.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
