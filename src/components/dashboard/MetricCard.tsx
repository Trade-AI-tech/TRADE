'use client';

import { cn, formatCurrency, formatNumber, formatPercent, formatChange, formatAmount } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  /** null = ยังไม่เคยวัด (เช่นกำลังโหลด) → แสดง '—' ห้ามส่ง 0 แทนความหมายนี้ */
  value: number | null;
  /**
   * เปอร์เซ็นต์การเปลี่ยนแปลง — ส่ง null เมื่อ "ยังไม่เคยวัด"
   * ห้ามส่ง 0 แทน เพราะ 0 แปลว่า "วัดแล้วไม่เปลี่ยน" ซึ่งคนละความหมาย
   * ป้ายจะถูกซ่อนไปเลยเมื่อเป็น null ดีกว่าโชว์ +0.0% ที่ไม่มีที่มา
   */
  change: number | null;
  /** 'amount' = จำนวนเงินที่รวมข้ามสกุล จึงไม่ติดสัญลักษณ์สกุลเงิน (ดู formatAmount) */
  format: 'currency' | 'amount' | 'number' | 'percent' | 'decimal';
  icon: LucideIcon;
  iconColor?: string;
  inverseChange?: boolean;
  delay?: number;
}

/**
 * สีของตัวเลขเปลี่ยนแปลง — ตรรกะเดียวกับ getChangeColor() ใน lib/utils.ts
 * แต่คืนคลาสที่อ้างตัวแปรธีมแทนสีตายตัว เพราะ emerald-400/red-400 จางเกินไป
 * จนอ่านผิดว่ากำไรหรือขาดทุนเมื่ออยู่บนพื้นสว่าง
 *
 * 0 = "วัดแล้วไม่เปลี่ยน" จึงต้องเป็นสีกลาง ห้ามให้เป็นเขียวหรือแดง
 * (ค่า null คือ "ยังไม่เคยวัด" ถูกกรองทิ้งตั้งแต่ก่อนเรียกฟังก์ชันนี้)
 */
function changeColorClass(value: number, inverse: boolean): string {
  if (value === 0) return 'text-gray-400';
  const positive = inverse ? value < 0 : value > 0;
  return positive ? 'text-up' : 'text-down';
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
    if (value === null) return '—';
    switch (format) {
      case 'currency': return formatCurrency(value, 'THB', true);
      case 'amount': return formatAmount(value, true);
      case 'number': return formatNumber(value, true);
      case 'percent': return formatPercent(value);
      case 'decimal': return value.toFixed(2);
    }
  })();

  const TrendIcon = change === null ? Minus : change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;

  return (
    <div
      className="card group hover:border-[var(--border-strong,var(--border-subtle))] transition-all duration-300"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-surface-2', iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
        {change !== null && (
          <div className={cn('flex items-center gap-1 text-xs font-medium', changeColorClass(change, inverseChange))}>
            <TrendIcon className="w-3.5 h-3.5" />
            <span>{formatChange(change)}</span>
          </div>
        )}
      </div>

      <div className="space-y-1">
        {/* ตัวเลขใหญ่คือพระเอกของการ์ด ต้องเป็นสีตัวหนังสือหลักเสมอ (คอนทราสต์สูงสุด) */}
        <p className="text-2xl font-semibold tracking-tight text-white font-mono">
          {formatted}
        </p>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
          {label}
        </p>
      </div>

      {/* Hover glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent-glow/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}
