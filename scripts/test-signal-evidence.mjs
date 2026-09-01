#!/usr/bin/env node
/**
 * ชุดทดสอบตัวอ่านหลักฐานย้อนหลัง (src/lib/signal-evidence.ts)
 *
 * ทำไมต้องมี: ตัวเลขจากไฟล์นี้ขึ้นการ์ดสัญญาณที่เจ้าของใช้ตัดสินใจเรื่องเงินจริง
 * ถ้าชั้น fallback ไล่ผิด (เช่น คืนค่ารวมทุก symbol ทั้งที่มีค่าจำเพาะของตัวนั้นอยู่)
 * จะไม่มี error ให้เห็น มีแต่ตัวเลขที่ "ดูถูกต้อง" แต่ตอบคนละคำถาม
 *
 * สี่เรื่องที่บังคับที่นี่:
 *   1. fallback ไล่ชั้นถูก: symbol → timeframe → global · 15m ถอยไปใช้ 1H พร้อมประกาศ
 *   2. null เมื่อไม่มีข้อมูล — ห้ามเดา ห้ามคืนศูนย์ปลอม ๆ
 *   3. **ด่านความบริสุทธิ์ของชั้นรวม** (เพิ่มเมื่อ 2026-08-29): ชั้น timeframe/global
 *      ใช้ได้เฉพาะเมื่อทุก symbol ในตารางอยู่ในจักรวาลที่สแกนจริง ไม่งั้นต้องคืน null
 *      แทนที่จะแปะค่าเฉลี่ยของสินทรัพย์ที่เจ้าของเลิกเทรดแล้วลงบนการ์ด
 *      เทสต์นี้ตรวจ "กติกา" ไม่ใช่ "ผลลัพธ์วันนี้" — พอวันไหนตารางถูกสร้างใหม่จาก
 *      จักรวาลปัจจุบัน ชั้นรวมกลับมาใช้ได้เอง และเทสต์ชุดเดิมนี้ต้องยังเขียว
 *   4. ความซื่อสัตย์ของถ้อยคำ: grep ไฟล์ UI ที่ใช้ตัวอ่านนี้จริง ๆ ต้องไม่มีคำว่า
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
const UNIVERSE_TS = path.join(ROOT, 'src', 'lib', 'universe.ts');
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
    // โหลดจักรวาลตัวจริงมาด้วย เพราะด่านความบริสุทธิ์ของชั้นรวมเทียบกับ SYMBOL_UNIVERSE
    // (ตัวอ่าน import มันอยู่แล้ว แต่ไม่ได้ re-export ให้ — เทสต์ต้องคำนวณค่าที่คาดหวังเอง
    //  จากของจริง ไม่ใช่ก๊อปรายชื่อ symbol มาแปะไว้ที่นี่แล้วเพี้ยนตามหลัง)
    const queue = [READER_TS, UNIVERSE_TS];
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
    return {
      reader: await import(pathToFileURL(path.join(tmpDir, nameOf(READER_TS))).href),
      universe: await import(pathToFileURL(path.join(tmpDir, nameOf(UNIVERSE_TS))).href),
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (!existsSync(DATA_JSON)) {
  console.error(`ไม่พบ ${DATA_JSON} — รัน node scripts/research/build-signal-evidence.mjs ก่อน`);
  process.exit(1);
}
const data = JSON.parse(readFileSync(DATA_JSON, 'utf8'));
const { reader, universe } = await loadReader();
const { lookupEvidence } = reader;

/**
 * ตารางนี้บริสุทธิ์กับจักรวาลปัจจุบันไหม — คำนวณเองจากไฟล์ข้อมูล + จักรวาลตัวจริง
 * ไม่ได้ถามตัวอ่าน เพราะถ้าถามมัน เทสต์จะกลายเป็น "ตัวอ่านตรงกับตัวเอง" ซึ่งพิสูจน์อะไรไม่ได้
 * (ค่าที่ตัวอ่านคำนวณได้ถูกเทียบกับค่านี้อีกทีในหมวด "ด่านความบริสุทธิ์" ข้างล่าง)
 */
