#!/usr/bin/env node
/**
 * fast-lane-lab.mjs — ตอบคำถามเดียว: "เข้าเร็วออกเร็วบนทอง 15m ทำได้จริงแค่ไหน"
 *
 * ═══════════════════════════════ คำถามที่ไฟล์นี้ตอบ ═══════════════════════════════
 *
 * เจ้าของสั่งเมื่อ 2026-09-01 ว่า "เน้นสัญญาณ TF เล็ก ๆ เข้าเร็วออกเร็ว"
 * คำสั่งนั้นแปลเป็นปุ่มสองปุ่มที่มีอยู่จริงในโค้ด:
 *   · หน้าต่างกันซ้ำ  DEDUPE_HOURS_15M   (scripts/scan-universe.mjs)  = "เข้าเร็ว" (ถี่แค่ไหน)
 *   · เพดานถือ        MAX_HOLD_BARS['15m'] (scripts/resolve-signals.mjs) = "ออกเร็ว" (ตัดจบเมื่อไร)
 * ไฟล์นี้กวาดสองปุ่มนั้นเป็นตาราง แล้วรายงานว่าแต่ละช่องให้อะไร
 *
 * ⚠ ไฟล์นี้ **ไม่แก้ค่าจริงทั้งสองตัว** — งานนี้คือ "วัดแล้วเสนอ" เจ้าของตัดสินใจเอง
 *
 * ═══════════════ สิ่งที่ต้องรู้ก่อนอ่านตัวเลขทุกตัวในไฟล์นี้ ═══════════════
 *
 * ทองบน 15m วัดจากแท่งสด 1,960 แท่ง (2026-08-02 → 2026-09-01):
 *   ATR(14) = 6.386 จุด = 0.143% ของราคา (ราคา 4,475.60)
 *
 * แต่เพดานต้นทุน MAX_COST_R = 0.05 บังคับให้ SL กว้างอย่างน้อย
 *   3 bps / 10000 / 0.05 = 0.60% = 26.85 จุด = **4.2 เท่าของ ATR 15m**
 *
 * และราคาต้องเดินถึงระยะนั้น: ค่ากลาง 21 แท่ง (5.3 ชม.) · p25 12 แท่ง · p75 36 แท่ง
 *
 * นี่คือความขัดแย้งกลางของงานนี้ และมันเป็นเรขาคณิต ไม่ใช่ความเห็น:
 *   **"เข้าเร็ว" ทำได้ (กดหน้าต่างกันซ้ำลง สัญญาณเด้งถี่ขึ้นทันที)
 *     แต่ "ออกเร็ว" ทำไม่ได้ ตราบใดที่เพดานต้นทุนยังบังคับ SL ให้กว้าง 4.2 ATR**
 * ถ้าอยากออกเร็วจริงต้องบีบ SL ซึ่งแปลว่าจ่ายแพงขึ้นตรง ๆ:
 *   SL 0.30% → ต้นทุน 0.100 R/ไม้ · SL 0.15% → 0.200 R/ไม้ (เพดานปัจจุบันคือ 0.050 R)
 *
 * ═══════════════ ผลวิจัยที่มีอยู่แล้ว — ห้ามลืมตอนอ่านตารางนี้ ═══════════════
 *
 * บน 1H: ขอบดิบ +0.0064 R/ไม้ · ต้นทุน 0.0948 R/ไม้ → **สุทธิ −0.0884 R/ไม้**
 * ทุกกฎติดลบ 21/21 ช่อง และไม่มีเทคนิคไหนรอด Holm-Bonferroni สักตัว
 * ไฟล์นี้จึงไม่ได้ถามว่า "เลน 15m ทำกำไรไหม" (คำตอบที่มีหลักฐานคือ ไม่)
 * มันถามว่า **"ถ้าจะเข้าเร็วออกเร็ว ราคาที่ต้องจ่ายคือเท่าไร และแยกออกจากศูนย์ได้ไหม"**
 *
 * ═══════════════════ เส้นฐานที่ทำให้ตารางนี้อ่านไม่ผิด ═══════════════════
 *
 * ตาราง meanR เปล่า ๆ อ่านไม่ได้ เพราะ meanR ของ "การเข้าไม้มั่ว ๆ ด้วยเรขาคณิตเดียวกัน"
 * ก็ไม่ใช่ศูนย์ — มันติดลบเท่ากับต้นทุนบวกความไม่สมมาตรของ SL/TP ที่ RR ≥ 2
 * ทุกช่องจึงมีคู่แฝดที่เข้าไม้ **ที่แท่งเดียวกันเป๊ะ ด้วยระยะ SL/TP เท่ากันเป๊ะ**
 * ต่างกันแค่ทิศทาง ซึ่งถูกกำหนดด้วยดัชนีคู่/คี่ (ไม่ดูข้อมูลอะไรเลย)
 *   → กฎจริงไม่ชนะเส้นฐานนี้ = สิ่งที่วัดได้คือเรขาคณิต ไม่ใช่ความสามารถทำนาย
 *
 * ═══════════════════ ทำไม cluster ตาม symbol ใช้ไม่ได้อีกแล้ว ═══════════════════
 *
 * rule-lab/veto-lab ใช้ bootstrapClusterStats() ที่ resample "ก้อน symbol"
 * เพราะไม้ใน symbol เดียวกันไม่เป็นอิสระต่อกัน แต่จักรวาลวันนี้เหลือ XAUUSD ตัวเดียว
 * → G = 1 → ทุกรอบ bootstrap หยิบก้อนเดิมกลับมา → CI กว้างศูนย์ → p ที่ดูมั่นใจจนน่ากลัว
 * (self-test ข้อ `cluster-by-symbol-degenerate` พิสูจน์ข้อนี้ด้วยการเรียกของจริง)
 *
 * ตัวแทนคือ **circular block bootstrap ตามเวลา**: resample เป็นบล็อกของไม้ที่ติดกัน
 * ตามลำดับเวลา ความยาวบล็อกต้องยาวอย่างน้อยเท่า "ระยะที่ไม้ซ้อนทับกันเชิงกลไก"
 * เพราะไม้ที่เปิดห่างกันไม่ถึงเพดานถือ กินแท่งชุดเดียวกัน จึงสัมพันธ์กันโดยโครงสร้าง
 * ไม่ใช่โดยบังเอิญ — การสุ่มราย-ไม้จะให้ SE แคบเกินจริงแล้วเราจะประกาศชัยชนะปลอม
 *
 * ═══════════════════════ สิ่งที่ไฟล์นี้ใช้ซ้ำจากของเดิม ═══════════════════════
 *
 * · rule-lab.mjs (ผ่าน audit-rule-lab-probe) → loadRawBars · computeIndicators ·
 *   costRFor · COST_BPS · WARMUP_BARS · mulberry32 · percentileOfSorted ·
 *   simulateTrade (ใช้เทียบ parity) · bootstrapClusterStats (ใช้พิสูจน์ว่ามันพังที่ G=1)
 * · engine-lab.mjs      → generateSignal ตัวจริง
 * · src/lib/universe.ts → evaluateSignal / SIGNAL_GATE (ประตูจริง รวม perTimeframe ของ 15m)
 * · src/lib/costs.ts    → applyStopFloor / MAX_COST_R (ชั้นนโยบายจริงของเลน 15m)
 * · veto-lab.mjs        → รูปแบบ simulateTradeFromLevels (ลอกมาทั้งดุ้น ดูหมายเหตุที่ฟังก์ชัน)
 *
 * ═════════════════════ ลำดับที่ต้องตรงกับ production เป๊ะ ═════════════════════
 *
 * scan-universe.mjs ทำตามลำดับนี้ (บรรทัด 821 → 943 → 958) และไฟล์นี้ทำตามเป๊ะ:
 *   1. generateSignal
 *   2. applyStopFloor  ← ของเลน 15m เท่านั้น · **ก่อน** ประตู ไม่ใช่หลัง
 *   3. กันซ้ำ ด้วยคีย์ symbol+action+timeframe
 *   4. ประตูคุณภาพ evaluateSignal
 * และนาฬิกากันซ้ำถูกตั้งใหม่ "เฉพาะใบที่ประตูรับ" เท่านั้น (seen.add อยู่ในลูป accepted)
 * ใบที่ตกประตูไม่กินหน้าต่างของใครเลย
 *
 * ────────────────────────────────── วิธีใช้ ──────────────────────────────────
 *
 *   node scripts/research/fast-lane-lab.mjs --self-test
 *   node scripts/research/fast-lane-lab.mjs
 *   node scripts/research/fast-lane-lab.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProbe } from './audit-rule-lab-probe.mjs';
import { loadSrcModules } from './load-src-modules.mjs';
import { loadLabEngine } from './engine-lab.mjs';
import { holm } from './holm.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(SELF_DIR, 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'fast-lane-lab.json');
const OUT_MD = path.join(REPORTS_DIR, 'fast-lane-summary.md');

/** เลนเดียวที่วัด — จักรวาลเหลือทองตัวเดียวตั้งแต่ 2026-08-29 */
const MARKET = 'GOLD';
const SYMBOL = 'XAUUSD';
const TIMEFRAME = '15m';
const BAR_MINUTES = 15;
const HOUR_MS = 3600_000;
const DAY_MS = 86400_000;

/** แกนที่ 1 — หน้าต่างกันซ้ำ (ชม.) · 20 = ค่าปัจจุบันใน scan-universe.mjs:94 */
const DEDUPE_GRID = [0, 1, 2, 4, 8, 20];
/** แกนที่ 2 — เพดานถือ (แท่ง) · 96 = ค่าปัจจุบันใน resolve-signals.mjs:71 = 24 ชม. */
const HOLD_GRID = [4, 8, 16, 24, 48, 96];

const DEFAULT_B = 4000;
const DEFAULT_SEED = 20260901;

// ═══════════════════════════════ ตัวช่วยพิมพ์ ═══════════════════════════════

const n4 = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const pctS = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

