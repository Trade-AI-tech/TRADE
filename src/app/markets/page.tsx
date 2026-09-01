'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWatchlist, usePrices } from '@/hooks/useData';
import { isDemoMode } from '@/lib/supabase';
import { SYMBOL_UNIVERSE, isInUniverse } from '@/lib/universe';
import { cn } from '@/lib/utils';
import { LineChart, Plus, Trash2, TrendingUp, TrendingDown, Loader2, AlertCircle } from 'lucide-react';
import type { MarketType, MarketPrice, Watchlist } from '@/types';

const MARKETS: { value: MarketType; label: string; icon: string; hint: string }[] = [
  { value: 'GOLD', label: 'ทอง', icon: '🥇', hint: 'XAUUSD' },
  { value: 'FOREX', label: 'Forex', icon: '💱', hint: 'EURUSD, USDTHB' },
  { value: 'TH_STOCK', label: 'หุ้นไทย', icon: '🇹🇭', hint: 'PTT, AOT (ไม่ต้องใส่ .BK)' },
  { value: 'US_STOCK', label: 'หุ้น US', icon: '🇺🇸', hint: 'AAPL, NVDA' },
  { value: 'CRYPTO', label: 'Crypto', icon: '₿', hint: 'BTC, ETH' },
];

const FILTERS: { value: MarketType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'ทั้งหมด', icon: '🌐' },
  ...MARKETS.map(m => ({ value: m.value, label: m.label, icon: m.icon })),
];

/**
 * แถวหนึ่งของ watchlist
 *
 * `scanned` = symbol นี้อยู่ในจักรวาลที่ตัวสแกนเดินจริงไหม (src/lib/universe.ts)
 * ตั้งแต่ 2026-08-29 เจ้าของสั่งเทรดทองอย่างเดียว จักรวาลจึงเหลือ XAUUSD ตัวเดียว
 * แถวที่เหลือยังอยู่ในตาราง (ไม่ลบข้อมูลของผู้ใช้) แต่ **ไม่ถูกสแกนและราคาไม่อัปเดตแล้ว**
 * ต้องบอกตรง ๆ ตรงนี้ ไม่งั้นราคาที่ค้างจากรอบสุดท้ายจะดูเหมือนราคาปัจจุบัน
 */
