#!/usr/bin/env node
/**
 * ชุดทดสอบตัวเก็บแท่ง 15m (scripts/collect-15m.mjs)
 *
 * ทำไมต้องมี: ไฟล์ที่ตัวเก็บเขียนคือ "คลังที่โตวันละนิดและกู้คืนไม่ได้"
 * ถ้าการผสานเพี้ยน เราจะไม่รู้ในวันที่มันเพี้ยน แต่จะไปรู้เอาตอนเอาข้อมูลทั้งปีมาวิจัย
 * แล้วพบว่ามี timestamp ซ้ำ / เรียงผิด / แท่งเสียหลุดเข้ามา — ตอนนั้นแก้ย้อนหลังไม่ได้แล้ว
 * เพราะข้อมูลเก่ากว่า 1 เดือนขอจาก Yahoo ใหม่ไม่ได้ นี่คือเหตุผลทั้งหมดที่โครงการนี้มีอยู่
 *
 * ทุกเคสในไฟล์นี้ไม่แตะเครือข่าย — ป้อนคำตอบ Yahoo สังเคราะห์เข้าฟังก์ชันบริสุทธิ์ของตัวเก็บ
 * แต่ใช้ **ด่านตรวจแท่งตัวจริง** (src/lib/candle-sanitizer.ts) เหมือนที่ตัวเก็บใช้จริง
 *
 * รัน: node scripts/test-collect-15m.mjs   (npm run test:collect15m)
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSrcModules } from './research/load-src-modules.mjs';
import {
  loadExisting,
  parseChart,
  mergeCandles,
  analyzeGaps,
  coverageOf,
  buildDataset,
  serializeDataset,
  assertYahooSymbolStillMatches,
  fetchChart,
} from './collect-15m.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
function t(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const { sanitizeCandles } = (await loadSrcModules(['src/lib/candle-sanitizer.ts']))['candle-sanitizer'];

// ───────────────────────────── ตัวช่วยสร้างคำตอบ Yahoo ─────────────────────────────

const BAR = 900;
/** 2026-08-03T00:00:00Z — เลือกเวลากลม ๆ ที่หารด้วย 900 ลงตัว ให้แท่งตรงคาบเหมือนของจริง */
const T0 = Math.floor(Date.UTC(2026, 7, 3, 0, 0, 0) / 1000);

/**
 * ประกอบคำตอบแบบเดียวกับที่ Yahoo ส่งมาจริง (โครงจาก chart.result[0] ที่วัดเมื่อ 2026-09-01)
 * bars = อาร์เรย์ของ [open, high, low, close, volume] · null ทั้งแท่งได้ (Yahoo เติม null จริง)
 */
function chartOf(bars, { startSec = T0, meta = {}, stepSec = BAR } = {}) {
  const q = { open: [], high: [], low: [], close: [], volume: [] };
  const timestamp = [];
  bars.forEach((b, i) => {
    timestamp.push(startSec + i * stepSec);
    q.open.push(b ? b[0] : null);
    q.high.push(b ? b[1] : null);
    q.low.push(b ? b[2] : null);
    q.close.push(b ? b[3] : null);
    q.volume.push(b ? (b[4] ?? 10) : null);
  });
  return {
    meta: {
      dataGranularity: '15m',
      exchangeTimezoneName: 'America/New_York',
      shortName: 'Gold Dec 26',
      firstTradeDate: 967608000,
      ...meta,
    },
    timestamp,
    indicators: { quote: [q] },
  };
}

/** แท่งปกติที่ราคาขยับนิดเดียว — ใช้เป็นพื้นหลังให้เคสแท่งเสียโดดออกมา */
const okBar = (base, i) => [base + i, base + i + 2, base + i - 2, base + i + 1, 100 + i];
const okBars = (n, base = 4400) => Array.from({ length: n }, (_, i) => okBar(base, i));

/** "ตอนนี้" ที่ทำให้ทุกแท่งในชุดปิดครบแล้ว (ยกเว้นที่เคสตั้งใจให้ยังไม่ปิด) */
const nowAfter = (count, startSec = T0) => (startSec + count * BAR + 3600) * 1000;

const parse = (chart, nowMs) => parseChart(chart, nowMs, sanitizeCandles);

// ═════════════════════════ 1. แกะคำตอบ Yahoo + ด่านตรวจแท่ง ═════════════════════════

