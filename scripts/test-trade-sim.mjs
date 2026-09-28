#!/usr/bin/env node
/**
 * ชุดทดสอบตัวจำลองไม้ที่ห้องแล็บทุกตัวใช้ร่วมกัน (scripts/research/trade-sim.mjs)
 *
 * ทำไมต้องมี: กติกาแท่งเข้าไม้คือสิ่งที่ตัดสินผลการวิจัยทั้งหมดของโปรเจกต์นี้
 *   · zone-lab รอบแรกได้ +0.2172 R รอด Holm เพราะนับ TP ในแท่งเข้า → ผลบวกหายหมดเมื่อแก้
 *   · ตัวเทียบของ zone-lab เข้าที่ราคาปิดแต่โดน SL จาก low ของแท่งเดียวกัน → โซน "ชนะ" เกินจริงสามเท่า
 * ทั้งสองเป็นบั๊กที่ไม่มี error และทำให้ผล "ดีขึ้น" — ด่านนี้ต้องแดงทันทีถ้าใครแตะกติกา
 *
 * รัน: node scripts/test-trade-sim.mjs
 */

import {
  simulate, createTradeSim, clusterStats, summarize, mulberry32, ENTRY_BAR_MODES,
} from './research/trade-sim.mjs';

let pass = 0, fail = 0;
const t = (name, ok, d = '') => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${d ? ` — ${d}` : ''}`); } };
const mk = (o, h, l, c, i = 0) => ({ timestamp: new Date(Date.UTC(2025, 0, 1) + i * 3600_000).toISOString(), open: o, high: h, low: l, close: c, volume: 1 });
const seq = (...rows) => rows.map((r, i) => mk(...r, i));

console.log('ทดสอบตัวจำลองไม้ (trade-sim)\n');

// ─────────── ๑. 'full' — เข้าที่ราคาเปิด ทั้งแท่งเกิดหลังเข้า ───────────
{
  const bars = seq([100, 100, 100, 100], [100, 115, 99, 112]);
  const s = simulate(bars, 1, true, 100, 90, 110, 5, 'full');
  t("๑ 'full' นับ TP ในแท่งเข้าได้ (ทั้งแท่งเกิดหลังราคาเปิด)", s.reason === 'tp' && Math.abs(s.r - 1) < 1e-9, JSON.stringify(s));
  const both = simulate(seq([100, 100, 100, 100], [100, 130, 70, 100]), 1, true, 100, 90, 110, 5, 'full');
  t("๑ 'full' แท่งที่กินทั้ง TP และ SL นับ SL ก่อน", both.reason === 'sl', both.reason);
  t('๑ ค่าเริ่มต้นคือ full', simulate(bars, 1, true, 100, 90, 110, 5).reason === 'tp');
}

// ─────────── ๒. 'fromAbove' — ราคาลงมาชนจุดเข้า: แท่งเข้าเห็นได้แค่ฝั่งล่าง ───────────
{
  const bars = seq([100, 100, 100, 100], [100, 115, 99, 100], [100, 101, 99.5, 100]);
  t("๒ fromAbove + BUY: ห้ามนับ TP ในแท่งเข้า (บั๊ก +0.2172 R)", simulate(bars, 1, true, 100, 90, 110, 5, 'fromAbove').reason !== 'tp');
  t("๒ fromAbove + BUY: SL ในแท่งเข้ายังนับ (low เกิดหลังชนแน่)",
    simulate(seq([100, 100, 100, 100], [100, 101, 85, 95]), 1, true, 100, 90, 110, 5, 'fromAbove').reason === 'sl');
  // กลับทิศที่จุดเดียวกัน: SELL ที่ราคาลงมาชน — TP อยู่ล่าง (เห็นได้) SL อยู่บน (อาจเกิดก่อนชน)
  t("๒ fromAbove + SELL: TP ฝั่งล่างนับได้ในแท่งเข้า",
    simulate(seq([100, 100, 100, 100], [100, 101, 88, 95]), 1, false, 100, 110, 90, 5, 'fromAbove').reason === 'tp');
  t("๒ fromAbove + SELL: ห้ามนับ SL ฝั่งบนในแท่งเข้า (บั๊กตัวเทียบกลับทิศของ zone-lab)",
    simulate(seq([100, 100, 100, 100], [100, 115, 99.5, 100], [100, 101, 99.5, 100]), 1, false, 100, 110, 90, 5, 'fromAbove').reason !== 'sl');
}

// ─────────── ๓. 'fromBelow' — กระจกของข้อ ๒ ───────────
{
  t("๓ fromBelow + SELL: ห้ามนับ TP ฝั่งล่างในแท่งเข้า",
    simulate(seq([100, 100, 100, 100], [100, 101, 85, 100], [100, 101, 99.5, 100]), 1, false, 100, 110, 90, 5, 'fromBelow').reason !== 'tp');
  t("๓ fromBelow + SELL: SL ฝั่งบนนับได้ในแท่งเข้า",
    simulate(seq([100, 100, 100, 100], [100, 115, 99, 105]), 1, false, 100, 110, 90, 5, 'fromBelow').reason === 'sl');
  t("๓ fromBelow + BUY: TP ฝั่งบนนับได้ในแท่งเข้า",
    simulate(seq([100, 100, 100, 100], [100, 112, 99, 105]), 1, true, 100, 90, 110, 5, 'fromBelow').reason === 'tp');
  t("๓ fromBelow + BUY: ห้ามนับ SL ฝั่งล่างในแท่งเข้า",
    simulate(seq([100, 100, 100, 100], [100, 101, 85, 100], [100, 101, 99.5, 100]), 1, true, 100, 90, 110, 5, 'fromBelow').reason !== 'sl');
  let threw = false;
  try { simulate(seq([1, 1, 1, 1], [1, 1, 1, 1]), 1, true, 1, 0.5, 2, 5, 'อะไรก็ได้'); } catch { threw = true; }
  t('๓ โหมดที่ไม่รู้จักต้องระเบิด ไม่ใช่ตกไปใช้ full เงียบ ๆ', threw && ENTRY_BAR_MODES.length === 3);
}

// ─────────── ๔. หมดเวลา / ข้อมูลหมด ───────────
{
  const s = simulate(seq([100, 100, 100, 100], [100, 101, 99, 100], [100, 101, 99, 105], [100, 101, 99, 100]), 1, true, 100, 90, 130, 2, 'full');
  t('๔ ครบเพดานถือแล้วปิดที่ราคาปิด', s.reason === 'timeout' && Math.abs(s.r - 0.5) < 1e-9, JSON.stringify(s));
  const e = simulate(seq([100, 100, 100, 100], [100, 101, 99, 103]), 1, true, 100, 90, 130, 5, 'full');
  t('๔ ข้อมูลหมดก่อนเพดาน = dataEnd ไม่ใช่ timeout', e.reason === 'dataEnd', e.reason);
}

// ─────────── ๕. createTradeSim — ต้นทุน · กลับทิศ · สุ่ม ───────────
{
  const costRFor = (entry, stop) => (0.0003 * entry) / Math.abs(entry - stop);
  const sim = createTradeSim({ costRFor, symbol: 'X', market: 'M' });
  const bars = [];
  for (let i = 0; i < 200; i++) bars.push(mk(100 + Math.sin(i / 5), 101 + Math.sin(i / 5), 99 + Math.sin(i / 5), 100 + Math.sin((i + 1) / 5), i));

  const tr = sim.toTrade(bars, { idx: 50, entry: 100, risk: 1, rr: 2, isLong: true, entryBar: 'fromAbove' }, 10);
  t('๕ R สุทธิ = R ก่อนต้นทุน − ต้นทุน', Math.abs(tr.rNet - (tr.rGross - tr.costR)) < 1e-12 && tr.costR > 0);
  t('๕ ใช้ stop/target ที่ผู้เรียกส่งมาถ้ามี',
    sim.toTrade(bars, { idx: 50, entry: 100, risk: 1, rr: 2, isLong: true, stop: 95, target: 101 }, 10).costR === costRFor(100, 95));

  const real = [tr, sim.toTrade(bars, { idx: 80, entry: 100.5, risk: 1.2, rr: 2, isLong: false, entryBar: 'fromBelow', stop: 101.7, target: 98.1 }, 10)];
  const flip = sim.flippedTrades(bars, real, 10);
  t('๕ กลับทิศ: จุดเข้า ระยะเสี่ยง และกติกาแท่งเข้าเดิม ทิศตรงข้าม',
    flip.length === 2 && flip.every((f, i) => f.spec.idx === real[i].spec.idx && f.spec.entry === real[i].spec.entry &&
      f.spec.risk === real[i].spec.risk && f.spec.entryBar === real[i].spec.entryBar && f.side !== real[i].side));
  t('๕ กลับทิศ: ไม่ยืม stop ของทิศเดิมมาใช้', flip[1].costR === costRFor(100.5, 100.5 - 1.2));

  const rnd = sim.randomEntryTrades(bars, real, 10, mulberry32(7));
  t('๕ สุ่มเวลาเข้า: เข้าที่ราคาเปิดของแท่งที่สุ่มได้ (ไม่ใช่ราคาปิด)',
    rnd.every((r) => r.spec.entry === bars[r.spec.idx].open && r.spec.entryBar === 'full'));
  t('๕ สุ่มเวลาเข้า: ทิศ ระยะ SL และ RR ตรงกับไม้จริง',
    rnd.every((r, i) => r.side === real[i].side && Math.abs(r.stopPct - real[i].stopPct) < 1e-12 && r.rr === real[i].rr));
  const pool = { long: [120, 121], short: [150] };
  const pooled = sim.randomEntryTrades(bars, real, 10, mulberry32(9), pool);
  t('๕ สุ่มเฉพาะใน pool ที่ให้มา', pooled[0].spec.idx >= 120 && pooled[0].spec.idx <= 121 && pooled[1].spec.idx === 150);

  const n1 = sim.randomNull(bars, real, 10, { rounds: 30, seed: 5 });
  const n2 = sim.randomNull(bars, real, 10, { rounds: 30, seed: 5 });
  t('๕ การแจกแจงของการสุ่มทำซ้ำได้ด้วย seed เดิม', JSON.stringify(n1) === JSON.stringify(n2) && n1.rounds === 30);
  t('๕ ค่า p อยู่ในช่วง (0, 1]', n1.p > 0 && n1.p <= 1);
  t('๕ summarize นับสัดส่วนครบ 100%', (() => { const s = summarize(rnd); return Math.abs(s.tp + s.sl + s.timeout - 1) < 1e-9; })());
}

// ─────────── ๖. สถิติจับกลุ่มรายเดือน ───────────
{
  const trades = Array.from({ length: 200 }, (_, i) => ({ rNet: 1, month: `2025-${String((i % 12) + 1).padStart(2, '0')}` }));
  t('๖ ชุดที่บวกล้วนได้ช่วงความเชื่อมั่นไม่คร่อมศูนย์', clusterStats(trades, { B: 200 }).lo95 > 0);
  const mixed = trades.map((x, i) => ({ ...x, rNet: i % 2 ? 1 : -1 }));
  t('๖ ชุดที่ค่ากลางเป็นศูนย์ได้ p สูง', clusterStats(mixed, { B: 200 }).pBoot > 0.2);
  // ไม้ 100 ไม้ในเดือนเดียวต้องนับเป็นหลักฐานชิ้นเดียว ไม่ใช่ 100 ชิ้น
  const oneMonth = Array.from({ length: 100 }, () => ({ rNet: 1, month: '2025-01' }));
  t('๖ ไม้ทั้งหมดอยู่เดือนเดียว → จับกลุ่มได้ 1 กลุ่ม และไม่มีค่า p แบบ t', (() => { const s = clusterStats(oneMonth, { B: 100 }); return s.months === 1 && s.pCluster === null; })());
}

console.log(`ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
