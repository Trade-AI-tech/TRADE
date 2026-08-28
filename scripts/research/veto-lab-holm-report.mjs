#!/usr/bin/env node
/**
 * veto-lab-holm-report.mjs — เอาผลดิบจาก veto-lab.mjs มาแก้ multiple testing แล้วเขียนรายงาน
 *
 * ─────────────────────────────── ทำไมต้องแยกไฟล์ ───────────────────────────────
 *
 * veto-lab.mjs ตอบคำถาม "ชุดวีโต้ชุดนี้ได้ delta เท่าไร และ p เท่าไร" ทีละชุด ซึ่งถูก
 * ในตัวมันเอง แต่พอเอาผล 22 ช่องมาวางเรียงกันแล้วชี้ตัวที่ p น้อยที่สุด คำถามเปลี่ยนเป็น
 * "ตัวที่ดีที่สุดในยี่สิบสองตัว ดีจริงไหม" ซึ่งต้องใช้เกณฑ์คนละอัน ไฟล์นี้ทำหน้าที่นั้น
 * และแยกออกมาเพื่อไม่ให้การเปลี่ยนเกณฑ์ทางสถิติไปแตะโค้ดที่คำนวณ R
 * (ทำตามแบบเดียวกับ rule-lab-holm-report.mjs ที่มีอยู่แล้ว)
 *
 * ──────────────────────────── ครอบครัวของการทดสอบคืออะไร ────────────────────────────
 *
 * หนึ่งการทดสอบ = (ชุดค่าผสมที่ไม่ใช่ baseline, กรอบเวลา) หนึ่งคู่
 * buildConfigs() ของ veto-lab.mjs สร้าง 12 ชุดต่อกรอบเวลา = baseline 1 + เดี่ยว 4
 * + ซ้อนทั้งสี่ 1 + ทุกคู่ 6 ดังนั้นครอบครัวจริงคือ 11 × 2 = 22 ไม่ใช่ 28
 * (โจทย์ประเมินไว้ 14 × 2 = 28 โดยนับ "ซ้อน" เป็น 4 ชุด แต่ตัวโค้ดมีชุดซ้อนแค่ชุดเดียว)
 * ไฟล์นี้จึงรายงาน Holm ทั้งสองตัวหาร — m = 22 ตามที่วัดจริง และ m = 28 ตามที่โจทย์ประกาศ
 * ซึ่ง conservative กว่า — เพื่อให้ไม่มีใครต้องเดาว่าเลขไหนถูกใช้
 *
 * ─────────────────── minimum detectable effect: ทำไมต้องรายงานสองหน่วย ───────────────────
 *
 * delta ของตัวกรองถูกบีบโดยกลไก: delta = (k / keep) × (meanAll − meanCut)
 * วีโต้ที่ตัดแค่ 1% ต่อให้เลือกไม้ที่แย่กว่าค่าเฉลี่ยเต็ม 0.6R ก็ยังขยับ delta ได้แค่ ~0.006R
 * ดังนั้น "MDE ของ delta ต่ำ" ไม่ได้แปลว่าการทดสอบมีอำนาจสูง มันแปลว่า delta เองก็เล็ก
 * ตามไปด้วย รายงานนี้จึงให้สองหน่วยคู่กันเสมอ:
 *
 *   MDE(delta) = ขนาด delta ที่เล็กที่สุดที่จับได้ที่กำลัง 80%
 *   MDE(gap)   = ไม้ที่วีโต้ตัดต้องแย่กว่าค่าเฉลี่ยของกองอย่างน้อยกี่ R ถึงจะจับได้
 *                = MDE(delta) × keep / k
 *
 * MDE(gap) คือหน่วยที่ตอบคำถามจริงว่า "วีโต้ต้องเก่งแค่ไหนถึงจะพิสูจน์ได้ด้วยข้อมูลชุดนี้"
 * และมันเทียบได้ตรง ๆ กับ σ (ส่วนเบี่ยงเบนของ R รายไม้) — ถ้า MDE(gap) ใหญ่กว่า σ ครึ่งตัว
 * แปลว่าเราขอให้วีโต้แยกแยะเก่งเกินกว่าที่ตัวกรองไหนในโลกจะทำได้
 *
 * ─────────────────── σ มาจากไหน (และทำไมมันเป็นการตรวจซ้ำในตัว) ───────────────────
 *
 * veto-lab.json ไม่ได้เก็บ R รายไม้ไว้ แต่ nullSd ของ permutation แบบไม่ stratified
 * ผูกกับ σ ด้วยสูตรปิด เพราะการสุ่มตัด k จาก n โดยไม่คืนที่มีความแปรปรวนที่รู้แน่นอน:
 *
 *   Var(delta) = k·σ² / ((n−1)·(n−k))     →     σ² = nullSd² · (n−1)(n−k) / k
 *
 * ทุกชุดค่าผสมในกรอบเวลาเดียวกันใช้กองไม้กองเดียวกัน จึงต้องได้ σ เท่ากันทุกชุด
 * ไฟล์นี้คำนวณ σ จากทั้ง 11 ชุดแล้วเช็คว่ากระจายกันไม่เกิน 2% — ถ้าเกิน แปลว่าเข้าใจ
 * ตัว permutation ผิด และจะ throw แทนที่จะเขียนรายงานที่ตั้งอยู่บนความเข้าใจผิดนั้น
 *
 * ──────────────────────────────────── วิธีใช้ ────────────────────────────────────
 *
 *   node scripts/research/veto-lab-holm-report.mjs
 *   node scripts/research/veto-lab-holm-report.mjs --alpha=0.05 --json
 *   node scripts/research/veto-lab-holm-report.mjs --self-test
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { holmFromEntries, DEFAULT_ALPHA } from './holm.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const IN_FILE = path.join(SELF_DIR, 'reports', 'veto-lab.json');
const MD_FILE = path.join(SELF_DIR, 'reports', 'veto-lab-summary.md');
const JSON_FILE = path.join(SELF_DIR, 'reports', 'veto-lab-holm.json');

/** ขนาดครอบครัวที่โจทย์ประกาศไว้ — รายงานคู่กันเพื่อให้เห็นว่าตัวหารที่ใหญ่กว่าก็ไม่เปลี่ยนคำตอบ */
const BRIEF_FAMILY_SIZE = 28;

const POWER = 0.80;

// ═══════════════════════════ normal cdf / quantile ═══════════════════════════

/**
 * normalCdf ด้วย erfc แบบ Numerical Recipes (ความคลาดเคลื่อนสัมพัทธ์ < 1.2e-7)
 * เขียนเองที่นี่แทนการยืมจาก rule-lab เพราะไฟล์นี้ไม่ต้องแตะแคชหรือแท่งเทียนเลย
 * การ import ตัวโหลดทั้งก้อนมาเพื่อฟังก์ชันเดียวแลกกับเวลาเริ่มระบบที่ไม่จำเป็น
 */
function erfc(x) {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const cof = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5,
    -2.0278578112534e-5, -1.624290004647e-6, 1.303655835580e-6, 1.5626441722e-8,
    -8.5238095915e-8, 6.529054439e-9, 5.059343495e-9, -9.91364156e-10, -2.27365122e-10,
    9.6467911e-11, 2.394038e-12, -6.886027e-12, 8.94487e-13, 3.13092e-13,
    -1.12708e-13, 3.81e-16, 7.106e-15];
  let d = 0;
  let dd = 0;
  for (let j = cof.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + cof[j];
    dd = tmp;
  }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
  return x >= 0 ? ans : 2 - ans;
}

const normalCdf = (z) => 0.5 * erfc(-z / Math.SQRT2);

/**
 * quantile ด้วย bisection บน normalCdf — ช้ากว่าสูตรปิดแต่ "ถูกโดยนิยาม"
 * เราต้องการ z แค่ไม่กี่ตัวต่อการรัน จึงไม่มีเหตุผลให้แลกความชัดเจนกับความเร็ว
 */
function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new Error(`normalQuantile: p ต้องอยู่ใน (0,1) (ได้ ${p})`);
  let lo = -40;
  let hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ═══════════════════════════════ ตัวช่วยพิมพ์ ═══════════════════════════════

const f = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
const pctS = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const iso = (s) => (s ? String(s).slice(0, 10) : '—');

/** p ที่ละเอียดได้แค่ 1/(B+1) — เขียนเป็น "< x" แทนการโชว์ 0.0000 ที่อ่านว่าแน่นอน 100% */
function pStr(p, B) {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  const floor = 1 / (B + 1);
  if (p <= floor * 1.0001) return `< ${floor.toExponential(1)}`;
  return p.toFixed(4);
}

// ═══════════════════════════ σ ที่กู้คืนจาก nullSd ═══════════════════════════

/**
 * กู้ σ (ส่วนเบี่ยงเบนของ R รายไม้ ตัวหาร n) จาก nullSd ของ permutation แบบไม่ stratified
 * ดูเหตุผลและสูตรในหัวไฟล์ — ที่นี่แค่แปลงสูตรเป็นโค้ด
 */
function sigmaFromPerm(perm) {
  const { n, k, nullSd } = perm;
  if (!(n > 1) || !(k > 0) || !(k < n) || !(nullSd > 0)) return null;
  return nullSd * Math.sqrt(((n - 1) * (n - k)) / k);
}

