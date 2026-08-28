'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { lookupEvidence } from '@/lib/signal-evidence';
import {
  TrendingUp, TrendingDown, Minus, Target, Shield, Clock, CheckCircle2,
} from 'lucide-react';
import type { Signal } from '@/types';

interface Props {
  signal: Signal;
}

/**
 * สีประจำคำสั่ง
 *
 * ใช้ตัวแปรธีมแทนสีตายตัว เพราะเฉดเดียวกันอ่านไม่ออกทั้งสองธีม
 * (emerald-400 บนพื้นขาวจางจนอ่านตัวเลขกำไรผิด ธีมสว่างจึงต้องใช้เฉดเข้มกว่า)
 * ความหมายของสีห้ามสลับ: เขียว = ซื้อ/กำไร, แดง = ขาย/ขาดทุน
 *
 * `dot` คือคลาสพื้นหลังสีเดียวกับ `color` เขียนแยกไว้เต็ม ๆ
 * แทนการทำ .replace('text-','bg-') ตอนรันไทม์แบบเดิม เพราะ Tailwind สแกนคลาส
 * จากตัวอักษรในซอร์สโค้ด คลาสที่เพิ่งประกอบขึ้นตอนรันไทม์อาจไม่ถูกสร้างจริง
 *
 * เหลือง (ถือ) ไม่มีโทเคนของธีม จึงระบุสองเฉดตรง ๆ แบบเดียวกับหน้า Dashboard:
 * amber-700 บนพื้นสว่าง (คอนทราสต์ ~5:1) และสลับเป็น amber-400 เมื่ออยู่ใต้ .dark
 */
