#!/usr/bin/env node
/**
 * rule-lab-holm-report.mjs — เอาผลดิบจาก rule-lab.mjs มาแก้ multiple testing แล้วเขียนรายงาน
 *
 * ─────────────────────────────── ทำไมต้องแยกไฟล์ ───────────────────────────────
 *
 * rule-lab.mjs ตอบคำถาม "กฎข้อนี้ได้เท่าไร" ทีละข้อ ซึ่งถูกต้องในตัวมันเอง แต่พอเอาผล
 * 50 ช่องมาวางเรียงกันแล้วชี้ตัวที่ p น้อยที่สุด คำถามเปลี่ยนไปเป็น "ตัวที่ดีที่สุดในห้าสิบตัว
 * ดีจริงไหม" ซึ่งต้องใช้เกณฑ์คนละอัน ไฟล์นี้ทำหน้าที่นั้น และแยกจากตัววัดเพื่อไม่ให้
 * การเปลี่ยนเกณฑ์ทางสถิติไปแตะโค้ดที่คำนวณ R
 *
 * ──────────────────────────── ครอบครัวของการทดสอบคืออะไร ────────────────────────────
 *
 * หนึ่งการทดสอบ = (กฎ, กรอบเวลา) หนึ่งคู่ ครอบครัว = ทุกคู่ที่ "มีสิทธิ์ถูกหยิบมาอวด"
 * ไม่ใช่ทุกคู่ที่ผลออกมาดี ดังนั้นช่องที่ไม่มีไม้เลย (กฎ veto ล้วน หรือกฎ MTF บน 1D
 * ที่ไม่มีกรอบใหญ่กว่าให้ดู) ก็ยังนับหัวอยู่ในตัวหาร โดยใส่ p = null ซึ่ง holm.mjs
 * แปลงเป็น 1 ให้ — ปฏิเสธไม่ได้อยู่แล้ว แต่ไม่ทำให้ตัวหารหด
 *
 * ──────────────────────────── p = 0 จาก bootstrap อ่านยังไง ────────────────────────────
 *
 * bootstrap B รอบละเอียดได้แค่ 1/B ค่า 0 ที่ออกมาแปลว่า "น้อยกว่า 1/B" ไม่ใช่ศูนย์จริง
 * ถ้าปล่อย 0 เข้า Holm ตรง ๆ จะได้ adjusted p = 0 ซึ่งอ่านว่า "แน่นอนร้อยเปอร์เซ็นต์"
 * ทั้งที่หลักฐานมีแค่ B ตัวอย่าง จึงยกพื้น p ไว้ที่ 1/B ก่อนเข้า Holm เสมอ
 *
 *   node scripts/research/rule-lab-holm-report.mjs
 *   node scripts/research/rule-lab-holm-report.mjs --alpha=0.05 --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { holmFromEntries, DEFAULT_ALPHA } from './holm.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SELF_DIR, '..', '..');
const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const IN_FILE = path.join(SELF_DIR, 'reports', 'rule-lab.json');
const MD_FILE = path.join(SELF_DIR, 'reports', 'rule-lab-summary.md');
const JSON_FILE = path.join(SELF_DIR, 'reports', 'rule-lab-holm.json');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ช่วงเวลาที่วัดจริงของแต่ละกรอบ — อ่านจากแคชโดยตรง ไม่ใช่จาก split.json
 *
 * split.json บอกเส้นแบ่งของ "ทุกตลาดรวมกัน" ซึ่งรวมคริปโตและหุ้นที่ไม่ได้อยู่ในจักรวาล 13 ตัว
 * ถ้าเอาเลขนั้นมาหารจะได้ไม้ต่อวันที่ผิด เพราะตัวส่วนกินช่วงที่จักรวาลนี้ยังไม่มีข้อมูล
 */
function measuredSpan(universe, timeframe, cutIso) {
  const cut = Date.parse(cutIso);
  let min = Infinity;
  let max = -Infinity;
  let bars = 0;
  for (const key of universe) {
    const [market, symbol] = key.split('/');
    const file = path.join(CACHE_DIR, `${market}__${symbol}__${timeframe}.json`);
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const c of j.candles) {
      const ts = Date.parse(c.timestamp);
      if (!Number.isFinite(ts) || ts >= cut) continue;
      bars++;
      if (ts < min) min = ts;
      if (ts > max) max = ts;
    }
  }
  if (!Number.isFinite(min)) throw new Error(`ไม่มีแท่งที่วัดได้เลยสำหรับ ${timeframe}`);
  return {
    timeframe,
    firstIso: new Date(min).toISOString(),
    lastIso: new Date(max).toISOString(),
    // ปัดขึ้นเป็นวันเต็ม เพราะ "ไม้ต่อวัน" ที่ตัวส่วนเป็นเศษวันอ่านแล้วชวนเข้าใจผิด
    days: Math.max(1, Math.round((max - min) / DAY_MS)),
    bars,
  };
}

