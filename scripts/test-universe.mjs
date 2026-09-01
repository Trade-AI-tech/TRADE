#!/usr/bin/env node
/**
 * ชุดทดสอบ "จักรวาลสัญลักษณ์" (src/lib/universe.ts) และสำเนาของมันที่กระจายอยู่หลายที่
 *
 * ── ทำไมต้องมีไฟล์นี้ (เขียนเมื่อ 2026-08-29 ตอนหดจักรวาลเหลือทองตัวเดียว) ──────────
 * คำสั่งเจ้าของคือ "เน้นแค่ทองอย่างเดียว ไม่เล่นอย่างอื่นแล้ว" ซึ่งบังคับใช้ไม่ได้ด้วยการ
 * แก้รายชื่อที่เดียว เพราะจักรวาลมีสำเนาอยู่หลายที่โดยจำเป็น (สคริปต์ node ล้วน import .ts
 * ไม่ได้ · Edge Function ต้อง deploy เป็นไฟล์เดียวจบ) และมีเส้นทางที่ "อ้อมจักรวาล" ได้
 * (watchlist ของผู้ใช้) — ทุกช่องพวกนี้พังแบบเงียบ ๆ ทั้งหมด ไม่มี error ให้เห็นสักอัน
 * มีแต่สัญญาณของสิ่งที่เจ้าของเลิกเทรดแล้วโผล่เข้ามือถือต่อไป
 *
 * เทสต์นี้จึงตรวจ "กติกา" ไม่ใช่ "ทองอย่างเดียว" — วันที่เจ้าของสั่งเพิ่ม symbol กลับเข้ามา
 * ให้แก้ SYMBOL_UNIVERSE แล้วแก้สำเนาให้ตรง เทสต์ชุดนี้ต้องเขียวได้โดยไม่ต้องแก้เทสต์
 *
 * รัน: node scripts/test-universe.mjs   (npm run test:universe)
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNIVERSE_TS = path.join(ROOT, 'src', 'lib', 'universe.ts');
const SCANNER = path.join(ROOT, 'scripts', 'scan-universe.mjs');
const NEWS = path.join(ROOT, 'scripts', 'fetch-news.mjs');
const EDGE = path.join(ROOT, 'supabase', 'functions', 'scan-signals', 'index.ts');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'scan-universe.yml');

// ── โหลด universe.ts ตัวจริง (ท่าเดียวกับ scan-universe.mjs / test-signal-evidence.mjs) ──

async function loadUniverse() {
  const require_ = createRequire(import.meta.url);
  let ts;
  try {
    ts = require_('typescript');
  } catch {
    console.error('ไม่พบแพ็กเกจ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่');
    process.exit(2);
  }
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'test-universe-'));
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
    const queue = [UNIVERSE_TS];
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
    return await import(pathToFileURL(path.join(tmpDir, nameOf(UNIVERSE_TS))).href);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

const U = await loadUniverse();
const {
  SYMBOL_UNIVERSE, UNIVERSE, UNIVERSE_SIZE, UNSUPPORTED_SYMBOLS,
  buildScanTargets, watchlistOutsideUniverse, isInUniverse, SIGNAL_GATE, symbolKey,
} = U;

let pass = 0;
let fail = 0;
function t(name, cond, detail) {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const keyOf = (s, m) => `${String(s).trim().toUpperCase()}|${String(m).trim().toUpperCase()}`;
const universeKeys = new Set(SYMBOL_UNIVERSE.map((u) => keyOf(u.symbol, u.market)));

// ═══ 1. รูปร่างของจักรวาล ═══

console.log('── รูปร่างของจักรวาล ──');
{
  t('มีอย่างน้อยหนึ่ง symbol (จักรวาลว่าง = ระบบไม่สแกนอะไรเลย)', SYMBOL_UNIVERSE.length > 0);
  t('ทุกแถวมี symbol/name/market ครบ',
    SYMBOL_UNIVERSE.every((u) => typeof u.symbol === 'string' && u.symbol.trim()
      && typeof u.name === 'string' && u.name.trim()
      && typeof u.market === 'string' && u.market.trim()));
  t('symbol เป็นตัวพิมพ์ใหญ่ทั้งหมด (คีย์กันซ้ำทั้งระบบเทียบแบบพิมพ์ใหญ่)',
    SYMBOL_UNIVERSE.every((u) => u.symbol === u.symbol.toUpperCase()));
  t('ไม่มี symbol+market ซ้ำกัน', universeKeys.size === SYMBOL_UNIVERSE.length);
  t('UNIVERSE เป็นก้อนเดียวกับ SYMBOL_UNIVERSE (ตัวสแกนมองหาชื่อนี้)', UNIVERSE === SYMBOL_UNIVERSE);
  t('UNIVERSE_SIZE ตรงกับความยาวจริง', UNIVERSE_SIZE === SYMBOL_UNIVERSE.length);
}

// ═══ 2. บันทึกต้องไม่ขัดกันเอง ═══
//
// UNSUPPORTED_SYMBOLS คือ "ทำไมตัวนี้ถึงไม่อยู่ในจักรวาล" ถ้ามี symbol โผล่ทั้งสองที่
// แปลว่าบันทึกกับความจริงขัดกัน ซึ่งอันตรายกว่าไม่มีบันทึกเลย เพราะคนอ่านจะเชื่อบันทึก

console.log('── บันทึกเหตุผล (UNSUPPORTED_SYMBOLS) ──');
{
  const clash = UNSUPPORTED_SYMBOLS.filter((s) => universeKeys.has(keyOf(s.symbol, s.market)));
  t('ไม่มี symbol ไหนอยู่ทั้งในจักรวาลและในรายการที่ถูกถอด',
    clash.length === 0, clash.map((c) => c.symbol).join(', '));
  t('ทุกตัวที่ถูกถอดมีเหตุผลกำกับ (ยาวพอที่จะเป็นเหตุผลจริง)',
    UNSUPPORTED_SYMBOLS.every((s) => typeof s.reason === 'string' && s.reason.trim().length >= 40),
    UNSUPPORTED_SYMBOLS.filter((s) => !(s.reason ?? '').trim().length).map((s) => s.symbol).join(', '));
  t('ไม่มีรายการซ้ำกันในบันทึก',
    new Set(UNSUPPORTED_SYMBOLS.map((s) => keyOf(s.symbol, s.market))).size === UNSUPPORTED_SYMBOLS.length);
}

// ═══ 3. watchlist อ้อมจักรวาลไม่ได้ (ช่องโหว่ที่ทำให้คำสั่งเจ้าของถูกฝ่าฝืนเงียบ ๆ) ═══

console.log('── buildScanTargets: watchlist ต้องอ้อมจักรวาลไม่ได้ ──');
{
  const outsider = { symbol: 'EURUSD', name: 'ยูโร/ดอลลาร์', market: 'FOREX' };
  const insider = SYMBOL_UNIVERSE[0];

  const targets = buildScanTargets([
    outsider,
    { symbol: insider.symbol.toLowerCase(), name: 'ชื่อที่ผู้ใช้ตั้งเอง', market: insider.market },
    { symbol: 'USDTHB', name: null, market: 'FOREX' },
    { symbol: '', market: 'FOREX' },
  ]);

  t('ผลลัพธ์ทุกตัวอยู่ในจักรวาล', targets.every((x) => universeKeys.has(keyOf(x.symbol, x.market))),
    targets.map((x) => x.symbol).join(', '));
  t('จำนวนเป้าหมาย = จำนวนในจักรวาล (ไม่มีของแถมจาก watchlist)', targets.length === SYMBOL_UNIVERSE.length);
  t('watchlist ที่พิมพ์เล็กและตรงกับจักรวาล ไม่ทำให้เกิดแถวซ้ำ',
    targets.filter((x) => keyOf(x.symbol, x.market) === keyOf(insider.symbol, insider.market)).length === 1);
  t('ชื่อไทยของจักรวาลชนะชื่อที่ผู้ใช้ตั้งเอง',
    targets.find((x) => keyOf(x.symbol, x.market) === keyOf(insider.symbol, insider.market))?.name === insider.name);
  t('ไม่มีเป้าหมายไหนถูกทำเครื่องหมายว่ามาจาก watchlist ล้วน',
    targets.every((x) => x.source === 'universe'));
  t('watchlist ว่างก็ยังสแกนจักรวาลได้ครบ', buildScanTargets().length === SYMBOL_UNIVERSE.length);

  const dropped = watchlistOutsideUniverse([outsider, outsider, { symbol: 'usdthb', market: 'FOREX' }, insider]);
  t('รายงานตัวที่ถูกข้ามครบและไม่ซ้ำ', dropped.length === 2, dropped.map((d) => d.symbol).join(', '));
  t('รายงานเป็นตัวพิมพ์ใหญ่เสมอ', dropped.every((d) => d.symbol === d.symbol.toUpperCase()));
  t('ตัวที่อยู่ในจักรวาลไม่ถูกนับว่าถูกข้าม',
    !dropped.some((d) => keyOf(d.symbol, d.market) === keyOf(insider.symbol, insider.market)));

  t('isInUniverse ไม่สนตัวพิมพ์', isInUniverse(insider.symbol.toLowerCase(), insider.market.toLowerCase()));
  t('isInUniverse ปฏิเสธ market ที่ไม่ตรง', !isInUniverse(insider.symbol, 'CRYPTO'));
  t('symbolKey ให้คีย์เดียวกันไม่ว่าพิมพ์เล็กพิมพ์ใหญ่',
    symbolKey(' xauusd ', 'gold') === symbolKey('XAUUSD', 'GOLD'));
}

// ═══ 4. เพดานสัญญาณต่อรอบต้อง "เป็นจริงได้" และต้องถูกคิดใหม่เมื่อจักรวาลโต ═══
//
// generateSignal ให้อย่างมาก 1 สัญญาณต่อ symbol ต่อ timeframe → จำนวนใบสูงสุดที่ผลิตได้
// ต่อรอบ = จำนวน symbol × จำนวน timeframe ที่ workflow เดินจริง (เรียกว่า structuralMax)
//
// เพดานพลาดได้สองทาง และทั้งสองทางเงียบสนิท:
//   · สูงเกิน structuralMax = ปุ่มที่ไม่มีวันทำงาน หลอกคนอ่านว่ายังมีตัวคุมอยู่
//   · ต่ำกว่า structuralMax = "เพดานที่กัดจริง" — สัญญาณที่ผ่านเกณฑ์แล้วถูกตัดทิ้ง
//     ทางนี้อันตรายกว่า เพราะของหายไปจริง ๆ ไม่ใช่แค่คอมเมนต์เกินจริง
//
// การกัดไม่ได้ผิดเสมอไป: ตอนจักรวาล 13 ตัว เพดาน 5 กัดโดยตั้งใจ (วัดรอบจริง 252 รอบ
// พบเกิน 5 อันแค่ 0.8%) ตัวเลขที่ถูกจึงเป็น "การตัดสินใจ" ไม่ใช่สูตร เทสต์จึงบังคับ
// ไม่ได้ว่าเลขไหนถูก — สิ่งที่บังคับได้คือ **ห้ามให้จักรวาลโตขึ้นเงียบ ๆ โดยเลขนี้ไม่ถูกคิดใหม่**
// ตามที่คอมเมนต์ของ maxSignalsPerRun ใน universe.ts เตือนไว้เอง
//
// วิธี: ปักหมุด structuralMax ที่เพดานถูกคิดครั้งล่าสุดไว้ตรงนี้ เปลี่ยนจักรวาลหรือ
// จำนวน timeframe เมื่อไร เทสต์แดงทันที → คนแก้ต้องกลับไปคิดเพดานใหม่แล้วค่อยขยับหมุด
// ⚠ ห้ามขยับหมุดให้เทสต์เขียวโดยไม่ได้คิดเพดานใหม่ — นั่นคือการปิดสัญญาณเตือนตัวนี้ทิ้ง

/**
 * structuralMax ณ ครั้งล่าสุดที่ SIGNAL_GATE.maxSignalsPerRun ถูกพิจารณา
 * 3 = XAUUSD 1 ตัว × 3 timeframe (1D, 1H, 15m) · พิจารณาเมื่อ 2026-08-29 ตอนหดจักรวาลเหลือทอง
 */
