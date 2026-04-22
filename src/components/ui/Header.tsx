'use client';

import { Search, Zap } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function Header() {
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState('');

  const scanMarkets = async () => {
    setScanning(true);
    try {
      await fetch('/api/signals/scan', { method: 'POST' });
      await new Promise(r => setTimeout(r, 1500));
    } catch {}
    setScanning(false);
  };

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between gap-4 px-6 bg-surface-0/80 backdrop-blur-xl border-b border-white/5">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา symbol (XAUUSD, AAPL, PTT.BK)..."
          className="input-field pl-10 py-2 text-sm bg-surface-1"
        />
      </div>

      <div className="flex items-center gap-3">
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
