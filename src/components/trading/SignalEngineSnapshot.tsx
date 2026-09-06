'use client';

import { Info } from 'lucide-react';
import {
  readSignalReasons,
  readSignalSnapshot,
  snapshotIsEmpty,
} from '@/lib/signal-snapshot';
import { cn } from '@/lib/utils';

/**
 * SignalEngineSnapshot — "เครื่องยนต์เห็นอะไรตอนออกใบนี้"
 *
 * ═══ ทำไมกล่องนี้ถึงเป็นของสำคัญที่สุดในหน้ากราฟ ═══════════════════════════════
 * ทุกอย่างอื่นบนหน้านี้เป็นสิ่งที่ "เราคำนวณให้ดู" กล่องนี้กล่องเดียวที่เป็นสิ่งที่
 * **ระบบบันทึกไว้เองตอนตัดสินใจ** (คอลัมน์ signals.indicators กับ signals.reasons)
 * มันจึงเป็นทางเดียวที่เจ้าของจะตรวจสอบด้วยตาตัวเองได้ว่าทำไมระบบถึงบอกอย่างนั้น
 * ถ้ากล่องนี้แสดงค่าที่คำนวณใหม่แทนค่าที่บันทึกไว้ ความสามารถนั้นจะหายไปทั้งหมด
 * โดยที่หน้าจอยังดูปกติทุกประการ
 *
 * ═══ สิ่งที่ห้ามทำในกล่องนี้ ══════════════════════════════════════════════════
 * ห้ามคำนวณค่าใหม่ · ห้ามเติมค่าที่หายไปด้วยการเดา · ห้ามแปลหรือแต่งข้อความเหตุผล
 * ของเครื่องยนต์ · ห้ามรวมเป็นคะแนนอะไรทั้งสิ้น (เครื่องยนต์มีคะแนนของมันอยู่แล้ว
 * และคะแนนที่หน้าเว็บคิดเองจะเป็นตัวเลขที่ไม่มีใครตรวจสอบได้)
 */

interface Props {
  /** คอลัมน์ signals.indicators ของใบที่เลือก (อาจไม่มี/ไม่ครบ) */
  indicators: unknown;
  /** คอลัมน์ signals.reasons ของใบที่เลือก */
  reasons: unknown;
  /** true = หาแถวของสัญญาณใบนี้ในชุดที่โหลดมาไม่เจอ (เช่นเพิ่งหมดอายุระหว่างเปิดหน้าค้าง) */
  rowMissing?: boolean;
  /** กรอบเวลาที่เครื่องยนต์ใช้ตอนออกใบนี้ (ตามที่อยู่ใน DB) · '' = แถวเก่าที่ไม่มีค่า */
  signalTimeframe: string;
  /** กรอบเวลาของกราฟที่ผู้ใช้กำลังดูอยู่ */
  viewTimeframe: string;
  /** true = สองค่าข้างบนไม่ตรงกัน → ตัวเลขกับเส้นบนจอมาจากคนละชุดแท่ง */
  foreign: boolean;
}

/** ป้ายชนิดของเหตุผล — ใช้คำไทยสั้น ๆ ไม่แปลตัวข้อความเหตุผลเอง */
const REASON_KIND: Record<string, string> = {
  technical: 'เทคนิค',
  pattern: 'รูปแบบแท่ง',
  news: 'ข่าว',
  fundamental: 'พื้นฐาน',
};

