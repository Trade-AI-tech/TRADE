#!/usr/bin/env node
/**
 * veto-lab.mjs — วัดว่า "กฎวีโต้" ทำให้สัญญาณที่ผู้ใช้ได้รับจริงดีขึ้น หรือแค่ตัดไม้ทิ้งมั่ว ๆ
 *
 * ─────────────────────────── ทำไมวีโต้ต้องวัดคนละท่ากับกฎอื่น ───────────────────────────
 *
 * rule-lab.mjs วัด "กฎที่ยิงสัญญาณเอง" ได้ตรง ๆ เพราะแต่ละกฎผลิตไม้ของตัวเองออกมา
 * แล้วเอา avg R ของมันไปเทียบกับศูนย์ แต่วีโต้ไม่ยิงสัญญาณ มันตัดสัญญาณของคนอื่นทิ้ง
 * คำถามจึงเปลี่ยนรูปเป็น "เมื่อมีสัญญาณฐานอยู่แล้ว การตัดไม้ที่วีโต้ห้ามออกไป
 * ทำให้ R เฉลี่ยของที่เหลือดีขึ้นไหม"
 *
 * ── กับดักที่ไฟล์นี้มีไว้กัน ────────────────────────────────────────────────────
 *
 * การตัดไม้ออกไป "เฉย ๆ" ก็ทำให้ค่าเฉลี่ยขยับได้เองด้วยความบังเอิญ และยิ่งตัดเยอะ
 * ยิ่งขยับแรง เพราะกลุ่มที่เหลือเล็กลงจนความแปรปรวนของค่าเฉลี่ยพองขึ้น
 * ถ้าเอา "หลังกรอง" ไปเทียบ "ก่อนกรอง" ด้วย t-test ธรรมดา จะได้ผลบวกปลอมเสมอ
 * เพราะสองชุดไม่เป็นอิสระต่อกันเลย — ชุดหนึ่งเป็นสับเซตของอีกชุด สมมติฐานของ t-test
 * (สองกลุ่มสุ่มมาแยกกัน) พังตั้งแต่บรรทัดแรก
 *
 * การทดสอบที่ถูกต้องคือ permutation null ที่ "ตัดจำนวนเท่ากัน":
 *   1. delta จริง = meanR(ไม้ที่วีโต้ปล่อยผ่าน) − meanR(ไม้ทั้งหมด)
 *   2. k = จำนวนไม้ที่วีโต้ตัดทิ้งจริง
 *   3. ทำซ้ำ B รอบ: สุ่มตัดไม้ออก k ไม้แบบไม่ดูข้อมูลอะไรเลย แล้วคิด delta ของรอบนั้น
 *   4. p = สัดส่วนของรอบที่ delta สุ่ม >= delta จริง
 * ถ้า delta จริงจมอยู่กลางกองของ delta สุ่ม แปลว่าวีโต้ไม่ได้ "รู้" อะไรเลย
 * มันแค่ตัดไม้ทิ้ง ซึ่งใครตัดมั่ว ๆ ก็ได้ผลเท่ากัน
 *
 * การสุ่มทำสองแบบเสมอ:
 *   · stratified ตาม symbol — ตัดในแต่ละ symbol เท่าที่วีโต้ตัดจริงในตัวนั้น
 *     ตอบว่า "วีโต้เลือกจังหวะเก่งไหม" โดยหักความสามารถในการเลือก symbol ออกไปแล้ว
 *   · ไม่ stratified — สุ่มตัดจากกองรวม ตอบว่า "วีโต้เก่งไหม" รวมทั้งสองความสามารถ
 * ถ้า p ไม่ stratified เล็กแต่ p stratified ไม่เล็ก แปลว่าที่ดูดีมาจากการที่วีโต้ไป
 * ตัดหนักใน symbol ที่แย่อยู่แล้ว ไม่ใช่การเลือกจังหวะ — ซึ่งเป็น edge ที่เปราะกว่ามาก
 *
 * ── ตัวชี้วัดที่ห้ามรายงานเดี่ยว ─────────────────────────────────────────────────
 *
 * วีโต้ที่ตัดทิ้ง 95% แล้ว R ที่เหลือดีขึ้น ไม่มีประโยชน์ถ้าเหลือไม้ 3 ไม้ต่อปี
 * ทุกแถวจึงรายงาน "ตัดทิ้งกี่ %" และ "ไม้ต่อวัน" คู่กับ delta เสมอ
 *
 * ─────────────────────────────── สิ่งที่ไฟล์นี้ใช้ซ้ำจากของเดิม ───────────────────────────
 *
 * · engine-lab.mjs        → generateSignal ตัวจริง (สัญญาณฐาน)
 * · src/lib/universe.ts   → evaluateSignal / SIGNAL_GATE (ประตูจริงของระบบ)
 * · rule-lab.mjs          → เส้นแบ่ง train/val/test · prepareDataset · ctx ของกฎ ·
 *                           COST_BPS · PRNG · cluster bootstrap · simulateTrade (ใช้เทียบ)
 *   เข้าถึงผ่าน audit-rule-lab-probe.mjs ซึ่งอ่านซอร์ส rule-lab.mjs มาตัดบรรทัด main()
 *   แล้วเติม export — ตัวโค้ดที่ถูกใช้ยังเป็นตัวอักษรเดียวกับต้นฉบับเป๊ะ
 * · rules/vetoes-*.mjs    → กฎวีโต้ 4 ข้อ (import อย่างเดียว ไม่แก้)
 *
 * ─────────────────────────── สิ่งที่ต่างจาก rule-lab.mjs โดยตั้งใจ ───────────────────────
 *
 * SL/TP ใช้ค่าจากสัญญาณจริง (sig.stop_loss / sig.take_profit) ไม่ใช่ 1.5×ATR / RR2
 * เพราะเรากำลังวัด "สัญญาณที่ผู้ใช้ได้รับ" ไม่ใช่เรขาคณิตสมมติที่ใช้จัดอันดับกฎ
 * simulateTrade เดิมตรึงเรขาคณิตไว้ (คำนวณ stop/target จาก atrAtSignal ภายในตัวเอง)
 * จึงป้อน SL/TP อิสระเข้าไปไม่ได้ ไฟล์นี้จึงมี simulateTradeFromLevels() ที่ลอกลูปเดิม
 * มาทั้งดุ้นแล้วเปลี่ยนเฉพาะที่มาของ stop/target/risk — และ self-test ข้อ
 * `simulator-parity` พิสูจน์ทีละไม้ว่าเมื่อป้อนเรขาคณิตเดิมกลับเข้าไป ผลตรงกันทุกฟิลด์
 *
 * ──────────────────────────────────── วิธีใช้ ────────────────────────────────────
 *
 *   node scripts/research/veto-lab.mjs --self-test
 *   node scripts/research/veto-lab.mjs --timeframes=1D
 *   node scripts/research/veto-lab.mjs --timeframes=1D,1H --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadProbe } from './audit-rule-lab-probe.mjs';
import { loadSrcModules } from './load-src-modules.mjs';
import { loadLabEngine } from './engine-lab.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.join(SELF_DIR, 'rules');
const REPORTS_DIR = path.join(SELF_DIR, 'reports');
const OUT_FILE = path.join(REPORTS_DIR, 'veto-lab.json');

/** กฎวีโต้ที่จะวัด — ตรึงเป็นรายการ ไม่ scan โฟลเดอร์ เพราะ rules/ มีกฎชนิดอื่นปนอยู่ */
const VETO_SLUGS = [
  'vetoes-mean-reversion-vs-trend',
  'vetoes-overextension-news-candle',
  'vetoes-level-in-path',
  'vetoes-choch-flip',
];

