#!/usr/bin/env node
/**
 * build-signal-evidence.mjs — สร้าง "เครื่องหลักฐานย้อนหลัง" ของเซ็ตอัพสัญญาณ
 *
 * ─────────────────────────────── คำถามที่ตารางนี้ตอบ ───────────────────────────────
 *
 * เจ้าของขอว่า ทุกสัญญาณต้องตอบได้ว่า "เมื่อเกิดเซ็ตอัพแบบนี้ในอดีต ราคาไป TP ก่อน
 * หรือโดน SL ก่อน กี่เปอร์เซ็นต์" — ไฟล์นี้จึงเดินประวัติทั้งแคชด้วยเครื่องยนต์จริง
 * (generateSignal ผ่าน engine-lab ที่ config เริ่มต้น = src/lib/signal-engine.ts เป๊ะ)
 * ผ่านประตูจริง (evaluateSignal ของ src/lib/universe.ts) แล้วเดินไม้ด้วย SL/TP
 * ของสัญญาณจริง — ท่าเดียวกับ buildBaseTrades ของ veto-lab.mjs ทุกขั้น
 *
 * ─────────────────── ทำไมไฟล์นี้ "จงใจ" เดินเต็มช่วงแคช (รวมชุด test) ───────────────────
 *
 * งานวิจัยของ repo นี้ห้ามแตะชุด test ในการวัดเชิงอ้างสิทธิ์ — กติกานั้นยังอยู่ครบ
 * แต่ตารางนี้ไม่ใช่การอ้างสิทธิ์: มันคือ "สถิติบรรยาย" ของ product ที่บอกความถี่ในอดีต
 * ของเรขาคณิต SL/TP แบบเดียวกัน ไม่ได้ใช้เลือกกฎ ไม่ได้ใช้จูนพารามิเตอร์ และไม่ได้
 * ประกาศว่าระบบมี edge (งานวิจัยวัดแล้วว่าไม่มีเซ็ตอัพไหนพิสูจน์ edge หลังต้นทุนได้)
 * จึงใช้ข้อมูลทั้งช่วงเพื่อให้ n ต่อเซลล์นิ่งที่สุด — โดยมีเงื่อนไขบังคับสองข้อ:
 *   1. ทุกไฟล์ผลลัพธ์ต้องติดป้าย scope ว่ารวมช่วง test ของงานวิจัยแล้ว
 *      **ห้ามเอาตัวเลขชุดนี้ไปอ้างในงานวิจัยหรือเทียบกับรายงานวิจัยเด็ดขาด**
 *   2. ข้อความที่ผู้ใช้เห็นพูดได้แค่ "ในอดีต...%" — ห้ามพูดว่าโอกาส/ความน่าจะเป็นข้างหน้า
 *
 * ─────────────────────────────── สิ่งที่ใช้ซ้ำจากของเดิม ───────────────────────────────
 *
 * · rule-lab.mjs (ผ่าน audit-rule-lab-probe.mjs) → loadRawBars · MAX_HOLD_BARS ·
 *   WARMUP_BARS · UNIVERSE · costRFor · mulberry32 — ตัวอักษรเดียวกับต้นฉบับเป๊ะ
 * · veto-lab.mjs (ผ่าน probe แบบเดียวกัน — ดู buildVetoLabProbe ด้านล่าง) →
 *   loadDeps (ตัวโหลดเครื่องยนต์+ประตูจริง) และ simulateTradeFromLevels
 *   (ตัวเดินไม้ด้วย SL/TP ของสัญญาณ ที่พิสูจน์ parity กับ rule-lab แล้วใน self-test ของมัน)
 * เหตุผลที่ต้องใช้ probe: ทั้งสองไฟล์เรียก main() ทันทีตอน import และไม่ export อะไรเลย
 *
 * ── ผลลัพธ์สองไฟล์ ──────────────────────────────────────────────────────────────
 * · scripts/research/reports/signal-evidence.json — ทุกเซลล์ ไม่กรอง n (หลักฐานเต็ม)
 * · src/lib/signal-evidence.data.json — เฉพาะเซลล์ n >= 30 (ต่ำกว่านั้นความถี่แกว่ง
 *   แรงเกินกว่าจะโชว์ผู้ใช้) — ไฟล์นี้คือก้อนที่ UI และตัวสแกนอ่าน
 *
 * ── โครงตาราง ───────────────────────────────────────────────────────────────────
 * ชั้น symbol    : (symbol, timeframe, action, strength)  ← จำเพาะที่สุด
 * ชั้น timeframe : (timeframe, action, strength) รวมทุก symbol
 * ชั้น global    : (timeframe, action) รวมทั้งหมด
 * 15m ไม่มีประวัติ (Yahoo ให้ย้อนแค่ 1 เดือน) — ตัวอ่าน (src/lib/signal-evidence.ts)
 * จะถอยไปใช้ชั้น 1H และทุกเซลล์แบก sourceTimeframe ติดตัว ให้ UI บอกตรง ๆ ว่า
 * เป็นค่าประมาณจากกรอบ 1 ชั่วโมง
 *
 * ── การนับผล ────────────────────────────────────────────────────────────────────
 * tpFirst / slFirst / timeout นับจาก exitReason ของตัวเดินไม้ (SL ชนะเมื่อแท่งเดียว
 * แตะทั้งคู่ — อนุรักษ์นิยม ตรงกับ scripts/resolve-signals.mjs) · ไม้ที่ข้อมูลหมดก่อน
 * ครบเพดานถือ (dataEnd) ถูก "ตัดออกจาก n" เพราะผลจริงยังไม่รู้ — นับเป็น censored
 * ไว้ในรายงานเต็มแทน ไม่เอามาปนเพราะจะกดสัดส่วน timeout ให้ผิดจากความจริง
 *
 * ── วิธีใช้ ─────────────────────────────────────────────────────────────────────
 *   node scripts/research/build-signal-evidence.mjs                 (สร้างทั้งสองไฟล์)
 *   node scripts/research/build-signal-evidence.mjs --timeframes=1D --symbols=XAUUSD
 *   node scripts/research/build-signal-evidence.mjs --self-test     (ตรวจไฟล์ที่เขียนไว้)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SELF_DIR, '..', '..');
const REPORTS_DIR = path.join(SELF_DIR, 'reports');
const FULL_OUT = path.join(REPORTS_DIR, 'signal-evidence.json');
const SHIP_OUT = path.join(ROOT, 'src', 'lib', 'signal-evidence.data.json');

/** เซลล์ที่ n ต่ำกว่านี้ไม่นิ่งพอจะโชว์ผู้ใช้ — ไม่ลงไฟล์ src */
const MIN_N_SHIP = 30;
/** กรอบเวลาที่มีประวัติในแคช — 15m ไม่มี (ตัวอ่านถอยไปใช้ 1H เอง) */
const DEFAULT_TFS = ['1D', '1H'];
const SELFTEST_SEED = 20260828;