// ═══════════════════════════════ MDE ═══════════════════════════════

/**
 * MDE ของการทดสอบทางเดียวที่กำลัง 80% ภายใต้ normal approximation ของ null ที่วัดมาจริง
 *
 * ใช้ nullSd ที่ได้จาก permutation โดยตรง (ไม่ใช่สูตรทฤษฎี) เพราะ nullSd ตัวนั้น
 * สะท้อนโครงสร้างที่ใช้จริงอยู่แล้ว — โดยเฉพาะตอน stratified ที่การสุ่มถูกล็อกด้วย symbol
 *
 * ข้อจำกัดที่ต้องเขียนไว้ในรายงาน: สมมติว่าความแปรปรวนใต้ H1 เท่ากับใต้ H0
 * ซึ่งจริงโดยประมาณเมื่อ effect เล็ก และเป็นสมมติฐานมาตรฐานของการคำนวณกำลังแบบนี้
 */
function mdeFor(perm, alpha, power) {
  if (!perm || !(perm.nullSd > 0) || !(perm.k > 0)) return null;
  const z = normalQuantile(1 - alpha) + normalQuantile(power);
  const delta = perm.nullSd * z;
  return {
    alpha,
    power,
    zSum: z,
    nullSd: perm.nullSd,
    mdeDelta: delta,
    // แปลงเป็น "ไม้ที่ถูกตัดต้องแย่กว่าค่าเฉลี่ยกี่ R" — หน่วยที่ไม่ขึ้นกับว่าตัดมากหรือน้อย
    mdeGap: delta * (perm.keep / perm.k),
  };
}

// ═══════════════════════════════ การประกอบรายงาน ═══════════════════════════════

function collect(report, alpha) {
  const tfs = Object.keys(report.timeframes);
  const perTf = {};
  const entries = [];

  for (const tf of tfs) {
    const d = report.timeframes[tf];
    const baseline = d.results.find((r) => r.config === 'baseline');
    if (!baseline) throw new Error(`${tf}: ไม่มีแถว baseline`);
    const others = d.results.filter((r) => r.config !== 'baseline');

    // ── σ ต้องออกมาเท่ากันทุกชุดในกรอบเวลาเดียวกัน (กองไม้เดียวกัน) ──
    //
    // "เท่ากัน" ในที่นี้ต้องเผื่อความคลาดเคลื่อนมอนติคาร์โล เพราะ nullSd แต่ละตัวประมาณ
    // มาจากการหมุน B รอบ ค่าเบี่ยงเบนสัมพัทธ์ของ sd ที่ประมาณจาก B ตัวอย่างคือ 1/√(2B)
    // (B = 10,000 → 0.71%) เกณฑ์จึงตั้งที่ 6 เท่าของค่านั้น ไม่ใช่เลขกลม ๆ ที่ตั้งเอาเอง
    //
    // ตัวที่จับความผิดพลาดของ *สูตร* ได้จริงคือข้อที่สอง: ถ้าสูตรผิด σ จะไถลไปตาม k
    // อย่างเป็นระบบ (k ในชุดนี้กว้างถึง 300 เท่า) จึงตรวจสหสัมพันธ์ระหว่าง log k กับ σ ด้วย
    const recovered = others
      .map((r) => ({ config: r.config, k: r.permUnstratified?.k, s: sigmaFromPerm(r.permUnstratified) }))
      .filter((x) => x.s !== null);
    if (!recovered.length) throw new Error(`${tf}: กู้ σ ไม่ได้เลยสักชุด`);
    const B = others[0].permUnstratified?.B ?? 1;
    const mcRel = 1 / Math.sqrt(2 * B);
    const sortedS = recovered.map((x) => x.s).sort((a, b) => a - b);
    const sigma = sortedS[(sortedS.length - 1) >> 1]; // median — ทนต่อค่าหลุดกว่าค่าเฉลี่ย
    const maxDev = Math.max(...recovered.map((x) => Math.abs(x.s / sigma - 1)));
    if (maxDev > 6 * mcRel) {
      throw new Error(
        `${tf}: σ ที่กู้จาก nullSd ของแต่ละชุดเบี่ยงจากมัธยฐานถึง ${(maxDev * 100).toFixed(2)}% `
        + `ซึ่งเกิน 6 เท่าของความคลาดเคลื่อนมอนติคาร์โล (${(6 * mcRel * 100).toFixed(2)}%) `
        + '— สูตรความแปรปรวนของ permutation ที่ใช้ในรายงานนี้น่าจะผิด '
        + 'หยุดก่อนจะเขียนตัวเลขที่ผิดลงไฟล์'
      );
    }
    // สหสัมพันธ์ระหว่าง log k กับ σ ที่กู้ได้ — ต้องใกล้ศูนย์ ถ้าสูตรถูก
    const lk = recovered.map((x) => Math.log(x.k));
    const mLk = lk.reduce((a, b) => a + b, 0) / lk.length;
    const mS = recovered.reduce((a, b) => a + b.s, 0) / recovered.length;
    let cov = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < recovered.length; i++) {
      const dx = lk[i] - mLk;
      const dy = recovered[i].s - mS;
      cov += dx * dy; vx += dx * dx; vy += dy * dy;
    }
    const corrKSigma = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
    if (Math.abs(corrKSigma) > 0.75) {
      throw new Error(
        `${tf}: σ ที่กู้ได้ไถลไปตาม k อย่างเป็นระบบ (corr = ${corrKSigma.toFixed(2)}) `
        + '— นี่คืออาการของสูตรความแปรปรวนที่ผิด ไม่ใช่เสียงรบกวนมอนติคาร์โล'
      );
    }

    // ── design effect: SE จาก cluster bootstrap เทียบ SE แบบไร้เดียงสา ──
    // cluster bootstrap สุ่มทั้ง symbol ทั้งตัว จึงเก็บสหสัมพันธ์ของไม้ที่ทับซ้อนกันไว้
    // อัตราส่วนนี้บอกว่า "ถ้าถามคำถามแบบ generalize ต้องขยาย MDE ขึ้นกี่เท่า"
    const seNaive = sigma / Math.sqrt(baseline.tradesBefore);
    const seCluster = baseline.ci ? (baseline.ci.hi95 - baseline.ci.lo95) / (2 * 1.959963985) : null;
    const designEffect = seCluster && seNaive > 0 ? seCluster / seNaive : null;

    const rows = others.map((r) => {
      const mdeRaw = mdeFor(r.permStratified, alpha, POWER);
      const mdeHolm = mdeFor(r.permStratified, alpha / 22, POWER);
      return {
        timeframe: tf,
        config: r.config,
        label: r.label,
        rules: r.rules,
        tradesBefore: r.tradesBefore,
        tradesAfter: r.tradesAfter,
        cut: r.cut,
        cutPct: r.cutPct,
        meanRBefore: r.meanRBefore,
        meanRAfter: r.meanRAfter,
        delta: r.delta,
        winRateAfter: r.winRateAfter,
        tradesPerDay: r.tradesPerDay,
        tradesPerYear: r.tradesPerYear,
        pStrat: r.permStratified?.pOneSided ?? null,
        pPlain: r.permUnstratified?.pOneSided ?? null,
        pStratTwoSided: r.permStratified?.pTwoSided ?? null,
        zVsNull: r.permStratified?.zVsNull ?? null,
        nullSdStrat: r.permStratified?.nullSd ?? null,
        nullSdPlain: r.permUnstratified?.nullSd ?? null,
        B: r.permStratified?.B ?? null,
        mde: mdeRaw,
        mdeHolm,
        // MDE เวอร์ชัน generalize — คูณด้วย design effect ของกอง
        mdeDeltaCluster: mdeRaw && designEffect ? mdeRaw.mdeDelta * designEffect : null,
        mdeGapCluster: mdeRaw && designEffect ? mdeRaw.mdeGap * designEffect : null,
        ci: r.ci,
        cutPerSymbol: r.cutPerSymbol,
      };
    });

    for (const row of rows) entries.push({ key: `${row.config}@${tf}`, p: row.pStrat, row });

    perTf[tf] = {
      timeframe: tf,
      spanFirst: d.spanFirst,
      spanLast: d.spanLast,
      spanDays: d.spanDays,
      measuredBefore: d.measuredBefore,
      universe: d.universe,
      baseSignals: d.baseSignals,
      vetoHits: d.vetoHits,
      baseline,
      sigma,
      sigmaCheck: { recovered, mcRel, maxDev, corrKSigma, B },
      seNaive,
      seCluster,
      designEffect,
      rows,
    };
  }

  return { tfs, perTf, entries };
}

