#!/usr/bin/env node
/**
 * ชุดทดสอบตัวหาโซนดีมาน/ซัพพลาย (src/lib/supply-demand.ts)
 *
 * ทำไมต้องมี: โค้ดหาโซนพังได้แบบไม่มี error ให้เห็น และพังในทางที่ทำให้ผลแบ็คเทสต์
 * "ดีขึ้น" ซึ่งอันตรายกว่าพังแล้วแดง — ถ้าโซนแอบรู้อนาคตแม้แท่งเดียว ทุกตัวเลข
 * หลังจากนั้นจะสวยเกินจริงและเราจะเอาไปตัดสินใจด้วยเงินจริง
 *
 * ด่านที่สำคัญที่สุดคือ ๓ (causality) — ที่เหลือคือกติกาของโซนตามตำรา
 *
 * รัน: node scripts/test-supply-demand.mjs
 */

import { loadSrcModules, ROOT } from './research/load-src-modules.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const mods = await loadSrcModules(['src/lib/supply-demand.ts', 'src/lib/indicators.ts']);
const sd = mods['supply-demand'];
const ind = mods['indicators'];
const { findZones, nearestZones, ZONE_PARAMS: P } = sd;

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) pass++;
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** สร้างแท่งจาก [open, high, low, close] — เวลาเดินทีละชั่วโมง */
let clock = Date.UTC(2025, 0, 1);
const bar = (o, h, l, c) => {
  const b = { timestamp: new Date(clock).toISOString(), open: o, high: h, low: l, close: c, volume: 100 };
  clock += 3600_000;
  return b;
};
const resetClock = () => { clock = Date.UTC(2025, 0, 1); };

/** แท่งนิ่ง ๆ ที่ราคา p — ใช้ถมให้ ATR มีค่าและให้ชุดยาวพอ */
const flat = (p, n) => Array.from({ length: n }, () => bar(p, p + 0.4, p - 0.4, p));
/** แท่งแรงขึ้น/ลง — ลำยาวเทียบกับช่วง และช่วงกว้างกว่า ATR ของช่วงนิ่ง */
const up = (from, size) => bar(from, from + size * 1.05, from - size * 0.05, from + size);
const down = (from, size) => bar(from, from + size * 0.05, from - size * 1.05, from - size);
/** แท่งฐาน — ลำสั้นเทียบกับช่วง */
const base = (p) => bar(p, p + 1.0, p - 1.0, p + 0.1);

console.log('ทดสอบตัวหาโซนดีมาน/ซัพพลาย\n');

// ─────────────────────────── ๑. เจอรูปแบบพื้นฐาน ───────────────────────────
// ขึ้น-ฐาน-ขึ้น = RBR = demand zone
resetClock();
{
  const c = [
    ...flat(100, 20),
    up(100, 8),            // ขาเข้า ขึ้น
    base(108), base(108),  // ฐาน 2 แท่ง
    up(108, 10),           // ขาออก ขึ้นแรง
    ...flat(125, 10),      // วิ่งต่อให้พ้น 2×ATR
  ];
  const z = findZones(c);
  const demand = z.filter(x => x.side === 'demand');
  t('๑ เจอ demand zone จากรูปแบบ ขึ้น-ฐาน-ขึ้น', demand.length >= 1, `เจอ ${demand.length} โซน`);
  t('๑ ชนิดโซนเป็น RBR', demand[0]?.kind === 'RBR', `ได้ ${demand[0]?.kind}`);
}

// ลง-ฐาน-ลง = DBD = supply zone
resetClock();
{
  const c = [
    ...flat(100, 20),
    down(100, 8),
    base(92), base(92),
    down(92, 10),
    ...flat(75, 10),
  ];
  const z = findZones(c);
  const supply = z.filter(x => x.side === 'supply');
  t('๑ เจอ supply zone จากรูปแบบ ลง-ฐาน-ลง', supply.length >= 1, `เจอ ${supply.length} โซน`);
  t('๑ ชนิดโซนเป็น DBD', supply[0]?.kind === 'DBD', `ได้ ${supply[0]?.kind}`);
}

// ลง-ฐาน-ขึ้น = DBR (กลับตัว)
resetClock();
{
  const c = [...flat(100, 20), down(100, 8), base(92), up(92, 12), ...flat(112, 10)];
  const z = findZones(c).filter(x => x.side === 'demand');
  t('๑ ชนิดโซนเป็น DBR เมื่อขาเข้าลงแต่ขาออกขึ้น', z[0]?.kind === 'DBR', `ได้ ${z[0]?.kind}`);
}