// ═══════════════════ probe ของ veto-lab.mjs (ท่าเดียวกับ audit-rule-lab-probe) ═══════════════════
//
// veto-lab.mjs เรียก main() ทันทีตอน import — อ่านซอร์สมาตัดบรรทัดเรียก main() ทิ้ง
// เติม export ต่อท้าย แล้วเขียนเป็นไฟล์ข้าง ๆ กัน (ต้องอยู่โฟลเดอร์เดียวกันเพราะ
// SELF_DIR ของมันใช้หาโฟลเดอร์ rules) — โค้ดที่ถูกใช้ยังเป็นตัวอักษรเดียวกับต้นฉบับเป๊ะ

const VETO_LAB_SRC = path.join(SELF_DIR, 'veto-lab.mjs');
const VETO_LAB_GEN = path.join(SELF_DIR, 'signal-evidence-veto-lab-internals.generated.mjs');
const VETO_LAB_EXPORTS = ['loadDeps', 'simulateTradeFromLevels'];

function buildVetoLabProbe() {
  const src = fs.readFileSync(VETO_LAB_SRC, 'utf8');
  const marker = '\nmain()\n';
  const cut = src.indexOf(marker);
  if (cut < 0) throw new Error('หาจุดเรียก main() ใน veto-lab.mjs ไม่เจอ — ซอร์สเปลี่ยนรูปไปแล้ว');
  fs.writeFileSync(VETO_LAB_GEN, `${src.slice(0, cut)}\nexport { ${VETO_LAB_EXPORTS.join(', ')} };\n`, 'utf8');
  return VETO_LAB_GEN;
}

async function loadVetoLabProbe() {
  const f = buildVetoLabProbe();
  return import(`${pathToFileURL(f).href}?v=${Date.now()}`);
}

// ═══════════════════════════════ การเดินประวัติเต็มช่วงแคช ═══════════════════════════════

