'use client';

import { cn } from '@/lib/utils';
import type { Trade } from '@/types';

const marketLabel: Record<string, string> = {
  GOLD: 'ทอง', FOREX: 'Forex', TH_STOCK: 'หุ้นไทย', US_STOCK: 'หุ้น US', CRYPTO: 'Crypto',
};

export default function TradeRow({ trade }: { trade: Trade }) {
  const isProfit = trade.pnl >= 0;
  const isOpen = trade.status === 'open';

  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className={cn('w-1.5 h-8 rounded-full', trade.direction === 'long' ? 'bg-emerald-400' : 'bg-red-400')} />
          <div>
            <div className="font-semibold text-white text-sm">{trade.symbol}</div>
            <div className="text-xs text-gray-500">{trade.name}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-xs">
        <span className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded text-gray-400">{marketLabel[trade.market] || trade.market}</span>
      </td>
      <td className="py-3 px-4">
        <span className={cn('text-xs font-medium uppercase', trade.direction === 'long' ? 'text-emerald-400' : 'text-red-400')}>
          {trade.direction === 'long' ? 'Long' : 'Short'}
        </span>
      </td>
      <td className="py-3 px-4 font-mono text-sm text-white">{trade.entry_price}</td>
      <td className="py-3 px-4 font-mono text-sm text-gray-400">{trade.exit_price ?? '—'}</td>
      <td className="py-3 px-4 font-mono text-sm text-gray-400">{trade.quantity}</td>
      <td className="py-3 px-4">
        <div className={cn('font-mono font-semibold', isProfit ? 'text-emerald-400' : 'text-red-400')}>
          {isProfit ? '+' : ''}{trade.pnl.toFixed(2)}
        </div>
        <div className={cn('text-xs', isProfit ? 'text-emerald-400/70' : 'text-red-400/70')}>
          {isProfit ? '+' : ''}{trade.pnl_percent.toFixed(2)}%
        </div>
      </td>
      <td className="py-3 px-4">
        <span className={cn(
          'text-[11px] px-2 py-0.5 rounded-full border',
          isOpen
            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
            : trade.status === 'closed'
            ? 'bg-gray-500/10 text-gray-400 border-gray-500/30'
            : 'bg-red-500/10 text-red-400 border-red-500/30'
        )}>
          {isOpen ? 'กำลังถือ' : trade.status === 'closed' ? 'ปิดแล้ว' : 'ยกเลิก'}
        </span>
      </td>
      <td className="py-3 px-4 text-xs text-gray-500">
        {new Date(trade.entered_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
      </td>
    </tr>
  );
}
