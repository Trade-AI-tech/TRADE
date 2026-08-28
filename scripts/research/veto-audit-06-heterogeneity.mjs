#!/usr/bin/env node
/**
 * veto-audit-06-heterogeneity.mjs — สองครึ่งเวลา "ต่างกันเกินเสียงรบกวน" หรือเปล่า
 *
 * ครึ่งแรก/ครึ่งหลังที่เครื่องหมายขัดกันอาจเป็นแค่เสียงรบกวนก็ได้ ถ้าไม่วัดก็ตัดสินไม่ได้
 * จึงทดสอบตรง ๆ ว่า delta_H1 − delta_H2 ใหญ่กว่าความคลาดเคลื่อนของมันเองไหม
 * โดยใช้ SE ทฤษฎีของ permutation ต่อครึ่ง: Var(delta) = k·σ²/((n−1)(n−k))
 *
 * ถ้าหลายช่องมี |z| > 2 แปลว่า delta เต็มกองไม่ใช่ "ค่าคงที่ที่วัดได้แม่นขึ้นเมื่อ n โต"
 * แต่เป็นค่าเฉลี่ยของยุคที่ไม่เหมือนกัน — ซึ่งเปลี่ยนความหมายของ CI ทั้งตาราง
 *
 * แถมท้าย: 1D กับ 1H เห็นตรงกันกี่ช่อง (รายงานอ้างว่าสองกรอบ "ให้คำตอบเหมือนกัน")
 */
import fs from 'node:fs';

const dump = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rep = JSON.parse(fs.readFileSync('scripts/research/reports/veto-lab.json', 'utf8'));

const CONFIGS = [
  ['meanrev', 1], ['overext', 2], ['levelpath', 4], ['choch', 8], ['all4', 15],
  ['meanrev+overext', 3], ['meanrev+levelpath', 5], ['meanrev+choch', 9],
  ['overext+levelpath', 6], ['overext+choch', 10], ['levelpath+choch', 12],
];

function stats(pool, mask) {
  const n = pool.length;
  let sAll = 0; let sCut = 0; let k = 0;
  for (const t of pool) { sAll += t.rNet; if ((t.mask & mask) !== 0) { sCut += t.rNet; k++; } }
  const keep = n - k;
  const mean = sAll / n;
  let v = 0; for (const t of pool) v += (t.rNet - mean) ** 2;
  const sigma = Math.sqrt(v / n);
  if (k === 0 || keep <= 0) return null;
  const delta = (sAll - sCut) / keep - mean;
  const se = Math.sqrt((k * sigma * sigma) / ((n - 1) * keep));
  return { n, k, delta, se, mean };
}

const perTf = {};
for (const tf of Object.keys(dump.timeframes)) {
  const T = dump.timeframes[tf].trades.slice().sort((a, b) => Date.parse(a.sT) - Date.parse(b.sT));
  const mid = T.length >> 1;
  const A = T.slice(0, mid); const Bh = T.slice(mid);
  console.log(`\n============== ${tf} · ทดสอบความต่างของสองครึ่ง ==============`);
  console.log(`meanR ฐาน: ครึ่งแรก ${(A.reduce((s, t) => s + t.rNet, 0) / A.length).toFixed(5)}`
    + ` · ครึ่งหลัง ${(Bh.reduce((s, t) => s + t.rNet, 0) / Bh.length).toFixed(5)}`);
  console.log('\n' + 'ชุด'.padEnd(19) + 'delta เต็ม'.padStart(11) + 'delta H1'.padStart(11)
    + 'delta H2'.padStart(11) + 'ต่าง'.padStart(11) + 'SE ต่าง'.padStart(10) + 'z'.padStart(8) + '  ตัดสิน');
  let big = 0;
  perTf[tf] = {};
  for (const [id, mask] of CONFIGS) {
    const f = stats(T, mask); const a = stats(A, mask); const b = stats(Bh, mask);
    const diff = a.delta - b.delta;
    const seD = Math.sqrt(a.se * a.se + b.se * b.se);
    const z = diff / seD;
    if (Math.abs(z) > 2) big++;
    perTf[tf][id] = f.delta;
    console.log(id.padEnd(19) + f.delta.toFixed(5).padStart(11) + a.delta.toFixed(5).padStart(11)
      + b.delta.toFixed(5).padStart(11) + diff.toFixed(5).padStart(11) + seD.toFixed(5).padStart(10)
      + z.toFixed(2).padStart(8) + (Math.abs(z) > 2 ? '  สองครึ่งต่างกันเกินเสียงรบกวน' : ''));
  }
  console.log(`-> ช่องที่ |z| > 2 : ${big}/11  (ถ้า delta คงที่จริง คาดหวังราว 0.5/11)`);
}

console.log('\n============== 1D เทียบ 1H : เห็นตรงกันไหม ==============');
console.log('ชุด'.padEnd(19) + 'delta 1D'.padStart(11) + 'delta 1H'.padStart(11) + '  เครื่องหมาย');
let same = 0;
for (const [id] of CONFIGS) {
  const a = perTf['1D'][id]; const b = perTf['1H'][id];
  const ok = Math.sign(a) === Math.sign(b);
  if (ok) same++;
  console.log(id.padEnd(19) + a.toFixed(5).padStart(11) + b.toFixed(5).padStart(11) + (ok ? '  ตรงกัน' : '  ขัดกัน'));
}
console.log(`-> เครื่องหมายตรงกัน ${same}/11 ชุด (สุ่มล้วนคาดหวัง 5.5/11)`);

console.log('\n============== ตรวจซ้ำคำอ้างเรื่อง "p ดิบต่ำสุด" ==============');
for (const tf of Object.keys(dump.timeframes)) {
  const ps = rep.timeframes[tf].results.filter((r) => r.config !== 'baseline')
    .map((r) => ({ c: r.config, p: r.permStratified.pOneSided }));
  ps.sort((a, b) => a.p - b.p);
  console.log(`${tf}: p ต่ำสุด ${ps[0].p.toFixed(4)} (${ps[0].c}) · ช่องที่ p < 0.05 = ${ps.filter((x) => x.p < 0.05).length}`);
}
