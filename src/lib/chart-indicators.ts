import type { CandleData } from '@/types';
import { BollingerBands, EMA, MACD, RSI, SMA, findSupportResistance } from './indicators';
import { findZones } from './supply-demand';
import type { Zone } from './supply-demand';
import type { ChartBar } from './chart-timeframes';

/**
 * chart-indicators.ts — คำนวณเส้นอินดิเคเตอร์สำหรับหน้ากราฟ จากแท่งที่ /api/chart ส่งมา
 *
 * ═══ กติกาข้อเดียวที่ทั้งไฟล์นี้ยืนอยู่บนมัน ═════════════════════════════════════════
 * **ห้ามเขียนสูตรใหม่** ทุกบรรทัดที่คำนวณค่าในไฟล์นี้เรียกฟังก์ชันจาก src/lib/indicators.ts
 * ตัวเดียวกับที่ signal-engine.ts เรียก ไฟล์นี้จึงมีหน้าที่แค่สองอย่าง: จัดรูปข้อมูลเข้า
 * และเลือก "คาบ" ให้ตรงกับเครื่องยนต์เป๊ะ ถ้าวันไหนมีคนคัดลอกสูตรมาไว้ที่นี่แล้วมันเพี้ยน
 * ไปจากต้นฉบับ เส้นบนกราฟจะไม่ตรงกับเลขที่บันทึกไว้กับสัญญาณ โดยไม่มี error ให้ใครเห็น —
 * ซึ่งคืออาการ "ไม่ตรงกัน" ที่เจ้าของเคยรายงานมาแล้ว
 *
 * ═══ เส้นพวกนี้ไม่ใช่การทำนาย ═══════════════════════════════════════════════════════
 * ทุกค่าคำนวณจากราคาย้อนหลังล้วน ๆ (causal: ค่าที่แท่ง i ใช้ข้อมูลถึงแท่ง i เท่านั้น)
 * ไม่มีช่องไหนมองไปข้างหน้า และไฟล์นี้ไม่รวมคะแนนหรือสรุปทิศทางใด ๆ ทั้งสิ้น —
 * การให้คะแนนเป็นงานของเครื่องยนต์ หน้าเว็บมีหน้าที่ "แสดงสิ่งที่เครื่องยนต์คิด" เท่านั้น
 *
 * ═══ ทำไมคำนวณจาก "แท่งปิดแล้ว" อย่างเดียว ══════════════════════════════════════════
 * /api/chart แยกแท่งที่ยังก่อตัวไว้คนละช่อง (`forming`) โดยตั้งใจ — เหตุผลเดียวกัน
 * ใช้กับเส้นด้วย: ค่าของแท่งครึ่งใบเปลี่ยนได้ทุกวินาทีจนกว่าแท่งจะปิด ถ้าลากเส้นถึงแท่งสด
 * ปลายเส้นจะกระดิกไปมาเองทั้งที่ราคาย้อนหลังไม่ได้เปลี่ยนเลย และคนอ่านจะเห็น
 * "MACD ตัดขึ้น" แล้วหายไปในนาทีถัดมา ซึ่งอ่านได้ว่าระบบเปลี่ยนใจ ทั้งที่ไม่มีอะไรเกิดขึ้นจริง
 * ยิ่งกว่านั้น เครื่องยนต์เองก็คิดจากแท่งปิด (ตัวสแกนส่ง candles ที่ตัดแท่งสดออกแล้ว)
 * เส้นที่ลากถึงแท่งสดจึงเป็นเส้นที่เครื่องยนต์ไม่เคยเห็น
 *   ⇒ ผลที่ตาเห็น: เส้นทุกเส้นจบที่แท่งปิดใบสุดท้าย ไม่ต่อไปถึงแท่งขวาสุดที่ยังก่อตัว
 *     (หน้าเว็บมีข้อความกำกับไว้ว่าแท่งขวาสุดยังไม่ปิด จึงไม่ใช่ช่องว่างที่อธิบายไม่ได้)
 */

/**
 * คาบของทุกตัว — ต้องตรงกับที่ src/lib/signal-engine.ts เรียกจริง **เป๊ะทุกตัว**
 *
 * ที่มาของแต่ละค่า (อ่านจาก generateSignal() ตัวจริง):
 *   rsi 14           ← RSI(closes, 14)
 *   macd 12/26/9     ← MACD(closes) เรียกโดยไม่ส่งพารามิเตอร์ = ค่า default ของ indicators.ts
 *   ma20 = EMA 20    ← EMA(closes, 20)  ⚠ ชื่อคีย์ใน DB คือ ma20 แต่ของจริงเป็น **EMA**
 *                       วาดเป็น SMA เมื่อไหร่ เส้นจะไม่ตรงกับเลขที่บันทึกไว้กับสัญญาณทันที
 *   ma50 = SMA 50    ← SMA(closes, 50)
 *   ma200 = SMA 200  ← SMA(closes, 200) เฉพาะเมื่อมีแท่งครบ 200 จริง ไม่ย่อคาบ
 *   bb 20 / 2 sd     ← BollingerBands(closes, 20, 2) — เส้นกลางเป็น SMA20 (ไม่ใช่ EMA20)
 *   srLookback 5     ← findSupportResistance(candles) ไม่ส่ง lookback = default 5
 *
 * scripts/test-chart-indicators.mjs อ่านค่าพวกนี้เทียบกับซอร์สของ signal-engine.ts ตัวจริง
 * วันไหนฝั่งใดฝั่งหนึ่งเปลี่ยนคาบ เทสต์จะแดงทันที (ห้ามลอกตัวเลขไปเขียนซ้ำที่อื่น)
 */
