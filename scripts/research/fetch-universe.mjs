#!/usr/bin/env node
/**
 * fetch-universe.mjs — คลังข้อมูลถาวรสำหรับงานวิจัยสัญญาณ
 *
 * วิธีรัน
 *   node scripts/research/fetch-universe.mjs                     ← ดึงทุกตัวที่ยังไม่มีใน cache
 *   node scripts/research/fetch-universe.mjs --refresh           ← ทิ้งของเก่า ดึงใหม่ทั้งหมด
 *   node scripts/research/fetch-universe.mjs --market=CRYPTO     ← เฉพาะตลาดเดียว
 *   node scripts/research/fetch-universe.mjs --symbol=AAPL       ← เฉพาะตัวเดียว
 *   node scripts/research/fetch-universe.mjs --timeframe=1D      ← เฉพาะกรอบเวลาเดียว
 *   node scripts/research/fetch-universe.mjs --report-only       ← ไม่ยิงเน็ต สร้างรายงานจาก cache ที่มี
 *   node scripts/research/fetch-universe.mjs --since=2005-01-01  ← จำกัดจุดเริ่มของ 1D
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไมต้องมีไฟล์นี้
 *   งานวิจัยที่ต้องทดสอบสมมติฐานหลายสิบแบบ ยิง Yahoo ใหม่ทุกครั้งไม่ได้ —
 *   ช้า โดน rate limit และที่แย่ที่สุดคือ "ข้อมูลขยับระหว่างการทดลอง"
 *   ทำให้เปรียบเทียบผลสองรอบไม่ได้ว่าต่างเพราะกลยุทธ์หรือเพราะข้อมูลคนละชุด
 *   cache นี้จึงเป็นฐานอ้างอิงเดียวที่ทุกการทดลองต้องยืนอยู่บน
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * สิ่งที่ค้นพบจากการยิง Yahoo v8 จริง (2026-08-17) — อย่าเชื่อเอกสาร ให้เชื่อตัวเลขนี้
 *
 *   1) range=max + interval=1d **ไม่ได้แท่งรายวัน**
 *      Yahoo ลดความละเอียดเงียบ ๆ แล้วตอบ meta.dataGranularity="3mo"
 *      AAPL ขอ max ได้แค่ 168 แท่ง (รายไตรมาส) แต่ขอด้วย period1=0 ได้ 11,510 แท่งรายวัน
 *      → 1D ต้องใช้ period1/period2 เท่านั้น และต้องตรวจ dataGranularity ทุกครั้ง
 *        (โค้ดข้างล่างถือว่า granularity ไม่ตรง = ข้อมูลใช้ไม่ได้ ทิ้งทันที ไม่เก็บลง cache)
 *
 *   2) 1h มีเพดานแข็งที่ 730 วัน — เกินกว่านั้น Yahoo ตอบ HTTP 422 ตรง ๆ
 *      "The requested range must be within the last 730 days"
 *      period1=now-730d ยัง 422 (ขอบพอดีเป๊ะไม่ผ่าน) แต่ range=730d ผ่าน
 *      → 1H จึงใช้ range=730d ไม่ใช่ period1/period2
 *
 *   3) ราคาใน indicators.quote[0] ถูก **ปรับ split ย้อนหลังแล้ว** แต่ไม่หักปันผล
 *      หลักฐาน: NVDA แตกพาร์ 10:1 วันที่ 2024-06-10 · แท่ง 2024-05-20 ให้ close = 94.78
 *      ซึ่งคือราคาจริงตอนนั้น (947.80) หารสิบแล้ว → ปรับให้แน่นอน ไม่มี gap ปลอมจาก split
 *      ส่วน adjclose ต่างออกไปเล็กน้อย (94.62) เพราะหักปันผลเพิ่ม
 *      → เลือกใช้ quote[0] เพราะ **ตรงกับที่ src/lib/market-data.ts ใช้ในระบบจริง**
 *        ถ้าเปลี่ยนไปใช้ adjclose งานวิจัยจะวัดคนละราคากับที่ระบบเห็นตอนรันจริง
 *        ราคาที่เหลือจึงยังมี dividend gap อยู่ (หุ้นปันผลสูงอย่าง KO/T จะเห็นชัดสุด)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * เรื่อง look-ahead
 *   ไฟล์นี้เก็บแท่งดิบเรียงตามเวลาเท่านั้น ไม่ normalize ไม่ scale ไม่คำนวณสถิติใด ๆ
 *   ลงไปในตัวแท่ง — เพราะสถิติที่คำนวณจากทั้งชุดคือ look-ahead ที่ซ่อนตัวเก่งที่สุด
 *   ตัวเลขสรุป (ผลตอบแทน/drawdown) ที่คำนวณในไฟล์นี้อยู่ใน **รายงานคุณภาพ** อย่างเดียว
 *   ไม่ถูกเขียนกลับลงในแท่ง และห้ามผู้บริโภคนำไปใช้ตัดสินใจซื้อขาย
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CACHE_DIR = path.join(ROOT, '.research-cache');
const CANDLE_DIR = path.join(CACHE_DIR, 'candles');
const UNIVERSE_PATH = path.join(HERE, 'universe.json');

/** ขึ้นเลขนี้เมื่อรูปแบบไฟล์ cache เปลี่ยน — ของเก่าจะถูกมองว่าใช้ไม่ได้แล้วดึงใหม่เอง */
const SCHEMA_VERSION = 1;

// ───────────────────────────────── อาร์กิวเมนต์ ─────────────────────────────────

function argValue(name) {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : null;
}
const argFlag = (name) => process.argv.includes(`--${name}`);

function fail(message) {
  console.error(`\n[ล้มเหลว] ${message}\n`);
  process.exit(1);
}

const OPT = {
  refresh: argFlag('refresh'),
  reportOnly: argFlag('report-only'),
  symbol: argValue('symbol'),
  market: argValue('market'),
  timeframe: argValue('timeframe'),
  since: argValue('since'),
  delayMs: Number(argValue('delay') ?? 700),
  maxRetries: Number(argValue('max-retries') ?? 4),
};

if (!Number.isFinite(OPT.delayMs) || OPT.delayMs < 0) fail('--delay ต้องเป็นตัวเลข >= 0');
if (!Number.isFinite(OPT.maxRetries) || OPT.maxRetries < 0) fail('--max-retries ต้องเป็นตัวเลข >= 0');

let sinceEpoch = 0;
if (OPT.since) {
  const t = Date.parse(`${OPT.since}T00:00:00Z`);
  if (!Number.isFinite(t)) fail(`--since ต้องเป็นวันที่รูปแบบ YYYY-MM-DD (ได้ "${OPT.since}")`);
  sinceEpoch = Math.floor(t / 1000);
}

/**
 * กรอบเวลาที่เก็บ — ผูกกับข้อจำกัดจริงของ Yahoo ที่ทดลองแล้ว (ดูหัวไฟล์)
 * 1D ใช้ period1/period2 เพราะ range=max ให้แท่งรายไตรมาส
 * 1H ใช้ range=730d เพราะเป็นเพดานแข็งของฝั่ง Yahoo และขอแบบ period แล้วโดน 422
 */
const TIMEFRAMES = {
  '1D': { interval: '1d', mode: 'period' },
  '1H': { interval: '1h', mode: 'range', range: '730d' },
};

let timeframes = Object.keys(TIMEFRAMES);
if (OPT.timeframe) {
  const tf = OPT.timeframe.toUpperCase();
  if (!TIMEFRAMES[tf]) fail(`ไม่รู้จัก timeframe "${OPT.timeframe}" — เลือกจาก ${Object.keys(TIMEFRAMES).join(', ')}`);
  timeframes = [tf];
}

// ─────────────── ดึง toYahooSymbol ออกจากไฟล์จริง ไม่ใช่ลอกมาวาง ───────────────

/**
 * ทำไมต้องดึงจาก src/lib/market-data.ts ไม่ใช่คัดลอกโค้ดมาไว้ที่นี่
 *   ถ้าลอกมาวาง วันหนึ่งระบบจริงเปลี่ยนวิธีแปลง (เช่น TH_STOCK ใช้ .BK เป็นอย่างอื่น)
 *   งานวิจัยจะยังดึงตัวเดิมเงียบ ๆ แล้วสรุปผลจากสินทรัพย์คนละตัวกับที่ระบบเทรดจริง
 *   ที่นี่จึง transpile ไฟล์จริงแล้ว import กลับ (วิธีเดียวกับ scripts/run-backtest.mjs)
 *   import ด้านบนของไฟล์นั้นถูกตัดทิ้งได้ เพราะ toYahooSymbol ไม่ได้ใช้ตัวไหนเลย
 *   ถ้าขั้นตอนนี้พัง = หยุดทั้งงาน ไม่มีทางสำรองที่ทำให้เพี้ยนแบบเงียบ ๆ
 */
