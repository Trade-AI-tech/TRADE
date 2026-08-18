#!/usr/bin/env node
/**
 * feat-cross.mjs — ตระกูลที่ 2: "ตัวนี้เทียบกับตัวอื่นเป็นยังไง" มีพลังทำนายไหม
 *
 * ██████████████████████████████████████████████████████████████████████████████
 * █                                                                            █
 * █   ไฟล์นี้ห้ามอ่านอนาคตทุกกรณี — ตรงข้ามกับ ceiling.mjs โดยสิ้นเชิง            █
 * █   ทุก feature ที่แท่ง i ต้องคำนวณจากข้อมูลถึงแท่ง i เท่านั้น ของทุกสัญลักษณ์       █
 * █   ไม่ import อะไรจาก ceiling.mjs เลย (ส่วนที่ลอกมา ลอกเฉพาะที่ทำเครื่องหมาย     █
 * █   [CAUSAL] ไว้ แล้วเขียนซ้ำในไฟล์นี้ พร้อมหมายเหตุว่าลอกมาจากไหน)              █
 * █                                                                            █
 * █   มีตัวควบคุมเชิงบวก (LEAK_*) ที่ "ตั้งใจให้รั่ว" อยู่ในส่วนตรวจสอบเท่านั้น           █
 * █   เพื่อพิสูจน์ว่าเครื่องตรวจ look-ahead มีฟันจริง — ห้ามเอาไปใช้วัดผลใด ๆ         █
 * █                                                                            █
 * ██████████████████████████████████████████████████████████████████████████████
 *
 * ─────────────────────────────── ทำไมต้องมีไฟล์นี้ ───────────────────────────────
 *
 * เครื่องยนต์ปัจจุบันดูสัญลักษณ์ทีละตัว ไม่เคยเทียบกันเลย — RSI ของ PTT ไม่รู้ว่า
 * วันนี้ทั้งตลาดขึ้นหรือลง ไม่รู้ว่า PTT แรงกว่าหรืออ่อนกว่าเพื่อน ๆ ในกลุ่ม
 * "ตัวนี้เทียบกับตัวอื่น" จึงเป็นแกนข้อมูลใหม่ทั้งแกนที่ยังไม่เคยถูกแตะ
 *
 * ⚠ อย่าสับสนกับงานรอบก่อน: รอบก่อนพบว่า "เลือกสัญลักษณ์จากผลงานย้อนหลังทั้งช่วง"
 *   กลับหัว (top10 ได้ −0.022 / bottom10 ได้ +0.065) — นั่นคือการเลือก **ตัวสัญลักษณ์**
 *   จากผลงานของทั้งชุดข้อมูล ซึ่งเป็นการมองย้อนหลังคนละเรื่องกับ relative strength
 *   ที่วัด ณ เวลานั้นแล้วเปลี่ยนอันดับได้ทุกแท่ง ไฟล์นี้วัดอย่างหลังเท่านั้น
 *
 * ─────────────────────────── ขอบเขต: วัดช่องไหน ไม่วัดช่องไหน ───────────────────────────
 *
 * exp-ceiling.md วัดไว้แล้วว่า "ความแม่นคุ้มทุน p*" ของหุ้นไทยกรอบ 1 ชั่วโมงอยู่ที่
 * 71–108% = ต่อให้ feature เก่งแค่ไหนก็ไม่มีทางคุ้มค่าธรรมเนียม จึง **ไม่วัด 1H ของหุ้นไทย**
 * ในไฟล์นี้เลย (เสียเวลาเปล่า) ช่องที่วัด:
 *   · 1D ครบ 6 กลุ่ม (RUNNER · SET50 · GOLD · FOREX · US_STOCK · CRYPTO)
 *   · 1H เฉพาะ 4 กลุ่มที่เพดานยังเปิด (GOLD · FOREX · US_STOCK · CRYPTO)
 *
 * ─────────────────────────── เวลา: จุดตายของตระกูลนี้ ───────────────────────────
 *
 * timestamp ในคลังคือ "เวลาเปิดแท่ง" (UTC) ไม่ใช่เวลาปิด — ตรวจแล้วจากข้อมูลจริง:
 * หุ้นไทย 1D = 03:00Z (เปิด 10:00 ICT) · หุ้นสหรัฐ 1D = 13:30/14:30Z (เปิด 9:30 ET)
 * ค่าเงิน 1D = 23:00/00:00Z · คริปโต 1D = 00:00Z · ทอง 1D = 04:00/05:00Z
 *
 * การตัดสินใจเกิดที่ "ปิดแท่ง" ของสัญลักษณ์เป้าหมาย ดังนั้นข้อมูลของสัญลักษณ์อื่น
 * ใช้ได้เฉพาะแท่งที่ **ปิดไปแล้ว ณ เวลานั้น** เท่านั้น โมเดลเวลาปิดที่ใช้:
 *   1H ทุกตลาด → เปิด + 1 ชม.
 *   1D หุ้นไทย  → เปิด + 6.5 ชม. (10:00–16:30 ICT)
 *   1D หุ้นสหรัฐ → เปิด + 6.5 ชม. (9:30–16:00 ET)
 *   1D ที่เหลือ  → เปิด + 24 ชม. (ตลาด 24 ชม. — เลือกค่ามากไว้ก่อน = เข้มงวดกว่าความจริง)
 *
 * ผลที่ตามมาโดยอัตโนมัติ: หุ้นไทยวันที่ D (ปิด 09:30Z) ใช้ SPY ได้แค่แท่งวันที่ D−1
 * (ปิด 20:00Z ของ D−1) เพราะ SPY วันที่ D ปิด 20:00Z ซึ่งเลยเวลาตัดสินใจไปแล้ว
 * ไม่ต้องตั้งกฎ lag เอง — as-of join บนเวลาปิดจริงจัดการให้เอง และมีตารางตรวจใน C2
 *
 * สำหรับสัญลักษณ์ใน **ตลาดเดียวกันและกรอบเวลาเดียวกัน** แท่งปิดพร้อมกัน จึงใช้
 * ข้อมูลแท่งเดียวกันของเพื่อนร่วมกลุ่มได้ (นี่คือวิธีที่กลยุทธ์ cross-sectional ทำกันจริง)
 * แต่คนที่ต้องส่งคำสั่ง "ที่ราคาปิด" อาจไม่ทันเห็นอันดับครบ — จึงมีตระกูล LAG1 ใน C7
 * ที่หน่วงข้อมูลข้ามตัวไป 1 แท่งเต็ม ให้เห็นว่าผลเปลี่ยนไหม
 *
 * ────────────────────────────────── วิธีใช้ ──────────────────────────────────
 *
 *   node scripts/research/experiments/feat-cross.mjs
 *   node scripts/research/experiments/feat-cross.mjs --bootstrap=2000
 *   node scripts/research/experiments/feat-cross.mjs --no-parity   ข้ามการเทียบ ATR กับ src
 *
 * ไฟล์นี้ทำงานบน **ชุด train เท่านั้น** ตามกติกาเฟสนี้ และมีด่านกันชุด test ข้างล่าง
 */

import fs from 'node:fs';
import path from 'node:path';

import { ROOT, loadSrcModules } from '../load-src-modules.mjs';

const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const SPLIT_FILE = path.join(REPORT_DIR, 'split.json');
const CEILING_JSON = path.join(REPORT_DIR, 'exp-ceiling.json');

// ════════════════════════════════ ค่าคงที่ของงาน ════════════════════════════════

/** 14 ตัวเดิมในคลัง — นิยามเดียวกับ ceiling.mjs / exp-th-scalp.md เพื่อให้เทียบกันได้ */
const SET50_SYMBOLS = [
  'PTT', 'PTTEP', 'AOT', 'CPALL', 'KBANK', 'BBL', 'ADVANC',
  'SCC', 'BDMS', 'CPF', 'DELTA', 'MINT', 'IVL', 'EA',
];

/** [CAUSAL] เกณฑ์คัดหุ้นซิ่ง — ลอกจาก ceiling.mjs ทุกตัวเลข วัดบน train ของ 1H เท่านั้น */
const RUNNER_RULE = { minBarRangePct: 1.20, minTurnoverBaht: 0.5e6, minBars: 3000 };

/**
 * ⚠ จุดอ่อนที่ต้องแก้ของ RUNNER ข้างบน — และเหตุผลที่ต้องมี RUNNER_PIT
 *
 * RUNNER คัดตัวจาก **1H ของปี 2023–2025** (ตาม ceiling.mjs) แต่ช่อง RUNNER|1D
 * ถูกวัดบนปี **2000–2016** แปลว่า "ตัวไหนคือหุ้นซิ่ง" ถูกตัดสินด้วยข้อมูลที่เกิดขึ้น
 * หลังช่วงที่วัดผลไปเกือบ 10 ปี = การรั่วที่ **การเลือกตัว** ไม่ใช่ที่ค่า feature
 * C1 (ตัดท้ายทิ้งแล้วคำนวณซ้ำ) จับไม่ได้ เพราะมันตรวจค่าของ feature ไม่ได้ตรวจว่า
 * "ใครถูกเลือกเข้ามาวัด" — เป็นการรั่วคนละชนิดกัน
 *
 * RUNNER_PIT คัดใหม่ทุกก้าวโดยใช้เฉพาะข้อมูลถึงก้าวนั้น: ในบรรดาหุ้นไทยนอก SET50
 * ที่มีประวัติพอและสภาพคล่องไม่ต่ำกว่ามัธยฐาน ณ ก้าวนั้น เลือกตัวที่ "ซิ่งที่สุด"
 * ตามช่วงกว้างของแท่งย้อนหลัง PIT_WIN แท่ง — ไม่ใช้ผลตอบแทนอนาคตและไม่ใช้ข้อมูลข้ามยุค
 */
const PIT_WIN = 250;   // หน้าต่างวัดความซิ่ง (แท่งของตัวเอง ~1 ปีของกรอบ 1D)
const PIT_TOP = 8;     // เลือกกี่ตัวต่อก้าว — ตั้งเท่าจำนวนตัวที่ RUNNER เดิมมีจริงในชุด train

/** [CAUSAL] ตารางช่วงราคาของ SET — ลอกจาก ceiling.mjs */
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

/** [CAUSAL] ตาราง bps ของ lab.mjs — ลอกจาก ceiling.mjs ไม่แก้ */
const LAB_COST_BPS = {
  byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 },
  bySymbol: {
    XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10,
    EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15,
  },
};

/** [CAUSAL] เรขาคณิตที่ใช้คำนวณขนาดคำสั่ง (เพื่อคิดค่าคอมขั้นต่ำของหุ้นไทย) */
const GEO = { slAtrMult: 1.5, atrPeriod: 14, atrFallbackPct: 0.02 };

const HORIZONS = [1, 3, 6, 10];   // หน้าต่างทำนายตามสเปกของรอบนี้ (แท่งข้างหน้า)
const MIN_OWN_BARS = 60;          // ประวัติของตัวเองขั้นต่ำ — ตรงกับ minHistory ของ lab.mjs

// หน้าต่างของ feature (นับเป็น "ก้าวบนตารางเวลารวมของกลุ่ม" ไม่ใช่แท่งของตัวเอง)
const W_MOM = [1, 5, 20, 60];
const W_CORR = 60;      // หน้าต่างวัดความสัมพันธ์กับดัชนีกลุ่ม
const W_BETA = 120;     // หน้าต่างวัดเบต้า (ใช้แยกส่วนที่เป็นของตัวเองออกจากส่วนที่ตามกลุ่ม)
const W_Z = 120;        // หน้าต่างทำ z-score ของ feature ระดับกลุ่ม (rolling จากอดีตเท่านั้น)
const W_SMA = 60;       // หน้าต่างค่าเฉลี่ยราคาของตัวเอง
const WARMUP = 140;     // ก้าวแรกที่ยอมให้มีค่า — มากกว่าหน้าต่างที่ยาวที่สุดเล็กน้อย

const GROUPS_1D = ['RUNNER', 'RUNNER_PIT', 'SET50', 'GOLD', 'FOREX', 'US_STOCK', 'CRYPTO'];
const GROUPS_1H = ['GOLD', 'FOREX', 'US_STOCK', 'CRYPTO'];  // ไม่วัดหุ้นไทย 1H — เพดานปิดตาย
const GROUP_LABEL = {
  RUNNER: 'หุ้นซิ่งไทย', RUNNER_PIT: 'หุ้นซิ่งไทย (คัดตามเวลาจริง)', SET50: 'SET50 เดิม', GOLD: 'ทอง/โลหะ',
  FOREX: 'ค่าเงิน', US_STOCK: 'หุ้นสหรัฐ', CRYPTO: 'คริปโต',
};

/** ชื่อ feature + คำอธิบายว่ามันวัดอะไร (ใช้พิมพ์รายงาน) */
const CS_FEATURES = [
  ['xsMom1', 'อันดับผลตอบแทน 1 แท่งล่าสุด เทียบเพื่อนในกลุ่ม'],
  ['xsMom5', 'อันดับผลตอบแทน 5 แท่งล่าสุด เทียบเพื่อนในกลุ่ม'],
  ['xsMom20', 'อันดับผลตอบแทน 20 แท่งล่าสุด เทียบเพื่อนในกลุ่ม'],
  ['xsMom60', 'อันดับผลตอบแทน 60 แท่งล่าสุด เทียบเพื่อนในกลุ่ม'],
  ['xsIdio20', 'อันดับผลตอบแทน 20 แท่งที่หักส่วนที่ตามดัชนีกลุ่มออกแล้ว (เบต้า rolling)'],
  ['xsRelPx60', 'อันดับระยะห่างจากค่าเฉลี่ยราคาตัวเอง 60 แท่ง — ใครยืดกว่าเพื่อน'],
  ['xsCorrChg', 'อันดับการเปลี่ยนของสหสัมพันธ์กับดัชนีกลุ่ม — ของที่เคยไปด้วยกันแล้วแยกทาง'],
];
const GRP_FEATURES = [
  ['breadth1', 'ความกว้างของตลาด: สัดส่วนตัวที่ขึ้นในแท่งล่าสุด (ลบ 0.5)'],
  ['breadth20', 'ความกว้างของตลาด: สัดส่วนตัวที่ผลตอบแทน 20 แท่งเป็นบวก (ลบ 0.5)'],
  ['dispZ20', 'z-score ของการกระจายตัวผลตอบแทน 20 แท่งข้ามสัญลักษณ์ (rolling 120 ก้าว)'],
  ['avgCorrZ', 'z-score ของสหสัมพันธ์เฉลี่ยกับดัชนีกลุ่ม — ตลาดเดินพร้อมกันแค่ไหน'],
];
const CS_NAMES = CS_FEATURES.map((f) => f[0]);
const GRP_NAMES = GRP_FEATURES.map((f) => f[0]);
const ALL_FEATURES = [...CS_FEATURES, ...GRP_FEATURES];
const FEATURE_DESC = Object.fromEntries(ALL_FEATURES);

/**
 * คู่ lead-lag ที่ **ตั้งสมมติฐานไว้ก่อนเห็นผล** — ห้ามไล่ทุกคู่
 * 58 สัญลักษณ์ = 3,306 คู่ ถ้าไล่หมดจะเจอผลบวกลวงเป็นสิบ ๆ คู่โดยไม่มีความหมาย
 * ทุกคู่ต้องมีเหตุผลเชิงเศรษฐกิจเขียนกำกับ และถูกนับในบัญชีการเปรียบเทียบทั้งหมด
 */
const LEADLAG_PAIRS = [
  { id: 'SPY_TO_SET50', leader: 'US_STOCK|SPY', target: 'SET50', tfs: ['1D'],
    why: 'ตลาดสหรัฐปิดก่อนไทยเปิดวันถัดไป — ความอยากเสี่ยงของคืนนั้นส่งต่อมาที่ตลาดเกิดใหม่' },
  { id: 'SPY_TO_RUNNER', leader: 'US_STOCK|SPY', target: 'RUNNER', tfs: ['1D'],
    why: 'เหตุผลเดียวกับ SET50 แต่หุ้นซิ่งอ่อนไหวต่อความอยากเสี่ยงมากกว่า' },
  { id: 'SPY_TO_CRYPTO', leader: 'US_STOCK|SPY', target: 'CRYPTO', tfs: ['1D', '1H'],
    why: 'คริปโตเดินตามสินทรัพย์เสี่ยงสหรัฐมาตั้งแต่ปี 2020 — ปัจจัยร่วมคือสภาพคล่องดอลลาร์' },
  { id: 'DXY_TO_GOLD', leader: 'SYNTH|DXY', target: 'GOLD', tfs: ['1D', '1H'],
    why: 'ทองตั้งราคาเป็นดอลลาร์ — ดอลลาร์แข็งกดราคาทองโดยกลไกตรง ๆ' },
  { id: 'DXY_TO_SET50', leader: 'SYNTH|DXY', target: 'SET50', tfs: ['1D'],
    why: 'ดอลลาร์แข็ง = เงินไหลออกจากตลาดเกิดใหม่' },
  { id: 'USDTHB_TO_SET50', leader: 'FOREX|USDTHB', target: 'SET50', tfs: ['1D'],
    why: 'บาทอ่อนสัมพันธ์กับแรงขายของต่างชาติในตลาดหุ้นไทยโดยตรง' },
  { id: 'USDTHB_TO_RUNNER', leader: 'FOREX|USDTHB', target: 'RUNNER', tfs: ['1D'],
    why: 'เหตุผลเดียวกัน — ทดสอบว่าหุ้นซิ่งไวกว่าหรือช้ากว่า SET50' },
  { id: 'BTC_TO_ALT', leader: 'CRYPTO|BTC', target: 'CRYPTO', tfs: ['1D', '1H'],
    why: 'บิตคอยน์เป็นตัวนำของทั้งกลุ่ม เหรียญอื่นตามด้วยความหน่วง (ตัดบิตคอยน์ออกจากฝั่งตาม)' },
  { id: 'XAU_TO_METAL', leader: 'GOLD|XAUUSD', target: 'GOLD', tfs: ['1D', '1H'],
    why: 'ทองเป็นตัวนำของโลหะมีค่า เงิน/แพลตินัมตามด้วยเบต้าที่สูงกว่า (ตัดทองออกจากฝั่งตาม)' },
  { id: 'TLT_TO_US', leader: 'US_STOCK|TLT', target: 'US_STOCK', tfs: ['1D', '1H'],
    why: 'พันธบัตรยาวสะท้อนดอกเบี้ยคาดการณ์ ซึ่งเป็นตัวคิดลดของหุ้น (ตัด TLT ออกจากฝั่งตาม)' },
];

