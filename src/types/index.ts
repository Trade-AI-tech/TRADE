// ============================================
// Core Types
// ============================================

export type CampaignObjective =
  | 'REACH' | 'TRAFFIC' | 'VIDEO_VIEWS' | 'LEAD_GENERATION'
  | 'COMMUNITY_INTERACTION' | 'APP_PROMOTION' | 'WEBSITE_CONVERSIONS'
  | 'PRODUCT_SALES' | 'CATALOG_SALES';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';
export type BudgetMode = 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
export type InsightType =
  | 'BUDGET_OPTIMIZATION' | 'PERFORMANCE_ALERT' | 'TREND_PREDICTION'
  | 'CREATIVE_ANALYSIS' | 'AUDIENCE_INSIGHT' | 'ANOMALY_DETECTION'
  | 'COMPETITOR_INSIGHT' | 'ACTION_RECOMMENDATION';
export type Severity = 'info' | 'warning' | 'critical' | 'success';

// ============================================
// Database Models
// ============================================

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  company_name: string | null;
  timezone: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface TikTokAccount {
  id: string;
  user_id: string;
  advertiser_id: string;
  advertiser_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: 'active' | 'paused' | 'revoked';
  last_synced_at: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  tiktok_account_id: string | null;
  tiktok_campaign_id: string | null;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  budget_mode: BudgetMode;
  budget: number;
  spent: number;
  start_date: string | null;
  end_date: string | null;
  tags: string[];
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AdGroup {
  id: string;
  campaign_id: string;
  user_id: string;
  tiktok_adgroup_id: string | null;
  name: string;
  status: string;
  placement_type: string;
  bid_strategy: string;
  bid_amount: number | null;
  budget: number;
  targeting: Record<string, unknown>;
  schedule: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Ad {
  id: string;
  ad_group_id: string;
  campaign_id: string;
  user_id: string;
  tiktok_ad_id: string | null;
  name: string;
  status: string;
  format: string;
  creative_url: string | null;
  thumbnail_url: string | null;
  call_to_action: string | null;
  landing_page_url: string | null;
  creative_score: number | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DailyMetrics {
  id: string;
  user_id: string;
  campaign_id: string | null;
  ad_group_id: string | null;
  ad_id: string | null;
  date: string;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  spend: number;
  cpm: number;
  cpc: number;
  ctr: number;
  conversions: number;
  conversion_rate: number;
  cost_per_conversion: number;
  conversion_value: number;
  roas: number;
  video_views: number;
  video_views_p25: number;
  video_views_p50: number;
  video_views_p75: number;
  video_views_p100: number;
  avg_watch_time: number;
  likes: number;
  comments: number;
  shares: number;
  follows: number;
  profile_visits: number;
  created_at: string;
}

export interface AIInsight {
  id: string;
  user_id: string;
  campaign_id: string | null;
  type: InsightType;
  severity: Severity;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  recommendations: AIRecommendation[];
  confidence: number;
  is_read: boolean;
  is_actioned: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface AIRecommendation {
  action: string;
  description: string;
  expected_impact: string;
  priority: 'high' | 'medium' | 'low';
}

export interface BudgetAllocation {
  id: string;
  user_id: string;
  campaign_id: string;
  period_start: string;
  period_end: string;
  allocated_budget: number;
  spent_budget: number;
  ai_recommended_budget: number | null;
  ai_recommendation_reason: string | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}

// ============================================
// API & UI Types
// ============================================

export interface CampaignSummary {
  campaign_id: string;
  campaign_name: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_roas: number;
  total_revenue: number;
}

export interface DashboardStats {
  total_spend: number;
  total_revenue: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_roas: number;
  spend_change: number;
  revenue_change: number;
  active_campaigns: number;
}

export interface AIAnalysisRequest {
  type: 'budget' | 'performance' | 'creative' | 'audience' | 'full';
  campaign_ids?: string[];
  date_range?: { start: string; end: string };
  metrics?: DailyMetrics[];
  campaigns?: Campaign[];
}

export interface AIAnalysisResponse {
  insights: AIInsight[];
  summary: string;
  score: number;
  recommendations: AIRecommendation[];
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface MetricCard {
  label: string;
  value: number | string;
  change: number;
  format: 'currency' | 'number' | 'percent' | 'decimal';
  trend: 'up' | 'down' | 'flat';
  icon?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}