const universeSymbols = new Set(universe.SYMBOL_UNIVERSE.map((u) => u.symbol.toUpperCase()));
const tableSymbols = [...new Set(Object.keys(data.cells.symbol).map((k) => k.split('|')[0].toUpperCase()))];
const AGG_EXPECTED = tableSymbols.length > 0 && tableSymbols.every((s) => universeSymbols.has(s));
/** symbol ที่ไม่มีทางอยู่ในตาราง — ใช้บังคับให้ตัวอ่านต้องถอยชั้น */
const STRANGER = 'ZZZ_ไม่มีตัวนี้';

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

  // ── ชั้นรวม: ผลลัพธ์ขึ้นกับด่านความบริสุทธิ์ ต้องตรวจให้ตรงกับกติกา ไม่ใช่ตรงกับ
  //    พฤติกรรมของวันนี้ · AGG_EXPECTED คำนวณจากไฟล์ข้อมูล + จักรวาลตัวจริงข้างบน
  const tfKeys = Object.keys(data.cells.timeframe);
  if (tfKeys.length) {
    const [tf, action, strength] = tfKeys[0].split('|');
    const r = lookupEvidence(STRANGER, tf, action, strength);
    if (AGG_EXPECTED) {
      t('symbol แปลกหน้า → ถอยไปชั้น timeframe (ตารางบริสุทธิ์)', r?.level === 'timeframe', `ได้ ${r?.level}`);
      t('ชั้น timeframe ให้ n ตรงกับเซลล์รวม', r?.n === data.cells.timeframe[tfKeys[0]].n);
    } else {
      t('symbol แปลกหน้า → null เมื่อตารางมีสินทรัพย์นอกจักรวาลปน', r === null, `ได้ level ${r?.level}`);
      t('เซลล์ชั้น timeframe ที่ถูกปิดยัง "มีอยู่จริง" ในไฟล์ (ปิดเพราะด่าน ไม่ใช่เพราะไม่มีข้อมูล)',
        !!data.cells.timeframe[tfKeys[0]]);
    }
  }

  // strength ที่ไม่เคยผ่านประตูเลย (เช่น weak — SIGNAL_GATE ขั้นต่ำคือ strong)
  // ตารางบริสุทธิ์ → ต้องถอยถึงชั้น global ซึ่งไม่แยก strength
  // ตารางไม่บริสุทธิ์ → ต้องได้ null (ห้ามยืมค่าเฉลี่ยของสินทรัพย์ที่ไม่ได้เทรดแล้ว)
  const globalKeys = Object.keys(data.cells.global);
  if (globalKeys.length) {
    const [tf, action] = globalKeys[0].split('|');
    const missingStrength = ['weak', 'moderate', 'strong', 'very_strong']
      .find((s) => !data.cells.timeframe[`${tf}|${action}|${s}`]);
    if (missingStrength) {
      const r = lookupEvidence(STRANGER, tf, action, missingStrength);
      t(`strength ที่ไม่มีข้อมูล (${missingStrength}) → ${AGG_EXPECTED ? 'ถอยถึงชั้น global' : 'null'}`,
        AGG_EXPECTED ? r?.level === 'global' : r === null, `ได้ ${r === null ? 'null' : r?.level}`);
    }
    // ตัวพิมพ์เล็ก/ใหญ่ของ timeframe ต้องไม่เปลี่ยนคำตอบ (จริงทั้งสองโหมดของด่าน)
    const a = lookupEvidence(STRANGER, tf, action, 'strong');
    const b = lookupEvidence(STRANGER, tf.toLowerCase(), action, 'strong');
    t('timeframe พิมพ์เล็กได้คำตอบเดียวกัน', JSON.stringify(a) === JSON.stringify(b));
    // ...และต้องไม่เปลี่ยนคำตอบของ symbol ที่มีเซลล์ของตัวเองด้วย (เส้นทางที่ใช้จริงทุกวัน)
    const symKey = Object.keys(data.cells.symbol)[0];
    if (symKey) {
      const [s0, tf0, a0, st0] = symKey.split('|');
      t('ตัวพิมพ์เล็กของ symbol/timeframe ได้คำตอบเดียวกัน (ชั้น symbol)',
        JSON.stringify(lookupEvidence(s0, tf0, a0, st0)) ===
          JSON.stringify(lookupEvidence(s0.toLowerCase(), tf0.toLowerCase(), a0, st0)));
    }
  }
}

