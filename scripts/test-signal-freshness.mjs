#!/usr/bin/env node
/**
 * test-signal-freshness.mjs — เทสต์ "สิ่งที่เจ้าของเห็น ต้องตรงกับสถานะจริงของตลาด"
 * (npm run test:freshness)
 *
 * วิธีรัน
 *   node scripts/test-signal-freshness.mjs
 *
 * ไม่ต้องใช้เน็ต ไม่ต้องมี DB ไม่แตะนาฬิกาจริง (เวลาถูกส่งเข้าไปทุกจุด ยกเว้นตอนทดสอบ
 * fetchChart ซึ่งครอบ Date.now ชั่วคราวแล้วคืนค่าเดิมเสมอ)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ที่มา: เจ้าของรายงานเมื่อ 2026-09-01 ว่า
 *        "สัญญาณที่แจ้งเตือนมาไม่ตรงกับสถานะกราฟปัจจุบัน"
 *
 * ไล่แล้วไม่ใช่บั๊กเดียว แต่เป็นสี่จุดที่ทำให้เกิดอาการเดียวกัน ไฟล์นี้คุมทั้งสี่:
 *
 *  1. ตัวเก็บผลไม่แตะ status  — resolve-signals.mjs ปั๊ม outcome/realized_r แล้วจบ
 *     แถวที่ ledger ปิดไปแล้วจึงค้าง status='active' ต่อไป ทุกฝั่งที่อ่านด้วย status
 *     (การ์ด /signals · แถวสรุป · /dashboard · จุดแดงบนเมนู · การเก็บตกแจ้งเตือน ·
 *     RPC get_dashboard_stats · การป้อน current_price สดของ monitor-positions)
 *     จึงเห็นไม้ที่โดน SL ไปแล้วเป็น "โอกาสที่เปิดอยู่" และดูมีชีวิตตลอดเวลา
 *
 *  2. TTL ของ 15m ตกกิ่ง 7 วัน — เดิมเขียน `tf === '1H' ? 48 ชม. : 7 วัน` ทุก timeframe
 *     ที่ไม่ใช่ 1H จึงกินค่า 7 วันเงียบ ๆ ใบ 15m จึงค้างโชว์เป็นโอกาสได้ถึงหกวัน
 *     ทั้งที่ ledger ปิดบัญชีมันไปแล้วภายในไม่เกินสามวัน
 *
 *     ⚠ ครั้งแรกที่แก้ข้อนี้ (2026-09-03) แก้ผิดวิธีแล้วเกือบหลุดไป: ตอนนั้นย่อ TTL ลงเหลือ
 *     24 ชม. โดยอ้างว่า "= 96 แท่ง × 15 นาที พอดี" ซึ่งเป็นการเทียบ **เวลาแท่ง** กับ
 *     **เวลานาฬิกา** ทองหยุดวันละ 60 นาทีและหยุดสุดสัปดาห์ หน้าต่าง 96 แท่งจริงจึงกินเวลา
 *     24.75–73.75 ชม. (วัดจาก .research-cache/candles/GOLD__XAUUSD__15m.json 1,960 แท่ง
 *     ทุกหน้าต่าง n=1,865 เกิน 24 ชม. ครบ 100%) และเพราะตอนนั้น resolveSignal อ่าน
 *     expires_at มาใช้เป็นเส้นตัด ผลคือ **11.6% ของใบถูกบันทึกผลต่างไปจากเดิม**
 *     (sl→timeout 115 · tp→timeout 74 · timeout คนละราคาออก 197) = เปลี่ยนสมุดบัญชี
 *     ทั้งที่งานนั้นตั้งใจแก้แค่สิ่งที่ตาเห็น
 *
 *     ทางแก้ที่ถูก: แยกนาฬิกาสองเรือน — expires_at เป็นหน้าต่างฝั่งแสดงผล ส่วน ledger
 *     ใช้ LEDGER_TTL_MS ของตัวเอง (ค่าเท่าพฤติกรรมเดิมเป๊ะ) จึงย่อหน้าต่างโชว์ได้
 *     โดยไม่ขยับตัวเลขในสมุดบัญชีแม้แต่ไม้เดียว
 *
 *  3. fetchChart ไม่ตัดแท่งที่ยังก่อตัว — ตัวสแกนยิงนาทีที่ 2/17/32/47 จึงเอาแท่ง 15m
 *     อายุ 2 นาทีไปคำนวณเหมือนแท่งสมบูรณ์ อินดิเคเตอร์/แพทเทิร์นทั้งชุดจึงมาจากแท่ง
 *     ที่ยังเปลี่ยนได้ พอมันปิดจริง ค่าที่คำนวณไว้ก็ไม่ตรงกับกราฟที่เจ้าของเปิดดู
 *
 *  4. การเก็บตกแจ้งเตือนใช้เพดาน 6 ชม. เดียวกับทุกเลน — ใบ 15m ที่ส่งไม่ออกตอน 09:00
 *     ยังถูกเด้งได้ตอน 14:55 = ช้าไป 24 แท่ง ราคาเข้าบนใบนั้นเทรดไม่ได้แล้ว
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * หลักการของไฟล์นี้ (เหมือน test-candle-sanitizer.mjs / test-signal-flips.mjs)
 *
 *  · วัด "โค้ดตัวเดียวกับที่รันจริง" — ลอกชนิดออกจาก src/lib/*.ts แล้ว import กลับเข้ามา
 *    ไม่มีสำเนาตรรกะในไฟล์นี้แม้แต่บรรทัดเดียว
 *  · ทุกชุดยืนยันมี **negative control**: เอา "ฉบับก่อนแก้" มารันชุดเดียวกัน แล้วบังคับว่า
 *    ต้องสอบตกจริง ถ้าฉบับก่อนแก้ผ่านหมด แปลว่าชุดยืนยันนั้นไม่มีฟัน ต้องแดงทันที
 *  · โหมดถอย (ยังไม่ได้รัน migration 007 = ไม่มีคอลัมน์ outcome) ต้องไม่พัง และต้องให้
 *    พฤติกรรมเดิมเป๊ะ — ฐานข้อมูลปลอมในไฟล์นี้จะโยน 42703 ถ้ามีใครย้ายเงื่อนไข outcome
 *    ไปไว้ใน query แทนที่จะกรองในโค้ด
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

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

// ──────────────────────────── โหลด src/lib/*.ts เป็นโมดูลจริง ────────────────────────────

let typescript;
try {
  typescript = require('typescript');
} catch {
  console.error('\n[ล้มเหลว] ไม่พบ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่\n');
  process.exit(1);
}

function mapSpecifier(spec) {
  let s = spec;
  if (s.startsWith('@/')) s = `./${s.slice(2)}`;
  if (s.startsWith('./') || s.startsWith('../')) {
    const base = s.split('/').pop();
    return base.endsWith('.json') ? `./${base}` : `./${base}.mjs`;
  }
  return spec; // แพ็กเกจภายนอก (web-push, @supabase/ssr) ให้ node หาใน node_modules เอง
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
  return out.replace(/(from\s+)(['"])([^'"]+)\2/g, (_m, kw, q, spec) => {
    const mapped = mapSpecifier(spec);
    return `${kw}${q}${mapped}${q}${mapped.endsWith('.json') ? " with { type: 'json' }" : ''}`;
  });
}

/**
 * เขียนไฟล์ชั่วคราวลง node_modules/.cache — จำเป็นเพราะ push-server.ts import 'web-push'
 * และ supabase.ts import '@supabase/ssr' ทั้งคู่ต้อง resolve ผ่าน node_modules ให้ได้
 * (วิธีเดียวกับ scripts/test-push-digest.mjs) · ลบทิ้งเสมอตอนจบ ไม่เหลืออะไรใน git status
 */