/** คู่เงินที่ใช้ประกอบดัชนีดอลลาร์คร่าว ๆ — เครื่องหมาย +1 = คู่นี้ขึ้นแปลว่าดอลลาร์แข็ง */
const DXY_LEGS = [
  ['USDJPY', +1], ['USDCAD', +1], ['USDCHF', +1], ['USDMXN', +1], ['USDZAR', +1], ['USDTHB', +1],
  ['EURUSD', -1], ['GBPUSD', -1], ['AUDUSD', -1], ['NZDUSD', -1],
];
const DXY_MIN_LEGS = 6;

// ════════════════════════════════ อาร์กิวเมนต์ ════════════════════════════════

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const OPT = {
  bootstrap: Number(args.bootstrap ?? 1000),
  seed: Number(args.seed ?? 20260818),
  alpha: Number(args.alpha ?? 0.05),
  parity: !args['no-parity'],
  truncFrac: Number(args['trunc-frac'] ?? 0.8),
};

// ── ด่านกันชุด test ────────────────────────────────────────────────────────────
// เฟสนี้คือ "วัดพลังทำนายบน train" ไม่มีเหตุผลใดที่ต้องแตะ validation หรือ test เลย
if (args.split === 'test' || args.split === 'validation' || args['i-am-done-tuning'] || args.confirm) {
  console.error('\n[หยุด] feat-cross.mjs ทำงานบนชุด train เท่านั้น — ไม่รับ --split=validation/test\n');
  process.exit(1);
}

// ═══════════════════════════ เครื่องมือทางสถิติ ═══════════════════════════

/** PRNG ที่ให้ผลเดิมทุกครั้ง */
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
 * erfc แบบ Numerical Recipes — ต้องละเอียดระดับนี้เพราะ Holm ที่ 1,500+ การทดสอบ
 * ต้องการค่า p ระดับ 3e-5 ซึ่ง bootstrap B=1,000 ให้พื้นได้แค่ 1e-3 (หยาบเกินไป)
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
const twoSidedP = (z) => (Number.isFinite(z) ? erfc(Math.abs(z) / Math.SQRT2) : NaN);

/**
 * ค่าเฉลี่ยพร้อมความคลาดเคลื่อนแบบจับกลุ่มตามเวลา (cluster-robust)
 *
 * ทำไมกลุ่มต้องเป็น "ช่วงเวลา" ไม่ใช่ "สัญลักษณ์": ภัยหลักของตระกูลนี้คือสัญลักษณ์
 * ทุกตัวในกลุ่มเดินพร้อมกันในวันเดียวกัน ถ้าจับกลุ่มด้วยสัญลักษณ์ ความสัมพันธ์
 * ข้ามสัญลักษณ์ ณ เวลาเดียวกันจะไม่ถูกหักออกเลย จำนวนตัวอย่างจะเฟ้อเป็นสิบเท่า
 * กลุ่มที่ใช้จึงเป็น "ทุกสัญลักษณ์ในเดือนเดียวกัน" (1D) หรือ "ในสัปดาห์เดียวกัน" (1H)
 * ซึ่งหักทั้งความสัมพันธ์ข้ามตัวและความสัมพันธ์ตามเวลาของหน้าต่างถือที่ทับกัน
 */
function clusterMean(counts, sums) {
  let N = 0; let S = 0; let G = 0;
  for (let i = 0; i < counts.length; i++) { if (counts[i] > 0) { N += counts[i]; S += sums[i]; G++; } }
  if (!N || G < 2) return { mean: N ? S / N : NaN, se: NaN, z: NaN, p: NaN, n: N, G };
  const mean = S / N;
  let v = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] <= 0) continue;
    const u = sums[i] - counts[i] * mean;
    v += u * u;
  }
  const se = Math.sqrt((v * G) / (G - 1)) / N;
  const z = se > 0 ? mean / se : 0;
  return { mean, se, z, p: twoSidedP(z), n: N, G };
}

/** bootstrap แบบสุ่มกลุ่มเวลาทั้งก้อน (block/cluster bootstrap) — คืนช่วงความเชื่อมั่น 95% */
function clusterBootstrapCI(counts, sums, resampleIdx, B, nBlocks) {
  const out = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    const base = b * nBlocks;
    let N = 0; let S = 0;
    for (let j = 0; j < nBlocks; j++) {
      const g = resampleIdx[base + j];
      N += counts[g]; S += sums[g];
    }
    out[b] = N > 0 ? S / N : NaN;
  }
  const arr = Array.from(out).filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return [NaN, NaN];
  const pick = (p) => {
    const idx = (arr.length - 1) * p;
    const lo = Math.floor(idx); const hi = Math.ceil(idx);
    return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  };
  return [pick(0.025), pick(0.975)];
}

function percentileOfSorted(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── บัญชีการเปรียบเทียบ ────────────────────────────────────────────────────────
//
// รอบนี้เสี่ยง p-hacking สูงที่สุดในโครงการ: feature 11 ตัว × กลุ่ม × 4 หน้าต่าง
// × สถิติ 2 แบบ + ตระกูลตรวจทาน + คู่ lead-lag ทุกข้อที่ "ถาม" ต้องถูกนับ
// ไม่ใช่เฉพาะข้อที่ "ตอบว่าใช่"
const TESTS = [];
function registerTest(t) { TESTS.push({ idx: TESTS.length + 1, ...t }); return TESTS[TESTS.length - 1]; }

/** Holm–Bonferroni ภายในตระกูล (ตระกูล = ชุดคำถามที่ถามพร้อมกันด้วยสถิติเดียวกัน) */
function applyHolm(list, alpha, keyPass, keyThr) {
  const sorted = [...list].filter((t) => Number.isFinite(t.p)).sort((a, b) => a.p - b.p);
  const m = sorted.length;
  let stillRejecting = true;
  sorted.forEach((t, k) => {
    t[keyThr] = alpha / (m - k);
    if (stillRejecting && t.p <= t[keyThr]) t[keyPass] = true;
    else { stillRejecting = false; t[keyPass] = false; }
  });
  for (const t of list) if (!Number.isFinite(t.p)) { t[keyThr] = NaN; t[keyPass] = false; }
}

// ═══════════════════════════════ โหลดข้อมูล ═══════════════════════════════

/**
 * [CAUSAL] โหลด dataset หนึ่งชุด แล้วตัดตามสัญญาของคลังเหมือน lab.mjs ทุกประการ
 * (ลอกจาก ceiling.mjs ส่วน [CAUSAL] — ต้องเคารพ quality.usable.from เสมอ)
 */
function loadDataset(file, maxTs = Infinity) {
  const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
  const from = j.quality?.usable?.from;
  let candles = j.candles;
  if (from) {
    const cut = Date.parse(from);
    const idx = candles.findIndex((c) => Date.parse(c.timestamp) >= cut);
    if (idx > 0) candles = candles.slice(idx);
    else if (idx === -1) candles = [];
  }
  if (Number.isFinite(maxTs)) candles = candles.filter((c) => Date.parse(c.timestamp) <= maxTs);
  return {
    file, symbol: j.symbol, market: j.market, timeframe: j.timeframe,
    verdict: j.quality?.verdict ?? 'unknown',
    candles,
    times: candles.map((c) => Date.parse(c.timestamp)),
  };
}

/** [CAUSAL] แท่งที่เชื่อถือได้ — ลอกจาก lab.mjs ผ่าน ceiling.mjs */
const isUsableBar = (c) => (
  Number.isFinite(c.open) && c.open > 0 && Number.isFinite(c.high) && c.high > 0
  && Number.isFinite(c.low) && c.low > 0 && Number.isFinite(c.close) && c.close > 0
  && c.low <= c.high
);

/** [CAUSAL] ดัชนีแรกที่ timestamp >= cut */
function lowerBound(times, cut) {
  let lo = 0; let hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < cut) lo = mid + 1; else hi = mid; }
  return lo;
}

// ═══════════════════════════ ตัวชี้วัดและต้นทุน ═══════════════════════════

/** [CAUSAL] ATR ที่ดัชนี i — ลอกสูตรจาก src/lib/indicators.ts ผ่าน ceiling.mjs */
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

function tickSizeFor(price) {
  for (const b of SET_TICK_TABLE) if (price >= b.from && price < b.to) return b.tick;
  return SET_TICK_TABLE[SET_TICK_TABLE.length - 1].tick;
}

/**
 * [CAUSAL] ค่าธรรมเนียมไป-กลับ คิดเป็นสัดส่วนของมูลค่าสถานะ — ลอกจาก ceiling.mjs
 * ตัวเลขนี้คือ "เส้นที่ผลตอบแทนดิบต้องข้ามให้ได้" ในหน่วยเดียวกับ bps ของผลตอบแทน
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
  const b = LAB_COST_BPS.bySymbol[symbol] ?? LAB_COST_BPS.byMarket[market];
  return b / 10000;
}

/** [CAUSAL] สถิติคัดหุ้นซิ่ง — ลอกจาก ceiling.mjs (ไม่มีข้อไหนเกี่ยวกับผลตอบแทน) */
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

// ═══════════════════════════ โมเดล "แท่งนี้ปิดเมื่อไร" ═══════════════════════════

const HOUR = 3600e3;
/**
 * เวลาปิดแท่ง (UTC) — timestamp ในคลังคือเวลา "เปิด" แท่ง (ตรวจแล้วกับข้อมูลจริง)
 * เลือกค่าที่ทำให้ข้อมูลของคนอื่น "มาช้า" ไว้ก่อน = เข้มงวดกว่าความจริง ไม่หลวมกว่า
 */
function barCloseMs(market, timeframe, ts) {
  if (timeframe === '1H') return ts + HOUR;
  if (market === 'TH_STOCK') return ts + 6.5 * HOUR;   // SET 10:00–16:30 ICT
  if (market === 'US_STOCK') return ts + 6.5 * HOUR;   // NYSE 9:30–16:00 ET
  return ts + 24 * HOUR;                               // FOREX / GOLD / CRYPTO = 24 ชม.
}

// ═══════════════════════════ สร้าง "ตารางเวลารวม" ของกลุ่ม ═══════════════════════════

/**
 * pool = สัญลักษณ์ทั้งตลาดในกรอบเวลาเดียวกัน วางบนตารางเวลารวม (grid)
 * grid = ทุก timestamp ที่มีอย่างน้อยหนึ่งตัวมีแท่ง เรียงจากน้อยไปมาก
 * bi[s][k] = ดัชนีแท่งของสัญลักษณ์ s ที่ก้าว k (−1 = วันนั้นตัวนี้ไม่มีแท่ง)
 *
 * ⚠ ตัวที่ยังไม่ได้เข้าตลาด กับตัวที่หยุดพักวันนั้น ถูกปฏิบัติเหมือนกันคือ "ไม่มีข้อมูล"
 *   และไม่ถูกนับในอันดับของก้าวนั้น — ไม่มีการเติมค่าย้อนหลังใด ๆ
 */
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
      if (!isUsableBar(d.candles[i])) continue;   // แท่งพังไม่ถูกนับเลย
      arr[posOf.get(d.times[i])] = i;
    }
    bi.push(arr);
  }
  const closeMs = new Float64Array(G);
  for (let k = 0; k < G; k++) closeMs[k] = barCloseMs(market, timeframe, grid[k]);

  // ต้องมีกี่ตัวถึงจะจัดอันดับได้: ครึ่งหนึ่งของกลุ่ม แต่ไม่ต่ำกว่า 3 และไม่เกิน 8
  // · ต่ำกว่า 3 อันดับไม่มีความหมาย
  // · เพดาน 8 เพราะกลุ่มใหญ่มีตัวทยอยเข้าตลาดตลอด ถ้าบังคับ "ครึ่งหนึ่ง" จะตัดยุคเก่าทิ้งหมด
  const minPool = Math.max(3, Math.min(8, Math.ceil(nSym / 2)));
  return { market, timeframe, syms, nSym, grid, G, bi, closeMs, minPool };
}

// ═══════════════════════ แกนกลาง: คำนวณ feature ทั้งกลุ่ม ═══════════════════════

/** ค่าเฉลี่ยเคลื่อนที่แบบ rolling ที่ข้ามค่า NaN — คืนอาร์เรย์ mean และ count */
function rollMean(x, W) {
  const n = x.length;
  const mean = new Float64Array(n).fill(NaN);
  let sum = 0; let cnt = 0;
  for (let k = 0; k < n; k++) {
    if (Number.isFinite(x[k])) { sum += x[k]; cnt++; }
    const drop = k - W;
    if (drop >= 0 && Number.isFinite(x[drop])) { sum -= x[drop]; cnt--; }
    if (cnt >= Math.ceil(W * 0.6)) mean[k] = sum / cnt;
  }
  return mean;
}

/** z-score แบบ rolling จากอดีตเท่านั้น (รวมค่าปัจจุบันได้ เพราะรู้แล้ว ณ เวลานั้น) */
function rollZ(x, W) {
  const n = x.length;
  const out = new Float64Array(n).fill(NaN);
  let sum = 0; let sum2 = 0; let cnt = 0;
  for (let k = 0; k < n; k++) {
    if (Number.isFinite(x[k])) { sum += x[k]; sum2 += x[k] * x[k]; cnt++; }
    const drop = k - W;
    if (drop >= 0 && Number.isFinite(x[drop])) { sum -= x[drop]; sum2 -= x[drop] * x[drop]; cnt--; }
    if (cnt >= Math.ceil(W * 0.6) && Number.isFinite(x[k])) {
      const m = sum / cnt;
      const v = Math.max(0, sum2 / cnt - m * m);
      const sd = Math.sqrt(v);
      if (sd > 0) out[k] = (x[k] - m) / sd;
    }
  }
  return out;
}

/** สหสัมพันธ์และเบต้าแบบ rolling ระหว่างอนุกรม x กับ y (นับเฉพาะก้าวที่ทั้งคู่มีค่า) */
function rollCorrBeta(x, y, W) {
  const n = x.length;
  const corr = new Float64Array(n).fill(NaN);
  const beta = new Float64Array(n).fill(NaN);
  let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0; let cnt = 0;
  const ok = (k) => Number.isFinite(x[k]) && Number.isFinite(y[k]);
  for (let k = 0; k < n; k++) {
    if (ok(k)) { sx += x[k]; sy += y[k]; sxx += x[k] * x[k]; syy += y[k] * y[k]; sxy += x[k] * y[k]; cnt++; }
    const drop = k - W;
    if (drop >= 0 && ok(drop)) {
      sx -= x[drop]; sy -= y[drop]; sxx -= x[drop] * x[drop];
      syy -= y[drop] * y[drop]; sxy -= x[drop] * y[drop]; cnt--;
    }
    if (cnt >= Math.ceil(W * 0.6)) {
      const cov = sxy / cnt - (sx / cnt) * (sy / cnt);
      const vx = Math.max(0, sxx / cnt - (sx / cnt) ** 2);
      const vy = Math.max(0, syy / cnt - (sy / cnt) ** 2);
      if (vx > 0 && vy > 0) corr[k] = cov / Math.sqrt(vx * vy);
      if (vy > 0) beta[k] = cov / vy;   // เบต้าของ x เทียบ y (y = ดัชนีกลุ่ม)
    }
  }
  return { corr, beta };
}

/**
 * จัดอันดับข้ามสัญลักษณ์ ณ ก้าว k — หัวใจของตระกูลนี้
 * ใช้เฉพาะตัวที่ "มีแท่งที่ก้าวนั้น" และ "ค่ามีจริง" เท่านั้น
 * คืนค่าอันดับเศษส่วนที่จัดกลางไว้ที่ 0 → ช่วง [−0.5, +0.5] เทียบข้ามเวลาได้แม้จำนวนตัวไม่เท่ากัน
 */
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
    if (m < minPool) continue;             // out ถูก fill NaN ไว้แล้ว
    const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => vals[a] - vals[b]);
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

/**
 * คำนวณ feature ทั้งหมดของ pool หนึ่ง
 * ทุกค่าที่ก้าว k อ่านเฉพาะก้าว 0..k ของทุกสัญลักษณ์ — ไม่มีข้อยกเว้น
 * (ตัว LEAK_* สร้างแยกในโหมดตรวจสอบเท่านั้น ดูพารามิเตอร์ withLeaks)
 */
