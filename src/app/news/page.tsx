'use client';

import { useNews } from '@/hooks/useData';
import { cn } from '@/lib/utils';
import { Newspaper, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';

export default function NewsPage() {
  const { data: news } = useNews(50);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-white flex items-center gap-2">
          <Newspaper className="w-6 h-6 text-accent-glow" />
          ข่าวสารตลาด
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          ข่าวสำคัญ + AI sentiment analysis
        </p>
      </div>

      {news.length === 0 && (
        <div className="card text-center py-16">
          <Newspaper className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">ยังไม่มีข่าวในระบบ</p>
          <p className="text-xs text-gray-600 mt-1">ส่วนดึงข่าวอัตโนมัติยังไม่ได้ต่อแหล่งข้อมูล</p>
        </div>
      )}

      <div className="space-y-3">
        {news.map(n => {
          const SentIcon = n.sentiment === 'bullish' ? TrendingUp : n.sentiment === 'bearish' ? TrendingDown : Minus;
          const sentColor = n.sentiment === 'bullish' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            : n.sentiment === 'bearish' ? 'text-red-400 bg-red-500/10 border-red-500/20'
            : 'text-gray-400 bg-gray-500/10 border-gray-500/20';

          return (
            <article key={n.id} className="card hover:border-white/10 transition-colors">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 text-xs text-gray-500">
                    <span className="font-medium text-accent-glow">{n.source}</span>
                    <span>•</span>
                    <span>{new Date(n.published_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white leading-snug">{n.title}</h3>
                </div>
                <div className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border flex-shrink-0', sentColor)}>
                  <SentIcon className="w-3 h-3" />
                  <span className="capitalize">{n.sentiment}</span>
                  {Number.isFinite(Number(n.sentiment_score)) && (
                    <span className="opacity-60">({(Number(n.sentiment_score) * 100).toFixed(0)})</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-3">{n.summary}</p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {n.symbols.slice(0, 5).map(s => (
                    <span key={s} className="text-[10px] px-2 py-0.5 bg-white/5 rounded text-gray-400 font-mono">
                      {s}
                    </span>
                  ))}
                </div>
                {n.url && (
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-glow hover:underline flex items-center gap-1"
                  >
                    อ่านต่อ <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
