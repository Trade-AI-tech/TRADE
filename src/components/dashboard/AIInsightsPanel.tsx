'use client';

import { cn, getSeverityColor } from '@/lib/utils';
import type { AIInsight } from '@/types';
import {
  Sparkles, TrendingUp, AlertTriangle, Zap, Eye,
  ChevronRight, CheckCircle2, Info, AlertCircle,
} from 'lucide-react';

interface AIInsightsPanelProps {
  insights: AIInsight[];
  onMarkRead?: (id: string) => void;
  onAction?: (id: string) => void;
}

const typeIcons: Record<string, typeof Sparkles> = {
  BUDGET_OPTIMIZATION: Zap,
  PERFORMANCE_ALERT: AlertTriangle,
  TREND_PREDICTION: TrendingUp,
  CREATIVE_ANALYSIS: Eye,
  ANOMALY_DETECTION: AlertCircle,
  ACTION_RECOMMENDATION: CheckCircle2,
  AUDIENCE_INSIGHT: Sparkles,
  COMPETITOR_INSIGHT: Info,
};

export default function AIInsightsPanel({ insights, onMarkRead, onAction }: AIInsightsPanelProps) {
  if (!insights.length) {
    return (
      <div className="card text-center py-12">
        <Sparkles className="w-10 h-10 text-accent-glow/30 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">ยังไม่มี AI Insights</p>
        <p className="text-gray-600 text-xs mt-1">กดปุ่ม &quot;AI วิเคราะห์&quot; เพื่อเริ่มวิเคราะห์</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-accent-glow" />
        <h3 className="text-sm font-semibold text-white">AI Insights</h3>
        <span className="text-xs text-gray-500 font-mono">
          {insights.filter(i => !i.is_read).length} ใหม่
        </span>
      </div>

      {insights.map((insight) => {
        const Icon = typeIcons[insight.type] || Info;
        return (
          <div
            key={insight.id}
            className={cn(
              'card-hover relative overflow-hidden',
              !insight.is_read && 'border-l-2 border-l-accent-glow'
            )}
            onClick={() => onMarkRead?.(insight.id)}
          >
            {/* Severity indicator */}
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                getSeverityColor(insight.severity)
              )}>
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium text-white truncate">
                    {insight.title}
                  </h4>
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium border',
                    getSeverityColor(insight.severity)
                  )}>
                    {insight.severity}
                  </span>
                </div>

                <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                  {insight.summary}
                </p>

                {/* Confidence bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-glow to-accent-hot transition-all duration-500"
                      style={{ width: `${insight.confidence}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">
                    {insight.confidence}%
                  </span>
                </div>

                {/* Recommendations */}
                {insight.recommendations?.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {insight.recommendations.slice(0, 2).map((rec, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <ChevronRight className="w-3 h-3 text-accent-glow flex-shrink-0" />
                        <span className="text-gray-300">{rec.action}</span>
                        <span className={cn(
                          'ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium',
                          rec.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                          rec.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-gray-500/20 text-gray-400'
                        )}>
                          {rec.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
