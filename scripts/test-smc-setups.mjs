#!/usr/bin/env node
/**
 * ชุดทดสอบกติกาเข้าไม้ SMC (src/lib/smc-setups.ts) — ด่านที่พิสูจน์ว่า "ตัวสแกนจริงส่งไม้เดียวกับที่ถูกวัด"
 *
 * ทำไมต้องมี: ผลวัด +0.109 R/ไม้ มีความหมายก็ต่อเมื่อ latestFvgTrendSetup (ตัวที่ตัวสแกนเรียก)
 * ออกไม้ตรงกับที่แล็บจำลองทุกตัวเลข ด่าน ๒ เล่นประวัติจริงซ้ำทีละแท่ง: ตัดชุดให้จบที่แท่งแตะ
 * แล้วส่งราคาเปิดของแท่งถัดไปเป็น "แท่งที่กำลังก่อตัว" — ต้องได้ entry/SL/TP เดียวกับไม้ของแล็บ
 * และแท่งที่แล็บไม่มีไม้ ตัวสแกนต้องไม่ออกสัญญาณ
 *
 * ใช้เฉพาะชุด train+validation (loadMeasurable) — ชุด test สงวนไว้ให้ smc-testset.mjs
 *
 * รัน: node scripts/test-smc-setups.mjs
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadSrcModules, ROOT } from './research/load-src-modules.mjs';
import { MAX_HOLD_BARS, loadMeasurable, createTradeSim, mulberry32 } from './research/trade-sim.mjs';
import { createSmcTrades } from './research/smc-trades.mjs';

const mods = await loadSrcModules(['src/lib/supply-demand.ts', 'src/lib/smc.ts', 'src/lib/costs.ts', 'src/lib/smc-setups.ts']);
const { analyzeSmc } = mods['smc'];
const { costRFor } = mods['costs'];
const SETUP = mods['smc-setups'];
const OPTS = { stopFloor: true, symbol: 'XAUUSD', market: 'GOLD' };

let pass = 0, fail = 0;
const t = (name, ok, d = '') => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${d ? ` — ${d}` : ''}`); } };
const mk = (o, h, l, c, i) => ({ timestamp: new Date(Date.UTC(2025, 0, 1) + i * 3600_000).toISOString(), open: o, high: h, low: l, close: c, volume: 1 });

console.log('ทดสอบกติกาเข้าไม้ SMC (smc-setups)\n');

// ─────────────────────────── ๑. กติกาพื้นฐาน ───────────────────────────
{
  const zone = { dir: 1, proximal: 100, distal: 98 };
  const base = Array.from({ length: 10 }, (_, i) => mk(105, 106, 104, 105, i));
  const bars = [...base, mk(105, 105.5, 99.5, 101, 10), mk(101.5, 104, 101, 103, 11)];
  t('๑ แตะครั้งแรกที่แท่ง 10', SETUP.firstTouch(bars, zone, 5, bars.length - 1) === 10);
  t('๑ lastIdx ตัดก่อนแท่งแตะ = ไม่เจอ', SETUP.firstTouch(bars, zone, 5, 9) === -1);
  const lv = SETUP.levelsFromZone(zone, 101.5, { ...OPTS, stopFloor: false });
  t('๑ SL พ้นขอบนอก 25% ของความสูง · TP = RR 2', lv && Math.abs(lv.stop - 97.5) < 1e-9 && Math.abs(lv.target - (101.5 + 2 * 4)) < 1e-9, JSON.stringify(lv));
  t('๑ ราคาเข้าต่ำกว่า SL แล้ว = ไม่มีไม้', SETUP.levelsFromZone(zone, 97, OPTS) === null);
  t('๑ ราคาเข้าไม่ใช่ตัวเลข = ไม่มีไม้', SETUP.levelsFromZone(zone, NaN, OPTS) === null);
  const floored = SETUP.levelsFromZone({ dir: 1, proximal: 4000, distal: 3999 }, 4000.5, OPTS);
  t('๑ ขยาย SL ถึงเพดานต้นทุน และรักษา RR 2', floored && floored.risk / 4000.5 >= 0.006 - 1e-12 &&
    Math.abs((floored.target - floored.entry) / floored.risk - 2) < 1e-9, JSON.stringify(floored));
  const broken = [...base, mk(105, 105, 97, 97.5, 10)];
  t('๑ แท่งที่แตะแล้วปิดทะลุขอบนอก = โซนพัง', SETUP.firstTouch(broken, zone, 5, broken.length - 1) === -1);
  const long = Array.from({ length: 80 }, (_, i) => mk(105, 106, 104, 105, i));
  long[5 + SETUP.SMC_SETUP_PARAMS.expiryBars + 1] = mk(105, 105, 99, 101, 5 + SETUP.SMC_SETUP_PARAMS.expiryBars + 1);
  t('๑ แตะหลังหมดอายุ = ไม่นับ', SETUP.firstTouch(long, zone, 5, long.length - 1) === -1);
  t('๑ ไม่มีแท่งที่กำลังก่อตัว = ตัวสแกนไม่ออกสัญญาณ', SETUP.latestFvgTrendSetup(bars, [], [], null, OPTS) === null);
}

// ─────── ๒. ตัวสแกนจริงออกไม้เดียวกับแล็บ — เล่นประวัติทองจริงซ้ำทีละแท่ง ───────
const cache = path.join(ROOT, '.research-cache', 'candles', 'GOLD__XAUUSD__1H.json');
if (!existsSync(cache)) {
  console.log('  … ข้ามด่าน ๒ (ไม่มีแคชทอง — CI)');
} else {
  const { bars } = loadMeasurable('1H');
  const sim = createTradeSim({ costRFor, symbol: 'XAUUSD', market: 'GOLD' });
  const { collectTrades } = createSmcTrades({ SETUP, sim, symbol: 'XAUUSD', market: 'GOLD', maxHoldBars: MAX_HOLD_BARS });
  const full = analyzeSmc(bars);
  const lab = collectTrades(bars, '1H', 'fvg-trend', true, full);
  const byTouch = new Map();
  for (const tr of lab) (byTouch.get(tr.touchIdx) ?? byTouch.set(tr.touchIdx, []).get(tr.touchIdx)).push(tr);

  // ย่อชุดให้เล่นได้เร็ว: สุ่มแท่งแตะ 120 แท่ง + แท่งที่ไม่มีไม้ 120 แท่ง (seed คงที่)
  const rnd = mulberry32(20260929);
  // แท่งที่หลาย FVG ถูกแตะพร้อมกันต้องอยู่ในชุดเสมอ — ไม่งั้นกติกาเลือกใบไม่ถูกตรวจเลย (สุ่มแล้วพลาดได้)
  const multiTouch = [...byTouch.keys()].filter((k) => byTouch.get(k).length > 1);
  const touches = [...new Set([...multiTouch, ...[...byTouch.keys()].sort(() => rnd() - 0.5).slice(0, 120)])];
  const quiet = [];
  while (quiet.length < 120) {
    const k = 300 + ((rnd() * (bars.length - 302)) | 0);
    if (!byTouch.has(k)) quiet.push(k);
  }
  const same = (a, b) => Math.abs(a - b) < 1e-9;
  let matched = 0, missing = 0, mismatch = 0, falseSignal = 0, multi = 0;
  const live = (k) => {
    const prefix = bars.slice(0, k + 1);
    const a = analyzeSmc(prefix);
    return SETUP.latestFvgTrendSetup(prefix, a.events, a.fvgs, bars[k + 1].open, OPTS);
  };
  for (const k of touches) {
    const s = live(k);
    if (!s) { missing++; continue; }
    // ต้องตรงกับไม้ของ FVG ที่เกิดล่าสุดในแท่งนั้น (กติกาเลือกของตัวสแกน) ไม่ใช่แค่ใบไหนก็ได้
    const want = byTouch.get(k).reduce((a, b) => (b.zoneKnownAt > a.zoneKnownAt ? b : a));
    const hit = same(want.spec.entry, s.levels.entry) && same(want.spec.stop, s.levels.stop) && same(want.spec.target, s.levels.target) &&
      s.fvg.knownAt === want.zoneKnownAt;
    if (hit) matched++; else mismatch++;
    if (byTouch.get(k).length > 1) multi++;
  }
  for (const k of quiet) if (live(k)) falseSignal++;
  t(`๒ ทุกแท่งที่แล็บมีไม้ ตัวสแกนออกสัญญาณ (${touches.length} แท่ง · หลายใบพร้อมกัน ${multiTouch.length})`, missing === 0, `ขาด ${missing}`);
  t('๒ entry/SL/TP ของตัวสแกนตรงกับไม้ของแล็บเป๊ะ', mismatch === 0 && matched === touches.length, `ตรง ${matched} · ไม่ตรง ${mismatch}`);
  t(`๒ แท่งที่แล็บไม่มีไม้ ตัวสแกนไม่ออกสัญญาณ (${quiet.length} แท่ง)`, falseSignal === 0, `ออกผิด ${falseSignal}`);
  t('๒ ด่านนี้ได้ตรวจของจริง', lab.length > 300 && touches.length >= 120, `แล็บ ${lab.length} ไม้`);
  t('๒ มีแท่งที่หลาย FVG ถูกแตะพร้อมกันให้ตรวจกติกาเลือก', multi > 0, `พบ ${multi} แท่ง`);
}

console.log(`\nผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
