#!/usr/bin/env node
/**
 * switch-github.mjs — ย้าย repo ไป GitHub บัญชีใหม่ พร้อม secret ครบทุกตัว
 *
 * ทำไมต้องมีสคริปต์: การย้าย repo ไม่ใช่แค่ push โค้ด — **ตัวสแกนที่ทำงานจริง
 * รันอยู่บน GitHub Actions** และมันต้องมี secret 5 ตัวถึงจะทำงาน
 * ถ้าย้ายโค้ดไปแล้วลืมตั้ง secret จะได้ run สีแดงทุก 30 นาที ที่ยังกินโควตาเท่าเดิม
 * โดยไม่ได้สแกนอะไรเลย (เคยเกิดมาแล้วรอบก่อน — ตัวตรวจจับได้ทัน)
 *
 * secret ที่ต้องมี (อ่านค่าจาก .env.local ตัวปัจจุบัน):
 *   CRON_SECRET · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 *   VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY
 *
 * วิธีใช้:
 *   1. สร้าง repo **ว่างเปล่า** (private) ในบัญชีใหม่ — ห้ามติ๊ก README/.gitignore/license
 *      เพราะจะทำให้ประวัติแยกสาย แล้ว push ครั้งแรกจะถูกปฏิเสธ
 *   2. ให้บัญชีที่รัน gh อยู่ตอนนี้เป็น **Admin** ของ repo ใหม่
 *      (Settings → Collaborators → Add people → เลือกสิทธิ์ Admin)
 *      ต้องเป็น Admin ไม่ใช่ Write — เพราะสิทธิ์ตั้ง secret ให้เฉพาะ Admin
 *   3. node scripts/switch-github.mjs --repo=เจ้าของ/ชื่อrepo --check
 *   4. node scripts/switch-github.mjs --repo=เจ้าของ/ชื่อrepo --apply
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=');
const APPLY = process.argv.includes('--apply');
const REPO = arg('repo');

if (!REPO || !/^[\w.-]+\/[\w.-]+$/.test(REPO)) {
  console.error('\nต้องระบุ --repo=เจ้าของ/ชื่อrepo  เช่น --repo=mynewaccount/trading-ai\n');
  process.exit(2);
}
if (!APPLY && !process.argv.includes('--check')) {
  console.error('ต้องระบุ --check (ดูเฉย ๆ) หรือ --apply (ลงมือจริง)');
  process.exit(2);
}

const SECRETS = [
  'CRON_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
];

const env = {};
for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const missing = SECRETS.filter((k) => !env[k]);
if (missing.length) {
  console.error(`\n[หยุด] .env.local ยังไม่มี: ${missing.join(', ')}\n`);
  process.exit(1);
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });

// ค่าเป็นความลับ — โชว์แค่ให้พอเทียบด้วยตาว่าใช่ตัวที่ตั้งใจ
const peek = (v) => `${v.slice(0, 6)}…${v.slice(-4)} (ยาว ${v.length})`;

const currentRemote = (() => { try { return run('git', ['remote', 'get-url', 'origin']).trim(); } catch { return '(ไม่มี)'; } })();
const commits = run('git', ['rev-list', '--count', 'HEAD']).trim();
const files = run('git', ['ls-files']).trim().split('\n').length;

console.log('\n═══ จะย้ายไปที่นี่ ═══');
console.log(`  repo ใหม่  ${REPO}`);
console.log(`  remote เดิม ${currentRemote}`);
console.log(`  ประวัติ    ${commits} commit · ${files} ไฟล์`);
console.log('\n═══ secret ที่จะตั้งให้ ═══');
for (const k of SECRETS) console.log(`  ${k.padEnd(28)} ${peek(env[k])}`);

if (!APPLY) {
  console.log('\n═══ โหมด --check: ยังไม่ได้แตะอะไรเลย ═══');
  console.log('  ตรวจก่อนว่า repo ใหม่ "ว่างเปล่าจริง" และบัญชีที่ gh ใช้อยู่เป็น Admin แล้ว');
  console.log('  พอใจแล้วรันซ้ำด้วย --apply\n');
  process.exit(0);
}

console.log(`\n═══ push โค้ดขึ้น ${REPO} ═══`);
try {
  // ตั้งเป็น remote ชื่อใหม่ก่อน ยังไม่แตะ origin — ถ้า push ล้ม ของเดิมยังใช้ได้ครบ
  try { run('git', ['remote', 'remove', 'newhome']); } catch { /* ยังไม่มี = ปกติ */ }
  run('git', ['remote', 'add', 'newhome', `https://github.com/${REPO}.git`]);
  const out = run('git', ['push', '-u', 'newhome', 'main'], { stdio: ['pipe', 'pipe', 'pipe'] });
  console.log(`  ✅ push สำเร็จ${out.trim() ? `\n${out.trim()}` : ''}`);
} catch (e) {
  console.log(`  ❌ push ล้มเหลว — ${String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')}`);
  console.log('     เช็ก: repo ว่างจริงไหม · บัญชีที่ gh ใช้เป็น Admin ของ repo ใหม่หรือยัง');
  process.exit(1);
}

console.log(`\n═══ ตั้ง secret บน ${REPO} ═══`);
let ok = 0;
for (const k of SECRETS) {
  try {
    run('gh', ['secret', 'set', k, '--repo', REPO], { input: env[k] });
    console.log(`  ✅ ${k}`);
    ok++;
  } catch (e) {
    console.log(`  ❌ ${k} — ${String(e.stderr || e.message).split('\n')[0]}`);
  }
}

console.log(`
═══ ผล: ตั้ง secret ได้ ${ok}/${SECRETS.length} ═══

ต่อไปต้องทำเอง:
  1. เปิดแท็บ Actions ของ ${REPO} แล้วกด "I understand my workflows, go ahead and enable them"
     (GitHub ปิด Actions ไว้เป็นค่าเริ่มต้นสำหรับ repo ที่เพิ่ง push เข้ามา)
  2. กด Run workflow ที่ "Scan Universe" หนึ่งครั้ง แล้วดูว่าเขียว
  3. **ปิด schedule ของ repo เก่า** ไม่งั้นตัวสแกนสองตัวเขียนฐานข้อมูลเดียวกัน
     → สัญญาณซ้ำและแจ้งเตือนเด้งสองครั้ง (ตัวกันซ้ำเป็นแบบอ่านก่อนเขียน กันไม่อยู่)
  4. พอทุกอย่างเขียวแล้วค่อยสลับ origin:
       git remote set-url origin https://github.com/${REPO}.git
       git remote remove newhome
`);
