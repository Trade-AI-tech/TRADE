#!/usr/bin/env node
/**
 * veto-audit-perm-real.mjs — ตรวจ permutation null บน "กองไม้จริง" ชุดเดียวกับรายงาน
 *
 * ข้อ A (structure) พิสูจน์ว่าท่อสุ่มถูกต้องบนข้อมูลที่รู้คำตอบล่วงหน้า
 * ไฟล์นี้ตอบคนละคำถาม: ตัวเลขในรายงานมาจากท่อนั้นจริงหรือเปล่า และเมื่อเอา
 * "วีโต้ปลอมที่ไม่รู้อะไรเลย" ใส่เข้าไปในกองไม้จริง p ยังกระจายแบนอยู่ไหม
 *
 * กองไม้ถูกสร้างใหม่จากศูนย์ทุกครั้ง (generateSignal เดินทีละแท่ง) ซึ่งกินเวลาหลายนาที
 * จึงแคชเฉพาะสิ่งที่ permutation ต้องใช้ (rNet · symbol · vetoMask · เวลา) ลง scratchpad
 * — ไม่ได้แคชผลสถิติ ทุกตัวเลขสถิติคำนวณสดทุกครั้ง
 *
 *   node scripts/research/veto-audit-perm-real.mjs --timeframes=1D
 *   node scripts/research/veto-audit-perm-real.mjs --timeframes=1D,1H --reps=200
 */
import fs from 'node:fs';
import path from 'node:path';

import { loadVetoProbe } from './veto-audit-perm-probe.mjs';
import { loadProbe } from './audit-rule-lab-probe.mjs';

const SCRATCH = process.env.VETO_AUDIT_CACHE
  || 'C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad';
const REPORT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), 'reports', 'veto-lab.json');

const n4 = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const checks = [];
const ok = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail: detail ?? '' });
  console.log(`  ${pass ? 'ผ่าน   ' : 'ไม่ผ่าน'} ${name}${detail ? `\n           ${detail}` : ''}`);
};

function args() {
  const o = {};
  for (const a of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
  }
  return o;
}

/** สุ่ม k ดัชนีจาก pool แบบไม่ซ้ำ — ตัวสุ่มของ "วีโต้ปลอม" แยกขาดจากตัวสุ่มของ null */
function randomCut(n, k, rnd) {
  const pool = Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (let i = 0; i < k; i++) {
    const j = i + ((rnd() * (n - i)) | 0);
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    out.push(pool[i]);
  }
  return out;
}

/** สถิติ Kolmogorov–Smirnov เทียบกับ Uniform(0,1) */
function ksUniform(ps) {
  const s = ps.slice().sort((a, b) => a - b);
  const m = s.length;
  let d = 0;
  for (let i = 0; i < m; i++) {
    d = Math.max(d, Math.abs((i + 1) / m - s[i]), Math.abs(s[i] - i / m));
  }
  return d;
}

function makeGroupsFromSymbols(syms) {
  const byKey = new Map();
  for (let i = 0; i < syms.length; i++) {
    let a = byKey.get(syms[i]);
    if (!a) { a = []; byKey.set(syms[i], a); }
    a.push(i);
  }
  return { byKey, keyOf: syms.slice() };
}

/** สร้าง (หรืออ่านแคช) กองไม้ฐานของกรอบเวลาหนึ่ง */
async function baseFor(tf, V, deps, bounds, cache) {
  const f = path.join(SCRATCH, `veto-audit-base-${tf}.json`);
  if (fs.existsSync(f)) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log(`  (ใช้แคชกองไม้ ${tf}: ${j.symbols.length} ไม้)`);
    return j;
  }
  console.log(`  สร้างกองไม้ ${tf} ใหม่ (เดิน generateSignal ทีละแท่ง — ใช้เวลาสักพัก)...`);
  const t0 = Date.now();
  const base = V.buildBaseTrades(tf, deps, { bounds, cache, symbols: null });
  const j = {
    timeframe: tf,
    spanDays: base.spanDays,
    vetoHits: base.vetoHits,
    symbols: base.trades.map((t) => t.symbol),
    rNet: base.trades.map((t) => t.rNet),
    vetoMask: base.trades.map((t) => t.vetoMask),
    signalTime: base.trades.map((t) => t.signalTime),
  };
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(j), 'utf8');
  console.log(`  สร้างเสร็จ ${j.symbols.length} ไม้ ใน ${Math.round((Date.now() - t0) / 1000)} วิ`);
  return j;
}

