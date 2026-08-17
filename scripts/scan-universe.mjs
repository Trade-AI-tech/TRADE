#!/usr/bin/env node
/**
 * scan-universe.mjs — สแกน "ทุกสัญลักษณ์ที่ระบบรู้จัก" แล้วแจ้งเตือนทุกตัวที่มีสัญญาณ
 *
 * วิธีรัน
 *   node scripts/scan-universe.mjs --dry-run     ← ไม่เขียน DB ไม่ส่งแจ้งเตือน (ใช้วัด/ไล่ปัญหา)
 *   node scripts/scan-universe.mjs               ← รอบจริง เขียน DB + ส่งแจ้งเตือน
 *   node scripts/scan-universe.mjs --no-notify   ← เขียน DB แต่ไม่ส่งแจ้งเตือน
 *   node scripts/scan-universe.mjs --concurrency=6 --timeframes=1D,1H --limit=10 --json
 *
 * ── ทำไมสคริปต์นี้ถึงไม่ได้อยู่บน Vercel ──────────────────────────────────────────
 * บัญชี Vercel ของเจ้าของเคยถูกระงับมาแล้วเพราะใช้เกินโควตาแผน Hobby
 * (Fluid Active CPU 11h57m / 4h → ทุกโดเมนตอบ 402 อยู่หลายวัน) และเจ้าของยืนยันว่าจะอยู่แผนฟรีต่อ
 * งานนี้เพิ่มภาระจาก 3 สัญลักษณ์เป็น ~57 จึงย้ายมารันบน runner ของ GitHub Actions ทั้งก้อน
 * ตัวเลขที่วัดจริงและเหตุผลเทียบกันครบอยู่ในหัวไฟล์ .github/workflows/scan-universe.yml
 *
 * ── ทำไมถึงไม่ทำสำเนาโค้ดสัญญาณ ───────────────────────────────────────────────────
 * สคริปต์นี้ "โหลด src/lib/*.ts ตัวจริง" เข้ามาเป็นโมดูล ไม่ได้เขียนตรรกะซ้ำสักบรรทัด
 * (วิธีเดียวกับ scripts/run-backtest.mjs และ scripts/check-*-parity.mjs)
 * สำเนาที่เพี้ยนตามหลังเคยเกิดขึ้นแล้วในโปรเจกต์นี้จนต้องมี check:parity มาคุม —
 * เส้นทางนี้ไม่มีสำเนาให้เพี้ยนตั้งแต่แรก
 *
 * ── สคริปต์นี้ "ไม่ตัดสินอะไรเอง" เลย ─────────────────────────────────────────────
 * มันเป็นแค่ท่อ: ดึงข้อมูล → เรียกของที่คนอื่นเป็นเจ้าของ → บันทึก → รายงาน
 *   รายชื่อกราฟ + เกณฑ์คุณภาพ  → src/lib/universe.ts        (SIGNAL_GATE / selectSignals)
 *   ตรรกะสัญญาณ                → src/lib/signal-engine.ts    (generateSignal)
 *   จะรบกวนคนยังไง/ถี่แค่ไหน   → src/lib/push-server.ts      (sendPendingSignalsToUser)
 *   ตัวไหนน่าจะจบใน 1 ชม.      → src/lib/speed-scorecard.ts  (ถ้ามี — ไม่มีก็ทำงานได้)
 * อยากขันหรือผ่อนเกณฑ์ ให้ไปแก้ SIGNAL_GATE ใน universe.ts ที่เดียว ไม่ต้องแตะไฟล์นี้
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, symlinkSync, appendFileSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ═══════════════════════════════ ค่าคงที่ของตัวสแกน ═══════════════════════════════
//
// ⚠ ในนี้ไม่มี "เกณฑ์คุณภาพสัญญาณ" สักตัวโดยตั้งใจ — ทั้งหมดอยู่ใน SIGNAL_GATE
//   ของ src/lib/universe.ts ที่เดียว ค่าข้างล่างเป็นเรื่องของ "การดึงข้อมูล" ล้วน ๆ

/**
 * ยิง Yahoo พร้อมกันกี่คำขอ — วัดจริงบนจักรวาลเต็ม (116 คำขอ: 1D + 1H ต่อตัว):
 *   concurrency 4 → 8.70 วิ · concurrency 6 → 6.32 วิ · ทั้งสองรอบสำเร็จ 116/116 ไม่โดน 429 เลย
 * เลือก 6 เพราะเร็วพอให้ทั้งจ็อบจบใน 1 นาทีของ GitHub (ดูเรื่องโควตาในไฟล์ workflow)
 * และยังห่างจากจุดที่ Yahoo เริ่มปฏิเสธ — ดันสูงกว่านี้เสี่ยงโดนบล็อกทั้ง IP ของ runner
 */
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY || 6);

/**
 * งบเวลาดึงข้อมูลทั้งรอบ เกินแล้วหยุดดึงตัวที่เหลือ (และรายงานเป็นตัวเลข ไม่ข้ามเงียบ)
 * 40 วิ = เผื่อไว้ 6 เท่าของ 6.3 วิที่วัดได้ ไว้รับกรณี Yahoo ช้าผิดปกติ
 * โดยที่ทั้งจ็อบยังจบต่ำกว่า 60 วิ = ยังถูกคิดแค่ 1 นาที
 */
const FETCH_BUDGET_MS = Number(process.env.SCAN_FETCH_BUDGET_MS || 40_000);

/**
 * หน้าต่างกันสัญญาณซ้ำ — ลอกจาก src/app/api/cron/scan-markets/route.ts เป๊ะ ๆ
 * ต้องเท่ากันเสมอ เพราะทุกตัวสแกนอ่าน/เขียนตาราง signals ใบเดียวกัน ถ้าตั้งไม่ตรงกัน
 * ตัวที่หน้าต่างสั้นกว่าจะออกสัญญาณซ้ำของที่อีกตัวเพิ่งบันทึกไป แล้วแจ้งเตือนเด้งสองรอบ
 */
const DEDUPE_HOURS_1D = 20;
const DEDUPE_HOURS_1H = 4;

/** timeframe → interval/range ของ Yahoo — ต้องตรงกับ route เดิม (1D: 1d/1y · 1H: 1h/3mo) */
const TIMEFRAMES = {
  '1D': { interval: '1d', range: '1y' },
  '1H': { interval: '1h', range: '3mo' },
};

/** แท่งน้อยกว่านี้วิเคราะห์ไม่ได้ — เกณฑ์เดียวกับ route เดิม */
const MIN_CANDLES = 50;

