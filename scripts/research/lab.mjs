#!/usr/bin/env node
/**
 * lab.mjs — เครื่องวัดรวมของงานวิจัยสัญญาณ
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ไฟล์นี้ "วัด" อย่างเดียว ไม่ตัดสินใจแทนใคร และไม่แตะตรรกะสัญญาณของระบบจริง
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────── ทำไมต้องแบ่ง train / validation / test ───────────────────
 *
 * ปัญหาที่ต้องกันคือ "การปรับค่าจนพอดีกับอดีตชุดหนึ่ง แล้วเข้าใจว่าเจอ edge"
 * เครื่องยนต์นี้มีปุ่มปรับได้หลายสิบปุ่ม (engine-lab.mjs) ถ้าลองสัก 50 แบบบนข้อมูล
 * ชุดเดียวกัน แล้วเลือกแบบที่ดีที่สุด — ค่าที่ได้ "ดีที่สุดในบรรดาที่ลอง" เสมอ
 * แม้เครื่องยนต์จะไม่มี edge เลยก็ตาม เพราะเราไปเลือกหัวแถวของการแจกแจงความบังเอิญ
 * ตัวเลขที่วัดบนข้อมูลชุดที่ใช้เลือกจึงไม่ใช่ประมาณการของอนาคต แต่เป็นสถิติอันดับ
 * (order statistic) ของเสียงรบกวน — เอาไปคาดหวังกับเงินจริงไม่ได้
 *
 * วิธีเดียวที่แก้ได้คือกันข้อมูลบางส่วนไว้ไม่ให้ "ตาของคนปรับ" เห็นเลย:
 *   · train      (เก่าสุด 60% ของแท่ง)  — ปรับค่าได้ตามใจ ดูได้ไม่จำกัด
 *   · validation (กลาง 20%)             — ใช้คัดว่าแบบไหนควรไปต่อ ดูได้แต่ต้องรู้ตัวว่า
 *                                          ยิ่งดูบ่อยยิ่งกลายเป็น train ทีละนิด
 *   · test       (ใหม่สุด 20%)          — แตะครั้งเดียวตอนจบ ห้ามเอาผลไปปรับอะไรต่อ
 *
 * ตัดตาม "เวลา" ไม่ใช่สุ่ม เพราะราคาสัมพันธ์กับตัวเองข้ามวัน (autocorrelation)
 * ถ้าสุ่มแบ่ง แท่งวันจันทร์ไปอยู่ train แท่งวันอังคารไปอยู่ test ระบบก็จะ "เห็นอนาคต"
 * ผ่านแท่งข้างเคียงโดยไม่ต้องมีบั๊กอะไรเลย และการแบ่งตามเวลายังตรงกับการใช้งานจริง:
 * เราปรับด้วยอดีต แล้วต้องเดินหน้าเข้าอนาคตที่ไม่เคยเห็น
 *
 * เส้นแบ่งเลือกจาก "ควอนไทล์ของจำนวนแท่งที่ใช้ได้จริง" ไม่ใช่ครึ่งทางของปฏิทิน
 * เพราะข้อมูลกระจุกอยู่ยุคหลัง (สัญลักษณ์ส่วนใหญ่เพิ่งมีข้อมูลหลังปี 2000)
 * ถ้าตัดครึ่งปฏิทิน 1970–2026 จะได้ train ที่แทบไม่มีแท่งอยู่เลย
 * เส้นเป็น "วันเดียวกันทั้งจักรวาล" ต่อกรอบเวลา — ไม่ตัดรายสัญลักษณ์ เพราะถ้าตัดราย
 * สัญลักษณ์ test ของ AAPL จะไปอยู่ปี 2015 ส่วน test ของ SOL อยู่ปี 2025 แล้ว "ชุดทดสอบ"
 * จะกลายเป็นของผสมหลายยุคที่ตีความไม่ได้
 *
 * 1D กับ 1H มีเส้นของตัวเองแยกกัน เพราะ 1H ย้อนได้แค่ 730 วัน (เพดานของ Yahoo)
 * ถ้าใช้เส้นเดียวกับ 1D ข้อมูล 1H ทั้งก้อนจะตกไปอยู่ test หมด
 *
 * ────────────────────────── การป้องกันชุด test ──────────────────────────
 *
 * ต้องใส่ครบสามอย่างถึงจะรันบน test ได้:  --split=test  --i-am-done-tuning
 * --confirm=FINAL-NO-MORE-TUNING   และทุกครั้งที่รันจะถูกบันทึกถาวรลง
 * scripts/research/report/TEST-SET-LEDGER.md  ครั้งที่สองเป็นต้นไปต้องเพิ่ม
 * --allow-repeat-test พร้อมอ่านคำเตือนว่าเคยแตะไปแล้วกี่ครั้งด้วย config อะไร
 * สมุดบันทึกนี้มีไว้เพื่อให้ "การโกงตัวเอง" ทิ้งร่องรอยไว้เสมอ ไม่ใช่เพื่อขัดขวาง
 *
 * ─────────────────────────── ความเร็วมาจากไหน ───────────────────────────
 *
 * ของเดิมช้าเพราะทุกแท่งคำนวณ indicator ใหม่ทั้งชุด: SMA(200) หนึ่งครั้งคือ 200×n
 * การดำเนินการ ทำซ้ำทุกแท่ง = O(n²) ที่มีค่าคงที่ใหญ่มาก (วัดได้ 828 ไมโครวินาที
 * ต่อแท่งบน AAPL 11,509 แท่ง = 9.5 วินาทีต่อสัญลักษณ์เดียว)
 *
 * ที่นี่ใช้สองอย่าง:
 *   1. คำนวณ RSI/MACD/EMA/SMA/BollingerBands ของ "ทั้งชุด" ครั้งเดียวต่อ dataset
 *      แล้วให้เครื่องยนต์อ่านที่ดัชนีของแท่งปัจจุบัน — ทำได้เพราะฟังก์ชันพวกนี้เป็น
 *      causal ล้วน: ค่าที่ดัชนี i ขึ้นกับ values[0..i] เท่านั้น ค่าที่ได้จึงเท่ากัน
 *      "ทุกบิต" ไม่ว่าจะคำนวณบน prefix หรือบนชุดเต็ม (ไม่ใช่การประมาณ)
 *      ตัวที่ขึ้นกับความยาว (findSupportResistance ตัดท้ายทิ้ง lookback แท่ง) ถูกทำเป็น
 *      โครงสร้างสะสมที่ให้ผลเท่าเดิมทุกดัชนี ส่วน ATR/detectPatterns เรียกของจริงตรง ๆ
 *      เพราะมันอ่านแค่ปลายชุดอยู่แล้ว
 *   2. รันขนานด้วย worker_threads หนึ่ง dataset ต่อหนึ่งงาน
 *
 * ⚠ การเร่งความเร็วที่เปลี่ยนตัวเลขคือการทำลายงานวิจัย จึงมีโหมด --verify-engine
 * ที่เอาผลของลูปนี้ไปเทียบกับ runBacktest ตัวจริงใน src/lib/backtest.ts แบบไม้ต่อไม้
 * ทุกฟิลด์ ต้องตรงเป๊ะ 100% ไม่ใช่ "ใกล้เคียง"
 *
 * ─────────────────────────── ตัวหารของ R (riskModel) ───────────────────────────
 *
 * R = กำไร/ขาดทุน ÷ เงินที่เสี่ยงต่อไม้ ตัวหารคือ "หน่วยวัด" ถ้ามันเปลี่ยนไปตามเหตุบังเอิญ
 * การเอา R มาเฉลี่ยกันก็เหมือนบวกราคาหลายสกุลเงินโดยไม่แปลงสกุล
 *
 *   planned (ค่าเริ่มต้น) = |ราคาที่สัญญาณเห็น − SL| — ล็อกตั้งแต่ตอนกดสั่ง เป็นตัวเดียว
 *                           กับที่ใช้คิดขนาดไม้จริง gap จึงไปโผล่ใน "เศษ" ตามความจริง
 *   realized (ของเดิม)    = |ราคาเปิดจริง − SL| — เป็นผลของ gap ที่รู้หลังตัดสินใจแล้ว
 *                           และเล็กได้ไม่จำกัด → ไม้เดียวเคยย้าย avgR ของ 45,550 ไม้ได้ 9.3 R
 *
 * เก็บ realized ไว้เพื่อ "เทียบก่อน/หลัง" เท่านั้น ห้ามใช้ตัดสินอะไร
 * หลักฐานตัวเลขทั้งหมด + เหตุผลที่ไม่เลือกทางอื่น: scripts/research/report/metric-fix.md
 * ทุกรายงานที่ออกจากไฟล์นี้มีหัวข้อ "ตรวจเครื่องวัด" ติดมาด้วยเสมอ ซึ่งวัดซ้ำทุกทางให้ดู
 * ว่าไม้เดียวย้ายค่าเฉลี่ยได้แค่ไหน — จะได้ไม่ต้องเชื่อคำอธิบายข้างบนนี้ลอย ๆ
 *
 * ──────────────────────────────── วิธีใช้ ────────────────────────────────
 *
 *   node scripts/research/lab.mjs --verify-engine --all     ตรวจว่าลูปเร็วให้ผลเท่าของจริง
 *   node scripts/research/lab.mjs                           รันพื้นฐานบน train+validation
 *   node scripts/research/lab.mjs --config=path.json --tag=exp1
 *   node scripts/research/lab.mjs --help
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

import { ROOT, loadSrcModules } from './load-src-modules.mjs';
import { createLabEngine, resolveConfig, configDiff } from './engine-lab.mjs';

const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const SPLIT_FILE = path.join(REPORT_DIR, 'split.json');
const LEDGER_FILE = path.join(REPORT_DIR, 'TEST-SET-LEDGER.md');
const SELF = fileURLToPath(import.meta.url);

/** สัดส่วนการแบ่งตามจำนวนแท่ง (เก่า→ใหม่) — เปลี่ยนแล้วต้อง --recompute-split ใหม่ */
const SPLIT_RATIOS = { train: 0.6, validation: 0.2, test: 0.2 };

// ════════════════════════════ ต้นทุนการเทรด ════════════════════════════
//
// ตัวเลขทุกตัวใน COST_BPS คือ "การประมาณ" ไม่ใช่ค่าที่วัดจากใบยืนยันคำสั่งจริง
// หน่วยเป็น basis point (1 bps = 0.01%) ของมูลค่าสถานะ ต่อการเข้า-ออกครบหนึ่งรอบ
// รวมสเปรด + ค่าคอม + สลิปเพจที่คาดว่าจะโดนตอนคำสั่ง stop ทำงาน
//
// ที่มาของแต่ละตัว (เขียนไว้ให้เถียงได้ ไม่ใช่ให้เชื่อ):
//  · FOREX คู่หลัก — สเปรดปลีกทั่วไป ~1 pip: EURUSD 0.0001 บนราคา 1.08 = 0.93 bps
//    บวกสลิปเพจตอน stop อีกราวครึ่ง pip → ปัดเป็น 1.5 bps ต่อรอบ
//  · FOREX cross (EURJPY/GBPJPY) — สเปรดกว้างกว่าคู่หลักราวเท่าตัว → 2.5 bps
//  · USDMXN/USDZAR — สเปรดจริงหลักสิบ pip บนราคา 17–18 → 3 และ 5 bps
//  · USDTHB — ไม่ใช่คู่ที่โบรกเกอร์ปลีกทั่วไปเสนอสเปรดแคบ อ้างอิงส่วนต่างซื้อ-ขาย
//    ของธนาคารซึ่งกว้างระดับ 0.1–0.2% → 15 bps (ตัวที่มั่นใจน้อยที่สุดในตาราง)
//  · XAUUSD — สเปรด ~0.30 USD บนราคาระดับ 2,000+ = ~1.5 bps บวกสลิปเพจ → 3 bps
//  · XAGUSD — สเปรด ~0.03 USD บนราคาระดับ 30 = ~10 bps บวกสลิปเพจ → 15 bps
//  · PL=F / PA=F / HG=F — สัญญาที่สภาพคล่องบางกว่ามาก (รายงานคุณภาพพบบางวัน
//    วอลุ่มระดับ 2–4 สัญญา) → 12 / 20 / 10 bps
//  · US_STOCK — ค่าคอม 0 ที่โบรกเกอร์ปลีกยุคนี้ เหลือสเปรด 1–3 bps บวกสลิปเพจ → 5 bps
//  · TH_STOCK — ค่าคอมออนไลน์รายย่อยราว 0.157% ต่อขา (รวม VAT) = 31.4 bps ต่อรอบ
//    บวกสเปรดหนึ่งช่วงราคาซึ่งบน SET กว้างกว่าหุ้นสหรัฐมาก → 40 bps
//  · CRYPTO — ค่าธรรมเนียม taker 0.10% ต่อขา = 20 bps ต่อรอบ บวกสลิปเพจ → 25 bps
//
// ⚠ ต้นทุนจริงขึ้นกับโบรกเกอร์ ขนาดไม้ และเวลาที่ส่งคำสั่ง — ถ้าเจ้าของมีใบเสร็จจริง
// ให้แทนที่ตารางนี้ด้วย --cost-json=<ไฟล์> แล้วรันใหม่ อย่าใช้ตัวเลขเดานี้เป็นข้อสรุป
const COST_BPS = {
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
  /** สถานการณ์ร้าย: ต้นทุนจริงเป็นสองเท่าของที่ประมาณ (สเปรดกว้างตอนข่าว/สลิปเพจหนัก) */
  pessimisticMultiplier: 2,
};

// ═══════════════════════════════ ตัวช่วยเล็ก ๆ ═══════════════════════════════

/** PRNG ที่ให้ผลเดิมทุกครั้ง — bootstrap ต้องรันซ้ำได้ ไม่งั้นเถียงกันเรื่องตัวเลขไม่จบ */
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

const n2 = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const pct = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

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

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ═══════════════════════════════ คลังข้อมูล ═══════════════════════════════

function listCacheFiles() {
  if (!fs.existsSync(CACHE_DIR)) {
    throw new Error(`ไม่พบคลังข้อมูล ${CACHE_DIR} — สั่ง node scripts/research/fetch-universe.mjs ก่อน`);
  }
  return fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
}

