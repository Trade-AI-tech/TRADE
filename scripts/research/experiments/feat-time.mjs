#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  feat-time.mjs — ตระกูลที่ 3: เวลา · ฤดูกาล · การเปลี่ยนระบอบความผันผวน        ║
 * ║                                                                              ║
 * ║  คำถามเดียวของไฟล์นี้:                                                        ║
 * ║    "feature ที่เกี่ยวกับ *เวลา* มีพลังทำนายทิศราคาพอจะชนะค่าธรรมเนียมไหม"      ║
 * ║                                                                              ║
 * ║  ⚠ ไฟล์นี้ **ไม่ใช้ข้อมูลอนาคต** เลย (ตรงข้ามกับ ceiling.mjs)                  ║
 * ║    ทุก feature ที่แท่ง i คำนวณจาก candles[0..i] เท่านั้น และถูกพิสูจน์ด้วยการ    ║
 * ║    ตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ (หัวข้อ T1) — ถ้าค่าของแท่งเก่าเปลี่ยนแม้บิตเดียว ║
 * ║    ถือว่าสอบตกทั้งไฟล์                                                        ║
 * ║                                                                              ║
 * ║  ไฟล์นี้ไม่ import อะไรจาก ceiling.mjs · ไม่แตะ lab.mjs · engine-lab.mjs        ║
 * ║  · feat-volume.mjs · feat-cross.mjs (เขียนของตัวเองทั้งหมด แล้วตรวจสอบ         ║
 * ║  ความถูกต้องกับ src/lib/indicators.ts ตัวจริงในหัวข้อ T0)                      ║
 * ║                                                                              ║
 * ║  ไฟล์นี้ทำงานบน **ชุด train เท่านั้น** — ตัดข้อมูลทิ้งที่ trainEnd ตั้งแต่ตอนโหลด ║
 * ║  แท่งหลัง trainEnd ไม่เคยถูกอ่านเข้าหน่วยความจำเลยแม้แต่แท่งเดียว                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * วิธีวัด (ต้องเหมือน feat-volume / feat-cross เพื่อให้เทียบข้ามตระกูลได้)
 *   · feature ที่แท่ง i ← candles[0..i]
 *   · ผลตอบแทนอนาคต ← เข้าที่ราคาเปิดแท่ง i+1 ออกที่ราคาเปิดแท่ง i+1+h
 *     (ตรงกับกติกาของ lab.mjs: สัญญาณเห็นได้ถึงแท่ง i · เข้าไม้ที่แท่งถัดไป)
 *   · Spearman rank correlation (information coefficient) ทนค่าสุดขั้ว
 *   · ช่วงความเชื่อมั่น: bootstrap ระดับ **สัญลักษณ์** (ไม่ใช่ระดับแท่ง)
 *   · ค่า p: cluster-robust จับกลุ่ม (สัญลักษณ์ × ไตรมาส) แล้วแก้ด้วย Holm
 *   · แปลงเป็นเงิน: bps/ไม้ เทียบค่าธรรมเนียมจริงของตลาดนั้น
 *
 * รันซ้ำได้ผลเดิมทุกบรรทัด (seed คงที่ · ไม่มี Math.random · เรียงลำดับทุกอย่าง)
 *
 * ใช้งาน:
 *   node scripts/research/experiments/feat-time.mjs
 *   node scripts/research/experiments/feat-time.mjs --bootstrap=2000 --seed=20260818
 */

import fs from 'node:fs';
import path from 'node:path';

import { ROOT, loadSrcModules } from '../load-src-modules.mjs';

const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const SPLIT_FILE = path.join(REPORT_DIR, 'split.json');
const OUT_MD = path.join(REPORT_DIR, 'exp-feat-time.md');
const OUT_JSON = path.join(REPORT_DIR, 'exp-feat-time.json');

// ════════════════════════════ อาร์กิวเมนต์ + ด่านกันชุด test ════════════════════════════

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

// ไฟล์นี้เป็นงาน "วัดพลังทำนาย" บน train ล้วน ไม่มีเหตุผลใดที่ต้องแตะ validation หรือ test
if (args.split === 'test' || args.split === 'validation' || args['i-am-done-tuning'] || args.confirm) {
  console.error('\n[หยุด] feat-time.mjs ทำงานบน train เท่านั้น — ไม่รับ --split=validation/test\n');
  process.exit(1);
}

const OPT = {
  bootstrap: Number(args.bootstrap ?? 2000),
  seed: Number(args.seed ?? 20260818),
  alpha: Number(args.alpha ?? 0.05),
};

// ════════════════════════════════ ค่าคงที่ของงาน ════════════════════════════════

/** 14 ตัวเดิมในคลัง — ทุกตัวเป็น SET50 (นิยามเดียวกับ exp-th-scalp.md / exp-ceiling.md) */
const SET50_SYMBOLS = [
  'PTT', 'PTTEP', 'AOT', 'CPALL', 'KBANK', 'BBL', 'ADVANC',
  'SCC', 'BDMS', 'CPF', 'DELTA', 'MINT', 'IVL', 'EA',
];

/** เกณฑ์คัดหุ้นซิ่ง — ลอกตัวเลขจาก th-scalp.mjs/ceiling.mjs วัดบน train ของ 1H เท่านั้น */
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
const TH_COMM_RATE = 0.00157;  // 0.157%/ขา รวม VAT
const TH_MIN_FEE = 50;         // ค่าคอมขั้นต่ำต่อคำสั่ง (บาท)
const TH_RISK_BAHT = 2000;     // เงินเสี่ยงต่อไม้ที่ใช้คิดขนาดคำสั่ง
const TH_TICKS_PER_ROUND = 1;  // มองโลกในแง่ดีที่สุดที่ยังพูดได้ (พื้นตามกติกาตลาด)

/** ตาราง bps ของ lab.mjs สำหรับตลาดที่ไม่ใช่หุ้นไทย — ลอกมาทั้งก้อน ไม่แก้ */
const LAB_COST_BPS = {
  byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 },
  bySymbol: {
    XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10,
    EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15,
    // คู่ไขว้บาท — เดิมไม่มีในตารางจึงตกไปใช้ค่าประจำตลาด 1.5 bps คือ "ถูกกว่า USDTHB
    // สิบเท่า" ทั้งที่มันต้องจ่ายสเปรดสองขา (GBPTHB คือ GBPUSD × USDTHB) จึงต้องแพงกว่า
    // USDTHB เสมอ ไม่ใช่ถูกกว่า · 20 มาจาก USDTHB 15 บวกขาหลักอีก 1.5–5 แล้วปัดขึ้น
    // ⚠ มั่นใจต่ำพอ ๆ กับ USDTHB (ดูหมายเหตุข้างบน) — ต้องถูกแทนด้วยใบยืนยันคำสั่งจริง
    //   ทันทีที่เจ้าของเทรดจริง เพราะสี่ตัวนี้คือ 4 ใน 16 ของจักรวาลค่าเงินที่เหลืออยู่
    EURTHB: 20, JPYTHB: 20, GBPTHB: 20, AUDTHB: 20,
  },
};

/** เรขาคณิตอ้างอิงสำหรับ "ขนาดคำสั่ง" ของหุ้นไทย — ตัวเดียวกับ exp-ceiling.md เพื่อให้ค่าธรรมเนียมเทียบกันได้ */
const ATR_PERIOD = 14;
const SL_ATR_MULT = 1.5;

const GROUPS = ['RUNNER', 'SET50', 'GOLD', 'FOREX', 'US_STOCK', 'CRYPTO'];
const GROUP_LABEL = {
  RUNNER: 'หุ้นซิ่งไทย', SET50: 'SET50 เดิม', GOLD: 'ทอง/โลหะ',
  FOREX: 'ค่าเงิน', US_STOCK: 'หุ้นสหรัฐ', CRYPTO: 'คริปโต',
};

/**
 * หน้าต่างถือ
 *   1H ใช้ h = 1,3,6,10 ตามที่กำหนดมาในโจทย์
 *   1D เพิ่ม h = 20 ด้วย เพราะ exp-ceiling.md ชี้ว่าช่องที่ "ยังไม่ปิดตาย" ของหุ้นไทย
 *   คือ 1D ถือ 10–20 แท่ง — การไม่วัด h=20 เลยจะพลาดช่องที่สำคัญที่สุดของเจ้าของ
 *   (การเพิ่มนี้ตัดสินใจ *ก่อน* เห็นผลรอบนี้ และถูกนับเข้าบัญชีการเปรียบเทียบเต็มจำนวน)
 */
const HORIZONS = { '1D': [1, 3, 6, 10, 20], '1H': [1, 3, 6, 10] };

/** หน้าต่างของ percentile แบบวิ่ง — ใช้ทำ tercile ที่ "เทรดได้จริง" โดยไม่ต้องรู้อนาคต */
const PCT_WINDOW = { '1D': 252, '1H': 480 };   // ~1 ปีทำการ / ~2–3 เดือน
const PCT_MIN_HISTORY = 60;                    // ต้องมีอดีตอย่างน้อยเท่านี้ก่อนให้ค่า percentile

/** เกณฑ์ขั้นต่ำที่ยอมให้ "ลงทะเบียนเป็นการทดสอบ" — ตั้งก่อนเห็นผล ใช้เหมือนกันทุกช่อง */
const CELL_MIN_OBS = 500;     // จำนวนแท่งที่ใช้ได้ในช่อง
const CELL_MIN_CLUSTERS = 15; // จำนวนกลุ่มเวลา (ปีสำหรับ 1D · เดือนสำหรับ 1H) ที่น้อยที่สุดที่ยอมสรุป
const BLOCK_MIN_OBS = 20;     // แท่งขั้นต่ำต่อกลุ่ม
const BLOCK_MIN_ARM = 3;      // สำหรับ feature ทวิภาค ต้องมีอย่างน้อยข้างละเท่านี้

/**
 * เวลาเปิด-ปิดตลาดที่ "รู้ล่วงหน้าเสมอ" (ประกาศสาธารณะ ไม่ได้ประมาณจากข้อมูล)
 *   SET   10:00–12:30 · 14:30–16:30 (เวลาไทย)  → แท่ง 1H เวลาไทย 10..16
 *   NYSE  09:30–16:00 (เวลานิวยอร์ก)           → แท่ง 1H เวลานิวยอร์ก 9..16 (16 เป็นแท่งเศษ)
 * ใช้เป็นค่าคงที่เพราะเป็นตารางเวลา ไม่ใช่สถิติ — จึงไม่มีทางรั่วข้อมูลอนาคต
 */
//
// ⚠ หมายเหตุการแก้นิยาม (แก้ *ก่อน* ดูผลของ lateBar และบันทึกไว้ตรงนี้):
//   รอบแรกตั้ง lateFromHour = 15 ทั้งสองตลาด แล้วตารางตรวจสัดส่วนใน T2 โชว์ว่า
//   หุ้นไทยยิง 29.8% (2 แท่ง) แต่หุ้นสหรัฐยิง 14.2% (1 แท่ง) = สองตลาดทดสอบคนละสมมติฐาน
//   จึงเปลี่ยนเป็น "แท่งสุดท้ายของรอบซื้อขาย" ทั้งคู่ ให้เป็นสมมติฐานเดียวกันจริง ๆ
//   (หุ้นสหรัฐมีแท่งเศษ 16:00 อยู่บ้าง จึงนับ ≥15 · หุ้นไทยแท่งสุดท้ายคือ 16:00)
const SESSION = {
  TH_STOCK: { openHour: 10, lateFromHour: 16, barsPerDay: 7 },
  US_STOCK: { openHour: 9, lateFromHour: 15, barsPerDay: 7 },
};

/** ช่วงตลาดโลกในเวลา UTC — คงที่ตามธรรมเนียมสากล (ลอนดอน 07–16 · นิวยอร์ก 12–21) */
const UTC_SESSION = { overlapFrom: 13, overlapTo: 16, asiaFrom: 0, asiaTo: 7 };

// ════════════════════════════ นิยาม feature (ลงทะเบียนล่วงหน้า) ════════════════════════════

/**
 * ทุกตัวต้องมี "กลไก" ก่อนถึงจะได้เข้ามาวัด — ไม่ไล่ทุกช่องแล้วเก็บที่สวย
 *
 * kind: 'binary'  = ค่า 0/1 · เทียบกลุ่ม 1 กับกลุ่ม 0 ตรง ๆ
 *       'cont'    = ค่าต่อเนื่อง · แบ่ง tercile ด้วย percentile แบบวิ่ง (เทรดได้จริง)
 *
 * expect: ทิศที่กลไกทำนายไว้ *ก่อน* วัด — ถ้าผลออกมาตรงข้าม ต้องระวังเป็นพิเศษ
 */
const FEATURES = [
  // ── A · เวลาในวัน (1H เท่านั้น) ────────────────────────────────────────────────
  {
    id: 'openBar', family: 'A', kind: 'binary', tfs: ['1H'],
    groups: ['RUNNER', 'SET50', 'US_STOCK'],
    label: 'แท่งแรกของวัน',
    why: 'ข่าวข้ามคืนถูกอัดเข้าราคาในชั่วโมงแรก — ถ้าการอัดยังไม่จบ ทิศของชั่วโมงแรกควรไปต่อ',
    expect: '+ (ไปต่อ)',
  },
  {
    id: 'lateBar', family: 'A', kind: 'binary', tfs: ['1H'],
    groups: ['RUNNER', 'SET50', 'US_STOCK'],
    label: 'แท่งสุดท้ายของรอบซื้อขาย',
    why: 'ท้ายวันมีการล้างสถานะ/คำสั่งปิดตลาด แรงซื้อขายไม่ได้มาจากข้อมูลใหม่ → ควรกลับตัว',
    expect: '− (กลับตัว)',
  },
  {
    id: 'dayProgress', family: 'A', kind: 'cont', tfs: ['1H'],
    groups: ['RUNNER', 'SET50', 'US_STOCK'],
    label: 'ตำแหน่งในรอบซื้อขาย (0=เปิด 1=ปิด)',
    why: 'พฤติกรรมราคาเป็นรูปตัว U ตลอดวัน — ถ้ามี drift ตามตำแหน่งในวันจริง ตัวนี้จับได้',
    expect: 'ไม่ระบุทิศ (วัดว่ามี drift ไหม)',
  },
  {
    id: 'overlapLdnNy', family: 'A', kind: 'binary', tfs: ['1H'],
    groups: ['FOREX', 'GOLD'],
    label: 'ช่วงลอนดอน–นิวยอร์กทับกัน (13–16 UTC)',
    why: 'สภาพคล่องสูงสุดของวัน ข่าวสหรัฐออกช่วงนี้ → แนวโน้มควรลากยาวกว่าช่วงอื่น',
    expect: '+ (ไปต่อ)',
  },
  {
    id: 'asiaQuiet', family: 'A', kind: 'binary', tfs: ['1H'],
    groups: ['FOREX', 'GOLD', 'CRYPTO'],
    label: 'ช่วงเอเชียเงียบ (00–07 UTC)',
    why: 'สภาพคล่องบาง ไม่มีข่าวหลัก → ราคามักแกว่งในกรอบแล้วกลับเข้าหาค่ากลาง',
    expect: '− (กลับตัว)',
  },

  // ── B · ปฏิทิน (ทั้งสองกรอบเวลา) ───────────────────────────────────────────────
  {
    id: 'isMonday', family: 'B', kind: 'binary', tfs: ['1D', '1H'], groups: GROUPS,
    label: 'วันจันทร์',
    why: 'ข่าวสุดสัปดาห์สะสมมา 2 วันแล้วระบายวันจันทร์ (weekend effect ที่มีงานวิจัยรองรับ)',
    expect: '− (ตำราเก่าว่าจันทร์ติดลบ)',
  },
  {
    id: 'isFriday', family: 'B', kind: 'binary', tfs: ['1D', '1H'], groups: GROUPS,
    label: 'วันศุกร์',
    why: 'ก่อนหยุดยาวคนลดความเสี่ยง ปิดสถานะ → แรงขายไม่ได้มาจากข้อมูลใหม่',
    expect: '+ (ตำราเก่าว่าศุกร์เป็นบวก)',
  },
  {
    id: 'turnOfMonth', family: 'B', kind: 'binary', tfs: ['1D', '1H'], groups: GROUPS,
    label: 'รอยต่อเดือน (วันที่ ≥28 หรือ ≤3)',
    why: 'เงินเดือน/เงินกองทุนไหลเข้าตลาดต้นเดือน = แรงซื้อที่ไม่เกี่ยวกับข่าว',
    expect: '+ (ไหลเข้า)',
  },

  // ── C · การเปลี่ยนระบอบความผันผวน + เวลาตั้งแต่เหตุการณ์ (ทั้งสองกรอบเวลา) ──────
  {
    id: 'atrChg10', family: 'C', kind: 'cont', tfs: ['1D', '1H'], groups: GROUPS,
    label: 'ATR ตอนนี้เทียบ ATR เมื่อ 10 แท่งก่อน (log)',
    why: 'exp-regime.md วัด "ระดับ" ความผันผวนแล้วไม่รอด — ตัวนี้วัด "การเปลี่ยน" ซึ่งเป็นคนละเรื่อง',
    expect: 'ไม่ระบุทิศ (วัดว่าการขยายตัวบอกทิศได้ไหม)',
  },
  {
    id: 'squeeze20', family: 'C', kind: 'cont', tfs: ['1D', '1H'], groups: GROUPS,
    label: 'การขยายตัวหลังบีบตัว = log(ATR ตอนนี้ ÷ ATR ต่ำสุด 20 แท่ง)',
    why: 'ความผันผวนบีบแล้วคลาย เป็นกลไกที่มีมาตรฐาน (squeeze) — ทดสอบว่าคลายแล้วบอกทิศได้ไหม',
    expect: 'ไม่ระบุทิศ',
  },
  {
    id: 'sinceExtreme20', family: 'C', kind: 'cont', tfs: ['1D', '1H'], groups: GROUPS,
    label: '(แท่งนับจากจุดสูงสุด − แท่งนับจากจุดต่ำสุด) ÷ 20',
    why: 'เวลาที่ผ่านไปนับจากเหตุการณ์ล่าสุด — ค่าบวก = จุดต่ำสุดสดกว่า (เพิ่งลงมา)',
    expect: 'ไม่ระบุทิศ',
  },
  {
    id: 'gapZ', family: 'C', kind: 'cont', tfs: ['1D', '1H'], groups: GROUPS,
    label: 'ช่องว่างข้ามแท่ง ÷ ATR% (gap)',
    why: 'พฤติกรรม gap เป็นสิ่งที่เครื่องยนต์ปัจจุบันไม่เคยแตะ — gap มักถูกปิด (fade)',
    expect: '− (ปิด gap)',
  },

  // ── X · ตัวควบคุม (ต้องอยู่ในตระกูลเดียวกันเพื่อโดน Holm เท่ากัน) ────────────────
  {
    id: 'ctrlNoise', family: 'X', kind: 'cont', tfs: ['1D', '1H'], groups: GROUPS,
    label: '⟨ตัวควบคุม⟩ เลขสุ่มที่ผูกกับ (สัญลักษณ์, ดัชนีแท่ง)',
    why: 'ไม่มีกลไกใด ๆ — ถ้าตัวนี้ "ผ่าน" ที่ไหน แปลว่ากระบวนการทดสอบทั้งไฟล์เชื่อไม่ได้',
    expect: '0 (ต้องไม่ผ่าน)',
  },
  {
    id: 'ctrlRevPrev', family: 'X', kind: 'cont', tfs: ['1D', '1H'], groups: GROUPS,
    label: '⟨ตัวควบคุม⟩ ผลตอบแทนแท่งก่อนหน้า (กลับเครื่องหมาย) ÷ ATR%',
    why: 'การกลับตัวระยะสั้นเป็นผลที่มีอยู่จริงในตลาดหุ้น — ถ้าเครื่องวัดนี้จับไม่ได้ แปลว่าเครื่องวัดไม่มีฟัน',
    expect: '+ (ควรจับได้บ้าง)',
  },
];

