#!/usr/bin/env node
/**
 * test-chart-markers.mjs — หมุดบนกราฟ: ใบไหนขึ้น · จบยังไง · ตัดเมื่อไหร่ (npm run test:chart-markers)
 *
 * วิธีรัน
 *   node scripts/test-chart-markers.mjs
 *
 * ไม่ต้องใช้เน็ต ไม่ต้องมี DB — โหลด src/lib/chart-markers.ts ตัวจริงมาโดยลอกชนิดออก
 * (วิธีเดียวกับ scripts/test-chart-api.mjs) แล้วเรียกฟังก์ชันจริงทั้งหมด
 *
 * ═══ ทำไมเลนนี้ต้องมีเทสต์ของตัวเอง ═══════════════════════════════════════════
 * ตั้งแต่ 2026-09-06 หมุดไม่ได้แสดงเฉพาะ "ใบที่ยังเปิดอยู่" อีกต่อไป แต่แสดงสัญญาณ
 * ทุกใบในช่วงที่กราฟครอบคลุม พร้อมบอกว่าแต่ละใบจบยังไง — ของที่พังแล้วมองไม่เห็น
 * ในงานแบบนี้มีสามอย่าง และทั้งสามอย่าง "วาดออกมาสวยเหมือนของถูกต้อง":
 *   1. ป้ายผลผิดใบ (ใบที่โดน SL ติดป้ายว่ายังเปิด) — เจ้าของอ่านกราฟผิดทั้งหน้า
 *   2. ใบที่แพ้หายไปเงียบ ๆ (ตัวกรอง/สี/เพดานที่เอนเข้าข้างตัวเอง) — กราฟกลายเป็นโฆษณา
 *      ทั้งที่คุณค่าทั้งหมดของฟีเจอร์นี้คือการเห็นทั้งสองฝั่งเท่ากัน
 *   3. เพดานตัดหมุดทิ้งโดยไม่บอก — เจ้าของนับใบบนจอแล้วได้คนละเลขกับความจริง
 * ทุกด่านสำคัญในไฟล์นี้มี negative control ที่พิสูจน์ว่าด่านนั้นจับของผิดได้จริง
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
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
  const tmpDir = mkdtempSync(path.join(cacheRoot, 'chart-markers-test-'));

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

  return { tmpDir, fileFor: (abs) => pathToFileURL(path.join(tmpDir, nameOf(abs))).href };
}

const SRC = {
  markers: path.join(ROOT, 'src', 'lib', 'chart-markers.ts'),
  flips: path.join(ROOT, 'src', 'lib', 'signal-flips.ts'),
};

const loaded = loadModules(Object.values(SRC));
const markersMod = await import(loaded.fileFor(SRC.markers));
const flipsMod = await import(loaded.fileFor(SRC.flips));

const {
  buildSignalMarkers,
  buildSignalMarkerSet,
  countMarkerStatuses,
  markerStatusOf,
  MARKER_CAP,
  MARKER_STATUS_META,
  MARKER_STATUS_ORDER,
  MARKER_STATUS_ALWAYS_SHOWN,
} = markersMod;
const { isLiveSignalRow } = flipsMod;

// ─────────────────────────────── ชุดข้อมูลทดสอบ ───────────────────────────────

const BAR_SEC = 900;
/** แท่งสมมติ 200 ใบ เรียงเวลาขึ้น ห่างกันใบละ 15 นาที */
const BASE = Math.floor(Date.parse('2026-08-20T00:00:00.000Z') / 1000);
const BARS = Array.from({ length: 200 }, (_, i) => BASE + i * BAR_SEC);
const LAST_BAR = BARS[BARS.length - 1];

const isoAt = (sec) => new Date(sec * 1000).toISOString();

function signal(over = {}) {
  return {
    id: 'sig-1',
    symbol: 'XAUUSD',
    action: 'BUY',
    timeframe: '15m',
    status: 'active',
    outcome: null,
    entry_price: 3500,
    stop_loss: 3480,
    take_profit: 3540,
    strength: 'strong',
    confidence: 72,
    cost_r: 0.031,
    created_at: isoAt(BASE + 3 * BAR_SEC + 120),
    ...over,
  };
}

const build = (signals, opts = {}) =>
  buildSignalMarkerSet(signals, BARS, { symbol: 'XAUUSD', timeframe: '15m', ...opts });

console.log('\n1. ใบที่ปิดบัญชีแล้วต้องกลายเป็นหมุดจริง พร้อมป้ายผลที่ถูกต้อง\n');

await check('ผลปิดบัญชีทุกชนิด (tp/sl/timeout/unresolvable) → ปักหมุด และ status ตรงกับ ledger', () => {
  for (const outcome of ['tp', 'sl', 'timeout', 'unresolvable']) {
    // status ยังเป็น 'active' ค้างอยู่ได้จริง เพราะตัวเก็บผลไม่แตะคอลัมน์ status
    // ป้ายผลจึงต้องมาจาก outcome ไม่ใช่จาก status
    const r = build([signal({ outcome, status: 'active' })]);
    assertEqual(r.markers.length, 1, `outcome='${outcome}' ต้องยังเห็นบนกราฟ`);
    assertEqual(r.markers[0].status, outcome, `หมุดต้องติดป้าย '${outcome}'`);
  }
});

await check('ใบที่ยังเปิดอยู่จริง → status = open (ตรงกับ isLiveSignalRow ตัวเดียวกับหน้า /signals)', () => {
  for (const outcome of [null, 'open']) {
    const row = signal({ outcome });
    assert(isLiveSignalRow(row), 'ชุดทดสอบต้องเป็นใบที่ยังเปิดจริงตามตัวกรองกลาง');
    assertEqual(build([row]).markers[0].status, 'open', `outcome=${JSON.stringify(outcome)} ต้องได้ป้าย open`);
  }
});

await check('ใบที่หมดอายุแต่ ledger ยังไม่ปิดบัญชี → unknown (ห้ามเดาว่ายังเปิดหรือจบแบบไหน)', () => {
  for (const status of ['expired', 'cancelled', 'triggered', null]) {
    const row = signal({ status, outcome: null });
    assert(!isLiveSignalRow(row), 'ชุดทดสอบต้องไม่ใช่ใบที่เปิดอยู่');
    assertEqual(build([row]).markers[0].status, 'unknown', `status='${status}' ต้องได้ป้าย unknown`);
  }
});

