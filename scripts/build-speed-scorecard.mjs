#!/usr/bin/env node
/**
 * build-speed-scorecard.mjs — วัดว่า "คู่ไหนจบเร็วและได้กำไร" แล้วเขียนลงไฟล์ข้อมูล
 *
 * ═══ วิธีสร้างใหม่ (ข้อมูลจะเก่า ต้องรู้ว่าสร้างใหม่ยังไง) ═══════════════════
 *   cd C:/Users/ASUS/Desktop/TIKTOK
 *   node scripts/build-speed-scorecard.mjs
 *
 *   ตัวเลือก:
 *     --limit=6          วัดแค่ 6 สัญลักษณ์แรก (ใช้ตอนไล่ปัญหา ไม่ใช่ตอนสร้างของจริง)
 *     --timeframe=1H     วัด timeframe เดียว (ปกติวัดทั้ง 1D และ 1H)
 *     --concurrency=4    จำนวนคำขอ Yahoo พร้อมกัน (default 4)
 *     --out=<path>       เขียนไปที่อื่น (default src/lib/speed-scorecard.data.json)
 *     --dry-run          วัดแล้วพิมพ์รายงาน ไม่เขียนไฟล์
 *
 *   ใช้เวลาราว 4–8 นาที (คอขวดคือ generateSignal ที่เป็น O(n²) ตามจำนวนแท่ง
 *   ไม่ใช่เครือข่าย) เขียนทับ src/lib/speed-scorecard.data.json ทั้งไฟล์
 *   หลังรันเสร็จต้อง `npx tsc --noEmit` ซ้ำ เพราะ reader อ่าน JSON ตัวนี้เข้าไปเป็น type
 *
 * ═══ ไฟล์นี้วัดอะไร ═══════════════════════════════════════════════════════
 * เจ้าของสั่งว่า "เรียงลำดับตัวที่ได้กำไรจบภายใน 1 ชั่วโมงให้ผมด้วย"
 * บนแท่ง 1H หนึ่งแท่ง = หนึ่งชั่วโมง คำถามจึงกลายเป็นคำถามที่วัดได้:
 *   "สัญญาณของคู่นี้ ถึง TP ก่อนโดน SL ภายใน K แท่ง บ่อยแค่ไหน"
 *
 * ⚠ นิยามของ K ในไฟล์นี้ = "จำนวนแท่งที่ไม้กินไป" = holdBars + 1
 *   K=1 → ปิดจบภายในแท่งที่เข้าเอง (holdBars = 0) = บน 1H คือจบภายใน 1 ชั่วโมงจริง ๆ
 *   K=2 → holdBars ≤ 1 = จบภายใน 2 ชั่วโมง
 *   เลือกนิยามนี้เพราะมัน "เข้มกว่า" การนับ holdBars ≤ 1 ตรง ๆ — จะได้ไม่มีใคร
 *   หลงคิดว่าเลข K=1 คือความน่าจะเป็นของสองชั่วโมง ตัวเลขทั้งสองแบบอยู่ในไฟล์ผลลัพธ์
 *   (K=1 กับ K=2) จึงเทียบกันได้เองโดยไม่ต้องเชื่อคำอธิบายนี้
 *
 * ⚠ 1D ตอบคำถาม "จบใน 1 ชั่วโมง" ไม่ได้เลย — หนึ่งแท่งคือหนึ่งวัน ความละเอียด
 *   ของข้อมูลหยาบกว่าคำถาม 6.5 เท่าเป็นอย่างน้อย เราจึงยังวัด 1D ไว้ (เพื่อดูกำไร)
 *   แต่ติดธง speedMeasurable = false ให้คนอ่านรู้ว่าคะแนนความเร็วของ 1D คือคนละหน่วย
 *
 * ═══ ทำไม maxHoldBars = 6 ไม่ใช่ค่า default 10 ═══════════════════════════
 * 1. ต้อง ≥ 6 ไม่งั้นวัด K=6 ไม่ได้เลย (ไม้ถูกบังคับปิดก่อนถึงแท่งที่ 6)
 * 2. ไม่ควรเกิน 6 เพราะ runBacktest ข้ามสัญญาณใหม่ทุกอันระหว่างที่ยังถือไม้อยู่
 *    (i = exitIndex) → ยิ่งตั้ง maxHoldBars ยาว ไม้หนึ่งไม้ยิ่งบัง "สัญญาณเร็ว"
 *    ที่เกิดตามหลังมาไปหลายอัน ประชากรไม้ที่เราเอามาวัดจะเอนไปทางไม้ที่ถือยาว
 *    ซึ่งคือกลุ่มที่ตรงข้ามกับคำถามที่เจ้าของถามพอดี
 * 3. เจ้าของเทรดสั้น กรอบ 6 ชั่วโมงบน 1H = ภายในวันเดียว เกินจากนั้นไม่เกี่ยวกับคำถาม
 * ผลข้างเคียงที่ต้องยอมรับและพูดให้ตรง: winRate / avgR / profitFactor ในไฟล์นี้
 * คือ "ค่าภายใต้กรอบถือ 6 แท่ง" ไม่ใช่ค่าเดียวกับที่ scripts/run-backtest.mjs
 * (default 10) รายงาน เอาไปเทียบกันตรง ๆ ไม่ได้
 *
 * ═══ กติกาความซื่อสัตย์ของไฟล์นี้ ═════════════════════════════════════════
 * - ใช้ runBacktest จาก src/lib/backtest.ts ตัวจริง ไม่เขียน backtest ใหม่
 * - ใช้ SYMBOL_UNIVERSE จาก src/lib/universe.ts ตัวจริง ไม่ก๊อปรายชื่อมาแปะ
 * - ตัวรวมสถิติ (aggregate) ถูก "ตรวจสอบกับของจริง" ทุกรอบที่รัน: ค่าที่มันคำนวณ
 *   จากไม้ทั้งชุด ต้องตรงกับ result.stats ของ runBacktest เป๊ะ ไม่งั้นสคริปต์ตาย
 *   (assertAggregateParity) — เพื่อกันไม่ให้ตัวรวมสถิติกลายเป็นสูตรคู่ขนานที่เพี้ยนเงียบ ๆ
 * - feesR = 0 → ตัวเลขทุกตัวยังไม่หักสเปรด/ค่าคอม ของจริงแย่กว่านี้เสมอ
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ───────────────────────────────── อาร์กิวเมนต์ ─────────────────────────────────

function argValue(name) {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : null;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

function fail(message) {
  console.error(`\n[ล้มเหลว] ${message}\n`);
  process.exit(1);
}

const ARG_LIMIT = argValue('limit') !== null ? Number(argValue('limit')) : null;
const ARG_TF = argValue('timeframe');
const ARG_CONCURRENCY = argValue('concurrency') !== null ? Number(argValue('concurrency')) : 4;
const ARG_OUT = argValue('out');
const DRY_RUN = hasFlag('dry-run');

if (ARG_LIMIT !== null && (!Number.isFinite(ARG_LIMIT) || ARG_LIMIT < 1)) fail('--limit ต้องเป็นจำนวนเต็ม >= 1');
if (!Number.isFinite(ARG_CONCURRENCY) || ARG_CONCURRENCY < 1) fail('--concurrency ต้องเป็นจำนวนเต็ม >= 1');

// ─────────────────────────────── ค่าคงที่ของการวัด ───────────────────────────────

/** ถือได้นานสุดกี่แท่ง — เหตุผลอยู่ในหัวไฟล์ ห้ามแก้โดยไม่แก้คำอธิบายด้วย */
const MAX_HOLD_BARS = 6;

