#!/usr/bin/env node
/**
 * holm.mjs — Holm-Bonferroni step-down สำหรับคุมความผิดพลาดเมื่อทดสอบหลายครั้งพร้อมกัน
 *
 * ─────────────────────────────── ทำไมต้องมีไฟล์นี้ ───────────────────────────────
 *
 * rule-lab.mjs วัดกฎ 25 ข้อ × 2 กรอบเวลา = 50 การทดสอบในการรันครั้งเดียว ที่ alpha 0.05
 * ต่อการทดสอบ ถ้าไม่มีกฎไหนมีขอบจริงเลย เรายังคาดว่าจะเห็น "ผลมีนัยสำคัญ" ราว 50 × 0.05
 * = 2.5 ข้อโดยบังเอิญ การหยิบตัวที่ p < 0.05 มาอวดจึงเป็นการอวดเสียงรบกวน
 *
 * Holm-Bonferroni คุม FWER (โอกาสที่จะปฏิเสธ H0 ผิดแม้แต่ครั้งเดียวในทั้งครอบครัว) ให้ ≤ alpha
 * โดยไม่ต้องสมมติว่าการทดสอบเป็นอิสระต่อกัน — สำคัญมากที่นี่ เพราะกฎหลายข้อดูอินดิเคเตอร์
 * ชุดเดียวกันบนแท่งชุดเดียวกัน ผลของมันสัมพันธ์กันสูง วิธีที่ต้องการความเป็นอิสระ (เช่น Šidák)
 * ใช้ไม่ได้ ส่วน Bonferroni ธรรมดาก็คุมได้เหมือนกันแต่เสียกำลังฟรี ๆ
 *
 * ─────────────────────── จุดที่พังบ่อยที่สุด: ตัวหารไม่ครบครอบครัว ───────────────────────
 *
 * ความผิดพลาดที่พบบ่อยคือวัด 50 ครั้ง เห็นว่า 6 ครั้งดูดี แล้วเอาแค่ 6 ตัวนั้นมาเข้า Holm
 * ตัวหารกลายเป็น 6 แทนที่จะเป็น 50 ซึ่งไม่ได้แก้ปัญหาอะไรเลย เพราะการ "เลือกมาก่อน"
 * คือตัวสร้าง bias เอง ไฟล์นี้จึงบังคับด้วยโครงสร้าง: ฟังก์ชันรับ p ของ "ทุกสมาชิกในครอบครัว"
 * แล้วใช้ p.length เป็นตัวหารเสมอ ไม่มีพารามิเตอร์ให้ตั้งตัวหารเองได้
 *
 * การทดสอบที่ไม่มี p (เช่นกฎที่ไม่ออกไม้เลย) ต้องส่งเข้ามาเป็น null แล้วไฟล์นี้จะแปลงเป็น
 * p = 1 — ปฏิเสธไม่ได้อยู่แล้ว แต่ยังนับหัวอยู่ในตัวหาร วิธีนี้ conservative เสมอ
 * (ไม่มีทางทำให้ปฏิเสธง่ายขึ้น) และทำให้ตัวเลข m ในรายงานตรงกับจำนวนช่องที่วัดจริง
 *
 * ─────────────────────────────── วิธีคิด (step-down) ───────────────────────────────
 *
 * เรียง p จากน้อยไปมาก p(1) ≤ … ≤ p(m) แล้วเทียบ p(k) กับ alpha / (m − k + 1)
 * ปฏิเสธไล่ลงมาจนกว่าจะเจอตัวแรกที่ไม่ผ่าน แล้วหยุด — ตัวที่เหลือทั้งหมดไม่ปฏิเสธ
 * "หยุดทั้งแถว" คือหัวใจ ถ้าปล่อยให้ข้ามตัวที่ตกไปแล้วปฏิเสธตัวถัดไป FWER จะไม่ถูกคุมอีก
 *
 * รูปแบบเทียบเท่าที่รายงานง่ายกว่าคือ adjusted p:
 *   p̃(k) = max over j ≤ k ของ ( (m − j + 1) × p(j) )  แล้วหนีบไว้ที่ 1
 * ปฏิเสธเมื่อ p̃(k) ≤ alpha — ให้ผลเดียวกันเป๊ะกับ step-down (มี self-test ยืนยันข้อนี้)
 * ตัว max คือสิ่งที่ทำให้ "หยุดทั้งแถว" ติดมาด้วยโดยอัตโนมัติ
 *
 * ──────────────────────────────────── วิธีใช้ ────────────────────────────────────
 *
 *   import { holm, holmFromEntries } from './holm.mjs';
 *   node scripts/research/holm.mjs --self-test
 */

