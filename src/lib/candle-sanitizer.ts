import type { CandleData } from '@/types';

/**
 * ด่านตรวจแท่งราคา — ที่เดียวที่ตัดสินว่าแท่ง OHLC จาก Yahoo "ใช้ได้" ก่อนไหลเข้าอินดิเคเตอร์
 *
 * ทำไมต้องมี: วัดจากแคชวิจัย (.research-cache/candles) เมื่อ 2026-08-28 พบแท่งที่เป็นไปไม่ได้
 * (open/close หลุดนอกกรอบ high-low) 3.29% ของทั้งแคช และ 3.49% ในหน้าต่าง 1 ปีที่ตัวสแกน
 * ใช้จริง (XAUUSD หนักสุด 7.11%) — เส้นทางสแกนโปรดักชันไม่เคยมีด่านตรวจเลย แท่งเสียจึงไหลเข้า
 * ATR/RSI/แนวรับแนวต้าน แล้วกลายเป็น SL/TP ของสัญญาณจริงโดยไม่มี error ให้ใครเห็น
 *
 * กติกา (เรียงตามลำดับที่ทำจริงใน sanitizeCandles):
 *   1. ทิ้งแท่งที่ open/high/low/close ไม่ใช่ตัวเลขบวก finite — แท่งแบบนั้นซ่อมไม่ได้
 *      (volume ไม่อยู่ในเกณฑ์ เพราะ forex ส่ง volume 0 มาเป็นเรื่องปกติ)
 *   2. ซ่อมกรอบเสมอ: high = max(o,h,c) · low = min(o,l,c) — "ซ่อม" ไม่ใช่ "ทิ้ง" เพราะการทิ้ง
 *      ทำให้หน้าต่างอินดิเคเตอร์เลื่อน แล้วสองเครื่องที่ดึงข้อมูลห่างกันไม่กี่นาทีได้สัญญาณไม่ตรงกัน
 *   3. ทิ้งแท่ง "ระดับผิดทั้งแท่ง" (interior spike): ทั้งกรอบ [low,high] วาร์ปหนีจาก close ของ
 *      แท่งที่รอดล่าสุดเกิน SPIKE_PCT ของตลาดนั้น แล้วแท่งถัดไปถอยกลับเกินครึ่งของระยะกระโดด
 *      ตัวอย่างจริง: EURUSD 2008-02-08 ทั้งแท่งอยู่ ~1.557 ขณะเพื่อนบ้านสองข้างอยู่ ~1.45
 *      (กระโดด +7.5% แล้วแท่งถัดไปถอยกลับ 98%) — กรอบภายในแท่งถูก แต่ระดับผิดทั้งแท่ง
 *      ตาข่ายที่กันการวิ่งจริงคือเงื่อนไข "แท่งถัดไปไม่ถอยกลับ" ไม่ใช่การเกยกรอบ — วัดจากแคช
 *      แล้ว แท่ง Brexit 2016 ของ GBPUSD ทั้งกรอบก็หลุดเกณฑ์เหมือนกัน (prevClose 1.4558 แต่
 *      high แค่ 1.3476) มันรอดเพราะแท่งถัดไปยืนระดับใหม่ (close 1.3235 ไม่ถอยกลับถึงครึ่ง
 *      ของระยะกระโดด) — การวิ่งจริงยืนระดับใหม่ ส่วนข้อมูลเสียถอยกลับแทบทั้งระยะ
 *      ข้อจำกัดที่รู้และยอมรับ: แท่งระดับผิด "ติดกันสองแท่งขึ้นไป" จะรอดด่านนี้ เพราะแท่งถัดไป
 *      ไม่ถอยกลับ — แลกกับการไม่ทิ้งการวิ่งจริงที่ยืนระดับใหม่ได้
 *   4. แท่งสุดท้ายไม่มีเพื่อนบ้านขวา จึงแยก "พุ่งจริงตอนข่าวออก" กับ "ข้อมูลเสีย" ไม่ได้ —
 *      ห้ามทิ้ง ซ่อมกรอบอย่างเดียว (สัญญาณจากการวิ่งจริงต้องไม่โดนด่านนี้เงียบ)
 *
 * ห้าม import อะไรนอกจาก type — ไฟล์นี้ถูกลอกทั้งก้อนไว้ใน Edge Function
 * (supabase/functions/scan-signals/index.ts ระหว่าง marker COPY) และ check:parity:scan
 * เทียบตัวอักษรต่อตัวอักษร · สำเนาแบบ JS ของกติกาเดียวกันอยู่ใน scripts/resolve-signals.mjs
 * (sanitizeBars) มี check:parity:resolver ป้อนเคสเดียวกันให้สองฝั่งแล้วเทียบผลทุกแท่ง
 */

