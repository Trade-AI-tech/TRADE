#!/usr/bin/env node
/**
 * load-src-modules.mjs — โหลด src/lib/*.ts ขึ้นมาเป็นโมดูล ESM จริง ๆ ให้สคริปต์วิจัยใช้
 *
 * ทำไมต้องมีไฟล์นี้
 *   งานวิจัยต้องวัด "ของจริง" ไม่ใช่สำเนาที่เขียนซ้ำด้วยมือ ถ้าเราเขียน RSI/MACD ใหม่
 *   ในฝั่งวิจัย แล้วมันเพี้ยนไปนิดเดียว ทุกข้อสรุปหลังจากนั้นวัดของผิดตัวโดยไม่มีใครรู้
 *   จึงลอกชนิด (type) ออกจาก .ts ด้วย typescript ใน node_modules แล้ว import กลับเข้ามา
 *   วิธีเดียวกับ scripts/run-backtest.mjs และ scripts/check-scan-parity.mjs
 *
 * ไฟล์ชั่วคราวทั้งหมดอยู่ใน os.tmpdir() และถูกลบทิ้งเสมอ — ไม่เขียนอะไรลงในโปรเจกต์
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const require = createRequire(import.meta.url);

let typescript = null;
try {
  typescript = require('typescript');
} catch {
  typescript = null;
}

/**
 * แปลง path ใน import ให้ชี้ไฟล์ .mjs ที่เราเขียนลง temp dir
 * '@/types' → './types.mjs' (stub) · '@/lib/x' และ './x' → './x.mjs'
 */
function mapSpecifier(spec) {
  let s = spec;
  if (s.startsWith('@/')) s = `./${s.slice(2)}`;
  if (s.startsWith('./') || s.startsWith('../')) {
    const base = s.split('/').pop();
    return `./${base}.mjs`;
  }
  return spec;
}

function transpile(tsSource, fileName) {
  const out = typescript.transpileModule(tsSource, {
    fileName,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext,
      removeComments: false,
    },
  }).outputText;
  return out.replace(/(from\s+)(['"])([^'"]+)\2/g, (_m, kw, q, spec) => `${kw}${q}${mapSpecifier(spec)}${q}`);
}

/**
 * โหลดไฟล์ .ts ใต้ src/lib ตามลำดับที่ให้มา (ต้องเรียงตามการพึ่งพา)
 * คืน map ชื่อไฟล์ (ไม่มีนามสกุล) → namespace ของโมดูล
 *
 * ลบ temp dir ทิ้งทันทีหลัง import สำเร็จได้ เพราะโมดูลถูก cache ไว้ในหน่วยความจำแล้ว
 */
export async function loadSrcModules(relPaths = ['src/lib/indicators.ts', 'src/lib/signal-engine.ts']) {
  if (!typescript) {
    throw new Error('ไม่พบ typescript ใน node_modules — สั่ง `npm install` ก่อนแล้วรันใหม่');
  }

  // signal-engine.ts เริ่ม import ./candle-sanitizer (ด่านตรวจแท่ง เพิ่ม 2026-08-28)
  // สคริปต์วิจัยทุกตัวระบุรายชื่อไฟล์ไว้ก่อนหน้านั้น จึงเติม dependency ให้เองตรงนี้
  // แทนการไล่แก้ทุกไฟล์ — วางไว้หน้าสุดเพราะ loader นี้เขียนไฟล์ตามลำดับรายชื่อ
  // และ signal-engine ต้อง import มันเจอ
  if (relPaths.includes('src/lib/signal-engine.ts') && !relPaths.includes('src/lib/candle-sanitizer.ts')) {
    relPaths = ['src/lib/candle-sanitizer.ts', ...relPaths];
  }

  for (const rel of relPaths) {
    const abs = path.join(ROOT, ...rel.split('/'));
    if (!existsSync(abs)) throw new Error(`หาไฟล์ต้นฉบับไม่เจอ: ${abs}`);
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), 'research-src-'));
  try {
    // types เป็น type ล้วน ถูกลอกออกตอน transpile — เขียน stub ว่างกัน import ค้าง
    writeFileSync(path.join(tmpDir, 'types.mjs'), 'export {};\n', 'utf8');

    const bases = [];
    for (const rel of relPaths) {
      const abs = path.join(ROOT, ...rel.split('/'));
      const base = path.basename(rel, '.ts');
      writeFileSync(path.join(tmpDir, `${base}.mjs`), transpile(readFileSync(abs, 'utf8'), `${base}.ts`), 'utf8');
      bases.push(base);
    }

    const modules = {};
    for (const base of bases) {
      modules[base] = await import(pathToFileURL(path.join(tmpDir, `${base}.mjs`)).href);
    }
    return modules;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