/** ค่าเริ่มต้นของ FWER — ตั้งไว้ที่เดียวเพื่อไม่ให้ที่เรียกใช้แต่ละที่ใช้คนละเลข */
export const DEFAULT_ALPHA = 0.05;

/**
 * แปลง p ที่รับเข้ามาให้เป็นตัวเลข 0..1 — null/undefined กลายเป็น 1
 *
 * ทำไม null → 1 ไม่ใช่ "ตัดทิ้ง": ตัดทิ้งจะลดตัวหาร ซึ่งเป็นการโกงแบบเดียวกับที่ไฟล์นี้
 * ตั้งใจกันไว้ ส่วน p = 1 ปฏิเสธไม่ได้ในทุกกรณีอยู่แล้ว จึงปลอดภัยและยังนับหัวครบ
 */
function normalizeP(p, i) {
  if (p === null || p === undefined) return 1;
  if (typeof p !== 'number' || !Number.isFinite(p)) {
    throw new Error(`holm: p ตัวที่ ${i} ไม่ใช่ตัวเลขที่ใช้ได้ (${String(p)})`);
  }
  if (p < 0 || p > 1) throw new Error(`holm: p ตัวที่ ${i} อยู่นอกช่วง 0..1 (${p})`);
  return p;
}

/**
 * Holm-Bonferroni step-down
 *
 * @param {Array<number|null>} pValues p ของ "ทุกสมาชิกในครอบครัว" — ห้ามกรองมาก่อน
 * @param {{ alpha?: number, expectedFamilySize?: number }} [opts]
 *        expectedFamilySize = ตัวเลขที่ผู้เรียกเชื่อว่าครอบครัวมีกี่การทดสอบ
 *        ถ้าใส่มาแล้วไม่ตรงกับ pValues.length จะ throw ทันที — กันเคสที่มีคนเผลอ filter
 *        ก่อนส่งเข้ามาแล้วตัวหารหดโดยไม่มีใครเห็น
 * @returns {{ alpha: number, m: number, rejectedCount: number,
 *             results: Array<{ index: number, p: number, pWasNull: boolean, rank: number,
 *                              factor: number, threshold: number, adjustedP: number,
 *                              reject: boolean }> }}
 *          results เรียงตามลำดับเดิมที่ส่งเข้ามา (ไม่ใช่ลำดับที่เรียง p)
 */
export function holm(pValues, opts = {}) {
  if (!Array.isArray(pValues)) throw new Error('holm: pValues ต้องเป็น array');
  const alpha = opts.alpha ?? DEFAULT_ALPHA;
  if (!(typeof alpha === 'number') || !(alpha > 0) || !(alpha <= 1)) {
    throw new Error(`holm: alpha ต้องอยู่ในช่วง (0, 1] (ได้ ${alpha})`);
  }

  const m = pValues.length;
  if (opts.expectedFamilySize !== undefined && opts.expectedFamilySize !== m) {
    throw new Error(
      `holm: ครอบครัวควรมี ${opts.expectedFamilySize} การทดสอบ แต่ได้รับ p มา ${m} ตัว `
      + '— ถ้ากรอง p บางตัวออกก่อนส่งเข้ามา ตัวหารจะหดแล้วการแก้ multiple testing จะไม่จริง'
    );
  }

  const norm = pValues.map((p, i) => ({ index: i, p: normalizeP(p, i), pWasNull: p === null || p === undefined }));

  // เรียงตาม p จากน้อยไปมาก — ตัวที่ p เท่ากันให้ยึดลำดับเดิม เพื่อให้ผลเป็น deterministic
  const sorted = [...norm].sort((a, b) => (a.p - b.p) || (a.index - b.index));

  // adjusted p แบบสะสม max — ตัว max คือสิ่งที่บังคับให้ "เจอตัวแรกที่ตกแล้วหยุดทั้งแถว"
  let running = 0;
  const out = new Array(m);
  for (let k = 0; k < m; k++) {
    const e = sorted[k];
    const factor = m - k;                 // = m − rank + 1 เมื่อ rank เริ่มที่ 1
    running = Math.max(running, factor * e.p);
    const adjustedP = Math.min(1, running);
    out[e.index] = {
      index: e.index,
      p: e.p,
      pWasNull: e.pWasNull,
      rank: k + 1,
      factor,
      threshold: alpha / factor,
      adjustedP,
      reject: adjustedP <= alpha,
    };
  }

  return { alpha, m, rejectedCount: out.filter((r) => r.reject).length, results: out };
}