function buildFeatures(pool, withLeaks = false) {
  const { nSym, G, bi, syms, minPool } = pool;
  const alloc = () => Array.from({ length: nSym }, () => new Float64Array(G).fill(NaN));

  // ── ชั้นที่ 1: ราคาและผลตอบแทนของแต่ละตัว วางบนตารางเวลารวม ──────────────────
  const px = alloc();      // ราคาปิดล่าสุดที่รู้ ณ ก้าว k (เติมไปข้างหน้าเท่านั้น = causal)
  const r = alloc();       // ผลตอบแทน log ของแท่งตัวเองที่ก้าว k
  const cum = alloc();     // ผลรวมสะสมของ r (ก้าวที่ไม่มีแท่ง = บวก 0)
  for (let s = 0; s < nSym; s++) {
    const cs = syms[s].candles;
    let last = NaN; let acc = 0; let started = false;
    for (let k = 0; k < G; k++) {
      const i = bi[s][k];
      if (i >= 0) {
        last = cs[i].close;
        started = true;
        if (i >= 1 && isUsableBar(cs[i - 1]) && cs[i - 1].close > 0) {
          const v = Math.log(cs[i].close / cs[i - 1].close);
          if (Number.isFinite(v)) { r[s][k] = v; acc += v; }
        }
      }
      if (started) { px[s][k] = last; cum[s][k] = acc; }
    }
  }

  // ── ชั้นที่ 2: ดัชนีของกลุ่ม (ถ่วงน้ำหนักเท่ากัน) ──────────────────────────────
  const idxR = new Float64Array(G).fill(NaN);
  const idxCum = new Float64Array(G).fill(NaN);
  const present = new Int32Array(G);
  {
    let acc = 0;
    for (let k = 0; k < G; k++) {
      let sum = 0; let cnt = 0; let pres = 0;
      for (let s = 0; s < nSym; s++) {
        if (bi[s][k] < 0) continue;
        pres++;
        if (Number.isFinite(r[s][k])) { sum += r[s][k]; cnt++; }
      }
      present[k] = pres;
      if (pres >= minPool && cnt > 0) { idxR[k] = sum / cnt; acc += idxR[k]; }
      idxCum[k] = acc;
    }
  }

  // ── ชั้นที่ 3: ค่าดิบต่อสัญลักษณ์ ก่อนจัดอันดับ ──────────────────────────────
  const momRaw = {};
  for (const L of W_MOM) momRaw[L] = alloc();
  const idioRaw = alloc();
  const relPxRaw = alloc();
  const corrChgRaw = alloc();
  const corrArr = [];

  for (let s = 0; s < nSym; s++) {
    const { corr: c60 } = rollCorrBeta(r[s], idxR, W_CORR);
    const { beta: b120 } = rollCorrBeta(r[s], idxR, W_BETA);
    corrArr.push(c60);
    const sma = rollMean(px[s], W_SMA);
    for (let k = 0; k < G; k++) {
      if (bi[s][k] < 0) continue;                       // ให้ค่าเฉพาะแท่งที่มีจริง
      for (const L of W_MOM) {
        if (k >= L && Number.isFinite(cum[s][k]) && Number.isFinite(cum[s][k - L])) {
          momRaw[L][s][k] = cum[s][k] - cum[s][k - L];
        }
      }
      if (k >= 20 && Number.isFinite(b120[k]) && Number.isFinite(idxCum[k]) && Number.isFinite(idxCum[k - 20])
        && Number.isFinite(momRaw[20][s][k])) {
        idioRaw[s][k] = momRaw[20][s][k] - b120[k] * (idxCum[k] - idxCum[k - 20]);
      }
      if (Number.isFinite(px[s][k]) && Number.isFinite(sma[k]) && sma[k] > 0 && px[s][k] > 0) {
        relPxRaw[s][k] = Math.log(px[s][k] / sma[k]);
      }
      if (k >= W_CORR && Number.isFinite(c60[k]) && Number.isFinite(c60[k - W_CORR])) {
        corrChgRaw[s][k] = c60[k] - c60[k - W_CORR];
      }
    }
  }

  // ── ชั้นที่ 4: จัดอันดับข้ามสัญลักษณ์ ────────────────────────────────────────
  const F = {};
  for (const name of CS_NAMES) F[name] = alloc();
  crossSectionRank(momRaw[1], bi, nSym, G, minPool, F.xsMom1);
  crossSectionRank(momRaw[5], bi, nSym, G, minPool, F.xsMom5);
  crossSectionRank(momRaw[20], bi, nSym, G, minPool, F.xsMom20);
  crossSectionRank(momRaw[60], bi, nSym, G, minPool, F.xsMom60);
  crossSectionRank(idioRaw, bi, nSym, G, minPool, F.xsIdio20);
  crossSectionRank(relPxRaw, bi, nSym, G, minPool, F.xsRelPx60);
  crossSectionRank(corrChgRaw, bi, nSym, G, minPool, F.xsCorrChg);

  // ── ชั้นที่ 5: feature ระดับกลุ่ม (ค่าเดียวกันทุกตัวในกลุ่ม ณ ก้าวนั้น) ──────────
  const breadth1 = new Float64Array(G).fill(NaN);
  const breadth20 = new Float64Array(G).fill(NaN);
  const disp20 = new Float64Array(G).fill(NaN);
  const avgCorr = new Float64Array(G).fill(NaN);
  for (let k = 0; k < G; k++) {
    let up1 = 0; let n1 = 0; let up20 = 0; let n20 = 0;
    let sm = 0; let sm2 = 0; let sc = 0; let nc = 0;
    for (let s = 0; s < nSym; s++) {
      if (bi[s][k] < 0) continue;
      if (Number.isFinite(r[s][k])) { n1++; if (r[s][k] > 0) up1++; }
      const m20 = momRaw[20][s][k];
      if (Number.isFinite(m20)) { n20++; if (m20 > 0) up20++; sm += m20; sm2 += m20 * m20; }
      if (Number.isFinite(corrArr[s][k])) { sc += corrArr[s][k]; nc++; }
    }
    if (n1 >= minPool) breadth1[k] = up1 / n1 - 0.5;
    if (n20 >= minPool) {
      breadth20[k] = up20 / n20 - 0.5;
      const m = sm / n20;
      disp20[k] = Math.sqrt(Math.max(0, sm2 / n20 - m * m));
    }
    if (nc >= minPool) avgCorr[k] = sc / nc;
  }
  const dispZ = rollZ(disp20, W_Z);
  const corrZ = rollZ(avgCorr, W_Z);

  for (const name of GRP_NAMES) F[name] = alloc();
  for (let s = 0; s < nSym; s++) {
    for (let k = 0; k < G; k++) {
      if (bi[s][k] < 0) continue;
      F.breadth1[s][k] = breadth1[k];
      F.breadth20[s][k] = breadth20[k];
      F.dispZ20[s][k] = dispZ[k];
      F.avgCorrZ[s][k] = corrZ[k];
    }
  }

  // ── ตัวควบคุมเชิงบวก: ตั้งใจให้รั่ว เพื่อพิสูจน์ว่าเครื่องตรวจมีฟัน ──────────────
  // ห้ามใช้ตัวเหล่านี้วัดผลใด ๆ — สร้างเฉพาะตอนตรวจ look-ahead
  if (withLeaks) {
    F.LEAK_zFull = alloc();      // z-score ด้วยค่าเฉลี่ย/ส่วนเบี่ยงเบนของ "ทั้งชุด" = การรั่วที่เงียบที่สุด
    F.LEAK_fwd5 = alloc();       // ผลตอบแทน 5 ก้าวข้างหน้า = การรั่วแบบเห็น ๆ (ทดสอบมิติหน้าต่าง)
    for (let s = 0; s < nSym; s++) {
      let sum = 0; let sum2 = 0; let cnt = 0;
      for (let k = 0; k < G; k++) if (Number.isFinite(r[s][k])) { sum += r[s][k]; sum2 += r[s][k] ** 2; cnt++; }
      const m = cnt ? sum / cnt : NaN;
      const sd = cnt ? Math.sqrt(Math.max(0, sum2 / cnt - m * m)) : NaN;
      for (let k = 0; k < G; k++) {
        if (bi[s][k] < 0) continue;
        if (Number.isFinite(r[s][k]) && sd > 0) F.LEAK_zFull[s][k] = (r[s][k] - m) / sd;
        if (k + 5 < G && Number.isFinite(cum[s][k]) && Number.isFinite(cum[s][k + 5])) {
          F.LEAK_fwd5[s][k] = cum[s][k + 5] - cum[s][k];
        }
      }
    }
  }

  return { F, px, r, cum, idxR, idxCum, present };
}

/**
 * คัด "หุ้นซิ่ง ณ ก้าวนั้น" โดยใช้เฉพาะข้อมูลถึงก้าวนั้น (point-in-time)
 * คืน elig[s][k] = 1 ถ้าสัญลักษณ์ s ถูกนับเป็นหุ้นซิ่งที่ก้าว k
 *
 * ทุกอย่างเป็น causal โดยโครงสร้าง:
 *   · ความซิ่งและสภาพคล่องของ s ที่ก้าว k คิดจากแท่งของตัวเอง PIT_WIN แท่งสุดท้ายที่ ≤ k
 *   · การเทียบข้ามตัว (มัธยฐานสภาพคล่อง + อันดับความซิ่ง) ใช้ค่าที่ก้าว k ของตัวอื่นเท่านั้น
 * ไม่มีการอ่านแท่งที่ยังไม่เกิดของใครทั้งสิ้น — และถูกตรวจซ้ำใน C1 ด้วยการตัดท้ายทิ้ง
 */
function buildRunnerPIT(pool, candidates, win = PIT_WIN, top = PIT_TOP) {
  const { nSym, G, bi, syms } = pool;
  const elig = Array.from({ length: nSym }, () => new Uint8Array(G));

  // ชั้นที่ 1: ค่าเฉลี่ยช่วงกว้างของแท่ง และมูลค่าซื้อขาย จากหน้าต่างย้อนหลังของตัวเอง
  const rangeAt = [];   // ดัชนีตามแท่งของตัวเอง
  const turnAt = [];
  for (let s = 0; s < nSym; s++) {
    const cs = syms[s].candles;
    const n = cs.length;
    const rg = new Float64Array(n).fill(NaN);
    const tn = new Float64Array(n).fill(NaN);
    let sr = 0; let st = 0; let cnt = 0;
    const q = [];   // คิวของค่าที่ยังอยู่ในหน้าต่าง (เก็บเป็นคู่ [range, turnover])
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      if (isUsableBar(c) && c.close > 0) {
        const rv = (c.high - c.low) / c.close;
        const tv = (c.volume ?? 0) * c.close;
        q.push([rv, tv]); sr += rv; st += tv; cnt++;
      } else {
        q.push(null);
      }
      if (q.length > win) {
        const old = q.shift();
        if (old) { sr -= old[0]; st -= old[1]; cnt--; }
      }
      // ต้องมีข้อมูลจริงอย่างน้อย 60% ของหน้าต่าง ถึงจะถือว่ารู้จักตัวนี้พอ
      if (cnt >= Math.ceil(win * 0.6)) { rg[i] = sr / cnt; tn[i] = st / cnt; }
    }
    rangeAt.push(rg); turnAt.push(tn);
  }

  // ชั้นที่ 2: ทุกก้าว เลือกตัวที่ซิ่งที่สุดในบรรดาตัวที่สภาพคล่องไม่ต่ำกว่ามัธยฐาน
  for (let k = 0; k < G; k++) {
    const cand = [];
    for (let s = 0; s < nSym; s++) {
      if (!candidates.has(syms[s].symbol)) continue;
      const i = bi[s][k];
      if (i < 0 || i < win) continue;                    // ประวัติของตัวเองต้องยาวพอจริง
      const rv = rangeAt[s][i]; const tv = turnAt[s][i];
      if (!Number.isFinite(rv) || !Number.isFinite(tv)) continue;
      cand.push({ s, rv, tv });
    }
    if (cand.length < 3) continue;                       // น้อยกว่านี้ "อันดับความซิ่ง" ไม่มีความหมาย
    const tsorted = cand.map((c) => c.tv).sort((a, b) => a - b);
    const tmed = percentileOfSorted(tsorted, 0.5);
    const liquid = cand.filter((c) => c.tv >= tmed);
    liquid.sort((a, b) => b.rv - a.rv);                  // ซิ่งมากไปน้อย
    for (const c of liquid.slice(0, top)) elig[c.s][k] = 1;
  }
  return elig;
}

// ═══════════════════════ ตัวนำข้ามตลาด (as-of join บนเวลาปิดจริง) ═══════════════════════

/**
 * สร้างอนุกรม "ตัวนำ" หนึ่งตัว: ผลตอบแทน 1 แท่งล่าสุด พร้อมเวลาปิดของแท่งนั้น
 * ตัวนำสังเคราะห์ (DXY) ประกอบจากคู่เงินหลายคู่บนตารางเวลาของกลุ่ม FOREX
 */
function buildLeader(spec, datasets, timeframe, pools) {
  const [kind, name] = spec.split('|');
  if (kind === 'SYNTH' && name === 'DXY') {
    const pool = pools[`FOREX|${timeframe}`];
    if (!pool) return null;
    const feats = pool._feat;
    const { nSym, G, bi, syms } = pool;
    const legSign = new Map(DXY_LEGS);
    const ret = new Float64Array(G).fill(NaN);
    for (let k = 0; k < G; k++) {
      let sum = 0; let cnt = 0;
      for (let s = 0; s < nSym; s++) {
        const sg = legSign.get(syms[s].symbol);
        if (!sg || bi[s][k] < 0) continue;
        const v = feats.r[s][k];
        if (Number.isFinite(v)) { sum += sg * v; cnt++; }
      }
      if (cnt >= DXY_MIN_LEGS) ret[k] = sum / cnt;
    }
    return { label: 'DXY (สังเคราะห์)', closeMs: pool.closeMs, ret, G };
  }
  const ds = datasets.find((d) => d.market === kind && d.symbol === name && d.timeframe === timeframe);
  if (!ds || ds.candles.length < 2) return null;
  const G = ds.candles.length;
  const closeMs = new Float64Array(G);
  const ret = new Float64Array(G).fill(NaN);
  for (let i = 0; i < G; i++) {
    closeMs[i] = barCloseMs(ds.market, ds.timeframe, ds.times[i]);
    if (i >= 1 && isUsableBar(ds.candles[i]) && isUsableBar(ds.candles[i - 1]) && ds.candles[i - 1].close > 0) {
      ret[i] = Math.log(ds.candles[i].close / ds.candles[i - 1].close);
    }
  }
  return { label: `${kind}/${name}`, closeMs, ret, G };
}

/**
 * as-of join: สำหรับทุกก้าวของเป้าหมาย หาแท่งล่าสุดของตัวนำที่ **ปิดไปแล้ว**
 * ทั้งสองอาร์เรย์เรียงเวลาอยู่แล้ว จึงเดินสองตัวชี้ครั้งเดียวจบ
 * คืนดัชนีของตัวนำ (−1 = ยังไม่มีแท่งไหนของตัวนำปิดก่อนเวลานั้น)
 */
function asofJoin(targetCloseMs, leaderCloseMs) {
  const out = new Int32Array(targetCloseMs.length).fill(-1);
  let j = -1;
  for (let k = 0; k < targetCloseMs.length; k++) {
    while (j + 1 < leaderCloseMs.length && leaderCloseMs[j + 1] <= targetCloseMs[k]) j++;
    out[k] = j;
  }
  return out;
}

// ═══════════════════════════ สร้างตารางแถวสำหรับวัดผล ═══════════════════════════

const monthKey = (ms) => { const d = new Date(ms); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const weekKey = (ms) => Math.floor(ms / (7 * 24 * HOUR));

/**
 * ตารางแถว: หนึ่งแถว = หนึ่ง (สัญลักษณ์ × แท่ง) ที่อยู่ในชุด train และมีค่าครบ
 * เก็บ feature ทุกตัว + ผลตอบแทนข้างหน้าทุกหน้าต่าง + ค่าธรรมเนียมของไม้นั้น
 *
 * ⚠ เงื่อนไข "มีค่าครบทุก feature" ทำให้ทุก feature ถูกวัดบนแท่งชุดเดียวกันเป๊ะ
 *   ไม่งั้นตัวที่เริ่มมีค่าช้ากว่าจะได้ตลาดคนละยุคกัน แล้วเทียบกันไม่ได้
 */
function buildRows(pool, feats, evalSymbols, trainEndMs, leaders, eligMask = null) {
  const { nSym, G, bi, syms, grid, market, timeframe } = pool;
  const featNames = [...CS_NAMES, ...GRP_NAMES];
  const lagNames = CS_NAMES.map((n) => `${n}@lag1`);
  const leaderNames = Object.keys(leaders);
  const cols = [...featNames, ...lagNames, ...leaderNames];

  // step = ก้าวบนตารางเวลารวม — ต้องเก็บไว้ เพราะ IC ข้ามหน้าตัดต้องจับแถวที่ "เวลาเดียวกัน" มารวมกัน
  const rows = { block: [], step: [], y: HORIZONS.map(() => []), fee: [], sym: [], f: {} };
  for (const c of cols) rows.f[c] = [];
  const stat = { candidates: 0, kept: 0, dropWarmup: 0, dropFeature: 0, dropSpill: 0, dropOwnHist: 0 };

  const kf = timeframe === '1D' ? monthKey : weekKey;
  const maxH = Math.max(...HORIZONS);

  for (let s = 0; s < nSym; s++) {
    if (!evalSymbols.has(syms[s].symbol)) continue;
    const cs = syms[s].candles;
    const trainEndIdx = lowerBound(syms[s].times, trainEndMs);   // แท่งแรกที่อยู่นอก train
    for (let k = 0; k < G; k++) {
      const i = bi[s][k];
      if (i < 0) continue;
      if (i >= trainEndIdx) break;                 // เข้าเขต validation แล้ว หยุดทันที
      // หน้ากากสิทธิ์รายก้าว (ใช้กับ RUNNER_PIT) — สมาชิกจักรวาลเปลี่ยนได้ทุกแท่ง
      if (eligMask && !eligMask[s][k]) continue;
      stat.candidates++;
      if (k < WARMUP) { stat.dropWarmup++; continue; }
      if (i < MIN_OWN_BARS) { stat.dropOwnHist++; continue; }
      // หน้าต่างข้างหน้าต้องจบภายใน train ทั้งหมด — ไม่ยอมให้ล้ำเข้า validation แม้แท่งเดียว
      if (i + maxH >= trainEndIdx) { stat.dropSpill++; continue; }

      let ok = true;
      for (const c of featNames) { if (!Number.isFinite(feats.F[c][s][k])) { ok = false; break; } }
      if (ok) for (const n of CS_NAMES) { if (k < 1 || !Number.isFinite(feats.F[n][s][k - 1])) { ok = false; break; } }
      if (!ok) { stat.dropFeature++; continue; }

      const entry = cs[i].close;
      let yOk = true;
      const ys = [];
      for (const h of HORIZONS) {
        const c2 = cs[i + h];
        if (!isUsableBar(c2) || !(entry > 0)) { yOk = false; break; }
        ys.push(c2.close / entry - 1);
      }
      if (!yOk) { stat.dropFeature++; continue; }

      const atr = atrAt(cs, i);
      const atrUse = Number.isFinite(atr) && atr > 0 ? atr : entry * GEO.atrFallbackPct;
      const stopDistPct = (atrUse * GEO.slAtrMult) / entry;
      const fee = feeFractionFor(market, syms[s].symbol, entry, stopDistPct);

      rows.block.push(kf(grid[k]));
      rows.step.push(k);
      rows.sym.push(s);
      rows.fee.push(fee);
      for (let hi = 0; hi < HORIZONS.length; hi++) rows.y[hi].push(ys[hi]);
      for (const c of featNames) rows.f[c].push(feats.F[c][s][k]);
      for (let ci = 0; ci < CS_NAMES.length; ci++) rows.f[lagNames[ci]].push(feats.F[CS_NAMES[ci]][s][k - 1]);
      for (const ln of leaderNames) {
        const L = leaders[ln];
        const j = L.map[k];
        rows.f[ln].push(j >= 0 ? L.ret[j] : NaN);
      }
      stat.kept++;
    }
  }
  return { rows, cols, stat, featNames, lagNames, leaderNames };
}

// ═══════════════════════════════ การวัดผล ═══════════════════════════════

/** อันดับเศษส่วน (เฉลี่ยเมื่อค่าเท่ากัน) ของค่าที่ใช้ได้ — ใช้ทำ Spearman */
function ranksOf(values, mask) {
  const idx = [];
  for (let i = 0; i < values.length; i++) if (mask[i]) idx.push(i);
  idx.sort((a, b) => values[a] - values[b]);
  const out = new Float64Array(values.length).fill(NaN);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[i]]) j++;
    const avg = (i + j) / 2;
    for (let t = i; t <= j; t++) out[idx[t]] = avg;
    i = j + 1;
  }
  return { rank: out, n: idx.length };
}

