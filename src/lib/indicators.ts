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
