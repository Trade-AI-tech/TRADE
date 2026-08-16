#!/usr/bin/env node
/**
 * check-monitor-parity.mjs
 * ตรวจว่า "สำเนา" ตรรกะ SL/TP ที่อยู่ใน Supabase Edge Function
 * ยังให้ผลลัพธ์เหมือนต้นฉบับ src/lib/position-monitor.ts ทุกฟิลด์
 *
 * วิธีรัน
 *   npm run check:parity
 *   node scripts/check-monitor-parity.mjs
 *   node scripts/check-monitor-parity.mjs --random=5000        เพิ่มจำนวนเคสสุ่ม (ขั้นต่ำ 500)
 *   PARITY_EDGE_FILE=path/to/index.ts node scripts/check-monitor-parity.mjs
 *
 * ต้องการแค่ `node` ล้วน (ไม่ต้อง tsx) — ถ้ามี typescript ใน node_modules จะใช้ตัวนั้นลอกชนิดออก
 * ถ้าไม่มี จะถอยไปใช้ type stripping ของ Node เอง (Node 22.6+ / เปิดเป็นค่าเริ่มต้นตั้งแต่ 23.6)
 *
 * ทำไมต้องมีไฟล์นี้
 *   บัญชี Vercel ถูก pause ทำให้ /api/cron/monitor-positions ตอบ 402 ทั้งหมด
 *   งานเฝ้าราคาจึงย้ายไปอยู่บน Supabase Edge Function ซึ่ง deploy ผ่านหน้า Dashboard
 *   หน้า Dashboard มองไม่เห็นไฟล์ในโปรเจกต์ Edge Function จึงต้องเป็นไฟล์เดียวจบ
 *   แปลว่าตรรกะที่ชี้ขาดว่าออเดอร์ของผู้ใช้กำไร/ขาดทุนเท่าไร จะมีอยู่ "สองที่"
 *
 *   การมีสำเนาเลี่ยงไม่ได้ สิ่งที่เลี่ยงได้คือ "สำเนาเพี้ยนจากต้นฉบับโดยไม่มีใครรู้"
 *   สคริปต์นี้จึงโหลดทั้งสองฝั่งขึ้นมาเป็นโมดูลจริง แล้วป้อนตารางเคสชุดเดียวกัน
 *   ต่างกันแม้แต่ฟิลด์เดียว → exit 1 พร้อมโชว์เคสที่ต่าง
 *
 * สคริปต์นี้ไม่เขียนไฟล์ลงในโปรเจกต์เลย ไฟล์ชั่วคราวทั้งหมดอยู่ใน os.tmpdir() และถูกลบทิ้งเสมอ
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_FILE = path.join(ROOT, 'src', 'lib', 'position-monitor.ts');

/** ชื่อที่ทั้งสองฝั่งต้องมีเหมือนกัน ถ้าฝั่งไหนขาดไปถือว่าสอบตกทันที */
const REQUIRED_EXPORTS = ['resolvePriceWindow', 'evaluatePosition'];

/**
 * seed ตายตัว — ห้ามใช้ Math.random เพราะถ้าเคสสุ่มไม่ซ้ำเดิม
 * CI จะเขียวบ้างแดงบ้างโดยที่โค้ดไม่ได้เปลี่ยน แล้วคนจะเลิกเชื่อผลของมัน
 */
const SEED = 0x5eed_2026;

// ───────────────────────────────── อ่านอาร์กิวเมนต์ ─────────────────────────────────

const rawRandom = process.argv.find((a) => a.startsWith('--random='));
const requestedRandom = rawRandom ? Number(rawRandom.slice('--random='.length)) : 750;
/** ขั้นต่ำ 500 ตามข้อกำหนด กันไม่ให้ใครลดจำนวนเคสจนการตรวจอ่อนลงเงียบ ๆ */
const RANDOM_ITERATIONS = Number.isFinite(requestedRandom) ? Math.max(500, Math.floor(requestedRandom)) : 750;

// ───────────────────────────────── ยูทิลิตี้ทั่วไป ─────────────────────────────────

function fail(message) {
  console.error(`\n[ล้มเหลว] ${message}\n`);
  process.exit(1);
}

/**
 * แปลงค่าเป็นสตริงที่ "เท่ากันก็ต้องได้สตริงเดียวกัน" ใช้ทั้งเทียบผลและพิมพ์รายงาน
 * JSON.stringify ใช้ตรง ๆ ไม่ได้เพราะ NaN/Infinity กลายเป็น null, -0 กลายเป็น 0
 * และ undefined หายไปทั้งคีย์ — ความต่างสามอย่างนี้คือความต่างที่เราอยากจับพอดี
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

// ─────────────────────────── หาไฟล์ Edge Function ให้เจอ ───────────────────────────

/**
 * ไม่ล็อกพาธตายตัว เพราะโฟลเดอร์ฝั่ง Edge อาจถูกตั้งชื่อไม่ตรงกับที่คาด
 * ลำดับการหา: ตัวแปรแวดล้อม → พาธที่น่าจะเป็น → ไล่อ่านทุก function ว่าไฟล์ไหนมี evaluatePosition
 */
function findEdgeFile() {
  if (process.env.PARITY_EDGE_FILE) {
    const p = path.resolve(ROOT, process.env.PARITY_EDGE_FILE);
    if (!existsSync(p)) fail(`PARITY_EDGE_FILE ชี้ไปที่ไฟล์ที่ไม่มีอยู่จริง: ${p}`);
    return p;
  }

  const candidates = [
    'supabase/functions/monitor-positions/index.ts',
    'supabase/functions/monitor_positions/index.ts',
    'supabase/functions/position-monitor/index.ts',
    'supabase/functions/monitor-positions/index.js',
  ];
  for (const rel of candidates) {
    const p = path.join(ROOT, ...rel.split('/'));
    if (existsSync(p)) return p;
  }

  const functionsDir = path.join(ROOT, 'supabase', 'functions');
  if (existsSync(functionsDir)) {
    for (const entry of readdirSync(functionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const name of ['index.ts', 'index.js', 'index.mts']) {
        const p = path.join(functionsDir, entry.name, name);
        if (!existsSync(p)) continue;
        const src = readFileSync(p, 'utf8');
        if (src.includes('evaluatePosition') && src.includes('resolvePriceWindow')) return p;
      }
    }
  }
  return null;
}

// ─────────────────────────── ดึงบล็อกตรรกะออกจากฝั่ง Edge ───────────────────────────

