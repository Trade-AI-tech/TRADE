#!/usr/bin/env node
/**
 * veto-audit-causality.mjs — ตรวจ "การมองอนาคต" ของงานวัดวีโต้ (ไฟล์ใหม่ ไม่แตะของเดิม)
 *
 * ตั้งต้นว่าผลใน reports/veto-lab-summary.md ผิดจนกว่าจะหาข้อผิดไม่เจอ มุมที่ตรวจคือ causality
 * อย่างเดียว — ไม่ตัดสินเรื่องสถิติหรือขนาดครอบครัว
 *
 * ทำไมต้องมีทั้งการทดสอบแบบเจาะจงและแบบปลายต่อปลาย: การทดสอบเจาะจง (T1–T5) บอกได้ว่า
 * "ใครรั่ว" ส่วนการทดสอบปลายต่อปลาย (T6) บอกได้ว่า "ทั้งท่อรั่วไหม" ซึ่งจับสิ่งที่การทดสอบ
 * เจาะจงมองข้ามได้ เช่นการรั่วผ่านตัวแปรที่ไม่มีใครนึกถึงว่าเป็นอินพุต
 *
 * จุดอ่อนของ self-test เดิมใน veto-lab.mjs ที่ไฟล์นี้ตั้งใจอุด:
 *   · probeRuleCausality ตัด "ซีรีส์อินดิเคเตอร์ที่คำนวณจากอาเรย์เต็มแล้ว" ด้วย sliceInd
 *     ถ้าตัว computeIndicators เองมองอนาคต (เช่น ind.atr[t] ขึ้นกับ bars[t+1]) การตัดปลาย
 *     จะให้ค่าเดิมทั้งสองฝั่ง → เทสต์ผ่านทั้งที่รั่ว  ⇒ T1 คำนวณอินดิเคเตอร์ใหม่จาก prefix
 *   · การเทียบ "ผลลัพธ์เท่ากัน" จับได้เฉพาะการอ่านอนาคตที่เปลี่ยนคำตอบ ณ จุดที่สุ่มมา
 *     การอ่านที่ไม่เปลี่ยนคำตอบวันนี้ยังเป็นบั๊กที่รอวันเปลี่ยน ⇒ T2 ดักที่ "การอ่าน" ตรง ๆ
 *   · self-test เดิมรันแค่ EURUSD/1D 40 จุดต่อกฎ ⇒ ที่นี่เดินทุกแท่งของ 13 ตัวทั้งสองกรอบเวลา
 *
 * รัน: node scripts/research/veto-audit-causality.mjs [--quick] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadProbe } from './audit-rule-lab-probe.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const VETO_SRC = path.join(SELF_DIR, 'veto-lab.mjs');
const VETO_GEN = path.join(SELF_DIR, 'veto-audit-internals.generated.mjs');

// ═══════════════════════ โหลดตัวจริงของ veto-lab มาทดสอบ ═══════════════════════

/**
 * veto-lab.mjs เรียก main() ตอน import และไม่ export อะไรเลย — ใช้วิธีเดียวกับ
 * audit-rule-lab-probe.mjs คือ อ่านซอร์ส ตัดตรงที่เรียก main() ทิ้ง เติม export ต่อท้าย
 * ตัวโค้ดที่ถูกทดสอบจึงยังเป็นตัวอักษรเดียวกับต้นฉบับเป๊ะ และไม่มีการแก้ไฟล์เดิม
 */
const VETO_EXPORTS = [
  'loadDeps', 'buildBaseTrades', 'simulateTradeFromLevels', 'decisionOf', 'decisionEqual',
  'VETO_SLUGS',
];

async function loadVetoProbe() {
  const src = fs.readFileSync(VETO_SRC, 'utf8');
  const marker = '\nmain()\n';
  const cut = src.indexOf(marker);
  if (cut < 0) throw new Error('หาจุดเรียก main() ใน veto-lab.mjs ไม่เจอ — ซอร์สเปลี่ยนรูปแล้ว');
  fs.writeFileSync(VETO_GEN, `${src.slice(0, cut)}\nexport { ${VETO_EXPORTS.join(', ')} };\n`, 'utf8');
  return import(`${pathToFileURL(VETO_GEN).href}?v=${Date.now()}`);
}

// ═══════════════════════════════ ตัวช่วย ═══════════════════════════════