/**
 * โหลด dataset หนึ่งชุดแล้วตัดตามสัญญาของคลัง
 *
 * ⚠ ต้องเคารพ quality.usable.from เสมอ — fetch-universe.mjs จงใจเก็บแท่งยุคที่ feed
 * เพี้ยน (open/close หลุดนอกกรอบ high-low) ไว้ในไฟล์ แล้วบอกให้ผู้บริโภคตัดเอง
 * ถ้าอ่าน candles ตรง ๆ จะได้แท่งที่เป็นไปไม่ได้ทางกายภาพติดเข้ามาในการวัด
 */
function loadDataset(file) {
  const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
  const from = j.quality?.usable?.from;
  let candles = j.candles;
  let trimmed = 0;
  if (from) {
    const cut = Date.parse(from);
    const idx = candles.findIndex((c) => Date.parse(c.timestamp) >= cut);
    if (idx > 0) { trimmed = idx; candles = candles.slice(idx); }
    else if (idx === -1) { trimmed = candles.length; candles = []; }
  }
  return {
    file,
    symbol: j.symbol,
    name: j.name,
    market: j.market,
    timeframe: j.timeframe,
    verdict: j.quality?.verdict ?? 'unknown',
    trimmedByUsable: trimmed,
    candles,
    times: candles.map((c) => Date.parse(c.timestamp)),
  };
}

function datasetMatchesFilter(meta, filt) {
  if (filt.markets && !filt.markets.includes(meta.market)) return false;
  if (filt.timeframes && !filt.timeframes.includes(meta.timeframe)) return false;
  if (filt.symbols && !filt.symbols.includes(meta.symbol)) return false;
  if (!filt.includeBad && meta.verdict === 'bad') return false;
  return true;
}

/** อ่านเฉพาะหัวไฟล์พอให้กรองได้ โดยไม่ต้องแบกแท่งทั้งหมดไว้ในหน่วยความจำ main thread */
function readMetaOnly(file) {
  const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
  return {
    file,
    symbol: j.symbol,
    market: j.market,
    timeframe: j.timeframe,
    verdict: j.quality?.verdict ?? 'unknown',
    usableFrom: j.quality?.usable?.from ?? null,
    usableTo: j.quality?.usable?.to ?? null,
    usableBars: j.quality?.usable?.bars ?? j.bars,
  };
}

// ═══════════════════════════ เส้นแบ่ง train/val/test ═══════════════════════════

/**
 * หาเส้นแบ่งจากควอนไทล์ของ "แท่งที่ใช้ได้จริง" รวมทั้งจักรวาล แยกตามกรอบเวลา
 * ต้องอ่านทุกไฟล์ครั้งหนึ่ง (หนัก) จึงเก็บผลไว้ที่ report/split.json แล้วใช้ซ้ำ
 * — เส้นแบ่งต้องนิ่ง ไม่ใช่ขยับทุกครั้งที่ดึงข้อมูลใหม่ ไม่งั้นผลเทียบข้ามรอบไม่ได้
 */
function computeSplitBoundaries() {
  const perTf = new Map();
  for (const file of listCacheFiles()) {
    const ds = loadDataset(file);
    if (ds.verdict === 'bad') continue; // ชุดที่คุณภาพตกไม่ควรมีสิทธิ์ขยับเส้นแบ่งของทั้งจักรวาล
    if (!perTf.has(ds.timeframe)) perTf.set(ds.timeframe, []);
    const arr = perTf.get(ds.timeframe);
    for (const t of ds.times) arr.push(t);
  }
  const out = { schemaVersion: 1, computedAt: new Date().toISOString(), ratios: SPLIT_RATIOS, timeframes: {} };
  for (const [tf, times] of perTf) {
    times.sort((a, b) => a - b);
    const n = times.length;
    const iTrain = Math.floor(n * SPLIT_RATIOS.train);
    const iVal = Math.floor(n * (SPLIT_RATIOS.train + SPLIT_RATIOS.validation));
    out.timeframes[tf] = {
      bars: n,
      first: new Date(times[0]).toISOString(),
      last: new Date(times[n - 1]).toISOString(),
      // trainEnd = แท่งแรกที่ "ไม่ใช่ train แล้ว" (ขอบซ้ายปิด ขอบขวาเปิด)
      trainEnd: new Date(times[iTrain]).toISOString(),
      validationEnd: new Date(times[iVal]).toISOString(),
      barsTrain: iTrain,
      barsValidation: iVal - iTrain,
      barsTest: n - iVal,
    };
  }

  // ── รอยรั่วข้ามกรอบเวลา ที่เส้นแบ่งรายกรอบเวลาสร้างขึ้นเอง ──
  //
  // 1H ย้อนได้แค่ 730 วัน ทั้งชุดจึงอยู่ในยุคเดียวกับ "อนาคต" ของ 1D
  // ผลคือช่วง train ของ 1H (จบ 2025-08) ทับซ้อนกับช่วง test ของ 1D (เริ่ม 2021-08)
  // ถ้าคนปรับค่าดูผล 1H train แล้วเอาไปเลือกพารามิเตอร์ พารามิเตอร์นั้นก็เห็นสภาพตลาด
  // ปี 2023–2025 ไปแล้ว — 1D test ช่วงนั้นจึงไม่ใช่ "ข้อมูลที่ไม่เคยเห็น" อีกต่อไป
  //
  // cleanTestFrom = วันหลังสุดของ validationEnd ทุกกรอบเวลา = วันที่ "ไม่มีกรอบเวลาไหน
  // เคยถูกใช้ปรับค่าเลย" ถ้าปรับค่าโดยดูหลายกรอบเวลา ต้องใช้ --test-clean-only
  const ends = Object.values(out.timeframes).map((b) => Date.parse(b.validationEnd));
  out.cleanTestFrom = new Date(Math.max(...ends)).toISOString();
  out.overlaps = [];
  for (const [tfTest, bt] of Object.entries(out.timeframes)) {
    for (const [tfTune, bu] of Object.entries(out.timeframes)) {
      if (tfTest === tfTune) continue;
      if (Date.parse(bu.validationEnd) > Date.parse(bt.validationEnd)) {
        out.overlaps.push({
          testTimeframe: tfTest,
          tunedTimeframe: tfTune,
          note: `ช่วง train+validation ของ ${tfTune} ยืดถึง ${bu.validationEnd.slice(0, 10)} `
            + `ซึ่งเลยจุดเริ่ม test ของ ${tfTest} (${bt.validationEnd.slice(0, 10)}) ไปแล้ว`,
        });
      }
    }
  }
  return out;
}

function loadSplitBoundaries({ recompute = false } = {}) {
  if (!recompute && fs.existsSync(SPLIT_FILE)) {
    const j = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
    // ไฟล์เก่าที่ยังไม่มีฟิลด์ cleanTestFrom ต้องคำนวณใหม่ ไม่ใช่ใช้ต่อแบบขาดข้อมูล
    if (JSON.stringify(j.ratios) === JSON.stringify(SPLIT_RATIOS) && j.cleanTestFrom) return j;
  }
  const computed = computeSplitBoundaries();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(SPLIT_FILE, `${JSON.stringify(computed, null, 2)}\n`, 'utf8');
  return computed;
}

/** ดัชนีแรกที่ timestamp >= cut (binary search) — times เรียงจากน้อยไปมากเสมอ */
function lowerBound(times, cut) {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < cut) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** ช่วงดัชนีของ "แท่งที่อนุญาตให้เข้าไม้" ต่อ split — null = ชุดนี้ไม่มีแท่งใน split นั้น */
function entryWindow(ds, bounds, split) {
  const b = bounds.timeframes[ds.timeframe];
  if (!b) return null;
  const n = ds.times.length;
  const iTrainEnd = lowerBound(ds.times, Date.parse(b.trainEnd));
  const iValEnd = lowerBound(ds.times, Date.parse(b.validationEnd));
  let from;
  let to;
  if (split === 'train') { from = 0; to = iTrainEnd - 1; }
  else if (split === 'validation') { from = iTrainEnd; to = iValEnd - 1; }
  else { from = iValEnd; to = n - 1; }
  if (from > to || from >= n) return null;
  return { from: Math.max(0, from), to: Math.min(n - 1, to) };
}

// ═══════════════════ indicator แบบคำนวณครั้งเดียวต่อ dataset ═══════════════════

/**
 * สร้าง namespace indicators ปลอมที่ให้ "ค่าเท่าเดิมทุกบิต" แต่ไม่คำนวณซ้ำทุกแท่ง
 *
 * หลักการ: RSI/MACD/EMA/SMA/BollingerBands เป็น causal — ค่าที่ดัชนี i ขึ้นกับ
 * values[0..i] เท่านั้น การคำนวณบนชุดเต็มแล้วอ่านที่ดัชนี i จึงได้ลำดับการบวกคูณ
 * เหมือนกันเป๊ะกับการคำนวณบน prefix (ไม่ใช่ "เกือบเท่า" — เท่าระดับบิต)
 *
 * ที่ไม่ causal ตรง ๆ มีตัวเดียวคือ findSupportResistance เพราะมันวนถึง
 * length - lookback (ตัดท้ายทิ้ง) ผลจึงขึ้นกับความยาว prefix — แก้ด้วยการสะสม
 * รายการค่าที่ไม่ซ้ำแบบ append-only ตามลำดับดัชนีเดิม แล้วตัดตามจำนวนที่ "เห็นได้"
 * ณ ความยาวนั้น (ดูคำอธิบายในฟังก์ชัน)
 *
 * ATR กับ detectPatterns เรียกของจริงตรง ๆ เพราะอ่านแค่ 15 และ 3 แท่งท้าย
 * — ไม่ใช่คอขวด และการเรียกของจริงคือหลักประกันว่าไม่มีสำเนาให้เพี้ยน
 */
function buildMemoIndicators(real, candles) {
  const closes = candles.map((c) => c.close);
  const n = candles.length;
  const cache = new Map();

  // เช็คแบบ O(1) ว่าอาร์เรย์ที่เครื่องยนต์ส่งมาเป็น prefix ของชุดนี้จริง
  // (ถ้าวันหนึ่งมีคนแก้ engine-lab ให้ส่งอย่างอื่นเข้ามา จะพังเสียงดังทันที ไม่เพี้ยนเงียบ)
  const checkCloses = (arr) => {
    const L = arr.length;
    if (L > n) throw new Error(`memo indicators: ได้อาร์เรย์ยาว ${L} เกินชุดข้อมูล ${n}`);
    if (L > 0 && arr[L - 1] !== closes[L - 1]) {
      throw new Error('memo indicators: อาร์เรย์ที่ส่งมาไม่ใช่ prefix ของชุดข้อมูลนี้');
    }
    return L;
  };
  const checkCandles = (arr) => {
    const L = arr.length;
    if (L > n) throw new Error(`memo indicators: ได้แท่งยาว ${L} เกินชุดข้อมูล ${n}`);
    if (L > 0 && arr[L - 1] !== candles[L - 1]) {
      throw new Error('memo indicators: แท่งที่ส่งมาไม่ใช่ prefix ของชุดข้อมูลนี้');
    }
    return L;
  };
  const memo = (key, fn) => {
    let v = cache.get(key);
    if (v === undefined) { v = fn(); cache.set(key, v); }
    return v;
  };

  // ── findSupportResistance แบบสะสม ────────────────────────────────────────────
  //
  // ต้นฉบับ: วน i = lookback .. length-1-lookback เก็บ swing high/low ตามลำดับ i
  //          แล้ว uniq (ปัด 4 ตำแหน่ง, Set เก็บตัวที่เจอครั้งแรก) → slice(-3) → sort
  // ที่ prefix ยาว L ขอบบนของลูปคือ i <= L-1-lookback ซึ่งเป็น "คำนำหน้า" ของลูปเต็ม
  // รายการค่าไม่ซ้ำจึงโตแบบต่อท้ายอย่างเดียว (ค่าซ้ำไม่ขยับตำแหน่งของตัวเดิม)
  // เก็บดัชนีที่ค่านั้นถูกเห็นครั้งแรกไว้ แล้วนับว่ามีกี่ตัวที่ "เห็นทัน" ณ ความยาว L
  const srCache = new Map();
  const buildSR = (lookback) => {
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const resVals = []; const resFirst = []; const seenR = new Set();
    const supVals = []; const supFirst = []; const seenS = new Set();
    for (let i = lookback; i < n - lookback; i++) {
      let isSwingHigh = true;
      let isSwingLow = true;
      for (let j = 1; j <= lookback; j++) {
        if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isSwingHigh = false;
        if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isSwingLow = false;
      }
      if (isSwingHigh) {
        const v = Number(highs[i].toFixed(4));
        if (!seenR.has(v)) { seenR.add(v); resVals.push(v); resFirst.push(i); }
      }
      if (isSwingLow) {
        const v = Number(lows[i].toFixed(4));
        if (!seenS.has(v)) { seenS.add(v); supVals.push(v); supFirst.push(i); }
      }
    }
    // countAt[L] = จำนวนค่าที่ถูกเห็นครั้งแรกที่ดัชนี <= L-1-lookback
    const mkCount = (first) => {
      const arr = new Int32Array(n + 1);
      let p = 0;
      for (let L = 0; L <= n; L++) {
        const limit = L - 1 - lookback;
        while (p < first.length && first[p] <= limit) p++;
        arr[L] = p;
      }
      return arr;
    };
    return { resVals, supVals, resCount: mkCount(resFirst), supCount: mkCount(supFirst) };
  };

  return {
    RSI: (arr, p) => { const L = checkCloses(arr); void L; return memo(`RSI|${p}`, () => real.RSI(closes, p)); },
    EMA: (arr, p) => { checkCloses(arr); return memo(`EMA|${p}`, () => real.EMA(closes, p)); },
    SMA: (arr, p) => { checkCloses(arr); return memo(`SMA|${p}`, () => real.SMA(closes, p)); },
    MACD: (arr, f, s, g) => { checkCloses(arr); return memo(`MACD|${f}|${s}|${g}`, () => real.MACD(closes, f, s, g)); },
    BollingerBands: (arr, p, sd) => { checkCloses(arr); return memo(`BB|${p}|${sd}`, () => real.BollingerBands(closes, p, sd)); },
    findSupportResistance: (arr, lookback) => {
      const L = checkCandles(arr);
      let st = srCache.get(lookback);
      if (!st) { st = buildSR(lookback); srCache.set(lookback, st); }
      const rc = st.resCount[L];
      const sc = st.supCount[L];
      return {
        supports: st.supVals.slice(Math.max(0, sc - 3), sc).sort((a, b) => b - a),
        resistances: st.resVals.slice(Math.max(0, rc - 3), rc).sort((a, b) => a - b),
      };
    },
    detectPatterns: real.detectPatterns,
    determineTrend: real.determineTrend,
    ATR: real.ATR,

    // Stochastic กับ ADX เป็น causal รายดัชนีเหมือน RSI/MACD/BB — ค่าที่ i ขึ้นกับ 0..i
    // เท่านั้น (มีข้อพิสูจน์ในชุดทดสอบ scripts/test-indicators.mjs) จึงคำนวณบนชุดเต็ม
    // ครั้งเดียวแล้วอ่านที่ดัชนีของ prefix ได้ ผลเท่ากันระดับบิต
    //
    // ⚠ ADX ต้องเป็นแบบอนุกรม ไม่ใช่คืนค่าเดียวของแท่งท้าย ไม่งั้นห้องแล็บต้องเรียกซ้ำ
    //   ทุกแท่งซึ่งเป็น O(n²) และช้าจนรันจริงไม่ไหวบนคลังข้อมูลขนาดนี้
    Stochastic: (arr, k, d) => { checkCandles(arr); return memo(`STOCH|${k}|${d}`, () => real.Stochastic(candles, k, d)); },
    ADX: (arr, p) => { checkCandles(arr); return memo(`ADX|${p}`, () => real.ADX(candles, p)); },

    // volumeRatio อ่านแค่ period+1 แท่งท้าย — เรียกของจริงตรง ๆ เหมือน ATR
    // ไม่ใช่คอขวด และการเรียกของจริงคือหลักประกันว่าไม่มีสำเนาให้เพี้ยน
    volumeRatio: real.volumeRatio,
  };
}