await check('ใบที่หมดอายุแล้วและ ledger ปิดบัญชีให้แล้ว → ใช้ผลของ ledger ไม่ใช่ unknown', () => {
  assertEqual(build([signal({ status: 'expired', outcome: 'sl' })]).markers[0].status, 'sl',
    'ledger ปิดด้วย sl แล้ว ต้องอ่านว่า sl');
});

await check("outcome ที่ระบบไม่รู้จัก → unknown (ห้ามส่งค่าดิบไปให้ UI แปลเอง)", () => {
  assertEqual(build([signal({ outcome: 'อะไรสักอย่าง' })]).markers[0].status, 'unknown',
    'ค่าที่ไม่อยู่ในชุดผลของ ledger ต้องถูกยุบเป็น unknown');
});

await check('ป้ายผลไม่สนตัวพิมพ์/ช่องว่างของค่าใน DB', () => {
  assertEqual(build([signal({ outcome: ' TP ' })]).markers[0].status, 'tp', "' TP ' ต้องอ่านเป็น tp");
});

await check('ตัวเลขผลจริงติดมากับหมุดครบ (realized_r / exit_price / bars_held / resolved_at)', () => {
  const m = build([
    signal({
      outcome: 'sl',
      realized_r: -1.031,
      exit_price: 3480,
      bars_held: 7,
      resolved_at: '2026-08-20T06:00:00.000Z',
    }),
  ]).markers[0];
  assertEqual(m.realizedR, -1.031, 'ผลเป็น R ต้องเป็นค่าที่บันทึกไว้ ไม่ใช่ค่าที่คำนวณใหม่');
  assertEqual(m.exitPrice, 3480, 'ราคาออกต้องติดมากับหมุด');
  assertEqual(m.barsHeld, 7, 'จำนวนแท่งที่ถือต้องติดมากับหมุด');
  assertEqual(m.resolvedAt, '2026-08-20T06:00:00.000Z', 'เวลาปิดบัญชีต้องติดมากับหมุด');
});

await check('ผลเป็น R ที่เป็นบวกก็ต้องผ่านมาครบ (ตัวกรองต้องไม่เอนไปทางใดทางหนึ่ง)', () => {
  const m = build([signal({ outcome: 'tp', realized_r: 1.44 })]).markers[0];
  assertEqual(m.realizedR, 1.44, 'ค่าบวกต้องผ่าน');
  assertEqual(build([signal({ outcome: 'sl', realized_r: -1.44 })]).markers[0].realizedR, -1.44,
    'ค่าติดลบต้องผ่านด้วยกติกาเดียวกันเป๊ะ');
});

await check('ค่าผลที่ใช้ไม่ได้ → null ไม่ใช่ 0 (0 อ่านเป็น "เสมอตัว" ซึ่งเป็นคนละเรื่องกับ "ไม่มีข้อมูล")', () => {
  const m = build([
    signal({ outcome: 'timeout', realized_r: NaN, exit_price: 0, bars_held: -3, resolved_at: '   ' }),
  ]).markers[0];
  assertEqual(m.realizedR, null, 'NaN ไม่ใช่ตัวเลขผล');
  assertEqual(m.exitPrice, null, 'ราคา 0 ไม่ใช่ราคา');
  assertEqual(m.barsHeld, null, 'จำนวนแท่งติดลบคือข้อมูลเสีย');
  assertEqual(m.resolvedAt, null, 'ข้อความว่างไม่ใช่เวลา');
});

await check('bars_held = 0 ยังเป็นค่าที่ใช้ได้ (ปิดในแท่งเดียวกับที่ออกใบ)', () => {
  assertEqual(build([signal({ outcome: 'sl', bars_held: 0 })]).markers[0].barsHeld, 0,
    '0 แท่งเกิดขึ้นได้จริง ห้ามยุบเป็น null');
});

await check('โหมดถอย: ไม่มีคอลัมน์ outcome เลย (ยังไม่ได้รัน 007) → ตอบเหมือน isLiveSignalRow เป๊ะ', () => {
  // ⚠ ด่านนี้คือหัวใจของ "กราฟกับ /signals ต้องตอบตรงกันว่าใบไหนยังเปิด"
  //   ในโหมดถอย ทั้งระบบใช้ isLiveSignalRow ตัวเดียวกันตัดสิน กราฟจึงห้ามตอบต่างจากที่อื่น
  //   เคยมีทางลัด `if (row.outcome === undefined) return 'unknown'` อยู่ ผลคือหมุดทุกใบ
  //   ติดป้าย "ไม่มีผลบันทึกไว้" และบรรทัดสรุปพิมพ์ "ยังเปิดอยู่ 0" ทั้งที่ /signals
  //   บอกว่ามีใบใช้งานอยู่จากข้อมูลชุดเดียวกัน
  const open = signal();
  delete open.outcome;
  const r = build([open]);
  assertEqual(r.markers.length, 1, 'ยังต้องปักหมุดตามปกติ');
  assert(isLiveSignalRow(open), 'ชุดทดสอบต้องเป็นใบที่ตัวกรองกลางถือว่ายังเปิดอยู่');
  assertEqual(r.markers[0].status, 'open', 'ใบที่ /signals นับว่าเปิด กราฟต้องนับว่าเปิดด้วย');
  assertEqual(markerStatusOf(open), 'open', 'markerStatusOf ต้องตอบเหมือนกันเมื่อเรียกตรง ๆ');
});

await check('โหมดถอย: ใบที่ status ไม่ใช่ active → unknown (ไม่ใช่เดาว่ายังเปิด)', () => {
  for (const status of ['expired', 'cancelled', 'triggered', null]) {
    const row = signal({ status });
    delete row.outcome;
    assert(!isLiveSignalRow(row), `ชุดทดสอบ status='${status}' ต้องไม่ใช่ใบที่เปิดอยู่`);
    assertEqual(markerStatusOf(row), 'unknown',
      `status='${status}' ที่ไม่มี ledger ให้อ่าน ต้องได้ 'unknown' ไม่ใช่ 'open'`);
  }
});

