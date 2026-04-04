'use client';

import PerformanceChart from '@/components/charts/PerformanceChart';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import { Sparkles, Download, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = ['#25F4EE', '#FE2C55', '#FFD700', '#7B61FF', '#10B981'];

const objectiveData = [
  { name: 'Conversions', value: 45 },
  { name: 'Reach', value: 25 },
  { name: 'Traffic', value: 15 },
  { name: 'Video Views', value: 10 },
  { name: 'Other', value: 5 },
];

const performanceRadar = [
  { metric: 'CTR', value: 78, benchmark: 60 },
  { metric: 'ROAS', value: 85, benchmark: 55 },
  { metric: 'CPC', value: 65, benchmark: 70 },
  { metric: 'Conv Rate', value: 72, benchmark: 50 },
  { metric: 'Engagement', value: 90, benchmark: 65 },
  { metric: 'Video Views', value: 60, benchmark: 55 },
];

// Use shared deterministic chart data
import { generateChartData } from '@/lib/demo-data';
const chartData = generateChartData();

const funnelData = [
  { stage: 'Impressions', value: 3450000, pct: 100 },
  { stage: 'Clicks', value: 52300, pct: 1.52 },
  { stage: 'Landing Page', value: 41840, pct: 80 },
  { stage: 'Add to Cart', value: 8368, pct: 20 },
  { stage: 'Purchase', value: 1847, pct: 22.1 },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-white">วิเคราะห์ประสิทธิภาพ</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-powered analytics สำหรับทุกแคมเปญ</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-ghost flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4" /> ตัวกรอง
          </button>
          <button className="btn-ghost flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Export Report
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> AI Deep Analysis
          </button>
        </div>
      </div>

      {/* Main chart */}
      <PerformanceChart data={chartData} />

      {/* Two column: Pie + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Objective Distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">สัดส่วนงบตาม Objective</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={objectiveData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  stroke="none"
                >
                  {objectiveData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1b24',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [`${value}%`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {objectiveData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                {d.name} ({d.value}%)
              </div>
            ))}
          </div>
        </div>

        {/* Performance Radar */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Performance Score vs Benchmark</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={performanceRadar}>
                <PolarGrid stroke="rgba(255,255,255,0.06)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 11, fill: '#71717a' }}
                />
                <Radar
                  name="คุณ"
                  dataKey="value"
                  stroke="#25F4EE"
                  fill="#25F4EE"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Radar
                  name="Benchmark"
                  dataKey="benchmark"
                  stroke="#FE2C55"
                  fill="#FE2C55"
                  fillOpacity={0.05}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1b24',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-6">Conversion Funnel</h3>
        <div className="space-y-3">
          {funnelData.map((stage, i) => (
            <div key={stage.stage} className="flex items-center gap-4">
              <span className="w-28 text-xs text-gray-400 text-right flex-shrink-0">
                {stage.stage}
              </span>
              <div className="flex-1 h-10 bg-surface-3 rounded-lg overflow-hidden relative">
                <div
                  className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-3"
                  style={{
                    width: `${Math.max(5, (stage.value / funnelData[0].value) * 100)}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                    opacity: 0.7,
                  }}
                >
                  <span className="text-xs font-mono font-medium text-white drop-shadow">
                    {stage.value.toLocaleString()}
                  </span>
                </div>
              </div>
              <span className="w-16 text-xs font-mono text-gray-500 text-right">
                {i > 0 ? `${stage.pct}%` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