const checks = [];
function ok(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail: detail ?? '' });
  const tag = pass ? 'ผ่าน' : 'ตก  ';
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
}

/** เท่ากันแบบยอมให้ NaN เท่ากับ NaN (Object.is ทำให้อยู่แล้ว) */
const same = (a, b) => Object.is(a, b);

/** ชื่อ + อาเรย์ของทุกซีรีส์ในก้อน ind — ใช้วนเทียบทีละตัว */
function flatSeries(ind) {
  return [
    ['rsi', ind.rsi], ['ma50', ind.ma50], ['ma200', ind.ma200], ['atr', ind.atr],
    ['adx', ind.adx], ['volumeRatio', ind.volumeRatio],
    ['macd.macdLine', ind.macd.macdLine], ['macd.signalLine', ind.macd.signalLine],
    ['macd.histogram', ind.macd.histogram],
    ['bb.upper', ind.bb.upper], ['bb.middle', ind.bb.middle], ['bb.lower', ind.bb.lower],
    ['stoch.k', ind.stoch.k], ['stoch.d', ind.stoch.d],
  ];
}

/**
 * ห่ออาเรย์ด้วย Proxy เพื่อ "บันทึกทุกดัชนีที่ถูกอ่าน"
 *
 * ทำไมต้องดักที่การอ่าน ไม่ใช่แค่เทียบผลลัพธ์: กฎที่อ่าน bars[t+1] แล้วบังเอิญได้คำตอบเดิม
 * ในตัวอย่างที่สุ่มมา ยังเป็นการมองอนาคตอยู่ดี — มันแค่ยังไม่แสดงอาการ การดักที่การอ่าน
 * จึงเข้มกว่าและไม่ขึ้นกับโชคของตัวอย่าง
 */
function trapArray(arr, sink, label) {
  return new Proxy(arr, {
    get(target, prop, recv) {
      if (typeof prop === 'string') {
        const n = Number(prop);
        if (Number.isInteger(n) && n >= 0 && n > sink.max) { sink.max = n; sink.where = label; }
      }
      return Reflect.get(target, prop, recv);
    },
  });
}

/** ห่อทั้งก้อน ind ให้ทุกซีรีส์ถูกดัก โดยรูปทรงยังเหมือนเดิมทุกประการ */
function trapInd(ind, sink) {
  const T = (a, l) => trapArray(a, sink, l);
  return {
    rsi: T(ind.rsi, 'ind.rsi'), ma50: T(ind.ma50, 'ind.ma50'), ma200: T(ind.ma200, 'ind.ma200'),
    atr: T(ind.atr, 'ind.atr'), adx: T(ind.adx, 'ind.adx'),
    volumeRatio: T(ind.volumeRatio, 'ind.volumeRatio'),
    macd: {
      macdLine: T(ind.macd.macdLine, 'ind.macd.macdLine'),
      signalLine: T(ind.macd.signalLine, 'ind.macd.signalLine'),
      histogram: T(ind.macd.histogram, 'ind.macd.histogram'),
    },
    bb: {
      upper: T(ind.bb.upper, 'ind.bb.upper'), middle: T(ind.bb.middle, 'ind.bb.middle'),
      lower: T(ind.bb.lower, 'ind.bb.lower'),
    },
    stoch: { k: T(ind.stoch.k, 'ind.stoch.k'), d: T(ind.stoch.d, 'ind.stoch.d') },
  };
}

const verdictKey = (v) => (v === null ? 'null' : `${v.bull}|${v.bear}|${v.veto}|${v.score}`);

// ═══════════════ T1 · อินดิเคเตอร์เป็น causal จริงไหม (คำนวณใหม่จาก prefix) ═══════════════

/**
 * เทียบ computeIndicators(bars[0..t])[t] กับ computeIndicators(bars)[t]
 *
 * นี่คือช่องที่ probeRuleCausality เดิมมองไม่เห็น เพราะมันตัดปลายซีรีส์ที่คำนวณเสร็จแล้ว
 * ถ้าสูตรไหนใช้ค่าจากอนาคต (เช่น smoothing แบบ centered หรือ backfill ค่าเริ่มต้นจากทั้งชุด)
 * ค่าที่ดัชนี t จะเปลี่ยนเมื่อตัดหางทิ้ง และตรงนี้จะจับได้
 */
