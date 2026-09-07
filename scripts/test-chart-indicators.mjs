#!/usr/bin/env node
/**
 * test-chart-indicators.mjs — เทสต์เส้นอินดิเคเตอร์บนหน้ากราฟ (npm run test:chart-indicators)
 *
 * วิธีรัน
 *   node scripts/test-chart-indicators.mjs
 *
 * ไม่ต้องใช้เน็ต ไม่ต้องมี DB — โหลด .ts ตัวจริงมาโดยลอกชนิดออก (วิธีเดียวกับ
 * scripts/test-chart-api.mjs) แล้วเรียกฟังก์ชันจริงทั้งหมด
 *
 * ═══ ทำไมเลนนี้ต้องมีเทสต์ ════════════════════════════════════════════════════
 * เส้นที่วาดผิดคาบดู "เหมือนเส้นที่ถูก" ทุกประการ ไม่มี error ให้ใครเห็น มีแต่เส้นที่
 * ไม่ตรงกับตัวเลขที่บันทึกไว้กับสัญญาณ ซึ่งอ่านออกมาได้ว่า "ระบบไม่ตรงกัน" —
 * เป็นอาการเดียวกับที่เจ้าของเคยรายงานมาแล้วสองรอบ เทสต์นี้จึงตรวจสองเรื่องหลัก:
 *   1. ค่าที่ chart-indicators คำนวณ ต้องเท่ากับที่ src/lib/indicators.ts ให้ **เป๊ะ**
 *      (ไม่ใช่ใกล้เคียง — ถ้าไม่เท่ากันทุกหลัก แปลว่ามีคนลอกสูตรมาเขียนใหม่)
 *   2. คาบทุกตัวต้องตรงกับที่ src/lib/signal-engine.ts เรียกจริง โดย **อ่านจากซอร์ส
 *      ของเครื่องยนต์** ไม่ใช่จากตัวเลขที่เทสต์พิมพ์เอง — วันไหนฝั่งใดฝั่งหนึ่งเปลี่ยน
 *      เทสต์นี้ต้องแดง
 * ทุกด่านสำคัญมี negative control ที่พิสูจน์ว่าด่านนั้นจับของผิดได้จริง
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);

// ───────────────────────────── โครงเทสต์เล็ก ๆ ของตัวเอง ─────────────────────────────

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  FAIL ${name}\n         ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n         คาดหวัง: ${JSON.stringify(expected)}\n         ได้จริง: ${JSON.stringify(actual)}`);
  }
}

// ──────────────────── โหลดโค้ดจริงจาก .ts (ลอกชนิดออกแล้ว import กลับ) ────────────────────

let typescript;
try {
  typescript = require_('typescript');
} catch {
  console.error('\n[ล้มเหลว] ไม่พบ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่\n');
  process.exit(1);
}

function loadModules(entries) {
  const cacheRoot = path.join(ROOT, 'node_modules', '.cache');
  mkdirSync(cacheRoot, { recursive: true });
  const tmpDir = mkdtempSync(path.join(cacheRoot, 'chart-ind-test-'));

  const names = new Map();
  const nameOf = (abs) => {
    if (names.has(abs)) return names.get(abs);
    const base = path.basename(abs).replace(/\.(tsx?|json)$/, '').replace(/[^\w-]/g, '_');
    const name = `m${names.size}_${base}${abs.endsWith('.json') ? '.json' : '.mjs'}`;
    names.set(abs, name);
    return name;
  };

  const resolve = (spec, from) => {
    let base;
    if (spec.startsWith('@/')) base = path.join(ROOT, 'src', spec.slice(2));
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
    else return null;
    if (spec.endsWith('.json')) return existsSync(base) ? base : null;
    for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return null;
  };

  const SPEC = /((?:^|[\s;{}])(?:from|import)\s*\(?\s*)(['"])([^'"]+)\2/g;
  const done = new Set();
  const queue = [...entries];

  while (queue.length) {
    const abs = queue.shift();
    if (done.has(abs)) continue;
    done.add(abs);

    if (abs.endsWith('.json')) {
      writeFileSync(path.join(tmpDir, nameOf(abs)), readFileSync(abs));
      continue;
    }

    const js = typescript.transpileModule(readFileSync(abs, 'utf8'), {
      fileName: path.basename(abs),
      compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext },
    }).outputText;

    const rewritten = js.replace(SPEC, (whole, head, q, spec) => {
      const dep = resolve(spec, abs);
      if (!dep) return whole;
      if (!done.has(dep)) queue.push(dep);
      const attr = dep.endsWith('.json') && !head.includes('(') ? " with { type: 'json' }" : '';
      return `${head}${q}./${nameOf(dep)}${q}${attr}`;
    });

    writeFileSync(path.join(tmpDir, nameOf(abs)), rewritten, 'utf8');
  }

  return { fileFor: (abs) => pathToFileURL(path.join(tmpDir, nameOf(abs))).href };
}

const SRC = {
  chartIndicators: path.join(ROOT, 'src', 'lib', 'chart-indicators.ts'),
  indicators: path.join(ROOT, 'src', 'lib', 'indicators.ts'),
  prefs: path.join(ROOT, 'src', 'lib', 'chart-indicator-prefs.ts'),
  snapshot: path.join(ROOT, 'src', 'lib', 'signal-snapshot.ts'),
};

const loaded = loadModules(Object.values(SRC));
const chartInd = await import(loaded.fileFor(SRC.chartIndicators));
const ind = await import(loaded.fileFor(SRC.indicators));
const prefsMod = await import(loaded.fileFor(SRC.prefs));
const snapMod = await import(loaded.fileFor(SRC.snapshot));

const { computeChartIndicators, CHART_INDICATOR_PERIODS, RSI_LEVELS } = chartInd;
const P = CHART_INDICATOR_PERIODS;

// ─────────────────────────── ชุดแท่งทดสอบ (คงที่ทุกครั้ง) ───────────────────────────
//
// ใช้สูตรกำหนดเองแทนเลขสุ่ม เพื่อให้รันกี่ครั้งก็ได้ผลเดิม — เทสต์ที่ผลเปลี่ยนไปมา
// คือเทสต์ที่ไม่มีใครเชื่อเวลามันแดง · มีทั้งช่วงขึ้น ลง และแกว่ง เพื่อให้ RSI/MACD
// มีทั้งค่าสูงและต่ำ และให้ findSupportResistance หา swing เจอจริง

const BAR_SEC = 900;

function makeBars(n, { start = 3500 } = {}) {
  const bars = [];
  let level = start;
  const t0 = 1_756_000_000 - (1_756_000_000 % BAR_SEC);
  for (let i = 0; i < n; i++) {
    // คลื่นสองความถี่ + แนวโน้มช้า ๆ = มี swing high/low จริงและไม่เป็นคาบซ้ำเป๊ะ
    const wave = Math.sin(i / 7) * 8 + Math.sin(i / 23) * 14 + i * 0.05;
    const c = start + wave;
    const o = level;
    const h = Math.max(o, c) + 1.5 + (i % 3);
    const l = Math.min(o, c) - 1.5 - (i % 5) * 0.5;
    bars.push({
      t: t0 + i * BAR_SEC,
      o: Number(o.toFixed(4)),
      h: Number(h.toFixed(4)),
      l: Number(l.toFixed(4)),
      c: Number(c.toFixed(4)),
    });
    level = c;
  }
  return bars;
}

/** ChartBar → CandleData เท่าที่ indicators.ts ต้องใช้ (สำเนาฝั่งเทสต์ ตั้งใจให้ตรงไปตรงมา) */
const toCandles = (bars) =>
  bars.map((b) => ({
    timestamp: new Date(b.t * 1000).toISOString(),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: 0,
  }));

/**
 * เทียบ "จุดบนเส้น" กับ "อาร์เรย์ดิบจาก indicators.ts" แบบตรงตัวทุกหลัก
 * กติกา: จุดต้องมีเฉพาะตำแหน่งที่ค่า finite และค่าต้อง === กันเป๊ะ (ไม่ใช่ใกล้เคียง)
 * เพราะทั้งสองฝั่งต้องเป็นผลของ **ฟังก์ชันตัวเดียวกัน** ถ้าต่างแม้แต่หลักสุดท้าย
 * แปลว่ามีใครลอกสูตรไปเขียนใหม่ ซึ่งเป็นสิ่งที่ห้ามทำ
 */