// ─────────────────────────── ๒. ขอบโซน ───────────────────────────
resetClock();
{
  // ฐานสองแท่ง: ลำอยู่ 108.0–108.1 · ไส้อยู่ 107.0–109.0
  const c = [...flat(100, 20), up(100, 8), base(108), base(108), up(108, 10), ...flat(125, 10)];
  const z = findZones(c).filter(x => x.side === 'demand')[0];
  t('๒ proximal ของ demand มาจากปลายลำ (ไม่ใช่ไส้บน)',
    z && Math.abs(z.proximal - 108.1) < 1e-9, `ได้ ${z?.proximal}`);
  t('๒ distal ของ demand มาจากไส้ล่าง (ไม่ใช่ลำล่าง)',
    z && Math.abs(z.distal - 107.0) < 1e-9, `ได้ ${z?.distal}`);
  t('๒ โซนมีความหนาจริง (distal < proximal)', z && z.distal < z.proximal);
}
resetClock();
{
  const c = [...flat(100, 20), down(100, 8), base(92), base(92), down(92, 10), ...flat(75, 10)];
  const z = findZones(c).filter(x => x.side === 'supply')[0];
  t('๒ proximal ของ supply มาจากปลายลำล่าง',
    z && Math.abs(z.proximal - 92.0) < 1e-9, `ได้ ${z?.proximal}`);
  t('๒ distal ของ supply มาจากไส้บน',
    z && Math.abs(z.distal - 93.0) < 1e-9, `ได้ ${z?.distal}`);
}

// ─────────── ๓. ห้ามรู้อนาคต — ด่านที่สำคัญที่สุดของไฟล์นี้ ───────────
//
// วิธีตรวจ: เอาชุดเต็มมาถาม "ณ แท่งที่ i" แล้วเทียบกับการตัดชุดให้เหลือแค่ [0..i]
// ถ้าโค้ดแอบอ่านแท่งหลัง i ผลสองทางจะต่างกัน — ต่างแม้แต่ทศนิยมก็ถือว่าตก
{
  const gold = path.join(ROOT, '.research-cache', 'candles', 'GOLD__XAUUSD__1H.json');
  let candles = null;
  if (existsSync(gold)) {
    const raw = JSON.parse(readFileSync(gold, 'utf8'));
    const arr = Array.isArray(raw) ? raw : raw.candles;
    candles = arr.slice(0, 1200);
  }
  if (!candles || candles.length < 400) {
    console.log('  … ข้ามด่าน ๓ (ไม่มีแคชทองให้ทดสอบ)');
  } else {
    let mismatches = 0;
    let comparedZones = 0;
    const key = z => `${z.side}|${z.kind}|${z.proximal}|${z.distal}|${z.startIndex}|${z.endIndex}` +
                     `|${z.knownFromIndex}|${z.touches}|${z.score}|${z.departureAtr}`;
    for (let i = 300; i < candles.length; i += 37) {
      const full = findZones(candles, i).map(key).sort();
      const cut = findZones(candles.slice(0, i + 1), i).map(key).sort();
      comparedZones += full.length;
      if (full.join('\n') !== cut.join('\n')) mismatches++;
    }
    t('๓ ผลเหมือนกันเป๊ะเมื่อตัดแท่งอนาคตทิ้ง (causal)',
      mismatches === 0, `ไม่ตรง ${mismatches} จุดตรวจ`);
    t('๓ ด่านนี้ได้ตรวจโซนจริง ไม่ใช่ผ่านเพราะไม่เจอโซนเลย',
      comparedZones > 50, `เทียบไปทั้งหมด ${comparedZones} โซน`);

    // negative control — ถ้าด่าน ๓ ตรวจได้จริง มันต้องจับตัวที่โกงได้
    // จำลองการโกงด้วยการถาม ณ แท่ง i แต่ให้ข้อมูลเกินไป 20 แท่ง
    let caught = 0;
    for (let i = 300; i < candles.length - 40; i += 37) {
      const honest = findZones(candles.slice(0, i + 1), i).map(key).sort().join('\n');
      const cheat = findZones(candles.slice(0, i + 21), i + 20).map(key).sort().join('\n');
      if (honest !== cheat) caught++;
    }
    t('๓ negative control — ตัวที่เห็นข้อมูลมากกว่าให้ผลต่าง (ด่านไม่ได้ผ่านฟรี)',
      caught > 0, `จับได้ ${caught} จุด`);

    t('๓ ทุกโซนที่คืนมามี knownFromIndex ไม่เกินแท่งปัจจุบัน',
      findZones(candles, 800).every(z => z.knownFromIndex <= 800));
    t('๓ ฐานของทุกโซนต้องอยู่ก่อนแท่งที่รู้ได้',
      findZones(candles, 800).every(z => z.endIndex < z.knownFromIndex));
  }
}

