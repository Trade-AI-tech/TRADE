#!/usr/bin/env node
/**
 * diagnose.mjs — เครื่องมือ "หาว่าเงินรั่วตรงไหน" ของเครื่องยนต์สัญญาณปัจจุบัน
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ไฟล์นี้ "วัด" อย่างเดียว ไม่แก้กลยุทธ์ และไม่แตะไฟล์ของใคร
 *  ต้นฉบับที่ถูกวัดคือ src/lib/signal-engine.ts เสมอ (ผ่านสำเนาที่ปรับค่าได้ engine-lab.mjs
 *  ซึ่งมีตัวตรวจ parity คุมอยู่แล้ว) — ที่นี่ไม่มีการเขียนตรรกะสัญญาณใหม่
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ทำไมต้องมีไฟล์นี้
 *   674 ไม้ · profit factor 0.98 บอกแค่ว่า "ไม่มี edge" แต่ไม่บอกว่ารั่วตรงไหน
 *   ถ้าไปปรับค่าโดยไม่รู้ว่ารั่วตรงไหน = เดาที่ดูเหมือนวิทยาศาสตร์
 *   ไฟล์นี้จึงตอบ 5 คำถามด้วยตัวเลขที่วัดได้จริงบนคลัง .research-cache/candles
 *
 * ─────────────────────────── ทำไมต้องมีทางลัดคำนวณ (fast path) ───────────────────────────
 *
 *   backtest แบบตรงไปตรงมาเรียก generateSignal(candles.slice(0, i+1)) ทุกแท่ง
 *   ซึ่งคำนวณ SMA(200) ใหม่ทั้งชุดทุกครั้ง → O(N² × 200) ต่อหนึ่ง dataset
 *   ผลรวม N² ของ 1D ทั้งจักรวาลคือ 3.23e9 → คูณ 200 แล้วรันไม่ไหวแม้แต่รอบเดียว
 *   และงานนี้ต้องรันหลายสิบรอบ (ปิดกฎทีละตัว)
 *
 *   ทางลัดที่ใช้อาศัยคุณสมบัติ "prefix-stable": SMA/EMA/RSI/MACD/BB ที่ดัชนี i
 *   ขึ้นกับ values[0..i] เท่านั้น การคำนวณทั้งชุดครั้งเดียวแล้วอ่าน [i] จึงได้เลข
 *   "เดียวกันบิตต่อบิต" กับการคำนวณบน prefix — ไม่ใช่การประมาณ และไม่ใช่ look-ahead
 *   เพราะค่าที่อ่านที่ดัชนี i ไม่มีทางแตะข้อมูลหลัง i ได้เลยตามนิยามของฟังก์ชันเอง
 *
 *   ข้ออ้างนี้ไม่ได้ให้เชื่อเปล่า ๆ — ชั้น V1 เทียบผลทุกฟิลด์ของ generateSignal ตัวจริง
 *   กับทางลัดทีละแท่งบนตัวอย่างจริง ถ้าต่างแม้แท่งเดียวคือหยุดทั้งงาน
 *
 * ─────────────────────────────────── วิธีใช้ ───────────────────────────────────
 *
 *   node scripts/research/diagnose.mjs                 # รันเต็ม เขียน report/diagnosis.md
 *   node scripts/research/diagnose.mjs --verify-only   # รันแค่ชั้นตรวจสอบตัวเอง
 *   node scripts/research/diagnose.mjs --timeframe=1D
 *   node scripts/research/diagnose.mjs --limit=6       # จำกัด dataset (ไว้ debug)
 *   node scripts/research/diagnose.mjs --bootstrap=2000 --seed=20260817
 *
 * ต้องมี .research-cache/candles ก่อน (สร้างด้วย node scripts/research/fetch-universe.mjs)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSrcModules, ROOT } from './load-src-modules.mjs';
import { createLabEngine } from './engine-lab.mjs';

// ═══════════════════════════════════ อาร์กิวเมนต์ ═══════════════════════════════════

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
function argFlag(name) {
  return process.argv.includes(`--${name}`);
}
function fail(msg) {
  console.error(`\n[หยุด] ${msg}\n`);
  process.exit(1);
}

const OPT = {
  timeframes: (argValue('timeframe') ?? 'both').toLowerCase() === 'both'
    ? ['1D', '1H']
    : [(argValue('timeframe') ?? '1D').toUpperCase()],
  limit: argValue('limit') ? Number(argValue('limit')) : null,
  bootstrap: argValue('bootstrap') ? Number(argValue('bootstrap')) : 2000,
  seed: argValue('seed') ? Number(argValue('seed')) : 20260817,
  maxHoldBars: argValue('maxHoldBars') ? Number(argValue('maxHoldBars')) : 10,
  minHistory: argValue('minHistory') ? Number(argValue('minHistory')) : 60,
  feesR: argValue('feesR') ? Number(argValue('feesR')) : 0,
  verifyOnly: argFlag('verify-only'),
  includeBad: argFlag('include-bad'),
  out: argValue('out') ?? path.join('scripts', 'research', 'report', 'diagnosis.md'),
};

for (const tf of OPT.timeframes) {
  if (tf !== '1D' && tf !== '1H') fail(`--timeframe รองรับแค่ 1D / 1H / both (ได้ "${tf}")`);
}
if (!Number.isFinite(OPT.maxHoldBars) || OPT.maxHoldBars < 1) fail('--maxHoldBars ต้องเป็นตัวเลข >= 1');
if (!Number.isFinite(OPT.minHistory) || OPT.minHistory < 50) fail('--minHistory ต้องเป็นตัวเลข >= 50');
if (!Number.isFinite(OPT.feesR) || OPT.feesR < 0) fail('--feesR ต้องเป็นตัวเลข >= 0');

const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');

// ═══════════════════════════════════ สุ่มแบบซ้ำได้ ═══════════════════════════════════

/** mulberry32 — ต้องรันซ้ำได้เลขเดิม ไม่งั้นช่วงความเชื่อมั่นเปลี่ยนทุกครั้งที่รัน */
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════ หน้าต่างมองข้อมูลแบบไม่คัดลอก ═══════════════════════════════

/**
 * Win — "prefix view" ของอาร์เรย์แท่งเทียน
 *
 * generateSignal ทำ candles.map(c => c.close) ทุกครั้งที่ถูกเรียก ซึ่งเป็น O(L)
 * ต่อหนึ่งแท่ง → O(N²) แค่การคัดลอกอย่างเดียว ยังไม่นับคณิตศาสตร์
 * คลาสนี้ทำให้ .map() คืน subarray ของ Float64Array ที่เตรียมไว้แล้ว (O(1) ไม่คัดลอก)
 * ส่วน .slice(-k) ที่ detectPatterns/ATR ใช้ยังคืนแท่งจริงตามปกติ
 *
 * ข้อสำคัญ: Win ตัดที่ length เสมอ จึงเป็นไปไม่ได้ที่โค้ดปลายทางจะเห็นแท่งหลัง i
 */
class Win {
  constructor(bars, closesF64, len) {
    this.bars = bars;
    this._closes = closesF64;
    this.length = len;
  }
  map() {
    // ผู้เรียกเดียวคือ candles.map(c => c.close) — คืนมุมมองราคาปิดที่เตรียมไว้แล้ว
    return this._closes.subarray(0, this.length);
  }
  slice(a, b) {
    const L = this.length;
    let s = a === undefined ? 0 : a < 0 ? Math.max(0, L + a) : Math.min(a, L);
    let e = b === undefined ? L : b < 0 ? Math.max(0, L + b) : Math.min(b, L);
    if (e < s) e = s;
    return this.bars.slice(s, e);
  }
}

/**
 * ห่อ src/lib/indicators.ts ตัวจริงให้คำนวณครั้งเดียวต่อ dataset แล้วอ่านซ้ำ
 *
 * ตัวเลขทุกตัวยังมาจากฟังก์ชันตัวจริงทั้งหมด ยกเว้น findSupportResistance ที่ต้อง
 * ทำแบบเพิ่มทีละก้าว (incremental) เพราะผลของมันขึ้นกับ "ความยาว prefix" จริง ๆ
 * ไม่ใช่แค่ดัชนี — ตัวนั้นถูกตรวจแยกในชั้น V1 (เทียบผลลัพธ์สุดท้ายของ generateSignal)
 */
function makeFastIndicators(real, bars) {
  const N = bars.length;
  const closes = new Array(N);
  const highs = new Array(N);
  const lows = new Array(N);
  for (let i = 0; i < N; i++) {
    closes[i] = bars[i].close;
    highs[i] = bars[i].high;
    lows[i] = bars[i].low;
  }
  const closesF64 = Float64Array.from(closes);

  const cache = new Map();
  const memo = (k, fn) => {
    let v = cache.get(k);
    if (v === undefined) {
      v = fn();
      cache.set(k, v);
    }
    return v;
  };

  const swingsFor = (lb) =>
    memo(`sw:${lb}`, () => {
      const sh = new Uint8Array(N);
      const sl = new Uint8Array(N);
      for (let i = lb; i < N - lb; i++) {
        let isHigh = 1;
        let isLow = 1;
        for (let j = 1; j <= lb; j++) {
          if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = 0;
          if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = 0;
        }
        sh[i] = isHigh;
        sl[i] = isLow;
      }
      return { sh, sl };
    });

  // สถานะเดินหน้าอย่างเดียว — ต้นฉบับ uniq ด้วย Set ซึ่งเก็บ "ลำดับที่เจอครั้งแรก"
  // แล้วค่อย slice(-3) จึงต้องสะสมรายการไม่ซ้ำตามลำดับดัชนีให้ตรงกันเป๊ะ
  const st = { lb: null, cursor: 0, sup: [], res: [], supSet: new Set(), resSet: new Set() };
  function srReset(lb) {
    st.lb = lb;
    st.cursor = 0;
    st.sup = [];
    st.res = [];
    st.supSet = new Set();
    st.resSet = new Set();
  }
  function srFor(len, lb) {
    if (st.lb !== lb) srReset(lb);
    const limit = len - lb - 1; // ต้นฉบับวน i < candles.length - lookback
    if (limit + 1 < st.cursor) srReset(lb); // ถอยหลัง = สร้างใหม่ (กันสถานะปนกันข้ามรอบ)
    const { sh, sl } = swingsFor(lb);
    for (let i = Math.max(st.cursor, lb); i <= limit; i++) {
      if (sh[i]) {
        const v = Number(highs[i].toFixed(4));
        if (!st.resSet.has(v)) { st.resSet.add(v); st.res.push(v); }
      }
      if (sl[i]) {
        const v = Number(lows[i].toFixed(4));
        if (!st.supSet.has(v)) { st.supSet.add(v); st.sup.push(v); }
      }
    }
    if (limit + 1 > st.cursor) st.cursor = limit + 1;
    return {
      supports: st.sup.slice(-3).sort((a, b) => b - a),
      resistances: st.res.slice(-3).sort((a, b) => a - b),
    };
  }

  const ind = {
    SMA: (_v, p) => memo(`sma:${p}`, () => real.SMA(closes, p)),
    EMA: (_v, p) => memo(`ema:${p}`, () => real.EMA(closes, p)),
    RSI: (_v, p) => memo(`rsi:${p}`, () => real.RSI(closes, p)),
    MACD: (_v, f, s, g) => memo(`macd:${f}:${s}:${g}`, () => real.MACD(closes, f, s, g)),
    BollingerBands: (_v, p, s) => memo(`bb:${p}:${s}`, () => real.BollingerBands(closes, p, s)),
    ATR: (c, p) => real.ATR(c, p),
    detectPatterns: (c) => real.detectPatterns(c),
    determineTrend: real.determineTrend,
    findSupportResistance: (c, lb = 5) => srFor(c.length, lb),
  };

  return {
    ind,
    N,
    closes,
    highs,
    lows,
    win: (len) => new Win(bars, closesF64, len),
    resetWalk: () => srReset(st.lb ?? 5),
  };
}

// ═══════════════════════════════ ตัวช่วยสถิติ ═══════════════════════════════

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * ตัวสะสมผลรายสัญลักษณ์ — เก็บเป็นยอดรวม ไม่เก็บทุกไม้
 *
 * ทำไมพอ: avgR / profit factor / win rate / R ต่อ 1000 แท่ง คำนวณจากยอดรวมได้ตรงเป๊ะ
 * ทำให้ bootstrap 2000 รอบ x 20 config ไม่ต้องคัดลอกอาร์เรย์ไม้เป็นล้านครั้ง
 */
/**
 * เพดานตัดค่าสุดขั้ว (winsorize) — เก็บคู่ขนานไปกับค่าดิบเสมอ ไม่ได้แทนที่
 *
 * ทำไมต้องมี: R = กำไร ÷ |ราคาเข้า − SL| และราคาเข้าคือ "ราคาเปิดแท่งถัดไป"
 * ซึ่ง gap มาทับ SL ได้ backtest ตัวจริงทิ้งเฉพาะกรณีระยะเป็น 0 พอดี
 * แต่ระยะ 1e-9 ผ่านเข้ามาแล้วทำให้ R ของไม้เดียวใหญ่เป็นล้าน
 * ค่าเฉลี่ยจึงถูกไม้ไม่กี่ไม้ยึดไปทั้งหมด — ต้องรายงานทั้งสองเวอร์ชันให้เห็นความเปราะ
 */
const WINSOR = Number(argValue('winsor') ?? 5);
const clampR = (r) => (r > WINSOR ? WINSOR : r < -WINSOR ? -WINSOR : r);

const aggInit = () => ({ n: 0, sum: 0, gw: 0, gl: 0, wins: 0, losses: 0, sumW: 0, gwW: 0, glW: 0 });
function aggAdd(a, r) {
  a.n++;
  a.sum += r;
  if (r > 0) { a.wins++; a.gw += r; } else if (r < 0) { a.losses++; a.gl += -r; }
  const w = clampR(r);
  a.sumW += w;
  if (w > 0) a.gwW += w; else if (w < 0) a.glW += -w;
}
function aggPlus(dst, src) {
  dst.n += src.n; dst.sum += src.sum; dst.gw += src.gw; dst.gl += src.gl;
  dst.wins += src.wins; dst.losses += src.losses;
  dst.sumW += src.sumW; dst.gwW += src.gwW; dst.glW += src.glW;
}
function aggMetric(a, bars, name) {
  if (name === 'rPer1000') return bars > 0 ? (a.sum / bars) * 1000 : null;
  if (name === 'rwPer1000') return bars > 0 ? (a.sumW / bars) * 1000 : null;
  if (!a.n) return null;
  if (name === 'avgR') return a.sum / a.n;
  if (name === 'avgRw') return a.sumW / a.n;
  if (name === 'winRate') return a.wins / a.n;
  if (name === 'pf') return a.gl > 0 ? a.gw / a.gl : null;
  if (name === 'pfW') return a.glW > 0 ? a.gwW / a.glW : null;
  if (name === 'totalR') return a.sum;
  if (name === 'totalRw') return a.sumW;
  if (name === 'count') return a.n;
  throw new Error(`ไม่รู้จักตัวชี้วัด ${name}`);
}

/**
 * bootstrap แบบสุ่ม "ทั้งสัญลักษณ์" ไม่ใช่สุ่มทีละไม้
 *
 * ทำไม: ไม้ในสัญลักษณ์เดียวกันไม่เป็นอิสระต่อกัน (ตลาดเดียวกัน ช่วงเวลาซ้อนกัน
 * และไม้ติด ๆ กันมักมาจากคลื่นราคาลูกเดียวกัน) ถ้าสุ่มทีละไม้ ช่วงความเชื่อมั่น
 * จะแคบกว่าความจริงมาก แล้วเราจะเชื่อว่ามีนัยสำคัญทั้งที่เป็นความบังเอิญของหุ้นไม่กี่ตัว
 */
function bootstrapAgg(aggByKey, barsByKey, name, B, rng) {
  const keys = Object.keys(aggByKey);
  if (!keys.length) return null;
  const tot = aggInit();
  let totBars = 0;
  for (const k of keys) { aggPlus(tot, aggByKey[k]); totBars += barsByKey[k] ?? 0; }
  const point = aggMetric(tot, totBars, name);
  const draws = [];
  for (let b = 0; b < B; b++) {
    const acc = aggInit();
    let bars = 0;
    for (let c = 0; c < keys.length; c++) {
      const k = keys[(rng() * keys.length) | 0];
      aggPlus(acc, aggByKey[k]);
      bars += barsByKey[k] ?? 0;
    }
    const v = aggMetric(acc, bars, name);
    if (v !== null && Number.isFinite(v)) draws.push(v);
  }
  draws.sort((a, b) => a - b);
  return {
    point, n: tot.n, draws: draws.length,
    lo95: quantile(draws, 0.025), hi95: quantile(draws, 0.975),
    lo995: quantile(draws, 0.0025), hi995: quantile(draws, 0.9975),
  };
}

/**
 * ผลต่างของสองชุด โดยจับคู่ที่ "สัญลักษณ์เดียวกัน" ในทุกรอบ bootstrap
 * (ปิดกฎหนึ่งตัวแล้วชุดไม้เปลี่ยนทั้งชุด เทียบตรง ๆ ไม่ได้ ต้องคุมสัญลักษณ์ให้ตรงกัน)
 */
