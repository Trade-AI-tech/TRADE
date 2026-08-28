#!/usr/bin/env node
/**
 * check-scan-parity.mjs
 * ตรวจว่า "สำเนา" เครื่องคำนวณสัญญาณใน Supabase Edge Function (scan-signals)
 * ยังตรงกับต้นฉบับ src/lib/indicators.ts และ src/lib/signal-engine.ts
 *
 * วิธีรัน
 *   npm run check:parity:scan
 *   node scripts/check-scan-parity.mjs
 *   node scripts/check-scan-parity.mjs --wait=180        รอไฟล์ฝั่ง Edge โผล่ก่อน (วินาที)
 *   PARITY_SCAN_EDGE_FILE=path/to/index.ts node scripts/check-scan-parity.mjs
 *
 * ทำไมต้องมีไฟล์นี้ (เหตุผลเดียวกับ check-monitor-parity.mjs)
 *   Edge Function ต้อง deploy ผ่านหน้า Dashboard แบบไฟล์เดียวจบ จึงเลี่ยงไม่ได้ที่
 *   ตรรกะคำนวณสัญญาณ BUY/SELL จะมีอยู่ "สองที่" — สิ่งที่เลี่ยงได้คือสำเนาเพี้ยนแบบเงียบ ๆ
 *   สคริปต์นี้ตรวจ 2 ชั้น:
 *     ชั้นข้อความ  — บล็อกระหว่าง marker ต้องเหมือนต้นฉบับทุกตัวอักษร
 *                    (ข้อตกลงกับผู้เขียน Edge: บล็อกสำเนาเริ่ม "หลังบรรทัด import"
 *                    จึงตัดบรรทัด import ของต้นฉบับออกก่อนเทียบ)
 *     ชั้นพฤติกรรม — โหลดทั้งสองฝั่งเป็นโมดูลจริง รัน generateSignal ด้วยแท่งเทียน
 *                    สังเคราะห์ชุดเดียวกัน แล้วเทียบผลทุกฟิลด์
 *                    ยกเว้น id (uuid สุ่มใหม่ทุกครั้ง — ตรวจแค่ว่าเป็น uuid จริง)
 *                    และ created_at/expires_at (ประทับเวลา ณ ตอนรัน — ยอมให้ต่างได้ไม่เกิน 5 วินาที)
 *
 * marker ที่ตกลงกันไว้ (ขึ้นต้นบรรทัดพอดี อย่างละหนึ่งบรรทัดต่อไฟล์ ต่อท้ายคอมเมนต์เพิ่มได้):
 *     // >>> BEGIN COPY OF src/lib/indicators.ts
 *     // <<< END COPY OF src/lib/indicators.ts
 *     // >>> BEGIN COPY OF src/lib/signal-engine.ts
 *     // <<< END COPY OF src/lib/signal-engine.ts
 *
 * สคริปต์นี้ไม่เขียนไฟล์ลงในโปรเจกต์เลย ไฟล์ชั่วคราวทั้งหมดอยู่ใน os.tmpdir() และถูกลบทิ้งเสมอ
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ไฟล์ต้นฉบับที่ฝั่ง Edge ต้องมีสำเนาครบทุกไฟล์ ตามลำดับพึ่งพา
 * (engine ใช้ indicators และ candle-sanitizer — สองตัวหลังจึงต้องมาก่อนตอนโหลดเป็นโมดูล)
 * candle-sanitizer เข้ามาเมื่อ 2026-08-28 ตอน generateSignal เริ่มกรองแท่งเสียก่อนคำนวณ —
 * ถ้าไม่บังคับสำเนาที่นี่ ฝั่ง Edge จะ ReferenceError ตอนรันจริงโดยไม่มีด่านไหนจับได้ก่อน deploy
 */
const CANONICAL_FILES = [
  { rel: 'src/lib/candle-sanitizer.ts', abs: path.join(ROOT, 'src', 'lib', 'candle-sanitizer.ts') },
  { rel: 'src/lib/indicators.ts', abs: path.join(ROOT, 'src', 'lib', 'indicators.ts') },
  { rel: 'src/lib/signal-engine.ts', abs: path.join(ROOT, 'src', 'lib', 'signal-engine.ts') },
];

const DEFAULT_EDGE_REL = 'supabase/functions/scan-signals/index.ts';

