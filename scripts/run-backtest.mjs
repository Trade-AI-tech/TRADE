#!/usr/bin/env node
/**
 * run-backtest.mjs — รัน backtest ของ src/lib/backtest.ts จาก CLI
 *
 * วิธีรัน
 *   npm run backtest
 *   node scripts/run-backtest.mjs                                   ← basket ตัวอย่างครบทุกตลาด ทั้ง 1D และ 1H
 *   node scripts/run-backtest.mjs --symbol=AAPL --market=US_STOCK --timeframe=1D
 *   node scripts/run-backtest.mjs --symbol=BTC --market=CRYPTO      ← ไม่ระบุ timeframe = รันทั้ง 1D และ 1H
 *   node scripts/run-backtest.mjs --feesR=0.05                      ← หักต้นทุนต่อไม้ 0.05R
 *   node scripts/run-backtest.mjs --maxHoldBars=15
 *
 * หลักการโหลดโค้ด: ใช้ typescript ใน node_modules ลอกชนิดออกจาก src/lib/*.ts
 * แล้ว import กลับเข้ามาเป็นโมดูลจริง (วิธีเดียวกับ scripts/check-monitor-parity.mjs)
 * เพื่อให้ backtest วัด "เครื่องคำนวณสัญญาณตัวเดียวกับที่รันจริง" ไม่ใช่สำเนาที่เขียนซ้ำ
 *
 * ข้อมูลแท่งดึงจาก Yahoo Finance v8 chart API ตรง ๆ (ไม่ต้องใช้ API key)
 * ลอกวิธีจาก src/lib/market-data.ts: 1D ใช้ range 2y / 1H ใช้ range 3mo
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ───────────────────────────────── อ่านอาร์กิวเมนต์ ─────────────────────────────────

function argValue(name) {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : null;
}

function fail(message) {
  console.error(`\n[ล้มเหลว] ${message}\n`);
  process.exit(1);
}

const argSymbol = argValue('symbol');
const argMarket = argValue('market');
const argTimeframe = argValue('timeframe');
const argFeesR = argValue('feesR') ?? argValue('fees');
const argMaxHold = argValue('maxHoldBars') ?? argValue('maxhold');

const MARKETS = ['GOLD', 'FOREX', 'TH_STOCK', 'US_STOCK', 'CRYPTO'];

const feesR = argFeesR !== null ? Number(argFeesR) : 0;
if (!Number.isFinite(feesR) || feesR < 0) fail(`--feesR ต้องเป็นตัวเลข >= 0 (ได้ "${argFeesR}")`);

const maxHoldBars = argMaxHold !== null ? Number(argMaxHold) : 10;
if (!Number.isFinite(maxHoldBars) || maxHoldBars < 1) fail(`--maxHoldBars ต้องเป็นตัวเลข >= 1 (ได้ "${argMaxHold}")`);

/** timeframe ที่รองรับ — ผูกกับ interval/range ของ Yahoo ตามที่ market-data.ts ใช้ */
const TIMEFRAMES = {
  '1D': { interval: '1d', range: '2y' },
  '1H': { interval: '1h', range: '3mo' },
};

function normalizeTimeframe(tf) {
  const up = String(tf).toUpperCase();
  return TIMEFRAMES[up] ? up : null;
}

// basket ตัวอย่าง — ครบทั้ง 5 ตลาดที่ระบบรองรับ
const DEFAULT_BASKET = [
  { symbol: 'XAUUSD', name: 'Gold Spot', market: 'GOLD' },
  { symbol: 'EURUSD', name: 'EUR/USD', market: 'FOREX' },
  { symbol: 'PTT', name: 'PTT PCL', market: 'TH_STOCK' },
  { symbol: 'AAPL', name: 'Apple Inc.', market: 'US_STOCK' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', market: 'US_STOCK' },
  { symbol: 'BTC', name: 'Bitcoin', market: 'CRYPTO' },
];

let basket;
if (argSymbol) {
  if (!argMarket) fail(`ระบุ --symbol แล้วต้องระบุ --market ด้วย (เลือกจาก ${MARKETS.join(', ')})`);
  const market = argMarket.toUpperCase();
  if (!MARKETS.includes(market)) fail(`ไม่รู้จักตลาด "${argMarket}" — เลือกจาก ${MARKETS.join(', ')}`);
  basket = [{ symbol: argSymbol.toUpperCase(), name: argSymbol.toUpperCase(), market }];
} else {
  basket = DEFAULT_BASKET;
}

let timeframes;
if (argTimeframe) {
  const tf = normalizeTimeframe(argTimeframe);
  if (!tf) fail(`ไม่รู้จัก timeframe "${argTimeframe}" — เลือกจาก ${Object.keys(TIMEFRAMES).join(', ')}`);
  timeframes = [tf];
} else {
  timeframes = Object.keys(TIMEFRAMES);
}

// ─────────────────────────── ดึงแท่งจาก Yahoo Finance ───────────────────────────

/** แปลง symbol ภายในเป็น symbol ของ Yahoo — ลอกตรรกะจาก src/lib/market-data.ts */
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

/**
 * ดึงแท่งเทียนจาก Yahoo — ลอง query1 ก่อน พังค่อยไป query2 (เหมือน market-data.ts)
 * คืน { candles, name } — candles ว่าง = โหลดไม่ได้ ให้ผู้เรียกตัดสินใจเอง ไม่เดาข้อมูลแทน
 */
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

      const name = result.meta?.longName || result.meta?.shortName || symbol;
      return { candles, name };
    } catch {
      // ลอง host ถัดไป
    }
  }
  return { candles: [], name: symbol };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────── โหลด src/lib/backtest.ts เป็นโมดูลจริง ───────────────────────