await check('negative control: ทางลัด "ไม่มีคอลัมน์ = unknown" ถ้ากลับมา ด่านข้างบนต้องแดง', () => {
  // จำลองพฤติกรรมของทางลัดเก่าแล้วยืนยันว่ามันให้คำตอบคนละอย่างกับตัวจริง
  const shortcut = (row) => (row.outcome === undefined ? 'unknown' : markerStatusOf(row));
  const row = signal();
  delete row.outcome;
  assertEqual(shortcut(row), 'unknown', 'ตัวจำลองทางลัดต้องตอบ unknown');
  assert(shortcut(row) !== markerStatusOf(row),
    'ตัวจริงตอบเหมือนทางลัดเก่า = ทางลัดกลับมาแล้ว และด่านข้างบนไม่มีฟัน');
});

await check('โหมดถอย: ไม่มีคอลัมน์ผลอื่นเลย → ทุกช่องเป็น null ไม่ใช่ undefined/NaN', () => {
  const row = signal();
  delete row.outcome;
  delete row.realized_r;
  delete row.exit_price;
  delete row.bars_held;
  delete row.resolved_at;
  const m = build([row]).markers[0];
  assertEqual(m.realizedR, null, 'ช่องที่ไม่มีต้องเป็น null');
  assertEqual(m.exitPrice, null, 'ช่องที่ไม่มีต้องเป็น null');
  assertEqual(m.barsHeld, null, 'ช่องที่ไม่มีต้องเป็น null');
  assertEqual(m.resolvedAt, null, 'ช่องที่ไม่มีต้องเป็น null');
});

console.log('\n2. ด่านที่ยังต้องกรองทิ้งเหมือนเดิม (การเปิดรับใบที่ปิดแล้ว ไม่ได้แปลว่ารับทุกอย่าง)\n');

await check('ใบที่เกิดก่อนแท่งแรกของกราฟ → ไม่ขึ้น แม้จะปิดบัญชีไปแล้ว', () => {
  for (const outcome of ['tp', 'sl', 'timeout', null]) {
    assertEqual(build([signal({ outcome, created_at: isoAt(BASE - 1) })]).markers.length, 0,
      `outcome=${JSON.stringify(outcome)} ที่อยู่นอกช่วงเวลาของกราฟต้องไม่ถูกดันมากองที่ขอบซ้าย`);
  }
});

await check('ใบที่เกิดหลังแท่งท้ายสุด → เกาะแท่งท้ายสุด (ยังอยู่ในช่วงที่กราฟครอบคลุม)', () => {
  const m = build([signal({ outcome: 'tp', created_at: isoAt(LAST_BAR + 4000) })]).markers;
  assertEqual(m.length, 1, 'ใบที่เพิ่งเกิดต้องยังเห็นได้');
  assertEqual(m[0].time, LAST_BAR, 'ต้องเกาะแท่งที่ตลาดเคลื่อนไหวล่าสุด');
});

await check('สัญลักษณ์อื่น → ไม่ขึ้นบนกราฟทอง แม้จะปิดบัญชีแล้ว', () => {
  for (const outcome of ['tp', 'sl', null]) {
    assertEqual(build([signal({ symbol: 'EURUSD', outcome })]).markers.length, 0,
      'กราฟทองต้องแสดงเฉพาะหมุดของทอง');
  }
  assertEqual(build([signal({ symbol: 'xauusd  ', outcome: 'tp' })]).markers.length, 1,
    'ตัวพิมพ์เล็ก/ช่องว่างของ symbol เดียวกันต้องยังนับว่าตรง');
});

await check('action ที่ไม่ใช่ BUY/SELL → ไม่ขึ้น แม้จะปิดบัญชีแล้ว (ไม่มีจุดเข้าให้ปัก)', () => {
  for (const action of ['HOLD', 'CLOSE', '', null]) {
    for (const outcome of ['tp', 'sl', null]) {
      assertEqual(build([signal({ action, outcome })]).markers.length, 0,
        `action=${JSON.stringify(action)} ไม่มีทิศให้ปัก`);
    }
  }
});

await check('ราคาเข้าที่ใช้ไม่ได้ → ไม่ขึ้น แม้จะมีผลปิดบัญชีครบ', () => {
  for (const entry_price of [0, -1, NaN, Infinity]) {
    assertEqual(build([signal({ entry_price, outcome: 'tp', realized_r: 1 })]).markers.length, 0,
      `entry_price=${entry_price} ไม่ใช่ราคา`);
  }
});

await check('created_at ที่อ่านไม่ออก → ไม่ขึ้น (ห้ามเดาเวลาแล้วปักมั่ว)', () => {
  assertEqual(build([signal({ created_at: 'เมื่อวานนี้', outcome: 'sl' })]).markers.length, 0,
    'เวลาที่ parse ไม่ได้ = ไม่รู้ว่าปักตรงไหน');
});

await check('ไม่มีแท่งเลย → ไม่มีหมุด และยอดนับเป็นศูนย์ทั้งชุด (ไม่ใช่ throw)', () => {
  const r = buildSignalMarkerSet([signal()], [], { symbol: 'XAUUSD', timeframe: '15m' });
  assertEqual(r.markers.length, 0, 'ไม่มีแท่ง = ไม่มีที่ให้ปัก');
  assertEqual(r.matched, 0, 'ยอดที่เข้าเกณฑ์ต้องเป็น 0');
  assertEqual(r.hidden, 0, 'ไม่มีอะไรถูกตัด');
});

console.log('\n3. เพดานจำนวนหมุด — ตัดของเก่า เก็บของใหม่ และรายงานยอดที่ตัดออกเสมอ\n');

/** ใบละหนึ่งแท่ง เรียงจากเก่าไปใหม่ (id นับตามลำดับเวลา) */
function manySignals(n, over = () => ({})) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(signal({ id: `s${String(i).padStart(3, '0')}`, created_at: isoAt(BARS[i % BARS.length] + 60), ...over(i) }));
  }
  return out;
}

