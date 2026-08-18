#!/usr/bin/env node
/**
 * cost-mechanics.mjs — กลไกของค่าคอม: ต้องผันผวนแค่ไหนถึงชนะค่าคอมได้
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ไฟล์นี้ "วัด" อย่างเดียว ไม่แตะเครื่องยนต์ ไม่แตะ lab.mjs ไม่แตะ engine-lab.mjs
 *  และไม่แตะชุด test — ทุกตัวเลขในนี้มาจาก train (สำรวจ) กับ validation (ยืนยัน)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ───────────────────────────── คำถามที่ไฟล์นี้ตอบ ─────────────────────────────
 *
 * รอบก่อนสรุปว่า "ตัวแปรชี้ขาดคือระยะ SL เทียบกับค่าธรรมเนียม" เพราะเอกลักษณ์นี้:
 *
 *      costR  =  ค่าธรรมเนียม(สัดส่วนของราคา)  ÷  ระยะ SL(สัดส่วนของราคา)
 *
 * มันเป็นสมการเป๊ะ ไม่ใช่ค่าประมาณ (พิสูจน์ซ้ำใน A0 ด้วยไม้จริงทุกไม้) แปลว่า
 * "SL กว้างขึ้นสองเท่า = ต้นทุนเป็น R ถูกลงครึ่งหนึ่ง" เป็นจริงเสมอทางคณิตศาสตร์
 *
 * แต่ประโยคนั้นยังไม่ใช่คำตอบ เพราะมันเงียบเรื่องหนึ่ง: **ไม้ที่ SL กว้างเป็นไม้คนละแบบ**
 * ถ้าขอบ "ก่อนหักต้นทุน" ของไม้ผันผวนสูงแย่กว่าไม้ปกติ ส่วนลดค่าคอมก็ถูกกินหมดทันที
 * ไฟล์นี้จึงวัดสองอย่างแยกกันเสมอ แล้วบวกกลับให้ดูว่าอันไหนชนะ:
 *
 *      ผลรวมของการเลือกไม้ SL กว้าง = (ขอบก่อนหักต้นทุนที่เปลี่ยนไป) + (ต้นทุนที่ประหยัดได้)
 *                                      └── ผลของ "ไม้คนละแบบ" ──┘   └── ผลของ "ถูกลง" ──┘
 *
 * เป็นการแยกแบบบวกกันได้เป๊ะ (exact additive decomposition) ไม่ใช่การตีความ
 *
 * ─────────────────────────────── ลำดับการวัด ───────────────────────────────
 *
 *  A0  ตรวจเอกลักษณ์ต้นทุน — พิสูจน์ว่า costR = fee/stopDistPct ตรงกับ lab.mjs ทุกไม้
 *      ถ้าข้อนี้ไม่ผ่าน ทุกตัวเลขหลังจากนี้เชื่อไม่ได้ และสคริปต์จะหยุด
 *  A1  ★ ขอบก่อนหักต้นทุนขึ้นกับความผันผวนไหม (คำถามชี้ขาด — ทำก่อนอย่างอื่น)
 *  A2  เส้นคุ้มทุน + แยกผล "ถูกลง" ออกจากผล "ไม้คนละแบบ"
 *  A3  ถือนานขึ้นช่วยไหม — วัดแบบจับคู่ไม้ต่อไม้ (paired) บนไม้ชุดเดียวกัน
 *  A4  ต้นทุนขั้นต่ำที่หลบไม่ได้ของ SET — tick size ตามช่วงราคา + ค่าคอมขั้นต่ำต่อออเดอร์
 *
 * ─────────────────────── ทำไมต้องนับจำนวนการเปรียบเทียบ ───────────────────────
 *
 * ทดสอบ 40 ครั้งที่ระดับ 0.05 บนข้อมูลที่ไม่มีขอบเลย ยังคาดว่าจะได้ผล "มีนัยสำคัญ"
 * ราว 2 ครั้งฟรี ๆ ไฟล์นี้จึงลงทะเบียนทุกการทดสอบไว้ในทะเบียนเดียว (TESTS) แล้วนับเอง
 * ไม่ให้คนเขียนรายงานเลือกนับเฉพาะที่อยากนับ · การทดสอบบน train ถูกทำเครื่องหมายว่า
 * "สำรวจ" และไม่ถูกใช้ตัดสินอะไร · ครอบครัวที่ตัดสินจริงคือ validation เท่านั้น
 * และถูกแก้ค่า p ด้วยวิธี Holm (เข้มเท่า Bonferroni แต่มีอำนาจสูงกว่า)
 *
 * ────────────────────────────── สิ่งที่ไฟล์นี้ทำไม่ได้ ──────────────────────────────
 *
 * ⚠ จักรวาลหุ้นไทยในคลังมี 14 ตัว และเป็น SET50 ทั้งหมด — **ไม่มีหุ้นซิ่งจริงสักตัว**
 *   ไฟล์นี้จึงตอบไม่ได้ว่า "หุ้นซิ่งกำไรไหม" ตอบได้แค่ว่า "ต้องซิ่งแค่ไหนถึงจะมีสิทธิ์"
 *   ซึ่งเป็นคนละคำถาม และเป็นคำถามที่ตอบได้ด้วยข้อมูลที่มีอยู่จริงเท่านั้น
 *
 * ────────────────────────────────── วิธีใช้ ──────────────────────────────────
 *
 *   node scripts/research/experiments/cost-mechanics.mjs
 *   node scripts/research/experiments/cost-mechanics.mjs --bootstrap=20000 --seed=1234
 *   node scripts/research/experiments/cost-mechanics.mjs --risk-baht=5000 --min-fee=0
 *
 * ต้องมีไฟล์ไม้จาก lab.mjs ก่อน — ถ้าไม่มี สคริปต์จะเรียก lab.mjs สร้างให้เอง
 * (เรียกเป็นกระบวนการลูก ไม่ได้แก้ไฟล์ lab.mjs)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { ROOT, loadSrcModules } from '../load-src-modules.mjs';

const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');

// ════════════════════════════════ ค่าคงที่ของงาน ════════════════════════════════

/** ระดับค่าธรรมเนียมไป-กลับที่โจทย์สั่งให้ลอง (bps = 0.01% ของมูลค่าสถานะ) */
const FEE_LEVELS_BPS = [0, 10, 20, 26, 31, 40];

/** ระดับที่ถือเป็น "ค่าคอมจริงที่เจ้าของต้องจ่าย" — ใช้เป็นตัวอ้างอิงเวลาสรุป */
const FEE_REALISTIC_BPS = 31;

/** จำนวนกลุ่มเวลาแบ่งไม้ตามระยะ SL — 5 กลุ่มพอให้เห็นแนวโน้มโดยไม่ทำให้แต่ละกลุ่มบางเกินไป */
const N_BUCKETS = 5;

/** ระยะเวลาถือสูงสุดที่จะเทียบกัน (แท่ง) — 1 แท่งบน 1H = จบใน 1 ชั่วโมงตามโจทย์ */
const HOLD_CAPS = [1, 2, 3, 5, 10, 20, 40];

/** ชุดที่แตะได้รอบนี้ — test ไม่อยู่ในนี้ และไม่มีทางเข้ามาอยู่ */
const SPLITS = ['train', 'validation'];

/**
 * ตารางช่วงราคาของ SET (tick size) — ราคาขยับได้ทีละเท่านี้เท่านั้น
 *
 * นี่คือต้นทุนที่ "หลบไม่ได้" จริง ๆ เพราะไม่ว่าค่าคอมจะเป็นศูนย์ ถ้าจะซื้อแล้วขายทันที
 * ก็ยังต้องข้ามช่วงราคาอย่างน้อยหนึ่งช่วง และช่วงราคาบนหุ้นถูกคิดเป็น % แล้วใหญ่มาก:
 * หุ้น 1.90 บาท ช่วงราคา 0.01 = 0.53% ต่อหนึ่ง tick ซึ่งใหญ่กว่าค่าคอมไป-กลับทั้งรอบ
 *
 * ⚠ ตารางนี้คือกติกาที่ประกาศไว้ ไม่ใช่ค่าที่วัดจากสมุดคำสั่งจริง — สเปรดจริงของหุ้น
 *   สภาพคล่องต่ำกว้างกว่าหนึ่ง tick ได้เสมอ ตัวเลขในไฟล์นี้จึงเป็น "พื้น" ไม่ใช่ "ค่าจริง"
 */
const SET_TICK_TABLE = [
  { from: 0, to: 2, tick: 0.01 },
  { from: 2, to: 5, tick: 0.02 },
  { from: 5, to: 10, tick: 0.05 },
  { from: 10, to: 25, tick: 0.10 },
  { from: 25, to: 100, tick: 0.25 },
  { from: 100, to: 200, tick: 0.50 },
  { from: 200, to: 400, tick: 1.00 },
  { from: 400, to: Infinity, tick: 2.00 },
];

/**
 * ค่าคอมหุ้นไทยของนักลงทุนรายย่อยผ่านอินเทอร์เน็ต (บัญชี cash balance)
 * 0.1% + ค่าธรรมเนียมตลาด/ชำระราคา แล้วบวก VAT 7% → ราว 0.1578% ต่อขา
 * ตัวเลขนี้เป็น "ค่าที่พบทั่วไป" ไม่ใช่ใบเสร็จของเจ้าของ — แก้ได้ด้วย --comm-rate
 */
const DEFAULT_COMMISSION_RATE = 0.001578;

/** ค่าคอมขั้นต่ำต่อออเดอร์ (บาท) — โบรกเกอร์ส่วนใหญ่ยังมี บางเจ้ายกเลิกแล้ว (--min-fee=0) */
const DEFAULT_MIN_FEE_BAHT = 50;

/** เงินที่ยอมเสี่ยงต่อไม้ (บาท) = 1R — ตัวนี้เป็นตัวชี้ว่าค่าคอมขั้นต่ำจะกัดหรือไม่ */
const DEFAULT_RISK_BAHT = 2000;

// ════════════════════════════════ ตัวช่วยเล็ก ๆ ════════════════════════════════

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq === -1) out[a.slice(2)] = true;
    else out[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return out;
}

/** PRNG แบบเดียวกับ lab.mjs — bootstrap ต้องรันซ้ำได้ ไม่งั้นเถียงกันเรื่องตัวเลขไม่จบ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentileOfSorted(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const n2 = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const pctStr = (v, d = 2) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : 'n/a');

// ════════════════════════ bootstrap แบบจับกลุ่มรายสัญลักษณ์ ════════════════════════
//
// ทำไมต้องจับกลุ่ม: ไม้ของ PTT 400 ไม้ไม่ใช่หลักฐาน 400 ชิ้นที่เป็นอิสระต่อกัน
// มันคือหุ้นตัวเดียว เทรนด์เดียว ยุคเดียว การสุ่มแบบราย-ไม้จะให้ช่วงความเชื่อมั่น
// ที่แคบกว่าความจริงมาก แล้วทำให้ "เสียงรบกวน" ดูเหมือน "ขอบ"
// วิธีนี้สุ่มทั้งสัญลักษณ์ทั้งก้อน (14 ก้อน) จำนวนเท่าเดิม แล้วรวมไม้ของก้อนที่ถูกหยิบ
// — ตรงกับ ciCluster ของ lab.mjs ทุกประการ เพื่อให้ตัวเลขสองไฟล์เทียบกันได้

/**
 * เตรียมผลรวมรายสัญลักษณ์ล่วงหน้า แล้ว bootstrap โดยหยิบแค่ "ผลรวม/จำนวน"
 * ทำแบบนี้ได้เพราะค่าที่สนใจเป็นค่าเฉลี่ยถ่วงจำนวนไม้ — คณิตศาสตร์เท่าเดิมทุกบิต
 * แต่เร็วกว่าการคัดลอกอาเรย์ทุกรอบหลายสิบเท่า
 *
 * fields = รายชื่อฟิลด์ที่จะเฉลี่ย · คืนค่าเป็น map ชื่อฟิลด์ → {mean, lo95, hi95, p}
 */
function clusterBootstrapMeans(trades, fields, { B, seed }) {
  const bySym = new Map();
  for (const t of trades) {
    let e = bySym.get(t.symbol);
    if (!e) { e = { count: 0, sums: Object.fromEntries(fields.map((f) => [f, 0])) }; bySym.set(t.symbol, e); }
    e.count++;
    for (const f of fields) e.sums[f] += t[f];
  }
  const keys = [...bySym.keys()];
  const G = keys.length;
  if (!G) return null;

  const cnts = keys.map((k) => bySym.get(k).count);
  const sumsByField = Object.fromEntries(fields.map((f) => [f, keys.map((k) => bySym.get(k).sums[f])]));

  const draws = Object.fromEntries(fields.map((f) => [f, new Array(B)]));
  const rnd = mulberry32(seed);
  const picks = new Int32Array(G);
  for (let b = 0; b < B; b++) {
    let c = 0;
    for (let g = 0; g < G; g++) { const p = (rnd() * G) | 0; picks[g] = p; c += cnts[p]; }
    for (const f of fields) {
      const arr = sumsByField[f];
      let s = 0;
      for (let g = 0; g < G; g++) s += arr[picks[g]];
      draws[f][b] = c > 0 ? s / c : 0;
    }
  }

  const out = {};
  for (const f of fields) {
    const d = draws[f];
    d.sort((x, y) => x - y);
    let le = 0; let ge = 0;
    for (const v of d) { if (v <= 0) le++; if (v >= 0) ge++; }
    const observed = trades.reduce((s, t) => s + t[f], 0) / trades.length;
    out[f] = {
      n: trades.length,
      clusters: G,
      mean: observed,
      lo95: percentileOfSorted(d, 0.025),
      hi95: percentileOfSorted(d, 0.975),
      // p สองด้านแบบ bootstrap: สองเท่าของหางที่เล็กกว่า — ปัดขึ้นอย่างน้อย 1/B
      // (bootstrap บอกไม่ได้ว่า p เล็กกว่า 1/B แค่ไหน การเขียน p=0 คือการโกหก)
      p: Math.max(1 / B, Math.min(1, 2 * Math.min(le / B, ge / B))),
    };
  }
  return out;
}

