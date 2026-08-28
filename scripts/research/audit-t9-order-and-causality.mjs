#!/usr/bin/env node
/**
 * สองอย่างที่ self-test ของตัวรันไม่ได้ตรวจ:
 *
 * 1. ลำดับการเรียกมีผลไหม — สองไฟล์กฎเก็บ PIVOT_CACHE (WeakMap) ไว้ระดับโมดูล
 *    ถ้าแคชนั้นรั่ว ผลของแท่ง t จะขึ้นกับว่าเคยถูกเรียกที่ t ใหญ่กว่ามาก่อนหรือไม่
 *    (ตัวรันเรียก probeRuleCausality ที่ t สุ่ม ก่อนเดินลูปจริงจาก t น้อยไปมาก
 *     บน bars ก้อนเดียวกัน — ถ้ารั่ว EURUSD จะเพี้ยนอยู่ตัวเดียว หาไม่เจอด้วยตาเปล่า)
 *
 * 2. ด่าน causality ของตัวรันสุ่มแค่ 40 จุด บน EURUSD ตัวเดียว — ตรงนี้ขยายเป็น
 *    3 สินทรัพย์ × 250 จุด ต่อกฎ ต่อกรอบเวลา
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadProbe } from './audit-rule-lab-probe.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const P = await loadProbe();
const tfs = ['1D', '1H'];
const bounds = P.loadSplitBoundaries(tfs);
const SYMS = [
  { market: 'FOREX', symbol: 'EURUSD' },
  { market: 'GOLD', symbol: 'XAUUSD' },
  { market: 'FOREX', symbol: 'GBPJPY' },
];

const rules = await P.loadRules(null);
const cache = new Map();
const key = (v) => `${v.bull ? 1 : 0}${v.bear ? 1 : 0}${v.veto ?? '-'}${v.score}`;

let orderBad = [];
let causBad = [];

for (const rule of rules) {
  for (const tf of tfs) {
    for (const u of SYMS) {
      const ds = P.prepareDataset(u, tf, bounds, cache);
      const { bars, ind } = ds;
      const last = bars.length - 2;
      const idx = [];
      const rnd = P.mulberry32(20260828);
      for (let s = 0; s < 400; s++) idx.push(P.WARMUP_BARS + ((rnd() * (last - P.WARMUP_BARS)) | 0));

      // ── 1. ลำดับ: เดินหน้าเรียงจากน้อยไปมาก เทียบกับเรียกแบบสลับลำดับบนโมดูลใหม่ ──
      const fwd = new Map();
      for (let t = P.WARMUP_BARS; t <= last; t++) {
        const htf = ds.htfFor ? ds.htfFor(t) : null;
        if (rule.meta.needsHtf && !htf) continue;
        const v = rule.evaluate({ bars, t, ind, htf });
        if (idx.includes(t)) fwd.set(t, key(v));
      }
      // โมดูลใหม่ = แคชระดับโมดูลว่างเปล่า แล้วเรียกแบบสุ่มลำดับ (จากมากไปน้อย)
      const fresh = await import(
        `${pathToFileURL(path.join(SELF_DIR, 'rules', `${rule.slug}.mjs`)).href}?o=${Date.now()}-${Math.random()}`);
      const shuffled = [...new Set(idx)].sort((a, b) => b - a);
      for (const t of shuffled) {
        const htf = ds.htfFor ? ds.htfFor(t) : null;
        if (rule.meta.needsHtf && !htf) continue;
        const v = fresh.evaluate({ bars, t, ind, htf });
        const before = fwd.get(t);
        if (before !== undefined && before !== key(v)) {
          orderBad.push(`${rule.slug}/${tf}/${u.symbol}@${t}: เรียงหน้า ${before} · สลับลำดับ ${key(v)}`);
        }
      }

      // ── 2. causality ลึกกว่าที่ตัวรันตรวจ ──
      const f = P.probeRuleCausality(rule, ds, { samples: 250, seed: 20260828 });
      if (f.length) causBad.push(`${rule.slug}/${tf}/${u.symbol}: ${f.map((x) => x.t).join(',')}`);
    }
  }
}

console.log(`กฎที่ผลขึ้นกับลำดับการเรียก: ${orderBad.length ? orderBad.slice(0, 6).join(' | ') : 'ไม่มี'}`);
console.log(`กฎที่ตกด่าน causality แบบลึก (3 สินทรัพย์ × 250 จุด × 2 กรอบ): ${causBad.length ? causBad.slice(0, 6).join(' | ') : 'ไม่มี'}`);
