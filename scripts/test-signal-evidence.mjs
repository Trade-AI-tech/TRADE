#!/usr/bin/env node
/**
 * ชุดทดสอบตัวอ่านหลักฐานย้อนหลัง (src/lib/signal-evidence.ts)
 *
 * ทำไมต้องมี: ตัวเลขจากไฟล์นี้ขึ้นการ์ดสัญญาณที่เจ้าของใช้ตัดสินใจเรื่องเงินจริง
 * ถ้าชั้น fallback ไล่ผิด (เช่น คืนค่ารวมทุก symbol ทั้งที่มีค่าจำเพาะของตัวนั้นอยู่)
 * จะไม่มี error ให้เห็น มีแต่ตัวเลขที่ "ดูถูกต้อง" แต่ตอบคนละคำถาม
 *
 * สามเรื่องที่บังคับที่นี่:
 *   1. fallback ไล่ชั้นถูก: symbol → timeframe → global · 15m ถอยไปใช้ 1H พร้อมประกาศ
 *   2. null เมื่อไม่มีข้อมูล — ห้ามเดา ห้ามคืนศูนย์ปลอม ๆ
 *   3. ความซื่อสัตย์ของถ้อยคำ: grep ไฟล์ UI ที่ใช้ตัวอ่านนี้จริง ๆ ต้องไม่มีคำว่า
 *      "โอกาสชนะ" / "ความแม่น" — สองคำนั้นอ้างอนาคต ซึ่งข้อมูลความถี่ในอดีตไม่รองรับ
 *      (งานวิจัยของ repo วัดแล้ว: ไม่มีเซ็ตอัพไหนพิสูจน์ edge หลังต้นทุนได้)
 *
 * รัน: node scripts/test-signal-evidence.mjs   (npm run test:evidence)
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READER_TS = path.join(ROOT, 'src', 'lib', 'signal-evidence.ts');
const DATA_JSON = path.join(ROOT, 'src', 'lib', 'signal-evidence.data.json');

// ── โหลดตัวอ่านตัวจริง (ไม่ลอกสูตรมาเขียนซ้ำ — วิธีเดียวกับ check-ui-claims.mjs) ──

async function loadReader() {
  const require_ = createRequire(import.meta.url);
  let ts;
  try {
    ts = require_('typescript');
  } catch {
    console.error('ไม่พบแพ็กเกจ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่');
    process.exit(2);
  }
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'signal-evidence-'));
  try {
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
      else return null;
      if (spec.endsWith('.json')) return existsSync(base) ? base : null;
      for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        if (existsSync(c) && statSync(c).isFile()) return c;
      }
      return null;
    };
    const SPEC = /((?:^|[\s;{}])(?:from|import)\s*\(?\s*)(['"])([^'"]+)\2/g;
    const done = new Set();
    const queue = [READER_TS];
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
        const attr = dep.endsWith('.json') && !head.includes('(') ? " with { type: 'json' }" : '';
        return `${head}${q}./${nameOf(dep)}${q}${attr}`;
      });
      writeFileSync(path.join(tmpDir, nameOf(abs)), rewritten, 'utf8');
    }
    return await import(pathToFileURL(path.join(tmpDir, nameOf(READER_TS))).href);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (!existsSync(DATA_JSON)) {
  console.error(`ไม่พบ ${DATA_JSON} — รัน node scripts/research/build-signal-evidence.mjs ก่อน`);
  process.exit(1);
}
const data = JSON.parse(readFileSync(DATA_JSON, 'utf8'));
const reader = await loadReader();
const { lookupEvidence } = reader;

let pass = 0;
let fail = 0;
function t(name, cond, detail) {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ═══ 1. รูปร่างของไฟล์ข้อมูล — ทุกเซลล์ n >= minN และสัดส่วนรวมเป็น 1 ═══

console.log('── ไฟล์ข้อมูล: เกณฑ์ n และผลรวมสัดส่วน ──');
{
  const minN = data.minN ?? 30;
  let cells = 0;
  let smallN = 0;
  let badSum = 0;
  for (const layer of ['symbol', 'timeframe', 'global']) {
    for (const c of Object.values(data.cells?.[layer] ?? {})) {
      cells++;
      if (!(c.n >= minN)) smallN++;
      if (Math.abs(c.tpFirstPct + c.slFirstPct + c.timeoutPct - 1) > 1e-9) badSum++;
    }
  }
  t(`มีเซลล์อย่างน้อยหนึ่งเซลล์ (ได้ ${cells})`, cells > 0);
  t(`ทุกเซลล์ n >= ${minN}`, smallN === 0, `ต่ำกว่าเกณฑ์ ${smallN} เซลล์`);
  t('ทุกเซลล์ tp+sl+timeout = 1 ± 1e-9', badSum === 0, `เกินคลาด ${badSum} เซลล์`);
  t('ไฟล์ติดป้าย "ในอดีต" กำกับความหมาย', typeof data.note === 'string' && data.note.includes('ในอดีต'));
}

// ═══ 2. fallback ไล่ชั้นถูก ═══

console.log('── fallback: symbol → timeframe → global ──');
{
  const symKeys = Object.keys(data.cells.symbol);
  t('มีเซลล์ชั้น symbol ให้ทดสอบ', symKeys.length > 0);
  if (symKeys.length) {
    const key = symKeys[0];
    const [sym, tf, action, strength] = key.split('|');
    const cell = data.cells.symbol[key];
    const r = lookupEvidence(sym, tf, action, strength);
    t('เจอชั้น symbol เมื่อมีค่าจำเพาะ', r?.level === 'symbol', `ได้ ${r?.level}`);
    t('ค่าตรงกับเซลล์ในไฟล์ทุกช่อง',
      !!r && Object.is(r.n, cell.n) && Object.is(r.tpFirstPct, cell.tpFirstPct)
      && Object.is(r.slFirstPct, cell.slFirstPct) && Object.is(r.timeoutPct, cell.timeoutPct)
      && r.sourceTimeframe === cell.sourceTimeframe && r.spanYears === cell.spanYears);

    // ชั้น symbol ต้องชนะชั้น timeframe เมื่อสองชั้นมีค่าไม่เท่ากัน
    const tfCell = data.cells.timeframe[`${tf}|${action}|${strength}`];
    if (tfCell && tfCell.n !== cell.n) {
      t('ชั้น symbol ชนะชั้น timeframe', r?.n === cell.n && r?.n !== tfCell.n);
    }
  }

  const tfKeys = Object.keys(data.cells.timeframe);
  if (tfKeys.length) {
    const [tf, action, strength] = tfKeys[0].split('|');
    const r = lookupEvidence('ZZZ_ไม่มีตัวนี้', tf, action, strength);
    t('symbol แปลกหน้า → ถอยไปชั้น timeframe', r?.level === 'timeframe', `ได้ ${r?.level}`);
    t('ชั้น timeframe ให้ n ตรงกับเซลล์รวม', r?.n === data.cells.timeframe[tfKeys[0]].n);
  }

  // strength ที่ไม่เคยผ่านประตูเลย (เช่น weak — SIGNAL_GATE ขั้นต่ำคือ strong)
  // ต้องถอยถึงชั้น global ซึ่งไม่แยก strength
  const globalKeys = Object.keys(data.cells.global);
  if (globalKeys.length) {
    const [tf, action] = globalKeys[0].split('|');
    const missingStrength = ['weak', 'moderate', 'strong', 'very_strong']
      .find((s) => !data.cells.timeframe[`${tf}|${action}|${s}`]);
    if (missingStrength) {
      const r = lookupEvidence('ZZZ_ไม่มีตัวนี้', tf, action, missingStrength);
      t(`strength ที่ไม่มีข้อมูล (${missingStrength}) → ถอยถึงชั้น global`, r?.level === 'global', `ได้ ${r?.level}`);
    }
    // ตัวพิมพ์เล็ก/ใหญ่ของ timeframe ต้องไม่เปลี่ยนคำตอบ
    const a = lookupEvidence('ZZZ_ไม่มีตัวนี้', tf, action, 'strong');
    const b = lookupEvidence('ZZZ_ไม่มีตัวนี้', tf.toLowerCase(), action, 'strong');
    t('timeframe พิมพ์เล็กได้คำตอบเดียวกัน', JSON.stringify(a) === JSON.stringify(b));
  }
}

// ═══ 3. 15m ต้องได้ข้อมูล 1H พร้อมประกาศ sourceTimeframe ตรง ๆ ═══

console.log('── 15m → ค่าประมาณจากกรอบ 1H ──');
{
  const oneHourKey = Object.keys(data.cells.global).find((k) => k.startsWith('1H|'));
  if (!oneHourKey) {
    t('มีข้อมูล 1H ให้ 15m ถอยไปใช้', false, 'ไม่มีเซลล์ global ของ 1H เลย');
  } else {
    const [, action] = oneHourKey.split('|');
    const from15m = lookupEvidence('ZZZ_ไม่มีตัวนี้', '15m', action, 'ไม่มีชั้นนี้');
    const from1H = lookupEvidence('ZZZ_ไม่มีตัวนี้', '1H', action, 'ไม่มีชั้นนี้');
    t('15m คืนคำตอบเดียวกับ 1H ทุกช่อง', JSON.stringify(from15m) === JSON.stringify(from1H));
    t("15m ประกาศ sourceTimeframe = '1H'", from15m?.sourceTimeframe === '1H', `ได้ ${from15m?.sourceTimeframe}`);
  }
}

// ═══ 4. null เมื่อไม่มีข้อมูล — ห้ามเดา ═══

console.log('── กรณีที่ต้องได้ null ──');
{
  t('action HOLD → null (ไม่มีเรขาคณิต SL/TP ให้เทียบ)', lookupEvidence('XAUUSD', '1D', 'HOLD', 'strong') === null);
  t('action CLOSE → null', lookupEvidence('XAUUSD', '1D', 'CLOSE', 'strong') === null);
  t('timeframe ที่ไม่รู้จัก → null', lookupEvidence('XAUUSD', '2W', 'BUY', 'strong') === null);
  t('timeframe ว่าง → null', lookupEvidence('XAUUSD', '', 'BUY', 'strong') === null);
}

// ═══ 5. ความซื่อสัตย์ของถ้อยคำในไฟล์ UI ที่ใช้ตัวอ่านนี้ (grep จริง) ═══

console.log('── คำต้องห้ามในไฟล์ UI ที่ใช้ signal-evidence ──');
{
  // สองคำนี้อ้าง "อนาคต" ซึ่งความถี่ในอดีตไม่รองรับ — ดูข้อบังคับหัวไฟล์ signal-evidence.ts
  const FORBIDDEN = ['โอกาสชนะ', 'ความแม่น'];

  // คอมเมนต์ไม่ใช่ข้อความที่ผู้ใช้เห็น — ตัดทิ้งก่อนตรวจ (ท่าเดียวกับ check-ui-claims.mjs
  // เพราะข้อบังคับหัวไฟล์จำเป็นต้องเอ่ยชื่อคำต้องห้ามเพื่อสั่งห้ามมัน)
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, head) => head + m.slice(head.length).replace(/[^\n]/g, ' '));

  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ['src/app', 'src/components']) {
    const abs = path.join(ROOT, d);
    if (existsSync(abs)) walk(abs);
  }

  const consumers = files.filter((f) => {
    const raw = readFileSync(f, 'utf8');
    return raw.includes('signal-evidence') || raw.includes('lookupEvidence');
  });
  t('มีไฟล์ UI ที่ใช้ตัวอ่านนี้จริงอย่างน้อยหนึ่งไฟล์', consumers.length > 0,
    'ไม่มีไฟล์ไหนใน src/app · src/components อ้างถึง signal-evidence เลย');

  // ตรวจทั้งไฟล์ผู้ใช้และตัวอ่านเอง (string ใน .ts ก็หลุดขึ้นจอได้ถ้ามีใคร export ข้อความ)
  for (const f of [...consumers, READER_TS]) {
    const cleaned = stripComments(readFileSync(f, 'utf8'));
    for (const w of FORBIDDEN) {
      const at = cleaned.indexOf(w);
      t(`${path.relative(ROOT, f)} ไม่มีคำว่า "${w}"`, at < 0,
        `พบที่บรรทัด ${cleaned.slice(0, at).split('\n').length} — ใช้รูป "ในอดีต...%" แทน`);
    }
  }

  // ไฟล์ UI ที่แสดงตัวเลขชุดนี้ ต้องพูดในรูป "ในอดีต" อย่างน้อยหนึ่งครั้ง
  for (const f of consumers) {
    const cleaned = stripComments(readFileSync(f, 'utf8'));
    t(`${path.relative(ROOT, f)} พูดในรูป "ในอดีต"`, cleaned.includes('ในอดีต'));
  }
}

console.log(`\nผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
