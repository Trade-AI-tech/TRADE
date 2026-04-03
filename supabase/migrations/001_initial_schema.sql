-- ============================================
-- TikTok Ads AI Manager - Database Schema
-- ============================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================
-- USERS & ACCOUNTS
-- ============================================

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  company_name text,
  timezone text default 'Asia/Bangkok',
  currency text default 'THB',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.tiktok_accounts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  advertiser_id text not null,
  advertiser_name text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  status text default 'active' check (status in ('active', 'paused', 'revoked')),
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, advertiser_id)
);

-- ============================================
-- CAMPAIGNS & ADS
-- ============================================

create table public.campaigns (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  tiktok_account_id uuid references public.tiktok_accounts(id) on delete cascade,
  tiktok_campaign_id text,
  name text not null,
  objective text not null check (objective in (
    'REACH', 'TRAFFIC', 'VIDEO_VIEWS', 'LEAD_GENERATION',
    'COMMUNITY_INTERACTION', 'APP_PROMOTION', 'WEBSITE_CONVERSIONS',
    'PRODUCT_SALES', 'CATALOG_SALES'
  )),
  status text default 'DRAFT' check (status in (
    'DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'
  )),
  budget_mode text default 'BUDGET_MODE_DAY' check (budget_mode in (
    'BUDGET_MODE_DAY', 'BUDGET_MODE_TOTAL'
  )),
  budget numeric(12,2) default 0,
  spent numeric(12,2) default 0,
  start_date date,
  end_date date,
  tags text[] default '{}',
  meta jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.ad_groups (
  id uuid default uuid_generate_v4() primary key,
  campaign_id uuid references public.campaigns(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  tiktok_adgroup_id text,
  name text not null,
  status text default 'ACTIVE',
  placement_type text default 'PLACEMENT_TYPE_AUTOMATIC',
  bid_strategy text default 'BID_TYPE_NO_BID',
  bid_amount numeric(12,2),
  budget numeric(12,2) default 0,
  targeting jsonb default '{}',
  schedule jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.ads (
  id uuid default uuid_generate_v4() primary key,
  ad_group_id uuid references public.ad_groups(id) on delete cascade not null,
  campaign_id uuid references public.campaigns(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  tiktok_ad_id text,
  name text not null,
  status text default 'ACTIVE',
  format text default 'SINGLE_VIDEO',
  creative_url text,
  thumbnail_url text,
  call_to_action text,
  landing_page_url text,
  creative_score numeric(5,2),
  meta jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- METRICS & ANALYTICS
-- ============================================

create table public.daily_metrics (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  ad_group_id uuid references public.ad_groups(id) on delete cascade,
  ad_id uuid references public.ads(id) on delete cascade,
  date date not null,
  -- Core metrics
  impressions bigint default 0,
  clicks bigint default 0,
  reach bigint default 0,
  frequency numeric(8,4) default 0,
  -- Cost metrics
  spend numeric(12,2) default 0,
  cpm numeric(12,4) default 0,
  cpc numeric(12,4) default 0,
  ctr numeric(8,4) default 0,
  -- Conversion metrics
  conversions bigint default 0,
  conversion_rate numeric(8,4) default 0,
  cost_per_conversion numeric(12,4) default 0,
  conversion_value numeric(14,2) default 0,
  roas numeric(10,4) default 0,
  -- Video metrics
  video_views bigint default 0,
  video_views_p25 bigint default 0,
  video_views_p50 bigint default 0,
  video_views_p75 bigint default 0,
  video_views_p100 bigint default 0,
  avg_watch_time numeric(10,2) default 0,
  -- Engagement
  likes bigint default 0,
  comments bigint default 0,
  shares bigint default 0,
  follows bigint default 0,
  profile_visits bigint default 0,
  created_at timestamptz default now(),
  unique(campaign_id, ad_group_id, ad_id, date)
);

create index idx_daily_metrics_date on public.daily_metrics(date desc);
create index idx_daily_metrics_campaign on public.daily_metrics(campaign_id, date desc);
create index idx_daily_metrics_user on public.daily_metrics(user_id, date desc);

-- ============================================
-- AI INSIGHTS
-- ============================================

create table public.ai_insights (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  type text not null check (type in (
    'BUDGET_OPTIMIZATION', 'PERFORMANCE_ALERT', 'TREND_PREDICTION',
    'CREATIVE_ANALYSIS', 'AUDIENCE_INSIGHT', 'ANOMALY_DETECTION',
    'COMPETITOR_INSIGHT', 'ACTION_RECOMMENDATION'
  )),
  severity text default 'info' check (severity in ('info', 'warning', 'critical', 'success')),
  title text not null,
  summary text not null,
  details jsonb default '{}',
  recommendations jsonb default '[]',
  confidence numeric(5,2) check (confidence >= 0 and confidence <= 100),
  is_read boolean default false,
  is_actioned boolean default false,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create index idx_ai_insights_user on public.ai_insights(user_id, created_at desc);
create index idx_ai_insights_type on public.ai_insights(type, severity);

-- ============================================
-- BUDGET TRACKING
-- ============================================

create table public.budget_allocations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  campaign_id uuid references public.campaigns(id) on delete cascade not null,
  period_start date not null,
  period_end date not null,
  allocated_budget numeric(14,2) not null,
  spent_budget numeric(14,2) default 0,
  ai_recommended_budget numeric(14,2),
  ai_recommendation_reason text,
  status text default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz default now()
);

-- ============================================
-- AUDIT LOG
-- ============================================

create table public.audit_log (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  created_at timestamptz default now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.profiles enable row level security;
alter table public.tiktok_accounts enable row level security;
alter table public.campaigns enable row level security;
alter table public.ad_groups enable row level security;
alter table public.ads enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.ai_insights enable row level security;
alter table public.budget_allocations enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: users can read/update their own
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- TikTok accounts: users manage their own
create policy "Users manage own tiktok accounts" on public.tiktok_accounts
  for all using (auth.uid() = user_id);

-- Campaigns: users manage their own
create policy "Users manage own campaigns" on public.campaigns
  for all using (auth.uid() = user_id);

-- Ad groups
create policy "Users manage own ad groups" on public.ad_groups
  for all using (auth.uid() = user_id);

-- Ads
create policy "Users manage own ads" on public.ads
  for all using (auth.uid() = user_id);

-- Daily metrics
create policy "Users view own metrics" on public.daily_metrics
  for select using (auth.uid() = user_id);
create policy "System insert metrics" on public.daily_metrics
  for insert with check (auth.uid() = user_id);

-- AI Insights
create policy "Users manage own insights" on public.ai_insights
  for all using (auth.uid() = user_id);

-- Budget allocations
create policy "Users manage own budgets" on public.budget_allocations
  for all using (auth.uid() = user_id);

-- Audit log
create policy "Users view own audit log" on public.audit_log
  for select using (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Update timestamp trigger
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.update_updated_at();

create trigger update_ad_groups_updated_at
  before update on public.ad_groups
  for each row execute function public.update_updated_at();

create trigger update_ads_updated_at
  before update on public.ads
  for each row execute function public.update_updated_at();

-- Aggregate metrics function
create or replace function public.get_campaign_summary(
  p_user_id uuid,
  p_start_date date default current_date - interval '30 days',
  p_end_date date default current_date
)
returns table (
  campaign_id uuid,
  campaign_name text,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_conversions bigint,
  avg_ctr numeric,
  avg_cpc numeric,
  avg_roas numeric,
  total_revenue numeric
) as $$
begin
  return query
  select
    c.id as campaign_id,
    c.name as campaign_name,
    coalesce(sum(m.spend), 0) as total_spend,
    coalesce(sum(m.impressions), 0) as total_impressions,
    coalesce(sum(m.clicks), 0) as total_clicks,
    coalesce(sum(m.conversions), 0) as total_conversions,
    case when sum(m.impressions) > 0
      then round(sum(m.clicks)::numeric / sum(m.impressions) * 100, 4)
      else 0 end as avg_ctr,
    case when sum(m.clicks) > 0
      then round(sum(m.spend) / sum(m.clicks), 4)
      else 0 end as avg_cpc,
    case when sum(m.spend) > 0
      then round(sum(m.conversion_value) / sum(m.spend), 4)
      else 0 end as avg_roas,
    coalesce(sum(m.conversion_value), 0) as total_revenue
  from public.campaigns c
  left join public.daily_metrics m on m.campaign_id = c.id
    and m.date between p_start_date and p_end_date
    and m.ad_group_id is null
    and m.ad_id is null
  where c.user_id = p_user_id
  group by c.id, c.name
  order by total_spend desc;
end;
$$ language plpgsql security definer;
