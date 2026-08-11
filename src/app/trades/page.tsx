'use client';

import { useState, useMemo } from 'react';
import TradeRow, { isPriceMonitored } from '@/components/trading/TradeRow';
import { useTrades } from '@/hooks/useData';
import { useAppStore } from '@/hooks/useStore';
import { cn, formatAmount } from '@/lib/utils';
import { Briefcase, TrendingUp, TrendingDown, Activity, X, Loader2 } from 'lucide-react';
import type { Trade } from '@/types';

const FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'open', label: 'กำลังถือ' },
  { value: 'closed', label: 'ปิดแล้ว' },
];

export default function TradesPage() {
  const { data: trades } = useTrades();
  const refresh = useAppStore((s) => s.refresh);
  const [filter, setFilter] = useState('all');
  const [closing, setClosing] = useState<Trade | null>(null);
  const [exitPrice, setExitPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCloseModal = (trade: Trade) => {
    setClosing(trade);
    setExitPrice(String(trade.entry_price));
    setError(null);
  };

  const submitClose = async () => {
    if (!closing) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/trades', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: closing.id, exit_price: Number(exitPrice) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'ปิดออเดอร์ไม่สำเร็จ');
      setClosing(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return trades;
    return trades.filter(t => t.status === filter);
  }, [trades, filter]);

  const stats = useMemo(() => {
    const closed = trades.filter(t => t.status === 'closed');
    const open = trades.filter(t => t.status === 'open');
    const wins = closed.filter(t => t.pnl > 0).length;
    const losses = closed.filter(t => t.pnl < 0).length;
    // ออเดอร์ที่ตัวเฝ้าราคายังไม่เคยตรวจจะมี pnl = 0 ตามค่า DEFAULT ของคอลัมน์
    // ซึ่งแปลว่า "ยังไม่เคยวัด" ไม่ใช่ "เสมอตัว" — เอามารวมยอดจะเจือจางกำไร/ขาดทุนจริง
    // ของออเดอร์ที่วัดแล้ว จึงต้องนับเฉพาะออเดอร์ที่ตรวจแล้วเท่านั้น
    const monitoredOpen = open.filter(isPriceMonitored);
    // แยกสองก้อนออกจากกัน เพราะกำไรของออเดอร์ที่ยังถืออยู่ขยับตามราคาทุกครั้งที่ตัวเฝ้าราคาทำงาน
    // ถ้าเอาไปบวกกับกำไรที่ปิดแล้ว ผู้ใช้จะแยกไม่ออกว่าเงินก้อนไหนจบแล้วจริง
    const realizedPnl = closed.reduce((sum, t) => sum + t.pnl, 0);
    const unrealizedPnl = monitoredOpen.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = closed.length ? (wins / closed.length) * 100 : 0;
    return {
      wins,
      losses,
      realizedPnl,
      unrealizedPnl,
      openCount: open.length,
      monitoredOpenCount: monitoredOpen.length,
      winRate,
      total: trades.length,
    };
  }, [trades]);

  // คำอธิบายใต้การ์ด "กำไรที่ยังไม่ปิด" ต้องบอกว่ายอดนี้มาจากออเดอร์กี่ไม้
  // ไม่งั้นผู้ใช้จะเข้าใจว่ารวมทุกออเดอร์ที่ถืออยู่ ทั้งที่ไม้ที่ยังไม่ถูกตรวจราคาไม่ได้อยู่ในยอด
  const unrealizedNote =
    stats.openCount === 0
      ? 'ไม่มีออเดอร์ที่ถืออยู่'
      : stats.monitoredOpenCount === 0
      ? `ตัวเฝ้าราคายังไม่เคยตรวจ ${stats.openCount} ออเดอร์ที่ถืออยู่`
      : stats.monitoredOpenCount === stats.openCount
      ? `จาก ${stats.openCount} ออเดอร์ที่ถืออยู่`
      : `จาก ${stats.monitoredOpenCount}/${stats.openCount} ออเดอร์ที่ถืออยู่ ที่เหลือยังไม่ได้ตรวจราคา`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-white flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-accent-glow" />
          พอร์ตเทรด
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          ประวัติการเทรดและผลการดำเนินงาน
        </p>
        <p className="text-xs text-gray-600 mt-1">
          ออเดอร์ที่ปิดด้วย SL/TP อัตโนมัติ เป็นการบันทึกลงสมุดเทรดเท่านั้น ระบบไม่ได้ส่งคำสั่งซื้อขายไปยังโบรกเกอร์
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="card">
          <div className="text-xs text-gray-500 uppercase mb-1">กำไรที่ปิดแล้ว</div>
          <div className={cn('text-2xl font-mono font-bold', stats.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {formatAmount(stats.realizedPnl, true)}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">ปิดจบแล้ว ไม่ขยับอีก · รวมหลายสกุล</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500 uppercase mb-1">กำไรที่ยังไม่ปิด</div>
          {stats.monitoredOpenCount === 0 ? (
            // ไม่มีออเดอร์ที่วัดได้เลย — ไม่ว่าจะเพราะไม่มีออเดอร์ถืออยู่
            // หรือมีแต่ตัวเฝ้าราคายังไม่เคยตรวจ อย่าแสดง 0.00 ให้เข้าใจผิดว่าเสมอตัว
            <div className="text-2xl font-mono font-bold text-gray-500">—</div>
          ) : (
            <div className={cn('text-2xl font-mono font-bold', stats.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {formatAmount(stats.unrealizedPnl, true)}
            </div>
          )}
          <div className="text-[10px] text-gray-500 mt-1">{unrealizedNote}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500 uppercase mb-1">Win Rate</div>
          <div className="text-2xl font-mono font-bold text-white">{stats.winRate.toFixed(1)}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" /> ชนะ
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400">{stats.wins}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-red-400" /> แพ้
          </div>
          <div className="text-2xl font-mono font-bold text-red-400">{stats.losses}</div>
        </div>
      </div>

      <div className="flex gap-2">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors border',
              filter === f.value
                ? 'border-accent-glow/30 bg-accent-glow/10 text-accent-glow'
                : 'border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">ยังไม่มีข้อมูลเทรด</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 text-xs text-gray-500 uppercase">
                <th className="py-3 px-4 text-left font-medium">Symbol</th>
                <th className="py-3 px-4 text-left font-medium">ตลาด</th>
                <th className="py-3 px-4 text-left font-medium">ทิศทาง</th>
                <th className="py-3 px-4 text-left font-medium">Entry</th>
                <th className="py-3 px-4 text-left font-medium">Exit</th>
                <th className="py-3 px-4 text-left font-medium">จำนวน</th>
                <th className="py-3 px-4 text-left font-medium">P/L</th>
                <th className="py-3 px-4 text-left font-medium">สถานะ</th>
                <th className="py-3 px-4 text-left font-medium">วันที่เข้า</th>
                <th className="py-3 px-4 text-right font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => <TradeRow key={t.id} trade={t} onClose={openCloseModal} />)}
            </tbody>
          </table>
        </div>
      )}

      {closing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card w-full max-w-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">ปิดออเดอร์ {closing.symbol}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {closing.direction === 'long' ? 'Long' : 'Short'} · เข้าที่ {closing.entry_price} · จำนวน {closing.quantity}
                </p>
              </div>
              <button onClick={() => setClosing(null)} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">ราคาปิด</label>
              <input
                type="text"
                inputMode="decimal"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                className="input-field font-mono"
                placeholder="0.00"
              />
            </div>

            {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-xl p-3">{error}</p>}

            <div className="flex justify-end gap-3">
              <button onClick={() => setClosing(null)} className="btn-ghost text-sm">ยกเลิก</button>
              <button
                onClick={submitClose}
                disabled={saving || !(Number(exitPrice) > 0)}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                ยืนยันปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
