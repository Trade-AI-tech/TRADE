import type {
  Watchlist,
  MarketPrice,
  Signal,
  Trade,
  NewsItem,
  DashboardStats,
  CandleData,
  AIAnalysis,
} from '@/types';

function seededValue(seed: number): number {
  return ((Math.sin(seed * 9301 + 49297) % 1) + 1) % 1;
}

// ============================================
// Watchlist - ทุกตลาด
// ============================================

export const DEMO_WATCHLIST: Watchlist[] = [
  { id: 'w1', user_id: 'demo', symbol: 'XAUUSD', name: 'ทองคำ (Gold Spot)', market: 'GOLD', exchange: 'OTC', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w2', user_id: 'demo', symbol: 'EURUSD', name: 'Euro / US Dollar', market: 'FOREX', exchange: 'OTC', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w3', user_id: 'demo', symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', market: 'FOREX', exchange: 'OTC', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w4', user_id: 'demo', symbol: 'GBPUSD', name: 'British Pound / US Dollar', market: 'FOREX', exchange: 'OTC', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w5', user_id: 'demo', symbol: 'USDTHB', name: 'US Dollar / Thai Baht', market: 'FOREX', exchange: 'OTC', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w6', user_id: 'demo', symbol: 'PTT.BK', name: 'ปตท.', market: 'TH_STOCK', exchange: 'SET', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w7', user_id: 'demo', symbol: 'KBANK.BK', name: 'ธนาคารกสิกรไทย', market: 'TH_STOCK', exchange: 'SET', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w8', user_id: 'demo', symbol: 'CPALL.BK', name: 'ซีพี ออลล์', market: 'TH_STOCK', exchange: 'SET', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w9', user_id: 'demo', symbol: 'AOT.BK', name: 'ท่าอากาศยานไทย', market: 'TH_STOCK', exchange: 'SET', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w10', user_id: 'demo', symbol: 'DELTA.BK', name: 'เดลต้า อีเลคโทรนิคส์', market: 'TH_STOCK', exchange: 'SET', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w11', user_id: 'demo', symbol: 'AAPL', name: 'Apple Inc.', market: 'US_STOCK', exchange: 'NASDAQ', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w12', user_id: 'demo', symbol: 'NVDA', name: 'NVIDIA Corp.', market: 'US_STOCK', exchange: 'NASDAQ', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w13', user_id: 'demo', symbol: 'TSLA', name: 'Tesla Inc.', market: 'US_STOCK', exchange: 'NASDAQ', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w14', user_id: 'demo', symbol: 'MSFT', name: 'Microsoft Corp.', market: 'US_STOCK', exchange: 'NASDAQ', is_active: true, created_at: '2025-06-01T00:00:00Z' },
  { id: 'w15', user_id: 'demo', symbol: 'GOOGL', name: 'Alphabet Inc.', market: 'US_STOCK', exchange: 'NASDAQ', is_active: true, created_at: '2025-06-01T00:00:00Z' },
];

// ============================================
// Market Prices
// ============================================

