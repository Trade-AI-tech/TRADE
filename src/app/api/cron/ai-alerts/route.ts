import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isDemoMode } from '@/lib/supabase';
import { detectAnomalies } from '@/lib/ai-engine';

// Vercel Cron: run AI analysis every 6 hours
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoMode()) {
    return NextResponse.json({ message: 'Demo mode - skipping AI alerts' });
  }

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Get all users with active campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, user_id, name')
      .eq('status', 'ACTIVE');

    let insightsCreated = 0;

    for (const campaign of campaigns || []) {
      try {
        // Get last 14 days of metrics for anomaly detection
        const { data: metrics } = await supabase
          .from('daily_metrics')
          .select('*')
          .eq('campaign_id', campaign.id)
          .is('ad_group_id', null)
          .is('ad_id', null)
          .order('date', { ascending: true })
          .limit(14);

        if (!metrics || metrics.length < 7) continue;

        // Run local anomaly detection
        const anomalies = detectAnomalies(metrics);

        // Save anomalies to ai_insights
        for (const insight of anomalies) {
          await supabase.from('ai_insights').insert({
            user_id: campaign.user_id,
            campaign_id: campaign.id,
            type: insight.type,
            severity: insight.severity,
            title: insight.title,
            summary: insight.summary,
            details: insight.details,
            recommendations: insight.recommendations,
            confidence: insight.confidence,
          });
          insightsCreated++;
        }
      } catch (err) {
        console.error(`AI alert failed for campaign ${campaign.id}:`, err);
      }
    }

    return NextResponse.json({
      message: `Created ${insightsCreated} insights`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron AI alerts error:', error);
    return NextResponse.json(
      { error: 'AI alerts failed', details: String(error) },
      { status: 500 }
    );
  }
}
