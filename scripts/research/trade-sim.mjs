/**
 * trade-sim.mjs — ตัวจำลองไม้ + สถิติ ที่ห้องแล็บทุกตัวบนทองใช้ร่วมกัน (zone-lab · smc-lab)
 *
 * แยกออกมาจาก zone-lab.mjs (2026-09-28) เพื่อให้ทุกแล็บได้กติกาแท่งเข้าไม้ชุดเดียวกัน
 * กติกานั้นคือสิ่งที่ตัดสินผลทั้งหมด: zone-lab รอบแรกได้ +0.2172 R และรอด Holm
 * เพราะนับ TP ในแท่งเข้าไม้ แก้แล้วผลบวกหายหมด — แล็บใหม่ต้องไม่ต้องเรียนบทเรียนนี้ซ้ำ
 *
 * ═══ แท่งที่เข้าไม้: รู้อะไรได้บ้าง (entryBar) ════════════════════════════════════════
 * ข้อมูลรายแท่งบอกได้แค่ open/high/low/close ไม่บอกว่า high กับ low อันไหนมาก่อน
 *
 *   'full'       เข้าที่ราคา *เปิด* ของแท่ง → ทั้งแท่งเกิดหลังเข้า ตรวจได้ทั้ง SL และ TP
 *                (แท่งที่กินทั้งคู่นับ SL ก่อน — เลือกทางที่แย่กว่า)
 *   'fromAbove'  ตั้ง limit แล้วราคา *ลง* มาชน → low ของแท่งเกิดหลังเข้าแน่ (ราคาต้องผ่านจุดเข้า
 *                ก่อนถึง low) แต่ high อาจเกิดก่อน → แท่งเข้าตรวจได้เฉพาะระดับที่ *ต่ำกว่า* จุดเข้า
 *   'fromBelow'  กลับกัน — แท่งเข้าตรวจได้เฉพาะระดับที่ *สูงกว่า* จุดเข้า
 *
 * กติกานี้ไม่ขึ้นกับว่าไม้เป็น BUY หรือ SELL จึงใช้กับตัวเทียบ "กลับทิศ" ได้ตรง ๆ
 * ของเดิมใน zone-lab ใช้ "นับ SL ไม่นับ TP" ซึ่งตรงกับกติกานี้สำหรับไม้จริงทุกไม้พอดี
 * แต่ผิดสำหรับไม้กลับทิศ (นับ SL ฝั่งบนที่อาจเกิดก่อนเข้า) → ตัวเทียบแพ้เกินจริง
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './load-src-modules.mjs';

/** ตรงกับ MAX_HOLD_BARS ใน scripts/resolve-signals.mjs และ rule-lab.mjs */
export const MAX_HOLD_BARS = { '1D': 20, '1H': 24 };

// ─────────────────────────────── สถิติ ───────────────────────────────

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pctOf = (sorted, p) => {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

export const normalCdf = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
};

/**
 * bootstrap จับกลุ่มรายเดือน + cluster-robust t — ไม้ในเดือนเดียวกันซ้อนทับและเคลื่อนไปด้วยกัน
 * การนับเป็นอิสระต่อไม้ทำให้ค่า p เล็กเกินจริงหลายเท่า
 */
export function clusterStats(trades, { B = 2000, seed = 20260907 } = {}) {
  if (!trades.length) return null;
  const groups = new Map();
  for (const t of trades) {
    let g = groups.get(t.month);
    if (!g) { g = { sum: 0, n: 0 }; groups.set(t.month, g); }
    g.sum += t.rNet; g.n++;
  }
  const keys = [...groups.keys()];
  const G = keys.length;
  const sums = keys.map((k) => groups.get(k).sum);
  const cnts = keys.map((k) => groups.get(k).n);

  const rnd = mulberry32(seed);
  const means = new Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0, c = 0;
    for (let g = 0; g < G; g++) { const p = (rnd() * G) | 0; s += sums[p]; c += cnts[p]; }
    means[b] = c > 0 ? s / c : 0;
  }
  means.sort((a, b) => a - b);
  let le0 = 0, ge0 = 0;
  for (const m of means) { if (m <= 0) le0++; if (m >= 0) ge0++; }

  const N = trades.length;
  const mean = trades.reduce((a, t) => a + t.rNet, 0) / N;
  const dev = new Map(keys.map((k) => [k, 0]));
  for (const t of trades) dev.set(t.month, dev.get(t.month) + (t.rNet - mean));
  let ss = 0;
  for (const v of dev.values()) ss += v * v;

  let pT = null;
  if (G > 1 && ss > 0) {
    const se = Math.sqrt((G / (G - 1)) * ss / (N * N));
    if (se > 0) pT = 2 * (1 - normalCdf(Math.abs(mean / se)));
  }
  return {
    months: G,
    lo95: pctOf(means, 0.025),
    hi95: pctOf(means, 0.975),
    pBoot: Math.min(1, 2 * Math.min(le0 / B, ge0 / B)),
    pCluster: pT,
  };
}

