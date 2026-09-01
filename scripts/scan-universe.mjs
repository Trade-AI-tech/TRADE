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
 * ยิง Yahoo พร้อมกันกี่คำขอ
 *
 * ── ของเดิม (บันทึกไว้เพราะเป็นที่มาของเลข 6) ────────────────────────────────
 * วัดบนจักรวาลเต็ม 58 ตัว (116 คำขอ: 1D + 1H ต่อตัว):
 *   concurrency 4 → 8.70 วิ · concurrency 6 → 6.32 วิ · ทั้งสองรอบสำเร็จ 116/116 ไม่โดน 429
 *
 * ── ทำไมเป็น 3 ตั้งแต่ 2026-08-29 ───────────────────────────────────────────
 * จักรวาลเหลือ XAUUSD ตัวเดียว → 1 symbol × 3 timeframe = **3 คำขอ/รอบ**
 * pool() ใช้ min(limit, จำนวนงาน) อยู่แล้ว ค่า 6 กับ 3 จึงให้พฤติกรรมเหมือนกันเป๊ะวันนี้
 * (ทั้งสามใบยิงพร้อมกันทั้งคู่) — ตั้งเป็น 3 เพื่อให้ "ตัวเลขที่เขียนไว้" ตรงกับสิ่งที่เกิดจริง
 * ⚠ ทั้งสามใบยิงไปที่ ticker เดียวกัน (GC=F) พร้อมกัน ถ้าวันไหน Yahoo เริ่มจำกัดต่อ ticker
 *   อาการจะเป็น "ล้มพร้อมกันทั้งสามใบ" ไม่ใช่ล้มทีละใบ — ดู SYSTEMIC_FAILURE_RATIO ข้างล่าง
 */
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY || 3);

/**
 * งบเวลาดึงข้อมูลทั้งรอบ เกินแล้วหยุดดึงตัวที่เหลือ (และรายงานเป็นตัวเลข ไม่ข้ามเงียบ)
 *
 * ⚠ พูดตรง ๆ: ตั้งแต่จักรวาลเหลือตัวเดียว ปุ่มนี้ "แทบไม่มีทางทำงาน" เพราะการเช็กงบเวลา
 *   เกิดขึ้น *ก่อนเริ่ม* ดึงแต่ละใบ และงานทั้ง 3 ใบถูกปล่อยพร้อมกันที่วินาทีที่ 0
 *   (จำนวนงาน = CONCURRENCY) จึงไม่มีใบไหนที่เริ่มทีหลังให้ตรวจทัน
 *   มันจะกลับมามีความหมายทันทีที่จำนวนคำขอมากกว่า CONCURRENCY (เพิ่ม symbol/timeframe)
 * 20 วิ = เผื่อไว้ ~28 เท่าของ 0.72 วิที่วัดได้จริงเมื่อ 2026-08-31 (3 คำขอ)
 * และยังทำให้ทั้งจ็อบจบต่ำกว่า 60 วิ = ถูกคิดแค่ 1 นาทีของ GitHub
 */
const FETCH_BUDGET_MS = Number(process.env.SCAN_FETCH_BUDGET_MS || 20_000);

/**
 * หน้าต่างกันสัญญาณซ้ำ — 1D/1H ลอกจาก src/app/api/cron/scan-markets/route.ts เป๊ะ ๆ
 * ต้องเท่ากันเสมอ เพราะทุกตัวสแกนอ่าน/เขียนตาราง signals ใบเดียวกัน ถ้าตั้งไม่ตรงกัน
 * ตัวที่หน้าต่างสั้นกว่าจะออกสัญญาณซ้ำของที่อีกตัวเพิ่งบันทึกไป แล้วแจ้งเตือนเด้งสองรอบ
 *
 * ── 15m: 20 ชม. โดย "ตั้งใจแล้ว" ตั้งแต่ 2026-08-29 (เดิมเป็นอุบัติเหตุ) ────────
 * route เดิมไม่มีเลน 15m ค่าของมันจึงไม่มีต้นฉบับให้ลอก และโค้ดเดิมกรองหน้าต่างแคบ
 * เฉพาะ timeframe === '1H' ทำให้ 15m ตกไปใช้หน้าต่าง 20 ชม. ของ 1D โดยไม่มีใครตั้งใจ
 *
 * วัดจริงบนแท่งสด XAUUSD 15m ย้อนหลัง 31 วัน: ผ่านประตูคุณภาพ 402 ใบ = 12.97 ใบ/วัน
 * หลังกันซ้ำ 20 ชม. เหลือ 1.48 ใบ/วัน — แปลว่า **ปริมาณแจ้งเตือนของทั้งระบบตอนนี้
 * แขวนอยู่บนเลขนี้ตัวเดียว** ไม่ใช่บนเกณฑ์คุณภาพ
 *
 * ⚠ ใครที่คิดจะ "แก้ให้ถูก" โดยให้ 15m มีหน้าต่างของตัวเอง (เช่น 1 ชม. แบบคาบแท่ง)
 *   ต้องรู้ว่านั่นคือการเปลี่ยนจาก ~1.5 เป็น ~13 ใบ/วันทันที และมันคือการ "ผ่อนความถี่"
 *   ที่เจ้าของยังไม่ได้สั่ง — เสนอพร้อมตัวเลขก่อนเสมอ อย่าแก้เงียบ ๆ
 *   (เลนนี้ยังไม่เคยถูกตรวจสอบนอกตัวอย่างเลย ดู perTimeframe ใน src/lib/universe.ts)
 */
const DEDUPE_HOURS_1D = 20;
const DEDUPE_HOURS_1H = 4;
const DEDUPE_HOURS_15M = 20;

/** หน้าต่างกันซ้ำของ timeframe นั้น — เขียนเป็นฟังก์ชันเพื่อไม่ให้มี timeframe ไหนตกไปใช้ค่าคนอื่นเงียบ ๆ */
const dedupeHoursFor = (tf) => {
  if (tf === '1H') return DEDUPE_HOURS_1H;
  if (tf === '15m') return DEDUPE_HOURS_15M;
  return DEDUPE_HOURS_1D;
};

