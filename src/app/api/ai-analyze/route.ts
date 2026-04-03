import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/supabase';
import { DEMO_INSIGHTS } from '@/lib/demo-data';
import type { AIAnalysisRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: AIAnalysisRequest = await request.json();

    // In demo mode, return demo insights
    if (isDemoMode() || !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'placeholder') {
      // Simulate AI processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      return NextResponse.json({
        summary: `AI วิเคราะห์ ${body.type} เสร็จสมบูรณ์ — พบ ${DEMO_INSIGHTS.length} insights`,
        score: 78,
        insights: DEMO_INSIGHTS,
        recommendations: DEMO_INSIGHTS.flatMap(i => i.recommendations),
      });
    }

    // Real AI analysis
    const { analyzeWithAI, detectAnomalies } = await import('@/lib/ai-engine');

    const result = await analyzeWithAI(body);

    let anomalies: ReturnType<typeof detectAnomalies> = [];
    if (body.metrics?.length) {
      anomalies = detectAnomalies(body.metrics);
    }

    const allInsights = [...result.insights, ...anomalies];

    return NextResponse.json({
      ...result,
      insights: allInsights,
    });
  } catch (error) {
    console.error('AI Analysis error:', error);
    return NextResponse.json(
      { error: 'AI analysis failed', details: String(error) },
      { status: 500 }
    );
  }
}