await check(`เพดานเริ่มต้นคือ MARKER_CAP (${MARKER_CAP}) และเป็นจำนวนเต็มบวก`, () => {
  assert(Number.isInteger(MARKER_CAP) && MARKER_CAP > 0, 'เพดานต้องเป็นจำนวนเต็มบวก');
  assertEqual(build(manySignals(MARKER_CAP + 40)).cap, MARKER_CAP, 'ไม่ส่ง cap ต้องได้ค่าเริ่มต้น');
});

await check('ใบเกินเพดาน → ปักเท่าเพดาน · matched บอกยอดเต็ม · hidden บอกยอดที่ตัดออก', () => {
  const total = MARKER_CAP + 37;
  const r = build(manySignals(total));
  assertEqual(r.markers.length, MARKER_CAP, 'จำนวนหมุดต้องเท่าเพดานพอดี');
  assertEqual(r.matched, total, 'ยอดเต็มต้องเป็นจำนวนใบที่เข้าเกณฑ์ทั้งหมด ไม่ใช่จำนวนที่วาด');
  assertEqual(r.hidden, total - MARKER_CAP, 'ยอดที่ถูกตัดต้องรายงานออกมา ไม่ใช่หายเงียบ ๆ');
  assertEqual(r.matched, r.markers.length + r.hidden, 'สามตัวเลขต้องบวกกันลงตัวเสมอ');
});

await check('ตัดแล้วต้องเหลือ "ใบใหม่สุด" ไม่ใช่ใบแรก ๆ ที่เจอ', () => {
  const total = MARKER_CAP + 20;
  const all = manySignals(total);
  const kept = build(all).markers;
  const keptIds = new Set(kept.map((m) => m.id));
  // ใบที่ถูกตัดทุกใบต้องเก่ากว่าใบที่เก็บไว้ทุกใบ
  const oldestKept = Math.min(...kept.map((m) => m.createdSec));
  for (const s of all) {
    if (keptIds.has(s.id)) continue;
    const sec = Math.floor(Date.parse(s.created_at) / 1000);
    assert(sec <= oldestKept, `ใบ ${s.id} ถูกตัดทิ้งทั้งที่ใหม่กว่าใบที่เก็บไว้`);
  }
  assertEqual(kept[kept.length - 1].id, all[total - 1].id, 'ใบล่าสุดต้องอยู่ในชุดที่ปักเสมอ');
});

await check('หมุดที่เหลือหลังตัด ยังเรียงเวลาขึ้น (ตัววาดกราฟบังคับ ไม่งั้นโยนทั้งชุด)', () => {
  const m = build(manySignals(MARKER_CAP + 15)).markers;
  for (let i = 1; i < m.length; i++) {
    assert(m[i].time >= m[i - 1].time, `หมุดที่ ${i} เวลาย้อนกลับ`);
  }
});

await check('ใบไม่ถึงเพดาน → ไม่ตัดอะไรเลย (เพดานต้องไม่ใช่การตัดตายตัว)', () => {
  const r = build(manySignals(12));
  assertEqual(r.markers.length, 12, 'ต้องปักครบทุกใบ');
  assertEqual(r.hidden, 0, 'ไม่มีอะไรถูกตัด');
});

await check('ส่ง cap เองได้ และค่าที่ใช้ไม่ได้ต้องถอยไปค่าเริ่มต้น (ไม่ใช่ปักทุกใบ/ไม่ปักเลย)', () => {
  assertEqual(build(manySignals(30), { cap: 5 }).markers.length, 5, 'cap ที่ส่งมาต้องมีผลจริง');
  assertEqual(build(manySignals(30), { cap: 5 }).hidden, 25, 'ยอดที่ตัดต้องตรงกับ cap ที่ใช้');
  for (const cap of [0, -3, NaN, 'สิบ', null]) {
    assertEqual(build(manySignals(MARKER_CAP + 5), { cap }).cap, MARKER_CAP,
      `cap=${JSON.stringify(cap)} ใช้ไม่ได้ ต้องถอยไปค่าเริ่มต้น`);
  }
});

await check('negative control: ตัวตัดที่เก็บ "ใบเก่าสุด" ต้องสอบตกด่านข้างบน', () => {
  const total = MARKER_CAP + 20;
  const all = manySignals(total);
  const real = build(all).markers;
  // ตัวปลอม: ตัดท้ายทิ้งแทนที่จะตัดหัว = เก็บของเก่าไว้
  const fake = buildSignalMarkerSet(all, BARS, { symbol: 'XAUUSD', timeframe: '15m', cap: 10_000 })
    .markers.slice(0, MARKER_CAP);
  assertEqual(fake.length, real.length, 'สองชุดต้องยาวเท่ากัน ไม่งั้นเทียบกันไม่ได้');
  assert(
    fake[fake.length - 1].id !== real[real.length - 1].id,
    'ตัวปลอมที่เก็บใบเก่าสุดกลับได้ใบท้ายเดียวกับตัวจริง — ชุดทดสอบแยกสองพฤติกรรมนี้ไม่ออก'
  );
});

console.log('\n4. ตัวนับสรุป — ต้องตรงกับหมุดที่แสดงอยู่จริงเสมอ\n');

/** ชุดผสมที่รู้คำตอบอยู่แล้ว: open 3 · tp 2 · sl 4 · timeout 1 · unresolvable 1 · unknown 2 */
function mixedSignals() {
  const spec = [
    ['open', 3, { outcome: null }],
    ['tp', 2, { outcome: 'tp' }],
    ['sl', 4, { outcome: 'sl' }],
    ['timeout', 1, { outcome: 'timeout' }],
    ['unresolvable', 1, { outcome: 'unresolvable' }],
    ['unknown', 2, { outcome: null, status: 'expired' }],
  ];
  const out = [];
  let i = 0;
  for (const [, n, over] of spec) {
    for (let k = 0; k < n; k++) {
      out.push(signal({ id: `mix-${i}`, created_at: isoAt(BARS[i] + 60), ...over }));
      i++;
    }
  }
  return { rows: out, want: { open: 3, tp: 2, sl: 4, timeout: 1, unresolvable: 1, unknown: 2 } };
}