function t1IndicatorCausality(L, datasets, samplesPer) {
  const bad = [];
  let compared = 0;
  const rnd = L.mulberry32(0xc0ffee);

  for (const { key, ds } of datasets) {
    const { bars, ind } = ds;
    const lo = L.WARMUP_BARS;
    const span = Math.max(1, bars.length - 1 - lo);
    for (let s = 0; s < samplesPer; s++) {
      const t = lo + ((rnd() * span) | 0);
      if (t < lo || t >= bars.length) continue;
      const cutInd = L.computeIndicators(bars.slice(0, t + 1));
      const full = flatSeries(ind);
      const cut = flatSeries(cutInd);
      for (let i = 0; i < full.length; i++) {
        compared++;
        const a = full[i][1][t];
        const b = cut[i][1][t];
        if (!same(a, b)) {
          bad.push(`${key}@${t} ${full[i][0]}: เต็ม ${a} · ตัด ${b}`);
        }
      }
      if (bad.length >= 8) break;
    }
    if (bad.length >= 8) break;
  }
  return { bad, compared };
}

// ═══════════════ T2 · กฎวีโต้อ่านดัชนีเกิน t ไหม (ดักที่การอ่านจริง) ═══════════════

function t2ReadTrap(L, deps, datasets, stride) {
  const worst = new Map(); // slug -> { over, at, where }
  let evals = 0;

  for (const { key, ds } of datasets) {
    const { bars, ind } = ds;
    const last = bars.length - 2;
    for (let t = L.WARMUP_BARS; t <= last; t += stride) {
      const htfReal = ds.htfFor ? ds.htfFor(t) : null;
      for (const v of deps.vetoes) {
        const sink = { max: -1, where: '' };
        const tb = trapArray(bars, sink, 'bars');
        const ti = trapInd(ind, sink);
        // htf ก็ต้องถูกดักด้วย ถึงจะบอกได้ว่า "ไม่มีใครแตะ" ไม่ใช่แค่ "เดาว่าไม่แตะ"
        const hSink = { max: -1, where: '' };
        const th = htfReal
          ? { bars: trapArray(htfReal.bars, hSink, 'htf.bars'), t: htfReal.t, ind: trapInd(htfReal.ind, hSink) }
          : null;
        if (v.meta.needsHtf && !th) continue;
        L.assertVerdictShape(v.evaluate({ bars: tb, t, ind: ti, htf: th }), `${v.slug} ${key}@${t}`);
        evals++;
        const over = sink.max - t;
        const prev = worst.get(v.slug);
        if (!prev || over > prev.over) worst.set(v.slug, { over, at: `${key}@${t}`, where: sink.where });
        // htf: ดัชนีที่อ่านต้องไม่เกิน htf.t
        if (th && hSink.max > htfReal.t) {
          const p2 = worst.get(`${v.slug}/htf`);
          const o2 = hSink.max - htfReal.t;
          if (!p2 || o2 > p2.over) worst.set(`${v.slug}/htf`, { over: o2, at: `${key}@${t}`, where: hSink.where });
        }
      }
    }
  }
  return { worst, evals };
}

// ═══════════════ T3 · ทำลายอนาคตแล้วคำตอบต้องไม่ขยับ ═══════════════

/**
 * คัดลอก bars/ind แล้ว "เผา" ทุกอย่างตั้งแต่ดัชนี t+1 เป็นต้นไป (ราคาเพี้ยน + อินดิเคเตอร์ NaN)
 * ถ้าคำตอบของวีโต้เปลี่ยน แปลว่ามันกินข้อมูลที่ยังไม่เกิด
 *
 * ต่างจาก T2 ตรงที่ T2 จับ "การอ่าน" ส่วน T3 จับ "การใช้" — ทำทั้งคู่เพราะ Proxy อาจถูกเลี่ยง
 * ได้ด้วยการอ่านผ่านทางอื่น (เช่น Array.prototype.slice ที่คัดลอกทั้งก้อน)
 */
