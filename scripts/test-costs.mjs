#!/usr/bin/env node
/**
 * ชุดทดสอบตารางต้นทุนและนโยบายขยาย SL (src/lib/costs.ts)
 *
 * ทำไมต้องมี: ฟังก์ชันในไฟล์นั้นเป็นตัวที่ตัดสินว่า SL ของสัญญาณจริงจะกว้างแค่ไหน
 * ซึ่งแปลตรง ๆ เป็นจำนวนเงินที่เจ้าของจะเสี่ยงต่อไม้ ถ้าคำนวณผิดจะไม่มี error ให้เห็น
 * มีแต่ตัวเลขที่ผิดบนหน้าจอ
 *
 * รัน: node scripts/test-costs.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'lib', 'costs.ts');

const tmp = mkdtempSync(path.join(tmpdir(), 'costs-'));
let lib;
try {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const js = ts.transpileModule(readFileSync(SRC, 'utf8'), {
    fileName: 'costs.ts',
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false },
  }).outputText;
  const file = path.join(tmp, 'costs.mjs');
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

console.log('── ตารางค่าธรรมเนียม: ราย-สัญลักษณ์มาก่อนค่าประจำตลาด ──');
{
  t('XAUUSD ใช้ 3 ไม่ใช่ 5 ของกลุ่ม GOLD', lib.costBpsFor('XAUUSD', 'GOLD'), 3);
  t('XAGUSD ใช้ 15', lib.costBpsFor('XAGUSD', 'GOLD'), 15);
  t('EURUSD ตกไปที่ค่าตลาด 1.5', lib.costBpsFor('EURUSD', 'FOREX'), 1.5);
  t('GBPTHB ใช้ 20', lib.costBpsFor('GBPTHB', 'FOREX'), 20);
  let threw = false;
  try { lib.costBpsFor('ไม่มีตัวนี้', 'ไม่มีตลาดนี้'); } catch { threw = true; }
  t('ตลาดที่ไม่รู้จักต้องโยน error ไม่ใช่เดาเงียบ ๆ', threw, true);
}

console.log('── cost_R = ค่าธรรมเนียม ÷ ระยะเสี่ยง ──');
{
  // EURUSD 1.5 bps · ราคา 1.0000 · SL ห่าง 1% → cost = 0.00015/0.01 = 0.015
  t('SL 1% → 0.015 R', lib.costRFor(1.0, 0.99, 'EURUSD', 'FOREX'), 0.015);
  // SL ชิดลง 10 เท่า → ต้นทุนแพงขึ้น 10 เท่า (นี่คือหัวใจของทั้งเรื่อง)
  t('SL 0.1% → 0.15 R (แพงขึ้น 10 เท่า)', lib.costRFor(1.0, 0.999, 'EURUSD', 'FOREX'), 0.15);
  t('ทิศทางไม่สำคัญ ใช้ระยะสัมบูรณ์', lib.costRFor(1.0, 1.01, 'EURUSD', 'FOREX'), 0.015);
  t('ระยะเสี่ยงศูนย์ → null', lib.costRFor(1.0, 1.0, 'EURUSD', 'FOREX'), null);
}

console.log('── ระยะ SL ขั้นต่ำจากเพดานต้นทุน ──');
{
  // 1.5 bps ที่เพดาน 0.05 R → ต้องกว้าง 0.00015/0.05 = 0.003 = 0.3%
  t('EURUSD ต้องกว้าง 0.3%', lib.minStopPctFor('EURUSD', 'FOREX'), 0.003);
  // 15 bps ที่เพดานเดียวกัน → กว้างกว่า 10 เท่า
  t('XAGUSD ต้องกว้าง 3%', lib.minStopPctFor('XAGUSD', 'GOLD'), 0.03);
  t('เพดานหลวมขึ้น → ขั้นต่ำแคบลง', lib.minStopPctFor('EURUSD', 'FOREX', 0.15), 0.001);
}

console.log('── ขยาย SL: ต้องรักษา RR ไว้เท่าเดิม ──');
{
  // ไม้ long บน EURUSD: entry 1.0000 SL 1% ห่าง TP 2% → RR 2 · กว้างกว่าขั้นต่ำอยู่แล้ว
  const wide = lib.applyStopFloor(1.0, 0.99, 1.02, 'EURUSD', 'FOREX');
  t('กว้างพออยู่แล้ว → ไม่ขยาย', wide.widenedBy, 1);
  t('SL คงเดิม', wide.stop_loss, 0.99);
  t('TP คงเดิม', wide.take_profit, 1.02);

  // SL ชิดเกิน: 0.034% (เท่ากับ EURUSD บน 15m จริง) → ต้องขยายเป็น 0.3%
  const tight = lib.applyStopFloor(1.0, 0.99966, 1.00068, 'EURUSD', 'FOREX');
  t('ขยายราว 8.8 เท่า', Math.round(tight.widenedBy * 10) / 10, 8.8);
  t('SL ใหม่ = 0.3% ใต้ราคาเข้า', Math.round(tight.stop_loss * 1e6) / 1e6, 0.997);
  // RR เดิม = 0.00068/0.00034 = 2 → ต้องยังเป็น 2
  const rrBefore = (1.00068 - 1.0) / (1.0 - 0.99966);
  const rrAfter = (tight.take_profit - 1.0) / (1.0 - tight.stop_loss);
  t('RR ไม่เปลี่ยน', Math.round(rrAfter * 1e6) / 1e6, Math.round(rrBefore * 1e6) / 1e6);

  // ต้นทุนหลังขยายต้องเท่ากับเพดานพอดี ไม่เกิน
  t('ต้นทุนหลังขยาย = เพดาน', Math.round(lib.costRFor(1.0, tight.stop_loss, 'EURUSD', 'FOREX') * 1e9) / 1e9, lib.MAX_COST_R);
}

console.log('── ไม้ short ต้องขยายไปคนละทางกับ long ──');
{
  const s = lib.applyStopFloor(1.0, 1.00034, 0.99932, 'EURUSD', 'FOREX');
  t('SL ของ short อยู่เหนือราคาเข้า', s.stop_loss > 1.0, true);
  t('TP ของ short อยู่ใต้ราคาเข้า', s.take_profit < 1.0, true);
  t('SL ใหม่ = 0.3% เหนือราคาเข้า', Math.round(s.stop_loss * 1e6) / 1e6, 1.003);
  const rrAfter = (1.0 - s.take_profit) / (s.stop_loss - 1.0);
  t('RR ยังเป็น 2', Math.round(rrAfter * 1e4) / 1e4, 2);
}

console.log('── ข้อมูลเสียต้องคืน null ไม่ใช่เดา ──');
{
  t('ราคาเข้าเป็นศูนย์', lib.applyStopFloor(0, 1, 2, 'EURUSD', 'FOREX'), null);
  t('SL เท่าราคาเข้า', lib.applyStopFloor(1, 1, 2, 'EURUSD', 'FOREX'), null);
  t('TP เท่าราคาเข้า', lib.applyStopFloor(1, 0.99, 1, 'EURUSD', 'FOREX'), null);
  t('ค่าไม่ใช่ตัวเลข', lib.applyStopFloor(1, NaN, 2, 'EURUSD', 'FOREX'), null);
}

console.log('');
console.log(`ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail) process.exitCode = 1;
