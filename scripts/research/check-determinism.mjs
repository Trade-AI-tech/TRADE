#!/usr/bin/env node
/**
 * check-determinism.mjs — ตัวกันไม่ให้ "รันซ้ำได้คนละคำตอบ" เกิดขึ้นอีกโดยไม่มีใครรู้
 *
 * ██████████████████████████████████████████████████████████████████████████████
 * █                                                                            █
 * █   โรคที่ไฟล์นี้รักษา: combine.mjs เคยรัน 17 ครั้งด้วยอาร์กิวเมนต์เดียวกัน          █
 * █   แล้วมี 1 ครั้งให้คำตอบคนละอย่าง โดยไม่มี error ไม่มีคำเตือน                    █
 * █   ตัวเลขที่พิมพ์ออกมาคือ 194.79 bps/ไม้ ขณะที่ค่าจริงคือ 0.32                    █
 * █                                                                            █
 * █   ความไม่แน่นอนที่ "เพี้ยนแล้วพัง" ไม่อันตราย เพราะมีคนเห็น                       █
 * █   ที่อันตรายคือแบบที่เพี้ยนแล้วยังพิมพ์ตัวเลขสวย ๆ ออกมา                          █
 * █   ในวันที่ไม่มีใครรันซ้ำ ตัวเลขนั้นจะกลายเป็น "การค้นพบ"                          █
 * █                                                                            █
 * ██████████████████████████████████████████████████████████████████████████████
 *
 * ─────────────────────────── ไฟล์นี้ตรวจ 3 อย่าง ───────────────────────────
 *
 *  ต1. **รันซ้ำ N ครั้งแล้วต้องได้ผลเหมือนกันทุกไบต์**
 *      เทียบทั้ง .json และ .md · ยกเว้นเฉพาะช่องที่ *ตัวสคริปต์เองประกาศ* ว่าไม่คงที่
 *      (provenance.volatileFields / volatileReportLines) — ตัวตรวจไม่มีรายการยกเว้น
 *      ลับของตัวเอง ถ้าสคริปต์อยากได้ข้อยกเว้น ต้องเขียนไว้ในผลลัพธ์ให้คนอ่านเห็น
 *
 *  ต2. **รายงานต้องตรงกับโค้ดบนดิสก์**
 *      sha ของสคริปต์ที่ฝังใน .json ต้องเท่ากับ sha ของไฟล์จริง และ .md ต้องพิมพ์
 *      sha เดียวกัน — กันโรค "exp-feat-volume.md ถูกสร้างจากโค้ดคนละรุ่น"
 *
 *  ต3. **ไฟล์ขาเข้าต้องไม่เปลี่ยนระหว่างชุดการรัน**
 *      ต้นเหตุที่พิสูจน์แล้วของอาการรอบก่อนคือ สคริปต์อ่านรายงานของสคริปต์พี่น้อง
 *      โดยไม่ตรึงฉบับ ถ้า sha ขาเข้าเปลี่ยนกลางชุด ตัวตรวจต้องบอกว่านั่นคือสาเหตุ
 *      ไม่ใช่ปล่อยให้เข้าใจว่า "โค้ดเพี้ยนเอง"
 *
 * ───────────────────── ทำไมค่าเริ่มต้นถึงเป็น 75 รอบ ─────────────────────
 *
 * อาการที่รายงานไว้คือ "17 ครั้ง เพี้ยน 1 ครั้ง" ≈ 6% ของรอบ
 * ตัวตรวจจับได้ก็ต่อเมื่อผลของ N รอบ **ไม่เหมือนกันทั้งหมด** ดังนั้น
 *     P(จับไม่ได้) = P(ดีทั้งหมด) + P(เพี้ยนทั้งหมด) = (1−p)^N + p^N
 * ที่ p = 0.06 ต้องการความมั่นใจ 99% → หา N ที่เล็กที่สุดที่ (0.94)^N + (0.06)^N ≤ 0.01
 *     N = 75  →  0.94^75 = 0.0096  →  จับได้ 99.0%
 *     (N = 49 ให้ 95% · N = 17 ซึ่งเป็นจำนวนที่รอบก่อนรัน ให้แค่ 65%
 *      แปลว่ารอบก่อน "บังเอิญโชคดี" ที่เจอ ถ้ารัน 17 ครั้งอีกทีอาจไม่เจอเลย)
 *
 * ปรับได้ด้วย --fault-rate / --confidence แล้วตัวเลข N จะคำนวณใหม่ให้เอง
 *
 * ──────────────────────────────── วิธีใช้ ────────────────────────────────
 *
 *   npm run check:determinism                       ครบทุกสคริปต์ ค่าเริ่มต้น 75 รอบ
 *   npm run check:determinism -- --runs=10          รอบน้อย ๆ ไว้ตรวจเร็ว
 *   npm run check:determinism -- --targets=combine
 *   npm run check:determinism:self                  พิสูจน์ว่าตัวตรวจมีฟันจริง
 *
 * ⚠ ไฟล์นี้ไม่แตะชุด test และไม่เขียนทับรายงานที่ส่งมอบแล้ว
 *   ทุกรอบเขียนลงโฟลเดอร์ชั่วคราวผ่าน --out-dir และรันด้วยธง --rerun-probe
 *   ซึ่งทำให้การแตะ validation ถูกบันทึกเป็น "เชิงกล" แยกจาก "วิจัย" ในสมุดบันทึก
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ROOT } from './load-src-modules.mjs';
import {
  sha256File, sha256Of, stripPaths, canonicalJson, deepDiff, runsNeeded,
} from './repro.mjs';

const EXP_DIR = path.join(ROOT, 'scripts', 'research', 'experiments');

// ════════════════════════════════ อาร์กิวเมนต์ ════════════════════════════════

const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

// ── ด่านกันชุด test: ไฟล์นี้ไม่มีเหตุผลใดที่ต้องแตะ test ─────────────────────────
if (ARGS.split === 'test' || ARGS['i-am-done-tuning'] || ARGS.confirm) {
  console.error('ปฏิเสธ: ตัวตรวจความคงที่ไม่แตะชุด test');
  process.exit(2);
}

const FAULT_RATE = Number(ARGS['fault-rate'] ?? 0.06);
const CONFIDENCE = Number(ARGS.confidence ?? 0.99);
const DEFAULT_RUNS = runsNeeded(FAULT_RATE, CONFIDENCE);
const RUNS = Number(ARGS.runs ?? DEFAULT_RUNS);

/**
 * ทะเบียนสคริปต์ที่ตรวจ
 *
 * args = อาร์กิวเมนต์ที่ทำให้รันครบเส้นทางที่ต้องตรวจ (รวมเส้นทาง validation ของ combine
 *        เพราะตัวเลขที่เคยเพี้ยนอยู่ตรงนั้น) — ถ้าตรวจแต่ train จะพลาดจุดที่เป็นปัญหา
 */