/**
 * เพดานกระโดดต่อแท่ง (สัดส่วนของ close แท่งก่อนหน้า) — เลือกจากข้อมูลจริง ไม่ใช่เดา
 *
 * วัดเมื่อ 2026-08-28 จากแคชวิจัยทั้งชุด: |การเปลี่ยนแปลง close ต่อ close| percentile 99.9
 * ของแท่ง 1D หลังตัดแท่งกรอบพังออกก่อน (1D คือ timeframe ที่แกว่งแรงสุด จึงเป็นเพดานของทุก TF)
 *   GOLD 14.7% · FOREX 5.2% · TH_STOCK 19.1% · US_STOCK 14.2% · CRYPTO 43.0%
 * แล้วตั้งเผื่อเหนือค่าที่วัดได้ราว 1.25 เท่า เพื่อไม่กินการเคลื่อนไหวจริง
 * TH_STOCK ตั้ง 35% จากกติกาตลาดแทนสถิติ: SET มี ceiling/floor ±30% ต่อวัน แท่งที่ทั้งกรอบ
 * หนีเกิน 35% ในแท่งเดียวจึงเป็นไปไม่ได้เชิงกติกา ไม่ใช่แค่ผิดสถิติ
 *
 * จำลองเกณฑ์ชุดนี้กับแคชทั้งชุด (ทุกตลาด ทุก TF): ทิ้งจริง 7 แท่ง เกือบทั้งหมดเป็นข้อมูลเสียชัดเจน
 * เช่น 2008-10-07 / 2008-12-08 ที่ระดับเพี้ยนพร้อมกันทั้ง EURUSD และ USDJPY (+8.5% ถึง +17.7%
 * แล้วถอยกลับ 77–99%) = ต้นทางข้อมูลเสียทั้งวัน ไม่ใช่ตลาดจริงสองคู่บังเอิญวาร์ปพร้อมกัน
 * ข้อยกเว้นหนึ่งเคส: USDZAR 2025-01-16 (ไม่เคยอยู่ในจักรวาลที่สแกนจริงเลย) แท่งที่ถูกทิ้งคือ
 * แท่งระดับถูก เพราะเพื่อนบ้านสองข้าง close เพี้ยนจนกลายเป็นเสียงข้างมากรอบตัวมัน —
 * ข้อจำกัดตระกูลเดียวกับ "แท่งเสียติดกันหลายแท่ง" ข้างบน ด่านที่ตัดสินทีละแท่งแก้ให้ไม่ได้
 */
export const SPIKE_PCT: Record<string, number> = {
  GOLD: 0.18,
  FOREX: 0.065,
  TH_STOCK: 0.35,
  US_STOCK: 0.18,
  CRYPTO: 0.5,
};

/** ตลาดที่ไม่รู้จักใช้เพดานกว้างสุด — ยอมปล่อยผ่านมากกว่าทิ้งการวิ่งจริงของตลาดที่เราไม่มีสถิติ */
export const SPIKE_PCT_DEFAULT = 0.5;

