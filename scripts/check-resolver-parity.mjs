#!/usr/bin/env node
/**
 * check-resolver-parity.mjs
 * ตรวจว่า "สำเนา" สองชุดใน scripts/resolve-signals.mjs ยังตรงกับต้นฉบับ
 *
 *   1. ตารางต้นทุน COST_BPS   ต้นฉบับ = scripts/research/lab.mjs
 *   2. ฟังก์ชัน toYahooSymbol  ต้นฉบับ = src/lib/market-data.ts
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESOLVER = path.join(ROOT, 'scripts', 'resolve-signals.mjs');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');
const MARKET_DATA = path.join(ROOT, 'src', 'lib', 'market-data.ts');

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

console.log('');
if (failures) {
  console.log(`[ไม่ผ่าน] พบความต่าง ${failures} จุด — แก้ให้ตรงกันก่อน ไม่งั้นตัวเลข realized_r จะเทียบกับงานวิจัยไม่ได้`);
  process.exitCode = 1;
} else {
  console.log('[ผ่าน] สำเนาในตัวเก็บผลยังตรงกับต้นฉบับทั้งสองชุด');
}