/** แปลงอันดับเป็นค่ามาตรฐาน (mean 0, sd 1) เพื่อให้ค่าเฉลี่ยของผลคูณ = Spearman พอดี */
function standardizeInPlace(rank, mask) {
  let sum = 0; let sum2 = 0; let n = 0;
  for (let i = 0; i < rank.length; i++) if (mask[i] && Number.isFinite(rank[i])) { sum += rank[i]; sum2 += rank[i] * rank[i]; n++; }
  if (!n) return false;
  const m = sum / n;
  const sd = Math.sqrt(Math.max(0, sum2 / n - m * m));
  if (!(sd > 0)) return false;
  for (let i = 0; i < rank.length; i++) if (mask[i] && Number.isFinite(rank[i])) rank[i] = (rank[i] - m) / sd;
  return true;
}

// ═══════════════════════════════ การเขียนรายงาน ═══════════════════════════════

const LINES = [];
const W = (s = '') => LINES.push(s);
const bpsS = (v, d = 2) => (Number.isFinite(v) ? (v * 10000).toFixed(d) : '—');
const pS = (p) => (!Number.isFinite(p) ? '—' : (p < 1e-4 ? p.toExponential(1) : p.toFixed(4)));
const pctS = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const num = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');

// ════════════════════════════════════ MAIN ════════════════════════════════════