export const CHART_INDICATOR_PERIODS = {
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  ma20: 20,
  ma50: 50,
  ma200: 200,
  bbPeriod: 20,
  bbStdDev: 2,
  srLookback: 5,
} as const;

/**
 * จุดหนึ่งจุดบนเส้น — `time` เป็น epoch วินาทีเหมือน ChartBar.t
 * ช่วงที่อินดิเคเตอร์ยังไม่มีค่า (ข้อมูลไม่พอ) จะ **ไม่มีจุด** ไม่ใช่จุดที่ค่าเป็น 0
 * เพราะ 0 คือราคาหนึ่งราคา ส่วน "ยังคำนวณไม่ได้" ไม่ใช่ราคา
 */
export interface IndicatorPoint {
  time: number;
  value: number;
}

/** จุดของฮิสโตแกรม MACD — มีสีต่อจุดเพราะแท่งบวก/ลบต้องแยกออกจากกันด้วยตา */
export interface HistogramPoint {
  time: number;
  value: number;
  positive: boolean;
}

export interface ChartIndicatorData {
  /** จำนวนแท่งปิดที่ใช้คำนวณ — ใช้บอกผู้ใช้ได้ว่าทำไมบางเส้นถึงยังไม่ขึ้น */
  closedBars: number;
  /** EMA 20 (ชื่อคีย์ใน DB คือ ma20) */
  ma20: IndicatorPoint[];
  /** SMA 50 */
  ma50: IndicatorPoint[];
  /** SMA 200 — ว่างเปล่าเมื่อแท่งปิดไม่ถึง 200 (เครื่องยนต์ก็ไม่คำนวณเหมือนกัน) */
  ma200: IndicatorPoint[];
  /** true = มีแท่งครบ 200 จริง จึงคำนวณ MA200 ได้ (เงื่อนไขเดียวกับเครื่องยนต์) */
  hasMA200: boolean;
  bbUpper: IndicatorPoint[];
  bbMiddle: IndicatorPoint[];
  bbLower: IndicatorPoint[];
  rsi: IndicatorPoint[];
  macdLine: IndicatorPoint[];
  macdSignal: IndicatorPoint[];
  macdHistogram: HistogramPoint[];
  /** ระดับแนวรับ (มาก→น้อย) และแนวต้าน (น้อย→มาก) ที่หาได้จากแท่งชุดนี้ อย่างละไม่เกิน 3 */
  supports: number[];
  resistances: number[];
  /**
   * โซนดีมาน/ซัพพลายที่ยังใช้ได้ — ใกล้ราคาล่าสุดที่สุดฝั่งละไม่เกิน CHART_MAX_ZONES_PER_SIDE
   *
   * ต่างจาก supports/resistances ตรงที่มัน **มีความกว้าง** จึงอ่านเป็นพื้นที่ได้
   * ไม่ใช่เส้นเดียว · ที่จำกัดฝั่งละ 3 เพราะบนจอ 375px โซนละสองเส้นแนวนอน
   * เกินกว่านี้จะบังแท่งเทียนจนอ่านตัวราคาไม่ออก
   */
  zones: Zone[];
}

/** โซนที่วาดบนกราฟ ฝั่งละไม่เกินเท่านี้ (เหตุผลเรื่องพื้นที่จออยู่ที่ ChartIndicatorData) */
export const CHART_MAX_ZONES_PER_SIDE = 3;

const EMPTY: ChartIndicatorData = {
  closedBars: 0,
  ma20: [],
  ma50: [],
  ma200: [],
  hasMA200: false,
  bbUpper: [],
  bbMiddle: [],
  bbLower: [],
  rsi: [],
  macdLine: [],
  macdSignal: [],
  macdHistogram: [],
  supports: [],
  resistances: [],
  zones: [],
};

/**
 * จับคู่ค่าจากอาร์เรย์ผลลัพธ์กับเวลาแท่ง แล้วทิ้งช่วงที่ยังคำนวณไม่ได้
 * (indicators.ts คืน NaN ตรงช่วงนั้นตามกติกาของมัน — ห้ามเดาค่าแทน)
 */
function toPoints(times: readonly number[], values: readonly number[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  const n = Math.min(times.length, values.length);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isFinite(v)) out.push({ time: times[i], value: v });
  }
  return out;
}

/**
 * ChartBar → CandleData เท่าที่ findSupportResistance ต้องใช้ (มันอ่านแค่ high/low)
 * volume เป็น 0 เพราะเลนกราฟไม่ส่งวอลุ่มมา และไม่มีตัวไหนในไฟล์นี้ใช้วอลุ่มเลย
 */