export const DEMO_PRICES: MarketPrice[] = [
  { symbol: 'XAUUSD', name: 'ทองคำ', market: 'GOLD', price: 2345.80, change: 18.40, change_percent: 0.79, volume: 125000, high_24h: 2358.20, low_24h: 2325.10, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'EURUSD', name: 'EUR/USD', market: 'FOREX', price: 1.0845, change: 0.0023, change_percent: 0.21, volume: 890000, high_24h: 1.0868, low_24h: 1.0820, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'USDJPY', name: 'USD/JPY', market: 'FOREX', price: 157.82, change: -0.45, change_percent: -0.28, volume: 720000, high_24h: 158.50, low_24h: 157.20, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'GBPUSD', name: 'GBP/USD', market: 'FOREX', price: 1.2745, change: 0.0034, change_percent: 0.27, volume: 540000, high_24h: 1.2780, low_24h: 1.2710, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'USDTHB', name: 'USD/THB', market: 'FOREX', price: 36.85, change: 0.12, change_percent: 0.33, volume: 210000, high_24h: 36.95, low_24h: 36.70, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'PTT.BK', name: 'ปตท.', market: 'TH_STOCK', price: 34.75, change: 0.50, change_percent: 1.46, volume: 25800000, high_24h: 35.00, low_24h: 34.25, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'KBANK.BK', name: 'ธนาคารกสิกรไทย', market: 'TH_STOCK', price: 128.50, change: -1.50, change_percent: -1.15, volume: 8500000, high_24h: 130.00, low_24h: 128.00, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'CPALL.BK', name: 'ซีพี ออลล์', market: 'TH_STOCK', price: 58.25, change: 0.75, change_percent: 1.30, volume: 15200000, high_24h: 58.50, low_24h: 57.50, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'AOT.BK', name: 'ท่าอากาศยานไทย', market: 'TH_STOCK', price: 62.50, change: 1.25, change_percent: 2.04, volume: 12400000, high_24h: 63.00, low_24h: 61.25, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'DELTA.BK', name: 'เดลต้า', market: 'TH_STOCK', price: 112.00, change: -2.50, change_percent: -2.18, volume: 6800000, high_24h: 115.00, low_24h: 111.50, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'AAPL', name: 'Apple', market: 'US_STOCK', price: 215.45, change: 3.25, change_percent: 1.53, volume: 68500000, high_24h: 216.80, low_24h: 212.30, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'NVDA', name: 'NVIDIA', market: 'US_STOCK', price: 128.35, change: 2.85, change_percent: 2.27, volume: 245000000, high_24h: 129.50, low_24h: 125.60, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'TSLA', name: 'Tesla', market: 'US_STOCK', price: 198.20, change: -4.50, change_percent: -2.22, volume: 95000000, high_24h: 204.00, low_24h: 197.50, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'MSFT', name: 'Microsoft', market: 'US_STOCK', price: 445.80, change: 1.20, change_percent: 0.27, volume: 18500000, high_24h: 447.50, low_24h: 444.00, updated_at: '2025-06-30T15:00:00Z' },
  { symbol: 'GOOGL', name: 'Google', market: 'US_STOCK', price: 178.65, change: 0.85, change_percent: 0.48, volume: 22000000, high_24h: 179.50, low_24h: 177.80, updated_at: '2025-06-30T15:00:00Z' },
];

// ============================================
// Signals
// ============================================

