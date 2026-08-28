#!/usr/bin/env node
/**
 * veto-audit-perm-probe.mjs — เปิดไส้ในของ veto-lab.mjs ออกมาตรวจ โดยไม่แตะไฟล์เดิม
 *
 * ทำไมต้องลอกแบบ: veto-lab.mjs เรียก main() ทันทีตอน import และไม่ export อะไรเลย
 * จึงใช้วิธีเดียวกับ audit-rule-lab-probe.mjs — อ่านซอร์สมา ตัดบรรทัดที่เรียก main() ทิ้ง
 * แล้วเติม export ต่อท้าย ตัวอักษรของ permutationTest/sumOfRandomSubset ที่ถูกทดสอบ
 * ยังเป็นตัวเดียวกับต้นฉบับเป๊ะ — ถ้าลอกผิดแม้ตัวเดียว ผลตรวจก็ไม่มีความหมาย
 *
 * L_MULBERRY เป็นตัวแปรระดับโมดูลที่ปกติถูกตั้งค่าใน main() ซึ่งเราตัดทิ้งไป
 * จึงต้องมี __setRng() ให้ตั้งเอง — และมันยังเปิดทางให้ "ดักนับ" ว่า permutationTest
 * เรียก rnd() กี่ครั้งต่อรอบ ซึ่งคือหลักฐานตรงว่ามันสุ่มตัดกี่ไม้จริง ๆ
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(SELF_DIR, 'veto-lab.mjs');
const GEN = path.join(SELF_DIR, 'veto-audit-veto-lab-internals.generated.mjs');

const EXPORTS = [
  'permutationTest', 'sumOfRandomSubset', 'buildBaseTrades', 'makeCtx', 'evaluateConfig',
  'buildConfigs', 'summarise', 'simulateTradeFromLevels', 'runTimeframe', 'selfTest',
  'loadDeps', 'assertNoTestBarsHere', 'VETO_SLUGS', 'SHORT', 'DEFAULT_B', 'DEFAULT_SEED',
];

export function buildProbeModule() {
  const src = fs.readFileSync(SRC, 'utf8');
  const marker = '\nmain()\n';
  const cut = src.indexOf(marker);
  if (cut < 0) throw new Error('หาจุดเรียก main() ใน veto-lab.mjs ไม่เจอ — ซอร์สเปลี่ยนรูปแล้ว');
  const body = src.slice(0, cut);

  // ตรวจว่าตัวที่เราจะทดสอบยังอยู่ครบ ก่อนจะไปเชื่อผลอะไร
  for (const name of ['function permutationTest', 'function sumOfRandomSubset', 'let L_MULBERRY']) {
    if (!body.includes(name)) throw new Error(`ไม่พบ ${name} ในซอร์ส — โครงไฟล์เปลี่ยนไปแล้ว`);
  }

  const out = `${body}\nexport { ${EXPORTS.join(', ')} };\n`
    + `export function __setRng(fn) { L_MULBERRY = fn; }\n`
    + `export function __getRng() { return L_MULBERRY; }\n`;
  fs.writeFileSync(GEN, out, 'utf8');
  return GEN;
}

export async function loadVetoProbe() {
  const f = buildProbeModule();
  return import(`${pathToFileURL(f).href}?v=${Date.now()}`);
}
