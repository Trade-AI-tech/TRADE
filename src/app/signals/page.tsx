'use client';

import { useState, useMemo } from 'react';
import SignalCard from '@/components/trading/SignalCard';
import { useSignals } from '@/hooks/useData';
import { cn } from '@/lib/utils';
import { flipReversalIndex } from '@/lib/signal-flips';
import { Zap, Filter } from 'lucide-react';

const MARKET_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'GOLD', label: 'ทอง' },
  { value: 'FOREX', label: 'Forex' },
  { value: 'TH_STOCK', label: 'หุ้นไทย' },
  { value: 'US_STOCK', label: 'หุ้น US' },
];

/**
 * สีของปุ่มที่ถูกเลือก — ปุ่มที่เลือกอยู่มีพื้น surface-3 (เทาอ่อนบนธีมสว่าง)
 * text-up ยังผ่านเกณฑ์บนพื้นนั้น แต่ text-down (#dc2626) เหลือ ~4.0:1 ซึ่งตกเกณฑ์ AA
 * ฝั่ง SELL/HOLD จึงระบุเฉดเข้มไว้เองสำหรับธีมสว่าง แล้วให้ dark: คืนสีเดิมของธีมมืด
 * ความหมายของสีไม่เปลี่ยน: เขียว = BUY, แดง = SELL, เหลือง = HOLD
 */
