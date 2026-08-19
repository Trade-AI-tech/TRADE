#!/usr/bin/env node
/**
 * regime.mjs — ทดสอบสมมติฐานเดียว: "ไม่เทรดตอนตลาดไม่มีเทรนด์"
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ไฟล์นี้ "วัด" อย่างเดียว ไม่แตะเครื่องยนต์จริง ไม่แตะ lab.mjs ไม่แตะ engine-lab.mjs
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────── ทำไมต้องมีไฟล์นี้แยกจาก lab.mjs ───────────────────────────
 *
 * สมมติฐานรอบนี้คือ "ประตูหน้าเครื่องยนต์" ไม่ใช่ "ปุ่มในเครื่องยนต์":
 * มันไม่ได้เปลี่ยนวิธีให้คะแนน แต่บอกว่า *ในสภาพตลาดแบบไหนจึงจะยอมรับสัญญาณที่ออกมาแล้ว*
 * engine-lab.mjs ปรับได้เฉพาะตัวเลขภายในการให้คะแนน/วาง SL-TP จึงเขียนกฎแบบนี้ไม่ได้
 * และ lab.mjs ก็ไม่ได้ export อะไรออกมาให้ประกอบใหม่ (มันเป็น CLI ล้วน)
 *
 * ทางที่เหลือคือ "สำเนาที่ควบคุมได้" ของลูป walk-forward — ซึ่งเป็นรูปแบบเดียวกับที่
 * lab.mjs ทำกับ src/lib/backtest.ts อยู่แล้ว และมาพร้อมหนี้ก้อนเดียวกัน: สำเนาอาจเพี้ยน
 * หนี้ก้อนนั้นถูกจ่ายด้วย `--verify` ซึ่งบังคับให้ "ประตูปิด = ไม่กรองอะไรเลย" ต้องให้
 * ตัวเลขตรงกับ report/baseline-v2-train+validation.json **ทุกหลัก** (จำนวนไม้ · avgR ·
 * sumR · ไม้ชนะ · minR · maxR ทั้งก่อนและหลังหักต้นทุน) ถ้าไม่ตรงจะ exit 1 และห้ามอ่าน
 * ตัวเลขใด ๆ จากไฟล์นี้ต่อ
 *
 * ───────────────────────── ทำไมถึงคุ้มที่จะเสี่ยงกับสำเนา ─────────────────────────
 *
 * เพราะการกรองแบบนี้ **ไม่ใช่การคัดไม้ทิ้งจากตาราง** ถ้ากรองบน CSV ที่ lab.mjs ดัมป์ไว้
 * จะได้คำตอบที่ผิด: กติกา "ถือทีละไม้ต่อสัญลักษณ์" แปลว่าเมื่อปฏิเสธสัญญาณหนึ่ง
 * *ช่องว่างที่ถูกปล่อยออกมาจะถูกสัญญาณถัดไปเข้าใช้แทน* (การวินิจฉัยพบว่าสัญญาณ 52.9%
 * ไม่เคยถูกวัดเพราะติดไม้ค้างอยู่) การกรองบนตารางจะเห็นแต่ "ไม้ที่หายไป" ไม่เห็น
 * "ไม้ที่เข้ามาแทน" ซึ่งเป็นครึ่งหนึ่งของผลจริงและอาจกลับข้อสรุปได้ทั้งหมด
 * ไฟล์นี้จึงต้องเดินลูปใหม่จริง ๆ ต่อกฎหนึ่งข้อ
 *
 * ─────────────────────────────── ความเร็วมาจากไหน ───────────────────────────────
 *
 * สัญญาณที่แท่ง i ขึ้นกับ candles[0..i] เท่านั้น (causal ล้วน) และ **ไม่ขึ้นกับว่า
 * ตอนนั้นถือไม้อยู่หรือไม่** จึงคำนวณสัญญาณของทุกแท่งไว้ครั้งเดียวต่อชุดข้อมูล
 * แล้วให้กฎทั้ง 11 แบบเดินบนสัญญาณชุดเดียวกัน — ต้นทุนของ 11 แบบ ≈ ต้นทุนของแบบเดียว
 * (ค่าที่ต่างกันคือ "แท่งไหนถูกเยี่ยม" ซึ่งขึ้นกับไม้ที่ค้างอยู่ ไม่ใช่ค่าของสัญญาณ)
 * memo indicators ลอกมาจาก lab.mjs ตรง ๆ ด้วยเหตุผลเดียวกับที่นั่น
 *
 * ────────────────────────── กฎที่ทดสอบ (ตั้งไว้ก่อนรัน) ──────────────────────────
 *
 * ทั้งหมด 10 แบบ + พื้นฐาน ประกาศไว้ใน VARIANTS ด้านล่าง **ก่อน**เห็นผลใด ๆ
 * รายงานพิมพ์ทั้ง 10 แบบเสมอ ไม่ว่าแบบไหนจะชนะหรือแพ้ และแก้ค่า p ตามจำนวน 10 นั้น
 * (Bonferroni: จะเรียกว่า "มีนัย" ต้องได้ p < 0.05/10 = 0.005)
 *
 * ทุกกฎใช้เฉพาะข้อมูลถึงแท่งที่ตัดสินใจ (แท่ง i) เท่านั้น:
 *   · trend      = determineTrend() ตัวจริงจาก src/lib/indicators.ts บน EMA20/SMA50/SMA200
 *                  ของ prefix เดียวกับที่เครื่องยนต์เห็น (SMA200 มีต่อเมื่อ prefix ≥ 200 แท่ง
 *                  — เงื่อนไขเดียวกับ signal-engine เป๊ะ ไม่ย่อคาบให้สั้นลง)
 *   · MA200 side = ราคาปิดแท่ง i อยู่เหนือ/ใต้ SMA200 ณ แท่ง i
 *   · ATR rank   = อันดับของ ATR%/ราคา ณ แท่ง i เทียบกับ **อดีตของตัวเองเท่านั้น**
 *                  (expanding window: นับเฉพาะแท่ง 0..i ไม่มีแท่งอนาคตแม้แต่แท่งเดียว)
 *                  ต้องมีอดีตอย่างน้อย ATR_RANK_MIN_OBS แท่ง ไม่งั้นถือว่า "ตัดสินไม่ได้"
 *                  แล้ว **ปล่อยผ่าน** — เพราะการบล็อกเพราะไม่มีข้อมูลคือการกรองด้วยอายุ
 *                  ของชุดข้อมูล ไม่ใช่การกรองด้วยความผันผวน
 *
 * ─────────────────────────────────── วิธีใช้ ───────────────────────────────────
 *
 *   node scripts/research/experiments/regime.mjs --verify           ตรวจสำเนากับ baseline-v2
 *   node scripts/research/experiments/regime.mjs --split=train      ทดลองทั้ง 10 แบบบน train
 *   node scripts/research/experiments/regime.mjs --split=validation --variants=T2,T2+M1
 *   node scripts/research/experiments/regime.mjs --help
 *
 * ⛔ ไฟล์นี้ **รันบนชุด test ไม่ได้เลย** ไม่มีสวิตช์ให้เปิด — ประตูของ test อยู่ที่ lab.mjs
 *    ซึ่งมีสมุดบันทึกกำกับ การทำประตูที่สองขึ้นมาเองคือการเปิดทางอ้อมให้ตัวเอง
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

import { ROOT, loadSrcModules } from '../load-src-modules.mjs';
import { createLabEngine } from '../engine-lab.mjs';

const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const SPLIT_FILE = path.join(REPORT_DIR, 'split.json');
const BASELINE_FILE = path.join(REPORT_DIR, 'baseline-v2-train+validation.json');
const SELF = fileURLToPath(import.meta.url);

/** ต้องมีอดีตกี่แท่งถึงจะจัดอันดับความผันผวนได้ — น้อยกว่านี้ = ตัดสินไม่ได้ = ปล่อยผ่าน */
const ATR_RANK_MIN_OBS = 250;