/**
 * รูปแบบที่ใช้สะดวกกว่าเวลามีคีย์กำกับ — รับ [{ key, p }] แล้วคืนกลับพร้อมคีย์เดิม
 * ใช้กับ rule-lab ที่หนึ่งการทดสอบ = (กฎ, กรอบเวลา) หนึ่งคู่
 */
export function holmFromEntries(entries, opts = {}) {
  if (!Array.isArray(entries)) throw new Error('holmFromEntries: entries ต้องเป็น array');
  const res = holm(entries.map((e) => e.p), opts);
  return {
    ...res,
    results: res.results.map((r) => ({ ...entries[r.index], ...r })),
  };
}

/**
 * นิยาม step-down ตรงตัว — ใช้เฉพาะใน self-test เพื่อยืนยันว่าสูตร adjusted p ให้ผลตรงกัน
 * เขียนแยกไว้จงใจ เพราะการเอาสูตรเดียวมาตรวจตัวเองไม่ได้พิสูจน์อะไร
 */
function rejectSetByStepDown(pValues, alpha) {
  const m = pValues.length;
  const sorted = pValues
    .map((p, i) => ({ i, p: normalizeP(p, i) }))
    .sort((a, b) => (a.p - b.p) || (a.i - b.i));
  const rejected = new Set();
  for (let k = 0; k < m; k++) {
    if (sorted[k].p > alpha / (m - k)) break; // เจอตัวแรกที่ไม่ผ่าน → หยุดทั้งแถว
    rejected.add(sorted[k].i);
  }
  return rejected;
}

// ═══════════════════════════════ self-test ═══════════════════════════════

