#!/usr/bin/env node
/**
 * veto-audit-02-loo.mjs — ตัดออกทีละ symbol (leave-one-out 13 รอบ)
 *
 * คำถาม: delta ของแต่ละชุดเปลี่ยนไปแค่ไหนเมื่อเอา symbol หนึ่งออก
 * และมีชุดไหนที่ "ผลทั้งหมดมาจาก symbol เดียว" ไหม
 *
 * ตัวชี้วัดที่ใช้ตัดสิน (เข้มไว้ก่อน):
 *   · signFlips = จำนวนรอบ LOO ที่ delta พลิกเครื่องหมายจากค่าเต็ม
 *   · maxInfl   = |delta_full − delta_LOO| ที่มากที่สุด / |delta_full|
 *                 ถ้า > 1.0 แปลว่า symbol เดียวขยับผลได้มากกว่าขนาดของผลเอง
 *   · pRange    = ช่วงของ p ข้าม 13 รอบ (เสถียรไหม)
 */
import fs from 'node:fs';
import { loadVetoProbe } from './veto-audit-probe.mjs';

const DUMP = process.argv[2];
const B = Number(process.env.B ?? 2000);
const SEED = 20260828;
const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
const { mod, deps } = await loadVetoProbe();

const CONFIGS = [
  ['meanrev', 1], ['overext', 2], ['levelpath', 4], ['choch', 8], ['all4', 15],
  ['meanrev+overext', 3], ['meanrev+levelpath', 5], ['meanrev+choch', 9],
  ['overext+levelpath', 6], ['overext+choch', 10], ['levelpath+choch', 12],
];

/** สร้าง ctx แบบเดียวกับ makeCtx ของ veto-lab แต่จากกองไม้ย่อยที่เราคัดเอง */
function ctxOf(trades) {
  const rNet = new Float64Array(trades.length);
  for (let i = 0; i < trades.length; i++) rNet[i] = trades[i].rNet;
  const byKey = new Map();
  const keyOf = new Array(trades.length);
  for (let i = 0; i < trades.length; i++) {
    const s = trades[i].sym;
    keyOf[i] = s;
    let a = byKey.get(s); if (!a) { a = []; byKey.set(s, a); } a.push(i);
  }
  return { rNet, groups: { byKey, keyOf } };
}

function deltaAndP(trades, mask, withP) {
  const { rNet, groups } = ctxOf(trades);
  const cutIdx = [];
  for (let i = 0; i < trades.length; i++) if ((trades[i].mask & mask) !== 0) cutIdx.push(i);
  let sumAll = 0; for (let i = 0; i < rNet.length; i++) sumAll += rNet[i];
  const n = rNet.length; const k = cutIdx.length; const keep = n - k;
  if (keep <= 0) return { n, k, keep, delta: null, p: null };
  let sumCut = 0; for (const i of cutIdx) sumCut += rNet[i];
  const delta = (sumAll - sumCut) / keep - sumAll / n;
  let p = null;
  if (withP && k > 0) {
    p = mod.permutationTest({ rNet, groups, cutIdx, B, seed: SEED, stratified: true }).pOneSided;
  }
  return { n, k, keep, delta, p };
}

const OUT = {};
for (const tf of Object.keys(dump.timeframes)) {
  const T = dump.timeframes[tf].trades;
  const syms = [...new Set(T.map((t) => t.sym))];
  console.log(`\n═══════════════ ${tf} · leave-one-out ต่อ symbol (${syms.length} รอบ · B=${B}) ═══════════════`);
  console.log(`ไม้ต่อ symbol: ${syms.map((s) => `${s}:${T.filter((t) => t.sym === s).length}`).join(' ')}`);

  const rows = [];
  for (const [id, mask] of CONFIGS) {
    const full = deltaAndP(T, mask, true);
    const loo = syms.map((s) => ({ s, ...deltaAndP(T.filter((t) => t.sym !== s), mask, true) }));
    const deltas = loo.map((x) => x.delta);
    const ps = loo.map((x) => x.p);
    const signFlips = deltas.filter((d) => Math.sign(d) !== Math.sign(full.delta) && d !== 0).length;
    const infl = loo.map((x) => ({ s: x.s, d: full.delta - x.delta }));
    infl.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const maxInfl = Math.abs(infl[0].d);
    rows.push({
      config: id, deltaFull: full.delta, pFull: full.p,
      dMin: Math.min(...deltas), dMax: Math.max(...deltas),
      pMin: Math.min(...ps), pMax: Math.max(...ps),
      signFlips, top: infl[0].s, maxInfl, ratio: maxInfl / Math.abs(full.delta),
      loo,
    });
  }

  const H = ['ชุด', 'delta เต็ม', 'p เต็ม', 'delta ต่ำสุด', 'delta สูงสุด', 'p ต่ำ', 'p สูง', 'พลิกเครื่องหมาย', 'sym แรงสุด', '|ผล|/|delta|'];
  console.log(`\n${H[0].padEnd(19)}${H[1].padStart(12)}${H[2].padStart(9)}${H[3].padStart(13)}${H[4].padStart(13)}${H[5].padStart(8)}${H[6].padStart(8)}${H[7].padStart(9)}  ${H[8].padEnd(9)}${H[9].padStart(11)}`);
  for (const r of rows) {
    console.log(`${r.config.padEnd(19)}${r.deltaFull.toFixed(5).padStart(12)}${r.pFull.toFixed(3).padStart(9)}`
      + `${r.dMin.toFixed(5).padStart(13)}${r.dMax.toFixed(5).padStart(13)}`
      + `${r.pMin.toFixed(3).padStart(8)}${r.pMax.toFixed(3).padStart(8)}`
      + `${String(r.signFlips + '/13').padStart(9)}  ${r.top.padEnd(9)}${r.ratio.toFixed(2).padStart(11)}`);
  }
  OUT[tf] = rows;
}

fs.writeFileSync(process.argv[3] ?? 'veto-audit-loo.json', JSON.stringify(OUT, null, 1), 'utf8');
console.log('');