function median(sorted) {
  if (!sorted.length) return null;
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

// ═══════════════════════════════ การโหลดของเดิม ═══════════════════════════════

/**
 * โหลดทุกอย่างที่ต้องใช้ซ้ำ — ทุกชิ้นต้องเป็น "ตัวจริง" ไม่ใช่สำเนาที่เขียนใหม่
 *
 * ถ้าชิ้นไหนโหลดไม่ได้ให้ล้มทันที ห้าม fallback ไปเดาเกณฑ์/เดาต้นทุนเอง เพราะค่าที่เดาเอง
 * แปลว่าตารางทั้งใบวัดระบบคนละตัวกับที่เจ้าของจะเจอจริงบนมือถือ
 */
async function loadDeps() {
  const L = await loadProbe();

  let mods;
  try {
    mods = await loadSrcModules(['src/lib/costs.ts', 'src/lib/universe.ts']);
  } catch (err) {
    throw new Error(
      `โหลด src/lib/{costs,universe}.ts ไม่สำเร็จ: ${err?.message ?? err}\n`
      + '  → หยุดที่นี่โดยตั้งใจ ประตูคุณภาพกับเพดานต้นทุนต้องเป็นตัวจริงเท่านั้น'
    );
  }
  for (const k of ['SIGNAL_GATE', 'gateForTimeframe', 'evaluateSignal']) {
    if (!mods.universe?.[k]) throw new Error(`src/lib/universe.ts ไม่ได้ export ${k} — โครงไฟล์เปลี่ยนไปแล้ว`);
  }
  for (const k of ['applyStopFloor', 'MAX_COST_R', 'minStopPctFor', 'costRFor']) {
    if (mods.costs?.[k] === undefined) throw new Error(`src/lib/costs.ts ไม่ได้ export ${k} — โครงไฟล์เปลี่ยนไปแล้ว`);
  }

  const engine = await loadLabEngine();
  return { L, gate: mods.universe, costs: mods.costs, engine };
}

// ═══════════════════════════════ การเดินไม้ ═══════════════════════════════

/**
 * เดินไม้หนึ่งไม้ด้วย SL/TP ที่ "สัญญาณกำหนดมา" แทนเรขาคณิตตายตัว
 *
 * ลูปข้างในลอกจาก simulateTrade ของ rule-lab.mjs ทั้งดุ้น (ผ่านทาง veto-lab.mjs ซึ่งลอก
 * ไปก่อนแล้ว) — ลำดับตรวจ SL ก่อน TP, การนับ mfe/mae, การปิดที่ราคาปิดเมื่อชนเพดานถือ,
 * การแยก timeout/dataEnd เหมือนกันหมด สิ่งเดียวที่ต่างคือที่มาของ stop/target/risk
 * และ self-test ข้อ `simulator-parity` พิสูจน์ทีละไม้ว่าเมื่อป้อนเรขาคณิตของ rule-lab
 * กลับเข้าไป ผลตรงกันทุกฟิลด์
 *
 * ทำไมตัวหารเป็น riskPlanned ไม่ใช่ |ราคาเปิดจริง − SL|: riskPlanned คือระยะที่ผู้เทรด
 * ใช้คิดขนาดไม้ตอนกดสั่ง ส่วนระยะจริงถูก gap กินจนตัวหารเกือบศูนย์ได้ (บันทึกไว้ใน
 * report/metric-fix.md ตอนที่ lab.mjs เลือก planned เป็นค่าตั้งต้น)
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
    // timeout = "ชนเพดานถือจริง ๆ" · dataEnd = "ข้อมูลหมดก่อนถึงเพดาน"
    // สองอย่างนี้ต้องแยกกันเสมอ เพราะ dataEnd คือไม้ที่ถูกตัดปลาย (censored) ด้วยขอบของ
    // ชุดข้อมูล ไม่ใช่ด้วยกติกา — ถ้ารวมกันจะอ่านผิดว่ากติกาทำงานทั้งที่ข้อมูลหมดต่างหาก
    exitReason = lastIdx === entryIdx + maxHold - 1 ? 'timeout' : 'dataEnd';
    exitIdx = lastIdx;
  }

  const rawR = isLong ? (exitPrice - entry) / risk : (entry - exitPrice) / risk;

  // ต้นทุนคิดด้วย costRFor ตัวเดิมของ rule-lab เป๊ะ ๆ แต่ป้อน stop สังเคราะห์ที่ห่างจาก
  // ราคาเข้าเท่ากับ riskPlanned — เพราะ costR ต้องหารด้วย "ตัวหารเดียวกับ R" ไม่งั้น
  // ต้นทุนกับกำไรจะอยู่คนละหน่วย
  const stopForCost = isLong ? entry - risk : entry + risk;
  const costR = L.costRFor(entry, stopForCost, symbol, market);
  if (costR === null) return null;

  return {
    side,
    signalIdx,
    entryIdx,
    exitIdx,
    entryTime: bars[entryIdx].timestamp,
    exitTime: bars[exitIdx].timestamp,
    entryTs: bars[entryIdx].ts,
    exitTs: bars[exitIdx].ts,
    entry,
    stop,
    target,
    risk,
    riskRealized: Math.abs(entry - stop),
    exitPrice,
    exitReason,
    barsHeld: exitIdx - entryIdx + 1,
    heldHours: (bars[exitIdx].ts - bars[entryIdx].ts) / HOUR_MS + BAR_MINUTES / 60,
    rawR,
    costR,
    rNet: rawR - costR,
    mfeR: Number.isFinite(mfe) ? mfe : null,
    maeR: Number.isFinite(mae) ? mae : null,
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
 * ชั้นนโยบายต้นทุนของเลน 15m — สำเนาความหมายของ applyCostPolicy() ใน scan-universe.mjs
 *
 * เรียก applyStopFloor ตัวจริงจาก src/lib/costs.ts ไม่ได้เขียนสูตรใหม่
 * ⚠ ถ้าไม่ทำขั้นนี้ ตัวเลขทั้งตารางจะไม่ตรงกับที่เจ้าของเจอจริง เพราะเลน 15m ของจริง
 *   ถูกขยาย SL ก่อนถึงประตูเสมอ (และการขยายเปลี่ยนทั้ง R, ทั้งต้นทุน, ทั้งเวลาถือ)
 */
function applyCostPolicy(costs, sig) {
  const floored = costs.applyStopFloor(sig.entry_price, sig.stop_loss, sig.take_profit, sig.symbol, sig.market);
  if (floored && floored.widenedBy > 1) {
    return {
      signal: { ...sig, stop_loss: floored.stop_loss, take_profit: floored.take_profit },
      widenedBy: floored.widenedBy,
    };
  }
  return { signal: sig, widenedBy: 1 };
}

/**
 * เดินทุกแท่ง → รายการสัญญาณที่ผ่านประตูจริง เรียงตามเวลา
 *
 * ยังไม่กันซ้ำและยังไม่เดินไม้ที่นี่ เพราะทั้งสองอย่างเป็นแกนของตาราง
 * (กันซ้ำขึ้นกับลำดับสัญญาณอย่างเดียว · การเดินไม้ขึ้นกับเพดานถืออย่างเดียว)
 * แยกออกมาแบบนี้ทำให้เรียก generateSignal แค่รอบเดียว ไม่ใช่ 36 รอบ
 */
function buildSignals({ L, gate, costs, engine }, bars) {
  const counts = {
    decisions: 0,
    engineNull: 0,
    hold: 0,
    directional: 0,
    stopWidened: 0,
    gatePassed: 0,
    gateRejected: 0,
    rejectByCode: {},
  };
  const signals = [];
  const widenFactors = [];
  const stopPcts = [];

  // prefix โตทีละแท่ง ไม่ slice ใหม่ — เร็วกว่าและพิสูจน์ได้ว่าไม่มีการเผลอส่งแท่งอนาคต
  const prefix = [];
  for (let t = 0; t < L.WARMUP_BARS && t < bars.length; t++) prefix.push(bars[t]);

  const last = bars.length - 2; // ต้องมีแท่งถัดไปให้เข้าไม้เสมอ
  for (let t = L.WARMUP_BARS; t <= last; t++) {
    while (prefix.length < t + 1) prefix.push(bars[prefix.length]);

    const raw = engine.generateSignal({
      symbol: SYMBOL, name: SYMBOL, market: MARKET, candles: prefix, timeframe: TIMEFRAME,
    });
    counts.decisions++;
    if (!raw) { counts.engineNull++; continue; }
    if (raw.action !== 'BUY' && raw.action !== 'SELL') { counts.hold++; continue; }
    counts.directional++;

    // ── ลำดับตรงกับ production: ขยาย SL ก่อน แล้วค่อยเข้าประตู ──
    const { signal: sig, widenedBy } = applyCostPolicy(costs, raw);
    if (widenedBy > 1) { counts.stopWidened++; widenFactors.push(widenedBy); }

    const verdict = gate.evaluateSignal(sig);
    if (!verdict.passed) {
      counts.gateRejected++;
      for (const r of verdict.rejections) counts.rejectByCode[r.code] = (counts.rejectByCode[r.code] ?? 0) + 1;
      continue;
    }
    counts.gatePassed++;
    stopPcts.push(verdict.stopDistancePct);

    signals.push({
      t,
      ts: bars[t].ts,
      timestamp: bars[t].timestamp,
      action: sig.action,
      side: sig.action === 'BUY' ? 'long' : 'short',
      entrySignal: sig.entry_price,
      stop: sig.stop_loss,
      target: sig.take_profit,
      riskPlanned: Math.abs(sig.entry_price - sig.stop_loss),
      rewardPlanned: Math.abs(sig.take_profit - sig.entry_price),
      widenedBy,
      strength: sig.strength,
      confidence: sig.confidence,
      riskReward: verdict.riskReward,
      stopDistancePct: verdict.stopDistancePct,
    });
  }

  return { signals, counts, widenFactors, stopPcts };
}

// ═══════════════════════════ เส้นฐาน "ไม่รู้อะไรเลย" ═══════════════════════════

/**
 * ทิศทางของเส้นฐาน — สลับ long/short ตามดัชนีคู่/คี่ในลำดับสัญญาณทั้งหมด
 *
 * ทำไมผูกกับดัชนีของ "รายการเต็ม" ไม่ใช่ของ "รายการหลังกันซ้ำ": ถ้าผูกกับรายการหลังกรอง
 * เส้นฐานจะเปลี่ยนหน้าตาไปทุกช่องของตาราง แล้วเราจะเทียบข้ามช่องไม่ได้เลย
 * ผูกกับรายการเต็ม = เส้นฐานเป็น "จักรวาลคู่ขนานหนึ่งอัน" ที่ตายตัว ทุกช่องมองอันเดียวกัน
 *
 * ทำไมสลับแทนสุ่ม: สลับให้ long/short เท่ากันเป๊ะ (ต่างกันได้มากสุด 1 ไม้) จึงไม่มีทาง
 * ที่เส้นฐานจะ "บังเอิญเดาถูกทิศของเทรนด์เดือนนี้" ซึ่งเป็นความเสี่ยงจริงเมื่อข้อมูลมีเดือนเดียว
 * และทองเดือนนี้ขึ้นจาก 4,133 → 4,492 (+8.7%) — ถ้าเส้นฐานเอนไปทาง long มันจะชนะ
 * ด้วยเทรนด์เปล่า ๆ แล้วเราจะสรุปผิดทั้งใบ
 */
function baselineSideFor(indexInAllSignals) {
  return indexInAllSignals % 2 === 0 ? 'long' : 'short';
}

/**
 * ระดับ SL/TP ของเส้นฐาน — ระยะเท่าเดิมเป๊ะ แต่วางตามทิศที่ดัชนีกำหนด
 * เก็บ riskPlanned/rewardPlanned เดิมไว้ทั้งคู่ → RR เท่ากัน · ต้นทุนต่อไม้เท่ากัน
 * สิ่งเดียวที่ต่างคือ "ทิศ" ซึ่งคือสิ่งเดียวที่เรากำลังทดสอบว่าเครื่องยนต์รู้จริงไหม
 */
function baselineLevels(sig, side) {
  const isLong = side === 'long';
  return {
    stop: isLong ? sig.entrySignal - sig.riskPlanned : sig.entrySignal + sig.riskPlanned,
    target: isLong ? sig.entrySignal + sig.rewardPlanned : sig.entrySignal - sig.rewardPlanned,
    riskPlanned: sig.riskPlanned,
  };
}

// ═══════════════════════════════ การกันซ้ำ ═══════════════════════════════

/**
 * กันซ้ำแบบเดียวกับ scan-universe.mjs — คืนดัชนีของสัญญาณที่ "รอด"
 *
 * กติกาจริงสองข้อที่คนมักลอกผิด:
 *   1. คีย์รวม action ด้วย (`user:symbol:action:timeframe`) → BUY กับ SELL มีนาฬิกาคนละเรือน
 *      ตัดสองทางด้วยนาฬิกาเรือนเดียวคือการทำให้ตัวเลขถี่น้อยกว่าความจริงเกือบครึ่ง
 *   2. นาฬิกาถูกตั้งใหม่ "เฉพาะใบที่ประตูรับ" (seen.add อยู่ในลูป selection.accepted)
 *      ที่นี่ signals มีแต่ใบที่ผ่านประตูแล้ว จึงตั้งนาฬิกาได้ทุกใบที่ผ่านการกันซ้ำ
 *
 * hours = 0 → ไม่กันเลย (ทุกใบผ่าน) ซึ่งคือขอบบนของความถี่ที่เลนนี้ทำได้จริง
 */
function applyDedupe(signals, hours) {
  if (!(hours > 0)) return signals.map((_, i) => i);
  const windowMs = hours * HOUR_MS;
  const lastByAction = new Map();
  const kept = [];
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    const prev = lastByAction.get(s.action);
    if (prev !== undefined && s.ts - prev < windowMs) continue;
    lastByAction.set(s.action, s.ts);
    kept.push(i);
  }
  return kept;
}

// ═══════════════════════════ สถิติของหนึ่งช่อง ═══════════════════════════

function summarise(trades, spanDays) {
  const n = trades.length;
  if (!n) {
    return {
      trades: 0, signalsPerDay: 0, meanRNet: null, meanRRaw: null, meanCostR: null,
      pctTp: null, pctSl: null, pctTimeout: null, pctDataEnd: null,
      medianHoldHours: null, medianHoldBars: null, winRate: null, totalRNet: 0, byExit: {},
    };
  }
  let sumNet = 0;
  let sumRaw = 0;
  let sumCost = 0;
  let wins = 0;
  const byExit = { tp: 0, sl: 0, timeout: 0, dataEnd: 0 };
  const holdHours = [];
  const holdBars = [];
  for (const t of trades) {
    sumNet += t.rNet;
    sumRaw += t.rawR;
    sumCost += t.costR;
    if (t.rNet > 0) wins++;
    byExit[t.exitReason] = (byExit[t.exitReason] ?? 0) + 1;
    holdHours.push(t.heldHours);
    holdBars.push(t.barsHeld);
  }
  holdHours.sort((a, b) => a - b);
  holdBars.sort((a, b) => a - b);
  return {
    trades: n,
    signalsPerDay: spanDays ? n / spanDays : null,
    meanRNet: sumNet / n,
    meanRRaw: sumRaw / n,
    meanCostR: sumCost / n,
    pctTp: byExit.tp / n,
    pctSl: byExit.sl / n,
    pctTimeout: byExit.timeout / n,
    pctDataEnd: byExit.dataEnd / n,
    medianHoldHours: median(holdHours),
    medianHoldBars: median(holdBars),
    winRate: wins / n,
    totalRNet: sumNet,
    byExit,
  };
}

// ═══════════════════════ อำนาจการทดสอบ (block bootstrap) ═══════════════════════

/**
 * ความยาวบล็อกขั้นต่ำที่ยอมรับได้ = จำนวนไม้ที่ซ้อนทับกันเชิงกลไก
 *
 * ไม้ i กับ j ซ้อนทับกันเมื่อช่วง [entryIdx, exitIdx] คาบเกี่ยวกัน — ไม้พวกนี้อ่านแท่ง
 * ชุดเดียวกัน ผลของมันจึงสัมพันธ์กันโดยโครงสร้าง ไม่ใช่โดยบังเอิญ ถ้าบล็อกสั้นกว่านี้
 * การ resample จะฉีกไม้ที่ผูกกันออกจากกัน แล้วคืน SE ที่แคบเกินจริง
 *
 * ใช้ค่ากลาง ไม่ใช่ค่าเฉลี่ย เพราะการกระจายมีหางขวายาว (ช่วงที่สัญญาณกระจุกกัน)
 * แล้วค่าเฉลี่ยจะถูกลากจนบล็อกยาวเกินจนตัวอย่างเหลือไม่กี่บล็อก
 */
function overlapBlockLength(trades) {
  if (trades.length < 2) return 1;
  const counts = [];
  for (let i = 0; i < trades.length; i++) {
    let c = 0;
    for (let j = 0; j < trades.length; j++) {
      if (trades[i].entryIdx <= trades[j].exitIdx && trades[j].entryIdx <= trades[i].exitIdx) c++;
    }
    counts.push(c);
  }
  counts.sort((a, b) => a - b);
  return Math.max(1, Math.round(median(counts)));
}

/**
 * circular block bootstrap ของค่าเฉลี่ย
 *
 * "circular" = ต่อปลายชุดกลับไปหาหัวชุด ทำให้ทุกไม้มีโอกาสถูกหยิบเท่ากัน
 * ถ้าใช้ moving block ธรรมดา ไม้ที่อยู่หัวและท้ายชุดจะถูกหยิบน้อยกว่าไม้ตรงกลาง
 * ซึ่งบิดค่าเฉลี่ยของ null อย่างเงียบ ๆ
 *
 * ⚠ การต่อวงกลมสร้าง "รอยต่อปลอม" หนึ่งจุด (ไม้สุดท้ายของเดือนต่อกับไม้แรกของเดือน)
 *   ยอมรับได้เพราะรอยต่อมีจุดเดียวจาก n จุด แต่ต้องรู้ว่ามันมีอยู่ ไม่ใช่ของฟรี
 */
function blockBootstrapMean(values, { B, seed, blockLen, mulberry32 }) {
  const n = values.length;
  if (n === 0) return null;
  const b = Math.max(1, Math.min(n, blockLen));
  const nBlocks = Math.ceil(n / b);
  const rnd = mulberry32(seed);

  const means = new Float64Array(B);
  for (let k = 0; k < B; k++) {
    let sum = 0;
    let count = 0;
    for (let g = 0; g < nBlocks; g++) {
      const start = (rnd() * n) | 0;
      for (let i = 0; i < b; i++) { sum += values[(start + i) % n]; count++; }
    }
    means[k] = sum / count;
  }

  let s = 0;
  let ss = 0;
  for (let k = 0; k < B; k++) { s += means[k]; ss += means[k] * means[k]; }
  const mu = s / B;
  const se = Math.sqrt(Math.max(0, ss / B - mu * mu));

  const sorted = Array.from(means).sort((a, b2) => a - b2);
  let le0 = 0;
  let ge0 = 0;
  for (const m of sorted) { if (m <= 0) le0++; if (m >= 0) ge0++; }

  return {
    B,
    blockLen: b,
    blocksPerSample: nBlocks,
    se,
    lo95: sorted[Math.max(0, Math.round((B - 1) * 0.025))],
    hi95: sorted[Math.max(0, Math.round((B - 1) * 0.975))],
    pTwoTailed: Math.min(1, 2 * Math.min(le0 / B, ge0 / B)),
    /**
     * ขนาดผลที่เล็กที่สุดที่ "แยกจากศูนย์ได้"
     * · atSignificance = 1.96 × SE — ผ่าน p<0.05 ได้ก็ต่อเมื่อผลจริงใหญ่เท่านี้ (อำนาจ ~50%)
     * · at80Power      = 2.80 × SE — (z_0.975 + z_0.80) ผลจริงต้องใหญ่เท่านี้ถึงจะจับได้ 80%
     *   ของเวลา ค่านี้คือค่าที่ควรใช้ตอบว่า "ข้อมูลเดือนเดียวพอไหม"
     */
    mdeAtSignificance: 1.96 * se,
    mdeAt80Power: 2.8016 * se,
  };
}

// ═══════════════════ เส้นฐานที่สอง: "ส่วนผสมทิศทาง" กับ "จังหวะเข้า" ═══════════════════

/**
 * permutation null ที่ตรึง "จำนวน long/short" ไว้เท่าเดิม แล้วสับว่าไม้ไหนได้ทิศไหน
 *
 * ทำไมต้องมีเส้นฐานที่สอง ทั้งที่โจทย์ขอแค่เส้นฐานคู่/คี่:
 *   เส้นฐานคู่/คี่ตอบว่า "ชนะการโยนเหรียญไหม" ซึ่งเดือนนี้ตอบง่ายเกินไป — ทองขึ้น 8.68%
 *   ในเดือนเดียว เครื่องยนต์เป็นสายตามเทรนด์ มันจึงออก BUY มากกว่า SELL แล้วชนะเหรียญ
 *   ด้วย "การเอนไปทางขึ้นในเดือนที่ขึ้น" เฉย ๆ ซึ่งเป็นความสามารถที่ข้อมูลเดือนเดียว
 *   ตรวจสอบไม่ได้เลย (เดือนหน้าทองลง ความสามารถนี้กลายเป็นหนี้ทันที)
 *
 * เส้นฐานนี้จึงถามคำถามที่แคบลงและตอบได้จริง:
 *   **"ถ้ารู้อยู่แล้วว่าเดือนนี้ต้อง long กี่ครั้ง short กี่ครั้ง การเลือกว่าจะ long
 *     ที่แท่งไหน ยังเพิ่มอะไรอีกไหม"**
 * นั่นคือ "จังหวะ" ล้วน ๆ ซึ่งเป็นสิ่งเดียวที่เครื่องยนต์อ้างว่าทำได้และตรวจได้ในเดือนเดียว
 *
 * @param rLong  R สุทธิถ้าไม้นั้นเป็น long  (ดัชนีตรงกับ rShort)
 * @param rShort R สุทธิถ้าไม้นั้นเป็น short
 * @param nLong  จำนวน long ที่ของจริงเลือก — ตรึงไว้ ไม่ให้ null ได้เปรียบ/เสียเปรียบ
 */