const TARGETS = {
  combine: {
    script: path.join(EXP_DIR, 'combine.mjs'),
    json: 'exp-combine.json',
    md: 'exp-combine.md',
    args: ['--rerun-probe'],
  },
  ceiling: {
    script: path.join(EXP_DIR, 'ceiling.mjs'),
    json: 'exp-ceiling.json',
    md: 'exp-ceiling.md',
    args: [],
  },
  'feat-volume': {
    script: path.join(EXP_DIR, 'feat-volume.mjs'),
    json: 'exp-feat-volume.json',
    md: 'exp-feat-volume.md',
    args: [],
  },
};

const wanted = ARGS.targets ? String(ARGS.targets).split(',').map((s) => s.trim()) : Object.keys(TARGETS);

// ═══════════════════════════════ ตัวช่วยเปรียบเทียบ ═══════════════════════════════

/** ตัด "บรรทัดที่สคริปต์ประกาศเองว่าไม่คงที่" ออกจากรายงาน .md ก่อนเทียบ */
function normalizeReport(text, patterns) {
  const res = patterns.map((p) => new RegExp(p));
  return text.split('\n').filter((line) => !res.some((r) => r.test(line))).join('\n');
}

/** รันสคริปต์หนึ่งรอบ แล้วคืนลายนิ้วมือ + ของดิบไว้เทียบตอนเจอความต่าง */
function runOnce(target, outDir, extraArgs = []) {
  fs.mkdirSync(outDir, { recursive: true });
  let stderr = '';
  try {
    execFileSync(process.execPath, [target.script, `--out-dir=${outDir}`, ...target.args, ...extraArgs], {
      cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 256 * 1024 * 1024,
    });
  } catch (e) {
    stderr = (e.stderr ? e.stderr.toString() : '') || e.message;
    return { crashed: true, stderr };
  }
  const jsonPath = path.join(outDir, target.json);
  const mdPath = path.join(outDir, target.md);
  if (!fs.existsSync(jsonPath)) return { crashed: true, stderr: `ไม่มีไฟล์ผลลัพธ์ ${target.json}` };

  const obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const pv = obj.provenance ?? {};
  const volatileFields = pv.volatileFields ?? [];
  const volatileLines = pv.volatileReportLines ?? [];

  const stripped = stripPaths(obj, volatileFields);
  const jsonDigest = sha256Of(canonicalJson(stripped));

  let mdDigest = null;
  if (fs.existsSync(mdPath)) {
    mdDigest = sha256Of(normalizeReport(fs.readFileSync(mdPath, 'utf8'), volatileLines));
  }

  return {
    crashed: false,
    jsonDigest,
    mdDigest,
    stripped,
    provenance: pv,
    declaredVolatile: volatileFields,
    mdPath,
    mdText: mdDigest === null ? null : fs.readFileSync(mdPath, 'utf8'),
  };
}

