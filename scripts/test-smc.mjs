#!/usr/bin/env node
/**
 * ชุดทดสอบ SMC (src/lib/smc.ts)
 *
 * ด่านที่สำคัญที่สุดคือ ๕ (causality) — โค้ดโครงสร้างตลาดอ่านอนาคตได้ง่ายมาก (swing ต้องรอ
 * แท่งขวา · OB หาย้อนหลังจากแท่งที่ทะลุ) และบั๊กแบบนี้ทำให้แบ็คเทสต์สวยเกินจริงโดยไม่มี error
 * ที่เหลือคือกติกาตามนิยามที่เขียนไว้หัวไฟล์ smc.ts
 *
 * รัน: node scripts/test-smc.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadSrcModules, ROOT } from './research/load-src-modules.mjs';

const mods = await loadSrcModules(['src/lib/supply-demand.ts', 'src/lib/smc.ts']);
const { analyzeSmc, activeOrderBlocks, unfilledFvgs, SMC_PARAMS: P } = mods['smc'];

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) pass++;
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

let clock = Date.UTC(2025, 0, 1);
const bar = (o, h, l, c) => {
  const b = { timestamp: new Date(clock).toISOString(), open: o, high: h, low: l, close: c, volume: 1 };
  clock += 3600_000;
  return b;
};
const flat = (p, n) => Array.from({ length: n }, () => bar(p, p + 0.4, p - 0.4, p));

/** ขึ้น → ยอด 110 (แท่ง 15) → ลงถึง 98 (แท่ง 20) → ขึ้น ปิด ≤ 109 — ยังไม่ทะลุ */
function upLeg() {
  clock = Date.UTC(2025, 0, 1);
  const c = [...flat(100, 10)];
  for (let k = 0; k < 5; k++) c.push(bar(100 + k, 101.5 + k, 100 + k - 0.3, 101 + k)); // 10-14
  c.push(bar(105, 110, 107, 108));                                                        // 15 ยอด
  const down = [[107, 105, 106], [105, 103, 104], [103, 101, 102], [101, 99, 100], [100, 98, 99]];
  for (const [h, l, cl] of down) c.push(bar(cl + 1, h, l, cl));                            // 16-20
  const up = [[102, 99.5, 101], [104, 101, 103], [106, 103, 105], [108, 105, 107], [109.5, 107, 109]];
  for (const [h, l, cl] of up) c.push(bar(cl - 1, h, l, cl));                             // 21-25
  return c;
}

console.log('ทดสอบ SMC\n');

// ─────────────────────────── ๑. swing ต้องรอแท่งขวาครบ ───────────────────────────
{
  const c = upLeg();
  const a = analyzeSmc(c);
  const sh = a.swings.find((s) => s.kind === 'high' && s.index === 15);
  const sl = a.swings.find((s) => s.kind === 'low' && s.index === 20);
  t('๑ เจอ swing high ที่ยอด 110', sh?.price === 110, JSON.stringify(sh));
  t(`๑ swing high ยืนยันที่แท่ง 15 + ${P.swingLength}`, sh?.confirmedAt === 15 + P.swingLength);
  t('๑ เจอ swing low ที่ 98', sl?.price === 98 && sl.confirmedAt === 25, JSON.stringify(sl));
  const early = analyzeSmc(c.slice(0, 20));
  t('๑ ตัดชุดก่อนแท่งยืนยัน = ยังไม่เห็น swing high นั้น', !early.swings.some((s) => s.index === 15));
  t('๑ ยังไม่ทะลุ = ไม่มี event', a.events.length === 0 && a.trend === 0);
}

