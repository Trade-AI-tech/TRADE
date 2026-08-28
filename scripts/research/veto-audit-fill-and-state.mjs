#!/usr/bin/env node
/**
 * veto-audit-fill-and-state.mjs — ตรวจสามมุมที่ veto-audit-causality.mjs ยังไม่แยกออกมาชัด
 * (ไฟล์ใหม่ ไม่แตะของเดิม)
 *
 * T8 · แท่งที่ใช้เข้าไม้ (t+1) มีสิทธิ์เปลี่ยน "การตัดสินใจ" ไหม
 *      ทฤษฎีบอกว่าไม่ได้ เพราะ engine เห็นแค่ prefix ถึง t และวีโต้ไม่อ่านเกิน t (พิสูจน์ใน T2/T4)
 *      แต่ข้อสรุปนั้นมาจากการประกอบเหตุผลสองชั้น จึงยิงตรง ๆ อีกรอบ: แก้เฉพาะแท่ง t+1
 *      แล้วทุกอย่างที่เป็น "การตัดสินใจ" ต้องนิ่งสนิท เปลี่ยนได้แค่ราคาที่ถูกเติมเท่านั้น
 *
 * T9 · prefix ที่โตทีละแท่ง (ใช้อาเรย์ก้อนเดิม) ให้ผลเท่ากับการ slice ใหม่ทุกครั้งไหม
 *      ถ้า engine มีสถานะค้างข้ามการเรียก ผลจะต่างกัน — self-test เดิมเช็กเฉพาะไม้ที่ผ่านประตู
 *      60 จุด ที่นี่เช็ก "ทุกจุดตัดสินใจ" รวม null/HOLD ซึ่งเป็นประชากรส่วนใหญ่
 *
 * T10 · สมมติฐานราคาเติม: ไม้ที่ราคาเปิดกระโดดข้าม SL/TP ไปแล้ว ถูกบันทึกผลยังไง
 *       ไม่ใช่การมองอนาคตแบบอ่านแท่งข้างหน้า แต่เป็นการ "ได้ราคาที่ตอนนั้นไม่มีให้"
 *       ซึ่งอยู่ในตระกูลเดียวกัน จึงต้องวัดขนาดของมันให้เห็นตัวเลข ไม่ใช่ปัดเป็นรายละเอียด
 *
 * รัน: node scripts/research/veto-audit-fill-and-state.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadProbe } from './audit-rule-lab-probe.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const VETO_SRC = path.join(SELF_DIR, 'veto-lab.mjs');
const VETO_GEN = path.join(SELF_DIR, 'veto-audit-internals2.generated.mjs');

const VETO_EXPORTS = ['loadDeps', 'buildBaseTrades', 'simulateTradeFromLevels', 'decisionOf', 'decisionEqual'];

async function loadVetoProbe() {
  const src = fs.readFileSync(VETO_SRC, 'utf8');
  const cut = src.indexOf('\nmain()\n');
  if (cut < 0) throw new Error('หาจุดเรียก main() ใน veto-lab.mjs ไม่เจอ');
  fs.writeFileSync(VETO_GEN, `${src.slice(0, cut)}\nexport { ${VETO_EXPORTS.join(', ')} };\n`, 'utf8');
  return import(`${pathToFileURL(VETO_GEN).href}?v=${Date.now()}`);
}

const checks = [];
function ok(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail: detail ?? '' });
  console.log(`  [${pass ? 'ผ่าน' : 'ตก  '}] ${name}${detail ? ` — ${detail}` : ''}`);
}
const same = (a, b) => Object.is(a, b);
const vKey = (v) => (v === null ? 'null' : `${v.veto}|${v.score}`);

// ═══════════ T8 · แก้เฉพาะแท่งเข้าไม้ แล้วการตัดสินใจต้องไม่ขยับ ═══════════

function t8EntryBarIsolation(L, deps, bounds, symbols, tf, samples) {
  const cache = new Map();
  const rnd = L.mulberry32(0xe27a1b);
  const bad = [];
  let compared = 0;
  let sigCount = 0;

  for (const sym of symbols) {
    const u = L.UNIVERSE.find((x) => x.symbol === sym);
    const ds = L.prepareDataset(u, tf, bounds, cache);
    const { bars, ind } = ds;
    const lo = L.WARMUP_BARS;
    const span = Math.max(1, bars.length - 2 - lo);

    for (let s = 0; s < samples; s++) {
      const t = lo + ((rnd() * span) | 0);
      if (t < lo || t > bars.length - 2) continue;

      // ── ฝั่ง "ของจริง" ──
      const prefix = bars.slice(0, t + 1);
      const sigA = deps.engine.generateSignal({ symbol: sym, name: sym, market: u.market, candles: prefix, timeframe: tf });
      if (!sigA || (sigA.action !== 'BUY' && sigA.action !== 'SELL')) continue;
      const gA = deps.gate.evaluateSignal(sigA);
      const sideA = sigA.action === 'BUY' ? 'long' : 'short';
      const mA = deps.vetoes.map((v) => vKey(v.evaluate({ bars, t, ind, htf: ds.htfFor ? ds.htfFor(t) : null })));
      sigCount++;

      // ── ฝั่งที่แท่ง t+1 ถูกเปลี่ยนแบบสุดขั้ว (เฉพาะแท่งนั้นแท่งเดียว) ──
      const mut = bars.slice();
      const nb = mut[t + 1];
      mut[t + 1] = { ...nb, open: nb.open * 1.9, high: nb.high * 2.4, low: nb.low * 0.4, close: nb.close * 0.6 };
      // อินดิเคเตอร์คำนวณใหม่จากแท่งที่ถูกแก้ เพื่อไม่ให้ "ไม่มีอะไรเปลี่ยน" เป็นเพราะเราลืมอัปเดต
      const mutInd = L.computeIndicators(mut);
      const prefixB = mut.slice(0, t + 1); // prefix ถึง t เหมือนกันเป๊ะ (แท่ง t+1 ไม่อยู่ในนี้)
      const sigB = deps.engine.generateSignal({ symbol: sym, name: sym, market: u.market, candles: prefixB, timeframe: tf });
      const gB = sigB ? deps.gate.evaluateSignal(sigB) : null;
      const mB = deps.vetoes.map((v) => vKey(v.evaluate({ bars: mut, t, ind: mutInd, htf: ds.htfFor ? ds.htfFor(t) : null })));

      compared++;
      if (!sigB || sigB.action !== sigA.action || !same(sigB.stop_loss, sigA.stop_loss)
        || !same(sigB.take_profit, sigA.take_profit) || !same(sigB.entry_price, sigA.entry_price)
        || !same(sigB.strength, sigA.strength) || !same(sigB.confidence, sigA.confidence)) {
        bad.push(`${sym}@${t}: สัญญาณเปลี่ยนเมื่อแก้แท่ง t+1`);
      }
      if (!gB || gB.passed !== gA.passed) bad.push(`${sym}@${t}: ผลประตูเปลี่ยนเมื่อแก้แท่ง t+1`);
      for (let i = 0; i < mA.length; i++) {
        if (mA[i] !== mB[i]) bad.push(`${sym}@${t}: วีโต้ ${deps.vetoes[i].short} เปลี่ยน ${mA[i]} → ${mB[i]}`);
      }
      void sideA;
      if (bad.length >= 6) break;
    }
    if (bad.length >= 6) break;
  }
  return { bad, compared, sigCount };
}

// ═══════════ T9 · prefix โตทีละแท่ง เท่ากับ slice ใหม่ทุกครั้งไหม (ทุกจุดตัดสินใจ) ═══════════

function t9PrefixVsFreshSlice(L, deps, bounds, symbols, tf, stride) {
  const cache = new Map();
  const bad = [];
  let compared = 0;
  let nonNull = 0;

  const key = (s) => (s === null || s === undefined ? 'null'
    : `${s.action}|${s.strength}|${s.confidence}|${s.entry_price}|${s.stop_loss}|${s.take_profit}`);

  for (const sym of symbols) {
    const u = L.UNIVERSE.find((x) => x.symbol === sym);
    const ds = L.prepareDataset(u, tf, bounds, cache);
    const { bars } = ds;
    const last = bars.length - 2;

    // เดินแบบเดียวกับ buildBaseTrades คือ prefix ก้อนเดิมโตทีละแท่ง
    const prefix = [];
    for (let t = 0; t <= L.WARMUP_BARS - 1 && t < bars.length; t++) prefix.push(bars[t]);
    for (let t = L.WARMUP_BARS; t <= last; t++) {
      while (prefix.length < t + 1) prefix.push(bars[prefix.length]);
      const grown = deps.engine.generateSignal({ symbol: sym, name: sym, market: u.market, candles: prefix, timeframe: tf });
      if ((t - L.WARMUP_BARS) % stride !== 0) continue;
      const fresh = deps.engine.generateSignal({
        symbol: sym, name: sym, market: u.market, candles: bars.slice(0, t + 1), timeframe: tf,
      });
      compared++;
      if (grown !== null) nonNull++;
      if (key(grown) !== key(fresh)) bad.push(`${sym}@${t}: โต=${key(grown)} · สด=${key(fresh)}`);
      if (bad.length >= 6) break;
    }
    if (bad.length >= 6) break;
  }
  return { bad, compared, nonNull };
}

// ═══════════ T10 · ไม้ที่ราคาเปิดกระโดดข้าม SL/TP ถูกบันทึกผลยังไง ═══════════

/**
 * ตรวจสมมติฐานราคาเติม ไม่ใช่การอ่านแท่งอนาคต แต่เป็นคำถามว่า "ราคาที่บันทึกไว้ มีให้จริงไหม
 * ณ วินาทีนั้น" ถ้าราคาเปิดกระโดดต่ำกว่า SL ของไม้ long ไปแล้ว การออกที่ราคา SL แปลว่า
 * เราขายได้แพงกว่าราคาที่ตลาดเปิดให้ — เป็นผลบวกปลอมที่ไม่มีใครได้ในชีวิตจริง
 */
