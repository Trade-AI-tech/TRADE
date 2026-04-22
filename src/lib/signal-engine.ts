import type { CandleData, Signal, SignalAction, SignalStrength, SignalReason } from '@/types';
import { RSI, MACD, EMA, SMA, BollingerBands, findSupportResistance, detectPatterns, determineTrend } from './indicators';

interface SignalInput {
  symbol: string;
  name: string;
  market: Signal['market'];
  candles: CandleData[];
  timeframe?: string;
  newsSentiment?: number;
}

/**
 * Core signal generator
 * รวม technical analysis → คำนวณสัญญาณเข้า/ออก พร้อม SL/TP และเหตุผล
 */
export function generateSignal(input: SignalInput): Signal | null {
  const { symbol, name, market, candles, timeframe = '1D', newsSentiment } = input;

  if (candles.length < 50) return null;

  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];

  const rsi = RSI(closes, 14);
  const macd = MACD(closes);
  const ema20 = EMA(closes, 20);
  const ma50 = SMA(closes, 50);
  const ma200 = SMA(closes, Math.min(200, closes.length - 1));
  const bb = BollingerBands(closes, 20, 2);

  const last = closes.length - 1;
  const rsiNow = rsi[last];
  const macdNow = macd.macdLine[last];
  const macdSignal = macd.signalLine[last];
  const macdHist = macd.histogram[last];
  const ma20Now = ema20[last];
  const ma50Now = ma50[last];
  const ma200Now = ma200[last];

  const sr = findSupportResistance(candles);
  const patterns = detectPatterns(candles);
  const trend = determineTrend(currentPrice, ma20Now, ma50Now, ma200Now);

  // Scoring system
  let bullScore = 0;
  let bearScore = 0;
  const reasons: SignalReason[] = [];

  // RSI
  if (rsiNow < 30) {
    bullScore += 2;
    reasons.push({ type: 'technical', label: 'RSI Oversold', detail: `RSI(14) = ${rsiNow.toFixed(1)} อยู่ในโซน oversold`, weight: 0.2 });
  } else if (rsiNow > 70) {
    bearScore += 2;
    reasons.push({ type: 'technical', label: 'RSI Overbought', detail: `RSI(14) = ${rsiNow.toFixed(1)} อยู่ในโซน overbought`, weight: 0.2 });
  } else if (rsiNow > 50 && rsi[last - 1] < 50) {
    bullScore += 1;
    reasons.push({ type: 'technical', label: 'RSI Cross 50', detail: `RSI ตัดขึ้นผ่าน 50`, weight: 0.15 });
  } else if (rsiNow < 50 && rsi[last - 1] > 50) {
    bearScore += 1;
    reasons.push({ type: 'technical', label: 'RSI Cross 50', detail: `RSI ตัดลงต่ำกว่า 50`, weight: 0.15 });
  }

  // MACD
  if (macdNow > macdSignal && macd.macdLine[last - 1] <= macd.signalLine[last - 1]) {
    bullScore += 2;
    reasons.push({ type: 'technical', label: 'MACD Bullish Cross', detail: 'MACD ตัดขึ้น Signal Line', weight: 0.2 });
  } else if (macdNow < macdSignal && macd.macdLine[last - 1] >= macd.signalLine[last - 1]) {
    bearScore += 2;
    reasons.push({ type: 'technical', label: 'MACD Bearish Cross', detail: 'MACD ตัดลง Signal Line', weight: 0.2 });
  }

  if (macdHist > 0 && macd.histogram[last - 1] < macdHist) {
    bullScore += 1;
  } else if (macdHist < 0 && macd.histogram[last - 1] > macdHist) {
    bearScore += 1;
  }

  // Trend
  if (trend === 'uptrend') {
    bullScore += 2;
    reasons.push({ type: 'technical', label: 'Uptrend', detail: 'MA20 > MA50 > MA200 ยืนยัน uptrend', weight: 0.2 });
  } else if (trend === 'downtrend') {
    bearScore += 2;
    reasons.push({ type: 'technical', label: 'Downtrend', detail: 'MA20 < MA50 < MA200 ยืนยัน downtrend', weight: 0.2 });
  }

  // Bollinger Bands
  if (currentPrice < bb.lower[last]) {
    bullScore += 1;
    reasons.push({ type: 'technical', label: 'BB Lower Touch', detail: 'ราคาต่ำกว่า Bollinger Lower Band', weight: 0.15 });
  } else if (currentPrice > bb.upper[last]) {
    bearScore += 1;
    reasons.push({ type: 'technical', label: 'BB Upper Touch', detail: 'ราคาสูงกว่า Bollinger Upper Band', weight: 0.15 });
  }

  // Patterns
  for (const p of patterns) {
    if (p === 'Bullish Engulfing' || p === 'Hammer') {
      bullScore += 2;
      reasons.push({ type: 'pattern', label: p, detail: `รูปแบบ ${p} ปรากฏในแท่งล่าสุด`, weight: 0.2 });
    } else if (p === 'Bearish Engulfing' || p === 'Shooting Star') {
      bearScore += 2;
      reasons.push({ type: 'pattern', label: p, detail: `รูปแบบ ${p} ปรากฏในแท่งล่าสุด`, weight: 0.2 });
    }
  }

  // Support/Resistance
  const nearSupport = sr.supports.find(s => Math.abs(currentPrice - s) / currentPrice < 0.015);
  const nearResistance = sr.resistances.find(r => Math.abs(currentPrice - r) / currentPrice < 0.015);
  if (nearSupport) {
    bullScore += 1;
    reasons.push({ type: 'technical', label: 'At Support', detail: `ใกล้แนวรับ ${nearSupport.toFixed(2)}`, weight: 0.15 });
  }
  if (nearResistance) {
    bearScore += 1;
    reasons.push({ type: 'technical', label: 'At Resistance', detail: `ใกล้แนวต้าน ${nearResistance.toFixed(2)}`, weight: 0.15 });
  }

  // News sentiment
  if (newsSentiment !== undefined) {
    if (newsSentiment > 0.3) {
      bullScore += Math.round(newsSentiment * 2);
      reasons.push({ type: 'news', label: 'Bullish News', detail: `ข่าวเชิงบวก (sentiment: ${newsSentiment.toFixed(2)})`, weight: 0.2 });
    } else if (newsSentiment < -0.3) {
      bearScore += Math.round(Math.abs(newsSentiment) * 2);
      reasons.push({ type: 'news', label: 'Bearish News', detail: `ข่าวเชิงลบ (sentiment: ${newsSentiment.toFixed(2)})`, weight: 0.2 });
    }
  }

  // Decide action
  let action: SignalAction = 'HOLD';
  let strength: SignalStrength = 'weak';
  const totalScore = Math.max(bullScore, bearScore);
  const netScore = bullScore - bearScore;

  if (netScore >= 3) action = 'BUY';
  else if (netScore <= -3) action = 'SELL';
  else action = 'HOLD';

  if (totalScore >= 8) strength = 'very_strong';
  else if (totalScore >= 5) strength = 'strong';
  else if (totalScore >= 3) strength = 'moderate';
  else strength = 'weak';

  // Calculate SL/TP based on ATR-like range
  const recentRange = candles.slice(-14).reduce((sum, c) => sum + (c.high - c.low), 0) / 14;
  const atr = recentRange || currentPrice * 0.02;

  let stopLoss: number;
  let takeProfit: number;

  if (action === 'BUY') {
    stopLoss = nearSupport ? nearSupport * 0.995 : currentPrice - atr * 1.5;
    takeProfit = nearResistance ? nearResistance * 0.995 : currentPrice + atr * 3;
  } else if (action === 'SELL') {
    stopLoss = nearResistance ? nearResistance * 1.005 : currentPrice + atr * 1.5;
    takeProfit = nearSupport ? nearSupport * 1.005 : currentPrice - atr * 3;
  } else {
    stopLoss = currentPrice - atr;
    takeProfit = currentPrice + atr;
  }

  const confidence = Math.min(95, 40 + totalScore * 6);

  return {
    id: `sig-${symbol}-${Date.now()}`,
    user_id: '',
    symbol, name, market,
    action, strength, status: 'active',
    entry_price: Number(currentPrice.toFixed(4)),
    stop_loss: Number(stopLoss.toFixed(4)),
    take_profit: Number(takeProfit.toFixed(4)),
    current_price: Number(currentPrice.toFixed(4)),
    confidence,
    timeframe,
    reasons: reasons.slice(0, 5),
    indicators: {
      rsi: Number(rsiNow.toFixed(2)),
      macd: Number(macdNow.toFixed(4)),
      ma20: Number(ma20Now.toFixed(4)),
      ma50: Number(ma50Now.toFixed(4)),
    },
    news_sentiment: newsSentiment ?? null,
    telegram_sent: false,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    created_at: new Date().toISOString(),
  };
}