console.log('── แกะคำตอบ Yahoo และด่านตรวจแท่ง ──');
{
  const chart = chartOf(okBars(10));
  const r = parse(chart, nowAfter(10));
  t('แท่งปกติผ่านครบทุกแท่ง', r.candles.length === 10, `ได้ ${r.candles.length}`);
  t('timestamp แปลงเป็น ISO ตรงคาบ 15 นาที', r.candles[0].timestamp === new Date(T0 * 1000).toISOString());
  t('ช่องว่างระหว่างแท่งเท่ากับ 15 นาทีพอดี',
    Date.parse(r.candles[1].timestamp) - Date.parse(r.candles[0].timestamp) === 900000);
}

{
  // Yahoo เติม null ในตารางเวลาที่ตลาดปิด — วัดจริงได้ 471 จาก 2,432 แท่งในหนึ่งเดือน
  const bars = okBars(10);
  bars[3] = null;
  bars[4] = null;
  const r = parse(chartOf(bars), nowAfter(10));
  t('แท่ง null ถูกตัดทิ้งและถูกนับ', r.candles.length === 8 && r.issues.nullOrNaN === 2,
    `เหลือ ${r.candles.length} · นับ null ${r.issues.nullOrNaN}`);
  t('แท่ง null กลายเป็นช่องโหว่ในลำดับ ไม่ใช่แท่งปลอม',
    Date.parse(r.candles[3].timestamp) - Date.parse(r.candles[2].timestamp) === 3 * 900000);
}

{
  // ราคา 0 / ติดลบ / NaN — ด่านตัวจริงทิ้งทั้งแท่ง (ซ่อมไม่ได้)
  const bars = okBars(10);
  bars[2] = [0, 4402, 4398, 4401, 10];
  bars[5] = [4405, 4407, 4403, NaN, 10];
  bars[7] = [4407, 4409, -1, 4408, 10];
  const r = parse(chartOf(bars), nowAfter(10));
  t('แท่งราคา 0 / NaN / ติดลบ ไม่เหลือรอดสักแท่ง', r.candles.length === 7, `เหลือ ${r.candles.length}`);
  t('ทุกแท่งที่เหลือมีราคาบวกครบสี่ค่า',
    r.candles.every((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0)));
}

{
  // กรอบพัง (open/close หลุดนอก high-low) — ด่านตัวจริง "ซ่อม" ไม่ใช่ "ทิ้ง"
  // ถ้าวันไหนตัวเก็บเขียนตรรกะซ่อมเองแล้วเลือกทิ้งแทน เคสนี้จะแดงทันที
  const bars = okBars(10);
  bars[4] = [4450, 4404, 4402, 4403, 10]; // open สูงกว่า high ของตัวเอง
  const r = parse(chartOf(bars), nowAfter(10));
  t('แท่งกรอบพังถูกซ่อม ไม่ถูกทิ้ง', r.candles.length === 10 && r.issues.sanitizerRepaired === 1,
    `เหลือ ${r.candles.length} · ซ่อม ${r.issues.sanitizerRepaired}`);
  const fixed = r.candles[4];
  t('ซ่อมด้วยกติกาของด่านจริง: high = max(o,h,c) · low = min(o,l,c)',
    fixed.high === 4450 && fixed.low === 4402, JSON.stringify(fixed));
}

{
  // ระดับผิดทั้งแท่ง (interior spike) — เพดานทองคือ 18% แล้วแท่งถัดไปถอยกลับเกินครึ่ง
  const bars = okBars(10);
  bars[5] = [5600, 5620, 5590, 5610, 10];
  const r = parse(chartOf(bars), nowAfter(10));
  t('แท่งระดับผิดทั้งแท่งถูกด่านทิ้ง', r.candles.length === 9 && r.issues.sanitizerDropped === 1,
    `เหลือ ${r.candles.length} · ทิ้ง ${r.issues.sanitizerDropped}`);
  t('ไม่มีแท่งราคา 5,6xx เหลืออยู่', r.candles.every((c) => c.close < 5000));
}

console.log('── แท่งที่ยังไม่ปิด ──');
{
  // Yahoo ประทับแท่งสดด้วยเวลาซื้อขายล่าสุด (มีเศษวินาที) — ของจริงที่วัดได้คือ 05:31:18Z
  const chart = chartOf(okBars(6));
  chart.timestamp[5] = T0 + 5 * BAR + 78; // เศษวินาทีติดมา
  chart.meta.regularMarketTime = chart.timestamp[5];
  const r = parse(chart, (T0 + 6 * BAR) * 1000);
  t('แท่งที่ประทับเวลาซื้อขายล่าสุด (มีเศษวินาที) ถูกตัด', r.candles.length === 5 && r.issues.unclosedDropped === 1,
    `เหลือ ${r.candles.length}`);
}

