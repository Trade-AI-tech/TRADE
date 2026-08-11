'use client';

import { cn } from '@/lib/utils';
import type { Trade } from '@/types';

const marketLabel: Record<string, string> = {
  GOLD: 'ทอง', FOREX: 'Forex', TH_STOCK: 'หุ้นไทย', US_STOCK: 'หุ้น US', CRYPTO: 'Crypto',
};

/**
 * ป้ายบอกเหตุผลที่ปิดออเดอร์
 * 'manual' กับ null ใช้ป้ายเดียวกัน เพราะออเดอร์ที่ปิดไว้ก่อนจะมีตัวเฝ้าราคาก็ไม่มีค่านี้เก็บไว้
 * จะเดาย้อนหลังว่าโดน SL/TP ไม่ได้
 */
const closeReasonConfig: Record<string, { label: string; className: string }> = {
  stop_loss: { label: '🛑 ตัดขาดทุน', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
  take_profit: { label: '🎯 ปิดทำกำไร', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  manual: { label: 'ปิดเอง', className: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
};

/**
 * ตัวเฝ้าราคาเคยตรวจออเดอร์นี้แล้วหรือยัง
 *
 * ทำไมต้องมี: คอลัมน์ pnl ใน DB มี DEFAULT 0 และตอนเปิดออเดอร์ POST /api/trades
 * ก็เขียน pnl: 0 ลงไปด้วย ดังนั้น pnl = 0 บนออเดอร์ที่ยังถืออยู่แปลว่า "ยังไม่เคยวัด"
 * ไม่ใช่ "เสมอตัว" — เอาไปโชว์เป็น +0.00 สีเขียวคือการแสดงเลขที่ยังไม่เคยวัดว่าวัดแล้ว
 *
 * cron เขียน current_price กับ last_checked_at พร้อมกันทุกครั้งที่ตรวจ
 * ขาดอย่างใดอย่างหนึ่ง = ยังไม่เคยตรวจ (หรือเป็นข้อมูลเก่าก่อนมีคอลัมน์พวกนี้)
 */
export function isPriceMonitored(trade: Trade): boolean {
  return trade.last_checked_at != null && trade.current_price != null;
}

// วันที่ที่ส่งมาอาจเป็นค่าที่ parse ไม่ได้ ถ้าเจอแบบนั้นให้ไม่ต้องโชว์ ดีกว่าโชว์ Invalid Date
function formatCheckedAt(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('th-TH', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function TradeRow({
  trade,
  onClose,
}: {
  trade: Trade;
  onClose?: (trade: Trade) => void;
}) {
  const isProfit = trade.pnl >= 0;
  const isOpen = trade.status === 'open';

  // ออเดอร์ที่ปิดแล้ว pnl เป็นค่าที่คำนวณจากราคาปิดจริง เชื่อได้เสมอ
  // ส่วนออเดอร์ที่ยังถืออยู่ ตัวเลขจะมีความหมายก็ต่อเมื่อตัวเฝ้าราคาเคยตรวจแล้วเท่านั้น
  const monitored = isPriceMonitored(trade);
  const showPnl = !isOpen || monitored;

  // เฉพาะออเดอร์ที่ปิดแล้วเท่านั้นที่มีเหตุผลปิด ออเดอร์ที่ยกเลิกไม่ได้ถูกปิดจริงจึงไม่ต้องมีป้าย
  const closeReason = trade.status === 'closed'
    ? closeReasonConfig[trade.close_reason ?? 'manual'] ?? closeReasonConfig.manual
    : null;

  const checkedAt = trade.last_checked_at ? formatCheckedAt(trade.last_checked_at) : null;
  const checkedTitle = checkedAt ? `ตัวเฝ้าราคาตรวจล่าสุด ${checkedAt}` : undefined;

  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className={cn('w-1.5 h-8 rounded-full', trade.direction === 'long' ? 'bg-emerald-400' : 'bg-red-400')} />
          <div>
            <div className="font-semibold text-white text-sm">{trade.symbol}</div>
            <div className="text-xs text-gray-500">{trade.name}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-xs">
        <span className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded text-gray-400">{marketLabel[trade.market] || trade.market}</span>
      </td>
      <td className="py-3 px-4">
        <span className={cn('text-xs font-medium uppercase', trade.direction === 'long' ? 'text-emerald-400' : 'text-red-400')}>
          {trade.direction === 'long' ? 'Long' : 'Short'}
        </span>
      </td>
      <td className="py-3 px-4 font-mono text-sm text-white">{trade.entry_price}</td>
      <td className="py-3 px-4">
        {isOpen ? (
          // ออเดอร์ที่ยังถืออยู่ไม่มีราคาปิด จึงโชว์ราคาล่าสุดที่ตัวเฝ้าราคาบันทึกไว้แทน
          // ต้องกำกับให้ชัดว่าเป็นราคาปัจจุบัน ไม่ใช่ราคาที่ปิดไปแล้ว
          // ใช้ monitored ตัวเดียวกับช่อง P/L ไม่งั้นแถวเดียวกันจะขัดกันเอง
          monitored ? (
            <div title={checkedTitle} className={cn(checkedTitle && 'cursor-help')}>
              <div className="font-mono text-sm text-gray-300">{trade.current_price}</div>
              <div className="text-[10px] text-gray-500">ราคาปัจจุบัน</div>
            </div>
          ) : (
            <span className="font-mono text-sm text-gray-500">—</span>
          )
        ) : (
          <span className="font-mono text-sm text-gray-400">{trade.exit_price ?? '—'}</span>
        )}
      </td>
      <td className="py-3 px-4 font-mono text-sm text-gray-400">{trade.quantity}</td>
      <td className="py-3 px-4">
        {showPnl ? (
          <>
            <div className={cn('font-mono font-semibold', isProfit ? 'text-emerald-400' : 'text-red-400')}>
              {isProfit ? '+' : ''}{trade.pnl.toFixed(2)}
            </div>
            <div className={cn('text-xs', isProfit ? 'text-emerald-400/70' : 'text-red-400/70')}>
              {isProfit ? '+' : ''}{trade.pnl_percent.toFixed(2)}%
            </div>
            {isOpen && (
              // ตัวเลขของออเดอร์ที่ยังถืออยู่ขยับตามราคาตลอด ต้องบอกว่ายังไม่ใช่กำไรที่เก็บเข้ากระเป๋าแล้ว
              <span
                title={checkedTitle}
                className={cn(
                  'inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400',
                  checkedTitle && 'cursor-help'
                )}
              >
                ยังไม่ปิด
              </span>
            )}
          </>
        ) : (
          // ยังไม่เคยตรวจราคา = ไม่มีตัวเลขให้แสดง ห้ามเอา pnl = 0 (ค่าตั้งต้นของ DB)
          // ไปโชว์เป็น +0.00 สีเขียว เพราะผู้ใช้จะอ่านว่าเสมอตัวทั้งที่ระบบยังไม่เคยดูราคาเลย
          <>
            <div className="font-mono font-semibold text-gray-500">—</div>
            <span
              title="ตัวเฝ้าราคายังไม่เคยตรวจออเดอร์นี้ จึงยังไม่มีกำไร/ขาดทุนให้แสดง"
              className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 cursor-help"
            >
              ยังไม่ได้ตรวจราคา
            </span>
          </>
        )}
      </td>
      <td className="py-3 px-4">
        <span className={cn(
          'text-[11px] px-2 py-0.5 rounded-full border',
          isOpen
            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
            : trade.status === 'closed'
            ? 'bg-gray-500/10 text-gray-400 border-gray-500/30'
            : 'bg-red-500/10 text-red-400 border-red-500/30'
        )}>
          {isOpen ? 'กำลังถือ' : trade.status === 'closed' ? 'ปิดแล้ว' : 'ยกเลิก'}
        </span>
        {closeReason && (
          <div className="mt-1">
            <span
              title={checkedTitle}
              className={cn(
                'inline-block text-[10px] px-1.5 py-0.5 rounded-full border',
                closeReason.className,
                checkedTitle && 'cursor-help'
              )}
            >
              {closeReason.label}
            </span>
          </div>
        )}
      </td>
      <td className="py-3 px-4 text-xs text-gray-500">
        {new Date(trade.opened_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
      </td>
      <td className="py-3 px-4 text-right">
        {isOpen && onClose && (
          <button
            onClick={() => onClose(trade)}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            ปิดออเดอร์
          </button>
        )}
      </td>
    </tr>
  );
}