const CAP_REVIEWED_AT_STRUCTURAL_MAX = 3;

console.log('── เพดานสัญญาณต่อรอบ ──');
{
  const wf = readFileSync(WORKFLOW, 'utf8');
  const tfArg = wf.match(/--timeframes=([\w,]+)/);
  t('อ่าน --timeframes จาก workflow ได้', !!tfArg, 'ไม่เจอรูปแบบ --timeframes=... ใน scan-universe.yml');
  const tfCount = tfArg ? tfArg[1].split(',').filter(Boolean).length : 0;
  const structuralMax = SYMBOL_UNIVERSE.length * tfCount;
  const cap = SIGNAL_GATE.maxSignalsPerRun;

  t(`เพดาน (${cap}) ไม่เกินจำนวนใบสูงสุดที่ผลิตได้ (${SYMBOL_UNIVERSE.length} symbol × ${tfCount} timeframe = ${structuralMax})`,
    tfCount > 0 && cap <= structuralMax,
    'เพดานที่เอื้อมไม่ถึงคือปุ่มหลอก — ปรับให้ตรงกับของที่ผลิตได้จริง หรือเพิ่ม symbol/timeframe');
  t('เพดานยังมากกว่า 0 (0 = ปิดแจ้งเตือนทั้งระบบเงียบ ๆ)', cap > 0);

  // ด่านที่กันทางกลับ: จักรวาลโตแล้วเพดานค้างที่เดิม = ตัดสัญญาณทิ้งเงียบ ๆ
  t(`จำนวนใบสูงสุดที่ผลิตได้ (${structuralMax}) ยังเท่ากับตอนที่เพดานถูกคิดครั้งล่าสุด (${CAP_REVIEWED_AT_STRUCTURAL_MAX})`,
    structuralMax === CAP_REVIEWED_AT_STRUCTURAL_MAX,
    structuralMax > CAP_REVIEWED_AT_STRUCTURAL_MAX
      ? `จักรวาล/timeframe โตขึ้นแล้ว แต่เพดานยังเป็น ${cap} → รอบที่ผลิตครบจะถูกตัดทิ้งได้ถึง ` +
        `${structuralMax - cap} ใบ/รอบ · กลับไปคิด maxSignalsPerRun ใน src/lib/universe.ts ใหม่ ` +
        `แล้วค่อยขยับ CAP_REVIEWED_AT_STRUCTURAL_MAX ในไฟล์นี้ให้เป็น ${structuralMax}`
      : `จักรวาล/timeframe หดลง — เพดาน ${cap} อาจกลายเป็นเพดานที่เอื้อมไม่ถึง ` +
        `คิด maxSignalsPerRun ใหม่แล้วขยับหมุดเป็น ${structuralMax}`);
}