await check('countMarkerStatuses นับตรงกับชุดที่รู้คำตอบอยู่แล้ว', () => {
  const { rows, want } = mixedSignals();
  const counts = countMarkerStatuses(build(rows).markers);
  for (const [k, v] of Object.entries(want)) assertEqual(counts[k], v, `นับ ${k} ผิด`);
});

await check('ผลรวมของตัวนับ = จำนวนหมุดที่แสดงอยู่ (ไม่ใช่จำนวนใบทั้งหมดก่อนตัดเพดาน)', () => {
  const { rows } = mixedSignals();
  const r = build(rows, { cap: 5 });
  const counts = countMarkerStatuses(r.markers);
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  assertEqual(sum, r.markers.length, 'ผลรวมต้องเท่าจำนวนหมุดที่ปักอยู่');
  assert(sum < r.matched, 'ชุดทดสอบนี้ต้องมีใบถูกตัดจริง ไม่งั้นด่านนี้ไม่มีฟัน');
});

await check('ทุกสถานะที่ประกาศไว้ถูกนับได้จริง — ไม่มีคีย์ไหนตกหล่นจากตัวนับ', () => {
  const counts = countMarkerStatuses([]);
  for (const s of MARKER_STATUS_ORDER) {
    assertEqual(counts[s], 0, `ตัวนับต้องมีคีย์ '${s}' และเริ่มที่ 0`);
  }
  assertEqual(Object.keys(counts).length, MARKER_STATUS_ORDER.length, 'ตัวนับต้องมีคีย์เท่าจำนวนสถานะพอดี');
});

console.log('\n5. สีและป้ายของแต่ละสถานะ — ใบที่แพ้ต้องเห็นชัดเท่าใบที่ชนะ\n');

await check('ทุกสถานะมีป้ายไทยและชื่อตัวแปรสีครบ และลำดับที่ประกาศไว้ตรงกับชุดสถานะจริง', () => {
  for (const s of MARKER_STATUS_ORDER) {
    const meta = MARKER_STATUS_META[s];
    assert(meta && meta.label && meta.colorVar, `สถานะ '${s}' ไม่มี meta ครบ`);
    assert(/^--[a-z-]+$/.test(meta.colorVar), `สถานะ '${s}' ใช้สีที่ไม่ใช่ตัวแปรของแอป (${meta.colorVar})`);
  }
  assertEqual(Object.keys(MARKER_STATUS_META).length, MARKER_STATUS_ORDER.length,
    'MARKER_STATUS_ORDER กับ MARKER_STATUS_META ต้องครอบคลุมชุดเดียวกัน');
  for (const s of MARKER_STATUS_ALWAYS_SHOWN) {
    assert(MARKER_STATUS_ORDER.includes(s), `'${s}' อยู่ในชุดที่ต้องแสดงเสมอ แต่ไม่อยู่ในลำดับ`);
  }
});

await check('sl กับ tp ใช้สีคู่ตรงข้ามของแอป (--down / --up) ซึ่งมีน้ำหนักเท่ากันทั้งสองธีม', () => {
  assertEqual(MARKER_STATUS_META.tp.colorVar, '--up', 'ใบที่ถึง TP ต้องใช้สีขึ้นของแอป');
  assertEqual(MARKER_STATUS_META.sl.colorVar, '--down', 'ใบที่โดน SL ต้องใช้สีลงของแอป ไม่ใช่สีจาง ๆ');
});

await check('ไม่มีสถานะไหนใช้สีจาง (--text-dim / --text-faint / --border-*) — ใบที่แพ้จะหายไปจากสายตา', () => {
  const faint = ['--text-dim', '--text-faint', '--border-subtle', '--border-strong'];
  for (const s of MARKER_STATUS_ORDER) {
    assert(!faint.includes(MARKER_STATUS_META[s].colorVar),
      `สถานะ '${s}' ใช้ ${MARKER_STATUS_META[s].colorVar} ซึ่งเป็นสีสำหรับของที่ต้องจาง`);
  }
});

await check('ไม่มีสองสถานะไหนใช้สีเดียวกัน — ไม่งั้นแมปสีบนกราฟกลับเป็นสถานะไม่ได้', () => {
  // หน้าเว็บพิมพ์ไว้เองว่า "สีของหมุดบอกว่าใบนั้นจบยังไง" ถ้าสองสถานะใช้ colorVar เดียวกัน
  // ลูกศรสีนั้นจะชี้กลับไปได้สองแถวใน legend พร้อมกัน = ประโยคบนจอกลายเป็นคำอ้างที่ตรวจไม่ได้
  // (ก่อน 2026-09-06 unresolvable กับ unknown ใช้ --text-secondary เท่ากันเป๊ะทั้งสองธีม)
  const seen = new Map();
  for (const s of MARKER_STATUS_ORDER) {
    const v = MARKER_STATUS_META[s].colorVar;
    assert(!seen.has(v), `'${s}' ใช้สี ${v} ซ้ำกับ '${seen.get(v)}' — คำอธิบายสัญลักษณ์จะชี้ได้สองทาง`);
    seen.set(v, s);
  }
});

const BANNED = ['แม่นยำ', 'โอกาสชนะ', 'ความแม่น', 'การันตี', 'รับประกัน', 'ควรซื้อ', 'ควรขาย'];

await check('ป้ายของทุกสถานะพูดถึงสิ่งที่เกิดไปแล้ว ไม่มีคำที่อ้างอนาคตหรือสั่งให้ลงมือ', () => {
  for (const s of MARKER_STATUS_ORDER) {
    for (const w of BANNED) {
      assert(!MARKER_STATUS_META[s].label.includes(w),
        `ป้ายของ '${s}' มีคำต้องห้าม "${w}": ${MARKER_STATUS_META[s].label}`);
    }
  }
});

console.log('\n6. หน้าเว็บกับตัววาดกราฟต้องใช้ของชุดเดียวกันจริง\n');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const readUi = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE_REL = 'src/app/chart/page.tsx';
const GOLD_REL = 'src/components/trading/GoldChart.tsx';
const PAGE_SRC = readUi(PAGE_REL);
const GOLD_SRC = readUi(GOLD_REL);
const PAGE_CODE = stripComments(PAGE_SRC);
const GOLD_CODE = stripComments(GOLD_SRC);