function bootstrapDelta(aggA, aggB, barsByKey, name, B, rng) {
  const keys = [...new Set([...Object.keys(aggA), ...Object.keys(aggB)])];
  if (!keys.length) return null;
  const sum = (src) => {
    const acc = aggInit();
    let bars = 0;
    for (const k of keys) { if (src[k]) aggPlus(acc, src[k]); bars += barsByKey[k] ?? 0; }
    return { acc, bars };
  };
  const A = sum(aggA);
  const B2 = sum(aggB);
  const va0 = aggMetric(A.acc, A.bars, name);
  const vb0 = aggMetric(B2.acc, B2.bars, name);
  const point = va0 === null || vb0 === null ? null : va0 - vb0;
  const draws = [];
  for (let b = 0; b < B; b++) {
    const accA = aggInit();
    const accB = aggInit();
    let bars = 0;
    for (let c = 0; c < keys.length; c++) {
      const k = keys[(rng() * keys.length) | 0];
      if (aggA[k]) aggPlus(accA, aggA[k]);
      if (aggB[k]) aggPlus(accB, aggB[k]);
      bars += barsByKey[k] ?? 0;
    }
    const va = aggMetric(accA, bars, name);
    const vb = aggMetric(accB, bars, name);
    if (va === null || vb === null || !Number.isFinite(va) || !Number.isFinite(vb)) continue;
    draws.push(va - vb);
  }
  draws.sort((a, b) => a - b);
  let neg = 0;
  for (const d of draws) if (d < 0) neg++;
  return {
    point, draws: draws.length,
    lo95: quantile(draws, 0.025), hi95: quantile(draws, 0.975),
    lo995: quantile(draws, 0.0025), hi995: quantile(draws, 0.9975),
    /** สัดส่วนรอบ bootstrap ที่ผลต่างกลับเครื่องหมาย — ใช้แทนค่า p แบบหยาบ ๆ */
    flipShare: draws.length ? Math.min(neg, draws.length - neg) / draws.length : null,
  };
}

/** รวมไม้เป็นยอดรายสัญลักษณ์ ตามตัวกรองที่ให้มา */
function aggregateTrades(trades, keyFn, filterFn) {
  const out = {};
  for (const t of trades) {
    if (filterFn && !filterFn(t)) continue;
    const k = keyFn(t);
    (out[k] ??= aggInit());
    aggAdd(out[k], t.r);
  }
  return out;
}

// ═══════════════════════════════ โหลด dataset จาก cache ═══════════════════════════════

function listCacheFiles() {
  if (!fs.existsSync(CACHE_DIR)) {
    fail(`ไม่พบ ${CACHE_DIR} — สั่ง node scripts/research/fetch-universe.mjs ก่อน`);
  }
  return fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
}

/**
 * โหลดหนึ่ง dataset แล้วตัดตาม quality.usable.from
 *
 * สัญญาจาก fetch-universe: แท่งที่ตีความไม่ได้บางส่วน (OOR) ยังอยู่ในไฟล์ ไม่ได้ถูกลบ
 * ผู้บริโภคต้องเคารพ quality.usable.from เอง — ไม่งั้นจะได้แท่งที่เป็นไปไม่ได้ติดมาด้วย
 */
function loadDataset(file) {
  const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
  const q = j.quality ?? {};
  const fromISO = q.usable?.from ?? null;
  const bars = fromISO ? j.candles.filter((c) => c.timestamp >= fromISO) : j.candles;
  return {
    key: `${j.market}:${j.symbol}:${j.timeframe}`,
    file,
    symbol: j.symbol,
    name: j.name,
    market: j.market,
    timeframe: j.timeframe,
    verdict: q.verdict ?? 'unknown',
    noUsableEra: !!q.noUsableEra,
    bars,
    from: bars.length ? bars[0].timestamp : null,
    to: bars.length ? bars[bars.length - 1].timestamp : null,
  };
}

function selectDatasets() {
  const files = listCacheFiles();
  const picked = [];
  const dropped = [];
  for (const f of files) {
    const tfMatch = OPT.timeframes.some((tf) => f.endsWith(`__${tf}.json`));
    if (!tfMatch) continue;
    const ds = loadDataset(f);
    if (ds.verdict === 'bad' && !OPT.includeBad) {
      dropped.push({ key: ds.key, reason: `คุณภาพ bad (${ds.noUsableEra ? 'ไม่มียุคไหนใช้ได้' : 'ไม่ผ่านเกณฑ์'})` });
      continue;
    }
    if (ds.bars.length < OPT.minHistory + 20) {
      dropped.push({ key: ds.key, reason: `แท่งใช้ได้ ${ds.bars.length} น้อยกว่า minHistory+20` });
      continue;
    }
    picked.push(ds);
    if (OPT.limit && picked.length >= OPT.limit) break;
  }
  return { picked, dropped };
}

// ═══════════════════════════════ ลูป backtest (สำเนาที่ถูกตรวจ) ═══════════════════════════════

/**
 * สำเนาลูปของ src/lib/backtest.ts — จำเป็นเพราะ runBacktest ตัวจริง import
 * generateSignal ตรง ๆ จึงรับเครื่องยนต์ที่ปรับค่าได้ไม่ได้ และไม่คืนข้อมูลรายไม้
 * ที่งานวินิจฉัยต้องใช้ (กฎไหนยิง / RR / ระบอบตลาด)
 *
 * ความเสี่ยงที่สำเนาจะเพี้ยนถูกปิดด้วยชั้น V2: เทียบไม้ต่อไม้กับ runBacktest ตัวจริง
 */
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
 * กติกาออกจากไม้ — ลอกลำดับจาก src/lib/backtest.ts บรรทัดต่อบรรทัด
 * เปิด gap ทะลุ → ออกที่ราคาเปิด · แตะทั้ง SL และ TP ในแท่งเดียว → นับ SL ก่อนเสมอ
 * แยกออกมาเป็นฟังก์ชันเพื่อให้ "การเข้าไม้แบบสุ่มทุกแท่ง" (ตัวเทียบฐาน) ใช้กติกาเดียวกันเป๊ะ
 */
function simulateExit(bars, entryIndex, lastHoldIndex, isLong, stopLoss, takeProfit) {
  let lastUsableIndex = entryIndex;
  for (let j = entryIndex; j <= lastHoldIndex; j++) {
    const bar = bars[j];
    if (!isUsableBar(bar)) continue;
    lastUsableIndex = j;
    if (isLong) {
      if (bar.open <= stopLoss) return { exitIndex: j, exit: bar.open, exitReason: 'gap_stop' };
      if (bar.open >= takeProfit) return { exitIndex: j, exit: bar.open, exitReason: 'gap_target' };
      if (bar.low <= stopLoss) return { exitIndex: j, exit: stopLoss, exitReason: 'stop_loss' };
      if (bar.high >= takeProfit) return { exitIndex: j, exit: takeProfit, exitReason: 'take_profit' };
    } else {
      if (bar.open >= stopLoss) return { exitIndex: j, exit: bar.open, exitReason: 'gap_stop' };
      if (bar.open <= takeProfit) return { exitIndex: j, exit: bar.open, exitReason: 'gap_target' };
      if (bar.high >= stopLoss) return { exitIndex: j, exit: stopLoss, exitReason: 'stop_loss' };
      if (bar.low <= takeProfit) return { exitIndex: j, exit: takeProfit, exitReason: 'take_profit' };
    }
  }
  return { exitIndex: lastUsableIndex, exit: bars[lastUsableIndex].close, exitReason: 'time_exit' };
}

function walk(engine, fast, ds, opts, onTrade) {
  const bars = ds.bars;
  const maxHoldBars = Math.max(1, Math.floor(opts.maxHoldBars));
  const minHistory = Math.max(50, Math.floor(opts.minHistory));
  const feesR = Number.isFinite(opts.feesR) ? opts.feesR : 0;
  fast.resetWalk();

  const rs = [];
  let skipped = 0;
  let i = minHistory;
  while (i <= bars.length - 2) {
    const sig = engine.generateSignal({
      symbol: ds.symbol, name: ds.name, market: ds.market,
      candles: fast.win(i + 1), timeframe: ds.timeframe,
    });
    if (!sig || (sig.action !== 'BUY' && sig.action !== 'SELL')) { i++; continue; }

    const entryIndex = i + 1;
    const entryBar = bars[entryIndex];
    if (!isUsableBar(entryBar)) { skipped++; i++; continue; }

    const isLong = sig.action === 'BUY';
    const dir = isLong ? 1 : -1;
    const entry = entryBar.open;
    const stopLoss = sig.stop_loss;
    const takeProfit = sig.take_profit;
    const riskPerUnit = Math.abs(entry - stopLoss);
    if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) { skipped++; i++; continue; }

    const lastHoldIndex = Math.min(entryIndex + maxHoldBars - 1, bars.length - 1);
    const ex = simulateExit(bars, entryIndex, lastHoldIndex, isLong, stopLoss, takeProfit);
    const { exitIndex, exit, exitReason } = ex;

    const r = ((exit - entry) * dir) / riskPerUnit - feesR;
    rs.push(r);
    if (onTrade) {
      // สูง/ต่ำสุด "ตลอดหน้าต่างถือเต็ม" ไม่ว่าไม้จะปิดไปก่อนหรือไม่
      // จงใจวัดแยกจากการปิดไม้ เพราะคำถามคือ "ราคาเคยเดินไปถึง TP ได้ไหมใน 10 แท่ง"
      // ซึ่งเป็นคุณสมบัติของตลาด ไม่ใช่ผลของกติกาออก
      let hiMax = -Infinity;
      let loMin = Infinity;
      for (let j = entryIndex; j <= lastHoldIndex; j++) {
        const bar = bars[j];
        if (!isUsableBar(bar)) continue;
        if (bar.high > hiMax) hiMax = bar.high;
        if (bar.low < loMin) loMin = bar.low;
      }
      onTrade({
        sig, r, entryIndex, exitIndex, entry, exit, stopLoss, takeProfit, riskPerUnit,
        exitReason, holdBars: exitIndex - entryIndex, isLong,
        entryTime: entryBar.timestamp, exitTime: bars[exitIndex].timestamp,
        hiMax, loMin, lastHoldIndex, signalIndex: i,
      });
    }
    i = exitIndex;
  }
  return { rs, skipped };
}

// ═══════════════════════════════ การถอดคะแนนรายกฎ ═══════════════════════════════

/**
 * ดัชนีคะแนนรายกฎ (คู่ bull/bear ติดกัน) — ใช้ Int8Array ต่อไม้เพื่อไม่ให้หน่วยความจำบาน
 * ค่าที่เก็บคือ "คะแนนที่กฎนั้นใส่เข้าไป" ไม่ใช่แค่ยิง/ไม่ยิง
 */
const RULES = ['rsiZone', 'rsiCross', 'macdCross', 'macdHist', 'trend', 'bb', 'pattern', 'sr'];
const RULE_TH = {
  rsiZone: 'RSI โซน 30/70',
  rsiCross: 'RSI ตัด 50',
  macdCross: 'MACD ตัดสัญญาณ',
  macdHist: 'MACD histogram',
  trend: 'เทรนด์ MA',
  bb: 'Bollinger แตะขอบ',
  pattern: 'แพตเทิร์นแท่งเทียน',
  sr: 'แนวรับ/แนวต้าน (คะแนน)',
};
const RI = Object.fromEntries(RULES.map((r, i) => [r, i]));

/**
 * ถอดคะแนน bull/bear รายกฎกลับมาจาก reasons ของสัญญาณ
 *
 * ทำไมถอดได้: reasons บันทึกทุกกฎที่ยิง (เมื่อไม่ถูก slice ทิ้ง) ยกเว้น macdHistogram
 * ที่ต้นฉบับให้คะแนนแต่ไม่ push reason — ตัวนั้นอ่านจากอนุกรม histogram ที่คำนวณไว้แล้ว
 * ด้วยเงื่อนไขเดียวกับต้นฉบับบรรทัดต่อบรรทัด
 *
 * ความถูกต้องของการถอดถูกพิสูจน์ในชั้น V3: bull/bear ที่ถอดได้ต้องทำนาย
 * action / strength / confidence ของสัญญาณจริงได้ถูกทุกไม้ ไม่งั้นหยุดงาน
 */
function decomposeScores(sig, histNow, histPrev) {
  const sc = new Int8Array(RULES.length * 2);
  const hasMA200 = sig.indicators.ma200 !== undefined;
  for (const rn of sig.reasons) {
    switch (rn.label) {
      case 'RSI Oversold': sc[RI.rsiZone * 2] += 2; break;
      case 'RSI Overbought': sc[RI.rsiZone * 2 + 1] += 2; break;
      case 'RSI Cross 50':
        if (rn.detail.includes('ตัดขึ้น')) sc[RI.rsiCross * 2] += 1;
        else sc[RI.rsiCross * 2 + 1] += 1;
        break;
      case 'MACD Bullish Cross': sc[RI.macdCross * 2] += 2; break;
      case 'MACD Bearish Cross': sc[RI.macdCross * 2 + 1] += 2; break;
      case 'Uptrend': sc[RI.trend * 2] += hasMA200 ? 2 : 1; break;
      case 'Downtrend': sc[RI.trend * 2 + 1] += hasMA200 ? 2 : 1; break;
      case 'BB Lower Touch': sc[RI.bb * 2] += 1; break;
      case 'BB Upper Touch': sc[RI.bb * 2 + 1] += 1; break;
      case 'Bullish Engulfing': case 'Hammer': sc[RI.pattern * 2] += 2; break;
      case 'Bearish Engulfing': case 'Shooting Star': sc[RI.pattern * 2 + 1] += 2; break;
      case 'At Support': sc[RI.sr * 2] += 1; break;
      case 'At Resistance': sc[RI.sr * 2 + 1] += 1; break;
      default: return null; // เจอ label ที่ไม่รู้จัก = สมมติฐานการถอดพัง ต้องรู้ทันที
    }
  }
  // MACD histogram — ต้นฉบับ: hist>0 และ hist เพิ่มขึ้น → bull / hist<0 และ hist ลดลง → bear
  if (Number.isFinite(histNow) && Number.isFinite(histPrev)) {
    if (histNow > 0 && histPrev < histNow) sc[RI.macdHist * 2] += 1;
    else if (histNow < 0 && histPrev > histNow) sc[RI.macdHist * 2 + 1] += 1;
  }
  let bull = 0, bear = 0;
  for (let k = 0; k < RULES.length; k++) { bull += sc[k * 2]; bear += sc[k * 2 + 1]; }
  return { sc, bull, bear, hasMA200 };
}

function predictedFromScores(bull, bear) {
  const total = Math.max(bull, bear);
  const net = bull - bear;
  let action = 'HOLD';
  if (net >= 3) action = 'BUY';
  else if (net <= -3) action = 'SELL';
  let strength = 'weak';
  if (total >= 8) strength = 'very_strong';
  else if (total >= 5) strength = 'strong';
  else if (total >= 3) strength = 'moderate';
  return { action, strength, confidence: Math.min(95, 40 + total * 6), total, net };
}

// ═══════════════════════════════ ตัวชี้วัดระบอบตลาด (อดีตล้วน) ═══════════════════════════════

/**
 * คำนวณตัวชี้วัดระบอบตลาดล่วงหน้าทั้งชุด — ทุกตัวใช้ข้อมูลถึงแท่ง i เท่านั้น
 *
 * atrPct[i]  = ATR(14) ที่แท่ง i หารด้วยราคาปิดแท่ง i (ความผันผวนเทียบขนาดราคา)
 * er20[i]    = Kaufman efficiency ratio 20 แท่ง = |ระยะสุทธิ| / |ระยะทางที่เดินจริง|
 *              ใกล้ 1 = วิ่งเป็นเส้นตรง (มีเทรนด์) · ใกล้ 0 = ส่ายไปมา (ออกข้าง)
 *              เลือกตัวนี้แทน ADX เพราะนิยามสั้นจนตรวจด้วยตาได้ และไม่ซ้ำกับอะไรใน engine
 *
 * เจตนา: ไม่ใช้เกณฑ์คงที่ข้ามสินทรัพย์ (ทองกับ PEPE ผันผวนคนละสเกล) แต่ใช้
 * "อันดับเทียบกับอดีตของตัวเอง 250 แท่งก่อนหน้า" ซึ่งเป็นอดีตล้วน ไม่มีอนาคตรั่ว
 */
function precomputeRegime(fast, bars) {
  const N = bars.length;
  const closes = fast.closes;
  const tr = new Float64Array(N).fill(NaN);
  for (let i = 1; i < N; i++) {
    const c = bars[i];
    const pc = bars[i - 1].close;
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  const atr = new Float64Array(N).fill(NaN);
  let sum = 0;
  for (let i = 1; i < N; i++) {
    sum += tr[i];
    if (i > 14) sum -= tr[i - 14];
    if (i >= 14) atr[i] = sum / 14;
  }
  const atrPct = new Float64Array(N).fill(NaN);
  for (let i = 0; i < N; i++) atrPct[i] = closes[i] > 0 ? atr[i] / closes[i] : NaN;

  const er = new Float64Array(N).fill(NaN);
  for (let i = 20; i < N; i++) {
    let path = 0;
    for (let k = i - 19; k <= i; k++) path += Math.abs(closes[k] - closes[k - 1]);
    er[i] = path > 0 ? Math.abs(closes[i] - closes[i - 20]) / path : NaN;
  }
  return { atr, atrPct, er };
}

/** อันดับเปอร์เซ็นไทล์ของ series[i] เทียบกับ series[i-window .. i-1] — อดีตล้วน */
function trailingPercentile(series, i, window) {
  const start = Math.max(0, i - window);
  if (i - start < 30) return null; // ตัวอย่างน้อยเกินกว่าจะจัดอันดับได้อย่างมีความหมาย
  const v = series[i];
  if (!Number.isFinite(v)) return null;
  let n = 0, le = 0;
  for (let k = start; k < i; k++) {
    const x = series[k];
    if (!Number.isFinite(x)) continue;
    n++;
    if (x <= v) le++;
  }
  return n >= 30 ? le / n : null;
}

// ═══════════════════════════════ ชั้นตรวจสอบตัวเอง ═══════════════════════════════

/**
 * V1 — ทางลัดต้องให้ผลเท่ากับ generateSignal ตัวจริงทุกฟิลด์
 * ยกเว้น id/created_at/expires_at ที่เป็นค่าที่ขึ้นกับเวลาและการสุ่มโดยธรรมชาติ
 */
function verifyPrefixEngine(realSignalEngine, datasets, maxBarsPerDs) {
  let compared = 0;
  const diffs = [];
  for (const ds of datasets) {
    const bars = ds.bars.slice(0, Math.min(maxBarsPerDs, ds.bars.length));
    const fast = makeFastIndicators(REAL.indicators, bars);
    const lab = createLabEngine(fast.ind, {});
    fast.resetWalk();
    const norm = (s) => (s === null ? null : { ...s, id: 0, created_at: 0, expires_at: 0 });
    for (let i = OPT.minHistory; i < bars.length; i++) {
      const a = realSignalEngine.generateSignal({
        symbol: ds.symbol, name: ds.name, market: ds.market,
        candles: bars.slice(0, i + 1), timeframe: ds.timeframe,
      });
      const b = lab.generateSignal({
        symbol: ds.symbol, name: ds.name, market: ds.market,
        candles: fast.win(i + 1), timeframe: ds.timeframe,
      });
      compared++;
      if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) {
        diffs.push({ ds: ds.key, i, real: norm(a), fast: norm(b) });
        if (diffs.length >= 3) return { compared, diffs };
      }
    }
  }
  return { compared, diffs };
}