const BEGIN_TOKENS = [/\bbegin\b/i, /\bstart\b/i, /#region/i, /<copy/i, />>>/, /เริ่ม/];
const END_TOKENS = [/\bend\b/i, /\bfinish\b/i, /#endregion/i, /<\/copy/i, /<<</, /จบ/, /สิ้นสุด/];
/**
 * คำที่บอกว่า marker นี้พูดถึง "สำเนาตรรกะ" จริง ๆ ไม่ใช่คอมเมนต์ทั่วไปที่บังเอิญมีคำว่า start
 * เลือกคำที่เฉพาะเจาะจงพอ — คำกว้าง ๆ อย่าง "ตรรกะ" หรือ "monitor" ไม่เอา เพราะจับผิดตัวได้ง่าย
 */
const TOPIC_TOKENS = [
  /position[-_ ]?monitor/i,
  /parity/i,
  /\bcopy\b/i,
  /copied/i,
  /\bshared\b/i,
  /\bmirror(ed)?\b/i,
  /duplicate/i,
  /สำเนา/,
  /คัดลอก/,
  /ต้นฉบับ/,
];
const CLOSER_SHAPES = [/#endregion/i, /<\//, /<<</];

/**
 * marker แบบเป๊ะที่ฝั่ง Edge Function ประกาศไว้เป็นสัญญาในหัวไฟล์
 * ต้องเทียบด้วย startsWith กับบรรทัดดิบ ห้าม trim และห้าม includes()
 * เพราะในหัวไฟล์มีคอมเมนต์ที่ "ยกตัวอย่าง" marker เอาไว้ ถ้าใช้ includes() จะไปจับตัวอย่างก่อนตัวจริง
 */
const STRICT_BEGIN = '// >>> BEGIN COPY OF src/lib/position-monitor.ts';
const STRICT_END = '// <<< END COPY OF src/lib/position-monitor.ts';

const isCommentLine = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);
/** บรรทัดที่เป็นโค้ดจริง ไม่ใช่คอมเมนต์และไม่ใช่บรรทัดว่าง */
const isCodeLine = (line) => line.trim() !== '' && !isCommentLine(line);
const hitsAny = (line, list) => list.some((re) => re.test(line));

function isEndMarker(line) {
  if (!hitsAny(line, END_TOKENS)) return false;
  // ปิดแบบ #endregion หรือ </copy> ไม่ต้องมีคำหัวข้อซ้ำ เพราะรูปทรงมันบอกอยู่แล้วว่าเป็นตัวปิด
  return hitsAny(line, TOPIC_TOKENS) || hitsAny(line, CLOSER_SHAPES);
}

function isBeginMarker(line) {
  if (isEndMarker(line)) return false; // เช็คตัวปิดก่อนเสมอ กัน "#endregion" ถูกอ่านเป็นตัวเปิด
  return hitsAny(line, BEGIN_TOKENS) && hitsAny(line, TOPIC_TOKENS);
}

/**
 * ทางหลัก: marker เป๊ะตามสัญญาในหัวไฟล์ฝั่ง Edge
 * เจอทางนี้แล้วถือว่าสำเนาต้อง "เหมือนต้นฉบับทุกตัวอักษร" จึงเทียบข้อความเพิ่มได้อีกชั้น
 */
function extractByStrictMarkers(src) {
  const lines = src.split(/\r?\n/);
  const begins = [];
  const ends = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(STRICT_BEGIN)) begins.push(i);
    else if (lines[i].startsWith(STRICT_END)) ends.push(i);
  }
  if (begins.length === 0 || ends.length === 0) return { ok: false, reason: 'ไม่พบ marker แบบเป๊ะตามสัญญาในหัวไฟล์' };
  if (begins.length !== 1 || ends.length !== 1) {
    return { ok: false, reason: `marker แบบเป๊ะต้องมีอย่างละ 1 บรรทัด แต่พบ BEGIN ${begins.length} / END ${ends.length}` };
  }
  if (ends[0] < begins[0]) return { ok: false, reason: 'marker ปิดอยู่ก่อน marker เปิด' };

  return {
    ok: true,
    strategy: 'strict',
    verbatim: true,
    source: lines.slice(begins[0] + 1, ends[0]).join('\n'),
    markers: [{ begin: lines[begins[0]].trim(), end: lines[ends[0]].trim(), fromLine: begins[0] + 1, toLine: ends[0] + 1 }],
  };
}

/** ดึงทุกช่วงที่อยู่ระหว่าง marker เปิด-ปิด (รองรับหลายบล็อก เผื่อสำเนาถูกแบ่งเป็นหลายท่อน) */
function extractByMarkers(src) {
  const lines = src.split(/\r?\n/);
  const blocks = [];
  const markers = [];
  let openAt = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isCommentLine(line)) continue;
    if (openAt !== null) {
      if (isEndMarker(line)) {
        const body = lines.slice(openAt + 1, i);
        // คู่ marker ที่ไม่มีโค้ดจริงคั่นอยู่เลย = คอมเมนต์ที่บังเอิญยกตัวอย่าง marker เอาไว้
        // (หัวไฟล์ฝั่ง Edge มีบรรทัดอธิบายรูปแบบ marker อยู่จริง) ทิ้งไปแล้วหาตัวจริงต่อ
        if (body.some(isCodeLine)) {
          blocks.push(body.join('\n'));
          markers.push({ begin: lines[openAt].trim(), end: line.trim(), fromLine: openAt + 1, toLine: i + 1 });
        }
        openAt = null;
      }
      continue;
    }
    if (isBeginMarker(line)) openAt = i;
  }

  if (blocks.length === 0) {
    const reason =
      openAt !== null
        ? `พบ marker เปิดที่บรรทัด ${openAt + 1} แต่ไม่พบ marker ปิดหลังจากนั้น`
        : 'ไม่พบ marker คั่นบล็อกสำเนาในไฟล์';
    return { ok: false, reason };
  }
  return { ok: true, source: blocks.join('\n\n'), markers, strategy: 'marker', verbatim: false };
}

/**
 * แผนสำรองเมื่อไม่มี marker — ลากเฉพาะ function declaration ที่คอลัมน์ 0 ออกมา
 * แล้วไล่เก็บฟังก์ชันช่วยที่ถูกเรียกใช้ตามไปด้วย (toPriceLevel / round4 / toEpoch ฯลฯ)
 *
 * ตัดจบด้วยบรรทัดที่ขึ้นต้นด้วย '}' ที่คอลัมน์ 0 ซึ่งเชื่อถือได้กับโค้ดที่จัดรูปแบบมาตรฐาน
 * แต่ไม่แข็งแรงเท่า marker จึงเตือนเสียงดังเสมอเมื่อต้องใช้ทางนี้
 */
