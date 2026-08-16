'use client';

import { useState, useMemo } from 'react';
import SignalCard from '@/components/trading/SignalCard';
import { useSignals } from '@/hooks/useData';
import { useAppStore } from '@/hooks/useStore';
import { cn } from '@/lib/utils';
import { Zap, Filter, CheckCircle2, XCircle } from 'lucide-react';
import type { Signal } from '@/types';

/** จำนวนเริ่มต้นเมื่อเปิดออเดอร์ — ตั้งได้ที่หน้า ตั้งค่า → บัญชี */
function defaultQuantity(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = localStorage.getItem('trading-ai-account');
    const qty = raw ? Number(JSON.parse(raw).defaultQuantity) : NaN;
    return Number.isFinite(qty) && qty > 0 ? qty : 1;
  } catch {
    return 1;
  }
}

const MARKET_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'GOLD', label: 'ทอง' },
  { value: 'FOREX', label: 'Forex' },
  { value: 'TH_STOCK', label: 'หุ้นไทย' },
  { value: 'US_STOCK', label: 'หุ้น US' },
];

const ACTION_FILTERS = [
  { value: 'all', label: 'ทั้งหมด', color: 'text-white' },
  { value: 'BUY', label: 'BUY', color: 'text-emerald-400' },
  { value: 'SELL', label: 'SELL', color: 'text-red-400' },
  { value: 'HOLD', label: 'HOLD', color: 'text-amber-400' },
];

const TIMEFRAME_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: '1D', label: '1D' },
  { value: '1H', label: '1H' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'ใหม่สุด' },
  { value: 'confidence', label: 'มั่นใจสูงสุด' },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]['value'];

export default function SignalsPage() {
  const { data: signals } = useSignals();
  const refresh = useAppStore((s) => s.refresh);
  const [market, setMarket] = useState('all');
  const [action, setAction] = useState('all');
  const [timeframe, setTimeframe] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    const base = signals.filter(s =>
      (market === 'all' || s.market === market) &&
      (action === 'all' || s.action === action) &&
      // ?? '' กันแถวเก่าใน DB ที่ timeframe เป็น NULL — เจอแล้วทั้งหน้าจะขาวไม่ใช่แค่การ์ดเดียว
      (timeframe === 'all' || (s.timeframe ?? '').toUpperCase() === timeframe)
    );
    // query เรียงใหม่สุดก่อนอยู่แล้ว — เรียงใหม่เฉพาะตอนผู้ใช้เลือกดูตาม confidence
    if (sortBy === 'confidence') {
      return [...base].sort((a, b) => b.confidence - a.confidence);
    }
    return base;
  }, [signals, market, action, timeframe, sortBy]);

  // แถวสรุปนับจากสัญญาณที่โหลดมาจริงเท่านั้น ไม่ใช่ตัวเลขคงที่จากที่ไหน
  const summary = useMemo(() => {
    const active = signals.filter(s => s.status === 'active');
    return {
      active: active.length,
      buy: active.filter(s => s.action === 'BUY').length,
      sell: active.filter(s => s.action === 'SELL').length,
    };
  }, [signals]);

  const addTrade = async (signal: Signal) => {
    setMsg(null);
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_id: signal.id,
          symbol: signal.symbol,
          name: signal.name,
          market: signal.market,
          direction: signal.action === 'BUY' ? 'long' : 'short',
          entry_price: signal.entry_price,
          stop_loss: signal.stop_loss,
          take_profit: signal.take_profit,
          quantity: defaultQuantity(),
        }),
      });
      const data = await res.json();
      setMsg({
        ok: Boolean(data.success),
        text: data.success
          ? `เพิ่ม ${signal.symbol} เข้าพอร์ตแล้ว`
          : data.error ?? 'เพิ่มเข้าพอร์ตไม่สำเร็จ',
      });
      if (data.success) refresh();
    } catch (err) {
      setMsg({ ok: false, text: String(err) });
    }
    setTimeout(() => setMsg(null), 6000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-accent-glow" />
            สัญญาณ AI
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            จุดเข้า/ออก ที่วิเคราะห์จากเทคนิค + ข่าว + Price Action
          </p>
        </div>
        {/* สรุปหัวหน้า: นับจากข้อมูลจริงที่โหลดมา — flex-wrap กันป้ายดันความกว้างเกินจอมือถือ */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300">
            ใช้งานอยู่ <span className="font-mono font-semibold text-white">{summary.active}</span>
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400">
            BUY <span className="font-mono font-semibold">{summary.buy}</span>
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
            SELL <span className="font-mono font-semibold">{summary.sell}</span>
          </span>
        </div>
      </div>

      {/* แถว filter: ทุกกลุ่มต้อง wrap ได้ เพราะกลุ่ม "ตลาด" มี 5 ปุ่มกว้างเกินจอ 375px
          และปุ่มมี min-height 36px เฉพาะมือถือให้กดด้วยนิ้วง่าย (lg คืนความสูงเดิม เดสก์ท็อปไม่เปลี่ยน) */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-xs text-gray-500 uppercase">ตลาด:</span>
          <div className="flex flex-wrap gap-1">
            {MARKET_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setMarket(f.value)}
                className={cn(
                  'px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-lg text-xs font-medium transition-colors border',
                  market === f.value
                    ? 'border-accent-glow/30 bg-accent-glow/10 text-accent-glow'
                    : 'border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 uppercase">สัญญาณ:</span>
          <div className="flex flex-wrap gap-1">
            {ACTION_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setAction(f.value)}
                className={cn(
                  'px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-lg text-xs font-medium transition-colors border',
                  action === f.value
                    ? 'border-white/20 bg-white/5 ' + f.color
                    : 'border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 uppercase">Timeframe:</span>
          <div className="flex flex-wrap gap-1">
            {TIMEFRAME_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setTimeframe(f.value)}
                className={cn(
                  'px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-lg text-xs font-medium transition-colors border',
                  timeframe === f.value
                    ? 'border-accent-glow/30 bg-accent-glow/10 text-accent-glow'
                    : 'border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 uppercase">เรียง:</span>
          <div className="flex flex-wrap gap-1">
            {SORT_OPTIONS.map(f => (
              <button
                key={f.value}
                onClick={() => setSortBy(f.value)}
                className={cn(
                  'px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-lg text-xs font-medium transition-colors border',
                  sortBy === f.value
                    ? 'border-white/20 bg-white/5 text-white'
                    : 'border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-3 rounded-xl border text-sm',
            msg.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          )}
        >
          {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <Zap className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">
            {signals.length === 0
              ? 'ยังไม่มีสัญญาณ — เพิ่ม symbol ที่หน้า "ตลาด" แล้วกด "สแกนตลาด"'
              : 'ไม่พบสัญญาณที่ตรงกับตัวกรอง'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => (
            <SignalCard key={s.id} signal={s} onAddTrade={addTrade} />
          ))}
        </div>
      )}
    </div>
  );
}
