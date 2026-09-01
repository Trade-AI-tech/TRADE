#!/usr/bin/env node
/**
 * เตรียมไฟล์ 008_scan_watchdog.sql ที่ใส่ GitHub token ไว้แล้ว ให้เอาไปวางใน Supabase SQL Editor
 *
 * ── ทำไมต้องมีสคริปต์นี้ แทนที่จะบอกให้แก้ไฟล์เอง ──────────────────────────────
 * ไฟล์ต้นฉบับมีคำว่า 'ใส่_GITHUB_TOKEN_ตรงนี้' อยู่ 3 จุด และมีแค่จุดเดียวที่ต้องแทน
 * (บรรทัด v_token text := '...') อีกสองจุดคือคอมเมนต์อธิบาย กับ "ด่านกัน" ที่เช็คว่า
 * เจ้าของใส่ token แล้วหรือยัง — ถ้าใครใช้ replace-all ทั้งไฟล์ ด่านกันจะกลายเป็น
 *   if v_token = '<token ตัวจริง>' then raise exception
 * ซึ่งจะยิง exception ทุกครั้งแม้ใส่ token ถูกแล้ว · สคริปต์นี้จึงแทนเฉพาะบรรทัดตั้งค่า
 *
 * ── ทำไมไม่ใช่คำสั่ง node -e บรรทัดเดียว ────────────────────────────────────────
 * 2026-09-01 เจ้าของรันคำสั่งบรรทัดเดียวใน PowerShell แล้ว $1/$2 ของ regex ถูกกลืน
 * จนพังทั้งคำสั่ง (SyntaxError: missing ) after argument list) — ไฟล์สคริปต์ไม่มีปัญหานี้
 * เพราะไม่ต้องผ่านการตีความของ shell เลย
 *
 * ⚠ ไฟล์ที่สร้างออกมามี token อยู่ข้างใน — ลบทิ้งหลังใช้เสร็จ
 *   ต้นฉบับใน repo ไม่ถูกแตะ จึงไม่มี token หลุดเข้า git
 *
 * วิธีใช้:  node scripts/prepare-watchdog-sql.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'supabase', 'migrations', '008_scan_watchdog.sql');
const OUT = path.join(homedir(), 'Desktop', '008-ready.sql');

const die = (msg) => {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
};

// ── 1. หา token จาก gh CLI ที่ล็อกอินค้างไว้ในเครื่อง ──────────────────────────
// ไม่พิมพ์ค่าออกจอเด็ดขาด — แสดงแค่ความยาวไว้ให้ดูว่าอ่านได้จริง
let token;
try {
  token = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
} catch {
  die('เรียก `gh auth token` ไม่สำเร็จ — ยังไม่ได้ล็อกอิน GitHub CLI ในเครื่องนี้\n   ลองรัน: gh auth status');
}
if (!token) die('`gh auth token` คืนค่าว่าง — ลองรัน: gh auth login');

// ── 2. อ่านต้นฉบับแล้วแทนเฉพาะบรรทัดตั้งค่า ────────────────────────────────────
let src;
try {
  src = readFileSync(SRC, 'utf8');
} catch {
  die(`หาไฟล์ต้นฉบับไม่เจอ: ${SRC}`);
}

const ASSIGN = /(v_token text := ')[^']*(')/;
if (!ASSIGN.test(src)) die('ไม่เจอบรรทัด v_token ในไฟล์ต้นฉบับ — ไฟล์อาจถูกแก้ไปแล้ว');

const out = src.replace(ASSIGN, `$1${token}$2`);

// ── 3. ตรวจผลก่อนเขียน — ผิดพลาดตรงนี้แปลว่ารันแล้วจะเจอ error ใน SQL Editor ──
const guardIntact = out.includes("if v_token = 'ใส่_GITHUB_TOKEN_ตรงนี้' then");
const tokenPlaced = new RegExp(`v_token text := '${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';`).test(out);
if (!guardIntact) die('ด่านกันในไฟล์ถูกแทนไปด้วย — หยุดไว้ก่อน ไม่เขียนไฟล์');
if (!tokenPlaced) die('ใส่ token ไม่สำเร็จ — หยุดไว้ก่อน ไม่เขียนไฟล์');

writeFileSync(OUT, out, 'utf8');

console.log('');
console.log('✅ เขียนไฟล์เรียบร้อย');
console.log('');
console.log(`   ไฟล์:        ${OUT}`);
console.log(`   ขนาด:        ${out.length} ตัวอักษร`);
console.log(`   token ยาว:   ${token.length} ตัวอักษร (ไม่แสดงค่า)`);
console.log('   ด่านกัน:     ยังอยู่ครบ ✓');
console.log('');
console.log('ขั้นต่อไป:');
console.log('   1. เปิดไฟล์ 008-ready.sql บนหน้าเดสก์ท็อป (คลิกขวา → Open with → Notepad)');
console.log('   2. Ctrl+A แล้ว Ctrl+C');
console.log('   3. Supabase → SQL Editor → New query → Ctrl+V → Run');
console.log('   4. เสร็จแล้วลบไฟล์นี้ทิ้ง (ข้างในมี token)');
console.log('');