/** ชื่อย่อสำหรับตาราง — ชื่อเต็มยาวเกินกว่าจะวางเรียงกันแล้วอ่านออก */
const SHORT = {
  'vetoes-mean-reversion-vs-trend': 'meanrev',
  'vetoes-overextension-news-candle': 'overext',
  'vetoes-level-in-path': 'levelpath',
  'vetoes-choch-flip': 'choch',
};

const DEFAULT_B = 10000;
const DEFAULT_SEED = 20260828;

// ═══════════════════════════════ ตัวช่วยพิมพ์ ═══════════════════════════════

const n4 = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const pctS = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

// ═══════════════════════════════ การโหลดของเดิม ═══════════════════════════════

/**
 * โหลดทุกอย่างที่ต้องใช้ซ้ำ แล้วคืนเป็นก้อนเดียว
 *
 * universe.ts ต้องโหลดให้ได้เสมอ — ถ้าโหลดไม่ผ่านให้ล้มทันที ห้าม fallback ไปเดาเกณฑ์เอง
 * เพราะเกณฑ์ที่เดาเองแปลว่าเรากำลังวัดสัญญาณคนละชุดกับที่ผู้ใช้เจอจริง
 */
async function loadDeps() {
  const L = await loadProbe();

  let gateMod;
  try {
    const mods = await loadSrcModules(['src/lib/universe.ts']);
    gateMod = mods.universe;
  } catch (err) {
    throw new Error(
      `โหลด src/lib/universe.ts ไม่สำเร็จ: ${err?.message ?? err}\n`
      + '  → หยุดที่นี่โดยตั้งใจ ประตูคุณภาพต้องเป็นตัวจริงเท่านั้น ห้ามเดาเกณฑ์เอง'
    );
  }
  for (const k of ['SIGNAL_GATE', 'gateForTimeframe', 'evaluateSignal']) {
    if (!gateMod[k]) throw new Error(`src/lib/universe.ts ไม่ได้ export ${k} — โครงไฟล์เปลี่ยนไปแล้ว`);
  }

  const engine = await loadLabEngine();

  const vetoes = [];
  for (const slug of VETO_SLUGS) {
    const file = path.join(RULES_DIR, `${slug}.mjs`);
    if (!fs.existsSync(file)) throw new Error(`ไม่พบกฎวีโต้ ${file}`);
    const mod = await import(pathToFileURL(file).href);
    if (!mod.meta || typeof mod.evaluate !== 'function') {
      throw new Error(`${slug}: ต้อง export ทั้ง meta และ evaluate`);
    }
    if (mod.meta.id !== slug) throw new Error(`${slug}: meta.id ไม่ตรงกับชื่อไฟล์`);
    vetoes.push({ slug, short: SHORT[slug] ?? slug, meta: mod.meta, evaluate: mod.evaluate });
  }

  return { L, gate: gateMod, engine, vetoes };
}

// ═══════════════════════════════ guard ชุด test ═══════════════════════════════

/**
 * guard ชั้นของไฟล์นี้ — throw ถ้ามีแท่งชุด test หลุดเข้ามา
 *
 * rule-lab.mjs มี guard ของตัวเองอยู่แล้วใน loadMeasurableDataset/prepareDataset
 * (ซึ่งเราเรียกใช้ ไม่ได้เขียนใหม่) แต่ guard ตัวนั้นไม่ได้ export ออกมา และ "การมี
 * guard ของตัวเองที่พังเสียงดัง" ถูกกว่าการเชื่อว่าชั้นล่างจะทำงานเสมอ — โดยเฉพาะ
 * เมื่อไฟล์นี้เอา bars ไปเดินซ้ำเองอีกรอบเพื่อผลิตสัญญาณฐาน
 */
function assertNoTestBarsHere(bars, timeframe, cutMs, where) {
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].ts >= cutMs) {
      throw new Error(
        `[guard/test-set] ${where}: แท่งที่ ${i} (${bars[i].timestamp}) อยู่ในชุด test ของ ${timeframe} `
        + `— วัดได้เฉพาะก่อน ${new Date(cutMs).toISOString()}`
      );
    }
  }
  return true;
}

// ═══════════════════════════════ การเดินไม้ ═══════════════════════════════

/**
 * เดินไม้หนึ่งไม้ด้วย SL/TP ที่ "สัญญาณกำหนดมา" แทนเรขาคณิตตายตัว
 *
 * ลูปข้างในลอกจาก simulateTrade ของ rule-lab.mjs ทั้งดุ้น — ลำดับการตรวจ SL ก่อน TP,
 * การนับ mfe/mae, การปิดที่ราคาปิดเมื่อชนเพดานถือ, การแยก timeout/dataEnd เหมือนกันหมด
 * สิ่งเดียวที่ต่างคือที่มาของ stop/target/risk:
 *
 *   rule-lab : risk = 1.5 × ATR ณ แท่งสัญญาณ · stop/target วางจาก "ราคาเข้าจริง"
 *   ที่นี่    : stop/target = ราคาที่สัญญาณส่งออกไปจริง ๆ (ค่าที่ผู้ใช้เห็นบนมือถือ)
 *              risk = |sig.entry_price − sig.stop_loss| = "ระยะ SL ที่วางแผนไว้"
 *
 * ทำไมตัวหารเป็น plannedRisk ไม่ใช่ |ราคาเปิดแท่งถัดไป − SL|: plannedRisk คือระยะที่
 * ผู้เทรดใช้คิดขนาดไม้ตอนกดสั่ง ส่วน realizedRisk ถูก gap กินจนตัวหารเกือบศูนย์ได้
 * (ปัญหาเดียวกับที่ lab.mjs บันทึกไว้ใน report/metric-fix.md แล้วเลือก planned เป็นค่าตั้งต้น)
 * realizedRisk ยังถูกบันทึกไว้ทุกไม้เพื่อให้ย้อนดูได้ว่ามันต่างกันแค่ไหน
 *
 * @param {object} levels { stop, target, riskPlanned } — ราคาสัมบูรณ์ + ระยะที่วางแผนไว้
 * @returns {object|null} null = เปิดไม้ไม่ได้
 */