export const DEMO_SIGNALS: Signal[] = [
  {
    id: 's1', user_id: 'demo', symbol: 'XAUUSD', name: 'ทองคำ', market: 'GOLD',
    action: 'BUY', strength: 'strong', status: 'active',
    entry_price: 2345.80, stop_loss: 2325.00, take_profit: 2385.00, current_price: 2348.20,
    confidence: 85, timeframe: '4H',
    reasons: [
      { type: 'technical', label: 'RSI Oversold Bounce', detail: 'RSI(14) ขยับจาก 28 ขึ้นมาที่ 42 แสดงการกลับตัว', weight: 0.3 },
      { type: 'pattern', label: 'Bullish Engulfing', detail: 'แท่งเทียนเขียวครอบแท่งแดงก่อนหน้าที่แนวรับ 2325', weight: 0.25 },
      { type: 'technical', label: 'MA Cross', detail: 'EMA20 ตัดขึ้น MA50 ใน 4H timeframe', weight: 0.2 },
      { type: 'news', label: 'Dollar Weakness', detail: 'DXY ร่วงลงหลัง Fed ส่งสัญญาณลดดอกเบี้ย', weight: 0.25 },
    ],
    indicators: { rsi: 42, macd: 2.8, ma20: 2340, ma50: 2335 },
    news_sentiment: 0.65, telegram_sent: true,
    expires_at: '2025-07-02T00:00:00Z', created_at: '2025-06-30T10:00:00Z',
  },
  {
    id: 's2', user_id: 'demo', symbol: 'NVDA', name: 'NVIDIA', market: 'US_STOCK',
    action: 'BUY', strength: 'very_strong', status: 'active',
    entry_price: 128.35, stop_loss: 124.00, take_profit: 138.50, current_price: 128.95,
    confidence: 92, timeframe: '1D',
    reasons: [
      { type: 'technical', label: 'Breakout Volume', detail: 'ทะลุแนวต้าน 126 พร้อม volume สูงกว่าเฉลี่ย 2.3 เท่า', weight: 0.35 },
      { type: 'pattern', label: 'Cup & Handle', detail: 'แพทเทิร์น Cup and Handle สมบูรณ์ใน daily chart', weight: 0.25 },
      { type: 'news', label: 'AI Demand Surge', detail: 'ข่าว AI ยังคงหนุนดีมานด์ชิป H100/B100', weight: 0.25 },
      { type: 'technical', label: 'MACD Bullish Cross', detail: 'MACD ตัดขึ้น Signal Line พร้อม histogram เป็นบวก', weight: 0.15 },
    ],
    indicators: { rsi: 62, macd: 1.85, ma20: 125.8, ma50: 120.3 },
    news_sentiment: 0.78, telegram_sent: true,
    expires_at: '2025-07-07T00:00:00Z', created_at: '2025-06-30T09:30:00Z',
  },
  {
    id: 's3', user_id: 'demo', symbol: 'TSLA', name: 'Tesla', market: 'US_STOCK',
    action: 'SELL', strength: 'moderate', status: 'active',
    entry_price: 198.20, stop_loss: 205.00, take_profit: 185.00, current_price: 197.40,
    confidence: 72, timeframe: '1D',
    reasons: [
      { type: 'technical', label: 'Death Cross Warning', detail: 'MA50 ใกล้ตัดลง MA200 สัญญาณ bearish ยาว', weight: 0.3 },
      { type: 'pattern', label: 'Head & Shoulders', detail: 'กำลังสร้างรูปแบบ Head and Shoulders', weight: 0.25 },
      { type: 'news', label: 'Delivery Miss', detail: 'ยอดส่งมอบไตรมาสที่ผ่านมาต่ำกว่าคาด', weight: 0.25 },
      { type: 'technical', label: 'RSI Bearish Divergence', detail: 'ราคาทำ higher high แต่ RSI ทำ lower high', weight: 0.2 },
    ],
    indicators: { rsi: 48, macd: -0.85, ma20: 202.5, ma50: 208.3 },
    news_sentiment: -0.45, telegram_sent: true,
    expires_at: '2025-07-05T00:00:00Z', created_at: '2025-06-30T08:00:00Z',
  },
  {
    id: 's4', user_id: 'demo', symbol: 'EURUSD', name: 'EUR/USD', market: 'FOREX',
    action: 'BUY', strength: 'moderate', status: 'active',
    entry_price: 1.0845, stop_loss: 1.0810, take_profit: 1.0920, current_price: 1.0852,
    confidence: 68, timeframe: '4H',
    reasons: [
      { type: 'technical', label: 'Support Bounce', detail: 'เด้งขึ้นจากแนวรับ 1.0810 พร้อม pin bar', weight: 0.35 },
      { type: 'technical', label: 'Stochastic Cross', detail: 'Stochastic ตัดขึ้นจากโซน oversold', weight: 0.25 },
      { type: 'fundamental', label: 'ECB Hawkish', detail: 'ECB ส่งสัญญาณอาจขึ้นดอกเบี้ย', weight: 0.25 },
      { type: 'news', label: 'US Data Weak', detail: 'ตัวเลขเศรษฐกิจ US ต่ำกว่าคาด', weight: 0.15 },
    ],
    indicators: { rsi: 55, macd: 0.0012, ma20: 1.0830, ma50: 1.0815 },
    news_sentiment: 0.35, telegram_sent: true,
    expires_at: '2025-07-02T00:00:00Z', created_at: '2025-06-30T07:00:00Z',
  },
  {
    id: 's5', user_id: 'demo', symbol: 'PTT.BK', name: 'ปตท.', market: 'TH_STOCK',
    action: 'BUY', strength: 'strong', status: 'active',
    entry_price: 34.75, stop_loss: 33.50, take_profit: 37.50, current_price: 34.75,
    confidence: 80, timeframe: '1D',
    reasons: [
      { type: 'technical', label: 'Breakout แนวต้าน', detail: 'ทะลุแนวต้าน 34.50 ที่สร้างมานานกว่า 2 เดือน', weight: 0.3 },
      { type: 'fundamental', label: 'น้ำมันขึ้น', detail: 'ราคาน้ำมันดิบปรับตัวขึ้น หนุนกำไรของ PTT', weight: 0.25 },
      { type: 'technical', label: 'Volume Spike', detail: 'volume เข้าเพิ่มขึ้น 180% จากค่าเฉลี่ย', weight: 0.25 },
      { type: 'news', label: 'Dividend Announcement', detail: 'ประกาศจ่ายเงินปันผลเพิ่มเติม', weight: 0.2 },
    ],
    indicators: { rsi: 63, macd: 0.28, ma20: 34.20, ma50: 33.80 },
    news_sentiment: 0.55, telegram_sent: true,
    expires_at: '2025-07-14T00:00:00Z', created_at: '2025-06-30T06:30:00Z',
  },
  {
    id: 's6', user_id: 'demo', symbol: 'KBANK.BK', name: 'ธนาคารกสิกรไทย', market: 'TH_STOCK',
    action: 'HOLD', strength: 'weak', status: 'active',
    entry_price: 128.50, stop_loss: 125.00, take_profit: 135.00, current_price: 128.50,
    confidence: 55, timeframe: '1D',
    reasons: [
      { type: 'technical', label: 'ใกล้แนวรับ', detail: 'ราคากำลังทดสอบแนวรับสำคัญที่ 128 บาท', weight: 0.4 },
      { type: 'technical', label: 'RSI กลาง', detail: 'RSI อยู่ที่ 50 ยังไม่มีสัญญาณชัดเจน', weight: 0.3 },
      { type: 'fundamental', label: 'รอผลประกอบการ', detail: 'รอประกาศงบไตรมาส 2 ก่อนตัดสินใจ', weight: 0.3 },
    ],
    indicators: { rsi: 50, macd: -0.15, ma20: 129.2, ma50: 130.5 },
    news_sentiment: 0.1, telegram_sent: false,
    expires_at: '2025-07-07T00:00:00Z', created_at: '2025-06-30T06:00:00Z',
  },
  {
    id: 's7', user_id: 'demo', symbol: 'USDJPY', name: 'USD/JPY', market: 'FOREX',
    action: 'SELL', strength: 'strong', status: 'active',
    entry_price: 157.82, stop_loss: 158.80, take_profit: 155.50, current_price: 157.40,
    confidence: 82, timeframe: '4H',
    reasons: [
      { type: 'technical', label: 'Rejection แนวต้าน', detail: 'ถูกปฏิเสธที่แนวต้าน 158.50 พร้อม shooting star', weight: 0.3 },
      { type: 'fundamental', label: 'BOJ Intervention Risk', detail: 'BOJ ขู่จะแทรกแซงค่าเงินเยน', weight: 0.35 },
      { type: 'technical', label: 'Overbought', detail: 'RSI เข้าโซน overbought ที่ 72', weight: 0.2 },
      { type: 'pattern', label: 'Double Top', detail: 'สร้างรูปแบบ Double Top ที่ 158.50', weight: 0.15 },
    ],
    indicators: { rsi: 72, macd: 0.35, ma20: 158.1, ma50: 157.5 },
    news_sentiment: -0.55, telegram_sent: true,
    expires_at: '2025-07-02T00:00:00Z', created_at: '2025-06-30T05:00:00Z',
  },
  {
    id: 's8', user_id: 'demo', symbol: 'AAPL', name: 'Apple', market: 'US_STOCK',
    action: 'BUY', strength: 'moderate', status: 'triggered',
    entry_price: 212.50, stop_loss: 208.00, take_profit: 220.00, current_price: 215.45,
    confidence: 70, timeframe: '1D',
    reasons: [
      { type: 'technical', label: 'Support Hold', detail: 'ยืนเหนือแนวรับ 210 ได้แข็งแรง', weight: 0.3 },
      { type: 'news', label: 'iPhone 16 Demand', detail: 'คาดการณ์ความต้องการ iPhone 16 สูง', weight: 0.35 },
      { type: 'technical', label: 'Golden Cross', detail: 'MA50 ตัดขึ้น MA200', weight: 0.35 },
    ],
    indicators: { rsi: 58, macd: 1.25, ma20: 213.2, ma50: 210.8 },
    news_sentiment: 0.48, telegram_sent: true,
    expires_at: null, created_at: '2025-06-29T14:00:00Z',
  },
];