function extractByDeclarations(src) {
  const lines = src.split(/\r?\n/);
  const declRe = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;
  const blocks = new Map();

  for (let i = 0; i < lines.length; i++) {
    const m = declRe.exec(lines[i]);
    if (!m) continue;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\}/.test(lines[j])) {
        end = j;
        break;
      }
    }
    if (end === -1) continue;
    blocks.set(m[1], lines.slice(i, end + 1).join('\n'));
  }

  const missing = REQUIRED_EXPORTS.filter((n) => !blocks.has(n));
  if (missing.length > 0) {
    return { ok: false, reason: `หา function ${missing.join(', ')} ที่คอลัมน์ 0 ไม่เจอ` };
  }

  const needed = new Set(REQUIRED_EXPORTS);
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of [...needed]) {
      const body = blocks.get(name);
      if (!body) continue;
      for (const other of blocks.keys()) {
        if (needed.has(other)) continue;
        if (new RegExp(`\\b${other}\\b`).test(body)) {
          needed.add(other);
          grew = true;
        }
      }
    }
  }

  const picked = [...blocks.entries()].filter(([name]) => needed.has(name));
  return { ok: true, source: picked.map(([, body]) => body).join('\n\n'), picked: picked.map(([n]) => n), strategy: 'declaration' };
}

const MARKER_HOWTO = [
  'ให้ฝั่ง Edge Function คั่นบล็อกที่คัดลอกมาด้วยคอมเมนต์สองบรรทัดนี้ (ขึ้นต้นบรรทัดพอดี อย่างละหนึ่งบรรทัดเท่านั้น):',
  '',
  `    ${STRICT_BEGIN}`,
  '    ... เนื้อไฟล์ src/lib/position-monitor.ts ทั้งก้อน ...',
  `    ${STRICT_END}`,
  '',
  'ทางนี้จะถูกตรวจ 2 ชั้น: ข้อความต้องเหมือนต้นฉบับทุกตัวอักษร และผลลัพธ์ต้องตรงกันทุกเคส',
  '',
  'ถ้าใช้รูปแบบอื่น สคริปต์จะยังพยายามอ่านให้ (ตรวจแค่ผลลัพธ์ ไม่ตรวจข้อความ) เช่น',
  '"BEGIN/END COPIED LOGIC", "#region copied ... #endregion",',
  '"<copy:position-monitor> ... </copy:position-monitor>",',
  'หรือคอมเมนต์ไทยที่มีคำว่า เริ่ม/จบ คู่กับ สำเนา หรือ คัดลอก',
].join('\n');

/**
 * เทียบข้อความแบบตัวอักษรต่อตัวอักษร ใช้เฉพาะเมื่อเจอ marker แบบเป๊ะ
 * ซึ่งสัญญาไว้ว่าเนื้อในต้องเป็นสำเนาตรง ๆ ของ src/lib/position-monitor.ts
 *
 * ทำไมยังต้องเทียบข้อความทั้งที่มีการเทียบผลลัพธ์อยู่แล้ว:
 * ตารางเคสครอบได้เยอะแต่ไม่มีวันครบทุกกิ่ง ส่วนสำเนาที่เหมือนกันทุกตัวอักษรนั้นพิสูจน์ตัวเองได้
 * คืน null ถ้าเหมือนกัน หรือรายละเอียดบรรทัดแรกที่ต่างถ้าไม่เหมือน
 */
function compareVerbatim(canonicalSource, blockSource) {
  const norm = (s) => s.replace(/\r\n/g, '\n').trim();
  const a = norm(canonicalSource);
  const b = norm(blockSource);
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
  typescript = null; // ไม่มีก็ไม่เป็นไร ถอยไปใช้ type stripping ของ Node
}

/**
 * เขียนซอร์สลงไฟล์ชั่วคราวแล้ว import กลับเข้ามา
 *
 * ต่อท้ายด้วย __parity เสมอ เพราะฝั่ง Edge อาจประกาศฟังก์ชันแบบไม่ใส่ export
 * (ในไฟล์เดียวจบไม่จำเป็นต้อง export) การผูกชื่อเองจึงใช้ได้กับทั้งสองฝั่งโดยไม่ต้องแก้ซอร์ส
 */