function WatchRow({
  item,
  price,
  scanned,
  onRemove,
  removing,
}: {
  item: Watchlist;
  price?: MarketPrice;
  scanned: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const isUp = (price?.change ?? 0) >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-surface-1/50">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            price
              ? isUp
                ? 'bg-emerald-500/10 text-up'
                : 'bg-red-500/10 text-down'
              : 'bg-surface-2 text-[rgb(var(--text-muted))]'
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[rgb(var(--text-primary))] text-sm">{item.symbol}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-surface-2 rounded text-[rgb(var(--text-secondary))]">
              {MARKETS.find(m => m.value === item.market)?.label ?? item.market}
            </span>
            {!scanned && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                title="ระบบสแกนเฉพาะสัญลักษณ์ในจักรวาล (ตอนนี้คือทองอย่างเดียว) — แถวนี้ยังเก็บไว้ให้ แต่ไม่มีการสแกนและราคาไม่อัปเดต"
              >
                ไม่ได้สแกน
              </span>
            )}
          </div>
          <div className="text-xs text-[rgb(var(--text-muted))] mt-0.5 truncate">{item.name}</div>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        {price ? (
          // ราคาของแถวที่ไม่ได้สแกนแล้วคือ "ค่าค้างจากรอบสุดท้าย" ไม่ใช่ราคาปัจจุบัน
          // จางลง + เขียนกำกับ เพื่อไม่ให้อ่านผิดว่าเป็นราคาสด
          <div className={cn('text-right', !scanned && 'opacity-60')}>
            <div className="font-mono font-semibold text-[rgb(var(--text-primary))]">
              {price.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </div>
            <div className={cn('text-xs font-mono font-medium', isUp ? 'text-up' : 'text-down')}>
              {isUp ? '+' : ''}{price.change.toFixed(4)} ({isUp ? '+' : ''}{price.change_percent.toFixed(2)}%)
            </div>
            {!scanned && (
              <div className="text-[10px] text-[rgb(var(--text-muted))] mt-0.5">ค่าค้างจากรอบสุดท้ายที่สแกน</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-[rgb(var(--text-muted))]">ยังไม่มีราคา — กด &ldquo;สแกนตลาด&rdquo;</div>
        )}

        <button
          onClick={onRemove}
          disabled={removing}
          title="ลบออกจาก watchlist"
          className="p-2 rounded-lg text-[rgb(var(--text-muted))] hover:text-down hover:bg-red-500/10 transition-colors disabled:opacity-40"
        >
          {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function MarketsContent() {
  const searchParams = useSearchParams();
  const demo = isDemoMode();

  const { data: watchlist, loading, error, add, remove } = useWatchlist();
  const { data: prices } = usePrices();

  const [filter, setFilter] = useState<MarketType | 'all'>('all');
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState<MarketType>('GOLD');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const q = (searchParams.get('q') ?? '').trim().toUpperCase();

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, MarketPrice>();
    for (const p of prices) map.set(p.symbol, p);
    return map;
  }, [prices]);

  const filtered = useMemo(() => {
    return watchlist.filter(w =>
      (filter === 'all' || w.market === filter) &&
      (!q || w.symbol.toUpperCase().includes(q) || w.name.toUpperCase().includes(q))
    );
  }, [watchlist, filter, q]);

  const countByMarket = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of watchlist) counts[w.market] = (counts[w.market] ?? 0) + 1;
    return counts;
  }, [watchlist]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) return;
    setAdding(true);
    setMsg(null);
    const res = await add(symbol, market);
    setMsg({ ok: Boolean(res.success), text: res.success ? res.message ?? 'เพิ่มแล้ว' : res.error ?? 'เพิ่มไม่สำเร็จ' });
    if (res.success) setSymbol('');
    setAdding(false);
    setTimeout(() => setMsg(null), 6000);
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    const res = await remove(id);
    if (!res.success) setMsg({ ok: false, text: res.error ?? 'ลบไม่สำเร็จ' });
    setRemovingId(null);
  };

  const activeHint = MARKETS.find(m => m.value === market)?.hint;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-[rgb(var(--text-primary))] flex items-center gap-2">
          <LineChart className="w-6 h-6 text-accent-glow" />
          ตลาดที่ติดตาม
        </h1>
        {/* ข้อความนี้เคยเขียนว่า "เพิ่ม symbol ที่นี่ ระบบจะสแกนหาสัญญาณให้ทุกวัน..."
            ซึ่งกลายเป็นคำอ้างเท็จตั้งแต่ 2026-08-29 ที่จักรวาลเหลือทองตัวเดียว —
            symbol ที่เพิ่มเข้ามานอกจักรวาลจะถูกเก็บไว้เฉย ๆ ไม่ถูกสแกนเลย
            รายชื่อจักรวาลอ่านจาก SYMBOL_UNIVERSE ตัวจริง ไม่ฮาร์ดโค้ดชื่อทองไว้ที่นี่ */}
        <p className="text-sm text-[rgb(var(--text-muted))] mt-0.5">
          ตอนนี้ระบบสแกนเฉพาะ {SYMBOL_UNIVERSE.map(u => u.symbol).join(' · ')} แล้วแจ้งเตือนเข้า Telegram/มือถือ
          — symbol อื่นที่เพิ่มไว้ยังเก็บให้ แต่จะไม่ถูกสแกนและราคาไม่อัปเดต
        </p>
      </div>

      {demo ? (
        <div className="card flex items-start gap-3 border-amber-500/20 bg-amber-500/5">
          {/* เหลืองอ่อน (amber-400/300) จมหายไปกับพื้นสว่าง และ amber ไม่มีตัวแปรธีมรองรับเหมือน
              accent/up/down จึงเขียนคู่เอง: เฉดเข้มเป็นค่าเริ่มต้น แล้ว dark: คืนสีเดิมให้ธีมมืด */}
          <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            ตอนนี้อยู่ในโหมด Demo — รายการด้านล่างเป็นข้อมูลตัวอย่าง เพิ่มหรือลบไม่ได้
          </p>
        </div>
      ) : (
        <form onSubmit={handleAdd} className="card space-y-3">
          <h3 className="text-sm font-semibold text-[rgb(var(--text-primary))]">เพิ่ม symbol</h3>
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
              {MARKETS.map(m => (
                <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={adding || !symbol.trim()}
              className="btn-primary flex items-center gap-2 disabled:opacity-40"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              เพิ่ม
            </button>
          </div>
          <p className="text-[11px] text-[rgb(var(--text-muted))]">
            ตัวอย่างของ{MARKETS.find(m => m.value === market)?.label}: {activeHint} — ระบบจะตรวจกับ Yahoo Finance ก่อนบันทึก
          </p>

          {msg && (
            <p className={cn('text-xs rounded-xl p-3', msg.ok ? 'text-up bg-emerald-500/10' : 'text-red-700 dark:text-down bg-red-500/10')}>
              {msg.text}
            </p>
          )}
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(m => {
          const count = m.value === 'all' ? watchlist.length : (countByMarket[m.value] ?? 0);
          return (
            <button
              key={m.value}
              onClick={() => setFilter(m.value)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border',
                filter === m.value
                  ? 'border-accent-glow/30 bg-accent-glow/10 text-cyan-800 dark:text-accent-glow'
                  : 'border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2'
              )}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-3 rounded">{count}</span>
            </button>
          );
        })}
      </div>

      {q && (
        <p className="text-xs text-[rgb(var(--text-muted))]">
          กรองด้วยคำค้น: <span className="text-[rgb(var(--text-primary))] font-mono">{q}</span>
        </p>
      )}

      {loading ? (
        <div className="card text-center py-16 text-[rgb(var(--text-muted))] flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
        </div>
      ) : error ? (
        <div className="card text-center py-16 text-down text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <LineChart className="w-12 h-12 text-[rgb(var(--text-muted))] mx-auto mb-3" />
          <p className="text-[rgb(var(--text-secondary))]">
            {watchlist.length === 0 ? 'ยังไม่มี symbol ที่ติดตาม — เพิ่มด้านบนได้เลย' : 'ไม่พบรายการที่ตรงกับตัวกรอง'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(item => (
            <WatchRow
              key={item.id}
              item={item}
              price={priceBySymbol.get(item.symbol)}
              scanned={isInUniverse(item.symbol, item.market)}
              onRemove={() => handleRemove(item.id)}
              removing={removingId === item.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MarketsPage() {
  return (
    <Suspense fallback={<div className="card text-center py-16 text-[rgb(var(--text-muted))]">กำลังโหลด...</div>}>
      <MarketsContent />
    </Suspense>
  );
}
