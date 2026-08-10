// ============================================
// Trading System Types
// ============================================

export type MarketType = 'GOLD' | 'FOREX' | 'TH_STOCK' | 'US_STOCK' | 'CRYPTO';
export type SignalAction = 'BUY' | 'SELL' | 'HOLD' | 'CLOSE';
export type SignalStrength = 'weak' | 'moderate' | 'strong' | 'very_strong';
export type SignalStatus = 'active' | 'triggered' | 'expired' | 'cancelled';
export type TradeStatus = 'open' | 'closed' | 'cancelled';
export type TradeDirection = 'long' | 'short';
export type Severity = 'info' | 'warning' | 'critical' | 'success';

// ============================================
// Database Models
// ============================================

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
  currency: string;
  telegram_chat_id: string | null;
  telegram_bot_token: string | null;
  telegram_enabled: boolean;
  alert_preferences: AlertPreferences;
  created_at: string;
  updated_at: string;
}

export interface AlertPreferences {
  buy_signals: boolean;
  sell_signals: boolean;
  stop_loss_hit: boolean;
  take_profit_hit: boolean;
  news_alerts: boolean;
  strong_signals_only?: boolean;
}

export interface Watchlist {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  market: MarketType;
  exchange: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MarketPrice {
  symbol: string;
  name: string;
  market: MarketType;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  high_24h: number;
  low_24h: number;
  updated_at: string;
}

export interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  market: MarketType;
  action: SignalAction;
  strength: SignalStrength;
  status: SignalStatus;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  current_price: number;
  confidence: number;
  timeframe: string;
  reasons: SignalReason[];
  indicators: Record<string, number>;
  news_sentiment: number | null;
  telegram_sent: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface SignalReason {
  type: 'technical' | 'news' | 'pattern' | 'fundamental';
  label: string;
  detail: string;
  weight: number;
}

export interface Trade {
  id: string;
  user_id: string;
  signal_id: string | null;
  symbol: string;
  name: string;
  market: MarketType;
  direction: TradeDirection;
  status: TradeStatus;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  quantity: number;
  pnl: number;
  pnl_percent: number;
  fees: number;
  notes: string | null;
  // ชื่อคอลัมน์ต้องตรงกับ DB (opened_at / closed_at) ไม่ใช่ entered_at / exited_at
  opened_at: string;
  closed_at: string | null;
  created_at: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  published_at: string;
  symbols: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentiment_score: number;
  impact: Severity;
  created_at: string;
}

export interface AIAnalysis {
  id: string;
  symbol: string;
  timeframe: string;
  trend: 'uptrend' | 'downtrend' | 'sideways';
  support: number[];
  resistance: number[];
  patterns: string[];
  indicators: {
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    ma20: number;
    ma50: number;
    ma200: number;
    bb_upper: number;
    bb_middle: number;
    bb_lower: number;
  };
  summary: string;
  recommendation: SignalAction;
  confidence: number;
  created_at: string;
}

export interface TelegramConfig {
  bot_token: string | null;
  chat_id: string | null;
  enabled: boolean;
  alert_types: {
    buy_signals: boolean;
    sell_signals: boolean;
    stop_loss_hit: boolean;
    take_profit_hit: boolean;
    news_alerts: boolean;
  };
}

// ============================================
// UI / API Types
// ============================================

export interface DashboardStats {
  total_signals_today: number;
  active_signals: number;
  success_rate: number;
  total_trades: number;
  open_trades: number;
  total_pnl: number;
  total_pnl_percent: number;
  win_rate: number;
  best_performer: string;
  worst_performer: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}