/**
 * ต2 — รายงานต้องตรงกับโค้ดบนดิสก์
 * โรคที่กัน: รายงาน .md ที่ถูกสร้างจากโค้ดคนละรุ่นแล้วไม่มีใครรู้
 */
function checkReportBinding(target, res) {
  const problems = [];
  const onDisk = sha256File(target.script);
  if (!res.provenance.scriptSha256) {
    problems.push('ไฟล์ผลลัพธ์ไม่มี provenance.scriptSha256 — ผูกรายงานกับโค้ดไม่ได้');
    return problems;
  }
  if (res.provenance.scriptSha256 !== onDisk) {
    problems.push(`sha ในผลลัพธ์ (${res.provenance.scriptSha256.slice(0, 12)}) `
      + `ไม่ตรงกับสคริปต์บนดิสก์ (${onDisk.slice(0, 12)})`);
  }
  if (res.mdText !== null) {
    const short = res.provenance.scriptSha256.slice(0, 12);
    if (!res.mdText.includes(short)) {
      problems.push(`รายงาน .md ไม่ได้พิมพ์ sha ของสคริปต์ (${short}) — ตรวจย้อนไม่ได้ว่ามาจากโค้ดรุ่นไหน`);
    }
  }
  return problems;
}

// ═══════════════════════════════ การตรวจหนึ่งเป้าหมาย ═══════════════════════════════

function checkTarget(name, target, runs, workRoot, extraArgs = []) {
  const t0 = Date.now();
  const groups = new Map();     // ลายนิ้วมือ → รายการรอบที่ให้ผลนั้น
  const crashes = [];
  const inputDigests = new Map();
  let first = null;

  process.stdout.write(`\n── ${name} · ${runs} รอบ ──\n`);
  for (let i = 0; i < runs; i++) {
    const outDir = path.join(workRoot, name, `run-${String(i).padStart(3, '0')}`);
    const r = runOnce(target, outDir, extraArgs);
    if (r.crashed) {
      crashes.push({ run: i, stderr: r.stderr.slice(0, 400) });
      process.stdout.write('X');
      continue;
    }
    if (!first) first = r;
    const key = `${r.jsonDigest}|${r.mdDigest}`;
    if (!groups.has(key)) groups.set(key, { runs: [], sample: r });
    groups.get(key).runs.push(i);

    const idg = r.provenance.inputsDigest ?? '(ไม่มี)';
    if (!inputDigests.has(idg)) inputDigests.set(idg, []);
    inputDigests.get(idg).push(i);

    // '.' = ตรงกับรอบแรก · '!' = รอบนี้ต่างจากรอบแรก (ไม่ใช่ "มีรอบต่างมาก่อนหน้านี้")
    process.stdout.write(key === `${first.jsonDigest}|${first.mdDigest}` ? '.' : '!');
    if ((i + 1) % 50 === 0) process.stdout.write(` ${i + 1}\n`);
    // เก็บเฉพาะรอบที่ต่างไว้ดู — ที่เหลือลบทิ้งกันเต็มดิสก์
    if (groups.size === 1 && i > 0) fs.rmSync(outDir, { recursive: true, force: true });
  }
  process.stdout.write('\n');

  const bindingProblems = first ? checkReportBinding(target, first) : ['ทุกรอบพัง — ตรวจการผูกรายงานกับโค้ดไม่ได้'];

  // ถ้าผลต่างกัน หาว่าต่างตรงไหน (เทียบกลุ่มใหญ่สุดกับกลุ่มรองลงมา)
  let diffs = [];
  if (groups.size > 1) {
    const ordered = [...groups.values()].sort((a, b) => b.runs.length - a.runs.length);
    diffs = deepDiff(ordered[0].sample.stripped, ordered[1].sample.stripped, 25);
  }

  return {
    name,
    runs,
    crashes,
    distinct: groups.size,
    groups: [...groups.entries()].map(([k, v]) => ({ digest: k.slice(0, 12), count: v.runs.length, runs: v.runs })),
    inputDigests: [...inputDigests.entries()].map(([k, v]) => ({ digest: String(k).slice(0, 12), count: v.length })),
    bindingProblems,
    declaredVolatile: first ? first.declaredVolatile : [],
    diffs,
    elapsedMs: Date.now() - t0,
    pass: groups.size === 1 && crashes.length === 0 && bindingProblems.length === 0,
  };
}

