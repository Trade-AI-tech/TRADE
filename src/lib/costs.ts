import type { MarketType } from '@/types';

/**
 * ตารางต้นทุนและนโยบายระยะ SL — ต้นฉบับฝั่งแอป
 *
 * ตัวเลข bps ทั้งหมดคัดลอกจาก COST_BPS ใน scripts/research/lab.mjs
 * มี scripts/check-resolver-parity.mjs คอยตรวจว่าทุกสำเนายังตรงกัน
 * (สำเนามีสามที่: lab.mjs สำหรับงานวิจัย · resolve-signals.mjs สำหรับตัวเก็บผล · ไฟล์นี้สำหรับแอป)
 *
 * ⚠ ทุกตัวเป็น "การประมาณจากตารางค่าธรรมเนียมสาธารณะ" ไม่ใช่ใบเสร็จจริงของเจ้าของ
 *   lab.mjs เขียนเตือนตัวเองไว้ว่าอย่าใช้ตัวเลขเดานี้เป็นข้อสรุป — ต้องถูกแทนด้วยของจริง
 *   ทันทีที่มีใบยืนยันคำสั่ง
 */
export const COST_BPS = {
  byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 } as Record<string, number>,
  bySymbol: {
    XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10,
    EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15,
    EURTHB: 20, JPYTHB: 20, GBPTHB: 20, AUDTHB: 20,
  } as Record<string, number>,
};

export function costBpsFor(symbol: string, market: string): number {
  const bps = COST_BPS.bySymbol[symbol] ?? COST_BPS.byMarket[market];
  if (bps === undefined) throw new Error(`ไม่มีค่าประมาณต้นทุนสำหรับ ${market}/${symbol}`);
  return bps;
}

/**
 * ต้นทุนไป-กลับของไม้หนึ่ง คิดเป็นสัดส่วนของ "เงินที่เสี่ยง" (หน่วย R)
 *
 * cost_R = (bps/10000 × ราคาเข้า) ÷ ระยะ SL
 *
 * นี่คือกลไกเดียวที่อธิบายผลลบทั้งหมดที่งานวิจัยเจอ และเป็นเหตุผลที่ TF เล็กแพงกว่า TF ใหญ่
 * มาก ทั้งที่ค่าธรรมเนียมต่อครั้งเท่ากัน — เพราะตัวหารเล็กลง ไม่ใช่ตัวเศษใหญ่ขึ้น
 */
export function costRFor(entry: number, stop: number, symbol: string, market: string): number | null {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0) || !Number.isFinite(entry)) return null;
  return ((costBpsFor(symbol, market) / 10000) * Math.abs(entry)) / risk;
}

/**
 * เพดานต้นทุนต่อไม้ที่ยอมรับได้ — ใช้กำหนดว่า SL ต้องกว้างอย่างน้อยเท่าไร
 *
 * ── ที่มาของเลข 0.05 ──────────────────────────────────────────────────────────
 * วัดต้นทุนจริงของจักรวาล 13 ตัวเมื่อ 2026-08-24 จาก ATR สด:
 *     1D  0.021 R  ·  1H  0.149 R  ·  15m  0.306 R
 * และวัดขอบก่อนหักต้นทุนของจักรวาลเดียวกันได้ −0.0272 R/ไม้ (validation 4,052 ไม้)
 *
 * ไม่มีเพดานไหนที่ทำให้ระบบกำไร เพราะขอบติดลบตั้งแต่ก่อนจ่ายค่าธรรมเนียม
 * เพดานนี้มีไว้กันไม่ให้ **ต้นทุนกลายเป็นตัวใหญ่ที่สุดในสมการ** เท่านั้น
 * 0.05 อยู่ระหว่าง 1D กับ 1H และทำให้ 15m ถูกลงราว 6 เท่าจากค่าตามธรรมชาติของมัน
 *
 * ⚠ อย่าเข้าใจผิดว่าการขยาย SL ทำให้ระบบดีขึ้น — มันแค่เลิกจ่ายค่าธรรมเนียมเกินตัว
 *   ราคาที่จ่ายแทนคือไม้แต่ละไม้ใช้เวลานานขึ้นและเสี่ยงเป็นตัวเงินเท่าเดิมแต่กินระยะกว้างขึ้น
 */
export const MAX_COST_R = 0.05;

/** ระยะ SL ขั้นต่ำ (สัดส่วนของราคา) ที่ทำให้ต้นทุนไม่เกินเพดาน */
export function minStopPctFor(symbol: string, market: string, maxCostR = MAX_COST_R): number {
  return costBpsFor(symbol, market) / 10000 / maxCostR;
}

export interface StopFloorResult {
  stop_loss: number;
  take_profit: number;
  /** ขยายไปกี่เท่าของระยะเดิม — 1 = ไม่ได้ขยาย */
  widenedBy: number;
}

/**
 * ขยายระยะ SL ให้ถึงขั้นต่ำ แล้วขยับ TP ตามสัดส่วนเดิมเพื่อรักษา RR ไว้เท่าเดิม
 *
 * ทำไมต้องรักษา RR: ถ้าขยาย SL อย่างเดียวโดยไม่ขยับ TP ระบบจะกลายเป็น "เสี่ยงมากขึ้น
 * เพื่อกำไรเท่าเดิม" ซึ่งแย่กว่าเดิมทั้งสองทาง และจะไปโกงด่าน RR ของ SIGNAL_GATE ด้วย
 *
 * ⚠ ฟังก์ชันนี้ไม่แตะ src/lib/signal-engine.ts เลยโดยตั้งใจ — มันเป็นชั้นนโยบายที่ทำงาน
 *   หลังเครื่องยนต์ตัดสินใจแล้ว การแก้เครื่องยนต์จะทำให้ตัวตรวจ parity กับผลวิจัยทั้งชุด
 *   เทียบกันไม่ได้อีกต่อไป
 *
 * @returns null เมื่อข้อมูลไม่พอตัดสิน (ผู้เรียกควรปล่อยสัญญาณผ่านไปตามเดิม)
 */
export function applyStopFloor(
  entry: number,
  stopLoss: number,
  takeProfit: number,
  symbol: string,
  market: MarketType | string,
  maxCostR = MAX_COST_R
): StopFloorResult | null {
  if (![entry, stopLoss, takeProfit].every((v) => Number.isFinite(v)) || entry === 0) return null;

  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  if (!(risk > 0) || !(reward > 0)) return null;

  const minRisk = minStopPctFor(symbol, market, maxCostR) * Math.abs(entry);
  if (risk >= minRisk) return { stop_loss: stopLoss, take_profit: takeProfit, widenedBy: 1 };

  const factor = minRisk / risk;
  const isLong = stopLoss < entry;
  return {
    stop_loss: isLong ? entry - minRisk : entry + minRisk,
    take_profit: isLong ? entry + reward * factor : entry - reward * factor,
    widenedBy: factor,
  };
}
