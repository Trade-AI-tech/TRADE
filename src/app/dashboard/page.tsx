'use client';

import { useMemo } from 'react';
import MetricCard from '@/components/dashboard/MetricCard';
import PerformanceChart from '@/components/charts/PerformanceChart';
import BudgetChart from '@/components/charts/BudgetChart';
import AIInsightsPanel from '@/components/dashboard/AIInsightsPanel';
import CampaignTable from '@/components/campaigns/CampaignTable';
import { useCampaigns, useAIInsights, useCampaignSummary } from '@/hooks/useData';
import { DEMO_STATS, DEMO_BUDGET_DATA, generateChartData } from '@/lib/demo-data';
import {
  DollarSign, Eye, MousePointerClick, ShoppingCart,
  Target, TrendingUp, Sparkles, RefreshCw,
} from 'lucide-react';

export default function DashboardPage() {
  const { data: campaigns } = useCampaigns();
  const { data: insights } = useAIInsights();
  const { data: summaries } = useCampaignSummary();

  const chartData = useMemo(() => generateChartData(), []);

  const stats = DEMO_STATS;
  const budgetData = DEMO_BUDGET_DATA;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            ภาพรวมประสิทธิภาพโฆษณา TikTok ทั้งหมด
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="btn-ghost flex items-center gap-2 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Data
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="ค่าใช้จ่ายรวม"
          value={stats.total_spend}
          change={stats.spend_change}
          format="currency"
          icon={DollarSign}
          iconColor="text-accent-hot"
          inverseChange
          delay={0}
        />
        <MetricCard
          label="รายได้รวม"
          value={stats.total_revenue}
          change={stats.revenue_change}
          format="currency"
          icon={TrendingUp}
          iconColor="text-accent-glow"
          delay={50}
        />
        <MetricCard
          label="Impressions"
          value={stats.total_impressions}
          change={8.3}
          format="number"
          icon={Eye}
          delay={100}
        />
        <MetricCard
          label="Conversions"
          value={stats.total_conversions}
          change={15.7}
          format="number"
          icon={ShoppingCart}
          iconColor="text-accent-gold"
          delay={150}
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Clicks" value={stats.total_clicks} change={5.2} format="number" icon={MousePointerClick} delay={200} />
        <MetricCard label="CTR เฉลี่ย" value={stats.avg_ctr} change={0.12} format="percent" icon={Target} delay={250} />
        <MetricCard label="CPC เฉลี่ย" value={stats.avg_cpc} change={-3.2} format="currency" icon={DollarSign} inverseChange delay={300} />
        <MetricCard label="ROAS เฉลี่ย" value={stats.avg_roas} change={8.5} format="decimal" icon={Sparkles} iconColor="text-accent-purple" delay={350} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PerformanceChart data={chartData} />
        </div>
        <div>
          <AIInsightsPanel insights={insights} />
        </div>
      </div>

      {/* Budget Chart */}
      <BudgetChart data={budgetData} />

      {/* Campaign Table */}
      <div>
        <h2 className="text-lg font-display text-white mb-4">แคมเปญทั้งหมด</h2>
        <CampaignTable campaigns={campaigns} summaries={summaries} />
      </div>
    </div>
  );
}
