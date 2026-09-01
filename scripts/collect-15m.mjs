#!/usr/bin/env node
/**
 * collect-15m.mjs — เก็บแท่ง 15 นาทีของทอง (GC=F) สะสมวันต่อวัน ลงไฟล์เดียวใน .research-cache
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไมต้องมีไฟล์นี้ (ปัญหาที่มันแก้ — และปัญหาที่มันแก้ไม่ได้)
 *
 *   Yahoo ให้แท่ง 15m ย้อนหลังได้ **สูงสุด 1 เดือน** (ขอ 2mo ขึ้นไปตอบ Unprocessable Entity)
 *   หนึ่งเดือนแบ่ง train / validation / test ไม่ได้ → เลน 15m จึงไม่มีทางถูกตรวจสอบ
 *   นอกตัวอย่างได้เลย ทุกคำตอบเรื่อง 15m จะอ่อนตลอดไป เว้นแต่เราจะเริ่มเก็บเอง
 *   เก็บวันนี้ อีก 3 เดือนก็มี 3 เดือน อีกปีก็มีปี — ไฟล์นี้คือการเริ่มนับหนึ่ง
 *
 *   ⚠ สิ่งที่ไฟล์นี้ **ไม่ได้** ทำ: มันไม่ได้ทำให้เลน 15m ทำกำไร และไม่ได้เป็นหลักฐานว่าจะทำ
 *   ผลวิจัยที่มีอยู่ (บน 1H ซึ่งข้อมูลยาวพอจะวัดได้จริง) คือ ขอบดิบ +0.0064 R ต้นทุน 0.0948 R
 *   → สุทธิ −0.0884 R · ทุกกฎติดลบครบ 21/21 ช่อง · ไม่มีเทคนิคไหนรอด Holm สักตัว
 *   TF ที่เล็กลงมีแต่จะทำให้ "ต้นทุนต่อไม้" ใหญ่ขึ้นเมื่อเทียบกับระยะที่ราคาเดินได้
 *   ไฟล์นี้จึงเปลี่ยนแค่สถานะเดียว: จาก "วัดไม่ได้เลย" เป็น "อีกหลายเดือนค่อยวัดได้"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * กติกาที่ยึด
 *
 *   1. **ด่านตรวจแท่งต้องเป็นตัวเดียวกับระบบจริง** — โหลด src/lib/candle-sanitizer.ts
 *      ตัวจริงผ่าน scripts/research/load-src-modules.mjs ไม่มีตรรกะซ่อมแท่งของตัวเอง
 *      แม้แต่บรรทัดเดียว ถ้าเขียนใหม่แล้วมันเพี้ยนไปนิดเดียว คลังที่สะสมทั้งปีจะเป็นคนละ
 *      ชุดกับที่เครื่องยนต์เห็นตอนรันจริง แล้วไม่มีใครรู้ตัว
 *      ทางเดินของแท่งลอกจาก src/lib/market-data.ts (fetchChart) ทีละขั้น:
 *        map ด้วย `?? 0` → filter close > 0 → sanitizeCandles(_, market)
 *
 *   2. **ผสานแบบสะสม ห้ามลบ** — คีย์คือ timestamp · แท่งใหม่ทับแท่งเดิม timestamp เดียวกัน
 *      (Yahoo แก้ค่าย้อนหลังได้) · เรียงเวลาเสมอ · ห้ามมี timestamp ซ้ำ
 *      ข้อจำกัดที่รู้และยอมรับ: แท่งที่เป็น "แท่งสุดท้าย" ของหน้าต่างรอบหนึ่ง จะได้รับการยกเว้น
 *      จากกฎ spike ของด่าน (แท่งสุดท้ายไม่มีเพื่อนบ้านขวาให้เทียบ) พอรอบถัดไปมันกลายเป็น
 *      แท่งกลางแล้วโดนด่านทิ้ง เราก็ยังไม่ลบมันออกจากไฟล์ เพราะการลบทำให้ "ข้อมูลหาย
 *      เพราะดึงพลาดครั้งเดียว" เป็นไปได้ — เลือกเก็บของที่อาจเสียหนึ่งแท่ง ดีกว่าเสี่ยงลบของจริง
 *
 *   3. **ไม่มีอะไรเปลี่ยน = ไม่เขียนไฟล์** — ไม่ต่อ fetchedAt ใหม่ทับของเดิมทั้งที่แท่งเท่าเดิม
 *      เพราะไฟล์นี้ถูก commit กลับเข้า repo ทุกวัน (ดู .github/workflows/collect-15m.yml)
 *      ถ้าหัวไฟล์ขยับทุกรอบ เราจะได้ commit เปล่าวันละใบตลอดไป
 *      → หัวไฟล์เป็นฟังก์ชันของ "ข้อมูล" ไม่ใช่ของ "จำนวนครั้งที่เรายิง Yahoo"
 *
 *   4. **ดึงไม่สำเร็จ = exit code != 0** เพื่อให้ GitHub Actions ขึ้นแดงให้เห็น
 *      ความเงียบที่ดูเหมือนสำเร็จคือสิ่งเดียวที่จะทำให้คลังนี้ว่างเปล่าโดยไม่มีใครรู้
 *
 * วิธีรัน
 *   node scripts/collect-15m.mjs              ← ดึง ผสาน เขียนไฟล์ รายงานเป็นภาษาไทย
 *   node scripts/collect-15m.mjs --dry-run    ← ทำทุกอย่างยกเว้นเขียนไฟล์
 *   node scripts/collect-15m.mjs --json       ← รายงานเป็น JSON บรรทัดเดียว (ให้เครื่องอ่าน)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadSrcModules } from './research/load-src-modules.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_FILE = path.join(ROOT, '.research-cache', 'candles', 'GOLD__XAUUSD__15m.json');

/** เท่ากับไฟล์อื่นในโฟลเดอร์เดียวกัน — ผู้อ่านชุดเดิม (rule-lab, diagnose) จึงอ่านไฟล์นี้ได้ทันที */
const SCHEMA_VERSION = 1;

