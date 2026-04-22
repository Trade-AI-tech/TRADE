'use client';

import { useState, useMemo } from 'react';
import TradeRow from '@/components/trading/TradeRow';
import { useTrades } from '@/hooks/useData';
import { cn } from '@/lib/utils';
import { Briefcase, TrendingUp, TrendingDown, Activity } from 'lucide-react';

const FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'open', label: 'กำลังถือ' },
  { value: 'closed', label: 'ปิดแล้ว' },
];

export default function TradesPage() {
  const { data: trades } = useTrades();
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return trades;
    return trades.filter(t => t.status === filter);
  }, [trades, filter]);

  const stats = useMemo(() => {
    const closed = trades.filter(t => t.status === 'closed');
    const wins = closed.filter(t => t.pnl > 0).length;
    const losses = closed.filter(t => t.pnl < 0).length;
    const totalPnl = closed.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = closed.length ? (wins / closed.length) * 100 : 0;
    return { wins, losses, totalPnl, winRate, total: trades.length };
  }, [trades]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-white flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-accent-glow" />
          พอร์ตเทรด
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          ประวัติการเทรดและผลการดำเนินงาน
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-gray-500 uppercase mb-1">กำไร/ขาดทุนรวม</div>
          <div className={cn('text-2xl font-mono font-bold', stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500 uppercase mb-1">Win Rate</div>
          <div className="text-2xl font-mono font-bold text-white">{stats.winRate.toFixed(1)}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" /> ชนะ
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400">{stats.wins}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-red-400" /> แพ้
          </div>
          <div className="text-2xl font-mono font-bold text-red-400">{stats.losses}</div>
        </div>
      </div>

      <div className="flex gap-2">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors border',
              filter === f.value
                ? 'border-accent-glow/30 bg-accent-glow/10 text-accent-glow'
                : 'border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">ยังไม่มีข้อมูลเทรด</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 text-xs text-gray-500 uppercase">
                <th className="py-3 px-4 text-left font-medium">Symbol</th>
                <th className="py-3 px-4 text-left font-medium">ตลาด</th>
                <th className="py-3 px-4 text-left font-medium">ทิศทาง</th>
                <th className="py-3 px-4 text-left font-medium">Entry</th>
                <th className="py-3 px-4 text-left font-medium">Exit</th>
                <th className="py-3 px-4 text-left font-medium">จำนวน</th>
                <th className="py-3 px-4 text-left font-medium">P/L</th>
                <th className="py-3 px-4 text-left font-medium">สถานะ</th>
                <th className="py-3 px-4 text-left font-medium">วันที่เข้า</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => <TradeRow key={t.id} trade={t} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
