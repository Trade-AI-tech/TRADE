'use client';

import { cn, formatNumber } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { MarketPrice } from '@/types';

const marketLabel: Record<string, string> = {
  GOLD: 'ทอง', FOREX: 'Forex', TH_STOCK: 'หุ้นไทย', US_STOCK: 'หุ้น US', CRYPTO: 'Crypto',
};

export default function MarketRow({ price, onClick }: { price: MarketPrice; onClick?: () => void }) {
  const isUp = price.change >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-surface-2 transition-colors text-left border border-[var(--border-subtle)] bg-surface-1/50"
    >
      <div className="flex items-center gap-3">
        {/* เขียว = ราคาขึ้น, แดง = ราคาลง — ใช้ตัวแปรธีมเพื่อให้เฉดเข้มขึ้นเองบนพื้นสว่าง
            (พื้นหลังกล่องไอคอนยังเป็นสีจาง 10% ซึ่งอ่อนพอสำหรับทั้งสองธีม) */}
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', isUp ? 'bg-emerald-500/10 text-up' : 'bg-red-500/10 text-down')}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-sm">{price.symbol}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-surface-2 rounded text-gray-400">{marketLabel[price.market] || price.market}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{price.name}</div>
        </div>
      </div>

      <div className="text-right">
        <div className="font-mono font-semibold text-white">{price.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
        <div className={cn('text-xs font-mono font-medium', isUp ? 'text-up' : 'text-down')}>
          {isUp ? '+' : ''}{price.change.toFixed(4)} ({isUp ? '+' : ''}{price.change_percent.toFixed(2)}%)
        </div>
      </div>
    </button>
  );
}