function mixPermutationTest({ rLong, rShort, nLong, observedMean, B, seed, mulberry32 }) {
  const n = rLong.length;
  if (n === 0) return null;
  const rnd = mulberry32(seed);
  const pool = new Array(n);
  for (let i = 0; i < n; i++) pool[i] = i;

  // ผลรวมถ้าทุกไม้เป็น short แล้วบวกส่วนต่างของไม้ที่ถูกเลือกให้เป็น long
  // เขียนแบบนี้เพื่อไม่ต้องวนทั้ง n ทุกรอบ — วนแค่ nLong ตัว
  let sumAllShort = 0;
  for (let i = 0; i < n; i++) sumAllShort += rShort[i];
  const delta = new Float64Array(n);
  for (let i = 0; i < n; i++) delta[i] = rLong[i] - rShort[i];

  let ge = 0;
  let sum = 0;
  let sumSq = 0;
  for (let b = 0; b < B; b++) {
    let s = sumAllShort;
    for (let i = 0; i < nLong; i++) {
      const j = i + ((rnd() * (n - i)) | 0);
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      s += delta[pool[i]];
    }
    const m = s / n;
    if (m >= observedMean - 1e-12) ge++;
    sum += m;
    sumSq += m * m;
  }
  const mu = sum / B;
  return {
    B,
    nLong,
    nShort: n - nLong,
    nullMean: mu,
    nullSd: Math.sqrt(Math.max(0, sumSq / B - mu * mu)),
    // (ge+1)/(B+1) ไม่ใช่ ge/B — สัดส่วนดิบให้ p = 0 ได้ ซึ่งเป็นไปไม่ได้เชิงความน่าจะเป็น
    // มันแปลว่า "เล็กกว่า 1/B" เท่านั้น (เหตุผลเดียวกับที่ veto-lab.mjs บันทึกไว้)
    pOneSided: (ge + 1) / (B + 1),
    timingEdge: observedMean - mu,
  };
}

// ═══════════════════════════ การประกอบตาราง ═══════════════════════════

function buildGrid(deps, bars, base, opts) {
  const { L } = deps;
  const spanDays = (bars.at(-1).ts - bars[0].ts) / DAY_MS;
  const { signals } = base;

  /**
   * เดินไม้ล่วงหน้าทั้ง "ถ้า long" และ "ถ้า short" ของทุกสัญญาณ ทุกเพดานถือ
   *
   * เคล็ดที่ทำให้ทุกขาเทียบกันได้: baselineLevels(s, s.side) ให้ระดับเดียวกับที่เครื่องยนต์
   * ส่งออกมาจริงเป๊ะ (เพราะ riskPlanned/rewardPlanned วัดจาก s.stop/s.target เอง)
   * ไม้ "จริง" จึงเป็นสมาชิกของตารางสองขานี้อยู่แล้ว ไม่ต้องเดินซ้ำ และไม่มีทางเพี้ยน
   * — self-test ข้อ `arms-reconstruct-real` พิสูจน์ข้อนี้ทีละไม้
   */
  const armsByHold = new Map();
  for (const hold of HOLD_GRID) {
    const asLong = new Array(signals.length).fill(null);
    const asShort = new Array(signals.length).fill(null);
    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];
      asLong[i] = simulateTradeFromLevels(L, bars, s.t, 'long', baselineLevels(s, 'long'), SYMBOL, MARKET, hold);
      asShort[i] = simulateTradeFromLevels(L, bars, s.t, 'short', baselineLevels(s, 'short'), SYMBOL, MARKET, hold);
    }
    armsByHold.set(hold, { asLong, asShort });
  }

  const rows = [];
  for (const dedupeHours of DEDUPE_GRID) {
    const keptIdx = applyDedupe(signals, dedupeHours);
    for (const hold of HOLD_GRID) {
      const { asLong, asShort } = armsByHold.get(hold);
      const idx = keptIdx.filter((i) => asLong[i] && asShort[i]);

      const real = idx.map((i) => (signals[i].side === 'long' ? asLong[i] : asShort[i]));
      const parity = idx.map((i) => (baselineSideFor(i) === 'long' ? asLong[i] : asShort[i]));
      const allLong = idx.map((i) => asLong[i]);
      const allShort = idx.map((i) => asShort[i]);

      const rs = summarise(real, spanDays);
      const bs = summarise(parity, spanDays);
      const ls = summarise(allLong, spanDays);
      const ss = summarise(allShort, spanDays);

      const nLong = idx.filter((i) => signals[i].side === 'long').length;
      const blockLen = overlapBlockLength(real);
      const seedCell = (dedupeHours * 7919) ^ (hold * 104729);

      const boot = blockBootstrapMean(real.map((t) => t.rNet), {
        B: opts.B, seed: opts.seed ^ seedCell, blockLen, mulberry32: L.mulberry32,
      });
      // ผลต่างจริง−เส้นฐาน วัดแบบจับคู่ (paired) เพราะสองขาเข้าไม้ที่แท่งเดียวกันเป๊ะ
      // การเทียบแบบไม่จับคู่จะทิ้งข้อมูลที่แพงที่สุดที่เรามี (ว่ามันเจอตลาดชุดเดียวกัน)
      const bootDiff = blockBootstrapMean(real.map((t, k) => t.rNet - parity[k].rNet), {
        B: opts.B, seed: (opts.seed ^ 0x5bf03635) ^ seedCell, blockLen, mulberry32: L.mulberry32,
      });
      const mix = mixPermutationTest({
        rLong: allLong.map((t) => t.rNet),
        rShort: allShort.map((t) => t.rNet),
        nLong,
        observedMean: rs.meanRNet,
        B: opts.B,
        seed: (opts.seed ^ 0x1a2b3c4d) ^ seedCell,
        mulberry32: L.mulberry32,
      });

      rows.push({
        dedupeHours,
        holdBars: hold,
        holdHoursCap: (hold * BAR_MINUTES) / 60,
        isCurrentConfig: dedupeHours === 20 && hold === 96,
        signalsPerDay: rs.signalsPerDay,
        trades: rs.trades,
        longShare: rs.trades ? nLong / rs.trades : null,
        pctTp: rs.pctTp,
        pctSl: rs.pctSl,
        pctTimeout: rs.pctTimeout,
        pctDataEnd: rs.pctDataEnd,
        meanRNet: rs.meanRNet,
        meanRRaw: rs.meanRRaw,
        meanCostR: rs.meanCostR,
        medianHoldHours: rs.medianHoldHours,
        medianHoldBars: rs.medianHoldBars,
        winRate: rs.winRate,
        totalRNet: rs.totalRNet,
        baseline: {
          what: 'ทิศสลับคู่/คี่ · แท่งเดียวกัน · เรขาคณิตเดียวกัน',
          trades: bs.trades,
          signalsPerDay: bs.signalsPerDay,
          meanRNet: bs.meanRNet,
          meanRRaw: bs.meanRRaw,
          meanCostR: bs.meanCostR,
          pctTp: bs.pctTp,
          pctSl: bs.pctSl,
          pctTimeout: bs.pctTimeout,
          pctDataEnd: bs.pctDataEnd,
          medianHoldHours: bs.medianHoldHours,
          winRate: bs.winRate,
        },
        // ขา long ล้วน / short ล้วน — ไว้ดูว่าที่ชนะเหรียญมาจาก "เดือนนี้ขึ้น" แค่ไหน
        alwaysLong: { meanRNet: ls.meanRNet, winRate: ls.winRate, pctTp: ls.pctTp },
        alwaysShort: { meanRNet: ss.meanRNet, winRate: ss.winRate, pctTp: ss.pctTp },
        vsBaseline: rs.meanRNet !== null && bs.meanRNet !== null ? rs.meanRNet - bs.meanRNet : null,
        beatsBaseline: rs.meanRNet !== null && bs.meanRNet !== null ? rs.meanRNet > bs.meanRNet : null,
        power: boot,
        powerDiff: bootDiff,
        mixNull: mix,
      });
    }
  }
  return { rows, spanDays };
}

// ═══════════════════════════════ self-test ═══════════════════════════════

const approxEq = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/**
 * ชุดตรวจของท่อทั้งท่อ — ข้อไหนไม่ผ่าน = exit code != 0
 *
 * ทุกข้อรันบนแท่งจริงชุดเดียวกับที่รายงานใช้ (ยกเว้นข้อที่ต้องใช้เคสมือ) เพราะเป้าหมายคือ
 * ตรวจ "ท่อจริง" ไม่ใช่ตรวจฟังก์ชันในสุญญากาศ
 */
