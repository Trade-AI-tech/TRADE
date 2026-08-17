'use client';

import { useMemo, useState } from 'react';
import { useWatchlist } from '@/hooks/useData';
import { cn } from '@/lib/utils';
import {
  FlaskConical,
  AlertTriangle,
  Loader2,
  Play,
  XCircle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
// import type อย่างเดียว — ถูกลบตอน compile จึงไม่ลาก signal-engine เข้า client bundle
import type { BacktestResult, BacktestStats, BacktestExitReason } from '@/lib/backtest';
import type { MarketType } from '@/types';

// ============================================
// ค่าคงที่ของฟอร์ม
// ============================================

const MARKETS: { value: MarketType; label: string; icon: string; hint: string }[] = [
  { value: 'GOLD', label: 'ทอง', icon: '🥇', hint: 'XAUUSD' },
  { value: 'FOREX', label: 'Forex', icon: '💱', hint: 'EURUSD, USDTHB' },
  { value: 'TH_STOCK', label: 'หุ้นไทย', icon: '🇹🇭', hint: 'PTT, AOT (ไม่ต้องใส่ .BK)' },
  { value: 'US_STOCK', label: 'หุ้น US', icon: '🇺🇸', hint: 'AAPL, NVDA' },
  { value: 'CRYPTO', label: 'Crypto', icon: '₿', hint: 'BTC, ETH' },
];

type Timeframe = '1D' | '1H';

// ============================================
// ตัวช่วยแสดงผล
// ============================================

function fmtPrice(v: number): string {
  const abs = Math.abs(v);
  const digits = abs !== 0 && abs < 1 ? 6 : abs < 100 ? 4 : 2;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

function fmtR(v: number | null): string {
  if (v === null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`;
}

function fmtPct(v: number | null): string {
  // winRate จาก lib เป็นสัดส่วน 0–1 และเป็น null เมื่อไม่มีไม้ให้วัด — ห้ามแปลง null เป็น 0%
  if (v === null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtTime(iso: string, tf: Timeframe): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return tf === '1H'
    ? d.toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
}

/**
 * สีตามความหมายของการออก: SL แดง / TP เขียว / หมดเวลา เทา / gap ส้ม
 * gap แยกสีของตัวเองเพราะราคา fill จริงต่างจากระดับที่ตั้ง (แย่กว่า SL / ดีเกิน TP)
 * — ผู้ใช้ควรเห็นชัดว่าไม้ไหนโดนธรรมชาติของ gap เล่นงาน
 *
 * ป้ายพวกนี้วางบนพื้นสีจาง 10% ซึ่งบนธีมสว่างจะดูดคอนทราสต์ของตัวหนังสือลง
 * ฝั่งแดง/ส้มจึงระบุเฉดเข้มไว้เองสำหรับธีมสว่าง (text-down เหลือ 4.2:1 ตกเกณฑ์ AA)
 * แล้วให้ dark: คืนสีเดิมของธีมมืด ส่วนฝั่งเขียวใช้ text-up ได้เลยเพราะยังผ่านเกณฑ์
 */
const REASON_BADGE: Record<BacktestExitReason, { label: string; cls: string }> = {
  stop_loss: { label: 'ชน SL', cls: 'bg-red-500/10 text-red-700 dark:text-down border-red-500/30' },
  take_profit: { label: 'ชน TP', cls: 'bg-emerald-500/10 text-up border-emerald-500/30' },
  time_exit: { label: 'ครบเวลาถือ', cls: 'bg-surface-2 text-[rgb(var(--text-secondary))] border-[var(--border-subtle)]' },
  gap_stop: { label: 'Gap ทะลุ SL', cls: 'bg-orange-500/10 text-orange-800 dark:text-orange-400 border-orange-500/30' },
  gap_target: { label: 'Gap ทะลุ TP', cls: 'bg-orange-500/10 text-orange-800 dark:text-orange-400 border-orange-500/30' },
};

function StatCard({
  label,
  value,
  sub,
  tone = 'default',
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'up' | 'down';
  title?: string;
}) {
  return (
    <div className="card" title={title}>
      <div className="text-xs text-[rgb(var(--text-muted))]">{label}</div>
      <div
        className={cn(
          'text-xl font-mono font-bold mt-1',
          tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-[rgb(var(--text-primary))]'
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-[rgb(var(--text-muted))] mt-1">{sub}</div>}
    </div>
  );
}

/**
 * 1R หมายถึงอะไร — ต้องอ่านจาก riskModel ที่ API ส่งมา ห้ามพิมพ์ทับไว้
 *
 * ตั้งแต่ backtest.ts รองรับสองนิยาม ตัวเลข R บนหน้านี้เปลี่ยนความหมายไปแล้ว
 * ที่สังเกตได้ชัดที่สุดคือ **ไม้ที่ชน SL ไม่ได้เป็น −1.00R เป๊ะทุกไม้อีกต่อไป**
 * (เดิมเป็น −1.00 เสมอโดยโครงสร้าง ตอนนี้เห็นได้ตั้งแต่ราว −0.3R ถึง −2R)
 * ถ้าไม่มีคำอธิบาย ผู้ใช้จะคิดว่าโค้ดพัง ทั้งที่นี่คือความเสี่ยงจาก gap ที่เดิมถูกซ่อนไว้
 */
function riskModelNote(riskModel?: string): string {
  if (riskModel === 'realized') {
    return '1R = ระยะจากราคาที่เข้าไม้จริงถึง SL · ไม้ที่ชน SL จะได้ −1.00R เป๊ะเสมอ ' +
      'แต่ถ้าราคาเปิดกระโดดมาเกือบทับ SL ตัวหารจะเล็กมากจน R ของไม้เดียวใหญ่ผิดปกติได้';
  }
  // 'planned' คือค่าเริ่มต้น · เผื่อ API เวอร์ชันเก่าที่ยังไม่ส่งฟิลด์นี้มาด้วย
  return '1R = ระยะที่ตั้งใจเสี่ยงตอนออกสัญญาณ (ราคาที่สัญญาณคิดไว้ ถึง SL) ' +
    'ไม้ที่ชน SL จึงไม่ได้เป็น −1.00R เป๊ะทุกไม้ — ส่วนที่ต่างคือผลของ gap ตอนเปิดตลาด ซึ่งเป็นความเสี่ยงจริง';
}

function EquityCurveR({ points, riskModel }: { points: { n: number; cumR: number }[]; riskModel?: string }) {
  const final = points[points.length - 1]?.cumR ?? 0;
  const isUp = final >= 0;

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[rgb(var(--text-primary))]">Equity Curve</h3>
          <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">ผลสะสมเป็น R ทีละไม้ (เริ่มจาก 0)</p>
          <p className="text-[11px] text-[rgb(var(--text-muted))] mt-1 max-w-md">{riskModelNote(riskModel)}</p>
        </div>
        <div className={cn('text-xl font-mono font-bold', isUp ? 'text-up' : 'text-down')}>
          {fmtR(final)}
        </div>
      </div>
      {/* มือถือลดความสูงกราฟ — จอเตี้ย ถ้าสูง 260px กราฟจะกินจอจนต้องเลื่อนหาสถิติ
          สีเส้นกราฟผูกกับ color ของกล่องนี้ (--up/--down) แล้วให้ SVG ข้างในใช้ currentColor
          เพราะ recharts รับสีเป็นสตริงคงที่ — ถ้าฮาร์ดโค้ดเขียวอ่อนไว้ พอเป็นธีมสว่างเส้นจะจางจนมองไม่เห็น */}
      <div className={cn('h-[200px] sm:h-[260px]', isUp ? 'text-up' : 'text-down')}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="bt-equity-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* เส้นตาราง/แกน: ต้องพลิกตามธีม ไม่ใช่ใช้เทากลางค่าเดียว
                เทากลางทำให้ธีมมืดสว่างขึ้นราวเท่าตัวจากที่ผู้ใช้เคยเห็น (วัดได้ rgb(26,27,33) → rgb(49,54,64))
                ใส่เป็น className ไม่ใช่ prop stroke เพราะ SVG presentation attribute ไม่รู้จัก var()
                — CSS มีลำดับสูงกว่า attribute ค่าที่ recharts ใส่มาเองจึงถูกทับ
                ค่าฝั่งมืดคือค่าเดิมก่อนมีระบบธีมเป๊ะ (0.04 / 0.15 ของขาว) */}
            <CartesianGrid strokeDasharray="3 3" className="stroke-black/[0.08] dark:stroke-white/[0.04]" />
            {/* ตัวเลขแกนฝั่งมืดคง #71717a ของเดิมไว้ ส่วนฝั่งสว่างต้องเข้มขึ้นถึงจะอ่านออกบนการ์ดขาว */}
            <XAxis dataKey="n" tick={{ fontSize: 11, className: 'fill-gray-600 dark:fill-[#71717a]' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, className: 'fill-gray-600 dark:fill-[#71717a]' }} tickLine={false} axisLine={false} width={50} />
            <ReferenceLine y={0} className="stroke-black/[0.25] dark:stroke-white/[0.15]" strokeDasharray="4 4" />
            {/* tooltip เป็น inline style ของ div จริง จึงใส่ var() ได้ตรง ๆ (ต่างจาก attribute ของ SVG)
                ต้องสลับพื้นตามธีมด้วย ไม่งั้นธีมสว่างจะได้ตัวเลขเขียวเข้มบนพื้นดำ = คอนทราสต์ตก */}
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgb(var(--surface-2))',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '12px',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'rgb(var(--text-secondary))', marginBottom: '4px' }}
              labelFormatter={(n) => `หลังไม้ที่ ${n}`}
              formatter={(value) => [fmtR(Number(value)), 'R สะสม']}
            />
            <Area
              type="monotone"
              dataKey="cumR"
              stroke="currentColor"
              strokeWidth={2}
              fill="url(#bt-equity-grad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'currentColor', fill: 'currentColor' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** แถวสถิติแยกฝั่ง BUY/SELL — วัดด้วยกติกาเดียวกับภาพรวมเป๊ะ (มาจาก computeStats ตัวเดียวกัน) */
function SideStatsRow({ side, s }: { side: 'BUY' | 'SELL'; s: BacktestStats }) {
  const isBuy = side === 'BUY';
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2">
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold w-[72px] justify-center',
          isBuy ? 'bg-emerald-500/10 text-up' : 'bg-red-500/10 text-red-700 dark:text-down'
        )}
      >
        {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {side}
      </span>
      <span className="text-sm text-[rgb(var(--text-secondary))]">
        {s.count} ไม้
      </span>
      <span className="text-sm text-[rgb(var(--text-secondary))]">
        Win Rate <span className="font-mono text-[rgb(var(--text-primary))]">{fmtPct(s.winRate)}</span>
      </span>
      <span className="text-sm text-[rgb(var(--text-secondary))]">
        เฉลี่ย{' '}
        <span
          className={cn(
            'font-mono',
            s.avgR === null ? 'text-[rgb(var(--text-muted))]' : s.avgR >= 0 ? 'text-up' : 'text-down'
          )}
        >
          {fmtR(s.avgR)}
        </span>
      </span>
      <span className="text-sm text-[rgb(var(--text-secondary))]">
        PF{' '}
        <span
          className="font-mono text-[rgb(var(--text-primary))]"
          title={
            s.profitFactor === null && s.count > 0 && s.grossLossR === 0
              ? 'ยังไม่มีไม้แพ้ในฝั่งนี้ — อัตราส่วนหารไม่ได้'
              : undefined
          }
        >
          {s.profitFactor !== null ? s.profitFactor.toFixed(2) : '—'}
        </span>
      </span>
    </div>
  );
}

// ============================================
// หน้า Backtest
// ============================================

interface CompletedRun {
  symbol: string;
  market: MarketType;
  timeframe: Timeframe;
  feesR: number;
  demo: boolean;
  period: { from: string; to: string } | null;
  result: BacktestResult;
}

export default function BacktestPage() {
  const { data: watchlist } = useWatchlist();

  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState<MarketType>('GOLD');
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [feesR, setFeesR] = useState('0');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<CompletedRun | null>(null);

  const activeHint = MARKETS.find((m) => m.value === market)?.hint;

  // equity curve สะสมเป็น R สร้างจาก R รายไม้ที่ backtest วัดมาแล้ว — เป็นการแปลงรูป ไม่ใช่การวัดใหม่
  const equityPoints = useMemo(() => {
    if (!run || run.result.trades.length === 0) return null;
    let cum = 0;
    const pts = [{ n: 0, cumR: 0 }];
    run.result.trades.forEach((t, i) => {
      cum += t.r;
      pts.push({ n: i + 1, cumR: Number(cum.toFixed(4)) });
    });
    return pts;
  }, [run]);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = symbol.trim().toUpperCase();
    if (!sym || running) return;
    setRunning(true);
    setError(null);
    try {
      const fees = Number(feesR);
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: sym,
          market,
          timeframe,
          feesR: Number.isFinite(fees) && fees > 0 ? fees : 0,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'รัน backtest ไม่สำเร็จ');

      setRun({
        symbol: typeof json.symbol === 'string' ? json.symbol : sym,
        market: MARKETS.some((m) => m.value === json.market) ? (json.market as MarketType) : market,
        timeframe: json.timeframe === '1H' ? '1H' : '1D',
        feesR: typeof json.feesR === 'number' && Number.isFinite(json.feesR) ? json.feesR : 0,
        demo: Boolean(json.demo),
        period:
          json.period && typeof json.period.from === 'string' && typeof json.period.to === 'string'
            ? { from: json.period.from, to: json.period.to }
            : null,
        result: json.result as BacktestResult,
      });
    } catch (err) {
      // ผลเก่าค้างไว้คู่กับ error ใหม่จะอ่านปนกัน — ล้างทิ้งให้เหลือแต่ข้อความจริงจาก API
      setRun(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const stats = run?.result.stats ?? null;
  const marketLabel = run ? MARKETS.find((m) => m.value === run.market)?.label ?? run.market : '';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* แถบความซื่อสัตย์ — อยู่บนสุดเสมอ ตัวหนังสือขนาดอ่านจริง ไม่ใช่ disclaimer ตัวจิ๋ว */}
      <div className="card border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-amber-700 dark:text-amber-200/90 space-y-1">
          <p className="font-semibold text-amber-800 dark:text-amber-300">ข้อจำกัดของผลทดสอบ — อ่านก่อนเชื่อตัวเลข</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>ผลทดสอบย้อนหลังไม่การันตีผลในอนาคต</li>
            <li>
              ทดสอบบนแท่ง OHLC จึงมองไม่เห็นลำดับราคาภายในแท่ง — แท่งที่ชนทั้ง SL และ TP
              จะนับเป็นโดน SL ก่อนเสมอ (เลือกทางแย่ไว้ก่อน)
            </li>
            <li>
              {run && run.feesR > 0
                ? `หักต้นทุนต่อไม้ feesR = ${run.feesR} R แล้ว (ตามค่าที่คุณกรอก)`
                : 'ตัวเลขทั้งหมดยังไม่รวมค่าธรรมเนียม/slippage (feesR = 0) — ผลจริงจะแย่กว่านี้'}
            </li>
          </ul>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-display text-[rgb(var(--text-primary))] flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-accent-glow" />
          Backtest
        </h1>
        <p className="text-sm text-[rgb(var(--text-muted))] mt-0.5">
          วัดผลจริงของ signal engine บนข้อมูลย้อนหลัง — เดินทีละแท่ง เข้าไม้ที่ราคาเปิดแท่งถัดไป
        </p>
      </div>

      {/* ฟอร์มตั้งค่าการทดสอบ */}
      <form onSubmit={handleRun} className="card space-y-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder={activeHint}
            className="input-field flex-1 min-w-[180px] uppercase"
          />
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as MarketType)}
            className="input-field w-auto min-w-[150px]"
          >
            {MARKETS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.icon} {m.label}
              </option>
            ))}
          </select>

          {/* Timeframe toggle 1D/1H */}
          <div className="flex rounded-xl border border-[var(--border-subtle)] overflow-hidden">
            {(['1D', '1H'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  'px-4 py-2 text-sm font-mono font-medium transition-colors',
                  timeframe === tf
                    ? 'bg-accent-glow/10 text-cyan-800 dark:text-accent-glow'
                    : 'bg-transparent text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2'
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={running || !symbol.trim()}
            // มือถือ: ปุ่มรันเต็มความกว้าง — เป็น action หลักของหน้า ต้องกดง่ายด้วยนิ้วเดียว
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40 w-full sm:w-auto"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            รัน Backtest
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[rgb(var(--text-muted))]">
            ต้นทุนต่อไม้ (สัดส่วนของ R เช่น 0.05 = 5% ของระยะ SL)
          </label>
          <input
            type="number"
            value={feesR}
            onChange={(e) => setFeesR(e.target.value)}
            min={0}
            step={0.01}
            className="input-field w-28 font-mono"
          />
          <span className="text-[11px] text-[rgb(var(--text-muted))]">
            0 = ยังไม่รวมค่าธรรมเนียม — เราไม่เดาต้นทุนให้ เพราะแต่ละโบรกเกอร์ไม่เท่ากัน
          </span>
        </div>

        {watchlist.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-[rgb(var(--text-muted))] uppercase">เลือกจาก watchlist:</div>
            <div className="flex flex-wrap gap-1.5">
              {watchlist.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setSymbol(w.symbol);
                    setMarket(w.market);
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors border',
                    symbol.trim().toUpperCase() === w.symbol
                      ? 'border-accent-glow/30 bg-accent-glow/10 text-cyan-800 dark:text-accent-glow'
                      : 'border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2'
                  )}
                >
                  {w.symbol}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* สถานะ: error → กำลังรัน → ผลลัพธ์ → ยังไม่เคยรัน */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border text-sm bg-red-500/10 border-red-500/30 text-red-700 dark:text-down">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {running ? (
        <div className="card text-center py-16 text-[rgb(var(--text-secondary))] flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent-glow" />
          <p className="text-sm">กำลังดึงข้อมูลย้อนหลังและจำลองการเทรดทีละแท่ง...</p>
        </div>
      ) : run && stats ? (
        <>
          {/* บรรทัดบอกที่มาของตัวเลข: ทดสอบอะไร ช่วงไหน กี่แท่ง */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[rgb(var(--text-secondary))]">
            <span className="font-semibold text-[rgb(var(--text-primary))] font-mono">{run.symbol}</span>
            <span>{marketLabel}</span>
            <span className="font-mono">TF {run.timeframe}</span>
            <span>{run.result.bars.toLocaleString()} แท่ง</span>
            {run.period && (
              <span>
                {fmtTime(run.period.from, run.timeframe)} → {fmtTime(run.period.to, run.timeframe)}
              </span>
            )}
            {/* ตัวหนังสือ 11px บนพื้นเหลืองจาง — ธีมสว่างต้องใช้ amber-800 ถึงจะผ่านคอนทราสต์ */}
            {run.demo && (
              <span className="px-2 py-0.5 rounded-lg text-[11px] bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/30">
                Demo — ข้อมูลจำลอง ไม่ใช่ราคาจริง
              </span>
            )}
          </div>

          {stats.count === 0 ? (
            <div className="card text-center py-16">
              <FlaskConical className="w-12 h-12 text-[rgb(var(--text-muted))] mx-auto mb-3" />
              <p className="text-[rgb(var(--text-secondary))]">
                ช่วงข้อมูลนี้ระบบไม่เปิดไม้เลย — ไม่มีสัญญาณ BUY/SELL ที่เข้าเงื่อนไข
                จึงไม่มีตัวเลขให้วัด
              </p>
              {run.result.skipped > 0 && (
                <p className="text-xs text-[rgb(var(--text-muted))] mt-2">
                  (มีสัญญาณถูกทิ้ง {run.result.skipped} ครั้ง เพราะแท่งเข้าข้อมูลเสียหรือระยะ SL ใช้ไม่ได้)
                </p>
              )}
            </div>
          ) : (
            <>
              {/* การ์ดสถิติหลัก */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <StatCard
                  label="จำนวนไม้"
                  value={String(stats.count)}
                  sub={`ชนะ ${stats.wins} · แพ้ ${stats.losses}${
                    run.result.skipped > 0 ? ` · ทิ้ง ${run.result.skipped}` : ''
                  }`}
                />
                <StatCard
                  label="Win Rate"
                  value={fmtPct(stats.winRate)}
                  sub={`${stats.wins}/${stats.count} ไม้ (R > 0)`}
                />
                <StatCard
                  label="Profit Factor"
                  value={stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : '—'}
                  tone={
                    stats.profitFactor === null
                      ? 'default'
                      : stats.profitFactor >= 1
                        ? 'up'
                        : 'down'
                  }
                  title={
                    stats.profitFactor === null
                      ? stats.grossLossR === 0
                        ? 'ยังไม่มีไม้แพ้ในช่วงทดสอบ — อัตราส่วนกำไร/ขาดทุนจึงหารไม่ได้ (ไม่ใช่อนันต์)'
                        : 'ยังคำนวณไม่ได้จากข้อมูลที่มี'
                      : 'กำไรรวม (R) หารด้วยขาดทุนรวม (R)'
                  }
                  sub={
                    stats.profitFactor === null && stats.grossLossR === 0
                      ? 'ยังไม่มีไม้แพ้'
                      : undefined
                  }
                />
                <StatCard
                  label="Expectancy"
                  value={fmtR(stats.expectancyR)}
                  tone={
                    stats.expectancyR === null ? 'default' : stats.expectancyR >= 0 ? 'up' : 'down'
                  }
                  sub="เฉลี่ยต่อไม้"
                />
                <StatCard
                  label="Max Drawdown"
                  value={
                    stats.maxDrawdownR !== null
                      ? `-${Math.abs(stats.maxDrawdownR).toFixed(2)}R`
                      : '—'
                  }
                  tone={stats.maxDrawdownR !== null && stats.maxDrawdownR > 0 ? 'down' : 'default'}
                  sub="ร่วงลึกสุดจากจุดสูงสุดของ equity"
                />
                <StatCard
                  label="แพ้ติดกันสูงสุด"
                  value={`${stats.maxConsecutiveLosses} ไม้`}
                />
              </div>

              {/* แยกฝั่ง BUY/SELL — บอกได้ว่าเครื่องยนต์เก่งฝั่งไหน แพ้ฝั่งไหน */}
              <div className="card">
                <h3 className="text-sm font-semibold text-[rgb(var(--text-primary))] mb-1">แยกฝั่ง BUY / SELL</h3>
                <div className="divide-y divide-[var(--border-subtle)]">
                  <SideStatsRow side="BUY" s={stats.byAction.BUY} />
                  <SideStatsRow side="SELL" s={stats.byAction.SELL} />
                </div>
              </div>

              {/* Equity curve สะสมเป็น R — ส่ง riskModel ไปด้วยเพื่อให้อธิบายได้ว่า 1R คืออะไร */}
              {equityPoints && <EquityCurveR points={equityPoints} riskModel={run.result.riskModel} />}

              {/* ตารางไม้ทั้งหมด */}
              <div className="card overflow-x-auto">
                <h3 className="text-sm font-semibold text-[rgb(var(--text-primary))] mb-3">
                  รายละเอียดทุกไม้ ({run.result.trades.length})
                </h3>
                <table className="w-full text-sm min-w-[680px]">
                  <thead>
                    <tr className="text-left text-xs text-[rgb(var(--text-muted))] border-b border-[var(--border-subtle)]">
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">เข้า</th>
                      <th className="py-2 pr-3 font-medium">ออก</th>
                      <th className="py-2 pr-3 font-medium">ทิศ</th>
                      <th className="py-2 pr-3 font-medium text-right">Entry</th>
                      <th className="py-2 pr-3 font-medium text-right">Exit</th>
                      <th className="py-2 pr-3 font-medium">เหตุผลออก</th>
                      <th className="py-2 font-medium text-right">R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.result.trades.map((t, i) => {
                      const badge = REASON_BADGE[t.exitReason] ?? {
                        label: t.exitReason,
                        cls: 'bg-surface-2 text-[rgb(var(--text-secondary))] border-[var(--border-subtle)]',
                      };
                      const isBuy = t.action === 'BUY';
                      return (
                        <tr key={i} className="border-b border-[var(--border-subtle)] last:border-0">
                          <td className="py-2.5 pr-3 text-[rgb(var(--text-muted))] font-mono text-xs">{i + 1}</td>
                          <td className="py-2.5 pr-3 text-[rgb(var(--text-secondary))] whitespace-nowrap">
                            {fmtTime(t.entryTime, run.timeframe)}
                          </td>
                          <td className="py-2.5 pr-3 text-[rgb(var(--text-secondary))] whitespace-nowrap">
                            {fmtTime(t.exitTime, run.timeframe)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold',
                                isBuy
                                  ? 'bg-emerald-500/10 text-up'
                                  : 'bg-red-500/10 text-red-700 dark:text-down'
                              )}
                            >
                              {isBuy ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {t.action}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-[rgb(var(--text-secondary))]">
                            {fmtPrice(t.entry)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-[rgb(var(--text-secondary))]">
                            {fmtPrice(t.exit)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={cn(
                                'inline-block px-2 py-0.5 rounded-lg text-xs font-medium border',
                                badge.cls
                              )}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td
                            className={cn(
                              'py-2.5 text-right font-mono font-semibold',
                              t.r >= 0 ? 'text-up' : 'text-down'
                            )}
                          >
                            {fmtR(t.r)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : !error ? (
        <div className="card text-center py-16">
          <FlaskConical className="w-12 h-12 text-[rgb(var(--text-muted))] mx-auto mb-3" />
          <p className="text-[rgb(var(--text-secondary))] font-medium mb-2">ยังไม่มีผลทดสอบ</p>
          <p className="text-sm text-[rgb(var(--text-muted))] max-w-xl mx-auto">
            หน้านี้จำลองการเทรดตามสัญญาณของระบบบนข้อมูลย้อนหลังจริงแบบ walk-forward:
            สัญญาณแต่ละจุดเห็นเฉพาะแท่งในอดีต เข้าไม้ที่ราคาเปิดแท่งถัดไป
            แล้วปล่อยให้ SL/TP ของสัญญาณทำงานเหมือนคำสั่งที่วางไว้กับโบรกเกอร์จริง
            — เลือก symbol กับ timeframe ด้านบนแล้วกด &ldquo;รัน Backtest&rdquo;
          </p>
        </div>
      ) : null}
    </div>
  );
}