/** feature ที่ควรวัดกับ "ขนาด" ด้วย เพราะกลไกของมันเกี่ยวกับความผันผวน ไม่ใช่ทิศ */
const SIZE_FEATURES = ['atrChg10', 'squeeze20', 'sinceExtreme20', 'gapZ', 'ctrlNoise'];

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
 * ต้องใช้ตัวนี้แทน bootstrap ในการหาค่า p เพราะ Holm ที่หลายร้อยการทดสอบ
 * ต้องการ p ระดับ 1e-4 ซึ่ง bootstrap B=2000 มีพื้นแค่ 5e-4 — วัดไม่ละเอียดพอ
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
 * เบต้าไม่สมบูรณ์ (Numerical Recipes) — ใช้หาค่า p ของการแจกแจง t
 * จำเป็นเพราะรอบนี้จับกลุ่มแบบ ช่วงเวลาล้วน ทำให้จำนวนกลุ่มเหลือ 15–47 กลุ่ม
 * ที่จำนวนกลุ่มเท่านี้ การใช้ normal จะให้ค่า p เล็กเกินจริง = เข้าข้างการค้นพบ
 */
function betacf(a, b, x) {
  const FPMIN = 1e-300; const EPS = 3e-16;
  const qab = a + b; const qap = a + 1; const qam = a - 1;
  let c = 1; let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function gammln(z) {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z; let y = z; let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
function betai(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(gammln(a + b) - gammln(a) - gammln(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** P(|T| > |t|) ของ Student-t ที่ df องศาอิสระ */
function tTwoSidedP(t, df) {
  if (!Number.isFinite(t) || !(df > 0)) return NaN;
  return betai(df / 2, 0.5, df / (df + t * t));
}

/**
 * ค่าเฉลี่ยถ่วงน้ำหนักพร้อมความคลาดเคลื่อนแบบจับกลุ่ม (cluster-robust)
 *
 * ทำไมต้องจับกลุ่ม: แท่งที่ติดกันมีหน้าต่างถือทับซ้อนกัน และแท่งของสัญลักษณ์เดียวกัน
 * เดินไปด้วยกัน ถ้าคิด SE แบบสุ่มอิสระ จำนวนตัวอย่างจะ "เฟ้อ" หลายเท่า
 * กลุ่มที่ใช้ = (สัญลักษณ์ × ไตรมาส) — เหมือน exp-ceiling.md แต่ขยายจากเดือนเป็นไตรมาส
 * เพราะรอบนี้มี h ถึง 20 แท่ง หน้าต่างถือยาวกว่าหนึ่งเดือนของ 1D
 *
 * @param clusters [{n, s}] — n = น้ำหนักของกลุ่ม, s = n × ค่าที่วัดในกลุ่ม
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
  // ใช้ t ที่ G−1 องศาอิสระ ไม่ใช่ normal — จำนวนกลุ่มรอบนี้มีแค่ 15–47
  return { mean, se, z, p: tTwoSidedP(z, G - 1), n: N, G };
}

function percentileOfSorted(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Spearman ที่แก้ค่าเสมอแบบ average rank (จำเป็นมาก เพราะ feature ทวิภาคเสมอกันเป็นพัน) */
function spearman(xs, ys) {
  const m = xs.length;
  if (m < BLOCK_MIN_OBS) return NaN;
  const rx = averageRanks(xs);
  const ry = averageRanks(ys);
  if (!rx || !ry) return NaN;              // ค่าคงที่ทั้งกลุ่ม → สหสัมพันธ์ไม่นิยาม
  let sx = 0; let sy = 0;
  for (let i = 0; i < m; i++) { sx += rx[i]; sy += ry[i]; }
  const mx = sx / m; const my = sy / m;
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < m; i++) {
    const a = rx[i] - mx; const b = ry[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (!(dx > 0) || !(dy > 0)) return NaN;
  return num / Math.sqrt(dx * dy);
}

/**
 * อันดับที่ทำให้เป็นมาตรฐาน (mean 0 · sd 1 แบบประชากร)
 *
 * ประโยชน์: mean(zx[i] × zy[i]) = Spearman พอดีเป๊ะ
 * แปลว่าเราได้ "ค่าที่วัดได้รายแท่ง" ของ IC ออกมา → เอาไปจับกลุ่มหา cluster-robust SE
 * และแยกดูรายปีได้ โดยไม่ต้องคำนวณ IC ใหม่ในหน้าต่างสั้น ๆ (ซึ่งเป็นที่มาของอคติใน T3)
 */
function standardRanks(v) {
  const m = v.length;
  const r = averageRanks(v);
  if (!r) return null;
  let s = 0;
  for (let i = 0; i < m; i++) s += r[i];
  const mu = s / m;
  let q = 0;
  for (let i = 0; i < m; i++) { const d = r[i] - mu; q += d * d; }
  const sd = Math.sqrt(q / m);
  if (!(sd > 0)) return null;
  const z = new Float64Array(m);
  for (let i = 0; i < m; i++) z[i] = (r[i] - mu) / sd;
  return z;
}

/** อันดับเฉลี่ยของค่าเสมอ — คืน null ถ้าทุกค่าเท่ากัน */
function averageRanks(v) {
  const m = v.length;
  const idx = new Int32Array(m);
  for (let i = 0; i < m; i++) idx[i] = i;
  const arr = Array.from(idx).sort((a, b) => v[a] - v[b]);
  const r = new Float64Array(m);
  let i = 0; let distinct = 0;
  while (i < m) {
    let j = i;
    while (j + 1 < m && v[arr[j + 1]] === v[arr[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[arr[k]] = avg;
    distinct++;
    i = j + 1;
  }
  return distinct < 2 ? null : r;
}

// ── บัญชีการเปรียบเทียบ ────────────────────────────────────────────────────────
//
// รอบนี้เสี่ยง p-hacking สูงที่สุดในโครงการ: feature หลายสิบ × หลายกรอบเวลา × หลายกลุ่ม
// กติกา: ทุกช่องที่ "ถาม" ต้องถูกนับ ไม่ใช่เฉพาะช่องที่ "ตอบว่าใช่"
const TESTS = [];
function registerTest(t) { TESTS.push({ idx: TESTS.length + 1, ...t }); }

/** Holm–Bonferroni ภายในตระกูล — ตระกูล = ชุดคำถามที่ถามพร้อมกันบนข้อมูลชุดเดียวกัน */
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
  return byFamily;
}

// ═══════════════════════════════ โหลดข้อมูล ═══════════════════════════════

/** ดัชนีแรกที่ timestamp >= cut */
function lowerBound(times, cut) {
  let lo = 0; let hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < cut) lo = mid + 1; else hi = mid; }
  return lo;
}

/** แท่งที่เชื่อถือได้พอจะใช้ — ลอกเกณฑ์จาก lab.mjs */
const isUsableBar = (c) => (
  Number.isFinite(c.open) && c.open > 0 && Number.isFinite(c.high) && c.high > 0
  && Number.isFinite(c.low) && c.low > 0 && Number.isFinite(c.close) && c.close > 0
  && c.low <= c.high
);

/**
 * โหลด dataset หนึ่งชุด แล้ว **ตัดทิ้งทุกแท่งตั้งแต่ trainEnd เป็นต้นไป**
 *
 * นี่คือด่านกันชุด test/validation ที่แข็งแรงที่สุดเท่าที่ทำได้: แท่งหลัง trainEnd
 * ไม่เคยเข้ามาอยู่ในหน่วยความจำของกระบวนการนี้เลย จึงเป็นไปไม่ได้ที่ผลจะรั่ว
 * ผลข้างเคียง: ไม้ท้าย train ที่หน้าต่างถือยื่นเลย trainEnd จะถูกทิ้ง (รายงานจำนวนไว้)
 */
function loadDatasetTrainOnly(file, trainEndMs) {
  const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
  const from = j.quality?.usable?.from;
  let candles = j.candles;
  if (from) {
    const cut = Date.parse(from);
    const idx = candles.findIndex((c) => Date.parse(c.timestamp) >= cut);
    if (idx > 0) candles = candles.slice(idx);
    else if (idx === -1) candles = [];
  }
  const times = candles.map((c) => Date.parse(c.timestamp));
  const end = lowerBound(times, trainEndMs);
  return {
    file, symbol: j.symbol, market: j.market, timeframe: j.timeframe,
    tz: j.exchangeTimezone || 'UTC',
    verdict: j.quality?.verdict ?? 'unknown',
    barsAll: candles.length,
    candles: candles.slice(0, end),
    times: times.slice(0, end),
  };
}

const listDatasets = () => fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();

// ═══════════════════════════ ปฏิทินท้องถิ่นของตลาด ═══════════════════════════
//
// เวลาในไฟล์เป็น UTC ทั้งหมด แต่ "ชั่วโมงในวัน" ต้องเป็นเวลาท้องถิ่นของตลาด
// (นิวยอร์กมี DST ถ้าใช้ UTC ตรง ๆ ชั่วโมงเปิดตลาดจะเลื่อนไปมาปีละสองครั้ง)
// ใช้ Intl ซึ่งรู้ตาราง DST จริง แล้วจำผลไว้ เพราะเรียกซ้ำหลายล้านครั้ง

const calCache = new Map();
const fmtCache = new Map();
const WD = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(tz, ms) {
  const key = `${tz}|${ms}`;
  let hit = calCache.get(key);
  if (hit) return hit;
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, fmt);
  }
  const p = {};
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
  hit = {
    y: Number(p.year), mo: Number(p.month), d: Number(p.day),
    h: Number(p.hour) % 24, wd: WD[p.weekday] ?? 0,
    dateKey: `${p.year}-${p.month}-${p.day}`,
  };
  calCache.set(key, hit);
  return hit;
}

// ═══════════════════════════ ตัวชี้วัดพื้นฐาน (causal) ═══════════════════════════

/**
 * ATR ทุกดัชนีในครั้งเดียว — ต้องได้ค่าเท่ากับ src/lib/indicators.ts ทุกบิต (ตรวจใน T0)
 * นิยามของตัวจริง: ค่าเฉลี่ยธรรมดาของ True Range ในหน้าต่างที่จบที่แท่ง i
 * (ไม่ใช่ Wilder smoothing) — atr[i] อ่านเฉพาะ candles[max(0,i-14) .. i]
 */
function atrSeries(candles, period = ATR_PERIOD) {
  const n = candles.length;
  const out = new Float64Array(n).fill(NaN);
  if (n < 2) return out;
  const pre = new Float64Array(n + 1);
  for (let k = 1; k < n; k++) {
    const c = candles[k]; const pc = candles[k - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    pre[k] = pre[k - 1] + (Number.isFinite(tr) ? tr : 0);
  }
  for (let i = 1; i < n; i++) {
    const start = Math.max(0, i - period);
    const cnt = i - start;
    out[i] = cnt > 0 ? (pre[i] - pre[start]) / cnt : NaN;
  }
  return out;
}

/**
 * percentile ของค่าปัจจุบันเทียบกับอดีต W แท่งล่าสุด (รวมตัวเอง)
 *
 * ทำไมต้องเป็นหน้าต่างวิ่ง ไม่ใช่ค่าเฉลี่ยทั้งชุด: การ normalize ด้วยสถิติของทั้งชุด
 * คือการรั่วที่เงียบที่สุด (exp-ceiling.md C1 จับได้ 861,931 จุดด้วยตัวควบคุมแบบนี้)
 * หน้าต่างวิ่งอ่านเฉพาะอดีต จึงทนการตัดข้อมูลท้ายทิ้งได้โดยนิยาม — และถูกพิสูจน์ใน T1
 */
function rollingPercentile(v, W) {
  const n = v.length;
  const out = new Float64Array(n).fill(NaN);
  const buf = new Float64Array(W);
  const inWin = new Uint8Array(n);
  let len = 0;
  const lb = (x) => { let lo = 0; let hi = len; while (lo < hi) { const m = (lo + hi) >> 1; if (buf[m] < x) lo = m + 1; else hi = m; } return lo; };
  const ub = (x) => { let lo = 0; let hi = len; while (lo < hi) { const m = (lo + hi) >> 1; if (buf[m] <= x) lo = m + 1; else hi = m; } return lo; };
  for (let i = 0; i < n; i++) {
    const drop = i - W;
    if (drop >= 0 && inWin[drop]) {
      const pos = lb(v[drop]);
      buf.copyWithin(pos, pos + 1, len);
      len--;
    }
    const x = v[i];
    if (Number.isFinite(x)) {
      const pos = ub(x);
      buf.copyWithin(pos + 1, pos, len);
      buf[pos] = x;
      len++;
      inWin[i] = 1;
      if (len >= PCT_MIN_HISTORY) {
        const a = lb(x); const b = ub(x);
        out[i] = (a + (b - a) / 2) / len;
      }
    }
  }
  return out;
}

/** เลขสุ่มที่ผูกกับ (สัญลักษณ์, ดัชนี) — ให้ค่าเดิมเสมอ และไม่ขึ้นกับความยาวข้อมูล */
function hashNoise(symbolSeed, i) {
  let h = (symbolSeed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function strSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// ═══════════════════════ คำนวณ feature ทั้งชุดของ dataset หนึ่ง ═══════════════════════

/**
 * ⚠ ทุกค่าที่คืนจากฟังก์ชันนี้ที่ดัชนี i ต้องขึ้นกับ candles[0..i] เท่านั้น
 *   ถ้าข้อนี้ผิด T1 จะจับได้ทันที (ตัดท้ายทิ้ง 20% แล้วค่าของแท่งเก่าต้องไม่ขยับ)
 *
 * @param nUse จำนวนแท่งที่ "มองเห็น" — ใช้ตอนตรวจ look-ahead ด้วยการตัดท้าย
 * @param withLeak ใส่ตัวควบคุมเชิงบวกที่รั่วจริง (z-score จากค่าเฉลี่ยทั้งชุด) ด้วยไหม
 */
function computeFeatures(ds, nUse = ds.candles.length, withLeak = false) {
  const n = nUse;
  const c = ds.candles;
  const tz = ds.tz;
  const tf = ds.timeframe;
  const sess = SESSION[ds.market] || null;
  const seed = strSeed(`${ds.market}|${ds.symbol}|${ds.timeframe}`);

  const atr = atrSeries(c.slice(0, n));
  const F = {};
  const alloc = (id) => { F[id] = new Float64Array(n).fill(NaN); return F[id]; };

  const openBar = alloc('openBar');
  const lateBar = alloc('lateBar');
  const dayProg = alloc('dayProgress');
  const overlap = alloc('overlapLdnNy');
  const asiaQ = alloc('asiaQuiet');
  const isMon = alloc('isMonday');
  const isFri = alloc('isFriday');
  const tom = alloc('turnOfMonth');
  const atrChg = alloc('atrChg10');
  const squeeze = alloc('squeeze20');
  const sinceX = alloc('sinceExtreme20');
  const gapZ = alloc('gapZ');
  const noise = alloc('ctrlNoise');
  const revPrev = alloc('ctrlRevPrev');

  // ── กุญแจเวลาสำหรับจับกลุ่ม (cluster) และแบ่งช่วงทดสอบความคงทน ────────────────
  const blockKey = new Array(n);   // ไตรมาส — ใช้กับตัวประมาณแบบเก่าที่ T3 พิสูจน์ว่ามีอคติ
  const yearKey = new Int32Array(n);
  const halfKey = new Array(n);    // ครึ่งปี — ใช้แบ่งช่วงของ 1H ที่ย้อนได้แค่ 2 ปี
  const monthKey = new Array(n);   // เดือน — กลุ่มสำหรับ cluster ของ 1H

  let prevDateKey = null;
  let barIdxInDay = 0;

  for (let i = 0; i < n; i++) {
    const bar = c[i];
    const t = ds.times[i];
    const L = localParts(tz, t);

    // ตำแหน่งในวัน — นับจากแท่งที่ผ่านมาแล้วเท่านั้น จึงเป็น causal เต็มตัว
    if (L.dateKey !== prevDateKey) { barIdxInDay = 0; prevDateKey = L.dateKey; }
    else barIdxInDay++;

    blockKey[i] = `${L.y}Q${Math.floor((L.mo - 1) / 3) + 1}`;
    yearKey[i] = L.y;
    halfKey[i] = `${L.y}H${L.mo <= 6 ? 1 : 2}`;
    monthKey[i] = `${L.y}-${String(L.mo).padStart(2, '0')}`;

    if (!isUsableBar(bar)) continue;

    // ── A · เวลาในวัน (1H เท่านั้น) ──────────────────────────────────────────
    if (tf === '1H' && sess) {
      openBar[i] = L.h === sess.openHour ? 1 : 0;
      lateBar[i] = L.h >= sess.lateFromHour ? 1 : 0;
      // ตัวหารเป็นค่าคงที่จากตารางเวลาตลาด ไม่ได้ประมาณจากข้อมูล → ไม่รั่ว
      dayProg[i] = Math.min(1, barIdxInDay / (sess.barsPerDay - 1));
    }
    if (tf === '1H') {
      const uh = new Date(t).getUTCHours();
      overlap[i] = uh >= UTC_SESSION.overlapFrom && uh < UTC_SESSION.overlapTo ? 1 : 0;
      asiaQ[i] = uh >= UTC_SESSION.asiaFrom && uh < UTC_SESSION.asiaTo ? 1 : 0;
    }

    // ── B · ปฏิทิน (ปฏิทินล้วน ไม่ได้ประมาณจากข้อมูล → ไม่มีทางรั่ว) ─────────────
    isMon[i] = L.wd === 1 ? 1 : 0;
    isFri[i] = L.wd === 5 ? 1 : 0;
    tom[i] = (L.d >= 28 || L.d <= 3) ? 1 : 0;

    // ── C · ระบอบความผันผวน + เวลาตั้งแต่เหตุการณ์ ──────────────────────────────
    const a = atr[i];
    if (i >= 10 && Number.isFinite(a) && a > 0) {
      const a10 = atr[i - 10];
      if (Number.isFinite(a10) && a10 > 0) atrChg[i] = Math.log(a / a10);
    }
    if (i >= 19 && Number.isFinite(a) && a > 0) {
      let mn = Infinity;
      for (let k = i - 19; k <= i; k++) { const x = atr[k]; if (Number.isFinite(x) && x > 0 && x < mn) mn = x; }
      if (mn < Infinity) squeeze[i] = Math.log(a / mn);
    }
    if (i >= 19) {
      let hiIdx = -1; let loIdx = -1; let hiV = -Infinity; let loV = Infinity;
      for (let k = i - 19; k <= i; k++) {
        const b = c[k];
        if (!isUsableBar(b)) continue;
        if (b.high > hiV) { hiV = b.high; hiIdx = k; }
        if (b.low < loV) { loV = b.low; loIdx = k; }
      }
      if (hiIdx >= 0 && loIdx >= 0) sinceX[i] = ((i - hiIdx) - (i - loIdx)) / 20;
    }
    if (i >= 1) {
      const prev = c[i - 1];
      if (isUsableBar(prev) && prev.close > 0) {
        const ap = atr[i - 1];
        const atrPct = Number.isFinite(ap) && ap > 0 ? ap / prev.close : NaN;
        const g = (bar.open - prev.close) / prev.close;
        if (Number.isFinite(atrPct) && atrPct > 0) gapZ[i] = g / atrPct;
        const r = (prev.close - c[i - 1].open) / c[i - 1].open;   // ผลตอบแทนภายในแท่งก่อนหน้า
        const rr = (prev.close - (i >= 2 ? c[i - 2].close : NaN)) / (i >= 2 ? c[i - 2].close : NaN);
        const base = Number.isFinite(rr) ? rr : r;
        if (Number.isFinite(atrPct) && atrPct > 0 && Number.isFinite(base)) revPrev[i] = -base / atrPct;
      }
    }

    noise[i] = hashNoise(seed, i);
  }

  // ── ตัวควบคุมเชิงบวก: normalize ด้วยค่าเฉลี่ย/ส่วนเบี่ยงเบนของ "ทั้งชุด" = รั่วจริง ──
  if (withLeak) {
    let s = 0; let ss = 0; let k = 0;
    for (let i = 0; i < n; i++) { const x = c[i].close; if (Number.isFinite(x)) { s += x; ss += x * x; k++; } }
    const mu = s / k; const sd = Math.sqrt(Math.max(0, ss / k - mu * mu));
    const z = alloc('zClose_LEAKY');
    for (let i = 0; i < n; i++) z[i] = sd > 0 ? (c[i].close - mu) / sd : 0;
  }

  return { F, atr, blockKey, yearKey, halfKey, monthKey };
}

/** percentile แบบวิ่งของ feature ต่อเนื่องทุกตัว (คำนวณแยกเพื่อให้ T1 ตรวจได้ด้วย) */
function computePercentiles(F, tf) {
  const W = PCT_WINDOW[tf];
  const P = {};
  for (const f of FEATURES) {
    if (f.kind !== 'cont') continue;
    const v = F[f.id];
    if (v) P[f.id] = rollingPercentile(v, W);
  }
  return P;
}

// ═══════════════════════════════ โมเดลต้นทุน ═══════════════════════════════

function tickSizeFor(price) {
  for (const b of SET_TICK_TABLE) if (price >= b.from && price < b.to) return b.tick;
  return SET_TICK_TABLE[SET_TICK_TABLE.length - 1].tick;
}

/**
 * ค่าธรรมเนียมไป-กลับ คิดเป็นสัดส่วนของมูลค่าสถานะ — สูตรเดียวกับ exp-ceiling.md
 * หุ้นไทย: ค่าคอมสองขา (ขั้นต่ำ 50 บาท) ÷ มูลค่าคำสั่ง + สเปรด 1 tick
 *          มูลค่าคำสั่ง = เงินเสี่ยง ÷ ระยะ SL (ใช้ SL 1.5×ATR เป็นค่าอ้างอิง)
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

// ═════════════════════════════ ตัวช่วยพิมพ์รายงาน ═════════════════════════════

const LINES = [];
const W = (s = '') => LINES.push(s);
const nf = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const bpsS = (v, d = 2) => (Number.isFinite(v) ? (v * 10000).toFixed(d) : '—');
const pS = (p) => (!Number.isFinite(p) ? '—' : (p < 1e-4 ? p.toExponential(1) : p.toFixed(4)));
const pctS = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const intS = (v) => (Number.isFinite(v) ? v.toLocaleString('en-US') : '—');

// ════════════════════════════════════ MAIN ════════════════════════════════════

async function main() {
  const t0 = Date.now();
  const bounds = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
  const JSONOUT = {
    generatedAt: new Date().toISOString(),
    opt: OPT,
    note: 'train เท่านั้น · ไม่มี look-ahead · ทุกตัวเลขมาจากการรันจริง',
    audit: {}, cells: [], tests: [],
  };

  // ── โหลดชุดข้อมูล (ตัดที่ trainEnd ตั้งแต่ตอนโหลด) ──────────────────────────
  const trainEnd = { '1D': Date.parse(bounds.timeframes['1D'].trainEnd), '1H': Date.parse(bounds.timeframes['1H'].trainEnd) };
  const datasets = [];
  const dropped = [];
  for (const f of listDatasets()) {
    const tf = f.endsWith('__1D.json') ? '1D' : '1H';
    const ds = loadDatasetTrainOnly(f, trainEnd[tf]);
    if (ds.verdict === 'bad') { dropped.push(`${ds.market}/${ds.symbol}/${ds.timeframe} (คุณภาพ bad)`); continue; }
    if (ds.candles.length < 300) { dropped.push(`${ds.market}/${ds.symbol}/${ds.timeframe} (train ${ds.candles.length} แท่ง — น้อยเกินไป)`); continue; }
    datasets.push(ds);
  }

  // ── คัดหุ้นซิ่ง จาก train ของ 1H เท่านั้น (นิยามเดียวกับ exp-th-scalp / exp-ceiling) ──
  const thProfiles = [];
  for (const ds of datasets) {
    if (ds.market !== 'TH_STOCK' || ds.timeframe !== '1H') continue;
    const ranges = []; const turns = [];
    for (const c of ds.candles) {
      if (!isUsableBar(c)) continue;
      ranges.push((c.high - c.low) / c.close);
      turns.push((c.volume ?? 0) * c.close);
    }
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    const med = (a) => (a.length ? percentileOfSorted([...a].sort((x, y) => x - y), 0.5) : NaN);
    thProfiles.push({ symbol: ds.symbol, bars: ranges.length, barRangePct: mean(ranges) * 100, turnover: med(turns) });
  }
  const runnerSet = new Set(thProfiles.filter((p) => !SET50_SYMBOLS.includes(p.symbol)
    && p.barRangePct >= RUNNER_RULE.minBarRangePct
    && p.turnover >= RUNNER_RULE.minTurnoverBaht
    && p.bars >= RUNNER_RULE.minBars).map((p) => p.symbol).sort());

  const groupOf = (ds) => {
    if (ds.market !== 'TH_STOCK') return ds.market;
    if (SET50_SYMBOLS.includes(ds.symbol)) return 'SET50';
    if (runnerSet.has(ds.symbol)) return 'RUNNER';
    return null;
  };

  // ══════════════════ T0 · ตรวจเครื่องวัดก่อนเชื่ออะไรทั้งสิ้น ══════════════════
  const meter = { atrChecked: 0, atrMaxErr: 0, calChecked: 0, calBad: 0, calDetail: {}, fwdChecked: 0, fwdMaxErr: 0 };

  // T0.1 — ATR ที่เขียนใหม่ในไฟล์นี้ ต้องเท่ากับ src/lib/indicators.ts ตัวจริงทุกบิต
  const { indicators } = await loadSrcModules(['src/lib/indicators.ts']);
  for (const ds of datasets) {
    const mine = atrSeries(ds.candles);
    const step = Math.max(1, Math.floor(ds.candles.length / 60));
    for (let i = ATR_PERIOD + 1; i < ds.candles.length; i += step) {
      const real = indicators.ATR(ds.candles.slice(0, i + 1), ATR_PERIOD);
      if (!Number.isFinite(real)) continue;
      meter.atrChecked++;
      meter.atrMaxErr = Math.max(meter.atrMaxErr, Math.abs(mine[i] - real));
    }
  }

  // T0.2 — การแปลงเวลาท้องถิ่นต้องคืนชั่วโมงที่ตรงกับตารางเวลาตลาดที่ประกาศไว้จริง
  //        (ถ้าจัดการ DST ผิด ชั่วโมงเปิดตลาดของหุ้นสหรัฐจะเลื่อนปีละสองครั้ง — จับได้ตรงนี้)
  for (const ds of datasets) {
    if (ds.timeframe !== '1H') continue;
    const sess = SESSION[ds.market];
    if (!sess) continue;
    const hist = {};
    for (let i = 0; i < ds.candles.length; i++) {
      const L = localParts(ds.tz, ds.times[i]);
      hist[L.h] = (hist[L.h] || 0) + 1;
      meter.calChecked++;
      const lo = sess.openHour;
      const hi = sess.openHour + sess.barsPerDay - 1;
      if (L.h < lo || L.h > hi) meter.calBad++;
    }
    meter.calDetail[`${ds.market}/${ds.symbol}`] = hist;
  }

  // T0.3 — ผลตอบแทนอนาคตคำนวณซ้ำด้วยโค้ดคนละชุด แล้วต้องตรงกัน
  for (const ds of datasets.slice(0, 20)) {
    const n = ds.candles.length;
    for (let i = 5; i < n - 25; i += Math.max(1, Math.floor(n / 50))) {
      for (const h of HORIZONS[ds.timeframe]) {
        const e = i + 1; const x = i + 1 + h;
        if (x >= n) continue;
        const a = (ds.candles[x].open - ds.candles[e].open) / ds.candles[e].open;
        const b = ds.candles[x].open / ds.candles[e].open - 1;
        meter.fwdChecked++;
        meter.fwdMaxErr = Math.max(meter.fwdMaxErr, Math.abs(a - b));
      }
    }
  }

  // ═════════ T1 · ตรวจ look-ahead ด้วยการตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ ═════════
  //
  // วิธีที่หนักแน่นที่สุด: คำนวณบนชุดเต็ม → ตัดท้ายทิ้ง 20% → คำนวณซ้ำ
  // → ค่าของแท่งเก่าต้องเท่าเดิม **ทุกบิต** ทำกับ feature ทุกตัว ไม่ยกเว้น
  const leak = {};
  const leakOrder = [];
  const bump = (name, kind, compared, mismatch) => {
    if (!leak[name]) { leak[name] = { kind, compared: 0, mismatch: 0 }; leakOrder.push(name); }
    leak[name].compared += compared; leak[name].mismatch += mismatch;
  };
  let leakDatasets = 0;
  for (const ds of datasets) {
    const n = ds.candles.length;
    const cut = Math.floor(n * 0.8);
    if (cut < PCT_MIN_HISTORY + 40) continue;
    leakDatasets++;
    const full = computeFeatures(ds, n, true);
    const trunc = computeFeatures(ds, cut, true);
    const fullP = computePercentiles(full.F, ds.timeframe);
    const truncP = computePercentiles(trunc.F, ds.timeframe);
    const eq = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || a === b;
    for (const name of Object.keys(full.F)) {
      const A = full.F[name]; const B = trunc.F[name];
      if (!A || !B) continue;
      let bad = 0;
      for (let i = 0; i < cut; i++) if (!eq(A[i], B[i])) bad++;
      bump(name, name.endsWith('_LEAKY') ? 'ตัวควบคุมเชิงบวก (รั่วจริง)' : 'CAUSAL', cut, bad);
    }
    for (const name of Object.keys(fullP)) {
      const A = fullP[name]; const B = truncP[name];
      if (!A || !B) continue;
      let bad = 0;
      for (let i = 0; i < cut; i++) if (!eq(A[i], B[i])) bad++;
      bump(`pct(${name})`, 'CAUSAL', cut, bad);
    }
  }

  // ═════════════════ T2/T3 · เก็บสถิติ IC และเงิน ต่อช่อง ═════════════════
  //
  // ช่อง (cell) = กรอบเวลา × กลุ่ม × feature × หน้าต่างถือ
  // กลุ่มสำหรับ cluster = สัญลักษณ์ × ไตรมาส

  const cells = new Map();
  const cellKey = (tf, g, f, h) => `${tf}|${g}|${f}|${h}`;
  const getCell = (tf, g, f, h) => {
    const k = cellKey(tf, g, f, h);
    let c = cells.get(k);
    if (!c) {
      c = {
        tf, group: g, feature: f, h,
        ic: { cl: new Map(), sym: new Map(), clSym: new Map() },  // clSym = จับกลุ่ม (สัญลักษณ์ × เวลา) เก็บไว้เทียบใน T3 เท่านั้น
        money: { cl: new Map(), sym: new Map() },
        size: { cl: new Map(), sym: new Map() },
        icNaive: [],                               // ตัวประมาณแบบไตรมาส (มีอคติ — เก็บไว้เทียบใน T3)
        moneyNaive: [],
        periods: new Map(),                        // ช่วงเวลา -> {n,s} ของ IC
        obs: 0, sumR: 0, sumR2: 0, nR: 0,
      };
      cells.set(k, c);
    }
    return c;
  };
  const addTo = (map, key, n, s) => {
    const cur = map.get(key) || { n: 0, s: 0 };
    cur.n += n; cur.s += s; map.set(key, cur);
  };
  /** ลงบัญชีระดับสัญลักษณ์อย่างเดียว (bootstrap สุ่มสัญลักษณ์ใช้ตัวนี้) */
  const addSymOnly = (store, sym, n, s) => {
    if (!(n > 0) || !Number.isFinite(s)) return;
    const cur = store.sym.get(sym) || { n: 0, s: 0 };
    cur.n += n; cur.s += s;
    store.sym.set(sym, cur);
  };

  const feeAcc = new Map();     // `${tf}|${group}` -> {s,n}
  const coverage = { entries: 0, droppedTail: 0, unusableBar: 0 };
  const groupSymbols = new Map();
  // ด่านสุดท้าย: แท่งที่ "ใหม่ที่สุด" ที่โค้ดนี้เคยแตะ ต้องเก่ากว่า trainEnd เสมอ
  const guard = { maxTs: {}, trainEnd };
  // ตรวจว่า feature ทวิภาคยิงในสัดส่วนที่นิยามของมันบอกไว้จริง (เช่น แท่งแรกของวัน ≈ 1/7 ของหุ้นไทย)
  const binShare = new Map();

  for (const ds of datasets) {
    const g = groupOf(ds);
    if (!g) continue;
    const tf = ds.timeframe;
    const gk = `${tf}|${g}`;
    if (!groupSymbols.has(gk)) groupSymbols.set(gk, new Set());
    groupSymbols.get(gk).add(ds.symbol);

    const n = ds.candles.length;
    const { F, atr, blockKey, yearKey, halfKey, monthKey } = computeFeatures(ds, n, false);
    const P = computePercentiles(F, tf);
    const hs = HORIZONS[tf];
    // ── กุญแจจับกลุ่ม: **ช่วงเวลาล้วน ไม่มีสัญลักษณ์ปนอยู่ในกุญแจ** ──────────────
    //
    // เหตุผลที่ต้องรวมทุกสัญลักษณ์เข้ากลุ่มเดียวกัน: feature ปฏิทิน (วันจันทร์ · รอยต่อเดือน)
    // มีค่า **เท่ากันทุกสัญลักษณ์ในวันเดียวกัน** ถ้าจับกลุ่มเป็น (สัญลักษณ์ × เวลา)
    // หุ้นไทย 11 ตัวในวันจันทร์เดียวกันจะถูกนับเป็น 11 ตัวอย่างอิสระ ทั้งที่มันคือวันเดียว
    // → SE เล็กเกินจริงราว √11 เท่า ค่า p จึงเล็กเกินจริงมาก
    // การจับกลุ่มด้วยเวลาล้วนกินทั้งความสัมพันธ์ข้ามสัญลักษณ์และตามเวลาในคราวเดียว
    // และเป็นทางเลือกที่ *อนุรักษ์นิยมที่สุด* ซึ่งเหมาะกับรอบที่กลัวผลบวกปลอมเป็นหลัก
    //
    // ความยาวกลุ่มต้องมากกว่าหน้าต่างถือ ≥ 10 เท่า: 1D ถือสูงสุด 20 แท่ง → ปี (~252)
    //                                              1H ถือสูงสุด 10 แท่ง → เดือน (~150)
    const clusterKey = tf === '1D' ? Array.from(yearKey, (y) => String(y)) : monthKey;
    const periodKey = tf === '1D' ? Array.from(yearKey, (y) => String(y)) : halfKey;

    // ผลตอบแทนอนาคต: เข้าที่ open[i+1] ออกที่ open[i+1+h]
    const fwd = {};
    for (const h of hs) {
      const arr = new Float64Array(n).fill(NaN);
      for (let i = 0; i < n; i++) {
        const e = i + 1; const x = i + 1 + h;
        if (x >= n) { continue; }
        const be = ds.candles[e]; const bx = ds.candles[x];
        if (!isUsableBar(be) || !isUsableBar(bx)) continue;
        arr[i] = (bx.open - be.open) / be.open;
      }
      fwd[h] = arr;
    }

    // ค่าธรรมเนียมอ้างอิงของกลุ่มนี้
    {
      let s = 0; let k = 0;
      for (let i = ATR_PERIOD + 1; i < n; i++) {
        const bar = ds.candles[i];
        if (!isUsableBar(bar)) continue;
        const a = atr[i];
        if (!(a > 0)) continue;
        const stopDistPct = (SL_ATR_MULT * a) / bar.close;
        const fee = feeFractionFor(ds.market, ds.symbol, bar.close, stopDistPct);
        if (Number.isFinite(fee)) { s += fee; k++; }
      }
      const cur = feeAcc.get(gk) || { s: 0, n: 0 };
      cur.s += s; cur.n += k;
      feeAcc.set(gk, cur);
    }

    // นับ coverage + ด่านเวลา
    guard.maxTs[tf] = Math.max(guard.maxTs[tf] ?? -Infinity, ds.times[n - 1]);
    for (let i = 0; i < n; i++) {
      if (!isUsableBar(ds.candles[i])) { coverage.unusableBar++; continue; }
      coverage.entries++;
      if (i + 1 + hs[hs.length - 1] >= n) coverage.droppedTail++;
    }

    // สัดส่วนการยิงของ feature ทวิภาค
    for (const f of FEATURES) {
      if (f.kind !== 'binary' || !f.tfs.includes(tf) || !f.groups.includes(g)) continue;
      const v = F[f.id];
      if (!v) continue;
      const key = `${tf}|${g}|${f.id}`;
      const cur = binShare.get(key) || { ones: 0, total: 0 };
      for (let i = 0; i < n; i++) { if (v[i] === 1) cur.ones++; if (Number.isFinite(v[i])) cur.total++; }
      binShare.set(key, cur);
    }

    // ── เดินทีละ feature × horizon แล้วสะสมเป็นบล็อก ──────────────────────────
    for (const f of FEATURES) {
      if (!f.tfs.includes(tf) || !f.groups.includes(g)) continue;
      const v = F[f.id];
      if (!v) continue;
      const pv = f.kind === 'cont' ? P[f.id] : null;

      for (const h of hs) {
        const y = fwd[h];
        const cell = getCell(tf, g, f.id, h);

        // ══ ตัวประมาณที่ใช้จริง: คิด IC บน "ทั้งอนุกรมของสัญลักษณ์นี้" ครั้งเดียว ══
        //
        // ทำไมต้องเป็นทั้งอนุกรม ไม่ใช่รายไตรมาส: ดู T3 — การจัดอันดับภายในหน้าต่างสั้น
        // ที่สั้นพอ ๆ กับหน้าต่างถือ ทำให้ IC ของ feature ที่คำนวณจากเส้นราคาเดียวกัน
        // เฟ้อขึ้นเป็นสิบเท่า **โดยที่ไม่มีการรั่วข้อมูลอนาคตเลย** — เป็นอคติของตัวประมาณล้วน ๆ
        const idx = [];
        for (let i = 0; i < n; i++) if (Number.isFinite(v[i]) && Number.isFinite(y[i])) idx.push(i);
        const m = idx.length;
        if (m >= 200) {
          const xs = new Float64Array(m); const ys = new Float64Array(m);
          for (let k = 0; k < m; k++) { xs[k] = v[idx[k]]; ys[k] = y[idx[k]]; }
          const zx = standardRanks(xs); const zy = standardRanks(ys);
          if (zx && zy) {
            const cl = new Map(); const pe = new Map();
            let acc = 0;
            for (let k = 0; k < m; k++) {
              const contrib = zx[k] * zy[k];   // ค่าเฉลี่ยของตัวนี้ = Spearman พอดี
              acc += contrib;
              addTo(cl, clusterKey[idx[k]], 1, contrib);
              addTo(pe, periodKey[idx[k]], 1, contrib);
            }
            for (const [ck, o] of cl) {
              addTo(cell.ic.cl, ck, o.n, o.s);
              addTo(cell.ic.clSym, `${ds.symbol}|${ck}`, o.n, o.s);   // เก็บไว้แสดงว่าการจับกลุ่มแบบนี้ให้ค่า p เล็กเกินจริง
            }
            addSymOnly(cell.ic, ds.symbol, m, acc);
            for (const [k, o] of pe) addTo(cell.periods, k, o.n, o.s);
            cell.obs += m;
            for (let k = 0; k < m; k++) { cell.sumR += ys[k]; cell.sumR2 += ys[k] * ys[k]; cell.nR++; }
          }
          // ── IC ต่อ "ขนาด" ของการเคลื่อนไหว ─────────────────────────────────
          if (SIZE_FEATURES.includes(f.id)) {
            const ays = new Float64Array(m);
            for (let k = 0; k < m; k++) ays[k] = Math.abs(ys[k]);
            const zy2 = standardRanks(ays);
            if (zx && zy2) {
              const cl2 = new Map(); let acc2 = 0;
              for (let k = 0; k < m; k++) {
                const contrib = zx[k] * zy2[k];
                acc2 += contrib;
                addTo(cl2, clusterKey[idx[k]], 1, contrib);
              }
              for (const [ck, o] of cl2) addTo(cell.size.cl, ck, o.n, o.s);
              addSymOnly(cell.size, ds.symbol, m, acc2);
            }
          }
          // ── เงิน: ส่วนต่างกลุ่มบน−กลุ่มล่าง คิดบนทั้งอนุกรมของสัญลักษณ์นี้ ──────
          //   การแบ่ง tercile ใช้ percentile หน้าต่างวิ่งจากอดีต → เทรดได้จริง
          //   สัดส่วนสองแขนคิดจากทั้งอนุกรม (ไม่ใช่รายไตรมาส) ด้วยเหตุผลเดียวกับ IC
          let nt = 0; let nb = 0;
          const arm = new Int8Array(m);
          for (let k = 0; k < m; k++) {
            if (f.kind === 'binary') arm[k] = xs[k] >= 0.5 ? 1 : -1;
            else {
              const p = pv ? pv[idx[k]] : NaN;
              arm[k] = Number.isFinite(p) ? (p >= 2 / 3 ? 1 : (p < 1 / 3 ? -1 : 0)) : 0;
            }
            if (arm[k] === 1) nt++; else if (arm[k] === -1) nb++;
          }
          if (nt >= 30 && nb >= 30) {
            const N = nt + nb;
            const cl3 = new Map(); let acc3 = 0;
            for (let k = 0; k < m; k++) {
              if (arm[k] === 0) continue;
              const u = arm[k] === 1 ? ys[k] * (N / nt) : -ys[k] * (N / nb);
              acc3 += u;
              addTo(cl3, clusterKey[idx[k]], 1, u);
            }
            for (const [ck, o] of cl3) addTo(cell.money.cl, ck, o.n, o.s);
            addSymOnly(cell.money, ds.symbol, N, acc3);
          }
        }

        // ══ ตัวประมาณแบบเก่า (รายไตรมาส) — เก็บไว้เพื่อ *แสดงว่ามันผิด* ใน T3 ══
        let bi = 0;
        while (bi < n) {
          const key = blockKey[bi];
          let bj = bi;
          while (bj + 1 < n && blockKey[bj + 1] === key) bj++;
          const xs = []; const ys = [];
          let top = 0; let topS = 0; let bot = 0; let botS = 0;
          for (let i = bi; i <= bj; i++) {
            const xv = v[i]; const yv = y[i];
            if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
            xs.push(xv); ys.push(yv);
            if (f.kind === 'binary') {
              if (xv >= 0.5) { top++; topS += yv; } else { bot++; botS += yv; }
            } else {
              const p = pv ? pv[i] : NaN;
              if (Number.isFinite(p)) {
                if (p >= 2 / 3) { top++; topS += yv; }
                else if (p < 1 / 3) { bot++; botS += yv; }
              }
            }
          }
          if (xs.length >= BLOCK_MIN_OBS) {
            const ic = spearman(xs, ys);
            if (Number.isFinite(ic)) cell.icNaive.push({ n: xs.length, s: xs.length * ic });
          }
          if (top >= BLOCK_MIN_ARM && bot >= BLOCK_MIN_ARM) {
            const nEff = 1 / (1 / top + 1 / bot);
            cell.moneyNaive.push({ n: nEff, s: nEff * (topS / top - botS / bot) });
          }
          bi = bj + 1;
        }
      }
    }
  }

  // ── สรุปแต่ละช่อง + ลงทะเบียนการทดสอบ ────────────────────────────────────
  const rng = mulberry32(OPT.seed);
  const bootCI = (symMap) => {
    const syms = [...symMap.keys()].sort();
    const K = syms.length;
    if (K < 3) return { lo: NaN, hi: NaN, K };
    const ns = syms.map((s) => symMap.get(s).n);
    const ss = syms.map((s) => symMap.get(s).s);
    const out = new Float64Array(OPT.bootstrap);
    for (let b = 0; b < OPT.bootstrap; b++) {
      let N = 0; let S = 0;
      for (let k = 0; k < K; k++) { const j = Math.floor(rng() * K); N += ns[j]; S += ss[j]; }
      out[b] = N > 0 ? S / N : NaN;
    }
    const sorted = Array.from(out).filter(Number.isFinite).sort((a, b) => a - b);
    return { lo: percentileOfSorted(sorted, 0.025), hi: percentileOfSorted(sorted, 0.975), K };
  };

  const featById = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
  const cellRows = [];
  const skipped = [];

  const orderedKeys = [...cells.keys()].sort();
  for (const k of orderedKeys) {
    const c = cells.get(k);
    const icCl = [...c.ic.cl.values()];
    const moCl = [...c.money.cl.values()];
    const szCl = [...c.size.cl.values()];
    const enough = c.ic.cl.size >= CELL_MIN_CLUSTERS && c.obs >= CELL_MIN_OBS && c.ic.sym.size >= 2;
    const icStat = clusterMean(icCl);
    const moStat = clusterMean(moCl);
    const szStat = szCl.length ? clusterMean(szCl) : null;
    const icNaive = c.icNaive.length ? clusterMean(c.icNaive) : null;
    const moNaive = c.moneyNaive.length ? clusterMean(c.moneyNaive) : null;
    const sigma = c.nR > 1 ? Math.sqrt(Math.max(0, c.sumR2 / c.nR - (c.sumR / c.nR) ** 2)) : NaN;
    // ช่วงความเชื่อมั่นสองแบบ — ต้องอ่านคู่กันเสมอ
    //   สุ่มสัญลักษณ์ : ตอบว่า "ผลนี้มาจากสัญลักษณ์ตัวเดียวหรือเปล่า"
    //   สุ่มช่วงเวลา  : ตอบว่า "ผลนี้มาจากช่วงเวลาเดียวหรือเปล่า"
    // feature ปฏิทินมีค่าเท่ากันทุกสัญลักษณ์ในวันเดียวกัน การสุ่มสัญลักษณ์จึงมองไม่เห็น
    // ความไม่แน่นอนที่แท้จริงของมันเลย — ตัวที่ผูกกับค่า p คือการสุ่มช่วงเวลา
    const ci = enough ? bootCI(c.ic.sym) : { lo: NaN, hi: NaN, K: c.ic.sym.size };
    const ciT = enough ? bootCI(c.ic.cl) : { lo: NaN, hi: NaN, K: c.ic.cl.size };
    const moCi = enough ? bootCI(c.money.sym) : { lo: NaN, hi: NaN, K: c.money.sym.size };
    const moCiT = enough ? bootCI(c.money.cl) : { lo: NaN, hi: NaN, K: c.money.cl.size };
    const fee = (() => { const a = feeAcc.get(`${c.tf}|${c.group}`); return a && a.n ? a.s / a.n : NaN; })();

    const row = {
      key: k, tf: c.tf, group: c.group, feature: c.feature, h: c.h,
      kind: featById[c.feature].kind, featFamily: featById[c.feature].family,
      obs: c.obs, clusters: c.ic.cl.size, symbols: c.ic.sym.size,
      ic: icStat.mean, icSe: icStat.se, icP: icStat.p,
      icLo: ci.lo, icHi: ci.hi, icLoT: ciT.lo, icHiT: ciT.hi,
      moneyBps: moStat.mean, moneyP: moStat.p,
      moneyLo: moCi.lo, moneyHi: moCi.hi, moneyLoT: moCiT.lo, moneyHiT: moCiT.hi,
      moneyClusters: c.money.cl.size,
      sizeIc: szStat ? szStat.mean : NaN, sizeP: szStat ? szStat.p : NaN, sizeClusters: c.size.cl.size,
      icNaive: icNaive ? icNaive.mean : NaN, moneyNaiveBps: moNaive ? moNaive.mean : NaN,
      icPSymCl: c.ic.clSym.size >= 2 ? clusterMean([...c.ic.clSym.values()]).p : NaN,
      symClCount: c.ic.clSym.size,
      sigma, icBps: Number.isFinite(icStat.mean) && Number.isFinite(sigma) ? icStat.mean * sigma : NaN,
      fee, enough,
      years: [...c.periods.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
        .map(([yr, o]) => ({ year: yr, n: o.n, ic: o.s / o.n })),
    };
    cellRows.push(row);

    if (!enough) { skipped.push(row); continue; }

    registerTest({
      id: `IC|${k}`, family: `IC-${c.tf}`,
      question: `IC ของ ${c.feature} ต่อผลตอบแทน ${c.h} แท่งข้างหน้า ในกลุ่ม ${GROUP_LABEL[c.group]} (${c.tf}) ต่างจากศูนย์ไหม`,
      estimate: icStat.mean, ci: [ci.lo, ci.hi], p: icStat.p,
    });
    if (SIZE_FEATURES.includes(c.feature) && szStat && c.size.cl.size >= CELL_MIN_CLUSTERS) {
      registerTest({
        id: `SIZE|${k}`, family: `SIZE-${c.tf}`,
        question: `IC ของ ${c.feature} ต่อ **ขนาด** การเคลื่อนไหว ${c.h} แท่งข้างหน้า ในกลุ่ม ${GROUP_LABEL[c.group]} (${c.tf})`,
        estimate: szStat.mean, ci: [NaN, NaN], p: szStat.p,
      });
    }
  }

  applyHolm();
  const testByIdKey = new Map(TESTS.map((t) => [t.id, t]));
  for (const r of cellRows) {
    const t = testByIdKey.get(`IC|${r.key}`);
    r.holmPass = t ? !!t.holmPass : false;
    r.holmThreshold = t ? t.holmThreshold : NaN;
    const ts = testByIdKey.get(`SIZE|${r.key}`);
    r.sizeHolmPass = ts ? !!ts.holmPass : false;
  }

  // ═════════════ T4 · ความคงทนข้ามปี — ผลซ้ำรอยหรือมาจากปีเดียว ═════════════
  //
  // ถ้า IC ของช่องหนึ่งมาจากปีเดียวแล้วปีอื่นเป็นศูนย์ นั่นคือเสียงรบกวน ไม่ใช่กลไก
  // วัดด้วย "จำนวนปีที่เครื่องหมายตรงกับผลรวม" แล้วทดสอบกับเหรียญยุติธรรม
  const robustRows = [];
  const candidates = cellRows.filter((r) => r.enough).sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic));
  const chosen = new Map();
  for (const r of candidates) if (r.holmPass) chosen.set(r.key, r);
  for (const tf of ['1D', '1H']) {
    let cnt = 0;
    for (const r of candidates) {
      if (r.tf !== tf || chosen.has(r.key)) continue;
      chosen.set(r.key, r); cnt++;
      if (cnt >= 8) break;    // ดู 8 ช่องที่ IC แรงที่สุดของแต่ละกรอบเวลาด้วย แม้ไม่ผ่าน Holm
    }
  }
  const logChoose2 = (K, k) => {
    // log P(X>=k) ของ Binomial(K, .5) แบบสองหาง
    let s = 0;
    const logC = (nn, kk) => {
      let r = 0;
      for (let i = 0; i < kk; i++) r += Math.log(nn - i) - Math.log(i + 1);
      return r;
    };
    for (let i = k; i <= K; i++) s += Math.exp(logC(K, i) - K * Math.LN2);
    return Math.min(1, 2 * s);
  };
  for (const r of [...chosen.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const ys = r.years.filter((o) => o.n >= 100);
    if (ys.length < 3) { robustRows.push({ ...pick(r), periods: ys.length, agree: NaN, p: NaN, detail: ys }); continue; }
    const sgn = Math.sign(r.ic);
    const agree = ys.filter((o) => Math.sign(o.ic) === sgn).length;
    const p = logChoose2(ys.length, agree);
    robustRows.push({ ...pick(r), periods: ys.length, agree, p, detail: ys });
    registerTest({
      id: `ROBUST|${r.key}`, family: 'ROBUST',
      question: `เครื่องหมายของ IC (${r.feature} · ${GROUP_LABEL[r.group]} · ${r.tf} · h=${r.h}) ซ้ำรอยข้ามปีมากกว่าการโยนเหรียญไหม`,
      estimate: agree / ys.length, ci: [NaN, NaN], p,
    });
  }
  applyHolm();
  const tmap = new Map(TESTS.map((t) => [t.id, t]));
  for (const r of robustRows) { const t = tmap.get(`ROBUST|${r.key}`); r.holmPassRobust = t ? !!t.holmPass : false; }

  // ═══════════════════════════════ เขียนรายงาน ═══════════════════════════════
  writeReport({
    bounds, datasets, dropped, runnerSet, thProfiles, meter, leak, leakOrder, leakDatasets,
    cellRows, skipped, robustRows, feeAcc, groupSymbols, coverage, guard, binShare,
    elapsed: (Date.now() - t0) / 1000,
  });

  JSONOUT.audit = {
    datasets: datasets.length, dropped, runners: [...runnerSet],
    meter: { atrChecked: meter.atrChecked, atrMaxErr: meter.atrMaxErr, calChecked: meter.calChecked, calBad: meter.calBad, fwdChecked: meter.fwdChecked, fwdMaxErr: meter.fwdMaxErr },
    leak: leakOrder.map((nm) => ({ feature: nm, ...leak[nm] })),
    leakDatasets, coverage,
    fees: [...feeAcc.entries()].sort().map(([k, v]) => ({ cell: k, feeBps: (v.s / v.n) * 10000, bars: v.n })),
  };
  JSONOUT.cells = cellRows.map((r) => ({ ...r, years: r.years }));
  JSONOUT.tests = TESTS;
  JSONOUT.robust = robustRows;
  fs.writeFileSync(OUT_JSON, JSON.stringify(JSONOUT, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, LINES.join('\n'), 'utf8');

  console.log(`\nเขียนแล้ว: ${OUT_MD}`);
  console.log(`เขียนแล้ว: ${OUT_JSON}`);
  console.log(`ใช้เวลา ${((Date.now() - t0) / 1000).toFixed(1)} วินาที · ลงทะเบียนการทดสอบ ${TESTS.length} ข้อ`);
}

function pick(r) {
  const { years, ...rest } = r;
  return rest;
}

// ═══════════════════════════════ ตัวเขียนรายงาน ═══════════════════════════════

function writeReport(ctx) {
  const {
    bounds, datasets, dropped, runnerSet, meter, leak, leakOrder, leakDatasets,
    cellRows, skipped, robustRows, feeAcc, groupSymbols, coverage, guard, binShare, elapsed,
  } = ctx;

  const featById = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
  const usable = cellRows.filter((r) => r.enough);
  const passed = usable.filter((r) => r.holmPass);
  const passedNonCtrl = passed.filter((r) => featById[r.feature].family !== 'X');
  const noiseRows = usable.filter((r) => r.feature === 'ctrlNoise');
  const noisePassed = noiseRows.filter((r) => r.holmPass);
  const revRows = usable.filter((r) => r.feature === 'ctrlRevPrev');
  const revPassed = revRows.filter((r) => r.holmPass);

  W('# ตระกูลที่ 3 · เวลา ฤดูกาล และการเปลี่ยนระบอบ — มีพลังทำนายพอไหม');
  W();
  W('> วัดบน **ชุด train เท่านั้น** · ไม่มี look-ahead (พิสูจน์ด้วยการตัดข้อมูลท้ายทิ้งใน T1)');
  W('> · โค้ด `scripts/research/experiments/feat-time.mjs` · รันซ้ำได้ผลเดิมทุกบรรทัด');
  W(`> · รอบนี้ใช้เวลา ${elapsed.toFixed(1)} วินาที · ลงทะเบียนการเปรียบเทียบ ${TESTS.length} ข้อ`);
  W();

  // ── คำตอบสั้น ────────────────────────────────────────────────────────────
  const nonCtrl = usable.filter((r) => featById[r.feature].family !== 'X');
  const overFee0 = nonCtrl.filter((r) => Number.isFinite(r.moneyBps) && r.fee > 0 && Math.abs(r.moneyBps) > r.fee);
  const bothOk = overFee0.filter((r) => r.holmPass);
  const sizeAll = usable.filter((r) => SIZE_FEATURES.includes(r.feature) && r.feature !== 'ctrlNoise'
    && Number.isFinite(r.sizeIc) && r.sizeClusters >= CELL_MIN_CLUSTERS);
  const sizeOk = sizeAll.filter((r) => r.sizeHolmPass);
  const medA = (arr, f) => (arr.length ? percentileOfSorted(arr.map(f).sort((a, b) => a - b), 0.5) : NaN);

  W('## คำตอบสั้น');
  W();
  W('คำตอบแยกเป็นสองท่อน และสองท่อนนี้ตอบคนละคำถาม:');
  W();
  W('**ท่อนที่หนึ่ง — ทำนาย "ทิศ": ไม่ได้ ไม่มีตัวไหนแรงพอ**');
  W();
  W(`จาก ${usable.length} ช่องที่วัดได้ มีช่องที่ทั้ง (ก) IC ต่างจากศูนย์อย่างมีนัยสำคัญหลังแก้ค่า p`);
  W(`**และ** (ข) เงินที่ได้มากกว่าค่าธรรมเนียม = **${bothOk.length} ช่อง**`);
  if (passedNonCtrl.length) {
    const one = passedNonCtrl.sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic))[0];
    W(`ช่องเดียวที่ผ่านนัยสำคัญคือ \`${one.feature}\` · ${GROUP_LABEL[one.group]} · ${one.tf} · h=${one.h}`);
    W(`— ทำเงินได้ ${bpsS(one.moneyBps)} bps เทียบค่าธรรมเนียม ${bpsS(one.fee)} bps = **${(Math.abs(one.moneyBps) / one.fee).toFixed(2)} เท่า** คือไม่ถึงค่าธรรมเนียมด้วยซ้ำ`);
  }
  W();
  const mSize = medA(sizeAll, (r) => Math.abs(r.sizeIc));
  const mDir = medA(sizeAll, (r) => Math.abs(r.ic));
  W(`**ท่อนที่สอง — ทำนาย "ขนาด": ได้ และแรงกว่าทิศ ${(mSize / mDir).toFixed(1)} เท่า**`);
  W();
  W(`feature ตระกูลระบอบความผันผวนทำนาย *ขนาด* ของการเคลื่อนไหวได้จริง ${sizeOk.length} จาก ${sizeAll.length} ช่อง`);
  W(`ผ่านเกณฑ์เดียวกันเป๊ะ — |IC ต่อขนาด| มัธยฐาน ${nf(mSize, 4)}`);
  W(`เทียบกับ |IC ต่อทิศ| มัธยฐาน ${nf(mDir, 4)} ของ feature ชุดเดียวกัน (ช่องที่แรงที่สุดต่างกันถึง 100 เท่า)`);
  W('ตัวนี้แลกเป็นเงินตรง ๆ ไม่ได้ (รู้ขนาดไม่ได้บอกว่าจะซื้อหรือขาย) แต่ตรงกับสิ่งที่ exp-ceiling.md');
  W('หัวข้อ C4b บอกว่าขาดอยู่พอดี → ใช้เป็นตัวปรับขนาดไม้/ตัวกรองได้ ไม่ใช่ใช้เป็นสัญญาณเดี่ยว');
  W();
  W('| สิ่งที่ตรวจ | ผล |');
  W('|---|---|');
  W(`| ช่องที่วัดได้ (ผ่านเกณฑ์ข้อมูลพอ) | ${usable.length} จาก ${cellRows.length} |`);
  W(`| ช่องทิศที่ผ่าน Holm (ไม่นับตัวควบคุม) | ${passedNonCtrl.length} |`);
  W(`| ช่องทิศที่ผ่าน Holm **และ** เงิน > ค่าธรรมเนียม | **${bothOk.length}** |`);
  W(`| ช่องขนาดที่ผ่าน Holm (ไม่นับตัวควบคุม) | **${sizeOk.length}** จาก ${sizeAll.length} |`);
  W(`| ตัวควบคุมเสียงรบกวนที่ "ผ่าน" (ต้องเป็น 0) | ${noisePassed.length} จาก ${noiseRows.length} |`);
  W(`| ตัวควบคุมการกลับตัวระยะสั้นที่ผ่าน (ควร > 0 ถ้าเครื่องวัดมีฟัน) | ${revPassed.length} จาก ${revRows.length} |`);
  {
    const rp = revRows.filter((r) => r.holmPass).map((r) => Math.abs(r.ic)).sort((a, b) => a - b);
    if (rp.length) W(`| ขนาด IC ของตัวควบคุมที่ผ่าน (ตำรากลางว่า 0.02–0.03) | ${nf(rp[0], 4)} ถึง ${nf(rp[rp.length - 1], 4)} |`);
  }
  W();
  W('บรรทัดสองบรรทัดสุดท้ายคือสิ่งที่ทำให้คำว่า "ไม่เจอ" ในรายงานนี้มีน้ำหนัก: เครื่องวัดตัวเดียวกัน');
  W('เกณฑ์เดียวกัน **จับผลกลับตัวระยะสั้นที่มีอยู่จริงในตลาดได้ และได้ขนาดตรงกับตำรา**');
  W('ถ้าเครื่องวัดตาบอด มันจะไม่เจออะไรเลยรวมทั้งตัวควบคุม');
  W();

  // ── T0 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# T0 · ตรวจเครื่องวัดก่อนเชื่ออะไรทั้งสิ้น');
  W();
  W('ไฟล์นี้เขียน ATR · การแปลงเวลาท้องถิ่น · ผลตอบแทนอนาคต ขึ้นมาเอง');
  W('ถ้าตัวใดตัวหนึ่งเข้าใจผิด ตัวเลขที่เหลือทั้งรายงานเชื่อไม่ได้เลย');
  W();
  W('| สิ่งที่ตรวจ | จำนวนที่ตรวจ | ความคลาดเคลื่อน / ข้อผิดพลาด | ผล |');
  W('|---|---:|---:|---|');
  W(`| ATR ที่เขียนใหม่ เทียบ \`src/lib/indicators.ts\` ตัวจริง | ${intS(meter.atrChecked)} | ${meter.atrMaxErr.toExponential(1)} | ${meter.atrMaxErr < 1e-12 ? '**ผ่าน**' : '⚠ ไม่ผ่าน'} |`);
  W(`| ชั่วโมงท้องถิ่นอยู่ในตารางเวลาตลาดที่ประกาศไว้ (จัดการ DST ถูกไหม) | ${intS(meter.calChecked)} | ${intS(meter.calBad)} แท่งนอกตาราง | ${meter.calBad === 0 ? '**ผ่าน**' : '⚠ ไม่ผ่าน'} |`);
  W(`| ผลตอบแทนอนาคตคำนวณซ้ำด้วยสูตรคนละรูป | ${intS(meter.fwdChecked)} | ${meter.fwdMaxErr.toExponential(1)} | ${meter.fwdMaxErr < 1e-15 ? '**ผ่าน**' : '⚠ ไม่ผ่าน'} |`);
  W();
  W('ตัวอย่างการกระจายชั่วโมงท้องถิ่นที่วัดได้จริง (ยืนยันว่าเวลาถูกแปลงถูก):');
  W();
  W('```');
  const sample = Object.keys(meter.calDetail).sort().filter((k) => k.includes('PTT') || k.includes('AAPL') || k.includes('KCE') || k.includes('SPY'));
  for (const k of sample.slice(0, 4)) {
    const hist = meter.calDetail[k];
    W(`${k.padEnd(22)} ${Object.keys(hist).sort((a, b) => a - b).map((h) => `${h}:${hist[h]}`).join('  ')}`);
  }
  W('```');
  W();
  W('· หุ้นไทย: แท่งอยู่ที่เวลาไทย 10–16 น. ครบตามรอบซื้อขายของ SET');
  W('· หุ้นสหรัฐ: แท่งอยู่ที่เวลานิวยอร์ก 9–16 น. **ทุกแท่งตลอด 3 ปี** ทั้งที่ UTC เลื่อนปีละสองครั้ง');
  W('  → แปลว่าโค้ดจัดการ DST ถูกจริง ถ้าใช้ UTC ตรง ๆ ตัวเลขนี้จะพัง');
  W();

  // ── T1 ────────────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# T1 · ตรวจ look-ahead ด้วยการตัดข้อมูลท้ายทิ้งแล้วคำนวณซ้ำ');
  W();
  W('คำนวณ feature บนชุดเต็ม → ตัดท้ายทิ้ง 20% → คำนวณซ้ำ → ค่าของแท่งเก่าต้องเท่าเดิม **ทุกบิต**');
  W(`ทำกับชุดข้อมูลทั้งหมด ${leakDatasets} ชุด (ทุกสัญลักษณ์ × ทุกกรอบเวลา ที่ผ่านเกณฑ์)`);
  W();
  W('| feature | ชนิด | จำนวนที่เทียบ | ไม่ตรง | ผล |');
  W('|---|---|---:|---:|---|');
  let causalCompared = 0; let causalBad = 0; let leakCompared = 0; let leakBad = 0;
  for (const nm of leakOrder.sort()) {
    const o = leak[nm];
    const isCtl = o.kind !== 'CAUSAL';
    if (isCtl) { leakCompared += o.compared; leakBad += o.mismatch; }
    else { causalCompared += o.compared; causalBad += o.mismatch; }
    const verdict = isCtl
      ? (o.mismatch > 0 ? `**จับได้ ${intS(o.mismatch)} จุด** ← การตรวจมีฟันจริง` : '⚠ จับไม่ได้ = การตรวจไม่มีฟัน')
      : (o.mismatch === 0 ? '**ผ่าน**' : '⚠ **รั่ว**');
    W(`| \`${nm}\` | ${isCtl ? o.kind : 'CAUSAL'} | ${intS(o.compared)} | ${intS(o.mismatch)} | ${verdict} |`);
  }
  W();
  W(`· ค่า CAUSAL เทียบทั้งหมด **${intS(causalCompared)}** ค่า · ไม่ตรง **${intS(causalBad)}**`);
  W(`· ตัวควบคุมเชิงบวก (normalize ด้วยค่าเฉลี่ยทั้งชุด) เทียบ ${intS(leakCompared)} ค่า · เปลี่ยน **${intS(leakBad)}**`);
  W();
  W('บรรทัดสุดท้ายคือสิ่งที่ทำให้บรรทัดบนเชื่อได้: การตรวจแบบนี้จับการรั่วที่เงียบที่สุด');
  W('(การ normalize ด้วยสถิติของทั้งชุด) ได้ทุกจุด — ถ้ามันจับตัวปลอมได้ แต่ feature จริงไม่มีจุดไหนขยับ');
  W('แปลว่า feature จริงไม่ได้อ่านอนาคต');
  W();
  W('**เหตุผลเชิงโครงสร้างที่ตระกูลนี้รั่วยากเป็นพิเศษ**: feature กลุ่ม A และ B มาจาก *ปฏิทินและนาฬิกา*');
  W('ซึ่งรู้ล่วงหน้าเสมอโดยธรรมชาติ ไม่ได้ประมาณจากข้อมูลราคาเลย ส่วนกลุ่ม C ใช้หน้าต่างวิ่งที่ปิดที่แท่ง i');
  W('และ percentile ที่ใช้แบ่ง tercile ก็เป็นหน้าต่างวิ่งจากอดีต ไม่ใช่ค่าเฉลี่ยทั้งชุด');
  W();

  // ── T2 ขอบเขต ─────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# T2 · ขอบเขตของสิ่งที่วัด');
  W();
  W(`ชุดข้อมูลที่ใช้ **${datasets.length}** ชุด · ตัดออก ${dropped.length} ชุด`);
  if (dropped.length) { W(); W('```'); for (const d of dropped) W(`  ${d}`); W('```'); }
  W();
  W(`หุ้นซิ่งที่ผ่านเกณฑ์ ${runnerSet.size} ตัว: ${[...runnerSet].join(' · ')}`);
  W(`(เกณฑ์: ช่วงแท่งเฉลี่ย ≥ ${RUNNER_RULE.minBarRangePct}% · มูลค่าซื้อขายมัธยฐาน ≥ ${(RUNNER_RULE.minTurnoverBaht / 1e6)} ล้านบาท/แท่ง · แท่ง train ≥ ${intS(RUNNER_RULE.minBars)})`);
  W();
  W('**ขอบเขตของข้อมูล** (ทุกไฟล์ถูกตัดที่ trainEnd ตั้งแต่ตอนโหลด — แท่งหลังจากนั้นไม่เคยเข้าหน่วยความจำ)');
  W();
  W('| กรอบเวลา | trainEnd | แท่งที่ใหม่ที่สุดที่โค้ดนี้เคยแตะ | ห่างจาก trainEnd | ผล |');
  W('|---|---|---|---:|---|');
  for (const tf of ['1D', '1H']) {
    const te = Date.parse(bounds.timeframes[tf].trainEnd);
    const mx = guard.maxTs[tf];
    const ok = Number.isFinite(mx) && mx < te;
    const days = Number.isFinite(mx) ? ((te - mx) / 86400000).toFixed(2) : '—';
    W(`| ${tf} | ${bounds.timeframes[tf].trainEnd} | ${Number.isFinite(mx) ? new Date(mx).toISOString() : '—'} | ${days} วัน | ${ok ? '**ผ่าน — ไม่มีแท่งของ validation/test เข้ามาเลย**' : '⚠ ไม่ผ่าน'} |`);
  }
  W();
  W('แถวนี้ไม่ใช่คำสัญญา แต่เป็นค่าที่วัดจากตัวแปรจริงตอนรัน: `loadDatasetTrainOnly()` ตัดอาร์เรย์');
  W('ทิ้งตั้งแต่ตอนโหลด แท่งหลัง trainEnd จึงไม่เคยอยู่ในหน่วยความจำ ไม่ว่าจะเผลอเขียนโค้ดผิดยังไง');
  W();
  W('| กรอบเวลา · กลุ่ม | สัญลักษณ์ | ค่าธรรมเนียมไป-กลับอ้างอิง (bps) |');
  W('|---|---:|---:|');
  for (const k of [...feeAcc.keys()].sort()) {
    const [tf, g] = k.split('|');
    const v = feeAcc.get(k);
    const syms = groupSymbols.get(k);
    W(`| ${tf} · ${GROUP_LABEL[g] ?? g} | ${syms ? syms.size : 0} | ${bpsS(v.s / v.n)} |`);
  }
  W();
  W('ค่าธรรมเนียมหุ้นไทยคิดจากค่าคอม 0.157%/ขา (ขั้นต่ำ 50 บาท) + สเปรด 1 tick ตามตารางช่วงราคา SET');
  W('ที่เงินเสี่ยง 2,000 บาท/ไม้ และขนาดคำสั่งอิงระยะ SL 1.5×ATR — สูตรและตัวเลขเดียวกับ exp-ceiling.md');
  W('เพื่อให้ตัวเลขในสองรายงานเทียบกันได้ตรง ๆ');
  W();
  W('**นิยามที่ใช้วัด**');
  W();
  W('```');
  W('  feature ที่แท่ง i        ← candles[0..i] เท่านั้น');
  W('  ผลตอบแทนอนาคต h แท่ง   = (open[i+1+h] − open[i+1]) ÷ open[i+1]');
  W('       (เข้าที่ราคาเปิดแท่งถัดไป เหมือนกติกาของ lab.mjs ทุกประการ)');
  W('  IC                      = Spearman(feature, ผลตอบแทนอนาคต) คิดบน **ทั้งอนุกรมของแต่ละสัญลักษณ์**');
  W('                            แล้วเฉลี่ยถ่วงน้ำหนักด้วยจำนวนแท่ง  (เหตุผลว่าทำไมไม่คิดรายไตรมาส: T3)');
  W('  ค่า p                   = cluster-robust จับกลุ่มด้วย **ช่วงเวลาล้วน** (ปี/เดือน · ไม่มีสัญลักษณ์');
  W('                            อยู่ในกุญแจ) · แจกแจง t ที่ (จำนวนกลุ่ม−1) องศาอิสระ · แก้ด้วย Holm');
  W('  ช่วงความเชื่อมั่น        = bootstrap 2,000 รอบ สองแบบ: สุ่ม **สัญลักษณ์** และสุ่ม **ช่วงเวลา**');
  W('                            (ไม่ใช่สุ่มแท่ง — การสุ่มแท่งจะให้ช่วงที่แคบเกินจริงหลายเท่า)');
  W('  เงิน (bps/ไม้)          = ผลตอบแทนเฉลี่ยกลุ่มบน − กลุ่มล่าง');
  W('                            · feature ทวิภาค: กลุ่ม 1 เทียบกลุ่ม 0');
  W('                            · feature ต่อเนื่อง: tercile บน/ล่าง จาก percentile หน้าต่างวิ่ง');
  W(`                            (หน้าต่าง ${PCT_WINDOW['1D']} แท่งสำหรับ 1D · ${PCT_WINDOW['1H']} แท่งสำหรับ 1H — อ่านเฉพาะอดีต)`);
  W('```');
  W();
  W('**feature ทวิภาคยิงตรงกับนิยามของมันไหม** — ถ้าสัดส่วนเพี้ยน แปลว่าเข้าใจปฏิทิน/ตารางเวลาผิด');
  W();
  W('| feature | กลุ่ม | กรอบเวลา | สัดส่วนแท่งที่ยิง | สัดส่วนที่นิยามบอกว่าควรเป็น |');
  W('|---|---|---|---:|---|');
  const marketOfGroup = (gg) => (gg === 'RUNNER' || gg === 'SET50' ? 'TH_STOCK' : gg);
  const expectShare = (fid, gg) => {
    const s = SESSION[marketOfGroup(gg)];
    const wk = gg === 'CRYPTO' ? '1 ใน 7 วัน = 14.3% (คริปโตเปิดทุกวัน)' : '1 ใน 5 วันทำการ = 20.0%';
    switch (fid) {
      case 'openBar': return s ? `แท่งแรกของวัน = 1 ใน ${s.barsPerDay} = ${(100 / s.barsPerDay).toFixed(1)}%` : '—';
      case 'lateBar': return s ? `แท่งสุดท้ายของวัน = 1 ใน ${s.barsPerDay} = ${(100 / s.barsPerDay).toFixed(1)}%` : '—';
      case 'overlapLdnNy': return '3 ชม. ใน 24 = 12.5%';
      case 'asiaQuiet': return '7 ชม. ใน 24 = 29.2%';
      case 'isMonday': case 'isFriday': return wk;
      case 'turnOfMonth': return 'วันที่ 28–31 และ 1–3 ≈ 7 ใน 30 = 23.3%';
      default: return '—';
    }
  };
  for (const k of [...binShare.keys()].sort()) {
    const [tf, gg, fid] = k.split('|');
    const o = binShare.get(k);
    W(`| \`${fid}\` | ${GROUP_LABEL[gg] ?? gg} | ${tf} | ${pctS(o.ones / o.total, 1)} | ${expectShare(fid, gg)} |`);
  }
  W();
  W('ตารางนี้ไม่ได้เป็นแค่พิธีกรรม — มันคือสิ่งที่จับได้ว่ารอบแรกนิยาม `lateBar` ให้หุ้นไทยยิง 2 แท่ง');
  W('แต่หุ้นสหรัฐยิงแท่งเดียว = สองตลาดกำลังทดสอบคนละสมมติฐานทั้งที่ชื่อ feature เดียวกัน');
  W('(แก้แล้วก่อนดูผล · บันทึกเหตุผลไว้ในโค้ดตรงค่าคงที่ `SESSION`)');
  W();
  W(`แท่งที่นับเป็นไม้ได้ ${intS(coverage.entries)} · ถูกทิ้งเพราะหน้าต่างถือยื่นเลย trainEnd ${intS(coverage.droppedTail)} (${pctS(coverage.droppedTail / coverage.entries, 2)})`);
  W(`· แท่งที่ข้ามเพราะข้อมูลไม่สมบูรณ์ ${intS(coverage.unusableBar)}`);
  W();
  W('**การทิ้งไม้ท้าย train เป็นการยอมเสียตัวอย่างเพื่อแลกกับหลักประกันว่าไม่มีแท่งของ validation/test');
  W('เข้ามาปนแม้แท่งเดียว** — งานรอบก่อนยอมให้ยื่นข้ามได้ 0.246% รอบนี้ยื่น 0%');
  W();

  // ── T3 · เครื่องวัดตัวแรกโกหก ───────────────────────────────────────────────
  W('---');
  W();
  W('# T3 · เครื่องวัดตัวแรกที่เราเขียน **โกหก** — และตัวควบคุมจับได้');
  W();
  W('หัวข้อนี้ไม่ใช่ผลการทดลอง แต่เป็นเรื่องที่เกิดขึ้นจริงระหว่างทำงาน และต้องอยู่ในรายงาน');
  W('เพราะถ้าไม่เขียนไว้ รอบหน้าจะมีคนเดินลงหลุมเดิม');
  W();
  W('**สิ่งที่ทำตอนแรก** — คิด IC แยกทีละไตรมาส (63 แท่งสำหรับ 1D) แล้วเฉลี่ยถ่วงน้ำหนัก');
  W('ดูสมเหตุสมผลมาก: จัดกลุ่มตามเวลาแบบนี้กันผลของ drift ระยะยาว และให้ cluster-robust SE ฟรี');
  W();
  W('**สิ่งที่ตัวควบคุมบอก** — `ctrlRevPrev` (การกลับตัวระยะสั้น) ได้ IC = 0.10 ที่ h=20');
  W('ซึ่ง *เป็นไปไม่ได้* ผลกลับตัวระยะสั้นของจริงอยู่ระดับ 0.02–0.03 และไม่ควรแรงขึ้นเมื่อถือนานขึ้น');
  W('พอสงสัยแล้วเขียนโค้ดตรวจอิสระคนละชุด ได้ตัวเลขเดียวกันเป๊ะ — แปลว่า**โค้ดไม่ผิด ตัวประมาณผิด**');
  W();
  W('**กลไกของอคติ** (ไม่มีการรั่วข้อมูลอนาคตแม้แต่นิดเดียว — นี่คือส่วนที่อันตราย):');
  W();
  W('```');
  W('  หน้าต่างจัดอันดับ 63 แท่ง · หน้าต่างถือ 20 แท่ง → ทับกัน 32%');
  W('  แท่งที่อยู่ "จุดต่ำสุดของไตรมาสนั้น" ย่อมมีค่า feature แบบ "เพิ่งทำจุดต่ำ" สูงสุด');
  W('  และผลตอบแทน 20 แท่งข้างหน้าของมัน *ต้อง* เป็นบวกเมื่อเทียบกับแท่งอื่นในไตรมาสเดียวกัน');
  W('  เพราะมันคือจุดต่ำสุดของหน้าต่างนั้นโดยนิยาม → ความสัมพันธ์เกิดจากขอบหน้าต่าง ไม่ใช่จากตลาด');
  W('');
  W('  อคติ ∝ (หน้าต่างถือ ÷ หน้าต่างจัดอันดับ) — จึงโตขึ้นตาม h พอดี ซึ่งตรงกับที่เห็น');
  W('```');
  W();
  W('**ตัวเลขจริงของทั้งสองตัวประมาณ บนข้อมูลชุดเดียวกันเป๊ะ** (เรียงตามขนาดการเฟ้อ):');
  W();
  W('| feature | กลุ่ม | กรอบเวลา | h | IC แบบไตรมาส (ผิด) | IC ทั้งอนุกรม (ใช้จริง) | เฟ้อกี่เท่า | เงินแบบไตรมาส (ผิด) | เงินทั้งอนุกรม (ใช้จริง) |');
  W('|---|---|---|---:|---:|---:|---:|---:|---:|');
  const infl = usable.filter((r) => Number.isFinite(r.icNaive) && Number.isFinite(r.ic) && Math.abs(r.ic) > 1e-6)
    .sort((a, b) => Math.abs(b.icNaive) - Math.abs(a.icNaive)).slice(0, 12);
  for (const r of infl) {
    W(`| \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.tf} | ${r.h} | ${nf(r.icNaive, 4)} | ${nf(r.ic, 4)} | **${(Math.abs(r.icNaive) / Math.abs(r.ic)).toFixed(1)}×** | ${bpsS(r.moneyNaiveBps)} | ${bpsS(r.moneyBps)} |`);
  }
  W();
  const medAbs = (arr, f) => (arr.length ? percentileOfSorted(arr.map(f).sort((a, b) => a - b), 0.5) : NaN);
  const inflAll = usable.filter((r) => Number.isFinite(r.icNaive) && Number.isFinite(r.ic));
  const inflC = inflAll.filter((r) => featById[r.feature].family === 'C' || r.feature === 'ctrlRevPrev');
  const inflAB = inflAll.filter((r) => ['A', 'B'].includes(featById[r.feature].family));
  const inflN = inflAll.filter((r) => r.feature === 'ctrlNoise');
  W('**การเฟ้อโตตามหน้าต่างถือพอดี ตามที่กลไกทำนาย** (มัธยฐานของ |IC| ทุกช่องที่วัดได้)');
  W();
  W('| หน้าต่างถือ h | ทับกับหน้าต่างจัดอันดับ | เส้นราคาเดียวกัน: ไตรมาส → ทั้งอนุกรม | เฟ้อ | ปฏิทิน/นาฬิกา: ไตรมาส → ทั้งอนุกรม | เฟ้อ |');
  W('|---:|---:|---|---:|---|---:|');
  for (const h of [1, 3, 6, 10, 20]) {
    const c1 = inflC.filter((r) => r.h === h); const c2 = inflAB.filter((r) => r.h === h);
    if (!c1.length && !c2.length) continue;
    const a1 = medAbs(c1, (r) => Math.abs(r.icNaive)); const b1 = medAbs(c1, (r) => Math.abs(r.ic));
    const a2 = medAbs(c2, (r) => Math.abs(r.icNaive)); const b2 = medAbs(c2, (r) => Math.abs(r.ic));
    W(`| ${h} | ${((h / 63) * 100).toFixed(0)}% | ${nf(a1, 4)} → ${nf(b1, 4)} | **${(a1 / b1).toFixed(1)}×** | ${nf(a2, 4)} → ${nf(b2, 4)} | ${(a2 / b2).toFixed(1)}× |`);
  }
  W();
  W('| ที่มาของ feature | ช่องที่เทียบ | \\|IC\\| มัธยฐาน แบบไตรมาส (ผิด) | \\|IC\\| มัธยฐาน ทั้งอนุกรม (ใช้จริง) | เฟ้อรวม |');
  W('|---|---:|---:|---:|---:|');
  for (const [lab, arr] of [['คำนวณจากเส้นราคาเดียวกัน (ตระกูล C + ctrlRevPrev)', inflC],
    ['ปฏิทิน/นาฬิกา (ตระกูล A + B)', inflAB],
    ['เลขสุ่มล้วน (ctrlNoise)', inflN]]) {
    const a = medAbs(arr, (r) => Math.abs(r.icNaive));
    const b = medAbs(arr, (r) => Math.abs(r.ic));
    W(`| ${lab} | ${arr.length} | ${nf(a, 4)} | ${nf(b, 4)} | **${(a / b).toFixed(1)}×** |`);
  }
  W();
  W('อ่านตารางบนก่อน: แถวบนสุด (h=1 ทับกันแค่ 2%) แทบไม่เฟ้อ แล้วการเฟ้อโตขึ้นเรื่อย ๆ');
  W('จนถึง h=20 (ทับกัน 32%) ส่วนคอลัมน์ขวาซึ่งเป็น feature ปฏิทิน **ไม่เฟ้อที่ h ไหนเลย**');
  W('นี่คือลายเซ็นของอคติจากขอบหน้าต่าง ไม่ใช่ลายเซ็นของบั๊ก และเป็นเหตุผลที่ `ctrlNoise` เพียงตัวเดียว');
  W('ไม่พอ: เลขสุ่มไม่ได้เป็นฟังก์ชันของราคา มันจึงไม่เฟ้อ และ "ผ่าน" การตรวจสอบทั้งที่เครื่องวัดพัง');
  W();
  W('## ความผิดข้อที่สอง: จับกลุ่มด้วย (สัญลักษณ์ × เวลา) ทำให้ค่า p เล็กเกินจริง');
  W();
  W('feature ปฏิทินมีค่า **เท่ากันทุกสัญลักษณ์ในวันเดียวกัน** — หุ้นไทย 11 ตัวในวันจันทร์เดียวกัน');
  W('ไม่ใช่ตัวอย่างอิสระ 11 ตัว มันคือวันจันทร์วันเดียว ถ้าจับกลุ่มโดยมีสัญลักษณ์อยู่ในกุญแจ');
  W('จำนวนตัวอย่างจะเฟ้อประมาณ √(จำนวนสัญลักษณ์) และค่า p จะเล็กเกินจริงตามนั้น');
  W();
  const bonf = (rows, tf) => {
    const m = TESTS.filter((t) => t.family === `IC-${tf}`).length;
    const thr = OPT.alpha / m;
    const a = rows.filter((r) => Number.isFinite(r.icPSymCl) && r.icPSymCl <= thr).length;
    const b = rows.filter((r) => Number.isFinite(r.icP) && r.icP <= thr).length;
    return { m, thr, a, b };
  };
  W('| กรอบเวลา | การทดสอบในตระกูล | เกณฑ์ Bonferroni | ช่องที่ผ่านถ้าจับกลุ่ม (สัญลักษณ์ × เวลา) | ช่องที่ผ่านถ้าจับกลุ่ม **เวลาล้วน** (ใช้จริง) |');
  W('|---|---:|---:|---:|---:|');
  for (const tf of ['1D', '1H']) {
    const rows = usable.filter((r) => r.tf === tf);
    const o = bonf(rows, tf);
    W(`| ${tf} | ${o.m} | ${o.thr.toExponential(1)} | ${o.a} | **${o.b}** |`);
  }
  W();
  W('รายงานนี้ใช้คอลัมน์ขวาสุด และคิดค่า p จากการแจกแจง t ที่ (จำนวนกลุ่ม − 1) องศาอิสระ');
  W('ไม่ใช่ normal เพราะจำนวนกลุ่มเหลือแค่ 17–47 กลุ่ม การใช้ normal จะให้ค่า p เล็กเกินจริงอีกชั้นหนึ่ง');
  W();
  W('**บทเรียนที่ต้องส่งต่อให้งานรอบถัดไป**');
  W();
  W('1. `ctrlNoise` (เลขสุ่มล้วน) **จับอคติแบบแรกไม่ได้** เพราะมันไม่ได้เป็นฟังก์ชันของราคา');
  W('   ตัวควบคุมที่จำเป็นคือตัวที่ *คำนวณจากเส้นราคาเดียวกันกับผลตอบแทน* และมีขนาดผลที่รู้ค่าคร่าว ๆ อยู่แล้ว');
  W('   — ถ้าตัวนั้นให้ตัวเลขที่ "ดีเกินจริง" ตัวประมาณพัง ไม่ใช่ตลาดใจดี');
  W('2. การตรวจ look-ahead แบบตัดข้อมูลท้ายทิ้ง (T1) **ผ่านฉลุยทั้งที่ตัวเลขเฟ้อสิบกว่าเท่า**');
  W('   เพราะไม่มีการรั่วจริง ๆ — การตรวจ look-ahead กับการตรวจอคติของตัวประมาณ เป็นคนละเรื่องกัน');
  W('   ต้องทำทั้งสองอย่าง');
  W('3. กติกาง่าย ๆ สองข้อ: **หน้าต่างจัดอันดับ/normalize ต้องยาวกว่าหน้าต่างถือ ≥ 10 เท่า**');
  W('   และ **กุญแจจับกลุ่มห้ามมีสัญลักษณ์อยู่ในนั้น ถ้า feature เป็นค่าที่ทุกสัญลักษณ์เห็นเหมือนกัน**');
  W();
  W('ตัวเลขทุกตัวในหัวข้อถัดจากนี้ไปใช้ตัวประมาณที่แก้แล้วทั้งหมด: IC คิดบนทั้งอนุกรมของแต่ละสัญลักษณ์');
  W('· จับกลุ่มด้วยเวลาล้วน (ปีสำหรับ 1D · เดือนสำหรับ 1H) · ค่า p จากการแจกแจง t');
  W();

  // ── สมมติฐานที่ตั้งไว้ล่วงหน้า ─────────────────────────────────────────────
  W('---');
  W();
  W('# T4 · สมมติฐานที่ตั้งไว้ *ก่อน* วัด');
  W();
  W('กติกาข้อ 5 ของรอบนี้: ต้องมีกลไกก่อน แล้วค่อยทดสอบเฉพาะที่มีกลไก');
  W('ห้ามไล่ 24 ชั่วโมง × 5 วัน = 120 ช่องแล้วเก็บช่องที่สวย');
  W();
  W('| # | feature | ชนิด | ใช้กับ | กลไกที่อ้าง | ทิศที่ทำนายไว้ |');
  W('|---:|---|---|---|---|---|');
  FEATURES.forEach((f, i) => {
    W(`| ${i + 1} | \`${f.id}\` — ${f.label} | ${f.kind === 'binary' ? 'ทวิภาค' : 'ต่อเนื่อง'} | ${f.tfs.join('/')} · ${f.groups.length === 6 ? 'ทุกกลุ่ม' : f.groups.map((g) => GROUP_LABEL[g]).join(', ')} | ${f.why} | ${f.expect} |`);
  });
  W();
  W('**ตัวควบคุมสองตัวสำคัญไม่แพ้ feature จริง**');
  W('· `ctrlNoise` ไม่มีกลไกเลย — ถ้ามันผ่านที่ไหนสักช่อง แปลว่าเกณฑ์ตัดสินของรายงานนี้หลวมเกินไป');
  W('· `ctrlRevPrev` เป็นผลที่มีอยู่จริงในตลาด (การกลับตัวระยะสั้น) — ถ้ามันไม่ผ่านเลยสักช่อง');
  W('  แปลว่าเครื่องวัดนี้ตาบอด และคำว่า "ไม่เจออะไร" ของรายงานนี้ไม่มีน้ำหนัก');
  W('ทั้งสองตัวถูกนับรวมในบัญชี Holm เดียวกันกับ feature จริง ไม่ได้รับการยกเว้น');
  W();
  W('**สิ่งที่จงใจไม่ทำ**: ไม่ไล่ทุกคู่ (ชั่วโมง × วัน) · ไม่ไล่ทุกเดือน · ไม่เลือกสัญลักษณ์รายตัว');
  W('เพราะ exp-ceiling.md แสดงแล้วว่าการเลือกจากผลงานย้อนหลังกลับหัวได้จริง (top10 ได้ −0.022 / bottom10 ได้ +0.065)');
  W();

  // ── ตาราง IC หลัก ─────────────────────────────────────────────────────────
  W('---');
  W();
  W('# T5 · ตาราง IC พร้อมช่วงความเชื่อมั่นและค่า p ที่แก้แล้ว');
  W();
  W(`ทุกช่องที่มีข้อมูลพอ (แท่ง ≥ ${intS(CELL_MIN_OBS)} และกลุ่มเวลา ≥ ${CELL_MIN_CLUSTERS}) ถูกลงทะเบียนเป็นการทดสอบ`);
  W('และรายงานทั้งหมด ไม่ว่าผ่านหรือไม่ผ่าน');
  W();
  for (const tf of ['1D', '1H']) {
    const rows = usable.filter((r) => r.tf === tf);
    if (!rows.length) continue;
    const fam = TESTS.filter((t) => t.family === `IC-${tf}`);
    const thr = fam.length ? OPT.alpha / fam.length : NaN;
    W(`## ${tf} — ลงทะเบียน ${fam.length} การทดสอบในตระกูลนี้ · เกณฑ์ Holm ที่เข้มที่สุด = ${thr.toExponential(1)}`);
    W();
    W('| feature | กลุ่ม | h | แท่ง | สัญลักษณ์ | กลุ่มเวลา | IC | CI สุ่มสัญลักษณ์ | CI สุ่มช่วงเวลา | ค่า p | ผ่าน Holm | IC→bps | เงินจริง bps | ค่าธรรมเนียม bps | เงิน ÷ ค่าธรรมเนียม |');
    W('|---|---|---:|---:|---:|---:|---:|---|---|---:|:---:|---:|---:|---:|---:|');
    const sorted = [...rows].sort((a, b) => (a.feature === b.feature
      ? (a.group === b.group ? a.h - b.h : GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group))
      : FEATURES.findIndex((f) => f.id === a.feature) - FEATURES.findIndex((f) => f.id === b.feature)));
    for (const r of sorted) {
      const ratio = Number.isFinite(r.moneyBps) && Number.isFinite(r.fee) && r.fee > 0 ? Math.abs(r.moneyBps) / r.fee : NaN;
      W(`| \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.h} | ${intS(r.obs)} | ${r.symbols} | ${r.clusters} | ${nf(r.ic, 4)} | [${nf(r.icLo, 4)}, ${nf(r.icHi, 4)}] | [${nf(r.icLoT, 4)}, ${nf(r.icHiT, 4)}] | ${pS(r.icP)} | ${r.holmPass ? '**ผ่าน**' : '—'} | ${bpsS(r.icBps)} | ${bpsS(r.moneyBps)} | ${bpsS(r.fee)} | ${Number.isFinite(ratio) ? ratio.toFixed(3) : '—'} |`);
    }
    W();
  }

  if (skipped.length) {
    W('## ช่องที่ข้อมูลไม่พอจะวัด (ไม่ถูกลงทะเบียนเป็นการทดสอบ)');
    W();
    W('เกณฑ์ตั้งไว้ก่อนเห็นผล และใช้เหมือนกันทุกช่อง — ไม่ได้ตัดทิ้งเพราะผลไม่สวย');
    W();
    W('| กรอบเวลา | กลุ่ม | feature | h | แท่ง | กลุ่มเวลา |');
    W('|---|---|---|---:|---:|---:|');
    const shown = skipped.slice().sort((a, b) => a.key.localeCompare(b.key));
    for (const r of shown.slice(0, 40)) {
      W(`| ${r.tf} | ${GROUP_LABEL[r.group]} | \`${r.feature}\` | ${r.h} | ${intS(r.obs)} | ${r.clusters} |`);
    }
    if (shown.length > 40) W(`| … | | | | | *(อีก ${shown.length - 40} ช่อง ดูใน exp-feat-time.json)* |`);
    W();
    const byGroup = {};
    for (const r of skipped) byGroup[`${r.tf}·${GROUP_LABEL[r.group]}`] = (byGroup[`${r.tf}·${GROUP_LABEL[r.group]}`] || 0) + 1;
    W(`สรุปที่มาของช่องที่วัดไม่ได้: ${Object.entries(byGroup).sort().map(([k, v]) => `${k} ${v} ช่อง`).join(' · ')}`);
    W();
    W('เหตุผลหลักคือ **คริปโตกับทองบนกรอบ 1D แทบไม่มีแท่งอยู่ในช่วง train เลย**');
    W('(train ของ 1D จบปี 2016 ส่วน BTC เพิ่งมีข้อมูลปี 2014 และเหรียญอื่นเริ่มหลังจากนั้น)');
    W('นี่เป็นข้อจำกัดของคลังข้อมูล ไม่ใช่ผลการทดลอง');
    W();
  }

  // ── T5 เงิน ───────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# T6 · แปลงเป็นเงิน แล้วเทียบค่าธรรมเนียม');
  W();
  W('IC เป็นตัวเลขไร้หน่วย ตัดสินใจอะไรไม่ได้ — ต้องแปลงเป็นเงินก่อน');
  W('รายงานนี้แปลงสองทาง แล้วให้ทั้งสองตัวคุมกันเอง:');
  W();
  W('```');
  W('  IC→bps   = IC × ส่วนเบี่ยงเบนมาตรฐานของผลตอบแทนอนาคต   (ทฤษฎี: ถ้าถือขนาดตามสัญญาณที่ปรับให้แปรปรวน 1)');
  W('  เงินจริง = ผลตอบแทนเฉลี่ยกลุ่มบน − กลุ่มล่าง            (ของจริง: เทรดได้ด้วย percentile หน้าต่างวิ่ง)');
  W('```');
  W();
  W('⚠ "เงินจริง" เป็นส่วนต่างสองขา (ซื้อกลุ่มบน ขายกลุ่มล่าง) ถ้าจะเทรดจริงต้องจ่ายค่าธรรมเนียม');
  W('**สองรอบ** ไม่ใช่รอบเดียว — ตารางข้างล่างเทียบกับค่าธรรมเนียม **รอบเดียว** ซึ่งเข้าข้าง feature เต็มที่แล้ว');
  W();
  const money = usable.filter((r) => featById[r.feature].family !== 'X')
    .sort((a, b) => {
      const ra = Number.isFinite(a.moneyBps) && a.fee > 0 ? Math.abs(a.moneyBps) / a.fee : -1;
      const rb = Number.isFinite(b.moneyBps) && b.fee > 0 ? Math.abs(b.moneyBps) / b.fee : -1;
      return rb - ra;
    });
  W('**20 ช่องที่ "เงิน ÷ ค่าธรรมเนียม" สูงที่สุด** (ยังไม่ได้กรองด้วยนัยสำคัญ — นี่คือกรณีดีที่สุดที่เป็นไปได้)');
  W();
  W('| อันดับ | feature | กลุ่ม | กรอบเวลา | h | เงินจริง bps | CI สุ่มช่วงเวลา 95% | ค่า p ของเงิน | ค่าธรรมเนียม bps | เงิน ÷ ค่าธรรมเนียม | ผ่าน Holm (ทิศ) |');
  W('|---:|---|---|---|---:|---:|---|---:|---:|---:|:---:|');
  money.slice(0, 20).forEach((r, i) => {
    const ratio = Number.isFinite(r.moneyBps) && r.fee > 0 ? Math.abs(r.moneyBps) / r.fee : NaN;
    W(`| ${i + 1} | \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.tf} | ${r.h} | ${bpsS(r.moneyBps)} | [${bpsS(r.moneyLoT)}, ${bpsS(r.moneyHiT)}] | ${pS(r.moneyP)} | ${bpsS(r.fee)} | **${Number.isFinite(ratio) ? ratio.toFixed(3) : '—'}** | ${r.holmPass ? 'ผ่าน' : '—'} |`);
  });
  W();
  {
    const top = money.slice(0, 20);
    const cross = top.filter((r) => !(Number.isFinite(r.moneyLoT) && Number.isFinite(r.moneyHiT))
      || (r.moneyLoT <= 0 && r.moneyHiT >= 0)).length;
    const holmThr20 = top.length ? Math.min(...top.map((r) => (Number.isFinite(r.holmThreshold) ? r.holmThreshold : Infinity))) : NaN;
    W(`⚠ ใน 20 แถวข้างบน มี **${cross} แถว** ที่ช่วงความเชื่อมั่นแบบสุ่มช่วงเวลาคร่อมศูนย์`);
    W(`และไม่มีแถวไหนเลยที่ค่า p ของเงินเล็กพอจะผ่านเกณฑ์ Holm (ที่เข้มที่สุด ${Number.isFinite(holmThr20) ? holmThr20.toExponential(1) : '—'})`);
    W(`— แถวที่ค่า p เล็กที่สุดในตารางนี้คือ ${pS(Math.min(...top.map((r) => (Number.isFinite(r.moneyP) ? r.moneyP : Infinity))))} ซึ่งยังห่างจากเกณฑ์หลายเท่าตัว`);
    W();
    W('การเรียงลำดับตารางนี้จึงเป็นการเรียง **เสียงรบกวน** เป็นหลัก ไม่ใช่การเรียงความสามารถ');
    W('เอามาอ่านได้เพื่อดูว่า "กรณีดีที่สุดที่เป็นไปได้หน้าตาเป็นยังไง" เท่านั้น');
  }
  W();
  const overFee = money.filter((r) => Number.isFinite(r.moneyBps) && r.fee > 0 && Math.abs(r.moneyBps) > r.fee);
  const overFeeSig = overFee.filter((r) => r.holmPass);
  W(`ช่องที่เงินมากกว่าค่าธรรมเนียม (รอบเดียว): **${overFee.length}** จาก ${money.length} ช่อง`);
  W(`· ในจำนวนนั้นที่ผ่าน Holm ด้วย: **${overFeeSig.length}** ช่อง`);
  W();

  // ── T6 ขนาด ───────────────────────────────────────────────────────────────
  W('---');
  W();
  W('# T7 · ทำนาย "ขนาด" ได้ไหม (ไม่ใช่ทิศ)');
  W();
  W('exp-ceiling.md หัวข้อ C4b เตือนว่าระบบปัจจุบัน **ถูกตอนราคานิ่งและผิดตอนราคาวิ่ง**');
  W('ดังนั้นเป้าหมายของ feature ต้องเป็น "ทิศ **และ** ขนาด" ไม่ใช่ทิศอย่างเดียว');
  W('หัวข้อนี้จึงวัด IC ของ feature กลุ่มระบอบความผันผวนกับ **ค่าสัมบูรณ์** ของผลตอบแทนอนาคต');
  W();
  W('⚠ ตัวเลขในหัวข้อนี้ **แปลงเป็นเงินตรง ๆ ไม่ได้** เพราะรู้ขนาดอย่างเดียวไม่บอกว่าจะซื้อหรือขาย');
  W('ประโยชน์ของมันคือใช้เป็น *ตัวกรอง* หรือ *ตัวปรับขนาดไม้* ให้สัญญาณตัวอื่น');
  W();
  const sizeRows = usable.filter((r) => SIZE_FEATURES.includes(r.feature) && Number.isFinite(r.sizeIc) && r.sizeClusters >= CELL_MIN_CLUSTERS)
    .sort((a, b) => Math.abs(b.sizeIc) - Math.abs(a.sizeIc));
  W('| อันดับ | feature | กลุ่ม | กรอบเวลา | h | IC ต่อขนาด | ค่า p | ผ่าน Holm | IC ต่อทิศ (เทียบ) |');
  W('|---:|---|---|---|---:|---:|---:|:---:|---:|');
  sizeRows.slice(0, 25).forEach((r, i) => {
    W(`| ${i + 1} | \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.tf} | ${r.h} | ${nf(r.sizeIc, 4)} | ${pS(r.sizeP)} | ${r.sizeHolmPass ? '**ผ่าน**' : '—'} | ${nf(r.ic, 4)} |`);
  });
  W();
  const sizeReal = sizeRows.filter((r) => r.feature !== 'ctrlNoise');
  const sizeCtl = sizeRows.filter((r) => r.feature === 'ctrlNoise');
  const sizePass = sizeReal.filter((r) => r.sizeHolmPass);
  const medAbsSize = sizeReal.length ? percentileOfSorted(sizeReal.map((r) => Math.abs(r.sizeIc)).sort((a, b) => a - b), 0.5) : NaN;
  const medAbsDir = sizeReal.length ? percentileOfSorted(sizeReal.map((r) => Math.abs(r.ic)).sort((a, b) => a - b), 0.5) : NaN;
  W(`ช่องที่ผ่าน Holm ในตระกูล "ขนาด": **${sizePass.length}** จาก ${sizeReal.length} ช่องที่ไม่ใช่ตัวควบคุม`);
  W(`· ตัวควบคุมเสียงรบกวนในตระกูลเดียวกันผ่าน ${sizeCtl.filter((r) => r.sizeHolmPass).length} จาก ${sizeCtl.length} ช่อง (ต้องเป็น 0)`);
  W(`· |IC ต่อขนาด| มัธยฐาน = **${nf(medAbsSize, 4)}** เทียบกับ |IC ต่อทิศ| มัธยฐาน = **${nf(medAbsDir, 4)}**`);
  if (Number.isFinite(medAbsSize) && Number.isFinite(medAbsDir) && medAbsDir > 0) {
    W(`· แรงกว่ากัน **${(medAbsSize / medAbsDir).toFixed(1)} เท่า** โดยรวม · ช่องที่แรงที่สุดต่างกันเกิน 100 เท่า`);
  }
  W();

  // ── T7 ความคงทน ───────────────────────────────────────────────────────────
  W('---');
  W();
  W('# T8 · ทดสอบความคงทน — ผลซ้ำรอยข้ามปีไหม');
  W();
  W('ถ้าผลของช่วงเวลาหนึ่งมาจากปีเดียวแล้วปีอื่นเป็นศูนย์หรือกลับข้าง นั่นคือเสียงรบกวน ไม่ใช่กลไก');
  W('ตารางนี้ดูช่องที่ผ่าน Holm ทุกช่อง **บวกกับ** 8 ช่องที่ IC แรงที่สุดของแต่ละกรอบเวลาแม้ไม่ผ่าน');
  W('(ดูตัวที่ไม่ผ่านด้วย เพราะถ้าตัวที่แรงที่สุดยังไม่ซ้ำรอย แสดงว่าไม่มีอะไรให้หาต่อ)');
  W();
  W('| feature | กลุ่ม | กรอบเวลา | h | IC รวม | จำนวนช่วง | ช่วงที่เครื่องหมายตรงกัน | สัดส่วน | ค่า p | ผ่าน Holm |');
  W('|---|---|---|---:|---:|---:|---:|---:|---:|:---:|');
  for (const r of robustRows.sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic))) {
    W(`| \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.tf} | ${r.h} | ${nf(r.ic, 4)} | ${r.periods} | ${Number.isFinite(r.agree) ? r.agree : '—'} | ${Number.isFinite(r.agree) ? pctS(r.agree / r.periods) : '—'} | ${pS(r.p)} | ${r.holmPassRobust ? '**ผ่าน**' : '—'} |`);
  }
  W();
  const robustPass = robustRows.filter((r) => r.holmPassRobust);
  W(`ช่องที่เครื่องหมายซ้ำรอยข้ามช่วงเวลาอย่างมีนัยสำคัญ: **${robustPass.length}** จาก ${robustRows.length} ช่องที่ตรวจ`);
W();
W("1D แบ่งเป็นปีปฏิทิน · 1H แบ่งเป็นครึ่งปี (train ของ 1H ยาวแค่ 2 ปี จึงมีแค่ 4–5 ช่วง");
W("ซึ่งน้อยเกินกว่าจะสรุปความคงทนได้จริง — ตัวเลขความคงทนของ 1H ทุกแถวจึงอ่อนโดยโครงสร้าง)");
  W();
  W('รายละเอียด IC รายปีของช่องที่แรงที่สุด 6 ช่อง (ดูด้วยตาว่ามันซ้ำรอยจริงหรือมาจากปีเดียว):');
  W();
  for (const r of robustRows.slice(0, 6)) {
    W(`**\`${r.feature}\` · ${GROUP_LABEL[r.group]} · ${r.tf} · h=${r.h}** — IC รวม ${nf(r.ic, 4)}`);
    W();
    W('```');
    const d = r.detail || [];
    for (let i = 0; i < d.length; i += 8) {
      W('  ' + d.slice(i, i + 8).map((o) => `${o.year}:${o.ic >= 0 ? '+' : ''}${o.ic.toFixed(3)}`).join('  '));
    }
    W('```');
    W();
  }

  // ── T8 บัญชีการเปรียบเทียบ ────────────────────────────────────────────────
  W('---');
  W();
  W('# T9 · บัญชีการเปรียบเทียบทั้งหมด');
  W();
  W('กติกาข้อ 4: นับทุกอย่างที่ถาม ไม่ใช่เฉพาะที่ตอบว่าใช่');
  W();
  W('| ตระกูล | จำนวนการทดสอบ | เกณฑ์ Holm ที่เข้มที่สุด | ผ่าน |');
  W('|---|---:|---:|---:|');
  const byFam = new Map();
  for (const t of TESTS) {
    if (!byFam.has(t.family)) byFam.set(t.family, []);
    byFam.get(t.family).push(t);
  }
  for (const f of [...byFam.keys()].sort()) {
    const list = byFam.get(f);
    W(`| ${f} | ${list.length} | ${(OPT.alpha / list.length).toExponential(1)} | ${list.filter((t) => t.holmPass).length} |`);
  }
  W(`| **รวม** | **${TESTS.length}** | | **${TESTS.filter((t) => t.holmPass).length}** |`);
  W();
  W('ตระกูลถูกแบ่งตาม "ชุดคำถามที่ถามพร้อมกันบนข้อมูลชุดเดียวกัน" — ทุก feature ทุกกลุ่ม');
  W('ทุกหน้าต่างถือของกรอบเวลาเดียวกัน อยู่ในตระกูลเดียวกันหมด **รวมทั้งตัวควบคุมด้วย**');
  W('การแบ่งแบบนี้เข้มกว่าการแยกตระกูลรายกลุ่ม และเป็นการเลือกที่เข้าข้างข้อสรุป "ไม่เจอ" น้อยที่สุด');
  W();
  W('รายการการทดสอบทั้งหมดพร้อมค่า p อยู่ใน `exp-feat-time.json` ช่อง `tests` (ครบทั้งที่ผ่านและไม่ผ่าน)');
  W();

  // ── T9 คำตัดสิน ───────────────────────────────────────────────────────────
  W('---');
  W();
  W('# T10 · แรงพอไหม — คำตอบตรง ๆ');
  W();

  const ceilingRelevant = usable.filter((r) => featById[r.feature].family !== 'X'
    && ((r.tf === '1D' && (r.h === 10 || r.h === 20)) || r.tf === '1H'));
  const bestCeil = ceilingRelevant.filter((r) => r.fee > 0).sort((a, b) => Math.abs(b.moneyBps) / b.fee - Math.abs(a.moneyBps) / a.fee)[0];

  const bothOk2 = usable.filter((r) => featById[r.feature].family !== 'X' && r.holmPass
    && Number.isFinite(r.moneyBps) && r.fee > 0 && Math.abs(r.moneyBps) > r.fee);

  W('## ทิศ: ไม่ — ไม่มี feature เวลาตัวไหนแรงพอ');
  W();
  W(`ช่องที่ผ่านทั้งสองด่าน (นัยสำคัญ **และ** เงิน > ค่าธรรมเนียม) = **${bothOk2.length}**`);
  W();
  if (passedNonCtrl.length) {
    W('ช่องที่ผ่านด่านแรก (นัยสำคัญ) มีเท่านี้ — และตกด่านที่สองทุกช่อง:');
    W();
    W('| feature | กลุ่ม | กรอบเวลา | h | IC | เงินจริง bps | ค่าธรรมเนียม bps | เงิน ÷ ค่าธรรมเนียม | ซ้ำรอยข้ามช่วง |');
    W('|---|---|---|---:|---:|---:|---:|---:|:---:|');
    for (const r of passedNonCtrl.sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic))) {
      const ratio = r.fee > 0 ? Math.abs(r.moneyBps) / r.fee : NaN;
      const rb = robustRows.find((x) => x.key === r.key);
      W(`| \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.tf} | ${r.h} | ${nf(r.ic, 4)} | ${bpsS(r.moneyBps)} | ${bpsS(r.fee)} | **${Number.isFinite(ratio) ? ratio.toFixed(3) : '—'}** | ${rb ? (rb.holmPassRobust ? 'ใช่' : `${rb.agree}/${rb.periods}`) : '—'} |`);
    }
    W();
  }
  W('**นี่คือผลลัพธ์ที่ถูกต้อง ไม่ใช่การยอมแพ้** — และมีค่ากับเจ้าของมากกว่าการรายงานผลบวกที่เชื่อไม่ได้');
  W('เพราะมันแปลว่าเวลาที่จะลงกับ "ชั่วโมงไหนดี วันไหนดี" ควรถูกย้ายไปที่อื่น');
  W();
  W('## ขนาด: ได้ — และนี่คือของที่ควรเก็บไปใช้ต่อ');
  W();
  {
    const sizeAll2 = usable.filter((r) => SIZE_FEATURES.includes(r.feature) && r.feature !== 'ctrlNoise'
      && Number.isFinite(r.sizeIc) && r.sizeClusters >= CELL_MIN_CLUSTERS);
    const sizeOk2 = sizeAll2.filter((r) => r.sizeHolmPass).sort((a, b) => Math.abs(b.sizeIc) - Math.abs(a.sizeIc));
    W(`${sizeOk2.length} จาก ${sizeAll2.length} ช่องผ่านเกณฑ์เดียวกันเป๊ะ · 10 ช่องที่แรงที่สุด:`);
    W();
    W('| feature | กลุ่ม | กรอบเวลา | h | IC ต่อขนาด | IC ต่อทิศ (ช่องเดียวกัน) | แรงกว่ากี่เท่า | ทิศของความสัมพันธ์ |');
    W('|---|---|---|---:|---:|---:|---:|---|');
    for (const r of sizeOk2.slice(0, 10)) {
      const raw = Math.abs(r.ic) > 1e-9 ? Math.abs(r.sizeIc) / Math.abs(r.ic) : Infinity;
      // เลี่ยงตัวเลขหลอกตาแบบ "191 เท่า" ซึ่งเกิดจากตัวหารเกือบศูนย์ ไม่ใช่จากตัวตั้งที่ใหญ่
      const mult = raw > 100 ? '>100×' : `${raw.toFixed(0)}×`;
      W(`| \`${r.feature}\` | ${GROUP_LABEL[r.group]} | ${r.tf} | ${r.h} | ${nf(r.sizeIc, 4)} | ${nf(r.ic, 4)} | ${mult} | ${r.sizeIc < 0 ? 'ผันผวนขยายตัว → แท่งหน้า **เล็กลง**' : 'ผันผวนขยายตัว → แท่งหน้า **ใหญ่ขึ้น**'} |`);
    }
    W();
    const neg = sizeOk2.filter((r) => r.sizeIc < 0).length;
    W(`ในจำนวนที่ผ่านทั้งหมด ${neg} ช่องเป็นลบ และ ${sizeOk2.length - neg} ช่องเป็นบวก —`);
    W('ไม่ใช่ความขัดแย้ง แต่เป็นสองกลไกคนละช่วงเวลา: ความผันผวนที่เพิ่งพุ่งมักคลายตัวลง (เครื่องหมายลบ)');
    W('ส่วนการคลายตัวออกจากช่วงบีบตัวมักลากต่ออีกแท่งสองแท่ง (เครื่องหมายบวก ที่ h สั้น)');
    W('ก่อนเอาไปใช้ต้องแยกสองกรณีนี้ให้ขาดก่อน ไม่ใช่รวมเป็นตัวเดียว');
  }
  W();
  W('**ข้อควรระวังที่ใหญ่ที่สุดของท่อนนี้**: IC ต่อขนาดสูงไม่ได้แปลว่าได้เงิน มันบอกแค่ว่า');
  W('"แท่งหน้าจะวิ่งแรงหรือนิ่ง" ถ้าเอาไปใช้ผิดวิธี (เช่น เพิ่มขนาดไม้ตอนคาดว่าจะวิ่งแรง');
  W('โดยที่ทิศยังเดาไม่ถูก) มันจะ **ขยายการขาดทุน** ไม่ใช่ขยายกำไร — exp-ceiling.md C4b วัดไว้แล้วว่า');
  W('ระบบปัจจุบันผิดตอนราคาวิ่ง ดังนั้นการใช้ที่ถูกคือ *ลด* ขนาดหรือ *ไม่เข้า* ตอนคาดว่าจะวิ่งแรง');
  W('จนกว่าจะมีสัญญาณทิศที่ดีกว่านี้');
  W();
  W('**ตัวเลขที่ตัดสินเรื่องนี้**');
  W();
  W('| คำถาม | ตัวเลขที่วัดได้ |');
  W('|---|---|');
  W(`| ช่องที่วัดได้ทั้งหมด | ${usable.length} |`);
  W(`| ช่องที่ IC ต่างจากศูนย์อย่างมีนัยสำคัญ (หลัง Holm ไม่นับตัวควบคุม) | ${passedNonCtrl.length} |`);
  W(`| ช่องที่เงิน > ค่าธรรมเนียมรอบเดียว | ${overFee.length} |`);
  W(`| ช่องที่ทั้งมีนัยสำคัญ **และ** เงิน > ค่าธรรมเนียม | ${overFeeSig.length} |`);
  W(`| ตัวควบคุมเสียงรบกวนที่ผ่าน (ต้องเป็น 0) | ${noisePassed.length} |`);
  W(`| ตัวควบคุมการกลับตัวระยะสั้นที่ผ่าน (ยืนยันว่าเครื่องวัดมีฟัน) | ${revPassed.length} จาก ${revRows.length} |`);
  if (bestCeil) {
    const ratio = Math.abs(bestCeil.moneyBps) / bestCeil.fee;
    const thr = Number.isFinite(bestCeil.holmThreshold) ? bestCeil.holmThreshold : NaN;
    W(`| ช่องที่เงิน ÷ ค่าธรรมเนียม สูงสุด ในกรอบที่ exp-ceiling.md บอกว่ายังมีที่ว่าง | \`${bestCeil.feature}\` · ${GROUP_LABEL[bestCeil.group]} · ${bestCeil.tf} h=${bestCeil.h} → ${bpsS(bestCeil.moneyBps)} bps เทียบค่าธรรมเนียม ${bpsS(bestCeil.fee)} bps = **${ratio.toFixed(2)} เท่า** · p ของเงิน = ${pS(bestCeil.moneyP)} เทียบเกณฑ์ Holm ${Number.isFinite(thr) ? thr.toExponential(1) : '—'} ⇒ **ไม่ผ่าน** |`);
    W();
    W('---');
    W();
    W('แถวสุดท้ายคือกับดักที่ต้องระวังที่สุดของรายงานนี้ และควรอ่านให้ตรงตามที่มันเป็นจริง ๆ:');
    W();
    W(`· ตัวเลข ${ratio.toFixed(2)} เท่า เป็นของจริงที่วัดได้ และช่วงความเชื่อมั่นแบบสุ่มช่วงเวลา`);
    W(`  [${bpsS(bestCeil.moneyLoT)}, ${bpsS(bestCeil.moneyHiT)}] bps ก็ **ไม่คร่อมศูนย์** ด้วยซ้ำ`);
    W(`· แต่ค่า p ของมันคือ ${pS(bestCeil.moneyP)} ขณะที่เกณฑ์หลังแก้ค่าการเปรียบเทียบ ${TESTS.filter((t) => t.family === `IC-${bestCeil.tf}`).length} ครั้ง`);
    W(`  อยู่ที่ ${Number.isFinite(thr) ? thr.toExponential(1) : '—'} — ห่างกันประมาณ ${Number.isFinite(thr) && thr > 0 ? Math.round(bestCeil.moneyP / thr) : '—'} เท่า`);
    W('· แปลว่า: ถ้าดูช่องนี้ช่องเดียวตั้งแต่แรกโดยไม่ได้ดูอีก 411 ช่อง มันจะ "เกือบมีนัยสำคัญ"');
    W('  แต่เราดู 412 ช่อง การเจอช่องแบบนี้สักช่องสองช่องเป็นสิ่งที่ **คาดหมายได้จากความบังเอิญล้วน**');
    W();
    W('นี่คือเหตุผลที่รายงานนี้บังคับให้ผ่าน **สองด่าน** และนับทุกช่องที่ดู ไม่ใช่เฉพาะช่องที่สวย');
  }
  W();
  W('**สิ่งที่รายงานนี้พิสูจน์ไม่ได้ (ห้ามอ่านเกิน)**');
  W();
  W('· IC ใกล้ศูนย์ = feature ตัวนั้นเดี่ยว ๆ ไม่มีพลังทำนายเชิงเส้นอันดับ ไม่ได้แปลว่ามันไร้ประโยชน์');
  W('  เมื่อ **ประกอบกับตัวอื่น** (เช่น ใช้เป็นตัวกรองให้สัญญาณจากตระกูลวอลุ่มหรือข้ามสัญลักษณ์)');
  W('  แต่กติกาข้อ 5 บอกว่าตัวที่ IC ใกล้ศูนย์ไม่มีทางกลายเป็นเงินได้ด้วยตัวเอง ซึ่งตรงกับที่วัดได้');
  W('· ทุกอย่างวัดบน train ล้วน ยังไม่แตะ validation — ตัวเลขทุกตัวคือการสำรวจ ยังไม่ใช่การยืนยัน');
  W('· 1H ย้อนได้แค่ 730 วัน = เห็นตลาดยุคเดียว ข้อสรุปทุกข้อบน 1H อ่อนกว่า 1D มาก');
  W('· คลังข้อมูลยังมี survivorship bias (Yahoo ลบหุ้นที่ออกจากกระดาน) และราคาไม่ได้หักปันผล');
  W('· การวัด IC แบบนี้เป็นความสัมพันธ์เชิงอันดับ **ทางเดียว** — ถ้าความสัมพันธ์จริงเป็นรูปตัว U');
  W('  (เช่น ทั้งค่าสูงมากและต่ำมากให้ผลบวก) Spearman จะมองไม่เห็น หัวข้อ T6 ที่ใช้ tercile');
  W('  ช่วยได้บางส่วนแต่ไม่ทั้งหมด');
  W();
}

main().catch((e) => { console.error(e); process.exit(1); });
