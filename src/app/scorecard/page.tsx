'use client';

import { useMemo } from 'react';
import { useSignals, usePrices } from '@/hooks/useData';
import { cn } from '@/lib/utils';
import { summarize } from '@/lib/scorecard-stats';
import { scanHealth } from '@/lib/scan-health';
import { ClipboardList, AlertTriangle, Hourglass, Activity, WifiOff } from 'lucide-react';

/**
 * หน้าผลจริง — สัญญาณที่ระบบเคยยิงออกไป จบลงยังไงบ้าง
 *
 * ทำไมหน้านี้ต้องมี: ทุกตัวเลขที่เคยรายงานให้เจ้าของมาจากการวัดบน **อดีต**
 * หน้านี้คือที่เดียวที่ตอบด้วยสัญญาณที่ระบบยิงจริงในชีวิตจริง ซึ่งเป็นหลักฐานคนละชั้นกัน
 *
 * ── กติกาของหน้านี้ ────────────────────────────────────────────────────────
 * 1. ตัวเลขทุกตัวมาจากคอลัมน์ realized_r ที่ scripts/resolve-signals.mjs เขียนไว้
 *    ไม่มีการคำนวณกำไรใหม่ในหน้านี้ เพื่อให้เลขบนจอกับเลขในฐานข้อมูลเป็นตัวเดียวกันเสมอ
 * 2. **ห้ามสรุปอะไรตอน n ยังน้อย** — หน้านี้จะบอกตรง ๆ ว่ายังสรุปไม่ได้ แทนที่จะโชว์
 *    เปอร์เซ็นต์สวย ๆ จากไม้ไม่กี่ไม้ ซึ่งเป็นวิธีที่แดชบอร์ดเทรดทั่วไปใช้หลอกเจ้าของมัน
 * 3. ถ้อยคำที่บอกทิศทาง (ดี/แย่) ต้องคำนวณจากค่าจริงเสมอ ไม่ใช่เขียนตายตัว
 */

/** ต่ำกว่านี้ถือว่ายังไม่มีอะไรให้สรุป — ไม่ใช่ตัวเลขวิเศษ แต่ต่ำกว่านี้ช่วงความเชื่อมั่นกว้างจนไร้ความหมาย */
const MIN_N_FOR_ANY_READ = 30;

/** ตัวเลขที่วัดได้จากอดีตบนจักรวาลชุดเดียวกัน — มีไว้ให้เทียบ ไม่ใช่คำพยากรณ์ */
const RESEARCH_BASELINE = {
  rPerTrade: -0.053,
  ciLow: -0.0716,
  ciHigh: -0.0369,
  n: 4052,
  source: 'universe13-full · validation',
};