/**
 * หน้าต่างที่ "ยาวที่สุด" ในบรรดาทุก timeframe — ใช้เป็นขอบเขตของ query ที่ดึงสัญญาณเดิม
 *
 * ทำไมต้องเป็น max ไม่ใช่ DEDUPE_HOURS_1D ตรง ๆ: query ดึงเฉพาะแถวที่ใหม่กว่าค่านี้
 * ถ้าหน้าต่างของ timeframe ไหนยาวกว่าขอบเขตที่ดึงมา แถวที่อยู่นอกขอบเขตจะไม่เคยถูกอ่าน
 * → กันซ้ำของ timeframe นั้น "เงียบ ๆ ไม่ทำงาน" ตามส่วนที่เกิน แล้วแจ้งเตือนซ้ำโดยไม่มี
 * error ให้เห็นเลย ซึ่งเป็นอุบัติเหตุตระกูลเดียวกับที่ 15m เคยตกไปใช้หน้าต่างของ 1D
 * ผูกไว้กับ max จึงแปลว่า "ขยับค่าคงที่ตัวไหนก็ได้ ขอบเขตตามให้เอง" ไม่ต้องจำว่าต้องแก้สองที่
 *
 * วันนี้ = max(20, 4, 20) = 20 ชม. เท่ากับของเดิมเป๊ะ ไม่มีพฤติกรรมไหนเปลี่ยน
 */
const DEDUPE_LOOKBACK_HOURS = Math.max(DEDUPE_HOURS_1D, DEDUPE_HOURS_1H, DEDUPE_HOURS_15M);

/** timeframe → interval/range ของ Yahoo — ต้องตรงกับ route เดิม (1D: 1d/1y · 1H: 1h/3mo) */
const TIMEFRAMES = {
  '1D': { interval: '1d', range: '1y' },
  '1H': { interval: '1h', range: '3mo' },
  /**
   * 15m — Yahoo ให้ย้อนหลังได้สูงสุด 1 เดือนเท่านั้น (ขอ 2mo ขึ้นไปตอบ Unprocessable Entity)
   * 2,052 แท่งจึงพอวิเคราะห์รอบปัจจุบันได้ แต่ **น้อยเกินกว่าจะแบ่ง train/validation/test**
   * แปลว่าเส้นทาง 15m ไม่เคยถูกตรวจสอบแบบนอกตัวอย่างเลย ต่างจาก 1H/1D
   * ทุกตัวเลขที่ออกจาก 15m จึงเป็น "ของที่ยังไม่ได้วัด" ไม่ใช่ "ของที่วัดแล้วว่าดี"
   */
  '15m': { interval: '15m', range: '1mo' },
};

/** แท่งน้อยกว่านี้วิเคราะห์ไม่ได้ — เกณฑ์เดียวกับ route เดิม */
const MIN_CANDLES = 50;

/**
 * ดึงข้อมูลล้มเกินสัดส่วนนี้ = พังทั้งระบบ (Yahoo บล็อก/เน็ตขาด) ไม่ใช่ "บางตัวไม่มีข้อมูล"
 *
 * ⚠ เจตนาเดิมของค่านี้คือ "แยกพังทั้งระบบ ออกจาก บางตัวไม่มีข้อมูล" ซึ่งเป็นการแยกที่
 *   **เป็นไปไม่ได้อีกต่อไปโดยนิยาม** เมื่อจักรวาลเหลือ symbol เดียว: ทั้งสามใบเป็นของ
 *   GC=F ตัวเดียวกัน ยิงพร้อมกัน จึงล้มแบบสัมพันธ์กัน ไม่ใช่เหตุการณ์อิสระ 3 ครั้ง
 *   ถ้าใช้สัดส่วน 0.5 ตรง ๆ กับ 3 ใบ แค่ล้ม 2 ใน 3 (เช่น 15m ไม่มีแท่งช่วงตลาดปิด
 *   + 1H สะดุดหนึ่งครั้ง) ก็จะกลายเป็น run สีแดงทันที ทั้งที่รอบนั้นยังสแกน 1D ได้ปกติ
 *   — สัญญาณเตือนที่ปลุกคนผิดบ่อย ๆ คือสัญญาณเตือนที่ถูกเลิกเชื่อ
 */
const SYSTEMIC_FAILURE_RATIO = 0.5;

/**
 * ต่ำกว่านี้ให้ใช้กติกา "ล้มครบทุกใบ" แทนสัดส่วน (ดูเหตุผลข้างบน)
 * 6 = จำนวนคำขอของจักรวาล 2 ตัว × 3 timeframe — จุดที่สัดส่วนเริ่มมีความหมายทางสถิติ
 * ล้มครบทุกใบบนจักรวาลตัวเดียว = ไม่ได้สแกนอะไรเลยรอบนั้น ซึ่งต้องแดงจริง ๆ
 */
const SYSTEMIC_MIN_JOBS = 6;

// ═══════════════════ หลักฐานย้อนหลังของเซ็ตอัพ (ไม่บังคับ — ไม่มีไฟล์ก็สแกนต่อได้) ═══════════════════
//
// ตาราง "เมื่อเกิดเซ็ตอัพแบบนี้ในอดีต ราคาไป TP ก่อนหรือโดน SL ก่อนกี่ %" สร้างโดย
// scripts/research/build-signal-evidence.mjs — อ่านไฟล์ JSON ตรง ๆ เพราะสคริปต์นี้
// เป็น node ล้วน (JSON โหลดได้เลย ไม่ต้องผ่านตัว transpile)
// ⚠ ต้นฉบับของลำดับชั้น fallback คือ src/lib/signal-evidence.ts — ตัวช่วยข้างล่างลอกลำดับ
//   symbol → timeframe → global มาเท่านั้น ถ้าฝั่งนั้นเปลี่ยนกติกา ต้องตามมาแก้ที่นี่ด้วย
//   (npm run test:evidence คุมฝั่ง .ts · ฝั่งนี้เป็น "ป้ายแนบ" ไม่ใช่ตัวตัดสินอะไร)
// ตัวเลขนี้คือความถี่ในอดีตของเรขาคณิต SL/TP แบบเดียวกัน ไม่ใช่การพยากรณ์ผลไม้นี้

const EVIDENCE_JSON = path.join(ROOT, 'src', 'lib', 'signal-evidence.data.json');