function t10GapFills(L, deps, VP, bounds, symbols, tf) {
  const cache = new Map();
  const base = VP.buildBaseTrades(tf, deps, { bounds, cache, symbols });
  const gaps = base.trades.filter((t) => t.gapPastStop || t.gapPastTarget);
  const n = base.trades.length;
  const meanAll = base.trades.reduce((s, t) => s + t.rNet, 0) / Math.max(1, n);

  let optimistic = 0;      // ไม้ที่กระโดดข้าม SL แล้วยังบันทึกเป็นกำไร
  let gapSumR = 0;
  const worst = [];
  for (const t of gaps) {
    gapSumR += t.rNet;
    if (t.gapPastStop && t.rNet > 0) {
      optimistic++;
      worst.push(`${t.symbol}#${t.signalIdx} ${t.side} rNet=${t.rNet.toFixed(3)} (เปิด ${t.entry} ข้าม SL ${t.stop} ไปแล้ว)`);
    }
  }
  const meanNoGap = n > gaps.length
    ? base.trades.filter((t) => !t.gapPastStop && !t.gapPastTarget).reduce((s, t) => s + t.rNet, 0) / (n - gaps.length)
    : null;

  return {
    n, gaps: gaps.length, optimistic, gapSumR,
    meanAll, meanNoGap,
    shiftIfDropped: meanNoGap === null ? null : meanNoGap - meanAll,
    worst: worst.slice(0, 4),
  };
}