function t3FutureScramble(L, deps, datasets, samplesPer) {
  const bad = [];
  let compared = 0;
  const rnd = L.mulberry32(0xba5eba11);

  for (const { key, ds } of datasets) {
    const { bars, ind } = ds;
    const lo = L.WARMUP_BARS;
    const span = Math.max(1, bars.length - 2 - lo);
    for (let s = 0; s < samplesPer; s++) {
      const t = lo + ((rnd() * span) | 0);
      if (t < lo || t > bars.length - 2) continue;

      const burnedBars = bars.slice();
      for (let i = t + 1; i < burnedBars.length; i++) {
        const b = burnedBars[i];
        const f = 1 + 5 * rnd();
        burnedBars[i] = { ...b, open: b.open * f, high: b.high * f * 1.3, low: b.low / (f * 1.3), close: b.close * f };
      }
      const burnedInd = {};
      for (const [name, arr] of flatSeries(ind)) {
        const cp = arr.slice();
        for (let i = t + 1; i < cp.length; i++) cp[i] = NaN;
        burnedInd[name] = cp;
      }
      const bi = {
        rsi: burnedInd.rsi, ma50: burnedInd.ma50, ma200: burnedInd.ma200, atr: burnedInd.atr,
        adx: burnedInd.adx, volumeRatio: burnedInd.volumeRatio,
        macd: { macdLine: burnedInd['macd.macdLine'], signalLine: burnedInd['macd.signalLine'], histogram: burnedInd['macd.histogram'] },
        bb: { upper: burnedInd['bb.upper'], middle: burnedInd['bb.middle'], lower: burnedInd['bb.lower'] },
        stoch: { k: burnedInd['stoch.k'], d: burnedInd['stoch.d'] },
      };

      const htfReal = ds.htfFor ? ds.htfFor(t) : null;
      for (const v of deps.vetoes) {
        if (v.meta.needsHtf && !htfReal) continue;
        const a = v.evaluate({ bars, t, ind, htf: htfReal });
        const b = v.evaluate({ bars: burnedBars, t, ind: bi, htf: htfReal });
        compared++;
        if (verdictKey(a) !== verdictKey(b)) bad.push(`${v.slug} ${key}@${t}: ${verdictKey(a)} → ${verdictKey(b)}`);
      }
      if (bad.length >= 8) break;
    }
    if (bad.length >= 8) break;
  }
  return { bad, compared };
}

// ═══════════════ T4 · generateSignal ได้ prefix จริง ไม่ใช่อาเรย์เต็ม ═══════════════

/**
 * ห่อ engine แล้วให้ buildBaseTrades ตัวจริงเดินตามปกติ — ทุกครั้งที่มันเรียก generateSignal
 * เราตรวจว่า candles.length เท่ากับ t+1 ที่ควรจะเป็น (โตทีละหนึ่งเริ่มจาก WARMUP_BARS+1)
 * และองค์ประกอบเป็นตัวเดียวกับ bars[i] จริง ๆ (เทียบด้วย === ไม่ใช่เทียบค่า)
 *
 * นี่คือข้อกล่าวหาที่ตรงที่สุดของโจทย์: "ถูกส่งอาร์เรย์เต็มไปแล้วค่อยหยิบท้าย" ถ้าเป็นแบบนั้น
 * candles.length จะเท่ากับ bars.length ตลอด ไม่ใช่ t+1
 */
function t4EnginePrefix(L, deps, VP, tf, bounds, symbols) {
  const cache = new Map();
  const perSymbol = new Map();
  const problems = [];
  let calls = 0;
  let maxLen = 0;
  let barsLenSeen = 0;

  const wrapped = {
    ...deps.engine,
    generateSignal(args) {
      const { candles, symbol } = args;
      const st = perSymbol.get(symbol) ?? { n: 0, bars: null };
      if (!st.bars) {
        st.bars = L.prepareDataset(L.UNIVERSE.find((u) => u.symbol === symbol), tf, bounds, cache).bars;
        perSymbol.set(symbol, st);
      }
      const expectT = L.WARMUP_BARS + st.n;
      if (candles.length !== expectT + 1) {
        problems.push(`${symbol}: เรียกที่ t=${expectT} แต่ candles.length=${candles.length} (ควรเป็น ${expectT + 1})`);
      }
      // สุ่มตรวจ identity ไม่กี่จุด + ปลายอาเรย์ เพราะเทียบทุกดัชนีทุกครั้งเป็น O(n²)
      const probes = [0, 1, (expectT >> 1), expectT - 1, expectT].filter((i) => i >= 0 && i <= expectT);
      for (const i of probes) {
        if (candles[i] !== st.bars[i]) problems.push(`${symbol}@${expectT}: candles[${i}] ไม่ใช่ bars[${i}] ตัวเดียวกัน`);
      }
      if (candles[expectT + 1] !== undefined) {
        problems.push(`${symbol}@${expectT}: มีแท่งอนาคตติดมาใน candles (index ${expectT + 1})`);
      }
      st.n++;
      calls++;
      if (candles.length > maxLen) maxLen = candles.length;
      barsLenSeen = st.bars.length;
      return deps.engine.generateSignal(args);
    },
  };

  const base = VP.buildBaseTrades(tf, { ...deps, engine: wrapped }, { bounds, cache, symbols });
  return { problems: problems.slice(0, 8), calls, maxLen, barsLenSeen, trades: base.trades.length, base, cache };
}

