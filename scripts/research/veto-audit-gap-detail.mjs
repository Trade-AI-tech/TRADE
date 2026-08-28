#!/usr/bin/env node
/**
 * veto-audit-gap-detail.mjs — เปิดดูไม้ที่ราคาเปิดกระโดดข้าม SL แบบแท่งต่อแท่ง
 *
 * ทำไมต้องมีไฟล์นี้: T10 บอกว่ามีไม้ 61 ไม้บน 1D ที่ "ข้าม SL แล้วยังบันทึกเป็นกำไร"
 * ก่อนจะเอาไปเขียนรายงานต้องพิสูจน์ว่ามันไม่ใช่บั๊กของตัวเทสต์เอง จึงพิมพ์ตัวเลขดิบ
 * ทุกตัวออกมาให้ตรวจด้วยตา: ราคาปิดแท่งสัญญาณ · SL/TP ที่สัญญาณส่งออก · ราคาเปิดแท่งถัดไป
 * · แท่งที่ตัวเดินไม้บอกว่าเป็นทางออก · และ R ที่บันทึกไว้
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadProbe } from './audit-rule-lab-probe.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const GEN = path.join(SELF_DIR, 'veto-audit-internals3.generated.mjs');

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
const cache = new Map();
const tf = process.argv[2] ?? '1D';
const base = VP.buildBaseTrades(tf, deps, { bounds, cache, symbols: L.UNIVERSE.map((u) => u.symbol) });

const gaps = base.trades.filter((t) => t.gapPastStop || t.gapPastTarget);
console.log(`\n${tf}: ไม้ทั้งหมด ${base.trades.length} · ข้าม SL/TP ตั้งแต่แท่งแรก ${gaps.length} ไม้\n`);

// สรุปตามผลที่บันทึก
const win = gaps.filter((t) => t.rNet > 0);
const lose = gaps.filter((t) => t.rNet <= 0);
console.log(`บันทึกเป็นกำไร ${win.length} ไม้ (รวม ${win.reduce((s, t) => s + t.rNet, 0).toFixed(2)} R)`);
console.log(`บันทึกเป็นขาดทุน ${lose.length} ไม้ (รวม ${lose.reduce((s, t) => s + t.rNet, 0).toFixed(2)} R)\n`);

const show = gaps.sort((a, b) => b.rNet - a.rNet).slice(0, 6);
for (const t of show) {
  const u = L.UNIVERSE.find((x) => x.symbol === t.symbol);
  const ds = L.prepareDataset(u, tf, bounds, cache);
  const b = ds.bars;
  const s = t.signalIdx;
  console.log(`── ${t.symbol} ${t.side} signalIdx=${s} (${b[s].timestamp})`);
  console.log(`   แท่งสัญญาณ t   : O ${b[s].open} H ${b[s].high} L ${b[s].low} C ${b[s].close}`);
  console.log(`   สัญญาณสั่ง      : entry ${t.entryPriceSignal} · SL ${t.stop} · TP ${t.target} · risk(planned) ${t.risk}`);
  console.log(`   แท่งเข้าไม้ t+1 : O ${b[s + 1].open} H ${b[s + 1].high} L ${b[s + 1].low} C ${b[s + 1].close}`);
  console.log(`   ราคาเข้าจริง    : ${t.entry}  → ${t.side === 'long' ? 'entry <= SL ?' : 'entry >= SL ?'} `
    + `${t.side === 'long' ? t.entry <= t.stop : t.entry >= t.stop}`);
  console.log(`   ตัวเดินไม้บันทึก: ออกที่ ${t.exitPrice} (${t.exitReason}) แท่ง ${t.exitIdx} · rawR ${t.rawR.toFixed(3)} · rNet ${t.rNet.toFixed(3)}`);
  const realFillR = t.side === 'long' ? (t.entry - t.entry) / t.risk : 0;
  console.log(`   ถ้าเติมที่ราคาเปิดจริงแทน (ออกทันทีที่เปิด): rawR ${realFillR.toFixed(3)} — ส่วนต่าง ${(t.rawR - realFillR).toFixed(3)} R\n`);
}

// ผลกระทบต่อ meanR ของกองฐาน ถ้าปิดไม้พวกนี้ที่ราคาเปิดแทนที่จะเป็นราคา SL/TP
let adjSum = 0;
for (const t of base.trades) {
  if (t.gapPastStop || t.gapPastTarget) adjSum += (0 - t.rawR); // ออกที่ราคาเข้า = rawR 0
}
const meanNow = base.trades.reduce((s, t) => s + t.rNet, 0) / base.trades.length;
const meanAdj = meanNow + adjSum / base.trades.length;
console.log(`meanR ตามที่รายงานไว้            : ${meanNow.toFixed(4)}`);
console.log(`meanR ถ้าไม้ที่กระโดดปิดที่ราคาเปิด : ${meanAdj.toFixed(4)}  (ต่าง ${(meanAdj - meanNow).toFixed(4)} R)`);
console.log(`เทียบกับ delta ของวีโต้ที่ดีที่สุดใน ${tf} ตามรายงาน — ดู veto-lab-summary.md\n`);