const f = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
const pctS = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`);

/** p ที่เล็กกว่าความละเอียดของ bootstrap เขียนเป็น "< 1/B" ไม่ใช่ 0.0000 */
function pText(p, floor) {
  if (p === null || p === undefined) return '—';
  if (p <= floor + 1e-15) return `< ${floor.toExponential(0)}`;
  return p < 0.001 ? p.toExponential(2) : p.toFixed(4);
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const alpha = Number(args.alpha ?? DEFAULT_ALPHA);

  if (!fs.existsSync(IN_FILE)) {
    throw new Error(`ไม่พบ ${IN_FILE} — รัน rule-lab.mjs ก่อน`);
  }
  const lab = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
  const B = lab.bootstrap?.B;
  if (!B) throw new Error('รายงานต้นทางไม่มี bootstrap.B — อ่านความละเอียดของ p ไม่ได้');
  const pFloor = 1 / B;

  const ruleSlugs = [...new Set(lab.results.map((r) => r.rule))];
  const timeframes = lab.timeframes;
  // ตัวหารที่คาดไว้ = กฎทุกข้อที่ผ่าน causality × กรอบเวลาทุกอัน — ถ้าไม่ตรง holm.mjs จะ throw
  const expectedFamilySize = ruleSlugs.length * timeframes.length;

  const spans = Object.fromEntries(
    timeframes.map((tf) => [tf, measuredSpan(lab.universe, tf, lab.measuredBefore[tf])]));

  const entries = lab.results.map((r) => ({
    rule: r.rule,
    timeframe: r.timeframe,
    family: r.family,
    trades: r.trades,
    signals: r.signals,
    avgR: r.avgR,
    totalR: r.totalR,
    winRate: r.winRate,
    lo95: r.ci ? r.ci.lo95 : null,
    hi95: r.ci ? r.ci.hi95 : null,
    clusters: r.ci ? r.ci.clusters : null,
    pRaw: r.ci ? r.ci.pTwoTailed : null,
    pTTest: r.ci ? r.ci.pTTestCluster : null,
    // ยกพื้นที่ 1/B ก่อนเข้า Holm — เหตุผลอยู่ในหัวไฟล์
    p: r.ci ? Math.max(r.ci.pTwoTailed, pFloor) : null,
    tradesPerDay: r.trades / spans[r.timeframe].days,
  }));

  const res = holmFromEntries(entries, { alpha, expectedFamilySize });

  // "รอด" ต้องมีสองอย่างพร้อมกัน: ปฏิเสธ H0 ได้หลัง Holm และค่าเฉลี่ยเป็นบวก
  // การทดสอบเป็นสองหาง กฎที่ขาดทุนหนักจนมีนัยสำคัญก็ "ปฏิเสธ H0" ได้เหมือนกัน
  // ถ้าเรียกอันนั้นว่ารอดด้วยจะกลายเป็นการอวดกฎที่พังอย่างมั่นใจ
  const rows = res.results.map((r) => ({
    ...r,
    survives: r.reject === true && r.avgR !== null && r.avgR > 0,
    significantlyNegative: r.reject === true && r.avgR !== null && r.avgR < 0,
  }));
  rows.sort((a, b) => {
    if (a.avgR === null && b.avgR === null) return a.rule.localeCompare(b.rule);
    if (a.avgR === null) return 1;
    if (b.avgR === null) return -1;
    return b.avgR - a.avgR;
  });

  const survivors = rows.filter((r) => r.survives);
  const negatives = rows.filter((r) => r.significantlyNegative);
  const untestable = rows.filter((r) => r.pWasNull);
  const testable = rows.filter((r) => !r.pWasNull);
  const rawUnder = testable.filter((r) => r.pRaw !== null && r.pRaw < alpha);
  const rawUnderPositive = rawUnder.filter((r) => r.avgR > 0);

  // จำลองความผิดพลาดที่โจทย์เตือนไว้ — กรองเฉพาะช่องที่ p ดิบสวยแล้วค่อยแก้ multiple testing
  // เอาไว้โชว์ในรายงานว่าตัวหารที่หดทำให้คำตอบเปลี่ยนไปกี่ช่อง
  const cherry = holmFromEntries(rawUnder.map((r) => ({ key: `${r.rule}/${r.timeframe}`, p: r.p })), { alpha });
  const killedUnderCherryPick = cherry.results.filter((x) => !x.reject).length;

  const md = renderMarkdown({
    lab, alpha, B, pFloor, ruleSlugs, timeframes, spans, rows, survivors, negatives,
    untestable, testable, rawUnder, rawUnderPositive, m: res.m, expectedFamilySize,
    killedUnderCherryPick,
  });

  fs.mkdirSync(path.dirname(MD_FILE), { recursive: true });
  fs.writeFileSync(MD_FILE, md, 'utf8');
  fs.writeFileSync(JSON_FILE, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, IN_FILE).replace(/\\/g, '/'),
    alpha,
    bootstrapB: B,
    pFloor,
    familySize: res.m,
    rulesMeasured: ruleSlugs.length,
    timeframes,
    spans,
    survivors: survivors.map(slim),
    significantlyNegative: negatives.map(slim),
    untestable: untestable.map((r) => ({ rule: r.rule, timeframe: r.timeframe, reason: 'ไม่มีไม้เลย' })),
    results: rows.map(slim),
  }, null, 2)}\n`, 'utf8');

  if (args.json) {
    console.log(JSON.stringify({ familySize: res.m, survivors: survivors.map(slim) }, null, 2));
  } else {
    console.log(`\nครอบครัวการทดสอบ: ${ruleSlugs.length} กฎ × ${timeframes.length} TF = ${res.m} การทดสอบ`);
    console.log(`ทดสอบได้จริง ${testable.length} ช่อง · ไม่มีไม้เลย ${untestable.length} ช่อง (p = 1)`);
    console.log(`p ดิบ < ${alpha}: ${rawUnder.length} ช่อง (บวก ${rawUnderPositive.length} ช่อง)`);
    console.log(`หลัง Holm ที่ alpha ${alpha}: ปฏิเสธ H0 ได้ ${rows.filter((r) => r.reject).length} ช่อง`
      + ` — เป็นบวก ${survivors.length} ช่อง · เป็นลบ ${negatives.length} ช่อง`);
    console.log(`\nเขียนรายงานลง ${MD_FILE}`);
    console.log(`เขียน JSON ลง ${JSON_FILE}\n`);
  }
  return 0;
}

