'use client';

import BudgetChart from '@/components/charts/BudgetChart';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';
import {
  Sparkles, ArrowRight, CheckCircle2, AlertTriangle,
  TrendingUp, Wallet, PiggyBank, Calculator,
} from 'lucide-react';
import { useState } from 'react';

const budgetData = [
  { name: 'Summer Sale', allocated: 50000, spent: 38500, ai_recommended: 65000, roas: 4.2, status: 'underspend' },
  { name: 'Brand Awareness', allocated: 120000, spent: 67200, ai_recommended: 85000, roas: 1.8, status: 'overspend' },
  { name: 'Product Launch', allocated: 30000, spent: 12400, ai_recommended: 45000, roas: 5.1, status: 'underspend' },
  { name: 'Retargeting', allocated: 15000, spent: 9800, ai_recommended: 35000, roas: 6.8, status: 'underspend' },
  { name: 'Video Views', allocated: 8000, spent: 5600, ai_recommended: 5000, roas: 1.2, status: 'reduce' },
];

const totalAllocated = budgetData.reduce((s, b) => s + b.allocated, 0);
const totalAIRecommended = budgetData.reduce((s, b) => s + b.ai_recommended, 0);
const totalSpent = budgetData.reduce((s, b) => s + b.spent, 0);

export default function BudgetPage() {
  const [showAIPanel, setShowAIPanel] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-white">Budget Optimizer</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI วิเคราะห์และแนะนำการจัดสรรงบอัตโนมัติ</p>
        </div>
        <button
          onClick={() => setShowAIPanel(!showAIPanel)}
          className="btn-primary flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          AI Optimize
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-accent-glow" />
            <span className="text-xs text-gray-500">งบจัดสรรรวม</span>
          </div>
          <p className="text-xl font-mono font-bold text-white">{formatCurrency(totalAllocated)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <PiggyBank className="w-4 h-4 text-accent-hot" />
            <span className="text-xs text-gray-500">ใช้จริง</span>
          </div>
          <p className="text-xl font-mono font-bold text-white">{formatCurrency(totalSpent)}</p>
          <p className="text-xs text-gray-500 mt-1">{formatPercent((totalSpent / totalAllocated) * 100)} ของงบ</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-accent-purple" />
            <span className="text-xs text-gray-500">AI แนะนำ</span>
          </div>
          <p className="text-xl font-mono font-bold text-accent-purple">{formatCurrency(totalAIRecommended)}</p>
          <p className={cn('text-xs mt-1', totalAIRecommended > totalAllocated ? 'text-amber-400' : 'text-emerald-400')}>
            {totalAIRecommended > totalAllocated ? '+' : ''}{formatCurrency(totalAIRecommended - totalAllocated)} จากปัจจุบัน
          </p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-accent-gold" />
            <span className="text-xs text-gray-500">ROAS คาดการณ์</span>
          </div>
          <p className="text-xl font-mono font-bold text-accent-gold">4.85x</p>
          <p className="text-xs text-emerald-400 mt-1">+33% จากปัจจุบัน 3.63x</p>
        </div>
      </div>

      {/* Chart */}
      <BudgetChart
        data={budgetData.map(b => ({
          name: b.name,
          allocated: b.allocated,
          spent: b.spent,
          ai_recommended: b.ai_recommended,
        }))}
      />

      {/* Detail table */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white">รายละเอียดการจัดสรรงบ</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['แคมเปญ', 'งบปัจจุบัน', 'ใช้จริง', 'AI แนะนำ', 'ROAS', 'การเปลี่ยนแปลง', 'สถานะ'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {budgetData.map((row) => {
              const diff = row.ai_recommended - row.allocated;
              const diffPct = (diff / row.allocated) * 100;
              return (
                <tr key={row.name} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-4 text-sm font-medium text-white">{row.name}</td>
                  <td className="px-5 py-4 text-sm font-mono text-gray-300">{formatCurrency(row.allocated)}</td>
                  <td className="px-5 py-4 text-sm font-mono text-gray-300">{formatCurrency(row.spent)}</td>
                  <td className="px-5 py-4 text-sm font-mono text-accent-purple font-medium">{formatCurrency(row.ai_recommended)}</td>
                  <td className="px-5 py-4">
                    <span className={cn(
                      'text-sm font-mono font-medium',
                      row.roas >= 3 ? 'text-emerald-400' : row.roas >= 1.5 ? 'text-amber-400' : 'text-red-400'
                    )}>
                      {row.roas}x
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                      <span className={cn('text-sm font-mono', diff > 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {diff > 0 ? '+' : ''}{formatCurrency(diff)} ({diffPct > 0 ? '+' : ''}{diffPct.toFixed(0)}%)
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {row.status === 'underspend' && (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> เพิ่มงบ
                      </span>
                    )}
                    {row.status === 'overspend' && (
                      <span className="flex items-center gap-1.5 text-xs text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5" /> ลดงบ
                      </span>
                    )}
                    {row.status === 'reduce' && (
                      <span className="flex items-center gap-1.5 text-xs text-red-400">
                        <AlertTriangle className="w-3.5 h-3.5" /> ลดงบมาก
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* AI Recommendation Panel */}
      {showAIPanel && (
        <div className="card border-accent-purple/30 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-accent-purple" />
            <h3 className="text-sm font-semibold text-white">AI Budget Recommendations</h3>
          </div>
          <div className="space-y-4 text-sm text-gray-300">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="font-medium text-emerald-400 mb-1">1. เพิ่มงบ Retargeting +133%</p>
              <p className="text-xs text-gray-400">ROAS 6.8x ดีที่สุดในทุกแคมเปญ ควรเพิ่มจาก ฿15K เป็น ฿35K เพื่อ maximize conversion</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="font-medium text-emerald-400 mb-1">2. เพิ่มงบ Product Launch +50%</p>
              <p className="text-xs text-gray-400">ROAS 5.1x ยังไม่ถึง saturation point สามารถ scale ได้อีก</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="font-medium text-amber-400 mb-1">3. ลดงบ Brand Awareness -29%</p>
              <p className="text-xs text-gray-400">ROAS 1.8x ต่ำกว่าเป้า ลดจาก ฿120K เป็น ฿85K แล้วโอนไป Retargeting</p>
            </div>
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="font-medium text-red-400 mb-1">4. ลดงบ Video Views -37.5%</p>
              <p className="text-xs text-gray-400">ROAS 1.2x ต่ำที่สุด ควรลดจาก ฿8K เป็น ฿5K หรือปรับ creative</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              ผลลัพธ์คาดการณ์: Revenue เพิ่ม <span className="text-emerald-400 font-medium">+33%</span> โดยงบรวมเพิ่มเพียง <span className="text-amber-400 font-medium">+5%</span>
            </p>
            <button className="btn-primary text-sm">Apply AI Recommendations</button>
          </div>
        </div>
      )}
    </div>
  );
}