await check("หน้ากราฟเรียก buildSignalMarkerSet พร้อม include:'all' (ไม่ใช่เฉพาะใบที่ยังเปิด)", () => {
  assert(PAGE_CODE.includes('buildSignalMarkerSet('),
    'หน้ากราฟไม่ได้ใช้ buildSignalMarkerSet — มันจะไม่รู้ว่ามีใบถูกตัดออกกี่ใบ');
  assert(/include:\s*'all'/.test(PAGE_CODE),
    "หน้ากราฟไม่ได้ขอ include:'all' — กราฟจะกลับไปว่างเปล่าในวันที่ไม่มีใบเปิดอยู่");
});

await check('หน้ากราฟพิมพ์ทั้งยอดที่แสดงและยอดเต็มออกจอเมื่อมีใบถูกตัด (ห้ามตัดเงียบ ๆ)', () => {
  assert(PAGE_CODE.includes('markerSet.hidden'), 'หน้ากราฟไม่ได้อ่านยอดที่ถูกตัดเลย');
  assert(PAGE_CODE.includes('markerSet.matched'), 'หน้ากราฟไม่ได้พิมพ์ยอดเต็มของช่วงนี้');
  const at = PAGE_CODE.indexOf('markerSet.hidden');
  const near = PAGE_CODE.slice(at, at + 700);
  assert(near.includes('{markerSet.matched}') || near.includes('markerSet.matched'),
    'ยอดเต็มไม่ได้อยู่ในย่อหน้าเดียวกับเงื่อนไข "มีใบถูกตัด" — ผู้ใช้จะเห็นแค่เลขที่ถูกตัดแล้ว');
});

await check('บรรทัดสรุปนับด้วย countMarkerStatuses ตัวเดียวกับเทสต์ ไม่ใช่นับเองในหน้า', () => {
  assert(PAGE_CODE.includes('countMarkerStatuses('),
    'หน้ากราฟนับสถานะเอง — ตัวเลขบนจอกับหมุดบนกราฟจะเพี้ยนจากกันวันไหนก็ได้');
  assert(/countMarkerStatuses\(markers\)/.test(PAGE_CODE),
    'ต้องนับจากหมุดที่แสดงอยู่จริง (markers) ไม่ใช่จากชุดก่อนตัดเพดาน');
});

await check('คำอธิบายสัญลักษณ์อ่านสีจาก MARKER_STATUS_META เดียวกับที่ตัววาดกราฟอ่าน', () => {
  assert(PAGE_CODE.includes('MARKER_STATUS_META'), 'หน้ากราฟไม่ได้อ่านชุดสี/ป้ายจากที่เดียวกับกราฟ');
  assert(/rgb\(var\(\$\{MARKER_STATUS_META\[[^\]]+\]\.colorVar\}\)\)/.test(PAGE_CODE),
    'คำอธิบายสัญลักษณ์ไม่ได้ประกอบสีจาก colorVar — สีบนคำอธิบายกับบนกราฟจะเพี้ยนจากกันได้');
  assert(PAGE_CODE.includes('MARKER_STATUS_ALWAYS_SHOWN'),
    'ไม่มีชุด "สถานะที่ต้องอยู่เสมอ" — วันที่ไม่มีใบโดน SL เลย คำอธิบายจะไม่บอกว่าสีแดงคืออะไร');
});

await check('ตัววาดกราฟระบายหมุดตามสถานะ และไม่ทาทับหมุดที่ถูกเลือก', () => {
  assert(GOLD_CODE.includes('MARKER_STATUS_META'), 'ตัววาดกราฟไม่ได้อ่านชุดสีกลาง');
  assert(/color:\s*p\.markerStatus\[m\.status\]/.test(GOLD_CODE),
    'สีหมุดไม่ได้มาจากสถานะของใบนั้น');
  const block = GOLD_CODE.slice(GOLD_CODE.indexOf('const list: SeriesMarker'));
  const spec = block.slice(0, block.indexOf('plugin.setMarkers'));
  assert(spec.length > 0, 'อ่านบล็อกที่ประกอบหมุดไม่ได้ — โครงเปลี่ยนไปแล้ว ทบทวนด่านนี้ใหม่');
  assert(!/color:\s*on\s*\?/.test(spec),
    'หมุดที่ถูกเลือกถูกทาสีทับ — สีคือข้อเท็จจริงว่าใบนั้นจบยังไง การทาทับคือการลบมันทิ้ง');
  assert(/size:\s*on\s*\?/.test(spec),
    'การเลือกหมุดต้องเห็นได้จริง (ขนาดใหญ่ขึ้น) ไม่งั้นผู้ใช้ไม่รู้ว่าแตะโดนใบไหน');
  assert(!/opacity/i.test(spec),
    'มีการปรับความทึบของหมุด — ใบที่จางกว่าคือใบที่ถูกซ่อนครึ่งตัว ห้ามใช้กับผลลัพธ์');
});

await check('ขนาดหมุดขึ้นกับ "ถูกเลือกหรือไม่" เท่านั้น ไม่ขึ้นกับผลลัพธ์ของใบ', () => {
  const block = GOLD_CODE.slice(GOLD_CODE.indexOf('const list: SeriesMarker'));
  const spec = block.slice(0, block.indexOf('plugin.setMarkers'));
  const size = spec.match(/size:\s*([^,\n]+)/);
  assert(size, 'อ่านบรรทัดขนาดหมุดไม่ได้');
  assert(!size[1].includes('status'),
    'ขนาดหมุดอิงสถานะ — ใบที่แพ้จะเล็กกว่าใบที่ชนะได้ ซึ่งเป็นการโกหกด้วยน้ำหนักสายตา');
});