{
  // เคสที่ตัดแค่แท่งท้ายสุดใบเดียวไม่พอ: แท่งก่อนหน้าก็ยังปิดไม่ครบคาบ
  const chart = chartOf(okBars(6));
  chart.timestamp[5] = T0 + 5 * BAR + 78;
  chart.meta.regularMarketTime = chart.timestamp[5];
  const nowMs = (T0 + 4 * BAR + 300) * 1000; // แท่งที่ 4 เพิ่งเปิดได้ 5 นาที
  const r = parse(chart, nowMs);
  t('แท่งที่ยังปิดไม่ครบคาบถูกตัดด้วย ไม่ใช่แค่แท่งท้ายสุด', r.candles.length === 4 && r.issues.unclosedDropped === 2,
    `เหลือ ${r.candles.length} · ตัด ${r.issues.unclosedDropped}`);
  t('แท่งสุดท้ายที่เก็บคือแท่งที่ปิดแล้วจริง',
    Date.parse(r.candles.at(-1).timestamp) + 900000 <= nowMs);
}

console.log('── ด่านกัน Yahoo ลดความละเอียดเงียบ ๆ ──');
{
  let threw = null;
  try {
    parse(chartOf(okBars(4), { meta: { dataGranularity: '1h' } }), nowAfter(4));
  } catch (err) {
    threw = err.message;
  }
  t('ได้ granularity ไม่ตรงกับที่ขอ = โยน error ไม่ใช่เก็บลงคลัง', threw !== null && /dataGranularity/.test(threw), String(threw));

  let threw2 = null;
  try {
    parse({ meta: { dataGranularity: '15m' }, timestamp: [], indicators: { quote: [{}] } }, Date.now());
  } catch (err) {
    threw2 = err.message;
  }
  t('คำตอบที่ไม่มีแท่งเลย = โยน error', threw2 !== null);
}

// ═════════════════════════════ 2. การผสานแบบสะสม ═════════════════════════════

console.log('── ผสานแบบสะสม ──');
{
  const first = parse(chartOf(okBars(20)), nowAfter(20));
  const second = parse(chartOf(okBars(20).slice(10).concat(okBars(30).slice(20)), { startSec: T0 + 10 * BAR }), nowAfter(30));

  const m = mergeCandles(first.candles, second.candles);
  t('เพิ่มเฉพาะแท่งที่ยังไม่มี', m.added === 10, `added=${m.added}`);
  t('แท่งที่ค่าเท่าเดิมไม่นับเป็นการทับ', m.replaced === 0 && m.identical === 10,
    `replaced=${m.replaced} identical=${m.identical}`);
  t('รวมแล้วได้ 30 แท่ง', m.candles.length === 30, `ได้ ${m.candles.length}`);

  const stamps = m.candles.map((c) => c.timestamp);
  t('ไม่มี timestamp ซ้ำ', new Set(stamps).size === stamps.length);
  t('เรียงจากเก่าไปใหม่ทุกคู่',
    m.candles.every((c, i) => i === 0 || Date.parse(c.timestamp) > Date.parse(m.candles[i - 1].timestamp)));
}

{
  // Yahoo แก้ค่าย้อนหลังได้จริง — แท่งใหม่ต้องทับของเดิมที่ timestamp เดียวกัน
  const oldBars = parse(chartOf(okBars(5)), nowAfter(5)).candles;
  const revised = okBars(5);
  revised[2] = [4402, 4499, 4401, 4498, 999]; // แท่งเดิมถูกแก้ค่า
  const newBars = parse(chartOf(revised), nowAfter(5)).candles;

  const m = mergeCandles(oldBars, newBars);
  t('แท่งใหม่ทับแท่งเดิมที่ timestamp เดียวกันจริง', m.replaced === 1 && m.added === 0,
    `replaced=${m.replaced} added=${m.added}`);
  t('ค่าที่เหลืออยู่คือค่าใหม่ ไม่ใช่ค่าเก่า', m.candles[2].close === 4498 && m.candles[2].volume === 999,
    JSON.stringify(m.candles[2]));
  t('จำนวนแท่งไม่บวมจากการทับ', m.candles.length === 5, `ได้ ${m.candles.length}`);
}