// ═══ 5. สำเนาของจักรวาลที่กระจายอยู่ ต้องตรงกับต้นฉบับ ═══
//
// สองไฟล์นี้ import .ts ไม่ได้ทั้งคู่ (node ล้วนบน CI · Deno ไฟล์เดียวจบ)
// สำเนาที่เพี้ยนจะไม่มี error ให้เห็น — มีแต่ข่าว/สัญญาณของสิ่งที่เลิกเทรดแล้ว

console.log('── สำเนาจักรวาลในไฟล์ที่ import .ts ไม่ได้ ──');
{
  // scripts/fetch-news.mjs — const UNIVERSE = [ ['XAUUSD', 'GOLD'], ... ];
  const newsSrc = readFileSync(NEWS, 'utf8');
  const newsBlock = newsSrc.match(/const UNIVERSE = \[([\s\S]*?)\];/);
  t('หา const UNIVERSE ใน scripts/fetch-news.mjs เจอ', !!newsBlock);
  if (newsBlock) {
    const pairs = [...newsBlock[1].matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g)].map((m) => keyOf(m[1], m[2]));
    t('รายชื่อข่าวตรงกับจักรวาลทุกตัว',
      pairs.length === universeKeys.size && pairs.every((k) => universeKeys.has(k)),
      `ข่าวมี ${pairs.length} ตัว (${pairs.join(', ')}) · จักรวาลมี ${universeKeys.size} ตัว`);
  }

  // supabase/functions/scan-signals/index.ts — const UNIVERSE_ALLOWED = [ { symbol, market }, ... ]
  const edgeSrc = readFileSync(EDGE, 'utf8');
  const edgeBlock = edgeSrc.match(/const UNIVERSE_ALLOWED[^=]*=\s*\[([\s\S]*?)\];/);
  t('หา UNIVERSE_ALLOWED ใน Edge Function scan-signals เจอ', !!edgeBlock,
    'ฟังก์ชันนี้อ่านตาราง watchlist ตรง ๆ ถ้าไม่มีตัวกรองจักรวาล มันจะออกสัญญาณของสิ่งที่เลิกเทรดแล้ว');
  if (edgeBlock) {
    const rows = [...edgeBlock[1].matchAll(/symbol:\s*'([^']+)'\s*,\s*market:\s*'([^']+)'/g)].map((m) => keyOf(m[1], m[2]));
    t('ตัวกรองฝั่ง Edge ตรงกับจักรวาลทุกตัว',
      rows.length === universeKeys.size && rows.every((k) => universeKeys.has(k)),
      `Edge มี ${rows.length} ตัว (${rows.join(', ')}) · จักรวาลมี ${universeKeys.size} ตัว`);
  }
}

