import type { CandleData } from '@/types';

/**
 * Technical indicators — pure functions, no dependencies
 * คำนวณ RSI, MACD, MA, Bollinger Bands, Support/Resistance
 *
 * กติกา: ช่วงที่ยังมีข้อมูลไม่พอจะคืน NaN เสมอ (ไม่เดาค่า)
 * ผู้เรียกต้องเช็ค Number.isFinite ก่อนใช้
 */

export function SMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j];
    result.push(sum / period);
  }
  return result;
}

/**
 * EMA มาตรฐาน — seed ด้วย SMA ของ period แรก และคืน NaN ก่อนหน้านั้น
 * รองรับ input ที่มี NaN นำหน้า (เช่น MACD line) โดยข้ามไปเริ่มที่ค่าจริงตัวแรก
 */
export function EMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  const start = values.findIndex((v) => Number.isFinite(v));
  if (start === -1 || values.length - start < period) return result;

  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = start; i < start + period; i++) sum += values[i];
  let ema = sum / period;
  result[start + period - 1] = ema;

  for (let i = start + period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

/**
 * RSI แบบ Wilder smoothing (ตรงกับที่ TradingView / MT4 ใช้)
 */
export function RSI(values: number[], period: number = 14): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function MACD(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = EMA(values, fast);
  const emaSlow = EMA(values, slow);
  const macdLine = emaFast.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(emaSlow[i]) ? v - emaSlow[i] : NaN
  );
  const signalLine = EMA(macdLine, signal);
  const histogram = macdLine.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(signalLine[i]) ? v - signalLine[i] : NaN
  );
  return { macdLine, signalLine, histogram };
}

export function BollingerBands(values: number[], period = 20, stdDev = 2) {
  const ma = SMA(values, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { upper.push(NaN); lower.push(NaN); continue; }
    let sumSq = 0;
    for (let j = 0; j < period; j++) {
      const diff = values[i - j] - ma[i];
      sumSq += diff * diff;
    }
    const sd = Math.sqrt(sumSq / period);
    upper.push(ma[i] + stdDev * sd);
    lower.push(ma[i] - stdDev * sd);
  }
  return { upper, middle: ma, lower };
}

/**
 * Support & Resistance — find swing highs/lows
 */
export function findSupportResistance(candles: CandleData[], lookback = 5) {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const supports: number[] = [];
  const resistances: number[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingHigh = true, isSwingLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isSwingHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isSwingLow = false;
    }
    if (isSwingHigh) resistances.push(highs[i]);
    if (isSwingLow) supports.push(lows[i]);
  }

  // Get most recent 3 unique levels, sorted
  const uniq = (arr: number[]) => [...new Set(arr.map(v => Number(v.toFixed(4))))];
  return {
    supports: uniq(supports).slice(-3).sort((a, b) => b - a),
    resistances: uniq(resistances).slice(-3).sort((a, b) => a - b),
  };
}

/**
 * Candlestick patterns detection
 */
export function detectPatterns(candles: CandleData[]): string[] {
  if (candles.length < 3) return [];
  const patterns: string[] = [];
  const [, prev1, curr] = candles.slice(-3);

  const body = (c: CandleData) => Math.abs(c.close - c.open);
  const range = (c: CandleData) => c.high - c.low;
  const isBullish = (c: CandleData) => c.close > c.open;
  const isBearish = (c: CandleData) => c.close < c.open;

  // Bullish Engulfing
  if (isBearish(prev1) && isBullish(curr) &&
      curr.open < prev1.close && curr.close > prev1.open) {
    patterns.push('Bullish Engulfing');
  }

  // Bearish Engulfing
  if (isBullish(prev1) && isBearish(curr) &&
      curr.open > prev1.close && curr.close < prev1.open) {
    patterns.push('Bearish Engulfing');
  }

  // Hammer (long lower shadow, small body, little upper shadow)
  const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
  const upperShadow = curr.high - Math.max(curr.open, curr.close);
  if (lowerShadow > body(curr) * 2 && upperShadow < body(curr) * 0.5) {
    patterns.push('Hammer');
  }

  // Shooting Star
  if (upperShadow > body(curr) * 2 && lowerShadow < body(curr) * 0.5) {
    patterns.push('Shooting Star');
  }

  // Doji (open ≈ close)
  if (body(curr) < range(curr) * 0.1 && range(curr) > 0) {
    patterns.push('Doji');
  }

  return patterns;
}

