#!/usr/bin/env node
/**
 * veto-audit-perm-blocknull.mjs — วัดว่า "ข้อสมมติสับเปลี่ยนได้" ที่ null ของ veto-lab ใช้
 * ทำให้ผลเอนไปทางไหน และเอนแรงพอจะเปลี่ยนข้อสรุปไหม
 *
 * ที่มา: veto-lab สุ่มตัด k ไม้ "กระจายทั่วกอง" แต่วีโต้จริงไม่ได้ตัดแบบนั้น มันตัดกระจุก
 * ตามช่วงเวลา และไม้ที่อยู่ติดกันตามเวลาก็ทับช่วงถือกันเอง (สัญญาณยิงได้ทุกแท่ง
 * ไม้ที่ห่างกันแท่งเดียวจึงถือทับกันเกือบทั้งไม้) R ของมันจึงสัมพันธ์กัน
 * null ที่กระจายทั่วกองจะ "แคบเกินจริง" → p เล็กเกินจริง
 *
 * ไฟล์นี้ไม่ได้แก้ null ของเดิม แต่สร้าง null ที่เข้มกว่าไว้เทียบ:
 *
 *   null แบบหมุนวง (circular rotation) — เรียงไม้ของแต่ละ symbol ตามเวลา แล้วหมุน
 *   "ธงตัด/ไม่ตัด" ทั้งแถบไปแบบสุ่ม เก็บทั้งจำนวนที่ตัดต่อ symbol และรูปแบบการกระจุก
 *   ไว้ครบเป๊ะ เปลี่ยนแค่ "ตัดตอนไหน" — ตอบคำถามว่า "วีโต้เลือกจังหวะเก่ง หรือแค่บังเอิญ
 *   ไปตัดโดนช่วงที่ดี" ซึ่งเป็นคำถามเดียวกับที่ veto-lab ตั้งใจถาม แต่ไม่ทิ้งโครงเวลา
 *
 * ถ้า p แบบหมุนวง "ใหญ่กว่า" p เดิม แปลว่า null เดิมหลวมไปทางให้คุณวีโต้
 * ข้อสรุป "ไม่มีวีโต้ไหนรอด" จึงยิ่งแน่นขึ้น ไม่ใช่สั่นคลอน
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadVetoProbe } from './veto-audit-perm-probe.mjs';
import { loadProbe } from './audit-rule-lab-probe.mjs';

const SCRATCH = 'C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad';
const SELF = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const n4 = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

/** สหสัมพันธ์ที่ระยะ lag ของอนุกรม (ใช้ดูว่า R ของไม้ที่ติดกันตามเวลาสัมพันธ์กันจริงไหม) */
function autocorr(x, lag) {
  const n = x.length;
  let m = 0; for (const v of x) m += v; m /= n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { den += (x[i] - m) ** 2; if (i + lag < n) num += (x[i] - m) * (x[i + lag] - m); }
  return den > 0 ? num / den : 0;
}