// ═══════════════ T5 · แท่ง HTF ที่ส่งให้กฎ ปิดไปแล้วจริงไหม ═══════════════

function t5HtfClosed(L, bounds, symbols, stride) {
  const cache = new Map();
  const bad = [];
  let checked = 0;
  let nullCount = 0;

  for (const sym of symbols) {
    const u = L.UNIVERSE.find((x) => x.symbol === sym);
    const ds = L.prepareDataset(u, '1H', bounds, cache);
    if (!ds.htfFor) { bad.push(`${sym}: 1H ไม่มี htfFor เลย`); continue; }
    for (let t = L.WARMUP_BARS; t <= ds.bars.length - 2; t += stride) {
      const h = ds.htfFor(t);
      checked++;
      if (!h) { nullCount++; continue; }
      const dayTs = h.bars[h.t].ts;
      const hourTs = ds.bars[t].ts;
      // แท่งวันต้อง "ปิดครบวัน" ก่อนเวลาของแท่ง 1H — ไม่ใช่แค่เปิดก่อน
      if (!(dayTs + L.DAY_MS <= hourTs)) {
        bad.push(`${sym}@${t}: แท่งวัน ${h.bars[h.t].timestamp} ยังไม่ปิดตอน ${ds.bars[t].timestamp}`);
      }
      // และต้องเป็นตัวล่าสุดที่ปิดแล้ว — ถ้าตัวถัดไปก็ปิดแล้วแปลว่าเลือกเก่าเกินไป (ไม่ใช่การรั่ว
      // แต่แปลว่า findHtfIndex เพี้ยน ซึ่งต้องรู้)
      const nxt = h.bars[h.t + 1];
      if (nxt && nxt.ts + L.DAY_MS <= hourTs) {
        bad.push(`${sym}@${t}: เลือกแท่งวันเก่าเกินไป มีตัวใหม่กว่าที่ปิดแล้ว`);
      }
      if (bad.length >= 6) break;
    }
    if (bad.length >= 6) break;
  }
  return { bad, checked, nullCount };
}

// ═══════════════ T6 · ปลายต่อปลาย: ตัดข้อมูลที่ C แล้วผลต้องเหมือนเดิมทุกไม้ ═══════════════

/**
 * วิธีที่แข็งที่สุดในไฟล์นี้ — และเป็นวิธีเดียวที่ครอบคลุมทั้งท่อพร้อมกัน
 *
 * เอาชุดข้อมูลที่ตัดหางทิ้งที่ดัชนี C (คำนวณอินดิเคเตอร์ใหม่จากแท่ง 0..C เท่านั้น สร้าง htfFor
 * ใหม่จากแท่งวันที่เกิดก่อน bars[C] เท่านั้น) ยัดเข้า cache แล้วปล่อยให้ buildBaseTrades
 * "ตัวจริง" เดินตามปกติ ถ้าโลกนี้ไม่มีการมองอนาคต ไม้ทุกไม้ที่ตัดสินใจก่อน C และจบก่อน C
 * ต้องออกมาเหมือนเดิมเป๊ะทุกฟิลด์ รวมถึง vetoMask
 *
 * ถ้าต่างแม้แต่ไม้เดียว แปลว่ามีบางอย่างในท่อ (engine · อินดิเคเตอร์ · วีโต้ · ตัวเดินไม้)
 * อ่านแท่งที่อยู่หลัง C
 */
