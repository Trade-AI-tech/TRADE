import type { MarketPrice, CandleData } from '@/types';
import { DEMO_PRICES, generateCandleData } from './demo-data';
import { isDemoMode } from './supabase';
import { sanitizeCandles } from './candle-sanitizer';

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
  /**
   * meta.currentTradingPeriod.regular.start เป็น ISO — เวลาเปิดรอบซื้อขายตาม Yahoo
   * ส่งดิบออกไปให้ผู้เรียกตัดสินเอง เพราะเชื่อเดี่ยว ๆ ไม่ได้ทุกตลาด
   * (หุ้นไทยตอนตลาดปิด ค่านี้ชี้ไปรอบพรุ่งนี้) — ดู resolveSessionStart ใน position-monitor.ts
   */
  regularStart: string | null;
}

const EMPTY: ChartPayload = { quote: null, candles: [], regularStart: null };

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

      // epoch วินาที → ISO ให้ผู้เรียกใช้ต่อได้ทันที ไม่มีค่าก็ปล่อย null ไม่เดา
      const regularStartEpoch = Number(meta.currentTradingPeriod?.regular?.start);
      const regularStart = Number.isFinite(regularStartEpoch)
        ? new Date(regularStartEpoch * 1000).toISOString()
        : null;
      const timestamps: number[] = result.timestamp || [];
      const ohlc = result.indicators?.quote?.[0];
      if (!ohlc) continue;

      const rawCandles: CandleData[] = timestamps
        .map((ts, i) => ({
          timestamp: new Date(ts * 1000).toISOString(),
          open: ohlc.open?.[i] ?? 0,
          high: ohlc.high?.[i] ?? 0,
          low: ohlc.low?.[i] ?? 0,
          close: ohlc.close?.[i] ?? 0,
          volume: ohlc.volume?.[i] ?? 0,
        }))
        .filter((c) => c.close > 0);

      // ด่านตรวจแท่ง — บรรทัดข้างบนคือคอขวดเดียวที่ raw JSON ของ Yahoo กลายเป็น CandleData
      // ของทุกเส้นทางโปรดักชัน (ตัวสแกน GitHub Actions โหลดไฟล์นี้ตัวจริง + ทุก API route)
      // Yahoo ส่งแท่งเป็นไปไม่ได้มาจริง ~3.3% ของแคชวิจัย จึงต้องกรองตรงนี้ครั้งเดียวให้คลุมหมด
      // เหตุผลเต็มและเกณฑ์ต่อตลาดอยู่ใน candle-sanitizer.ts
      const { candles, dropped, repaired } = sanitizeCandles(rawCandles, market);
      if (dropped > 0 || repaired > 0) {
        // รายงานเป็น warning ไม่ใช่ error — แท่งเสียประปรายเป็นเรื่องปกติของ Yahoo
        // แต่ต้องเห็นใน log เสมอ ข้อมูลเสียที่ถูกซ่อมเงียบ ๆ จะไม่มีใครตามไปแก้ที่ต้นทาง
        console.warn(`fetchChart ${yahooSymbol} ${interval}: ซ่อมกรอบ ${repaired} แท่ง · ทิ้งแท่งเสีย ${dropped} แท่ง`);
      }

      const price = Number(meta.regularMarketPrice ?? candles[candles.length - 1]?.close);
      if (!price || !Number.isFinite(price)) return { quote: null, candles, regularStart };

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

      return { quote, candles, regularStart };
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