export const summarize = (trades) => {
  if (!trades.length) return null;
  const n = trades.length;
  const cnt = (r) => trades.filter((t) => t.reason === r).length / n;
  const mean = (f) => trades.reduce((a, t) => a + f(t), 0) / n;
  return {
    n,
    tp: cnt('tp'), sl: cnt('sl'),
    timeout: cnt('timeout') + cnt('dataEnd'),
    rGross: mean((t) => t.rGross),
    costR: mean((t) => t.costR),
    rNet: mean((t) => t.rNet),
    stopPct: mean((t) => t.stopPct ?? NaN),
    heldBars: mean((t) => t.heldBars),
  };
};

// ─────────────────────────────── ข้อมูล ───────────────────────────────

export const SPLIT_FILE = path.join(ROOT, 'scripts', 'research', 'report', 'split.json');

/** ตัดชุด test ทิ้งตั้งแต่ตอนโหลด — แท่งพวกนั้นจะไม่เคยอยู่ในหน่วยความจำ */
export function loadMeasurable(tf, file = `GOLD__XAUUSD__${tf}.json`) {
  const split = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
  const b = split.timeframes[tf];
  if (!b) throw new Error(`split.json ไม่มีขอบเขตของกรอบเวลา ${tf}`);
  const cut = Date.parse(b.validationEnd);
  if (!Number.isFinite(cut)) throw new Error(`validationEnd ของ ${tf} อ่านไม่ออก`);
  const f = path.join(ROOT, '.research-cache', 'candles', file);
  if (!fs.existsSync(f)) throw new Error(`ไม่มีแคชแท่ง: ${f}`);
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  const all = Array.isArray(raw) ? raw : raw.candles;
  const bars = all.filter((x) => Date.parse(x.timestamp) < cut);
  // guard ชั้นสอง — ถ้าวันไหนตัวกรองข้างบนพัง ต้องระเบิด ไม่ใช่เงียบ
  for (const x of bars) {
    if (Date.parse(x.timestamp) >= cut) throw new Error(`[guard/test-set] แท่ง ${x.timestamp} อยู่ในชุด test ของ ${tf}`);
  }
  return { bars, cut, dropped: all.length - bars.length, validationEnd: b.validationEnd };
}

// ─────────────────────────────── จำลองไม้ ───────────────────────────────

export const ENTRY_BAR_MODES = ['full', 'fromAbove', 'fromBelow'];

/** จำลองไม้เดียว — ความหมายของ entryBar อยู่หัวไฟล์ */
export function simulate(bars, fromIdx, isLong, entry, stop, target, maxHold, entryBar = 'full') {
  if (!ENTRY_BAR_MODES.includes(entryBar)) throw new Error(`entryBar ไม่รู้จัก: ${entryBar}`);
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  const lastIdx = Math.min(fromIdx + maxHold - 1, bars.length - 1);
  if (lastIdx < fromIdx) return null;

  for (let i = fromIdx; i <= lastIdx; i++) {
    const b = bars[i];
    let hitStop = isLong ? b.low <= stop : b.high >= stop;
    let hitTarget = isLong ? b.high >= target : b.low <= target;
    if (i === fromIdx && entryBar !== 'full') {
      // ตรวจได้เฉพาะฝั่งที่ราคาวิ่งต่อหลังชนจุดเข้า
      const belowOnly = entryBar === 'fromAbove';
      if (belowOnly) {
        if (isLong) hitTarget = false; // TP ของ BUY อยู่บน
        else hitStop = false;          // SL ของ SELL อยู่บน
      } else {
        if (isLong) hitStop = false;   // SL ของ BUY อยู่ล่าง
        else hitTarget = false;        // TP ของ SELL อยู่ล่าง
      }
    }
    if (hitStop) return { r: (isLong ? stop - entry : entry - stop) / risk, reason: 'sl', bars: i - fromIdx + 1 };
    if (hitTarget) return { r: (isLong ? target - entry : entry - target) / risk, reason: 'tp', bars: i - fromIdx + 1 };
  }
  const px = bars[lastIdx].close;
  return {
    r: (isLong ? px - entry : entry - px) / risk,
    reason: lastIdx === fromIdx + maxHold - 1 ? 'timeout' : 'dataEnd',
    bars: lastIdx - fromIdx + 1,
  };
}

/**
 * ผูกต้นทุนเข้ากับตัวจำลอง — แล็บส่ง costRFor ตัวจริงจาก src/lib/costs.ts มา ไม่พิมพ์ตัวเลขซ้ำ
 *
 * spec ของไม้: { idx, entry, risk, rr, isLong, entryBar } — ตัวเทียบกลับทิศใช้สเปกนี้จำลองใหม่
 */