/**
 * เดินทุกแท่งของทุก symbol ในกรอบเวลาหนึ่ง → ไม้ที่ผ่านประตูจริง พร้อมผลจบของแต่ละไม้
 *
 * โครงลอกจาก buildBaseTrades ของ veto-lab.mjs โดยตัดสองอย่างออก "โดยตั้งใจ":
 *   · การถามกฎวีโต้ — ตารางนี้บรรยายสัญญาณที่ผู้ใช้ได้รับจริง ซึ่งไม่มีวีโต้ในเส้นทางจริง
 *   · การตัดชุด test (prepareDataset + assertNoTestBarsHere) — เหตุผลเต็มอยู่หัวไฟล์:
 *     นี่คือสถิติบรรยายของ product ไม่ใช่การวัดเชิงอ้างสิทธิ์ จึงเดินเต็มช่วงแล้วติดป้ายแทน
 */
function walkTimeframe(tf, deps, opts) {
  const { L, gate, engine, V } = deps;
  const maxHold = L.MAX_HOLD_BARS[tf];
  if (!maxHold) throw new Error(`ไม่ได้กำหนดเพดานถือของกรอบเวลา ${tf}`);

  const universe = opts.symbols
    ? L.UNIVERSE.filter((u) => opts.symbols.includes(u.symbol))
    : L.UNIVERSE;
  if (!universe.length) throw new Error('ตัวกรอง --symbols ไม่ตรงกับ symbol ไหนเลย');

  const trades = [];
  const counts = {
    decisions: 0, engineNull: 0, hold: 0, directional: 0,
    gatePassed: 0, gateRejected: 0, rejectByCode: {},
    tradeOpenFailed: 0, censoredDataEnd: 0, gapPastStop: 0, gapPastTarget: 0,
  };
  let spanFirst = Infinity;
  let spanLast = -Infinity;

  for (const u of universe) {
    const t0 = Date.now();
    // เต็มช่วงแคช — ไม่ตัดชุด test (ดูหัวไฟล์ · ห้ามเอาผลไปอ้างในงานวิจัย)
    const bars = L.loadRawBars(u.market, u.symbol, tf);
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
      const trade = V.simulateTradeFromLevels(L, bars, t, side, {
        stop: sig.stop_loss,
        target: sig.take_profit,
        riskPlanned: Math.abs(sig.entry_price - sig.stop_loss),
      }, u.symbol, u.market, maxHold);
      if (!trade) { counts.tradeOpenFailed++; continue; }

      // ข้อมูลหมดก่อนครบเพดานถือ = ผลจริงยังไม่รู้ — ตัดออกจากตาราง นับเป็น censored
      if (trade.exitReason === 'dataEnd') { counts.censoredDataEnd++; continue; }
      if (trade.gapPastStop) counts.gapPastStop++;
      if (trade.gapPastTarget) counts.gapPastTarget++;

      trades.push({
        symbol: u.symbol,
        tf,
        action: sig.action,
        strength: sig.strength,
        exitReason: trade.exitReason, // 'sl' | 'tp' | 'timeout'
        barsHeld: trade.barsHeld,
        rNet: trade.rNet,
        entryTs: bars[trade.entryIdx].ts,
      });
    }
    if (!opts.quiet) {
      console.log(`  ${tf} ${u.symbol.padEnd(8)} แท่ง ${String(bars.length).padStart(6)} · ไม้สะสม ${trades.length} · ${((Date.now() - t0) / 1000).toFixed(1)} วิ`);
    }
  }

  return {
    timeframe: tf,
    trades,
    counts,
    universe: universe.map((u) => `${u.market}/${u.symbol}`),
    spanFirst: Number.isFinite(spanFirst) ? new Date(spanFirst).toISOString() : null,
    spanLast: spanLast > 0 ? new Date(spanLast).toISOString() : null,
  };
}

// ═══════════════════════════════ การประกอบเซลล์ ═══════════════════════════════

const utcYear = (ts) => new Date(ts).getUTCFullYear();
const spanYearsOf = (firstTs, lastTs) => {
  const a = utcYear(firstTs);
  const b = utcYear(lastTs);
  return a === b ? String(a) : `${a}–${b}`;
};