async function selfTest(deps, opts) {
  const { L, costs } = deps;
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail ?? '' });

  const bars = L.loadRawBars(MARKET, SYMBOL, TIMEFRAME);
  ok('bars-loaded', bars.length > 1500,
    `${bars.length} แท่ง · ${bars[0].timestamp} → ${bars.at(-1).timestamp}`);

  // ── 1. ตัวคิด R เทียบเคสมือ ──────────────────────────────────────────────
  //
  // ทำไมต้องมีทั้งที่ rule-lab มี self-test อยู่แล้ว: ที่นี่ป้อน stop/target เป็น "ระดับราคา"
  // ไม่ใช่ตัวคูณ ATR ทางเดินโค้ดจึงคนละเส้น เคสมือชุดนี้ตรวจเส้นนั้นโดยเฉพาะ
  {
    const mk = (rows) => rows.map((r, i) => ({
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, i * 15)).toISOString(),
      ts: Date.UTC(2026, 0, 1, 0, i * 15),
      open: r[0], high: r[1], low: r[2], close: r[3], volume: 0,
    }));
    const errs = [];
    // ทอง 3 bps · entry 2000 · risk 20 → costR = (3/10000 × 2000)/20 = 0.03
    const WANT_COST = 0.03;
    const chk = (label, got, wantRaw, wantReason, wantBars) => {
      if (!got) { errs.push(`${label}: ไม่ได้ไม้`); return; }
      if (!approxEq(got.rawR, wantRaw, 1e-9)) errs.push(`${label}: rawR ${got.rawR} != ${wantRaw}`);
      if (!approxEq(got.costR, WANT_COST, 1e-12)) errs.push(`${label}: costR ${got.costR} != ${WANT_COST}`);
      if (!approxEq(got.rNet, wantRaw - WANT_COST, 1e-9)) errs.push(`${label}: rNet ผิด`);
      if (got.exitReason !== wantReason) errs.push(`${label}: exitReason ${got.exitReason} != ${wantReason}`);
      if (wantBars !== undefined && got.barsHeld !== wantBars) errs.push(`${label}: barsHeld ${got.barsHeld} != ${wantBars}`);
    };
    const lv = (stop, target) => ({ stop, target, riskPlanned: 20 });

    // A: long เข้า 2000 · SL 1980 · TP 2040 → ชน TP → rawR = +2
    chk('A/long-tp', simulateTradeFromLevels(L,
      mk([[1999, 1999, 1999, 1999], [2000, 2010, 1995, 2005], [2005, 2045, 2004, 2044]]),
      0, 'long', lv(1980, 2040), SYMBOL, MARKET, 20), 2, 'tp', 2);

    // B: long ชน SL → rawR = −1
    chk('B/long-sl', simulateTradeFromLevels(L,
      mk([[1999, 1999, 1999, 1999], [2000, 2010, 1995, 2005], [2005, 2006, 1970, 1975]]),
      0, 'long', lv(1980, 2040), SYMBOL, MARKET, 20), -1, 'sl', 2);

    // C: แท่งเดียวแตะทั้งคู่ → SL ชนะเสมอ (อนุรักษ์นิยม ตรงกับ resolve-signals.mjs)
    chk('C/both-sl-wins', simulateTradeFromLevels(L,
      mk([[1999, 1999, 1999, 1999], [2000, 2010, 1995, 2005], [2005, 2045, 1970, 2020]]),
      0, 'long', lv(1980, 2040), SYMBOL, MARKET, 20), -1, 'sl', 2);

    // D: ครบเพดาน 2 แท่งโดยไม่โดนอะไร → ปิดที่ราคาปิดของแท่งที่สอง 2010 → rawR = +0.5
    chk('D/timeout', simulateTradeFromLevels(L,
      mk([[1999, 1999, 1999, 1999], [2000, 2008, 1995, 2005], [2005, 2015, 2000, 2010], [1, 1, 1, 1]]),
      0, 'long', lv(1980, 2040), SYMBOL, MARKET, 2), 0.5, 'timeout', 2);

    // E: short เข้า 2000 · SL 2020 · TP 1960 → ชน TP → rawR = +2
    chk('E/short-tp', simulateTradeFromLevels(L,
      mk([[2001, 2001, 2001, 2001], [2000, 2005, 1990, 1995], [1995, 1996, 1955, 1958]]),
      0, 'short', lv(2020, 1960), SYMBOL, MARKET, 20), 2, 'tp', 2);

    // F: ข้อมูลหมดก่อนถึงเพดาน → ต้องเป็น dataEnd ไม่ใช่ timeout (สองอย่างนี้คนละเรื่อง)
    const f = simulateTradeFromLevels(L,
      mk([[1999, 1999, 1999, 1999], [2000, 2008, 1995, 2005], [2005, 2015, 2000, 2010]]),
      0, 'long', lv(1980, 2040), SYMBOL, MARKET, 96);
    if (!f || f.exitReason !== 'dataEnd') errs.push(`F/data-end: exitReason ${f && f.exitReason} != dataEnd`);

    // G: ต้นทุนต้องแพงขึ้นเมื่อ SL แคบลง — risk 6 → costR = (3/10000 × 2000)/6 = 0.1
    const g = simulateTradeFromLevels(L,
      mk([[1999, 1999, 1999, 1999], [2000, 2008, 1995, 2005], [2005, 2015, 2000, 2010]]),
      0, 'long', { stop: 1994, target: 2012, riskPlanned: 6 }, SYMBOL, MARKET, 2);
    if (!g || !approxEq(g.costR, 0.1, 1e-12)) errs.push(`G/cost-scales: costR ${g && g.costR} != 0.1`);

    ok('r-math-known-cases', errs.length === 0, errs.slice(0, 4).join(' · ') || 'ผ่านทั้ง 7 เคส (A–G)');
  }

  // ── 2. ตัวเดินไม้ตรงกับ rule-lab เมื่อป้อนเรขาคณิตเดิม ─────────────────────
  {
    try {
      const ind = L.computeIndicators(bars);
      const rnd = L.mulberry32(0x51ce55);
      const fields = ['entry', 'stop', 'target', 'risk', 'exitPrice', 'exitReason', 'exitIdx',
        'barsHeld', 'rawR', 'costR', 'rNet', 'mfeR', 'maeR', 'entryIdx', 'entryTime', 'exitTime'];
      let compared = 0;
      const diffs = [];
      for (let s = 0; s < 3000; s++) {
        const t = L.WARMUP_BARS + ((rnd() * (bars.length - 2 - L.WARMUP_BARS)) | 0);
        if (t < L.WARMUP_BARS || t > bars.length - 2) continue;
        const side = rnd() < 0.5 ? 'long' : 'short';
        const atr = ind.atr[t];
        const orig = L.simulateTrade(bars, t, side, atr, SYMBOL, MARKET, 96);
        let mine = null;
        const entryIdx = t + 1;
        if (entryIdx < bars.length && Number.isFinite(atr) && atr > 0) {
          const entry = bars[entryIdx].open;
          const risk = L.SL_ATR_MULT * atr;
          const isLong = side === 'long';
          mine = simulateTradeFromLevels(L, bars, t, side, {
            stop: isLong ? entry - risk : entry + risk,
            target: isLong ? entry + L.RR_TARGET * risk : entry - L.RR_TARGET * risk,
            riskPlanned: risk,
          }, SYMBOL, MARKET, 96);
        }
        if (orig === null && mine === null) continue;
        if (orig === null || mine === null) { diffs.push(`t=${t} ฝั่งหนึ่ง null`); continue; }
        compared++;
        for (const fl of fields) {
          if (!Object.is(orig[fl], mine[fl])) diffs.push(`t=${t} ${fl}: ${orig[fl]} != ${mine[fl]}`);
        }
        if (diffs.length >= 5) break;
      }
      ok('simulator-parity', diffs.length === 0 && compared > 500,
        `เทียบ ${compared} ไม้ · ต่างกัน ${diffs.length} จุด${diffs.length ? ` — ${diffs.slice(0, 3).join(' | ')}` : ''}`);
    } catch (err) {
      ok('simulator-parity', false, String(err?.message ?? err));
    }
  }

  // ── 3. causality ของตัวเดินไม้: แท่งหลังทางออกต้องไม่มีผลต่อผลลัพธ์ ────────
  //
  // ทดสอบด้วยการ "ทำลายอนาคต" ตรง ๆ: คัดลอกแท่งทั้งชุด แล้วเขียนทับทุกแท่งหลัง exitIdx
  // ด้วยราคาบ้า ๆ ถ้าผลไม้เปลี่ยนแม้แต่ฟิลด์เดียว แปลว่ามีการอ่านข้อมูลที่ยังไม่เกิด
  {
    try {
      const ind = L.computeIndicators(bars);
      const rnd = L.mulberry32(0xfeed01);
      const diffs = [];
      let checked = 0;
      for (let s = 0; s < 200 && diffs.length < 3; s++) {
        const t = L.WARMUP_BARS + ((rnd() * (bars.length - 200 - L.WARMUP_BARS)) | 0);
        const atr = ind.atr[t];
        if (!Number.isFinite(atr) || !(atr > 0)) continue;
        const entry = bars[t + 1].open;
        const risk = 1.5 * atr;
        const lv = { stop: entry - risk, target: entry + 2 * risk, riskPlanned: risk };
        const a = simulateTradeFromLevels(L, bars, t, 'long', lv, SYMBOL, MARKET, 96);
        if (!a) continue;
        checked++;
        const poisoned = bars.map((b, i) => (i > a.exitIdx
          ? { ...b, open: 1, high: 99999, low: 0.01, close: 1 }
          : b));
        const b2 = simulateTradeFromLevels(L, poisoned, t, 'long', lv, SYMBOL, MARKET, 96);
        for (const fl of ['exitIdx', 'exitReason', 'exitPrice', 'rawR', 'rNet', 'barsHeld', 'mfeR', 'maeR']) {
          if (!Object.is(a[fl], b2[fl])) diffs.push(`t=${t} ${fl}`);
        }
      }
      ok('trade-walker-causal', diffs.length === 0 && checked > 100,
        `ทำลายทุกแท่งหลังทางออกใน ${checked} ไม้ · ผลเปลี่ยน ${diffs.length} จุด`);
    } catch (err) {
      ok('trade-walker-causal', false, String(err?.message ?? err));
    }
  }

  // ── 4. สัญญาณฐานเป็น causal — เรียกซ้ำด้วย prefix อิสระต้องได้คำตอบเดิม ────
  //
  // slice ใหม่ทุกครั้ง = อาเรย์คนละก้อนกับ prefix ที่ใช้ตอนเดิน ถ้าผลไม่เท่าเดิม
  // แปลว่ามีสถานะค้างข้ามการเรียก หรือมีการอ่านแท่งหลัง t ซึ่งคือการมองอนาคต
  let base = null;
  try {
    base = buildSignals(deps, bars);
    ok('base-signals-built', base.signals.length >= 100,
      `จุดตัดสินใจ ${base.counts.decisions} → มีทิศทาง ${base.counts.directional}`
      + ` → ขยาย SL ${base.counts.stopWidened} → ผ่านประตู ${base.counts.gatePassed}`);
  } catch (err) {
    ok('base-signals-built', false, String(err?.message ?? err));
  }
  if (base && base.signals.length >= 100) {
    try {
      const rnd = L.mulberry32(0x0ca05a1);
      const bad = [];
      let checked = 0;
      for (let s = 0; s < 60; s++) {
        const sig = base.signals[(rnd() * base.signals.length) | 0];
        const fresh = deps.engine.generateSignal({
          symbol: SYMBOL, name: SYMBOL, market: MARKET,
          candles: bars.slice(0, sig.t + 1), timeframe: TIMEFRAME,
        });
        const withFloor = fresh ? applyCostPolicy(deps.costs, fresh).signal : null;
        const d = decisionOf(withFloor);
        checked++;
        if (!d || !decisionEqual(d, {
          action: sig.action, strength: sig.strength, confidence: sig.confidence,
          entry_price: sig.entrySignal, stop_loss: sig.stop, take_profit: sig.target,
        })) bad.push(`@${sig.t}`);
        if (bad.length >= 3) break;
      }
      ok('base-signal-causal', bad.length === 0 && checked >= 30,
        `เรียกซ้ำด้วย prefix อิสระ ${checked} จุด · ต่างจากเดิม ${bad.length}${bad.length ? ` (${bad.join(',')})` : ''}`);
    } catch (err) {
      ok('base-signal-causal', false, String(err?.message ?? err));
    }

    // ── 5. เพดานต้นทุนทำงานจริง — ไม่มีไม้ไหนแพงเกิน MAX_COST_R ─────────────
    try {
      let maxCost = 0;
      let worst = null;
      for (const s of base.signals) {
        const tr = simulateTradeFromLevels(L, bars, s.t, s.side,
          { stop: s.stop, target: s.target, riskPlanned: s.riskPlanned }, SYMBOL, MARKET, 96);
        if (tr && tr.costR > maxCost) { maxCost = tr.costR; worst = s; }
      }
      // เผื่อไว้ 2% เพราะ riskPlanned วัดจาก sig.entry_price (ราคาปิดแท่งสัญญาณ)
      // ส่วนต้นทุนคิดบนราคาเข้าจริง (ราคาเปิดแท่งถัดไป) สองค่านั้นห่างกันได้เล็กน้อย
      const cap = costs.MAX_COST_R * 1.02;
      ok('cost-cap-respected', maxCost <= cap,
        `ต้นทุนสูงสุด ${n4(maxCost)} R (เพดาน ${costs.MAX_COST_R} · เผื่อ 2% = ${n4(cap)})`
        + (worst ? ` · ไม้แพงสุด SL ห่าง ${n4(worst.stopDistancePct, 3)}%` : ''));
    } catch (err) {
      ok('cost-cap-respected', false, String(err?.message ?? err));
    }

    // ── 6. applyStopFloor รักษา RR และดันถึงขั้นต่ำจริง ─────────────────────
    try {
      const minPct = costs.minStopPctFor(SYMBOL, MARKET);
      const widened = base.signals.filter((s) => s.widenedBy > 1);
      const tooTight = base.signals.filter((s) => s.stopDistancePct / 100 < minPct - 1e-9);
      const rrOk = base.signals.every((s) => s.riskReward >= 1.2 - 1e-9);
      ok('stop-floor-applied', tooTight.length === 0 && rrOk && widened.length > 0,
        `ขั้นต่ำ ${pctS(minPct, 2)} · ขยายจริง ${widened.length}/${base.signals.length} ใบ`
        + ` · ใบที่ยังแคบกว่าขั้นต่ำ ${tooTight.length} · RR ผ่านเกณฑ์ 15m ทุกใบ ${rrOk}`);
    } catch (err) {
      ok('stop-floor-applied', false, String(err?.message ?? err));
    }

    // ── 7. เส้นฐานทำงานจริง ───────────────────────────────────────────────
    //
    // สามอย่างที่ต้องจริงพร้อมกัน ไม่งั้นเส้นฐานไม่ใช่เส้นฐาน:
    //   (ก) ทิศสลับเป๊ะ long/short ต่างกันไม่เกิน 1 ไม้ (ไม่เอนตามเทรนด์เดือนนี้)
    //   (ข) เรขาคณิตเหมือนต้นฉบับทุกไม้ — risk เท่ากัน · RR เท่ากัน · ต้นทุนเท่ากัน
    //   (ค) มันต้อง "ต่างจากขาจริง" จริง ๆ ไม่ใช่ก๊อปปี้ที่เผลอชี้กลับไปที่เดิม
    try {
      let longs = 0;
      let geomBad = 0;
      let sameSide = 0;
      for (let i = 0; i < base.signals.length; i++) {
        const s = base.signals[i];
        const bside = baselineSideFor(i);
        if (bside === 'long') longs++;
        if (bside === s.side) sameSide++;
        const lv = baselineLevels(s, bside);
        if (!approxEq(Math.abs(s.entrySignal - lv.stop), s.riskPlanned, 1e-6)) geomBad++;
        if (!approxEq(Math.abs(lv.target - s.entrySignal), s.rewardPlanned, 1e-6)) geomBad++;
        const dirOk = bside === 'long' ? (lv.stop < s.entrySignal && lv.target > s.entrySignal)
          : (lv.stop > s.entrySignal && lv.target < s.entrySignal);
        if (!dirOk) geomBad++;
      }
      const n = base.signals.length;
      const balanced = Math.abs(longs - (n - longs)) <= 1;
      const differs = sameSide > 0 && sameSide < n; // ต้องทับบ้าง ต่างบ้าง ไม่ใช่ 0% หรือ 100%
      ok('baseline-well-formed', balanced && geomBad === 0 && differs,
        `long ${longs} / short ${n - longs} (สมดุล ${balanced})`
        + ` · เรขาคณิตผิด ${geomBad} จุด · ทิศตรงกับขาจริง ${sameSide}/${n} (${pctS(sameSide / n)})`);
    } catch (err) {
      ok('baseline-well-formed', false, String(err?.message ?? err));
    }

    // ── 7ข. ขา long/short ที่ประกอบไว้ล่วงหน้า ต้องสร้างไม้จริงกลับมาได้เป๊ะ ──
    //
    // ตารางทั้งใบพิงสมมติฐานนี้: ไม้ "จริง" = ขา long ถ้าสัญญาณเป็น BUY, ขา short ถ้าเป็น SELL
    // ถ้าไม่จริง ทุกการเทียบ (เส้นฐาน · long ล้วน · permutation ส่วนผสม) จะเทียบคนละของ
    // โดยไม่มีใครเห็น เพราะตัวเลขยังออกมาสวยงามเหมือนเดิม
    try {
      const fields = ['entry', 'stop', 'target', 'risk', 'exitPrice', 'exitReason', 'exitIdx',
        'barsHeld', 'rawR', 'costR', 'rNet'];
      const diffs = [];
      for (const hold of [4, 96]) {
        for (let i = 0; i < base.signals.length && diffs.length < 5; i++) {
          const s = base.signals[i];
          const direct = simulateTradeFromLevels(L, bars, s.t, s.side,
            { stop: s.stop, target: s.target, riskPlanned: s.riskPlanned }, SYMBOL, MARKET, hold);
          const viaArm = simulateTradeFromLevels(L, bars, s.t, s.side,
            baselineLevels(s, s.side), SYMBOL, MARKET, hold);
          if (!direct || !viaArm) { diffs.push(`i=${i} null`); continue; }
          for (const f of fields) if (!Object.is(direct[f], viaArm[f])) diffs.push(`hold=${hold} i=${i} ${f}`);
        }
      }
      ok('arms-reconstruct-real', diffs.length === 0,
        `เทียบ ${base.signals.length * 2} ไม้ (เพดาน 4 และ 96) · ต่างกัน ${diffs.length} จุด`
        + (diffs.length ? ` — ${diffs.slice(0, 3).join(' | ')}` : ''));
    } catch (err) {
      ok('arms-reconstruct-real', false, String(err?.message ?? err));
    }

    // ── 7ค. permutation ส่วนผสมทิศทาง: ต้องให้ p กระจายแบนเมื่อทิศถูกสุ่มจริง ──
    //
    // ข้อนี้กันความผิดพลาดที่ร้ายที่สุดของเส้นฐานแบบ permutation: ถ้าท่อวัดเอนข้างเดียว
    // ตัวเลือกทิศที่ "ไม่รู้อะไรเลย" จะได้ p เล็กเองโดยอัตโนมัติ แล้วเราจะแจกใบรับรอง
    // ให้เครื่องยนต์ทั้งที่มันไม่ได้ทำอะไรเลย
    try {
      const hold = 96;
      const rL = [];
      const rS = [];
      for (const s of base.signals) {
        const a = simulateTradeFromLevels(L, bars, s.t, 'long', baselineLevels(s, 'long'), SYMBOL, MARKET, hold);
        const b2 = simulateTradeFromLevels(L, bars, s.t, 'short', baselineLevels(s, 'short'), SYMBOL, MARKET, hold);
        if (a && b2) { rL.push(a.rNet); rS.push(b2.rNet); }
      }
      const n = rL.length;
      const nLong = Math.round(n * 0.55);
      const ps = [];
      for (let trial = 0; trial < 30; trial++) {
        const rnd = L.mulberry32(0xc0ffee + trial * 7919);
        const pool = Array.from({ length: n }, (_, i) => i);
        let s = 0;
        for (let i = 0; i < n; i++) s += rS[i];
        for (let i = 0; i < nLong; i++) {
          const j = i + ((rnd() * (n - i)) | 0);
          const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
          s += rL[pool[i]] - rS[pool[i]];
        }
        const res = mixPermutationTest({
          rLong: rL, rShort: rS, nLong, observedMean: s / n, B: 1500,
          seed: (0xbeef + trial * 104729) >>> 0, mulberry32: L.mulberry32,
        });
        ps.push(res.pOneSided);
      }
      const mean = ps.reduce((a, b2) => a + b2, 0) / ps.length;
      const small = ps.filter((p) => p < 0.05).length / ps.length;
      ok('mix-null-uniform', mean > 0.35 && mean < 0.65 && small <= 0.2,
        `30 เมล็ด · p เฉลี่ย ${n4(mean, 3)} (ควรราว 0.5) · p<0.05 ${pctS(small, 0)} (ควร ≤ 20%)`);
    } catch (err) {
      ok('mix-null-uniform', false, String(err?.message ?? err));
    }

    // ── 8. positive control — ถ้าทิศ "รู้อนาคต" ต้องชนะเส้นฐานขาดลอย ────────
    //
    // ข้อนี้พิสูจน์ว่าเครื่องเทียบ "จริง vs เส้นฐาน" จับความสามารถทำนายได้จริงเมื่อมันมีอยู่
    // ถ้าข้อนี้ไม่ผ่าน แปลว่าตารางทั้งใบตอบว่า "ไม่ชนะ" ให้ทุกอย่างรวมถึงคนที่รู้อนาคต
    // ซึ่งจะทำให้ผลลบที่เราจะรายงานไม่มีความหมายอะไรเลย
    try {
      let oracleSum = 0;
      let fakeSum = 0;
      let n = 0;
      for (let i = 0; i < base.signals.length; i++) {
        const s = base.signals[i];
        const lo = simulateTradeFromLevels(L, bars, s.t, 'long',
          baselineLevels(s, 'long'), SYMBOL, MARKET, 96);
        const sh = simulateTradeFromLevels(L, bars, s.t, 'short',
          baselineLevels(s, 'short'), SYMBOL, MARKET, 96);
        if (!lo || !sh) continue;
        oracleSum += Math.max(lo.rNet, sh.rNet); // เลือกทิศที่ชนะ = โกงด้วยการรู้อนาคต
        const bside = baselineSideFor(i);
        fakeSum += (bside === 'long' ? lo : sh).rNet;
        n++;
      }
      const oracle = oracleSum / n;
      const fake = fakeSum / n;
      ok('positive-control-oracle', n > 100 && oracle - fake > 0.5,
        `ทิศที่รู้อนาคต meanR ${n4(oracle)} · เส้นฐาน ${n4(fake)} · ต่าง ${n4(oracle - fake)} (n=${n})`);
    } catch (err) {
      ok('positive-control-oracle', false, String(err?.message ?? err));
    }

    // ── 9. กันซ้ำ: ตรงกับกติกาของ scan-universe ───────────────────────────
    //
    // ⚠ สิ่งที่ **ไม่จริง** และเคยเขียนเป็นข้อตรวจไว้ผิด ๆ: "หน้าต่างยาวกว่าให้เซตย่อยของ
    //   หน้าต่างสั้นกว่า" — ไม่จริง เพราะนาฬิกาถูกตั้งใหม่คนละจุด เคสสั้นที่สุดที่หักล้าง:
    //     สัญญาณ BUY ที่ชั่วโมง 0, 3, 4
    //       หน้าต่าง 2 ชม. → เก็บ {0, 3}   (4−3 = 1 < 2 จึงถูกกัน)
    //       หน้าต่าง 4 ชม. → เก็บ {0, 4}   (3−0 = 3 < 4 จึงถูกกัน แล้วนาฬิกายังอยู่ที่ 0)
    //   {0,4} ไม่ใช่เซตย่อยของ {0,3} — ใบที่ 4 "โผล่มาใหม่" ตอนหน้าต่างยาวขึ้น
    //   ข้อนี้จึงตรวจสิ่งที่จริงจริง ๆ แทน: จำนวนไม่เพิ่มขึ้นเมื่อหน้าต่างยาวขึ้น
    //   (ตรวจครบทุกคู่ในตาราง ไม่ใช่แค่บางคู่) และเคสมือของกติกาที่ลอกมา
    try {
      const counts = DEDUPE_GRID.map((h) => ({ h, n: applyDedupe(base.signals, h).length }));
      let shrinks = true;
      for (let i = 1; i < counts.length; i++) if (counts[i].n > counts[i - 1].n) shrinks = false;
      const keepsAll = counts[0].h === 0 && counts[0].n === base.signals.length;

      // เคสมือ ก: BUY กับ SELL ต้องมีนาฬิกาคนละเรือน
      const synth = [
        { ts: 0, action: 'BUY' },
        { ts: 30 * 60_000, action: 'SELL' },   // คนละ action → ผ่าน แม้ห่างแค่ครึ่ง ชม.
        { ts: 45 * 60_000, action: 'BUY' },    // BUY ห่างจาก BUY แรก 45 นาที → ถูกกัน
        { ts: 3 * HOUR_MS, action: 'BUY' },    // ห่าง 3 ชม. > 2 ชม. → ผ่าน
      ];
      const handOk = JSON.stringify(applyDedupe(synth, 2)) === JSON.stringify([0, 1, 3]);

      // เคสมือ ข: เคสที่หักล้าง "เซตย่อย" ข้างบน — ต้องได้ {0,3} กับ {0,4} จริง ๆ
      const nest = [
        { ts: 0, action: 'BUY' },
        { ts: 3 * HOUR_MS, action: 'BUY' },
        { ts: 4 * HOUR_MS, action: 'BUY' },
      ];
      const notNested = JSON.stringify(applyDedupe(nest, 2)) === JSON.stringify([0, 1])
        && JSON.stringify(applyDedupe(nest, 4)) === JSON.stringify([0, 2]);

      ok('dedupe-matches-production', shrinks && keepsAll && handOk && notNested,
        counts.map((c) => `${c.h}ชม.=${c.n}`).join(' · ')
        + ` · จำนวนไม่เพิ่มเมื่อหน้าต่างยาวขึ้น ${shrinks}`
        + ` · เคสมือ BUY/SELL แยกนาฬิกา ${handOk} · เคสมือ "ไม่ใช่เซตย่อย" ${notNested}`);
    } catch (err) {
      ok('dedupe-matches-production', false, String(err?.message ?? err));
    }

    // ── 10. cluster ตาม symbol เสียแล้วจริง ๆ (เหตุผลที่ต้องเปลี่ยนไปใช้ block) ──
    try {
      const trades = base.signals.slice(0, 200).map((s) => {
        const tr = simulateTradeFromLevels(L, bars, s.t, s.side,
          { stop: s.stop, target: s.target, riskPlanned: s.riskPlanned }, SYMBOL, MARKET, 96);
        return tr ? { ...tr, symbol: SYMBOL } : null;
      }).filter(Boolean);
      const ci = L.bootstrapClusterStats(trades, { B: 500, seed: 1 });
      const zeroWidth = ci && approxEq(ci.lo95, ci.hi95, 1e-12);
      ok('cluster-by-symbol-degenerate', zeroWidth && ci.clusters === 1,
        `G=${ci?.clusters} · CI95 [${n4(ci?.lo95)}, ${n4(ci?.hi95)}] กว้างศูนย์ = ${zeroWidth}`
        + ' → ยืนยันว่าต้องใช้ block bootstrap ตามเวลาแทน');
    } catch (err) {
      ok('cluster-by-symbol-degenerate', false, String(err?.message ?? err));
    }
  }

  // ── 11. block bootstrap กว้างขึ้นจริงเมื่อข้อมูลสัมพันธ์กันตามเวลา ───────
  //
  // สร้าง AR(1) ที่สัมพันธ์กันแรง แล้วเทียบ SE ของบล็อกยาวกับบล็อกยาว 1 (= สุ่มราย-ไม้)
  // ถ้าบล็อกยาวไม่ให้ SE ที่กว้างกว่า แปลว่าเครื่องมือวัดอำนาจของเราไม่ได้ทำงาน
  // และเราจะรายงาน MDE ที่เล็กเกินจริง = อ้างว่าข้อมูลเดือนเดียวพอทั้งที่ไม่พอ
  {
    try {
      const n = 400;
      const rnd = L.mulberry32(0xa11ce);
      const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
      const ar = new Array(n);
      let x = 0;
      for (let i = 0; i < n; i++) { x = 0.9 * x + gauss(); ar[i] = x; }
      const iid = new Array(n);
      for (let i = 0; i < n; i++) iid[i] = gauss();

      const cfg = { B: 2000, seed: 7, mulberry32: L.mulberry32 };
      const arBlock = blockBootstrapMean(ar, { ...cfg, blockLen: 25 }).se;
      const arSingle = blockBootstrapMean(ar, { ...cfg, blockLen: 1 }).se;
      const iidBlock = blockBootstrapMean(iid, { ...cfg, blockLen: 25 }).se;
      const iidSingle = blockBootstrapMean(iid, { ...cfg, blockLen: 1 }).se;

      const catchesDependence = arBlock > arSingle * 2;
      const iidAgrees = Math.abs(iidBlock / iidSingle - 1) < 0.35;
      ok('block-bootstrap-catches-dependence', catchesDependence && iidAgrees,
        `AR(0.9): บล็อก 25 SE ${n4(arBlock)} vs ราย-ไม้ ${n4(arSingle)} (×${n4(arBlock / arSingle, 2)})`
        + ` · iid: ${n4(iidBlock)} vs ${n4(iidSingle)} (×${n4(iidBlock / iidSingle, 2)})`);
    } catch (err) {
      ok('block-bootstrap-catches-dependence', false, String(err?.message ?? err));
    }
  }

  return { passed: checks.every((c) => c.pass), checks };
}

