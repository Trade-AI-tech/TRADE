#!/usr/bin/env node
/**
 * รันกฎทุกข้อบน 1D ซ้ำด้วยลำดับเดียวกับ main() (รวมด่าน causality ที่รันก่อน)
 * แล้วเทียบทีละแถวกับ scripts/research/reports/rule-lab.json ที่ commit ไว้
 * ไม่เขียนทับไฟล์รายงานใด ๆ
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProbe } from './audit-rule-lab-probe.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const P = await loadProbe();
const rep = JSON.parse(fs.readFileSync(path.join(SELF_DIR, 'reports', 'rule-lab.json'), 'utf8'));

const B = Number(process.argv[2] ?? 100000);
const SEED = 20260817;
const tf = process.argv[3] ?? '1D';

const bounds = P.loadSplitBoundaries([tf]);
const rules = await P.loadRules(null);
const cache = new Map();

console.log(`เทียบ ${tf} · bootstrap ${B} · seed ${SEED}\n`);
console.log('กฎ'.padEnd(36) + 'ไม้(รายงาน/ใหม่)'.padStart(18) + 'avgR รายงาน'.padStart(14)
  + 'avgR ใหม่'.padStart(14) + 'p รายงาน'.padStart(11) + 'p ใหม่'.padStart(11) + '  สถานะ');

let mismatched = 0;
for (const rule of rules) {
  // ลำดับเดียวกับ main(): ด่าน causality ก่อน แล้วค่อยเดินไม้
  const probeDs = P.prepareDataset({ market: 'FOREX', symbol: 'EURUSD' }, tf, bounds, cache);
  const leaks = P.probeRuleCausality(rule, probeDs, { samples: 40, seed: SEED ^ 0x5bf03635 });
  if (leaks.length) { console.log(`${rule.slug.padEnd(36)}  ถูกตัดออกเพราะอ่านอนาคต`); continue; }

  const fresh = P.runRuleOnTimeframe(rule, tf, bounds, cache, { bootstrap: B, seed: SEED });
  const old = rep.results.find((x) => x.rule === rule.slug && x.timeframe === tf);
  if (!old) { console.log(`${rule.slug.padEnd(36)}  ไม่มีในรายงาน`); continue; }

  const sameTrades = old.trades === fresh.trades;
  const sameAvg = (old.avgR === null && fresh.avgR === null)
    || (old.avgR !== null && fresh.avgR !== null && Math.abs(old.avgR - fresh.avgR) < 1e-12);
  const sameP = (!old.ci && !fresh.ci)
    || (old.ci && fresh.ci && Math.abs(old.ci.pTwoTailed - fresh.ci.pTwoTailed) < 1e-12);
  const okAll = sameTrades && sameAvg && sameP;
  if (!okAll) mismatched++;
  const f = (v) => (v === null || v === undefined ? 'n/a' : v.toFixed(6));
  console.log(rule.slug.padEnd(36)
    + `${old.trades}/${fresh.trades}`.padStart(18)
    + f(old.avgR).padStart(14) + f(fresh.avgR).padStart(14)
    + (old.ci ? old.ci.pTwoTailed.toFixed(5) : 'n/a').padStart(11)
    + (fresh.ci ? fresh.ci.pTwoTailed.toFixed(5) : 'n/a').padStart(11)
    + (okAll ? '  ตรง' : `  *** ต่าง (ไม้ ${sameTrades ? 'ตรง' : 'ต่าง'} · avgR ${sameAvg ? 'ตรง' : 'ต่าง'} · p ${sameP ? 'ตรง' : 'ต่าง'}) ***`));
}
console.log(`\nแถวที่ไม่ตรงกับรายงาน: ${mismatched}`);
