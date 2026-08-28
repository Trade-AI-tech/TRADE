#!/usr/bin/env node
/**
 * audit-rule-lab-probe.mjs — ตัวตรวจสอบภายนอกของ rule-lab.mjs (ไฟล์ใหม่ ไม่แตะของเดิม)
 *
 * ทำไมต้องสร้างโมดูลลอกแบบ: rule-lab.mjs เรียก main() ทันทีตอน import และไม่ export อะไรเลย
 * จึงอ่านซอร์สมาแล้วตัดบรรทัด main() ทิ้ง เติม export ต่อท้าย เขียนเป็นไฟล์ข้าง ๆ กัน
 * (ต้องอยู่ในโฟลเดอร์เดียวกันเพราะ SELF_DIR ใช้หาแคชกับโฟลเดอร์ rules)
 *
 * ตัวโค้ดที่ถูกทดสอบยังเป็นตัวอักษรเดียวกับต้นฉบับเป๊ะ — ตัดแค่ท้ายไฟล์ที่เป็นการเรียก main()
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(SELF_DIR, 'rule-lab.mjs');
const GEN = path.join(SELF_DIR, 'audit-rule-lab-internals.generated.mjs');

const EXPORTS = [
  'COST_BPS', 'costBpsFor', 'costRFor', 'MAX_HOLD_BARS', 'SL_ATR_MULT', 'RR_TARGET',
  'ATR_PERIOD', 'WARMUP_BARS', 'UNIVERSE', 'DAY_MS',
  'simulateTrade', 'bootstrapClusterStats', 'mulberry32', 'percentileOfSorted', 'normalCdf',
  'computeIndicators', 'ATRSeries', 'findHtfIndex',
  'loadRawBars', 'loadSplitBoundaries', 'loadMeasurableDataset', 'measurableCutMs',
  'prepareDataset', 'runRuleOnTimeframe', 'loadRules', 'probeRuleCausality', 'assertVerdictShape',
];

export function buildProbeModule() {
  const src = fs.readFileSync(SRC, 'utf8');
  const marker = '\nmain()\n';
  const cut = src.indexOf(marker);
  if (cut < 0) throw new Error('หาจุดเรียก main() ไม่เจอ — ซอร์สเปลี่ยนรูปไปแล้ว');
  const body = src.slice(0, cut);
  const out = `${body}\nexport { ${EXPORTS.join(', ')} };\n`;
  fs.writeFileSync(GEN, out, 'utf8');
  return GEN;
}

export async function loadProbe() {
  const f = buildProbeModule();
  return import(`${pathToFileURL(f).href}?v=${Date.now()}`);
}
