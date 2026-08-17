#!/usr/bin/env node
/**
 * speed-scorecard.client.build.mjs — ย่อไฟล์ข้อมูลก้อนใหญ่ให้เหลือเฉพาะช่องที่ "ตัวอ่าน" ใช้จริง
 *
 * ═══ สั่งยังไง ═════════════════════════════════════════════════════════════
 *   node src/lib/speed-scorecard.client.build.mjs
 *       อ่าน speed-scorecard.data.json → เขียนทับ speed-scorecard.client.json
 *       ต้องสั่งทุกครั้งที่ scripts/build-speed-scorecard.mjs สร้างไฟล์ใหญ่ใหม่
 *
 *   node src/lib/speed-scorecard.client.build.mjs --check
 *       ไม่เขียนอะไรเลย ตรวจสองอย่างแล้วคืน exit code (0 = ผ่าน · 1 = ไม่ผ่าน)
 *         1. ไฟล์ย่อยังตรงกับไฟล์ใหญ่ไหม (กันลืมสร้างใหม่หลังไฟล์ใหญ่เปลี่ยน)
 *         2. speedScore() อ่านไฟล์ย่อ ให้ผลเท่ากับอ่านไฟล์ใหญ่ทุกเคสไหม
 *       สั่งอันนี้ก่อน commit และบน CI — มันคือสิ่งเดียวที่กันไฟล์สองก้อนหลุดจากกัน
 *
 *   node src/lib/speed-scorecard.client.build.mjs --check --reader <path.ts>
 *       เหมือน --check แต่ฝั่ง "ไฟล์ใหญ่" ใช้ตัวอ่านจากไฟล์ที่ระบุแทน
 *       ใช้ตอนพิสูจน์ว่าการแก้ speed-scorecard.ts ไม่ได้เปลี่ยนพฤติกรรม
 *       (ชี้ไปที่สำเนาของเวอร์ชันก่อนแก้ → เทียบ ก่อน/หลัง ได้ตรง ๆ)
 *
 * ═══ ทำไมต้องมีไฟล์นี้ ═════════════════════════════════════════════════════
 * หน้า /signals เป็น client component และมันดึง src/lib/speed-scorecard.ts เข้าไป
 * ตัวอ่านตัวนั้น import ไฟล์ข้อมูลแบบคงที่ webpack จึงยัดไฟล์ข้อมูล "ทั้งก้อน"
 * ลง chunk ของหน้าเว็บ วัดจาก next build จริงสองรอบ (โค้ดชุดเดียวกัน ต่างแค่ไฟล์ที่ import):
 *   ก้อนใหญ่  chunk 119,359 ไบต์ (gzip 23,900) · JSON.parse ก้อนเดียว 96,965 ไบต์ = 81% ของ chunk
 *   ก้อนย่อ   chunk  45,990 ไบต์ (gzip 10,427) · JSON.parse ก้อนเดียว 25,762 ไบต์
 * ที่ต่างกันขนาดนั้นเพราะตัวอ่านแตะข้อมูลไม่ถึงหนึ่งในห้า
 * (winRate · profitFactor · exitShare · bars · firstBar · gated* รายคู่ ฯลฯ ไม่มีใครอ่าน)
 *
 * ทางแก้ที่เลือก: ตัดช่องที่ไม่มีใครอ่านออก แล้วให้ตัวอ่าน import ไฟล์ย่อแทน
 * ทางที่ไม่เลือกและเหตุผล:
 *   - ย้ายการคิดคะแนนไปฝั่ง server แล้วส่งมากับข้อมูลสัญญาณ → ต้องแก้ทั้ง API และหน้าเว็บ
 *     ซึ่งเป็นไฟล์ของคนอื่นที่กำลังแก้อยู่ และ /signals เรียก speedScore() แบบ sync ใน useMemo
 *   - โหลดไฟล์ใหญ่แบบ dynamic import เฉพาะฝั่ง server → scripts/scan-universe.mjs
 *     เติม import attribute ให้ dynamic import ของ JSON ไม่ได้ (มีคอมเมนต์บอกไว้ในไฟล์นั้นเอง)
 *     ตัวสแกนจริงของเจ้าของจะพังทันที
 *   - บีบแถวรายคู่เป็นอาเรย์ {"BTCUSDT|CRYPTO|1H":[842,0.11,-0.02]} แทนอ็อบเจกต์มีชื่อช่อง
 *     วัดแล้วเล็กลง 9,690 ไบต์ก่อน gzip แต่หลัง gzip เหลือต่างกันแค่ 335 ไบต์
 *     (4,382 → 4,047) ซึ่งคือสิ่งที่ผู้ใช้โหลดจริง — ไม่คุ้มกับการเสียคุณสมบัติ
 *     "ซับเซ็ตเชิงโครงสร้าง" ที่ทำให้ --check พิสูจน์ความเท่ากันได้ด้วยตัวอ่านตัวจริง
 *
 * ═══ กติกาที่ทำให้สองไฟล์ไม่หลุดจากกัน ════════════════════════════════════
 * ไฟล์ย่อเป็น "ซับเซ็ตเชิงโครงสร้าง" ของไฟล์ใหญ่ — เส้นทางคีย์เหมือนกันเป๊ะ ต่างแค่
 * มีช่องน้อยกว่า เจตนาคือให้ตัวอ่านตัวเดียวกันรันกับไฟล์ไหนก็ได้ผลเท่ากัน
 * --check จึงพิสูจน์ได้จริงด้วยการรันตัวอ่านสองรอบแล้วเทียบผลทีละเคส
 * วันไหนมีคนแก้ตัวอ่านให้ไปอ่านช่องที่ถูกตัดออก --check จะแดงทันที ไม่ใช่เงียบแล้วได้ undefined
 *
 * ไฟล์นี้อยู่ใน src/lib/ ไม่ใช่ scripts/ เพราะงานนี้ถูกจำกัดขอบเขตให้แก้ได้แค่ใต้ src/lib
 * ถ้าวันหลังมีคนย้ายไป scripts/ ให้แก้ทางเดินสองตัวข้างล่าง (DATA_FILE / CLIENT_FILE) ด้วย
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(HERE, 'speed-scorecard.data.json');
const CLIENT_FILE = path.join(HERE, 'speed-scorecard.client.json');
const READER_FILE = path.join(HERE, 'speed-scorecard.ts');

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const readerFlag = args.indexOf('--reader');
/** ตัวอ่านฝั่ง "ไฟล์ใหญ่" — ปกติคือตัวเดียวกับฝั่งไฟล์ย่อ จะได้พิสูจน์เรื่องข้อมูลล้วน ๆ */
const REFERENCE_READER = readerFlag >= 0 ? path.resolve(args[readerFlag + 1] ?? '') : READER_FILE;