await check('ข้อความตอนไม่มีหมุด ต้องตรงกับความจริงใหม่ (พูดถึงทั้งใบเปิดและใบที่ปิดแล้ว)', () => {
  assert(!PAGE_CODE.includes('ตอนนี้ไม่มีสัญญาณที่ยังเปิดอยู่ในช่วงเวลาที่กราฟนี้ครอบคลุม'),
    'ยังใช้ข้อความเดิมที่พูดถึงเฉพาะใบที่ยังเปิด ทั้งที่ตอนนี้กราฟปักใบที่ปิดแล้วด้วย');
  assert(/ยังไม่มีสัญญาณของ/.test(PAGE_CODE), 'ไม่มีข้อความบอกว่าช่วงนี้ไม่มีสัญญาณเลย');
  const at = PAGE_CODE.indexOf('ยังไม่มีสัญญาณของ');
  const near = PAGE_CODE.slice(at, at + 260);
  assert(near.includes('ปิดบัญชี'),
    'ข้อความว่างเปล่าไม่ได้บอกว่ารวมใบที่ปิดบัญชีแล้วด้วย — ผู้ใช้จะนึกว่ามีใบเก่าซ่อนอยู่');
});

await check('กล่องรายละเอียดแสดงผลของใบที่ปิดแล้วครบทุกช่องที่ ledger บันทึกไว้', () => {
  for (const field of ['realizedR', 'exitPrice', 'barsHeld', 'resolvedAt']) {
    assert(PAGE_CODE.includes(`marker.${field}`), `กล่องรายละเอียดไม่ได้แสดง ${field}`);
  }
  assert(/marker\.status === 'open'/.test(PAGE_CODE),
    'กล่องรายละเอียดไม่ได้แยกกรณีใบที่ยังเปิดออกมาบอกตรง ๆ');
});

await check('เส้น entry/SL/TP ยังวาดให้ใบที่เลือกทุกใบ ไม่ได้ผูกกับสถานะ', () => {
  const at = GOLD_CODE.indexOf('const picked = markers.find');
  assert(at > 0, 'หาบล็อกเส้นราคาไม่เจอ');
  const near = GOLD_CODE.slice(at, at + 900);
  assert(!near.includes('status'),
    'การวาดเส้น entry/SL/TP อิงสถานะของใบ — ราคาสามค่านั้นเป็นสิ่งที่ใบระบุไว้จริง ไม่ว่าใบจะจบยังไง');
});

/**
 * แยก useEffect ทุกตัวของ GoldChart.tsx ออกมาเป็น { body, deps }
 *
 * ทุก effect ในไฟล์นั้นอยู่ที่ย่อหน้าเดียวกัน (เยื้อง 2 ช่อง) และปิดท้ายด้วย
 * `\n  }, [ ... ]);` เสมอ · ถ้าวันไหนรูปแบบเปลี่ยนจนแยกไม่ได้ ด่านข้างล่างจะแดง
 * เพราะจำนวน effect ที่แยกได้จะไม่ตรงกับจำนวน `useEffect(` ในไฟล์ — ไม่ใช่เขียวเงียบ ๆ
 */
function goldEffects() {
  const END = /\n {2}\}, \[([\s\S]*?)\]\);/g;
  const out = [];
  let at = -1;
  while ((at = GOLD_SRC.indexOf('useEffect(', at + 1)) >= 0) {
    END.lastIndex = at;
    const m = END.exec(GOLD_SRC);
    if (!m) continue;
    out.push({ body: GOLD_SRC.slice(at, m.index), deps: m[1] });
  }
  return out;
}

