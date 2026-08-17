#!/usr/bin/env node
/**
 * geometry.mjs — ทดสอบสมมติฐาน "เป้าหมายกับหน้าต่างถือไม่เข้ากัน และแนวรับ/แนวต้านทำลาย RR"
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ไฟล์นี้ไม่คำนวณสัญญาณเอง และไม่มีสำเนาของลูป backtest
 *  มันสั่ง scripts/research/lab.mjs ให้รันแทน แล้วอ่านผลที่ lab.mjs เขียนออกมา
 *  → ตัวเลขทุกตัวจึงมาจากเครื่องวัดตัวเดียวกับ baseline-v2 เป๊ะ ไม่มีทางเพี้ยนคนละทาง
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────── ทำไมต้องมีไฟล์นี้ ───────────────────────────
 *
 * lab.mjs ให้ช่วงความเชื่อมั่นของ "แต่ละ config" แยกกัน แต่คำถามของงานนี้คือ
 * "config ใหม่ต่างจากของเดิมเท่าไร" ซึ่งเป็นคนละสถิติ และแคบกว่ามาก
 *
 * ถ้าเอาช่วงของสองอันมาดูว่าทับกันไหม จะได้คำตอบที่อนุรักษ์นิยมเกินจริง เพราะสอง
 * config รันบน "สัญลักษณ์ชุดเดียวกัน ช่วงเวลาเดียวกัน" — ความผันผวนที่มาจากการที่
 * BTC ผันผวนกว่า EURUSD เป็นความผันผวนที่ *ร่วมกันทั้งสองฝั่ง* จึงต้องหักออก
 * ไฟล์นี้จึงทำ bootstrap แบบ "จับคู่": สุ่มสัญลักษณ์ชุดเดียวกันให้ทั้งสอง config
 * ในทุกรอบสุ่ม แล้ววัด "ผลต่าง" ตรง ๆ (paired cluster bootstrap)
 *
 * ─────────────────────── กติกาที่ไฟล์นี้บังคับกับตัวเอง ───────────────────────
 *
 * 1. ห้ามแตะชุด test — ถ้าใส่ --split=test จะหยุดทันที (ประตูของ lab.mjs ยังอยู่ครบ
 *    อีกชั้น ไฟล์นี้แค่ไม่ยอมเป็นทางลัดให้ใคร)
 * 2. **ประกาศรายการทดลองทั้งหมดไว้ล่วงหน้า** ใน EXPERIMENTS/LADDER ด้านล่าง แล้วรัน
 *    ทุกอัน รายงานทุกอัน — ไม่มีการรันเพิ่มแล้วเลือกเฉพาะที่ชนะ จำนวนการเปรียบเทียบ
 *    จึงเป็นตัวเลขที่รู้ล่วงหน้า ไม่ใช่ตัวเลขที่นับย้อนหลังหลังเห็นผล
 * 3. **แก้ค่า p ตามจำนวนการเปรียบเทียบ** (Bonferroni) — รายงานทั้งช่วง 95% ดิบ
 *    และช่วงที่แก้แล้ว ข้อสรุปยืนบนช่วงที่แก้แล้วเท่านั้น
 * 4. **ตรวจหางทุกข้อสรุป** — metric-fix.md บังคับว่าข้อสรุปที่ตัดสินด้วยส่วนต่าง
 *    เล็กกว่า 0.01 R/ไม้ ต้องเช็คซ้ำกับนิยาม "ค+ข: ตัดที่ ±10" ไฟล์นี้คำนวณผลต่าง
 *    ด้วยสองนิยามเสมอ และจะติดธง "พลิก" ให้เองถ้าสองนิยามให้ข้อสรุปคนละทาง
 * 5. เทียบกับ **baseline-v2** (นิยาม R = planned) เท่านั้น ไม่เทียบกับตัวเลขก่อนซ่อม
 *
 * ────────────────────────── ตารางการทดลอง (เหตุผล) ──────────────────────────
 *
 * ผลวินิจฉัยบอกว่า SL/TP ถูกวางด้วยกฎที่ขัดกันเอง:
 *   · TP = แนวต้านที่อยู่ห่างไม่เกิน 1.5% (แล้วคูณ 0.995 ให้ใกล้เข้ามาอีก)
 *   · SL = 1.5×ATR เมื่อไม่มีแนวรับใกล้ ซึ่งมักไกลกว่า 1.5% มาก
 *   → RR มัธยฐานของกลุ่มที่ใช้ระดับ = 0.62 เทียบกับกลุ่ม ATR ล้วน = 2.00
 * และเป้าหมายกับหน้าต่างถือก็ไม่เข้ากัน: ภายใน 10 แท่ง ราคาแตะ 3×ATR ได้แค่ 19.3%
 *
 * จึงทดสอบ 3 แกนพร้อมกันเป็น factorial เต็ม (ไม่ใช่ไล่หาเลขที่ดีที่สุด):
 *   แกน 1: ใช้ระดับวาง SL/TP หรือไม่        (exits.useSupportResistance)  2 ค่า
 *   แกน 2: TP ไกลแค่ไหน                      (exits.tpAtrMult) 1.5 / 2 / 3  3 ค่า
 *   แกน 3: ถือได้นานแค่ไหน                   (--max-hold) 10 / 20 / 40      3 ค่า
 * = 18 ช่อง (ช่องหนึ่งคือ baseline) + 1 การทดลองแยกเรื่องตัวคูณ 0.995/1.005
 *
 * รายงาน **ทั้งพื้นผิว** ไม่ใช่ช่องที่ดีที่สุด — คำถามคือ "รูปแบบเป็นระเบียบไหม"
 * ถ้าผลกระโดดไปมาไม่เป็นระเบียบ = ไม่มีของจริง ต้องรายงานอย่างนั้น
 *
 * ────────────────── ทำไมต้องมี "บันไดตรวจซ้ำ" (LADDER) ──────────────────
 *
 * diagnosis.md เคยรายงานว่าการปิดการใช้ระดับให้ผลดีขึ้น 0.032 R/ไม้ ★★
 * แต่ตัวเลขนั้นวัดภายใต้เงื่อนไข 4 อย่างที่ต่างจากรอบนี้พร้อมกัน:
 *   (1) เฉพาะ 1D  (2) นิยาม R เดิม (realized)  (3) ตัดค่าที่ ±5  (4) ก่อนหักต้นทุน
 * ถ้ารอบนี้ได้คนละคำตอบ ต้องรู้ให้ได้ว่า "เพราะเงื่อนไขไหน" ไม่ใช่แค่บอกว่าไม่ตรง
 * LADDER จึงเปลี่ยนทีละเงื่อนไขจากของเดิมมาหาของใหม่ แล้ววัดผลของ "ปิดการใช้ระดับ"
 * ในทุกขั้น — ขั้นที่เครื่องหมายพลิกคือคำตอบว่าข้อสรุปเก่ามาจากอะไร
 *
 * ─────────────────────────────── วิธีใช้ ───────────────────────────────
 *
 *   node scripts/research/experiments/geometry.mjs                 # รันทั้งตารางบน train
 *   node scripts/research/experiments/geometry.mjs --split=validation --only=...
 *   node scripts/research/experiments/geometry.mjs --skip-runs     # ใช้ผลที่รันไว้แล้ว
 *   node scripts/research/experiments/geometry.mjs --no-ladder     # ข้ามบันไดตรวจซ้ำ
 *   node scripts/research/experiments/geometry.mjs --keep-csv      # ไม่ลบ CSV ไม้ดิบ
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');
const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');

// ════════════════════════════ ตารางการทดลอง ════════════════════════════
//
// ประกาศไว้ล่วงหน้าทั้งหมด — จำนวนการเปรียบเทียบถูกล็อกตั้งแต่ก่อนเห็นตัวเลขแรก
// levels = exits.useSupportResistance · tp = exits.tpAtrMult · hold = --max-hold
// baseline คือ { levels: true, tp: 3, hold: 10, buffer: 0.995/1.005 } = signal-engine เป๊ะ

const GRID = [];
for (const levels of [true, false]) {
  for (const tp of [1.5, 2, 3]) {
    for (const hold of [10, 20, 40]) {
      GRID.push({
        id: `${levels ? 'S' : 'A'}T${String(tp).replace('.', '')}H${hold}`,
        levels, tp, hold,
        label: `${levels ? 'ใช้ระดับ' : 'ATR ล้วน'} · TP ${tp}×ATR · ถือ ${hold} แท่ง`,
        config: { exits: { useSupportResistance: levels, tpAtrMult: tp } },
      });
    }
  }
}

const EXPERIMENTS = [
  ...GRID,
  {
    // แกนที่ 4 — ตัวคูณเผื่อ slippage 0.995/1.005 ที่ทับลงบนระดับ
    // มันดัน SL ให้ไกลขึ้น *และ* ดึง TP ให้ใกล้เข้ามา พร้อมกันทั้งฝั่ง BUY และ SELL
    // = บีบ RR จากสองด้าน จึงต้องวัดแยกว่าตัวคูณเองทำร้ายเท่าไร
    id: 'NOBUF',
    levels: true, tp: 3, hold: 10,
    label: 'ใช้ระดับ · เลิกตัวคูณ 0.995/1.005 · TP 3×ATR · ถือ 10 แท่ง',
    config: { exits: { buyLevelBuffer: 1, sellLevelBuffer: 1 } },
  },
];

/** ช่องที่เท่ากับ signal-engine ปัจจุบัน — ทุกการเปรียบเทียบวัดเทียบช่องนี้ */
const BASE_ID = 'ST3H10';
/** ช่อง "ATR ล้วน" ที่คู่กับ baseline ทุกอย่างยกเว้นการใช้ระดับ */
const ATR_ID = 'AT3H10';