function die(msg) {
  console.error(`\n[ล้มเหลว] ${msg}\n`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. การย่อ — ตรงนี้คือ "สัญญา" ว่าตัวอ่านได้อ่านอะไรบ้าง
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ช่องที่เก็บไว้ ต้องตรงกับที่ src/lib/speed-scorecard.ts อ่านจริง ๆ ทุกช่อง
 * เพิ่มช่องใหม่ตรงนี้เมื่อตัวอ่านเริ่มอ่านช่องใหม่เท่านั้น — ห้ามเก็บเผื่อ
 * เพราะทุกช่องที่เก็บ ผู้ใช้ต้องโหลดผ่านเน็ตจริงทุกครั้งที่เปิดหน้า /signals
 */
const pickKeys = (src, keys) => {
  if (!src || typeof src !== 'object') return src;
  const out = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
};

const mapValues = (obj, fn) => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k, fn(v)]));

/**
 * แถวรวมกอง — เก็บเส้นโค้ง K ไว้ครบทั้ง 4 ระดับ (1/2/3/6) ทั้งที่ตัวอ่านใช้ไม่ครบ
 * เพราะมีแค่ 24 แถว (ตลาด×timeframe ทั้งแบบดิบและแบบผ่านประตู) รวมไม่กี่กิโล
 * และเส้นโค้ง K ครึ่ง ๆ กลาง ๆ อ่านแล้วเข้าใจผิดง่ายกว่าที่ประหยัดได้
 * ตัดทิ้งเฉพาะช่องที่เป็นสรุปคนละเรื่อง: winRate · avgR · medianHoldBarsWin · pairs
 */
