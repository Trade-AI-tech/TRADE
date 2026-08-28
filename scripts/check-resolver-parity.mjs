#!/usr/bin/env node
/**
 * check-resolver-parity.mjs
 * ตรวจว่า "สำเนา" สามชุดใน scripts/resolve-signals.mjs ยังตรงกับต้นฉบับ
 *
 *   1. ตารางต้นทุน COST_BPS   ต้นฉบับ = scripts/research/lab.mjs
 *   2. ฟังก์ชัน toYahooSymbol  ต้นฉบับ = src/lib/market-data.ts
 *   3. ด่านตรวจแท่ง sanitizeBars ต้นฉบับ = src/lib/candle-sanitizer.ts (sanitizeCandles)
 *      สำเนานี้เทียบตัวอักษรตรง ๆ ไม่ได้เพราะรูปแท่งคนละแบบ ({t,o,h,l,c} กับ
 *      {timestamp,open,...}) จึงเทียบเชิงพฤติกรรม: ป้อนแท่งชุดเดียวกันให้สองฝั่ง
 *      แล้วผลต้องตรงกันทุกแท่ง ทุกตัวนับ ทุกตลาด
 *
 * วิธีรัน
 *   node scripts/check-resolver-parity.mjs
 *
 * ทำไมต้องมีไฟล์นี้
 *   ตัวเก็บผลรันบน GitHub Actions ด้วย node ล้วน ไม่มีขั้นตอน build จึง import ไฟล์ .ts
 *   ไม่ได้ และ lab.mjs ก็ไม่ได้ export ตารางต้นทุนออกมา การมีสำเนาจึงเลี่ยงไม่ได้
 *
 *   สิ่งที่เลี่ยงได้คือ "สำเนาเพี้ยนจากต้นฉบับโดยไม่มีใครรู้" ซึ่งอันตรายเป็นพิเศษกับสองอย่างนี้:
 *   · ตารางต้นทุนเพี้ยน → ตัวเลข realized_r ที่เจ้าของใช้ตัดสินใจเรื่องเงิน จะเทียบกับ
 *     ผลงานวิจัยไม่ได้อีกต่อไป และจะเพี้ยนแบบเงียบ ๆ ไปในทิศที่ดูดีขึ้นเสมอถ้าใครลืมอัปเดต
 *     ค่าที่แพงกว่า (เคยเกิดมาแล้วจริงกับคู่ไขว้บาทที่ตกไปใช้ค่าประจำตลาด 1.5 bps
 *     ทั้งที่ของจริงคือ 20 — ถูกกว่าความจริง 13 เท่า)
 *   · การแปลงชื่อ symbol เพี้ยน → ดึงราคาผิดตัว แล้วปิดบัญชีสัญญาณด้วยราคาของสินทรัพย์อื่น
 *     ซึ่งจะไม่มี error ให้เห็นเลย มีแต่ตัวเลขที่ผิด
 *
 * ไฟล์นี้ไม่เขียนอะไรลงในโปรเจกต์ ไฟล์ชั่วคราวอยู่ใน os.tmpdir() และถูกลบทิ้งเสมอ
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESOLVER = path.join(ROOT, 'scripts', 'resolve-signals.mjs');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');
const MARKET_DATA = path.join(ROOT, 'src', 'lib', 'market-data.ts');
const SANITIZER = path.join(ROOT, 'src', 'lib', 'candle-sanitizer.ts');

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);

/**
 * ดึงค่า literal ของ const ชื่อหนึ่งออกจากซอร์ส แล้วประเมินค่าเป็น object จริง
 *
 * ใช้การนับวงเล็บปีกกาแทน regex เพราะตารางต้นทุนมีคอมเมนต์และ object ซ้อนอยู่ข้างใน
 * regex แบบ non-greedy จะตัดผิดที่ และแบบ greedy จะกินยาวเกิน
 */
function extractObjectLiteral(source, name) {
  const marker = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\{`);
  const m = marker.exec(source);
  if (!m) throw new Error(`หา const ${name} ในซอร์สไม่เจอ`);
  const start = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // eslint-disable-next-line no-new-func
        return new Function(`return (${source.slice(start, i + 1)});`)();
      }
    }
  }
  throw new Error(`วงเล็บปีกกาของ ${name} ไม่ปิด`);
}

/** ดึงฟังก์ชัน toYahooSymbol ออกมาเป็นฟังก์ชันจริง โดยลอกชนิดของ TS ออกด้วย regex เล็ก ๆ */
function loadToYahooSymbolFromTs(file) {
  const src = readFileSync(file, 'utf8');
  const m = /export function toYahooSymbol\([\s\S]*?\n\}/.exec(src);
  if (!m) throw new Error('หา toYahooSymbol ใน market-data.ts ไม่เจอ');
  const js = m[0]
    .replace(/^export\s+/, '')
    // ตัวฟังก์ชันนี้มีชนิดอยู่แค่ในลายเซ็น (symbol: string, market: string): string
    // ตัวเนื้อในไม่มีเลย จึงลอกออกด้วย regex ได้ปลอดภัย — ถ้าวันไหนมีชนิดในเนื้อใน
    // new Function จะโยน SyntaxError ทันที ไม่ใช่เงียบแล้วให้ผลผิด
    .replace(/:\s*string/g, '');
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return toYahooSymbol;`)();
}

