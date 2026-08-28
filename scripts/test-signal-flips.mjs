#!/usr/bin/env node
/**
 * test-signal-flips.mjs — เทสต์ฟีเจอร์ "แจ้งกลับทิศ" (npm run test:flips)
 *
 * วิธีรัน
 *   node scripts/test-signal-flips.mjs
 *
 * ไม่ต้องใช้เน็ต ไม่ต้องมี DB — ตรรกะ flip ทั้งหมดเป็นฟังก์ชัน pure ใน
 * src/lib/signal-flips.ts (ตัวเชื่อม DB คือ scripts/scan-universe.mjs ที่ส่ง
 * callback เข้ามา) เทสต์นี้จึง mock แค่ "ตัวอัปเดต" ตัวเดียว แบบเดียวกับที่
 * test-push-digest.mjs mock ตัว Supabase
 *
 * หลักการโหลดโค้ด: ลอกชนิดออกจาก src/lib/*.ts แล้ว import กลับเข้ามาเป็นโมดูลจริง
 * (วิธีเดียวกับ scripts/test-push-digest.mjs) — เทสต์วัด "โค้ดตัวเดียวกับที่รันจริง"
 * ไม่ใช่สำเนาที่เขียนซ้ำแล้วเพี้ยนตามกันไม่ทัน
 *
 * ครอบคลุมอะไรบ้าง
 *   1. กลับทิศตรง ๆ: BUY active อยู่ + SELL ใหม่เข้า → เจอใบเก่า + ปั๊มป้าย + คำเตือนถูกประกอบ
 *   2. ทิศเดียวกัน → ไม่เจออะไร
 *   3. คนละ timeframe / คนละ symbol / คนละ user → ไม่เจอ
 *   4. ใบเก่า resolved ไปแล้ว (outcome='sl') หรือโดนปั๊มป้ายแล้ว → ไม่เจอ
 *   5. โหมดถอย 42703 (ยังไม่ได้รัน migration 009) → ไม่พัง + คำเตือนยังอยู่ในใบแจ้งเตือน
 *   6. หลายใบเก่าทิศตรงข้าม → ปั๊มทุกใบ ข้อความอ้างใบล่าสุด
 *   7. ใบ flip โดน collapseDuplicates ยุบ (symbol|action ซ้ำ ใบคะแนนสูงกว่าชนะ)
 *      → คำเตือนต้องย้ายไปเกาะใบที่รอด ไม่หายเงียบ (บั๊กจริงที่เคยเกิด)
 *   8. ประกอบโน้ตคืนจากป้าย flipped_by (flipNotesFromMarkedRows) — ใบเก็บตก
 *      จากรอบที่ถูกกันความถี่/ส่งล้ม ต้องได้บรรทัดเตือนกลับมา (บั๊กจริงที่เคยเกิด)
 *   + รูปข้อความ (เวลาโซนไทย/action เดิมจริง/หนึ่งบรรทัด) และ flipReversalIndex ของฝั่งเว็บ
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
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

function loadModules() {
  const cacheRoot = path.join(ROOT, 'node_modules', '.cache');
  mkdirSync(cacheRoot, { recursive: true });
  const tmpDir = mkdtempSync(path.join(cacheRoot, 'signal-flips-test-'));

  // '@/types' เป็น type ล้วน ถูกลอกออกตอน transpile — เขียน stub ว่างกัน import ค้าง
  writeFileSync(path.join(tmpDir, 'types.mjs'), 'export {};\n', 'utf8');

  // push-digest.ts อยู่ในรายการเพราะต้องพิสูจน์ว่า "คำเตือนอยู่ในใบแจ้งเตือนจริง"
  // ไม่ใช่แค่ฟังก์ชันประกอบข้อความทำงาน (ไฟล์ของคนอื่น — อ่านอย่างเดียว ไม่แก้)
  for (const rel of ['src/lib/signal-flips.ts', 'src/lib/push-digest.ts']) {
    const abs = path.join(ROOT, ...rel.split('/'));
    const base = path.basename(rel, '.ts');
    writeFileSync(path.join(tmpDir, `${base}.mjs`), transpile(readFileSync(abs, 'utf8'), `${base}.ts`), 'utf8');
  }
  return tmpDir;
}

// ─────────────────────────────── ตัวช่วยสร้างข้อมูลปลอม ───────────────────────────────

let rowSeq = 0;
/** แถวจาก query กันซ้ำของตัวสแกน (รูปเดียวกับที่ findFlipTargets รับจริง) */
function makeRecentRow(over = {}) {
  rowSeq++;
  return {
    id: `old-${String(rowSeq).padStart(4, '0')}`,
    user_id: 'user-1',
    symbol: 'XAUUSD',
    action: 'BUY',
    timeframe: '1H',
    created_at: '2026-08-28T07:32:00.000Z', // = 14:32 โซนไทย
    flipped_at: null,
    outcome: 'open',
    ...over,
  };
}

