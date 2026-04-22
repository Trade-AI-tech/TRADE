'use client';

import { useState, useMemo } from 'react';
import SignalCard from '@/components/trading/SignalCard';
import { useSignals } from '@/hooks/useData';
import { cn } from '@/lib/utils';
import { Zap, Filter } from 'lucide-react';
import type { Signal } from '@/types';

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

export default function SignalsPage() {
  const { data: signals } = useSignals();
  const [market, setMarket] = useState('all');
  const [action, setAction] = useState('all');

  const filtered = useMemo(() => {
    return signals.filter(s =>
      (market === 'all' || s.market === market) &&
      (action === 'all' || s.action === action)
    );
  }, [signals, market, action]);

  const addTrade = async (signal: Signal) => {
    await fetch('/api/trades', {
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
        quantity: 1,
      }),
    });
    alert('เพิ่มเข้าพอร์ตเรียบร้อย');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-white flex items-center gap-2">
          <Zap className="w-6 h-6 text-accent-glow" />
          สัญญาณ AI
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          จุดเข้า/ออก ที่วิเคราะห์จากเทคนิค + ข่าว + Price Action
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-xs text-gray-500 uppercase">ตลาด:</span>
          <div className="flex gap-1">
            {MARKET_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setMarket(f.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
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

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase">สัญญาณ:</span>
          <div className="flex gap-1">
            {ACTION_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setAction(f.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
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
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <Zap className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">ไม่พบสัญญาณที่ตรงกับตัวกรอง</p>
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