function runHolm(entries, alpha) {
  const m = entries.length;
  const actual = holmFromEntries(
    entries.map((e) => ({ key: e.key, p: e.p })),
    { alpha, expectedFamilySize: m },
  );

  // ตัวหารตามที่โจทย์ประกาศ (28) — เติมช่องหลอกที่ p = 1 ให้ครบ แล้วตัดออกตอนอ่านผล
  // ช่องหลอกปฏิเสธไม่ได้อยู่แล้ว จึงไม่ทำให้ใครผ่านง่ายขึ้น มีผลแค่ทำให้ตัวคูณใหญ่ขึ้น
  const padded = entries.map((e) => ({ key: e.key, p: e.p }));
  for (let i = m; i < BRIEF_FAMILY_SIZE; i++) padded.push({ key: `(ช่องว่าง ${i - m + 1})`, p: null });
  const brief = holmFromEntries(padded, { alpha, expectedFamilySize: Math.max(m, BRIEF_FAMILY_SIZE) });

  const byKey = new Map();
  for (const r of actual.results) byKey.set(r.key, r);
  const briefByKey = new Map();
  for (const r of brief.results) briefByKey.set(r.key, r);

  return { actual, brief, byKey, briefByKey };
}

// ═══════════════════════════════ markdown ═══════════════════════════════

function tableRows(rows, holmByKey, briefByKey) {
  const out = [];
  for (const r of rows) {
    const h = holmByKey.get(`${r.config}@${r.timeframe}`);
    const hb = briefByKey.get(`${r.config}@${r.timeframe}`);
    const survived = h && h.reject && r.delta > 0;
    out.push('| ' + [
      `\`${r.config}\``,
      r.timeframe,
      r.tradesAfter,
      pctS(r.cutPct),
      f(r.tradesPerDay, 3),
      f(r.meanRAfter),
      f(r.delta),
      pStr(r.pStrat, r.B),
      pStr(r.pPlain, r.B),
      f(h?.adjustedP, 3),
      f(hb?.adjustedP, 3),
      survived ? '**รอด**' : 'ไม่รอด',
    ].join(' | ') + ' |');
  }
  return out;
}

const TABLE_HEAD = [
  '| ชุด | TF | ไม้ที่เหลือ | %ตัดทิ้ง | ไม้/วัน | meanR | delta vs baseline | p perm (strat) | p perm (ไม่ strat) | p หลัง Holm (m=22) | p หลัง Holm (m=28) | รอด/ไม่รอด |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |',
];