// ============================================
// Trade History
// ============================================

export const DEMO_TRADES: Trade[] = [
  {
    id: 't1', user_id: 'demo', signal_id: 's8',
    symbol: 'AAPL', name: 'Apple', market: 'US_STOCK',
    direction: 'long', status: 'open',
    entry_price: 212.50, exit_price: null, stop_loss: 208.00, take_profit: 220.00,
    quantity: 10, pnl: 29.50, pnl_percent: 1.39, fees: 0,
    notes: 'Entry ที่ support ตาม AI signal',
    opened_at: '2025-06-29T14:30:00Z', closed_at: null,
    created_at: '2025-06-29T14:30:00Z',
  },
  {
    id: 't2', user_id: 'demo', signal_id: null,
    symbol: 'XAUUSD', name: 'ทองคำ', market: 'GOLD',
    direction: 'long', status: 'closed',
    entry_price: 2280.00, exit_price: 2325.00, stop_loss: 2260.00, take_profit: 2320.00,
    quantity: 1, pnl: 45.00, pnl_percent: 1.97, fees: 0,
    notes: 'TP hit เร็วกว่าคาด',
    opened_at: '2025-06-20T09:00:00Z', closed_at: '2025-06-25T16:30:00Z',
    created_at: '2025-06-20T09:00:00Z',
  },
  {
    id: 't3', user_id: 'demo', signal_id: null,
    symbol: 'TSLA', name: 'Tesla', market: 'US_STOCK',
    direction: 'short', status: 'closed',
    entry_price: 220.00, exit_price: 210.00, stop_loss: 228.00, take_profit: 205.00,
    quantity: 5, pnl: 50.00, pnl_percent: 4.55, fees: 0,
    notes: 'ชอร์ตหลัง earnings miss',
    opened_at: '2025-06-15T15:00:00Z', closed_at: '2025-06-22T10:00:00Z',
    created_at: '2025-06-15T15:00:00Z',
  },
  {
    id: 't4', user_id: 'demo', signal_id: null,
    symbol: 'EURUSD', name: 'EUR/USD', market: 'FOREX',
    direction: 'long', status: 'closed',
    entry_price: 1.0780, exit_price: 1.0750, stop_loss: 1.0750, take_profit: 1.0850,
    quantity: 10000, pnl: -30.00, pnl_percent: -0.28, fees: 0,
    notes: 'SL ตัดเสียตามแผน',
    opened_at: '2025-06-10T08:00:00Z', closed_at: '2025-06-12T14:00:00Z',
    created_at: '2025-06-10T08:00:00Z',
  },
  {
    id: 't5', user_id: 'demo', signal_id: null,
    symbol: 'PTT.BK', name: 'ปตท.', market: 'TH_STOCK',
    direction: 'long', status: 'closed',
    entry_price: 33.50, exit_price: 34.75, stop_loss: 32.50, take_profit: 35.00,
    quantity: 1000, pnl: 1250.00, pnl_percent: 3.73, fees: 0,
    notes: 'เข้าที่แนวรับ ออกใกล้ TP',
    opened_at: '2025-06-05T10:30:00Z', closed_at: '2025-06-28T15:00:00Z',
    created_at: '2025-06-05T10:30:00Z',
  },
  {
    id: 't6', user_id: 'demo', signal_id: null,
    symbol: 'NVDA', name: 'NVIDIA', market: 'US_STOCK',
    direction: 'long', status: 'closed',
    entry_price: 118.00, exit_price: 126.50, stop_loss: 114.00, take_profit: 128.00,
    quantity: 20, pnl: 170.00, pnl_percent: 7.20, fees: 0,
    notes: 'Ride the AI trend',
    opened_at: '2025-06-08T14:00:00Z', closed_at: '2025-06-26T11:00:00Z',
    created_at: '2025-06-08T14:00:00Z',
  },
];

