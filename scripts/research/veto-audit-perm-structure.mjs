#!/usr/bin/env node
/**
 * veto-audit-perm-structure.mjs — ตรวจ "โครงสร้าง" ของ permutation null ใน veto-lab.mjs
 *
 * ตรวจด้วยข้อมูลสังเคราะห์ที่รู้คำตอบล่วงหน้า เพราะข้อมูลตลาดจริงตอบไม่ได้ว่า
 * "ท่อสุ่มถูกไหม" — มันตอบได้แค่ว่า "ผลออกมาเท่าไร" การจะรู้ว่าท่อถูก ต้องป้อนเคส
 * ที่คำตอบถูกบังคับด้วยคณิตศาสตร์ ไม่ใช่ด้วยความบังเอิญของราคา
 *
 * ทุกข้อเรียก permutationTest ตัวจริงจาก veto-lab.mjs ผ่าน probe — ไม่มีการเขียนใหม่
 */
import { loadVetoProbe } from './veto-audit-perm-probe.mjs';
import { loadProbe } from './audit-rule-lab-probe.mjs';

const n4 = (v, d = 6) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const checks = [];
const ok = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail: detail ?? '' });
  console.log(`  ${pass ? 'ผ่าน   ' : 'ไม่ผ่าน'} ${name}${detail ? `  — ${detail}` : ''}`);
};

/** สร้าง groups ในรูปแบบเดียวกับ makeCtx: { byKey: Map<sym, idx[]>, keyOf: string[] } */
function makeGroups(symOf) {
  const byKey = new Map();
  const keyOf = symOf.slice();
  for (let i = 0; i < symOf.length; i++) {
    let a = byKey.get(symOf[i]);
    if (!a) { a = []; byKey.set(symOf[i], a); }
    a.push(i);
  }
  return { byKey, keyOf };
}

/** เลือก k ดัชนีแบบสุ่มจาก 0..n-1 (ตัวสุ่มของ "วีโต้ปลอม" แยกจากตัวสุ่มของ null เสมอ) */
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