// ═══ 5b. ทุกเส้นทางที่อ่าน watchlist แล้วสร้างสัญญาณ ต้องกรองจักรวาล ═══
//
// จักรวาลถูกอ้อมได้ทางเดียว: โค้ดที่อ่านตาราง watchlist ตรง ๆ แล้วส่งแต่ละแถวเข้า
// generateSignal โดยไม่ถามว่าแถวนั้นอยู่ในจักรวาลไหม ตอนหดจักรวาลเหลือทอง (2026-08-29)
// มีสามเส้นทางแบบนี้ และรอบแรกอุดไปแค่สอง — ที่หลุดคือ /api/signals/scan ซึ่งเป็นเส้นทาง
// ที่ "ผู้ใช้กดเองได้" (ปุ่มสแกนตลาดบน Header) จึงอันตรายที่สุดในสามเส้นทาง
//
// ด่านนี้จึงไม่ไล่ตามรายชื่อไฟล์ที่รู้จัก แต่ค้นหาไฟล์ที่เข้าเงื่อนไข "อ่าน watchlist +
// เรียก generateSignal" เอง เส้นทางที่สี่ที่ใครเขียนเพิ่มวันหลังจะติดด่านนี้เองโดยไม่ต้องแก้เทสต์
// (การกรองรับได้สามแบบ: isInUniverse ของ universe.ts · buildScanTargets · หรือสำเนา
//  isAllowedSymbol ฝั่ง Edge ที่ import ข้าม src/ ไม่ได้)