export interface SanitizeResult {
  candles: CandleData[];
  /** จำนวนแท่งที่ถูกทิ้ง (ค่าไม่ใช่ตัวเลขบวก finite หรือระดับผิดทั้งแท่ง) */
  dropped: number;
  /** จำนวนแท่งที่ถูกซ่อมกรอบ (ขยาย high/low ให้ครอบ open/close) */
  repaired: number;
}

const finitePositive = (v: number): boolean => Number.isFinite(v) && v > 0;

/**
 * ซ่อมกรอบเมื่อจำเป็นเท่านั้น — แท่งที่ดีอยู่แล้วคืน reference เดิม เพื่อให้ชุดข้อมูลสะอาด
 * ผ่านด่านออกไปโดยไม่ถูกแตะเลย (ผลลัพธ์ต้อง byte-identical กับอินพุต — มีเทสต์คุมไว้)
 */
function repairFrame(c: CandleData): { candle: CandleData; repaired: boolean } {
  const high = Math.max(c.open, c.high, c.close);
  const low = Math.min(c.open, c.low, c.close);
  if (high === c.high && low === c.low) return { candle: c, repaired: false };
  return { candle: { ...c, high, low }, repaired: true };
}

/**
 * ด่านตรวจแท่งทั้งชุด — ไม่แก้อาร์เรย์อินพุตเด็ดขาด (ผู้เรียกบางตัวเทียบอินพุตก่อน/หลังเรียก)
 * ผู้เรียกควรเอา dropped/repaired ไปรายงานใน log เสมอ — ข้อมูลเสียที่ถูกซ่อมเงียบ ๆ
 * คือข้อมูลเสียที่ไม่มีใครตามไปแก้ที่ต้นทาง
 */
export function sanitizeCandles(input: CandleData[], market: string): SanitizeResult {
  const spikePct = SPIKE_PCT[market] ?? SPIKE_PCT_DEFAULT;

  // ขั้นที่ 1+2: ทิ้งแท่งที่ไม่ใช่ตัวเลขก่อน แล้วซ่อมกรอบที่เหลือ — ต้องแยกรอบกับขั้นที่ 3
  // เพราะการตรวจ spike ต้องเดินบนลำดับแท่งที่ "ตัวเลขเชื่อได้แล้ว" เท่านั้น
  const framed: CandleData[] = [];
  let dropped = 0;
  let repaired = 0;
  for (const c of input) {
    if (!finitePositive(c.open) || !finitePositive(c.high) || !finitePositive(c.low) || !finitePositive(c.close)) {
      dropped++;
      continue;
    }
    const r = repairFrame(c);
    if (r.repaired) repaired++;
    framed.push(r.candle);
  }

  // ขั้นที่ 3+4: interior spike — เทียบกับ close ของแท่งที่ "รอด" ล่าสุด ไม่ใช่แท่งก่อนหน้าดิบ
  // เพราะถ้าแท่งก่อนหน้าเพิ่งโดนทิ้ง การเทียบกับมันคือการเทียบกับข้อมูลเสียเสียเอง
  const out: CandleData[] = [];
  for (let i = 0; i < framed.length; i++) {
    const c = framed[i];
    const isLast = i === framed.length - 1;
    const prevClose = out.length > 0 ? out[out.length - 1].close : NaN;
    if (!isLast && Number.isFinite(prevClose)) {
      const jumpedUp = c.low > prevClose * (1 + spikePct);
      const jumpedDown = c.high < prevClose * (1 - spikePct);
      if (jumpedUp || jumpedDown) {
        // แท่งถัดไปกลับมาใกล้ระดับเดิมเกินครึ่งของระยะกระโดด = ระดับของแท่งนี้ผิด
        // ไม่ใช่ตลาดวิ่งจริง (การวิ่งจริงยืนระดับใหม่ หรืออย่างน้อยไม่ถอยเกินครึ่งทันที)
        const next = framed[i + 1];
        const jump = Math.abs(c.close - prevClose);
        if (Math.abs(next.close - prevClose) < jump * 0.5) {
          dropped++;
          continue;
        }
      }
    }
    out.push(c);
  }

  return { candles: out, dropped, repaired };
}