/** K ที่รายงาน = จำนวนแท่งที่ไม้กินไป (holdBars + 1) */
const K_LEVELS = [1, 2, 3, 6];

/** ต่ำกว่านี้ตัวเลขรายคู่ไม่มีความหมาย — reader ต้องถอยไปใช้ค่ากลางแทน */
const MIN_RELIABLE_TRADES = 30;

/**
 * หน้าต่างข้อมูลของแต่ละ timeframe
 *
 * ทำไม 1H ใช้ 365 วัน ไม่ใช่ 3 เดือนแบบ market-data.ts:
 *   3 เดือนให้ไม้ราว 40–120 ไม้ต่อคู่ ซึ่งแบ่ง train/test แล้วเหลือฝั่งละ ~30
 *   คือน้อยเกินกว่าจะตอบคำถาม "อันดับรอด out-of-sample ไหม" ได้เลย
 *   365 วันให้ไม้ 150–800 ไม้ต่อคู่ ต้นทุนคือเวลารัน (O(n²)) ซึ่งจ่ายครั้งเดียวตอนสร้างไฟล์
 * ทำไมไม่เอามากกว่านี้: generateSignal เป็น O(n²) — 2 ปีของ 1H (17,500 แท่ง)
 *   ใช้เวลา ~21 วิ/คู่ = ~10 นาทีต่อรอบสร้าง และข้อมูลเก่ากว่า 1 ปีอยู่คนละ regime อยู่แล้ว
 *
 * ทำไม 1D ใช้ 5 ปี: 1D เดินวันละแท่ง 1 ปีให้แค่ ~250 แท่ง ≈ 20 ไม้ ซึ่งไร้ความหมาย
 *   5 ปี ≈ 1,250 แท่ง ≈ 100 ไม้ ยังน้อยแต่พอเริ่มพูดถึงได้ และ 1D เป็น O(n²) ที่เล็กมาก
 */
const TIMEFRAMES = {
  '1H': { interval: '1h', range: '2y', windowDays: 365, barMinutes: 60, speedMeasurable: true },
  '1D': { interval: '1d', range: '5y', windowDays: 365 * 5, barMinutes: 60 * 24, speedMeasurable: false },
};

/**
 * สัดส่วนช่วงทดสอบ (out-of-sample) = 30% ท้ายของหน้าต่าง
 *
 * แบ่งด้วย "วันที่จริง" ไม่ใช่ "ลำดับไม้" โดยเจตนา — ถ้าแบ่งด้วยลำดับไม้
 * แต่ละคู่จะมีเส้นแบ่งคนละวัน แล้วคำว่า "ช่วงทดสอบ" จะหมายถึงคนละสภาพตลาด
 * ของแต่ละคู่ ซึ่งทำให้เอาผลมาเทียบกันไม่ได้เลย
 */
const TEST_FRACTION = 0.30;

// ─────────────────────────── โหลดโมดูลจริงจาก src/lib ───────────────────────────

const require = createRequire(import.meta.url);
let typescript;
try {
  typescript = require('typescript');
} catch {
  fail('ไม่พบ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่');
}

function mapSpecifier(spec) {
  let s = spec;
  if (s.startsWith('@/')) s = `./${s.slice(2)}`;
  if (s.startsWith('./') || s.startsWith('../')) return `./${s.split('/').pop()}.mjs`;
  return spec;
}