const MARKET = 'GOLD';
const SYMBOL = 'XAUUSD';
const NAME = 'Gold Futures';
/**
 * ฮาร์ดโค้ดได้เพราะจักรวาลเหลือทองตัวเดียว — แต่ต้องไม่เพี้ยนจาก toYahooSymbol ของจริง
 * จึงมี assertYahooSymbolStillMatches() คอยอ่าน src/lib/market-data.ts มายืนยันทุกรอบ
 */
const YAHOO_SYMBOL = 'GC=F';
const TIMEFRAME = '15m';
const INTERVAL = '15m';
/** เพดานแข็งของ Yahoo — ขอมากกว่านี้ตอบ 422 (นี่คือเหตุผลทั้งหมดที่ไฟล์นี้ต้องมีอยู่) */
const RANGE = '1mo';

const BAR_MS = 15 * 60 * 1000;
const BAR_SEC = 900;

const CHART_HOSTS = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart',
];

/** สถานะที่ลองใหม่กี่ครั้งก็ได้คำตอบเดิม — อย่าเสียเวลา (ลอกเกณฑ์จาก fetch-universe.mjs) */
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 422]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoOf = (ms) => new Date(ms).toISOString();

// ═══════════════════════════════ อ่านไฟล์สะสมเดิม ═══════════════════════════════

const barLooksReadable = (c) =>
  c !== null &&
  typeof c === 'object' &&
  Number.isFinite(Date.parse(c.timestamp)) &&
  ['open', 'high', 'low', 'close'].every((k) => Number.isFinite(c[k]) && c[k] > 0);

/**
 * อ่านไฟล์สะสมเดิมแบบ "พังยังไงก็ต้องเดินต่อได้"
 *
 * ทำไมไม่โยน error ทิ้งงาน: ถ้าไฟล์เดิมเสีย (ดิสก์เต็มกลางคัน · merge conflict ค้าง)
 * แล้วสคริปต์ตายทุกรอบ เราจะหยุดเก็บข้อมูลไปเรื่อย ๆ จนกว่าจะมีคนสังเกต — ซึ่งคือ
 * ความเสียหายที่ใหญ่กว่าไฟล์เดิมเสียเสียอีก จึงเริ่มนับหนึ่งใหม่ **แต่ต้องเสียงดัง**
 * และผู้เรียกต้องสำรองไฟล์เดิมไว้ก่อนเขียนทับเสมอ (ดู backupBroken ใน main)
 */
export function loadExisting(file) {
  const empty = { candles: [], header: null, rawText: null, broken: false, unreadableBars: 0 };
  if (!existsSync(file)) return { ...empty, state: 'ยังไม่มีไฟล์สะสม — รอบนี้คือรอบแรก' };

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    return { ...empty, broken: true, state: `อ่านไฟล์สะสมเดิมไม่ได้ (${err?.message ?? err})` };
  }

  if (text.trim() === '') {
    return { ...empty, rawText: text, broken: true, state: 'ไฟล์สะสมเดิมว่างเปล่า' };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ...empty, rawText: text, broken: true, state: `ไฟล์สะสมเดิม JSON พัง (${String(err?.message ?? err).slice(0, 60)})` };
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.candles)) {
    return { ...empty, rawText: text, broken: true, state: 'ไฟล์สะสมเดิมไม่มีอาร์เรย์ candles' };
  }

  // แท่งที่อ่านไม่ออกในไฟล์เดิมถูกตัดทิ้งแล้วนับไว้ — ปล่อยผ่านไปจะทำให้ผู้อ่านชั้นถัดไป
  // (rule-lab บังคับ timestamp เรียงและ parse ได้) ระเบิดทีหลังโดยไม่รู้ว่ามาจากไหน
  const candles = [];
  let unreadableBars = 0;
  for (const c of parsed.candles) {
    if (!barLooksReadable(c)) {
      unreadableBars++;
      continue;
    }
    candles.push(normalizeBar(c));
  }
  candles.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return {
    candles,
    header: parsed,
    rawText: text,
    broken: false,
    unreadableBars,
    state: unreadableBars > 0 ? `อ่านไฟล์สะสมเดิมได้ แต่ตัดแท่งที่อ่านไม่ออกทิ้ง ${unreadableBars} แท่ง` : 'อ่านไฟล์สะสมเดิมได้',
  };
}

