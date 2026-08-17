#!/usr/bin/env node
/**
 * check-ui-claims.mjs — กันไม่ให้ UI พูดสิ่งที่ข้อมูลไม่รองรับ
 *
 * ทำไมต้องมีไฟล์นี้
 *   tsc กับ eslint ตรวจได้แค่ "รูปร่างของโค้ด" มันไม่รู้ว่าประโยคไทยบนหน้าจอ
 *   แปลว่าอะไร การ์ดที่พิมพ์ว่า "พลิกเป็นบวกที่ −0.076R" คอมไพล์ผ่านสบาย ๆ
 *   สามรอบที่ผ่านมาแต่ละรอบลบคำอ้างเท็จเก่าแล้วสร้างคำอ้างเท็จใหม่ ไม่มีอะไรจับได้เลย
 *   ไฟล์นี้จึงอ่าน "ข้อความที่ผู้ใช้จะเห็นจริง" มาเทียบกับ "ตัวเลขที่วัดมาจริง"
 *
 * หลักการเดียวของทุกด่านในไฟล์นี้: **แดงเมื่อ UI อ้าง แต่ข้อมูลไม่รองรับ**
 *   ไม่ใช่ "แดงเพราะข้อมูลไม่สวย" — ถ้า UI ไม่ได้พูดคำอ้างนั้น ด่านนั้นต้องเขียว
 *   ทุกด่านจึงเช็กสองข้าง: มีคำอ้างในซอร์สไหม + ข้อมูลค้านคำอ้างนั้นไหม
 *   ผลคือพอมีคนลบคำอ้างเท็จทิ้ง ด่านจะเขียวเอง และจะแดงทันทีที่มีคนเขียนกลับมา
 *
 * รัน:  npm run check:ui-claims
 *       node scripts/check-ui-claims.mjs              (exit 1 เมื่อไม่ผ่าน)
 *       node scripts/check-ui-claims.mjs --verbose    (โชว์ทุกด่านที่ผ่านด้วย)
 *       node scripts/check-ui-claims.mjs --self-test  (พิสูจน์ว่าตัวตรวจเองยังจับของปลอมได้)
 *
 * ไม่แตะเครือข่าย ไม่แตะ DB ไม่แตะนาฬิกา — อ่านไฟล์ในโปรเจกต์อย่างเดียว
 * ต้องมี node_modules/typescript (devDependency อยู่แล้ว) เพื่อลอกชนิดออกจาก .ts
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

/** ไฟล์ที่ผู้ใช้เห็นผลของมันบนหน้าจอ — ขอบเขตของการตรวจข้อความในซอร์ส */
const UI_DIRS = ['src/app', 'src/components'];
/** ตัวอ่านตัวจริงที่หน้าเว็บเรียก — ประกอบข้อความเตือนภาษาไทยเองด้วย */
const READER_TS = 'src/lib/speed-scorecard.ts';
/** ก้อนข้อมูลที่ตัวอ่านอ่าน — เปิดตรง ๆ เพื่ออ้าง "ที่มาของเลข" ในข้อความ error */
const DATA_JSON = 'src/lib/speed-scorecard.client.json';

// ═══════════════════════════════════════════════════════════════════════════
// 0. ที่เก็บผล — ทุก finding ต้องตอบได้ว่า "บรรทัดไหน · ข้อความอะไร · ขัดกับเลขไหน"
// ═══════════════════════════════════════════════════════════════════════════

const findings = [];
const passed = [];

/**
 * บันทึกข้อผิดพลาดหนึ่งอัน
 * บังคับให้ทุกช่องมีค่าเพราะ error ที่บอกแค่ "ไม่ผ่าน" ทำให้คนแก้ต้องเดา
 * แล้วการเดาคือต้นทางของการ "เพิ่มเงื่อนไขซ้อน" แทนที่จะลบคำอ้างทิ้ง
 */
function report({ check, where, claim, contradicts, evidence, fix }) {
  findings.push({ check, where, claim, contradicts, evidence, fix });
}

const ok = (check, detail) => passed.push(`${check} — ${detail}`);

// ═══════════════════════════════════════════════════════════════════════════
// 1. โหลดของจริง: ตัวอ่าน .ts + ไฟล์ข้อมูล
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ลอกชนิดออกจาก speed-scorecard.ts แล้ว import กลับเข้ามาเป็นโมดูลจริง
 *
 * ทำไมไม่ลอกสูตรมาเขียนใหม่ในไฟล์นี้: ถ้าเขียนซ้ำ เราจะตรวจ "สำเนา" ไม่ใช่ของจริง
 * วันไหนของจริงเปลี่ยนข้อความ สำเนาไม่เปลี่ยน แล้วด่านนี้จะเขียวทั้งที่หน้าจอโกหกอยู่
 * วิธีเดียวกับ scripts/scan-universe.mjs และ scripts/research/load-src-modules.mjs
 */