function t6TruncationReplay(L, deps, VP, tf, bounds, symbols, fracs) {
  const fullCache = new Map();
  const full = VP.buildBaseTrades(tf, deps, { bounds, cache: fullCache, symbols });
  const byKey = new Map();
  for (const tr of full.trades) byKey.set(`${tr.symbol}#${tr.signalIdx}`, tr);

  const FIELDS = ['side', 'entryIdx', 'exitIdx', 'entry', 'stop', 'target', 'risk',
    'exitPrice', 'exitReason', 'barsHeld', 'rawR', 'costR', 'rNet', 'vetoMask',
    'strength', 'confidence', 'entryPriceSignal'];

  const diffs = [];
  let comparedTrades = 0;
  const cuts = [];

  for (const frac of fracs) {
    const cutCache = new Map();
    for (const sym of symbols) {
      const u = L.UNIVERSE.find((x) => x.symbol === sym);
      const fullDs = L.prepareDataset(u, tf, bounds, fullCache);
      const C = Math.max(L.WARMUP_BARS + 60, Math.floor(fullDs.bars.length * frac));
      if (C >= fullDs.bars.length) continue;
      const bars = fullDs.bars.slice(0, C + 1);
      const ind = L.computeIndicators(bars);

      let htfFor = null;
      if (tf === '1H' && fullDs.htfFor) {
        // แท่งวันที่ใช้ได้จริงตอน t <= C ต้องเปิดก่อน bars[C] อยู่แล้ว การกรองแบบนี้จึงไม่ตัด
        // ตัวที่ควรมองเห็นทิ้ง แต่ตัดตัวที่อยู่อนาคตออกหมด
        const cutTs = bars[C].ts;
        const dayAll = L.loadRawBars(u.market, u.symbol, '1D')
          .filter((b) => b.ts < L.measurableCutMs(bounds, '1H') && b.ts < cutTs);
        if (dayAll.length) {
          const dayInd = L.computeIndicators(dayAll);
          const dayTs = dayAll.map((b) => b.ts);
          htfFor = (t) => {
            const j = L.findHtfIndex(dayTs, bars[t].ts);
            if (j < 0) return null;
            return { bars: dayAll, t: j, ind: dayInd };
          };
        }
      }
      cutCache.set(`${u.market}__${u.symbol}__${tf}`, {
        market: u.market, symbol: u.symbol, timeframe: tf, bars, droppedTestBars: 0,
        ind, htfFor, htfInfo: null,
      });
      cuts.push({ sym, C, len: fullDs.bars.length });
    }

    const cutRun = VP.buildBaseTrades(tf, deps, { bounds, cache: cutCache, symbols });
    for (const tr of cutRun.trades) {
      const ref = byKey.get(`${tr.symbol}#${tr.signalIdx}`);
      const cutInfo = cuts.find((c) => c.sym === tr.symbol);
      if (!ref) {
        diffs.push(`frac=${frac} ${tr.symbol}#${tr.signalIdx}: มีไม้ในรอบตัด แต่ไม่มีในรอบเต็ม`);
        continue;
      }
      // ไม้ที่ยังไม่จบก่อนจุดตัด จะปิดด้วย dataEnd ในรอบตัด — นั่นไม่ใช่การรั่ว ข้ามไป
      if (ref.exitIdx > cutInfo.C) continue;
      comparedTrades++;
      for (const f of FIELDS) {
        if (!same(ref[f], tr[f])) {
          diffs.push(`frac=${frac} ${tr.symbol}#${tr.signalIdx} ${f}: เต็ม ${ref[f]} · ตัด ${tr[f]}`);
        }
      }
      if (diffs.length >= 10) break;
    }
    if (diffs.length >= 10) break;
  }
  return { diffs: diffs.slice(0, 10), comparedTrades, fullTrades: full.trades.length };
}

// ═══════════════ T7 · positive control — เทสต์ข้างบนจับของปลอมได้จริงไหม ═══════════════

/**
 * ถ้าไม่มีข้อนี้ เทสต์ที่ "ผ่านหมด" อาจแปลว่าเทสต์ไม่ทำงาน ไม่ใช่แปลว่าโค้ดสะอาด
 * จึงยัดกฎที่มองอนาคตแบบชัด ๆ เข้าไปสามแบบ แล้วบังคับว่าต้องถูกจับได้ทุกแบบ
 */