// ═══════════════════════════ โหมดพิสูจน์ว่าตัวตรวจมีฟัน ═══════════════════════════

/**
 * --self-test: จงใจใส่ความไม่แน่นอนกลับเข้าไปในสำเนาชั่วคราวของแต่ละสคริปต์
 * แล้วดูว่าตัวตรวจจับได้ไหม
 *
 * ⚠ ถ้าไม่มีขั้นนี้ ผลสีเขียวของตัวตรวจไม่มีความหมายเลย — เครื่องตรวจที่ไม่เคยพิสูจน์ว่า
 *   จับของจริงได้ กับเครื่องตรวจที่พิมพ์คำว่า "ผ่าน" ทิ้งไว้เฉย ๆ แยกกันไม่ออก
 *
 * วิธีใส่: แทรกบรรทัดที่ "สุ่มเปลี่ยน seed" ไว้ก่อนที่สคริปต์จะอ่านอาร์กิวเมนต์
 * ซึ่งเลียนแบบความไม่แน่นอนของจริงได้ดี เพราะมันไม่ทำให้พัง ไม่มี error
 * แค่ทำให้ตัวเลขบางตัวขยับ — เหมือนอาการที่รายงานไว้เป๊ะ
 */
function injectNondeterminism(srcPath, dstPath, rate) {
  const src = fs.readFileSync(srcPath, 'utf8');
  const lines = src.split('\n');
  const at = lines[0].startsWith('#!') ? 1 : 0;
  const inject = [
    '',
    '// ═══ [SELF-TEST] บรรทัดนี้ถูกแทรกโดย check-determinism.mjs --self-test ═══',
    '// จงใจทำให้ผลไม่คงที่ เพื่อพิสูจน์ว่าตัวตรวจจับได้จริง',
    '// ห้ามมีบรรทัดแบบนี้อยู่ในไฟล์จริงเด็ดขาด',
    `if (Math.random() < ${rate}) process.argv.push('--seed=' + (900000 + ((Math.random() * 1e6) | 0)));`,
    '',
  ].join('\n');
  lines.splice(at, 0, inject);
  fs.writeFileSync(dstPath, lines.join('\n'));
}

function selfTest(workRoot, runs) {
  console.log('\n══════════════════ พิสูจน์ว่าตัวตรวจมีฟันจริง ══════════════════\n');
  console.log(`ใส่ความไม่แน่นอนอัตรา 50% ลงในสำเนาชั่วคราว แล้วรัน ${runs} รอบต่อสคริปต์`);
  console.log(`ถ้าตัวตรวจ "ผ่าน" แม้แต่ตัวเดียว = ตัวตรวจใช้ไม่ได้ ผลสีเขียวทั้งหมดเป็นโมฆะ\n`);

  const results = [];
  for (const name of wanted) {
    const target = TARGETS[name];
    // สำเนาต้องอยู่โฟลเดอร์เดียวกับของจริง ไม่งั้น import '../repro.mjs' หาไม่เจอ
    const copyPath = path.join(EXP_DIR, `_selftest-${name}.mjs`);
    try {
      injectNondeterminism(target.script, copyPath, 0.5);
      const fake = { ...target, script: copyPath };
      // combine ใช้ --train-only ตอน self-test เพื่อไม่ไปแตะ validation โดยไม่จำเป็น
      const extra = name === 'combine' ? ['--train-only'] : [];
      const r = checkTarget(`${name} (ใส่ความไม่แน่นอนแล้ว)`, fake, runs, path.join(workRoot, 'selftest'), extra);
      results.push({ name, caught: r.distinct > 1, distinct: r.distinct, crashes: r.crashes.length });
      console.log(`  ${name}: ผลต่างกัน ${r.distinct} แบบ → ${r.distinct > 1 ? 'จับได้ ✓' : 'จับไม่ได้ ✗'}`);
    } finally {
      fs.rmSync(copyPath, { force: true });
    }
  }
  const allCaught = results.every((r) => r.caught);
  console.log(`\n${allCaught ? '✓ ตัวตรวจมีฟัน — จับได้ทุกตัว' : '✗ ตัวตรวจจับไม่ได้บางตัว — ห้ามเชื่อผลสีเขียวของมัน'}`);
  return { results, allCaught };
}