function toCandles(bars: readonly ChartBar[]): CandleData[] {
  return bars.map((b) => ({
    timestamp: new Date(b.t * 1000).toISOString(),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: 0,
  }));
}

/**
 * คำนวณทุกเส้นที่หน้ากราฟวาดได้ จาก **แท่งที่ปิดแล้วเท่านั้น**
 *
 * ผู้เรียกต้องส่งเฉพาะ `bars` จาก /api/chart (ไม่ต่อ `forming` เข้ามา) — เหตุผลเต็มอยู่
 * ที่หัวไฟล์ ฟังก์ชันนี้ไม่กรองแท่งสดให้เอง เพราะมันแยกไม่ออกว่าแท่งไหนสด
 * (ความรู้นั้นอยู่ที่ /api/chart ซึ่งแยกมาให้แล้วคนละช่อง)
 */
export function computeChartIndicators(closedBars: readonly ChartBar[]): ChartIndicatorData {
  if (!closedBars.length) return { ...EMPTY };

  const times = closedBars.map((b) => b.t);
  const closes = closedBars.map((b) => b.c);
  const P = CHART_INDICATOR_PERIODS;

  const ema20 = EMA(closes, P.ma20);
  const sma50 = SMA(closes, P.ma50);
  // เงื่อนไขเดียวกับ signal-engine.ts บรรทัด 119 — ไม่ครบ 200 = ไม่คำนวณ ไม่ใช่ย่อคาบลง
  const hasMA200 = closes.length >= P.ma200;
  const sma200 = hasMA200 ? SMA(closes, P.ma200) : [];

  const bb = BollingerBands(closes, P.bbPeriod, P.bbStdDev);
  const rsi = RSI(closes, P.rsi);
  const macd = MACD(closes, P.macdFast, P.macdSlow, P.macdSignal);

  const hist: HistogramPoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const v = macd.histogram[i];
    if (Number.isFinite(v)) hist.push({ time: times[i], value: v, positive: v >= 0 });
  }

  const candles = toCandles(closedBars);
  const sr = findSupportResistance(candles, P.srLookback);

  // โซนดีมาน/ซัพพลาย — findZones คืนเฉพาะใบที่ "รู้ได้แล้วและยังไม่ถูกทะลุ" ณ แท่งปิดใบสุดท้าย
  // แล้วเลือกเฉพาะใบที่อยู่ถูกฝั่งของราคาและใกล้ที่สุด: โซนที่ราคาทะลุเข้าไปแล้วไม่ใช่
  // แนวรับ/แนวต้านของราคาปัจจุบันอีกต่อไป (บทเรียนเดียวกับ nearSupport ในเครื่องยนต์
  // ที่เคยกลายเป็น SL สูงกว่าราคาเข้าเพราะไม่กรองฝั่ง)
  const lastClose = closedBars[closedBars.length - 1].c;
  const allZones = findZones(candles);
  const zones = [
    ...allZones
      .filter((z) => z.side === 'demand' && z.proximal < lastClose)
      .sort((a, b) => b.proximal - a.proximal)
      .slice(0, CHART_MAX_ZONES_PER_SIDE),
    ...allZones
      .filter((z) => z.side === 'supply' && z.proximal > lastClose)
      .sort((a, b) => a.proximal - b.proximal)
      .slice(0, CHART_MAX_ZONES_PER_SIDE),
  ];

  return {
    closedBars: closedBars.length,
    ma20: toPoints(times, ema20),
    ma50: toPoints(times, sma50),
    ma200: toPoints(times, sma200),
    hasMA200,
    bbUpper: toPoints(times, bb.upper),
    bbMiddle: toPoints(times, bb.middle),
    bbLower: toPoints(times, bb.lower),
    rsi: toPoints(times, rsi),
    macdLine: toPoints(times, macd.macdLine),
    macdSignal: toPoints(times, macd.signalLine),
    macdHistogram: hist,
    supports: sr.supports,
    resistances: sr.resistances,
    zones,
  };
}

/**
 * เส้นอ้างอิงของแผง RSI — 30 / 50 / 70
 *
 * สามเส้นนี้ไม่ใช่ของตกแต่ง: 30 กับ 70 คือเกณฑ์ที่เครื่องยนต์ใช้ให้คะแนนจริง
 * (signal-engine.ts: rsi < 30 → bullScore +2 · rsi > 70 → bearScore +2)
 * และ 50 คือเส้นที่กฎ "RSI Cross 50" วัดการตัดผ่าน (±1)
 * ⚠ ห้ามเปลี่ยนตัวเลขสามตัวนี้โดยไม่ไปดูเครื่องยนต์ก่อน — เส้นที่ขีดคนละที่กับเกณฑ์จริง
 *   ทำให้คนอ่านสรุปผิดว่าทำไมใบนั้นถึงได้คะแนน
 */
export const RSI_LEVELS = { oversold: 30, middle: 50, overbought: 70 } as const;