const main = async () => {
  const A = args();
  const timeframes = String(A.timeframes ?? '1D').split(',').map((s) => s.trim()).filter(Boolean);
  const REPS = Number(A.reps ?? 200);
  const BNULL = Number(A.Bnull ?? 1000);

  const V = await loadVetoProbe();
  const L = await loadProbe();
  V.__setRng(L.mulberry32);

  const deps = await V.loadDeps();
  const bounds = L.loadSplitBoundaries(timeframes);
  const cache = new Map();
  const rep = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

  for (const tf of timeframes) {
    console.log(`\n══════ B. กองไม้จริง ${tf} ══════\n`);
    const base = await baseFor(tf, V, deps, bounds, cache);
    const n = base.symbols.length;
    const rNet = Float64Array.from(base.rNet);
    const groups = makeGroupsFromSymbols(base.symbols);
    const reported = rep.timeframes[tf];

    // ── B1. ตัวเลขในรายงานมาจากท่อนี้จริง (สร้างซ้ำได้เป๊ะ) ──────────────
    //
    // เมล็ดตรึงไว้แล้ว ถ้าเดินท่อเดิมด้วยกองไม้เดิมต้องได้ p ตัวเดิมทุกหลัก
    // ถ้าไม่ตรง แปลว่ารายงานไม่ได้มาจากโค้ดชุดนี้ หรือมีสถานะแอบแฝงอยู่
    {
      const seed = rep.permutation.seed;
      const B = rep.permutation.B;
      const bad = [];
      let compared = 0;
      for (const row of reported.results) {
        if (row.config === 'baseline') continue;
        const mask = (() => {
          // สร้าง mask กลับจากรายชื่อกฎ โดยอิงลำดับ VETO_SLUGS เดียวกับที่ไฟล์เดิมใช้
          let m = 0;
          for (const slug of row.rules) {
            const i = V.VETO_SLUGS.indexOf(slug);
            if (i < 0) throw new Error(`ไม่รู้จักกฎ ${slug}`);
            m |= (1 << i);
          }
          return m;
        })();
        const cutIdx = [];
        for (let i = 0; i < n; i++) if ((base.vetoMask[i] & mask) !== 0) cutIdx.push(i);

        const s = V.permutationTest({ rNet, groups, cutIdx, B, seed, stratified: true });
        const u = V.permutationTest({ rNet, groups, cutIdx, B, seed: seed ^ 0x9e3779b9, stratified: false });
        compared++;
        if (cutIdx.length !== row.cut) bad.push(`${row.config}: k ${cutIdx.length} != ${row.cut}`);
        if (Math.abs(s.pOneSided - row.permStratified.pOneSided) > 1e-12) {
          bad.push(`${row.config}: p strat ${n4(s.pOneSided, 6)} != ${n4(row.permStratified.pOneSided, 6)}`);
        }
        if (Math.abs(u.pOneSided - row.permUnstratified.pOneSided) > 1e-12) {
          bad.push(`${row.config}: p plain ${n4(u.pOneSided, 6)} != ${n4(row.permUnstratified.pOneSided, 6)}`);
        }
        if (Math.abs(s.deltaObs - row.delta) > 1e-12) {
          bad.push(`${row.config}: delta ${n4(s.deltaObs, 8)} != ${n4(row.delta, 8)}`);
        }
      }
      ok(`B1 [${tf}] สร้างตัวเลขในรายงานซ้ำได้เป๊ะทุกชุด (p strat · p plain · delta)`,
        bad.length === 0 && compared === 11,
        `เทียบ ${compared} ชุด × 3 ค่า · ไม่ตรง ${bad.length}${bad.length ? ` — ${bad.slice(0, 3).join(' | ')}` : ''}`);
    }

    // ── B2. k ที่ null ใช้ = k ที่วีโต้ตัดจริง และตรงต่อ symbol ทุกตัว ──────
    {
      const bad = [];
      for (const row of reported.results) {
        if (row.config === 'baseline') continue;
        let mask = 0;
        for (const slug of row.rules) mask |= (1 << V.VETO_SLUGS.indexOf(slug));
        const perSym = {};
        let k = 0;
        for (let i = 0; i < n; i++) {
          if ((base.vetoMask[i] & mask) !== 0) { k++; perSym[base.symbols[i]] = (perSym[base.symbols[i]] ?? 0) + 1; }
        }
        if (row.permStratified.k !== k) bad.push(`${row.config}: perm.k ${row.permStratified.k} != ${k}`);
        if (row.permUnstratified.k !== k) bad.push(`${row.config}: permU.k ${row.permUnstratified.k} != ${k}`);
        const rs = row.cutPerSymbol ?? {};
        const keys = new Set([...Object.keys(perSym), ...Object.keys(rs)]);
        for (const s of keys) {
          if ((perSym[s] ?? 0) !== (rs[s] ?? 0)) bad.push(`${row.config}/${s}: ${perSym[s] ?? 0} != ${rs[s] ?? 0}`);
        }
      }
      ok(`B2 [${tf}] k ของ null = k ที่วีโต้ตัดจริง · และจำนวนต่อ symbol ตรงทุกตัว`,
        bad.length === 0, `ไม่ตรง ${bad.length} จุด${bad.length ? ` — ${bad.slice(0, 3).join(' | ')}` : ''}`);
    }

    // ── B2b. null แบบ stratified คงจำนวนต่อ symbol ไว้จริง (ตรวจบนกองไม้จริง) ──
    //
    // เคล็ดเดียวกับ A1 แต่ใช้ symbol จริงและ cut จริงของ levelpath (ตัวที่ตัดหนักสุด)
    // แทน rNet ด้วยค่าคงที่ต่อ symbol → ถ้า stratified ถูก nullSd ต้องเป็นศูนย์เชิงตัวเลข
    {
      const row = reported.results.find((r) => r.config === 'levelpath');
      let mask = 0;
      for (const slug of row.rules) mask |= (1 << V.VETO_SLUGS.indexOf(slug));
      const cutIdx = [];
      for (let i = 0; i < n; i++) if ((base.vetoMask[i] & mask) !== 0) cutIdx.push(i);
      const symIds = [...groups.byKey.keys()];
      const fake = Float64Array.from(base.symbols, (s) => symIds.indexOf(s) * 1.7 + 0.3);
      const s = V.permutationTest({ rNet: fake, groups, cutIdx, B: 3000, seed: 4242, stratified: true });
      const u = V.permutationTest({ rNet: fake, groups, cutIdx, B: 3000, seed: 4242, stratified: false });
      const rel = s.nullSd / (Math.abs(s.nullMean) + 1e-12);
      ok(`B2b [${tf}] null แบบ stratified คงจำนวนต่อ symbol ไว้ครบทั้ง ${symIds.length} ตัว`,
        rel < 1e-9 && Math.abs(s.nullMean - s.deltaObs) < 1e-9 && u.nullSd > 1e-6,
        `strat: nullSd/|nullMean|=${s.nullSd === 0 ? '0' : rel.toExponential(2)}`
        + ` · |nullMean−deltaObs|=${Math.abs(s.nullMean - s.deltaObs).toExponential(2)}`
        + ` · เคสควบคุม plain: nullSd=${n4(u.nullSd, 6)} (ต้อง > 0)`);
    }

    // ── B3/B4. positive & negative control บนจักรวาลเต็ม (self-test ใช้แค่ 3 ตัว) ──
    {
      const k = Math.round(n * 0.25);
      const worst = Array.from({ length: n }, (_, i) => i).sort((a, b) => rNet[a] - rNet[b]).slice(0, k);
      const ps = V.permutationTest({ rNet, groups, cutIdx: worst, B: 2000, seed: 20260828, stratified: true });
      const pp = V.permutationTest({ rNet, groups, cutIdx: worst, B: 2000, seed: 20260828, stratified: false });
      ok(`B3 [${tf}] positive control — วีโต้ที่รู้อนาคต (ตัดไม้แย่สุด ${k} ไม้) ต้อง p เล็กสุดเท่าที่เป็นไปได้`,
        ps.pOneSided < 0.001 && pp.pOneSided < 0.001 && ps.deltaObs > 0,
        `delta=${n4(ps.deltaObs)} · p strat=${n4(ps.pOneSided, 6)} · p plain=${n4(pp.pOneSided, 6)}`
        + ` · p ต่ำสุดที่เป็นไปได้=${n4(1 / 2001, 6)}`);

      const order = Array.from({ length: n }, (_, i) => i)
        .sort((x, y) => Date.parse(base.signalTime[x]) - Date.parse(base.signalTime[y]));
      const early = order.slice(0, k);
      const ns = V.permutationTest({ rNet, groups, cutIdx: early, B: 2000, seed: 20260828, stratified: true });
      const np = V.permutationTest({ rNet, groups, cutIdx: early, B: 2000, seed: 20260828, stratified: false });
      ok(`B4 [${tf}] negative control — ตัดตามเวลาโดยไม่ดู R ต้อง p ไม่เล็ก`,
        ns.pOneSided >= 0.01 && np.pOneSided >= 0.01,
        `delta=${n4(ns.deltaObs)} · p strat=${n4(ns.pOneSided, 4)} · p plain=${n4(np.pOneSided, 4)}`);
    }

    // ── B5. วีโต้ปลอมที่ตัดแบบสุ่ม REPS เมล็ด → p ต้องกระจายแบนบน [0,1] ─────
    //
    // นี่คือข้อชี้ขาดของมุมนี้ ถ้า p เอนไปทางเล็ก ท่อนี้แจกใบรับรองให้ตัวกรองที่
    // ไม่รู้อะไรเลย = ผลบวกปลอมทั้งกระดาน ถ้าเอนไปทางใหญ่ ท่ออนุรักษ์เกินจริง
    // = อาจกลบวีโต้ที่ดีจริงทิ้ง (ซึ่งจะทำให้ข้อสรุป "ไม่มีอะไรรอด" ไม่น่าเชื่อถือ)
    // ใช้ k เท่ากับที่วีโต้จริงตัด เพื่อให้อยู่ในระบอบเดียวกับผลที่รายงาน
    {
      const kList = [...new Set(reported.results
        .filter((r) => r.config !== 'baseline').map((r) => r.cut))]
        .sort((a, b) => a - b);
      const pick = [kList[0], kList[Math.floor(kList.length / 2)], kList[kList.length - 1]];
      for (const k of pick) {
        for (const stratified of [true, false]) {
          const t0 = Date.now();
          const ps = [];
          for (let s = 0; s < REPS; s++) {
            const cutIdx = randomCut(n, k, L.mulberry32((0x51a17 + s * 2654435761) >>> 0));
            const r = V.permutationTest({
              rNet, groups, cutIdx, B: BNULL, seed: (0x7f4a7c15 + s * 40503) >>> 0, stratified,
            });
            ps.push(r.pOneSided);
          }
          const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
          const f = (th) => ps.filter((p) => p < th).length / ps.length;
          const D = ksUniform(ps);
          const Dcrit = 1.358 / Math.sqrt(ps.length); // KS สองทางที่ alpha 0.05
          // ต้องแบนจริง: KS ไม่ปฏิเสธ · ค่าเฉลี่ยใกล้ 0.5 · หางล่างไม่พอง
          const seMean = Math.sqrt(1 / 12 / ps.length);
          const pass = D < Dcrit && Math.abs(mean - 0.5) < 4 * seMean
            && f(0.05) < 0.05 + 3 * Math.sqrt(0.05 * 0.95 / ps.length);
          ok(`B5 [${tf}] วีโต้ปลอมสุ่ม k=${k} (${(100 * k / n).toFixed(0)}% ของกอง) · ${stratified ? 'strat' : 'plain'} · ${REPS} เมล็ด → p แบน`,
            pass,
            `p เฉลี่ย ${n4(mean, 4)} (ควร 0.5±${n4(4 * seMean, 3)}) · KS D=${n4(D, 4)} (วิกฤต ${n4(Dcrit, 4)})`
            + ` · p<0.05 ${(100 * f(0.05)).toFixed(1)}% · p<0.10 ${(100 * f(0.10)).toFixed(1)}%`
            + ` · p<0.5 ${(100 * f(0.5)).toFixed(1)}% · ${Math.round((Date.now() - t0) / 1000)} วิ`);
        }
      }
    }

    // ── B6. วีโต้ปลอมที่ตัด "เป็นก้อนตามเวลา" — ทดสอบสมมติฐานสับเปลี่ยนได้ ────
    //
    // วีโต้จริงไม่ได้ตัดกระจายทั่วกอง มันตัดกระจุกตามระบอบตลาด ถ้า R ของไม้ที่ติดกัน
    // ตามเวลามีความสัมพันธ์กัน null ที่สุ่มกระจายทั่วกองจะแคบเกินจริง → p เล็กเกินจริง
    // ข้อนี้วัดว่าอคตินั้นแรงแค่ไหน (ไม่ใช่บั๊กของโค้ด แต่เป็นข้อจำกัดของสมมติฐาน)
    {
      const order = Array.from({ length: n }, (_, i) => i)
        .sort((x, y) => Date.parse(base.signalTime[x]) - Date.parse(base.signalTime[y]));
      const k = reported.results.find((r) => r.config === 'overext').cut;
      const BLOCK = 20;
      for (const stratified of [true, false]) {
        const ps = [];
        for (let s = 0; s < REPS; s++) {
          const rnd = L.mulberry32((0xc10c7 + s * 7919) >>> 0);
          const chosen = new Set();
          while (chosen.size < k) {
            const start = (rnd() * (n - BLOCK)) | 0;
            for (let j = start; j < start + BLOCK && chosen.size < k; j++) chosen.add(order[j]);
          }
          const r = V.permutationTest({
            rNet, groups, cutIdx: [...chosen], B: BNULL, seed: (0x2f8d1 + s * 40503) >>> 0, stratified,
          });
          ps.push(r.pOneSided);
        }
        const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
        const f = (th) => ps.filter((p) => p < th).length / ps.length;
        const D = ksUniform(ps);
        const Dcrit = 1.358 / Math.sqrt(ps.length);
        ok(`B6 [${tf}] วีโต้ปลอมที่ตัดเป็นก้อนตามเวลา (k=${k}, ก้อนละ ${BLOCK}) · ${stratified ? 'strat' : 'plain'}`,
          D < Dcrit && f(0.05) < 0.12,
          `p เฉลี่ย ${n4(mean, 4)} · KS D=${n4(D, 4)} (วิกฤต ${n4(Dcrit, 4)}) · p<0.05 ${(100 * f(0.05)).toFixed(1)}%`
          + ` · p<0.10 ${(100 * f(0.10)).toFixed(1)}% — ถ้าหางล่างพอง แปลว่า null แคบเกินจริงสำหรับวีโต้ที่ตัดกระจุก`);
      }
    }
  }

  console.log('');
  const bad = checks.filter((c) => !c.pass);
  console.log(bad.length ? `B: ไม่ผ่าน ${bad.length} ข้อ\n` : 'B: ผ่านครบทุกข้อ\n');
  return bad.length ? 1 : 0;
};

main().then((c) => process.exit(c)).catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