/** ชื่อที่ทั้งสองฝั่งต้องมี ถ้าโหลดแล้วไม่เจอถือว่าสอบตกทันที */
const REQUIRED_EXPORTS = ['generateSignal'];

/**
 * seed ตายตัว — ห้ามใช้ Math.random เป็นแหล่งเคส
 * ถ้าเคสไม่ซ้ำเดิม CI จะเขียวบ้างแดงบ้างโดยที่โค้ดไม่เปลี่ยน แล้วคนจะเลิกเชื่อผลของมัน
 */
const SEED = 0x5ca9_2026;

// ───────────────────────────────── อ่านอาร์กิวเมนต์ ─────────────────────────────────

const rawWait = process.argv.find((a) => a.startsWith('--wait='));
const requestedWait = rawWait ? Number(rawWait.slice('--wait='.length)) : 0;
/** เพดาน 10 นาที กันพิมพ์เลขผิดแล้วสคริปต์ค้างยาวใน CI */
const WAIT_SECONDS = Number.isFinite(requestedWait) ? Math.min(600, Math.max(0, Math.floor(requestedWait))) : 0;

// ───────────────────────────────── ยูทิลิตี้ทั่วไป ─────────────────────────────────

function fail(message) {
  console.error(`\n[ล้มเหลว] ${message}\n`);
  process.exit(1);
}

/**
 * แปลงค่าเป็นสตริงที่ "เท่ากันก็ต้องได้สตริงเดียวกัน" ใช้ทั้งเทียบผลและพิมพ์รายงาน
 * JSON.stringify ตรง ๆ ใช้ไม่ได้เพราะ NaN/Infinity กลายเป็น null, -0 กลายเป็น 0
 * และ undefined หายทั้งคีย์ — สามอย่างนี้คือความต่างที่เราอยากจับพอดี
 */
