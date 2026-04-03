'use client';

import { cn, formatNumber, formatPercent } from '@/lib/utils';
import {
  Sparkles, Eye, Clock, ThumbsUp, Share2, MessageCircle,
  TrendingUp, TrendingDown, AlertTriangle, Star, Video,
} from 'lucide-react';

const creatives = [
  {
    id: '1', name: 'Summer Sale - UGC Style', format: 'SINGLE_VIDEO',
    score: 92, trend: 'up' as const, days_active: 5,
    metrics: { impressions: 420000, ctr: 2.8, views_p100: 35, engagement: 4.2, hook_rate: 78 },
    status: 'performing',
  },
  {
    id: '2', name: 'Product Demo - Studio', format: 'SINGLE_VIDEO',
    score: 74, trend: 'flat' as const, days_active: 14,
    metrics: { impressions: 680000, ctr: 1.4, views_p100: 22, engagement: 2.1, hook_rate: 55 },
    status: 'moderate',
  },
  {
    id: '3', name: 'Testimonial Carousel', format: 'CAROUSEL',
    score: 61, trend: 'down' as const, days_active: 21,
    metrics: { impressions: 310000, ctr: 0.9, views_p100: 15, engagement: 1.3, hook_rate: 38 },
    status: 'fatigue',
  },
  {
    id: '4', name: 'Flash Sale Countdown', format: 'SINGLE_VIDEO',
    score: 88, trend: 'up' as const, days_active: 3,
    metrics: { impressions: 195000, ctr: 3.1, views_p100: 42, engagement: 5.8, hook_rate: 82 },
    status: 'performing',
  },
];

function getScoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function getScoreGradient(score: number) {
  if (score >= 80) return 'from-emerald-500 to-emerald-400';
  if (score >= 60) return 'from-amber-500 to-amber-400';
  return 'from-red-500 to-red-400';
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'performing': return { label: 'ดีมาก', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    case 'moderate': return { label: 'ปานกลาง', class: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    case 'fatigue': return { label: 'Ad Fatigue', class: 'bg-red-500/20 text-red-400 border-red-500/30' };
    default: return { label: status, class: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
  }
}

export default function CreativePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-white">Creative Analyzer</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI วิเคราะห์คุณภาพ Ad Creative และแนะนำ optimization</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Analyze All Creatives
        </button>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card text-center">
          <Video className="w-5 h-5 text-accent-glow mx-auto mb-2" />
          <p className="text-2xl font-mono font-bold text-white">{creatives.length}</p>
          <p className="text-xs text-gray-500">Active Creatives</p>
        </div>
        <div className="card text-center">
          <Star className="w-5 h-5 text-accent-gold mx-auto mb-2" />
          <p className="text-2xl font-mono font-bold text-accent-gold">
            {Math.round(creatives.reduce((s, c) => s + c.score, 0) / creatives.length)}
          </p>
          <p className="text-xs text-gray-500">คะแนนเฉลี่ย</p>
        </div>
        <div className="card text-center">
          <TrendingUp className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
          <p className="text-2xl font-mono font-bold text-emerald-400">
            {creatives.filter(c => c.status === 'performing').length}
          </p>
          <p className="text-xs text-gray-500">Performing</p>
        </div>
        <div className="card text-center">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-2" />
          <p className="text-2xl font-mono font-bold text-red-400">
            {creatives.filter(c => c.status === 'fatigue').length}
          </p>
          <p className="text-xs text-gray-500">Ad Fatigue</p>
        </div>
      </div>

      {/* Creative Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {creatives.map((creative) => {
          const badge = getStatusBadge(creative.status);
          return (
            <div key={creative.id} className="card-hover">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {/* Score circle */}
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                      <circle
                        cx="28" cy="28" r="24" fill="none"
                        stroke="url(#scoreGrad)" strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${(creative.score / 100) * 150.8} 150.8`}
                      />
                      <defs>
                        <linearGradient id="scoreGrad">
                          <stop offset="0%" stopColor={creative.score >= 80 ? '#10B981' : creative.score >= 60 ? '#F59E0B' : '#EF4444'} />
                          <stop offset="100%" stopColor={creative.score >= 80 ? '#34D399' : creative.score >= 60 ? '#FBBF24' : '#F87171'} />
                        </linearGradient>
                      </defs>
                    </svg>
                    <span className={cn('absolute inset-0 flex items-center justify-center text-sm font-mono font-bold', getScoreColor(creative.score))}>
                      {creative.score}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-white">{creative.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono text-gray-500">{creative.format}</span>
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border', badge.class)}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {creative.days_active} วัน
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { icon: Eye, label: 'Impressions', value: formatNumber(creative.metrics.impressions, true) },
                  { icon: ThumbsUp, label: 'CTR', value: formatPercent(creative.metrics.ctr) },
                  { icon: Video, label: 'View 100%', value: formatPercent(creative.metrics.views_p100) },
                  { icon: Share2, label: 'Engagement', value: formatPercent(creative.metrics.engagement) },
                  { icon: Sparkles, label: 'Hook Rate', value: formatPercent(creative.metrics.hook_rate) },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="text-center">
                    <Icon className="w-3.5 h-3.5 text-gray-500 mx-auto mb-1" />
                    <p className="text-xs font-mono font-medium text-white">{value}</p>
                    <p className="text-[10px] text-gray-600">{label}</p>
                  </div>
                ))}
              </div>

              {/* AI recommendation */}
              {creative.status === 'fatigue' && (
                <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs font-medium text-red-400">AI แนะนำ: เปลี่ยน Creative</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Creative นี้ใช้มา {creative.days_active} วัน CTR ลดลง 45% จากสัปดาห์แรก ควรเปลี่ยน creative ใหม่
                  </p>
                </div>
              )}
              {creative.status === 'performing' && (
                <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-400">AI แนะนำ: Scale up</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Creative นี้ performance ดีมาก สามารถเพิ่มงบเพื่อขยาย reach ได้อีก 40-60%
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