/** V2 — ลูป backtest สำเนาต้องให้ไม้เหมือน runBacktest ตัวจริงทุกไม้ทุกฟิลด์ */
function verifyBacktestLoop(realBacktest, datasets, maxBarsPerDs) {
  let dsChecked = 0, tradesChecked = 0;
  const diffs = [];
  for (const ds of datasets) {
    const bars = ds.bars.slice(0, Math.min(maxBarsPerDs, ds.bars.length));
    const truth = realBacktest.runBacktest({
      symbol: ds.symbol, name: ds.name, market: ds.market, timeframe: ds.timeframe,
      candles: bars, maxHoldBars: OPT.maxHoldBars, minHistory: OPT.minHistory, feesR: OPT.feesR,
    });
    const fast = makeFastIndicators(REAL.indicators, bars);
    const lab = createLabEngine(fast.ind, {});
    const mine = [];
    const res = walk(lab, fast, { ...ds, bars }, OPT, (t) => mine.push(t));
    dsChecked++;
    if (res.skipped !== truth.skipped) {
      diffs.push({ ds: ds.key, field: 'skipped', real: truth.skipped, mine: res.skipped });
    }
    if (mine.length !== truth.trades.length) {
      diffs.push({ ds: ds.key, field: 'จำนวนไม้', real: truth.trades.length, mine: mine.length });
      continue;
    }
    for (let k = 0; k < mine.length; k++) {
      const a = truth.trades[k];
      const b = mine[k];
      tradesChecked++;
      const same =
        a.action === b.sig.action && a.entryIndex === b.entryIndex && a.exitIndex === b.exitIndex &&
        a.entry === b.entry && a.exit === b.exit && a.stopLoss === b.stopLoss &&
        a.takeProfit === b.takeProfit && a.exitReason === b.exitReason && a.r === b.r &&
        a.holdBars === b.holdBars && a.confidence === b.sig.confidence && a.strength === b.sig.strength;
      if (!same) {
        diffs.push({ ds: ds.key, field: `ไม้ที่ ${k}`, real: a, mine: { ...b, sig: undefined } });
        if (diffs.length >= 3) return { dsChecked, tradesChecked, diffs };
      }
    }
  }
  return { dsChecked, tradesChecked, diffs };
}

// ═══════════════════════════════ การรันหลัก ═══════════════════════════════

const REAL = {};

/** ชุด config ที่ต้องรัน — baseline ต้องเป็นตัวแรกเสมอ */
const CONFIGS = [
  { id: 'baseline', label: 'ค่าเริ่มต้น (เท่ากับระบบจริง)', patch: {}, group: 'base' },
  { id: 'reasons99', label: 'ค่าเริ่มต้น + maxReasons=99 (ตรวจว่าการติดเครื่องวัดไม่รบกวนผล)', patch: { decision: { maxReasons: 99 } }, group: 'check' },

  { id: 'off:rsiZone', label: 'ปิด RSI โซน 30/70', patch: { rules: { rsi: { zones: { enabled: false } } } }, group: 'loo', rule: 'rsiZone' },
  { id: 'off:rsiCross', label: 'ปิด RSI ตัด 50', patch: { rules: { rsi: { cross: { enabled: false } } } }, group: 'loo', rule: 'rsiCross' },
  { id: 'off:rsiAll', label: 'ปิด RSI ทั้งก้อน', patch: { rules: { rsi: { enabled: false } } }, group: 'loo' },
  { id: 'off:macdCross', label: 'ปิด MACD ตัดสัญญาณ', patch: { rules: { macdCross: { enabled: false } } }, group: 'loo', rule: 'macdCross' },
  { id: 'off:macdHist', label: 'ปิด MACD histogram', patch: { rules: { macdHistogram: { enabled: false } } }, group: 'loo', rule: 'macdHist' },
  { id: 'off:trend', label: 'ปิดกฎเทรนด์ MA', patch: { rules: { trend: { enabled: false } } }, group: 'loo', rule: 'trend' },
  { id: 'off:bollinger', label: 'ปิด Bollinger แตะขอบ', patch: { rules: { bollinger: { enabled: false } } }, group: 'loo', rule: 'bb' },
  { id: 'off:patterns', label: 'ปิดแพตเทิร์นแท่งเทียน', patch: { rules: { patterns: { enabled: false } } }, group: 'loo', rule: 'pattern' },
  { id: 'off:srScore', label: 'ปิดคะแนนแนวรับ/แนวต้าน (ยังใช้วาง SL/TP)', patch: { rules: { supportResistance: { enabled: false } } }, group: 'loo', rule: 'sr' },

  { id: 'exits:noSR', label: 'วาง SL/TP ด้วย ATR ล้วน (ไม่ใช้แนวรับ/แนวต้าน)', patch: { exits: { useSupportResistance: false } }, group: 'probe' },
  { id: 'exits:tp1', label: 'TP = 1×ATR (SL คงเดิม 1.5)', patch: { exits: { tpAtrMult: 1 } }, group: 'probe' },
  { id: 'exits:tp1.5', label: 'TP = 1.5×ATR', patch: { exits: { tpAtrMult: 1.5 } }, group: 'probe' },
  { id: 'exits:tp2', label: 'TP = 2×ATR', patch: { exits: { tpAtrMult: 2 } }, group: 'probe' },
  { id: 'exits:sl3tp3', label: 'SL = 3×ATR (RR 1:1 ที่ ATR ล้วน)', patch: { exits: { slAtrMult: 3 } }, group: 'probe' },
  { id: 'exits:atrOnly_tp1.5', label: 'ATR ล้วน + TP 1.5×ATR', patch: { exits: { useSupportResistance: false, tpAtrMult: 1.5 } }, group: 'probe' },
];

/** สเปกการวัด "ถือนานขึ้น" — ต้องรันแยกเพราะ maxHoldBars ไม่ใช่ config ของ engine */
const HOLD_PROBES = [5, 10, 20, 40];

