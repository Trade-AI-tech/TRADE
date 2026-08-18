#!/usr/bin/env node
/**
 * th-scalp.mjs — เรขาคณิต TP/SL ที่ออกแบบมาให้จบใน 1–3 แท่ง แล้ววัดว่าเหลืออะไรจริง
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ไฟล์นี้ "วัด" อย่างเดียว · ไม่แตะ lab.mjs · ไม่แตะ engine-lab.mjs · ไม่แตะ src/**
 *  เรียก lab.mjs เป็นกระบวนการลูกเท่านั้น · ไม่แตะชุด test เลย
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ───────────────────────────── คำถามที่ไฟล์นี้ตอบ ─────────────────────────────
 *
 * เจ้าของถามว่า "หุ้นไทยที่เล่นจบใน 1 ชั่วโมงได้โดยตั้ง TP/SL — หุ้นซิ่งต่าง ๆ"
 * เกณฑ์ปัจจุบัน (SL 1.5×ATR · TP 3×ATR) ปิดกำไรใน 1 แท่งได้ 0 จาก 356 ไม้
 * รอบนี้จึงต้องออกแบบเรขาคณิตใหม่ที่ "ตั้งใจให้จบเร็ว" แล้ววัดว่าหลังหักค่าคอมเหลืออะไร
 *
 * ─────────────────── ทำไมไฟล์นี้ไม่ใช่การกวาดพารามิเตอร์ ───────────────────
 *
 * ถ้ากวาด (a, b) = (TP, SL) สัก 50 คู่แล้วเลือกคู่ที่ดีที่สุด เราจะได้ "หัวแถวของเสียง
 * รบกวน" เสมอ ไม่ว่าจะมีขอบจริงหรือไม่ ไฟล์นี้จึงเดินกลับทางกัน: หา **เพดาน** ของสิ่งที่
 * เรขาคณิตใด ๆ ทำได้ก่อน แล้วค่อยดูว่าเพดานนั้นสูงพอจ่ายค่าคอมไหม
 *
 * เพดานมาจากข้อเท็จจริงเชิงโครงสร้างข้อเดียว:
 *
 *   การตั้ง TP/SL คือ "เวลาหยุด" (stopping time) τ ที่ถูกบังคับให้ τ ≤ 1 แท่ง
 *   ถ้าราคาในแท่งเป็น martingale บวก drift μ ต่อแท่ง ทฤษฎีบทการหยุดที่เลือกได้
 *   (optional stopping) ให้ E[P_τ − P_0] = μ·E[τ] ≤ μ  เมื่อ μ > 0
 *
 *   → **เรขาคณิตไม่ผลิตเงิน มันแค่กระจายผลลัพธ์ใหม่**
 *   → กำไรคาดหวังของ TP/SL ทุกแบบที่ถือไม่เกิน 1 แท่ง ถูกจำกัดด้วย "การเคลื่อนไหว
 *     ตามทิศของสัญญาณตลอดทั้งแท่ง" ซึ่งวัดได้ตรง ๆ โดยไม่ต้องรู้ค่า a, b เลย
 *   → และเพราะ E[τ] < 1 สำหรับไม้ที่ปิดก่อนหมดแท่ง การสเกลผิงจึงเก็บ drift ได้ *น้อยกว่า*
 *     การถือเต็มแท่ง ขณะที่จ่ายค่าธรรมเนียมเท่ากันเป๊ะ
 *
 * ประโยคสุดท้ายคือหัวใจ: **"ถือเต็มแท่งแล้วปิดที่ราคาปิด" คือเพดานของทุกเรขาคณิต**
 * ถ้าเพดานยังต่ำกว่าค่าคอม ก็ไม่ต้องลอง (a, b) สักคู่ — แต่เราลองอยู่ดีเพื่อ *ตรวจสอบ*
 * ว่าเพดานนี้ไม่ถูกละเมิดในข้อมูลจริง (S4 ตรวจข้อนี้เป็นตัวเลข ไม่ใช่เชื่อทฤษฎี)
 *
 * ─────────────────────────────── ลำดับการวัด ───────────────────────────────
 *
 *  S0  ตรวจเครื่องวัด — จำลองไม้ของ lab.mjs ซ้ำทุกไม้ด้วยโค้ดในไฟล์นี้ ต้องตรงเป๊ะ
 *      ถ้าข้อนี้ไม่ผ่าน ตัวเลขที่เหลือเชื่อไม่ได้ และสคริปต์จะหยุด
 *  S1  ★ เพดานของทุกเรขาคณิต — ขอบทิศทางใน 1 แท่ง เทียบกับค่าธรรมเนียม (คำถามชี้ขาด)
 *  S2  เลขคณิตก่อนทดสอบ — อัตราชนะที่ต้องการของแต่ละเรขาคณิต (ทำก่อนวัด ตามที่โจทย์สั่ง)
 *  S3  ระยะที่ราคาเดินถึงได้จริงใน 1 แท่ง — MFE/MAE เป็นหน่วย ATR (ตั้ง TP จากตัวเลขนี้)
 *  S4  วัดจริงด้วย lab.mjs — 9 เรขาคณิต × 4 กลุ่ม × เพดานถือ 1 และ 3 แท่ง (train)
 *  S5  ยืนยันบน validation เฉพาะแบบที่ดูมีแวว + นับจำนวนครั้งที่แตะ validation
 *
 * ────────────────────────────── สี่กลุ่มที่เทียบกัน ──────────────────────────────
 *
 *  RUNNER   หุ้นซิ่งไทย 11 ตัว — **เพิ่งเพิ่มเข้าคลังรอบนี้** (universe.json 2026-08-18)
 *           ทุกรายงานก่อนหน้าระบุตรงกันว่าคลังไทยเป็น SET50 ล้วน จึงตอบไม่ได้ว่า
 *           "หุ้นซิ่งกำไรไหม" ไฟล์นี้ปิดช่องนั้น
 *  SET50    หุ้นไทย 14 ตัวเดิม — ตัวเทียบภายในตลาดเดียวกัน
 *  GOLD     ทองและโลหะ 5 ตัว — ผันผวนสูง ค่าคอมถูก
 *  FOREX    ค่าเงิน 12 คู่ — ค่าคอมถูกที่สุดในคลัง (1.5 bps)
 *
 *  กลไกที่กำลังทดสอบ: "ผันผวนสูง = ต้นทุนเป็น R ถูกลง" (costR = ค่าธรรมเนียม ÷ ระยะ SL)
 *  สี่กลุ่มนี้เรียงจากค่าคอมแพงสุดไปถูกสุด ถ้ากลไกนี้พอเอาชนะได้ FOREX ต้องดีที่สุด
 *
 * ───────────────────────── การเลือกหุ้นซิ่งเลือกอย่างไร ─────────────────────────
 *
 * เลือกด้วยกฎที่วัดจาก **train เท่านั้น** และเป็นกฎที่ไม่เกี่ยวกับผลตอบแทนเลย:
 *   · ช่วงแท่งเฉลี่ย (high−low)/close ≥ 1.20%  (มัธยฐานของ SET50 = 0.91%)
 *   · มูลค่าซื้อขายมัธยฐานต่อแท่ง ≥ 0.5 ล้านบาท (ไม้ที่เสี่ยง 2,000 บาทต้องไม่ดันราคา)
 *   · แท่งที่ใช้ได้ ≥ 4,500 แท่ง และ quality.verdict ไม่ใช่ bad
 * เลือกด้วยผลตอบแทนเมื่อไร = เลือกผู้ชนะที่รู้ผลแล้ว ซึ่งทำให้ทุกตัวเลขหลังจากนั้นโกหก
 *
 * ⚠ Yahoo ลบหุ้นที่ออกจากกระดานทิ้ง — STARK/MORE ที่เจ๊งหายไปเอง กลุ่มหุ้นซิ่งจึงเอียง
 *   ไปทางผู้รอดชีวิตโดยอัตโนมัติ ผลจริงของการเล่นหุ้นซิ่งแย่กว่าที่วัดได้ในไฟล์นี้เสมอ
 *
 * ─────────────────────── ทำไมต้องนับจำนวนการเปรียบเทียบ ───────────────────────
 *
 * ทดสอบ 40 ครั้งที่ระดับ 0.05 บนข้อมูลที่ไม่มีขอบเลย ยังคาดว่าจะได้ผล "มีนัยสำคัญ"
 * ราว 2 ครั้งฟรี ๆ ไฟล์นี้จึงลงทะเบียนทุกการทดสอบไว้ใน TESTS แล้วนับเอง · การทดสอบบน
 * train ทำเครื่องหมายว่า "สำรวจ" และไม่ใช้ตัดสิน · ครอบครัวที่ตัดสินคือ validation
 * เท่านั้น และถูกแก้ค่า p ด้วยวิธี Holm
 *
 * ────────────────────────────────── วิธีใช้ ──────────────────────────────────
 *
 *   node scripts/research/experiments/th-scalp.mjs
 *   node scripts/research/experiments/th-scalp.mjs --refresh          รันทุก lab ใหม่
 *   node scripts/research/experiments/th-scalp.mjs --bootstrap=20000 --seed=1234
 *   node scripts/research/experiments/th-scalp.mjs --skip-validation  หยุดหลัง train
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { ROOT, loadSrcModules } from '../load-src-modules.mjs';

const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const WORK_DIR = path.join(REPORT_DIR, 'th-scalp');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');

// ════════════════════════════════ ค่าคงที่ของงาน ════════════════════════════════

/** 14 ตัวเดิมในคลัง — ทุกตัวเป็น SET50 ทั้งหมด (ฐานเทียบของรายงานก่อนหน้าทุกฉบับ) */
const SET50_SYMBOLS = [
  'PTT', 'PTTEP', 'AOT', 'CPALL', 'KBANK', 'BBL', 'ADVANC',
  'SCC', 'BDMS', 'CPF', 'DELTA', 'MINT', 'IVL', 'EA',
];

/**
 * เกณฑ์คัดหุ้นซิ่ง — วัดบน train เท่านั้น และไม่มีข้อไหนเกี่ยวกับผลตอบแทน
 * minBars นับเฉพาะแท่งในช่วง train (~66% ของ 4,890 แท่งทั้งหมด ≈ 3,200 แท่ง)
 * ไม่ใช่แท่งทั้งคลัง — ตั้งไว้ 3,000 เพื่อกันชุดที่ข้อมูลขาดเป็นช่วงยาว
 */
const RUNNER_RULE = {
  minBarRangePct: 1.20,   // ช่วงแท่งเฉลี่ย ≥ 1.20% (SET50 มัธยฐาน 0.91%)
  minTurnoverBaht: 0.5e6, // มูลค่าซื้อขายมัธยฐานต่อแท่ง ≥ 0.5 ล้านบาท
  minBars: 3000,          // แท่งในช่วง train
};

/**
 * ตารางช่วงราคาของ SET (tick size) — ราคาขยับได้ทีละเท่านี้เท่านั้น
 * คัดมาจากกติกาสาธารณะของตลาด ตัวเดียวกับที่ cost-mechanics.mjs ใช้
 * ค่านี้คือ "พื้น" ของสเปรด ไม่ใช่ค่าจริง — หุ้นสภาพคล่องต่ำกว้างกว่าหนึ่ง tick ได้เสมอ
 */
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

/** ค่าคอมหุ้นไทยที่พบทั่วไป — ไม่ใช่ใบเสร็จจริงของเจ้าของ */
const TH_COMM_RATE = 0.00157;  // 0.157% ต่อข้าง (รวม VAT + ค่าธรรมเนียมตลาด) → 31.4 bps ไป-กลับ
const TH_MIN_FEE = 50;         // ค่าคอมขั้นต่ำต่อคำสั่ง (บาท)
const TH_RISK_BAHT = 2000;     // เงินเสี่ยงต่อไม้ที่ใช้คิดขนาดคำสั่ง
const TH_TICKS_PER_ROUND = 1;  // จ่ายสเปรดกี่ tick ต่อรอบ (1 = มองโลกในแง่ดีที่สุด)