// ─────────────────────────── ๒. BOS + Order Block ───────────────────────────
{
  const c = upLeg();
  c.push(bar(109, 113, 108.5, 112)); // 26 ปิด 112 > 110
  const a = analyzeSmc(c);
  const e = a.events[0];
  t('๒ ปิดทะลุ swing high = BOS ขึ้น', a.events.length === 1 && e.kind === 'BOS' && e.dir === 1 && e.index === 26, JSON.stringify(e));
  t('๒ ระดับที่ทะลุคือ 110', e?.level === 110 && e.swingIndex === 15);
  t('๒ OB คือแท่งที่ low ต่ำสุดของขา (แท่ง 20)', e?.ob?.index === 20, JSON.stringify(e?.ob));
  t('๒ OB ขาขึ้น: proximal = high แท่งนั้น (100) · distal = low (98)', e?.ob?.proximal === 100 && e.ob.distal === 98);
  t('๒ OB รู้ได้ ณ แท่งที่ทะลุ ไม่ใช่ ณ แท่งของ OB', e?.ob?.knownAt === 26);
  t('๒ เทรนด์หลังทะลุ = ขึ้น', a.trend === 1);

  // ── CHoCH: ขึ้นต่อทำยอดใหม่ → ลงทำ low ที่สูงขึ้น → ปิดทะลุ low นั้นลงมา
  const up2 = [[115, 112, 114], [117, 113, 116], [119, 115, 118], [120, 117, 119]];
  for (const [h, l, cl] of up2) c.push(bar(cl - 1, h, l, cl));    // 27-30
  c[30] = { ...c[30], high: 121, low: 118 };                        // 30 ยอด 121
  const dn2 = [[119, 116, 117], [117, 114, 115], [115, 112, 113], [113, 110, 111], [111, 108, 109]];
  for (const [h, l, cl] of dn2) c.push(bar(cl + 1, h, l, cl));    // 31-35
  const up3 = [[112, 109, 111], [114, 111, 113], [116, 113, 115], [118, 115, 117], [120, 117, 119]];
  for (const [h, l, cl] of up3) c.push(bar(cl - 1, h, l, cl));    // 36-40
  c.push(bar(119, 119.5, 104, 105));                                // 41 ปิด 105 < 108
  const b = analyzeSmc(c);
  const ch = b.events[b.events.length - 1];
  t('๒ ปิดทะลุ low ที่สูงขึ้นลงมา สวนเทรนด์ขึ้น = CHoCH ลง', ch?.kind === 'CHoCH' && ch.dir === -1 && ch.index === 41, JSON.stringify(ch));
  t('๒ OB ขาลงคือแท่งที่ high สูงสุดของขา (แท่ง 40) · proximal = low ของแท่งนั้น',
    ch?.ob?.index === 40 && ch.ob.proximal === 117 && ch.ob.distal === 120, JSON.stringify(ch?.ob));
  t('๒ เทรนด์พลิกเป็นลง', b.trend === -1);
}

// ─────────────────────────── ๓. กวาดสภาพคล่อง ───────────────────────────
{
  const c = upLeg();
  c.push(bar(109, 111, 108.5, 109.5)); // 26 ไส้ 111 > 110 แต่ปิด 109.5
  c.push(bar(109.5, 113, 109, 112));   // 27 ปิดทะลุ 110 ทีหลัง
  const a = analyzeSmc(c);
  t('๓ ไส้ทะลุแต่ปิดกลับ = กวาดสภาพคล่องฝั่งบน (dir -1)',
    a.sweeps.length === 1 && a.sweeps[0].dir === -1 && a.sweeps[0].index === 26 && a.sweeps[0].level === 110, JSON.stringify(a.sweeps));
  t('๓ swing ที่ถูกกวาดแล้ว ปิดทะลุทีหลังไม่นับเป็น BOS', a.events.length === 0, JSON.stringify(a.events));
}