const slimPooled = (p) => pickKeys(p, ['trades', 'pTpWithin', 'pSlWithin', 'realizedRWithin']);

/**
 * แถวรายคู่ — ที่นี่คือต้นตอของขนาดจริง (114 แถว × ~1.4 KB) จึงตัดถึงกระดูก
 * เก็บแค่ K=2 เพราะตัวอ่านใช้แค่ pTpWithin['2'] กับ realizedRWithin['2']
 * (K=2 คือตัวที่สอบผ่าน out-of-sample — ดูเหตุผลในหัว speed-scorecard.ts)
 * symbol/market/timeframe เก็บไว้เพราะเป็นกุญแจค้นหา
 * trades/reliable ใช้ตัดสินว่าคู่นี้ไม้พอเชื่อไหม · medianHoldBarsWin คือตัวที่หน้า /signals
 * เอาไปเรียง "จบเร็วที่สุด" (มันคือตัวเดียวที่วัด "ใช้เวลานานแค่ไหน" ตรง ๆ)
 * ตัดทิ้ง: name · measuredAt · bars · firstBar/lastBar · winRate · avgR · profitFactor ·
 * pSlWithin · exitShare · gated* รายคู่ · K ระดับอื่น — ไม่มีบรรทัดไหนในตัวอ่านแตะเลย
 */
const slimPair = (p) => ({
  symbol: p.symbol,
  market: p.market,
  timeframe: p.timeframe,
  trades: p.trades,
  reliable: p.reliable,
  medianHoldBarsWin: p.medianHoldBarsWin,
  pTpWithin: pickKeys(p.pTpWithin, ['2']),
  realizedRWithin: pickKeys(p.realizedRWithin, ['2']),
});

function projectClient(full, sourceSha) {
  return {
    // ── ข้อมูลกำกับ: ตัวอ่านไม่แตะเลย มีไว้ให้คนที่เปิดไฟล์นี้รู้ว่ามันมาจากไหน ──
    _generatedFrom: 'src/lib/speed-scorecard.data.json',
    _generatedBy: 'node src/lib/speed-scorecard.client.build.mjs',
    _note: 'ไฟล์นี้ถูกสร้างอัตโนมัติ ห้ามแก้ด้วยมือ · แก้ที่ไฟล์ต้นทางแล้วสั่งคำสั่งข้างบนใหม่',
    _sourceSha256: sourceSha,

    schemaVersion: full.schemaVersion,
    measuredAt: full.measuredAt,
    rebuildCommand: full.rebuildCommand,
    method: pickKeys(full.method, ['maxHoldBars', 'minReliableTrades', 'barMinutesByTimeframe', 'caveats']),
    readerPolicy: full.readerPolicy,
    scoreReference: full.scoreReference,
    validationSummary: full.validationSummary,
    pooled: {
      byMarketTimeframe: mapValues(full.pooled.byMarketTimeframe, slimPooled),
      byTimeframe: mapValues(full.pooled.byTimeframe, slimPooled),
      gatedByMarketTimeframe: mapValues(full.pooled.gatedByMarketTimeframe, slimPooled),
      gatedByTimeframe: mapValues(full.pooled.gatedByTimeframe, slimPooled),
    },
    pairs: full.pairs.map(slimPair),
  };
}

/** เขียนแบบเดิมทุกครั้ง (indent 1 เท่าไฟล์ใหญ่) เพื่อให้ --check เทียบข้อความตรง ๆ ได้ */
const serialize = (obj) => `${JSON.stringify(obj, null, 1)}\n`;

// ═══════════════════════════════════════════════════════════════════════════
// 2. ตัวรันเทียบผล — โหลด speed-scorecard.ts จริง ไม่ใช่เขียนตัวอ่านจำลอง
// ═══════════════════════════════════════════════════════════════════════════

