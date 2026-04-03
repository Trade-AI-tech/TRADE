/**
 * AI Analysis Engine
 * ใช้ Claude API วิเคราะห์ประสิทธิภาพโฆษณา TikTok
 */

import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  AIInsight,
  AIRecommendation,
  Campaign,
  DailyMetrics,
} from '@/types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ============================================
// System Prompts for Different Analysis Types
// ============================================

const SYSTEM_PROMPTS = {
  budget: `คุณคือผู้เชี่ยวชาญด้านการจัดสรรงบโฆษณา TikTok ระดับมืออาชีพ
คุณต้องวิเคราะห์ข้อมูลงบประมาณและแนะนำการจัดสรรที่เหมาะสมที่สุด

หลักการวิเคราะห์:
1. ROAS (Return on Ad Spend) - แคมเปญที่ ROAS สูงควรได้งบเพิ่ม
2. CPA (Cost Per Acquisition) - แคมเปญที่ CPA ต่ำ = มีประสิทธิภาพ
3. Budget Pacing - ใช้งบเร็วไป/ช้าไป ต้องปรับ
4. Diminishing Returns - จุดที่เพิ่มงบแล้วไม่ได้ผลเพิ่ม
5. Seasonality - ช่วงเวลาที่ควรเพิ่ม/ลดงบ

ตอบเป็น JSON เท่านั้น ตามโครงสร้าง:
{
  "summary": "สรุปภาพรวม",
  "score": 0-100,
  "insights": [{ "type": "BUDGET_OPTIMIZATION", "severity": "info|warning|critical|success", "title": "", "summary": "", "confidence": 0-100, "details": {} }],
  "recommendations": [{ "action": "", "description": "", "expected_impact": "", "priority": "high|medium|low" }]
}`,

  performance: `คุณคือนักวิเคราะห์ประสิทธิภาพโฆษณา TikTok ระดับสูง
วิเคราะห์ metrics ทั้งหมดอย่างละเอียด:

KPI หลัก:
- CTR: ดี > 1.5%, เฉลี่ย 0.5-1.5%, ต่ำ < 0.5%
- CPC: ขึ้นกับอุตสาหกรรม แต่ต่ำกว่าค่าเฉลี่ยคู่แข่ง = ดี
- ROAS: ดี > 3x, เฉลี่ย 1.5-3x, แย่ < 1.5x
- Conversion Rate: ดี > 5%, เฉลี่ย 1-5%
- Video Completion Rate: ดี > 30%, เฉลี่ย 15-30%

วิเคราะห์:
1. แนวโน้ม (Trend) - ดีขึ้นหรือแย่ลง
2. ความผิดปกติ (Anomaly) - ค่าที่ผิดปกติจากค่าเฉลี่ย
3. โอกาส (Opportunity) - จุดที่ปรับปรุงได้
4. ความเสี่ยง (Risk) - จุดที่อาจเป็นปัญหา

ตอบเป็น JSON เท่านั้น ตามโครงสร้างเดียวกัน`,

  creative: `คุณคือผู้เชี่ยวชาญด้าน TikTok Creative Strategy
วิเคราะห์ประสิทธิภาพ Ad Creative ตาม:

1. Hook Rate (3 วินาทีแรก) - ดึงดูดความสนใจได้ดีแค่ไหน
2. Hold Rate - คนดูต่อจนจบหรือไม่
3. Engagement Rate - likes, comments, shares
4. Click-through - กดลิงก์มากแค่ไหน
5. Creative Fatigue - ประสิทธิภาพลดลงเมื่อเวลาผ่านไป

แนะนำ:
- ควรเปลี่ยน creative เมื่อไหร่
- รูปแบบ creative ที่ได้ผลดี
- A/B testing ideas

ตอบเป็น JSON`,

  audience: `คุณคือผู้เชี่ยวชาญด้าน TikTok Audience Targeting
วิเคราะห์กลุ่มเป้าหมายและแนะนำ:

1. Audience Quality Score
2. Audience Overlap ระหว่างแคมเปญ
3. Lookalike Opportunities
4. Audience Saturation
5. New Audience Recommendations

ตอบเป็น JSON`,

  full: `คุณคือที่ปรึกษาด้านโฆษณา TikTok แบบครบวงจร
วิเคราะห์ทุกมิติ: งบ, ประสิทธิภาพ, creative, กลุ่มเป้าหมาย
ให้คะแนนรวมและ action items ที่สำคัญที่สุด 5 ข้อ
เรียงตามผลกระทบจากมากไปน้อย

ตอบเป็น JSON`,
};

// ============================================
// Analysis Functions
// ============================================

export async function analyzeWithAI(
  request: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  const systemPrompt = SYSTEM_PROMPTS[request.type];

  const userMessage = buildUserMessage(request);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI response did not contain valid JSON');
  }

  return JSON.parse(jsonMatch[0]) as AIAnalysisResponse;
}

function buildUserMessage(request: AIAnalysisRequest): string {
  const parts: string[] = [];

  if (request.campaigns?.length) {
    parts.push('## แคมเปญ');
    parts.push(JSON.stringify(request.campaigns.map(c => ({
      name: c.name,
      objective: c.objective,
      status: c.status,
      budget: c.budget,
      spent: c.spent,
      budget_mode: c.budget_mode,
    })), null, 2));
  }

  if (request.metrics?.length) {
    parts.push('## Metrics Data');
    // Summarize metrics instead of sending raw
    const summary = summarizeMetrics(request.metrics);
    parts.push(JSON.stringify(summary, null, 2));
  }

  if (request.date_range) {
    parts.push(`## ช่วงเวลา: ${request.date_range.start} ถึง ${request.date_range.end}`);
  }

  parts.push('\nวิเคราะห์ข้อมูลข้างต้นและให้คำแนะนำเป็นภาษาไทย');

  return parts.join('\n\n');
}

