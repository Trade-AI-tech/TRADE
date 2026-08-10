import type { MarketPrice, CandleData } from '@/types';
import { DEMO_PRICES, generateCandleData } from './demo-data';
import { isDemoMode } from './supabase';

/**
 * Market data fetcher using Yahoo Finance public chart API (v8).
 * ไม่ต้องใช้ API key
 *
 * หมายเหตุ: endpoint /v7/finance/quote ตอบ 401 แล้ว (Yahoo บังคับ cookie+crumb)
 * เราจึงดึงทั้งราคาปัจจุบันและแท่งเทียนจาก /v8/finance/chart ครั้งเดียวจบ
 */

const CHART_HOSTS = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart',
];

export type ChartInterval = '1d' | '1h' | '1wk';
export type ChartRange = '1mo' | '3mo' | '6mo' | '1y' | '2y';

/**
 * Map our internal symbol to a Yahoo Finance symbol
 */
export function toYahooSymbol(symbol: string, market: string): string {
  const s = symbol.trim().toUpperCase();

  if (market === 'GOLD') {
    if (s === 'XAUUSD' || s === 'GOLD') return 'GC=F';
    if (s === 'XAGUSD' || s === 'SILVER') return 'SI=F';
    return s;
  }
  if (market === 'FOREX') {
    return s.endsWith('=X') ? s : `${s}=X`;
  }
  if (market === 'TH_STOCK') {
    return s.endsWith('.BK') ? s : `${s}.BK`;
  }
  if (market === 'CRYPTO') {
    return s.includes('-') ? s : `${s}-USD`;
  }
  return s;
}

interface ChartPayload {
  quote: MarketPrice | null;
  candles: CandleData[];
}

const EMPTY: ChartPayload = { quote: null, candles: [] };

/**
 * ดึง chart จาก Yahoo — ได้ทั้ง quote และ candles ในคำขอเดียว
 * ลอง query1 ก่อน ถ้าไม่ติดค่อยไป query2
 */
export async function fetchChart(
  symbol: string,
  market: string,
  interval: ChartInterval = '1d',
  range: ChartRange = '1y'
): Promise<ChartPayload> {
  const yahooSymbol = toYahooSymbol(symbol, market);

  for (const host of CHART_HOSTS) {
    try {
      const res = await fetch(
        `${host}/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          next: { revalidate: 300 },
        }
      );
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const meta = result.meta ?? {};
      const timestamps: number[] = result.timestamp || [];
      const ohlc = result.indicators?.quote?.[0];
      if (!ohlc) continue;

      const candles: CandleData[] = timestamps
        .map((ts, i) => ({
          timestamp: new Date(ts * 1000).toISOString(),
          open: ohlc.open?.[i] ?? 0,
          high: ohlc.high?.[i] ?? 0,
          low: ohlc.low?.[i] ?? 0,
          close: ohlc.close?.[i] ?? 0,
          volume: ohlc.volume?.[i] ?? 0,
        }))
        .filter((c) => c.close > 0);

      const price = Number(meta.regularMarketPrice ?? candles[candles.length - 1]?.close);
      if (!price || !Number.isFinite(price)) return { quote: null, candles };

      // ใช้แท่งก่อนหน้าเป็นฐานคำนวณการเปลี่ยนแปลง (เชื่อถือได้กว่า meta.chartPreviousClose
      // ซึ่งเป็นราคาปิดก่อนเริ่มช่วงที่ขอมา ไม่ใช่ของเมื่อวาน)
      const prevClose =
        candles.length >= 2 ? candles[candles.length - 2].close : Number(meta.chartPreviousClose ?? price);
      const change = price - prevClose;

      const quote: MarketPrice = {
        symbol,
        name: meta.longName || meta.shortName || symbol,
        market: market as MarketPrice['market'],
        price,
        change,
        change_percent: prevClose ? (change / prevClose) * 100 : 0,
        volume: Number(meta.regularMarketVolume ?? candles[candles.length - 1]?.volume ?? 0),
        high_24h: Number(meta.regularMarketDayHigh ?? candles[candles.length - 1]?.high ?? price),
        low_24h: Number(meta.regularMarketDayLow ?? candles[candles.length - 1]?.low ?? price),
        updated_at: new Date().toISOString(),
      };

      return { quote, candles };
    } catch (err) {
      console.error('fetchChart error:', yahooSymbol, err);
    }
  }

  return EMPTY;
}

/**
 * ราคาปัจจุบันตัวเดียว
 */
export async function fetchQuote(symbol: string, market: string): Promise<MarketPrice | null> {
  if (isDemoMode()) {
    return DEMO_PRICES.find((p) => p.symbol === symbol) ?? null;
  }
  const { quote } = await fetchChart(symbol, market, '1d', '3mo');
  return quote;
}

/**
 * แท่งเทียน — default 1 ปี เพื่อให้ MA200 มีความหมายจริง
 */
export async function fetchCandles(
  symbol: string,
  market: string,
  interval: ChartInterval = '1d',
  range: ChartRange = '1y'
): Promise<CandleData[]> {
  if (isDemoMode()) {
    const price = DEMO_PRICES.find((p) => p.symbol === symbol);
    return generateCandleData(symbol, price?.price || 100, 250);
  }
  const { candles } = await fetchChart(symbol, market, interval, range);
  return candles;
}

/**
 * ดึงราคาหลายตัวพร้อมกัน (จำกัดความถี่เพื่อไม่ให้โดน Yahoo throttle)
 */
export async function fetchQuotes(
  symbols: Array<{ symbol: string; market: string }>
): Promise<MarketPrice[]> {
  if (isDemoMode()) {
    return DEMO_PRICES.filter((p) => symbols.some((s) => s.symbol === p.symbol));
  }

  const out: MarketPrice[] = [];
  const BATCH = 5;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((s) => fetchQuote(s.symbol, s.market)));
    for (const r of results) if (r) out.push(r);
  }
  return out;
}