/** สอง config นี้ต้องเก็บไม้รายตัวไว้ทั้งหมด เพื่อทำการเทียบแบบจับคู่รายไม้ */
const KEEP_TRADES = new Set([BASE_ID, ATR_ID]);

/**
 * บันไดตรวจซ้ำข้อสรุปเก่า — เปลี่ยนทีละเงื่อนไขจาก "ของ diagnosis.md" มาหา "ของรอบนี้"
 * ทุกขั้นวัดสิ่งเดียวกัน: ผลของการปิดการใช้ระดับ (AT3H10 − ST3H10)
 */
const LADDER = [
  { id: 'X1', tf: '1D', riskModel: 'realized', field: 'gross', cap: 5, label: '1D · นิยาม R เดิม · ตัดที่ ±5 · ก่อนหักต้นทุน  ← เงื่อนไขของ diagnosis.md' },
  { id: 'X2', tf: '1D', riskModel: 'realized', field: 'gross', cap: null, label: '1D · นิยาม R เดิม · ไม่ตัดหาง · ก่อนหักต้นทุน' },
  { id: 'X3', tf: '1D', riskModel: 'planned', field: 'gross', cap: null, label: '1D · นิยาม R ใหม่ · ก่อนหักต้นทุน' },
  { id: 'X4', tf: '1D', riskModel: 'planned', field: 'net', cap: null, label: '1D · นิยาม R ใหม่ · หลังหักต้นทุน' },
  { id: 'X5', tf: null, riskModel: 'planned', field: 'gross', cap: null, label: '1D+1H · นิยาม R ใหม่ · ก่อนหักต้นทุน' },
  { id: 'X6', tf: null, riskModel: 'planned', field: 'net', cap: null, label: '1D+1H · นิยาม R ใหม่ · หลังหักต้นทุน  ← เงื่อนไขของรอบนี้' },
];

