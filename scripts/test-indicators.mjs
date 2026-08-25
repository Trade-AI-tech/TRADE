#!/usr/bin/env node
/**
 * ชุดทดสอบอินดิเคเตอร์ที่เพิ่งเพิ่ม (Stochastic · ADX · volumeRatio)
 *
 * ทำไมต้องมี: อินดิเคเตอร์ที่คำนวณผิดจะไม่โยน error มันจะคืนตัวเลขที่ดูสมเหตุสมผล
 * แล้วไหลไปเป็นสัญญาณจริง ตัวที่อันตรายที่สุดคือกรณีขอบ — ตัวหารเป็นศูนย์ ข้อมูลไม่พอ
 * วอลุ่มเป็น 0 ทั้งชุด (ค่าเงินสปอตบน Yahoo เป็นแบบนั้นจริง)
 *
 * รัน: node scripts/test-indicators.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'lib', 'indicators.ts');

const tmp = mkdtempSync(path.join(tmpdir(), 'ind-'));
let lib;
try {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const js = ts.transpileModule(readFileSync(SRC, 'utf8'), {
    fileName: 'indicators.ts',
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false },
  }).outputText;
  const f = path.join(tmp, 'ind.mjs');
  writeFileSync(f, js);
  lib = await import(pathToFileURL(f).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

let pass = 0, fail = 0;
const t = (name, got, want, eps = 1e-6) => {
  const ok = typeof want === 'number'
    ? (Number.isNaN(want) ? Number.isNaN(got) : Math.abs(got - want) < eps)
    : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}: ได้ ${JSON.stringify(got)} ควรได้ ${JSON.stringify(want)}`); }
};

/** สร้างแท่งเทียนจากรายการ [high, low, close] — volume ใส่ค่าเดียวกันหมดถ้าไม่ระบุ */
const bars = (rows, vol = 100) =>
  rows.map(([h, l, c], i) => ({ timestamp: `t${i}`, open: c, high: h, low: l, close: c, volume: Array.isArray(vol) ? vol[i] : vol }));

console.log('── Stochastic ──');
{
  // กรอบ 0–10 คงที่ 14 แท่ง ปิดที่ 10 = สูงสุดของกรอบ → %K ต้องเป็น 100
  const top = lib.Stochastic(bars(Array.from({ length: 14 }, () => [10, 0, 10])), 14, 3);
  t('ปิดที่จุดสูงสุดของกรอบ → %K = 100', top.k[13], 100);

  const bot = lib.Stochastic(bars([...Array.from({ length: 13 }, () => [10, 0, 5]), [10, 0, 0]]), 14, 3);
  t('ปิดที่จุดต่ำสุดของกรอบ → %K = 0', bot.k[13], 0);

  const mid = lib.Stochastic(bars(Array.from({ length: 14 }, () => [10, 0, 5])), 14, 3);
  t('ปิดกลางกรอบ → %K = 50', mid.k[13], 50);

  // แท่งแบนสนิททั้งกรอบ: high = low → ตัวหารศูนย์ ต้องได้ NaN ไม่ใช่ 50 หรือ 0
  const flat = lib.Stochastic(bars(Array.from({ length: 14 }, () => [5, 5, 5])), 14, 3);
  t('กรอบแบนสนิท → NaN ไม่ใช่ตัวเลขที่ดูใช้ได้', Number.isNaN(flat.k[13]), true);

  t('แท่งก่อนครบ period → NaN', Number.isNaN(mid.k[12]), true);
  t('%D เป็นค่าเฉลี่ยของ %K', mid.d.length, mid.k.length);
}

console.log('── ADX ──');
{
  const lastOf = (a) => { for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return a[i]; return NaN; };

  // ขาขึ้นเรียบ ๆ ไม่มีย่อเลย = เทรนด์แรงที่สุดเท่าที่เป็นไปได้ → ADX ต้องสูง
  const up = bars(Array.from({ length: 60 }, (_, i) => [100 + i * 2, 99 + i * 2, 100 + i * 2]));
  const rUp = lib.ADX(up, 14);
  t('คืนอนุกรมยาวเท่าจำนวนแท่ง', rUp.adx.length, 60);
  t('ขาขึ้นเรียบ → ADX > 50', lastOf(rUp.adx) > 50, true);
  t('ขาขึ้น → plusDI มากกว่า minusDI', lastOf(rUp.plusDI) > lastOf(rUp.minusDI), true);

  // ราคาสลับขึ้นลงทุกแท่งในกรอบเดิม = ไม่มีเทรนด์ → ADX ต่ำกว่ากรณีขาขึ้นชัดเจน
  const chop = bars(Array.from({ length: 60 }, (_, i) => (i % 2 ? [102, 100, 101] : [101, 99, 100])));
  t('ออกข้าง → ADX ต่ำกว่าขาขึ้น', lastOf(lib.ADX(chop, 14).adx) < lastOf(rUp.adx), true);

  t('ข้อมูลไม่พอ → NaN ทั้งอนุกรม', lib.ADX(bars([[1, 1, 1], [2, 1, 2]]), 14).adx.every((x) => Number.isNaN(x)), true);

  // causal: ค่าที่ดัชนี i ต้องไม่ขึ้นกับแท่งหลังจากนั้น — เป็นเงื่อนไขที่ทำให้ memo ในห้องแล็บถูกต้อง
  const prefix = lib.ADX(up.slice(0, 45), 14);
  t('ค่าที่ดัชนี 44 เท่ากันไม่ว่าจะคำนวณบน prefix หรือชุดเต็ม', rUp.adx[44], prefix.adx[44]);
}

console.log('── volumeRatio ──');
{
  // 20 แท่งก่อนหน้าวอลุ่ม 100 แท่งล่าสุด 200 → อัตราส่วน 2.0
  const v = [...Array.from({ length: 20 }, () => 100), 200];
  t('วอลุ่มเป็นสองเท่าของค่าเฉลี่ย', lib.volumeRatio(bars(Array.from({ length: 21 }, () => [1, 1, 1]), v), 20), 2);

  const flat = Array.from({ length: 21 }, () => 100);
  t('วอลุ่มเท่าเดิม → 1.0', lib.volumeRatio(bars(Array.from({ length: 21 }, () => [1, 1, 1]), flat), 20), 1);

  // ค่าเฉลี่ยต้องไม่รวมแท่งล่าสุด ไม่งั้นแท่งที่พุ่งจะดันค่าเฉลี่ยตัวเองแล้วได้ต่ำกว่าความจริง
  // ถ้ารวมแท่งล่าสุด: avg = (20×100 + 2000)/21 = 190.5 → ratio = 10.5 แทนที่จะเป็น 20
  const spike = [...Array.from({ length: 20 }, () => 100), 2000];
  t('ค่าเฉลี่ยไม่รวมแท่งล่าสุด', lib.volumeRatio(bars(Array.from({ length: 21 }, () => [1, 1, 1]), spike), 20), 20);

  // ค่าเงินสปอตบน Yahoo ส่งวอลุ่ม 0 มาทั้งชุด — ต้องได้ NaN ไม่ใช่ 0 หรือ Infinity
  const zero = Array.from({ length: 21 }, () => 0);
  t('วอลุ่มศูนย์ทั้งชุด → NaN', Number.isNaN(lib.volumeRatio(bars(Array.from({ length: 21 }, () => [1, 1, 1]), zero), 20)), true);

  t('ข้อมูลไม่พอ → NaN', Number.isNaN(lib.volumeRatio(bars([[1, 1, 1]]), 20)), true);
}

console.log('');
console.log(`ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail) process.exitCode = 1;
