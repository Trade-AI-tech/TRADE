#!/usr/bin/env node
/**
 * veto-audit-04-overlap-mde.mjs — สามเรื่องที่ต้องวัดพร้อมกันเพราะมันคือเรื่องเดียวกัน
 *
 *  (1) ไม้ซ้อนทับกันแค่ไหน — ทั้งใน symbol เดียวกัน (ช่วงถือทับกัน) และข้าม symbol
 *      (สัญญาณวันเดียวกันบนคู่เงินที่มี USD ร่วมกัน = แท่งเดียวกันของ dollar index)
 *  (2) SE ของ delta ที่ resample จริง 3 แบบ เทียบกับ nullSd ของ permutation
 *      → บอกตรง ๆ ว่ายาร์ดสติ๊กที่รายงานใช้ "แคบเกินจริง" กี่เท่า
 *  (3) MDE คำนวณเองจาก σ ที่วัดจากไม้จริง เทียบกับที่รายงานอ้าง
 *
 * ทำไมต้อง block bootstrap ตามเวลา ไม่ใช่แค่ cluster ตาม symbol:
 * cluster ตาม symbol เก็บได้แต่สหสัมพันธ์ "ในตัวเดียวกัน" มันมองไม่เห็นเลยว่า
 * EURUSD/GBPUSD/AUDUSD ที่ยิงพร้อมกันในวันดอลลาร์แข็ง คือเดิมพันเดียวกันซ้ำ 3 ครั้ง
 * — 9 ใน 13 ตัวมี USD อยู่ในคู่ (รายงานเองก็ยกข้อนี้เป็นข้อควรระวัง แต่ไม่ได้วัด)
 */
import fs from 'node:fs';
import { loadVetoProbe } from './veto-audit-probe.mjs';

const DUMP = process.argv[2];
const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
const rep = JSON.parse(fs.readFileSync('scripts/research/reports/veto-lab.json', 'utf8'));
const holm = JSON.parse(fs.readFileSync('scripts/research/reports/veto-lab-holm.json', 'utf8'));
const { deps } = await loadVetoProbe();
const mulberry = deps.L.mulberry32;

const CONFIGS = [
  ['meanrev', 1], ['overext', 2], ['levelpath', 4], ['choch', 8], ['all4', 15],
  ['meanrev+overext', 3], ['meanrev+levelpath', 5], ['meanrev+choch', 9],
  ['overext+levelpath', 6], ['overext+choch', 10], ['levelpath+choch', 12],
];
const DAY = 86400000;
const BLOCK_DAYS = { '1D': 90, '1H': 21 };
const BB = 4000;