function assertSeriesMatches(points, values, times, label) {
  const expected = [];
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) expected.push({ time: times[i], value: values[i] });
  }
  assertEqual(points.length, expected.length, `${label}: จำนวนจุดไม่ตรง`);
  for (let i = 0; i < expected.length; i++) {
    assertEqual(points[i].time, expected[i].time, `${label}: เวลาของจุดที่ ${i} ไม่ตรง`);
    if (points[i].value !== expected[i].value) {
      throw new Error(
        `${label}: ค่าที่จุดที่ ${i} ไม่ตรงเป๊ะ\n         คาดหวัง: ${expected[i].value}\n         ได้จริง: ${points[i].value}`
      );
    }
  }
  assert(expected.length > 0, `${label}: ชุดทดสอบไม่ได้ผลิตค่าที่ใช้ได้เลย — เทสต์นี้ไม่มีฟัน`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ค่าที่คำนวณ ต้องเท่ากับ src/lib/indicators.ts เป๊ะทุกหลัก
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n1. ค่าที่ chart-indicators คำนวณ = ค่าที่ indicators.ts ให้ (เทียบตรง ๆ)\n');

const bars = makeBars(320);
const times = bars.map((b) => b.t);
const closes = bars.map((b) => b.c);
const data = computeChartIndicators(bars);

await check('EMA 20 (คีย์ ma20) ตรงกับ EMA() ตัวจริง', () => {
  assertSeriesMatches(data.ma20, ind.EMA(closes, P.ma20), times, 'ma20');
});

await check('ma20 เป็น EMA ไม่ใช่ SMA (ถ้าสลับเมื่อไหร่ต้องจับได้)', () => {
  const sma = ind.SMA(closes, P.ma20);
  const last = data.ma20[data.ma20.length - 1].value;
  const smaLast = sma[sma.length - 1];
  assert(
    last !== smaLast,
    'ค่า EMA20 กับ SMA20 ออกมาเท่ากัน — ชุดทดสอบแยกสองสูตรนี้ไม่ออก เทสต์นี้จึงไม่มีฟัน'
  );
});

await check('SMA 50 ตรงกับ SMA() ตัวจริง', () => {
  assertSeriesMatches(data.ma50, ind.SMA(closes, P.ma50), times, 'ma50');
});

await check('SMA 200 ตรงกับ SMA() ตัวจริง (ชุดนี้มีแท่งครบ 200)', () => {
  assert(data.hasMA200, 'ชุดทดสอบ 320 แท่งต้องคำนวณ MA200 ได้');
  assertSeriesMatches(data.ma200, ind.SMA(closes, P.ma200), times, 'ma200');
});

await check('Bollinger Bands (บน/กลาง/ล่าง) ตรงกับ BollingerBands() ตัวจริง', () => {
  const bb = ind.BollingerBands(closes, P.bbPeriod, P.bbStdDev);
  assertSeriesMatches(data.bbUpper, bb.upper, times, 'bbUpper');
  assertSeriesMatches(data.bbMiddle, bb.middle, times, 'bbMiddle');
  assertSeriesMatches(data.bbLower, bb.lower, times, 'bbLower');
});

await check('RSI ตรงกับ RSI() ตัวจริง', () => {
  assertSeriesMatches(data.rsi, ind.RSI(closes, P.rsi), times, 'rsi');
});

await check('MACD (เส้น / signal / ฮิสโตแกรม) ตรงกับ MACD() ตัวจริง', () => {
  const m = ind.MACD(closes, P.macdFast, P.macdSlow, P.macdSignal);
  assertSeriesMatches(data.macdLine, m.macdLine, times, 'macdLine');
  assertSeriesMatches(data.macdSignal, m.signalLine, times, 'macdSignal');
  assertSeriesMatches(
    data.macdHistogram.map((h) => ({ time: h.time, value: h.value })),
    m.histogram,
    times,
    'macdHistogram'
  );
});

await check('ป้ายบวก/ลบของฮิสโตแกรมตรงกับเครื่องหมายของค่าจริง', () => {
  for (const h of data.macdHistogram) {
    assertEqual(h.positive, h.value >= 0, `ฮิสโตแกรมที่ t=${h.time} ติดป้ายบวก/ลบผิด`);
  }
});

await check('แนวรับ/แนวต้าน ตรงกับ findSupportResistance() ตัวจริง', () => {
  const sr = ind.findSupportResistance(toCandles(bars), P.srLookback);
  assertEqual(JSON.stringify(data.supports), JSON.stringify(sr.supports), 'supports ไม่ตรง');
  assertEqual(JSON.stringify(data.resistances), JSON.stringify(sr.resistances), 'resistances ไม่ตรง');
  assert(sr.supports.length + sr.resistances.length > 0, 'ชุดทดสอบไม่มี swing ให้หาเจอเลย — เทสต์นี้ไม่มีฟัน');
});

await check('negative control: เทียบกับคาบผิดต้องแดง (ด่านข้างบนมีฟันจริง)', () => {
  let threw = false;
  try {
    assertSeriesMatches(data.ma50, ind.SMA(closes, P.ma50 + 1), times, 'ma50-ผิดคาบ');
  } catch {
    threw = true;
  }
  assert(threw, 'เทียบ SMA50 กับ SMA51 แล้วยังผ่าน — ตัวเทียบไม่ได้เทียบอะไรเลย');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. คาบต้องตรงกับที่เครื่องยนต์เรียกจริง (อ่านจากซอร์สของเครื่องยนต์)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n2. คาบทุกตัวต้องตรงกับ src/lib/signal-engine.ts ตัวจริง\n');

const ENGINE_SRC = readFileSync(path.join(ROOT, 'src', 'lib', 'signal-engine.ts'), 'utf8');
const INDICATORS_SRC = readFileSync(SRC.indicators, 'utf8');

/**
 * ดึงคาบที่เครื่องยนต์ใช้จริงออกมาจากซอร์ส
 *
 * ตัวไหนที่เครื่องยนต์เรียกโดยไม่ส่งพารามิเตอร์ (MACD, findSupportResistance)
 * ต้องไปอ่าน "ค่า default ของฟังก์ชันนั้น" จาก indicators.ts แทน เพราะนั่นคือคาบที่
 * ถูกใช้จริง — และถ้าวันไหนมีคนเปลี่ยน default เทสต์นี้จะจับได้เหมือนกัน
 */
function enginePeriods(engineSrc, indicatorsSrc) {
  const one = (re, what, src = engineSrc) => {
    const m = src.match(re);
    if (!m) throw new Error(`หาไม่เจอในซอร์ส: ${what} (รูปแบบ ${re})`);
    return Number(m[1]);
  };

  const smaCalls = [...engineSrc.matchAll(/\bSMA\(closes,\s*(\d+)\)/g)].map((m) => Number(m[1]));
  if (smaCalls.length < 2) throw new Error(`เครื่องยนต์เรียก SMA(closes, N) แค่ ${smaCalls.length} ครั้ง — คาดว่ามีสองคาบ (50/200)`);

  // MACD ถูกเรียกแบบไม่ส่งพารามิเตอร์ → คาบมาจาก default ของ indicators.ts
  const macdCalledBare = /\bMACD\(closes\)/.test(engineSrc);
  if (!macdCalledBare) {
    throw new Error('เครื่องยนต์ไม่ได้เรียก MACD(closes) แบบไม่ส่งพารามิเตอร์แล้ว — ต้องมาอ่านคาบจากที่เรียกจริงแทน');
  }
  const macdSig = indicatorsSrc.match(
    /export function MACD\(values: number\[\],\s*fast = (\d+),\s*slow = (\d+),\s*signal = (\d+)\)/
  );
  if (!macdSig) throw new Error('อ่านค่า default ของ MACD จาก indicators.ts ไม่ได้');

  // findSupportResistance ก็เรียกแบบไม่ส่ง lookback เช่นกัน
  const srCalledBare = /findSupportResistance\(candles\)/.test(engineSrc);
  if (!srCalledBare) {
    throw new Error('เครื่องยนต์ไม่ได้เรียก findSupportResistance(candles) แบบไม่ส่ง lookback แล้ว');
  }
  const srDefault = one(
    /export function findSupportResistance\(candles: CandleData\[\], lookback = (\d+)\)/,
    'ค่า default ของ findSupportResistance',
    indicatorsSrc
  );

  const bb = engineSrc.match(/BollingerBands\(closes,\s*(\d+),\s*(\d+)\)/);
  if (!bb) throw new Error('หาไม่เจอ: BollingerBands(closes, N, K) ในเครื่องยนต์');

  return {
    rsi: one(/\bRSI\(closes,\s*(\d+)\)/, 'RSI(closes, N)'),
    macdFast: Number(macdSig[1]),
    macdSlow: Number(macdSig[2]),
    macdSignal: Number(macdSig[3]),
    ma20: one(/\bEMA\(closes,\s*(\d+)\)/, 'EMA(closes, N)'),
    ma50: Math.min(...smaCalls),
    ma200: Math.max(...smaCalls),
    bbPeriod: Number(bb[1]),
    bbStdDev: Number(bb[2]),
    srLookback: srDefault,
  };
}

const enginePeriodsNow = enginePeriods(ENGINE_SRC, INDICATORS_SRC);

await check('คาบทุกตัวใน CHART_INDICATOR_PERIODS ตรงกับที่เครื่องยนต์เรียกจริง', () => {
  for (const key of Object.keys(enginePeriodsNow)) {
    assertEqual(
      P[key],
      enginePeriodsNow[key],
      `คาบ "${key}" ไม่ตรงกัน — กราฟใช้ ${P[key]} แต่เครื่องยนต์ใช้ ${enginePeriodsNow[key]}`
    );
  }
});

await check('ไม่มีคาบตัวไหนใน CHART_INDICATOR_PERIODS ที่ไม่มีใครยืนยัน', () => {
  const unchecked = Object.keys(P).filter((k) => !(k in enginePeriodsNow));
  assertEqual(
    unchecked.length,
    0,
    `คีย์ที่ประกาศไว้แต่ไม่ได้เทียบกับเครื่องยนต์: ${unchecked.join(', ')} — เพิ่มการอ่านจากซอร์สให้ครบ`
  );
});

await check('negative control: เครื่องยนต์เปลี่ยนคาบเมื่อไหร่ ด่านนี้ต้องแดง', () => {
  const mutated = ENGINE_SRC.replace(/\bRSI\(closes, 14\)/, 'RSI(closes, 21)');
  assert(mutated !== ENGINE_SRC, 'แก้ซอร์สจำลองไม่สำเร็จ — รูปแบบการเรียก RSI เปลี่ยนไปแล้ว');
  const got = enginePeriods(mutated, INDICATORS_SRC);
  assert(got.rsi !== P.rsi, 'เปลี่ยนคาบ RSI ในซอร์สจำลองแล้ว แต่ตัวอ่านยังได้ค่าเดิม');
});

await check('negative control: default ของ MACD ใน indicators.ts เปลี่ยนแล้วต้องจับได้', () => {
  const mutated = INDICATORS_SRC.replace('fast = 12', 'fast = 8');
  assert(mutated !== INDICATORS_SRC, 'แก้ซอร์สจำลองไม่สำเร็จ — ลายเซ็นของ MACD เปลี่ยนไปแล้ว');
  const got = enginePeriods(ENGINE_SRC, mutated);
  assert(got.macdFast !== P.macdFast, 'เปลี่ยน default ของ MACD แล้ว แต่ตัวอ่านยังได้ค่าเดิม');
});

await check('เงื่อนไข MA200 ของกราฟ = เงื่อนไขของเครื่องยนต์ (ครบ 200 แท่งเท่านั้น)', () => {
  assert(
    new RegExp(`closes\\.length >= ${P.ma200}`).test(ENGINE_SRC),
    `เครื่องยนต์ไม่ได้ใช้เงื่อนไข closes.length >= ${P.ma200} แล้ว — กราฟกับเครื่องยนต์จะคำนวณ MA200 คนละเวลา`
  );
  const short = computeChartIndicators(makeBars(P.ma200 - 1));
  assertEqual(short.hasMA200, false, `แท่ง ${P.ma200 - 1} แท่งต้องยังไม่คำนวณ MA200`);
  assertEqual(short.ma200.length, 0, 'ไม่ครบ 200 แท่ง = ต้องไม่มีจุดบนเส้น MA200 เลย');
  const exact = computeChartIndicators(makeBars(P.ma200));
  assertEqual(exact.hasMA200, true, `แท่งครบ ${P.ma200} แท่งต้องคำนวณ MA200 ได้`);
  assertEqual(exact.ma200.length, 1, 'ครบพอดี 200 แท่ง = มีจุดเดียวคือแท่งสุดท้าย');
});

await check('เกณฑ์เส้น RSI (30/50/70) ยังเป็นเกณฑ์ที่เครื่องยนต์ให้คะแนนจริง', () => {
  assert(
    new RegExp(`rsiNow < ${RSI_LEVELS.oversold}`).test(ENGINE_SRC),
    `เครื่องยนต์ไม่ได้ใช้เกณฑ์ oversold ที่ ${RSI_LEVELS.oversold} แล้ว`
  );
  assert(
    new RegExp(`rsiNow > ${RSI_LEVELS.overbought}`).test(ENGINE_SRC),
    `เครื่องยนต์ไม่ได้ใช้เกณฑ์ overbought ที่ ${RSI_LEVELS.overbought} แล้ว`
  );
  assert(
    new RegExp(`rsiNow > ${RSI_LEVELS.middle} && rsiPrev < ${RSI_LEVELS.middle}`).test(ENGINE_SRC),
    `เครื่องยนต์ไม่ได้วัดการตัดผ่านที่ ${RSI_LEVELS.middle} แล้ว`
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. แท่งที่ยังก่อตัวต้องไม่ทำให้เส้นเพี้ยน
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n3. แท่งที่ยังก่อตัวต้องอยู่นอกการคำนวณ\n');

await check('ทุกจุดบนทุกเส้น อยู่บนเวลาของแท่งที่ป้อนเข้าไปเท่านั้น', () => {
  const known = new Set(times);
  const lines = ['ma20', 'ma50', 'ma200', 'bbUpper', 'bbMiddle', 'bbLower', 'rsi', 'macdLine', 'macdSignal'];
  for (const key of lines) {
    for (const pt of data[key]) {
      assert(known.has(pt.time), `เส้น ${key} มีจุดที่เวลา ${pt.time} ซึ่งไม่ใช่เวลาของแท่งไหนเลย`);
    }
  }
  for (const h of data.macdHistogram) {
    assert(known.has(h.time), `ฮิสโตแกรมมีจุดที่เวลา ${h.time} ซึ่งไม่ใช่เวลาของแท่งไหนเลย`);
  }
});

await check('เส้นจบที่แท่งสุดท้ายที่ป้อนเข้าไป ไม่เลยไปข้างหน้า', () => {
  const lastBar = times[times.length - 1];
  for (const key of ['ma20', 'ma50', 'rsi', 'macdLine']) {
    const last = data[key][data[key].length - 1];
    assert(last.time <= lastBar, `เส้น ${key} มีจุดเลยแท่งสุดท้ายไป (${last.time} > ${lastBar})`);
  }
});

await check('แท่งสดที่ต่อเข้ามาเปลี่ยนค่าปลายเส้นจริง — จึงต้องกันมันออกไป', () => {
  // ตั้งใจให้แท่งสดราคาวิ่งแรง เพื่อพิสูจน์ว่า "ถ้าเผลอเอาแท่งสดมาคิด ค่าจะต่างจริง"
  const live = { t: times[times.length - 1] + BAR_SEC, o: closes[closes.length - 1], h: 3999, l: 3400, c: 3990 };
  const withLive = computeChartIndicators([...bars, live]);
  assertEqual(withLive.ma20.length, data.ma20.length + 1, 'ต่อแท่งเข้าไปหนึ่งใบต้องได้จุดเพิ่มหนึ่งจุด');
  const a = data.ma20[data.ma20.length - 1].value;
  const b = withLive.ma20[withLive.ma20.length - 1].value;
  assert(a !== b, 'ค่าปลายเส้นไม่เปลี่ยนเลยเมื่อต่อแท่งราคาวิ่งแรงเข้าไป — เทสต์นี้ไม่มีฟัน');
  // จุดที่มีอยู่เดิมต้องไม่ขยับแม้แต่จุดเดียว (สูตรทุกตัวเป็น causal)
  for (let i = 0; i < data.ma20.length; i++) {
    assertEqual(withLive.ma20[i].value, data.ma20[i].value, `การต่อแท่งใหม่ไปเปลี่ยนค่าย้อนหลังที่จุด ${i}`);
  }
});

await check('หน้ากราฟป้อนเฉพาะแท่งปิด (shown.bars) ให้ตัวคำนวณ ไม่ต่อแท่งสด', () => {
  const page = readFileSync(path.join(ROOT, 'src', 'app', 'chart', 'page.tsx'), 'utf8');
  const call = page.match(/computeChartIndicators\(([^)]*)\)/);
  assert(call, 'หน้ากราฟไม่ได้เรียก computeChartIndicators เลย');
  const arg = call[1].trim();
  assert(
    !/forming/.test(arg),
    `หน้ากราฟส่ง "${arg}" เข้าตัวคำนวณ ซึ่งมีแท่งที่ยังก่อตัวปนอยู่ — เส้นจะกระดิกเองทุกรอบ poll`
  );
  assert(
    /const bars = shown\?\.bars/.test(page),
    'หน้ากราฟไม่ได้ดึงชุดแท่งจาก shown.bars — ตรวจไม่ได้ว่าที่ส่งเข้าตัวคำนวณคือแท่งปิดล้วน'
  );
});

await check('ชุดแท่งว่างเปล่าต้องไม่พัง', () => {
  const empty = computeChartIndicators([]);
  assertEqual(empty.closedBars, 0, 'closedBars ต้องเป็น 0');
  assertEqual(empty.ma20.length, 0, 'ต้องไม่มีจุดเลย');
  assertEqual(empty.hasMA200, false, 'ต้องไม่อ้างว่ามี MA200');
  assertEqual(empty.supports.length, 0, 'ต้องไม่มีระดับแนวรับ');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ห้ามลอกสูตรมาเขียนใหม่ในไฟล์ของหน้ากราฟ
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n4. ไฟล์ของหน้ากราฟต้องไม่มีสูตรของตัวเอง\n');

const CHART_IND_SRC = readFileSync(SRC.chartIndicators, 'utf8');

await check('chart-indicators.ts import ฟังก์ชันจาก indicators.ts ตัวจริง', () => {
  const m = CHART_IND_SRC.match(/import \{([^}]+)\} from '\.\/indicators'/);
  assert(m, 'ไม่ได้ import อะไรจาก ./indicators เลย — แปลว่ามันคำนวณเองอยู่');
  const names = m[1].split(',').map((s) => s.trim());
  for (const need of ['SMA', 'EMA', 'RSI', 'MACD', 'BollingerBands', 'findSupportResistance']) {
    assert(names.includes(need), `ไม่ได้ import ${need} จาก indicators.ts`);
  }
});

await check('chart-indicators.ts ไม่ได้ประกาศสูตรของตัวเองซ้ำ', () => {
  for (const name of ['SMA', 'EMA', 'RSI', 'MACD', 'BollingerBands', 'ATR', 'findSupportResistance']) {
    assert(
      !new RegExp(`function ${name}\\s*\\(`).test(CHART_IND_SRC),
      `ไฟล์นี้ประกาศ function ${name}() ของตัวเอง — สำเนาที่สองจะเพี้ยนจากต้นฉบับวันไหนก็ได้`
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ค่าที่บันทึกไว้กับสัญญาณ — ใบที่คีย์ไม่ครบต้องไม่พัง
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n5. กล่อง "ค่าที่เครื่องยนต์เห็นตอนออกใบนี้"\n');

const { readSignalSnapshot, readSignalReasons, snapshotIsEmpty } = snapMod;

/** คีย์ที่เครื่องยนต์บันทึกจริง อ่านจากซอร์สของมันเอง ไม่ใช่จากที่เทสต์พิมพ์ */
const ENGINE_PUT_KEYS = [...ENGINE_SRC.matchAll(/put\('([a-z0-9_]+)'/g)].map((m) => m[1]);

await check('ตารางแสดงครบทุกคีย์ที่เครื่องยนต์บันทึกจริง (อ่านจากซอร์สเครื่องยนต์)', () => {
  assert(ENGINE_PUT_KEYS.length > 0, 'อ่านคีย์ put() จากซอร์สเครื่องยนต์ไม่ได้เลย');
  const shown = readSignalSnapshot({}).map((r) => r.key);
  for (const k of ENGINE_PUT_KEYS) {
    assert(shown.includes(k), `เครื่องยนต์บันทึกคีย์ "${k}" แต่ตารางไม่แสดง — ผู้ใช้จะตรวจไม่ครบ`);
  }
  for (const k of shown) {
    assert(ENGINE_PUT_KEYS.includes(k), `ตารางแสดงคีย์ "${k}" ที่เครื่องยนต์ไม่เคยบันทึก`);
  }
});

await check('ทศนิยมที่แสดงตรงกับที่เครื่องยนต์บันทึกลง DB', () => {
  // put('rsi', …, 2) ระบุ 2 ตรง ๆ · ที่เหลือใช้ค่า default d = 4 ของ put()
  const dflt = ENGINE_SRC.match(/const put = \(k: string, v: number, d = (\d+)\)/);
  assert(dflt, 'อ่านค่า default ของ put() จากซอร์สเครื่องยนต์ไม่ได้');
  const rsiDec = ENGINE_SRC.match(/put\('rsi', rsiNow, (\d+)\)/);
  assert(rsiDec, "อ่านทศนิยมของ put('rsi', …) ไม่ได้");
  const rows = readSignalSnapshot({ rsi: 1, macd: 1, macd_signal: 1, ma20: 1, ma50: 1, ma200: 1, atr: 1 });
  const decimalsOf = (text) => (text.split('.')[1] ?? '').length;
  for (const r of rows) {
    const want = r.key === 'rsi' ? Number(rsiDec[1]) : Number(dflt[1]);
    assertEqual(decimalsOf(r.text), want, `คีย์ ${r.key} แสดงทศนิยมไม่ตรงกับที่บันทึกลง DB`);
  }
});

await check('ใบที่ไม่มีคีย์ครบ → ไม่พัง และบอกว่าไม่มีข้อมูล', () => {
  const rows = readSignalSnapshot({ rsi: 55.5, macd: 1.2345 });
  assertEqual(rows.length, ENGINE_PUT_KEYS.length, 'ต้องคืนแถวครบทุกคีย์เสมอ');
  const ma200 = rows.find((r) => r.key === 'ma200');
  assertEqual(ma200.value, null, 'คีย์ที่ไม่มีต้องได้ค่า null');
  assertEqual(ma200.text, '—', 'คีย์ที่ไม่มีต้องแสดงขีด ไม่ใช่ NaN หรือ 0');
  assert(
    ma200.missingNote && ma200.missingNote.includes('200'),
    'ma200 ที่หายไปต้องอธิบายเหตุผล (แท่งไม่ถึง 200) ไม่ใช่ปล่อยว่าง'
  );
  assertEqual(rows.find((r) => r.key === 'rsi').text, '55.50', 'ค่าที่มีต้องแสดงตามทศนิยมที่บันทึกไว้');
});

await check('indicators ที่เป็นค่าแปลก ๆ ต้องไม่โยน', () => {
  for (const bad of [null, undefined, [], 'ข้อความ', 42, { rsi: null }, { rsi: 'abc' }, { rsi: NaN }]) {
    const rows = readSignalSnapshot(bad);
    assertEqual(rows.length, ENGINE_PUT_KEYS.length, `อินพุต ${JSON.stringify(bad)} ทำให้จำนวนแถวเพี้ยน`);
    assert(snapshotIsEmpty(rows), `อินพุต ${JSON.stringify(bad)} ควรได้ตารางที่ไม่มีค่าเลย`);
  }
});

await check('ตัวเลขที่มาเป็นสตริง (ไดรเวอร์บางตัวคืนแบบนั้น) ยังอ่านได้', () => {
  const rows = readSignalSnapshot({ rsi: '48.25' });
  assertEqual(rows.find((r) => r.key === 'rsi').text, '48.25', 'ค่าที่มาเป็นสตริงต้องอ่านเป็นตัวเลขได้');
});

await check('ป้าย ATR ต้องไม่โกหกในกรณีที่เครื่องยนต์ถอยไปใช้ % ของราคา', () => {
  // เครื่องยนต์เขียน: const atr = Number.isFinite(atrRaw) && atrRaw > 0 ? atrRaw : currentPrice * 0.02
  // แล้ว put('atr', atr) — ค่าที่ถูกบันทึกจึงไม่ใช่ ATR(14) เสมอไป
  const m = ENGINE_SRC.match(/const atr = [^\n]*atrRaw[^\n]*currentPrice \* ([\d.]+)/);
  assert(
    m,
    'เครื่องยนต์ไม่ได้ใช้ค่าถอยแบบ currentPrice * X กับ ATR แล้ว — ทบทวนป้ายกับคำอธิบาย ATR ในกล่องค่าใหม่'
  );
  const pctText = `${Number(m[1]) * 100}%`;
  const row = readSignalSnapshot({ atr: 3.5 }).find((r) => r.key === 'atr');
  assert(
    !/ATR\s*\(\s*14\s*\)/.test(row.label),
    `ป้าย "${row.label}" อ้างว่าเป็น ATR(14) ทั้งที่ค่าที่บันทึกไว้เป็น ${pctText} ของราคาได้ในบางรอบ`
  );
  assert(row.footnote, 'คีย์ atr ต้องมีคำอธิบายว่าตัวเลขในนั้นอาจไม่ใช่ ATR(14)');
  assert(
    row.footnote.includes(pctText),
    `คำอธิบาย ATR ต้องบอกค่าถอยตามที่เครื่องยนต์ใช้จริง (${pctText}) — ตอนนี้เขียนว่า "${row.footnote}"`
  );
  assert(row.footnote.includes('ATR(14)'), 'คำอธิบาย ATR ต้องบอกด้วยว่ากรณีปกติคือ ATR(14)');
});

await check('คำอธิบายที่ต้องเห็นบนจอ ต้องถูกส่งออกมาเฉพาะคีย์ที่มีค่าจริง', () => {
  const missing = readSignalSnapshot({}).find((r) => r.key === 'atr');
  assertEqual(missing.footnote, null, 'คีย์ที่ไม่มีค่า ไม่ต้องอธิบายว่าค่านั้นคืออะไร');
  const other = readSignalSnapshot({ rsi: 50 }).find((r) => r.key === 'rsi');
  assertEqual(other.footnote, null, 'คีย์ที่ป้ายบอกครบแล้วต้องไม่มีคำอธิบายซ้ำซ้อน');
});

await check('กล่องค่าแสดงคำอธิบายจริงบนจอ ไม่ใช่ซ่อนไว้ใน tooltip', () => {
  const src = readFileSync(path.join(ROOT, 'src', 'components', 'trading', 'SignalEngineSnapshot.tsx'), 'utf8');
  assert(
    /\{r\.footnote\}/.test(src),
    'คอมโพเนนต์ไม่ได้วาด footnote ออกมาเลย — มือถือไม่มี hover คำอธิบายใน title จึงไม่มีใครเห็น'
  );
});

await check('เหตุผลจากเครื่องยนต์ถูกอ่านมาทั้งข้อความ ไม่ถูกแต่งเติม', () => {
  const list = readSignalReasons([
    { type: 'technical', label: 'RSI Oversold', detail: 'RSI(14) = 24.1 อยู่ในโซน oversold', weight: 0.2 },
    { type: 'pattern', label: 'Hammer', detail: 'รูปแบบ Hammer ปรากฏในแท่งล่าสุด', weight: 0.2 },
  ]);
  assertEqual(list.length, 2, 'ต้องได้ครบสองข้อ');
  assertEqual(list[0].label, 'RSI Oversold', 'ห้ามเปลี่ยนข้อความ label');
  assertEqual(list[0].detail, 'RSI(14) = 24.1 อยู่ในโซน oversold', 'ห้ามเปลี่ยนข้อความ detail');
});

await check('reasons ที่รูปไม่ตรงต้องไม่โยน', () => {
  for (const bad of [null, undefined, 'x', 5, {}, [null], [{ label: '' }], [{ nope: 1 }]]) {
    const list = readSignalReasons(bad);
    assert(Array.isArray(list), `อินพุต ${JSON.stringify(bad)} ต้องคืนอาร์เรย์`);
  }
  assertEqual(readSignalReasons([{ label: '  ' }]).length, 0, 'label ว่างต้องถูกข้าม');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ค่าที่ผู้ใช้ตั้งไว้ — อ่านของเสียแล้วต้องไม่พัง
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n6. การจำค่าเปิด/ปิดเส้น\n');

const { parseChartIndicatorPrefs, DEFAULT_CHART_INDICATOR_PREFS } = prefsMod;
const D = DEFAULT_CHART_INDICATOR_PREFS;

await check('ค่าเริ่มต้นเปิดเฉพาะชุดที่ตั้งใจ (ไม่ให้จอมือถือรก)', () => {
  assertEqual(D.ma20, true, 'EMA20 ควรเปิดเป็นค่าเริ่มต้น');
  assertEqual(D.ma50, true, 'SMA50 ควรเปิดเป็นค่าเริ่มต้น');
  assertEqual(D.ma200, false, 'SMA200 ต้องปิดไว้ (ต้องมีแท่งครบ 200 ถึงจะมีเส้น)');
  assertEqual(D.bb, false, 'Bollinger ต้องปิดไว้');
  assertEqual(D.sr, false, 'แนวรับ/แนวต้าน ต้องปิดไว้');
  assertEqual(D.lowerPane, 'rsi', 'แผงล่างเริ่มต้นคือ RSI');
});

await check('ของเสียทุกแบบ → ได้ค่าเริ่มต้น ไม่โยน', () => {
  for (const bad of [null, undefined, '', 'ไม่ใช่ json', '[]', '5', 'null', [], 42]) {
    const got = parseChartIndicatorPrefs(bad);
    assertEqual(JSON.stringify(got), JSON.stringify(D), `อินพุต ${JSON.stringify(bad)} ควรได้ค่าเริ่มต้น`);
  }
});

await check('ค่าที่เก็บไว้บางส่วน → เติมเฉพาะช่องที่ขาด ไม่ล้างของผู้ใช้ทิ้ง', () => {
  const got = parseChartIndicatorPrefs(JSON.stringify({ bb: true, lowerPane: 'macd' }));
  assertEqual(got.bb, true, 'ช่องที่ผู้ใช้ตั้งไว้ต้องอยู่');
  assertEqual(got.lowerPane, 'macd', 'แผงล่างที่ผู้ใช้เลือกไว้ต้องอยู่');
  assertEqual(got.ma20, D.ma20, 'ช่องที่ไม่มีในของเก่าต้องถอยไปใช้ค่าเริ่มต้น');
});

await check('lowerPane ที่ไม่รู้จัก → ถอยไปค่าเริ่มต้น (ห้ามส่งค่าที่วาดไม่ได้ต่อไป)', () => {
  assertEqual(parseChartIndicatorPrefs(JSON.stringify({ lowerPane: 'adx' })).lowerPane, D.lowerPane, 'ค่าที่ไม่รู้จักต้องถูกปัดทิ้ง');
  assertEqual(parseChartIndicatorPrefs(JSON.stringify({ lowerPane: 5 })).lowerPane, D.lowerPane, 'ชนิดผิดต้องถูกปัดทิ้ง');
  assertEqual(parseChartIndicatorPrefs(JSON.stringify({ ma20: 'yes' })).ma20, D.ma20, 'บูลีนที่ไม่ใช่บูลีนต้องถูกปัดทิ้ง');
});

await check('เขียนไปแล้วอ่านกลับได้ค่าเดิม', () => {
  // สร้างชุดทดสอบจากค่าเริ่มต้นโดย **กลับค่าบูลีนทุกช่อง** แทนการเขียนคีย์ไว้ตายตัว
  // เหตุผล: เขียนตายตัวแล้ววันไหนเพิ่มตัวเลือกใหม่ เทสต์จะแดงเพราะ "ยังไม่ได้อัปเดตเทสต์"
  // ซึ่งเป็นความแดงที่ไม่ได้บอกอะไรเลย · การกลับค่าทุกช่องยังคงพิสูจน์สิ่งเดิมได้ครบ
  // คือ "ไม่ได้คืนค่าเริ่มต้นมาเฉย ๆ" และตอนนี้ครอบคลุมตัวเลือกใหม่ให้อัตโนมัติด้วย
  const mine = {};
  for (const [k, v] of Object.entries(D)) mine[k] = typeof v === 'boolean' ? !v : 'macd';
  const back = parseChartIndicatorPrefs(JSON.stringify(mine));
  for (const k of Object.keys(mine)) {
    assertEqual(back[k], mine[k], `ค่าของ ${k} ที่บันทึกไว้ต้องกลับมาเหมือนเดิม`);
  }
  assertEqual(Object.keys(back).length, Object.keys(D).length, 'จำนวนช่องที่อ่านกลับมาต้องเท่ากับค่าเริ่มต้น');
});

/**
 * ═══ บั๊กจริงที่ด่านนี้มาปิด: "เปิดใหม่แล้วจำค่าไม่ได้" บน npm run dev ═══════════
 *
 * ของเดิมเขียนลง localStorage จาก useEffect ที่ผูกกับ prefs แล้วกันด้วยธง
 * prefsHydrated พร้อมคอมเมนต์ยาว ๆ ว่า "ประกาศ effect ตัวเขียนก่อนตัวโหลด" ปิดปัญหาได้
 * คำอ้างนั้นไม่จริงบน dev: React StrictMode รัน effect รอบสองทันทีหลังรอบแรก ตอนนั้น
 * prefsHydrated เป็น true แล้วแต่ผลของ setPrefs() ยังไม่ถูกนำไปใช้ state จึงยังเป็น
 * ค่าเริ่มต้น → ตัวเขียนเขียนค่าเริ่มต้นทับของผู้ใช้ทิ้งตั้งแต่วินาทีที่เปิดหน้า
 * (ทดสอบตรง ๆ บน dev: ตั้งค่าเอง แล้วรีโหลด → ได้ค่าเริ่มต้นคืนมาทั้งชุด · โปรดักชันไม่มีอาการ
 *  ซึ่งแปลว่าคนที่เจอก่อนคือคนที่เปิดด้วย dev)
 *
 * ทางแก้ที่ไม่ต้องพึ่งลำดับ effect: เขียนตอน "ผู้ใช้กดปุ่ม" เท่านั้น ไม่มี effect ไหนเขียนได้
 * ด่านนี้จึงตรวจว่าไม่มีการเรียกตัวเขียนจากใน effect เลย ซึ่งเป็นรูปแบบที่ตรวจได้จากซอร์ส
 */
const PAGE_SRC = readFileSync(path.join(ROOT, 'src', 'app', 'chart', 'page.tsx'), 'utf8');
/** ตัดคอมเมนต์ออก — คอมเมนต์ที่อธิบายว่า "ห้ามทำ" ไม่ใช่โค้ดที่ทำ */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const PAGE_CODE = stripComments(PAGE_SRC);

await check('หน้ากราฟบันทึกค่าตอนผู้ใช้กดปุ่ม ไม่ใช่จาก effect (กัน StrictMode ทับของผู้ใช้)', () => {
  const at = PAGE_CODE.indexOf('saveChartIndicatorPrefs(');
  assert(at > 0, 'หน้ากราฟไม่ได้เรียก saveChartIndicatorPrefs เลย — ค่าที่ผู้ใช้ตั้งจะไม่ถูกจำ');
  assertEqual(
    PAGE_CODE.indexOf('saveChartIndicatorPrefs(', at + 1),
    -1,
    'มีจุดเขียนค่ามากกว่าหนึ่งจุด — จุดที่สองคือทางที่จะเพี้ยนจากทางหลักวันไหนก็ได้'
  );
  const before = PAGE_CODE.slice(0, at);
  const lastEffect = before.lastIndexOf('useEffect(');
  const lastCallback = before.lastIndexOf('useCallback(');
  assert(
    lastCallback > lastEffect,
    'saveChartIndicatorPrefs ถูกเรียกจากใน useEffect — StrictMode จะเรียกซ้ำตอน mount ' +
      'ขณะที่ state ยังเป็นค่าเริ่มต้น แล้วเขียนทับสิ่งที่ผู้ใช้ตั้งไว้ (บั๊กที่เคยเกิดจริงบน dev)'
  );
});

await check('ไม่มี effect ไหนผูกกับ prefs ทั้งก้อนแล้วเขียนกลับ', () => {
  assert(
    !/\}, \[prefs\]\)/.test(PAGE_CODE),
    'ยังมี useEffect ที่ผูกกับ prefs ทั้งก้อนอยู่ — เป็นรูปแบบเดิมที่ทำให้ค่าถูกทับตอน mount'
  );
});

await check('negative control: ด่านข้างบนจับรูปแบบเดิมได้จริง', () => {
  const old = stripComments(`
    const prefsHydrated = useRef(false);
    useEffect(() => {
      if (!prefsHydrated.current) return;
      saveChartIndicatorPrefs(prefs);
    }, [prefs]);
    const changePrefs = useCallback(() => {}, []);
  `);
  const at = old.indexOf('saveChartIndicatorPrefs(');
  const before = old.slice(0, at);
  assert(
    before.lastIndexOf('useCallback(') < before.lastIndexOf('useEffect('),
    'ตัวตรวจอ่านรูปแบบเดิม (เขียนใน useEffect) แล้วยังบอกว่าผ่าน — ด่านนี้ไม่มีฟัน'
  );
  assert(/\}, \[prefs\]\)/.test(old), 'ตัวตรวจ deps [prefs] จับรูปแบบเดิมไม่ได้ — ด่านนี้ไม่มีฟัน');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ถ้อยคำบนหน้าจอ
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n7. คำที่ห้ามใช้ในไฟล์ของเลนนี้\n');

/**
 * คำที่อ้าง "ความถูกต้องของการทำนาย" หรือสั่งให้ลงมือทำ
 *
 * งานวิจัยของรีโปนี้วัดแล้วว่าไม่มีอินดิเคเตอร์หรือชุดไหนพิสูจน์ได้ว่ามีขอบหลังหักต้นทุน
 * (24 เทคนิค รอด 0/50 · วีโต้ 4 ข้อ รอด 0/22 · ปรับ 36 แบบบนเลน 15m รอด 0/36)
 * คำพวกนี้จึงเป็นคำอ้างเท็จเสมอในเลนนี้ ไม่ว่าจะเขียนในบริบทไหน —
 * ตรวจทั้งไฟล์รวมคอมเมนต์ เพื่อไม่ให้มีใครลอกประโยคจากคอมเมนต์ไปใส่บนหน้าจอ
 *
 * ⚠ รายการนี้ตรวจแบบ "เจอที่ไหนก็แดง" จึงใส่ได้เฉพาะคำที่ไม่มีความหมายอื่นที่ซื่อสัตย์เลย
 *   คำตระกูลรับประกันผล ("รับประกัน" · "ชัวร์" · "แน่นอน") มีการใช้ที่ซื่อสัตย์อยู่จริง
 *   (เช่น "/api/chart รับประกันว่าแท่งเรียงเวลาขึ้น" ซึ่งพูดถึงข้อมูล ไม่ใช่ผลการเทรด)
 *   คำกลุ่มนั้นมี scripts/check-ui-claims.mjs ด่าน 5 คุมอยู่แล้ว โดยดูบริบทระดับประโยค
 *   ว่าอยู่กับคำที่พูดถึงผลการเทรดไหม — ไม่ต้องมาซ้ำที่นี่แบบหยาบ ๆ ให้แดงผิดตัว
 */
const BANNED = ['แม่นยำ', 'ความแม่น', 'โอกาสชนะ', 'การันตี', 'ควรซื้อ', 'ควรขาย', 'สัญญาณเข้า'];

const LANE_FILES = [
  'src/lib/chart-indicators.ts',
  'src/lib/chart-indicator-prefs.ts',
  'src/lib/signal-snapshot.ts',
  'src/components/trading/ChartIndicatorToggles.tsx',
  'src/components/trading/SignalEngineSnapshot.tsx',
  'src/components/trading/GoldChart.tsx',
  'src/app/chart/page.tsx',
];

await check('ไม่มีคำต้องห้ามในไฟล์ของเลนกราฟ', () => {
  for (const rel of LANE_FILES) {
    const abs = path.join(ROOT, rel);
    assert(existsSync(abs), `ไม่พบไฟล์ ${rel} — รายชื่อไฟล์ที่ตรวจล้าสมัยแล้ว`);
    const src = readFileSync(abs, 'utf8');
    for (const w of BANNED) {
      const at = src.indexOf(w);
      assert(at < 0, `${rel} มีคำต้องห้าม "${w}" ที่บรรทัด ${src.slice(0, at).split('\n').length}`);
    }
  }
});

await check('negative control: ตัวตรวจคำต้องห้ามจับของปลอมได้จริง', () => {
  const fake = 'ระบบนี้แม่นยำมาก';
  assert(
    BANNED.some((w) => fake.includes(w)),
    'ประโยคที่ควรโดนจับ กลับผ่านตัวตรวจ — รายการคำต้องห้ามใช้ไม่ได้'
  );
});

await check('หน้ากราฟยังเขียนกำกับว่าค่าในตารางเป็นของตอนออกใบนั้น ไม่ใช่ค่าปัจจุบัน', () => {
  const src = readFileSync(path.join(ROOT, 'src', 'components', 'trading', 'SignalEngineSnapshot.tsx'), 'utf8');
  assert(src.includes('ไม่ใช่ค่าปัจจุบัน'), 'ข้อความกำกับหายไป — ผู้ใช้จะเข้าใจว่าตัวเลขคือค่าตอนนี้');
  assert(
    src.includes('ค่าที่เครื่องยนต์เห็นตอนออกใบนี้'),
    'หัวข้อของกล่องหายไป — ต้องบอกให้ชัดว่านี่คือบันทึกของเครื่องยนต์'
  );
});

await check('แถบเปิด/ปิดยังเขียนกำกับว่าเส้นไม่ใช่การคาดการณ์', () => {
  const src = readFileSync(path.join(ROOT, 'src', 'components', 'trading', 'ChartIndicatorToggles.tsx'), 'utf8');
  assert(src.includes('ไม่ใช่การคาดการณ์'), 'ข้อความกำกับเรื่อง "ไม่ใช่การคาดการณ์" หายไป');
});

await check('ไม่มีปุ่มให้เปิดตัวที่เครื่องยนต์ไม่ได้ใช้คิด (Stochastic / ADX / วอลุ่ม)', () => {
  const src = readFileSync(path.join(ROOT, 'src', 'components', 'trading', 'ChartIndicatorToggles.tsx'), 'utf8');
  // ตัดคอมเมนต์บล็อกออกก่อน — คอมเมนต์ที่อธิบายว่า "ห้ามใส่" ไม่ใช่ปุ่มบนหน้าจอ
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const name of ['Stochastic', 'ADX', 'volumeRatio']) {
    assert(
      !code.includes(name),
      `แถบเปิด/ปิดอ้างถึง ${name} ซึ่ง signal-engine.ts ไม่เคยเรียก — แสดงมันคือการบอกว่าระบบใช้มันคิด`
    );
  }
  const engineImports = ENGINE_SRC.match(/import \{([\s\S]*?)\} from '\.\/indicators'/);
  assert(engineImports, 'อ่านรายการ import ของเครื่องยนต์ไม่ได้');
  for (const name of ['Stochastic', 'ADX', 'volumeRatio']) {
    assert(
      !engineImports[1].includes(name),
      `เครื่องยนต์เริ่ม import ${name} แล้ว — ทบทวนได้ว่าควรมีปุ่มให้เปิดดูไหม`
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. สิ่งที่ตาเห็นก่อนอ่านคำกำกับ — ต้องไม่ชวนให้อ่านผิดตั้งแต่แรก
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n8. สิ่งที่ตาเห็นบนกราฟ\n');

const GOLD_SRC = readFileSync(path.join(ROOT, 'src', 'components', 'trading', 'GoldChart.tsx'), 'utf8');
const GOLD_CODE = stripComments(GOLD_SRC);

/**
 * เพดานความสูงกล่องกราฟบนมือถือ — วัดมาจากหน้าจริงที่ 375×812
 *
 * ขอบบนของกล่องอยู่ที่ y = 344 (หัวหน้า + ราคา + แถวปุ่มกรอบเวลา + ระยะห่าง)
 * แถบแกนเวลาสูง 28px อยู่ที่ก้นกล่องพอดี ถ้ากล่องจบเลย 812 แถบนั้นตกขอบจอทั้งแถว
 * แล้วผู้ใช้เปิดหน้ามาจะไม่เห็นวันที่/เวลาเลย (เกิดจริงตอนกล่องสูง 512px → จบที่ 856)
 */
const MOBILE_VIEWPORT_H = 812;
const CHART_BOX_TOP = 344;

await check('ความสูงกล่องตอนเปิดแผงล่าง ต้องไม่ดันแกนเวลาตกขอบจอ 375×812', () => {
  const m = GOLD_CODE.match(/lowerPaneHeightClass = 'h-\[(\d+)px\]/);
  assert(m, "อ่านความสูงเริ่มต้นของ lowerPaneHeightClass ไม่ได้ — รูปแบบ 'h-[NNNpx] …' เปลี่ยนไปแล้ว");
  const h = Number(m[1]);
  const bottom = CHART_BOX_TOP + h;
  assert(
    bottom <= MOBILE_VIEWPORT_H,
    `กล่องสูง ${h}px วางที่ y=${CHART_BOX_TOP} จะจบที่ ${bottom} ซึ่งเลยขอบจอ ${MOBILE_VIEWPORT_H} ไป ` +
      `${bottom - MOBILE_VIEWPORT_H}px — แถบแกนเวลาทั้งแถวจะอยู่ใต้ขอบจอ`
  );
});

await check('ความสูงตอนไม่เปิดแผงล่าง ต้องยังอยู่ในจอเหมือนเดิม', () => {
  const m = GOLD_CODE.match(/heightClass = 'h-\[(\d+)px\]/);
  assert(m, "อ่านความสูงเริ่มต้นของ heightClass ไม่ได้");
  assert(
    CHART_BOX_TOP + Number(m[1]) <= MOBILE_VIEWPORT_H,
    `กล่องสูง ${m[1]}px ตอนไม่มีแผงล่าง ก็ยังเลยขอบจอ — ของเดิมไม่เคยเลย`
  );
});

/**
 * แผงล่างต้องไม่มีหมุด/จุดปักบนเส้น
 *
 * จุดที่ปักบนเส้น RSI/MACD ตรงแท่งของสัญญาณ อ่านด้วยตาได้ทางเดียวว่า "ตอนออกใบนี้
 * ค่าอยู่ตรงนี้" ซึ่งไม่จริง — วัดจริงกับใบหนึ่ง: ค่าที่บันทึกไว้คือ RSI 42.00 แต่เส้น RSI
 * บนกราฟที่แท่งเดียวกันคือ 61.36 และช่องว่างกว้างได้อีกมากเมื่อใบนั้นมาจากคนละกรอบเวลา
 * ค่าที่เครื่องยนต์เห็นจริงอ่านได้จากกล่องใต้กราฟ ซึ่งดึงจากฐานข้อมูลตรง ๆ
 */
await check('แผงล่างต้องไม่มีจุด/หมุดปักบนเส้น (ชวนให้อ่านค่าผิด)', () => {
  const at = GOLD_CODE.indexOf('lowerRef');
  assert(at > 0, 'หา lowerRef ไม่เจอ — โครงของแผงล่างเปลี่ยนไปแล้ว ทบทวนด่านนี้ใหม่');
  assert(
    !/createSeriesMarkers\(\s*holder/.test(GOLD_CODE) && !/holder\.markers/.test(GOLD_CODE),
    'มีการปักหมุดลงบนซีรีส์ของแผงล่างอีกแล้ว — จุดบนเส้นอ่านได้ว่าค่าที่บันทึกไว้เท่ากับค่าบนเส้น ซึ่งไม่จริง'
  );
  assert(
    !/position:\s*'inBar'/.test(GOLD_CODE),
    "ยังมีหมุดแบบ position:'inBar' อยู่ — หมุดชนิดนี้นั่งทับค่าของเส้นพอดี จึงอ่านเป็นค่าของเส้น"
  );
});

/**
 * เส้นเกณฑ์ RSI: ไม่ติดป้ายบนแกน + ต้องมีข้อความบอกระดับแทน
 *
 * ป้ายบนแกนของแผงล่างทับป้ายขีดที่ไลบรารีเลือกเอง (วัดจริงบนจอ 375px: "70.0" ทับ "75.0"
 * และ "30.0" ทับ "25.0" อ่านไม่ออกทั้งคู่ บนแกนกว้าง ~58px) และ title บนเส้นก็ใช้แทนไม่ได้
 * เพราะไลบรารี return ทิ้งก่อนถึงบรรทัดที่วาด title เมื่อ axisLabelVisible เป็น false
 * ทางที่เหลือคือบอกด้วยข้อความใต้กราฟ — ด่านนี้จึงบังคับทั้งสองข้าง: ห้ามมีป้ายบนแกน
 * และต้องมีข้อความบอกระดับ ไม่ใช่ถอดป้ายทิ้งเฉย ๆ แล้วเหลือเส้นประที่ไม่มีใครรู้ว่าคืออะไร
 */
await check('เส้นเกณฑ์ RSI ไม่ติดป้ายบนแกน (ป้ายบนแกนทับป้ายขีดของไลบรารี)', () => {
  const block = GOLD_CODE.slice(GOLD_CODE.indexOf('RSI_LEVELS.overbought, RSI_LEVELS.middle'));
  const spec = block.slice(0, block.indexOf('});') + 3);
  assert(spec.includes('createPriceLine'), 'อ่านบล็อกที่ขีดเส้นเกณฑ์ RSI ไม่ได้');
  assert(
    /axisLabelVisible:\s*false/.test(spec),
    'เส้นเกณฑ์ RSI ยังวาดป้ายลงบนแกนราคา — บนจอ 375px ป้าย 70.0 จะทับป้ายขีด 75.0 ของไลบรารี อ่านไม่ออกทั้งคู่'
  );
  assert(
    !/title:/.test(spec),
    'ตั้ง title ไว้ทั้งที่ axisLabelVisible เป็น false — ไลบรารีไม่วาดให้ (dist บรรทัด 2380-2387) เป็นค่าที่หลอกคนอ่านโค้ด'
  );
});

await check('เมื่อเปิดแผง RSI ต้องมีข้อความบอกว่าเส้นประสามเส้นคือระดับไหน', () => {
  const src = readFileSync(path.join(ROOT, 'src', 'components', 'trading', 'ChartIndicatorToggles.tsx'), 'utf8');
  const code = stripComments(src);
  assert(
    /prefs\.lowerPane === 'rsi'/.test(code),
    'แถบเปิด/ปิดไม่ได้พูดถึงแผง RSI เลย — ผู้ใช้จะเห็นเส้นประสามเส้นโดยไม่รู้ว่าคือระดับอะไร'
  );
  const at = code.indexOf("prefs.lowerPane === 'rsi'");
  const near = code.slice(at, at + 200);
  assert(
    near.includes('RSI_LINE_TEXT'),
    'ข้อความของแผง RSI ไม่ได้อ่านระดับจาก RSI_LINE_TEXT — เลขที่พิมพ์มือจะเพี้ยนจาก RSI_LEVELS วันไหนก็ได้'
  );
  // RSI_LINE_TEXT ประกอบจาก RSI_LEVELS ตัวจริง จึงตรวจได้ว่าเลขที่ผู้ใช้เห็นมาจากเกณฑ์จริง
  const tpl = code.match(/const RSI_LINE_TEXT = `([^`]+)`/);
  assert(tpl, 'อ่าน RSI_LINE_TEXT ไม่ได้');
  for (const k of ['oversold', 'middle', 'overbought']) {
    assert(
      tpl[1].includes(`RSI_LEVELS.${k}`),
      `ข้อความระดับ RSI ไม่ได้อ้าง RSI_LEVELS.${k} — เลขบนจอจะไม่ตามเกณฑ์จริงของเครื่องยนต์`
    );
  }
});

/**
 * กล่องค่าต้องบอก "กรอบเวลาของใบนี้"
 *
 * เหตุผลหลักที่ตัวเลขในกล่องต่างจากเส้นบนจอ ไม่ใช่หน้าต่างข้อมูล (วัดแล้วต่างกัน ≤1.2e-5)
 * แต่เป็นใบที่มาจากคนละกรอบเวลา — chart-markers ตั้ง foreign = tf !== viewTf แปลว่า
 * หมุดของ 1D/1H ขึ้นบนกราฟ 15m ได้ พอแตะใบ 1D ค่าที่บันทึกไว้เป็นของ 1D แต่เส้นบนจอ
 * เป็นของ 15m ต่างกันได้หลายสิบหน่วย · ถ้ากล่องไม่พูดถึงเรื่องนี้ คนอ่านจะสรุปว่าระบบไม่ตรงกัน
 */
await check('กล่องค่าบอกกรอบเวลาของใบ และอธิบายเหตุผลหลักที่ตัวเลขต่างจากเส้นบนจอ', () => {
  const src = readFileSync(path.join(ROOT, 'src', 'components', 'trading', 'SignalEngineSnapshot.tsx'), 'utf8');
  assert(/signalTimeframe/.test(src), 'กล่องค่าไม่รู้จักกรอบเวลาของใบเลย');
  assert(/viewTimeframe/.test(src), 'กล่องค่าไม่รู้จักกรอบเวลาของกราฟที่กำลังดู');
  assert(/foreign/.test(src), 'กล่องค่าไม่ได้แยกกรณี "ใบคนละกรอบกับกราฟ" ออกมาพูดต่างหาก');
  assert(
    /กรอบ \{tfLabel\}/.test(src),
    'หัวข้อของกล่องไม่ได้พิมพ์กรอบเวลาของใบออกมา — คนเทียบตัวเลขจะไม่รู้ว่าเทียบข้ามกรอบอยู่'
  );
  assert(
    /คนละชุดแท่ง/.test(src),
    'ไม่มีประโยคที่บอกว่าใบคนละกรอบเวลาใช้คนละชุดแท่ง ซึ่งเป็นเหตุผลหลักที่ตัวเลขต่างกันมาก'
  );
});

await check('หน้ากราฟส่งกรอบเวลาทั้งสองฝั่งให้กล่องค่าจริง', () => {
  const call = PAGE_CODE.match(/<SignalEngineSnapshot([\s\S]*?)\/>/);
  assert(call, 'หน้ากราฟไม่ได้วาง SignalEngineSnapshot เลย');
  for (const prop of ['signalTimeframe', 'viewTimeframe', 'foreign']) {
    assert(call[1].includes(prop), `หน้ากราฟไม่ได้ส่ง ${prop} ให้กล่องค่า`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(70)}`);
if (failures.length === 0) {
  console.log(`ผ่านทั้งหมด ${passed} ข้อ ✓\n`);
  process.exit(0);
}
console.log(`ผ่าน ${passed} · ไม่ผ่าน ${failures.length}\n`);
for (const f of failures) console.log(`  · ${f.name}\n    ${f.message}`);
console.log('');
process.exit(1);