function t7PositiveControls(L, deps, datasets) {
  const fakes = [
    {
      slug: 'FAKE-อ่าน-bars[t+1]',
      meta: { needsHtf: false },
      evaluate: ({ bars, t }) => {
        const nxt = bars[t + 1];
        const up = nxt && Number.isFinite(nxt.close) && nxt.close > bars[t].close;
        return { bull: false, bear: false, veto: up ? 'bear' : 'bull', score: 0.5 };
      },
    },
    {
      slug: 'FAKE-อ่าน-ind.atr[t+3]',
      meta: { needsHtf: false },
      evaluate: ({ t, ind }) => {
        const a = ind.atr[t + 3];
        return { bull: false, bear: false, veto: Number.isFinite(a) && a > ind.atr[t] ? 'both' : null, score: 0.1 };
      },
    },
    {
      slug: 'FAKE-อ่าน-อนาคตแบบเงียบ',
      // อ่านอนาคตแต่ไม่เอาไปใช้ — T3 จับไม่ได้โดยธรรมชาติ ต้องให้ T2 จับ
      meta: { needsHtf: false },
      evaluate: ({ bars, t }) => {
        void bars[t + 5];
        return { bull: false, bear: false, veto: null, score: 0 };
      },
    },
  ];

  const fakeDeps = { ...deps, vetoes: fakes };
  const trap = t2ReadTrap(L, fakeDeps, datasets, 97);
  const scr = t3FutureScramble(L, fakeDeps, datasets, 40);

  const caughtByTrap = fakes.filter((f) => (trap.worst.get(f.slug)?.over ?? -1) > 0).map((f) => f.slug);
  const caughtByScramble = new Set(scr.bad.map((s) => s.split(' ')[0]));
  return { caughtByTrap, caughtByScramble: [...caughtByScramble], nFakes: fakes.length };
}

