'use client';

import { Search, Calendar, Sparkles } from 'lucide-react';
import { useAppStore } from '@/hooks/useStore';
import { cn, dateRangePresets, toDateString } from '@/lib/utils';
import { useState } from 'react';

export default function Header() {
  const { dateRange, setDateRange, isAnalyzing, setIsAnalyzing } = useAppStore();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const presets = dateRangePresets();

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between gap-4 px-6 bg-surface-0/80 backdrop-blur-xl border-b border-white/5">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="ค้นหาแคมเปญ, insights..."
          className="input-field pl-10 py-2 text-sm bg-surface-1"
        />
      </div>

      <div className="flex items-center gap-3">
        {/* AI Analyze Button */}
        <button
          onClick={() => setIsAnalyzing(true)}
          disabled={isAnalyzing}
          className={cn(
            'btn-primary flex items-center gap-2',
            isAnalyzing && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Sparkles className={cn('w-4 h-4', isAnalyzing && 'animate-spin')} />
          <span>{isAnalyzing ? 'กำลังวิเคราะห์...' : 'AI วิเคราะห์'}</span>
        </button>

        {/* Date Range */}
        <div className="relative">
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <Calendar className="w-4 h-4" />
            <span>{dateRange.label}</span>
          </button>

          {showDatePicker && (
            <div className="absolute right-0 top-full mt-2 w-48 glass-card p-2 space-y-0.5 animate-fade-in">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setDateRange({ ...preset, label: preset.label });
                    setShowDatePicker(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                    dateRange.label === preset.label
                      ? 'bg-accent-glow/10 text-accent-glow'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