async function main() {
  const t0 = Date.now();
  const bounds = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
  const OUT = {
    generatedAt: new Date().toISOString(), opt: OPT,
    scope: {}, meter: {}, audit: {}, timing: {}, cells: {}, leadlag: {}, tests: [],
  };

  // ── โหลดคลังทั้งหมด ────────────────────────────────────────────────────────
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
  const datasets = [];
  const dropped = [];
  for (const f of files) {
    const ds = loadDataset(f);
    if (ds.verdict === 'bad' || !ds.candles.length) { dropped.push(f); continue; }
    datasets.push(ds);
  }

  // ── คัดหุ้นซิ่ง จาก train ของ 1H เท่านั้น (นิยามเดียวกับ ceiling.mjs) ──────────
  const trainEnd1H = Date.parse(bounds.timeframes['1H'].trainEnd);
  const trainEnd = { '1D': Date.parse(bounds.timeframes['1D'].trainEnd), '1H': trainEnd1H };
  const runnerSet = new Set();
  for (const ds of datasets) {
    if (ds.market !== 'TH_STOCK' || ds.timeframe !== '1H') continue;
    if (SET50_SYMBOLS.includes(ds.symbol)) continue;
    const p = thTrainProfile(ds, trainEnd1H);
    if (p.barRangePct >= RUNNER_RULE.minBarRangePct && p.turnover >= RUNNER_RULE.minTurnoverBaht
      && p.bars >= RUNNER_RULE.minBars) runnerSet.add(ds.symbol);
  }
  const pitCandidates = new Set();
  for (const ds of datasets) {
    if (ds.market !== 'TH_STOCK' || ds.timeframe !== '1D') continue;
    if (SET50_SYMBOLS.includes(ds.symbol)) continue;
    pitCandidates.add(ds.symbol);
  }
  const evalSymbolsOf = (group) => {
    if (group === 'SET50') return new Set(SET50_SYMBOLS);
    if (group === 'RUNNER') return new Set(runnerSet);
    if (group === 'RUNNER_PIT') return new Set(pitCandidates);
    return null;  // ใช้ทุกตัวใน pool
  };
  const marketOfGroup = (g) => ((g === 'SET50' || g === 'RUNNER' || g === 'RUNNER_PIT') ? 'TH_STOCK' : g);

  // ── สร้าง pool + feature ทุกตลาด/กรอบเวลาที่ต้องใช้ ───────────────────────────
  const needed = new Set();
  for (const g of GROUPS_1D) needed.add(`${marketOfGroup(g)}|1D`);
  for (const g of GROUPS_1H) needed.add(`${marketOfGroup(g)}|1H`);
  needed.add('FOREX|1D'); needed.add('FOREX|1H');   // ต้องใช้สร้าง DXY

  const pools = {};
  for (const key of needed) {
    const [mk, tf] = key.split('|');
    const p = buildPool(datasets, mk, tf);
    if (!p) continue;
    p._feat = buildFeatures(p, false);
    pools[key] = p;
  }

  // หน้ากาก "ใครเป็นหุ้นซิ่ง ณ ก้าวนั้น" — คำนวณครั้งเดียว ใช้ทั้งการวัดผลและการตรวจ C1
  const pitMask = pools['TH_STOCK|1D'] ? buildRunnerPIT(pools['TH_STOCK|1D'], pitCandidates) : null;

  OUT.scope = {
    groups1D: GROUPS_1D, groups1H: GROUPS_1H, horizons: HORIZONS,
    runnerSet: [...runnerSet].sort(), droppedFiles: dropped,
    pools: Object.fromEntries(Object.entries(pools).map(([k, p]) => [k, {
      symbols: p.syms.map((d) => d.symbol), nSym: p.nSym, gridSteps: p.G, minPool: p.minPool,
      first: new Date(p.grid[0]).toISOString(), last: new Date(p.grid[p.G - 1]).toISOString(),
    }])),
    whySkip1HThai: 'exp-ceiling.md วัดแล้วว่า p* ของหุ้นไทย 1H อยู่ที่ 71–108% = ต่อให้เดาถูกก็ไม่คุ้มค่าธรรมเนียม',
  };

  // ══════════════════ C0 · ตรวจเครื่องวัด ══════════════════
  // ATR ที่เขียนใหม่ในไฟล์นี้ (ใช้คิดขนาดคำสั่ง → ค่าคอมขั้นต่ำของหุ้นไทย)
  // ต้องเท่ากับ ATR ตัวจริงใน src/lib/indicators.ts ทุกบิต ไม่งั้นเส้นค่าธรรมเนียมผิด
  const meter = { atrChecked: 0, atrMaxErr: 0, feeSamples: {} };
  if (OPT.parity) {
    const { indicators } = await loadSrcModules(['src/lib/indicators.ts']);
    for (const ds of datasets) {
      const step = Math.max(1, Math.floor(ds.candles.length / 120));
      for (let i = MIN_OWN_BARS; i < ds.candles.length; i += step) {
        const mine = atrAt(ds.candles, i);
        const real = indicators.ATR(ds.candles.slice(0, i + 1), GEO.atrPeriod);
        meter.atrChecked++;
        const d = Math.abs(mine - real);
        if (Number.isFinite(d)) meter.atrMaxErr = Math.max(meter.atrMaxErr, d);
      }
    }
  }
  OUT.meter = meter;

  // ══════════════════ C1 · ตรวจ look-ahead ด้วยการตัดท้ายทิ้ง ══════════════════
  //
  // คำนวณ feature บนชุดเต็ม → ตัดท้ายทิ้ง → คำนวณซ้ำ → ค่าของก้าวเก่าต้องเท่าเดิมทุกบิต
  // ตระกูลนี้เสี่ยงเป็นพิเศษ เพราะ feature หนึ่งตัวอ่านข้อมูลของ **ทุกสัญลักษณ์**
  // การรั่วจึงอาจเข้ามาทางเพื่อนร่วมกลุ่มโดยที่โค้ดของตัวเองดูสะอาด
  const audit = {
    pools: 0, compared: 0, mismatch: 0, perFeature: {},
    leakCompared: 0, leakChanged: 0, perLeak: {},
    leaderCompared: 0, leaderMismatch: 0, perLeader: {},
    pitCompared: 0, pitMismatch: 0,                 // หน้ากากหุ้นซิ่งแบบ point-in-time
    pitLeakCompared: 0, pitLeakChanged: 0,          // ตัวควบคุมเชิงบวกของ "การรั่วที่การเลือกตัว"
    gridPrefixOk: true,
    cutAt: {},
  };
  const auditFeatNames = [...CS_NAMES, ...GRP_NAMES];
  for (const n of auditFeatNames) audit.perFeature[n] = { compared: 0, mismatch: 0 };
  for (const n of ['LEAK_zFull', 'LEAK_fwd5']) audit.perLeak[n] = { compared: 0, changed: 0 };

  /** ตัดท้ายชุดข้อมูลทิ้งจริง ๆ — ผลลัพธ์เหมือน loadDataset(file, cutTs) ทุกประการ */
  const truncateDataset = (ds, maxTs) => {
    let n = ds.times.length;
    while (n > 0 && ds.times[n - 1] > maxTs) n--;
    return { ...ds, candles: ds.candles.slice(0, n), times: ds.times.slice(0, n) };
  };

  // จุดตัดเป็น "วันที่" เดียวกันทั้งกรอบเวลา เพื่อให้การตรวจข้ามตลาดสอดคล้องกัน
  const cutTsOf = {};
  for (const tf of ['1D', '1H']) {
    const all = [];
    for (const d of datasets) if (d.timeframe === tf) for (const t of d.times) all.push(t);
    all.sort((a, b) => a - b);
    cutTsOf[tf] = all[Math.floor(all.length * OPT.truncFrac)];
    audit.cutAt[tf] = new Date(cutTsOf[tf]).toISOString();
  }
  const datasetsCut = datasets.map((d) => truncateDataset(d, cutTsOf[d.timeframe]));

  const poolsCut = {};
  for (const key of Object.keys(pools)) {
    const [mk, tf] = key.split('|');
    const full = pools[key];
    const poolCut = buildPool(datasetsCut, mk, tf);
    if (!poolCut) continue;
    const featFull = buildFeatures(full, true);
    const featCut = buildFeatures(poolCut, true);
    poolCut._feat = featCut;
    poolsCut[key] = poolCut;
    audit.pools++;

    // จับคู่สัญลักษณ์ด้วย "ชื่อ" ไม่ใช่ดัชนี — ตัวที่เพิ่งเข้าตลาดอาจหายไปหลังตัดท้าย
    const cutIdx = new Map(poolCut.syms.map((d, i) => [d.symbol, i]));
    const nK = poolCut.G;
    for (const name of [...auditFeatNames, 'LEAK_zFull', 'LEAK_fwd5']) {
      const isLeak = name.startsWith('LEAK_');
      const rec = isLeak ? audit.perLeak[name] : audit.perFeature[name];
      for (let s = 0; s < full.nSym; s++) {
        const s2 = cutIdx.get(full.syms[s].symbol);
        if (s2 === undefined) continue;
        const a = featFull.F[name][s]; const b = featCut.F[name][s2];
        for (let k = 0; k < nK; k++) {
          const va = a[k]; const vb = b[k];
          const same = (!Number.isFinite(va) && !Number.isFinite(vb)) || va === vb;
          if (isLeak) { audit.leakCompared++; rec.compared++; if (!same) { audit.leakChanged++; rec.changed++; } }
          else { audit.compared++; rec.compared++; if (!same) { audit.mismatch++; rec.mismatch++; } }
        }
      }
    }
  }
  // ── ตรวจหน้ากาก "หุ้นซิ่ง ณ เวลานั้น" ด้วยวิธีเดียวกัน ────────────────────────
  // การรั่วชนิดนี้อยู่ที่ "ใครถูกเลือกเข้ามาวัด" ไม่ใช่ที่ค่า feature จึงต้องตรวจแยก
  if (pitMask && poolsCut['TH_STOCK|1D']) {
    const full = pools['TH_STOCK|1D'];
    const cut = poolsCut['TH_STOCK|1D'];
    const cutIdx = new Map(cut.syms.map((d, i) => [d.symbol, i]));
    // ตารางเวลาของชุดที่ตัดแล้ว ต้องเป็นส่วนหน้าของตารางเวลาชุดเต็มเป๊ะ ไม่งั้นเทียบก้าวต่อก้าวไม่ได้
    for (let k = 0; k < cut.G; k++) if (cut.grid[k] !== full.grid[k]) { audit.gridPrefixOk = false; break; }

    const maskCut = buildRunnerPIT(cut, pitCandidates);
    for (let s = 0; s < full.nSym; s++) {
      const s2 = cutIdx.get(full.syms[s].symbol);
      if (s2 === undefined) continue;
      for (let k = 0; k < cut.G; k++) {
        audit.pitCompared++;
        if (pitMask[s][k] !== maskCut[s2][k]) audit.pitMismatch++;
      }
    }

    // ตัวควบคุมเชิงบวก: คัดหุ้นซิ่งด้วยสถิติของ "ทั้งชุด" (= วิธีที่ RUNNER เดิมใช้โดยปริยาย)
    // ถ้าเครื่องตรวจนี้มีฟันจริง ต้องจับได้ว่าหน้ากากแบบนั้นเปลี่ยนเมื่อข้อมูลท้ายถูกตัด
    const leakMaskOf = (p) => {
      const stats = [];
      for (let s = 0; s < p.nSym; s++) {
        if (!pitCandidates.has(p.syms[s].symbol)) { stats.push(NaN); continue; }
        let sum = 0; let cnt = 0;
        for (const c of p.syms[s].candles) {
          if (!isUsableBar(c) || !(c.close > 0)) continue;
          sum += (c.high - c.low) / c.close; cnt++;
        }
        stats.push(cnt ? sum / cnt : NaN);           // ค่าเฉลี่ยของ "ทั้งชุด" = อ่านอนาคต
      }
      const order = stats.map((v, s) => ({ v, s })).filter((o) => Number.isFinite(o.v))
        .sort((a, b) => b.v - a.v).slice(0, PIT_TOP).map((o) => o.s);
      const chosen = new Set(order);
      const m = Array.from({ length: p.nSym }, () => new Uint8Array(p.G));
      for (let s = 0; s < p.nSym; s++) if (chosen.has(s)) for (let k = 0; k < p.G; k++) if (p.bi[s][k] >= 0) m[s][k] = 1;
      return m;
    };
    const leakFull = leakMaskOf(full);
    const leakCut = leakMaskOf(cut);
    for (let s = 0; s < full.nSym; s++) {
      const s2 = cutIdx.get(full.syms[s].symbol);
      if (s2 === undefined) continue;
      for (let k = 0; k < cut.G; k++) {
        audit.pitLeakCompared++;
        if (leakFull[s][k] !== leakCut[s2][k]) audit.pitLeakChanged++;
      }
    }
  }

  OUT.audit = audit;

  // ══════════════════ C2 · เวลาข้ามตลาด — สร้างตัวนำและตรวจความหน่วงจริง ══════════════════
  const timing = [];
  const leadersByTarget = {};   // `${group}|${tf}` → { name → {ret, map, label} }
  for (const pair of LEADLAG_PAIRS) {
    for (const tf of pair.tfs) {
      const group = pair.target;
      const mk = marketOfGroup(group);
      const pool = pools[`${mk}|${tf}`];
      if (!pool) continue;
      const L = buildLeader(pair.leader, datasets, tf, pools);
      if (!L) continue;
      const map = asofJoin(pool.closeMs, L.closeMs);

      // ตรวจว่าไม่มีก้าวไหนใช้ข้อมูลที่ยังไม่ปิด และวัดความหน่วงจริงเป็นชั่วโมง
      let violations = 0; let matched = 0;
      const lags = [];
      for (let k = 0; k < pool.G; k++) {
        const j = map[k];
        if (j < 0) continue;
        matched++;
        const lag = (pool.closeMs[k] - L.closeMs[j]) / HOUR;
        if (lag < 0) violations++;
        lags.push(lag);
      }
      lags.sort((a, b) => a - b);
      const key = `${group}|${tf}`;
      (leadersByTarget[key] = leadersByTarget[key] || {})[pair.id] = { ret: L.ret, map, label: L.label };

      // ตรวจ look-ahead ของ "การจับคู่ข้ามตลาด" เอง: ตัดท้ายทิ้งแล้วจับคู่ใหม่
      // ค่าที่ก้าวเก่าต้องเท่าเดิม ถ้าเปลี่ยนแปลว่าการจับคู่ไปหยิบแท่งที่ยังไม่เกิด
      let lCompared = 0; let lMismatch = 0; let lBoundary = 0;
      const poolCut = poolsCut[`${mk}|${tf}`];
      const Lcut = poolCut ? buildLeader(pair.leader, datasetsCut, tf, poolsCut) : null;
      if (poolCut && Lcut) {
        const mapCut = asofJoin(poolCut.closeMs, Lcut.closeMs);
        for (let k = 0; k < poolCut.G; k++) {
          // แท่งที่ "ปิดหลังจุดตัด" ย่อมต่างกันได้ตามธรรมชาติ เพราะโลกที่ถูกตัดยังไม่มีข้อมูลนั้นจริง ๆ
          // นับแยกไว้เป็น boundary ไม่ใช่การรั่ว — ที่ต้องเท่ากันเป๊ะคือแท่งที่ตัดสินใจก่อนจุดตัด
          if (poolCut.closeMs[k] > cutTsOf[tf]) { lBoundary++; continue; }
          const a = map[k] >= 0 ? L.ret[map[k]] : NaN;
          const b = mapCut[k] >= 0 ? Lcut.ret[mapCut[k]] : NaN;
          lCompared++;
          const same = (!Number.isFinite(a) && !Number.isFinite(b)) || a === b;
          if (!same) lMismatch++;
        }
        audit.leaderCompared += lCompared;
        audit.leaderMismatch += lMismatch;
        audit.perLeader[`${pair.id}|${tf}`] = { compared: lCompared, mismatch: lMismatch, boundarySkipped: lBoundary };
      }

      timing.push({
        pair: pair.id, leader: L.label, target: group, timeframe: tf, why: pair.why,
        matchedSteps: matched, violations,
        lagMinH: lags.length ? lags[0] : NaN,
        lagMedH: percentileOfSorted(lags, 0.5),
        lagMaxH: lags.length ? lags[lags.length - 1] : NaN,
        truncCompared: lCompared, truncMismatch: lMismatch,
      });
    }
  }
  OUT.timing = timing;

  // ══════════════════ C3–C7 · วัดผลทุกช่อง ══════════════════
  const cells = [];
  const leadlagCells = [];
  const rng = mulberry32(OPT.seed);

  const jobs = [];
  for (const g of GROUPS_1D) jobs.push({ group: g, tf: '1D' });
  for (const g of GROUPS_1H) jobs.push({ group: g, tf: '1H' });

  for (const job of jobs) {
    const mk = marketOfGroup(job.group);
    const pool = pools[`${mk}|${job.tf}`];
    if (!pool) continue;
    const evalSet = evalSymbolsOf(job.group) ?? new Set(pool.syms.map((d) => d.symbol));
    const leaders = leadersByTarget[`${job.group}|${job.tf}`] || {};

    const mask = job.group === 'RUNNER_PIT' ? pitMask : null;
    const built = buildRows(pool, pool._feat, evalSet, trainEnd[job.tf], leaders, mask);
    const { rows, stat, featNames, lagNames, leaderNames } = built;
    const N = rows.block.length;
    if (N < 200) {
      // อธิบายให้ชัดว่าทำไมวัดไม่ได้ — "จำนวนตัวที่มีข้อมูลพร้อมกันสูงสุดในชุด train"
      // คือตัวเลขที่ตัดสิน เพราะจัดอันดับข้ามตัวต้องมีอย่างน้อย minPool ตัวพร้อมกัน
      let maxTogether = 0;
      const trainBars = {};
      for (let s = 0; s < pool.nSym; s++) trainBars[pool.syms[s].symbol] = 0;
      for (let k = 0; k < pool.G; k++) {
        let c2 = 0;
        for (let s = 0; s < pool.nSym; s++) {
          if (pool.bi[s][k] < 0) continue;
          if (pool.grid[k] >= trainEnd[job.tf]) continue;
          c2++; trainBars[pool.syms[s].symbol]++;
        }
        if (c2 > maxTogether) maxTogether = c2;
      }
      cells.push({
        group: job.group, tf: job.tf, n: N, insufficient: true, stat,
        why: { minPoolNeeded: pool.minPool, maxSymbolsTogetherInTrain: maxTogether, trainBarsPerSymbol: trainBars },
      });
      continue;
    }

    // กลุ่มเวลา (เดือนสำหรับ 1D · สัปดาห์สำหรับ 1H)
    const blockIds = [...new Set(rows.block)].sort((a, b) => a - b);
    const blockIndex = new Map(blockIds.map((b, i) => [b, i]));
    const nBlocks = blockIds.length;
    const rowBlock = Int32Array.from(rows.block.map((b) => blockIndex.get(b)));

    // ดัชนีสุ่มสำหรับ bootstrap — ใช้ชุดเดียวกันทุก feature ในกลุ่มนี้ เพื่อให้เทียบกันได้
    const B = OPT.bootstrap;
    const resample = new Int32Array(B * nBlocks);
    for (let b = 0; b < B; b++) for (let j = 0; j < nBlocks; j++) resample[b * nBlocks + j] = Math.floor(rng() * nBlocks);

    const feeArr = Float64Array.from(rows.fee);
    const feeSorted = Array.from(feeArr).filter(Number.isFinite).sort((a, b) => a - b);
    const feeMed = percentileOfSorted(feeSorted, 0.5);

    // อันดับของผลตอบแทนข้างหน้า (คำนวณครั้งเดียวต่อหน้าต่าง) และ σ ของผลตอบแทน
    const maskAll = new Uint8Array(N).fill(1);
    const yArr = []; const yRank = []; const ySigma = [];
    for (let hi = 0; hi < HORIZONS.length; hi++) {
      const y = Float64Array.from(rows.y[hi]);
      yArr.push(y);
      const { rank } = ranksOf(y, maskAll);
      standardizeInPlace(rank, maskAll);
      yRank.push(rank);
      let sum = 0; let sum2 = 0;
      for (let i = 0; i < N; i++) { sum += y[i]; sum2 += y[i] * y[i]; }
      const m = sum / N;
      ySigma.push(Math.sqrt(Math.max(0, sum2 / N - m * m)));
    }

    // ครึ่งแรก/ครึ่งหลังของ train (แบ่งตามเวลา) — ใช้ดูว่าผลมาจากยุคเดียวหรือกระจายทั้งช่วง
    // ตัวเลขนี้เป็นการบรรยาย ไม่ได้ตั้งเป็นการทดสอบ และไม่ถูกใช้เลือกอะไร จึงไม่เข้าบัญชี Holm
    const stepsSorted = [...rows.step].sort((a, b) => a - b);
    const midStep = percentileOfSorted(stepsSorted, 0.5);
    const half = new Uint8Array(N);
    for (let i = 0; i < N; i++) half[i] = rows.step[i] > midStep ? 1 : 0;

    const counts = new Float64Array(nBlocks);
    const sums = new Float64Array(nBlocks);
    const sums2 = new Float64Array(nBlocks);
    const sums4 = new Float64Array(nBlocks);

    // ผลตอบแทนเฉลี่ยของ "ถือเฉย ๆ" ในแต่ละหน้าต่าง — เส้นเทียบที่ขาดไม่ได้สำหรับ feature ระดับกลุ่ม
    const drift = [];
    for (let hi = 0; hi < HORIZONS.length; hi++) {
      let s2 = 0;
      for (let i = 0; i < N; i++) s2 += yArr[hi][i];
      drift.push(s2 / N);
    }

    const measure = (fvalsRaw, mask, hi, opts) => {
      const y = yArr[hi];
      const { rank: fRank, n } = ranksOf(fvalsRaw, mask);
      if (n < 200) return null;
      const okStd = standardizeInPlace(fRank, mask);
      // ผลตอบแทนต้องจัดอันดับใหม่บนกลุ่มย่อยเดียวกัน ถ้า mask ไม่ใช่ทั้งหมด
      let yr = yRank[hi];
      if (opts.subset) {
        const { rank } = ranksOf(y, mask);
        standardizeInPlace(rank, mask);
        yr = rank;
      }
      if (!okStd) return null;

      counts.fill(0); sums.fill(0); sums2.fill(0); sums4.fill(0);
      let hit = 0; let hitN = 0; let longN = 0; let nUsed = 0;
      const hs = [[0, 0, 0, 0], [0, 0, 0, 0]];   // [ครึ่ง][sumIC, nIC, sumDir, nDir]
      const dbar = drift[hi];
      for (let i = 0; i < N; i++) {
        if (!mask[i]) continue;
        const b = rowBlock[i];
        counts[b] += 1; nUsed++;
        const icTerm = fRank[i] * yr[i];
        sums[b] += icTerm;                                 // Spearman = ค่าเฉลี่ยของผลคูณอันดับมาตรฐาน
        const sgn = fvalsRaw[i] > 0 ? 1 : (fvalsRaw[i] < 0 ? -1 : 0);
        const dirTerm = sgn * y[i];
        sums2[b] += dirTerm;                               // ผลตอบแทนของกลยุทธ์ "ตามเครื่องหมาย feature"
        sums4[b] += sgn * (y[i] - dbar);                   // เดียวกันแต่หักผลตอบแทนเฉลี่ยของกลุ่มออก
        if (sgn > 0) longN++;
        if (sgn !== 0 && y[i] !== 0) { hitN++; if (sgn * y[i] > 0) hit++; }
        const hh = hs[half[i]];
        hh[0] += icTerm; hh[1] += 1; hh[2] += dirTerm; hh[3] += 1;
      }
      const ic = clusterMean(counts, sums);
      const icCI = clusterBootstrapCI(counts, sums, resample, B, nBlocks);
      const dir = clusterMean(counts, sums2);
      const dirCI = clusterBootstrapCI(counts, sums2, resample, B, nBlocks);
      const dirND = clusterMean(counts, sums4);
      const dirNDCI = clusterBootstrapCI(counts, sums4, resample, B, nBlocks);

      // สเปรดควินไทล์: บนสุด 20% ลบล่างสุด 20% ของ feature (ตัดสินด้วยอันดับในตัวอย่าง train)
      const vals = [];
      for (let i = 0; i < N; i++) if (mask[i] && Number.isFinite(fvalsRaw[i])) vals.push(fvalsRaw[i]);
      vals.sort((a, b) => a - b);
      const qLo = percentileOfSorted(vals, 0.2);
      const qHi = percentileOfSorted(vals, 0.8);
      let sHi = 0; let nHi = 0; let sLo = 0; let nLo = 0;
      for (let i = 0; i < N; i++) {
        if (!mask[i]) continue;
        if (fvalsRaw[i] >= qHi) { sHi += y[i]; nHi++; }
        else if (fvalsRaw[i] <= qLo) { sLo += y[i]; nLo++; }
      }
      const spread = (nHi && nLo) ? (sHi / nHi - sLo / nLo) : NaN;

      return {
        n, G: ic.G, ic: ic.mean, icSe: ic.se, icP: ic.p, icCI,
        dir: dir.mean, dirP: dir.p, dirCI,
        dirND: dirND.mean, dirNDP: dirND.p, dirNDCI,
        drift: dbar, longShare: nUsed ? longN / nUsed : NaN,
        hit: hitN ? hit / hitN : NaN, hitN,
        spread, sigma: ySigma[hi],
        icToBps: ic.mean * ySigma[hi] * Math.sqrt(2 / Math.PI),  // ค่าที่ทฤษฎีทำนายสำหรับกลยุทธ์ ±1
        icH1: hs[0][1] ? hs[0][0] / hs[0][1] : NaN, icH2: hs[1][1] ? hs[1][0] / hs[1][1] : NaN,
        dirH1: hs[0][3] ? hs[0][2] / hs[0][3] : NaN, dirH2: hs[1][3] ? hs[1][2] / hs[1][3] : NaN,
      };
    };

    // แถวต่อสัญลักษณ์ — ต้องรายงาน เพราะกลุ่มที่ดูใหญ่อาจมีแค่ 2–3 ตัวที่มีข้อมูลในยุคนั้นจริง
    const symbolRows = {};
    for (let i = 0; i < N; i++) {
      const s = pool.syms[rows.sym[i]].symbol;
      symbolRows[s] = (symbolRows[s] || 0) + 1;
    }
    const cell = {
      group: job.group, tf: job.tf, n: N, nBlocks, stat,
      feeMed, symbols: [...evalSet].sort(), symbolRows,
      firstBar: new Date(pool.grid[stepsSorted[0]]).toISOString(),
      lastBar: new Date(pool.grid[stepsSorted[stepsSorted.length - 1]]).toISOString(),
      res: {},
    };

    for (const name of [...featNames, ...lagNames]) {
      const fv = Float64Array.from(rows.f[name]);
      for (let hi = 0; hi < HORIZONS.length; hi++) {
        const h = HORIZONS[hi];
        const m = measure(fv, maskAll, hi, { subset: false });
        if (!m) continue;
        const isLag = name.endsWith('@lag1');
        const famIC = isLag ? `LAG1|${job.tf}` : `IC|${job.tf}`;
        const famMoney = isLag ? `LAG1MONEY|${job.tf}` : `MONEY|${job.tf}`;
        cell.res[`${name}|${h}`] = m;
        registerTest({
          id: `${job.group}|${job.tf}|${name}|h${h}|IC`, family: famIC,
          question: `IC ของ ${name} ต่อผลตอบแทน ${h} แท่งข้างหน้า ใน${GROUP_LABEL[job.group]} ${job.tf} ต่างจากศูนย์ไหม`,
          group: job.group, tf: job.tf, feature: name, h, stat: 'IC',
          estimate: m.ic, ci: m.icCI, p: m.icP, n: m.n, G: m.G,
        });
        registerTest({
          id: `${job.group}|${job.tf}|${name}|h${h}|MONEY`, family: famMoney,
          question: `ผลตอบแทนของการเดินตามเครื่องหมาย ${name} (${h} แท่ง) ต่างจากศูนย์ไหม`,
          group: job.group, tf: job.tf, feature: name, h, stat: 'MONEY',
          estimate: m.dir, ci: m.dirCI, p: m.dirP, n: m.n, G: m.G, fee: feeMed,
        });
        // feature ระดับกลุ่มให้ค่าเดียวกันทุกตัว ณ เวลานั้น → ถ้ามันบอก "ซื้อ" บ่อยกว่า "ขาย"
        // ในตลาดที่มีแนวโน้มขึ้น มันจะได้กำไรจากแนวโน้ม ไม่ใช่จากพลังทำนาย
        // จึงต้องทดสอบซ้ำโดยหักผลตอบแทนเฉลี่ยของกลุ่มออกก่อน
        // (feature แบบอันดับข้ามตัวไม่ต้องทดสอบข้อนี้ เพราะครึ่งบน/ครึ่งล่างหักล้างแนวโน้มกันเองอยู่แล้ว)
        if (GRP_NAMES.includes(name)) {
          registerTest({
            id: `${job.group}|${job.tf}|${name}|h${h}|MONEYND`, family: `MONEYND|${job.tf}`,
            question: `หลังหักแนวโน้มของกลุ่มออกแล้ว ${name} (${h} แท่ง) ยังเหลือขอบไหม`,
            group: job.group, tf: job.tf, feature: name, h, stat: 'MONEYND',
            estimate: m.dirND, ci: m.dirNDCI, p: m.dirNDP, n: m.n, G: m.G, fee: feeMed,
          });
        }
      }
    }

    // ── ตระกูล IC ข้ามหน้าตัด (cross-sectional IC) เฉพาะ feature ที่จัดอันดับข้ามตัว ──
    // วัดคนละคำถามกับ IC ปกติ: "ทำนายว่าตัวไหนแรงกว่าตัวไหน" ไม่ใช่ "ทำนายว่าขึ้นหรือลง"
    for (const name of CS_NAMES) {
      for (let hi = 0; hi < HORIZONS.length; hi++) {
        const h = HORIZONS[hi];
        const xs = crossSectionalIC(rows, name, hi, rowBlock, nBlocks, resample, B);
        if (!xs) continue;
        cell.res[`${name}|${h}|XS`] = xs;
        registerTest({
          id: `${job.group}|${job.tf}|${name}|h${h}|ICXS`, family: `ICXS|${job.tf}`,
          question: `IC ข้ามหน้าตัดของ ${name} (${h} แท่ง) ใน${GROUP_LABEL[job.group]} ${job.tf} ต่างจากศูนย์ไหม`,
          group: job.group, tf: job.tf, feature: name, h, stat: 'ICXS',
          estimate: xs.ic, ci: xs.ci, p: xs.p, n: xs.n, G: xs.G,
        });
      }
    }

    // ── lead-lag: คู่ที่ตั้งสมมติฐานไว้ล่วงหน้าเท่านั้น ──────────────────────────
    for (const ln of leaderNames) {
      const fv = Float64Array.from(rows.f[ln]);
      // ถ้าตัวนำอยู่ในตลาดเดียวกับฝ่ายตาม ต้องตัด "ตัวนำทำนายตัวเอง" ออก ไม่งั้นเป็นการโกงตัวเอง
      // (ตัดเฉพาะตอนวัด lead-lag เท่านั้น — ตาราง IC หลักยังใช้กลุ่มเต็มตามนิยามเดิมของ exp-ceiling)
      const spec = LEADLAG_PAIRS.find((p) => p.id === ln);
      const [lk, lsym] = spec.leader.split('|');
      const excludeSym = lk === mk ? lsym : null;
      const mask = new Uint8Array(N);
      let cnt = 0;
      for (let i = 0; i < N; i++) {
        if (!Number.isFinite(fv[i])) continue;
        if (excludeSym && pool.syms[rows.sym[i]].symbol === excludeSym) continue;
        mask[i] = 1; cnt++;
      }
      if (cnt < 200) continue;
      for (let hi = 0; hi < HORIZONS.length; hi++) {
        const h = HORIZONS[hi];
        const m = measure(fv, mask, hi, { subset: true });
        if (!m) continue;
        const rec = { pair: ln, group: job.group, tf: job.tf, h, ...m, feeMed };
        leadlagCells.push(rec);
        registerTest({
          id: `${job.group}|${job.tf}|${ln}|h${h}|LEADLAG`, family: 'LEADLAG',
          question: `${ln}: ผลตอบแทนแท่งล่าสุดของตัวนำ ทำนายผลตอบแทน ${h} แท่งข้างหน้าของ${GROUP_LABEL[job.group]} ${job.tf} ได้ไหม`,
          group: job.group, tf: job.tf, feature: ln, h, stat: 'LEADLAG',
          estimate: m.ic, ci: m.icCI, p: m.icP, n: m.n, G: m.G,
        });
      }
    }

    cells.push(cell);
  }

  // ── Holm ภายในตระกูล + Holm ทั่วทั้งงาน (เข้มที่สุด) ─────────────────────────
  const families = new Map();
  for (const t of TESTS) {
    if (!families.has(t.family)) families.set(t.family, []);
    families.get(t.family).push(t);
  }
  for (const [, list] of families) applyHolm(list, OPT.alpha, 'holmPass', 'holmThreshold');
  applyHolm(TESTS, OPT.alpha, 'holmGlobalPass', 'holmGlobalThreshold');

  OUT.cells = cells;
  OUT.leadlag = leadlagCells;
  OUT.tests = TESTS;
  OUT.families = Object.fromEntries([...families.entries()].map(([k, v]) => [k, {
    tests: v.length, passed: v.filter((t) => t.holmPass).length,
  }]));

  writeReport({ OUT, cells, leadlagCells, timing, audit, meter, bounds, runnerSet, pools, families, elapsed: (Date.now() - t0) / 1000 });

  fs.writeFileSync(path.join(REPORT_DIR, 'exp-feat-cross.json'), JSON.stringify(OUT, null, 1), 'utf8');
  fs.writeFileSync(path.join(REPORT_DIR, 'exp-feat-cross.md'), LINES.join('\n'), 'utf8');
  console.log(`เสร็จใน ${((Date.now() - t0) / 1000).toFixed(1)} วิ · ทดสอบ ${TESTS.length} ข้อ · เขียน report/exp-feat-cross.{md,json}`);
}