// ═══ 2.5 ด่านความบริสุทธิ์ของชั้นรวม (คำสั่งเจ้าของ 2026-08-29: เทรดทองอย่างเดียว) ═══

console.log('── ด่านความบริสุทธิ์: ชั้นรวมต้องมาจากจักรวาลที่สแกนจริงเท่านั้น ──');
{
  const outsiders = tableSymbols.filter((s) => !universeSymbols.has(s));
  t('ตัวอ่านตัดสินสถานะด่านตรงกับที่คำนวณจากไฟล์ข้อมูล + จักรวาลจริง',
    reader.EVIDENCE_AGGREGATE_LAYERS_USABLE === AGG_EXPECTED,
    `ตัวอ่านว่า ${reader.EVIDENCE_AGGREGATE_LAYERS_USABLE} · คำนวณได้ ${AGG_EXPECTED}` +
    ` (ตารางมี ${tableSymbols.length} symbol · นอกจักรวาล ${outsiders.length}: ${outsiders.slice(0, 4).join(', ')})`);

  // เส้นทางที่สำคัญที่สุดของเจ้าของ: สัญญาณทองที่มีเซลล์ของตัวเอง ต้องได้ค่าของทองเสมอ
  // ไม่ว่าด่านจะเปิดหรือปิด — ด่านนี้ห้ามทำให้ข้อมูลจำเพาะของทองหายไป
  for (const u of universe.SYMBOL_UNIVERSE) {
    const own = Object.keys(data.cells.symbol).filter((k) => k.startsWith(`${u.symbol}|`));
    if (!own.length) continue;
    const [sym, tf, action, strength] = own[0].split('|');
    const r = lookupEvidence(sym, tf, action, strength);
    t(`${u.symbol}: ชั้น symbol ยังทำงานอยู่ (ด่านไม่ไปปิดของตัวเอง)`,
      r?.level === 'symbol' && r?.n === data.cells.symbol[own[0]].n, `ได้ ${r?.level}`);
  }
}

// ═══ 3. 15m ต้องได้ข้อมูล 1H พร้อมประกาศ sourceTimeframe ตรง ๆ ═══

console.log('── 15m → ค่าประมาณจากกรอบ 1H ──');
{
  // ใช้ symbol ที่มีเซลล์ 1H ของตัวเองจริง ๆ (ไม่ใช่ symbol แปลกหน้าแบบเดิม) เพราะเส้นทางนี้
  // ต้องทำงานเหมือนกันทั้งตอนด่านความบริสุทธิ์เปิดและปิด — เลนที่เจ้าของใช้จริงคือ 15m ของทอง
  const symKey1H = Object.keys(data.cells.symbol).find((k) => k.split('|')[1] === '1H');
  if (!symKey1H) {
    t('มีเซลล์ 1H ชั้น symbol ให้ 15m ถอยไปใช้', false, 'ไม่มีเซลล์ชั้น symbol ของ 1H เลย');
  } else {
    const [sym, , action, strength] = symKey1H.split('|');
    const from15m = lookupEvidence(sym, '15m', action, strength);
    const from1H = lookupEvidence(sym, '1H', action, strength);
    t('15m คืนคำตอบเดียวกับ 1H ทุกช่อง', JSON.stringify(from15m) === JSON.stringify(from1H));
    t("15m ประกาศ sourceTimeframe = '1H'", from15m?.sourceTimeframe === '1H', `ได้ ${from15m?.sourceTimeframe}`);
  }

  // 15m ที่ไม่มีเซลล์ของตัวเอง (เช่น strength 'moderate' ซึ่งเลน 15m ปล่อยผ่านได้
  // แต่ประวัติเดินด้วยประตูมาตรฐานจึงไม่มีวันมีเซลล์ moderate) — คำตอบต้องขึ้นกับด่าน
  const g15 = lookupEvidence(
    universe.SYMBOL_UNIVERSE[0]?.symbol ?? 'XAUUSD', '15m', 'BUY', 'moderate'
  );
  t(`15m/moderate → ${AGG_EXPECTED ? 'ชั้นรวม' : 'null (ด่านปิดชั้นรวม)'}`,
    AGG_EXPECTED ? g15 !== null : g15 === null,
    `ได้ ${g15 === null ? 'null' : g15.level}`);
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
