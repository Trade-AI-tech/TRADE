import type { CandleData, Signal, SignalAction, SignalStrength, SignalReason } from '@/types';
import {
  RSI, MACD, EMA, SMA, BollingerBands, ATR,
  findSupportResistance, detectPatterns, determineTrend,
} from './indicators';

interface SignalInput {
  symbol: string;
  name: string;
  market: Signal['market'];
  candles: CandleData[];
  timeframe?: string;
  newsSentiment?: number;
}

/** uuid v4 — ต้องเป็น uuid จริงเพราะคอลัมน์ signals.id เป็น type uuid */
function newUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** ปัดทศนิยมตามชนิดสินทรัพย์ — Forex ต้องละเอียดกว่าทอง/หุ้น */
function roundPrice(value: number, market: Signal['market']): number {
  const digits = market === 'FOREX' ? 5 : 4;
  return Number(value.toFixed(digits));
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
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const rsi = RSI(closes, 14);
  const macd = MACD(closes);
  const ema20 = EMA(closes, 20);
  const ma50 = SMA(closes, 50);
  // MA200 คำนวณเฉพาะเมื่อมีข้อมูลครบ 200 แท่งจริง ไม่ย่อ period ให้สั้นลง
  const ma200 = closes.length >= 200 ? SMA(closes, 200) : [];

  const bb = BollingerBands(closes, 20, 2);

  const last = closes.length - 1;
  const rsiNow = rsi[last];
  const rsiPrev = rsi[last - 1];
  const macdNow = macd.macdLine[last];
  const macdSignal = macd.signalLine[last];
  const macdHist = macd.histogram[last];
  const ma20Now = ema20[last];
  const ma50Now = ma50[last];
  const ma200Now = ma200.length ? ma200[last] : NaN;
  const hasMA200 = Number.isFinite(ma200Now);

  const sr = findSupportResistance(candles);
  const patterns = detectPatterns(candles);
  const trend = determineTrend(currentPrice, ma20Now, ma50Now, ma200Now);

  // Scoring system
  let bullScore = 0;
  let bearScore = 0;
  const reasons: SignalReason[] = [];

  // RSI
  if (Number.isFinite(rsiNow)) {
    if (rsiNow < 30) {
      bullScore += 2;
      reasons.push({ type: 'technical', label: 'RSI Oversold', detail: `RSI(14) = ${rsiNow.toFixed(1)} อยู่ในโซน oversold`, weight: 0.2 });
    } else if (rsiNow > 70) {
      bearScore += 2;
      reasons.push({ type: 'technical', label: 'RSI Overbought', detail: `RSI(14) = ${rsiNow.toFixed(1)} อยู่ในโซน overbought`, weight: 0.2 });
    } else if (Number.isFinite(rsiPrev) && rsiNow > 50 && rsiPrev < 50) {
      bullScore += 1;
      reasons.push({ type: 'technical', label: 'RSI Cross 50', detail: 'RSI ตัดขึ้นผ่าน 50', weight: 0.15 });
    } else if (Number.isFinite(rsiPrev) && rsiNow < 50 && rsiPrev > 50) {
      bearScore += 1;
      reasons.push({ type: 'technical', label: 'RSI Cross 50', detail: 'RSI ตัดลงต่ำกว่า 50', weight: 0.15 });
    }
  }

  // MACD
  if (Number.isFinite(macdNow) && Number.isFinite(macdSignal)
      && Number.isFinite(macd.macdLine[last - 1]) && Number.isFinite(macd.signalLine[last - 1])) {
    if (macdNow > macdSignal && macd.macdLine[last - 1] <= macd.signalLine[last - 1]) {
      bullScore += 2;
      reasons.push({ type: 'technical', label: 'MACD Bullish Cross', detail: 'MACD ตัดขึ้น Signal Line', weight: 0.2 });
    } else if (macdNow < macdSignal && macd.macdLine[last - 1] >= macd.signalLine[last - 1]) {
      bearScore += 2;
      reasons.push({ type: 'technical', label: 'MACD Bearish Cross', detail: 'MACD ตัดลง Signal Line', weight: 0.2 });
    }
  }

  if (Number.isFinite(macdHist) && Number.isFinite(macd.histogram[last - 1])) {
    if (macdHist > 0 && macd.histogram[last - 1] < macdHist) {
      bullScore += 1;
    } else if (macdHist < 0 && macd.histogram[last - 1] > macdHist) {
      bearScore += 1;
    }
  }

  // Trend
  const trendDetail = hasMA200
    ? (t: string) => `MA20 ${t} MA50 ${t} MA200 ยืนยัน${t === '>' ? 'uptrend' : 'downtrend'}`
    : (t: string) => `MA20 ${t} MA50 (ข้อมูลไม่ถึง 200 แท่ง จึงไม่ใช้ MA200 ยืนยัน)`;

  if (trend === 'uptrend') {
    bullScore += hasMA200 ? 2 : 1;
    reasons.push({ type: 'technical', label: 'Uptrend', detail: trendDetail('>'), weight: 0.2 });
  } else if (trend === 'downtrend') {
    bearScore += hasMA200 ? 2 : 1;
    reasons.push({ type: 'technical', label: 'Downtrend', detail: trendDetail('<'), weight: 0.2 });
  }

  // Bollinger Bands
  if (Number.isFinite(bb.lower[last]) && currentPrice < bb.lower[last]) {
    bullScore += 1;
    reasons.push({ type: 'technical', label: 'BB Lower Touch', detail: 'ราคาต่ำกว่า Bollinger Lower Band', weight: 0.15 });
  } else if (Number.isFinite(bb.upper[last]) && currentPrice > bb.upper[last]) {
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

  if (totalScore >= 8) strength = 'very_strong';
  else if (totalScore >= 5) strength = 'strong';
  else if (totalScore >= 3) strength = 'moderate';

  // SL/TP จาก ATR จริง
  const atrRaw = ATR(candles, 14);
  const atr = Number.isFinite(atrRaw) && atrRaw > 0 ? atrRaw : currentPrice * 0.02;

  let stopLoss: number;
  let takeProfit: number;

  if (action === 'BUY') {
    stopLoss = nearSupport ? nearSupport * 0.995 : currentPrice - atr * 1.5;
    takeProfit = nearResistance && nearResistance > currentPrice
      ? nearResistance * 0.995
      : currentPrice + atr * 3;
  } else if (action === 'SELL') {
    stopLoss = nearResistance ? nearResistance * 1.005 : currentPrice + atr * 1.5;
    takeProfit = nearSupport && nearSupport < currentPrice
      ? nearSupport * 1.005
      : currentPrice - atr * 3;
  } else {
    stopLoss = currentPrice - atr;
    takeProfit = currentPrice + atr;
  }

  const confidence = Math.min(95, 40 + totalScore * 6);

  const indicators: Record<string, number> = {};
  const put = (k: string, v: number, d = 4) => {
    if (Number.isFinite(v)) indicators[k] = Number(v.toFixed(d));
  };
  put('rsi', rsiNow, 2);
  put('macd', macdNow);
  put('macd_signal', macdSignal);
  put('ma20', ma20Now);
  put('ma50', ma50Now);
  put('ma200', ma200Now);
  put('atr', atr);

  return {
    id: newUuid(),
    user_id: '',
    symbol, name, market,
    action, strength, status: 'active',
    entry_price: roundPrice(currentPrice, market),
    stop_loss: roundPrice(stopLoss, market),
    take_profit: roundPrice(takeProfit, market),
    current_price: roundPrice(currentPrice, market),
    confidence,
    timeframe,
    reasons: reasons.slice(0, 5),
    indicators,
    news_sentiment: newsSentiment ?? null,
    telegram_sent: false,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    created_at: new Date().toISOString(),
  };
}
