#!/usr/bin/env node
/**
 * ชุดทดสอบคณิตศาสตร์ของหน้า "ผลจริง" (src/lib/scorecard-stats.ts)
 *
 * ทำไมต้องมี: หน้าเว็บที่แสดงเลขผิดกับหน้าเว็บที่แสดงเลขถูก หน้าตาเหมือนกันทุกประการ
 * และเลขชุดนี้คือเลขที่เจ้าของจะใช้ตัดสินใจว่าจะเทรดต่อหรือหยุด
 *
 * รัน: node scripts/test-scorecard-stats.mjs
 * โหลดไฟล์ .ts ด้วยการลอกชนิดออกแล้ว import — ไม่ต้องมี build step
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'lib', 'scorecard-stats.ts');

// ลอกชนิดด้วย typescript ตัวจริงที่อยู่ใน node_modules อยู่แล้ว — เขียน regex ลอกเองเคยพังมาแล้ว
// (ตัว `: number` ในลายเซ็น `function mean(a): number` หลุดรอดมาจนไฟล์ import ไม่ได้)
// ไฟล์นี้ import type อย่างเดียว จึงไม่ต้องไล่กราฟ import เหมือน scan-universe.mjs
const tmp = mkdtempSync(path.join(tmpdir(), 'scorecard-'));
let lib;
try {
  const require = createRequire(import.meta.url);
  const typescript = require('typescript');
  const js = typescript.transpileModule(readFileSync(SRC, 'utf8'), {
    fileName: 'scorecard-stats.ts',
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext,
      removeComments: false,
    },
  }).outputText;
  const file = path.join(tmp, 'stats.mjs');
  writeFileSync(file, js);
  lib = await import(pathToFileURL(file).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

let pass = 0, fail = 0;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function t(name, got, want) {
  const ok = typeof want === 'number' ? near(got, want) : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`  ✗ ${name}: ได้ ${JSON.stringify(got)} ควรได้ ${JSON.stringify(want)}`); }
}

/** สร้างสัญญาณปลอมแบบสั้น ๆ */
const sig = (symbol, outcome, r, market = 'FOREX', timeframe = '1D') => ({
  id: `${symbol}-${r}-${Math.round(r * 1e6)}`,
  symbol, market, timeframe, outcome,
  realized_r: r,
});

console.log('── ไม่มีข้อมูลเลย ──');
{
  const s = lib.summarize([]);
  t('n = 0', s.n, 0);
  t('ci เป็น null', s.ci, null);
  t('winRate เป็น NaN', Number.isNaN(s.winRate), true);
}

console.log('── นับสถานะให้ถูก ──');
{
  const rows = [
    sig('EURUSD', 'tp', 2), sig('EURUSD', 'sl', -1), sig('GBPUSD', 'timeout', 0.3),
    { id: 'o1', symbol: 'X', market: 'FOREX', timeframe: '1D', outcome: 'open', realized_r: null },
    { id: 'o2', symbol: 'Y', market: 'FOREX', timeframe: '1D' }, // ไม่มีคอลัมน์เลย = แถวเก่าก่อน migration
    { id: 'u1', symbol: 'Z', market: 'FOREX', timeframe: '1D', outcome: 'unresolvable', realized_r: null },
  ];
  const s = lib.summarize(rows);
  t('ปิดบัญชีแล้ว 3', s.n, 3);
  t('ยังเดินอยู่ 2', s.open, 2);
  t('ตัดสินไม่ได้ 1', s.unresolvable, 1);
  t('แยกผล', s.byOutcome, { tp: 1, sl: 1, timeout: 1 });
}

console.log('── ค่าเฉลี่ยและอัตราชนะ ──');
{
  const rows = [sig('A', 'tp', 2), sig('A', 'sl', -1), sig('B', 'tp', 1), sig('B', 'sl', -1)];
  const s = lib.summarize(rows);
  t('avgR = (2−1+1−1)/4 = 0.25', s.avgR, 0.25);
  t('ชนะ 2 ไม้', s.wins, 2);
  t('อัตราชนะ 0.5', s.winRate, 0.5);
}