function canon(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const t = typeof value;
  if (t === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (Object.is(value, -0)) return '-0';
    return String(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (t === 'boolean' || t === 'bigint') return String(value);
  if (t === 'function') return `function ${value.name || 'anonymous'}`;
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`;
  }
  return String(value);
}

/** mulberry32 — PRNG เล็ก ๆ ที่ให้ลำดับเดิมทุกครั้งเมื่อ seed เท่าเดิม */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────── หาไฟล์ Edge Function ให้เจอ ───────────────────────────

function edgeFilePath() {
  if (process.env.PARITY_SCAN_EDGE_FILE) return path.resolve(ROOT, process.env.PARITY_SCAN_EDGE_FILE);
  return path.join(ROOT, ...DEFAULT_EDGE_REL.split('/'));
}

/**
 * ไฟล์ฝั่ง Edge อาจยังเขียนไม่เสร็จ (งานคู่ขนาน) จึงมีโหมดรอ: --wait=<วินาที>
 * เช็คทุก 5 วินาที ถ้าหมดเวลาแล้วยังไม่มา ให้ล้มเหลวเสียงดัง — ไม่ผ่านแบบเงียบเด็ดขาด
 * เพราะ "ไม่มีไฟล์ให้ตรวจ" แปลว่ายังไม่มีใครยืนยันได้ว่าสำเนาตรงกับต้นฉบับ
 */
async function waitForEdgeFile() {
  const p = edgeFilePath();
  if (existsSync(p)) return p;
  if (WAIT_SECONDS > 0) {
    console.log(`ยังไม่พบไฟล์ฝั่ง Edge — รอสูงสุด ${WAIT_SECONDS} วินาที (เช็คทุก 5 วินาที)`);
    const deadline = Date.now() + WAIT_SECONDS * 1000;
    while (Date.now() < deadline) {
      await sleep(Math.min(5000, Math.max(250, deadline - Date.now())));
      if (existsSync(p)) return p;
    }
  }
  fail(
    [
      `ยังไม่มีไฟล์ให้ตรวจ: ${path.relative(ROOT, p)}`,
      '',
      'สำเนาเครื่องคำนวณสัญญาณฝั่ง Edge Function ยังไม่ถูกเขียน (หรืออยู่คนละพาธ)',
      'ถ้าไฟล์อยู่ที่อื่น สั่งได้ด้วย PARITY_SCAN_EDGE_FILE=<พาธ> npm run check:parity:scan',
      'ถ้ากำลังรอไฟล์จากงานคู่ขนาน ใช้ node scripts/check-scan-parity.mjs --wait=180',
      '',
      'ตราบใดที่ยังไม่มีไฟล์ จะไม่มีใครยืนยันได้ว่าสำเนาตรงกับต้นฉบับ จึงถือว่าไม่ผ่าน',
    ].join('\n')
  );
}

// ─────────────────────── ตัดบรรทัด import ของต้นฉบับก่อนเทียบ ───────────────────────

/**
 * ข้อตกลงกับผู้เขียน Edge Function: บล็อกสำเนาเริ่ม "หลังบรรทัด import" ของต้นฉบับ
 * (ไฟล์เดียวจบ import ข้ามไฟล์ไม่ได้อยู่แล้ว) ฝั่งเราจึงต้องตัด import ออกให้เหลือ
 * เนื้อเดียวกันก่อนเทียบ — รองรับ import หลายบรรทัด (ของ signal-engine.ts มีจริง)
 * โดยกินตั้งแต่บรรทัดที่ขึ้นต้นด้วย import ไปจนถึงบรรทัดที่จบ statement ด้วย ';'
 */
function stripImports(source) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*import\b/.test(lines[i])) {
      while (i < lines.length && !/;\s*$/.test(lines[i])) i++;
      i++; // ข้ามบรรทัดที่ปิด statement ด้วย
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join('\n');
}

// ─────────────────────────── ดึงบล็อกสำเนาออกจากฝั่ง Edge ───────────────────────────

const beginMarkerOf = (rel) => `// >>> BEGIN COPY OF ${rel}`;
const endMarkerOf = (rel) => `// <<< END COPY OF ${rel}`;

const MARKER_HOWTO = [
  'ให้ฝั่ง Edge Function คั่นบล็อกที่คัดลอกมาด้วยคอมเมนต์รูปแบบนี้ (ขึ้นต้นบรรทัดพอดี',
  'อย่างละหนึ่งบรรทัดต่อไฟล์ — ต่อท้ายด้วยคำอธิบายเพิ่มได้ เช่น "— ห้ามแก้เฉพาะที่นี่"):',
  '',
  ...CANONICAL_FILES.flatMap((f) => [
    `    ${beginMarkerOf(f.rel)}`,
    `    ... เนื้อ ${f.rel} หลังบรรทัด import ...`,
    `    ${endMarkerOf(f.rel)}`,
  ]),
].join('\n');

/**
 * ต้องเทียบด้วย startsWith กับบรรทัดดิบ ห้าม trim และห้าม includes()
 * เพราะหัวไฟล์ฝั่ง Edge มักมีคอมเมนต์ที่ "ยกตัวอย่าง" marker เอาไว้ (ตัวอย่างจะมี
 * ช่องว่างหรือ * นำหน้า จึงไม่ผ่าน startsWith) — แบบเดียวกับ check-monitor-parity.mjs
 */
function extractBlock(edgeSource, rel) {
  const lines = edgeSource.split(/\r?\n/);
  const BEGIN = beginMarkerOf(rel);
  const END = endMarkerOf(rel);
  const begins = [];
  const ends = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(BEGIN)) begins.push(i);
    else if (lines[i].startsWith(END)) ends.push(i);
  }
  if (begins.length !== 1 || ends.length !== 1) {
    return {
      ok: false,
      reason: `marker ของ ${rel} ต้องมี BEGIN/END อย่างละ 1 บรรทัด แต่พบ BEGIN ${begins.length} / END ${ends.length}`,
    };
  }
  if (ends[0] < begins[0]) return { ok: false, reason: `marker ปิดของ ${rel} อยู่ก่อน marker เปิด` };

  return {
    ok: true,
    source: lines.slice(begins[0] + 1, ends[0]).join('\n'),
    fromLine: begins[0] + 1,
    toLine: ends[0] + 1,
  };
}

/**
 * เทียบข้อความแบบตัวอักษรต่อตัวอักษร (หลัง normalize บรรทัดจบและ trim หัวท้ายทั้งก้อน)
 * คืน null ถ้าเหมือนกัน หรือรายละเอียดบรรทัดแรกที่ต่างถ้าไม่เหมือน
 *
 * ทำไมยังต้องเทียบข้อความทั้งที่มีเทียบพฤติกรรมอยู่แล้ว: ตารางเคสครอบได้เยอะ
 * แต่ไม่มีวันครบทุกกิ่ง ส่วนสำเนาที่เหมือนทุกตัวอักษรนั้นพิสูจน์ตัวเองได้
 */
function compareVerbatim(expected, actual) {
  const norm = (s) => s.replace(/\r\n/g, '\n').trim();
  const a = norm(expected);
  const b = norm(actual);
  if (a === b) return null;

  const al = a.split('\n');
  const bl = b.split('\n');
  const max = Math.max(al.length, bl.length);
  for (let i = 0; i < max; i++) {
    if (al[i] !== bl[i]) {
      return { line: i + 1, canonical: al[i] ?? '(ไม่มีบรรทัดนี้)', edge: bl[i] ?? '(ไม่มีบรรทัดนี้)', aTotal: al.length, bTotal: bl.length };
    }
  }
  return { line: max, canonical: '(จบไฟล์)', edge: '(จบไฟล์)', aTotal: al.length, bTotal: bl.length };
}

// ─────────────────────────── โหลดทั้งสองฝั่งขึ้นมาเป็นโมดูล ───────────────────────────

const require = createRequire(import.meta.url);
let typescript = null;
try {
  typescript = require('typescript');
} catch {
  typescript = null; // ไม่มีก็ไม่เป็นไร ถอยไปใช้ type stripping ของ Node (22.6+)
}

/**
 * รวมสำเนา indicators + signal-engine เข้าเป็นโมดูลเดียว (ลำดับเดียวกับการพึ่งพา)
 * แล้วเขียนลงไฟล์ชั่วคราวเพื่อ import กลับเข้ามา
 *
 * ต่อท้ายด้วย __parity เสมอ เพราะฝั่ง Edge อาจถอด export ออก (ไฟล์เดียวจบไม่จำเป็นต้องมี)
 * การผูกชื่อเองจึงใช้ได้กับทั้งสองฝั่งโดยไม่ต้องแก้ซอร์ส
 */
async function loadSide(sources, label, tmpDir) {
  const wrapped = `${sources.join('\n\n')}\n\n// ผูกฟังก์ชันออกมาให้สคริปต์เรียกได้ ไม่ว่าซอร์สต้นทางจะ export ไว้หรือไม่\nexport const __parity = { ${REQUIRED_EXPORTS.join(', ')} };\n`;

  let file;
  if (typescript) {
    const out = typescript.transpileModule(wrapped, {
      fileName: `${label}.ts`,
      compilerOptions: {
        target: typescript.ScriptTarget.ES2022,
        module: typescript.ModuleKind.ESNext,
        removeComments: false,
      },
    }).outputText;
    file = path.join(tmpDir, `${label}.mjs`);
    writeFileSync(file, out, 'utf8');
  } else {
    file = path.join(tmpDir, `${label}.mts`);
    writeFileSync(file, wrapped, 'utf8');
  }

  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (err) {
    const hint = typescript
      ? ''
      : '\n(ไม่มี typescript ใน node_modules จึงพึ่ง type stripping ของ Node — ลอง `npm install` ก่อน)';
    fail(`โหลดโมดูลฝั่ง "${label}" ไม่สำเร็จ: ${err?.message ?? err}${hint}`);
  }

  const api = mod.__parity ?? {};
  for (const name of REQUIRED_EXPORTS) {
    if (typeof api[name] !== 'function') {
      fail(`ฝั่ง "${label}" ไม่มีฟังก์ชัน ${name} (ได้ ${typeof api[name]}) — บล็อกที่ดึงมาอาจไม่ครบ`);
    }
  }
  return api;
}

// ──────────────────────── แท่งเทียนสังเคราะห์แบบ deterministic ────────────────────────

/**
 * โปรไฟล์ราคา 5 แบบตามที่ตกลง: ขาขึ้นแรง / ขาลงแรง / ไซด์เวย์ / ราคาจิ๋ว / ราคาใหญ่
 * ราคาจิ๋ว 0.000006 มีไว้จับ regression ของ roundPrice (เลขนัยสำคัญกับเหรียญ meme)
 * ราคาใหญ่ 64986 มีไว้จับฝั่ง toFixed(4) กับตัวเลขระดับ BTC
 * drift เป็นสัดส่วน (คูณ) จึงราคาไม่มีวันติดลบ
 */
const PROFILES = {
  up: { label: 'ขาขึ้นแรง', base: 100, step: (i, rnd) => 0.009 + (rnd() - 0.5) * 0.01 },
  down: { label: 'ขาลงแรง', base: 250, step: (i, rnd) => -0.009 + (rnd() - 0.5) * 0.01 },
  side: { label: 'ไซด์เวย์', base: 50, step: (i, rnd) => Math.sin(i / 7) * 0.004 + (rnd() - 0.5) * 0.008 },
  tiny: { label: 'ราคาจิ๋ว 0.000006', base: 0.000006, step: (i, rnd) => Math.sin(i / 9) * 0.01 + (rnd() - 0.5) * 0.02 + 0.001 },
  big: { label: 'ราคาใหญ่ 64986', base: 64986, step: (i, rnd) => (i % 20 < 10 ? 0.004 : -0.003) + (rnd() - 0.5) * 0.012 },
};

/** hash สตริงแบบง่าย (FNV-1a) ใช้ผสมชื่อโปรไฟล์เข้ากับ seed หลักให้แต่ละชุดไม่ซ้ำกันแต่คงที่ */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeCandles(profileKey, length) {
  const profile = PROFILES[profileKey];
  const rnd = mulberry32((SEED ^ fnv1a(profileKey) ^ (length * 0x9e37)) >>> 0);
  const baseEpoch = Date.UTC(2026, 0, 5, 0, 0, 0);
  const dayMs = 86400000;

  const candles = [];
  let prevClose = profile.base;
  for (let i = 0; i < length; i++) {
    const open = prevClose;
    const close = open * (1 + profile.step(i, rnd));
    const wick = Math.abs(close / open - 1) * 0.6 + 0.004;
    const high = Math.max(open, close) * (1 + rnd() * wick);
    const low = Math.min(open, close) * (1 - rnd() * wick);
    candles.push({
      timestamp: new Date(baseEpoch + i * dayMs).toISOString(),
      open,
      high,
      low,
      close,
      volume: Math.round(1000 + rnd() * 50000),
    });
    prevClose = close;
  }
  return candles;
}

/**
 * ตารางเคส: 5 โปรไฟล์ × 3 ความยาว (60/120/260) × 3 ตัวแปรแวดล้อม = 45 เคส
 * บวกเคสสั้นกว่า 50 แท่ง (ต้องคืน null เหมือนกันทั้งสองฝั่ง) — เกินขั้นต่ำ 30 ชุดที่ตกลง
 *
 * ความยาว 260 สำคัญเพราะเปิดกิ่ง MA200 / ความยาว 60-120 เดินกิ่ง "ข้อมูลไม่ถึง 200 แท่ง"
 * ตลาดสลับทั้ง FOREX (ทศนิยม 5) และไม่ใช่ FOREX (toFixed 4 / เลขนัยสำคัญ 6)
 * เพื่อให้ roundPrice ถูกทดสอบครบทุกกิ่งกับทุกระดับราคา
 */
function buildCases() {
  const lengths = [60, 120, 260];
  const markets = {
    up: ['US_STOCK', 'CRYPTO', 'TH_STOCK'],
    down: ['FOREX', 'US_STOCK', 'GOLD'],
    side: ['TH_STOCK', 'GOLD', 'FOREX'],
    tiny: ['CRYPTO', 'CRYPTO', 'FOREX'],
    big: ['CRYPTO', 'GOLD', 'US_STOCK'],
  };
  const variants = [
    { timeframe: '1D', newsSentiment: undefined },
    { timeframe: '1H', newsSentiment: 0.8 },
    { timeframe: '1D', newsSentiment: -0.75 },
  ];

  const cases = [];
  for (const [key, profile] of Object.entries(PROFILES)) {
    for (const length of lengths) {
      const candles = makeCandles(key, length);
      variants.forEach((variant, vi) => {
        cases.push({
          name: `${profile.label}/${length} แท่ง/${variant.timeframe}${variant.newsSentiment !== undefined ? `/news ${variant.newsSentiment}` : ''}`,
          input: {
            symbol: `TEST-${key.toUpperCase()}`,
            name: `ชุดทดสอบ ${profile.label}`,
            market: markets[key][vi],
            candles,
            timeframe: variant.timeframe,
            newsSentiment: variant.newsSentiment,
          },
        });
      });
    }
  }

  // สั้นกว่า 50 แท่ง → ทั้งสองฝั่งต้องคืน null ตรงกัน (จับกรณีสำเนาแก้เกณฑ์ขั้นต่ำ)
  cases.push({
    name: 'สั้นกว่าเกณฑ์/49 แท่ง → ต้อง null',
    input: { symbol: 'TEST-SHORT', name: 'ชุดทดสอบสั้นเกิน', market: 'CRYPTO', candles: makeCandles('up', 49), timeframe: '1D' },
  });
  cases.push({
    name: 'สั้นกว่าเกณฑ์/10 แท่ง → ต้อง null',
    input: { symbol: 'TEST-SHORT10', name: 'ชุดทดสอบสั้นมาก', market: 'FOREX', candles: makeCandles('side', 10), timeframe: '1H' },
  });

  return cases;
}

// ───────────────────────────────── เรียกและเทียบผล ─────────────────────────────────

/**
 * เรียกด้วยสำเนาอินพุตของตัวเอง — โคลนแยกเพราะถ้าฝั่งไหนแอบแก้ input
 * อีกฝั่งจะได้ข้อมูลที่ถูกแก้แล้ว ผลจะเพี้ยนตามลำดับการเรียก
 * ส่ง argsAfter กลับไปเทียบด้วย — generateSignal ต้องไม่แก้ input ถ้าฝั่งไหนแก้ต้องรู้
 */
function invoke(api, testCase) {
  const input = structuredClone(testCase.input);
  let result;
  try {
    result = { threw: false, value: api.generateSignal(input) };
  } catch (err) {
    result = { threw: true, name: err?.name ?? 'Error', message: String(err?.message ?? err) };
  }
  return { result, argsAfter: input };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ฟิลด์เวลาที่ประทับ ณ ตอนรัน — เทียบตรง ๆ ไม่ได้ ใช้เกณฑ์ "ห่างกันไม่เกิน 5 วินาที" แทน */
const TIME_FIELDS = new Set(['created_at', 'expires_at']);
const TIME_TOLERANCE_MS = 5000;

/**
 * เทียบผลของสองฝั่งแบบฟิลด์ต่อฟิลด์ คืนรายการความต่าง (ว่าง = ตรงกัน)
 * - id: ไม่เทียบค่า (uuid สุ่มใหม่ทุกครั้ง) แต่ตรวจว่าทั้งสองฝั่งเป็น uuid จริง
 * - created_at/expires_at: ต่างได้ไม่เกิน 5 วินาที (สองฝั่งถูกเรียกติดกันในกระบวนการเดียว)
 * - ข้อความ error ไม่เทียบ เพราะถ้อยคำต่างได้โดยพฤติกรรมเหมือนกัน แต่ชนิด error ต้องตรง
 */
function diffResults(a, b) {
  const diffs = [];

  if (a.result.threw || b.result.threw) {
    if (a.result.threw !== b.result.threw) {
      const thrower = a.result.threw ? 'ต้นฉบับ' : 'สำเนา';
      const t = a.result.threw ? a.result : b.result;
      diffs.push(`ฝั่ง${thrower}โยน ${t.name}: ${t.message} — อีกฝั่งคืนค่าปกติ`);
    } else if (a.result.name !== b.result.name) {
      diffs.push(`ชนิด error ต่างกัน: ต้นฉบับ ${a.result.name} / สำเนา ${b.result.name}`);
    }
    return diffs;
  }

  const av = a.result.value;
  const bv = b.result.value;
  if (av === null || bv === null) {
    if (av !== bv) diffs.push(`ต้นฉบับคืน ${av === null ? 'null' : 'สัญญาณ'} แต่สำเนาคืน ${bv === null ? 'null' : 'สัญญาณ'}`);
    return diffs;
  }
  if (typeof av !== 'object' || typeof bv !== 'object') {
    if (canon(av) !== canon(bv)) diffs.push(`ชนิดผลลัพธ์ต่างกัน: ต้นฉบับ=${canon(av)} สำเนา=${canon(bv)}`);
    return diffs;
  }

  const keys = [...new Set([...Object.keys(av), ...Object.keys(bv)])].sort();
  for (const k of keys) {
    const inA = k in av;
    const inB = k in bv;
    if (inA !== inB) {
      diffs.push(`ฟิลด์ ${k}: มีเฉพาะฝั่ง${inA ? 'ต้นฉบับ' : 'สำเนา'}`);
      continue;
    }
    if (k === 'id') {
      if (!UUID_RE.test(String(av.id))) diffs.push(`id ฝั่งต้นฉบับไม่ใช่ uuid: ${canon(av.id)}`);
      if (!UUID_RE.test(String(bv.id))) diffs.push(`id ฝั่งสำเนาไม่ใช่ uuid: ${canon(bv.id)}`);
      continue;
    }
    if (TIME_FIELDS.has(k)) {
      if (av[k] === null && bv[k] === null) continue;
      const ta = Date.parse(av[k]);
      const tb = Date.parse(bv[k]);
      if (!Number.isFinite(ta) || !Number.isFinite(tb)) {
        diffs.push(`ฟิลด์ ${k}: อ่านเป็นเวลาไม่ได้ — ต้นฉบับ=${canon(av[k])} สำเนา=${canon(bv[k])}`);
      } else if (Math.abs(ta - tb) > TIME_TOLERANCE_MS) {
        diffs.push(`ฟิลด์ ${k}: เวลาห่างกัน ${Math.abs(ta - tb)} ms (เกิน ${TIME_TOLERANCE_MS} ms) — ต้นฉบับ=${av[k]} สำเนา=${bv[k]}`);
      }
      continue;
    }
    if (canon(av[k]) !== canon(bv[k])) {
      diffs.push(`ฟิลด์ ${k}: ต้นฉบับ=${canon(av[k])} สำเนา=${canon(bv[k])}`);
    }
  }

  if (canon(a.argsAfter) !== canon(b.argsAfter)) {
    diffs.push('อินพุตหลังเรียกไม่เหมือนกัน แปลว่ามีฝั่งหนึ่งไปแก้ค่า input');
  }
  return diffs;
}

// ───────────────────────────────────── main ─────────────────────────────────────

async function main() {
  for (const f of CANONICAL_FILES) {
    if (!existsSync(f.abs)) fail(`หาไฟล์ต้นฉบับไม่เจอ: ${f.abs}`);
  }

  const edgeFile = await waitForEdgeFile();
  const edgeSource = readFileSync(edgeFile, 'utf8');

  console.log('ต้นฉบับ :', CANONICAL_FILES.map((f) => f.rel).join(' + '));
  console.log('สำเนา   :', path.relative(ROOT, edgeFile));

  // ดึงบล็อกสำเนาทั้งสองไฟล์จากฝั่ง Edge — marker เป๊ะตามข้อตกลงเท่านั้น
  const blocks = {};
  for (const f of CANONICAL_FILES) {
    const extracted = extractBlock(edgeSource, f.rel);
    if (!extracted.ok) fail(`${extracted.reason}\n\n${MARKER_HOWTO}`);
    console.log(`บล็อกสำเนา ${f.rel}: บรรทัด ${extracted.fromLine}-${extracted.toLine}`);
    blocks[f.rel] = extracted;
  }

  let exitCode = 0;

  // ชั้นที่ 1: เทียบข้อความ (ตัดบรรทัด import ของต้นฉบับออกก่อนตามข้อตกลง)
  const textDiffs = [];
  for (const f of CANONICAL_FILES) {
    const expected = stripImports(readFileSync(f.abs, 'utf8'));
    const diff = compareVerbatim(expected, blocks[f.rel].source);
    if (diff) {
      textDiffs.push({ rel: f.rel, diff });
      console.log(`เทียบข้อความ ${f.rel}: ต่างกัน`);
    } else {
      console.log(`เทียบข้อความ ${f.rel}: เหมือนต้นฉบับทุกตัวอักษร (หลังตัด import)`);
    }
  }

  if (textDiffs.length > 0) {
    exitCode = 1;
    for (const { rel, diff } of textDiffs) {
      console.error('');
      console.error(`[ไม่ผ่าน] ข้อความบล็อกสำเนา ${rel} ไม่ตรงกับต้นฉบับ (บรรทัดแรกที่ต่าง: ${diff.line})`);
      console.error(`   ต้นฉบับ : ${diff.canonical}`);
      console.error(`   สำเนา   : ${diff.edge}`);
      console.error(`   จำนวนบรรทัด ต้นฉบับ ${diff.aTotal} / สำเนา ${diff.bTotal}`);
    }
  }

  // ชั้นที่ 2: เทียบพฤติกรรม — โหลดสองฝั่งเป็นโมดูลแล้วรันชุดแท่งเทียนเดียวกัน
  // ทำต่อแม้ข้อความต่าง เพราะรายงาน "ผลลัพธ์ยังตรง/ไม่ตรง" ช่วยบอกความหนักเบาของปัญหา
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'scan-parity-'));
  try {
    const canonicalSources = CANONICAL_FILES.map((f) => stripImports(readFileSync(f.abs, 'utf8')));
    const edgeSources = CANONICAL_FILES.map((f) => blocks[f.rel].source);

    const canonical = await loadSide(canonicalSources, 'canonical', tmpDir);
    const edge = await loadSide(edgeSources, 'edge', tmpDir);

    const cases = buildCases();
    const failures = [];
    /** นับ action ฝั่งต้นฉบับไว้โชว์ในสรุป — เป็นหลักฐานว่าตารางเคสเดินครบทั้งกิ่ง BUY/SELL/HOLD
     *  ไม่ใช่ผ่านเพราะทุกเคสตกกิ่งเดียวกันหมด (ซึ่งจะทำให้การเทียบไร้ความหมายแบบเงียบ ๆ) */
    const actionCounts = { BUY: 0, SELL: 0, HOLD: 0, null: 0 };

    for (const testCase of cases) {
      const a = invoke(canonical, testCase);
      const b = invoke(edge, testCase);
      const diffs = diffResults(a, b);
      if (diffs.length > 0) failures.push({ testCase, diffs, a, b });
      if (!a.result.threw) {
        const key = a.result.value === null ? 'null' : a.result.value.action;
        actionCounts[key] = (actionCounts[key] ?? 0) + 1;
      }
    }

    console.log('');
    console.log(`เคสที่ตรวจ : ${cases.length} ชุดแท่งเทียน`);
    console.log(
      `ฝั่งต้นฉบับ: BUY ${actionCounts.BUY} / SELL ${actionCounts.SELL} / HOLD ${actionCounts.HOLD} / null ${actionCounts.null}`
    );

    if (failures.length === 0) {
      console.log(`ผลลัพธ์    : ตรงกันทุกฟิลด์ทั้ง ${cases.length} เคส (ยกเว้น id และเวลา ตามเกณฑ์ที่ตกลง)`);
    } else {
      exitCode = 1;
      const SHOW = 12;
      console.error('');
      console.error(`[ไม่ผ่าน] ผลลัพธ์ไม่ตรงกัน ${failures.length} เคส จาก ${cases.length}`);
      console.error('');
      for (const f of failures.slice(0, SHOW)) {
        console.error(`── เคส: ${f.testCase.name}`);
        console.error(`   ตลาด/timeframe: ${f.testCase.input.market} / ${f.testCase.input.timeframe}`);
        for (const d of f.diffs.slice(0, 8)) console.error(`   - ${d}`);
        if (f.diffs.length > 8) console.error(`   ...และอีก ${f.diffs.length - 8} ฟิลด์`);
        console.error('');
      }
      if (failures.length > SHOW) console.error(`   ...และอีก ${failures.length - SHOW} เคส\n`);
    }

    if (textDiffs.length > 0 && failures.length === 0) {
      console.error('');
      console.error('ข้อความต่างแต่ผลลัพธ์ยังตรงทุกเคส = ตอนนี้ยังไม่พัง แต่สำเนาเลื่อนจากต้นฉบับแล้ว');
      console.error('ตารางเคสครอบได้เยอะแต่ไม่ครบทุกกิ่ง จึงไม่ปล่อยผ่าน');
    }

    if (exitCode === 0) {
      console.log('');
      console.log('[ผ่าน] สำเนาเครื่องคำนวณสัญญาณฝั่ง Edge Function ยังตรงกับต้นฉบับ');
      return;
    }

    console.error('');
    console.error('แก้โดยก๊อปเนื้อไฟล์ต้นฉบับ (หลังบรรทัด import) ทับระหว่าง marker ของไฟล์นั้นในฝั่ง Edge');
    console.error('อย่าแก้ตัวเลขที่คาดหวังในสคริปต์นี้ให้ตามสำเนา — ต้นฉบับคือกฎที่ชี้ขาดสัญญาณของผู้ใช้');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  if (exitCode !== 0) process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