const actionConfig = {
  BUY: { color: 'text-up', dot: 'bg-up', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: TrendingUp, label: 'ซื้อ' },
  SELL: { color: 'text-down', dot: 'bg-down', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: TrendingDown, label: 'ขาย' },
  HOLD: { color: 'text-amber-700 [.dark_&]:text-amber-400', dot: 'bg-amber-700 [.dark_&]:bg-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: Minus, label: 'ถือ' },
  CLOSE: { color: 'text-gray-400', dot: 'bg-[rgb(var(--text-secondary))]', bg: 'bg-gray-500/10', border: 'border-gray-500/30', icon: Minus, label: 'ปิด' },
};

const strengthStars = {
  weak: 1,
  moderate: 2,
  strong: 3,
  very_strong: 4,
};

const marketLabel = {
  GOLD: 'ทอง', FOREX: 'Forex', TH_STOCK: 'หุ้นไทย', US_STOCK: 'หุ้น US', CRYPTO: 'Crypto',
};

/** สัญญาณ 1H เสื่อมเร็ว — เกินกี่ชั่วโมงถึงถือว่า "เริ่มเก่าแล้ว" */
const INTRADAY_STALE_HOURS = 12;

/** อายุสัญญาณแบบอ่านง่าย เช่น "3 ชม.ที่แล้ว" — parse วันที่ไม่ได้ให้คืน null ห้ามเดา */
function timeAgoTh(iso: string, now: number): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const min = Math.floor((now - t) / 60_000);
  if (min < 1) return 'เมื่อครู่นี้';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

/** นับถอยหลังหมดอายุจาก expires_at — ไม่มีข้อมูลหรือ parse ไม่ได้ให้คืน null */
function expiresInTh(iso: string | null, now: number): { text: string; expired: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const min = Math.ceil((t - now) / 60_000);
  if (min <= 0) return { text: 'หมดอายุแล้ว', expired: true };
  if (min < 60) return { text: `หมดอายุในอีก ${min} นาที`, expired: false };
  const h = Math.floor(min / 60);
  if (h < 24) return { text: `หมดอายุในอีก ${h} ชม.`, expired: false };
  return { text: `หมดอายุในอีก ${Math.floor(h / 24)} วัน`, expired: false };
}

export default function SignalCard({ signal }: Props) {
  const cfg = actionConfig[signal.action];
  const Icon = cfg.icon;
  const stars = strengthStars[signal.strength];
  const [openReason, setOpenReason] = useState<number | null>(null);

  // เวลา "ตอนนี้" ตั้งหลัง mount เท่านั้น — กัน hydration mismatch เพราะนาฬิกา
  // ตอน SSR กับตอน hydrate บนเครื่องผู้ใช้ไม่มีทางตรงกัน
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const entry = signal.entry_price;
  const sl = signal.stop_loss;
  const tp = signal.take_profit;
  const cur = signal.current_price;
  const tradeable = signal.action === 'BUY' || signal.action === 'SELL';

  // R:R จากราคาจริงของสัญญาณ — ระยะ SL เป็น 0 ต้องได้ '—' ไม่ใช่ Infinity
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const rrText = risk > 0 && Number.isFinite(reward / risk) ? `1:${(reward / risk).toFixed(1)}` : '—';

  // current_price ถูกตัวเฝ้าราคาอัปเดตทีหลัง — ต่างจาก entry เมื่อไหร่ค่อยมีเรื่องให้บอก
  const priceMoved = Number.isFinite(cur) && cur > 0 && cur !== entry;

  // บันไดราคา: แปลงราคาเป็นตำแหน่ง % แนวตั้งตามสัดส่วนจริง (ราคาสูงอยู่บนเสมอ
  // BUY จึงได้ TP บน SL ล่าง และ SELL กลับด้านโดยไม่ต้องเขียนเงื่อนไขแยก)
  const ladder = (() => {
    if (!tradeable) return null;
    if (![entry, sl, tp].every((v) => Number.isFinite(v) && v > 0)) return null;
    const points = priceMoved ? [entry, sl, tp, cur] : [entry, sl, tp];
    const lo = Math.min(...points);
    const hi = Math.max(...points);
    if (hi - lo <= 0) return null; // ราคาซ้อนกันหมด ไม่มีสัดส่วนให้วาด
    const pad = (hi - lo) * 0.08; // กันขอบไม่ให้ label บน/ล่างโดนตัด
    const top = hi + pad;
    const range = hi - lo + pad * 2;
    return { pct: (p: number) => ((top - p) / range) * 100 };
  })();

  // ระยะห่างของราคาล่าสุดจาก entry เป็น % (เครื่องหมายตามทิศราคา ไม่ใช่ทิศกำไร)
  const distPct = priceMoved && entry !== 0 ? ((cur - entry) / Math.abs(entry)) * 100 : null;
  const inProfit = distPct !== null && (signal.action === 'BUY' ? distPct > 0 : distPct < 0);
  const distColor = !tradeable
    ? 'text-gray-400'
    : inProfit
    ? 'text-up'
    : 'text-down';

  const createdAgo = now !== null ? timeAgoTh(signal.created_at, now) : null;
  const expiry = now !== null ? expiresInTh(signal.expires_at, now) : null;

  // หลักฐานย้อนหลังของเซ็ตอัพแบบเดียวกัน (สร้างจากประวัติจริงโดย
  // scripts/research/build-signal-evidence.mjs) — เป็น "ความถี่ในอดีต" เท่านั้น
  // ไม่ใช่การพยากรณ์ผลของไม้นี้ · ไม่มีข้อมูลถึงเกณฑ์ = ไม่แสดงบล็อกเลย ห้ามเดา
  const evidence = tradeable
    ? lookupEvidence(signal.symbol, signal.timeframe, signal.action, signal.strength)
    : null;
  // sourceTimeframe ต่างจากของสัญญาณ (เช่น 15m ที่ไม่มีประวัติ ต้องยืมข้อมูล 1H)
  // ต้องบอกในวงเล็บตรง ๆ — ตัวเลขจากกรอบเวลาอื่นห้ามแปะเนียนเป็นของกรอบนี้
  const evidenceTfNote = evidence
    ? evidence.sourceTimeframe === (signal.timeframe ?? '').toUpperCase()
      ? evidence.sourceTimeframe
      : `ประมาณจากกรอบ ${evidence.sourceTimeframe}`
    : null;

  // สัญญาณระยะสั้นเสื่อมเร็ว — 1H ที่อายุเกินกำหนดให้จางลง + ติดป้ายชัด ๆ
  const ageMs = now !== null ? now - new Date(signal.created_at).getTime() : NaN;
  const isStale =
    (signal.timeframe ?? '').toUpperCase() === '1H' &&
    Number.isFinite(ageMs) &&
    ageMs > INTRADAY_STALE_HOURS * 3_600_000;

  const conf = Math.max(0, Math.min(100, signal.confidence));

  return (
    <div
      className={cn(
        'card border h-full flex flex-col relative overflow-hidden',
        cfg.border,
        isStale && 'opacity-60 saturate-50'
      )}
    >
      {signal.telegram_sent && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-up bg-emerald-500/10 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          <span>แจ้ง Telegram</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-4">
        {/* min-w-0 ทั้งสองชั้น — ให้ชื่อสินทรัพย์ยาว ๆ truncate ได้จริงบนการ์ดแคบ ~340px
            (ไม่มี min-w-0 flex จะไม่ยอมหดต่ำกว่าความกว้างข้อความ แล้วดันการ์ดพัง) */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', cfg.bg, cfg.color)}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-white text-base">{signal.symbol}</h3>
              {/* ป้าย timeframe ต้องเด่น — คนเทรดสั้นต้องแยก 1H/1D ได้ก่อนอ่านราคา */}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-glow/10 text-accent-glow border border-accent-glow/30">
                {signal.timeframe}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-2 rounded text-gray-400">
                {marketLabel[signal.market]}
              </span>
              {isStale && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 [.dark_&]:text-amber-400 border border-amber-500/30">
                  เริ่มเก่าแล้ว
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{signal.name}</p>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className={cn('text-xl font-bold font-mono', cfg.color)}>{cfg.label}</div>
          <div className="flex items-center gap-0.5 justify-end mt-1">
            {Array.from({ length: 4 }).map((_, i) => (
              // จุดที่ยังไม่ติด ใช้เฉดเทากลาง ๆ ที่เห็นได้ทั้งพื้นขาวและพื้นดำ
              // (ของเดิม bg-white/10 หายไปเลยบนพื้นสว่าง คนอ่านจะนับความแรงสัญญาณผิด)
              <div key={i} className={cn('w-1.5 h-1.5 rounded-full', i < stars ? cfg.dot : 'bg-surface-3')} />
            ))}
          </div>
        </div>
      </div>

      {ladder ? (
        <div className="relative h-36 mb-4">
          {/* รางบันไดราคา */}
          <div className="absolute left-2 top-0 bottom-0 w-1.5 rounded-full bg-surface-2" />
          {/* โซนกำไร entry→TP
              ใช้โทเคน bg-up (= rgb(var(--up) / <alpha-value>)) แทน bg-[var(--up)]
              ที่พังเงียบ ๆ เพราะ --up เก็บเป็นช่อง RGB "4 120 87" ไม่ใช่สีเต็ม
              เบราว์เซอร์จึงทิ้งทั้งบรรทัดแล้วโซนกลายเป็นโปร่งใสทั้งแถบ

              คงการหรี่ด้วย opacity-40 (ไม่ย้ายไป bg-up/40) เพราะสองแบบให้ผลเท่ากัน
              บนกล่องเปล่าที่ไม่มีลูก และของเดิมฝั่งธีมมืดจางเท่านี้อยู่แล้ว
              ผลลัพธ์: พื้นมืดจางเท่าเดิมเป๊ะ ส่วนพื้นสว่างได้เขียวเข้มพอจนเห็นโซนชัด */}
          <div
            className="absolute left-2 w-1.5 rounded-full bg-up opacity-40"
            style={{
              top: `${Math.min(ladder.pct(tp), ladder.pct(entry))}%`,
              height: `${Math.abs(ladder.pct(tp) - ladder.pct(entry))}%`,
            }}
          />
          {/* โซนเสี่ยง entry→SL */}
          <div
            className="absolute left-2 w-1.5 rounded-full bg-down opacity-40"
            style={{
              top: `${Math.min(ladder.pct(sl), ladder.pct(entry))}%`,
              height: `${Math.abs(ladder.pct(sl) - ladder.pct(entry))}%`,
            }}
          />

          {/* TP */}
          <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center gap-1.5" style={{ top: `${ladder.pct(tp)}%` }}>
            {/* เส้นชี้ใช้สีทึบเต็ม (เดิม /60) เพราะเส้นหนา 1px สีจาง ๆ หายไปเลยบนพื้นขาว
                ต้องแยกออกให้ได้ว่าเส้นไหนคือ TP (เขียว) เส้นไหนคือ SL (แดง) */}
            <div className="w-5 h-px bg-up flex-shrink-0" />
            <Target className="w-3 h-3 text-up flex-shrink-0" />
            <span className="text-[10px] uppercase font-medium text-up">TP</span>
            {/* tabular-nums + nowrap: ราคายาว (เช่น BTC 64986.47) ต้องเป็นก้อนเดียว ไม่หักบรรทัดกลางตัวเลข */}
            <span className="text-xs font-mono tabular-nums font-semibold text-up whitespace-nowrap">{tp}</span>
          </div>

          {/* Entry */}
          <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center gap-1.5" style={{ top: `${ladder.pct(entry)}%` }}>
            <div className="w-5 h-px bg-[rgb(var(--text-secondary))] flex-shrink-0" />
            <span className="text-[10px] uppercase font-medium text-gray-400">Entry</span>
            <span className="text-xs font-mono tabular-nums font-semibold text-white whitespace-nowrap">{entry}</span>
          </div>

          {/* SL */}
          <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center gap-1.5" style={{ top: `${ladder.pct(sl)}%` }}>
            <div className="w-5 h-px bg-down flex-shrink-0" />
            <Shield className="w-3 h-3 text-down flex-shrink-0" />
            <span className="text-[10px] uppercase font-medium text-down">SL</span>
            <span className="text-xs font-mono tabular-nums font-semibold text-down whitespace-nowrap">{sl}</span>
          </div>

          {/* ราคาล่าสุดจากตัวเฝ้าราคา — จุดบนราง + label ชิดขวา จะได้ไม่ทับ label ฝั่งซ้าย */}
          {priceMoved && (
            <>
              {/* จุดราคาล่าสุด: ตัวจุดใช้สีตัวหนังสือหลัก (ขาวบนธีมมืด / เกือบดำบนธีมสว่าง)
                  ส่วนวงแหวนใช้สีพื้นการ์ด เพื่อเจาะขอบให้จุดเด้งออกจากแถบสีใต้จุด */}
              <div
                className="absolute w-2.5 h-2.5 rounded-full bg-[rgb(var(--text-primary))] ring-2 ring-surface-1 -translate-y-1/2"
                style={{ top: `${ladder.pct(cur)}%`, left: '5px' }}
              />
              {/* จำกัดแถว "ล่าสุด" ไว้ฝั่งขวาไม่เกิน 70% — บนการ์ดแคบ ถ้าปล่อย left-0 ถึงขวาสุด
                  ข้อความจะลากไปทับ label TP/Entry/SL ฝั่งซ้ายเมื่อราคาอยู่ระดับใกล้กัน
                  (การ์ดกว้างปกติเนื้อหาสั้นกว่า 70% อยู่แล้ว จึงมองไม่เห็นความต่างบนเดสก์ท็อป) */}
              <div
                className="absolute right-0 max-w-[70%] -translate-y-1/2 flex items-center justify-end gap-1.5 overflow-hidden"
                style={{ top: `${ladder.pct(cur)}%` }}
              >
                <span className="text-[10px] text-gray-400 whitespace-nowrap">ล่าสุด</span>
                <span className="text-xs font-mono tabular-nums font-semibold text-white whitespace-nowrap">{cur}</span>
                {distPct !== null && (
                  <span className={cn('text-[10px] font-mono tabular-nums whitespace-nowrap', distColor)}>
                    ({distPct > 0 ? '+' : ''}{distPct.toFixed(2)}% จาก entry)
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* วาดบันไดไม่ได้ (HOLD/CLOSE หรือราคาซ้อนกัน) — โชว์ตัวเลขแบบตารางเดิม */
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-surface-2 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-400 uppercase font-medium">Entry</div>
            <div className="text-sm font-mono font-semibold text-white mt-0.5">{signal.entry_price}</div>
          </div>
          {/* พื้นกล่องขยับจาก /5 เป็น /10: บนพื้นขาวสีจาง 5% แทบกลืนไปกับการ์ด
              จนแยกไม่ออกว่ากล่องไหนคือ SL กล่องไหนคือ TP (บนพื้นมืดต่างกันแทบไม่รู้สึก) */}
          {/* กล่อง SL เป็นจุดเดียวที่ text-down ตกเกณฑ์ AA: วัดจริงบนพื้น bg-red-500/10
              (ทับพื้นการ์ดขาวแล้วได้ rgb(253,236,236)) ได้แค่ 4.23:1 — พื้นแดงจาง ๆ
              ดันพื้นให้เข้มขึ้นจนระยะห่างกับ #dc2626 ไม่พอ
              จึงลงเฉดอีกขั้นเป็น red-700 เฉพาะธีมสว่าง → 5.67:1 ผ่านสบาย
              ธีมมืดสลับกลับไปใช้โทเคน --down (#f87171) เหมือนเดิมเป๊ะ

              ทำไมไม่ลดพื้นเป็น /5 แทน: จะได้แค่ 4.53:1 (เฉียดเส้นเกินไป)
              และกล่อง SL/TP จะกลืนกับการ์ดขาวจนแยกไม่ออกอีก ตามที่หมายเหตุข้างบนอธิบายไว้
              ทำไมกล่อง TP ไม่ต้องแก้: #047857 บนพื้น emerald จาง ได้ 5.06:1 ผ่านอยู่แล้ว
              และสองกล่องนี้ไม่เคยแสดงพร้อมบันไดราคา จึงไม่มีแดงสองเฉดโผล่พร้อมกัน */}
          <div className="bg-red-500/10 rounded-lg p-2.5">
            <div className="text-[10px] text-red-700 [.dark_&]:text-down uppercase font-medium flex items-center gap-1">
              <Shield className="w-2.5 h-2.5" /> SL
            </div>
            <div className="text-sm font-mono font-semibold text-red-700 [.dark_&]:text-down mt-0.5">{signal.stop_loss}</div>
          </div>
          <div className="bg-emerald-500/10 rounded-lg p-2.5">
            <div className="text-[10px] text-up uppercase font-medium flex items-center gap-1">
              <Target className="w-2.5 h-2.5" /> TP
            </div>
            <div className="text-sm font-mono font-semibold text-up mt-0.5">{signal.take_profit}</div>
          </div>
        </div>
      )}

      {/* หลักฐานย้อนหลัง — สามตัวเลขในบรรทัดเดียวใต้ราคา
          พูดในรูป "ในอดีต...%" เท่านั้น (ความถี่ที่วัดได้จริง ไม่ใช่คำสัญญาเรื่องอนาคต —
          งานวิจัยของ repo วัดแล้วว่าไม่มีเซ็ตอัพไหนพิสูจน์ edge หลังต้นทุนได้) */}
      {evidence && (
        <div
          className="mb-3 bg-surface-2 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed"
          title={`ความถี่ที่วัดจากประวัติช่วง ${evidence.spanYears} ของเซ็ตอัพ SL/TP แบบเดียวกัน — ไม่ใช่การพยากรณ์ผลของสัญญาณนี้`}
        >
          <span className="text-gray-400">ในอดีตเซ็ตอัพนี้: </span>
          <span className="whitespace-nowrap text-up font-medium">
            ถึง TP ก่อน {Math.round(evidence.tpFirstPct * 100)}%
          </span>
          <span className="text-gray-500"> · </span>
          <span className="whitespace-nowrap text-red-700 [.dark_&]:text-down font-medium">
            โดน SL ก่อน {Math.round(evidence.slFirstPct * 100)}%
          </span>
          <span className="text-gray-500"> · </span>
          <span className="whitespace-nowrap text-gray-400">
            หมดเวลา {Math.round(evidence.timeoutPct * 100)}%{' '}
            (N={evidence.n}, {evidenceTfNote}
            {evidence.level !== 'symbol' ? ', รวมทุกสินทรัพย์' : ''})
          </span>
        </div>
      )}

      {/* ปุ่ม "เพิ่มเข้าพอร์ต" ถูกถอดออก — ผู้ใช้เทรดผ่านพอร์ตโบรกเกอร์ภายนอก การ์ดนี้จึงเป็นสัญญาณล้วน
          mt-auto ที่เคยอยู่บนปุ่มย้ายมาที่แถวข้อมูลแทน: ดันบล็อก R:R/เวลา/เหตุผล ลงชิดก้นการ์ด
          การ์ดในกริดที่ถูกยืดสูงเท่ากัน (h-full) จะได้ไม่เหลือโพรงว่างค้างท้ายการ์ด */}
      <div className="flex items-center justify-between gap-4 mt-auto pt-1 mb-3">
        <div
          className="flex items-baseline gap-1.5 flex-shrink-0"
          title="กำไรเป้าหมายเทียบความเสี่ยง คิดจากราคา TP/SL ของสัญญาณนี้"
        >
          <span className="text-[10px] text-gray-400 uppercase font-medium">R:R</span>
          <span className={cn('text-lg font-mono font-bold', rrText === '—' ? 'text-gray-500' : 'text-white')}>
            {rrText}
          </span>
        </div>

        {/* ต้นทุนไป-กลับของไม้นี้ คิดเป็นสัดส่วนของเงินที่เสี่ยง
            เขียนโดยตัวสแกนตอนสร้างสัญญาณ (คอลัมน์ cost_r) ไม่ได้คำนวณใหม่ที่นี่
            แถวเก่าก่อน migration 007 ไม่มีค่านี้ จึงไม่แสดงอะไรเลยแทนที่จะเดา

            ทำไมต้องโชว์: ต้นทุนคือตัวที่ใหญ่ที่สุดในสมการของ TF เล็ก และมองไม่เห็น
            จากราคา entry/SL/TP เลย เจ้าของควรเห็นก่อนตัดสินใจว่าไม้นี้เสียค่าผ่านทางเท่าไร */}
        {typeof signal.cost_r === 'number' && Number.isFinite(signal.cost_r) && (
          <div
            className="flex items-baseline gap-1.5 flex-shrink-0"
            title="ค่าธรรมเนียมไป-กลับโดยประมาณ คิดเป็นสัดส่วนของเงินที่เสี่ยงในไม้นี้ — ตัวเลขนี้ถูกหักออกจากผลลัพธ์เสมอ"
          >
            <span className="text-[10px] text-gray-400 uppercase font-medium">ต้นทุน</span>
            <span
              className={cn(
                'text-sm font-mono font-semibold',
                signal.cost_r >= 0.15 ? 'text-red-700 [.dark_&]:text-down' : 'text-gray-600 [.dark_&]:text-gray-300'
              )}
            >
              {signal.cost_r.toFixed(3)}R
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] text-gray-400 uppercase font-medium">Conf</span>
          {/* รางของแถบต้องมีสีจริง ไม่ใช่ขาวโปร่ง ไม่งั้นบนพื้นขาวจะเห็นแค่ส่วนที่เติม
              จนอ่านไม่ออกว่าเต็มกี่เปอร์เซ็นต์ */}
          <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div
              className={cn('h-full rounded-full', cfg.dot)}
              style={{ width: `${conf}%` }}
            />
          </div>
          <span className={cn('text-xs font-mono font-medium', cfg.color)}>{signal.confidence}%</span>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] text-gray-400 mb-3">
        <Clock className="w-3 h-3 flex-shrink-0" />
        {/* ก่อน mount ยังไม่รู้เวลา "ตอนนี้" — โชว์ — ไปก่อน ดีกว่าเดาเลขผิด */}
        <span>{createdAgo ?? '—'}</span>
        {expiry && (
          <>
            <span className="text-gray-500">·</span>
            <span className={cn(expiry.expired && 'text-amber-700 [.dark_&]:text-amber-400')}>{expiry.text}</span>
          </>
        )}
        {!ladder && distPct !== null && (
          <>
            <span className="text-gray-500">·</span>
            <span className={cn('font-mono', distColor)}>
              {distPct > 0 ? '+' : ''}{distPct.toFixed(2)}% จาก entry
            </span>
          </>
        )}
      </div>

      {signal.reasons.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {signal.reasons.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setOpenReason(openReason === i ? null : i)}
                className={cn(
                  'px-2 py-1 rounded-lg text-[11px] border transition-colors',
                  openReason === i
                    ? 'border-[var(--border-subtle)] bg-surface-3 text-white'
                    : 'border-[var(--border-subtle)] bg-surface-2 text-gray-400 hover:text-white hover:bg-surface-3'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {openReason !== null && signal.reasons[openReason] && (
            <div className="mt-2 bg-surface-2 rounded-lg p-2.5 text-xs leading-relaxed">
              <span className="text-white font-medium">{signal.reasons[openReason].label}</span>
              <span className="text-gray-400"> — {signal.reasons[openReason].detail}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