function loadModules() {
  const cacheRoot = path.join(ROOT, 'node_modules', '.cache');
  mkdirSync(cacheRoot, { recursive: true });
  const tmpDir = mkdtempSync(path.join(cacheRoot, 'signal-freshness-test-'));

  // '@/types' เป็น type ล้วน ถูกลอกออกตอน transpile — เขียน stub ว่างกัน import ค้าง
  writeFileSync(path.join(tmpDir, 'types.mjs'), 'export {};\n', 'utf8');

  const libDir = path.join(ROOT, 'src', 'lib');
  for (const f of readdirSync(libDir)) {
    if (f.endsWith('.json')) copyFileSync(path.join(libDir, f), path.join(tmpDir, f));
  }

  // ไฟล์ของคนอื่นทั้งหมดในนี้ — อ่านอย่างเดียว ไม่แก้
  const rels = [
    'src/lib/errors.ts',
    'src/lib/candle-sanitizer.ts',
    'src/lib/indicators.ts',
    'src/lib/signal-engine.ts',
    'src/lib/demo-data.ts',
    'src/lib/supabase.ts',
    'src/lib/market-data.ts',
    'src/lib/signal-flips.ts',
    'src/lib/push-digest.ts',
    'src/lib/universe.ts',
    'src/lib/push-server.ts',
  ];
  for (const rel of rels) {
    const abs = path.join(ROOT, ...rel.split('/'));
    const base = path.basename(rel, '.ts');
    writeFileSync(path.join(tmpDir, `${base}.mjs`), transpile(readFileSync(abs, 'utf8'), `${base}.ts`), 'utf8');
  }
  return tmpDir;
}