async function loadSide(source, label, tmpDir) {
  const wrapped = `${source}\n\n// ผูกฟังก์ชันออกมาให้สคริปต์เรียกได้ ไม่ว่าซอร์สต้นทางจะ export ไว้หรือไม่\nexport const __parity = { ${REQUIRED_EXPORTS.join(', ')} };\n`;

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

// ───────────────────────────────── ตารางเคสทดสอบ ─────────────────────────────────

const ISO = {
  /** เวลาเปิดของรอบซื้อขายที่ high_24h/low_24h เป็นเจ้าของ */
  session: '2026-08-12T13:30:00.000Z',
  beforeSession: '2026-08-11T15:00:00.000Z',
  wayBefore: '2026-08-05T13:30:00.000Z',
  atSession: '2026-08-12T13:30:00.000Z',
  inSession: '2026-08-12T15:45:00.000Z',
  fetchedAt: '2026-08-12T18:00:00.000Z',
};

const mkPos = (o) => ({
  direction: 'long',
  entry_price: 100,
  quantity: 2,
  fees: 1,
  stop_loss: null,
  take_profit: null,
  ...o,
});

const mkWin = (price, low, high) => ({ price, low, high });

const mkQuote = (o) => ({
  price: 102,
  low_24h: 95,
  high_24h: 108,
  updated_at: ISO.fetchedAt,
  ...o,
});

function fixedCases() {
  const cases = [];
  const ev = (name, pos, win) => cases.push({ name, kind: 'evaluate', args: [pos, win] });
  const rs = (name, ...args) => cases.push({ name, kind: 'resolve', args });

  // ── long: entry 100, SL 95, TP 110 ───────────────────────────────────────────
  const L = { direction: 'long', entry_price: 100, stop_loss: 95, take_profit: 110 };
  ev('long/ไม่ชนอะไร', mkPos(L), mkWin(102, 101, 103));
  ev('long/ชน SL (wick ลงไปแตะ)', mkPos(L), mkWin(96, 94, 103));
  ev('long/ชน SL พอดีเป๊ะ', mkPos(L), mkWin(95, 95, 103));
  ev('long/ชน TP', mkPos(L), mkWin(108, 105, 112));
  ev('long/ชน TP พอดีเป๊ะ', mkPos(L), mkWin(110, 105, 110));
  ev('long/ชนทั้งคู่ → SL ต้องชนะ', mkPos(L), mkWin(100, 94, 112));
  ev('long/ชนทั้งคู่ ราคาปิดที่ TP', mkPos(L), mkWin(111, 94, 112));

  // ── short: entry 100, SL 105, TP 90 ──────────────────────────────────────────
  const S = { direction: 'short', entry_price: 100, stop_loss: 105, take_profit: 90 };
  ev('short/ไม่ชนอะไร', mkPos(S), mkWin(99, 98, 101));
  ev('short/ชน SL', mkPos(S), mkWin(104, 98, 106));
  ev('short/ชน SL พอดีเป๊ะ', mkPos(S), mkWin(105, 98, 105));
  ev('short/ชน TP', mkPos(S), mkWin(92, 89, 95));
  ev('short/ชน TP พอดีเป๊ะ', mkPos(S), mkWin(90, 90, 95));
  ev('short/ชนทั้งคู่ → SL ต้องชนะ', mkPos(S), mkWin(100, 89, 106));

  // ── ระดับอยู่ผิดฝั่งของ entry → ต้องเข้า ignored ไม่ใช่เอาไปตัดสิน ────────────
  ev('long/SL ผิดฝั่ง (สูงกว่า entry)', mkPos({ ...L, stop_loss: 105 }), mkWin(102, 101, 103));
  ev('long/SL ผิดฝั่ง + ราคาลงไปแตะจริง', mkPos({ ...L, stop_loss: 105 }), mkWin(96, 90, 106));
  ev('long/TP ผิดฝั่ง (ต่ำกว่า entry)', mkPos({ ...L, take_profit: 95 }), mkWin(102, 94, 103));
  ev('long/ผิดฝั่งทั้งคู่ → ignored ทั้งคู่', mkPos({ ...L, stop_loss: 105, take_profit: 95 }), mkWin(102, 94, 106));
  ev('long/SL เท่ากับ entry พอดี → ignored', mkPos({ ...L, stop_loss: 100 }), mkWin(99, 98, 101));
  ev('long/TP เท่ากับ entry พอดี → ignored', mkPos({ ...L, take_profit: 100 }), mkWin(101, 98, 102));
  ev('short/SL ผิดฝั่ง (ต่ำกว่า entry)', mkPos({ ...S, stop_loss: 95 }), mkWin(99, 94, 101));
  ev('short/TP ผิดฝั่ง (สูงกว่า entry)', mkPos({ ...S, take_profit: 110 }), mkWin(101, 98, 112));
  ev('short/ผิดฝั่งทั้งคู่ → ignored ทั้งคู่', mkPos({ ...S, stop_loss: 95, take_profit: 110 }), mkWin(100, 94, 112));
  ev('short/SL เท่ากับ entry พอดี → ignored', mkPos({ ...S, stop_loss: 100 }), mkWin(101, 98, 102));

  // ── ไม่ได้ตั้ง SL/TP ─────────────────────────────────────────────────────────
  ev('long/ไม่ตั้ง SL และ TP', mkPos({ direction: 'long', entry_price: 100 }), mkWin(107, 90, 120));
  ev('short/ไม่ตั้ง SL และ TP', mkPos({ direction: 'short', entry_price: 100 }), mkWin(93, 80, 120));
  ev('long/ตั้งแค่ SL', mkPos({ ...L, take_profit: null }), mkWin(96, 94, 130));
  ev('long/ตั้งแค่ TP', mkPos({ ...L, stop_loss: null }), mkWin(108, 50, 112));
  ev('long/SL undefined', mkPos({ ...L, stop_loss: undefined }), mkWin(96, 94, 103));
  ev('long/TP undefined', mkPos({ ...L, take_profit: undefined }), mkWin(112, 94, 115));

  // ── SL/TP เป็น 0 หรือติดลบ ต้องถือว่า "ไม่ได้ตั้ง" ───────────────────────────
  // เคสนี้สำคัญกับ short เป็นพิเศษ: high >= 0 จริงเสมอ ถ้าปล่อยหลุดจะปิดออเดอร์ทิ้งทันที
  ev('short/SL = 0 ต้องไม่ถือว่าชน', mkPos({ ...S, stop_loss: 0 }), mkWin(99, 98, 101));
  ev('long/TP = 0 ต้องไม่ถือว่าชน', mkPos({ ...L, take_profit: 0 }), mkWin(99, 98, 101));
  ev('long/SL ติดลบ', mkPos({ ...L, stop_loss: -5 }), mkWin(99, 98, 101));
  ev('short/TP = 0 (low <= 0 ไม่จริงอยู่แล้ว)', mkPos({ ...S, take_profit: 0 }), mkWin(99, 98, 101));
  ev('long/SL เป็นสตริงว่าง', mkPos({ ...L, stop_loss: '' }), mkWin(99, 98, 101));
  ev('long/SL เป็นสตริงอ่านไม่ออก', mkPos({ ...L, stop_loss: 'n/a' }), mkWin(99, 98, 101));

  // ── entry_price ใช้ไม่ได้ → ต้องคืน idle ทั้งก้อน ────────────────────────────
  ev('entry_price = 0', mkPos({ ...L, entry_price: 0 }), mkWin(96, 94, 103));
  ev('entry_price ติดลบ', mkPos({ ...L, entry_price: -100 }), mkWin(96, 94, 103));
  ev('entry_price = null', mkPos({ ...L, entry_price: null }), mkWin(96, 94, 103));
  ev('entry_price = undefined', mkPos({ ...L, entry_price: undefined }), mkWin(96, 94, 103));
  ev('entry_price สตริงว่าง', mkPos({ ...L, entry_price: '' }), mkWin(96, 94, 103));
  ev('entry_price อ่านไม่ออก', mkPos({ ...L, entry_price: 'abc' }), mkWin(96, 94, 103));
  ev('entry_price = NaN', mkPos({ ...L, entry_price: NaN }), mkWin(96, 94, 103));
  ev('entry_price = Infinity', mkPos({ ...L, entry_price: Infinity }), mkWin(96, 94, 103));

  // ── ค่ามาเป็น string (postgres numeric ผ่าน PostgREST) ──────────────────────
  ev(
    'ทุกฟิลด์เป็น string/long ชน SL',
    mkPos({ direction: 'long', entry_price: '100', quantity: '2', fees: '1.5', stop_loss: '95', take_profit: '110' }),
    mkWin(96, 94, 103)
  );
  ev(
    'ทุกฟิลด์เป็น string/short ชน TP',
    mkPos({ direction: 'short', entry_price: '100', quantity: '3', fees: '0.25', stop_loss: '105', take_profit: '90' }),
    mkWin(92, 89, 95)
  );
  ev(
    'string เทียบกันตรง ๆ จะผิด: "105" <= 100',
    mkPos({ direction: 'long', entry_price: '100', quantity: '1', fees: '0', stop_loss: '95', take_profit: '110' }),
    mkWin('105', '99', '106')
  );
  ev('หน้าต่างราคาเป็น string ทั้งชุด', mkPos(L), mkWin('96', '94', '103'));

  // ── fees / quantity ผิดรูป ───────────────────────────────────────────────────
  ev('fees = null', mkPos({ ...L, fees: null }), mkWin(108, 105, 112));
  ev('fees = undefined', mkPos({ ...L, fees: undefined }), mkWin(108, 105, 112));
  ev('fees อ่านไม่ออก', mkPos({ ...L, fees: 'ฟรี' }), mkWin(108, 105, 112));
  ev('fees ติดลบ (เงินคืน)', mkPos({ ...L, fees: -2 }), mkWin(108, 105, 112));
  ev('quantity = null', mkPos({ ...L, quantity: null }), mkWin(108, 105, 112));
  ev('quantity = 0', mkPos({ ...L, quantity: 0 }), mkWin(108, 105, 112));
  ev('quantity ติดลบ', mkPos({ ...L, quantity: -5 }), mkWin(108, 105, 112));
  ev('quantity อ่านไม่ออก', mkPos({ ...L, quantity: 'สอง' }), mkWin(108, 105, 112));
  ev('quantity เศษส่วน', mkPos({ ...L, quantity: 0.3333333 }), mkWin(108, 105, 112));

  // ── หน้าต่างราคาเพี้ยน ต้องถอยไปใช้ [price, price] ──────────────────────────
  ev('window: high < low', mkPos(L), mkWin(102, 110, 90));
  ev('window: low/high = 0', mkPos(L), mkWin(102, 0, 0));
  ev('window: low = null', mkPos(L), mkWin(102, null, 103));
  ev('window: high อ่านไม่ออก', mkPos(L), mkWin(102, 94, 'x'));
  ev('window: price = 0 → idle', mkPos(L), mkWin(0, 94, 103));
  ev('window: price ติดลบ → idle', mkPos(L), mkWin(-3, 94, 103));
  ev('window: price = null → idle', mkPos(L), mkWin(null, 94, 103));
  ev('window: price = NaN → idle', mkPos(L), mkWin(NaN, 94, 103));
  ev('window: ราคาอยู่นอกช่วง high (ต้องขยายครอบ)', mkPos(L), mkWin(115, 94, 103));
  ev('window: ราคาอยู่ต่ำกว่า low (ต้องขยายครอบ)', mkPos(L), mkWin(90, 94, 103));

  // ── ทิศทางที่ไม่ใช่ 'long' ต้องถูกมองเป็น short เหมือนกันทั้งสองฝั่ง ─────────
  ev("direction = 'LONG' ตัวใหญ่", mkPos({ ...L, direction: 'LONG' }), mkWin(96, 94, 103));
  ev("direction = 'sell'", mkPos({ ...S, direction: 'sell' }), mkWin(104, 98, 106));
  ev('direction = null', mkPos({ ...S, direction: null }), mkWin(104, 98, 106));
  ev('direction = undefined', mkPos({ ...S, direction: undefined }), mkWin(104, 98, 106));

  // ── อ็อบเจกต์ขาด/เป็น null ทั้งก้อน ─────────────────────────────────────────
  ev('pos = null', null, mkWin(102, 101, 103));
  ev('pos = {} ว่างเปล่า', {}, mkWin(102, 101, 103));
  ev('win = null', mkPos(L), null);
  ev('win = {} ว่างเปล่า', mkPos(L), {});
  ev('pos และ win เป็น null ทั้งคู่', null, null);

  // ── การปัดเศษ 4 ตำแหน่ง และ exit_price ที่ต้องไม่ถูกปัด ─────────────────────
  ev(
    'ปัด pnl/pnl_percent 4 ตำแหน่ง',
    mkPos({ direction: 'long', entry_price: 3, quantity: 0.3333333, fees: 0.12345678, stop_loss: null, take_profit: null }),
    mkWin(3.123456789, 3.1, 3.2)
  );
  ev(
    'forex 5 ทศนิยม: exit_price ต้องไม่ถูกปัด',
    mkPos({ direction: 'long', entry_price: 1.1, quantity: 100000, fees: 0, stop_loss: 1.09512, take_profit: 1.12345 }),
    mkWin(1.09, 1.08, 1.101)
  );
  ev(
    'ตัวเลขใหญ่มาก',
    mkPos({ direction: 'short', entry_price: 987654.321, quantity: 1234.5678, fees: 9.87, stop_loss: 999999, take_profit: 900000 }),
    mkWin(950000, 900001, 1000000)
  );
  ev(
    'ตัวเลขเล็กมาก (คริปโตทศนิยมเยอะ)',
    mkPos({ direction: 'long', entry_price: 0.00001234, quantity: 1e8, fees: 0.5, stop_loss: 0.00001, take_profit: 0.00002 }),
    mkWin(0.0000155, 0.0000099, 0.0000205)
  );

  // ── resolvePriceWindow ───────────────────────────────────────────────────────
  rs('resolve/เปิดก่อนรอบ → ใช้ [low, high]', mkQuote(), ISO.beforeSession, ISO.session);
  rs('resolve/เปิดนานแล้ว → ใช้ [low, high]', mkQuote(), ISO.wayBefore, ISO.session);
  rs('resolve/เปิดตรงกับ sessionStart พอดี → flat', mkQuote(), ISO.atSession, ISO.session);
  rs('resolve/เปิดในรอบเดียวกัน (หลัง session) → flat', mkQuote(), ISO.inSession, ISO.session);
  rs('resolve/ไม่รู้ sessionStart (null) → flat', mkQuote(), ISO.beforeSession, null);
  rs('resolve/ไม่รู้ sessionStart (undefined) → flat', mkQuote(), ISO.beforeSession, undefined);
  rs('resolve/ไม่ส่ง sessionStart มาเลย → flat', mkQuote(), ISO.beforeSession);
  rs('resolve/sessionStart อ่านไม่ออก → flat', mkQuote(), ISO.beforeSession, 'เมื่อวาน');
  rs('resolve/sessionStart เป็นตัวเลข → flat', mkQuote(), ISO.beforeSession, 1755000000000);
  rs('resolve/openedAt อ่านไม่ออก → flat', mkQuote(), 'ไม่รู้', ISO.session);
  rs('resolve/openedAt = null → flat', mkQuote(), null, ISO.session);
  rs('resolve/openedAt เป็นตัวเลข → flat', mkQuote(), 1754900000000, ISO.session);
  rs('resolve/high-low ใช้ไม่ได้ (เป็น 0) → flat', mkQuote({ low_24h: 0, high_24h: 0 }), ISO.beforeSession, ISO.session);
  rs('resolve/high < low → flat', mkQuote({ low_24h: 108, high_24h: 95 }), ISO.beforeSession, ISO.session);
  rs('resolve/low = null → flat', mkQuote({ low_24h: null }), ISO.beforeSession, ISO.session);
  rs('resolve/high อ่านไม่ออก → flat', mkQuote({ high_24h: '-' }), ISO.beforeSession, ISO.session);
  rs('resolve/high = low พอดี', mkQuote({ low_24h: 102, high_24h: 102 }), ISO.beforeSession, ISO.session);
  rs('resolve/ราคาใช้ไม่ได้ (0) → หน้าต่างศูนย์', mkQuote({ price: 0 }), ISO.beforeSession, ISO.session);
  rs('resolve/ราคาติดลบ → หน้าต่างศูนย์', mkQuote({ price: -1 }), ISO.beforeSession, ISO.session);
  rs('resolve/ราคา = null → หน้าต่างศูนย์', mkQuote({ price: null }), ISO.beforeSession, ISO.session);
  rs('resolve/ราคา = NaN → หน้าต่างศูนย์', mkQuote({ price: NaN }), ISO.beforeSession, ISO.session);
  rs('resolve/ราคาสตริงว่าง → หน้าต่างศูนย์', mkQuote({ price: '' }), ISO.beforeSession, ISO.session);
  rs('resolve/ราคาอยู่เหนือ high (ต้องขยายครอบ)', mkQuote({ price: 120 }), ISO.beforeSession, ISO.session);
  rs('resolve/ราคาอยู่ใต้ low (ต้องขยายครอบ)', mkQuote({ price: 80 }), ISO.beforeSession, ISO.session);
  rs('resolve/ค่าทั้งชุดเป็น string', mkQuote({ price: '102', low_24h: '95', high_24h: '108' }), ISO.beforeSession, ISO.session);
  rs('resolve/quote = null', null, ISO.beforeSession, ISO.session);
  rs('resolve/quote = {}', {}, ISO.beforeSession, ISO.session);
  rs('resolve/updated_at หายไป (ต้องไม่ถูกใช้ตัดสิน)', { price: 102, low_24h: 95, high_24h: 108 }, ISO.beforeSession, ISO.session);

  // ── ต่อท่อจริง: resolve → evaluate เหมือนที่ route/Edge Function ใช้งาน ──────
  cases.push({
    name: 'chain/เปิดก่อนรอบ + wick แตะ SL',
    kind: 'chain',
    args: [mkQuote({ price: 102, low_24h: 94, high_24h: 106 }), ISO.beforeSession, ISO.session, mkPos(L)],
  });
  cases.push({
    name: 'chain/เปิดในรอบเดียวกัน wick เดียวกันต้องไม่ถูกนับ',
    kind: 'chain',
    args: [mkQuote({ price: 102, low_24h: 94, high_24h: 106 }), ISO.inSession, ISO.session, mkPos(L)],
  });
  cases.push({
    name: 'chain/short + ไม่รู้ sessionStart',
    kind: 'chain',
    args: [mkQuote({ price: 99, low_24h: 88, high_24h: 107 }), ISO.beforeSession, null, mkPos(S)],
  });
  cases.push({
    name: 'chain/ราคาใช้ไม่ได้ → ต้อง idle ทั้งสองฝั่ง',
    kind: 'chain',
    args: [mkQuote({ price: 0 }), ISO.beforeSession, ISO.session, mkPos(L)],
  });

  return cases;
}

/**
 * เคสสุ่มแบบกำหนดค่าแน่นอน — seed ตายตัวจึงได้ชุดเดิมทุกครั้ง
 * ทุกรอบสร้าง 2 เคส: ต่อท่อ resolve→evaluate หนึ่งเคส และ evaluate ตรง ๆ กับหน้าต่างที่อาจเพี้ยนอีกหนึ่งเคส
 */
function randomCases(iterations, seed) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const num = (min, max, dp) => Number((min + rnd() * (max - min)).toFixed(dp));
  const baseEpoch = Date.UTC(2026, 7, 12, 13, 30, 0);
  const iso = (ms) => new Date(ms).toISOString();

  const cases = [];

  for (let i = 0; i < iterations; i++) {
    // ราคาเข้า — ส่วนใหญ่ปกติ แต่จงใจโรยค่าที่ใช้ไม่ได้เข้าไปด้วย
    let entry;
    const eRoll = rnd();
    if (eRoll < 0.03) entry = 0;
    else if (eRoll < 0.05) entry = -num(1, 200, 2);
    else if (eRoll < 0.07) entry = '';
    else if (eRoll < 0.09) entry = 'abc';
    else if (eRoll < 0.11) entry = null;
    else if (eRoll < 0.24) entry = String(num(0.5, 5000, 5));
    else entry = num(0.5, 5000, 5);

    const e = Number(entry);
    const base = Number.isFinite(e) && e > 0 ? e : 100;

    const direction = pick(['long', 'long', 'short', 'short', 'LONG', 'sell']);
    const isLong = direction === 'long';

    // ระดับ SL/TP — ผสมทั้งฝั่งถูก ฝั่งผิด ไม่ตั้ง และค่าที่ต้องถือว่าไม่ได้ตั้ง
    const level = (rightSideIsBelow) => {
      const roll = rnd();
      if (roll < 0.12) return null;
      if (roll < 0.16) return 0;
      if (roll < 0.18) return -num(1, 50, 2);
      if (roll < 0.2) return '';
      const right = rightSideIsBelow ? base * num(0.5, 0.995, 6) : base * num(1.005, 1.5, 6);
      const wrong = rightSideIsBelow ? base * num(1.005, 1.5, 6) : base * num(0.5, 0.995, 6);
      const value = roll < 0.5 ? Number(wrong.toFixed(6)) : Number(right.toFixed(6));
      // บางครั้งตั้งตรงกับ entry เป๊ะ ๆ เพื่อทดสอบขอบของเงื่อนไข < กับ <=
      const exact = roll > 0.94 ? base : value;
      return roll < 0.24 ? String(exact) : exact;
    };
    const stop_loss = level(isLong);
    const take_profit = level(!isLong);

    // จำนวนและค่าธรรมเนียม
    const qRoll = rnd();
    const quantity =
      qRoll < 0.05 ? null : qRoll < 0.08 ? 0 : qRoll < 0.11 ? -num(1, 10, 2) : qRoll < 0.2 ? String(num(0.001, 500, 6)) : num(0.001, 500, 6);
    const fRoll = rnd();
    const fees = fRoll < 0.12 ? null : fRoll < 0.16 ? undefined : fRoll < 0.19 ? 'ฟรี' : fRoll < 0.28 ? String(num(0, 30, 4)) : num(0, 30, 4);

    const pos = { direction, entry_price: entry, quantity, fees, stop_loss, take_profit };

    // ราคาปัจจุบันและช่วง high/low ของรอบ
    const pRoll = rnd();
    let price;
    if (pRoll < 0.03) price = 0;
    else if (pRoll < 0.05) price = null;
    else if (pRoll < 0.06) price = NaN;
    else if (pRoll < 0.07) price = '';
    else if (pRoll < 0.16) price = String(Number((base * num(0.7, 1.3, 6)).toFixed(6)));
    else price = Number((base * num(0.7, 1.3, 6)).toFixed(6));

    const p = Number(price);
    const anchor = Number.isFinite(p) && p > 0 ? p : base;
    const wRoll = rnd();
    let low_24h;
    let high_24h;
    if (wRoll < 0.06) {
      low_24h = 0;
      high_24h = 0;
    } else if (wRoll < 0.1) {
      // กลับหัว high < low → ทั้งสองฝั่งต้องถอยไปใช้ [price, price]
      low_24h = Number((anchor * 1.1).toFixed(6));
      high_24h = Number((anchor * 0.9).toFixed(6));
    } else if (wRoll < 0.13) {
      low_24h = null;
      high_24h = Number((anchor * 1.1).toFixed(6));
    } else if (wRoll < 0.16) {
      // ช่วงที่ไม่ครอบราคาปัจจุบัน → ต้องถูกขยายให้ครอบเหมือนกันทั้งสองฝั่ง
      low_24h = Number((anchor * 1.02).toFixed(6));
      high_24h = Number((anchor * 1.2).toFixed(6));
    } else if (wRoll < 0.24) {
      low_24h = String(Number((anchor * num(0.6, 1, 6)).toFixed(6)));
      high_24h = String(Number((anchor * num(1, 1.4, 6)).toFixed(6)));
    } else {
      low_24h = Number((anchor * num(0.6, 1, 6)).toFixed(6));
      high_24h = Number((anchor * num(1, 1.4, 6)).toFixed(6));
    }

    const quote = { price, low_24h, high_24h, updated_at: iso(baseEpoch + 16200000) };

    const sessionStart = pick([
      iso(baseEpoch),
      iso(baseEpoch),
      iso(baseEpoch - 86400000),
      null,
      undefined,
      'ไม่ใช่เวลา',
      String(baseEpoch),
    ]);
    const openedAt = pick([
      iso(baseEpoch - 3600000),
      iso(baseEpoch - 86400000 * 3),
      iso(baseEpoch),
      iso(baseEpoch + 7200000),
      null,
      'เมื่อวาน',
    ]);

    cases.push({ name: `สุ่ม#${i}/chain`, kind: 'chain', args: [quote, openedAt, sessionStart, pos] });

    // หน้าต่างดิบที่ไม่ผ่าน resolve — ป้อนค่าที่เพี้ยนได้มากกว่าเข้าไปตรง ๆ
    const rawWin = { price, low: low_24h, high: high_24h };
    cases.push({ name: `สุ่ม#${i}/evaluate`, kind: 'evaluate', args: [pos, rawWin] });
  }

  return cases;
}

