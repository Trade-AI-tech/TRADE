#!/usr/bin/env node
/**
 * veto-audit-05-seed-and-decomp.mjs
 *
 * (ก) p ที่รายงานไว้ มั่นคงแค่ไหนเมื่อเปลี่ยนเมล็ด — รายงานเองยอมรับว่า
 *     sumOfRandomSubset() ไม่รีเซ็ต pool ระหว่างรอบ จึงมีสหสัมพันธ์ข้ามรอบ
 *     ทำให้ความคลาดเคลื่อนมอนติคาร์โลจริงสูงกว่า 1/sqrt(B) แต่ไม่ได้วัดว่าสูงแค่ไหน
 *     ถ้า SD ของ p ข้ามเมล็ดใหญ่ ตัวเลข p ทศนิยม 4 ตำแหน่งในรายงานคือความแม่นยำหลอก
 *
 * (ข) delta มาจาก symbol ไหน — แยกส่วนแบบบวกกันได้:
 *     delta = (k/keep)·(meanAll − meanCut) และ meanCut ถ่วงน้ำหนักด้วยจำนวนไม้ที่ตัด
 *     จึงกระจายเป็นผลรวมของส่วนแบ่งราย symbol ได้ตรง ๆ
 *
 * (ค) jackknife SE ของ delta จากผล LOO เทียบ nullSd — ตรวจซ้ำตัวเลข ×1.1 ที่ได้จาก
 *     block bootstrap ด้วยวิธีที่ไม่เกี่ยวกัน
 */
import fs from 'node:fs';
import { loadVetoProbe } from './veto-audit-probe.mjs';

const DUMP = process.argv[2];
const LOO = process.argv[3];
const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
const loo = JSON.parse(fs.readFileSync(LOO, 'utf8'));
const rep = JSON.parse(fs.readFileSync('scripts/research/reports/veto-lab.json', 'utf8'));
const { mod } = await loadVetoProbe();

const CONFIGS = [
  ['meanrev', 1], ['overext', 2], ['levelpath', 4], ['choch', 8], ['all4', 15],
  ['meanrev+overext', 3], ['meanrev+levelpath', 5], ['meanrev+choch', 9],
  ['overext+levelpath', 6], ['overext+choch', 10], ['levelpath+choch', 12],
];
const SEEDS = 24;
const B = 10000;