/** ดึงข้อมูลล้มเกินสัดส่วนนี้ = พังทั้งระบบ (Yahoo บล็อก/เน็ตขาด) ไม่ใช่ "บางตัวไม่มีข้อมูล" */
const SYSTEMIC_FAILURE_RATIO = 0.5;

// ═══════════════════════════════ อ่านอาร์กิวเมนต์ ═══════════════════════════════

const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(`--${n}`);
const argValue = (n) => {
  const raw = argv.find((a) => a.startsWith(`--${n}=`));
  return raw ? raw.slice(n.length + 3) : null;
};

const DRY_RUN = hasFlag('dry-run');
const NO_NOTIFY = hasFlag('no-notify') || DRY_RUN;
const AS_JSON = hasFlag('json');
const LIMIT = argValue('limit') ? Number(argValue('limit')) : null;
const TF_LIST = (argValue('timeframes') || '1D,1H')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

/** ข้อความที่โผล่บนหน้า run ของ GitHub Actions — นอก CI ไม่เกะกะเพราะ log ปกติก็อ่านได้ */
const IN_GHA = !!process.env.GITHUB_ACTIONS;
const ghaError = (m) => IN_GHA && console.log(`::error::${String(m).replace(/\r?\n/g, ' ')}`);
const ghaWarn = (m) => IN_GHA && console.log(`::warning::${String(m).replace(/\r?\n/g, ' ')}`);
const ghaNotice = (m) => IN_GHA && console.log(`::notice::${String(m).replace(/\r?\n/g, ' ')}`);

function fail(message) {
  console.error(`\n[ล้มเหลว] ${message}\n`);
  ghaError(message);
  process.exit(1);
}

if (TF_LIST.some((tf) => !TIMEFRAMES[tf])) {
  fail(`--timeframes รับได้เฉพาะ ${Object.keys(TIMEFRAMES).join(',')} (ได้ "${TF_LIST.join(',')}")`);
}
if (!Number.isFinite(CONCURRENCY) || CONCURRENCY < 1) fail('SCAN_CONCURRENCY ต้องเป็นจำนวนเต็ม >= 1');

// ═══════════════════════════════ env จาก .env.local ═══════════════════════════════

/**
 * บนเครื่องตัวเองอ่านค่าจาก .env.local · บน CI ค่ามาจาก secrets ทาง process.env อยู่แล้ว
 * ไม่เขียนทับค่าที่มีอยู่ก่อน — ของจริงจาก CI ต้องชนะไฟล์เสมอ
 */
function loadDotEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
loadDotEnvLocal();

// ═════════════════ โหลด src/lib/*.ts ตัวจริงเข้ามาเป็นโมดูล ═════════════════

/**
 * โฟลเดอร์ node_modules ที่ใช้ resolve แพ็กเกจภายนอก (web-push, @supabase/*)
 * บน CI ติดตั้งแค่ 4 แพ็กเกจลงโฟลเดอร์แยกแล้วชี้มาที่นี่ — ไม่ต้อง npm ci ทั้งโปรเจกต์
 * (next/react/recharts ไม่มีตัวไหนถูกใช้ในเส้นทางนี้ ติดตั้งไปก็ดันจ็อบข้าม 60 วิเปล่า ๆ)
 */
const NODE_MODULES = process.env.SCAN_NODE_MODULES || path.join(ROOT, 'node_modules');

/** ไฟล์จักรวาล — เปลี่ยนที่ชี้ได้เพื่อทดสอบ แต่ค่าปกติคือของจริงที่เดียว */
const UNIVERSE_TS = process.env.SCAN_UNIVERSE_MODULE || path.join(ROOT, 'src', 'lib', 'universe.ts');

/**
 * ไฟล์คะแนนความเร็ว ("ตัวไหนน่าจะจบใน ~1 ชม.") — เป็นงานของเอเจนต์อีกตัวที่ทำขนานอยู่
 * ไม่มีไฟล์นี้ = ไม่ใช่ข้อผิดพลาด ระบบต้องเดินต่อได้ด้วยการเรียงลำดับแบบเดิม
 * ห้ามให้การไม่มีไฟล์ของคนอื่นทำให้แจ้งเตือนของเจ้าของหยุดทำงาน
 */
const SPEED_TS = process.env.SCAN_SPEED_MODULE || path.join(ROOT, 'src', 'lib', 'speed-scorecard.ts');

/**
 * ชื่อ export ที่ยอมรับได้ของตัวให้คะแนนความเร็ว — ไล่ตามลำดับนี้ เจอตัวแรกใช้ตัวนั้น
 * ยอมรับหลายชื่อเพราะตอนเขียนไฟล์นี้ยังไม่มีตัวจริงให้ดู และการเดาชื่อผิดแล้วเงียบ
 * จะกลายเป็น "ลำดับไม่เปลี่ยนแล้วไม่มีใครรู้ว่าทำไม" — จึงมี warning เมื่อไฟล์มีแต่หา export ไม่เจอ
 */
const SPEED_EXPORT_NAMES = ['speedScore', 'speedScoreOf', 'scoreSpeed', 'speedRank', 'default'];

const require_ = createRequire(import.meta.url);
let typescript;
try {
  typescript = require_(path.join(NODE_MODULES, 'typescript'));
} catch {
  try {
    typescript = require_('typescript');
  } catch {
    fail(`ไม่พบแพ็กเกจ typescript ที่ ${NODE_MODULES} — บนเครื่องตัวเองสั่ง \`npm install\` ก่อน · บน CI ดูขั้นตอน "ติดตั้งแพ็กเกจที่ตัวสแกนใช้" ในไฟล์ workflow`);
  }
}

/**
 * '@/lib/x' → <root>/src/lib/x.ts · './x' → เทียบจากไฟล์ที่ import · null = แพ็กเกจภายนอก
 * รองรับ .json ด้วย เพราะ src/lib/speed-scorecard.ts โหลดตารางคะแนนจาก
 * speed-scorecard.data.json — ถ้าไม่ตามไฟล์ JSON ไปด้วย โมดูลนั้นจะ import ไม่ติด
 * แล้วระบบจะเงียบ ๆ กลับไปเรียงลำดับแบบเดิมโดยไม่มีใครรู้ว่าทำไม
 */
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

/** ชื่อไฟล์แบนที่ไม่มีทางชนกัน แม้จะมี index.ts หลายตัว หรือไฟล์อยู่นอก ROOT */
const flatNames = new Map();
function flatName(absFile) {
  const hit = flatNames.get(absFile);
  if (hit) return hit;
  const isJson = absFile.endsWith('.json');
  const safe = path.basename(absFile).replace(/\.(tsx?|json)$/, '').replace(/[^A-Za-z0-9_-]/g, '_');
  const name = `m${flatNames.size}_${safe}${isJson ? '.json' : '.mjs'}`;
  flatNames.set(absFile, name);
  return name;
}

