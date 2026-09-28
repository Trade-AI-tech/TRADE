#!/usr/bin/env node
/**
 * zone-lab.mjs — วัดว่าโซนดีมาน/ซัพพลายทำนายทิศทางได้จริงไหม บนทองคำ
 *
 * ─────────────────────────── คำถามที่ไฟล์นี้ตอบ ───────────────────────────
 * เจ้าของถามตรง ๆ ว่า "เมื่อเกิดรูปแบบกราฟนี้แล้ว โอกาสที่จะขึ้นหรือลงจะไปทางไหน
 * ในอดีตมากกว่ากัน" — ไฟล์นี้ตอบด้วยการนับ ไม่ใช่ด้วยทฤษฎี
 *
 * ทุกครั้งที่ราคากลับมาแตะขอบในของโซน สมมติว่าเข้าไม้ตามทิศที่ตำราบอก
 * (แตะ demand = ซื้อ · แตะ supply = ขาย) แล้วนับว่าชน TP ก่อนหรือ SL ก่อน
 *
 * ─────────────────────────── ตัวเทียบ (สำคัญกว่าตัวเลขหลัก) ───────────────────────────
 * ตัวเลข "ชนะ 55%" ไม่มีความหมายถ้าไม่รู้ว่าการเดาสุ่มได้เท่าไหร่ จึงวัดคู่กับ:
 *
 *   ๑ สุ่มเวลาเข้า — เข้าไม้ที่แท่งสุ่ม (ราคาเปิด) ทิศเดียวกัน ระยะ SL เท่ากัน จำนวนเท่ากัน
 *                   ทำซ้ำ 400 รอบเป็นการแจกแจงของ "ผลที่ได้จากความบังเอิญ" → ค่า p
 *   ๒ กลับทิศ     — จุดเข้าเดิมทุกอย่าง แต่สลับ ซื้อ↔ขาย
 *                   ถ้าโซนมีข้อมูลจริง ตัวนี้ต้องแย่กว่าตัวหลักอย่างชัดเจน
 *
 * ⚠ แก้ 2026-09-28: ตัวเทียบทั้งสองเคยลำเอียงเข้าข้างโซน — ตัวสุ่มเข้าที่ราคาปิดแต่ยังโดน
 *   SL จาก low ของแท่งเดียวกันที่เกิดก่อนเข้า · ตัวกลับทิศโดน SL ฝั่งบนในแท่งเข้าที่อาจเกิด
 *   ก่อนราคาลงมาแตะโซน · และ "สุ่มตำแหน่งโซน" ไม่ได้รอให้ราคากลับมาแตะอย่างที่คอมเมนต์เดิม
 *   อ้าง มันคือการสุ่มเวลาเข้าชุดที่สองเฉย ๆ (ถอดออกแล้ว) · กติกาแท่งเข้าที่ถูกต้องอยู่ใน
 *   trade-sim.mjs ซึ่งแล็บทุกตัวใช้ร่วมกัน · ไม้จริงของโซนไม่เปลี่ยนสักไม้
 *
 * ─────────────────────────── กติกาที่ไม่ยอมหย่อน ───────────────────────────
 * · ชุด test ถูกตัดทิ้งตั้งแต่ตอนโหลด และมี guard ที่ throw ถ้ามีแท่ง test หลุดเข้ามา
 * · โซนใช้ได้เฉพาะตั้งแต่ knownFromIndex เป็นต้นไป (findZoneCandidates การันตีให้แล้ว)
 * · แท่งที่กิน TP และ SL พร้อมกัน นับ SL ก่อนเสมอ — เลือกทางที่ผลออกมาแย่กว่า
 * · ต้นทุนคิดจาก costRFor() ตัวจริงใน src/lib/costs.ts ไม่ใช่ตัวเลขที่พิมพ์ซ้ำที่นี่
 * · bootstrap จับกลุ่มเป็น "เดือนปฏิทิน" ไม่ใช่ต่อไม้ เพราะไม้ในเดือนเดียวกันซ้อนทับ
 *   และเคลื่อนไปด้วยกัน การนับเป็นอิสระต่อไม้จะทำให้ค่า p เล็กเกินจริงหลายเท่า
 *
 * ─────────────────────────── สิ่งที่ไฟล์นี้ไม่ได้ทำ ───────────────────────────
 * ไม่ตัดสินใจแทน ไม่แก้เครื่องยนต์ ไม่เขียนอะไรลงฐานข้อมูล — พิมพ์ตัวเลขอย่างเดียว
 *
 * รัน: node scripts/research/zone-lab.mjs
 *      node scripts/research/zone-lab.mjs --json
 *      node scripts/research/zone-lab.mjs --self-test
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadSrcModules, ROOT } from './load-src-modules.mjs';
import { holmFromEntries } from './holm.mjs';
import { MAX_HOLD_BARS, mulberry32, clusterStats, summarize, loadMeasurable, createTradeSim } from './trade-sim.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const AS_JSON = has('--json');
const SELF_TEST = has('--self-test');

const mods = await loadSrcModules(['src/lib/supply-demand.ts', 'src/lib/costs.ts']);
const { findZoneCandidates, zoneStateAt, zoneScore, ZONE_PARAMS } = mods['supply-demand'];
const { costRFor, applyStopFloor } = mods['costs'];

const SYMBOL = 'XAUUSD';
const MARKET = 'GOLD';
/** SL วางพ้นขอบนอกไปอีกเท่าไหร่ของความหนาโซน — กันไส้ทิ่มพอดีเป๊ะ */
const STOP_BUFFER = 0.25;
/** TP เป็นกี่เท่าของระยะเสี่ยง — วัดหลายค่าเพราะแต่ละค่าตอบคนละคำถาม */
const RR_TARGETS = [1, 2, 3];
const SEED = 20260907;
const PERM_ROUNDS = 400;