function deltaOf(pool, mask) {
  let sAll = 0; let sCut = 0; let k = 0;
  for (const t of pool) { sAll += t.rNet; if ((t.mask & mask) !== 0) { sCut += t.rNet; k++; } }
  const n = pool.length; const keep = n - k;
  if (keep <= 0 || k === 0) return null;
  return (sAll - sCut) / keep - sAll / n;
}
function sd(a) {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
function med(a) { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

for (const tf of Object.keys(dump.timeframes)) {
  const D = dump.timeframes[tf];
  const T = D.trades;
  const n = T.length;
  const maxHold = deps.L.MAX_HOLD_BARS[tf];
  console.log(`\n============== ${tf} · ${n} ไม้ ==============`);

  // ── (1) ไม้ซ้อนทับกัน ภายใน symbol ──
  const bySym = new Map();
  for (const t of T) { let a = bySym.get(t.sym); if (!a) { a = []; bySym.set(t.sym, a); } a.push(t); }
  let overlapped = 0; let pairSum = 0; let heldSum = 0; let gapSum = 0; let gapN = 0; let closeGap = 0;
  for (const [, arr] of bySym) {
    arr.sort((a, b) => a.eIdx - b.eIdx);
    for (let i = 0; i < arr.length; i++) {
      heldSum += arr[i].held;
      let c = 0;
      for (let j = i + 1; j < arr.length && arr[j].eIdx <= arr[i].xIdx; j++) c++;
      for (let j = i - 1; j >= 0 && arr[i].eIdx <= arr[j].xIdx; j--) c++;
      if (c > 0) overlapped++;
      pairSum += c;
      if (i > 0) {
        gapSum += arr[i].eIdx - arr[i - 1].eIdx; gapN++;
        if (arr[i].eIdx - arr[i - 1].eIdx < maxHold) closeGap++;
      }
    }
  }
  console.log('\n-- ไม้ซ้อนทับกัน (ภายใน symbol เดียวกัน) --');
  console.log(`  ไม้ที่ช่วงถือทับกับไม้อื่น           : ${overlapped}/${n} = ${(100 * overlapped / n).toFixed(1)}%`);
  console.log(`  จำนวนไม้ที่ทับกันเฉลี่ยต่อไม้        : ${(pairSum / n).toFixed(2)}`);
  console.log(`  ระยะห่างเฉลี่ยระหว่างสัญญาณติดกัน    : ${(gapSum / gapN).toFixed(1)} แท่ง (เพดานถือ ${maxHold} แท่ง)`);
  console.log(`  คู่ที่ห่างกันน้อยกว่าเพดานถือ        : ${closeGap}/${gapN} = ${(100 * closeGap / gapN).toFixed(1)}%`);
  console.log(`  ไม้เปิดพร้อมกันเฉลี่ยต่อ symbol      : ${(heldSum / bySym.size / (D.spanDays * (tf === '1D' ? 5 / 7 : 24 * 5 / 7))).toFixed(3)}`);

  // ── ซ้อนข้าม symbol ──
  const byDay = new Map();
  for (const t of T) { const d = t.sT.slice(0, 10); byDay.set(d, (byDay.get(d) ?? 0) + 1); }
  const days = [...byDay.values()];
  const inBusy = days.filter((v) => v >= 3).reduce((a, b) => a + b, 0);
  console.log('\n-- ซ้อนข้าม symbol (สัญญาณวันปฏิทินเดียวกัน) --');
  console.log(`  วันที่มีสัญญาณ                       : ${days.length} วัน`);
  console.log(`  สัญญาณเฉลี่ยต่อวันที่มีสัญญาณ        : ${(n / days.length).toFixed(2)}`);
  console.log(`  ไม้ที่อยู่ในวันที่มีสัญญาณ >= 3 ตัว  : ${inBusy}/${n} = ${(100 * inBusy / n).toFixed(1)}%`);

  // ── (2) SE ของ delta ──
  const t0 = Date.parse(D.spanFirst);
  const blockMs = BLOCK_DAYS[tf] * DAY;
  const blocks = new Map();
  for (const t of T) {
    const b = Math.floor((Date.parse(t.sT) - t0) / blockMs);
    let a = blocks.get(b); if (!a) { a = []; blocks.set(b, a); } a.push(t);
  }
  const blockArr = [...blocks.values()];
  const symArr = [...bySym.values()];
  console.log(`\n-- หน่วยที่ resample : symbol ${symArr.length} คลัสเตอร์ · time block ${BLOCK_DAYS[tf]} วัน = ${blockArr.length} บล็อก --`);

  const rnd = mulberry(20260828);
  function bootSE(units, mask, flat) {
    const out = [];
    for (let b = 0; b < BB; b++) {
      const pool = [];
      if (flat) { for (let i = 0; i < n; i++) pool.push(T[(rnd() * n) | 0]); }
      else { for (let g = 0; g < units.length; g++) { const u = units[(rnd() * units.length) | 0]; for (const t of u) pool.push(t); } }
      const d = deltaOf(pool, mask);
      if (d !== null) out.push(d);
    }
    return out.length > 2 ? sd(out) : null;
  }

  console.log('\n-- SE ของ delta (bootstrap ' + BB + ' รอบ) เทียบ nullSd ของ permutation --');
  console.log('ชุด'.padEnd(19) + 'nullSd(strat)'.padStart(14) + 'SE iid'.padStart(11)
    + 'SE symbol'.padStart(11) + 'SE block'.padStart(11) + 'block/null'.padStart(11) + 'block/iid'.padStart(11));
  const ratios = [];
  for (const [id, mask] of CONFIGS) {
    const row = rep.timeframes[tf].results.find((r) => r.config === id);
    const nullSd = row.permStratified.nullSd;
    const seI = bootSE(null, mask, true);
    const seS = bootSE(symArr, mask, false);
    const seB = bootSE(blockArr, mask, false);
    ratios.push({ id, seI, seS, seB, rBlockNull: seB / nullSd, rBlockIid: seB / seI, rSymNull: seS / nullSd });
    console.log(id.padEnd(19) + nullSd.toFixed(6).padStart(14) + seI.toFixed(6).padStart(11)
      + seS.toFixed(6).padStart(11) + seB.toFixed(6).padStart(11)
      + (seB / nullSd).toFixed(2).padStart(11) + (seB / seI).toFixed(2).padStart(11));
  }
  console.log(`-> มัธยฐาน block/nullSd = x${med(ratios.map((r) => r.rBlockNull)).toFixed(2)}`
    + ` · block/iid = x${med(ratios.map((r) => r.rBlockIid)).toFixed(2)}`
    + ` · symbol/nullSd = x${med(ratios.map((r) => r.rSymNull)).toFixed(2)}`);

  // ── design effect ของ meanR ──
  function bootSEmean(units, flat) {
    const out = [];
    for (let b = 0; b < BB; b++) {
      let s = 0; let c = 0;
      if (flat) { for (let i = 0; i < n; i++) { s += T[(rnd() * n) | 0].rNet; c++; } }
      else {
        for (let g = 0; g < units.length; g++) {
          const u = units[(rnd() * units.length) | 0];
          for (const t of u) { s += t.rNet; c++; }
        }
      }
      out.push(s / c);
    }
    return sd(out);
  }
  const hTf = holm.timeframes[tf];
  const seMeanIid = bootSEmean(null, true);
  const seMeanSym = bootSEmean(symArr, false);
  const seMeanBlk = bootSEmean(blockArr, false);
  console.log(`\n-- design effect ของ meanR (รายงานอ้าง x${hTf.designEffect.toFixed(2)}) --`);
  console.log(`  SE ไร้เดียงสา σ/sqrt(n)   = ${hTf.seNaive.toFixed(6)}  (bootstrap iid ของฉัน = ${seMeanIid.toFixed(6)})`);
  console.log(`  SE cluster ตาม symbol     = ${hTf.seCluster.toFixed(6)} (รายงาน · ความกว้าง CI ÷ 3.92)`);
  console.log(`                              ${seMeanSym.toFixed(6)} (ของฉัน · SD ของ bootstrap)`);
  console.log(`  SE block ตามเวลา          = ${seMeanBlk.toFixed(6)}`);
  console.log(`  design effect symbol      = x${(seMeanSym / seMeanIid).toFixed(2)}`);
  console.log(`  design effect block(เวลา) = x${(seMeanBlk / seMeanIid).toFixed(2)}   <- ตัวที่หายไปจากรายงาน`);

  // ── (3) MDE ──
  const r2 = T.map((t) => t.rNet);
  const mu = r2.reduce((a, b) => a + b, 0) / r2.length;
  const sigma = Math.sqrt(r2.reduce((s, v) => s + (v - mu) ** 2, 0) / r2.length);
  const Z = 1.6448536269514722 + 0.8416212335729143;
  console.log(`\n-- MDE คำนวณเองจาก σ ของไม้จริง (σ = ${sigma.toFixed(6)} · รายงานกู้ได้ ${hTf.sigma.toFixed(6)}) --`);
  console.log('ชุด'.padEnd(19) + 'k'.padStart(7) + 'nullSd ทฤษฎี'.padStart(15) + 'nullSd วัดได้'.padStart(15)
    + 'MDEgap ฉัน'.padStart(12) + 'MDEgap รายงาน'.padStart(15) + 'MDEgap+block'.padStart(14));
  for (const [id] of CONFIGS) {
    const row = rep.timeframes[tf].results.find((r) => r.config === id);
    const hRow = hTf.rows.find((r) => r.config === id);
    const k = row.cut; const keep = n - k;
    const nullSdTheory = Math.sqrt((k * sigma * sigma) / ((n - 1) * keep));
    const mdeGapMine = Z * nullSdTheory * (keep / k);
    const seB = ratios.find((r) => r.id === id).seB;
    console.log(id.padEnd(19) + String(k).padStart(7) + nullSdTheory.toFixed(6).padStart(15)
      + row.permUnstratified.nullSd.toFixed(6).padStart(15) + mdeGapMine.toFixed(4).padStart(12)
      + hRow.mde.mdeGap.toFixed(4).padStart(15) + (Z * seB * (keep / k)).toFixed(4).padStart(14));
  }

  // ── nullMean ที่หายไปจากสูตร MDE ──
  console.log('\n-- สูตร MDE ของรายงานไม่ได้บวก nullMean ของ null แบบ stratified --');
  console.log('ชุด'.padEnd(19) + 'nullMean'.padStart(11) + 'nullSd'.padStart(11)
    + 'MDEdelta รายงาน'.padStart(17) + 'MDEdelta ถูกต้อง'.padStart(18) + 'ต่างกี่ %'.padStart(11));
  for (const [id] of CONFIGS) {
    const row = rep.timeframes[tf].results.find((r) => r.config === id);
    const hRow = hTf.rows.find((r) => r.config === id);
    const nm = row.permStratified.nullMean; const ns = row.permStratified.nullSd;
    const correct = nm + Z * ns;
    console.log(id.padEnd(19) + nm.toFixed(6).padStart(11) + ns.toFixed(6).padStart(11)
      + hRow.mde.mdeDelta.toFixed(6).padStart(17) + correct.toFixed(6).padStart(18)
      + (100 * (correct - hRow.mde.mdeDelta) / hRow.mde.mdeDelta).toFixed(1).padStart(11));
  }
}