async function main() {
  const t0 = Date.now();
  console.log('diagnose.mjs — วินิจฉัยว่าเงินรั่วตรงไหน\n');

  const mods = await loadSrcModules([
    'src/lib/indicators.ts', 'src/lib/signal-engine.ts', 'src/lib/backtest.ts',
  ]);
  REAL.indicators = mods.indicators;
  REAL.signalEngine = mods['signal-engine'];
  REAL.backtest = mods.backtest;

  const { picked, dropped } = selectDatasets();
  if (!picked.length) fail('ไม่มี dataset ที่ใช้ได้เลย');
  console.log(`dataset ที่ใช้ ${picked.length} ชุด (ตัดออก ${dropped.length}) · timeframe ${OPT.timeframes.join(',')}`);
  console.log(`พารามิเตอร์: maxHoldBars=${OPT.maxHoldBars} minHistory=${OPT.minHistory} feesR=${OPT.feesR} bootstrap=${OPT.bootstrap} seed=${OPT.seed}\n`);

  // ── ชั้นตรวจสอบตัวเอง ─────────────────────────────────────────────────────────
  console.log('ชั้นตรวจสอบตัวเอง...');
  const sample = picked.filter((_, k) => k % Math.max(1, Math.floor(picked.length / 12)) === 0).slice(0, 12);
  const tV = Date.now();
  const v1 = verifyPrefixEngine(REAL.signalEngine, sample, 900);
  console.log(`  V1 ทางลัด vs generateSignal ตัวจริง: เทียบ ${v1.compared.toLocaleString()} แท่ง · ต่าง ${v1.diffs.length}`);
  if (v1.diffs.length) {
    console.error(JSON.stringify(v1.diffs[0], null, 1).slice(0, 1500));
    fail('ทางลัดให้ผลไม่ตรงกับต้นฉบับ — ตัวเลขทุกตัวหลังจากนี้ใช้ไม่ได้');
  }
  const v2 = verifyBacktestLoop(REAL.backtest, sample, 900);
  console.log(`  V2 ลูป backtest vs runBacktest ตัวจริง: ${v2.dsChecked} ชุด · ${v2.tradesChecked} ไม้ · ต่าง ${v2.diffs.length}`);
  if (v2.diffs.length) {
    console.error(JSON.stringify(v2.diffs[0], null, 1).slice(0, 1500));
    fail('ลูป backtest สำเนาให้ผลไม่ตรงกับตัวจริง — หยุด');
  }
  console.log(`  (ใช้เวลา ${((Date.now() - tV) / 1000).toFixed(1)}s)\n`);

  const verification = {
    v1Compared: v1.compared, v1Diffs: v1.diffs.length,
    v2Datasets: v2.dsChecked, v2Trades: v2.tradesChecked, v2Diffs: v2.diffs.length,
    v1BarsPerDataset: 900, v1Datasets: sample.length,
  };

  if (OPT.verifyOnly) {
    console.log('--verify-only: ผ่านทุกชั้น');
    return;
  }

  const RUN = await runEverything(picked);
  RUN.verification = verification;
  RUN.dropped = dropped;
  RUN.datasets = picked.map((d) => ({ key: d.key, market: d.market, timeframe: d.timeframe, bars: d.bars.length, from: d.from, to: d.to, verdict: d.verdict }));

  writeOutputs(RUN);
  console.log(`\nเสร็จใน ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

/**
 * เดินข้อมูลรอบเดียวต่อหนึ่ง dataset แล้วเก็บทุกอย่างที่ต้องใช้
 *
 * จงใจรวมทุก config ไว้ในลูป dataset เดียวกัน เพราะอนุกรม indicator ที่แพงที่สุด
 * (SMA200 ฯลฯ) คำนวณครั้งเดียวแล้วใช้ร่วมกันได้ทั้ง 18 config — ถ้าแยกเป็นรอบละ config
 * ต้องคำนวณใหม่ 18 เท่าโดยได้เลขชุดเดิม
 */
async function runEverything(datasets) {
  const rng = makeRng(OPT.seed);
  const barsByKey = {};
  const perConfig = {};
  for (const c of CONFIGS) perConfig[c.id] = { aggByKey: {}, skipped: 0, exitReasons: {} };
  const holdProbe = {};
  for (const h of HOLD_PROBES) holdProbe[h] = { aggByKey: {}, exitReasons: {} };
  const randomEntry = { long: {}, short: {} };

  const trades = [];
  const census = {
    barsEvaluated: 0,
    nullBadPrice: 0,
    nullCollapse: 0,
    action: { BUY: 0, SELL: 0, HOLD: 0 },
    strengthActionable: { weak: 0, moderate: 0, strong: 0, very_strong: 0 },
    strengthAll: { weak: 0, moderate: 0, strong: 0, very_strong: 0 },
  };
  const proposed = { rr: [], riskPct: [], rrByLevel: [], rrByAtr: [], srUse: { sl: 0, tp: 0, either: 0, none: 0, total: 0 } };
  const travel = {};
  for (const tf of OPT.timeframes) travel[tf] = { up: [], dn: [] };
  const scoreCheck = { checked: 0, bad: 0, capped: 0, firstBad: null };
  const instrumentCheck = { compared: 0, mismatch: 0 };

  let done = 0;
  for (const ds of datasets) {
    const bars = ds.bars;
    const key = ds.key;
    barsByKey[key] = bars.length;
    const fast = makeFastIndicators(REAL.indicators, bars);
    const regime = precomputeRegime(fast, bars);
    const hist = fast.ind.MACD(null, 12, 26, 9).histogram;
    const ma200 = bars.length >= 200 ? fast.ind.SMA(null, 200) : null;

    const engines = {};
    for (const c of CONFIGS) engines[c.id] = createLabEngine(fast.ind, c.patch);

    // ── รันทุก config ────────────────────────────────────────────────────────
    const rsById = {};
    for (const c of CONFIGS) {
      const res = walk(engines[c.id], fast, ds, OPT, null);
      rsById[c.id] = res.rs;
      const a = (perConfig[c.id].aggByKey[key] ??= aggInit());
      for (const r of res.rs) aggAdd(a, r);
      perConfig[c.id].skipped += res.skipped;
    }

    // การติดเครื่องวัด (maxReasons=99) ต้องไม่เปลี่ยนผลแม้แต่ไม้เดียว
    const base = rsById.baseline;
    const inst = rsById.reasons99;
    instrumentCheck.compared += base.length;
    if (base.length !== inst.length) instrumentCheck.mismatch += Math.abs(base.length - inst.length);
    else for (let k = 0; k < base.length; k++) if (base[k] !== inst[k]) instrumentCheck.mismatch++;

    // ── รอบติดเครื่องวัด: เก็บรายไม้ ────────────────────────────────────────
    const engNoSR = engines['exits:noSR'];
    walk(engines.reasons99, fast, ds, OPT, (t) => {
      const sig = t.sig;
      const i = t.signalIndex;
      const dec = decomposeScores(sig, hist[i], hist[i - 1]);
      if (!dec) {
        scoreCheck.bad++;
        if (!scoreCheck.firstBad) scoreCheck.firstBad = { ds: key, i, reasons: sig.reasons.map((r) => r.label) };
        return;
      }
      const pred = predictedFromScores(dec.bull, dec.bear);
      scoreCheck.checked++;
      if (pred.total >= 10) scoreCheck.capped++;
      if (pred.action !== sig.action || pred.strength !== sig.strength || pred.confidence !== sig.confidence) {
        scoreCheck.bad++;
        if (!scoreCheck.firstBad) scoreCheck.firstBad = { ds: key, i, pred, real: { action: sig.action, strength: sig.strength, confidence: sig.confidence }, reasons: sig.reasons.map((r) => r.label) };
      }

      // SL/TP มาจากแนวรับ/แนวต้านหรือ ATR ล้วน — วัดโดยเทียบกับเครื่องยนต์ที่ปิดการใช้ระดับ
      const alt = engNoSR.generateSignal({
        symbol: ds.symbol, name: ds.name, market: ds.market,
        candles: fast.win(i + 1), timeframe: ds.timeframe,
      });
      const slLevel = !!alt && alt.stop_loss !== sig.stop_loss;
      const tpLevel = !!alt && alt.take_profit !== sig.take_profit;

      const sigPrice = sig.entry_price;
      const risk = t.riskPerUnit;
      const atr = regime.atr[i];
      const dirMul = t.isLong ? 1 : -1;
      const mfe = Number.isFinite(t.hiMax) && Number.isFinite(t.loMin)
        ? (t.isLong ? t.hiMax - t.entry : t.entry - t.loMin) / risk : null;
      const mae = Number.isFinite(t.hiMax) && Number.isFinite(t.loMin)
        ? (t.isLong ? t.entry - t.loMin : t.hiMax - t.entry) / risk : null;

      trades.push({
        key, symbol: ds.symbol, market: ds.market, tf: ds.timeframe,
        action: sig.action, isLong: t.isLong, r: t.r, exitReason: t.exitReason, holdBars: t.holdBars,
        strength: sig.strength, confidence: sig.confidence,
        entryTime: t.entryTime, year: Number(String(t.entryTime).slice(0, 4)),
        rrFill: Math.abs(sig.take_profit - t.entry) / risk,
        rrSig: Math.abs(sig.take_profit - sigPrice) / Math.abs(sigPrice - sig.stop_loss),
        riskPct: risk / t.entry,
        riskSigPct: Math.abs(sigPrice - sig.stop_loss) / sigPrice,
        // <1 = ราคาเปิดแท่งถัดไป gap เข้าไปหา SL ทำให้ระยะเสี่ยงจริงหดลง (ตัวหารของ R หด)
        slipRatio: risk / Math.abs(sigPrice - sig.stop_loss),
        slLevel, tpLevel,
        sc: dec.sc, bull: dec.bull, bear: dec.bear, net: pred.net, hasMA200: dec.hasMA200,
        trendLabel: dec.sc[RI.trend * 2] > 0 ? 'uptrend' : dec.sc[RI.trend * 2 + 1] > 0 ? 'downtrend' : 'sideways',
        mfeR: mfe, maeR: mae,
        slAtrMult: Number.isFinite(atr) && atr > 0 ? Math.abs(sigPrice - sig.stop_loss) / atr : null,
        tpAtrMult: Number.isFinite(atr) && atr > 0 ? Math.abs(sig.take_profit - sigPrice) / atr : null,
        atrPct: regime.atrPct[i],
        atrPctl: trailingPercentile(regime.atrPct, i, 250),
        erPctl: trailingPercentile(regime.er, i, 250),
        er: regime.er[i],
        maDist: ma200 && Number.isFinite(ma200[i]) ? (fast.closes[i] - ma200[i]) / ma200[i] : null,
        dirMul,
      });
    });

    // ── probe: ถือนานขึ้น/สั้นลง ───────────────────────────────────────────
    for (const h of HOLD_PROBES) {
      if (h === OPT.maxHoldBars) {
        const a = (holdProbe[h].aggByKey[key] ??= aggInit());
        for (const r of rsById.baseline) aggAdd(a, r);
        continue;
      }
      const res = walk(engines.baseline, fast, ds, { ...OPT, maxHoldBars: h }, null);
      const a = (holdProbe[h].aggByKey[key] ??= aggInit());
      for (const r of res.rs) aggAdd(a, r);
    }

    // ── census: เดินทุกแท่ง ไม่ข้ามตอนถือไม้ ──────────────────────────────
    fast.resetWalk();
    const tf = ds.timeframe;
    const rndL = (randomEntry.long[key] ??= aggInit());
    const rndS = (randomEntry.short[key] ??= aggInit());
    for (let i = OPT.minHistory; i <= bars.length - 2; i++) {
      census.barsEvaluated++;
      const sig = engines.baseline.generateSignal({
        symbol: ds.symbol, name: ds.name, market: ds.market,
        candles: fast.win(i + 1), timeframe: ds.timeframe,
      });
      const cp = fast.closes[i];
      if (!sig) {
        if (!Number.isFinite(cp) || cp <= 0) census.nullBadPrice++;
        else census.nullCollapse++;
      } else {
        census.action[sig.action]++;
        census.strengthAll[sig.strength]++;
        if (sig.action !== 'HOLD') {
          census.strengthActionable[sig.strength]++;
          const risk = Math.abs(sig.entry_price - sig.stop_loss);
          if (risk > 0) {
            const rr = Math.abs(sig.take_profit - sig.entry_price) / risk;
            proposed.rr.push(rr);
            proposed.riskPct.push(risk / sig.entry_price);
            const alt = engNoSR.generateSignal({
              symbol: ds.symbol, name: ds.name, market: ds.market,
              candles: fast.win(i + 1), timeframe: ds.timeframe,
            });
            const usedLevel = !!alt && (alt.stop_loss !== sig.stop_loss || alt.take_profit !== sig.take_profit);
            proposed.srUse.total++;
            if (alt && alt.stop_loss !== sig.stop_loss) proposed.srUse.sl++;
            if (alt && alt.take_profit !== sig.take_profit) proposed.srUse.tp++;
            if (usedLevel) { proposed.srUse.either++; proposed.rrByLevel.push(rr); }
            else { proposed.srUse.none++; proposed.rrByAtr.push(rr); }
          }
        }
      }

      // ระยะที่ราคาเดินได้จริงในหน้าต่างถือ (หน่วย ATR) — วัดคุณสมบัติของตลาด
      // ไม่ใช่ผลของกฎ จึงเก็บทุกแท่งไม่ว่าจะมีสัญญาณหรือไม่
      const atr = regime.atr[i];
      if (Number.isFinite(atr) && atr > 0) {
        const lastIdx = Math.min(i + OPT.maxHoldBars, bars.length - 1);
        let hi = -Infinity, lo = Infinity;
        for (let j = i + 1; j <= lastIdx; j++) {
          const b = bars[j];
          if (!isUsableBar(b)) continue;
          if (b.high > hi) hi = b.high;
          if (b.low < lo) lo = b.low;
        }
        if (Number.isFinite(hi) && Number.isFinite(lo)) {
          travel[tf].up.push((hi - cp) / atr);
          travel[tf].dn.push((cp - lo) / atr);
        }

        // ตัวเทียบฐาน: เข้าไม้ "ทุกแท่ง" ด้วยเรขาคณิต SL/TP เดิม โดยไม่ดูสัญญาณเลย
        // ถ้าผลของสัญญาณไม่ต่างจากอันนี้ แปลว่าคะแนนทั้งระบบไม่ได้เพิ่มอะไร
        const entryBar = bars[i + 1];
        if (isUsableBar(entryBar)) {
          const lastHold = Math.min(i + 1 + OPT.maxHoldBars - 1, bars.length - 1);
          for (const isLong of [true, false]) {
            const sl = isLong ? cp - atr * 1.5 : cp + atr * 1.5;
            const tp = isLong ? cp + atr * 3 : cp - atr * 3;
            const riskU = Math.abs(entryBar.open - sl);
            if (!Number.isFinite(riskU) || riskU <= 0) continue;
            const e = simulateExit(bars, i + 1, lastHold, isLong, sl, tp);
            const r = ((e.exit - entryBar.open) * (isLong ? 1 : -1)) / riskU - OPT.feesR;
            aggAdd(isLong ? rndL : rndS, r);
          }
        }
      }
    }

    done++;
    if (done % 10 === 0 || done === datasets.length) {
      process.stdout.write(`\r  เดินข้อมูล ${done}/${datasets.length} ชุด · ไม้สะสม ${trades.length.toLocaleString()}   `);
    }
  }
  process.stdout.write('\n');

  if (instrumentCheck.mismatch > 0) {
    fail(`V4 ล้ม: maxReasons=99 ทำให้ผลเปลี่ยน ${instrumentCheck.mismatch} ไม้ — การติดเครื่องวัดรบกวนผล`);
  }
  if (scoreCheck.bad > 0) {
    console.error(JSON.stringify(scoreCheck.firstBad, null, 1));
    fail(`V3 ล้ม: ถอดคะแนนรายกฎแล้วทำนาย action/strength/confidence ผิด ${scoreCheck.bad} ไม้`);
  }

  console.log(`  V3 ถอดคะแนนรายกฎ: ตรวจ ${scoreCheck.checked.toLocaleString()} ไม้ · ผิด 0 (ชนเพดาน confidence ${scoreCheck.capped})`);
  console.log(`  V4 maxReasons=99 ไม่เปลี่ยนผล: เทียบ ${instrumentCheck.compared.toLocaleString()} ไม้ · ต่าง 0\n`);

  return analyse({ rng, barsByKey, perConfig, holdProbe, randomEntry, trades, census, proposed, travel, scoreCheck, instrumentCheck });
}

// ═══════════════════════════════ ประมวลผลเป็นข้อสรุปเชิงตัวเลข ═══════════════════════════════

const pickKeys = (obj, pred) => {
  const out = {};
  for (const k of Object.keys(obj)) if (pred(k)) out[k] = obj[k];
  return out;
};
const tfOfKey = (k) => k.split(':')[2];
const marketOfKey = (k) => k.split(':')[0];

function analyse(D) {
  const { rng, barsByKey, perConfig, holdProbe, randomEntry, trades, census, proposed, travel } = D;
  const B = OPT.bootstrap;
  const scopes = [...OPT.timeframes.map((tf) => ({ id: tf, pred: (k) => tfOfKey(k) === tf })), ...(OPT.timeframes.length > 1 ? [{ id: 'ALL', pred: () => true }] : [])];

  const ciOf = (aggByKey, metric, pred) => bootstrapAgg(pickKeys(aggByKey, pred), pickKeys(barsByKey, pred), metric, B, rng);
  const deltaOf = (a, b, metric, pred) => bootstrapDelta(pickKeys(a, pred), pickKeys(b, pred), pickKeys(barsByKey, pred), metric, B, rng);

  // ── ภาพรวม baseline ───────────────────────────────────────────────────────
  const baseAgg = perConfig.baseline.aggByKey;
  const overall = scopes.map((s) => {
    const agg = pickKeys(baseAgg, s.pred);
    const tot = aggInit();
    let bars = 0;
    for (const k of Object.keys(agg)) { aggPlus(tot, agg[k]); bars += barsByKey[k]; }
    return {
      scope: s.id,
      datasets: Object.keys(agg).length,
      bars,
      trades: tot.n,
      winRate: aggMetric(tot, bars, 'winRate'),
      profitFactor: aggMetric(tot, bars, 'pf'),
      profitFactorW: aggMetric(tot, bars, 'pfW'),
      totalR: tot.sum,
      totalRw: tot.sumW,
      avgR: ciOf(baseAgg, 'avgR', s.pred),
      avgRw: ciOf(baseAgg, 'avgRw', s.pred),
      rPer1000: ciOf(baseAgg, 'rPer1000', s.pred),
    };
  });

  // ── ปิดกฎทีละตัว + probe ─────────────────────────────────────────────────
  const configRows = [];
  for (const c of CONFIGS) {
    if (c.group === 'base' || c.group === 'check') continue;
    const row = { id: c.id, label: c.label, group: c.group, byScope: {} };
    for (const s of scopes) {
      const agg = pickKeys(perConfig[c.id].aggByKey, s.pred);
      const tot = aggInit();
      let bars = 0;
      for (const k of Object.keys(agg)) { aggPlus(tot, agg[k]); bars += barsByKey[k]; }
      row.byScope[s.id] = {
        trades: tot.n,
        avgR: tot.n ? tot.sum / tot.n : null,
        avgRw: tot.n ? tot.sumW / tot.n : null,
        pf: tot.gl > 0 ? tot.gw / tot.gl : null,
        pfW: tot.glW > 0 ? tot.gwW / tot.glW : null,
        winRate: tot.n ? tot.wins / tot.n : null,
        totalR: tot.sum,
        totalRw: tot.sumW,
        dAvgR: deltaOf(perConfig[c.id].aggByKey, baseAgg, 'avgRw', s.pred),
        dR1000: deltaOf(perConfig[c.id].aggByKey, baseAgg, 'rwPer1000', s.pred),
        dAvgRraw: deltaOf(perConfig[c.id].aggByKey, baseAgg, 'avgR', s.pred),
      };
    }
    configRows.push(row);
  }

  // ── probe: หน้าต่างถือ ────────────────────────────────────────────────────
  const holdRows = HOLD_PROBES.map((h) => {
    const out = { hold: h, byScope: {} };
    for (const s of scopes) {
      const agg = pickKeys(holdProbe[h].aggByKey, s.pred);
      const tot = aggInit();
      let bars = 0;
      for (const k of Object.keys(agg)) { aggPlus(tot, agg[k]); bars += barsByKey[k]; }
      out.byScope[s.id] = {
        trades: tot.n, avgR: tot.n ? tot.sum / tot.n : null,
        avgRw: tot.n ? tot.sumW / tot.n : null,
        pf: tot.gl > 0 ? tot.gw / tot.gl : null,
        pfW: tot.glW > 0 ? tot.gwW / tot.glW : null,
        totalR: tot.sum, totalRw: tot.sumW,
        dAvgR: h === OPT.maxHoldBars ? null : deltaOf(holdProbe[h].aggByKey, baseAgg, 'avgRw', s.pred),
      };
    }
    return out;
  });

  // ── ตัวเทียบฐาน: เข้าไม้ทุกแท่งโดยไม่ดูสัญญาณ ────────────────────────────
  const randomRows = scopes.map((s) => {
    const combine = (src) => {
      const tot = aggInit();
      for (const k of Object.keys(src)) if (s.pred(k)) aggPlus(tot, src[k]);
      return tot;
    };
    const L = combine(randomEntry.long);
    const S = combine(randomEntry.short);
    const both = {};
    for (const k of Object.keys(randomEntry.long)) {
      both[k] = aggInit();
      aggPlus(both[k], randomEntry.long[k]);
      aggPlus(both[k], randomEntry.short[k]);
    }
    const side = (A) => ({
      n: A.n, avgR: A.n ? A.sum / A.n : null, avgRw: A.n ? A.sumW / A.n : null,
      pf: A.gl > 0 ? A.gw / A.gl : null, pfW: A.glW > 0 ? A.gwW / A.glW : null,
      winRate: A.n ? A.wins / A.n : null,
    });
    return {
      scope: s.id,
      long: side(L),
      short: side(S),
      bothAvgR: ciOf(both, 'avgR', s.pred),
      bothAvgRw: ciOf(both, 'avgRw', s.pred),
    };
  });

  // ── กฎไหนช่วย/ทำร้าย (แบบเงื่อนไข: ยิงกับไม่ยิง) ──────────────────────────
  const supports = (t, k) => (t.isLong ? t.sc[k * 2] : t.sc[k * 2 + 1]) > 0;
  const opposes = (t, k) => (t.isLong ? t.sc[k * 2 + 1] : t.sc[k * 2]) > 0;
  const groupStat = (filterFn, pred) => {
    const agg = aggregateTrades(trades.filter((t) => pred(t.key)), (t) => t.key, filterFn);
    const tot = aggInit();
    for (const k of Object.keys(agg)) aggPlus(tot, agg[k]);
    return {
      n: tot.n, clusters: Object.keys(agg).length,
      avgR: tot.n ? tot.sum / tot.n : null,
      avgRw: tot.n ? tot.sumW / tot.n : null,
      winRate: tot.n ? tot.wins / tot.n : null,
      pf: tot.gl > 0 ? tot.gw / tot.gl : null,
      pfW: tot.glW > 0 ? tot.gwW / tot.glW : null,
      totalR: tot.sum,
      totalRw: tot.sumW,
      ci: tot.n ? bootstrapAgg(agg, pickKeys(barsByKey, pred), 'avgR', B, rng) : null,
      ciW: tot.n ? bootstrapAgg(agg, pickKeys(barsByKey, pred), 'avgRw', B, rng) : null,
    };
  };

  const ruleRows = [];
  for (let k = 0; k < RULES.length; k++) {
    const row = { rule: RULES[k], th: RULE_TH[RULES[k]], byScope: {} };
    for (const s of scopes) {
      row.byScope[s.id] = {
        fired: groupStat((t) => supports(t, k), s.pred),
        against: groupStat((t) => opposes(t, k), s.pred),
        silent: groupStat((t) => !supports(t, k) && !opposes(t, k), s.pred),
        pivotal: groupStat((t) => {
          if (!supports(t, k)) return false;
          const contrib = t.sc[k * 2] - t.sc[k * 2 + 1];
          const without = t.net - contrib;
          return t.isLong ? !(without >= 3) : !(without <= -3);
        }, s.pred),
      };
    }
    ruleRows.push(row);
  }

  // ── กลยุทธ์ตีกันเอง ───────────────────────────────────────────────────────
  const MR = [RI.rsiZone, RI.bb, RI.sr];
  const TFAM = [RI.rsiCross, RI.macdCross, RI.macdHist, RI.trend];
  const famScore = (t, fam) => fam.reduce((a, k) => a + (t.isLong ? t.sc[k * 2] : t.sc[k * 2 + 1]), 0);
  const conflict = { byScope: {} };
  for (const s of scopes) {
    const trendAgrees = (t) => (t.isLong ? t.trendLabel === 'uptrend' : t.trendLabel === 'downtrend');
    const trendOpposes = (t) => (t.isLong ? t.trendLabel === 'downtrend' : t.trendLabel === 'uptrend');
    conflict.byScope[s.id] = {
      families: {
        trendOnly: groupStat((t) => famScore(t, TFAM) > 0 && famScore(t, MR) === 0, s.pred),
        meanRevOnly: groupStat((t) => famScore(t, MR) > 0 && famScore(t, TFAM) === 0, s.pred),
        mixed: groupStat((t) => famScore(t, MR) > 0 && famScore(t, TFAM) > 0, s.pred),
        patternOnly: groupStat((t) => famScore(t, MR) === 0 && famScore(t, TFAM) === 0, s.pred),
      },
      trendContext: {
        agrees: groupStat(trendAgrees, s.pred),
        sideways: groupStat((t) => t.trendLabel === 'sideways', s.pred),
        opposes: groupStat(trendOpposes, s.pred),
      },
      rsiZoneByTrend: {
        agrees: groupStat((t) => supports(t, RI.rsiZone) && trendAgrees(t), s.pred),
        sideways: groupStat((t) => supports(t, RI.rsiZone) && t.trendLabel === 'sideways', s.pred),
        opposes: groupStat((t) => supports(t, RI.rsiZone) && trendOpposes(t), s.pred),
      },
      ma200Context: {
        withMA: groupStat((t) => t.maDist !== null && (t.isLong ? t.maDist > 0 : t.maDist < 0), s.pred),
        againstMA: groupStat((t) => t.maDist !== null && (t.isLong ? t.maDist < 0 : t.maDist > 0), s.pred),
        noMA: groupStat((t) => t.maDist === null, s.pred),
      },
    };
  }

  // ── โครงสร้าง SL/TP ───────────────────────────────────────────────────────
  const sortNum = (a) => a.slice().sort((x, y) => x - y);
  const distOf = (arr) => {
    if (!arr.length) return null;
    const s = sortNum(arr);
    return {
      n: s.length, min: s[0], p10: quantile(s, 0.1), p25: quantile(s, 0.25), median: quantile(s, 0.5),
      p75: quantile(s, 0.75), p90: quantile(s, 0.9), max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length,
    };
  };
  const shareBelow = (arr, x) => (arr.length ? arr.filter((v) => v < x).length / arr.length : null);
  const shareAtLeast = (arr, x) => (arr.length ? arr.filter((v) => v >= x).length / arr.length : null);

  const exitReasonRows = {};
  for (const s of scopes) {
    const map = {};
    for (const t of trades) {
      if (!s.pred(t.key)) continue;
      (map[t.exitReason] ??= aggInit());
      aggAdd(map[t.exitReason], t.r);
    }
    const tot = aggInit();
    for (const k of Object.keys(map)) aggPlus(tot, map[k]);
    exitReasonRows[s.id] = Object.entries(map)
      .map(([reason, a]) => ({ reason, n: a.n, share: tot.n ? a.n / tot.n : null, avgR: a.n ? a.sum / a.n : null, totalR: a.sum }))
      .sort((a, b) => b.n - a.n);
  }

  const sltp = {
    proposedRR: distOf(proposed.rr),
    proposedRRbelow1: shareBelow(proposed.rr, 1),
    proposedRRbelow05: shareBelow(proposed.rr, 0.5),
    proposedRRbelow2: shareBelow(proposed.rr, 2),
    rrByLevel: distOf(proposed.rrByLevel),
    rrByAtr: distOf(proposed.rrByAtr),
    rrLevelBelow1: shareBelow(proposed.rrByLevel, 1),
    rrAtrBelow1: shareBelow(proposed.rrByAtr, 1),
    riskPct: distOf(proposed.riskPct),
    srUse: proposed.srUse,
    exitReasons: exitReasonRows,
    bySource: {},
    tradeRR: {},
    excursion: {},
    travel: {},
  };
  for (const s of scopes) {
    sltp.bySource[s.id] = {
      slFromLevel: groupStat((t) => t.slLevel, s.pred),
      slFromAtr: groupStat((t) => !t.slLevel, s.pred),
      tpFromLevel: groupStat((t) => t.tpLevel, s.pred),
      tpFromAtr: groupStat((t) => !t.tpLevel, s.pred),
      anyLevel: groupStat((t) => t.slLevel || t.tpLevel, s.pred),
      pureAtr: groupStat((t) => !t.slLevel && !t.tpLevel, s.pred),
    };
    const tt = trades.filter((t) => s.pred(t.key));
    sltp.tradeRR[s.id] = {
      rrFill: distOf(tt.map((t) => t.rrFill)),
      rrBelow1: shareBelow(tt.map((t) => t.rrFill), 1),
      rrBelow05: shareBelow(tt.map((t) => t.rrFill), 0.5),
      slAtrMult: distOf(tt.map((t) => t.slAtrMult).filter((v) => v !== null)),
      tpAtrMult: distOf(tt.map((t) => t.tpAtrMult).filter((v) => v !== null)),
      riskPct: distOf(tt.map((t) => t.riskPct)),
    };
    sltp.excursion[s.id] = {
      mfeR: distOf(tt.map((t) => t.mfeR).filter((v) => v !== null)),
      maeR: distOf(tt.map((t) => t.maeR).filter((v) => v !== null)),
      couldHaveHitTP: tt.length ? tt.filter((t) => t.mfeR !== null && t.mfeR >= t.rrFill).length / tt.length : null,
      touchedSL: tt.length ? tt.filter((t) => t.maeR !== null && t.maeR >= 1).length / tt.length : null,
    };
  }
  for (const tf of OPT.timeframes) {
    const up = travel[tf].up;
    const dn = travel[tf].dn;
    sltp.travel[tf] = {
      up: distOf(up), dn: distOf(dn),
      upAtLeast3: shareAtLeast(up, 3), upAtLeast15: shareAtLeast(up, 1.5),
      dnAtLeast3: shareAtLeast(dn, 3), dnAtLeast15: shareAtLeast(dn, 1.5),
    };
  }

  // ── ความเปราะของตัวเลข R เอง ───────────────────────────────────────────
  //
  // ต้องตอบก่อนทุกอย่าง: ค่าเฉลี่ยที่รายงานมาจากไม้ทั้งชุดจริง ๆ หรือมาจากไม้ไม่กี่ไม้
  const robust = {};
  for (const s of scopes) {
    const tt = trades.filter((t) => s.pred(t.key));
    const absSorted = tt.map((t) => Math.abs(t.r)).sort((a, b) => b - a);
    const total = tt.reduce((a, t) => a + t.r, 0);
    const topShare = (frac) => {
      const k = Math.max(1, Math.round(tt.length * frac));
      const byAbs = tt.slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, k);
      return { k, sumR: byAbs.reduce((a, t) => a + t.r, 0), shareOfTotal: total !== 0 ? byAbs.reduce((a, t) => a + t.r, 0) / total : null };
    };
    const excl = (pred) => {
      const agg = aggregateTrades(tt, (t) => t.key, pred);
      const tot = aggInit();
      for (const k of Object.keys(agg)) aggPlus(tot, agg[k]);
      return { n: tot.n, avgR: tot.n ? tot.sum / tot.n : null, pf: tot.gl > 0 ? tot.gw / tot.gl : null, totalR: tot.sum, ci: tot.n ? bootstrapAgg(agg, pickKeys(barsByKey, s.pred), 'avgR', B, rng) : null };
    };
    robust[s.id] = {
      n: tt.length,
      absR: distOf(absSorted),
      maxAbsR: absSorted[0] ?? null,
      top01: topShare(0.001),
      top1: topShare(0.01),
      overCap: tt.filter((t) => Math.abs(t.r) > WINSOR).length,
      overCapShare: tt.length ? tt.filter((t) => Math.abs(t.r) > WINSOR).length / tt.length : null,
      overCapSumR: tt.filter((t) => Math.abs(t.r) > WINSOR).reduce((a, t) => a + t.r, 0),
      over100: tt.filter((t) => Math.abs(t.r) > 100).length,
      slipRatio: distOf(tt.map((t) => t.slipRatio).filter(Number.isFinite)),
      gapIntoSL: tt.length ? tt.filter((t) => t.slipRatio < 0.5).length / tt.length : null,
      riskPctTiny: {
        below1e4: tt.filter((t) => t.riskPct < 1e-4).length,
        below1e3: tt.filter((t) => t.riskPct < 1e-3).length,
        below1e2: tt.filter((t) => t.riskPct < 1e-2).length,
      },
      exclTinyRisk: excl((t) => t.riskPct >= 1e-3),
      exclGapFill: excl((t) => t.slipRatio >= 0.5),
      exclBoth: excl((t) => t.riskPct >= 1e-3 && t.slipRatio >= 0.5),
      worst: tt.slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 8).map((t) => ({
        symbol: t.symbol, tf: t.tf, time: t.entryTime, action: t.action, r: t.r,
        riskPct: t.riskPct, riskSigPct: t.riskSigPct, slipRatio: t.slipRatio, exitReason: t.exitReason,
      })),
    };
  }

  // ── ระบอบตลาด ─────────────────────────────────────────────────────────────
  const terc = (v, lo, hi) => (v === null ? null : v < lo ? 'ต่ำ' : v < hi ? 'กลาง' : 'สูง');
  const regime = { byScope: {} };
  for (const s of scopes) {
    regime.byScope[s.id] = {
      volatility: {
        low: groupStat((t) => terc(t.atrPctl, 1 / 3, 2 / 3) === 'ต่ำ', s.pred),
        mid: groupStat((t) => terc(t.atrPctl, 1 / 3, 2 / 3) === 'กลาง', s.pred),
        high: groupStat((t) => terc(t.atrPctl, 1 / 3, 2 / 3) === 'สูง', s.pred),
        unknown: groupStat((t) => t.atrPctl === null, s.pred),
      },
      trendiness: {
        low: groupStat((t) => terc(t.erPctl, 1 / 3, 2 / 3) === 'ต่ำ', s.pred),
        mid: groupStat((t) => terc(t.erPctl, 1 / 3, 2 / 3) === 'กลาง', s.pred),
        high: groupStat((t) => terc(t.erPctl, 1 / 3, 2 / 3) === 'สูง', s.pred),
        unknown: groupStat((t) => t.erPctl === null, s.pred),
      },
      byMarket: Object.fromEntries(
        [...new Set(trades.filter((t) => s.pred(t.key)).map((t) => t.market))]
          .map((m) => [m, groupStat((t) => t.market === m, s.pred)])
      ),
      byAction: {
        BUY: groupStat((t) => t.action === 'BUY', s.pred),
        SELL: groupStat((t) => t.action === 'SELL', s.pred),
      },
      byStrength: Object.fromEntries(
        ['weak', 'moderate', 'strong', 'very_strong'].map((g) => [g, groupStat((t) => t.strength === g, s.pred)])
      ),
      liveFilter: {
        kept: groupStat((t) => t.strength !== 'weak', s.pred),
        dropped: groupStat((t) => t.strength === 'weak', s.pred),
      },
    };
  }

  // ── จุดตายที่มองไม่เห็น ───────────────────────────────────────────────────
  const actionable = census.action.BUY + census.action.SELL;
  const totalTrades = perConfig.baseline.aggByKey
    ? Object.values(perConfig.baseline.aggByKey).reduce((a, b) => a + b.n, 0) : 0;
  const deadends = {
    census,
    actionable,
    tradesTaken: totalTrades,
    skipped: perConfig.baseline.skipped,
    blockedByOpenPosition: actionable - totalTrades - perConfig.baseline.skipped,
    holdShare: census.barsEvaluated ? census.action.HOLD / census.barsEvaluated : null,
    nullShare: census.barsEvaluated ? (census.nullBadPrice + census.nullCollapse) / census.barsEvaluated : null,
    actionableShare: census.barsEvaluated ? actionable / census.barsEvaluated : null,
    weakShareOfActionable: actionable ? census.strengthActionable.weak / actionable : null,
  };

  return { overall, configRows, holdRows, randomRows, ruleRows, conflict, sltp, robust, regime, deadends, scopes: scopes.map((s) => s.id) };
}

// ═══════════════════════════════ เขียนรายงาน ═══════════════════════════════

const nf = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pf = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(2));
const pc = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`);
const iv = (ci, d = 3) => (!ci ? '—' : `[${nf(ci.lo95, d)}, ${nf(ci.hi95, d)}]`);
const iv995 = (ci, d = 3) => (!ci ? '—' : `[${nf(ci.lo995, d)}, ${nf(ci.hi995, d)}]`);
/** ช่วงความเชื่อมั่นคร่อมศูนย์ = อ่านว่า "ยังแยกจากศูนย์ไม่ออก" ไม่ใช่ "ไม่มีผล" */
const clears0 = (ci) => (!ci || ci.lo95 === null ? false : (ci.lo95 > 0 && ci.hi95 > 0) || (ci.lo95 < 0 && ci.hi95 < 0));
const clears0strict = (ci) => (!ci || ci.lo995 === null ? false : (ci.lo995 > 0 && ci.hi995 > 0) || (ci.lo995 < 0 && ci.hi995 < 0));
const mark = (ci) => (clears0strict(ci) ? '★★' : clears0(ci) ? '★' : '');

function mdTable(headers, rows) {
  const out = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const r of rows) out.push(`| ${r.join(' | ')} |`);
  return out.join('\n');
}