function ctxOf(trades) {
  const rNet = new Float64Array(trades.length);
  const byKey = new Map(); const keyOf = new Array(trades.length);
  for (let i = 0; i < trades.length; i++) {
    rNet[i] = trades[i].rNet; keyOf[i] = trades[i].sym;
    let a = byKey.get(trades[i].sym); if (!a) { a = []; byKey.set(trades[i].sym, a); } a.push(i);
  }
  return { rNet, groups: { byKey, keyOf } };
}
function sd(a) {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

for (const tf of Object.keys(dump.timeframes)) {
  const T = dump.timeframes[tf].trades;
  const n = T.length;
  const { rNet, groups } = ctxOf(T);
  console.log(`\n============== ${tf} ==============`);

  // ── (ก) เสถียรภาพของ p ข้ามเมล็ด ──
  console.log(`\n-- p ข้าม ${SEEDS} เมล็ด (B = ${B} เท่าของจริง · stratified) --`);
  console.log('ชุด'.padEnd(19) + 'p รายงาน'.padStart(10) + 'p เฉลี่ย'.padStart(10)
    + 'SD(p)'.padStart(9) + 'p ต่ำสุด'.padStart(10) + 'p สูงสุด'.padStart(10)
    + 'SD ทฤษฎี iid'.padStart(14) + 'เท่าของ iid'.padStart(12) + 'SD(nullSd)/nullSd'.padStart(19));
  for (const [id, mask] of CONFIGS) {
    const row = rep.timeframes[tf].results.find((r) => r.config === id);
    const cutIdx = []; for (let i = 0; i < n; i++) if ((T[i].mask & mask) !== 0) cutIdx.push(i);
    const ps = []; const sds = [];
    for (let s = 0; s < SEEDS; s++) {
      const out = mod.permutationTest({ rNet, groups, cutIdx, B, seed: (20260828 + s * 7919) >>> 0, stratified: true });
      ps.push(out.pOneSided); sds.push(out.nullSd);
    }
    const mp = ps.reduce((a, b) => a + b, 0) / ps.length;
    const theo = Math.sqrt((mp * (1 - mp)) / B);
    const msd = sds.reduce((a, b) => a + b, 0) / sds.length;
    console.log(id.padEnd(19) + row.permStratified.pOneSided.toFixed(4).padStart(10)
      + mp.toFixed(4).padStart(10) + sd(ps).toFixed(4).padStart(9)
      + Math.min(...ps).toFixed(4).padStart(10) + Math.max(...ps).toFixed(4).padStart(10)
      + theo.toFixed(4).padStart(14) + (sd(ps) / theo).toFixed(2).padStart(12)
      + (100 * sd(sds) / msd).toFixed(2).padStart(17) + '%');
  }

  // ── (ข) delta แยกตาม symbol ──
  console.log('\n-- delta แยกตาม symbol (ส่วนแบ่งที่บวกกันได้ = delta เต็ม) --');
  const syms = [...new Set(T.map((t) => t.sym))];
  let sAll = 0; for (const t of T) sAll += t.rNet;
  const meanAll = sAll / n;
  console.log('ชุด'.padEnd(19) + 'delta'.padStart(11) + '  ส่วนแบ่งเรียงจากมากไปน้อย (symbol:ส่วนแบ่ง)');
  for (const [id, mask] of CONFIGS) {
    const cut = T.filter((t) => (t.mask & mask) !== 0);
    const k = cut.length; const keep = n - k;
    const parts = syms.map((s) => {
      const cs = cut.filter((t) => t.sym === s);
      // delta = (Σ_cut (meanAll − r_i)) / keep  →  แยกตาม symbol ได้ทันที
      let acc = 0; for (const t of cs) acc += meanAll - t.rNet;
      return { s, v: acc / keep, k: cs.length };
    }).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const total = parts.reduce((a, b) => a + b.v, 0);
    const topShare = Math.abs(parts[0].v) / parts.reduce((a, b) => a + Math.abs(b.v), 0);
    console.log(id.padEnd(19) + total.toFixed(5).padStart(11) + '  '
      + parts.slice(0, 4).map((p) => `${p.s}:${p.v >= 0 ? '+' : ''}${p.v.toFixed(5)}`).join(' ')
      + `   [สูงสุดกินสัดส่วน ${(100 * topShare).toFixed(0)}% ของขนาดรวม]`);
  }

  // ── (ค) jackknife SE จากผล LOO ──
  console.log('\n-- jackknife SE ของ delta (จาก LOO 13 รอบ) เทียบ nullSd ของ permutation --');
  console.log('ชุด'.padEnd(19) + 'delta'.padStart(11) + 'nullSd'.padStart(11)
    + 'SE jackknife'.padStart(14) + 'jack/nullSd'.padStart(13) + 't = delta/SEjack'.padStart(18));
  for (const r of loo[tf]) {
    const ds = r.loo.map((x) => x.delta);
    const G = ds.length;
    const m = ds.reduce((a, b) => a + b, 0) / G;
    const seJack = Math.sqrt(((G - 1) / G) * ds.reduce((a, b) => a + (b - m) ** 2, 0));
    const row = rep.timeframes[tf].results.find((x) => x.config === r.config);
    console.log(r.config.padEnd(19) + r.deltaFull.toFixed(5).padStart(11)
      + row.permStratified.nullSd.toFixed(6).padStart(11) + seJack.toFixed(6).padStart(14)
      + (seJack / row.permStratified.nullSd).toFixed(2).padStart(13)
      + (r.deltaFull / seJack).toFixed(2).padStart(18));
  }
}