await check('แยก useEffect ของตัววาดกราฟออกมาได้ครบทุกตัว (ถ้าแยกไม่ครบ ด่านถัดไปไม่มีฟัน)', () => {
  const found = goldEffects().length;
  const declared = (GOLD_SRC.match(/useEffect\(/g) ?? []).length;
  assert(declared > 0, 'ไม่พบ useEffect ในตัววาดกราฟเลย — โครงไฟล์เปลี่ยนไปแล้ว');
  assertEqual(found, declared, `แยกได้ ${found} จาก ${declared} ตัว — รูปแบบการปิด effect เปลี่ยนไป ทบทวนตัวแยกใหม่`);
});

await check('ทุก effect ที่อ่านสีจากธีม ต้องผูก themeTick ไว้ ไม่งั้นของที่มันวาดจะค้างสีธีมเก่า', () => {
  /**
   * สองตัวนี้ได้รับยกเว้นโดยมีเหตุผล ไม่ใช่เพราะสะดวก:
   *   · ตัวสร้างกราฟ (LWC.createChart) รันครั้งเดียวตลอดอายุคอมโพเนนต์ และสีที่มันตั้ง
   *     ถูกทาใหม่โดยตัวเฝ้าธีมด้วย applyOptions อยู่แล้ว
   *   · ตัวเฝ้าธีมเอง (MutationObserver) คือคนที่ขยับ themeTick — ผูกกับตัวเองไม่ได้
   * ที่เหลือทั้งหมดทาสีของมันเองแล้วจบ (setMarkers / createPriceLine / setData ต่อจุด)
   * ธีมเปลี่ยนแล้วไม่มีใครมาทาให้ จึงต้องรันใหม่เอง
   *
   * บั๊กจริงที่ด่านนี้มาปิด (2026-09-06): effect หมุดกับ effect เส้น entry/SL/TP
   * ผูกไว้แค่ [ready, markers, selectedId] · สลับธีมแล้วแท่งเทียน เส้น MA และจุดสีใน
   * คำอธิบายใต้กราฟเปลี่ยนทันที แต่หมุดบนแคนวาสยังเป็นสีของธีมเก่า (open #25F4EE
   * และ timeout #FFD700 ค้างอยู่บนพื้นขาว) จนกว่าจะ poll รอบถัดไป — และค้างไม่มีกำหนด
   * ถ้าแท็บถูกซ่อน เพราะตัวจับเวลา poll ถูกล้างทิ้งตอนนั้น
   */
  const exempt = (body) => body.includes('LWC.createChart(') || body.includes('MutationObserver');
  let checked = 0;
  for (const e of goldEffects()) {
    if (!e.body.includes('readPalette()')) continue;
    if (exempt(e.body)) continue;
    checked++;
    assert(/\bthemeTick\b/.test(e.deps),
      `มี effect ที่อ่าน readPalette() แต่ deps เป็น [${e.deps.trim()}] ซึ่งไม่มี themeTick — ` +
      'ของที่มันวาดจะค้างสีของธีมเก่าจนกว่าข้อมูลจะเปลี่ยน');
  }
  assert(checked >= 5, `ตรวจได้แค่ ${checked} effect — น้อยกว่าที่ไฟล์นี้มีจริง ตัวแยกน่าจะพลาด`);
});

await check('negative control: deps ที่ไม่มี themeTick ต้องถูกจับได้จริง', () => {
  const fake = { body: 'const p = readPalette();', deps: 'ready, markers, selectedId' };
  assert(!/\bthemeTick\b/.test(fake.deps), 'ตัวตรวจ deps จับของปลอมไม่ได้ = ด่านข้างบนไม่มีฟัน');
});

await check('ค่าถอยของสีหมุดในตัววาดกราฟ ตรงกับที่ globals.css ประกาศไว้จริงทั้งสองธีม', () => {
  // ค่าถอยถูกใช้เมื่ออ่านตัวแปร CSS ไม่ได้ (เช่นสไตล์ยังไม่ถูกใช้กับ <html>)
  // ถ้ามันเพี้ยนจากพาเลตต์จริง ผู้ใช้จะได้สีที่ระบบไม่มีอยู่ — และไม่มี error ให้ใครเห็น
  const css = readUi('src/styles/globals.css');
  const blockOf = (sel) => {
    const at = css.indexOf(sel);
    assert(at >= 0, `หา block ${sel} ใน globals.css ไม่เจอ`);
    const open = css.indexOf('{', at);
    return css.slice(open, css.indexOf('\n}', open));
  };
  const varsOf = (block) => {
    const map = new Map();
    for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([0-9]+ [0-9]+ [0-9]+)\s*;/g)) {
      if (!map.has(m[1])) map.set(m[1], `rgb(${m[2]})`);
    }
    return map;
  };
  const light = varsOf(blockOf(':root {'));
  const dark = varsOf(blockOf('.dark {'));

  const at = GOLD_SRC.indexOf('const MARKER_FALLBACK');
  assert(at > 0, 'หา MARKER_FALLBACK ในตัววาดกราฟไม่เจอ');
  const table = GOLD_SRC.slice(at, GOLD_SRC.indexOf('};', at));
  let seen = 0;
  for (const s of MARKER_STATUS_ORDER) {
    const row = table.match(new RegExp(`${s}:\\s*\\['([^']+)',\\s*'([^']+)'\\]`));
    assert(row, `MARKER_FALLBACK ไม่มีแถวของสถานะ '${s}'`);
    const v = MARKER_STATUS_META[s].colorVar;
    assertEqual(row[1], dark.get(v), `ค่าถอยธีมมืดของ '${s}' ไม่ตรงกับ ${v} ใน .dark`);
    assertEqual(row[2], light.get(v), `ค่าถอยธีมสว่างของ '${s}' ไม่ตรงกับ ${v} ใน :root`);
    seen++;
  }
  assertEqual(seen, MARKER_STATUS_ORDER.length, 'ตรวจไม่ครบทุกสถานะ');
});

console.log('\n7. ท่าทางบนมือถือต้องไม่ถูกงานนี้แตะ (เจ้าของเน้นสองรอบแล้ว)\n');

await check("กล่องกราฟยังเป็น touchAction: 'pan-y' (ห้ามกลับไป none — เขตตายกลางจอจะกลับมา)", () => {
  assert(/touchAction:\s*'pan-y'/.test(GOLD_CODE), "touch-action ไม่ใช่ 'pan-y' แล้ว");
  assert(/vertTouchDrag:\s*false/.test(GOLD_CODE), 'vertTouchDrag ต้องเป็น false ให้สอดคล้องกับ pan-y');
});

await check('trackingMode ยังเป็น OnTouchEnd (กดค้างอ่านค่า ปล่อยนิ้วแล้วหลุดจากโหมด)', () => {
  assert(/TrackingModeExitMode\.OnTouchEnd/.test(GOLD_CODE),
    'trackingMode ถูกเปลี่ยน — กราฟจะค้างในโหมดเส้นเล็งจนลากไม่ไป (อาการที่เจ้าของรายงานมาแล้ว)');
});

console.log('\n8. คำต้องห้ามในไฟล์ที่งานนี้แก้\n');

await check('ไม่มีคำที่อ้างอนาคต/สั่งให้ลงมือ ในข้อความที่ผู้ใช้เห็นของไฟล์ที่แก้', () => {
  const files = [
    PAGE_REL,
    GOLD_REL,
    'src/lib/chart-markers.ts',
    'src/components/trading/SignalEngineSnapshot.tsx',
  ];
  for (const rel of files) {
    const code = stripComments(readUi(rel));
    for (const w of BANNED) {
      const at = code.indexOf(w);
      assert(at < 0, `${rel} มีคำต้องห้าม "${w}" ที่ตำแหน่ง ${at} — ลบทิ้ง อย่าเติมคำอธิบายมากลบเกลื่อน`);
    }
  }
});

await check('negative control: ตัวตรวจคำต้องห้ามจับของปลอมได้จริง', () => {
  const fake = stripComments(`const t = 'สัญญาณนี้แม่นยำมาก'; // ไม่ควรผ่าน`);
  assert(BANNED.some((w) => fake.includes(w)), 'ตัวตรวจคำต้องห้ามจับประโยคปลอมไม่ได้ = ด่านนี้ไม่มีฟัน');
});

// ─────────────────────────────────────── สรุป ───────────────────────────────────────

rmSync(loaded.tmpDir, { recursive: true, force: true });

console.log(`\n${'─'.repeat(70)}`);
if (failures.length === 0) {
  console.log(`ผ่านทั้งหมด ${passed} ข้อ ✓\n`);
  process.exit(0);
}
console.log(`ผ่าน ${passed} · ไม่ผ่าน ${failures.length}\n`);
for (const f of failures) console.log(`  · ${f.name}\n    ${f.message}`);
console.log('');
process.exit(1);