const gRow = (name, g) => [
  name, g.n.toLocaleString(), g.clusters ?? '—', nf(g.avgR), nf(g.avgRw), iv(g.ciW), pc(g.winRate), pf(g.pfW), nf(g.totalRw, 1),
];
const G_HEAD = ['กลุ่ม', 'ไม้', 'สัญลักษณ์', 'avg R ดิบ', `avg R ตัดที่ ±${WINSOR}`, 'ช่วง 95% (ตัด)', 'ชนะ', 'PF (ตัด)', 'รวม R (ตัด)'];

function writeOutputs(RUN) {
  const primary = OPT.timeframes.includes('1D') ? '1D' : OPT.timeframes[0];
  const L = [];
  const P = (s = '') => L.push(s);

  const ov = RUN.overall.find((o) => o.scope === primary) ?? RUN.overall[0];
  const ovAll = RUN.overall;

  P('# วินิจฉัย: เงินรั่วตรงไหน');
  P();
  P(`> สร้างโดย \`node scripts/research/diagnose.mjs\` เมื่อ ${new Date().toISOString()}`);
  P('>');
  P(`> ข้อมูล: \`.research-cache/candles\` · ${RUN.datasets.length} ชุด · timeframe ${OPT.timeframes.join(' + ')}`);
  P(`> พารามิเตอร์: maxHoldBars=${OPT.maxHoldBars} · minHistory=${OPT.minHistory} · **feesR=${OPT.feesR}** · bootstrap=${OPT.bootstrap} รอบ · seed=${OPT.seed}`);
  P('>');
  P('> **feesR=0 แปลว่ายังไม่หักสเปรด/ค่าคอม/สลิปเพจแม้แต่บาทเดียว** ตัวเลขทุกตัวในรายงานนี้');
  P('> จึงเป็นเพดานบนของความจริง ของจริงแย่กว่านี้เสมอ');
  P();

  // ─────────────────────────── 0. วิธีอ่าน ───────────────────────────
  P('## 0. อ่านตัวเลขนี้อย่างไร');
  P();
  P('- **R** = กำไร/ขาดทุนหารด้วยระยะจากราคาเข้าถึง SL ของไม้นั้น (ไม้ที่ชน SL พอดี = −1R)');
  P('- **avg R** คือค่าที่ตัดสินว่ามี edge หรือไม่ ถ้า ≤ 0 คือไม่มี');
  P('- **ช่วง 95%** มาจาก bootstrap ที่สุ่ม **ทั้งสัญลักษณ์** ไม่ใช่สุ่มทีละไม้ เพราะไม้ในสัญลักษณ์');
  P('  เดียวกันไม่เป็นอิสระต่อกัน ถ้าสุ่มทีละไม้ ช่วงจะแคบกว่าความจริงมากจนหลอกตัวเอง');
  P('- `★` = ช่วง 95% ไม่คร่อมศูนย์ · `★★` = ช่วง 99.5% ไม่คร่อมศูนย์');
  P(`  รายงานนี้เทียบหลายสิบครั้ง การใช้ 95% เฉย ๆ จะได้ผลบวกลวงราว 1 ครั้งต่อ 20 การเทียบ`);
  P('  จึงควรเชื่อเฉพาะ `★★` เป็นหลัก และถือ `★` เป็นเบาะแสที่ต้องยืนยันอีกรอบ');
  P('- ตัวเลขทั้งหมดวัดบน **ข้อมูลทั้งชุด ยังไม่แบ่ง train/test** เพราะรอบนี้คือการวินิจฉัย');
  P('  ไม่ใช่การเลือกค่า — ห้ามหยิบค่าที่ดูดีที่สุดในรายงานนี้ไปตั้งเป็นค่าจริงโดยตรง');
  P();

  // ─────────────────────────── 1. ภาพรวม ───────────────────────────
  P('## 1. จุดตั้งต้น: baseline วัดได้เท่าไหร่');
  P();
  P(mdTable(
    ['ชุด', 'สัญลักษณ์', 'แท่ง', 'ไม้', 'ชนะ', 'PF ดิบ', 'avg R ดิบ', 'ช่วง 95%', `avg R ตัดที่ ±${WINSOR}`, 'ช่วง 95% (ตัด)', 'รวม R ดิบ'],
    ovAll.map((o) => [
      o.scope, o.datasets, o.bars.toLocaleString(), o.trades.toLocaleString(),
      pc(o.winRate), pf(o.profitFactor), nf(o.avgR?.point), iv(o.avgR),
      nf(o.avgRw?.point), iv(o.avgRw), nf(o.totalR, 1),
    ])
  ));
  P();
  P(`**อ่านสองคอลัมน์นี้คู่กันเสมอ** — "ดิบ" คือ R ตามนิยามตรง ๆ · "ตัดที่ ±${WINSOR}" คือ`);
  P('เวอร์ชันที่จำกัดผลของไม้สุดขั้วไม่ให้ยึดค่าเฉลี่ยไปทั้งชุด เหตุผลอยู่ในหัวข้อ 2.0');
  P();
  const ovCI = ov.avgRw;
  P(`ชุดหลักคือ ${primary}: ${ov.trades.toLocaleString()} ไม้ · avg R ตัดที่ ±${WINSOR} = ${nf(ovCI?.point)} ช่วง 95% ${iv(ovCI)}`);
  if (ovCI && ovCI.hi95 !== null && ovCI.hi95 < 0) {
    P('ขอบบนของช่วงติดลบ → **ไม่ใช่แค่ "ยังพิสูจน์ว่ามี edge ไม่ได้" แต่วัดได้ว่าติดลบจริง**');
  } else if (ovCI && ovCI.lo95 !== null && ovCI.lo95 < 0 && ovCI.hi95 > 0) {
    P('ช่วงคร่อมศูนย์ → แยก "ไม่มี edge" ออกจาก "โชคไม่ดี" ยังไม่ได้ด้วยข้อมูลเท่านี้');
  } else if (ovCI && ovCI.lo95 > 0) {
    P('ช่วงทั้งช่วงอยู่เหนือศูนย์ **ที่ feesR=0** — ต้องอ่านคู่กับหัวข้อ 2.6 ว่าต้นทุนจริงกินเท่าไหร่');
  }
  P();
  P('### ตัวเทียบฐาน: ถ้าเข้าไม้ "ทุกแท่ง" โดยไม่ดูสัญญาณเลย');
  P();
  P('เข้าไม้ที่ราคาเปิดแท่งถัดไปทุกแท่ง ใช้ SL 1.5×ATR / TP 3×ATR และกติกาออกชุดเดียวกัน');
  P('ถ้าสัญญาณไม่ได้ทำให้ดีกว่าตัวเลขชุดนี้ แปลว่าคะแนนทั้งระบบยังไม่ได้เพิ่มข้อมูลอะไรเลย');
  P();
  P(mdTable(
    ['ชุด', 'ฝั่ง', 'ไม้', 'ชนะ', 'PF (ตัด)', 'avg R ดิบ', `avg R ตัดที่ ±${WINSOR}`],
    RUN.randomRows.flatMap((r) => [
      [r.scope, 'ซื้อทุกแท่ง', r.long.n.toLocaleString(), pc(r.long.winRate), pf(r.long.pfW), nf(r.long.avgR), nf(r.long.avgRw)],
      [r.scope, 'ขายทุกแท่ง', r.short.n.toLocaleString(), pc(r.short.winRate), pf(r.short.pfW), nf(r.short.avgR), nf(r.short.avgRw)],
      [r.scope, 'สองฝั่งรวม', '', '', '', nf(r.bothAvgR?.point), `${nf(r.bothAvgRw?.point)} ${iv(r.bothAvgRw)}`],
    ])
  ));
  P();
  const rnd = RUN.randomRows.find((r) => r.scope === primary) ?? RUN.randomRows[0];
  const edgeVsRandom = (ov.avgRw?.point ?? 0) - (rnd.bothAvgRw?.point ?? 0);
  P(`ส่วนต่างที่สัญญาณทำได้เหนือการเข้าไม้แบบไม่เลือกบน ${primary} (ใช้ค่าตัดที่ ±${WINSOR}): **${nf(edgeVsRandom)} R ต่อไม้**`);
  P('(ตัวเลขนี้คือ "มูลค่าของการให้คะแนนทั้งระบบ" เมื่อกติกา SL/TP เหมือนกันทุกอย่าง)');
  P();

  writeRobust(P, RUN, primary);
  writeSLTP(P, RUN, primary);
  writeRules(P, RUN, primary);
  writeConflict(P, RUN, primary);
  writeRegime(P, RUN, primary);
  writeDeadEnds(P, RUN, primary);
  writePriority(P, RUN, primary);
  writeVerification(P, RUN);

  const outAbs = path.isAbsolute(OPT.out) ? OPT.out : path.join(ROOT, OPT.out);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, L.join('\n') + '\n', 'utf8');
  console.log(`เขียนรายงาน: ${outAbs}`);

  const jsonPath = outAbs.replace(/\.md$/, '.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(), options: OPT,
    verification: RUN.verification, datasets: RUN.datasets, dropped: RUN.dropped,
    overall: RUN.overall, configRows: RUN.configRows, holdRows: RUN.holdRows,
    randomRows: RUN.randomRows, ruleRows: RUN.ruleRows, conflict: RUN.conflict,
    sltp: RUN.sltp, robust: RUN.robust, regime: RUN.regime, deadends: RUN.deadends,
  }, null, 1), 'utf8');
  console.log(`เขียนข้อมูลดิบ: ${jsonPath}`);
}