// ───────────────────────────────── เรียกและเทียบผล ─────────────────────────────────

/**
 * เรียกฝั่งหนึ่งด้วยสำเนาอาร์กิวเมนต์ของตัวเอง
 * โคลนแยกเพราะถ้าฝั่งไหนแอบแก้ค่า input อีกฝั่งจะได้ข้อมูลที่ถูกแก้แล้ว ผลจะเพี้ยนตามลำดับการเรียก
 * แล้วส่ง argsAfter กลับไปเทียบด้วย — ตรรกะนี้ต้องไม่แก้ input ของใคร ถ้าฝั่งไหนแก้ต้องรู้
 */
function invoke(api, testCase) {
  const args = structuredClone(testCase.args);
  let result;
  try {
    if (testCase.kind === 'resolve') {
      const value =
        args.length >= 3 ? api.resolvePriceWindow(args[0], args[1], args[2]) : api.resolvePriceWindow(args[0], args[1]);
      result = { threw: false, value };
    } else if (testCase.kind === 'evaluate') {
      result = { threw: false, value: api.evaluatePosition(args[0], args[1]) };
    } else {
      const window = api.resolvePriceWindow(args[0], args[1], args[2]);
      const outcome = api.evaluatePosition(args[3], window);
      result = { threw: false, value: { window, outcome } };
    }
  } catch (err) {
    result = { threw: true, name: err?.name ?? 'Error', message: String(err?.message ?? err) };
  }
  return { result, argsAfter: args };
}