const ACTION_FILTERS = [
  { value: 'all', label: 'ทั้งหมด', color: 'text-[rgb(var(--text-primary))]' },
  { value: 'BUY', label: 'BUY', color: 'text-up' },
  { value: 'SELL', label: 'SELL', color: 'text-red-700 dark:text-down' },
  // ป้าย HOLD ตอนถูกเลือกจะอยู่บนพื้น surface-3 (เทาอ่อนในธีมสว่าง) — amber-700 คอนทราสต์ไม่พอ
  // จึงใช้ amber-800 บนธีมสว่าง แล้วคืนสี amber-400 เดิมให้ธีมมืด
  { value: 'HOLD', label: 'HOLD', color: 'text-amber-800 dark:text-amber-400' },
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
  const [market, setMarket] = useState('all');
  const [action, setAction] = useState('all');
  const [timeframe, setTimeframe] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');

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

  // ใบใหม่ใบไหน "กลับทิศ" ใบเก่า — ป้าย flipped_by อยู่บนใบเก่า การ์ดใบเดียวหาเองไม่ได้
  // จึงประกอบ map ครั้งเดียวจากสัญญาณทั้งชุดที่โหลดมา แล้วส่งเข้าการ์ดเป็น prop
  // (โหมดถอย: ยังไม่ได้รัน migration 009 = ไม่มีแถวไหนมี flipped_by = map ว่าง ไม่พัง)
  const reversals = useMemo(() => flipReversalIndex(signals), [signals]);

  // แถวสรุปนับจากสัญญาณที่โหลดมาจริงเท่านั้น ไม่ใช่ตัวเลขคงที่จากที่ไหน
  const summary = useMemo(() => {
    const active = signals.filter(s => s.status === 'active');
    return {
      active: active.length,
      buy: active.filter(s => s.action === 'BUY').length,
      sell: active.filter(s => s.action === 'SELL').length,
    };
  }, [signals]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-[rgb(var(--text-primary))] flex items-center gap-2">
            <Zap className="w-6 h-6 text-accent-glow" />
            สัญญาณ AI
          </h1>
          <p className="text-sm text-[rgb(var(--text-muted))] mt-0.5">
            จุดเข้า/ออก ที่วิเคราะห์จากเทคนิค + ข่าว + Price Action
          </p>
        </div>
        {/* สรุปหัวหน้า: นับจากข้อมูลจริงที่โหลดมา — flex-wrap กันป้ายดันความกว้างเกินจอมือถือ */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-surface-2 border border-[var(--border-subtle)] text-xs text-[rgb(var(--text-secondary))]">
            ใช้งานอยู่ <span className="font-mono font-semibold text-[rgb(var(--text-primary))]">{summary.active}</span>
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-up">
            BUY <span className="font-mono font-semibold">{summary.buy}</span>
          </span>
          {/* ป้าย SELL วางบนพื้นแดงจาง 10% ซึ่งกินคอนทราสต์ของ text-down ไปจนเหลือ 4.0:1
              จึงใช้ red-700 บนธีมสว่าง (5.4:1) แล้วคืนสีเดิมให้ธีมมืดด้วย dark: */}
          <span className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-down">
            SELL <span className="font-mono font-semibold">{summary.sell}</span>
          </span>
        </div>
      </div>

      {/* แถว filter: ทุกกลุ่มต้อง wrap ได้ เพราะกลุ่ม "ตลาด" มี 5 ปุ่มกว้างเกินจอ 375px
          และปุ่มมี min-height 36px เฉพาะมือถือให้กดด้วยนิ้วง่าย (lg คืนความสูงเดิม เดสก์ท็อปไม่เปลี่ยน) */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-[rgb(var(--text-muted))]" />
          <span className="text-xs text-[rgb(var(--text-muted))] uppercase">ตลาด:</span>
          <div className="flex flex-wrap gap-1">
            {MARKET_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setMarket(f.value)}
                className={cn(
                  'px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-lg text-xs font-medium transition-colors border',
                  // ปุ่มที่เลือกอยู่มีพื้นฟ้าจาง 10% ทับอีกชั้น ทำให้ text-accent-glow เหลือ 4.4:1
                  // จึงลงเฉดเป็น cyan-800 เฉพาะธีมสว่าง (6.0:1) ส่วนธีมมืดคืนสีนีออนเดิม
                  market === f.value
                    ? 'border-accent-glow/30 bg-accent-glow/10 text-cyan-800 dark:text-accent-glow'
                    : 'border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[rgb(var(--text-muted))] uppercase">สัญญาณ:</span>
          <div className="flex flex-wrap gap-1">
            {ACTION_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setAction(f.value)}
                className={cn(
                  'px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-lg text-xs font-medium transition-colors border',
                  // ปุ่มที่เลือกอยู่ใช้พื้นเข้มขึ้นหนึ่งขั้น (surface-3) แทนการเน้นด้วยเส้นขอบขาว
                  // เพราะเส้นขอบขาวจาง ๆ หายไปเลยบนธีมสว่าง — พื้นต่างขั้นเห็นชัดทั้งสองธีม
                  action === f.value
                    ? 'border-[var(--border-subtle)] bg-surface-3 ' + f.color
                    : 'border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[rgb(var(--text-muted))] uppercase">Timeframe:</span>
          <div className="flex flex-wrap gap-1">
            {TIMEFRAME_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setTimeframe(f.value)}
                className={cn(
                  'px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-lg text-xs font-medium transition-colors border',
                  timeframe === f.value
                    ? 'border-accent-glow/30 bg-accent-glow/10 text-cyan-800 dark:text-accent-glow'
                    : 'border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[rgb(var(--text-muted))] uppercase">เรียง:</span>
          <div className="flex flex-wrap gap-1">
            {SORT_OPTIONS.map(f => (
              <button
                key={f.value}
                onClick={() => setSortBy(f.value)}
                className={cn(
                  'px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-lg text-xs font-medium transition-colors border',
                  sortBy === f.value
                    ? 'border-[var(--border-subtle)] bg-surface-3 text-[rgb(var(--text-primary))]'
                    : 'border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <Zap className="w-12 h-12 text-[rgb(var(--text-muted))] mx-auto mb-3" />
          <p className="text-[rgb(var(--text-secondary))]">
            {signals.length === 0
              ? 'ยังไม่มีสัญญาณ — เพิ่ม symbol ที่หน้า "ตลาด" แล้วกด "สแกนตลาด"'
              : 'ไม่พบสัญญาณที่ตรงกับตัวกรอง'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => (
            <SignalCard key={s.id} signal={s} reversal={reversals.get(s.id) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