const main = async () => {
  const tf = process.argv.includes('--tf=1H') ? '1H' : '1D';
  const V = await loadVetoProbe();
  const L = await loadProbe();
  V.__setRng(L.mulberry32);

  const base = JSON.parse(fs.readFileSync(path.join(SCRATCH, `veto-audit-base-${tf}.json`), 'utf8'));
  const rep = JSON.parse(fs.readFileSync(path.join(SELF, 'reports', 'veto-lab.json'), 'utf8')).timeframes[tf];
  const n = base.symbols.length;
  const rNet = Float64Array.from(base.rNet);

  // เรียงไม้ของแต่ละ symbol ตามเวลา — โครงที่ null แบบหมุนวงต้องรักษาไว้
  const bySym = new Map();
  for (let i = 0; i < n; i++) {
    let a = bySym.get(base.symbols[i]);
    if (!a) { a = []; bySym.set(base.symbols[i], a); }
    a.push(i);
  }
  for (const a of bySym.values()) a.sort((x, y) => Date.parse(base.signalTime[x]) - Date.parse(base.signalTime[y]));
  const groups = { byKey: bySym, keyOf: base.symbols.slice() };

  console.log(`\n══════ C. โครงเวลาและ null ทางเลือก · ${tf} · ${n} ไม้ ══════\n`);

  // ── C1. R ของไม้ที่ติดกันตามเวลาสัมพันธ์กันจริงไหม ─────────────────────
  {
    const acs = [];
    for (const lag of [1, 2, 5, 10]) {
      let s = 0, w = 0;
      for (const a of bySym.values()) {
        if (a.length < 30) continue;
        s += autocorr(a.map((i) => rNet[i]), lag) * a.length; w += a.length;
      }
      acs.push(`lag${lag}=${n4(s / w, 3)}`);
    }
    console.log(`  C1 สหสัมพันธ์ของ R ตามเวลา (ถ่วงน้ำหนักตามขนาด symbol): ${acs.join(' · ')}`);
    console.log('     > 0 ชัด ๆ = ไม้ที่ติดกันไม่เป็นอิสระ → null ที่สุ่มกระจายทั่วกองจะแคบเกินจริง\n');
  }

  // ── C2. วีโต้จริงตัดกระจุกแค่ไหน เทียบกับการสุ่มตัดกระจาย ───────────────
  {
    console.log('  C2 ความกระจุกของการตัดจริง (สัดส่วนคู่ติดกันที่ถูกตัดทั้งคู่ / ที่คาดถ้าสุ่ม):');
    for (const row of rep.results) {
      if (row.config === 'baseline') continue;
      let mask = 0; for (const s of row.rules) mask |= (1 << V.VETO_SLUGS.indexOf(s));
      let pairs = 0, both = 0;
      for (const a of bySym.values()) {
        for (let i = 0; i + 1 < a.length; i++) {
          pairs++;
          if ((base.vetoMask[a[i]] & mask) && (base.vetoMask[a[i + 1]] & mask)) both++;
        }
      }
      const obs = both / pairs;
      const exp = (row.cut / n) ** 2;
      console.log(`     ${row.config.padEnd(20)} ตัด ${String(row.cut).padStart(5)} ไม้ · คู่ติดกันถูกตัดทั้งคู่ ${n4(obs, 4)}`
        + ` · ถ้าสุ่ม ${n4(exp, 4)} · กระจุกเป็น ${n4(obs / exp, 2)}×`);
    }
    console.log('');
  }

  // ── C3. p ภายใต้ null แบบหมุนวง เทียบกับ p ที่รายงาน ────────────────────
  //
  // null แบบหมุนวงรักษาทั้งจำนวนที่ตัดต่อ symbol และรูปแบบการกระจุกไว้ครบ
  // จึงเป็น null ที่ "ยุติธรรมกว่า" สำหรับวีโต้ที่ตัดกระจุก
  {
    const B = 5000;
    console.log(`  C3 p เดิม (สุ่มกระจาย) เทียบ p แบบหมุนวง (รักษาโครงเวลา) · B=${B}:`);
    console.log(`     ${'ชุด'.padEnd(20)} ${'delta'.padStart(9)} ${'p เดิม strat'.padStart(13)} ${'p หมุนวง'.padStart(10)} ${'null SD เดิม'.padStart(12)} ${'null SD หมุน'.padStart(12)}`);
    const out = [];
    let sumAll = 0; for (let i = 0; i < n; i++) sumAll += rNet[i];
    const meanAll = sumAll / n;

    for (const row of rep.results) {
      if (row.config === 'baseline') continue;
      let mask = 0; for (const s of row.rules) mask |= (1 << V.VETO_SLUGS.indexOf(s));
      const k = row.cut;
      const keep = n - k;
      let sumCutObs = 0;
      for (let i = 0; i < n; i++) if (base.vetoMask[i] & mask) sumCutObs += rNet[i];
      const deltaObs = (sumAll - sumCutObs) / keep - meanAll;

      // ธงตัดของแต่ละ symbol เรียงตามเวลา + ค่า R เรียงตามเวลา
      const seq = [];
      for (const a of bySym.values()) {
        seq.push({
          flag: a.map((i) => ((base.vetoMask[i] & mask) !== 0 ? 1 : 0)),
          r: a.map((i) => rNet[i]),
        });
      }
      const rnd = L.mulberry32(0x30713 + k);
      let ge = 0;
      let sum = 0, sumSq = 0;
      for (let b = 0; b < B; b++) {
        let sumCut = 0;
        for (const g of seq) {
          const m = g.flag.length;
          const off = (rnd() * m) | 0;
          for (let i = 0; i < m; i++) if (g.flag[i]) sumCut += g.r[(i + off) % m];
        }
        const d = (sumAll - sumCut) / keep - meanAll;
        if (d >= deltaObs - 1e-15) ge++;
        sum += d; sumSq += d * d;
      }
      const pRot = (ge + 1) / (B + 1);
      const mu = sum / B;
      const sdRot = Math.sqrt(Math.max(0, sumSq / B - mu * mu));
      out.push({ cfg: row.config, deltaObs, pOld: row.permStratified.pOneSided, pRot, sdOld: row.permStratified.nullSd, sdRot });
      console.log(`     ${row.config.padEnd(20)} ${n4(deltaObs, 5).padStart(9)} ${n4(row.permStratified.pOneSided, 4).padStart(13)}`
        + ` ${n4(pRot, 4).padStart(10)} ${n4(row.permStratified.nullSd, 5).padStart(12)} ${n4(sdRot, 5).padStart(12)}`);
    }
    const wider = out.filter((o) => o.sdRot > o.sdOld).length;
    const bigger = out.filter((o) => o.pRot > o.pOld).length;
    const minOld = Math.min(...out.map((o) => o.pOld));
    const minRot = Math.min(...out.map((o) => o.pRot));
    console.log(`\n     null แบบหมุนวงกว้างกว่าเดิม ${wider}/${out.length} ชุด · p ใหญ่ขึ้น ${bigger}/${out.length} ชุด`);
    console.log(`     p เล็กสุด: เดิม ${n4(minOld, 4)} → หมุนวง ${n4(minRot, 4)}`);
    console.log(`     ${minRot >= minOld ? 'null เดิมหลวมไปทางให้คุณวีโต้ → ข้อสรุป "ไม่มีอะไรรอด" ยิ่งแน่นขึ้น'
      : 'null เดิมเข้มกว่า null ทางเลือก — ต้องดูต่อว่ากลบของจริงทิ้งหรือเปล่า'}\n`);
  }

  // ── C4. หมุนวงด้วย "ออฟเซ็ตร่วม" — เก็บการกระจุกข้าม symbol ในวันเดียวกันไว้ด้วย ──
  //
  // C3 หมุนแต่ละ symbol อิสระกัน ซึ่งทำลาย "วันเดียวกันของหลายคู่เงิน" ทิ้งไป
  // แต่จักรวาลนี้มีคู่ที่เดินด้วยกันแรงมาก (EURUSD/GBPUSD/EURGBP · USDJPY/EURJPY/GBPJPY
  // · XAUUSD/XAGUSD) วีโต้ที่ยิงเพราะสภาพตลาดวันนั้นจะตัดพร้อมกันหลายตัว
  // ถ้าอคติจากตรงนี้แรง null เดิมจะแคบเกินจริงมากกว่าที่ C3 เห็น
  //
  // ใช้ออฟเซ็ตร่วม u ∈ [0,1) แล้วเลื่อนแต่ละ symbol เป็นสัดส่วนของจำนวนไม้ของตัวเอง
  // (≈ การเลื่อนปฏิทินพร้อมกันทั้งกระดาน) — จำนวนที่ตัดต่อ symbol ยังคงเดิมเป๊ะทุกตัว
  {
    const B = 5000;
    console.log(`  C4 หมุนวงแบบออฟเซ็ตร่วม (รักษาการกระจุกข้าม symbol ในวันเดียวกัน) · B=${B}:`);
    console.log(`     ${'ชุด'.padEnd(20)} ${'p เดิม'.padStart(8)} ${'p ร่วม'.padStart(8)} ${'SD เดิม'.padStart(9)} ${'SD ร่วม'.padStart(9)} ${'SD ร่วม/เดิม'.padStart(12)}`);
    let sumAll = 0; for (let i = 0; i < n; i++) sumAll += rNet[i];
    const meanAll = sumAll / n;
    const out = [];
    for (const row of rep.results) {
      if (row.config === 'baseline') continue;
      let mask = 0; for (const s of row.rules) mask |= (1 << V.VETO_SLUGS.indexOf(s));
      const keep = n - row.cut;
      let sumCutObs = 0;
      for (let i = 0; i < n; i++) if (base.vetoMask[i] & mask) sumCutObs += rNet[i];
      const deltaObs = (sumAll - sumCutObs) / keep - meanAll;

      const seq = [];
      for (const a of bySym.values()) {
        seq.push({
          flag: a.map((i) => ((base.vetoMask[i] & mask) !== 0 ? 1 : 0)),
          r: a.map((i) => rNet[i]),
        });
      }
      const rnd = L.mulberry32(0x9c4a1 + row.cut);
      let ge = 0, sum = 0, sumSq = 0;
      for (let b = 0; b < B; b++) {
        const u = rnd();                       // ออฟเซ็ตร่วมหนึ่งค่าต่อรอบ
        let sumCut = 0;
        for (const g of seq) {
          const m = g.flag.length;
          const off = (u * m) | 0;
          for (let i = 0; i < m; i++) if (g.flag[i]) sumCut += g.r[(i + off) % m];
        }
        const d = (sumAll - sumCut) / keep - meanAll;
        if (d >= deltaObs - 1e-15) ge++;
        sum += d; sumSq += d * d;
      }
      const p = (ge + 1) / (B + 1);
      const mu = sum / B;
      const sd = Math.sqrt(Math.max(0, sumSq / B - mu * mu));
      out.push({ p, pOld: row.permStratified.pOneSided, sd, sdOld: row.permStratified.nullSd });
      console.log(`     ${row.config.padEnd(20)} ${n4(row.permStratified.pOneSided, 4).padStart(8)} ${n4(p, 4).padStart(8)}`
        + ` ${n4(row.permStratified.nullSd, 5).padStart(9)} ${n4(sd, 5).padStart(9)} ${n4(sd / row.permStratified.nullSd, 2).padStart(12)}`);
    }
    const ratios = out.map((o) => o.sd / o.sdOld);
    const minOld = Math.min(...out.map((o) => o.pOld));
    const minNew = Math.min(...out.map((o) => o.p));
    console.log(`\n     null ร่วมกว้างกว่าเดิม ${n4(Math.min(...ratios), 2)}–${n4(Math.max(...ratios), 2)}× (มัธยฐาน ${n4(ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)], 2)}×)`);
    console.log(`     p เล็กสุด: เดิม ${n4(minOld, 4)} → ออฟเซ็ตร่วม ${n4(minNew, 4)}`);
    console.log(`     ยิ่ง null กว้างขึ้น p ยิ่งใหญ่ขึ้น — อคติของ null เดิมอยู่ฝั่ง "ให้คุณวีโต้"`);
    console.log(`     จะพลิกข้อสรุปได้ต้องมีอคติฝั่งตรงข้าม (p ใหญ่เกินจริง) ซึ่งไม่พบ\n`);
  }
};

main().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
