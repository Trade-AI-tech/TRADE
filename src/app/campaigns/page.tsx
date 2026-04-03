'use client';

import CampaignTable from '@/components/campaigns/CampaignTable';
import { useCampaigns, useCampaignSummary } from '@/hooks/useData';
import { Plus, Filter, Download } from 'lucide-react';
import Link from 'next/link';

export default function CampaignsPage() {
  const { data: campaigns } = useCampaigns();
  const { data: summaries } = useCampaignSummary();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-white">แคมเปญ</h1>
          <p className="text-sm text-gray-500 mt-0.5">จัดการแคมเปญโฆษณา TikTok ทั้งหมด</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-ghost flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4" /> ตัวกรอง
          </button>
          <button className="btn-ghost flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Export
          </button>
          <Link href="/campaigns/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> สร้างแคมเปญ
          </Link>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'ทั้งหมด', value: campaigns.length, color: 'text-white' },
          { label: 'Active', value: campaigns.filter(c => c.status === 'ACTIVE').length, color: 'text-emerald-400' },
          { label: 'Paused', value: campaigns.filter(c => c.status === 'PAUSED').length, color: 'text-amber-400' },
          { label: 'Draft', value: campaigns.filter(c => c.status === 'DRAFT').length, color: 'text-gray-400' },
        ].map((stat) => (
          <div key={stat.label} className="card text-center">
            <p className={`text-2xl font-mono font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <CampaignTable campaigns={campaigns} summaries={summaries} />
    </div>
  );
}