function simulateTradeFromLevels(L, bars, signalIdx, side, levels, symbol, market, maxHold) {
  const entryIdx = signalIdx + 1;
  if (entryIdx >= bars.length) return null;

  const { stop, target, riskPlanned } = levels;
  if (!Number.isFinite(stop) || !Number.isFinite(target)) return null;
  if (!Number.isFinite(riskPlanned) || !(riskPlanned > 0)) return null;

  const entry = bars[entryIdx].open;
  if (!Number.isFinite(entry)) return null;

  const isLong = side === 'long';
  const risk = riskPlanned;

  const lastIdx = Math.min(entryIdx + maxHold - 1, bars.length - 1);
  let exitPrice = null;
  let exitReason = null;
  let exitIdx = lastIdx;
  let mfe = -Infinity;
  let mae = Infinity;

  for (let i = entryIdx; i <= lastIdx; i++) {
    const b = bars[i];
    const favour = isLong ? (b.high - entry) / risk : (entry - b.low) / risk;
    const adverse = isLong ? (b.low - entry) / risk : (entry - b.high) / risk;
    if (favour > mfe) mfe = favour;
    if (adverse < mae) mae = adverse;

    const hitStop = isLong ? b.low <= stop : b.high >= stop;
    const hitTarget = isLong ? b.high >= target : b.low <= target;

    if (hitStop) { exitPrice = stop; exitReason = 'sl'; exitIdx = i; break; }
    if (hitTarget) { exitPrice = target; exitReason = 'tp'; exitIdx = i; break; }
  }

  if (exitPrice === null) {
    exitPrice = bars[lastIdx].close;
    exitReason = lastIdx === entryIdx + maxHold - 1 ? 'timeout' : 'dataEnd';
    exitIdx = lastIdx;
  }

  const rawR = isLong ? (exitPrice - entry) / risk : (entry - exitPrice) / risk;

  // ต้นทุนคิดด้วย costRFor ตัวเดิมของ rule-lab เป๊ะ ๆ แต่ป้อน stop สังเคราะห์ที่ห่างจาก
  // ราคาเข้าเท่ากับ riskPlanned — เพราะ costR ต้องหารด้วย "ตัวหารเดียวกับ R" ไม่งั้น
  // ต้นทุนกับกำไรจะอยู่คนละหน่วย ในกรณีเรขาคณิตของ rule-lab ค่านี้เท่ากับ stop จริงพอดี
  const stopForCost = isLong ? entry - risk : entry + risk;
  const costR = L.costRFor(entry, stopForCost, symbol, market);
  if (costR === null) return null;

  // ราคาเปิดกระโดดข้าม SL/TP ไปแล้วตั้งแต่แท่งแรก — เก็บธงไว้นับ ไม่ได้เปลี่ยนตรรกะ
  // การ "ข้ามไม้พวกนี้" คือการเพิ่มกติกาใหม่ที่ rule-lab ไม่มี ซึ่งจะทำให้เทียบกันไม่ได้
  const gapPastStop = isLong ? entry <= stop : entry >= stop;
  const gapPastTarget = isLong ? entry >= target : entry <= target;

  return {
    symbol,
    market,
    side,
    signalIdx,
    entryIdx,
    exitIdx,
    entryTime: bars[entryIdx].timestamp,
    exitTime: bars[exitIdx].timestamp,
    entry,
    stop,
    target,
    risk,
    riskRealized: Math.abs(entry - stop),
    exitPrice,
    exitReason,
    barsHeld: exitIdx - entryIdx + 1,
    rawR,
    costR,
    rNet: rawR - costR,
    mfeR: Number.isFinite(mfe) ? mfe : null,
    maeR: Number.isFinite(mae) ? mae : null,
    gapPastStop,
    gapPastTarget,
  };
}

// ═══════════════════════════ การผลิตสัญญาณฐาน ═══════════════════════════

/** ฟิลด์ที่เป็น "การตัดสินใจ" ของสัญญาณ — id/created_at/expires_at ไม่นับ เพราะสุ่มทุกครั้ง */
function decisionOf(sig) {
  if (!sig) return null;
  return {
    action: sig.action,
    strength: sig.strength,
    confidence: sig.confidence,
    entry_price: sig.entry_price,
    stop_loss: sig.stop_loss,
    take_profit: sig.take_profit,
  };
}

function decisionEqual(a, b) {
  if (a === null || b === null) return a === b;
  return a.action === b.action && a.strength === b.strength && a.confidence === b.confidence
    && Object.is(a.entry_price, b.entry_price) && Object.is(a.stop_loss, b.stop_loss)
    && Object.is(a.take_profit, b.take_profit);
}

/**
 * เดินทุกแท่งของทุก symbol ในกรอบเวลาหนึ่ง → ไม้ที่ผ่านประตูจริง พร้อมผลวีโต้ทุกข้อ
 *
 * ลำดับที่ต้องไม่สลับ:
 *   1. generateSignal ด้วย prefix ถึงแท่ง t เท่านั้น (prefix โตทีละแท่ง ไม่ slice ใหม่)
 *   2. ประตูจริง evaluateSignal() — ตัดด้วยเกณฑ์เดียวกับที่ผู้ใช้เจอ
 *   3. เดินไม้ด้วย SL/TP ของสัญญาณ
 *   4. ถามวีโต้ทั้ง 4 ข้อที่แท่งเดียวกัน เก็บเป็น bitmask
 * ถามวีโต้ทีหลังสุดเพราะสัญญาณที่ตกประตูไปแล้วไม่มีไม้ให้ตัด การถามก็เปลืองเปล่า
 */