// ============================================
// News
// ============================================

export const DEMO_NEWS: NewsItem[] = [
  {
    id: 'n1',
    title: 'Fed ส่งสัญญาณลดดอกเบี้ยในไตรมาส 3 หนุนทองคำพุ่ง',
    summary: 'ประธาน Fed เผยว่ามีความเป็นไปได้ที่จะลดดอกเบี้ย 2 ครั้งในปีนี้ ส่งผลให้ dollar อ่อนตัวและทองคำปรับตัวขึ้น',
    source: 'Reuters', url: 'https://example.com/news/1',
    published_at: '2025-06-30T13:30:00Z',
    symbols: ['XAUUSD', 'EURUSD', 'DXY'],
    sentiment: 'bullish', sentiment_score: 0.72, impact: 'warning',
    created_at: '2025-06-30T13:30:00Z',
  },
  {
    id: 'n2',
    title: 'NVIDIA เปิดตัวชิป B200 รุ่นใหม่ ยอดสั่งซื้อทะลุคาด',
    summary: 'NVIDIA ประกาศเปิดตัวชิป AI รุ่นใหม่ B200 พร้อมเผยว่ายอดสั่งซื้อล่วงหน้าสูงกว่าที่คาดการณ์ 30%',
    source: 'Bloomberg', url: 'https://example.com/news/2',
    published_at: '2025-06-30T10:15:00Z',
    symbols: ['NVDA', 'AMD', 'TSM'],
    sentiment: 'bullish', sentiment_score: 0.85, impact: 'critical',
    created_at: '2025-06-30T10:15:00Z',
  },
  {
    id: 'n3',
    title: 'Tesla ยอดส่งมอบไตรมาส 2 ต่ำกว่าคาด 8%',
    summary: 'Tesla รายงานยอดส่งมอบรถยนต์ไฟฟ้า 423,000 คัน ต่ำกว่าที่นักวิเคราะห์คาดไว้ 460,000 คัน',
    source: 'CNBC', url: 'https://example.com/news/3',
    published_at: '2025-06-30T08:00:00Z',
    symbols: ['TSLA'],
    sentiment: 'bearish', sentiment_score: -0.65, impact: 'warning',
    created_at: '2025-06-30T08:00:00Z',
  },
  {
    id: 'n4',
    title: 'SET Index ปิดบวก 15 จุด รับแรงซื้อหุ้นพลังงาน',
    summary: 'ดัชนี SET ปิดที่ 1,385 จุด ปรับตัวเพิ่มขึ้น 15 จุด หรือ 1.09% โดยหุ้นกลุ่มพลังงานนำตลาด',
    source: 'ไทยรัฐ', url: 'https://example.com/news/4',
    published_at: '2025-06-30T16:30:00Z',
    symbols: ['PTT.BK', 'PTTEP.BK', 'BANPU.BK'],
    sentiment: 'bullish', sentiment_score: 0.45, impact: 'info',
    created_at: '2025-06-30T16:30:00Z',
  },
  {
    id: 'n5',
    title: 'BOJ ขู่แทรกแซงค่าเงินเยน หลังอ่อนค่าต่อเนื่อง',
    summary: 'กระทรวงการคลังญี่ปุ่นส่งสัญญาณอาจแทรกแซงตลาด หลังเงินเยนอ่อนค่าทะลุ 158 ต่อดอลลาร์',
    source: 'Nikkei', url: 'https://example.com/news/5',
    published_at: '2025-06-30T05:45:00Z',
    symbols: ['USDJPY', 'EURJPY'],
    sentiment: 'bearish', sentiment_score: -0.58, impact: 'warning',
    created_at: '2025-06-30T05:45:00Z',
  },
  {
    id: 'n6',
    title: 'Apple เตรียมเปิดตัว iPhone 16 กันยายนนี้ ตลาดจับตา',
    summary: 'Apple เตรียมจัดอีเวนท์ใหญ่เดือนกันยายน คาดเปิดตัว iPhone 16 พร้อมฟีเจอร์ AI ใหม่',
    source: 'Wall Street Journal', url: 'https://example.com/news/6',
    published_at: '2025-06-29T22:00:00Z',
    symbols: ['AAPL'],
    sentiment: 'bullish', sentiment_score: 0.55, impact: 'info',
    created_at: '2025-06-29T22:00:00Z',
  },
  {
    id: 'n7',
    title: 'เงินบาทอ่อนค่าแตะ 36.85 บาท/ดอลลาร์',
    summary: 'เงินบาทปิดตลาดที่ 36.85 บาท/ดอลลาร์ อ่อนค่าลงจากการไหลออกของเงินทุนต่างชาติ',
    source: 'Bangkok Post', url: 'https://example.com/news/7',
    published_at: '2025-06-30T17:00:00Z',
    symbols: ['USDTHB'],
    sentiment: 'neutral', sentiment_score: -0.15, impact: 'info',
    created_at: '2025-06-30T17:00:00Z',
  },
  {
    id: 'n8',
    title: 'ราคาน้ำมันดิบพุ่ง 3% รับตึงเครียดตะวันออกกลาง',
    summary: 'ราคาน้ำมัน Brent ปรับตัวขึ้นแตะ $86 ต่อบาร์เรล จากความกังวลการจัดส่งในตะวันออกกลาง',
    source: 'Reuters', url: 'https://example.com/news/8',
    published_at: '2025-06-30T12:00:00Z',
    symbols: ['CL', 'PTT.BK', 'PTTEP.BK', 'XOM'],
    sentiment: 'bullish', sentiment_score: 0.62, impact: 'warning',
    created_at: '2025-06-30T12:00:00Z',
  },
];

