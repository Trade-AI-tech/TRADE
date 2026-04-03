'use client';

import { cn, formatCurrency, formatNumber, formatPercent, formatChange, getChangeColor } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: number;
  change: number;
  format: 'currency' | 'number' | 'percent' | 'decimal';
  icon: LucideIcon;
  iconColor?: string;
  inverseChange?: boolean;
  delay?: number;
}

export default function MetricCard({
  label,
  value,
  change,
  format,
  icon: Icon,
  iconColor = 'text-accent-glow',
  inverseChange = false,
  delay = 0,
}: MetricCardProps) {
  const formatted = (() => {
    switch (format) {
      case 'currency': return formatCurrency(value, 'THB', true);
      case 'number': return formatNumber(value, true);
      case 'percent': return formatPercent(value);
      case 'decimal': return value.toFixed(2);
    }
  })();

  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;

  return (
    <div
      className="card group hover:border-white/10 transition-all duration-300"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-white/5', iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className={cn('flex items-center gap-1 text-xs font-medium', getChangeColor(change, inverseChange))}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span>{formatChange(change)}</span>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight text-white font-mono">
          {formatted}
        </p>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
          {label}
        </p>
      </div>

      {/* Hover glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent-glow/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}