function buildBaseTrades(tf, deps, opts) {
  const { L, gate, engine, vetoes } = deps;
  const maxHold = L.MAX_HOLD_BARS[tf];
  if (!maxHold) throw new Error(`ไม่ได้กำหนดเพดานถือของกรอบเวลา ${tf}`);

  const bounds = opts.bounds;
  const cutMs = L.measurableCutMs(bounds, tf);
  const universe = opts.symbols
    ? L.UNIVERSE.filter((u) => opts.symbols.includes(u.symbol))
    : L.UNIVERSE;
  if (!universe.length) throw new Error(`ตัวกรอง --symbols ไม่ตรงกับ symbol ไหนเลย`);

  const trades = [];
  const counts = {
    decisions: 0,
    engineNull: 0,
    hold: 0,
    directional: 0,
    gatePassed: 0,
    gateRejected: 0,
    rejectByCode: {},
    tradeOpenFailed: 0,
    gapPastStop: 0,
    gapPastTarget: 0,
  };
  const vetoHits = vetoes.map(() => 0);
  let spanFirst = Infinity;
  let spanLast = -Infinity;

  for (const u of universe) {
    const ds = L.prepareDataset(u, tf, bounds, opts.cache);
    assertNoTestBarsHere(ds.bars, tf, cutMs, `veto-lab ${u.symbol}/${tf}`);

    const { bars, ind } = ds;
    if (bars.length < 3) continue;
    spanFirst = Math.min(spanFirst, bars[0].ts);
    spanLast = Math.max(spanLast, bars[bars.length - 1].ts);

    const last = bars.length - 2; // ต้องมีแท่งถัดไปให้เข้าไม้เสมอ
    const prefix = [];
    for (let t = 0; t <= L.WARMUP_BARS - 1 && t < bars.length; t++) prefix.push(bars[t]);

    for (let t = L.WARMUP_BARS; t <= last; t++) {
      while (prefix.length < t + 1) prefix.push(bars[prefix.length]);

      const sig = engine.generateSignal({
        symbol: u.symbol, name: u.symbol, market: u.market, candles: prefix, timeframe: tf,
      });
      counts.decisions++;
      if (!sig) { counts.engineNull++; continue; }
      if (sig.action !== 'BUY' && sig.action !== 'SELL') { counts.hold++; continue; }
      counts.directional++;

      const verdict = gate.evaluateSignal(sig);
      if (!verdict.passed) {
        counts.gateRejected++;
        for (const r of verdict.rejections) {
          counts.rejectByCode[r.code] = (counts.rejectByCode[r.code] ?? 0) + 1;
        }
        continue;
      }
      counts.gatePassed++;

      const side = sig.action === 'BUY' ? 'long' : 'short';
      const trade = simulateTradeFromLevels(L, bars, t, side, {
        stop: sig.stop_loss,
        target: sig.take_profit,
        riskPlanned: Math.abs(sig.entry_price - sig.stop_loss),
      }, u.symbol, u.market, maxHold);
      if (!trade) { counts.tradeOpenFailed++; continue; }
      if (trade.exitIdx >= bars.length) {
        throw new Error(`[guard/test-set] ทางออกของไม้หลุดออกนอกชุดที่วัดได้ (${u.symbol}/${tf})`);
      }
      if (trade.gapPastStop) counts.gapPastStop++;
      if (trade.gapPastTarget) counts.gapPastTarget++;

      // ── ถามวีโต้ที่แท่งสัญญาณเดียวกัน ด้วย ctx แบบเดียวกับที่ rule-lab สร้าง ──
      const htf = ds.htfFor ? ds.htfFor(t) : null;
      let mask = 0;
      for (let vi = 0; vi < vetoes.length; vi++) {
        const v = vetoes[vi];
        if (v.meta.needsHtf && !htf) continue; // ไม่มีบริบท HTF = ตอบไม่ได้ = ไม่ตัด
        const out = L.assertVerdictShape(
          v.evaluate({ bars, t, ind, htf }), `${v.slug} ${u.symbol}/${tf} @${t}`);
        const blocked = side === 'long'
          ? (out.veto === 'bull' || out.veto === 'both')
          : (out.veto === 'bear' || out.veto === 'both');
        if (blocked) { mask |= (1 << vi); vetoHits[vi]++; }
      }

      trade.vetoMask = mask;
      trade.signalTime = bars[t].timestamp;
      trade.entryPriceSignal = sig.entry_price;
      trade.confidence = sig.confidence;
      trade.strength = sig.strength;
      trade.riskReward = verdict.riskReward;
      trade.stopDistancePct = verdict.stopDistancePct;
      trades.push(trade);
    }
  }

  const spanDays = Number.isFinite(spanFirst) && spanLast > spanFirst
    ? (spanLast - spanFirst) / L.DAY_MS
    : null;

  return {
    timeframe: tf,
    trades,
    counts,
    vetoHits,
    universe: universe.map((u) => `${u.market}/${u.symbol}`),
    measuredBefore: new Date(cutMs).toISOString(),
    spanFirst: Number.isFinite(spanFirst) ? new Date(spanFirst).toISOString() : null,
    spanLast: spanLast > 0 ? new Date(spanLast).toISOString() : null,
    spanDays,
  };
}

// ═══════════════════════════ permutation null ═══════════════════════════

/**
 * สุ่มเลือก k ดัชนีจาก pool โดยไม่ซ้ำ ด้วย partial Fisher-Yates
 * pool ถูกสลับในที่ (ไม่ต้อง copy) เพราะรอบถัดไปก็สุ่มใหม่อยู่ดี — ประหยัดการจองหน่วยความจำ
 * B×k ครั้ง ซึ่งเป็นงานส่วนใหญ่ของไฟล์นี้
 */
function sumOfRandomSubset(pool, k, rNet, rnd) {
  const n = pool.length;
  let s = 0;
  for (let i = 0; i < k; i++) {
    const j = i + ((rnd() * (n - i)) | 0);
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    s += rNet[pool[i]];
  }
  return s;
}

/**
 * permutation null ที่ตัดจำนวนเท่ากับที่วีโต้ตัดจริง
 *
 * @param rNet      Float64Array ของ R สุทธิทุกไม้ (ทั้งกอง ไม่ใช่เฉพาะที่เหลือ)
 * @param groups    Map<symbol, number[]> ดัชนีไม้แยกตาม symbol (ใช้ตอน stratified)
 * @param cutIdx    ดัชนีไม้ที่วีโต้ตัดจริง
 * @param stratified true = ตัดในแต่ละ symbol เท่าที่วีโต้ตัดจริงในตัวนั้น
 *
 * หมายเหตุเรื่อง p: รายงานทั้งสัดส่วนดิบ (ตามนิยามในโจทย์) และแบบบวกหนึ่ง
 * (count+1)/(B+1) ซึ่งเป็นค่าที่ควรใช้อ้างอิงจริง เพราะสัดส่วนดิบให้ p = 0 ได้
 * ซึ่งเป็นไปไม่ได้ในเชิงความน่าจะเป็น — มันแปลว่า "เล็กกว่า 1/B" เท่านั้น
 */
function permutationTest({ rNet, groups, cutIdx, B, seed, stratified }) {
  const n = rNet.length;
  const k = cutIdx.length;
  const keep = n - k;
  if (n === 0) return null;

  let sumAll = 0;
  for (let i = 0; i < n; i++) sumAll += rNet[i];
  const meanAll = sumAll / n;

  if (keep <= 0) {
    return { n, k, keep, deltaObs: null, degenerate: 'ตัดหมดทั้งกอง — ไม่เหลือไม้ให้วัด' };
  }

  let sumCutObs = 0;
  for (const i of cutIdx) sumCutObs += rNet[i];
  const deltaObs = (sumAll - sumCutObs) / keep - meanAll;

  // k = 0 → ไม่มีอะไรถูกตัด delta เป็นศูนย์เป๊ะทุกรอบ ตอบตรง ๆ ไม่ต้องหมุน B รอบ
  if (k === 0) {
    return {
      n, k, keep, deltaObs: 0, stratified,
      pGreaterRaw: 1, pOneSided: 1, pTwoSided: 1,
      nullMean: 0, nullSd: 0, zVsNull: null, percentileOfObs: null, B: 0,
      note: 'วีโต้ไม่ได้ตัดไม้เลย — ไม่มีอะไรให้ทดสอบ',
    };
  }

  const rnd = L_MULBERRY(seed);

  // เตรียม pool ที่จะสลับซ้ำ ๆ
  let pools;
  let ks;
  if (stratified) {
    pools = [];
    ks = [];
    const cutPerGroup = new Map();
    for (const i of cutIdx) {
      const g = groups.keyOf[i];
      cutPerGroup.set(g, (cutPerGroup.get(g) ?? 0) + 1);
    }
    for (const [g, idxs] of groups.byKey) {
      const kg = cutPerGroup.get(g) ?? 0;
      if (kg === 0) continue;
      pools.push(idxs.slice());
      ks.push(kg);
    }
  } else {
    const all = new Array(n);
    for (let i = 0; i < n; i++) all[i] = i;
    pools = [all];
    ks = [k];
  }

  const deltas = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let sumCut = 0;
    for (let g = 0; g < pools.length; g++) sumCut += sumOfRandomSubset(pools[g], ks[g], rNet, rnd);
    deltas[b] = (sumAll - sumCut) / keep - meanAll;
  }

  // เผื่อความคลาดเคลื่อนจากลำดับการบวก — ไม่งั้น "เท่ากันพอดี" อาจนับพลาดข้างเดียว
  const eps = 1e-12 * (Math.abs(deltaObs) + 1e-9);
  let ge = 0;
  let le = 0;
  let sum = 0;
  let sumSq = 0;
  for (let b = 0; b < B; b++) {
    const d = deltas[b];
    if (d >= deltaObs - eps) ge++;
    if (d <= deltaObs + eps) le++;
    sum += d;
    sumSq += d * d;
  }
  const nullMean = sum / B;
  const nullVar = Math.max(0, sumSq / B - nullMean * nullMean);
  const nullSd = Math.sqrt(nullVar);

  const pGe = (ge + 1) / (B + 1);
  const pLe = (le + 1) / (B + 1);

  return {
    n, k, keep, stratified, B,
    deltaObs,
    pGreaterRaw: ge / B,
    pOneSided: pGe,
    pTwoSided: Math.min(1, 2 * Math.min(pGe, pLe)),
    nullMean,
    nullSd,
    zVsNull: nullSd > 0 ? (deltaObs - nullMean) / nullSd : null,
    percentileOfObs: 1 - ge / B,
  };
}