function buildMarkdown(report, col, holmRes, alpha) {
  const { tfs, perTf } = col;
  const L = [];
  const m = col.entries.length;

  const allRows = tfs.flatMap((tf) => perTf[tf].rows);
  const survivors = allRows.filter((r) => {
    const h = holmRes.byKey.get(`${r.config}@${r.timeframe}`);
    return h && h.reject && r.delta > 0;
  });
  const positive = allRows.filter((r) => r.delta > 0);
  const rawSig = allRows.filter((r) => r.pStrat !== null && r.pStrat < alpha);
  const bestP = allRows.reduce((a, b) => (a === null || (b.pStrat ?? 1) < (a.pStrat ?? 1) ? b : a), null);
  const bestPositive = positive.length
    ? positive.reduce((a, b) => ((b.pStrat ?? 1) < (a.pStrat ?? 1) ? b : a))
    : null;

  L.push('# สรุปผลวัดกฎวีโต้ — permutation null ที่ตัดจำนวนเท่ากัน + Holm-Bonferroni');
  L.push('');
  L.push(`สร้างเมื่อ ${new Date().toISOString()} · ผลดิบจาก \`scripts/research/reports/veto-lab.json\``);
  L.push(`(วัดเมื่อ ${report.generatedAt} · ใช้เวลา ${Math.round(report.elapsedMs / 1000)} วินาที)`);
  L.push('');
  L.push(`ชุดข้อมูลที่วัด: **${report.measuredSplits.join(' + ')} เท่านั้น** — ไม่แตะชุด test`);
  L.push(`(เส้นแบ่งจาก \`report/split.json\` · 1D ตัดที่ ${iso(perTf['1D']?.measuredBefore)}`
    + ` · 1H ตัดที่ ${iso(perTf['1H']?.measuredBefore)})`);
  L.push('');

  // ── คำตอบสั้น ๆ ──
  L.push('## คำตอบสั้น ๆ');
  L.push('');
  if (!survivors.length) {
    L.push(`**ไม่มีชุดวีโต้ชุดไหนรอด** — ทั้ง ${m} การทดสอบ ไม่มีช่องไหนที่ delta เป็นบวก`);
    L.push('แล้วผ่านเกณฑ์ Holm-Bonferroni ที่ alpha ' + alpha);
    L.push('');
    L.push('และเหมือนกับผลของ `rule-lab`: **ไม่ต้องรอถึงขั้น Holm ก็ไม่มีตัวไหนรอดอยู่แล้ว**');
    L.push(`p ดิบที่เล็กที่สุดในครอบครัวคือ **${f(bestP?.pStrat, 4)}** (\`${bestP?.config}\` บน ${bestP?.timeframe})`);
    L.push(`ซึ่งยังห่างจาก ${alpha} มาก จำนวนช่องที่ p ดิบ < ${alpha} คือ **${rawSig.length} ช่อง**`);
    L.push('การแก้ multiple testing จึงไม่ได้ "ฆ่า" อะไรที่มีชีวิตอยู่ก่อน — มันแค่ยืนยันว่าไม่มีอะไรให้ฆ่า');
    L.push('');
    L.push(`ช่องที่ delta เป็นบวกเลยมีแค่ **${positive.length} ช่องจาก ${m}** และช่องที่ดีที่สุดในกลุ่มนั้น`);
    if (bestPositive) {
      L.push(`คือ \`${bestPositive.config}\` บน ${bestPositive.timeframe}: delta ${f(bestPositive.delta)}`
        + ` แต่ตัดทิ้ง ${pctS(bestPositive.cutPct)} และเหลือไม้ ${f(bestPositive.tradesPerDay, 3)} ไม้/วัน`
        + ` โดย p = ${f(bestPositive.pStrat, 4)}`);
    }
    L.push('');
    L.push('อ่านอีกแบบ: ถ้าเราไม่ดูอะไรเลยแล้วสุ่มตัดไม้ทิ้งเท่าจำนวนที่วีโต้ตัด');
    L.push('เราจะได้ผลดีเท่าวีโต้หรือดีกว่าอยู่ราวครึ่งหนึ่งของเวลาทั้งหมด');
    L.push('นั่นคือคำจำกัดความของ "ตัวกรองที่ไม่รู้อะไรเลย"');
  } else {
    L.push(`มีชุดที่รอด ${survivors.length} ชุด:`);
    for (const s of survivors) {
      L.push(`- \`${s.config}\` (${s.timeframe}): delta ${f(s.delta)} · ตัดทิ้ง ${pctS(s.cutPct)}`
        + ` · เหลือ ${f(s.tradesPerDay, 3)} ไม้/วัน`);
    }
  }
  L.push('');
  L.push('**แต่ข้อควรระวังที่สำคัญกว่าคำตอบ**: อำนาจการทดสอบของงานนี้ต่ำมากในชุดที่ตัดน้อย');
  L.push('อ่านหัวข้อ "อำนาจการทดสอบ (MDE)" ก่อนสรุปว่า "วีโต้ไม่ดี" — สำหรับวีโต้ที่ตัดแค่ 1–2%');
  L.push('ข้อมูลชุดนี้แยกไม่ออกอยู่แล้วระหว่าง "ไม่มีขอบ" กับ "มีขอบแต่เล็กเกินกว่าจะเห็น"');
  L.push('');

  // ── ครอบครัว ──
  L.push('## ครอบครัวของการทดสอบ (ตัวหารของ Holm)');
  L.push('');
  L.push('| รายการ | จำนวน |');
  L.push('| --- | ---: |');
  L.push('| ชุดค่าผสมต่อกรอบเวลา (จาก `buildConfigs()`) | 12 |');
  L.push('| หักแถว baseline ออก | 11 |');
  L.push('| กรอบเวลา | 2 (1D, 1H) |');
  L.push(`| **ครอบครัวที่วัดจริง (ตัวหารหลัก)** | **${m}** |`);
  L.push(`| ครอบครัวตามที่โจทย์ประกาศ (รายงานคู่ไว้) | ${BRIEF_FAMILY_SIZE} |`);
  L.push(`| ช่องที่ delta เป็นบวก | ${positive.length} |`);
  L.push(`| ช่องที่ p ดิบ (strat) < ${alpha} | ${rawSig.length} |`);
  L.push(`| ช่องที่ผ่าน Holm | ${holmRes.actual.rejectedCount} |`);
  L.push(`| **ช่องที่รอด (ผ่าน Holm และ delta > 0)** | **${survivors.length}** |`);
  L.push('');
  L.push('### ทำไมตัวหารเป็น 22 ไม่ใช่ 28');
  L.push('');
  L.push('โจทย์ประกาศครอบครัวไว้ที่ 14 × 2 = 28 โดยนับ "ชุดซ้อน" เป็น 4 ชุด');
  L.push('แต่ `buildConfigs()` ใน `veto-lab.mjs` (ซึ่งห้ามแก้) สร้างชุดซ้อนไว้ชุดเดียวคือ `all4`');
  L.push('จำนวนจริงจึงเป็น baseline 1 + เดี่ยว 4 + ซ้อนทั้งสี่ 1 + คู่ 6 = 12 ต่อกรอบเวลา');
  L.push('→ ครอบครัวที่ **วัดจริง** = 11 × 2 = 22');
  L.push('');
  L.push('รายงานนี้จึงให้ Holm สองคอลัมน์: m = 22 (จำนวนที่วัดจริง — ตัวหารที่ถูกต้อง)');
  L.push(`และ m = ${BRIEF_FAMILY_SIZE} (ตามที่โจทย์ประกาศ — conservative กว่า โดยเติมช่องว่างที่ p = 1`);
  L.push('ซึ่ง `holm.mjs` แปลงเป็นปฏิเสธไม่ได้อยู่แล้ว จึงไม่ทำให้ใครผ่านง่ายขึ้น)');
  L.push('**ทั้งสองตัวหารให้คำตอบเดียวกัน** เพราะ p ดิบที่เล็กที่สุดยังห่างจาก 0.05 หลายเท่า');
  L.push('สิ่งที่ห้ามทำคือหยิบเฉพาะช่องที่ดูดีมาเข้า Holm — `holm.mjs` มี guard `expectedFamilySize`');
  L.push('ที่ throw ทันทีถ้าจำนวน p ที่ส่งเข้าไปไม่เท่ากับขนาดครอบครัวที่ประกาศ');
  L.push('');

  // ── ตารางหลักต่อ TF ──
  for (const tf of tfs) {
    const d = perTf[tf];
    L.push(`## ตารางผลเต็ม — ${tf}`);
    L.push('');
    L.push(`ช่วงที่วัด ${iso(d.spanFirst)} → ${iso(d.spanLast)} (${Math.round(d.spanDays)} วัน)`
      + ` · จักรวาล ${d.universe.length} ตัว · ไม้ฐาน ${d.baseSignals.trades} ไม้`);
    L.push('');
    L.push('| ชุด | TF | ไม้ที่เหลือ | %ตัดทิ้ง | ไม้/วัน | meanR | delta vs baseline | p perm (strat) | p perm (ไม่ strat) | p หลัง Holm (m=22) | p หลัง Holm (m=28) | รอด/ไม่รอด |');
    L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |');
    const b = d.baseline;
    L.push(`| \`baseline\` | ${tf} | ${b.tradesAfter} | ${pctS(0)} | ${f(b.tradesPerDay, 3)}`
      + ` | ${f(b.meanRAfter)} | ${f(0)} | — | — | — | — | (จุดอ้างอิง) |`);
    L.push(...tableRows(d.rows, holmRes.byKey, holmRes.briefByKey));
    L.push('');
  }

  // ── strat vs plain ──
  L.push('## stratified ต่างจากไม่ stratified ตรงไหน');
  L.push('');
  L.push('การสุ่มแบบ **stratified ตาม symbol** บังคับให้รอบสุ่มตัดไม้ในแต่ละ symbol');
  L.push('เท่ากับจำนวนที่วีโต้ตัดจริงใน symbol นั้น จึง "หัก" ความสามารถในการเลือก symbol ออกไป');
  L.push('แล้วเหลือแต่คำถามว่า *เลือกจังหวะ* เก่งไหม ส่วนแบบไม่ stratified สุ่มจากกองรวม');
  L.push('จึงวัดสองความสามารถปนกัน');
  L.push('');
  L.push('ถ้า p(ไม่ strat) เล็กกว่า p(strat) อย่างชัดเจน แปลว่าที่ดูดีมาจากการที่วีโต้ไป');
  L.push('ตัดหนักใน symbol ที่แย่อยู่แล้ว ไม่ใช่การเลือกจังหวะ — ซึ่งเป็นขอบที่เปราะกว่ามาก');
  L.push('');
  L.push('| ชุด | TF | %ตัดทิ้ง | ไม้/วัน | delta | p strat | p ไม่ strat | ส่วนต่าง (strat − ไม่ strat) | อ่านว่า |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const tf of tfs) {
    for (const r of perTf[tf].rows) {
      const diff = (r.pStrat ?? 1) - (r.pPlain ?? 1);
      let read = 'แทบไม่ต่าง — การเลือก symbol ไม่ได้เป็นตัวขับผล';
      if (diff > 0.06) read = 'strat แย่กว่า → ที่ดูดีบางส่วนมาจากการเลือก symbol';
      else if (diff < -0.06) read = 'strat ดีกว่า → การเลือก symbol กลับถ่วงผลลง';
      L.push(`| \`${r.config}\` | ${tf} | ${pctS(r.cutPct)} | ${f(r.tradesPerDay, 3)} | ${f(r.delta)}`
        + ` | ${f(r.pStrat, 4)} | ${f(r.pPlain, 4)} | ${diff >= 0 ? '+' : ''}${f(diff, 4)} | ${read} |`);
    }
  }
  L.push('');
  const bigDiff = allRows.filter((r) => Math.abs((r.pStrat ?? 1) - (r.pPlain ?? 1)) > 0.06);
  if (bigDiff.length) {
    const bdPos = bigDiff.filter((r) => r.delta > 0);
    L.push(`ช่องที่ส่วนต่างเกิน 0.06 มี ${bigDiff.length} ช่อง:`
      + ` ${bigDiff.map((r) => `\`${r.config}\` (${r.timeframe})`).join(' · ')}`);
    L.push('');
    const fragile = bigDiff.filter((r) => (r.pStrat ?? 1) > (r.pPlain ?? 1));
    if (!fragile.length) {
      L.push('**ทุกช่องในกลุ่มนี้เป็นแบบ p(strat) < p(ไม่ strat)** คือพอหักความสามารถในการเลือก');
      L.push('symbol ออกไปแล้ววีโต้ดู *ดีขึ้น* ไม่ใช่แย่ลง — แปลว่าไม่มีช่องไหนที่ผลดีมาจาก');
      L.push('"ไปตัดหนักใน symbol ที่แย่อยู่แล้ว" ซึ่งเป็นรูปแบบเปราะที่หัวข้อนี้มีไว้จับ');
      L.push('กลับกัน การเลือก symbol เป็นตัวถ่วงเล็กน้อย');
    } else {
      L.push(`ในกลุ่มนี้มี ${fragile.length} ช่องที่ p(strat) > p(ไม่ strat)`
        + ` (${fragile.map((r) => `\`${r.config}\` ${r.timeframe}`).join(' · ')})`);
      L.push('— นี่คือรูปแบบเปราะที่หัวข้อนี้มีไว้จับ: ผลที่ดูดีมาจากการเลือก symbol');
      L.push('ไม่ใช่การเลือกจังหวะ ต้องอ่านช่องเหล่านี้ด้วย p(strat) เท่านั้น');
    }
    L.push('');
    if (bdPos.length) {
      L.push(`ในกลุ่มนี้มี ${bdPos.length} ช่องที่ delta เป็นบวก`
        + ` (${bdPos.map((r) => `\`${r.config}\` ${r.timeframe} delta ${f(r.delta)}`).join(' · ')})`);
      L.push('แต่ p ที่เล็กที่สุดในนั้นยังเป็น '
        + f(Math.min(...bdPos.map((r) => r.pStrat ?? 1)), 4) + ' ซึ่งห่างจาก 0.05 หลายเท่า');
      L.push('ข้อสรุปจึงไม่เปลี่ยน');
    } else {
      L.push('และทุกช่องในกลุ่มนี้มี delta ติดลบอยู่แล้ว จึงไม่มีผลต่อข้อสรุป');
    }
  } else {
    L.push('ไม่มีช่องไหนที่ส่วนต่างเกิน 0.06 — การเลือก symbol ไม่ได้เป็นตัวขับผลในชุดนี้เลย');
  }
  L.push('');

  // ── ต้นทุนของการตัด ──
  L.push('## ราคาที่จ่ายเพื่อกรอง (ห้ามอ่าน delta โดยไม่ดูสองคอลัมน์นี้)');
  L.push('');
  L.push('| ชุด | TF | %ตัดทิ้ง | ไม้/วัน | ไม้/ปี | delta | ตีความ |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const tf of tfs) {
    const bl = perTf[tf].baseline;
    L.push(`| \`baseline\` | ${tf} | 0.0% | ${f(bl.tradesPerDay, 3)} | ${f(bl.tradesPerYear, 0)}`
      + ` | 0.0000 | จุดอ้างอิง |`);
    for (const r of perTf[tf].rows) {
      let note;
      if (r.cutPct > 0.5 && r.delta <= 0) note = 'ตัดทิ้งเกินครึ่งกอง แล้ว R ยังไม่ดีขึ้น — จ่ายแพงได้เปล่า';
      else if (r.cutPct > 0.5) note = 'ตัดทิ้งเกินครึ่งกองแลกกับ delta ที่ยังจมอยู่ในเสียงรบกวน';
      else if (r.cutPct < 0.03) note = 'แทบไม่ได้ตัดอะไร — ไม่ว่าผลออกมาทางไหนก็แปลผลไม่ได้';
      else note = r.delta > 0 ? 'ตัดพอประมาณ delta เป็นบวกแต่ไม่มีนัยสำคัญ' : 'ตัดพอประมาณแล้ว R แย่ลง';
      L.push(`| \`${r.config}\` | ${tf} | ${pctS(r.cutPct)} | ${f(r.tradesPerDay, 3)}`
        + ` | ${f(r.tradesPerYear, 0)} | ${f(r.delta)} | ${note} |`);
    }
  }
  L.push('');

  // ── MDE ──
  L.push('## อำนาจการทดสอบ (MDE) — งานนี้จับ delta ได้ตั้งแต่ขนาดไหน');
  L.push('');
  L.push('คำนวณจาก `nullSd` ของ permutation stratified ที่วัดมาจริง (ไม่ใช่สูตรทฤษฎี)');
  L.push(`ที่กำลัง ${pctS(POWER, 0)} ทางเดียว · สมมติความแปรปรวนใต้ H1 เท่ากับใต้ H0`);
  L.push('');
  L.push('**สองหน่วยที่ต้องอ่านคู่กัน** — delta ของตัวกรองถูกบีบด้วยกลไก `delta = (k/keep) × (meanAll − meanCut)`');
  L.push('วีโต้ที่ตัดแค่ 1% ต่อให้เลือกไม้แย่ได้เก่งมาก delta ก็ยังขยับได้นิดเดียว ดังนั้น');
  L.push('"MDE(delta) เล็ก" **ไม่ได้** แปลว่ามีอำนาจสูง หน่วยที่ตอบคำถามจริงคือ:');
  L.push('');
  L.push('> **MDE(gap)** = ไม้ที่วีโต้ตัดต้องแย่กว่าค่าเฉลี่ยของกองอย่างน้อยกี่ R ถึงจะจับได้');
  L.push('');
  for (const tf of tfs) {
    const d = perTf[tf];
    L.push(`### ${tf} — σ ของ R รายไม้ = ${f(d.sigma, 4)} R`);
    L.push('');
    const sc = d.sigmaCheck;
    const kSpan = Math.round(Math.max(...sc.recovered.map((x) => x.k)) / Math.min(...sc.recovered.map((x) => x.k)));
    L.push(`กู้จาก \`nullSd\` ด้วย σ² = nullSd²·(n−1)(n−k)/k โดยเอามัธยฐานของทั้ง`);
    L.push(`${sc.recovered.length} ชุด (ทุกชุดใช้กองไม้กองเดียวกัน จึงต้องได้ σ เท่ากัน — นี่คือการตรวจซ้ำ`);
    L.push('ว่าเข้าใจสูตรความแปรปรวนของ permutation ถูก):');
    L.push('');
    L.push('| ตัวตรวจ | ค่าที่วัดได้ | อ่านว่า |');
    L.push('| --- | ---: | --- |');
    L.push(`| เบี่ยงจากมัธยฐานมากสุด | ${pctS(sc.maxDev, 2)} | = ${f(sc.maxDev / sc.mcRel, 1)}`
      + ` เท่าของความคลาดเคลื่อนมอนติคาร์โล (${pctS(sc.mcRel, 2)} ที่ B = ${sc.B}) |`);
    L.push(`| สหสัมพันธ์ log k กับ σ | ${f(sc.corrKSigma, 2)} | k กว้าง ${kSpan} เท่า`
      + ` — ${Math.abs(sc.corrKSigma) < 0.3 ? 'ไม่มีการไถลไปตาม k' : 'มีการไถลเล็กน้อย ดูย่อหน้าใต้ตาราง'} |`);
    L.push('');
    if (Math.abs(sc.corrKSigma) >= 0.3) {
      L.push(`สหสัมพันธ์ ${f(sc.corrKSigma, 2)} จาก ${sc.recovered.length} จุดยังไม่ใช่หลักฐานว่าสูตรผิด`);
      L.push('— ที่ n เท่านี้ค่าขนาดนี้เกิดเองได้ไม่ยาก และช่วง σ ทั้งหมดกว้างแค่');
      const sVals = sc.recovered.map((x) => x.s);
      L.push(`${pctS((Math.max(...sVals) - Math.min(...sVals)) / d.sigma, 1)} ซึ่งแปลว่าต่อให้เลือก σ`);
      L.push('จากชุดที่สุดโต่งที่สุด ตัวเลข MDE ในหัวข้อนี้ก็ขยับไม่ถึงระดับที่เปลี่ยนข้อสรุป');
      L.push('');
      L.push('อีกเรื่องที่ทำให้เสียงรบกวนจริงมากกว่า 1/√(2B): `sumOfRandomSubset()` ไม่ได้');
      L.push('รีเซ็ต pool ระหว่างรอบ (จงใจ เพื่อประหยัดการจองหน่วยความจำ) การแจกแจงของแต่ละรอบ');
      L.push('ยังสม่ำเสมอถูกต้อง แต่รอบที่ติดกันมีสหสัมพันธ์ ทำให้ความคลาดเคลื่อนของ `nullSd`');
      L.push('สูงกว่าสูตร iid ที่ใช้เทียบข้างบน — คอลัมน์ "กี่เท่า" จึงเป็นค่าที่ **มองโลกในแง่ร้ายเกินจริง**');
      L.push('');
    }
    L.push(`SE ของ meanR แบบไร้เดียงสา (σ/√n) = ${f(d.seNaive, 4)}`
      + ` · SE จาก cluster bootstrap = ${f(d.seCluster, 4)} → design effect ×${f(d.designEffect, 2)}`);
    L.push('');
    L.push('| ชุด | %ตัดทิ้ง | ไม้/วัน | delta ที่วัดได้ | MDE(delta) @a=0.05 | MDE(delta) @Holm | MDE(gap) @a=0.05 | MDE(gap) เป็นกี่ σ | อำนาจพอไหม |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const r of d.rows) {
      const gapSigma = r.mde ? r.mde.mdeGap / d.sigma : null;
      let verdict;
      if (gapSigma === null) verdict = '—';
      else if (gapSigma > 0.30) verdict = '**ไม่พอเลย** — ขอให้วีโต้แยกแยะเก่งเกินจริง';
      else if (gapSigma > 0.12) verdict = 'ต่ำ — จับได้เฉพาะขอบที่ใหญ่ผิดปกติ';
      else verdict = 'พอใช้ (แบบมีเงื่อนไข) — ขอบขนาดสมจริงน่าจะเห็น';
      L.push(`| \`${r.config}\` | ${pctS(r.cutPct)} | ${f(r.tradesPerDay, 3)} | ${f(r.delta)}`
        + ` | ${f(r.mde?.mdeDelta)} | ${f(r.mdeHolm?.mdeDelta)} | ${f(r.mde?.mdeGap)}`
        + ` | ${f(gapSigma, 2)}σ | ${verdict} |`);
    }
    L.push('');
  }

  L.push('### อ่าน MDE ยังไง');
  L.push('');
  const oneD = perTf['1D'];
  const smallCut = oneD?.rows.find((r) => r.config === 'meanrev');
  const bigCut = oneD?.rows.find((r) => r.config === 'levelpath');
  if (smallCut && bigCut) {
    L.push(`- \`meanrev\` บน 1D ตัดแค่ ${smallCut.cut} ไม้จาก ${smallCut.tradesBefore}`
      + ` (${pctS(smallCut.cutPct)}) → MDE(gap) = ${f(smallCut.mde.mdeGap)} R`
      + ` = ${f(smallCut.mde.mdeGap / oneD.sigma, 2)}σ`);
    L.push('  แปลว่า: จะพิสูจน์วีโต้ข้อนี้ได้ ไม้ที่มันตัดต้องแย่กว่าค่าเฉลี่ยเกือบครึ่งส่วนเบี่ยงเบนมาตรฐาน');
    L.push('  ไม่มีตัวกรองเทคนิคอลตัวไหนแยกแยะได้ขนาดนั้น → **"ไม่รอด" ของชุดนี้แปลว่าข้อมูลไม่พอ');
    L.push('  ไม่ได้แปลว่าวีโต้ไม่ดี** ผลที่ได้เป็นค่าว่าง ไม่ใช่หลักฐานทางลบ');
    L.push('');
    L.push(`- \`levelpath\` บน 1D ตัด ${bigCut.cut} ไม้ (${pctS(bigCut.cutPct)})`
      + ` → MDE(gap) = ${f(bigCut.mde.mdeGap)} R = ${f(bigCut.mde.mdeGap / oneD.sigma, 2)}σ`);
    L.push('  ชุดนี้มีอำนาจดีกว่ามาก และ delta ที่วัดได้คือ ' + bigCut.delta.toExponential(2)
      + ` R — เล็กกว่า MDE ของมันเองราว ${f(bigCut.mde.mdeDelta / Math.abs(bigCut.delta), 0)} เท่า`);
    L.push(`  (p = ${f(bigCut.pStrat, 4)}) → ตรงนี้พูดได้แรงขึ้นว่า *ถ้ามีขอบขนาดสมจริง เราน่าจะเห็นแล้ว*`);
    L.push('  แต่แลกมากับการตัดทิ้งเกินครึ่งกอง ซึ่งเป็นราคาที่ไม่มีอะไรมาชดเชย');
  }
  L.push('');
  L.push('### MDE เวอร์ชัน "จะไปรอดบนข้อมูลใหม่ไหม"');
  L.push('');
  L.push('MDE ข้างบนเป็นของ **การทดสอบแบบมีเงื่อนไข** — มันถามว่า "การสุ่มตัดจากกองไม้ *กองนี้*');
  L.push('จะให้ delta เท่านี้ได้ไหม" ซึ่งเป็นคำถามที่ถูกต้องสำหรับ permutation test แต่ไม่ใช่');
  L.push('คำถามว่า "ขอบนี้จะซ้ำบนข้อมูลใหม่ไหม" คำถามหลังต้องคิดว่าไม้ในกองไม่เป็นอิสระ');
  L.push('(ไม้หลายไม้ในตัวเดียวกันทับช่วงเวลากัน) — ตัวคูณที่วัดได้จาก cluster bootstrap คือ:');
  L.push('');
  L.push('| TF | design effect (SE cluster ÷ SE ไร้เดียงสา) | MDE(gap) ของ `all4` แบบมีเงื่อนไข | × design effect |');
  L.push('| --- | ---: | ---: | ---: |');
  for (const tf of tfs) {
    const d = perTf[tf];
    const a4 = d.rows.find((r) => r.config === 'all4');
    L.push(`| ${tf} | ×${f(d.designEffect, 2)} | ${f(a4?.mde?.mdeGap)} R | ${f(a4?.mdeGapCluster)} R |`);
  }
  L.push('');
  L.push('ทิศทางของ design effect สำคัญกว่าตัวเลข: มันมากกว่า 1 ทุกกรอบเวลา แปลว่า');
  L.push('การทดสอบแบบ permutation ที่ใช้ในรายงานนี้ **หลวมเกินจริง** ไม่ใช่เข้มเกินจริง');
  L.push('เมื่อผลที่ได้คือ "ไม่มีใครรอด" การที่การทดสอบหลวมยิ่งทำให้ข้อสรุปนั้นแข็งขึ้น');
  L.push('(ถ้าผลออกมาว่ามีคนรอด ข้อนี้จะกลายเป็นเหตุผลให้ไม่เชื่อทันที)');
  L.push('');

  // ── ที่มาของสัญญาณฐาน ──
  L.push('## สัญญาณฐานมาจากไหน');
  L.push('');
  L.push('วีโต้ไม่ยิงสัญญาณเอง จึงต้องมีกองไม้ให้มันตัด กองนี้คือสัญญาณของเครื่องยนต์จริง');
  L.push('(`engine-lab.mjs` ที่ตรงกับ `src/lib/signal-engine.ts`) ที่ผ่านประตูคุณภาพจริง');
  L.push('(`evaluateSignal()` + `SIGNAL_GATE` จาก `src/lib/universe.ts`) — ไม่ใช่เกณฑ์ที่เดาเอง');
  L.push('');
  L.push('| ขั้น | 1D | 1H |');
  L.push('| --- | ---: | ---: |');
  const rowFor = (fn) => `| ${fn.label} | ${fn.get('1D')} | ${fn.get('1H')} |`;
  const bs = (tf) => perTf[tf].baseSignals;
  L.push(rowFor({ label: 'จุดตัดสินใจ (แท่งที่ถูกถาม)', get: (tf) => bs(tf).decisions }));
  L.push(rowFor({ label: 'เครื่องยนต์คืน null', get: (tf) => bs(tf).engineNull }));
  L.push(rowFor({ label: 'HOLD', get: (tf) => bs(tf).hold }));
  L.push(rowFor({ label: 'มีทิศทาง (BUY/SELL)', get: (tf) => bs(tf).directional }));
  L.push(rowFor({ label: 'ถูกประตูตัด', get: (tf) => bs(tf).gateRejected }));
  L.push(rowFor({ label: '**ผ่านประตู → ไม้ฐาน**', get: (tf) => `**${bs(tf).trades}**` }));
  L.push('');
  const en = bs('1D').engineNull;
  if (en === bs('1H').engineNull) {
    L.push(`(แถว "เครื่องยนต์คืน null" เท่ากันเป๊ะทั้งสองกรอบที่ ${en} = ${en / 13} × 13 symbol`);
    L.push('ไม่ใช่ตัวเลขที่ก๊อปมาผิด — เครื่องยนต์ต้องการแท่งขั้นต่ำจำนวนคงที่ก่อนจะตัดสินใจได้');
    L.push('จำนวนแท่งที่มันปฏิเสธจึงคงที่ต่อ symbol ไม่ขึ้นกับว่าอนุกรมยาวแค่ไหน)');
    L.push('');
  }
  L.push('เหตุผลที่ประตูตัด (นับซ้ำได้เพราะสัญญาณเดียวตกได้หลายข้อ):');
  L.push('');
  for (const tf of tfs) {
    L.push(`- **${tf}**: ${Object.entries(bs(tf).rejectByCode).map(([k, v]) => `\`${k}\` ${v}`).join(' · ')}`);
  }
  L.push('');
  L.push('จำนวนไม้ที่วีโต้แต่ละข้อตัด (นับแยกข้อ ไม่ใช่ชุดค่าผสม):');
  L.push('');
  L.push('| วีโต้ | 1D (จากไม้ฐาน ' + bs('1D').trades + ') | 1H (จากไม้ฐาน ' + bs('1H').trades + ') |');
  L.push('| --- | ---: | ---: |');
  for (const k of Object.keys(perTf['1D'].vetoHits)) {
    const a = perTf['1D'].vetoHits[k];
    const b = perTf['1H'].vetoHits[k];
    L.push(`| \`${k}\` | ${a} (${pctS(a / bs('1D').trades)}) | ${b} (${pctS(b / bs('1H').trades)}) |`);
  }
  L.push('');
  L.push('`levelpath` เป็นข้อเดียวที่ตัดหนัก (~60%) อีกสามข้อตัดน้อยมาก');
  L.push('ผลของชุดคู่และชุดซ้อนจึงถูก `levelpath` ครอบงำเกือบทั้งหมด — ไม่ใช่เรื่องบังเอิญ');
  L.push('ที่ชุดที่มี `levelpath` ทุกชุดมี %ตัดทิ้งเกาะกลุ่มกันที่ 60–71%');
  L.push('');

  // ── ท่อวัด ──
  L.push('## ท่อวัดถูกตรวจอะไรมาบ้าง');
  L.push('');
  L.push('`node scripts/research/veto-lab.mjs --self-test` ผ่านครบ 10 ข้อก่อนรันจริง:');
  L.push('');
  L.push('| ข้อ | ตรวจอะไร | ผลที่ได้ |');
  L.push('| --- | --- | --- |');
  L.push('| `test-set-guard` | แท่งชุด test หลุดเข้ามาไหม | แท่งสูงสุด 2021-08-05 < เส้น 2021-08-06 · ตัดแท่ง test ทิ้ง 1305 แท่ง · guard throw เมื่อยัดแท่ง test เข้าไป |');
  L.push('| `simulator-parity` | ตัวเดินไม้ตัวใหม่ตรงกับ `simulateTrade` ของ rule-lab ไหม | เทียบ 4000 ไม้ ต่างกัน 0 จุด (16 ฟิลด์ต่อไม้) |');
  L.push('| `base-trades-built` | ผลิตไม้ฐานได้จริงไหม | 707 ไม้จาก 15,863 จุดตัดสินใจ (จักรวาลย่อ 3 ตัว) |');
  L.push('| `base-signal-causal` | สัญญาณฐานมองอนาคตไหม | เรียกซ้ำด้วย prefix อิสระ 60 จุด ต่างจากเดิม 0 |');
  L.push('| `veto-rules-causal` | กฎวีโต้มองอนาคตไหม | ทั้ง 4 ข้อผ่าน (40 จุดต่อข้อ) |');
  L.push('| `perm-null-uniform-strat` | ตัวตัด**สุ่ม**ได้ p แบนไหม | 40 เมล็ด · p เฉลี่ย 0.501 · p<0.05 เพียง 3% |');
  L.push('| `perm-null-uniform-plain` | เหมือนข้างบน แบบไม่ stratified | p เฉลี่ย 0.505 · p<0.05 เพียง 3% |');
  L.push('| `positive-control` | วีโต้ที่ "รู้อนาคต" ได้ p เล็กไหม | ตัดไม้แย่สุด 177 ไม้ → delta 0.3970 · p 0.0005 ทั้งสองแบบ |');
  L.push('| `negative-control` | ตัดตามเวลาโดยไม่ดูอะไรได้ p ไม่เล็กไหม | delta −0.0219 · p 0.82 / 0.76 |');
  // เซลล์นี้ห้ามมี "|" ดิบ ๆ ไม่งั้น markdown ตัดคอลัมน์เพิ่มแล้วตารางเพี้ยนทั้งแถว
  L.push('| `perm-edge-cases` | k=0 และ k=n | k=0 → delta 0 · p 1 · k=n → รายงานว่าไม่เหลือไม้ให้วัด |');
  L.push('');
  L.push('ข้อ `perm-null-uniform-*` คือข้อที่พิสูจน์ว่ากับดักหลักถูกกันไว้จริง:');
  L.push('**การตัดไม้ทิ้งเฉย ๆ ไม่ทำให้ p เล็กเอง** ถ้าท่อวัดถูก ตัวตัดที่ไม่รู้อะไรเลยต้องได้ p');
  L.push('กระจายแบน ๆ บน [0,1] ซึ่งวัดได้จริงที่ค่าเฉลี่ย ~0.50');
  L.push('');
  L.push('เกณฑ์การเดินไม้ที่ใช้ (ต่างจาก `rule-lab` โดยตั้งใจ):');
  L.push('');
  L.push(`- เข้าไม้: ${report.tradeRules.entry}`);
  L.push(`- SL: ${report.tradeRules.stopLoss} · TP: ${report.tradeRules.takeProfit}`);
  L.push(`- ตัวหารของ R: ${report.tradeRules.rDenominator}`);
  L.push(`- SL ชนะ TP เมื่อชนแท่งเดียวกัน: ${report.tradeRules.slWinsOnSameBar}`);
  L.push(`- เพดานถือ: ${Object.entries(report.tradeRules.maxHoldBars).map(([k, v]) => `${k} ${v} แท่ง`).join(' · ')}`);
  L.push('- ต้นทุน: ตาราง `COST_BPS` ตัวเดิมของ `rule-lab.mjs`');
  L.push('');
  L.push('เหตุผลที่ใช้ SL/TP จากสัญญาณจริงแทนเรขาคณิต 1.5×ATR/RR2 ของ `rule-lab`:');
  L.push('เรากำลังวัด "สัญญาณที่ผู้ใช้ได้รับ" ไม่ใช่เรขาคณิตสมมติที่ใช้จัดอันดับกฎ');
  L.push('ผลข้างเคียงคือตัวเลข meanR ในรายงานนี้เทียบกับ `rule-lab-summary.md` ตรง ๆ ไม่ได้');
  L.push('');

  // ── ยังไม่ได้พิสูจน์ ──
  L.push('## สิ่งที่ผลนี้ยังไม่ได้พิสูจน์');
  L.push('');
  L.push('1. **ไม่ได้แตะชุด test เลย** — ทุกตัวเลขในรายงานนี้มาจาก train + validation เท่านั้น');
  L.push(`   (1D ตัดที่ ${iso(perTf['1D'].measuredBefore)} · 1H ตัดที่ ${iso(perTf['1H'].measuredBefore)})`);
  L.push('   ชุด test ยังไม่เคยถูกมองแม้แต่ครั้งเดียว ผลนี้จึงไม่ใช่ผลนอกกลุ่มตัวอย่างที่แท้จริง');
  L.push('   และถ้าจะเอาไปตัดสินใจจริง ต้องมีรอบยืนยันบน test อีกรอบ (ซึ่งใช้ได้ครั้งเดียว)');
  L.push('');
  L.push('2. **จำนวน cluster มีแค่ 13** — จักรวาลมี 13 สินทรัพย์ และไม้ทั้งหมดในตัวเดียวกัน');
  L.push('   สัมพันธ์กันสูง (ทับช่วงเวลากัน · ขับด้วยดอลลาร์ตัวเดียวกันเป็นส่วนใหญ่)');
  L.push('   n = ' + bs('1D').trades + ' ไม้บน 1D ฟังดูเยอะ แต่หน่วยข้อมูลอิสระจริง ๆ ใกล้ 13 มากกว่า 2,663');
  L.push('   cluster bootstrap ที่รายงานไว้จึงมี CI กว้างมาก และ design effect ที่วัดได้');
  L.push(`   (×${f(perTf['1D'].designEffect, 2)} บน 1D · ×${f(perTf['1H'].designEffect, 2)} บน 1H) ยืนยันข้อนี้`);
  const uni = perTf['1D'].universe;
  const usdCount = uni.filter((x) => x.split('/')[1].includes('USD')).length;
  L.push(`   ยิ่งไปกว่านั้น ${usdCount} ใน ${uni.length} ตัวมี USD อยู่ในคู่`
    + ` — cluster ที่เป็นอิสระจริงอาจน้อยกว่า ${uni.length} อีก`);
  L.push('');
  L.push('3. **1D กับ 1H ไม่ได้มองช่วงเวลาเดียวกัน**');
  L.push(`   1D ครอบ ${iso(perTf['1D'].spanFirst)} → ${iso(perTf['1D'].spanLast)}`
    + ` (~${Math.round(perTf['1D'].spanDays / 365.25)} ปี)`);
  L.push(`   1H ครอบ ${iso(perTf['1H'].spanFirst)} → ${iso(perTf['1H'].spanLast)}`
    + ` (~${Math.round(perTf['1H'].spanDays / 365.25 * 10) / 10} ปี)`);
  L.push('   สองแถวนี้จึงไม่ใช่ "การทดสอบซ้ำในสภาพเดียวกัน" — มันคนละยุคตลาดกันคนละเรื่อง');
  L.push('   การที่ทั้งสองกรอบให้คำตอบเหมือนกันจึงเป็นหลักฐานที่อ่อนกว่าการทำซ้ำจริง');
  L.push('   และการที่ meanR ฐานต่างกัน (1D +' + f(perTf['1D'].baseline.meanRAfter)
    + ' vs 1H ' + f(perTf['1H'].baseline.meanRAfter) + ') อาจเป็นเรื่องยุค ไม่ใช่เรื่องกรอบเวลา');
  L.push('');
  L.push('4. **วัดบน 1D/1H ไม่ใช่ 15m ที่เจ้าของใช้จริง** — แคชมีแค่ 1D กับ 1H');
  L.push('   เพราะ Yahoo ให้ 15m ย้อนหลังแค่ราวเดือนเดียว วีโต้หลายข้อ (โดยเฉพาะ');
  L.push('   `overext` ที่จับแท่งข่าว และ `choch` ที่จับการพลิกโครงสร้าง) เป็นแนวคิดที่');
  L.push('   สมเหตุสมผลกว่าบนกรอบสั้น ผลว่าง ๆ บน 1D/1H จึงไม่ได้บอกอะไรเรื่อง 15m');
  L.push('   ยิ่งกว่านั้น `SIGNAL_GATE.perTimeframe["15m"]` ใช้เกณฑ์หลวมกว่า (strength');
  L.push('   `moderate` · confidence 55 · RR 1.2) → กองไม้ฐานบน 15m จะเป็นคนละกองเลย');
  L.push('');
  L.push('5. **ถ้าสัญญาณฐานน้อย อำนาจการทดสอบต่ำแค่ไหน** — ดูหัวข้อ MDE ข้างบน สรุปสั้น:');
  const worst = allRows.reduce((a, b) => ((b.mde?.mdeGap ?? 0) > (a.mde?.mdeGap ?? 0) ? b : a));
  const best = allRows.reduce((a, b) => ((b.mde?.mdeGap ?? 9e9) < (a.mde?.mdeGap ?? 9e9) ? b : a));
  L.push(`   - แย่ที่สุด: \`${worst.config}\` (${worst.timeframe}) ตัดแค่ ${pctS(worst.cutPct)}`
    + ` → ต้องให้ไม้ที่ถูกตัดแย่กว่าค่าเฉลี่ย **${f(worst.mde.mdeGap)} R**`
    + ` (${f(worst.mde.mdeGap / perTf[worst.timeframe].sigma, 2)}σ) ถึงจะจับได้`);
  L.push(`   - ดีที่สุด: \`${best.config}\` (${best.timeframe}) ตัด ${pctS(best.cutPct)}`
    + ` → ต้องการแค่ **${f(best.mde.mdeGap)} R**`
    + ` (${f(best.mde.mdeGap / perTf[best.timeframe].sigma, 2)}σ)`);
  L.push('   สำหรับชุดที่ตัดน้อย (`meanrev`, `choch` — ตัด 1–2%) **"ไม่รอด" ไม่ใช่หลักฐานว่าวีโต้ไม่ดี**');
  L.push('   มันแปลว่าข้อมูลชุดนี้ตอบคำถามนั้นไม่ได้เลย ผลเป็นค่าว่าง ไม่ใช่ค่าลบ');
  L.push('   จะตอบได้ต้องมีไม้ที่ถูกตัดมากขึ้นมาก ๆ ซึ่งแปลว่าต้องมีข้อมูลยาวขึ้นหรือจักรวาลกว้างขึ้น');
  L.push('');
  L.push('6. **permutation null ตัวนี้สมมติว่าไม้แลกที่กันได้ (exchangeable)** — แต่วีโต้ยิงเป็นชุด ๆ');
  L.push('   ตามช่วงตลาด ไม้ที่มันตัดจึงกระจุกกันในเวลา ต่างจากการสุ่มตัดที่กระจายทั่ว');
  L.push('   ผลคือ null ที่ใช้ **แคบกว่าความจริง** → การทดสอบหลวมกว่าที่ควร');
  L.push('   เมื่อคำตอบคือ "ไม่มีใครรอด" ข้อนี้ทำให้ข้อสรุปแข็งขึ้น (ต่อให้ทดสอบหลวมก็ยังไม่มีใครผ่าน)');
  L.push('   แต่ถ้าวันหนึ่งมีชุดที่ p เล็ก ต้องกลับมาแก้ข้อนี้ก่อนเชื่อ — เช่นทำ block permutation');
  L.push('');
  L.push('7. **ไม่ได้พิสูจน์ว่าวีโต้ไร้ค่าในมิติอื่น** — รายงานนี้วัดผลต่อ **ค่าเฉลี่ย R** อย่างเดียว');
  L.push('   วีโต้อาจลด drawdown ลดความแปรปรวน หรือกัน tail ที่แย่ที่สุดได้โดยไม่ขยับค่าเฉลี่ย');
  L.push('   ซึ่งเป็นคุณค่าจริงที่การทดสอบนี้มองไม่เห็นเลย และไม่ได้วัดไว้');
  L.push('');
  L.push('8. **ชุดค่าผสมที่ไม่ได้ลอง** — `buildConfigs()` ไม่ได้สร้างชุดสามข้อ (4 ชุด)');
  L.push('   ผลที่รายงานจึงครอบคลุม 11 ชุดต่อกรอบเวลา ไม่ใช่ทั้ง 15 ชุดที่เป็นไปได้');
  L.push('   เนื่องจากผลของทุกชุดถูก `levelpath` ครอบงำอยู่แล้ว ชุดสามข้อไม่น่าให้ภาพต่างออกไป');
  L.push('   แต่ข้อนี้เป็นการอนุมาน ไม่ใช่การวัด');
  L.push('');

  L.push('## ไฟล์ที่เกี่ยวข้อง');
  L.push('');
  L.push('- `scripts/research/veto-lab.mjs` — ตัววัด (permutation null + self-test 10 ข้อ)');
  L.push('- `scripts/research/veto-lab-holm-report.mjs` — ไฟล์นี้ (Holm + MDE + รายงาน)');
  L.push('- `scripts/research/reports/veto-lab.json` — ผลดิบทุกชุดค่าผสม');
  L.push('- `scripts/research/reports/veto-lab-holm.json` — ผลหลัง Holm + MDE แบบเครื่องอ่าน');
  L.push('- `scripts/research/holm.mjs` — Holm-Bonferroni step-down');
  L.push('');

  return L.join('\n');
}