console.log('── 1. ตารางต้นทุน COST_BPS (ต้นฉบับ: lab.mjs) ──');
{
  const mine = extractObjectLiteral(readFileSync(RESOLVER, 'utf8'), 'COST_BPS');
  const theirs = extractObjectLiteral(readFileSync(LAB, 'utf8'), 'COST_BPS');

  for (const group of ['byMarket', 'bySymbol']) {
    const a = mine[group] ?? {};
    const b = theirs[group] ?? {};
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    let bad = 0;
    for (const k of keys) {
      if (a[k] !== b[k]) {
        fail(`${group}.${k} — ตัวเก็บผล ${a[k] ?? '(ไม่มี)'} · lab.mjs ${b[k] ?? '(ไม่มี)'}`);
        bad++;
      }
    }
    if (!bad) pass(`${group} ตรงกันครบ ${keys.length} รายการ`);
  }
}

console.log('── 2. toYahooSymbol (ต้นฉบับ: src/lib/market-data.ts) ──');
{
  const canonical = loadToYahooSymbolFromTs(MARKET_DATA);
  const { toYahooSymbol: copy } = await import(pathToFileURL(RESOLVER).href);

  // ครอบทุกสาขาของฟังก์ชัน รวมเคสที่คนเขียนพลาดบ่อย: ตัวพิมพ์เล็ก ช่องว่าง และค่าที่แปลงแล้ว
  const MARKETS = ['GOLD', 'FOREX', 'TH_STOCK', 'CRYPTO', 'US_STOCK', 'ไม่รู้จัก'];
  const SYMBOLS = [
    'XAUUSD', 'XAGUSD', 'GOLD', 'SILVER', 'GC=F', 'SI=F', 'PL=F',
    'EURUSD', 'eurusd', ' EURUSD ', 'EURUSD=X', 'USDTHB', 'GBPTHB',
    'PTT', 'PTT.BK', 'ptt', 'BTC', 'BTC-USD', 'ETH', 'AAPL', 'SPY', '',
  ];
  let bad = 0, n = 0;
  for (const mk of MARKETS) {
    for (const sym of SYMBOLS) {
      n++;
      const a = canonical(sym, mk);
      const b = copy(sym, mk);
      if (a !== b) { fail(`(${JSON.stringify(sym)}, ${mk}) — ต้นฉบับ "${a}" · สำเนา "${b}"`); bad++; }
    }
  }
  if (!bad) pass(`ตรงกันครบ ${n} เคส`);
}