function transpile(tsSource, fileName) {
  const out = typescript.transpileModule(tsSource, {
    fileName,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext,
      removeComments: false,
    },
  }).outputText;
  return out.replace(/(from\s+)(['"])([^'"]+)\2/g, (_m, kw, q, spec) => `${kw}${q}${mapSpecifier(spec)}${q}`);
}

/**
 * โหลด backtest.ts + universe.ts เป็นโมดูล ESM จริง
 * (universe.ts import แค่ type จาก '@/types' — ถูกลอกทิ้งตอน transpile จึงต้องมี stub)
 */
async function loadSrcModules() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'speed-scorecard-'));
  try {
    writeFileSync(path.join(tmpDir, 'types.mjs'), 'export {};\n', 'utf8');
    // candle-sanitizer ต้องมาก่อน signal-engine (เป็น dependency ใหม่ของด่านตรวจแท่ง)
    for (const rel of ['src/lib/candle-sanitizer.ts', 'src/lib/indicators.ts', 'src/lib/signal-engine.ts', 'src/lib/backtest.ts', 'src/lib/universe.ts']) {
      const abs = path.join(ROOT, ...rel.split('/'));
      const base = path.basename(rel, '.ts');
      writeFileSync(path.join(tmpDir, `${base}.mjs`), transpile(readFileSync(abs, 'utf8'), `${base}.ts`), 'utf8');
    }
    const backtest = await import(pathToFileURL(path.join(tmpDir, 'backtest.mjs')).href);
    const universe = await import(pathToFileURL(path.join(tmpDir, 'universe.mjs')).href);
    if (typeof backtest.runBacktest !== 'function') fail('src/lib/backtest.ts ไม่มี export runBacktest');
    if (!Array.isArray(universe.SYMBOL_UNIVERSE)) fail('src/lib/universe.ts ไม่มี export SYMBOL_UNIVERSE');
    if (!universe.SIGNAL_GATE || !universe.STRENGTH_RANK) fail('src/lib/universe.ts ไม่มี export SIGNAL_GATE / STRENGTH_RANK');
    return {
      runBacktest: backtest.runBacktest,
      SYMBOL_UNIVERSE: universe.SYMBOL_UNIVERSE,
      SIGNAL_GATE: universe.SIGNAL_GATE,
      STRENGTH_RANK: universe.STRENGTH_RANK,
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ───────────────────────── ดึงแท่งจาก Yahoo (ลอกจาก run-backtest.mjs) ─────────────────────────

function toYahooSymbol(symbol, market) {
  const s = symbol.trim().toUpperCase();
  if (market === 'GOLD') {
    if (s === 'XAUUSD' || s === 'GOLD') return 'GC=F';
    if (s === 'XAGUSD' || s === 'SILVER') return 'SI=F';
    return s;
  }
  if (market === 'FOREX') return s.endsWith('=X') ? s : `${s}=X`;
  if (market === 'TH_STOCK') return s.endsWith('.BK') ? s : `${s}.BK`;
  if (market === 'CRYPTO') return s.includes('-') ? s : `${s}-USD`;
  return s;
}

const CHART_HOSTS = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart',
];

async function fetchCandles(symbol, market, interval, range) {
  const yahooSymbol = toYahooSymbol(symbol, market);
  for (const host of CHART_HOSTS) {
    try {
      const res = await fetch(
        `${host}/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const timestamps = result.timestamp || [];
      const ohlc = result.indicators?.quote?.[0];
      if (!ohlc) continue;
      const candles = timestamps
        .map((ts, i) => ({
          timestamp: new Date(ts * 1000).toISOString(),
          open: ohlc.open?.[i] ?? 0,
          high: ohlc.high?.[i] ?? 0,
          low: ohlc.low?.[i] ?? 0,
          close: ohlc.close?.[i] ?? 0,
          volume: ohlc.volume?.[i] ?? 0,
        }))
        .filter((c) => c.close > 0);
      return { candles, ok: true };
    } catch {
      // ลอง host ถัดไป
    }
  }
  return { candles: [], ok: false };
}

/** รันงาน async เป็นชุด ๆ ละ n ตัว — กัน Yahoo throttle และกันหน่วยความจำบวม */
async function mapWithConcurrency(items, n, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}

// ─────────────────────────────── ตัวรวมสถิติ ───────────────────────────────

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const round = (v, d = 4) => (v === null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

/** ไม้นี้ปิดเป็นกำไรที่ระดับ TP หรือไม่ (รวมกรณีเปิด gap ทะลุ TP) */
const isTpExit = (t) => t.exitReason === 'take_profit' || t.exitReason === 'gap_target';
/** ไม้นี้ปิดที่ระดับ SL หรือไม่ (รวมกรณีเปิด gap ทะลุ SL) */
const isSlExit = (t) => t.exitReason === 'stop_loss' || t.exitReason === 'gap_stop';

const EXIT_REASONS = ['stop_loss', 'take_profit', 'time_exit', 'gap_stop', 'gap_target'];

/**
 * รวมสถิติจากรายการไม้
 *
 * ⚠ สูตร count/winRate/profitFactor/avgR ในนี้ต้องตรงกับ computeStats() ใน backtest.ts เป๊ะ
 *   assertAggregateParity() ด้านล่างตรวจข้อนี้กับผลจริงทุกรอบที่รัน ถ้าใครแก้สูตรฝั่งใด
 *   ฝั่งหนึ่งแล้วไม่แก้อีกฝั่ง สคริปต์จะตายทันที ไม่ใช่รายงานเลขผิดเงียบ ๆ
 */
function aggregate(trades) {
  const count = trades.length;
  if (count === 0) {
    return {
      trades: 0, winRate: null, avgR: null, profitFactor: null,
      pTpWithin: {}, pSlWithin: {}, realizedRWithin: {},
      medianHoldBarsWin: null, medianHoldBarsAll: null, exitShare: {},
    };
  }

  let wins = 0, sumR = 0, grossWinR = 0, grossLossR = 0;
  for (const t of trades) {
    sumR += t.r;
    if (t.r > 0) { wins++; grossWinR += t.r; }
    else if (t.r < 0) { grossLossR += -t.r; }
  }

  const pTpWithin = {};
  const pSlWithin = {};
  const realizedRWithin = {};
  for (const k of K_LEVELS) {
    // "ไม้กินไป k แท่งหรือน้อยกว่า" — holdBars 0 คือจบในแท่งที่เข้าเอง จึงเป็น k = 1
    const within = trades.filter((t) => t.holdBars + 1 <= k);
    pTpWithin[k] = round(within.filter(isTpExit).length / count);
    pSlWithin[k] = round(within.filter(isSlExit).length / count);
    // R ที่ "รับรู้แล้วจริง" ณ แท่งที่ k — ไม้ที่ยังไม่จบนับเป็น 0
    // (ไม่ใช่ 0 เพราะไม่กำไร แต่เพราะยังไม่มีอะไรเข้ากระเป๋า ซึ่งคือสิ่งที่เจ้าของถาม)
    realizedRWithin[k] = round(within.reduce((s, t) => s + t.r, 0) / count);
  }

  const exitShare = {};
  for (const reason of EXIT_REASONS) {
    exitShare[reason] = round(trades.filter((t) => t.exitReason === reason).length / count);
  }

  return {
    trades: count,
    winRate: round(wins / count),
    avgR: round(sumR / count),
    profitFactor: grossLossR > 0 ? round(grossWinR / grossLossR) : null,
    pTpWithin,
    pSlWithin,
    realizedRWithin,
    medianHoldBarsWin: median(trades.filter((t) => t.r > 0).map((t) => t.holdBars)),
    medianHoldBarsAll: median(trades.map((t) => t.holdBars)),
    exitShare,
  };
}

/**
 * ═══ ไม้ไหนคือไม้ที่เจ้าของ "ได้รับแจ้งเตือนจริง" ═══════════════════════════
 *
 * runBacktest เรียก generateSignal ตรง ๆ โดยไม่ผ่าน SIGNAL_GATE เลย ประชากรไม้ที่ได้
 * จึงเป็น "สัญญาณดิบทุกอัน" ซึ่งไม่ใช่สิ่งที่เจ้าของเห็น — เขาเห็นเฉพาะที่ผ่านประตูคุณภาพ
 * วัดจริงพบว่าความต่างนี้ใหญ่มาก ไม่ใช่รายละเอียดปลีกย่อย:
 *   RR ที่วางไว้ตอนเข้าไม้ของสัญญาณดิบ p50 = 0.93 และ 51.9% มี RR < 1
 *   → ไม้ที่ "ถึง TP" จ่ายเฉลี่ยแค่ +0.39R (ที่ K=1) ขณะที่ไม้ที่โดน SL เสียเต็ม −1.0R
 *   นี่คือสาเหตุจริงที่ realizedR ติดลบ ไม่ใช่เพราะ SL ถูกแตะบ่อยกว่า TP
 *   (ที่ K=1 บนตะกร้าทดสอบ TP โดน 301 ครั้ง SL โดนแค่ 84 ครั้ง — ชนะบ่อยกว่าด้วยซ้ำ
 *    แต่ชนะทีละนิด แพ้ทีละเต็ม) และ minRiskReward 1.5 ของ SIGNAL_GATE คือสิ่งที่
 *   ตัดครึ่งล่างนั้นทิ้งพอดี ตัวเลขของสองประชากรจึงห้ามเอามาปนกัน
 *
 * เราสร้างสัญญาณใหม่เพื่อตรวจประตูไม่ได้ (BacktestTrade ไม่ได้เก็บ Signal ไว้)
 * แต่ BacktestTrade เก็บ strength / confidence / entry / stopLoss / takeProfit ครบ
 * ซึ่งพอสำหรับคำนวณทุกเกณฑ์ใน SIGNAL_GATE ได้ตรง ๆ — จึงใช้ SIGNAL_GATE ตัวจริง
 * ที่ import มา ไม่ใช่ตัวเลขที่ก๊อปมาแปะ
 *
 * ⚠ ไม่ตรงกับของจริงเป๊ะสองจุด และต้องพูดให้ตรง:
 *   1. ประตูจริงคิด RR จาก entry_price = ราคาปิดแท่งที่ยิงสัญญาณ ส่วนที่นี่คิดจาก
 *      ราคาเปิดแท่งถัดไปที่เข้าไม้จริง สองค่านี้ต่างกันเล็กน้อยตาม gap ข้ามแท่ง
 *   2. maxSignalsPerRun (โควตา 5 อัน/รอบ) เป็นเกณฑ์ระดับ "รอบสแกน" ไม่ใช่ระดับไม้
 *      จึงบังคับใช้ที่นี่ไม่ได้ — ตัวเลข gated จึงเป็นขอบบน (ของจริงจะน้อยกว่านี้)
 */
function makeGateFilter(SIGNAL_GATE, STRENGTH_RANK) {
  return function passesGateOnTrade(t) {
    const risk = Math.abs(t.entry - t.stopLoss);
    const reward = Math.abs(t.takeProfit - t.entry);
    if (!(risk > 0) || !(reward > 0) || !(t.entry > 0)) return false;
    const rr = reward / risk;
    const stopPct = (risk / t.entry) * 100;
    if (STRENGTH_RANK[t.strength] < STRENGTH_RANK[SIGNAL_GATE.minStrength]) return false;
    if (!(t.confidence >= SIGNAL_GATE.minConfidence)) return false;
    if (rr < SIGNAL_GATE.minRiskReward) return false;
    if (SIGNAL_GATE.maxRiskReward !== null && rr > SIGNAL_GATE.maxRiskReward) return false;
    if (stopPct < SIGNAL_GATE.minStopDistancePct) return false;
    if (stopPct > SIGNAL_GATE.maxStopDistancePct) return false;
    return true;
  };
}

/**
 * ตรวจว่าตัวรวมสถิติของเราให้ค่าตรงกับ runBacktest เป๊ะบนไม้ชุดเดียวกัน
 * ไม่ตรง = มีสูตรคู่ขนานที่เพี้ยน → หยุดทันที ดีกว่าปล่อยเลขผิดลงไฟล์ที่คนอื่นเอาไปใช้
 */
function assertAggregateParity(label, mine, official) {
  const cmp = [
    ['trades', mine.trades, official.count],
    ['winRate', mine.winRate, official.winRate === null ? null : round(official.winRate)],
    ['avgR', mine.avgR, official.avgR === null ? null : round(official.avgR)],
    ['profitFactor', mine.profitFactor, official.profitFactor === null ? null : round(official.profitFactor)],
  ];
  for (const [name, a, b] of cmp) {
    if (a !== b) {
      fail(
        `ตัวรวมสถิติไม่ตรงกับ runBacktest ที่ ${label} — ${name}: aggregate ได้ ${a} แต่ result.stats ได้ ${b}\n` +
        'แปลว่าสูตรใน aggregate() กับ computeStats() ใน src/lib/backtest.ts แยกทางกันแล้ว ต้องแก้ให้ตรงก่อนใช้ผล'
      );
    }
  }
}

// ─────────────────────────────── คะแนนความเร็ว ───────────────────────────────

/**
 * คะแนนที่เอามาทดสอบว่า "จัดอันดับรายคู่แล้วใช้ได้จริงไหม"
 *
 * ทดสอบสามตัว ไม่ใช่ตัวเดียว เพราะถ้าตัวเดียวสอบตก เราจะแยกไม่ออกว่า
 * "สูตรคะแนนห่วย" หรือ "ข้อมูลไม่มีอะไรให้จัดอันดับตั้งแต่แรก" — สามตัวสอบตกหมด
 * คือหลักฐานของอย่างหลัง ซึ่งเป็นข้อสรุปที่แรงกว่ามาก
 *
 *   realizedR2 — R เฉลี่ยต่อสัญญาณที่ "รับรู้จริงแล้ว" ภายใน 2 แท่ง (ไม้ที่ยังไม่จบนับ 0)
 *                ตัวหลัก ตรงกับคำถามของเจ้าของที่สุด: จบเร็ว + ได้กำไรจริง
 *                ใช้ R ไม่ใช่ความน่าจะเป็นล้วน เพราะความน่าจะเป็นไม่แยกว่าไม้ที่ไม่ถึง TP
 *                ไปโดน SL (เสียเงิน) หรือแค่ยังไม่จบ (ไม่เสียอะไร)
 *   pTp2       — ความน่าจะเป็นถึง TP ก่อน SL ภายใน 2 แท่ง (คะแนนความเร็วล้วน)
 *   avgR       — กำไรเฉลี่ยต่อไม้ ไม่สนความเร็วเลย (ตัวเทียบ: ถ้าแม้แต่ตัวนี้ยังไม่รอด
 *                out-of-sample แปลว่าผลงานรายตัวในอดีตไม่ได้บอกอะไรเลยจริง ๆ)
 */
const SCORE_CANDIDATES = {
  realizedR2: (s) => (typeof s.realizedRWithin?.[2] === 'number' ? s.realizedRWithin[2] : null),
  pTp2: (s) => (typeof s.pTpWithin?.[2] === 'number' ? s.pTpWithin[2] : null),
  avgR: (s) => (typeof s.avgR === 'number' ? s.avgR : null),
};

/**
 * บทบาทของคะแนนแต่ละตัว — reader ถามคนละคำถามกับสองตัวนี้ จึงต้องตัดสินแยกกัน
 *   SPEED_SCORE  ตอบ "คู่นี้จบเร็วไหม"      → ใช้จัดอันดับได้ ถ้ามันสอบผ่าน
 *   PROFIT_SCORE ตอบ "คู่นี้ทำเงินได้ไหม"   → ใช้จัดอันดับได้ ถ้ามันสอบผ่าน
 * แยกกันเพราะสองอย่างนี้ไม่จำเป็นต้องคงเส้นคงวาเท่ากัน และผลจริงก็ออกมาไม่เท่ากันด้วย
 */
const SPEED_SCORE = 'pTp2';
const PROFIT_SCORE = 'avgR';

/** PRNG แบบ deterministic — ไฟล์ผลลัพธ์ต้อง commit ได้ ค่า p จึงห้ามเปลี่ยนทุกครั้งที่รัน */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERMUTATIONS = 10000;
const PERM_SEED = 20260817;

/** สหสัมพันธ์อันดับของสเปียร์แมน — วัดว่า "อันดับ" จาก train ยังตรงกับ test แค่ไหน */
function spearman(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  const rank = (values) => {
    const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1; // อันดับเฉลี่ยของกลุ่มที่ค่าเท่ากัน
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(pairs.map((p) => p[0]));
  const rb = rank(pairs.map((p) => p[1]));
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return round(num / Math.sqrt(da * db), 3);
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * ทดสอบด้วยการสับไพ่ (permutation test) — ตอบคำถามเดียว:
 * "ถ้าคะแนนจากช่วง train ไม่มีข้อมูลอะไรเลย โอกาสที่จะได้ผลดีเท่าที่เห็นคือเท่าไร"
 *
 * ทำไมต้องมีตัวนี้ ไม่ใช้เกณฑ์แบบ "top ชนะค่าเฉลี่ยก็พอ":
 *   การคัด 10 ตัวที่ดีที่สุดจาก 57 ตัว ยังไงก็ต้องมีบางตัวที่ตัวเลขสวยด้วยความบังเอิญ
 *   เกณฑ์ "ชนะค่าเฉลี่ย" จึงผ่านได้ด้วยโชคล้วน ๆ บ่อยมาก — วัดจริงรอบแรกพบว่า
 *   ทั้งกลุ่ม top และกลุ่ม bottom ต่างก็ "ชนะค่าเฉลี่ย" พร้อมกัน ซึ่งเป็นไปไม่ได้
 *   ถ้าอันดับมีความหมายจริง เกณฑ์นั้นจึงถูกทิ้ง แล้วเปลี่ยนมาใช้ค่า p แทน
 *
 * สับ 10,000 ครั้งด้วย seed คงที่ → ค่า p เดิมทุกครั้งที่รันบนข้อมูลชุดเดิม
 */
function permutationLiftP(testScores, topN, observedTopMean, seed) {
  const rnd = mulberry32(seed);
  const n = testScores.length;
  let atLeastAsGood = 0;
  const arr = new Array(n);
  for (let it = 0; it < PERMUTATIONS; it++) {
    for (let i = 0; i < n; i++) arr[i] = testScores[i];
    // สุ่มหยิบ topN ตัวแบบไม่ซ้ำ (Fisher–Yates บางส่วน) = "ถ้าเลือกมั่วจะได้เท่าไร"
    let sum = 0;
    for (let i = 0; i < topN; i++) {
      const j = i + Math.floor(rnd() * (n - i));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      sum += arr[i];
    }
    if (sum / topN >= observedTopMean) atLeastAsGood++;
  }
  // +1 ทั้งเศษและส่วน = ไม่มีวันรายงาน p = 0 (เราสับแค่ 10,000 ครั้ง ไม่ใช่ทุกความเป็นไปได้)
  return round((atLeastAsGood + 1) / (PERMUTATIONS + 1), 4);
}

/** ค่า p ของสหสัมพันธ์อันดับ ด้วยวิธีสับไพ่เหมือนกัน (ทางเดียว: train ทำนาย test ได้ "บวก" ไหม) */
function permutationSpearmanP(pairs, observedRho, seed) {
  if (observedRho === null) return null;
  const rnd = mulberry32(seed);
  const a = pairs.map((p) => p[0]);
  const b = pairs.map((p) => p[1]);
  const n = b.length;
  let atLeastAsGood = 0;
  const shuffled = new Array(n);
  for (let it = 0; it < PERMUTATIONS; it++) {
    for (let i = 0; i < n; i++) shuffled[i] = b[i];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    const rho = spearman(a.map((v, i) => [v, shuffled[i]]));
    if (rho !== null && rho >= observedRho) atLeastAsGood++;
  }
  return round((atLeastAsGood + 1) / (PERMUTATIONS + 1), 4);
}

/**
 * ทดสอบคะแนนหนึ่งตัวว่ารอด out-of-sample ไหม — ต้องผ่านครบ 3 ด่าน
 *   1. top ต้องชนะ bottom  — ถ้าหัวตารางกับท้ายตารางให้ผลพอกัน อันดับไม่มีความหมาย
 *      (ด่านนี้เกิดจากของจริง: รอบแรกที่วัด top −0.0300 / bottom −0.0307 ต่างกัน 0.0007 R
 *       ซึ่ง "ชนะ" ตามตัวอักษร แต่ไม่มีความหมายทางการเงินเลย)
 *   2. ค่า p ของ lift < 0.05 — ผลของ top ต้องดีเกินกว่าที่การสุ่มหยิบ 10 ตัวจะให้ได้
 *   3. ค่า p ของสหสัมพันธ์อันดับ < 0.05 — อันดับทั้งกระดานต้องยังสัมพันธ์กัน ไม่ใช่แค่หัวตาราง
 */
function evaluateScoreCandidate(scored, topN, seed) {
  const byTrain = [...scored].sort((a, b) => b.trainScore - a.trainScore);
  const top = byTrain.slice(0, topN);
  const bottom = byTrain.slice(-topN);
  const testScores = scored.map((s) => s.testScore);

  const topTestScore = mean(top.map((s) => s.testScore));
  const allTestScore = mean(testScores);
  const bottomTestScore = mean(bottom.map((s) => s.testScore));
  const rho = spearman(scored.map((s) => [s.trainScore, s.testScore]));

  const liftP = permutationLiftP(testScores, topN, topTestScore, seed);
  const rhoP = permutationSpearmanP(scored.map((s) => [s.trainScore, s.testScore]), rho, seed + 1);

  const topBeatsBottom = topTestScore > bottomTestScore;
  const holds = topBeatsBottom && liftP < 0.05 && rhoP !== null && rhoP < 0.05;

  return {
    holds,
    topTestScore: round(topTestScore),
    allTestScore: round(allTestScore),
    bottomTestScore: round(bottomTestScore),
    topMinusBottom: round(topTestScore - bottomTestScore),
    topBeatsBottom,
    liftP,
    spearmanTrainVsTest: rho,
    spearmanP: rhoP,
    topTestAvgR: round(mean(top.map((s) => s.testAvgR ?? 0))),
    allTestAvgR: round(mean(scored.map((s) => s.testAvgR ?? 0))),
    topPairsByTrain: top.map((s) => s.key),
  };
}

// ───────────────────────────────────── main ─────────────────────────────────────

async function main() {
  const startedAt = Date.now();
  const { runBacktest, SYMBOL_UNIVERSE, SIGNAL_GATE, STRENGTH_RANK } = await loadSrcModules();
  const passesGateOnTrade = makeGateFilter(SIGNAL_GATE, STRENGTH_RANK);

  let universe = [...SYMBOL_UNIVERSE];
  if (ARG_LIMIT !== null) universe = universe.slice(0, ARG_LIMIT);

  let timeframeKeys = Object.keys(TIMEFRAMES);
  if (ARG_TF) {
    const up = ARG_TF.toUpperCase();
    if (!TIMEFRAMES[up]) fail(`ไม่รู้จัก timeframe "${ARG_TF}" — เลือกจาก ${Object.keys(TIMEFRAMES).join(', ')}`);
    timeframeKeys = [up];
  }

  console.log('build-speed-scorecard — วัดว่าคู่ไหน "จบเร็วและได้กำไร"');
  console.log(`สัญลักษณ์ ${universe.length} ตัว × timeframe ${timeframeKeys.join(',')} · maxHoldBars=${MAX_HOLD_BARS} · feesR=0`);
  console.log('คำเตือน: feesR=0 → ตัวเลขทั้งหมดยังไม่หักสเปรด/ค่าคอม ของจริงแย่กว่านี้เสมอ\n');

  const jobs = [];
  for (const tf of timeframeKeys) for (const u of universe) jobs.push({ ...u, timeframe: tf });

  const now = Date.now();
  const rows = [];
  const failures = [];
  let done = 0;

  await mapWithConcurrency(jobs, ARG_CONCURRENCY, async (job) => {
    const cfg = TIMEFRAMES[job.timeframe];
    const { candles, ok } = await fetchCandles(job.symbol, job.market, cfg.interval, cfg.range);

    // ตัดหน้าต่างด้วย "วันที่จริง" เพื่อให้ทุกคู่ถูกวัดบนช่วงปฏิทินเดียวกัน
    const windowStart = now - cfg.windowDays * 86400000;
    const cutoff = now - cfg.windowDays * TEST_FRACTION * 86400000;
    const windowed = candles.filter((c) => Date.parse(c.timestamp) >= windowStart);

    done++;
    if (!ok || windowed.length < 120) {
      failures.push({ symbol: job.symbol, market: job.market, timeframe: job.timeframe, bars: windowed.length, fetched: ok });
      console.log(`[${done}/${jobs.length}] ${job.symbol} ${job.timeframe} — ข้าม (ได้ ${windowed.length} แท่งในหน้าต่าง${ok ? '' : ', ดึงข้อมูลไม่สำเร็จ'})`);
      return;
    }

    const t0 = Date.now();
    const result = runBacktest({
      symbol: job.symbol,
      name: job.name,
      market: job.market,
      timeframe: job.timeframe,
      candles: windowed,
      maxHoldBars: MAX_HOLD_BARS,
      feesR: 0,
    });

    const full = aggregate(result.trades);
    assertAggregateParity(`${job.symbol} ${job.timeframe}`, full, result.stats);

    const trainTrades = result.trades.filter((t) => Date.parse(t.entryTime) < cutoff);
    const testTrades = result.trades.filter((t) => Date.parse(t.entryTime) >= cutoff);

    rows.push({
      symbol: job.symbol,
      name: job.name,
      market: job.market,
      timeframe: job.timeframe,
      bars: windowed.length,
      firstBar: windowed[0].timestamp,
      lastBar: windowed[windowed.length - 1].timestamp,
      skipped: result.skipped,
      full,
      // ประชากรที่เจ้าของได้เห็นจริง — คนละชุดกับ full และตัวเลขต่างกันมาก
      gated: aggregate(result.trades.filter(passesGateOnTrade)),
      train: aggregate(trainTrades),
      test: aggregate(testTrades),
    });

    const nGated = result.trades.filter(passesGateOnTrade).length;
    console.log(
      `[${done}/${jobs.length}] ${job.symbol.padEnd(7)} ${job.timeframe} · ${String(windowed.length).padStart(5)} แท่ง · ` +
      `${String(full.trades).padStart(4)} ไม้ (ผ่านประตู ${String(nGated).padStart(3)}) · train ${trainTrades.length} / test ${testTrades.length} · ${((Date.now() - t0) / 1000).toFixed(1)}s`
    );
  });

  if (rows.length === 0) fail('ไม่มีคู่ไหนวัดได้เลย — ตรวจการเชื่อมต่อเครือข่าย');

  rows.sort((a, b) => a.timeframe.localeCompare(b.timeframe) || a.symbol.localeCompare(b.symbol));

  // ═══ การทดสอบ out-of-sample — ข้อสำคัญที่สุด ═══════════════════════════════
  const validation = {};
  for (const tf of timeframeKeys) {
    const tfRows = rows.filter((r) => r.timeframe === tf);
    // เอาเฉพาะคู่ที่ทั้งสองช่วงมีไม้พอจะพูดถึง ไม่งั้นเรากำลังจัดอันดับเสียงรบกวน
    const usable = tfRows.filter((r) => r.train.trades >= MIN_RELIABLE_TRADES && r.test.trades >= MIN_RELIABLE_TRADES);

    if (usable.length < 6) {
      validation[tf] = {
        verdict: 'insufficient_data',
        note: `มีคู่ที่ทั้ง train และ test ถึง ${MIN_RELIABLE_TRADES} ไม้แค่ ${usable.length} คู่ — น้อยเกินกว่าจะทดสอบอันดับได้`,
        usablePairs: usable.length,
      };
      continue;
    }

    const topN = Math.min(10, Math.max(3, Math.floor(usable.length / 3)));
    const candidates = {};
    let seedStep = 0;

    for (const [name, pick] of Object.entries(SCORE_CANDIDATES)) {
      const scored = usable
        .map((r) => ({
          key: `${r.symbol}|${tf}`,
          trainScore: pick(r.train),
          testScore: pick(r.test),
          testAvgR: r.test.avgR,
        }))
        .filter((s) => s.trainScore !== null && s.testScore !== null);

      candidates[name] = scored.length < 6
        ? { holds: false, note: `คู่ที่คำนวณคะแนนนี้ได้มีแค่ ${scored.length}` }
        : evaluateScoreCandidate(scored, topN, PERM_SEED + seedStep * 977);
      seedStep += 1;
    }

    const holdingScores = Object.entries(candidates).filter(([, c]) => c.holds).map(([n]) => n);
    const speedHolds = Boolean(candidates[SPEED_SCORE]?.holds);
    const profitHolds = Boolean(candidates[PROFIT_SCORE]?.holds);

    validation[tf] = {
      // สองปุ่มนี้คือสิ่งเดียวที่ reader อ่านไปตัดสินใจ — ที่เหลือมีไว้ให้คนตรวจ
      trustPerPairSpeed: speedHolds,
      trustPerPairProfit: profitHolds,
      verdict: speedHolds || profitHolds ? 'partially_holds' : 'does_not_hold',
      usablePairs: usable.length,
      topN,
      permutations: PERMUTATIONS,
      permutationSeed: PERM_SEED,
      speedScoreName: SPEED_SCORE,
      profitScoreName: PROFIT_SCORE,
      holdingScores,
      candidates,
      note:
        `ความเร็ว (${SPEED_SCORE}) ${speedHolds ? 'รอด' : 'ไม่รอด'} out-of-sample · ` +
        `ผลกำไร (${PROFIT_SCORE}) ${profitHolds ? 'รอด' : 'ไม่รอด'} out-of-sample`,
    };
  }

  // ═══ ค่ากลางแบบรวมกลุ่ม (ค่าถอยหลังของ reader) ═════════════════════════════
  // คู่ที่ไม้น้อยกว่า MIN_RELIABLE_TRADES ห้ามเอาไปปนตอนคิดค่ากลาง
  // ไม่งั้นค่าถอยหลังก็จะเป็นค่าเฉลี่ยของเสียงรบกวนเหมือนกัน
  const pooled = { byMarketTimeframe: {}, byTimeframe: {}, gatedByMarketTimeframe: {}, gatedByTimeframe: {} };

  /** รวมสถิติข้ามคู่ โดยถ่วงน้ำหนักด้วยจำนวนไม้จริง (ไม่ใช่เฉลี่ยของเฉลี่ย ซึ่งจะเพี้ยนเมื่อไม้ไม่เท่ากัน) */
  const poolStats = (list, block) => {
    const usable = list.filter((r) => r[block].trades > 0);
    if (usable.length === 0) return null;
    const totalTrades = usable.reduce((s, r) => s + r[block].trades, 0);
    // กองที่รวมแล้วยังไม่ถึงเกณฑ์ ก็ยังเป็นเสียงรบกวนอยู่ดี — ไม่คืนค่าดีกว่าคืนเลขลอย ๆ
    if (totalTrades < MIN_RELIABLE_TRADES) return null;
    const weighted = (pick) => {
      let sum = 0, n = 0;
      for (const r of usable) {
        const v = pick(r[block]);
        if (typeof v === 'number') { sum += v * r[block].trades; n += r[block].trades; }
      }
      return n > 0 ? round(sum / n) : null;
    };
    const pTpWithin = {}, pSlWithin = {}, realizedRWithin = {};
    for (const k of K_LEVELS) {
      pTpWithin[k] = weighted((s) => s.pTpWithin[k]);
      pSlWithin[k] = weighted((s) => s.pSlWithin[k]);
      realizedRWithin[k] = weighted((s) => s.realizedRWithin[k]);
    }
    return {
      pairs: usable.length,
      trades: totalTrades,
      winRate: weighted((s) => s.winRate),
      avgR: weighted((s) => s.avgR),
      pTpWithin,
      pSlWithin,
      realizedRWithin,
      medianHoldBarsWin: median(usable.map((r) => r[block].medianHoldBarsWin).filter((v) => v !== null)),
    };
  };

  // กอง full คิดจากเฉพาะคู่ที่ไม้ถึงเกณฑ์ — ไม่งั้นค่ากลางก็เป็นค่าเฉลี่ยของเสียงรบกวน
  // กอง gated ไม่กรองรายคู่ เพราะ "ไม้น้อยรายคู่" คือธรรมชาติของประตูคุณภาพเอง
  // (ประตูตัดทิ้ง ~90% ของสัญญาณ) การรวมกองคือวิธีแก้ปัญหานั้น ไม่ใช่ปัญหาซ้อนปัญหา
  const reliable = rows.filter((r) => r.full.trades >= MIN_RELIABLE_TRADES);
  for (const tf of timeframeKeys) {
    pooled.byTimeframe[tf] = poolStats(reliable.filter((r) => r.timeframe === tf), 'full');
    pooled.gatedByTimeframe[tf] = poolStats(rows.filter((r) => r.timeframe === tf), 'gated');
    for (const market of [...new Set(rows.map((r) => r.market))]) {
      const s = poolStats(reliable.filter((r) => r.timeframe === tf && r.market === market), 'full');
      if (s) pooled.byMarketTimeframe[`${market}|${tf}`] = s;
      const g = poolStats(rows.filter((r) => r.timeframe === tf && r.market === market), 'gated');
      if (g) pooled.gatedByMarketTimeframe[`${market}|${tf}`] = g;
    }
  }

  // ═══ นโยบายที่ reader ต้องเชื่อฟัง ═════════════════════════════════════════
  // เขียนลงไฟล์ข้อมูล ไม่ใช่ hardcode ใน reader โดยเจตนา: วันที่ใครสร้างไฟล์นี้ใหม่
  // แล้วผลตรวจพลิก reader ต้องเปลี่ยนพฤติกรรมตามทันทีโดยไม่ต้องมีคนไปแก้โค้ด
  // ถ้า hardcode ไว้ ข้อสรุปเก่าจะค้างอยู่ในโค้ดเงียบ ๆ หลังข้อมูลบอกตรงข้ามไปแล้ว
  const readerPolicy = {};
  for (const tf of timeframeKeys) {
    const v = validation[tf];
    readerPolicy[tf] = {
      usePerPairSpeed: Boolean(v?.trustPerPairSpeed),
      usePerPairProfit: Boolean(v?.trustPerPairProfit),
      speedMeasurable: TIMEFRAMES[tf].speedMeasurable,
    };
  }

  // ═══ ฐานอ้างอิงสำหรับแปลงคะแนนเป็น 0–100 ═══════════════════════════════════
  // เก็บ "การกระจายของ pTp2 ทั้งกระดาน" ไว้ แล้วให้ reader คิดเป็นเปอร์เซ็นไทล์เอา
  // ทำไมใช้เปอร์เซ็นไทล์ ไม่ใช่ค่าดิบคูณร้อย: ค่าดิบ 0.15 แปลว่าอะไรไม่มีใครรู้
  // แต่ "เร็วกว่า 90% ของคู่ที่วัดได้" อ่านแล้วเข้าใจทันที และทนต่อค่าผิดปกติหางเดียว
  const scoreReference = {};
  for (const tf of timeframeKeys) {
    const vals = rows
      .filter((r) => r.timeframe === tf && r.full.trades >= MIN_RELIABLE_TRADES)
      .map((r) => r.full.pTpWithin[2])
      .filter((v) => typeof v === 'number')
      .sort((a, b) => a - b);
    if (vals.length > 0) scoreReference[tf] = { metric: 'pTpWithin2', sortedValues: vals };
  }

  // ═══ เขียนไฟล์ ═══════════════════════════════════════════════════════════
  const measuredAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    measuredAt,
    generator: 'scripts/build-speed-scorecard.mjs',
    rebuildCommand: 'node scripts/build-speed-scorecard.mjs',
    method: {
      engine: 'runBacktest() จาก src/lib/backtest.ts (walk-forward, ไม่มี look-ahead)',
      maxHoldBars: MAX_HOLD_BARS,
      feesR: 0,
      kMeaning: 'K = จำนวนแท่งที่ไม้กินไป = holdBars + 1 · K=1 คือปิดจบภายในแท่งที่เข้าเอง',
      minReliableTrades: MIN_RELIABLE_TRADES,
      testFraction: TEST_FRACTION,
      windowDaysByTimeframe: Object.fromEntries(Object.entries(TIMEFRAMES).map(([k, v]) => [k, v.windowDays])),
      barMinutesByTimeframe: Object.fromEntries(Object.entries(TIMEFRAMES).map(([k, v]) => [k, v.barMinutes])),
      speedMeasurableByTimeframe: Object.fromEntries(Object.entries(TIMEFRAMES).map(([k, v]) => [k, v.speedMeasurable])),
      caveats: [
        'ยังไม่หักสเปรด/ค่าคอม/สลิปเพจ (feesR=0) — ผลจริงแย่กว่านี้เสมอ',
        'แท่งที่แตะทั้ง SL และ TP นับ SL ก่อนเสมอ (OHLC ไม่บอกลำดับราคาในแท่ง)',
        'winRate/avgR/profitFactor ในไฟล์นี้คิดภายใต้ maxHoldBars=6 เทียบกับ run-backtest.mjs (default 10) ตรง ๆ ไม่ได้',
        '1D ตอบคำถาม "จบใน 1 ชั่วโมง" ไม่ได้ — หนึ่งแท่งคือหนึ่งวัน',
      ],
    },
    readerPolicy,
    scoreReference,
    validation,
    pooled,
    pairs: rows,
    unmeasured: failures,
  };

  /**
   * แยกเป็นสองไฟล์โดยเจตนา
   *
   *   .data.json     — เฉพาะที่ reader ต้องใช้ตอนรัน (มี src/lib/speed-scorecard.ts import เข้าไป)
   *                    JSON ที่ถูก import จะถูกรวมเข้า bundle ทั้งก้อน ไม่มีการตัดเฉพาะคีย์ที่ใช้
   *                    ก้อนเต็มคือ ~300 KB ซึ่งถ้าใครเผลอ import จากคอมโพเนนต์ฝั่งผู้ใช้
   *                    เจ้าของจะต้องโหลด 300 KB ทุกครั้งที่เปิดหน้าเว็บเพื่อใช้เลขไม่กี่ตัว
   *   .evidence.json — ท่อนหลักฐานเต็ม (train/test รายคู่) ห้ามมีโมดูล .ts ไหน import
   *                    มีไว้ให้คนเปิดอ่าน/ตรวจย้อนหลังว่าเลขในข้อสรุปมาจากไหน
   */
  const runtimePayload = {
    schemaVersion: payload.schemaVersion,
    measuredAt,
    generator: payload.generator,
    rebuildCommand: payload.rebuildCommand,
    evidenceFile: 'src/lib/speed-scorecard.evidence.json',
    method: payload.method,
    readerPolicy,
    scoreReference,
    // สรุปผลตรวจแบบย่อ — รายละเอียด p-value ทั้งหมดอยู่ในไฟล์หลักฐาน
    validationSummary: Object.fromEntries(
      Object.entries(validation).map(([tf, v]) => [tf, {
        verdict: v.verdict,
        trustPerPairSpeed: v.trustPerPairSpeed ?? false,
        trustPerPairProfit: v.trustPerPairProfit ?? false,
        usablePairs: v.usablePairs ?? 0,
        note: v.note,
      }])
    ),
    pooled,
    // แต่ละแถวพก measuredAt + trades ติดตัวไปด้วย เพื่อให้แถวที่ถูกคัดลอกออกไปที่อื่น
    // ยังบอกได้เองว่า "วัดเมื่อไร ด้วยไม้กี่ไม้" โดยไม่ต้องกลับมาดูหัวไฟล์
    pairs: rows.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      market: r.market,
      timeframe: r.timeframe,
      measuredAt,
      trades: r.full.trades,
      reliable: r.full.trades >= MIN_RELIABLE_TRADES,
      bars: r.bars,
      firstBar: r.firstBar,
      lastBar: r.lastBar,
      winRate: r.full.winRate,
      avgR: r.full.avgR,
      profitFactor: r.full.profitFactor,
      pTpWithin: r.full.pTpWithin,
      pSlWithin: r.full.pSlWithin,
      realizedRWithin: r.full.realizedRWithin,
      medianHoldBarsWin: r.full.medianHoldBarsWin,
      exitShare: r.full.exitShare,
      /**
       * ไม้เฉพาะที่ผ่าน SIGNAL_GATE = ประชากรที่เจ้าของได้รับแจ้งเตือนจริง
       * gatedTrades มักน้อยกว่า 30 ต่อคู่ (ประตูตัดทิ้งราว 90%) จึงห้ามอ่านรายคู่
       * ให้ใช้ pooled.gatedBy* แทน — reader บังคับข้อนี้ไว้แล้ว
       */
      gatedTrades: r.gated.trades,
      gatedWinRate: r.gated.winRate,
      gatedAvgR: r.gated.avgR,
      gatedPTpWithin: r.gated.pTpWithin,
      gatedRealizedRWithin: r.gated.realizedRWithin,
    })),
    unmeasured: failures,
  };

  const outPath = ARG_OUT
    ? path.resolve(ROOT, ARG_OUT)
    : path.join(ROOT, 'src', 'lib', 'speed-scorecard.data.json');
  const evidencePath = path.join(path.dirname(outPath), 'speed-scorecard.evidence.json');

  if (!DRY_RUN) {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(runtimePayload, null, 2) + '\n', 'utf8');
    writeFileSync(evidencePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  }

  // ═══ รายงานบนจอ ══════════════════════════════════════════════════════════
  console.log('\n══ ความถี่ของ "จบเร็ว" ต่อ timeframe (วัดจากไม้จริงทุกไม้) ══');
  for (const tf of timeframeKeys) {
    const p = pooled.byTimeframe[tf];
    if (!p) { console.log(`${tf}: ไม่มีคู่ที่ไม้ถึง ${MIN_RELIABLE_TRADES}`); continue; }
    const line = K_LEVELS.map((k) => `K=${k}: TP ${(p.pTpWithin[k] * 100).toFixed(1)}% / R ${p.realizedRWithin[k] >= 0 ? '+' : ''}${p.realizedRWithin[k].toFixed(3)}`).join(' · ');
    console.log(`${tf} สัญญาณดิบทุกอัน (${p.pairs} คู่ ${p.trades} ไม้) ${line}`);
    console.log(`     winRate ${(p.winRate * 100).toFixed(1)}% · avgR ${p.avgR >= 0 ? '+' : ''}${p.avgR.toFixed(3)} · median holdBars ของไม้ชนะ ${p.medianHoldBarsWin}`);
    const g = pooled.gatedByTimeframe[tf];
    if (g) {
      const gline = K_LEVELS.map((k) => `K=${k}: TP ${(g.pTpWithin[k] * 100).toFixed(1)}% / R ${g.realizedRWithin[k] >= 0 ? '+' : ''}${g.realizedRWithin[k].toFixed(3)}`).join(' · ');
      console.log(`${tf} เฉพาะที่ผ่านประตู  (${g.pairs} คู่ ${g.trades} ไม้) ${gline}`);
      console.log(`     winRate ${(g.winRate * 100).toFixed(1)}% · avgR ${g.avgR >= 0 ? '+' : ''}${g.avgR.toFixed(3)} · median holdBars ของไม้ชนะ ${g.medianHoldBarsWin}`);
    } else {
      console.log(`${tf} เฉพาะที่ผ่านประตู  — ไม้รวมกันยังไม่ถึง ${MIN_RELIABLE_TRADES} วัดไม่ได้`);
    }
  }

  console.log('\n══ ผลทดสอบ out-of-sample (อันดับจาก train ยังใช้ได้ใน test ไหม) ══');
  for (const tf of timeframeKeys) {
    const v = validation[tf];
    if (!v) continue;
    if (v.verdict === 'insufficient_data') { console.log(`${tf}: ${v.note}`); continue; }
    console.log(`${tf}: ความเร็ว ${v.trustPerPairSpeed ? 'รอด' : 'ไม่รอด'} · ผลกำไร ${v.trustPerPairProfit ? 'รอด' : 'ไม่รอด'} · คู่ที่ทดสอบได้ ${v.usablePairs} · top ${v.topN} · สับไพ่ ${v.permutations} ครั้ง`);
    for (const [name, c] of Object.entries(v.candidates)) {
      if (c.note) { console.log(`     ${name.padEnd(11)} ${c.note}`); continue; }
      console.log(
        `     ${name.padEnd(11)} ${c.holds ? 'รอด ' : 'ไม่รอด'} · test: top ${String(c.topTestScore).padStart(8)} / ทุกคู่ ${String(c.allTestScore).padStart(8)} / bottom ${String(c.bottomTestScore).padStart(8)}` +
        ` · top−bottom ${c.topMinusBottom} · p(lift)=${c.liftP} · rho=${c.spearmanTrainVsTest} p=${c.spearmanP}`
      );
      console.log(`                 avgR ในช่วง test — top ${c.topTestAvgR} vs ทุกคู่ ${c.allTestAvgR}`);
    }
    console.log(`     ${v.note}`);
  }

  const nReliable = rows.filter((r) => r.full.trades >= MIN_RELIABLE_TRADES).length;
  console.log(`\nคู่ทั้งหมด ${rows.length} · ไม้ถึง ${MIN_RELIABLE_TRADES} ${nReliable} คู่ · ไม้ไม่ถึง ${rows.length - nReliable} คู่ (ตัวเลขรายคู่ไม่มีความหมาย)`);
  if (failures.length > 0) console.log(`วัดไม่ได้ ${failures.length} คู่: ${failures.map((f) => `${f.symbol} ${f.timeframe}`).join(', ')}`);
  console.log(DRY_RUN ? '\n--dry-run — ไม่ได้เขียนไฟล์' : `\nเขียนแล้ว: ${outPath}\n         + ${evidencePath}`);
  console.log(`ใช้เวลารวม ${((Date.now() - startedAt) / 1000).toFixed(1)} วินาที · measuredAt = ${measuredAt}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