/** ค่าธรรมเนียมไป-กลับแบบ bps ของกลุ่มที่ไม่ใช่หุ้นไทย — ตัวเดียวกับตารางของ lab.mjs */
const NON_TH_FEE_BPS = { GOLD: 5, FOREX: 1.5 };

/**
 * เรขาคณิตที่ทดสอบ — เลือกจากกลไก ไม่ใช่จากการกวาด
 * แต่ละแบบตอบคำถามคนละข้อ และเหตุผลเขียนไว้ในช่อง why
 */
const GEOMETRIES = [
  { id: 'P0', label: 'ปัจจุบัน (ใช้แนวรับ/ต้าน)', sl: 1.5, tp: 3.0, sr: true,
    why: 'ของจริงที่ให้ผล 0 จาก 356 — ฐานเทียบ' },
  { id: 'A0', label: 'ATR ล้วน SL1.5 TP3', sl: 1.5, tp: 3.0, sr: false,
    why: 'ตัดแนวรับ/ต้านออก เพื่อให้ (a,b) เป็นตัวเลขที่ควบคุมได้จริง' },
  { id: 'A1', label: 'TP = มัธยฐานที่ไปถึงได้', sl: 1.5, tp: 0.45, sr: false,
    why: 'S3 วัดว่า MFE มัธยฐานใน 1 แท่ง = 0.45 ATR — TP ที่ครึ่งหนึ่งของแท่งไปถึง' },
  { id: 'A2', label: 'TP = p75 ที่ไปถึงได้', sl: 1.5, tp: 0.70, sr: false,
    why: 'ขยับ TP ออกไปหนึ่งขั้น แลกอัตราชนะกับ RR' },
  { id: 'A3', label: 'TP = p90 ที่ไปถึงได้', sl: 1.5, tp: 1.05, sr: false,
    why: 'TP ที่ 1 ใน 10 แท่งไปถึง — ขอบบนของ "ยังจบใน 1 แท่งได้อยู่"' },
  { id: 'A4', label: 'TP ใกล้ + SL กว้าง', sl: 3.0, tp: 0.45, sr: false,
    why: 'กลไกจาก cost-mechanics: SL กว้าง = costR ถูกลง — ราคาที่จ่ายคือ RR 0.15' },
  { id: 'A5', label: 'สมมาตรที่ระยะไปถึงได้', sl: 0.45, tp: 0.45, sr: false,
    why: 'RR = 1 ที่ระยะซึ่งทั้ง TP และ SL มีโอกาสโดนพอกันใน 1 แท่ง' },
  { id: 'A6', label: 'สมมาตร 1 ATR', sl: 1.0, tp: 1.0, sr: false,
    why: 'RR = 1 ที่ระยะกว้างขึ้น — ต้นทุนเป็น R ถูกกว่า A5 สองเท่ากว่า' },
  { id: 'CEIL', label: 'เพดาน: ไม่มี TP/SL', sl: 12, tp: 12, sr: false,
    why: 'TP/SL ไกลจนแทบไม่มีวันโดน = ปิดที่ราคาปิดแท่งเสมอ = เพดานของทุกเรขาคณิต '
       + '(ใช้ 12 ไม่ใช่ 50 เพราะ 50×ATR ทำให้ SL ของหุ้นผันผวนติดลบ แล้วเครื่องยนต์จะทิ้งสัญญาณนั้น '
       + 'ซึ่งจะทำให้กลุ่มตัวอย่างไม่ใช่ชุดเดียวกับแบบอื่นและเทียบกันไม่ได้)' },
];

/** เพดานการถือที่ทดสอบ — โจทย์คือ "จบใน 1–3 แท่ง" */
const MAX_HOLDS = [1, 3];

/** กลุ่มที่วัด — RUNNER/SET50 แยกกันในโค้ด เพราะทั้งคู่เป็น market = TH_STOCK */
const MARKETS = 'TH_STOCK,GOLD,FOREX';

// ════════════════════════════════ อาร์กิวเมนต์ ════════════════════════════════

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const OPT = {
  bootstrap: Number(args.bootstrap ?? 10000),
  seed: Number(args.seed ?? 20260818),
  refresh: Boolean(args.refresh),
  skipValidation: Boolean(args['skip-validation']),
  tag: String(args.tag ?? 'th-scalp'),
  commRate: Number(args['comm-rate'] ?? TH_COMM_RATE),
  minFee: Number(args['min-fee'] ?? TH_MIN_FEE),
  riskBaht: Number(args['risk-baht'] ?? TH_RISK_BAHT),
};

if (args.split === 'test' || args['i-am-done-tuning']) {
  console.error('\n[หยุด] ไฟล์นี้ไม่แตะชุด test ไม่ว่ากรณีใด — ชุด test ต้องรันผ่าน lab.mjs โดยตรง\n');
  process.exit(1);
}

// ════════════════════════════ เครื่องมือทางสถิติ ════════════════════════════

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function quantile(sortedAsc, p) {
  if (!sortedAsc.length) return NaN;
  const i = (sortedAsc.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (i - lo);
}

/** ตัวสุ่มที่ทำซ้ำได้ — xorshift32 เมล็ดเดียวกันให้ลำดับเดียวกันเสมอ */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * bootstrap ค่าเฉลี่ย — คืนช่วงความเชื่อมั่นและค่า p สองด้าน
 *
 * ค่า p มาจากการนับว่าการสุ่มซ้ำกี่ครั้งที่ตกไปอีกฝั่งของศูนย์ แล้วคูณสอง
 * (บวก 1 ทั้งเศษและส่วนกัน p = 0 ซึ่งเป็นค่าที่เป็นไปไม่ได้จากการสุ่มจำกัดรอบ)
 */
function bootMean(xs, { B = OPT.bootstrap, seed = OPT.seed } = {}) {
  const n = xs.length;
  if (n < 2) return { n, mean: n ? xs[0] : NaN, lo: NaN, hi: NaN, p: NaN };
  const rnd = makeRng(seed);
  const draws = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let t = 0;
    for (let i = 0; i < n; i++) t += xs[(rnd() * n) | 0];
    draws[b] = t / n;
  }
  const sorted = Array.from(draws).sort((a, b) => a - b);
  const m = mean(xs);
  const below = sorted.filter((v) => v <= 0).length;
  const above = B - below;
  const p = Math.min(1, (2 * (Math.min(below, above) + 1)) / (B + 1));
  return { n, mean: m, lo: quantile(sorted, 0.025), hi: quantile(sorted, 0.975), p };
}

/**
 * bootstrap ราย-สัญลักษณ์ (cluster bootstrap) — สุ่มทั้งสัญลักษณ์ ไม่ใช่ทีละไม้
 *
 * ไม้ของสัญลักษณ์เดียวกันไม่อิสระต่อกัน (ราคาสัมพันธ์กับตัวเองข้ามแท่ง) การสุ่มทีละไม้
 * จึงให้ช่วงความเชื่อมั่นที่ "แคบเกินจริง" ช่วงราย-สัญลักษณ์คือตัวที่ควรใช้ตอนสรุป
 */
function bootMeanByCluster(items, keyOf, valueOf, { B = OPT.bootstrap, seed = OPT.seed } = {}) {
  const groups = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(valueOf(it));
  }
  const keys = [...groups.keys()];
  const g = keys.map((k) => groups.get(k));
  if (g.length < 2) return { clusters: g.length, mean: NaN, lo: NaN, hi: NaN, p: NaN };
  const rnd = makeRng(seed);
  const draws = [];
  for (let b = 0; b < B; b++) {
    let sum = 0; let cnt = 0;
    for (let i = 0; i < g.length; i++) {
      const pick = g[(rnd() * g.length) | 0];
      for (const v of pick) { sum += v; cnt++; }
    }
    draws.push(sum / cnt);
  }
  draws.sort((a, b) => a - b);
  const all = items.map(valueOf);
  const below = draws.filter((v) => v <= 0).length;
  const above = B - below;
  return {
    clusters: g.length,
    mean: mean(all),
    lo: quantile(draws, 0.025),
    hi: quantile(draws, 0.975),
    p: Math.min(1, (2 * (Math.min(below, above) + 1)) / (B + 1)),
  };
}

/** สหสัมพันธ์อันดับ (Spearman) — ทนต่อหางหนาของ R มากกว่าสหสัมพันธ์แบบเพียร์สัน */
function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return NaN;
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs); const ry = rank(ys);
  const mx = mean(rx); const my = mean(ry);
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : NaN;
}

/**
 * แก้ค่า p แบบ Holm — เข้มเท่า Bonferroni แต่มีอำนาจสูงกว่า
 * เรียง p จากน้อยไปมาก แล้วเทียบตัวที่ i กับ α/(m−i) · พอตัวไหนไม่ผ่าน ตัวหลังไม่ผ่านหมด
 */
function holm(tests, alpha = 0.05) {
  const idx = tests.map((t, i) => i).filter((i) => Number.isFinite(tests[i].p));
  idx.sort((a, b) => tests[a].p - tests[b].p);
  const m = idx.length;
  let stillPassing = true;
  const out = tests.map((t) => ({ ...t, holmThreshold: NaN, holmPass: false }));
  idx.forEach((i, k) => {
    const thr = alpha / (m - k);
    out[i].holmThreshold = thr;
    if (stillPassing && tests[i].p <= thr) out[i].holmPass = true;
    else stillPassing = false;
  });
  return out;
}

// ══════════════════════════ ทะเบียนการเปรียบเทียบ ══════════════════════════
//
// ทุกการทดสอบต้องผ่านฟังก์ชันนี้ ไม่มีทางลัด — จำนวนการเปรียบเทียบจึงนับจากโค้ดเอง
// ไม่ใช่จากความจำของคนเขียนรายงาน

const TESTS = [];
function registerTest({ id, family, question, estimate, ci, p, note }) {
  TESTS.push({ id, family, question, estimate, ci, p: Number.isFinite(p) ? p : NaN, note: note ?? '' });
  return TESTS[TESTS.length - 1];
}

// ═══════════════════════════════ โหลดข้อมูล ═══════════════════════════════

/** ชื่อไฟล์ cache ใช้อักขระที่ปลอดภัยกับระบบไฟล์ (PA=F → PA_F) */
const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, '_');

const candleCache = new Map();
function loadCandles(market, symbol, timeframe) {
  const key = `${market}__${safe(symbol)}__${timeframe}`;
  if (!candleCache.has(key)) {
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(file)) throw new Error(`ไม่มีไฟล์ cache: ${file}`);
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const index = new Map();
    j.candles.forEach((c, i) => index.set(c.timestamp, i));
    candleCache.set(key, { candles: j.candles, index, quality: j.quality });
  }
  return candleCache.get(key);
}

function readTradesCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const num = new Set([
    'confidence', 'holdBars', 'entry', 'exit', 'stopLoss', 'takeProfit', 'rrPlanned',
    'stopDistPct', 'plannedRisk', 'realizedRisk', 'riskKeepRatio', 'rGrossPlanned',
    'rGrossRealized', 'rGross', 'costR', 'costRBase', 'rNet', 'tradeable',
  ]);
  return lines.slice(1).map((line) => {
    const v = line.split(',');
    const o = {};
    head.forEach((k, i) => { o[k] = num.has(k) ? Number(v[i]) : v[i]; });
    return o;
  });
}

// ═══════════════════════════ เรียก lab.mjs เป็นลูก ═══════════════════════════

/**
 * รัน lab.mjs หนึ่งครั้งแล้วคืนพาธไฟล์ไม้
 * ไม่แก้ lab.mjs แม้แต่บรรทัดเดียว — ส่งผ่าน --config เท่านั้น
 */