/** รูปแท่งเดียวกับไฟล์อื่นในแคชเป๊ะ ๆ — ลำดับคีย์ก็ต้องเท่ากัน เพราะเราเทียบข้อความไฟล์ตรง ๆ */
function normalizeBar(c) {
  return {
    timestamp: new Date(Date.parse(c.timestamp)).toISOString(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: Number.isFinite(c.volume) ? c.volume : 0,
  };
}

// ═════════════════════════════════ ยิง Yahoo ═════════════════════════════════

/**
 * ยิงหนึ่งคำขอพร้อม retry แบบถอยเพิ่มเวลา สลับ host ทุกครั้ง (เผื่อโดนจำกัดเป็นราย host)
 * คืน { ok, result } หรือ { ok:false, error } — ไม่ process.exit เองเพื่อให้เทสต์เรียกได้
 */
export async function fetchChart({ retries = 3, delayMs = 800, fetchImpl = fetch } = {}) {
  const qs = `interval=${INTERVAL}&range=${RANGE}&events=div%2Csplit`;
  let lastErr = 'ไม่ทราบสาเหตุ';

  for (let attempt = 0; attempt <= retries; attempt++) {
    const host = CHART_HOSTS[attempt % CHART_HOSTS.length];
    const url = `${host}/${encodeURIComponent(YAHOO_SYMBOL)}?${qs}`;
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (result) return { ok: true, result };
        return { ok: false, error: `ตอบ 200 แต่ไม่มี chart.result — ${JSON.stringify(json?.chart?.error ?? json).slice(0, 160)}` };
      }
      const body = (await res.text()).slice(0, 200);
      if (PERMANENT_STATUS.has(res.status)) return { ok: false, error: `HTTP ${res.status} — ${body}` };
      lastErr = `HTTP ${res.status} — ${body}`;
    } catch (err) {
      lastErr = `เครือข่าย: ${err?.message ?? err}`;
    }

    if (attempt < retries) {
      const backoff = delayMs * Math.pow(2, attempt);
      console.error(`   ลองใหม่ครั้งที่ ${attempt + 1}/${retries} ใน ${backoff}ms (${lastErr.slice(0, 90)})`);
      await sleep(backoff);
    }
  }
  return { ok: false, error: lastErr };
}

// ══════════════════════════ แปลงคำตอบ Yahoo เป็นแท่ง ══════════════════════════

/**
 * แกะ chart.result เป็นแท่งที่ "ปิดแล้ว" อย่างเดียว แล้วส่งผ่านด่านตรวจแท่งตัวจริง
 *
 * จุดที่ต่างจาก src/lib/market-data.ts อย่างตั้งใจมีข้อเดียว: **ตัดแท่งที่ยังไม่ปิดทิ้ง**
 *   ระบบจริงต้องการแท่งสดเพื่อดูราคาปัจจุบัน แต่คลังวิจัยต้องการของที่ไม่ขยับอีกแล้ว
 *   ถ้าเก็บแท่งสด ผลวิจัยจะเปลี่ยนทุกครั้งที่ดึงใหม่ ทั้งที่กลยุทธ์ไม่ได้เปลี่ยน
 *   ตัวจับมีสองชั้น (วัดจากคำตอบจริงเมื่อ 2026-09-01):
 *     1) Yahoo ประทับแท่งสดด้วยเวลาซื้อขายล่าสุดตรง ๆ จึงมีเศษวินาทีติดมา (ts % 60 != 0)
 *        ของจริงที่เจอ: แท่งท้ายสุดคือ 05:31:18Z ขณะที่แท่งก่อนหน้าเป็น 05:30:00Z
 *     2) แท่งที่ยังปิดไม่ครบคาบ: now < ts + 15 นาที — ข้อนี้จำเป็นเพราะแท่ง 05:30:00Z
 *        ในตัวอย่างข้างบนก็ยังไม่ปิดเหมือนกัน ตัดแค่แท่งท้ายสุดใบเดียวจึงไม่พอ
 */
