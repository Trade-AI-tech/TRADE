'use client';

import { Search, Zap, CheckCircle2, XCircle, Menu } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/hooks/useStore';

export default function Header() {
  const router = useRouter();
  const refresh = useAppStore((s) => s.refresh);
  const toggleMobileNav = useAppStore((s) => s.toggleMobileNav);
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
    // แถวหลักย้ายเข้า div ชั้นใน เพื่อให้มือถือมีแถวผลสแกนเต็มความกว้างต่อท้ายด้านล่างได้
    // โดยเดสก์ท็อปยังเห็น header สูง h-16 แถวเดียวเหมือนเดิมทุกอย่าง
    <header className="sticky top-0 z-30 bg-surface-0/80 backdrop-blur-xl border-b border-white/5">
      <div className="h-16 flex items-center justify-between gap-3 sm:gap-4 px-4 sm:px-6">
        {/* hamburger เปิด drawer — มือถือเท่านั้น (เดสก์ท็อปมี rail อยู่แล้ว) */}
        <button
          onClick={toggleMobileNav}
          aria-label="เปิดเมนู"
          className="lg:hidden w-10 h-10 -ml-2 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* min-w-0 ให้ input ยอมหดในจอแคบ ไม่ดัน header ล้นจอ */}
        <form onSubmit={submitSearch} className="relative flex-1 min-w-0 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา symbol (XAUUSD, AAPL, PTT.BK)..."
            className="input-field pl-10 py-2 text-sm bg-surface-1"
          />
        </form>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* ผลสแกนแบบ inline — จอ md ขึ้นไปเท่านั้น (มือถือมีแถวเต็มความกว้างข้างล่างแทน) */}
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

          {/* จอ < sm ซ่อนตัวหนังสือเหลือไอคอน Zap — aria-label คงความหมายให้ screen reader
              min-h เฉพาะจอเล็กให้ปุ่มไอคอนเดี่ยวยังกดง่าย (เดสก์ท็อปขนาดเดิม) */}
          <button
            onClick={scanMarkets}
            disabled={scanning}
            aria-label="สแกนตลาด"
            className={cn(
              'btn-primary flex items-center justify-center gap-2 min-h-[40px] sm:min-h-0',
              scanning && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Zap className={cn('w-4 h-4', scanning && 'animate-pulse')} />
            <span className="hidden sm:inline">{scanning ? 'กำลังสแกน...' : 'สแกนตลาด'}</span>
          </button>
        </div>
      </div>

      {/* มือถือ: ผลสแกนเต็มแถวใต้ header — ถ้าซ่อนไปเลย ผู้ใช้มือถือกดสแกนแล้วไม่รู้ผลเลย */}
      {result && (
        <div
          className={cn(
            'md:hidden flex items-center gap-1.5 px-4 py-2 text-xs border-t',
            result.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          )}
        >
          {result.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          <span className="truncate">{result.msg}</span>
        </div>
      )}
    </header>
  );
}