/** ตัวแปรโมดูล — ตั้งค่าครั้งเดียวหลัง loadProbe() เพื่อไม่ต้องส่ง L ลงไปทุกชั้น */
let L_MULBERRY = null;

// ═══════════════════════════ การวัดหนึ่งชุดค่าผสม ═══════════════════════════

function summarise(trades) {
  const n = trades.length;
  if (!n) {
    return { trades: 0, meanR: null, winRate: null, totalR: 0, avgRawR: null, avgCostR: null, byExit: {} };
  }
  let sumR = 0;
  let sumRaw = 0;
  let sumCost = 0;
  let wins = 0;
  const byExit = {};
  for (const t of trades) {
    sumR += t.rNet;
    sumRaw += t.rawR;
    sumCost += t.costR;
    if (t.rNet > 0) wins++;
    byExit[t.exitReason] = (byExit[t.exitReason] ?? 0) + 1;
  }
  return {
    trades: n,
    meanR: sumR / n,
    winRate: wins / n,
    totalR: sumR,
    avgRawR: sumRaw / n,
    avgCostR: sumCost / n,
    byExit,
  };
}

/**
 * วัดชุดค่าผสมหนึ่งชุด
 * @param isCut (trade, idx) → true ถ้าไม้นี้ถูกตัด
 */
function evaluateConfig({ id, label, rules }, ctx, isCut) {
  const { trades, rNet, groups, spanDays, B, seed, L } = ctx;
  const cutIdx = [];
  const kept = [];
  for (let i = 0; i < trades.length; i++) {
    if (isCut(trades[i], i)) cutIdx.push(i);
    else kept.push(trades[i]);
  }

  const base = summarise(trades);
  const after = summarise(kept);
  const k = cutIdx.length;

  const strat = permutationTest({ rNet, groups, cutIdx, B, seed, stratified: true });
  const plain = permutationTest({ rNet, groups, cutIdx, B, seed: seed ^ 0x9e3779b9, stratified: false });

  // ตัดกี่ % ต่อ symbol — ไว้ดูว่าวีโต้ไปกระจุกอยู่ที่ตัวเดียวหรือกระจายทั้งกระดาน
  const cutPerSymbol = {};
  for (const i of cutIdx) {
    const s = trades[i].symbol;
    cutPerSymbol[s] = (cutPerSymbol[s] ?? 0) + 1;
  }

  return {
    config: id,
    label,
    rules,
    tradesBefore: base.trades,
    tradesAfter: after.trades,
    cut: k,
    cutPct: base.trades ? k / base.trades : null,
    meanRBefore: base.meanR,
    meanRAfter: after.meanR,
    delta: after.meanR !== null && base.meanR !== null ? after.meanR - base.meanR : null,
    winRateBefore: base.winRate,
    winRateAfter: after.winRate,
    totalRAfter: after.totalR,
    avgRawRAfter: after.avgRawR,
    avgCostRAfter: after.avgCostR,
    byExitAfter: after.byExit,
    tradesPerDay: spanDays ? after.trades / spanDays : null,
    tradesPerYear: spanDays ? (after.trades / spanDays) * 365.25 : null,
    cutPerSymbol,
    permStratified: strat,
    permUnstratified: plain,
    ci: after.trades ? L.bootstrapClusterStats(kept, { B: ctx.bootstrap, seed }) : null,
  };
}

/** baseline + เดี่ยว 4 + ซ้อนทั้ง 4 + ทุกคู่ 6 = 12 ชุด */
function buildConfigs(vetoes) {
  const out = [{ id: 'baseline', label: 'ไม่กรอง (ไม้ทั้งหมด)', rules: [], mask: 0 }];
  for (let i = 0; i < vetoes.length; i++) {
    out.push({ id: vetoes[i].short, label: vetoes[i].meta.name, rules: [vetoes[i].slug], mask: 1 << i });
  }
  const allMask = (1 << vetoes.length) - 1;
  out.push({
    id: 'all4',
    label: 'ซ้อนทั้ง 4 (ตัดถ้าข้อใดข้อหนึ่งห้าม)',
    rules: vetoes.map((v) => v.slug),
    mask: allMask,
  });
  for (let i = 0; i < vetoes.length; i++) {
    for (let j = i + 1; j < vetoes.length; j++) {
      out.push({
        id: `${vetoes[i].short}+${vetoes[j].short}`,
        label: `คู่: ${vetoes[i].short} + ${vetoes[j].short}`,
        rules: [vetoes[i].slug, vetoes[j].slug],
        mask: (1 << i) | (1 << j),
      });
    }
  }
  return out;
}

function makeCtx(base, deps, opts) {
  const { L } = deps;
  const trades = base.trades;
  const rNet = new Float64Array(trades.length);
  for (let i = 0; i < trades.length; i++) rNet[i] = trades[i].rNet;

  const byKey = new Map();
  const keyOf = new Array(trades.length);
  for (let i = 0; i < trades.length; i++) {
    const s = trades[i].symbol;
    keyOf[i] = s;
    let arr = byKey.get(s);
    if (!arr) { arr = []; byKey.set(s, arr); }
    arr.push(i);
  }

  return {
    trades,
    rNet,
    groups: { byKey, keyOf },
    spanDays: base.spanDays,
    B: opts.B,
    seed: opts.seed,
    bootstrap: opts.bootstrap,
    L,
  };
}

function runTimeframe(tf, deps, opts) {
  const base = buildBaseTrades(tf, deps, opts);
  const ctx = makeCtx(base, deps, opts);
  const configs = buildConfigs(deps.vetoes);
  const rows = configs.map((c) => evaluateConfig(c, ctx, (t) => (t.vetoMask & c.mask) !== 0));
  return { base, rows };
}

// ═══════════════════════════════ self-test ═══════════════════════════════

/**
 * ชุดตรวจของท่อทั้งท่อ — ทุกข้อไม่ผ่าน = exit code != 0
 *
 * ใช้จักรวาลย่อ 3 ตัวบน 1D เพราะข้อที่ต้องใช้แท่งจริง (causality · parity · guard)
 * ไม่ต้องใช้ทั้ง 13 ตัวก็พิสูจน์ได้ ส่วนข้อสถิติ (uniform · positive · negative control)
 * รันบนกองไม้จริงชุดเดียวกันนั้น — ไม่ใช่ข้อมูลสังเคราะห์ เพื่อให้ทดสอบ "ท่อจริง"
 */
