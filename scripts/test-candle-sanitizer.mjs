#!/usr/bin/env node
/**
 * ชุดทดสอบด่านตรวจแท่งราคา (src/lib/candle-sanitizer.ts) และการต่อสายเข้าเส้นทางจริง
 *
 * ทำไมต้องมี: แท่งเสียจาก Yahoo (วัดจริง ~3.3% ของแคชวิจัย) ไม่มี error ให้เห็น —
 * มันกลายเป็น ATR/SL/TP ที่ผิดบนสัญญาณจริง และ realized_r ที่ผิดตอนปิดบัญชี
 * ด่านที่กันเรื่องนี้จึงต้องมีเทสต์ที่พิสูจน์สองทาง:
 *   1. กติกาของด่านถูกต้อง (เคสจริงจากแคช + เคสขอบทุกกิ่ง)
 *   2. ด่าน "เสียบอยู่จริง" ใน fetchChart — ถอดด่านออกเมื่อไหร่เทสต์นี้ต้องแดง
 *      (มี negative control ยิงชุดเดียวกันใส่ตัวปลอมที่ไม่กรองอะไร แล้วต้องจับได้)
 *
 * รัน: node scripts/test-candle-sanitizer.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const ts = require_('typescript');

// ─────────────────── โหลด src/lib/*.ts เป็นโมดูลจริง ───────────────────
// แบบเดียวกับ scan-universe.mjs (ตามกราฟ import อัตโนมัติ) เพื่อให้เทสต์นี้ทดสอบ
// "ไฟล์ตัวจริงที่โปรดักชันใช้" ไม่ใช่สำเนาที่ลอกมาไว้ในเทสต์

function resolveTsSpecifier(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = path.join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  if (spec.endsWith('.json')) return existsSync(base) && statSync(base).isFile() ? base : null;
  for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const flatNames = new Map();
function flatName(abs) {
  const hit = flatNames.get(abs);
  if (hit) return hit;
  const isJson = abs.endsWith('.json');
  const safe = path.basename(abs).replace(/\.(tsx?|json)$/, '').replace(/[^A-Za-z0-9_-]/g, '_');
  const name = `m${flatNames.size}_${safe}${isJson ? '.json' : '.mjs'}`;
  flatNames.set(abs, name);
  return name;
}

const SPEC_RE = /((?:^|[\s;{}])(?:from|import)\s*\(?\s*)(['"])([^'"]+)\2/g;

function transpileGraph(entries, tmpDir) {
  const done = new Set();
  const queue = [...entries];
  while (queue.length) {
    const abs = queue.shift();
    if (done.has(abs)) continue;
    done.add(abs);
    if (abs.endsWith('.json')) {
      writeFileSync(path.join(tmpDir, flatName(abs)), readFileSync(abs), null);
      continue;
    }
    const js = ts.transpileModule(readFileSync(abs, 'utf8'), {
      fileName: path.basename(abs),
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false },
    }).outputText;
    const rewritten = js.replace(SPEC_RE, (whole, head, q, spec) => {
      const dep = resolveTsSpecifier(spec, abs);
      if (!dep) return whole;
      if (!done.has(dep)) queue.push(dep);
      const jsonAttr = dep.endsWith('.json') && !head.includes('(') ? " with { type: 'json' }" : '';
      return `${head}${q}./${flatName(dep)}${q}${jsonAttr}`;
    });
    writeFileSync(path.join(tmpDir, flatName(abs)), rewritten, 'utf8');
  }
}

const SANITIZER_TS = path.join(ROOT, 'src', 'lib', 'candle-sanitizer.ts');
const MARKET_DATA_TS = path.join(ROOT, 'src', 'lib', 'market-data.ts');

const tmp = mkdtempSync(path.join(tmpdir(), 'sanitizer-test-'));
let sanitizer;
let marketData;
try {
  // market-data ต้อง resolve node_modules ได้ (@supabase/ssr ผ่าน ./supabase)
  const { symlinkSync } = await import('node:fs');
  const { platform } = await import('node:os');
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'), platform() === 'win32' ? 'junction' : 'dir');
  transpileGraph([SANITIZER_TS, MARKET_DATA_TS], tmp);
  sanitizer = await import(pathToFileURL(path.join(tmp, flatName(SANITIZER_TS))).href);
  marketData = await import(pathToFileURL(path.join(tmp, flatName(MARKET_DATA_TS))).href);
} catch (e) {
  console.error('โหลดโมดูลไม่สำเร็จ:', e);
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

let pass = 0;
let fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const candle = (o, h, l, c, i = 0) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  open: o, high: h, low: l, close: c, volume: 0,
});

/**
 * เคสจริงจากแคชวิจัย: EURUSD 2008-02-08 ระดับผิดทั้งแท่ง (+7.5% แล้วแท่งถัดไปถอยกลับ 98%)
 * ตัวเลขก๊อปมาตรง ๆ จาก .research-cache/candles/FOREX__EURUSD__1D.json (คงทศนิยมครบทุกหลัก)
 * ต้องฝังไว้ในไฟล์เพราะ .research-cache ไม่อยู่ใน git — CI ไม่มีแคชให้อ่าน
 * ถ้าเครื่องที่รันมีแคชอยู่ จะยิงกับไฟล์จริงทั้งชุดซ้ำอีกรอบด้วย (ด้านล่าง)
 */
