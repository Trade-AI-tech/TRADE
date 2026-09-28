#!/usr/bin/env node
/**
 * smc-testset.mjs — ยืนยัน "FVG ตามเทรนด์ + ขยาย SL" บนชุด test ที่ยังไม่มีใครเคยแตะ · รันได้ครั้งเดียว
 *
 * ═══ แผนที่ล็อกไว้ก่อนเปิดข้อมูล (commit ไฟล์นี้ก่อนรันจริง — แก้หลังรันไม่ได้) ═══════════
 *
 * เจ้าของสั่ง 2026-09-28: "ใช้ชุดทดสอบ (ก.พ.–ส.ค. 2026) ยืนยัน FVG ตามเทรนด์"
 *
 *   สมมติฐานหลัก (H1)   เซ็ตอัพ fvg-trend + ขยาย SL บน XAUUSD 1H มีค่าคาดหวังของ R สุทธิ > 0
 *   ชุดข้อมูล          แท่ง 1H ใน .research-cache/candles/GOLD__XAUUSD__1H.json ทั้งไฟล์
 *                      องค์ประกอบ SMC คำนวณจากทั้งไฟล์ (โครงสร้างต้องมีประวัติ และทุกชิ้น causal
 *                      — test-smc.mjs พิสูจน์แล้ว) แต่ **นับเฉพาะไม้ที่แท่งเข้าไม้ ≥ validationEnd**
 *                      ของ 1H ใน split.json (2026-02-17T04:00Z) ไปจนสุดไฟล์ (2026-08-17)
 *   กติกาไม้           เรียก createSmcTrades(...).collectTrades(bars, '1H', 'fvg-trend', true, …)
 *                      ตัวเดียวกับ smc-lab.mjs และกติกาเข้าไม้จาก src/lib/smc-setups.ts
 *                      ตัวเดียวกับตัวสแกนจริง — ไม่มีพารามิเตอร์ไหนถูกเลือกหลังเห็นชุด test
 *   สถิติหลัก          cluster-robust t แบบจับกลุ่ม "รายสัปดาห์" (จันทร์ UTC) df = จำนวนสัปดาห์ − 1
 *                      ใช้การแจกแจง t ไม่ใช่ normal เพราะชุด test สั้น (~26 สัปดาห์)
 *                      ไม่ใช้รายเดือนแบบแล็บ เพราะหกเดือนได้แค่ 6 กลุ่ม — ค่า p จะเชื่อไม่ได้
 *   เกณฑ์ตัดสิน        **ยืนยัน** ถ้าค่าเฉลี่ย R สุทธิ > 0 และ p ทางเดียว < 0.05
 *                      ทางเดียวเพราะสมมติฐานมีทิศ (ต้องเป็นบวก) และกำหนดไว้ก่อนเห็นข้อมูล
 *   กำลังทดสอบ         ~140 ไม้ ถ้าผลจริง = +0.11 R (ค่าที่เห็นในแล็บ) โอกาสยืนยันได้ราว 28%
 *                      **ไม่ยืนยัน ≠ พิสูจน์ว่าใช้ไม่ได้** — ต้องรายงานคู่กับช่วงความเชื่อมั่นเสมอ
 *
 *   บรรยายเท่านั้น (ไม่ใช้ตัดสิน): p สองทาง · p รายเดือนแบบแล็บ · bootstrap รายสัปดาห์ ·
 *   แยกซื้อ/ขาย · กลับทิศ · สุ่มตามเทรนด์ในช่วงเดียวกัน · 1D บนชุด test ของ 1D (2021-08 → 2026-08)
 *
 * ═══ รันครั้งเดียว ═══════════════════════════════════════════════════════════════════
 * เขียนผลลง scripts/research/report/smc-testset.json — ถ้าไฟล์นั้นมีอยู่แล้ว สคริปต์ปฏิเสธที่จะรัน
 * ชุด test ที่ถูกเปิดดูแล้วใช้ยืนยันซ้ำไม่ได้: รันใหม่หลังแก้อะไรก็ตาม = เลือกผลที่ชอบ
 *
 * รัน: node scripts/research/smc-testset.mjs --self-test   (ไม่แตะชุด test)
 *      node scripts/research/smc-testset.mjs               (ครั้งเดียวในชีวิตของชุดนี้)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrcModules, ROOT } from './load-src-modules.mjs';
import { MAX_HOLD_BARS, clusterStats, summarize, createTradeSim, SPLIT_FILE } from './trade-sim.mjs';
import { createSmcTrades } from './smc-trades.mjs';

// ── แก้หลังรัน (2026-09-28 · ไม่เปลี่ยนการคำนวณใด ๆ) ─────────────────────────────────
// ไฟล์นี้เคยรันจริงเพราะถูก import เป็นโมดูล: ส่วนรันจริงอยู่ระดับบนสุดและกันไว้แค่ --self-test
// ตอนนี้: (1) ทำงานเฉพาะตอนเป็นไฟล์หลักที่ node สั่งรัน (2) รันจริงต้องมีธงของตัวเอง
// (3) ธงที่ไม่รู้จัก = แสดงวิธีใช้แล้วออก ไม่แตะข้อมูล · ดู exp-smc-testset.md
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const ARGS = IS_MAIN ? process.argv.slice(2) : [];
const SELF_TEST = ARGS.includes('--self-test');
const SPEND = ARGS.includes('--spend-test-set');
if (IS_MAIN) {
  const unknown = ARGS.filter((a) => a !== '--self-test' && a !== '--spend-test-set');
  if (unknown.length || SELF_TEST === SPEND) {
    console.error('ใช้: --self-test (ไม่แตะชุด test) | --spend-test-set (รันจริง — ชุดนี้ถูกใช้ไปแล้ว)' +
      (unknown.length ? `
ไม่รู้จัก: ${unknown.join(' ')}` : ''));
    process.exit(1);
  }
}
const OUT_FILE = path.join(ROOT, 'scripts', 'research', 'report', 'smc-testset.json');
const SYMBOL = 'XAUUSD';
const MARKET = 'GOLD';
const ALPHA_ONE_SIDED = 0.05;
const NULL_ROUNDS = 400;
const SEED = 20260929;

// ─────────────────────────────── การแจกแจง t ───────────────────────────────

function lgamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betacf(a, b, x) {
  const FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}
function ibeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** P(T ≤ t) ของการแจกแจง t ที่ df องศาอิสระ */
export function tCdf(t, df) {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const p = 0.5 * ibeta(df / 2, 0.5, df / (df + t * t));
  return t > 0 ? 1 - p : p;
}