// ═══════════════════════════════ รายงาน ═══════════════════════════════

function bestRow(rows) {
  // "ดีที่สุด" = meanR สุทธิสูงสุด **ในบรรดาช่องที่มีไม้พอจะพูดถึง**
  // เพดาน 30 ไม้ไม่ใช่เกณฑ์ทางสถิติ มันคือ "น้อยกว่านี้ค่าเฉลี่ยเป็นเสียงรบกวนล้วน ๆ"
  // และช่องที่ไม้น้อยมักโผล่มาเป็นแชมป์เสมอเพราะความแปรปรวนของค่าเฉลี่ยพองขึ้นตามที่ n เล็กลง
  const eligible = rows.filter((r) => r.trades >= 30 && r.meanRNet !== null);
  if (!eligible.length) return null;
  return eligible.reduce((a, b) => (b.meanRNet > a.meanRNet ? b : a));
}

function printGrid(rows) {
  const W = { d: 7, h: 6, spd: 8, n: 5, tp: 6, sl: 6, to: 8, net: 9, cost: 8, hold: 8, bl: 8, al: 9 };
  console.log('');
  console.log(`${padL('กันซ้ำ', W.d)} ${padL('ถือ', W.h)} ${padL('สัญ./วัน', W.spd)} ${padL('ไม้', W.n)}`
    + ` ${padL('%TP', W.tp)} ${padL('%SL', W.sl)} ${padL('%หมดเวลา', W.to)}`
    + ` ${padL('meanR สุทธิ', W.net)} ${padL('ต้นทุน R', W.cost)}`
    + ` ${padL('ถือจริง ชม.', W.hold)} ${padL('เหรียญ', W.bl)} ${padL('long ล้วน', W.al)}`);
  console.log('─'.repeat(Object.values(W).reduce((a, b) => a + b, 0) + 11));
  let lastD = null;
  for (const r of rows) {
    if (lastD !== null && r.dedupeHours !== lastD) console.log('');
    lastD = r.dedupeHours;
    const mark = r.isCurrentConfig ? ' ←ปัจจุบัน' : '';
    console.log(`${padL(`${r.dedupeHours}ชม.`, W.d)} ${padL(`${r.holdBars}`, W.h)}`
      + ` ${padL(n4(r.signalsPerDay, 2), W.spd)} ${padL(r.trades, W.n)}`
      + ` ${padL(pctS(r.pctTp), W.tp)} ${padL(pctS(r.pctSl), W.sl)}`
      + ` ${padL(pctS((r.pctTimeout ?? 0) + (r.pctDataEnd ?? 0)), W.to)}`
      + ` ${padL(n4(r.meanRNet), W.net)} ${padL(n4(r.meanCostR), W.cost)}`
      + ` ${padL(n4(r.medianHoldHours, 2), W.hold)} ${padL(n4(r.baseline.meanRNet), W.bl)}`
      + ` ${padL(n4(r.alwaysLong.meanRNet), W.al)}${mark}`);
  }
  console.log('');
}

/**
 * ตารางหลักของรายงาน — ทุกแถวมี "สัญญาณ/วัน" และ "ไม้" อยู่ก่อน meanR เสมอโดยตั้งใจ
 * (ข้อบังคับของโจทย์ และเป็นข้อบังคับที่ถูก: meanR ที่ไม่มีสองค่านั้นอยู่ข้าง ๆ อ่านไม่ได้)
 * เส้นฐานสามขาเรียงติดกันเพื่อให้เห็นทันทีว่า "ชนะเหรียญ" กับ "แพ้ long ล้วน" อยู่บรรทัดเดียวกัน
 */
function mdTable(rows) {
  const cols = ['กันซ้ำ (ชม.)', 'เพดานถือ (แท่ง)', 'สัญญาณ/วัน', 'ไม้', '%BUY', '%TP', '%SL',
    '%หมดเวลา', '%ข้อมูลหมด', 'meanR สุทธิ', 'meanR ดิบ', 'ต้นทุน (R)', 'ถือจริง p50 (ชม.)',
    'ฐาน: เหรียญ', 'ฐาน: long ล้วน', 'ฐาน: short ล้วน', 'จริง−เหรียญ', 'จังหวะ', 'p จังหวะ (Holm)'];
  const head = `| ${cols.join(' | ')} |`;
  const sep = `|${' ---: |'.repeat(cols.length)}`;
  const body = rows.map((r) => {
    const tag = r.isCurrentConfig ? ' **←ปัจจุบัน**' : '';
    return `| ${r.dedupeHours}${tag} | ${r.holdBars} | ${n4(r.signalsPerDay, 2)} | ${r.trades}`
      + ` | ${pctS(r.longShare, 0)} | ${pctS(r.pctTp)} | ${pctS(r.pctSl)}`
      + ` | ${pctS(r.pctTimeout)} | ${pctS(r.pctDataEnd)}`
      + ` | ${n4(r.meanRNet)} | ${n4(r.meanRRaw)} | ${n4(r.meanCostR)} | ${n4(r.medianHoldHours, 2)}`
      + ` | ${n4(r.baseline.meanRNet)} | ${n4(r.alwaysLong.meanRNet)} | ${n4(r.alwaysShort.meanRNet)}`
      + ` | ${n4(r.vsBaseline)} | ${n4(r.mixNull.timingEdge)} | ${n4(r.holmMixNull.pAdjusted, 3)} |`;
  });
  return [head, sep, ...body].join('\n');
}