// ─────────────────────────── ๔. FVG ───────────────────────────
{
  clock = Date.UTC(2025, 0, 1);
  const c = [...flat(100, 20), bar(100, 101, 99.8, 100.9), bar(101, 103.5, 100.9, 103.2), bar(103.2, 104, 102, 103.8)];
  const a = analyzeSmc(c);
  const f = a.fvgs.find((x) => x.index === 22);
  t('๔ low แท่ง 3 (102) > high แท่ง 1 (101) = FVG ขาขึ้น', f?.dir === 1 && f.bottom === 101 && f.top === 102, JSON.stringify(a.fvgs));
  t('๔ FVG ขาขึ้น proximal = ขอบบน', f?.proximal === 102 && f.distal === 101);

  clock = Date.UTC(2025, 0, 1);
  const tiny = [...flat(100, 20), bar(100, 100.4, 99.8, 100.3), bar(100.3, 100.9, 100.3, 100.8), bar(100.8, 101, 100.45, 100.9)];
  t(`๔ ช่องเล็กกว่า ${P.fvgMinAtr}×ATR ถูกกรองทิ้ง`, !analyzeSmc(tiny).fvgs.some((x) => x.index === 22), JSON.stringify(analyzeSmc(tiny).fvgs));

  // ราคาย้อนลงผ่านทั้งช่อง = เติมเต็มแล้ว
  const filled = [...c, bar(103.8, 104, 100.5, 101)];
  t('๔ ราคาลงผ่านขอบล่างของช่อง = FVG ถูกเติมแล้ว ไม่แสดงอีก',
    unfilledFvgs(c, analyzeSmc(c)).some((x) => x.index === 22) && !unfilledFvgs(filled, analyzeSmc(filled)).some((x) => x.index === 22));
}