// ============================================
// Dashboard Stats
// ============================================

export const DEMO_DASHBOARD_STATS: DashboardStats = {
  total_signals_today: 7,
  active_signals: 6,
  success_rate: 68.5,
  total_trades: 6,
  open_trades: 1,
  total_pnl: 1514.50,
  total_pnl_percent: 12.4,
  win_rate: 80.0,
  best_performer: 'NVDA',
  worst_performer: 'EURUSD',
};

// ============================================
// Candle Chart Data
// ============================================

export function generateCandleData(symbol: string, basePrice: number, count: number = 60): CandleData[] {
  const result: CandleData[] = [];
  let price = basePrice;
  const volatility = basePrice * 0.015;

  for (let i = 0; i < count; i++) {
    const seed = symbol.charCodeAt(0) + i;
    const r1 = seededValue(seed * 1);
    const r2 = seededValue(seed * 3);
    const r3 = seededValue(seed * 7);
    const r4 = seededValue(seed * 11);

    const open = price;
    const trend = Math.sin(i / 8) * volatility * 0.5;
    const noise = (r1 - 0.5) * volatility;
    const close = open + trend + noise;
    const high = Math.max(open, close) + r2 * volatility * 0.5;
    const low = Math.min(open, close) - r3 * volatility * 0.5;
    const volume = Math.floor(100000 + r4 * 500000);

    const date = new Date(Date.UTC(2025, 4, 1) + i * 86400000);

    result.push({
      timestamp: date.toISOString(),
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume,
    });

    price = close;
  }

  return result;
}

