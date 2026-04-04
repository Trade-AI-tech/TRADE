/**
 * Demo data for all pages when running without Supabase/TikTok API
 * ข้อมูลจำลองสำหรับทดสอบระบบ
 */

import type { Campaign, CampaignSummary, AIInsight, DashboardStats } from '@/types';

// ============================================
// Dashboard Stats
// ============================================

export const DEMO_STATS: DashboardStats = {
  total_spend: 245800,
  total_revenue: 892400,
  total_impressions: 3450000,
  total_clicks: 52300,
  total_conversions: 1847,
  avg_ctr: 1.52,
  avg_cpc: 4.7,
  avg_roas: 3.63,
  spend_change: 12.5,
  revenue_change: 23.1,
  active_campaigns: 8,
};

// ============================================
// Chart Data (30 days) - fixed values to avoid hydration mismatch
// ============================================

// Pre-generated deterministic data (no Math.random)
function seededValue(seed: number): number {
  return ((Math.sin(seed * 9301 + 49297) % 1) + 1) % 1;
}

export function generateChartData() {
  return Array.from({ length: 30 }, (_, i) => {
    const base = 8000 + Math.sin(i / 3) * 2000;
    const r1 = seededValue(i * 1);
    const r2 = seededValue(i * 2);
    const r3 = seededValue(i * 3);
    const r4 = seededValue(i * 4);
    const r5 = seededValue(i * 5);
    return {
      date: `${Math.floor(i / 30) + 3}/${(i % 30) + 1}`,
      spend: Math.round(base + r1 * 2000),
      revenue: Math.round(base * (2.5 + r2 * 2)),
      impressions: Math.round(base * 15 + r3 * 50000),
      clicks: Math.round(base * 0.7 + r4 * 500),
      conversions: Math.round(base * 0.02 + r5 * 20),
    };
  });
}

// ============================================
// Campaigns
// ============================================

export const DEMO_CAMPAIGNS: Campaign[] = [
  {
    id: '1', user_id: 'demo', tiktok_account_id: null, tiktok_campaign_id: null,
    name: 'Summer Sale 2025', objective: 'WEBSITE_CONVERSIONS', status: 'ACTIVE',
    budget_mode: 'BUDGET_MODE_DAY', budget: 50000, spent: 38500,
    start_date: '2025-06-01', end_date: '2025-06-30',
    tags: ['sale', 'summer'], meta: {}, created_at: '2025-06-01T00:00:00Z', updated_at: '2025-06-20T00:00:00Z',
  },
  {
    id: '2', user_id: 'demo', tiktok_account_id: null, tiktok_campaign_id: null,
    name: 'Brand Awareness Q2', objective: 'REACH', status: 'ACTIVE',
    budget_mode: 'BUDGET_MODE_TOTAL', budget: 120000, spent: 67200,
    start_date: '2025-04-01', end_date: '2025-06-30',
    tags: ['branding'], meta: {}, created_at: '2025-04-01T00:00:00Z', updated_at: '2025-06-20T00:00:00Z',
  },
  {
    id: '3', user_id: 'demo', tiktok_account_id: null, tiktok_campaign_id: null,
    name: 'New Product Launch', objective: 'PRODUCT_SALES', status: 'ACTIVE',
    budget_mode: 'BUDGET_MODE_DAY', budget: 30000, spent: 12400,
    start_date: '2025-06-15', end_date: null,
    tags: ['launch', 'product'], meta: {}, created_at: '2025-06-15T00:00:00Z', updated_at: '2025-06-20T00:00:00Z',
  },
  {
    id: '4', user_id: 'demo', tiktok_account_id: null, tiktok_campaign_id: null,
    name: 'Retargeting - Cart Abandon', objective: 'WEBSITE_CONVERSIONS', status: 'PAUSED',
    budget_mode: 'BUDGET_MODE_DAY', budget: 15000, spent: 9800,
    start_date: '2025-05-01', end_date: null,
    tags: ['retargeting'], meta: {}, created_at: '2025-05-01T00:00:00Z', updated_at: '2025-06-20T00:00:00Z',
  },
  {
    id: '5', user_id: 'demo', tiktok_account_id: null, tiktok_campaign_id: null,
    name: 'Video Views - Tutorial Series', objective: 'VIDEO_VIEWS', status: 'ACTIVE',
    budget_mode: 'BUDGET_MODE_DAY', budget: 8000, spent: 5600,
    start_date: '2025-06-01', end_date: null,
    tags: ['video', 'tutorial'], meta: {}, created_at: '2025-06-01T00:00:00Z', updated_at: '2025-06-20T00:00:00Z',
  },
];

// ============================================
// Campaign Summaries
// ============================================