/** เพดานสำหรับคอลัมน์ตรวจหาง (กติกาบังคับใน report/metric-fix.md ข้อ 7.2) */
const TAIL_CAP = 10;

// ════════════ ต้นทุนการเทรด — ลอกจาก lab.mjs ห้ามแก้ให้ต่าง ════════════
//
// ตัวเลขทุกตัวเป็น "การประมาณ" ไม่ใช่ใบเสร็จจริง (ที่มาของแต่ละตัวอยู่ใน lab.mjs)
// ที่ต้องลอกมาเพราะการทดลองนี้ต้องเทียบกับ baseline-v2 ซึ่งใช้ตารางนี้ ถ้าตารางต่างกัน
// แม้แต่ตัวเดียว ตัวเลขจะเทียบกันไม่ได้ และ --verify จะจับได้ทันที
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
  pessimisticMultiplier: 2,
};

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
  } catch { return 'unknown'; }
}

// ═══════════════════════════════ คลังข้อมูล ═══════════════════════════════
// (ลอกจาก lab.mjs — สัญญาของคลังเป็นของ fetch-universe.mjs ไม่ใช่ของไฟล์นี้)

function listCacheFiles() {
  if (!fs.existsSync(CACHE_DIR)) {
    throw new Error(`ไม่พบคลังข้อมูล ${CACHE_DIR} — สั่ง node scripts/research/fetch-universe.mjs ก่อน`);
  }
  return fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
}

/** ⚠ ต้องเคารพ quality.usable.from เสมอ ไม่งั้นได้แท่งที่เป็นไปไม่ได้ทางกายภาพติดมา */
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
    file, symbol: j.symbol, name: j.name, market: j.market, timeframe: j.timeframe,
    verdict: j.quality?.verdict ?? 'unknown', trimmedByUsable: trimmed,
    candles, times: candles.map((c) => Date.parse(c.timestamp)),
  };
}

function readMetaOnly(file) {
  const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
  return { file, symbol: j.symbol, market: j.market, timeframe: j.timeframe,
    verdict: j.quality?.verdict ?? 'unknown' };
}

// ═══════════════════════ เส้นแบ่ง train/validation ═══════════════════════
//
// **อ่านอย่างเดียว** — ไฟล์นี้ไม่มีสิทธิ์คำนวณเส้นแบ่งใหม่ เพราะเส้นแบ่งคือของกลาง
// ที่ทุกการทดลองต้องใช้ร่วมกัน ถ้าไม่มีไฟล์ให้ไปสั่ง lab.mjs สร้าง ไม่ใช่สร้างเอง

function loadSplitBoundaries() {
  if (!fs.existsSync(SPLIT_FILE)) {
    throw new Error(`ไม่พบ ${SPLIT_FILE} — สั่ง node scripts/research/lab.mjs --recompute-split ก่อน`);
  }
  const j = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
  if (!j.cleanTestFrom) throw new Error('split.json เก่าเกินไป — สั่ง lab.mjs --recompute-split');
  return j;
}

function lowerBound(times, cut) {
  let lo = 0; let hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < cut) lo = mid + 1; else hi = mid; }
  return lo;
}

function entryWindow(ds, bounds, split) {
  const b = bounds.timeframes[ds.timeframe];
  if (!b) return null;
  const n = ds.times.length;
  const iTrainEnd = lowerBound(ds.times, Date.parse(b.trainEnd));
  const iValEnd = lowerBound(ds.times, Date.parse(b.validationEnd));
  let from; let to;
  if (split === 'train') { from = 0; to = iTrainEnd - 1; }
  else if (split === 'validation') { from = iTrainEnd; to = iValEnd - 1; }
  else throw new Error('regime.mjs รันบนชุด test ไม่ได้ — ประตูของ test อยู่ที่ lab.mjs เท่านั้น');
  if (from > to || from >= n) return null;
  return { from: Math.max(0, from), to: Math.min(n - 1, to) };
}

// ═══════════ indicator แบบคำนวณครั้งเดียวต่อ dataset (ลอกจาก lab.mjs) ═══════════

function buildMemoIndicators(real, candles) {
  const closes = candles.map((c) => c.close);
  const n = candles.length;
  const cache = new Map();

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
    RSI: (arr, p) => { checkCloses(arr); return memo(`RSI|${p}`, () => real.RSI(closes, p)); },
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
  };
}

// ═══════════════════════ สภาพตลาดต่อแท่ง (regime features) ═══════════════════════

/**
 * คำนวณ "สภาพตลาด" ที่ทุกกฎในไฟล์นี้ใช้ร่วมกัน — ครั้งเดียวต่อชุดข้อมูล
 *
 * ทุกค่าที่ดัชนี i ต้องขึ้นกับ candles[0..i] เท่านั้น ไม่มีข้อยกเว้น
 *  · EMA/SMA เป็น causal อยู่แล้ว (ค่าที่ i ขึ้นกับ values[0..i]) จึงคำนวณชุดเต็มครั้งเดียวได้
 *  · SMA200 ต้องมีเงื่อนไข "prefix ยาว ≥ 200" เหมือน signal-engine เป๊ะ ไม่ใช่แค่ค่าไม่ NaN
 *    (ในทางปฏิบัติ SMA คืน NaN ก่อน period-1 อยู่แล้ว แต่เขียนเงื่อนไขไว้ให้ตรงต้นฉบับ
 *     เผื่อวันหนึ่ง SMA เปลี่ยนวิธี padding)
 *  · ATR ที่แท่ง i = ค่าเฉลี่ย TR ของ 14 แท่งท้าย ตามสูตรใน src/lib/indicators.ts เป๊ะ
 *    (ต้นฉบับ slice(-(period+1)) แล้ววน j=1.. จึงได้ TR ของดัชนี i-period+1..i)
 *  · อันดับความผันผวน = สัดส่วนของแท่งในอดีต (รวมแท่งปัจจุบัน) ที่ ATR% ต่ำกว่าหรือเท่ากับ
 *    ของแท่งนี้ ใช้ Fenwick tree เพื่อให้เป็น O(n log n) — การใช้ "อันดับในชุดเต็ม" เป็น
 *    ดัชนีของต้นไม้ไม่ใช่การมองอนาคต เพราะจำนวนที่นับมาจากของที่ *ใส่เข้าไปแล้ว* เท่านั้น
 */
