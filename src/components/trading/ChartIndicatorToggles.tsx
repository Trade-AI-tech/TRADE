'use client';

import { Info } from 'lucide-react';
import { CHART_INDICATOR_PERIODS, RSI_LEVELS } from '@/lib/chart-indicators';
import type { ChartIndicatorPrefs, LowerPaneKey } from '@/lib/chart-indicator-prefs';
import { cn } from '@/lib/utils';

/**
 * ChartIndicatorToggles — แถบเปิด/ปิดเส้นอินดิเคเตอร์ของหน้ากราฟ
 *
 * ═══ กติกาของแถบนี้ ═══════════════════════════════════════════════════════════
 * ทุกตัวที่มีปุ่มให้กด ต้องเป็นตัวที่ **เครื่องยนต์ใช้ตัดสินจริง** เท่านั้น
 * Stochastic / ADX / วอลุ่ม มีอยู่ใน src/lib/indicators.ts ก็จริง แต่ signal-engine.ts
 * ไม่เคยเรียกมันสักบรรทัด การใส่ปุ่มให้เปิดดูจะทำให้คนอ่านเข้าใจว่าระบบใช้มันคิดด้วย
 * ซึ่งเป็นการโกหกด้วยภาพ — จึงไม่มีปุ่มพวกนั้นที่นี่โดยตั้งใจ
 *
 * ตัวเลขคาบบนป้ายทุกอันอ่านจาก CHART_INDICATOR_PERIODS ไม่ใช่พิมพ์มือ
 * วันไหนคาบเปลี่ยน ป้ายจะเปลี่ยนตามเอง (และเทสต์จะแดงถ้ามันไม่ตรงกับเครื่องยนต์)
 *
 * ═══ ขนาดปุ่ม ═════════════════════════════════════════════════════════════════
 * ทุกปุ่มสูงอย่างน้อย 40px ตามที่รีโปนี้ใช้กับปุ่มที่นิ้วโป้งต้องกด (ปุ่มกรอบเวลาก็ 40px)
 * ปุ่มที่เล็กกว่านั้นบนจอ 375px คือปุ่มที่กดพลาดเป็นประจำ
 */

interface Props {
  prefs: ChartIndicatorPrefs;
  /** ส่งเฉพาะช่องที่เปลี่ยน — ผู้เรียกผสมกับค่าล่าสุดเอง (กันการกดรัวแล้วปุ่มแรกหาย) */
  onChange: (patch: Partial<ChartIndicatorPrefs>) => void;
  /** false = แท่งปิดยังไม่ถึง 200 แท่ง → ปุ่ม MA200 กดไม่ได้ พร้อมบอกเหตุผล */
  ma200Available: boolean;
  /** จำนวนแท่งปิดที่ใช้คำนวณจริง — ใช้อธิบายว่าทำไม MA200 ยังกดไม่ได้ */
  closedBars: number;
}

const P = CHART_INDICATOR_PERIODS;

/** ปุ่มบนแผงราคา — `dotClass` ต้องเป็นสีเดียวกับเส้นจริงใน GoldChart.tsx */
const PRICE_TOGGLES: ReadonlyArray<{
  key: 'ma20' | 'ma50' | 'ma200' | 'bb' | 'sr';
  label: string;
  dotClass: string;
  title: string;
}> = [
  {
    key: 'ma20',
    // เขียนว่า EMA เพราะของจริงคือ EMA — คีย์ในฐานข้อมูลชื่อ ma20 แต่ค่าที่เครื่องยนต์
    // ใส่ลงไปมาจาก EMA(closes, 20) การเขียนว่า SMA บนปุ่มคือการบอกผิด
    label: `EMA ${P.ma20}`,
    dotClass: 'bg-[rgb(var(--accent-glow))]',
    title: `เส้นค่าเฉลี่ยแบบ EMA ${P.ma20} แท่ง — ตัวเดียวกับที่เครื่องยนต์บันทึกไว้ในคีย์ ma20`,
  },
  {
    key: 'ma50',
    label: `SMA ${P.ma50}`,
    dotClass: 'bg-[rgb(var(--accent-gold))]',
    title: `เส้นค่าเฉลี่ยแบบ SMA ${P.ma50} แท่ง`,
  },
  {
    key: 'ma200',
    label: `SMA ${P.ma200}`,
    dotClass: 'bg-[rgb(var(--accent-purple))]',
    title: `เส้นค่าเฉลี่ยแบบ SMA ${P.ma200} แท่ง — ต้องมีแท่งปิดครบ ${P.ma200} แท่งถึงจะคำนวณได้`,
  },
  {
    key: 'bb',
    label: `Bollinger ${P.bbPeriod}/${P.bbStdDev}`,
    dotClass: 'bg-slate-500',
    title: `แบนด์ ${P.bbPeriod} แท่ง กว้าง ${P.bbStdDev} ส่วนเบี่ยงเบนมาตรฐาน · เส้นกลางเป็น SMA ${P.bbPeriod}`,
  },
  {
    key: 'sr',
    label: 'แนวรับ-แนวต้าน',
    dotClass: 'bg-slate-400',
    title: `ระดับ swing high/low ที่หาได้จากแท่งชุดที่โหลดอยู่ตอนนี้ (lookback ${P.srLookback})`,
  },
];

