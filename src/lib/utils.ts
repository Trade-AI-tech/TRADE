import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: number,
  currency: string = 'THB',
  compact: boolean = false
): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return `฿${(value / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `฿${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, compact: boolean = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('th-TH').format(value);
}

export function formatPercent(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function getChangeColor(value: number, inverse: boolean = false): string {
  if (value === 0) return 'text-gray-400';
  const positive = inverse ? value < 0 : value > 0;
  return positive ? 'text-emerald-400' : 'text-red-400';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    PAUSED: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    DRAFT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    ARCHIVED: 'bg-gray-500/20 text-gray-500 border-gray-500/30',
    DELETED: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return colors[status] || colors.DRAFT;
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
  return colors[severity] || colors.info;
}

export function dateRangePresets() {
  const now = new Date();
  return [
    { label: 'วันนี้', start: now, end: now },
    { label: '7 วัน', start: daysAgo(7), end: now },
    { label: '14 วัน', start: daysAgo(14), end: now },
    { label: '30 วัน', start: daysAgo(30), end: now },
    { label: '90 วัน', start: daysAgo(90), end: now },
    { label: 'เดือนนี้', start: startOfMonth(now), end: now },
    { label: 'เดือนที่แล้ว', start: startOfMonth(monthsAgo(1)), end: endOfMonth(monthsAgo(1)) },
  ];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}
