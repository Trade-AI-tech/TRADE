'use client';

import { useState, useMemo } from 'react';
import MarketRow from '@/components/trading/MarketRow';
import { usePrices } from '@/hooks/useData';
import { cn } from '@/lib/utils';
import { LineChart } from 'lucide-react';
import type { MarketType } from '@/types';

const MARKETS: { value: MarketType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'ทั้งหมด', icon: '🌐' },
  { value: 'GOLD', label: 'ทอง', icon: '🥇' },
  { value: 'FOREX', label: 'Forex', icon: '💱' },
  { value: 'TH_STOCK', label: 'หุ้นไทย', icon: '🇹🇭' },
  { value: 'US_STOCK', label: 'หุ้น US', icon: '🇺🇸' },
];

export default function MarketsPage() {
  const { data: prices } = usePrices();
  const [filter, setFilter] = useState<MarketType | 'all'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return prices;
    return prices.filter(p => p.market === filter);
  }, [prices, filter]);

  const byMarket = useMemo(() => {
    const groups: Record<string, typeof prices> = {};
    prices.forEach(p => {
      if (!groups[p.market]) groups[p.market] = [];
      groups[p.market].push(p);
    });
    return groups;
  }, [prices]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-white flex items-center gap-2">
          <LineChart className="w-6 h-6 text-accent-glow" />
          ตลาดทั่วโลก
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          ราคาทอง, Forex, หุ้นไทย และหุ้นต่างประเทศ
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {MARKETS.map(m => {
          const count = m.value === 'all' ? prices.length : (byMarket[m.value]?.length ?? 0);
          return (
            <button
              key={m.value}
              onClick={() => setFilter(m.value)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border',
                filter === m.value
                  ? 'border-accent-glow/30 bg-accent-glow/10 text-accent-glow'
                  : 'border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
              )}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-white/10 rounded">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtered.map(p => (
          <MarketRow key={p.symbol} price={p} />
        ))}
      </div>
    </div>
  );
}