/**
 * Average True Range — ใช้กำหนดระยะ SL/TP ตามความผันผวนจริง
 */
export function ATR(candles: CandleData[], period = 14): number {
  if (candles.length < 2) return NaN;
  const slice = candles.slice(-(period + 1));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i];
    const prevClose = slice[i - 1].close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    sum += tr;
    n++;
  }
  return n ? sum / n : NaN;
}

/**
 * Determine trend from MA alignment
 * ถ้าไม่มีข้อมูลยาวพอสำหรับ MA200 จะตัดสินจาก MA20/MA50 แทน
 */
export function determineTrend(
  close: number,
  ma20: number,
  ma50: number,
  ma200: number
): 'uptrend' | 'downtrend' | 'sideways' {
  if (!Number.isFinite(ma20) || !Number.isFinite(ma50)) return 'sideways';

  if (Number.isFinite(ma200)) {
    if (close > ma20 && ma20 > ma50 && ma50 > ma200) return 'uptrend';
    if (close < ma20 && ma20 < ma50 && ma50 < ma200) return 'downtrend';
    return 'sideways';
  }

  if (close > ma20 && ma20 > ma50) return 'uptrend';
  if (close < ma20 && ma20 < ma50) return 'downtrend';
  return 'sideways';
}

/**
 * Stochastic Oscillator — ราคาปิดอยู่ตรงไหนของช่วง high/low ที่ผ่านมา
 *
 * %K = (close − lowestLow) / (highestHigh − lowestLow) × 100
 * %D = ค่าเฉลี่ยเคลื่อนที่ของ %K (สัญญาณ)
 *
 * ต่างจาก RSI ตรงที่ RSI วัด "แรงของการเปลี่ยนแปลง" ส่วนตัวนี้วัด "ตำแหน่งในกรอบ"
 * ช่วงที่ราคาออกข้าง ตัวนี้จึงแกว่งเต็มสเกลขณะที่ RSI ยังนิ่งอยู่กลาง ๆ
 *
 * ⚠ ช่วงที่ high = low ทั้งกรอบ (ตลาดปิด/แท่งแบน) ตัวหารเป็นศูนย์ → คืน NaN
 *   ไม่ใช่ 50 หรือ 0 เพราะสองค่านั้นเป็นตัวเลขที่ "ดูใช้ได้" แล้วไหลไปเป็นสัญญาณจริงได้
 */
export function Stochastic(candles: CandleData[], kPeriod = 14, dPeriod = 3) {
  const k: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { k.push(NaN); continue; }
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      const c = candles[i - j];
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
    }
    const range = hi - lo;
    k.push(range > 0 ? ((candles[i].close - lo) / range) * 100 : NaN);
  }
  return { k, d: SMA(k, dPeriod) };
}

/**
 * ADX — ความ "แรงของเทรนด์" โดยไม่สนทิศทาง (Wilder)
 *
 * ค่าสูง = ราคาเดินไปทางเดียวอย่างมีระเบียบ · ค่าต่ำ = ออกข้าง
 * ใช้เป็นตัวกรองมากกว่าตัวให้ทิศ: เทรนด์อ่อนคือช่วงที่กฎตามเทรนด์ทำงานแย่ที่สุด
 *
 * คืน { adx, plusDI, minusDI } เป็นค่าล่าสุดค่าเดียว (เหมือน ATR) เพราะผู้เรียกทุกที่
 * ต้องการแค่ค่าปัจจุบัน การคืนทั้งอาร์เรย์เปลืองหน่วยความจำโดยไม่มีใครใช้
 */
