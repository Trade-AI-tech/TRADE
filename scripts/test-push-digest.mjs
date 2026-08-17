#!/usr/bin/env node
/**
 * test-push-digest.mjs — เทสต์การรวมชุด / จัดลำดับ / กันเด้งซ้ำ / เก็บตกสัญญาณค้าง
 *
 * วิธีรัน
 *   node scripts/test-push-digest.mjs
 *
 * ไม่ต้องใช้เน็ต ไม่ต้องมี DB ไม่ต้องมีกุญแจ VAPID จริง — รันได้ทุกที่รวมถึงใน CI
 *
 * หลักการโหลดโค้ด: ใช้ typescript ใน node_modules ลอกชนิดออกจาก src/lib/*.ts
 * แล้ว import กลับเข้ามาเป็นโมดูลจริง (วิธีเดียวกับ scripts/run-backtest.mjs)
 * เพื่อให้เทสต์วัด "โค้ดตัวเดียวกับที่รันจริง" ไม่ใช่สำเนาที่เขียนซ้ำแล้วเพี้ยนตามกันไม่ทัน
 *
 * ไฟล์ชั่วคราวเขียนลง node_modules/.cache/ เพราะ push-server.ts ต้อง import 'web-push'
 * ถ้าเขียนลง os.tmpdir() node จะหา node_modules ไม่เจอแล้ว import พัง
 *
 * ครอบคลุมอะไรบ้าง (หัวข้อ 1-9 ข้างล่าง)
 *   · ไม่มีสัญญาณ · 1 ตัว · 7 ตัว · 200 ตัว
 *   · เก็บตกสัญญาณค้างจากรอบก่อน (บั๊ก "สัญญาณหายถาวร")
 *   · ยังไม่ได้รัน migration 006 (คอลัมน์ push_sent ยังไม่มี)
 *   · ความยาวข้อความ วัดด้วยสัญลักษณ์จริงจาก SYMBOL_UNIVERSE
 *   · การจัดอันดับ ทั้งแบบมีและไม่มี src/lib/speed-scorecard.ts
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// ───────────────────────────── โครงเทสต์เล็ก ๆ ของตัวเอง ─────────────────────────────

let passed = 0;
const failures = [];
/** ตัวเลขที่วัดได้จากการรันจริง — เอาไปรายงาน ไม่ใช่ค่าที่เดาเอาไว้ล่วงหน้า */
const measured = {};

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  FAIL ${name}\n         ${err.message}`);
  }
}

async function checkAsync(name, fn) {
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
    // ไฟล์ข้อมูลถูกคัดลอกไปด้วยชื่อเดิม (speed-scorecard.ts โหลดตารางคะแนนจาก .json)
    return base.endsWith('.json') ? `./${base}` : `./${base}.mjs`;
  }
  return spec; // แพ็กเกจภายนอก เช่น 'web-push' ปล่อยตามเดิมให้ node หาใน node_modules เอง
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
    // node บังคับให้ import JSON ต้องมี attribute กำกับ ไม่งั้นโยน ERR_IMPORT_ATTRIBUTE_MISSING
    return `${kw}${q}${mapped}${q}${mapped.endsWith('.json') ? " with { type: 'json' }" : ''}`;
  });
}

/** ไฟล์ที่ไม่มีก็ไม่เป็นไร — เป็นของเอเจนต์อีกตัว ระบบต้องทำงานได้ทั้งแบบมีและไม่มี */
const OPTIONAL_MODULES = ['src/lib/speed-scorecard.ts'];

function loadModules() {
  const cacheRoot = path.join(ROOT, 'node_modules', '.cache');
  mkdirSync(cacheRoot, { recursive: true });
  const tmpDir = mkdtempSync(path.join(cacheRoot, 'push-digest-test-'));

  // '@/types' เป็น type ล้วน ถูกลอกออกตอน transpile — เขียน stub ว่างกัน import ค้าง
  writeFileSync(path.join(tmpDir, 'types.mjs'), 'export {};\n', 'utf8');

  // ไฟล์ข้อมูลของ lib คัดลอกไปทั้งดุ้น (ตารางคะแนนความเร็วอยู่ในนี้)
  const libDir = path.join(ROOT, 'src', 'lib');
  for (const f of readdirSync(libDir)) {
    if (f.endsWith('.json')) copyFileSync(path.join(libDir, f), path.join(tmpDir, f));
  }

  // universe.ts อยู่ในรายการเพราะเทสต์ความยาวข้อความต้องใช้ "สัญลักษณ์จริง" ไม่ใช่ชื่อสมมติ
  // (ไฟล์ของคนอื่นทั้งหมดในนี้ — อ่านอย่างเดียว ไม่แก้)
  const required = ['src/lib/errors.ts', 'src/lib/push-digest.ts', 'src/lib/push-server.ts', 'src/lib/universe.ts'];
  const optional = OPTIONAL_MODULES.filter((rel) => existsSync(path.join(ROOT, ...rel.split('/'))));
  for (const rel of [...required, ...optional]) {
    const abs = path.join(ROOT, ...rel.split('/'));
    const base = path.basename(rel, '.ts');
    writeFileSync(path.join(tmpDir, `${base}.mjs`), transpile(readFileSync(abs, 'utf8'), `${base}.ts`), 'utf8');
  }

  return { tmpDir, hasScorecard: optional.includes('src/lib/speed-scorecard.ts') };
}

// ─────────────────────────────── ตัวช่วยสร้างสัญญาณปลอม ───────────────────────────────

let signalSeq = 0;
function makeSignal(over = {}) {
  signalSeq++;
  return {
    id: `sig-${String(signalSeq).padStart(4, '0')}`,
    user_id: 'user-1',
    symbol: 'XAUUSD',
    name: 'Gold Spot',
    market: 'GOLD',
    action: 'BUY',
    strength: 'moderate',
    status: 'active',
    entry_price: 2650.25,
    stop_loss: 2630.25,
    take_profit: 2690.25,
    current_price: 2650.25,
    confidence: 70,
    timeframe: '1D',
    reasons: [],
    indicators: {},
    news_sentiment: null,
    telegram_sent: false,
    expires_at: null,
    created_at: new Date().toISOString(),
    ...over,
  };
}

/** สุ่มแบบมีเมล็ด — สับลำดับให้ผลซ้ำได้ ไม่งั้นเทสต์ที่ล้มจะทำซ้ำไม่ได้ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * สำเนา signalToPush "ฉบับก่อนแก้" ยกมาทั้งดุ้นจาก src/lib/push-server.ts
 * มีไว้เทียบว่าการย้ายโค้ดไป push-digest.ts ไม่ได้เปลี่ยนข้อความที่ผู้ใช้เห็นแม้แต่ตัวเดียว
 * ⚠ ห้ามแก้ตามโค้ดใหม่ — ถ้าอันนี้ต้องแก้ แปลว่าของเดิมพังแล้ว
 *   (รูปแบบเดี่ยวยังมีผู้เรียกจริงอยู่: src/app/api/cron/scan-markets/route.ts)
 */
function legacyFmt(n) {
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return n.toPrecision(4);
}
function legacySignalToPush(signal) {
  const arrow = signal.action === 'BUY' ? '🟢 ซื้อ' : '🔴 ขาย';
  const strong = signal.strength === 'very_strong' || signal.strength === 'strong';
  return {
    title: `${arrow} ${signal.symbol} @ ${legacyFmt(signal.entry_price)}`,
    body:
      `TP ${legacyFmt(signal.take_profit)} · SL ${legacyFmt(signal.stop_loss)}\n` +
      `ความมั่นใจ ${signal.confidence}%${strong ? ' · สัญญาณแรง' : ''} · ${signal.timeframe}`,
    tag: `signal-${signal.id}`,
    url: '/signals',
  };
}

// ───────────────────────── Supabase ปลอม (PostgREST ฉบับย่อ) ─────────────────────────

/**
 * ทำไมต้องเขียนตัวปลอมที่ "กรอง/เรียง/อัปเดตได้จริง" แทนตัวปลอมที่คืนค่าตายตัว
 *
 * บั๊กที่รอบนี้มาแก้อยู่ในลำดับการอ่าน-เขียน DB ล้วน ๆ (อ่านของค้าง → ส่ง → ปั๊มว่าแจ้งแล้ว)
 * ตัวปลอมที่คืนค่าตายตัวจะผ่านทุกเทสต์โดยไม่ได้พิสูจน์อะไรเลย เพราะมันไม่รู้จักคำว่า
 * "แถวนี้ถูกปั๊มไปแล้ว" — เทสต์ที่สำคัญที่สุด (รอบหน้าเก็บตกได้ไหม) จึงต้องมีสถานะจริง
 *
 * รองรับเท่าที่ push-server.ts ใช้จริงเท่านั้น: select/update/delete/insert +
 * eq/gte/in/not(is null)/or(is null|gt)/order/limit/maybeSingle
 * และจำลอง error 42703 (คอลัมน์ไม่มีอยู่) เมื่อสั่งปิดคอลัมน์ push_sent
 */
function makeFakeDb({ signals = [], subs = [], pushColumn = true, failUpdate = false } = {}) {
  const db = {
    tables: {
      signals: signals.map((s) => ({ push_sent: false, push_sent_at: null, ...s })),
      push_subscriptions: subs.map((s) => ({ ...s })),
    },
    pushColumn,
    failUpdate,
    log: [],
  };

  const cmp = (a, b) => {
    const av = a === null || a === undefined ? '' : String(a);
    const bv = b === null || b === undefined ? '' : String(b);
    return av < bv ? -1 : av > bv ? 1 : 0;
  };

  db.from = function from(table) {
    const q = { table, op: 'select', filters: [], refs: [], order: null, limit: null, payload: null };

    const ref = (cols) => {
      for (const c of String(cols).split(',')) q.refs.push(c.trim());
    };

    async function run() {
      q.rows = db.tables[q.table] ?? [];
      db.log.push({ table: q.table, op: q.op, refs: [...q.refs] });

      // คอลัมน์ยังไม่มี = Postgres ตอบ 42703 ไม่ว่าจะอ้างถึงตรงไหนของ query
      const missing = q.refs.find((c) => c.startsWith('push_sent'));
      if (!db.pushColumn && q.table === 'signals' && missing) {
        return { data: null, error: { code: '42703', message: `column signals.${missing} does not exist` } };
      }

      const match = (r) => q.filters.every((f) => f(r));

      if (q.op === 'update') {
        if (db.failUpdate) return { data: null, error: { code: 'XX000', message: 'จำลองว่าอัปเดตไม่สำเร็จ' } };
        for (const r of q.rows) if (match(r)) Object.assign(r, q.payload);
        return { data: null, error: null };
      }
      if (q.op === 'delete') {
        db.tables[q.table] = q.rows.filter((r) => !match(r));
        return { data: null, error: null };
      }
      if (q.op === 'insert') {
        const rows = Array.isArray(q.payload) ? q.payload : [q.payload];
        for (const r of rows) q.rows.push({ push_sent: false, push_sent_at: null, ...r });
        return { data: null, error: null };
      }

      let out = q.rows.filter(match).map((r) => ({ ...r }));
      if (q.order) out.sort((a, b) => (q.order.asc ? cmp(a[q.order.col], b[q.order.col]) : cmp(b[q.order.col], a[q.order.col])));
      if (q.limit !== null) out = out.slice(0, q.limit);
      return { data: out, error: null };
    }

    const b = {
      select(cols = '*') { q.op = 'select'; ref(cols); return b; },
      insert(rows) { q.op = 'insert'; q.payload = rows; return b; },
      update(payload) { q.op = 'update'; q.payload = payload; ref(Object.keys(payload).join(',')); return b; },
      delete() { q.op = 'delete'; return b; },
      eq(col, val) { ref(col); q.filters.push((r) => r[col] === val); return b; },
      gte(col, val) { ref(col); q.filters.push((r) => cmp(r[col], val) >= 0); return b; },
      lt(col, val) { ref(col); q.filters.push((r) => cmp(r[col], val) < 0); return b; },
      in(col, vals) { ref(col); q.filters.push((r) => vals.includes(r[col])); return b; },
      not(col, op, val) {
        ref(col);
        if (op === 'is' && val === null) q.filters.push((r) => r[col] !== null && r[col] !== undefined);
        return b;
      },
      or(expr) {
        const preds = expr.split(',').map((part) => {
          const [col, op, ...rest] = part.trim().split('.');
          const val = rest.join('.');
          ref(col);
          if (op === 'is' && val === 'null') return (r) => r[col] === null || r[col] === undefined;
          if (op === 'gt') return (r) => r[col] !== null && r[col] !== undefined && cmp(r[col], val) > 0;
          return () => true;
        });
        q.filters.push((r) => preds.some((p) => p(r)));
        return b;
      },
      order(col, opts) { ref(col); q.order = { col, asc: opts?.ascending !== false }; return b; },
      limit(n) { q.limit = n; return b; },
      async maybeSingle() {
        const res = await run();
        return { data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error };
      },
      then(resolve, reject) { return run().then(resolve, reject); },
    };
    return b;
  };

  return db;
}

/** ตัวส่งปลอมที่บันทึกทุกใบที่ถูกยิง — ใช้แทน web-push จริงในเทสต์ทุกตัว */
function makeRecorder({ sent = 1, noSubscriptions = false, failed = 0, errors = [] } = {}) {
  const calls = [];
  return {
    calls,
    sender: async (payload) => {
      calls.push(payload);
      return { sent, failed, pruned: 0, noSubscriptions, errors };
    },
  };
}

/**
 * ตัวส่งปลอมสำหรับ "โหมดถอย" โดยเฉพาะ — ปั๊ม push_subscriptions.last_used_at ให้ด้วย
 *
 * ทำไมต้องมีอีกตัว: โหมดถอย (ยังไม่ได้รัน migration 006) ไม่มีคอลัมน์ push_sent_at
 * จึงต้องใช้ last_used_at เป็นนาฬิกา ซึ่งของจริงถูกปั๊มอยู่ข้างใน sendPushToUser
 * ตัวส่งปลอมธรรมดา (makeRecorder) แทนที่ sendPushToUser ทั้งตัว = ไม่มีใครปั๊มนาฬิกา
 * แล้วตัวจำกัดความถี่จะ "ไม่มีวันทำงาน" ในเทสต์ ทั้งที่ของจริงทำงาน — วัดผิดไปทั้งชุด
 *
 * ตั้ง rec.now ก่อนเรียกทุกครั้ง (ตัวส่งอ่านค่านั้นเป็นเวลาที่ push ถึงเครื่อง)
 */
function makeStampingRecorder(db, { sent = 1 } = {}) {
  const calls = [];
  const rec = {
    calls,
    now: 0,
    sender: async (payload) => {
      calls.push({ ...payload, at: rec.now });
      for (const s of db.tables.push_subscriptions) s.last_used_at = new Date(rec.now).toISOString();
      return { sent, failed: 0, pruned: 0, noSubscriptions: false, errors: [] };
    },
  };
  return rec;
}

/** อ่านไฟล์ในโปรเจกต์มาตรวจโครงสร้าง — ใช้พิสูจน์ว่า "ตัวส่งที่ยิงทีละสัญญาณถูกปิดแล้วจริง" */
function readProjectFile(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

/** ตัดคอมเมนต์ออกก่อนตรวจโครงสร้าง — คอมเมนต์ที่ "เล่าถึงของเก่า" ต้องไม่ทำให้เทสต์เข้าใจผิด */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');
}

// ───────────────────────────────────── main ─────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 3600_000;
const T0 = Date.UTC(2026, 7, 17, 10, 5, 0); // 17 ส.ค. 2026 10:05 UTC — เวลาอ้างอิงคงที่
const iso = (ms) => new Date(ms).toISOString();

async function main() {
  const { tmpDir, hasScorecard } = loadModules();
  let digest, server, universe, webpush;
  let scorecard = null;
  let scorecardError = null;
  try {
    digest = await import(pathToFileURL(path.join(tmpDir, 'push-digest.mjs')).href);
    server = await import(pathToFileURL(path.join(tmpDir, 'push-server.mjs')).href);
    universe = await import(pathToFileURL(path.join(tmpDir, 'universe.mjs')).href);
    webpush = require('web-push');
    if (hasScorecard) {
      // โหลดแยกและจับ error ไว้ — ไฟล์นี้เป็นของคนอื่น พังแล้วต้องรายงานเป็นเทสต์ที่ล้ม
      // ไม่ใช่ทำให้เทสต์ทั้งไฟล์ตายจนไม่รู้ว่าของเราเองยังดีอยู่ไหม
      try {
        scorecard = await import(pathToFileURL(path.join(tmpDir, 'speed-scorecard.mjs')).href);
      } catch (e) {
        scorecardError = e?.message ?? String(e);
      }
    }
  } finally {
    // import สำเร็จแล้วโมดูลอยู่ในหน่วยความจำ ลบไฟล์ชั่วคราวได้เลย
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const {
    PUSH_DIGEST_CONFIG, SPEED_CONFIG, MAX_SIGNAL_SCORE, buildPushPayloads, buildDigestPayload,
    buildSingleSignalPayload, rankSignals, collapseDuplicates, scoreSignal, speedValue,
    throttleVerdict, roundThrottleVerdict, digestTag, clip, visibleLength, riskReward, fmtPrice,
  } = digest;
  const { signalToPush, sendPushToUser, sendSignalsToUser, sendPendingSignalsToUser, pushStateColumnAvailable, PUSH_STATE_CONFIG } = server;
  const CFG = PUSH_DIGEST_CONFIG;

  console.log('\n═══ 1. รูปแบบสัญญาณเดี่ยว (ของเก่าที่ route บน Vercel ยังใช้อยู่) ═══\n');

  check('signalToPush ให้ผลตรงกับฉบับก่อนแก้ทุกตัวอักษร (BUY/SELL × ทุกความแรง × ราคาหลายสเกล)', () => {
    let cases = 0;
    for (const action of ['BUY', 'SELL']) {
      for (const strength of ['weak', 'moderate', 'strong', 'very_strong']) {
        for (const [entry, sl, tp] of [
          [2650.25, 2630.25, 2690.25],   // ทองคำ 4 หลัก
          [1.08452, 1.08052, 1.09252],   // EURUSD ทศนิยม 5 ตำแหน่ง
          [0.02871, 0.02791, 0.03031],   // เหรียญราคาต่ำกว่า 1
          [95200, 93200, 99200],         // BTC หลักหมื่น
          [Number.NaN, 1, 2],            // ค่าเพี้ยน — ต้องได้ '-' เหมือนเดิม
        ]) {
          const s = makeSignal({ action, strength, entry_price: entry, stop_loss: sl, take_profit: tp, confidence: 73 });
          const now = signalToPush(s);
          const old = legacySignalToPush(s);
          assertEqual(now.title, old.title, `title ไม่ตรง (${action}/${strength}/${entry})`);
          assertEqual(now.body, old.body, `body ไม่ตรง (${action}/${strength}/${entry})`);
          assertEqual(now.tag, old.tag, `tag ไม่ตรง (${action}/${strength}/${entry})`);
          assertEqual(now.url, old.url, `url ไม่ตรง (${action}/${strength}/${entry})`);
          cases++;
        }
      }
    }
    measured.parityCases = cases;
  });

  console.log('\n═══ 2. หนึ่งรอบสแกน = หนึ่งแจ้งเตือน ไม่ว่าจะมีกี่สัญญาณ ═══\n');

  check('ไม่มีสัญญาณ → ไม่ส่งอะไรเลย (ห้ามเด้ง "วันนี้ไม่มีอะไร" ทุกชั่วโมง)', () => {
    assertEqual(buildPushPayloads([], T0).length, 0, 'ต้องไม่มี payload');
  });

  check('สัญญาณเดียว → 1 แจ้งเตือน ใช้ tag รายชั่วโมง และมี เข้า/TP/SL ครบ', () => {
    const s = makeSignal({ id: 'abc-123' });
    const out = buildPushPayloads([s], T0);
    assertEqual(out.length, 1, 'ต้องได้ payload เดียว');
    assertEqual(out[0].tag, digestTag(T0), 'สัญญาณเดียวก็ต้องใช้ tag รายชั่วโมง ไม่ใช่ tag รายสัญญาณ (ไม่งั้นรันสองรอบในชั่วโมงเดียวได้สองใบ)');
    assert(!out[0].title.includes('อีก'), `สัญญาณเดียวห้ามมี "อีก 0" ในหัวข้อ — ได้ "${out[0].title}"`);
    for (const [label, v] of [['เข้า', s.entry_price], ['TP', s.take_profit], ['SL', s.stop_loss]]) {
      assert(out[0].body.includes(fmtPrice(v)), `เนื้อความต้องมีราคา${label} ${fmtPrice(v)} — ได้ "${out[0].body}"`);
    }
    measured.singleTitle = out[0].title;
    measured.singleBody = out[0].body;
  });

  const many = [
    makeSignal({ symbol: 'XAUUSD', action: 'BUY', strength: 'very_strong', confidence: 88, timeframe: '1H', entry_price: 2650.25, stop_loss: 2640.25, take_profit: 2690.25 }),
    makeSignal({ symbol: 'EURUSD', action: 'SELL', strength: 'strong', confidence: 78, timeframe: '1D', entry_price: 1.08452, stop_loss: 1.09052, take_profit: 1.07252 }),
    makeSignal({ symbol: 'BTC', action: 'BUY', strength: 'strong', confidence: 74, timeframe: '1H', entry_price: 95200, stop_loss: 93200, take_profit: 99200 }),
    makeSignal({ symbol: 'GBPUSD', action: 'SELL', strength: 'moderate', confidence: 71, timeframe: '1D', entry_price: 1.2610, stop_loss: 1.2690, take_profit: 1.2450 }),
    makeSignal({ symbol: 'USDTHB', action: 'BUY', strength: 'moderate', confidence: 66, timeframe: '1D', entry_price: 34.85, stop_loss: 34.55, take_profit: 35.45 }),
    makeSignal({ symbol: 'PTT', action: 'BUY', strength: 'moderate', confidence: 62, timeframe: '1D', entry_price: 33.5, stop_loss: 32.5, take_profit: 35.5 }),
    makeSignal({ symbol: 'AAPL', action: 'SELL', strength: 'moderate', confidence: 60, timeframe: '1D', entry_price: 228.4, stop_loss: 233.4, take_profit: 218.4 }),
  ];

  check('7 สัญญาณ → โทรศัพท์สั่นครั้งเดียว ไม่ใช่ 7 ครั้ง', () => {
    const out = buildPushPayloads(many, T0);
    assertEqual(out.length, 1, 'ต้องรวมเหลือ payload เดียว');
    measured.digestTitle = out[0].title;
    measured.digestBody = out[0].body;
  });

  check('ทุกบรรทัดในชุดมี เข้า/TP/SL ครบ และเรียงตามลำดับ (1. 2. 3. …)', () => {
    const p = buildDigestPayload(many, T0);
    const ranked = collapseDuplicates(rankSignals(many));
    const lines = p.body.split('\n');
    for (let i = 0; i < CFG.DIGEST_MAX_ITEMS; i++) {
      const s = ranked[i];
      assert(lines[i].startsWith(`${i + 1}. `), `บรรทัดที่ ${i + 1} ต้องขึ้นต้นด้วยเลขอันดับ — ได้ "${lines[i]}"`);
      assert(lines[i].includes(s.symbol), `บรรทัดที่ ${i + 1} ควรเป็น ${s.symbol} — ได้ "${lines[i]}"`);
      for (const [label, v] of [['เข้า', s.entry_price], ['TP', s.take_profit], ['SL', s.stop_loss]]) {
        assert(lines[i].includes(fmtPrice(v)), `บรรทัดที่ ${i + 1} ขาดราคา${label} (${fmtPrice(v)}) — ได้ "${lines[i]}"`);
      }
    }
  });

  check('หัวข้อขึ้นต้นด้วยตัวเด่นสุด: ทิศทาง → สัญลักษณ์ → ราคา + จำนวนที่เหลือ', () => {
    const p = buildDigestPayload(many, T0);
    assert(p.title.startsWith('🟢 ซื้อ XAUUSD '), `หัวข้อต้องขึ้นต้นด้วยตัวเด่นสุด — ได้ "${p.title}"`);
    assert(p.title.includes('2,650.25'), 'หัวข้อต้องมีราคาเข้า');
    assert(p.title.includes('อีก 6'), 'หัวข้อต้องบอกจำนวนที่เหลือ');
  });

  check('15 สัญญาณก็ยังสั่นครั้งเดียว และบอกจำนวนที่ซ่อนไว้ครบ ไม่ตัดทิ้งเงียบ', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) =>
      makeSignal({ symbol: `SYM${String(i).padStart(2, '0')}`, confidence: 90 - i, action: i % 2 ? 'SELL' : 'BUY' })
    );
    const out = buildPushPayloads(fifteen, T0);
    assertEqual(out.length, 1, 'ต้องรวมเหลือ payload เดียว');
    assert(out[0].title.includes('อีก 14'), `หัวข้อต้องบอกว่ามีอีก 14 ตัว — ได้ "${out[0].title}"`);
    const hidden = 15 - CFG.DIGEST_MAX_ITEMS;
    assert(out[0].body.includes(`+ อีก ${hidden} ตัว`), `เนื้อความต้องบอกว่าซ่อนอีก ${hidden} — ได้ "${out[0].body}"`);
  });

  check('บรรทัดท้ายบอกรูปทรงของชุด (ซื้อกี่ตัว/ขายกี่ตัว/แรงกี่ตัว)', () => {
    const p = buildDigestPayload(many, T0);
    const last = p.body.split('\n').pop();
    assert(last.includes('ซื้อ 4') && last.includes('ขาย 3') && last.includes('แรง 3'), `บรรทัดสรุปไม่ตรง — ได้ "${last}"`);
  });

  console.log('\n═══ 3. การจัดลำดับต้องอธิบายได้และคงที่ ═══\n');

  check('สับลำดับอินพุต 500 ครั้ง ได้ลำดับผลลัพธ์เดิมทุกครั้ง', () => {
    const baseline = rankSignals(many).map((s) => s.id).join(',');
    for (let seed = 1; seed <= 500; seed++) {
      const got = rankSignals(shuffle(many, mulberry32(seed))).map((s) => s.id).join(',');
      assertEqual(got, baseline, `สับด้วยเมล็ด ${seed} แล้วลำดับเพี้ยน`);
    }
    measured.shuffleRuns = 500;
    measured.rankOrder = rankSignals(many).map((s) => `${s.symbol}/${s.timeframe}`).join(' > ');
  });

  check('เกณฑ์ที่ 1 ความแรงมาก่อน: very_strong มั่นใจ 60% ยังชนะ strong มั่นใจ 99%', () => {
    const a = makeSignal({ symbol: 'AAA', strength: 'very_strong', confidence: 60 });
    const b = makeSignal({ symbol: 'BBB', strength: 'strong', confidence: 99 });
    assertEqual(rankSignals([b, a])[0].symbol, 'AAA', 'very_strong ต้องอยู่บนสุด');
  });

  check('เกณฑ์ที่ 2 ความแรงเท่ากัน → ความมั่นใจสูงกว่าอยู่บน', () => {
    const a = makeSignal({ symbol: 'AAA', strength: 'strong', confidence: 70 });
    const b = makeSignal({ symbol: 'BBB', strength: 'strong', confidence: 85 });
    assertEqual(rankSignals([a, b])[0].symbol, 'BBB', 'ความมั่นใจสูงกว่าต้องอยู่บน');
  });

  check('เกณฑ์ที่ 3 เท่ากันหมด → ผลตอบแทนต่อความเสี่ยงดีกว่าอยู่บน (ตัดเพดานที่ 3R)', () => {
    const rr1 = makeSignal({ symbol: 'AAA', strength: 'strong', confidence: 80, entry_price: 100, stop_loss: 90, take_profit: 110 });   // 1R
    const rr3 = makeSignal({ symbol: 'BBB', strength: 'strong', confidence: 80, entry_price: 100, stop_loss: 90, take_profit: 130 });   // 3R
    assertEqual(rankSignals([rr1, rr3])[0].symbol, 'BBB', '3R ต้องอยู่เหนือ 1R');

    const rr10 = makeSignal({ symbol: 'CCC', strength: 'strong', confidence: 80, entry_price: 100, stop_loss: 99, take_profit: 110 });  // 10R (SL แคบผิดปกติ)
    assert(Math.abs(scoreSignal(rr10) - scoreSignal(rr3)) < 1e-9, '10R ต้องได้คะแนนเท่า 3R เพราะตัดเพดานไว้');
  });

  check('เกณฑ์ที่ 4 เท่ากันหมดจริง ๆ → ตัวที่เน่าเร็วกว่า (1H) อยู่เหนือ 1D', () => {
    const d1 = makeSignal({ symbol: 'AAA', strength: 'strong', confidence: 80, timeframe: '1D' });
    const h1 = makeSignal({ symbol: 'AAA', strength: 'strong', confidence: 80, timeframe: '1H' });
    assertEqual(rankSignals([d1, h1])[0].timeframe, '1H', '1H ต้องอยู่เหนือ 1D เมื่อคุณภาพเท่ากัน');
  });

  check('ความเน่าเร็วต้องไม่แรงพอจะแซงขั้นความแรง (1H moderate ห้ามแซง 1D strong)', () => {
    const weakFast = makeSignal({ symbol: 'AAA', strength: 'moderate', confidence: 80, timeframe: '1H' });
    const strongSlow = makeSignal({ symbol: 'BBB', strength: 'strong', confidence: 80, timeframe: '1D' });
    assertEqual(rankSignals([weakFast, strongSlow])[0].symbol, 'BBB', 'strong 1D ต้องยังอยู่บน');
  });

  check('คะแนนอยู่ในช่วง 0..MAX_SIGNAL_SCORE เสมอ แม้ข้อมูลเพี้ยน', () => {
    const broken = [
      makeSignal({ confidence: 999 }),
      makeSignal({ confidence: -50 }),
      makeSignal({ confidence: Number.NaN }),
      makeSignal({ entry_price: 100, stop_loss: 100, take_profit: 120 }), // ความเสี่ยง 0
      makeSignal({ entry_price: Number.NaN }),
      makeSignal({ strength: 'weak', confidence: 0, timeframe: 'ไม่รู้จัก' }),
    ];
    for (const s of broken) {
      const v = scoreSignal(s);
      assert(Number.isFinite(v), `คะแนนต้องเป็นตัวเลขเสมอ — ได้ ${v}`);
      assert(v >= 0 && v <= MAX_SIGNAL_SCORE, `คะแนน ${v} หลุดช่วง 0..${MAX_SIGNAL_SCORE}`);
    }
    assertEqual(riskReward(makeSignal({ entry_price: 100, stop_loss: 100, take_profit: 120 })), null, 'ความเสี่ยง 0 ต้องคืน null ไม่ใช่ 0');
  });

  check('ยุบตัวซ้ำ: XAUUSD ซื้อ 1D + 1H นับเป็นการตัดสินใจเดียว', () => {
    const d = makeSignal({ symbol: 'XAUUSD', action: 'BUY', timeframe: '1D', strength: 'strong', confidence: 80 });
    const h = makeSignal({ symbol: 'XAUUSD', action: 'BUY', timeframe: '1H', strength: 'moderate', confidence: 70 });
    const collapsed = collapseDuplicates(rankSignals([h, d]));
    assertEqual(collapsed.length, 1, 'ต้องเหลือรายการเดียว');
    assertEqual(collapsed[0].timeframe, '1D', 'ต้องเก็บตัวที่คะแนนสูงกว่าไว้');

    // แต่คนละทิศทางของ symbol เดียวกันคือคนละการตัดสินใจ ห้ามยุบ
    const sell = makeSignal({ symbol: 'XAUUSD', action: 'SELL', timeframe: '1H' });
    assertEqual(collapseDuplicates(rankSignals([d, sell])).length, 2, 'ซื้อกับขายของ symbol เดียวกันต้องไม่ยุบรวมกัน');
  });

  console.log('\n═══ 4. คะแนนความเร็ว (src/lib/speed-scorecard.ts — มีก็ใช้ ไม่มีก็ต้องเดินได้) ═══\n');

  check('ไม่ส่งตัวให้คะแนนมา → ลำดับเท่ากับของเดิมเป๊ะทุกตัว', () => {
    const withNull = rankSignals(many, null).map((s) => s.id).join(',');
    const withUndef = rankSignals(many).map((s) => s.id).join(',');
    assertEqual(withNull, withUndef, 'ส่ง null กับไม่ส่งต้องได้ผลเดียวกัน');
  });

  check('มีคะแนนความเร็ว → ตัวที่น่าจะจบใน 1 ชม. ขึ้นบนสุด แม้คะแนนคุณภาพต่ำกว่า', () => {
    const slowStrong = makeSignal({ symbol: 'SLOW', strength: 'very_strong', confidence: 95, timeframe: '1D' });
    const fastWeak = makeSignal({ symbol: 'FAST', strength: 'moderate', confidence: 55, timeframe: '1H' });
    assertEqual(rankSignals([fastWeak, slowStrong])[0].symbol, 'SLOW', 'ไม่มีคะแนนความเร็ว ตัวแรงต้องอยู่บน');

    const scorer = (s) => (s.symbol === 'FAST' ? { score: 0.8, sampleSize: 120, basis: 'holdBars<=1' } : { score: 0.1, sampleSize: 120 });
    assertEqual(rankSignals([slowStrong, fastWeak], scorer)[0].symbol, 'FAST', 'มีคะแนนความเร็วแล้ว ตัวที่จบเร็วต้องขึ้นบน');
  });

  check(`ตัวอย่างน้อยกว่า ${SPEED_CONFIG.MIN_SAMPLE_SIZE} ไม้ → ไม่เชื่อคะแนน (นับเป็น "ไม่รู้" ไม่ใช่ "เร็ว")`, () => {
    assertEqual(speedValue({ score: 0.99, sampleSize: SPEED_CONFIG.MIN_SAMPLE_SIZE - 1 }), 0, 'ตัวอย่างน้อยต้องถูกปัดเป็น 0');
    assertEqual(speedValue({ score: 0.99, sampleSize: SPEED_CONFIG.MIN_SAMPLE_SIZE }), 0.99, 'ตัวอย่างพอต้องเชื่อ');
    assertEqual(speedValue(0.5), 0.5, 'ตัวเลขดิบต้องใช้ได้');
    assertEqual(speedValue(null), 0, 'null = ไม่รู้');
    assertEqual(speedValue(undefined), 0, 'undefined = ไม่รู้');
    assertEqual(speedValue({ basis: 'ไม่มี score' }), 0, 'ไม่มี score = ไม่รู้');
    assertEqual(speedValue(Number.NaN), 0, 'NaN = ไม่รู้');
  });

  check('ตัวให้คะแนนโยน error กลางทาง → ต้องไม่ล้ม และลำดับกลับไปเป็นแบบเดิม', () => {
    const boom = () => { throw new Error('scorecard พัง'); };
    const got = rankSignals(many, boom).map((s) => s.id).join(',');
    assertEqual(got, rankSignals(many).map((s) => s.id).join(','), 'ลำดับต้องเท่ากับตอนไม่มีคะแนนความเร็ว');
  });

  check('timeframe ที่วัดความเร็วไม่ได้ (speedMeasurable = false) → ห้ามเอาคะแนนมาเรียงปนกับ 1H', () => {
    // เคสจริงที่วัดได้จาก speed-scorecard: XAUUSD/1D ได้ 55 · XAUUSD/1H ได้ 54
    // ถ้าเชื่อคะแนนตรง ๆ ไม้ที่กินเวลา 2 วันจะขึ้นไปอยู่เหนือไม้ที่จบใน 2 ชั่วโมง
    assertEqual(speedValue({ score: 55, sampleSize: 216, speedMeasurable: false }), 0, '1D ต้องถูกนับเป็น "ไม่รู้"');
    assertEqual(speedValue({ score: 54, sampleSize: 553, speedMeasurable: true }), 54, '1H ต้องใช้คะแนนได้');

    const d = makeSignal({ symbol: 'XAUUSD', action: 'BUY', timeframe: '1D', strength: 'strong', confidence: 80 });
    const h = makeSignal({ symbol: 'XAUUSD', action: 'SELL', timeframe: '1H', strength: 'strong', confidence: 80 });
    const scorer = (s) => (s.timeframe === '1D'
      ? { score: 55, sampleSize: 216, speedMeasurable: false }
      : { score: 54, sampleSize: 553, speedMeasurable: true });
    assertEqual(rankSignals([d, h], scorer)[0].timeframe, '1H', '1H ต้องอยู่เหนือ 1D');
  });

  if (!hasScorecard) {
    console.log('  ข้าม  ยังไม่มี src/lib/speed-scorecard.ts — ข้ามเทสต์ต่อสายจริง (ระบบต้องทำงานได้อยู่แล้วโดยไม่มีไฟล์นี้)');
  } else {
    check('ต่อสายจริงกับ src/lib/speed-scorecard.ts ที่มีอยู่ตอนนี้', () => {
      assert(!scorecardError, `โหลด speed-scorecard.ts ไม่สำเร็จ: ${scorecardError}`);
      // ชื่อ export ต้องเป็นหนึ่งในที่ scan-universe.mjs (SPEED_EXPORT_NAMES) มองหา
      const fn = ['speedScore', 'speedScoreOf', 'scoreSpeed', 'speedRank'].map((n) => scorecard[n]).find((v) => typeof v === 'function');
      assert(fn, `ไม่พบ export ที่ scan-universe.mjs มองหา — ที่มีอยู่: ${Object.keys(scorecard).join(', ')}`);

      // Signal เต็ม ๆ ต้องใส่เข้าไปได้เลย (มี symbol/market/timeframe ครบ)
      const fast = fn(makeSignal({ symbol: 'BTC', market: 'CRYPTO', timeframe: '1H' }));
      const slow = fn(makeSignal({ symbol: 'BTC', market: 'CRYPTO', timeframe: '1D' }));
      assert(typeof fast?.score === 'number', `ผลลัพธ์ต้องมี score เป็นตัวเลข — ได้ ${JSON.stringify(fast)}`);

      measured.realSpeed1H = `${fast.score} (basis ${fast.basis} · n ${fast.sampleSize} · วัดความเร็วได้ ${fast.speedMeasurable})`;
      measured.realSpeed1D = `${slow.score} (basis ${slow.basis} · n ${slow.sampleSize} · วัดความเร็วได้ ${slow.speedMeasurable})`;
      measured.realSpeedValue1H = speedValue(fast);
      measured.realSpeedValue1D = speedValue(slow);

      // ผลรวมที่ต้องได้: 1H (วัดความเร็วได้) ต้องไม่ถูก 1D แซงเพราะตัวเลขดิบสูงกว่า
      const h = makeSignal({ symbol: 'BTC', market: 'CRYPTO', action: 'BUY', timeframe: '1H', strength: 'moderate', confidence: 60 });
      const d = makeSignal({ symbol: 'BTC', market: 'CRYPTO', action: 'SELL', timeframe: '1D', strength: 'moderate', confidence: 60 });
      assertEqual(rankSignals([d, h], fn)[0].timeframe, '1H', 'สัญญาณ 1H ต้องอยู่บนสุดเมื่อคุณภาพเท่ากัน');
    });
  }

  console.log('\n═══ 5. ความยาวข้อความต้องอยู่ในงบของหน้าจอล็อก ═══\n');

  check('วัดด้วยสัญลักษณ์จริงทั้ง SYMBOL_UNIVERSE + ราคาสมจริงของแต่ละตลาด', () => {
    // ราคาที่ใช้วัดเป็นระดับราคาจริงโดยประมาณของแต่ละตลาด (ส.ค. 2026) — ไม่ใช่ตัวเลขที่ดึงสด
    const priceOf = {
      GOLD: 2650.25, FOREX: 1.08452, CRYPTO: 95200, US_STOCK: 228.4, TH_STOCK: 33.5,
    };
    const set = universe.SYMBOL_UNIVERSE.map((u, i) => {
      const p = priceOf[u.market] ?? 100;
      return makeSignal({
        symbol: u.symbol, market: u.market, name: u.name,
        action: i % 2 ? 'SELL' : 'BUY',
        strength: ['weak', 'moderate', 'strong', 'very_strong'][i % 4],
        confidence: 50 + (i % 50),
        entry_price: p, stop_loss: p * 0.99, take_profit: p * 1.02,
      });
    });
    measured.universeSize = set.length;

    let maxTitle = 0;
    let maxLine = 0;
    // วัดทุกชุดย่อยตั้งแต่ 1 ถึงทั้งจักรวาล เพื่อให้ครอบคลุมทั้งเคส "ตัวเดียว" และ "ล้นสุด"
    for (let n = 1; n <= set.length; n++) {
      const p = buildDigestPayload(set.slice(0, n), T0);
      maxTitle = Math.max(maxTitle, visibleLength(p.title));
      for (const line of p.body.split('\n')) maxLine = Math.max(maxLine, visibleLength(line));
    }
    measured.maxTitleChars = maxTitle;
    measured.maxBodyLineChars = maxLine;
    measured.titleBudget = CFG.TITLE_MAX_CHARS;
    measured.bodyLineBudget = CFG.BODY_LINE_MAX_CHARS;

    assert(maxTitle <= CFG.TITLE_MAX_CHARS, `หัวข้อยาวสุด ${maxTitle} เกินงบ ${CFG.TITLE_MAX_CHARS}`);
    assert(maxLine <= CFG.BODY_LINE_MAX_CHARS, `บรรทัดยาวสุด ${maxLine} เกินงบ ${CFG.BODY_LINE_MAX_CHARS}`);
  });

  check('ตัวเลขราคาต้องไม่ถูกตัดกลางตัวเด็ดขาด แม้ราคาหลักล้านและชื่อยาวผิดปกติ', () => {
    const set = Array.from({ length: 8 }, (_, i) =>
      makeSignal({
        symbol: `SYMBOL-ที่ยาวมากผิดปกติจาก-watchlist-${i}`,
        entry_price: 1234567.89, stop_loss: 1200000.55, take_profit: 1300000.25,
        confidence: 99, action: i % 2 ? 'SELL' : 'BUY',
      })
    );
    const body = buildDigestPayload(set, T0).body;
    // ตัวเลขที่ปรากฏต้องปรากฏแบบเต็ม — ห้ามมี … ติดกับตัวเลข (อ่านผิดแล้วตั้ง SL ผิด = เสียเงินจริง)
    assert(!/[\d,.]…/.test(body), `พบตัวเลขถูกตัดกลางตัว:\n${body}`);
    for (const line of body.split('\n')) {
      if (!line.startsWith('+')) {
        assert(line.includes('1,300,000.25') && line.includes('1,200,000.55'), `บรรทัดต้องมี TP/SL เต็ม — ได้ "${line}"`);
      }
    }
    measured.longSymbolLine = body.split('\n')[0];
  });

  check('ราคาต้องอ่านออกทั้ง XAUUSD (4 หลัก) และ EURUSD (ทศนิยม 5 ตำแหน่ง)', () => {
    assertEqual(fmtPrice(2650.25), '2,650.25', 'ทองคำ');
    assertEqual(fmtPrice(1.08452), '1.08452', 'EURUSD ต้องเก็บทศนิยมครบ 5 ตำแหน่ง');
    assertEqual(fmtPrice(1.0845), '1.0845', 'ศูนย์ท้ายต้องถูกตัด');
    assertEqual(fmtPrice(34.85), '34.85', 'USDTHB');
    assertEqual(fmtPrice(228.4), '228.4', 'หุ้นสหรัฐ');
    assertEqual(fmtPrice(95200), '95,200', 'BTC');
    assertEqual(fmtPrice(0.02871), '0.02871', 'เหรียญราคาต่ำ');
    assertEqual(fmtPrice(Number.NaN), '-', 'ค่าเพี้ยน');
    assertEqual(fmtPrice(0), '0', 'ศูนย์');
  });

  check('การตัดข้อความไม่ทำให้เกิดสระลอย และไม่ตัด emoji กลางตัว', () => {
    assertEqual(clip('สั้น', 10), 'สั้น', 'ไม่เกินงบต้องไม่แตะ');
    const cut = clip('🟢 ซื้อ XAUUSD', 5);
    assert(!/[ัิ-ฺ็-๎]…$/.test(cut), `เหลือสระลอยท้ายข้อความ: "${cut}"`);
    assert(visibleLength(cut) <= 5, `ตัดแล้วยังเกินงบ: "${cut}" ยาว ${visibleLength(cut)}`);
    assertEqual(visibleLength('🟢'), 1, 'emoji ต้องนับเป็น 1 ตัว');
    assertEqual('🟢'.length, 2, 'สมมติฐาน: emoji ยาว 2 หน่วยใน .length');
    const emojiCut = clip('🟢🔴⚪🟢🔴', 3);
    assert(!emojiCut.includes('�') && Array.from(emojiCut).every((c) => c.codePointAt(0) !== 0xd83d), `ตัด emoji กลางตัว: "${emojiCut}"`);
  });

  check('payload ที่ส่งจริงต้องเล็กพอสำหรับ Web Push (เพดานราว 4KB หลังเข้ารหัส)', () => {
    const huge = Array.from({ length: 200 }, (_, i) => makeSignal({ symbol: `SYMBOL${i}`, confidence: 50 + (i % 50) }));
    const out = buildPushPayloads(huge, T0);
    assertEqual(out.length, 1, '200 สัญญาณก็ต้องเหลือแจ้งเตือนเดียว');
    const bytes = Buffer.byteLength(JSON.stringify(out[0]), 'utf8');
    measured.maxPayloadBytes = bytes;
    assert(bytes < 3000, `payload ${bytes} ไบต์ ใหญ่เกินไป`);
  });

  console.log('\n═══ 6. tag และกติกา "ชั่วโมงละ 1 ครั้ง" ═══\n');

  check('ชุดในชั่วโมงเดียวกันใช้ tag เดียวกัน → กดสั่งรันเองซ้ำ ๆ ไม่ค้างเป็นตับ', () => {
    assertEqual(digestTag(T0), digestTag(T0 + 20 * MINUTE), 'ห่างกัน 20 นาทีในชั่วโมงเดียวกันต้อง tag เดียวกัน');
  });

  check('ชุดคนละชั่วโมงใช้คนละ tag → ไม่มีทางทับกันจนพลาดสัญญาณ', () => {
    const tags = new Set();
    for (let i = 0; i < 24; i++) tags.add(digestTag(T0 + i * HOUR));
    assertEqual(tags.size, 24, 'สแกน 24 รอบต้องได้ 24 tag ไม่ซ้ำกัน');
  });

  check('ชั่วโมงใหม่ → แจ้งได้ · ชั่วโมงเดิม → กันไว้ พร้อมบอกว่าสัญญาณไม่หาย', () => {
    const fresh = roundThrottleVerdict({ nowMs: T0, lastNotifiedAtMs: null, signalCount: 3 });
    assertEqual(fresh.send, true, fresh.reason);

    const nextHour = roundThrottleVerdict({ nowMs: T0 + HOUR, lastNotifiedAtMs: T0, signalCount: 3 });
    assertEqual(nextHour.send, true, 'ข้ามชั่วโมงต้องแจ้งได้');

    const same = roundThrottleVerdict({ nowMs: T0 + 20 * MINUTE, lastNotifiedAtMs: T0, signalCount: 3 });
    assertEqual(same.send, false, 'ชั่วโมงเดียวกันต้องถูกกัน');
    assert(same.reason.includes('ไม่หาย'), `เหตุผลต้องบอกว่าสัญญาณไม่หาย — ได้ "${same.reason}"`);
    measured.roundThrottleReason = same.reason;
  });

  check('รอบที่ช้าไป 20 นาที ต้องยังแจ้งได้ (ไม่โดนกฎ "ห่างกัน 60 นาที" เล่นงาน)', () => {
    // GitHub Actions ออกตัวช้าได้จริง: รอบ 10:25 ไปออกตอน 10:45 แล้วรอบ 11:25 ตรงเวลา
    // ระยะห่างเหลือ 40 นาที — ถ้าใช้เกณฑ์ "ห่าง >= 60 นาที" รอบ 11:25 จะถูกกันทิ้งทั้งที่คนละชั่วโมง
    const late = Date.UTC(2026, 7, 17, 10, 45, 0);
    const onTime = Date.UTC(2026, 7, 17, 11, 25, 0);
    const v = roundThrottleVerdict({ nowMs: onTime, lastNotifiedAtMs: late, signalCount: 2 });
    assertEqual(v.send, true, `ห่างกัน ${(onTime - late) / MINUTE} นาทีแต่คนละชั่วโมง ต้องแจ้งได้ — ${v.reason}`);
  });

  check('นาฬิกา DB เดินนำเครื่องที่รัน → ถือว่าเพิ่งแจ้ง ไม่ปล่อยให้ยิงรัว', () => {
    const v = roundThrottleVerdict({ nowMs: T0, lastNotifiedAtMs: T0 + 2 * HOUR, signalCount: 3 });
    assertEqual(v.send, false, 'เวลาติดลบต้องตีความปลอดภัยไว้ก่อน');
  });

  check('ไม่มีสัญญาณ → ไม่แจ้ง (ห้ามเด้งแจ้งเตือนว่างเปล่า)', () => {
    assertEqual(roundThrottleVerdict({ nowMs: T0, lastNotifiedAtMs: null, signalCount: 0 }).send, false, 'ต้องไม่ส่ง');
  });

  /**
   * ⚠ เทสต์ตัวนี้ "กลับข้าง" จากฉบับก่อนหน้าโดยตั้งใจ
   *
   * ฉบับก่อนยืนยันว่าโหมดถอยยังใช้กติกาเดิม (ห่าง 10 นาที + ประตูหนีให้ very_strong)
   * ซึ่งวัดจริงแล้วได้ 6 ครั้ง/55 นาที (เกินสเปก "ชั่วโมงละครั้ง" 6 เท่า)
   * และ very_strong เปิดประตูได้ทุกครั้ง = 6 ครั้ง/15 นาที
   * สเปกของเจ้าของไม่ได้ยกเว้นโหมดถอยไว้ กติกาจึงต้องเหมือนกันทั้งสองโหมด
   */
  check('โหมดถอยใช้กติกาเดียวกับเส้นทางปกติ: ชั่วโมงละครั้ง + ไม่มีประตูหนีให้ very_strong', () => {
    const moderateSet = [makeSignal({ strength: 'moderate' }), makeSignal({ symbol: 'EURUSD', strength: 'moderate' })];
    assertEqual(throttleVerdict({ nowMs: T0, lastPushAtMs: null, signals: moderateSet }).send, true, 'ไม่เคยส่ง → ส่งได้');
    assertEqual(throttleVerdict({ nowMs: T0 + HOUR, lastPushAtMs: T0, signals: moderateSet }).send, true, 'ข้ามชั่วโมง + ห่างพอ → ส่งได้');

    const blocked = throttleVerdict({ nowMs: T0 + 10 * MINUTE, lastPushAtMs: T0, signals: moderateSet });
    assertEqual(blocked.send, false, 'ชั่วโมงเดียวกันต้องถูกกัน (ของเดิมปล่อยผ่านเมื่อครบ 10 นาที)');
    assert(/รออีก \d+ นาที/.test(blocked.reason), `เหตุผลต้องบอกเวลาที่ต้องรอ — ได้ "${blocked.reason}"`);

    const strong = throttleVerdict({
      nowMs: T0 + 10 * MINUTE,
      lastPushAtMs: T0,
      signals: [...moderateSet, makeSignal({ symbol: 'BTC', strength: 'very_strong' })],
    });
    assertEqual(strong.send, false, 'very_strong ต้องไม่เปิดประตูหนีอีกต่อไป');
    measured.fallbackVeryStrongReason = strong.reason;
  });

  console.log('\n═══ 7. ต่อสายจริงกับ push-server (Supabase ปลอมที่มีสถานะจริง) ═══\n');

  await checkAsync('15 สัญญาณ → เรียกตัวส่งครั้งเดียว และปั๊มว่าแจ้งแล้วครบทุกแถว', async () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => makeSignal({ symbol: `S${i}`, confidence: 90 - i, created_at: iso(T0 - MINUTE) }));
    const db = makeFakeDb({ signals: fifteen });
    const rec = makeRecorder();
    const res = await sendPendingSignalsToUser(db, 'user-1', fifteen, { now: T0, sender: rec.sender });

    assertEqual(rec.calls.length, 1, 'ต้องยิงแจ้งเตือนครั้งเดียว');
    assertEqual(res.notifications, 1, 'notifications ต้องเป็น 1');
    assertEqual(res.pushStateReady, true, 'คอลัมน์พร้อมต้องรายงานว่าพร้อม');
    assertEqual(res.marked, 15, 'ต้องปั๊มครบทุกแถว รวมตัวที่แสดงไม่หมด');
    assertEqual(db.tables.signals.filter((s) => s.push_sent === false).length, 0, 'ต้องไม่เหลือของค้างเลย');
    assert(rec.calls[0].tag.startsWith('signal-digest-'), 'ต้องใช้ tag ของชุด');
  });

  await checkAsync('ไม่มีสัญญาณเลย → ไม่ยิงอะไร และไม่ปั๊มอะไร', async () => {
    const db = makeFakeDb({ signals: [] });
    const rec = makeRecorder();
    const res = await sendPendingSignalsToUser(db, 'user-1', [], { now: T0, sender: rec.sender });
    assertEqual(rec.calls.length, 0, 'ต้องไม่ยิง');
    assertEqual(res.reason, 'ไม่มีสัญญาณให้แจ้ง', 'เหตุผลไม่ตรง');
    assertEqual(res.marked, 0, 'ต้องไม่ปั๊มอะไร');
  });

  await checkAsync('ปุ่มทดสอบ (sendPushToUser ตรง ๆ) ต้องไม่ถูกจำกัดความถี่ และไม่ถูกรวมชุด', async () => {
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;

    // มีการแจ้งเตือนสัญญาณไปแล้วเมื่อ 1 วินาทีก่อน — ถ้ามีการจำกัดความถี่แอบอยู่ใน
    // sendPushToUser ปุ่มทดสอบจะโดนกันตรงนี้
    const db = makeFakeDb({ signals: [makeSignal({ push_sent: true, push_sent_at: iso(T0 - 1000) })], subs: [] });
    const res = await sendPushToUser(db, 'user-1', { title: 'ทดสอบ', body: 'x', tag: 'test', url: '/signals' });
    assertEqual(res.noSubscriptions, true, 'ต้องเดินไปถึงขั้นอ่าน subscription ได้ (ไม่ถูกกันกลางทาง)');
    assertEqual(res.errors.length, 0, `ต้องไม่มี error — ได้ ${JSON.stringify(res.errors)}`);
  });

  await checkAsync('sendPushToUser: ไม่มีกุญแจ VAPID → คืน error เหมือนเดิม (พฤติกรรมเดิมไม่เปลี่ยน)', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const res = await sendPushToUser(makeFakeDb(), 'user-1', { title: 'x', body: 'y' });
    assertEqual(res.sent, 0, 'ต้องไม่ส่ง');
    assert(res.errors[0]?.includes('VAPID'), `ต้องบอกว่ายังไม่ได้ตั้งกุญแจ VAPID — ได้ ${JSON.stringify(res.errors)}`);
  });

  await checkAsync('เส้นทางเดิม sendSignalsToUser ยังทำงานได้ (ผู้เรียกเก่าไม่พัง)', async () => {
    const db = makeFakeDb({ subs: [{ user_id: 'user-1', endpoint: 'e1', p256dh: 'p', auth: 'a', last_used_at: null }] });
    const rec = makeRecorder();
    const res = await sendSignalsToUser(db, 'user-1', many, { now: T0, sender: rec.sender });
    assertEqual(rec.calls.length, 1, 'ต้องยิงครั้งเดียว');
    assertEqual(res.digested, true, 'ต้องรายงานว่ารวมเป็นชุด');
  });

  console.log('\n═══ 8. บั๊ก "สัญญาณหายถาวร" ต้องหายไปจริง ═══\n');

  await checkAsync('ถูกกันเพราะชั่วโมงนี้แจ้งไปแล้ว → ไม่ปั๊ม → ชั่วโมงหน้าได้ทั้งของเก่าและของใหม่ในใบเดียว', async () => {
    const old1 = makeSignal({ symbol: 'XAUUSD', created_at: iso(T0 - 5 * MINUTE) });
    const db = makeFakeDb({ signals: [old1] });

    // รอบที่ 1 (10:05) — แจ้งสำเร็จ
    const rec1 = makeRecorder();
    await sendPendingSignalsToUser(db, 'user-1', [old1], { now: T0, sender: rec1.sender });
    assertEqual(rec1.calls.length, 1, 'รอบแรกต้องแจ้ง');

    // รอบที่ 2 (10:35 — ชั่วโมงเดียวกัน กดสั่งรันเอง) เจอสัญญาณใหม่ 1 ตัว
    const mid = makeSignal({ symbol: 'BTC', created_at: iso(T0 + 30 * MINUTE) });
    db.tables.signals.push({ ...mid, push_sent: false, push_sent_at: null });
    const rec2 = makeRecorder();
    const res2 = await sendPendingSignalsToUser(db, 'user-1', [mid], { now: T0 + 30 * MINUTE, sender: rec2.sender });
    assertEqual(rec2.calls.length, 0, 'รอบที่สองในชั่วโมงเดียวกันต้องไม่เด้ง');
    assertEqual(res2.throttled, true, 'ต้องรายงานว่าถูกกัน');
    assertEqual(res2.marked, 0, '⛔ ห้ามปั๊มว่าแจ้งแล้ว ไม่งั้นสัญญาณหายถาวร (นี่คือบั๊กเดิม)');

    // รอบที่ 3 (11:05 — ชั่วโมงถัดไป) ไม่มีสัญญาณใหม่เลย แต่ของค้างต้องถูกกวาดมาแจ้ง
    const rec3 = makeRecorder();
    const res3 = await sendPendingSignalsToUser(db, 'user-1', [], { now: T0 + HOUR, sender: rec3.sender });
    assertEqual(rec3.calls.length, 1, 'ชั่วโมงถัดไปต้องเด้ง');
    assertEqual(res3.pendingPicked, 1, 'ต้องรายงานว่าเก็บตกของค้างมา 1 ตัว');
    assert(rec3.calls[0].body.includes('BTC') || rec3.calls[0].title.includes('BTC'), `ใบนี้ต้องมี BTC ที่ค้างจากรอบก่อน — ได้ "${rec3.calls[0].title}\n${rec3.calls[0].body}"`);
    assertEqual(db.tables.signals.filter((s) => s.push_sent === false).length, 0, 'ปั๊มครบแล้วต้องไม่เหลือค้าง');
  });

  await checkAsync('ส่งไม่ถึงเครื่องเลย (ยังไม่ได้เปิดแจ้งเตือน) → ไม่ปั๊ม → รอบหน้าลองใหม่ได้', async () => {
    const s = makeSignal({ created_at: iso(T0 - MINUTE) });
    const db = makeFakeDb({ signals: [s] });
    const dead = makeRecorder({ sent: 0, noSubscriptions: true });
    const res = await sendPendingSignalsToUser(db, 'user-1', [s], { now: T0, sender: dead.sender });

    assertEqual(res.noSubscriptions, true, 'ต้องรายงานว่าไม่มีเครื่องสมัครไว้');
    assertEqual(res.marked, 0, 'ส่งไม่ถึงต้องไม่ปั๊ม');
    assertEqual(db.tables.signals[0].push_sent, false, 'แถวต้องยังค้างอยู่');

    // ชั่วโมงถัดไป ผู้ใช้เปิดแจ้งเตือนแล้ว → ต้องได้สัญญาณเดิมที่เคยส่งไม่ออก
    const ok = makeRecorder();
    const res2 = await sendPendingSignalsToUser(db, 'user-1', [], { now: T0 + HOUR, sender: ok.sender });
    assertEqual(ok.calls.length, 1, 'รอบหน้าต้องลองส่งใหม่');
    assertEqual(res2.marked, 1, 'คราวนี้ต้องปั๊ม');
  });

  await checkAsync('ของค้างที่เก่าเกินงบ / หมดอายุ / ไม่ active ต้องไม่ถูกกวาดมาแจ้ง', async () => {
    const tooOld = makeSignal({ symbol: 'OLD', created_at: iso(T0 - PUSH_STATE_CONFIG.PENDING_MAX_AGE_MS - MINUTE) });
    const expired = makeSignal({ symbol: 'EXP', created_at: iso(T0 - MINUTE), expires_at: iso(T0 - 1) });
    const closed = makeSignal({ symbol: 'CLS', created_at: iso(T0 - MINUTE), status: 'triggered' });
    const good = makeSignal({ symbol: 'GOOD', created_at: iso(T0 - MINUTE), expires_at: iso(T0 + HOUR) });
    const db = makeFakeDb({ signals: [tooOld, expired, closed, good] });

    const rec = makeRecorder();
    const res = await sendPendingSignalsToUser(db, 'user-1', [], { now: T0, sender: rec.sender });
    assertEqual(res.signalCount, 1, 'ต้องเหลือแค่ตัวที่ยังใช้ได้');
    const text = `${rec.calls[0].title}\n${rec.calls[0].body}`;
    assert(text.includes('GOOD'), 'ต้องมีตัวที่ยังใช้ได้');
    for (const bad of ['OLD', 'EXP', 'CLS']) assert(!text.includes(bad), `ต้องไม่มี ${bad} ในใบแจ้งเตือน`);
  });

  await checkAsync('ตัวที่ถูกกรองตามความชอบผู้ใช้ ต้องไม่อยู่ในใบ และต้องไม่ถูกปั๊ม', async () => {
    const buy = makeSignal({ symbol: 'AAA', action: 'BUY', created_at: iso(T0 - MINUTE) });
    const sell = makeSignal({ symbol: 'BBB', action: 'SELL', created_at: iso(T0 - MINUTE) });
    const db = makeFakeDb({ signals: [buy, sell] });
    const rec = makeRecorder();

    const res = await sendPendingSignalsToUser(db, 'user-1', [buy, sell], {
      now: T0,
      sender: rec.sender,
      filter: (s) => s.action !== 'BUY', // ผู้ใช้ปิดสัญญาณฝั่งซื้อ
    });
    const text = `${rec.calls[0].title}\n${rec.calls[0].body}`;
    assert(text.includes('BBB') && !text.includes('AAA'), `ต้องมีแต่ฝั่งขาย — ได้ "${text}"`);
    assertEqual(res.marked, 1, 'ปั๊มเฉพาะตัวที่แจ้งจริง');
    assertEqual(db.tables.signals.find((s) => s.symbol === 'AAA').push_sent, false, 'ตัวที่ถูกกรองต้องไม่ถูกปั๊ม (เผื่อผู้ใช้เปลี่ยนใจ)');
  });

  await checkAsync('ปั๊มไม่สำเร็จ → รายงานเป็น error ไม่ล้มทั้งรอบ (ยอมเด้งซ้ำ ดีกว่ายอมหาย)', async () => {
    const s = makeSignal({ created_at: iso(T0 - MINUTE) });
    const db = makeFakeDb({ signals: [s], failUpdate: true });
    const rec = makeRecorder();
    const res = await sendPendingSignalsToUser(db, 'user-1', [s], { now: T0, sender: rec.sender });
    assertEqual(rec.calls.length, 1, 'ต้องยังแจ้งเตือนออกไป');
    assertEqual(res.marked, 0, 'ปั๊มไม่ลงต้องไม่รายงานว่าปั๊มแล้ว');
    assert(res.errors.some((e) => e.includes('แจ้งแล้ว')), `ต้องมี error บอกว่าปั๊มไม่ลง — ได้ ${JSON.stringify(res.errors)}`);
  });

  await checkAsync('เดิน 24 ชั่วโมงต่อเนื่อง: เด้งชั่วโมงละครั้งพอดี และไม่มีสัญญาณไหนหาย', async () => {
    const db = makeFakeDb({ signals: [] });
    const rec = makeRecorder();
    let created = 0;

    for (let h = 0; h < 24; h++) {
      // จำลองตัวสแกน: บางชั่วโมงเจอ 0 ตัว บางชั่วโมงเจอหลายตัว (ตามที่วัดได้จริง p50=1 max=7)
      const n = [0, 1, 2, 0, 7, 1, 3, 0][h % 8];
      const now = T0 + h * HOUR;
      const fresh = Array.from({ length: n }, (_, i) => makeSignal({ symbol: `H${h}_${i}`, created_at: iso(now) }));
      for (const s of fresh) db.tables.signals.push({ ...s, push_sent: false, push_sent_at: null });
      created += n;
      await sendPendingSignalsToUser(db, 'user-1', fresh, { now, sender: rec.sender });

      // กดสั่งรันเองซ้ำอีก 2 ครั้งในชั่วโมงเดียวกัน — ต้องไม่เพิ่มการเด้ง
      await sendPendingSignalsToUser(db, 'user-1', [], { now: now + 10 * MINUTE, sender: rec.sender });
      await sendPendingSignalsToUser(db, 'user-1', [], { now: now + 40 * MINUTE, sender: rec.sender });
    }

    const hoursWithSignals = [0, 1, 2, 0, 7, 1, 3, 0].filter((n) => n > 0).length * 3; // 8 ชม./รอบ × 3 รอบ
    measured.buzzes24h = rec.calls.length;
    measured.created24h = created;
    assertEqual(rec.calls.length, hoursWithSignals, `ต้องเด้งเท่าจำนวนชั่วโมงที่มีสัญญาณ (${hoursWithSignals}) เท่านั้น`);
    assert(rec.calls.length <= 24, 'ห้ามเกิน 24 ครั้งใน 24 ชั่วโมง');

    // ทุกแถวที่ยังไม่หมดอายุต้องถูกแจ้งไปแล้ว — ไม่มีตัวไหนหายเงียบ
    const stillPending = db.tables.signals.filter((s) => s.push_sent === false);
    measured.lost24h = stillPending.length;
    assertEqual(stillPending.length, 0, `มีสัญญาณค้างไม่ได้แจ้ง ${stillPending.length} ตัว: ${stillPending.map((s) => s.symbol).join(', ')}`);
  });

  console.log('\n═══ 9. ยังไม่ได้รัน migration 006 (คอลัมน์ push_sent ยังไม่มี) ═══\n');

  await checkAsync('pushStateColumnAvailable ตอบตรงตามความจริงทั้งสองแบบ', async () => {
    assertEqual(await pushStateColumnAvailable(makeFakeDb({ pushColumn: true })), true, 'มีคอลัมน์ต้องตอบ true');
    assertEqual(await pushStateColumnAvailable(makeFakeDb({ pushColumn: false })), false, 'ไม่มีคอลัมน์ต้องตอบ false');
  });

  await checkAsync('ไม่มีคอลัมน์ → ยังแจ้งเตือนได้ตามปกติ + บอกใน log ว่าต้องรัน SQL อะไร', async () => {
    const db = makeFakeDb({ pushColumn: false, subs: [{ user_id: 'user-1', endpoint: 'e1', p256dh: 'p', auth: 'a', last_used_at: null }] });
    const rec = makeRecorder();
    const res = await sendPendingSignalsToUser(db, 'user-1', many, { now: T0, sender: rec.sender });

    assertEqual(rec.calls.length, 1, 'ต้องยังแจ้งเตือนออกไปได้');
    assertEqual(res.pushStateReady, false, 'ต้องรายงานว่ายังไม่พร้อม');
    assert(res.reason.includes('006'), `เหตุผลต้องบอกชื่อ migration ที่ต้องรัน — ได้ "${res.reason}"`);
    assertEqual(res.errors.length, 0, `โหมดถอยต้องไม่ถือว่าเป็น error — ได้ ${JSON.stringify(res.errors)}`);
    measured.fallbackReason = res.reason;
  });

  await checkAsync('ไม่มีคอลัมน์ → ยังกรองตามความชอบผู้ใช้ และยังใช้รูปแบบข้อความใหม่', async () => {
    const db = makeFakeDb({ pushColumn: false });
    const rec = makeRecorder();
    await sendPendingSignalsToUser(db, 'user-1', many, {
      now: T0,
      sender: rec.sender,
      filter: (s) => s.action !== 'SELL',
    });
    const text = `${rec.calls[0].title}\n${rec.calls[0].body}`;
    assert(!text.includes('EURUSD'), `ฝั่งขายต้องถูกกรองออก — ได้ "${text}"`);
    assert(rec.calls[0].body.split('\n')[0].includes('TP '), 'ต้องใช้รูปแบบใหม่ที่มี TP/SL ทุกบรรทัด');
  });

  await checkAsync('ไม่มีคอลัมน์ + ไม่มีสัญญาณ → ไม่ยิงอะไร (ไม่ใช่ error)', async () => {
    const db = makeFakeDb({ pushColumn: false });
    const rec = makeRecorder();
    const res = await sendPendingSignalsToUser(db, 'user-1', [], { now: T0, sender: rec.sender });
    assertEqual(rec.calls.length, 0, 'ต้องไม่ยิง');
    assert(res.reason.includes('ไม่มีสัญญาณ'), `ได้ "${res.reason}"`);
  });

  console.log('\n═══ 10. โหมดถอยต้องเคารพ "ชั่วโมงละ 1 ครั้ง" ด้วย (นี่คือสถานะจริงตอนนี้) ═══\n');

  /**
   * ทำไมหัวข้อนี้สำคัญกว่าที่เห็น: วัดกับฐานข้อมูลจริงเมื่อ 2026-08-17 แล้วพบว่า
   * `select id, push_sent from signals` ตอบ 42703 (column signals.push_sent does not exist)
   * = ยังไม่ได้รัน migration 006 → เส้นทางที่ทำงานอยู่ "ตอนนี้" คือโหมดถอย ไม่ใช่เส้นทางปกติ
   * กติกาชั่วโมงละครั้งจึงต้องบังคับใช้ที่นี่ก่อนที่อื่น
   */
  function fallbackFixture() {
    const db = makeFakeDb({
      pushColumn: false,
      subs: [{ user_id: 'user-1', endpoint: 'e1', p256dh: 'p', auth: 'a', last_used_at: null }],
    });
    return { db, rec: makeStampingRecorder(db) };
  }

  await checkAsync('โหมดถอย: ยิงซ้ำทุก 10 นาที ตลอด 55 นาที → ต้องเด้งครั้งเดียว', async () => {
    const { db, rec } = fallbackFixture();
    for (let m = 0; m <= 50; m += 10) {
      const now = T0 + m * MINUTE;
      rec.now = now;
      const fresh = [makeSignal({ symbol: `M${m}`, strength: 'moderate', created_at: iso(now) })];
      await sendPendingSignalsToUser(db, 'user-1', fresh, { now, sender: rec.sender });
    }
    measured.fallbackBuzzes55m = rec.calls.length;
    assertEqual(rec.calls.length, 1, `55 นาทีต้องเด้งครั้งเดียว — เด้งจริง ${rec.calls.length} ครั้ง`);
  });

  await checkAsync('โหมดถอย: very_strong ยิงซ้ำทุก 3 นาที ตลอด 15 นาที → ต้องเด้งครั้งเดียว', async () => {
    const { db, rec } = fallbackFixture();
    for (let m = 0; m <= 15; m += 3) {
      const now = T0 + m * MINUTE;
      rec.now = now;
      const fresh = [makeSignal({ symbol: `V${m}`, strength: 'very_strong', confidence: 95, created_at: iso(now) })];
      await sendPendingSignalsToUser(db, 'user-1', fresh, { now, sender: rec.sender });
    }
    measured.fallbackBuzzesVeryStrong15m = rec.calls.length;
    assertEqual(rec.calls.length, 1, `very_strong ก็ต้องเด้งครั้งเดียว — เด้งจริง ${rec.calls.length} ครั้ง`);
  });

  await checkAsync('โหมดถอย: ชั่วโมงถัดไปต้องแจ้งได้ตามปกติ (ไม่ใช่เงียบไปเลย)', async () => {
    const { db, rec } = fallbackFixture();
    rec.now = T0;
    await sendPendingSignalsToUser(db, 'user-1', [makeSignal({ created_at: iso(T0) })], { now: T0, sender: rec.sender });

    // รอบถัดไปช้าไป 20 นาที (ห่างกัน 80 นาที) — ต้องแจ้งได้
    const next = T0 + HOUR + 20 * MINUTE;
    rec.now = next;
    await sendPendingSignalsToUser(db, 'user-1', [makeSignal({ symbol: 'BTC', created_at: iso(next) })], { now: next, sender: rec.sender });
    assertEqual(rec.calls.length, 2, 'ชั่วโมงใหม่ต้องเด้งได้');
  });

  await checkAsync('โหมดถอย: เดิน 24 ชั่วโมง (สแกน 72 รอบ) → ห้ามเกิน 24 ครั้ง', async () => {
    const { db, rec } = fallbackFixture();
    for (let h = 0; h < 24; h++) {
      const n = [0, 1, 2, 0, 7, 1, 3, 0][h % 8];
      const now = T0 + h * HOUR;
      const fresh = Array.from({ length: n }, (_, i) => makeSignal({ symbol: `F${h}_${i}`, created_at: iso(now) }));
      for (const at of [now, now + 10 * MINUTE, now + 40 * MINUTE]) {
        rec.now = at;
        await sendPendingSignalsToUser(db, 'user-1', at === now ? fresh : [], { now: at, sender: rec.sender });
      }
    }
    measured.fallbackBuzzes24h = rec.calls.length;
    const hoursWithSignals = 24 - [0, 1, 2, 0, 7, 1, 3, 0].filter((n) => n === 0).length * 3;
    assert(rec.calls.length <= 24, `ห้ามเกิน 24 ครั้งใน 24 ชั่วโมง — ได้ ${rec.calls.length}`);
    assertEqual(rec.calls.length, hoursWithSignals, `ต้องเด้งเท่าจำนวนชั่วโมงที่มีสัญญาณ (${hoursWithSignals})`);
  });

  await checkAsync('โหมดถอย: ตอนถูกกัน ต้องบอกให้ชัดว่าสัญญาณรอบนั้น "ไม่ได้เก็บตก"', async () => {
    const { db, rec } = fallbackFixture();
    rec.now = T0;
    await sendPendingSignalsToUser(db, 'user-1', [makeSignal({ created_at: iso(T0) })], { now: T0, sender: rec.sender });

    const later = T0 + 20 * MINUTE;
    rec.now = later;
    const res = await sendPendingSignalsToUser(db, 'user-1', [makeSignal({ symbol: 'BTC', created_at: iso(later) })], {
      now: later,
      sender: rec.sender,
    });
    assertEqual(res.throttled, true, 'ต้องรายงานว่าถูกกัน');
    assert(res.reason.includes('006'), `ต้องบอกว่าให้รัน migration 006 — ได้ "${res.reason}"`);
    assert(
      res.reason.includes('ไม่ได้เก็บตก') || res.reason.includes('ไม่ได้แจ้ง'),
      `ต้องบอกตรง ๆ ว่ารอบนี้ไม่ได้เก็บตก — ได้ "${res.reason}"`,
    );
    measured.fallbackThrottleReason = res.reason;
  });

  console.log('\n═══ 11. ช่องโหว่ขอบชั่วโมง (ช่อง UTC ตายตัวไม่บังคับระยะห่าง) ═══\n');

  const EDGE_BEFORE = Date.UTC(2026, 7, 17, 13, 59, 59);
  const EDGE_AFTER = Date.UTC(2026, 7, 17, 14, 0, 1);

  check('13:59:59Z แจ้งไปแล้ว → 14:00:01Z (ห่าง 2 วินาที) ต้องไม่ส่ง', () => {
    const v = roundThrottleVerdict({ nowMs: EDGE_AFTER, lastNotifiedAtMs: EDGE_BEFORE, signalCount: 3 });
    measured.edgeVerdictReason = v.reason;
    assertEqual(v.send, false, `ห่างกัน ${(EDGE_AFTER - EDGE_BEFORE) / 1000} วินาที แต่คนละช่อง UTC — ต้องถูกกัน`);
    assert(v.waitMs > 0, 'ต้องบอกด้วยว่าต้องรออีกเท่าไร');
  });

  check('tag ของสองใบนี้คนละค่า → ถ้าปล่อยให้ส่ง ใบสองใบจะค้างบนจอล็อกพร้อมกัน', () => {
    // เทสต์ตัวนี้ยืนยัน "สาเหตุ" ไม่ใช่ "ทางแก้": tag ผูกกับช่องชั่วโมงเพื่อไม่ให้ใบของ
    // ชั่วโมงก่อนถูกทับหายทั้งที่ยังไม่ได้อ่าน — มันจึงช่วยเรื่องขอบชั่วโมงไม่ได้เลย
    // สิ่งที่กันได้จริงคือระยะห่างขั้นต่ำใน roundThrottleVerdict เท่านั้น
    assert(digestTag(EDGE_BEFORE) !== digestTag(EDGE_AFTER), 'สองใบนี้ต้องคนละ tag (นี่คือเหตุผลที่ต้องมีระยะห่างขั้นต่ำ)');
  });

  check('รอบที่ช้าจนห่างกัน 45 นาทีข้ามชั่วโมง ต้องยังส่งได้ (ระยะห่างขั้นต่ำต้องไม่ฆ่ารอบปกติ)', () => {
    // กรณีเลวร้ายที่สุดของคาบรายชั่วโมง: รอบก่อนช้าไป 15 นาที รอบนี้ตรงเวลา
    const lateRound = Date.UTC(2026, 7, 17, 10, 40, 0);
    const onTime = Date.UTC(2026, 7, 17, 11, 25, 0);
    const v = roundThrottleVerdict({ nowMs: onTime, lastNotifiedAtMs: lateRound, signalCount: 2 });
    assertEqual(v.send, true, `ห่างกัน ${(onTime - lateRound) / MINUTE} นาที ต้องส่งได้ — ${v.reason}`);
  });

  await checkAsync('ต่อสายจริง: แจ้ง 13:59:59 แล้วสแกนอีกรอบ 14:00:01 → ได้ใบเดียว ไม่ใช่สองใบ', async () => {
    const first = makeSignal({ symbol: 'XAUUSD', created_at: iso(EDGE_BEFORE - MINUTE) });
    const db = makeFakeDb({ signals: [first] });
    const rec = makeRecorder();

    await sendPendingSignalsToUser(db, 'user-1', [first], { now: EDGE_BEFORE, sender: rec.sender });
    const second = makeSignal({ symbol: 'BTC', created_at: iso(EDGE_AFTER) });
    db.tables.signals.push({ ...second, push_sent: false, push_sent_at: null });
    await sendPendingSignalsToUser(db, 'user-1', [second], { now: EDGE_AFTER, sender: rec.sender });

    measured.edgeBuzzes = rec.calls.length;
    assertEqual(rec.calls.length, 1, `ต้องเด้งใบเดียว — เด้งจริง ${rec.calls.length} ใบ`);
    // ของที่ถูกกันต้องไม่หาย — รอบถัดไปที่ห่างพอต้องได้ทั้งสองตัวในใบเดียว
    const later = EDGE_AFTER + HOUR;
    await sendPendingSignalsToUser(db, 'user-1', [], { now: later, sender: rec.sender });
    assertEqual(rec.calls.length, 2, 'รอบถัดไปต้องเก็บตกให้');
    const text = `${rec.calls[1].title}\n${rec.calls[1].body}`;
    assert(text.includes('BTC'), `ใบที่สองต้องมีตัวที่ถูกกันไว้ — ได้ "${text}"`);
  });

  console.log('\n═══ 12. ตัวส่งที่ยิงทีละสัญญาณต้องถูกปิดจริง (ตรวจจากไฟล์ในโปรเจกต์) ═══\n');

  check('vercel.json ไม่มีตัวจับเวลายิง /api/cron/scan-markets แล้ว', () => {
    const cfg = JSON.parse(readProjectFile('vercel.json'));
    const crons = cfg.crons ?? [];
    assertEqual(
      crons.filter((c) => String(c.path ?? '').includes('scan-markets')).length,
      0,
      `ยังมี cron ยิง scan-markets อยู่: ${JSON.stringify(crons)}`,
    );
    measured.vercelCrons = crons.length;
  });

  check('route /api/cron/scan-markets: ไม่มีลูปยิง push ทีละสัญญาณ และยังกดเรียกเองได้', () => {
    const src = stripComments(readProjectFile('src/app/api/cron/scan-markets/route.ts'));
    assert(!/sendPushToUser\s*\(/.test(src), 'route ต้องไม่เรียก sendPushToUser เอง (ต้องผ่านตัวรวมชุด)');
    assert(!/signalToPush\s*\(/.test(src), 'route ต้องไม่ประกอบแจ้งเตือนรายสัญญาณเอง');
    assert(/sendPendingSignalsToUser\s*\(/.test(src), 'route ต้องส่งผ่าน sendPendingSignalsToUser');
    assert(/export\s+async\s+function\s+GET/.test(src), 'ต้องยังเรียกเองได้ด้วยมือ (ใช้ไล่ปัญหา)');
  });

  check('route: เส้นทางที่ใช้หาไฟล์คะแนนความเร็วชี้ไปที่โฟลเดอร์จริง', () => {
    // require.context ที่ชี้ผิดโฟลเดอร์จะ "เงียบ" (ได้ชุดว่าง = ถอยไปเรียงแบบเดิม)
    // ไม่มีอะไรฟ้องเลยจนกว่าจะสังเกตว่าลำดับในแจ้งเตือนไม่ตรงกับบนเว็บ — จึงต้องมีตัวจับตรงนี้
    const src = readProjectFile('src/app/api/cron/scan-markets/route.ts');
    const m = src.match(/require\.context\(\s*'([^']+)'/);
    assert(m, 'ไม่พบ require.context ใน route (ถ้าตั้งใจถอดออก ให้ลบเทสต์ตัวนี้พร้อมกัน)');
    const dir = path.resolve(ROOT, 'src/app/api/cron/scan-markets', m[1]);
    assert(existsSync(dir), `โฟลเดอร์ที่อ้างถึงไม่มีอยู่จริง: ${dir}`);
    assert(
      existsSync(path.join(dir, 'push-digest.ts')),
      `โฟลเดอร์ ${dir} ไม่ใช่ src/lib (ไม่พบ push-digest.ts ข้าง ๆ)`,
    );
  });

  check('Edge Function scan-signals: ไม่มีตัวส่ง push อยู่ในไฟล์แล้ว', () => {
    const src = stripComments(readProjectFile('supabase/functions/scan-signals/index.ts'));
    assert(!/pushWithDeadline\s*\(/.test(src), 'ต้องไม่เหลือตัวยิง push รายสัญญาณ');
    assert(!/pushTextMessage\s*\(/.test(src), 'ต้องไม่เรียก pushTextMessage');
    assert(!/from\s+['"]https:\/\/esm\.sh\/@negrel\/webpush/.test(src), 'ต้องไม่ import ไลบรารี web-push แล้ว');
  });

  check('ปุ่มทดสอบแจ้งเตือนต้องยังยิงตรง ไม่ผ่านตัวจำกัดความถี่', () => {
    const src = stripComments(readProjectFile('src/app/api/push/test/route.ts'));
    assert(/sendPushToUser\s*\(/.test(src), 'ปุ่มทดสอบต้องเรียก sendPushToUser ตรง ๆ (เด้งทันที)');
    assert(!/sendPendingSignalsToUser|sendSignalsToUser/.test(src), 'ปุ่มทดสอบต้องไม่ไปเข้าคิวรวมชุด');
  });

  // ─────────────────────────────────── สรุปผล ───────────────────────────────────

  console.log('\n═══ ตัวเลขที่วัดได้จากการรันนี้ ═══\n');
  console.log(`  เทียบข้อความสัญญาณเดี่ยวกับฉบับก่อนแก้        ${measured.parityCases} เคส ตรงกันทั้งหมด`);
  console.log(`  สับลำดับอินพุตแล้วผลคงเดิม                    ${measured.shuffleRuns} ครั้ง`);
  console.log(`  ลำดับที่ได้                                  ${measured.rankOrder}`);
  console.log(`  วัดความยาวด้วยสัญลักษณ์จริง                   ${measured.universeSize} ตัว จาก SYMBOL_UNIVERSE`);
  console.log(`  หัวข้อยาวสุดที่วัดได้                          ${measured.maxTitleChars} ตัวอักษร (งบ ${measured.titleBudget})`);
  console.log(`  บรรทัดเนื้อความยาวสุด                         ${measured.maxBodyLineChars} ตัวอักษร (งบ ${measured.bodyLineBudget})`);
  console.log(`  payload ใหญ่สุด (200 สัญญาณ)                  ${measured.maxPayloadBytes} ไบต์`);
  if (measured.realSpeed1H) {
    console.log(`  คะแนนความเร็วจริง BTC/1H                     ${measured.realSpeed1H} → ใช้เรียงด้วยค่า ${measured.realSpeedValue1H}`);
    console.log(`  คะแนนความเร็วจริง BTC/1D                     ${measured.realSpeed1D} → ใช้เรียงด้วยค่า ${measured.realSpeedValue1D}`);
  }
  console.log(`  เดิน 24 ชม. (สแกน 72 รอบ)                    สร้าง ${measured.created24h} สัญญาณ · เด้ง ${measured.buzzes24h} ครั้ง · หาย ${measured.lost24h} ตัว`);
  console.log(`  โหมดถอย: ยิงทุก 10 นาที ตลอด 55 นาที          เด้ง ${measured.fallbackBuzzes55m} ครั้ง`);
  console.log(`  โหมดถอย: very_strong ทุก 3 นาที ตลอด 15 นาที  เด้ง ${measured.fallbackBuzzesVeryStrong15m} ครั้ง`);
  console.log(`  โหมดถอย: เดิน 24 ชม. (สแกน 72 รอบ)           เด้ง ${measured.fallbackBuzzes24h} ครั้ง`);
  console.log(`  ขอบชั่วโมง 13:59:59Z → 14:00:01Z             เด้ง ${measured.edgeBuzzes} ใบ`);
  console.log(`  จำนวน cron ที่เหลือใน vercel.json             ${measured.vercelCrons} รายการ`);
  console.log('\n  ตัวอย่างใบแจ้งเตือนจริง (7 สัญญาณ):');
  console.log(`    หัวข้อ : ${measured.digestTitle}`);
  for (const line of measured.digestBody.split('\n')) console.log(`    เนื้อ  : ${line}`);
  console.log('\n  ตัวอย่างใบแจ้งเตือนจริง (สัญญาณเดียว):');
  console.log(`    หัวข้อ : ${measured.singleTitle}`);
  for (const line of measured.singleBody.split('\n')) console.log(`    เนื้อ  : ${line}`);
  console.log(`\n  บรรทัดกรณีสุดโต่ง (ชื่อยาว + ราคาหลักล้าน): ${measured.longSymbolLine}`);
  console.log(`  ข้อความตอนถูกกันเพราะชั่วโมงนี้แจ้งไปแล้ว: ${measured.roundThrottleReason}`);

  console.log(`\n═══ ผลรวม: ผ่าน ${passed} · ล้ม ${failures.length} ═══\n`);
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f.name}: ${f.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