function buildRegimeFeatures(real, ds) {
  const { candles } = ds;
  const n = candles.length;
  const closes = candles.map((c) => c.close);

  const ema20 = real.EMA(closes, 20);
  const sma50 = real.SMA(closes, 50);
  const sma200 = real.SMA(closes, 200);

  // ── ATR ต่อแท่ง ด้วยผลรวมสะสมของ True Range ──
  const tr = new Float64Array(n);
  tr[0] = NaN;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }
  const cum = new Float64Array(n + 1);
  for (let i = 1; i < n; i++) cum[i + 1] = cum[i] + (Number.isFinite(tr[i]) ? tr[i] : 0);

  const ATR_PERIOD = 14;
  const atrPct = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const lo = Math.max(1, i - ATR_PERIOD + 1); // ดัชนี TR ตัวแรกที่นับ
    const cnt = i - lo + 1;
    if (cnt <= 0) continue;
    const atr = (cum[i + 1] - cum[lo]) / cnt;
    if (Number.isFinite(atr) && atr > 0 && closes[i] > 0) atrPct[i] = atr / closes[i];
  }

  // ── อันดับของ ATR% เทียบอดีตของตัวเอง (expanding window) ──
  const idxs = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(atrPct[i])) idxs.push(i);
  const order = [...idxs].sort((a, b) => atrPct[a] - atrPct[b]);
  const rankOf = new Int32Array(n).fill(-1);
  for (let k = 0; k < order.length; k++) rankOf[order[k]] = k + 1; // 1-based สำหรับ Fenwick
  const m = order.length;
  const bit = new Int32Array(m + 2);
  const bitAdd = (p) => { for (let x = p; x <= m; x += x & -x) bit[x]++; };
  const bitSum = (p) => { let s = 0; for (let x = p; x > 0; x -= x & -x) s += bit[x]; return s; };

  const atrRank = new Float64Array(n).fill(NaN);
  let inserted = 0;
  for (let i = 0; i < n; i++) {
    if (rankOf[i] < 0) continue;
    bitAdd(rankOf[i]);
    inserted++;
    // นับเฉพาะที่ใส่ไปแล้ว = แท่ง 0..i เท่านั้น → ไม่มีอนาคตรั่วเข้ามาแม้แต่แท่งเดียว
    if (inserted >= ATR_RANK_MIN_OBS) atrRank[i] = bitSum(rankOf[i]) / inserted;
  }

  const trend = new Array(n);
  const hasMA200 = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const ma200 = (i + 1) >= 200 ? sma200[i] : NaN;
    hasMA200[i] = Number.isFinite(ma200) ? 1 : 0;
    trend[i] = real.determineTrend(closes[i], ema20[i], sma50[i], ma200);
  }

  return { trend, hasMA200, sma200, closes, atrPct, atrRank };
}

// ═══════════════════════════════ กฎที่ทดสอบ ═══════════════════════════════
//
// แต่ละกฎคืน true = "ยอมให้ออกสัญญาณ" · false = "ไม่เทรดแท่งนี้"
// ทุกกฎอ่านได้เฉพาะ f (สภาพตลาดที่แท่ง i) และ action ของสัญญาณเท่านั้น

const RULES = {
  /** เทรนด์ต้องไม่ใช่ sideways (ตามสมมติฐานหลักในบรีฟ) */
  T1: {
    label: 'เทรนด์ต้องไม่ออกข้าง',
    test: (f) => f.trend !== 'sideways',
  },
  /** เทรนด์ต้องหนุนทิศของสัญญาณ — ตัวแบ่งที่คมที่สุดที่การวินิจฉัยเจอ */
  T2: {
    label: 'เทรนด์ต้องหนุนทิศ',
    test: (f, action) => (action === 'BUY' ? f.trend === 'uptrend' : f.trend === 'downtrend'),
  },
  /** ต้องมี MA200 จริง และราคาต้องอยู่ฝั่งเดียวกับทิศ */
  M1: {
    label: 'ต้องมี MA200 และอยู่ฝั่งเดียวกัน',
    test: (f, action) => f.hasMA200 && (action === 'BUY' ? f.close > f.ma200 : f.close < f.ma200),
  },
  /** เหมือน M1 แต่ถ้าไม่มี MA200 ให้ผ่าน — แยกออกมาเพื่อดูว่าผลมาจาก "ฝั่ง" หรือมาจาก "อายุข้อมูล" */
  M2: {
    label: 'ห้ามสวนฝั่ง MA200 (ไม่มี MA200 = ผ่าน)',
    test: (f, action) => !f.hasMA200 || (action === 'BUY' ? f.close > f.ma200 : f.close < f.ma200),
  },
  /** ความผันผวนต้องไม่อยู่ 20% บนสุดของอดีตตัวเอง */
  V1: {
    label: 'ATR% ไม่เกินเปอร์เซ็นไทล์ 80 ของอดีตตัวเอง',
    test: (f) => !Number.isFinite(f.atrRank) || f.atrRank <= 0.80,
  },
  /** เปอร์เซ็นไทล์ 67 — เลือกให้ตรงกับกลุ่ม "ผันผวนสูง 32.7%" ในผลวินิจฉัย */
  V2: {
    label: 'ATR% ไม่เกินเปอร์เซ็นไทล์ 67 ของอดีตตัวเอง',
    test: (f) => !Number.isFinite(f.atrRank) || f.atrRank <= 0.67,
  },
};

/**
 * รายการแบบที่จะทดสอบ — **ประกาศไว้ก่อนเห็นผลใด ๆ**
 * จำนวนนี้คือตัวหารของการแก้ค่า p (Bonferroni) รายงานทุกแบบเสมอ ไม่เลือกเฉพาะที่ชนะ
 */
const VARIANTS = [
  { id: 'BASE', rules: [], label: 'พื้นฐาน (ไม่กรองอะไรเลย)' },
  { id: 'T1', rules: ['T1'] },
  { id: 'T2', rules: ['T2'] },
  { id: 'M1', rules: ['M1'] },
  { id: 'M2', rules: ['M2'] },
  { id: 'V1', rules: ['V1'] },
  { id: 'V2', rules: ['V2'] },
  { id: 'T1+V2', rules: ['T1', 'V2'] },
  { id: 'T2+M1', rules: ['T2', 'M1'] },
  { id: 'T2+V2', rules: ['T2', 'V2'] },
  { id: 'T2+M1+V2', rules: ['T2', 'M1', 'V2'] },
];

const N_COMPARISONS = VARIANTS.length - 1; // ไม่นับพื้นฐาน

function variantLabel(v) {
  return v.label ?? v.rules.map((r) => RULES[r].label).join(' + ');
}

function makeGate(rules) {
  if (!rules.length) return null;
  const fns = rules.map((r) => RULES[r].test);
  return (f, action) => {
    for (const fn of fns) if (!fn(f, action)) return false;
    return true;
  };
}

// ═══════════════════════════════ walk-forward ═══════════════════════════════

/**
 * เดินไปข้างหน้าบนสัญญาณที่คำนวณไว้แล้ว พร้อมประตูกรองสภาพตลาด
 *
 * ⚠ ตรรกะการชน SL/TP · ลำดับ gap · การนับ SL ก่อน TP · ตัวหารของ R · การกระโดดไปที่
 * exitIndex ลอกมาจาก walkForward ใน lab.mjs ทุกบรรทัด สิ่งเดียวที่เพิ่มคือสองบรรทัด
 * ของประตู (gate) และการบันทึกสภาพตลาดลงในไม้ — ความถูกต้องของสำเนาถูกบังคับด้วย
 * `--verify` ซึ่งเทียบกับ baseline-v2 ที่ lab.mjs สร้าง
 *
 * ประตูอยู่ตรงตำแหน่งเดียวกับที่ signal-engine จะคืน null ถ้ากฎนี้ถูกฝังเข้าไปจริง
 * (คือ "ไม่มีสัญญาณ") ไม่ใช่ "มีสัญญาณแต่ไม่เข้า" — ผลต่างคือ i++ แล้วไปต่อ ซึ่งแปลว่า
 * แท่งถัดไปมีสิทธิ์ออกสัญญาณและเข้าไม้แทนได้ตามกติกาถือทีละไม้
 */