/** เส้นอ้างอิงของแผง RSI — อ่านจากค่าคงที่ตัวเดียวกับที่ GoldChart ใช้ขีดเส้นจริง */
const RSI_LINE_TEXT = `${RSI_LEVELS.oversold} / ${RSI_LEVELS.middle} / ${RSI_LEVELS.overbought} ซึ่งเป็นเกณฑ์ที่เครื่องยนต์ให้คะแนนจริง`;

const LOWER_PANES: ReadonlyArray<{ key: LowerPaneKey; label: string; title: string }> = [
  { key: 'none', label: 'ไม่แสดง', title: 'ปิดแผงล่าง เหลือแต่แผงราคา' },
  {
    key: 'rsi',
    label: `RSI ${P.rsi}`,
    title: `RSI ${P.rsi} พร้อมเส้นอ้างอิง ${RSI_LINE_TEXT}`,
  },
  {
    key: 'macd',
    label: `MACD ${P.macdFast}/${P.macdSlow}/${P.macdSignal}`,
    title: `เส้น MACD + Signal + ฮิสโตแกรม (${P.macdFast}, ${P.macdSlow}, ${P.macdSignal})`,
  },
];

export default function ChartIndicatorToggles({ prefs, onChange, ma200Available, closedBars }: Props) {
  const set = (patch: Partial<ChartIndicatorPrefs>) => onChange(patch);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-[rgb(var(--text-muted))] mr-0.5">บนแผงราคา</span>
        {PRICE_TOGGLES.map((t) => {
          const on = prefs[t.key];
          const blocked = t.key === 'ma200' && !ma200Available;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              disabled={blocked}
              onClick={() => set({ [t.key]: !on } as Partial<ChartIndicatorPrefs>)}
              title={
                blocked
                  ? `ตอนนี้มีแท่งปิด ${closedBars} แท่ง ยังไม่ถึง ${P.ma200} แท่ง จึงยังคำนวณเส้นนี้ไม่ได้ (เครื่องยนต์ก็ไม่คำนวณเหมือนกัน)`
                  : t.title
              }
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 min-h-[40px] rounded-lg border text-xs transition-colors',
                blocked
                  ? 'border-[var(--border-subtle)] text-[rgb(var(--text-dim))] opacity-60 cursor-not-allowed'
                  : on
                    ? 'border-accent-glow/40 bg-accent-glow/10 text-[rgb(var(--text-primary))]'
                    : 'border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:bg-surface-2'
              )}
            >
              <span
                className={cn(
                  'inline-block w-2 h-2 rounded-full flex-shrink-0',
                  on && !blocked ? t.dotClass : 'bg-surface-4'
                )}
              />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* บอกตรง ๆ ว่าเปิดได้ทีละหนึ่ง ไม่ใช่ให้ผู้ใช้กดแล้วงงว่าทำไมตัวเก่าหาย */}
        <span className="text-[11px] text-[rgb(var(--text-muted))] mr-0.5">แผงล่าง (ทีละหนึ่ง)</span>
        {LOWER_PANES.map((t) => {
          const on = prefs.lowerPane === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => set({ lowerPane: t.key })}
              title={t.title}
              className={cn(
                'px-2.5 min-h-[40px] rounded-lg border text-xs transition-colors',
                on
                  ? 'border-accent-glow/40 bg-accent-glow/10 text-cyan-800 dark:text-accent-glow font-medium'
                  : 'border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:bg-surface-2'
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-[rgb(var(--text-muted))] flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          เส้นทุกเส้นคำนวณจากราคาย้อนหลังของแท่งที่ปิดแล้ว ด้วยคาบชุดเดียวกับที่เครื่องยนต์ใช้คิด
          ไม่ใช่การคาดการณ์ราคาข้างหน้า · เส้นจึงจบที่แท่งปิดใบสุดท้าย ไม่ต่อไปถึงแท่งที่ยังก่อตัว
          {/* ระดับของเส้นประบนแผง RSI ต้องอยู่ตรงนี้ ไม่ใช่บนแกนของกราฟ — ป้ายบนแกน
              ทับป้ายขีดของไลบรารีจนอ่านไม่ออกทั้งคู่ (เหตุผลเต็มอยู่ใน GoldChart.tsx) */}
          {prefs.lowerPane === 'rsi'
            ? ` · เส้นประสามเส้นบนแผง RSI คือระดับ ${RSI_LINE_TEXT}`
            : ''}
          {prefs.sr
            ? ' · ระดับแนวรับ/แนวต้านคิดจากแท่งชุดที่โหลดอยู่ตอนนี้ จึงไม่ใช่ระดับชุดเดียวกับที่เครื่องยนต์เห็นตอนออกสัญญาณแต่ละใบ'
            : ''}
        </span>
      </p>
    </div>
  );
}