const main = async () => {
  const V = await loadVetoProbe();
  const L = await loadProbe();
  V.__setRng(L.mulberry32);
  if (V.__getRng() !== L.mulberry32) throw new Error('ตั้ง PRNG ให้ probe ไม่สำเร็จ');

  console.log('\n══════ A. โครงสร้าง permutation null (ข้อมูลสังเคราะห์) ══════\n');

  // ─────────────────────────────────────────────────────────────────────────
  // A1. stratified ตัดต่อ symbol ตรงกับของจริง "ทุก symbol" หรือไม่
  //
  // เคล็ด: ให้ไม้ทุกไม้ใน symbol เดียวกันมี rNet เท่ากันเป๊ะ และแต่ละ symbol ต่างกัน
  // ถ้า stratified ตัด kg ไม้จาก symbol g ทุกรอบเป๊ะ ๆ → ผลรวมของไม้ที่ถูกตัด
  // จะ "เท่ากันทุกรอบ" ไม่ว่าจะสุ่มตัวไหน → nullSd ต้องเป็น 0 เป๊ะ
  // และค่านั้นต้องเท่ากับของจริงด้วย → nullMean ต้องเท่ากับ deltaObs เป๊ะ
  //
  // ถ้าตัดผิดจำนวนแม้ symbol เดียว (เช่นสลับ kg กันระหว่างสอง symbol) nullMean จะเพี้ยน
  // ถ้าตัดข้าม symbol แม้ครั้งเดียว nullSd จะไม่เป็นศูนย์
  // ─────────────────────────────────────────────────────────────────────────
  {
    const symOf = [];
    const vals = [];
    // 5 symbol ขนาดไม่เท่ากัน ค่าต่างกันชัด ๆ
    const spec = [['AAA', 40, 1], ['BBB', 25, 7], ['CCC', 60, -3], ['DDD', 15, 11], ['EEE', 30, -0.5]];
    for (const [s, cnt, val] of spec) for (let i = 0; i < cnt; i++) { symOf.push(s); vals.push(val); }
    const n = vals.length;
    const rNet = Float64Array.from(vals);
    const groups = makeGroups(symOf);

    // วีโต้ปลอมที่ตัดกระจุกไม่เท่ากันในแต่ละ symbol — เคสที่ยากที่สุดสำหรับ stratification
    const rnd = L.mulberry32(0x1234abc);
    const cutIdx = [];
    const want = { AAA: 9, BBB: 20, CCC: 5, DDD: 15, EEE: 0 };
    for (const [s, kg] of Object.entries(want)) {
      const idxs = groups.byKey.get(s);
      const picked = randomCut(idxs.length, kg, rnd).map((i) => idxs[i]);
      cutIdx.push(...picked);
    }

    const r = V.permutationTest({ rNet, groups, cutIdx, B: 4000, seed: 777, stratified: true });
    const sdZero = r.nullSd === 0;
    const meanExact = Math.abs(r.nullMean - r.deltaObs) < 1e-12;
    ok('A1 stratified ตัดต่อ symbol ตรงเป๊ะทุกตัว',
      sdZero && meanExact && r.k === cutIdx.length,
      `k=${r.k}/${cutIdx.length} · nullSd=${r.nullSd} · deltaObs=${n4(r.deltaObs, 12)}`
      + ` · nullMean=${n4(r.nullMean, 12)} · ต่าง=${(r.nullMean - r.deltaObs).toExponential(2)}`);

    // A1b. เคสควบคุม: ถ้าไม่ stratified ต้อง "ไม่" คงที่ — พิสูจน์ว่า A1 มีอำนาจจับบั๊กจริง
    const u = V.permutationTest({ rNet, groups, cutIdx, B: 4000, seed: 777, stratified: false });
    ok('A1b เคสควบคุม: ไม่ stratified ต้องแกว่ง (ไม่งั้น A1 ไร้ความหมาย)',
      u.nullSd > 1e-6, `nullSd(ไม่ strat)=${n4(u.nullSd)} · nullSd(strat)=${u.nullSd === 0 ? 0 : n4(r.nullSd)}`);

    // A1c. สลับ kg ระหว่างสอง symbol แล้วต้องจับได้ — พิสูจน์ว่าเช็ค nullMean ไวจริง
    const idxA = groups.byKey.get('AAA'); const idxB = groups.byKey.get('BBB');
    const swapped = [
      ...randomCut(idxA.length, 20, rnd).map((i) => idxA[i]),
      ...randomCut(idxB.length, 9, rnd).map((i) => idxB[i]),
      ...cutIdx.filter((i) => symOf[i] !== 'AAA' && symOf[i] !== 'BBB'),
    ];
    const rs = V.permutationTest({ rNet, groups, cutIdx: swapped, B: 500, seed: 777, stratified: true });
    // nullSd ไม่ต้องเป็น 0 เป๊ะ — permutationTest คิดความแปรปรวนแบบผ่านเดียว
    // (sumSq/B − mean²) ซึ่งหักลบเลขใกล้เคียงกันจนเหลือเศษทศนิยมได้ เทียบเป็นสัดส่วน
    // ของสเกลค่าแทน ไม่เทียบกับศูนย์ตรง ๆ
    ok('A1c เคสควบคุม: ถ้าจำนวนต่อ symbol ต่างไป ค่าที่คาดต้องต่างไปด้วย',
      Math.abs(rs.nullMean - r.nullMean) > 1e-9 && rs.nullSd < 1e-6 * (Math.abs(rs.nullMean) + 1),
      `nullMean สลับแล้ว=${n4(rs.nullMean)} vs เดิม=${n4(r.nullMean)} · nullSd=${rs.nullSd.toExponential(2)} (เศษทศนิยม)`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A2. จำนวนไม้ที่สุ่มตัดต่อรอบ = k จริง (นับจำนวนครั้งที่เรียก rnd())
  //
  // sumOfRandomSubset ดึงเลขสุ่ม 1 ครั้งต่อ 1 ไม้ที่ตัด ดังนั้นถ้าท่อถูก
  // จำนวนครั้งที่เรียก rnd() ทั้งหมด ต้องเท่ากับ B × k เป๊ะ ทั้งสองโหมด
  // ─────────────────────────────────────────────────────────────────────────
  {
    const symOf = [];
    for (let i = 0; i < 200; i++) symOf.push(`S${i % 6}`);
    const groups = makeGroups(symOf);
    const rnd0 = L.mulberry32(99);
    const rNet = Float64Array.from({ length: 200 }, () => rnd0() * 2 - 1);
    const cutIdx = randomCut(200, 53, L.mulberry32(4242));
    const B = 300;
    const rows = [];
    for (const stratified of [true, false]) {
      let calls = 0;
      V.__setRng((seed) => { const f = L.mulberry32(seed); return () => { calls++; return f(); }; });
      const r = V.permutationTest({ rNet, groups, cutIdx, B, seed: 5, stratified });
      V.__setRng(L.mulberry32);
      rows.push({ stratified, calls, want: B * r.k, k: r.k });
    }
    const good = rows.every((x) => x.calls === x.want && x.k === 53);
    ok('A2 สุ่มตัดรอบละ k ไม้พอดี (นับการเรียก rnd())', good,
      rows.map((x) => `${x.stratified ? 'strat' : 'plain'}: เรียก ${x.calls} ครั้ง ต้องการ ${x.want}`).join(' · '));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A3. ทุกไม้มีโอกาสถูกสุ่มตัดเท่ากัน (marginal inclusion = k/n)
  //
  // pool ถูกสลับ "ในที่" แล้วใช้ซ้ำทุกรอบ ถ้า partial Fisher-Yates เขียนผิดแม้นิดเดียว
  // ความเอนจะสะสมข้ามรอบ ตรวจโดยตั้ง rNet ให้เป็นเวกเตอร์ฐาน (1 ที่ตำแหน่งเดียว)
  // แล้วถอด P(ถูกตัด) ออกมาจาก nullMean:  nullMean = (1 − P)/keep − 1/n
  // ─────────────────────────────────────────────────────────────────────────
  {
    const n = 240;
    const symOf = Array.from({ length: n }, (_, i) => `S${i % 4}`);
    const groups = makeGroups(symOf);
    const k = 60;
    const keep = n - k;
    const cutIdx = randomCut(n, k, L.mulberry32(31337));
    const probes = [0, 1, 2, 59, 60, 119, 120, 179, 180, 237, 238, 239];
    const B = 40000;

    // cutIdx สุ่มจากกองรวม → จำนวนที่ตัดต่อกลุ่ม (kg) ไม่เท่ากันทุกกลุ่ม
    // ค่าที่ถูกต้องจึงต่างกันตามโหมด: strat → kg/|กลุ่ม| (คงจำนวนต่อ symbol)
    //                                  plain → k/n (สุ่มจากกองรวม)
    const kgOf = {};
    for (const i of cutIdx) kgOf[symOf[i]] = (kgOf[symOf[i]] ?? 0) + 1;

    const tol = 5 * Math.sqrt(0.25 * 0.75 / B);
    const bad = [];
    let maxDev = 0;
    for (const stratified of [true, false]) {
      for (const i of probes) {
        const rNet = new Float64Array(n);
        rNet[i] = 1;
        const r = V.permutationTest({ rNet, groups, cutIdx, B, seed: 1000 + i, stratified });
        const P = 1 - keep * (r.nullMean + 1 / n);
        const want = stratified ? kgOf[symOf[i]] / groups.byKey.get(symOf[i]).length : k / n;
        const dev = Math.abs(P - want);
        if (dev > maxDev) maxDev = dev;
        if (dev > tol) {
          bad.push(`${stratified ? 'strat' : 'plain'} i=${i} P=${n4(P, 4)} ควรได้ ${n4(want, 4)}`);
        }
      }
    }
    ok('A3 ทุกไม้มีโอกาสถูกสุ่มตัดเท่ากัน (ไม่มีความเอนสะสมจากการใช้ pool ซ้ำ)',
      bad.length === 0,
      `เทียบ P กับค่าที่ควรได้ (strat=kg/|กลุ่ม| · plain=k/n) · ต่างมากสุด ${n4(maxDev, 4)} (เกณฑ์ ${n4(tol, 4)})`
      + (bad.length ? ` · หลุด: ${bad.slice(0, 4).join(', ')}` : ''));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A4. p ที่ได้ตรงกับการนับแบบครบถ้วน (exact enumeration)
  //
  // n เล็กพอที่จะไล่ทุกสับเซตขนาด k ได้หมด → รู้ p ที่ถูกต้องเป๊ะ ๆ
  // p ที่ถูกต้องของ Monte-Carlo คือ (จำนวนที่ >= obs + 1)/(B+1) ซึ่งเป็นตัวประมาณของ
  // สัดส่วนจริงในประชากรสับเซตทั้งหมด (นับ obs รวมเข้าไปด้วย = ที่ถูกต้องตาม Phipson-Smyth)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const n = 16, k = 5;
    const symOf = Array.from({ length: n }, () => 'ONE');
    const groups = makeGroups(symOf);
    const rnd = L.mulberry32(0xbadf00d);
    const rNet = Float64Array.from({ length: n }, () => Math.round((rnd() * 4 - 2) * 1000) / 1000);
    const cutIdx = [1, 4, 7, 9, 13];
    let sumAll = 0; for (let i = 0; i < n; i++) sumAll += rNet[i];
    const keep = n - k;
    let sumCutObs = 0; for (const i of cutIdx) sumCutObs += rNet[i];
    const deltaObs = (sumAll - sumCutObs) / keep - sumAll / n;

    let tot = 0, ge = 0;
    const comb = (arr, start, cur) => {
      if (cur.length === k) {
        let s = 0; for (const i of cur) s += rNet[i];
        const d = (sumAll - s) / keep - sumAll / n;
        tot++; if (d >= deltaObs - 1e-12) ge++;
        return;
      }
      for (let i = start; i < n; i++) { cur.push(i); comb(arr, i + 1, cur); cur.pop(); }
    };
    comb(null, 0, []);
    const pExact = ge / tot;

    const r = V.permutationTest({ rNet, groups, cutIdx, B: 200000, seed: 2024, stratified: false });
    const diff = Math.abs(r.pOneSided - pExact);
    ok('A4 p ตรงกับการนับสับเซตทั้งหมดแบบครบถ้วน',
      diff < 0.005 && Math.abs(r.deltaObs - deltaObs) < 1e-12,
      `p นับครบ (C(16,5)=${tot}) = ${n4(pExact, 5)} · p permutation = ${n4(r.pOneSided, 5)} · ต่าง ${n4(diff, 5)}`);

    // A4b. สูตร p — ต้องเป็น (นับได้ + 1)/(B + 1) ไม่ใช่สัดส่วนดิบ
    const B2 = 5000;
    const r2 = V.permutationTest({ rNet, groups, cutIdx, B: B2, seed: 2025, stratified: false });
    const geCount = Math.round(r2.pGreaterRaw * B2);
    const wantP = (geCount + 1) / (B2 + 1);
    ok('A4b สูตร p = (นับได้+1)/(B+1) และ p ไม่มีทางเป็น 0',
      Math.abs(r2.pOneSided - wantP) < 1e-12 && r2.pOneSided >= 1 / (B2 + 1),
      `นับได้ ${geCount} · p=${n4(r2.pOneSided, 6)} · (นับได้+1)/(B+1)=${n4(wantP, 6)}`
      + ` · p ต่ำสุดที่เป็นไปได้ ${n4(1 / (B2 + 1), 6)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A5. ทิศทางของ p ถูกด้าน (ทางเดียว) — ตัดไม้แย่ต้อง p เล็ก ตัดไม้ดีต้อง p ใหญ่
  // ─────────────────────────────────────────────────────────────────────────
  {
    const n = 400;
    const symOf = Array.from({ length: n }, (_, i) => `S${i % 5}`);
    const groups = makeGroups(symOf);
    const rnd = L.mulberry32(0x5eed);
    const rNet = Float64Array.from({ length: n }, () => rnd() * 4 - 1.5);
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => rNet[a] - rNet[b]);
    const worst = order.slice(0, 100);
    const best = order.slice(-100);
    const rw = V.permutationTest({ rNet, groups, cutIdx: worst, B: 5000, seed: 11, stratified: false });
    const rb = V.permutationTest({ rNet, groups, cutIdx: best, B: 5000, seed: 11, stratified: false });
    ok('A5 ทิศทางถูกด้าน: ตัดไม้แย่สุด → p เล็ก · ตัดไม้ดีสุด → p ใหญ่',
      rw.deltaObs > 0 && rw.pOneSided < 0.001 && rb.deltaObs < 0 && rb.pOneSided > 0.999,
      `ตัดแย่: delta=${n4(rw.deltaObs, 4)} p=${n4(rw.pOneSided, 5)} · ตัดดี: delta=${n4(rb.deltaObs, 4)} p=${n4(rb.pOneSided, 5)}`);
    ok('A5b p สองทางสมมาตร (ตัดดี/ตัดแย่ ได้ p สองทางใกล้กัน)',
      Math.abs(rw.pTwoSided - rb.pTwoSided) < 0.01,
      `pTwoSided ตัดแย่=${n4(rw.pTwoSided, 5)} · ตัดดี=${n4(rb.pTwoSided, 5)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A6. กรณีขอบ k=0 และ k=n
  // ─────────────────────────────────────────────────────────────────────────
  {
    const n = 50;
    const symOf = Array.from({ length: n }, (_, i) => `S${i % 3}`);
    const groups = makeGroups(symOf);
    const rnd = L.mulberry32(7);
    const rNet = Float64Array.from({ length: n }, () => rnd() - 0.5);
    const z = V.permutationTest({ rNet, groups, cutIdx: [], B: 100, seed: 1, stratified: true });
    const a = V.permutationTest({
      rNet, groups, cutIdx: Array.from({ length: n }, (_, i) => i), B: 100, seed: 1, stratified: true,
    });
    ok('A6 กรณีขอบ k=0 → p=1 · k=n → ตอบว่าไม่เหลือไม้ให้วัด',
      z.deltaObs === 0 && z.pOneSided === 1 && !!a.degenerate,
      `k=0: delta=${z.deltaObs} p=${z.pOneSided} · k=n: ${a.degenerate ?? 'ไม่รายงาน degenerate'}`);
  }

  console.log('');
  const passed = checks.every((c) => c.pass);
  console.log(passed ? 'A: ผ่านครบทุกข้อ\n' : `A: ไม่ผ่าน ${checks.filter((c) => !c.pass).length} ข้อ\n`);
  return passed ? 0 : 1;
};

main().then((c) => process.exit(c)).catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
