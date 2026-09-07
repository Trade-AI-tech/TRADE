#!/usr/bin/env node
/**
 * zone-lab.mjs — วัดว่าโซนดีมาน/ซัพพลายทำนายทิศทางได้จริงไหม บนทองคำ
 *
 * ─────────────────────────── คำถามที่ไฟล์นี้ตอบ ───────────────────────────
 * เจ้าของถามตรง ๆ ว่า "เมื่อเกิดรูปแบบกราฟนี้แล้ว โอกาสที่จะขึ้นหรือลงจะไปทางไหน
 * ในอดีตมากกว่ากัน" — ไฟล์นี้ตอบด้วยการนับ ไม่ใช่ด้วยทฤษฎี
 *
 * ทุกครั้งที่ราคากลับมาแตะขอบในของโซน สมมติว่าเข้าไม้ตามทิศที่ตำราบอก
 * (แตะ demand = ซื้อ · แตะ supply = ขาย) แล้วนับว่าชน TP ก่อนหรือ SL ก่อน
 *
 * ─────────────────────────── ตัวเทียบ ๓ ตัว (สำคัญกว่าตัวเลขหลัก) ───────────────────────────
 * ตัวเลข "ชนะ 55%" ไม่มีความหมายถ้าไม่รู้ว่าการเดาสุ่มได้เท่าไหร่ จึงวัดคู่กับ:
 *
 *   ๑ สุ่มจุดเข้า  — เข้าไม้ที่แท่งสุ่ม ทิศเดียวกัน ระยะ SL เท่ากัน จำนวนเท่ากัน
 *                   ถ้าโซนไม่มีข้อมูลอะไรเลย ผลจะเท่ากับตัวนี้
 *   ๒ กลับทิศ     — จุดเข้าเดิมทุกอย่าง แต่สลับ ซื้อ↔ขาย
 *                   ถ้าโซนมีข้อมูลจริง ตัวนี้ต้องแย่กว่าตัวหลักอย่างชัดเจน
 *   ๓ สุ่มตำแหน่งโซน — ย้ายโซนทั้งชุดไปไว้ที่แท่งสุ่ม (คงจำนวน/ความกว้าง/ทิศไว้)
 *                   ทำซ้ำหลายรอบเพื่อสร้างการแจกแจงของ "ผลที่ได้จากความบังเอิญ"
 *
 * ─────────────────────────── กติกาที่ไม่ยอมหย่อน ───────────────────────────
 * · ชุด test ถูกตัดทิ้งตั้งแต่ตอนโหลด และมี guard ที่ throw ถ้ามีแท่ง test หลุดเข้ามา
 * · โซนใช้ได้เฉพาะตั้งแต่ knownFromIndex เป็นต้นไป (findZoneCandidates การันตีให้แล้ว)
 * · แท่งที่กิน TP และ SL พร้อมกัน นับ SL ก่อนเสมอ — เลือกทางที่ผลออกมาแย่กว่า
 * · ต้นทุนคิดจาก costRFor() ตัวจริงใน src/lib/costs.ts ไม่ใช่ตัวเลขที่พิมพ์ซ้ำที่นี่
 * · bootstrap จับกลุ่มเป็น "เดือนปฏิทิน" ไม่ใช่ต่อไม้ เพราะไม้ในเดือนเดียวกันซ้อนทับ
 *   และเคลื่อนไปด้วยกัน การนับเป็นอิสระต่อไม้จะทำให้ค่า p เล็กเกินจริงหลายเท่า
 *
 * ─────────────────────────── สิ่งที่ไฟล์นี้ไม่ได้ทำ ───────────────────────────
 * ไม่ตัดสินใจแทน ไม่แก้เครื่องยนต์ ไม่เขียนอะไรลงฐานข้อมูล — พิมพ์ตัวเลขอย่างเดียว
 *
 * รัน: node scripts/research/zone-lab.mjs
 *      node scripts/research/zone-lab.mjs --json
 *      node scripts/research/zone-lab.mjs --self-test
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadSrcModules, ROOT } from './load-src-modules.mjs';
import { holmFromEntries } from './holm.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const AS_JSON = has('--json');
const SELF_TEST = has('--self-test');

const mods = await loadSrcModules(['src/lib/supply-demand.ts', 'src/lib/costs.ts']);
const { findZoneCandidates, zoneStateAt, zoneScore, ZONE_PARAMS } = mods['supply-demand'];
const { costRFor, applyStopFloor, minStopPctFor, MAX_COST_R } = mods['costs'];

const SYMBOL = 'XAUUSD';
const MARKET = 'GOLD';
/** ตรงกับ MAX_HOLD_BARS ใน scripts/resolve-signals.mjs และ rule-lab.mjs */
const MAX_HOLD_BARS = { '1D': 20, '1H': 24 };
/** SL วางพ้นขอบนอกไปอีกเท่าไหร่ของความหนาโซน — กันไส้ทิ่มพอดีเป๊ะ */
const STOP_BUFFER = 0.25;
/** TP เป็นกี่เท่าของระยะเสี่ยง — วัดหลายค่าเพราะแต่ละค่าตอบคนละคำถาม */
const RR_TARGETS = [1, 2, 3];
const SEED = 20260907;
const PERM_ROUNDS = 400;
const BOOT_ROUNDS = 2000;