const tmpDir = loadModules();
let flips;
let engine;
let marketData;
let pushServer;
let resolver;
try {
  const load = (base) => import(pathToFileURL(path.join(tmpDir, `${base}.mjs`)).href);
  [flips, engine, marketData, pushServer] = await Promise.all([
    load('signal-flips'),
    load('signal-engine'),
    load('market-data'),
    load('push-server'),
  ]);
  resolver = await import(pathToFileURL(path.join(ROOT, 'scripts', 'resolve-signals.mjs')).href);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

const { ledgerStillOpen, isLiveSignalRow, findFlipTargets } = flips;
const { signalTtlMs, generateSignal } = engine;
const { splitClosedBars, fetchChart, BAR_SECONDS } = marketData;
const { loadPendingSignals, pendingMaxAgeMsFor, PUSH_STATE_CONFIG } = pushServer;
const { resolveSignal, STATUS_FOR_OUTCOME, MAX_HOLD_BARS, ledgerTtlMs } = resolver;

for (const [name, fn] of Object.entries({
  ledgerStillOpen, isLiveSignalRow, findFlipTargets, signalTtlMs, generateSignal,
  splitClosedBars, fetchChart, loadPendingSignals, pendingMaxAgeMsFor, resolveSignal,
})) {
  if (typeof fn !== 'function') {
    console.error(`\n[ล้มเหลว] โหลดของจริงไม่ครบ — ${name} ไม่ใช่ฟังก์ชัน (ได้ ${typeof fn})\n`);
    process.exit(1);
  }
}

// ───────────────────────────────── ตัวช่วยทั่วไป ─────────────────────────────────

const iso = (sec) => new Date(sec * 1000).toISOString();
const HOUR = 3600_000;
const MIN = 60_000;

let rowSeq = 0;
/** แถวจากตาราง signals แบบที่ฝั่งอ่านได้รับจริง (select('*')) */
function row(over = {}) {
  rowSeq++;
  return {
    id: `sig-${String(rowSeq).padStart(4, '0')}`,
    user_id: 'user-1',
    symbol: 'XAUUSD',
    name: 'Gold',
    market: 'GOLD',
    action: 'BUY',
    strength: 'moderate',
    status: 'active',
    entry_price: 3500,
    stop_loss: 3480,
    take_profit: 3540,
    current_price: 3500,
    confidence: 70,
    timeframe: '15m',
    reasons: [],
    indicators: {},
    news_sentiment: null,
    telegram_sent: false,
    push_sent: false,
    expires_at: null,
    created_at: iso(1788416000),
    outcome: 'open',
    ...over,
  };
}

/** แถวโหมดถอย: ยังไม่ได้รัน migration 007 → ไม่มีคีย์ outcome เลย (select('*') ไม่คืนคอลัมน์ที่ไม่มี) */
function rowWithoutOutcomeColumn(over = {}) {
  const r = row(over);
  delete r.outcome;
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. บั๊ก 1 — ใบที่ ledger ปิดแล้ว ต้องไม่ถูกนับเป็น "โอกาสที่เปิดอยู่"
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ชุดยืนยันของ "ตัวกรองที่ทุกหน้าจอใช้"
 * รับฟังก์ชันเข้ามาเพื่อให้เอา "ฉบับก่อนแก้" มารันชุดเดียวกันได้ (negative control)
 */
function runLedgerSuite(isLive, expectPass) {
  const found = [];
  const t = (name, cond) => {
    if (cond) return;
    found.push(name);
    if (expectPass) failures.push({ name: `[ledger] ${name}`, message: 'ตัวกรองปล่อยใบที่ไม่ควรผ่าน หรือกันใบที่ควรผ่าน' });
  };

  t('ใบที่ยังเปิด (outcome=open) ต้องผ่าน', isLive(row({ outcome: 'open' })) === true);
  t('ใบที่โดน SL ต้องไม่ผ่าน (ยังค้าง status=active)', isLive(row({ outcome: 'sl' })) === false);
  t('ใบที่แตะ TP ต้องไม่ผ่าน', isLive(row({ outcome: 'tp' })) === false);
  t('ใบที่หมดเวลา (timeout) ต้องไม่ผ่าน', isLive(row({ outcome: 'timeout' })) === false);
  t('ใบที่ตัดสินไม่ได้ (unresolvable) ต้องไม่ผ่าน', isLive(row({ outcome: 'unresolvable' })) === false);
  t('ใบที่ status=expired ต้องไม่ผ่าน', isLive(row({ status: 'expired' })) === false);
  t('ใบที่ status=triggered ต้องไม่ผ่าน', isLive(row({ status: 'triggered' })) === false);
  t('โหมดถอย: ไม่มีคอลัมน์ outcome → ใบ active ต้องผ่านเหมือนเดิม',
    isLive(rowWithoutOutcomeColumn()) === true);
  t('โหมดถอย: ไม่มีคอลัมน์ outcome → ใบ expired ยังต้องไม่ผ่าน',
    isLive(rowWithoutOutcomeColumn({ status: 'expired' })) === false);
  t('ใบที่โดนปั๊มป้ายกลับทิศ แต่ ledger ยังเปิด ต้องยังผ่าน (flipped ≠ closed)',
    isLive(row({ outcome: 'open', flipped_at: iso(1788416000) })) === true);

  if (expectPass) passed += 10 - found.length;
  return found;
}

console.log('\n1. บั๊ก 1 — ตัวกรอง "ยังเป็นโอกาสที่เปิดอยู่" ที่ทุกหน้าจอ/แจ้งเตือนใช้ร่วมกัน\n');
runLedgerSuite(isLiveSignalRow, true);

console.log('\n   negative control: ฉบับก่อนแก้ (ดูแค่ status === "active") ต้องสอบตก\n');
{
  const before = (s) => s.status === 'active';
  const found = runLedgerSuite(before, false);
  await check(`ฉบับก่อนแก้ต้องตกอย่างน้อย 4 ข้อ (ตกจริง ${found.length}: ${found.join(' · ') || 'ไม่ตกเลย'})`,
    () => assert(found.length >= 4, 'ชุดยืนยันไม่มีฟัน — ฉบับก่อนแก้ผ่านมากเกินไป'));
}

console.log('\n   ตัวกรองต้องถูกเรียกจริงในทุกเส้นทางที่เจ้าของเห็น (ตรวจระดับซอร์ส)\n');
{
  const src = (rel) => readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
  const callSites = [
    ['src/app/signals/page.tsx', 'isLiveSignalRow', 'การ์ดและแถวสรุปบนหน้า /signals'],
    ['src/app/dashboard/page.tsx', 'isLiveSignalRow', 'การ์ด "สัญญาณ active ตอนนี้" และ 6 ใบแรกบน /dashboard'],
    ['src/hooks/useStore.ts', 'isLiveSignalRow', 'จุดแดงบนเมนู (unreadSignals)'],
    ['src/lib/push-server.ts', 'ledgerStillOpen', 'การเก็บตกแจ้งเตือน (loadPendingSignals)'],
    ['src/lib/signal-flips.ts', 'ledgerStillOpen', 'ตัวเลือกใบเก่าของคำเตือนกลับทิศ'],
  ];
  for (const [rel, needle, why] of callSites) {
    await check(`${rel} เรียก ${needle} — ${why}`, () =>
      assert(src(rel).includes(needle), `ไม่พบ ${needle} ใน ${rel} — เส้นทางนี้กลับไปโชว์ใบที่ปิดแล้วอีกครั้ง`));
  }

  /** ตัดคอมเมนต์ทิ้งก่อนไล่หา "โค้ดที่ห้ามมี" — ไม่งั้นคำเตือนในคอมเมนต์จะถูกจับเป็นของจริง */
  const codeOnly = (text) =>
    text
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');

  await check('ห้ามย้ายเงื่อนไข outcome ไปไว้ใน query ของ push-server (โหมดถอยจะดับเงียบ)', () =>
    assert(!/\.or\(\s*[`'"][^`'"]*outcome/.test(codeOnly(src('src/lib/push-server.ts'))),
      'พบ .or(...outcome...) ใน push-server.ts — บน DB ที่ยังไม่ได้รัน 007 จะได้ 42703 แล้วคืนชุดว่าง'));
}

console.log('\n   คำเตือนกลับทิศต้องไม่ไปเตือนใบที่ ledger ปิดไปแล้ว\n');
{
  const fresh = { user_id: 'user-1', symbol: 'XAUUSD', action: 'SELL', timeframe: '15m' };
  const base = { user_id: 'user-1', symbol: 'XAUUSD', action: 'BUY', timeframe: '15m', flipped_at: null, created_at: iso(1788410000) };

  await check('ใบเก่าที่ยังเปิดอยู่ → เจอ', () =>
    assertEqual(findFlipTargets(fresh, [{ id: 'a', ...base, outcome: 'open' }]).length, 1, 'ต้องเจอใบเก่า'));
  await check('ใบเก่าที่โดน SL ไปแล้ว → ไม่เจอ', () =>
    assertEqual(findFlipTargets(fresh, [{ id: 'a', ...base, outcome: 'sl' }]).length, 0, 'ห้ามเตือนให้ปิดไม้ที่ ledger ปิดไปแล้ว'));
  await check('โหมดถอย: ไม่มีคอลัมน์ outcome → ยังเจอเหมือนเดิม', () =>
    assertEqual(findFlipTargets(fresh, [{ id: 'a', ...base }]).length, 1, 'โหมดถอยต้องให้พฤติกรรมเดิม'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. บั๊ก 1 (ฝั่งเขียน) — ตัวเก็บผลต้องปั๊ม status คู่กับ outcome เสมอ
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n2. บั๊ก 1 ฝั่งเขียน — ตัวเก็บผลปั๊ม status คู่กับ outcome\n');

/** สัญญาณ + แท่ง สำหรับป้อน resolveSignal (รูปเดียวกับแถวจริงในตาราง signals) */
function ledgerCase(over = {}) {
  return {
    symbol: 'XAUUSD', market: 'GOLD', action: 'BUY', timeframe: '15m',
    entry_price: 100, stop_loss: 98, take_profit: 104,
    created_at: iso(1788400000), expires_at: null,
    ...over,
  };
}
const barsAt = (specs, start = 1788400900) =>
  specs.map(([o, h, l, c], i) => ({ t: start + i * 900, o, h, l, c }));

function runStampSuite(resolveFn, expectPass) {
  const found = [];
  const t = (name, cond) => {
    if (cond) return;
    found.push(name);
    if (expectPass) failures.push({ name: `[stamp] ${name}`, message: 'ตัวเก็บผลไม่ได้ปั๊ม status ตามที่ควร' });
  };

  const sl = resolveFn(ledgerCase(), barsAt([[100, 101, 97, 99]]));
  t('โดน SL → outcome=sl', sl?.outcome === 'sl');
  t('โดน SL → status=triggered', sl?.status === 'triggered');

  const tp = resolveFn(ledgerCase(), barsAt([[100, 105, 100, 104]]));
  t('แตะ TP → status=triggered', tp?.status === 'triggered');

  // ต้องเดินจนครบเพดานถือ (15m = 96 แท่ง) ถึงจะได้ timeout — จงใจไม่ตั้ง expires_at
  // ให้สั้น ๆ แล้วหวังให้มันตัดจบ เพราะ ledger ไม่อ่านคอลัมน์นั้นอีกแล้ว (ดูหัวไฟล์ข้อ 2)
  const timeout = resolveFn(
    ledgerCase(),
    barsAt(Array.from({ length: 96 }, () => [100, 100.5, 99.5, 100]))
  );
  t('หมดเวลา → outcome=timeout', timeout?.outcome === 'timeout');
  t('หมดเวลา → status=expired', timeout?.status === 'expired');

  const bad = resolveFn(ledgerCase({ stop_loss: 102 }), barsAt([[100, 101, 99, 100]]));
  t('ตัดสินไม่ได้ → outcome=unresolvable', bad?.outcome === 'unresolvable');
  t('ตัดสินไม่ได้ → status=cancelled', bad?.status === 'cancelled');

  // ใบที่ยังไม่ถึงเวลาต้องคืน null (ไม่ปั๊มอะไรเลย) — ห้ามไปเปลี่ยน status ของไม้ที่ยังเดินอยู่
  const stillRunning = resolveFn(ledgerCase(), barsAt([[100, 100.5, 99.5, 100]]));
  t('ยังตัดสินไม่ได้ → ต้องคืน null ไม่ใช่ปั๊มอะไรลงไป', stillRunning === null);

  // ผลจริงที่เจ้าของเห็น: หลังปั๊มแล้ว query แบบ status='active' ต้องไม่นับใบนี้อีก
  // (นี่คือรูปของ RPC get_dashboard_stats ซึ่งเป็น SQL ล้วน แก้ฝั่งอ่านไม่ได้)
  const dbRow = { ...row({ outcome: 'open' }), ...(sl ?? {}) };
  t('หลังปั๊มแล้ว SQL ที่นับ status=\'active\' ต้องไม่เห็นใบนี้', dbRow.status !== 'active');

  if (expectPass) passed += 9 - found.length;
  return found;
}

runStampSuite(resolveSignal, true);
for (const [outcome, status] of Object.entries(STATUS_FOR_OUTCOME)) {
  await check(`แมป outcome=${outcome} → status=${status} อยู่ในรายการที่ CHECK constraint รับ`, () =>
    assert(['active', 'triggered', 'expired', 'cancelled'].includes(status),
      `status '${status}' ไม่อยู่ใน CHECK ของ 002_trading_schema.sql — PATCH จะล้มทั้งใบ`));
}

console.log('\n   negative control: ฉบับก่อนแก้ (ปั๊มแต่ outcome ไม่แตะ status) ต้องสอบตก\n');
{
  const before = (sig, bars) => {
    const out = resolveSignal(sig, bars);
    if (out && 'status' in out) delete out.status;
    return out;
  };
  const found = runStampSuite(before, false);
  await check(`ฉบับก่อนแก้ต้องตกอย่างน้อย 4 ข้อ (ตกจริง ${found.length})`,
    () => assert(found.length >= 4, 'ชุดยืนยันไม่มีฟัน — ฉบับที่ไม่ปั๊ม status ผ่านมากเกินไป'));
}

await check('resolve-signals.mjs ปั๊ม status ในเส้นทางที่คืนผลจริง (ตรวจระดับซอร์ส)', () => {
  const src = readFileSync(path.join(ROOT, 'scripts', 'resolve-signals.mjs'), 'utf8');
  assert(/status:\s*STATUS_FOR_OUTCOME\[outcome\]/.test(src), 'finish() ไม่ได้ปั๊ม status');
  assert(/status:\s*STATUS_FOR_OUTCOME\.unresolvable/.test(src), 'ทางออก unresolvable ไม่ได้ปั๊ม status');
});

console.log('\n   ความถี่สัญญาณต้องไม่เปลี่ยนเพราะการปั๊ม status (ตัวกันซ้ำต้องยังเห็นใบที่ปิดแล้ว)\n');
{
  // ถ้า query กันซ้ำยังกรอง status='active' อยู่ ใบที่เพิ่งโดน SL จะหลุดจากตัวกันซ้ำ
  // แล้ว symbol นั้นจะออกสัญญาณใหม่ได้เร็วขึ้น = เปลี่ยนความถี่แจ้งเตือนโดยไม่มีใครสั่ง
  const dedupeSites = [
    'scripts/scan-universe.mjs',
    'src/app/api/cron/scan-markets/route.ts',
    'src/app/api/signals/scan/route.ts',
    'supabase/functions/scan-signals/index.ts',
  ];
  for (const rel of dedupeSites) {
    await check(`${rel}: query กันซ้ำต้องไม่กรอง status`, () => {
      const src = readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
      // เจาะจงที่ query กันซ้ำเท่านั้น (หน้าต่างชื่อ `since`) — query ของตัวตรวจกลับทิศ
      // ใน scan-universe.mjs ใช้ `flipSince` และ **ต้อง** กรอง status ต่อไป เพราะการเตือน
      // ให้ปิดไม้ที่หมดอายุ/ปิดบัญชีไปแล้ว คือการเตือนผิดใบ
      const offending = /\.eq\((['"])status\1,\s*(['"])active\2\)[\s\S]{0,120}?\.gte\((['"])created_at\3,\s*since\)/.test(src);
      assert(!offending, 'พบ .eq(status, active) ต่อด้วย .gte(created_at, since) — ใบที่ ledger ปิดแล้วจะหลุดจากตัวกันซ้ำ แล้วความถี่แจ้งเตือนจะเปลี่ยนโดยไม่มีใครสั่ง');
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. บั๊ก 2 — TTL ต่อ timeframe
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n3. บั๊ก 2 — อายุสัญญาณ (TTL) ต่อ timeframe\n');

/** ความยาวหนึ่งแท่งของแต่ละเลน — ใช้แปลง MAX_HOLD_BARS เป็นเวลา */
const TF_BAR_MS = { '15m': 15 * MIN, '1H': HOUR, '1D': 24 * HOUR };
const EXPECTED_TTL_MS = { '15m': 24 * HOUR, '1H': 48 * HOUR, '1D': 7 * 24 * HOUR };

await check('MAX_HOLD_BARS ต้องไม่ถูกแตะ — งานแก้การแสดงผลห้ามขยับเพดานถือของ ledger', () => {
  // ไม่ใช่แค่ค่าคงที่ในไฟล์ แต่คือ "ไม้หนึ่งไม้ให้เวลาเดินกี่แท่ง" ซึ่งเป็นนิยามของสมุดบัญชี
  // เคยเกือบถูกเปลี่ยนโดยอ้อมมาแล้ว (ผ่าน expires_at ที่มาตัดก่อน — ดูหัวไฟล์ข้อ 2)
  for (const [tf, want] of Object.entries({ '15m': 96, '1H': 24, '1D': 20 })) {
    assertEqual(MAX_HOLD_BARS[tf], want, `MAX_HOLD_BARS['${tf}'] เปลี่ยนไป`);
  }
  // และต้องเปลี่ยนโดยอ้อมไม่ได้ด้วย: เพดานเวลาของ ledger ต้องกว้างพอให้ 15m
  // เดินครบ 96 แท่งในกรณีที่ช้าที่สุดของทองจริง (73.75 ชม. — วัดจากแท่งในรีโป)
  const worstCaseH = 73.75;
  assert(ledgerTtlMs('15m') >= worstCaseH * HOUR,
    `เพดานเวลาของ ledger เลน 15m (${ledgerTtlMs('15m') / HOUR} ชม.) แคบกว่าหน้าต่าง 96 แท่งกรณีช้าสุด ` +
    `(${worstCaseH} ชม.) → MAX_HOLD_BARS['15m'] จะกลายเป็นค่าที่ไปไม่ถึง = เปลี่ยนเพดานถือโดยอ้อม`);
  // ส่วน 1H/1D นั้นถูกตัดด้วยเวลามาแต่ไหนแต่ไร (24 แท่ง 1H กินได้ถึง 115 ชม. > 48 ชม.
  // และ 20 แท่ง 1D กินได้ 599–1,320 ชม. > 168 ชม.) — เรื่องค้างเก่า ไม่ใช่ของใหม่
  assert(ledgerTtlMs('1D') < MAX_HOLD_BARS['1D'] * TF_BAR_MS['1D'],
    'ถ้าวันไหน 1D เดินครบ 20 แท่งได้จริง แปลว่ามีคนขยับเพดานเวลา — ต้องเป็นการตัดสินใจของเจ้าของ');
});

/**
 * ⚠ เคยมีชุดยืนยันตรงนี้ที่บังคับว่า `signalTtlMs(tf) >= MAX_HOLD_BARS[tf] × ความยาวแท่ง`
 *   **ถูกถอดออกโดยตั้งใจ ห้ามใส่กลับ** — มันเทียบเวลาแท่งกับเวลานาฬิกา จึงผ่านได้ด้วย
 *   เลขที่ผิด (96 × 15 นาที = 24 ชม. ทั้งที่ 96 แท่งทองกินเวลาจริงถึง 73.75 ชม.)
 *   และที่แย่กว่านั้นคือมันไป "รับรอง" การตั้ง TTL 24 ชม. ซึ่งตอนนั้นเปลี่ยนผลใน ledger
 *   ไป 11.6% ของใบ (รายละเอียดที่หัวไฟล์ข้อ 2)
 *
 *   ตอนนี้ TTL ฝั่งแสดงผลไม่มีหน้าที่ต้องคลุมเพดานถือของ ledger อีกแล้ว เพราะ ledger
 *   มีนาฬิกาของตัวเอง — สิ่งที่ต้องเฝ้าคือ "สองเรือนนี้ต้องไม่ผูกกัน" ซึ่งยืนยันแยกไว้
 *   ในหัวข้อ "ledger ต้องไม่ขึ้นกับ TTL ฝั่งแสดงผล" ด้านล่าง
 */
function runTtlSuite(ttlFn, expectPass) {
  const found = [];
  const t = (name, cond) => {
    if (cond) return;
    found.push(name);
    if (expectPass) failures.push({ name: `[ttl] ${name}`, message: 'TTL ไม่ตรงกับที่ตั้งไว้' });
  };

  for (const [tf, want] of Object.entries(EXPECTED_TTL_MS)) {
    t(`${tf} ได้ค่าตามที่ตั้ง (${want / HOUR} ชม.)`, ttlFn(tf) === want);
  }
  t('เทียบชื่อ timeframe แบบไม่สนตัวพิมพ์ (1h ต้องได้เท่ากับ 1H)', ttlFn('1h') === ttlFn('1H'));
  t('15M ต้องไม่ตกไปกินค่า default', ttlFn('15M') === EXPECTED_TTL_MS['15m']);

  if (expectPass) passed += 5 - found.length;
  return found;
}

runTtlSuite(signalTtlMs, true);

console.log('\n   ledger ต้องไม่ขึ้นกับ TTL ฝั่งแสดงผล — นาฬิกาสองเรือนต้องแยกจากกันจริง\n');

await check('resolveSignal ต้องไม่อ่านคอลัมน์ expires_at อีกแล้ว (ตรวจระดับซอร์ส)', () => {
  const src = readFileSync(path.join(ROOT, 'scripts', 'resolve-signals.mjs'), 'utf8');
  // ตัดคอมเมนต์ทิ้งก่อน ไม่งั้นคำอธิบายที่ "พูดถึง" คอลัมน์นี้จะถูกนับว่าเป็นการอ่านค่าจริง
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const body = code.slice(code.indexOf('export function resolveSignal'));
  assert(!/sig\.expires_at/.test(body),
    'resolveSignal กลับไปอ่าน expires_at จากแถวแล้ว — หน้าต่างฝั่งแสดงผลจะเปลี่ยนผลใน ledger อีกรอบ');
  assert(/ledgerTtlMs\(sig\.timeframe\)/.test(body), 'ต้องใช้ ledgerTtlMs ของตัวเองเป็นเส้นตัด');
});

await check('เพดานเวลาของ ledger ต้องเท่ากับพฤติกรรมเดิมก่อนงาน 2026-09-03 ทุกเลน', () => {
  // เดิม expires_at = created_at + (tf === '1H' ? 48 ชม. : 7 วัน) และ resolveSignal ใช้ค่านั้น
  // ตารางใหม่ต้องให้เลขเดียวกันเป๊ะ ไม่งั้น = แอบเปลี่ยนสมุดบัญชีระหว่างแก้การแสดงผล
  const before = (tf) => (tf === '1H' ? 48 * HOUR : 7 * 24 * HOUR);
  for (const tf of ['15m', '1H', '1D']) {
    assertEqual(ledgerTtlMs(tf), before(tf), `เพดานเวลาของ ledger เลน ${tf} เปลี่ยนไปจากพฤติกรรมเดิม`);
  }
  assertEqual(ledgerTtlMs('ไม่รู้จัก'), before('ไม่รู้จัก'), 'สาขา default ของ ledger เปลี่ยนไป');
});

await check('ย่อ TTL ฝั่งแสดงผลของ 15m ลงเหลือ 24 ชม. ต้องไม่ขยับผลใน ledger แม้แต่ไม้เดียว', () => {
  // จำลองแท่งทองจริง: 15m ที่มีช่องว่างพักตลาด ทำให้ 96 แท่งกินเวลาเกิน 24 ชม.
  // (ของจริงวัดได้ 24.75–73.75 ชม.) ถ้า ledger ยังผูกกับ TTL 24 ชม. ใบนี้จะถูกตัดกลางคัน
  const t0 = 1788400000;
  let t = t0;
  const bars = Array.from({ length: 96 }, (_, i) => {
    t += 900 + (i % 24 === 23 ? 3600 : 0);
    return { t, o: 100, h: 100.5, l: 99.5, c: 100 };
  });
  const spanH = (bars[95].t - bars[0].t) / 3600;
  assert(spanH > 24, `ชุดจำลองต้องกินเวลาเกิน 24 ชม. ไม่งั้นเทสต์นี้ไม่ได้วัดอะไร (ได้ ${spanH.toFixed(2)})`);

  const out = resolveSignal(ledgerCase({ created_at: iso(t0) }), bars);
  assertEqual(out?.bars_held, 96, 'ใบ 15m ต้องเดินครบเพดาน 96 แท่งได้ ไม่ถูก TTL ฝั่งแสดงผลตัดก่อน');
  assertEqual(out?.outcome, 'timeout', 'และปิดเป็น timeout ที่แท่งที่ 96');

  // ตอกย้ำ: ใส่ expires_at 24 ชม. ลงไปบนแถวเลย ผลต้องไม่ขยับ
  const withExp = resolveSignal(
    ledgerCase({ created_at: iso(t0), expires_at: iso(t0 + 24 * 3600) }),
    bars
  );
  assertEqual(withExp?.bars_held, out.bars_held, 'expires_at บนแถวไม่ควรมีผลกับ ledger อีกแล้ว');
  assertEqual(withExp?.exit_price, out.exit_price, 'ราคาออกต้องเท่าเดิม');
});

console.log('\n   negative control: ถ้า ledger กลับไปผูกกับ TTL ฝั่งแสดงผล ต้องจับได้\n');
await check('ฉบับที่ใช้ TTL ฝั่งแสดงผลเป็นเส้นตัด ต้องให้ผลต่างออกไป (ชุดยืนยันมีฟันจริง)', () => {
  const t0 = 1788400000;
  let t = t0;
  const bars = Array.from({ length: 96 }, (_, i) => {
    t += 900 + (i % 24 === 23 ? 3600 : 0);
    return { t, o: 100, h: 100.5, l: 99.5, c: 100 };
  });
  // เลียนแบบตรรกะเดิม: ตัดที่แท่งแรกที่ t >= created + TTL ฝั่งแสดงผล (24 ชม.)
  const cut = t0 + signalTtlMs('15m') / 1000;
  const idx = bars.findIndex((b) => b.t >= cut);
  assert(idx >= 0 && idx + 1 < 96,
    `TTL 24 ชม. ต้องตัดกลางคันจริง (ตัดที่แท่งที่ ${idx + 1} จาก 96) ไม่งั้น negative control ไม่มีความหมาย`);
});

console.log('\n   negative control: ฉบับก่อนแก้ (tf === "1H" ? 48 ชม. : 7 วัน) ต้องสอบตก\n');
{
  const before = (tf) => (tf === '1H' ? 48 * HOUR : 7 * 24 * HOUR);
  const found = runTtlSuite(before, false);
  await check(`ฉบับก่อนแก้ต้องตกอย่างน้อย 3 ข้อ (ตกจริง ${found.length}: ${found.join(' · ') || 'ไม่ตกเลย'})`,
    () => assert(found.length >= 3, 'ชุดยืนยันไม่มีฟัน — สูตรเดิมผ่านมากเกินไป'));
}

console.log('\n   ค่าที่ generateSignal เขียนลง expires_at จริง ต้องตรงกับตาราง TTL\n');
{
  // แท่งขาขึ้นเรียบ ๆ ยาวพอให้ MA200 มีความหมาย — ใช้ชุดเดียวกันทุก timeframe
  const candles = [];
  for (let i = 0; i < 260; i++) {
    const base = 100 + i * 0.05 + Math.sin(i / 7) * 0.4;
    candles.push({
      timestamp: iso(1770000000 + i * 86400),
      open: base,
      high: base * 1.004,
      low: base * 0.996,
      close: base * 1.001,
      volume: 1000,
    });
  }
  for (const [tf, want] of Object.entries(EXPECTED_TTL_MS)) {
    await check(`generateSignal(${tf}) → expires_at ห่างจาก created_at ${want / HOUR} ชม.`, () => {
      const sig = generateSignal({ symbol: 'XAUUSD', name: 'Gold', market: 'GOLD', candles, timeframe: tf });
      assert(sig !== null, 'ชุดแท่งทดสอบต้องสร้างสัญญาณได้ ไม่งั้นเทสต์นี้ไม่ได้วัดอะไรเลย');
      const gap = new Date(sig.expires_at).getTime() - new Date(sig.created_at).getTime();
      assert(Math.abs(gap - want) <= 50, `ห่างกัน ${gap} ms แต่ต้องได้ ${want} ms`);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. บั๊ก 3 — แท่งที่ยังก่อตัวต้องไม่เข้าชุดคำนวณ แต่ราคาสดต้องยังสด
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n4. บั๊ก 3 — ตัดแท่งที่ยังก่อตัวออกจากชุดที่ใช้คำนวณสัญญาณ\n');

/**
 * ตัวเลขทั้งหมดในบล็อกนี้คือของจริงที่วัดจากคำตอบ Yahoo ของ GC=F เมื่อ 2026-09-03T06:19:53Z
 * (ไม่ใช่ตัวเลขสมมติ — แท่งท้ายสุดที่ Yahoo ส่งมาคือ 06:09:52Z ซึ่งมีเศษวินาที)
 */
const Y = {
  now: 1788416393,          // 2026-09-03T06:19:53Z
  rmt: 1788415792,          // meta.regularMarketTime = 06:09:52Z
  m15: [1788412500, 1788413400, 1788414300, 1788415200, 1788415792],
  h1: [1788404400, 1788408000, 1788411600, 1788415200, 1788415792],
  d1: [1788148800, 1788235200, 1788321600, 1788408000],
  sessionStart: 1788408000, // 09-03T04:00Z (= ประทับเวลาของแท่งรายวันวันนี้พอดี)
  sessionEnd: 1788494340,   // 09-04T03:59Z
};
/** ฐานเวลาที่ลงตัวนาที สำหรับเคสสังเคราะห์ */
const B = 1788416400;

const lastClosedTs = (split, timestamps) =>
  split.closed.length ? timestamps[split.closed[split.closed.length - 1]] : null;

function runClosedBarSuite(splitFn, expectPass) {
  const found = [];
  const t = (name, cond) => {
    if (cond) return;
    found.push(name);
    if (expectPass) failures.push({ name: `[bars] ${name}`, message: 'แท่งที่ยังก่อตัวหลุดเข้าชุดคำนวณ หรือแท่งที่ปิดแล้วถูกทิ้ง' });
  };

  const s15 = splitFn(Y.m15, '15m', Y.now * 1000, { start: Y.sessionStart, end: Y.sessionEnd, lastTradeAt: Y.rmt });
  t('15m: แท่งสดที่ประทับด้วยเวลาซื้อขายล่าสุด (06:09:52) ต้องไม่อยู่ในชุดคำนวณ',
    !s15.closed.includes(4) && s15.forming.includes(4));
  t('15m: แท่งปิดใบสุดท้ายต้องเป็น 06:00', lastClosedTs(s15, Y.m15) === 1788415200);

  // กลางแท่ง 06:00–06:15 (นาทีที่ 5 ของคาบ) — แท่ง 06:00 ยังปิดไม่ครบ ต้องถูกตัดด้วย
  const s15mid = splitFn(Y.m15, '15m', 1788415500 * 1000, { start: Y.sessionStart, end: Y.sessionEnd, lastTradeAt: Y.rmt });
  t('15m: ตอนแท่งปัจจุบันยังปิดไม่ครบคาบ แท่งปิดใบสุดท้ายต้องถอยไป 05:45',
    lastClosedTs(s15mid, Y.m15) === 1788414300);

  const s1h = splitFn(Y.h1, '1h', Y.now * 1000, { start: Y.sessionStart, end: Y.sessionEnd, lastTradeAt: Y.rmt });
  t('1H: แท่งปิดใบสุดท้ายต้องเป็น 05:00 (06:00 ยังก่อตัวอยู่)', lastClosedTs(s1h, Y.h1) === 1788411600);

  const s1d = splitFn(Y.d1, '1d', Y.now * 1000, { start: Y.sessionStart, end: Y.sessionEnd, lastTradeAt: Y.rmt });
  t('1D: แท่งของรอบวันนี้ต้องถูกตัด เหลือแท่งปิดใบสุดท้ายเป็นเมื่อวาน',
    lastClosedTs(s1d, Y.d1) === 1788321600);

  // ── กติกา "ตรวจเฉพาะแท่งท้ายสุด" ──────────────────────────────────────────────
  // แท่งรายวันของ Yahoo ประทับที่เวลาเปิดรอบ ระยะจากประทับถึงเวลาปิดจริงจึงไม่เท่ากับ
  // 24 ชม. ถ้าเอากติกา now >= ts + 24 ชม. ไปไล่ทุกแท่ง แท่งของ "เมื่อวานที่ปิดไปแล้ว"
  // จะโดนทิ้งด้วยทุกวัน แล้วอินดิเคเตอร์รายวันจะขยับช้าไปหนึ่งแท่งโดยไม่มีใครเห็น
  const interior = [B - 44 * 3600, B - 20 * 3600, B - 6 * 3600];
  const sInterior = splitFn(interior, '1d', B * 1000, {});
  t('1D: แท่งที่มีเพื่อนบ้านขวาต้องไม่ถูกทิ้ง แม้จะอายุน้อยกว่า 24 ชม.',
    sInterior.closed.length === 2 && lastClosedTs(sInterior, interior) === B - 20 * 3600);

  // หุ้นไทยตอนตลาดปิด: Yahoo ชี้ start ไปรอบพรุ่งนี้ → แท่งวันนี้ปิดแล้วแน่นอน
  const thai = [B - 41 * 3600, B - 17 * 3600];
  const sThai = splitFn(thai, '1d', B * 1000, { start: B + 7 * 3600, end: B + 13 * 3600 });
  t('1D: รอบใหม่เริ่มแล้ว (start ชี้ไปพรุ่งนี้) → แท่งของวันนี้ต้องถูกนับว่าปิดแล้ว',
    sThai.closed.length === 2);

  // ตลาดปิดยาว: ไม่มีอะไรให้ตัด
  const stale = [B - 5 * 86400, B - 4 * 86400, B - 3 * 86400];
  const sStale = splitFn(stale, '1d', B * 1000, {});
  t('ตลาดปิดยาว: ทุกแท่งปิดครบแล้ว ต้องไม่ตัดอะไรทิ้ง', sStale.closed.length === 3 && sStale.forming.length === 0);

  if (expectPass) passed += 9 - found.length;
  return found;
}

runClosedBarSuite(splitClosedBars, true);

await check('ตารางความยาวแท่งครบทุก interval ที่ระบบยิงจริง', () => {
  for (const [interval, sec] of Object.entries({ '15m': 900, '1h': 3600, '1d': 86400 })) {
    assertEqual(BAR_SECONDS[interval], sec, `BAR_SECONDS['${interval}'] ผิด`);
  }
});

console.log('\n   negative control 1: ฉบับก่อนแก้ (ไม่ตัดอะไรเลย) ต้องสอบตก\n');
{
  const noTrim = (timestamps) => ({ closed: timestamps.map((_, i) => i), forming: [] });
  const found = runClosedBarSuite(noTrim, false);
  await check(`ฉบับก่อนแก้ต้องตกอย่างน้อย 4 ข้อ (ตกจริง ${found.length}: ${found.join(' · ') || 'ไม่ตกเลย'})`,
    () => assert(found.length >= 4, 'ชุดยืนยันไม่มีฟัน — ฉบับที่ไม่ตัดอะไรเลยผ่านมากเกินไป'));
}

console.log('\n   negative control 2: กติกาที่ไล่ตรวจ "ทุกแท่ง" ด้วยคาบตายตัว ต้องสอบตกที่เลนรายวัน\n');
{
  const everyBar = (timestamps, interval, nowMs, session = {}) => {
    const barSec = BAR_SECONDS[interval] ?? 86400;
    const nowSec = Math.floor(nowMs / 1000);
    const closed = [];
    const forming = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = Number(timestamps[i]);
      const bad = !Number.isFinite(ts) || ts % 60 !== 0 || Number(session.lastTradeAt) === ts || nowSec < ts + barSec;
      (bad ? forming : closed).push(i);
    }
    return { closed, forming };
  };
  const found = runClosedBarSuite(everyBar, false);
  await check(`กติกาไล่ทุกแท่งต้องตกอย่างน้อย 2 ข้อ (ตกจริง ${found.length}: ${found.join(' · ') || 'ไม่ตกเลย'})`,
    () => assert(found.length >= 2, 'ชุดยืนยันไม่กันการทิ้งแท่งรายวันที่ปิดแล้ว'));
}

console.log('\n   fetchChart ตัวจริง: ชุดคำนวณต้องเป็นแท่งปิด แต่ราคาบนหน้าเว็บต้องยังสด\n');
{
  const closes = { 1788412500: 3490, 1788413400: 3492, 1788414300: 3495, 1788415200: 3500, 1788415792: 3512.7 };
  const payload = {
    chart: {
      result: [{
        meta: {
          regularMarketPrice: 3512.7,          // ราคาสดของแท่งที่ยังก่อตัว
          regularMarketTime: Y.rmt,
          regularMarketDayHigh: 3515,
          regularMarketDayLow: 3480,
          regularMarketVolume: 9999,
          currentTradingPeriod: { regular: { start: Y.sessionStart, end: Y.sessionEnd } },
        },
        timestamp: Y.m15,
        indicators: {
          quote: [{
            open: Y.m15.map((t) => closes[t] - 1),
            high: Y.m15.map((t) => closes[t] + 1),
            low: Y.m15.map((t) => closes[t] - 2),
            close: Y.m15.map((t) => closes[t]),
            volume: Y.m15.map(() => 100),
          }],
        },
      }],
    },
  };

  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  let chart;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => payload });
    Date.now = () => Y.now * 1000;
    chart = await fetchChart('XAUUSD', 'GOLD', '15m', '1mo');
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }

  await check('ชุดคำนวณจบที่แท่งปิดใบสุดท้าย (06:00) ไม่ใช่แท่งสด 06:09:52', () =>
    assertEqual(chart.candles[chart.candles.length - 1].timestamp, iso(1788415200), 'แท่งสดหลุดเข้าชุดคำนวณ'));

  await check('ไม่มีแท่งไหนในชุดคำนวณใหม่กว่าแท่งปิดใบสุดท้าย', () =>
    assert(chart.candles.every((c) => Date.parse(c.timestamp) / 1000 <= 1788415200), 'มีแท่งเกินขอบเข้ามา'));

  await check('แท่งสดถูกส่งออกไปแยกต่างหาก ไม่ได้ถูกทิ้ง (formingCandle)', () => {
    assertEqual(chart.formingCandle?.timestamp, iso(Y.rmt), 'formingCandle ต้องเป็นแท่งสดใบล่าสุด');
    assertEqual(chart.formingCandle?.close, 3512.7, 'ราคาปิดของแท่งสดต้องเป็นของจริง');
  });

  await check('ราคาบนหน้าเว็บยังเป็นราคาล่าสุดจริง ไม่ใช่ราคาปิดของแท่งเมื่อ 15 นาทีก่อน', () => {
    assertEqual(chart.quote?.price, 3512.7, 'quote.price ต้องเป็นราคาสด');
    assert(chart.quote.price !== chart.candles[chart.candles.length - 1].close,
      'ราคาสดต้องไม่ถูกลากกลับไปเท่ากับราคาปิดของแท่งที่ใช้คำนวณ');
  });

  await check('ฐานเทียบของ change คือแท่งปิดใบสุดท้าย (ตัวเลขเท่าเดิมกับก่อนแก้)', () => {
    const expected = 3512.7 - 3500;
    assert(Math.abs(chart.quote.change - expected) < 1e-9, `change ควรเป็น ${expected} แต่ได้ ${chart.quote.change}`);
  });

  await check('high/low ของรอบปัจจุบันยังมาจาก meta ตามเดิม', () => {
    assertEqual(chart.quote.high_24h, 3515, 'high_24h เพี้ยน');
    assertEqual(chart.quote.low_24h, 3480, 'low_24h เพี้ยน');
  });
}

console.log('\n   ทุกเส้นทางที่ประกอบแท่งจาก Yahoo ต้องเรียกตัวตัดแท่ง (ตรวจระดับซอร์ส)\n');
{
  const sites = [
    ['src/lib/market-data.ts', 'คอขวดของทุกเส้นทางโปรดักชัน (ตัวสแกน GitHub Actions + ทุก API route)'],
    ['supabase/functions/scan-signals/index.ts', 'สำเนาฝั่ง Edge ที่ผลิตสัญญาณเองได้ถ้าถูกติดตั้ง'],
  ];
  for (const [rel, why] of sites) {
    await check(`${rel} เรียก splitClosedBars ใน fetchChart — ${why}`, () => {
      const src = readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
      assert(/splitClosedBars\(timestamps,\s*interval,\s*Date\.now\(\)/.test(src),
        'ไม่พบการเรียก splitClosedBars ที่จุดประกอบแท่ง — แท่งสดจะไหลกลับเข้าชุดคำนวณ');
    });
  }

  await check('monitor-positions ยังได้ "แท่งของรอบปัจจุบัน" ไปหา sessionStart (ห้ามถอยไปแท่งเมื่อวาน)', () => {
    const src = readFileSync(path.join(ROOT, 'src/app/api/cron/monitor-positions/route.ts'), 'utf8');
    assert(src.includes('chart.formingCandle?.timestamp'),
      'ถ้าใช้แต่แท่งปิดใบสุดท้าย sessionStart จะถอยไปหนึ่งรอบ แล้วออเดอร์จะถูกปิดผิดด้วยช่วง high/low ของรอบก่อน');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. บั๊ก 4 — อายุของ "สัญญาณค้าง" ที่ยังคุ้มจะเก็บตกไปแจ้ง
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n5. บั๊ก 4 — เพดานอายุของการเก็บตกแจ้งเตือน ต้องเป็นของแต่ละเลน\n');

function runPendingAgeSuite(ageFn, expectPass) {
  const found = [];
  const t = (name, cond) => {
    if (cond) return;
    found.push(name);
    if (expectPass) failures.push({ name: `[pending] ${name}`, message: 'เพดานอายุการเก็บตกไม่ตรงกับเลนของมัน' });
  };

  t('15m เก็บตกได้ไม่เกิน 1 ชม. (4 แท่ง)', ageFn('15m') === HOUR);
  t('1H เก็บตกได้ไม่เกิน 4 ชม. (4 แท่ง)', ageFn('1H') === 4 * HOUR);
  t('1D คงเพดานเดิม 6 ชม. (4 แท่งเกิน TTL ของ push จึงถูกเพดานตัด)', ageFn('1D') === 6 * HOUR);
  t('ไม่มีเลนไหนเกินเพดาน 6 ชม. ของ push', ['15m', '1H', '1D'].every((tf) => ageFn(tf) <= 6 * HOUR));
  t('timeframe ที่ไม่รู้จัก/ว่าง คงพฤติกรรมเดิม (เพดาน 6 ชม.)', ageFn(null) === 6 * HOUR && ageFn('4H') === 6 * HOUR);
  t('เลนเร็วต้องสั้นกว่าเลนช้าเสมอ', ageFn('15m') < ageFn('1H') && ageFn('1H') < ageFn('1D'));

  if (expectPass) passed += 6 - found.length;
  return found;
}

runPendingAgeSuite(pendingMaxAgeMsFor, true);

await check('เพดานสูงสุดยังผูกกับ TTL ของ push (6 ชม.)', () =>
  assertEqual(PUSH_STATE_CONFIG.PENDING_MAX_AGE_MS, 6 * HOUR, 'เพดานเปลี่ยนไปโดยไม่ได้ตั้งใจ'));

console.log('\n   negative control: ฉบับก่อนแก้ (6 ชม. เท่ากันทุกเลน) ต้องสอบตก\n');
{
  const before = () => 6 * HOUR;
  const found = runPendingAgeSuite(before, false);
  await check(`ฉบับก่อนแก้ต้องตกอย่างน้อย 3 ข้อ (ตกจริง ${found.length}: ${found.join(' · ') || 'ไม่ตกเลย'})`,
    () => assert(found.length >= 3, 'ชุดยืนยันไม่มีฟัน — เพดานเดียวทุกเลนผ่านมากเกินไป'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. loadPendingSignals ตัวจริง — ทางที่แจ้งเตือนออกจริง
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n6. loadPendingSignals ตัวจริง (ฐานข้อมูลปลอม) — ใบที่ปิดแล้วต้องไม่ถูกเด้ง\n');

/**
 * Supabase ปลอมที่รองรับเท่าที่ loadPendingSignals ใช้จริง
 *
 * `missingColumns` จำลอง DB ที่ยังไม่ได้รัน migration 007: ถ้า query อ้างถึงคอลัมน์นั้น
 * จะตอบ 42703 เหมือนของจริง — ด่านนี้ทำให้เทสต์แดงทันทีถ้ามีใครย้ายเงื่อนไข outcome
 * จากโค้ดไปไว้ใน query (ซึ่งจะทำให้การเก็บตกดับเงียบทั้งระบบบน DB ที่ยังไม่ได้ migrate)
 */
function makeFakeDb(rows, { missingColumns = [] } = {}) {
  const touched = [];
  const guard = (text) => {
    for (const col of missingColumns) {
      if (String(text).includes(col)) {
        const err = new Error(`column signals.${col} does not exist`);
        err.code = '42703';
        return err;
      }
    }
    return null;
  };

  return {
    calls: touched,
    from(table) {
      if (table !== 'signals') throw new Error(`ฐานข้อมูลปลอมนี้รองรับแค่ตาราง signals (ขอ ${table})`);
      const filters = [];
      let missingErr = null;
      let limit = Infinity;
      const b = {
        select(cols) {
          touched.push(`select:${cols}`);
          missingErr = missingErr ?? guard(cols === '*' ? '' : cols);
          return b;
        },
        eq(col, val) { touched.push(`eq:${col}`); missingErr = missingErr ?? guard(col); filters.push((r) => r[col] === val); return b; },
        gte(col, val) { touched.push(`gte:${col}`); missingErr = missingErr ?? guard(col); filters.push((r) => String(r[col] ?? '') >= String(val)); return b; },
        or(expr) {
          touched.push(`or:${expr}`);
          missingErr = missingErr ?? guard(expr);
          const clauses = String(expr).split(',').map((c) => c.trim());
          filters.push((r) => clauses.some((c) => {
            const [col, op, ...rest] = c.split('.');
            const val = rest.join('.');
            if (op === 'is' && val === 'null') return r[col] == null;
            if (op === 'gt') return r[col] != null && String(r[col]) > val;
            throw new Error(`ฐานข้อมูลปลอมไม่รองรับเงื่อนไข or "${c}"`);
          }));
          return b;
        },
        order() { return b; },
        limit(n) { limit = n; return b; },
        then(resolve) {
          if (missingErr) return resolve({ data: null, error: missingErr });
          const data = rows
            .filter((r) => filters.every((f) => f(r)))
            .sort((a, c) => (a.created_at < c.created_at ? 1 : -1))
            .slice(0, limit);
          return resolve({ data, error: null });
        },
      };
      return b;
    },
  };
}

{
  const now = Date.parse('2026-09-03T06:00:00.000Z');
  const at = (msAgo, over) => row({ created_at: new Date(now - msAgo).toISOString(), ...over });

  await check('ใบที่ ledger ปิดแล้ว (outcome=sl) ต้องไม่ถูกกวาดมาแจ้ง · ใบที่ยังเปิดต้องได้', async () => {
    const open = at(10 * MIN, { symbol: 'OPEN', outcome: 'open' });
    const closed = at(10 * MIN, { symbol: 'CLOSED', outcome: 'sl' });
    const res = await loadPendingSignals(makeFakeDb([open, closed]), 'user-1', now);
    assertEqual(res.error, null, 'ต้องไม่มี error');
    assertEqual(res.signals.length, 1, 'ต้องเหลือแค่ใบที่ยังเปิด');
    assertEqual(res.signals[0].symbol, 'OPEN', 'ใบที่หลุดมาต้องเป็นใบที่ยังเปิด');
  });

  await check('ใบ 15m ที่ค้างมา 3 ชม. ต้องไม่ถูกเด้ง (เกิน 4 แท่งของเลนตัวเอง)', async () => {
    const stale = at(3 * HOUR, { symbol: 'STALE15', timeframe: '15m' });
    const fresh = at(30 * MIN, { symbol: 'FRESH15', timeframe: '15m' });
    const res = await loadPendingSignals(makeFakeDb([stale, fresh]), 'user-1', now);
    assertEqual(res.signals.length, 1, 'ใบ 15m ที่ค้าง 3 ชม. ต้องตกไป');
    assertEqual(res.signals[0].symbol, 'FRESH15', 'ใบที่เหลือต้องเป็นใบสด');
  });

  await check('ใบ 1D ที่ค้างมา 3 ชม. ยังต้องถูกเด้ง (พฤติกรรมเดิมของเลนช้า)', async () => {
    const res = await loadPendingSignals(makeFakeDb([at(3 * HOUR, { symbol: 'D1', timeframe: '1D' })]), 'user-1', now);
    assertEqual(res.signals.length, 1, 'เลน 1D ต้องไม่ถูกกระทบ');
  });

  await check('ใบที่หมดอายุแล้ว/ไม่ active ยังต้องถูกกันเหมือนเดิม', async () => {
    const expired = at(10 * MIN, { symbol: 'EXP', expires_at: new Date(now - 1).toISOString() });
    const notActive = at(10 * MIN, { symbol: 'TRIG', status: 'triggered' });
    const good = at(10 * MIN, { symbol: 'GOOD' });
    const res = await loadPendingSignals(makeFakeDb([expired, notActive, good]), 'user-1', now);
    assertEqual(res.signals.length, 1, 'ต้องเหลือแค่ใบที่ยังใช้ได้');
    assertEqual(res.signals[0].symbol, 'GOOD', 'ใบที่เหลือผิดตัว');
  });

  await check('โหมดถอย: ยังไม่ได้รัน migration 007 → ไม่พัง และได้พฤติกรรมเดิม', async () => {
    const a = rowWithoutOutcomeColumn({ symbol: 'A', created_at: new Date(now - 10 * MIN).toISOString() });
    const b = rowWithoutOutcomeColumn({ symbol: 'B', created_at: new Date(now - 20 * MIN).toISOString() });
    const db = makeFakeDb([a, b], { missingColumns: ['outcome'] });
    const res = await loadPendingSignals(db, 'user-1', now);
    assertEqual(res.error, null, 'โหมดถอยต้องไม่มี error');
    assertEqual(res.columnMissing, false, 'ไม่ใช่เรื่องคอลัมน์ push_sent หาย');
    assertEqual(res.signals.length, 2, 'ต้องได้ทั้งสองใบเหมือนก่อนมี migration 007');
    assert(!db.calls.some((c) => c.includes('outcome')),
      `query ต้องไม่แตะคอลัมน์ outcome เลย — ได้ ${JSON.stringify(db.calls)}`);
  });

  await check('อ่าน DB ไม่ออกจริง ๆ ต้องรายงานเป็น error ไม่ใช่กลบเป็น "ไม่มีสัญญาณค้าง"', async () => {
    const db = makeFakeDb([row()], { missingColumns: ['push_sent'] });
    const res = await loadPendingSignals(db, 'user-1', now);
    assertEqual(res.columnMissing, true, 'คอลัมน์ push_sent หาย = โหมดถอยของ migration 006');
    assertEqual(res.signals.length, 0, 'โหมดถอยนั้นต้องไม่คืนสัญญาณ');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. เทสต์นี้ต้องอยู่ในด่าน CI จริง ไม่ใช่รอให้ใครนึกได้แล้วรันเอง
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n7. เทสต์นี้ถูกเสียบไว้ใน CI จริง\n');
{
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  await check('package.json มี script "test:freshness"', () =>
    assertEqual(pkg.scripts['test:freshness'], 'node scripts/test-signal-freshness.mjs', 'ชื่อสคริปต์ไม่ตรง'));

  const deploy = readFileSync(path.join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');
  await check('deploy.yml รัน npm run test:freshness', () =>
    assert(/^\s*-\s*run:\s*npm run test:freshness\s*$/m.test(deploy), 'ยังไม่ได้เพิ่มด่านนี้ใน CI'));
}

// ═══════════════════════════════════════════════════════════════════════════════

console.log('');
if (failures.length) {
  console.log(`ผ่าน ${passed} · ไม่ผ่าน ${failures.length}`);
  for (const f of failures) console.log(`  · ${f.name}\n      ${f.message}`);
  process.exit(1);
}
console.log(`ผ่านครบ ${passed} เคส — สิ่งที่เจ้าของเห็นตรงกับสถานะจริงของตลาดและของ ledger`);
