#!/usr/bin/env node
/**
 * switch-supabase.mjs — ย้ายระบบไปโปรเจกต์ Supabase ใหม่ให้ครบทุกที่ในคำสั่งเดียว
 *
 * ทำไมต้องมีสคริปต์นี้: ค่าเชื่อมต่อ Supabase ถูกเก็บไว้ **สามที่** และถ้าลืมที่ใดที่หนึ่ง
 * อาการที่ได้จะงงมาก — เว็บใช้โปรเจกต์ใหม่แต่ตัวสแกนยังเขียนลงโปรเจกต์เก่า
 * แล้วเจ้าของจะเห็นว่า "ไม่มีสัญญาณเลย" ทั้งที่ทุกอย่างขึ้นเขียวหมด:
 *   1. .env.local            — ตอนรันในเครื่อง
 *   2. Vercel (production)   — หน้าเว็บกับ API routes
 *   3. GitHub Actions secrets — ตัวสแกนที่รันทุก 30 นาที
 *
 * วิธีใช้:
 *   1. สร้างโปรเจกต์ใหม่ในบัญชี Supabase ที่ต้องการ
 *   2. เอาค่าจาก Settings → API ใส่ลง .env.local (แทนที่ค่าเดิม):
 *        NEXT_PUBLIC_SUPABASE_URL=...
 *        NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 *        SUPABASE_SERVICE_ROLE_KEY=...
 *   3. node scripts/switch-supabase.mjs --check   ← ดูก่อนว่าจะเปลี่ยนอะไร ไม่แตะอะไรเลย
 *   4. node scripts/switch-supabase.mjs --apply   ← ดันขึ้น Vercel + GitHub
 *
 * ต้องมี: vercel CLI ที่ล็อกอินแล้ว · gh CLI ที่ล็อกอินแล้ว
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

if (!APPLY && !process.argv.includes('--check')) {
  console.error('ต้องระบุ --check (ดูเฉย ๆ) หรือ --apply (ลงมือจริง)');
  process.exit(2);
}

/** อ่าน .env.local — คีย์ที่ต้องย้ายทั้งสามตัว */
const KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

const env = {};
for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const missing = KEYS.filter((k) => !env[k]);
if (missing.length) {
  console.error(`\n[หยุด] .env.local ยังไม่มี: ${missing.join(', ')}`);
  console.error('       เอาค่าจาก Supabase → Settings → API ของโปรเจกต์ใหม่มาใส่ก่อน\n');
  process.exit(1);
}

/** ref ของโปรเจกต์อ่านได้จาก URL — ใช้ยืนยันด้วยตาว่ากำลังย้ายไปตัวที่ตั้งใจ */
const ref = (env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) ?? [])[1];
if (!ref) {
  console.error(`\n[หยุด] NEXT_PUBLIC_SUPABASE_URL หน้าตาไม่เหมือน URL ของ Supabase: ${env.NEXT_PUBLIC_SUPABASE_URL}\n`);
  process.exit(1);
}

// คีย์เป็นความลับ — พิมพ์แค่ความยาวกับตัวอักษรต้น/ท้าย พอให้เทียบด้วยตาว่าใช่ตัวที่ตั้งใจ
const peek = (v) => `${v.slice(0, 6)}…${v.slice(-4)} (ยาว ${v.length})`;

console.log('\n═══ จะย้ายไปโปรเจกต์นี้ ═══');
console.log(`  ref  ${ref}`);
console.log(`  url  ${env.NEXT_PUBLIC_SUPABASE_URL}`);
console.log(`  anon ${peek(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)}`);
console.log(`  svc  ${peek(env.SUPABASE_SERVICE_ROLE_KEY)}`);

if (!APPLY) {
  console.log('\n═══ โหมด --check: ยังไม่ได้แตะอะไรเลย ═══');
  console.log('  จะเปลี่ยน Vercel (production) 3 ตัว · GitHub Actions secrets 2 ตัว');
  console.log('  พอใจแล้วรันซ้ำด้วย --apply\n');
  process.exit(0);
}

/**
 * บน Windows ตัวรันของ npm/gh เป็นไฟล์ .cmd ซึ่ง execFileSync เรียกตรง ๆ ไม่ได้
 * (ได้ ENOENT ทั้งที่คำสั่งมีอยู่จริง) — ต้องผ่าน shell เท่านั้น
 * เจอจริงตอนย้ายโปรเจกต์: ฝั่ง GitHub ผ่านหมดแต่ Vercel ล้มทั้งสามตัวด้วย ENOENT
 */
const WIN = process.platform === 'win32';
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], shell: WIN, ...opts });

console.log('\n═══ Vercel (production) ═══');
for (const k of KEYS) {
  try {
    // ลบก่อนเสมอ — vercel env add ไม่เขียนทับของเดิม มันจะได้สองค่าชื่อเดียวกัน
    try { run('npx', ['vercel', 'env', 'rm', k, 'production', '--yes']); } catch { /* ไม่มีอยู่ก่อน = ปกติ */ }
    run('npx', ['vercel', 'env', 'add', k, 'production'], { input: env[k] });
    console.log(`  ✅ ${k}`);
  } catch (e) {
    console.log(`  ❌ ${k} — ${e.message.split('\n')[0]}`);
  }
}

// GitHub ต้องการแค่สองตัว: ตัวสแกนใช้ service role เขียน DB และ URL เพื่อรู้ว่าเขียนที่ไหน
// (anon key ไม่ได้ใช้ในเส้นทางสแกน — ดู .github/workflows/scan-universe.yml)
console.log('\n═══ GitHub Actions secrets ═══');
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  try {
    run('gh', ['secret', 'set', k], { input: env[k] });
    console.log(`  ✅ ${k}`);
  } catch (e) {
    console.log(`  ❌ ${k} — ${e.message.split('\n')[0]}`);
  }
}

console.log(`
═══ ต่อไปต้องทำเอง ═══
  1. deploy ใหม่ (env ที่เปลี่ยนมีผลตอน deploy รอบหน้าเท่านั้น):
       npx vercel deploy --prod
  2. เข้าเว็บแล้วสมัคร/ล็อกอินใหม่ — บัญชีเดิมอยู่ในโปรเจกต์เก่า ย้ายรหัสผ่านข้ามโปรเจกต์ไม่ได้
  3. เพิ่ม watchlist 3 ตัว (XAUUSD · EURUSD · USDTHB) หรือปล่อยว่างก็ได้
       ตัวสแกนครอบคลุมจักรวาล 36 ตัวอยู่แล้ว watchlist เป็นแค่ส่วนเสริม
  4. เปิดแจ้งเตือนใหม่บน iPhone — subscription เดิมผูกกับ user_id เก่า
  5. ตรวจ: node scripts/scan-universe.mjs --dry-run   (ต้องอ่านโปรเจกต์ใหม่ได้)
`);
