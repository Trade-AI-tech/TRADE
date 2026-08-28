#!/usr/bin/env node
/**
 * เดินลูปสัญญาณเองแบบอิสระ แล้วเทียบกับตัวเลขที่ runRuleOnTimeframe คืนมา
 * เป้าหมาย: ตอบว่า "แถวที่ตัวเลขไม่สอดคล้องกันเอง" เกิดจากโค้ดจริง หรือจากไฟล์รายงานเก่า
 */
import { loadProbe } from './audit-rule-lab-probe.mjs';

const P = await loadProbe();
const which = (process.argv[2] ?? 'confluence-core-decayed-vote,confluence-core-equal-weight-vote').split(',');
const tf = process.argv[3] ?? '1D';

const bounds = P.loadSplitBoundaries([tf]);
const rules = await P.loadRules(which);
const cache = new Map();

for (const rule of rules) {
  // ── ทางที่หนึ่ง: ให้ตัวรันคำนวณเอง ──
  const got = P.runRuleOnTimeframe(rule, tf, bounds, cache, { bootstrap: 200, seed: 20260817 });

  // ── ทางที่สอง: เดินลูปเองด้วยชิ้นส่วนเดียวกัน ──
  const trades = [];
  let signals = 0;
  let conflicts = 0;
  const perSym = {};
  for (const u of P.UNIVERSE) {
    const ds = P.prepareDataset(u, tf, bounds, cache);
    const { bars, ind } = ds;
    let sym = 0;
    for (let t = P.WARMUP_BARS; t <= bars.length - 2; t++) {
      const htf = ds.htfFor ? ds.htfFor(t) : null;
      if (rule.meta.needsHtf && !htf) continue;
      const v = rule.evaluate({ bars, t, ind, htf });
      const bull = v.bull && v.veto !== 'bull' && v.veto !== 'both';
      const bear = v.bear && v.veto !== 'bear' && v.veto !== 'both';
      if (!bull && !bear) continue;
      if (bull && bear) { conflicts++; continue; }
      signals++;
      const tr = P.simulateTrade(bars, t, bull ? 'long' : 'short', ind.atr[t], u.symbol, u.market,
        P.MAX_HOLD_BARS[tf]);
      if (!tr) continue;
      trades.push(tr);
      sym++;
    }
    perSym[u.symbol] = sym;
  }
  const n = trades.length;
  const sumR = trades.reduce((a, x) => a + x.rNet, 0);
  const wins = trades.filter((x) => x.rNet > 0).length;

  console.log(`\n── ${rule.slug} / ${tf} ──`);
  console.log(`  ตัวรัน   : trades=${got.trades} totalR=${got.totalR} avgR=${got.avgR} winRate=${got.winRate}`);
  console.log(`  นับเอง   : trades=${n}        totalR=${sumR} avgR=${sumR / n} winRate=${wins / n}`);
  console.log(`  signals  : ตัวรัน ${got.signals} · นับเอง ${signals} · conflicts ตัวรัน ${got.conflicts} นับเอง ${conflicts}`);
  const same = got.trades === n
    && Math.abs(got.totalR - sumR) < 1e-9
    && Math.abs(got.avgR - sumR / n) < 1e-12
    && Math.abs(got.winRate - wins / n) < 1e-12;
  console.log(`  ตรงกันไหม: ${same ? 'ตรง' : '*** ไม่ตรง ***'}`);
  // ความสอดคล้องภายในแถวเดียว
  const selfOk = Math.abs(got.avgR - got.totalR / got.trades) < 1e-12
    && Math.abs(got.winRate * got.trades - Math.round(got.winRate * got.trades)) < 1e-6;
  console.log(`  แถวสอดคล้องกันเอง (avgR = totalR/trades และ winRate×trades เป็นจำนวนเต็ม): ${selfOk ? 'ใช่' : '*** ไม่ ***'}`);
}