// ═══════════════════════════════ walk-forward ═══════════════════════════════

/** แท่งที่เชื่อถือได้พอจะตัดสินการชน SL/TP — ตรงกับ isUsableBar ใน src/lib/backtest.ts */
function isUsableBar(c) {
  return (
    Number.isFinite(c.open) && c.open > 0 &&
    Number.isFinite(c.high) && c.high > 0 &&
    Number.isFinite(c.low) && c.low > 0 &&
    Number.isFinite(c.close) && c.close > 0 &&
    c.low <= c.high
  );
}

/**
 * ลูป walk-forward — เป็นสำเนาที่ควบคุมไว้ของ runBacktest ใน src/lib/backtest.ts
 *
 * ทำไมต้องสำเนา: runBacktest ผูกกับ generateSignal ตัวจริงตายตัว (จงใจ และถูกต้องแล้ว
 * สำหรับระบบจริง) แต่งานวิจัยต้องเปลี่ยน config ได้ และต้องจำกัดหน้าต่างเวลาที่เข้าไม้ได้
 * เพื่อแบ่ง train/validation/test — ทั้งสองอย่างทำกับต้นฉบับไม่ได้โดยไม่แก้ไฟล์จริง
 *
 * สิ่งที่เพิ่มจากต้นฉบับมีสามอย่างเท่านั้น:
 *   1. entryFrom/entryTo — จำกัด "แท่งที่เข้าไม้ได้" (ไม้ที่เปิดแล้วยังวิ่งออกนอกกรอบได้
 *      เหมือนชีวิตจริง — ตัดกลางคันคือการแต่งผล)
 *   2. ต้นทุนคิดเป็นสัดส่วนของราคาต่อไม้ แทน feesR ค่าเดียวทั้งชุด เพราะ 5 bps
 *      บนไม้ที่เสี่ยง 1% กับไม้ที่เสี่ยง 5% ไม่ใช่ R เท่ากัน
 *   3. บันทึก RR ที่สัญญาณ "เสนอ" ไว้ด้วย (คำนวณจากราคาของสัญญาณเอง ไม่ใช่ราคาเข้าจริง)
 * ตรรกะการชน SL/TP · ลำดับ gap · การนับ SL ก่อน TP · การกลับไปหาสัญญาณที่แท่งปิดไม้
 * ลอกมาตรงทุกบรรทัด และถูกพิสูจน์ด้วย --verify-engine ว่าให้ไม้เหมือนกันเป๊ะ
 */
function walkForward({ ds, engine, entryFrom, entryTo, maxHoldBars, minHistory, costFraction, costFractionBase = 0, riskModel = 'planned' }) {
  const { candles, symbol, name, market, timeframe } = ds;
  const trades = [];
  let skipped = 0;
  let signals = 0;

  const hardTo = Math.min(candles.length - 2, entryTo - 1);
  let i = Math.max(minHistory, entryFrom - 1);

  // prefix โตทีละแท่ง แทนการ slice ใหม่ทุกรอบ — slice คือ O(n) ต่อแท่ง = O(n²) ฟรี ๆ
  const prefix = candles.slice(0, Math.min(i + 1, candles.length));

  while (i <= hardTo) {
    while (prefix.length < i + 1) prefix.push(candles[prefix.length]);

    const sig = engine.generateSignal({ symbol, name, market, candles: prefix, timeframe });
    if (!sig || (sig.action !== 'BUY' && sig.action !== 'SELL')) { i++; continue; }
    signals++;

    const entryIndex = i + 1;
    const entryBar = candles[entryIndex];
    if (!isUsableBar(entryBar)) { skipped++; i++; continue; }

    const isLong = sig.action === 'BUY';
    const dir = isLong ? 1 : -1;
    const entry = entryBar.open;
    const stopLoss = sig.stop_loss;
    const takeProfit = sig.take_profit;

    // ── ตัวหารของ R: สองนิยาม วัดไว้ทั้งคู่เสมอ ──────────────────────────────
    // realizedRisk = ระยะจาก "ราคาเปิดแท่งถัดไป" ถึง SL — นิยามเดิม พังเพราะ gap กินระยะ
    //                จนตัวหารเกือบศูนย์ได้ (ดู report/metric-fix.md)
    // plannedRisk  = ระยะจาก "ราคาที่สัญญาณคิดไว้" (ปิดแท่ง i) ถึง SL — คือความเสี่ยงที่
    //                ผู้เทรดยอมรับตอนกดสั่ง และเป็นตัวที่ใช้คิดขนาดไม้จริง
    // ทั้งสองค่าถูกบันทึกลงทุกไม้ เพื่อให้เทียบผลของการเปลี่ยนนิยามได้โดยไม่ต้องรันซ้ำ
    const realizedRisk = Math.abs(entry - stopLoss);
    const plannedRisk = Math.abs(sig.entry_price - sig.stop_loss);
    const riskPerUnit = riskModel === 'realized' ? realizedRisk : plannedRisk;
    if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) { skipped++; i++; continue; }

    const lastHoldIndex = Math.min(entryIndex + maxHoldBars - 1, candles.length - 1);
    let exitIndex = -1;
    let exit = NaN;
    let exitReason = 'time_exit';
    let lastUsableIndex = entryIndex;

    for (let j = entryIndex; j <= lastHoldIndex; j++) {
      const bar = candles[j];
      if (!isUsableBar(bar)) continue;
      lastUsableIndex = j;
      if (isLong) {
        if (bar.open <= stopLoss) { exitIndex = j; exit = bar.open; exitReason = 'gap_stop'; break; }
        if (bar.open >= takeProfit) { exitIndex = j; exit = bar.open; exitReason = 'gap_target'; break; }
        if (bar.low <= stopLoss) { exitIndex = j; exit = stopLoss; exitReason = 'stop_loss'; break; }
        if (bar.high >= takeProfit) { exitIndex = j; exit = takeProfit; exitReason = 'take_profit'; break; }
      } else {
        if (bar.open >= stopLoss) { exitIndex = j; exit = bar.open; exitReason = 'gap_stop'; break; }
        if (bar.open <= takeProfit) { exitIndex = j; exit = bar.open; exitReason = 'gap_target'; break; }
        if (bar.high >= stopLoss) { exitIndex = j; exit = stopLoss; exitReason = 'stop_loss'; break; }
        if (bar.low <= takeProfit) { exitIndex = j; exit = takeProfit; exitReason = 'take_profit'; break; }
      }
    }

    if (exitIndex === -1) {
      exitIndex = lastUsableIndex;
      exit = candles[lastUsableIndex].close;
      exitReason = 'time_exit';
    }

    const pnlPerUnit = (exit - entry) * dir;
    const rGross = pnlPerUnit / riskPerUnit;
    // เก็บ R ของ "อีกนิยามหนึ่ง" ไว้ด้วยเสมอ — ตัวเลขเดียวกันทั้งเศษ ต่างกันแค่ตัวหาร
    // (ไม้ที่ realizedRisk = 0 จะได้ Infinity/NaN ตรงนี้ ซึ่งคือหลักฐานของปัญหา ไม่ใช่บั๊ก
    //  ตัวตรวจเครื่องวัดจะนับมันแยกเป็น "วัดด้วยนิยามเดิมไม่ได้")
    const rGrossRealized = realizedRisk > 0 ? pnlPerUnit / realizedRisk : NaN;
    const rGrossPlanned = plannedRisk > 0 ? pnlPerUnit / plannedRisk : NaN;
    // ต้นทุนคิดจากราคาเข้าจริง แล้วแปลงเป็นหน่วย R ของไม้นั้นเอง
    const costR = costFraction > 0 ? (costFraction * entry) / riskPerUnit : 0;
    // ต้นทุนที่สถานการณ์ base เสมอ — ใช้ตัดสินว่าไม้นี้ "เทรดได้จริงไหม" ซึ่งต้องเป็นนิยาม
    // เดียวกันทุกสถานการณ์ ไม่งั้นเปลี่ยน --cost แล้วกลุ่มตัวอย่างเปลี่ยนตาม เทียบกันไม่ได้
    const costRBase = costFractionBase > 0 ? (costFractionBase * entry) / riskPerUnit : 0;

    // RR ที่สัญญาณ "เสนอ" — วัดจากราคาของสัญญาณเอง (ราคาปิดแท่ง i) ไม่ใช่ราคาเข้าจริง
    // เพราะคำถามคือ "กติกาวาง TP/SL ไว้สมเหตุสมผลไหม" ไม่ใช่ "gap ทำอะไรกับไม้นี้"
    const sigRisk = Math.abs(sig.entry_price - sig.stop_loss);
    const sigReward = Math.abs(sig.take_profit - sig.entry_price);
    const rrPlanned = sigRisk > 0 && Number.isFinite(sigReward) ? sigReward / sigRisk : null;

    trades.push({
      symbol, market, timeframe,
      action: sig.action,
      strength: sig.strength,
      confidence: sig.confidence,
      entryIndex, exitIndex,
      entry, exit, stopLoss, takeProfit,
      exitReason,
      rGross,
      costR,
      costRBase,
      rNet: rGross - costR,
      rrPlanned,
      /** ระยะ SL คิดเป็นสัดส่วนของราคาเข้า — ตัวชี้ว่าไม้นี้มีตัวหารของ R ที่ใช้ได้จริงไหม */
      stopDistPct: riskPerUnit / entry,
      // ── วัตถุดิบสำหรับตรวจ/เทียบเครื่องวัด (ไม่ขึ้นกับ riskModel ที่เลือก) ──
      plannedRisk,
      realizedRisk,
      rGrossRealized,
      rGrossPlanned,
      /** ต้นทุนเป็น "เงินต่อหนึ่งหน่วยสินทรัพย์" — หารด้วยตัวหารไหนก็ได้ R ของนิยามนั้น */
      costMoney: costFraction * entry,
      costMoneyBase: costFractionBase * entry,
      /** ระยะเสี่ยงที่ "เหลือรอด" หลังราคาเปิดกระโดด = realized/planned (1 = ไม่มี gap) */
      riskKeepRatio: plannedRisk > 0 ? realizedRisk / plannedRisk : NaN,
      plannedStopDistPct: plannedRisk / sig.entry_price,
      realizedStopDistPct: realizedRisk / entry,
      holdBars: exitIndex - entryIndex,
      entryTime: entryBar.timestamp,
      exitTime: candles[exitIndex].timestamp,
      year: entryBar.timestamp.slice(0, 4),
    });

    i = exitIndex;
  }

  return { trades, skipped, signals };
}

// ═══════════════════════════════ ต้นทุนต่อชุด ═══════════════════════════════

function costFractionFor(meta, scenario, table) {
  if (scenario === 'zero') return 0;
  const bps = table.bySymbol[meta.symbol] ?? table.byMarket[meta.market];
  if (bps === undefined) throw new Error(`ไม่มีค่าประมาณต้นทุนสำหรับ ${meta.market}/${meta.symbol}`);
  const mult = scenario === 'pessimistic' ? table.pessimisticMultiplier : 1;
  return (bps * mult) / 10000;
}

// ═══════════════════════════════ สถิติ ═══════════════════════════════

function baseStats(rs) {
  const count = rs.length;
  if (count === 0) {
    return { count: 0, wins: 0, losses: 0, winRate: null, profitFactor: null, avgR: null,
      expectancyR: null, medianR: null, trimmedMeanR: null, maxDrawdownR: null,
      maxConsecutiveLosses: 0, grossWinR: 0, grossLossR: 0, sumR: 0, minR: null, maxR: null };
  }
  let wins = 0; let losses = 0; let sumR = 0; let grossWinR = 0; let grossLossR = 0;
  let equity = 0; let peak = 0; let maxDD = 0; let streak = 0; let maxStreak = 0;
  for (const r of rs) {
    sumR += r;
    if (r > 0) { wins++; grossWinR += r; } else if (r < 0) { losses++; grossLossR += -r; }
    streak = r < 0 ? streak + 1 : 0;
    if (streak > maxStreak) maxStreak = streak;
    equity += r;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;
  }
  const avgR = sumR / count;
  // ค่ากลางแบบทนทาน — จำเป็นเพราะ R เป็นอัตราส่วนที่ตัวหารเล็กได้ไม่จำกัด
  // ไม้เดียวที่ตัวหารเกือบศูนย์ลาก avgR ของทั้งชุดไปได้หลายร้อยหน่วย (วัดเจอจริง)
  const sorted = [...rs].sort((a, b) => a - b);
  const cut = Math.floor(count * 0.05);
  const kept = count - 2 * cut > 0 ? sorted.slice(cut, count - cut) : sorted;
  return {
    count, wins, losses,
    winRate: wins / count,
    profitFactor: grossLossR > 0 ? grossWinR / grossLossR : null,
    avgR,
    expectancyR: avgR,
    medianR: percentileOfSorted(sorted, 0.5),
    trimmedMeanR: kept.reduce((a, b) => a + b, 0) / kept.length,
    maxDrawdownR: maxDD,
    maxConsecutiveLosses: maxStreak,
    grossWinR, grossLossR, sumR,
    minR: sorted[0], maxR: sorted[count - 1],
  };
}