// ─────────────────────────────── สถิติรายสัปดาห์ ───────────────────────────────

/** กุญแจสัปดาห์ = วันจันทร์ (UTC) ของสัปดาห์ที่เข้าไม้ */
export function weekKey(ts) {
  const d = new Date(ts);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

/** cluster-robust t รายสัปดาห์ · df = G − 1 · คืน p ทางเดียว (H1: ค่าเฉลี่ย > 0) และสองทาง */
export function weeklyClusterT(trades) {
  const N = trades.length;
  if (!N) return null;
  const mean = trades.reduce((a, t) => a + t.rNet, 0) / N;
  const dev = new Map();
  for (const t of trades) {
    const k = weekKey(t.timestamp);
    dev.set(k, (dev.get(k) ?? 0) + (t.rNet - mean));
  }
  const G = dev.size;
  let ss = 0;
  for (const v of dev.values()) ss += v * v;
  if (G < 2 || !(ss > 0)) return { weeks: G, mean, se: null, t: null, df: G - 1, pOneSided: null, pTwoSided: null };
  const se = Math.sqrt((G / (G - 1)) * ss / (N * N));
  const t = mean / se;
  const df = G - 1;
  return { weeks: G, mean, se, t, df, pOneSided: 1 - tCdf(t, df), pTwoSided: 2 * (1 - tCdf(Math.abs(t), df)) };
}

/** ไม้ที่แท่งเข้าไม้อยู่ในชุด test เท่านั้น */
export const inTestWindow = (trades, cutMs) => trades.filter((t) => Date.parse(t.timestamp) >= cutMs);

// ─────────────────────────────── self-test (ไม่แตะชุด test) ───────────────────────────────

if (SELF_TEST) {
  let pass = 0, fail = 0;
  const t = (name, ok, d = '') => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${d ? ` — ${d}` : ''}`); } };
  const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

  // ค่าจากตาราง t มาตรฐาน
  t('t(5): P(T ≤ 2.015048) = 0.95', near(tCdf(2.015048, 5), 0.95), tCdf(2.015048, 5));
  t('t(29): P(T ≤ 1.699127) = 0.95', near(tCdf(1.699127, 29), 0.95), tCdf(1.699127, 29));
  t('t(10): P(T ≤ −2.228139) = 0.025', near(tCdf(-2.228139, 10), 0.025), tCdf(-2.228139, 10));
  t('t(1): P(T ≤ 1) = 0.75 (Cauchy)', near(tCdf(1, 1), 0.75), tCdf(1, 1));
  t('t(10): P(T ≤ 0) = 0.5', near(tCdf(0, 10), 0.5));
  t('df ใหญ่มาก ≈ normal: P(T ≤ 1.959964) = 0.975', near(tCdf(1.959964, 1e6), 0.975), tCdf(1.959964, 1e6));
  t('t(25): ค่าวิกฤตทางเดียว 1.708141', near(tCdf(1.708141, 25), 0.95), tCdf(1.708141, 25));

  // สัปดาห์: อาทิตย์เป็นสัปดาห์เดียวกับจันทร์ก่อนหน้า · จันทร์เริ่มสัปดาห์ใหม่
  t('กุญแจสัปดาห์ของวันพุธ = จันทร์ก่อนหน้า', weekKey('2026-02-18T10:00:00.000Z') === '2026-02-16');
  t('วันอาทิตย์อยู่สัปดาห์เดียวกับจันทร์ก่อนหน้า', weekKey('2026-02-22T23:00:00.000Z') === '2026-02-16');
  t('วันจันทร์เริ่มสัปดาห์ใหม่', weekKey('2026-02-23T00:00:00.000Z') === '2026-02-23');

  // ตัวกรองหน้าต่าง: ขอบเท่ากับ cut นับ (≥) ก่อนหน้าไม่นับ
  const cut = Date.parse('2026-02-17T04:00:00.000Z');
  const w = inTestWindow([{ timestamp: '2026-02-17T03:00:00.000Z' }, { timestamp: '2026-02-17T04:00:00.000Z' }, { timestamp: '2026-03-01T00:00:00.000Z' }], cut);
  t('นับเฉพาะไม้ที่แท่งเข้า ≥ ขอบชุด test', w.length === 2 && w[0].timestamp === '2026-02-17T04:00:00.000Z');

  // t รายสัปดาห์: ชุดบวกชัด → p ทางเดียวเล็ก · ชุดศูนย์ → p ราว 0.5
  const mk = (r, day) => ({ rNet: r, timestamp: new Date(Date.UTC(2026, 1, 16) + day * 86400_000).toISOString() });
  const pos = Array.from({ length: 140 }, (_, i) => mk(i % 3 === 0 ? -1 : 1, Math.floor(i / 5)));
  const s1 = weeklyClusterT(pos);
  t('ชุดที่บวกชัดได้ p ทางเดียว < 0.05', s1.pOneSided < 0.05 && s1.mean > 0, JSON.stringify(s1));
  const zero = Array.from({ length: 140 }, (_, i) => mk(i % 2 ? 1 : -1, Math.floor(i / 5)));
  const s0 = weeklyClusterT(zero);
  t('ชุดที่ค่าเฉลี่ยศูนย์ได้ p ทางเดียวราว 0.5', s0.pOneSided > 0.3 && s0.pOneSided < 0.7, JSON.stringify(s0));
  t('df = จำนวนสัปดาห์ − 1', s1.df === s1.weeks - 1 && s1.weeks === 4);
  const neg = pos.map((x) => ({ ...x, rNet: -x.rNet }));
  t('ชุดติดลบได้ p ทางเดียวใกล้ 1 (ทางเดียวไม่ยืนยันผลลบ)', weeklyClusterT(neg).pOneSided > 0.95);

  // ชุด test ถูกใช้ไปแล้ว 2026-09-28 — ไฟล์ผลต้องอยู่ตลอดไป เพราะมันคือตัวกันการรันซ้ำ
  // (ก่อนรันข้อนี้ตรวจว่า "ยังไม่มีไฟล์ผล" · ดู exp-smc-testset.md)
  t('ไฟล์ผลของชุด test ยังอยู่ (ตัวกันการรันซ้ำ)', fs.existsSync(OUT_FILE), OUT_FILE);

  console.log(`self-test — ผ่าน ${pass} · ตก ${fail}`);
  process.exit(fail ? 1 : 0);
}

// ─────────────────────────────── รันจริง (ครั้งเดียว) ───────────────────────────────

if (SPEND) await spend();

async function spend() {
if (fs.existsSync(OUT_FILE)) {
  console.error(`ชุด test ถูกใช้ไปแล้ว — ผลอยู่ที่ ${path.relative(ROOT, OUT_FILE)}\nรันซ้ำไม่ได้: ชุดที่เปิดดูแล้วใช้ยืนยันซ้ำไม่ได้ (เหตุผลอยู่หัวไฟล์)`);
  process.exit(2);
}

const mods = await loadSrcModules(['src/lib/supply-demand.ts', 'src/lib/smc.ts', 'src/lib/costs.ts', 'src/lib/smc-setups.ts']);
const { analyzeSmc } = mods['smc'];
const { costRFor } = mods['costs'];
const SETUP = mods['smc-setups'];
const sim = createTradeSim({ costRFor, symbol: SYMBOL, market: MARKET });
const { collectTrades } = createSmcTrades({ SETUP, sim, symbol: SYMBOL, market: MARKET, maxHoldBars: MAX_HOLD_BARS });
const split = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8'));

function evaluate(tf) {
  const file = path.join(ROOT, '.research-cache', 'candles', `GOLD__${SYMBOL}__${tf}.json`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bars = Array.isArray(raw) ? raw : raw.candles;
  const cut = Date.parse(split.timeframes[tf].validationEnd);
  const a = analyzeSmc(bars);
  const all = collectTrades(bars, tf, 'fvg-trend', true, a);
  const test = inTestWindow(all, cut);
  const maxHold = MAX_HOLD_BARS[tf];

  // สุ่มตามเทรนด์ในช่วงเดียวกัน (บรรยาย) — เข้าที่ราคาเปิดแท่ง e → รู้ทิศ ณ ปิดแท่ง e−1
  const trend = SETUP.trendSeries(bars.length, a.events);
  const pool = { long: [], short: [] };
  for (let e = 1; e < bars.length - maxHold - 1; e++) {
    if (Date.parse(bars[e].timestamp) < cut) continue;
    if (trend[e - 1] === 1) pool.long.push(e);
    else if (trend[e - 1] === -1) pool.short.push(e);
  }
  const weekly = clusterStats(test.map((t) => ({ ...t, month: weekKey(t.timestamp) })));
  return {
    tf,
    window: { from: split.timeframes[tf].validationEnd, to: bars[bars.length - 1].timestamp, bars: bars.filter((b) => Date.parse(b.timestamp) >= cut).length },
    trades: summarize(test),
    primary: weeklyClusterT(test),
    weeklyBootstrap: weekly ? { lo95: weekly.lo95, hi95: weekly.hi95, pBoot: weekly.pBoot, weeks: weekly.months } : null,
    monthlyLabStyle: clusterStats(test),
    bySide: {
      long: summarize(test.filter((t) => t.side === 'long')),
      short: summarize(test.filter((t) => t.side === 'short')),
    },
    flipped: summarize(sim.flippedTrades(bars, test, maxHold)),
    trendNull: test.length ? sim.randomNull(bars, test, maxHold, { rounds: NULL_ROUNDS, seed: SEED + (tf === '1H' ? 0 : 1), pool }) : null,
  };
}

const primary = evaluate('1H');
const secondary = evaluate('1D');
const p = primary.primary;
const confirmed = !!(p && p.pOneSided != null && p.mean > 0 && p.pOneSided < ALPHA_ONE_SIDED);

const result = {
  ranAt: new Date().toISOString(),
  hypothesis: 'fvg-trend + ขยาย SL บน XAUUSD 1H มีค่าคาดหวังของ R สุทธิ > 0',
  decisionRule: `ยืนยันถ้าค่าเฉลี่ย > 0 และ p ทางเดียว (cluster t รายสัปดาห์ df = G−1) < ${ALPHA_ONE_SIDED}`,
  confirmed,
  primary,
  secondary1D: secondary,
};
fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2) + '\n');

const r4 = (v) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(4) : 'n/a');
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'n/a');
for (const o of [primary, secondary]) {
  const s = o.trades;
  console.log(`\n── ${o.tf} ชุด test ${o.window.from.slice(0, 10)} → ${o.window.to.slice(0, 10)} (${o.window.bars} แท่ง) ${o === primary ? '— สมมติฐานหลัก' : '— บรรยายเท่านั้น'}`);
  if (!s) { console.log('   ไม่มีไม้'); continue; }
  console.log(`   ${s.n} ไม้ · TP ${pct(s.tp)} · SL ${pct(s.sl)} · หมดเวลา ${pct(s.timeout)} · R ก่อนต้นทุน ${r4(s.rGross)} · ต้นทุน ${s.costR.toFixed(3)} · R สุทธิ ${r4(s.rNet)}`);
  const q = o.primary;
  if (q?.se != null) console.log(`   t รายสัปดาห์ ${q.t.toFixed(2)} (df ${q.df}) · p ทางเดียว ${q.pOneSided.toFixed(4)} · p สองทาง ${q.pTwoSided.toFixed(4)}`);
  if (o.weeklyBootstrap) console.log(`   bootstrap รายสัปดาห์ ช่วง 95% ${r4(o.weeklyBootstrap.lo95)} … ${r4(o.weeklyBootstrap.hi95)}`);
  if (o.monthlyLabStyle) console.log(`   แบบแล็บ (รายเดือน · normal) p ${o.monthlyLabStyle.pCluster?.toFixed(4) ?? 'n/a'} · ${o.monthlyLabStyle.months} เดือน`);
  console.log(`   ซื้อ ${o.bySide.long?.n ?? 0} ไม้ ${r4(o.bySide.long?.rNet)} · ขาย ${o.bySide.short?.n ?? 0} ไม้ ${r4(o.bySide.short?.rNet)} · กลับทิศ ${r4(o.flipped?.rNet)}`);
  if (o.trendNull) console.log(`   สุ่มตามเทรนด์ช่วงเดียวกัน เฉลี่ย ${r4(o.trendNull.nullMean)} · p ${o.trendNull.p.toFixed(3)}`);
}
console.log(`\nผลตัดสินตามแผน: ${confirmed ? '✔ ยืนยัน' : '✘ ไม่ยืนยัน'} — ${result.decisionRule}`);
console.log(`บันทึกแล้ว ${path.relative(ROOT, OUT_FILE)} · ชุด test นี้ใช้ยืนยันซ้ำไม่ได้แล้ว\n`);
}