/** ค่ากลางของจำนวนแท่งที่ถือ — เรียงก่อนเสมอ (คู่ = เฉลี่ยสองตัวกลาง) */
function medianOf(values) {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/**
 * รวมไม้ทั้งหมดเป็นสามชั้นในรอบเดียว — ลำดับการบวก rNet คือลำดับการเดิน
 * (timeframe → symbol ตามลำดับ UNIVERSE → เวลา) ซึ่ง self-test อาศัยความนิ่งนี้
 * ในการคำนวณซ้ำแล้วเทียบแบบตรงเป๊ะระดับบิตของเลขทศนิยม
 */
function aggregateCells(allTrades) {
  const layers = { symbol: new Map(), timeframe: new Map(), global: new Map() };
  const keyOf = {
    symbol: (t) => `${t.symbol}|${t.tf}|${t.action}|${t.strength}`,
    timeframe: (t) => `${t.tf}|${t.action}|${t.strength}`,
    global: (t) => `${t.tf}|${t.action}`,
  };

  for (const t of allTrades) {
    for (const layer of ['symbol', 'timeframe', 'global']) {
      const key = keyOf[layer](t);
      let acc = layers[layer].get(key);
      if (!acc) {
        acc = { tf: t.tf, n: 0, tp: 0, sl: 0, timeout: 0, sumR: 0, barsHeld: [], firstTs: Infinity, lastTs: -Infinity };
        layers[layer].set(key, acc);
      }
      acc.n++;
      if (t.exitReason === 'tp') acc.tp++;
      else if (t.exitReason === 'sl') acc.sl++;
      else acc.timeout++;
      acc.sumR += t.rNet;
      acc.barsHeld.push(t.barsHeld);
      if (t.entryTs < acc.firstTs) acc.firstTs = t.entryTs;
      if (t.entryTs > acc.lastTs) acc.lastTs = t.entryTs;
    }
  }

  const out = { symbol: {}, timeframe: {}, global: {} };
  for (const layer of ['symbol', 'timeframe', 'global']) {
    for (const [key, a] of layers[layer]) {
      out[layer][key] = {
        n: a.n,
        tpFirstPct: a.tp / a.n,
        slFirstPct: a.sl / a.n,
        timeoutPct: a.timeout / a.n,
        meanR: a.sumR / a.n,
        medianBarsHeld: medianOf(a.barsHeld),
        spanYears: spanYearsOf(a.firstTs, a.lastTs),
        sourceTimeframe: a.tf,
      };
    }
  }
  return out;
}

/** กรองเฉพาะเซลล์ที่ n ถึงเกณฑ์ — ไฟล์ src ต้องไม่มีเซลล์เล็กปนเลยแม้แต่เซลล์เดียว */
function filterShippable(cells) {
  const out = { symbol: {}, timeframe: {}, global: {} };
  let kept = 0;
  for (const layer of ['symbol', 'timeframe', 'global']) {
    for (const [key, cell] of Object.entries(cells[layer])) {
      if (cell.n >= MIN_N_SHIP) { out[layer][key] = cell; kept++; }
    }
  }
  return { cells: out, kept };
}

const countCells = (cells) =>
  Object.keys(cells.symbol).length + Object.keys(cells.timeframe).length + Object.keys(cells.global).length;

// ═══════════════════════════════ self-test ═══════════════════════════════
//
// ตรวจ "ไฟล์ที่เขียนไว้จริง" ไม่ใช่ค่าในหน่วยความจำ — เพราะสิ่งที่ UI/ตัวสแกนอ่านคือไฟล์
// ถ้าแคชเปลี่ยนไปแล้วไฟล์ยังเก่า ข้อ 1 จะแดง ซึ่งคือคำตอบที่ถูก (ต้องรันสร้างใหม่)

/**
 * ตัวเดินไม้อิสระของ self-test — เขียนใหม่ทั้งลูป ไม่เรียก simulateTradeFromLevels
 * และไม่เรียก walkTimeframe/aggregateCells ของตัวสร้าง เพื่อให้การเทียบมีความหมาย
 * (ถ้าเรียกโค้ดเดิมซ้ำ การเทียบพิสูจน์แค่ว่าคอมพิวเตอร์คำนวณซ้ำได้ ซึ่งไม่มีประโยชน์)
 * สิ่งที่ยังใช้ร่วมกันโดยจำเป็น: เครื่องยนต์จริง ประตูจริง และตารางต้นทุนจริง
 * เพราะ "เซลล์" ถูกนิยามด้วยของจริงพวกนั้น ไม่มีทางอิสระจากมันได้
 */
function recomputeCellIndependently(deps, symbol, tf, action, strength) {
  const { L, gate, engine } = deps;
  const u = L.UNIVERSE.find((x) => x.symbol === symbol);
  if (!u) throw new Error(`ไม่พบ ${symbol} ใน UNIVERSE`);
  const bars = L.loadRawBars(u.market, u.symbol, tf);
  const maxHold = L.MAX_HOLD_BARS[tf];

  let n = 0;
  let tp = 0;
  let sl = 0;
  let timeout = 0;
  let sumR = 0;
  const held = [];
  let firstTs = Infinity;
  let lastTs = -Infinity;

  for (let t = L.WARMUP_BARS; t <= bars.length - 2; t++) {
    const sig = engine.generateSignal({
      symbol: u.symbol, name: u.symbol, market: u.market,
      candles: bars.slice(0, t + 1), timeframe: tf,
    });
    if (!sig || (sig.action !== 'BUY' && sig.action !== 'SELL')) continue;
    if (!gate.evaluateSignal(sig).passed) continue;
    if (sig.action !== action || sig.strength !== strength) continue;

    const isLong = sig.action === 'BUY';
    const stop = sig.stop_loss;
    const target = sig.take_profit;
    const risk = Math.abs(sig.entry_price - sig.stop_loss);
    if (!Number.isFinite(stop) || !Number.isFinite(target) || !(risk > 0)) continue;
    const entryIdx = t + 1;
    const entry = bars[entryIdx].open;
    if (!Number.isFinite(entry)) continue;

    const lastIdx = Math.min(entryIdx + maxHold - 1, bars.length - 1);
    let reason = null;
    let exitIdx = lastIdx;
    let exitPrice = null;
    for (let i = entryIdx; i <= lastIdx; i++) {
      const hitStop = isLong ? bars[i].low <= stop : bars[i].high >= stop;
      const hitTarget = isLong ? bars[i].high >= target : bars[i].low <= target;
      if (hitStop) { reason = 'sl'; exitIdx = i; exitPrice = stop; break; }
      if (hitTarget) { reason = 'tp'; exitIdx = i; exitPrice = target; break; }
    }
    if (reason === null) {
      exitPrice = bars[lastIdx].close;
      reason = lastIdx === entryIdx + maxHold - 1 ? 'timeout' : 'dataEnd';
    }
    const costR = L.costRFor(entry, isLong ? entry - risk : entry + risk, u.symbol, u.market);
    if (costR === null) continue;
    if (reason === 'dataEnd') continue; // censored — กติกาเดียวกับตัวสร้าง

    const rawR = isLong ? (exitPrice - entry) / risk : (entry - exitPrice) / risk;
    n++;
    if (reason === 'tp') tp++;
    else if (reason === 'sl') sl++;
    else timeout++;
    sumR += rawR - costR;
    held.push(exitIdx - entryIdx + 1);
    const ts = bars[entryIdx].ts;
    if (ts < firstTs) firstTs = ts;
    if (ts > lastTs) lastTs = ts;
  }

  if (!n) return null;
  const sorted = [...held].sort((a, b) => a - b);
  const median = sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const y1 = new Date(firstTs).getUTCFullYear();
  const y2 = new Date(lastTs).getUTCFullYear();
  return {
    n,
    tpFirstPct: tp / n,
    slFirstPct: sl / n,
    timeoutPct: timeout / n,
    meanR: sumR / n,
    medianBarsHeld: median,
    spanYears: y1 === y2 ? String(y1) : `${y1}–${y2}`,
    sourceTimeframe: tf,
  };
}

async function selfTest(deps) {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail ?? '' });

  if (!fs.existsSync(FULL_OUT) || !fs.existsSync(SHIP_OUT)) {
    ok('files-exist', false, `ไม่พบ ${FULL_OUT} หรือ ${SHIP_OUT} — รันตัวสร้างก่อน (โหมดไม่ใส่ --self-test)`);
    return { passed: false, checks };
  }
  const full = JSON.parse(fs.readFileSync(FULL_OUT, 'utf8'));
  const ship = JSON.parse(fs.readFileSync(SHIP_OUT, 'utf8'));
  ok('files-exist', true, 'พบทั้งสองไฟล์');

  // ── 1. tpFirst + slFirst + timeout ต้องรวมเป็น 1 ± 1e-9 ทุกเซลล์ ทั้งสองไฟล์ ──
  {
    let bad = 0;
    let total = 0;
    for (const doc of [full, ship]) {
      for (const layer of ['symbol', 'timeframe', 'global']) {
        for (const [key, c] of Object.entries(doc.cells[layer])) {
          total++;
          if (Math.abs(c.tpFirstPct + c.slFirstPct + c.timeoutPct - 1) > 1e-9) {
            bad++;
            if (bad <= 3) ok(`sum-to-one:${layer}:${key}`, false, `รวมได้ ${c.tpFirstPct + c.slFirstPct + c.timeoutPct}`);
          }
        }
      }
    }
    ok('sum-to-one', bad === 0, `ตรวจ ${total} เซลล์ (สองไฟล์รวมกัน) — เกินคลาด ${bad}`);
  }

  // ── 2. ทุก n ในไฟล์ src ต้อง >= 30 และทุกเซลล์ต้องตรงกับรายงานเต็มทุกฟิลด์ ──
  {
    let small = 0;
    let mismatch = 0;
    let total = 0;
    const FIELDS = ['n', 'tpFirstPct', 'slFirstPct', 'timeoutPct', 'meanR', 'medianBarsHeld', 'spanYears', 'sourceTimeframe'];
    for (const layer of ['symbol', 'timeframe', 'global']) {
      for (const [key, c] of Object.entries(ship.cells[layer])) {
        total++;
        if (!(c.n >= MIN_N_SHIP)) small++;
        const f = full.cells[layer][key];
        if (!f || FIELDS.some((k) => !Object.is(f[k], c[k]))) mismatch++;
      }
    }
    ok('ship-min-n', small === 0, `เซลล์ในไฟล์ src ${total} เซลล์ · n < ${MIN_N_SHIP} มี ${small}`);
    ok('ship-matches-full', mismatch === 0, `เซลล์ src ที่ไม่ตรงกับรายงานเต็ม ${mismatch}/${total}`);
  }

  // ── 3. ชั้น fallback ต้องสอดคล้องกันเชิงโครงสร้าง (n ของชั้นบน = ผลรวมชั้นล่าง) ──
  {
    const sumBy = (cells, project) => {
      const m = new Map();
      for (const [key, c] of Object.entries(cells)) {
        const k = project(key);
        m.set(k, (m.get(k) ?? 0) + c.n);
      }
      return m;
    };
    // symbol → timeframe: ตัด symbol ทิ้งจากหัวคีย์
    const fromSymbol = sumBy(full.cells.symbol, (k) => k.split('|').slice(1).join('|'));
    let bad = 0;
    for (const [key, c] of Object.entries(full.cells.timeframe)) {
      if (fromSymbol.get(key) !== c.n) bad++;
    }
    // timeframe → global: ตัด strength ทิ้งจากท้ายคีย์
    const fromTf = sumBy(full.cells.timeframe, (k) => k.split('|').slice(0, 2).join('|'));
    for (const [key, c] of Object.entries(full.cells.global)) {
      if (fromTf.get(key) !== c.n) bad++;
    }
    ok('layer-consistency', bad === 0, `ชั้นที่ n ไม่เท่าผลรวมชั้นล่าง ${bad} เซลล์`);
  }

  // ── 4. ทุกเซลล์ชั้น symbol ต้องประกาศ sourceTimeframe ตรงกับ timeframe ในคีย์ ──
  {
    let bad = 0;
    for (const [key, c] of Object.entries(full.cells.symbol)) {
      if (key.split('|')[1] !== c.sourceTimeframe) bad++;
    }
    ok('source-timeframe', bad === 0, `เซลล์ที่ sourceTimeframe ไม่ตรงคีย์ ${bad}`);
  }

  // ── 5. สุ่ม 5 เซลล์ชั้น symbol คำนวณซ้ำด้วยโค้ดอิสระ — ต้องตรงเป๊ะทุกฟิลด์ ──
  //
  // "ตรงเป๊ะ" ทำได้จริงเพราะทั้งสองฝั่งบวก rNet ตามลำดับเวลาเดียวกันด้วยนิพจน์เดียวกัน
  // (เลขทศนิยมกำหนดผลตายตัวเมื่อลำดับการคำนวณเท่ากัน) และ JSON เก็บ double กลับมาได้ครบบิต
  {
    const keys = Object.keys(full.cells.symbol).sort();
    if (!keys.length) {
      ok('recompute-5-cells', false, 'รายงานเต็มไม่มีเซลล์ชั้น symbol เลย');
    } else {
      const rnd = deps.L.mulberry32(SELFTEST_SEED);
      const picked = [];
      const pool = [...keys];
      while (picked.length < Math.min(5, keys.length)) {
        picked.push(pool.splice((rnd() * pool.length) | 0, 1)[0]);
      }
      const FIELDS = ['n', 'tpFirstPct', 'slFirstPct', 'timeoutPct', 'meanR', 'medianBarsHeld', 'spanYears', 'sourceTimeframe'];
      const diffs = [];
      for (const key of picked) {
        const [symbol, tf, action, strength] = key.split('|');
        const mine = recomputeCellIndependently(deps, symbol, tf, action, strength);
        const theirs = full.cells.symbol[key];
        if (!mine) { diffs.push(`${key}: คำนวณซ้ำแล้วไม่ได้ไม้เลย`); continue; }
        for (const f of FIELDS) {
          if (!Object.is(mine[f], theirs[f])) diffs.push(`${key}.${f}: ซ้ำ ${mine[f]} · ไฟล์ ${theirs[f]}`);
        }
      }
      ok('recompute-5-cells', diffs.length === 0,
        diffs.length ? diffs.slice(0, 4).join(' | ') : `เทียบ ${picked.length} เซลล์: ${picked.join(' · ')}`);
    }
  }

  // ── 6. ป้าย scope ต้องอยู่ครบ — ไฟล์ที่ไม่มีป้ายคือไฟล์ที่รอวันถูกใช้ผิดวัตถุประสงค์ ──
  {
    ok('scope-label',
      full.scope?.includesResearchTestSplit === true && typeof ship.note === 'string' && ship.note.includes('ในอดีต'),
      'รายงานเต็มติดป้าย includesResearchTestSplit และไฟล์ src มี note กำกับ');
  }

  return { passed: checks.every((c) => c.pass), checks };
}

