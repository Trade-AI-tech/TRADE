'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Target, Shield, Clock, CheckCircle2, Sparkles } from 'lucide-react';
import type { Signal } from '@/types';

interface Props {
  signal: Signal;
  onAddTrade?: (signal: Signal) => void;
}

const actionConfig = {
  BUY: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: TrendingUp, label: 'ซื้อ' },
  SELL: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: TrendingDown, label: 'ขาย' },
  HOLD: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: Minus, label: 'ถือ' },
  CLOSE: { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30', icon: Minus, label: 'ปิด' },
};

const strengthStars = {
  weak: 1,
  moderate: 2,
  strong: 3,
  very_strong: 4,
};

const marketLabel = {
  GOLD: 'ทอง', FOREX: 'Forex', TH_STOCK: 'หุ้นไทย', US_STOCK: 'หุ้น US', CRYPTO: 'Crypto',
};

export default function SignalCard({ signal, onAddTrade }: Props) {
  const cfg = actionConfig[signal.action];
  const Icon = cfg.icon;
  const stars = strengthStars[signal.strength];
  const rr = signal.action === 'BUY'
    ? (signal.take_profit - signal.entry_price) / (signal.entry_price - signal.stop_loss)
    : signal.action === 'SELL'
    ? (signal.entry_price - signal.take_profit) / (signal.stop_loss - signal.entry_price)
    : 0;
  const pnlNow = signal.action === 'BUY'
    ? ((signal.current_price - signal.entry_price) / signal.entry_price) * 100
    : signal.action === 'SELL'
    ? ((signal.entry_price - signal.current_price) / signal.entry_price) * 100
    : 0;

  return (
    <div className={cn('card border', cfg.border, 'relative overflow-hidden')}>
      {signal.telegram_sent && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          <span>แจ้ง Telegram</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', cfg.bg, cfg.color)}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-base">{signal.symbol}</h3>
              <span className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded text-gray-400">
                {marketLabel[signal.market]}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{signal.name}</p>
          </div>
        </div>

        <div className="text-right">
          <div className={cn('text-xl font-bold font-mono', cfg.color)}>{cfg.label}</div>
          <div className="flex items-center gap-0.5 justify-end mt-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn('w-1.5 h-1.5 rounded-full', i < stars ? cfg.color.replace('text-', 'bg-') : 'bg-white/10')} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white/5 rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Entry</div>
          <div className="text-sm font-mono font-semibold text-white mt-0.5">{signal.entry_price}</div>
        </div>
        <div className="bg-red-500/5 rounded-lg p-2.5">
          <div className="text-[10px] text-red-400/70 uppercase font-medium flex items-center gap-1">
            <Shield className="w-2.5 h-2.5" /> SL
          </div>
          <div className="text-sm font-mono font-semibold text-red-400 mt-0.5">{signal.stop_loss}</div>
        </div>
        <div className="bg-emerald-500/5 rounded-lg p-2.5">
          <div className="text-[10px] text-emerald-400/70 uppercase font-medium flex items-center gap-1">
            <Target className="w-2.5 h-2.5" /> TP
          </div>
          <div className="text-sm font-mono font-semibold text-emerald-400 mt-0.5">{signal.take_profit}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-3 text-gray-400">
          <span>TF: <span className="text-white font-medium">{signal.timeframe}</span></span>
          <span>R:R <span className="text-white font-medium">1:{rr.toFixed(1)}</span></span>
          <span>Conf: <span className={cn('font-medium', cfg.color)}>{signal.confidence}%</span></span>
        </div>
        {pnlNow !== 0 && (
          <span className={cn('font-mono font-medium', pnlNow > 0 ? 'text-emerald-400' : 'text-red-400')}>
            {pnlNow > 0 ? '+' : ''}{pnlNow.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="space-y-1.5 mb-3">
        {signal.reasons.slice(0, 3).map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <div className={cn('w-1 h-1 rounded-full mt-1.5 flex-shrink-0', cfg.color.replace('text-', 'bg-'))} />
            <div className="flex-1">
              <span className="text-white font-medium">{r.label}</span>
              <span className="text-gray-500"> — {r.detail}</span>
            </div>
          </div>
        ))}
      </div>

      {onAddTrade && (signal.action === 'BUY' || signal.action === 'SELL') && (
        <button
          onClick={() => onAddTrade(signal)}
          className={cn('w-full btn-ghost text-xs flex items-center justify-center gap-1.5 border', cfg.border, cfg.color, 'hover:bg-white/5')}
        >
          <Sparkles className="w-3.5 h-3.5" />
          เพิ่มเข้าพอร์ต
        </button>
      )}
    </div>
  );
}