{
  // ไฟล์เดิมที่มี timestamp ซ้ำ (แก้ด้วยมือ / ผสานพลาดในอดีต) ต้องถูกรีดให้เหลือใบเดียว
  const dup = [
    { timestamp: '2026-08-03T00:00:00.000Z', open: 1, high: 2, low: 1, close: 2, volume: 1 },
    { timestamp: '2026-08-03T00:00:00.000Z', open: 3, high: 4, low: 3, close: 4, volume: 1 },
    { timestamp: '2026-08-03T00:15:00.000Z', open: 5, high: 6, low: 5, close: 6, volume: 1 },
  ];
  const m = mergeCandles(dup, []);
  t('timestamp ซ้ำในไฟล์เดิมถูกรีดเหลือใบเดียว', m.candles.length === 2, `ได้ ${m.candles.length}`);
  t('ใบที่เหลือคือใบหลังสุดของชุดเดิม', m.candles[0].close === 4, JSON.stringify(m.candles[0]));
}

{
  // แท่งที่มาแบบสลับลำดับต้องถูกเรียงให้ถูกก่อนออกจากตัวผสาน
  const shuffled = [
    { timestamp: '2026-08-03T00:30:00.000Z', open: 3, high: 3, low: 3, close: 3, volume: 0 },
    { timestamp: '2026-08-03T00:00:00.000Z', open: 1, high: 1, low: 1, close: 1, volume: 0 },
    { timestamp: '2026-08-03T00:15:00.000Z', open: 2, high: 2, low: 2, close: 2, volume: 0 },
  ];
  const m = mergeCandles([], shuffled);
  t('ผสานแล้วเรียงเวลาถูกเสมอแม้อินพุตสลับ',
    m.candles.map((c) => c.close).join(',') === '1,2,3', m.candles.map((c) => c.close).join(','));
}

// ═════════════════════════ 3. ไฟล์เดิมพัง / ว่างเปล่า / ไม่มี ═════════════════════════