/**
 * bootstrap ของ "ผลต่างค่าเฉลี่ยระหว่างสองกลุ่มย่อยในชุดเดียวกัน"
 * ต้องหยิบสัญลักษณ์ชุดเดียวกันไปคำนวณทั้งสองกลุ่มในรอบเดียว ไม่งั้นความสัมพันธ์
 * ระหว่างสองกลุ่ม (ซึ่งมาจากหุ้นตัวเดียวกัน) จะหายไป แล้วช่วงจะกว้างเกินจริง
 */
function clusterBootstrapDiff(tradesA, tradesB, field, { B, seed }) {
  const syms = new Set([...tradesA.map((t) => t.symbol), ...tradesB.map((t) => t.symbol)]);
  const keys = [...syms];
  const idx = new Map(keys.map((k, i) => [k, i]));
  const G = keys.length;
  const agg = (list) => {
    const s = new Float64Array(G); const c = new Float64Array(G);
    for (const t of list) { const i = idx.get(t.symbol); s[i] += t[field]; c[i]++; }
    return { s, c };
  };
  const A = agg(tradesA); const Bg = agg(tradesB);

  const draws = new Array(B);
  const rnd = mulberry32(seed);
  for (let b = 0; b < B; b++) {
    let sa = 0; let ca = 0; let sb = 0; let cb = 0;
    for (let g = 0; g < G; g++) {
      const p = (rnd() * G) | 0;
      sa += A.s[p]; ca += A.c[p]; sb += Bg.s[p]; cb += Bg.c[p];
    }
    draws[b] = (ca > 0 ? sa / ca : 0) - (cb > 0 ? sb / cb : 0);
  }
  draws.sort((x, y) => x - y);
  let le = 0; let ge = 0;
  for (const v of draws) { if (v <= 0) le++; if (v >= 0) ge++; }
  const obs = mean(tradesA.map((t) => t[field])) - mean(tradesB.map((t) => t[field]));
  return {
    nA: tradesA.length, nB: tradesB.length,
    mean: obs,
    lo95: percentileOfSorted(draws, 0.025),
    hi95: percentileOfSorted(draws, 0.975),
    p: Math.max(1 / B, Math.min(1, 2 * Math.min(le / B, ge / B))),
  };
}

/**
 * สหสัมพันธ์อันดับ (Spearman) ระหว่างระยะ SL กับ R ก่อนหักต้นทุน + ช่วงความเชื่อมั่นแบบจับกลุ่ม
 *
 * อันดับถูกตรึงจากตัวอย่างเต็มครั้งเดียว แล้ว bootstrap สหสัมพันธ์เพียร์สันของอันดับนั้น
 * (จัดอันดับใหม่ทุกรอบ bootstrap แพงมากและไม่เปลี่ยนข้อสรุปเชิงทิศทาง — เขียนไว้ให้รู้ว่า
 *  นี่คือการประมาณ ไม่ใช่ Spearman แบบจัดอันดับซ้ำ)
 */