function buildReport(report) {
  const g = report.grid;
  const cur = g.find((r) => r.isCurrentConfig);
  const open = g.find((r) => r.dedupeHours === 0 && r.holdBars === 96);
  const fast = g.find((r) => r.dedupeHours === 20 && r.holdBars === 4);
  const best = bestRow(g);
  const b = report.base;
  const mt = report.multipleTesting;

  const beats = g.filter((r) => r.beatsBaseline === true).length;
  const alBeats = g.filter((r) => r.alwaysLong.meanRNet > r.meanRNet).length;
  const alBeatsLong = g.filter((r) => r.holdBars >= 16 && r.alwaysLong.meanRNet > r.meanRNet).length;
  const longHoldCells = g.filter((r) => r.holdBars >= 16).length;
  const timingPos = g.filter((r) => r.mixNull.timingEdge > 0).length;
  const timingBig = g.filter((r) => r.mixNull.timingEdge > r.powerDiff.mdeAt80Power).length;
  const positives = g.filter((r) => r.meanRNet > 0).length;

  const mdes = g.filter((r) => r.trades >= 30).map((r) => r.power.mdeAt80Power);
  const mdeLo = Math.min(...mdes);
  const mdeHi = Math.max(...mdes);
  const minAdjMix = Math.min(...g.map((r) => r.holmMixNull.pAdjusted));
  const minAdjBase = Math.min(...g.map((r) => r.holmVsBaseline.pAdjusted));
  const drift = (report.data.lastClose / report.data.firstClose - 1) * 100;
  const nNeeded = Math.round((cur.power.mdeAt80Power / report.priorEvidence.oneHourRawEdge) ** 2);

  return `# เข้าเร็วออกเร็วบนทอง 15m — วัดแล้วเท่าไร

สร้างเมื่อ ${report.generatedAt} · ผลดิบ \`scripts/research/reports/fast-lane-lab.json\`
เครื่องมือ \`scripts/research/fast-lane-lab.mjs\` (ใช้เวลา ${(report.elapsedMs / 1000).toFixed(1)} วินาที)

ข้อมูล: **XAUUSD 15m ${report.data.bars} แท่ง** ${report.data.first} → ${report.data.last}
(${report.data.spanDays.toFixed(2)} วัน · ${report.data.tradingDaysNote})

> **ไม่มีชุด test กันไว้เลย** — Yahoo ให้ 15m ย้อนหลังสูงสุด 1 เดือน ทุกตัวเลขในรายงานนี้
> เป็น in-sample ล้วน ๆ ต่างจาก 1D/1H ที่มี \`report/split.json\` แบ่ง 60/20/20 ไว้

---

## คำตอบสั้น ๆ

**"เข้าเร็ว" ทำได้ทันทีด้วยปุ่มเดียว · "ออกเร็ว" ทำไม่ได้เพราะเรขาคณิต · และไม่มีอะไรพิสูจน์ว่าทำกำไร**

### 1. เข้าเร็ว = ปุ่มเดียว และมันแรงมาก

ปิดการกันซ้ำ (0 ชม.) ให้ **${n4(open.signalsPerDay, 2)} สัญญาณ/วัน** เทียบกับ **${n4(cur.signalsPerDay, 2)} สัญญาณ/วัน**
ที่ค่าปัจจุบัน (20 ชม.) — ต่างกัน **${(open.signalsPerDay / cur.signalsPerDay).toFixed(1)} เท่า**

และปุ่มนี้เป็นปุ่มเดียวจริง ๆ เพราะ **ประตูคุณภาพบน 15m ไม่ได้กรองอะไรเลย**:
ผ่าน ${b.gatePassed} จาก ${b.directional} = **${pctS(b.gatePassed / b.directional, 1)}** (ตกประตู ${b.gateRejected} ใบ)

### 2. ออกเร็วไม่ได้ — เพดานต้นทุนบังคับ SL ให้กว้าง 4.2 ATR

\`MAX_COST_R = 0.05\` ดัน SL ขั้นต่ำไปที่ 0.60% = 26.85 จุด = **4.2 เท่าของ ATR 15m (6.386 จุด)**
ราคาต้องใช้เวลาเดินถึงระยะนั้น (ค่ากลาง 21 แท่ง = 5.3 ชม.)

ผลคือที่เพดานถือ 4 แท่ง (1 ชม.) ไม้ที่ **จบตามแผนจริง ๆ มีแค่ ${pctS((fast.pctTp ?? 0) + (fast.pctSl ?? 0))}**
อีก ${pctS((fast.pctTimeout ?? 0) + (fast.pctDataEnd ?? 0))} หมดเวลาไปเฉย ๆ
การตัดเพดานให้สั้นลงจึงไม่ได้ทำให้ "ออกเร็ว" — มันแปลงไม้จาก "ชนะ/แพ้ตามแผน"
เป็น "ปิดที่ราคาตลาดกลางทาง" ซึ่งคือระบบคนละระบบ

### 3. เครื่องยนต์ชนะเหรียญ ${beats}/${g.length} ช่อง — แต่ชนะเพราะเดือนนี้ทองขึ้น ไม่ใช่เพราะเลือกจังหวะเก่ง

นี่คือส่วนที่สำคัญที่สุดของรายงาน และเป็นเหตุผลที่ต้องมีเส้นฐานสองชั้น

เส้นฐาน **คู่/คี่** (โยนเหรียญเลือกทิศ) แพ้เครื่องยนต์ ${beats} จาก ${g.length} ช่อง ซึ่งดูดีมาก
จนกระทั่งดูขา **"long ล้วน"** ที่วางไว้ข้าง ๆ:

- ทองเดือนที่วัดขึ้นจาก ${report.data.firstClose.toFixed(2)} → ${report.data.lastClose.toFixed(2)} = **${drift.toFixed(2)}% ในเดือนเดียว**
- เครื่องยนต์เป็นสายตามเทรนด์ จึงออก BUY **${pctS(open.longShare, 0)}** ของสัญญาณทั้งหมด
- ขา "long ล้วน" ทำได้ **${n4(open.alwaysLong.meanRNet)} R/ไม้** · ขา "short ล้วน" **${n4(open.alwaysShort.meanRNet)} R/ไม้**
- **ขา "long ล้วน" ชนะเครื่องยนต์จริง ${alBeats}/${g.length} ช่อง** (และ ${alBeatsLong}/${longHoldCells} ช่องเมื่อเพดานถือ ≥ 16 แท่ง)

แปลว่าสิ่งที่เครื่องยนต์ทำได้ดีกว่าเหรียญ คือ **"เอนไปทางขึ้นในเดือนที่ขึ้น"**
ไม่ใช่ "เลือกแท่งที่ควรเข้า" — และมันยัง **เอนได้แย่กว่าการ long ทุกไม้ไปเลย**

### 4. แยก "จังหวะ" ออกมาวัดตรง ๆ แล้วก็ไม่เหลืออะไร

เส้นฐานชั้นที่สองตรึงจำนวน BUY/SELL ไว้เท่าที่เครื่องยนต์เลือกจริง แล้วสับว่า
**ไม้ไหน**ได้ทิศไหน (permutation) → ตอบคำถามที่แคบลงว่า "เลือกจังหวะเก่งไหม เมื่อรู้ส่วนผสมแล้ว"

| | ชนะเหรียญ (คู่/คี่) | จังหวะ (ตรึงส่วนผสม) |
| --- | ---: | ---: |
| ช่องที่ผลเป็นบวก | ${beats}/${g.length} | ${timingPos}/${g.length} |
| ช่องที่ p ดิบ < 0.05 | ${mt.vsBaseline.rawBelow05}/${g.length} | ${mt.mixNull.rawBelow05}/${g.length} |
| **ช่องที่รอด Holm-Bonferroni** | **${mt.vsBaseline.survivors}/${g.length}** | **${mt.mixNull.survivors}/${g.length}** |
| p ที่ปรับแล้วเล็กที่สุด | ${n4(minAdjBase, 3)} | ${n4(minAdjMix, 3)} |
| ช่องที่ผลต่าง > MDE ของตัวเอง | 0/${g.length} | ${timingBig}/${g.length} |

**ไม่มีช่องไหนรอด Holm ในทั้งสองครอบครัว** และไม่มีช่องไหนที่ผลต่างใหญ่กว่า MDE ของตัวเอง
ที่ ${g.length} การทดสอบพร้อมกัน การเห็น p ดิบ < 0.05 ราว ${mt.vsBaseline.rawBelow05} ช่อง
เป็นสิ่งที่ต้องเกิดขึ้นอยู่แล้วโดยบังเอิญ (คาดไว้ ${(g.length * 0.05).toFixed(1)} ช่อง)

### 5. อำนาจการทดสอบไม่พอ — และไม่ใช่นิดหน่อย

MDE ที่ 80% power อยู่ระหว่าง **${n4(mdeLo, 3)}–${n4(mdeHi, 3)} R/ไม้** ขณะที่ขอบดิบที่ 1H
วัดได้ทั้งปีคือ **+${report.priorEvidence.oneHourRawEdge} R/ไม้** — เล็กกว่า MDE ${Math.round(mdeLo / report.priorEvidence.oneHourRawEdge)}–${Math.round(mdeHi / report.priorEvidence.oneHourRawEdge)} เท่า

**ผลลบทุกช่องในรายงานนี้จึงอ่านว่า "ยังไม่เห็น" ไม่ใช่ "พิสูจน์แล้วว่าไม่มี"**
และผลบวกทุกช่องอ่านว่า "แยกจากศูนย์ไม่ได้" ไม่ใช่ "ดี"

---

## ค่าปัจจุบันกับช่องที่ meanR ดีที่สุด — วางคู่กัน

| | กันซ้ำ | เพดานถือ | สัญญาณ/วัน | ไม้ | meanR สุทธิ | เหรียญ | long ล้วน | ถือจริง p50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **ค่าปัจจุบัน** | 20 ชม. | 96 แท่ง | ${n4(cur.signalsPerDay, 2)} | ${cur.trades} | ${n4(cur.meanRNet)} | ${n4(cur.baseline.meanRNet)} | ${n4(cur.alwaysLong.meanRNet)} | ${n4(cur.medianHoldHours, 2)} ชม. |
| **meanR ดีสุด (ไม้ ≥ 30)** | ${best.dedupeHours} ชม. | ${best.holdBars} แท่ง | ${n4(best.signalsPerDay, 2)} | ${best.trades} | ${n4(best.meanRNet)} | ${n4(best.baseline.meanRNet)} | ${n4(best.alwaysLong.meanRNet)} | ${n4(best.medianHoldHours, 2)} ชม. |

ช่อง "ดีที่สุด" มี meanR ${n4(best.meanRNet)} แต่ MDE ที่ 80% power ของมันคือ ${n4(best.power.mdeAt80Power)}
— **ค่าที่วัดได้เล็กกว่าสิ่งที่ข้อมูลชุดนี้มองเห็น ${(best.power.mdeAt80Power / Math.abs(best.meanRNet)).toFixed(1)} เท่า**
และขา "long ล้วน" ในช่องเดียวกันทำได้ ${n4(best.alwaysLong.meanRNet)} ซึ่ง${best.alwaysLong.meanRNet > best.meanRNet ? '**ดีกว่าเครื่องยนต์**' : 'แย่กว่าเครื่องยนต์'}

⚠ ห้ามเลือกช่องนี้ไปตั้งค่า — การเลือกช่องที่ดูดีที่สุดจาก ${g.length} ช่องบนข้อมูล in-sample
คือนิยามของการ fit บนเสียงรบกวน และไม่มีเครื่องมือไหนในรายงานนี้จับได้

---

## ประตูคุณภาพไม่ได้กรองอะไรเลยบน 15m

| ขั้น | จำนวน |
| --- | ---: |
| จุดตัดสินใจ (แท่งที่เรียกเครื่องยนต์) | ${b.decisions} |
| เครื่องยนต์คืน null (ข้อมูลไม่พอ) | ${b.engineNull} |
| HOLD | ${b.hold} |
| **มีทิศทาง (BUY/SELL)** | **${b.directional}** |
| ถูกขยาย SL ด้วย \`applyStopFloor\` | ${b.stopWidened} |
| **ผ่านประตู \`evaluateSignal\`** | **${b.gatePassed}** |
| ตกประตู | ${b.gateRejected} |

อธิบายได้ครบจากค่าใน \`SIGNAL_GATE.perTimeframe['15m']\` — ทุกด่านถูกทำให้ผ่านไปแล้วก่อนถึงมัน:

- \`minStrength: 'moderate'\` — เครื่องยนต์ให้ทิศทางก็ต่อเมื่อ netScore ≥ 3 ซึ่งทำให้ strength ≥ moderate อยู่แล้ว
- \`minConfidence: 55\` — confidence = 40 + totalScore×6 ≥ 58 เสมอเมื่อมีทิศทาง
- \`minRiskReward: 1.2\` — เครื่องยนต์บังคับ RR ≥ 2.0 ไว้ในตัวมันเอง (tpAtrMult/slAtrMult)
- \`minStopDistancePct: 0.15\` — \`applyStopFloor\` ดัน SL ถึง 0.60% ไปก่อนแล้ว

**ตัวคุมปริมาณแจ้งเตือนของเลน 15m จึงเป็นหน้าต่างกันซ้ำล้วน ๆ** ถ้ากดค่านั้นลง
จะไม่มีเกณฑ์คุณภาพชั้นไหนคอยรับไว้เลย นี่ไม่ใช่ข้อเสนอให้ขันเกณฑ์ (เจ้าของห้ามผ่อน
และงานนี้ก็ไม่ได้ขอให้ขัน) — เป็นการบอกว่าปุ่มที่กำลังจะกดไม่มีเบรกสำรอง

---

## ตารางเต็ม ${DEDUPE_GRID.length} × ${HOLD_GRID.length} ช่อง

ทุกแถวรายงาน **สัญญาณ/วัน และจำนวนไม้ ในแถวเดียวกับ meanR เสมอ** — meanR ที่ไม่มีสองค่านั้น
อยู่ข้าง ๆ อ่านไม่ได้ เพราะช่องที่ไม้เหลือน้อยจะมี meanR แกว่งแรงจนดูดีหรือดูแย่ได้ตามความบังเอิญ

คอลัมน์เส้นฐานสามขา ทุกขาเข้าไม้ **ที่แท่งเดียวกันเป๊ะ ระยะ SL/TP เท่ากันเป๊ะ RR เท่ากัน
ต้นทุนต่อไม้เท่ากัน** ต่างกันแค่ทิศ:

- **เหรียญ** — ทิศสลับคู่/คี่ (long/short เท่ากันเป๊ะ ไม่เอนตามเทรนด์)
- **long ล้วน** / **short ล้วน** — ขอบบน/ขอบล่างของ "ถ้าเดาทิศเดียวตลอดเดือน"

${mdTable(g)}

*(\`%หมดเวลา\` = ชนเพดานถือจริง ๆ · \`%ข้อมูลหมด\` = ไม้ที่เปิดใกล้ปลายชุดจนเดินไม่ครบเพดาน
ถูกปิดที่แท่งสุดท้ายที่มี — สองอย่างนี้แยกกันเสมอ เพราะอันหลังเป็นข้อจำกัดของข้อมูล ไม่ใช่ผลของกติกา)*

---

## อำนาจการทดสอบ (MDE) — ข้อมูลเดือนเดียวมองเห็นอะไรได้บ้าง

วิธี: **circular block bootstrap ตามเวลา** ${report.power.B} รอบ

**ทำไมไม่ใช่ cluster ตาม symbol** แบบที่ \`rule-lab\`/\`veto-lab\` ใช้: จักรวาลเหลือ XAUUSD ตัวเดียว
→ G = 1 → ทุกรอบ bootstrap หยิบก้อนเดิมกลับมา → **CI กว้างศูนย์** ซึ่งเป็นความมั่นใจปลอม
(self-test ข้อ \`cluster-by-symbol-degenerate\` เรียก \`bootstrapClusterStats\` ตัวจริงมาพิสูจน์ว่า
มันคืน CI95 ที่ขอบล่างเท่ากับขอบบนเป๊ะ) **cluster ตาม symbol ใช้ไม่ได้อีกต่อไปแล้ว**

ความยาวบล็อกไม่ได้ตั้งมั่ว — คำนวณจาก **จำนวนไม้ที่ซ้อนทับกันเชิงกลไก** (ค่ากลางของจำนวนไม้
ที่ช่วง \[เข้า, ออก\] คาบเกี่ยวกัน) ไม้ที่เปิดห่างกันไม่ถึงเพดานถือกินแท่งชุดเดียวกัน
ผลของมันจึงสัมพันธ์กันโดยโครงสร้าง ถ้าสุ่มราย-ไม้จะได้ SE แคบเกินจริงแล้วประกาศชัยชนะปลอม
(self-test ข้อ \`block-bootstrap-catches-dependence\` ยืนยันว่าบล็อกยาวจับ AR(0.9) ได้จริง
โดยให้ SE กว้างกว่าการสุ่มราย-ไม้ ~3.7 เท่า และไม่ทำให้ข้อมูล iid เพี้ยน)

| ช่อง | ไม้ | บล็อก (ไม้) | SE ของ meanR | MDE @ p<0.05 | MDE @ 80% power |
| --- | ---: | ---: | ---: | ---: | ---: |
${g.filter((r) => r.trades >= 30).map((r) => `| กันซ้ำ ${r.dedupeHours} ชม. · ถือ ${r.holdBars} แท่ง${r.isCurrentConfig ? ' **(ปัจจุบัน)**' : ''} | ${r.trades} | ${r.power.blockLen} | ${n4(r.power.se)} | ${n4(r.power.mdeAtSignificance)} | ${n4(r.power.mdeAt80Power)} |`).join('\n')}

**อ่านตารางนี้ยังไง**: ที่ค่าปัจจุบัน (${cur.trades} ไม้) ขอบจริงต้องใหญ่กว่า **${n4(cur.power.mdeAt80Power)} R/ไม้**
ถึงจะมีโอกาส 80% ที่ข้อมูลชุดนี้จะจับได้ เทียบกับขอบดิบที่ 1H วัดได้ (+${report.priorEvidence.oneHourRawEdge} R/ไม้)
— **เล็กกว่า MDE ประมาณ ${Math.round(cur.power.mdeAt80Power / report.priorEvidence.oneHourRawEdge)} เท่า**

ถ้าเลน 15m มีขอบขนาดเดียวกับที่ 1H มี **ข้อมูลเดือนนี้มองไม่เห็นมันแน่นอน**

จำนวนไม้ที่ต้องมีเพื่อให้ MDE ลงมาเท่ากับ +${report.priorEvidence.oneHourRawEdge} R/ไม้ ที่ค่าปัจจุบัน:
n ต้องโตราว **${nNeeded.toLocaleString('en-US')} เท่า** ของ ${cur.trades} ไม้ = ราว **${Math.round(cur.trades * nNeeded).toLocaleString('en-US')} ไม้**
ซึ่งที่ ${n4(cur.signalsPerDay, 2)} ไม้/วัน = ประมาณ **${Math.round(cur.trades * nNeeded / cur.signalsPerDay / 365).toLocaleString('en-US')} ปี** ของการเก็บข้อมูล
แม้จะเปิดกันซ้ำเป็น 0 (${n4(open.signalsPerDay, 2)} ไม้/วัน) ก็ยังราว **${Math.round(cur.trades * nNeeded / open.signalsPerDay / 365).toLocaleString('en-US')} ปี**

*(ตัวเลข "ปี" นี้คือขอบล่างแบบหยาบ ๆ ที่ตรึง SE ต่อไม้ไว้คงที่ — ในความจริง SE จะเปลี่ยน
ตามความผันผวนของแต่ละยุค ใช้อ่านเป็น "ระดับความใหญ่ของปัญหา" ไม่ใช่ตารางเวลาที่แม่นยำ)*

---

## สิ่งที่ผลนี้ยังไม่ได้พิสูจน์

หัวข้อนี้บังคับให้มี และต้องอ่านก่อนเอาตัวเลขไปตัดสินใจ

### 1. ข้อมูลมีเดือนเดียว — แบ่ง train/test ไม่ได้เลย

${report.data.bars} แท่ง / ${report.data.spanDays.toFixed(1)} วัน ทั้งหมดถูกใช้เป็นชุดเดียว **ไม่มีชุดกันไว้ตรวจนอกตัวอย่าง**
ต่างจาก 1D/1H ที่มี \`report/split.json\` แบ่ง 60/20/20 ไว้ ทุกตัวเลขในรายงานนี้จึงเป็น
in-sample ล้วน ๆ ถ้ามีใครเอาไปเลือกช่องที่ดูดีที่สุดแล้วตั้งค่าตามนั้น นั่นคือการ fit
บนเสียงรบกวน และไม่มีเครื่องมือไหนในรายงานนี้จับได้
สาเหตุที่แบ่งไม่ได้ไม่ใช่ความขี้เกียจ: Yahoo ตอบ Unprocessable Entity เมื่อขอ 15m เกิน 1 เดือน

### 2. ไม้ซ้อนทับกัน — n ที่เห็นใหญ่กว่า n ที่เป็นอิสระจริงมาก

ที่เพดานถือ 96 แท่ง ไม้หนึ่งไม้กินเวลา 24 ชม. แต่สัญญาณเกิดได้ทุก 15 นาที
ไม้จำนวนมากจึงอ่านแท่งชุดเดียวกัน (ที่กันซ้ำ 0 ชม. ความยาวบล็อกที่วัดได้คือ ${open.power.blockLen} ไม้
= ไม้เฉลี่ยหนึ่งไม้ซ้อนกับเพื่อนอีก ${open.power.blockLen - 1} ไม้) block bootstrap ชดเชยข้อนี้ได้บางส่วน
แต่ **ชดเชยได้ไม่หมด** — MDE ที่รายงานยังเป็นขอบล่างของความไม่แน่นอน ไม่ใช่ค่าที่แม่นแล้ว

### 3. ยุคเดียว — ทองปี 2026 ที่ราคา 4,4xx และกำลังขาขึ้นแรง

ช่วงที่วัดคือ ${report.data.first.slice(0, 10)} → ${report.data.last.slice(0, 10)} ราคาเดินจาก
${report.data.firstClose.toFixed(2)} ไป ${report.data.lastClose.toFixed(2)} = **${drift.toFixed(2)}% ในเดือนเดียว**

นี่ไม่ใช่เดือนธรรมดา และมันไม่ใช่แค่ "ข้อควรระวังทั่วไป" — **มันอธิบายผลบวกเกือบทั้งหมด
ในรายงานนี้ได้โดยตรง** ขา "long ล้วน" ได้ ${n4(open.alwaysLong.meanRNet)} R/ไม้ ขณะที่ "short ล้วน"
ได้ ${n4(open.alwaysShort.meanRNet)} R/ไม้ — ต่างกัน ${n4(open.alwaysLong.meanRNet - open.alwaysShort.meanRNet)} R/ไม้ ซึ่งใหญ่กว่าทุกผลต่างที่วัดได้ในตาราง
เดือนที่ทองออกข้างหรือลง ตัวเลขชุดนี้จะพลิกทั้งใบ และไม่มีอะไรในรายงานนี้บอกได้ว่าพลิกเท่าไร

### 4. ไม่ได้พิสูจน์ว่าทำกำไร — และไม่ได้ตั้งใจจะพิสูจน์

มี ${positives}/${g.length} ช่องที่ meanR สุทธิเป็นบวก แต่ **ไม่มีช่องไหนรอด Holm ในทั้งสองครอบครัว**
(p ที่ปรับแล้วเล็กที่สุด: ชนะเหรียญ ${n4(minAdjBase, 3)} · จังหวะ ${n4(minAdjMix, 3)})
และไม่มีช่องไหนที่ผลต่างใหญ่กว่า MDE ของตัวเอง

ผลวิจัยที่มีอยู่บน 1H (สุทธิ ${report.priorEvidence.oneHourNet} R/ไม้ · ทุกกฎติดลบ ${report.priorEvidence.rulesNegative} ·
ไม่มีเทคนิคไหนรอด Holm) ยังเป็นหลักฐานที่หนักที่สุดที่เรามี **และรายงานนี้ไม่ได้ล้มมัน**

### 5. ต้นทุนเป็นค่าประมาณ ไม่ใช่ใบเสร็จ

XAUUSD 3 bps ไป-กลับ มาจากตารางค่าธรรมเนียมสาธารณะ ไม่ใช่ใบยืนยันคำสั่งของเจ้าของ
ถ้าสเปรดจริงบนบัญชีจริงกว้างกว่านี้ ทุกตัวเลข meanR สุทธิจะแย่ลงตามสัดส่วนตรง ๆ
และเลน 15m คือเลนที่แพ้ทางเรื่องนี้ที่สุดเพราะ SL แคบที่สุด

### 6. ไม่ได้จำลองการลื่นไถล การเว้นไม้ซ้อน หรือขนาดไม้

ทุกสัญญาณกลายเป็นไม้เสมอ ไม่จำกัดจำนวนไม้เปิดพร้อมกัน ในความจริงที่ ${n4(open.signalsPerDay, 1)} สัญญาณ/วัน
กับเพดานถือ 24 ชม. จะมีไม้เปิดค้างพร้อมกันหลายไม้ตลอดเวลา ตัวเลขนี้จึงเป็น
**"คุณภาพของสัญญาณ" ไม่ใช่ "ผลของพอร์ต"** และการเข้าไม้ทุกสัญญาณด้วยขนาดเท่ากัน
ในขณะที่มีไม้ค้าง ${open.power.blockLen} ไม้ แปลว่าความเสี่ยงจริงต่อพอร์ตสูงกว่า 1R มาก

### 7. การกันซ้ำที่วัดที่นี่เป็นการจำลอง ไม่ใช่ของจริงจากฐานข้อมูล

ลอกกติกามาจาก \`scan-universe.mjs\` (คีย์ symbol+action+timeframe · นาฬิกาตั้งใหม่เฉพาะใบที่
ประตูรับ) แต่ของจริงมีปัจจัยที่จำลองไม่ได้: รอบสแกนที่ล้ม ใบที่หมดอายุก่อน
และ \`DEDUPE_LOOKBACK_HOURS\` ที่จำกัดขอบเขต query — ค่านั้นผูกกับ \`max(...)\` ของหน้าต่าง
ทุก timeframe อยู่แล้วจึงตามให้เอง แต่ต้องรู้ว่ามันผูกกัน

### 8. ไม่ได้ทดสอบว่า "เลน 15m คุ้มกว่าเลน 1H/1D ไหม"

รายงานนี้กวาดเฉพาะภายในเลน 15m การเทียบข้ามเลนต้องใช้เส้นแบ่งเดียวกันและช่วงเวลาเดียวกัน
ซึ่งทำไม่ได้ตราบใดที่ 15m มีข้อมูลแค่เดือนเดียว

---

## ข้อเสนอ (พร้อมตัวเลข — เจ้าของตัดสินใจเอง ไม่มีการแก้โค้ดจริงในงานนี้)

${report.recommendation}

---

*ห้ามอ้างรายงานนี้ว่าเลน 15m ทำกำไรได้ ไม่มีตัวเลขไหนในนี้สนับสนุนข้อความนั้น*
*ค่า \`DEDUPE_HOURS_15M\` และ \`MAX_HOLD_BARS\` ในโค้ดจริงไม่ถูกแตะในงานนี้*
`;
}

