'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface PerformanceChartProps {
  data: Array<{
    date: string;
    spend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>;
}

const METRICS = [
  { key: 'spend', label: 'ค่าใช้จ่าย', color: '#FE2C55' },
  { key: 'revenue', label: 'รายได้', color: '#25F4EE' },
  { key: 'conversions', label: 'Conversions', color: '#FFD700' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

export default function PerformanceChart({ data }: PerformanceChartProps) {
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(
    new Set(['spend', 'revenue'])
  );

  const toggle = (key: MetricKey) => {
    const next = new Set(activeMetrics);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    setActiveMetrics(next);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">ภาพรวมประสิทธิภาพ</h3>
        <div className="flex gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium transition-all border',
                activeMetrics.has(m.key)
                  ? 'border-white/20 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              )}
              style={{
                backgroundColor: activeMetrics.has(m.key) ? `${m.color}15` : undefined,
              }}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: m.color }} />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              {METRICS.map((m) => (
                <linearGradient key={m.key} id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={m.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1b24',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                padding: '12px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
            />
            {METRICS.map(
              (m) =>
                activeMetrics.has(m.key) && (
                  <Area
                    key={m.key}
                    type="monotone"
                    dataKey={m.key}
                    stroke={m.color}
                    strokeWidth={2}
                    fill={`url(#grad-${m.key})`}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: m.color, fill: '#0a0b0f' }}
                  />
                )
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