function slim(r) {
  return {
    rule: r.rule, timeframe: r.timeframe, family: r.family, trades: r.trades,
    tradesPerDay: r.tradesPerDay, avgR: r.avgR, totalR: r.totalR, winRate: r.winRate,
    ci95: r.lo95 === null ? null : [r.lo95, r.hi95], clusters: r.clusters,
    pRaw: r.pRaw, pTTestCluster: r.pTTest, pUsed: r.p, pHolm: r.adjustedP,
    holmRank: r.rank, holmFactor: r.factor, reject: r.reject, survives: r.survives === true,
  };
}

function renderMarkdown(c) {
  const { lab, alpha, B, pFloor, ruleSlugs, timeframes, spans, rows, survivors, negatives,
    untestable, testable, rawUnder, rawUnderPositive, m } = c;

  const L = [];
  L.push('# สรุปผลวัดกฎเทรดทีละข้อ — พร้อมแก้การทดสอบหลายครั้งพร้อมกัน (Holm-Bonferroni)');
  L.push('');
  L.push(`สร้างเมื่อ ${new Date().toISOString()} · ผลดิบจาก \`scripts/research/reports/rule-lab.json\``);
  L.push(`(วัดเมื่อ ${lab.generatedAt})`);
  L.push('');

  L.push('## คำตอบสั้น ๆ');
  L.push('');
  if (survivors.length === 0) {
    L.push(`**ไม่มีกฎข้อไหนรอด** — ทั้ง ${m} การทดสอบไม่มีช่องไหนที่ค่าเฉลี่ย R เป็นบวก`);
    L.push(`แล้วผ่านเกณฑ์ Holm-Bonferroni ที่ alpha ${alpha}`);
    L.push('');
    L.push('ที่สำคัญกว่านั้น: **ไม่ต้องรอถึงขั้น Holm ก็ไม่มีตัวไหนรอดอยู่แล้ว**');
    L.push(`ช่องที่ค่าเฉลี่ยเป็นบวกมี ${rows.filter((r) => r.avgR !== null && r.avgR > 0).length} ช่อง`);
    L.push(`และ p ดิบที่น้อยที่สุดในกลุ่มนั้นคือ ${f(Math.min(...rows.filter((r) => r.avgR !== null && r.avgR > 0).map((r) => r.pRaw)), 4)}`);
    L.push(`ซึ่งยังห่างจาก ${alpha} มาก การแก้ multiple testing จึงไม่ได้ "ฆ่า" อะไรที่มีชีวิตอยู่ก่อน`);
    L.push('— มันแค่ยืนยันว่าไม่มีอะไรให้ฆ่าตั้งแต่แรก');
  } else {
    L.push(`มี ${survivors.length} ช่องที่รอด: ${survivors.map((r) => `\`${r.rule}\` (${r.timeframe})`).join(', ')}`);
  }
  L.push('');
  L.push(`สิ่งที่ผ่านเกณฑ์ Holm จริง ๆ มี ${rows.filter((r) => r.reject).length} ช่อง แต่ทั้งหมดเป็น`);
  L.push(`**กฎที่ขาดทุนอย่างมีนัยสำคัญ** (${negatives.length} ช่อง) ไม่ใช่กฎที่ทำกำไร`);
  L.push('การทดสอบเป็นสองหาง การ "ปฏิเสธ H0" จึงแปลว่า "ต่างจากศูนย์" ไม่ได้แปลว่า "ดี"');
  L.push('');

  L.push('## ครอบครัวของการทดสอบ');
  L.push('');
  L.push('| รายการ | จำนวน |');
  L.push('| --- | ---: |');
  L.push(`| กฎที่โหลดได้และผ่าน causality | ${ruleSlugs.length} |`);
  L.push(`| กรอบเวลา | ${timeframes.length} (${timeframes.join(', ')}) |`);
  L.push(`| **ครอบครัวทั้งหมด (ตัวหารของ Holm)** | **${m}** |`);
  L.push(`| ช่องที่มีไม้และคำนวณ p ได้ | ${testable.length} |`);
  L.push(`| ช่องที่ไม่มีไม้เลย (ใส่ p = 1 แต่ยังนับหัว) | ${untestable.length} |`);
  L.push(`| ช่องที่ p ดิบ < ${alpha} | ${rawUnder.length} |`);
  L.push(`| ช่องที่ p ดิบ < ${alpha} **และ** R เฉลี่ยเป็นบวก | ${rawUnderPositive.length} |`);
  L.push(`| ช่องที่ผ่าน Holm | ${rows.filter((r) => r.reject).length} |`);
  L.push(`| **ช่องที่รอด (ผ่าน Holm และ R เฉลี่ยเป็นบวก)** | **${survivors.length}** |`);
  L.push('');
  // การแก้ multiple testing ที่ไม่เปลี่ยนคำตอบเลยอ่านแล้วเหมือนพิธีกรรม จึงต้องชี้ให้เห็น
  // ว่ามันกัดจริงตรงไหน ถึงแม้ในรอบนี้ตัวที่ถูกกัดจะเป็นกฎที่ขาดทุนก็ตาม
  const killed = testable.filter((r) => r.pRaw !== null && r.pRaw < alpha && !r.reject);
  if (killed.length) {
    L.push(`Holm ตัดช่องที่ p ดิบ < ${alpha} ออกไป ${killed.length} ช่อง — ตัวอย่างที่เห็นชัด:`);
    L.push('');
    for (const r of killed) {
      L.push(`- \`${r.rule}\` (${r.timeframe}): p ดิบ ${f(r.pRaw)} → คูณ ${r.factor} → ${f(r.adjustedP)} ซึ่งเกิน ${alpha}`);
    }
    L.push('');
    L.push(`ถ้าทำผิดแบบที่พบบ่อย — เอาเฉพาะ ${rawUnder.length} ช่องที่ p ดิบ < ${alpha} มาเข้า Holm`);
    L.push(`ตัวหารจะกลายเป็น ${rawUnder.length} แทน ${m} แล้วช่องที่ถูกตัดจะเหลือ ${c.killedUnderCherryPick} ช่อง`);
    L.push('— การเลือกก่อนแก้คือตัวสร้าง bias เอง ไฟล์ `holm.mjs` จึงมี guard `expectedFamilySize`');
    L.push('ที่ throw ทันทีถ้าจำนวน p ที่ส่งเข้าไปไม่เท่ากับขนาดครอบครัวที่ประกาศไว้');
    L.push('');
  }
  L.push(`ตัวหารคือ **${m}** ไม่ใช่จำนวนช่องที่ดูดี และไม่ใช่ ${testable.length} ช่องที่ทดสอบได้`);
  L.push('ช่องที่ไม่มีไม้เลยยังนับหัวอยู่ในครอบครัว เพราะมันเป็นกฎที่ถูกเขียนขึ้นมาลุ้นผลเหมือนกัน');
  L.push('การไม่นับมันจะทำให้ตัวหารหดตามผลที่ออกมา ซึ่งคือ bias แบบเดียวกับที่ Holm ตั้งใจแก้');
  L.push('(วิธีนี้ conservative เสมอ — p = 1 ปฏิเสธไม่ได้อยู่แล้ว จึงไม่มีทางทำให้ใครผ่านง่ายขึ้น)');
  L.push('');
  L.push('ช่องที่ไม่มีไม้เลยคือ:');
  L.push('');
  for (const r of untestable) L.push(`- \`${r.rule}\` (${r.timeframe})`);
  L.push('');
  L.push('เหตุผลมีสองแบบ: กฎตระกูล `vetoes-*` เป็นตัวกรองล้วน ไม่เคยออกสัญญาณ bull/bear ของตัวเอง');
  L.push('จึงไม่มีไม้ให้วัดในกรอบที่วัดกฎเดี่ยว ๆ แบบนี้ · ส่วนกฎที่ต้องใช้บริบทกรอบใหญ่ (`needsHtf`)');
  L.push('ออกไม้บน 1D ไม่ได้เพราะไม่มีกรอบที่ใหญ่กว่า 1D ในแคช');
  L.push('');

  L.push('## ช่วงเวลาที่วัด');
  L.push('');
  L.push('| TF | ตั้งแต่ | ถึง | วัน | แท่งรวม 13 ตัว |');
  L.push('| --- | --- | --- | ---: | ---: |');
  for (const tf of timeframes) {
    const s = spans[tf];
    L.push(`| ${tf} | ${s.firstIso.slice(0, 10)} | ${s.lastIso.slice(0, 10)} | ${s.days.toLocaleString('en-US')} | ${s.bars.toLocaleString('en-US')} |`);
  }
  L.push('');
  L.push('"ไม้/วัน" ในตารางถัดไปคือ จำนวนไม้ ÷ จำนวนวันข้างบนนี้ และเป็นยอด **รวมทั้งจักรวาล 13 ตัว**');
  L.push('ไม่ใช่ต่อสินทรัพย์ ตัวส่วนเป็นวันปฏิทิน (รวมเสาร์อาทิตย์ที่ตลาดปิด) ตัวเลขจริงต่อวันทำการ');
  L.push('จึงสูงกว่านี้ราว 7/5 เท่า');
  L.push('');

  L.push('## ตารางผลทั้งหมด (เรียงตาม R เฉลี่ย จากมากไปน้อย)');
  L.push('');
  L.push('| กฎ | TF | จำนวนไม้ | ไม้/วัน | R เฉลี่ย | CI 95% (cluster) | p ดิบ | p หลัง Holm | รอด/ไม่รอด |');
  L.push('| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- |');
  for (const r of rows) {
    const ci = r.lo95 === null ? '—' : `[${f(r.lo95)}, ${f(r.hi95)}]`;
    const verdict = r.trades === 0
      ? 'ไม่รอด (ไม่มีไม้)'
      : (r.survives ? '**รอด**' : (r.significantlyNegative ? 'ไม่รอด (ลบอย่างมีนัยสำคัญ)' : 'ไม่รอด'));
    L.push(`| \`${r.rule}\` | ${r.timeframe} | ${r.trades.toLocaleString('en-US')} | ${r.trades === 0 ? '—' : f(r.tradesPerDay, 2)}`
      + ` | ${f(r.avgR)} | ${ci} | ${pText(r.pRaw, pFloor)} | ${r.pWasNull ? '1.0000' : f(r.adjustedP)} | ${verdict} |`);
  }
  L.push('');
  L.push(`ทั้งหมด ${rows.length} แถว = ครอบครัวเต็ม ไม่มีแถวไหนถูกซ่อน`);
  L.push('');

  L.push('## วิธีอ่านตัวเลขในตาราง');
  L.push('');
  L.push(`- **R เฉลี่ย** = กำไร/ขาดทุนสุทธิต่อไม้ หน่วยเป็นเท่าของเงินที่เสี่ยง หักต้นทุนแล้ว`);
  L.push(`- **CI 95%** มาจาก bootstrap ${B.toLocaleString('en-US')} รอบ สุ่มเป็นก้อนตาม symbol (${rows.find((r) => r.clusters)?.clusters ?? 13} ก้อน)`);
  L.push('  ไม่ใช่สุ่มราย-ไม้ เพราะไม้ใน symbol เดียวกันไม่เป็นอิสระต่อกัน');
  L.push(`- **p ดิบ** = p สองหางจาก bootstrap ก้อนเดียวกัน ละเอียดได้แค่ ${pFloor.toExponential(0)}`);
  L.push(`  ค่าที่แสดงเป็น \`< ${pFloor.toExponential(0)}\` คือค่าที่ bootstrap ตอบว่า 0 ซึ่งอ่านว่า "น้อยกว่า ${pFloor.toExponential(0)}" ไม่ใช่ศูนย์จริง`);
  L.push(`  ก่อนเข้า Holm ค่าพวกนี้ถูกยกพื้นไว้ที่ ${pFloor.toExponential(0)} เพื่อไม่ให้ adjusted p กลายเป็น 0`);
  L.push(`- **p หลัง Holm** = adjusted p แบบ step-down ที่ตัวหารสะท้อนครอบครัว ${m} การทดสอบ`);
  L.push(`  ตัวที่ p น้อยที่สุดถูกคูณ ${m} ตัวถัดไปคูณ ${m - 1} ไล่ลงไป และถูกบังคับให้ไม่ลดลงตามอันดับ`);
  L.push(`  ปฏิเสธ H0 เมื่อ adjusted p ≤ ${alpha}`);
  L.push('- **รอด** = ผ่าน Holm **และ** R เฉลี่ยเป็นบวก — สองเงื่อนไข ไม่ใช่เงื่อนไขเดียว');
  L.push('');

  L.push('## สิ่งที่ผลนี้ยังไม่ได้พิสูจน์');
  L.push('');
  L.push('อ่านหัวข้อนี้ก่อนจะเอาตัวเลขข้างบนไปใช้ตัดสินใจอะไร');
  L.push('');
  L.push('### 1. ไม่ได้แตะชุด test เลย — และนั่นแปลว่ายังไม่มีการยืนยันนอกกลุ่มตัวอย่าง');
  L.push('');
  L.push(`ทุกตัวเลขมาจาก train + validation เท่านั้น (1D ใช้แท่งก่อน ${lab.measuredBefore['1D']?.slice(0, 10)},`);
  L.push(`1H ใช้แท่งก่อน ${lab.measuredBefore['1H']?.slice(0, 10)}) ชุด test ถูกตัดทิ้งตั้งแต่ตอนโหลดและมี guard ที่ throw`);
  L.push('ถ้ามีแท่งหลุดเข้ามา ข้อดีคือชุด test ยังสะอาดพอจะใช้ตัดสินครั้งสุดท้ายได้');
  L.push('ข้อเสียคือ **ยังไม่มีใครยืนยันตัวเลขพวกนี้บนข้อมูลที่ไม่เคยเห็น** ผลที่ได้จึงเป็นได้แค่');
  L.push('"อะไรไม่ผ่านด่านแรก" ไม่ใช่ "อะไรใช้ได้จริง"');
  L.push('');
  L.push('มีข้อยกเว้นหนึ่งข้อที่ต้องพูดตรง ๆ: บริบท 1D ที่กฎตระกูล MTF มองบนกรอบ 1H เป็นแท่ง 1D');
  L.push('ที่อยู่ในช่วง test ของ 1D (เพราะ 1H ย้อนได้แค่ราว 3 ปี) นี่ไม่ใช่การมองอนาคตของไม้ 1H');
  L.push('แต่ **ห้ามอ้างว่าชุด test ของ 1D ยังไม่ถูกแตะเลย** รายละเอียดอยู่ใน `scripts/research/report/split.json` หัวข้อ `overlaps`');
  L.push('');
  L.push('### 2. ตัวอย่างซ้อนทับกัน — จำนวนไม้ที่เห็นไม่ใช่จำนวนหลักฐานที่มี');
  L.push('');
  L.push('ตัวรันเปิดไม้ทุกครั้งที่มีสัญญาณ โดยไม่จำกัดจำนวนไม้ที่ถือพร้อมกัน ไม้เฉลี่ยถือราว 9–12 แท่ง');
  L.push('แต่สัญญาณเกิดได้ทุกแท่ง ผลคือไม้จำนวนมากทับช่วงเวลาเดียวกันและกินการเคลื่อนไหวของราคาก้อนเดียวกันซ้ำ ๆ');
  L.push('');
  L.push(`ตัวอย่างที่ชัดที่สุดคือ \`confluence-core-equal-weight-vote\` บน 1H ที่มี ${rows.find((r) => r.rule === 'confluence-core-equal-weight-vote' && r.timeframe === '1H')?.trades.toLocaleString('en-US')} ไม้`);
  L.push(`จากช่วงเวลาแค่ ${spans['1H'].days.toLocaleString('en-US')} วัน — ราว ${f(rows.find((r) => r.rule === 'confluence-core-equal-weight-vote' && r.timeframe === '1H')?.tradesPerDay, 1)} ไม้ต่อวันทั้งจักรวาล`);
  L.push('เลขนี้ไม่ได้แปลว่ามีหลักฐานอิสระเป็นแสนชิ้น');
  L.push('');
  L.push('การ bootstrap แบบก้อนตาม symbol แก้ปัญหานี้ได้แค่ครึ่งเดียว — มันจัดการความสัมพันธ์');
  L.push('*ข้ามสินทรัพย์* ให้ (ไม้ใน EURUSD ทั้งหมดขึ้นลงด้วยกัน) แต่ไม่ได้จัดการความสัมพันธ์');
  L.push('*ข้ามเวลาภายในสินทรัพย์เดียวกัน* ที่เกิดจากไม้ซ้อนกัน และก้อนมีแค่ 13 ก้อนซึ่งน้อยเกินกว่าที่');
  L.push('ทฤษฎี cluster bootstrap จะให้ CI ที่แม่น ให้ถือว่า CI ในตาราง **แคบกว่าความจริง** ไม่ใช่กว้างเกินไป');
  L.push('');
  L.push('### 3. ไม่ได้รวมผลของการเอากฎหลายข้อมารวมกัน');
  L.push('');
  L.push('ทุกแถวคือกฎเดี่ยว ๆ ที่เดินด้วยกติกาเข้า-ออกตายตัวชุดเดียวกัน (SL 1.5×ATR, RR 2.0, เพดานถือคงที่)');
  L.push('ผลนี้ไม่บอกอะไรเลยเกี่ยวกับ:');
  L.push('');
  L.push('- กฎ A + กฎ B ทำงานพร้อมกันแล้วดีขึ้นหรือแย่ลง (กฎที่แย่เดี่ยว ๆ อาจเป็นตัวกรองที่ดีได้)');
  L.push(`- กฎตระกูล \`vetoes-*\` ทั้ง 4 ข้อ ซึ่ง**วัดไม่ได้เลยในกรอบนี้**เพราะไม่ออกสัญญาณของตัวเอง`);
  L.push('  คุณค่าของมันอยู่ที่การตัดไม้ของกฎอื่นทิ้ง ซึ่งต้องวัดแบบจับคู่ ไม่ใช่แบบเดี่ยว');
  L.push('- การจัดขนาดไม้ การทบต้น การจำกัดไม้พร้อมกัน — ตัวรันไม่ทำทั้งหมดนี้');
  L.push('  ตัวเลขที่ได้จึงเป็น "คุณภาพของสัญญาณ" ไม่ใช่ "ผลของพอร์ต"');
  L.push('');
  L.push('พูดอีกแบบ: ผลนี้ตัดตัวเลือกออกได้ แต่สรุปไม่ได้ว่าระบบที่ประกอบจากกฎเหล่านี้จะแพ้ตามไปด้วย');
  L.push('');
  L.push('### 4. 1H และ 1D ไม่ใช่ 15m ที่เจ้าของใช้จริง');
  L.push('');
  L.push('เจ้าของเทรดบน 15m แต่ในแคชไม่มี 15m เลย เพราะแหล่งข้อมูลให้ย้อนหลังแค่ราวหนึ่งเดือน');
  L.push('ซึ่งสั้นเกินกว่าจะแบ่ง train/validation/test ได้ ทุกอย่างในรายงานนี้จึงเป็นการวัด');
  L.push('**กรอบเวลาอื่น** แล้วหวังว่าพฤติกรรมจะคล้ายกัน ซึ่งเป็นสมมติฐานที่ไม่ได้ทดสอบ');
  L.push('');
  L.push('และมีเหตุผลที่จะเชื่อว่ามันไม่คล้าย — ดูคอลัมน์ต้นทุนก็ได้: บน 1D ต้นทุนกินราว 0.017 R ต่อไม้');
  L.push('แต่บน 1H กินราว 0.09–0.10 R เพราะ ATR ที่แคบกว่าทำให้ระยะ SL สั้นลง ต้นทุนคงที่จึงกลายเป็น');
  L.push('สัดส่วนที่ใหญ่ขึ้นมาก บน 15m ATR ยิ่งแคบกว่านั้นอีก ต้นทุนต่อไม้จะยิ่งกินหนักขึ้นไปอีก');
  L.push('ทิศทางของผลจึงน่าจะ**แย่กว่า**ที่เห็นในตาราง ไม่ใช่ดีกว่า แต่ "น่าจะ" ไม่ใช่ "วัดแล้ว"');
  L.push('');
  L.push('### 5. ข้อจำกัดอื่นที่ต้องรู้');
  L.push('');
  L.push('- **ต้นทุนเป็นค่าประมาณ** จากตารางค่าธรรมเนียมสาธารณะ ไม่ใช่ใบเสร็จจริงของโบรกเกอร์ที่ใช้');
  L.push('  ไม่มี slippage ไม่มี swap/ค่าถือข้ามคืน ไม่มีการขยาย spread ช่วงข่าว');
  L.push('- **ไม่มี survivorship/selection audit ของตัวกฎเอง** — กฎ 25 ข้อนี้ถูกเขียนขึ้นมาโดยคนที่เห็น');
  L.push('  ข้อมูลชุดนี้มาก่อนแล้ว จำนวนสมมติฐานที่ "ถูกคิดแล้วทิ้งไป" ก่อนจะเหลือ 25 ข้อนี้ ไม่มีใครนับ');
  L.push(`  Holm แก้ได้แค่ ${m} การทดสอบที่เขียนลงไฟล์แล้ว ไม่ได้แก้การทดสอบที่เกิดในหัว`);
  L.push('- **กติกาเข้า-ออกตายตัว** เลือกไว้เพื่อให้เทียบกฎกันได้ ไม่ได้เลือกเพราะเป็นกติกาที่ดีที่สุด');
  L.push('  กฎที่แพ้ในตารางนี้อาจชนะภายใต้ SL/TP แบบอื่น และการไปหา SL/TP ที่ทำให้มันชนะ');
  L.push('  ก็คือการเพิ่มการทดสอบเข้าไปในครอบครัวอีก ซึ่งต้องเอามาหารเพิ่มด้วย');
  L.push('- **ไม่มีการวัดความเสถียรข้ามช่วงเวลา** — ตัวเลขเป็นค่าเฉลี่ยตลอดช่วง ไม่ได้บอกว่ากฎ');
  L.push('  ทำงานสม่ำเสมอหรือดีเฉพาะบางปี');
  L.push('');

  L.push('## วิธีทำซ้ำ');
  L.push('');
  L.push('```');
  L.push('node scripts/research/rule-lab.mjs --self-test');
  L.push('node scripts/research/holm.mjs --self-test');
  L.push(`node scripts/research/rule-lab.mjs --timeframes=${timeframes.join(',')} --bootstrap=${B} --seed=${lab.bootstrap.seed}`);
  L.push('node scripts/research/rule-lab-holm-report.mjs');
  L.push('```');
  L.push('');
  L.push(`bootstrap ใช้ seed ${lab.bootstrap.seed} และ PRNG ที่กำหนดค่าได้ — รันซ้ำต้องได้เลขเดิมทุกตัว`);
  L.push('');

  return `${L.join('\n')}\n`;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`\nrule-lab-holm-report ล้มเหลว: ${e.message}\n${e.stack ?? ''}`);
  process.exitCode = 1;
}
