#!/usr/bin/env node
/**
 * veto-audit-dump-trades.mjs — สร้างกองไม้ฐานซ้ำแล้วดัมป์ลงไฟล์ เพื่อให้การตรวจ
 * robustness ทุกข้อ (leave-one-out · ครึ่งเวลา · overlap · MDE) ทำได้เร็วโดยไม่ต้อง
 * เดินเครื่องยนต์ใหม่ทุกครั้ง
 *
 * ทำไมต้องดัมป์เอง: veto-lab.json เก็บแต่ตัวเลขสรุปต่อชุด ไม่มี R รายไม้เลย
 * ทุกคำถามเรื่องความมั่นคงของผลต้องการ R รายไม้ + symbol + เวลา + vetoMask
 * (ตัว holm-report ก็ยอมรับข้อนี้เอง: "veto-lab.json ไม่ได้เก็บ R รายไม้ไว้"
 *  แล้วเลือกกู้ σ จาก nullSd แทน — เราจะเอาของจริงมาเทียบว่ากู้ถูกไหม)
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadVetoProbe } from './veto-audit-probe.mjs';

const OUT = process.argv[2] ?? path.join(process.cwd(), 'veto-audit-trades.json');
const TFS = (process.env.TFS ?? '1D,1H').split(',');

const { mod, deps } = await loadVetoProbe();
const bounds = deps.L.loadSplitBoundaries(TFS);
const cache = new Map();
const out = { generatedAt: new Date().toISOString(), timeframes: {} };

for (const tf of TFS) {
  const t0 = Date.now();
  const base = mod.buildBaseTrades(tf, deps, { bounds, cache });
  const trades = base.trades.map((t) => ({
    sym: t.symbol, mkt: t.market, side: t.side, mask: t.vetoMask,
    rNet: t.rNet, rawR: t.rawR, costR: t.costR,
    sIdx: t.signalIdx, eIdx: t.entryIdx, xIdx: t.exitIdx,
    sT: t.signalTime, eT: t.entryTime, xT: t.exitTime,
    held: t.barsHeld, exit: t.exitReason,
  }));
  out.timeframes[tf] = {
    timeframe: tf,
    measuredBefore: base.measuredBefore,
    spanFirst: base.spanFirst, spanLast: base.spanLast, spanDays: base.spanDays,
    counts: base.counts,
    vetoHits: Object.fromEntries(deps.vetoes.map((v, i) => [v.short, base.vetoHits[i]])),
    vetoOrder: deps.vetoes.map((v) => v.short),
    trades,
  };
  console.error(`${tf}: ${trades.length} ไม้ · ${((Date.now() - t0) / 1000).toFixed(0)}s · vetoHits ${JSON.stringify(out.timeframes[tf].vetoHits)}`);
}

fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
console.error(`เขียน ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
