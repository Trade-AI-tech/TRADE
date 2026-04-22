import type { MarketPrice, CandleData } from '@/types';
import { DEMO_PRICES, generateCandleData } from './demo-data';
import { isDemoMode } from './supabase';

/**
 * Market data fetcher using Yahoo Finance public API
 * (no API key required)
 */

const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote';
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YahooQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
}

/**
 * Map our internal symbol to Yahoo Finance symbol
 */
function toYahooSymbol(symbol: string, market: string): string {
  if (market === 'GOLD' && symbol === 'XAUUSD') return 'GC=F';
  if (market === 'FOREX') {
    if (symbol === 'EURUSD') return 'EURUSD=X';
    if (symbol === 'USDJPY') return 'USDJPY=X';
    if (symbol === 'GBPUSD') return 'GBPUSD=X';
    if (symbol === 'USDTHB') return 'USDTHB=X';
  }
  return symbol;
}

/**
 * Fetch live quote from Yahoo Finance
 */
export async function fetchQuote(symbol: string, market: string): Promise<MarketPrice | null> {
  if (isDemoMode()) {
    return DEMO_PRICES.find(p => p.symbol === symbol) ?? null;
  }

  try {
    const yahooSymbol = toYahooSymbol(symbol, market);
    const res = await fetch(`${YAHOO_QUOTE_URL}?symbols=${yahooSymbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 },
    });

    if (!res.ok) return null;
    const json = await res.json();
    const quote: YahooQuote = json?.quoteResponse?.result?.[0];
    if (!quote) return null;

    return {
      symbol,
      name: quote.longName || quote.shortName || symbol,
      market: market as MarketPrice['market'],
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      change_percent: quote.regularMarketChangePercent,
      volume: quote.regularMarketVolume || 0,
      high_24h: quote.regularMarketDayHigh,
      low_24h: quote.regularMarketDayLow,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('fetchQuote error:', err);
    return null;
  }
}

/**
 * Fetch candle/OHLC data from Yahoo Finance
 */
export async function fetchCandles(
  symbol: string,
  market: string,
  interval: '1d' | '1h' | '4h' | '1wk' = '1d',
  range: '1mo' | '3mo' | '6mo' | '1y' = '3mo'
): Promise<CandleData[]> {
  if (isDemoMode()) {
    const price = DEMO_PRICES.find(p => p.symbol === symbol);
    return generateCandleData(symbol, price?.price || 100, 60);
  }

  try {
    const yahooSymbol = toYahooSymbol(symbol, market);
    const res = await fetch(
      `${YAHOO_CHART_URL}/${yahooSymbol}?interval=${interval}&range=${range}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];
    if (!quote) return [];

    return timestamps.map((ts, i) => ({
      timestamp: new Date(ts * 1000).toISOString(),
      open: quote.open?.[i] ?? 0,
      high: quote.high?.[i] ?? 0,
      low: quote.low?.[i] ?? 0,
      close: quote.close?.[i] ?? 0,
      volume: quote.volume?.[i] ?? 0,
    })).filter(c => c.close > 0);
  } catch (err) {
    console.error('fetchCandles error:', err);
    return [];
  }
}

/**
 * Fetch multiple quotes in one request
 */
export async function fetchQuotes(
  symbols: Array<{ symbol: string; market: string }>
): Promise<MarketPrice[]> {
  if (isDemoMode()) {
    return DEMO_PRICES.filter(p => symbols.some(s => s.symbol === p.symbol));
  }

  const results = await Promise.all(
    symbols.map(s => fetchQuote(s.symbol, s.market))
  );
  return results.filter((r): r is MarketPrice => r !== null);
}