const require = createRequire(import.meta.url);
let typescript;
try {
  typescript = require('typescript');
} catch {
  fail('ไม่พบ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่');
}

/**
 * แปลง path ใน import ให้ชี้ไฟล์ .mjs ที่เราเขียนลง temp dir
 * '@/types' → './types.mjs' (stub — import type ถูกลอกออกไปแล้ว เผื่อไว้กันพลาด)
 * '@/lib/x' และ './x' → './x.mjs'
 */
function mapSpecifier(spec) {
  let s = spec;
  if (s.startsWith('@/')) s = `./${s.slice(2)}`;
  if (s.startsWith('./') || s.startsWith('../')) {
    const base = s.split('/').pop();
    return `./${base}.mjs`;
  }
  return spec; // แพ็กเกจภายนอก — ปล่อยตามเดิม (โมดูลชุดนี้ไม่มี แต่กันไว้)
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

async function loadBacktestModule(tmpDir) {
  // types เป็น type ล้วน ถูกลอกออกตอน transpile — เขียน stub ว่างกัน import ค้าง
  writeFileSync(path.join(tmpDir, 'types.mjs'), 'export {};\n', 'utf8');

  // candle-sanitizer ต้องมาก่อน signal-engine (เป็น dependency ใหม่ของด่านตรวจแท่ง)
  for (const rel of ['src/lib/candle-sanitizer.ts', 'src/lib/indicators.ts', 'src/lib/signal-engine.ts', 'src/lib/backtest.ts']) {
    const abs = path.join(ROOT, ...rel.split('/'));
    const base = path.basename(rel, '.ts');
    writeFileSync(path.join(tmpDir, `${base}.mjs`), transpile(readFileSync(abs, 'utf8'), `${base}.ts`), 'utf8');
  }

  const mod = await import(pathToFileURL(path.join(tmpDir, 'backtest.mjs')).href);
  if (typeof mod.runBacktest !== 'function') fail('โหลด src/lib/backtest.ts แล้วไม่พบ runBacktest');
  return mod;
}

// ───────────────────────────────── จัดรูปตัวเลข ─────────────────────────────────

// ค่าที่ยังไม่มีข้อมูลให้วัด แสดงเป็น '—' เสมอ ห้ามแสดงเป็น 0 (0 = วัดแล้วได้ศูนย์)
const NA = '—';
const fmtPct = (v) => (v === null ? NA : `${(v * 100).toFixed(1)}%`);
const fmtPF = (v) => (v === null ? NA : v.toFixed(2));
const fmtR = (v) => (v === null ? NA : `${v >= 0 ? '+' : ''}${v.toFixed(3)}`);
const fmtDD = (v) => (v === null ? NA : v.toFixed(2));

function printTable(headers, rows) {
  const widths = headers.map((h, c) => Math.max(h.length, ...rows.map((r) => String(r[c]).length)));
  const line = (cells) => '  ' + cells.map((cell, c) => String(cell).padStart(widths[c])).join('  ');
  console.log(line(headers));
  console.log('  ' + widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));
}