console.log('── เส้นทางที่อ่าน watchlist แล้วสร้างสัญญาณ ──');
{
  const CANDIDATES = [
    path.join(ROOT, 'src', 'app', 'api', 'signals', 'scan', 'route.ts'),
    path.join(ROOT, 'src', 'app', 'api', 'cron', 'scan-markets', 'route.ts'),
    path.join(ROOT, 'src', 'app', 'api', 'watchlist', 'route.ts'),
    EDGE,
    SCANNER,
  ];

  const READS_WATCHLIST = /from\(\s*['"]watchlist['"]\s*\)/;
  const MAKES_SIGNALS = /generateSignal\s*\(/;
  const FILTERS = /isInUniverse\s*\(|buildScanTargets\s*\(|isAllowedSymbol\s*\(/;

  /**
   * ตัดคอมเมนต์ออกก่อนค้นหา — ไม่งั้นด่านนี้ผ่านได้ด้วย "คอมเมนต์ที่พูดถึงตัวกรอง"
   * โดยไม่มีตัวกรองจริงสักบรรทัด (เจอจริงตอนเขียนด่านนี้: คอมเมนต์ที่เขียนว่า
   * "ใช้กติกาเดียวกับ buildScanTargets()" ทำให้ไฟล์ที่ถูกถอดตัวกรองออกยังเขียวอยู่)
   * ตัวตัดนี้หยาบ: มันกิน `//` ที่อยู่ใน string ด้วย เช่น 'https://...' — ยอมได้เพราะ
   * ผลของการกินเกินคือ "หายาก" ไม่ใช่ "ผ่านฟรี" ด่านจึงเอนไปทางแดงเสมอเมื่อไม่แน่ใจ
   */
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  let checked = 0;
  for (const file of CANDIDATES) {
    if (!existsSync(file)) continue;
    const src = stripComments(readFileSync(file, 'utf8'));
    if (!READS_WATCHLIST.test(src) || !MAKES_SIGNALS.test(src)) continue;
    checked++;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    t(`${rel} กรอง watchlist ด้วยจักรวาลก่อนสร้างสัญญาณ`, FILTERS.test(src),
      'อ่าน watchlist ตรง ๆ แล้วส่งเข้า generateSignal โดยไม่ถามจักรวาล = คำสั่งเจ้าของถูกอ้อมเงียบ ๆ');
  }
  t('เจอเส้นทางที่ต้องตรวจอย่างน้อยหนึ่งเส้น (ไม่งั้นด่านนี้ผ่านฟรี)', checked > 0,
    'ไม่มีไฟล์ไหนเข้าเงื่อนไขเลย — รายชื่อ CANDIDATES อาจล้าสมัยหลังย้ายไฟล์');
}

// ═══ 6. ตัวสแกน: กติกาที่พังเงียบได้ถ้าจักรวาลเปลี่ยนขนาด ═══

console.log('── scripts/scan-universe.mjs ──');
{
  const src = readFileSync(SCANNER, 'utf8');

  // 6.1 ทุก timeframe ต้องมีหน้าต่างกันซ้ำ "ที่ประกาศชื่อตัวเอง"
  //     ของเดิม 15m ไม่มีของตัวเอง แล้วตกไปใช้ 20 ชม. ของ 1D โดยไม่มีใครตั้งใจ
  //     ผลคือปริมาณแจ้งเตือนทั้งระบบไปแขวนอยู่บนอุบัติเหตุบรรทัดเดียว (12.97 → 1.48 ใบ/วัน)
  const tfBlock = src.match(/const TIMEFRAMES = \{([\s\S]*?)\n\};/);
  t('หา TIMEFRAMES ในตัวสแกนเจอ', !!tfBlock);
  if (tfBlock) {
    const keys = [...tfBlock[1].matchAll(/^\s*'([^']+)':\s*\{/gm)].map((m) => m[1]);
    t('อ่านรายชื่อ timeframe ได้', keys.length > 0);
    for (const k of keys) {
      const constName = `DEDUPE_HOURS_${k.toUpperCase()}`;
      t(`timeframe ${k} มีหน้าต่างกันซ้ำของตัวเอง (${constName})`,
        new RegExp(`const ${constName}\\s*=`).test(src),
        'ไม่มี = มันจะตกไปใช้หน้าต่างของ timeframe อื่นเงียบ ๆ แบบที่ 15m เคยเป็น');
    }
    t('มีตัวเลือกหน้าต่างกันซ้ำแบบรวมศูนย์ (dedupeHoursFor)', /function dedupeHoursFor|const dedupeHoursFor/.test(src));

    // 6.1b ขอบเขตของ query ที่ดึงสัญญาณเดิม ต้องคลุมหน้าต่างที่ยาวที่สุด
    //      query ดึงเฉพาะแถวที่ใหม่กว่าขอบเขตนี้ ถ้าหน้าต่างของ timeframe ไหนยาวกว่า
    //      แถวส่วนที่เกินจะไม่เคยถูกอ่าน = กันซ้ำของ TF นั้นไม่ทำงานตามส่วนที่เกิน
    //      และมันพังเงียบ ๆ (ไม่มี error) — เห็นได้แค่ตอนแจ้งเตือนซ้ำเข้ามือถือแล้ว
    //      อ่านค่าคงที่จากซอร์สจริงแทนการฮาร์ดโค้ดเลข เพื่อให้เทสต์ตามค่าที่แก้ในอนาคตเอง
    const hoursOf = (name) => {
      const m = src.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
      return m ? Number(m[1]) : null;
    };
    const windows = keys.map((k) => hoursOf(`DEDUPE_HOURS_${k.toUpperCase()}`)).filter((n) => n !== null);
    t('อ่านค่าหน้าต่างกันซ้ำจากซอร์สได้ครบทุก timeframe', windows.length === keys.length);
    const lookback = hoursOf('DEDUPE_LOOKBACK_HOURS');
    const lookbackIsMax = /const DEDUPE_LOOKBACK_HOURS\s*=\s*Math\.max\(/.test(src);
    t('มีขอบเขต query แยกจากหน้าต่างของ timeframe ใดตัวหนึ่ง (DEDUPE_LOOKBACK_HOURS)',
      lookbackIsMax || lookback !== null,
      'ผูก query ไว้กับ DEDUPE_HOURS_1D ตรง ๆ = ขึ้นหน้าต่างของ TF อื่นเกิน 1D เมื่อไร กันซ้ำพังเงียบ ๆ');
    t('ขอบเขต query คลุมหน้าต่างที่ยาวที่สุดเสมอ (ผูกกับ Math.max ไม่ใช่เลขตายตัว)',
      lookbackIsMax || (lookback !== null && windows.length > 0 && lookback >= Math.max(...windows)),
      `ขอบเขต ${lookback} ชม. สั้นกว่าหน้าต่างที่ยาวสุด ${windows.length ? Math.max(...windows) : '?'} ชม.`);
    t('query ที่ดึงสัญญาณเดิมใช้ขอบเขตรวม ไม่ใช่ค่าคงที่ของ timeframe เดียว',
      /const since = new Date\(Date\.now\(\) - DEDUPE_LOOKBACK_HOURS/.test(src),
      'ยังใช้ DEDUPE_HOURS_1D เป็นขอบเขต query อยู่');
  }

  // 6.2 ที่นั่งจองของ GOLD ต้องไม่กลับมาเป็นโค้ดตายอีก ตราบใดที่จักรวาลเป็นทองล้วน
  const allGold = SYMBOL_UNIVERSE.every((u) => u.market === 'GOLD');
  const declaresReserve = /^\s*const GOLD_RESERVED_SLOTS\s*=/m.test(src);
  t('จักรวาลเป็นทองล้วน → ต้องไม่มีการจองที่ให้ทอง (การจองในสนามที่มีแต่ทองคือโค้ดตาย)',
    !allGold || !declaresReserve,
    'พบ const GOLD_RESERVED_SLOTS ทั้งที่ทุก symbol ในจักรวาลเป็น GOLD');

  // 6.3 เกณฑ์ "พังทั้งระบบ" ต้องรู้จักกรณีจำนวนคำขอน้อย ไม่งั้น 2 ใน 3 ใบก็แดงแล้ว
  t('มีกติกาสำหรับรอบที่มีคำขอน้อย (SYSTEMIC_MIN_JOBS)', /const SYSTEMIC_MIN_JOBS\s*=/.test(src),
    'ไม่มี = จักรวาลตัวเดียว (3 คำขอ) จะแดงทันทีที่ดึงล้ม 2 ใบ ซึ่งเกิดได้ตอนตลาดปิด');

  // 6.4 ตัวสแกนต้องต่อด่านความบริสุทธิ์ของชั้นรวมหลักฐานไว้จริง
  //     (กติกาตัวจริงอยู่ใน src/lib/signal-evidence.ts และถูกทดสอบเชิงพฤติกรรมใน test:evidence
  //      ที่นี่ตรวจแค่ว่า "ฝั่งตัวสแกนต่อสายไว้" ไม่ได้ตรวจว่าสองฝั่งคิดเหมือนกันทุกกรณี)
  t('ตัวสแกนคำนวณสถานะด่านความบริสุทธิ์ก่อนแนบหลักฐาน',
    /aggregateLayersUsable\s*\(/.test(src) && /evidenceFor\(signal,\s*evidenceAggregateOk\)/.test(src),
    'ไม่ต่อสาย = ตัวสแกนจะแนบค่าเฉลี่ยของสินทรัพย์ที่ไม่ได้เทรดแล้วไปกับสัญญาณ');
}

console.log(`\nผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
