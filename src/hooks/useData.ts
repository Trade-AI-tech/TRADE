'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSupabase, isDemoMode } from '@/lib/supabase';
import { DEMO_CAMPAIGNS, DEMO_SUMMARIES, DEMO_INSIGHTS } from '@/lib/demo-data';
import type { Campaign, DailyMetrics, AIInsight, CampaignSummary } from '@/types';

// Generic fetch hook
function useSupabaseQuery<T>(
  table: string,
  query?: Record<string, unknown>,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode()) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const supabase = getSupabase();
        if (!supabase) {
          setLoading(false);
          return;
        }
        let q = supabase.from(table).select('*');

        if (query) {
          Object.entries(query).forEach(([key, value]) => {
            if (key === 'order') {
              q = q.order(value as string, { ascending: false });
            } else if (key === 'limit') {
              q = q.limit(value as number);
            } else {
              q = q.eq(key, value);
            }
          });
        }

        const { data: result, error: err } = await q;
        if (err) throw err;
        setData(result as T[]);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

// Campaigns
export function useCampaigns(status?: string) {
  const demo = isDemoMode();
  const query: Record<string, unknown> = { order: 'created_at' };
  if (status) query.status = status;
  const result = useSupabaseQuery<Campaign>('campaigns', query, [status]);

  if (demo) {
    const filtered = status
      ? DEMO_CAMPAIGNS.filter(c => c.status === status)
      : DEMO_CAMPAIGNS;
    return { data: filtered, loading: false, error: null };
  }
  return result;
}

// Daily Metrics
export function useDailyMetrics(
  campaignId?: string,
  startDate?: string,
  endDate?: string
) {
  const [data, setData] = useState<DailyMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode()) {
      setData([]);
      setLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      setLoading(true);
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }
      let q = supabase
        .from('daily_metrics')
        .select('*')
        .order('date', { ascending: true });

      if (campaignId) q = q.eq('campaign_id', campaignId);
      if (startDate) q = q.gte('date', startDate);
      if (endDate) q = q.lte('date', endDate);

      q = q.is('ad_group_id', null).is('ad_id', null);

      const { data: result } = await q;
      setData((result as DailyMetrics[]) || []);
      setLoading(false);
    };
    fetchMetrics();
  }, [campaignId, startDate, endDate]);

  return { data, loading };
}

// AI Insights
export function useAIInsights(limit: number = 20) {
  const demo = isDemoMode();
  const result = useSupabaseQuery<AIInsight>('ai_insights', {
    order: 'created_at',
    limit,
  }, [limit]);

  if (demo) {
    return { data: DEMO_INSIGHTS.slice(0, limit), loading: false, error: null };
  }
  return result;
}

// Campaign Summary (using RPC)
export function useCampaignSummary(startDate?: string, endDate?: string) {
  const [data, setData] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode()) {
      setData(DEMO_SUMMARIES);
      setLoading(false);
      return;
    }

    const fetchSummary = async () => {
      setLoading(true);
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data: user } = await supabase.auth.getUser();

      if (user?.user) {
        const { data: result } = await supabase.rpc('get_campaign_summary', {
          p_user_id: user.user.id,
          p_start_date: startDate,
          p_end_date: endDate,
        });
        setData((result as CampaignSummary[]) || []);
      }
      setLoading(false);
    };
    fetchSummary();
  }, [startDate, endDate]);

  return { data, loading };
}

// Trigger AI Analysis
export function useAIAnalysis() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const analyze = useCallback(async (type: string, campaignIds?: string[]) => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, campaign_ids: campaignIds }),
      });
      const data = await res.json();
      setResult(data);
      return data;
    } catch (err) {
      console.error('AI analysis error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { analyze, loading, result };
}

// Realtime subscription
export function useRealtimeInsights(
  onNew: (insight: AIInsight) => void
) {
  useEffect(() => {
    if (isDemoMode()) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel('ai-insights-new')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_insights' },
        (payload) => {
          onNew(payload.new as AIInsight);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onNew]);
}