const EURUSD_2008 = [
  candle(1.4637001752853394, 1.4667057991027832, 1.4595983028411865, 1.4617104530334473, 0), // 2008-02-06
  candle(1.4616036415100098, 1.4649009704589844, 1.4451910257339478, 1.4478904008865356, 1), // 2008-02-07
  candle(1.5570987462997437, 1.5570987462997437, 1.5540982484817505, 1.5570987462997437, 2), // 2008-02-08 ← ตัวปัญหา
  candle(1.4531927108764648, 1.4577046632766724, 1.4486035108566284, 1.450200080871582, 3), //  2008-02-11
  candle(1.4503053426742554, 1.460898995399475, 1.450200080871582, 1.4581936597824097, 4), //   2008-02-12
];

/**
 * ชุดยืนยันกติกา — รับ implementation เข้ามาเพื่อใช้ซ้ำสองรอบ:
 * รอบจริง (ต้องเขียวหมด) และรอบ negative control ที่ยิงใส่ตัวปลอมซึ่งไม่กรองอะไรเลย
 * (ต้องมีข้อที่แดง — ถ้าตัวปลอมยังผ่านหมด แปลว่าชุดยืนยันนี้ไร้ฟัน จับการถอดด่านไม่ได้จริง)
 */
function runRuleSuite(sanitize, report) {
  const failures = [];
  const check = (name, ok, detail = '') => {
    if (!ok) failures.push({ name, detail });
    if (report) t(name, ok, detail);
  };

  // 1. เคสจริง: แท่งระดับผิดทั้งแท่งต้องโดนทิ้ง เพื่อนบ้านต้องอยู่ครบและไม่ถูกแก้
  {
    const r = sanitize(EURUSD_2008, 'FOREX');
    check('EURUSD 2008-02-08 ถูกทิ้ง (เหลือ 4 แท่ง)', r.candles.length === 4, `ได้ ${r.candles.length}`);
    check('EURUSD dropped = 1', r.dropped === 1, `ได้ ${r.dropped}`);
    check(
      'เพื่อนบ้านอยู่ครบและไม่ถูกแก้',
      JSON.stringify(r.candles) === JSON.stringify([EURUSD_2008[0], EURUSD_2008[1], EURUSD_2008[3], EURUSD_2008[4]])
    );
  }

  // 2. กรอบผิด (close > high) ต้องโดน "ซ่อม" ไม่ใช่ "ทิ้ง" — จำนวนแท่งห้ามเปลี่ยน
  //    เพราะการทิ้งทำให้หน้าต่างอินดิเคเตอร์เลื่อนและผลไม่ตรงกันระหว่างเครื่อง
  {
    const input = [candle(100, 101, 99, 100.5, 0), candle(100.5, 101, 99.5, 102, 1), candle(102, 103, 101, 102.5, 2)];
    const r = sanitize(input, 'GOLD');
    check('close ทะลุ high: จำนวนแท่งคงเดิม', r.candles.length === 3, `ได้ ${r.candles.length}`);
    check('close ทะลุ high: repaired = 1 · dropped = 0', r.repaired === 1 && r.dropped === 0, `ได้ repaired ${r.repaired} dropped ${r.dropped}`);
    check('กรอบถูกขยายครอบ close', r.candles[1]?.high === 102 && r.candles[1]?.low === 99.5);
    check('ซ่อมโดยไม่แก้อาร์เรย์อินพุต', input[1].high === 101);
  }

  // 3. แท่งสุดท้ายกระโดดแรง (ยังไม่มีเพื่อนบ้านขวา) ต้องรอด — การวิ่งจริงตอนข่าวออก
  //    แยกจากข้อมูลเสียไม่ได้จนกว่าจะมีแท่งถัดไป ห้ามทิ้งเด็ดขาด
  {
    const input = [candle(1, 1.01, 0.99, 1.0, 0), candle(1.001, 1.011, 0.995, 1.006, 1), candle(1.2, 1.21, 1.19, 1.2, 2)];
    const r = sanitize(input, 'FOREX');
    check('แท่งสุดท้ายกระโดด +19% ต้องรอด', r.candles.length === 3 && r.candles[2].close === 1.2, `เหลือ ${r.candles.length}`);
    check('แท่งสุดท้าย: dropped = 0', r.dropped === 0, `ได้ ${r.dropped}`);
  }

  // 4. ข้อมูลสะอาดทั้งชุดต้องผ่านโดยไม่ถูกแตะสักแท่ง — ผลลัพธ์ byte-identical
  {
    const input = Array.from({ length: 60 }, (_, i) => {
      const base = 1 + Math.sin(i / 5) * 0.01;
      return candle(base, base * 1.004, base * 0.996, base * 1.001, i);
    });
    const r = sanitize(input, 'FOREX');
    check('ชุดสะอาด: byte-identical', JSON.stringify(r.candles) === JSON.stringify(input));
    check('ชุดสะอาด: dropped = 0 · repaired = 0', r.dropped === 0 && r.repaired === 0, `ได้ dropped ${r.dropped} repaired ${r.repaired}`);
  }

  // 5. ค่าที่ไม่ใช่ตัวเลขบวก finite ต้องโดนทิ้ง (ซ่อมไม่ได้)
  {
    const input = [candle(10, 11, 9, 10.5, 0), candle(NaN, 11, 9, 10, 1), candle(10, 11, 0, 10.2, 2), candle(10.2, 11, 10, 10.4, 3)];
    const r = sanitize(input, 'CRYPTO');
    check('NaN/ศูนย์ถูกทิ้ง เหลือแท่งดี 2', r.candles.length === 2 && r.dropped === 2, `เหลือ ${r.candles.length} dropped ${r.dropped}`);
  }

  // 6. เพดานเป็นรายตลาด: กระโดด 10% แล้วถอยกลับ — เกินเพดาน FOREX (6.5%) แต่ใต้เพดาน GOLD (18%)
  {
    const mk = (i0) => [candle(100, 100.5, 99.5, 100, i0), candle(110, 110.5, 109.5, 110, i0 + 1), candle(100, 100.5, 99.5, 100.1, i0 + 2)];
    const rf = sanitize(mk(0), 'FOREX');
    const rg = sanitize(mk(0), 'GOLD');
    check('กระโดด 10% ถอยกลับ: FOREX ทิ้ง', rf.dropped === 1 && rf.candles.length === 2, `ได้ dropped ${rf.dropped}`);
    check('กระโดด 10% ถอยกลับ: GOLD เก็บ', rg.dropped === 0 && rg.candles.length === 3, `ได้ dropped ${rg.dropped}`);
  }

  // 7. กระโดดแรงแต่ "ยืนระดับใหม่" (ไม่ถอยกลับ) ต้องรอด — นั่นคือตลาดวิ่งจริง ไม่ใช่ข้อมูลเสีย
  {
    const input = [candle(1, 1.01, 0.99, 1.0, 0), candle(1.09, 1.1, 1.085, 1.095, 1), candle(1.096, 1.1, 1.09, 1.098, 2)];
    const r = sanitize(input, 'FOREX');
    check('กระโดดจริงยืนระดับใหม่ต้องรอด', r.dropped === 0 && r.candles.length === 3, `ได้ dropped ${r.dropped}`);
  }

  return failures;
}