const sim = createTradeSim({ costRFor, symbol: SYMBOL, market: MARKET });

// ─────────────────────────────── จำลองไม้ ───────────────────────────────

/**
 * เดินหน้าทีละแท่ง เก็บทุกครั้งที่ราคากลับมาแตะขอบในของโซน
 *
 * เข้าไม้ที่ราคา proximal เอง (สมมติว่าตั้ง limit ไว้ล่วงหน้า ซึ่งเป็นวิธีที่ตำราบอก)
 * ไม่ใช่ที่ราคาเปิดแท่งถัดไป เพราะการรอเปิดแท่งถัดไปคือคนละกลยุทธ์
 *
 * การแตะนับเมื่อแท่งก่อนหน้าอยู่นอกโซนทั้งแท่ง → ราคาวิ่ง *เข้าหา* โซนเสมอ
 * demand = ลงมาชน ('fromAbove') · supply = ขึ้นไปชน ('fromBelow') — ความหมายอยู่ใน trade-sim.mjs
 */
function collectTouchTrades(bars, tf, rr, { stopFloor = false } = {}) {
  const maxHold = MAX_HOLD_BARS[tf];
  const cands = findZoneCandidates(bars);
  const trades = [];

  for (const z of cands) {
    let touches = 0;
    let inside = false;
    for (let k = z.knownFromIndex + 1; k < bars.length; k++) {
      const c = bars[k];
      if (z.side === 'demand' ? c.close < z.distal : c.close > z.distal) break; // โซนตาย
      const isIn = z.side === 'demand' ? c.low <= z.proximal : c.high >= z.proximal;
      if (isIn && !inside) {
        touches++;
        if (touches > ZONE_PARAMS.maxTouches) break;

        const isLong = z.side === 'demand';
        const thickness = Math.abs(z.proximal - z.distal);
        const entry = z.proximal;
        let stop = isLong
          ? z.distal - thickness * STOP_BUFFER
          : z.distal + thickness * STOP_BUFFER;
        let risk = Math.abs(entry - stop);
        let target = isLong ? entry + rr * risk : entry - rr * risk;

        // ชั้นนโยบายของ production: ขยาย SL ให้ต้นทุนไม่เกินเพดาน แล้วขยับ TP
        // ตามสัดส่วนเพื่อรักษา RR — เรียกตัวจริงจาก src/lib/costs.ts ไม่เขียนซ้ำ
        if (stopFloor) {
          const f = applyStopFloor(entry, stop, target, SYMBOL, MARKET);
          // (ของเดิม `if (!f) continue;` ข้ามการอัปเดต inside ด้วย — applyStopFloor คืน null
          //  เฉพาะข้อมูลพัง ไม่เคยเกิดจริง แต่ถ้าเกิด การแตะครั้งถัดไปจะถูกนับผิด)
          if (f) {
            stop = f.stop_loss;
            target = f.take_profit;
            risk = Math.abs(entry - stop);
          }
        }

        const entryBar = isLong ? 'fromAbove' : 'fromBelow';
        const t = sim.toTrade(bars, { idx: k, entry, risk, rr, isLong, entryBar, stop, target }, maxHold, {
          tf, zoneSide: z.side, kind: z.kind,
          touchNo: touches,
          fresh: touches === 1,
          score: zoneScore(z, touches - 1),
          baseBars: z.baseBars,
          departureAtr: z.departureAtr,
        });
        if (t) trades.push(t);
      }
      inside = isIn;
    }
  }
  return trades;
}