/**
 * IC ข้ามหน้าตัด: ที่แต่ละก้าวเวลา วัดสหสัมพันธ์อันดับระหว่าง feature กับผลตอบแทนข้างหน้า
 * "ข้ามสัญลักษณ์" แล้วเฉลี่ยตามเวลา — นี่คือมาตรวัดมาตรฐานของสัญญาณเชิงเปรียบเทียบ
 * ต่างจาก IC ปกติตรงที่มันหักการเคลื่อนไหวของทั้งตลาดออกไปแล้ว
 */
function crossSectionalIC(rows, name, hi, rowBlock, nBlocks, resample, B) {
  const N = rows.block.length;
  const f = rows.f[name];
  const y = rows.y[hi];
  // จัดกลุ่มแถวตามก้าวเวลา (ใช้ block+ค่าเวลาเดิมไม่ได้ ต้องใช้ timestamp จริง → ใช้ key รวม)
  const byStep = new Map();
  for (let i = 0; i < N; i++) {
    const k = rows.step[i];
    if (!byStep.has(k)) byStep.set(k, []);
    byStep.get(k).push(i);
  }
  const counts = new Float64Array(nBlocks);
  const sums = new Float64Array(nBlocks);
  let steps = 0;
  for (const [, idxs] of byStep) {
    if (idxs.length < 4) continue;   // ต้องมีอย่างน้อย 4 ตัวถึงจะจัดอันดับข้ามตัวได้มีความหมาย
    const m = idxs.length;
    const of = idxs.map((i) => f[i]);
    const oy = idxs.map((i) => y[i]);
    const rf = fracRank(of);
    const ry = fracRank(oy);
    // Spearman ของก้าวนั้น
    let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
    for (let t = 0; t < m; t++) {
      sx += rf[t]; sy += ry[t]; sxx += rf[t] * rf[t]; syy += ry[t] * ry[t]; sxy += rf[t] * ry[t];
    }
    const cov = sxy / m - (sx / m) * (sy / m);
    const vx = Math.max(0, sxx / m - (sx / m) ** 2);
    const vy = Math.max(0, syy / m - (sy / m) ** 2);
    if (!(vx > 0 && vy > 0)) continue;
    const rho = cov / Math.sqrt(vx * vy);
    const b = rowBlock[idxs[0]];
    counts[b] += 1; sums[b] += rho;
    steps++;
  }
  if (steps < 50) return null;
  const st = clusterMean(counts, sums);
  const ci = clusterBootstrapCI(counts, sums, resample, B, nBlocks);
  return { ic: st.mean, se: st.se, p: st.p, ci, n: steps, G: st.G };
}

function fracRank(arr) {
  const m = arr.length;
  const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => arr[a] - arr[b]);
  const out = new Float64Array(m);
  let i = 0;
  while (i < m) {
    let j = i;
    while (j + 1 < m && arr[order[j + 1]] === arr[order[i]]) j++;
    const avg = (i + j) / 2;
    for (let t = i; t <= j; t++) out[order[t]] = avg;
    i = j + 1;
  }
  return out;
}

// ═══════════════════════════════ ตัวเขียนรายงาน ═══════════════════════════════

