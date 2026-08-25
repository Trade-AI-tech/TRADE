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

/**
 * ปัดทศนิยมให้เหมาะกับ "ขนาดของราคา" ไม่ใช่ชนิดตลาดอย่างเดียว
 *
 * เดิมใช้ toFixed(4) กับทุกตลาดที่ไม่ใช่ FOREX แล้วพังกับเหรียญราคาถูก:
 *   PEPE-USD ราคาจริง 0.0000061957 → Number((0.0000061957).toFixed(4)) = 0
 *   SHIB-USD ราคาจริง 0.00000468   → 0
 * ผลคือ entry_price / stop_loss / take_profit เป็น 0 ทั้งชุด สัญญาณถูกบันทึกลง DB ได้
 * (คอลัมน์เป็น numeric NOT NULL ซึ่ง 0 ผ่าน) แล้ว UI คำนวณ RR ออกมาเป็น NaN
 *
 * ราคาต่ำกว่า 1 จึงเปลี่ยนไปใช้ "เลขนัยสำคัญ" แทนจำนวนตำแหน่งคงที่
 * 6 ตัวพอสำหรับ meme coin และไม่ทำให้คู่เงิน forex (0.x–1.x) เสียความละเอียดที่เคยมี
 */
function roundPrice(value: number, market: Signal['market']): number {
  if (!Number.isFinite(value)) return value;
  if (value !== 0 && Math.abs(value) < 1) {
    const digits = market === 'FOREX' ? 5 : 6;
    return Number(value.toPrecision(digits));
  }
  return Number(value.toFixed(market === 'FOREX' ? 5 : 4));
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
  //
  // ต้องกรอง "ฝั่ง" ไม่ใช่แค่ระยะทาง: แนวรับต้องอยู่ใต้ราคาปัจจุบัน แนวต้านต้องอยู่เหนือ
  // เดิมใช้ Math.abs ซึ่งวัดแต่ระยะห่างโดยไม่สนว่าอยู่ฝั่งไหนของราคา
  // พอราคาหลุดลงใต้แนวรับเดิม แนวรับนั้นจะกลายเป็นระดับที่อยู่ "เหนือ" ราคาปัจจุบัน
  // แต่ยังผ่านเกณฑ์ 1.5% แล้วถูกส่งต่อไปตั้งเป็น stopLoss ของสัญญาณ BUY
  // ผลคือ SL สูงกว่าราคาเข้า ซึ่งขัดกับความหมายของ stop loss โดยสิ้นเชิง
  // และ position-monitor จะเมินมันทิ้ง (ignored) ทำให้ออเดอร์ไม่มี SL คุ้มครองจริง
  //
  // ในทางเทคนิค ระดับที่ราคาทะลุลงมาแล้วไม่ใช่แนวรับอีกต่อไป — มันกลายเป็นแนวต้าน
  // supports เรียงจากมากไปน้อย / resistances เรียงจากน้อยไปมาก
  // เมื่อกรองฝั่งแล้ว find จึงได้ระดับที่ "ใกล้ราคาที่สุด" ของฝั่งนั้นพอดี
  const nearSupport = sr.supports.find(s => s < currentPrice && (currentPrice - s) / currentPrice < 0.015);
  const nearResistance = sr.resistances.find(r => r > currentPrice && (r - currentPrice) / currentPrice < 0.015);
  if (nearSupport) {
    bullScore += 1;
    reasons.push({ type: 'technical', label: 'At Support', detail: `ราคาอยู่เหนือแนวรับ ${nearSupport.toFixed(2)} ไม่เกิน 1.5%`, weight: 0.15 });
  }
  if (nearResistance) {
    bearScore += 1;
    reasons.push({ type: 'technical', label: 'At Resistance', detail: `ราคาอยู่ใต้แนวต้าน ${nearResistance.toFixed(2)} ไม่เกิน 1.5%`, weight: 0.15 });
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
    // แนวรับผ่านการกรองฝั่งมาแล้วว่าอยู่ใต้ราคา / แนวต้านอยู่เหนือราคา
    // จึงไม่ต้องเช็คทิศซ้ำตรงนี้ (ชั้นที่ 2 ด้านล่างจะตรวจค่าที่คำนวณเสร็จแล้วอีกที)
    stopLoss = nearSupport ? nearSupport * 0.995 : currentPrice - atr * 1.5;
    takeProfit = nearResistance ? nearResistance * 0.995 : currentPrice + atr * 3;
  } else if (action === 'SELL') {
    stopLoss = nearResistance ? nearResistance * 1.005 : currentPrice + atr * 1.5;
    takeProfit = nearSupport ? nearSupport * 1.005 : currentPrice - atr * 3;
  } else {
    stopLoss = currentPrice - atr;
    takeProfit = currentPrice + atr;
  }

  // ชั้นที่ 2 — บังคับ invariant ปิดท้าย
  //
  // ทำไมต้องมีทั้งที่ชั้นที่ 1 กรองฝั่งไปแล้ว: เพราะบล็อกข้างบนไม่ได้ใช้ระดับแนวรับ/แนวต้าน
  // ตรง ๆ แต่คูณ 0.995 / 1.005 ทับลงไปเพื่อเผื่อ slippage ตัวคูณนั้นเลื่อนค่าข้ามฝั่ง entry ได้
  // ตัวอย่างจริง: BUY ที่มีแนวต้านอยู่เหนือราคาแค่ 0.2% (100 → 100.2)
  //   takeProfit = 100.2 * 0.995 = 99.699 ซึ่ง "ต่ำกว่า" ราคาเข้า
  //   กลายเป็นเป้ากำไรที่อยู่ฝั่งขาดทุน และ position-monitor จะเมินทิ้ง (ignored)
  // ฝั่ง SELL ก็สมมาตรกัน: แนวรับที่อยู่ใต้ราคาไม่ถึง 0.5% พอคูณ 1.005 แล้วเด้งข้ามขึ้นเหนือ entry
  //
  // ชั้นที่ 1 กันที่ "ต้นทาง" (เลือกระดับผิดฝั่ง) ชั้นนี้กันที่ "ปลายทาง" (ค่าที่คำนวณเสร็จแล้ว)
  // ต้องมีทั้งคู่ เพราะสิ่งที่ไหลออกไปเป็นสัญญาณจริงคือค่าหลังคูณ ไม่ใช่ระดับที่เลือกมา
  // ด้านไหนไม่ผ่านให้ถอยไปใช้สูตร ATR ของด้านนั้น ซึ่งอิงจาก currentPrice จึงอยู่ถูกฝั่งเสมอ
  // (HOLD ไม่ต้องบังคับ เพราะไม่ได้เอาไปเปิดออเดอร์)
  //
  // เขียนเป็น !(a < b) ไม่ใช่ (a >= b) เพื่อให้ NaN ตกเข้าเงื่อนไข fallback ด้วย
  if (action === 'BUY') {
    if (!(stopLoss < currentPrice)) stopLoss = currentPrice - atr * 1.5;
    if (!(takeProfit > currentPrice)) takeProfit = currentPrice + atr * 3;
  } else if (action === 'SELL') {
    if (!(stopLoss > currentPrice)) stopLoss = currentPrice + atr * 1.5;
    if (!(takeProfit < currentPrice)) takeProfit = currentPrice - atr * 3;
  }

  // ชั้นที่ 2.5 — เป้าต้อง "ไกลพอคุ้มความเสี่ยง" ไม่ใช่แค่ "อยู่ถูกฝั่ง"
  //
  // ── บั๊กที่ชั้นนี้มาแก้ (วัดเมื่อ 2026-08-25) ─────────────────────────────────
  // บล็อกข้างบนหยิบ "แนวต้านตัวแรกที่อยู่ใกล้กว่า 1.5%" มาเป็นเป้าทันที โดยไม่ดูเลยว่า
  // มันห่างจากราคาเข้าแค่ไหนเทียบกับระยะ SL ที่ตั้งไว้ ผลคือถ้ามีแนวต้านห่างแค่ 0.1%
  // ขณะ SL กว้าง 0.6% จะได้เป้าที่ใกล้กว่าจุดตัดขาดทุนหลายเท่า
  //
  // ยิงเครื่องยนต์กับ 13 สัญลักษณ์จริงได้ RR ดังนี้:
  //     15m  0.14 · 0.15 · 0.16 · 0.18 · 0.21      (มัธยฐาน 0.16)
  //     1H   0.29 · 0.29
  // RR 0.16 = เสี่ยง 1 บาทเพื่อลุ้น 0.16 บาท ต้องชนะ 86% ถึงเสมอตัว ซึ่งไม่มีระบบไหนทำได้
  // ด่าน RR ของ SIGNAL_GATE ตัดทิ้งทั้งหมดอย่างถูกต้อง แต่ต้นเหตุอยู่ที่การวางเป้า ไม่ใช่ที่ด่าน
  //
  // ── ตัวเลข 2.0 มาจากไหน ─────────────────────────────────────────────────────
  // เป็นอัตราส่วนที่เครื่องยนต์ตัวนี้ใช้อยู่แล้วในสูตรสำรองของตัวเอง: SL = 1.5×ATR
  // และ TP = 3×ATR → RR = 2.0 ชั้นนี้จึงไม่ได้ตั้งค่าใหม่ แต่บังคับให้เส้นทางที่ใช้
  // แนวรับ/แนวต้าน เคารพอัตราส่วนเดียวกับเส้นทางสำรอง แทนที่จะหลุดไปคนละเรื่อง
  //
  // ⚠ สิ่งที่แลกไป: เป้าที่ไกลขึ้นถูกแตะน้อยลง ไม้จะจบด้วย "หมดเวลา" มากขึ้นแทน "แตะเป้า"
  //   นี่เป็นการแลกอัตราชนะกับกำไรต่อไม้ที่ชนะ — ไม่ใช่ของฟรี และต้องวัดผลจริงเสมอ
  const MIN_RR_GEOMETRY = 2.0;
  if (action === 'BUY' || action === 'SELL') {
    const risk = Math.abs(currentPrice - stopLoss);
    if (risk > 0) {
      const reward = Math.abs(takeProfit - currentPrice);
      const minReward = risk * MIN_RR_GEOMETRY;
      if (!(reward >= minReward)) {
        takeProfit = action === 'BUY' ? currentPrice + minReward : currentPrice - minReward;
      }
    }
  }

  // ชั้นที่ 3 — ตรวจ invariant อีกครั้ง "หลังปัดทศนิยม"
  //
  // ชั้นที่ 2 บังคับบนค่าดิบ แต่สิ่งที่เขียนลง DB จริงคือค่าที่ผ่าน roundPrice มาแล้ว
  // ถ้าระยะห่างจาก entry เล็กกว่าครึ่งหน่วยปัด ค่าที่ออกไปจะ "เท่ากับ" entry พอดี
  // เช่น BUY ที่ currentPrice 99.99996 กับ takeProfit 99.9999875 → ปัดแล้วได้ 100.0000 เท่ากันทั้งคู่
  // สัญญาณนั้นจะมี take_profit = entry_price ซึ่ง position-monitor จะเมินทิ้ง (ignored)
  // แปลว่าออเดอร์ที่เปิดจากสัญญาณนี้จะไม่มีวันถูกปิดอัตโนมัติ โดยไม่มีอะไรบอกผู้ใช้
  const entryOut = roundPrice(currentPrice, market);
  let stopOut = roundPrice(stopLoss, market);
  let takeOut = roundPrice(takeProfit, market);

  if (action === 'BUY') {
    if (!(stopOut < entryOut)) stopOut = roundPrice(currentPrice - atr * 1.5, market);
    if (!(takeOut > entryOut)) takeOut = roundPrice(currentPrice + atr * 3, market);
  } else if (action === 'SELL') {
    if (!(stopOut > entryOut)) stopOut = roundPrice(currentPrice + atr * 1.5, market);
    if (!(takeOut < entryOut)) takeOut = roundPrice(currentPrice - atr * 3, market);
  }

  // ATR เล็กเกินกว่าจะรอดการปัด (หรือราคาเล็กจนทุกอย่างยุบเป็นค่าเดียวกัน)
  // ยอมไม่ออกสัญญาณ ดีกว่าออกสัญญาณที่ SL/TP ใช้งานไม่ได้จริง
  if (action !== 'HOLD' && (stopOut === entryOut || takeOut === entryOut || stopOut <= 0 || takeOut <= 0)) {
    return null;
  }

  const confidence = Math.min(95, 40 + totalScore * 6);

  // อายุสัญญาณตาม timeframe — สัญญาณจากแท่งรายชั่วโมง "เก่า" เร็วกว่าสัญญาณรายวันมาก:
  // setup บนแท่ง 1H มักเดินจบภายในไม่กี่สิบแท่ง (ราววันสองวัน) ถ้าปล่อยให้ active ค้าง 7 วัน
  // เท่ากับโชว์ผู้ใช้ว่าโอกาสยังอยู่ทั้งที่ตลาดเดินผ่านจุดนั้นไปนานแล้ว → 1H หมดอายุใน 48 ชม.
  // timeframe อื่นคงอายุ 7 วันตามพฤติกรรมเดิม
  const ttlMs = timeframe === '1H' ? 48 * 3600_000 : 7 * 86400000;

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
    entry_price: entryOut,
    stop_loss: stopOut,
    take_profit: takeOut,
    current_price: entryOut,
    confidence,
    timeframe,
    reasons: reasons.slice(0, 5),
    indicators,
    news_sentiment: newsSentiment ?? null,
    telegram_sent: false,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    created_at: new Date().toISOString(),
  };
}
