#!/usr/bin/env node
/**
 * veto-audit-perm-strata.mjs — พิสูจน์แบบไม่แพ้เศษทศนิยมว่า null แบบ stratified
 * ตัดไม้ต่อ symbol ครบเท่าของจริง "ทุก symbol ทุกรอบ"
 *
 * ทำไมต้องมีไฟล์นี้แยก: การเช็ค nullSd === 0 แพ้เศษทศนิยม เพราะ permutationTest
 * คิดความแปรปรวนแบบผ่านเดียว (sumSq/B − mean²) ซึ่งทิ้งเศษระดับ 1e-7 ได้เมื่อ B ใหญ่
 * ไฟล์นี้จึงตั้งเกณฑ์จาก "ขนาดของความผิดที่เล็กที่สุดที่เป็นไปได้" แทน
 *
 * วิธี: ตั้ง rNet เป็นธงของ symbol เดียว (1 ถ้าเป็น symbol นั้น · 0 ถ้าไม่ใช่)
 * แล้ว sumCut ของแต่ละรอบ = "จำนวนไม้ของ symbol นั้นที่ถูกสุ่มตัด" พอดี
 * ถ้า stratified ถูก ค่านี้ต้องคงที่ = kg ทุกรอบ → nullSd = 0
 * ถ้าผิดแม้แค่ 1 ไม้ในรอบเดียวจาก B รอบ nullSd จะโตขึ้นอย่างน้อย (1/keep)·sqrt(1/B)
 * เกณฑ์จึงตั้งไว้ต่ำกว่านั้น 100 เท่า — ต่ำพอจะจับความผิดหนึ่งไม้ แต่สูงกว่าเศษทศนิยมมาก
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadVetoProbe } from './veto-audit-perm-probe.mjs';
import { loadProbe } from './audit-rule-lab-probe.mjs';

const SCRATCH = 'C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad';
const SELF = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));

const main = async () => {
  const V = await loadVetoProbe();
  const L = await loadProbe();
  V.__setRng(L.mulberry32);
  const rep = JSON.parse(fs.readFileSync(path.join(SELF, 'reports', 'veto-lab.json'), 'utf8'));

  let allOk = true;
  for (const tf of ['1D', '1H']) {
    const f = path.join(SCRATCH, `veto-audit-base-${tf}.json`);
    if (!fs.existsSync(f)) { console.log(`ข้าม ${tf} (ยังไม่มีแคชกองไม้)`); continue; }
    const base = JSON.parse(fs.readFileSync(f, 'utf8'));
    const n = base.symbols.length;
    const byKey = new Map();
    for (let i = 0; i < n; i++) {
      let a = byKey.get(base.symbols[i]); if (!a) { a = []; byKey.set(base.symbols[i], a); } a.push(i);
    }
    const groups = { byKey, keyOf: base.symbols.slice() };
    const B = 2000;

    console.log(`\n══════ D. stratification แบบไม่แพ้เศษทศนิยม · ${tf} · ${n} ไม้ · ${byKey.size} symbol ══════\n`);

    for (const row of rep.timeframes[tf].results) {
      if (row.config === 'baseline') continue;
      let mask = 0; for (const s of row.rules) mask |= (1 << V.VETO_SLUGS.indexOf(s));
      const cutIdx = []; for (let i = 0; i < n; i++) if (base.vetoMask[i] & mask) cutIdx.push(i);
      const keep = n - cutIdx.length;
      // ความผิดที่เล็กที่สุดที่เป็นไปได้ = ตัดผิดไป 1 ไม้ ในรอบเดียวจาก B รอบ
      const oneMiss = (1 / keep) * Math.sqrt(1 / B);
      const thresh = oneMiss / 100;

      const bad = [];
      for (const [sym, idxs] of byKey) {
        const kg = idxs.reduce((a, i) => a + ((base.vetoMask[i] & mask) ? 1 : 0), 0);
        const rNet = Float64Array.from(base.symbols, (s) => (s === sym ? 1 : 0));
        const r = V.permutationTest({ rNet, groups, cutIdx, B, seed: 909 + kg, stratified: true });
        // sumCut ต้องเท่ากับ kg ทุกรอบ → deltaObs ต้องเท่ากับ nullMean และ nullSd ต้อง ~0
        if (!(r.nullSd < thresh)) bad.push(`${sym}: nullSd=${r.nullSd.toExponential(2)} >= ${thresh.toExponential(2)}`);
        if (!(Math.abs(r.nullMean - r.deltaObs) < thresh)) {
          bad.push(`${sym}: nullMean-deltaObs=${(r.nullMean - r.deltaObs).toExponential(2)}`);
        }
        // ตรวจซ้ำอีกชั้น: จำนวนที่ตัดจริงต้องตรงกับที่รายงานไว้
        const reported = (row.cutPerSymbol ?? {})[sym] ?? 0;
        if (kg !== reported) bad.push(`${sym}: kg ${kg} != cutPerSymbol ${reported}`);
      }
      const status = bad.length === 0 ? 'ผ่าน   ' : 'ไม่ผ่าน';
      if (bad.length) allOk = false;
      console.log(`  ${status} ${row.config.padEnd(20)} k=${String(cutIdx.length).padStart(5)}`
        + ` · ตรวจครบ ${byKey.size} symbol · เกณฑ์ ${thresh.toExponential(1)}`
        + (bad.length ? `\n           ${bad.slice(0, 3).join(' | ')}` : ''));
    }

    // เคสควบคุม: จงใจตัดผิด 1 ไม้ (ย้าย 1 ไม้ข้าม symbol) ต้องจับได้
    {
      const row = rep.timeframes[tf].results.find((r) => r.config === 'overext');
      let mask = 0; for (const s of row.rules) mask |= (1 << V.VETO_SLUGS.indexOf(s));
      const cutIdx = []; for (let i = 0; i < n; i++) if (base.vetoMask[i] & mask) cutIdx.push(i);
      const keep = n - cutIdx.length;
      const thresh = (1 / keep) * Math.sqrt(1 / B) / 100;
      // ย้ายไม้ที่ถูกตัด 1 ไม้ ไปเป็นไม้ของอีก symbol หนึ่ง แล้วดูว่าค่าที่คาดเปลี่ยนไหม
      const sym0 = base.symbols[cutIdx[0]];
      const other = [...byKey.keys()].find((s) => s !== sym0);
      const moved = [byKey.get(other)[0], ...cutIdx.slice(1)];
      const rNet = Float64Array.from(base.symbols, (s) => (s === sym0 ? 1 : 0));
      const r = V.permutationTest({ rNet, groups, cutIdx: moved, B, seed: 909, stratified: true });
      const rOrig = V.permutationTest({ rNet, groups, cutIdx, B, seed: 909, stratified: true });
      const detected = Math.abs(r.nullMean - rOrig.nullMean) > thresh;
      console.log(`\n  ${detected ? 'ผ่าน   ' : 'ไม่ผ่าน'} เคสควบคุม: ย้ายไม้ที่ตัด 1 ไม้ข้าม symbol แล้วจับได้`
        + ` (ต่าง ${Math.abs(r.nullMean - rOrig.nullMean).toExponential(2)} > เกณฑ์ ${thresh.toExponential(1)})`);
      if (!detected) allOk = false;
    }
  }
  console.log(allOk ? '\nD: ผ่านครบทุกข้อ\n' : '\nD: ไม่ผ่าน\n');
  return allOk ? 0 : 1;
};

main().then((c) => process.exit(c)).catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