export function parseChart(result, nowMs, sanitizeCandles) {
  const meta = result?.meta ?? {};

  // ด่านสำคัญที่สุดของการดึง: Yahoo ลดความละเอียดเงียบ ๆ ได้ (เคยเจอ range=max → 3mo)
  // ถ้าปล่อยผ่าน คลังจะมีแท่งคนละคาบปนกันโดยไม่มี error ให้ใครเห็น
  if (meta.dataGranularity && meta.dataGranularity !== INTERVAL) {
    throw new Error(`Yahoo ลดความละเอียดเงียบ ๆ — ขอ interval=${INTERVAL} แต่ได้ dataGranularity=${meta.dataGranularity}`);
  }

  const timestamps = result?.timestamp ?? [];
  const ohlc = result?.indicators?.quote?.[0];
  if (!ohlc || timestamps.length === 0) {
    throw new Error('ตอบสำเร็จแต่ไม่มีแท่งเลย (timestamp ว่าง)');
  }

  const nowSec = Math.floor(nowMs / 1000);
  const rawBars = timestamps.length;
  let unclosedDropped = 0;
  let nullOrNaN = 0;

  // ── ขั้นที่ 1: ตัดแท่งที่ยังไม่ปิด ────────────────────────────────────────
  const closed = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = Number(timestamps[i]);
    if (!Number.isFinite(ts)) {
      nullOrNaN++;
      continue;
    }
    if (ts % 60 !== 0 || nowSec < ts + BAR_SEC || Number(meta.regularMarketTime) === ts) {
      unclosedDropped++;
      continue;
    }
    closed.push({ ts, i });
  }

  // ── ขั้นที่ 2: ประกอบแท่งแบบเดียวกับ fetchChart ของจริงเป๊ะ ๆ ──────────────
  // `?? 0` แล้วกรอง close > 0 คือสิ่งที่ระบบจริงทำ — ช่องว่างที่ Yahoo เติม null
  // (วัดจริง 471 จาก 2,432 แท่งในหน้าต่างหนึ่งเดือน) หลุดออกตรงนี้
  const mapped = [];
  for (const { ts, i } of closed) {
    const bar = {
      timestamp: isoOf(ts * 1000),
      open: ohlc.open?.[i] ?? 0,
      high: ohlc.high?.[i] ?? 0,
      low: ohlc.low?.[i] ?? 0,
      close: ohlc.close?.[i] ?? 0,
      volume: ohlc.volume?.[i] ?? 0,
    };
    if (!(bar.close > 0)) {
      nullOrNaN++;
      continue;
    }
    mapped.push(bar);
  }

  // ── ขั้นที่ 3: เรียงเวลา ก่อนเข้าด่าน ──────────────────────────────────────
  // ด่านตัดสิน spike จาก "แท่งที่รอดล่าสุด" ลำดับจึงเป็นส่วนหนึ่งของคำตอบ ไม่ใช่เรื่องความสวยงาม
  // Yahoo เรียงมาให้อยู่แล้วทุกครั้งที่วัด — ถ้าวันไหนไม่เรียง ต้องเห็นตัวเลขนี้ ไม่ใช่เงียบ
  let outOfOrderFromSource = 0;
  for (let i = 1; i < mapped.length; i++) {
    if (Date.parse(mapped[i].timestamp) < Date.parse(mapped[i - 1].timestamp)) outOfOrderFromSource++;
  }
  mapped.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  // ── ขั้นที่ 4: ด่านตรวจแท่งตัวจริงจาก src/lib/candle-sanitizer.ts ──────────
  const { candles, dropped, repaired } = sanitizeCandles(mapped, MARKET);

  return {
    candles: candles.map(normalizeBar),
    meta,
    // สัญญาทองไม่มีแตกพาร์/ปันผลอยู่แล้ว แต่เก็บของจริงที่ Yahoo ส่งมาดีกว่าเดาแทนมัน
    splits: Object.values(result?.events?.splits ?? {}).map((s) => ({
      date: isoOf(Number(s.date) * 1000),
      ratio: s.splitRatio ?? `${s.numerator}:${s.denominator}`,
    })),
    dividendCount: Object.keys(result?.events?.dividends ?? {}).length,
    issues: {
      rawBars,
      unclosedDropped,
      nullOrNaN,
      outOfOrderFromSource,
      sanitizerDropped: dropped,
      sanitizerRepaired: repaired,
    },
  };
}

// ═══════════════════════════════ ผสานแบบสะสม ═══════════════════════════════

const sameBar = (a, b) =>
  a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume;

/**
 * ผสานแท่งใหม่เข้ากับแท่งสะสม — คีย์คือ timestamp
 *   แท่งใหม่ทับแท่งเดิมที่ timestamp เดียวกันเสมอ (Yahoo แก้ค่าย้อนหลังได้จริง)
 *   ผลลัพธ์เรียงตามเวลาและไม่มี timestamp ซ้ำ — สองข้อนี้คือสิ่งที่ผู้อ่านทุกตัวในงานวิจัย
 *   บังคับไว้ (rule-lab.mjs โยน error ทันทีถ้า ts ไม่เพิ่มขึ้นทุกแท่ง)
 *
 * นับ replaced เฉพาะตอนค่า "ต่างจริง" — แท่งเดิมที่ Yahoo ส่งกลับมาเหมือนเดิมเป๊ะไม่ใช่
 * การทับ ถ้านับรวมกัน ตัวเลขรายงานจะบอกว่ามีการแก้ย้อนหลังวันละพันแท่งทุกวัน ซึ่งไม่จริง
 */
export function mergeCandles(oldCandles, newCandles) {
  const byTs = new Map();
  for (const c of oldCandles) byTs.set(Date.parse(c.timestamp), normalizeBar(c));

  let added = 0;
  let replaced = 0;
  let identical = 0;
  for (const raw of newCandles) {
    const c = normalizeBar(raw);
    const key = Date.parse(c.timestamp);
    const prev = byTs.get(key);
    if (!prev) added++;
    else if (sameBar(prev, c)) identical++;
    else replaced++;
    byTs.set(key, c);
  }

  const candles = [...byTs.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  return { candles, added, replaced, identical };
}

// ═════════════════════════════ ความครอบคลุม/ช่องโหว่ ═════════════════════════════

/**
 * หาช่องโหว่ในลำดับแท่ง แล้วแยกว่า "ปกติของตลาดทอง" หรือ "อธิบายไม่ได้"
 *
 * ทองบน CME เปิดเกือบตลอด 23 ชม./วัน แต่มีสองช่องที่ต้องไม่ถูกนับเป็นข้อมูลหาย:
 *   · พักรายวัน 60 นาที (17:00–18:00 ET) → ช่องว่าง ~75 นาที = ขาดไป 4 แท่ง
 *   · สุดสัปดาห์ ~ศุกร์ 21:00 UTC ถึงอาทิตย์ 22:00 UTC → ช่องว่าง ~49 ชม.
 * ที่เหลือคือของที่คนต้องไปดูเอง (วันหยุดนักขัตฤกษ์ของ CME ก็จะโผล่ในกองนี้ ตั้งใจให้โผล่
 * เพราะ "วันหยุด" กับ "รอบเก็บที่ล้มเงียบ" หน้าตาเหมือนกันเป๊ะ แยกด้วยโค้ดไม่ได้ ต้องใช้ตาคน)
 */
export function analyzeGaps(candles) {
  const gaps = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = Date.parse(candles[i - 1].timestamp);
    const cur = Date.parse(candles[i].timestamp);
    const diff = cur - prev;
    if (diff <= BAR_MS) continue;

    const prevDay = new Date(prev).getUTCDay();
    const curDay = new Date(cur).getUTCDay();
    let kind;
    if (diff <= 90 * 60 * 1000) kind = 'พักรายวัน';
    else if (prevDay === 5 && (curDay === 0 || curDay === 1) && diff <= 55 * 3600 * 1000) kind = 'สุดสัปดาห์';
    else kind = 'อธิบายไม่ได้';

    gaps.push({
      from: candles[i - 1].timestamp,
      to: candles[i].timestamp,
      missingBars: Math.round(diff / BAR_MS) - 1,
      hours: Number((diff / 3600000).toFixed(2)),
      kind,
    });
  }

  const byKind = {};
  for (const g of gaps) byKind[g.kind] = (byKind[g.kind] ?? 0) + 1;
  return { total: gaps.length, byKind, unexplained: gaps.filter((g) => g.kind === 'อธิบายไม่ได้') };
}