console.log('── 3. ด่านตรวจแท่ง sanitizeBars (ต้นฉบับ: src/lib/candle-sanitizer.ts) ──');
{
  /**
   * โหลดต้นฉบับ TS เป็นโมดูลจริง — วิธีเดียวกับ check-scan-parity.mjs:
   * ตัดบรรทัด import (มีแค่ import type) แล้ว transpile ด้วยแพ็กเกจ typescript ถ้ามี
   * ไม่มีก็เขียนเป็น .mts ให้ type stripping ของ Node (22.6+) จัดการ
   */
  const require_ = createRequire(import.meta.url);
  let typescript = null;
  try {
    typescript = require_('typescript');
  } catch {
    typescript = null;
  }
  const stripped = readFileSync(SANITIZER, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*import\b/.test(l))
    .join('\n');
  const tmp = mkdtempSync(path.join(tmpdir(), 'resolver-parity-'));
  let canonicalSanitize;
  try {
    let file;
    if (typescript) {
      const out = typescript.transpileModule(stripped, {
        fileName: 'candle-sanitizer.ts',
        compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext },
      }).outputText;
      file = path.join(tmp, 'candle-sanitizer.mjs');
      writeFileSync(file, out, 'utf8');
    } else {
      file = path.join(tmp, 'candle-sanitizer.mts');
      writeFileSync(file, stripped, 'utf8');
    }
    ({ sanitizeCandles: canonicalSanitize } = await import(pathToFileURL(file).href));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const { sanitizeBars: copySanitize } = await import(pathToFileURL(RESOLVER).href);

  /**
   * ตารางเคสตายตัว — แต่ละเคสคือลำดับ [o,h,l,c] บวกตลาด ครอบทุกกิ่งของกติกา:
   * สะอาด / กรอบพังสองแบบ / spike ขึ้น-ลง / กระโดดไม่ถอยกลับ / ต่ำกว่าเพดาน /
   * แท่งสุดท้ายกระโดด / ค่าที่ไม่ใช่ตัวเลข / เพดานต่างกันต่อตลาด (10% ทิ้งใน FOREX เก็บใน GOLD)
   */
  const CASES = [
    { name: 'สะอาดทั้งชุด', market: 'FOREX', bars: [[1, 1.01, 0.99, 1.005], [1.005, 1.012, 1.001, 1.01], [1.01, 1.015, 1.004, 1.008]] },
    { name: 'close ทะลุ high', market: 'GOLD', bars: [[100, 101, 99, 100.5], [100.5, 101, 99.5, 102], [102, 103, 101, 102.5]] },
    { name: 'open ต่ำกว่า low', market: 'FOREX', bars: [[1, 1.01, 1.002, 1.005], [1.005, 1.01, 1.0, 1.008]] },
    { name: 'spike ขึ้นแล้วถอยกลับ (แบบ EURUSD 2008-02-08)', market: 'FOREX', bars: [[1.448, 1.4649, 1.4452, 1.4479], [1.5571, 1.5571, 1.5541, 1.5571], [1.4532, 1.4577, 1.4486, 1.4502]] },
    { name: 'spike ลงแล้วถอยกลับ', market: 'GOLD', bars: [[2000, 2010, 1990, 2005], [1560, 1565, 1555, 1558], [2001, 2012, 1995, 2003]] },
    { name: 'กระโดดจริงยืนระดับใหม่ (ห้ามทิ้ง)', market: 'FOREX', bars: [[1, 1.01, 0.99, 1.0], [1.09, 1.1, 1.085, 1.095], [1.096, 1.1, 1.09, 1.098]] },
    { name: 'กระโดดต่ำกว่าเพดาน (ห้ามทิ้ง)', market: 'FOREX', bars: [[1, 1.01, 0.99, 1.0], [1.05, 1.055, 1.045, 1.05], [1.0, 1.01, 0.995, 1.005]] },
    { name: 'แท่งสุดท้ายกระโดดแรง (ห้ามทิ้ง)', market: 'FOREX', bars: [[1, 1.01, 0.99, 1.0], [1.001, 1.011, 0.995, 1.006], [1.2, 1.21, 1.19, 1.2]] },
    { name: 'ค่าที่ไม่ใช่ตัวเลขบวก finite', market: 'CRYPTO', bars: [[10, 11, 9, 10.5], [NaN, 11, 9, 10], [10, 0, 9, 10.2], [10, 11, -1, 10.1], [10.2, 11, 10, 10.4]] },
    { name: 'กระโดด 10% ถอยกลับ — เกินเพดาน FOREX', market: 'FOREX', bars: [[1, 1.005, 0.995, 1.0], [1.1, 1.105, 1.095, 1.1], [1.0, 1.005, 0.995, 1.001]] },
    { name: 'กระโดด 10% ถอยกลับ — ใต้เพดาน GOLD', market: 'GOLD', bars: [[100, 100.5, 99.5, 100], [110, 110.5, 109.5, 110], [100, 100.5, 99.5, 100.1]] },
  ];

  const toCandle = (b, i) => ({ timestamp: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), open: b[0], high: b[1], low: b[2], close: b[3], volume: 0 });
  const toBar = (b, i) => ({ t: 1767225600 + i * 86400, o: b[0], h: b[1], l: b[2], c: b[3] });
  const key = (o, h, l, c) => [o, h, l, c].map((v) => String(v)).join('/');

  let bad = 0;
  for (const tc of CASES) {
    const a = canonicalSanitize(tc.bars.map(toCandle), tc.market);
    const b = copySanitize(tc.bars.map(toBar), tc.market);
    const diffs = [];
    if (a.dropped !== b.dropped) diffs.push(`dropped ต้นฉบับ ${a.dropped} · สำเนา ${b.dropped}`);
    if (a.repaired !== b.repaired) diffs.push(`repaired ต้นฉบับ ${a.repaired} · สำเนา ${b.repaired}`);
    if (a.candles.length !== b.bars.length) diffs.push(`จำนวนแท่งที่รอด ต้นฉบับ ${a.candles.length} · สำเนา ${b.bars.length}`);
    else {
      for (let i = 0; i < a.candles.length; i++) {
        const ca = a.candles[i];
        const cb = b.bars[i];
        if (key(ca.open, ca.high, ca.low, ca.close) !== key(cb.o, cb.h, cb.l, cb.c)) {
          diffs.push(`แท่งที่ ${i}: ต้นฉบับ ${key(ca.open, ca.high, ca.low, ca.close)} · สำเนา ${key(cb.o, cb.h, cb.l, cb.c)}`);
        }
      }
    }
    if (diffs.length) {
      bad++;
      fail(`${tc.name} — ${diffs.join(' · ')}`);
    }
  }
  if (!bad) pass(`ผลตรงกันทุกแท่งครบ ${CASES.length} เคส`);
}

console.log('');
if (failures) {
  console.log(`[ไม่ผ่าน] พบความต่าง ${failures} จุด — แก้ให้ตรงกันก่อน ไม่งั้นตัวเลข realized_r จะเทียบกับงานวิจัยไม่ได้`);
  process.exitCode = 1;
} else {
  console.log('[ผ่าน] สำเนาในตัวเก็บผลยังตรงกับต้นฉบับทั้งสามชุด');
}