// ════════════════════════════ เครื่องมือย่อย ════════════════════════════

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pctOfSorted(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const n2 = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const pc = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);
const sgn = (v, d = 4) => (v === null || !Number.isFinite(v) ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`);

// ════════════════════════════ รัน lab.mjs ════════════════════════════

function runLab({ tag, hold, config, extra = [] }, split) {
  const args = [LAB, `--split=${split}`, `--tag=${tag}`, `--max-hold=${hold}`, '--dump-trades', ...extra];
  if (config && Object.keys(config).length) args.push(`--config=${JSON.stringify(config)}`);
  const t0 = Date.now();
  const res = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`lab.mjs ล้มเหลวที่ ${tag}: ${res.stderr || res.stdout}`);
  return { tag, ms: Date.now() - t0 };
}

/**
 * อ่าน CSV ไม้ดิบของหนึ่ง config แล้วย่อทันทีเป็นตัวเลขที่ต้องใช้
 * (ไม่เก็บ object ต่อไม้ นอกจาก config ที่อยู่ใน KEEP_TRADES — 23 config × 45,000 ไม้
 *  ถ้าเก็บเป็น object ทั้งหมดจะกินหน่วยความจำหลายร้อยเมกะไบต์โดยไม่จำเป็น)
 */
function loadTrades(tag, split, { keepRows = false } = {}) {
  const csv = path.join(REPORT_DIR, `${tag}-${split}-trades.csv`);
  const raw = fs.readFileSync(csv, 'utf8');
  const lines = raw.split('\n');
  const head = lines[0].split(',');
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  for (const k of ['symbol', 'timeframe', 'action', 'entryTime', 'holdBars', 'stopLoss', 'takeProfit',
    'exitReason', 'rrPlanned', 'rGross', 'costR', 'costRBase', 'rNet']) {
    if (ix[k] === undefined) throw new Error(`CSV ขาดคอลัมน์ ${k} — โครง lab.mjs เปลี่ยนไปแล้ว`);
  }

  const clusterIndex = new Map();
  const clusterKeys = [];
  const rNet = []; const rGross = []; const cIdx = []; const rr = []; const holds = []; const costR = [];
  const exitCount = new Map();
  const rows = keepRows ? new Map() : null;
  let notTradeable = 0; let wins = 0; let grossWin = 0; let grossLoss = 0;

  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;
    const f = ln.split(',');
    const key = `${f[ix.symbol]}|${f[ix.timeframe]}`;
    let ci = clusterIndex.get(key);
    if (ci === undefined) { ci = clusterKeys.length; clusterIndex.set(key, ci); clusterKeys.push(key); }
    const net = Number(f[ix.rNet]);
    rNet.push(net); rGross.push(Number(f[ix.rGross])); cIdx.push(ci); costR.push(Number(f[ix.costR]));
    const rrv = f[ix.rrPlanned] === '' ? null : Number(f[ix.rrPlanned]);
    rr.push(rrv);
    holds.push(Number(f[ix.holdBars]));
    exitCount.set(f[ix.exitReason], (exitCount.get(f[ix.exitReason]) ?? 0) + 1);
    if (Number(f[ix.costRBase]) >= 1) notTradeable++;
    if (net > 0) { wins++; grossWin += net; } else if (net < 0) grossLoss += -net;
    if (rows) {
      rows.set(`${key}|${f[ix.entryTime]}`, {
        net, rr: rrv, sl: Number(f[ix.stopLoss]), tp: Number(f[ix.takeProfit]), cluster: key,
      });
    }
  }
  const n = rNet.length;
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const sortedRR = rr.filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  return {
    tag, split, n, clusterIndex, clusterKeys, rNet, rGross, cIdx, rr, holds, costR, exitCount, rows,
    notTradeable, winRate: n ? wins / n : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    avgNet: mean(rNet), avgGross: mean(rGross), avgCostR: mean(costR),
    avgCap: mean(rNet.map((v) => Math.max(-10, Math.min(10, v)))),
    medNet: pctOfSorted([...rNet].sort((a, b) => a - b), 0.5),
    avgHold: mean(holds),
    rrMed: pctOfSorted(sortedRR, 0.5),
    rrLt1: sortedRR.length ? sortedRR.filter((v) => v < 1).length / sortedRR.length : null,
    rrGe2: sortedRR.length ? sortedRR.filter((v) => v >= 2).length / sortedRR.length : null,
  };
}

const readLabJson = (tag, split) => JSON.parse(fs.readFileSync(path.join(REPORT_DIR, `${tag}-${split}.json`), 'utf8'));

// ════════════════════════ bootstrap แบบจับคู่ ════════════════════════
//
// หน่วยของการสุ่มคือ "สัญลักษณ์ × กรอบเวลา" (เหมือน ciCluster ของ lab.mjs เป๊ะ)
// เพราะไม้ในสัญลักษณ์เดียวกันสัมพันธ์กันสูง การสุ่มรายไม้จะให้ช่วงที่แคบเกินจริง
//
// หัวใจของ "จับคู่": ในรอบสุ่มรอบหนึ่ง ทั้งสอง config ได้ **รายชื่อสัญลักษณ์ชุดเดียวกัน**
// ความผันผวนที่มาจาก "บังเอิญหยิบ BTC มาสามครั้ง" จึงหักล้างกันไปในผลต่าง
// เหลือแต่ความผันผวนของ "กติกาต่างกัน" ซึ่งคือสิ่งที่อยากวัด

/** รวมค่าเป็นผลรวมรายสัญลักษณ์ — cap = ตัดค่าที่ ±cap ก่อนรวม (null = ไม่ตัด) */
function clusterSums(arm, values, cap = null) {
  const m = new Map();
  for (let i = 0; i < values.length; i++) {
    const k = arm.clusterKeys[arm.cIdx[i]];
    let e = m.get(k);
    if (!e) { e = { sum: 0, cnt: 0 }; m.set(k, e); }
    let v = values[i];
    if (cap !== null) v = Math.max(-cap, Math.min(cap, v));
    e.sum += v; e.cnt++;
  }
  return m;
}

function summariseDraws(arr, point, alphaBonf) {
  const s = Array.from(arr).sort((a, b) => a - b);
  const B = s.length;
  let le = 0; let ge = 0;
  for (const v of s) { if (v <= 0) le++; if (v >= 0) ge++; }
  return {
    point,
    lo95: pctOfSorted(s, 0.025), hi95: pctOfSorted(s, 0.975),
    loBonf: pctOfSorted(s, alphaBonf / 2), hiBonf: pctOfSorted(s, 1 - alphaBonf / 2),
    p2: Math.max(1 / B, Math.min(1, 2 * Math.min(le / B, ge / B))),
  };
}

/** ผลต่างค่าเฉลี่ยของสองแขน สุ่มสัญลักษณ์ชุดเดียวกันให้ทั้งคู่ในทุกรอบ */
function pairedDiff(mapA, mapB, { B, seed, alphaBonf }) {
  const keys = [...new Set([...mapA.keys(), ...mapB.keys()])].sort();
  const G = keys.length;
  const aS = keys.map((k) => mapA.get(k)?.sum ?? 0);
  const aC = keys.map((k) => mapA.get(k)?.cnt ?? 0);
  const bS = keys.map((k) => mapB.get(k)?.sum ?? 0);
  const bC = keys.map((k) => mapB.get(k)?.cnt ?? 0);
  const rnd = mulberry32(seed);
  const draws = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let as = 0; let ac = 0; let bs = 0; let bc = 0;
    for (let g = 0; g < G; g++) {
      const p = (rnd() * G) | 0;
      as += aS[p]; ac += aC[p]; bs += bS[p]; bc += bC[p];
    }
    draws[b] = (ac > 0 ? as / ac : 0) - (bc > 0 ? bs / bc : 0);
  }
  const tot = (S, C) => {
    const s = S.reduce((x, y) => x + y, 0); const c = C.reduce((x, y) => x + y, 0);
    return c > 0 ? s / c : null;
  };
  const out = summariseDraws(draws, tot(aS, aC) - tot(bS, bC), alphaBonf);
  out.clusters = G;
  out.meanA = tot(aS, aC);
  out.meanB = tot(bS, bC);
  out.nA = aC.reduce((x, y) => x + y, 0);
  out.nB = bC.reduce((x, y) => x + y, 0);
  return out;
}

/**
 * ผลต่างของสองกลุ่มย่อย "ภายในชุดไม้เดียวกัน" (เช่น RR≥1 กับ RR<1)
 * ยังสุ่มระดับสัญลักษณ์ และยังจับคู่ เพราะสองกลุ่มมาจากสัญลักษณ์ชุดเดียวกัน
 */
function subgroupDiff(arm, values, maskA, maskB, opts) {
  const mA = new Map(); const mB = new Map();
  for (let i = 0; i < values.length; i++) {
    const k = arm.clusterKeys[arm.cIdx[i]];
    for (const [mask, m] of [[maskA, mA], [maskB, mB]]) {
      if (!mask[i]) continue;
      let e = m.get(k);
      if (!e) { e = { sum: 0, cnt: 0 }; m.set(k, e); }
      e.sum += values[i]; e.cnt++;
    }
  }
  return pairedDiff(mA, mB, opts);
}

/**
 * ผลต่างรายไม้แบบจับคู่ — ใช้เฉพาะเมื่อไม้สองฝั่ง "เป็นสัญญาณใบเดียวกัน"
 * (สัญลักษณ์ + กรอบเวลา + เวลาเข้าไม้ ตรงกันเป๊ะ) ซึ่งแปลว่าเข้าที่ราคาเดียวกัน
 * ต่างกันแค่ SL/TP ที่ตั้งไว้ — วัดผลของ "การวางเป้า" ล้วน ๆ ไม่มีเรื่องคนละกลุ่มตัวอย่างปน
 */
function pairedTrades(pairs, { B, seed, alphaBonf }) {
  const byCluster = new Map();
  for (const p of pairs) {
    let e = byCluster.get(p.cluster);
    if (!e) { e = { d: 0, dc: 0, n: 0 }; byCluster.set(p.cluster, e); }
    e.d += p.d; e.dc += p.dc; e.n++;
  }
  const arr = [...byCluster.values()];
  const G = arr.length;
  const rnd = mulberry32(seed);
  const draws = new Float64Array(B); const drawsCap = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0; let sc = 0; let c = 0;
    for (let g = 0; g < G; g++) {
      const p = (rnd() * G) | 0;
      s += arr[p].d; sc += arr[p].dc; c += arr[p].n;
    }
    draws[b] = c > 0 ? s / c : 0;
    drawsCap[b] = c > 0 ? sc / c : 0;
  }
  const n = pairs.length;
  return {
    n, clusters: G,
    diff: summariseDraws(draws, n ? pairs.reduce((a, p) => a + p.d, 0) / n : 0, alphaBonf),
    diffCap: summariseDraws(drawsCap, n ? pairs.reduce((a, p) => a + p.dc, 0) / n : 0, alphaBonf),
  };
}

// ════════════════════════════ ตัวหลัก ════════════════════════════

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`อาร์กิวเมนต์ไม่รู้จัก: ${a}`);
    out[m[1]] = m[2] ?? true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const split = String(args.split ?? 'train');
  // ── ประตูกันชุด test ────────────────────────────────────────────────
  // lab.mjs มีประตูของตัวเองอยู่แล้ว 3 ชั้น ไฟล์นี้เพิ่มชั้นที่ 4 เพื่อไม่ให้ตัวเอง
  // กลายเป็นทางลัด "เผลอ" ไปแตะ test ผ่านสคริปต์ทดลอง
  if (split.includes('test')) throw new Error('geometry.mjs ห้ามแตะชุด test เด็ดขาด — รอบนี้คือรอบทดลอง ไม่ใช่รอบตัดสิน');

  const B = Number(args.bootstrap ?? 50000);
  const seed = Number(args.seed ?? 20260817);
  const keepCsv = Boolean(args['keep-csv']);
  const skipRuns = Boolean(args['skip-runs']);
  const withLadder = !args['no-ladder'];
  const only = args.only ? new Set(String(args.only).split(',')) : null;
  const plan = EXPERIMENTS.filter((e) => !only || only.has(e.id));
  if (!plan.some((e) => e.id === BASE_ID)) throw new Error(`ต้องมี ${BASE_ID} (baseline) อยู่ในแผนเสมอ`);

  // จำนวนการเปรียบเทียบถูกล็อกจากแผน ไม่ใช่นับย้อนหลังหลังเห็นผล
  const N_GRID = plan.length - 1;
  const N_SUB = 5;                                  // RR ใน 2 ชุด + จับคู่รายไม้ 3 กลุ่ม
  const N_LADDER = withLadder ? LADDER.length : 0;  // นับด้วยแม้เป็นการตรวจซ้ำ (อนุรักษ์นิยมไว้ก่อน)
  const N_COMPARISONS = N_GRID + N_SUB + N_LADDER;
  const alphaBonf = 0.05 / N_COMPARISONS;

  console.log(`[geo] split=${split} · ${plan.length} config · เปรียบเทียบ ${N_COMPARISONS} ครั้ง · alpha=${alphaBonf.toExponential(2)}`);

  // ── รันตารางหลัก ──
  const arms = new Map();
  for (const exp of plan) {
    const tag = `geo-${exp.id}`;
    if (!skipRuns) {
      const { ms } = runLab({ tag, hold: exp.hold, config: exp.config }, split);
      console.log(`[geo] ${exp.id.padEnd(8)} ${(ms / 1000).toFixed(1)}s`);
    }
    const arm = loadTrades(tag, split, { keepRows: KEEP_TRADES.has(exp.id) });
    arm.exp = exp;
    arm.lab = readLabJson(tag, split);
    arms.set(exp.id, arm);
    if (!keepCsv) fs.rmSync(path.join(REPORT_DIR, `${tag}-${split}-trades.csv`), { force: true });
  }

  // ── รันบันไดตรวจซ้ำ (เฉพาะเงื่อนไขที่ยังไม่มีจากตารางหลัก) ──
  const ladderArms = new Map();
  if (withLadder) {
    const conds = [...new Set(LADDER.filter((l) => l.tf || l.riskModel !== 'planned')
      .map((l) => `${l.tf ?? 'ALL'}|${l.riskModel}`))];
    for (const cond of conds) {
      const [tf, rm] = cond.split('|');
      for (const id of [BASE_ID, ATR_ID]) {
        const exp = EXPERIMENTS.find((e) => e.id === id);
        const tag = `geo-lad-${tf}-${rm}-${id}`;
        const extra = [`--risk-model=${rm}`];
        if (tf !== 'ALL') extra.push(`--timeframes=${tf}`);
        if (!skipRuns) {
          const { ms } = runLab({ tag, hold: exp.hold, config: exp.config, extra }, split);
          console.log(`[geo] บันได ${cond} ${id.padEnd(8)} ${(ms / 1000).toFixed(1)}s`);
        }
        ladderArms.set(`${cond}|${id}`, loadTrades(tag, split));
        if (!keepCsv) fs.rmSync(path.join(REPORT_DIR, `${tag}-${split}-trades.csv`), { force: true });
      }
    }
  }

  // ── คำนวณผลต่างทุกช่อง ──
  let s = seed;
  const nextSeed = () => { s = (s + 0x9e3779b9) >>> 0; return s; };
  const base = arms.get(BASE_ID);
  const results = [];
  for (const exp of plan) {
    const arm = arms.get(exp.id);
    let cmp = null;
    if (exp.id !== BASE_ID) {
      const opts = { B, seed: nextSeed(), alphaBonf };
      cmp = {
        diff: pairedDiff(clusterSums(arm, arm.rNet), clusterSums(base, base.rNet), opts),
        diffCap: pairedDiff(clusterSums(arm, arm.rNet, 10), clusterSums(base, base.rNet, 10), { ...opts, seed: opts.seed }),
        diffGross: pairedDiff(clusterSums(arm, arm.rGross), clusterSums(base, base.rGross), { ...opts, seed: opts.seed }),
      };
    }
    results.push({ exp, arm, cmp });
  }

  // ── กลุ่มย่อย: ตัวกรอง RR ขั้นต่ำ (วิเคราะห์กลุ่มย่อย ไม่ใช่การจำลองกฎ) ──
  const subgroup = {};
  for (const id of [BASE_ID, ATR_ID]) {
    const arm = arms.get(id);
    if (!arm) continue;
    const hi = arm.rr.map((v) => v !== null && Number.isFinite(v) && v >= 1);
    const lo = arm.rr.map((v) => v !== null && Number.isFinite(v) && v < 1);
    subgroup[id] = subgroupDiff(arm, arm.rNet, hi, lo, { B, seed: nextSeed(), alphaBonf });
  }

  // ── จับคู่รายไม้: baseline vs ATR ล้วน บนสัญญาณใบเดียวกัน ──
  let matched = null;
  const atr = arms.get(ATR_ID);
  if (base?.rows && atr?.rows) {
    const cap = (v) => Math.max(-10, Math.min(10, v));
    const all = []; const usedLevel = []; const noLevel = [];
    let lvlSL = 0; let lvlTP = 0;
    for (const [k, b] of base.rows) {
      const a = atr.rows.get(k);
      if (!a) continue;
      const rec = { cluster: b.cluster, d: a.net - b.net, dc: cap(a.net) - cap(b.net), rrBase: b.rr, rrAtr: a.rr };
      all.push(rec);
      // SL/TP ของ ATR ล้วน คือ "สูตร ATR" ของสัญญาณใบเดียวกัน ต่างกันเมื่อไหร่ = เดิมใช้ระดับ
      const sl = a.sl !== b.sl; const tp = a.tp !== b.tp;
      if (sl) lvlSL++;
      if (tp) lvlTP++;
      (sl || tp ? usedLevel : noLevel).push(rec);
    }
    matched = {
      all: pairedTrades(all, { B, seed: nextSeed(), alphaBonf }),
      usedLevel: pairedTrades(usedLevel, { B, seed: nextSeed(), alphaBonf }),
      noLevel: pairedTrades(noLevel, { B, seed: nextSeed(), alphaBonf }),
      levelOnSL: lvlSL, levelOnTP: lvlTP, matchedCount: all.length,
      rrBaseMedLevel: pctOfSorted(usedLevel.map((r) => r.rrBase).filter(Number.isFinite).sort((x, y) => x - y), 0.5),
      rrAtrMedLevel: pctOfSorted(usedLevel.map((r) => r.rrAtr).filter(Number.isFinite).sort((x, y) => x - y), 0.5),
    };
  }

  // ── บันไดตรวจซ้ำ ──
  const ladder = [];
  if (withLadder) {
    for (const step of LADDER) {
      const key = `${step.tf ?? 'ALL'}|${step.riskModel}`;
      const armA = step.tf === null && step.riskModel === 'planned' ? arms.get(ATR_ID) : ladderArms.get(`${key}|${ATR_ID}`);
      const armB = step.tf === null && step.riskModel === 'planned' ? arms.get(BASE_ID) : ladderArms.get(`${key}|${BASE_ID}`);
      if (!armA || !armB) continue;
      const va = step.field === 'net' ? armA.rNet : armA.rGross;
      const vb = step.field === 'net' ? armB.rNet : armB.rGross;
      ladder.push({
        ...step,
        d: pairedDiff(clusterSums(armA, va, step.cap), clusterSums(armB, vb, step.cap), { B, seed: nextSeed(), alphaBonf }),
      });
    }
  }

  const out = buildReport({ split, B, seed, alphaBonf, N_COMPARISONS, N_GRID, N_SUB, N_LADDER,
    results, base, subgroup, matched, ladder, arms });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const suffix = split === 'train' ? '' : `-${split}`;
  fs.writeFileSync(path.join(REPORT_DIR, `exp-geometry${suffix}.md`), out.md, 'utf8');
  fs.writeFileSync(path.join(REPORT_DIR, `exp-geometry${suffix}.json`), `${JSON.stringify(out.json, null, 2)}\n`, 'utf8');
  console.log(out.md);
  console.log(`\n[geo] เขียนรายงานที่ scripts/research/report/exp-geometry${suffix}.md`);
}

// ════════════════════════════ รายงาน ════════════════════════════

/**
 * ข้อสรุปยืนบนช่วงที่แก้ค่า p แล้วเท่านั้น และต้องไม่พลิกเมื่อเปลี่ยนไปใช้นิยาม
 * "ตัดที่ ±10" (กติกาบังคับของ metric-fix.md สำหรับส่วนต่างเล็กกว่า 0.01 R/ไม้)
 */
function verdictOf(cmp) {
  if (!cmp) return { text: 'ฐาน', flip: false };
  const sign = (x) => (x.loBonf > 0 ? 1 : x.hiBonf < 0 ? -1 : 0);
  const sd = sign(cmp.diff); const sdc = sign(cmp.diffCap);
  const flip = sd !== sdc;
  const text = sd > 0 ? 'ดีขึ้น ★' : sd < 0 ? 'แย่ลง ✗' : 'แยกไม่ออก';
  return { text: flip ? `${text} · พลิกเมื่อตัดหาง` : text, flip };
}

function buildReport(ctx) {
  const { split, B, seed, alphaBonf, N_COMPARISONS, N_GRID, N_SUB, N_LADDER,
    results, base, subgroup, matched, ladder, arms } = ctx;
  const L = [];
  const W = (t = '') => L.push(t);
  const baseLab = base.lab.results[split];
  const winBars = base.lab.perDataset.reduce((a, d) => a + (d.splits?.[split]?.bars ?? 0), 0);
  const ciTxt = `${((1 - alphaBonf) * 100).toFixed(2)}%`;

  /**
   * ประมาณจำนวนสัญญาณที่ "ไม่เคยถูกพิจารณา" เพราะติดไม้ค้างอยู่
   * ลูปกระโดด i = exitIndex ทุกครั้งที่เปิดไม้ → แท่งระหว่างถือไม่เคยถูกถาม
   * สมมติฐาน: อัตราการเกิดสัญญาณบนแท่งที่ถูกข้าม เท่ากับบนแท่งที่ได้เห็น
   * (ถ้าสัญญาณเกิดเป็นกระจุก ตัวเลขนี้จะต่ำกว่าความจริง — เป็นการประมาณแบบระวังไว้ก่อน)
   */
  const blockage = (arm) => {
    const held = arm.holds.reduce((a, b) => a + b, 0);
    const seen = Math.max(1, winBars - held);
    const rate = arm.n / seen;
    const missed = rate * held;
    return { held, seen, rate, missed, share: missed / (missed + arm.n) };
  };

  W(`# ผลทดลอง: เป้าหมาย · หน้าต่างถือ · แนวรับแนวต้าน`);
  W();
  W(`> วัดบนชุด **${split}** เท่านั้น · สร้าง ${new Date().toISOString()} · git ${base.lab.git}`);
  W(`> เครื่องวัด: \`lab.mjs\` riskModel=${base.lab.riskModel} (1R = ระยะที่ตั้งใจไว้ตอนออกสัญญาณ)`);
  W(`> เทียบกับ **baseline-v2** (config = \`signal-engine.ts\` เป๊ะ) ไม่ใช่ตัวเลขก่อนซ่อมเครื่องวัด`);
  W(`> **ไม่มีตัวเลขใดในเอกสารนี้มาจากชุด test**`);
  W();

  W(`## 0. วิธีนับการเปรียบเทียบ และการแก้ค่า p`);
  W();
  W(`ตารางการทดลองถูกประกาศไว้ล่วงหน้าทั้งก้อนใน \`EXPERIMENTS\` / \`LADDER\` ของ geometry.mjs`);
  W(`แล้วรันทุกช่อง รายงานทุกช่อง — ไม่มีการรันเพิ่มทีหลังแล้วเลือกเฉพาะช่องที่ชนะ`);
  W();
  W(`| รายการ | จำนวน |`);
  W(`| --- | ---: |`);
  W(`| ช่องใน factorial 2×3×3 + ตัวคูณระดับ (ไม่นับ baseline) | ${N_GRID} |`);
  W(`| การวิเคราะห์กลุ่มย่อยที่ประกาศไว้ | ${N_SUB} |`);
  W(`| ขั้นของบันไดตรวจซ้ำข้อสรุปเก่า | ${N_LADDER} |`);
  W(`| **รวมการเปรียบเทียบ** | **${N_COMPARISONS}** |`);
  W(`| alpha หลังแก้ Bonferroni | ${alphaBonf.toExponential(3)} |`);
  W(`| ช่วงความเชื่อมั่นที่ใช้ตัดสิน | ${ciTxt} |`);
  W(`| bootstrap | ${B.toLocaleString()} รอบ · seed ${seed} |`);
  W();
  W(`ทุกช่องวัด **ผลต่างแบบจับคู่**: ในรอบสุ่มหนึ่งรอบ config ที่เทียบกันได้รายชื่อสัญลักษณ์`);
  W(`ชุดเดียวกัน ความผันผวนที่มาจาก "บังเอิญหยิบ BTC สามครั้ง" จึงหักล้างกันไปในผลต่าง`);
  W(`ช่วงของผลต่างจึงแคบกว่าการเอาช่วงของสอง config มาดูว่าทับกันไหม (ซึ่งอนุรักษ์นิยมเกินจริง)`);
  W();
  W(`คอลัมน์ **ตัดหาง ±10** คือผลต่างเดียวกันที่คิดด้วยนิยาม "ค+ข" ของ \`metric-fix.md\``);
  W(`ถ้าข้อสรุปพลิกระหว่างสองคอลัมน์ = ผลมาจากไม้หางไม่กี่ไม้ ไม่ใช่จากกฎ → ห้ามรายงานว่าเจอ`);
  W();

  W(`## 1. พื้นฐานของรอบนี้ (ช่อง ${BASE_ID})`);
  W();
  const b0 = blockage(base);
  W(`| | ค่า |`);
  W(`| --- | --- |`);
  W(`| ไม้ | ${base.n.toLocaleString()} |`);
  W(`| avgR หลังหักต้นทุน | **${n2(base.avgNet)}** |`);
  W(`| CI95 ราย-สัญลักษณ์ (lab.mjs) | [${n2(baseLab.cohortAll.net.ciCluster.lo95)}, ${n2(baseLab.cohortAll.net.ciCluster.hi95)}] |`);
  W(`| avgR ก่อนหักต้นทุน | ${n2(base.avgGross)} |`);
  W(`| ต้นทุนเฉลี่ย | ${n2(base.avgCostR)} R/ไม้ |`);
  W(`| ชนะ · PF | ${pc(base.winRate)} · ${n2(base.profitFactor, 3)} |`);
  W(`| RR ที่สัญญาณเสนอ: มัธยฐาน · RR<1 · RR≥2 | ${n2(base.rrMed, 2)} · ${pc(base.rrLt1)} · ${pc(base.rrGe2)} |`);
  W(`| ไม้ที่ "เทรดไม่ได้จริง" (costR base ≥ 1) | ${base.notTradeable} |`);
  W(`| ประมาณสัญญาณที่ถูกไม้ค้างบังไว้ | ${Math.round(b0.missed).toLocaleString()} (${pc(b0.share)} ของสัญญาณทั้งหมด) |`);
  W();
  const drift = Math.abs(base.avgNet - baseLab.cohortAll.net.stats.avgR);
  W(drift > 1e-9
    ? `> ⚠ ค่าที่อ่านจาก CSV ไม่ตรงกับที่ lab.mjs สรุปไว้ (ต่าง ${drift.toExponential(2)}) — ต้องหยุดหาสาเหตุก่อนเชื่ออะไร`
    : `ค่าที่อ่านจาก CSV ตรงกับที่ lab.mjs สรุปไว้ทุกหลัก (ตรวจอัตโนมัติทุกครั้งที่รัน)`);
  W();

  W(`## 2. ตารางเต็ม — ทุกช่องที่ลอง เรียงตามลำดับที่ประกาศไว้ (ไม่ได้เรียงตามผล)`);
  W();
  W(`| id | กติกา | ไม้ | ชนะ | RR มัธยฐาน | ต้นทุน R | avgR ก่อนหัก | avgR(net) | Δ จากฐาน | CI95 ของ Δ | CI${ciTxt} | p | Δ ตัดหาง ±10 | ข้อสรุป |`);
  W(`| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |`);
  for (const r of results) {
    const c = r.cmp; const v = verdictOf(c);
    W(`| ${r.exp.id} | ${r.exp.label} | ${r.arm.n.toLocaleString()} | ${pc(r.arm.winRate)} | ${n2(r.arm.rrMed, 2)} | ${n2(r.arm.avgCostR, 3)} | ${n2(r.arm.avgGross)} | ${n2(r.arm.avgNet)} | `
      + `${c ? sgn(c.diff.point) : '—'} | ${c ? `[${n2(c.diff.lo95)}, ${n2(c.diff.hi95)}]` : '—'} | `
      + `${c ? `[${n2(c.diff.loBonf)}, ${n2(c.diff.hiBonf)}]` : '—'} | ${c ? c.diff.p2.toExponential(1) : '—'} | `
      + `${c ? sgn(c.diffCap.point) : '—'} | ${v.text} |`);
  }
  W();
  W(`★ = ช่วงที่แก้ค่า p แล้วอยู่เหนือศูนย์ทั้งช่วง · ✗ = อยู่ใต้ศูนย์ทั้งช่วง`);
  W();

  W(`## 3. พื้นผิว TP × หน้าต่างถือ (Δ จากฐาน · R/ไม้ หลังหักต้นทุน)`);
  W();
  W(`อ่านเป็น **รูปแบบ** ไม่ใช่ "ช่องที่ดีที่สุด" — ถ้าค่ากระโดดไปมาไม่เป็นระเบียบ แปลว่าไม่มีของจริง`);
  W();
  for (const levels of [true, false]) {
    W(`**${levels ? 'ใช้ระดับแนวรับ/แนวต้านวาง SL/TP (ของเดิม)' : 'ATR ล้วน (ปิดการใช้ระดับ)'}**`);
    W();
    W(`| TP \\ ถือ | 10 แท่ง | 20 แท่ง | 40 แท่ง |`);
    W(`| --- | --- | --- | --- |`);
    for (const tp of [1.5, 2, 3]) {
      const cells = [10, 20, 40].map((hold) => {
        const id = `${levels ? 'S' : 'A'}T${String(tp).replace('.', '')}H${hold}`;
        const r = results.find((x) => x.exp.id === id);
        if (!r) return 'n/a';
        if (!r.cmp) return `**ฐาน ${n2(r.arm.avgNet)}**`;
        const d = r.cmp.diff;
        return `${sgn(d.point)}${d.loBonf > 0 ? ' ★' : d.hiBonf < 0 ? ' ✗' : ''}`;
      });
      W(`| ${tp}×ATR | ${cells.join(' | ')} |`);
    }
    W();
  }

  W(`## 4. ผลข้างเคียงของการถือนานขึ้น`);
  W();
  W(`การถือนานขึ้นทำให้ไม้ค้างบังสัญญาณใหม่มากขึ้น — ต้องรายงานเสมอ ไม่ใช่ดูแต่ avgR`);
  W();
  W(`| id | ไม้ | เทียบฐาน | holdBars เฉลี่ย | สัดส่วนเวลาที่ติดไม้ | time_exit | ชน TP | ประมาณสัญญาณที่ถูกบัง |`);
  W(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const r of results) {
    const bl = blockage(r.arm);
    const occ = r.arm.holds.reduce((a, x) => a + x + 1, 0);
    const te = (r.arm.exitCount.get('time_exit') ?? 0) / r.arm.n;
    const tp = ((r.arm.exitCount.get('take_profit') ?? 0) + (r.arm.exitCount.get('gap_target') ?? 0)) / r.arm.n;
    W(`| ${r.exp.id} | ${r.arm.n.toLocaleString()} | ${r.arm.n === base.n ? '—' : `${((r.arm.n / base.n - 1) * 100).toFixed(1)}%`} | `
      + `${n2(r.arm.avgHold, 2)} | ${pc(occ / winBars)} | ${pc(te)} | ${pc(tp)} | ${pc(bl.share)} |`);
  }
  W();
  W(`ฐานของทั้ง ${split}: ${winBars.toLocaleString()} แท่งที่เข้าไม้ได้`);
  W(`"ประมาณสัญญาณที่ถูกบัง" = อัตราการเกิดสัญญาณบนแท่งที่ลูปได้เห็น × จำนวนแท่งที่ถูกข้ามเพราะติดไม้`);
  W(`สมมติว่าอัตราเท่ากันทั้งสองกลุ่มแท่ง ถ้าสัญญาณเกิดเป็นกระจุก ตัวเลขจริงจะสูงกว่านี้`);
  W();

  // ── กลไกที่อธิบายทุกช่องในตาราง: ระยะ SL → ต้นทุนเป็น R ──
  //
  // ต้นทุนเป็น R = (ค่าธรรมเนียมเป็นสัดส่วนของราคา) ÷ (ระยะ SL เป็นสัดส่วนของราคา)
  // เป็นการหาร ไม่ใช่การลบ → ระยะ SL ที่หดลงครึ่งหนึ่ง ทำให้ต้นทุนเป็น R เพิ่มเท่าตัว
  // ถ้ากติกาไหนทำให้หางซ้ายของระยะ SL บางลง ต้นทุนเฉลี่ยจะพุ่งโดยที่สัญญาณไม่ได้แย่ลงเลย
  // หัวข้อนี้จึงต้องอ่านคู่กับคอลัมน์ "avgR ก่อนหัก" ในตารางที่ 2 เสมอ
  W(`## 4.5 กลไก: ระยะ SL เป็นตัวกำหนดต้นทุน ไม่ใช่ RR`);
  W();
  W(`ต้นทุนเป็น R = (ค่าธรรมเนียม % ของราคา) **หาร** (ระยะ SL % ของราคา)`);
  W(`เป็นการหาร ไม่ใช่การลบ — ระยะ SL หดครึ่งหนึ่ง = ต้นทุนเป็น R เพิ่มเท่าตัว`);
  W(`ตารางนี้จึงอธิบายว่าทำไมบางช่องแย่ลงทั้งที่คุณภาพสัญญาณดีขึ้น`);
  W();
  W(`| id | ระยะ SL % ราคา: p10 | มัธยฐาน | p90 | ต้นทุนเฉลี่ย (R) | avgR ก่อนหักต้นทุน | avgR(net) |`);
  W(`| --- | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const r of results) {
    const sd = r.arm.lab.results[split].stopDist;
    W(`| ${r.exp.id} | ${n2(sd.p10 * 100, 3)}% | ${n2(sd.p50 * 100, 3)}% | ${n2(sd.p90 * 100, 3)}% | `
      + `${n2(r.arm.avgCostR, 4)} | ${n2(r.arm.avgGross)} | ${n2(r.arm.avgNet)} |`);
  }
  W();
  W(`ตัวคูณ 0.995/1.005 ที่ทับลงบนระดับ ทำหน้าที่เป็น **พื้นของระยะ SL** โดยบังเอิญ:`);
  W(`SL ของ BUY = แนวรับ × 0.995 จึงอยู่ต่ำกว่าแนวรับอีก 0.5% เสมอ ระยะจึงไม่มีทางเข้าใกล้ศูนย์`);
  W(`ดูที่คอลัมน์ p10 เพื่อเทียบหางซ้ายของแต่ละกติกา`);
  W();

  W(`## 5. ตัวกรอง RR ขั้นต่ำ — และการแยกความสับสน`);
  W();
  W(`⚠ นี่คือ **การวิเคราะห์กลุ่มย่อยของไม้ที่เกิดขึ้นจริง** ไม่ใช่การจำลองกฎ`);
  W(`กฎจริงที่ "ไม่เข้าไม้เมื่อ RR < 1" จะทำให้ลูปว่างเร็วขึ้นและไปรับสัญญาณใบอื่นแทน`);
  W(`ซึ่งเปลี่ยนกลุ่มตัวอย่างทั้งชุด ตัวเลขข้างล่างจึงตอบได้แค่ว่า "ไม้กลุ่มไหนแย่กว่ากัน"`);
  W(`ไม่ใช่ผลของกฎ (engine-lab ไม่มีปุ่มกรอง RR และรอบนี้ห้ามแก้ engine-lab)`);
  W();
  W(`| ชุดไม้ | ไม้ RR≥1 | avgR | ไม้ RR<1 | avgR | Δ (สูง−ต่ำ) | CI95 | CI${ciTxt} | p |`);
  W(`| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |`);
  for (const [id, g] of Object.entries(subgroup)) {
    W(`| ${id} · ${arms.get(id).exp.label} | ${g.nA.toLocaleString()} | ${n2(g.meanA)} | ${g.nB.toLocaleString()} | ${n2(g.meanB)} | `
      + `${sgn(g.point)} | [${n2(g.lo95)}, ${n2(g.hi95)}] | [${n2(g.loBonf)}, ${n2(g.hiBonf)}] | ${g.p2.toExponential(1)} |`);
  }
  W();

  if (matched) {
    W(`## 6. เทียบแบบจับคู่รายไม้ — ฐาน vs ATR ล้วน บนสัญญาณใบเดียวกัน`);
    W();
    W(`หยิบเฉพาะไม้ที่ทั้งสอง config เข้าที่ **สัญลักษณ์ · กรอบเวลา · แท่งเดียวกัน** = สัญญาณใบเดียวกัน`);
    W(`ราคาเข้าจึงเท่ากันเป๊ะ ต่างกันแค่ SL/TP ที่ตั้งไว้ → วัดผลของ "การวางเป้า" ล้วน ๆ`);
    W(`แยกกลุ่มด้วยหลักฐานตรง: ถ้า SL หรือ TP ของสอง config ต่างกัน แปลว่าไม้ใบนั้นเดิมใช้ระดับจริง`);
    W();
    W(`| กลุ่ม | ไม้ที่จับคู่ได้ | Δ (ATR ล้วน − ฐาน) | CI95 | CI${ciTxt} | p | Δ ตัดหาง ±10 |`);
    W(`| --- | ---: | ---: | --- | --- | ---: | ---: |`);
    for (const [lbl, m] of [['ทุกไม้ที่จับคู่ได้', matched.all],
      ['ไม้ที่เดิมใช้ระดับวาง SL หรือ TP', matched.usedLevel],
      ['ไม้ที่เดิมใช้ ATR อยู่แล้ว (กลุ่มควบคุม)', matched.noLevel]]) {
      W(`| ${lbl} | ${m.n.toLocaleString()} | ${sgn(m.diff.point)} | [${n2(m.diff.lo95)}, ${n2(m.diff.hi95)}] | `
        + `[${n2(m.diff.loBonf)}, ${n2(m.diff.hiBonf)}] | ${m.diff.p2.toExponential(1)} | ${sgn(m.diffCap.point)} |`);
    }
    W();
    W(`- จับคู่ได้ ${matched.matchedCount.toLocaleString()} ไม้ จากฐาน ${base.n.toLocaleString()} ไม้`);
    W(`- ในกลุ่มที่ใช้ระดับ: ระดับไปโดน SL ${matched.levelOnSL.toLocaleString()} ไม้ · โดน TP ${matched.levelOnTP.toLocaleString()} ไม้`);
    W(`- RR มัธยฐานของกลุ่มนั้น: ใช้ระดับ ${n2(matched.rrBaseMedLevel, 2)} → ATR ล้วน ${n2(matched.rrAtrMedLevel, 2)}`);
    W(`- กลุ่มควบคุมต้องได้ Δ = 0 พอดี ถ้าไม่ใช่ แปลว่ามีอย่างอื่นเปลี่ยนไปด้วย และตารางนี้เชื่อไม่ได้`);
    W();
  }

  if (ladder.length) {
    W(`## 7. บันไดตรวจซ้ำ — ทำไมข้อสรุปเก่า "+0.032 ★★" ไม่ปรากฏอีก`);
    W();
    W(`\`diagnosis.md\` หัวข้อ 2.5 รายงานว่าการปิดการใช้ระดับให้ผลดีขึ้น 0.032 R/ไม้ [0.024, 0.042] ★★`);
    W(`ตัวเลขนั้นวัดภายใต้เงื่อนไข 4 อย่างที่ต่างจากรอบนี้พร้อมกัน จึงเปลี่ยนทีละอย่างเพื่อหาว่าอะไรเป็นเหตุ`);
    W(`ทุกขั้นวัดสิ่งเดียวกัน: **ผลของการปิดการใช้ระดับ (${ATR_ID} − ${BASE_ID})**`);
    W();
    W(`| ขั้น | เงื่อนไข | ไม้ (ATR ล้วน / ฐาน) | Δ | CI95 | CI${ciTxt} | p |`);
    W(`| --- | --- | ---: | ---: | --- | --- | ---: |`);
    for (const st of ladder) {
      W(`| ${st.id} | ${st.label} | ${st.d.nA.toLocaleString()} / ${st.d.nB.toLocaleString()} | ${sgn(st.d.point)} | `
        + `[${n2(st.d.lo95)}, ${n2(st.d.hi95)}] | [${n2(st.d.loBonf)}, ${n2(st.d.hiBonf)}] | ${st.d.p2.toExponential(1)} |`);
    }
    W();
    W(`หมายเหตุ: ขั้น X1 ยังไม่เท่ากับ diagnosis.md ทุกประการ (ที่นั่นวัดบนข้อมูลทั้งคลังไม่แบ่ง split`);
    W(`และ bootstrap รายไม้) ที่นี่วัดบน ${split} และ bootstrap ราย-สัญลักษณ์ ซึ่งเข้มกว่าทั้งสองอย่าง`);
    W();
  }

  // ── ข้อสรุปที่สร้างจากตัวเลขโดยอัตโนมัติ ──
  //
  // เขียนด้วยโค้ด ไม่ใช่ด้วยมือ เพื่อไม่ให้ "คำบรรยาย" กับ "ตัวเลข" หลุดจากกันได้
  // เกณฑ์เดียวที่ใช้ตัดสิน: ช่วงความเชื่อมั่นที่แก้ค่า p แล้ว ต้องไม่คร่อมศูนย์
  const tested = results.filter((r) => r.cmp);
  const better = tested.filter((r) => r.cmp.diff.loBonf > 0);
  const worse = tested.filter((r) => r.cmp.diff.hiBonf < 0);
  const rawBetter = tested.filter((r) => r.cmp.diff.lo95 > 0);
  const flipped = tested.filter((r) => verdictOf(r.cmp).flip);
  const best = tested.length ? tested.reduce((a, b) => (b.cmp.diff.point > a.cmp.diff.point ? b : a)) : null;

  W(`## 8. ข้อสรุปที่ตัวเลขรองรับ (ส่วนนี้สร้างจากตัวเลขข้างบนโดยอัตโนมัติ)`);
  W();
  W(`| เกณฑ์ | ผล |`);
  W(`| --- | --- |`);
  W(`| ช่องที่ทดสอบ (ไม่นับฐาน) | ${tested.length} |`);
  W(`| ช่องที่ **ดีขึ้น** อย่างมีนัย (CI${ciTxt} เหนือศูนย์ทั้งช่วง) | **${better.length}**${better.length ? ` → ${better.map((r) => r.exp.id).join(', ')}` : ''} |`);
  W(`| ช่องที่ **แย่ลง** อย่างมีนัย (CI${ciTxt} ใต้ศูนย์ทั้งช่วง) | ${worse.length}${worse.length ? ` → ${worse.map((r) => r.exp.id).join(', ')}` : ''} |`);
  W(`| ช่องที่ CI95 **ดิบ** เหนือศูนย์ (ยังไม่แก้ค่า p) | ${rawBetter.length}${rawBetter.length ? ` → ${rawBetter.map((r) => r.exp.id).join(', ')}` : ''} |`);
  W(`| ช่องที่ข้อสรุปพลิกเมื่อตัดหาง ±10 | ${flipped.length}${flipped.length ? ` → ${flipped.map((r) => r.exp.id).join(', ')}` : ''} |`);
  if (best) {
    W(`| ช่องที่ Δ สูงสุด | ${best.exp.id} · ${sgn(best.cmp.diff.point)} · CI95 [${n2(best.cmp.diff.lo95)}, ${n2(best.cmp.diff.hi95)}] · p ${best.cmp.diff.p2.toExponential(1)} |`);
  }
  W();
  W(better.length === 0
    ? `**ไม่มีช่องใดผ่านเกณฑ์ "ดีขึ้น" เลยบนชุด ${split}** — สมมติฐานที่ว่าการแก้เรขาคณิตของ SL/TP/หน้าต่างถือ`
      + `\nจะกู้เงินคืนได้ ไม่รอดในชุดนี้`
    : `มี ${better.length} ช่องที่ผ่านเกณฑ์บนชุด ${split} — ต้องยืนยันซ้ำบนชุดที่ยังไม่เคยเห็นก่อนเชื่อ`);
  W();

  // ── เทียบข้ามชุด (ถ้ามีผลของอีกชุดอยู่แล้ว) ──
  const otherSplit = split === 'train' ? 'validation' : 'train';
  const otherFile = path.join(REPORT_DIR, `exp-geometry${otherSplit === 'train' ? '' : `-${otherSplit}`}.json`);
  if (fs.existsSync(otherFile)) {
    const other = JSON.parse(fs.readFileSync(otherFile, 'utf8'));
    const byId = new Map(other.arms.map((a) => [a.id, a]));
    const shared = results.filter((r) => r.cmp && byId.get(r.exp.id)?.diff);
    if (shared.length) {
      W(`## 9. เทียบข้ามชุด — ${split} กับ ${otherSplit}`);
      W();
      W(`ผลที่ **เครื่องหมายไม่ตรงกัน** ระหว่างสองชุด คือหลักฐานว่าไม่มีของจริง`);
      W(`ผลที่เครื่องหมายตรงกันแต่ขนาดต่างกันมาก ก็ยังเป็นสัญญาณของเสียงรบกวน ไม่ใช่กฎ`);
      W();
      W(`| id | Δ ${split} | CI95 | Δ ${otherSplit} | CI95 | เครื่องหมาย |`);
      W(`| --- | ---: | --- | ---: | --- | --- |`);
      for (const r of shared) {
        const o = byId.get(r.exp.id);
        const same = Math.sign(r.cmp.diff.point) === Math.sign(o.diff.point);
        W(`| ${r.exp.id} | ${sgn(r.cmp.diff.point)} | [${n2(r.cmp.diff.lo95)}, ${n2(r.cmp.diff.hi95)}] | `
          + `${sgn(o.diff.point)} | [${n2(o.diff.lo95)}, ${n2(o.diff.hi95)}] | ${same ? 'ตรงกัน' : '**ไม่ตรงกัน**'} |`);
      }
      W();
      W(`> อ่านจาก \`${path.basename(otherFile)}\` ที่รันไว้ก่อนหน้า — ไม่ได้รันชุด ${otherSplit} ใหม่ในครั้งนี้`);
      W();
    }
  }

  W(`## 10. สั่งซ้ำ`);
  W();
  W('```bash');
  W(`node scripts/research/experiments/geometry.mjs --split=${split}`);
  W('```');
  W();
  W(`CSV ไม้ดิบถูกลบทิ้งหลังย่อเป็นตัวเลขแล้ว (ก้อนละ ~16 MB) ถ้าต้องการเก็บใส่ \`--keep-csv\``);

  const json = {
    generatedAt: new Date().toISOString(), split, git: base.lab.git, riskModel: base.lab.riskModel,
    bootstrap: B, seed, alphaBonf,
    comparisons: { grid: N_GRID, subgroup: N_SUB, ladder: N_LADDER, total: N_COMPARISONS },
    entryWindowBars: winBars,
    arms: results.map((r) => ({
      id: r.exp.id, label: r.exp.label, levels: r.exp.levels, tp: r.exp.tp, hold: r.exp.hold,
      trades: r.arm.n, avgNet: r.arm.avgNet, avgCap: r.arm.avgCap, avgGross: r.arm.avgGross,
      avgCostR: r.arm.avgCostR, winRate: r.arm.winRate, profitFactor: r.arm.profitFactor,
      rrMed: r.arm.rrMed, rrLt1: r.arm.rrLt1, rrGe2: r.arm.rrGe2, avgHold: r.arm.avgHold,
      notTradeable: r.arm.notTradeable, exitMix: Object.fromEntries(r.arm.exitCount),
      blockedShare: blockage(r.arm).share,
      labCI: r.arm.lab.results[split].cohortAll.net.ciCluster,
      diff: r.cmp?.diff ?? null, diffCap: r.cmp?.diffCap ?? null, diffGross: r.cmp?.diffGross ?? null,
    })),
    subgroup, matched, ladder,
    verdict: {
      tested: tested.length,
      betterIds: better.map((r) => r.exp.id),
      worseIds: worse.map((r) => r.exp.id),
      rawBetterIds: rawBetter.map((r) => r.exp.id),
      flippedIds: flipped.map((r) => r.exp.id),
      bestId: best?.exp.id ?? null,
      bestDiff: best?.cmp.diff.point ?? null,
    },
  };
  return { md: L.join('\n'), json };
}

main().catch((err) => {
  console.error(`\n[geo] ล้มเหลว: ${err?.message ?? err}`);
  if (process.env.GEO_DEBUG) console.error(err);
  process.exit(1);
});