function summarizeMetrics(metrics: DailyMetrics[]) {
  const totals = metrics.reduce(
    (acc, m) => ({
      spend: acc.spend + m.spend,
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      conversions: acc.conversions + m.conversions,
      conversion_value: acc.conversion_value + m.conversion_value,
      video_views: acc.video_views + m.video_views,
      video_views_p100: acc.video_views_p100 + m.video_views_p100,
      likes: acc.likes + m.likes,
      comments: acc.comments + m.comments,
      shares: acc.shares + m.shares,
    }),
    {
      spend: 0, impressions: 0, clicks: 0, conversions: 0,
      conversion_value: 0, video_views: 0, video_views_p100: 0,
      likes: 0, comments: 0, shares: 0,
    }
  );

  const days = metrics.length;

  return {
    period_days: days,
    totals,
    averages: {
      daily_spend: totals.spend / days,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
      roas: totals.spend > 0 ? totals.conversion_value / totals.spend : 0,
      conversion_rate: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0,
      video_completion_rate: totals.video_views > 0
        ? (totals.video_views_p100 / totals.video_views) * 100 : 0,
      engagement_rate: totals.impressions > 0
        ? ((totals.likes + totals.comments + totals.shares) / totals.impressions) * 100 : 0,
    },
    trends: calculateTrends(metrics),
  };
}

function calculateTrends(metrics: DailyMetrics[]) {
  if (metrics.length < 2) return { direction: 'flat', details: {} };

  const sorted = [...metrics].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const avg = (arr: DailyMetrics[], key: keyof DailyMetrics) =>
    arr.reduce((s, m) => s + Number(m[key] || 0), 0) / arr.length;

  const spendTrend = avg(secondHalf, 'spend') - avg(firstHalf, 'spend');
  const clicksTrend = avg(secondHalf, 'clicks') - avg(firstHalf, 'clicks');
  const convTrend = avg(secondHalf, 'conversions') - avg(firstHalf, 'conversions');

  return {
    direction: spendTrend > 0 ? 'increasing' : spendTrend < 0 ? 'decreasing' : 'flat',
    spend_change_pct: avg(firstHalf, 'spend') > 0
      ? (spendTrend / avg(firstHalf, 'spend')) * 100 : 0,
    clicks_change_pct: avg(firstHalf, 'clicks') > 0
      ? (clicksTrend / avg(firstHalf, 'clicks')) * 100 : 0,
    conversions_change_pct: avg(firstHalf, 'conversions') > 0
      ? (convTrend / avg(firstHalf, 'conversions')) * 100 : 0,
  };
}

// ============================================
// Specialized Analysis Functions
// ============================================

export async function analyzeBudget(
  campaigns: Campaign[],
  metrics: DailyMetrics[]
): Promise<AIAnalysisResponse> {
  return analyzeWithAI({
    type: 'budget',
    campaigns,
    metrics,
  });
}

export async function analyzePerformance(
  campaigns: Campaign[],
  metrics: DailyMetrics[],
  dateRange?: { start: string; end: string }
): Promise<AIAnalysisResponse> {
  return analyzeWithAI({
    type: 'performance',
    campaigns,
    metrics,
    date_range: dateRange,
  });
}

export async function analyzeCreative(
  campaigns: Campaign[],
  metrics: DailyMetrics[]
): Promise<AIAnalysisResponse> {
  return analyzeWithAI({
    type: 'creative',
    campaigns,
    metrics,
  });
}

export async function fullAnalysis(
  campaigns: Campaign[],
  metrics: DailyMetrics[],
  dateRange?: { start: string; end: string }
): Promise<AIAnalysisResponse> {
  return analyzeWithAI({
    type: 'full',
    campaigns,
    metrics,
    date_range: dateRange,
  });
}

// ============================================
// Anomaly Detection (Local - No AI needed)
// ============================================

export function detectAnomalies(
  metrics: DailyMetrics[],
  threshold: number = 2
): AIInsight[] {
  const insights: AIInsight[] = [];
  if (metrics.length < 7) return insights;

  const keys: (keyof DailyMetrics)[] = ['spend', 'ctr', 'cpc', 'roas', 'conversions'];

  for (const key of keys) {
    const values = metrics.map(m => Number(m[key] || 0));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );

    if (stdDev === 0) continue;

    const latest = values[values.length - 1];
    const zScore = Math.abs((latest - mean) / stdDev);

    if (zScore > threshold) {
      const direction = latest > mean ? 'สูงกว่า' : 'ต่ำกว่า';
      insights.push({
        id: `anomaly-${key}-${Date.now()}`,
        user_id: metrics[0].user_id,
        campaign_id: metrics[0].campaign_id,
        type: 'ANOMALY_DETECTION',
        severity: zScore > 3 ? 'critical' : 'warning',
        title: `${key} ผิดปกติ`,
        summary: `${key} ${direction}ค่าเฉลี่ย ${(zScore * stdDev).toFixed(2)} (${zScore.toFixed(1)} SD)`,
        details: { key, latest, mean, stdDev, zScore },
        recommendations: [],
        confidence: Math.min(95, zScore * 30),
        is_read: false,
        is_actioned: false,
        expires_at: null,
        created_at: new Date().toISOString(),
      });
    }
  }

  return insights;
}
