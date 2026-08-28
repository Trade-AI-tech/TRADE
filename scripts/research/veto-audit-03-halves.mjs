#!/usr/bin/env node
/**
 * veto-audit-03-halves.mjs — ตัดครึ่งช่วงเวลา: ครึ่งแรกกับครึ่งหลังไปทางเดียวกันไหม
 *
 * แบ่งสองแบบเพราะสองแบบตอบคนละคำถาม:
 *   · byCount — แบ่งที่มัธยฐานของ "เวลาสัญญาณ" ให้ไม้เท่ากันสองกอง (อำนาจเท่ากัน)
 *   · byTime  — แบ่งครึ่งปฏิทินจริง (ตอบว่ายุคไหนเป็นตัวขับ) — ไม้ไม่เท่ากัน
 *
 * เกณฑ์: ถ้าเครื่องหมายของ delta สองครึ่งขัดกัน แปลว่า delta เต็มกองไม่ใช่ค่าคงที่
 * ที่จะพาไปข้างหน้าได้ มันเป็นค่าเฉลี่ยของสองยุคที่ไม่เหมือนกัน
 */
import fs from 'node:fs';
import { loadVetoProbe } from './veto-audit-probe.mjs';

const DUMP = process.argv[2];
const B = Number(process.env.B ?? 4000);
const SEED = 20260828;
const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
const { mod } = await loadVetoProbe();

const CONFIGS = [
  ['meanrev', 1], ['overext', 2], ['levelpath', 4], ['choch', 8], ['all4', 15],
  ['meanrev+overext', 3], ['meanrev+levelpath', 5], ['meanrev+choch', 9],
  ['overext+levelpath', 6], ['overext+choch', 10], ['levelpath+choch', 12],
];

function evalPool(trades, mask) {
  const n = trades.length;
  const rNet = new Float64Array(n);
  const byKey = new Map(); const keyOf = new Array(n);
  for (let i = 0; i < n; i++) {
    rNet[i] = trades[i].rNet; keyOf[i] = trades[i].sym;
    let a = byKey.get(trades[i].sym); if (!a) { a = []; byKey.set(trades[i].sym, a); } a.push(i);
  }
  const cutIdx = []; for (let i = 0; i < n; i++) if ((trades[i].mask & mask) !== 0) cutIdx.push(i);
  let sumAll = 0; for (let i = 0; i < n; i++) sumAll += rNet[i];
  const k = cutIdx.length; const keep = n - k;
  if (keep <= 0 || k === 0) return { n, k, delta: null, p: null, meanAll: sumAll / n };
  let sumCut = 0; for (const i of cutIdx) sumCut += rNet[i];
  const delta = (sumAll - sumCut) / keep - sumAll / n;
  const p = mod.permutationTest({ rNet, groups: { byKey, keyOf }, cutIdx, B, seed: SEED, stratified: true }).pOneSided;
  return { n, k, delta, p, meanAll: sumAll / n };
}

for (const tf of Object.keys(dump.timeframes)) {
  const T = dump.timeframes[tf].trades.slice().sort((a, b) => Date.parse(a.sT) - Date.parse(b.sT));
  const ts = T.map((t) => Date.parse(t.sT));
  const midCount = T.length >> 1;
  const midTime = (ts[0] + ts[ts.length - 1]) / 2;

  const splits = {
    byCount: [T.slice(0, midCount), T.slice(midCount)],
    byTime: [T.filter((t) => Date.parse(t.sT) < midTime), T.filter((t) => Date.parse(t.sT) >= midTime)],
  };

  for (const [kind, [A, Bh]] of Object.entries(splits)) {
    console.log(`\n═══════ ${tf} · ครึ่งเวลา (${kind}) ═══════`);
    console.log(`ครึ่งแรก  ${String(A.length).padStart(6)} ไม้ · ${A[0].sT.slice(0, 10)} → ${A[A.length - 1].sT.slice(0, 10)} · meanR ${(A.reduce((s, t) => s + t.rNet, 0) / A.length).toFixed(5)}`);
    console.log(`ครึ่งหลัง ${String(Bh.length).padStart(6)} ไม้ · ${Bh[0].sT.slice(0, 10)} → ${Bh[Bh.length - 1].sT.slice(0, 10)} · meanR ${(Bh.reduce((s, t) => s + t.rNet, 0) / Bh.length).toFixed(5)}`);
    console.log(`\n${'ชุด'.padEnd(19)}${'delta เต็ม'.padStart(12)}${'delta H1'.padStart(12)}${'delta H2'.padStart(12)}${'p H1'.padStart(8)}${'p H2'.padStart(8)}  ทิศ`);
    let agree = 0; let total = 0;
    for (const [id, mask] of CONFIGS) {
      const full = evalPool(T, mask);
      const a = evalPool(A, mask); const b = evalPool(Bh, mask);
      const same = a.delta !== null && b.delta !== null && Math.sign(a.delta) === Math.sign(b.delta);
      if (a.delta !== null && b.delta !== null) { total++; if (same) agree++; }
      console.log(`${id.padEnd(19)}${full.delta.toFixed(5).padStart(12)}${(a.delta ?? NaN).toFixed(5).padStart(12)}${(b.delta ?? NaN).toFixed(5).padStart(12)}`
        + `${(a.p ?? NaN).toFixed(3).padStart(8)}${(b.p ?? NaN).toFixed(3).padStart(8)}  ${same ? 'ตรงกัน' : 'ขัดกัน'}`);
    }
    console.log(`→ เครื่องหมายตรงกัน ${agree}/${total} ชุด (สุ่มล้วนคาดหวัง ${(total / 2).toFixed(1)}/${total})`);
  }
}