function writeRobust(P, RUN, primary) {
  const R = RUN.robust[primary];
  P('## 2.0 ก่อนอื่น: ตัวเลข R เชื่อได้แค่ไหน');
  P();
  P('เจอระหว่างทำงานนี้ และต้องพูดก่อนทุกเรื่อง เพราะมันกระทบ **ทุกตัวเลข** ที่โปรเจกต์เคยรายงาน');
  P();
  P('R = กำไร ÷ |ราคาเข้า − SL| โดย "ราคาเข้า" คือราคาเปิดของแท่งถัดไป (ตามกติกาไม่มี look-ahead)');
  P('`src/lib/backtest.ts` ทิ้งไม้เฉพาะตอนระยะนี้เป็น **ศูนย์พอดี** แต่ถ้าราคาเปิดกระโดดมาเกือบทับ SL');
  P('ระยะจะเหลือเศษเล็กมาก แล้วตัวหารของ R ก็เล็กตาม → R ของไม้เดียวใหญ่ได้ไม่จำกัด');
  P();
  P(mdTable(['สิ่งที่วัด', `ค่า (${primary})`],
    [
      ['ไม้ทั้งหมด', R.n.toLocaleString()],
      ['ขนาด R สูงสุดของไม้เดียว', nf(R.maxAbsR, 1)],
      ['ขนาด R มัธยฐาน', nf(R.absR?.median, 2)],
      ['ขนาด R ที่ p90', nf(R.absR?.p90, 2)],
      [`ไม้ที่ขนาด R เกิน ${WINSOR}`, `${R.overCap.toLocaleString()} (${pc(R.overCapShare)})`],
      ['ไม้ที่ขนาด R เกิน 100', R.over100.toLocaleString()],
      ['ระยะ SL < 0.1% ของราคา', R.riskPctTiny.below1e3.toLocaleString()],
      ['ระยะ SL < 0.01% ของราคา', R.riskPctTiny.below1e4.toLocaleString()],
      ['ไม้ที่ราคาเปิด gap เข้าไปกินระยะเสี่ยงเกินครึ่ง', `${(R.n * (R.gapIntoSL ?? 0)) | 0} (${pc(R.gapIntoSL)})`],
    ]));
  P();
  P(`ไม้ที่ผลรวมสุดขั้ว (0.1% แรกเรียงตาม \\|R\\| = ${R.top01.k.toLocaleString()} ไม้) ให้ R รวม ${nf(R.top01.sumR, 1)}`);
  P(`ขณะที่ R รวมทั้งชุดคือ ${nf(RUN.overall.find((o) => o.scope === primary)?.totalR, 1)}`);
  if (R.top01.shareOfTotal !== null) P(`→ ไม้ 0.1% นั้นคิดเป็น **${pc(R.top01.shareOfTotal)}** ของกำไรรวมทั้งหมด`);
  P();
  P('**แปลว่า: ค่าเฉลี่ยดิบไม่ได้วัดคุณภาพของกฎ แต่วัดว่าบังเอิญมีไม้ที่ตัวหารเกือบศูนย์กี่ไม้**');
  P();
  P('ตรวจซ้ำด้วยการตัดไม้กลุ่มต้องสงสัยออกแล้ววัดใหม่:');
  P();
  P(mdTable(['กลุ่มที่วัด', 'ไม้', 'avg R', 'ช่วง 95%', 'PF', 'รวม R'],
    [
      ['ทั้งหมด (ดิบ)', R.n.toLocaleString(), nf(RUN.overall.find((o) => o.scope === primary)?.avgR?.point), iv(RUN.overall.find((o) => o.scope === primary)?.avgR), pf(RUN.overall.find((o) => o.scope === primary)?.profitFactor), nf(RUN.overall.find((o) => o.scope === primary)?.totalR, 1)],
      ['ตัดไม้ที่ระยะ SL < 0.1% ของราคา', R.exclTinyRisk.n.toLocaleString(), nf(R.exclTinyRisk.avgR), iv(R.exclTinyRisk.ci), pf(R.exclTinyRisk.pf), nf(R.exclTinyRisk.totalR, 1)],
      ['ตัดไม้ที่ราคาเปิด gap กินระยะเสี่ยงเกินครึ่ง', R.exclGapFill.n.toLocaleString(), nf(R.exclGapFill.avgR), iv(R.exclGapFill.ci), pf(R.exclGapFill.pf), nf(R.exclGapFill.totalR, 1)],
      ['ตัดทั้งสองแบบ', R.exclBoth.n.toLocaleString(), nf(R.exclBoth.avgR), iv(R.exclBoth.ci), pf(R.exclBoth.pf), nf(R.exclBoth.totalR, 1)],
      [`ทั้งหมด แต่ตัดค่าที่ ±${WINSOR}`, R.n.toLocaleString(), nf(RUN.overall.find((o) => o.scope === primary)?.avgRw?.point), iv(RUN.overall.find((o) => o.scope === primary)?.avgRw), pf(RUN.overall.find((o) => o.scope === primary)?.profitFactorW), nf(RUN.overall.find((o) => o.scope === primary)?.totalRw, 1)],
    ]));
  P();
  P('ไม้ที่ |R| ใหญ่ที่สุด (ดูด้วยตาว่าเป็นของจริงหรือของเสีย):');
  P();
  P(mdTable(['สัญลักษณ์', 'กรอบ', 'วันเข้า', 'ทิศ', 'R', 'ระยะ SL % ราคา', 'ระยะ SL ตอนออกสัญญาณ %', 'ระยะเสี่ยงเหลือ (เท่า)', 'ออกเพราะ'],
    R.worst.map((w) => [w.symbol, w.tf, String(w.time).slice(0, 10), w.action, nf(w.r, 1), pc(w.riskPct, 4), pc(w.riskSigPct, 4), nf(w.slipRatio, 4), w.exitReason])));
  P();
  P('**ผลต่อรายงานนี้:** ทุกตารางหลังจากนี้จึงรายงาน avg R สองเวอร์ชันคู่กัน และใช้เวอร์ชัน');
  P(`"ตัดที่ ±${WINSOR}" เป็นตัวตัดสินในการเทียบ เพราะเวอร์ชันดิบเปลี่ยนค่าได้ทั้งชุดจากไม้เดียว`);
  P();
  P('**ผลต่อโค้ดจริง:** นี่ไม่ใช่เรื่องของกลยุทธ์ แต่เป็นเรื่องของเครื่องวัด — ตัวเลข');
  P('"674 ไม้ · PF 0.98 · avg R −0.009" ที่เคยรายงานไว้ก็คำนวณด้วยนิยามเดียวกันนี้');
  P('จึงควรถือว่ายังไม่ได้ถูกตรวจว่าปลอดจากปัญหานี้ จนกว่าจะวัดซ้ำ');
  P();
}

function writeSLTP(P, RUN, primary) {
  const S = RUN.sltp;
  P('## 2. โครงสร้าง SL/TP');
  P();
  P('### 2.1 RR ที่ระบบเสนอมาจริง (นับทุกสัญญาณ BUY/SELL ที่ออกมา ไม่ใช่แค่ไม้ที่ได้เข้า)');
  P();
  const d = S.proposedRR;
  P(mdTable(['ชุด', 'จำนวน', 'ต่ำสุด', 'p10', 'p25', 'มัธยฐาน', 'p75', 'p90', 'สูงสุด', 'เฉลี่ย'],
    [['ทั้งหมด', d.n.toLocaleString(), nf(d.min, 2), nf(d.p10, 2), nf(d.p25, 2), nf(d.median, 2), nf(d.p75, 2), nf(d.p90, 2), nf(d.max, 2), nf(d.mean, 2)]]));
  P();
  P(`- RR < 1 : **${pc(S.proposedRRbelow1)}** ของสัญญาณทั้งหมด`);
  P(`- RR < 0.5 : **${pc(S.proposedRRbelow05)}**`);
  P(`- RR < 2 : ${pc(S.proposedRRbelow2)}`);
  P();
  P('ถ้า RR เป็น 1 ต้องชนะเกิน 50% ถึงเสมอตัว · ถ้า RR เป็น 0.5 ต้องชนะเกิน 67%');
  P(`วัดได้จริง: อัตราชนะรวมของ baseline บน ${primary} = ${pc(RUN.overall.find((o) => o.scope === primary)?.winRate)}`);
  P();
  P('### 2.2 SL/TP มาจากไหน — แนวรับ/แนวต้าน หรือ ATR ล้วน');
  P();
  P('วิธีวัด: รันเครื่องยนต์ตัวเดียวกันสองครั้งที่แท่งเดียวกัน ครั้งหนึ่งเปิดใช้ระดับแนวรับ/แนวต้าน');
  P('อีกครั้งปิด (ATR ล้วน) ถ้าค่า SL หรือ TP ต่างกัน แปลว่าแท่งนั้นระดับถูกนำมาใช้จริง');
  P();
  P(mdTable(['รายการ', 'จำนวน', 'สัดส่วนของสัญญาณ'],
    [
      ['สัญญาณทั้งหมดที่วัดได้', S.srUse.total.toLocaleString(), '100%'],
      ['SL มาจากระดับ', S.srUse.sl.toLocaleString(), pc(S.srUse.sl / S.srUse.total)],
      ['TP มาจากระดับ', S.srUse.tp.toLocaleString(), pc(S.srUse.tp / S.srUse.total)],
      ['ใช้ระดับอย่างน้อยหนึ่งด้าน', S.srUse.either.toLocaleString(), pc(S.srUse.either / S.srUse.total)],
      ['ATR ล้วนทั้งสองด้าน', S.srUse.none.toLocaleString(), pc(S.srUse.none / S.srUse.total)],
    ]));
  P();
  if (S.rrByLevel && S.rrByLevel.n) {
    P(mdTable(['กลุ่ม', 'จำนวน', 'RR มัธยฐาน', 'RR p10', 'RR p90', 'สัดส่วน RR<1'],
      [
        ['ใช้ระดับ', S.rrByLevel.n.toLocaleString(), nf(S.rrByLevel.median, 2), nf(S.rrByLevel.p10, 2), nf(S.rrByLevel.p90, 2), pc(S.rrLevelBelow1)],
        ['ATR ล้วน', S.rrByAtr.n.toLocaleString(), nf(S.rrByAtr.median, 2), nf(S.rrByAtr.p10, 2), nf(S.rrByAtr.p90, 2), pc(S.rrAtrBelow1)],
      ]));
    P();
  }
  const bs = S.bySource[primary];
  P(`ผลจริงของไม้ที่เข้าได้ (${primary}):`);
  P();
  P(mdTable(G_HEAD, [
    gRow('SL มาจากระดับ', bs.slFromLevel),
    gRow('SL มาจาก ATR', bs.slFromAtr),
    gRow('TP มาจากระดับ', bs.tpFromLevel),
    gRow('TP มาจาก ATR', bs.tpFromAtr),
    gRow('ใช้ระดับอย่างน้อยหนึ่งด้าน', bs.anyLevel),
    gRow('ATR ล้วนทั้งสองด้าน', bs.pureAtr),
  ]));
  P();
  const noSR = RUN.configRows.find((c) => c.id === 'exits:noSR');
  if (noSR) {
    const x = noSR.byScope[primary];
    P(`ถ้าเลิกใช้ระดับในการวาง SL/TP ทั้งระบบ: avg R เปลี่ยน **${nf(x.dAvgR?.point)}** ช่วง 95% ${iv(x.dAvgR)} ${mark(x.dAvgR)}`);
    P();
  }

  P('### 2.3 ATR×1.5 / ATR×3 เหมาะกับหน้าต่าง 10 แท่งไหม');
  P();
  P('วัดจากข้อมูลจริง: ที่ทุกแท่ง ราคาเดินไปได้ไกลแค่ไหนภายใน 10 แท่งถัดไป (หน่วย ATR)');
  P('ตัวเลขนี้เป็นคุณสมบัติของตลาด ไม่ขึ้นกับกฎสัญญาณเลย');
  P();
  for (const tf of OPT.timeframes) {
    const t = S.travel[tf];
    if (!t || !t.up) continue;
    P(`**${tf}** (${t.up.n.toLocaleString()} แท่ง)`);
    P();
    P(mdTable(['ทิศ', 'p25', 'มัธยฐาน', 'p75', 'p90', 'ถึง 1.5×ATR', 'ถึง 3×ATR'],
      [
        ['ขึ้นสูงสุด', nf(t.up.p25, 2), nf(t.up.median, 2), nf(t.up.p75, 2), nf(t.up.p90, 2), pc(t.upAtLeast15), pc(t.upAtLeast3)],
        ['ลงต่ำสุด', nf(t.dn.p25, 2), nf(t.dn.median, 2), nf(t.dn.p75, 2), nf(t.dn.p90, 2), pc(t.dnAtLeast15), pc(t.dnAtLeast3)],
      ]));
    P();
  }
  const tPri = S.travel[primary];
  if (tPri) {
    P(`บน ${primary}: ราคาแตะระยะ 1.5×ATR (ระยะ SL) ได้ ${pc(tPri.dnAtLeast15)} ของแท่ง`);
    P(`แต่แตะระยะ 3×ATR (ระยะ TP) ได้แค่ ${pc(tPri.upAtLeast3)}`);
    if (tPri.dnAtLeast15 !== null && tPri.upAtLeast3 !== null && tPri.dnAtLeast15 > 0) {
      P(`→ ด่าน SL เข้าถึงได้ง่ายกว่าด่าน TP ประมาณ **${nf(tPri.dnAtLeast15 / Math.max(tPri.upAtLeast3, 1e-9), 1)} เท่า** ภายในหน้าต่างเดียวกัน`);
    }
  }
  P();
  const ex = S.excursion[primary];
  P(mdTable(['ตัวชี้วัดบนไม้จริง (' + primary + ')', 'p25', 'มัธยฐาน', 'p75', 'p90'],
    [
      ['กำไรลอยสูงสุด (R)', nf(ex.mfeR?.p25, 2), nf(ex.mfeR?.median, 2), nf(ex.mfeR?.p75, 2), nf(ex.mfeR?.p90, 2)],
      ['ขาดทุนลอยสูงสุด (R)', nf(ex.maeR?.p25, 2), nf(ex.maeR?.median, 2), nf(ex.maeR?.p75, 2), nf(ex.maeR?.p90, 2)],
    ]));
  P();
  P(`- ไม้ที่ราคาเคยเดินไปถึงระยะ TP ที่ตั้งไว้: **${pc(ex.couldHaveHitTP)}**`);
  P(`- ไม้ที่ราคาเคยเดินไปถึงระยะ SL: **${pc(ex.touchedSL)}**`);
  P();
  P('### 2.4 ไม้จบด้วยอะไร');
  P();
  const er = S.exitReasons[primary] ?? [];
  P(mdTable(['เหตุผลที่ออก', 'ไม้', 'สัดส่วน', 'avg R', 'รวม R'],
    er.map((r) => [r.reason, r.n.toLocaleString(), pc(r.share), nf(r.avgR), nf(r.totalR, 1)])));
  P();
  const te = er.find((r) => r.reason === 'time_exit');
  if (te) {
    P(`time_exit คิดเป็น ${pc(te.share)} ของไม้ทั้งหมด — คือไม้ที่ "ไม่ชนอะไรเลยใน 10 แท่ง"`);
    P('สัดส่วนสูงแปลว่า TP อยู่ไกลเกินกว่าที่ราคาจะไปถึงในหน้าต่างที่กำหนด');
  }
  P();
  P('### 2.5 ทดลองเปลี่ยนโครงสร้างออก (probe — ในกลุ่มตัวอย่างเดียวกัน ยังไม่แบ่ง train/test)');
  P();
  P('**เตือน:** ตารางนี้คือหลักฐานว่า "โครงสร้างออกมีผลจริงแค่ไหน" ไม่ใช่ค่าที่ควรตั้ง');
  P('การหยิบแถวที่ดีที่สุดในตารางนี้ไปใช้ = overfit ทันที เพราะเลือกจากข้อมูลชุดเดียวกับที่วัด');
  P();
  P(`ทุกคอลัมน์ต่อจากนี้ใช้ค่าตัดที่ ±${WINSOR} ตามเหตุผลในหัวข้อ 2.0 (คอลัมน์ "ดิบ" แสดงไว้เทียบ)`);
  P();
  P(mdTable(['แบบ', 'ไม้', 'avg R ดิบ', 'avg R ตัด', 'Δ เทียบ baseline', 'ช่วง 95%', 'ช่วง 99.5%', 'PF ตัด', 'รวม R ตัด', ''],
    RUN.configRows.filter((c) => c.group === 'probe').map((c) => {
      const x = c.byScope[primary];
      return [c.label, x.trades.toLocaleString(), nf(x.avgR), nf(x.avgRw), nf(x.dAvgR?.point), iv(x.dAvgR), iv995(x.dAvgR), pf(x.pfW), nf(x.totalRw, 1), mark(x.dAvgR)];
    })));
  P();
  P(mdTable(['หน้าต่างถือ (แท่ง)', 'ไม้', 'avg R ดิบ', 'avg R ตัด', 'Δ เทียบ 10 แท่ง', 'ช่วง 95%', 'PF ตัด', 'รวม R ตัด', ''],
    RUN.holdRows.map((h) => {
      const x = h.byScope[primary];
      return [String(h.hold), x.trades.toLocaleString(), nf(x.avgR), nf(x.avgRw), h.hold === OPT.maxHoldBars ? '(ฐาน)' : nf(x.dAvgR?.point), h.hold === OPT.maxHoldBars ? '' : iv(x.dAvgR), pf(x.pfW), nf(x.totalRw, 1), h.hold === OPT.maxHoldBars ? '' : mark(x.dAvgR)];
    })));
  P();
  P('### 2.6 ต้นทุนจริงกินไปเท่าไหร่ (แปลงสเปรด/ค่าคอมเป็น R)');
  P();
  const rp = S.tradeRR[primary]?.riskPct;
  if (rp) {
    P(`ระยะ SL คิดเป็นสัดส่วนของราคา (${primary}): มัธยฐาน **${pc(rp.median, 2)}** · p25 ${pc(rp.p25, 2)} · p75 ${pc(rp.p75, 2)}`);
    P();
    P('ต้นทุนไปกลับคิดเป็น R = ต้นทุน% ÷ ระยะ SL% ตารางนี้ใช้ระยะ SL มัธยฐานข้างบน:');
    P();
    P(mdTable(['ต้นทุนไปกลับ', 'คิดเป็น R ต่อไม้', 'avg R หลังหัก'],
      [0.0002, 0.0005, 0.001, 0.002].map((c) => {
        const rCost = c / rp.median;
        const base = RUN.overall.find((o) => o.scope === primary)?.avgRw?.point ?? null;
        return [pc(c, 2), nf(rCost), base === null ? '—' : nf(base - rCost)];
      })));
  }
  P();
}

