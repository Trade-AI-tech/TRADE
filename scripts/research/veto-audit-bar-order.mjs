#!/usr/bin/env node
/**
 * veto-audit-bar-order.mjs — เงื่อนไขที่ต้องจริงก่อน ข้อสรุปเรื่อง causality ทั้งหมดถึงจะมีความหมาย
 *
 * เทสต์ทุกข้อในไฟล์อื่นพิสูจน์ว่า "ไม่มีใครอ่านดัชนีเกิน t" แต่ประโยคนั้นแปลว่า "ไม่มองอนาคต"
 * ก็ต่อเมื่อ ดัชนีที่มากกว่า = เวลาที่หลังกว่า เสมอ ถ้าแท่งในแคชเรียงผิด หรือมี timestamp ซ้ำ
 * ข้อสรุปทั้งหมดจะกลวงทันทีโดยที่เทสต์เดิมไม่มีทางรู้ตัว — จึงต้องตรวจตรงนี้แยกออกมา
 *
 * ตรวจเพิ่มอีกสองอย่างที่เป็นเงื่อนไขเดียวกัน:
 *   · แท่งวัน (HTF) เรียงถูกด้วยไหม — findHtfIndex ใช้ binary search ซึ่งใช้ได้เฉพาะกับอาเรย์ที่เรียงแล้ว
 *   · ระยะห่างระหว่างแท่งสมเหตุสมผลไหม (ช่องว่างยักษ์ = ข้อมูลหาย ไม่ใช่การมองอนาคต แต่ทำให้
 *     "แท่งถัดไป" ที่ใช้เข้าไม้ อยู่ห่างจากแท่งสัญญาณเป็นเดือน ซึ่งเป็นคนละสมมติฐานกับที่ประกาศ)
 */
import { loadProbe } from './audit-rule-lab-probe.mjs';

const L = await loadProbe();
const bounds = L.loadSplitBoundaries(['1D', '1H']);
const cache = new Map();

let fail = 0;
for (const tf of ['1D', '1H']) {
  const expectMs = tf === '1D' ? L.DAY_MS : 60 * 60 * 1000;
  console.log(`\n──── ${tf} ────`);
  for (const u of L.UNIVERSE) {
    const ds = L.prepareDataset(u, tf, bounds, cache);
    const b = ds.bars;
    let notAsc = 0; let dup = 0; let maxGapMs = 0; let maxGapAt = -1;
    for (let i = 1; i < b.length; i++) {
      if (b[i].ts < b[i - 1].ts) notAsc++;
      if (b[i].ts === b[i - 1].ts) dup++;
      const g = b[i].ts - b[i - 1].ts;
      if (g > maxGapMs) { maxGapMs = g; maxGapAt = i; }
    }
    // แท่งวันที่ใช้เป็น HTF ของ 1H ก็ต้องเรียงเหมือนกัน
    let htfNotAsc = 0;
    if (tf === '1H' && ds.htfFor) {
      const h = ds.htfFor(b.length - 2);
      if (h) for (let i = 1; i < h.bars.length; i++) if (h.bars[i].ts < h.bars[i - 1].ts) htfNotAsc++;
    }
    const bad = notAsc > 0 || dup > 0 || htfNotAsc > 0;
    if (bad) fail++;
    const gapDays = (maxGapMs / L.DAY_MS).toFixed(1);
    console.log(`  ${bad ? 'ตก  ' : 'ผ่าน'} ${u.symbol.padEnd(8)} แท่ง ${String(b.length).padStart(6)}`
      + ` · เรียงผิด ${notAsc} · ซ้ำ ${dup} · HTF เรียงผิด ${htfNotAsc}`
      + ` · ช่องว่างใหญ่สุด ${gapDays} วัน (×${(maxGapMs / expectMs).toFixed(0)} ของระยะปกติ, ที่ดัชนี ${maxGapAt})`);
  }
}
console.log(`\n${fail === 0 ? 'ผ่านทั้งหมด — ดัชนีที่มากกว่า = เวลาที่หลังกว่า เสมอ' : `ตก ${fail} ชุด`}\n`);
process.exit(fail === 0 ? 0 : 1);
