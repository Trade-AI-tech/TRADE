#!/usr/bin/env node
/**
 * veto-audit-07-blocksize.mjs — design effect ตามเวลาไวต่อขนาดบล็อกแค่ไหน
 *
 * ตัวเลข "×1.64 บน 1H" จะเอาไปอ้างได้ก็ต่อเมื่อมันไม่ใช่ของแถมจากการเลือกขนาดบล็อก
 * ถ้ามันโตขึ้นเรื่อย ๆ ตามขนาดบล็อกแล้วอิ่มตัว = ของจริง (สหสัมพันธ์มีสเกลของมัน)
 * ถ้ามันแกว่งมั่ว = จำนวนบล็อกน้อยเกินไปจนตัวประมาณเองเชื่อไม่ได้
 */
import fs from 'node:fs';
import { loadVetoProbe } from './veto-audit-probe.mjs';

const dump = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { deps } = await loadVetoProbe();
const DAY = 86400000;
const BB = 4000;

function sd(a) {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

for (const tf of Object.keys(dump.timeframes)) {
  const D = dump.timeframes[tf];
  const T = D.trades;
  const n = T.length;
  const t0 = Date.parse(D.spanFirst);
  const rnd = deps.L.mulberry32(20260828);

  // SE ไร้เดียงสา (iid bootstrap) เป็นตัวหารเดียวกันทุกแถว
  const iid = [];
  for (let b = 0; b < BB; b++) { let s = 0; for (let i = 0; i < n; i++) s += T[(rnd() * n) | 0].rNet; iid.push(s / n); }
  const seIid = sd(iid);

  const sizes = tf === '1D' ? [7, 21, 60, 90, 180, 365, 730] : [1, 3, 7, 14, 21, 42, 84];
  console.log(`\n============== ${tf} · design effect ของ meanR ตามขนาดบล็อกเวลา ==============`);
  console.log(`SE iid = ${seIid.toFixed(6)} · ช่วงข้อมูล ${Math.round(D.spanDays)} วัน`);
  console.log('ขนาดบล็อก(วัน)'.padStart(15) + 'จำนวนบล็อก'.padStart(12) + 'ไม้/บล็อก'.padStart(11)
    + 'SE block'.padStart(11) + 'design effect'.padStart(14));
  for (const days of sizes) {
    const blocks = new Map();
    for (const t of T) {
      const b = Math.floor((Date.parse(t.sT) - t0) / (days * DAY));
      let a = blocks.get(b); if (!a) { a = []; blocks.set(b, a); } a.push(t);
    }
    const arr = [...blocks.values()];
    const out = [];
    for (let b = 0; b < BB; b++) {
      let s = 0; let c = 0;
      for (let g = 0; g < arr.length; g++) { const u = arr[(rnd() * arr.length) | 0]; for (const t of u) { s += t.rNet; c++; } }
      out.push(s / c);
    }
    const se = sd(out);
    console.log(String(days).padStart(15) + String(arr.length).padStart(12)
      + (n / arr.length).toFixed(0).padStart(11) + se.toFixed(6).padStart(11)
      + ('x' + (se / seIid).toFixed(2)).padStart(14));
  }
}
