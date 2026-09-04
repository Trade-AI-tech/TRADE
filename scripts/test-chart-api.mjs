#!/usr/bin/env node
/**
 * test-chart-api.mjs — เทสต์เลนกราฟทอง (npm run test:chart)
 *
 * วิธีรัน
 *   node scripts/test-chart-api.mjs
 *
 * ไม่ต้องใช้เน็ต ไม่ต้องมี DB ไม่ต้องมี dev server — เทสต์นี้เรียก `GET` ของ
 * src/app/api/chart/route.ts **ตัวจริง** โดยสวม fetch ปลอมที่ตอบเหมือน Yahoo
 * และสวม stub ให้ src/lib/supabase-server.ts ตัวเดียว (ตัวจริงดึง next/headers
 * ซึ่งอยู่นอก request context ไม่ได้) ที่เหลือคือโค้ดตัวเดียวกับที่รันจริงทั้งหมด:
 * fetchChart · splitClosedBars · sanitizeCandles · ตารางกรอบเวลา · ตัวจัดหมุด
 *
 * ทำไมต้องเทสต์เลนนี้
 *   หน้ากราฟคือที่ที่ "ผิดแล้วมองไม่เห็น" ที่สุดในระบบ — แท่งสดที่หลุดไปปนกับแท่งปิด
 *   หมุดที่เกาะผิดแท่ง หรือสัญญาณที่ ledger ปิดไปแล้วแต่ยังปักอยู่บนกราฟ
 *   ทั้งสามอย่างวาดออกมาสวยเหมือนของถูกต้องทุกประการ ไม่มี error ให้ใครเห็น
 *
 * ครอบคลุมอะไรบ้าง
 *   1. โครงคำตอบครบช่อง · แท่งเรียงเวลาขึ้น ไม่ซ้ำ · ราคาสดไม่ถูกลากกลับไปเป็นราคาปิด
 *   2. แท่งปิดกับแท่งที่ยังก่อตัวถูกแยกคนละช่องจริง (ไม่มีวันปนกัน)
 *   3. แท่งเสียถูกด่าน candle-sanitizer จัดการ (กรอบผิด → ซ่อม · ระดับผิด → ทิ้ง)
 *   4. กรอบเวลาที่ไม่รองรับ / สัญลักษณ์นอกจักรวาล → 400 พร้อมข้อความไทย
 *   5. ต้นทางล่มหรือส่งของเรียงผิด → 502 ไม่ใช่ 200 พร้อม body ว่าง
 *   6. ไม่ได้ล็อกอิน → 401
 *   7. ตัวจัดหมุด (buildSignalMarkers) ทุกด่าน + negative control ที่พิสูจน์ว่าเทสต์มีฟัน
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
//
// วิธีเดียวกับ scripts/check-ui-claims.mjs: ไล่ตาม import เอง ตั้งชื่อไฟล์ปลายทางจาก
// เส้นทางเต็ม (ไม่ใช่ basename) เพื่อไม่ให้ไฟล์ชื่อซ้ำจากคนละโฟลเดอร์ทับกัน
// เทสต์จึงวัด "โค้ดตัวเดียวกับที่รันจริง" ไม่ใช่สำเนาที่เขียนซ้ำแล้วเพี้ยนตามกันไม่ทัน

let typescript;
try {
  typescript = require_('typescript');
} catch {
  console.error('\n[ล้มเหลว] ไม่พบ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่\n');
  process.exit(1);
}

/**
 * โมดูลที่ต้องสวม stub แทนของจริง พร้อมเหตุผล
 * ตัวจริงของ supabase-server.ts import `next/headers` ตั้งแต่บรรทัดแรก ซึ่งโยนทันที
 * เมื่อถูกเรียกนอก request context ของ Next — เราจึงคุม "ใครล็อกอินอยู่" จากเทสต์แทน
 * (ด่านล็อกอินยังถูกยืนยันจริง: เคส 401 ข้างล่างสั่ง stub ให้คืน null แล้วเช็กสถานะ)
 */
const STUBS = {
  'src/lib/supabase-server.ts': `
    export function createRouteClient() { return globalThis.__TEST_ROUTE_CLIENT__ ?? null; }
    export function createAdminClient() { return null; }
    export async function getSessionUser() { return globalThis.__TEST_USER__ ?? null; }
  `,
};