// ───────────────────────────────────── main ─────────────────────────────────────

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'backtest-'));
  let backtestMod;
  try {
    backtestMod = await loadBacktestModule(tmpDir);
  } finally {
    // import สำเร็จแล้วโมดูลอยู่ในหน่วยความจำ ลบไฟล์ชั่วคราวได้เลย
    rmSync(tmpDir, { recursive: true, force: true });
  }
  const { runBacktest } = backtestMod;

  console.log('Backtest — วัดผลจริงของเครื่องคำนวณสัญญาณ (generateSignal ตัวที่รันจริง)');
  console.log(`พารามิเตอร์: maxHoldBars=${maxHoldBars}, feesR=${feesR}`);
  if (feesR === 0) {
    console.log('คำเตือน: feesR = 0 — ตัวเลขทั้งหมดยังไม่รวมค่าธรรมเนียม/สเปรด/สลิปเพจจริง');
  }
  console.log('');

  const results = [];
  const failures = [];

  for (const item of basket) {
    for (const tf of timeframes) {
      const { interval, range } = TIMEFRAMES[tf];
      process.stdout.write(`ดึงข้อมูล ${item.symbol} (${item.market}) ${tf} [${interval}/${range}] ... `);
      const { candles, name } = await fetchCandles(item.symbol, item.market, interval, range);

      if (candles.length < 70) {
        console.log(`ได้ ${candles.length} แท่ง — ไม่พอทดสอบ (ต้องเกิน minHistory 60 พอสมควร) ข้าม`);
        failures.push({ symbol: item.symbol, timeframe: tf, bars: candles.length });
        await sleep(400);
        continue;
      }

      console.log(`ได้ ${candles.length} แท่ง`);
      const result = runBacktest({
        symbol: item.symbol,
        name: item.name || name,
        market: item.market,
        timeframe: tf,
        candles,
        maxHoldBars,
        feesR,
      });
      results.push(result);
      await sleep(400); // เว้นจังหวะกัน Yahoo throttle
    }
  }

  if (results.length === 0) {
    fail('ไม่มีชุดข้อมูลที่ทดสอบได้เลย — ตรวจการเชื่อมต่อเครือข่าย หรือ symbol/market ที่ระบุ');
  }

  console.log('');
  console.log('ผลต่อ symbol × timeframe');
  const headers = ['SYMBOL', 'TF', 'BARS', 'TRADES', 'SKIP', 'BUY', 'SELL', 'WIN%', 'PF', 'AVG R', 'EXP R', 'MAXDD(R)', 'LOSS-STREAK'];
  const rows = results.map((r) => [
    r.symbol,
    r.timeframe,
    r.bars,
    r.stats.count,
    r.skipped,
    r.stats.byAction.BUY.count,
    r.stats.byAction.SELL.count,
    fmtPct(r.stats.winRate),
    fmtPF(r.stats.profitFactor),
    fmtR(r.stats.avgR),
    fmtR(r.stats.expectancyR),
    fmtDD(r.stats.maxDrawdownR),
    r.stats.maxConsecutiveLosses,
  ]);
  printTable(headers, rows);

  // ── รวมทุกตัว ──────────────────────────────────────────────────────────────
  // รวมจากไม้จริงทุกไม้ (ไม่ใช่เฉลี่ยของเฉลี่ย ซึ่งจะเพี้ยนเมื่อจำนวนไม้ไม่เท่ากัน)
  const allTrades = results.flatMap((r) => r.trades);
  const count = allTrades.length;
  const wins = allTrades.filter((t) => t.r > 0).length;
  const grossWinR = allTrades.filter((t) => t.r > 0).reduce((s, t) => s + t.r, 0);
  const grossLossR = allTrades.filter((t) => t.r < 0).reduce((s, t) => s - t.r, 0);
  const sumR = allTrades.reduce((s, t) => s + t.r, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);

  console.log('');
  console.log('รวมทุกตัว');
  printTable(
    ['TRADES', 'SKIP', 'WIN%', 'PF', 'AVG R', 'GROSS WIN R', 'GROSS LOSS R', 'MAXDD(R)'],
    [[
      count,
      totalSkipped,
      fmtPct(count > 0 ? wins / count : null),
      fmtPF(count > 0 && grossLossR > 0 ? grossWinR / grossLossR : null),
      fmtR(count > 0 ? sumR / count : null),
      grossWinR.toFixed(2),
      grossLossR.toFixed(2),
      NA, // drawdown รวมข้ามสินทรัพย์/timeframe เรียงเวลาเดียวกันไม่ได้ จึงไม่มีค่าที่ซื่อตรงให้แสดง
    ]]
  );

  if (failures.length > 0) {
    console.log('');
    console.log('ชุดที่ข้ามเพราะข้อมูลไม่พอ/โหลดไม่ได้:');
    for (const f of failures) console.log(`  - ${f.symbol} ${f.timeframe} (ได้ ${f.bars} แท่ง)`);
  }

  console.log('');
  console.log('คำอธิบายคอลัมน์: TRADES=จำนวนไม้ · SKIP=สัญญาณที่เข้าไม้ไม่ได้ (ระยะ SL เป็นศูนย์/แท่งเสีย)');
  console.log('WIN%=สัดส่วนไม้ที่ R>0 · PF=grossWinR/grossLossR (— = ไม่มีไม้แพ้หรือไม่มีไม้) · AVG R=R เฉลี่ยต่อไม้');
  console.log('MAXDD(R)=drawdown ลึกสุดของ equity สะสมเป็น R · LOSS-STREAK=แพ้ติดกันมากสุด · — = ไม่มีข้อมูลให้วัด');
  console.log('');
  console.log('ข้อจำกัด: ทดสอบบนแท่ง OHLC จึงไม่เห็นลำดับราคาในแท่ง (ชนทั้ง SL/TP ในแท่งเดียวนับ SL ก่อน)');
  if (feesR === 0) console.log('และตัวเลขนี้ยังไม่รวมค่าธรรมเนียม/สเปรด/สลิปเพจ (feesR=0) — ของจริงจะแย่กว่านี้');
  console.log('ผลในอดีตไม่การันตีอนาคต — นี่คือการวัดกติกากับข้อมูลย้อนหลัง ไม่ใช่คำพยากรณ์');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