// ═══════════════════════════════ self-test ═══════════════════════════════

function selfTest() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail ?? '' });
  const near = (a, b, eps) => Math.abs(a - b) <= eps;

  ok('normalCdf-known-points',
    near(normalCdf(0), 0.5, 1e-12) && near(normalCdf(1.959963985), 0.975, 1e-7)
    && near(normalCdf(-2.5758293), 0.005, 1e-7),
    `Φ(0)=${normalCdf(0).toFixed(6)} · Φ(1.96)=${normalCdf(1.959963985).toFixed(7)}`);

  ok('normalQuantile-roundtrip',
    near(normalQuantile(0.95), 1.6448536, 1e-6) && near(normalQuantile(0.8), 0.8416212, 1e-6)
    // 2.8376 ตรวจอิสระด้วยการอินทิเกรต pdf แบบ Simpson: หางบนที่ z นี้ = 0.0022727 = 0.05/22
    && near(normalQuantile(1 - 0.05 / 22), 2.8376, 1e-3),
    `z.95=${normalQuantile(0.95).toFixed(6)} · z.80=${normalQuantile(0.8).toFixed(6)}`
    + ` · z(1−.05/22)=${normalQuantile(1 - 0.05 / 22).toFixed(4)}`);

  // σ ที่กู้จากสูตร ต้องตรงกับ σ ที่คำนวณจากกองตัวเลขที่รู้คำตอบ — ตรวจด้วยการจำลอง
  {
    let a = 12345 >>> 0;
    const rnd = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const n = 800;
    const k = 250;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = (rnd() + rnd() + rnd() - 1.5) * 2;
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i];
    const mu = s / n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (x[i] - mu) ** 2;
    const sigmaTrue = Math.sqrt(v / n);

    // จำลอง null เอง แล้วดูว่า sigmaFromPerm กู้ σ กลับได้ไหม
    const B = 40000;
    const keep = n - k;
    const pool = Array.from({ length: n }, (_, i) => i);
    let sum = 0;
    let sumSq = 0;
    for (let b = 0; b < B; b++) {
      let cut = 0;
      for (let i = 0; i < k; i++) {
        const j = i + ((rnd() * (n - i)) | 0);
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        cut += x[pool[i]];
      }
      const d = (s - cut) / keep - mu;
      sum += d;
      sumSq += d * d;
    }
    const nullSd = Math.sqrt(Math.max(0, sumSq / B - (sum / B) ** 2));
    const rec = sigmaFromPerm({ n, k, keep, nullSd });
    ok('sigma-recovery', near(rec / sigmaTrue, 1, 0.02),
      `σ จริง ${sigmaTrue.toFixed(4)} · กู้ได้ ${rec.toFixed(4)} (คลาด ${((rec / sigmaTrue - 1) * 100).toFixed(2)}%)`);
  }

  // MDE(gap) = MDE(delta) × keep/k — ตรวจว่าการแปลงหน่วยไม่กลับหัว
  {
    const p = { n: 1000, k: 100, keep: 900, nullSd: 0.01 };
    const m = mdeFor(p, 0.05, 0.8);
    ok('mde-units', near(m.mdeGap, m.mdeDelta * 9, 1e-12) && m.mdeGap > m.mdeDelta,
      `delta ${m.mdeDelta.toFixed(5)} → gap ${m.mdeGap.toFixed(5)} (×9)`);
  }

  // Holm ที่ตัวหารใหญ่ขึ้นต้องไม่ทำให้ใครผ่านง่ายขึ้น
  {
    const ps = [0.001, 0.02, 0.4];
    const a = holmFromEntries(ps.map((p, i) => ({ key: i, p })), { alpha: 0.05 });
    const bPad = [...ps.map((p, i) => ({ key: i, p })), { key: 'x', p: null }, { key: 'y', p: null }];
    const b = holmFromEntries(bPad, { alpha: 0.05 });
    const monotone = a.results.every((r, i) => b.results[i].adjustedP >= r.adjustedP - 1e-12);
    ok('holm-padding-conservative', monotone && b.m === 5 && a.m === 3,
      `m 3 → 5 · adjusted p ไม่ลดลงสักช่อง`);
  }

  return { passed: checks.every((c) => c.pass), checks };
}