function walkForward({ ds, sigAt, feat, gate, entryFrom, entryTo, maxHoldBars, minHistory,
  costFraction, costFractionBase }) {
  const { candles } = ds;
  const trades = [];
  let skipped = 0;
  let signals = 0;
  let blocked = 0;

  const hardTo = Math.min(candles.length - 2, entryTo - 1);
  let i = Math.max(minHistory, entryFrom - 1);

  while (i <= hardTo) {
    const sig = sigAt[i];
    if (!sig) { i++; continue; }
    signals++;

    // ── ประตูสภาพตลาด ────────────────────────────────────────────────────
    const fi = {
      trend: feat.trend[i],
      hasMA200: feat.hasMA200[i] === 1,
      ma200: feat.sma200[i],
      close: feat.closes[i],
      atrRank: feat.atrRank[i],
    };
    if (gate && !gate(fi, sig.action)) { blocked++; i++; continue; }

    const entryIndex = i + 1;
    const entryBar = candles[entryIndex];
    if (!isUsableBar(entryBar)) { skipped++; i++; continue; }

    const isLong = sig.action === 'BUY';
    const dir = isLong ? 1 : -1;
    const entry = entryBar.open;
    const stopLoss = sig.stop_loss;
    const takeProfit = sig.take_profit;

    const realizedRisk = Math.abs(entry - stopLoss);
    const plannedRisk = Math.abs(sig.entry_price - sig.stop_loss);
    const riskPerUnit = plannedRisk; // riskModel = planned เสมอ (ดู report/metric-fix.md)
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
    const costR = costFraction > 0 ? (costFraction * entry) / riskPerUnit : 0;
    const costRBase = costFractionBase > 0 ? (costFractionBase * entry) / riskPerUnit : 0;

    trades.push({
      symbol: ds.symbol, market: ds.market, timeframe: ds.timeframe,
      action: sig.action, strength: sig.strength,
      entryIndex, exitIndex, entry, exit,
      exitReason,
      rGross, costR, costRBase, rNet: rGross - costR,
      // ค่าที่ตัดหางแล้ว — คอลัมน์บังคับตาม report/metric-fix.md ข้อ 7.2
      rNetCapped: Math.max(-TAIL_CAP, Math.min(TAIL_CAP, rGross - costR)),
      plannedRisk, realizedRisk,
      entryTime: entryBar.timestamp,
      exitTime: candles[exitIndex].timestamp,
      // สภาพตลาดตอนตัดสินใจ — เก็บไว้เพื่อแยก "กลุ่มที่ถูกตัด" ออกจาก "กลุ่มที่เหลือ"
      trend: fi.trend,
      hasMA200: fi.hasMA200,
      ma200Ok: fi.hasMA200 ? (sig.action === 'BUY' ? fi.close > fi.ma200 : fi.close < fi.ma200) : null,
      atrRank: Number.isFinite(fi.atrRank) ? fi.atrRank : null,
    });

    i = exitIndex;
  }

  return { trades, skipped, signals, blocked };
}

/** ตรงกับ isUsableBar ใน src/lib/backtest.ts */
function isUsableBar(c) {
  return (
    Number.isFinite(c.open) && c.open > 0 &&
    Number.isFinite(c.high) && c.high > 0 &&
    Number.isFinite(c.low) && c.low > 0 &&
    Number.isFinite(c.close) && c.close > 0 &&
    c.low <= c.high
  );
}

function costFractionFor(meta, scenario, table) {
  if (scenario === 'zero') return 0;
  const bps = table.bySymbol[meta.symbol] ?? table.byMarket[meta.market];
  if (bps === undefined) throw new Error(`ไม่มีค่าประมาณต้นทุนสำหรับ ${meta.market}/${meta.symbol}`);
  const mult = scenario === 'pessimistic' ? table.pessimisticMultiplier : 1;
  return (bps * mult) / 10000;
}

// ═══════════════════════════════ สถิติ ═══════════════════════════════
// (baseStats / bootstrapMeanCI ลอกจาก lab.mjs — ต้องเป็นสูตรเดียวกันถึงจะเทียบตัวเลขได้)

function baseStats(rs) {
  const count = rs.length;
  if (count === 0) {
    return { count: 0, wins: 0, losses: 0, winRate: null, profitFactor: null, avgR: null,
      medianR: null, maxDrawdownR: null, grossWinR: 0, grossLossR: 0, sumR: 0, minR: null, maxR: null };
  }
  let wins = 0; let losses = 0; let sumR = 0; let grossWinR = 0; let grossLossR = 0;
  let equity = 0; let peak = 0; let maxDD = 0;
  for (const r of rs) {
    sumR += r;
    if (r > 0) { wins++; grossWinR += r; } else if (r < 0) { losses++; grossLossR += -r; }
    equity += r;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;
  }
  const sorted = [...rs].sort((a, b) => a - b);
  return {
    count, wins, losses,
    winRate: wins / count,
    profitFactor: grossLossR > 0 ? grossWinR / grossLossR : null,
    avgR: sumR / count,
    medianR: percentileOfSorted(sorted, 0.5),
    maxDrawdownR: maxDD,
    grossWinR, grossLossR, sumR,
    minR: sorted[0], maxR: sorted[count - 1],
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
      for (let g = 0; g < G; g++) { const pick = (rnd() * G) | 0; s += sums[pick]; c += cnts[pick]; }
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
  return { B, lo95: percentileOfSorted(means, 0.025), hi95: percentileOfSorted(means, 0.975),
    median: percentileOfSorted(means, 0.5), pLE0: nonPositive / B };
}

/**
 * ช่วงความเชื่อมั่นของ **ส่วนต่าง** ระหว่างสองแบบ — สุ่มสัญลักษณ์เดียวกันให้ทั้งคู่
 *
 * ทำไมต้องจับคู่: สองแบบวัดบนสัญลักษณ์ชุดเดียวกันแต่ได้ไม้คนละชุด ถ้าสุ่มแยกกัน
 * ความแปรปรวนของ "สัญลักษณ์ไหนถูกหยิบ" จะถูกนับสองครั้ง ช่วงจะกว้างเกินจริงมาก
 * การหยิบสัญลักษณ์ชุดเดียวกันให้ทั้งสองแบบทำให้ตัวแปรร่วมนั้นหักล้างกันไป
 * เหลือแต่ความไม่แน่นอนของ "กฎนี้ทำอะไรกับสัญลักษณ์เหล่านั้น" ซึ่งคือคำถามที่ถามอยู่
 *
 * pLE0 = สัดส่วนของการสุ่มที่ส่วนต่าง ≤ 0 = ค่า p ด้านเดียวของ H0: "กฎนี้ไม่ได้ช่วย"
 */
function bootstrapDiffCI(clA, clB, { B, seed }) {
  const keys = [...new Set([...clA.keys(), ...clB.keys()])];
  const G = keys.length;
  if (!G) return null;
  const aS = keys.map((k) => clA.get(k)?.sum ?? 0);
  const aC = keys.map((k) => clA.get(k)?.count ?? 0);
  const bS = keys.map((k) => clB.get(k)?.sum ?? 0);
  const bC = keys.map((k) => clB.get(k)?.count ?? 0);
  const rnd = mulberry32(seed);
  const out = new Array(B);
  for (let b = 0; b < B; b++) {
    let as = 0; let ac = 0; let bs = 0; let bc = 0;
    for (let g = 0; g < G; g++) {
      const pick = (rnd() * G) | 0;
      as += aS[pick]; ac += aC[pick];
      bs += bS[pick]; bc += bC[pick];
    }
    out[b] = (ac > 0 ? as / ac : 0) - (bc > 0 ? bs / bc : 0);
  }
  out.sort((a, b) => a - b);
  let le0 = 0;
  for (const v of out) if (v <= 0) le0++;
  return { B, lo95: percentileOfSorted(out, 0.025), hi95: percentileOfSorted(out, 0.975),
    median: percentileOfSorted(out, 0.5), pLE0: le0 / B };
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
      const w = new Worker(SELF, { workerData: payload });
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
        if (onProgress) onProgress(done, files.length);
        next();
      });
      w.on('error', (e) => { failed = true; reject(e); });
      w.on('exit', () => { alive--; if (alive === 0 && !failed) resolve(); });
    };
    for (let k = 0; k < nWorkers; k++) spawn();
  });

  return results;
}