// ═══════════════════════════════ ข้อเสนอ ═══════════════════════════════

/**
 * ประกอบข้อเสนอจากตัวเลขที่วัดได้จริง — ไม่มีการเดา ไม่มีการแก้โค้ดจริง
 *
 * กติกาที่ตั้งให้ตัวเอง: ถ้าไม่มีช่องไหนรอด Holm และไม่มีช่องไหนที่ผลต่างใหญ่กว่า MDE
 * **ห้ามเสนอค่าใดค่าหนึ่งในฐานะ "ค่าที่ทำกำไรกว่า"** เสนอได้แค่ในฐานะ "แลกอะไรกับอะไร"
 * พร้อมบอกตรง ๆ ว่าข้อมูลไม่พอ — การเงียบเรื่องนี้แล้วเสนอเลขสวย ๆ คือการโกหกด้วยตัวเลขจริง
 */
function buildRecommendation(report) {
  const g = report.grid;
  const mt = report.multipleTesting;
  const cur = g.find((r) => r.isCurrentConfig);
  const at = (d, h) => g.find((r) => r.dedupeHours === d && r.holdBars === h);
  const open = at(0, 96);
  const d4 = at(4, 96);
  const timingBig = g.filter((r) => r.mixNull.timingEdge > r.powerDiff.mdeAt80Power).length;
  const alBeats = g.filter((r) => r.alwaysLong.meanRNet > r.meanRNet).length;

  const out = [];

  out.push('### สรุปก่อนอ่านข้อเสนอ: ข้อมูลไม่พอจะเสนอ "ค่าที่ดีกว่า" — พูดตรง ๆ ตามที่สั่ง');
  out.push('');
  out.push(`ในตาราง ${g.length} ช่อง: รอด Holm **${mt.vsBaseline.survivors} ช่อง** (ชนะเหรียญ)`
    + ` และ **${mt.mixNull.survivors} ช่อง** (จังหวะ) · ผลต่างใหญ่กว่า MDE ของตัวเอง **${timingBig} ช่อง**`);
  out.push(`และขา "long ล้วน" ชนะเครื่องยนต์จริง **${alBeats}/${g.length} ช่อง** — ผลบวกที่เห็นอธิบายได้ด้วย`);
  out.push('"เดือนนี้ทองขึ้น 8.68%" ไม่ใช่ด้วยความสามารถของเครื่องยนต์');
  out.push('');
  out.push('**จึงเสนอค่าที่ "ทำกำไรกว่า" ไม่ได้เลย** สิ่งที่เสนอได้มีอย่างเดียวคือ');
  out.push('**"กดปุ่มนี้แล้วได้อะไร เสียอะไร"** ซึ่งเป็นการแลกปริมาณแจ้งเตือนกับความรำคาญ');
  out.push('ไม่ใช่การแลกเพื่อกำไร');
  out.push('');

  out.push('### ข้อ 1 — ถ้าเจ้าของอยากได้ "เข้าเร็ว" จริง: ปุ่มคือ `DEDUPE_HOURS_15M` ปุ่มเดียว');
  out.push('');
  out.push('| ตั้งเป็น | สัญญาณ/วัน | เตือน/สัปดาห์ | ไม้ในเดือนที่วัด | meanR สุทธิ | เหรียญ | long ล้วน |');
  out.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const h of DEDUPE_GRID.slice().reverse()) {
    const r = at(h, 96);
    out.push(`| ${r.dedupeHours} ชม.${r.isCurrentConfig ? ' **(ปัจจุบัน)**' : ''} | ${n4(r.signalsPerDay, 2)}`
      + ` | ~${(r.signalsPerDay * 7).toFixed(0)} | ${r.trades} | ${n4(r.meanRNet)}`
      + ` | ${n4(r.baseline.meanRNet)} | ${n4(r.alwaysLong.meanRNet)} |`);
  }
  out.push('');
  out.push('**ตัวเลขที่ควรใช้ตัดสินใจ**: ปุ่มนี้เปลี่ยน "ปริมาณ" อย่างเดียว');
  out.push(`ที่ 20 ชม. โทรศัพท์สั่น ~${(cur.signalsPerDay * 7).toFixed(0)} ครั้ง/สัปดาห์`
    + ` · ที่ 4 ชม. ~${(d4.signalsPerDay * 7).toFixed(0)} ครั้ง · ที่ 0 ชม. ~${(open.signalsPerDay * 7).toFixed(0)} ครั้ง`);
  out.push('ส่วนคอลัมน์ meanR ไม่มีแนวโน้มที่อ่านได้เลย — มันขึ้นลงแบบไม่มีทิศทาง');
  out.push('ซึ่งเป็นสิ่งที่ควรคาดหวังเมื่อ MDE ใหญ่กว่าทุกความต่างที่วัดได้');
  out.push('');
  out.push(`⚠ ก่อนกด: **ประตูคุณภาพบน 15m ไม่ได้กรองอะไรเลย** (ผ่าน ${report.base.gatePassed}/${report.base.directional})`);
  out.push('การกดค่านี้ลงจึงไม่มีเบรกสำรอง ปริมาณจะขึ้นตามตารางเป๊ะ ๆ');
  out.push('');
  out.push('**ถ้าเจ้าของสั่งให้เลือกค่าเดียว** ผมเสนอ **4 ชม.** ด้วยเหตุผลที่ไม่เกี่ยวกับกำไร:');
  out.push('- มันเท่ากับ `DEDUPE_HOURS_1H` ที่มีอยู่แล้วในไฟล์เดียวกัน จึงไม่มีเลขใหม่ให้ต้องอธิบาย');
  out.push(`- ให้ ${n4(d4.signalsPerDay, 1)} สัญญาณ/วัน (~${(d4.signalsPerDay * 7).toFixed(0)} ครั้ง/สัปดาห์) ซึ่งอยู่กึ่งกลาง`
    + ` ระหว่างค่าปัจจุบัน ${n4(cur.signalsPerDay, 1)} กับเพดานของเลน ${n4(open.signalsPerDay, 1)}`);
  out.push('- ยังเหลือที่ให้ถอยกลับได้ ถ้าเจ้าของเจอว่ารำคาญเกิน');
  out.push('');
  out.push('**แต่ย้ำให้ชัด: ไม่มีหลักฐานว่ามันทำเงินได้ดีกว่า 20 ชม. — มันแค่ถี่กว่า**');
  out.push('ถ้าเป้าหมายคือ "อยากเห็นสัญญาณบ่อยขึ้น" ปุ่มนี้ตอบโจทย์');
  out.push('ถ้าเป้าหมายคือ "อยากได้กำไรมากขึ้น" ปุ่มนี้ไม่ใช่คำตอบ และรายงานนี้ไม่มีคำตอบนั้น');
  out.push('');

  out.push('### ข้อ 2 — "ออกเร็ว" ไม่แนะนำให้แตะ และนี่คือตัวเลขว่าทำไม');
  out.push('');
  out.push('| เพดานถือ | = กี่ ชม. | จบตามแผน (TP+SL) | หมดเวลา | meanR สุทธิ | ถือจริง p50 |');
  out.push('| ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of g.filter((x) => x.dedupeHours === 20)) {
    out.push(`| ${r.holdBars} แท่ง${r.isCurrentConfig ? ' **(ปัจจุบัน)**' : ''} | ${r.holdHoursCap} | `
      + `${pctS((r.pctTp ?? 0) + (r.pctSl ?? 0))} | ${pctS((r.pctTimeout ?? 0) + (r.pctDataEnd ?? 0))}`
      + ` | ${n4(r.meanRNet)} | ${n4(r.medianHoldHours, 2)} ชม. |`);
  }
  out.push('');
  out.push('เหตุผลเป็นกลไก ไม่ใช่ความเห็น: `MAX_COST_R = 0.05` บังคับ SL ≥ 0.60% = **4.2 เท่าของ ATR 15m**');
  out.push('และราคาต้องใช้เวลาเดินถึงระยะนั้น (ค่ากลาง 21 แท่ง = 5.3 ชม. · p25 12 แท่ง · p75 36 แท่ง)');
  out.push('การตัดเพดานถือให้สั้นกว่านั้นไม่ได้ทำให้ "ออกเร็ว" — มันแปลงไม้จาก "ชนะ/แพ้ตามแผน"');
  out.push('เป็น "ปิดที่ราคาตลาดกลางทาง" ซึ่งเป็นการเปลี่ยนนิยามของระบบทั้งระบบ');
  out.push('');
  out.push('**ถ้าเจ้าของยืนยันว่าต้องออกใน 1–2 ชม. จริง ๆ** ทางเดียวที่สอดคล้องกันคือบีบ SL');
  out.push('ซึ่งราคาที่ต้องจ่ายเป็นเลขตายตัว ไม่ใช่การประมาณ:');
  out.push('');
  out.push('| SL (% ของราคา) | = กี่จุด | = กี่ ATR 15m | ต้นทุน/ไม้ | ต้นทุนเทียบขอบดิบ 1H |');
  out.push('| ---: | ---: | ---: | ---: | ---: |');
  out.push('| 0.60% (ปัจจุบัน) | 26.85 | 4.20 | **0.050 R** | 7.8 เท่า |');
  out.push('| 0.30% | 13.43 | 2.10 | **0.100 R** | 15.6 เท่า |');
  out.push('| 0.15% | 6.71 | 1.05 | **0.200 R** | 31.3 เท่า |');
  out.push('');
  out.push(`ที่ 0.15% ต้นทุนกินเงินที่เสี่ยงไป 20% ก่อนไม้จะเริ่มเดิน เทียบกับขอบดิบที่ 1H`
    + ` วัดได้ทั้งปี (+${report.priorEvidence.oneHourRawEdge} R/ไม้) — **ต้นทุนใหญ่กว่าขอบ 31 เท่า**`);
  out.push('นี่คือเหตุผลที่ `MAX_COST_R` มีอยู่ และเป็นเหตุผลที่ไม่ควรผ่อนมันเพื่อความเร็ว');
  out.push('');

  out.push('### ข้อ 3 — สิ่งที่ควรทำก่อนตัดสินใจอะไรที่ใหญ่กว่านี้');
  out.push('');
  out.push('เก็บแท่ง 15m ต่อไปเรื่อย ๆ — `scripts/collect-15m.mjs` สะสมได้แล้ว '
    + `${report.data.bars} แท่ง / ${report.data.spanDays.toFixed(1)} วัน`);
  out.push('เมื่อครบ ~3 เดือนจะแบ่ง train/validation/test ได้เป็นครั้งแรก และคำสั่งเดิม');
  out.push('`node scripts/research/fast-lane-lab.mjs` จะรันซ้ำได้ทันทีบนชุดที่มีที่กันไว้จริง');
  out.push('');
  out.push('ที่สำคัญกว่าคือ **เก็บเดือนที่ทองไม่ขึ้น** — รายงานนี้วัดได้แค่ยุคเดียวและยุคนั้นเป็นขาขึ้นแรง');
  out.push('เดือนที่ทองออกข้างหรือลงคือข้อมูลที่มีค่าที่สุดที่ยังไม่มี เพราะมันคือเดือนที่จะบอกว่า');
  out.push('เครื่องยนต์รู้อะไรจริง ๆ หรือแค่เอนตามเทรนด์');
  out.push('');
  out.push('### สรุปข้อเสนอในบรรทัดเดียว');
  out.push('');
  out.push('**`DEDUPE_HOURS_15M` กดลงได้เลยถ้าอยากได้ความถี่ — มันเป็นเรื่องรสนิยมเรื่องปริมาณ');
  out.push('แจ้งเตือน ซึ่งเจ้าของตัดสินใจได้เองโดยไม่ต้องรอผลวิจัย (เสนอ 4 ชม. ถ้าต้องเลือกค่าเดียว)');
  out.push('แต่ `MAX_HOLD_BARS` และ `MAX_COST_R` อย่าแตะ — ตัวเลขข้างบนบอกว่าการขยับสองตัวนั้น');
  out.push('ทำให้แย่ลงอย่างคาดเดาได้ ไม่ใช่เรื่องรสนิยม**');

  return out.join('\n');
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
fast-lane-lab.mjs — กวาดหน้าต่างกันซ้ำ × เพดานถือ บนทอง 15m แล้วเทียบกับเส้นฐานไร้ข้อมูล

  --B=4000        จำนวนรอบ block bootstrap
  --seed=20260901 เมล็ด PRNG
  --json          พิมพ์ JSON แทนตาราง
  --self-test     ตรวจท่อทั้งท่อ แล้ว exit != 0 ถ้าไม่ผ่าน