function loadRouteModules() {
  const cacheRoot = path.join(ROOT, 'node_modules', '.cache');
  mkdirSync(cacheRoot, { recursive: true });
  const tmpDir = mkdtempSync(path.join(cacheRoot, 'chart-api-test-'));

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
    else return null; // แพ็กเกจภายนอก — ปล่อยให้ node resolve เอง
    if (spec.endsWith('.json')) return existsSync(base) ? base : null;
    for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return null;
  };

  const SPEC = /((?:^|[\s;{}])(?:from|import)\s*\(?\s*)(['"])([^'"]+)\2/g;
  const entry = path.join(ROOT, 'src', 'app', 'api', 'chart', 'route.ts');
  const extra = [
    path.join(ROOT, 'src', 'lib', 'chart-markers.ts'),
    path.join(ROOT, 'src', 'lib', 'chart-timeframes.ts'),
    // ตารางอายุสัญญาณตัวจริง — ด่าน 8 ใช้พิสูจน์ว่าเพดานจำนวนแท่งยังกว้างพอ
    // จะไม่ตัดหมุดของใบที่ยังเปิดอยู่ทิ้ง (ห้ามลอกตัวเลขมาเขียนซ้ำในเทสต์)
    path.join(ROOT, 'src', 'lib', 'signal-engine.ts'),
  ];
  const done = new Set();
  const queue = [entry, ...extra];

  while (queue.length) {
    const abs = queue.shift();
    if (done.has(abs)) continue;
    done.add(abs);

    if (abs.endsWith('.json')) {
      writeFileSync(path.join(tmpDir, nameOf(abs)), readFileSync(abs));
      continue;
    }

    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const source = STUBS[rel] ?? readFileSync(abs, 'utf8');

    const js = typescript.transpileModule(source, {
      fileName: path.basename(abs),
      compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext },
    }).outputText;

    const rewritten = js.replace(SPEC, (whole, head, q, spec) => {
      // node ต้องการนามสกุลเต็มของ next/server ถึงจะ resolve ได้จาก ESM เปล่า ๆ
      if (spec === 'next/server') return `${head}${q}next/server.js${q}`;
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

// isDemoMode() ต้องเป็น false ตลอดเทสต์ ไม่งั้น route จะตอบข้อมูลจำลองแล้วเราจะไม่ได้
// ทดสอบเส้นทางจริงเลย — ตั้งค่าก่อน import โมดูลใด ๆ (มันอ่าน env ตอนถูกเรียก ไม่ใช่ตอนโหลด
// แต่ตั้งไว้ก่อนปลอดภัยกว่า)
process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

const loaded = loadRouteModules();
const route = await import(loaded.fileFor(path.join(ROOT, 'src', 'app', 'api', 'chart', 'route.ts')));
const markersMod = await import(loaded.fileFor(path.join(ROOT, 'src', 'lib', 'chart-markers.ts')));
const tfMod = await import(loaded.fileFor(path.join(ROOT, 'src', 'lib', 'chart-timeframes.ts')));
const engineMod = await import(loaded.fileFor(path.join(ROOT, 'src', 'lib', 'signal-engine.ts')));
const { NextRequest } = await import('next/server.js');

const { buildSignalMarkers } = markersMod;
const { CHART_TIMEFRAMES, resolveTimeframe, CHART_CACHE_SEC, CHART_MAX_BARS } = tfMod;

// ─────────────────────── โรงงานผลิตคำตอบปลอมของ Yahoo ───────────────────────

const BAR_SEC = 900; // เลน 15m — เลนเริ่มต้นของหน้ากราฟ

/**
 * สร้างคำตอบแบบเดียวกับที่ Yahoo ส่งจริง
 *
 * กติกาที่ splitClosedBars ใช้แยกแท่งสดออกจากแท่งปิด (ดู src/lib/market-data.ts):
 *   · timestamp ที่ไม่ลงตัวกับ 60 = แท่งสด (Yahoo ประทับด้วยเวลาซื้อขายล่าสุด)
 *   · แท่งปิดใบท้ายสุดต้องผ่านคาบเต็มแล้ว
 * เราจึงผูกเวลาทั้งหมดกับ "ต้นแท่งปัจจุบันของนาฬิกาจริง" เพื่อให้เงื่อนไขเป็นจริงเสมอ
 * โดยไม่ต้องไปยุ่งกับนาฬิกาของเครื่อง
 */
function yahooPayload({ closedCount = 60, withForming = true, corrupt = false, duplicateAt = -1 } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const currentBarStart = nowSec - (nowSec % BAR_SEC);

  const timestamp = [];
  const open = [];
  const high = [];
  const low = [];
  const close = [];
  const volume = [];

  let level = 3500;
  for (let i = 0; i < closedCount; i++) {
    // แท่งปิดใบสุดท้ายคือ currentBarStart - BAR_SEC (ผ่านคาบเต็มไปแล้วแน่นอน)
    const ts = currentBarStart - (closedCount - i) * BAR_SEC;
    let o = level;
    let c = level * (1 + Math.sin(i / 5) * 0.002);
    let h = Math.max(o, c) * 1.0008;
    let l = Math.min(o, c) * 0.9992;

    if (corrupt && i === 10) {
      // กรอบผิด: high ต่ำกว่าทั้ง open และ close → ด่านต้อง "ซ่อม" ไม่ใช่ทิ้ง
      h = Math.min(o, c) * 0.999;
    }
    if (corrupt && i === 30) {
      // ระดับผิดทั้งแท่ง: วาร์ปขึ้น 25% (เกิน SPIKE_PCT ของ GOLD ที่ 0.18)
      // แล้วแท่งถัดไปถอยกลับระดับเดิม → ด่านต้อง "ทิ้ง" ทั้งแท่ง
      o = level * 1.25;
      c = level * 1.25;
      h = c * 1.001;
      l = o * 0.999;
    }

    timestamp.push(ts);
    open.push(o);
    high.push(h);
    low.push(l);
    close.push(c);
    volume.push(1000 + i);
    // แท่งระดับผิดต้องไม่เลื่อน level ไปด้วย ไม่งั้นแท่งถัดไปจะไม่ "ถอยกลับ"
    if (!(corrupt && i === 30)) level = c;
  }

  if (duplicateAt >= 0 && duplicateAt < timestamp.length) {
    // เวลาซ้ำจากต้นทาง — ตัววาดกราฟรับไม่ได้ route ต้องปฏิเสธทั้งชุด
    timestamp[duplicateAt] = timestamp[duplicateAt - 1];
  }

  const livePrice = 3777.77;
  if (withForming) {
    // +42 วินาที: ไม่ลงตัวกับ 60 → splitClosedBars ต้องจัดเป็นแท่งที่ยังก่อตัว
    timestamp.push(currentBarStart + 42);
    open.push(level);
    high.push(livePrice * 1.001);
    low.push(level * 0.999);
    close.push(livePrice);
    volume.push(99);
  }

  return {
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice: livePrice,
            regularMarketDayHigh: livePrice * 1.002,
            regularMarketDayLow: livePrice * 0.99,
            regularMarketTime: currentBarStart + 42,
            longName: 'Gold Futures',
            currentTradingPeriod: {
              regular: { start: currentBarStart - 10 * BAR_SEC, end: currentBarStart + 20 * BAR_SEC },
            },
          },
          timestamp,
          indicators: { quote: [{ open, high, low, close, volume }] },
        },
      ],
    },
  };
}

/** สวม fetch ปลอมรอบการเรียกหนึ่งครั้ง แล้วคืนของเดิมเสมอ (ต่อให้ route โยน) */
async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const okFetch = (payload) => async () => ({ ok: true, json: async () => payload });

/** ยิง GET ของ route จริง แล้วคลี่คำตอบออกมาให้ตรวจง่าย ๆ */
async function callRoute(query = '', { payload = yahooPayload(), fetchImpl = null, user = { id: 'u1' } } = {}) {
  globalThis.__TEST_USER__ = user;
  const impl = fetchImpl ?? okFetch(payload);
  return withFetch(impl, async () => {
    const res = await route.GET(new NextRequest(`http://localhost/api/chart${query}`));
    const body = await res.json();
    return { status: res.status, body, headers: res.headers };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. โครงคำตอบ + การแยกแท่งปิดออกจากแท่งสด
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n1. โครงคำตอบของ /api/chart\n');

const clean = await callRoute('?timeframe=15m');

await check('ตอบ 200 และ success: true', () => {
  assertEqual(clean.status, 200, `ได้สถานะ ${clean.status} · error=${clean.body?.error ?? '—'}`);
  assertEqual(clean.body.success, true, 'success ต้องเป็น true');
});

await check('มีทุกช่องที่หน้ากราฟต้องใช้', () => {
  for (const key of ['symbol', 'market', 'name', 'timeframe', 'interval', 'range', 'pollMs', 'cacheSec', 'bars', 'forming', 'quote', 'servedAt']) {
    assert(key in clean.body, `ขาดช่อง "${key}" ในคำตอบ`);
  }
  assertEqual(clean.body.symbol, 'XAUUSD', 'symbol เริ่มต้นต้องเป็นทอง (จักรวาลมีตัวเดียว)');
  assertEqual(clean.body.timeframe, '15m', 'timeframe ต้องสะท้อนสิ่งที่ขอ');
  assertEqual(clean.body.interval, '15m', 'interval ที่ส่งไป Yahoo ต้องมาจากตารางกรอบเวลา');
  assertEqual(clean.body.range, '1mo', 'range ของ 15m คือเพดานของ Yahoo');
  assertEqual(clean.body.cacheSec, CHART_CACHE_SEC, 'cacheSec ต้องบอกอายุแคชจริง ให้หน้าเว็บพูดความจริงได้');
});

await check('ทุกแท่งมี t/o/h/l/c เป็นตัวเลข finite', () => {
  assert(Array.isArray(clean.body.bars) && clean.body.bars.length > 0, 'ต้องมีแท่ง');
  for (const b of clean.body.bars) {
    for (const k of ['t', 'o', 'h', 'l', 'c']) {
      assert(typeof b[k] === 'number' && Number.isFinite(b[k]), `แท่งที่ t=${b.t} ช่อง ${k} ไม่ใช่ตัวเลข`);
    }
    assert(b.h >= Math.max(b.o, b.c), `แท่ง t=${b.t} มี high ต่ำกว่ากรอบ — ด่านซ่อมกรอบไม่ทำงาน`);
    assert(b.l <= Math.min(b.o, b.c), `แท่ง t=${b.t} มี low สูงกว่ากรอบ`);
  }
});

await check('t เป็น epoch วินาที ไม่ใช่มิลลิวินาที', () => {
  const t = clean.body.bars[0].t;
  const nowSec = Math.floor(Date.now() / 1000);
  assert(Math.abs(t - nowSec) < 90 * 86_400, `t=${t} ห่างจากเวลาปัจจุบันเกินไป — น่าจะส่งเป็นมิลลิวินาที`);
});

await check('แท่งเรียงเวลาขึ้นและไม่มีเวลาซ้ำ', () => {
  const bars = clean.body.bars;
  for (let i = 1; i < bars.length; i++) {
    assert(bars[i].t > bars[i - 1].t, `แท่งที่ ${i} (t=${bars[i].t}) ไม่ได้มากกว่าแท่งก่อนหน้า (t=${bars[i - 1].t})`);
  }
});

await check('แท่งที่ยังก่อตัวถูกแยกออกมาที่ช่อง forming ไม่ปนอยู่ใน bars', () => {
  const { bars, forming } = clean.body;
  assert(forming !== null, 'ต้องมีแท่งที่กำลังก่อตัว (payload ทดสอบใส่มาให้แล้ว)');
  assert(!bars.some((b) => b.t === forming.t), 'เวลาแท่งสดต้องไม่โผล่ในชุดแท่งปิด');
  assert(forming.t > bars[bars.length - 1].t, 'แท่งสดต้องอยู่หลังแท่งปิดใบสุดท้ายเสมอ');
});

await check('ราคาสดใน quote ไม่ถูกลากกลับไปเป็นราคาปิดของแท่งปิดใบสุดท้าย', () => {
  const { quote, bars } = clean.body;
  assert(quote !== null, 'ต้องมี quote');
  assertEqual(quote.price, 3777.77, 'quote.price ต้องเป็นราคาสดจาก meta');
  assert(quote.price !== bars[bars.length - 1].c, 'ราคาสดต้องต่างจากราคาปิดของแท่งที่ใช้คำนวณ');
});

await check('รอบที่ไม่มีแท่งสด (ตลาดปิด) → forming เป็น null แต่ bars ยังครบ', async () => {
  const r = await callRoute('?timeframe=15m', { payload: yahooPayload({ withForming: false }) });
  assertEqual(r.status, 200, 'ตลาดปิดไม่ใช่ข้อผิดพลาด');
  assertEqual(r.body.forming, null, 'ไม่มีแท่งก่อตัว = null ไม่ใช่ object ว่าง');
  assert(r.body.bars.length > 0, 'แท่งปิดต้องยังมาครบ');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ด่านตรวจแท่งเสีย (candle-sanitizer เสียบอยู่จริงในเส้นทางนี้)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n2. แท่งเสียจากต้นทางต้องถูกด่านจัดการก่อนถึงหน้าจอ\n');

const dirty = await callRoute('?timeframe=15m', { payload: yahooPayload({ corrupt: true }) });

await check('แท่ง "ระดับผิดทั้งแท่ง" ถูกทิ้ง (ได้แท่งน้อยกว่าที่ต้นทางส่งมา 1 ใบ)', () => {
  assertEqual(dirty.status, 200, `ได้สถานะ ${dirty.status}`);
  assertEqual(dirty.body.bars.length, clean.body.bars.length - 1,
    'แท่งที่วาร์ป 25% แล้วถอยกลับ ต้องถูกด่านทิ้งพอดีหนึ่งใบ');
});

await check('แท่ง "กรอบผิด" ถูกซ่อม ไม่ใช่ถูกทิ้ง — ทุกแท่งที่เหลือกรอบถูกต้อง', () => {
  for (const b of dirty.body.bars) {
    assert(b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c),
      `แท่ง t=${b.t} ยังมีกรอบที่เป็นไปไม่ได้ (o=${b.o} h=${b.h} l=${b.l} c=${b.c})`);
  }
});

await check('ไม่มีแท่งไหนราคาติดลบหรือเป็นศูนย์หลุดออกไป', () => {
  for (const b of dirty.body.bars) {
    for (const k of ['o', 'h', 'l', 'c']) {
      assert(b[k] > 0, `แท่ง t=${b.t} ช่อง ${k} ไม่เป็นบวก`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. input ที่ไม่รองรับ ต้องถูกปฏิเสธด้วย 400 ไม่ใช่ถอยไปกรอบอื่นเงียบ ๆ
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n3. กรอบเวลา / สัญลักษณ์ ที่ไม่รองรับ\n');

// '15%20m' = "15 m" (มีช่องว่างคั่นกลาง) ต่างจาก '%2015m%20' = " 15m " ที่ trim แล้วใช้ได้
// — ตั้งใจแยกสองเคสนี้ออกจากกัน เพราะ resolveTimeframe ตัดช่องว่างหัวท้ายโดยเจตนา
for (const bad of ['5m', '1w', '4h', '1m', 'daily', 'null', '15%20m']) {
  await check(`timeframe=${bad} → 400 พร้อมข้อความไทย`, async () => {
    const r = await callRoute(`?timeframe=${bad}`);
    assertEqual(r.status, 400, `ได้สถานะ ${r.status} — กรอบที่ไม่รู้จักต้องถูกปฏิเสธ`);
    assertEqual(r.body.success, false, 'success ต้องเป็น false');
    assert(/[฀-๿]/.test(String(r.body.error)), `ข้อความ error ต้องเป็นภาษาไทย ได้: ${r.body.error}`);
  });
}

await check('timeframe ว่าง (?timeframe=) → 400 ไม่ใช่ถอยไปค่าเริ่มต้น', async () => {
  const r = await callRoute('?timeframe=');
  assertEqual(r.status, 400, 'ค่าว่างคือค่าที่ผู้เรียกตั้งใจส่ง ไม่ใช่การไม่ส่ง');
});

await check('มีช่องว่างหัวท้าย (?timeframe=%2015m%20) → ยังผ่าน เพราะตัวแปลงตัดช่องว่างโดยเจตนา', async () => {
  const r = await callRoute('?timeframe=%2015m%20');
  assertEqual(r.status, 200, 'ช่องว่างที่ติดมากับ query ไม่ควรทำให้คำขอที่ถูกต้องล้ม');
  assertEqual(r.body.timeframe, '15m', 'ต้องคืนคีย์รูปมาตรฐาน');
});

await check('ไม่ส่ง timeframe เลย → ใช้ค่าเริ่มต้น 15m', async () => {
  const r = await callRoute('');
  assertEqual(r.status, 200, 'ไม่ส่งพารามิเตอร์ต้องใช้ค่าเริ่มต้นได้');
  assertEqual(r.body.timeframe, '15m', 'ค่าเริ่มต้นของหน้ากราฟคือเลนที่เจ้าของเฝ้าดูจริง');
});

await check('รับตัวพิมพ์ไม่ตรง (1h / 1d) ได้ เพราะ query จากมือถือมาได้ทั้งสองแบบ', async () => {
  for (const [q, want] of [['1h', '1H'], ['1H', '1H'], ['1d', '1D'], ['1D', '1D']]) {
    const r = await callRoute(`?timeframe=${q}`);
    assertEqual(r.status, 200, `timeframe=${q} ควรผ่าน`);
    assertEqual(r.body.timeframe, want, `timeframe=${q} ควรถูกแปลงเป็น ${want}`);
  }
});

await check('ทุกกรอบใน CHART_TIMEFRAMES ยิงผ่านหมด (ไล่จากตารางจริง ไม่ใช่รายชื่อที่เทสต์พิมพ์เอง)', async () => {
  assert(CHART_TIMEFRAMES.length >= 3, 'ตารางกรอบเวลาต้องมีอย่างน้อย 15m/1H/1D');
  for (const t of CHART_TIMEFRAMES) {
    const r = await callRoute(`?timeframe=${t.key}`);
    assertEqual(r.status, 200, `กรอบ ${t.key} ที่ประกาศไว้ในตาราง กลับยิงไม่ผ่าน`);
    assertEqual(r.body.interval, t.interval, `${t.key} ต้องขอ interval ${t.interval} จาก Yahoo`);
    assertEqual(r.body.range, t.range, `${t.key} ต้องขอ range ${t.range}`);
    assertEqual(r.body.pollMs, t.pollMs, `${t.key} ต้องบอกจังหวะ poll ให้หน้าเว็บตรงกับตาราง`);
    assert(t.pollMs >= CHART_CACHE_SEC * 1000,
      `${t.key} poll ถี่กว่าอายุแคช (${t.pollMs}ms < ${CHART_CACHE_SEC * 1000}ms) — คำขอส่วนเกินจะได้คำตอบเดิมเปล่า ๆ`);
  }
});

await check('สัญลักษณ์นอกจักรวาล → 400 (route นี้ต้องไม่กลายเป็น proxy เปิดของ Yahoo)', async () => {
  for (const sym of ['EURUSD', 'AAPL', 'BTC-USD', '../../etc/passwd']) {
    const r = await callRoute(`?timeframe=15m&symbol=${encodeURIComponent(sym)}`);
    assertEqual(r.status, 400, `${sym} ควรถูกปฏิเสธ`);
    assertEqual(r.body.success, false, 'success ต้องเป็น false');
  }
});

await check('สัญลักษณ์ในจักรวาล (พิมพ์เล็ก/มีช่องว่าง) ยังผ่าน', async () => {
  const r = await callRoute('?timeframe=15m&symbol=%20xauusd%20');
  assertEqual(r.status, 200, 'ตัวพิมพ์และช่องว่างไม่ควรทำให้คำขอที่ถูกต้องล้ม');
  assertEqual(r.body.symbol, 'XAUUSD', 'ต้องคืน symbol รูปมาตรฐานของระบบ');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ต้นทางล่ม / ส่งของเชื่อไม่ได้ — ห้ามตอบ 200 พร้อม body ว่าง
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n4. ต้นทางล่มหรือส่งของเชื่อไม่ได้\n');

await check('Yahoo ตอบไม่ ok ทุก host → 502 พร้อมข้อความไทย (ไม่ใช่ 200 body ว่าง)', async () => {
  const r = await callRoute('?timeframe=15m', { fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  assertEqual(r.status, 502, `ได้สถานะ ${r.status}`);
  assertEqual(r.body.success, false, 'success ต้องเป็น false');
  assert(!('bars' in r.body), 'คำตอบที่ล้มต้องไม่แถบ bars ว่างมาให้เข้าใจผิด');
  assert(/[฀-๿]/.test(String(r.body.error)), 'ข้อความ error ต้องเป็นภาษาไทย');
});

await check('fetch โยน error → 502 (fetchChart กลืน error แล้วคืนก้อนว่าง route ต้องไม่กลืนตาม)', async () => {
  const r = await callRoute('?timeframe=15m', {
    fetchImpl: async () => {
      throw new Error('network down');
    },
  });
  assertEqual(r.status, 502, `ได้สถานะ ${r.status}`);
});

await check('ต้นทางส่งเวลาซ้ำ → 502 (กราฟที่เชื่อไม่ได้ ต้องไม่ถูกวาด)', async () => {
  const r = await callRoute('?timeframe=15m', { payload: yahooPayload({ duplicateAt: 20 }) });
  assertEqual(r.status, 502, `ได้สถานะ ${r.status} — เวลาซ้ำต้องถูกปฏิเสธทั้งชุด`);
  assert(String(r.body.error).includes('เรียงเวลาผิด'), `ข้อความต้องชี้สาเหตุจริง ได้: ${r.body.error}`);
});

await check('ทุกคำตอบ (สำเร็จและล้มเหลว) ติดหัว Cache-Control ที่ CDN ถือไว้ไม่ได้', async () => {
  const bad = await callRoute('?timeframe=5m');
  for (const [label, r] of [['สำเร็จ', clean], ['400', bad]]) {
    const cc = String(r.headers.get('cache-control') ?? '');
    assert(cc.includes('private'), `คำตอบ${label}: ขาด private → ตัวกลางอาจเสิร์ฟข้ามผู้ใช้ (ได้: "${cc}")`);
    assert(cc.includes('no-store'), `คำตอบ${label}: ขาด no-store → ราคาบนจอจะค้าง (ได้: "${cc}")`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ด่านล็อกอิน
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n5. ด่านล็อกอิน\n');

await check('ไม่มี session → 401 และไม่ยิงไป Yahoo เลย', async () => {
  let calls = 0;
  const r = await callRoute('?timeframe=15m', {
    user: null,
    fetchImpl: async () => {
      calls++;
      return { ok: true, json: async () => yahooPayload() };
    },
  });
  assertEqual(r.status, 401, `ได้สถานะ ${r.status}`);
  assertEqual(calls, 0, 'ผู้ใช้ที่ยังไม่ล็อกอินต้องไม่ทำให้เรายิงคำขอออกไปข้างนอก');
});

await check('ซอร์สของ route เรียก getSessionUser จริง (stub ในเทสต์ต้องไม่ปิดตาด่านนี้)', () => {
  const src = readFileSync(path.join(ROOT, 'src', 'app', 'api', 'chart', 'route.ts'), 'utf8');
  assert(src.includes('getSessionUser'), 'route ต้องถามว่าใครล็อกอินอยู่');
  assert(src.includes('fetchChart'), 'route ต้องดึงราคาผ่าน fetchChart ตัวจริง (เพื่อให้ผ่านด่านตรวจแท่ง)');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ตัวจัดหมุด — สัญญาณใบไหนขึ้นกราฟ และเกาะแท่งไหน
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n6. ตรรกะแมปสัญญาณ → หมุด (buildSignalMarkers)\n');

/** แท่งสมมติ 10 ใบ เรียงเวลาขึ้น ห่างกันใบละ 15 นาที เริ่มที่ 10:00:00Z */
const BASE = Math.floor(Date.parse('2026-09-03T10:00:00.000Z') / 1000);
const BARS = Array.from({ length: 10 }, (_, i) => BASE + i * BAR_SEC);
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
    created_at: isoAt(BASE + 3 * BAR_SEC + 120), // กลางแท่งที่ 3
    ...over,
  };
}

const build = (signals, tf = '15m') => buildSignalMarkers(signals, BARS, { symbol: 'XAUUSD', timeframe: tf });

await check('สัญญาณปกติ → ได้หมุดหนึ่งอัน เกาะ "แท่งท้ายสุดที่เปิดไปแล้วตอนสัญญาณเกิด"', () => {
  const m = build([signal()]);
  assertEqual(m.length, 1, 'ต้องได้หมุดหนึ่งอัน');
  assertEqual(m[0].time, BARS[3], 'สัญญาณที่เกิดกลางแท่งที่ 3 ต้องเกาะแท่งที่ 3 ไม่ใช่แท่งที่ 4');
  assertEqual(m[0].action, 'BUY', 'ทิศต้องตรง');
  assertEqual(m[0].entry, 3500, 'ราคาเข้าต้องเป็นของจริงจากแถว');
  assertEqual(m[0].stopLoss, 3480, 'SL ต้องเป็นของจริง');
  assertEqual(m[0].takeProfit, 3540, 'TP ต้องเป็นของจริง');
  assertEqual(m[0].costR, 0.031, 'ต้นทุนเป็น R ต้องติดมากับหมุด');
  assertEqual(m[0].foreign, false, 'กรอบเดียวกับที่ดูอยู่ = ไม่ใช่สัญญาณข้ามกรอบ');
});

await check('สัญญาณที่เกิดตรงเวลาเปิดแท่งพอดี → เกาะแท่งนั้น ไม่ใช่แท่งก่อนหน้า', () => {
  const m = build([signal({ created_at: isoAt(BARS[5]) })]);
  assertEqual(m[0].time, BARS[5], 'เวลาเท่ากับต้นแท่ง ต้องเกาะแท่งนั้น');
});

await check('สัญญาณเก่ากว่าแท่งแรกของกราฟ → ไม่ขึ้น (ห้ามดันไปกองที่ขอบซ้าย)', () => {
  const m = build([signal({ created_at: isoAt(BASE - 1) })]);
  assertEqual(m.length, 0, 'ใบที่อยู่นอกช่วงเวลาของกราฟต้องไม่ถูกวาด');
});

await check('สัญญาณที่เกิดหลังแท่งท้ายสุด (ตลาดยังไม่มีแท่งใหม่) → เกาะแท่งท้ายสุด', () => {
  const m = build([signal({ created_at: isoAt(LAST_BAR + 5000) })]);
  assertEqual(m.length, 1, 'ใบที่เพิ่งเกิดต้องยังเห็นได้');
  assertEqual(m[0].time, LAST_BAR, 'ต้องเกาะแท่งที่ตลาดเคลื่อนไหวล่าสุด');
});

await check('ใบที่ ledger ปิดบัญชีไปแล้ว (outcome=sl/tp/timeout) → ไม่ขึ้น', () => {
  for (const outcome of ['sl', 'tp', 'timeout', 'unresolvable']) {
    const m = build([signal({ outcome })]);
    assertEqual(m.length, 0, `outcome='${outcome}' คือใบที่ปิดแล้ว ต้องไม่ปักบนกราฟ`);
  }
});

await check("outcome='open' ยังนับว่าเปิดอยู่", () => {
  assertEqual(build([signal({ outcome: 'open' })]).length, 1, "'open' คือยังไม่ปิดบัญชี");
});

await check('โหมดถอย: ยังไม่ได้รัน migration 007 (ไม่มีคอลัมน์ outcome) → ยังนับว่าเปิด', () => {
  const s = signal();
  delete s.outcome;
  assertEqual(build([s]).length, 1, 'คอลัมน์ที่ไม่มี = ไม่เคยมีการปิดบัญชี ต้องไม่ทำให้หมุดหายทั้งกระดาน');
});

await check('ใบที่หมดอายุ/ถูกยกเลิก (status ไม่ใช่ active) → ไม่ขึ้น', () => {
  for (const status of ['expired', 'cancelled', 'triggered', null]) {
    assertEqual(build([signal({ status })]).length, 0, `status='${status}' ต้องไม่ปักบนกราฟ`);
  }
});

await check('HOLD / CLOSE → ไม่ขึ้น (ไม่มีจุดเข้าให้ปัก)', () => {
  assertEqual(build([signal({ action: 'HOLD' })]).length, 0, 'HOLD ไม่มีทิศให้ปัก');
  assertEqual(build([signal({ action: 'CLOSE' })]).length, 0, 'CLOSE ไม่มีทิศให้ปัก');
});

await check('สัญญาณของสัญลักษณ์อื่น → ไม่ขึ้นบนกราฟทอง', () => {
  assertEqual(build([signal({ symbol: 'EURUSD' })]).length, 0, 'กราฟทองต้องแสดงเฉพาะหมุดของทอง');
});

await check('ราคาเข้าที่ใช้ไม่ได้ (0 / ติดลบ / NaN) → ไม่ขึ้น', () => {
  for (const entry_price of [0, -1, NaN, Infinity]) {
    assertEqual(build([signal({ entry_price })]).length, 0, `entry_price=${entry_price} ไม่ใช่ราคา`);
  }
});

await check('SL/TP ที่ใช้ไม่ได้ → คืน null ไม่ใช่ 0 (ตัววาดต้องรู้ว่าไม่มีเส้นให้ลาก)', () => {
  const m = build([signal({ stop_loss: 0, take_profit: NaN })]);
  assertEqual(m.length, 1, 'ใบยังมีจุดเข้า จึงยังปักได้');
  assertEqual(m[0].stopLoss, null, 'SL ที่ใช้ไม่ได้ต้องเป็น null');
  assertEqual(m[0].takeProfit, null, 'TP ที่ใช้ไม่ได้ต้องเป็น null');
});

await check('created_at ที่อ่านไม่ออก → ไม่ขึ้น (ห้ามเดาเวลาแล้วปักมั่ว)', () => {
  assertEqual(build([signal({ created_at: 'เมื่อวานนี้' })]).length, 0, 'เวลาที่ parse ไม่ได้ = ไม่รู้ว่าปักตรงไหน');
});

await check('หลายสัญญาณเวลาใกล้กันในแท่งเดียว → ขึ้นครบทุกใบ เกาะแท่งเดียวกัน เรียงตามเวลาจริง', () => {
  const at = BASE + 6 * BAR_SEC;
  const m = build([
    signal({ id: 'c', created_at: isoAt(at + 800) }),
    signal({ id: 'a', created_at: isoAt(at + 10), action: 'SELL' }),
    signal({ id: 'b', created_at: isoAt(at + 400) }),
  ]);
  assertEqual(m.length, 3, 'ไม่มีใบไหนถูกยุบทิ้งเพราะเวลาชนกัน');
  assert(m.every((x) => x.time === BARS[6]), 'ทั้งสามใบต้องเกาะแท่งที่ 6 เหมือนกัน');
  assertEqual(m.map((x) => x.id).join(','), 'a,b,c', 'ในแท่งเดียวกันต้องเรียงตาม created_at จริง');
});

await check('ผลลัพธ์เรียงเวลาขึ้นเสมอ ต่อให้ป้อนสลับลำดับ (ตัววาดกราฟบังคับ)', () => {
  const m = build([
    signal({ id: 'late', created_at: isoAt(BARS[8] + 60) }),
    signal({ id: 'early', created_at: isoAt(BARS[1] + 60) }),
    signal({ id: 'mid', created_at: isoAt(BARS[4] + 60) }),
  ]);
  assertEqual(m.map((x) => x.id).join(','), 'early,mid,late', 'หมุดที่เรียงผิดจะทำให้ไลบรารีโยน error ทั้งชุด');
  for (let i = 1; i < m.length; i++) {
    assert(m[i].time >= m[i - 1].time, 'เวลาต้องไม่ย้อน');
  }
});

await check('สัญญาณคนละกรอบเวลากับที่กำลังดู → ยังขึ้น แต่ติดธง foreign ให้ UI บอกที่มา', () => {
  const m = build([signal({ timeframe: '1D' })], '15m');
  assertEqual(m.length, 1, 'สัญญาณของกรอบอื่นยังเป็นข้อเท็จจริงที่ควรเห็น');
  assertEqual(m[0].foreign, true, 'ต้องติดธงเพื่อให้หน้าเว็บบอกว่ามาจากกรอบไหน');
  assertEqual(m[0].timeframe, '1D', 'ต้องบอกกรอบต้นทางของจริง');
});

await check('timeframe ที่เป็น NULL ในแถวเก่า → ไม่พัง และถือว่าเป็นสัญญาณข้ามกรอบ', () => {
  const m = build([signal({ timeframe: null })]);
  assertEqual(m.length, 1, 'แถวเก่าที่ timeframe ว่างต้องไม่ทำให้ทั้งหน้าล้ม');
  assertEqual(m[0].foreign, true, 'ไม่รู้ที่มา = ต้องไม่อ้างว่ามาจากกราฟที่กำลังดู');
});

await check('ไม่มีแท่งเลย → ไม่มีหมุด (ไม่ใช่ throw)', () => {
  assertEqual(buildSignalMarkers([signal()], [], { symbol: 'XAUUSD', timeframe: '15m' }).length, 0,
    'กราฟที่ยังไม่มีข้อมูลต้องไม่ทำให้หน้าพัง');
});

// ── negative control: พิสูจน์ว่าชุดยืนยันข้างบนจับของผิดได้จริง ────────────────
//
// ตัวตรวจที่เขียวตลอดเพราะจับอะไรไม่ได้ อันตรายกว่าไม่มีตัวตรวจ — ป้อน "ตัวจัดหมุดปลอม"
// ที่ตัดด่าน "ยังเปิดอยู่" กับด่าน "อยู่ในช่วงเวลา" ทิ้ง แล้วต้องมีข้อแดงจริง
await check('negative control: ตัวจัดหมุดที่ไม่กรองใบที่ปิดแล้ว/นอกช่วงเวลา ต้องสอบตก', () => {
  const bypass = (signals, barTimes) =>
    signals
      .filter((s) => s.action === 'BUY' || s.action === 'SELL')
      .map((s) => ({
        id: s.id,
        action: s.action,
        time: barTimes[0],
        createdSec: Math.floor(new Date(s.created_at).getTime() / 1000),
        entry: s.entry_price,
        stopLoss: s.stop_loss,
        takeProfit: s.take_profit,
        strength: s.strength,
        confidence: s.confidence,
        costR: s.cost_r,
        timeframe: String(s.timeframe ?? '').toUpperCase(),
        foreign: false,
      }));

  const cases = [
    ['ใบที่ ledger ปิดแล้ว', [signal({ outcome: 'sl' })], 0],
    ['ใบที่หมดอายุ', [signal({ status: 'expired' })], 0],
    ['ใบที่เก่ากว่าช่วงกราฟ', [signal({ created_at: isoAt(BASE - 1) })], 0],
  ];
  let caught = 0;
  for (const [, input, want] of cases) {
    if (bypass(input, BARS).length !== want) caught++;
  }
  assertEqual(caught, 3, `ตัวปลอมควรสอบตกทั้ง 3 ข้อ แต่ตกแค่ ${caught} — ชุดยืนยันข้างบนไม่มีฟัน`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ตารางกรอบเวลาต้องสมเหตุผลกับตัวมันเอง
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n7. ตารางกรอบเวลา\n');

await check('resolveTimeframe ปฏิเสธค่าที่ไม่รู้จัก และไม่เดาแทน', () => {
  for (const bad of ['', ' ', '5m', '2h', 'x', null, undefined]) {
    assertEqual(resolveTimeframe(bad), null, `resolveTimeframe(${JSON.stringify(bad)}) ต้องคืน null`);
  }
});

await check('ทุกกรอบมี barSec ตรงกับ interval ที่มันขอ', () => {
  const expect = { '15m': 900, '1h': 3600, '1d': 86_400 };
  for (const t of CHART_TIMEFRAMES) {
    assertEqual(t.barSec, expect[t.interval], `${t.key}: barSec ไม่ตรงกับ interval ${t.interval}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ขนาดก้อนที่ส่งออกสาย — เรื่องของค่าเน็ตเจ้าของ ไม่ใช่รายละเอียดภายใน
//
// หน้ากราฟถูกเปิดค้างบนมือถือและ poll ทุก 60 วินาที ขนาดคำตอบจึงแปลงเป็นเงินตรง ๆ
// สองด่านที่คุมมันคือ (ก) ปัดทศนิยมราคา (ข) เพดานจำนวนแท่ง — ทั้งคู่ "ถอดออกแล้ว
// ไม่มีอะไรพัง มีแต่บิลค่าเน็ตที่โตขึ้นเงียบ ๆ" จึงต้องมีด่านใน CI ไม่ใช่ความตั้งใจของคน
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n8. ขนาดก้อนที่ส่งออกสาย\n');

await check('ราคาทุกค่าถูกปัดเหลือความละเอียดมาตรฐาน (≤ 4 ตำแหน่ง) ไม่ใช่ float ดิบของ Yahoo', () => {
  const decimalsOf = (v) => {
    const s = String(v);
    const dot = s.indexOf('.');
    return dot < 0 ? 0 : s.length - dot - 1;
  };
  const all = [...clean.body.bars, clean.body.forming].filter(Boolean);
  assert(all.length > 0, 'ต้องมีแท่งให้ตรวจ');
  for (const b of all) {
    for (const k of ['o', 'h', 'l', 'c']) {
      assert(decimalsOf(b[k]) <= 4,
        `แท่ง t=${b.t} ช่อง ${k} = ${b[k]} มีทศนิยม ${decimalsOf(b[k])} ตำแหน่ง — float ดิบหลุดออกสาย`);
    }
  }
});

await check('การปัดไม่ทำให้กรอบแท่งพลิก (h ≥ max(o,c) และ l ≤ min(o,c) ยังจริงทุกแท่ง)', () => {
  // การปัดเข้ากริดคงที่เป็น monotonic กรอบจึงไม่มีทางพลิก — ด่านนี้ยืนยันข้อนั้นกับของจริง
  // แทนที่จะเชื่อเหตุผลบนกระดาษ (แท่งสดก็ต้องผ่านด้วย ไม่ใช่แค่แท่งปิด)
  for (const b of [...clean.body.bars, clean.body.forming].filter(Boolean)) {
    assert(b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c),
      `แท่ง t=${b.t} กรอบพลิกหลังปัด (o=${b.o} h=${b.h} l=${b.l} c=${b.c})`);
  }
});

await check(`ต้นทางส่งมาเกินเพดาน (${CHART_MAX_BARS}) → ตัดเหลือเท่าเพดาน และเก็บ "ของใหม่" ไว้`, async () => {
  assert(Number.isInteger(CHART_MAX_BARS) && CHART_MAX_BARS > 0, 'เพดานต้องเป็นจำนวนเต็มบวก');
  const over = CHART_MAX_BARS + 25;
  const r = await callRoute('?timeframe=15m', { payload: yahooPayload({ closedCount: over }) });
  assertEqual(r.status, 200, `ได้สถานะ ${r.status}`);
  assertEqual(r.body.bars.length, CHART_MAX_BARS, 'จำนวนแท่งต้องถูกตัดลงมาเท่าเพดานพอดี');
  // ตัดหัวไม่ใช่ตัดท้าย — แท่งท้ายสุดที่ส่งออกต้องยังเป็นแท่งปิดใบล่าสุดของต้นทาง
  const last = r.body.bars[r.body.bars.length - 1];
  assert(r.body.forming === null || r.body.forming.t > last.t,
    'แท่งสดต้องยังอยู่หลังแท่งปิดใบสุดท้าย = ตัดของเก่าทิ้ง ไม่ใช่ตัดของใหม่ทิ้ง');
  const nowSec = Math.floor(Date.now() / 1000);
  assert(nowSec - last.t < 3 * BAR_SEC, `แท่งท้ายสุด (t=${last.t}) ควรเป็นของล่าสุด ไม่ใช่ของเก่า`);
});

await check('ต้นทางส่งมาไม่ถึงเพดาน → ไม่ตัดอะไรเลย (เพดานต้องไม่ใช่การตัดตายตัว)', () => {
  assert(clean.body.bars.length < CHART_MAX_BARS, 'ชุดทดสอบมาตรฐานต้องเล็กกว่าเพดาน');
  assertEqual(clean.body.bars.length, 60, 'ชุด 60 แท่งต้องผ่านออกไปครบ');
});

await check('เพดานจำนวนแท่งกว้างพอจะไม่ตัดหมุดของสัญญาณที่ยังเปิดอยู่ทิ้ง (พิสูจน์จากตาราง TTL จริง)', () => {
  const { signalTtlMs } = engineMod;
  assert(typeof signalTtlMs === 'function', 'ต้องอ่านอายุสัญญาณจาก signal-engine.ts ตัวจริง');
  // อายุที่ยาวที่สุดที่ใบหนึ่งจะยังโชว์เป็น "เปิดอยู่" ได้ — รวมค่า default ของ timeframe
  // ที่ตารางไม่รู้จักด้วย เพราะแถวเก่าใน DB มี timeframe เป็น NULL ได้จริง
  const keys = [...CHART_TIMEFRAMES.map((t) => t.key), '__ไม่รู้จัก__'];
  const maxTtlSec = Math.max(...keys.map((k) => signalTtlMs(k))) / 1000;
  assert(maxTtlSec > 0, 'อ่านอายุสัญญาณไม่ได้');
  for (const t of CHART_TIMEFRAMES) {
    // CHART_MAX_BARS × barSec = เวลา "ซื้อขาย" ที่ครอบคลุม ซึ่งเป็นขอบล่างของเวลาปฏิทิน
    // เสมอ (ตลาดหยุดยิ่งทำให้ช่วงปฏิทินยาวขึ้น ไม่มีทางสั้นลง) เทียบกับ TTL ได้ตรง ๆ
    const coverSec = CHART_MAX_BARS * t.barSec;
    assert(coverSec >= maxTtlSec,
      `เลน ${t.key}: เพดาน ${CHART_MAX_BARS} แท่ง ครอบคลุมแค่ ${(coverSec / 86400).toFixed(1)} วัน ` +
      `แต่สัญญาณอยู่ได้ถึง ${(maxTtlSec / 86400).toFixed(1)} วัน — หมุดของใบที่ยังเปิดจะหายไปเงียบ ๆ`);
  }
});

await check('negative control: เพดานที่แคบกว่าอายุสัญญาณต้องสอบตก (ด่านข้างบนมีฟันจริง)', () => {
  const { signalTtlMs } = engineMod;
  const maxTtlSec = Math.max(...[...CHART_TIMEFRAMES.map((t) => t.key), '__x__'].map((k) => signalTtlMs(k))) / 1000;
  const tooSmall = 10; // 10 แท่ง 15m = 2.5 ชม. สั้นกว่าอายุสัญญาณทุกเลนแน่นอน
  const shortest = CHART_TIMEFRAMES.reduce((a, b) => (a.barSec <= b.barSec ? a : b));
  assert(tooSmall * shortest.barSec < maxTtlSec,
    'ตัวปลอมควรครอบคลุมสั้นกว่าอายุสัญญาณ ไม่งั้นด่านข้างบนจับอะไรไม่ได้');
});

// ─────────────────────────────────────── สรุป ───────────────────────────────────────

rmSync(loaded.tmpDir, { recursive: true, force: true });

console.log('');
if (failures.length) {
  console.log(`ไม่ผ่าน ${failures.length} เคส (ผ่าน ${passed})`);
  process.exit(1);
}
console.log(`ผ่านครบ ${passed} เคส`);