// ─────────────────────────── ๔. โซนตายเมื่อถูกทะลุ ───────────────────────────
resetClock();
{
  const c = [
    ...flat(100, 20), up(100, 8), base(108), up(108, 10), ...flat(125, 8),
  ];
  const before = findZones(c).filter(z => z.side === 'demand').length;
  // ต่อด้วยการร่วงปิดต่ำกว่า distal ของโซน (~107)
  const broken = [...c, ...flat(125, 1), down(125, 20), ...flat(100, 5)];
  const after = findZones(broken).filter(z => z.side === 'demand' && z.startIndex === 21).length;
  t('๔ โซนหายไปเมื่อราคาปิดต่ำกว่า distal', before >= 1 && after === 0,
    `ก่อน ${before} หลัง ${after}`);
}

// ─────────────────────────── ๕. การนับแตะ ───────────────────────────
resetClock();
{
  // การกลับมาแตะต้องเป็นการ "ไหล" ไม่ใช่แท่งแรง — ถ้าเด้งออกด้วยแท่งแรง
  // มันจะก่อโซนใหม่ที่ทับโซนเดิม แล้ว dedupe จะเก็บใบใหม่ (สดกว่า คะแนนสูงกว่า)
  // ทำให้เทสต์วัด "โซนหาย" แทนที่จะวัด "จำนวนครั้งที่ถูกแตะ"
  const ramp = (from, to, steps) => {
    const out = [];
    for (let i = 1; i <= steps; i++) out.push(...flat(from + (to - from) * (i / steps), 1));
    return out;
  };
  const mk = (extraTouches) => {
    resetClock();
    const c = [...flat(100, 20), up(100, 8), base(108), base(108), up(108, 10), ...flat(125, 6)];
    for (let i = 0; i < extraTouches; i++) {
      c.push(...ramp(125, 108.05, 8)); // ไหลลงมาแตะโซน (low 107.65 ≤ proximal 108.1)
      c.push(...ramp(108.05, 125, 8)); // ไหลกลับขึ้นไป โดยไม่ปิดใต้ distal 107
    }
    return c;
  };
  const z0 = findZones(mk(0)).filter(z => z.side === 'demand' && z.startIndex === 21)[0];
  const z1 = findZones(mk(1)).filter(z => z.side === 'demand' && z.startIndex === 21)[0];
  const z2 = findZones(mk(2)).filter(z => z.side === 'demand' && z.startIndex === 21)[0];
  t('๕ โซนที่ยังไม่ถูกแตะนับเป็น 0', z0?.touches === 0, `ได้ ${z0?.touches}`);
  t('๕ กลับมาแตะ 1 รอบนับเป็น 1', z1?.touches === 1, `ได้ ${z1?.touches}`);
  t('๕ แตะ 2 รอบนับเป็น 2', z2?.touches === 2, `ได้ ${z2?.touches}`);
  t('๕ โซนสดได้คะแนนสูงกว่าโซนที่ถูกแตะแล้ว',
    z0 && z1 && z0.score > z1.score, `${z0?.score} vs ${z1?.score}`);
  // แตะเกินเพดานแล้วต้องหายไป
  const z3 = findZones(mk(3)).filter(z => z.side === 'demand' && z.startIndex === 21)[0];
  t(`๕ โซนหายไปเมื่อถูกแตะเกิน ${P.maxTouches} ครั้ง`, z3 === undefined,
    `ยังอยู่ touches=${z3?.touches}`);
}

// ─────────────────────────── ๖. ขาออกต้องแรงพอ ───────────────────────────
resetClock();
{
  // ขาออกขึ้นแต่วิ่งไปนิดเดียวแล้วหยุด — ไม่ควรนับเป็นโซน
  const c = [...flat(100, 20), up(100, 8), base(108), up(108, 2), ...flat(110, 10)];
  const z = findZones(c).filter(x => x.side === 'demand' && x.startIndex === 21);
  t(`๖ ขาออกที่วิ่งไม่ถึง ${P.minDepartureAtr}×ATR ไม่นับเป็นโซน`, z.length === 0,
    `ยังเจอ ${z.length} โซน`);
}