export function createTradeSim({ costRFor, symbol, market }) {
  const monthOf = (ts) => String(ts).slice(0, 7);

  function toTrade(bars, spec, maxHold, tag = {}) {
    const { idx, entry, risk, rr, isLong, entryBar = 'full' } = spec;
    // ใช้ stop/target ที่ผู้เรียกคำนวณมาเองถ้ามี — entry − (entry − stop) ในเลขทศนิยม
    // อาจไม่คืนค่า stop เดิมเป๊ะ แล้วไม้ที่ low แตะขอบพอดีจะเปลี่ยนผล
    const stop = spec.stop ?? (isLong ? entry - risk : entry + risk);
    const target = spec.target ?? (isLong ? entry + rr * risk : entry - rr * risk);
    const sim = simulate(bars, idx, isLong, entry, stop, target, maxHold, entryBar);
    if (!sim) return null;
    const costR = costRFor(entry, stop, symbol, market);
    if (costR === null) return null;
    return {
      ...tag,
      spec,
      rr,
      month: monthOf(bars[idx].timestamp),
      timestamp: bars[idx].timestamp,
      side: isLong ? 'long' : 'short',
      stopPct: risk / entry,
      rGross: sim.r,
      costR,
      rNet: sim.r - costR,
      reason: sim.reason,
      heldBars: sim.bars,
    };
  }

  /**
   * ตัวเทียบ "กลับทิศ" — จุดเข้า ระยะเสี่ยง และกติกาแท่งเข้าเดิมทุกอย่าง แค่สลับ ซื้อ↔ขาย
   * ต้องจำลองใหม่จริง: RR ไม่ใช่ 1:1 แปลว่า TP/SL อยู่คนละระยะ กลับเครื่องหมาย R ไม่ได้
   */
  function flippedTrades(bars, real, maxHold) {
    const out = [];
    for (const r of real) {
      // ทิ้ง stop/target ที่ตั้งไว้ให้ทิศเดิม — ทิศใหม่ต้องคำนวณจากระยะเสี่ยงเดิมอีกฝั่ง
      const t = toTrade(bars, { ...r.spec, isLong: !r.spec.isLong, stop: undefined, target: undefined }, maxHold);
      if (t) out.push(t);
    }
    return out;
  }

  /**
   * ตัวเทียบ "สุ่มเวลาเข้า" — ต่อไม้จริงหนึ่งไม้ สุ่มแท่งหนึ่งแท่ง เข้าที่ราคาเปิด ('full')
   * ทิศและระยะ SL (สัดส่วนของราคา) และ RR เท่ากับไม้จริงทุกอย่าง
   * ถ้าให้ `pool` มา จะสุ่มเฉพาะดัชนีในนั้น (เช่น "แท่งที่โครงสร้างเป็นขาขึ้น")
   *
   * ⚠ ของเดิมใน zone-lab เข้าที่ราคา *ปิด* แต่ยังตรวจ SL จาก low ของแท่งเดียวกัน
   *   ซึ่งเกิดก่อนเข้า → ตัวเทียบโดน SL ที่ไม่มีทางเกิดจริง = แพ้เกินจริง
   */
  function randomEntryTrades(bars, real, maxHold, rnd, pool = null) {
    const out = [];
    for (const r of real) {
      const want = r.spec.isLong;
      let e;
      if (pool) {
        const cand = pool[want ? 'long' : 'short'];
        if (!cand?.length) continue;
        e = cand[(rnd() * cand.length) | 0];
      } else {
        e = 30 + ((rnd() * (bars.length - 60 - maxHold)) | 0);
      }
      const entry = bars[e].open;
      const t = toTrade(bars, { idx: e, entry, risk: entry * r.stopPct, rr: r.rr, isLong: want, entryBar: 'full' }, maxHold);
      if (t) out.push(t);
    }
    return out;
  }

  /** การแจกแจงของค่าเฉลี่ยจากการสุ่มเวลาเข้าซ้ำหลายรอบ → ค่า p ด้านเดียว (จริง ≥ สุ่ม) */
  function randomNull(bars, real, maxHold, { rounds, seed, pool = null }) {
    const means = [];
    for (let p = 0; p < rounds; p++) {
      const fake = randomEntryTrades(bars, real, maxHold, mulberry32(seed + p), pool);
      if (fake.length) means.push(fake.reduce((a, t) => a + t.rNet, 0) / fake.length);
    }
    means.sort((a, b) => a - b);
    const realMean = real.reduce((a, t) => a + t.rNet, 0) / real.length;
    const above = means.filter((m) => m >= realMean).length;
    return {
      rounds: means.length,
      p: means.length ? (above + 1) / (means.length + 1) : null,
      nullMean: means.length ? means.reduce((a, b) => a + b, 0) / means.length : null,
      null95: means.length ? pctOf(means, 0.95) : null,
    };
  }

  return { toTrade, flippedTrades, randomEntryTrades, randomNull };
}
