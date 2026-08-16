'use client';

import { useMemo } from 'react';
import MetricCard from '@/components/dashboard/MetricCard';
import EquityChart from '@/components/charts/EquityChart';
import SignalCard from '@/components/trading/SignalCard';
import MarketRow from '@/components/trading/MarketRow';
import { useSignals, usePrices, useTrades, useDashboardStats, useWatchlist } from '@/hooks/useData';
import { generateEquityCurve } from '@/lib/demo-data';
import { isDemoMode } from '@/lib/supabase';
import Link from 'next/link';
import {
  Zap, Target, Activity, ArrowRight, DollarSign, Compass, FlaskConical,
} from 'lucide-react';

export default function DashboardPage() {
  const demo = isDemoMode();
  const { data: signals } = useSignals('active');
  const { data: prices } = usePrices();
  const { data: trades } = useTrades();
  const { data: watchlist, loading: watchlistLoading } = useWatchlist();
  const { data: stats, error: statsError } = useDashboardStats();

  // โหมดจริง: equity curve คือกำไรสะสมจากออเดอร์ที่ปิดแล้ว ไม่ใช่กราฟตัวอย่าง
  const equityData = useMemo(() => {
    if (demo) return generateEquityCurve();
    const closed = trades
      .filter(t => t.status === 'closed' && t.closed_at)
      .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());

    let cumulative = 0;
    return closed.map(t => {
      cumulative += Number(t.pnl) || 0;
      return {
        date: new Date(t.closed_at!).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
        value: Number(cumulative.toFixed(2)),
      };
    });
  }, [demo, trades]);

  const topSignals = signals.slice(0, 3);
  const topMovers = [...prices].sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent)).slice(0, 5);
  const needsSetup = !demo && !watchlistLoading && watchlist.length === 0;

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

      {needsSetup && (
        <div className="card border-accent-glow/20 bg-accent-glow/5 flex items-start gap-3">
          <Compass className="w-5 h-5 text-accent-glow flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-white font-medium">เริ่มใช้งานใน 2 ขั้น</p>
            <p className="text-xs text-gray-400 mt-1">
              1) เพิ่ม symbol ที่อยากติดตามในหน้า <Link href="/markets" className="text-accent-glow hover:underline">ตลาด</Link>
              {' '}2) กดปุ่ม &ldquo;สแกนตลาด&rdquo; มุมขวาบน — จากนั้นระบบจะสแกนให้เองทุกวัน 08:00 น. และแจ้งเข้า Telegram ถ้าตั้งค่าไว้
            </p>
          </div>
          <Link href="/markets" className="btn-primary text-xs flex items-center gap-1.5 flex-shrink-0">
            ไปหน้าตลาด <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* โหลดสถิติไม่ได้ต้องบอกให้รู้ ไม่ใช่ปล่อยการ์ดโชว์ 0 ทุกใบ
          ซึ่งหน้าตาเหมือนผู้ใช้ใหม่ที่ยังไม่เคยเทรด ทั้งที่หน้าพอร์ตยังมีตัวเลขจริงอยู่ */}
      {statsError && (
        <div className="card border-red-500/20 bg-red-500/5 text-sm text-red-400">
          โหลดสถิติพอร์ตไม่สำเร็จ — ตัวเลขในการ์ดด้านล่างจึงยังไม่ใช่ของจริง
          <span className="block text-xs text-red-400/70 mt-1 font-mono">{statsError}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="กำไร/ขาดทุนรวม"
          value={stats.total_pnl}
          change={stats.total_pnl_percent}
          // ยอดนี้บวกข้ามสกุลเงิน (หุ้นไทยเป็นบาท / หุ้น US · ทอง · forex เป็นดอลลาร์)
          // โดยไม่มีการแปลงอัตราแลกเปลี่ยน จึงติดสัญลักษณ์สกุลเงินไม่ได้
          format="amount"
          icon={DollarSign}
          iconColor={stats.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          delay={0}
        />
        {/* change = null ทุกใบ เพราะยังไม่มีการวัด "การเปลี่ยนแปลงเทียบช่วงก่อนหน้า" จริงสักตัว
            เดิมส่ง 0 แล้วการ์ดโชว์ '+0.0%' ซึ่งอ่านได้ว่าวัดแล้วไม่เปลี่ยน — คนละเรื่องกับยังไม่วัด */}
        <MetricCard
          label="Win Rate"
          value={stats.win_rate}
          change={null}
          format="percent"
          icon={Target}
          iconColor="text-accent-glow"
          delay={50}
        />
        <MetricCard
          label="สัญญาณวันนี้"
          value={stats.total_signals_today}
          change={null}
          format="number"
          icon={Zap}
          iconColor="text-accent-gold"
          delay={100}
        />
        <MetricCard
          label="กำลังเทรด"
          value={stats.open_trades}
          change={null}
          format="number"
          icon={Activity}
          iconColor="text-accent-purple"
          delay={150}
        />
      </div>

      {/* ชวนไปดูผลวัดจริง — จงใจไม่โชว์ตัวเลขสถิติใด ๆ ตรงนี้
          เพราะผล backtest ต้องมาจากการรันทดสอบจริงในหน้านั้น ไม่ใช่เลขที่แปะไว้ล่วงหน้า */}
      <Link href="/backtest" className="card-hover flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-purple/10 text-accent-purple flex items-center justify-center flex-shrink-0">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">สัญญาณแม่นแค่ไหน? — วัดด้วย Backtest</p>
          <p className="text-xs text-gray-500 mt-0.5">
            ทดสอบสัญญาณกับข้อมูลย้อนหลังจริงก่อนเชื่อ ไม่ต้องเดาจากความรู้สึก
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EquityChart
            data={equityData}
            subtitle={demo ? 'ประสิทธิภาพพอร์ต 30 วัน' : 'กำไรสะสมจากออเดอร์ที่ปิดแล้ว'}
            emptyText="ยังไม่มีออเดอร์ที่ปิดแล้ว — กราฟจะขึ้นเมื่อปิดออเดอร์แรก"
          />
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">ตลาดที่เคลื่อนไหวมาก</h3>
            <Link href="/markets" className="text-xs text-accent-glow hover:underline flex items-center gap-1">
              ดูทั้งหมด <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {topMovers.length === 0 ? (
              <p className="text-xs text-gray-500 py-8 text-center">ยังไม่มีราคา — เพิ่ม symbol แล้วกด &ldquo;สแกนตลาด&rdquo;</p>
            ) : (
              topMovers.map((p) => <MarketRow key={p.symbol} price={p} />)
            )}
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
        {topSignals.length === 0 ? (
          <div className="card text-center py-12 text-sm text-gray-500">
            ยังไม่มีสัญญาณที่ยังใช้งานอยู่
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {topSignals.map((s) => (
              <SignalCard key={s.id} signal={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