let sigSeq = 0;
/** สัญญาณเต็มใบสำหรับป้อน push-digest — รูปเดียวกับ makeSignal ของ test-push-digest */
function makeSignal(over = {}) {
  sigSeq++;
  return {
    id: `sig-${String(sigSeq).padStart(4, '0')}`,
    user_id: 'user-1',
    symbol: 'XAUUSD',
    name: 'Gold Spot',
    market: 'GOLD',
    action: 'SELL',
    strength: 'moderate',
    status: 'active',
    entry_price: 2650.25,
    stop_loss: 2670.25,
    take_profit: 2610.25,
    current_price: 2650.25,
    confidence: 70,
    timeframe: '1H',
    reasons: [],
    indicators: {},
    news_sentiment: null,
    telegram_sent: false,
    expires_at: null,
    created_at: '2026-08-28T09:00:00.000Z',
    ...over,
  };
}

const FRESH = { user_id: 'user-1', symbol: 'XAUUSD', action: 'SELL', timeframe: '1H' };

// ─────────────────────────────────────── รัน ───────────────────────────────────────

const tmpDir = loadModules();
let flips;
let digest;
try {
  flips = await import(pathToFileURL(path.join(tmpDir, 'signal-flips.mjs')).href);
  digest = await import(pathToFileURL(path.join(tmpDir, 'push-digest.mjs')).href);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

const NOW = Date.parse('2026-08-28T09:05:00.000Z');

console.log('\n1. หาใบที่โดนกลับทิศ (findFlipTargets)\n');

await check('กลับทิศตรง ๆ: BUY active อยู่ + SELL ใหม่เข้า → เจอใบเก่าหนึ่งใบ', () => {
  const old = makeRecentRow({ action: 'BUY' });
  const hits = flips.findFlipTargets(FRESH, [old]);
  assertEqual(hits.length, 1, 'ต้องเจอใบเก่าหนึ่งใบ');
  assertEqual(hits[0].id, old.id, 'ต้องเป็นใบเดียวกับที่วางไว้');
});

await check('ทิศเดียวกัน (SELL เดิม + SELL ใหม่) → ไม่เจออะไร', () => {
  const hits = flips.findFlipTargets(FRESH, [makeRecentRow({ action: 'SELL' })]);
  assertEqual(hits.length, 0, 'ทิศเดียวกันคือการยืนยัน ไม่ใช่การกลับทิศ');
});

await check('คนละ timeframe → ไม่เจอ', () => {
  const hits = flips.findFlipTargets(FRESH, [makeRecentRow({ action: 'BUY', timeframe: '1D' })]);
  assertEqual(hits.length, 0, '1D BUY ไม่ใช่ใบที่ 1H SELL กลับทิศ');
});

await check('คนละ symbol → ไม่เจอ', () => {
  const hits = flips.findFlipTargets(FRESH, [makeRecentRow({ action: 'BUY', symbol: 'EURUSD' })]);
  assertEqual(hits.length, 0, 'คนละกราฟกัน');
});

await check('คนละ user → ไม่เจอ', () => {
  const hits = flips.findFlipTargets(FRESH, [makeRecentRow({ action: 'BUY', user_id: 'user-2' })]);
  assertEqual(hits.length, 0, 'ใบของคนอื่นไม่เกี่ยว');
});

await check('ใบเก่า resolved ไปแล้ว (outcome=sl แต่ status ยัง active) → ไม่เจอ', () => {
  const hits = flips.findFlipTargets(FRESH, [makeRecentRow({ action: 'BUY', outcome: 'sl' })]);
  assertEqual(hits.length, 0, 'ledger ปิดใบนั้นแล้ว การเตือนให้ปิดคือเตือนผิดใบ');
});

await check('ใบเก่าโดนปั๊มป้ายไปแล้ว (flipped_at ไม่ null) → ไม่ปั๊มซ้ำ', () => {
  const hits = flips.findFlipTargets(FRESH, [makeRecentRow({ action: 'BUY', flipped_at: '2026-08-28T08:00:00.000Z' })]);
  assertEqual(hits.length, 0, 'ป้ายเดิมยังอยู่ ไม่ต้องปั๊มซ้ำ');
});

await check('โหมดถอย: แถวไม่มี field flipped_at/outcome เลย (ยังไม่ได้รัน 007/009) → ยังเจอ', () => {
  const bare = makeRecentRow({ action: 'BUY' });
  delete bare.flipped_at;
  delete bare.outcome;
  const hits = flips.findFlipTargets(FRESH, [bare]);
  assertEqual(hits.length, 1, 'คอลัมน์ไม่มา ≠ ใบไม่โดนกลับทิศ — คำเตือนต้องยังออก');
});

await check('HOLD/CLOSE ไม่มีทิศให้กลับ → ไม่เจอ', () => {
  const rows = [makeRecentRow({ action: 'BUY' })];
  assertEqual(flips.findFlipTargets({ ...FRESH, action: 'HOLD' }, rows).length, 0, 'HOLD ไม่กลับทิศใคร');
  assertEqual(flips.findFlipTargets({ ...FRESH, action: 'CLOSE' }, rows).length, 0, 'CLOSE ไม่กลับทิศใคร');
});

await check('หลายใบเก่าทิศตรงข้าม → เจอครบทุกใบ เรียงใบล่าสุดขึ้นก่อน', () => {
  const older = makeRecentRow({ action: 'BUY', created_at: '2026-08-28T05:00:00.000Z' });
  const latest = makeRecentRow({ action: 'BUY', created_at: '2026-08-28T07:32:00.000Z' });
  const hits = flips.findFlipTargets(FRESH, [older, latest]);
  assertEqual(hits.length, 2, 'ต้องเจอทั้งสองใบ');
  assertEqual(hits[0].id, latest.id, 'ใบล่าสุดต้องอยู่หน้าสุด — ข้อความเตือนอ้างใบนี้');
});

console.log('\n2. ข้อความเตือน (flipWarningLine)\n');

await check('รูปเต็ม: action เดิมจริง + เวลาโซนไทย + คำแนะนำ — จบในบรรทัดเดียว', () => {
  const line = flips.flipWarningLine('BUY', '2026-08-28T07:32:00.000Z');
  assertEqual(line, '⚠ กลับทิศจาก BUY ที่ส่งเมื่อ 14:32 — ถ้ายังถือใบเดิมอยู่ พิจารณาปิด/ตัดขาดทุน', 'ข้อความไม่ตรงรูปที่ตกลงไว้');
  assert(!line.includes('\n'), 'ห้ามเกินหนึ่งบรรทัด');
});

await check('action เดิมเป็น SELL ต้องพิมพ์ SELL — ไม่ใช่คำกลาง ๆ', () => {
  const line = flips.flipWarningLine('SELL', '2026-08-28T00:00:00.000Z'); // = 07:00 โซนไทย
  assert(line.includes('กลับทิศจาก SELL'), `ต้องอ้าง action เดิมจริง: ${line}`);
  assert(line.includes('07:00'), `เวลาต้องเป็นโซนไทย (UTC+7): ${line}`);
});

await check('เวลา parse ไม่ได้ → ตัดส่วนเวลาทิ้ง ไม่ใส่เลขมั่ว', () => {
  const line = flips.flipWarningLine('BUY', 'ไม่ใช่วันที่');
  assertEqual(line, '⚠ กลับทิศจาก BUY — ถ้ายังถือใบเดิมอยู่ พิจารณาปิด/ตัดขาดทุน', 'ห้ามเดาเวลา');
});

await check('ใส่ symbol เมื่อผู้เรียกส่งมา (ใบแจ้งเตือนที่มีหลายสัญญาณ)', () => {
  const line = flips.flipWarningLine('BUY', '2026-08-28T07:32:00.000Z', 'XAUUSD');
  assert(line.startsWith('⚠ XAUUSD กลับทิศจาก BUY'), `symbol ต้องนำหน้า: ${line}`);
});

console.log('\n3. คำเตือนต้องอยู่ในใบแจ้งเตือนจริง (push-digest)\n');

await check('สัญญาณใหม่ที่มี flip → ใบ digest มีบรรทัดเตือนต่อท้าย', () => {
  const s = makeSignal({
    flip: { prev_action: 'BUY', prev_created_at: '2026-08-28T07:32:00.000Z', target_ids: ['old-x'] },
  });
  const [payload] = digest.buildPushPayloads([s], NOW);
  const lastLine = payload.body.split('\n').pop();
  assertEqual(
    lastLine,
    '⚠ กลับทิศจาก BUY ที่ส่งเมื่อ 14:32 — ถ้ายังถือใบเดิมอยู่ พิจารณาปิด/ตัดขาดทุน',
    'บรรทัดสุดท้ายของใบต้องเป็นคำเตือนกลับทิศ'
  );
});

await check('สัญญาณที่ไม่มี flip → ใบ digest ไม่มีคำเตือน (ข้อความเดิมไม่เปลี่ยนสักตัว)', () => {
  const [payload] = digest.buildPushPayloads([makeSignal()], NOW);
  assert(!payload.body.includes('กลับทิศ'), `ห้ามมีคำเตือนหลอน: ${payload.body}`);
});

await check('ใบที่มีหลายสัญญาณ → บรรทัดเตือนระบุ symbol เพื่อไม่ให้อ้างผิดตัว', () => {
  const flipper = makeSignal({
    symbol: 'EURUSD', name: 'Euro', market: 'FOREX',
    entry_price: 1.08452, stop_loss: 1.09052, take_profit: 1.07252,
    flip: { prev_action: 'BUY', prev_created_at: '2026-08-28T07:32:00.000Z', target_ids: ['old-y'] },
  });
  const other = makeSignal({ symbol: 'XAUUSD', action: 'BUY', stop_loss: 2630.25, take_profit: 2690.25 });
  const [payload] = digest.buildPushPayloads([flipper, other], NOW);
  const warn = payload.body.split('\n').filter((l) => l.startsWith('⚠'));
  assertEqual(warn.length, 1, 'หนึ่งการกลับทิศ = หนึ่งบรรทัด');
  assert(warn[0].includes('EURUSD'), `หลายสัญญาณต้องบอกว่าใครกลับทิศ: ${warn[0]}`);
});

await check('ใบ flip โดนยุบซ้ำ (symbol|action เดียวกัน ใบคะแนนสูงกว่าชนะ) → คำเตือนต้องไม่หาย', () => {
  // บั๊กจริงที่เคยเกิด: SELL 1H เป็นตัวกลับทิศ แต่ SELL 1D ของ XAUUSD คะแนนสูงกว่า
  // collapseDuplicates (คีย์ symbol|action ไม่มี timeframe) ยุบใบ 1H ทิ้งพร้อมคำเตือน
  const carrier = makeSignal({
    timeframe: '1H', strength: 'moderate',
    flip: { prev_action: 'BUY', prev_created_at: '2026-08-28T07:32:00.000Z', target_ids: ['old-z'] },
  });
  const stronger = makeSignal({ timeframe: '1D', strength: 'strong', confidence: 80 });
  const [payload] = digest.buildPushPayloads([carrier, stronger], NOW);
  assert(payload.body.includes('กลับทิศจาก BUY ที่ส่งเมื่อ 14:32'), `คำเตือนหายไปกับการยุบซ้ำ: ${payload.body}`);
  const warn = payload.body.split('\n').filter((l) => l.startsWith('⚠'));
  assertEqual(warn.length, 1, 'ยุบแล้วต้องเหลือคำเตือนบรรทัดเดียว ไม่ใช่ศูนย์หรือซ้ำสอง');
});

await check('ทั้งใบที่รอดและใบที่โดนยุบมี flip → เก็บตัวที่ใบเก่าใหม่กว่า (นโยบาย "อ้างใบล่าสุด")', () => {
  const carrierOld = makeSignal({
    timeframe: '1H', strength: 'moderate',
    flip: { prev_action: 'BUY', prev_created_at: '2026-08-28T02:00:00.000Z', target_ids: ['old-a'] }, // 09:00 ไทย
  });
  const survivorNewer = makeSignal({
    timeframe: '1D', strength: 'strong', confidence: 80,
    flip: { prev_action: 'BUY', prev_created_at: '2026-08-28T07:32:00.000Z', target_ids: ['old-b'] }, // 14:32 ไทย
  });
  const [payload] = digest.buildPushPayloads([carrierOld, survivorNewer], NOW);
  const warn = payload.body.split('\n').filter((l) => l.startsWith('⚠'));
  assertEqual(warn.length, 1, 'หนึ่ง symbol|action = หนึ่งบรรทัดเตือน');
  assert(warn[0].includes('14:32'), `ต้องอ้างใบเก่าล่าสุด (14:32) ไม่ใช่ใบเก่ากว่า: ${warn[0]}`);
});

console.log('\n4. ปั๊มป้ายลง DB (markFlipTargets)\n');

/** ตัวอัปเดตปลอม — จดทุกการเรียกไว้ให้เทสต์ตรวจ แล้วตอบตามสคริปต์ที่กำหนด */
function fakeUpdater(script = () => ({ error: null })) {
  const calls = [];
  const fn = async (ids, patch) => {
    calls.push({ ids, patch });
    return script(ids, patch);
  };
  return { fn, calls };
}

const NOW_ISO = new Date(NOW).toISOString();

await check('เคสปกติ: ปั๊มครบทุกใบเก่าของใบใหม่ + patch ชี้ id ใบใหม่ถูกตัว', async () => {
  const rows = [
    { id: 'new-1', flip: { prev_action: 'BUY', prev_created_at: null, target_ids: ['old-1', 'old-2'] } },
    { id: 'new-2' }, // ไม่ได้กลับทิศใคร — ต้องถูกข้ามเฉย ๆ
  ];
  const { fn, calls } = fakeUpdater();
  const res = await flips.markFlipTargets(rows, fn, NOW_ISO);
  assertEqual(res.marked, 2, 'ใบเก่าสองใบต้องถูกปั๊มครบ (เคสหลายใบเก่าทิศตรงข้าม)');
  assertEqual(res.missingColumn, false, 'ไม่มีเรื่องคอลัมน์หาย');
  assertEqual(calls.length, 1, 'ปั๊มเป็นชุดเดียวต่อใบใหม่ ไม่ยิงรายแถว');
  assertEqual(calls[0].patch.flipped_by, 'new-1', 'ป้ายต้องชี้กลับไปที่ใบใหม่');
  assertEqual(calls[0].patch.flipped_at, NOW_ISO, 'เวลาปั๊มต้องเป็นเวลาที่ผู้เรียกส่งมา');
});

await check('โหมดถอย 42703 (ยังไม่ได้รัน 009) → ไม่พัง ไม่โยน แค่บอกว่าคอลัมน์หาย', async () => {
  const rows = [
    { id: 'new-1', flip: { prev_action: 'BUY', prev_created_at: null, target_ids: ['old-1'] } },
    { id: 'new-2', flip: { prev_action: 'SELL', prev_created_at: null, target_ids: ['old-2'] } },
  ];
  const { fn, calls } = fakeUpdater(() => ({
    error: { code: '42703', message: 'column signals.flipped_at does not exist' },
  }));
  const res = await flips.markFlipTargets(rows, fn, NOW_ISO);
  assertEqual(res.missingColumn, true, 'ต้องรายงานว่าคอลัมน์ยังไม่มี');
  assertEqual(res.marked, 0, 'ไม่มีใบไหนถูกปั๊ม');
  assertEqual(calls.length, 1, 'เจอ 42703 แล้วต้องหยุด ไม่ยิงใบถัดไปให้เปลือง');
});

await check('โหมดถอย: คำเตือนในใบแจ้งเตือนยังอยู่ครบ แม้ปั๊มป้ายไม่ได้', async () => {
  // เส้นทางจริงของตัวสแกน: field `flip` ถูกแนบในหน่วยความจำก่อนถึงขั้นปั๊มป้าย
  // การปั๊มล้ม (42703) จึงไม่มีทางย้อนไปลบคำเตือนออกจากใบแจ้งเตือนได้ — พิสูจน์ตรงนี้
  const s = makeSignal({
    flip: { prev_action: 'BUY', prev_created_at: '2026-08-28T07:32:00.000Z', target_ids: ['old-1'] },
  });
  const { fn } = fakeUpdater(() => ({ error: { code: '42703', message: 'column signals.flipped_by does not exist' } }));
  const res = await flips.markFlipTargets([s], fn, NOW_ISO);
  assertEqual(res.missingColumn, true, 'ปั๊มไม่ได้จริง');
  const [payload] = digest.buildPushPayloads([s], NOW);
  assert(payload.body.includes('กลับทิศจาก BUY'), 'คำเตือนต้องยังอยู่ในใบแจ้งเตือน');
});

await check('error อื่นที่ไม่ใช่คอลัมน์หาย → จดเป็น warning แล้วเดินต่อใบถัดไป', async () => {
  const rows = [
    { id: 'new-1', flip: { prev_action: 'BUY', prev_created_at: null, target_ids: ['old-1'] } },
    { id: 'new-2', flip: { prev_action: 'SELL', prev_created_at: null, target_ids: ['old-2'] } },
  ];
  let first = true;
  const { fn, calls } = fakeUpdater(() => {
    if (first) { first = false; return { error: { code: '57014', message: 'timeout' } }; }
    return { error: null };
  });
  const res = await flips.markFlipTargets(rows, fn, NOW_ISO);
  assertEqual(res.missingColumn, false, 'ไม่ใช่เรื่องคอลัมน์หาย');
  assertEqual(res.errors.length, 1, 'ใบแรกล้มต้องถูกจดไว้');
  assertEqual(res.marked, 1, 'ใบที่สองต้องยังถูกปั๊มต่อ');
  assertEqual(calls.length, 2, 'ต้องลองครบทั้งสองใบ');
});

await check('updater ส่งแถวที่อัปเดตจริงกลับมา → marked นับจากแถวจริง ไม่ใช่จำนวนที่ขอ', async () => {
  // สองรอบสแกนซ้อนกัน (watchdog + cron): guard .is(flipped_at, null) ทำให้ old-2
  // ที่โดนรอบอื่นปั๊มตัดหน้าไม่แมตช์ — ตัวเลขใน log ต้องรายงาน 1 ไม่ใช่ 2
  const rows = [{ id: 'new-1', flip: { prev_action: 'BUY', prev_created_at: null, target_ids: ['old-1', 'old-2'] } }];
  const { fn } = fakeUpdater(() => ({ error: null, data: [{ id: 'old-1' }] }));
  const res = await flips.markFlipTargets(rows, fn, NOW_ISO);
  assertEqual(res.marked, 1, 'ต้องนับจากแถวที่ DB ตอบว่าอัปเดตจริง');
});

console.log('\n5. ป้ายฝั่งหน้าเว็บ (flipReversalIndex)\n');

await check('ใบเก่ามี flipped_by → map ชี้จาก id ใบใหม่ไปหา action ของใบเก่า', () => {
  const oldSig = makeSignal({ action: 'BUY', flipped_at: NOW_ISO, flipped_by: 'new-9', outcome: 'open' });
  const idx = flips.flipReversalIndex([oldSig, makeSignal({ id: 'new-9' })]);
  const note = idx.get('new-9');
  assert(note, 'ใบใหม่ต้องมีป้าย');
  assertEqual(note.prevAction, 'BUY', 'action เดิมต้องมาจากใบเก่าจริง');
  assertEqual(note.prevStillOpen, true, 'outcome ยัง open = ยังเปิดตาม ledger');
});

await check('ใบเก่าถูก ledger ปิดแล้ว → prevStillOpen เป็น false (ห้ามอ้างว่ายังเปิด)', () => {
  const oldSig = makeSignal({ action: 'BUY', flipped_at: NOW_ISO, flipped_by: 'new-9', outcome: 'sl' });
  const idx = flips.flipReversalIndex([oldSig]);
  assertEqual(idx.get('new-9').prevStillOpen, false, 'ข้อมูลค้านคำอ้าง "ยังเปิดอยู่" — ต้องไม่อ้าง');
});

await check('โหมดถอย: ไม่มีแถวไหนมี flipped_by (ยังไม่ได้รัน 009) → map ว่าง ไม่พัง', () => {
  const idx = flips.flipReversalIndex([makeSignal(), makeSignal({ action: 'BUY' })]);
  assertEqual(idx.size, 0, 'ไม่มีป้ายให้ขึ้น');
});

console.log('\n6. ประกอบโน้ตคืนจากป้าย — ใบเก็บตกต้องไม่เสียคำเตือน (flipNotesFromMarkedRows)\n');

await check('ป้ายใบเดียว → โน้ตอ้าง action/เวลาใบเก่าจริง + target_ids ครบ', () => {
  const notes = flips.flipNotesFromMarkedRows([
    { id: 'old-1', action: 'BUY', created_at: '2026-08-28T07:32:00.000Z', flipped_by: 'new-1' },
  ]);
  const note = notes.get('new-1');
  assert(note, 'ใบใหม่ต้องได้โน้ตคืน');
  assertEqual(note.prev_action, 'BUY', 'action เดิมต้องมาจากใบเก่าจริง');
  assertEqual(note.prev_created_at, '2026-08-28T07:32:00.000Z', 'เวลาต้องมาจากใบเก่าจริง');
  assertEqual(JSON.stringify(note.target_ids), JSON.stringify(['old-1']), 'target_ids ต้องชี้ใบเก่า');
});

await check('ใบใหม่ใบเดียวกลับทิศหลายใบเก่า → อ้างใบล่าสุด แต่ target_ids เก็บครบทุกใบ', () => {
  const notes = flips.flipNotesFromMarkedRows([
    { id: 'old-1', action: 'BUY', created_at: '2026-08-28T05:00:00.000Z', flipped_by: 'new-1' },
    { id: 'old-2', action: 'BUY', created_at: '2026-08-28T07:32:00.000Z', flipped_by: 'new-1' },
  ]);
  const note = notes.get('new-1');
  assertEqual(note.prev_created_at, '2026-08-28T07:32:00.000Z', 'ต้องอ้างใบล่าสุด — นโยบายเดียวกับ findFlipTargets');
  assertEqual(note.target_ids.length, 2, 'ใบเก่าทุกใบต้องอยู่ใน target_ids');
});

await check('แถวที่ flipped_by ว่าง หรือ action ไม่ใช่ BUY/SELL → ถูกข้าม ไม่ประกอบโน้ตมั่ว', () => {
  const notes = flips.flipNotesFromMarkedRows([
    { id: 'old-1', action: 'BUY', created_at: '2026-08-28T07:32:00.000Z', flipped_by: null },
    { id: 'old-2', action: 'HOLD', created_at: '2026-08-28T07:32:00.000Z', flipped_by: 'new-1' },
  ]);
  assertEqual(notes.size, 0, 'ไม่มีป้ายที่ใช้ได้ = ไม่มีโน้ต');
});

await check('เส้นทางเก็บตกครบวงจร: โน้ตที่ประกอบคืน → ใบแจ้งเตือนมีบรรทัดเตือนเหมือนรอบแรก', () => {
  // จำลองสัญญาณที่อ่านกลับจาก DB (ไม่มี field flip ติดมา) แล้วรอบนี้เพิ่งประกอบคืน
  const notes = flips.flipNotesFromMarkedRows([
    { id: 'sig-catchup', action: 'BUY', created_at: '2026-08-28T07:32:00.000Z', flipped_by: 'sig-catchup-new' },
  ]);
  const pending = makeSignal({ id: 'sig-catchup-new' });
  pending.flip = notes.get('sig-catchup-new');
  const [payload] = digest.buildPushPayloads([pending], NOW);
  assertEqual(
    payload.body.split('\n').pop(),
    '⚠ กลับทิศจาก BUY ที่ส่งเมื่อ 14:32 — ถ้ายังถือใบเดิมอยู่ พิจารณาปิด/ตัดขาดทุน',
    'ใบเก็บตกต้องได้คำเตือนข้อความเดียวกับรอบที่ตรวจพบ'
  );
});

// ─────────────────────────────────────── สรุป ───────────────────────────────────────

console.log('');
if (failures.length) {
  console.log(`ไม่ผ่าน ${failures.length} เคส (ผ่าน ${passed})`);
  process.exit(1);
}
console.log(`ผ่านครบ ${passed} เคส`);