/** จับทั้ง `from '...'`, `import '...'` และ `import('...')` — ครอบคลุมทุกรูปที่ TS ปล่อยออกมา */
const SPEC_RE = /((?:^|[\s;{}])(?:from|import)\s*\(?\s*)(['"])([^'"]+)\2/g;

/**
 * ลอกชนิดออกแล้วเขียนลง tmpDir พร้อมไล่ตาม import ต่อไปเรื่อย ๆ
 * ไล่เองแทนการฮาร์ดโค้ดรายชื่อไฟล์ เพราะไฟล์ฝั่ง lib เป็นของเอเจนต์คนอื่นที่ยังแก้กันอยู่ —
 * วันไหนเขา import อะไรเพิ่ม (เช่น push-server.ts เพิ่ง import push-digest.ts เข้ามา)
 * ตัวโหลดต้องตามไปเองโดยไม่ต้องมาแก้ที่นี่
 */
function transpileGraph(entries, tmpDir) {
  const done = new Set();
  const queue = [...entries];

  while (queue.length) {
    const abs = queue.shift();
    if (done.has(abs)) continue;
    done.add(abs);

    // ไฟล์ข้อมูล — คัดลอกไปทั้งดุ้น ไม่ต้องแปลอะไร
    if (abs.endsWith('.json')) {
      writeFileSync(path.join(tmpDir, flatName(abs)), readFileSync(abs), null);
      continue;
    }

    const js = typescript.transpileModule(readFileSync(abs, 'utf8'), {
      fileName: path.basename(abs),
      compilerOptions: {
        target: typescript.ScriptTarget.ES2022,
        module: typescript.ModuleKind.ESNext,
        removeComments: false,
      },
    }).outputText;

    const rewritten = js.replace(SPEC_RE, (whole, head, q, spec) => {
      const dep = resolveTsSpecifier(spec, abs);
      if (!dep) return whole; // แพ็กเกจภายนอก — ปล่อยให้ node resolve ผ่าน node_modules
      if (!done.has(dep)) queue.push(dep);
      // node บังคับให้ import JSON ต้องมี attribute กำกับ ไม่งั้นโยน ERR_IMPORT_ATTRIBUTE_MISSING
      // (เติมได้เฉพาะ import แบบคงที่ — แบบ dynamic ต้องใส่ในวงเล็บ ซึ่งยังไม่มีใครใช้)
      const jsonAttr = dep.endsWith('.json') && !head.includes('(') ? " with { type: 'json' }" : '';
      return `${head}${q}./${flatName(dep)}${q}${jsonAttr}`;
    });

    writeFileSync(path.join(tmpDir, flatName(abs)), rewritten, 'utf8');
  }
}

/** ตรวจว่า export ที่ต้องใช้มีครบจริง — ขาดตัวไหนต้องพังทันทีพร้อมบอกชื่อ ไม่ใช่ไปเงียบตอนสแกน */
function pick(mod, names, where) {
  const out = {};
  const missing = [];
  for (const n of names) {
    const v = mod[n] ?? mod.default?.[n];
    if (v === undefined) missing.push(n);
    out[n] = v;
  }
  if (missing.length) {
    fail(
      `${where} ไม่ได้ export: ${missing.join(', ')}\n` +
        `  ที่มีอยู่: ${Object.keys(mod).join(', ') || '(ว่าง)'}\n` +
        '  ตัวสแกนจงใจไม่มีของสำรองให้ใช้แทน เพราะถ้ามี วันไหนชื่อเปลี่ยนแล้วหลุดไป\n' +
        '  ระบบจะกลับไปทำงานด้วยกติกาที่ไม่มีใครตั้งใจ โดยไม่มีใครรู้ — ยอมให้พังดังกว่า'
    );
  }
  return out;
}

/**
 * เตรียม tmpDir ให้ resolve แพ็กเกจภายนอกได้ ด้วยการลิงก์ node_modules เข้าไป
 * (junction บน Windows / symlink บน Linux) — วิธีนี้ไม่ต้องเขียนไฟล์ลงในโปรเจกต์เลยสักไฟล์
 * ซึ่งสำคัญเพราะมีเอเจนต์ตัวอื่นทำงานบน repo เดียวกันอยู่ ไฟล์แปลกปลอมจะไปโผล่ใน git status ของเขา
 */
async function loadRealModules() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'scan-universe-'));
  try {
    try {
      symlinkSync(NODE_MODULES, path.join(tmpDir, 'node_modules'), platform() === 'win32' ? 'junction' : 'dir');
    } catch (e) {
      fail(`ลิงก์ node_modules เข้า temp dir ไม่สำเร็จ (${e.code}) — ตรวจว่า ${NODE_MODULES} มีอยู่จริง`);
    }

    if (!existsSync(UNIVERSE_TS)) {
      fail(
        `ไม่พบไฟล์จักรวาลสัญลักษณ์ที่ ${UNIVERSE_TS}\n` +
          '  ตั้ง SCAN_UNIVERSE_MODULE=<path> เพื่อชี้ไปไฟล์อื่นได้ (ใช้ตอนทดสอบ)'
      );
    }

    const paths = {
      universe: UNIVERSE_TS,
      marketData: path.join(ROOT, 'src', 'lib', 'market-data.ts'),
      engine: path.join(ROOT, 'src', 'lib', 'signal-engine.ts'),
      push: path.join(ROOT, 'src', 'lib', 'push-server.ts'),
      telegram: path.join(ROOT, 'src', 'lib', 'telegram.ts'),
    };
    for (const p of Object.values(paths)) if (!existsSync(p)) fail(`ไม่พบไฟล์ต้นฉบับ ${p}`);

    transpileGraph(Object.values(paths), tmpDir);
    const load = (abs) => import(pathToFileURL(path.join(tmpDir, flatName(abs))).href);
    const [universe, marketData, engine, push, telegram] = await Promise.all(Object.values(paths).map(load));

    // ── ตัวให้คะแนนความเร็ว (ไม่บังคับ) ────────────────────────────────────────────
    // ทุกอย่างในบล็อกนี้ห่อ try ไว้ทั้งก้อนโดยตั้งใจ: ไฟล์ของคนอื่นที่ยังเขียนไม่เสร็จ
    // ต้องทำให้ "ลำดับกลับไปเป็นแบบเดิม" ไม่ใช่ "ตัวสแกนล้มทั้งรอบ"
    let speedScore = null;
    let speedScoreSource = null;
    if (existsSync(SPEED_TS)) {
      try {
        transpileGraph([SPEED_TS], tmpDir);
        const mod = await load(SPEED_TS);
        for (const name of SPEED_EXPORT_NAMES) {
          const fn = mod[name] ?? mod.default?.[name];
          if (typeof fn === 'function') {
            // ห่ออีกชั้นกันฝั่งนั้นโยน error กลางการเรียงลำดับ (push-digest ห่อไว้แล้วอีกชั้น)
            speedScore = (signal) => {
              try {
                return fn(signal);
              } catch {
                return null;
              }
            };
            speedScoreSource = `${path.basename(SPEED_TS)}:${name}`;
            break;
          }
        }
        if (!speedScore) {
          ghaWarn(`พบ ${path.basename(SPEED_TS)} แต่ไม่มี export ชื่อใดใน ${SPEED_EXPORT_NAMES.join('/')} — ใช้การเรียงลำดับแบบเดิม (ที่มี: ${Object.keys(mod).join(', ') || '(ว่าง)'})`);
        }
      } catch (e) {
        ghaWarn(`โหลด ${path.basename(SPEED_TS)} ไม่สำเร็จ (${e?.message ?? e}) — ใช้การเรียงลำดับแบบเดิม`);
      }
    }

    return {
      ...pick(universe, ['SYMBOL_UNIVERSE', 'buildScanTargets', 'selectSignals', 'describeRejections', 'SIGNAL_GATE'], 'src/lib/universe.ts'),
      ...pick(marketData, ['fetchChart'], 'src/lib/market-data.ts'),
      ...pick(engine, ['generateSignal'], 'src/lib/signal-engine.ts'),
      ...pick(push, ['sendPendingSignalsToUser', 'pushStateColumnAvailable'], 'src/lib/push-server.ts'),
      ...pick(telegram, ['sendSignalAlert'], 'src/lib/telegram.ts'),
      speedScore,
      speedScoreSource,
    };
  } finally {
    // import เสร็จแล้วโมดูลอยู่ในหน่วยความจำ ลบไฟล์ชั่วคราวได้เลย
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ═══════════════════════════════ ตัวช่วยทั่วไป ═══════════════════════════════

/** คิวงานแบบจำกัดจำนวนที่วิ่งพร้อมกัน — ไม่ใช้ Promise.all ตรง ๆ เพราะจะยิง Yahoo รัวจนโดนบล็อก */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—');

// ═══════════════════════════════ main ═══════════════════════════════

async function main() {
  const startedAt = Date.now();
  const cpuStart = process.cpuUsage();

  const lib = await loadRealModules();

  // ── Supabase (ข้าม RLS ด้วย service role — งานนี้ไม่มี session) ──────────────────
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let sb = null;
  if (SB_URL && SB_KEY) {
    const { createClient } = createRequire(path.join(NODE_MODULES, 'resolve-from-here.js'))('@supabase/supabase-js');
    sb = createClient(SB_URL, SB_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  } else if (DRY_RUN) {
    console.log('หมายเหตุ: ไม่มีค่า Supabase — dry run จะข้ามการอ่านผู้รับ/สัญญาณเดิม');
  } else {
    fail('ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY');
  }

  // ── ตาราง signals มีคอลัมน์สถานะการแจ้งเตือนแล้วหรือยัง (migration 006) ──────────
  //
  // ต้องรู้ "ก่อน" insert เพราะถ้าใส่ฟิลด์ที่ตารางไม่มี Postgres ปฏิเสธทั้ง batch
  // = สัญญาณทั้งรอบหายไปเลย ซึ่งแย่กว่าการไม่มีคอลัมน์เสียอีก
  // โค้ดขึ้นก่อนที่เจ้าของจะรัน SQL เสมอ เส้นทาง "ยังไม่ได้รัน" จึงต้องเดินได้จริง
  const pushStateReady = sb ? await lib.pushStateColumnAvailable(sb) : false;
  if (sb && !pushStateReady) {
    const msg =
      'ยังไม่ได้รัน supabase/migrations/006_signal_push_state.sql — ตัวสแกนจะทำงานแบบเดิม ' +
      '(สัญญาณที่ถูกกันความถี่หรือส่งไม่สำเร็จจะไม่ได้เก็บตกรอบหน้า) · เปิด Supabase → SQL Editor แล้ววางไฟล์นั้นทั้งไฟล์';
    ghaWarn(msg);
    console.log(`⚠ ${msg}`);
  }

  // ลำดับในแจ้งเตือนมาจากไหน — ต้องเห็นทุกรอบ ไม่งั้นเวลาลำดับไม่เปลี่ยนจะเดาไม่ออกว่า
  // เพราะ scorecard ยังไม่มี หรือเพราะโหลดไม่ติด
  console.log(
    lib.speedScoreSource
      ? `ลำดับ  ใช้คะแนนความเร็วจาก ${lib.speedScoreSource} (ตัวที่น่าจะจบใน ~1 ชม. อยู่บนสุด)`
      : 'ลำดับ  ไม่มีคะแนนความเร็ว (ยังไม่มี src/lib/speed-scorecard.ts หรือโหลดไม่ได้ — ดู warning ด้านบน) เรียงด้วยเกณฑ์คุณภาพเดิม: แรง → มั่นใจ → RR → timeframe'
  );

  // ── 1. ใครคือผู้รับสัญญาณ ────────────────────────────────────────────────────────
  //
  // signals.user_id เป็น NOT NULL + FK ไป auth.users และ RLS ให้อ่านได้เฉพาะ auth.uid() = user_id
  // จักรวาลไม่ได้ผูกกับ user คนไหน แต่ทางเลือกอื่นแย่กว่าทั้งคู่:
  //   · สร้าง user กลางมาถือสัญญาณ → เจ้าของมองไม่เห็นเลยเพราะ RLS กัน ต้องไปแก้ policy
  //     ซึ่งกระทบทั้งตารางและเป็นงานของ migration ที่คนอื่นดูแล
  //   · ทำให้ user_id เป็น null ได้ → ต้อง ALTER คอลัมน์ NOT NULL ของตารางที่มีข้อมูลจริงอยู่
  // จึงเลือกวิธีที่ไม่ต้องแตะ schema เลย: บันทึกหนึ่งแถวต่อ "ผู้ใช้ที่ขอรับแจ้งเตือน" หนึ่งคน
  // — แบบเดียวกับที่ route เดิมทำกับ watchlist ทุกประการ หน้าเว็บ/RLS/แจ้งเตือนจึงทำงานเหมือนเดิม
  //
  // "ผู้ที่ขอรับแจ้งเตือน" = มี push subscription ∪ เปิด Telegram ∪ มี watchlist ที่ active
  // ข้อสุดท้ายกันไม่ให้ผู้ใช้เดิมเงียบไปเฉย ๆ ตอนที่ยังไม่ได้กดเปิด push
  const recipients = new Set();
  const watchlistRows = [];
  const watchlistOwners = new Map(); // 'SYMBOL|MARKET' → Set<userId>

  if (sb) {
    const [subs, profs, wl] = await Promise.all([
      sb.from('push_subscriptions').select('user_id'),
      sb.from('profiles').select('id').eq('telegram_enabled', true),
      sb.from('watchlist').select('user_id, symbol, name, market').eq('is_active', true),
    ]);
    if (subs.error) ghaWarn(`อ่าน push_subscriptions ไม่ได้: ${subs.error.message}`);
    if (profs.error) ghaWarn(`อ่าน profiles ไม่ได้: ${profs.error.message}`);
    if (wl.error) fail(`อ่าน watchlist ไม่ได้: ${wl.error.message}`);

    for (const r of subs.data ?? []) recipients.add(r.user_id);
    for (const r of profs.data ?? []) recipients.add(r.id);
    for (const r of wl.data ?? []) {
      recipients.add(r.user_id);
      watchlistRows.push({ symbol: r.symbol, name: r.name, market: r.market });
      const key = `${String(r.symbol).trim().toUpperCase()}|${String(r.market).trim().toUpperCase()}`;
      if (!watchlistOwners.has(key)) watchlistOwners.set(key, new Set());
      watchlistOwners.get(key).add(r.user_id);
    }
  }

  // ไม่มีใครขอรับแจ้งเตือนเลย = รอบนี้จะสแกนแล้วทิ้งสัญญาณทั้งหมด (ราคายังอัปเดตให้หน้าเว็บอยู่)
  // ต้องเห็นเป็น warning ไม่ใช่ปล่อยให้ log ขึ้นเขียวสวยแล้วเจ้าของนึกว่าระบบทำงานอยู่
  if (sb && recipients.size === 0) {
    ghaWarn('ไม่มีผู้ใช้คนไหนเปิดแจ้งเตือน/มี watchlist เลย — รอบนี้จะไม่บันทึกสัญญาณให้ใคร (อัปเดตแค่ราคา) ให้เข้าเว็บจากมือถือแล้วกดอนุญาตแจ้งเตือนก่อน');
    console.log('⚠ ไม่มีผู้รับสัญญาณเลย — สัญญาณที่เจอรอบนี้จะไม่ถูกบันทึกให้ใคร');
  }

  // ── 2. ชุดสัญลักษณ์ที่จะสแกน — universe.ts เป็นคนรวมให้ ไม่ใช่สคริปต์นี้ ────────
  let targetList = lib.buildScanTargets(watchlistRows);
  if (LIMIT) targetList = targetList.slice(0, LIMIT);
  const fromWatchlist = targetList.filter((t) => t.source === 'watchlist').length;

  console.log(
    `จักรวาล ${lib.SYMBOL_UNIVERSE.length} ตัว · watchlist ที่อยู่นอกจักรวาล ${fromWatchlist} ตัว` +
      ` · สแกนจริง ${targetList.length} ตัว × ${TF_LIST.length} timeframe = ${targetList.length * TF_LIST.length} คำขอ` +
      ` · ผู้รับ ${recipients.size} คน${DRY_RUN ? ' · [dry run]' : ''}`
  );
  // พิมพ์เกณฑ์ที่ "กำลังใช้จริง" ทุกรอบ — เวลาผลวิจัยสั่งให้ผ่อนเกณฑ์ จะได้เห็นจาก log ของ CI
  // ทันทีว่าค่าที่รันอยู่เปลี่ยนตามแล้วจริงหรือยัง ไม่ต้องเดาว่า deploy ทันรอบไหน
  const g = lib.SIGNAL_GATE;
  console.log(
    `เกณฑ์ที่ใช้ (SIGNAL_GATE ใน src/lib/universe.ts): แรงขั้นต่ำ ${g.minStrength} · ความมั่นใจ ≥ ${g.minConfidence}` +
      ` · RR ≥ ${g.minRiskReward}${g.maxRiskReward ? ` และ ≤ ${g.maxRiskReward}` : ''}` +
      ` · SL ${g.minStopDistancePct}–${g.maxStopDistancePct}% · เพดาน ${g.maxSignalsPerRun} สัญญาณ/รอบ/คน`
  );

  // ── 3. ดึงแท่งเทียน ──────────────────────────────────────────────────────────────
  const jobs = [];
  for (const t of targetList) for (const tf of TF_LIST) jobs.push({ target: t, tf });

  const fetchStats = { ok: 0, httpFail: 0, thin: 0, budget: 0 };
  const failedDetail = [];
  const quotes = [];
  const fetchT0 = Date.now();

  const fetched = await pool(jobs, CONCURRENCY, async (job) => {
    const note = (why) => {
      failedDetail.push({ symbol: job.target.symbol, market: job.target.market, tf: job.tf, why });
      return null;
    };
    // หมดงบเวลา → ไม่ดึงต่อ แต่ต้องนับไว้ให้เห็น ไม่ใช่หายไปเฉย ๆ
    if (Date.now() - fetchT0 > FETCH_BUDGET_MS) {
      fetchStats.budget++;
      return note('หมดงบเวลา');
    }
    const { interval, range } = TIMEFRAMES[job.tf];
    try {
      const chart = await lib.fetchChart(job.target.symbol, job.target.market, interval, range);
      // ราคาปัจจุบันเก็บจากรอบ 1D เท่านั้น (เหมือน route เดิม) — 1H ให้ quote ชุดเดียวกันอยู่แล้ว
      if (job.tf === '1D' && chart.quote) quotes.push(chart.quote);
      if (!chart.candles?.length) {
        fetchStats.httpFail++;
        return note('ดึงไม่ได้ (Yahoo ไม่ตอบ / ไม่มีสัญลักษณ์นี้แล้ว)');
      }
      if (chart.candles.length < MIN_CANDLES) {
        fetchStats.thin++;
        return note(`ข้อมูลไม่พอ (${chart.candles.length}/${MIN_CANDLES} แท่ง)`);
      }
      fetchStats.ok++;
      return chart.candles;
    } catch (e) {
      // Yahoo ล่มบางตัวต้องไม่ล้มทั้งรอบ — บันทึกไว้แล้วไปตัวถัดไป
      fetchStats.httpFail++;
      return note(`ข้อผิดพลาด: ${e?.message ?? e}`);
    }
  });

  const fetchMs = Date.now() - fetchT0;
  const totalFails = fetchStats.httpFail + fetchStats.thin + fetchStats.budget;
  const systemicFailure = jobs.length > 0 && totalFails / jobs.length > SYSTEMIC_FAILURE_RATIO;
  if (systemicFailure) {
    ghaError(`ดึงข้อมูลล้ม ${totalFails}/${jobs.length} — เกินครึ่ง ถือว่าพังทั้งระบบ ไม่ใช่บางตัวไม่มีข้อมูล`);
  }

  // ── 4. สร้างสัญญาณดิบ (ยังไม่ตัดสินคุณภาพ — นั่นเป็นงานของ selectSignals) ───────
  const cpuComputeStart = process.cpuUsage();
  const candidates = []; // { signal: Signal|null, target }
  for (let i = 0; i < jobs.length; i++) {
    const candles = fetched[i];
    if (!candles) continue; // ดึงไม่สำเร็จ — นับไว้ใน fetchStats แล้ว ไม่เอามาปนกับ "ไม่มีสัญญาณ"
    const { target, tf } = jobs[i];
    try {
      const signal = lib.generateSignal({
        symbol: target.symbol,
        name: target.name,
        market: target.market,
        candles,
        timeframe: tf,
      });
      candidates.push({ signal: signal ?? null, target });
    } catch (e) {
      // เครื่องคำนวณพังกับข้อมูลตัวเดียว ต้องไม่ล้มทั้งรอบ
      ghaWarn(`generateSignal ล้มที่ ${target.symbol} ${tf}: ${e?.message ?? e}`);
    }
  }
  const cpuCompute = process.cpuUsage(cpuComputeStart);

  // ── 5. กันสัญญาณซ้ำ — กติกาเดียวกับ route เดิมเป๊ะ ๆ ────────────────────────────
  //
  // อ่านด้วยหน้าต่างกว้างสุด (20 ชม. ของ 1D) แล้วค่อยกรองหน้าต่างแคบของ 1H (4 ชม.) ในโค้ด
  // เหมือน route เดิมทุกบรรทัด เพราะ timeframe เป็น text ใน DB การผูกเงื่อนไขใน query
  // อ่านยากและพังเงียบได้ง่ายกว่า
  //
  // ⚠ ตัวสแกนนี้ / route บน Vercel / Edge Function `scan-signals` ใช้ตาราง signals ใบเดียวกัน
  //   จึงเห็นของกันและกัน ใครเขียนก่อนได้ ใครมาทีหลังเจอแล้วข้าม — แต่ "อ่านแล้วค่อยเขียน"
  //   กันไม่ได้ถ้ารันวินาทีเดียวกัน จึงตั้งตารางเวลาให้คนละนาที (นาทีที่ 25 ไม่ใช่นาทีที่ 0)
  //   เหตุผลเต็มอยู่ในหัวไฟล์ .github/workflows/scan-universe.yml
  const seen = new Set();
  if (sb) {
    const since = new Date(Date.now() - DEDUPE_HOURS_1D * 3600_000).toISOString();
    const { data: recent, error } = await sb
      .from('signals')
      .select('user_id, symbol, action, timeframe, created_at')
      .eq('status', 'active')
      .gte('created_at', since);
    if (error) {
      // อ่านของเดิมไม่ได้ = กันซ้ำไม่ได้ = เสี่ยงเด้งซ้ำ — หยุดดีกว่าปล่อยให้สแปม
      fail(`อ่านสัญญาณเดิมเพื่อกันซ้ำไม่สำเร็จ: ${error.message} — หยุดรอบนี้ ไม่บันทึกอะไรเลย`);
    }
    const cutoff1H = Date.now() - DEDUPE_HOURS_1H * 3600_000;
    for (const r of recent ?? []) {
      if (r.timeframe === '1H' && new Date(r.created_at).getTime() < cutoff1H) continue;
      seen.add(`${r.user_id}:${r.symbol}:${r.action}:${r.timeframe}`);
    }
  }

  // ── 6. ผ่านประตูคุณภาพ แล้วผูกกับผู้รับ ──────────────────────────────────────────
  //
  // selectSignals มีเพดาน maxSignalsPerRun "ต่อการเรียกหนึ่งครั้ง" จึงต้องเรียกแยกรายคน
  // ไม่งั้นผู้ใช้คนแรกจะกินโควตาของคนอื่นหมด (ระบุไว้ในคอมเมนต์ของ universe.ts เอง)
  //
  // กันซ้ำ "ก่อน" เข้าประตู ไม่ใช่หลัง — ถ้ากรองทีหลัง สัญญาณที่เคยส่งไปแล้วจะไปกิน
  // โควตา 5 อันของรอบนี้ แล้วสัญญาณใหม่จริง ๆ จะถูกเบียดตกไปโดยไม่มีใครรู้
  const rowsByUser = new Map();
  const gateSummary = {};
  let evaluated = 0;
  let dedupeSkipped = 0;
  let overCapacity = 0;

  for (const userId of recipients) {
    const mine = candidates.filter(({ target }) => {
      if (target.source === 'universe') return true;
      const key = `${target.symbol.toUpperCase()}|${target.market.toUpperCase()}`;
      // สัญลักษณ์ที่มาจาก watchlist ล้วน → ส่งให้เฉพาะเจ้าของ (รักษาพฤติกรรมเดิมของ route)
      return watchlistOwners.get(key)?.has(userId) ?? false;
    });

    const notDuplicate = mine.filter(({ signal }) => {
      if (!signal) return true; // ให้ selectSignals นับเป็น no_signal ตามปกติ
      const dk = `${userId}:${signal.symbol}:${signal.action}:${signal.timeframe}`;
      if (seen.has(dk)) {
        dedupeSkipped++;
        return false;
      }
      return true;
    });

    const selection = lib.selectSignals(notDuplicate.map((c) => c.signal));
    evaluated += selection.evaluated;
    for (const [code, n] of Object.entries(selection.summary)) gateSummary[code] = (gateSummary[code] ?? 0) + n;
    overCapacity += selection.summary.over_run_limit ?? 0;

    const rows = [];
    for (const signal of selection.accepted) {
      const dk = `${userId}:${signal.symbol}:${signal.action}:${signal.timeframe}`;
      seen.add(dk);
      // id ใหม่ต่อคน — signals.id เป็น primary key จะใช้ค่าเดียวกันหลายแถวไม่ได้
      //
      // push_sent = false = "ตัวส่งกลางยังไม่ได้แจ้งแถวนี้" ตัวสแกนตัวนี้เป็นตัวเดียวที่เขียนค่านี้
      // (ค่าเริ่มต้นของคอลัมน์คือ true เพราะตัวเขียนอื่น ๆ แจ้งเตือนเองตอน insert — ดูเหตุผลเต็ม
      //  ในหัวไฟล์ migration 006) ใส่เฉพาะตอนที่คอลัมน์มีจริง ไม่งั้น insert ล้มทั้ง batch
      rows.push({ ...signal, id: randomUUID(), user_id: userId, ...(pushStateReady ? { push_sent: false } : {}) });
    }
    if (rows.length) rowsByUser.set(userId, rows);
  }

  const allRows = [...rowsByUser.values()].flat();

  // ── 7. เขียน DB ──────────────────────────────────────────────────────────────────
  let pricesUpdated = 0;
  let signalsInserted = 0;
  const dbErrors = [];

  if (!DRY_RUN && sb) {
    // symbol ซ้ำใน batch เดียว Postgres จะโยน "ON CONFLICT DO UPDATE command cannot affect
    // row a second time" แล้วทิ้งทั้ง batch — ยุบให้เหลือแถวเดียวต่อ symbol ก่อน (เหมือน route เดิม)
    const uniquePrices = [...new Map(quotes.map((p) => [p.symbol, p])).values()];
    if (uniquePrices.length) {
      const { error } = await sb.from('market_prices').upsert(uniquePrices, { onConflict: 'symbol' });
      // ราคาเขียนไม่ได้ ไม่ควรทำให้สัญญาณทั้งรอบตกไปด้วย — คนละเรื่องกัน
      if (error) dbErrors.push(`market_prices: ${error.message}`);
      else pricesUpdated = uniquePrices.length;
    }

    for (const [userId, rows] of rowsByUser) {
      const { error } = await sb.from('signals').insert(rows);
      if (error) {
        dbErrors.push(`signals(${userId}): ${error.message}`);
        // แจ้งเตือนเฉพาะแถวที่ "บันทึกสำเร็จจริง" — ถ้าเด้งแจ้งเตือนของแถวที่เขียนไม่ลง
        // รอบหน้าตัวกันซ้ำจะไม่เห็นมัน แล้วเด้งซ้ำอีกทุกชั่วโมงไม่จบ
        rowsByUser.delete(userId);
      } else {
        signalsInserted += rows.length;
      }
    }
  }

  // ── 8. แจ้งเตือน ─────────────────────────────────────────────────────────────────
  //
  // ไม่วนส่งทีละสัญญาณเอง — ส่งทั้งชุดของคนนั้นให้ sendPendingSignalsToUser ตัดสินว่า
  // จะเอาของค้างรอบก่อนมารวมด้วยไหม / ชั่วโมงนี้แจ้งไปหรือยัง / ประกอบข้อความยังไง
  // (ตรรกะนั้นเป็นของ push-server + push-digest)
  // ถ้าสคริปต์นี้ตัดสินเอง จะมีเกณฑ์ "จะรบกวนคนยังไง" สองที่ที่เพี้ยนกันได้
  //
  // ⚠ วนตาม "ผู้รับทุกคน" ไม่ใช่แค่คนที่รอบนี้มีสัญญาณใหม่ — คนที่รอบนี้ไม่เจออะไรเลย
  //   อาจมีของค้างจากรอบก่อนที่ส่งไม่สำเร็จรออยู่ ถ้าวนตาม rowsByUser เหมือนเดิม
  //   ของค้างจะไม่มีวันถูกกวาดมาแจ้ง = บั๊กเดิมกลับมาในรูปใหม่
  const notify = {
    notifications: 0, sent: 0, failed: 0, pruned: 0, digested: 0, throttled: 0,
    pendingPicked: 0, marked: 0, telegramSent: 0, telegramFailed: 0,
  };
  const notifyNotes = [];

  if (!NO_NOTIFY && sb) {
    for (const userId of recipients) {
      const rows = rowsByUser.get(userId) ?? [];
      // ไม่มีคอลัมน์สถานะ = ไม่มีของค้างให้กวาด คนที่รอบนี้ไม่มีสัญญาณจึงข้ามไปได้เลย
      if (!pushStateReady && rows.length === 0) continue;

      const { data: profile } = await sb
        .from('profiles')
        .select('telegram_bot_token, telegram_chat_id, telegram_enabled, alert_preferences')
        .eq('id', userId)
        .maybeSingle();
      // ไม่มีแถว profile ก็ยังต้องแจ้งเตือน — ค่าเริ่มต้นคือ "ส่งทุกสัญญาณ" (เหมือน route เดิม)
      const prefs = profile?.alert_preferences ?? {};

      // ส่งเป็น "ฟังก์ชันกรอง" เข้าไป ไม่ใช่กรองที่นี่แล้วส่งเฉพาะที่ผ่าน
      // เพราะของค้างจากรอบก่อนถูกอ่านขึ้นมาข้างใน sendPendingSignalsToUser
      // สคริปต์นี้กรองมันล่วงหน้าไม่ได้ (ยังไม่เห็นมันด้วยซ้ำ)
      const allow = (s) => {
        if (s.action === 'BUY' && prefs.buy_signals === false) return false;
        if (s.action === 'SELL' && prefs.sell_signals === false) return false;
        if (prefs.strong_signals_only && s.strength !== 'strong' && s.strength !== 'very_strong') return false;
        return true;
      };
      const wanted = rows.filter(allow);

      try {
        const res = await lib.sendPendingSignalsToUser(sb, userId, rows, {
          filter: allow,
          speedScore: lib.speedScore,
        });
        notify.notifications += res.notifications;
        notify.sent += res.sent;
        notify.failed += res.failed;
        notify.pruned += res.pruned;
        notify.pendingPicked += res.pendingPicked ?? 0;
        notify.marked += res.marked ?? 0;
        if (res.digested) notify.digested++;
        if (res.throttled) notify.throttled++;
        if (res.reason && !notifyNotes.includes(res.reason)) notifyNotes.push(res.reason);
        for (const e of res.errors) if (notifyNotes.length < 8 && !notifyNotes.includes(e)) notifyNotes.push(e);
      } catch (e) {
        // push ส่งไม่ออกต้องไม่ล้มทั้งรอบ — สัญญาณบันทึกลง DB ไปแล้ว ยังเปิดแอปดูได้
        notifyNotes.push(`ส่ง push ล้ม: ${e?.message ?? e}`);
      }

      // Telegram — เฉพาะคนที่ตั้งค่าไว้ครบ ใช้ชุดเดียวกับที่ผ่านเกณฑ์แล้ว
      if (!profile?.telegram_enabled || !profile.telegram_bot_token || !profile.telegram_chat_id) continue;
      const cfg = { botToken: profile.telegram_bot_token, chatId: profile.telegram_chat_id };
      for (const signal of wanted) {
        try {
          const res = await lib.sendSignalAlert(cfg, signal);
          await sb.from('telegram_alerts').insert({
            user_id: userId,
            signal_id: signal.id,
            message: `${signal.action} ${signal.symbol} @ ${signal.entry_price}`,
            success: res.success,
            error: res.error ?? null,
          });
          if (res.success) {
            notify.telegramSent++;
            await sb.from('signals').update({ telegram_sent: true }).eq('id', signal.id);
          } else {
            notify.telegramFailed++;
            if (notifyNotes.length < 8) notifyNotes.push(`telegram: ${res.error}`);
          }
        } catch (e) {
          notify.telegramFailed++;
          if (notifyNotes.length < 8) notifyNotes.push(`telegram: ${e?.message ?? e}`);
        }
      }
    }
  }

  // ── 9. หมดอายุสัญญาณเก่า (เหมือน route เดิม) ────────────────────────────────────
  if (!DRY_RUN && sb) {
    const { error } = await sb
      .from('signals')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());
    if (error) dbErrors.push(`expire: ${error.message}`);
  }

  // ── 10. รายงาน ───────────────────────────────────────────────────────────────────
  const totalMs = Date.now() - startedAt;
  const cpuTotal = process.cpuUsage(cpuStart);
  const rejectionLine = lib.describeRejections(gateSummary);

  const summary = {
    dryRun: DRY_RUN,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: totalMs,
    fetchMs,
    cpuMs: Math.round((cpuTotal.user + cpuTotal.system) / 1000),
    computeCpuMs: Math.round((cpuCompute.user + cpuCompute.system) / 1000),
    universeSize: lib.SYMBOL_UNIVERSE.length,
    symbols: targetList.length,
    fromWatchlist,
    requests: jobs.length,
    fetch: fetchStats,
    fetchFailures: failedDetail,
    recipients: recipients.size,
    evaluated,
    accepted: allRows.length,
    gateSummary,
    gateSummaryText: rejectionLine,
    overCapacity,
    dedupeSkipped,
    signalsInserted: DRY_RUN ? 0 : signalsInserted,
    pricesUpdated,
    pushStateReady,
    speedScoreSource: lib.speedScoreSource,
    ...notify,
    dbErrors,
    notifyNotes,
  };

  if (AS_JSON) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('');
    console.log(`เวลา   ${(totalMs / 1000).toFixed(2)} วิ (ดึงข้อมูล ${(fetchMs / 1000).toFixed(2)} วิ) · CPU ${summary.cpuMs} ms (ส่วน generateSignal ล้วน ${summary.computeCpuMs} ms)`);
    console.log(`ดึง    สำเร็จ ${fetchStats.ok}/${jobs.length} (${pct(fetchStats.ok, jobs.length)}) · ดึงไม่ได้ ${fetchStats.httpFail} · ข้อมูลไม่พอ ${fetchStats.thin} · หมดงบเวลา ${fetchStats.budget}`);
    console.log(`เกณฑ์  พิจารณา ${evaluated} · ผ่าน ${allRows.length} · ${rejectionLine}`);
    console.log(`บันทึก ${DRY_RUN ? `${allRows.length} (dry run ไม่ได้เขียน)` : signalsInserted} แถว · ซ้ำของเดิมข้าม ${dedupeSkipped} · ราคาอัปเดต ${pricesUpdated} · ผู้รับ ${recipients.size} คน`);
    if (!NO_NOTIFY) {
      console.log(`แจ้ง   เด้ง ${notify.notifications} ครั้ง (ถึงเครื่อง ${notify.sent}) · เก็บตกของค้าง ${notify.pendingPicked} · ปั๊มว่าแจ้งแล้ว ${notify.marked} · โดนกันความถี่ ${notify.throttled} คน · ล้ม ${notify.failed} · telegram ${notify.telegramSent}/${notify.telegramSent + notify.telegramFailed}`);
      console.log(`สถานะ  คอลัมน์ push_sent ${pushStateReady ? 'พร้อม (เก็บตกรอบหน้าได้)' : 'ยังไม่มี — ยังไม่ได้รัน migration 006 (สัญญาณที่พลาดจะหายเหมือนเดิม)'}`);
    }
    if (failedDetail.length) {
      console.log('');
      console.log(`ตัวที่ดึงไม่สำเร็จ (${failedDetail.length}):`);
      for (const f of failedDetail) console.log(`  - ${f.symbol} (${f.market}) ${f.tf}: ${f.why}`);
    }
    for (const e of dbErrors) console.log(`  [DB] ${e}`);
    for (const e of notifyNotes) console.log(`  [แจ้งเตือน] ${e}`);
  }

  // ── 11. สรุปขึ้นหน้า run ของ GitHub Actions ─────────────────────────────────────
  const line =
    `สแกน ${targetList.length} ตัว · ดึงสำเร็จ ${fetchStats.ok}/${jobs.length} · ` +
    `ผ่านเกณฑ์ ${allRows.length}/${evaluated} · บันทึก ${DRY_RUN ? 0 : signalsInserted} · ` +
    `เด้ง ${notify.notifications} ครั้ง · ${(totalMs / 1000).toFixed(1)} วิ`;
  ghaNotice(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ตัวสแกนทั้งจักรวาล\n\n${line}\n\n${rejectionLine}\n` +
        (failedDetail.length
          ? `\nดึงไม่สำเร็จ ${failedDetail.length} รายการ:\n${failedDetail.map((f) => `- ${f.symbol} ${f.tf}: ${f.why}`).join('\n')}\n`
          : '')
    );
  }
  for (const e of dbErrors) ghaWarn(`DB: ${e}`);
  for (const e of notifyNotes) ghaWarn(`แจ้งเตือน: ${e}`);

  // ── 12. exit code ────────────────────────────────────────────────────────────────
  // ล้มบางตัว = ไม่แดง (สัญลักษณ์หลุดกระดาน/ตลาดปิดเป็นเรื่องปกติ แต่ต้องเห็นเป็น warning)
  // ล้มเกินครึ่ง หรือเขียน DB ไม่ได้ = แดง เพราะรอบนั้นไม่ได้ทำงานจริง
  if (systemicFailure || dbErrors.length) process.exitCode = 1;
  else if (failedDetail.length) ghaWarn(`ดึงข้อมูลไม่สำเร็จ ${failedDetail.length}/${jobs.length} รายการ — ดูรายชื่อใน log`);
}

main().catch((err) => {
  console.error(err);
  ghaError(`ตัวสแกนล้มทั้งรอบ: ${err?.message ?? err}`);
  process.exit(1);
});