// ═══════════════════════════════ CLI ═══════════════════════════════

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
build-signal-evidence.mjs — ตารางความถี่ในอดีตของเซ็ตอัพสัญญาณ (สถิติบรรยาย ไม่ใช่งานวิจัย)

  (ไม่มีธง)            เดินเต็มช่วงแคชแล้วเขียนทั้งสองไฟล์
  --timeframes=1D,1H   จำกัดกรอบเวลา (ค่าเริ่มต้น 1D,1H)
  --symbols=A,B        จำกัด symbol (ใช้ตอนทดลอง — ผลจะไม่ถูกเขียนทับไฟล์จริง)
  --self-test          ตรวจไฟล์ที่เขียนไว้: สุ่ม 5 เซลล์คำนวณซ้ำด้วยโค้ดอิสระ ·
                       ทุกเซลล์รวมเป็น 1 · ทุก n ในไฟล์ src >= 30
`);
    return 0;
  }

  const V = await loadVetoLabProbe();
  const vetoDeps = await V.loadDeps(); // { L, gate, engine, vetoes } — vetoes ไม่ได้ใช้
  const deps = { L: vetoDeps.L, gate: vetoDeps.gate, engine: vetoDeps.engine, V };

  if (args['self-test']) {
    const res = await selfTest(deps);
    console.log('\n── self-test (ตรวจไฟล์ที่เขียนไว้จริง) ──');
    for (const c of res.checks) {
      console.log(`  ${c.pass ? 'ผ่าน  ' : 'ไม่ผ่าน'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
    }
    console.log(res.passed ? '\nself-test ผ่านครบทุกข้อ\n' : '\nself-test ไม่ผ่าน\n');
    return res.passed ? 0 : 1;
  }

  const timeframes = String(args.timeframes ?? DEFAULT_TFS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  for (const tf of timeframes) {
    if (!deps.L.MAX_HOLD_BARS[tf]) throw new Error(`ไม่รองรับกรอบเวลา ${tf}`);
  }
  const symbols = args.symbols ? String(args.symbols).split(',').map((s) => s.trim()).filter(Boolean) : null;

  const t0 = Date.now();
  const perTf = {};
  const allTrades = [];
  for (const tf of timeframes) {
    console.log(`\nเดินประวัติ ${tf} (เต็มช่วงแคช):`);
    const r = walkTimeframe(tf, deps, { symbols, quiet: !!args.quiet });
    perTf[tf] = {
      universe: r.universe,
      spanFirst: r.spanFirst,
      spanLast: r.spanLast,
      ...r.counts,
      trades: r.trades.length,
    };
    allTrades.push(...r.trades);
  }

  const cells = aggregateCells(allTrades);
  const { cells: shipCells, kept } = filterShippable(cells);
  const totalCells = countCells(cells);

  const scope = {
    kind: 'สถิติบรรยายของ product — ความถี่ในอดีตของเซ็ตอัพ ไม่ใช่การพยากรณ์และไม่ใช่ผลงานวิจัย',
    includesResearchTestSplit: true,
    warning: 'เดินเต็มช่วงแคชรวมช่วง test ของงานวิจัย — ห้ามใช้ตัวเลขชุดนี้ในการอ้างสิทธิ์เชิงวิจัย '
      + 'หรือเทียบกับรายงานใน scripts/research/reports อื่น ๆ ที่วัดบน train+validation เท่านั้น',
    edgeDisclosure: 'งานวิจัยของ repo นี้วัดแล้ว: ไม่มีเซ็ตอัพไหนพิสูจน์ edge หลังหักต้นทุนได้ '
      + 'ตัวเลขในตารางนี้จึงเป็นการบรรยายอดีต ไม่ใช่คำสัญญาว่าจะเกิดซ้ำ',
  };
  const method = {
    engine: 'src/lib/signal-engine.ts ตัวจริงผ่าน engine-lab (config เริ่มต้น = parity กับ production)',
    gate: 'src/lib/universe.ts · evaluateSignal() + SIGNAL_GATE ตัวจริง',
    entry: 'ราคาเปิดของแท่งถัดไปจากแท่งสัญญาณ',
    stopLoss: 'sig.stop_loss (ค่าจากสัญญาณจริง)',
    takeProfit: 'sig.take_profit (ค่าจากสัญญาณจริง)',
    slWinsOnSameBar: true,
    rDenominator: 'plannedRisk = |sig.entry_price − sig.stop_loss|',
    maxHoldBars: Object.fromEntries(timeframes.map((tf) => [tf, deps.L.MAX_HOLD_BARS[tf]])),
    costs: deps.L.COST_BPS,
    censoring: 'ไม้ที่ข้อมูลหมดก่อนครบเพดานถือ (dataEnd) ไม่ถูกนับใน n — ดู censoredDataEnd รายกรอบเวลา',
    walker: 'simulateTradeFromLevels ของ veto-lab.mjs (โหลดผ่าน probe — ตัวอักษรเดียวกับต้นฉบับ)',
    minNShip: MIN_N_SHIP,
    fifteenMinutes: '15m ไม่มีประวัติในแคช — ตัวอ่าน src/lib/signal-evidence.ts ถอยไปใช้ชั้น 1H และรายงาน sourceTimeframe ให้ UI บอกผู้ใช้ตรง ๆ',
  };

  const fullReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    scope,
    method,
    filteredBySymbols: symbols,
    timeframes: perTf,
    cellCounts: {
      symbol: Object.keys(cells.symbol).length,
      timeframe: Object.keys(cells.timeframe).length,
      global: Object.keys(cells.global).length,
      total: totalCells,
      shipped: kept,
    },
    cells,
  };

  // จำกัด --symbols คือโหมดทดลอง — ห้ามเขียนทับไฟล์จริงด้วยตารางบางส่วน
  if (symbols) {
    console.log(`\n[โหมดทดลอง --symbols] ไม่เขียนไฟล์ · เซลล์ ${totalCells} · ผ่านเกณฑ์ n>=${MIN_N_SHIP} ${kept}`);
    console.log(JSON.stringify(fullReport.cellCounts, null, 2));
    return 0;
  }

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(FULL_OUT, JSON.stringify(fullReport, null, 2), 'utf8');

  const shipped = {
    generatedAt: fullReport.generatedAt,
    // note นี้คือป้ายกำกับที่ตัวอ่านและ self-test อ้างถึง — แก้ถ้อยคำได้ แต่ต้องคงคำว่า "ในอดีต"
    note: 'ความถี่ "ในอดีต" ของเซ็ตอัพ SL/TP แบบเดียวกัน (เต็มช่วงแคช รวมช่วง test ของงานวิจัย) '
      + 'ไม่ใช่การพยากรณ์ — สร้างโดย scripts/research/build-signal-evidence.mjs · เฉพาะเซลล์ n >= ' + MIN_N_SHIP,
    minN: MIN_N_SHIP,
    cells: shipCells,
  };
  fs.writeFileSync(SHIP_OUT, JSON.stringify(shipped, null, 2), 'utf8');

  console.log(`\nเซลล์ทั้งหมด ${totalCells} (symbol ${fullReport.cellCounts.symbol} · timeframe ${fullReport.cellCounts.timeframe} · global ${fullReport.cellCounts.global})`);
  console.log(`ผ่านเกณฑ์ n >= ${MIN_N_SHIP} ลงไฟล์ src: ${kept} เซลล์`);
  console.log(`เขียน ${FULL_OUT}`);
  console.log(`เขียน ${SHIP_OUT}`);
  console.log(`ใช้เวลา ${((Date.now() - t0) / 1000).toFixed(1)} วิ`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\n[build-signal-evidence ล้ม] ${err?.stack ?? err}\n`);
    process.exit(1);
  });