console.log('── ไม้ที่ได้ 0 พอดี ไม่นับเป็นชนะ ──');
{
  // สำคัญ: ไม้ที่หมดเวลาแล้วออกที่ราคาเข้าพอดี ไม่ใช่ชัยชนะ และถ้านับเป็นชนะ
  // อัตราชนะจะสูงเกินจริงอย่างเงียบ ๆ
  const s = lib.summarize([sig('A', 'timeout', 0), sig('B', 'tp', 1)]);
  t('ชนะแค่ 1', s.wins, 1);
}

console.log('── แยกกลุ่มตามตลาด+กรอบเวลา ──');
{
  const rows = [
    sig('XAUUSD', 'tp', 2, 'GOLD', '1D'),
    sig('XAUUSD', 'sl', -1, 'GOLD', '1D'),
    sig('EURUSD', 'tp', 1, 'FOREX', '1H'),
  ];
  const s = lib.summarize(rows);
  t('มี 2 กลุ่ม', s.groups.length, 2);
  t('กลุ่มใหญ่มาก่อน', s.groups[0].key, 'GOLD · 1D');
  t('avgR ของ GOLD·1D = 0.5', s.groups[0].avgR, 0.5);
  t('avgR ของ FOREX·1H = 1', s.groups[1].avgR, 1);
}

console.log('── bootstrap ──');
{
  t('สัญลักษณ์เดียว → null', lib.bootstrapBySymbol([sig('A', 'tp', 1), sig('A', 'tp', 2)]), null);

  // ทุกไม้ค่าเท่ากันหมด → ไม่ว่าจะสุ่มยังไงค่าเฉลี่ยก็เท่าเดิม ช่วงต้องกว้างเป็นศูนย์
  const flat = lib.bootstrapBySymbol([sig('A', 'tp', 1), sig('B', 'tp', 1), sig('C', 'tp', 1)]);
  t('ค่าคงที่ → lo = 1', flat.lo, 1);
  t('ค่าคงที่ → hi = 1', flat.hi, 1);

  // ผลซ้ำได้: seed คงที่ เรียกสองครั้งต้องได้เลขเดียวกันเป๊ะ
  const rows = ['A', 'B', 'C', 'D', 'E'].flatMap((s, i) => [sig(s, 'tp', 1 + i * 0.1), sig(s, 'sl', -1)]);
  const a = lib.bootstrapBySymbol(rows);
  const b = lib.bootstrapBySymbol(rows);
  t('เรียกซ้ำได้เลขเดิม (lo)', a.lo, b.lo);
  t('เรียกซ้ำได้เลขเดิม (hi)', a.hi, b.hi);
  t('lo ต่ำกว่า hi', a.lo < a.hi, true);

  // ช่วงต้องคร่อมค่าเฉลี่ยจริงเสมอ ไม่งั้นแปลว่าคำนวณคนละกอง
  const m = lib.mean(rows.map((r) => r.realized_r));
  t('ช่วงคร่อมค่าเฉลี่ย', a.lo <= m && m <= a.hi, true);
}

console.log('── ช่วงต้องกว้างขึ้นเมื่อสัญลักษณ์กระจายกันมาก ──');
{
  // สองชุดมีค่าเฉลี่ยรวมเท่ากัน แต่ชุดหลังมีความต่างระหว่างสัญลักษณ์สูงกว่า
  // ช่วงของชุดหลังต้องกว้างกว่า ไม่งั้นแปลว่า bootstrap ไม่ได้จับความไม่แน่นอนระดับสัญลักษณ์เลย
  const tight = ['A', 'B', 'C', 'D'].map((s) => sig(s, 'tp', 0.5));
  const wide = [sig('A', 'tp', 2), sig('B', 'tp', -1), sig('C', 'tp', 2), sig('D', 'tp', -1)];
  const w1 = lib.bootstrapBySymbol(tight);
  const w2 = lib.bootstrapBySymbol(wide);
  t('ชุดกระจายมีช่วงกว้างกว่า', (w2.hi - w2.lo) > (w1.hi - w1.lo), true);
}

console.log('');
console.log(`ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail) process.exitCode = 1;
