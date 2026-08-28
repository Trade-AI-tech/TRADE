#!/usr/bin/env node
/**
 * veto-audit-01-recompute.mjs — ตรวจซ้ำจากไม้จริงว่าตัวเลขในรายงานถูกต้อง
 * และตรวจ σ ที่รายงาน "กู้จาก nullSd" เทียบกับ σ ที่วัดจากไม้จริงตรง ๆ
 *
 * ทำไมข้อนี้สำคัญกับมุม robustness: MDE ทั้งตาราง แขวนอยู่บน σ ตัวเดียว
 * ถ้า σ ที่กู้มาผิด ตัวเลข "อำนาจการทดสอบ" ทั้งหัวข้อก็ผิดตาม
 */
import fs from 'node:fs';

const DUMP = process.argv[2];
const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
const rep = JSON.parse(fs.readFileSync('scripts/research/reports/veto-lab.json', 'utf8'));
const holm = JSON.parse(fs.readFileSync('scripts/research/reports/veto-lab-holm.json', 'utf8'));

const MASKS = { meanrev: 1, overext: 2, levelpath: 4, choch: 8 };
const CONFIGS = [
  ['baseline', 0], ['meanrev', 1], ['overext', 2], ['levelpath', 4], ['choch', 8],
  ['all4', 15],
  ['meanrev+overext', 3], ['meanrev+levelpath', 5], ['meanrev+choch', 9],
  ['overext+levelpath', 6], ['overext+choch', 10], ['levelpath+choch', 12],
];

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sdPop = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

for (const tf of Object.keys(dump.timeframes)) {
  const T = dump.timeframes[tf].trades;
  const r = T.map((t) => t.rNet);
  const meanAll = mean(r);
  const sigmaTrue = sdPop(r);
  const repTf = rep.timeframes[tf];
  const hTf = holm.timeframes[tf];

  console.log(`\n════════ ${tf} · ${T.length} ไม้ ════════`);
  console.log(`meanR ของฉัน       = ${meanAll.toFixed(8)}`);
  console.log(`meanR ในรายงาน     = ${repTf.results[0].meanRBefore.toFixed(8)}`);
  console.log(`ต่างกัน             = ${Math.abs(meanAll - repTf.results[0].meanRBefore).toExponential(2)}`);
  console.log(`σ วัดจากไม้จริง     = ${sigmaTrue.toFixed(6)}`);
  console.log(`σ ที่รายงานกู้มา    = ${hTf.sigma.toFixed(6)}`);
  console.log(`คลาดเคลื่อน          = ${(((hTf.sigma - sigmaTrue) / sigmaTrue) * 100).toFixed(2)}%`);

  console.log(`\n${'ชุด'.padEnd(20)} ${'cut'.padStart(6)} ${'deltaฉัน'.padStart(12)} ${'deltaรายงาน'.padStart(12)} ${'ต่าง'.padStart(10)}`);
  for (const [id, mask] of CONFIGS) {
    const kept = T.filter((t) => (t.mask & mask) === 0);
    const d = mean(kept.map((t) => t.rNet)) - meanAll;
    const row = repTf.results.find((x) => x.config === id);
    console.log(`${id.padEnd(20)} ${String(T.length - kept.length).padStart(6)} ${d.toFixed(8).padStart(12)} ${row.delta.toFixed(8).padStart(12)} ${Math.abs(d - row.delta).toExponential(1).padStart(10)}`);
  }
}