// ============================================
// AI Analysis
// ============================================

export function getDemoAIAnalysis(symbol: string): AIAnalysis {
  const price = DEMO_PRICES.find(p => p.symbol === symbol);
  const basePrice = price?.price || 100;

  return {
    id: `ai-${symbol}`,
    symbol,
    timeframe: '1D',
    trend: 'uptrend',
    support: [basePrice * 0.97, basePrice * 0.95, basePrice * 0.92],
    resistance: [basePrice * 1.03, basePrice * 1.05, basePrice * 1.08],
    patterns: ['Cup & Handle', 'Higher Highs & Higher Lows'],
    indicators: {
      rsi: 62,
      macd: { value: 1.25, signal: 1.10, histogram: 0.15 },
      ma20: basePrice * 0.99,
      ma50: basePrice * 0.97,
      ma200: basePrice * 0.93,
      bb_upper: basePrice * 1.04,
      bb_middle: basePrice * 0.99,
      bb_lower: basePrice * 0.94,
    },
    summary: `${symbol} อยู่ในเทรนด์ขาขึ้น โดย MA20 > MA50 > MA200 สนับสนุนแนวโน้ม Bullish ราคาทะลุแนวต้านสำคัญที่ ${(basePrice * 1.02).toFixed(2)} พร้อม volume ที่สูงกว่าเฉลี่ย RSI อยู่ที่ 62 ยังไม่ overbought`,
    recommendation: 'BUY',
    confidence: 78,
    created_at: '2025-06-30T15:00:00Z',
  };
}

// ============================================
// Equity curve for Dashboard
// ============================================

export function generateEquityCurve(): { date: string; value: number }[] {
  let value = 10000;
  return Array.from({ length: 30 }, (_, i) => {
    const r = seededValue(i * 5);
    const change = (r - 0.4) * 200;
    value = Math.max(9000, value + change);
    const date = new Date(Date.UTC(2025, 5, 1) + i * 86400000);
    return {
      date: date.toISOString().slice(0, 10),
      value: Math.round(value),
    };
  });
}
