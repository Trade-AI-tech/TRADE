#!/usr/bin/env node
/**
 * smc-lab.mjs — วัดว่าเซ็ตอัพ SMC บนทองคำเข้าไม้แล้วได้อะไรจริง
 *
 * ═══ ทำไมมีไฟล์นี้ ═══════════════════════════════════════════════════════════════════
 * เจ้าของขอ (2026-09-28) "ใช้เทคนิค SMC ให้แม่นยำ" · เครื่องยนต์ที่ใช้อยู่ได้ −13.7 R จาก
 * 37 สัญญาณจริงตั้งแต่ 14 ก.ย. ก่อนจะเอา SMC ไปส่งแจ้งเตือนแทน ต้องรู้ก่อนว่ามันดีกว่าจริง
 *
 * ═══ แผนที่ล็อกไว้ก่อนรัน (ห้ามแก้หลังเห็นผล — แก้เมื่อไหร่ค่า p ทุกตัวไร้ความหมาย) ═══════
 *
 *   เซ็ตอัพ 4 แบบ (นิยามองค์ประกอบอยู่ใน src/lib/smc.ts)
 *     ob-bos         BOS แล้วราคาย้อนมาแตะ OB ของขานั้นครั้งแรก → เข้าตามทิศ BOS
 *     ob-bos-disp    เหมือนข้างบน แต่เฉพาะขาที่มี FVG ทิศเดียวกัน (วิ่งแรงจริง)
 *     fvg-trend      FVG ที่ทิศตรงกับโครงสร้าง ณ ตอนเกิด แล้วราคาย้อนมาแตะครั้งแรก
 *     sweep-choch    CHoCH ที่ขาเดียวกันเพิ่งกวาดสภาพคล่องฝั่งตรงข้าม → แตะ OB ครั้งแรก
 *
 *   การเข้า   สัญญาณเกิดตอนแท่งที่แตะ *ปิด* → เข้าที่ราคาเปิดแท่งถัดไป
 *             (ระบบแจ้งเตือนทำได้แค่นี้จริง — มันตั้ง limit order ให้ไม่ได้ และตัดความกำกวม
 *              ภายในแท่งทิ้งทั้งหมด ไม่ต้องพึ่งกติกา fromAbove/fromBelow)
 *   SL       พ้นขอบนอกของ OB/FVG ไปอีก 25% ของความสูงโซน (เท่ากับ zone-lab)
 *   TP       RR 1:2 ค่าเดียว (ขั้นต่ำที่ตำรา SMC ใช้ · ลดขนาดครอบครัวของ Holm)
 *   ถือสูงสุด 1H 24 แท่ง · 1D 20 แท่ง (เท่ากับตัวเก็บผลของระบบจริง)
 *   รุ่น      SL ตามโครงสร้างล้วน + ขยาย SL ตามชั้นนโยบาย production (applyStopFloor)
 *   หมดอายุ  ไม่ถูกแตะภายใน 50 แท่ง = ทิ้ง · ปิดทะลุขอบนอกก่อนแตะ = ทิ้ง
 *   ข้อมูล    XAUUSD 1H และ 1D ชุด train+validation — ชุด test ไม่ถูกโหลดเลย
 *   ทดสอบ    เซลล์ที่มีไม้ ≥ 30 เข้า Holm (cluster t ของ R สุทธิ) · น้อยกว่านั้นรายงานเฉย ๆ
 *
 * ═══ ตัวเทียบ ═══════════════════════════════════════════════════════════════════════
 *   กลับทิศ        จุดเข้าเดิม ทิศตรงข้าม
 *   สุ่มเวลาเข้า     แท่งสุ่ม ทิศ/ระยะ SL/RR เท่ากัน · 400 รอบ → p_สุ่ม
 *   สุ่มตามเทรนด์    แท่งสุ่ม *เฉพาะแท่งที่โครงสร้างชี้ทิศเดียวกับไม้* → p_เทรนด์
 *                   ตัวนี้สำคัญที่สุดสำหรับ SMC: เซ็ตอัพต่อเนื่องเทรนด์ส่วนใหญ่คือ "ตามเทรนด์"
 *                   ถ้า OB/FVG ไม่ได้ช่วย จุดเข้าที่ OB จะไม่ดีกว่าการเข้าตามเทรนด์เวลาไหนก็ได้
 *
 * รัน: node scripts/research/smc-lab.mjs            (ตาราง)
 *      node scripts/research/smc-lab.mjs --json
 *      node scripts/research/smc-lab.mjs --self-test
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadSrcModules, ROOT } from './load-src-modules.mjs';
import { holmFromEntries } from './holm.mjs';
import { MAX_HOLD_BARS, clusterStats, summarize, loadMeasurable, createTradeSim, mulberry32 } from './trade-sim.mjs';
import { createSmcTrades } from './smc-trades.mjs';

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const SELF_TEST = args.includes('--self-test');

const mods = await loadSrcModules(['src/lib/supply-demand.ts', 'src/lib/smc.ts', 'src/lib/costs.ts', 'src/lib/smc-setups.ts']);
const { analyzeSmc, SMC_PARAMS } = mods['smc'];
const { costRFor } = mods['costs'];
// กติกาเข้าไม้ทั้งหมดมาจากไฟล์เดียวกับที่ตัวสแกนจริงใช้ — เหตุผลอยู่หัวไฟล์ smc-setups.ts
const SETUP = mods['smc-setups'];

const SYMBOL = 'XAUUSD';
const MARKET = 'GOLD';
const { rr: RR, stopBuffer: STOP_BUFFER, expiryBars: EXPIRY_BARS } = SETUP.SMC_SETUP_PARAMS;
const MIN_TESTED_TRADES = 30;
const SEED = 20260928;
const NULL_ROUNDS = 400;
const SETUPS = ['ob-bos', 'ob-bos-disp', 'fvg-trend', 'sweep-choch'];

const sim = createTradeSim({ costRFor, symbol: SYMBOL, market: MARKET });

const trendSeries = SETUP.trendSeries;
// ไม้จำลองสร้างจากไฟล์เดียวกับที่ smc-testset.mjs ใช้ — ชุด test จึงวัดสิ่งเดียวกับแล็บเป๊ะ
const { firstTouch, tradeFromZone, collectTrades } = createSmcTrades({ SETUP, sim, symbol: SYMBOL, market: MARKET, maxHoldBars: MAX_HOLD_BARS });

// ─────────────────────────────── self-test ───────────────────────────────

if (SELF_TEST) {
  let pass = 0, fail = 0;
  const t = (name, ok, d = '') => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${d ? ` — ${d}` : ''}`); } };
  const mk = (o, h, l, c, i) => ({ timestamp: new Date(Date.UTC(2025, 0, 1) + i * 3600_000).toISOString(), open: o, high: h, low: l, close: c, volume: 1 });

  const zone = { dir: 1, proximal: 100, distal: 98 };
  const base = Array.from({ length: 10 }, (_, i) => mk(105, 106, 104, 105, i));
  {
    const bars = [...base, mk(105, 105.5, 99.5, 101, 10), mk(101.5, 104, 101, 103, 11), ...Array.from({ length: 30 }, (_, i) => mk(103, 104, 102, 103, 12 + i))];
    t('แตะ proximal ครั้งแรก = แท่งที่ 10', firstTouch(bars, zone, 5) === 10);
    const tr = tradeFromZone(bars, zone, 5, '1H', false, {});
    t('เข้าที่ราคาเปิดแท่งถัดจากแท่งที่แตะ (ไม่ใช่ที่ proximal)', tr?.spec.idx === 11 && tr.spec.entry === 101.5, JSON.stringify(tr?.spec));
    t("แท่งเข้าเป็น 'full' (ทั้งแท่งเกิดหลังเข้า)", tr?.spec.entryBar === 'full');
    t('SL อยู่พ้นขอบนอก 25% ของความสูง', Math.abs(tr.spec.stop - 97.5) < 1e-9, tr?.spec.stop);
    t('TP = RR 2', Math.abs(tr.spec.target - (101.5 + 2 * (101.5 - 97.5))) < 1e-9);
  }
  {
    const bars = [...base, mk(105, 105, 97, 97.5, 10), ...Array.from({ length: 30 }, (_, i) => mk(98, 99, 97, 98, 11 + i))];
    t('แท่งที่แตะแล้วปิดทะลุขอบนอก = ไม่มีไม้', tradeFromZone(bars, zone, 5, '1H', false, {}) === null);
  }
  {
    const bars = Array.from({ length: 80 }, (_, i) => mk(105, 106, 104, 105, i));
    t(`ไม่แตะภายใน ${EXPIRY_BARS} แท่ง = หมดอายุ`, firstTouch(bars, zone, 5) === -1);
  }
  {
    const bars = [...base, mk(105, 105, 99, 100, 10), mk(97, 98, 96, 97, 11), ...Array.from({ length: 30 }, (_, i) => mk(97, 98, 96, 97, 12 + i))];
    t('เปิดแท่งถัดไปต่ำกว่า SL ไปแล้ว = ไม่มีไม้', tradeFromZone(bars, zone, 5, '1H', false, {}) === null);
  }
  {
    const tr = trendSeries(6, [{ knownAt: 2, dir: 1 }, { knownAt: 4, dir: -1 }]);
    t('ทิศโครงสร้าง ณ แต่ละแท่งเปลี่ยนตรงแท่งที่รู้', JSON.stringify(tr) === JSON.stringify([0, 0, 1, 1, -1, -1]), JSON.stringify(tr));
  }
  // แคชแท่งไม่อยู่ใน git — บน CI ข้ามข้อนี้ ไม่ใช่แดง
  if (existsSync(path.join(ROOT, '.research-cache', 'candles', 'GOLD__XAUUSD__1H.json'))) {
    const { bars, cut } = loadMeasurable('1H');
    t('ไม่มีแท่งชุด test หลุดเข้ามา (1H)', bars.every((b) => Date.parse(b.timestamp) < cut));
  } else console.log('  … ข้ามการตรวจแคชจริง (ไม่มี .research-cache)');
  console.log(`self-test — ผ่าน ${pass} · ตก ${fail}`);
  process.exit(fail ? 1 : 0);
}

// ─────────────────────────────── รันจริง ───────────────────────────────

const report = { symbol: SYMBOL, rr: RR, stopBuffer: STOP_BUFFER, expiryBars: EXPIRY_BARS, smcParams: SMC_PARAMS, timeframes: {} };
const holmEntries = [];

for (const tf of Object.keys(MAX_HOLD_BARS)) {
  const { bars, dropped, validationEnd } = loadMeasurable(tf);
  const analysis = analyzeSmc(bars);
  const maxHold = MAX_HOLD_BARS[tf];
  const trend = trendSeries(bars.length, analysis.events);
  // แท่งที่เข้าได้ตามเทรนด์: เข้าที่ราคาเปิดแท่ง e → รู้ทิศ ณ ปิดแท่ง e−1
  const pool = { long: [], short: [] };
  for (let e = 31; e < bars.length - maxHold - 1; e++) {
    if (trend[e - 1] === 1) pool.long.push(e);
    else if (trend[e - 1] === -1) pool.short.push(e);
  }

  const kinds = { BOS: 0, CHoCH: 0 };
  for (const ev of analysis.events) kinds[ev.kind]++;
  const tfOut = {
    bars: bars.length, droppedTestBars: dropped, validationEnd,
    from: bars[0]?.timestamp, to: bars[bars.length - 1]?.timestamp,
    elements: { ...kinds, sweeps: analysis.sweeps.length, fvgs: analysis.fvgs.length, obs: analysis.events.filter((e) => e.ob).length },
    trendShare: { long: pool.long.length, short: pool.short.length },
    cells: {},
  };

  for (const setup of SETUPS) {
    for (const stopFloor of [false, true]) {
      const key = `${setup}${stopFloor ? '|SLกว้าง' : ''}`;
      const real = collectTrades(bars, tf, setup, stopFloor, analysis);
      if (!real.length) { tfOut.cells[key] = { n: 0 }; continue; }
      const seed = SEED + SETUPS.indexOf(setup) * 10_000 + (stopFloor ? 5000 : 0) + (tf === '1H' ? 0 : 777);
      const cell = {
        real: summarize(real),
        bySide: {
          long: summarize(real.filter((t) => t.side === 'long')),
          short: summarize(real.filter((t) => t.side === 'short')),
        },
        flipped: summarize(sim.flippedTrades(bars, real, maxHold)),
        randomNull: sim.randomNull(bars, real, maxHold, { rounds: NULL_ROUNDS, seed }),
        trendNull: sim.randomNull(bars, real, maxHold, { rounds: NULL_ROUNDS, seed: seed + 1, pool }),
        bootstrap: clusterStats(real),
        tested: real.length >= MIN_TESTED_TRADES,
      };
      tfOut.cells[key] = cell;
      if (cell.tested && cell.bootstrap?.pCluster != null) holmEntries.push({ key: `${tf}|${key}`, p: cell.bootstrap.pCluster });
    }
  }
  report.timeframes[tf] = tfOut;
}

report.holm = holmEntries.length ? holmFromEntries(holmEntries) : null;

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ─────────────────────────────── พิมพ์ผล ───────────────────────────────

const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '  n/a');
const r4 = (v) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(4) : '   n/a ');
const padR = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

console.log('\n═══ SMC บนทองคำ — วัดจากอดีตจริง (train+validation เท่านั้น) ═══');
console.log(`swing ${SMC_PARAMS.swingLength} แท่ง · FVG ≥ ${SMC_PARAMS.fvgMinAtr}×ATR · RR 1:${RR} · เข้าเปิดแท่งถัดจากแท่งที่แตะ · หมดอายุ ${EXPIRY_BARS} แท่ง`);

for (const [tf, o] of Object.entries(report.timeframes)) {
  console.log(`\n──────── ${tf} ── ${o.bars} แท่ง (${o.from?.slice(0, 10)} → ${o.to?.slice(0, 10)}) · ตัดชุด test ${o.droppedTestBars} แท่ง ────────`);
  console.log(`BOS ${o.elements.BOS} · CHoCH ${o.elements.CHoCH} · กวาด ${o.elements.sweeps} · FVG ${o.elements.fvgs} · OB ${o.elements.obs} · แท่งที่โครงสร้างขึ้น/ลง ${o.trendShare.long}/${o.trendShare.short}`);
  console.log(`  ${padR('เซ็ตอัพ', 22)} ${padL('ไม้', 4)} ${padL('TP', 6)} ${padL('SL', 6)} ${padL('R ก่อน', 8)} ${padL('ต้นทุน', 7)} ${padL('R สุทธิ', 8)} │ ${padL('กลับทิศ', 8)} ${padL('สุ่ม', 8)} ${padL('p', 5)} ${padL('ตามเทรนด์', 9)} ${padL('p', 5)}`);
  for (const [key, c] of Object.entries(o.cells)) {
    if (!c.real) { console.log(`  ${padR(key, 22)} ${padL(0, 4)}  — ไม่มีไม้`); continue; }
    const s = c.real;
    console.log(`  ${padR(key, 22)} ${padL(s.n, 4)} ${padL(pct(s.tp), 6)} ${padL(pct(s.sl), 6)} ${padL(r4(s.rGross), 8)} ${padL(s.costR.toFixed(3), 7)} ${padL(r4(s.rNet), 8)} │ ` +
      `${padL(r4(c.flipped?.rNet), 8)} ${padL(r4(c.randomNull.nullMean), 8)} ${padL(c.randomNull.p.toFixed(2), 5)} ${padL(r4(c.trendNull.nullMean), 9)} ${padL(c.trendNull.p.toFixed(2), 5)}` +
      (c.tested ? '' : '  (ไม้ไม่ถึง 30 — ไม่ทดสอบ)'));
  }
  for (const [key, c] of Object.entries(o.cells)) {
    if (!c.real || !c.bootstrap) continue;
    const b = c.bootstrap;
    console.log(`    ${padR(key, 20)} ช่วง 95% ${r4(b.lo95)} … ${r4(b.hi95)} · p ${b.pCluster == null ? 'n/a' : b.pCluster.toFixed(3)} · ซื้อ ${c.bySide.long?.n ?? 0} ไม้ ${r4(c.bySide.long?.rNet)} · ขาย ${c.bySide.short?.n ?? 0} ไม้ ${r4(c.bySide.short?.rNet)}`);
  }
}

if (report.holm) {
  console.log('\n──────── Holm–Bonferroni ────────');
  for (const e of report.holm.results ?? report.holm) console.log(`  ${padR(e.key, 30)} p=${e.p.toFixed(4)}  ${e.reject ? '✔ รอด' : '✘ ตก'}`);
}
console.log('\nวิธีอ่าน: เซ็ตอัพที่ใช้ได้ต้อง (1) R สุทธิเป็นบวกและรอด Holm และ (2) ดีกว่า "ตามเทรนด์" (p เล็ก)');
console.log('          ข้อ 2 บอกว่า OB/FVG ช่วยจริง ไม่ใช่แค่ได้อานิสงส์จากการเข้าตามเทรนด์\n');