export default function SignalEngineSnapshot({
  indicators,
  reasons,
  rowMissing = false,
  signalTimeframe,
  viewTimeframe,
  foreign,
}: Props) {
  const rows = readSignalSnapshot(indicators);
  const list = readSignalReasons(reasons);
  const empty = snapshotIsEmpty(rows);
  const tfLabel = signalTimeframe || 'ไม่ระบุ';
  /** คำอธิบายที่ต้องแสดงจริงบนจอ (ไม่ใช่ tooltip) — ตอนนี้มีตัวเดียวคือของ ATR */
  const footnotes = rows.filter((r) => r.footnote !== null);

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-surface-1 p-2.5 space-y-2">
      <div className="flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[rgb(var(--text-muted))]" />
        <p className="text-[11px] leading-relaxed text-[rgb(var(--text-muted))]">
          {/* กรอบเวลาต้องอยู่ใน "หัวข้อ" ไม่ใช่แค่บนป้ายด้านบนของการ์ด — กล่องนี้คือที่ที่
              คนเอาตัวเลขไปเทียบกับเส้นบนจอ ถ้าหัวข้อไม่บอกว่าตัวเลขเป็นของกรอบไหน
              การเทียบข้ามกรอบจะดูเหมือนการเทียบที่ถูกต้อง แล้วจบลงที่ "ไม่ตรงกัน" */}
          <span className="text-[rgb(var(--text-secondary))] font-medium">
            ค่าที่เครื่องยนต์เห็นตอนออกใบนี้ (กรอบ {tfLabel})
          </span>{' '}
          — ตัวเลขชุดนี้ถูกบันทึกไว้กับสัญญาณตั้งแต่วินาทีที่ระบบออกมัน ไม่ใช่ค่าปัจจุบัน
          {/*
            ⚠ ลำดับของเหตุผลสองข้อนี้สำคัญ และห้ามสลับ — วัดมาแล้วทั้งคู่:
              · คนละกรอบเวลา = คนละชุดแท่งทั้งชุด ต่างกันได้หลายสิบหน่วย (เหตุผลหลัก)
              · กรอบเดียวกันแต่คนละหน้าต่างข้อมูล ต่างกันระดับ 1e-5 (เหตุผลรอง)
            ของเดิมเขียนไว้แต่ข้อรอง คนอ่านจึงคิดว่าส่วนต่างต้องเล็กเสมอ พอเจอส่วนต่าง
            ระดับสิบหน่วยจากใบคนละกรอบ ก็อ่านได้อย่างเดียวว่า "ระบบไม่ตรงกัน"
          */}
          {foreign ? (
            <>
              {' '}
              · ใบนี้เครื่องยนต์คิดจากแท่งของกรอบ{' '}
              <span className="text-[rgb(var(--text-secondary))] font-medium">{tfLabel}</span>{' '}
              แต่เส้นบนกราฟตอนนี้เป็นของกรอบ{' '}
              <span className="text-[rgb(var(--text-secondary))] font-medium">{viewTimeframe}</span>{' '}
              คนละชุดแท่งกันทั้งชุด ตัวเลขจึงต่างกันได้มาก — ถ้าจะเทียบกับเส้นบนจอ
              ให้สลับกราฟไปที่กรอบ {tfLabel} ก่อน
            </>
          ) : (
            <>
              {' '}
              · ถึงจะเป็นกรอบเวลาเดียวกับกราฟที่ดูอยู่ ตัวเลขก็ยังต่างจากเส้นบนจอได้เล็กน้อย
              เพราะเส้นบนกราฟคำนวณจากชุดแท่งที่โหลดอยู่ตอนนี้ ซึ่งเริ่มคนละจุดกับตอนที่ใบนี้ออก
            </>
          )}
        </p>
      </div>

      {rowMissing ? (
        <p className="text-[11px] text-[rgb(var(--text-secondary))]">
          หาแถวของสัญญาณใบนี้ในชุดที่โหลดมาไม่พบ จึงยังไม่มีค่าที่บันทึกไว้มาแสดง
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {rows.map((r) => (
              <div key={r.key} className="rounded-md bg-surface-2 px-2 py-1.5" title={r.missingNote ?? undefined}>
                <div className="text-[10px] text-[rgb(var(--text-muted))] truncate">{r.label}</div>
                <div
                  className={cn(
                    'text-xs font-mono tabular-nums mt-0.5',
                    r.value === null
                      ? 'text-[rgb(var(--text-dim))]'
                      : 'text-[rgb(var(--text-primary))] font-semibold'
                  )}
                >
                  {r.text}
                </div>
              </div>
            ))}
          </div>

          {/* คำอธิบายของคีย์ที่ "ป้ายอย่างเดียวบอกความจริงไม่ครบ" — ต้องอยู่บนจอจริง
              ไม่ใช่ใน tooltip เพราะมือถือไม่มี hover และนี่คือกล่องที่ใช้ตรวจสอบ */}
          {footnotes.map((r) => (
            <p key={`fn-${r.key}`} className="text-[10px] leading-relaxed text-[rgb(var(--text-dim))]">
              {r.footnote}
            </p>
          ))}

          {/* แถวเก่าที่ไม่มีตัวเลขเลยสักคีย์ต้องบอกตรง ๆ ไม่ใช่โชว์ตารางขีดเปล่า ๆ
              แล้วปล่อยให้คนเดาว่าระบบพังหรือข้อมูลไม่มี */}
          {empty && (
            <p className="text-[11px] text-[rgb(var(--text-secondary))]">
              ใบนี้ไม่มีตัวเลขอินดิเคเตอร์บันทึกไว้เลย (แถวที่สร้างก่อนระบบเริ่มเก็บค่าเหล่านี้)
            </p>
          )}

          <div className="pt-0.5">
            <div className="text-[10px] uppercase font-medium text-[rgb(var(--text-muted))] mb-1">
              เหตุผลที่เครื่องยนต์บันทึกไว้
            </div>
            {list.length === 0 ? (
              <p className="text-[11px] text-[rgb(var(--text-secondary))]">
                ใบนี้ไม่มีเหตุผลบันทึกไว้
              </p>
            ) : (
              <ul className="space-y-1">
                {list.map((r, i) => (
                  <li key={`${r.label}-${i}`} className="text-[11px] leading-relaxed flex items-start gap-1.5">
                    <span className="mt-0.5 flex-shrink-0 text-[10px] px-1 py-px rounded bg-surface-3 text-[rgb(var(--text-muted))]">
                      {REASON_KIND[r.type] ?? r.type}
                    </span>
                    <span className="text-[rgb(var(--text-secondary))]">
                      <span className="text-[rgb(var(--text-primary))] font-medium">{r.label}</span>
                      {r.detail ? ` · ${r.detail}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {/* กฎโมเมนตัมของ MACD histogram ให้คะแนนโดยไม่บันทึกเหตุผลไว้เลย
                รายการข้างบนจึงไม่ใช่รายการคะแนนทั้งหมดที่ใบนั้นได้ — ต้องบอกไว้ */}
            <p className="mt-1.5 text-[10px] leading-relaxed text-[rgb(var(--text-dim))]">
              รายการนี้คือข้อความที่เครื่องยนต์เขียนไว้เอง (เก็บได้สูงสุด 5 ข้อต่อใบ)
              บางกฎให้คะแนนโดยไม่เขียนเหตุผลไว้ เช่นโมเมนตัมของฮิสโตแกรม MACD
              จึงอาจไม่ครบทุกกฎที่มีผลกับใบนี้
            </p>
          </div>
        </>
      )}
    </div>
  );
}