export function coverageOf(candles) {
  if (candles.length === 0) return { bars: 0, from: null, to: null, spanDays: 0, tradingDays: 0, barsPerDay: 0 };
  const from = candles[0].timestamp;
  const to = candles[candles.length - 1].timestamp;
  const spanMs = Date.parse(to) - Date.parse(from);
  const spanDays = Number((spanMs / 86400000).toFixed(2));
  const days = new Set(candles.map((c) => c.timestamp.slice(0, 10)));
  return {
    bars: candles.length,
    from,
    to,
    spanDays,
    tradingDays: days.size,
    barsPerDay: spanDays > 0 ? Number((candles.length / spanDays).toFixed(1)) : 0,
  };
}

// ═════════════════════════════ ประกอบไฟล์ที่จะเขียน ═════════════════════════════

/**
 * ประกอบวัตถุที่จะเขียนลงไฟล์ — บริสุทธิ์ (ไม่แตะดิสก์ ไม่แตะเน็ต) เพื่อให้เทสต์ยิงตรงได้
 *
 * `fetchedAt` / `collector` จะขยับเฉพาะรอบที่ข้อมูลเปลี่ยนจริง (added หรือ replaced > 0)
 * เหตุผลอยู่ในกติกาข้อ 3 ที่หัวไฟล์ — ไฟล์นี้ถูก commit ทุกวัน หัวไฟล์ที่ขยับเองจะกลาย
 * เป็น commit เปล่าวันละใบ
 */
export function buildDataset({ existing, parsed, nowISO }) {
  const merged = mergeCandles(existing.candles, parsed.candles);
  const changed = merged.added > 0 || merged.replaced > 0;
  const coverage = coverageOf(merged.candles);
  const gaps = analyzeGaps(merged.candles);

  const prevCollector = existing.header?.collector ?? null;
  const prevTotals = prevCollector?.totals ?? { added: 0, replaced: 0, sanitizerDropped: 0, sanitizerRepaired: 0, unclosedDropped: 0 };

  const collector = changed
    ? {
        script: 'scripts/collect-15m.mjs',
        note: 'ไฟล์นี้สะสมทีละรอบ ตัวเลขในหัวจึงขยับเฉพาะรอบที่มีแท่งเปลี่ยนจริง',
        runsWithNewData: (prevCollector?.runsWithNewData ?? 0) + 1,
        firstRunAt: prevCollector?.firstRunAt ?? nowISO,
        lastRunAt: nowISO,
        lastRun: { added: merged.added, replaced: merged.replaced, identical: merged.identical, ...parsed.issues },
        totals: {
          added: prevTotals.added + merged.added,
          replaced: prevTotals.replaced + merged.replaced,
          unclosedDropped: (prevTotals.unclosedDropped ?? 0) + parsed.issues.unclosedDropped,
          sanitizerDropped: prevTotals.sanitizerDropped + parsed.issues.sanitizerDropped,
          sanitizerRepaired: prevTotals.sanitizerRepaired + parsed.issues.sanitizerRepaired,
        },
      }
    : prevCollector;

  const meta = parsed.meta ?? {};
  const dataset = {
    schemaVersion: SCHEMA_VERSION,
    symbol: SYMBOL,
    market: MARKET,
    name: NAME,
    yahooSymbol: YAHOO_SYMBOL,
    yahooName: meta.longName ?? meta.shortName ?? existing.header?.yahooName ?? null,
    timeframe: TIMEFRAME,
    interval: INTERVAL,
    fetchedAt: changed ? nowISO : (existing.header?.fetchedAt ?? nowISO),
    request: { mode: 'range', range: RANGE },

    actualFrom: coverage.from,
    actualTo: coverage.to,
    bars: coverage.bars,

    exchangeTimezone: meta.exchangeTimezoneName ?? existing.header?.exchangeTimezone ?? null,
    firstTradeDate: Number.isFinite(Number(meta.firstTradeDate))
      ? isoOf(Number(meta.firstTradeDate) * 1000)
      : (existing.header?.firstTradeDate ?? null),

    priceBasis:
      'indicators.quote[0] — ปรับ split ย้อนหลังแล้ว ไม่ได้หักปันผล (ชุดเดียวกับที่ src/lib/market-data.ts ใช้จริง)',
    splits: parsed.splits ?? [],
    dividendCount: parsed.dividendCount ?? 0,

    // ปัญหาของ "รอบที่ทำให้ไฟล์นี้เปลี่ยนล่าสุด" — ความหมายเดียวกับไฟล์อื่นในโฟลเดอร์
    // ส่วนยอดสะสมทุกรอบอยู่ใน collector.totals
    fetchIssues: changed ? parsed.issues : (existing.header?.fetchIssues ?? parsed.issues),

    // ไม่ใช้ชื่อ quality เพราะ quality ในไฟล์อื่นเป็นผลของ analyze() ใน fetch-universe.mjs
    // (ตรวจ era/flat/oor ทั้งชุด) — ตั้งชื่อซ้ำทั้งที่คำนวณคนละอย่างคือการโกหกผู้อ่านทีหลัง
    coverage: { ...coverage, gapCount: gaps.total, gapsByKind: gaps.byKind, unexplainedGaps: gaps.unexplained.slice(0, 20) },

    collector,
    candles: merged.candles,
  };

  return { dataset, merged, coverage, gaps, changed };
}