async function loadYahooSymbolMapper() {
  const require = createRequire(import.meta.url);
  let typescript;
  try {
    typescript = require('typescript');
  } catch {
    fail('ไม่พบ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่');
  }

  const srcPath = path.join(ROOT, 'src', 'lib', 'market-data.ts');
  if (!existsSync(srcPath)) fail(`ไม่พบ ${srcPath} — ตัวแปลง symbol ต้องมาจากไฟล์จริงเท่านั้น`);

  const js = typescript.transpileModule(readFileSync(srcPath, 'utf8'), {
    fileName: 'market-data.ts',
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext,
    },
  }).outputText;

  // ตัดเฉพาะบรรทัด import ทิ้ง — ตัวที่ถูก import ไม่มีตัวไหนถูกใช้ใน toYahooSymbol
  // ฟังก์ชันอื่นในไฟล์ยังอ้างถึงอยู่ แต่ JS ไม่ตรวจตอนโหลดโมดูล และเราไม่เรียกมัน
  const stripped = js
    .split('\n')
    .filter((line) => !/^\s*import\s/.test(line))
    .join('\n');

  const tmpDir = path.join(tmpdir(), `research-mapper-${process.pid}`);
  mkdirSync(tmpDir, { recursive: true });
  const modPath = path.join(tmpDir, 'market-data.mjs');
  try {
    writeFileSync(modPath, stripped, 'utf8');
    const mod = await import(pathToFileURL(modPath).href);
    if (typeof mod.toYahooSymbol !== 'function') {
      fail('โหลด src/lib/market-data.ts แล้วไม่พบ toYahooSymbol — โครงไฟล์เปลี่ยนไป ต้องแก้สคริปต์นี้');
    }
    return mod.toYahooSymbol;
  } catch (err) {
    fail(`ดึง toYahooSymbol จาก src/lib/market-data.ts ไม่สำเร็จ: ${err?.message ?? err}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ───────────────────────────────── ตัวช่วยเล็ก ๆ ─────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (sec) => new Date(sec * 1000).toISOString();
const day = (v) => String(v).slice(0, 10);

/** ชื่อไฟล์ต้องปลอดภัยบน Windows — สัญลักษณ์อย่าง "PL=F" มีอักขระที่ไม่ควรฝากชะตาไว้ */
const safeName = (s) => s.replace(/[^A-Za-z0-9_-]/g, '_');
const cacheFileFor = (symbol, market, tf) =>
  path.join(CANDLE_DIR, `${safeName(market)}__${safeName(symbol)}__${safeName(tf)}.json`);

/** เขียนแบบ atomic — ถ้าถูกฆ่ากลางคัน ไฟล์จริงจะยังเป็นของเดิมที่สมบูรณ์ ไม่ใช่ครึ่ง ๆ กลาง ๆ */
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  renameSync(tmp, file);
}

function readJsonSafe(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null; // อ่านไม่ออก = ถือว่าไม่มี แล้วดึงใหม่ ดีกว่าเอาไฟล์พังไปวิจัย
  }
}

// ─────────────────────────────── ยิง Yahoo v8 ───────────────────────────────

const CHART_HOSTS = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart',
];

/** 404/422 = สัญลักษณ์ไม่มีจริง/ขอเกินเพดาน — ลองใหม่กี่ครั้งก็ไม่เปลี่ยน อย่าเสียเวลา */
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 422]);

/**
 * ยิงหนึ่งคำขอพร้อม retry แบบถอยเพิ่มเวลา
 * โดน rate limit (429) หรือฝั่งเซิร์ฟเวอร์พัง (5xx) = รอแล้วลองใหม่ ไม่ใช่ล้มทั้งงาน
 * สลับ host query1/query2 ทุกครั้งที่ลองใหม่ เผื่อโดนจำกัดเป็นราย host
 */
async function fetchChartRaw(yahooSymbol, qs) {
  let lastErr = 'ไม่ทราบสาเหตุ';

  for (let attempt = 0; attempt <= OPT.maxRetries; attempt++) {
    const host = CHART_HOSTS[attempt % CHART_HOSTS.length];
    const url = `${host}/${encodeURIComponent(yahooSymbol)}?${qs}`;

    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

      if (res.ok) {
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (result) return { ok: true, result };
        lastErr = `ตอบ 200 แต่ไม่มี chart.result — ${JSON.stringify(json?.chart?.error ?? json).slice(0, 160)}`;
        return { ok: false, permanent: true, error: lastErr };
      }

      const body = (await res.text()).slice(0, 200);
      if (PERMANENT_STATUS.has(res.status)) {
        return { ok: false, permanent: true, error: `HTTP ${res.status} — ${body}` };
      }
      lastErr = `HTTP ${res.status} — ${body}`;
    } catch (err) {
      lastErr = `เครือข่าย: ${err?.message ?? err}`;
    }

    if (attempt < OPT.maxRetries) {
      const backoff = OPT.delayMs * Math.pow(2, attempt + 1);
      console.log(`      ลองใหม่ครั้งที่ ${attempt + 1}/${OPT.maxRetries} ใน ${backoff}ms (${lastErr.slice(0, 80)})`);
      await sleep(backoff);
    }
  }

  return { ok: false, permanent: false, error: lastErr };
}

const INTERVAL_SECONDS = { '1d': 86400, '1h': 3600 };

/**
 * แท่งสุดท้ายที่ Yahoo ส่งมามัก "ยังไม่ปิด" — เป็นราคาสด ณ วินาทีที่ขอ
 * ถ้าเก็บไว้ ผลวิจัยจะเปลี่ยนทุกครั้งที่รันใหม่ ทั้งที่กลยุทธ์ไม่ได้เปลี่ยน — เทียบผลสองรอบไม่ได้อีก
 *
 * ตัวจับมีสามชั้น เพราะ Yahoo ประทับเวลาแท่งสดไม่เหมือนกันในแต่ละกรณี (ทดลองจริงแล้วทั้งหมด)
 *   1) บางครั้งประทับด้วยเวลาซื้อขายล่าสุดตรง ๆ จึงมีเศษวินาทีติดมา
 *   2) แท่งรายชั่วโมง: ถามง่าย ๆ ว่าชั่วโมงของแท่งนั้นผ่านไปครบหรือยัง
 *   3) แท่งรายวัน: ใช้หน้าต่าง 24 ชม. ตัดสินไม่ได้ เพราะตลาดส่วนใหญ่เปิดสั้นกว่าหนึ่งวัน
 *      (หุ้นไทยปิด 16:30 แต่แท่งของวันนั้นสมบูรณ์แล้วตั้งแต่ตอนปิด ไม่ต้องรอถึงเที่ยงคืน)
 *      จึงถาม "รอบซื้อขายปัจจุบัน" ของ Yahoo แทน — ถ้ารอบยังไม่จบและแท่งสุดท้ายอยู่ในรอบนั้น
 *      แปลว่ายังเขียนไม่เสร็จ · วัดจริงเมื่อ 2026-08-17 เวลา 11:29 UTC ได้ผลตามนี้
 *        GC=F     แท่ง 04:00 · รอบจบ 03:59 พรุ่งนี้ → ยังไม่ปิด ตัดทิ้ง
 *        BTC-USD  แท่ง 00:00 · รอบจบ 23:59 วันนี้   → ยังไม่ปิด ตัดทิ้ง
 *        PTT.BK   แท่ง 03:00 · รอบจบ 09:30 (ผ่านไปแล้ว) → ปิดแล้ว เก็บไว้
 *        AAPL     แท่งศุกร์ · รอบวันนี้ยังไม่เริ่ม → แท่งไม่ได้อยู่ในรอบ เก็บไว้
 */
function isPartialBar(tsSec, meta, interval, nowSec) {
  if (Number(meta?.regularMarketTime) === tsSec) return true;
  if (tsSec % 60 !== 0) return true;

  const intervalSec = INTERVAL_SECONDS[interval] ?? null;

  if (interval === '1h') return intervalSec !== null && nowSec < tsSec + intervalSec;

  const reg = meta?.currentTradingPeriod?.regular;
  if (reg && Number.isFinite(Number(reg.start)) && Number.isFinite(Number(reg.end))) {
    return nowSec < Number(reg.end) && tsSec >= Number(reg.start);
  }
  // ไม่มีข้อมูลรอบซื้อขาย = เดาไม่ได้ ใช้หน้าต่างของแท่งแบบระวังไว้ก่อน
  return intervalSec !== null && nowSec < tsSec + intervalSec;
}

/**
 * ดึงชุดข้อมูลหนึ่งชุด (symbol × timeframe) แล้วคืนวัตถุพร้อมเขียนลง cache
 * ไม่แตะดิสก์เอง — ให้ผู้เรียกตัดสินใจว่าจะเก็บไหม
 */
async function fetchDataset(entry, tf, toYahooSymbol) {
  const spec = TIMEFRAMES[tf];
  const yahooSymbol = toYahooSymbol(entry.symbol, entry.market);
  const nowSec = Math.floor(Date.now() / 1000);

  const qs =
    spec.mode === 'range'
      ? `interval=${spec.interval}&range=${spec.range}&events=div%2Csplit`
      : `interval=${spec.interval}&period1=${sinceEpoch}&period2=${nowSec}&events=div%2Csplit`;

  const res = await fetchChartRaw(yahooSymbol, qs);
  if (!res.ok) return { ok: false, permanent: res.permanent, error: res.error, yahooSymbol };

  const result = res.result;
  const meta = result.meta ?? {};

  // ด่านสำคัญที่สุดของไฟล์นี้: Yahoo ลดความละเอียดเงียบ ๆ ได้ (range=max → 3mo)
  // ถ้าปล่อยผ่าน งานวิจัยจะรันแท่งรายไตรมาสโดยเข้าใจว่าเป็นรายวัน
  if (meta.dataGranularity && meta.dataGranularity !== spec.interval) {
    return {
      ok: false,
      permanent: true,
      yahooSymbol,
      error: `Yahoo ลดความละเอียดเงียบ ๆ — ขอ interval=${spec.interval} แต่ได้ dataGranularity=${meta.dataGranularity}`,
    };
  }

  const timestamps = result.timestamp ?? [];
  const ohlc = result.indicators?.quote?.[0];
  if (!ohlc || timestamps.length === 0) {
    return { ok: false, permanent: true, yahooSymbol, error: 'ตอบสำเร็จแต่ไม่มีแท่งเลย (timestamp ว่าง)' };
  }

  // ── ประกอบแท่งดิบ เก็บทุกแท่งไว้ก่อน เพื่อให้ตรวจคุณภาพเห็นของเสียครบ ────────
  const raw = timestamps.map((ts, i) => ({
    ts,
    timestamp: iso(ts),
    open: ohlc.open?.[i] ?? null,
    high: ohlc.high?.[i] ?? null,
    low: ohlc.low?.[i] ?? null,
    close: ohlc.close?.[i] ?? null,
    volume: ohlc.volume?.[i] ?? 0,
  }));

  // ── ตัดแท่งสด (ยังไม่ปิด) ออกจากท้าย ─────────────────────────────────────
  let partialDropped = null;
  if (raw.length > 0 && isPartialBar(raw[raw.length - 1].ts, meta, spec.interval, nowSec)) {
    const p = raw.pop();
    partialDropped = { timestamp: p.timestamp, close: p.close };
  }

  const splits = Object.values(result.events?.splits ?? {}).map((s) => ({
    date: iso(s.date),
    ratio: s.splitRatio ?? `${s.numerator}:${s.denominator}`,
    factor: Number(s.numerator) / Number(s.denominator),
  }));
  const dividendCount = Object.keys(result.events?.dividends ?? {}).length;

  // ── ทิ้งเฉพาะแท่งที่ "ตีความไม่ได้เลย" แล้วนับไว้ทุกใบ ไม่มีการทิ้งแบบเงียบ ๆ ──
  //  1) ราคาไม่ใช่จำนวนบวกจำกัด — Yahoo เติมช่องว่างของตาราง 1h ด้วย null เป็นเรื่องปกติ
  //     (ระบบจริงกรองแค่ close > 0 ซึ่งปล่อยให้ open/high/low เป็น 0 หลุดเข้าไปได้
  //      ที่นี่เข้มกว่า เพราะแท่งที่มี 0 ปนจะกลายเป็น "edge" ปลอมทันทีในผลวิจัย)
  //  2) high < low — แท่งที่ขัดกับนิยามของตัวเอง ใช้คำนวณอะไรก็ได้ผลไร้ความหมาย
  //     ต่างจากกรณี open/close หลุดกรอบ ซึ่งยังเหลือราคาที่ตีความได้ จึงเก็บไว้แล้วรายงานแทน
  let nullOrNaN = 0;
  let highLowInverted = 0;
  const clean = [];
  for (const c of raw) {
    if (!['open', 'high', 'low', 'close'].every((k) => Number.isFinite(c[k]) && c[k] > 0)) {
      nullOrNaN++;
      continue;
    }
    if (c.high < c.low) {
      highLowInverted++;
      continue;
    }
    clean.push(c);
  }
  clean.sort((a, b) => a.ts - b.ts);

  const { candles, paddedDropped } = sanitizeCandles(
    clean.map((c) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: Number.isFinite(c.volume) ? c.volume : 0,
    }))
  );

  if (candles.length === 0) {
    return { ok: false, permanent: true, yahooSymbol, error: 'ไม่เหลือแท่งที่ใช้ได้หลังกรองราคาเสีย' };
  }

  return {
    ok: true,
    dataset: {
      schemaVersion: SCHEMA_VERSION,
      symbol: entry.symbol,
      market: entry.market,
      name: entry.name ?? meta.shortName ?? entry.symbol,
      yahooSymbol,
      yahooName: meta.longName ?? meta.shortName ?? null,
      timeframe: tf,
      interval: spec.interval,
      fetchedAt: new Date().toISOString(),
      request: spec.mode === 'range' ? { mode: 'range', range: spec.range } : { mode: 'period', period1: iso(sinceEpoch), period2: iso(nowSec) },

      // "ช่วงที่ได้จริง" ไม่ใช่ "ช่วงที่ขอไป" — ต่างกันเสมอ และตัวที่ต้องรายงานคืออันนี้
      actualFrom: candles[0].timestamp,
      actualTo: candles[candles.length - 1].timestamp,
      bars: candles.length,

      exchangeTimezone: meta.exchangeTimezoneName ?? null,
      firstTradeDate: meta.firstTradeDate ? iso(meta.firstTradeDate) : null,

      priceBasis: 'indicators.quote[0] — ปรับ split ย้อนหลังแล้ว ไม่ได้หักปันผล (ชุดเดียวกับที่ src/lib/market-data.ts ใช้จริง)',
      splits,
      dividendCount,

      // ข้อเท็จจริงที่รู้ได้เฉพาะตอนดึง — แท่งที่ถูกทิ้งไปแล้วกู้คืนจากไฟล์ไม่ได้ จึงต้องบันทึกไว้
      fetchIssues: {
        rawBars: raw.length + (partialDropped ? 1 : 0),
        nullOrNaN,
        highLowInverted,
        // ต้องเก็บถาวร ไม่ใช่คำนวณใหม่ตอนทำรายงาน เพราะแท่งพวกนี้ถูกลบไปแล้ว
        // นับใหม่รอบสองจะได้ศูนย์เสมอ แล้วรายงานจะโกหกว่า "ไม่เคยมีแท่งปลอม"
        paddedNonTrading: paddedDropped,
        partialBarDropped: partialDropped,
      },

      // quality ถูกคำนวณใหม่ทุกครั้งที่สร้างรายงาน (ดู analyze) จึงไม่ใส่ตอนนี้
      candles,
    },
  };
}

// ──────────────────────────── ตรวจคุณภาพข้อมูล ────────────────────────────

/**
 * เกณฑ์ช่องว่างของวันที่ — ต้องรู้จักตลาดถึงจะตัดสินได้
 * คริปโตเทรดทุกวัน ช่องว่างเกิน 2 วัน = ข้อมูลหายแน่นอน
 * ตลาดอื่นหยุดเสาร์อาทิตย์ + วันหยุดนักขัตฤกษ์ ต้องเผื่อถึง 5 วันก่อนจะเรียกว่าผิดปกติ
 */
const GAP_DAY_THRESHOLD = { CRYPTO: 2, GOLD: 5, FOREX: 5, TH_STOCK: 5, US_STOCK: 5 };

/**
 * เดาว่าช่องว่างนี้น่าจะเป็นวันหยุดยาวไหม — เป็นแค่ "ใบ้" ให้คนอ่านไปตรวจต่อ ไม่ใช่คำตัดสิน
 * ปลายธันวา-ต้นมกราคือหยุดยาวเกือบทุกตลาด · กลางเมษาคือสงกรานต์ของตลาดไทย
 */
function holidayHint(fromISO, toISO, market) {
  const spanDays = [];
  const a = new Date(fromISO).getTime();
  const b = new Date(toISO).getTime();
  for (let t = a; t <= b; t += 86400000) {
    const d = new Date(t);
    spanDays.push({ m: d.getUTCMonth() + 1, d: d.getUTCDate() });
  }
  const yearEnd = spanDays.some((x) => (x.m === 12 && x.d >= 23) || (x.m === 1 && x.d <= 3));
  const songkran = market === 'TH_STOCK' && spanDays.some((x) => x.m === 4 && x.d >= 12 && x.d <= 16);
  if (yearEnd) return 'น่าจะหยุดสิ้นปี';
  if (songkran) return 'น่าจะหยุดสงกรานต์';
  return 'อธิบายไม่ได้';
}

/**
 * เกณฑ์ตัดสินว่า "ยุคหนึ่งของข้อมูลใช้ไม่ได้"
 *
 * ทำไมต้องมีเรื่องนี้ — จากการวัดจริงบน GC=F รายวัน:
 *   แท่งปี 2003-2008 มี open/close หลุดออกนอกกรอบ high-low ของตัวเองถึงปีละ 50-90 แท่ง
 *   ตัวหนักสุดคือ 2006-06-30 ที่ open = 560.90 แต่ low ของแท่งเดียวกันคือ 609 (ต่ำกว่ากรอบ 8%)
 *   แท่งแบบนี้ทำให้ backtest "เข้าไม้ที่ราคาที่ไม่เคยมีจริง" แล้วสร้าง edge ปลอมขึ้นมา
 *   และช่วงเดียวกันยังมีแท่ง high == low (ไม่ขยับเลยทั้งวัน) มากถึง 48% ของปี 2005
 *   หลังปี 2011 ปัญหาทั้งสองอย่างหายไปเกือบหมด — แปลว่าเป็นปัญหา "ยุคเก่าของ feed" ไม่ใช่ทั้งชุด
 *
 * จึงไม่ทิ้งทั้ง symbol และไม่กลบปัญหา แต่หา "ปีที่เริ่มเชื่อได้" แล้วรายงานออกมา
 * ให้ชั้นวิจัยตัดช่วงเก่าทิ้งเองได้ โดยยังเก็บแท่งดิบไว้ครบเพื่อให้ตรวจซ้ำได้เสมอ
 */
/**
 * 3% มาจากช่องว่างที่วัดได้จริงระหว่าง "feed เพี้ยนเป็นระบบ" กับ "feed บางเป็นครั้งคราว"
 *   GC=F ยุคเสีย (2003-2008): แท่งหลุดกรอบปีละ 21-35% — เพี้ยนเป็นระบบชัดเจน
 *   USDTHB ปีล่าสุด: 1-2.5% (ไม่กี่แท่งต่อปี) — ตลาดบาง ไม่ใช่ข้อมูลพัง
 * ตั้งไว้ต่ำกว่านี้จะเหวี่ยงจนคู่เงินรองโดนตีตกทั้งที่ใช้ได้
 */
const ERA_MAX_OOR_RATE = 0.03;

/**
 * เส้นแบ่งแท่ง flat ตั้งจากการกระจายจริงของจักรวาลนี้ (อัตราสูงสุดต่อปีตั้งแต่ 2021)
 *   53 จาก 58 ตัว = 0%    ← หุ้นและคริปโตไม่มีปัญหานี้เลย
 *   HG=F 4.52% · XAUUSD 5.6%   ← ตลาดบางบางวัน แต่ยังซื้อขายจริง (แท่งพวกนี้มีวอลุ่ม)
 *   XAGUSD 15.97%              ← หนึ่งในหกวันไม่ขยับเลย เริ่มไม่ใช่การซื้อขายปกติ
 *   PL=F 57.45% · PA=F 75.16%  ← แทบไม่มีการซื้อขาย บางวันวอลุ่ม 2-4 สัญญา
 * ช่องว่างธรรมชาติอยู่ระหว่าง 5.6% กับ 15.97% จึงตัดที่ 10%
 * ผลคือทองกับทองแดงใช้ได้เต็มประวัติ ส่วนเงิน/แพลตินัม/แพลเลเดียมถูกตีตกอย่างตรงไปตรงมา
 * (ตั้งไว้ที่ 5% จะทำให้ทอง — สินทรัพย์หลักที่เจ้าของเทรด — เหลือใช้แค่ 407 แท่ง ทั้งที่ข้อมูลไม่ได้พัง)
 */
const ERA_MAX_FLAT_RATE = { '1D': 0.10, '1H': 0.15 };

/** ปีที่มีแท่งน้อยเกินไปตัดสินไม่ได้ (ปีแรกที่เพิ่งเข้าตลาด / ปีปัจจุบันที่ยังไม่จบ) */
const ERA_MIN_BARS_TO_JUDGE = 50;

/**
 * เส้นแบ่ง "ผิดจริง" กับ "เศษปัดของ feed" — วัดจากข้อมูลจริง ไม่ได้ตั้งลอย ๆ
 *   EURUSD รายวัน: แท่งที่หลุดกรอบ 127 จาก 5,891 แท่ง แต่ p50 = 0.0108% (ประมาณ 1 pip)
 *     และมีแค่ 6 แท่งที่เกิน 0.1% — คือ open/close มาจาก tick คนละชุดกับ high/low เฉย ๆ
 *     ไม่ใช่ข้อมูลเสีย และเล็กกว่าระยะ SL ที่คิดจาก ATR หลายร้อยเท่า
 *   ต่างจาก GC=F ยุค 2003-2008 ที่ p50 = 0.30% และหนักสุด 7.84% — คนละขนาดกันสามสิบเท่า
 * จึงนับเฉพาะที่เกิน 0.1% เข้าเกณฑ์ตัดยุค ส่วนตัวเลขดิบยังรายงานครบเหมือนเดิม
 */
const OOR_MATERIAL_REL = 0.001;

/** ราคาที่ open/close หลุดออกนอกกรอบ high-low ของแท่งตัวเอง — คืนขนาดความผิดเทียบราคาปิด */
function oorMagnitude(c) {
  const hi = Math.max(c.open, c.close);
  const lo = Math.min(c.open, c.close);
  if (c.high >= hi && c.low <= lo) return 0;
  return Math.max((hi - c.high) / c.close, (c.low - lo) / c.close, 0);
}

/**
 * แท่งที่ Yahoo "เติม" ในวันที่ตลาดไม่ได้เปิด — ราคาทั้งสี่ค่าเท่ากันหมดและไม่มีวอลุ่ม
 *
 * วัดจริงบน CPALL รายวัน: แท่งที่ high == low มี 126 แท่ง ในนั้น 102 แท่งวอลุ่มเป็นศูนย์
 * และปี 2024 ปีเดียวมี 48 แท่ง วอลุ่มศูนย์ทั้งหมด = วันหยุดตลาดไทยที่ Yahoo เติมราคาปิดเดิมลงไป
 * แท่งพวกนี้ไม่เคยเกิดขึ้นจริง ถ้าปล่อยไว้จะทำให้ ATR ต่ำเกินจริง สร้างรูปแบบ doji ปลอม
 * และเปิดช่องให้ backtest เข้าไม้ในวันที่ตลาดปิด
 *
 * ส่วนแท่งที่ high == low แต่มีวอลุ่ม (CPALL มี 24 แท่ง) คือวันที่ซื้อขายจริงที่ราคาไม่ขยับ
 * เช่นชนเพดาน/พื้นราคา — อันนั้นของจริง เก็บไว้
 */
function isPaddedNonTradingBar(c) {
  return c.open === c.high && c.high === c.low && c.low === c.close && (!Number.isFinite(c.volume) || c.volume === 0);
}

/**
 * กรองแท่งเติมออก — ใช้ทั้งตอนดึงและตอนสร้างรายงาน จึงมีตรรกะชุดเดียว
 * ทำซ้ำได้ไม่มีผลข้างเคียง (รอบสองไม่เหลืออะไรให้ตัด)
 */
function sanitizeCandles(candles) {
  const kept = [];
  let paddedDropped = 0;
  for (const c of candles) {
    if (isPaddedNonTradingBar(c)) paddedDropped++;
    else kept.push(c);
  }
  return { candles: kept, paddedDropped };
}

/**
 * ตรวจแท่งที่เก็บลง cache แล้ว — คำนวณใหม่ทุกครั้งที่สร้างรายงาน
 * แยกจาก fetchIssues โดยตั้งใจ: ของพวกนี้ derive จากแท่งที่มีได้เสมอ
 * จึงแก้เกณฑ์แล้วรันซ้ำด้วย --report-only ได้ ไม่ต้องยิง Yahoo ใหม่
 * ทุกตัวเลขที่คืนคือของที่นับได้จริงจากข้อมูล ไม่มีการประมาณ
 */
function analyze(candles, market, tf, splits, fetchIssues) {
  const q = {
    bars: candles.length,
    nullOrNaNDropped: fetchIssues?.nullOrNaN ?? 0,
    highLowInvertedDropped: fetchIssues?.highLowInverted ?? 0,
    paddedBarsDropped: fetchIssues?.paddedNonTrading ?? 0,
    ohlcOutOfRange: 0,
    ohlcOutOfRangeMaterial: 0,
    oorMedianRelErrPct: null,
    oorMaxRelErrPct: null,
    flatBars: 0,
    zeroVolumeBars: 0,
    duplicateTimestamps: 0,
    outOfOrderTimestamps: 0,
    bigGaps: [],
    bigGapCount: 0,
    bigGapsOnSplitDate: 0,
    dateGaps: [],
    dateGapCount: 0,
    dateGapUnexplained: 0,
  };

  /**
   * ตรวจ "split ที่ไม่ได้ปรับ" ต้องดูขนาดด้วย ไม่ใช่แค่วันตรงกัน
   *
   * ถ้าราคาไม่ถูกปรับ แท่งวันแตกพาร์ 10:1 จะเปิดที่ประมาณหนึ่งในสิบของราคาปิดเมื่อวาน (-90%)
   * เทียบกับ BDMS ที่เคยถูกตีว่าผิด: วันแตกพาร์ 10:1 ปี 2004 ราคากลับ +43.1% (อัตราส่วน 1.43)
   * ห่างจาก 0.1 คนละเรื่อง — แปลว่าราคาถูกปรับแล้ว ส่วนที่กระโดดคือการเคลื่อนไหวจริงของวันนั้น
   * เช็กแบบเดิม (แค่วันตรงกัน) จึงตีตกชุดข้อมูลที่ใช้ได้ทิ้งฟรี ๆ
   */
  const splitByDay = new Map(splits.map((s) => [day(s.date), s]));
  const looksUnadjustedSplit = (dayKey, ratio) => {
    const s = splitByDay.get(dayKey);
    if (!s || !Number.isFinite(s.factor) || s.factor <= 0) return false;
    const expected = 1 / s.factor;
    return Math.abs(ratio - expected) <= expected * 0.25;
  };
  const perYear = new Map();
  const oorErrs = [];

  const seen = new Set();
  let prevTs = null;
  let prevClose = null;

  for (const c of candles) {
    const ts = Math.floor(new Date(c.timestamp).getTime() / 1000);
    const year = c.timestamp.slice(0, 4);
    if (!perYear.has(year)) perYear.set(year, { year, bars: 0, oor: 0, flat: 0 });
    const yb = perYear.get(year);
    yb.bars++;

    const err = oorMagnitude(c);
    if (err > 0) {
      q.ohlcOutOfRange++;
      oorErrs.push(err);
      // เกณฑ์ตัดยุคนับเฉพาะที่ผิดจริง ไม่ใช่เศษปัดระดับ pip ของตลาดค่าเงิน
      if (err > OOR_MATERIAL_REL) {
        q.ohlcOutOfRangeMaterial++;
        yb.oor++;
      }
    }
    // high == low ทั้งแท่ง = ไม่ขยับเลย มักแปลว่า feed เติมราคาแทนการซื้อขายจริง
    if (c.high === c.low) {
      q.flatBars++;
      yb.flat++;
    }
    if (!Number.isFinite(c.volume) || c.volume === 0) q.zeroVolumeBars++;

    if (seen.has(ts)) q.duplicateTimestamps++;
    seen.add(ts);
    if (prevTs !== null && ts < prevTs) q.outOfOrderTimestamps++;

    // ── gap ราคาเกิน 20% — อาจเป็น split ที่ไม่ได้ปรับ หรือเหตุการณ์จริง ─────────
    if (prevClose !== null && prevClose > 0) {
      const pct = (c.open / prevClose - 1) * 100;
      if (Math.abs(pct) > 20) {
        q.bigGapCount++;
        const dayKey = day(c.timestamp);
        const onSplit = splitByDay.has(dayKey);
        const unadjusted = onSplit && looksUnadjustedSplit(dayKey, c.open / prevClose);
        if (unadjusted) q.bigGapsOnSplitDate++;
        if (q.bigGaps.length < 8) {
          q.bigGaps.push({
            at: c.timestamp,
            pct: Number(pct.toFixed(2)),
            prevClose,
            open: c.open,
            onSplitDate: onSplit,
            looksUnadjusted: unadjusted,
          });
        }
      }
    }

    // ── ช่องว่างของวันที่ ───────────────────────────────────────────────────
    if (prevTs !== null) {
      const gapDays = (ts - prevTs) / 86400;
      const threshold = GAP_DAY_THRESHOLD[market] ?? 5;
      if (gapDays > threshold) {
        q.dateGapCount++;
        const hint = holidayHint(iso(prevTs), c.timestamp, market);
        if (hint === 'อธิบายไม่ได้') q.dateGapUnexplained++;
        if (q.dateGaps.length < 8) {
          q.dateGaps.push({ from: iso(prevTs), to: c.timestamp, days: Number(gapDays.toFixed(2)), hint });
        }
      }
    }

    prevTs = ts;
    prevClose = c.close;
  }

  if (oorErrs.length > 0) {
    oorErrs.sort((a, b) => a - b);
    q.oorMedianRelErrPct = Number((oorErrs[Math.floor(oorErrs.length / 2)] * 100).toFixed(4));
    q.oorMaxRelErrPct = Number((oorErrs[oorErrs.length - 1] * 100).toFixed(4));
  }

  // ── หา "ปีที่เริ่มเชื่อได้" — เดินจากปีล่าสุดถอยหลัง หยุดที่ปีแรกที่ตก ───────────
  const years = [...perYear.values()].sort((a, b) => a.year.localeCompare(b.year));
  const flatLimit = ERA_MAX_FLAT_RATE[tf] ?? 0.05;
  let startIdx = 0;
  for (let i = years.length - 1; i >= 0; i--) {
    const y = years[i];
    // ปีที่ตัวอย่างน้อยเกินไปให้ผ่านไปก่อน — ตัดสินจากไม่กี่แท่งคือเสียงรบกวน ไม่ใช่หลักฐาน
    if (y.bars < ERA_MIN_BARS_TO_JUDGE) continue;
    const ok = y.oor / y.bars <= ERA_MAX_OOR_RATE && y.flat / y.bars <= flatLimit;
    if (!ok) {
      startIdx = i + 1;
      break;
    }
  }
  q.perYear = years.map((y) => ({
    year: y.year,
    bars: y.bars,
    oorRatePct: Number(((y.oor / y.bars) * 100).toFixed(2)),
    flatRatePct: Number(((y.flat / y.bars) * 100).toFixed(2)),
  }));

  // ถ้าแม้แต่ปีล่าสุดยังไม่ผ่านเกณฑ์ แปลว่าหา "ยุคที่เชื่อได้" ไม่เจอเลย
  // กรณีนี้ห้ามตัดให้เหลือปีเดียวแบบเงียบ ๆ (จะกลายเป็นซ่อนปัญหา) — เก็บไว้ทั้งหมดแล้วตีตรา bad
  q.noUsableEra = startIdx >= years.length;
  const usableYear = q.noUsableEra ? years[0]?.year ?? null : years[startIdx]?.year ?? null;
  const usable = usableYear === null ? candles : candles.filter((c) => c.timestamp.slice(0, 4) >= usableYear);
  q.trimmedEarlyEra = !q.noUsableEra && startIdx > 0;
  q.usable = {
    fromYear: usableYear,
    from: usable.length ? usable[0].timestamp : null,
    to: usable.length ? usable[usable.length - 1].timestamp : null,
    bars: usable.length,
    droppedByTrim: candles.length - usable.length,
  };

  // ── ภาพรวมทิศทางราคา ใช้ตรวจ survivorship bias ของทั้งจักรวาล ────────────────
  // คิดบนช่วงที่เชื่อได้เท่านั้น เพราะราคายุคเสียจะทำให้ผลตอบแทนเพี้ยน
  //
  // หมายเหตุสำคัญ: ตัวเลขกลุ่มนี้ใช้ "บรรยายชุดข้อมูล" ในรายงานเท่านั้น
  // ไม่ถูกเขียนกลับลงในแท่ง และห้ามป้อนเข้ากระบวนการตัดสินใจซื้อขาย
  // เพราะมันคำนวณจากทั้งชุด (รู้อนาคต) — ใช้ตอนวิจัยเมื่อไรคือ look-ahead ทันที
  const closes = usable.map((c) => c.close);
  if (closes.length >= 2) {
    q.returnPct = Number(((closes[closes.length - 1] / closes[0] - 1) * 100).toFixed(2));

    // ผลตอบแทนตลอด 25 ปีบอกอะไรไม่ได้เรื่อง regime — เกือบทุกอย่างขึ้นถ้ามองยาวพอ
    // ช่วง 5 ปีล่าสุดเป็นหน้าต่างที่ทุกชุดมีร่วมกัน และเป็นตัวชี้ว่าจักรวาลนี้มีขาลงจริงไหม
    const lastTs = new Date(usable[usable.length - 1].timestamp).getTime();
    const cutoff = new Date(lastTs - 5 * 365.25 * 86400000).toISOString();
    const win = usable.filter((c) => c.timestamp >= cutoff);
    q.returnPct5y =
      win.length >= 2 ? Number(((win[win.length - 1].close / win[0].close - 1) * 100).toFixed(2)) : null;
    q.covers5y = win.length >= 2 && usable[0].timestamp <= cutoff;

    let peak = closes[0];
    let mdd = 0;
    for (const v of closes) {
      if (v > peak) peak = v;
      const dd = (v / peak - 1) * 100;
      if (dd < mdd) mdd = dd;
    }
    q.maxDrawdownPct = Number(mdd.toFixed(2));
  } else {
    q.returnPct = null;
    q.returnPct5y = null;
    q.covers5y = false;
    q.maxDrawdownPct = null;
  }

  // ── คำตัดสิน ───────────────────────────────────────────────────────────
  // bad  = ใช้ไม่ได้ทั้งชุด แม้ตัดยุคเก่าทิ้งแล้ว
  // warn = ใช้ได้ถ้าเคารพ usable.fromYear หรือมีเรื่องที่คนต้องดูก่อนเชื่อ
  const fatal =
    q.duplicateTimestamps > 0 ||
    q.outOfOrderTimestamps > 0 ||
    q.bigGapsOnSplitDate > 0 ||
    q.noUsableEra ||
    q.usable.bars < 200;

  if (fatal) q.verdict = 'bad';
  else if (q.trimmedEarlyEra || q.bigGapCount > 0 || q.dateGapUnexplained > 0) q.verdict = 'warn';
  else q.verdict = 'clean';

  return q;
}

// ──────────────────────────────── รายงาน ────────────────────────────────

function buildReport(datasets, failures) {
  const now = new Date().toISOString();
  const totalBars = datasets.reduce((s, d) => s + d.bars, 0);

  const byVerdict = { clean: 0, warn: 0, bad: 0 };
  for (const d of datasets) byVerdict[d.quality.verdict] = (byVerdict[d.quality.verdict] ?? 0) + 1;

  // ตรวจ survivorship bias ด้วยตัวเลขจริง ไม่ใช่ความรู้สึกตอนเลือก symbol
  const daily = datasets.filter((d) => d.timeframe === '1D' && Number.isFinite(d.quality.returnPct));
  const up = daily.filter((d) => d.quality.returnPct > 20).length;
  const down = daily.filter((d) => d.quality.returnPct < -20).length;
  const flat = daily.length - up - down;

  const d5 = datasets.filter((d) => d.timeframe === '1D' && d.quality.covers5y && Number.isFinite(d.quality.returnPct5y));
  const up5 = d5.filter((d) => d.quality.returnPct5y > 20).length;
  const down5 = d5.filter((d) => d.quality.returnPct5y < -20).length;
  const flat5 = d5.length - up5 - down5;
  const worst5 = [...d5]
    .sort((a, b) => a.quality.returnPct5y - b.quality.returnPct5y)
    .slice(0, 8)
    .map((d) => `${d.symbol} ${d.quality.returnPct5y}%`);

  const json = {
    generatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    source: 'Yahoo Finance v8 chart API',
    priceBasis: 'indicators.quote[0] — ปรับ split ย้อนหลังแล้ว ไม่หักปันผล',
    totals: {
      datasets: datasets.length,
      symbols: new Set(datasets.map((d) => `${d.market}:${d.symbol}`)).size,
      bars: totalBars,
      failures: failures.length,
      droppedNullOrNaN: datasets.reduce((s, d) => s + (d.fetchIssues?.nullOrNaN ?? 0), 0),
      droppedHighLowInverted: datasets.reduce((s, d) => s + (d.fetchIssues?.highLowInverted ?? 0), 0),
      droppedPaddedNonTrading: datasets.reduce((s, d) => s + (d.fetchIssues?.paddedNonTrading ?? 0), 0),
      droppedPartialBars: datasets.filter((d) => d.fetchIssues?.partialBarDropped).length,
    },
    verdictCounts: byVerdict,
    regimeAudit: {
      note: 'ไว้ตรวจว่าจักรวาลไม่ได้มีแต่ตัวที่ขึ้น — ตัวเลข 5 ปีเชื่อถือได้กว่า เพราะช่วงยาว 20-40 ปีอะไรก็ขึ้นหมด',
      fullHistory: { dailyDatasets: daily.length, upOver20pct: up, downOver20pct: down, inBetween: flat },
      last5Years: { dailyDatasets: d5.length, upOver20pct: up5, downOver20pct: down5, inBetween: flat5 },
      worst5Years: worst5,
    },
    trimAdvice: {
      note: 'ชุดที่ trimmedEarlyEra = true มีข้อมูลยุคเก่าที่เชื่อไม่ได้ — งานวิจัยควรเริ่มที่ usable.from ไม่ใช่ actualFrom',
      datasetsNeedingTrim: datasets.filter((d) => d.quality.trimmedEarlyEra).length,
      barsBeforeTrim: totalBars,
      barsAfterTrim: datasets.reduce((s, d) => s + d.quality.usable.bars, 0),
    },
    failures,
    datasets: datasets.map((d) => ({
      symbol: d.symbol,
      market: d.market,
      yahooSymbol: d.yahooSymbol,
      timeframe: d.timeframe,
      bars: d.bars,
      from: d.actualFrom,
      to: d.actualTo,
      splits: d.splits.length,
      dividends: d.dividendCount,
      fetchIssues: d.fetchIssues,
      quality: d.quality,
    })),
  };

  // ── ฉบับคนอ่าน ────────────────────────────────────────────────────────
  const L = [];
  L.push('รายงานคุณภาพข้อมูลคลังวิจัย (.research-cache)');
  L.push(`สร้างเมื่อ ${now}`);
  L.push('');
  L.push('แหล่งข้อมูล: Yahoo Finance v8 chart API');
  L.push('ฐานราคา: indicators.quote[0] = ราคาที่ปรับ split ย้อนหลังแล้ว แต่ยังไม่หักปันผล');
  L.push('  เลือกชุดนี้เพราะเป็นชุดเดียวกับที่ src/lib/market-data.ts ใช้ในระบบจริง');
  L.push('  ผลคือไม่มี gap ปลอมจากการแตกพาร์ แต่ยังมี gap จากวันขึ้นเครื่องหมาย XD ของหุ้นปันผล');
  L.push('');
  L.push(`ชุดข้อมูลทั้งหมด ${datasets.length} ชุด · ${json.totals.symbols} สัญลักษณ์ · รวม ${totalBars.toLocaleString('en-US')} แท่ง`);
  L.push(`คำตัดสิน: clean ${byVerdict.clean} · warn ${byVerdict.warn} · bad ${byVerdict.bad}`);
  L.push('');
  L.push('แท่งที่ถูกคัดออกก่อนเก็บ (ไม่ได้อยู่ในตัวเลขข้างบน)');
  L.push(`  ราคาเป็น null/NaN/<=0        : ${json.totals.droppedNullOrNaN.toLocaleString('en-US')} แท่ง`);
  L.push('    ส่วนใหญ่คือช่องว่างของตาราง 1h ที่ Yahoo เติม null ตอนตลาดปิด — เป็นเรื่องปกติ');
  L.push(`  high < low (แท่งขัดตัวเอง)   : ${json.totals.droppedHighLowInverted.toLocaleString('en-US')} แท่ง`);
  L.push(`  วันที่ตลาดไม่ได้เปิดแต่ถูกเติม : ${json.totals.droppedPaddedNonTrading.toLocaleString('en-US')} แท่ง`);
  L.push('    ราคาสี่ค่าเท่ากันหมดและวอลุ่มเป็นศูนย์ = Yahoo เติมราคาปิดเดิมลงในวันหยุด');
  L.push('    ถ้าปล่อยไว้จะทำให้ ATR ต่ำกว่าจริง เกิดรูปแบบ doji ปลอม และเปิดช่องให้เข้าไม้ในวันที่ตลาดปิด');
  L.push(`  แท่งสดที่ยังไม่ปิด            : ${json.totals.droppedPartialBars} ชุดที่ถูกตัดแท่งท้ายออก`);
  L.push('');
  L.push('ตรวจ survivorship bias (จาก 1D)');
  L.push(`  ตลอดประวัติ (${daily.length} ตัว) : ขึ้น>20% ${up} · ลง>20% ${down} · ระหว่างนั้น ${flat}`);
  L.push(`  5 ปีล่าสุด  (${d5.length} ตัว) : ขึ้น>20% ${up5} · ลง>20% ${down5} · ระหว่างนั้น ${flat5}`);
  L.push('  ให้ดูบรรทัด 5 ปีเป็นหลัก — ช่วง 20-40 ปีเกือบทุกสินทรัพย์ขึ้นหมดจากเงินเฟ้อกับการเติบโตระยะยาว');
  L.push('  ตัวเลขนั้นจึงบอกไม่ได้ว่าชุดข้อมูลมีตลาดขาลงให้ทดสอบจริงหรือเปล่า');
  if (worst5.length > 0) L.push(`  ตัวที่ลงหนักสุดใน 5 ปี: ${worst5.join(' · ')}`);
  L.push('  ถ้าตัวเลข "ลง" ในบรรทัด 5 ปีเป็นศูนย์เมื่อไร แปลว่าวัดได้แค่ตลาดขาขึ้น อย่าเชื่อผลวิจัย');
  L.push('');

  if (failures.length > 0) {
    L.push(`ดึงไม่สำเร็จ ${failures.length} ชุด — ต้องรู้ ไม่ใช่ปล่อยเงียบ:`);
    for (const f of failures) {
      L.push(`  - ${f.symbol} (${f.market}) ${f.timeframe} [${f.yahooSymbol ?? '?'}] : ${f.error}`);
    }
    L.push('');
  }

  const needTrim = datasets.filter((d) => d.quality.trimmedEarlyEra);
  if (needTrim.length > 0) {
    L.push(`ต้องตัดข้อมูลยุคเก่าทิ้ง ${needTrim.length} ชุด — งานวิจัยต้องเริ่มที่คอลัมน์ USABLE ไม่ใช่ FROM`);
    L.push(`  รวมแท่งก่อนตัด ${totalBars.toLocaleString('en-US')} → หลังตัด ${json.trimAdvice.barsAfterTrim.toLocaleString('en-US')}`);
    L.push('  เหตุผล: ยุคเก่าของบาง feed มีแท่งที่ open/close หลุดนอกกรอบ high-low ของตัวเอง');
    L.push('  และแท่งที่ไม่ขยับเลยทั้งวัน — สองอย่างนี้ทำให้ backtest เข้าไม้ที่ราคาที่ไม่เคยมีจริง');
    L.push('');
  }

  L.push('ต่อชุดข้อมูล');
  L.push('');
  const hdr = ['SYMBOL', 'MKT', 'TF', 'BARS', 'FROM', 'TO', 'USABLE', 'U-BARS', 'DROP', 'OOR', 'FLAT', 'GAP>20%', 'DATEGAP', 'VERDICT'];
  const rows = datasets.map((d) => {
    const q = d.quality;
    const fi = d.fetchIssues ?? {};
    return [
      d.symbol,
      d.market,
      d.timeframe,
      String(d.bars),
      day(d.actualFrom),
      day(d.actualTo),
      q.trimmedEarlyEra ? q.usable.fromYear : '-',
      String(q.usable.bars),
      String((fi.nullOrNaN ?? 0) + (fi.highLowInverted ?? 0)),
      String(q.ohlcOutOfRange),
      String(q.flatBars),
      String(q.bigGapCount),
      `${q.dateGapCount}(${q.dateGapUnexplained})`,
      q.verdict,
    ];
  });
  const widths = hdr.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  L.push(line(hdr));
  L.push(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) L.push(line(r));
  L.push('');
  L.push('FROM/TO = ช่วงวันที่ที่ได้มาจริง (ไม่ใช่ช่วงที่ขอไป)');
  L.push('USABLE  = ปีแรกที่ข้อมูลเชื่อได้ · "-" แปลว่าเชื่อได้ตั้งแต่แท่งแรก');
  L.push('U-BARS  = จำนวนแท่งที่เหลือถ้าตัดยุคเก่าทิ้ง — ตัวเลขนี้คือขนาดกลุ่มตัวอย่างจริงของงานวิจัย');
  L.push('DROP    = แท่งที่ถูกทิ้งตอนดึง เพราะราคาเป็น null/NaN/<=0 หรือ high < low');
  L.push('          (1H ของสัญญาซื้อขายล่วงหน้ามีเยอะเป็นปกติ เพราะ Yahoo เติม null ในช่องที่ตลาดปิด)');
  L.push('OOR     = แท่งที่ open หรือ close หลุดออกนอกกรอบ high-low ของตัวเอง — แท่งที่เป็นไปไม่ได้จริง');
  L.push('          ยังเก็บไว้ในไฟล์ (ไม่ทิ้ง) เพราะมันกระจุกอยู่ในยุคเก่า ให้ใช้ USABLE ตัดแทน');
  L.push('          ขนาดความผิดพลาดดูได้จาก oorMedianRelErrPct / oorMaxRelErrPct ใน quality-report.json');
  L.push('FLAT    = แท่งที่ high == low ทั้งแท่ง (ไม่มีการเคลื่อนไหว มักคือ feed เติมราคาแทนการซื้อขายจริง)');
  L.push('GAP>20% = ราคาเปิดกระโดดจากราคาปิดก่อนหน้าเกิน 20%');
  L.push('          ถ้าไม่เป็นศูนย์ ต้องไปดูใน quality-report.json ว่าเป็นเหตุการณ์จริงหรือ split ที่ไม่ได้ปรับ');
  L.push('          ตัวชี้ขาดคือ bigGapsOnSplitDate — ถ้ามากกว่าศูนย์แปลว่าราคาไม่ได้ถูกปรับ ห้ามใช้ชุดนั้น');
  L.push('DATEGAP = ช่องว่างวันที่เกินเกณฑ์ตลาด (คริปโต 2 วัน ตลาดอื่น 5 วัน)');
  L.push('          ในวงเล็บคือจำนวนที่เดาไม่ออกว่าเป็นวันหยุดอะไร = ควรสงสัยว่าข้อมูลหาย');
  L.push('          หมายเหตุ: ตัวเดาวันหยุดรู้จักแค่สิ้นปีกับสงกรานต์ ของจริงที่ถูกตีว่า "อธิบายไม่ได้"');
  L.push('          อาจเป็นเหตุการณ์จริง เช่น ตลาดสหรัฐปิด 4 วันหลัง 11 กันยายน 2001');
  L.push('VERDICT = bad คือใช้ไม่ได้แม้ตัดยุคเก่าแล้ว · warn คือใช้ได้แต่ต้องเคารพ USABLE · clean คือไม่พบปัญหา');
  L.push('');
  L.push('ข้อจำกัดที่ต้องติดไปกับทุกผลวิจัยที่ใช้ชุดนี้');
  L.push('  1) ยังมี survivorship bias เหลืออยู่ — Yahoo ลบสัญลักษณ์ที่ออกจากกระดานทิ้ง');
  L.push('     (ตัวอย่างจริง: WBA ถูกซื้อออกจากตลาดปี 2025 แล้ว v8 ตอบ 404) ของที่ "ตายไปแล้ว"');
  L.push('     จึงไม่มีทางอยู่ในชุดนี้ ผลจริงในอดีตย่อมแย่กว่าที่วัดได้เล็กน้อยเสมอ');
  L.push('  2) 1H ย้อนได้แค่ 730 วัน เป็นเพดานแข็งของ Yahoo — งานวิจัยบน 1H จึงเห็นตลาดแค่ยุคเดียว');
  L.push('  3) ราคายังไม่หักปันผล หุ้นปันผลสูงจะมี gap ลงเล็ก ๆ ทุกครั้งที่ขึ้นเครื่องหมาย XD');
  L.push('  4) แท่งเป็น OHLC จึงไม่รู้ลำดับราคาภายในแท่ง — ข้อจำกัดนี้ตกทอดไปถึงทุก backtest');
  L.push('  5) แท่งสดที่ยังไม่ปิดถูกตัดออกแล้ว เพื่อให้รันซ้ำได้ผลเดิม');

  return { json, text: L.join('\n') };
}

// ─────────────────────────────────── main ───────────────────────────────────

function loadCachedDatasets() {
  if (!existsSync(CANDLE_DIR)) return [];
  return readdirSync(CANDLE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const d = readJsonSafe(path.join(CANDLE_DIR, f));
      return d ? { ...d, __file: path.join(CANDLE_DIR, f) } : null;
    })
    .filter((d) => d && d.schemaVersion === SCHEMA_VERSION && Array.isArray(d.candles) && d.candles.length > 0);
}

function dirSizeBytes(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    total += st.isDirectory() ? dirSizeBytes(p) : st.size;
  }
  return total;
}

/**
 * คำนวณ quality ใหม่จากแท่งที่เก็บไว้ แล้วเขียนกลับลงไฟล์ cache
 * ทำแบบนี้เพื่อให้มีทางเดียวที่สร้าง quality — แก้เกณฑ์แล้วรัน --report-only ก็ได้ของใหม่ทั้งชุด
 * โดยไม่ต้องยิง Yahoo ซ้ำ (แท่งดิบไม่เปลี่ยน เปลี่ยนแค่วิธีมอง)
 */
function writeReport(datasets, failures) {
  for (const d of datasets) {
    // กรองแท่งเติมซ้ำอีกครั้ง เผื่อไฟล์มาจากรอบดึงก่อนหน้าที่ยังไม่มีตัวกรองนี้
    const { candles, paddedDropped } = sanitizeCandles(d.candles);
    d.candles = candles;
    d.bars = candles.length;
    d.actualFrom = candles[0].timestamp;
    d.actualTo = candles[candles.length - 1].timestamp;

    // สะสมยอด ไม่ใช่ทับ — ไฟล์จากรอบดึงเก่าอาจเพิ่งถูกกรองในรอบนี้เป็นครั้งแรก
    d.fetchIssues = d.fetchIssues ?? {};
    d.fetchIssues.paddedNonTrading = (d.fetchIssues.paddedNonTrading ?? 0) + paddedDropped;

    d.quality = analyze(d.candles, d.market, d.timeframe, d.splits ?? [], d.fetchIssues);

    if (d.__file) {
      const { __file, ...rest } = d;
      writeJsonAtomic(__file, rest);
    }
  }

  datasets.sort((a, b) =>
    a.market.localeCompare(b.market) || a.symbol.localeCompare(b.symbol) || a.timeframe.localeCompare(b.timeframe)
  );
  const { json, text } = buildReport(datasets, failures);
  writeJsonAtomic(path.join(CACHE_DIR, 'quality-report.json'), json);
  writeFileSync(path.join(CACHE_DIR, 'quality-report.txt'), text, 'utf8');
  return json;
}

async function main() {
  mkdirSync(CANDLE_DIR, { recursive: true });

  const universe = readJsonSafe(UNIVERSE_PATH);
  if (!universe?.groups) fail(`อ่าน ${UNIVERSE_PATH} ไม่ได้ หรือไม่มีช่อง groups`);

  let entries = universe.groups.flatMap((g) =>
    g.symbols.map((s) => ({ symbol: s.symbol, market: g.market, name: s.name, role: s.role }))
  );

  if (OPT.market) {
    const m = OPT.market.toUpperCase();
    entries = entries.filter((e) => e.market === m);
    if (entries.length === 0) fail(`ไม่มีสัญลักษณ์ในตลาด "${OPT.market}" ใน universe.json`);
  }
  if (OPT.symbol) {
    const s = OPT.symbol.toUpperCase();
    entries = entries.filter((e) => e.symbol.toUpperCase() === s);
    if (entries.length === 0) fail(`ไม่พบสัญลักษณ์ "${OPT.symbol}" ใน universe.json`);
  }

  // ── โหมดสร้างรายงานอย่างเดียว: ไม่แตะเน็ตเลย ──────────────────────────────
  if (OPT.reportOnly) {
    const cached = loadCachedDatasets();
    if (cached.length === 0) fail('ไม่มีข้อมูลใน cache ให้ทำรายงาน — รันแบบปกติก่อน');
    const json = writeReport(cached, []);
    console.log(`สร้างรายงานจาก cache แล้ว: ${json.totals.datasets} ชุด · ${json.totals.bars.toLocaleString('en-US')} แท่ง`);
    console.log(`  ${path.join(CACHE_DIR, 'quality-report.txt')}`);
    return;
  }

  const toYahooSymbol = await loadYahooSymbolMapper();

  const jobs = [];
  for (const e of entries) for (const tf of timeframes) jobs.push({ entry: e, tf });

  console.log('คลังข้อมูลวิจัย — ดึงจาก Yahoo Finance v8');
  console.log(`สัญลักษณ์ ${entries.length} ตัว × กรอบเวลา ${timeframes.join(',')} = ${jobs.length} ชุด`);
  console.log(`โหมด: ${OPT.refresh ? 'refresh (ดึงใหม่ทั้งหมด)' : 'resume (ข้ามชุดที่มีใน cache แล้ว)'}`);
  console.log(`เว้นจังหวะ ${OPT.delayMs}ms · retry สูงสุด ${OPT.maxRetries} ครั้ง`);
  console.log('');

  const failures = [];
  let fetched = 0;
  let skipped = 0;
  let index = 0;

  for (const job of jobs) {
    index++;
    const { entry, tf } = job;
    const file = cacheFileFor(entry.symbol, entry.market, tf);
    const tag = `[${String(index).padStart(3)}/${jobs.length}] ${entry.symbol} ${entry.market} ${tf}`;

    // ── ทนต่อการถูกขัดจังหวะ: ของที่เก็บครบแล้วข้ามไปเลย ไม่ยิงซ้ำ ──────────
    if (!OPT.refresh && existsSync(file)) {
      const cached = readJsonSafe(file);
      if (cached && cached.schemaVersion === SCHEMA_VERSION && Array.isArray(cached.candles) && cached.candles.length > 0) {
        console.log(`${tag} — มีใน cache แล้ว (${cached.bars} แท่ง) ข้าม`);
        skipped++;
        continue;
      }
    }

    process.stdout.write(`${tag} — ดึง ... `);
    const res = await fetchDataset(entry, tf, toYahooSymbol);

    if (!res.ok) {
      console.log(`ไม่สำเร็จ: ${res.error}`);
      failures.push({
        symbol: entry.symbol,
        market: entry.market,
        timeframe: tf,
        yahooSymbol: res.yahooSymbol,
        error: res.error,
        permanent: !!res.permanent,
      });
      await sleep(OPT.delayMs);
      continue;
    }

    writeJsonAtomic(file, res.dataset);
    const d = res.dataset;
    const dropped = d.fetchIssues.nullOrNaN + d.fetchIssues.highLowInverted;
    console.log(`${d.bars} แท่ง ${day(d.actualFrom)} → ${day(d.actualTo)}${dropped > 0 ? ` (ทิ้งแท่งเสีย ${dropped})` : ''}`);
    fetched++;
    await sleep(OPT.delayMs);
  }

  // ── รายงานทำจาก cache ทั้งหมดที่มี ไม่ใช่แค่รอบนี้ เพื่อให้รันต่อจากที่ค้างได้ ──
  const all = loadCachedDatasets();
  const json = writeReport(all, failures);

  const bytes = dirSizeBytes(CACHE_DIR);
  console.log('');
  console.log('─────────────────────────────────────────────');
  console.log(`ดึงใหม่รอบนี้ ${fetched} ชุด · ข้ามเพราะมีแล้ว ${skipped} ชุด · ล้มเหลว ${failures.length} ชุด`);
  console.log(`cache ทั้งหมด: ${json.totals.datasets} ชุด · ${json.totals.symbols} สัญลักษณ์ · ${json.totals.bars.toLocaleString('en-US')} แท่ง`);
  console.log(`ขนาด .research-cache: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`คุณภาพ: clean ${json.verdictCounts.clean ?? 0} · warn ${json.verdictCounts.warn ?? 0} · bad ${json.verdictCounts.bad ?? 0}`);
  console.log(`รายงาน: ${path.join(CACHE_DIR, 'quality-report.txt')}`);

  if (failures.length > 0) {
    console.log('');
    console.log('ชุดที่ดึงไม่ได้ (บันทึกไว้ในรายงานแล้ว):');
    for (const f of failures) console.log(`  - ${f.symbol} ${f.market} ${f.timeframe}: ${f.error.slice(0, 120)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