/**
 * รันหนึ่งชุดข้อมูล ครบทุก split และครบทุกแบบ
 *
 * คำนวณสัญญาณของทุกแท่งไว้ก่อนครั้งเดียว แล้วให้ทุกแบบเดินบนชุดเดียวกัน
 * — ประหยัดเวลาได้ ~11 เท่า และที่สำคัญกว่านั้นคือ **รับประกันว่าทุกแบบเห็นสัญญาณ
 * ตัวเดียวกันเป๊ะ** ความต่างที่วัดได้จึงมาจากประตูล้วน ๆ ไม่ใช่จากการคำนวณคนละรอบ
 */
function runOne(ds, real, wd) {
  const engine = createLabEngine(buildMemoIndicators(real, ds.candles), {});
  const feat = buildRegimeFeatures(real, ds);
  const costFraction = costFractionFor(ds, wd.costScenario, wd.costTable);
  const costFractionBase = costFractionFor(ds, 'base', wd.costTable);

  // ── ช่วงแท่งที่อาจต้องใช้สัญญาณ (รวมทุก split ที่ขอ) ──
  const windows = {};
  let lo = Infinity;
  let hi = -Infinity;
  for (const split of wd.splits) {
    const win = entryWindow(ds, wd.bounds, split);
    windows[split] = win;
    if (!win) continue;
    lo = Math.min(lo, Math.max(wd.minHistory, win.from - 1));
    hi = Math.max(hi, Math.min(ds.candles.length - 2, win.to - 1));
  }

  const sigAt = new Array(ds.candles.length).fill(null);
  if (lo <= hi) {
    const prefix = ds.candles.slice(0, Math.min(lo + 1, ds.candles.length));
    for (let i = lo; i <= hi; i++) {
      while (prefix.length < i + 1) prefix.push(ds.candles[prefix.length]);
      const sig = engine.generateSignal({
        symbol: ds.symbol, name: ds.name, market: ds.market, candles: prefix, timeframe: ds.timeframe,
      });
      if (sig && (sig.action === 'BUY' || sig.action === 'SELL')) {
        // เก็บเฉพาะฟิลด์ที่ลูปใช้ — สัญญาณเต็มก้อนคูณหมื่นแท่งกินหน่วยความจำโดยไม่จำเป็น
        sigAt[i] = { action: sig.action, strength: sig.strength,
          entry_price: sig.entry_price, stop_loss: sig.stop_loss, take_profit: sig.take_profit };
      }
    }
  }

  const out = { symbol: ds.symbol, market: ds.market, timeframe: ds.timeframe,
    verdict: ds.verdict, bars: ds.candles.length, splits: {} };

  for (const split of wd.splits) {
    const win = windows[split];
    out.splits[split] = {};
    for (const v of wd.variants) {
      if (!win) { out.splits[split][v.id] = { trades: [], skipped: 0, signals: 0, blocked: 0 }; continue; }
      out.splits[split][v.id] = walkForward({
        ds, sigAt, feat, gate: makeGate(v.rules),
        entryFrom: win.from, entryTo: win.to,
        maxHoldBars: wd.maxHoldBars, minHistory: wd.minHistory,
        costFraction, costFractionBase,
      });
    }
    out.splits[split].window = win
      ? { from: ds.candles[win.from]?.timestamp ?? null, to: ds.candles[win.to]?.timestamp ?? null }
      : null;
  }
  return out;
}

if (!isMainThread) {
  const wd = workerData;
  const mods = await loadSrcModules(['src/lib/indicators.ts']);
  const real = mods.indicators;
  parentPort.on('message', (msg) => {
    if (msg.cmd === 'done') { parentPort.close(); return; }
    try {
      const ds = loadDataset(msg.file);
      parentPort.postMessage({ result: runOne(ds, real, wd) });
    } catch (err) {
      parentPort.postMessage({ error: err?.stack ?? String(err), file: msg.file });
    }
  });
  parentPort.postMessage({ ready: true });
}

// ═══════════════════════════════ การวิเคราะห์ ═══════════════════════════════

const tradeKey = (t) => `${t.symbol}|${t.timeframe}|${t.entryIndex}`;

/**
 * แยกผลของกฎออกเป็นสามกอง เพื่อตอบคำถาม "ดีขึ้นเพราะตัดไม้แย่ หรือเพราะบังเอิญเหลือไม้ดี"
 *
 *   กองที่ถูกตัด (dropped) — ไม้ที่พื้นฐานเคยเทรด แต่กฎนี้ห้าม
 *                             ถ้ากองนี้ avgR แย่กว่าพื้นฐานจริง = กฎตัดถูกตัว
 *   กองที่เหลือ (kept)      — ไม้ที่มีทั้งสองฝั่ง (เข้าที่แท่งเดียวกัน ผลเหมือนกันเป๊ะ)
 *   กองที่เข้ามาแทน (new)   — ไม้ที่พื้นฐานไม่เคยเทรด เพราะตอนนั้นติดไม้ค้างอยู่
 *                             กองนี้คือครึ่งที่การกรองบนตาราง CSV มองไม่เห็น
 */
function decompose(baseTrades, variantTrades) {
  const baseKeys = new Set(baseTrades.map(tradeKey));
  const varKeys = new Set(variantTrades.map(tradeKey));
  const dropped = baseTrades.filter((t) => !varKeys.has(tradeKey(t)));
  const kept = baseTrades.filter((t) => varKeys.has(tradeKey(t)));
  const fresh = variantTrades.filter((t) => !baseKeys.has(tradeKey(t)));
  return { dropped, kept, fresh };
}

/** จำนวนไม้ต่อเดือนของทั้งจักรวาล — เจ้าของต้องมีของให้เทรดจริง ไม่ใช่แค่ค่าเฉลี่ยสวย */
function tradesPerMonth(trades) {
  if (!trades.length) return 0;
  let lo = Infinity; let hi = -Infinity;
  for (const t of trades) {
    const a = Date.parse(t.entryTime);
    const b = Date.parse(t.exitTime);
    if (a < lo) lo = a;
    if (b > hi) hi = b;
  }
  const months = (hi - lo) / (1000 * 60 * 60 * 24 * 30.436875);
  return months > 0 ? trades.length / months : trades.length;
}

function summarise(trades, ctx) {
  const rNet = trades.map((t) => t.rNet);
  const rGross = trades.map((t) => t.rGross);
  const rCap = trades.map((t) => t.rNetCapped);
  return {
    n: trades.length,
    gross: baseStats(rGross),
    net: baseStats(rNet),
    capped: baseStats(rCap),
    ciTrade: bootstrapMeanCI(rNet, { B: ctx.bootstrap, seed: ctx.seed }),
    ciCluster: bootstrapMeanCI(rNet, { B: ctx.bootstrap, seed: ctx.seed ^ 0x5bf03635,
      clusters: clusterMap(trades, (t) => `${t.symbol}|${t.timeframe}`, 'rNet') }),
    avgCostR: trades.length ? trades.reduce((a, t) => a + t.costR, 0) / trades.length : 0,
    perMonth: tradesPerMonth(trades),
  };
}

// ═══════════════════════════════ โหมดตรวจสำเนา ═══════════════════════════════

/**
 * บังคับให้ "ประตูปิด" ให้ตัวเลขตรงกับ baseline-v2 ทุกหลัก
 * ถ้าไม่ตรง = สำเนาเพี้ยน = ตัวเลขทุกตัวในรายงานนี้ใช้ไม่ได้ → exit 1
 */