function writeReport(ctx) {
  const { cells, leadlagCells, timing, audit, meter, runnerSet, pools, families, elapsed, OUT } = ctx;
  const TESTS_ = OUT.tests;

  W('# ความสัมพันธ์ข้ามสัญลักษณ์ — วัดพลังทำนายก่อน ยังไม่ประกอบเป็นกลยุทธ์');
  W('');
  W('> ตระกูลที่ 2 ของงานหา feature · วัดบน **ชุด train เท่านั้น** · ไม่แตะ validation และ test');
  W('> โค้ด: `scripts/research/experiments/feat-cross.mjs` · ข้อมูลดิบทุกตัว: `exp-feat-cross.json`');
  W('');

  // ── คำตอบสั้น ─────────────────────────────────────────────────────────────
  const passIC = TESTS_.filter((t) => t.stat === 'IC' && t.holmPass);
  const passXS = TESTS_.filter((t) => t.stat === 'ICXS' && t.holmPass);
  const passMoney = TESTS_.filter((t) => t.stat === 'MONEY' && t.holmPass);
  const passLead = TESTS_.filter((t) => t.stat === 'LEADLAG' && t.holmPass);
  const moneyBeatFee = [];
  for (const c of cells) {
    if (c.insufficient) continue;
    for (const [k, m] of Object.entries(c.res)) {
      if (k.endsWith('|XS')) continue;
      const [name, hs] = k.split('|');
      const t = TESTS_.find((x) => x.group === c.group && x.tf === c.tf && x.feature === name && x.h === +hs && x.stat === 'MONEY');
      if (!t) continue;
      if (Math.abs(m.dir) > c.feeMed) moneyBeatFee.push({ group: c.group, tf: c.tf, name, h: +hs, dir: m.dir, fee: c.feeMed, p: t.p, holm: !!t.holmPass });
    }
  }
  moneyBeatFee.sort((a, b) => Math.abs(b.dir) - Math.abs(a.dir));

  W('## คำตอบสั้น');
  W('');
  W(`ทดสอบทั้งหมด **${TESTS_.length.toLocaleString()} ข้อ** (ทุกข้อที่ถาม ไม่ใช่เฉพาะข้อที่ตอบว่าใช่)`);
  W('');
  W('| คำถาม | ผ่าน Holm ในตระกูล | จากทั้งหมด |');
  W('|---|---:|---:|');
  W(`| IC ต่อผลตอบแทนดิบ ต่างจากศูนย์ | ${passIC.length} | ${TESTS_.filter((t) => t.stat === 'IC').length} |`);
  W(`| IC ข้ามหน้าตัด ต่างจากศูนย์ | ${passXS.length} | ${TESTS_.filter((t) => t.stat === 'ICXS').length} |`);
  W(`| ผลตอบแทนของการเดินตาม feature ต่างจากศูนย์ | ${passMoney.length} | ${TESTS_.filter((t) => t.stat === 'MONEY').length} |`);
  W(`| lead-lag คู่ที่ตั้งสมมติฐานไว้ | ${passLead.length} | ${TESTS_.filter((t) => t.stat === 'LEADLAG').length} |`);
  W('');
  W(`**ช่องที่ขนาดของขอบ (ค่าสัมบูรณ์) มากกว่าค่าธรรมเนียมจริง: ${moneyBeatFee.length} ช่อง**`);
  if (moneyBeatFee.length) {
    W('');
    W('| กลุ่ม | กรอบ | feature | ถือ | ขอบ (bps/ไม้) | ค่าธรรมเนียม (bps) | สุทธิ | p | ผ่าน Holm |');
    W('|---|---|---|---:|---:|---:|---:|---:|---|');
    for (const r of moneyBeatFee.slice(0, 40)) {
      // ⚠ กลุ่ม RUNNER คัดตัวด้วยข้อมูลอนาคต (C9) — ต้องติดธงไว้ตรงที่คนอ่านเห็นก่อน
      const flag = r.group === 'RUNNER' ? ' ⚠เลือกตัวด้วยอนาคต' : '';
      W(`| ${GROUP_LABEL[r.group]}${flag} | ${r.tf} | \`${r.name}\` | ${r.h} | ${bpsS(r.dir)} | ${bpsS(r.fee)} | ${bpsS(Math.abs(r.dir) - r.fee)} | ${pS(r.p)} | ${r.holm ? '**ใช่**' : 'ไม่'} |`);
    }
    if (moneyBeatFee.length > 40) W(`| … อีก ${moneyBeatFee.length - 40} ช่อง (ดูใน JSON) | | | | | | | | |`);
  }
  W('');
  W('⚠ แถวที่ติดธง **เลือกตัวด้วยอนาคต** อ่านเป็นขอบจริงไม่ได้เลย — รายชื่อหุ้นของกลุ่มนั้น');
  W('ถูกเลือกด้วยข้อมูลที่เกิดหลังช่วงวัดผลเกือบ 10 ปี ดู C9 ซึ่งวัดผลของเรื่องนี้ไว้ตรง ๆ');
  W('');
  W('⚠ "ขอบ > ค่าธรรมเนียม" ยังไม่ใช่กลยุทธ์ที่กำไร — ตัวเลขนี้ยังไม่หัก slippage จริง');
  W('ไม่ได้คิดว่าสัญญาณจะออกไม้ถี่แค่ไหน และวัดบน train ที่ตาเราเห็นแล้ว');
  W('');

  // ── ขอบเขต ────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# ขอบเขต — วัดช่องไหน และทำไมข้ามช่องอื่น');
  W('');
  W('exp-ceiling.md วัดไว้แล้วว่าความแม่นคุ้มทุน p* ของ **หุ้นไทยกรอบ 1 ชั่วโมง** อยู่ที่ 71–108%');
  W('แปลว่าต่อให้ feature ทำนายทิศได้เกือบสมบูรณ์ก็ยังไม่คุ้มค่าธรรมเนียม → ไฟล์นี้จึงไม่วัดช่องนั้นเลย');
  W('');
  W('| กลุ่ม | 1D | 1H | เหตุผล |');
  W('|---|---|---|---|');
  for (const g of ['RUNNER', 'RUNNER_PIT', 'SET50', 'GOLD', 'FOREX', 'US_STOCK', 'CRYPTO']) {
    const in1D = GROUPS_1D.includes(g) ? 'วัด' : 'ข้าม';
    const in1H = GROUPS_1H.includes(g) ? 'วัด' : 'ข้าม';
    const why = (g === 'RUNNER' || g === 'SET50' || g === 'RUNNER_PIT') ? 'เพดาน 1H ปิดตาย (p* 71–108%) · 1D ยังมีช่อง (ต้องปีน +8.5–9.1%)' : 'เพดานยังเปิดทั้งสองกรอบ';
    W(`| ${GROUP_LABEL[g]} | ${in1D} | ${in1H} | ${why} |`);
  }
  W('');
  W('**จักรวาลที่ใช้จัดอันดับ** (ตัวที่ใช้ "เทียบ" ไม่จำเป็นต้องเป็นตัวที่ "เทรด"):');
  W('');
  W('| ตลาด/กรอบ | จำนวนตัวใน pool | ต้องมีอย่างน้อยกี่ตัวถึงจัดอันดับ | ก้าวเวลา | ช่วงเวลา |');
  W('|---|---:|---:|---:|---|');
  for (const [k, p] of Object.entries(pools)) {
    W(`| ${k} | ${p.nSym} | ${p.minPool} | ${p.G.toLocaleString()} | ${new Date(p.grid[0]).toISOString().slice(0, 10)} → ${new Date(p.grid[p.G - 1]).toISOString().slice(0, 10)} |`);
  }
  W('');
  W(`หุ้นซิ่งที่คัดได้จากกฎเดียวกับ exp-ceiling (วัดบน train ของ 1H เท่านั้น ไม่ใช้ผลตอบแทนเลย): **${[...runnerSet].sort().join(' · ')}**`);
  W('');

  // ── C0 ────────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# C0 · ตรวจเครื่องวัด');
  W('');
  if (meter.atrChecked) {
    W('ไฟล์นี้คำนวณ ATR เองเพื่อใช้คิดขนาดคำสั่ง (ซึ่งเป็นตัวกำหนดว่าค่าคอมขั้นต่ำ 50 บาทกินกี่ bps)');
    W('ถ้า ATR เพี้ยน เส้นค่าธรรมเนียมของหุ้นไทยจะผิดทั้งรายงาน จึงเทียบกับ `src/lib/indicators.ts` ตัวจริง');
    W('');
    W('| สิ่งที่ตรวจ | จำนวนจุด | ความคลาดเคลื่อนสูงสุด |');
    W('|---|---:|---:|');
    W(`| ATR ที่เขียนใหม่ เทียบกับ src/lib/indicators.ts | ${meter.atrChecked.toLocaleString()} | ${meter.atrMaxErr.toExponential(1)} |`);
    W('');
  } else {
    W('_ข้ามด้วย --no-parity_');
    W('');
  }
  W('ค่าธรรมเนียมที่ใช้เป็นเส้นเทียบ (มัธยฐานของไม้จริงในแต่ละช่อง) — ต้องใกล้เคียงกับที่ exp-ceiling รายงานไว้:');
  W('');
  W('| กลุ่ม | กรอบ | ค่าธรรมเนียมมัธยฐาน (bps ไป-กลับ) | ที่ exp-ceiling รายงาน (1D) |');
  W('|---|---|---:|---:|');
  const ceilFee = { RUNNER: 122.4, RUNNER_PIT: 122.4, SET50: 89.6, GOLD: 6.5, FOREX: 3.2, US_STOCK: 5.0, CRYPTO: 25.0 };
  for (const c of cells) {
    if (c.insufficient) continue;
    W(`| ${GROUP_LABEL[c.group]} | ${c.tf} | ${bpsS(c.feeMed)} | ${c.tf === '1D' ? ceilFee[c.group].toFixed(1) : '—'} |`);
  }
  W('');

  // ── C1 ────────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# C1 · ตรวจ look-ahead ด้วยการตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ');
  W('');
  W('วิธีที่หนักแน่นที่สุด: คำนวณ feature บนชุดเต็ม → **ตัดท้ายทิ้งจริง ๆ แล้วโหลดใหม่** →');
  W('คำนวณซ้ำ → ค่าของก้าวเก่าต้องเท่าเดิมทุกบิต');
  W('');
  W('ตระกูลนี้เสี่ยงเป็นพิเศษเพราะ feature หนึ่งตัวอ่านข้อมูลของ **ทุกสัญลักษณ์ในกลุ่ม**');
  W('การรั่วจึงเข้ามาทางเพื่อนร่วมกลุ่มได้ แม้โค้ดของตัวเองจะดูสะอาด');
  W('');
  W(`ทำกับทุก pool ที่ใช้ในรายงานนี้ (${audit.pools} pool) · ตัดท้ายทิ้ง ${((1 - OUT.opt.truncFrac) * 100).toFixed(0)}%`);
  W('');
  W('| feature | จำนวนที่เทียบ | ไม่ตรง | ผล |');
  W('|---|---:|---:|---|');
  for (const [name, v] of Object.entries(audit.perFeature)) {
    W(`| \`${name}\` | ${v.compared.toLocaleString()} | ${v.mismatch} | ${v.mismatch === 0 ? '**ผ่าน**' : '**ไม่ผ่าน**'} |`);
  }
  W('');
  W('## ตัวควบคุมเชิงบวก — พิสูจน์ว่าเครื่องตรวจมีฟันจริง');
  W('');
  W('ถ้าการตรวจข้างบนผ่านหมดแต่เครื่องตรวจใช้ไม่ได้จริง มันก็จะผ่านหมดเหมือนกัน');
  W('จึงใส่ feature ที่ **ตั้งใจให้รั่ว** ลงไปด้วย ถ้าเครื่องตรวจดี ต้องจับสองตัวนี้ได้');
  W('');
  W('| ตัวควบคุม | ชนิดการรั่ว | เทียบ | เปลี่ยน | ผล |');
  W('|---|---|---:|---:|---|');
  const leakWhy = {
    LEAK_zFull: 'z-score ด้วยค่าเฉลี่ย/ส่วนเบี่ยงเบนของทั้งชุด (การรั่วที่เงียบที่สุด)',
    LEAK_fwd5: 'ผลตอบแทน 5 ก้าวข้างหน้า (การรั่วแบบเห็น ๆ — ทดสอบมิติหน้าต่าง)',
  };
  for (const [name, v] of Object.entries(audit.perLeak)) {
    W(`| \`${name}\` | ${leakWhy[name]} | ${v.compared.toLocaleString()} | ${v.changed.toLocaleString()} | ${v.changed > 0 ? '**จับได้**' : '**จับไม่ได้ — เครื่องตรวจใช้ไม่ได้**'} |`);
  }
  W('');

  // ── การรั่วอีกชนิดที่ตารางข้างบนจับไม่ได้เลย: การรั่วที่ "การเลือกตัว" ──────────
  W('## การรั่วคนละชนิด: ไม่ได้อยู่ที่ค่า feature แต่อยู่ที่ "ใครถูกเลือกเข้ามาวัด"');
  W('');
  W('ตารางข้างบนตรวจว่า *ค่า* ของ feature ไม่เปลี่ยนเมื่อตัดอนาคตทิ้ง — แต่ถ้าเราเลือก');
  W('**ตัวสัญลักษณ์** ด้วยข้อมูลอนาคต ค่า feature ทุกตัวก็ยังผ่านการตรวจนั้นได้สบาย ๆ');
  W('เพราะการรั่วไม่ได้อยู่ในค่า มันอยู่ในรายชื่อ นี่คือจุดที่กลุ่ม `RUNNER` เดิมมีปัญหา (ดู C9)');
  W('');
  W('| สิ่งที่ตรวจ | เทียบ | ไม่ตรง | ผล |');
  W('|---|---:|---:|---|');
  W(`| หน้ากาก \`RUNNER_PIT\` (คัดหุ้นซิ่งด้วยข้อมูลถึงก้าวนั้นเท่านั้น) | ${audit.pitCompared.toLocaleString()} | ${audit.pitMismatch.toLocaleString()} | ${audit.pitMismatch === 0 ? '**ผ่าน**' : '**ไม่ผ่าน**'} |`);
  W(`| ตัวควบคุมเชิงบวก: คัดด้วยค่าเฉลี่ยของทั้งชุด (แบบที่ \`RUNNER\` ทำ) | ${audit.pitLeakCompared.toLocaleString()} | ${audit.pitLeakChanged.toLocaleString()} | ${audit.pitLeakChanged > 0 ? '**จับได้**' : '**จับไม่ได้**'} |`);
  W('');
  W(`ตารางเวลาของชุดที่ตัดแล้วเป็นส่วนหน้าของชุดเต็มเป๊ะ: ${audit.gridPrefixOk ? 'ใช่' : '**ไม่ใช่ — การเทียบก้าวต่อก้าวไม่ถูกต้อง**'}`);
  W('');

  // ── C2 ────────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# C2 · เวลาข้ามตลาด — ใช้ข้อมูลที่ยังไม่ปิดหรือเปล่า');
  W('');
  W('timestamp ในคลังคือ **เวลาเปิดแท่ง** (ตรวจแล้วจากข้อมูลจริง: หุ้นไทย 1D = 03:00Z,');
  W('หุ้นสหรัฐ 1D = 13:30/14:30Z, ค่าเงิน 1D = 23:00/00:00Z, คริปโต 1D = 00:00Z)');
  W('การตัดสินใจเกิดที่ปิดแท่ง จึงต้องแปลงเป็นเวลาปิดก่อน แล้วจับคู่แบบ as-of:');
  W('**ใช้ได้เฉพาะแท่งของตัวอื่นที่ปิดไปแล้ว ณ เวลาที่ตัดสินใจ**');
  W('');
  W('| คู่ | ตัวนำ | ฝ่ายตาม | กรอบ | ก้าวที่จับคู่ได้ | ละเมิด (ใช้ของที่ยังไม่ปิด) | ความหน่วงจริง ต่ำสุด/กลาง/สูงสุด (ชม.) |');
  W('|---|---|---|---|---:|---:|---:|');
  for (const t of timing) {
    W(`| \`${t.pair}\` | ${t.leader} | ${GROUP_LABEL[t.target]} | ${t.timeframe} | ${t.matchedSteps.toLocaleString()} | ${t.violations} | ${num(t.lagMinH, 1)} / ${num(t.lagMedH, 1)} / ${num(t.lagMaxH, 1)} |`);
  }
  W('');
  const totalViol = timing.reduce((a, t) => a + t.violations, 0);
  W(`**รวมการละเมิดทั้งหมด: ${totalViol}**${totalViol === 0 ? ' — ไม่มีช่องไหนใช้ข้อมูลที่ยังไม่เกิด' : ' — มีปัญหา ต้องแก้ก่อนเชื่อผล'}`);
  W('');
  W('อ่านคอลัมน์ความหน่วงให้ดี: `SPY_TO_SET50` ได้ความหน่วงกลางราว 13–14 ชม. ซึ่งถูกต้อง —');
  W('SPY วันที่ D ปิด 20:00Z แต่หุ้นไทยวันที่ D ปิดไปตั้งแต่ 09:30Z ดังนั้นไทยวันที่ D');
  W('ใช้ได้แค่ SPY ของวันที่ D−1 การจับคู่แบบนี้เกิดเองจากเวลาปิดจริง ไม่ได้ตั้งกฎ lag ด้วยมือ');
  W('');
  W('เรื่องที่ as-of join **ไม่ได้** แก้ให้ และต้องพูดตรง ๆ: สัญลักษณ์ใน**ตลาดเดียวกัน**');
  W('ปิดพร้อมกัน อันดับข้ามตัวจึงใช้แท่งเดียวกันของเพื่อนได้ ซึ่งเป็นวิธีที่กลยุทธ์');
  W('cross-sectional ทำกันจริง แต่คนที่ต้องส่งคำสั่ง "ที่ราคาปิด" อาจเห็นอันดับไม่ทัน');
  W('C7 จึงหน่วงข้อมูลข้ามตัวไป 1 แท่งเต็มแล้ววัดใหม่ทั้งกระดาน');
  W('');

  // ── C3 ────────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# C3 · ตาราง IC ทุกช่อง (ทั้งที่ผ่านและไม่ผ่าน)');
  W('');
  W('IC = Spearman rank correlation ระหว่างค่า feature ที่แท่ง i กับผลตอบแทน h แท่งข้างหน้า');
  W('ช่วงความเชื่อมั่นและค่า p มาจากการจับกลุ่มตามเวลา (เดือนสำหรับ 1D · สัปดาห์สำหรับ 1H)');
  W('ซึ่งหักทั้งความสัมพันธ์ข้ามสัญลักษณ์ ณ เวลาเดียวกัน และหน้าต่างถือที่ทับกัน');
  W('');
  W('เครื่องหมาย ✓ = ผ่าน Holm ภายในตระกูล · ✓✓ = ผ่าน Holm ทั่วทั้งงาน (เข้มที่สุด)');
  W('');
  for (const c of cells) {
    if (c.insufficient) {
      W(`## ${GROUP_LABEL[c.group]} · ${c.tf} — **วัดไม่ได้** (เหลือ ${c.n} แถว)`);
      W('');
      W(`ตระกูลนี้ต้องมีอย่างน้อย **${c.why.minPoolNeeded} ตัวที่มีข้อมูลพร้อมกัน** ถึงจะจัดอันดับข้ามตัวได้`);
      W(`แต่ในชุด train ของช่องนี้ มีพร้อมกันสูงสุดแค่ **${c.why.maxSymbolsTogetherInTrain} ตัว**`);
      W('');
      W('| สัญลักษณ์ | แท่งที่อยู่ในชุด train |');
      W('|---|---:|');
      for (const [s, n2] of Object.entries(c.why.trainBarsPerSymbol)) W(`| ${s} | ${n2.toLocaleString()} |`);
      W('');
      W('นี่ไม่ใช่ผลลบของ feature — เป็นข้อจำกัดของคลังข้อมูล: ชุด train ของ 1D จบปี 2016');
      W('ซึ่งเป็นยุคที่สัญลักษณ์กลุ่มนี้ยังไม่มีข้อมูลพร้อมกันมากพอ **ตระกูลนี้ตอบช่องนี้ไม่ได้เลย**');
      W('');
      continue;
    }
    W(`## ${GROUP_LABEL[c.group]} · ${c.tf}`);
    W('');
    W(`แถวที่ใช้วัด **${c.n.toLocaleString()}** · กลุ่มเวลา ${c.nBlocks} กลุ่ม · ช่วง ${c.firstBar.slice(0, 10)} → ${c.lastBar.slice(0, 10)}`);
    W(`· ค่าธรรมเนียมมัธยฐาน ${bpsS(c.feeMed)} bps ไป-กลับ`);
    W('');
    const sr = Object.entries(c.symbolRows).sort((a, b) => b[1] - a[1]);
    W(`สัญลักษณ์ที่มีแถวจริงในช่องนี้ **${sr.length} ตัว** จาก ${c.symbols.length} ตัวที่นิยามไว้ — ` +
      sr.map(([s, n2]) => `${s} ${n2.toLocaleString()}`).join(' · '));
    W('');
    W('| feature | h=1 | h=3 | h=6 | h=10 |');
    W('|---|---|---|---|---|');
    for (const [name] of ALL_FEATURES) {
      const cellsRow = HORIZONS.map((h) => {
        const m = c.res[`${name}|${h}`];
        if (!m) return '—';
        const t = TESTS_.find((x) => x.group === c.group && x.tf === c.tf && x.feature === name && x.h === h && x.stat === 'IC');
        const mark = t && t.holmGlobalPass ? ' ✓✓' : (t && t.holmPass ? ' ✓' : '');
        return `${num(m.ic, 4)}${mark}<br><sub>[${num(m.icCI[0], 3)}, ${num(m.icCI[1], 3)}] p=${pS(m.icP)}</sub>`;
      });
      W(`| \`${name}\` | ${cellsRow.join(' | ')} |`);
    }
    W('');
  }

  // ── C4 ────────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# C4 · แปลง IC เป็นเงิน แล้วเทียบค่าธรรมเนียม');
  W('');
  W('IC เท่าไรถึงจะเป็นเงินได้ ขึ้นกับความผันผวนของผลตอบแทนช่วงนั้น');
  W('ตัวเลขที่ใช้ตัดสินคือ **ขอบ (bps/ไม้)** = ผลตอบแทนเฉลี่ยของกลยุทธ์ที่เดินตามเครื่องหมาย feature');
  W('(บวก = ซื้อ · ลบ = ขาย) ซึ่งเป็นตัวเลขที่วัดจากของจริง ไม่ใช่แปลงจากทฤษฎี');
  W('');
  W('⚠ เครื่องหมายของขอบถูกเลือกจากข้อมูลชุดเดียวกัน จึงทดสอบแบบสองด้าน (ต่างจากศูนย์ไหม)');
  W('แล้วค่อยเทียบขนาดกับค่าธรรมเนียม — ไม่ได้ทดสอบว่า "บวกไหม" ซึ่งจะเป็นการเลือกทางที่ชอบ');
  W('');
  for (const c of cells) {
    if (c.insufficient) continue;
    W(`## ${GROUP_LABEL[c.group]} · ${c.tf} — ค่าธรรมเนียม ${bpsS(c.feeMed)} bps`);
    W('');
    W('เส้นเทียบที่ต้องดูคู่กันเสมอ: **ผลตอบแทนของการถือเฉย ๆ** ในหน้าต่างเดียวกัน');
    W('');
    W('| หน้าต่าง | ถือเฉย ๆ ได้ (bps) |');
    W('|---:|---:|');
    for (const h of HORIZONS) {
      const m = c.res[`xsMom1|${h}`];
      if (m) W(`| ${h} | ${bpsS(m.drift)} |`);
    }
    W('');
    W('| feature | h | ขอบ (bps) | ช่วงความเชื่อมั่น | สุทธิหลังค่าธรรมเนียม | หักแนวโน้มแล้วเหลือ | ซื้อกี่ % ของเวลา | สเปรดควินไทล์ | ครึ่งแรก → ครึ่งหลัง | p |');
    W('|---|---:|---:|---|---:|---:|---:|---:|---|---:|');
    for (const [name] of ALL_FEATURES) {
      for (const h of HORIZONS) {
        const m = c.res[`${name}|${h}`];
        if (!m) continue;
        const t = TESTS_.find((x) => x.group === c.group && x.tf === c.tf && x.feature === name && x.h === h && x.stat === 'MONEY');
        const net = Math.abs(m.dir) - c.feeMed;
        const mark = t && t.holmGlobalPass ? ' ✓✓' : (t && t.holmPass ? ' ✓' : '');
        const nd = GRP_NAMES.includes(name) ? `${bpsS(m.dirND)}` : '(หักเองอยู่แล้ว)';
        W(`| \`${name}\` | ${h} | ${bpsS(m.dir)}${mark} | [${bpsS(m.dirCI[0])}, ${bpsS(m.dirCI[1])}] | ${bpsS(net)} | ${nd} | ${pctS(m.longShare, 0)} | ${bpsS(m.spread)} | ${bpsS(m.dirH1)} → ${bpsS(m.dirH2)} | ${pS(m.dirP)} |`);
      }
    }
    W('');
  }

  // ── C5 ────────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# C5 · ความแม่นทิศ เทียบเส้นคุ้มทุน p* ของเพดาน');
  W('');
  W('exp-ceiling วัด p* ไว้ที่หน้าต่างถือ 1 และ 10 แท่ง ซึ่งตรงกับ h=1 และ h=10 ของรายงานนี้พอดี');
  W('จึงเทียบตรง ๆ ได้โดยไม่ต้องประมาณค่า (h=3 กับ h=6 ไม่มี p* เทียบ จึงไม่ใส่ในตารางนี้)');
  W('');
  let ceilCells = null;
  try { ceilCells = JSON.parse(fs.readFileSync(CEILING_JSON, 'utf8')).cells; } catch { ceilCells = null; }
  W('| กลุ่ม | กรอบ | h | p* (เพดาน) | feature ที่แม่นที่สุด | ความแม่นที่ทำได้ | ห่างจาก p* |');
  W('|---|---|---:|---:|---|---:|---:|');
  for (const c of cells) {
    if (c.insufficient) continue;
    for (const h of [1, 10]) {
      let best = null;
      for (const [name] of ALL_FEATURES) {
        const m = c.res[`${name}|${h}`];
        if (!m || !Number.isFinite(m.hit)) continue;
        const acc = Math.max(m.hit, 1 - m.hit);   // เดินตามเครื่องหมายไหนก็ได้ เอาด้านที่ดีกว่า
        if (!best || acc > best.acc) best = { name, acc };
      }
      // RUNNER_PIT ไม่มีใน exp-ceiling (เพิ่งสร้างในไฟล์นี้) — ยืม p* ของ RUNNER มาเทียบ
      // เป็นตลาดและเรขาคณิตเดียวกัน ต่างแค่รายชื่อ และค่าธรรมเนียมของ PIT ต่ำกว่าเล็กน้อย
      // แปลว่า p* จริงของ PIT ต่ำกว่านิดหน่อย → ช่องว่างที่แสดงจึงเข้มงวดกว่าความจริงเล็กน้อย
      const ceilKey = c.group === 'RUNNER_PIT' ? 'RUNNER' : c.group;
      const ck = ceilCells ? ceilCells[`train|${ceilKey}|${c.tf}|${h}`] : null;
      const pStar = ck ? ck.pStar : NaN;
      if (!best) continue;
      const approx = c.group === 'RUNNER_PIT' && Number.isFinite(pStar) ? '≈' : '';
      W(`| ${GROUP_LABEL[c.group]} | ${c.tf} | ${h} | ${approx}${pctS(pStar)} | \`${best.name}\` | ${pctS(best.acc)} | ${Number.isFinite(pStar) ? approx + pctS(best.acc - pStar) : '—'} |`);
    }
  }
  W('');
  W('⚠ คอลัมน์ "feature ที่แม่นที่สุด" เลือกจากข้อมูลชุดเดียวกันที่ใช้วัด = มองโลกในแง่ดีเกินจริง');
  W('ตัวเลขนี้จึงเป็น **ขอบบนของความแม่นที่ตระกูลนี้ทำได้บน train** ไม่ใช่ค่าที่คาดหวังบนข้อมูลใหม่');
  W('');

  // ── C6 ────────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# C6 · lead-lag — เฉพาะคู่ที่ตั้งสมมติฐานไว้ล่วงหน้า');
  W('');
  W('58 สัญลักษณ์ = 3,306 คู่ ถ้าไล่หมดที่ระดับนัยสำคัญ 5% จะได้ผลบวกลวงราว 165 คู่โดยไม่มีความหมายเลย');
  W(`จึงตั้งสมมติฐานไว้ก่อน **${LEADLAG_PAIRS.length} คู่** ทุกคู่มีเหตุผลเชิงเศรษฐกิจกำกับ และทดสอบเฉพาะนั้น`);
  W('');
  W('| คู่ | เหตุผลที่ควรสัมพันธ์กัน |');
  W('|---|---|');
  for (const p of LEADLAG_PAIRS) W(`| \`${p.id}\` | ${p.why} |`);
  W('');
  W('| คู่ | ฝ่ายตาม | กรอบ | h | IC | ช่วงความเชื่อมั่น | ขอบ (bps) | ค่าธรรมเนียม | p | ผ่าน Holm |');
  W('|---|---|---|---:|---:|---|---:|---:|---:|---|');
  for (const r of leadlagCells) {
    const t = TESTS_.find((x) => x.stat === 'LEADLAG' && x.group === r.group && x.tf === r.tf && x.feature === r.pair && x.h === r.h);
    W(`| \`${r.pair}\` | ${GROUP_LABEL[r.group]} | ${r.tf} | ${r.h} | ${num(r.ic, 4)} | [${num(r.icCI[0], 3)}, ${num(r.icCI[1], 3)}] | ${bpsS(r.dir)} | ${bpsS(r.feeMed)} | ${pS(r.icP)} | ${t && t.holmGlobalPass ? '**✓✓**' : (t && t.holmPass ? '**✓**' : 'ไม่')} |`);
  }
  W('');

  // ── C7 ────────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# C7 · ตรวจทาน — หน่วงข้อมูลข้ามตัวไป 1 แท่งเต็ม');
  W('');
  W('feature ในตระกูลนี้ใช้อันดับที่คำนวณจากแท่งเดียวกันของเพื่อนร่วมกลุ่ม (ปิดพร้อมกัน)');
  W('ถ้าคนเทรดจริงเห็นอันดับไม่ทันตอนปิด ต้องใช้อันดับของแท่งก่อนหน้า — ตระกูล `@lag1` คือแบบนั้น');
  W('ถ้าผลหายไปหมดตอนหน่วง 1 แท่ง แปลว่าที่เห็นคือความบังเอิญของ "การรู้พร้อมกัน" ไม่ใช่ขอบจริง');
  W('');
  W('| กลุ่ม | กรอบ | feature | h | IC (พร้อมกัน) | IC (หน่วง 1 แท่ง) | เหลือกี่ % |');
  W('|---|---|---|---:|---:|---:|---:|');
  for (const c of cells) {
    if (c.insufficient) continue;
    for (const name of CS_NAMES) {
      for (const h of HORIZONS) {
        const a = c.res[`${name}|${h}`];
        const b = c.res[`${name}@lag1|${h}`];
        if (!a || !b) continue;
        const keep = Math.abs(a.ic) > 1e-9 ? (b.ic / a.ic) * 100 : NaN;
        W(`| ${GROUP_LABEL[c.group]} | ${c.tf} | \`${name}\` | ${h} | ${num(a.ic, 4)} | ${num(b.ic, 4)} | ${Number.isFinite(keep) ? keep.toFixed(0) + '%' : '—'} |`);
      }
    }
  }
  W('');

  // ── C8 ────────────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# C8 · บัญชีการเปรียบเทียบทั้งหมด');
  W('');
  W('| ตระกูล | จำนวนการทดสอบ | ผ่าน Holm ในตระกูล | เกณฑ์ p ที่เข้มที่สุดในตระกูล |');
  W('|---|---:|---:|---:|');
  for (const [fam, list] of families) {
    const thr = Math.min(...list.map((t) => (Number.isFinite(t.holmThreshold) ? t.holmThreshold : Infinity)));
    W(`| \`${fam}\` | ${list.length} | ${list.filter((t) => t.holmPass).length} | ${Number.isFinite(thr) ? thr.toExponential(1) : '—'} |`);
  }
  W('');
  W(`**รวม ${TESTS_.length.toLocaleString()} การทดสอบ** · ถ้าใช้ Holm ทั่วทั้งงาน (ไม่แยกตระกูล) ผ่าน **${TESTS_.filter((t) => t.holmGlobalPass).length}** ข้อ`);
  W('');
  W('รายการที่ผ่าน Holm ทั่วทั้งงาน (เข้มที่สุด) เรียงตามค่า p:');
  W('');
  const globalPass = TESTS_.filter((t) => t.holmGlobalPass).sort((a, b) => a.p - b.p);
  if (!globalPass.length) {
    W('_ไม่มีข้อไหนผ่าน_');
  } else {
    W('| # | คำถาม | ค่าที่วัดได้ | ช่วงความเชื่อมั่น | p | เกณฑ์ |');
    W('|---:|---|---:|---|---:|---:|');
    globalPass.slice(0, 120).forEach((t, i) => {
      W(`| ${i + 1} | ${t.question} | ${t.stat === 'MONEY' ? bpsS(t.estimate) + ' bps' : num(t.estimate, 4)} | [${t.stat === 'MONEY' ? bpsS(t.ci[0]) + ', ' + bpsS(t.ci[1]) : num(t.ci[0], 3) + ', ' + num(t.ci[1], 3)}] | ${pS(t.p)} | ${t.holmGlobalThreshold.toExponential(1)} |`);
    });
    if (globalPass.length > 120) W(`| … | อีก ${globalPass.length - 120} ข้อ ดูใน exp-feat-cross.json | | | | |`);
  }
  W('');
  W('_รายการทดสอบครบทุกข้อ (รวมที่ไม่ผ่าน) อยู่ในคีย์ `tests` ของ `exp-feat-cross.json`_');
  W('');

  // ── C9 · การเลือกตัวด้วยข้อมูลอนาคต ────────────────────────────────────────
  W('---');
  W('');
  W('# C9 · ผลบวกที่ดูดีที่สุดของรายงานนี้ มาจากการเลือกตัวด้วยข้อมูลอนาคต');
  W('');
  W('ส่วนนี้สำคัญที่สุดในรายงาน เพราะมันล้มข้อสรุปที่ดูดีที่สุดทิ้ง');
  W('');
  W('**ปัญหา:** กลุ่ม `RUNNER` คัดตัวด้วยกฎเดียวกับ exp-ceiling คือดูจากแท่ง **1 ชั่วโมง**');
  W('ของชุด train ซึ่งครอบคลุมปี **2023–2025** แต่ช่อง `RUNNER|1D` ถูกวัดผลบนช่วง');
  const runnerCell = cells.find((x) => x.group === 'RUNNER' && x.tf === '1D');
  W(`**${runnerCell && !runnerCell.insufficient ? `${runnerCell.firstBar.slice(0, 10)} → ${runnerCell.lastBar.slice(0, 10)}` : '—'}**`);
  W('แปลว่ารายชื่อ "หุ้นซิ่ง" ถูกตัดสินด้วยข้อมูลที่เกิดหลังช่วงวัดผลไปเกือบ 10 ปี');
  W('');
  W('การตรวจ C1 จับเรื่องนี้ไม่ได้โดยธรรมชาติ เพราะค่าของ feature ทุกตัวยัง causal สมบูรณ์');
  W('สิ่งที่ไม่ causal คือ **รายชื่อผู้เข้าแข่งขัน** ซึ่งเป็นการรั่วคนละชั้นกัน');
  W('');
  W('**หลักฐานที่ตรงที่สุด — ดูผลตอบแทนของการถือเฉย ๆ:**');
  W('');
  W('| กลุ่มหุ้นไทย 1D | วิธีเลือกตัว | ถือเฉย ๆ 10 แท่ง (bps) | จำนวนแถว |');
  W('|---|---|---:|---:|');
  for (const g of ['RUNNER', 'RUNNER_PIT', 'SET50']) {
    const c = cells.find((x) => x.group === g && x.tf === '1D');
    if (!c || c.insufficient) continue;
    const m = c.res['breadth20|10'];
    const how = g === 'RUNNER' ? 'ใช้ข้อมูลปี 2023–2025 (อนาคต)'
      : g === 'RUNNER_PIT' ? 'ใช้ข้อมูลถึงก้าวนั้นเท่านั้น' : 'รายชื่อดัชนีที่กำหนดไว้ล่วงหน้า';
    W(`| ${GROUP_LABEL[g]} | ${how} | ${m ? bpsS(m.drift) : '—'} | ${c.n.toLocaleString()} |`);
  }
  W('');
  W('จักรวาลที่ถูกเลือกด้วยข้อมูลอนาคตให้ผลตอบแทนของ "การถือเฉย ๆ" สูงผิดธรรมชาติ —');
  W('นั่นไม่ใช่ขอบของกลยุทธ์ใด ๆ มันคือร่องรอยของการเลือกผู้ชนะย้อนหลัง');
  W('');
  W('**ผลของ feature เมื่อเปลี่ยนวิธีเลือกตัว (ถือ 10 แท่ง · ขอบ / สุทธิหลังค่าธรรมเนียม):**');
  W('');
  W(`| feature | ${['RUNNER', 'RUNNER_PIT', 'SET50'].map((g) => GROUP_LABEL[g]).join(' | ')} |`);
  W('|---|---|---|---|');
  for (const name of [...CS_NAMES, ...GRP_NAMES]) {
    const parts = ['RUNNER', 'RUNNER_PIT', 'SET50'].map((g) => {
      const c = cells.find((x) => x.group === g && x.tf === '1D');
      if (!c || c.insufficient) return '—';
      const m = c.res[`${name}|10`];
      if (!m) return '—';
      return `${bpsS(m.dir)} / ${bpsS(Math.abs(m.dir) - c.feeMed)}`;
    });
    W(`| \`${name}\` | ${parts.join(' | ')} |`);
  }
  W('');
  W('อ่านตารางนี้ให้ตรง: ช่อง "สุทธิ" คือขนาดของขอบลบค่าธรรมเนียม — ติดลบแปลว่าไม่คุ้ม');
  W('ถ้าขอบหายไปเมื่อเปลี่ยนจาก "เลือกตัวด้วยอนาคต" เป็น "เลือกตัวตามเวลาจริง"');
  W('แปลว่าสิ่งที่วัดได้คือวิธีเลือกตัว ไม่ใช่พลังทำนายของ feature');
  W('');
  W('## แล้ว `breadth20` ที่ยังเหลืออยู่ล่ะ — เชื่อได้แค่ไหน');
  W('');
  W('`breadth20` เป็น feature เดียวที่ยังเป็นบวกหลังค่าธรรมเนียมเมื่อเลือกตัวตามเวลาจริง');
  W('แต่มีสี่เรื่องที่ต้องรู้ก่อน และทั้งสี่เรื่องดึงไปทางเดียวกันคือ "ยังไม่พอ":');
  W('');
  const pit = cells.find((x) => x.group === 'RUNNER_PIT' && x.tf === '1D');
  const pitM = pit && !pit.insufficient ? pit.res['breadth20|10'] : null;
  const runM = runnerCell && !runnerCell.insufficient ? runnerCell.res['breadth20|10'] : null;
  if (pitM) {
    W(`1. **ตกเกณฑ์การแก้ค่า p แล้ว** — พอเลือกตัวตามเวลาจริง ค่า p ตกจาก ${pS(TESTS_.find((t) => t.group === 'RUNNER' && t.feature === 'breadth20' && t.h === 10 && t.stat === 'MONEY')?.p)} เป็น ${pS(TESTS_.find((t) => t.group === 'RUNNER_PIT' && t.feature === 'breadth20' && t.h === 10 && t.stat === 'MONEY')?.p)}`);
    W(`   ซึ่ง **ไม่ผ่าน Holm** ในตระกูลของมันเอง (ทดสอบทั้งงาน ${TESTS_.length.toLocaleString()} ข้อ) = อยู่ในระดับที่เกิดจากการลองหลายครั้งได้`);
    W('');
    W(`2. **ความแม่นทิศแค่ ${pctS(pitM.hit)}** ขณะที่เพดานบอกว่าต้องการ ~59.6% (C5) — ยังห่างอีกราว 7 จุด`);
    W(`   ขอบที่เห็นมาจากการถือฝั่งถูกตอนราคาวิ่งแรง ไม่ใช่จากการทายถูกบ่อยขึ้น`);
    W('');
    W(`3. **จางลงตามเวลา** — ครึ่งแรกของ train ได้ ${bpsS(pitM.dirH1)} bps ครึ่งหลังเหลือ ${bpsS(pitM.dirH2)} bps`);
    W('   (ทิศทางเดียวกันทั้งสามจักรวาล) ยุคที่ใกล้ปัจจุบันกว่าคือยุคที่ขอบบางกว่า');
    W('');
    W(`4. **ต้องขายชอร์ตถึงจะได้ตัวเลขนี้** — กลยุทธ์นี้ถือยาว ${pctS(pitM.longShare)} ของเวลา ที่เหลือคือฝั่งขาย`);
    W('   หุ้นไทยนอก SET50 ยืมมาขายชอร์ตแทบไม่ได้จริงสำหรับรายย่อย (ต้องมี SBL) ถ้าตัดฝั่งขายทิ้ง');
    W('   สิ่งที่เหลือคือ "ถือตอนตลาดกว้าง" ซึ่งเป็นการเก็บ drift ของตลาด ไม่ใช่ขอบจากการทำนาย');
    W('');
    W(`   เทียบให้เห็นภาพ: จักรวาลนี้ถือเฉย ๆ 10 แท่งได้ ${bpsS(pitM.drift)} bps ขณะที่ค่าธรรมเนียมไป-กลับคือ ${bpsS(pit.feeMed)} bps`);
    W('   แปลว่าแม้แต่การถือเฉย ๆ ก็แทบไม่คุ้มค่าธรรมเนียมอยู่แล้ว');
  }
  W('');
  if (pitM && runM) {
    W(`สรุปเรื่อง \`breadth20\`: การเลือกตัวด้วยอนาคตทำให้ขอบดูใหญ่ขึ้นจาก ${bpsS(pitM.dir)} เป็น ${bpsS(runM.dir)} bps`);
    W(`และทำให้ "ถือเฉย ๆ" ดูดีขึ้นจาก ${bpsS(pitM.drift)} เป็น ${bpsS(runM.drift)} bps — ส่วนต่างนั้นคือค่าของการรู้อนาคต ไม่ใช่ของ feature`);
  }
  W('');

  // ── ข้อจำกัด ───────────────────────────────────────────────────────────────
  W('---');
  W('');
  W('# ข้อจำกัดที่ต้องติดไปกับทุกตัวเลขในรายงานนี้');
  W('');
  W('1. **วัดบน train เท่านั้น** — ยังไม่มีตัวเลขไหนถูกยืนยันบน validation เลย ทุกอย่างในนี้');
  W('   คือการสำรวจ ไม่ใช่ข้อสรุป ถ้าจะเชื่อ ต้องเอาไปวัดซ้ำบน validation ก่อน');
  W('2. **survivorship bias** — Yahoo ลบหุ้นที่ออกจากกระดานทิ้ง (STARK/MORE หายไปเอง)');
  W('   จักรวาลที่ใช้จัดอันดับจึงเอียงไปทางผู้รอดชีวิต และ **การจัดอันดับข้ามตัวได้รับผลกระทบ');
  W('   หนักกว่า feature ตัวเดียวโดด ๆ** เพราะตัวที่หายไปคือตัวที่ควรอยู่อันดับล่างสุดพอดี');
  W('3. อันดับข้ามตัวใช้แท่งเดียวกันของเพื่อนร่วมกลุ่ม (ปิดพร้อมกัน) — C7 วัดผลของการหน่วง');
  W('   1 แท่งไว้แล้ว แต่ความจริงอยู่ตรงกลางระหว่างสองแบบ ขึ้นกับว่าส่งคำสั่งได้เร็วแค่ไหน');
  W('4. ราคาไม่ได้หักปันผล และไม่ได้ปรับ corporate action ทั้งหมด — กระทบ momentum ระยะยาว');
  W('   (`xsMom60`) มากกว่าตัวอื่น');
  W('5. อันดับถูกจัดในกลุ่มที่จำนวนตัวเปลี่ยนไปตามเวลา (ตัวใหม่ทยอยเข้า) ค่าอันดับถูกจัดกลาง');
  W('   ให้อยู่ช่วง [−0.5, +0.5] แล้ว แต่ความหมายของ "อันดับ 1 จาก 6" กับ "อันดับ 1 จาก 28"');
  W('   ไม่เท่ากันเป๊ะ');
  W('6. ค่าธรรมเนียมหุ้นไทยคิดที่สเปรด 1 tick ซึ่งเป็นพื้นตามกติกาตลาด ของจริงมักกว้างกว่า');
  W('   → ช่องที่ "เกือบคุ้ม" ในรายงานนี้ อาจไม่คุ้มจริง');
  W('7. 1H ย้อนได้แค่ 730 วัน = เห็นตลาดยุคเดียว · และ split.json บันทึกไว้เองว่า train+validation');
  W('   ของ 1H ยืดเลยจุดเริ่ม test ของ 1D ไปแล้ว');
  W('8. ตัวเลข "ความแม่นที่ทำได้" ใน C5 เลือก feature ที่ดีที่สุดจากข้อมูลชุดเดียวกัน');
  W('   = มองโลกในแง่ดีเกินจริงโดยโครงสร้าง');
  W('9. **กลุ่ม `RUNNER` มีการรั่วที่การเลือกตัว** (C9) — ทุกตัวเลขของกลุ่มนี้อ่านได้อย่างเดียว');
  W('   คือ "นี่คือหน้าตาของการเลือกผู้ชนะย้อนหลัง" ห้ามใช้ตัดสินใจลงเงิน ให้ใช้ `RUNNER_PIT` แทน');
  W('10. `RUNNER_PIT` แก้เรื่องการเลือกตัวแล้ว แต่แก้ survivorship bias ไม่ได้ — หุ้นที่ออกจาก');
  W('   กระดานไปแล้วไม่มีอยู่ในคลังตั้งแต่แรก จึงไม่มีวันถูกเลือกและไม่มีวันขาดทุนให้เห็น');
  W('   ผลจริงจึงยังแย่กว่าที่วัดได้เสมอ');
  W('');
  W(`_รันเสร็จใน ${elapsed.toFixed(1)} วินาที · seed ${OUT.opt.seed} · bootstrap ${OUT.opt.bootstrap} รอบ_`);
  W('');
  W('_รันซ้ำด้วยอาร์กิวเมนต์ชุดเดียวกันได้ผลเหมือนเดิมทุกบรรทัด **ยกเว้นบรรทัดเวลาที่ใช้รันข้างบน**_');
  W('_(ตรวจแล้วด้วยการรันซ้ำจริงแล้วเทียบทีละไบต์ · ฝั่ง JSON เหมือนกันทุกค่ายกเว้น `generatedAt`)_');
  W('_· เปลี่ยนค่า `--bootstrap` จะทำให้ช่วงความเชื่อมั่นขยับ (ค่ากลางและค่า p ไม่ขยับ) จึงต้องอ่านคู่กับค่านี้เสมอ_');
}

main().catch((e) => { console.error(e); process.exit(1); });
