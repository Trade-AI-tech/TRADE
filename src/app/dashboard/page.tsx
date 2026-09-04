'use client';

import { useMemo } from 'react';
import MetricCard from '@/components/dashboard/MetricCard';
import SignalCard from '@/components/trading/SignalCard';
import MarketRow from '@/components/trading/MarketRow';
import { useSignals, usePrices, useDashboardStats, useWatchlist } from '@/hooks/useData';
import { isDemoMode } from '@/lib/supabase';
import { flipReversalIndex, isLiveSignalRow } from '@/lib/signal-flips';
import Link from 'next/link';
import {
  Zap, Activity, ArrowRight, Compass, FlaskConical, TrendingUp, TrendingDown,
} from 'lucide-react';

export default function DashboardPage() {
  const demo = isDemoMode();
  const { data: allActive } = useSignals('active');
  const { data: prices } = usePrices();
  const { data: watchlist, loading: watchlistLoading } = useWatchlist();
  const { data: stats, loading: statsLoading, error: statsError } = useDashboardStats();

  /**
   * status='active' จาก query อย่างเดียวยังไม่พอ ต้องผ่าน ledger ด้วย
   *
   * ในโหมดที่ยังไม่ได้รัน migration 007 ตัวกรองนี้ผ่านทุกใบ = พฤติกรรมเดิม
   * ในโหมดปกติมันซ้ำกับสิ่งที่ตัวเก็บผลปั๊มไว้แล้ว — แต่ตัวเก็บผลรันแบบ continue-on-error
   * ใน workflow (Yahoo ล่มแล้วข้ามได้) ฝั่งอ่านจึงต้องเชื่อ outcome ได้ด้วยตัวเอง
   * ไม่ใช่รอให้ใครมาปั๊ม status ให้ก่อน
   */
  const signals = useMemo(() => allActive.filter(isLiveSignalRow), [allActive]);

  // หน้านี้เป็นสัญญาณล้วน — ส่วนพอร์ต (EquityChart/กำไรขาดทุน/Win Rate) ถูกถอดออกโดยตั้งใจ
  // เพราะผู้ใช้เทรดผ่านพอร์ตโบรกเกอร์ภายนอก ตัวเลขทุกใบด้านล่างจึงนับจากสัญญาณที่โหลดมาจริง
  // (useSignals('active')) ไม่ใช่เลขพอร์ตที่ไม่มีใครกรอก
  const summary = useMemo(
    () => ({
      buy: signals.filter((s) => s.action === 'BUY').length,
      sell: signals.filter((s) => s.action === 'SELL').length,
    }),
    [signals]
  );

  const topSignals = signals.slice(0, 6);
  // ใบใหม่ใบไหนกลับทิศใบเก่า — ประกอบจากชุด active ทั้งหมด (ใบเก่าที่โดนกลับทิศ
  // ยัง active อยู่จึงอยู่ในชุดนี้ด้วย) ไม่ใช่แค่ 6 ใบที่โชว์
  const reversals = useMemo(() => flipReversalIndex(signals), [signals]);
  const topMovers = [...prices].sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent)).slice(0, 5);
  const needsSetup = !demo && !watchlistLoading && watchlist.length === 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-[rgb(var(--text-primary))]">Dashboard</h1>
          <p className="text-sm text-[rgb(var(--text-muted))] mt-0.5">
            ภาพรวมสัญญาณ AI และตลาดวันนี้
          </p>
        </div>
      </div>

      {needsSetup && (
        <div className="card border-accent-glow/20 bg-accent-glow/5 flex items-start gap-3">
          {/* text-accent-glow ไม่ใช่ฟ้านีออนตายตัวแล้ว — tailwind.config ผูกไว้กับ --accent-glow
              ซึ่งเป็นฟ้าเข้ม (cyan-700) บนธีมสว่างและฟ้านีออนเดิมบนธีมมืด จึงอ่านออกทั้งสองธีม */}
          <Compass className="w-5 h-5 text-accent-glow flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-[rgb(var(--text-primary))] font-medium">เริ่มใช้งานใน 2 ขั้น</p>
            <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">
              1) เพิ่ม symbol ที่อยากติดตามในหน้า <Link href="/markets" className="text-accent-glow hover:underline">ตลาด</Link>
              {' '}2) กดปุ่ม &ldquo;สแกนตลาด&rdquo; มุมขวาบน — จากนั้นระบบจะสแกนให้เองทุกวัน 08:00 น. และแจ้งเข้า Telegram ถ้าตั้งค่าไว้
            </p>
          </div>
          <Link href="/markets" className="btn-primary text-xs flex items-center gap-1.5 flex-shrink-0">
            ไปหน้าตลาด <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* โหลดสถิติจาก RPC ไม่ได้ต้องบอกให้รู้ — การ์ด "สัญญาณวันนี้" ใบเดียวที่พึ่ง RPC นี้
          จะค้างที่ 0 ซึ่งหน้าตาเหมือน "วันนี้ไม่มีสัญญาณ" ทั้งที่จริงคือโหลดไม่สำเร็จ */}
      {statsError && (
        <div className="card border-red-500/20 bg-red-500/5 text-sm text-red-700 dark:text-down">
          โหลดสถิติไม่สำเร็จ — ตัวเลข &ldquo;สัญญาณวันนี้&rdquo; ด้านล่างจึงยังไม่ใช่ของจริง
          {/* ข้อความ error ดิบต้องอ่านออกจริง — เดิมเป็น text-red-400/70 ซึ่งบนพื้นสว่างเหลือ ~4.3:1
              ตกเกณฑ์ AA จึงใช้เฉดเข้มทึบเต็มแล้วให้ขนาดตัวอักษร (text-xs) เป็นตัวลดความเด่นแทน */}
          <span className="block text-xs text-red-700 dark:text-down mt-1 font-mono">{statsError}</span>
        </div>
      )}

      {/* change = null ทุกใบ เพราะยังไม่มีการวัด "การเปลี่ยนแปลงเทียบช่วงก่อนหน้า" จริงสักตัว
          ส่ง 0 ไปการ์ดจะโชว์ '+0.0%' ซึ่งอ่านได้ว่าวัดแล้วไม่เปลี่ยน — คนละเรื่องกับยังไม่วัด */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="สัญญาณ active ตอนนี้"
          value={signals.length}
          change={null}
          format="number"
          icon={Activity}
          iconColor="text-accent-glow"
          delay={0}
        />
        <MetricCard
          label="สัญญาณวันนี้"
          // ระหว่าง RPC ยังโหลด ค่าใน stats คือ 0 ตั้งต้น ไม่ใช่ผลวัด — โชว์ '—' แทน
          value={statsLoading ? null : stats.total_signals_today}
          change={null}
          format="number"
          icon={Zap}
          iconColor="text-accent-gold"
          delay={50}
        />
        <MetricCard
          label="BUY ตอนนี้"
          value={summary.buy}
          change={null}
          format="number"
          icon={TrendingUp}
          iconColor="text-up"
          delay={100}
        />
        <MetricCard
          label="SELL ตอนนี้"
          value={summary.sell}
          change={null}
          format="number"
          icon={TrendingDown}
          iconColor="text-down"
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
          <p className="text-sm font-medium text-[rgb(var(--text-primary))]">สัญญาณแม่นแค่ไหน? — วัดด้วย Backtest</p>
          <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">
            ทดสอบสัญญาณกับข้อมูลย้อนหลังจริงก่อนเชื่อ ไม่ต้องเดาจากความรู้สึก
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-[rgb(var(--text-muted))] flex-shrink-0" />
      </Link>

      {/* ส่วนสัญญาณล่าสุดขยายเป็น 6 ใบ — กินพื้นที่ที่เคยเป็นกราฟพอร์ต (EquityChart)
          เพราะหน้านี้ไม่มีพอร์ตให้พล็อตแล้ว สัญญาณคือเนื้อหาหลักของระบบ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-display text-[rgb(var(--text-primary))] flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent-glow" />
              สัญญาณ AI ล่าสุด
            </h2>
            <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">จุดเข้า/ออกจากการวิเคราะห์เทคนิค + ข่าว</p>
          </div>
          <Link href="/signals" className="text-sm text-accent-glow hover:underline flex items-center gap-1">
            ดูทั้งหมด <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {topSignals.length === 0 ? (
          <div className="card text-center py-12 text-sm text-[rgb(var(--text-muted))]">
            ยังไม่มีสัญญาณที่ยังใช้งานอยู่
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {topSignals.map((s) => (
              <SignalCard key={s.id} signal={s} reversal={reversals.get(s.id) ?? null} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[rgb(var(--text-primary))]">ตลาดที่เคลื่อนไหวมาก</h3>
          <Link href="/markets" className="text-xs text-accent-glow hover:underline flex items-center gap-1">
            ดูทั้งหมด <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {topMovers.length === 0 ? (
            <p className="text-xs text-[rgb(var(--text-muted))] py-8 text-center">ยังไม่มีราคา — เพิ่ม symbol แล้วกด &ldquo;สแกนตลาด&rdquo;</p>
          ) : (
            topMovers.map((p) => <MarketRow key={p.symbol} price={p} />)
          )}
        </div>
      </div>
    </div>
  );
}