/**
 * ทำเป็นข้อความ JSON ที่ **หนึ่งแท่ง = หนึ่งบรรทัด**
 *
 * ทำไมไม่ minify แบบไฟล์อื่นในโฟลเดอร์: ไฟล์อื่นไม่ได้อยู่ใน git แต่ไฟล์นี้ถูก commit ทุกวัน
 * ทั้งปี ถ้าเป็นบรรทัดเดียวยาว 3 MB `git diff` จะอ่านไม่ได้เลยสักวัน — เห็นแค่ "บรรทัดเดียว
 * เปลี่ยน" ทุกครั้ง แล้วไม่มีใครตรวจได้ว่าวันนี้เพิ่มแท่งจริงหรือเขียนทับของเก่าทั้งไฟล์
 * แบบนี้ diff รายวันจะอ่านว่า "+65 บรรทัด" ตรงไปตรงมา และต้นทุนคือ 1 ไบต์/แท่ง
 */
export function serializeDataset(ds) {
  const { candles, ...head } = ds;
  const headLines = Object.entries(head).map(
    ([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).split('\n').join('\n  ')}`
  );
  const body = candles.map((c) => `    ${JSON.stringify(c)}`).join(',\n');
  return `{\n${headLines.join(',\n')},\n  "candles": [\n${body}\n  ]\n}\n`;
}

// ═══════════════════════════════ ตัวช่วยฝั่งดิสก์ ═══════════════════════════════

/** เขียนแบบ atomic — ถ้าถูกฆ่ากลางคัน ไฟล์สะสมจะยังเป็นของเดิมที่สมบูรณ์ ไม่ใช่ครึ่ง ๆ กลาง ๆ */
function writeTextAtomic(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

/**
 * ยืนยันว่า src/lib/market-data.ts ยังแปลง XAUUSD→GC=F เหมือนเดิม
 * ถ้าวันไหนของจริงเปลี่ยน เราจะเก็บสัญลักษณ์คนละตัวกับที่ระบบเทรดจริงโดยไม่มีใครรู้
 * — คืน null เมื่อหาไฟล์ไม่เจอ (ไม่ใช่ความผิดของงานนี้ ไม่ควรล้มทั้งรอบเก็บข้อมูล)
 */
export function assertYahooSymbolStillMatches() {
  const src = path.join(ROOT, 'src', 'lib', 'market-data.ts');
  if (!existsSync(src)) return null;
  const text = readFileSync(src, 'utf8');
  return /if\s*\(s === 'XAUUSD'[\s\S]{0,80}return 'GC=F'/.test(text);
}

// ══════════════════════════════════ รายงาน ══════════════════════════════════

function humanReport(r) {
  const L = [];
  L.push('');
  L.push(`เก็บแท่ง ${TIMEFRAME} ของทอง (${YAHOO_SYMBOL}) — ${r.ranAt}`);
  L.push(`  ไฟล์สะสม        : ${r.file}`);
  L.push(`  สถานะไฟล์เดิม   : ${r.existingState}`);
  L.push('');
  L.push(`  ดึงมา           : ${r.fetched.usable} แท่งที่ใช้ได้ (ดิบ ${r.fetched.rawBars})`);
  L.push(`     ตัดแท่งยังไม่ปิด ${r.fetched.unclosedDropped} · ช่องว่าง null ${r.fetched.nullOrNaN} · ด่านทิ้ง ${r.fetched.sanitizerDropped} · ด่านซ่อมกรอบ ${r.fetched.sanitizerRepaired}`);
  L.push(`  เพิ่มใหม่        : ${r.merge.added} แท่ง`);
  L.push(`  ทับของเดิม      : ${r.merge.replaced} แท่ง (ส่งกลับมาเหมือนเดิม ${r.merge.identical})`);
  L.push('');
  L.push(`  สะสมได้ตอนนี้   : ${r.coverage.bars} แท่ง · ครอบคลุม ${r.coverage.spanDays} วัน (${r.coverage.tradingDays} วันที่มีการซื้อขาย)`);
  L.push(`     ช่วง ${r.coverage.from ?? '—'} → ${r.coverage.to ?? '—'} · เฉลี่ย ${r.coverage.barsPerDay} แท่ง/วัน`);
  L.push(`  ประเมินหนึ่งปี  : ~${r.estBarsPerYear} แท่ง · ~${r.estSizePerYear} (ตอนนี้ไฟล์ ${r.fileSizeKB} KB)`);
  L.push('');

  const kinds = Object.entries(r.gaps.byKind);
  L.push(`  ช่องโหว่        : ${r.gaps.total} จุด${kinds.length ? ` — ${kinds.map(([k, v]) => `${k} ${v}`).join(' · ')}` : ''}`);
  if (r.gaps.unexplained.length === 0) {
    L.push('     ไม่มีช่องโหว่ที่อธิบายไม่ได้');
  } else {
    for (const g of r.gaps.unexplained.slice(0, 10)) {
      L.push(`     อธิบายไม่ได้: ${g.from} → ${g.to} (ขาด ${g.missingBars} แท่ง · ${g.hours} ชม.)`);
    }
    if (r.gaps.unexplained.length > 10) L.push(`     ...และอีก ${r.gaps.unexplained.length - 10} จุด`);
  }

  L.push('');
  if (r.symbolMapOk === false) {
    L.push('  ⚠ src/lib/market-data.ts ไม่ได้แปลง XAUUSD→GC=F แล้ว — ตรวจก่อนว่าคลังนี้ยังเก็บสัญลักษณ์ที่ระบบเทรดจริง');
  }
  if (r.dryRun) L.push('  [--dry-run] ไม่ได้เขียนไฟล์');
  else if (r.wrote) L.push('  เขียนไฟล์แล้ว');
  else L.push('  ไม่มีอะไรเปลี่ยน — ไม่เขียนไฟล์ (กัน commit เปล่าใน GitHub Actions)');
  L.push('');
  return L.join('\n');
}

// ═══════════════════════════════════ main ═══════════════════════════════════

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const asJson = process.argv.includes('--json');
  const nowMs = Date.now();
  const nowISO = isoOf(nowMs);

  // ด่านตรวจแท่งตัวจริง — ล้มตรงนี้ต้องล้มทั้งรอบ ห้ามมีทางสำรองที่ทำให้ข้อมูลเพี้ยนเงียบ ๆ
  let sanitizeCandles;
  try {
    const mods = await loadSrcModules(['src/lib/candle-sanitizer.ts']);
    sanitizeCandles = mods['candle-sanitizer'].sanitizeCandles;
    if (typeof sanitizeCandles !== 'function') throw new Error('ไม่พบ sanitizeCandles ใน src/lib/candle-sanitizer.ts');
  } catch (err) {
    console.error(`[ล้มเหลว] โหลดด่านตรวจแท่งตัวจริงไม่ได้: ${err?.message ?? err}`);
    process.exit(2);
  }

  const existing = loadExisting(OUT_FILE);
  const symbolMapOk = assertYahooSymbolStillMatches();

  const res = await fetchChart();
  if (!res.ok) {
    // exit != 0 เสมอ — รอบเก็บที่ล้มแล้วเงียบคือทางเดียวที่คลังนี้จะว่างเปล่าโดยไม่มีใครรู้
    console.error(`[ล้มเหลว] ดึง ${YAHOO_SYMBOL} ${INTERVAL} จาก Yahoo ไม่สำเร็จ: ${res.error}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseChart(res.result, nowMs, sanitizeCandles);
  } catch (err) {
    console.error(`[ล้มเหลว] คำตอบของ Yahoo ใช้ไม่ได้: ${err?.message ?? err}`);
    process.exit(1);
  }

  // ── ด่านล้มดัง: กันรูโหว่ที่ตัวตรวจสอบจับได้เมื่อ 2026-09-01 ────────────────
  //
  // เคสที่กลัว: Yahoo ตอบ HTTP 200 พร้อม timestamp ครบเดือน แต่ค่าใน quote[0] เป็น null
  // ทั้งชุด หรือเปลี่ยนชื่อคีย์ (open → o ซึ่งเป็น schema drift ที่เกิดขึ้นได้จริง)
  // → `?? 0` ทำให้ทุกแท่งเป็นศูนย์ → กรอง close > 0 ทิ้งหมด → ผสานแล้วไม่มีอะไรเปลี่ยน
  // → ไม่ commit → job เขียว → เงียบไปเรื่อย ๆ จนวันที่ต้องใช้ข้อมูลถึงรู้ว่าหายไปหลายเดือน
  // คลังข้อมูลที่ล้มเงียบแย่กว่าคลังที่ไม่มี — ข้อ 4 ของกติกาในหัวไฟล์สั่งไว้ว่าต้องดัง
  //
  // ทำไมอยู่ตรงนี้ ไม่ใช่ใน parseChart: มันเป็นสมบัติของ "การดึงหน้าต่าง 1 เดือนจริง"
  // ไม่ใช่ของการแกะข้อมูล — เทสต์ป้อนชุดจำลองสิบกว่าแท่งเข้า parseChart เป็นเรื่องปกติ
  // และไม่ควรถูกด่านนี้ปฏิเสธ
  //
  // เกณฑ์มาจากข้อมูลจริงที่วัดแล้ว ไม่ใช่ตัวเลขที่ตั้งเอา: หน้าต่าง 1 เดือนให้ 1,960 แท่ง
  // ปิดแล้วใน 29.3 วัน = 66.9 แท่ง/วัน · ตั้งพื้นที่ 200 = ~3 วันทำการ ต่ำกว่านั้นแปลว่า
  // ผิดปกติแน่ ไม่ใช่แค่วันหยุดยาว
  const MIN_EXPECTED_BARS = 200;
  if (parsed.candles.length < MIN_EXPECTED_BARS) {
    console.error(
      `[ล้มเหลว] ได้แท่งปิดแล้วแค่ ${parsed.candles.length} แท่งจากหน้าต่าง 1 เดือน ` +
        `(คาดอย่างน้อย ${MIN_EXPECTED_BARS}) — สงสัยว่า Yahoo เปลี่ยนรูปแบบคำตอบหรือส่งค่าว่างมาทั้งชุด ` +
        'หยุดไว้ก่อนดีกว่าเก็บของว่างแล้วเงียบ'
    );
    process.exit(1);
  }

  // ช่องว่างยาวผิดปกติ = ข้อมูลหายกลางทาง ไม่ใช่แค่ตลาดปิด
  // วัดจากข้อมูลจริง: ช่องว่างยาวสุดคือสุดสัปดาห์ 49.25 ชม. · ห้าอันดับแรกคือ
  // 49.3 · 49.3 · 49.3 · 49.0 · 1.3 ชม. → ด่านที่ 55 ชม. จึงไม่มีทางเตือนผิดตอน
  // สุดสัปดาห์หรือวันหยุด CME แต่จับได้ถ้าหายไปทั้งวันทำการ
  const MAX_EXPECTED_GAP_HOURS = 55;
  for (let i = 1; i < parsed.candles.length; i++) {
    const gapH = (Date.parse(parsed.candles[i].timestamp) - Date.parse(parsed.candles[i - 1].timestamp)) / 3_600_000;
    if (gapH > MAX_EXPECTED_GAP_HOURS) {
      console.error(
        `[ล้มเหลว] เจอช่องว่าง ${gapH.toFixed(1)} ชม. หลังแท่ง ${parsed.candles[i - 1].timestamp} ` +
          `(เกินเกณฑ์ ${MAX_EXPECTED_GAP_HOURS} ชม.) — ยาวเกินกว่าสุดสัปดาห์หรือวันหยุด CME จะอธิบายได้`
      );
      process.exit(1);
    }
  }

  const built = buildDataset({ existing, parsed, nowISO });
  if (built.dataset.candles.length === 0) {
    console.error('[ล้มเหลว] ผสานแล้วไม่เหลือแท่งเลย — ไม่เขียนทับไฟล์สะสม');
    process.exit(1);
  }

  const text = serializeDataset(built.dataset);

  // อ่านกลับมาเทียบก่อนเขียนทับของสะสม — ไฟล์ที่ parse ไม่ออกคือการทำลายคลังทั้งก้อน
  // ราคาของด่านนี้คือ ~0.1 วิ/รอบ ซึ่งถูกกว่าการเสียข้อมูลสะสมหลายเดือนมาก
  try {
    if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(built.dataset)) {
      throw new Error('อ่านกลับแล้วไม่ตรงกับต้นฉบับ');
    }
  } catch (err) {
    console.error(`[ล้มเหลว] ข้อความ JSON ที่จะเขียนไม่ผ่านการอ่านกลับ (${err?.message ?? err}) — ไม่เขียนไฟล์`);
    process.exit(2);
  }

  const needsWrite = text !== existing.rawText;
  let wrote = false;
  if (!dryRun && needsWrite) {
    // ไฟล์เดิมพัง = สำรองไว้ก่อนเสมอ ไม่ทับทิ้ง (กู้ด้วยมือได้ถ้ามันไม่ได้พังจริง)
    if (existing.broken && existsSync(OUT_FILE)) {
      const backup = `${OUT_FILE}.broken-${nowISO.replace(/[:.]/g, '-')}`;
      renameSync(OUT_FILE, backup);
      console.error(`[เตือน] ${existing.state} — สำรองไฟล์เดิมไว้ที่ ${backup} แล้วเริ่มสะสมใหม่`);
    }
    writeTextAtomic(OUT_FILE, text);
    wrote = true;
  }

  const bytes = Buffer.byteLength(text, 'utf8');
  const barsPerYear = Math.round(built.coverage.barsPerDay * 365);
  const bytesPerBar = built.coverage.bars > 0 ? bytes / built.coverage.bars : 0;
  const estBytesPerYear = Math.round(bytesPerBar * barsPerYear);

  const report = {
    ranAt: nowISO,
    file: OUT_FILE,
    existingState: existing.state,
    symbolMapOk,
    dryRun,
    wrote,
    changed: built.changed,
    fetched: { usable: parsed.candles.length, ...parsed.issues },
    merge: { added: built.merged.added, replaced: built.merged.replaced, identical: built.merged.identical },
    coverage: built.coverage,
    gaps: built.gaps,
    fileSizeKB: Number((bytes / 1024).toFixed(1)),
    estBarsPerYear: barsPerYear,
    estSizePerYear: `${(estBytesPerYear / (1024 * 1024)).toFixed(1)} MB`,
  };

  if (asJson) console.log(JSON.stringify(report, null, 2));
  else console.log(humanReport(report));
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[ล้มเหลว] ${err?.stack ?? err}`);
    process.exit(1);
  });
}