export function ADX(candles: CandleData[], period = 14) {
  const n = candles.length;
  const adx: number[] = new Array(n).fill(NaN);
  const plusDI: number[] = new Array(n).fill(NaN);
  const minusDI: number[] = new Array(n).fill(NaN);
  if (n < period * 2 + 1) return { adx, plusDI, minusDI };

  // ดัชนี i ของ tr/plusDM/minusDM ตรงกับแท่งที่ i+1 (คำนวณจากคู่แท่ง i กับ i+1)
  const tr: number[] = [];
  const pDM: number[] = [];
  const mDM: number[] = [];
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    const up = c.high - p.high;
    const down = p.low - c.low;
    pDM.push(up > down && up > 0 ? up : 0);
    mDM.push(down > up && down > 0 ? down : 0);
  }

  /** ผลรวมแบบ Wilder — รอบแรกเป็นผลรวมตรง ๆ จากนั้นค่อยทบ (causal: ค่าที่ i ใช้แค่ 0..i) */
  const wilder = (a: number[]): number[] => {
    const out: number[] = new Array(a.length).fill(NaN);
    let acc = 0;
    for (let i = 0; i < a.length; i++) {
      if (i < period - 1) { acc += a[i]; continue; }
      if (i === period - 1) { acc += a[i]; out[i] = acc; continue; }
      acc = acc - acc / period + a[i];
      out[i] = acc;
    }
    return out;
  };

  const trS = wilder(tr);
  const pS = wilder(pDM);
  const mS = wilder(mDM);

  const dx: number[] = new Array(tr.length).fill(NaN);
  for (let i = 0; i < trS.length; i++) {
    if (!Number.isFinite(trS[i]) || trS[i] === 0) continue;
    const pdi = (pS[i] / trS[i]) * 100;
    const mdi = (mS[i] / trS[i]) * 100;
    plusDI[i + 1] = pdi;
    minusDI[i + 1] = mdi;
    const sum = pdi + mdi;
    if (sum > 0) dx[i] = (Math.abs(pdi - mdi) / sum) * 100;
  }

  // ADX = ค่าเฉลี่ยแบบ Wilder ของ DX โดยเริ่มนับจาก DX ตัวแรกที่ใช้ได้
  const first = dx.findIndex(Number.isFinite);
  if (first < 0 || first + period > dx.length) return { adx, plusDI, minusDI };
  let acc = 0;
  for (let i = first; i < first + period; i++) acc += dx[i];
  let cur = acc / period;
  adx[first + period] = cur;
  for (let i = first + period; i < dx.length; i++) {
    if (!Number.isFinite(dx[i])) continue;
    cur = (cur * (period - 1) + dx[i]) / period;
    adx[i + 1] = cur;
  }
  return { adx, plusDI, minusDI };
}

/**
 * วอลุ่มแท่งล่าสุดเทียบค่าเฉลี่ยของ period แท่งก่อนหน้า
 *
 * 1.0 = ปกติ · 2.0 = มากกว่าปกติเท่าตัว
 * ใช้ตอบคำถามว่า "การเคลื่อนไหวนี้มีคนร่วมด้วยจริงไหม" ซึ่งราคาอย่างเดียวไม่บอก
 *
 * ⚠ ค่าเฉลี่ย **ไม่รวมแท่งล่าสุด** โดยตั้งใจ ไม่งั้นแท่งที่วอลุ่มพุ่งจะดันค่าเฉลี่ยของ
 *   ตัวเองขึ้นไปด้วย แล้วอัตราส่วนจะต่ำกว่าความจริงเสมอ
 * ⚠ ค่าเงินสปอตบน Yahoo ส่งวอลุ่มเป็น 0 มาทั้งชุด — ผู้เรียกต้องเช็ค NaN ไม่ใช่สมมติว่ามีค่า
 */
export function volumeRatio(candles: CandleData[], period = 20): number {
  if (candles.length < period + 1) return NaN;
  const prev = candles.slice(-(period + 1), -1);
  let sum = 0;
  for (const c of prev) {
    if (!Number.isFinite(c.volume)) return NaN;
    sum += c.volume;
  }
  const avg = sum / prev.length;
  const last = candles[candles.length - 1].volume;
  if (!(avg > 0) || !Number.isFinite(last)) return NaN;
  return last / avg;
}