console.log('── กติกาของด่าน (ยิงใส่ sanitizeCandles ตัวจริง) ──');
runRuleSuite(sanitizer.sanitizeCandles, true);

console.log('── negative control: ตัวปลอมที่ไม่กรองอะไรเลย ต้องสอบตก ──');
{
  // ถ้าใครปิดด่าน (ให้มันส่งข้อมูลผ่านเฉย ๆ) ชุดยืนยันข้างบนต้องจับได้ —
  // รันชุดเดียวกันใส่ตัวปลอมแล้วนับว่ามีข้อแดงจริง ถ้าตัวปลอมผ่านหมดแปลว่าเทสต์ไร้ฟัน
  const bypass = (candles) => ({ candles: [...candles], dropped: 0, repaired: 0 });
  const failures = runRuleSuite(bypass, false);
  t('ตัวปลอมต้องสอบตกอย่างน้อย 3 ข้อ', failures.length >= 3, `ตกแค่ ${failures.length} ข้อ`);
}

console.log('── ด่านเสียบอยู่จริงใน fetchChart (market-data.ts ตัวจริง) ──');
{
  // จำลอง Yahoo ด้วย fetch ปลอม: 60 แท่งสะอาด + แท่งกรอบผิด 1 (index 10) + แท่งระดับผิด 1 (index 30)
  // ถ้าใครถอด sanitizeCandles ออกจาก fetchChart เทสต์ข้อนี้จะแดงทันที
  const N = 60;
  const open = [];
  const high = [];
  const low = [];
  const close = [];
  const volume = [];
  const timestamp = [];
  let level = 1.0;
  for (let i = 0; i < N; i++) {
    let o = level;
    let c = level * (1 + Math.sin(i / 4) * 0.002);
    let h = Math.max(o, c) * 1.001;
    let l = Math.min(o, c) * 0.999;
    if (i === 10) h = Math.max(o, c) * 0.9995; // กรอบผิด: high ต่ำกว่า close → ต้องถูกซ่อม
    if (i === 30) {
      // ระดับผิดทั้งแท่ง: วาร์ปขึ้น 10% แล้วแท่ง 31 กลับระดับเดิม → ต้องถูกทิ้ง
      o = level * 1.1; c = level * 1.1; h = c * 1.001; l = o * 0.999;
    }
    open.push(o); high.push(h); low.push(l); close.push(c); volume.push(0);
    timestamp.push(1767225600 + i * 86400);
    if (i !== 30) level = c;
  }
  const payload = {
    chart: {
      result: [{
        meta: { regularMarketPrice: close[N - 1], currentTradingPeriod: { regular: { start: timestamp[N - 1] } } },
        timestamp,
        indicators: { quote: [{ open, high, low, close, volume }] },
      }],
    },
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => payload });
  let chart;
  try {
    chart = await marketData.fetchChart('EURUSD', 'FOREX', '1d', '1y');
  } finally {
    globalThis.fetch = realFetch;
  }

  t('แท่งระดับผิดถูกทิ้งก่อนออกจาก fetchChart', chart.candles.length === N - 1, `ได้ ${chart.candles.length}/${N}`);
  t('ไม่มีแท่งไหนเหลือ close นอกกรอบ high-low', chart.candles.every((c) => c.close <= c.high && c.close >= c.low && c.open <= c.high && c.open >= c.low));
  t('แท่งกรอบผิดถูกซ่อม ไม่ใช่ทิ้ง (index 10 ยังอยู่)', chart.candles.some((c) => c.timestamp === new Date(timestamp[10] * 1000).toISOString()));
  t('แท่งที่เหลือยังพอวิเคราะห์ (≥ 50)', chart.candles.length >= 50, `ได้ ${chart.candles.length}`);
}