const require_ = createRequire(import.meta.url);

function loadTypescript() {
  try {
    return require_('typescript');
  } catch {
    return die('ไม่พบแพ็กเกจ typescript ใน node_modules — สั่ง `npm install` ก่อน');
  }
}

/**
 * ลอกชนิดออกจากตัวอ่าน แล้วชี้ import ของไฟล์ข้อมูลไปที่ไฟล์ที่เราเลือกให้
 * ตัวอ่านมี import อยู่สองอัน: '@/types' (type ล้วน ถูกลบตอน transpile)
 * กับไฟล์ .json หนึ่งไฟล์ — เราเปลี่ยนตัวหลังเป็นไฟล์ที่ต้องการทดสอบ
 */
function transpileReader(ts, readerPath, dataBaseName) {
  const src = readFileSync(readerPath, 'utf8');
  const js = ts.transpileModule(src, {
    fileName: path.basename(readerPath),
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true },
  }).outputText;

  let jsonImports = 0;
  const out = js.replace(/(from\s+)(['"])(\.[^'"]*\.json)\2/g, (_m, kw, q) => {
    jsonImports++;
    return `${kw}${q}./${dataBaseName}${q} with { type: 'json' }`;
  });
  if (jsonImports !== 1) {
    die(
      `${path.basename(readerPath)} import ไฟล์ .json ${jsonImports} ไฟล์ (คาดหวัง 1) — ` +
        'ตัวเทียบผลนี้ตั้งอยู่บนสมมติฐานว่าตัวอ่านมีไฟล์ข้อมูลก้อนเดียว แก้ไฟล์นี้ให้ตรงกับความจริงก่อน'
    );
  }
  return out;
}