// ═══════════════════════════════ main ═══════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');

  console.log('\n══ veto-audit-causality — ตรวจการมองอนาคตของงานวัดวีโต้ ══\n');

  const L = await loadProbe();
  const VP = await loadVetoProbe();
  const deps = await VP.loadDeps();
  console.log(`โหลดแล้ว: วีโต้ ${deps.vetoes.length} ข้อ (${deps.vetoes.map((v) => v.short).join(', ')})`);
  console.log(`needsHtf: ${deps.vetoes.map((v) => `${v.short}=${v.meta.needsHtf}`).join(' · ')}\n`);

  const bounds = L.loadSplitBoundaries(['1D', '1H']);
  const allSyms = L.UNIVERSE.map((u) => u.symbol);
  const symsFull = quick ? ['XAUUSD', 'EURUSD', 'USDJPY'] : allSyms;

  // ชุดข้อมูลที่ใช้ร่วมกันในหลายเทสต์ — โหลดครั้งเดียว
  const cache = new Map();
  const datasets = [];
  for (const tf of ['1D', '1H']) {
    for (const sym of symsFull) {
      const u = L.UNIVERSE.find((x) => x.symbol === sym);
      datasets.push({ key: `${sym}/${tf}`, tf, ds: L.prepareDataset(u, tf, bounds, cache) });
    }
  }
  console.log(`ชุดข้อมูล ${datasets.length} ชุด · แท่งรวม ${datasets.reduce((s, d) => s + d.ds.bars.length, 0)}\n`);

  // ── T1 ──
  console.log('T1 · อินดิเคเตอร์เป็น causal (คำนวณใหม่จาก prefix แล้วค่าที่ t ต้องไม่ขยับ)');
  const t1 = t1IndicatorCausality(L, datasets, quick ? 8 : 25);
  ok('indicators-causal', t1.bad.length === 0,
    `เทียบ ${t1.compared} ค่า · ต่าง ${t1.bad.length}${t1.bad.length ? ` — ${t1.bad.slice(0, 3).join(' | ')}` : ''}`);

  // ── T2 ──
  console.log('\nT2 · กฎวีโต้ทั้ง 4 ไม่อ่านดัชนีเกิน t (ดัก Proxy ที่การอ่านจริง)');
  const t2 = t2ReadTrap(L, deps, datasets, quick ? 41 : 7);
  let t2bad = 0;
  for (const v of deps.vetoes) {
    const w = t2.worst.get(v.slug) ?? { over: -999, at: '-', where: '-' };
    const pass = w.over <= 0;
    if (!pass) t2bad++;
    ok(`read-trap/${v.short}`, pass, `ดัชนีสูงสุดที่อ่าน − t = ${w.over} (${w.where} ที่ ${w.at})`);
  }
  ok('read-trap/รวม', t2bad === 0, `เรียกประเมิน ${t2.evals} ครั้ง · กฎที่อ่านเกิน t = ${t2bad}`);

  // ── T3 ──
  console.log('\nT3 · เผาข้อมูลหลัง t ทิ้ง คำตอบของวีโต้ต้องไม่ขยับ');
  const t3 = t3FutureScramble(L, deps, datasets, quick ? 15 : 40);
  ok('future-scramble-veto', t3.bad.length === 0,
    `เทียบ ${t3.compared} คำตอบ · ต่าง ${t3.bad.length}${t3.bad.length ? ` — ${t3.bad.slice(0, 3).join(' | ')}` : ''}`);

  // ── T4 ──
  console.log('\nT4 · generateSignal ได้ prefix ถึงแท่ง t จริง (ไม่ใช่อาเรย์เต็ม)');
  for (const tf of ['1D', '1H']) {
    const syms = quick ? ['EURUSD'] : ['XAUUSD', 'EURUSD', 'USDJPY'];
    const r = t4EnginePrefix(L, deps, VP, tf, bounds, syms);
    ok(`engine-prefix/${tf}`, r.problems.length === 0,
      `เรียก ${r.calls} ครั้ง · ยาวสุด ${r.maxLen} จาก bars ${r.barsLenSeen} แท่ง · ไม้ ${r.trades}`
      + (r.problems.length ? ` — ${r.problems.slice(0, 2).join(' | ')}` : ''));
  }

  // ── T5 ──
  console.log('\nT5 · แท่ง HTF ที่ส่งให้กฎ ปิดไปแล้วก่อนเวลาแท่ง 1H');
  const t5 = t5HtfClosed(L, bounds, quick ? ['EURUSD'] : symsFull, quick ? 37 : 11);
  ok('htf-closed-bar', t5.bad.length === 0,
    `ตรวจ ${t5.checked} จุด (ไม่มี HTF ${t5.nullCount})`
    + (t5.bad.length ? ` — ${t5.bad.slice(0, 3).join(' | ')}` : ''));

  // ── T6 ──
  console.log('\nT6 · ปลายต่อปลาย: ตัดข้อมูลที่ C แล้วเดินท่อจริงซ้ำ ผลต้องเหมือนเดิมทุกฟิลด์');
  for (const tf of ['1D', '1H']) {
    const syms = quick ? ['EURUSD'] : ['XAUUSD', 'EURUSD', 'USDJPY', 'GBPJPY'];
    const r = t6TruncationReplay(L, deps, VP, tf, bounds, syms, quick ? [0.7] : [0.55, 0.75, 0.9]);
    ok(`truncation-replay/${tf}`, r.diffs.length === 0,
      `ไม้รอบเต็ม ${r.fullTrades} · เทียบได้ ${r.comparedTrades} ไม้ · ต่าง ${r.diffs.length}`
      + (r.diffs.length ? ` — ${r.diffs.slice(0, 3).join(' | ')}` : ''));
  }

  // ── T7 ──
  console.log('\nT7 · positive control — เทสต์ข้างบนจับกฎที่มองอนาคตได้จริงไหม');
  const t7 = t7PositiveControls(L, deps, datasets.slice(0, quick ? 1 : 3));
  ok('positive-control/read-trap', t7.caughtByTrap.length === t7.nFakes,
    `จับได้ ${t7.caughtByTrap.length}/${t7.nFakes} — ${t7.caughtByTrap.join(', ')}`);
  ok('positive-control/scramble', t7.caughtByScramble.length >= 2,
    `จับได้ ${t7.caughtByScramble.length}/${t7.nFakes} (ตัวที่อ่านแล้วไม่ใช้ จับไม่ได้โดยธรรมชาติ)`);

  // ── สรุป ──
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n══ สรุป: ผ่าน ${checks.length - failed.length}/${checks.length} ══`);
  if (failed.length) {
    console.log('ข้อที่ตก:');
    for (const f of failed) console.log(`  · ${f.name} — ${f.detail}`);
  }
  if (args.includes('--json')) console.log(`\n${JSON.stringify({ checks }, null, 2)}`);
  return failed.length === 0 ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((err) => { console.error(`\n[veto-audit ล้ม] ${err?.stack ?? err}\n`); process.exit(2); });