function loadEvidenceTable() {
  try {
    const j = JSON.parse(readFileSync(EVIDENCE_JSON, 'utf8'));
    return j?.cells ? j : null;
  } catch {
    return null; // ไม่มีไฟล์/ไฟล์เพี้ยน = ไม่แนบหลักฐาน ไม่ใช่เหตุให้ตัวสแกนล้ม
  }
}
const EVIDENCE_TABLE = loadEvidenceTable();

/** 15m ไม่มีประวัติให้เดิน — ใช้ข้อมูล 1H แล้วประกาศผ่าน sourceTimeframe (เหมือนตัวอ่าน .ts) */
const evidenceDataTf = (tf) => (String(tf).toLowerCase() === '15m' ? '1H' : String(tf).toUpperCase());

/**
 * ชั้นรวมใช้ได้ไหม — ลอกกติกา "ด่านความบริสุทธิ์ของชั้นรวม" จาก src/lib/signal-evidence.ts
 * (ทุก symbol ในตารางต้องอยู่ในจักรวาลที่สแกนจริง ไม่งั้นปิดชั้น timeframe/global ทั้งคู่
 *  เพราะเป็นการเอาค่าเฉลี่ยของสินทรัพย์ที่เลิกเทรดแล้วมาแปะบนสัญญาณทอง)
 * ⚠ ถ้าฝั่ง .ts เปลี่ยนกติกา ต้องตามมาแก้ที่นี่ด้วย — npm run test:universe จับความไม่ตรงกันนี้
 */
function aggregateLayersUsable(universeSymbols) {
  if (!EVIDENCE_TABLE) return false;
  const keys = Object.keys(EVIDENCE_TABLE.cells?.symbol ?? {});
  if (!keys.length) return false;
  const allowed = new Set(universeSymbols.map((s) => String(s).trim().toUpperCase()));
  return keys.every((k) => allowed.has(String(k.split('|')[0] ?? '').trim().toUpperCase()));
}

function evidenceFor(signal, aggregateOk) {
  if (!EVIDENCE_TABLE) return null;
  if (signal.action !== 'BUY' && signal.action !== 'SELL') return null;
  const tf = evidenceDataTf(signal.timeframe);
  const c = EVIDENCE_TABLE.cells;
  const attempts = [
    ['symbol', c.symbol?.[`${signal.symbol}|${tf}|${signal.action}|${signal.strength}`]],
    ...(aggregateOk
      ? [
          ['timeframe', c.timeframe?.[`${tf}|${signal.action}|${signal.strength}`]],
          ['global', c.global?.[`${tf}|${signal.action}`]],
        ]
      : []),
  ];
  for (const [level, cell] of attempts) {
    if (!cell || !Number.isFinite(cell.n)) continue;
    return {
      level,
      n: cell.n,
      tpFirstPct: cell.tpFirstPct,
      slFirstPct: cell.slFirstPct,
      timeoutPct: cell.timeoutPct,
      sourceTimeframe: cell.sourceTimeframe,
      spanYears: cell.spanYears,
    };
  }
  return null;
}

// ── ที่นั่งจองของตลาด GOLD (GOLD_RESERVED_SLOTS = 2) ถูกลบทิ้งเมื่อ 2026-08-29 ──
//
// ของเดิมทำอะไร: กันที่ไว้ 2 ที่ในเพดานต่อคน ให้สัญญาณทองที่ผ่านเกณฑ์ครบ ไม่ให้โดน
// คู่ FOREX ที่คะแนนสูงกว่าเบียดตกในวันที่ตลาดขยับพร้อมกันทั้งกระดาน (เจ้าของสั่ง 2026-08-28)
//
// ทำไมลบ: คำสั่ง 2026-08-29 ทำให้จักรวาลเหลือ XAUUSD ตัวเดียว และ buildScanTargets()
// ไม่รับ watchlist นอกจักรวาลอีกแล้ว → **ผู้เข้าแข่งขันทุกใบเป็นทองทั้งหมด**
// การจองที่ให้ทองในสนามที่มีแต่ทองไม่เปลี่ยนผลลัพธ์แม้แต่ใบเดียว (พิสูจน์ง่าย ๆ:
// เพดานรวม 3 = จำนวนใบสูงสุดที่ผลิตได้ 1 symbol × 3 timeframe) มันเหลือแค่การเรียก
// selectSignals สองครั้งแล้วเอาผลมาต่อกัน — โค้ดตายที่ยังต้องอ่านและยังพังได้
//
// อยากได้กลับตอนเพิ่มตลาดอื่นเข้าจักรวาล: กติกาเดิมอยู่ในประวัติ git ของไฟล์นี้
// (จองให้เฉพาะทองที่ผ่านเกณฑ์คุณภาพเดิมครบ · ไม่ผ่าน = คืนที่ให้ตลาดอื่น · ที่จองเป็น
//  ขั้นต่ำไม่ใช่เพดาน ทองที่ล้นยังกลับไปแข่งตามการเรียงปกติได้)

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
/**
 * ชื่อ timeframe เทียบแบบไม่สนตัวพิมพ์ แล้วคืน "คีย์ตัวจริง" ของ TIMEFRAMES เสมอ
 * เดิมบังคับ .toUpperCase() ซึ่งใช้ได้กับ 1D/1H แต่พัง 15m ทันทีที่เพิ่มเข้ามา (กลายเป็น 15M)
 */
const canonicalTf = (raw) =>
  Object.keys(TIMEFRAMES).find((k) => k.toLowerCase() === String(raw).trim().toLowerCase()) ?? String(raw).trim();

