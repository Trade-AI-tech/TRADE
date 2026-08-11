-- ============================================
-- Trading System Schema (idempotent, non-destructive)
--
-- ปลอดภัยที่จะรันซ้ำ — ทุก CREATE เป็น IF NOT EXISTS
-- ⚠ ห้ามใส่ DROP TABLE ของตารางฝั่งเทรด (watchlist / signals / trades /
--   telegram_alerts / market_prices / news) ลงในไฟล์นี้เด็ดขาด
--   `supabase db push` หรือ `db reset` จะรันไฟล์นี้ซ้ำ แล้วลบข้อมูลผู้ใช้ทิ้งทั้งหมด
--   ถ้าต้องเปลี่ยนโครงสร้างตาราง ให้เขียน migration ใหม่เป็น ALTER TABLE แทน
-- ============================================

-- ตารางยุค TikTok Ads — ไม่มีข้อมูลฝั่งเทรด ลบทิ้งได้ปลอดภัย
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS ai_insights CASCADE;
DROP TABLE IF EXISTS budget_allocations CASCADE;
DROP TABLE IF EXISTS daily_metrics CASCADE;
DROP TABLE IF EXISTS ads CASCADE;
DROP TABLE IF EXISTS ad_groups CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS tiktok_accounts CASCADE;
DROP FUNCTION IF EXISTS get_campaign_summary CASCADE;

-- ฟังก์ชันไม่เก็บข้อมูล ลบก่อนสร้างใหม่ได้ (จำเป็นเมื่อ return type เปลี่ยน)
DROP FUNCTION IF EXISTS get_portfolio_stats CASCADE;

-- ============================================
-- Profiles (create if missing, then ensure columns)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  avatar_url text,
  timezone text DEFAULT 'Asia/Bangkok',
  currency text DEFAULT 'USD',
  telegram_chat_id text,
  telegram_bot_token text,
  telegram_enabled boolean DEFAULT false,
  alert_preferences jsonb DEFAULT '{"buy_signals":true,"sell_signals":true,"stop_loss_hit":true,"take_profit_hit":true,"news_alerts":true}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure new columns exist if profiles already existed
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS telegram_bot_token text,
  ADD COLUMN IF NOT EXISTS telegram_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_preferences jsonb DEFAULT '{"buy_signals":true,"sell_signals":true,"stop_loss_hit":true,"take_profit_hit":true,"news_alerts":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Bangkok',
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';

-- ============================================
-- Watchlist
-- ============================================
CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol text NOT NULL,
  name text NOT NULL,
  market text NOT NULL CHECK (market IN ('GOLD', 'FOREX', 'TH_STOCK', 'US_STOCK', 'CRYPTO')),
  exchange text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id) WHERE is_active = true;

-- ============================================
-- Signals
-- ============================================
CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol text NOT NULL,
  name text NOT NULL,
  market text NOT NULL,
  action text NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD', 'CLOSE')),
  strength text NOT NULL CHECK (strength IN ('weak', 'moderate', 'strong', 'very_strong')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'expired', 'cancelled')),
  entry_price numeric NOT NULL,
  stop_loss numeric NOT NULL,
  take_profit numeric NOT NULL,
  current_price numeric NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  timeframe text NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  indicators jsonb NOT NULL DEFAULT '{}'::jsonb,
  news_sentiment numeric,
  telegram_sent boolean DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_user_created ON signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);

-- ============================================
-- Trades
-- ============================================
CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  signal_id uuid REFERENCES signals(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  name text NOT NULL,
  market text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  entry_price numeric NOT NULL,
  exit_price numeric,
  stop_loss numeric,
  take_profit numeric,
  quantity numeric NOT NULL,
  pnl numeric DEFAULT 0,
  pnl_percent numeric DEFAULT 0,
  fees numeric DEFAULT 0,
  notes text,
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_user_created ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);

-- ============================================
-- News
-- ============================================
CREATE TABLE IF NOT EXISTS news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  source text,
  url text,
  published_at timestamptz NOT NULL,
  symbols text[] DEFAULT '{}',
  sentiment text CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  sentiment_score numeric,
  impact text CHECK (impact IN ('info', 'warning', 'critical', 'success')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_published ON news(published_at DESC);

-- ============================================
-- Market prices cache
-- ============================================
CREATE TABLE IF NOT EXISTS market_prices (
  symbol text PRIMARY KEY,
  name text NOT NULL,
  market text NOT NULL,
  price numeric NOT NULL,
  change numeric,
  change_percent numeric,
  volume bigint,
  high_24h numeric,
  low_24h numeric,
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- Telegram alerts log
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  signal_id uuid REFERENCES signals(id) ON DELETE SET NULL,
  message text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  success boolean DEFAULT true,
  error text
);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "Users manage own profile" ON profiles;
CREATE POLICY "Users manage own profile" ON profiles FOR ALL USING (auth.uid() = id);

-- Watchlist
DROP POLICY IF EXISTS "Users manage own watchlist" ON watchlist;
CREATE POLICY "Users manage own watchlist" ON watchlist FOR ALL USING (auth.uid() = user_id);

-- Signals
DROP POLICY IF EXISTS "Users read own signals" ON signals;
CREATE POLICY "Users read own signals" ON signals FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own signals" ON signals;
CREATE POLICY "Users insert own signals" ON signals FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own signals" ON signals;
CREATE POLICY "Users update own signals" ON signals FOR UPDATE USING (auth.uid() = user_id);

-- Trades
DROP POLICY IF EXISTS "Users manage own trades" ON trades;
CREATE POLICY "Users manage own trades" ON trades FOR ALL USING (auth.uid() = user_id);

-- Telegram alerts
DROP POLICY IF EXISTS "Users read own alerts" ON telegram_alerts;
CREATE POLICY "Users read own alerts" ON telegram_alerts FOR SELECT USING (auth.uid() = user_id);

-- News & market_prices (public read)
DROP POLICY IF EXISTS "Public read news" ON news;
CREATE POLICY "Public read news" ON news FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read prices" ON market_prices;
CREATE POLICY "Public read prices" ON market_prices FOR SELECT USING (true);

-- ============================================
-- Trigger: auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- RPC: Portfolio summary
-- ============================================
CREATE OR REPLACE FUNCTION get_portfolio_stats(p_user_id uuid)
RETURNS TABLE (
  total_trades bigint,
  open_trades bigint,
  closed_trades bigint,
  total_pnl numeric,
  win_rate numeric,
  active_signals bigint,
  signals_today bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM trades WHERE user_id = p_user_id),
    (SELECT count(*) FROM trades WHERE user_id = p_user_id AND status = 'open'),
    (SELECT count(*) FROM trades WHERE user_id = p_user_id AND status = 'closed'),
    COALESCE((SELECT sum(pnl) FROM trades WHERE user_id = p_user_id AND status = 'closed'), 0),
    COALESCE((
      SELECT (count(*) FILTER (WHERE pnl > 0))::numeric * 100 / NULLIF(count(*), 0)
      FROM trades WHERE user_id = p_user_id AND status = 'closed'
    ), 0),
    (SELECT count(*) FROM signals WHERE user_id = p_user_id AND status = 'active'),
    (SELECT count(*) FROM signals WHERE user_id = p_user_id AND created_at >= current_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
