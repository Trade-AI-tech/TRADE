'use client';

import { useEffect, useState } from 'react';
import { getSupabase, isDemoMode } from '@/lib/supabase';
import {
  DEMO_WATCHLIST,
  DEMO_PRICES,
  DEMO_SIGNALS,
  DEMO_TRADES,
  DEMO_NEWS,
  DEMO_DASHBOARD_STATS,
} from '@/lib/demo-data';
import type { Watchlist, MarketPrice, Signal, Trade, NewsItem, DashboardStats } from '@/types';

export function useWatchlist() {
  const [data, setData] = useState<Watchlist[]>(isDemoMode() ? DEMO_WATCHLIST : []);
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    if (isDemoMode()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    (async () => {
      const { data } = await supabase.from('watchlist').select('*').eq('is_active', true);
      setData((data as Watchlist[]) || []);
      setLoading(false);
    })();
  }, []);

  return { data, loading };
}

export function usePrices() {
  const [data, setData] = useState<MarketPrice[]>(isDemoMode() ? DEMO_PRICES : []);
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    if (isDemoMode()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    (async () => {
      const { data } = await supabase.from('market_prices').select('*');
      setData((data as MarketPrice[]) || []);
      setLoading(false);
    })();
  }, []);

  return { data, loading };
}

export function useSignals(status?: Signal['status']) {
  const [data, setData] = useState<Signal[]>(
    isDemoMode() ? (status ? DEMO_SIGNALS.filter(s => s.status === status) : DEMO_SIGNALS) : []
  );
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    if (isDemoMode()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    (async () => {
      let q = supabase.from('signals').select('*').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data } = await q;
      setData((data as Signal[]) || []);
      setLoading(false);
    })();
  }, [status]);

  return { data, loading };
}

export function useTrades(status?: Trade['status']) {
  const [data, setData] = useState<Trade[]>(
    isDemoMode() ? (status ? DEMO_TRADES.filter(t => t.status === status) : DEMO_TRADES) : []
  );
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    if (isDemoMode()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    (async () => {
      let q = supabase.from('trades').select('*').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data } = await q;
      setData((data as Trade[]) || []);
      setLoading(false);
    })();
  }, [status]);

  return { data, loading };
}

export function useNews(limit: number = 20) {
  const [data, setData] = useState<NewsItem[]>(isDemoMode() ? DEMO_NEWS.slice(0, limit) : []);
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    if (isDemoMode()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    (async () => {
      const { data } = await supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(limit);
      setData((data as NewsItem[]) || []);
      setLoading(false);
    })();
  }, [limit]);

  return { data, loading };
}

export function useDashboardStats() {
  const [data, setData] = useState<DashboardStats>(DEMO_DASHBOARD_STATS);
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    if (isDemoMode()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;

      const { data: stats } = await supabase.rpc('get_portfolio_stats', { p_user_id: user.user.id });
      const row = Array.isArray(stats) ? stats[0] : stats;

      if (row) {
        setData({
          total_signals_today: Number(row.signals_today) || 0,
          active_signals: Number(row.active_signals) || 0,
          success_rate: 0,
          total_trades: Number(row.total_trades) || 0,
          open_trades: Number(row.open_trades) || 0,
          total_pnl: Number(row.total_pnl) || 0,
          total_pnl_percent: 0,
          win_rate: Number(row.win_rate) || 0,
          best_performer: '',
          worst_performer: '',
        });
      }
      setLoading(false);
    })();
  }, []);

  return { data, loading };
}
