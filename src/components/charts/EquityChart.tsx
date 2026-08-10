'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Props {
  data: Array<{ date: string; value: number }>;
  subtitle?: string;
  emptyText?: string;
}

export default function EquityChart({ data, subtitle, emptyText }: Props) {
  const startValue = data[0]?.value ?? 0;
  const endValue = data[data.length - 1]?.value ?? 0;
  const pnl = endValue - startValue;
  const pnlPct = startValue > 0 ? (pnl / startValue) * 100 : 0;
  const isUp = pnl >= 0;
  const color = isUp ? '#34d399' : '#f87171';

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Equity Curve</h3>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle ?? 'ประสิทธิภาพพอร์ต 30 วัน'}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold text-white">${endValue.toLocaleString()}</div>
          <div className={`text-sm font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {isUp ? '+' : ''}${pnl.toLocaleString()} ({isUp ? '+' : ''}{pnlPct.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="h-[280px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500 text-center px-6">
            {emptyText ?? 'ยังไม่มีข้อมูล'}
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="equity-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={60} />
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
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill="url(#equity-grad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: color, fill: '#0a0b0f' }}
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