// ─────────────────────────────── เครื่องมือสถิติ ───────────────────────────────

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pctOf = (sorted, p) => {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const normalCdf = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
};

/** bootstrap แบบจับกลุ่มรายเดือน — ไม้ในเดือนเดียวกันเคลื่อนไปด้วยกัน */
function clusterStats(trades, { B = BOOT_ROUNDS, seed = SEED } = {}) {
  if (!trades.length) return null;
  const groups = new Map();
  for (const t of trades) {
    const k = t.month;
    let g = groups.get(k);
    if (!g) { g = { sum: 0, n: 0 }; groups.set(k, g); }
    g.sum += t.rNet; g.n++;
  }
  const keys = [...groups.keys()];
  const G = keys.length;
  const sums = keys.map(k => groups.get(k).sum);
  const cnts = keys.map(k => groups.get(k).n);

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
  let ss = 0;
  for (const k of keys) ss += 0; // เผื่อไว้ให้อ่านง่าย — คำนวณจริงด้านล่าง
  const byKey = new Map(keys.map(k => [k, 0]));
  for (const t of trades) byKey.set(t.month, byKey.get(t.month) + (t.rNet - mean));
  for (const v of byKey.values()) ss += v * v;

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

// ─────────────────────────────── ข้อมูล ───────────────────────────────

const SPLIT_FILE = path.join(ROOT, 'scripts', 'research', 'report', 'split.json');

function loadBars(tf) {
  const f = path.join(ROOT, '.research-cache', 'candles', `GOLD__${SYMBOL}__${tf}.json`);
  if (!fs.existsSync(f)) throw new Error(`ไม่มีแคชแท่ง: ${f}`);
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  return Array.isArray(raw) ? raw : raw.candles;
}

/** ตัดชุด test ทิ้งตั้งแต่ตอนโหลด — แท่งพวกนั้นจะไม่เคยอยู่ในหน่วยความจำ */
function loadMeasurable(tf) {
  const split = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
  const b = split.timeframes[tf];
  if (!b) throw new Error(`split.json ไม่มีขอบเขตของกรอบเวลา ${tf}`);
  const cut = Date.parse(b.validationEnd);
  if (!Number.isFinite(cut)) throw new Error(`validationEnd ของ ${tf} อ่านไม่ออก`);
  const all = loadBars(tf);
  const bars = all.filter(x => Date.parse(x.timestamp) < cut);
  // guard ชั้นสอง — ถ้าวันไหนตัวกรองข้างบนพัง ต้องระเบิด ไม่ใช่เงียบ
  for (const x of bars) {
    if (Date.parse(x.timestamp) >= cut) {
      throw new Error(`[guard/test-set] แท่ง ${x.timestamp} อยู่ในชุด test ของ ${tf}`);
    }
  }
  return { bars, cut, dropped: all.length - bars.length, validationEnd: b.validationEnd };
}

// ─────────────────────────────── จำลองไม้ ───────────────────────────────

/**
 * จำลองไม้เดียว เข้าที่ราคา entry ตั้งแต่แท่ง fromIdx
 *
 * ═══ กติกาสองข้อที่ทำให้ตัวเลขไม่โกหก ═════════════════════════════════════════
 *
 * ๑ แท่งที่กิน TP และ SL ในแท่งเดียวกัน นับ SL ก่อนเสมอ — เราไม่มีข้อมูลในแท่ง
 *   ว่าอันไหนมาก่อน การเดาว่า TP มาก่อนจะทำให้ทุกตัวเลขดีขึ้นแบบที่พิสูจน์ไม่ได้
 *
 * ๒ **แท่งที่เข้าไม้ ห้ามนับ TP** — ข้อนี้สำคัญที่สุดและเป็นบั๊กที่วัดเจอจริงในไฟล์นี้
 *   เมื่อวัดครั้งแรกโดยไม่มีข้อนี้ 1H ให้ +0.2172 R และรอด Holm ดูเหมือนเจอของ
 *   แต่ 35.8% ของไม้ทั้งหมด "ชน TP" ในแท่งเดียวกับที่เข้า ซึ่งรู้ไม่ได้จริง:
 *   ไม้ demand เข้าเมื่อราคา *ลงมา* แตะขอบโซน ส่วน high ของแท่งนั้นอาจเกิดตอนต้นแท่ง
 *   คือ **ก่อน** ที่ราคาจะลงมาถึงจุดเข้าเสียอีก การนับว่าชน TP จึงเป็นการอ่านอนาคต
 *   ภายในแท่ง — บั๊กที่ไม่มี error ให้เห็นและทำให้ผลออกมาบวกเกินจริงเกินเท่าตัว
 *
 *   ฝั่ง SL ยังนับในแท่งเข้าตามเดิม เพราะเป็นทางที่แย่กว่า (อนุรักษ์นิยม)
 *   ไม่สมมาตรโดยตั้งใจ: ข้อมูลระดับแท่งบอกลำดับภายในแท่งไม่ได้ จึงเลือกทางที่แพ้
 */
function simulate(bars, fromIdx, isLong, entry, stop, target, maxHold) {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  // ไม้จบในแท่งเดียวกับที่เข้าได้ (ราคาแตะโซนแล้วไหลต่อไปชน SL ในแท่งนั้นเลย)
  // จึงเป็น < ไม่ใช่ <= — ถ้าตัดเคสนี้ทิ้ง ไม้ที่แพ้เร็วที่สุดจะหายไปจากสถิติทั้งหมด
  const lastIdx = Math.min(fromIdx + maxHold - 1, bars.length - 1);
  if (lastIdx < fromIdx) return null;

  for (let i = fromIdx; i <= lastIdx; i++) {
    const b = bars[i];
    const hitStop = isLong ? b.low <= stop : b.high >= stop;
    const hitTarget = i > fromIdx && (isLong ? b.high >= target : b.low <= target);
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

const monthOf = (ts) => String(ts).slice(0, 7);

function toTrade(bars, idx, isLong, entry, stop, target, maxHold, tag) {
  const sim = simulate(bars, idx, isLong, entry, stop, target, maxHold);
  if (!sim) return null;
  const costR = costRFor(entry, stop, SYMBOL, MARKET);
  if (costR === null) return null;
  return {
    ...tag,
    month: monthOf(bars[idx].timestamp),
    timestamp: bars[idx].timestamp,
    side: isLong ? 'long' : 'short',
    rGross: sim.r,
    costR,
    rNet: sim.r - costR,
    reason: sim.reason,
    heldBars: sim.bars,
  };
}

/**
 * เดินหน้าทีละแท่ง เก็บทุกครั้งที่ราคากลับมาแตะขอบในของโซน
 *
 * เข้าไม้ที่ราคา proximal เอง (สมมติว่าตั้ง limit ไว้ล่วงหน้า ซึ่งเป็นวิธีที่ตำราบอก)
 * ไม่ใช่ที่ราคาเปิดแท่งถัดไป เพราะการรอเปิดแท่งถัดไปคือคนละกลยุทธ์
 */
function collectTouchTrades(bars, tf, rr, { stopFloor = false } = {}) {
  const maxHold = MAX_HOLD_BARS[tf];
  const cands = findZoneCandidates(bars);
  const trades = [];

  for (const z of cands) {
    let touches = 0;
    let inside = false;
    for (let k = z.knownFromIndex + 1; k < bars.length; k++) {
      const c = bars[k];
      if (z.side === 'demand' ? c.close < z.distal : c.close > z.distal) break; // โซนตาย
      const isIn = z.side === 'demand' ? c.low <= z.proximal : c.high >= z.proximal;
      if (isIn && !inside) {
        touches++;
        if (touches > ZONE_PARAMS.maxTouches) break;

        const isLong = z.side === 'demand';
        const thickness = Math.abs(z.proximal - z.distal);
        const entry = z.proximal;
        let stop = isLong
          ? z.distal - thickness * STOP_BUFFER
          : z.distal + thickness * STOP_BUFFER;
        let risk = Math.abs(entry - stop);
        let target = isLong ? entry + rr * risk : entry - rr * risk;

        // ชั้นนโยบายของ production: ขยาย SL ให้ต้นทุนไม่เกินเพดาน แล้วขยับ TP
        // ตามสัดส่วนเพื่อรักษา RR — เรียกตัวจริงจาก src/lib/costs.ts ไม่เขียนซ้ำ
        if (stopFloor) {
          const f = applyStopFloor(entry, stop, target, SYMBOL, MARKET);
          if (!f) continue;
          stop = f.stop_loss;
          target = f.take_profit;
          risk = Math.abs(entry - stop);
        }

        const t = toTrade(bars, k, isLong, entry, stop, target, maxHold, {
          tf, rr, zoneSide: z.side, kind: z.kind,
          touchNo: touches,
          fresh: touches === 1,
          score: zoneScore(z, touches - 1),
          baseBars: z.baseBars,
          departureAtr: z.departureAtr,
          stopPct: risk / entry,
          // เก็บสเปกไว้ให้ตัวเทียบ "กลับทิศ" จำลองใหม่ได้จริง
          spec: { idx: k, entry, risk, rr, isLong },
        });
        if (t) trades.push(t);
      }
      inside = isIn;
    }
  }
  return trades;
}

/**
 * ตัวเทียบ ๒ — จุดเข้าเดิมทุกอย่าง แต่สลับ ซื้อ↔ขาย
 *
 * ต้องจำลองใหม่จริง ไม่ใช่กลับเครื่องหมาย R ของไม้เดิม: เมื่อ RR ไม่ใช่ 1:1
 * SL กับ TP อยู่คนละระยะกัน พอสลับทิศ ระดับทั้งสองก็ย้ายไปอยู่คนละที่
 * ไม้ที่เดิมชน TP ที่ +2R ไม่ได้แปลว่าไม้กลับทิศจะขาดทุน −2R เลย
 */
function flippedTrades(bars, real, tf) {
  const maxHold = MAX_HOLD_BARS[tf];
  const out = [];
  for (const r of real) {
    const { idx, entry, risk, rr, isLong } = r.spec;
    const flip = !isLong;
    const stop = flip ? entry - risk : entry + risk;
    const target = flip ? entry + rr * risk : entry - rr * risk;
    const t = toTrade(bars, idx, flip, entry, stop, target, maxHold, { tf, rr, stopPct: risk / entry });
    if (t) out.push(t);
  }
  return out;
}

/** ตัวเทียบ ๑ — จุดเข้าสุ่ม ทิศและระยะ SL คัดลอกจากไม้จริงทีละไม้ */
function randomEntryTrades(bars, real, tf, rnd) {
  const maxHold = MAX_HOLD_BARS[tf];
  const out = [];
  for (const r of real) {
    const idx = 30 + ((rnd() * (bars.length - 60 - maxHold)) | 0);
    const entry = bars[idx].close;
    const isLong = r.side === 'long';
    const risk = entry * r.stopPct;
    const stop = isLong ? entry - risk : entry + risk;
    const target = isLong ? entry + r.rr * risk : entry - r.rr * risk;
    const t = toTrade(bars, idx, isLong, entry, stop, target, maxHold, { tf, rr: r.rr });
    if (t) out.push(t);
  }
  return out;
}

/** ตัวเทียบ ๓ — ย้ายโซนไปไว้ที่แท่งสุ่ม คงจำนวน/ความหนา/ทิศไว้ครบ */
function shuffledZoneTrades(bars, real, tf, rnd) {
  const maxHold = MAX_HOLD_BARS[tf];
  const out = [];
  for (const r of real) {
    // วางโซนปลอมรอบราคาแท่งสุ่ม แล้วรอให้ราคากลับมาแตะเหมือนของจริง
    const anchor = 30 + ((rnd() * (bars.length - 60 - maxHold)) | 0);
    const px = bars[anchor].close;
    const isLong = r.side === 'long';
    const risk = px * r.stopPct;
    const entry = px;
    const stop = isLong ? entry - risk : entry + risk;
    const target = isLong ? entry + r.rr * risk : entry - r.rr * risk;
    const t = toTrade(bars, anchor, isLong, entry, stop, target, maxHold, { tf, rr: r.rr });
    if (t) out.push(t);
  }
  return out;
}

const summarize = (trades) => {
  if (!trades.length) return null;
  const n = trades.length;
  const cnt = (r) => trades.filter(t => t.reason === r).length / n;
  const mean = (f) => trades.reduce((a, t) => a + f(t), 0) / n;
  return {
    n,
    tp: cnt('tp'), sl: cnt('sl'),
    timeout: cnt('timeout') + cnt('dataEnd'),
    rGross: mean(t => t.rGross),
    costR: mean(t => t.costR),
    rNet: mean(t => t.rNet),
    stopPct: mean(t => t.stopPct ?? NaN),
    heldBars: mean(t => t.heldBars),
  };
};

// ─────────────────────────────── self-test ───────────────────────────────

if (SELF_TEST) {
  let pass = 0, fail = 0;
  const t = (name, ok, d = '') => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${d ? ` — ${d}` : ''}`); } };

  const mk = (o, h, l, c) => ({ timestamp: '2025-01-01T00:00:00.000Z', open: o, high: h, low: l, close: c, volume: 1 });

  // ชน SL ก่อน เมื่อแท่งเดียวกินทั้งสองฝั่ง
  {
    const bars = [mk(100, 100, 100, 100), mk(100, 130, 70, 100), mk(100, 100, 100, 100)];
    const s = simulate(bars, 1, true, 100, 90, 110, 5);
    t('แท่งที่กินทั้ง TP และ SL ต้องนับเป็น SL', s.reason === 'sl', `ได้ ${s.reason}`);
  }
  // ชน TP ปกติ (แท่งถัดจากแท่งเข้า)
  {
    const bars = [mk(100, 100, 100, 100), mk(100, 101, 99, 100), mk(100, 115, 99, 112)];
    const s = simulate(bars, 1, true, 100, 90, 110, 5);
    t('ชน TP แล้ว R ต้องเท่ากับ RR ที่ตั้งไว้', s.reason === 'tp' && Math.abs(s.r - 1) < 1e-9, `${s.reason} r=${s.r}`);
  }
  // ── ด่านกันบั๊กที่วัดเจอจริง: ห้ามนับ TP ในแท่งที่เข้าไม้ ──
  {
    const bars = [mk(100, 100, 100, 100), mk(100, 115, 99, 100), mk(100, 101, 99.5, 100)];
    const s = simulate(bars, 1, true, 100, 90, 110, 5);
    t('แท่งที่เข้าไม้ห้ามนับ TP (แม้ high จะเลย target ไปแล้ว)',
      s.reason !== 'tp', `ได้ ${s.reason}`);
  }
  {
    // แต่ SL ในแท่งเข้ายังต้องนับ — ไม่สมมาตรโดยตั้งใจ
    const bars = [mk(100, 100, 100, 100), mk(100, 101, 85, 95)];
    const s = simulate(bars, 1, true, 100, 90, 110, 5);
    t('แท่งที่เข้าไม้ยังนับ SL ตามเดิม', s.reason === 'sl', `ได้ ${s.reason}`);
  }
  {
    // ฝั่งขายก็ต้องกันเหมือนกัน
    const bars = [mk(100, 100, 100, 100), mk(100, 101, 85, 100), mk(100, 101, 99.5, 100)];
    const s = simulate(bars, 1, false, 100, 110, 90, 5);
    t('ฝั่งขาย: แท่งที่เข้าไม้ห้ามนับ TP', s.reason !== 'tp', `ได้ ${s.reason}`);
  }
  // timeout ปิดที่ราคาปิด
  {
    const bars = [mk(100, 100, 100, 100), mk(100, 101, 99, 100), mk(100, 101, 99, 105), mk(100, 101, 99, 100)];
    const s = simulate(bars, 1, true, 100, 90, 130, 2);
    t('ครบเพดานถือแล้วปิดที่ราคาปิด', s.reason === 'timeout' && Math.abs(s.r - 0.5) < 1e-9, `${s.reason} r=${s.r}`);
  }
  // ฝั่งขาย (TP ต้องอยู่แท่งถัดจากแท่งเข้า)
  {
    const bars = [mk(100, 100, 100, 100), mk(100, 101, 99, 100), mk(100, 101, 88, 90)];
    const s = simulate(bars, 1, false, 100, 110, 90, 5);
    t('ฝั่งขายชน TP ให้ R เป็นบวก', s.reason === 'tp' && s.r > 0, `${s.reason} r=${s.r}`);
  }
  // ต้นทุนโตเมื่อ SL แคบลง
  {
    const wide = costRFor(4000, 3960, SYMBOL, MARKET);
    const tight = costRFor(4000, 3990, SYMBOL, MARKET);
    t('SL แคบลง → ต้นทุนต่อ R สูงขึ้น', tight > wide, `${tight} vs ${wide}`);
  }
  // guard ชุด test
  {
    let threw = false;
    try {
      const split = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));
      const cut = Date.parse(split.timeframes['1D'].validationEnd);
      const bad = [{ timestamp: new Date(cut + 86400000).toISOString() }];
      for (const x of bad) if (Date.parse(x.timestamp) >= cut) throw new Error('guard');
    } catch { threw = true; }
    t('guard ชุด test จับแท่งที่หลุดเข้ามาได้', threw);
  }
  // bootstrap
  {
    const trades = Array.from({ length: 200 }, (_, i) => ({ rNet: 1, month: `2025-${String((i % 12) + 1).padStart(2, '0')}` }));
    const s = clusterStats(trades, { B: 200 });
    t('ชุดที่บวกล้วนต้องได้ช่วงความเชื่อมั่นที่ไม่คร่อมศูนย์', s.lo95 > 0, JSON.stringify(s));
    const mixed = trades.map((x, i) => ({ ...x, rNet: i % 2 ? 1 : -1 }));
    const s2 = clusterStats(mixed, { B: 200 });
    t('ชุดที่ค่ากลางเป็นศูนย์ต้องได้ p สูง', s2.pBoot > 0.2, JSON.stringify(s2));
  }
  // การนับแตะไม่ซ้ำภายในการแตะครั้งเดียว
  {
    const bars = [];
    for (let i = 0; i < 40; i++) bars.push(mk(100, 100.4, 99.6, 100));
    const z = { side: 'demand', proximal: 100.2, distal: 99, knownFromIndex: 0 };
    const st = zoneStateAt(bars, z, 39);
    t('ราคาค้างในโซนหลายแท่งนับเป็นการแตะครั้งเดียว', st.touches === 1, `ได้ ${st.touches}`);
  }

  console.log(`self-test — ผ่าน ${pass} · ตก ${fail}`);
  process.exit(fail ? 1 : 0);
}

// ─────────────────────────────── รันจริง ───────────────────────────────

const report = { symbol: SYMBOL, params: ZONE_PARAMS, stopBuffer: STOP_BUFFER, timeframes: {} };
const holmEntries = [];

for (const tf of Object.keys(MAX_HOLD_BARS)) {
  const { bars, dropped, validationEnd } = loadMeasurable(tf);
  const cands = findZoneCandidates(bars);
  const tfOut = {
    bars: bars.length,
    droppedTestBars: dropped,
    validationEnd,
    from: bars[0]?.timestamp,
    to: bars[bars.length - 1]?.timestamp,
    zonesFormed: cands.length,
    zonesByKind: {},
    rr: {},
  };
  for (const k of ['RBR', 'DBR', 'DBD', 'RBD']) tfOut.zonesByKind[k] = cands.filter(z => z.kind === k).length;

  for (const rr of RR_TARGETS) {
    const real = collectTouchTrades(bars, tf, rr);
    if (!real.length) { tfOut.rr[rr] = { note: 'ไม่มีไม้' }; continue; }

    const rnd = mulberry32(SEED + rr);
    const flipped = flippedTrades(bars, real, tf);
    const randEntry = randomEntryTrades(bars, real, tf, rnd);
    const randZone = shuffledZoneTrades(bars, real, tf, mulberry32(SEED + rr + 77));

    // ตัวเทียบ ๓ แบบทำซ้ำ — สร้างการแจกแจงของความบังเอิญ
    const permMeans = [];
    for (let p = 0; p < PERM_ROUNDS; p++) {
      const r2 = mulberry32(SEED + rr * 1000 + p);
      const fake = shuffledZoneTrades(bars, real, tf, r2);
      if (fake.length) permMeans.push(fake.reduce((a, t) => a + t.rNet, 0) / fake.length);
    }
    permMeans.sort((a, b) => a - b);
    const realMean = real.reduce((a, t) => a + t.rNet, 0) / real.length;
    const above = permMeans.filter(m => m >= realMean).length;
    const pPerm = permMeans.length ? (above + 1) / (permMeans.length + 1) : null;

    // ทางเลือกที่อาจพลิกผล: ขยาย SL ตามชั้นนโยบายของ production ให้ต้นทุนถูกลง
    const floored = collectTouchTrades(bars, tf, rr, { stopFloor: true });

    const stats = clusterStats(real);
    const statsFloor = floored.length ? clusterStats(floored) : null;
    const cell = {
      real: summarize(real),
      stopFloor: summarize(floored),
      stopFloorBootstrap: statsFloor,
      flipped: summarize(flipped),
      randomEntry: summarize(randEntry),
      randomZone: summarize(randZone),
      permutation: {
        rounds: permMeans.length,
        p: pPerm,
        nullMean: permMeans.length ? permMeans.reduce((a, b) => a + b, 0) / permMeans.length : null,
        null95: permMeans.length ? pctOf(permMeans, 0.95) : null,
      },
      bootstrap: stats,
      byFreshness: {
        fresh: summarize(real.filter(t => t.fresh)),
        tested: summarize(real.filter(t => !t.fresh)),
      },
      byKind: Object.fromEntries(['RBR', 'DBR', 'DBD', 'RBD'].map(k => [k, summarize(real.filter(t => t.kind === k))])),
      bySide: {
        demand: summarize(real.filter(t => t.zoneSide === 'demand')),
        supply: summarize(real.filter(t => t.zoneSide === 'supply')),
      },
    };
    tfOut.rr[rr] = cell;
    // ครอบครัวของ Holm ต้องรวมทุกอย่างที่ทดสอบจริง รวมทั้งแบบขยาย SL
    // การไม่นับมันเข้าไปคือการซ่อนจำนวนครั้งที่ยิง แล้วค่า p จะดูดีเกินจริง
    if (stats?.pCluster != null) holmEntries.push({ key: `${tf}|RR${rr}`, p: stats.pCluster });
    if (statsFloor?.pCluster != null) holmEntries.push({ key: `${tf}|RR${rr}|SLกว้าง`, p: statsFloor.pCluster });
  }
  report.timeframes[tf] = tfOut;
}

report.holm = holmEntries.length ? holmFromEntries(holmEntries) : null;

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ─────────────────────────────── พิมพ์ผล ───────────────────────────────

const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : ' n/a ');
const r4 = (v) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(4) : '  n/a ');
const padR = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

console.log('\n═══ โซนดีมาน/ซัพพลายบนทองคำ — วัดจากอดีตจริง ═══\n');
console.log(`พารามิเตอร์: ขาออก ≥ ${ZONE_PARAMS.minDepartureAtr}×ATR ใน ${ZONE_PARAMS.departureBars} แท่ง · ฐาน ≤ ${ZONE_PARAMS.maxBaseBars} แท่ง · SL พ้นขอบนอก ${STOP_BUFFER * 100}% ของความหนา`);

for (const [tf, o] of Object.entries(report.timeframes)) {
  console.log(`\n──────── ${tf} ─────────────────────────────────────────────────────`);
  console.log(`แท่งที่ใช้ ${o.bars} (${o.from?.slice(0, 10)} → ${o.to?.slice(0, 10)}) · ตัดชุด test ทิ้ง ${o.droppedTestBars} แท่ง`);
  console.log(`โซนที่ก่อตัว ${o.zonesFormed} ใบ — ` +
    Object.entries(o.zonesByKind).map(([k, v]) => `${k} ${v}`).join(' · '));

  for (const rr of RR_TARGETS) {
    const c = o.rr[rr];
    if (!c || c.note) { console.log(`\n  RR 1:${rr} — ${c?.note ?? 'ไม่มีข้อมูล'}`); continue; }
    console.log(`\n  RR 1:${rr}  (${c.real.n} ไม้ · ระยะ SL เฉลี่ย ${pct(c.real.stopPct)} ของราคา · ถือเฉลี่ย ${c.real.heldBars.toFixed(1)} แท่ง)`);
    console.log(`    ${padR('', 14)} ${padL('ชน TP', 7)} ${padL('ชน SL', 7)} ${padL('หมดเวลา', 8)} ${padL('R ก่อนต้นทุน', 13)} ${padL('ต้นทุน', 8)} ${padL('R สุทธิ', 9)}`);
    const row = (label, s) => {
      if (!s) { console.log(`    ${padR(label, 14)} ${padL('—', 7)}`); return; }
      console.log(`    ${padR(label, 14)} ${padL(pct(s.tp), 7)} ${padL(pct(s.sl), 7)} ${padL(pct(s.timeout), 8)} ${padL(r4(s.rGross), 13)} ${padL(s.costR.toFixed(4), 8)} ${padL(r4(s.rNet), 9)}`);
    };
    row('โซนจริง', c.real);
    row('+ ขยาย SL', c.stopFloor);
    row('กลับทิศ', c.flipped);
    row('สุ่มจุดเข้า', c.randomEntry);
    row('สุ่มตำแหน่งโซน', c.randomZone);

    const b = c.bootstrap;
    if (b) {
      console.log(`    ช่วงความเชื่อมั่น 95% ของ R สุทธิ: ${r4(b.lo95)} … ${r4(b.hi95)}  (จับกลุ่ม ${b.months} เดือน)`);
      console.log(`    p (bootstrap) ${b.pBoot.toFixed(3)} · p (cluster t) ${b.pCluster == null ? 'n/a' : b.pCluster.toFixed(3)} · p (permutation) ${c.permutation.p?.toFixed(3) ?? 'n/a'}`);
    }
    const bf = c.stopFloorBootstrap;
    if (bf) {
      console.log(`    แบบขยาย SL — ช่วง 95%: ${r4(bf.lo95)} … ${r4(bf.hi95)} · p (bootstrap) ${bf.pBoot.toFixed(3)} · p (cluster t) ${bf.pCluster == null ? 'n/a' : bf.pCluster.toFixed(3)}`);
    }
    const f = c.byFreshness;
    if (f.fresh && f.tested) {
      console.log(`    โซนสด ${f.fresh.n} ไม้ → ${r4(f.fresh.rNet)} R  ·  โซนที่เคยถูกแตะ ${f.tested.n} ไม้ → ${r4(f.tested.rNet)} R`);
    }
    const s = c.bySide;
    if (s.demand && s.supply) {
      console.log(`    ฝั่งซื้อ (demand) ${s.demand.n} ไม้ → ${r4(s.demand.rNet)} R  ·  ฝั่งขาย (supply) ${s.supply.n} ไม้ → ${r4(s.supply.rNet)} R`);
    }
    const kinds = Object.entries(c.byKind).filter(([, v]) => v && v.n >= 20);
    if (kinds.length) {
      console.log(`    แยกตามรูปแบบ: ` + kinds.map(([k, v]) => `${k} ${v.n} ไม้ ${r4(v.rNet)}`).join(' · '));
    }
  }
}

if (report.holm) {
  console.log('\n──────── Holm–Bonferroni (คุมความผิดพลาดจากการทดสอบหลายครั้ง) ────────');
  for (const e of report.holm.results ?? report.holm) {
    console.log(`  ${padR(e.key, 12)} p=${e.p.toFixed(4)}  ${e.reject ? '✔ รอด' : '✘ ตก'}`);
  }
}

console.log('\nวิธีอ่าน: แถว "โซนจริง" ต้องดีกว่าทั้ง "สุ่มจุดเข้า" และ "สุ่มตำแหน่งโซน" อย่างชัดเจน');
console.log('          และ R สุทธิต้องเป็นบวกหลังหักต้นทุนแล้ว ไม่ใช่แค่ก่อนหัก');
console.log('          ช่วงความเชื่อมั่นที่คร่อมศูนย์ = ยังแยกไม่ออกจากความบังเอิญ\n');