console.log('── ไฟล์สะสมเดิมที่พังหรือว่างเปล่า ──');
{
  const dir = mkdtempSync(path.join(tmpdir(), 'collect15m-'));
  try {
    const cases = [
      ['ไฟล์ว่างเปล่า', ''],
      ['ไฟล์มีแต่ช่องว่าง', '   \n  '],
      ['JSON พังกลางไฟล์', '{"schemaVersion":1,"candles":[{"timestamp":"2026-08-0'],
      ['JSON ถูกแต่ไม่มี candles', '{"schemaVersion":1}'],
      ['candles ไม่ใช่อาร์เรย์', '{"candles":{"a":1}}'],
      ['ไฟล์เป็น null', 'null'],
      ['ไฟล์เป็นข้อความมั่ว', '<<<<<<< HEAD'],
    ];
    cases.forEach(([label, text], i) => {
      const f = path.join(dir, `broken-${i}.json`);
      writeFileSync(f, text, 'utf8');
      const e = loadExisting(f);
      t(`อ่านไฟล์เดิมที่ ${label} แล้วไม่ระเบิด`, e.broken === true && e.candles.length === 0, JSON.stringify(e.state));
    });

    const missing = loadExisting(path.join(dir, 'ไม่มีอยู่จริง.json'));
    t('ไม่มีไฟล์เดิม = เริ่มรอบแรกได้ ไม่ใช่ error', missing.broken === false && missing.candles.length === 0);

    // แท่งเสียปนอยู่ในไฟล์เดิม → ตัดทิ้งและนับไว้ ไม่ปล่อยให้ผู้อ่านชั้นถัดไประเบิด
    const mixed = path.join(dir, 'mixed.json');
    writeFileSync(mixed, JSON.stringify({
      schemaVersion: 1,
      candles: [
        { timestamp: '2026-08-03T00:00:00.000Z', open: 1, high: 1, low: 1, close: 1, volume: 0 },
        { timestamp: 'ไม่ใช่เวลา', open: 1, high: 1, low: 1, close: 1, volume: 0 },
        { timestamp: '2026-08-03T00:15:00.000Z', open: 1, high: 1, low: 1, close: 0, volume: 0 },
        null,
        { timestamp: '2026-08-03T00:30:00.000Z', open: 2, high: 2, low: 2, close: 2, volume: 0 },
      ],
    }), 'utf8');
    const e = loadExisting(mixed);
    t('แท่งที่อ่านไม่ออกในไฟล์เดิมถูกตัดและนับไว้', e.candles.length === 2 && e.unreadableBars === 3,
      `เหลือ ${e.candles.length} · ตัด ${e.unreadableBars}`);
    t('ไฟล์เดิมที่ยังอ่านได้ไม่ถูกตีตราว่าพัง', e.broken === false);

    // ต่อยอด: ไฟล์เดิมพังแล้วยังประกอบไฟล์ใหม่ได้ครบ ไม่ใช่ได้ไฟล์เปล่า
    const brokenExisting = loadExisting(path.join(dir, 'broken-0.json'));
    const parsed = parse(chartOf(okBars(12)), nowAfter(12));
    const built = buildDataset({ existing: brokenExisting, parsed, nowISO: '2026-09-01T00:00:00.000Z' });
    t('ไฟล์เดิมพัง → ยังเก็บรอบนี้ได้ครบทุกแท่ง', built.dataset.candles.length === 12, `ได้ ${built.dataset.candles.length}`);
    t('ไฟล์เดิมพัง → นับเป็นรอบแรกของตัวสะสม', built.dataset.collector.runsWithNewData === 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ═══════════════════════ 4. ประกอบไฟล์ · เขียน · ไม่มีอะไรเปลี่ยน ═══════════════════════

console.log('── ประกอบไฟล์ที่จะเขียน ──');
{
  const parsed = parse(chartOf(okBars(40)), nowAfter(40));
  const built = buildDataset({ existing: loadExisting('ไม่มีไฟล์นี้'), parsed, nowISO: '2026-09-01T00:00:00.000Z' });
  const ds = built.dataset;

  t('มีคีย์หัวไฟล์ครบชุดเดียวกับไฟล์อื่นในแคช',
    ['schemaVersion', 'symbol', 'market', 'timeframe', 'interval', 'fetchedAt', 'actualFrom', 'actualTo', 'bars', 'candles']
      .every((k) => k in ds));
  t('symbol/market/timeframe ตรงกับชื่อไฟล์ GOLD__XAUUSD__15m',
    ds.symbol === 'XAUUSD' && ds.market === 'GOLD' && ds.timeframe === '15m');
  t('bars ตรงกับจำนวนแท่งจริง', ds.bars === ds.candles.length);
  t('actualFrom/actualTo ตรงกับหัวท้ายของแท่ง',
    ds.actualFrom === ds.candles[0].timestamp && ds.actualTo === ds.candles.at(-1).timestamp);

  const text = serializeDataset(ds);
  t('ข้อความที่เขียนอ่านกลับเป็น JSON ได้และเท่าต้นฉบับทุกฟิลด์',
    JSON.stringify(JSON.parse(text)) === JSON.stringify(ds));
  const bodyLines = text.split('\n').filter((l) => l.startsWith('    {"timestamp"'));
  t('หนึ่งแท่ง = หนึ่งบรรทัด (diff รายวันอ่านได้)', bodyLines.length === ds.candles.length,
    `${bodyLines.length}/${ds.candles.length}`);

  // รอบที่ข้อมูลไม่เปลี่ยน ต้องได้ข้อความไฟล์เท่าเดิมเป๊ะ ไม่งั้น GitHub Actions จะ commit เปล่าทุกวัน
  const dir = mkdtempSync(path.join(tmpdir(), 'collect15m-'));
  try {
    const f = path.join(dir, 'GOLD__XAUUSD__15m.json');
    writeFileSync(f, text, 'utf8');
    const again = buildDataset({
      existing: loadExisting(f),
      parsed: parse(chartOf(okBars(40)), nowAfter(40)),
      nowISO: '2026-09-02T00:00:00.000Z', // วันถัดไป แต่ข้อมูลเท่าเดิม
    });
    t('ดึงซ้ำแล้วข้อมูลเท่าเดิม = ไม่มีอะไรเปลี่ยน', again.changed === false);
    t('ดึงซ้ำแล้วข้อความไฟล์เท่าเดิมทุกไบต์ (ไม่มี commit เปล่า)', serializeDataset(again.dataset) === text);
    t('fetchedAt ไม่ขยับตามนาฬิกาเมื่อข้อมูลไม่เปลี่ยน', again.dataset.fetchedAt === '2026-09-01T00:00:00.000Z');

    // วันถัดไปมีแท่งใหม่จริง → ต้องเขียน และตัวนับสะสมต้องเดินหน้า
    const grown = buildDataset({
      existing: loadExisting(f),
      parsed: parse(chartOf(okBars(46)), nowAfter(46)),
      nowISO: '2026-09-02T00:00:00.000Z',
    });
    t('มีแท่งใหม่ = เขียนไฟล์', grown.changed === true && grown.merged.added === 6, `added=${grown.merged.added}`);
    t('ตัวนับรอบที่มีข้อมูลใหม่เดินหน้า', grown.dataset.collector.runsWithNewData === 2);
    t('ตัวนับสะสมบวกทบของเดิม', grown.dataset.collector.totals.added === 46,
      `totals.added=${grown.dataset.collector.totals.added}`);
    t('firstRunAt ยังเป็นของรอบแรก', grown.dataset.collector.firstRunAt === '2026-09-01T00:00:00.000Z');
    t('แท่งเก่าไม่หายไปตอนผสานรอบใหม่', grown.dataset.candles.length === 46);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ═══════════════════════════════ 5. ช่องโหว่/ความครอบคลุม ═══════════════════════════════

console.log('── ช่องโหว่และความครอบคลุม ──');
{
  const mk = (isoList) => isoList.map((s) => ({ timestamp: s, open: 1, high: 1, low: 1, close: 1, volume: 0 }));

  const daily = mk(['2026-08-05T20:45:00.000Z', '2026-08-05T22:00:00.000Z']);
  t('ช่องว่าง 75 นาที = พักรายวันของ CME', analyzeGaps(daily).byKind['พักรายวัน'] === 1, JSON.stringify(analyzeGaps(daily)));

  const weekend = mk(['2026-08-07T20:45:00.000Z', '2026-08-09T22:00:00.000Z']); // ศุกร์ → อาทิตย์
  t('ช่องว่างศุกร์→อาทิตย์ = สุดสัปดาห์', analyzeGaps(weekend).byKind['สุดสัปดาห์'] === 1);

  const hole = mk(['2026-08-05T02:00:00.000Z', '2026-08-05T09:00:00.000Z']); // กลางวันพุธ 7 ชม.
  const holeR = analyzeGaps(hole);
  t('ช่องว่างกลางวันทำการ = อธิบายไม่ได้ (ต้องให้คนไปดู)', holeR.unexplained.length === 1);
  t('บอกจำนวนแท่งที่ขาดหายไปด้วย', holeR.unexplained[0].missingBars === 27, JSON.stringify(holeR.unexplained[0]));

  const none = mk(['2026-08-05T02:00:00.000Z', '2026-08-05T02:15:00.000Z', '2026-08-05T02:30:00.000Z']);
  t('แท่งต่อเนื่องไม่ถูกนับเป็นช่องโหว่', analyzeGaps(none).total === 0);

  const cov = coverageOf(mk(['2026-08-03T00:00:00.000Z', '2026-08-04T00:00:00.000Z', '2026-08-05T00:00:00.000Z']));
  t('coverage บอกจำนวนวันที่ครอบคลุม', cov.spanDays === 2 && cov.bars === 3, JSON.stringify(cov));
  t('coverage ของชุดว่างไม่ระเบิด', coverageOf([]).bars === 0 && coverageOf([]).from === null);
}

// ═════════════════════════ 6. การดึงที่ล้ม ต้องล้มให้เห็น ═════════════════════════

console.log('── ดึงไม่สำเร็จต้องไม่เงียบ ──');
{
  const res = await fetchChart({
    retries: 0,
    delayMs: 0,
    fetchImpl: async () => ({ ok: false, status: 422, text: async () => 'The requested range must be within the last 30 days' }),
  });
  t('HTTP 422 = ตอบว่าไม่สำเร็จ ไม่ใช่คืนชุดว่าง', res.ok === false && /422/.test(res.error), JSON.stringify(res));

  const res2 = await fetchChart({
    retries: 0,
    delayMs: 0,
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    },
  });
  t('เครือข่ายล่ม = ตอบว่าไม่สำเร็จ', res2.ok === false && /ENOTFOUND/.test(res2.error));

  const res3 = await fetchChart({
    retries: 0,
    delayMs: 0,
    fetchImpl: async () => ({ ok: true, json: async () => ({ chart: { result: [], error: { code: 'Not Found' } } }) }),
  });
  t('ตอบ 200 แต่ไม่มี chart.result = ไม่สำเร็จ', res3.ok === false);
}

// ═════════════════════ 7. ต่อสายกับของจริง (ด่าน · workflow · gitignore) ═════════════════════

console.log('── ต่อสายกับของจริง ──');
{
  const src = readFileSync(path.join(ROOT, 'scripts', 'collect-15m.mjs'), 'utf8');
  t('ตัวเก็บโหลดด่านตรวจแท่งตัวจริงจาก src/lib/candle-sanitizer.ts',
    /loadSrcModules\(\['src\/lib\/candle-sanitizer\.ts'\]\)/.test(src));
  t('ตัวเก็บเรียก sanitizeCandles ก่อนคืนแท่ง', /sanitizeCandles\(mapped, MARKET\)/.test(src));
  // ถ้าวันไหนมีคนเขียนตรรกะซ่อมกรอบของตัวเองในตัวเก็บ ด่านจริงจะไม่ใช่ที่เดียวที่ตัดสินอีกต่อไป
  t('ตัวเก็บไม่มีตรรกะซ่อมกรอบของตัวเอง',
    !/Math\.(max|min)\(\s*c\.open/.test(src) && !/SPIKE_PCT/.test(src));
  t('ตัวเก็บยังชี้ไปที่ GC=F และไฟล์ GOLD__XAUUSD__15m.json',
    /'GC=F'/.test(src) && /GOLD__XAUUSD__15m\.json/.test(src));

  t('src/lib/market-data.ts ยังแปลง XAUUSD → GC=F', assertYahooSymbolStillMatches() === true);
}

{
  const gitignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  t('.gitignore ยกเว้นไฟล์ 15m ของทองไว้ให้ commit ได้',
    /^!\.research-cache\/candles\/GOLD__XAUUSD__15m\.json$/m.test(gitignore));
  t('.gitignore ยังกันแคชวิจัยที่เหลือ (176 MB) ไว้เหมือนเดิม',
    /^\.research-cache\/candles\/\*$/m.test(gitignore) && /^\.research-cache\/\*$/m.test(gitignore));
}

{
  const wfPath = path.join(ROOT, '.github', 'workflows', 'collect-15m.yml');
  t('มี workflow เก็บข้อมูลรายวัน', existsSync(wfPath));
  if (existsSync(wfPath)) {
    const wf = readFileSync(wfPath, 'utf8');
    t('workflow ขอสิทธิ์เขียน repo (ไม่งั้น commit กลับไม่ได้)', /permissions:\s*\n\s*contents:\s*write/.test(wf));
    t('workflow กดเองได้ด้วย (workflow_dispatch)', /workflow_dispatch:/.test(wf));
    t('workflow รันสคริปต์ตัวจริง', /node scripts\/collect-15m\.mjs/.test(wf));
    t('workflow commit ไฟล์แคชกลับเข้า repo', /git commit/.test(wf) && /GOLD__XAUUSD__15m\.json/.test(wf));
    t('workflow ไม่สร้าง commit เปล่า (เช็คก่อนว่ามีอะไรเปลี่ยนไหม)', /git status --porcelain/.test(wf));

    // เวลาที่เลือกต้องไม่ชนกับหน้าปัดของ workflow อื่น — ชนกันแล้วแย่ runner กันเอง
    const cron = /- cron: '([^']+)'/.exec(wf);
    t('มี cron รายวัน', cron !== null);
    if (cron) {
      const [minute, hour] = cron[1].split(/\s+/);
      const minutes = minute.split(',').map(Number);
      const hours = hour.split(',').map(Number);
      t('รันวันละครั้ง (นาทีเดียว ชั่วโมงเดียว)', minutes.length === 1 && hours.length === 1, cron[1]);
      t('ไม่ชนนาทีของ scan-universe (2,17,32,47 ทุกชั่วโมง)', !new Set([2, 17, 32, 47]).has(minutes[0]), cron[1]);
      t('ไม่ชนหน้าปัดของ fetch-news (นาทีที่ 5 ของชั่วโมง 0,4,8,12,16,20)',
        !(minutes[0] === 5 && new Set([0, 4, 8, 12, 16, 20]).has(hours[0])), cron[1]);
    }
  }
}

console.log('');
console.log(`ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail) process.exitCode = 1;
