import type { Signal } from '@/types';

/**
 * คณิตศาสตร์ของหน้า "ผลจริง" — แยกออกจาก component โดยตั้งใจ
 *
 * เหตุผลเดียว: ตัวเลขที่ออกจากไฟล์นี้คือตัวเลขที่เจ้าของจะใช้ตัดสินใจเรื่องเงินจริง
 * ถ้ามันฝังอยู่ใน JSX ก็ทดสอบไม่ได้ และจะไม่มีใครรู้เลยถ้ามันคำนวณผิด เพราะหน้าเว็บ
 * ที่แสดงเลขผิดกับหน้าเว็บที่แสดงเลขถูก หน้าตาเหมือนกันทุกประการ
 *
 * ทดสอบด้วย: node scripts/test-scorecard-stats.mjs
 */

/** ไม้ที่ปิดบัญชีแล้วและมีตัวเลขให้ใช้ — 'unresolvable' ไม่นับ เพราะไม่ใช่ผลการเทรด */
export type ResolvedSignal = Signal & {
  realized_r: number;
  outcome: 'tp' | 'sl' | 'timeout';
};

export function isResolved(s: Signal): s is ResolvedSignal {
  return (
    (s.outcome === 'tp' || s.outcome === 'sl' || s.outcome === 'timeout') &&
    typeof s.realized_r === 'number' &&
    Number.isFinite(s.realized_r)
  );
}

export function mean(a: readonly number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
}

/**
 * ช่วงความเชื่อมั่น 95% แบบ bootstrap สุ่มคืนที่ระดับ **สัญลักษณ์** ไม่ใช่ระดับไม้
 *
 * ทำไมต้องเป็นระดับสัญลักษณ์: ไม้ของสัญลักษณ์เดียวกันไม่เป็นอิสระต่อกัน ราคามันเดินด้วยกัน
 * การสุ่มรายไม้จะให้ช่วงที่ **แคบกว่าความจริง** ซึ่งเป็นทิศที่ทำให้ดูมั่นใจเกินตัวเสมอ
 * (งานวิจัยในรีโปนี้ก็ยึดกติกาเดียวกัน — ดู ciCluster ใน lab.mjs)
 *
 * seed คงที่เพื่อให้เปิดหน้าเดิมกี่ครั้งก็ได้เลขเดิม ไม่ใช่เลขกระพริบไปมา
 * คืน null เมื่อมีสัญลักษณ์เดียว เพราะ bootstrap ที่สุ่มจากกองเดียวไม่ได้วัดอะไรเลย
 */
export function bootstrapBySymbol(
  rows: readonly ResolvedSignal[],
  B = 2000
): { lo: number; hi: number } | null {
  const pools = new Map<string, number[]>();
  for (const r of rows) {
    if (!pools.has(r.symbol)) pools.set(r.symbol, []);
    pools.get(r.symbol)!.push(r.realized_r);
  }
  const keys = [...pools.keys()];
  if (keys.length < 2) return null;

  let seed = 20260819;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const out: number[] = [];
  for (let b = 0; b < B; b++) {
    const acc: number[] = [];
    for (let i = 0; i < keys.length; i++) acc.push(...pools.get(keys[Math.floor(rnd() * keys.length)])!);
    out.push(mean(acc));
  }
  out.sort((a, b) => a - b);
  return { lo: out[Math.floor(B * 0.025)], hi: out[Math.floor(B * 0.975)] };
}

export interface ScorecardGroup {
  key: string;
  n: number;
  wins: number;
  avgR: number;
}

export interface ScorecardSummary {
  /** ไม้ที่ปิดบัญชีแล้ว */
  n: number;
  /** ไม้ที่ยังเดินอยู่ */
  open: number;
  /** ไม้ที่ตัดสินผลไม่ได้ — ไม่ถูกนับในตัวเลขอื่นเลย */
  unresolvable: number;
  wins: number;
  winRate: number;
  avgR: number;
  ci: { lo: number; hi: number } | null;
  byOutcome: { tp: number; sl: number; timeout: number };
  groups: ScorecardGroup[];
}

/**
 * สรุปผลทั้งหมดจากรายการสัญญาณดิบ
 * ตัวเลขทุกตัวมาจากคอลัมน์ realized_r ที่ scripts/resolve-signals.mjs เขียนไว้
 * ไม่มีการคำนวณกำไรใหม่ที่นี่ เพื่อให้เลขบนจอกับเลขในฐานข้อมูลเป็นตัวเดียวกันเสมอ
 */
export function summarize(signals: readonly Signal[], B = 2000): ScorecardSummary {
  const resolved = signals.filter(isResolved);
  const open = signals.filter((s) => s.outcome == null || s.outcome === 'open').length;
  const unresolvable = signals.filter((s) => s.outcome === 'unresolvable').length;

  const rs = resolved.map((r) => r.realized_r);
  const wins = resolved.filter((r) => r.realized_r > 0).length;

  const byOutcome = { tp: 0, sl: 0, timeout: 0 };
  for (const r of resolved) byOutcome[r.outcome]++;

  const buckets = new Map<string, ResolvedSignal[]>();
  for (const r of resolved) {
    const k = `${r.market} · ${r.timeframe}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }

  return {
    n: resolved.length,
    open,
    unresolvable,
    wins,
    winRate: resolved.length ? wins / resolved.length : NaN,
    avgR: mean(rs),
    ci: bootstrapBySymbol(resolved, B),
    byOutcome,
    groups: [...buckets.entries()]
      .map(([key, rows]) => ({
        key,
        n: rows.length,
        wins: rows.filter((r) => r.realized_r > 0).length,
        avgR: mean(rows.map((r) => r.realized_r)),
      }))
      .sort((a, b) => b.n - a.n),
  };
}
