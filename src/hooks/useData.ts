'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isDemoMode } from '@/lib/supabase';
import { useAppStore } from './useStore';
import {
  DEMO_WATCHLIST,
  DEMO_PRICES,
  DEMO_SIGNALS,
  DEMO_TRADES,
  DEMO_NEWS,
  DEMO_DASHBOARD_STATS,
} from '@/lib/demo-data';
import type { Watchlist, MarketPrice, Signal, Trade, NewsItem, DashboardStats, MarketType } from '@/types';

const EMPTY_STATS: DashboardStats = {
  total_signals_today: 0,
  active_signals: 0,
  success_rate: 0,
  total_trades: 0,
  open_trades: 0,
  total_pnl: 0,
  total_pnl_percent: null,
  // ศูนย์ตรงนี้คือ "ค่าตั้งต้นก่อนโหลด" ไม่ใช่ผลการวัด — ถูกทับด้วยค่าจาก RPC ทันทีที่โหลดเสร็จ
  unrealized_pnl: 0,
  realized_pnl: 0,
  win_rate: 0,
  best_performer: '',
  worst_performer: '',
};

export function useWatchlist() {
  const demo = isDemoMode();
  const refreshKey = useAppStore((s) => s.refreshKey);
  const refresh = useAppStore((s) => s.refresh);

  const [data, setData] = useState<Watchlist[]>(demo ? DEMO_WATCHLIST : []);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/watchlist');
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.error || 'โหลด watchlist ไม่สำเร็จ');
        setData(json.watchlist as Watchlist[]);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [demo, refreshKey]);

  const add = useCallback(
    async (symbol: string, market: MarketType, name?: string) => {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, market, name }),
      });
      const json = await res.json();
      if (json.success) refresh();
      return json as { success: boolean; error?: string; message?: string };
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/watchlist?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) refresh();
      return json as { success: boolean; error?: string };
    },
    [refresh]
  );

  return { data, loading, error, add, remove };
}

export function usePrices() {
  const demo = isDemoMode();
  const refreshKey = useAppStore((s) => s.refreshKey);

  const [data, setData] = useState<MarketPrice[]>(demo ? DEMO_PRICES : []);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.from('market_prices').select('*');
      if (cancelled) return;
      setData((data as MarketPrice[]) || []);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [demo, refreshKey]);

  return { data, loading };
}

export function useSignals(status?: Signal['status']) {
  const demo = isDemoMode();
  const refreshKey = useAppStore((s) => s.refreshKey);

  const [data, setData] = useState<Signal[]>(
    demo ? (status ? DEMO_SIGNALS.filter(s => s.status === status) : DEMO_SIGNALS) : []
  );
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      let q = supabase.from('signals').select('*').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data } = await q;
      if (cancelled) return;
      setData((data as Signal[]) || []);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [demo, status, refreshKey]);

  return { data, loading };
}

export function useTrades(status?: Trade['status']) {
  const demo = isDemoMode();
  const refreshKey = useAppStore((s) => s.refreshKey);

  const [data, setData] = useState<Trade[]>(
    demo ? (status ? DEMO_TRADES.filter(t => t.status === status) : DEMO_TRADES) : []
  );
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      let q = supabase.from('trades').select('*').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data } = await q;
      if (cancelled) return;
      setData((data as Trade[]) || []);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [demo, status, refreshKey]);

  return { data, loading };
}

export function useNews(limit: number = 20) {
  const demo = isDemoMode();
  const refreshKey = useAppStore((s) => s.refreshKey);

  const [data, setData] = useState<NewsItem[]>(demo ? DEMO_NEWS.slice(0, limit) : []);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(limit);
      if (cancelled) return;
      setData((data as NewsItem[]) || []);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [demo, limit, refreshKey]);

  return { data, loading };
}

export function useDashboardStats() {
  const demo = isDemoMode();
  const refreshKey = useAppStore((s) => s.refreshKey);

  // โหมดจริงต้องเริ่มจากศูนย์ ไม่ใช่ตัวเลข demo ค้างอยู่จนกว่าจะโหลดเสร็จ
  const [data, setData] = useState<DashboardStats>(demo ? DEMO_DASHBOARD_STATS : EMPTY_STATS);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { if (!cancelled) setLoading(false); return; }

      const { data: stats, error: rpcError } = await supabase.rpc('get_portfolio_stats', { p_user_id: auth.user.id });
      const row = Array.isArray(stats) ? stats[0] : stats;
      if (cancelled) return;

      // RPC ล้มแล้วเงียบ = หน้า dashboard โชว์ 0 ทุกช่องเหมือนผู้ใช้ใหม่ที่ยังไม่เคยเทรด
      // ทั้งที่หน้า /trades (คนละ query) ยังโชว์ตัวเลขจริง — สองหน้าขัดกันโดยไม่มีอะไรบอก
      // ทางล้มที่เป็นไปได้จริง: migration 003 รันไม่ครบ (REVOKE ผ่านแต่ GRANT ไม่ได้รัน)
      // หรือ guard auth.uid() ปฏิเสธเพราะ session หมดอายุ → ต้องบอกผู้ใช้ ไม่ใช่แสดงศูนย์
      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
      setError(null);

      if (row) {
        const closed = Number(row.closed_trades) || 0;
        setData({
          total_signals_today: Number(row.signals_today) || 0,
          active_signals: Number(row.active_signals) || 0,
          success_rate: Number(row.win_rate) || 0,
          total_trades: Number(row.total_trades) || 0,
          open_trades: Number(row.open_trades) || 0,
          total_pnl: Number(row.total_pnl) || 0,
          // null ไม่ใช่ 0 — ระบบยังไม่มีที่ให้กรอกทุนตั้งต้น จึงหารเป็นเปอร์เซ็นต์ไม่ได้
          // ส่ง 0 ไปการ์ดจะโชว์ '+0.0%' ซึ่งอ่านได้ว่าผลตอบแทนเป็นศูนย์ ทั้งที่ไม่เคยคำนวณ
          total_pnl_percent: null,
          // migration 003 ให้ get_portfolio_stats คืนสองค่านี้มาแล้ว ต้องอ่านของจริง
          // ถ้า hardcode 0 หน้า dashboard จะโชว์ว่าไม่มีกำไรค้างทั้งที่ในฐานข้อมูลมี
          unrealized_pnl: Number(row.unrealized_pnl) || 0,
          realized_pnl: Number(row.realized_pnl) || 0,
          win_rate: closed ? Number(row.win_rate) || 0 : 0,
          best_performer: '',
          worst_performer: '',
        });
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [demo, refreshKey]);

  return { data, loading, error };
}