function verifyAgainstBaseline(bySplit) {
  if (!fs.existsSync(BASELINE_FILE)) {
    throw new Error(`ไม่พบ ${BASELINE_FILE} — สั่ง node scripts/research/lab.mjs --tag=baseline-v2 ก่อน`);
  }
  const b = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  if (b.riskModel !== 'planned' || b.costScenario !== 'base' || b.maxHoldBars !== 10 || b.minHistory !== 60) {
    throw new Error('baseline-v2 ถูกสร้างด้วยค่าตั้งต้นคนละชุด — เทียบไม่ได้');
  }
  const rows = [];
  let bad = 0;
  for (const split of ['train', 'validation']) {
    const mine = bySplit[split]?.BASE;
    const theirs = b.results?.[split]?.cohortAll;
    if (!mine || !theirs) continue;
    const check = (field, got, want) => {
      const ok = got === want;
      if (!ok) bad++;
      rows.push({ split, field, got, want, ok });
    };
    check('จำนวนไม้', mine.length, theirs.tradeCount ?? b.results[split].tradeCountAll);
    const gs = baseStats(mine.map((t) => t.rGross));
    const ns = baseStats(mine.map((t) => t.rNet));
    check('ไม้ชนะ (net)', ns.wins, theirs.net.stats.wins);
    check('avgR ก่อนหักต้นทุน', gs.avgR, theirs.gross.stats.avgR);
    check('avgR หลังหักต้นทุน', ns.avgR, theirs.net.stats.avgR);
    check('sumR หลังหักต้นทุน', ns.sumR, theirs.net.stats.sumR);
    check('R ต่ำสุด', ns.minR, theirs.net.stats.minR);
    check('R สูงสุด', ns.maxR, theirs.net.stats.maxR);
  }
  return { rows, bad };
}

// ═══════════════════════════════ รายงาน ═══════════════════════════════

function fmtCI(ci) { return ci ? `[${n2(ci.lo95)}, ${n2(ci.hi95)}]` : 'n/a'; }

function buildReport(ctx) {
  const L = [];
  const W = (s = '') => L.push(s);

  W('# ทดลอง: ไม่เทรดตอนตลาดไม่มีเทรนด์');
  W('');
  W(`> รันเมื่อ ${ctx.generatedAt} · git ${ctx.git} · ${ctx.datasetCount} ชุดข้อมูล`);
  W(`> ชุดที่วัด: **${ctx.splits.join(' + ')}** · ตัวหารของ R = planned · ต้นทุน = ${ctx.costScenario}`);
  W(`> bootstrap ${ctx.bootstrap.toLocaleString()} รอบ · seed ${ctx.seed} · เวลารัน ${(ctx.elapsedMs / 1000).toFixed(1)} วินาที`);
  W('> **ไม่มีตัวเลขใดในเอกสารนี้มาจากชุด test** — สคริปต์นี้รันบน test ไม่ได้เลยโดยโครงสร้าง');
  W('');
  W('---');
  W('');

  // ── ด่านตรวจสำเนา ──
  W('## 0. ด่านตรวจสำเนา (ต้องผ่านก่อนอ่านตัวเลขอื่น)');
  W('');
  W('ไฟล์นี้เดินลูป walk-forward เอง จึงต้องพิสูจน์ว่า "ประตูปิด = ไม่กรองอะไรเลย" ให้ผล');
  W('ตรงกับ `baseline-v2` ที่ `lab.mjs` สร้างไว้ **ทุกหลัก** ไม่ใช่ "ใกล้เคียง"');
  W('');
  W('| ชุด | สิ่งที่เทียบ | ไฟล์นี้ | baseline-v2 | ผล |');
  W('| --- | --- | --- | --- | --- |');
  for (const r of ctx.verify.rows) {
    const g = typeof r.got === 'number' && !Number.isInteger(r.got) ? r.got.toFixed(12) : r.got;
    const w = typeof r.want === 'number' && !Number.isInteger(r.want) ? r.want.toFixed(12) : r.want;
    W(`| ${r.split} | ${r.field} | ${g} | ${w} | ${r.ok ? 'ตรง' : '**ต่าง**'} |`);
  }
  W('');
  W(ctx.verify.bad === 0
    ? '**ผ่าน** — สำเนาให้ผลเท่าต้นฉบับทุกหลัก ตัวเลขข้างล่างจึงเทียบกับ baseline-v2 ได้ตรง ๆ'
    : `**ไม่ผ่าน — ต่าง ${ctx.verify.bad} จุด** ห้ามใช้ตัวเลขใด ๆ ในเอกสารนี้`);
  W('');
  W('---');
  W('');

  // ── รายการที่ทดสอบ ──
  W('## 1. ทุกแบบที่ทดสอบ (ประกาศไว้ก่อนรัน)');
  W('');
  W(`ทดสอบทั้งหมด **${N_COMPARISONS} แบบ** เทียบกับพื้นฐาน รายการนี้ถูกเขียนลงในโค้ดก่อนเห็นผลใด ๆ`);
  W(`และรายงานพิมพ์ทุกแบบเสมอ — เกณฑ์ "มีนัย" จึงต้องแก้ตามจำนวนที่เทียบ (Bonferroni):`);
  W(`**p < 0.05 / ${N_COMPARISONS} = ${(0.05 / N_COMPARISONS).toFixed(4)}**`);
  W('');
  const ran = new Set(ctx.variants.map((v) => v.id));
  W('| รหัส | กฎ | รันในรอบนี้ |');
  W('| --- | --- | :---: |');
  for (const v of VARIANTS) W(`| \`${v.id}\` | ${variantLabel(v)} | ${ran.has(v.id) ? 'ใช่' : '—'} |`);
  W('');
  if (ran.size < VARIANTS.length) {
    W(`รอบนี้รันเพียง ${ran.size - 1} แบบจาก ${N_COMPARISONS} แบบ (ระบุด้วย \`--variants=\`)`);
    W(`เกณฑ์ Bonferroni ของรอบนี้จึงเป็น **0.05 / ${ran.size - 1} = ${(0.05 / (ran.size - 1)).toFixed(4)}**`);
    W('— แต่ต้องนับรวมกับทุกแบบที่เคยลองบน train ด้วยเมื่อจะสรุปข้ามเอกสาร');
    W('');
  }
  W(`ATR% ที่ยังมีอดีตไม่ถึง ${ATR_RANK_MIN_OBS} แท่ง = "ตัดสินไม่ได้" → ปล่อยผ่าน`);
  W('(การบล็อกเพราะไม่มีข้อมูลคือการกรองด้วยอายุของชุดข้อมูล ไม่ใช่ด้วยความผันผวน)');
  W('');
  W('---');
  W('');

  for (const split of ctx.splits) {
    const S = ctx.bySplit[split];
    const base = S.BASE;
    W(`## 2. ผลบนชุด ${split.toUpperCase()}`);
    W('');
    W('### 2.1 ตัวเลขหลัก (R หลังหักต้นทุน · ตัวหาร planned)');
    W('');
    W('| แบบ | ไม้ | เหลือ % | ชนะ | avgR ก่อนหักต้นทุน | avgR หลังหักต้นทุน | CI95 ราย-สัญลักษณ์ | PF | ไม้/เดือน |');
    W('| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |');
    for (const v of ctx.variants) {
      const s = ctx.summary[split][v.id];
      const share = base.length ? s.n / base.length : null;
      W(`| \`${v.id}\` | ${s.n.toLocaleString()} | ${pct(share)} | ${pct(s.net.winRate)} `
        + `| ${n2(s.gross.avgR)} | **${n2(s.net.avgR)}** | ${fmtCI(s.ciCluster)} `
        + `| ${n2(s.net.profitFactor, 3)} | ${s.perMonth.toFixed(1)} |`);
    }
    W('');

    W('### 2.2 ส่วนต่างจากพื้นฐาน (bootstrap จับคู่ราย-สัญลักษณ์)');
    W('');
    W('สุ่มสัญลักษณ์ชุดเดียวกันให้ทั้งสองแบบ แล้ววัดส่วนต่าง — ความไม่แน่นอนของ');
    W('"สัญลักษณ์ไหนถูกหยิบ" จึงหักล้างกันไป เหลือแต่ผลของกฎ');
    W('');
    const alpha = 0.05 / Math.max(1, ctx.variants.length - 1);
    W(`| แบบ | Δ avgR | CI95 ของ Δ | p (ด้านเดียว) | ผ่านเกณฑ์ Bonferroni ${alpha.toFixed(4)} | Δ ที่ตัดหางแล้ว (±${TAIL_CAP}) |`);
    W('| --- | ---: | --- | ---: | :---: | ---: |');
    for (const v of ctx.variants) {
      if (v.id === 'BASE') continue;
      const d = ctx.diff[split][v.id];
      const pass = d.ci && d.ci.pLE0 < alpha;
      W(`| \`${v.id}\` | ${n2(d.delta)} | ${fmtCI(d.ci)} | ${d.ci ? d.ci.pLE0.toFixed(4) : 'n/a'} `
        + `| ${pass ? 'ผ่าน' : 'ไม่ผ่าน'} | ${n2(d.deltaCapped)} |`);
    }
    W('');
    W('คอลัมน์สุดท้ายคือกติกาบังคับใน `report/metric-fix.md` ข้อ 7.2: ข้อสรุปที่ตัดสินด้วย');
    W(`ส่วนต่างเล็กกว่า 0.01 R/ไม้ ต้องไม่พลิกระหว่างคอลัมน์ Δ กับ Δ ที่ตัดหางแล้ว`);
    W('');

    W('### 2.3 แยกสามกอง — กฎนี้ตัดไม้แย่ทิ้ง หรือแค่เหลือไม้ที่บังเอิญดี');
    W('');
    W('เทียบกับ **ชุดไม้ของพื้นฐาน** ไม้ต่อไม้ (คีย์ = สัญลักษณ์+กรอบเวลา+แท่งที่เข้า)');
    W('');
    W('| แบบ | ถูกตัด (ไม้) | avgR ของกองที่ถูกตัด | เหลือไว้ (ไม้) | avgR ของกองที่เหลือ | เข้ามาแทน (ไม้) | avgR ของกองที่เข้ามาแทน |');
    W('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const v of ctx.variants) {
      if (v.id === 'BASE') continue;
      const d = ctx.decomp[split][v.id];
      W(`| \`${v.id}\` | ${d.dropped.n.toLocaleString()} | ${n2(d.dropped.avgR)} `
        + `| ${d.kept.n.toLocaleString()} | ${n2(d.kept.avgR)} `
        + `| ${d.fresh.n.toLocaleString()} | ${n2(d.fresh.avgR)} |`);
    }
    W('');
    W(`avgR ของพื้นฐานทั้งชุด = **${n2(ctx.summary[split].BASE.net.avgR)}**`);
    W('· ถ้า "กองที่ถูกตัด" แย่กว่านี้ = กฎตัดถูกตัวจริง · ถ้าใกล้เคียงกัน = กฎแค่ตัดไม้แบบสุ่ม');
    W('');

    W('### 2.4 สภาพตลาดของไม้พื้นฐาน (ฐานของทุกกฎข้างบน)');
    W('');
    W('| กลุ่ม | ไม้ | สัดส่วน | avgR หลังหักต้นทุน | CI95 ราย-สัญลักษณ์ |');
    W('| --- | ---: | ---: | ---: | --- |');
    for (const g of ctx.regimeBreakdown[split]) {
      W(`| ${g.label} | ${g.n.toLocaleString()} | ${pct(g.share)} | ${n2(g.avgR)} | ${fmtCI(g.ci)} |`);
    }
    W('');
    W('---');
    W('');
  }

  return `${L.join('\n')}\n`;
}