const TF_LIST = (argValue('timeframes') || '1D,1H')
  .split(',')
  .map(canonicalTf)
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
      costs: path.join(ROOT, 'src', 'lib', 'costs.ts'),
      push: path.join(ROOT, 'src', 'lib', 'push-server.ts'),
      telegram: path.join(ROOT, 'src', 'lib', 'telegram.ts'),
      // ตรรกะ "แจ้งกลับทิศ" — pure ทั้งไฟล์ ทดสอบด้วย scripts/test-signal-flips.mjs
      flips: path.join(ROOT, 'src', 'lib', 'signal-flips.ts'),
    };
    for (const p of Object.values(paths)) if (!existsSync(p)) fail(`ไม่พบไฟล์ต้นฉบับ ${p}`);

    transpileGraph(Object.values(paths), tmpDir);
    const load = (abs) => import(pathToFileURL(path.join(tmpDir, flatName(abs))).href);
    const [universe, marketData, engine, costs, push, telegram, flips] = await Promise.all(Object.values(paths).map(load));

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
      ...pick(universe, ['SYMBOL_UNIVERSE', 'buildScanTargets', 'watchlistOutsideUniverse', 'selectSignals', 'describeRejections', 'SIGNAL_GATE'], 'src/lib/universe.ts'),
      ...pick(marketData, ['fetchChart'], 'src/lib/market-data.ts'),
      ...pick(engine, ['generateSignal'], 'src/lib/signal-engine.ts'),
      ...pick(costs, ['applyStopFloor', 'costRFor', 'MAX_COST_R'], 'src/lib/costs.ts'),
      ...pick(push, ['sendPendingSignalsToUser', 'pushStateColumnAvailable'], 'src/lib/push-server.ts'),
      ...pick(telegram, ['sendSignalAlert'], 'src/lib/telegram.ts'),
      ...pick(flips, ['findFlipTargets', 'markFlipTargets'], 'src/lib/signal-flips.ts'),
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

  // ── ตาราง signals มีคอลัมน์ต้นทุนแล้วหรือยัง (migration 007) ────────────────────
  // เหตุผลเดียวกับ pushStateReady: ใส่ฟิลด์ที่ตารางไม่มี Postgres ปฏิเสธทั้ง batch
  let costColumnReady = false;
  if (sb) {
    const { error } = await sb.from('signals').select('cost_r').limit(1);
    costColumnReady = !error;
    if (!costColumnReady) {
      ghaWarn('ยังไม่ได้รัน supabase/migrations/007_signal_outcomes.sql — สัญญาณจะไม่มีตัวเลขต้นทุนกำกับ');
    }
  }

  // ── ตาราง signals มีคอลัมน์ป้ายกลับทิศแล้วหรือยัง (migration 009) ───────────────
  // ต้องรู้ "ก่อน" ยิง query กันซ้ำ เพราะรอบนี้จะขอคอลัมน์ flipped_at/outcome เพิ่ม
  // จาก query เดิม — ขอคอลัมน์ที่ไม่มีจริง query กันซ้ำจะล้ม แล้วทั้งรอบล้มตาม (fail)
  // ซึ่งแย่กว่าการไม่มีป้ายมาก · โหมดถอย: ไม่มีคอลัมน์ = ข้ามการปั๊มป้าย แต่คำเตือน
  // กลับทิศในแจ้งเตือนยังออกครบ (มันประกอบจาก field ในหน่วยความจำ ไม่ใช่คอลัมน์)
  let flipColumnReady = false;
  if (sb) {
    const { error } = await sb.from('signals').select('flipped_at').limit(1);
    flipColumnReady = !error;
    if (!flipColumnReady) {
      // ⚠ ถ้อยคำนี้ต้องบอกข้อจำกัดครบ: ไม่มีป้าย = ใบเก็บตก (รอบที่ถูกกันความถี่/ส่งล้ม)
      //   ประกอบคำเตือนคืนไม่ได้ด้วย (ดู attachFlipNotesFromDb ใน push-server.ts)
      //   เวอร์ชันก่อนเขียนว่า "ยังออกตามปกติ" ซึ่งจริงเฉพาะรอบที่ push สำเร็จรอบแรก
      const msg =
        'ยังไม่ได้รัน supabase/migrations/009_signal_flips.sql — คำเตือนกลับทิศออกเฉพาะใบแจ้งเตือนของรอบที่ตรวจพบ ' +
        '(รอบที่ถูกกันความถี่หรือส่งล้ม จะเก็บตกแบบไม่มีบรรทัดเตือน) และใบเก่าไม่ถูกปั๊มป้าย ' +
        '(แถบเตือนบนหน้าเว็บยังไม่ขึ้น) · เปิด Supabase → SQL Editor แล้ววางไฟล์นั้นทั้งไฟล์';
      ghaWarn(msg);
      console.log(`⚠ ${msg}`);
    }
  }

  /**
   * ชั้นนโยบายหลังเครื่องยนต์ตัดสินใจแล้ว — ทำสองอย่าง
   *
   * 1. **ขยายระยะ SL ของ 15m ให้ถึงขั้นต่ำ** (ไม่แตะ 1H/1D)
   *    ต้นทุนต่อไม้ = ค่าธรรมเนียม ÷ ระยะ SL วัดเมื่อ 2026-08-24 จาก ATR สดได้
   *    1D 0.021 R · 1H 0.149 R · 15m 0.306 R — 15m แพงกว่า 1D สิบสี่เท่าครึ่ง
   *    ตัวอย่างสุดขั้ว: EURUSD บน 15m ได้ SL แค่ 0.034% = 3.4 pip ขณะสเปรดไป-กลับ 1.5 pip
   *    คือจ่ายค่าสเปรด 44% ของเงินที่เสี่ยงตั้งแต่ยังไม่เข้าไม้
   *
   *    ทำไมไม่แตะ 1H/1D ด้วย: สองเส้นทางนั้นถูกวัดผลนอกตัวอย่างไว้แล้วด้วย SL ตามธรรมชาติ
   *    ของเครื่องยนต์ ถ้าขยายด้วย ตัวเลขบนจอจะเทียบกับผลวิจัยไม่ได้อีกต่อไป
   *
   *    ⚠ การขยาย SL **ไม่ได้ทำให้ระบบกำไร** ขอบก่อนหักต้นทุนของจักรวาลนี้วัดได้ −0.0272 R/ไม้
   *    มันแค่เลิกจ่ายค่าธรรมเนียมเกินตัว ราคาที่จ่ายแทนคือไม้กินระยะกว้างขึ้นและอยู่นานขึ้น
   *
   * 2. **ติดตัวเลขต้นทุนไปกับทุกสัญญาณ** เพื่อให้เจ้าของเห็นเองว่าไม้นี้เสียค่าผ่านทางกี่ R
   *    ค่านี้คำนวณจาก entry/stop ล้วน ๆ จึงตรงกับที่ scripts/resolve-signals.mjs จะคิดตอนปิดบัญชี
   */
  let stopsWidened = 0;
  const applyCostPolicy = (signal, tf) => {
    let out = signal;
    if (tf === '15m') {
      try {
        const floored = lib.applyStopFloor(
          signal.entry_price, signal.stop_loss, signal.take_profit, signal.symbol, signal.market
        );
        if (floored && floored.widenedBy > 1) {
          out = { ...out, stop_loss: floored.stop_loss, take_profit: floored.take_profit };
          stopsWidened++;
        }
      } catch (e) {
        ghaWarn(`ขยาย SL ของ ${signal.symbol} 15m ไม่สำเร็จ (${e?.message ?? e}) — ใช้ระยะเดิม`);
      }
    }
    if (costColumnReady) {
      try {
        const c = lib.costRFor(out.entry_price, out.stop_loss, out.symbol, out.market);
        if (Number.isFinite(c)) out = { ...out, cost_r: Math.round(c * 1e4) / 1e4 };
      } catch { /* ไม่มีค่าประมาณต้นทุนของตัวนี้ — ปล่อยว่างดีกว่าใส่เลขมั่ว */ }
    }
    return out;
  };

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

  // watchlist ที่อยู่นอกจักรวาลไม่ถูกสแกนแล้วตั้งแต่ 2026-08-29 (คำสั่งเจ้าของ: ทองอย่างเดียว)
  // ต้องพิมพ์จำนวนและรายชื่อทุกรอบ — "ไม่สแกน" ที่ไม่มีใครเห็น คือของหายเงียบ ๆ
  // แถวในตาราง watchlist ไม่ถูกลบ ผู้ใช้ยังเห็นบนหน้า /markets พร้อมป้ายว่าไม่ได้สแกนแล้ว
  const skippedWatchlist = lib.watchlistOutsideUniverse(watchlistRows);

  console.log(
    `จักรวาล ${lib.SYMBOL_UNIVERSE.length} ตัว (${lib.SYMBOL_UNIVERSE.map((u) => u.symbol).join(', ')})` +
      ` · watchlist นอกจักรวาลที่ "ไม่สแกน" ${skippedWatchlist.length} ตัว` +
      ` · สแกนจริง ${targetList.length} ตัว × ${TF_LIST.length} timeframe = ${targetList.length * TF_LIST.length} คำขอ` +
      ` · ผู้รับ ${recipients.size} คน${DRY_RUN ? ' · [dry run]' : ''}`
  );
  if (skippedWatchlist.length) {
    console.log(
      `  ไม่สแกน (นอกจักรวาล): ${skippedWatchlist.map((s) => `${s.symbol}/${s.market}`).join(', ')}` +
        ' — เจ้าของสั่งเมื่อ 2026-08-29 ว่าเทรดทองอย่างเดียว · ราคาของตัวเหล่านี้จะไม่อัปเดตอีก'
    );
  }
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
      //
      // ⚠ เก็บได้เฉพาะ "ตัวที่สแกน" เท่านั้น แปลว่าแถว market_prices ของ 12 สัญลักษณ์ที่ถูก
      //   ถอดออกเมื่อ 2026-08-29 จะค้างที่ค่าสุดท้ายตลอดไป (ไม่ได้ลบทิ้ง — ลบคือทำลาย
      //   ข้อมูลของผู้ใช้) หน้า /markets จึงต้องเป็นคนบอกเองว่าแถวไหน "ไม่ได้สแกนแล้ว"
      //   ไม่งั้นราคาค้างจะดูเหมือนราคาปัจจุบัน · scanHealth ไม่ได้รับผลกระทบเพราะมันดู
      //   max(updated_at) ทั้งตาราง ซึ่งทองอัปเดตให้ทุกรอบอยู่แล้ว
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
  // จำนวนคำขอน้อย = ใช้ "ล้มครบทุกใบ" · จำนวนมากพอ = ใช้สัดส่วน (เหตุผลที่ SYSTEMIC_MIN_JOBS)
  const systemicFailure =
    jobs.length > 0 &&
    (jobs.length >= SYSTEMIC_MIN_JOBS
      ? totalFails / jobs.length > SYSTEMIC_FAILURE_RATIO
      : totalFails === jobs.length);
  if (systemicFailure) {
    ghaError(
      jobs.length >= SYSTEMIC_MIN_JOBS
        ? `ดึงข้อมูลล้ม ${totalFails}/${jobs.length} — เกินครึ่ง ถือว่าพังทั้งระบบ ไม่ใช่บางตัวไม่มีข้อมูล`
        : `ดึงข้อมูลล้มครบทั้ง ${jobs.length}/${jobs.length} ใบ — รอบนี้ไม่ได้สแกนอะไรเลย (Yahoo ไม่ตอบ/เน็ตขาด/สัญลักษณ์หลุดกระดาน)`
    );
  }

  // ── 4. สร้างสัญญาณดิบ (ยังไม่ตัดสินคุณภาพ — นั่นเป็นงานของ selectSignals) ───────
  //
  // หลักฐานย้อนหลังถูกแนบเป็น field ใหม่ `evidence` ที่นี่ (field เดิมไม่ถูกแตะ)
  // เพื่อให้ทุกชั้นถัดไปในหน่วยความจำเห็นมัน — แต่ตาราง signals ไม่มีคอลัมน์นี้
  // จึงถูกถอดออกก่อน insert (ดูขั้นที่ 6) ไม่งั้น Postgres ปฏิเสธทั้ง batch
  let evidenceAttached = 0;
  // ตารางที่ ship อยู่สร้างจากจักรวาล 13 ตัวเมื่อ 2026-08-28 · จักรวาลตอนนี้เหลือทองตัวเดียว
  // → ชั้นรวมถูกปิด แนบได้เฉพาะเซลล์ของ XAUUSD เอง (เหตุผลเต็มอยู่ที่หัว signal-evidence.ts)
  const evidenceAggregateOk = aggregateLayersUsable(lib.SYMBOL_UNIVERSE.map((u) => u.symbol));
  if (EVIDENCE_TABLE && !evidenceAggregateOk) {
    console.log(
      'หลักฐาน ปิดชั้นรวม (timeframe/global) รอบนี้ — ตารางหลักฐานถูกสร้างจากสินทรัพย์ที่ไม่ได้อยู่ในจักรวาลแล้ว ' +
        'สัญญาณที่ไม่มีเซลล์ของตัวเองจะไม่มีบล็อกหลักฐาน (ตั้งใจ — ดีกว่าอ้างสถิติของสินทรัพย์อื่น)'
    );
  }
  const cpuComputeStart = process.cpuUsage();
  const candidates = []; // { signal: Signal|null, target }
  for (let i = 0; i < jobs.length; i++) {
    const candles = fetched[i];
    if (!candles) continue; // ดึงไม่สำเร็จ — นับไว้ใน fetchStats แล้ว ไม่เอามาปนกับ "ไม่มีสัญญาณ"
    const { target, tf } = jobs[i];
    try {
      let signal = lib.generateSignal({
        symbol: target.symbol,
        name: target.name,
        market: target.market,
        candles,
        timeframe: tf,
      });
      if (signal) {
        signal = applyCostPolicy(signal, tf);
        const evidence = evidenceFor(signal, evidenceAggregateOk);
        if (evidence) {
          signal = { ...signal, evidence };
          evidenceAttached++;
        }
      }
      candidates.push({ signal, target });
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
  //   กันไม่ได้ถ้ารันวินาทีเดียวกัน จึงตั้งตารางเวลาให้คนละนาที (หน้าปัด 2,17,32,47
  //   เลี่ยงนาทีที่ 0 ที่ pg_cron ใช้ — ระยะกันชนเหลือ 2 นาที ดูคำเตือนในหัวไฟล์ workflow)
  //   เหตุผลเต็มอยู่ในหัวไฟล์ .github/workflows/scan-universe.yml
  const seen = new Set();
  /**
   * แถว active ดิบจาก query กันซ้ำ — เก็บไว้ให้ตัวตรวจกลับทิศ (ขั้นที่ 6) ใช้ต่อ
   * โดยไม่ยิง query เพิ่มแม้แต่ครั้งเดียว · จงใจเก็บ "ก่อน" ตัวกรองหน้าต่าง 1H ข้างล่าง
   * เพราะใบ 1H อายุ 10 ชม. หลุดหน้าต่างกันซ้ำแล้ว (ออกใหม่ได้) แต่ยัง active อยู่จริง
   * — โดนกลับทิศได้ และต้องถูกเตือน
   *
   * ทำไมตัวตรวจกลับทิศถึงได้ query ของตัวเองอีกใบ (FLIP_LOOKBACK_HOURS ข้างล่าง):
   * หน้าต่าง 20 ชม. ของ query กันซ้ำสั้นกว่าอายุจริงของใบ 1D (7 วัน) มาก — วัดจากไม้ฐาน
   * ในอดีต: 400 จาก 2,663 สัญญาณ 1D (15.0%) กลับทิศใบเก่าที่ยังเปิดอยู่ แต่ 0 ใน 400
   * อยู่ในหน้าต่าง 20 ชม. เพราะแท่งรายวันห่างกันอย่างน้อย 24 ชม. — ถ้าพิงหน้าต่างกันซ้ำ
   * อย่างเดียว ฟีเจอร์นี้จะไม่เคยทำงานบน 1D เลย จึงยอมจ่ายเพิ่มหนึ่ง roundtrip ต่อรอบ
   * (กติกากันซ้ำไม่ถูกแตะ — query ใหม่นี้ป้อนเฉพาะ findFlipTargets เท่านั้น)
   */
  const FLIP_LOOKBACK_HOURS = 7 * 24; // = อายุยาวสุดของใบ (1D/15m หมดอายุที่ 7 วัน · 1H ที่ 48 ชม.)
  let recentActive = [];
  if (sb) {
    // ขอบเขตต้องคลุมหน้าต่างที่ยาวที่สุด ไม่งั้นกันซ้ำของ timeframe นั้นจะไม่ทำงานเงียบ ๆ
    const since = new Date(Date.now() - DEDUPE_LOOKBACK_HOURS * 3600_000).toISOString();
    // ตัวตรวจกลับทิศต้องรู้ id (ไว้ปั๊มป้าย) + flipped_at (กันปั๊มซ้ำ) + outcome
    // (กรองใบที่ ledger ปิดแล้ว — status='active' ไม่ได้แปลว่ายังเปิด ดู resolve-signals.mjs)
    // สองคอลัมน์หลังขอเฉพาะเมื่อ probe ยืนยันว่ามีจริง ไม่งั้น query ล้มทั้งรอบ
    // การขยายรายการ select นี้ไม่แตะกติกากันซ้ำ — เงื่อนไข/หน้าต่าง/คีย์ เหมือนเดิมทุกตัว
    const dedupeCols =
      'user_id, symbol, action, timeframe, created_at, id' +
      (flipColumnReady ? ', flipped_at' : '') +
      (costColumnReady ? ', outcome' : '');
    const { data: recent, error } = await sb
      .from('signals')
      .select(dedupeCols)
      .eq('status', 'active')
      .gte('created_at', since);
    if (error) {
      // อ่านของเดิมไม่ได้ = กันซ้ำไม่ได้ = เสี่ยงเด้งซ้ำ — หยุดดีกว่าปล่อยให้สแปม
      fail(`อ่านสัญญาณเดิมเพื่อกันซ้ำไม่สำเร็จ: ${error.message} — หยุดรอบนี้ ไม่บันทึกอะไรเลย`);
    }
    recentActive = recent ?? [];
    // ทุก timeframe ถามหน้าต่างของตัวเองจาก dedupeHoursFor() — ไม่มีใครตกไปใช้ค่าของคนอื่น
    // โดยปริยายอีก (15m เคยตกไปใช้ 20 ชม. ของ 1D แบบไม่มีใครตั้งใจ · ดูคอมเมนต์ที่ค่าคงที่)
    // พฤติกรรมวันนี้เท่าเดิมเป๊ะ: 1D 20 ชม. · 1H 4 ชม. · 15m 20 ชม.
    const nowMs = Date.now();
    for (const r of recent ?? []) {
      const cutoff = nowMs - dedupeHoursFor(r.timeframe) * 3600_000;
      if (new Date(r.created_at).getTime() < cutoff) continue;
      seen.add(`${r.user_id}:${r.symbol}:${r.action}:${r.timeframe}`);
    }
  }

  // แถวสำหรับตัวตรวจกลับทิศโดยเฉพาะ — หน้าต่างยาวเท่าอายุใบจริง (เหตุผลในคอมเมนต์ข้างบน)
  // ล้มแล้วไม่หยุดรอบ: การกันซ้ำ (ความถูกต้องของสัญญาณ) สำคัญกว่าการเตือนกลับทิศ (ของแถม)
  // จึงถอยไปใช้ recentActive 20 ชม. แทน — บน 1H ยังเห็นเกือบครบ บน 1D จะพลาดจนกว่ารอบถัดไป
  let flipCandidates = recentActive;
  if (sb) {
    const flipSince = new Date(Date.now() - FLIP_LOOKBACK_HOURS * 3600_000).toISOString();
    const flipCols =
      'user_id, symbol, action, timeframe, created_at, id' +
      (flipColumnReady ? ', flipped_at' : '') +
      (costColumnReady ? ', outcome' : '');
    const { data: flipRows, error: flipErr } = await sb
      .from('signals')
      .select(flipCols)
      .eq('status', 'active')
      .gte('created_at', flipSince);
    if (flipErr) {
      console.warn(`อ่านสัญญาณเดิมสำหรับตัวตรวจกลับทิศไม่สำเร็จ: ${flipErr.message} — ถอยไปใช้หน้าต่าง 20 ชม. ของ query กันซ้ำแทน`);
    } else {
      flipCandidates = flipRows ?? [];
    }
  }

  // ── 6. ผ่านประตูคุณภาพ แล้วผูกกับผู้รับ ──────────────────────────────────────────
  //
  // selectSignals มีเพดาน maxSignalsPerRun "ต่อการเรียกหนึ่งครั้ง" จึงต้องเรียกแยกรายคน
  // ไม่งั้นผู้ใช้คนแรกจะกินโควตาของคนอื่นหมด (ระบุไว้ในคอมเมนต์ของ universe.ts เอง)
  //
  // กันซ้ำ "ก่อน" เข้าประตู ไม่ใช่หลัง — ถ้ากรองทีหลัง สัญญาณที่เคยส่งไปแล้วจะไปกิน
  // โควตาของรอบนี้ (maxSignalsPerRun — ปัจจุบัน 3) แล้วสัญญาณใหม่จริง ๆ จะถูกเบียดตกไปโดยไม่มีใครรู้
  const rowsByUser = new Map();
  const gateSummary = {};
  let evaluated = 0;
  let dedupeSkipped = 0;
  let overCapacity = 0;
  // การกลับทิศ: นับเป็น "จำนวนใบเก่าที่โดนกลับทิศ" ไม่ใช่จำนวนใบใหม่ —
  // ใบใหม่ใบเดียวกลับทิศใบเก่าได้หลายใบ และสิ่งที่เจ้าของสนใจคือไม้เก่ากี่ไม้ที่ต้องไปดู
  let flipsDetected = 0;
  let flipsMarked = 0;
  const flipNotes = [];

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

    // ── เรียกประตูครั้งเดียว ────────────────────────────────────────────────
    // เดิมที่นี่แบ่งเป็นสองรอบ (ทองชิงที่จองก่อน แล้วที่เหลือแข่งกัน) ตามคำสั่งเน้นทอง
    // 2026-08-28 · ตั้งแต่ 2026-08-29 จักรวาลเป็นทองล้วน สนามจึงมีแต่ทอง การจองที่
    // ให้ทองไม่เปลี่ยนผลลัพธ์อีกต่อไป — ดูเหตุผลเต็มตรงบล็อกที่ลบ GOLD_RESERVED_SLOTS
    // (null ต้องถึงมือ selectSignals เพื่อถูกนับเป็น no_signal เหมือนเดิม)
    const selection = lib.selectSignals(
      notDuplicate.map(({ signal }) => signal ?? null),
      lib.SIGNAL_GATE
    );
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
      //
      // `evidence` เป็น field ในหน่วยความจำเท่านั้น — ตาราง signals ไม่มีคอลัมน์นี้
      // ถอดออกก่อน insert ด้วยเหตุผลเดียวกับ push_sent/cost_r: ฟิลด์ที่ตารางไม่รู้จัก
      // ทำให้ Postgres ปฏิเสธทั้ง batch แล้วสัญญาณทั้งรอบหายเงียบ
      // (หน้าเว็บไม่เสียอะไร — SignalCard คำนวณหลักฐานเองจาก src/lib/signal-evidence.ts)
      const { evidence: _evidence, ...dbSignal } = signal;
      const row = { ...dbSignal, id: randomUUID(), user_id: userId, ...(pushStateReady ? { push_sent: false } : {}) };

      // ── ตรวจกลับทิศ (เจ้าของสั่ง 2026-08-28) ─────────────────────────────────
      // ใบ active เดิมของคนเดียวกัน symbol+timeframe เดียวกัน ที่ action ตรงข้าม
      // = ใบที่กำลังโดนใบใหม่นี้กลับทิศ — เกณฑ์เต็มอยู่ใน findFlipTargets
      // (src/lib/signal-flips.ts) ใช้ flipCandidates ที่หน้าต่างยาวเท่าอายุใบจริง
      //
      // `flip` เป็น field ในหน่วยความจำแบบเดียวกับ `evidence` ข้างบน:
      // push-digest เห็นมันแล้วต่อบรรทัดเตือนในใบแจ้งเตือน แต่ตาราง signals
      // ไม่มีคอลัมน์นี้ — ถูกถอดออกก่อน insert ในขั้นที่ 7 เสมอ
      // ส่วน "ป้ายบนใบเก่า" (flipped_at/flipped_by) ปั๊มหลัง insert สำเร็จเท่านั้น
      const flipTargets = lib.findFlipTargets(
        { user_id: userId, symbol: signal.symbol, action: signal.action, timeframe: signal.timeframe },
        flipCandidates
      );
      if (flipTargets.length) {
        flipsDetected += flipTargets.length;
        row.flip = {
          // ข้อความเตือนอ้าง "ใบล่าสุด" — findFlipTargets เรียงใหม่สุดขึ้นก่อนให้แล้ว
          prev_action: flipTargets[0].action,
          prev_created_at: flipTargets[0].created_at,
          target_ids: flipTargets.map((t) => t.id),
        };
      }
      rows.push(row);
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
      // `flip` เป็น field ในหน่วยความจำ (เหตุผลเดียวกับ `evidence` ในขั้นที่ 6) —
      // ตาราง signals ไม่มีคอลัมน์นี้ ต้องถอดก่อน insert ไม่งั้น Postgres ปฏิเสธทั้ง batch
      const { error } = await sb.from('signals').insert(rows.map(({ flip: _flip, ...r }) => r));
      if (error) {
        dbErrors.push(`signals(${userId}): ${error.message}`);
        // แจ้งเตือนเฉพาะแถวที่ "บันทึกสำเร็จจริง" — ถ้าเด้งแจ้งเตือนของแถวที่เขียนไม่ลง
        // รอบหน้าตัวกันซ้ำจะไม่เห็นมัน แล้วเด้งซ้ำอีกทุกชั่วโมงไม่จบ
        rowsByUser.delete(userId);
      } else {
        signalsInserted += rows.length;

        // ── ปั๊มป้ายกลับทิศบนใบเก่า — "หลัง" insert ใบใหม่สำเร็จเท่านั้น ─────────────
        // flipped_by ต้องชี้ไปแถวที่มีอยู่จริง · ปั๊มไม่สำเร็จ = เสียป้ายบนเว็บ
        // และเสียบรรทัดเตือนของ "ใบเก็บตก" (push-server ประกอบคำเตือนคืนจากป้ายนี้
        // เมื่อรอบแจ้งเตือนถูกกันความถี่/ส่งล้ม — ไม่มีป้ายก็ไม่มีอะไรให้ประกอบ)
        // ยังเป็น warning ไม่ใช่ dbError ที่ทำให้รอบแดง — คำเตือนของรอบนี้ออกไปแล้ว
        // จาก field ในหน่วยความจำ ห้ามให้การปั๊มป้ายฆ่ารอบสแกนทั้งรอบ
        //
        // .is('flipped_at', null): สองรอบสแกนซ้อนกันได้จริง (watchdog + cron) —
        // ใบที่โดนรอบอื่นปั๊มตัดหน้าแล้วห้ามปั๊มทับ (ป้ายแรกคือความจริงของเวลาที่ตรวจพบ)
        // .select('id'): ให้ markFlipTargets นับจากแถวที่อัปเดตจริง ไม่ใช่จำนวนที่ตั้งใจ
        // — ตัวเลข "ปั๊มแล้ว" ในสรุปท้ายรอบต้องไม่โกหกเมื่อมีการปั๊มตัดหน้า
        if (flipColumnReady) {
          const res = await lib.markFlipTargets(
            rows,
            (ids, patch) => sb.from('signals').update(patch).in('id', ids).is('flipped_at', null).select('id'),
            new Date().toISOString()
          );
          flipsMarked += res.marked;
          if (res.missingColumn) {
            // probe ตอนต้นรอบเห็นคอลัมน์ แต่ตอนปั๊มไม่เห็น (แทบเป็นไปไม่ได้ แต่กันไว้)
            flipColumnReady = false;
            flipNotes.push('ปั๊มป้ายกลับทิศเจอ 42703 กลางรอบ — รัน supabase/migrations/009_signal_flips.sql แล้วป้ายบนเว็บจะกลับมา');
          }
          for (const e of res.errors) flipNotes.push(e);
        }
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
    // fromWatchlist = ตัวที่ "มาจาก watchlist ล้วน" ซึ่งตั้งแต่ 2026-08-29 เป็น 0 เสมอ
    // โดยโครงสร้าง (buildScanTargets รับเฉพาะสิ่งที่อยู่ในจักรวาล) — คงคีย์ไว้ให้ของที่
    // อ่าน JSON นี้อยู่ไม่พัง และเพิ่มคีย์ใหม่ที่บอกความจริงว่ามีอะไรถูกข้ามไปบ้าง
    fromWatchlist,
    watchlistSkipped: skippedWatchlist.length,
    watchlistSkippedSymbols: skippedWatchlist.map((s) => `${s.symbol}/${s.market}`),
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
    evidenceTable: EVIDENCE_TABLE ? 'src/lib/signal-evidence.data.json' : null,
    evidenceAttached,
    flipsDetected,
    flipsMarked,
    flipColumnReady,
    flipNotes,
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
    console.log(`ต้นทุน ขยาย SL ของ 15m ${stopsWidened} ตัว (เพดานต้นทุน ${lib.MAX_COST_R} R/ไม้) · ${costColumnReady ? 'ติดตัวเลขต้นทุนไปกับทุกสัญญาณ' : 'ยังไม่มีคอลัมน์ cost_r'}`);
    console.log(`หลักฐาน ${EVIDENCE_TABLE ? `แนบความถี่ในอดีตของเซ็ตอัพให้ ${evidenceAttached} สัญญาณ (ตาราง src/lib/signal-evidence.data.json)` : 'ไม่มีตาราง signal-evidence.data.json — สแกนต่อโดยไม่แนบ'}`);
    // ตัวเลขสองตัวนี้ต่างกันได้จริง (ตรวจพบแต่ยังไม่ได้ปั๊ม): dry run · insert ล้ม ·
    // ยังไม่ได้รัน 009 — ต้องเห็นทั้งคู่ ไม่งั้นแยกไม่ออกว่าคำเตือนหายเพราะไม่มีการกลับทิศ
    // หรือเพราะปั๊มป้ายไม่ลง
    console.log(
      `กลับทิศ ${flipsDetected === 0
        ? 'ไม่มีใบเก่าโดนกลับทิศรอบนี้'
        : `พบใบเก่าทิศตรงข้ามที่ยังเปิดอยู่ ${flipsDetected} ใบ · ปั๊มป้ายแล้ว ${DRY_RUN ? '0 (dry run ไม่ได้เขียน)' : flipsMarked} ใบ${flipColumnReady ? '' : ' · ยังไม่ได้รัน migration 009 — คำเตือนอยู่ในแจ้งเตือนแล้ว แต่แถบเตือนบนเว็บยังไม่ขึ้น'}`}`
    );
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
    for (const e of flipNotes) console.log(`  [กลับทิศ] ${e}`);
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
  for (const e of flipNotes) ghaWarn(`กลับทิศ: ${e}`);

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
