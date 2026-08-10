'use client';

import { Search, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/hooks/useStore';

export default function Header() {
  const router = useRouter();
  const refresh = useAppStore((s) => s.refresh);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [query, setQuery] = useState('');

  const scanMarkets = async () => {
    setScanning(true);
    setResult(null);
    try {
      const res = await fetch('/api/signals/scan', { method: 'POST' });
      const data = await res.json();
      setResult({
        ok: Boolean(data.success),
        msg: data.success ? data.message ?? 'สแกนเสร็จแล้ว' : data.error ?? 'สแกนไม่สำเร็จ',
      });
      if (data.success) refresh();
    } catch (err) {
      setResult({ ok: false, msg: String(err) });
    } finally {
      setScanning(false);
      setTimeout(() => setResult(null), 6000);
    }
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/markets?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between gap-4 px-6 bg-surface-0/80 backdrop-blur-xl border-b border-white/5">
      <form onSubmit={submitSearch} className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา symbol (XAUUSD, AAPL, PTT.BK)..."
          className="input-field pl-10 py-2 text-sm bg-surface-1"
        />
      </form>

      <div className="flex items-center gap-3">
        {result && (
          <div
            className={cn(
              'hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border max-w-md',
              result.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            )}
          >
            {result.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
            <span className="truncate">{result.msg}</span>
          </div>
        )}

        <button
          onClick={scanMarkets}
          disabled={scanning}
          className={cn(
            'btn-primary flex items-center gap-2',
            scanning && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Zap className={cn('w-4 h-4', scanning && 'animate-pulse')} />
          <span>{scanning ? 'กำลังสแกน...' : 'สแกนตลาด'}</span>
        </button>
      </div>
    </header>
  );
}