function writeRules(P, RUN, primary) {
  P('## 3. กฎไหนช่วย กฎไหนทำร้าย');
  P();
  P('วัดสองวิธีที่ตอบคนละคำถาม:');
  P('1. **ปิดกฎทีละตัว (leave-one-out)** — ปิดแล้วผลรวมขยับทางไหน ตอบว่า "กฎนี้มีค่าเท่าไหร่ในระบบจริง"');
  P('2. **แยกไม้ตามว่ากฎยิงหรือไม่** — ตอบว่า "ไม้ที่มีกฎนี้ต่างจากไม้ที่ไม่มีอย่างไร"');
  P();
  P('ทั้งสองวิธีจำเป็น เพราะการปิดกฎเปลี่ยน "ชุดไม้ทั้งชุด" (คะแนนเปลี่ยน → เข้าไม้คนละที่)');
  P('เทียบ avg R ตรง ๆ ระหว่างสองชุดที่ไม่ใช่ไม้เดียวกันจึงต้องดูช่วงความเชื่อมั่นเสมอ');
  P();
  P('### 3.1 ปิดกฎทีละตัว');
  P();
  P('Δ เป็นบวก = ปิดแล้วดีขึ้น = กฎนั้นกำลังทำร้าย · Δ เป็นลบ = ปิดแล้วแย่ลง = กฎนั้นกำลังช่วย');
  P();
  P(`(ใช้ avg R ที่ตัดค่าสุดขั้วที่ ±${WINSOR} ตามหัวข้อ 2.0 — เวอร์ชันดิบแสดงไว้เทียบในคอลัมน์แรก)`);
  P();
  P(mdTable(['ปิดกฎ', 'ไม้', 'avg R ดิบ', 'avg R ตัด', 'Δ avg R', 'ช่วง 95%', 'ช่วง 99.5%', 'Δ R ต่อ 1000 แท่ง', 'ช่วง 95%', ''],
    RUN.configRows.filter((c) => c.group === 'loo').map((c) => {
      const x = c.byScope[primary];
      return [c.label, x.trades.toLocaleString(), nf(x.avgR), nf(x.avgRw), nf(x.dAvgR?.point), iv(x.dAvgR), iv995(x.dAvgR), nf(x.dR1000?.point, 2), iv(x.dR1000, 2), mark(x.dAvgR)];
    })));
  P();
  const loo = RUN.configRows.filter((c) => c.group === 'loo');
  const sig = loo.filter((c) => clears0(c.byScope[primary].dAvgR));
  if (!sig.length) {
    P('**ไม่มีกฎไหนเลยที่ปิดแล้วผลเปลี่ยนจนช่วง 95% หลุดจากศูนย์**');
    P('อ่านว่า: การรั่วไม่ได้อยู่ที่ "กฎตัวใดตัวหนึ่งเลว" — เปลี่ยนกฎทีละตัวไม่ได้แก้ปัญหา');
  } else {
    for (const c of sig) {
      const x = c.byScope[primary];
      const dir = x.dAvgR.point > 0 ? 'ทำร้าย (ปิดแล้วดีขึ้น)' : 'ช่วย (ปิดแล้วแย่ลง)';
      P(`- ${c.label}: Δ avg R = ${nf(x.dAvgR.point)} ${iv(x.dAvgR)} ${mark(x.dAvgR)} → ${dir}`);
    }
  }
  P();
  P('### 3.2 แยกไม้ตามว่ากฎยิงหรือไม่');
  P();
  P('“ยิงหนุน” = กฎให้คะแนนฝั่งเดียวกับทิศของไม้ · “ยิงค้าน” = ให้คะแนนฝั่งตรงข้าม (ยังเข้าไม้ได้เพราะฝั่งหนุนชนะ)');
  P('“ชี้ขาด” = ถ้าเอาคะแนนของกฎนี้ออก ไม้นั้นจะไม่ถึงเกณฑ์ ±3 อีกต่อไป');
  P();
  for (const r of RUN.ruleRows) {
    const g = r.byScope[primary];
    P(`**${r.th}**`);
    P();
    P(mdTable(G_HEAD, [
      gRow('ยิงหนุน', g.fired),
      gRow('— ในนั้น: ชี้ขาด', g.pivotal),
      gRow('ยิงค้าน', g.against),
      gRow('ไม่ยิงเลย', g.silent),
    ]));
    P();
  }
}

function writeConflict(P, RUN, primary) {
  const C = RUN.conflict.byScope[primary];
  P('## 4. สมมติฐาน "กลยุทธ์ตีกันเอง"');
  P();
  P('RSI<30 คือกลยุทธ์สวนเทรนด์ (คาดว่าจะเด้ง) · MA20>MA50 คือกลยุทธ์ตามเทรนด์');
  P('ระบบปัจจุบันบวกคะแนนสองอย่างนี้เข้ากองเดียวกัน ทั้งที่เป็นการเดิมพันคนละแบบ');
  P();
  P('### 4.1 แยกไม้ตามตระกูลกฎที่ยิงหนุน');
  P();
  P(mdTable(G_HEAD, [
    gRow('ตามเทรนด์ล้วน', C.families.trendOnly),
    gRow('สวนเทรนด์ล้วน', C.families.meanRevOnly),
    gRow('ผสมสองตระกูล', C.families.mixed),
    gRow('แพตเทิร์น/อื่น ๆ ล้วน', C.families.patternOnly),
  ]));
  P();
  P('(ตระกูลสวนเทรนด์ = RSI โซน + Bollinger แตะขอบ + แนวรับ/แนวต้าน · ตระกูลตามเทรนด์ = เทรนด์ MA + MACD ตัด + MACD histogram + RSI ตัด 50)');
  P();
  P('### 4.2 ไม้ที่เข้าสวนเทรนด์ที่ระบบเองตรวจพบ');
  P();
  P('“ค้านเทรนด์” = ไม้ BUY ที่กฎเทรนด์บอก downtrend หรือไม้ SELL ที่กฎเทรนด์บอก uptrend');
  P();
  P(mdTable(G_HEAD, [
    gRow('เทรนด์หนุนทิศไม้', C.trendContext.agrees),
    gRow('เทรนด์ออกข้าง', C.trendContext.sideways),
    gRow('เทรนด์ค้านทิศไม้', C.trendContext.opposes),
  ]));
  P();
  const a = C.trendContext.agrees;
  const o = C.trendContext.opposes;
  if (a.n && o.n) {
    P(`ส่วนต่าง avg R (ตัดที่ ±${WINSOR}) ระหว่าง "เทรนด์หนุน" กับ "เทรนด์ค้าน" = ${nf((a.avgRw ?? 0) - (o.avgRw ?? 0))} R ต่อไม้`);
    P(`(ช่วง 95% ของแต่ละกลุ่ม: หนุน ${iv(a.ciW)} · ค้าน ${iv(o.ciW)})`);
    const overlap = a.ciW && o.ciW && a.ciW.lo95 !== null && o.ciW.lo95 !== null && !(a.ciW.lo95 > o.ciW.hi95 || o.ciW.lo95 > a.ciW.hi95);
    P(overlap
      ? 'ช่วงความเชื่อมั่นของสองกลุ่มยังทับกัน → ยังสรุปไม่ได้ว่าต่างกันจริง'
      : 'ช่วงความเชื่อมั่นของสองกลุ่มไม่ทับกัน → ต่างกันจริงในระดับที่ข้อมูลนี้แยกออก');
  }
  P();
  P('### 4.3 คำถามตรง: RSI โซน ในเทรนด์ที่สวนทาง');
  P();
  P('ไม้ที่ RSI โซนยิงหนุน แยกตามบริบทเทรนด์ที่ระบบตรวจพบในแท่งเดียวกัน');
  P();
  P(mdTable(G_HEAD, [
    gRow('RSI โซน + เทรนด์หนุน', C.rsiZoneByTrend.agrees),
    gRow('RSI โซน + เทรนด์ออกข้าง', C.rsiZoneByTrend.sideways),
    gRow('RSI โซน + เทรนด์ค้าน', C.rsiZoneByTrend.opposes),
  ]));
  P();
  if (C.rsiZoneByTrend.agrees.n === 0) {
    P('**ช่องแรกเป็นศูนย์ และนั่นคือคำตอบของข้อนี้**');
    P();
    P(`ในไม้ทั้งหมด ${(C.rsiZoneByTrend.sideways.n + C.rsiZoneByTrend.opposes.n).toLocaleString()} ไม้ที่ RSI โซนยิงหนุน`);
    P('ไม่มีสักไม้เดียวที่กฎเทรนด์ยิงหนุนไปทางเดียวกัน — เพราะ `determineTrend` ต้องการ');
    P('close > MA20 > MA50 > MA200 พร้อมกันจึงจะเป็น uptrend ซึ่งแทบเป็นไปไม่ได้ตอน RSI < 30');
    P();
    P('แปลว่าสองกฎนี้ไม่ได้ "เสริมกัน" อย่างที่การบวกคะแนนสมมติไว้ แต่ **แยกกันเดินคนละโลก**');
    P('ทุกครั้งที่ RSI โซนได้คะแนน กฎเทรนด์จะเงียบหรือค้านเสมอ — การบวกกันจึงไม่ใช่การยืนยันซึ่งกันและกัน');
    P('แต่เป็นการปล่อยให้กลยุทธ์หนึ่งลากอีกกลยุทธ์เข้าไม้แทน');
    P();
  }
  P('### 4.4 บริบทเทรนด์ระยะยาวที่ไม่ผูกกับกฎ (ราคาเทียบ MA200)');
  P();
  P(mdTable(G_HEAD, [
    gRow('เข้าไม้ตามฝั่ง MA200', C.ma200Context.withMA),
    gRow('เข้าไม้สวนฝั่ง MA200', C.ma200Context.againstMA),
    gRow('ไม่มี MA200 (ข้อมูลไม่ถึง 200 แท่ง)', C.ma200Context.noMA),
  ]));
  P();
}

function writeRegime(P, RUN, primary) {
  const R = RUN.regime.byScope[primary];
  P('## 5. ระบอบตลาด');
  P();
  P('ตัวชี้วัดระบอบทุกตัวคำนวณจาก **อดีตล้วน** ที่แท่งสัญญาณ และจัดกลุ่มด้วย');
  P('“อันดับเทียบกับ 250 แท่งก่อนหน้าของตัวเอง” ไม่ใช่เกณฑ์คงที่ข้ามสินทรัพย์');
  P('(ทองกับเหรียญ meme ผันผวนคนละสเกล การใช้เกณฑ์เดียวกันจะได้กลุ่มที่ไม่มีความหมาย)');
  P();
  P('### 5.1 ความผันผวน (ATR% เทียบอดีตของตัวเอง)');
  P();
  P(mdTable(G_HEAD, [
    gRow('ผันผวนต่ำ (อันดับ <33%)', R.volatility.low),
    gRow('ผันผวนกลาง', R.volatility.mid),
    gRow('ผันผวนสูง (อันดับ >67%)', R.volatility.high),
    gRow('จัดอันดับไม่ได้', R.volatility.unknown),
  ]));
  P();
  P('### 5.2 ความเป็นเทรนด์ (Kaufman efficiency ratio 20 แท่ง เทียบอดีตของตัวเอง)');
  P();
  P('ค่าใกล้ 1 = ราคาวิ่งเป็นเส้นตรง · ใกล้ 0 = ส่ายไปมาไม่ไปไหน');
  P();
  P(mdTable(G_HEAD, [
    gRow('ออกข้างที่สุด (อันดับ <33%)', R.trendiness.low),
    gRow('กลาง', R.trendiness.mid),
    gRow('เป็นเทรนด์ที่สุด (อันดับ >67%)', R.trendiness.high),
    gRow('จัดอันดับไม่ได้', R.trendiness.unknown),
  ]));
  P();
  P('### 5.3 แยกตามตลาด / ทิศ / ความแรง');
  P();
  P(mdTable(G_HEAD, Object.entries(R.byMarket).sort((x, y) => y[1].n - x[1].n).map(([m, g]) => gRow(m, g))));
  P();
  P(mdTable(G_HEAD, [gRow('BUY', R.byAction.BUY), gRow('SELL', R.byAction.SELL)]));
  P();
  P(mdTable(G_HEAD, ['weak', 'moderate', 'strong', 'very_strong'].map((s) => gRow(s, R.byStrength[s]))));
  P();
}

function writeDeadEnds(P, RUN, primary) {
  const D = RUN.deadends;
  P('## 6. จุดตายที่มองไม่เห็น');
  P();
  P('### 6.1 สำมะโนทุกแท่ง (เดินทุกแท่งจริง ไม่ข้ามตอนถือไม้)');
  P();
  P(mdTable(['รายการ', 'จำนวน', 'สัดส่วนของแท่งที่ประเมิน'],
    [
      ['แท่งที่ประเมินทั้งหมด', D.census.barsEvaluated.toLocaleString(), '100%'],
      ['HOLD', D.census.action.HOLD.toLocaleString(), pc(D.census.action.HOLD / D.census.barsEvaluated)],
      ['BUY', D.census.action.BUY.toLocaleString(), pc(D.census.action.BUY / D.census.barsEvaluated)],
      ['SELL', D.census.action.SELL.toLocaleString(), pc(D.census.action.SELL / D.census.barsEvaluated)],
      ['คืน null เพราะราคาปิดใช้ไม่ได้', D.census.nullBadPrice.toLocaleString(), pc(D.census.nullBadPrice / D.census.barsEvaluated)],
      ['คืน null เพราะ SL/TP ยุบเท่าราคาเข้าหลังปัดทศนิยม', D.census.nullCollapse.toLocaleString(), pc(D.census.nullCollapse / D.census.barsEvaluated)],
    ]));
  P();
  P('### 6.2 สัญญาณที่ออกมาแล้วไม่ได้กลายเป็นไม้');
  P();
  P(mdTable(['รายการ', 'จำนวน', 'สัดส่วนของสัญญาณ BUY/SELL'],
    [
      ['สัญญาณ BUY/SELL ทั้งหมด', D.actionable.toLocaleString(), '100%'],
      ['ได้เข้าไม้จริง', D.tradesTaken.toLocaleString(), pc(D.tradesTaken / D.actionable)],
      ['ถูกทิ้งเพราะแท่งเข้าเสีย/ระยะ SL เป็นศูนย์ (skipped)', D.skipped.toLocaleString(), pc(D.skipped / D.actionable)],
      ['ถูกข้ามเพราะกำลังถือไม้อยู่', D.blockedByOpenPosition.toLocaleString(), pc(D.blockedByOpenPosition / D.actionable)],
    ]));
  P();
  P(`สัญญาณส่วนใหญ่ไม่ได้หายไปเพราะข้อมูลเสีย แต่หายเพราะกติกา "ถือทีละไม้" —`);
  P(`${pc(D.blockedByOpenPosition / D.actionable)} ของสัญญาณถูกข้ามด้วยเหตุนี้`);
  P('ตัวเลขนี้บอกว่ากลุ่มตัวอย่างที่วัดได้ไม่ใช่ประชากรทั้งหมดของสัญญาณ');
  P();
  P('### 6.3 ตัวกรอง weak ของระบบจริง');
  P();
  P('`src/app/api/cron/scan-markets/route.ts` ทิ้งสัญญาณที่ `strength === "weak"` ก่อนบันทึก');
  P('backtest ไม่ได้กรอง จึงวัดได้ว่าตัวกรองนี้ทำอะไรจริง ๆ');
  P();
  const lf = RUN.regime.byScope[primary].liveFilter;
  P(mdTable(G_HEAD, [
    gRow('ที่ระบบจริงเก็บไว้ (moderate ขึ้นไป)', lf.kept),
    gRow('ที่ระบบจริงทิ้ง (weak)', lf.dropped),
  ]));
  P();
  P(`สัดส่วน weak ในสัญญาณ BUY/SELL ทั้งหมด: ${pc(D.weakShareOfActionable)}`);
  P();
  if (lf.dropped.n === 0) {
    P('**ตัวกรองนี้ไม่ได้กรองอะไรเลย — และเป็นอย่างนั้นโดยโครงสร้าง ไม่ใช่ความบังเอิญของข้อมูล**');
    P();
    P('เหตุผล: action จะเป็น BUY ได้ต้องมี netScore = bull − bear ≥ 3 ซึ่งบังคับให้ bull ≥ 3');
    P('(เพราะ bear ≥ 0 เสมอ) ดังนั้น totalScore = max(bull, bear) ≥ 3 ซึ่งคือเกณฑ์ของ moderate พอดี');
    P('สัญญาณ BUY/SELL จึงไม่มีทางเป็น weak ได้เลย ฝั่ง SELL สมมาตรกัน');
    P();
    P(`วัดยืนยันแล้วบนสัญญาณ BUY/SELL ${D.actionable.toLocaleString()} ใบ: weak = 0 ใบ`);
    P();
    P('ผลคือบรรทัดกรองใน `scan-markets/route.ts` ทำงานเฉพาะกับ `action === "HOLD"` เท่านั้น');
    P('ถ้าเจ้าของเข้าใจว่ามีตัวกรองคุณภาพชั้นที่สองอยู่ — ไม่มี');
    P();
  }
  if (lf.kept.n && lf.dropped.n) {
    const diff = (lf.kept.avgRw ?? 0) - (lf.dropped.avgRw ?? 0);
    P(`ส่วนต่าง avg R (ตัดที่ ±${WINSOR}) ระหว่างกลุ่มที่เก็บกับกลุ่มที่ทิ้ง = ${nf(diff)} R ต่อไม้`);
    const overlap = lf.kept.ciW && lf.dropped.ciW && !(lf.kept.ciW.lo95 > lf.dropped.ciW.hi95 || lf.dropped.ciW.lo95 > lf.kept.ciW.hi95);
    P(overlap ? 'ช่วง 95% ของสองกลุ่มยังทับกัน → ตัวกรองนี้ยังพิสูจน์ไม่ได้ว่าคัดของดีออกจากของเลวได้จริง'
      : 'ช่วง 95% ของสองกลุ่มไม่ทับกัน → ตัวกรองนี้แยกกลุ่มได้จริงในระดับที่ข้อมูลนี้วัดออก');
  }
  P();
}