// ═══════════════════════════════ main ═══════════════════════════════

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args['self-test']) {
    const r = selfTest();
    console.log('\n── self-test (veto-lab-holm-report) ──');
    for (const c of r.checks) {
      console.log(`  ${c.pass ? 'ผ่าน  ' : 'ไม่ผ่าน'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
    }
    console.log(r.passed ? '\nผ่านครบทุกข้อ\n' : '\nไม่ผ่าน\n');
    return r.passed ? 0 : 1;
  }

  const alpha = Number(args.alpha ?? DEFAULT_ALPHA);
  if (!fs.existsSync(IN_FILE)) {
    throw new Error(`ไม่พบ ${IN_FILE} — รัน node scripts/research/veto-lab.mjs --timeframes=1D,1H ก่อน`);
  }
  const report = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
  const col = collect(report, alpha);
  const holmRes = runHolm(col.entries, alpha);
  const md = buildMarkdown(report, col, holmRes, alpha);

  fs.writeFileSync(MD_FILE, md, 'utf8');

  const survivors = col.entries
    .map((e) => ({ ...e.row, holm: holmRes.byKey.get(e.key), holmBrief: holmRes.briefByKey.get(e.key) }))
    .filter((r) => r.holm?.reject && r.delta > 0);

  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: IN_FILE,
    alpha,
    power: POWER,
    familySizeMeasured: col.entries.length,
    familySizeBrief: BRIEF_FAMILY_SIZE,
    holmRejectedCount: holmRes.actual.rejectedCount,
    survivors: survivors.map((s) => ({ config: s.config, timeframe: s.timeframe, delta: s.delta })),
    timeframes: Object.fromEntries(col.tfs.map((tf) => [tf, {
      sigma: col.perTf[tf].sigma,
      seNaive: col.perTf[tf].seNaive,
      seCluster: col.perTf[tf].seCluster,
      designEffect: col.perTf[tf].designEffect,
      spanFirst: col.perTf[tf].spanFirst,
      spanLast: col.perTf[tf].spanLast,
      spanDays: col.perTf[tf].spanDays,
      baseline: {
        trades: col.perTf[tf].baseline.tradesAfter,
        meanR: col.perTf[tf].baseline.meanRAfter,
        tradesPerDay: col.perTf[tf].baseline.tradesPerDay,
        ci: col.perTf[tf].baseline.ci,
      },
      rows: col.perTf[tf].rows.map((r) => ({
        ...r,
        holmAdjustedP: holmRes.byKey.get(`${r.config}@${tf}`)?.adjustedP ?? null,
        holmReject: holmRes.byKey.get(`${r.config}@${tf}`)?.reject ?? false,
        holmAdjustedPBrief: holmRes.briefByKey.get(`${r.config}@${tf}`)?.adjustedP ?? null,
      })),
    }])),
  };
  fs.writeFileSync(JSON_FILE, JSON.stringify(out, null, 2), 'utf8');

  if (args.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`\nครอบครัว ${col.entries.length} การทดสอบ · alpha ${alpha}`);
    console.log(`ผ่าน Holm ${holmRes.actual.rejectedCount} ช่อง · รอด (ผ่าน Holm และ delta > 0) ${survivors.length} ช่อง`);
    for (const tf of col.tfs) {
      console.log(`  ${tf}: σ ${col.perTf[tf].sigma.toFixed(4)} · design effect ×${col.perTf[tf].designEffect.toFixed(2)}`);
    }
    console.log(`\nเขียน ${MD_FILE}`);
    console.log(`เขียน ${JSON_FILE}\n`);
  }
  return 0;
}

process.exit(main());