function mulberry32(a) {
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;

export function selfTest() {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  // ── 1. เคสที่โจทย์กำหนด: p = [0.01, 0.04, 0.03] ที่ alpha 0.05 ──
  //
  // คำนวณด้วยมือ: m = 3 · เรียงได้ 0.01 (ช่อง 0) → 0.03 (ช่อง 2) → 0.04 (ช่อง 1)
  //   อันดับ 1: เกณฑ์ 0.05/3 = 0.016667 · 0.01 ≤ 0.016667 → ปฏิเสธ
  //   อันดับ 2: เกณฑ์ 0.05/2 = 0.025    · 0.03 > 0.025    → ไม่ปฏิเสธ แล้วหยุดทั้งแถว
  //   อันดับ 3: ไม่ต้องดู เพราะหยุดไปแล้ว
  // adjusted p: 3×0.01 = 0.03 · max(0.03, 2×0.03 = 0.06) = 0.06 · max(0.06, 1×0.04 = 0.04) = 0.06
  // ผลที่ควรได้เรียงตามช่องเดิม: [0.03 ปฏิเสธ, 0.06 ไม่ปฏิเสธ, 0.06 ไม่ปฏิเสธ]
  {
    const r = holm([0.01, 0.04, 0.03], { alpha: 0.05 });
    const errs = [];
    if (r.m !== 3) errs.push(`m = ${r.m} ไม่ใช่ 3`);
    const adj = r.results.map((x) => x.adjustedP);
    const rej = r.results.map((x) => x.reject);
    if (!near(adj[0], 0.03) || !near(adj[1], 0.06) || !near(adj[2], 0.06)) {
      errs.push(`adjusted = [${adj.join(', ')}] ไม่ใช่ [0.03, 0.06, 0.06]`);
    }
    if (JSON.stringify(rej) !== JSON.stringify([true, false, false])) {
      errs.push(`reject = [${rej.join(', ')}] ไม่ใช่ [true, false, false]`);
    }
    if (r.rejectedCount !== 1) errs.push(`rejectedCount = ${r.rejectedCount} ไม่ใช่ 1`);
    add('เคสมือ [0.01, 0.04, 0.03] @ alpha 0.05', errs.length === 0, errs.join(' · ') || undefined);
  }

  // ── 2. เคสมือ: ปฏิเสธครบทุกตัว ──
  // p = [0.001, 0.002, 0.003] · เกณฑ์ 0.016667 / 0.025 / 0.05 → ผ่านหมด
  // adjusted: 0.003 · max(0.003, 0.004) = 0.004 · max(0.004, 0.003) = 0.004
  {
    const r = holm([0.001, 0.002, 0.003], { alpha: 0.05 });
    const adj = r.results.map((x) => x.adjustedP);
    const ok = r.rejectedCount === 3 && near(adj[0], 0.003) && near(adj[1], 0.004) && near(adj[2], 0.004);
    add('เคสมือ ปฏิเสธครบ 3 ตัว', ok, ok ? undefined : `adjusted = [${adj.join(', ')}] · rejected ${r.rejectedCount}`);
  }

  // ── 3. เคสมือ: ไม่ปฏิเสธเลย ──
  // p = [0.2, 0.3] · อันดับ 1 เกณฑ์ 0.025 · 0.2 > 0.025 → หยุดทันที
  {
    const r = holm([0.2, 0.3], { alpha: 0.05 });
    const adj = r.results.map((x) => x.adjustedP);
    const ok = r.rejectedCount === 0 && near(adj[0], 0.4) && near(adj[1], 0.4);
    add('เคสมือ ไม่ปฏิเสธเลย', ok, ok ? undefined : `adjusted = [${adj.join(', ')}] · rejected ${r.rejectedCount}`);
  }

  // ── 4. adjusted p ต้องไม่ลดลงตามอันดับ (monotone) ──
  // p = [0.02, 0.021] · 2×0.02 = 0.04 · 1×0.021 = 0.021 ซึ่งน้อยกว่า → ต้องถูกดันขึ้นเป็น 0.04
  // ถ้าลืมใส่ max ตัวที่สองจะได้ 0.021 ซึ่งอ่านผิดว่า "มีนัยสำคัญกว่า" ตัวที่ p น้อยกว่า
  {
    const r = holm([0.02, 0.021], { alpha: 0.05 });
    const adj = r.results.map((x) => x.adjustedP);
    const ok = near(adj[0], 0.04) && near(adj[1], 0.04) && r.rejectedCount === 2;
    add('adjusted p ไม่ลดลงตามอันดับ', ok, ok ? undefined : `adjusted = [${adj.join(', ')}]`);
  }

  // ── 5. หนีบที่ 1 — adjusted p ห้ามเกิน 1 ──
  {
    const r = holm([0.5, 0.9], { alpha: 0.05 });
    const adj = r.results.map((x) => x.adjustedP);
    add('adjusted p ถูกหนีบไว้ที่ 1', adj.every((v) => v <= 1) && near(adj[0], 1) && near(adj[1], 1),
      `adjusted = [${adj.join(', ')}]`);
  }

  // ── 6. p เท่ากันหมด ──
  // p = [0.01, 0.01, 0.01] · adjusted ทุกตัว = 0.03 → ปฏิเสธครบ
  {
    const r = holm([0.01, 0.01, 0.01], { alpha: 0.05 });
    const ok = r.rejectedCount === 3 && r.results.every((x) => near(x.adjustedP, 0.03));
    add('p เท่ากันหมด', ok, ok ? undefined : JSON.stringify(r.results.map((x) => x.adjustedP)));
  }

  // ── 7. null → p = 1 แต่ยังนับหัวในตัวหาร ──
  // [0.001, null, null] ต้องได้ m = 3 และ adjusted ตัวแรก = 3 × 0.001 = 0.003 (ไม่ใช่ 1 × 0.001)
  {
    const r = holm([0.001, null, null], { alpha: 0.05 });
    const errs = [];
    if (r.m !== 3) errs.push(`m = ${r.m}`);
    if (!near(r.results[0].adjustedP, 0.003)) errs.push(`adjusted[0] = ${r.results[0].adjustedP}`);
    if (!r.results[1].pWasNull || r.results[1].p !== 1) errs.push('null ไม่ได้ถูกแปลงเป็น 1');
    if (r.rejectedCount !== 1) errs.push(`rejectedCount = ${r.rejectedCount}`);
    add('null นับหัวในตัวหาร แต่ปฏิเสธไม่ได้', errs.length === 0, errs.join(' · ') || undefined);
  }

  // ── 8. ตัวหารต้องสะท้อนครอบครัวจริง ไม่ใช่เฉพาะตัวที่ดูดี ──
  //
  // p เดียวกัน (0.01) ในครอบครัว 3 ตัว ปฏิเสธได้ แต่ในครอบครัว 50 ตัวปฏิเสธไม่ได้
  // เกณฑ์ที่อันดับ 1 คือ 0.05/50 = 0.001 · 0.01 > 0.001
  {
    const small = holm([0.01, 0.4, 0.5], { alpha: 0.05 });
    const big = holm([0.01, ...Array(49).fill(0.4)], { alpha: 0.05 });
    const ok = small.results[0].reject === true && big.results[0].reject === false && big.m === 50;
    add('ขนาดครอบครัวเปลี่ยนคำตอบจริง (3 vs 50)', ok,
      ok ? undefined : `small ${small.results[0].adjustedP} · big ${big.results[0].adjustedP} · m ${big.m}`);
  }

  // ── 9. guard: expectedFamilySize ไม่ตรงต้อง throw ──
  {
    let threw = false;
    try { holm([0.01, 0.02], { expectedFamilySize: 50 }); } catch { threw = true; }
    let ok2 = true;
    try { holm([0.01, 0.02], { expectedFamilySize: 2 }); } catch { ok2 = false; }
    add('guard ขนาดครอบครัวทำงาน', threw && ok2,
      threw ? (ok2 ? undefined : 'เคสที่ตรงกันดันโยน error') : 'เคสที่ไม่ตรงกันไม่โยน error');
  }

  // ── 10. p นอกช่วง / ไม่ใช่ตัวเลข ต้อง throw ──
  {
    const bad = [[-0.1], [1.5], [NaN], ['0.01']];
    const allThrew = bad.every((v) => {
      try { holm(v); return false; } catch { return true; }
    });
    add('p ที่ใช้ไม่ได้ถูกปฏิเสธ', allThrew, allThrew ? undefined : 'มีค่าผิดที่หลุดผ่าน');
  }

  // ── 11. array ว่าง ──
  {
    const r = holm([], { alpha: 0.05 });
    add('array ว่างคืน m = 0', r.m === 0 && r.results.length === 0 && r.rejectedCount === 0);
  }

  // ── 12. ลำดับผลลัพธ์ต้องเป็นลำดับเดิมที่ส่งเข้ามา ──
  {
    const ps = [0.4, 0.001, 0.2];
    const r = holm(ps, { alpha: 0.05 });
    const ok = r.results.every((x, i) => x.index === i && near(x.p, ps[i]));
    add('ผลลัพธ์เรียงตามลำดับ input', ok, ok ? undefined : JSON.stringify(r.results.map((x) => x.p)));
  }

  // ── 13. Holm ต้องไม่แพ้ Bonferroni และไม่หลวมกว่า "ไม่แก้เลย" ──
  //
  // ความสัมพันธ์ที่ต้องจริงเสมอ: p ≤ adjusted_holm ≤ min(1, m × p)
  {
    const rnd = mulberry32(20260828);
    const errs = [];
    for (let trial = 0; trial < 300 && errs.length === 0; trial++) {
      const m = 1 + ((rnd() * 40) | 0);
      const ps = Array.from({ length: m }, () => rnd());
      const r = holm(ps, { alpha: 0.05 });
      for (const x of r.results) {
        if (x.adjustedP < x.p - 1e-12) errs.push(`adjusted ${x.adjustedP} < p ${x.p}`);
        if (x.adjustedP > Math.min(1, m * x.p) + 1e-12) errs.push(`adjusted ${x.adjustedP} > Bonferroni ${Math.min(1, m * x.p)}`);
      }
    }
    add('p ≤ Holm ≤ Bonferroni เสมอ (สุ่ม 300 ชุด)', errs.length === 0, errs.slice(0, 2).join(' · ') || undefined);
  }

  // ── 14. สูตร adjusted p ต้องให้ชุดที่ถูกปฏิเสธตรงกับ step-down ตรงตัว ──
  {
    const rnd = mulberry32(776655);
    const errs = [];
    for (let trial = 0; trial < 400 && errs.length === 0; trial++) {
      const m = 1 + ((rnd() * 30) | 0);
      // ผสม p เล็กจัดเข้าไปด้วย ไม่งั้นแทบไม่มีเคสที่ปฏิเสธเลยแล้วเทสต์ไม่ได้ตรวจอะไร
      const ps = Array.from({ length: m }, () => (rnd() < 0.4 ? rnd() * 0.01 : rnd()));
      const alpha = rnd() < 0.5 ? 0.05 : 0.1;
      const viaAdj = new Set(holm(ps, { alpha }).results.filter((x) => x.reject).map((x) => x.index));
      const viaStep = rejectSetByStepDown(ps, alpha);
      if (viaAdj.size !== viaStep.size || [...viaAdj].some((i) => !viaStep.has(i))) {
        errs.push(`ต่างกันที่ m=${m} alpha=${alpha}: adj ${[...viaAdj].join(',')} vs step ${[...viaStep].join(',')}`);
      }
    }
    add('adjusted p ตรงกับ step-down ตรงตัว (สุ่ม 400 ชุด)', errs.length === 0, errs[0]);
  }

  // ── 15. holmFromEntries ต้องคงคีย์เดิมและให้ตัวเลขชุดเดียวกัน ──
  {
    const entries = [{ key: 'a', p: 0.01 }, { key: 'b', p: 0.04 }, { key: 'c', p: null }];
    const r = holmFromEntries(entries, { alpha: 0.05, expectedFamilySize: 3 });
    const ok = r.m === 3 && r.results.map((x) => x.key).join(',') === 'a,b,c'
      && near(r.results[0].adjustedP, 0.03) && r.results[2].p === 1;
    add('holmFromEntries คงคีย์และตัวเลข', ok, ok ? undefined : JSON.stringify(r.results));
  }

  return { passed: checks.every((c) => c.pass), checks };
}

// ═══════════════════════════════ CLI ═══════════════════════════════

// เช็คแค่ธง ไม่เช็คว่าเป็นไฟล์หลักไหม — เพราะไฟล์ที่ import โมดูลนี้ก็ควรได้สิทธิ์รัน
// self-test เดียวกันด้วยการส่ง --self-test ต่อ ไม่ต้องมี entrypoint แยก
if (process.argv.includes('--self-test')) {
  const res = selfTest();
  console.log('\n── holm self-test ──');
  for (const c of res.checks) {
    console.log(`  ${c.pass ? 'ผ่าน  ' : 'ไม่ผ่าน'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
  }
  console.log(res.passed ? '\nholm self-test ผ่านครบทุกข้อ\n' : '\nholm self-test ไม่ผ่าน\n');
  process.exitCode = res.passed ? 0 : 1;
}