console.log('── ด่านเสียบอยู่จริงในสำเนา (ตรวจระดับซอร์ส) ──');
{
  // สำเนาที่ parity คุมเชิงพฤติกรรมแล้ว ยังต้องยืนยันว่า "ถูกเรียกจริง" ในเส้นทางของไฟล์นั้น
  // — parity พิสูจน์ว่ากติกาตรงกัน แต่พิสูจน์ไม่ได้ว่ามีใครเรียกมัน
  const resolver = readFileSync(path.join(ROOT, 'scripts', 'resolve-signals.mjs'), 'utf8');
  t('resolve-signals.mjs เรียก sanitizeBars ใน fetchCandles', /sanitizeBars\(out, market\)/.test(resolver));
  const edge = readFileSync(path.join(ROOT, 'supabase', 'functions', 'scan-signals', 'index.ts'), 'utf8');
  t('Edge scan-signals เรียก sanitizeCandles ใน fetchChart ของตัวเอง', /sanitizeCandles\(rawCandles, market\)/.test(edge));
  const engine = readFileSync(path.join(ROOT, 'src', 'lib', 'signal-engine.ts'), 'utf8');
  t('generateSignal กรองซ้ำที่ทางเข้า (ด่านชั้นสอง)', /sanitizeCandles\(input\.candles, market\)/.test(engine));
}