// ═══════════════════════════════ main ═══════════════════════════════

async function main() {
  console.log('\n══ veto-audit-fill-and-state — แท่งเข้าไม้ · สถานะข้ามการเรียก · ราคาเติม ══\n');
  const L = await loadProbe();
  const VP = await loadVetoProbe();
  const deps = await VP.loadDeps();
  const bounds = L.loadSplitBoundaries(['1D', '1H']);
  const syms3 = ['XAUUSD', 'EURUSD', 'USDJPY'];

  console.log('T8 · แก้เฉพาะแท่ง t+1 (แท่งที่ใช้เข้าไม้) แล้วการตัดสินใจต้องไม่ขยับ');
  for (const tf of ['1D', '1H']) {
    const r = t8EntryBarIsolation(L, deps, bounds, syms3, tf, tf === '1D' ? 700 : 400);
    ok(`entry-bar-isolation/${tf}`, r.bad.length === 0 && r.compared >= 20,
      `เทียบ ${r.compared} จุดที่มีสัญญาณจริง · ต่าง ${r.bad.length}`
      + (r.bad.length ? ` — ${r.bad.slice(0, 3).join(' | ')}` : ''));
  }

  console.log('\nT9 · prefix โตทีละแท่ง เทียบกับ slice ใหม่ทุกครั้ง (ทุกจุดตัดสินใจ รวม null/HOLD)');
  for (const tf of ['1D', '1H']) {
    const r = t9PrefixVsFreshSlice(L, deps, bounds, syms3, tf, tf === '1D' ? 3 : 11);
    ok(`prefix-vs-fresh/${tf}`, r.bad.length === 0 && r.compared >= 500,
      `เทียบ ${r.compared} จุด (ไม่ใช่ null ${r.nonNull}) · ต่าง ${r.bad.length}`
      + (r.bad.length ? ` — ${r.bad.slice(0, 2).join(' | ')}` : ''));
  }

  console.log('\nT10 · ไม้ที่ราคาเปิดกระโดดข้าม SL/TP — ราคาที่บันทึกมีให้จริงไหม');
  for (const tf of ['1D', '1H']) {
    const r = t10GapFills(L, deps, VP, bounds, L.UNIVERSE.map((u) => u.symbol), tf);
    const pass = r.optimistic === 0;
    ok(`gap-fill-realism/${tf}`, pass,
      `ไม้ ${r.n} · กระโดดข้าม ${r.gaps} ไม้ · บันทึกเป็นกำไรทั้งที่ข้าม SL = ${r.optimistic} ไม้`
      + ` · meanR ${r.meanAll.toFixed(4)} → ${r.meanNoGap === null ? 'n/a' : r.meanNoGap.toFixed(4)} ถ้าตัดไม้กลุ่มนี้ทิ้ง`
      + ` (ขยับ ${r.shiftIfDropped === null ? 'n/a' : r.shiftIfDropped.toFixed(4)} R)`
      + (r.worst.length ? `\n         ตัวอย่าง: ${r.worst.slice(0, 2).join(' | ')}` : ''));
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n══ สรุป: ผ่าน ${checks.length - failed.length}/${checks.length} ══`);
  for (const f of failed) console.log(`  · ตก: ${f.name} — ${f.detail}`);
  return failed.length === 0 ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((err) => { console.error(`\n[veto-audit2 ล้ม] ${err?.stack ?? err}\n`); process.exit(2); });