// ═══════════════════════ ตรวจเครื่องวัด (metric audit) ═══════════════════════
//
// คำถามเดียวที่หัวข้อนี้ตอบ: "ไม้เดียวย้ายค่าเฉลี่ยของทั้งชุดได้แค่ไหน"
// ถ้าไม้เดียวย้ายได้มากกว่าขนาดของผลที่เรากำลังตามหา (ระดับ 0.03 R/ไม้)
// การเปรียบเทียบ config ทุกครั้งหลังจากนั้นคือการเปรียบเทียบ "ว่าบังเอิญมีไม้พิเศษกี่ไม้"
// ไม่ใช่การเปรียบเทียบกฎ — และไม่มีทางรู้ได้เลยจากการดู avgR เฉย ๆ

/**
 * สถิติอิทธิพลของไม้เดียวต่อค่าเฉลี่ยของทั้งชุด
 *
 * maxLeaveOneOutShift = max |mean − mean_ที่ถอดไม้นั้นออก| = max |r_i − mean| / (n−1)
 * นี่คือ "เพดานของการที่ไม้เดียวจะเปลี่ยนข้อสรุป" ตรง ๆ ไม่ต้องตีความ
 */
function influenceAudit(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  const n = finite.length;
  if (!n) return null;
  const sum = finite.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const byAbs = [...finite].sort((a, b) => Math.abs(b) - Math.abs(a));
  const k = Math.max(1, Math.round(n * 0.001)); // ไม้ 0.1% ที่สุดขั้วที่สุด
  const topKSum = byAbs.slice(0, k).reduce((a, b) => a + b, 0);
  let maxShift = 0;
  let shiftR = null;
  if (n > 1) {
    for (const v of finite) {
      const s = Math.abs((mean - v) / (n - 1));
      if (s > maxShift) { maxShift = s; shiftR = v; }
    }
  }
  return {
    n,
    nonFinite: values.length - n,
    mean,
    sum,
    maxAbsR: byAbs[0],
    topKCount: k,
    topKSum,
    // "กำไรรวมทั้งชุดมาจากไม้ไม่กี่ไม้แค่ไหน" — เกิน 100% แปลว่าที่เหลือรวมกันติดลบ
    topKShareOfSum: sum !== 0 ? topKSum / sum : null,
    top1ShareOfSum: sum !== 0 ? byAbs[0] / sum : null,
    maxLeaveOneOutShift: maxShift,
    maxLeaveOneOutShiftR: shiftR,
  };
}

/**
 * ผู้เข้าแข่งขันทุกทางที่พิจารณา — ต้องรายงานทุกตัว ไม่ใช่เฉพาะตัวที่ชนะ
 * ทุกตัวคิดจากไม้ชุดเดียวกันเป๊ะ (เศษของ R เหมือนกันหมด ต่างกันแค่ตัวหาร/การทิ้ง/การตัด)
 * จึงเทียบกันได้ตรง ๆ ไม่มีปัญหา "คนละกลุ่มตัวอย่าง" ยกเว้นทางที่ตั้งใจทิ้งไม้ (ทาง ก)
 *
 *   denom = ตัวหารของ R · ต้นทุนต้องหารด้วยตัวหารเดียวกันเสมอ ไม่งั้นหน่วยไม่ตรงกัน
 *   keep  = เงื่อนไขที่ไม้ต้องผ่านถึงจะถูกนับ (null = นับทุกไม้)
 *   cap   = ตัดค่าสุดท้ายที่ ±cap (winsorize — ไม่ทิ้งไม้ แต่จำกัดน้ำหนักของมัน)
 */
const METRIC_CANDIDATES = [
  { id: 'A', label: 'เดิม: หารด้วยระยะจริงหลัง gap', denom: (t) => t.realizedRisk, keep: null, cap: null },
  { id: 'B', label: 'ก: เดิม + ทิ้งไม้ที่ระยะเหลือ < 20%', denom: (t) => t.realizedRisk, keep: (t) => t.riskKeepRatio >= 0.2, cap: null },
  { id: 'C', label: 'ข: เดิม + ตัดค่าที่ ±5', denom: (t) => t.realizedRisk, keep: null, cap: 5 },
  { id: 'D', label: 'ค: หารด้วยระยะที่ตั้งใจไว้', denom: (t) => t.plannedRisk, keep: null, cap: null },
  { id: 'E', label: 'ค+ข: ระยะที่ตั้งใจ + ตัดที่ ±10', denom: (t) => t.plannedRisk, keep: null, cap: 10 },
];

/**
 * คิดค่าของผู้เข้าแข่งขันหนึ่งรายจากไม้ทั้งชุด
 * net = true → หักต้นทุนก่อนตัด (ตัดทีหลังเสมอ เพราะ cap คือเพดานของ "ตัวเลขที่รายงาน")
 */
function candidateValues(trades, cand, { net }) {
  const out = [];
  for (const t of trades) {
    if (cand.keep && !cand.keep(t)) continue;
    const d = cand.denom(t);
    if (!(d > 0) || !Number.isFinite(d)) { out.push(NaN); continue; }
    let v = ((t.exit - t.entry) * (t.action === 'BUY' ? 1 : -1)) / d;
    if (net) v -= t.costMoney / d;
    if (cand.cap !== null) v = Math.max(-cand.cap, Math.min(cand.cap, v));
    out.push(v);
  }
  return out;
}

/**
 * ตรวจว่า "ทางที่เลือก" ไม่ได้ทำให้ผลดูดีขึ้นโดยการเขี่ยไม้ขาดทุนทิ้ง
 *
 * วิธีเดียวที่ตรวจได้คือดูองค์ประกอบบวก/ลบของไม้ที่ถูกกระทบ: ถ้าไม้ที่ถูกทิ้ง/ถูกตัด
 * เป็นไม้ขาดทุนแทบทั้งหมด แปลว่ากติกาที่ตั้งขึ้นกำลังเลือกข้าง ไม่ใช่แก้เครื่องวัด
 */
function fairnessCheck(all) {
  const dirOf = (t) => (t.action === 'BUY' ? 1 : -1);
  const netOn = (t, d) => (d > 0 && Number.isFinite(d) ? ((t.exit - t.entry) * dirOf(t) - t.costMoney) / d : NaN);
  const rOld = (t) => netOn(t, t.realizedRisk);
  const rNew = (t) => netOn(t, t.plannedRisk);
  const share = (a, b) => (b > 0 ? a / b : null);

  const group = (pred, fn) => {
    const g = all.filter(pred);
    const vals = g.map(fn).filter(Number.isFinite);
    const pos = vals.filter((v) => v > 0).length;
    return { count: g.length, shareOfAll: share(g.length, all.length),
      sumR: vals.reduce((a, b) => a + b, 0), positive: pos, sharePositive: share(pos, vals.length) };
  };

  const dropped = all.filter((t) => !(t.riskKeepRatio >= 0.2));
  const clipHiOld = all.filter((t) => rOld(t) > 5).length;
  const clipLoOld = all.filter((t) => rOld(t) < -5).length;
  const clipHiNew = all.filter((t) => rNew(t) > 10).length;
  const clipLoNew = all.filter((t) => rNew(t) < -10).length;

  // ไม้ที่นิยามใหม่ให้ค่าต่างจากเดิมอย่างมีนัย — แยกว่า "ดีขึ้น" หรือ "แย่ลง"
  const moved = all.filter((t) => Math.abs(rNew(t) - rOld(t)) >= 0.1 || !Number.isFinite(rOld(t)));
  const better = moved.filter((t) => rNew(t) > rOld(t) || !Number.isFinite(rOld(t))).length;

  return {
    total: all.length,
    // gap กินระยะเสี่ยง (ราคาเปิดวิ่งเข้าหา SL) vs gap ถ่างระยะ (เปิดหนีจาก SL)
    gapAte: group((t) => t.riskKeepRatio < 1, rOld),
    gapWidened: group((t) => t.riskKeepRatio > 1, rOld),
    // ทาง ก: ไม้ที่จะถูกทิ้ง — ต้องดูว่าเป็นบวก/ลบสัดส่วนเท่าไรทั้งสองนิยาม
    droppedByKeep20: {
      ...group((t) => !(t.riskKeepRatio >= 0.2), rOld),
      sumRUnderNew: dropped.map(rNew).filter(Number.isFinite).reduce((a, b) => a + b, 0),
      sharePositiveUnderNew: share(dropped.map(rNew).filter((v) => v > 0).length,
        dropped.map(rNew).filter(Number.isFinite).length),
    },
    // ทาง ข: ไม้ที่จะถูกตัดค่า — บนกับล่างต้องไม่เอียงข้างเดียว
    clippedOld5: { above: clipHiOld, below: clipLoOld },
    clippedNew10: { above: clipHiNew, below: clipLoNew },
    // ทาง ค: ไม้ที่ค่าขยับ — ถ้าขยับแต่ "ดีขึ้น" ทั้งหมด แปลว่ากำลังโกงตัวเอง
    movedByModel: { count: moved.length, shareOfAll: share(moved.length, all.length),
      better, worse: moved.length - better, shareBetter: share(better, moved.length) },
    // สรุปทิศทางรวม: นิยามใหม่ทำให้ค่าเฉลี่ยขยับไปทางไหน
    meanOld: all.map(rOld).filter(Number.isFinite).reduce((a, b, _i, arr) => a + b / arr.length, 0),
    meanNew: all.map(rNew).filter(Number.isFinite).reduce((a, b, _i, arr) => a + b / arr.length, 0),
  };
}

/**
 * bootstrap ช่วงความเชื่อมั่นของ avg R — ตัวเลขที่สำคัญที่สุดในรายงานทั้งฉบับ
 *
 * ทำไมต้องมี: PF 1.05 จาก 40 ไม้ กับ PF 0.98 จาก 40 ไม้ แยกกันไม่ออกด้วยตาเปล่า
 * ทั้งคู่คือ "ไม่รู้" แต่ค่ากลางหลอกให้รู้สึกว่ารู้ ช่วงความเชื่อมั่นทำให้เห็นว่าเรารู้แค่ไหน
 *
 * ทำสองแบบเพราะสองแบบตอบคนละคำถาม:
 *  · ราย-ไม้ (iid) — สมมติว่าไม้แต่ละไม้เป็นอิสระต่อกัน ให้ช่วงที่ "แคบเกินจริง"
 *    เพราะไม้ในสัญลักษณ์เดียวกันสัมพันธ์กันสูง (ตลาดเดียว เทรนด์เดียว ยุคเดียว)
 *  · ราย-สัญลักษณ์ (cluster) — สุ่มทั้งสัญลักษณ์ทั้งก้อน จำนวนเท่าเดิม แล้วรวมไม้ทั้งหมด
 *    ของสัญลักษณ์ที่ถูกหยิบ ให้ช่วงที่กว้างกว่าและซื่อสัตย์กว่าเมื่อจะสรุปว่า
 *    "กติกานี้ใช้ได้กับสินทรัพย์ทั่วไป" ไม่ใช่แค่กับ 58 ตัวนี้
 */
function bootstrapMeanCI(values, { B, seed, clusters = null }) {
  if (!values.length) return null;
  const rnd = mulberry32(seed);
  const means = new Array(B);
  if (clusters) {
    const keys = [...clusters.keys()];
    const sums = keys.map((k) => clusters.get(k).sum);
    const cnts = keys.map((k) => clusters.get(k).count);
    const G = keys.length;
    for (let b = 0; b < B; b++) {
      let s = 0; let c = 0;
      for (let g = 0; g < G; g++) {
        const pick = (rnd() * G) | 0;
        s += sums[pick]; c += cnts[pick];
      }
      means[b] = c > 0 ? s / c : 0;
    }
  } else {
    const n = values.length;
    for (let b = 0; b < B; b++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += values[(rnd() * n) | 0];
      means[b] = s / n;
    }
  }
  means.sort((a, b) => a - b);
  let nonPositive = 0;
  for (const m of means) if (m <= 0) nonPositive++;
  return {
    B,
    lo95: percentileOfSorted(means, 0.025),
    hi95: percentileOfSorted(means, 0.975),
    median: percentileOfSorted(means, 0.5),
    pLE0: nonPositive / B,
  };
}

function clusterMap(trades, key, field) {
  const m = new Map();
  for (const t of trades) {
    const k = key(t);
    let e = m.get(k);
    if (!e) { e = { sum: 0, count: 0 }; m.set(k, e); }
    e.sum += t[field];
    e.count++;
  }
  return m;
}