const fmtR = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(3)}R`;

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' | 'flat' }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-[rgb(var(--surface-2))] p-4 dark:border-white/[0.06]">
      <div className="text-xs text-[rgb(var(--text-secondary))]">{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'up' && 'text-up',
          tone === 'down' && 'text-red-700 dark:text-down',
          (tone === 'flat' || !tone) && 'text-[rgb(var(--text-primary))]'
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-[rgb(var(--text-secondary))]">{hint}</div>}
    </div>
  );
}

export default function ScorecardPage() {
  const { data: signals, loading } = useSignals();

  // คณิตศาสตร์ทั้งหมดอยู่ใน src/lib/scorecard-stats.ts ซึ่งมีชุดทดสอบของตัวเอง
  // (node scripts/test-scorecard-stats.mjs) — หน้านี้ทำหน้าที่แสดงผลอย่างเดียว
  const s = useMemo(() => summarize(signals ?? []), [signals]);
  const { n, open, unresolvable, wins, winRate, avgR: avg, ci, byOutcome, groups } = s;
  const enough = n >= MIN_N_FOR_ANY_READ;

  // ตัวสแกนยังเดินอยู่ไหม — ใช้เวลาที่ราคาถูกอัปเดตล่าสุดเป็นตัวชี้ เพราะตัวสแกน
  // เขียนราคาทุกรอบเสมอ แม้รอบนั้นไม่มีสัญญาณผ่านเกณฑ์เลยก็ตาม
  const { data: prices } = usePrices();
  const health = useMemo(() => {
    const latest = (prices ?? []).reduce<string | null>(
      (acc, p) => (p.updated_at && (!acc || p.updated_at > acc) ? p.updated_at : acc),
      null
    );
    return scanHealth(latest);
  }, [prices]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-[rgb(var(--text-primary))]">
          <ClipboardList className="h-6 w-6" />
          ผลจริงของสัญญาณ
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--text-secondary))]">
          สัญญาณที่ระบบยิงออกไปจริง แล้วราคาเดินต่อจนปิดบัญชี — ไม่ใช่ตัวเลขจากการทดสอบย้อนหลัง
        </p>
      </header>

      {/* ตัวสแกนยังเดินอยู่ไหม — ต้องอยู่บนสุดเพราะถ้ามันหยุด ตัวเลขทุกตัวข้างล่างก็หยุดตาม
          และหน้าตาของ "เงียบเพราะไม่มีสัญญาณ" กับ "เงียบเพราะระบบตาย" เหมือนกันทุกประการ
          (เกิดขึ้นจริงเมื่อ 2026-08-26: GitHub หยุดยิงตัวจับเวลาไป 24 ชม. โดยไม่มี error ที่ไหนเลย) */}
      {health.level !== 'unknown' && (
        <div
          className={cn(
            'flex gap-3 rounded-xl border p-3',
            health.level === 'stalled'
              ? 'border-red-500/30 bg-red-500/5'
              : health.level === 'slow'
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-black/[0.06] bg-[rgb(var(--surface-2))] dark:border-white/[0.06]'
          )}
        >
          {health.level === 'stalled' ? (
            <WifiOff className="h-5 w-5 shrink-0 text-red-700 dark:text-down" />
          ) : (
            <Activity
              className={cn(
                'h-5 w-5 shrink-0',
                health.level === 'slow' ? 'text-amber-700 dark:text-amber-400' : 'text-up'
              )}
            />
          )}
          <div className="text-sm">
            <p className="font-medium text-[rgb(var(--text-primary))]">{health.label}</p>
            <p className="mt-0.5 text-[rgb(var(--text-secondary))]">{health.detail}</p>
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-[rgb(var(--text-secondary))]">กำลังโหลด…</div>}

      {!loading && n === 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-[rgb(var(--surface-2))] p-6 text-center dark:border-white/[0.06]">
          <Hourglass className="mx-auto h-8 w-8 text-[rgb(var(--text-secondary))]" />
          <p className="mt-3 font-medium text-[rgb(var(--text-primary))]">ยังไม่มีสัญญาณไหนปิดบัญชี</p>
          <p className="mt-1 text-sm text-[rgb(var(--text-secondary))]">
            ตอนนี้มี {open} สัญญาณที่ยังเดินอยู่ · ตัวเก็บผลจะปิดบัญชีให้เองเมื่อราคาไปแตะ TP หรือ SL
            หรือเมื่อครบเวลาถือสูงสุด (1D 20 แท่ง · 1H 24 แท่ง)
          </p>
        </div>
      )}

      {!loading && n > 0 && (
        <>
          {!enough && (
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <div className="text-sm text-[rgb(var(--text-primary))]">
                <p className="font-medium">ยังสรุปอะไรไม่ได้จากจำนวนนี้</p>
                <p className="mt-1 text-[rgb(var(--text-secondary))]">
                  ปิดบัญชีไปแล้ว {n} ไม้ ซึ่งน้อยกว่า {MIN_N_FOR_ANY_READ} ไม้ที่เป็นขั้นต่ำแบบหลวม ๆ
                  ตัวเลขข้างล่างแสดงไว้ให้เห็นความคืบหน้าเท่านั้น ช่วงความเชื่อมั่นยังกว้างเกินกว่าจะบอกทิศทางได้
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="ปิดบัญชีแล้ว" value={`${n} ไม้`} hint={`ยังเดินอยู่ ${open} ไม้`} />
            <Stat label="อัตราชนะ" value={`${(winRate * 100).toFixed(1)}%`} hint={`ชนะ ${wins} · แพ้ ${n - wins}`} />
            <Stat
              label="R เฉลี่ยหลังหักต้นทุน"
              value={fmtR(avg)}
              tone={avg > 0 ? 'up' : avg < 0 ? 'down' : 'flat'}
              hint={enough ? undefined : 'ยังไม่พอสรุป'}
            />
            <Stat
              label="ช่วงความเชื่อมั่น 95%"
              value={ci ? `${fmtR(ci.lo)} … ${fmtR(ci.hi)}` : '—'}
              hint={ci ? (ci.lo > 0 ? 'อยู่เหนือศูนย์ทั้งช่วง' : ci.hi < 0 ? 'อยู่ใต้ศูนย์ทั้งช่วง' : 'คร่อมศูนย์') : 'ต้องมีอย่างน้อย 2 สัญลักษณ์'}
            />
          </div>

          <div className="rounded-xl border border-black/[0.06] bg-[rgb(var(--surface-2))] p-4 dark:border-white/[0.06]">
            <h2 className="text-sm font-medium text-[rgb(var(--text-primary))]">จบยังไงบ้าง</h2>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xl font-semibold tabular-nums text-up">{byOutcome.tp ?? 0}</div>
                <div className="text-xs text-[rgb(var(--text-secondary))]">แตะเป้า</div>
              </div>
              <div>
                <div className="text-xl font-semibold tabular-nums text-red-700 dark:text-down">{byOutcome.sl ?? 0}</div>
                <div className="text-xs text-[rgb(var(--text-secondary))]">โดนตัดขาดทุน</div>
              </div>
              <div>
                <div className="text-xl font-semibold tabular-nums text-[rgb(var(--text-primary))]">{byOutcome.timeout ?? 0}</div>
                <div className="text-xs text-[rgb(var(--text-secondary))]">หมดเวลา</div>
              </div>
            </div>
          </div>

          {groups.length > 1 && (
            <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-[rgb(var(--surface-2))] dark:border-white/[0.06]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] text-left text-xs text-[rgb(var(--text-secondary))] dark:border-white/[0.06]">
                    <th className="p-3 font-medium">กลุ่ม</th>
                    <th className="p-3 text-right font-medium">ไม้</th>
                    <th className="p-3 text-right font-medium">ชนะ</th>
                    <th className="p-3 text-right font-medium">R เฉลี่ย</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key} className="border-b border-black/[0.04] last:border-0 dark:border-white/[0.04]">
                      <td className="p-3 text-[rgb(var(--text-primary))]">{g.key}</td>
                      <td className="p-3 text-right tabular-nums text-[rgb(var(--text-secondary))]">{g.n}</td>
                      <td className="p-3 text-right tabular-nums text-[rgb(var(--text-secondary))]">
                        {((g.wins / g.n) * 100).toFixed(0)}%
                      </td>
                      <td
                        className={cn(
                          'p-3 text-right font-medium tabular-nums',
                          g.avgR > 0 ? 'text-up' : g.avgR < 0 ? 'text-red-700 dark:text-down' : 'text-[rgb(var(--text-primary))]'
                        )}
                      >
                        {fmtR(g.avgR)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="p-3 pt-0 text-xs text-[rgb(var(--text-secondary))]">
                แต่ละกลุ่มมีไม้น้อยกว่ายอดรวม ตัวเลขรายกลุ่มจึงไม่แน่นอนกว่าตัวเลขรวมเสมอ
              </p>
            </div>
          )}
        </>
      )}

      {/* เทียบกับสิ่งที่วัดได้จากอดีต — ให้เจ้าของเห็นเองว่าของจริงตรงกับที่วัดไว้ไหม */}
      <div className="rounded-xl border border-black/[0.06] bg-[rgb(var(--surface-1))] p-4 dark:border-white/[0.06]">
        <h2 className="text-sm font-medium text-[rgb(var(--text-primary))]">ตัวเลขที่วัดได้จากอดีต (ไว้เทียบ)</h2>
        <p className="mt-2 text-sm text-[rgb(var(--text-secondary))]">
          จักรวาลชุดเดียวกันนี้ วัดบนข้อมูลนอกตัวอย่าง {RESEARCH_BASELINE.n.toLocaleString()} ไม้ ได้{' '}
          <span className={RESEARCH_BASELINE.rPerTrade < 0 ? 'font-medium text-red-700 dark:text-down' : 'font-medium text-up'}>
            {fmtR(RESEARCH_BASELINE.rPerTrade)}
          </span>{' '}
          ต่อไม้ ช่วงความเชื่อมั่น 95% {fmtR(RESEARCH_BASELINE.ciLow)} … {fmtR(RESEARCH_BASELINE.ciHigh)}
          {RESEARCH_BASELINE.ciHigh < 0 ? ' ซึ่งอยู่ใต้ศูนย์ทั้งช่วง' : ''}
        </p>
        <p className="mt-2 text-xs text-[rgb(var(--text-secondary))]">
          ที่มา: {RESEARCH_BASELINE.source} · ผลในอดีตไม่ได้บอกว่าอนาคตจะเป็นอย่างไร
          และตัวเลขข้างบนนี้เองก็ยืนอยู่บนต้นทุนที่เป็นค่าประมาณ ไม่ใช่ใบเสร็จจริงของคุณ
        </p>
      </div>

      {unresolvable > 0 && (
        <p className="text-xs text-[rgb(var(--text-secondary))]">
          มี {unresolvable} สัญญาณที่ตัดสินผลไม่ได้ (ข้อมูลราคาไม่พอ หรือแถวนั้นเสียตั้งแต่ตอนสร้าง)
          — ไม่ถูกนับรวมในตัวเลขข้างบน
        </p>
      )}
    </div>
  );
}