async function selfTest(deps, opts) {
  const { L } = deps;
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail ?? '' });

  const tf = '1D';
  const bounds = L.loadSplitBoundaries([tf]);
  const cutMs = L.measurableCutMs(bounds, tf);
  const cache = new Map();
  const symbols = ['XAUUSD', 'EURUSD', 'USDJPY'];
  const sub = { ...opts, bounds, cache, symbols };

  // ── 1. guard ชุด test ──────────────────────────────────────────────────
  try {
    const ds = L.prepareDataset({ market: 'FOREX', symbol: 'EURUSD' }, tf, bounds, cache);
    const maxTs = Math.max(...ds.bars.map((b) => b.ts));
    const clean = maxTs < cutMs;
    let threw = false;
    try {
      assertNoTestBarsHere([...ds.bars, { ts: cutMs, timestamp: new Date(cutMs).toISOString() }],
        tf, cutMs, 'self-test');
    } catch { threw = true; }
    ok('test-set-guard', clean && threw && ds.droppedTestBars > 0,
      `แท่งสูงสุด ${new Date(maxTs).toISOString().slice(0, 10)} < เส้น ${new Date(cutMs).toISOString().slice(0, 10)}`
      + ` · ตัดแท่ง test ทิ้ง ${ds.droppedTestBars} แท่ง · guard throw เมื่อยัดแท่ง test = ${threw}`);
  } catch (err) {
    ok('test-set-guard', false, String(err?.message ?? err));
  }

  // ── 2. ตัวเดินไม้ตรงกับ rule-lab เมื่อป้อนเรขาคณิตเดิม ─────────────────
  try {
    const ds = L.prepareDataset({ market: 'GOLD', symbol: 'XAUUSD' }, tf, bounds, cache);
    const { bars, ind } = ds;
    const maxHold = L.MAX_HOLD_BARS[tf];
    const rnd = L.mulberry32(0x51ce55);
    const fields = ['entry', 'stop', 'target', 'risk', 'exitPrice', 'exitReason', 'exitIdx',
      'barsHeld', 'rawR', 'costR', 'rNet', 'mfeR', 'maeR', 'entryIdx', 'entryTime', 'exitTime'];
    let compared = 0;
    let bothNull = 0;
    const diffs = [];

    for (let s = 0; s < 4000; s++) {
      const t = L.WARMUP_BARS + ((rnd() * (bars.length - 2 - L.WARMUP_BARS)) | 0);
      if (t < L.WARMUP_BARS || t > bars.length - 2) continue;
      const side = rnd() < 0.5 ? 'long' : 'short';
      const atr = ind.atr[t];

      const orig = L.simulateTrade(bars, t, side, atr, 'XAUUSD', 'GOLD', maxHold);

      // สร้างเรขาคณิตของ rule-lab ขึ้นมาใหม่ด้วยนิพจน์เดียวกันเป๊ะ แล้วป้อนเป็น "ระดับราคา"
      // ถ้าเขียน stop แล้วให้ตัวเราคำนวณ risk = |entry − stop| กลับเอง ค่าจะต่างในหลัก ulp
      // (เพราะ entry − (entry − risk) ไม่เท่ากับ risk เสมอไปในเลขทศนิยม) แล้ว rawR จะเพี้ยน
      // ตามไปด้วย — จึงส่ง riskPlanned ตรง ๆ ซึ่งคือปริมาณเดียวกับที่ rule-lab ใช้
      let mine = null;
      const entryIdx = t + 1;
      if (entryIdx < bars.length && Number.isFinite(atr) && atr > 0) {
        const entry = bars[entryIdx].open;
        const risk = L.SL_ATR_MULT * atr;
        const isLong = side === 'long';
        const stop = isLong ? entry - risk : entry + risk;
        const target = isLong ? entry + L.RR_TARGET * risk : entry - L.RR_TARGET * risk;
        mine = simulateTradeFromLevels(L, bars, t, side, { stop, target, riskPlanned: risk },
          'XAUUSD', 'GOLD', maxHold);
      }

      if (orig === null && mine === null) { bothNull++; continue; }
      if (orig === null || mine === null) {
        diffs.push(`t=${t} ฝั่งหนึ่ง null อีกฝั่งไม่ null`);
        continue;
      }
      compared++;
      for (const f of fields) {
        if (!Object.is(orig[f], mine[f])) {
          diffs.push(`t=${t} ${f}: เดิม ${orig[f]} · ใหม่ ${mine[f]}`);
        }
      }
      if (diffs.length >= 5) break;
    }
    ok('simulator-parity', diffs.length === 0 && compared > 200,
      `เทียบ ${compared} ไม้ (null ตรงกัน ${bothNull}) ต่างกัน ${diffs.length} จุด`
      + (diffs.length ? ` — ${diffs.slice(0, 3).join(' | ')}` : ''));
  } catch (err) {
    ok('simulator-parity', false, String(err?.message ?? err));
  }

  // ── 3. ผลิตไม้จริงจากจักรวาลย่อ (ใช้ต่อในข้อสถิติ) ─────────────────────
  let base = null;
  try {
    base = buildBaseTrades(tf, deps, sub);
    ok('base-trades-built', base.trades.length >= 50,
      `${symbols.join(',')} → ไม้ ${base.trades.length} ไม้ จาก ${base.counts.decisions} จุดตัดสินใจ`);
  } catch (err) {
    ok('base-trades-built', false, String(err?.message ?? err));
  }
  if (!base || base.trades.length < 50) {
    return { passed: false, checks };
  }

  // ── 4. สัญญาณฐานเป็น causal ────────────────────────────────────────────
  try {
    const rnd = L.mulberry32(0x0ca05a1);
    const pick = [];
    for (let s = 0; s < 60 && s < base.trades.length; s++) {
      pick.push(base.trades[(rnd() * base.trades.length) | 0]);
    }
    const dsCache = sub.cache;
    let checked = 0;
    const bad = [];
    for (const tr of pick) {
      const u = L.UNIVERSE.find((x) => x.symbol === tr.symbol);
      const ds = L.prepareDataset(u, tf, bounds, dsCache);
      const t = tr.signalIdx;
      // slice ใหม่ทุกครั้ง = อาเรย์คนละก้อนกับ prefix ที่ใช้ตอนเดิน ถ้าผลไม่เท่าเดิม
      // แปลว่ามีสถานะค้างข้ามการเรียก (หรือมีการอ่านแท่งหลัง t) ซึ่งคือการมองอนาคต
      const fresh = deps.engine.generateSignal({
        symbol: u.symbol, name: u.symbol, market: u.market,
        candles: ds.bars.slice(0, t + 1), timeframe: tf,
      });
      const d = decisionOf(fresh);
      const want = {
        action: tr.side === 'long' ? 'BUY' : 'SELL',
        strength: tr.strength,
        confidence: tr.confidence,
        entry_price: tr.entryPriceSignal,
        stop_loss: tr.stop,
        take_profit: tr.target,
      };
      checked++;
      if (!d || !decisionEqual(d, want)) bad.push(`${tr.symbol}@${t}`);
      if (bad.length >= 3) break;
    }
    ok('base-signal-causal', bad.length === 0 && checked >= 30,
      `เรียกซ้ำด้วย prefix อิสระ ${checked} จุด · ต่างจากเดิม ${bad.length}`
      + (bad.length ? ` (${bad.join(', ')})` : ''));
  } catch (err) {
    ok('base-signal-causal', false, String(err?.message ?? err));
  }

  // ── 5. กฎวีโต้ไม่แอบอ่านอนาคต (ใช้ probe ของ rule-lab เอง) ─────────────
  try {
    const ds = L.prepareDataset({ market: 'FOREX', symbol: 'EURUSD' }, tf, bounds, sub.cache);
    const bad = [];
    for (const v of deps.vetoes) {
      const f = L.probeRuleCausality({ slug: v.slug, meta: v.meta, evaluate: v.evaluate }, ds,
        { samples: 40, seed: 0x5bf03635 });
      if (f.length) bad.push(`${v.short}@${f.map((x) => x.t).join(',')}`);
    }
    ok('veto-rules-causal', bad.length === 0,
      bad.length ? bad.join(' | ') : `ทั้ง ${deps.vetoes.length} ข้อผ่าน (40 จุดต่อข้อ)`);
  } catch (err) {
    ok('veto-rules-causal', false, String(err?.message ?? err));
  }

  const ctx = makeCtx(base, deps, { ...opts, B: 2000 });
  const n = base.trades.length;

  // ── 6. permutation null ให้ p กระจายสม่ำเสมอเมื่อป้อนวีโต้ที่ตัดแบบสุ่มจริง ──
  //
  // นี่คือข้อที่พิสูจน์ว่า "การตัดไม้ทิ้งเฉย ๆ" ไม่ทำให้ p เล็กเอง ถ้าท่อวัดถูกต้อง
  // ตัวตัดสุ่มต้องได้ p ที่กระจายแบน ๆ บน [0,1] — ถ้ามันเอนไปทางเล็ก แปลว่าเรากำลัง
  // แจกใบรับรองให้ตัวกรองที่ไม่รู้อะไรเลย ซึ่งเป็นความผิดพลาดที่ไฟล์นี้มีไว้กันโดยเฉพาะ
  for (const stratified of [true, false]) {
    try {
      const ps = [];
      const k = Math.round(n * 0.25);
      for (let s = 0; s < 40; s++) {
        const rnd = L.mulberry32(0xa11ce + s * 7919);
        const pool = Array.from({ length: n }, (_, i) => i);
        const cutIdx = [];
        for (let i = 0; i < k; i++) {
          const j = i + ((rnd() * (n - i)) | 0);
          const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
          cutIdx.push(pool[i]);
        }
        const r = permutationTest({
          rNet: ctx.rNet, groups: ctx.groups, cutIdx, B: 1500,
          seed: (0xbeef + s * 104729) >>> 0, stratified,
        });
        ps.push(r.pOneSided);
      }
      const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
      const lo = ps.filter((p) => p < 0.1).length / ps.length;
      const hi = ps.filter((p) => p > 0.9).length / ps.length;
      const small = ps.filter((p) => p < 0.05).length / ps.length;
      const pass = mean > 0.35 && mean < 0.65 && lo <= 0.30 && hi <= 0.30 && small <= 0.20;
      ok(`perm-null-uniform-${stratified ? 'strat' : 'plain'}`, pass,
        `40 เมล็ด · p เฉลี่ย ${n4(mean, 3)} · p<0.1 ${pctS(lo, 0)} · p>0.9 ${pctS(hi, 0)} · p<0.05 ${pctS(small, 0)}`);
    } catch (err) {
      ok(`perm-null-uniform-${stratified ? 'strat' : 'plain'}`, false, String(err?.message ?? err));
    }
  }

  // ── 7. positive control — วีโต้ที่ "รู้อนาคต" ต้องได้ p เล็กมาก ────────
  try {
    const k = Math.round(n * 0.25);
    const order = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => ctx.rNet[a] - ctx.rNet[b]);
    const cutIdx = order.slice(0, k); // ตัดไม้ที่แพ้หนักสุด k ไม้ทิ้ง
    const a = permutationTest({ ...ctx, cutIdx, seed: opts.seed, stratified: true });
    const b = permutationTest({ ...ctx, cutIdx, seed: opts.seed, stratified: false });
    ok('positive-control', a.pOneSided < 0.001 && b.pOneSided < 0.001,
      `ตัดไม้แย่สุด ${k} ไม้ → delta ${n4(a.deltaObs)} · p(strat) ${n4(a.pOneSided, 5)}`
      + ` · p(plain) ${n4(b.pOneSided, 5)}`);
  } catch (err) {
    ok('positive-control', false, String(err?.message ?? err));
  }

  // ── 8. negative control — ตัดตามลำดับเวลาโดยไม่ดูอะไร ต้องได้ p ไม่เล็ก ──
  try {
    const k = Math.round(n * 0.25);
    const order = Array.from({ length: n }, (_, i) => i)
      .sort((x, y) => Date.parse(base.trades[x].signalTime) - Date.parse(base.trades[y].signalTime));
    const cutIdx = order.slice(0, k); // ตัดไม้ที่เกิดก่อนที่สุด k ไม้
    const a = permutationTest({ ...ctx, cutIdx, seed: opts.seed, stratified: true });
    const b = permutationTest({ ...ctx, cutIdx, seed: opts.seed, stratified: false });
    ok('negative-control', a.pOneSided >= 0.01 && b.pOneSided >= 0.01,
      `ตัดไม้แรกสุดตามเวลา ${k} ไม้ → delta ${n4(a.deltaObs)} · p(strat) ${n4(a.pOneSided, 4)}`
      + ` · p(plain) ${n4(b.pOneSided, 4)}`);
  } catch (err) {
    ok('negative-control', false, String(err?.message ?? err));
  }

  // ── 9. กรณีขอบของ permutation ─────────────────────────────────────────
  try {
    const zero = permutationTest({ ...ctx, cutIdx: [], seed: opts.seed, stratified: true });
    const allCut = permutationTest({
      ...ctx, cutIdx: Array.from({ length: n }, (_, i) => i), seed: opts.seed, stratified: true,
    });
    ok('perm-edge-cases', zero.deltaObs === 0 && zero.pOneSided === 1 && allCut.degenerate,
      `k=0 → delta 0 · p 1 | k=n → รายงานว่าไม่เหลือไม้ให้วัด`);
  } catch (err) {
    ok('perm-edge-cases', false, String(err?.message ?? err));
  }

  return { passed: checks.every((c) => c.pass), checks };
}