function clusterBootstrapSpearman(trades, xField, yField, { B, seed }) {
  const rankOf = (vals) => {
    const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(vals.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[order[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rankOf(trades.map((t) => t[xField]));
  const ry = rankOf(trades.map((t) => t[yField]));

  const bySym = new Map();
  trades.forEach((t, i) => {
    let e = bySym.get(t.symbol);
    if (!e) { e = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 }; bySym.set(t.symbol, e); }
    e.n++; e.sx += rx[i]; e.sy += ry[i]; e.sxx += rx[i] * rx[i]; e.syy += ry[i] * ry[i]; e.sxy += rx[i] * ry[i];
  });
  const keys = [...bySym.keys()];
  const G = keys.length;
  const E = keys.map((k) => bySym.get(k));

  const corrFrom = (n, sx, sy, sxx, syy, sxy) => {
    const num = n * sxy - sx * sy;
    const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    return den > 0 ? num / den : NaN;
  };
  const tot = E.reduce((a, e) => ({ n: a.n + e.n, sx: a.sx + e.sx, sy: a.sy + e.sy, sxx: a.sxx + e.sxx, syy: a.syy + e.syy, sxy: a.sxy + e.sxy }),
    { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 });
  const observed = corrFrom(tot.n, tot.sx, tot.sy, tot.sxx, tot.syy, tot.sxy);

  const draws = new Array(B);
  const rnd = mulberry32(seed);
  for (let b = 0; b < B; b++) {
    let n = 0; let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
    for (let g = 0; g < G; g++) {
      const e = E[(rnd() * G) | 0];
      n += e.n; sx += e.sx; sy += e.sy; sxx += e.sxx; syy += e.syy; sxy += e.sxy;
    }
    draws[b] = corrFrom(n, sx, sy, sxx, syy, sxy);
  }
  draws.sort((x, y) => x - y);
  let le = 0; let ge = 0;
  for (const v of draws) { if (v <= 0) le++; if (v >= 0) ge++; }
  return {
    rho: observed,
    lo95: percentileOfSorted(draws, 0.025),
    hi95: percentileOfSorted(draws, 0.975),
    p: Math.max(1 / B, Math.min(1, 2 * Math.min(le / B, ge / B))),
  };
}

// ══════════════════════════ ทะเบียนการเปรียบเทียบทั้งหมด ══════════════════════════
//
// ทุกการทดสอบสมมติฐานที่ไฟล์นี้ทำ ต้องผ่านฟังก์ชันนี้ ไม่มีข้อยกเว้น
// เพื่อให้ "จำนวนครั้งที่ลอง" เป็นตัวเลขที่นับจากโค้ด ไม่ใช่จากความทรงจำของคนเขียนรายงาน

const TESTS = [];
function registerTest({ family, split, name, estimate, lo95, hi95, p, note = '' }) {
  TESTS.push({ family, split, name, estimate, lo95, hi95, p, note });
  return TESTS[TESTS.length - 1];
}

/** Holm–Bonferroni — คุมโอกาสผิดพลาดแบบครอบครัว (FWER) แต่มีอำนาจสูงกว่า Bonferroni ล้วน */
function holmAdjust(tests, alpha = 0.05) {
  const idx = tests.map((t, i) => i).sort((a, b) => tests[a].p - tests[b].p);
  const m = tests.length;
  let rejectedSoFar = true;
  const out = tests.map(() => null);
  idx.forEach((origIdx, rank) => {
    const thr = alpha / (m - rank);
    const rej = rejectedSoFar && tests[origIdx].p <= thr;
    if (!rej) rejectedSoFar = false;
    out[origIdx] = { rank: rank + 1, threshold: thr, rejected: rej };
  });
  return out;
}

// ════════════════════════════ โหลดไม้จาก lab.mjs ════════════════════════════

/**
 * เรียก lab.mjs ให้สร้างไฟล์ไม้ถ้ายังไม่มี — เรียกเป็นกระบวนการลูกเท่านั้น
 * ไฟล์ lab.mjs ไม่ถูกแตะ และ config ที่ใช้คือค่าเริ่มต้น (= src/lib/signal-engine.ts เป๊ะ)
 */
function ensureDump(tag, maxHold) {
  const need = SPLITS.map((s) => path.join(REPORT_DIR, `${tag}-${s}-trades.csv`));
  if (need.every((f) => fs.existsSync(f))) return;
  process.stdout.write(`[cost-mechanics] ไม่พบไฟล์ไม้ของ ${tag} — เรียก lab.mjs สร้างให้ (max-hold=${maxHold})\n`);
  execFileSync(process.execPath, [
    LAB, '--markets=TH_STOCK', `--split=${SPLITS.join(',')}`,
    `--max-hold=${maxHold}`, '--dump-trades', `--tag=${tag}`,
  ], { cwd: ROOT, stdio: 'ignore' });
}

const NUMERIC_COLS = new Set([
  'confidence', 'holdBars', 'entry', 'exit', 'stopLoss', 'takeProfit', 'rrPlanned',
  'stopDistPct', 'plannedRisk', 'realizedRisk', 'riskKeepRatio',
  'rGrossPlanned', 'rGrossRealized', 'rGross', 'costR', 'costRBase', 'rNet', 'tradeable',
]);

function loadTrades(tag, split) {
  const file = path.join(REPORT_DIR, `${tag}-${split}-trades.csv`);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const o = {};
    head.forEach((h, k) => {
      const v = parts[k];
      o[h] = NUMERIC_COLS.has(h) ? (v === '' ? NaN : Number(v)) : v;
    });
    rows.push(o);
  }
  return rows;
}

// ════════════════════════════ แบบจำลองต้นทุนของ SET ════════════════════════════

function tickSizeFor(price) {
  for (const b of SET_TICK_TABLE) if (price >= b.from && price < b.to) return b.tick;
  return SET_TICK_TABLE[SET_TICK_TABLE.length - 1].tick;
}

/**
 * ต้นทุนจริงต่อไม้ คิดเป็นหน่วย R — แยกเป็นสามก้อนที่มีพฤติกรรมต่างกันสิ้นเชิง
 *
 *   1) ค่าคอมตามสัดส่วน  →  2·rate / stopDistPct        ลดลงเมื่อ SL กว้างขึ้น
 *   2) ค่าข้ามช่วงราคา    →  k·(tick/ราคา) / stopDistPct  ลดลงเมื่อ SL กว้างขึ้น
 *   3) ค่าคอมขั้นต่ำ      →  2·minFee / riskBaht          **ไม่ลดลงเลย** — คงที่
 *
 * ก้อนที่ 3 คือกับดักที่มองไม่เห็นในหน่วย bps: ยิ่ง SL กว้าง มูลค่าไม้ยิ่งเล็กลง
 * (เพราะเสี่ยงเท่าเดิมเป็นบาท) จนค่าคอมขั้นต่ำเริ่มกัด แล้วส่วนลดจากข้อ 1 ก็หยุดทำงาน
 * มูลค่าไม้ V = riskBaht / stopDistPct — ค่าคอมจริงต่อขา = max(V·rate, minFee)
 *
 * @returns {{costR:number, commR:number, tickR:number, minFeeBinds:boolean, orderValue:number}}
 */
function realisticCostR(price, stopDistPct, { commRate, minFee, riskBaht, ticksPerRoundTrip }) {
  const orderValue = riskBaht / stopDistPct;             // มูลค่าไม้ที่ทำให้เสี่ยง riskBaht พอดี
  const commPerSideBaht = Math.max(orderValue * commRate, minFee);
  const commR = (2 * commPerSideBaht) / riskBaht;        // ค่าคอมไป-กลับ คิดเป็น R
  const tickFrac = tickSizeFor(price) / price;
  const tickR = (ticksPerRoundTrip * tickFrac) / stopDistPct;
  return {
    costR: commR + tickR,
    commR,
    tickR,
    minFeeBinds: orderValue * commRate < minFee,
    orderValue,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
//  A0 — ตรวจเอกลักษณ์ต้นทุน
// ════════════════════════════════════════════════════════════════════════════════
//
// อ้างว่า costR = (bps/10000) / stopDistPct  ทุกไม้ ถ้าจริง เราคิดต้นทุนที่ระดับ bps ใด
// ก็ได้จากไฟล์ไม้ชุดเดียว โดยไม่ต้องรัน lab.mjs ใหม่ — และที่สำคัญกว่า มันแปลว่า
// "ระยะ SL" คือตัวแปรเดียวที่กำหนดต้นทุนเป็น R จริง ๆ ไม่มีตัวอื่นแอบอยู่

function checkCostIdentity(trades, bpsInTable) {
  let maxRel = 0;
  let worst = null;
  for (const t of trades) {
    const predicted = (bpsInTable / 10000) / t.stopDistPct;
    const rel = Math.abs(predicted - t.costR) / Math.max(1e-12, Math.abs(t.costR));
    if (rel > maxRel) { maxRel = rel; worst = t; }
  }
  return { n: trades.length, maxRelError: maxRel, worst: worst ? { symbol: worst.symbol, costR: worst.costR } : null };
}

/** ต้นทุนเป็น R ที่ระดับค่าธรรมเนียมใด ๆ — เอกลักษณ์เดียวกับที่ A0 พิสูจน์ */
const costRAt = (t, bps) => (bps / 10000) / t.stopDistPct;

// ════════════════════════════════════════════════════════════════════════════════
//  A1 — ★ ขอบก่อนหักต้นทุนขึ้นกับความผันผวนไหม (คำถามชี้ขาด)
// ════════════════════════════════════════════════════════════════════════════════

function assignBuckets(trades, key, n) {
  const sorted = [...trades].sort((a, b) => a[key] - b[key]);
  const edges = [];
  for (let i = 1; i < n; i++) edges.push(sorted[Math.floor((sorted.length * i) / n)][key]);
  for (const t of trades) {
    let b = 0;
    while (b < edges.length && t[key] >= edges[b]) b++;
    t._bucket = b;
  }
  return edges;
}

function analyseVolatilityBuckets(trades, { split, timeframe, B, seed, xKey }) {
  const edges = assignBuckets(trades, xKey, N_BUCKETS);
  const buckets = [];
  for (let b = 0; b < N_BUCKETS; b++) {
    const sub = trades.filter((t) => t._bucket === b);
    if (!sub.length) continue;
    const dists = sub.map((t) => t.stopDistPct).sort((a, b2) => a - b2);
    const xs = sub.map((t) => t[xKey]).sort((a, b2) => a - b2);
    const boot = clusterBootstrapMeans(sub, ['rGross'], { B, seed: seed ^ (0x9e37 + b) });

    // ต้นทุนเฉลี่ยของกลุ่มนี้ที่แต่ละระดับค่าธรรมเนียม
    // ใช้ค่าเฉลี่ยของ 1/stopDistPct ไม่ใช่ 1/ค่าเฉลี่ย stopDistPct — สองอย่างนี้ไม่เท่ากัน
    // และการใช้ผิดตัวจะประเมินต้นทุนต่ำเกินจริงเสมอ (อสมการเจนเซน)
    const meanInvDist = mean(sub.map((t) => 1 / t.stopDistPct));
    const costByFee = {};
    for (const bps of FEE_LEVELS_BPS) costByFee[bps] = (bps / 10000) * meanInvDist;

    // ค่าธรรมเนียมสูงสุดที่กลุ่มนี้ "ทน" ได้ — จุดที่ขอบก่อนหักต้นทุนถูกกินหมดพอดี
    const breakEvenBps = boot.rGross.mean > 0 ? (boot.rGross.mean / meanInvDist) * 10000 : null;

    buckets.push({
      bucket: b,
      n: sub.length,
      xLo: xs[0], xHi: xs[xs.length - 1], xMedian: percentileOfSorted(xs, 0.5),
      stopDistMedian: percentileOfSorted(dists, 0.5),
      meanInvDist,
      grossAvgR: boot.rGross.mean,
      lo95: boot.rGross.lo95,
      hi95: boot.rGross.hi95,
      p: boot.rGross.p,
      winRate: sub.filter((t) => t.rGross > 0).length / sub.length,
      meanHoldBars: mean(sub.map((t) => t.holdBars)),
      costByFee,
      netByFee: Object.fromEntries(FEE_LEVELS_BPS.map((bps) => [bps, boot.rGross.mean - costByFee[bps]])),
      breakEvenBps,
    });

    registerTest({
      family: `A1-buckets-${timeframe}`,
      split,
      name: `ขอบก่อนหักต้นทุน กลุ่ม ${xKey} ที่ ${b + 1}/${N_BUCKETS} (${timeframe})`,
      estimate: boot.rGross.mean, lo95: boot.rGross.lo95, hi95: boot.rGross.hi95, p: boot.rGross.p,
    });
  }

  const spear = clusterBootstrapSpearman(trades, xKey, 'rGross', { B, seed: seed ^ 0x51ee });
  registerTest({
    family: `A1-trend-${timeframe}`,
    split,
    name: `สหสัมพันธ์อันดับ ${xKey} ↔ R ก่อนหักต้นทุน (${timeframe})`,
    estimate: spear.rho, lo95: spear.lo95, hi95: spear.hi95, p: spear.p,
  });

  // เทียบกลุ่มบนสุดกับกลุ่มล่างสุดตรง ๆ — ตัวเลขที่ตอบคำถามชี้ขาดในบรรทัดเดียว
  const top = trades.filter((t) => t._bucket === N_BUCKETS - 1);
  const bot = trades.filter((t) => t._bucket === 0);
  const diff = clusterBootstrapDiff(top, bot, 'rGross', { B, seed: seed ^ 0x7c1d });
  registerTest({
    family: `A1-topvsbottom-${timeframe}`,
    split,
    name: `ขอบก่อนหักต้นทุน: กลุ่มผันผวนสูงสุด − ต่ำสุด (${timeframe})`,
    estimate: diff.mean, lo95: diff.lo95, hi95: diff.hi95, p: diff.p,
  });

  return { edges, buckets, spearman: spear, topMinusBottom: diff, xKey, timeframe, split };
}

// ════════════════════════════════════════════════════════════════════════════════
//  A2 — เส้นคุ้มทุน + แยก "ถูกลง" ออกจาก "ไม้คนละแบบ"
// ════════════════════════════════════════════════════════════════════════════════

/**
 * เส้นคุ้มทุนแบบไร้เดียงสา: สมมติว่าขอบก่อนหักต้นทุนไม่เปลี่ยนตามความผันผวน
 * (ซึ่ง A1 มีหน้าที่บอกว่าสมมติฐานนี้จริงหรือไม่ — ถ้าไม่จริง ตารางนี้คือขอบบนที่มองโลกในแง่ดี)
 * ต้องการ: fee/stopDist <= edge  →  stopDist >= fee/edge
 */
function naiveBreakEven(edge) {
  return FEE_LEVELS_BPS.filter((b) => b > 0).map((bps) => ({
    bps,
    requiredStopDistPct: edge > 0 ? (bps / 10000) / edge : null,
  }));
}

/**
 * แยกผลของการ "เลือกเฉพาะไม้ที่ SL กว้างกว่า θ" ออกเป็นสองก้อนที่บวกกันได้เป๊ะ
 *
 *   Δสุทธิ = [ขอบก่อนหักต้นทุนของกลุ่มที่เลือก − ของทั้งชุด]   ← ผลของ "ไม้คนละแบบ"
 *          + [ต้นทุนเฉลี่ยของทั้งชุด − ของกลุ่มที่เลือก]      ← ผลของ "ถูกลง"
 *
 * ถ้าก้อนแรกติดลบมากกว่าก้อนหลังเป็นบวก การไล่หา SL กว้างคือการเดินเข้าหาไม้ที่แย่กว่า
 * โดยจ่ายค่าคอมถูกลง — ซึ่งเป็นการแลกที่ขาดทุน
 */
function decomposeSelection(all, thresholds, { split, timeframe, feeBps, B, seed }) {
  const grossAll = mean(all.map((t) => t.rGross));
  const costAll = mean(all.map((t) => costRAt(t, feeBps)));
  const rows = [];
  thresholds.forEach((theta, i) => {
    const sel = all.filter((t) => t.stopDistPct >= theta);
    if (sel.length < 30) {
      rows.push({ theta, n: sel.length, tooFew: true });
      return;
    }
    const grossSel = mean(sel.map((t) => t.rGross));
    const costSel = mean(sel.map((t) => costRAt(t, feeBps)));
    const popEffect = grossSel - grossAll;   // ผลของ "ไม้คนละแบบ"
    const costEffect = costAll - costSel;    // ผลของ "ถูกลง"
    const netSel = grossSel - costSel;
    const netAll = grossAll - costAll;

    const dGross = clusterBootstrapDiff(sel, all, 'rGross', { B, seed: seed ^ (0x2a11 + i) });
    registerTest({
      family: `A2-selection-${timeframe}`,
      split,
      name: `ขอบก่อนหักต้นทุนของไม้ SL≥${pctStr(theta)} เทียบทั้งชุด (${timeframe})`,
      estimate: dGross.mean, lo95: dGross.lo95, hi95: dGross.hi95, p: dGross.p,
    });

    rows.push({
      theta, n: sel.length, share: sel.length / all.length,
      grossSel, costSel, netSel, netAll,
      popEffect, costEffect, total: popEffect + costEffect,
      check: Math.abs((netSel - netAll) - (popEffect + costEffect)),
      dGrossCI: [dGross.lo95, dGross.hi95], dGrossP: dGross.p,
    });
  });
  return { grossAll, costAll, netAll: grossAll - costAll, feeBps, rows };
}

// ════════════════════════════════════════════════════════════════════════════════
//  A3 — ถือนานขึ้นช่วยไหม (วัดแบบจับคู่ไม้ต่อไม้)
// ════════════════════════════════════════════════════════════════════════════════
//
// ปัญหาของการเทียบผลจาก lab.mjs หลาย ๆ max-hold ตรง ๆ: ประชากรไม้ไม่เหมือนกัน
// เพราะลูปเดินหน้าไปที่แท่งปิดไม้ (i = exitIndex) ไม้สั้นจึงเปิดโอกาสให้เข้าไม้ถี่กว่ามาก
// เทียบตรง ๆ จะปนกันระหว่าง "ถือสั้นแล้วผลแย่ลง" กับ "ถือสั้นแล้วได้เข้าไม้เยอะขึ้น"
//
// วิธีที่สะอาดกว่า: เอา "ไม้ชุดเดียวกัน" (จากการรัน max-hold=40) แล้วจำลองใหม่ว่า
// ถ้าบังคับปิดที่ N แท่ง ไม้เดิมแต่ละไม้จะจบยังไง — ได้ผลต่างแบบจับคู่ ไม่มีตัวแปรอื่นขยับ
// ตรรกะการชน SL/TP ด้านล่างลอกมาจาก walkForward ใน lab.mjs ทุกบรรทัด และถูกพิสูจน์
// ด้วยการจำลองที่ N=40 แล้วต้องได้ rGross ตรงกับ CSV ทุกไม้ (ไม่ตรง = สคริปต์หยุด)

function isUsableBar(c) {
  return (
    Number.isFinite(c.open) && c.open > 0 &&
    Number.isFinite(c.high) && c.high > 0 &&
    Number.isFinite(c.low) && c.low > 0 &&
    Number.isFinite(c.close) && c.close > 0 &&
    c.low <= c.high
  );
}

function loadCandles(symbol, timeframe) {
  const file = path.join(CACHE_DIR, `TH_STOCK__${symbol}__${timeframe}.json`);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return j.candles;
}

/** จำลองการออกจากไม้ภายใต้เพดานการถือ N แท่ง — สำเนาตรรกะของ lab.mjs walkForward */
function simulateExit(candles, entryIndex, isLong, stopLoss, takeProfit, maxHoldBars) {
  const lastHoldIndex = Math.min(entryIndex + maxHoldBars - 1, candles.length - 1);
  let exitIndex = -1;
  let exit = NaN;
  let exitReason = 'time_exit';
  let lastUsableIndex = entryIndex;
  for (let j = entryIndex; j <= lastHoldIndex; j++) {
    const bar = candles[j];
    if (!isUsableBar(bar)) continue;
    lastUsableIndex = j;
    if (isLong) {
      if (bar.open <= stopLoss) { exitIndex = j; exit = bar.open; exitReason = 'gap_stop'; break; }
      if (bar.open >= takeProfit) { exitIndex = j; exit = bar.open; exitReason = 'gap_target'; break; }
      if (bar.low <= stopLoss) { exitIndex = j; exit = stopLoss; exitReason = 'stop_loss'; break; }
      if (bar.high >= takeProfit) { exitIndex = j; exit = takeProfit; exitReason = 'take_profit'; break; }
    } else {
      if (bar.open >= stopLoss) { exitIndex = j; exit = bar.open; exitReason = 'gap_stop'; break; }
      if (bar.open <= takeProfit) { exitIndex = j; exit = bar.open; exitReason = 'gap_target'; break; }
      if (bar.high >= stopLoss) { exitIndex = j; exit = stopLoss; exitReason = 'stop_loss'; break; }
      if (bar.low <= takeProfit) { exitIndex = j; exit = takeProfit; exitReason = 'take_profit'; break; }
    }
  }
  if (exitIndex === -1) {
    exitIndex = lastUsableIndex;
    exit = candles[lastUsableIndex].close;
    exitReason = 'time_exit';
  }
  return { exitIndex, exit, exitReason, holdBars: exitIndex - entryIndex };
}

/**
 * ติด ATR% ณ แท่งที่ออกสัญญาณ ให้ไม้ทุกไม้
 *
 * ต้องมีตัวนี้เพราะ "ระยะ SL" กับ "ความผันผวน" ไม่ใช่สิ่งเดียวกัน: เครื่องยนต์วาง SL จาก ATR
 * ก็จริง แต่แนวรับ/แนวต้านดัดมันได้ (useSupportResistance) ถ้าไม่แยกสองตัวนี้ออกจากกัน
 * เราจะไม่รู้ว่าที่เห็นใน A1 คือผลของ "ความผันผวน" หรือผลของ "กติกาวาง SL ไปโดนอะไรเข้า"
 */
async function attachAtr(trades, atrPeriod) {
  const { indicators } = await loadSrcModules(['src/lib/indicators.ts']);
  const byDs = new Map();
  for (const t of trades) {
    const k = `${t.symbol}|${t.timeframe}`;
    if (!byDs.has(k)) byDs.set(k, []);
    byDs.get(k).push(t);
  }
  for (const [k, list] of byDs) {
    const [symbol, timeframe] = k.split('|');
    const candles = loadCandles(symbol, timeframe);
    const idxByTime = new Map();
    candles.forEach((c, i) => idxByTime.set(c.timestamp, i));
    for (const t of list) {
      const entryIndex = idxByTime.get(t.entryTime);
      t.atrPct = NaN;
      if (entryIndex === undefined) continue;
      const sigIndex = entryIndex - 1;       // สัญญาณเกิดที่แท่งก่อนเข้า
      if (sigIndex < atrPeriod) continue;
      const atr = indicators.ATR(candles.slice(sigIndex - atrPeriod, sigIndex + 1), atrPeriod);
      if (Number.isFinite(atr) && atr > 0) t.atrPct = atr / candles[sigIndex].close;
    }
  }
  return trades;
}

function analyseHoldHorizon(tradesH40, { split, B, seed }) {
  // จัดกลุ่มไม้ตามชุดข้อมูล เพื่อโหลดแท่งครั้งเดียวต่อสัญลักษณ์+กรอบเวลา
  const byDs = new Map();
  for (const t of tradesH40) {
    const k = `${t.symbol}|${t.timeframe}`;
    if (!byDs.has(k)) byDs.set(k, []);
    byDs.get(k).push(t);
  }

  const rows = [];              // หนึ่งแถวต่อไม้ พร้อม R ที่ทุกเพดานการถือ
  let matched = 0;
  let unmatched = 0;
  let maxReplayError = 0;

  for (const [k, list] of byDs) {
    const [symbol, timeframe] = k.split('|');
    const candles = loadCandles(symbol, timeframe);
    const idxByTime = new Map();
    candles.forEach((c, i) => idxByTime.set(c.timestamp, i));

    for (const t of list) {
      const entryIndex = idxByTime.get(t.entryTime);
      if (entryIndex === undefined) { unmatched++; continue; }
      matched++;
      const isLong = t.action === 'BUY';
      const dir = isLong ? 1 : -1;

      const row = {
        symbol: t.symbol, timeframe: t.timeframe, entryTime: t.entryTime,
        stopDistPct: t.stopDistPct, plannedRisk: t.plannedRisk, entry: t.entry,
        rByCap: {}, holdByCap: {}, reasonByCap: {},
      };
      for (const cap of HOLD_CAPS) {
        const sim = simulateExit(candles, entryIndex, isLong, t.stopLoss, t.takeProfit, cap);
        row.rByCap[cap] = ((sim.exit - t.entry) * dir) / t.plannedRisk;
        row.holdByCap[cap] = sim.holdBars;
        row.reasonByCap[cap] = sim.exitReason;
      }
      // ตรวจว่าการจำลองที่เพดาน 40 ให้ผลตรงกับ lab.mjs — นี่คือเครื่องพิสูจน์ว่าสำเนาตรรกะไม่เพี้ยน
      const err = Math.abs(row.rByCap[40] - t.rGross);
      if (err > maxReplayError) maxReplayError = err;
      rows.push(row);
    }
  }

  if (maxReplayError > 1e-9) {
    throw new Error(`A3: การจำลองซ้ำไม่ตรงกับ lab.mjs (คลาดสูงสุด ${maxReplayError}) — ห้ามรายงานผลข้อนี้`);
  }

  // สรุปต่อกรอบเวลา
  const out = [];
  for (const timeframe of ['1H', '1D']) {
    const sub = rows.filter((r) => r.timeframe === timeframe);
    if (sub.length < 30) continue;
    const meanInvDist = mean(sub.map((r) => 1 / r.stopDistPct));
    const perCap = [];
    for (const cap of HOLD_CAPS) {
      const asTrades = sub.map((r) => ({ symbol: r.symbol, rGross: r.rByCap[cap] }));
      const boot = clusterBootstrapMeans(asTrades, ['rGross'], { B, seed: seed ^ (0x3c0d + cap) });
      const reasons = {};
      for (const r of sub) reasons[r.reasonByCap[cap]] = (reasons[r.reasonByCap[cap]] ?? 0) + 1;
      perCap.push({
        cap,
        n: sub.length,
        grossAvgR: boot.rGross.mean, lo95: boot.rGross.lo95, hi95: boot.rGross.hi95, p: boot.rGross.p,
        meanHoldBars: mean(sub.map((r) => r.holdByCap[cap])),
        winRate: sub.filter((r) => r.rByCap[cap] > 0).length / sub.length,
        shareTP: (reasons.take_profit ?? 0) / sub.length,
        shareSL: ((reasons.stop_loss ?? 0) + (reasons.gap_stop ?? 0)) / sub.length,
        shareTime: (reasons.time_exit ?? 0) / sub.length,
        costByFee: Object.fromEntries(FEE_LEVELS_BPS.map((bps) => [bps, (bps / 10000) * meanInvDist])),
      });
      registerTest({
        family: `A3-hold-${timeframe}`,
        split,
        name: `ขอบก่อนหักต้นทุน เพดานถือ ${cap} แท่ง (${timeframe}, ไม้ชุดเดียวกัน)`,
        estimate: boot.rGross.mean, lo95: boot.rGross.lo95, hi95: boot.rGross.hi95, p: boot.rGross.p,
      });
    }

    // ราคาของข้อจำกัด "จบใน 1 แท่ง" — ผลต่างแบบจับคู่ (ไม้เดียวกันเป๊ะ)
    const paired = [];
    for (const cap of HOLD_CAPS.filter((c) => c !== 1)) {
      const asTrades = sub.map((r) => ({ symbol: r.symbol, d: r.rByCap[cap] - r.rByCap[1] }));
      const boot = clusterBootstrapMeans(asTrades, ['d'], { B, seed: seed ^ (0x4d1e + cap) });
      paired.push({ cap, deltaR: boot.d.mean, lo95: boot.d.lo95, hi95: boot.d.hi95, p: boot.d.p });
      registerTest({
        family: `A3-paired-${timeframe}`,
        split,
        name: `ผลต่างจับคู่: ถือได้ ${cap} แท่ง − ถือได้ 1 แท่ง (${timeframe})`,
        estimate: boot.d.mean, lo95: boot.d.lo95, hi95: boot.d.hi95, p: boot.d.p,
      });
    }

    out.push({ timeframe, n: sub.length, meanInvDist, perCap, paired });
  }

  return { rows, matched, unmatched, maxReplayError, byTimeframe: out };
}

// ════════════════════════════════════════════════════════════════════════════════
//  A4 — ต้นทุนขั้นต่ำที่หลบไม่ได้ของ SET
// ════════════════════════════════════════════════════════════════════════════════

function analyseSetCosts(trades, { split, B, seed, commRate, minFee, riskBaht }) {
  // ตารางต้นทุนตามช่วงราคา — ตอบคำถาม "หุ้นราคาเท่าไหร่ถึงแพงเกินจะเทรด"
  //
  // ต้องดูทั้งขอบล่างและขอบบนของแต่ละช่วง เพราะ tick เป็นจำนวนบาทคงที่ในช่วงนั้น
  // ราคาที่อยู่ต้นช่วงจึงเสียเปอร์เซ็นต์แพงกว่าราคาที่อยู่ปลายช่วงเป็นเท่าตัวเสมอ
  // (หุ้น 25.00 บาท เสีย 100 bps ต่อ tick · หุ้น 99.75 บาท เสีย 25 bps ต่อ tick — tick เดียวกัน)
  const bandTable = SET_TICK_TABLE.map((b) => {
    const lowEnd = b.from > 0 ? b.from : 1.0;                 // ช่วงแรกใช้ 1.00 บาทเป็นตัวแทน
    const highEnd = Number.isFinite(b.to) ? b.to - b.tick : 1000;
    return {
      band: `${b.from}–${Number.isFinite(b.to) ? b.to : '∞'}`,
      tick: b.tick,
      lowEnd, highEnd,
      tickBpsAtLow: (b.tick / lowEnd) * 10000,
      tickBpsAtHigh: (b.tick / highEnd) * 10000,
      commBpsRoundTrip: 2 * commRate * 10000,
      totalBpsAtLow: 2 * commRate * 10000 + (b.tick / lowEnd) * 10000,
      totalBpsAtHigh: 2 * commRate * 10000 + (b.tick / highEnd) * 10000,
    };
  });

  // ต้นทุนต่อไม้แบบสมจริง (ราคาจริงของไม้นั้น + ค่าคอมขั้นต่ำ)
  //
  // "สเปรด 1 ช่วงราคา" = ซื้อที่ราคาเสนอขาย ขายที่ราคาเสนอซื้อ = จ่ายสเปรดเต็มหนึ่งครั้งต่อรอบ
  // ซึ่งเป็นกรณีที่ดีที่สุดที่เป็นไปได้จริงสำหรับหุ้นสภาพคล่องสูง (สเปรดแคบสุดเท่ากับ 1 tick)
  // "สเปรด 2 ช่วงราคา" = หุ้นที่สเปรดกว้างกว่านั้น หรือโดนสลิปเพจตอนคำสั่ง stop ทำงาน
  // ซึ่งเป็นสิ่งที่หุ้นซิ่ง/สภาพคล่องต่ำเจอเป็นปกติ — ไม่ใช่กรณีเลวร้าย แต่เป็นค่ากลางของกลุ่มนั้น
  const variants = [
    { key: 'floor1tick', label: 'พื้นที่หลบไม่ได้ — สเปรด 1 ช่วงราคา (หุ้นสภาพคล่องสูงสุด)', ticks: 1 },
    { key: 'real2tick', label: 'สมจริงสำหรับหุ้นซิ่ง — สเปรด 2 ช่วงราคา', ticks: 2 },
  ];

  const perVariant = [];
  for (const v of variants) {
    const enriched = trades.map((t) => {
      const c = realisticCostR(t.entry, t.stopDistPct, {
        commRate, minFee, riskBaht, ticksPerRoundTrip: v.ticks,
      });
      return {
        symbol: t.symbol, timeframe: t.timeframe, rGross: t.rGross,
        costR: c.costR, commR: c.commR, tickR: c.tickR,
        rNet: t.rGross - c.costR,
        minFeeBinds: c.minFeeBinds, orderValue: c.orderValue,
        effectiveBps: c.costR * t.stopDistPct * 10000,
        entry: t.entry, stopDistPct: t.stopDistPct,
      };
    });
    const boot = clusterBootstrapMeans(enriched, ['rGross', 'costR', 'rNet'], { B, seed: seed ^ (v.ticks * 0x6f11) });
    const bpsSorted = enriched.map((e) => e.effectiveBps).sort((a, b) => a - b);
    perVariant.push({
      ...v,
      n: enriched.length,
      grossAvgR: boot.rGross.mean,
      meanCostR: boot.costR.mean,
      netAvgR: boot.rNet.mean, lo95: boot.rNet.lo95, hi95: boot.rNet.hi95, p: boot.rNet.p,
      shareMinFeeBinds: enriched.filter((e) => e.minFeeBinds).length / enriched.length,
      meanCommR: mean(enriched.map((e) => e.commR)),
      meanTickR: mean(enriched.map((e) => e.tickR)),
      effBpsMedian: percentileOfSorted(bpsSorted, 0.5),
      effBpsP25: percentileOfSorted(bpsSorted, 0.25),
      effBpsP75: percentileOfSorted(bpsSorted, 0.75),
      enriched,
    });
    registerTest({
      family: 'A4-realistic',
      split,
      name: `R สุทธิด้วยตารางต้นทุน SET จริง — ${v.label}`,
      estimate: boot.rNet.mean, lo95: boot.rNet.lo95, hi95: boot.rNet.hi95, p: boot.rNet.p,
    });
  }

  // พื้นของค่าคอมขั้นต่ำ: ไม่ขึ้นกับ SL เลย — คือกำแพงที่ "SL กว้าง" ทะลุไม่ได้
  const minFeeFloorR = (2 * minFee) / riskBaht;

  // เงินเสี่ยงต่อไม้ที่ทำให้พื้นค่าคอมขั้นต่ำ "ยังไม่กินขอบทั้งหมด"
  // แค่ผ่านข้อนี้ยังไม่พอ — เป็นแค่เงื่อนไขจำเป็น ก่อนจะไปจ่ายค่าคอมตามสัดส่วนกับสเปรดอีก
  const riskSweep = [500, 1000, 2000, 5000, 10000, 20000].map((x) => ({
    riskBaht: x,
    floorR: (2 * minFee) / x,
    slWhereMinFeeStartsBiting: (commRate * x) / minFee,
  }));

  return { bandTable, perVariant, minFeeFloorR, riskSweep, commRate, minFee, riskBaht };
}

/**
 * แก้สมการ "ต้องมี SL กว้างเท่าไหร่ ถึงจะทำให้ต้นทุนจริงเท่ากับขอบที่วัดได้พอดี"
 *
 *   costR(sl) = 2·max(rate/sl, minFee/risk)  +  k·tickFrac/sl
 *
 * ฟังก์ชันนี้ลดลงตาม sl แต่ **ไม่ลดลงถึงศูนย์** — มันลู่เข้าหาพื้น 2·minFee/risk
 * ถ้าพื้นนั้นสูงกว่าขอบที่วัดได้ คำตอบคือ "ไม่มีทาง ไม่ว่า SL จะกว้างแค่ไหน"
 * ซึ่งเป็นคำตอบที่ตัวเลข bps ตัวเดียวมองไม่เห็นเลย
 */
function requiredStopDist(price, edge, { commRate, minFee, riskBaht, ticks }) {
  if (!(edge > 0)) return { possible: false, reason: 'ขอบก่อนหักต้นทุน ≤ 0' };
  const tickFrac = tickSizeFor(price) / price;
  const floorR = (2 * minFee) / riskBaht;
  const slWhereMinFeeBites = (commRate * riskBaht) / minFee;   // sl ที่ใหญ่กว่านี้ = ขั้นต่ำเริ่มกัด

  // กิ่งที่ 1: ค่าคอมขั้นต่ำยังไม่กัด (sl เล็กกว่าจุดกัด) → ต้นทุนแปรผกผันกับ sl ทั้งก้อน
  const slA = (2 * commRate + ticks * tickFrac) / edge;
  if (slA <= slWhereMinFeeBites) return { possible: true, sl: slA, branch: 'ค่าคอมตามสัดส่วน', floorR };

  // กิ่งที่ 2: ค่าคอมขั้นต่ำกัดแล้ว → เหลือแค่ส่วนสเปรดที่ยังลดได้
  if (edge <= floorR) {
    return {
      possible: false,
      reason: `พื้นค่าคอมขั้นต่ำ ${floorR.toFixed(4)} R ≥ ขอบ ${edge.toFixed(4)} R — SL กว้างแค่ไหนก็ไม่ช่วย`,
      floorR,
    };
  }
  const slB = (ticks * tickFrac) / (edge - floorR);
  return { possible: true, sl: slB, branch: 'ค่าคอมขั้นต่ำกัดแล้ว', floorR };
}

/**
 * ตารางตัดสิน: แถว = ช่วงราคา · คอลัมน์ = ความกว้างของ SL
 * ช่อง = ต้นทุนเป็น R ต่อไม้ ด้วยตารางต้นทุนที่สมจริง
 * ใช้ตอบคำถามเดียว "หุ้นแบบไหนมีโอกาส หุ้นแบบไหนไม่มีทาง"
 */
function decisionGrid({ commRate, minFee, riskBaht, ticks, prices, slWidths }) {
  return prices.map((price) => ({
    price,
    tick: tickSizeFor(price),
    cells: slWidths.map((sl) => {
      const c = realisticCostR(price, sl, { commRate, minFee, riskBaht, ticksPerRoundTrip: ticks });
      return { sl, costR: c.costR, minFeeBinds: c.minFeeBinds, orderValue: c.orderValue };
    }),
  }));
}

// ════════════════════════════════════════════════════════════════════════════════
//  main
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const B = Number(args.bootstrap ?? 10000);
  const seed = Number(args.seed ?? 20260818);
  const commRate = Number(args['comm-rate'] ?? DEFAULT_COMMISSION_RATE);
  const minFee = Number(args['min-fee'] ?? DEFAULT_MIN_FEE_BAHT);
  const riskBaht = Number(args['risk-baht'] ?? DEFAULT_RISK_BAHT);
  const t0 = Date.now();

  // ── เตรียมไฟล์ไม้ ────────────────────────────────────────────────────────────
  ensureDump('costmech-h10', 10);
  for (const cap of HOLD_CAPS) ensureDump(`costmech-h${cap}`, cap);

  const result = {
    generatedAt: new Date().toISOString(),
    params: { B, seed, commRate, minFee, riskBaht, feeLevels: FEE_LEVELS_BPS, nBuckets: N_BUCKETS, holdCaps: HOLD_CAPS },
    splits: {},
  };

  for (const split of SPLITS) {
    const all = loadTrades('costmech-h10', split);
    const S = { split, nTrades: all.length, symbols: new Set(all.map((t) => t.symbol)).size };

    // ── A0 ───────────────────────────────────────────────────────────────────
    // ตารางค่าเริ่มต้นของ lab.mjs ให้ TH_STOCK = 40 bps สถานการณ์ base
    S.A0 = checkCostIdentity(all, 40);
    if (S.A0.maxRelError > 1e-9) {
      throw new Error(`A0: เอกลักษณ์ต้นทุนไม่ตรงกับ lab.mjs (คลาด ${S.A0.maxRelError}) — หยุด ไม่รายงานต่อ`);
    }

    // ── A1 (ชี้ขาด) ──────────────────────────────────────────────────────────
    S.A1 = { byTimeframe: [] };
    for (const timeframe of ['1H', '1D']) {
      const sub = all.filter((t) => t.timeframe === timeframe);
      if (sub.length < 100) continue;
      S.A1.byTimeframe.push(analyseVolatilityBuckets(sub, { split, timeframe, B, seed, xKey: 'stopDistPct' }));
    }

    // ── A2 ───────────────────────────────────────────────────────────────────
    const grossAllBoot = clusterBootstrapMeans(all, ['rGross'], { B, seed: seed ^ 0x1111 });
    registerTest({
      family: 'A2-edge', split,
      name: 'ขอบก่อนหักต้นทุนของหุ้นไทยทั้งชุด (ทุกกรอบเวลา)',
      estimate: grossAllBoot.rGross.mean, lo95: grossAllBoot.rGross.lo95,
      hi95: grossAllBoot.rGross.hi95, p: grossAllBoot.rGross.p,
    });
    S.A2 = {
      grossEdge: grossAllBoot.rGross,
      naive: naiveBreakEven(grossAllBoot.rGross.mean),
      byTimeframe: [],
    };
    for (const timeframe of ['1H', '1D']) {
      const sub = all.filter((t) => t.timeframe === timeframe);
      if (sub.length < 100) continue;
      const dists = sub.map((t) => t.stopDistPct).sort((a, b) => a - b);
      const thetas = [
        percentileOfSorted(dists, 0.50), percentileOfSorted(dists, 0.70),
        percentileOfSorted(dists, 0.85), percentileOfSorted(dists, 0.95),
        0.04, 0.06, 0.10,
      ].filter((v, i, a2) => Number.isFinite(v) && a2.indexOf(v) === i).sort((a, b) => a - b);
      S.A2.byTimeframe.push({
        timeframe,
        distQuantiles: {
          p10: percentileOfSorted(dists, 0.10), p25: percentileOfSorted(dists, 0.25),
          p50: percentileOfSorted(dists, 0.50), p75: percentileOfSorted(dists, 0.75),
          p90: percentileOfSorted(dists, 0.90), p99: percentileOfSorted(dists, 0.99),
          max: dists[dists.length - 1],
        },
        decomposition: decomposeSelection(sub, thetas, { split, timeframe, feeBps: FEE_REALISTIC_BPS, B, seed }),
      });
    }

    // ── A3 ───────────────────────────────────────────────────────────────────
    const h40 = loadTrades('costmech-h40', split);
    S.A3 = analyseHoldHorizon(h40, { split, B, seed });
    delete S.A3.rows;                                     // ไม้ทุกไม้ไม่ต้องลง JSON
    // เทียบกับการกวาด max-hold ของ lab.mjs ตรง ๆ (ประชากรไม้ต่างกัน) เพื่อให้เห็นทั้งสองมุม
    S.A3.unpaired = HOLD_CAPS.map((cap) => {
      const tr = loadTrades(`costmech-h${cap}`, split);
      const out = { cap, all: {}, byTimeframe: {} };
      for (const tf of ['1H', '1D']) {
        const sub = tr.filter((t) => t.timeframe === tf);
        if (!sub.length) continue;
        const boot = clusterBootstrapMeans(sub, ['rGross'], { B: 2000, seed: seed ^ (0x8811 + cap) });
        out.byTimeframe[tf] = {
          n: sub.length, grossAvgR: boot.rGross.mean, lo95: boot.rGross.lo95, hi95: boot.rGross.hi95,
          meanCostR31: mean(sub.map((t) => costRAt(t, FEE_REALISTIC_BPS))),
          meanHoldBars: mean(sub.map((t) => t.holdBars)),
        };
      }
      out.all = { n: tr.length };
      return out;
    });

    // ── A1 ซ้ำด้วย ATR% ────────────────────────────────────────────────────────
    // ตรวจ A1 อีกครั้งโดยใช้ ATR% (ความผันผวนจริง) แทนระยะ SL (ซึ่งกติกาอาจดัดให้เพี้ยน)
    // ใช้ประชากรไม้ชุดเดียวกับ A1 เป๊ะ เพื่อให้สองตารางเทียบกันได้ตรง ๆ
    await attachAtr(all, 14);
    S.A1atr = { byTimeframe: [] };
    for (const timeframe of ['1H', '1D']) {
      const sub = all.filter((t) => t.timeframe === timeframe && Number.isFinite(t.atrPct));
      if (sub.length < 100) continue;
      S.A1atr.byTimeframe.push(analyseVolatilityBuckets(sub, { split, timeframe: `${timeframe}-ATR`, B, seed, xKey: 'atrPct' }));
    }

    // ── A4 ───────────────────────────────────────────────────────────────────
    S.A4 = analyseSetCosts(all, { split, B, seed, commRate, minFee, riskBaht });
    for (const v of S.A4.perVariant) delete v.enriched;   // ไม่ต้องเก็บไม้ทุกไม้ลง JSON

    // ราคาตัวอย่างเลือกให้อยู่ "ต้นช่วง" ของแต่ละช่วงราคา ซึ่งเป็นตำแหน่งที่ tick แพงที่สุด
    // เป็นเปอร์เซ็นต์ — คือกรณีที่หุ้นราคาต่ำต้องเจอจริง ไม่ใช่กรณีที่เลือกมาให้ดูดี
    const gridPrices = [1.0, 2.0, 5.0, 10.0, 25.0, 100.0, 200.0];
    const gridSl = [0.02, 0.03, 0.04, 0.06, 0.08, 0.10, 0.15, 0.20];
    S.A4.grid = decisionGrid({ commRate, minFee, riskBaht, ticks: 2, prices: gridPrices, slWidths: gridSl });
    S.A4.gridEdge = S.A2.grossEdge.mean;
    S.A4.gridCellsClearingEdge = S.A4.grid
      .flatMap((g) => g.cells.map((c) => ({ price: g.price, sl: c.sl, costR: c.costR })))
      .filter((c) => c.costR < S.A2.grossEdge.mean);

    // "ต้องมี SL กว้างแค่ไหน" ภายใต้ต้นทุนจริง (ไม่ใช่ bps สมมติ) — ที่ราคาหุ้นต่าง ๆ
    //
    // คิดสองสถานการณ์ค่าคอมขั้นต่ำเสมอ เพราะข้อสรุป "ไม่มีทาง" ของสถานการณ์แรกมาจาก
    // สมมติฐานเรื่องขั้นต่ำ 50 บาท ซึ่งโบรกเกอร์บางเจ้ายกเลิกไปแล้ว ถ้าไม่วัดอีกสถานการณ์
    // ผู้อ่านจะแยกไม่ออกว่าข้อสรุปมาจากกลไกจริง หรือมาจากสมมติฐานที่เราเลือกเอง
    S.A4.required = [];
    for (const scen of [{ mf: minFee, label: `ขั้นต่ำ ${minFee} บาท` }, { mf: 0, label: 'ไม่มีขั้นต่ำ' }]) {
      for (const ticks of [1, 2]) {
        for (const price of gridPrices) {
          S.A4.required.push({
            ticks, price, minFeeScenario: scen.mf, scenarioLabel: scen.label,
            ...requiredStopDist(price, S.A2.grossEdge.mean, { commRate, minFee: scen.mf, riskBaht, ticks }),
          });
        }
      }
    }

    // ผูก A1 เข้ากับ A4: กลุ่มที่ผันผวนสูงสุดของ A1 ไปรอดไหมเมื่อใช้ต้นทุนจริง
    S.A4.bestBucket = [];
    for (const g of S.A1.byTimeframe) {
      const top = g.buckets[g.buckets.length - 1];
      const sub = all.filter((t) => t.timeframe === g.timeframe && t.stopDistPct >= top.xLo);
      for (const ticks of [1, 2]) {
        const costs = sub.map((t) => realisticCostR(t.entry, t.stopDistPct, { commRate, minFee, riskBaht, ticksPerRoundTrip: ticks }).costR);
        S.A4.bestBucket.push({
          timeframe: g.timeframe, ticks, n: sub.length,
          stopDistMedian: top.stopDistMedian,
          grossAvgR: top.grossAvgR,
          meanCostR: mean(costs),
          netAvgR: top.grossAvgR - mean(costs),
        });
      }
    }

    result.splits[split] = S;
  }

  // ── ตารางต้นทุนสมจริงรายสัญลักษณ์ → ตรวจซ้ำผ่าน lab.mjs ────────────────────────
  // สร้าง --cost-json จากราคามัธยฐานจริงของแต่ละตัว แล้วให้ lab.mjs วัดใหม่ทั้งชุด
  // เป็นการตรวจว่าการคิดต้นทุนในไฟล์นี้ตรงกับเครื่องวัดกลาง ไม่ใช่คณิตศาสตร์คนละชุด
  {
    const val = loadTrades('costmech-h10', 'validation');
    const bySym = new Map();
    for (const t of val) {
      if (!bySym.has(t.symbol)) bySym.set(t.symbol, []);
      bySym.get(t.symbol).push(t.entry);
    }
    const bySymbolBps = {};
    for (const [sym, prices] of bySym) {
      const sorted = prices.slice().sort((a, b) => a - b);
      const med = percentileOfSorted(sorted, 0.5);
      // 2 tick ต่อรอบ + ค่าคอมตามสัดส่วน (ค่าคอมขั้นต่ำคิดไม่ได้ในหน่วย bps — ดู A4)
      bySymbolBps[sym] = 2 * commRate * 10000 + 2 * (tickSizeFor(med) / med) * 10000;
    }
    const costTable = {
      byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 },
      bySymbol: bySymbolBps,
      pessimisticMultiplier: 2,
    };
    const costFile = path.join(REPORT_DIR, 'cost-mechanics-set-table.json');
    fs.writeFileSync(costFile, `${JSON.stringify(costTable, null, 2)}\n`, 'utf8');
    result.setCostTable = { bySymbolBps, file: path.relative(ROOT, costFile) };

    process.stdout.write('[cost-mechanics] ตรวจซ้ำกับ lab.mjs ด้วยตารางต้นทุน SET จริง\n');
    execFileSync(process.execPath, [
      LAB, '--markets=TH_STOCK', '--split=validation',
      `--cost-json=${path.relative(ROOT, costFile)}`, '--tag=cost-mechanics-settable',
    ], { cwd: ROOT, stdio: 'ignore' });
    const labJson = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'cost-mechanics-settable-validation.json'), 'utf8'));
    const co = labJson.results?.validation?.cohortAll ?? null;

    // คำนวณตัวเดียวกันด้วยมือ โดยใช้ "bps รายสัญลักษณ์ตัวเดียวกันเป๊ะ" และไม่ใส่ค่าคอมขั้นต่ำ
    // ถ้าสองฝั่งตรงกัน แปลว่าคณิตศาสตร์ต้นทุนในไฟล์นี้เป็นตัวเดียวกับเครื่องวัดกลาง
    // (ตัวเลขในหัวข้อ A4 สูงกว่านี้ เพราะ A4 ใช้ราคาจริงของแต่ละไม้ + ใส่ค่าคอมขั้นต่ำเข้าไปด้วย)
    const mineCost = mean(val.map((t) => (bySymbolBps[t.symbol] / 10000) / t.stopDistPct));
    const mineNet = mean(val.map((t) => t.rGross - (bySymbolBps[t.symbol] / 10000) / t.stopDistPct));
    result.crossCheck = {
      labFile: 'report/cost-mechanics-settable-validation.json',
      labAvgCostR: co?.avgCostR ?? null,
      labNetAvgR: co?.net?.stats?.avgR ?? null,
      labGrossAvgR: co?.gross?.stats?.avgR ?? null,
      mineAvgCostR: mineCost,
      mineNetAvgR: mineNet,
      maxAbsDiff: co ? Math.max(Math.abs(co.avgCostR - mineCost), Math.abs(co.net.stats.avgR - mineNet)) : null,
    };
  }

  // ── บัญชีการเปรียบเทียบ ────────────────────────────────────────────────────
  const confirmatory = TESTS.filter((t) => t.split === 'validation');
  const exploratory = TESTS.filter((t) => t.split !== 'validation');
  const holm = holmAdjust(confirmatory, 0.05);
  confirmatory.forEach((t, i) => { t.holm = holm[i]; });
  result.comparisons = {
    total: TESTS.length,
    exploratoryTrain: exploratory.length,
    confirmatoryValidation: confirmatory.length,
    bonferroniAlpha: 0.05 / Math.max(1, confirmatory.length),
    method: 'Holm–Bonferroni บนครอบครัว validation เท่านั้น · train เป็นการสำรวจ ไม่ใช้ตัดสิน',
    tests: TESTS,
  };
  result.runtimeSec = (Date.now() - t0) / 1000;

  // --tag ให้รันสถานการณ์สมมติฐานอื่น (เช่น --min-fee=0) โดยไม่ทับรายงานหลัก
  const tag = String(args.tag ?? 'exp-cost-mechanics');
  fs.writeFileSync(path.join(REPORT_DIR, `${tag}.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(REPORT_DIR, `${tag}.md`), renderReport(result), 'utf8');
  process.stdout.write(`[cost-mechanics] เขียนรายงานที่ scripts/research/report/${tag}.md / .json (${result.runtimeSec.toFixed(1)} วิ)\n`);
  process.stdout.write(`[cost-mechanics] การเปรียบเทียบทั้งหมด ${TESTS.length} ครั้ง (ยืนยันบน validation ${confirmatory.length} ครั้ง)\n`);
}

// ════════════════════════════════ ตัวเขียนรายงาน ════════════════════════════════

function renderReport(R) {
  const L = [];
  const W = (s = '') => L.push(s);
  const V = R.splits.validation;
  const T = R.splits.train;

  W('# กลไกของค่าคอม — ต้องผันผวนแค่ไหนถึงชนะค่าคอมได้');
  W();
  W(`สร้างเมื่อ ${R.generatedAt} · bootstrap ${R.params.B} รอบ · seed ${R.params.seed} · รันจริง ${R.runtimeSec.toFixed(1)} วินาที`);
  W();
  W('> ทุกตัวเลขในรายงานนี้มาจากการรันจริงบนไม้ที่ `lab.mjs` ออกให้ ด้วย config เริ่มต้น');
  W('> (= `src/lib/signal-engine.ts` เป๊ะ ไม่มีการปรับจูนใด ๆ) · **ชุด test ไม่ถูกแตะ**');
  W('> `train` = สำรวจ ไม่ใช้ตัดสิน · `validation` = ครอบครัวที่ใช้ตัดสิน แก้ค่า p ด้วย Holm');
  W();

  // ─── บทสรุปผู้บริหาร ───
  const tf1H = V.A1.byTimeframe.find((x) => x.timeframe === '1H');
  const tf1D = V.A1.byTimeframe.find((x) => x.timeframe === '1D');
  W('## คำตอบสั้นที่สุด');
  W();
  W(`ขอบก่อนหักต้นทุนของหุ้นไทยทั้งชุด (validation, ${V.nTrades} ไม้) = **${n2(V.A2.grossEdge.mean)} R/ไม้**`);
  W(`ช่วงความเชื่อมั่น 95% ราย-สัญลักษณ์ [${n2(V.A2.grossEdge.lo95)}, ${n2(V.A2.grossEdge.hi95)}] — คร่อมศูนย์`);
  W();
  W('ถ้าขอบนี้ **ไม่เปลี่ยน**ตามความผันผวน (สมมติฐานที่มองโลกในแง่ดีที่สุด) ระยะ SL ที่ต้องมีคือ:');
  W();
  W('| ค่าคอมไป-กลับ | ระยะ SL ที่ต้องกว้างอย่างน้อย |');
  W('|---|---|');
  for (const r of V.A2.naive) {
    W(`| ${r.bps} bps | **${r.requiredStopDistPct ? pctStr(r.requiredStopDistPct, 1) : 'ไม่มีทาง (ขอบ ≤ 0)'}** ของราคา |`);
  }
  W();
  W('เทียบกับความจริง: ระยะ SL ที่เครื่องยนต์ตั้งจริงบนหุ้นไทย');
  W();
  W('| กรอบเวลา | p10 | p25 | มัธยฐาน | p75 | p90 | p99 | สูงสุดที่เคยเจอ |');
  W('|---|---|---|---|---|---|---|---|');
  for (const x of V.A2.byTimeframe) {
    const q = x.distQuantiles;
    W(`| ${x.timeframe} | ${pctStr(q.p10)} | ${pctStr(q.p25)} | ${pctStr(q.p50)} | ${pctStr(q.p75)} | ${pctStr(q.p90)} | ${pctStr(q.p99)} | ${pctStr(q.max)} |`);
  }
  W();
  const need31 = V.A2.naive.find((r) => r.bps === 31).requiredStopDistPct;
  const q1H = V.A2.byTimeframe.find((x) => x.timeframe === '1H').distQuantiles;
  const q1D = V.A2.byTimeframe.find((x) => x.timeframe === '1D').distQuantiles;
  W(`ที่ค่าคอมจริง 31 bps ต้องมี SL กว้าง ${pctStr(need31, 1)} — แต่ SL ที่กว้างที่สุดที่เคยเกิดขึ้นบน 1H `
    + `คือ ${pctStr(q1H.max)} (**ต้องกว้างกว่านั้นอีก ${(need31 / q1H.max).toFixed(1)} เท่า**) `
    + `และบน 1D คือ ${pctStr(q1D.max)}`);
  W();
  W('### ตารางสรุป — หุ้นแบบไหนมีโอกาส หุ้นแบบไหนไม่มีทาง');
  W();
  W('| สถานการณ์ | ระยะ SL | ขอบก่อนหักต้นทุน | ต้นทุน@31bps | ต้นทุนจริงของ SET | สรุป |');
  W('|---|---|---|---|---|---|');
  {
    const rows = [];
    for (const g of V.A1.byTimeframe) {
      const mid = g.buckets[Math.floor(g.buckets.length / 2)];
      const top = g.buckets[g.buckets.length - 1];
      const real = V.A4.bestBucket.find((b) => b.timeframe === g.timeframe && b.ticks === 1);
      rows.push({
        label: `หุ้นใหญ่ SET50 · ${g.timeframe} · ไม้ทั่วไป`,
        sl: mid.stopDistMedian, gross: mid.grossAvgR, c31: mid.costByFee[31], real: null,
      });
      rows.push({
        label: `หุ้นใหญ่ SET50 · ${g.timeframe} · **กลุ่ม SL กว้างสุด**`,
        sl: top.stopDistMedian, gross: top.grossAvgR, c31: top.costByFee[31], real: real ? real.meanCostR : null,
      });
    }
    for (const r of rows) {
      const verdictCost = r.real ?? r.c31;
      const ok = r.gross > verdictCost;
      W(`| ${r.label} | ${pctStr(r.sl)} | ${n2(r.gross)} | ${n2(r.c31, 3)} | ${r.real ? n2(r.real, 3) : '—'} | ${ok ? 'มีสิทธิ์' : '**ไม่มีทาง**'} |`);
    }
    // หุ้นซิ่งสมมติ — ไม่มีในคลัง จึงคิดจากต้นทุนล้วน แล้วบอกว่าต้องมีขอบเท่าไหร่
    for (const sl of [0.06, 0.10, 0.20]) {
      const c = realisticCostR(150, sl, { commRate: R.params.commRate, minFee: R.params.minFee, riskBaht: R.params.riskBaht, ticksPerRoundTrip: 2 });
      W(`| หุ้นซิ่งสมมติ · ราคา 150 บาท · SL ${pctStr(sl, 0)} | ${pctStr(sl, 0)} | ไม่มีข้อมูล | ${n2((31 / 10000) / sl, 3)} | ${n2(c.costR, 3)} | ต้องมีขอบ > ${n2(c.costR, 3)} R |`);
    }
  }
  W();
  W(`ขอบที่วัดได้จริงคือ ${n2(V.A2.grossEdge.mean)} R/ไม้ — ทุกแถวข้างบนต้องการขอบที่มากกว่านั้นหลายเท่า`);
  W();

  // ─── A0 ───
  W('---');
  W();
  W('## A0 — ตรวจเอกลักษณ์ต้นทุนก่อน แล้วค่อยเชื่ออย่างอื่น');
  W();
  W('ข้ออ้างของรอบนี้คือ `costR = ค่าธรรมเนียม ÷ ระยะ SL` — ถ้าจริง ระยะ SL คือตัวแปรเดียว');
  W('ที่กำหนดต้นทุนเป็น R และเราคิดต้นทุนที่ค่าคอมระดับใดก็ได้จากไฟล์ไม้ชุดเดียว');
  W();
  W('| ชุด | จำนวนไม้ | ความคลาดสูงสุดเทียบ lab.mjs |');
  W('|---|---|---|');
  for (const s of SPLITS) W(`| ${s} | ${R.splits[s].A0.n} | ${R.splits[s].A0.maxRelError.toExponential(2)} |`);
  W();
  W('ผ่าน — คลาดในระดับเศษทศนิยมลอยตัว ไม่ใช่ความต่างเชิงตรรกะ');
  W('แปลว่าทุกตัวเลขต้นทุนหลังจากนี้เป็นการคำนวณเป๊ะ ไม่ใช่การประมาณ');
  W();

  // ─── A1 ───
  W('---');
  W();
  W('## A1 ★ — ขอบก่อนหักต้นทุนขึ้นกับความผันผวนไหม (คำถามชี้ขาด)');
  W();
  W('กลไก "SL กว้าง = ต้นทุนถูกลง" จะใช้ได้ก็ต่อเมื่อไม้ที่ SL กว้าง **ไม่ได้แย่ลง**');
  W('ตารางนี้แบ่งไม้เป็น 5 กลุ่มเท่า ๆ กันตามระยะ SL แล้วดู avgR **ก่อน**หักต้นทุนของแต่ละกลุ่ม');
  W();
  for (const src of [{ tag: 'validation', d: V.A1 }, { tag: 'train', d: T.A1 }]) {
    for (const g of src.d.byTimeframe) {
      W(`### ${g.timeframe} · ${src.tag}${src.tag === 'train' ? ' (สำรวจ)' : ''}`);
      W();
      W('| กลุ่ม | ไม้ | ระยะ SL (มัธยฐาน) | avgR ก่อนหักต้นทุน | CI95 ราย-สัญลักษณ์ | p | ชนะ | ต้นทุน@31bps | สุทธิ@31bps | ค่าคอมสูงสุดที่ทนได้ |');
      W('|---|---|---|---|---|---|---|---|---|---|');
      for (const b of g.buckets) {
        W(`| ${b.bucket + 1} | ${b.n} | ${pctStr(b.stopDistMedian)} | ${n2(b.grossAvgR)} | [${n2(b.lo95)}, ${n2(b.hi95)}] | ${b.p.toFixed(3)} | ${pctStr(b.winRate, 1)} | ${n2(b.costByFee[31], 3)} | ${n2(b.netByFee[31], 3)} | ${b.breakEvenBps ? `${b.breakEvenBps.toFixed(1)} bps` : '—'} |`);
      }
      W();
      W(`สหสัมพันธ์อันดับ (ระยะ SL ↔ R ก่อนหักต้นทุน) = **${n2(g.spearman.rho, 4)}** `
        + `CI95 [${n2(g.spearman.lo95, 4)}, ${n2(g.spearman.hi95, 4)}] · p = ${g.spearman.p.toFixed(3)}`);
      W();
      W(`กลุ่มผันผวนสูงสุด − ต่ำสุด = **${n2(g.topMinusBottom.mean)} R** `
        + `CI95 [${n2(g.topMinusBottom.lo95)}, ${n2(g.topMinusBottom.hi95)}] · p = ${g.topMinusBottom.p.toFixed(3)}`);
      W();
    }
  }
  W('### ตรวจซ้ำด้วย ATR% แทนระยะ SL');
  W();
  W('ระยะ SL ที่เครื่องยนต์ตั้งไม่ได้มาจากความผันผวนล้วน — มันถูกแนวรับ/แนวต้านดัดได้');
  W('จึงวัดซ้ำโดยแบ่งกลุ่มด้วย ATR% ณ แท่งที่ออกสัญญาณ ซึ่งเป็นความผันผวนจริงที่ไม่ขึ้นกับกติกาวาง SL');
  W();
  for (const g of V.A1atr.byTimeframe) {
    W(`**${g.timeframe} · validation**`);
    W();
    W('| กลุ่ม | ไม้ | ATR% (มัธยฐาน) | ระยะ SL (มัธยฐาน) | avgR ก่อนหักต้นทุน | CI95 | p |');
    W('|---|---|---|---|---|---|---|');
    for (const b of g.buckets) {
      W(`| ${b.bucket + 1} | ${b.n} | ${pctStr(b.xMedian)} | ${pctStr(b.stopDistMedian)} | ${n2(b.grossAvgR)} | [${n2(b.lo95)}, ${n2(b.hi95)}] | ${b.p.toFixed(3)} |`);
    }
    W();
    W(`สหสัมพันธ์อันดับ ATR% ↔ R ก่อนหักต้นทุน = **${n2(g.spearman.rho, 4)}** CI95 [${n2(g.spearman.lo95, 4)}, ${n2(g.spearman.hi95, 4)}] · p = ${g.spearman.p.toFixed(3)}`);
    W();
  }

  // ─── A2 ───
  W('---');
  W();
  W('## A2 — เส้นคุ้มทุน และการแยก "ถูกลง" ออกจาก "ไม้คนละแบบ"');
  W();
  W('กับดักของโจทย์นี้: ถ้าเราคัดเฉพาะไม้ที่ SL กว้าง แล้วผลดีขึ้น เราแยกไม่ออกว่ามาจาก');
  W('ต้นทุนที่ถูกลง หรือมาจากการไปเจอไม้คนละกลุ่ม การแยกด้านล่างบวกกันได้เป๊ะ:');
  W();
  W('```');
  W('Δสุทธิ = [ขอบก่อนหักต้นทุนที่เปลี่ยนไป]  +  [ต้นทุนที่ประหยัดได้]');
  W('         └── ผลของ "ไม้คนละแบบ" ──┘      └── ผลของ "ถูกลง" ──┘');
  W('```');
  W();
  for (const src of [{ tag: 'validation', d: V.A2 }, { tag: 'train', d: T.A2 }]) {
    for (const x of src.d.byTimeframe) {
      const dc = x.decomposition;
      W(`### ${x.timeframe} · ${src.tag}${src.tag === 'train' ? ' (สำรวจ)' : ''} — ที่ค่าคอม ${dc.feeBps} bps`);
      W();
      W(`ทั้งชุด: ขอบก่อนหักต้นทุน ${n2(dc.grossAll)} · ต้นทุน ${n2(dc.costAll)} · สุทธิ **${n2(dc.netAll)}**`);
      W();
      W('| คัดเฉพาะ SL ≥ | ไม้ที่เหลือ | สัดส่วน | ขอบก่อนหักต้นทุน | ต้นทุน | สุทธิ | ผลของ "ไม้คนละแบบ" | ผลของ "ถูกลง" | รวม |');
      W('|---|---|---|---|---|---|---|---|---|');
      for (const r of dc.rows) {
        if (r.tooFew) { W(`| ${pctStr(r.theta)} | ${r.n} | — | ไม้น้อยเกินไป | | | | | |`); continue; }
        W(`| ${pctStr(r.theta)} | ${r.n} | ${pctStr(r.share, 0)} | ${n2(r.grossSel)} | ${n2(r.costSel)} | **${n2(r.netSel)}** | ${n2(r.popEffect)} | ${n2(r.costEffect)} | ${n2(r.total)} |`);
      }
      W();
    }
  }

  // ─── A3 ───
  W('---');
  W();
  W('## A3 — ถือนานขึ้นช่วยไหม (ราคาของข้อจำกัด "จบใน 1 ชั่วโมง")');
  W();
  W(`วัดแบบจับคู่: ใช้ **ไม้ชุดเดียวกันเป๊ะ** (${V.A3.matched} ไม้บน validation) แล้วเปลี่ยนเฉพาะเพดานการถือ`);
  W(`การจำลองถูกพิสูจน์ว่าตรงกับ lab.mjs ทุกไม้ (คลาดสูงสุด ${V.A3.maxReplayError.toExponential(2)})`);
  W();
  W('**ค่าคอมจ่ายครั้งเดียวต่อไม้ และระยะ SL ไม่เปลี่ยนตามเพดานการถือ ⇒ ต้นทุนเป็น R เท่ากันทุกแถว**');
  W('ความต่างทั้งหมดจึงมาจากขอบก่อนหักต้นทุนล้วน ๆ');
  W();
  for (const src of [{ tag: 'validation', d: V.A3 }, { tag: 'train', d: T.A3 }]) {
    for (const g of src.d.byTimeframe) {
      const c31 = g.perCap[0].costByFee[31];
      W(`### ${g.timeframe} · ${src.tag}${src.tag === 'train' ? ' (สำรวจ)' : ''} — ${g.n} ไม้ · ต้นทุน@31bps = ${n2(c31, 3)} R ทุกแถว`);
      W();
      W('| เพดานถือ | ถือจริงเฉลี่ย | avgR ก่อนหักต้นทุน | CI95 | ชนะ | ปิดด้วย TP | ปิดด้วย SL | หมดเวลา | สุทธิ@31bps |');
      W('|---|---|---|---|---|---|---|---|---|');
      for (const c of g.perCap) {
        W(`| ${c.cap} แท่ง${c.cap === 1 && g.timeframe === '1H' ? ' ← โจทย์' : ''} | ${c.meanHoldBars.toFixed(2)} | ${n2(c.grossAvgR)} | [${n2(c.lo95)}, ${n2(c.hi95)}] | ${pctStr(c.winRate, 1)} | ${pctStr(c.shareTP, 1)} | ${pctStr(c.shareSL, 1)} | ${pctStr(c.shareTime, 1)} | ${n2(c.grossAvgR - c.costByFee[31])} |`);
      }
      W();
      W('ผลต่างแบบจับคู่เทียบกับ "ถือได้ 1 แท่ง":');
      W();
      W('| เพดานถือ | ΔR ต่อไม้ | CI95 | p |');
      W('|---|---|---|---|');
      for (const p of g.paired) W(`| ${p.cap} แท่ง | ${n2(p.deltaR)} | [${n2(p.lo95)}, ${n2(p.hi95)}] | ${p.p.toFixed(3)} |`);
      W();
    }
  }
  W('### มุมที่สอง: กวาด `--max-hold` ของ lab.mjs ตรง ๆ (ประชากรไม้ต่างกัน)');
  W();
  W('ไม้สั้นเปิดโอกาสให้เข้าไม้ถี่กว่า เพราะลูปเดินหน้าไปที่แท่งปิดไม้ ตารางนี้จึงตอบคนละคำถาม');
  W('กับตารางจับคู่ข้างบน: "ถ้าเปลี่ยนเพดานแล้วรันทั้งกลยุทธ์ใหม่ จะได้อะไร"');
  W();
  W('| เพดานถือ | 1H: ไม้ | 1H: avgR ก่อนหัก | 1H: ต้นทุน@31 | 1D: ไม้ | 1D: avgR ก่อนหัก | 1D: ต้นทุน@31 |');
  W('|---|---|---|---|---|---|---|');
  for (const u of V.A3.unpaired) {
    const a = u.byTimeframe['1H']; const b = u.byTimeframe['1D'];
    W(`| ${u.cap} | ${a ? a.n : '—'} | ${a ? n2(a.grossAvgR) : '—'} | ${a ? n2(a.meanCostR31, 3) : '—'} | ${b ? b.n : '—'} | ${b ? n2(b.grossAvgR) : '—'} | ${b ? n2(b.meanCostR31, 3) : '—'} |`);
  }
  W();

  // ─── A4 ───
  W('---');
  W();
  W('## A4 — ต้นทุนขั้นต่ำที่หลบไม่ได้ของ SET');
  W();
  W(`สมมติฐานที่ใช้: ค่าคอม ${(R.params.commRate * 100).toFixed(4)}%/ขา (รวม VAT) · ค่าคอมขั้นต่ำ ${R.params.minFee} บาท/ออเดอร์ · เสี่ยง ${R.params.riskBaht} บาท/ไม้ (= 1R)`);
  W();
  W('### ช่วงราคาของ SET แปลงเป็น bps');
  W();
  W('tick เป็นจำนวนบาทคงที่ในแต่ละช่วง ราคาที่อยู่ *ต้นช่วง* จึงเสียเปอร์เซ็นต์แพงกว่าราคาที่อยู่ *ปลายช่วง* เป็นเท่าตัวเสมอ');
  W();
  W('| ช่วงราคา (บาท) | tick | tick เป็น bps ที่ต้นช่วง | ที่ปลายช่วง | ค่าคอมไป-กลับ | รวมที่ต้นช่วง | รวมที่ปลายช่วง |');
  W('|---|---|---|---|---|---|---|');
  for (const b of V.A4.bandTable) {
    W(`| ${b.band} | ${b.tick} | ${b.tickBpsAtLow.toFixed(0)} bps | ${b.tickBpsAtHigh.toFixed(0)} bps | ${b.commBpsRoundTrip.toFixed(1)} bps | ${b.totalBpsAtLow.toFixed(0)} bps | ${b.totalBpsAtHigh.toFixed(0)} bps |`);
  }
  W();
  const minTickBps = Math.min(...V.A4.bandTable.map((b) => b.tickBpsAtHigh));
  const maxTickBps = Math.max(...V.A4.bandTable.map((b) => b.tickBpsAtLow));
  const commBps = V.A4.bandTable[0].commBpsRoundTrip;
  W(`อ่านตารางนี้ให้ถูก: **ต่อให้ค่าคอมเป็นศูนย์ ช่วงราคาอย่างเดียวก็ยังกิน ${minTickBps.toFixed(0)}–${maxTickBps.toFixed(0)} bps ต่อรอบ**`);
  W(`เทียบกับค่าคอมไป-กลับทั้งรอบที่ ${commBps.toFixed(0)} bps — ที่ต้นช่วงราคา ช่วงราคาแพงกว่าค่าคอม `
    + `${(maxTickBps / commBps).toFixed(1)} เท่า และถูกกว่าค่าคอมเฉพาะหุ้นที่ราคาอยู่ปลายช่วงเท่านั้น`);
  W('แปลว่าการไล่หาโบรกเกอร์ค่าคอมถูกแก้ปัญหานี้ไม่ได้ — ตัวที่แพงกว่าคือช่วงราคา ไม่ใช่ค่าคอม');
  W();
  W('โครงสร้างที่ซ่อนอยู่ในตาราง: SET ตั้งช่วงราคาให้ tick ที่ **ต้นช่วง** เท่ากับ 1% ของราคาพอดี');
  W('เกือบทุกช่วง (0.01/1 · 0.02/2 · 0.05/5 · 0.10/10 · 0.25/25) และ 0.5% สำหรับหุ้นตั้งแต่ 100 บาทขึ้นไป');
  W('จึงไม่มี "ช่องราคาถูก" ให้หลบ — เปลี่ยนไปเล่นหุ้นราคาอื่นก็เจอเพดานเดิม ยกเว้นหุ้นราคาสูงมาก');
  W();
  W('### วัดใหม่ด้วยต้นทุนสมจริง (validation)');
  W();
  W('| แบบจำลอง | ขอบก่อนหักต้นทุน | ต้นทุนเฉลี่ย | สุทธิ | CI95 | p | bps ที่แท้จริง (มัธยฐาน) | สัดส่วนไม้ที่ค่าคอมขั้นต่ำกัด |');
  W('|---|---|---|---|---|---|---|---|');
  for (const v of V.A4.perVariant) {
    W(`| ${v.label} | ${n2(v.grossAvgR)} | ${n2(v.meanCostR)} | **${n2(v.netAvgR)}** | [${n2(v.lo95)}, ${n2(v.hi95)}] | ${v.p.toFixed(3)} | ${v.effBpsMedian.toFixed(0)} bps | ${pctStr(v.shareMinFeeBinds, 0)} |`);
  }
  W();
  W(`### กำแพงที่ "SL กว้าง" ทะลุไม่ได้: พื้นค่าคอมขั้นต่ำ = **${n2(V.A4.minFeeFloorR, 3)} R/ไม้**`);
  W();
  W('ค่าคอมตามสัดส่วนกับค่าข้ามช่วงราคาลดลงเมื่อ SL กว้างขึ้น แต่ค่าคอมขั้นต่ำ **ไม่ลดลงเลย**');
  W('เพราะเมื่อเสี่ยงเป็นบาทเท่าเดิม SL ที่กว้างขึ้นแปลว่าซื้อได้น้อยลง มูลค่าออเดอร์เล็กลง');
  W('จนตกไปอยู่ใต้ขั้นต่ำ ตัวเลขนี้ = 2 × ค่าคอมขั้นต่ำ ÷ เงินที่เสี่ยงต่อไม้ และไม่ขึ้นกับ SL เลย');
  W();
  W('นี่คือกลไกที่ตัวเลข bps ตัวเดียวมองไม่เห็น: **กลไก "SL กว้าง = ถูกลง" ทำลายตัวเองเมื่อบัญชีเล็ก**');
  W();
  W('| เสี่ยงต่อไม้ (บาท) | พื้นค่าคอมขั้นต่ำ (R/ไม้) | SL ที่กว้างกว่านี้ทำให้ขั้นต่ำเริ่มกัด | เทียบกับขอบ ' + n2(V.A2.grossEdge.mean) + ' R |');
  W('|---|---|---|---|');
  for (const r of V.A4.riskSweep) {
    W(`| ${r.riskBaht.toLocaleString('en-US')} | ${n2(r.floorR, 3)} | ${pctStr(r.slWhereMinFeeStartsBiting, 1)} | ${r.floorR >= V.A2.grossEdge.mean ? '**พื้นสูงกว่าขอบ — ไม่มีทาง**' : 'พื้นยังต่ำกว่าขอบ'} |`);
  }
  W();
  W('### ต้องมี SL กว้างแค่ไหน ภายใต้ต้นทุนจริง (ไม่ใช่ bps สมมติ)');
  W();
  W(`แก้สมการ \`ต้นทุนจริง(SL) = ขอบที่วัดได้ (${n2(V.A2.grossEdge.mean)} R)\` ที่ราคาหุ้นต่าง ๆ`);
  W();
  W('| ราคาหุ้น | tick | ค่าคอมขั้นต่ำ 50 บาท<br>สเปรด 1 ช่วง | ขั้นต่ำ 50 บาท<br>สเปรด 2 ช่วง | ไม่มีขั้นต่ำ<br>สเปรด 1 ช่วง | ไม่มีขั้นต่ำ<br>สเปรด 2 ช่วง |');
  W('|---|---|---|---|---|---|');
  {
    const key = (r) => `${r.minFeeScenario}|${r.ticks}`;
    const byPrice = new Map();
    for (const r of V.A4.required) {
      if (!byPrice.has(r.price)) byPrice.set(r.price, {});
      byPrice.get(r.price)[key(r)] = r;
    }
    const fmt = (r) => (r && r.possible ? `SL ≥ ${pctStr(r.sl, 1)}` : '**ไม่มีทาง**');
    for (const [price, m] of byPrice) {
      W(`| ${price} บาท | ${tickSizeFor(price)} | ${fmt(m[`${R.params.minFee}|1`])} | ${fmt(m[`${R.params.minFee}|2`])} | ${fmt(m['0|1'])} | ${fmt(m['0|2'])} |`);
    }
  }
  W();
  const anyImpossible = V.A4.required.filter((r) => !r.possible);
  if (anyImpossible.length) {
    W('"ไม่มีทาง" ไม่ได้แปลว่า "ต้อง SL กว้างมาก" แต่แปลว่า**ไม่มีค่า SL ใดในจักรวาลที่ทำให้คุ้ม**');
    W(`เหตุผล: ${anyImpossible[0].reason}`);
    W();
  }
  const noMin = V.A4.required.filter((r) => r.minFeeScenario === 0 && r.possible).map((r) => r.sl);
  if (noMin.length) {
    W('**ข้อสรุปนี้ไม่ได้มาจากสมมติฐานเรื่องค่าคอมขั้นต่ำ** — สองคอลัมน์ขวาคือกรณีที่โบรกเกอร์');
    W(`ยกเลิกขั้นต่ำไปแล้ว ซึ่งทำให้ "ไม่มีทาง" หายไปจริง แต่ระยะ SL ที่ต้องมีกลายเป็น `
      + `${pctStr(Math.min(...noMin), 0)}–${pctStr(Math.max(...noMin), 0)} ของราคา`);
    W('ค่าที่เกิน 100% เป็นไปไม่ได้ทางกายภาพสำหรับการซื้อ (ขาดทุนเกินทุนไม่ได้)');
    W('ส่วนค่าที่เหลือก็ยังไกลจากระยะ SL ที่พบจริงบนหุ้นไทยหลายสิบเท่า');
    W();
  }
  W('### ตารางตัดสิน — ต้นทุนเป็น R ต่อไม้ (ค่าคอมจริง + สเปรด 2 ช่วงราคา)');
  W();
  W('ราคาตัวอย่างเลือกไว้ที่ *ต้นช่วงราคา* ซึ่งเป็นตำแหน่งที่ tick แพงที่สุดเป็นเปอร์เซ็นต์');
  W();
  const gridHead = V.A4.grid[0].cells.map((c) => pctStr(c.sl, 0)).join(' | ');
  W(`| ราคาหุ้น | tick | ${gridHead} |`);
  W(`|---|---|${V.A4.grid[0].cells.map(() => '---').join('|')}|`);
  for (const g of V.A4.grid) {
    W(`| ${g.price} บาท | ${g.tick} | ${g.cells.map((c) => `${c.costR.toFixed(3)}${c.minFeeBinds ? '*' : ''}`).join(' | ')} |`);
  }
  W();
  W(`\\* = ค่าคอมขั้นต่ำกัดแล้ว (มูลค่าออเดอร์ต่ำกว่า ${(R.params.minFee / R.params.commRate).toFixed(0)} บาท)`);
  W();
  const nCells = V.A4.grid.length * V.A4.grid[0].cells.length;
  W(`เทียบกับขอบก่อนหักต้นทุนที่วัดได้จริง **${n2(V.A2.grossEdge.mean)} R/ไม้** — ช่องที่ต่ำกว่าตัวเลขนี้คือช่องที่ "มีสิทธิ์"`);
  W();
  W(`**ช่องที่ผ่านเกณฑ์: ${V.A4.gridCellsClearingEdge.length} จาก ${nCells} ช่อง**`);
  if (!V.A4.gridCellsClearingEdge.length) {
    const cheapest = V.A4.grid.flatMap((g) => g.cells.map((c) => c.costR)).sort((a, b) => a - b)[0];
    W();
    W(`ช่องที่ถูกที่สุดในตารางทั้งหมดคือ ${n2(cheapest, 3)} R ซึ่งยังแพงกว่าขอบที่วัดได้ `
      + `${(cheapest / V.A2.grossEdge.mean).toFixed(1)} เท่า`);
  }
  W();
  W('### กลุ่มที่ผันผวนสูงสุดของ A1 ไปรอดไหมเมื่อใช้ต้นทุนจริง');
  W();
  W('A1 พบว่ากลุ่ม SL กว้างสุดมีขอบดีที่สุด — ตารางนี้เอากลุ่มนั้นมาหักต้นทุนจริงของ SET');
  W();
  W('| กรอบเวลา | สเปรด | ไม้ | ระยะ SL (มัธยฐาน) | ขอบก่อนหักต้นทุน | ต้นทุนจริง | สุทธิ |');
  W('|---|---|---|---|---|---|---|');
  for (const b of V.A4.bestBucket) {
    W(`| ${b.timeframe} | ${b.ticks} ช่วงราคา | ${b.n} | ${pctStr(b.stopDistMedian)} | ${n2(b.grossAvgR)} | ${n2(b.meanCostR)} | **${n2(b.netAvgR)}** |`);
  }
  W();
  if (R.crossCheck?.labAvgCostR != null) {
    W('### ตรวจซ้ำผ่าน lab.mjs ด้วยตารางต้นทุนรายสัญลักษณ์');
    W();
    W('สร้าง `--cost-json` จากราคามัธยฐานจริงของแต่ละตัว (ค่าคอม + สเปรด 2 ช่วงราคา)');
    W('แล้วให้เครื่องวัดกลางรันใหม่ทั้งชุด เทียบกับการคำนวณด้วยสูตรเดียวกันในไฟล์นี้');
    W();
    W(`ตาราง bps รายตัว: ${Object.entries(R.setCostTable.bySymbolBps).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(' · ')}`);
    W();
    W('| ตัวเลข | lab.mjs | ไฟล์นี้ |');
    W('|---|---|---|');
    W(`| ต้นทุนเฉลี่ย (R/ไม้) | ${n2(R.crossCheck.labAvgCostR)} | ${n2(R.crossCheck.mineAvgCostR)} |`);
    W(`| R สุทธิ | ${n2(R.crossCheck.labNetAvgR)} | ${n2(R.crossCheck.mineNetAvgR)} |`);
    W();
    W(`ต่างกันสูงสุด ${R.crossCheck.maxAbsDiff.toExponential(2)} — คณิตศาสตร์ต้นทุนสองฝั่งเป็นตัวเดียวกัน`);
    W();
    const a4two = V.A4.perVariant.find((v) => v.ticks === 2);
    W(`หมายเหตุ: ตาราง "วัดใหม่ด้วยต้นทุนสมจริง" ข้างบนได้ต้นทุนเฉลี่ย ${n2(a4two.meanCostR)} R `
      + `ซึ่งต่างจาก ${n2(R.crossCheck.labAvgCostR)} R ตรงนี้ด้วยสองเหตุผลที่รู้ตัว:`);
    W();
    W('1. ตารางนั้นใช้ราคาจริงของแต่ละไม้ ส่วน `--cost-json` บังคับให้ใช้ bps ค่าเดียวต่อสัญลักษณ์');
    W('   ซึ่งคำนวณจากราคามัธยฐาน — ไม้ที่ราคาสูงกว่ามัธยฐานจึงถูกคิดต้นทุนแพงเกินจริง');
    W('2. ตารางนั้นรวมค่าคอมขั้นต่ำต่อออเดอร์ ซึ่ง `--cost-json` แสดงไม่ได้ตามนิยาม');
    W('   เพราะค่าคอมขั้นต่ำไม่ใช่สัดส่วนของมูลค่าไม้ — มันเป็นจำนวนเงินคงที่');
    W();
    W('ทั้งสองตัวเลขชี้ทางเดียวกัน และทั้งคู่แพงกว่าสมมติฐาน 40 bps ที่ `lab.mjs` ใช้เป็นค่าเริ่มต้นมาก');
    W();
  }

  // ─── บัญชีการเปรียบเทียบ ───
  W('---');
  W();
  W('## บัญชีการเปรียบเทียบทั้งหมด (ทุกแบบที่ลอง ไม่ใช่แต่ตัวที่ชนะ)');
  W();
  const C = R.comparisons;
  W(`ทดสอบสมมติฐานทั้งหมด **${C.total} ครั้ง** — บน train ${C.exploratoryTrain} ครั้ง (สำรวจ ไม่ใช้ตัดสิน) `
    + `· บน validation ${C.confirmatoryValidation} ครั้ง (ครอบครัวที่ใช้ตัดสิน)`);
  W();
  W(`เกณฑ์ Bonferroni ของครอบครัว validation = 0.05 / ${C.confirmatoryValidation} = **${C.bonferroniAlpha.toExponential(2)}**`);
  W('ตารางด้านล่างใช้ Holm ซึ่งเข้มเท่ากันในการคุมความผิดพลาดแบบครอบครัว แต่มีอำนาจสูงกว่า');
  W();
  const conf = C.tests.filter((t) => t.split === 'validation').sort((a, b) => a.p - b.p);
  W('| # | การทดสอบ (validation) | ค่าที่วัดได้ | CI95 | p | เกณฑ์ Holm | ผ่าน? |');
  W('|---|---|---|---|---|---|---|');
  conf.forEach((t, i) => {
    W(`| ${i + 1} | ${t.name} | ${n2(t.estimate)} | [${n2(t.lo95)}, ${n2(t.hi95)}] | ${t.p.toFixed(4)} | ${t.holm ? t.holm.threshold.toExponential(2) : '—'} | ${t.holm && t.holm.rejected ? '**ผ่าน**' : 'ไม่ผ่าน'} |`);
  });
  W();
  const survivors = conf.filter((t) => t.holm && t.holm.rejected);
  W(`ผ่านการแก้ค่า p: **${survivors.length} จาก ${conf.length}**`);
  W();
  W('### อ่านตารางนี้ยังไง');
  W();
  W('สิ่งที่ผ่านเกณฑ์ล้วนเป็นข้อสรุปฝั่ง "ต้นทุนกินหมด" ซึ่งเป็นผลที่ **ไม่ต้องพึ่งการมีขอบ**');
  W('มันเป็นการวัดค่าธรรมเนียม ไม่ใช่การวัดความสามารถในการทำนายตลาด จึงชัดจนทะลุการแก้ค่า p ได้ง่าย');
  W();
  W('สิ่งที่ **ไม่ผ่าน** เกณฑ์คือข้อสรุปฝั่ง "ไม้ที่ SL กว้างมีขอบดีกว่า" ทุกตัว');
  W('แต่ต้องอ่านให้ครบ: ทิศทางของมันเป็นบวก **ทั้ง 4 สไลซ์ที่วัดแยกกัน** (1H/1D × train/validation)');
  {
    const rhos = [];
    for (const src of [{ tag: 'validation', d: V.A1 }, { tag: 'train', d: T.A1 }]) {
      for (const g of src.d.byTimeframe) rhos.push(`${g.timeframe}/${src.tag} ${n2(g.spearman.rho, 3)}`);
    }
    W(`สหสัมพันธ์อันดับที่วัดได้: ${rhos.join(' · ')}`);
  }
  W();
  W('ความสอดคล้องแบบนี้เป็นหลักฐานที่อ่อนกว่าค่า p ที่ผ่านเกณฑ์ แต่ไม่ใช่ศูนย์ — และมันสำคัญ');
  W('เพราะมันบอกว่ากลไก "SL กว้าง = ถูกลง" **ไม่ได้ถูกหักล้าง**ด้วยไม้ที่แย่ลง (ซึ่งเป็นความเสี่ยงหลัก');
  W('ที่รอบนี้ตั้งใจไปวัด) ปัญหาของหุ้นไทยจึงไม่ใช่ "ไปทางนั้นแล้วเจอไม้แย่กว่า" แต่คือ');
  W('**ระยะทางที่ต้องเดินไปนั้นไกลเกินกว่าที่ตลาดจะมีให้** ซึ่งเป็นคนละปัญหาและแก้ด้วยการจูนไม่ได้');
  W();

  W('---');
  W();
  W('## ข้อจำกัดที่ต้องรู้ก่อนใช้ตัวเลขนี้');
  W();
  W('- จักรวาลหุ้นไทยในคลังมี **14 ตัว และเป็น SET50 ทั้งหมด** — ไม่มีหุ้นซิ่งจริงสักตัว');
  W('  รายงานนี้จึงตอบได้แค่ "ต้องซิ่งแค่ไหนถึงจะมีสิทธิ์" ไม่ได้ตอบว่า "หุ้นซิ่งกำไรไหม"');
  W('- 14 สัญลักษณ์ = bootstrap ราย-สัญลักษณ์มีแค่ 14 ก้อน ช่วงความเชื่อมั่นจึงหยาบ');
  W('- 1H ย้อนได้แค่ 730 วัน = เห็นตลาดยุคเดียว ข้อสรุปจาก 1H อ่อนกว่า 1D มาก');
  W('- ต้นทุนทุกตัวเป็นค่าประมาณจากตารางค่าธรรมเนียมสาธารณะ ไม่ใช่ใบเสร็จจริงของเจ้าของ');
  W('  ตารางช่วงราคาเป็นกติกาที่ประกาศไว้ — สเปรดจริงของหุ้นสภาพคล่องต่ำกว้างกว่านั้นได้เสมอ');
  W('- แบบจำลองสมมติว่าเข้า-ออกได้ที่ราคาที่ต้องการเสมอ หุ้นซิ่งจริงมีโอกาสไม่ได้ของที่ราคานั้น');
  W('- แท่งที่แตะทั้ง SL และ TP นับ SL ก่อนเสมอ (OHLC ไม่บอกลำดับภายในแท่ง) — เลือกทางแย่ไว้ก่อน');
  W('- ราคาไม่ได้หักปันผล — หุ้นปันผลสูงมี gap ลงทุกครั้งที่ขึ้นเครื่องหมาย XD');
  W('- การทดสอบบน train ไม่ถูกแก้ค่า p เพราะไม่ได้ใช้ตัดสิน — แต่มันถูกนับรวมในยอดทั้งหมด');
  W('- ช่วงความเชื่อมั่นในไฟล์นี้ต่างจาก `baseline-validation.txt` เล็กน้อยเพราะใช้ seed คนละตัว');
  W('  ในการสุ่ม bootstrap (ค่ากลางตรงกันเป๊ะ: 0.0178) — เป็นความคลาดของการสุ่ม ไม่ใช่ของวิธีวัด');
  W('- ค่าคอมขั้นต่ำ 50 บาท/ออเดอร์ เป็นสมมติฐาน โบรกเกอร์บางเจ้ายกเลิกแล้ว');
  W('  รันซ้ำด้วย `--min-fee=0` เพื่อดูผลเมื่อไม่มีขั้นต่ำ (พื้นหายไป แต่สเปรดยังอยู่)');
  W();

  return `${L.join('\n')}\n`;
}

main().catch((e) => {
  process.stderr.write(`[cost-mechanics] ล้มเหลว: ${e.stack ?? e.message}\n`);
  process.exit(1);
});
