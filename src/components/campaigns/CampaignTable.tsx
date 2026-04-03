'use client';

import { cn, formatCurrency, formatNumber, formatPercent, getStatusColor } from '@/lib/utils';
import type { Campaign, CampaignSummary } from '@/types';
import { MoreHorizontal, ExternalLink, Pause, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface CampaignTableProps {
  campaigns: Campaign[];
  summaries?: CampaignSummary[];
  onStatusChange?: (id: string, status: string) => void;
}

export default function CampaignTable({ campaigns, summaries, onStatusChange }: CampaignTableProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const getSummary = (id: string) => summaries?.find(s => s.campaign_id === id);

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['แคมเปญ', 'สถานะ', 'งบ', 'ใช้ไป', 'Impressions', 'Clicks', 'CTR', 'ROAS', ''].map(
                (h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {campaigns.map((campaign) => {
              const summary = getSummary(campaign.id);
              return (
                <tr
                  key={campaign.id}
                  className="group hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-glow/20 to-accent-hot/20 flex items-center justify-center text-xs font-bold text-white">
                        {campaign.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white group-hover:text-accent-glow transition-colors">
                          {campaign.name}
                        </p>
                        <p className="text-[11px] text-gray-500">{campaign.objective}</p>
                      </div>
                    </Link>
                  </td>

                  <td className="px-5 py-4">
                    <span className={cn('px-2.5 py-1 rounded-lg text-[11px] font-medium border', getStatusColor(campaign.status))}>
                      {campaign.status}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-sm font-mono text-gray-300">
                    {formatCurrency(campaign.budget, 'THB', true)}
                  </td>

                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <span className="text-sm font-mono text-gray-300">
                        {formatCurrency(summary?.total_spend || campaign.spent, 'THB', true)}
                      </span>
                      <div className="w-20 h-1 bg-surface-3 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-glow/60 rounded-full"
                          style={{
                            width: `${Math.min(100, ((summary?.total_spend || campaign.spent) / campaign.budget) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-4 text-sm font-mono text-gray-300">
                    {formatNumber(summary?.total_impressions || 0, true)}
                  </td>

                  <td className="px-5 py-4 text-sm font-mono text-gray-300">
                    {formatNumber(summary?.total_clicks || 0, true)}
                  </td>

                  <td className="px-5 py-4 text-sm font-mono text-gray-300">
                    {formatPercent(summary?.avg_ctr || 0)}
                  </td>

                  <td className="px-5 py-4">
                    <span className={cn(
                      'text-sm font-mono font-medium',
                      (summary?.avg_roas || 0) >= 3 ? 'text-emerald-400' :
                      (summary?.avg_roas || 0) >= 1.5 ? 'text-amber-400' :
                      'text-red-400'
                    )}>
                      {(summary?.avg_roas || 0).toFixed(2)}x
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === campaign.id ? null : campaign.id)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {menuOpen === campaign.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 glass-card p-1.5 animate-fade-in z-10">
                          <Link
                            href={`/campaigns/${campaign.id}`}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> ดูรายละเอียด
                          </Link>
                          <button
                            onClick={() => onStatusChange?.(campaign.id, campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/5 w-full"
                          >
                            {campaign.status === 'ACTIVE' ? (
                              <><Pause className="w-3.5 h-3.5" /> หยุดชั่วคราว</>
                            ) : (
                              <><Play className="w-3.5 h-3.5" /> เปิดใช้งาน</>
                            )}
                          </button>
                          <button
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> ลบ
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