// ═══════════════════════════════ CLI ═══════════════════════════════

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function printTable(tf, head, rows) {
  const W = { cfg: 22, n: 6, cut: 7, mean: 9, win: 7, day: 9, dlt: 9, ps: 9, pp: 9 };
  console.log('');
  console.log(`── ${tf} · ไม้ฐาน ${head.trades} ไม้ · ช่วง ${String(head.spanFirst).slice(0, 10)}`
    + ` → ${String(head.spanLast).slice(0, 10)} (${Math.round(head.spanDays)} วัน) ──`);
  console.log(`${pad('ชุด', W.cfg)} ${padL('เหลือ', W.n)} ${padL('ตัด%', W.cut)} ${padL('meanR', W.mean)}`
    + ` ${padL('ชนะ', W.win)} ${padL('ไม้/วัน', W.day)} ${padL('delta', W.dlt)}`
    + ` ${padL('p strat', W.ps)} ${padL('p plain', W.pp)}`);
  console.log('─'.repeat(Object.values(W).reduce((a, b) => a + b, 0) + 8));
  for (const r of rows) {
    const ps = r.permStratified?.pOneSided;
    const pp = r.permUnstratified?.pOneSided;
    console.log(`${pad(r.config.slice(0, W.cfg), W.cfg)} ${padL(r.tradesAfter, W.n)}`
      + ` ${padL(pctS(r.cutPct, 1), W.cut)} ${padL(n4(r.meanRAfter), W.mean)}`
      + ` ${padL(pctS(r.winRateAfter, 1), W.win)} ${padL(n4(r.tradesPerDay, 4), W.day)}`
      + ` ${padL(n4(r.delta), W.dlt)} ${padL(r.config === 'baseline' ? '—' : n4(ps, 4), W.ps)}`
      + ` ${padL(r.config === 'baseline' ? '—' : n4(pp, 4), W.pp)}`);
  }
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
veto-lab.mjs — วัดกฎวีโต้ด้วย permutation null ที่ตัดจำนวนเท่ากัน (train+validation)

  --timeframes=1D,1H   กรอบเวลา (ค่าเริ่มต้น 1D)
  --symbols=A,B        จำกัด symbol (ค่าเริ่มต้น = ทั้ง 13 ตัว)
  --B=10000            จำนวนรอบ permutation
  --bootstrap=2000     จำนวนรอบ cluster bootstrap สำหรับ CI
  --seed=20260828      เมล็ด PRNG
  --json               พิมพ์ JSON แทนตาราง
  --self-test          ตรวจท่อทั้งท่อ แล้ว exit != 0 ถ้าไม่ผ่าน
`);
    return 0;
  }

  const deps = await loadDeps();
  L_MULBERRY = deps.L.mulberry32;

  const opts = {
    B: Number(args.B ?? DEFAULT_B),
    bootstrap: Number(args.bootstrap ?? 2000),
    seed: Number(args.seed ?? DEFAULT_SEED) >>> 0,
    symbols: args.symbols ? String(args.symbols).split(',').map((s) => s.trim()).filter(Boolean) : null,
  };

  if (args['self-test']) {
    const res = await selfTest(deps, opts);
    console.log('\n── self-test ──');
    for (const c of res.checks) {
      console.log(`  ${c.pass ? 'ผ่าน  ' : 'ไม่ผ่าน'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
    }
    console.log(res.passed ? '\nself-test ผ่านครบทุกข้อ\n' : '\nself-test ไม่ผ่าน\n');
    return res.passed ? 0 : 1;
  }

  const timeframes = String(args.timeframes ?? '1D').split(',').map((s) => s.trim()).filter(Boolean);
  for (const tf of timeframes) {
    if (!deps.L.MAX_HOLD_BARS[tf]) {
      throw new Error(`ไม่รองรับกรอบเวลา ${tf} (มีแค่ ${Object.keys(deps.L.MAX_HOLD_BARS).join(', ')})`);
    }
  }

  const t0 = Date.now();
  const bounds = deps.L.loadSplitBoundaries(timeframes);
  const cache = new Map();
  const perTf = {};

  for (const tf of timeframes) {
    const { base, rows } = runTimeframe(tf, deps, { ...opts, bounds, cache });
    perTf[tf] = {
      timeframe: tf,
      measuredBefore: base.measuredBefore,
      universe: base.universe,
      spanFirst: base.spanFirst,
      spanLast: base.spanLast,
      spanDays: base.spanDays,
      baseSignals: {
        decisions: base.counts.decisions,
        engineNull: base.counts.engineNull,
        hold: base.counts.hold,
        directional: base.counts.directional,
        gatePassed: base.counts.gatePassed,
        gateRejected: base.counts.gateRejected,
        rejectByCode: base.counts.rejectByCode,
        tradeOpenFailed: base.counts.tradeOpenFailed,
        trades: base.trades.length,
        gapPastStop: base.counts.gapPastStop,
        gapPastTarget: base.counts.gapPastTarget,
      },
      vetoHits: Object.fromEntries(deps.vetoes.map((v, i) => [v.short, base.vetoHits[i]])),
      results: rows,
    };
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    splitSource: bounds.source ?? 'report/split.json',
    measuredSplits: ['train', 'validation'],
    permutation: { B: opts.B, seed: opts.seed, modes: ['stratified-by-symbol', 'unstratified'] },
    gate: {
      source: 'src/lib/universe.ts · evaluateSignal() + SIGNAL_GATE',
      applied: ['minStrength', 'minConfidence', 'minRiskReward', 'maxRiskReward',
        'minStopDistancePct', 'maxStopDistancePct'],
      skipped: ['maxSignalsPerRun'],
      skippedWhy: 'maxSignalsPerRun เป็นโควตาต่อรอบสแกน ไม่ใช่เกณฑ์คุณภาพของสัญญาณเดี่ยว '
        + 'และ evaluateSignal() ไม่ได้บังคับข้อนี้อยู่แล้ว (บังคับที่ selectSignals())',
      values: deps.gate.SIGNAL_GATE,
    },
    tradeRules: {
      entry: 'ราคาเปิดของแท่งถัดไปจากแท่งสัญญาณ',
      stopLoss: 'sig.stop_loss (ค่าจากสัญญาณจริง)',
      takeProfit: 'sig.take_profit (ค่าจากสัญญาณจริง)',
      rDenominator: 'plannedRisk = |sig.entry_price − sig.stop_loss|',
      slWinsOnSameBar: true,
      maxHoldBars: deps.L.MAX_HOLD_BARS,
      costs: deps.L.COST_BPS,
    },
    timeframes: perTf,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const tf of timeframes) {
      const d = perTf[tf];
      console.log(`\n${tf}: จุดตัดสินใจ ${d.baseSignals.decisions} → มีทิศทาง ${d.baseSignals.directional}`
        + ` → ผ่านประตู ${d.baseSignals.gatePassed} → เปิดไม้ได้ ${d.baseSignals.trades}`);
      console.log(`  วีโต้ตัดกี่ไม้ (นับแยกข้อ): ${JSON.stringify(d.vetoHits)}`);
      printTable(tf, {
        trades: d.baseSignals.trades,
        spanFirst: d.spanFirst,
        spanLast: d.spanLast,
        spanDays: d.spanDays,
      }, d.results);
    }
    console.log('อ่านค่า: delta = meanR(หลังกรอง) − meanR(ทั้งหมด) · p = สัดส่วนที่การสุ่มตัด');
    console.log('จำนวนเท่ากันให้ delta ดีเท่านี้หรือดีกว่า — p ใหญ่ = วีโต้ไม่เก่งกว่าการตัดมั่ว\n');
  }

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  if (!args.json) console.log(`เขียนผลลง ${OUT_FILE}\n`);
  return 0;
}

export { loadDeps, simulateTradeFromLevels };
