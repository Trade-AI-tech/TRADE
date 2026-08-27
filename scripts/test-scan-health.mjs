#!/usr/bin/env node
/**
 * ชุดทดสอบตัวจับความเงียบของตัวสแกน (src/lib/scan-health.ts)
 *
 * ทำไมต้องมี: ตัวนี้มีหน้าที่เดียวคือแยก "เงียบเพราะไม่มีสัญญาณ" ออกจาก "เงียบเพราะตายไปแล้ว"
 * ถ้ามันบอกว่าปกติทั้งที่ระบบหยุดไปแล้ว มันก็แย่กว่าไม่มีเลย เพราะให้ความมั่นใจผิด ๆ
 *
 * รัน: node scripts/test-scan-health.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'lib', 'scan-health.ts');

const tmp = mkdtempSync(path.join(tmpdir(), 'health-'));
let lib;
try {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const js = ts.transpileModule(readFileSync(SRC, 'utf8'), {
    fileName: 'scan-health.ts',
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false },
  }).outputText;
  const f = path.join(tmp, 'h.mjs');
  writeFileSync(f, js);
  lib = await import(pathToFileURL(f).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}: ได้ ${JSON.stringify(got)} ควรได้ ${JSON.stringify(want)}`); }
};

// เวลาอ้างอิงคงที่ ไม่ใช้ Date.now() เพื่อให้ผลซ้ำได้เสมอ
const NOW = Date.parse('2026-08-27T15:00:00Z');
const agoMin = (m) => new Date(NOW - m * 60000).toISOString();

console.log('── ระดับสถานะตามอายุข้อมูล ──');
{
  t('เพิ่งรัน', lib.scanHealth(agoMin(5), NOW).level, 'ok');
  t('1 ชม. ยังปกติ (GitHub ส่งเฉลี่ย 56 นาที)', lib.scanHealth(agoMin(60), NOW).level, 'ok');
  t('119 นาที ยังปกติ', lib.scanHealth(agoMin(119), NOW).level, 'ok');
  t('120 นาที เริ่มช้า', lib.scanHealth(agoMin(120), NOW).level, 'slow');
  t('5 ชม. ช้า', lib.scanHealth(agoMin(300), NOW).level, 'slow');
  t('359 นาที ยังแค่ช้า', lib.scanHealth(agoMin(359), NOW).level, 'slow');
  t('6 ชม. ถือว่าหยุด', lib.scanHealth(agoMin(360), NOW).level, 'stalled');
  // เคสจริงที่เกิดขึ้น: GitHub หยุดยิง 24 ชั่วโมงโดยไม่มี error ที่ไหนเลย
  t('24 ชม. ต้องขึ้นว่าหยุด', lib.scanHealth(agoMin(1440), NOW).level, 'stalled');
}

console.log('── ข้อมูลที่ใช้ไม่ได้ต้องบอกว่าไม่รู้ ไม่ใช่เดาว่าปกติ ──');
{
  t('ไม่มีค่า', lib.scanHealth(null, NOW).level, 'unknown');
  t('undefined', lib.scanHealth(undefined, NOW).level, 'unknown');
  t('สตริงว่าง', lib.scanHealth('', NOW).level, 'unknown');
  t('เวลาอ่านไม่ออก', lib.scanHealth('เมื่อกี้', NOW).level, 'unknown');
  t('ไม่รู้สถานะ → ageMinutes เป็น null', lib.scanHealth(null, NOW).ageMinutes, null);
}

console.log('── อายุที่คำนวณได้ ──');
{
  t('5 นาที', lib.scanHealth(agoMin(5), NOW).ageMinutes, 5);
  t('90 นาที', lib.scanHealth(agoMin(90), NOW).ageMinutes, 90);
  // เวลาในอนาคต (นาฬิกาเครื่องเพี้ยน) ต้องไม่ได้ค่าติดลบ
  t('เวลาในอนาคตต้องไม่ติดลบ', lib.scanHealth(new Date(NOW + 600000).toISOString(), NOW).ageMinutes, 0);
}

console.log('── ข้อความต้องอ่านรู้เรื่องและไม่ให้ความมั่นใจผิด ──');
{
  const stalled = lib.scanHealth(agoMin(1440), NOW);
  t('หยุดทำงาน → พูดถึงความเงียบตรง ๆ', stalled.detail.includes('ไม่มีใครมองตลาดอยู่'), true);
  const ok = lib.scanHealth(agoMin(10), NOW);
  t('ปกติ → ไม่มีคำเตือน', ok.detail.includes('ไม่มีใครมองตลาด'), false);
  t('ชั่วโมงถูกแปลงเป็นข้อความ', lib.scanHealth(agoMin(150), NOW).detail.includes('2 ชั่วโมง 30 นาที'), true);
  t('เกินสองวันแปลงเป็นวัน', lib.scanHealth(agoMin(60 * 72), NOW).detail.includes('3 วัน'), true);
}

console.log('');
console.log(`ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail) process.exitCode = 1;