function printHelp() {
  console.log(`
regime.mjs — ทดสอบสมมติฐาน "ไม่เทรดตอนตลาดไม่มีเทรนด์"

  node scripts/research/experiments/regime.mjs [options]

  --verify                 ตรวจว่าสำเนาลูปให้ผลตรงกับ baseline-v2 แล้วออก
  --split=train            ชุดที่จะวัด (train | validation | train,validation) — ค่าเริ่มต้น train
  --variants=T1,T2         จำกัดแบบที่รัน (BASE ถูกใส่ให้เสมอ)
  --tag=<ชื่อ>              ชื่อไฟล์รายงาน (ค่าเริ่มต้น exp-regime)
  --bootstrap=10000 --seed=20260817 --jobs=N
  --cost=zero|base|pessimistic

  ⛔ ไม่มีสวิตช์ให้รันบนชุด test — ประตูของ test อยู่ที่ lab.mjs เท่านั้น
`);
}

// ═══════════════════════════════ main ═══════════════════════════════

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  const jobs = Number(args.jobs ?? Math.max(1, os.cpus().length - 2));
  const maxHoldBars = 10;   // ต้องเท่ากับ baseline-v2 ไม่งั้นเทียบไม่ได้
  const minHistory = 60;
  const bootstrap = Number(args.bootstrap ?? 10000);
  const seed = Number(args.seed ?? 20260817);
  const costScenario = String(args.cost ?? 'base');
  if (!['zero', 'base', 'pessimistic'].includes(costScenario)) throw new Error('--cost ต้องเป็น zero|base|pessimistic');

  const splits = args.verify
    ? ['train', 'validation']
    : String(args.split ?? 'train').split(',').map((s) => s.trim()).filter(Boolean);
  for (const s of splits) {
    if (s === 'test') throw new Error('regime.mjs รันบนชุด test ไม่ได้ — ใช้ lab.mjs ซึ่งมีสมุดบันทึกกำกับ');
    if (!['train', 'validation'].includes(s)) throw new Error(`ไม่รู้จัก split "${s}"`);
  }

  let variants = VARIANTS;
  if (args.variants) {
    const want = new Set(String(args.variants).split(',').map((s) => s.trim()));
    want.add('BASE');
    variants = VARIANTS.filter((v) => want.has(v.id));
    const missing = [...want].filter((w) => !VARIANTS.some((v) => v.id === w));
    if (missing.length) throw new Error(`ไม่รู้จักแบบ: ${missing.join(', ')}`);
  }
  if (args.verify) variants = VARIANTS.filter((v) => v.id === 'BASE');

  const bounds = loadSplitBoundaries();
  const allFiles = listCacheFiles();
  const metas = allFiles.map(readMetaOnly);
  const files = metas.filter((m) => m.verdict !== 'bad').map((m) => m.file);
  if (!files.length) throw new Error('ไม่มีชุดข้อมูลให้รัน');

  console.log(`[regime] ${files.length} ชุดข้อมูล · ${variants.length} แบบ · split ${splits.join(',')} · worker ${jobs} ตัว`);
  const t0 = performance.now();
  const payload = {
    splits, bounds, maxHoldBars, minHistory, costScenario, costTable: COST_BPS,
    variants: variants.map((v) => ({ id: v.id, rules: v.rules })),
  };
  const results = await runDatasetsInWorkers(jobs, files, payload, (done, total) => {
    if (done % 20 === 0 || done === total) console.log(`  ...${done}/${total}`);
  });
  const elapsedMs = performance.now() - t0;

  // ── รวมไม้ทุกชุดข้อมูล เรียงตามเวลาปิด (เหมือน lab.mjs เพื่อให้ drawdown เทียบกันได้) ──
  const bySplit = {};
  for (const split of splits) {
    bySplit[split] = {};
    for (const v of variants) bySplit[split][v.id] = [];
  }
  for (const r of results) {
    for (const split of splits) {
      const sp = r.splits[split];
      if (!sp) continue;
      for (const v of variants) {
        const got = sp[v.id];
        if (got) for (const t of got.trades) bySplit[split][v.id].push(t);
      }
    }
  }
  for (const split of splits) {
    for (const v of variants) {
      bySplit[split][v.id].sort((a, b) => (a.exitTime < b.exitTime ? -1 : a.exitTime > b.exitTime ? 1
        : (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1
          : (a.timeframe < b.timeframe ? -1 : a.timeframe > b.timeframe ? 1 : a.entryIndex - b.entryIndex))));
    }
  }

  const verify = verifyAgainstBaseline(bySplit);
  for (const r of verify.rows) {
    console.log(`  [verify] ${r.ok ? '✓' : '✗'} ${r.split} ${r.field}: ${r.got} ${r.ok ? '==' : '!='} ${r.want}`);
  }
  if (verify.bad) {
    console.error(`\n[regime] ด่านตรวจสำเนาไม่ผ่าน — ต่าง ${verify.bad} จุด ห้ามใช้ตัวเลขจากการรันนี้`);
    process.exit(1);
  }
  console.log('[regime] ด่านตรวจสำเนาผ่าน — สำเนาให้ผลเท่า baseline-v2 ทุกหลัก');
  if (args.verify) { console.log(`[regime] เสร็จใน ${(elapsedMs / 1000).toFixed(1)} วินาที`); return; }

  // ── สถิติ ──
  const ctx = {
    generatedAt: new Date().toISOString(), git: gitHead(), splits, bootstrap, seed,
    costScenario, datasetCount: results.length, elapsedMs, verify,
    // เก็บเฉพาะแบบที่รันจริงในรอบนี้ — ตารางในรายงานต้องไม่พิมพ์แบบที่ไม่ได้รัน
    variants: variants.map((v) => ({ id: v.id, rules: v.rules, label: variantLabel(v) })),
    bySplit, summary: {}, diff: {}, decomp: {}, regimeBreakdown: {},
  };

  for (const split of splits) {
    ctx.summary[split] = {};
    ctx.diff[split] = {};
    ctx.decomp[split] = {};
    const base = bySplit[split].BASE;
    for (const v of variants) ctx.summary[split][v.id] = summarise(bySplit[split][v.id], ctx);

    const clBase = clusterMap(base, (t) => `${t.symbol}|${t.timeframe}`, 'rNet');
    const clBaseCap = clusterMap(base, (t) => `${t.symbol}|${t.timeframe}`, 'rNetCapped');
    let s = seed;
    for (const v of variants) {
      if (v.id === 'BASE') continue;
      const tr = bySplit[split][v.id];
      s = (s + 0x9e3779b9) >>> 0;
      const cl = clusterMap(tr, (t) => `${t.symbol}|${t.timeframe}`, 'rNet');
      const clCap = clusterMap(tr, (t) => `${t.symbol}|${t.timeframe}`, 'rNetCapped');
      const ci = bootstrapDiffCI(cl, clBase, { B: bootstrap, seed: s });
      const ciCap = bootstrapDiffCI(clCap, clBaseCap, { B: bootstrap, seed: s });
      ctx.diff[split][v.id] = {
        delta: ctx.summary[split][v.id].net.avgR - ctx.summary[split].BASE.net.avgR,
        deltaCapped: ctx.summary[split][v.id].capped.avgR - ctx.summary[split].BASE.capped.avgR,
        ci, ciCapped: ciCap,
      };

      const d = decompose(base, tr);
      const stat = (arr) => ({ n: arr.length, avgR: arr.length ? arr.reduce((a, t) => a + t.rNet, 0) / arr.length : null });
      ctx.decomp[split][v.id] = { dropped: stat(d.dropped), kept: stat(d.kept), fresh: stat(d.fresh) };
    }

    // ── สภาพตลาดของไม้พื้นฐาน ──
    const groups = [
      ['เทรนด์ออกข้าง (sideways)', (t) => t.trend === 'sideways'],
      ['เทรนด์หนุนทิศ', (t) => (t.action === 'BUY' ? t.trend === 'uptrend' : t.trend === 'downtrend')],
      ['เทรนด์สวนทิศ', (t) => (t.action === 'BUY' ? t.trend === 'downtrend' : t.trend === 'uptrend')],
      ['ไม่มี MA200 (ข้อมูลสั้นกว่า 200 แท่ง)', (t) => !t.hasMA200],
      ['อยู่ฝั่งเดียวกับ MA200', (t) => t.ma200Ok === true],
      ['สวนฝั่ง MA200', (t) => t.ma200Ok === false],
      ['ผันผวนสูง (ATR% > p67 ของตัวเอง)', (t) => t.atrRank !== null && t.atrRank > 0.67],
      ['ผันผวนสูงมาก (ATR% > p80 ของตัวเอง)', (t) => t.atrRank !== null && t.atrRank > 0.80],
      ['อันดับความผันผวนยังตัดสินไม่ได้', (t) => t.atrRank === null],
    ];
    let gs = seed ^ 0x1234567;
    ctx.regimeBreakdown[split] = groups.map(([label, pred]) => {
      const g = base.filter(pred);
      gs = (gs + 0x9e3779b9) >>> 0;
      return {
        label, n: g.length, share: base.length ? g.length / base.length : null,
        avgR: g.length ? g.reduce((a, t) => a + t.rNet, 0) / g.length : null,
        ci: g.length ? bootstrapMeanCI(g.map((t) => t.rNet), { B: Math.min(bootstrap, 4000), seed: gs,
          clusters: clusterMap(g, (t) => `${t.symbol}|${t.timeframe}`, 'rNet') }) : null,
      };
    });
  }

  // ── เขียนรายงาน ──
  const tag = String(args.tag ?? 'exp-regime');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const md = buildReport(ctx);
  const mdFile = path.join(REPORT_DIR, `${tag}.md`);
  fs.writeFileSync(mdFile, md, 'utf8');

  const json = {
    generatedAt: ctx.generatedAt, git: ctx.git, splits, bootstrap, seed, costScenario,
    maxHoldBars, minHistory, riskModel: 'planned', datasetCount: results.length,
    nComparisons: N_COMPARISONS, bonferroniAlpha: 0.05 / N_COMPARISONS,
    atrRankMinObs: ATR_RANK_MIN_OBS, tailCap: TAIL_CAP,
    variants: VARIANTS.map((v) => ({ id: v.id, rules: v.rules, label: variantLabel(v) })),
    verify, summary: ctx.summary, diff: ctx.diff, decomp: ctx.decomp,
    regimeBreakdown: ctx.regimeBreakdown, elapsedMs,
  };
  fs.writeFileSync(path.join(REPORT_DIR, `${tag}.json`), `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  console.log(md);
  console.log(`[regime] เขียนรายงานที่ ${path.relative(ROOT, mdFile)} (+ .json)`);
}

if (isMainThread) {
  main().catch((err) => {
    console.error(`\n[regime] ล้มเหลว: ${err?.message ?? err}`);
    if (process.env.LAB_DEBUG) console.error(err);
    process.exit(1);
  });
}
