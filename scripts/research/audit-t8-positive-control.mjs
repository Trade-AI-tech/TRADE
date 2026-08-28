#!/usr/bin/env node
/**
 * ตัวควบคุมด้านบวก — ถ้าท่อวัดนี้ "ฆ่า" ขอบทุกชนิดโดยกลไก (ต้นทุน/เพดานถือ/bootstrap)
 * แม้แต่สัญญาณที่รู้อนาคตก็ต้องออกมาแบน การทดสอบนี้จึงป้อนสัญญาณที่มองอนาคตจริง ๆ
 * เข้าไปในท่อเดียวกันเป๊ะ (simulateTrade + bootstrapClusterStats ตัวเดิม)
 *
 * ผลที่ต้องได้ถ้าท่อไม่พัง: avgR เป็นบวกชัด ๆ และ p เล็กมาก
 * ผลที่แปลว่าท่อพัง: avgR ยังติดลบหรือ p ยังใหญ่ ทั้งที่สัญญาณรู้คำตอบล่วงหน้า
 */
import { loadProbe } from './audit-rule-lab-probe.mjs';

const P = await loadProbe();
const tf = process.argv[2] ?? '1D';
const bounds = P.loadSplitBoundaries([tf]);
const cache = new Map();
const maxHold = P.MAX_HOLD_BARS[tf];

const run = (label, pick) => {
  const trades = [];
  for (const u of P.UNIVERSE) {
    const ds = P.prepareDataset(u, tf, bounds, cache);
    const { bars, ind } = ds;
    for (let t = P.WARMUP_BARS; t <= bars.length - 2; t++) {
      const side = pick(bars, t, ind);
      if (!side) continue;
      const tr = P.simulateTrade(bars, t, side, ind.atr[t], u.symbol, u.market, maxHold);
      if (tr) trades.push(tr);
    }
  }
  const n = trades.length;
  const sum = trades.reduce((a, x) => a + x.rNet, 0);
  const raw = trades.reduce((a, x) => a + x.rawR, 0);
  const cost = trades.reduce((a, x) => a + x.costR, 0);
  const win = trades.filter((x) => x.rNet > 0).length;
  const ci = P.bootstrapClusterStats(trades, { B: 20000, seed: 20260817 });
  console.log(`${label.padEnd(46)} ไม้ ${String(n).padStart(7)}`
    + ` · avgR ${(sum / n).toFixed(4).padStart(8)}`
    + ` (raw ${(raw / n).toFixed(4)} − ต้นทุน ${(cost / n).toFixed(4)})`
    + ` · ชนะ ${((win / n) * 100).toFixed(1)}%`
    + ` · CI95 [${ci.lo95.toFixed(4)}, ${ci.hi95.toFixed(4)}] · p ${ci.pTwoTailed.toFixed(5)}`);
};

console.log(`กรอบ ${tf} · เพดานถือ ${maxHold} แท่ง\n`);

// 1. รู้อนาคตเต็มขั้น — ดูราคาปิดอีก maxHold แท่งข้างหน้าแล้วเลือกฝั่งที่ถูก
run('รู้อนาคต: close[t+maxHold] เทียบ close[t]', (bars, t) => {
  const j = Math.min(t + maxHold, bars.length - 1);
  return bars[j].close > bars[t].close ? 'long' : 'short';
});

// 2. รู้อนาคตครึ่งเดียว — ถูก 60% ของเวลา (สลับฝั่งแบบกำหนดตายตัวทุก ๆ 5 ไม้)
run('รู้อนาคตแบบมีสัญญาณรบกวน (ถูกราว 80%)', (bars, t) => {
  const j = Math.min(t + maxHold, bars.length - 1);
  const truth = bars[j].close > bars[t].close ? 'long' : 'short';
  if (t % 5 === 0) return truth === 'long' ? 'short' : 'long';
  return truth;
});

// 3. เหรียญที่ตัดสินจากตัวเลขคงที่ — ไม่มีขอบเลย ควรได้ประมาณ −ต้นทุน
run('เข้าไม้ทุกแท่ง สลับฝั่งตามดัชนีคู่/คี่ (ไม่มีขอบ)', (bars, t) => (t % 2 === 0 ? 'long' : 'short'));