/** จัดกลุ่มไม้ตามคีย์ แล้วออกสถิติ + CI ของแต่ละกลุ่ม */
function groupStats(trades, keyFn, field, { B, seed }) {
  const groups = new Map();
  for (const t of trades) {
    const k = keyFn(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  let s = seed;
  for (const [k, ts] of groups) {
    const rs = ts.map((t) => t[field]);
    const st = baseStats(rs);
    s = (s + 0x9e3779b9) >>> 0;
    out.push({ key: k, ...st, ci: bootstrapMeanCI(rs, { B, seed: s }) });
  }
  out.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return out;
}

// ═══════════════════════════ ตัวรันขนาน (worker) ═══════════════════════════

async function runDatasetsInWorkers(jobs, files, payload, onProgress) {
  const results = [];
  let cursor = 0;
  let done = 0;
  const nWorkers = Math.max(1, Math.min(jobs, files.length));

  await new Promise((resolve, reject) => {
    let alive = 0;
    let failed = false;
    const spawn = () => {
      const w = new Worker(SELF, { workerData: { ...payload, mode: payload.mode } });
      alive++;
      const next = () => {
        if (cursor >= files.length) { w.postMessage({ cmd: 'done' }); return; }
        w.postMessage({ cmd: 'run', file: files[cursor++] });
      };
      w.on('message', (msg) => {
        if (msg.ready) { next(); return; }
        if (msg.error) { failed = true; reject(new Error(`${msg.file}: ${msg.error}`)); w.terminate(); return; }
        results.push(msg.result);
        done++;
        if (onProgress) onProgress(done, files.length, msg.result);
        next();
      });
      w.on('error', (e) => { failed = true; reject(e); });
      w.on('exit', () => {
        alive--;
        if (alive === 0 && !failed) resolve();
      });
    };
    for (let k = 0; k < nWorkers; k++) spawn();
  });

  return results;
}

// ─────────────────────────── ฝั่ง worker ───────────────────────────

if (!isMainThread) {
  const wd = workerData;
  const mods = await loadSrcModules(
    wd.mode === 'verify'
      ? ['src/lib/indicators.ts', 'src/lib/signal-engine.ts', 'src/lib/backtest.ts']
      : ['src/lib/indicators.ts']
  );
  const real = mods.indicators;

  parentPort.on('message', (msg) => {
    if (msg.cmd === 'done') { parentPort.close(); return; }
    try {
      const ds = loadDataset(msg.file);
      if (wd.mode === 'verify') {
        parentPort.postMessage({ result: verifyOne(ds, real, mods.backtest, wd) });
      } else {
        parentPort.postMessage({ result: runOne(ds, real, wd) });
      }
    } catch (err) {
      parentPort.postMessage({ error: err?.stack ?? String(err), file: msg.file });
    }
  });
  parentPort.postMessage({ ready: true });
}

/** รันหนึ่ง dataset ครบทุก split ที่ขอ */
function runOne(ds, real, wd) {
  const engine = createLabEngine(buildMemoIndicators(real, ds.candles), wd.configPatch);
  const costFraction = costFractionFor(ds, wd.costScenario, wd.costTable);
  const costFractionBase = costFractionFor(ds, 'base', wd.costTable);
  const out = { symbol: ds.symbol, market: ds.market, timeframe: ds.timeframe, verdict: ds.verdict,
    bars: ds.candles.length, trimmedByUsable: ds.trimmedByUsable, splits: {} };
  for (const split of wd.splits) {
    let win = entryWindow(ds, wd.bounds, split);
    if (win && split === 'test' && wd.testCleanFrom) {
      const from = Math.max(win.from, lowerBound(ds.times, Date.parse(wd.testCleanFrom)));
      win = from > win.to ? null : { from, to: win.to };
    }
    if (!win) { out.splits[split] = { trades: [], skipped: 0, signals: 0, bars: 0 }; continue; }
    const t0 = performance.now();
    const r = walkForward({
      ds, engine,
      entryFrom: win.from, entryTo: win.to,
      maxHoldBars: wd.maxHoldBars, minHistory: wd.minHistory,
      costFraction, costFractionBase, riskModel: wd.riskModel,
    });
    out.splits[split] = { ...r, bars: win.to - win.from + 1, ms: performance.now() - t0,
      from: ds.candles[win.from]?.timestamp ?? null, to: ds.candles[win.to]?.timestamp ?? null };
  }
  out.costFraction = costFraction;
  return out;
}

/** เทียบลูปเร็ว + memo indicators กับ runBacktest ตัวจริง ไม้ต่อไม้ ทุกฟิลด์ */
function verifyOne(ds, real, backtestMod, wd) {
  const naive = backtestMod.runBacktest({
    symbol: ds.symbol, name: ds.name, market: ds.market, timeframe: ds.timeframe,
    candles: ds.candles, maxHoldBars: wd.maxHoldBars, minHistory: wd.minHistory,
    riskModel: wd.riskModel,
  });
  const engine = createLabEngine(buildMemoIndicators(real, ds.candles), {});
  const fast = walkForward({
    ds, engine, entryFrom: 0, entryTo: ds.candles.length - 1,
    maxHoldBars: wd.maxHoldBars, minHistory: wd.minHistory, costFraction: 0,
    riskModel: wd.riskModel,
  });

  const diffs = [];
  if (naive.trades.length !== fast.trades.length) {
    diffs.push(`จำนวนไม้ต่างกัน: ของจริง ${naive.trades.length} · ลูปเร็ว ${fast.trades.length}`);
  }
  if (naive.skipped !== fast.skipped) {
    diffs.push(`skipped ต่างกัน: ของจริง ${naive.skipped} · ลูปเร็ว ${fast.skipped}`);
  }
  const fields = ['action', 'entryIndex', 'exitIndex', 'entry', 'exit', 'stopLoss', 'takeProfit',
    'exitReason', 'holdBars', 'entryTime', 'exitTime', 'confidence', 'strength',
    // ตัวหารของ R ทั้งสองนิยาม ต้องตรงกันด้วย ไม่งั้นสำเนาอาจใช้ตัวหารคนละตัวโดยไม่มีใครรู้
    'plannedRisk', 'realizedRisk'];
  const m = Math.min(naive.trades.length, fast.trades.length);
  for (let k = 0; k < m && diffs.length < 20; k++) {
    const a = naive.trades[k];
    const b = fast.trades[k];
    for (const f of fields) {
      if (a[f] !== b[f]) diffs.push(`ไม้ที่ ${k} ฟิลด์ ${f}: ของจริง ${a[f]} · ลูปเร็ว ${b[f]}`);
    }
    if (a.r !== b.rGross) diffs.push(`ไม้ที่ ${k} ฟิลด์ r: ของจริง ${a.r} · ลูปเร็ว ${b.rGross}`);
  }
  return { symbol: ds.symbol, market: ds.market, timeframe: ds.timeframe,
    bars: ds.candles.length, trades: naive.trades.length, diffs };
}

// ═══════════════════════════════ รายงาน ═══════════════════════════════

function renderStatsLine(label, st, ci, width = 22) {
  return `${pad(label, width)} ${padL(st.count, 6)} ${padL(pct(st.winRate), 7)} ${padL(n2(st.avgR), 9)} `
    + `${padL(ci ? `[${n2(ci.lo95)}, ${n2(ci.hi95)}]` : '-', 22)} ${padL(n2(st.profitFactor, 3), 8)} `
    + `${padL(n2(st.maxDrawdownR, 1), 9)} ${padL(n2(st.sumR, 1), 9)}`;
}

const STATS_HEADER = `${pad('กลุ่ม', 22)} ${padL('ไม้', 6)} ${padL('ชนะ', 7)} ${padL('avgR', 9)} ${padL('CI95 ของ avgR', 22)} ${padL('PF', 8)} ${padL('maxDD(R)', 9)} ${padL('รวม R', 9)}`;

function renderBreakdown(title, rows) {
  const lines = [`── ${title} ──`, STATS_HEADER];
  for (const r of rows) lines.push(renderStatsLine(r.key, r, r.ci));
  return lines.join('\n');
}

function buildReport(ctx) {
  const L = [];
  const W = (s = '') => L.push(s);

  W('═'.repeat(110));
  W('รายงานพื้นฐาน — เครื่องยนต์สัญญาณปัจจุบัน วัดบนคลังข้อมูลวิจัย');
  W('═'.repeat(110));
  W(`สร้างเมื่อ            : ${ctx.generatedAt}`);
  W(`git                   : ${ctx.git}`);
  W(`ป้ายการทดลอง          : ${ctx.tag}`);
  W(`config ที่ต่างจากต้นฉบับ: ${Object.keys(ctx.configDiff).length === 0 ? 'ไม่ต่าง (= src/lib/signal-engine.ts)' : JSON.stringify(ctx.configDiff)}`);
  W(`split ที่วัด           : ${ctx.splits.join(', ')}`);
  W(`ชุดข้อมูล              : ${ctx.datasetCount} ชุด (${ctx.barsTotal.toLocaleString()} แท่งที่ใช้ได้หลังตัดตาม quality.usable.from)`);
  W(`maxHoldBars           : ${ctx.maxHoldBars} แท่ง · minHistory ${ctx.minHistory} แท่ง`);
  W(`ตัวหารของ R (riskModel): ${ctx.riskModel === 'planned'
    ? 'planned — ระยะจากราคาที่สัญญาณคิดไว้ (ปิดแท่งก่อนเข้า) ถึง SL = ความเสี่ยงที่ยอมรับตอนตัดสินใจ'
    : 'realized — ระยะจากราคาเปิดจริง (หลัง gap) ถึง SL = นิยามเดิมที่พังจากไม้ตัวหารเกือบศูนย์'}`);
  W(`สถานการณ์ต้นทุน        : ${ctx.costScenario}`);
  W(`เวลารันจริง            : ${(ctx.elapsedMs / 1000).toFixed(1)} วินาที (worker ${ctx.jobs} ตัว)`);
  W('');

  W('── เส้นแบ่ง train / validation / test (ตัดตามเวลา ไม่สุ่ม) ──');
  for (const [tf, b] of Object.entries(ctx.bounds.timeframes)) {
    W(`  ${tf}: ${b.first.slice(0, 10)} → ${b.last.slice(0, 10)} รวม ${b.bars.toLocaleString()} แท่ง`);
    W(`      train      < ${b.trainEnd.slice(0, 10)}  (${b.barsTrain.toLocaleString()} แท่ง)`);
    W(`      validation < ${b.validationEnd.slice(0, 10)}  (${b.barsValidation.toLocaleString()} แท่ง)`);
    W(`      test       >= ${b.validationEnd.slice(0, 10)}  (${b.barsTest.toLocaleString()} แท่ง)  ← ห้ามแตะจนกว่าจะปรับเสร็จ`);
  }
  if (ctx.bounds.overlaps?.length) {
    W('');
    W('  ⚠ รอยรั่วข้ามกรอบเวลาที่เส้นแบ่งรายกรอบเวลาแก้ไม่ได้:');
    for (const o of ctx.bounds.overlaps) W(`    · ${o.note}`);
    W('    แปลว่า: ถ้าปรับค่าโดยดูผลของทุกกรอบเวลา ส่วนของ test ที่ "ไม่เคยถูกเห็นเลยจริง ๆ"');
    W(`    คือตั้งแต่ ${ctx.bounds.cleanTestFrom.slice(0, 10)} เป็นต้นไปเท่านั้น — บังคับได้ด้วย --test-clean-only`);
    W('    ถ้าปรับค่าด้วย 1D อย่างเดียว (--timeframes=1D) test ของ 1D สะอาดทั้งช่วง');
    W(`    รอบนี้ใช้: ${ctx.testCleanFrom ? `จำกัด test ตั้งแต่ ${ctx.testCleanFrom.slice(0, 10)}` : 'เต็มช่วง test ของแต่ละกรอบเวลา'}`);
  }
  W('');
  W('  ทำไมตัวเลขที่วัดบนข้อมูลที่ใช้ปรับค่าถึงไม่มีความหมาย:');
  W('  เครื่องยนต์นี้มีปุ่มปรับหลายสิบปุ่ม ถ้าลอง 50 แบบบนข้อมูลชุดเดิมแล้วเลือกแบบที่ดีที่สุด');
  W('  ค่าที่ได้คือ "ค่าสูงสุดจาก 50 การสุ่ม" ซึ่งเป็นบวกได้แม้เครื่องยนต์ไม่มี edge เลย');
  W('  ตัวเลขบน train จึงบอกได้แค่ว่า "พอดีกับอดีตแค่ไหน" ไม่ได้บอกว่าจะได้อะไรในอนาคต');
  W('');

  for (const split of ctx.splits) {
    const s = ctx.bySplit[split];
    W('━'.repeat(110));
    W(`ชุด ${split.toUpperCase()} — ${s.allTrades.length.toLocaleString()} ไม้ที่เครื่องยนต์ออกสัญญาณและเข้าไม้ได้`);
    W('━'.repeat(110));
    if (!s.allTrades.length) { W('  ไม่มีไม้ในชุดนี้'); W(''); continue; }

    const cohortBlock = (c) => {
      W(`│ ── ${c.label} (${c.trades.length.toLocaleString()} ไม้) ──`);
      for (const mode of ['gross', 'net']) {
        const st = c[mode].stats;
        const ciT = c[mode].ciTrade;
        const ciC = c[mode].ciCluster;
        W(`│  ${mode === 'gross' ? 'ยังไม่หักต้นทุน  ' : `หักต้นทุน (${ctx.costScenario})`}  avgR ${padL(n2(st.avgR), 10)}  มัธยฐาน ${padL(n2(st.medianR), 8)}  ตัดหัวท้าย 5% ${padL(n2(st.trimmedMeanR), 8)}`);
        W(`│      CI95 ราย-ไม้       [${n2(ciT.lo95)}, ${n2(ciT.hi95)}]   P(avgR<=0) = ${pct(ciT.pLE0, 1)}`);
        W(`│      CI95 ราย-สัญลักษณ์ [${n2(ciC.lo95)}, ${n2(ciC.hi95)}]   P(avgR<=0) = ${pct(ciC.pLE0, 1)}`);
        W(`│      PF ${n2(st.profitFactor, 3)}  ชนะ ${pct(st.winRate)}  รวม R ${n2(st.sumR, 1)}  maxDD ${n2(st.maxDrawdownR, 1)} R  แพ้ติดกันสูงสุด ${st.maxConsecutiveLosses}  R ต่ำสุด/สูงสุด ${n2(st.minR, 1)}/${n2(st.maxR, 1)}`);
      }
      W('│');
    };

    W('┌─ ตัวเลขที่สำคัญที่สุด ────────────────────────────────────────────────────────────┐');
    cohortBlock(s.cohortAll);
    if (s.rejectedCount > 0) {
      W(`│ ⚠ ในนั้นมี ${s.rejectedCount.toLocaleString()} ไม้ (${pct(s.rejectedShare, 2)}) ที่ระยะ SL แคบกว่าต้นทุนรอบเดียว = เทรดจริงไม่ได้`);
      W(`│   ไม้พวกนี้มี R ที่ตัวหารเกือบศูนย์ จึงลากค่าเฉลี่ยของทั้งชุดไปได้ทั้งสองทาง`);
      W(`│   (รวม R ของเฉพาะไม้กลุ่มนี้ = ${n2(s.rejectedSumRNet, 1)})  ← ดูตาราง "ไม้สุดขั้ว" ด้านล่างเป็นหลักฐาน`);
    } else {
      W(`│ ไม่มีไม้ที่ระยะ SL แคบกว่าต้นทุนรอบเดียวเลย (0 ไม้) → "ทุกไม้" กับ "ไม้ที่เทรดได้จริง" เป็นกลุ่มเดียวกัน`);
      W(`│ ตัวเลขข้างบนจึงไม่ได้ผ่านการคัดกลุ่มใด ๆ — ไม่มีคำว่า "กลุ่มที่ใจดีกว่า" ให้ต้องอธิบายอีก`);
      if (ctx.riskModel === 'planned') {
        W(`│ (ตัวหาร planned วัดจากราคาที่สัญญาณเห็น ระยะ SL จึงถูกล็อกก่อนรู้ gap และมีพื้นเชิงโครงสร้าง`);
        W(`│  จากกติกาของ signal-engine เอง: ระดับ × 0.995/1.005 หรือ 1.5×ATR — p01 ที่วัดได้คือ ${n2(s.stopDist.p01 * 100, 3)}% ของราคา)`);
      }
    }
    W('│');
    cohortBlock(s.cohortTradeable);
    W(`│ ต้นทุนเฉลี่ยที่หักในกลุ่มที่เทรดได้จริง = ${n2(s.cohortTradeable.avgCostR)} R ต่อไม้ (มัธยฐาน ${n2(s.cohortTradeable.medCostR)} R)`);
    W('└──────────────────────────────────────────────────────────────────────────────────┘');
    W('');
    W(s.rejectedCount > 0
      ? `  ตีความ (ยืนบนกลุ่มที่เทรดได้จริง ซึ่งเป็นกลุ่มที่ใจดีกว่า):`
      : `  ตีความ (ยืนบนไม้ทุกไม้ ไม่มีการคัดกลุ่ม):`);
    W(`  ${s.verdictText}`);
    W('');

    W('── ระยะ SL คิดเป็น % ของราคาเข้า (ตัวหารของ R) ──');
    const q = s.stopDist;
    W(`  ต่ำสุด ${(q.min * 100).toExponential(2)}%  ·  p01 ${n2(q.p01 * 100, 3)}%  ·  p10 ${n2(q.p10 * 100, 3)}%  ·  มัธยฐาน ${n2(q.p50 * 100, 3)}%  ·  p90 ${n2(q.p90 * 100, 3)}%  ·  สูงสุด ${n2(q.max * 100, 2)}%`);
    W(`  ไม้ที่ระยะ SL < 0.1% ของราคา = ${pct(q.shareBelow01pct, 2)} · ต้นทุนกิน >= 25% ของ R = ${pct(q.shareCostROver025, 2)} · >= 50% = ${pct(q.shareCostROver05, 2)}`);
    W('');

    W('── ไม้สุดขั้ว (หลักฐานว่าค่าเฉลี่ยแบบดิบเชื่อไม่ได้) ──');
    W(`${pad('', 6)} ${pad('สัญลักษณ์', 12)} ${pad('tf', 4)} ${pad('วันเข้า', 12)} ${padL('ระยะ SL', 12)} ${padL('rGross', 12)} ${padL('costR', 12)} ${padL('rNet', 12)}`);
    for (const t of s.worstTrades) {
      W(`${pad('แย่สุด', 6)} ${pad(t.symbol, 12)} ${pad(t.timeframe, 4)} ${pad(t.entryTime.slice(0, 10), 12)} ${padL(`${(t.stopDistPct * 100).toExponential(2)}%`, 12)} ${padL(n2(t.rGross, 2), 12)} ${padL(n2(t.costR, 2), 12)} ${padL(n2(t.rNet, 2), 12)}`);
    }
    for (const t of s.bestTrades) {
      W(`${pad('ดีสุด', 6)} ${pad(t.symbol, 12)} ${pad(t.timeframe, 4)} ${pad(t.entryTime.slice(0, 10), 12)} ${padL(`${(t.stopDistPct * 100).toExponential(2)}%`, 12)} ${padL(n2(t.rGross, 2), 12)} ${padL(n2(t.costR, 2), 12)} ${padL(n2(t.rNet, 2), 12)}`);
    }
    W('');

    // ── ตรวจเครื่องวัด ──
    W('── ตรวจเครื่องวัด: ไม้เดียวย้ายค่าเฉลี่ยทั้งชุดได้แค่ไหน (วัดบนไม้ชุดเดียวกันทุกทาง) ──');
    W(`${pad('ทาง', 34)} ${padL('ไม้', 7)} ${padL('avgR', 9)} ${padL('|R| สูงสุด', 12)} ${padL('ไม้เดียวย้าย avgR ได้', 20)} ${padL('0.1% สุดขั้ว = กี่ % ของรวม', 26)}`);
    for (const m of s.metricAudit) {
      const a = m.net;
      if (!a) { W(`${pad(m.label, 34)} ${padL('—', 7)}`); continue; }
      W(`${pad(m.label, 34)} ${padL(a.n.toLocaleString(), 7)} ${padL(n2(a.mean), 9)} ${padL(n2(Math.abs(a.maxAbsR), 1), 12)} `
        + `${padL(n2(a.maxLeaveOneOutShift, 5), 20)} ${padL(a.topKShareOfSum === null ? 'n/a' : pct(a.topKShareOfSum, 1), 26)}`);
    }
    W('  (ตัวเลขทุกช่องเป็น R หลังหักต้นทุน · "ไม้เดียวย้าย avgR ได้" = max |avgR − avgR ที่ถอดไม้นั้นออก|)');
    W(`  ขนาดของผลที่งานวิจัยรอบนี้ตามหาอยู่ที่ระดับ 0.03 R/ไม้ — ทางไหนที่ "ไม้เดียวย้ายได้" ใกล้เคียงเลขนั้น`);
    W('  แปลว่าการเทียบ config สองแบบด้วยเครื่องวัดนั้น คือการเทียบว่าบังเอิญมีไม้พิเศษกี่ไม้');
    W('');

    const f = s.fairness;
    W('── ตรวจความเป็นธรรมของการแก้ (แก้แล้วต้องไม่ใช่แค่เขี่ยไม้ขาดทุนทิ้ง) ──');
    W(`  ไม้ที่ราคาเปิดกระโดด "กิน" ระยะเสี่ยง  ${padL(f.gapAte.count.toLocaleString(), 7)} (${pct(f.gapAte.shareOfAll, 1)}) · เป็นไม้กำไร ${pct(f.gapAte.sharePositive, 1)}`);
    W(`  ไม้ที่ราคาเปิดกระโดด "ถ่าง" ระยะเสี่ยง ${padL(f.gapWidened.count.toLocaleString(), 7)} (${pct(f.gapWidened.shareOfAll, 1)}) · เป็นไม้กำไร ${pct(f.gapWidened.sharePositive, 1)}`);
    W(`  ทาง ก ทิ้งไม้ที่ระยะเหลือ < 20%:      ${padL(f.droppedByKeep20.count.toLocaleString(), 7)} (${pct(f.droppedByKeep20.shareOfAll, 2)}) · ในนั้นเป็นไม้กำไร ${pct(f.droppedByKeep20.sharePositive, 1)} (นิยามเดิม) / ${pct(f.droppedByKeep20.sharePositiveUnderNew, 1)} (นิยามใหม่)`);
    W(`      รวม R ของไม้ที่จะถูกทิ้ง = ${n2(f.droppedByKeep20.sumR, 1)} (นิยามเดิม) / ${n2(f.droppedByKeep20.sumRUnderNew, 1)} (นิยามใหม่)`);
    W(`  ทาง ข ตัดที่ ±5 บนนิยามเดิม:          ตัดจากข้างบน ${f.clippedOld5.above} ไม้ · จากข้างล่าง ${f.clippedOld5.below} ไม้`);
    W(`  ตัดที่ ±10 บนนิยามใหม่:               ตัดจากข้างบน ${f.clippedNew10.above} ไม้ · จากข้างล่าง ${f.clippedNew10.below} ไม้`);
    W(`  ทาง ค เปลี่ยนค่าไม้ไปอย่างมีนัย (>= 0.1R): ${f.movedByModel.count.toLocaleString()} ไม้ (${pct(f.movedByModel.shareOfAll, 1)})`);
    W(`      ในนั้น "ดีขึ้น" ${f.movedByModel.better.toLocaleString()} ไม้ (${pct(f.movedByModel.shareBetter, 1)}) · "แย่ลง" ${f.movedByModel.worse.toLocaleString()} ไม้`);
    W(`  ค่าเฉลี่ยทั้งชุดขยับจาก ${n2(f.meanOld)} (นิยามเดิม) เป็น ${n2(f.meanNew)} (นิยามใหม่) = ${n2(f.meanNew - f.meanOld)}`);
    W('');

    W(`  ตารางแยกกลุ่มทุกตารางต่อจากนี้คิดจาก "กลุ่มที่เทรดได้จริง" ${s.trades.length.toLocaleString()} ไม้ และเป็น R หลังหักต้นทุน`);
    W('');
    for (const [title, rows] of s.breakdowns) W(`${renderBreakdown(title, rows)}\n`);

    W('── RR ที่สัญญาณเสนอ (|TP-entry| / |entry-SL|, คิดจากราคาของสัญญาณเอง) ──');
    const rr = s.rr;
    W(`  ไม้ที่วัด RR ได้ ${rr.count.toLocaleString()} · เฉลี่ย ${n2(rr.mean, 2)} · มัธยฐาน ${n2(rr.p50, 2)}`);
    W(`  p10 ${n2(rr.p10, 2)} · p25 ${n2(rr.p25, 2)} · p50 ${n2(rr.p50, 2)} · p75 ${n2(rr.p75, 2)} · p90 ${n2(rr.p90, 2)}`);
    W(`  สัดส่วน RR < 0.5 = ${pct(rr.lt05)} · RR < 1 = ${pct(rr.lt1)} · RR >= 2 = ${pct(rr.ge2)}`);
    W('');
    W(`${renderBreakdown('avg R แยกตามช่วง RR ที่เสนอ', s.byRRBucket)}\n`);

    W('── เหตุผลการออก ──');
    W(`${pad('เหตุผล', 22)} ${padL('ไม้', 8)} ${padL('สัดส่วน', 9)} ${padL('avgR', 9)} ${padL('รวม R', 10)}`);
    for (const r of s.byExit) {
      W(`${pad(r.key, 22)} ${padL(r.count, 8)} ${padL(pct(r.count / s.trades.length), 9)} ${padL(n2(r.avgR), 9)} ${padL(n2(r.sumR, 1), 10)}`);
    }
    W('');
    W('── การถือ ──');
    W(`  holdBars เฉลี่ย ${n2(s.avgHold, 2)} แท่ง · มัธยฐาน ${s.medHold} · สูงสุด ${s.maxHold} (เพดาน ${ctx.maxHoldBars - 1})`);
    W('');
  }

  W('━'.repeat(110));
  W('ที่มาของตัวเลขต้นทุน (ทุกตัวเป็นการประมาณ ไม่ใช่ใบเสร็จจริง)');
  W('━'.repeat(110));
  W(`  หน่วย: basis point ของมูลค่าสถานะ ต่อการเข้า-ออกครบหนึ่งรอบ (รวมสเปรด + ค่าคอม + สลิปเพจ)`);
  for (const [mk, bps] of Object.entries(COST_BPS.byMarket)) W(`  ${pad(mk, 10)} ${padL(bps, 5)} bps`);
  W(`  แทนที่รายตัว: ${Object.entries(COST_BPS.bySymbol).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  W(`  สถานการณ์ pessimistic = คูณ ${COST_BPS.pessimisticMultiplier} เท่า`);
  W(`  แปลงเป็น R ต่อไม้ = (bps/10000 × ราคาเข้า) / ระยะเสี่ยงตาม riskModel (${ctx.riskModel}) — ไม้ที่ SL ชิดจะโดนต้นทุนหนักกว่ามาก`);
  W('  ตัวหารต้องเป็นตัวเดียวกับที่ใช้คิด R เสมอ ไม่งั้นค่าธรรมเนียมกับกำไรจะอยู่คนละหน่วย');
  W('');
  W('━'.repeat(110));
  W('ข้อจำกัดที่ต้องรู้ก่อนเชื่อตัวเลขข้างบน');
  W('━'.repeat(110));
  for (const c of ctx.caveats) W(`  · ${c}`);
  W('');
  return L.join('\n');
}

// ═══════════════════════════════ main ═══════════════════════════════

/**
 * ไม้ที่ "เทรดจริงไม่ได้" — ระยะ SL แคบกว่าต้นทุนรอบเดียว (costR(base) >= 1)
 *
 * ทำไมต้องแยกออกมา ไม่ใช่ปล่อยรวมหรือทิ้งเงียบ ๆ:
 * R คืออัตราส่วนที่ตัวหารคือ |ราคาเข้า - SL| สัญญาณคำนวณ SL จากราคาปิดแท่ง i
 * แต่เข้าไม้จริงที่ราคาเปิดแท่ง i+1 ถ้าแท่งใหม่เปิดมาทับ SL พอดี ตัวหารจะเหลือ
 * เศษเสี้ยวของสตางค์ (วัดเจอจริง: DELTA 1D 2001-04-20 ระยะ SL = 9.4e-7% ของราคา)
 * แล้ว R ของไม้เดียวนั้นก็ระเบิดได้ทั้งสองทาง (+166.55 R และ -423,624 R มีอยู่จริง
 * ในชุด train) ค่าเฉลี่ยของทั้งชุดจึงกลายเป็นตัวเลขของไม้ไม่กี่ไม้ ไม่ใช่ของกติกา
 *
 * ไม้พวกนี้ไม่ใช่ "ไม้ที่ขาดทุนหนัก" แต่เป็น "ไม้ที่หน่วย R ใช้ไม่ได้" — การซื้อขนาด
 * ที่ทำให้ระยะนั้นเท่ากับ 1R ต้องใช้สถานะใหญ่จนไม่มีสภาพคล่องรองรับ
 *
 * ⚠ การตัดออกทำให้ตัวเลขดูดีขึ้น จึงต้องอ่านคู่กันเสมอ: รายงานแสดงทั้งสองกลุ่ม
 * และใช้กลุ่มที่ "ใจดีกว่า" เป็นฐานของข้อสรุป เพื่อให้ข้อสรุปว่าไม่มี edge หนักแน่นขึ้น
 * ไม่ใช่เพื่อให้ตัวเลขสวยขึ้น
 */
const TRADEABLE_MAX_COST_R = 1;

function summariseCohort(trades, ctx, label) {
  const B = ctx.bootstrap;
  const out = { label, trades };
  for (const mode of ['gross', 'net']) {
    const field = mode === 'gross' ? 'rGross' : 'rNet';
    const rs = trades.map((t) => t[field]);
    out[mode] = {
      stats: baseStats(rs),
      ciTrade: bootstrapMeanCI(rs, { B, seed: ctx.seed }),
      ciCluster: bootstrapMeanCI(rs, { B, seed: ctx.seed ^ 0x5bf03635,
        clusters: clusterMap(trades, (t) => `${t.symbol}|${t.timeframe}`, field) }),
    };
  }
  const costs = trades.map((t) => t.costR).sort((a, b) => a - b);
  out.avgCostR = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  out.medCostR = percentileOfSorted(costs, 0.5) ?? 0;
  return out;
}

function summariseSplit(all, ctx) {
  const B = ctx.bootstrap;
  const tradeable = all.filter((t) => t.costRBase < TRADEABLE_MAX_COST_R);
  const rejected = all.filter((t) => !(t.costRBase < TRADEABLE_MAX_COST_R));

  const out = {
    allTrades: all,
    trades: tradeable, // ตารางแยกกลุ่มทั้งหมดยืนอยู่บนกลุ่มนี้
    cohortAll: summariseCohort(all, ctx, 'ทุกไม้'),
    cohortTradeable: summariseCohort(tradeable, ctx, 'เฉพาะไม้ที่เทรดได้จริง'),
    rejectedCount: rejected.length,
    rejectedShare: all.length ? rejected.length / all.length : null,
    rejectedSumRNet: rejected.reduce((a, t) => a + t.rNet, 0),
  };

  // ── การกระจายของระยะ SL — ตัวชี้ว่า "ตัวหารของ R" ใช้ได้แค่ไหน ──
  const sd = all.map((t) => t.stopDistPct).sort((a, b) => a - b);
  out.stopDist = {
    count: sd.length,
    min: sd[0] ?? null,
    p01: percentileOfSorted(sd, 0.01), p10: percentileOfSorted(sd, 0.1),
    p50: percentileOfSorted(sd, 0.5), p90: percentileOfSorted(sd, 0.9),
    max: sd[sd.length - 1] ?? null,
    shareBelow01pct: sd.length ? sd.filter((v) => v < 0.001).length / sd.length : null,
    shareCostROver025: all.length ? all.filter((t) => t.costRBase >= 0.25).length / all.length : null,
    shareCostROver05: all.length ? all.filter((t) => t.costRBase >= 0.5).length / all.length : null,
  };
  out.worstTrades = [...all].sort((a, b) => a.rNet - b.rNet).slice(0, 5);
  out.bestTrades = [...all].sort((a, b) => b.rNet - a.rNet).slice(0, 5);

  // ── ตรวจเครื่องวัด: ทุกทางที่พิจารณา วัดบนไม้ชุดเดียวกัน ──
  out.metricAudit = METRIC_CANDIDATES.map((c) => {
    const g = candidateValues(all, c, { net: false });
    const nt = candidateValues(all, c, { net: true });
    return { id: c.id, label: c.label, cap: c.cap, droppedTrades: all.length - g.length,
      gross: influenceAudit(g), net: influenceAudit(nt) };
  });
  out.fairness = fairnessCheck(all);

  const trades = tradeable;
  const gs = (keyFn) => groupStats(trades, keyFn, 'rNet', { B: Math.min(B, 2000), seed: ctx.seed });
  out.breakdowns = [
    ['แยกตามตลาด (R หักต้นทุนแล้ว)', gs((t) => t.market)],
    ['แยกตามกรอบเวลา', gs((t) => t.timeframe)],
    ['แยกตามทิศทาง', gs((t) => t.action)],
    ['แยกตามความแรงสัญญาณ', gs((t) => t.strength)],
    ['แยกตามปีที่เข้าไม้', gs((t) => t.year)],
  ];

  const rrs = trades.map((t) => t.rrPlanned).filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  out.rr = {
    count: rrs.length,
    mean: rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null,
    p10: percentileOfSorted(rrs, 0.1), p25: percentileOfSorted(rrs, 0.25),
    p50: percentileOfSorted(rrs, 0.5), p75: percentileOfSorted(rrs, 0.75),
    p90: percentileOfSorted(rrs, 0.9),
    lt05: rrs.length ? rrs.filter((v) => v < 0.5).length / rrs.length : null,
    lt1: rrs.length ? rrs.filter((v) => v < 1).length / rrs.length : null,
    ge2: rrs.length ? rrs.filter((v) => v >= 2).length / rrs.length : null,
  };
  const rrBucket = (t) => {
    const v = t.rrPlanned;
    if (v === null || !Number.isFinite(v)) return 'ไม่มีค่า';
    if (v < 0.5) return 'A: RR < 0.5';
    if (v < 1) return 'B: 0.5–1';
    if (v < 1.5) return 'C: 1–1.5';
    if (v < 2) return 'D: 1.5–2';
    if (v < 3) return 'E: 2–3';
    return 'F: RR >= 3';
  };
  out.byRRBucket = gs(rrBucket);
  out.byExit = groupStats(trades, (t) => t.exitReason, 'rNet', { B: Math.min(B, 2000), seed: ctx.seed });

  const holds = trades.map((t) => t.holdBars).sort((a, b) => a - b);
  out.avgHold = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : null;
  out.medHold = percentileOfSorted(holds, 0.5);
  out.maxHold = holds.length ? holds[holds.length - 1] : null;

  // ข้อสรุปยืนบนกลุ่มที่ "ใจดีกว่า" (ตัดไม้ที่เทรดจริงไม่ได้ออกแล้ว) โดยตั้งใจ
  // ถ้ากลุ่มที่ใจดีที่สุดยังไม่มี edge ข้อสรุปว่าไม่มี edge ก็ไม่มีทางถูกโต้ด้วยวิธีคิดต้นทุน
  const net = out.cohortTradeable.net;
  const lo = net.ciCluster.lo95;
  const hi = net.ciCluster.hi95;
  out.verdictText = lo > 0
    ? `ช่วงความเชื่อมั่นราย-สัญลักษณ์อยู่เหนือศูนย์ทั้งช่วง — มีหลักฐานว่ามี edge หลังหักต้นทุนในชุดนี้`
    : (hi < 0
      ? `ช่วงความเชื่อมั่นราย-สัญลักษณ์อยู่ใต้ศูนย์ทั้งช่วง — มีหลักฐานว่า "เสียเงินอย่างเป็นระบบ" ไม่ใช่แค่ไม่มี edge`
      : `ช่วงความเชื่อมั่นราย-สัญลักษณ์คร่อมศูนย์ — ข้อมูลชุดนี้แยกไม่ออกว่ามี edge หรือไม่มี ห้ามสรุปว่ามี`);
  return out;
}

function writeLedgerEntry(ctx) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const exists = fs.existsSync(LEDGER_FILE);
  if (!exists) {
    fs.writeFileSync(LEDGER_FILE,
      '# สมุดบันทึกการแตะชุด test\n\n'
      + 'ทุกครั้งที่มีคนรัน lab.mjs บนชุด test จะถูกบันทึกที่นี่โดยอัตโนมัติ\n'
      + 'ชุด test มีค่าก็ต่อเมื่อ "ยังไม่ถูกใช้เลือกอะไร" — ยิ่งแตะบ่อย ตัวเลขจากมันยิ่งใกล้เคียง train\n'
      + 'ห้ามลบบรรทัดในไฟล์นี้ ถ้าลบคือการลบหลักฐานว่าเคยแอบดูอนาคตไปแล้วกี่ครั้ง\n\n'
      + '| ครั้งที่ | เวลา | git | ป้าย | config ที่ต่างจากต้นฉบับ | ช่วง test | ไม้ (เทรดได้จริง) | avgR(net) | CI95 ราย-สัญลักษณ์ |\n'
      + '|---|---|---|---|---|---|---|---|---|\n', 'utf8');
  }
  const prior = countLedgerEntries();
  const s = ctx.bySplit.test;
  const c = s ? s.cohortTradeable : null;
  const row = `| ${prior + 1} | ${ctx.generatedAt} | ${ctx.git} | ${ctx.tag} | `
    + `${Object.keys(ctx.configDiff).length === 0 ? '(ไม่ต่าง)' : JSON.stringify(ctx.configDiff)} | `
    + `${ctx.testCleanFrom ? `>= ${ctx.testCleanFrom.slice(0, 10)}` : 'เต็มช่วง'} | `
    + `${c ? c.trades.length : 0} | ${c ? n2(c.net.stats.avgR) : 'n/a'} | `
    + `${c ? `[${n2(c.net.ciCluster.lo95)}, ${n2(c.net.ciCluster.hi95)}]` : 'n/a'} |\n`;
  fs.appendFileSync(LEDGER_FILE, row, 'utf8');
}

function countLedgerEntries() {
  if (!fs.existsSync(LEDGER_FILE)) return 0;
  const txt = fs.readFileSync(LEDGER_FILE, 'utf8');
  return txt.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l)).length;
}

function printHelp() {
  console.log(`
lab.mjs — เครื่องวัดรวมของงานวิจัยสัญญาณ

  node scripts/research/lab.mjs [options]

  --split=train,validation      ชุดที่จะวัด (train | validation | test) — ค่าเริ่มต้น train,validation
  --config=<ไฟล์.json|JSON>      patch ให้ engine-lab (คีย์ผิดจะพังทันที ไม่เงียบ)
  --tag=<ชื่อ>                   ชื่อไฟล์รายงาน (ค่าเริ่มต้น baseline)
  --cost=zero|base|pessimistic  สถานการณ์ต้นทุน (รายงานแสดงทั้งหักและไม่หักเสมอ)
  --cost-json=<ไฟล์>            แทนที่ตารางต้นทุนทั้งก้อน
  --markets=A,B / --timeframes=1D,1H / --symbols=X,Y     กรองชุดข้อมูล
  --include-bad                 รวมชุดที่ quality.verdict = bad (ค่าเริ่มต้นไม่รวม)
  --max-hold=10 --min-history=60
  --risk-model=planned|realized ตัวหารของ R (ค่าเริ่มต้น planned = ระยะที่ตั้งใจไว้ตอนออกสัญญาณ)
                                realized = นิยามเดิม เก็บไว้เทียบ "ก่อน/หลังซ่อมเครื่องวัด" เท่านั้น
  --bootstrap=10000 --seed=20260817
  --jobs=N                      จำนวน worker (ค่าเริ่มต้น = แกน CPU - 2)
  --dump-trades                 เขียนไม้ทั้งหมดเป็น CSV
  --test-clean-only             จำกัด test ให้เริ่มหลัง train+validation ของ "ทุก" กรอบเวลา
  --recompute-split             คำนวณเส้นแบ่งใหม่จากข้อมูลจริงทั้งคลัง
  --verify-engine [--all]       เทียบลูปเร็วกับ runBacktest ตัวจริงไม้ต่อไม้

  การรันบนชุด test ต้องมีครบ: --split=test --i-am-done-tuning --confirm=FINAL-NO-MORE-TUNING
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  const jobs = Number(args.jobs ?? Math.max(1, os.cpus().length - 2));
  const maxHoldBars = Number(args['max-hold'] ?? 10);
  const minHistory = Number(args['min-history'] ?? 60);
  // ค่าเริ่มต้นคือ planned — นิยามเดิม (realized) ถูกพิสูจน์แล้วว่าให้ค่าเฉลี่ยที่ไม้เดียว
  // ยึดไปทั้งชุดได้ (ดู report/metric-fix.md) เก็บไว้เลือกได้เพื่อ "เทียบก่อน/หลัง" เท่านั้น
  const riskModel = String(args['risk-model'] ?? 'planned');
  if (!['planned', 'realized'].includes(riskModel)) throw new Error('--risk-model ต้องเป็น planned|realized');

  const filt = {
    markets: args.markets ? String(args.markets).split(',') : null,
    timeframes: args.timeframes ? String(args.timeframes).split(',') : null,
    symbols: args.symbols ? String(args.symbols).split(',') : null,
    includeBad: !!args['include-bad'],
  };

  const allFiles = listCacheFiles();
  const metas = allFiles.map(readMetaOnly);
  const files = metas.filter((m) => datasetMatchesFilter(m, filt)).map((m) => m.file);
  if (!files.length) throw new Error('ตัวกรองไม่เหลือชุดข้อมูลให้รันเลย');

  // ── โหมดตรวจสอบความถูกต้องของลูปเร็ว ──
  if (args['verify-engine']) {
    const pick = args.all ? files : files.filter((f) => VERIFY_SAMPLE.includes(f));
    const use = pick.length ? pick : files.slice(0, 10);
    console.log(`[verify] เทียบลูปเร็ว+memo indicators กับ runBacktest ตัวจริง ${use.length} ชุด (worker ${jobs} ตัว)`);
    const t0 = performance.now();
    let bad = 0;
    let totalTrades = 0;
    const res = await runDatasetsInWorkers(jobs, use,
      { mode: 'verify', maxHoldBars, minHistory, riskModel },
      (done, total, r) => {
        totalTrades += r.trades;
        if (r.diffs.length) { bad++; console.log(`  ✗ ${r.symbol} ${r.timeframe}: ${r.diffs.slice(0, 5).join(' | ')}`); }
        if (done % 10 === 0 || done === total) console.log(`  ...${done}/${total}`);
      });
    const ms = performance.now() - t0;
    console.log(`[verify] ${res.length} ชุด · ${totalTrades.toLocaleString()} ไม้ · ต่างกัน ${bad} ชุด · ${(ms / 1000).toFixed(1)} วินาที`);
    if (bad) { console.error('[verify] ไม่ผ่าน — ลูปเร็วให้ผลไม่ตรงกับของจริง ห้ามใช้ตัวเลขจากมัน'); process.exit(1); }
    console.log('[verify] ผ่าน — ทุกไม้ ทุกฟิลด์ ตรงกันเป๊ะ');
    return;
  }

  const bounds = loadSplitBoundaries({ recompute: !!args['recompute-split'] });
  if (args['recompute-split']) {
    console.log(`[split] เขียนเส้นแบ่งใหม่ลง ${SPLIT_FILE}`);
    console.log(JSON.stringify(bounds.timeframes, null, 2));
  }

  const splits = String(args.split ?? 'train,validation').split(',').map((s) => s.trim()).filter(Boolean);
  for (const s of splits) {
    if (!['train', 'validation', 'test'].includes(s)) throw new Error(`ไม่รู้จัก split "${s}"`);
  }

  // ── ประตูของชุด test ──
  if (splits.includes('test')) {
    const prior = countLedgerEntries();
    if (!args['i-am-done-tuning'] || args.confirm !== 'FINAL-NO-MORE-TUNING') {
      console.error(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  หยุด — กำลังจะแตะชุด test                                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
ชุด test คือข้อมูลชุดเดียวที่ยังไม่เคยมีใครเห็นตอนปรับค่า มันมีค่าเพราะยังไม่ถูกใช้
ทุกครั้งที่ดูผลบนมันแล้วเอาไปปรับอะไรต่อ มันจะกลายเป็น train อีกชุดหนึ่งอย่างถาวร

ถ้าปรับค่าเสร็จจริงและพร้อมรับผลไม่ว่าจะออกมาแบบไหน ให้รันใหม่พร้อม:
    --split=test --i-am-done-tuning --confirm=FINAL-NO-MORE-TUNING

เคยแตะชุด test มาแล้ว ${prior} ครั้ง (ดู ${path.relative(ROOT, LEDGER_FILE)})
${bounds.overlaps?.length ? `
⚠ ระวังรอยรั่วข้ามกรอบเวลา:
${bounds.overlaps.map((o) => `   · ${o.note}`).join('\n')}
   ถ้าคุณปรับค่าโดยดูผลของทุกกรอบเวลา ให้เพิ่ม --test-clean-only
   (จำกัด test ตั้งแต่ ${bounds.cleanTestFrom.slice(0, 10)} ซึ่งไม่มีกรอบเวลาไหนเคยเห็น)
` : ''}`);
      process.exit(2);
    }
    if (prior > 0 && !args['allow-repeat-test']) {
      console.error(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  คำเตือน — ชุด test ถูกแตะไปแล้ว ${String(prior).padEnd(3)} ครั้ง                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
อ่าน ${path.relative(ROOT, LEDGER_FILE)} ก่อน — ผลที่ได้จากครั้งนี้อ่อนกว่าครั้งแรกเสมอ
ถ้ายังยืนยัน ให้เพิ่ม --allow-repeat-test
`);
      process.exit(2);
    }
  }

  // ── config ──
  let configPatch = {};
  if (args.config) {
    const raw = String(args.config);
    configPatch = raw.trim().startsWith('{') ? JSON.parse(raw) : JSON.parse(fs.readFileSync(path.resolve(ROOT, raw), 'utf8'));
  }
  const resolved = resolveConfig(configPatch); // พังตั้งแต่ตรงนี้ถ้าคีย์ผิด ดีกว่าไปพังใน worker 12 ตัวพร้อมกัน
  const cfgDiff = configDiff(resolved);

  // ── ต้นทุน ──
  const costScenario = String(args.cost ?? 'base');
  if (!['zero', 'base', 'pessimistic'].includes(costScenario)) throw new Error(`--cost ต้องเป็น zero|base|pessimistic`);
  const costTable = args['cost-json']
    ? JSON.parse(fs.readFileSync(path.resolve(ROOT, String(args['cost-json'])), 'utf8'))
    : COST_BPS;

  const seed = Number(args.seed ?? 20260817) >>> 0;
  const bootstrap = Number(args.bootstrap ?? 10000);
  const testCleanFrom = args['test-clean-only'] ? bounds.cleanTestFrom : null;

  console.log(`[lab] ${files.length} ชุดข้อมูล · split ${splits.join(',')} · ต้นทุน ${costScenario} · worker ${jobs} ตัว`);
  const t0 = performance.now();
  const results = await runDatasetsInWorkers(jobs, files,
    { mode: 'run', bounds, splits, maxHoldBars, minHistory, configPatch, costScenario, costTable, testCleanFrom, riskModel },
    (done, total) => { if (done % 20 === 0 || done === total) console.log(`  ...${done}/${total}`); });
  const elapsedMs = performance.now() - t0;

  const bySplit = {};
  let barsTotal = 0;
  const perDataset = [];
  for (const r of results) {
    barsTotal += r.bars;
    perDataset.push({ symbol: r.symbol, market: r.market, timeframe: r.timeframe, verdict: r.verdict,
      bars: r.bars, costFraction: r.costFraction,
      splits: Object.fromEntries(Object.entries(r.splits).map(([k, v]) => [k, { trades: v.trades.length, skipped: v.skipped, signals: v.signals, bars: v.bars }])) });
    for (const [split, v] of Object.entries(r.splits)) {
      if (!bySplit[split]) bySplit[split] = [];
      for (const t of v.trades) bySplit[split].push(t);
    }
  }
  // worker คืนผลตามลำดับที่รันเสร็จ ซึ่งไม่แน่นอน — เรียงใหม่ให้รายงานเหมือนเดิมทุกครั้ง
  perDataset.sort((a, b) => `${a.market}|${a.symbol}|${a.timeframe}`.localeCompare(`${b.market}|${b.symbol}|${b.timeframe}`));
  // เรียงตามเวลาปิดไม้ เพื่อให้ equity curve/drawdown เป็นลำดับเวลาจริงของพอร์ตรวม
  for (const k of Object.keys(bySplit)) {
    bySplit[k].sort((a, b) => (a.exitTime < b.exitTime ? -1 : a.exitTime > b.exitTime ? 1
      : (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1
        : (a.timeframe < b.timeframe ? -1 : a.timeframe > b.timeframe ? 1 : a.entryIndex - b.entryIndex))));
  }

  const ctx = {
    generatedAt: new Date().toISOString(),
    git: gitHead(),
    tag: String(args.tag ?? 'baseline'),
    configDiff: cfgDiff,
    splits,
    bounds,
    datasetCount: results.length,
    barsTotal,
    maxHoldBars, minHistory,
    riskModel,
    costScenario,
    elapsedMs,
    jobs,
    seed, bootstrap, testCleanFrom,
    bySplit: {},
    caveats: CAVEATS,
  };
  for (const s of splits) ctx.bySplit[s] = summariseSplit(bySplit[s] ?? [], ctx);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const txt = buildReport(ctx);
  const base = path.join(REPORT_DIR, `${ctx.tag}-${splits.join('+')}`);
  fs.writeFileSync(`${base}.txt`, `${txt}\n`, 'utf8');

  const json = {
    generatedAt: ctx.generatedAt, git: ctx.git, tag: ctx.tag, configDiff: cfgDiff,
    splits, bounds, datasetCount: results.length, barsTotal, maxHoldBars, minHistory, riskModel,
    costScenario, costTable, seed, bootstrap, elapsedMs, jobs, testCleanFrom,
    tradeableRule: `costR(base) < ${TRADEABLE_MAX_COST_R}`,
    perDataset,
    results: Object.fromEntries(splits.map((s) => {
      const v = ctx.bySplit[s];
      const cohort = (c) => ({ label: c.label, tradeCount: c.trades.length, avgCostR: c.avgCostR, medCostR: c.medCostR,
        gross: { stats: c.gross.stats, ciTrade: c.gross.ciTrade, ciCluster: c.gross.ciCluster },
        net: { stats: c.net.stats, ciTrade: c.net.ciTrade, ciCluster: c.net.ciCluster } });
      return [s, {
        tradeCountAll: v.allTrades.length,
        tradeCountTradeable: v.trades.length,
        rejectedCount: v.rejectedCount, rejectedShare: v.rejectedShare, rejectedSumRNet: v.rejectedSumRNet,
        tradeableRule: `costR(base) < ${TRADEABLE_MAX_COST_R}`,
        cohortAll: cohort(v.cohortAll),
        cohortTradeable: cohort(v.cohortTradeable),
        stopDist: v.stopDist,
        worstTrades: v.worstTrades, bestTrades: v.bestTrades,
        breakdowns: Object.fromEntries(v.breakdowns.map(([t, rows]) => [t, rows])),
        byExit: v.byExit, byRRBucket: v.byRRBucket, rr: v.rr,
        metricAudit: v.metricAudit, fairness: v.fairness,
        avgHold: v.avgHold, medHold: v.medHold, maxHold: v.maxHold,
        verdictText: v.verdictText,
      }];
    })),
  };
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  if (args['dump-trades']) {
    for (const s of splits) {
      const rows = ['symbol,market,timeframe,action,strength,confidence,entryTime,exitTime,holdBars,entry,exit,stopLoss,takeProfit,exitReason,rrPlanned,stopDistPct,plannedRisk,realizedRisk,riskKeepRatio,rGrossPlanned,rGrossRealized,rGross,costR,costRBase,rNet,tradeable'];
      for (const t of ctx.bySplit[s].allTrades) {
        rows.push([t.symbol, t.market, t.timeframe, t.action, t.strength, t.confidence, t.entryTime, t.exitTime,
          t.holdBars, t.entry, t.exit, t.stopLoss, t.takeProfit, t.exitReason,
          t.rrPlanned ?? '', t.stopDistPct, t.plannedRisk, t.realizedRisk, t.riskKeepRatio,
          t.rGrossPlanned, t.rGrossRealized, t.rGross, t.costR, t.costRBase, t.rNet,
          t.costRBase < TRADEABLE_MAX_COST_R ? 1 : 0].join(','));
      }
      fs.writeFileSync(path.join(REPORT_DIR, `${ctx.tag}-${s}-trades.csv`), `${rows.join('\n')}\n`, 'utf8');
    }
  }

  if (splits.includes('test')) writeLedgerEntry(ctx);

  console.log(txt);
  console.log(`\n[lab] เขียนรายงานที่ ${path.relative(ROOT, base)}.txt / .json`);
}

/** ชุดตัวอย่างสำหรับ --verify-engine แบบเร็ว — คร่อม 5 ตลาด × 2 กรอบเวลา */
const VERIFY_SAMPLE = [
  'GOLD__XAUUSD__1D.json', 'GOLD__XAUUSD__1H.json',
  'FOREX__EURUSD__1D.json', 'FOREX__USDTHB__1H.json',
  'TH_STOCK__PTT__1D.json', 'TH_STOCK__PTT__1H.json',
  'US_STOCK__AAPL__1D.json', 'US_STOCK__NVDA__1H.json',
  'CRYPTO__BTC__1D.json', 'CRYPTO__DOGE__1H.json',
];

const CAVEATS = [
  'ผลในอดีตไม่การันตีอนาคต — รายงานนี้วัดว่ากติกาปัจจุบัน "เคย" ให้ผลอย่างไร ไม่ใช่คำพยากรณ์',
  'ตัวหารของ R เป็น planned (ระยะที่ตั้งใจไว้ตอนออกสัญญาณ) ตัวเลขจึงเทียบกับรายงานก่อน 2026-08-17 ไม่ได้ตรง ๆ — ดู report/metric-fix.md',
  'planned ยังไม่ได้ทำให้ R มีขอบเขตตายตัวทางคณิตศาสตร์ เพียงแต่ตัวหารไม่ขึ้นกับ gap อีกต่อไป — ระยะ SL ที่สัญญาณตั้งเองยังมีหางบางที่แคบผิดปกติได้ (p01 ~0.5% ของราคา แต่ต่ำสุดที่วัดได้ 0.07%)',
  'ทุกข้อสรุปที่ตัดสินด้วยส่วนต่างเล็กกว่า 0.01 R/ไม้ ต้องเช็คซ้ำกับคอลัมน์ "ค+ข: ตัดที่ ±10" ในตารางตรวจเครื่องวัด ถ้าข้อสรุปพลิกระหว่างสองคอลัมน์ นั่นคือผลของหาง ไม่ใช่ของกฎ',
  'คลังข้อมูลยังมี survivorship bias เหลืออยู่: Yahoo ลบสัญลักษณ์ที่ออกจากกระดานทิ้ง (เช่น WBA ตอบ 404) ผลจริงจึงแย่กว่าที่วัดได้เล็กน้อยเสมอ',
  'ราคาไม่ได้หักปันผล — หุ้นปันผลสูงจะมี gap ลงทุกครั้งที่ขึ้นเครื่องหมาย XD ซึ่งระบบอาจอ่านเป็นสัญญาณกลับตัว',
  '1H ย้อนได้แค่ 730 วัน (เพดานของ Yahoo) = เห็นตลาดยุคเดียว ข้อสรุปจาก 1H อ่อนกว่า 1D มาก',
  'แท่งที่แตะทั้ง SL และ TP นับ SL ก่อนเสมอ (OHLC ไม่บอกลำดับภายในแท่ง) — เป็นการเลือกทางแย่ไว้ก่อน',
  'max drawdown คิดจากการเรียงไม้ตามเวลาปิด แล้วสมมติว่าเสี่ยง 1R ต่อไม้และถือทีละไม้ต่อสัญลักษณ์ — พอร์ตจริงที่ถือหลายตัวพร้อมกันจะมี drawdown ต่างจากนี้',
  'ต้นทุนทุกตัวเป็นค่าประมาณจากตารางค่าธรรมเนียมสาธารณะ ไม่ใช่ใบเสร็จจริงของเจ้าของ',
  'bootstrap ราย-ไม้สมมติว่าไม้เป็นอิสระต่อกัน ซึ่งไม่จริง — ให้ดูช่วงราย-สัญลักษณ์เป็นหลักเมื่อจะสรุป',
  'เกณฑ์ "เทรดได้จริง" (costR ที่สถานการณ์ base < 1) ผูกกับตารางต้นทุนที่เป็นค่าประมาณ — เปลี่ยนตารางแล้วขนาดกลุ่มตัวอย่างเปลี่ยนตาม',
  'ไม้ที่เข้าในช่วงท้ายของ split หนึ่งอาจไปปิดในแท่งของ split ถัดไป (สูงสุด maxHoldBars แท่ง) — จงใจปล่อยให้วิ่งจนจบเหมือนชีวิตจริง ไม่ตัดกลางคัน',
];

if (isMainThread) {
  main().catch((err) => {
    console.error(`\n[lab] ล้มเหลว: ${err?.message ?? err}`);
    if (process.env.LAB_DEBUG) console.error(err);
    process.exit(1);
  });
}