export const DEMO_SUMMARIES: CampaignSummary[] = [
  { campaign_id: '1', campaign_name: 'Summer Sale 2025', total_spend: 38500, total_impressions: 1200000, total_clicks: 21000, total_conversions: 840, avg_ctr: 1.75, avg_cpc: 1.83, avg_roas: 4.2, total_revenue: 161700 },
  { campaign_id: '2', campaign_name: 'Brand Awareness Q2', total_spend: 67200, total_impressions: 1800000, total_clicks: 18000, total_conversions: 320, avg_ctr: 1.0, avg_cpc: 3.73, avg_roas: 1.8, total_revenue: 120960 },
  { campaign_id: '3', campaign_name: 'New Product Launch', total_spend: 12400, total_impressions: 340000, total_clicks: 8900, total_conversions: 445, avg_ctr: 2.62, avg_cpc: 1.39, avg_roas: 5.1, total_revenue: 63240 },
  { campaign_id: '4', campaign_name: 'Retargeting - Cart Abandon', total_spend: 9800, total_impressions: 110000, total_clicks: 4400, total_conversions: 242, avg_ctr: 4.0, avg_cpc: 2.23, avg_roas: 6.8, total_revenue: 66640 },
  { campaign_id: '5', campaign_name: 'Video Views - Tutorial', total_spend: 5600, total_impressions: 420000, total_clicks: 3200, total_conversions: 64, avg_ctr: 0.76, avg_cpc: 1.75, avg_roas: 1.2, total_revenue: 6720 },
];

// ============================================
// AI Insights - fixed timestamps
// ============================================

export const DEMO_INSIGHTS: AIInsight[] = [
  {
    id: '1', user_id: 'demo', campaign_id: '1', type: 'BUDGET_OPTIMIZATION',
    severity: 'success', title: 'Summer Sale ROAS สูงเกินเป้า',
    summary: 'แคมเปญ Summer Sale มี ROAS 4.2x สูงกว่าเป้า 3x ควรพิจารณาเพิ่มงบ 30% เพื่อขยาย reach',
    details: {}, recommendations: [
      { action: 'เพิ่มงบเป็น ฿65,000/วัน', description: 'เพิ่มงบ 30% จาก ฿50,000', expected_impact: 'เพิ่ม revenue ~฿48,500', priority: 'high' },
      { action: 'ขยาย Lookalike Audience', description: 'สร้าง LAL 3% จากผู้ซื้อ', expected_impact: 'เพิ่ม reach 40%', priority: 'medium' },
    ],
    confidence: 92, is_read: false, is_actioned: false, expires_at: null, created_at: '2025-06-20T10:00:00Z',
  },
  {
    id: '2', user_id: 'demo', campaign_id: '2', type: 'PERFORMANCE_ALERT',
    severity: 'warning', title: 'Brand Awareness CPC สูงขึ้น 25%',
    summary: 'CPC ของแคมเปญ Brand Awareness เพิ่มจาก ฿2.98 เป็น ฿3.73 ใน 7 วันที่ผ่านมา อาจเกิดจาก ad fatigue',
    details: {}, recommendations: [
      { action: 'เปลี่ยน Creative ใหม่', description: 'Creative ปัจจุบันใช้มา 21 วันแล้ว', expected_impact: 'ลด CPC ลง 15-20%', priority: 'high' },
    ],
    confidence: 85, is_read: false, is_actioned: false, expires_at: null, created_at: '2025-06-20T09:30:00Z',
  },
  {
    id: '3', user_id: 'demo', campaign_id: '4', type: 'ANOMALY_DETECTION',
    severity: 'critical', title: 'Retargeting ถูก Pause แต่ ROAS ดีที่สุด',
    summary: 'แคมเปญ Retargeting มี ROAS 6.8x ซึ่งดีที่สุดในทุกแคมเปญ แต่ถูก Pause อยู่ ควรเปิดใช้งานทันที',
    details: {}, recommendations: [
      { action: 'เปิดแคมเปญ Retargeting', description: 'Resume campaign ทันที', expected_impact: 'เพิ่ม revenue ฿66,640/เดือน', priority: 'high' },
    ],
    confidence: 98, is_read: false, is_actioned: false, expires_at: null, created_at: '2025-06-20T09:00:00Z',
  },
  {
    id: '4', user_id: 'demo', campaign_id: '3', type: 'TREND_PREDICTION',
    severity: 'info', title: 'Product Launch มีแนวโน้มดีขึ้นต่อเนื่อง',
    summary: 'ROAS เพิ่มขึ้น 15% ใน 3 วันล่าสุด คาดว่าจะแตะ 6x ภายใน 7 วัน หากรักษา momentum ได้',
    details: {}, recommendations: [
      { action: 'รักษางบปัจจุบัน', description: 'ไม่ควรเปลี่ยนงบในช่วงขาขึ้น', expected_impact: 'ROAS อาจถึง 6x', priority: 'medium' },
    ],
    confidence: 75, is_read: false, is_actioned: false, expires_at: null, created_at: '2025-06-20T08:30:00Z',
  },
];

// ============================================
// Budget Data - fixed values
// ============================================

export const DEMO_BUDGET_DATA = [
  { name: 'Summer Sale 20...', allocated: 50000, spent: 38500, ai_recommended: 65000 },
  { name: 'Brand Awareness...', allocated: 120000, spent: 67200, ai_recommended: 85000 },
  { name: 'New Product Lau...', allocated: 30000, spent: 12400, ai_recommended: 45000 },
  { name: 'Retargeting - C...', allocated: 15000, spent: 9800, ai_recommended: 35000 },
];