/**
 * ข้อความ error ไม่เอามาเทียบ เพราะถ้อยคำต่างกันได้โดยพฤติกรรมเหมือนกัน
 * แต่ "โยน error หรือไม่" และ "ชนิดของ error" ต้องตรงกัน
 */
function signature(side) {
  const r = side.result;
  const head = r.threw ? `THREW:${r.name}` : canon(r.value);
  return `${head}|args=${canon(side.argsAfter)}`;
}

function describe(side) {
  const r = side.result;
  if (r.threw) return `โยน ${r.name}: ${r.message}`;
  return canon(r.value);
}

// ───────────────────────────────────── main ─────────────────────────────────────

async function main() {
  if (!existsSync(CANONICAL_FILE)) fail(`หาไฟล์ต้นฉบับไม่เจอ: ${CANONICAL_FILE}`);

  const edgeFile = findEdgeFile();
  if (!edgeFile) {
    fail(
      [
        'หาไฟล์ Edge Function ที่มีสำเนาตรรกะไม่เจอ',
        'ที่มองหา: supabase/functions/monitor-positions/index.ts (และโฟลเดอร์อื่นใต้ supabase/functions ที่มี evaluatePosition)',
        '',
        'ถ้าไฟล์อยู่ที่อื่น สั่งได้ด้วย PARITY_EDGE_FILE=<พาธ> npm run check:parity',
        '',
        'ตราบใดที่ยังหาไม่เจอ จะไม่มีใครยืนยันได้ว่าสำเนาตรงกับต้นฉบับ จึงถือว่าไม่ผ่าน',
      ].join('\n')
    );
  }

  const canonicalSource = readFileSync(CANONICAL_FILE, 'utf8');
  const edgeSource = readFileSync(edgeFile, 'utf8');

  console.log('ต้นฉบับ :', path.relative(ROOT, CANONICAL_FILE));
  console.log('สำเนา   :', path.relative(ROOT, edgeFile));

  // ดึงบล็อกตรรกะจากฝั่ง Edge
  // ลำดับ: marker เป๊ะตามสัญญา → marker แบบยืดหยุ่น → ลากตาม function declaration
  const strictReason = [];
  let extracted = extractByStrictMarkers(edgeSource);
  if (!extracted.ok) {
    strictReason.push(`- marker แบบเป๊ะ: ${extracted.reason}`);
    extracted = extractByMarkers(edgeSource);
  }

  if (extracted.ok && extracted.strategy === 'strict') {
    const m = extracted.markers[0];
    console.log(`วิธีดึงบล็อก: marker แบบเป๊ะ บรรทัด ${m.fromLine}-${m.toLine}`);
  } else if (extracted.ok) {
    console.log(`วิธีดึงบล็อก: marker แบบยืดหยุ่น (${extracted.markers.length} บล็อก)`);
    for (const m of extracted.markers) console.log(`  บรรทัด ${m.fromLine}-${m.toLine}  ${m.begin}`);
  } else {
    const markerReason = extracted.reason;
    extracted = extractByDeclarations(edgeSource);
    if (!extracted.ok) {
      fail(
        [
          `ดึงบล็อกตรรกะจาก ${path.relative(ROOT, edgeFile)} ไม่ได้`,
          ...strictReason,
          `- marker แบบยืดหยุ่น: ${markerReason}`,
          `- ลากตาม declaration: ${extracted.reason}`,
          '',
          MARKER_HOWTO,
        ].join('\n')
      );
    }
    console.warn(
      [
        '',
        '[เตือน] ไม่พบ marker คั่นบล็อกสำเนา จึงถอยไปลากตาม function declaration แทน',
        `        ที่ลากมาได้: ${extracted.picked.join(', ')}`,
        '        วิธีนี้เดาขอบเขตเอง ถ้าจัดรูปแบบโค้ดเปลี่ยนอาจลากมาไม่ครบ',
        '',
        MARKER_HOWTO,
        '',
      ].join('\n')
    );
  }

  for (const name of REQUIRED_EXPORTS) {
    if (!extracted.source.includes(name)) {
      fail(`บล็อกที่ดึงมาจากฝั่ง Edge ไม่มี ${name} — marker อาจคั่นผิดที่\n\n${MARKER_HOWTO}`);
    }
  }

  // ชั้นที่ 1: เทียบข้อความ (ทำได้เฉพาะทาง marker แบบเป๊ะ ซึ่งสัญญาว่าเป็นสำเนาตรง ๆ)
  const textDiff = extracted.verbatim ? compareVerbatim(canonicalSource, extracted.source) : null;
  if (extracted.verbatim) {
    console.log(textDiff ? 'เทียบข้อความ: ต่างกัน' : 'เทียบข้อความ: เหมือนต้นฉบับทุกตัวอักษร');
  } else {
    console.log('เทียบข้อความ: ข้าม (ไม่ได้ใช้ marker แบบเป๊ะ จึงตรวจเฉพาะผลลัพธ์)');
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), 'monitor-parity-'));
  let exitCode = 0;

  try {
    const canonical = await loadSide(canonicalSource, 'canonical', tmpDir);
    const edge = await loadSide(extracted.source, 'edge', tmpDir);

    const cases = [...fixedCases(), ...randomCases(RANDOM_ITERATIONS, SEED)];

    const diffs = [];
    for (const testCase of cases) {
      const a = invoke(canonical, testCase);
      const b = invoke(edge, testCase);
      if (signature(a) !== signature(b)) diffs.push({ testCase, a, b });
    }

    const fixedCount = fixedCases().length;
    console.log('');
    console.log(`เคสที่ตรวจ : ${cases.length} (กำหนดเอง ${fixedCount} + สุ่ม ${cases.length - fixedCount} จาก seed ${SEED})`);

    if (diffs.length === 0) {
      console.log(`ผลลัพธ์    : ตรงกันทุกฟิลด์ทั้ง ${cases.length} เคส`);
    } else {
      exitCode = 1;
      const SHOW = 12;
      console.error('');
      console.error(`[ไม่ผ่าน] ผลลัพธ์ไม่ตรงกัน ${diffs.length} เคส จาก ${cases.length}`);
      console.error('');

      for (const d of diffs.slice(0, SHOW)) {
        console.error(`── เคส: ${d.testCase.name}  [${d.testCase.kind}]`);
        console.error(`   อินพุต  : ${canon(d.testCase.args)}`);
        console.error(`   ต้นฉบับ : ${describe(d.a)}`);
        console.error(`   สำเนา   : ${describe(d.b)}`);
        if (canon(d.a.argsAfter) !== canon(d.b.argsAfter)) {
          console.error('   หมายเหตุ: อินพุตหลังเรียกไม่เหมือนกัน แปลว่ามีฝั่งหนึ่งไปแก้ค่า input');
        }
        console.error('');
      }
      if (diffs.length > SHOW) console.error(`   ...และอีก ${diffs.length - SHOW} เคส\n`);
    }

    // ข้อความต่างแต่ผลลัพธ์ยังตรง = ยังไม่พังตอนนี้ แต่สำเนาเริ่มเลื่อนแล้ว ต้องรู้ตั้งแต่ตอนนี้
    if (textDiff) {
      exitCode = 1;
      console.error('');
      console.error(`[ไม่ผ่าน] ข้อความในบล็อกสำเนาไม่ตรงกับต้นฉบับ (บรรทัดแรกที่ต่าง: ${textDiff.line})`);
      console.error(`   ต้นฉบับ : ${textDiff.canonical}`);
      console.error(`   สำเนา   : ${textDiff.edge}`);
      console.error(`   จำนวนบรรทัด ต้นฉบับ ${textDiff.aTotal} / สำเนา ${textDiff.bTotal}`);
      if (diffs.length === 0) {
        console.error('   ผลลัพธ์ยังตรงกันทุกเคส แปลว่าตอนนี้ยังไม่พัง แต่สำเนาเลื่อนจากต้นฉบับแล้ว');
        console.error('   ตารางเคสครอบได้เยอะแต่ไม่ครบทุกกิ่ง จึงไม่ปล่อยผ่าน');
      }
      console.error('');
      console.error(`วิธีแก้: ก๊อปเนื้อ src/lib/position-monitor.ts ทั้งไฟล์ทับระหว่าง marker ในฝั่ง Edge`);
    }

    if (exitCode === 0) {
      console.log('');
      console.log('[ผ่าน] สำเนาฝั่ง Edge Function ยังตรงกับต้นฉบับ');
      return;
    }

    console.error('');
    console.error('แก้โดยทำสำเนาฝั่ง Edge Function ให้ตรงกับ src/lib/position-monitor.ts');
    console.error('อย่าแก้ตัวเลขที่คาดหวังในสคริปต์นี้ให้ตามสำเนา — ต้นฉบับคือกฎที่ชี้ขาดกำไร/ขาดทุนของผู้ใช้');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  if (exitCode !== 0) process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
