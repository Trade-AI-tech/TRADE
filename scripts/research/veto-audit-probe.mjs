#!/usr/bin/env node
/**
 * veto-audit-probe.mjs — ประตูเข้าไปในไส้ของ veto-lab.mjs โดยไม่แตะไฟล์ต้นฉบับ
 *
 * ทำไมต้องลอกแบบ: veto-lab.mjs เรียก main() ทันทีตอน import และไม่ export อะไรเลย
 * เหมือน rule-lab.mjs — จึงใช้ท่าเดียวกับ audit-rule-lab-probe.mjs คืออ่านซอร์สมา
 * ตัดบรรทัดเรียก main() ทิ้ง แล้วเติม export ต่อท้าย เขียนเป็นไฟล์ข้าง ๆ กัน
 * (ต้องอยู่โฟลเดอร์เดียวกันเพราะ SELF_DIR ใช้หา rules/ กับ reports/)
 *
 * ตัวโค้ดที่ถูกวัดยังเป็นตัวอักษรเดียวกับต้นฉบับเป๊ะ — ตัดแค่ท้ายไฟล์
 *
 * ข้อพิเศษ: veto-lab.mjs เก็บ PRNG ไว้ในตัวแปรโมดูล `L_MULBERRY` ที่ main() เป็นคนตั้ง
 * เมื่อเราไม่เรียก main() ตัวแปรนั้นจะยังเป็น null แล้ว permutationTest จะพัง
 * จึงเติม setter ให้ (เป็นการ "เติม" ไม่ใช่ "แก้" — บรรทัดเดิมไม่ถูกแตะ)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(SELF_DIR, 'veto-lab.mjs');
const GEN = path.join(SELF_DIR, 'veto-audit-internals.generated.mjs');

const EXPORTS = [
  'loadDeps', 'buildBaseTrades', 'makeCtx', 'buildConfigs', 'evaluateConfig',
  'permutationTest', 'summarise', 'simulateTradeFromLevels', 'assertNoTestBarsHere',
  'VETO_SLUGS', 'SHORT', 'DEFAULT_B', 'DEFAULT_SEED',
];

export function buildVetoProbeModule() {
  const src = fs.readFileSync(SRC, 'utf8');
  const marker = '\nmain()\n';
  const cut = src.indexOf(marker);
  if (cut < 0) throw new Error('หาจุดเรียก main() ใน veto-lab.mjs ไม่เจอ — ซอร์สเปลี่ยนรูปไปแล้ว');
  const body = src.slice(0, cut);
  const out = `${body}\nexport function __setMulberry(fn) { L_MULBERRY = fn; }\n`
    + `export { ${EXPORTS.join(', ')} };\n`;
  fs.writeFileSync(GEN, out, 'utf8');
  return GEN;
}

export async function loadVetoProbe() {
  const f = buildVetoProbeModule();
  const mod = await import(`${pathToFileURL(f).href}?v=${Date.now()}`);
  const deps = await mod.loadDeps();
  mod.__setMulberry(deps.L.mulberry32); // ต้องตั้งก่อนเรียก permutationTest เสมอ
  return { mod, deps };
}