// ── โบนัสเมื่อรันบนเครื่องที่มีแคชวิจัย: ยิงกับไฟล์ EURUSD จริงทั้งชุด ──
// CI ไม่มีแคช (.research-cache อยู่ใน .gitignore) จึงข้ามอย่างเงียบไม่ได้ — ต้องบอกว่าข้าม
const CACHE = path.join(ROOT, '.research-cache', 'candles', 'FOREX__EURUSD__1D.json');
if (existsSync(CACHE)) {
  console.log('── เคสจริงจากแคชทั้งไฟล์ (เครื่องนี้มี .research-cache) ──');
  const j = JSON.parse(readFileSync(CACHE, 'utf8'));
  const input = j.candles.map((c) => ({ timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 }));
  const r = sanitizer.sanitizeCandles(input, 'FOREX');
  const gone = !r.candles.some((c) => String(c.timestamp).startsWith('2008-02-08'));
  const kept = r.candles.some((c) => String(c.timestamp).startsWith('2008-02-07')) && r.candles.some((c) => String(c.timestamp).startsWith('2008-02-11'));
  t('2008-02-08 หายจากชุดจริง', gone);
  t('เพื่อนบ้าน 02-07 / 02-11 ยังอยู่', kept);
  t('ทิ้งน้อยกว่า 0.1% ของทั้งไฟล์ (ด่านไม่กินข้อมูลจริง)', r.dropped <= Math.ceil(input.length * 0.001), `ทิ้ง ${r.dropped}/${input.length}`);
} else {
  console.log('(ข้ามเคสแคชทั้งไฟล์ — เครื่องนี้ไม่มี .research-cache ซึ่งเป็นเรื่องปกติบน CI)');
}

console.log('');
console.log(`ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail) process.exitCode = 1;