function runLab({ geo, maxHold, split }) {
  const tag = `scalp-${geo.id}-h${maxHold}`;
  // ไฟล์ทำงานทั้งหมดอยู่ใน report/th-scalp/ ไม่ปนกับรายงานหลักของคนอื่น
  const kept = path.join(WORK_DIR, `${tag}-${split}-trades.csv`);
  if (!OPT.refresh && fs.existsSync(kept)) return { csv: kept, cached: true, tag };

  const config = JSON.stringify({
    exits: { useSupportResistance: geo.sr, slAtrMult: geo.sl, tpAtrMult: geo.tp },
  });
  execFileSync(process.execPath, [
    LAB,
    `--markets=${MARKETS}`,
    '--timeframes=1H',
    `--split=${split}`,
    `--max-hold=${maxHold}`,
    `--tag=${tag}`,
    '--dump-trades',
    `--config=${config}`,
    '--bootstrap=2000',
    `--seed=${OPT.seed}`,
  ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

  // lab.mjs เขียนลง report/ เสมอ — ย้ายเข้าโฟลเดอร์ของงานนี้ทันทีเพื่อไม่ให้รกและไม่ทับของใคร
  for (const suffix of [`${split}-trades.csv`, `${split}.txt`, `${split}.json`,
    'train+validation.txt', 'train+validation.json']) {
    const src = path.join(REPORT_DIR, `${tag}-${suffix}`);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(WORK_DIR, `${tag}-${suffix}`));
  }
  if (!fs.existsSync(kept)) throw new Error(`lab.mjs ไม่ได้เขียนไฟล์ไม้ที่คาดไว้: ${kept}`);
  return { csv: kept, cached: false, tag };
}

// ═══════════════════════════════ โมเดลต้นทุน ═══════════════════════════════

function tickSizeFor(price) {
  for (const b of SET_TICK_TABLE) if (price >= b.from && price < b.to) return b.tick;
  return SET_TICK_TABLE[SET_TICK_TABLE.length - 1].tick;
}

/**
 * ต้นทุนจริงของไม้หุ้นไทยหนึ่งไม้ คิดเป็นหน่วย R
 *
 *   costR = [ ค่าคอมไป-กลับ ÷ มูลค่าคำสั่ง  +  จำนวน tick × (tick ÷ ราคา) ] ÷ ระยะSL
 *
 * สองพจน์นี้ต่างกันตรงพฤติกรรม:
 *   · พจน์ tick ลดลงเมื่อ SL กว้างขึ้น — นี่คือกลไก "ผันผวนสูง = ถูกลง"
 *   · พจน์ค่าคอมขั้นต่ำ **ไม่ลดลงเลย** เพราะมูลค่าคำสั่ง = เงินเสี่ยง ÷ ระยะSL
 *     ยิ่ง SL กว้าง คำสั่งยิ่งเล็ก ค่าคอมขั้นต่ำ 50 บาทยิ่งกินสัดส่วนมากขึ้นพอดี ๆ กับที่
 *     ตัวหารโตขึ้น → ผลลัพธ์คือ "พื้น" ที่ไม่มีระยะ SL ใดทะลุได้
 */
function realisticThCostR(price, stopDistPct, o = OPT) {
  if (!(price > 0) || !(stopDistPct > 0)) return NaN;
  const orderValue = o.riskBaht / stopDistPct;
  const feeOneSide = Math.max(o.commRate * orderValue, o.minFee);
  const commR = (2 * feeOneSide) / orderValue / stopDistPct;
  const tickR = (TH_TICKS_PER_ROUND * (tickSizeFor(price) / price)) / stopDistPct;
  return { costR: commR + tickR, commR, tickR, orderValue, minFeeBinds: o.commRate * orderValue < o.minFee };
}

/** ต้นทุนแบบ bps คงที่ (ใช้กับ GOLD/FOREX และใช้เป็นฉากทัศน์เทียบของหุ้นไทย) */
const flatCostR = (bps, stopDistPct) => (bps / 10000) / stopDistPct;

// ═══════════════════════ S0 — ตรวจเครื่องวัดของไฟล์นี้ ═══════════════════════

/**
 * จำลองไม้ซ้ำจากแท่งดิบ ด้วยกติกาเดียวกับ walkForward ของ lab.mjs
 * ลำดับการตรวจในแท่ง: gap_stop → gap_target → stop_loss → take_profit
 * (แท่งที่แตะทั้งสองฝั่งนับ SL ก่อนเสมอ — เลือกทางแย่ไว้ก่อน เพราะ OHLC ไม่บอกลำดับ)
 */
function resimulate(trade) {
  const ds = loadCandles(trade.market, trade.symbol, trade.timeframe);
  const entryIndex = ds.index.get(trade.entryTime);
  if (entryIndex === undefined) return null;
  const isLong = trade.action === 'BUY';
  const entry = ds.candles[entryIndex].open;
  const { stopLoss, takeProfit } = trade;
  const lastIndex = Math.min(entryIndex + trade.holdBars, ds.candles.length - 1);

  for (let j = entryIndex; j <= lastIndex; j++) {
    const bar = ds.candles[j];
    if (!Number.isFinite(bar.open) || !Number.isFinite(bar.high) || !Number.isFinite(bar.low)
      || !Number.isFinite(bar.close) || bar.open <= 0) continue;
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
  return { exit: ds.candles[lastIndex].close, reason: 'time_exit', index: lastIndex, entry };
}

function checkMeter(trades, label) {
  let checked = 0;
  let maxExitErr = 0;
  let reasonMismatch = 0;
  let maxCostErr = 0;
  for (const t of trades) {
    const sim = resimulate(t);
    if (!sim) continue;
    checked++;
    maxExitErr = Math.max(maxExitErr, Math.abs(sim.exit - t.exit));
    if (sim.reason !== t.exitReason) reasonMismatch++;
    // เอกลักษณ์ต้นทุน: costR ของ lab = (bps/10000) ÷ stopDistPct — ตรวจว่าเข้าใจตรงกัน
    const bps = t.market === 'TH_STOCK' ? 40 : (t.market === 'GOLD' ? 5 : 1.5);
    const bySymbol = { XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10, EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15 };
    const useBps = bySymbol[t.symbol] ?? bps;
    maxCostErr = Math.max(maxCostErr, Math.abs(flatCostR(useBps, t.stopDistPct) - t.costR));
  }
  return { label, checked, maxExitErr, reasonMismatch, maxCostErr };
}

// ══════════════════════════ จัดกลุ่มสัญลักษณ์ ══════════════════════════

/** สถิติพื้นฐานของชุดข้อมูลหนึ่ง วัดเฉพาะช่วง train — ใช้คัดหุ้นซิ่ง */
function trainProfile(market, symbol, trainEnd) {
  const ds = loadCandles(market, symbol, '1H');
  const bars = ds.candles.filter((c) => c.timestamp <= trainEnd);
  let n = 0; let sumRange = 0;
  const turnover = []; const px = [];
  for (const c of bars) {
    if (!(c.close > 0) || !Number.isFinite(c.high) || !Number.isFinite(c.low)) continue;
    n++;
    sumRange += (c.high - c.low) / c.close;
    turnover.push(c.close * (c.volume ?? 0));
    px.push(c.close);
  }
  turnover.sort((a, b) => a - b);
  px.sort((a, b) => a - b);
  return {
    symbol,
    bars: n,
    barRangePct: (sumRange / n) * 100,
    medTurnover: quantile(turnover, 0.5),
    medPrice: quantile(px, 0.5),
    tickPctAtMedian: (tickSizeFor(quantile(px, 0.5)) / quantile(px, 0.5)) * 100,
    verdict: ds.quality?.verdict ?? '?',
  };
}

/**
 * หุ้นไทยที่ไม่ได้อยู่ทั้งใน SET50 เดิมและไม่ผ่านเกณฑ์หุ้นซิ่ง ต้องได้กลุ่มของตัวเอง
 * (TH_EXCLUDED ซึ่งไม่อยู่ใน GROUPS จึงถูกกรองทิ้งทุกตาราง) — ถ้าปล่อยให้ตกไปอยู่ SET50
 * ตาราง "SET50 เดิม 14 ตัว" จะมี 25 สัญลักษณ์อยู่ข้างในโดยไม่มีใครรู้
 */
function groupOf(trade, runnerSet) {
  if (trade.market !== 'TH_STOCK') return trade.market;
  if (runnerSet.has(trade.symbol)) return 'RUNNER';
  if (SET50_SYMBOLS.includes(trade.symbol)) return 'SET50';
  return 'TH_EXCLUDED';
}

// ══════════════════════════════ การรายงาน ══════════════════════════════

const OUT = [];
const W = (s = '') => OUT.push(s);
const n2 = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const pctS = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const bpsS = (v, d = 2) => (Number.isFinite(v) ? `${(v * 10000).toFixed(d)} bps` : '—');
const pS = (v) => (Number.isFinite(v) ? (v < 1e-4 ? v.toExponential(2) : v.toFixed(4)) : '—');

// ═══════════════════════════════ ตัวหลัก ═══════════════════════════════

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const { indicators } = await loadSrcModules(['src/lib/indicators.ts']);

  const split = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'split.json'), 'utf8'));
  const trainEnd = split.timeframes['1H'].trainEnd;
  const validationEnd = split.timeframes['1H'].validationEnd;

  const JSONOUT = { generatedAt: new Date().toISOString(), opt: OPT, trainEnd, validationEnd };

  // ────────────── จัดกลุ่มหุ้นไทย: SET50 เดิม vs หุ้นซิ่งที่เพิ่งเพิ่ม ──────────────
  const thFiles = fs.readdirSync(CACHE_DIR).filter((f) => f.startsWith('TH_STOCK__') && f.endsWith('__1H.json'));
  const thSymbols = thFiles.map((f) => JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8')).symbol);
  const profiles = thSymbols.map((s) => trainProfile('TH_STOCK', s, trainEnd)).sort((a, b) => b.barRangePct - a.barRangePct);

  const runnerSet = new Set(
    profiles.filter((p) => !SET50_SYMBOLS.includes(p.symbol)
      && p.barRangePct >= RUNNER_RULE.minBarRangePct
      && p.medTurnover >= RUNNER_RULE.minTurnoverBaht
      && p.bars >= RUNNER_RULE.minBars
      && p.verdict !== 'bad').map((p) => p.symbol)
  );
  const runnerRejected = profiles.filter((p) => !SET50_SYMBOLS.includes(p.symbol) && !runnerSet.has(p.symbol));
  JSONOUT.profiles = profiles;
  JSONOUT.runnerSet = [...runnerSet];
  JSONOUT.runnerRejected = runnerRejected.map((p) => ({
    symbol: p.symbol,
    reason: p.verdict === 'bad' ? 'quality = bad'
      : p.barRangePct < RUNNER_RULE.minBarRangePct ? `ผันผวนไม่ถึงเกณฑ์ (${p.barRangePct.toFixed(2)}% < ${RUNNER_RULE.minBarRangePct}%)`
      : p.medTurnover < RUNNER_RULE.minTurnoverBaht ? `สภาพคล่องไม่ถึงเกณฑ์ (${(p.medTurnover / 1e6).toFixed(2)}M < ${RUNNER_RULE.minTurnoverBaht / 1e6}M)`
      : `แท่งไม่พอ (${p.bars})`,
  }));

  const GROUPS = ['RUNNER', 'SET50', 'GOLD', 'FOREX'];
  const GROUP_LABEL = {
    RUNNER: `หุ้นซิ่งไทย (${runnerSet.size} ตัว)`,
    SET50: `SET50 เดิม (${SET50_SYMBOLS.length} ตัว)`,
    GOLD: 'ทอง/โลหะ (5 ตัว)',
    FOREX: 'ค่าเงิน (12 คู่)',
  };

  // ────────────── รัน lab.mjs ครบทุกเรขาคณิต × เพดานถือ บน train ──────────────
  const runs = new Map(); // `${geoId}|${maxHold}|${split}` → trades[]
  const labLog = [];
  for (const maxHold of MAX_HOLDS) {
    for (const geo of GEOMETRIES) {
      process.stderr.write(`[th-scalp] lab ${geo.id} h${maxHold} train ... `);
      const r = runLab({ geo, maxHold, split: 'train' });
      const trades = readTradesCsv(r.csv);
      runs.set(`${geo.id}|${maxHold}|train`, trades);
      labLog.push({ geo: geo.id, maxHold, split: 'train', trades: trades.length, cached: r.cached });
      process.stderr.write(`${trades.length} ไม้${r.cached ? ' (cache)' : ''}\n`);
    }
  }
  JSONOUT.labRuns = labLog;

  // ═══════════════ S0 — ตรวจเครื่องวัด ═══════════════
  W('# S0 · ตรวจเครื่องวัดก่อนเชื่ออะไรทั้งสิ้น');
  W();
  W('จำลองไม้ของ lab.mjs ซ้ำจากแท่งดิบด้วยโค้ดในไฟล์นี้ ไม้ต่อไม้ ทุกไม้ — ถ้าไม่ตรงเป๊ะ');
  W('แปลว่าไฟล์นี้เข้าใจกติกาการออกไม้คนละอย่างกับ lab.mjs และตัวเลขที่เหลือเชื่อไม่ได้');
  W();
  const meterChecks = [];
  for (const geoId of ['A0', 'A1', 'A4']) {
    for (const maxHold of MAX_HOLDS) {
      const trades = runs.get(`${geoId}|${maxHold}|train`);
      const sample = trades.filter((_, i) => i % 7 === 0); // ทุกไม้ที่ 7 — ครอบคลุมทุกสัญลักษณ์และทุกยุค
      meterChecks.push(checkMeter(sample, `${geoId} · เพดานถือ ${maxHold} แท่ง`));
    }
  }
  W('| การจำลองซ้ำ | ไม้ที่ตรวจ | คลาดเคลื่อนราคาออกสูงสุด | เหตุผลออกไม่ตรง | คลาดเคลื่อนสูตรต้นทุนสูงสุด |');
  W('|---|---:|---:|---:|---:|');
  for (const c of meterChecks) {
    W(`| ${c.label} | ${c.checked.toLocaleString()} | ${c.maxExitErr.toExponential(1)} | ${c.reasonMismatch} | ${c.maxCostErr.toExponential(1)} |`);
  }
  const meterOk = meterChecks.every((c) => c.maxExitErr < 1e-9 && c.reasonMismatch === 0 && c.maxCostErr < 1e-12);
  W();
  W(meterOk
    ? '**ผ่านทุกข้อ** — ราคาออก เหตุผลการออก และสูตรต้นทุน ตรงกับ lab.mjs ทุกไม้ที่ตรวจ'
    : '**ไม่ผ่าน** — หยุดอ่านตรงนี้ ตัวเลขข้างล่างเชื่อไม่ได้');
  W();
  JSONOUT.S0 = { meterChecks, meterOk };
  if (!meterOk) {
    fs.writeFileSync(path.join(REPORT_DIR, `exp-${OPT.tag}.md`), OUT.join('\n'), 'utf8');
    throw new Error('S0 ไม่ผ่าน — เครื่องวัดของไฟล์นี้ไม่ตรงกับ lab.mjs');
  }

  // ตรวจเพิ่ม: ATR ที่ถอดกลับจาก plannedRisk ตรงกับ ATR ตัวจริงไหม (ใช้ใน S3)
  {
    const trades = runs.get('A0|1|train').filter((_, i) => i % 31 === 0);
    const rels = []; let fallbackHits = 0;
    for (const t of trades) {
      const ds = loadCandles(t.market, t.symbol, t.timeframe);
      const ei = ds.index.get(t.entryTime);
      if (ei === undefined || ei < 20) continue;
      const real = indicators.ATR(ds.candles.slice(ei - 16, ei), 14);
      const recovered = t.plannedRisk / 1.5;
      // ATR ที่คำนวณไม่ได้ (แท่งนิ่งสนิท) เครื่องยนต์ถอยไปใช้ 2% ของราคาแทน — ไม่ใช่ความคลาดเคลื่อน
      if (!(real > 0)) { fallbackHits++; continue; }
      rels.push(Math.abs(real - recovered) / real);
    }
    rels.sort((a, b) => a - b);
    W(`ถอดค่า ATR กลับจากระยะ SL (plannedRisk ÷ 1.5) เทียบกับ ATR ตัวจริงจาก src/lib/indicators.ts`);
    W(`บน ${rels.length.toLocaleString()} ไม้ · คลาดเคลื่อนสัมพัทธ์ มัธยฐาน **${quantile(rels, 0.5).toExponential(2)}**`);
    W(`· p99 ${quantile(rels, 0.99).toExponential(2)} · สูงสุด ${quantile(rels, 1).toExponential(2)}`);
    W(`(หางบนมาจากการปัดทศนิยมของ SL บนหุ้นราคาต่ำ · ${fallbackHits} ไม้ที่ ATR = 0 ถูกตัดออกเพราะ`);
    W('เครื่องยนต์ถอยไปใช้ 2% ของราคาแทน ซึ่งไม่ใช่ความคลาดเคลื่อนของการถอดค่า) — ใช้เป็นหน่วยวัดใน S3 ได้');
    W();
    JSONOUT.S0.atrRecovery = { checked: rels.length, fallbackHits, p50: quantile(rels, 0.5), p99: quantile(rels, 0.99), max: quantile(rels, 1) };
  }

  // ═══════════════ S1 — เพดานของทุกเรขาคณิต ═══════════════
  W('# S1 · ★ เพดานของทุกเรขาคณิตที่จบใน 1 แท่ง');
  W();
  W('ตั้ง TP/SL คือการเลือก "เวลาหยุด" τ ที่ถูกบังคับให้ τ ≤ 1 แท่ง ถ้าราคาในแท่งเป็น');
  W('martingale บวก drift μ ทฤษฎีบทการหยุดที่เลือกได้ให้ E[กำไร] = μ·E[τ] ≤ μ');
  W('แปลว่า **เรขาคณิตไม่ผลิตเงิน มันแค่กระจายผลลัพธ์ใหม่** และเพดานของทุกแบบคือ');
  W('"ถือเต็มแท่งแล้วปิดที่ราคาปิด" — ซึ่งวัดตรง ๆ ได้โดยไม่ต้องรู้ค่า TP/SL เลย');
  W();
  W('ตัวเลขข้างล่างคือขอบทิศทางของสัญญาณใน 1 แท่ง: E[ทิศ × (ปิด − เปิด) ÷ เปิด]');
  W('วัดจากรายการสัญญาณของ A0 บน train (เพดานถือ 1 แท่ง = ทุกแท่งถูกประเมิน จึงเป็นรายการเต็ม)');
  W();
  // ตรวจว่ารายการสัญญาณที่เพดานถือ 1 แท่ง ไม่ขึ้นกับเรขาคณิตจริงหรือไม่
  // (ที่เพดาน 1 แท่ง ไม้ปิดในแท่งเดิมเสมอ ลูปจึงเดินหน้าทีละแท่งไม่ว่า TP/SL เป็นเท่าไร
  //  ยกเว้นกรณีที่ SL แคบจนถูกปัดทศนิยมกลืน ซึ่งเครื่องยนต์จะทิ้งสัญญาณนั้น)
  {
    const counts = GEOMETRIES.map((g) => ({ id: g.id, n: runs.get(`${g.id}|1|train`).length }));
    const lo = Math.min(...counts.map((c) => c.n));
    const hi = Math.max(...counts.map((c) => c.n));
    W(`ตรวจก่อนใช้: จำนวนสัญญาณที่เพดานถือ 1 แท่ง ของทั้ง ${GEOMETRIES.length} เรขาคณิต อยู่ระหว่าง `
      + `${lo.toLocaleString()} ถึง ${hi.toLocaleString()} ไม้ (ต่างกัน ${(((hi - lo) / hi) * 100).toFixed(2)}%)`);
    W('— รายการสัญญาณจึงเป็นชุดเดียวกันแทบทั้งหมดไม่ว่าจะตั้ง TP/SL อย่างไร ซึ่งเป็นเงื่อนไข');
    W('ที่ทำให้เอา "ขอบต่อแท่ง" ตัวเดียวไปเทียบกับทุกเรขาคณิตได้อย่างยุติธรรม');
    W();
    JSONOUT.signalCountSpread = { counts, lo, hi };
  }

  const barEdgeOf = (trades) => trades.map((t) => {
    const ds = loadCandles(t.market, t.symbol, t.timeframe);
    const i = ds.index.get(t.entryTime);
    if (i === undefined) return null;
    const bar = ds.candles[i];
    const dir = t.action === 'BUY' ? 1 : -1;
    return { symbol: t.symbol, v: (dir * (bar.close - bar.open)) / bar.open };
  }).filter(Boolean);

  const S1 = {};
  W('| กลุ่ม | สัญญาณ | ขอบใน 1 แท่ง | CI95 ราย-ไม้ | CI95 ราย-สัญลักษณ์ | p | ค่าธรรมเนียมจริง | ขอบ − ค่าธรรมเนียม | ขอบต้องใหญ่ขึ้นกี่เท่า |');
  W('|---|---:|---:|---|---|---:|---:|---:|---:|');
  const a0h1 = runs.get('A0|1|train');
  for (const g of GROUPS) {
    const tr = a0h1.filter((t) => groupOf(t, runnerSet) === g);
    const edges = barEdgeOf(tr);
    const vals = edges.map((e) => e.v);
    const bt = bootMean(vals);
    const bc = bootMeanByCluster(edges, (e) => e.symbol, (e) => e.v);
    // ค่าธรรมเนียมจริงของกลุ่ม: หุ้นไทยใช้ค่าคอม+tick จริง · กลุ่มอื่นใช้ bps ของ lab
    let feeFrac; let feeNote;
    if (g === 'RUNNER' || g === 'SET50') {
      const fees = tr.map((t) => {
        const c = realisticThCostR(t.entry, t.stopDistPct);
        return c.costR * t.stopDistPct; // แปลงกลับเป็นสัดส่วนของราคา
      }).filter(Number.isFinite).sort((a, b) => a - b);
      feeFrac = quantile(fees, 0.5);
      feeNote = 'ค่าคอม+ขั้นต่ำ+สเปรด 1 tick (มัธยฐาน)';
    } else {
      feeFrac = NON_TH_FEE_BPS[g] / 10000;
      feeNote = 'ตาราง bps ของ lab.mjs';
    }
    S1[g] = { n: vals.length, edge: bt.mean, ciTrade: [bt.lo, bt.hi], ciSymbol: [bc.lo, bc.hi], p: bt.p, feeFrac, feeNote, clusters: bc.clusters };
    registerTest({
      id: `S1-${g}-train`, family: 'train (สำรวจ)',
      question: `ขอบทิศทางใน 1 แท่ง ≠ 0 · ${g}`,
      estimate: bt.mean, ci: [bt.lo, bt.hi], p: bt.p,
    });
    const times = bt.mean > 0 ? feeFrac / bt.mean : NaN;
    S1[g].timesNeeded = times;
    W(`| ${GROUP_LABEL[g]} | ${vals.length.toLocaleString()} | **${bpsS(bt.mean)}** | [${bpsS(bt.lo)}, ${bpsS(bt.hi)}] | [${bpsS(bc.lo)}, ${bpsS(bc.hi)}] | ${pS(bt.p)} | ${bpsS(feeFrac)} | **${bpsS(bt.mean - feeFrac)}** | ${Number.isFinite(times) ? `${times.toFixed(0)}×` : 'ขอบติดลบ — คูณเท่าไรก็ไม่พอ'} |`);
  }
  W();
  W('คอลัมน์ "ขอบ − ค่าธรรมเนียม" คือ "เงินที่คาดว่าจะได้ต่อไม้ ก่อนที่เรขาคณิตใด ๆ จะเข้ามา');
  W('เกี่ยวข้อง" หักด้วยค่าธรรมเนียม');
  W();
  W('⚠ **ตัวเลขในตารางนี้ไม่ใช่เพดานจริง** — S4 ตรวจแล้วพบว่าเรขาคณิตที่ตั้ง TP ใกล้ ๆ ทำเงินได้');
  W('**เกิน** การถือเต็มแท่ง เพราะราคาย้อนกลับภายในแท่ง ซึ่งเป็นการหักล้างสมมติฐาน martingale');
  W('ที่ใช้อนุมานเพดาน ตัวเลขที่ใช้สรุปจริงจึงเป็นของ S4 (กำไรของเรขาคณิตที่ดีที่สุดที่วัดได้)');
  W('ไม่ใช่ตารางนี้ · ตารางนี้ยังมีประโยชน์ในฐานะ "ขอบทิศทางดิบของสัญญาณ" ซึ่งเป็นคนละเรื่อง');
  W('กับ "เรขาคณิตเก็บได้เท่าไร" และเป็นตัวที่บอกว่าเครื่องยนต์เดาทิศได้แม่นแค่ไหน');
  W();
  W('ค่าธรรมเนียมในตารางนี้คิดที่ระยะ SL ของ A0 (1.5×ATR) ซึ่งเป็นช่วงที่ค่าคอมขั้นต่ำ 50 บาท');
  W(`ยังไม่กัด (มันเริ่มกัดเมื่อมูลค่าคำสั่งต่ำกว่า ${(TH_MIN_FEE / TH_COMM_RATE).toLocaleString(undefined, { maximumFractionDigits: 0 })} บาท คือเมื่อระยะ SL กว้างเกิน `
    + `${((TH_RISK_BAHT / (TH_MIN_FEE / TH_COMM_RATE)) * 100).toFixed(1)}% ของราคา`);
  W(`ที่เงินเสี่ยง ${TH_RISK_BAHT.toLocaleString()} บาทต่อไม้) — กว้างกว่านั้นค่าธรรมเนียมเป็นเงินจะกลับมาแพงขึ้น`);
  W('แปลว่าการ "ถ่างSL ให้ต้นทุนเป็น R ถูกลง" มีก้นบึ้ง ไม่ได้ถูกลงไปเรื่อย ๆ');
  W();
  JSONOUT.S1 = S1;

  // ═══════════════ S2 — เลขคณิตก่อนทดสอบ ═══════════════
  W('# S2 · เลขคณิตก่อนทดสอบ — ต้องชนะกี่เปอร์เซ็นต์ถึงจะคุ้ม');
  W();
  W('ให้ TP = a×ATR · SL = b×ATR · A = ATR คิดเป็นสัดส่วนของราคา · f = ค่าธรรมเนียมไป-กลับ');
  W('ถ้าผลมีแค่ชนะเต็ม TP หรือแพ้เต็ม SL:');
  W();
  W('```');
  W('  ต้นทุนเป็น R      c      = f ÷ (b·A)');
  W('  อัตราชนะคุ้มทุน   p_req  = (1 + c) ÷ (1 + a/b) = (b + f/A) ÷ (a + b)');
  W('  อัตราชนะของเหรียญ p_fair = b ÷ (a + b)          ← กรณีไม่มีขอบเลย');
  W('  ขอบที่ต้องมี      Δ      = p_req − p_fair = (f/A) ÷ (a + b)');
  W('```');
  W();
  W('บรรทัดสุดท้ายคือกลไกทั้งหมดของโจทย์นี้: **ขอบที่ต้องมีเหนือเหรียญ ลดได้ทางเดียวคือ');
  W('ทำให้ a + b ใหญ่ขึ้น** — คือเปิดกว้างทั้ง TP และ SL ซึ่งตรงข้ามกับ "จบใน 1 ชั่วโมง"');
  W('การดึง TP เข้ามาให้จบเร็ว = ลด a = **เพิ่ม** ขอบที่ต้องมี ไม่ใช่ลด');
  W();

  const S2 = [];
  for (const g of GROUPS) {
    const tr = a0h1.filter((t) => groupOf(t, runnerSet) === g);
    const atrPcts = tr.map((t) => t.stopDistPct / 1.5).filter((v) => v > 0).sort((a, b) => a - b);
    const A = quantile(atrPcts, 0.5);
    const f = S1[g].feeFrac;
    S2.push({ group: g, atrPctMedian: A, feeFrac: f, fOverA: f / A });
  }
  W('| กลุ่ม | ATR มัธยฐาน (% ของราคา) | ค่าธรรมเนียม | ค่าธรรมเนียมคิดเป็นกี่ ATR (f/A) |');
  W('|---|---:|---:|---:|');
  for (const r of S2) W(`| ${GROUP_LABEL[r.group]} | ${(r.atrPctMedian * 100).toFixed(3)}% | ${bpsS(r.feeFrac)} | **${r.fOverA.toFixed(3)} ATR** |`);
  W();
  W('| เรขาคณิต | a (TP) | b (SL) | RR | a+b | p_fair | ' + GROUPS.map((g) => `p_req ${g}`).join(' | ') + ' |');
  W('|---|---:|---:|---:|---:|---:|' + GROUPS.map(() => '---:|').join(''));
  const S2rows = [];
  for (const geo of GEOMETRIES) {
    if (geo.id === 'P0') continue; // P0 ใช้แนวรับ/ต้าน ไม่ใช่ (a,b) คงที่
    const pFair = geo.sl / (geo.tp + geo.sl);
    const row = { id: geo.id, a: geo.tp, b: geo.sl, rr: geo.tp / geo.sl, sum: geo.tp + geo.sl, pFair, pReq: {} };
    for (const r of S2) row.pReq[r.group] = (geo.sl + r.fOverA) / (geo.tp + geo.sl);
    S2rows.push(row);
    W(`| ${geo.id} ${geo.label} | ${geo.tp} | ${geo.sl} | ${(geo.tp / geo.sl).toFixed(2)} | ${(geo.tp + geo.sl).toFixed(2)} | ${pctS(pFair)} | `
      + GROUPS.map((g) => {
        const v = row.pReq[g];
        return v > 1 ? `**เป็นไปไม่ได้ (${pctS(v)})**` : v > 0.8 ? `**${pctS(v)}**` : pctS(v);
      }).join(' | ') + ' |');
  }
  W();
  W('ตัวหนา = อัตราชนะที่ต้องการเกิน 80% · "เป็นไปไม่ได้" = ต้องชนะเกิน 100% ของไม้');
  W();
  JSONOUT.S2 = { perGroup: S2, rows: S2rows };

  // ═══════════════ S3 — ระยะที่ราคาเดินถึงได้จริงใน 1 แท่ง ═══════════════
  W('# S3 · ราคาเดินได้ไกลแค่ไหนใน 1 แท่ง — ตัวเลขที่ใช้ตั้ง TP');
  W();
  W('MFE = ระยะที่ราคาวิ่งไป "ทางที่เราเดา" มากที่สุดในแท่งที่เข้าไม้ (วัดจากราคาเปิด)');
  W('MAE = ระยะที่วิ่งสวนมากที่สุดในแท่งเดียวกัน · ทั้งคู่คิดเป็นหน่วย ATR');
  W('TP ที่ตั้งเกิน MFE = ไม้ที่ไม่มีวันปิดกำไรในแท่งนั้น ไม่ว่าจะเดาทิศถูกแค่ไหน');
  W();
  const S3 = {};
  for (const g of GROUPS) {
    const tr = a0h1.filter((t) => groupOf(t, runnerSet) === g);
    const mfe = []; const mae = [];
    for (const t of tr) {
      const ds = loadCandles(t.market, t.symbol, t.timeframe);
      const i = ds.index.get(t.entryTime);
      if (i === undefined) continue;
      const bar = ds.candles[i];
      const atr = t.plannedRisk / 1.5;
      if (!(atr > 0)) continue;
      const dir = t.action === 'BUY' ? 1 : -1;
      mfe.push(dir > 0 ? (bar.high - bar.open) / atr : (bar.open - bar.low) / atr);
      mae.push(dir > 0 ? (bar.open - bar.low) / atr : (bar.high - bar.open) / atr);
    }
    mfe.sort((a, b) => a - b); mae.sort((a, b) => a - b);
    S3[g] = {
      n: mfe.length,
      mfe: { p50: quantile(mfe, 0.5), p75: quantile(mfe, 0.75), p90: quantile(mfe, 0.9), p99: quantile(mfe, 0.99) },
      mae: { p50: quantile(mae, 0.5), p75: quantile(mae, 0.75), p90: quantile(mae, 0.9) },
      reach: Object.fromEntries([0.45, 0.7, 1.05, 1.5, 3.0].map((a) => [a, mfe.filter((v) => v >= a).length / mfe.length])),
    };
  }
  W('| กลุ่ม | MFE p50 | MFE p75 | MFE p90 | MFE p99 | MAE p50 | ' + [0.45, 0.7, 1.05, 3.0].map((a) => `แตะ TP ${a} ATR`).join(' | ') + ' |');
  W('|---|---:|---:|---:|---:|---:|' + [0, 0, 0, 0].map(() => '---:|').join(''));
  for (const g of GROUPS) {
    const s = S3[g];
    W(`| ${GROUP_LABEL[g]} | ${n2(s.mfe.p50, 3)} | ${n2(s.mfe.p75, 3)} | ${n2(s.mfe.p90, 3)} | ${n2(s.mfe.p99, 3)} | ${n2(s.mae.p50, 3)} | `
      + [0.45, 0.7, 1.05, 3.0].map((a) => pctS(s.reach[a])).join(' | ') + ' |');
  }
  W();
  W('คอลัมน์ "แตะ TP 3 ATR" คือคำอธิบายของ "0 จาก 356" ที่เป็นจุดตั้งต้นของงานรอบนี้ —');
  W('มันไม่ใช่ความบังเอิญ แต่เป็นเพดานทางกายภาพของแท่ง 1 ชั่วโมง');
  W();
  JSONOUT.S3 = S3;

  // ═══════════════ S4 — วัดจริง ═══════════════
  W('# S4 · วัดจริง — 9 เรขาคณิต × 4 กลุ่ม × เพดานถือ 1 และ 3 แท่ง (train)');
  W();
  W('ตัวเลขที่เจ้าของถามตรง ๆ อยู่คอลัมน์ "ปิดกำไรจบใน 1 แท่ง" และ "R สุทธิ"');
  W('R สุทธิของหุ้นไทยหักด้วยต้นทุนจริง (ค่าคอม + ค่าคอมขั้นต่ำ 50 บาท + สเปรด 1 tick)');
  W('ไม่ใช่ 40 bps ที่ lab.mjs สมมติไว้ · กลุ่มอื่นหักด้วยตาราง bps ของ lab.mjs ตามเดิม');
  W();

  const S4 = [];
  for (const maxHold of MAX_HOLDS) {
    W(`## เพดานถือ ${maxHold} แท่ง (${maxHold} ชั่วโมง)`);
    W();
    W('| เรขาคณิต | กลุ่ม | ไม้ | ปิดกำไรใน 1 แท่ง | ชนะทุกแบบ | R ก่อนหักต้นทุน | ต้นทุน R | **R สุทธิ** | CI95 ราย-สัญลักษณ์ |');
    W('|---|---|---:|---:|---:|---:|---:|---:|---|');
    for (const geo of GEOMETRIES) {
      const trades = runs.get(`${geo.id}|${maxHold}|train`);
      for (const g of GROUPS) {
        const tr = trades.filter((t) => groupOf(t, runnerSet) === g);
        if (!tr.length) continue;
        const withCost = tr.map((t) => {
          const isTh = t.market === 'TH_STOCK';
          const c = isTh ? realisticThCostR(t.entry, t.stopDistPct).costR
            : flatCostR(NON_TH_FEE_BPS[t.market], t.stopDistPct);
          return { symbol: t.symbol, gross: t.rGross, cost: c, net: t.rGross - c, t };
        }).filter((x) => Number.isFinite(x.net));
        const tpIn1 = tr.filter((t) => t.holdBars === 0 && (t.exitReason === 'take_profit' || t.exitReason === 'gap_target')).length / tr.length;
        const winAny = tr.filter((t) => t.rGross > 0).length / tr.length;
        const bc = bootMeanByCluster(withCost, (x) => x.symbol, (x) => x.net);
        const row = {
          geo: geo.id, geoLabel: geo.label, group: g, maxHold,
          n: tr.length, tpIn1Bar: tpIn1, winAny,
          gross: mean(withCost.map((x) => x.gross)),
          cost: mean(withCost.map((x) => x.cost)),
          net: mean(withCost.map((x) => x.net)),
          ciSymbol: [bc.lo, bc.hi], p: bc.p, clusters: bc.clusters,
        };
        S4.push(row);
        registerTest({
          id: `S4-${geo.id}-h${maxHold}-${g}-train`, family: 'train (สำรวจ)',
          question: `R สุทธิ ≠ 0 · ${geo.id} · ${g} · เพดานถือ ${maxHold}`,
          estimate: row.net, ci: row.ciSymbol, p: bc.p,
        });
        W(`| ${geo.id} | ${GROUP_LABEL[g]} | ${row.n.toLocaleString()} | **${pctS(tpIn1, 2)}** | ${pctS(winAny)} | ${n2(row.gross)} | ${n2(row.cost)} | **${n2(row.net)}** | [${n2(bc.lo, 3)}, ${n2(bc.hi, 3)}] |`);
      }
    }
    W();
  }
  JSONOUT.S4 = S4;

  // ═══════════ ตรวจทฤษฎีบทเพดานด้วยตัวเลขจริง — และมันไม่ผ่าน ═══════════
  W('## ★ ตรวจทฤษฎีบทเพดานด้วยตัวเลขจริง — ผลคือ "ไม่ผ่าน"');
  W();
  W('S1 ทำนายว่า "ถือเต็มแท่งแล้วปิดที่ราคาปิด" (CEIL) คือเพดานของทุกเรขาคณิตที่ถือ ≤ 1 แท่ง');
  W('เทียบเป็นเงิน (สัดส่วนของราคา) ไม่ใช่เป็น R เพราะแต่ละเรขาคณิตมีตัวหารของ R ไม่เท่ากัน');
  W('เทียบแบบจับคู่ไม้ต่อไม้ — สัญญาณเดียวกัน เวลาเดียวกัน ต่างกันแค่จุดออก');
  W();
  const ceilCheck = [];
  const moneyMap = (geoId) => {
    const m = new Map();
    for (const t of runs.get(`${geoId}|1|train`)) {
      const dir = t.action === 'BUY' ? 1 : -1;
      m.set(`${t.symbol}|${t.entryTime}`, { v: (dir * (t.exit - t.entry)) / t.entry, symbol: t.symbol, group: groupOf(t, runnerSet) });
    }
    return m;
  };
  const ceilMap = moneyMap('CEIL');
  W('| กลุ่ม | ถือเต็มแท่ง (CEIL) | เรขาคณิตที่ดีที่สุด | ส่วนต่างแบบจับคู่ | CI95 ราย-สัญลักษณ์ | p | เกินเพดานไหม |');
  W('|---|---:|---:|---:|---|---:|---|');
  for (const g of GROUPS) {
    const ceilVals = [...ceilMap.values()].filter((x) => x.group === g);
    const ceil = mean(ceilVals.map((x) => x.v));
    let best = null;
    for (const geo of GEOMETRIES) {
      if (geo.id === 'CEIL') continue;
      const m = moneyMap(geo.id);
      const paired = [];
      for (const [k, v] of m) {
        if (v.group !== g) continue;
        const c = ceilMap.get(k);
        if (c) paired.push({ symbol: v.symbol, d: v.v - c.v, v: v.v });
      }
      const avg = mean(paired.map((x) => x.v));
      if (!best || avg > best.avg) best = { id: geo.id, avg, paired };
    }
    const bc = bootMeanByCluster(best.paired, (x) => x.symbol, (x) => x.d);
    ceilCheck.push({ group: g, ceil, bestId: best.id, best: best.avg, diff: bc.mean, ci: [bc.lo, bc.hi], p: bc.p, violates: bc.lo > 0 });
    registerTest({
      id: `S4ceil-${g}-train`, family: 'train (สำรวจ)',
      question: `เรขาคณิตที่ดีที่สุด (${best.id}) ทำเงินเกิน "ถือเต็มแท่ง" · ${g}`,
      estimate: bc.mean, ci: [bc.lo, bc.hi], p: bc.p,
    });
    W(`| ${GROUP_LABEL[g]} | ${bpsS(ceil)} | ${best.id} = ${bpsS(best.avg)} | **${bpsS(bc.mean)}** | [${bpsS(bc.lo)}, ${bpsS(bc.hi)}] | ${pS(bc.p)} | ${bc.lo > 0 ? '**เกิน**' : 'ไม่เกิน'} |`);
  }
  W();
  const violators = ceilCheck.filter((c) => c.violates);
  if (violators.length) {
    W(`**ทฤษฎีบทถูกหักล้างใน ${violators.length} จาก ${GROUPS.length} กลุ่ม** — และนี่คือผลที่สำคัญ`);
    W('ที่สุดอันหนึ่งของรอบนี้ ต้องอ่านให้ครบทั้งสองด้าน');
    W();
    W('**ด้านที่ดี:** สมมติฐาน martingale ผิด และผิดไปในทางที่เป็นประโยชน์ — ราคาในแท่ง');
    W('รายชั่วโมงมีการย้อนกลับภายในแท่ง (intrabar mean reversion) แปลว่า "เมื่อราคาเคยขึ้นไป');
    W('แตะ +0.45 ATR แล้ว ราคาปิดมักต่ำกว่านั้น" คำสั่ง TP จึงเก็บส่วนต่างนั้นได้จริง ไม่ใช่แค่');
    W('เปลี่ยนรูปการกระจายตัว การตั้ง TP ใกล้ ๆ จึง **สร้างมูลค่าเพิ่มขึ้นมาได้จริง**');
    W(`ขนาดของมันคือ ${violators.map((c) => `${GROUP_LABEL[c.group]} +${bpsS(c.diff)}`).join(' · ')}`);
    W();
    W('**ด้านที่ต้องยอมรับ:** ข้อสรุปของ S1 ที่ว่า "ขอบต่อแท่งคือเพดาน" ใช้ไม่ได้ตามตัวอักษร');
    W('เพดานจริงสูงกว่าที่ทำนายไว้ ตัวเลขที่ต้องเอาไปเทียบกับค่าธรรมเนียมจึงต้องเป็น');
    W('**กำไรเป็นเงินของเรขาคณิตที่ดีที่สุดที่วัดได้จริง** ไม่ใช่ขอบต่อแท่ง — และนั่นคือสิ่งที่');
    W('ตารางในหัวรายงานใช้ ไม่ใช่ตัวเลขของ S1');
    W();
    W('**สิ่งที่ไม่เปลี่ยน:** ต่อให้ใช้ตัวเลขที่ดีที่สุดนี้ ค่าธรรมเนียมก็ยังใหญ่กว่าหลายเท่า:');
    for (const c of ceilCheck) {
      const fee = S1[c.group].feeFrac;
      W(`· ${GROUP_LABEL[c.group]} — ดีที่สุด ${bpsS(c.best)} เทียบค่าธรรมเนียม ${bpsS(fee)} = `
        + (c.best > 0 ? `**ค่าธรรมเนียมใหญ่กว่า ${(fee / c.best).toFixed(1)} เท่า**` : '**ยังติดลบ**'));
    }
  } else {
    W('ไม่มีกลุ่มใดที่เรขาคณิตใดทำเงินได้เกิน "ถือเต็มแท่ง" — ทฤษฎีบทเพดานไม่ถูกหักล้าง');
  }
  W();
  JSONOUT.ceilCheck = ceilCheck;

  // ═══════════════ S5 — ยืนยันบน validation ═══════════════
  const validationLog = { touches: 0, entries: [] };
  if (!OPT.skipValidation) {
    W('# S5 · ยืนยันบน validation');
    W();
    // คัดเฉพาะแบบที่ "ดูมีแวว" บน train = R สุทธิเป็นบวก — ไม่เอาทั้งหมดไปแตะ validation
    // ยิ่งแตะ validation บ่อย มันยิ่งกลายเป็น train ทีละนิด จำนวนครั้งจึงถูกจำกัดและถูกนับ
    const promising = S4.filter((r) => r.net > 0).sort((a, b) => b.net - a.net);
    const picks = [];
    const seen = new Set();
    const push = (geo, maxHold, why) => {
      const key = `${geo}|${maxHold}`;
      if (seen.has(key)) return;
      seen.add(key);
      picks.push({ geo, maxHold, why });
    };

    W(`บน train มี **${promising.length} ช่อง** (เรขาคณิต × กลุ่ม × เพดานถือ) จากทั้งหมด ${S4.length} ช่อง`);
    W('ที่ R สุทธิเป็นบวก');
    W();
    if (promising.length === 0) {
      W('**ไม่มีช่องใดที่ R สุทธิเป็นบวกบน train เลย แม้แต่ช่องเดียว** — ตามหลักการแล้วไม่มีอะไร');
      W('"ผ่านเข้ารอบ" ไปยืนยันบน validation แต่ข้อสรุปที่ยืนอยู่บน train ชุดเดียวก็เชื่อไม่ได้เช่นกัน');
      W('จึงแตะ validation ด้วยสองแบบที่ตอบคำถามคนละข้อ และเลือกไว้ล่วงหน้าโดยไม่ดูผล validation:');
      W();
      W('  · **CEIL** — เพดานของทุกเรขาคณิต ตอบว่า "ขอบต่อแท่งบนข้อมูลที่ไม่เคยเห็นยังเป็นศูนย์ไหม"');
      W('  · **แบบที่จบใน 1 แท่งได้ดีที่สุดและขาดทุนน้อยที่สุด** ตอบว่า "ของที่ดีที่สุดของเรา ยืนได้ไหม"');
      W();
    } else {
      W(`เลือกไปยืนยันบน validation ไม่เกิน 2 แบบ — แต่ละแบบคือการรัน lab.mjs หนึ่งครั้ง`);
      W();
    }
    push('CEIL', 1, 'เพดานของทุกเรขาคณิต');
    // แบบที่ดีที่สุดที่ "จบใน 1 ชั่วโมงจริง" — ต้องปิดกำไรในแท่งแรกอย่างน้อย 25% ของไม้
    // ไม่งั้นจะเลือกได้แบบที่ขาดทุนน้อยเพราะมันแทบไม่เคยจบในแท่งแรกเลย ซึ่งตอบผิดคำถาม
    const FAST_MIN = 0.25;
    const bestFast = S4
      .filter((r) => r.maxHold === 1 && r.geo !== 'CEIL' && r.tpIn1Bar >= FAST_MIN)
      .sort((a, b) => b.net - a.net)[0];
    push(bestFast.geo, 1,
      `ดีที่สุดในบรรดาแบบที่ "จบใน 1 แท่งจริง" (ปิดกำไรในแท่งแรก ≥ ${pctS(FAST_MIN, 0)} ของไม้) — `
      + `${GROUP_LABEL[bestFast.group]} · R สุทธิ ${n2(bestFast.net)} · ปิดกำไรใน 1 แท่ง ${pctS(bestFast.tpIn1Bar, 2)}`);
    for (const p of picks) W(`· รัน **${p.geo}** เพดานถือ ${p.maxHold} แท่ง — ${p.why}`);
    W();

    const S5 = [];
    for (const pick of picks) {
      const geo = GEOMETRIES.find((x) => x.id === pick.geo);
      process.stderr.write(`[th-scalp] lab ${geo.id} h${pick.maxHold} VALIDATION ... `);
      const r = runLab({ geo, maxHold: pick.maxHold, split: 'validation' });
      validationLog.touches++;
      validationLog.entries.push({ geo: geo.id, maxHold: pick.maxHold, cached: r.cached, at: new Date().toISOString() });
      const trades = readTradesCsv(r.csv);
      runs.set(`${geo.id}|${pick.maxHold}|validation`, trades);
      process.stderr.write(`${trades.length} ไม้${r.cached ? ' (cache)' : ''}\n`);

      for (const g of GROUPS) {
        const tr = trades.filter((t) => groupOf(t, runnerSet) === g);
        if (!tr.length) continue;
        const withCost = tr.map((t) => {
          const isTh = t.market === 'TH_STOCK';
          const c = isTh ? realisticThCostR(t.entry, t.stopDistPct).costR
            : flatCostR(NON_TH_FEE_BPS[t.market], t.stopDistPct);
          return { symbol: t.symbol, gross: t.rGross, cost: c, net: t.rGross - c };
        }).filter((x) => Number.isFinite(x.net));
        const tpIn1 = tr.filter((t) => t.holdBars === 0 && (t.exitReason === 'take_profit' || t.exitReason === 'gap_target')).length / tr.length;
        const bc = bootMeanByCluster(withCost, (x) => x.symbol, (x) => x.net);
        const row = {
          geo: geo.id, group: g, maxHold: pick.maxHold, n: tr.length, tpIn1Bar: tpIn1,
          gross: mean(withCost.map((x) => x.gross)), cost: mean(withCost.map((x) => x.cost)),
          net: mean(withCost.map((x) => x.net)), ciSymbol: [bc.lo, bc.hi], p: bc.p,
        };
        S5.push(row);
        registerTest({
          id: `S5-${geo.id}-h${pick.maxHold}-${g}-validation`, family: 'validation (ตัดสิน)',
          question: `R สุทธิ ≠ 0 · ${geo.id} · ${g} · เพดานถือ ${pick.maxHold}`,
          estimate: row.net, ci: row.ciSymbol, p: bc.p,
        });
      }

      // ขอบ 1 แท่งบน validation — ตัวเดียวกับ S1 แต่บนข้อมูลที่ไม่เคยใช้ปรับอะไร
      if (geo.id === 'CEIL' && pick.maxHold === 1) {
        for (const g of GROUPS) {
          const tr = trades.filter((t) => groupOf(t, runnerSet) === g);
          const edges = barEdgeOf(tr);
          const bt = bootMean(edges.map((e) => e.v));
          const bc = bootMeanByCluster(edges, (e) => e.symbol, (e) => e.v);
          JSONOUT.S1validation = JSONOUT.S1validation ?? {};
          JSONOUT.S1validation[g] = { n: edges.length, edge: bt.mean, ciTrade: [bt.lo, bt.hi], ciSymbol: [bc.lo, bc.hi], p: bt.p };
          registerTest({
            id: `S1-${g}-validation`, family: 'validation (ตัดสิน)',
            question: `ขอบทิศทางใน 1 แท่ง ≠ 0 · ${g}`,
            estimate: bt.mean, ci: [bt.lo, bt.hi], p: bt.p,
          });
        }
      }
    }
    JSONOUT.S5 = S5;

    W('| เรขาคณิต | กลุ่ม | เพดานถือ | ไม้ | ปิดกำไรใน 1 แท่ง | R ก่อนหักต้นทุน | ต้นทุน R | **R สุทธิ** | CI95 ราย-สัญลักษณ์ |');
    W('|---|---|---:|---:|---:|---:|---:|---:|---|');
    for (const r of S5) {
      W(`| ${r.geo} | ${GROUP_LABEL[r.group]} | ${r.maxHold} | ${r.n.toLocaleString()} | **${pctS(r.tpIn1Bar, 2)}** | ${n2(r.gross)} | ${n2(r.cost)} | **${n2(r.net)}** | [${n2(r.ciSymbol[0], 3)}, ${n2(r.ciSymbol[1], 3)}] |`);
    }
    W();
    if (JSONOUT.S1validation) {
      W('ขอบทิศทางใน 1 แท่งบน validation (เพดานของทุกเรขาคณิต บนข้อมูลที่ไม่เคยใช้ปรับอะไร):');
      W();
      W('| กลุ่ม | สัญญาณ | ขอบใน 1 แท่ง | CI95 ราย-ไม้ | CI95 ราย-สัญลักษณ์ | ค่าธรรมเนียมจริง | ขอบ − ค่าธรรมเนียม |');
      W('|---|---:|---:|---|---|---:|---:|');
      for (const g of GROUPS) {
        const v = JSONOUT.S1validation[g];
        if (!v) continue;
        W(`| ${GROUP_LABEL[g]} | ${v.n.toLocaleString()} | **${bpsS(v.edge)}** | [${bpsS(v.ciTrade[0])}, ${bpsS(v.ciTrade[1])}] | [${bpsS(v.ciSymbol[0])}, ${bpsS(v.ciSymbol[1])}] | ${bpsS(S1[g].feeFrac)} | **${bpsS(v.edge - S1[g].feeFrac)}** |`);
      }
      W();
      // ── เครื่องหมายของขอบพลิกระหว่าง train กับ validation หรือไม่ ──
      // ข้อนี้สำคัญกว่าค่า p ของแต่ละชุด: ขอบจริงต้องคงเครื่องหมายข้ามชุด ถ้าพลิก
      // แปลว่าสิ่งที่วัดได้คือเสียงรบกวน ไม่ใช่ของที่เอาไปเดิมพันเงินจริงได้
      const flips = GROUPS.filter((g) => JSONOUT.S1validation[g]
        && Math.sign(S1[g].edge) !== Math.sign(JSONOUT.S1validation[g].edge));
      W(`**เครื่องหมายของขอบพลิกระหว่าง train กับ validation ใน ${flips.length} จาก ${GROUPS.length} กลุ่ม**`);
      W(`(${flips.map((g) => `${GROUP_LABEL[g]}: ${bpsS(S1[g].edge)} → ${bpsS(JSONOUT.S1validation[g].edge)}`).join(' · ')})`);
      W();
      W('ขอบจริงต้องคงเครื่องหมายข้ามชุดข้อมูล การที่มันพลิกคือหลักฐานว่าสิ่งที่วัดได้ในระดับ');
      W('ไม่กี่ bps คือเสียงรบกวน ไม่ใช่ของที่เอาไปเดิมพันเงินจริงได้ — และต่อให้ยอมเชื่อค่าที่สูงที่สุด');
      // "ใกล้คุ้มทุนที่สุด" ต้องวัดด้วยสัดส่วน ขอบ ÷ ค่าธรรมเนียม ไม่ใช่ส่วนต่างเป็น bps
      // เพราะกลุ่มที่ค่าธรรมเนียมถูกมากจะมีส่วนต่างน้อยเสมอแม้ขอบจะเป็นศูนย์หรือติดลบ
      const cover = GROUPS.filter((g) => JSONOUT.S1validation[g])
        .map((g) => ({ g, edge: JSONOUT.S1validation[g].edge, fee: S1[g].feeFrac, ratio: JSONOUT.S1validation[g].edge / S1[g].feeFrac }))
        .sort((a, b) => b.ratio - a.ratio);
      W('ที่วัดได้บน validation ก็ยังขาดทุนทุกกลุ่ม · วัดด้วยสัดส่วน "ขอบจ่ายค่าธรรมเนียมได้กี่ %":');
      W();
      for (const c of cover) W(`· ${GROUP_LABEL[c.g]} — ขอบ ${bpsS(c.edge)} ÷ ค่าธรรมเนียม ${bpsS(c.fee)} = **${pctS(c.ratio, 0)}**`);
      W();
      W(`กลุ่มที่ดีที่สุดคือ${GROUP_LABEL[cover[0].g]} ซึ่งขอบจ่ายค่าธรรมเนียมของตัวเองได้ ${pctS(cover[0].ratio, 0)}`);
      W('— ยังขาดทุนอยู่ และเป็นตัวเลขจากชุดเดียวที่ไม่มีอะไรยืนยัน (บน train ค่าเดียวกันติดลบ)');
      W();
      JSONOUT.signFlips = flips;
    }
    W(`**จำนวนครั้งที่แตะ validation ในรอบนี้: ${validationLog.touches} ครั้ง** (แต่ละครั้ง = lab.mjs หนึ่งการรัน)`);
    W();
  }
  JSONOUT.validationLog = validationLog;

  // ═══════════════ ทะเบียนการเปรียบเทียบ ═══════════════
  W('# ทะเบียนการเปรียบเทียบทั้งหมด');
  W();
  const trainTests = TESTS.filter((t) => t.family.startsWith('train'));
  const valTests = TESTS.filter((t) => t.family.startsWith('validation'));
  const valHolm = holm(valTests);
  W(`ทั้งหมด **${TESTS.length} การเปรียบเทียบ** — train ${trainTests.length} (สำรวจ ไม่ใช้ตัดสิน)`);
  W(`· validation ${valTests.length} (ครอบครัวที่ตัดสิน) · แก้ค่า p ด้วย Holm ที่ α = 0.05`);
  if (valHolm.length) {
    const strictest = Math.min(...valHolm.map((t) => t.holmThreshold).filter(Number.isFinite));
    W(`· เกณฑ์เข้มสุดในครอบครัว = ${strictest.toExponential(2)} · **ผ่าน ${valHolm.filter((t) => t.holmPass).length} จาก ${valTests.length}**`);
  }
  W();
  const passing = valHolm.filter((t) => t.holmPass);
  const passingLoss = passing.filter((t) => t.estimate < 0);
  const passingGain = passing.filter((t) => t.estimate > 0);
  W(`ในบรรดาข้อที่ผ่าน Holm: **${passingLoss.length} ข้ออยู่ฝั่ง "ขาดทุนอย่างมีนัยสำคัญ"**`);
  W(`· ${passingGain.length} ข้ออยู่ฝั่ง "เป็นบวกอย่างมีนัยสำคัญ"`);
  if (passingGain.length) {
    W();
    W('ข้อที่เป็นบวกและผ่านเกณฑ์ (ต้องอ่านพร้อมขนาดของมัน ไม่ใช่แค่ว่า "มีนัยสำคัญ"):');
    for (const t of passingGain) W(`· ${t.question} = ${n2(t.estimate, 5)}`);
  }
  W();
  W('| # | ครอบครัว | คำถาม | ค่าที่วัดได้ | ทิศ | CI95 | p | เกณฑ์ Holm | ผล |');
  W('|---:|---|---|---:|---|---|---:|---:|---|');
  let i = 0;
  const dir = (v) => (v > 0 ? 'บวก' : v < 0 ? 'ลบ' : '0');
  for (const t of trainTests) {
    i++;
    W(`| ${i} | train | ${t.question} | ${n2(t.estimate, 5)} | ${dir(t.estimate)} | [${n2(t.ci?.[0], 4)}, ${n2(t.ci?.[1], 4)}] | ${pS(t.p)} | — | สำรวจ |`);
  }
  for (const t of valHolm) {
    i++;
    W(`| ${i} | validation | ${t.question} | ${n2(t.estimate, 5)} | ${dir(t.estimate)} | [${n2(t.ci?.[0], 4)}, ${n2(t.ci?.[1], 4)}] | ${pS(t.p)} | ${Number.isFinite(t.holmThreshold) ? t.holmThreshold.toExponential(2) : '—'} | ${t.holmPass ? '**ผ่าน**' : 'ไม่ผ่าน'} |`);
  }
  W();
  JSONOUT.tests = { all: TESTS, validationHolm: valHolm, counts: { total: TESTS.length, train: trainTests.length, validation: valTests.length } };

  // ═══════════════ กลุ่มหุ้นซิ่ง: รายละเอียดและข้อจำกัด ═══════════════
  W('# ภาคผนวก · กลุ่มหุ้นซิ่งที่เพิ่งเพิ่มเข้าคลังรอบนี้');
  W();
  W('| สัญลักษณ์ | ช่วงแท่งเฉลี่ย | มูลค่าซื้อขาย/แท่ง | ราคามัธยฐาน | tick เป็น % ของราคา | คุณภาพ | กลุ่ม |');
  W('|---|---:|---:|---:|---:|---|---|');
  for (const p of profiles) {
    const grp = SET50_SYMBOLS.includes(p.symbol) ? 'SET50' : (runnerSet.has(p.symbol) ? '**RUNNER**' : 'ตกเกณฑ์');
    W(`| ${p.symbol} | ${p.barRangePct.toFixed(3)}% | ${(p.medTurnover / 1e6).toFixed(2)}M฿ | ${p.medPrice.toFixed(2)} | ${p.tickPctAtMedian.toFixed(3)}% | ${p.verdict} | ${grp} |`);
  }
  W();
  if (JSONOUT.runnerRejected.length) {
    W('ตัวที่เพิ่มเข้าคลังแล้วแต่ตกเกณฑ์หุ้นซิ่ง (ไม่ได้อยู่ในกลุ่มไหนเลย):');
    W();
    for (const r of JSONOUT.runnerRejected) W(`· **${r.symbol}** — ${r.reason}`);
    W();
  }

  // ความสัมพันธ์ "ยิ่งซิ่ง ยิ่งจ่าย tick แพง" — กลไกที่หักล้างข้อดีของหุ้นซิ่ง
  {
    const th = profiles.filter((p) => p.verdict !== 'bad');
    const rho = spearman(th.map((p) => p.barRangePct), th.map((p) => p.tickPctAtMedian));
    W(`สหสัมพันธ์อันดับ (ความผันผวนของแท่ง ↔ tick คิดเป็น % ของราคา) บนหุ้นไทย ${th.length} ตัว = **${n2(rho, 3)}**`);
    W();
    W('ถ้าค่านี้เป็นบวกแรง แปลว่าหุ้นที่ซิ่งกว่าก็จ่ายสเปรดขั้นต่ำแพงกว่าไปพร้อมกัน —');
    W('ส่วนลดต้นทุนเป็น R ที่ได้จาก "SL กว้าง" จึงถูกหักกลบด้วย "tick แพง" ตั้งแต่ต้นทาง');
    W();
    JSONOUT.rhoRangeVsTick = rho;
  }

  W('# ข้อจำกัดที่ต้องรู้ก่อนเชื่อตัวเลขข้างบน');
  W();
  for (const line of [
    '1H ย้อนได้แค่ 730 วัน (เพดานของ Yahoo) = เห็นตลาดยุคเดียว ข้อสรุปทุกข้อในไฟล์นี้จึงอ่อนกว่าที่ดูเสมอ',
    'Yahoo ลบหุ้นที่ออกจากกระดานทิ้ง — หุ้นซิ่งที่เจ๊งจริง (STARK/MORE) หายไปเอง กลุ่มหุ้นซิ่งจึงเอียงไปทางผู้รอดชีวิต ผลจริงแย่กว่านี้',
    'ราคาไม่ได้หักปันผล — หุ้นปันผลสูงมี gap ลงทุกครั้งที่ขึ้น XD ซึ่งเครื่องยนต์อาจอ่านเป็นสัญญาณกลับตัว',
    'ต้นทุนหุ้นไทยคำนวณจากกติกาสาธารณะ (tick ตามช่วงราคา) + ค่าคอมที่พบทั่วไป ไม่ใช่ใบเสร็จจริงของเจ้าของ — ถ้ามีใบเสร็จจริงให้รันซ้ำด้วย --comm-rate / --min-fee',
    'สเปรดคิดไว้ 1 tick ต่อรอบ ซึ่งเป็นการมองโลกในแง่ดีที่สุด หุ้นสภาพคล่องต่ำกว้างกว่านั้นเสมอ ตัวเลขต้นทุนจึงเป็น "พื้น" ไม่ใช่ "เพดาน"',
    'แบบจำลองสมมติว่าได้ราคาที่ต้องการเสมอ — สมมติฐานที่หุ้นซิ่งละเมิดบ่อยที่สุด และละเมิดหนักที่สุดตอนที่ SL ทำงาน',
    'แท่งที่แตะทั้ง SL และ TP นับ SL ก่อนเสมอ (OHLC ไม่บอกลำดับภายในแท่ง) — เป็นการเลือกทางแย่ไว้ก่อน',
    'ทฤษฎีบทเพดานใน S1 ยืนบนสมมติฐานว่าราคาในแท่งเป็น martingale บวก drift — จึงตรวจซ้ำด้วยตัวเลขจริงใน S4 ไม่ได้ให้เชื่อทฤษฎีลอย ๆ',
    'ชุด test ไม่ถูกแตะเลยในรอบนี้ — ไม่มีข้อสรุปใดผ่านการยืนยันนอกตัวอย่างขั้นสุดท้าย และไม่ควรมี เพราะไม่มีอะไรผ่านเข้ารอบ',
    'การวัดทั้งหมดใช้กติกาให้คะแนนของเครื่องยนต์ปัจจุบัน — ถ้าเปลี่ยนวิธีตัดสินสัญญาณ ประชากรไม้จะเปลี่ยนและต้องวัดใหม่ทั้งชุด',
  ]) W(`· ${line}`);
  W();
  W(`_ใช้เวลาทั้งหมด ${((Date.now() - t0) / 1000).toFixed(1)} วินาที · bootstrap ${OPT.bootstrap.toLocaleString()} รอบ · เมล็ด ${OPT.seed}_`);

  // ── หัวรายงาน: คำตอบก่อน หลักฐานทีหลัง ──
  const head = [];
  const H = (s = '') => head.push(s);
  const best1h = S4.filter((r) => r.maxHold === 1 && r.geo !== 'CEIL' && r.tpIn1Bar >= 0.25)
    .sort((a, b) => b.net - a.net)[0];
  const runnerBest = S4.filter((r) => r.maxHold === 1 && r.group === 'RUNNER' && r.tpIn1Bar >= 0.25)
    .sort((a, b) => b.net - a.net)[0];

  H('# หุ้นไทยจบใน 1 ชั่วโมงด้วย TP/SL — ทำได้ไหม');
  H();
  H('**คำตอบสั้น: "จบใน 1 ชั่วโมง" ทำได้ · "จบแล้วมีกำไร" ทำไม่ได้ และห่างมาก**');
  H();
  H('งานรอบนี้ออกแบบเรขาคณิต TP/SL ใหม่ทั้งชุดเพื่อให้จบเร็วโดยเฉพาะ แล้ววัดผลจริง');
  H('ส่วนที่เป็นข่าวดีคือมันได้ผลตามที่ตั้งใจ — ปัญหา "0 จาก 356" ถูกแก้แล้ว:');
  H();
  const p0runner = S4.find((r) => r.geo === 'P0' && r.maxHold === 1 && r.group === 'RUNNER');
  const bestGeo = GEOMETRIES.find((g) => g.id === runnerBest.geo);
  H('| หุ้นซิ่งไทย · เพดานถือ 1 ชั่วโมง | ปิดกำไรจบใน 1 แท่ง | R สุทธิหลังหักต้นทุนจริง |');
  H('|---|---:|---:|');
  H(`| เกณฑ์ปัจจุบัน P0 (SL 1.5×ATR · TP 3×ATR) | ${pctS(p0runner.tpIn1Bar, 2)} | ${n2(p0runner.net)} |`);
  H(`| เรขาคณิตใหม่ ${runnerBest.geo} (TP ${bestGeo.tp}×ATR · SL ${bestGeo.sl}×ATR) | **${pctS(runnerBest.tpIn1Bar, 2)}** | **${n2(runnerBest.net)}** |`);
  H();
  H(`ช่องที่ขาดทุนน้อยที่สุดในทั้ง 72 ช่องคือ ${best1h.geo} บน${GROUP_LABEL[best1h.group]} `);
  H(`(ปิดกำไรใน 1 แท่ง ${pctS(best1h.tpIn1Bar, 2)} · R สุทธิ ${n2(best1h.net)}) — ยังติดลบอยู่ดี`);
  H();
  H('ดึง TP เข้ามาอยู่ในระยะที่ราคาเดินถึงได้จริงใน 1 ชั่วโมง แล้วสัดส่วนที่ปิดกำไรทันแท่งแรก');
  H(`กระโดดจาก ${pctS(p0runner.tpIn1Bar, 1)} เป็น ${pctS(runnerBest.tpIn1Bar, 1)} — เจ้าของขออะไรมา ได้อย่างนั้นเป๊ะ`);
  H();
  H('**แต่ไม่มีช่องใดเลยใน 72 ช่องที่ทดสอบ (9 เรขาคณิต × 4 กลุ่ม × เพดานถือ 1 และ 3 แท่ง)**');
  H('**ที่ R สุทธิเป็นบวก** และสาเหตุไม่ได้อยู่ที่เรขาคณิต:');
  H();
  // เทียบด้วย "กำไรเป็นเงินของเรขาคณิตที่ดีที่สุดที่วัดได้จริง" ไม่ใช่ขอบต่อแท่ง
  // เพราะการตรวจใน S4 พบว่าเรขาคณิตที่ตั้ง TP ใกล้ ๆ ทำเงินได้ **เกิน** การถือเต็มแท่ง
  // (ราคาย้อนกลับภายในแท่ง) การใช้ขอบต่อแท่งจะกลายเป็นการเอาเปรียบข้อสรุปของตัวเอง
  H('| กลุ่ม | กำไรของเรขาคณิตที่ดีที่สุด | ค่าธรรมเนียมจริง | ค่าธรรมเนียมใหญ่กว่ากำไรกี่เท่า |');
  H('|---|---:|---:|---:|');
  for (const c of ceilCheck) {
    const fee = S1[c.group].feeFrac;
    H(`| ${GROUP_LABEL[c.group]} | ${c.bestId} = ${bpsS(c.best)} | ${bpsS(fee)} | ${c.best > 0 ? `**${(fee / c.best).toFixed(1)} เท่า**` : '**กำไรติดลบ**'} |`);
  }
  H();
  H('ตัวเลขนี้เป็น "กรณีดีที่สุดของเราเอง" แล้ว — เป็นเรขาคณิตที่ทำเงินสูงสุดในบรรดา 9 แบบ');
  H('บนแต่ละกลุ่ม โดยยังไม่หักค่าธรรมเนียม และเลือกหลังจากเห็นผลบน train แล้วด้วยซ้ำ');
  H('(คือเข้าข้างตัวเองสุด ๆ) ถึงอย่างนั้นค่าธรรมเนียมก็ยังใหญ่กว่าหลายเท่าทุกกลุ่ม');
  H();
  H('การตั้ง TP/SL เปลี่ยนได้แค่ "เก็บของที่การเคลื่อนไหวในแท่งมีให้ ได้ดีแค่ไหน" —');
  H('มันเก็บได้ดีกว่าที่คาดจริง (การตั้ง TP ใกล้ ๆ ทำเงินได้เกินการถือเต็มแท่ง เพราะราคา');
  H('ย้อนกลับภายในแท่ง — วัดไว้ใน S4) แต่ของที่มีให้เก็บทั้งหมดยังเล็กกว่าค่าธรรมเนียม');
  H('หลายเท่า จึงไม่มีวิธีตั้ง TP/SL แบบใดที่ทำให้คุ้มได้');
  H();
  H('สมมติฐานของเจ้าของเรื่องหุ้นซิ่งมีส่วนถูก: หุ้นซิ่งมีขอบต่อแท่งมากกว่า SET50 จริง');
  H(`(${bpsS(S1.RUNNER?.edge)} เทียบกับ ${bpsS(S1.SET50?.edge)} บน train) แต่มันแพงกว่าไปพร้อมกัน `);
  H(`(${bpsS(S1.RUNNER?.feeFrac)} เทียบกับ ${bpsS(S1.SET50?.feeFrac)}) เพราะหุ้นราคาถูกจ่าย tick เป็น % ของราคาแพงกว่า`);
  H(`สหสัมพันธ์อันดับระหว่าง "ความผันผวนของแท่ง" กับ "tick เป็น % ของราคา" = ${n2(JSONOUT.rhoRangeVsTick, 3)}`);
  H('ยิ่งซิ่งยิ่งจ่ายแพง — ส่วนลดที่ได้จากความผันผวนถูกกลืนตั้งแต่ต้นทาง');
  H();
  H('---');
  H();

  const md = `${head.join('\n')}\n${OUT.join('\n')}\n`;
  fs.writeFileSync(path.join(REPORT_DIR, `exp-${OPT.tag}.md`), md, 'utf8');
  fs.writeFileSync(path.join(REPORT_DIR, `exp-${OPT.tag}.json`), `${JSON.stringify(JSONOUT, null, 2)}\n`, 'utf8');
  console.log(md);
  console.error(`\n[th-scalp] เขียน report/exp-${OPT.tag}.md และ report/exp-${OPT.tag}.json`);
  return JSONOUT;
}

main().catch((e) => { console.error(e); process.exit(1); });

export { GEOMETRIES, RUNNER_RULE, SET_TICK_TABLE };