⚠ ไฟล์นี้ไม่แก้ค่าจริงใด ๆ — DEDUPE_HOURS_15M และ MAX_HOLD_BARS ไม่ถูกแตะ
`);
    return 0;
  }

  const deps = await loadDeps();
  const opts = {
    B: Number(args.B ?? DEFAULT_B),
    seed: Number(args.seed ?? DEFAULT_SEED) >>> 0,
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

  const t0 = Date.now();
  const bars = deps.L.loadRawBars(MARKET, SYMBOL, TIMEFRAME);
  const base = buildSignals(deps, bars);
  const { rows, spanDays } = buildGrid(deps, bars, base, opts);

  /**
   * แก้ multiple testing — ตารางนี้คือ 36 การทดสอบที่รันพร้อมกัน
   *
   * ที่ alpha 0.05 ต่อช่อง ถ้าไม่มีช่องไหนมีขอบจริงเลย เรายังคาดว่าจะเห็น "มีนัยสำคัญ"
   * ราว 36 × 0.05 = 1.8 ช่องโดยบังเอิญ การหยิบช่องที่ p < 0.05 มาอวดจึงเป็นการอวดเสียงรบกวน
   *
   * ส่ง p ของ **ทุกช่อง** เข้า holm() เสมอ ห้ามกรองก่อน — holm.mjs มี guard
   * `expectedFamilySize` ที่ throw ทันทีถ้าจำนวนไม่ตรง กันไม่ให้ตัวหารหดโดยไม่มีใครเห็น
   *
   * ทำสองครอบครัวแยกกัน เพราะเป็นคนละคำถาม:
   *   · vsBaseline — "ชนะการโยนเหรียญไหม" (เดือนที่ทองขึ้น คำถามนี้ตอบง่ายเกินไป)
   *   · mixNull    — "เลือกจังหวะเก่งไหม เมื่อตรึงส่วนผสม long/short ไว้แล้ว"
   */
  const holmBaseline = holm(rows.map((r) => r.powerDiff?.pTwoTailed ?? null),
    { expectedFamilySize: rows.length });
  const holmMix = holm(rows.map((r) => r.mixNull?.pOneSided ?? null),
    { expectedFamilySize: rows.length });
  rows.forEach((r, i) => {
    r.holmVsBaseline = {
      pRaw: holmBaseline.results[i].p,
      pAdjusted: holmBaseline.results[i].adjustedP,
      reject: holmBaseline.results[i].reject,
    };
    r.holmMixNull = {
      pRaw: holmMix.results[i].p,
      pAdjusted: holmMix.results[i].adjustedP,
      reject: holmMix.results[i].reject,
    };
  });

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    question: 'เข้าเร็วออกเร็วบนทอง 15m ทำได้จริงแค่ไหน',
    universe: `${MARKET}/${SYMBOL}`,
    timeframe: TIMEFRAME,
    /**
     * ⚠ ฟิลด์นี้ต้องอ่านก่อนอ่าน grid — ไม่มีชุด test กันไว้เลย
     * Yahoo ให้ 15m ย้อนหลังสูงสุด 1 เดือน (ขอมากกว่านั้นตอบ Unprocessable Entity)
     */
    split: {
      scheme: 'ไม่มี — ใช้ทั้งชุดเป็น in-sample',
      why: 'Yahoo ให้ 15m ย้อนหลังสูงสุด 1 เดือน แบ่ง train/validation/test ไม่ได้',
      contrastWith1DAnd1H: 'report/split.json แบ่ง 60/20/20 ให้ 1D/1H — เลนนี้ไม่มี',
    },
    data: {
      source: '.research-cache/candles/GOLD__XAUUSD__15m.json',
      bars: bars.length,
      first: bars[0].timestamp,
      last: bars.at(-1).timestamp,
      firstClose: bars[0].close,
      lastClose: bars.at(-1).close,
      spanDays,
      tradingDaysNote: 'ช่องว่าง 22 จุด: พักรายวันของ CME 18 · สุดสัปดาห์ 4 · อธิบายไม่ได้ 0',
    },
    pipeline: {
      order: ['generateSignal', 'applyStopFloor (15m เท่านั้น)', 'กันซ้ำ', 'evaluateSignal'],
      matchesProduction: 'scripts/scan-universe.mjs บรรทัด 821 → 943 → 958',
      dedupeKey: 'symbol + action + timeframe (BUY/SELL มีนาฬิกาคนละเรือน)',
      dedupeClock: 'ตั้งใหม่เฉพาะใบที่ประตูรับ',
      entry: 'ราคาเปิดของแท่งถัดไปจากแท่งสัญญาณ',
      rDenominator: 'plannedRisk = |sig.entry_price − sig.stop_loss| (หลังขยาย SL แล้ว)',
      slWinsOnSameBar: true,
      costs: deps.L.COST_BPS,
      maxCostR: deps.costs.MAX_COST_R,
      minStopPct: deps.costs.minStopPctFor(SYMBOL, MARKET),
    },
    gate: {
      source: 'src/lib/universe.ts · evaluateSignal() + SIGNAL_GATE.perTimeframe["15m"]',
      values: deps.gate.gateForTimeframe(TIMEFRAME, deps.gate.SIGNAL_GATE),
    },
    baseline: {
      what: 'ไม้ชุดเดียวกันเป๊ะ (แท่งเดียวกัน ระยะ SL/TP เท่ากัน RR เท่ากัน ต้นทุนเท่ากัน) ต่างแค่ทิศ',
      how: 'ทิศ = ดัชนีคู่ → long · คี่ → short ในลำดับสัญญาณทั้งหมด (ไม่ดูข้อมูลใด ๆ)',
      whyFixedAcrossCells: 'ผูกกับลำดับเต็ม ไม่ใช่ลำดับหลังกันซ้ำ เพื่อให้ทุกช่องเทียบกับจักรวาลคู่ขนานอันเดียวกัน',
      whyAlternateNotRandom: 'สลับให้ long/short เท่ากันเป๊ะ กันไม่ให้เส้นฐานบังเอิญเอนตามเทรนด์ขาขึ้นของเดือนนี้',
      readAs: 'กฎจริงไม่ชนะเส้นฐานนี้ = สิ่งที่วัดได้คือเรขาคณิต ไม่ใช่ความสามารถทำนาย',
    },
    power: {
      method: 'circular block bootstrap ตามเวลา',
      B: opts.B,
      seed: opts.seed,
      whyNotClusterBySymbol: 'จักรวาลเหลือ symbol เดียว → G=1 → CI กว้างศูนย์ (self-test พิสูจน์ไว้)',
      blockLengthRule: 'ค่ากลางของจำนวนไม้ที่ช่วง [เข้า, ออก] คาบเกี่ยวกัน = ระยะที่ไม้สัมพันธ์กันเชิงกลไก',
      mdeDefinition: {
        atSignificance: '1.96 × SE — ผลจริงต้องใหญ่เท่านี้ถึงจะผ่าน p<0.05 (อำนาจราว 50%)',
        at80Power: '2.8016 × SE — ผลจริงต้องใหญ่เท่านี้ถึงจะจับได้ 80% ของเวลา',
      },
    },
    multipleTesting: {
      method: 'Holm-Bonferroni step-down (scripts/research/holm.mjs)',
      alpha: holmBaseline.alpha,
      familySize: rows.length,
      whyTwoFamilies: 'vsBaseline ถามว่า "ชนะเหรียญไหม" · mixNull ถามว่า "เลือกจังหวะเก่งไหม" — คนละคำถาม',
      vsBaseline: {
        rawBelow05: rows.filter((r) => r.holmVsBaseline.pRaw < 0.05).length,
        survivors: holmBaseline.rejectedCount,
      },
      mixNull: {
        rawBelow05: rows.filter((r) => r.holmMixNull.pRaw < 0.05).length,
        survivors: holmMix.rejectedCount,
      },
    },
    base: base.counts,
    grid: rows,
    priorEvidence: {
      note: 'ผลวิจัยที่มีอยู่ก่อนหน้า — รายงานนี้ไม่ได้ล้มมัน',
      oneHourRawEdge: 0.0064,
      oneHourCost: 0.0948,
      oneHourNet: -0.0884,
      rulesNegative: '21/21 ช่อง',
      holmSurvivors: 0,
    },
  };

  report.recommendation = buildRecommendation(report);
  const md = buildReport(report);

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUT_MD, md, 'utf8');

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const b = report.base;
    console.log(`\nXAUUSD 15m · ${bars.length} แท่ง · ${spanDays.toFixed(2)} วัน`
      + ` (${bars[0].timestamp.slice(0, 10)} → ${bars.at(-1).timestamp.slice(0, 10)})`);
    console.log('⚠ ไม่มีชุด test กันไว้ — Yahoo ให้ 15m ย้อนหลังแค่ 1 เดือน ทุกตัวเลขเป็น in-sample');
    console.log(`\nจุดตัดสินใจ ${b.decisions} → มีทิศทาง ${b.directional} → ขยาย SL ${b.stopWidened}`
      + ` → ผ่านประตู ${b.gatePassed} (${pctS(b.gatePassed / b.directional)}) → ตกประตู ${b.gateRejected}`);
    if (b.gateRejected === 0) {
      console.log('  ⚠ ประตูคุณภาพบน 15m ไม่ได้กรองอะไรเลย — ตัวคุมปริมาณคือหน้าต่างกันซ้ำล้วน ๆ');
    }
    printGrid(rows);
    const cur = rows.find((r) => r.isCurrentConfig);
    const open = rows.find((r) => r.dedupeHours === 0 && r.holdBars === 96);
    const alBeats = rows.filter((r) => r.alwaysLong.meanRNet > r.meanRNet).length;
    console.log(`ค่าปัจจุบัน (กันซ้ำ 20 ชม. · ถือ 96 แท่ง): ${n4(cur.signalsPerDay, 2)} สัญญาณ/วัน`
      + ` · ${cur.trades} ไม้ · meanR ${n4(cur.meanRNet)} · เหรียญ ${n4(cur.baseline.meanRNet)}`);
    console.log(`เข้าเร็วสุด (กันซ้ำ 0 ชม.): ${n4(open.signalsPerDay, 2)} สัญญาณ/วัน`
      + ` = ${(open.signalsPerDay / cur.signalsPerDay).toFixed(1)} เท่าของค่าปัจจุบัน`);
    console.log('');
    console.log(`ชนะเส้นฐานเหรียญ ${rows.filter((r) => r.beatsBaseline).length}/${rows.length} ช่อง`
      + ` — แต่ขา "long ล้วน" ชนะเครื่องยนต์จริง ${alBeats}/${rows.length} ช่อง`);
    console.log(`  ทองเดือนที่วัดขึ้น ${((bars.at(-1).close / bars[0].close - 1) * 100).toFixed(2)}%`
      + ` และเครื่องยนต์ออก BUY ${pctS(open.longShare, 0)} → ที่ชนะเหรียญคือ "เอนไปทางขึ้นในเดือนที่ขึ้น"`);
    console.log(`รอด Holm (${rows.length} ช่อง): ชนะเหรียญ ${report.multipleTesting.vsBaseline.survivors} ช่อง`
      + ` · จังหวะ ${report.multipleTesting.mixNull.survivors} ช่อง`
      + ` (p ดิบ < 0.05 มี ${report.multipleTesting.vsBaseline.rawBelow05} และ ${report.multipleTesting.mixNull.rawBelow05} ช่อง`
      + ` ซึ่งคาดไว้ ${(rows.length * 0.05).toFixed(1)} ช่องโดยบังเอิญอยู่แล้ว)`);
    console.log(`\nMDE ที่ 80% power ของค่าปัจจุบัน: ${n4(cur.power.mdeAt80Power)} R/ไม้`
      + ` — ขอบดิบที่ 1H วัดได้ +0.0064 เล็กกว่านี้ ${(cur.power.mdeAt80Power / 0.0064).toFixed(0)} เท่า`);
    console.log('  → ผลลบทุกช่องอ่านว่า "ยังไม่เห็น" ไม่ใช่ "พิสูจน์แล้วว่าไม่มี"');
    console.log('  → ผลบวกทุกช่องอ่านว่า "แยกจากศูนย์ไม่ได้" ไม่ใช่ "ดี"');
    console.log(`\nเขียนผลลง ${OUT_JSON}`);
    console.log(`เขียนรายงานลง ${OUT_MD}\n`);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\n[fast-lane-lab ล้ม] ${err?.stack ?? err}\n`);
    process.exit(1);
  });
