// supabase/functions/ai-alerts/index.ts
// Triggered after sync-tiktok completes or on schedule
// Analyzes metrics and creates AI insights

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all users with active accounts
    const { data: accounts } = await supabase
      .from('tiktok_accounts')
      .select('user_id')
      .eq('status', 'active');

    const uniqueUsers = [...new Set((accounts || []).map(a => a.user_id))];
    const results = [];

    for (const userId of uniqueUsers) {
      try {
        // Fetch last 14 days of metrics
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

        const { data: metrics } = await supabase
          .from('daily_metrics')
          .select('*')
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate)
          .is('ad_group_id', null)
          .is('ad_id', null)
          .order('date', { ascending: true });

        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('*')
          .eq('user_id', userId)
          .in('status', ['ACTIVE', 'PAUSED']);

        if (!metrics?.length || !campaigns?.length) continue;

        // Run anomaly detection locally
        const anomalies = detectAnomalies(metrics);

        // Run AI analysis for budget optimization
        const aiInsights = await runAIAnalysis(campaigns, metrics);

        // Save all insights
        const allInsights = [...anomalies, ...aiInsights].map(insight => ({
          ...insight,
          user_id: userId,
        }));

        if (allInsights.length > 0) {
          await supabase.from('ai_insights').insert(allInsights);
        }

        results.push({ user_id: userId, insights_created: allInsights.length });
      } catch (err) {
        results.push({ user_id: userId, error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function detectAnomalies(metrics: any[]) {
  const insights: any[] = [];
  if (metrics.length < 7) return insights;

  const keys = ['spend', 'ctr', 'cpc', 'roas', 'conversions'];

  for (const key of keys) {
    const values = metrics.map(m => Number(m[key] || 0));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );

    if (stdDev === 0) continue;

    const latest = values[values.length - 1];
    const zScore = Math.abs((latest - mean) / stdDev);

    if (zScore > 2) {
      insights.push({
        campaign_id: metrics[0].campaign_id,
        type: 'ANOMALY_DETECTION',
        severity: zScore > 3 ? 'critical' : 'warning',
        title: `${key} ผิดปกติ (${zScore.toFixed(1)} SD)`,
        summary: `${key} วันล่าสุด = ${latest.toFixed(2)} ขณะที่ค่าเฉลี่ย = ${mean.toFixed(2)}`,
        details: { key, latest, mean, stdDev, zScore },
        recommendations: [],
        confidence: Math.min(95, zScore * 30),
      });
    }
  }

  return insights;
}

async function runAIAnalysis(campaigns: any[], metrics: any[]) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return [];

  try {
    // Summarize data for AI
    const summary = {
      campaigns: campaigns.map(c => ({
        name: c.name, objective: c.objective, status: c.status,
        budget: c.budget, spent: c.spent,
      })),
      total_spend: metrics.reduce((s, m) => s + Number(m.spend || 0), 0),
      total_conversions: metrics.reduce((s, m) => s + Number(m.conversions || 0), 0),
      avg_roas: (() => {
        const spend = metrics.reduce((s, m) => s + Number(m.spend || 0), 0);
        const rev = metrics.reduce((s, m) => s + Number(m.conversion_value || 0), 0);
        return spend > 0 ? rev / spend : 0;
      })(),
      period_days: 14,
    };

    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: `คุณเป็น AI ที่วิเคราะห์โฆษณา TikTok ให้สรุปสั้นๆ 2-3 insights สำคัญที่สุด
ตอบเป็น JSON array: [{ "type": "BUDGET_OPTIMIZATION"|"PERFORMANCE_ALERT"|"ACTION_RECOMMENDATION", "severity": "info"|"warning"|"critical"|"success", "title": "...", "summary": "...", "confidence": 0-100, "recommendations": [{"action":"...", "description":"...", "expected_impact":"...", "priority":"high|medium|low"}] }]
ตอบ JSON เท่านั้น ไม่ต้องอธิบายเพิ่ม`,
        messages: [{
          role: 'user',
          content: `วิเคราะห์ข้อมูลโฆษณา 14 วัน:\n${JSON.stringify(summary, null, 2)}`,
        }],
      }),
    });

    const data = await response.json();
    const text = data.content?.map((b: any) => b.text || '').join('') || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('AI analysis error:', err);
  }

  return [];
}
