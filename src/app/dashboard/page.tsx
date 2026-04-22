'use client';

import { useMemo } from 'react';
import MetricCard from '@/components/dashboard/MetricCard';
import EquityChart from '@/components/charts/EquityChart';
import SignalCard from '@/components/trading/SignalCard';
import MarketRow from '@/components/trading/MarketRow';
import { useSignals, usePrices, useTrades, useDashboardStats } from '@/hooks/useData';
import { generateEquityCurve } from '@/lib/demo-data';
import Link from 'next/link';
import {
  Zap, TrendingUp, Target, Wallet, Activity, ArrowRight, DollarSign, Percent,
} from 'lucide-react';

export default function DashboardPage() {
  const { data: signals } = useSignals('active');
  const { data: prices } = usePrices();
  const { data: trades } = useTrades();
  const { data: stats } = useDashboardStats();
  const equityData = useMemo(() => generateEquityCurve(), []);

  const topSignals = signals.slice(0, 3);
  const topMovers = [...prices].sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent)).slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            ภาพรวมพอร์ต สัญญาณ AI และตลาดวันนี้
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="กำไร/ขาดทุนรวม"
          value={stats.total_pnl}
          change={stats.total_pnl_percent}
          format="currency"
          icon={DollarSign}
          iconColor={stats.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          delay={0}
        />
        <MetricCard
          label="Win Rate"
          value={stats.win_rate}
          change={0}
          format="percent"
          icon={Target}
          iconColor="text-accent-glow"
          delay={50}
        />
        <MetricCard
          label="สัญญาณวันนี้"
          value={stats.total_signals_today}
          change={0}
          format="number"
          icon={Zap}
          iconColor="text-accent-gold"
          delay={100}
        />
        <MetricCard
          label="กำลังเทรด"
          value={stats.open_trades}
          change={0}
          format="number"
          icon={Activity}
          iconColor="text-accent-purple"
          delay={150}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EquityChart data={equityData} />
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">ตลาดที่เคลื่อนไหวมาก</h3>
            <Link href="/markets" className="text-xs text-accent-glow hover:underline flex items-center gap-1">
              ดูทั้งหมด <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {topMovers.map((p) => (
              <MarketRow key={p.symbol} price={p} />
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-display text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent-glow" />
              สัญญาณ AI ล่าสุด
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">จุดเข้า/ออกจากการวิเคราะห์เทคนิค + ข่าว</p>
          </div>
          <Link href="/signals" className="text-sm text-accent-glow hover:underline flex items-center gap-1">
            ดูทั้งหมด <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {topSignals.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
