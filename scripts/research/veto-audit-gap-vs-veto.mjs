#!/usr/bin/env node
/**
 * veto-audit-gap-vs-veto.mjs — ไม้ที่ราคาเติมเป็นของปลอม ไปกองอยู่ฝั่งไหนของแต่ละวีโต้
 *
 * ทำไมคำถามนี้สำคัญกว่าการนับจำนวนไม้เสีย: ถ้าไม้ปลอมกระจายตัวสุ่ม ๆ มันแค่เพิ่ม noise
 * (ลดอำนาจการทดสอบ) แต่ถ้ามันกระจุกอยู่ฝั่งใดฝั่งหนึ่งของวีโต้ตัวใดตัวหนึ่ง delta ของวีโต้ตัวนั้น
 * ก็ถูกขับด้วย R ที่ไม่มีอยู่จริง — ซึ่งแปลว่าตัวเลขในรายงานวัดคนละเรื่องกับที่ประกาศไว้
 *
 * ข้อสงสัยเฉพาะเจาะจง: overext วีโต้ "แท่งข่าว" ที่ high−low >= 2.5×ATR ส่วนแท่งที่ทำให้เกิด
 * การเติมปลอมคือแท่งที่กระโดดแรง ซึ่งช่วงกว้างผิดปกติเกือบตามนิยาม — สองอย่างนี้จึงน่าจะ
 * ทับกันสูง และ overext คือช่องที่ p ดิบเล็กที่สุดในรายงาน (0.2589 บน 1H)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadProbe } from './audit-rule-lab-probe.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const GEN = path.join(SELF_DIR, 'veto-audit-internals4.generated.mjs');

async function loadVetoProbe() {
  const src = fs.readFileSync(path.join(SELF_DIR, 'veto-lab.mjs'), 'utf8');
  const cut = src.indexOf('\nmain()\n');
  fs.writeFileSync(GEN, `${src.slice(0, cut)}\nexport { loadDeps, buildBaseTrades };\n`, 'utf8');
  return import(`${pathToFileURL(GEN).href}?v=${Date.now()}`);
}

const L = await loadProbe();
const VP = await loadVetoProbe();
const deps = await VP.loadDeps();
const bounds = L.loadSplitBoundaries(['1D', '1H']);
const syms = L.UNIVERSE.map((u) => u.symbol);

for (const tf of ['1D', '1H']) {
  const cache = new Map();
  const base = VP.buildBaseTrades(tf, deps, { bounds, cache, symbols: syms });
  const T = base.trades;
  const isFake = (t) => t.gapPastStop || t.gapPastTarget;
  const nFake = T.filter(isFake).length;
  const meanOf = (a) => (a.length ? a.reduce((s, x) => s + x.rNet, 0) / a.length : NaN);

  console.log(`\n════ ${tf} · ไม้ ${T.length} · ไม้ที่ราคาเติมเป็นของปลอม ${nFake} (${(100 * nFake / T.length).toFixed(2)}%) ════`);
  console.log(`meanR ทั้งกอง ${meanOf(T).toFixed(4)} · เฉพาะไม้ปลอม ${meanOf(T.filter(isFake)).toFixed(4)}`
    + ` · เฉพาะไม้ปกติ ${meanOf(T.filter((t) => !isFake(t))).toFixed(4)}`);

  console.log(`\n${'วีโต้'.padEnd(12)} ${'ตัดทิ้ง'.padStart(7)} ${'ปลอมที่ถูกตัด'.padStart(13)} ${'ปลอมที่เหลือ'.padStart(12)} `
    + `${'delta ตามรายงาน'.padStart(15)} ${'delta ถ้าไม้ปลอม=0R'.padStart(20)} ${'ส่วนที่มาจากของปลอม'.padStart(20)}`);

  for (let vi = 0; vi < deps.vetoes.length; vi++) {
    const v = deps.vetoes[vi];
    const bit = 1 << vi;
    const cut = T.filter((t) => (t.vetoMask & bit) !== 0);
    const keep = T.filter((t) => (t.vetoMask & bit) === 0);
    const fakeCut = cut.filter(isFake).length;
    const fakeKeep = keep.filter(isFake).length;

    const deltaReported = meanOf(keep) - meanOf(T);
    // สถานการณ์เทียบ: ให้ไม้ปลอมได้ 0 R (ใจดีที่สุดที่ยังพอเป็นจริง — ออกที่ราคาที่เปิดให้จริง)
    const adj = (t) => (isFake(t) ? -t.costR : t.rNet);
    const mAdj = (a) => (a.length ? a.reduce((s, x) => s + adj(x), 0) / a.length : NaN);
    const deltaAdj = mAdj(keep) - mAdj(T);

    console.log(`${v.short.padEnd(12)} ${String(cut.length).padStart(7)} ${String(fakeCut).padStart(13)} `
      + `${String(fakeKeep).padStart(12)} ${deltaReported.toFixed(4).padStart(15)} `
      + `${deltaAdj.toFixed(4).padStart(20)} ${(deltaReported - deltaAdj).toFixed(4).padStart(20)}`);
  }

  // ความเข้มข้นของไม้ปลอมเทียบกับการสุ่ม — วีโต้ตัดไม้ปลอมเยอะกว่าที่ควรไหม
  console.log('\nอัตราส่วนความเข้มข้น (ไม้ปลอมในกองที่ถูกตัด ÷ ไม้ปลอมในกองทั้งหมด) — 1.0 = เหมือนสุ่ม');
  for (let vi = 0; vi < deps.vetoes.length; vi++) {
    const bit = 1 << vi;
    const cut = T.filter((t) => (t.vetoMask & bit) !== 0);
    if (!cut.length) continue;
    const rateCut = cut.filter(isFake).length / cut.length;
    const rateAll = nFake / T.length;
    console.log(`  ${deps.vetoes[vi].short.padEnd(12)} ${(rateCut / (rateAll || 1)).toFixed(2)}×`
      + `  (ในกองที่ตัด ${(100 * rateCut).toFixed(2)}% · ทั้งกอง ${(100 * rateAll).toFixed(2)}%)`);
  }

  // สัดส่วนของ "ขอบ" ทั้งหมดที่มาจากไม้ปลอม
  const totalR = T.reduce((s, t) => s + t.rNet, 0);
  const fakeR = T.filter(isFake).reduce((s, t) => s + t.rNet, 0);
  console.log(`\nR รวมทั้งกอง ${totalR.toFixed(2)} · มาจากไม้ปลอม ${fakeR.toFixed(2)} `
    + `(${(100 * fakeR / totalR).toFixed(1)}% ของขอบทั้งหมด)`);
}
console.log('');
