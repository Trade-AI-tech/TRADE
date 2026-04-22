import type { CandleData } from '@/types';

/**
 * Technical indicators — pure functions, no dependencies
 * คำนวณ RSI, MACD, MA, Bollinger Bands, Support/Resistance
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

export function EMA(values: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 0; i < values.length; i++) {
    if (i === 0) { result.push(ema); continue; }
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function RSI(values: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [0];
  const losses: number[] = [0];

  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  for (let i = 0; i < values.length; i++) {
    if (i < period) { result.push(NaN); continue; }
    let avgGain = 0, avgLoss = 0;
    for (let j = i - period + 1; j <= i; j++) {
      avgGain += gains[j];
      avgLoss += losses[j];
    }
    avgGain /= period;
    avgLoss /= period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

export function MACD(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = EMA(values, fast);
  const emaSlow = EMA(values, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = EMA(macdLine, signal);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
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
  const [prev2, prev1, curr] = candles.slice(-3);

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
 * Determine trend from MA alignment
 */
export function determineTrend(close: number, ma20: number, ma50: number, ma200: number): 'uptrend' | 'downtrend' | 'sideways' {
  if (isNaN(ma20) || isNaN(ma50) || isNaN(ma200)) return 'sideways';
  if (close > ma20 && ma20 > ma50 && ma50 > ma200) return 'uptrend';
  if (close < ma20 && ma20 < ma50 && ma50 < ma200) return 'downtrend';
  return 'sideways';
}