async function loadReader(ts, tmpDir, tag, readerPath, dataAbsPath) {
  const dataBase = `${tag}.json`;
  writeFileSync(path.join(tmpDir, dataBase), readFileSync(dataAbsPath));
  writeFileSync(path.join(tmpDir, `${tag}.mjs`), transpileReader(ts, readerPath, dataBase), 'utf8');
  return import(pathToFileURL(path.join(tmpDir, `${tag}.mjs`)).href);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. เคสทดสอบ — ทุกคู่ที่วัดไว้ + ทุกเส้นทางถอยของ speedScore()
// ═══════════════════════════════════════════════════════════════════════════

/**
 * เคสถอยเขียนมือ ครอบทุกกิ่งใน speedScore() และ gatedSpeedStats()
 * รวมถึง "ความไม่สมมาตรของการ normalize" ที่มีอยู่เดิม: การหาแถวรายคู่ trim+uppercase
 * ให้ แต่การหาแถวรวมกองของคะแนนใช้ input.market ดิบ ๆ ส่วน gated อัพเคสให้
 * → ตลาดตัวพิมพ์เล็กจะได้ basis 'timeframe' แต่ gated.basis 'market'
 * เรื่องนี้เป็นพฤติกรรมเดิม งานนี้คืองานย่อไฟล์ ไม่ใช่งานแก้พฤติกรรม จึงต้องล็อกไว้ให้เหมือนเดิมเป๊ะ
 */
const FALLBACK_CASES = [
  ['1H · คู่ที่วัดไว้ ไม้ถึงเกณฑ์ → basis pair', { symbol: 'BTCUSDT', market: 'CRYPTO', timeframe: '1H' }],
  ['1D · นโยบายห้ามใช้รายคู่ → ถอยไป market', { symbol: 'AAPL', market: 'US_STOCK', timeframe: '1D' }],
  ['1D · ไม้ไม่ถึงเกณฑ์ (GULF 17 ไม้) → เตือนเรื่องไม้น้อยก่อนเรื่องนโยบาย', { symbol: 'GULF', market: 'TH_STOCK', timeframe: '1D' }],
  ['1H · ไม่เคยวัดคู่นี้ แต่ตลาดมีข้อมูล → market + เตือน "ไม่เคยวัด"', { symbol: 'ไม่มีจริง', market: 'CRYPTO', timeframe: '1H' }],
  ['1D · ไม่เคยวัดคู่นี้ → เตือนเรื่องนโยบายแทน (else-if มาก่อน)', { symbol: 'ไม่มีจริง', market: 'CRYPTO', timeframe: '1D' }],
  ['1H · ตลาดที่ไม่มีในไฟล์ → ถอยไป timeframe · gated ก็ timeframe', { symbol: 'ไม่มีจริง', market: 'ไม่มีตลาดนี้', timeframe: '1H' }],
  ['1D · ตลาดที่ไม่มีในไฟล์ → ถอยไป timeframe', { symbol: 'ไม่มีจริง', market: 'ไม่มีตลาดนี้', timeframe: '1D' }],
  ['timeframe ที่ไม่รู้จัก → basis none คะแนน 50 · barMinutes null · gated none', { symbol: 'BTCUSDT', market: 'CRYPTO', timeframe: '4H' }],
  ['timeframe ว่าง → เส้นทางเดียวกับไม่รู้จัก', { symbol: 'BTCUSDT', market: 'CRYPTO', timeframe: '' }],
  ['ทุกช่องว่าง → ต้องไม่โยน exception', { symbol: '', market: '', timeframe: '' }],
  ['ตัวพิมพ์เล็ก+เว้นวรรค: หาแถวรายคู่เจอ แต่แถวรวมกองไม่เจอ (พฤติกรรมเดิม)', { symbol: ' btcusdt ', market: ' crypto ', timeframe: ' 1h ' }],
  ['ตลาดพิมพ์เล็กล้วน: score ถอยไป timeframe · gated ยังได้ market', { symbol: 'BTCUSDT', market: 'crypto', timeframe: '1H' }],
  ['สัญลักษณ์พิมพ์เล็ก ตลาดถูกต้อง → basis pair เหมือนพิมพ์ใหญ่', { symbol: 'btcusdt', market: 'CRYPTO', timeframe: '1H' }],
  ['timeframe พิมพ์เล็ก 1d → เหมือน 1D', { symbol: 'AAPL', market: 'US_STOCK', timeframe: '1d' }],
  ['คู่มีจริงแต่จับคู่ตลาดผิด → หาแถวรายคู่ไม่เจอ', { symbol: 'BTCUSDT', market: 'US_STOCK', timeframe: '1H' }],
  ['GOLD/1H — ตลาดเล็กสุด ยังต้องได้ basis pair', { symbol: 'XAUUSD', market: 'GOLD', timeframe: '1H' }],
  ['FOREX/1D', { symbol: 'EURUSD', market: 'FOREX', timeframe: '1D' }],
];

/** ตลาด+timeframe ที่เอาไปเรียก gatedSpeedStats() ตรง ๆ (มันเป็น export สาธารณะด้วย) */
const GATED_CASES = [
  ['US_STOCK', '1H'], ['CRYPTO', '1H'], ['TH_STOCK', '1H'], ['FOREX', '1H'], ['GOLD', '1H'],
  ['US_STOCK', '1D'], ['CRYPTO', '1D'], ['TH_STOCK', '1D'], ['FOREX', '1D'], ['GOLD', '1D'],
  ['ไม่มีตลาดนี้', '1H'], ['ไม่มีตลาดนี้', '1D'], ['CRYPTO', '4H'], ['', ''],
  [' crypto ', ' 1h '], ['crypto', '1H'],
];

/** ช่องของแถวรายคู่ที่ไฟล์ย่อยังมี — เทียบได้เฉพาะช่องเหล่านี้ (ที่เหลือถูกตัดโดยตั้งใจ) */
const PAIR_FIELDS_KEPT = ['symbol', 'market', 'timeframe', 'trades', 'reliable', 'medianHoldBarsWin'];

/**
 * เก็บผลของ export สาธารณะทุกตัวสำหรับหนึ่งเคส
 * เก็บ explainSpeedScore ด้วย เพราะมันคือข้อความไทยที่ผู้ใช้เห็นจริง —
 * ถ้าคะแนนเท่าเดิมแต่ข้อความเพี้ยน ก็ยังถือว่าพัง
 */
function snapshot(mod, full) {
  const cases = [
    ...full.pairs.map((p) => [
      `คู่ที่วัดไว้ ${p.symbol}|${p.market}|${p.timeframe}`,
      { symbol: p.symbol, market: p.market, timeframe: p.timeframe },
    ]),
    ...FALLBACK_CASES,
  ];

  const out = {
    constants: {
      SCORECARD_MEASURED_AT: mod.SCORECARD_MEASURED_AT,
      SCORECARD_REBUILD_COMMAND: mod.SCORECARD_REBUILD_COMMAND,
      SCORECARD_MAX_HOLD_BARS: mod.SCORECARD_MAX_HOLD_BARS,
      SCORECARD_MIN_RELIABLE_TRADES: mod.SCORECARD_MIN_RELIABLE_TRADES,
      SCORECARD_CAVEATS: mod.SCORECARD_CAVEATS,
      // วันที่ตายตัว ไม่งั้นสองรอบที่รันห่างกันเสี้ยววินาทีจะได้ตัวเลขไม่เท่ากันเอง
      scorecardAgeDays: mod.scorecardAgeDays(new Date('2026-09-01T00:00:00.000Z')),
    },
    policy: {},
    gated: {},
    cases: {},
  };

  for (const tf of ['1H', '1D', '4H', '', ' 1h ']) {
    out.policy[`tf=${tf}`] = {
      mayRankByHistoricalProfit: mod.mayRankByHistoricalProfit(tf),
      validationNote: mod.validationNote(tf),
    };
  }
  for (const [market, tf] of GATED_CASES) {
    out.gated[`${market}|${tf}`] = mod.gatedSpeedStats(market, tf);
  }
  for (const [name, input] of cases) {
    const result = mod.speedScore(input);
    const pair = mod.scorecardPair(input);
    out.cases[name] = {
      speedScore: result,
      explain: mod.explainSpeedScore(result),
      // แถวรายคู่: เทียบเฉพาะช่องที่ไฟล์ย่อยังเก็บไว้ + ค่าที่ตัวอ่านใช้จริง
      pair: pair
        ? {
            ...pickKeys(pair, PAIR_FIELDS_KEPT),
            pTpWithin2: pair.pTpWithin?.['2'] ?? null,
            realizedRWithin2: pair.realizedRWithin?.['2'] ?? null,
          }
        : null,
    };
  }
  return out;
}

/** เทียบทีละกิ่ง เพื่อให้ตอนไม่ตรงบอกได้ว่าไม่ตรงตรงไหน ไม่ใช่แค่ "ไม่เท่ากัน" */
function diff(a, b, trail = '') {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      out.push(...diff(a[k], b[k], trail ? `${trail}.${k}` : k));
    }
    return out;
  }
  return [`${trail || '(ราก)'}\n      ไฟล์ใหญ่: ${sa}\n      ไฟล์ย่อ : ${sb}`];
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  if (!existsSync(DATA_FILE)) {
    die(`ไม่พบ ${DATA_FILE}\n  สร้างด้วย: node scripts/build-speed-scorecard.mjs`);
  }
  const rawSource = readFileSync(DATA_FILE);
  const sourceSha = createHash('sha256').update(rawSource).digest('hex');
  const full = JSON.parse(rawSource.toString('utf8'));
  const expectedText = serialize(projectClient(full, sourceSha));

  if (!CHECK_ONLY) {
    writeFileSync(CLIENT_FILE, expectedText, 'utf8');
    const before = rawSource.length;
    const after = Buffer.byteLength(expectedText, 'utf8');
    console.log('เขียน speed-scorecard.client.json แล้ว');
    console.log(`  ไฟล์ใหญ่ ${before.toLocaleString()} ไบต์ → ไฟล์ย่อ ${after.toLocaleString()} ไบต์ ` +
      `(เหลือ ${((after / before) * 100).toFixed(1)}%)`);
    console.log(`  คู่ที่ใส่ไป ${full.pairs.length} แถว · sha256 ต้นทาง ${sourceSha.slice(0, 12)}…`);
    console.log('\nอย่าลืมสั่ง --check ก่อน commit เพื่อพิสูจน์ว่า speedScore() ให้ผลเท่าเดิม');
    return;
  }

  // ── ตรวจข้อ 1: ไฟล์ย่อตรงกับไฟล์ใหญ่ไหม ────────────────────────────────
  if (!existsSync(CLIENT_FILE)) {
    die(`ไม่พบ ${CLIENT_FILE} — สั่ง \`node src/lib/speed-scorecard.client.build.mjs\` ก่อน`);
  }
  const actualText = readFileSync(CLIENT_FILE, 'utf8');
  if (actualText !== expectedText) {
    const actual = JSON.parse(actualText);
    const why = actual._sourceSha256 !== sourceSha
      ? `speed-scorecard.data.json เปลี่ยนไปแล้ว (sha256 ในไฟล์ย่อคือ ${String(actual._sourceSha256).slice(0, 12)}… แต่ของจริงคือ ${sourceSha.slice(0, 12)}…)`
      : 'เนื้อในไม่ตรงกัน (อาจมีคนแก้ไฟล์ย่อด้วยมือ)';
    die(`ไฟล์ย่อไม่ตรงกับไฟล์ใหญ่ — ${why}\n  แก้ด้วย: node src/lib/speed-scorecard.client.build.mjs`);
  }
  console.log('ผ่าน  ไฟล์ย่อตรงกับไฟล์ใหญ่ (เนื้อในเหมือนกันทุกไบต์เมื่อสร้างใหม่)');

  // ── ตรวจข้อ 2: ตัวอ่านให้ผลเท่ากันไหม เมื่ออ่านไฟล์ใหญ่ vs ไฟล์ย่อ ──────
  if (!existsSync(REFERENCE_READER)) die(`ไม่พบตัวอ่านอ้างอิงที่ ${REFERENCE_READER}`);
  const ts = loadTypescript();
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'speed-scorecard-parity-'));
  try {
    const [refMod, slimMod] = await Promise.all([
      loadReader(ts, tmpDir, 'ref', REFERENCE_READER, DATA_FILE),
      loadReader(ts, tmpDir, 'slim', READER_FILE, CLIENT_FILE),
    ]);
    const expected = snapshot(refMod, full);
    const got = snapshot(slimMod, full);

    const problems = diff(expected, got);
    const total = Object.keys(expected.cases).length + Object.keys(expected.gated).length;
    if (problems.length) {
      console.error(`\nไม่ผ่าน  ผลไม่ตรงกัน ${problems.length} จุด:`);
      for (const p of problems.slice(0, 25)) console.error(`  - ${p}`);
      if (problems.length > 25) console.error(`  … อีก ${problems.length - 25} จุด`);
      die(
        'ตัวอ่านอ่านช่องที่ไฟล์ย่อไม่มี หรือการย่อทำข้อมูลหาย\n' +
          '  ถ้าตัวอ่านต้องใช้ช่องใหม่จริง ให้เพิ่มช่องนั้นใน projectClient() ของไฟล์นี้ แล้วสร้างไฟล์ย่อใหม่'
      );
    }
    console.log(
      `ผ่าน  speedScore() อ่านไฟล์ย่อ ให้ผลเท่ากับอ่านไฟล์ใหญ่ทุกเคส ` +
        `(${Object.keys(expected.cases).length} เคส = ${full.pairs.length} คู่ที่วัดไว้ + ${FALLBACK_CASES.length} เคสถอย, ` +
        `gatedSpeedStats อีก ${Object.keys(expected.gated).length} เคส)`
    );
    if (REFERENCE_READER !== READER_FILE) {
      console.log(`      ฝั่งอ้างอิงใช้ตัวอ่านจาก ${REFERENCE_READER}`);
    }
    console.log(`      เทียบทั้งหมด ${total} เคส รวมค่าคงที่ที่ export และข้อความไทยจาก explainSpeedScore()`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((e) => die(e?.stack || String(e)));