// ─────────────────────────────── self-test ───────────────────────────────
//
// ตัวจำลองไม้ (กติกาแท่งเข้า · SL ก่อน TP · timeout · สถิติ) ทดสอบใน scripts/test-trade-sim.mjs
// ที่นี่ตรวจเฉพาะสิ่งที่เป็นของโซน และการต่อสายเข้าตัวจำลองให้ถูกทิศ

if (SELF_TEST) {
  let pass = 0, fail = 0;
  const t = (name, ok, d = '') => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${d ? ` — ${d}` : ''}`); } };
  const mk = (o, h, l, c, i = 0) => ({ timestamp: new Date(Date.UTC(2025, 0, 1) + i * 3600_000).toISOString(), open: o, high: h, low: l, close: c, volume: 1 });

  // การนับแตะไม่ซ้ำภายในการแตะครั้งเดียว
  {
    const bars = [];
    for (let i = 0; i < 40; i++) bars.push(mk(100, 100.4, 99.6, 100, i));
    const z = { side: 'demand', proximal: 100.2, distal: 99, knownFromIndex: 0 };
    const st = zoneStateAt(bars, z, 39);
    t('ราคาค้างในโซนหลายแท่งนับเป็นการแตะครั้งเดียว', st.touches === 1, `ได้ ${st.touches}`);
  }
  // ไม้ demand ห้ามได้ TP จาก high ของแท่งเข้า (บั๊กที่วัดเจอจริง: +0.2172 R ปลอม)
  {
    const bars = [mk(100, 100, 100, 100, 0), mk(100, 115, 99, 100, 1), mk(100, 101, 99.5, 100, 2)];
    const tr = sim.toTrade(bars, { idx: 1, entry: 100, risk: 10, rr: 1, isLong: true, entryBar: 'fromAbove' }, 5);
    t('แท่งที่เข้าไม้ demand ห้ามนับ TP', tr.reason !== 'tp', `ได้ ${tr.reason}`);
  }
  // collectTouchTrades ต้องส่งทิศแท่งเข้าที่ถูกต้อง — ถ้ามีใครเปลี่ยนเป็น 'full' ผลบวกปลอมจะกลับมา
  {
    const src = (await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8');
    t("ไม้ demand ใช้ fromAbove · supply ใช้ fromBelow", src.includes("const entryBar = isLong ? 'fromAbove' : 'fromBelow';"));
  }
  // ต้นทุนโตเมื่อ SL แคบลง
  {
    const wide = costRFor(4000, 3960, SYMBOL, MARKET);
    const tight = costRFor(4000, 3990, SYMBOL, MARKET);
    t('SL แคบลง → ต้นทุนต่อ R สูงขึ้น', tight > wide, `${tight} vs ${wide}`);
  }
  // guard ชุด test
  {
    let threw = false;
    try { loadMeasurable('1D', 'ไฟล์ที่ไม่มีอยู่จริง.json'); } catch { threw = true; }
    t('โหลดแคชที่ไม่มีต้องระเบิด ไม่ใช่ได้ชุดว่าง', threw);
    // แคชแท่งไม่อยู่ใน git (หลายร้อย MB) — บน CI ข้ามข้อนี้ ไม่ใช่แดง
    if (fs.existsSync(path.join(ROOT, '.research-cache', 'candles', 'GOLD__XAUUSD__1D.json'))) {
      const { bars, cut } = loadMeasurable('1D');
      t('ไม่มีแท่งชุด test หลุดเข้ามา', bars.every((b) => Date.parse(b.timestamp) < cut));
    } else console.log('  … ข้ามการตรวจแคชจริง (ไม่มี .research-cache)');
  }

  console.log(`self-test — ผ่าน ${pass} · ตก ${fail}`);
  process.exit(fail ? 1 : 0);
}


// ─────────────────────────────── รันจริง ───────────────────────────────

const report = { symbol: SYMBOL, params: ZONE_PARAMS, stopBuffer: STOP_BUFFER, timeframes: {} };
const holmEntries = [];

for (const tf of Object.keys(MAX_HOLD_BARS)) {
  const { bars, dropped, validationEnd } = loadMeasurable(tf);
  const cands = findZoneCandidates(bars);
  const tfOut = {
    bars: bars.length,
    droppedTestBars: dropped,
    validationEnd,
    from: bars[0]?.timestamp,
    to: bars[bars.length - 1]?.timestamp,
    zonesFormed: cands.length,
    zonesByKind: {},
    rr: {},
  };
  for (const k of ['RBR', 'DBR', 'DBD', 'RBD']) tfOut.zonesByKind[k] = cands.filter(z => z.kind === k).length;

  for (const rr of RR_TARGETS) {
    const real = collectTouchTrades(bars, tf, rr);
    if (!real.length) { tfOut.rr[rr] = { note: 'ไม่มีไม้' }; continue; }

    const maxHold = MAX_HOLD_BARS[tf];
    const flipped = sim.flippedTrades(bars, real, maxHold);
    const permutation = sim.randomNull(bars, real, maxHold, { rounds: PERM_ROUNDS, seed: SEED + rr * 1000 });
    // ชุดตัวอย่างหนึ่งชุดของการสุ่ม (seed เดียวกับรอบแรกของการแจกแจง) ไว้แสดงเป็นแถวในตาราง
    const randOne = sim.randomEntryTrades(bars, real, maxHold, mulberry32(SEED + rr * 1000));

    // ทางเลือกที่อาจพลิกผล: ขยาย SL ตามชั้นนโยบายของ production ให้ต้นทุนถูกลง
    const floored = collectTouchTrades(bars, tf, rr, { stopFloor: true });

    const stats = clusterStats(real);
    const statsFloor = floored.length ? clusterStats(floored) : null;
    const cell = {
      real: summarize(real),
      stopFloor: summarize(floored),
      stopFloorBootstrap: statsFloor,
      flipped: summarize(flipped),
      randomEntry: summarize(randOne),
      permutation,
      bootstrap: stats,
      byFreshness: {
        fresh: summarize(real.filter(t => t.fresh)),
        tested: summarize(real.filter(t => !t.fresh)),
      },
      byKind: Object.fromEntries(['RBR', 'DBR', 'DBD', 'RBD'].map(k => [k, summarize(real.filter(t => t.kind === k))])),
      bySide: {
        demand: summarize(real.filter(t => t.zoneSide === 'demand')),
        supply: summarize(real.filter(t => t.zoneSide === 'supply')),
      },
    };
    tfOut.rr[rr] = cell;
    // ครอบครัวของ Holm ต้องรวมทุกอย่างที่ทดสอบจริง รวมทั้งแบบขยาย SL
    // การไม่นับมันเข้าไปคือการซ่อนจำนวนครั้งที่ยิง แล้วค่า p จะดูดีเกินจริง
    if (stats?.pCluster != null) holmEntries.push({ key: `${tf}|RR${rr}`, p: stats.pCluster });
    if (statsFloor?.pCluster != null) holmEntries.push({ key: `${tf}|RR${rr}|SLกว้าง`, p: statsFloor.pCluster });
  }
  report.timeframes[tf] = tfOut;
}

report.holm = holmEntries.length ? holmFromEntries(holmEntries) : null;

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ─────────────────────────────── พิมพ์ผล ───────────────────────────────

const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : ' n/a ');
const r4 = (v) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(4) : '  n/a ');
const padR = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

console.log('\n═══ โซนดีมาน/ซัพพลายบนทองคำ — วัดจากอดีตจริง ═══\n');
console.log(`พารามิเตอร์: ขาออก ≥ ${ZONE_PARAMS.minDepartureAtr}×ATR ใน ${ZONE_PARAMS.departureBars} แท่ง · ฐาน ≤ ${ZONE_PARAMS.maxBaseBars} แท่ง · SL พ้นขอบนอก ${STOP_BUFFER * 100}% ของความหนา`);

for (const [tf, o] of Object.entries(report.timeframes)) {
  console.log(`\n──────── ${tf} ─────────────────────────────────────────────────────`);
  console.log(`แท่งที่ใช้ ${o.bars} (${o.from?.slice(0, 10)} → ${o.to?.slice(0, 10)}) · ตัดชุด test ทิ้ง ${o.droppedTestBars} แท่ง`);
  console.log(`โซนที่ก่อตัว ${o.zonesFormed} ใบ — ` +
    Object.entries(o.zonesByKind).map(([k, v]) => `${k} ${v}`).join(' · '));

  for (const rr of RR_TARGETS) {
    const c = o.rr[rr];
    if (!c || c.note) { console.log(`\n  RR 1:${rr} — ${c?.note ?? 'ไม่มีข้อมูล'}`); continue; }
    console.log(`\n  RR 1:${rr}  (${c.real.n} ไม้ · ระยะ SL เฉลี่ย ${pct(c.real.stopPct)} ของราคา · ถือเฉลี่ย ${c.real.heldBars.toFixed(1)} แท่ง)`);
    console.log(`    ${padR('', 14)} ${padL('ชน TP', 7)} ${padL('ชน SL', 7)} ${padL('หมดเวลา', 8)} ${padL('R ก่อนต้นทุน', 13)} ${padL('ต้นทุน', 8)} ${padL('R สุทธิ', 9)}`);
    const row = (label, s) => {
      if (!s) { console.log(`    ${padR(label, 14)} ${padL('—', 7)}`); return; }
      console.log(`    ${padR(label, 14)} ${padL(pct(s.tp), 7)} ${padL(pct(s.sl), 7)} ${padL(pct(s.timeout), 8)} ${padL(r4(s.rGross), 13)} ${padL(s.costR.toFixed(4), 8)} ${padL(r4(s.rNet), 9)}`);
    };
    row('โซนจริง', c.real);
    row('+ ขยาย SL', c.stopFloor);
    row('กลับทิศ', c.flipped);
    row('สุ่มเวลาเข้า', c.randomEntry);

    const pm = c.permutation;
    if (pm?.nullMean != null) {
      console.log(`    สุ่มเวลาเข้า ${pm.rounds} รอบ: R สุทธิเฉลี่ย ${r4(pm.nullMean)} · เพดาน 95% ${r4(pm.null95)}`);
    }
    const b = c.bootstrap;
    if (b) {
      console.log(`    ช่วงความเชื่อมั่น 95% ของ R สุทธิ: ${r4(b.lo95)} … ${r4(b.hi95)}  (จับกลุ่ม ${b.months} เดือน)`);
      console.log(`    p (bootstrap) ${b.pBoot.toFixed(3)} · p (cluster t) ${b.pCluster == null ? 'n/a' : b.pCluster.toFixed(3)} · p (permutation) ${c.permutation.p?.toFixed(3) ?? 'n/a'}`);
    }
    const bf = c.stopFloorBootstrap;
    if (bf) {
      console.log(`    แบบขยาย SL — ช่วง 95%: ${r4(bf.lo95)} … ${r4(bf.hi95)} · p (bootstrap) ${bf.pBoot.toFixed(3)} · p (cluster t) ${bf.pCluster == null ? 'n/a' : bf.pCluster.toFixed(3)}`);
    }
    const f = c.byFreshness;
    if (f.fresh && f.tested) {
      console.log(`    โซนสด ${f.fresh.n} ไม้ → ${r4(f.fresh.rNet)} R  ·  โซนที่เคยถูกแตะ ${f.tested.n} ไม้ → ${r4(f.tested.rNet)} R`);
    }
    const s = c.bySide;
    if (s.demand && s.supply) {
      console.log(`    ฝั่งซื้อ (demand) ${s.demand.n} ไม้ → ${r4(s.demand.rNet)} R  ·  ฝั่งขาย (supply) ${s.supply.n} ไม้ → ${r4(s.supply.rNet)} R`);
    }
    const kinds = Object.entries(c.byKind).filter(([, v]) => v && v.n >= 20);
    if (kinds.length) {
      console.log(`    แยกตามรูปแบบ: ` + kinds.map(([k, v]) => `${k} ${v.n} ไม้ ${r4(v.rNet)}`).join(' · '));
    }
  }
}

if (report.holm) {
  console.log('\n──────── Holm–Bonferroni (คุมความผิดพลาดจากการทดสอบหลายครั้ง) ────────');
  for (const e of report.holm.results ?? report.holm) {
    console.log(`  ${padR(e.key, 12)} p=${e.p.toFixed(4)}  ${e.reject ? '✔ รอด' : '✘ ตก'}`);
  }
}

console.log('\nวิธีอ่าน: แถว "โซนจริง" ต้องดีกว่า "สุ่มเวลาเข้า" อย่างชัดเจน (p permutation เล็ก)');
console.log('          และ R สุทธิต้องเป็นบวกหลังหักต้นทุนแล้ว ไม่ใช่แค่ก่อนหัก');
console.log('          ช่วงความเชื่อมั่นที่คร่อมศูนย์ = ยังแยกไม่ออกจากความบังเอิญ\n');