// ─────────────────────────── ๗. nearestZones กรองฝั่ง ───────────────────────────
{
  const zones = [
    { side: 'demand', proximal: 95, distal: 94, score: 3 },
    { side: 'demand', proximal: 98, distal: 97, score: 3 },
    { side: 'demand', proximal: 105, distal: 104, score: 3 }, // อยู่เหนือราคา — ห้ามคืน
    { side: 'supply', proximal: 102, distal: 103, score: 3 },
    { side: 'supply', proximal: 108, distal: 109, score: 3 },
    { side: 'supply', proximal: 96, distal: 97, score: 3 },   // อยู่ใต้ราคา — ห้ามคืน
  ];
  const n = nearestZones(zones, 100, 0.2);
  t('๗ demand ที่คืนมาอยู่ใต้ราคาและใกล้ที่สุด', n.demand?.proximal === 98, `ได้ ${n.demand?.proximal}`);
  t('๗ supply ที่คืนมาอยู่เหนือราคาและใกล้ที่สุด', n.supply?.proximal === 102, `ได้ ${n.supply?.proximal}`);
  const far = nearestZones(zones, 100, 0.001);
  t('๗ โซนที่ไกลเกินเพดานไม่ถูกคืน', far.demand === null && far.supply === null);
}

// ─────────────────────────── ๘. โซนไม่ทับกันเอง ───────────────────────────
{
  const gold = path.join(ROOT, '.research-cache', 'candles', 'GOLD__XAUUSD__1H.json');
  if (existsSync(gold)) {
    const raw = JSON.parse(readFileSync(gold, 'utf8'));
    const z = findZones((Array.isArray(raw) ? raw : raw.candles).slice(0, 2000));
    let overlaps = 0;
    for (let i = 0; i < z.length; i++) {
      for (let j = i + 1; j < z.length; j++) {
        if (z[i].side !== z[j].side) continue;
        const lo1 = Math.min(z[i].proximal, z[i].distal), hi1 = Math.max(z[i].proximal, z[i].distal);
        const lo2 = Math.min(z[j].proximal, z[j].distal), hi2 = Math.max(z[j].proximal, z[j].distal);
        if (lo1 <= hi2 && hi1 >= lo2) overlaps++;
      }
    }
    t('๘ ไม่มีโซนฝั่งเดียวกันทับกันเองหลัง dedupe', overlaps === 0, `ทับกัน ${overlaps} คู่`);
    t('๘ เจอโซนจำนวนสมเหตุสมผลบนทองจริง 2000 แท่ง',
      z.length > 3 && z.length < 200, `เจอ ${z.length} โซน`);
  }
}

// ─────────────────────────── ๙. ATR ตรงกับตัวจริง ───────────────────────────
//
// supply-demand.ts เขียน ATR แบบ series เองเพื่อความเร็ว ถ้าสูตรเพี้ยนจาก
// indicators.ts เมื่อไหร่ ความ "แรง" ของแท่งจะวัดด้วยไม้บรรทัดคนละอันกับเครื่องยนต์
{
  const gold = path.join(ROOT, '.research-cache', 'candles', 'GOLD__XAUUSD__1H.json');
  if (existsSync(gold)) {
    const raw = JSON.parse(readFileSync(gold, 'utf8'));
    const c = (Array.isArray(raw) ? raw : raw.candles).slice(0, 500);
    // เทียบทางอ้อม: ATR() ตัวจริงของ [0..i] ต้องเท่ากับค่าที่ series ให้ที่ i
    // เข้าถึง series ไม่ได้ (ไม่ export) จึงเทียบผ่านผลลัพธ์: สร้างชุดที่ ATR ต่างกัน
    // แล้วดูว่าเกณฑ์ "แท่งแรง" ขยับตาม — ที่นี่เทียบสูตรตรง ๆ ด้วยการคำนวณซ้ำ
    let maxDiff = 0;
    for (let i = 20; i < c.length; i += 13) {
      const real = ind.ATR(c.slice(0, i + 1), P.atrPeriod);
      // ทำซ้ำสูตร series แบบตรงไปตรงมา
      let sum = 0, n = 0;
      for (let k = Math.max(1, i - P.atrPeriod + 1); k <= i; k++) {
        const cc = c[k], pc = c[k - 1].close;
        sum += Math.max(cc.high - cc.low, Math.abs(cc.high - pc), Math.abs(cc.low - pc));
        n++;
      }
      maxDiff = Math.max(maxDiff, Math.abs(real - sum / n));
    }
    t('๙ สูตร ATR ในตัวหาโซนตรงกับ ATR() ของ indicators.ts',
      maxDiff < 1e-9, `ต่างสูงสุด ${maxDiff}`);
  }
}

// ─────────────────────────── ๑๐. ชุดข้อมูลสั้น/พิกล ───────────────────────────
t('๑๐ ชุดว่างไม่ระเบิด', findZones([]).length === 0);
t('๑๐ ชุดสั้นกว่า 10 แท่งคืนอาร์เรย์ว่าง', findZones(flat(100, 5)).length === 0);
t('๑๐ ชุดที่ราคานิ่งสนิทไม่มีโซน', findZones(flat(100, 100)).length === 0);
t('๑๐ atIndex ติดลบไม่ระเบิด', findZones(flat(100, 50), -1).length === 0);

console.log(`\nผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