async function loadReader() {
  const require_ = createRequire(import.meta.url);
  let ts;
  try {
    ts = require_('typescript');
  } catch {
    console.error('ไม่พบแพ็กเกจ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่');
    process.exit(2);
  }

  const entry = path.join(ROOT, READER_TS);
  if (!existsSync(entry)) {
    console.error(`หาตัวอ่านไม่เจอ: ${entry}`);
    process.exit(2);
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), 'ui-claims-'));
  try {
    // ไล่ตาม import เอง แทนการฮาร์ดโค้ดรายชื่อไฟล์ — วันไหนตัวอ่าน import อะไรเพิ่ม
    // ตัวโหลดต้องตามไปเองโดยไม่ต้องมาแก้ที่นี่
    const flat = new Map();
    const nameOf = (abs) => {
      if (flat.has(abs)) return flat.get(abs);
      const json = abs.endsWith('.json');
      const base = path.basename(abs).replace(/\.(tsx?|json)$/, '').replace(/[^\w-]/g, '_');
      const name = `m${flat.size}_${base}${json ? '.json' : '.mjs'}`;
      flat.set(abs, name);
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
    const done = new Set();
    const queue = [entry];
    while (queue.length) {
      const abs = queue.shift();
      if (done.has(abs)) continue;
      done.add(abs);
      if (abs.endsWith('.json')) {
        writeFileSync(path.join(tmpDir, nameOf(abs)), readFileSync(abs));
        continue;
      }
      const js = ts.transpileModule(readFileSync(abs, 'utf8'), {
        fileName: path.basename(abs),
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText;
      const rewritten = js.replace(SPEC, (whole, head, q, spec) => {
        const dep = resolve(spec, abs);
        if (!dep) return whole;
        if (!done.has(dep)) queue.push(dep);
        // node บังคับให้ import JSON ต้องมี attribute กำกับ ไม่งั้นโยน ERR_IMPORT_ATTRIBUTE_MISSING
        const attr = dep.endsWith('.json') && !head.includes('(') ? " with { type: 'json' }" : '';
        return `${head}${q}./${nameOf(dep)}${q}${attr}`;
      });
      writeFileSync(path.join(tmpDir, nameOf(abs)), rewritten, 'utf8');
    }

    return await import(pathToFileURL(path.join(tmpDir, nameOf(entry))).href);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** อ่านไฟล์ .ts/.tsx ทั้งหมดใต้โฟลเดอร์ UI */
function collectUiFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  for (const d of UI_DIRS) {
    const abs = path.join(ROOT, d);
    if (existsSync(abs)) walk(abs);
  }
  return out.map((abs) => ({
    rel: path.relative(ROOT, abs).replace(/\\/g, '/'),
    raw: readFileSync(abs, 'utf8'),
  }));
}

/**
 * แทนคอมเมนต์ด้วยช่องว่างที่ยาวเท่ากัน — ตัดเนื้อหาออกแต่เก็บตำแหน่งตัวอักษรไว้ครบ
 * ต้องเก็บตำแหน่ง ไม่งั้นเลขบรรทัดใน error จะเพี้ยนแล้วคนแก้หาบรรทัดไม่เจอ
 *
 * คอมเมนต์ไม่ใช่ข้อความที่ผู้ใช้เห็น จึงห้ามเอามานับเป็นคำอ้าง — ของเดิมในโปรเจกต์นี้
 * มีคอมเมนต์ที่ยกคำว่า "การันตีกำไร" มาอธิบายว่าห้ามเขียน ถ้าไม่ตัดออกจะแดงผิดตัว
 */
function stripComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  // ตัวจับต้องขี้เกียจ (*?) เสมอ — ของเดิมเคยใช้กฎ `{/* … */}` ที่บังคับให้ปิดด้วย `}`
  // พอไฟล์ไหนไม่มี `*/}` ตัวถัดไปใกล้ ๆ regex จะถอยไปหาตัวที่ไกลกว่าแล้วกลืนโค้ดจริงไปทั้งก้อน
  // (เจอจริง: SignalCard.tsx โดนกลืนจนบรรทัดที่มีเงื่อนไข `< 0` หายไป ด่าน 2 เลยแดงผิดตัว)
  // เลิกใช้กฎนั้น — ลบ /* … */ แบบขี้เกียจอย่างเดียวก็พอ เหลือ `{ }` ว่าง ๆ ซึ่งไม่มีข้อความ
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, head) => head + blank(m.slice(head.length))); // // line (เว้น https://)
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

/** ตัดข้อความยาว ๆ ให้พอเห็นบริบทแต่ไม่ท่วมจอ */
const snip = (s, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ═══════════════════════════════════════════════════════════════════════════
// 2. เครื่องมือกลาง: อ่าน "เครื่องหมายที่ประโยคอ้าง" เทียบกับ "เลขในประโยคนั้น"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * คำที่ประกาศเครื่องหมายของตัวเลข — ประโยคที่มีคำพวกนี้ต้องมีเลขที่เครื่องหมายตรงกัน
 *
 * จงใจไม่ใส่คำว่า "กำไร" เดี่ยว ๆ: ประโยคที่ซื่อสัตย์ที่สุดในหน้านี้คือ
 * "จบเร็วไม่ได้แปลว่ากำไร ... (ติดลบ)" ซึ่งมีคำว่ากำไรอยู่ในประโยคติดลบอย่างถูกต้อง
 * ด่านนี้ตรวจเฉพาะคำที่ "ประกาศเครื่องหมาย" ตรง ๆ เท่านั้น จึงไม่แดงผิดตัว
 */
const SIGN_CLAIMS = [
  { sign: +1, words: ['พลิกเป็นบวก', 'กลับมาเป็นบวก', 'กลับเป็นบวก', 'เป็นบวก', 'เป็นกำไร', 'ได้กำไรสุทธิ', 'มีความได้เปรียบ'] },
  { sign: -1, words: ['ติดลบ', 'เป็นลบ', 'ขาดทุน', 'เสียเงิน'] },
];
const SIGN_WORD_TH = { 1: 'เป็นบวก', '-1': 'ติดลบ' };

/** ตัวเลขที่มีหน่วย R ต่อท้าย = ค่าคาดหวังต่อไม้ ซึ่งเป็นตัวที่คำอ้างพูดถึง */
const R_FIGURE = /(-|−|–)?\s*(\d+(?:\.\d+)?)\s*R\b/g;
/** ตัวเลขที่ติดเครื่องหมายลบมาชัด ๆ — ใช้เป็นตัวสำรองเมื่อประโยคไม่มีหน่วย R */
const SIGNED_FIGURE = /(-|−|–)\s*(\d+(?:\.\d+)?)/g;

/** มีคำปฏิเสธนำหน้าไหม (เช่น "ไม่ใช่การรับประกัน") — ถ้ามี ประโยคนั้นไม่ได้อ้าง แต่กำลังปฏิเสธ */
const negatedAt = (text, at) => text.slice(Math.max(0, at - 14), at).includes('ไม่');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ตัวจับคำอ้างเครื่องหมายทั้งหมดในครั้งเดียว เรียงคำยาวขึ้นก่อน
 * ต้องเรียงยาวก่อนเพราะ "เป็นบวก" เป็นส่วนหนึ่งของ "พลิกเป็นบวก" — ถ้าไม่เรียง
 * จะได้สองรายงานที่ตำแหน่งเดียวกัน แล้วคนแก้จะนึกว่ามีสองบั๊ก
 */
const SIGN_WORDS = SIGN_CLAIMS
  .flatMap(({ sign, words }) => words.map((w) => ({ w, sign })))
  .sort((a, b) => b.w.length - a.w.length);
const SIGN_WORD_RE = new RegExp(SIGN_WORDS.map((x) => escapeRe(x.w)).join('|'), 'g');
const SIGN_OF_WORD = new Map(SIGN_WORDS.map((x) => [x.w, x.sign]));

/**
 * ตรวจข้อความหนึ่งก้อนว่ามีประโยคไหน "อ้างเครื่องหมายหนึ่ง แต่แบกเลขอีกเครื่องหมาย"
 * ซอยด้วย · และขึ้นบรรทัดใหม่ เพราะ UI ใช้ · เป็นตัวคั่นความคิดจริง ๆ
 * (ประโยค "ติดลบ" กับ "พลิกเป็นบวก" ของเดิมอยู่คนละฝั่งของ · ในสตริงเดียวกัน)
 */
function auditClaimText(text) {
  const bad = [];
  for (const clause of text.split(/[·\n;]/)) {
    const c = clause.trim();
    if (!c) continue;

    let figures = [...c.matchAll(R_FIGURE)].map((m) => ({
      value: (m[1] ? -1 : 1) * Number(m[2]),
      unit: 'R',
      raw: m[0].trim(),
    }));
    if (figures.length === 0) {
      figures = [...c.matchAll(SIGNED_FIGURE)].map((m) => ({
        value: -Number(m[2]),
        unit: '',
        raw: m[0].trim(),
      }));
    }
    if (figures.length === 0) continue; // ไม่มีเลขให้ค้าน = ไม่ใช่เรื่องของด่านนี้

    for (const { sign, words } of SIGN_CLAIMS) {
      for (const w of words) {
        const at = c.indexOf(w);
        if (at < 0 || negatedAt(c, at)) continue;
        const wrong = figures.filter((f) => Math.sign(f.value) !== 0 && Math.sign(f.value) !== sign);
        if (wrong.length) {
          bad.push({
            clause: c,
            word: w,
            claimed: SIGN_WORD_TH[String(sign)],
            figures: wrong.map((f) => f.raw).join(' · '),
          });
        }
      }
    }
  }
  return bad;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ด่านต่าง ๆ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ด่าน 1 — ไล่ทุกกองข้อมูล แล้วให้ **ตัวอ่านตัวจริง** ประกอบข้อความที่ UI จะแสดง
 *          จากนั้นตรวจว่าไม่มีประโยคไหนขัดกับตัวเลขของตัวเอง
 *
 * ประชากรที่ไล่: ทุกคู่ที่วัดไว้ (เดินเส้นทาง basis 'pair')
 *              + ทุกคีย์ในกองรวมตลาด×timeframe (เดินเส้นทางถอยไปค่ากลางตลาด)
 *              + ทุก timeframe โดยส่งชื่อตลาดว่าง (เส้นทางเดียวกับ POOLED_1H ในหน้าเว็บ)
 */
function checkGeneratedText(reader, data) {
  const inputs = [];
  for (const p of data.pairs) inputs.push({ symbol: p.symbol, market: p.market, timeframe: p.timeframe, pool: `คู่ ${p.symbol} (${p.market}|${p.timeframe})` });
  for (const key of Object.keys(data.pooled.gatedByMarketTimeframe)) {
    const [market, tf] = key.split('|');
    inputs.push({ symbol: '__POOL__', market, timeframe: tf, pool: `กอง ${key}` });
  }
  for (const tf of Object.keys(data.pooled.gatedByTimeframe)) {
    inputs.push({ symbol: '__POOL__', market: '', timeframe: tf, pool: `กองรวมทั้ง ${tf}` });
  }

  let strings = 0;
  const seen = new Set();

  for (const input of inputs) {
    const result = reader.speedScore(input);
    const texts = [
      ...result.warnings.map((t) => ({ t, from: 'speedScore().warnings' })),
      { t: reader.explainSpeedScore(result), from: 'explainSpeedScore()' },
      { t: reader.validationNote(input.timeframe) ?? '', from: 'validationNote()' },
    ];
    for (const { t, from } of texts) {
      if (!t) continue;
      strings++;
      for (const b of auditClaimText(t)) {
        const dedupe = `${from}|${b.clause}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        report({
          check: 'ข้อความที่ตัวอ่านประกอบขึ้น ขัดกับตัวเลขของตัวเอง',
          where: `${READER_TS} · ${from} · ${input.pool}`,
          claim: snip(b.clause),
          contradicts: `คำว่า "${b.word}" อ้างว่า${b.claimed} แต่เลขในประโยคเดียวกันคือ ${b.figures}`,
          evidence:
            `${from} ประกาศตัวเองว่าเป็น "ข้อความไทยที่ควรแสดงคู่กับคะแนน" และหน้าเว็บเรียกฟังก์ชันนี้อยู่แล้ว — ` +
            'ประโยคนี้จึงห่างจากหน้าจอแค่การ map ครั้งเดียว',
          fix: 'ลบประโยคนั้นทิ้ง (ห้ามเพิ่มเงื่อนไขซ้อนให้ประโยคเดิมยังอยู่ได้ในบางกรณี)',
        });
      }
    }
  }
  if (!findings.length) ok('ด่าน 1', `ตรวจข้อความจากตัวอ่านจริง ${strings} ประโยค จาก ${inputs.length} ประชากร — ไม่มีประโยคไหนขัดกับตัวเลขของตัวเอง`);
}

/**
 * สร้าง "หลักฐานว่าเลขช่องไหนติดลบได้จริง" จากการเรียก gatedSpeedStats() ตัวจริงทุกกอง
 * ใช้เป็นตัวค้ำด่าน 2: ถ้าไม่มีกองไหนติดลบเลย คำอ้างว่าบวกก็ไม่ใช่คำอ้างเท็จ ด่านต้องเขียว
 */
function buildNegativeEvidence(reader, data) {
  const negatives = new Map(); // ชื่อช่อง → [{pool, value}]
  const add = (field, pool, value) => {
    if (typeof value !== 'number' || !(value < 0)) return;
    if (!negatives.has(field)) negatives.set(field, []);
    negatives.get(field).push({ pool, value });
  };
  const pools = [
    ...Object.keys(data.pooled.gatedByMarketTimeframe).map((k) => [k.split('|')[0], k.split('|')[1], `pooled.gatedByMarketTimeframe["${k}"]`]),
    ...Object.keys(data.pooled.gatedByTimeframe).map((tf) => ['', tf, `pooled.gatedByTimeframe["${tf}"]`]),
  ];
  for (const [market, tf, label] of pools) {
    const g = reader.gatedSpeedStats(market, tf);
    for (const [field, value] of Object.entries(g)) add(field, label, value);
  }
  // ช่องรายคู่ที่การ์ดหยิบไปโชว์ตรง ๆ
  for (const p of data.pairs) {
    add('medianHoldBarsWin', `pairs[${p.symbol}|${p.market}|${p.timeframe}]`, p.medianHoldBarsWin);
  }
  return negatives;
}

/** ชื่อช่องตัวเลขทั้งหมดที่ UI หยิบไปโชว์ได้ — ดึงจากรูปร่างข้อมูลจริง ไม่ได้พิมพ์รายชื่อไว้เอง */
function metricFieldNames(reader, data) {
  const tf = Object.keys(data.pooled.gatedByTimeframe)[0];
  const names = new Set(Object.keys(reader.gatedSpeedStats('', tf)));
  for (const k of Object.keys(data.pairs[0] ?? {})) names.add(k);
  return names;
}

/**
 * ด่าน 2 — คำอ้างเครื่องหมายในซอร์ส UI ต้องมี "ตัวคุมเครื่องหมาย" ของเลขที่มันพิมพ์
 *
 * ทำไมต้องตรวจที่ซอร์ส: การ์ดประกอบข้อความด้วย JSX ไม่ได้ export ฟังก์ชันประกอบข้อความ
 * ออกมาให้เรียก (ดู residual risk) ด่านนี้จึงตรวจความสัมพันธ์ "คำอ้าง ↔ ตัวคุม" แทน
 * ไม่ได้ลอกสูตรของ UI มาคำนวณซ้ำ
 *
 * ตรรกะ: ไล่หา "เลขที่ถูกพิมพ์ออกจอ" ทุกตัว แล้วจับคู่กับคำอ้างเครื่องหมายที่ใกล้ที่สุด
 * (ป้ายกับเลขบน JSX อยู่ติดกันเสมอ จะนำหน้าหรือตามหลังก็ได้ตามไวยากรณ์ไทย)
 * ช่องที่ถูกจับคู่แล้วต้องมีเงื่อนไขคุมเครื่องหมายอยู่ในไฟล์ ถ้าไม่มี และข้อมูลจริง
 * มีกองที่ช่องนั้นเครื่องหมายตรงข้ามกับคำอ้าง = คำอ้างเท็จที่รอวันขึ้นจอ
 *
 * จับคู่ "ตัวที่ใกล้ที่สุด" ไม่ใช่ "ทุกตัวในหน้าต่าง" เพราะย่อหน้าเดียวมักมีสองประโยค
 * (ประโยคติดลบ + ประโยคบวก) การจับทุกคู่จะได้รายงานไขว้ที่ไม่มีอยู่จริงเต็มไปหมด
 */
const CLAIM_ATTACH_CHARS = 220;

function checkSourceSignGuards(files, negatives, metricNames) {
  let checked = 0;

  for (const f of files) {
    const src = stripComments(f.raw);

    const claims = [...src.matchAll(SIGN_WORD_RE)]
      .filter((m) => !negatedAt(src, m.index))
      .map((m) => ({ at: m.index, word: m[0], sign: SIGN_OF_WORD.get(m[0]) }));
    if (!claims.length) continue;
    checked += claims.length;

    // ทุกจุดที่ค่าตัวเลขถูกพิมพ์ออกจอ — ทั้ง {x.toFixed(n)} และ {x} เปล่า ๆ
    const prints = [];
    for (const re of [
      /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*[!?]?\.toFixed\s*\(/g,
      /\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}/g,
    ]) {
      for (const m of src.matchAll(re)) prints.push({ at: m.index, field: m[1].split('.').pop() });
    }

    const seen = new Set();
    for (const p of prints) {
      if (!metricNames.has(p.field)) continue;
      const evidence = negatives.get(p.field);
      if (!evidence || !evidence.length) continue; // ข้อมูลไม่ค้าน = ไม่ใช่คำอ้างเท็จ

      let nearest = null;
      for (const c of claims) {
        const d = Math.abs(c.at - p.at);
        if (d > CLAIM_ATTACH_CHARS) continue;
        if (!nearest || d < nearest.d) nearest = { ...c, d };
      }
      if (!nearest) continue;

      const guard = nearest.sign > 0
        ? new RegExp(`${p.field}\\s*>=?\\s*0`)
        : new RegExp(`${p.field}\\s*<=?\\s*0`);
      if (guard.test(src)) continue;

      const key = `${nearest.at}|${p.field}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const worst = evidence.reduce((a, b) => (b.value < a.value ? b : a));
      report({
        check: 'คำอ้างเครื่องหมายในซอร์ส UI ไม่มีตัวคุมเครื่องหมาย',
        where: `${f.rel}:${lineOf(f.raw, nearest.at)}`,
        claim: `"${nearest.word}" แสดงคู่กับค่าจากช่อง ${p.field} (บรรทัด ${lineOf(f.raw, p.at)})`,
        contradicts:
          `ไฟล์นี้ไม่มีเงื่อนไข \`${p.field} ${nearest.sign > 0 ? '> 0' : '< 0'}\` คุมอยู่เลย ` +
          `ประโยคจึงพิมพ์ออกจอแม้ ${p.field} จะ${nearest.sign > 0 ? 'ติดลบ' : 'เป็นบวก'}`,
        evidence:
          `ข้อมูลจริงมี ${evidence.length} กองที่ ${p.field} ติดลบ · แย่สุดคือ ${worst.pool} = ${worst.value}`,
        fix: `ลบประโยค "${nearest.word}" ทิ้ง — ถ้าจะเก็บไว้ต้องเป็นประโยคที่พูดถึงเครื่องหมายจริงของ ${p.field} ทุกกรณี`,
      });
    }
  }
  if (!findings.some((x) => x.check.startsWith('คำอ้างเครื่องหมายในซอร์ส'))) {
    ok('ด่าน 2', `ตรวจคำอ้างเครื่องหมายในซอร์ส UI ${checked} จุด — ทุกจุดมีตัวคุมเครื่องหมาย หรือข้อมูลไม่ค้าน`);
  }
}

/**
 * ด่าน 3 — UI ต้องเคารพ readerPolicy
 *
 * สองส่วน:
 *   ก) ตัวอ่านตัวจริงต้องไม่คืน basis 'pair' ให้ timeframe ที่ usePerPairSpeed = false
 *   ข) ไฟล์ UI ที่ดึงแถวรายคู่มาเอง (scorecardPair / medianHoldBarsWin) ต้องอ้างถึง policy
 *      ไม่งั้นมันข้ามด่านของตัวอ่านไปหยิบเลขรายคู่ของ timeframe ที่ห้ามใช้มาโชว์
 */
function checkReaderPolicy(reader, data, files) {
  const forbidden = Object.entries(data.readerPolicy)
    .filter(([, p]) => p.usePerPairSpeed === false)
    .map(([tf]) => tf);
  if (!forbidden.length) {
    ok('ด่าน 3', 'ไม่มี timeframe ไหนที่ readerPolicy ห้ามใช้ตัวเลขรายคู่');
    return;
  }

  // ก) เส้นทางผ่านตัวอ่าน
  let leaked = 0;
  for (const p of data.pairs) {
    if (!forbidden.includes(p.timeframe.toUpperCase())) continue;
    const r = reader.speedScore({ symbol: p.symbol, market: p.market, timeframe: p.timeframe });
    if (r.basis === 'pair') {
      leaked++;
      if (leaked <= 3) {
        report({
          check: 'ตัวอ่านไม่เคารพ readerPolicy',
          where: `${READER_TS} · speedScore()`,
          claim: `คู่ ${p.symbol}|${p.market}|${p.timeframe} ได้ basis = 'pair'`,
          contradicts: `readerPolicy["${p.timeframe}"].usePerPairSpeed = false`,
          evidence: `validationSummary["${p.timeframe}"].verdict = ${data.validationSummary[p.timeframe]?.verdict}`,
          fix: 'ถอยไปใช้ค่ากลางของกลุ่มเมื่อ policy ห้าม',
        });
      }
    }
  }

  // ข) เส้นทางที่ UI ดึงแถวรายคู่มาเอง
  const PER_PAIR = ['scorecardPair', 'medianHoldBarsWin', 'pairReliable'];
  const POLICY = ['usePerPairSpeed', 'readerPolicy', 'perPairSpeedAllowed', 'mayUsePerPairSpeed'];
  const uiHasPolicy = files.some((f) => POLICY.some((t) => stripComments(f.raw).includes(t)));

  const affected = data.pairs.filter((p) => forbidden.includes(p.timeframe.toUpperCase()));
  for (const f of files) {
    const src = stripComments(f.raw);
    for (const token of PER_PAIR) {
      const at = src.indexOf(token);
      if (at < 0 || uiHasPolicy) continue;
      report({
        check: 'UI ใช้ตัวเลขรายคู่โดยไม่เช็ก readerPolicy',
        where: `${f.rel}:${lineOf(f.raw, at)}`,
        claim: `อ่านค่ารายคู่ผ่าน \`${token}\` แล้วเอาไปแสดง/จัดลำดับ`,
        contradicts: `ไม่มีไฟล์ไหนใน ${UI_DIRS.join(' · ')} อ้างถึง ${POLICY.join(' / ')} เลย — ไม่มีเส้นทางไหนที่ policy ถูกอ่าน`,
        evidence:
          `readerPolicy บอกว่า ${forbidden.map((tf) => `${tf}.usePerPairSpeed = false`).join(' · ')} ` +
          `· กระทบ ${affected.length} คู่ที่วัดไว้ (เช่น ${affected.slice(0, 3).map((p) => p.symbol).join(', ')})`,
        fix: `กันตัวเลขรายคู่ของ ${forbidden.join('/')} ไม่ให้ขึ้นจอ — วิธีที่สั้นที่สุดคือหยุดอ่าน ${token} ใน UI`,
      });
      break; // รายงานไฟล์ละครั้งพอ ไม่ต้องท่วมด้วยทุกบรรทัด
    }
  }

  if (!findings.some((x) => x.check.includes('readerPolicy'))) {
    ok('ด่าน 3', `readerPolicy ห้ามตัวเลขรายคู่ของ ${forbidden.join(', ')} — ทั้งตัวอ่านและ UI เคารพครบ`);
  }
}

/**
 * ด่าน 4 — ตัวเรียงต้องเรียงได้จริง
 *
 * ตัวเรียงที่ทุกตัวได้ค่าเท่ากันคือปุ่มที่หลอกผู้ใช้: เขากดแล้วเชื่อว่าได้ลำดับใหม่
 * ที่มีความหมาย ทั้งที่ลำดับไม่ขยับเลย (หรือขยับเพราะตัวตัดสินเสมอ ไม่ใช่เพราะเกณฑ์)
 *
 * ตรวจเฉพาะตัวเรียงที่ UI เสนอให้กดจริง — ถ้ามีคนลบปุ่มทิ้ง ด่านนี้จะเขียวเอง
 * เทียบภายใน timeframe เดียวกัน เพราะกุญแจจริงคือ ค่าในตาราง × barMinutes
 * และ barMinutes คงที่ต่อ timeframe ความต่างจึงมาจากช่องในตารางล้วน ๆ
 */
const DEGENERATE_SHARE = 0.9;

function checkSorters(reader, data, files) {
  const uiSrc = files.map((f) => stripComments(f.raw)).join('\n');

  const sorters = [
    {
      label: 'จบเร็วที่สุด',
      keyName: 'medianHoldBarsWin × barMinutes',
      eligible: (p) => p.reliable,
      eligibleWhy: 'การ์ดโชว์เวลารายคู่เฉพาะคู่ที่ไม้ถึงเกณฑ์ (reliable)',
      value: (p) => p.medianHoldBarsWin,
    },
    {
      label: 'โอกาสถึงเป้าที่วัดได้',
      keyName: 'speedScore().score',
      eligible: () => true,
      eligibleWhy: 'ทุกคู่ที่วัดไว้',
      value: (p) => reader.speedScore({ symbol: p.symbol, market: p.market, timeframe: p.timeframe }).score,
    },
  ];

  let evaluated = 0;
  for (const s of sorters) {
    // เช็กที่ "การลงทะเบียนตัวเลือก" (label: '...') ไม่ใช่แค่คำนั้นโผล่ในไฟล์
    // เพราะหน้าเว็บอาจพูดถึงตัวเรียงที่ถอดออกไปแล้วเพื่ออธิบายว่าทำไมถึงไม่มี
    // ("ไม่มีตัวเรียง จบเร็วที่สุด — ...") ประโยคแบบนั้นคือการบอกความจริง ไม่ใช่คำอ้าง
    if (!new RegExp(`label\\s*:\\s*['"\`]${escapeRe(s.label)}['"\`]`).test(uiSrc)) continue;
    evaluated++;

    const byTf = new Map();
    for (const p of data.pairs) {
      if (!s.eligible(p)) continue;
      const tf = p.timeframe.toUpperCase();
      if (!byTf.has(tf)) byTf.set(tf, []);
      byTf.get(tf).push(s.value(p));
    }

    for (const [tf, values] of byTf) {
      if (values.length < 5) continue; // กลุ่มเล็กเกินไป การนับซ้ำไม่มีความหมาย
      const counts = new Map();
      for (const v of values) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
      const [topValue, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0];
      const share = topCount / values.length;
      if (share <= DEGENERATE_SHARE) continue;

      const cap = data.method.maxHoldBars;
      const capped = Number(topValue) >= cap - 1;
      report({
        check: 'ตัวเรียงไม่ได้เรียงอะไร',
        where: `ตัวเลือก "${s.label}" ในหน้าเว็บ (กุญแจเรียง: ${s.keyName})`,
        claim: `ผู้ใช้กดแล้วคาดว่าจะได้ลำดับใหม่ตามเกณฑ์ "${s.label}"`,
        contradicts:
          `บน ${tf} คู่ที่เข้าเกณฑ์ ${values.length} คู่ ได้กุญแจเรียงแค่ ${counts.size} ค่า ` +
          `· ${topCount}/${values.length} คู่ (${(share * 100).toFixed(1)}%) ได้ค่าเดียวกันคือ ${topValue} ` +
          `— ลำดับที่ได้จึงมาจากตัวตัดสินเสมอ ไม่ใช่จากเกณฑ์นี้`,
        evidence:
          `นับจาก ${s.eligibleWhy} ในไฟล์ข้อมูลจริง` +
          (capped ? ` · ค่า ${topValue} ชนเพดาน maxHoldBars = ${cap} ของการจำลอง จึงเป็นสมบัติของการจำลอง ไม่ใช่ของคู่นั้น` : ''),
        fix: `ลบตัวเลือก "${s.label}" ทิ้ง — เกณฑ์ที่แยกอะไรไม่ได้ ไม่ควรมีปุ่มให้กด`,
      });
    }
  }

  if (!findings.some((x) => x.check === 'ตัวเรียงไม่ได้เรียงอะไร')) {
    ok('ด่าน 4', `ตรวจตัวเรียงที่ UI เสนอจริง ${evaluated} ตัว — ทุกตัวแยกคู่ออกจากกันได้เกินเกณฑ์ ${DEGENERATE_SHARE * 100}%`);
  }
}

/**
 * ด่าน 5 — คำรับประกันผล
 *
 * ระบบนี้วัดแล้วว่าเสียเงินอย่างเป็นระบบ (avgR ติดลบทั้งช่วงความเชื่อมั่น)
 * คำที่รับประกันผลจึงเป็นคำอ้างเท็จเสมอ ไม่ว่าจะเขียนในบริบทไหน
 *
 * เงื่อนไขที่ทำให้ด่านนี้ไม่แดงผิดตัว:
 *   - ตัดคอมเมนต์ออกก่อน (คอมเมนต์ไม่ใช่ข้อความที่ผู้ใช้เห็น)
 *   - ข้ามรูปปฏิเสธ ("ไม่การันตี" · "ไม่ใช่การรับประกัน" คือประโยคที่ซื่อสัตย์)
 *   - นับเฉพาะเมื่ออยู่ประโยคเดียวกับคำที่พูดถึงผลการเทรด ไม่งั้นคำว่า "ชัวร์" ในหน้า
 *     ล็อกอิน (พูดถึงวิธีรับรหัส) จะโดนด้วย ทั้งที่ไม่ได้รับประกันผลอะไร
 */
const GUARANTEE_WORDS = ['การันตี', 'รับประกัน', 'ชัวร์', 'แน่นอน', 'ทำกำไรได้', 'กำไรแน่', 'ได้เงินแน่', 'ไม่มีทางพลาด', 'ไม่มีความเสี่ยง', 'ชนะทุกไม้', 'เข้าเป้าทุก'];
const OUTCOME_WORDS = ['กำไร', 'ขาดทุน', 'ผลตอบแทน', 'สัญญาณ', 'เป้า', 'TP', 'SL', 'ชนะ', 'R ต่อ', 'ไม้'];

function checkGuaranteeWords(files) {
  let scanned = 0;
  for (const f of files) {
    const src = stripComments(f.raw);
    for (const sentence of src.split(/[\n·]/)) {
      if (!/[฀-๿]/.test(sentence)) continue; // ไม่มีอักษรไทย = ไม่ใช่ข้อความผู้ใช้
      scanned++;
      for (const w of GUARANTEE_WORDS) {
        const at = sentence.indexOf(w);
        if (at < 0 || negatedAt(sentence, at)) continue;
        if (!OUTCOME_WORDS.some((o) => sentence.includes(o))) continue;
        const abs = src.indexOf(sentence);
        report({
          check: 'คำรับประกันผลในข้อความที่ผู้ใช้เห็น',
          where: `${f.rel}:${lineOf(f.raw, abs >= 0 ? abs + at : 0)}`,
          claim: snip(sentence.trim()),
          contradicts: `คำว่า "${w}" รับประกันผล แต่ผลวัดจริงคือระบบเสียเงินอย่างเป็นระบบ`,
          evidence: 'วัดจาก 60,959 ไม้: train avgR −0.088 [−0.110, −0.068] · validation −0.083 [−0.107, −0.057] ช่วงความเชื่อมั่นอยู่ใต้ศูนย์ทั้งช่วง',
          fix: `ลบคำว่า "${w}" ทิ้ง`,
        });
      }
    }
  }
  if (!findings.some((x) => x.check.startsWith('คำรับประกัน'))) {
    ok('ด่าน 5', `ไล่ประโยคภาษาไทยในซอร์ส UI ${scanned} ประโยค — ไม่มีคำรับประกันผล`);
  }
}

/**
 * ด่าน 6 — คำอ้างว่า "ลำดับตรงกับแจ้งเตือน"
 *
 * คำอ้างนี้พูดถึง **ประชากร** ไม่ใช่ฟังก์ชันจัดลำดับ สองฝั่งเรียกตัวจัดลำดับตัวเดียวกันจริง
 * แต่ป้อนคนละชุด: หน้าเว็บป้อนทุกแถวในตาราง ส่วนแจ้งเตือนป้อนเฉพาะแถวที่ผ่าน
 * status='active' · push_sent=false · อายุไม่เกิน 6 ชม. · ผ่าน alert_preferences · limit
 * ไฟล์นี้ไม่มี DB ให้เทียบประชากรจริงได้ จึงตรวจสิ่งที่ตรวจได้แน่ ๆ แทน:
 * ไฟล์ที่กล้าอ้างว่า "ตรงบรรทัดต่อบรรทัด" ต้องอ้างถึงตัวกรองฝั่งแจ้งเตือนด้วย
 * ถ้ามันไม่เคยรู้จักตัวกรองนั้นเลย แปลว่ามันอ้างในสิ่งที่ตัวเองไม่ได้ตรวจ
 */
const PARITY_CLAIMS = ['ตรงกับแจ้งเตือนบรรทัดต่อบรรทัด', 'ตรงกับแจ้งเตือนทุกบรรทัด', 'เหมือนแจ้งเตือนเป๊ะ', 'ตรงกับแจ้งเตือนเป๊ะ'];
const PUSH_POPULATION_TOKENS = ['push_sent', 'loadPendingSignals', 'PENDING_LIMIT', 'alert_preferences'];

function checkPushParityClaim(files) {
  let claims = 0;
  for (const f of files) {
    const src = stripComments(f.raw);
    for (const claim of PARITY_CLAIMS) {
      const at = src.indexOf(claim);
      if (at < 0) continue;
      claims++;
      if (PUSH_POPULATION_TOKENS.some((t) => src.includes(t))) continue;
      report({
        check: 'อ้างว่าลำดับตรงกับแจ้งเตือน โดยไม่ได้ใช้ประชากรเดียวกัน',
        where: `${f.rel}:${lineOf(f.raw, at)}`,
        claim: `"${claim}"`,
        contradicts:
          `ไฟล์นี้ไม่อ้างถึง ${PUSH_POPULATION_TOKENS.join(' / ')} เลย — มันจัดลำดับจากสัญญาณทุกแถวที่โหลดมา ` +
          'ส่วนแจ้งเตือนแต่ละใบเห็นเฉพาะแถวที่ยังไม่ถูกส่ง อายุไม่เกินหน้าต่างที่ตั้งไว้ และผ่านตัวกรองของผู้ใช้',
        evidence: 'ตัวจัดลำดับเป็นฟังก์ชันเดียวกันจริง แต่ "ลำดับเท่ากัน" ต้องการประชากรเท่ากันด้วย ซึ่งไฟล์นี้ไม่ได้ทำให้เท่า',
        fix: 'ลบคำว่า "บรรทัดต่อบรรทัด" ทิ้ง — พูดได้แค่ว่าใช้เกณฑ์จัดลำดับเดียวกับแจ้งเตือน',
      });
    }
  }
  if (!findings.some((x) => x.check.startsWith('อ้างว่าลำดับตรงกับแจ้งเตือน'))) {
    ok('ด่าน 6', claims ? `พบคำอ้างเรื่องลำดับ ${claims} จุด — ทุกจุดอ้างถึงตัวกรองฝั่งแจ้งเตือนด้วย` : 'ไม่มีคำอ้างว่าลำดับตรงกับแจ้งเตือนบรรทัดต่อบรรทัด');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. ทดสอบตัวตรวจเอง (--self-test)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ตัวตรวจที่เขียวตลอดเพราะมันจับอะไรไม่ได้เลย อันตรายกว่าไม่มีตัวตรวจ
 * โหมดนี้ป้อน "ไฟล์ UI ปลอม" ที่รู้คำตอบอยู่แล้วเข้าไป แล้วเช็กว่าแต่ละด่านแดง/เขียวตามที่ควร
 * รันในโปรเจกต์ตัวเอง ไม่แตะไฟล์ของใคร ไม่เขียนอะไรลงดิสก์
 */
function selfTest(reader, data) {
  const negatives = buildNegativeEvidence(reader, data);
  const metricNames = metricFieldNames(reader, data);
  const cases = [];
  const run = (name, fn, shouldFail) => {
    const before = findings.length;
    fn();
    const fired = findings.length - before;
    findings.length = before; // ไม่ให้ผลทดสอบปนกับผลตรวจจริง
    const pass = shouldFail ? fired > 0 : fired === 0;
    cases.push({ name, pass, fired, shouldFail });
  };
  const file = (raw) => [{ rel: 'ไฟล์ปลอมสำหรับทดสอบ.tsx', raw }];

  // ── ประโยคที่ตัวอ่านประกอบขึ้น ──────────────────────────────────────────
  run('ประโยค "พลิกเป็นบวก (-0.076 R)" ต้องถูกจับได้',
    () => { for (const b of auditClaimText('ค่าคาดหวังพลิกเป็นบวก (-0.076 R) เมื่อรอถึงแท่งที่ 6')) report({ check: 't', where: '', claim: b.clause, contradicts: '', evidence: '', fix: '' }); }, true);
  run('ประโยค "พลิกเป็นบวก (0.026 R)" ต้องผ่าน',
    () => { for (const b of auditClaimText('ค่าคาดหวังพลิกเป็นบวก (0.026 R) เมื่อรอถึงแท่งที่ 6')) report({ check: 't', where: '', claim: b.clause, contradicts: '', evidence: '', fix: '' }); }, false);
  run('ประโยค "จบเร็วไม่ได้แปลว่ากำไร ... -0.048 R (ติดลบ)" ต้องผ่าน',
    () => { for (const b of auditClaimText('จบเร็วไม่ได้แปลว่ากำไร: ค่าคาดหวังคือ -0.048 R ต่อไม้ (ติดลบ)')) report({ check: 't', where: '', claim: b.clause, contradicts: '', evidence: '', fix: '' }); }, false);

  // ── คำอ้างเครื่องหมายในซอร์ส ────────────────────────────────────────────
  const claimNoGuard = `<p>พลิกเป็นบวกที่ <span>{speed.expectedRWithin6.toFixed(3)}R</span></p>`;
  run('คำอ้างว่าเป็นบวก โดยไม่มี `> 0` คุม ต้องถูกจับได้',
    () => checkSourceSignGuards(file(claimNoGuard), negatives, metricNames), true);
  run('คำอ้างเดียวกันที่มี `> 0` คุม ต้องผ่าน',
    () => checkSourceSignGuards(file(`const up = speed.expectedRWithin6 > 0;\n${claimNoGuard}`), negatives, metricNames), false);
  run('คำอ้างที่อยู่ในคอมเมนต์ ต้องไม่นับ',
    () => checkSourceSignGuards(file(`/* ${claimNoGuard} */`), negatives, metricNames), false);

  // ── ตัวเรียงที่ไม่ได้เรียง ──────────────────────────────────────────────
  run('ลงทะเบียนตัวเรียง "จบเร็วที่สุด" ต้องถูกจับได้',
    () => checkSorters(reader, data, file(`const S = [{ value: 'soonest', label: 'จบเร็วที่สุด' }];`)), true);
  run('พูดถึง "จบเร็วที่สุด" เพื่ออธิบายว่าทำไมถึงไม่มี ต้องผ่าน',
    () => checkSorters(reader, data, file(`const NOTE = 'ไม่มีตัวเรียง "จบเร็วที่สุด" เพราะกุญแจเรียงแทบมีค่าเดียว';`)), false);

  // ── readerPolicy ────────────────────────────────────────────────────────
  run('UI อ่านค่ารายคู่โดยไม่เช็ก policy ต้องถูกจับได้',
    () => checkReaderPolicy(reader, data, file(`const t = scorecardPair(signal)?.medianHoldBarsWin;`)), true);
  run('อ่านค่ารายคู่พร้อมเช็ก usePerPairSpeed ต้องผ่าน',
    () => checkReaderPolicy(reader, data, file(`if (policy.usePerPairSpeed) { const t = scorecardPair(signal)?.medianHoldBarsWin; }`)), false);

  // ── คำรับประกันผล ───────────────────────────────────────────────────────
  run('"สัญญาณนี้ทำกำไรได้แน่นอน" ต้องถูกจับได้',
    () => checkGuaranteeWords(file(`<p>สัญญาณนี้ทำกำไรได้แน่นอน</p>`)), true);
  run('"ไม่ใช่การรับประกันกำไร" ต้องผ่าน',
    () => checkGuaranteeWords(file(`<p>ลำดับนี้ไม่ใช่การรับประกันกำไร</p>`)), false);
  run('"วิธีนี้ชัวร์กว่า" ในหน้าล็อกอิน (ไม่พูดถึงผลเทรด) ต้องผ่าน',
    () => checkGuaranteeWords(file(`<p>กรอกรหัส 6 หลักแทน วิธีนี้ชัวร์กว่า</p>`)), false);

  // ── คำอ้างว่าลำดับตรงกับแจ้งเตือน ───────────────────────────────────────
  run('"ตรงกับแจ้งเตือนบรรทัดต่อบรรทัด" โดยไม่รู้จักตัวกรองฝั่งแจ้งเตือน ต้องถูกจับได้',
    () => checkPushParityClaim(file(`<p>ลำดับนี้ตรงกับแจ้งเตือนบรรทัดต่อบรรทัด</p>`)), true);

  passed.length = 0;
  const failed = cases.filter((c) => !c.pass);
  for (const c of cases) console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}${c.pass ? '' : ` (คาดว่าจะ${c.shouldFail ? 'แดง' : 'เขียว'} แต่ได้ ${c.fired} finding)`}`);
  console.log(`\n${failed.length ? `ตัวตรวจเองไม่ผ่าน ${failed.length}/${cases.length} เคส` : `ตัวตรวจเองผ่านครบ ${cases.length}/${cases.length} เคส`}`);
  process.exit(failed.length ? 1 : 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. รัน
// ═══════════════════════════════════════════════════════════════════════════

const reader = await loadReader();
const data = JSON.parse(readFileSync(path.join(ROOT, DATA_JSON), 'utf8'));

if (process.argv.includes('--self-test')) selfTest(reader, data);

const files = collectUiFiles();

checkGeneratedText(reader, data);
const negatives = buildNegativeEvidence(reader, data);
checkSourceSignGuards(files, negatives, metricFieldNames(reader, data));
checkReaderPolicy(reader, data, files);
checkSorters(reader, data, files);
checkGuaranteeWords(files);
checkPushParityClaim(files);

// ── รายงาน ──────────────────────────────────────────────────────────────────
console.log(`check-ui-claims — ข้อมูลวัดเมื่อ ${data.measuredAt} · ไฟล์ UI ${files.length} ไฟล์ · คู่ที่วัดไว้ ${data.pairs.length} คู่\n`);

if (VERBOSE || !findings.length) {
  for (const p of passed) console.log(`  ✓ ${p}`);
  if (passed.length) console.log('');
}

if (!findings.length) {
  console.log('ผ่านทุกด่าน — ไม่มีข้อความไหนใน UI ที่ข้อมูลไม่รองรับ');
  process.exit(0);
}

const groups = new Map();
for (const f of findings) {
  if (!groups.has(f.check)) groups.set(f.check, []);
  groups.get(f.check).push(f);
}
for (const [check, list] of groups) {
  console.log(`✗ ${check} (${list.length})`);
  for (const f of list) {
    console.log(`\n    ที่          : ${f.where}`);
    console.log(`    ข้อความ     : ${f.claim}`);
    console.log(`    ขัดกับ      : ${f.contradicts}`);
    console.log(`    ที่มาของเลข : ${f.evidence}`);
    console.log(`    ต้องแก้      : ${f.fix}`);
  }
  console.log('');
}
console.log(`ไม่ผ่าน ${findings.length} จุด — ลบคำอ้างที่ข้อมูลไม่รองรับทิ้ง อย่าเพิ่มคำอธิบายมากลบเกลื่อน`);
process.exit(1);
