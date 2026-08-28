#!/usr/bin/env node
/**
 * audit-rule-lab-tests.mjs — ชุดตรวจอิสระของ rule-lab.mjs (ไฟล์ใหม่ ไม่แตะไฟล์เดิม)
 *
 * ทำไมไม่ใช้ --self-test ของตัวมันเอง: self-test เขียนโดยคนเดียวกับตัวรัน ถ้าตัวรันเข้าใจผิด
 * self-test ก็เข้าใจผิดตามไปด้วย ชุดนี้จึงป้อนเคสที่คำนวณด้วยมือมาแล้ว และเดินลูปซ้ำเอง
 * ด้วยชิ้นส่วนเดียวกัน เพื่อดูว่าตัวเลขที่ตัวรันรายงานมาสอดคล้องกับสิ่งที่มันทำจริงหรือไม่
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProbe } from './audit-rule-lab-probe.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SELF_DIR, '..', '..');
const P = await loadProbe();

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail: detail ?? '' });
  console.log(`${pass ? 'ผ่าน   ' : 'ไม่ผ่าน'} ${name}${detail ? `  — ${detail}` : ''}`);
};
const eq = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const mkBars = (rows) => rows.map((r, i) => ({
  timestamp: new Date(Date.UTC(2020, 0, 1 + i)).toISOString(),
  ts: Date.UTC(2020, 0, 1 + i),
  open: r[0], high: r[1], low: r[2], close: r[3], volume: 1000,
}));

// ══════════════════ T1 · ตัวคิด R — เคสที่กางด้วยมือแล้ว ══════════════════
// entry = open ของแท่งถัดจากแท่งสัญญาณ · risk = 1.5 × ATR · TP = 2 × risk
{
  const errs = [];
  // ATR = 4 → risk = 6 · entry = 50 → SL 44 · TP 62 (long)
  // EURUSD 1.5bps → cost_R = (1.5/10000 × 50)/6 = 0.00125
  const A = P.simulateTrade(mkBars([
    [10, 10, 10, 999],          // แท่งสัญญาณ — close 999 ตั้งใจให้เพี้ยน จะได้เห็นว่าไม่ถูกใช้
    [50, 55, 48, 52],           // แท่งเข้า open 50
    [52, 63, 51, 62.5],         // แตะ TP 62
  ]), 0, 'long', 4, 'EURUSD', 'FOREX', 20);
  if (!A) errs.push('A: ไม่ได้ไม้');
  else {
    if (!eq(A.entry, 50)) errs.push(`A entry ${A.entry} != 50 (ต้องเป็น open ของแท่งถัดไป ไม่ใช่ close 999)`);
    if (!eq(A.stop, 44)) errs.push(`A stop ${A.stop} != 44`);
    if (!eq(A.target, 62)) errs.push(`A target ${A.target} != 62`);
    if (!eq(A.rawR, 2)) errs.push(`A rawR ${A.rawR} != 2`);
    if (!eq(A.costR, 0.00125, 1e-12)) errs.push(`A costR ${A.costR} != 0.00125`);
    if (!eq(A.rNet, 2 - 0.00125)) errs.push(`A rNet ${A.rNet}`);
    if (A.exitReason !== 'tp') errs.push(`A exitReason ${A.exitReason}`);
    if (A.barsHeld !== 2) errs.push(`A barsHeld ${A.barsHeld} != 2`);
  }

  // short: entry 50 · risk 6 → SL 56 · TP 38 · แตะ TP
  const B = P.simulateTrade(mkBars([
    [10, 10, 10, 10], [50, 52, 49, 50], [50, 51, 37, 37.5],
  ]), 0, 'short', 4, 'EURUSD', 'FOREX', 20);
  if (!B || !eq(B.rawR, 2) || B.exitReason !== 'tp') errs.push(`B short-tp rawR ${B && B.rawR} reason ${B && B.exitReason}`);

  // แท่งเดียวแตะทั้ง SL และ TP → SL ต้องชนะ (อนุรักษ์นิยม)
  const C = P.simulateTrade(mkBars([
    [10, 10, 10, 10], [50, 52, 49, 50], [50, 70, 40, 65],
  ]), 0, 'long', 4, 'EURUSD', 'FOREX', 20);
  if (!C || !eq(C.rawR, -1) || C.exitReason !== 'sl') errs.push(`C tie rawR ${C && C.rawR} reason ${C && C.exitReason}`);

  // เพดานถือ: maxHold = 3 → เดินได้แท่ง entryIdx..entryIdx+2 เท่านั้น
  // TP ที่มาถึงในแท่งที่ 4 ต้องไม่ถูกนับ ต้องปิดแบบ timeout ที่ close ของแท่งที่ 3
  const D = P.simulateTrade(mkBars([
    [10, 10, 10, 10],
    [50, 51, 49, 50],   // entry
    [50, 51, 49, 50],
    [50, 53, 49, 53],   // แท่งสุดท้ายที่เดินถึง close 53 → rawR = 3/6 = 0.5
    [53, 99, 53, 98],   // TP อยู่ตรงนี้ ต้องไม่ถูกเห็น
  ]), 0, 'long', 4, 'EURUSD', 'FOREX', 3);
  if (!D) errs.push('D: ไม่ได้ไม้');
  else {
    if (D.exitReason !== 'timeout') errs.push(`D exitReason ${D.exitReason} != timeout (เพดานถือรั่ว)`);
    if (!eq(D.rawR, 0.5)) errs.push(`D rawR ${D.rawR} != 0.5`);
    if (D.barsHeld !== 3) errs.push(`D barsHeld ${D.barsHeld} != 3`);
  }

  // ข้อมูลหมดก่อนถึงเพดาน → dataEnd
  const E = P.simulateTrade(mkBars([
    [10, 10, 10, 10], [50, 51, 49, 50], [50, 52, 49, 51.5],
  ]), 0, 'long', 4, 'EURUSD', 'FOREX', 20);
  if (!E || E.exitReason !== 'dataEnd' || !eq(E.rawR, 1.5 / 6)) errs.push(`E dataEnd ${E && E.exitReason} rawR ${E && E.rawR}`);

  // ตัวหาร R ต้องเป็นระยะที่วางแผนไว้ ไม่ใช่ระยะจริงหลังราคากระโดด
  // ราคากระโดดเปิดที่ 30 (ต่ำกว่า SL 44 ไปแล้ว) → ปิดที่ stop 44 → rawR = −1 เป๊ะ
  const F = P.simulateTrade(mkBars([
    [10, 10, 10, 10], [50, 51, 49, 50], [30, 31, 29, 30],
  ]), 0, 'long', 4, 'EURUSD', 'FOREX', 20);
  if (!F || !eq(F.rawR, -1) || F.exitReason !== 'sl') errs.push(`F gap rawR ${F && F.rawR} (ต้องเป็น −1 ตามระยะที่วางแผน)`);

  // ไม่มีแท่งถัดไป → เปิดไม้ไม่ได้
  const G = P.simulateTrade(mkBars([[10, 10, 10, 10]]), 0, 'long', 4, 'EURUSD', 'FOREX', 20);
  if (G !== null) errs.push('G: ควรคืน null เมื่อไม่มีแท่งถัดไป');

  ok('T1 · ตัวคิด R ตรงกับเคสที่กางด้วยมือ (entry/SL/TP/tie/เพดาน/gap)', errs.length === 0, errs.join(' · '));
}

// ══════════════════ T2 · ต้นทุน เทียบกับ src/lib/costs.ts ══════════════════
{
  const ts = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'costs.ts'), 'utf8');
  const grab = (name) => {
    const i = ts.indexOf(`${name}: {`);
    if (i < 0) throw new Error(`หา ${name} ใน costs.ts ไม่เจอ`);
    const s = ts.indexOf('{', i);
    let d = 0;
    for (let k = s; k < ts.length; k++) {
      if (ts[k] === '{') d++;
      else if (ts[k] === '}') { d--; if (d === 0) return ts.slice(s, k + 1); }
    }
    throw new Error('วงเล็บไม่ครบ');
  };
  // eslint-disable-next-line no-new-func
  const tsByMarket = new Function(`return (${grab('byMarket')})`)();
  const tsBySymbol = new Function(`return (${grab('bySymbol')})`)();
  const errs = [];
  const cmp = (a, b, label) => {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join(',') !== kb.join(',')) errs.push(`${label}: คีย์ไม่ตรง`);
    for (const k of ka) if (a[k] !== b[k]) errs.push(`${label}.${k}: ${a[k]} != ${b[k]}`);
  };
  cmp(P.COST_BPS.byMarket, tsByMarket, 'byMarket');
  cmp(P.COST_BPS.bySymbol, tsBySymbol, 'bySymbol');

  // สูตรเดียวกันคำนวณด้วยมือ: cost_R = (bps/10000 × |entry|) / |entry − stop|
  const cases = [
    ['XAUUSD', 'GOLD', 2000, 1997, (3 / 10000 * 2000) / 3],
    ['EURUSD', 'FOREX', 1.1, 1.09, (1.5 / 10000 * 1.1) / 0.01],
    ['EURJPY', 'FOREX', 160, 158, (2.5 / 10000 * 160) / 2],
    ['USDCHF', 'FOREX', 0.9, 0.895, (1.5 / 10000 * 0.9) / 0.005],
  ];
  for (const [sym, mkt, e, s, want] of cases) {
    const got = P.costRFor(e, s, sym, mkt);
    if (!eq(got, want, 1e-15)) errs.push(`costR ${mkt}/${sym}: ${got} != ${want}`);
  }
  // ทองคำต้องใช้ bySymbol (3) ไม่ใช่ byMarket (5)
  if (P.costBpsFor('XAUUSD', 'GOLD') !== 3) errs.push('XAUUSD ต้องได้ 3 bps จาก bySymbol');
  if (P.costBpsFor('EURUSD', 'FOREX') !== 1.5) errs.push('EURUSD ต้องได้ 1.5 bps');
  ok('T2 · ตาราง bps + สูตร cost_R ตรงกับ src/lib/costs.ts', errs.length === 0, errs.join(' · '));

  // applyStopFloor ของฝั่งแอปไม่ได้ถูกใช้ที่นี่ — วัดว่ามันจะเปลี่ยนภาพแค่ไหน
  // นับเฉพาะ "การเรียกจริง" ไม่ใช่ชื่อที่โผล่ในคอมเมนต์ — ตัดคอมเมนต์ออกก่อนค้น
  const code = fs.readFileSync(path.join(SELF_DIR, 'rule-lab.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const hasFloor = /\b(applyStopFloor|minStopPctFor)\s*\(|\bMAX_COST_R\b/.test(code);
  ok('T2b · rule-lab ไม่เรียก applyStopFloor (ตรงกับที่หัวไฟล์ประกาศไว้)', !hasFloor,
    hasFloor ? 'พบการเรียกจริง' : 'ตามที่ประกาศ — ต้นทุน 1H จึงเป็นค่าดิบตามธรรมชาติ ไม่ถูกเพดาน 0.05 ของแอปช่วย');
}

// ══════════════════ T3 · กฎออกสัญญาณจริงไหม ══════════════════
{
  const rules = await P.loadRules(null);
  const rows = [];
  for (const r of rules) {
    const src = fs.readFileSync(path.join(SELF_DIR, 'rules', `${r.slug}.mjs`), 'utf8');
    // กฎที่ไม่มีทางคืน bull:true หรือ bear:true เลย = วัดในท่อนี้ไม่ได้ตั้งแต่ต้น
    const canBull = /bull:\s*true/.test(src);
    const canBear = /bear:\s*true/.test(src);
    const canVar = /bull\s*,|bull:\s*bull|bull:\s*[a-z]/.test(src);
    rows.push({ slug: r.slug, needsHtf: r.meta.needsHtf === true, emits: canBull || canBear || canVar });
  }
  const dead = rows.filter((r) => !r.emits);
  ok('T3a · ทุกกฎที่โหลดได้มีทางออกสัญญาณทิศทาง', dead.length === 0,
    dead.length ? `กฎที่คืน bull/bear = false เสมอ: ${dead.map((d) => d.slug).join(', ')}` : '');

  // ยิงจริงบนข้อมูลจริง: นับสัญญาณของกฎที่ตัวรันรายงานว่าได้ 0 ไม้
  const bounds = P.loadSplitBoundaries(['1D', '1H']);
  const cache = new Map();
  const zeroRules = ['vetoes-choch-flip', 'vetoes-level-in-path', 'vetoes-mean-reversion-vs-trend',
    'vetoes-overextension-news-candle'];
  const vetoRules = await P.loadRules(zeroRules);
  const detail = [];
  for (const rule of vetoRules) {
    const ds = P.prepareDataset({ market: 'FOREX', symbol: 'EURUSD' }, '1D', bounds, cache);
    let bull = 0; let bear = 0; let vetoed = 0; let scored = 0;
    for (let t = P.WARMUP_BARS; t <= ds.bars.length - 2; t++) {
      const v = rule.evaluate({ bars: ds.bars, t, ind: ds.ind, htf: null });
      if (v.bull) bull++;
      if (v.bear) bear++;
      if (v.veto !== null) vetoed++;
      if (v.score > 0) scored++;
    }
    detail.push(`${rule.slug}: bull ${bull} · bear ${bear} · veto ${vetoed}/${ds.bars.length} · score>0 ${scored}`);
  }
  ok('T3b · กฎ vetoes-* ถูกโหลด+นับหัวในครอบครัว Holm ทั้งที่ท่อวัดมันไม่ได้ (ไม่มีสัญญาณฐานให้วีโต้)',
    false, detail.join(' | '));

  // กฎ needsHtf บน 1D — ตัวรันข้ามทุกแท่งเพราะไม่สร้าง htfFor ให้ 1D
  const htfRules = rows.filter((r) => r.needsHtf).map((r) => r.slug);
  const ds1d = P.prepareDataset({ market: 'FOREX', symbol: 'EURUSD' }, '1D', bounds, cache);
  ok('T3c · กรอบ 1D ไม่มีตัวจับคู่ HTF → กฎ needsHtf ได้ 0 ไม้เสมอบน 1D',
    ds1d.htfFor === null,
    `กฎที่ได้ผลกระทบ ${htfRules.length} ข้อ: ${htfRules.join(', ')}`);
}

// ══════════════════ T4 · เพดานถือ + เข้าที่ open แท่งถัดไป บนข้อมูลจริง ══════════════════
{
  const bounds = P.loadSplitBoundaries(['1D', '1H']);
  const cache = new Map();
  const rule = (await P.loadRules(['_example-rsi-oversold']))[0];
  const errs = [];
  let checked = 0;
  const holdHist = {};
  for (const tf of ['1D', '1H']) {
    const maxHold = P.MAX_HOLD_BARS[tf];
    for (const u of P.UNIVERSE.slice(0, 4)) {
      const ds = P.prepareDataset(u, tf, bounds, cache);
      const { bars, ind } = ds;
      for (let t = P.WARMUP_BARS; t <= bars.length - 2; t++) {
        const v = rule.evaluate({ bars, t, ind, htf: null });
        if (!v.bull && !v.bear) continue;
        const tr = P.simulateTrade(bars, t, v.bull ? 'long' : 'short', ind.atr[t], u.symbol, u.market, maxHold);
        if (!tr) continue;
        checked++;
        if (tr.entryIdx !== t + 1) errs.push(`entryIdx != signalIdx+1 ที่ ${u.symbol}/${tf}@${t}`);
        if (tr.entry !== bars[t + 1].open) errs.push(`entry != open แท่งถัดไป ที่ ${u.symbol}/${tf}@${t}`);
        if (tr.barsHeld > maxHold) errs.push(`barsHeld ${tr.barsHeld} > เพดาน ${maxHold} ที่ ${u.symbol}/${tf}@${t}`);
        if (tr.barsHeld !== tr.exitIdx - tr.entryIdx + 1) errs.push(`barsHeld ไม่ตรงกับ exitIdx ที่ ${u.symbol}/${tf}@${t}`);
        if (tr.exitReason === 'timeout' && tr.barsHeld !== maxHold) errs.push(`timeout แต่ถือ ${tr.barsHeld} แท่ง`);
        const expRisk = P.SL_ATR_MULT * ind.atr[t];
        if (!eq(tr.risk, expRisk, 1e-12)) errs.push(`risk != 1.5×ATR ที่ ${u.symbol}/${tf}@${t}`);
        const rr = Math.abs(tr.target - tr.entry) / Math.abs(tr.entry - tr.stop);
        if (!eq(rr, P.RR_TARGET, 1e-9)) errs.push(`RR ${rr} != ${P.RR_TARGET}`);
        holdHist[tf] = Math.max(holdHist[tf] ?? 0, tr.barsHeld);
        if (errs.length >= 5) break;
      }
      if (errs.length >= 5) break;
    }
  }
  ok(`T4 · เข้าที่ open แท่งถัดไป · เพดานถือไม่รั่ว · SL=1.5ATR · RR=2 (ตรวจ ${checked} ไม้จริง)`,
    errs.length === 0, errs.slice(0, 5).join(' · ') || `barsHeld สูงสุด ${JSON.stringify(holdHist)} เทียบเพดาน ${JSON.stringify(P.MAX_HOLD_BARS)}`);
}

// ══════════════════ T5 · bootstrap สุ่มแบบ cluster จริงไหม ══════════════════
{
  const errs = [];
  // A · ก้อนที่ขนาดต่างกันมาก: ถ้าสุ่มราย-ไม้ ค่าเฉลี่ยจะกระจายต่อเนื่องเป็นร้อยค่า
  //     ถ้าสุ่มราย-ก้อน (G=2) ค่าที่เป็นไปได้มีแค่ 3 ค่าเท่านั้น
  const trades = [];
  for (let i = 0; i < 100; i++) trades.push({ symbol: 'AAA', rNet: 1 });
  trades.push({ symbol: 'BBB', rNet: -1 });
  const st = P.bootstrapClusterStats(trades, { B: 20000, seed: 12345 });
  const dist = new Set();
  // ดึงค่าที่เป็นไปได้กลับมาจาก percentile หลายจุด
  for (let q = 0; q <= 1.0001; q += 0.01) dist.add(Math.round(P.percentileOfSorted([st.lo95, st.median, st.hi95], Math.min(1, q)) * 1e9));
  if (st.clusters !== 2) errs.push(`clusters ${st.clusters} != 2 (ต้องนับตาม symbol)`);
  // ค่ากลางต้องเป็นหนึ่งใน {1, 99/101, −1} เท่านั้น
  const allowed = [1, 99 / 101, -1];
  const near = (v) => allowed.some((a) => Math.abs(a - v) < 1e-9);
  for (const [label, v] of [['lo95', st.lo95], ['median', st.median], ['hi95', st.hi95]]) {
    if (!near(v)) errs.push(`${label} = ${v} ไม่ใช่ค่าที่ cluster bootstrap ผลิตได้ (ต้องเป็น 1, 0.980198 หรือ −1)`);
  }
  // สองหาง: P(mean ≤ 0) ควรเป็น 1/4 (หยิบ BBB สองครั้ง) → p ≈ 0.5
  if (Math.abs(st.pLE0 - 0.25) > 0.02) errs.push(`pLE0 ${st.pLE0} ควรใกล้ 0.25`);
  if (Math.abs(st.pTwoTailed - 0.5) > 0.04) errs.push(`pTwoTailed ${st.pTwoTailed} ควรใกล้ 0.5`);

  // B · เทียบความกว้างกับการสุ่มราย-ไม้ ด้วยข้อมูลเดียวกัน
  //     ทุกก้อนมีขอบของตัวเองต่างกันมาก → cluster ต้องกว้างกว่าอย่างมีนัย
  const t2 = [];
  const perSym = [0.5, 0.4, 0.45, -0.5, -0.4, -0.45, 0.02, -0.02, 0.3, -0.3, 0.1, -0.1, 0.0];
  perSym.forEach((mu, i) => { for (let k = 0; k < 300; k++) t2.push({ symbol: `S${i}`, rNet: mu }); });
  const cl = P.bootstrapClusterStats(t2, { B: 20000, seed: 777 });
  // สุ่มราย-ไม้ด้วย PRNG ตัวเดียวกัน เพื่อเทียบกันตรง ๆ
  const rnd = P.mulberry32(777);
  const iid = [];
  for (let b = 0; b < 20000; b++) {
    let s = 0;
    for (let i = 0; i < t2.length; i++) s += t2[(rnd() * t2.length) | 0].rNet;
    iid.push(s / t2.length);
  }
  iid.sort((a, b) => a - b);
  const iidW = P.percentileOfSorted(iid, 0.975) - P.percentileOfSorted(iid, 0.025);
  const clW = cl.hi95 - cl.lo95;
  if (!(clW > iidW * 5)) errs.push(`CI แบบ cluster (${clW.toFixed(4)}) ไม่กว้างกว่าราย-ไม้ (${iidW.toFixed(4)}) อย่างที่ควร`);

  // C · เดิมพันเดิม เมล็ดเดิม ต้องได้ผลเดิมเป๊ะ
  const a = P.bootstrapClusterStats(t2, { B: 3000, seed: 42 });
  const b = P.bootstrapClusterStats(t2, { B: 3000, seed: 42 });
  if (JSON.stringify(a) !== JSON.stringify(b)) errs.push('ผลไม่คงที่แม้เมล็ดเดียวกัน');

  ok('T5 · bootstrap สุ่มเป็นก้อนตาม symbol จริง (ไม่ใช่สุ่มราย-ไม้)', errs.length === 0,
    errs.join(' · ') || `CI cluster กว้าง ${clW.toFixed(4)} · ราย-ไม้ ${iidW.toFixed(4)} (กว้างกว่า ${(clW / iidW).toFixed(1)} เท่า)`);
}

// ══════════════════ T6 · ด่าน causality จับกฎที่แอบอ่านอนาคตได้จริงไหม ══════════════════
{
  const bounds = P.loadSplitBoundaries(['1D']);
  const cache = new Map();
  const ds = P.prepareDataset({ market: 'FOREX', symbol: 'EURUSD' }, '1D', bounds, cache);
  const cheater = {
    slug: 'cheater',
    meta: { id: 'cheater', family: 'confluence', needsHtf: false },
    evaluate: ({ bars, t }) => {
      const nxt = bars[t + 1];
      const up = nxt ? nxt.close > bars[t].close : false;
      return { bull: up, bear: !up && !!nxt, veto: null, score: 1 };
    },
  };
  const caught = P.probeRuleCausality(cheater, ds, { samples: 40, seed: 999 });
  const honest = {
    slug: 'honest',
    meta: { id: 'honest', family: 'confluence', needsHtf: false },
    evaluate: ({ bars, t }) => ({ bull: bars[t].close > bars[t - 1].close, bear: false, veto: null, score: 0.5 }),
  };
  const clean = P.probeRuleCausality(honest, ds, { samples: 40, seed: 999 });
  ok('T6 · ด่าน causality จับกฎที่อ่าน bars[t+1] ได้ และไม่ฟ้องกฎที่สะอาด',
    caught.length > 0 && clean.length === 0,
    `กฎโกงถูกจับ ${caught.length} จุด · กฎสะอาดถูกฟ้อง ${clean.length} จุด`);
}

// ══════════════════ T7 · รายงานที่ commit ไว้ ตรงกับสิ่งที่โค้ดผลิตตอนนี้ไหม ══════════════════
{
  const reportFile = path.join(SELF_DIR, 'reports', 'rule-lab.json');
  const rep = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const bad = [];
  for (const r of rep.results) {
    if (!r.trades) continue;
    if (Math.abs(r.avgR - r.totalR / r.trades) > 1e-12) {
      bad.push(`${r.rule}/${r.timeframe}: avgR ${r.avgR} != totalR/trades ${r.totalR / r.trades}`);
    }
    const w = r.winRate * r.trades;
    if (Math.abs(w - Math.round(w)) > 1e-6) bad.push(`${r.rule}/${r.timeframe}: winRate×trades = ${w} ไม่ใช่จำนวนเต็ม`);
  }
  ok('T7a · ทุกแถวในรายงานสอดคล้องกันเอง (avgR = totalR/trades)', bad.length === 0, bad.join(' · '));

  // รันซ้ำเฉพาะแถวที่ผิด แล้วเทียบกับรายงาน
  const suspects = [...new Set(bad.map((s) => s.split('/')[0]))];
  if (suspects.length) {
    const bounds = P.loadSplitBoundaries(['1D']);
    const cache = new Map();
    const diffs = [];
    for (const slug of suspects) {
      const rule = (await P.loadRules([slug]))[0];
      const fresh = P.runRuleOnTimeframe(rule, '1D', bounds, cache, { bootstrap: 500, seed: 20260817 });
      const old = rep.results.find((x) => x.rule === slug && x.timeframe === '1D');
      diffs.push(`${slug}/1D: รายงาน avgR ${old.avgR.toFixed(6)} totalR ${old.totalR.toFixed(3)}`
        + ` · รันใหม่ avgR ${fresh.avgR.toFixed(6)} totalR ${fresh.totalR.toFixed(3)}`
        + ` (ไม้เท่ากัน ${old.trades === fresh.trades})`);
    }
    ok('T7b · รันซ้ำแถวที่ผิดแล้วได้ตัวเลขเดิม', false, diffs.join(' | '));
  }
}

console.log(`\nสรุป: ผ่าน ${results.filter((r) => r.pass).length}/${results.length} ข้อ`);