function writePriority(P, RUN, primary) {
  P('## 7. ถ้าจะปรับ ควรปรับตรงไหนก่อน');
  P();
  P('เรียงตามขนาดผลกระทบที่ **วัดได้จริง** ไม่ใช่ตามความน่าเชื่อของทฤษฎี');
  P('ทุกข้อคือ "จุดที่ควรไปทดลองต่อในรอบหน้าโดยมี train/test" ไม่ใช่ค่าที่ควรตั้งทันที');
  P();
  const S = RUN.sltp;
  const ov = RUN.overall.find((o) => o.scope === primary);
  const rnd = RUN.randomRows.find((r) => r.scope === primary);
  const items = [];   // ข. กลุ่มไม้ที่ขาดทุนชัด (ทับซ้อนกันได้)
  const levers = [];  // ค. โครงสร้าง/กติกาที่วัดผลกระทบได้
  const first = [];   // ก. ต้องแก้ก่อนทุกอย่าง

  const RB = RUN.robust[primary];
  first.push({
    title: 'ซ่อมเครื่องวัดก่อน: ตัวหารของ R เกือบเป็นศูนย์ได้',
    lines: [
      `ไม้เดียวเคยให้ขนาด R สูงถึง ${nf(RB.maxAbsR, 1)} · มีไม้ที่ขนาด R เกิน 100 อยู่ ${RB.over100.toLocaleString()} ไม้`,
      `ไม้ 0.1% ที่สุดขั้วที่สุดคิดเป็น ${pc(RB.top01.shareOfTotal)} ของ R รวมทั้งชุด`,
      `${pc(RB.gapIntoSL)} ของไม้มีราคาเปิดกระโดดกินระยะเสี่ยงไปเกินครึ่งก่อนเริ่มนับ`,
      `ตัดไม้กลุ่มนี้ออกแล้ว avg R เปลี่ยนจาก ${nf(ov?.avgR?.point)} เป็น ${nf(RB.exclBoth.avgR)} ${iv(RB.exclBoth.ci)}`,
      'นี่เป็นปัญหาของเครื่องวัด ไม่ใช่ของกลยุทธ์ — ต้องแก้ก่อนจะเชื่อการเปรียบเทียบใด ๆ',
    ],
  });

  const t = S.travel[primary];
  if (t) {
    levers.push({
      score: 100,
      title: 'เรขาคณิตของ SL/TP เทียบกับหน้าต่างถือ',
      lines: [
        `ภายใน ${OPT.maxHoldBars} แท่ง ราคาแตะระยะ 1.5×ATR ได้ ${pc(t.dnAtLeast15)} แต่แตะ 3×ATR ได้ ${pc(t.upAtLeast3)}`,
        `ไม้จริงที่เคยเดินไปถึงระยะ TP ที่ตั้งไว้มีแค่ ${pc(S.excursion[primary].couldHaveHitTP)}`,
        `RR ที่เสนอมามัธยฐาน ${nf(S.proposedRR.median, 2)} แต่ ${pc(S.proposedRRbelow1)} ของสัญญาณมี RR < 1`,
        `อัตราชนะจริง ${pc(ov?.winRate)} — ต่ำกว่าที่ RR ระดับนี้ต้องการเพื่อเสมอตัว`,
      ],
    });
  }
  const noSR = RUN.configRows.find((c) => c.id === 'exits:noSR');
  if (noSR) {
    const x = noSR.byScope[primary];
    levers.push({
      score: Math.abs(x.dAvgR?.point ?? 0) * 1000 + (clears0(x.dAvgR) ? 50 : 0),
      title: 'การเอาแนวรับ/แนวต้านมาวาง SL/TP',
      lines: [
        `${pc(S.srUse.either / S.srUse.total)} ของสัญญาณใช้ระดับอย่างน้อยหนึ่งด้าน`,
        `กลุ่มที่ใช้ระดับ RR มัธยฐาน ${nf(S.rrByLevel?.median, 2)} vs ATR ล้วน ${nf(S.rrByAtr?.median, 2)}`,
        `ปิดทั้งหมดแล้ว avg R เปลี่ยน ${nf(x.dAvgR?.point)} ${iv(x.dAvgR)} ${mark(x.dAvgR)}`,
      ],
    });
  }
  if (rnd) {
    const gap = (ov?.avgRw?.point ?? 0) - (rnd.bothAvgRw?.point ?? 0);
    levers.push({
      score: 80,
      title: 'มูลค่าของระบบให้คะแนนเอง',
      lines: [
        `สัญญาณ avg R (ตัดที่ ±${WINSOR}) ${nf(ov?.avgRw?.point)} ${iv(ov?.avgRw)}`,
        `เข้าไม้ทุกแท่งโดยไม่ดูสัญญาณ ${nf(rnd.bothAvgRw?.point)} ${iv(rnd.bothAvgRw)}`,
        `ส่วนต่าง ${nf(gap)} R ต่อไม้ — ${Math.abs(gap) < 0.02 ? 'เล็กมากเมื่อเทียบกับความกว้างของช่วงความเชื่อมั่น' : 'มีขนาดที่ควรตามต่อ'}`,
      ],
    });
  }
  const loo = RUN.configRows.filter((c) => c.group === 'loo');
  const strongest = loo.slice().sort((a, b) => Math.abs(b.byScope[primary].dAvgR?.point ?? 0) - Math.abs(a.byScope[primary].dAvgR?.point ?? 0))[0];
  if (strongest) {
    const x = strongest.byScope[primary];
    const anySig = loo.some((c) => clears0(c.byScope[primary].dAvgR));
    levers.push({
      score: anySig ? 70 : 20,
      title: 'กฎรายตัว',
      lines: [
        anySig
          ? `มีกฎที่ปิดแล้วผลเปลี่ยนจนช่วง 95% หลุดศูนย์: ${loo.filter((c) => clears0(c.byScope[primary].dAvgR)).map((c) => c.label).join(' · ')}`
          : 'ไม่มีกฎตัวใดที่ปิดแล้วผลเปลี่ยนจนช่วง 95% หลุดจากศูนย์',
        `ตัวที่ขยับมากที่สุดคือ "${strongest.label}" Δ avg R = ${nf(x.dAvgR?.point)} ${iv(x.dAvgR)}`,
        anySig ? 'ควรตามต่อเป็นรายตัว' : 'อ่านว่า: การรื้อกฎทีละตัวไม่น่าจะเป็นทางแก้ — ปัญหาอยู่ระดับโครงสร้าง ไม่ใช่ระดับกฎ',
      ],
    });
  }
  const C = RUN.conflict.byScope[primary];
  const agr = C.trendContext.agrees;
  const sid = C.trendContext.sideways;
  if (agr.n && sid.n) {
    const gap = (agr.avgRw ?? 0) - (sid.avgRw ?? 0);
    const separated = agr.ciW && sid.ciW && (agr.ciW.lo95 > sid.ciW.hi95 || sid.ciW.lo95 > agr.ciW.hi95);
    levers.push({
      score: Math.abs(gap) * 1000 + (separated ? 40 : 0),
      title: 'บริบทเทรนด์เป็นตัวแบ่งที่คมที่สุดที่เจอ',
      lines: [
        `ไม้ที่เทรนด์หนุนทิศ avg R ${nf(agr.avgRw)} ${iv(agr.ciW)} (${agr.n.toLocaleString()} ไม้)`,
        `ไม้ที่เทรนด์บอกออกข้าง avg R ${nf(sid.avgRw)} ${iv(sid.ciW)} (${sid.n.toLocaleString()} ไม้)`,
        separated
          ? `ต่างกัน ${nf(gap)} R และช่วงความเชื่อมั่นของสองกลุ่มไม่ทับกัน — ตัวแบ่งนี้ใช้ได้จริง`
          : `ต่างกัน ${nf(gap)} R แต่ช่วงความเชื่อมั่นยังทับกัน`,
        `ไม้ที่เทรนด์ค้านทิศมีแค่ ${C.trendContext.opposes.n.toLocaleString()} ไม้ (${pc(C.trendContext.opposes.n / (ov?.trades || 1))}) — น้อยเกินกว่าจะเป็นตัวการหลัก`,
      ],
    });
  }
  // กลุ่มย่อยที่ช่วง 95% หลุดจากศูนย์ = จุดที่ข้อมูลชี้ชัดที่สุดว่าเงินหายไปตรงไหน
  const RG = RUN.regime.byScope[primary];
  const cut = (label, g, note) => {
    if (!g || !g.n || !clears0(g.ciW)) return;
    items.push({
      score: Math.abs(g.avgRw) * 1000 + (clears0strict(g.ciW) ? 60 : 20),
      title: label,
      lines: [
        `${g.n.toLocaleString()} ไม้ (${pc(g.n / (ov?.trades || 1))} ของไม้ทั้งหมด) · avg R ${nf(g.avgRw)} ${iv(g.ciW)} ${mark(g.ciW)} · PF ${pf(g.pfW)}`,
        `กลุ่มนี้กินไป ${nf(g.totalRw, 1)} R (ทั้งระบบรวมได้ ${nf(ov?.totalRw, 1)} R)`,
        note,
      ],
    });
  };
  cut('ไม้ฝั่ง SELL', RG.byAction.SELL, `เทียบกับฝั่ง BUY ${nf(RG.byAction.BUY.avgRw)} ${iv(RG.byAction.BUY.ciW)} — ระบบทำเงินได้ข้างเดียว`);
  cut('ไม้ที่เข้าตอนผันผวนสูง', RG.volatility.high, `เทียบกับผันผวนต่ำ ${nf(RG.volatility.low.avgRw)} ${iv(RG.volatility.low.ciW)} — ATR ที่ใช้วาง SL ยังตามความผันผวนไม่ทัน`);
  cut('ไม้ที่เข้าสวนฝั่ง MA200', C.ma200Context.againstMA, `เทียบกับตามฝั่ง MA200 ${nf(C.ma200Context.withMA.avgRw)} ${iv(C.ma200Context.withMA.ciW)}`);
  cut('ไม้ที่กฎเทรนด์บอก "ออกข้าง"', C.trendContext.sideways, 'กลุ่มนี้ใหญ่ที่สุดและติดลบชัดที่สุด — สัญญาณส่วนใหญ่เกิดตอนไม่มีเทรนด์ให้ตาม');
  cut('ไม้ที่ยิงจากตระกูลสวนเทรนด์ล้วน', C.families.meanRevOnly, `เทียบกับตามเทรนด์ล้วน ${nf(C.families.trendOnly.avgRw)} ${iv(C.families.trendOnly.ciW)}`);
  cut('ไม้ที่ยิงจากสองตระกูลผสมกัน', C.families.mixed, 'การผสมไม่ได้ทำให้ดีขึ้น — แย่กว่าตามเทรนด์ล้วนอย่างวัดได้');

  const D = RUN.deadends;
  if (RG.liveFilter.dropped.n === 0) {
    levers.push({
      score: 45,
      title: 'ตัวกรอง weak ในระบบจริงเป็นบรรทัดที่ไม่มีผล',
      lines: [
        `สัญญาณ BUY/SELL ${D.actionable.toLocaleString()} ใบ มี strength = weak อยู่ 0 ใบ`,
        'เพราะ netScore ≥ 3 บังคับให้ bull ≥ 3 → totalScore ≥ 3 → อย่างน้อยเป็น moderate เสมอ',
        'ถ้าตั้งใจให้มีตัวกรองคุณภาพชั้นสอง ตอนนี้ยังไม่มี — ต้องใช้เกณฑ์อื่นแทน',
      ],
    });
  }
  levers.push({
    score: 30,
    title: 'ขนาดกลุ่มตัวอย่างที่ถูกกติกาถือทีละไม้ตัดทิ้ง',
    lines: [
      `${pc(D.blockedByOpenPosition / D.actionable)} ของสัญญาณ BUY/SELL ไม่เคยถูกวัดเลยเพราะติดไม้ค้างอยู่`,
      `สัญญาณที่วัดได้จริง ${D.tradesTaken.toLocaleString()} จาก ${D.actionable.toLocaleString()} ใบ`,
      'ผลที่วัดได้จึงเป็นผลของ "ลำดับที่ไม้มาถึง" ด้วย ไม่ใช่คุณภาพของสัญญาณล้วน ๆ',
    ],
  });

  const block = (heading, note, list) => {
    P(`### ${heading}`);
    P();
    if (note) { P(note); P(); }
    list.forEach((it, k) => {
      P(`**${k + 1}. ${it.title}**`);
      P();
      for (const l of it.lines) P(`- ${l}`);
      P();
    });
  };

  block('ก. ต้องแก้ก่อนทุกอย่าง — เครื่องวัด', null, first);
  items.sort((a, b) => b.score - a.score);
  block(
    'ข. เงินหายไปกับไม้กลุ่มไหน',
    'กลุ่มเหล่านี้ **ทับซ้อนกัน** (ไม้ตัวเดียวอยู่ได้หลายกลุ่ม) จึงเอา "รวม R" มาบวกกันไม่ได้\n' +
    'เรียงตามขนาดผลที่วัดได้ และแสดงเฉพาะกลุ่มที่ช่วง 95% ไม่คร่อมศูนย์',
    items
  );
  levers.sort((a, b) => b.score - a.score);
  block(
    'ค. คันโยกเชิงโครงสร้างที่วัดผลกระทบได้แล้ว',
    'ข้อพวกนี้คือ "จุดที่ควรไปทดลองในรอบหน้า" ไม่ใช่ค่าที่ควรตั้งทันที',
    levers
  );
  P('### สิ่งที่ข้อมูลชุดนี้ยัง "ไม่ได้" บอก');
  P();
  P('- ไม่ได้บอกว่าค่าไหนคือค่าที่ถูก — ทุกตัวเลขในรายงานวัดบนข้อมูลชุดเดียวกันทั้งหมด');
  P('- ไม่ได้บอกว่าโครงสร้างใหม่จะมี edge — บอกได้แค่ว่าโครงสร้างเดิมรั่วตรงไหน');
  P('- ไม่ได้บอกอะไรเกี่ยวกับต้นทุนจริงของโบรกเกอร์ที่เจ้าของใช้ (feesR=0 ทั้งรายงาน)');
  P();
}

function writeVerification(P, RUN) {
  const V = RUN.verification;
  P('## 8. ชั้นตรวจสอบตัวเอง (ทำไมถึงเชื่อตัวเลขข้างบนได้)');
  P();
  P('เครื่องมือนี้ใช้ทางลัดคำนวณเพื่อให้รันได้หลายสิบรอบบนข้อมูลเกือบล้านแท่ง');
  P('ทางลัดทุกชั้นถูกพิสูจน์ว่าให้ผลเท่าของจริง ก่อนที่ตัวเลขใด ๆ จะถูกรายงาน');
  P();
  P(mdTable(['ชั้น', 'ตรวจอะไร', 'ขนาดที่ตรวจ', 'ผล'],
    [
      ['V1', 'ทางลัด vs `generateSignal` ของ `src/lib/signal-engine.ts` ตัวจริง (ทุกฟิลด์)', `${V.v1Compared.toLocaleString()} แท่ง จาก ${V.v1Datasets} ชุด (ชุดละ ${V.v1BarsPerDataset} แท่ง)`, `ต่าง ${V.v1Diffs}`],
      ['V2', 'ลูป backtest สำเนา vs `runBacktest` ของ `src/lib/backtest.ts` ตัวจริง (ทุกฟิลด์รายไม้)', `${V.v2Datasets} ชุด · ${V.v2Trades.toLocaleString()} ไม้`, `ต่าง ${V.v2Diffs}`],
      ['V3', 'การถอดคะแนนรายกฎ ต้องทำนาย action/strength/confidence ของสัญญาณจริงได้ถูก', `${RUN.deadends.tradesTaken.toLocaleString()} ไม้`, 'ผิด 0'],
      ['V4', '`maxReasons=99` (ที่ใช้ติดเครื่องวัด) ต้องไม่เปลี่ยนผลแม้แต่ไม้เดียว', `${RUN.deadends.tradesTaken.toLocaleString()} ไม้`, 'ต่าง 0'],
    ]));
  P();
  P('ถ้าชั้นใดชั้นหนึ่งไม่ผ่าน สคริปต์จะหยุดและไม่เขียนรายงานเลย — ไม่มีการรายงานตัวเลขที่ยังพิสูจน์ไม่ได้');
  P();
  P('### สิ่งที่ยังเป็นความเสี่ยง');
  P();
  P('- V1 ตรวจ 900 แท่งแรกของแต่ละชุดตัวอย่าง ไม่ได้ตรวจทุกแท่งของทุกชุด (จะช้าเกินกว่าจะรันได้)');
  P('  ความเสี่ยงที่เหลือคือกิ่งที่โผล่เฉพาะข้อมูลช่วงหลังของสัญลักษณ์ใหญ่ ๆ');
  P('- ข้อมูลมี survivorship bias ที่แก้ไม่ได้ (Yahoo ลบสัญลักษณ์ที่ออกจากกระดานทิ้ง)');
  P('  ผลทุกชิ้นจึงดีกว่าความจริงเล็กน้อยเสมอ');
  P('- ราคาไม่ได้หักปันผล หุ้นปันผลสูงจะมี gap ลงทุกครั้งที่ขึ้น XD ซึ่งระบบอาจอ่านเป็นสัญญาณ');
  P('- 1H ย้อนได้แค่ 730 วัน = เห็นตลาดยุคเดียว ข้อสรุปจาก 1H อ่อนกว่า 1D มาก');
  P();
}

// ─────────────────────────── รันเมื่อถูกเรียกตรง ๆ ───────────────────────────

const invokedDirectly = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\n[ล้มเหลว] ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}

export { main };