// ─────────── ๕. ห้ามรู้อนาคต — ด่านที่สำคัญที่สุด (ข้อมูลทองจริง) ───────────
const gold = path.join(ROOT, '.research-cache', 'candles', 'GOLD__XAUUSD__1H.json');
if (!existsSync(gold)) {
  console.log('  … ข้ามด่าน ๕–๗ (ไม่มีแคชทอง)');
} else {
  const raw = JSON.parse(readFileSync(gold, 'utf8'));
  const candles = (Array.isArray(raw) ? raw : raw.candles).slice(0, 1600);
  const full = analyzeSmc(candles);

  const kEv = (e) => JSON.stringify(e);
  const known = (a, i) => ({
    swings: a.swings.filter((s) => s.confirmedAt <= i).map(kEv).sort(),
    events: a.events.filter((e) => e.knownAt <= i).map(kEv).sort(),
    fvgs: a.fvgs.filter((f) => f.knownAt <= i).map(kEv).sort(),
    sweeps: a.sweeps.filter((s) => s.knownAt <= i).map(kEv).sort(),
  });

  let mismatch = 0, trendMismatch = 0, compared = 0;
  for (let i = 200; i < candles.length; i += 37) {
    const cut = analyzeSmc(candles.slice(0, i + 1));
    const a = known(full, i), b = known(cut, i);
    compared += a.events.length;
    if (JSON.stringify(a) !== JSON.stringify(b)) mismatch++;
    const evs = full.events.filter((e) => e.knownAt <= i);
    if (cut.trend !== (evs.length ? evs[evs.length - 1].dir : 0)) trendMismatch++;
  }
  t('๕ swing/BOS/CHoCH/OB/FVG/กวาด เหมือนเดิมเป๊ะเมื่อตัดแท่งอนาคตทิ้ง', mismatch === 0, `ไม่ตรง ${mismatch} จุด`);
  t('๕ ทิศเทรนด์ ณ แท่งใด ๆ ไม่ขึ้นกับแท่งหลังจากนั้น', trendMismatch === 0, `ไม่ตรง ${trendMismatch} จุด`);
  t('๕ ด่านนี้ได้ตรวจของจริง (มี event ให้เทียบมากพอ)', compared > 500, `เทียบ ${compared}`);

  // negative control — ตัวที่เห็นแท่งเกินไป 20 แท่งต้องให้ผลต่าง ไม่งั้นด่านข้างบนผ่านฟรี
  let caught = 0;
  for (let i = 200; i < candles.length - 30; i += 37) {
    const honest = known(analyzeSmc(candles.slice(0, i + 1)), i);
    const cheat = known(analyzeSmc(candles.slice(0, i + 21)), i + 20);
    if (JSON.stringify(honest) !== JSON.stringify(cheat)) caught++;
  }
  t('๕ negative control — เห็นข้อมูลมากกว่าต้องให้ผลต่าง', caught > 0, `จับได้ ${caught}`);

  // ─────────── ๖. ความสอดคล้องภายใน บนข้อมูลจริง ───────────
  t('๖ ทุก OB อยู่ก่อนแท่งที่ทะลุ และอยู่หลัง swing ที่ถูกทะลุ',
    full.events.every((e) => !e.ob || (e.ob.index > e.swingIndex && e.ob.index < e.index)));
  t('๖ OB ขาขึ้นอยู่ใต้ราคาปิดตอนทะลุ / ขาลงอยู่เหนือ',
    full.events.every((e) => !e.ob || (e.dir === 1 ? e.ob.proximal < candles[e.index].close : e.ob.proximal > candles[e.index].close)));
  t('๖ BOS ปิดทะลุระดับจริงทุกครั้ง',
    full.events.every((e) => (e.dir === 1 ? candles[e.index].close > e.level : candles[e.index].close < e.level)));
  t('๖ กวาดทุกครั้ง ไส้ทะลุแต่ปิดไม่ทะลุ',
    full.sweeps.every((s) => (s.dir === -1
      ? candles[s.index].high > s.level && candles[s.index].close <= s.level
      : candles[s.index].low < s.level && candles[s.index].close >= s.level)));
  const kinds = { BOS: 0, CHoCH: 0 };
  for (const e of full.events) kinds[e.kind]++;
  // 1,600 แท่งแรกของ 1H ได้ BOS 20 · CHoCH 20 — เกณฑ์แค่พิสูจน์ว่าทั้งสองกิ่งทำงาน ไม่ใช่เป้าจำนวน
  t('๖ มีทั้ง BOS และ CHoCH บนข้อมูลจริง (ฟิลด์ไม่ตาย)', kinds.BOS >= 10 && kinds.CHoCH >= 10, JSON.stringify(kinds));
  t('๖ sweptBefore ไม่ตาย และทุกใบมีการกวาดจริงอยู่ในขา',
    full.events.some((e) => e.sweptBefore) &&
      full.events.filter((e) => e.sweptBefore).every((e) => full.sweeps.some((s) => s.dir === e.dir && s.index > e.swingIndex && s.index <= e.index)));
  t('๖ displacement ไม่ตาย (มีทั้งจริงและไม่จริง)',
    full.events.some((e) => e.ob?.displacement) && full.events.some((e) => e.ob && !e.ob.displacement));

  // ─────────── ๗. OB ที่ยังไม่ถูกทะลุ ───────────
  const act = activeOrderBlocks(candles, full);
  t('๗ OB ที่ยังใช้ได้ ไม่มีใบไหนถูกปิดทะลุขอบนอกแล้ว',
    act.every((ob) => candles.slice(ob.knownAt + 1).every((c) => (ob.dir === 1 ? c.close >= ob.distal : c.close <= ob.distal))));
}

// ─────────────────────────── ๘. ชุดสั้น/พิกล ───────────────────────────
t('๘ ชุดว่างไม่ระเบิด', analyzeSmc([]).events.length === 0);
t('๘ ชุดสั้นเกินคืนค่าว่าง', analyzeSmc(flat(100, 5)).swings.length === 0);
t('๘ ราคานิ่งสนิท ไม่มี swing ไม่มี event', (() => { const a = analyzeSmc(flat(100, 80)); return a.swings.length === 0 && a.events.length === 0; })());

console.log(`\nผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