// ════════════════════════════════════ MAIN ════════════════════════════════════

function main() {
  const workRoot = ARGS['work-dir']
    ? path.resolve(String(ARGS['work-dir']))
    : fs.mkdtempSync(path.join(os.tmpdir(), 'determinism-'));

  console.log('═══════════════ ตรวจความคงที่ของเครื่องมือวิจัย ═══════════════\n');
  console.log(`อัตราความเพี้ยนที่ต้องจับให้ได้: ${(FAULT_RATE * 100).toFixed(1)}% ของรอบ`);
  console.log(`ความมั่นใจที่ต้องการ: ${(CONFIDENCE * 100).toFixed(1)}%`);
  console.log(`→ จำนวนรอบที่ต้องรัน: ${DEFAULT_RUNS} (ใช้จริงรอบนี้: ${RUNS})`);
  console.log(`   P(จับไม่ได้) = (1−p)^N + p^N = ${((1 - FAULT_RATE) ** RUNS + FAULT_RATE ** RUNS).toExponential(2)}`);
  console.log(`โฟลเดอร์ทำงาน: ${workRoot}`);

  if (ARGS['self-test']) {
    const st = selfTest(workRoot, Number(ARGS['self-runs'] ?? 8));
    process.exit(st.allCaught ? 0 : 1);
  }

  const results = [];
  for (const name of wanted) {
    if (!TARGETS[name]) { console.error(`ไม่รู้จักเป้าหมาย: ${name}`); process.exit(2); }
    results.push(checkTarget(name, TARGETS[name], RUNS, workRoot));
  }

  // ── สรุป ──────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════ สรุป ═══════════════════════════\n');
  console.log('| สคริปต์ | รอบ | ผลต่างกันกี่แบบ | รันพัง | รายงานผูกกับโค้ด | เวลา | ผล |');
  console.log('|---|---:|---:|---:|---|---:|---|');
  for (const r of results) {
    console.log(`| ${r.name} | ${r.runs} | ${r.distinct} | ${r.crashes.length} | `
      + `${r.bindingProblems.length ? 'ไม่ตรง' : 'ตรง'} | ${(r.elapsedMs / 1000).toFixed(0)}s | `
      + `${r.pass ? 'ผ่าน' : '**แดง**'} |`);
  }

  for (const r of results) {
    if (r.pass) continue;
    console.log(`\n─── ${r.name}: รายละเอียดที่ไม่ผ่าน ───`);
    for (const p of r.bindingProblems) console.log(`  · การผูกรายงานกับโค้ด: ${p}`);
    for (const c of r.crashes.slice(0, 3)) console.log(`  · รอบ ${c.run} พัง: ${c.stderr.split('\n')[0]}`);
    if (r.distinct > 1) {
      console.log(`  · ผลไม่เหมือนกัน ${r.distinct} แบบ:`);
      for (const g of r.groups) console.log(`      ${g.digest} × ${g.count} รอบ (รอบ ${g.runs.slice(0, 8).join(',')}${g.runs.length > 8 ? '…' : ''})`);
      if (r.inputDigests.length > 1) {
        console.log('  ⚠ ไฟล์ขาเข้าเปลี่ยนกลางชุดการรัน — นี่คือสาเหตุ ไม่ใช่โค้ดเพี้ยนเอง:');
        for (const d of r.inputDigests) console.log(`      ขาเข้า ${d.digest} × ${d.count} รอบ`);
      }
      console.log('  · ต่างตรงไหน (สูงสุด 25 จุด):');
      for (const d of r.diffs) console.log(`      ${d.path}: ${d.a} → ${d.b}`);
    }
  }

  const allPass = results.every((r) => r.pass);
  console.log(`\n${allPass ? '✓ ทุกสคริปต์รันซ้ำได้ผลเดิมทุกไบต์ และรายงานตรงกับโค้ด' : '✗ มีสคริปต์ที่ไม่ผ่าน — ห้ามส่งงานตามกติกาข้อ 5'}`);
  console.log('\n⚠ ผลสีเขียวของไฟล์นี้จะมีความหมายก็ต่อเมื่อ `npm run check:determinism:self` ผ่านด้วย');
  console.log('   (พิสูจน์ว่าตัวตรวจจับความไม่แน่นอนที่จงใจใส่เข้าไปได้จริง)');

  if (!ARGS['keep-work']) fs.rmSync(workRoot, { recursive: true, force: true });
  process.exit(allPass ? 0 : 1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
