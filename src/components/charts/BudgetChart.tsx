'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

interface BudgetChartProps {
  data: Array<{
    name: string;
    allocated: number;
    spent: number;
    ai_recommended: number;
  }>;
}

export default function BudgetChart({ data }: BudgetChartProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">การจัดสรรงบ vs AI แนะนำ</h3>
      </div>

      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 30, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              angle={-20}
              textAnchor="end"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1b24',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                padding: '12px',
                fontSize: '12px',
              }}
              formatter={(value: number) => [`฿${value.toLocaleString()}`, '']}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
            />
            <Bar dataKey="allocated" name="งบจัดสรร" fill="#25F4EE" radius={[4, 4, 0, 0]} opacity={0.8} />
            <Bar dataKey="spent" name="ใช้จริง" fill="#FE2C55" radius={[4, 4, 0, 0]} opacity={0.8} />
            <Bar dataKey="ai_recommended" name="AI แนะนำ" fill="#7B61FF" radius={[4, 4, 0, 0]} opacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
