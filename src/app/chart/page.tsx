'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickChart,
  Info,
  Maximize2,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import GoldChart from '@/components/trading/GoldChart';
import { useSignals } from '@/hooks/useData';
import { buildSignalMarkers } from '@/lib/chart-markers';
import type { ChartSignalMarker } from '@/lib/chart-markers';
import {
  CHART_TIMEFRAMES,
  DEFAULT_TIMEFRAME_KEY,
  resolveTimeframe,
} from '@/lib/chart-timeframes';
import type { ChartBar, ChartTimeframe } from '@/lib/chart-timeframes';
import { lookupEvidence } from '@/lib/signal-evidence';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { MarketPrice } from '@/types';

/**
 * /chart — หน้ากราฟทอง
 *
 * ═══ หมุดบนกราฟหมายความว่าอะไร ═══════════════════════════════════════════════
 * หมุดหนึ่งอัน = "ระบบเคยออกสัญญาณตรงจุดนี้" เท่านั้น ไม่ใช่คำแนะนำให้เข้าไม้
 * และหน้านี้ไม่วาดเส้นทำนายอนาคตหรือลูกศรชี้ทิศราคาใด ๆ — เส้นประที่ขึ้นเมื่อเลือกหมุด
 * คือราคาสามค่าที่สัญญาณใบนั้นระบุไว้จริงในฐานข้อมูล (จุดเข้า / SL / TP) ไม่ใช่การคาดการณ์
 *
 * ═══ ความสดของราคา ══════════════════════════════════════════════════════════════
 * ราคามาจาก /api/chart → fetchChart → Yahoo ซึ่งมีชั้นแคชฝั่ง server อยู่
 * (CHART_CACHE_SEC วินาที) หน้านี้จึงบอกผู้ใช้ตรง ๆ ว่า "ดึงล่าสุดเมื่อไร" และ
 * "อัปเดตเองทุกกี่นาที" แทนที่จะอ้างว่าเป็นข้อมูลวินาทีต่อวินาที
 */

interface ChartResponse {
  success: true;
  demo?: boolean;
  symbol: string;
  market: string;
  name: string;
  timeframe: string;
  interval: string;
  range: string;
  pollMs: number;
  cacheSec: number;
  bars: ChartBar[];
  forming: ChartBar | null;
  quote: MarketPrice | null;
  servedAt: string;
}

const STRENGTH_TH: Record<string, { label: string; stars: number }> = {
  weak: { label: 'อ่อน', stars: 1 },
  moderate: { label: 'ปานกลาง', stars: 2 },
  strong: { label: 'แรง', stars: 3 },
  very_strong: { label: 'แรงมาก', stars: 4 },
};

/** เวลาโซนไทยแบบตายตัว UTC+7 (ไทยไม่มี DST) — server กับ browser จึงพิมพ์ตรงกันเสมอ */
const TH_OFFSET_MS = 7 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

function thClock(ms: number, withSeconds = false): string {
  const d = new Date(ms + TH_OFFSET_MS);
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withSeconds ? `${hm}:${pad(d.getUTCSeconds())}` : hm;
}

function thDateTime(ms: number): string {
  const d = new Date(ms + TH_OFFSET_MS);
  return `${d.getUTCDate()}/${pad(d.getUTCMonth() + 1)} ${thClock(ms)}`;
}

/** "ทุก 1 นาที" / "ทุก 5 นาที" — พูดเป็นนาทีเพราะทุกเลนตั้งไว้เป็นนาทีเต็มอยู่แล้ว */
function pollLabel(tf: ChartTimeframe): string {
  return `${Math.round(tf.pollMs / 60_000)} นาที`;
}

export default function ChartPage() {
  const [tfKey, setTfKey] = useState<ChartTimeframe['key']>(DEFAULT_TIMEFRAME_KEY);
  const [payload, setPayload] = useState<ChartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** มีคำขอค้างอยู่ไหม — ใช้หมุนไอคอนปุ่มดึงใหม่ และตัดสินว่าจะโชว์ตัวโหลด */
  const [busy, setBusy] = useState(true);
  /** ปุ่ม "ดึงใหม่" แค่ขยับค่านี้ แล้วให้ effect เดิมทำงานซ้ำ — ไม่มีเส้นทางดึงข้อมูลที่สอง */
  const [reloadKey, setReloadKey] = useState(0);
  /**
   * ปุ่ม "คืนมุมมอง" ขยับค่านี้ แล้วตัววาดกราฟจัดกรอบกลับเป็นค่าเริ่มต้น
   *
   * ต้องเป็นปุ่มที่เห็นด้วยตา ไม่ใช่ท่าทางลับ: แถบแกนเวลาสูง 28px อยู่ติดขอบล่างของกราฟ
   * พอดี ลากโดนโดยไม่ตั้งใจแล้วแท่งถูกบีบจนอ่านไม่ออก (วัดจริง ลากแนวนอน 120px
   * บนแถบนั้น ระยะห่างแท่งเหลือ 0.97px) — คนที่ติดอยู่ต้องมีทางกลับที่มองเห็นได้
   * หมายเหตุ: มันคืนแค่ "กรอบที่มอง" ไม่ได้ดึงข้อมูลใหม่ นั่นเป็นหน้าที่ของปุ่มดึงใหม่
   */
  const [viewResetKey, setViewResetKey] = useState(0);

  const { data: signals } = useSignals();

  const tf = useMemo(() => resolveTimeframe(tfKey) ?? CHART_TIMEFRAMES[0], [tfKey]);

  /**
   * ข้อมูลที่ "เป็นของกรอบเวลาที่ปุ่มกำลังชี้อยู่" เท่านั้นถึงจะเอาไปวาดได้
   *
   * ระหว่างที่ผู้ใช้เพิ่งกดสลับกรอบ payload ในมือยังเป็นของกรอบเก่า — ถ้าวาดต่อไป
   * ผู้ใช้จะเห็นปุ่ม 1H ติดไฟแต่กราฟยังเป็น 15m อยู่ครู่หนึ่ง ซึ่งคือหน้าจอที่โกหก
   * (ไม่ใช่แค่ช้า) เงื่อนไขนี้จึงเป็นตัวเดียวที่ตัดสินว่าจะโชว์กราฟหรือโชว์ตัวโหลด
   */
  const shown = payload && payload.timeframe === tfKey ? payload : null;

  /** เวลาที่ดึงสำเร็จครั้งล่าสุด — เก็บใน ref ด้วย เพราะตัวจับเวลาอ่านค่าล่าสุดตอน tick */
  const lastLoadRef = useRef(0);

  // ── ดึงข้อมูล + poll เป็นช่วง (หยุดสนิทเมื่อแท็บถูกซ่อน) ─────────────────────
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      if (cancelled) return;
      setBusy(true);
      try {
        // cache: 'no-store' กันชั้นแคชของเบราว์เซอร์ ไม่งั้น "ดึงล่าสุด" บนจอจะโกหก
        const res = await fetch(`/api/chart?timeframe=${encodeURIComponent(tfKey)}`, {
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `ดึงข้อมูลกราฟไม่สำเร็จ (HTTP ${res.status})`);
        }
        setPayload(json as ChartResponse);
        setError(null);
        lastLoadRef.current = Date.now();
        setFetchedAt(lastLoadRef.current);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => void load(), tf.pollMs);
    };

    // แท็บถูกซ่อน = ล้างตัวจับเวลาทิ้งจริง ๆ ไม่ใช่แค่ข้ามรอบ — ผู้ใช้ที่สลับไปแอปอื่น
    // ค้างไว้ทั้งคืนจะได้ไม่เผาแบตกับโควตา Yahoo · กลับมาดูแล้วข้อมูลเก่ากว่าหนึ่งรอบ
    // ให้ดึงทันที ไม่ต้องรอครบรอบ (ไม่งั้นเปิดมาเจอราคาค้างอยู่เป็นนาที)
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      if (Date.now() - lastLoadRef.current >= tf.pollMs) void load();
      start();
    };

    void load();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tfKey, tf.pollMs, reloadKey]);

  // ปุ่ม "ดึงใหม่" ไม่มีตรรกะดึงข้อมูลของตัวเอง — มันแค่ทำให้ effect ข้างบนรันซ้ำ
  // (ก่อนหน้านี้เคยเขียน fetch ซ้ำอีกชุดที่นี่ ซึ่งเป็นเส้นทางที่พร้อมจะเพี้ยนจากตัวหลัก
  //  วันไหนก็ได้ เช่นลืมอัปเดตพร้อมกันตอนเปลี่ยนรูปคำตอบของ API)
  const manualRefresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const resetView = useCallback(() => setViewResetKey((k) => k + 1), []);

  // ── หมุด ─────────────────────────────────────────────────────────────────────
  // เวลาแท่งทั้งชุด (ปิดแล้ว + แท่งสด) คือ "ช่วงที่กราฟครอบคลุม" ที่ตัวจัดหมุดใช้ตัดสิน
  const barTimes = useMemo(() => {
    if (!shown) return [] as number[];
    const t = shown.bars.map((b) => b.t);
    if (shown.forming) t.push(shown.forming.t);
    return t;
  }, [shown]);

  const markers = useMemo(
    () =>
      buildSignalMarkers(signals, barTimes, {
        symbol: shown?.symbol ?? 'XAUUSD',
        timeframe: tfKey,
      }),
    [signals, barTimes, shown?.symbol, tfKey]
  );

  // ใบที่เลือกไว้หายไปจากชุด (หมดอายุ/ถูกปิดบัญชีระหว่างที่เปิดหน้าค้างไว้) → ล้างการเลือก
  // ไม่งั้นเส้น entry/SL/TP จะค้างอยู่บนกราฟโดยไม่มีสัญญาณรองรับแล้ว
  useEffect(() => {
    if (selectedId && !markers.some((m) => m.id === selectedId)) setSelectedId(null);
  }, [markers, selectedId]);

  const selected = useMemo(
    () => markers.find((m) => m.id === selectedId) ?? null,
    [markers, selectedId]
  );

  const quote = shown?.quote ?? null;
  const lastPrice = quote?.price ?? shown?.forming?.c ?? shown?.bars.at(-1)?.c ?? null;
  const changePct = quote?.change_percent ?? null;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── หัวหน้า: ชื่อ + ราคาล่าสุด ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-[rgb(var(--text-primary))] flex items-center gap-2">
            <CandlestickChart className="w-6 h-6 text-accent-glow" />
            กราฟทอง
          </h1>
          <p className="text-sm text-[rgb(var(--text-muted))] mt-0.5">
            {shown?.name ?? 'ทองคำ'} · {shown?.symbol ?? 'XAUUSD'} · แท่งเทียนพร้อมหมุดสัญญาณที่ยังเปิดอยู่
          </p>
        </div>

        {lastPrice !== null && (
          <div className="text-right">
            <div className="text-2xl font-mono font-bold tabular-nums text-[rgb(var(--text-primary))]">
              {lastPrice.toFixed(2)}
            </div>
            {changePct !== null && (
              <div
                className={cn(
                  'text-xs font-mono tabular-nums',
                  changePct >= 0 ? 'text-up' : 'text-red-700 [.dark_&]:text-down'
                )}
              >
                {/*
                  ห้ามเขียนว่า "วันนี้" — change_percent ที่ fetchChart คำนวณคือ
                  ราคาสดเทียบ "แท่งก่อนหน้าของกรอบเวลาที่ขออยู่" (src/lib/market-data.ts
                  บรรทัด 306-311) บนกรอบ 15m มันจึงเป็นการเปลี่ยนแปลงเทียบ 15 นาทีก่อน
                  ไม่ใช่เทียบเมื่อวาน · ตัวตรวจสอบจับได้เมื่อ 2026-09-04
                */}
                {changePct > 0 ? '+' : ''}
                {changePct.toFixed(2)}% เทียบแท่งก่อนหน้า
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ปุ่มกรอบเวลา + สถานะความสด ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {CHART_TIMEFRAMES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTfKey(t.key)}
              className={cn(
                // min-h 40px: ปุ่มพวกนี้ถูกกดด้วยนิ้วโป้งเป็นหลัก
                'px-3.5 py-1.5 min-h-[40px] rounded-lg text-sm font-medium transition-colors border',
                tfKey === t.key
                  ? 'border-accent-glow/30 bg-accent-glow/10 text-cyan-800 dark:text-accent-glow'
                  : 'border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2'
              )}
            >
              {t.key}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[rgb(var(--text-muted))]">
          <span>
            {/* พูดเป็น "อัปเดตทุก N นาที" ไม่ใช่ "เรียลไทม์" เพราะมีชั้นแคชฝั่ง server
                คั่นอยู่จริง — ตัวเลขความหน่วงบอกไว้ในวงเล็บให้ผู้ใช้ตัดสินเอง */}
            อัปเดตเองทุก {pollLabel(tf)}
            {shown ? ` (ข้อมูลหน่วงได้ถึง ${shown.cacheSec} วินาที)` : ''}
          </span>
          {fetchedAt !== null && <span>· ดึงล่าสุด {thClock(fetchedAt, true)} น.</span>}
          {/* ปุ่มคืนมุมมองขึ้นเฉพาะเมื่อมีกราฟให้คืนจริง — ปุ่มที่กดแล้วไม่เกิดอะไรคือปุ่มที่โกหก */}
          {shown && shown.bars.length > 0 && (
            <button
              type="button"
              onClick={resetView}
              aria-label="คืนมุมมองกราฟเป็นค่าเริ่มต้น"
              title="คืนมุมมองกราฟเป็นค่าเริ่มต้น (ไม่ได้ดึงข้อมูลใหม่)"
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2 transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={manualRefresh}
            disabled={busy}
            aria-label="ดึงข้อมูลใหม่"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', busy && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── กราฟ + สถานะ ──────────────────────────────────────────────────── */}
      <div className="card p-3 sm:p-4">
        {/* ลำดับของสามสถานะนี้ตัดสินจาก `shown` เสมอ (ข้อมูลของกรอบที่ปุ่มชี้อยู่)
            ไม่ใช่จาก payload ดิบ — ดูเหตุผลที่นิยามของ shown */}
        {!shown && busy ? (
          <div className="h-[380px] sm:h-[440px] flex flex-col items-center justify-center gap-3 text-[rgb(var(--text-muted))]">
            <RefreshCw className="w-7 h-7 animate-spin" />
            <span className="text-sm">กำลังโหลดแท่งเทียน…</span>
          </div>
        ) : !shown && error ? (
          <div className="h-[380px] sm:h-[440px] flex flex-col items-center justify-center gap-3 px-6 text-center">
            <ShieldAlert className="w-8 h-8 text-red-700 [.dark_&]:text-down" />
            <p className="text-sm text-[rgb(var(--text-secondary))]">{error}</p>
            <button
              type="button"
              onClick={manualRefresh}
              className="px-4 py-2 min-h-[40px] rounded-lg border border-[var(--border-subtle)] text-sm text-[rgb(var(--text-primary))] hover:bg-surface-2 transition-colors"
            >
              ลองใหม่
            </button>
          </div>
        ) : shown && shown.bars.length === 0 ? (
          <div className="h-[380px] sm:h-[440px] flex items-center justify-center px-6 text-center text-sm text-[rgb(var(--text-secondary))]">
            ไม่มีแท่งเทียนในกรอบเวลานี้
          </div>
        ) : shown ? (
          <>
            <GoldChart
              bars={shown.bars}
              forming={shown.forming}
              markers={markers}
              selectedId={selectedId}
              onSelect={setSelectedId}
              timeframeKey={tfKey}
              resetToken={viewResetKey}
            />
            {/* error ที่เกิดตอน poll ขณะที่ยังมีกราฟเก่าอยู่บนจอ — เตือนแบบไม่ล้างกราฟทิ้ง
                (ล้างทิ้งเพราะเน็ตสะดุดหนึ่งรอบคือการลงโทษผู้ใช้เกินเหตุ) */}
            {error && (
              <p className="mt-2 text-[11px] text-amber-700 [.dark_&]:text-amber-400">
                อัปเดตรอบล่าสุดไม่สำเร็จ ({error}) — กราฟที่เห็นคือข้อมูลของรอบก่อนหน้า
              </p>
            )}
            {/* ทุกประโยคในกล่องนี้ต้องเป็นท่าที่ทำแล้วเกิดผลจริงบนเครื่อง — ของเดิมเขียนว่า
                "แตะสองครั้งที่แกนเพื่อคืนค่าเริ่มต้น" ซึ่งลองแล้วไม่เกิดอะไรขึ้น
                (แตะห่างกัน 150ms ที่แกนเวลา ค่าของแกนไม่ขยับสักช่อง) จึงเปลี่ยนมาชี้ปุ่ม
                ที่มีอยู่จริงบนหน้าแทน · คำแนะนำที่ทำตามแล้วไม่เกิดผลคือคำโกหกแบบหนึ่ง */}
            <p className="mt-2 text-[11px] leading-relaxed text-[rgb(var(--text-muted))] flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                สองนิ้วซูม · ลากนิ้วเดียวตามแนวนอนเลื่อนเวลา · ปัดขึ้นลงบนกราฟเพื่อเลื่อนหน้าต่อ ·
                กดค้างเพื่ออ่านค่าตรงจุดนั้น ปล่อยนิ้วแล้วหาย · ปุ่มคืนมุมมองอยู่มุมขวาบน
                {/* ประโยคนี้จริงเฉพาะตอนที่มีแท่งกำลังก่อตัวจริง ๆ ตลาดปิดอยู่เมื่อไหร่
                    แท่งขวาสุดคือแท่งที่ปิดแล้ว การพูดค้างไว้ทั้งสองกรณีคือการบอกผิด */}
                {shown.forming
                  ? ' · แท่งขวาสุดคือแท่งที่ยังไม่ปิด ค่ายังเปลี่ยนได้จนหมดคาบ'
                  : ' · ตอนนี้ไม่มีแท่งที่กำลังก่อตัว แท่งขวาสุดคือแท่งที่ปิดแล้ว'}
              </span>
            </p>
          </>
        ) : null}
      </div>

      {/* ── คำอธิบายหมุด: ข้อความนี้ต้องอยู่ก่อนรายการสัญญาณเสมอ ───────────── */}
      <div className="card p-3 sm:p-4 space-y-3">
        <p className="text-[11px] leading-relaxed text-[rgb(var(--text-muted))] flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            หมุด ▲ / ▼ บนกราฟคือ <span className="text-[rgb(var(--text-secondary))] font-medium">จุดที่ระบบเคยออกสัญญาณ</span>{' '}
            ไม่ใช่คำแนะนำให้เข้าไม้ · เส้นประที่ขึ้นตอนเลือกหมุดคือราคาสามค่าที่สัญญาณใบนั้นระบุไว้
            (จุดเข้า / SL / TP) ไม่ใช่การคาดการณ์ราคาข้างหน้า
          </span>
        </p>

        {markers.length === 0 ? (
          <p className="text-sm text-[rgb(var(--text-secondary))]">
            ตอนนี้ไม่มีสัญญาณที่ยังเปิดอยู่ในช่วงเวลาที่กราฟนี้ครอบคลุม — ใบที่ปิดบัญชีแล้วดูผลได้ที่หน้า &quot;ผลจริง&quot;
          </p>
        ) : (
          <>
            {/* แถวหมุดแบบเลื่อนแนวนอน — บนมือถือแตะที่นี่ง่ายกว่าเล็งหมุดบนกราฟ */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {markers.map((m) => {
                const on = m.id === selectedId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedId(on ? null : m.id)}
                    className={cn(
                      'flex-shrink-0 min-h-[44px] px-3 py-1.5 rounded-lg border text-xs transition-colors',
                      on
                        ? 'border-accent-glow/40 bg-accent-glow/10 text-cyan-800 dark:text-accent-glow'
                        : 'border-[var(--border-subtle)] bg-surface-2 text-[rgb(var(--text-secondary))] hover:bg-surface-3'
                    )}
                  >
                    <span
                      className={cn(
                        'font-semibold',
                        m.action === 'BUY' ? 'text-up' : 'text-red-700 [.dark_&]:text-down'
                      )}
                    >
                      {m.action === 'BUY' ? '▲' : '▼'} {m.action}
                    </span>
                    <span className="ml-1.5 font-mono tabular-nums">{m.entry.toFixed(2)}</span>
                    <span className="ml-1.5 opacity-70">
                      {m.timeframe || '?'} · {thDateTime(m.createdSec * 1000)}
                    </span>
                  </button>
                );
              })}
            </div>

            {selected ? (
              <SignalDetail marker={selected} symbol={shown?.symbol ?? 'XAUUSD'} viewTf={tfKey} />
            ) : (
              <p className="text-xs text-[rgb(var(--text-muted))]">
                แตะหมุดบนกราฟหรือปุ่มด้านบน เพื่อดูราคาเข้า/SL/TP ของสัญญาณใบนั้น
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * กล่องรายละเอียดของหมุดที่เลือก
 *
 * ทุกตัวเลขในกล่องนี้เป็นของที่ถูกบันทึกไว้แล้วตอนสัญญาณเกิด (หรือคำนวณตรง ๆ จาก
 * สามราคานั้น) — ไม่มีช่องไหนเป็นการคาดการณ์ · บรรทัดสถิติย้อนหลังมาจาก
 * src/lib/signal-evidence.ts และพูดในรูป "ในอดีต…%" เท่านั้น ตามข้อบังคับของตัวอ่านนั้น
 */
function SignalDetail({
  marker,
  symbol,
  viewTf,
}: {
  marker: ChartSignalMarker;
  symbol: string;
  viewTf: string;
}) {
  const buy = marker.action === 'BUY';
  const strength = STRENGTH_TH[marker.strength] ?? { label: marker.strength, stars: 0 };

  // R:R จากสามราคาของสัญญาณเอง — ระยะ SL เป็น 0 หรือไม่มีเลข ต้องได้ '—' ไม่ใช่ Infinity
  const risk = marker.stopLoss !== null ? Math.abs(marker.entry - marker.stopLoss) : NaN;
  const reward = marker.takeProfit !== null ? Math.abs(marker.takeProfit - marker.entry) : NaN;
  const rr =
    Number.isFinite(risk) && risk > 0 && Number.isFinite(reward)
      ? `1:${(reward / risk).toFixed(1)}`
      : '—';

  const evidence = lookupEvidence(symbol, marker.timeframe, marker.action, marker.strength);
  const evidenceTfNote = evidence
    ? evidence.sourceTimeframe === marker.timeframe
      ? evidence.sourceTimeframe
      : `ประมาณจากกรอบ ${evidence.sourceTimeframe}`
    : null;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-surface-2 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold',
            buy ? 'bg-emerald-500/10 text-up' : 'bg-red-500/10 text-red-700 [.dark_&]:text-down'
          )}
        >
          {buy ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {marker.action}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-glow/10 text-cyan-800 dark:text-accent-glow border border-accent-glow/30">
          {marker.timeframe || '?'}
        </span>
        {/* กรอบเวลาต้นทางต่างจากกราฟที่กำลังดู — ต้องบอกตรง ๆ ไม่ใช่ปล่อยให้เข้าใจเอง */}
        {marker.foreign && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 [.dark_&]:text-amber-400">
            สัญญาณจากกรอบ {marker.timeframe || 'อื่น'} · กราฟที่ดูอยู่คือ {viewTf}
          </span>
        )}
        <span className="text-[11px] text-[rgb(var(--text-muted))]">
          ออกเมื่อ {thDateTime(marker.createdSec * 1000)} น.
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-1 rounded-lg p-2">
          <div className="text-[10px] uppercase font-medium text-[rgb(var(--text-muted))]">จุดเข้า</div>
          <div className="text-sm font-mono tabular-nums font-semibold text-[rgb(var(--text-primary))] mt-0.5">
            {marker.entry.toFixed(2)}
          </div>
        </div>
        <div className="bg-red-500/10 rounded-lg p-2">
          <div className="text-[10px] uppercase font-medium text-red-700 [.dark_&]:text-down flex items-center gap-1">
            <ShieldAlert className="w-2.5 h-2.5" /> SL
          </div>
          <div className="text-sm font-mono tabular-nums font-semibold text-red-700 [.dark_&]:text-down mt-0.5">
            {marker.stopLoss !== null ? marker.stopLoss.toFixed(2) : '—'}
          </div>
        </div>
        <div className="bg-emerald-500/10 rounded-lg p-2">
          <div className="text-[10px] uppercase font-medium text-up flex items-center gap-1">
            <Target className="w-2.5 h-2.5" /> TP
          </div>
          <div className="text-sm font-mono tabular-nums font-semibold text-up mt-0.5">
            {marker.takeProfit !== null ? marker.takeProfit.toFixed(2) : '—'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        <span className="text-[rgb(var(--text-muted))]">
          ความแรง <span className="text-[rgb(var(--text-primary))] font-medium">{strength.label}</span>
          <span className="ml-1 inline-flex gap-0.5 align-middle">
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'inline-block w-1.5 h-1.5 rounded-full',
                  i < strength.stars ? (buy ? 'bg-up' : 'bg-down') : 'bg-surface-3'
                )}
              />
            ))}
          </span>
        </span>
        <span
          className="text-[rgb(var(--text-muted))]"
          title="กำไรเป้าหมายเทียบความเสี่ยง คิดจากราคา TP/SL ของสัญญาณใบนี้"
        >
          R:R <span className="font-mono text-[rgb(var(--text-primary))] font-medium">{rr}</span>
        </span>
        {marker.confidence !== null && (
          <span className="text-[rgb(var(--text-muted))]">
            Conf <span className="font-mono text-[rgb(var(--text-primary))] font-medium">{marker.confidence}%</span>
          </span>
        )}
        {/* ต้นทุนไป-กลับเป็นสัดส่วนของเงินที่เสี่ยง — เขียนโดยตัวสแกนตอนสร้างสัญญาณ
            ไม่ได้คำนวณใหม่ที่นี่ · แถวเก่าก่อน migration 007 ไม่มีค่านี้ จึงไม่แสดงอะไรเลย */}
        {marker.costR !== null && (
          <span
            className="text-[rgb(var(--text-muted))]"
            title="ค่าธรรมเนียมไป-กลับโดยประมาณ คิดเป็นสัดส่วนของเงินที่เสี่ยงในไม้นี้ — ถูกหักออกจากผลลัพธ์เสมอ"
          >
            ต้นทุน{' '}
            <span
              className={cn(
                'font-mono font-medium',
                marker.costR >= 0.15
                  ? 'text-red-700 [.dark_&]:text-down'
                  : 'text-[rgb(var(--text-primary))]'
              )}
            >
              {marker.costR.toFixed(3)}R
            </span>
          </span>
        )}
      </div>

      {/* บรรทัดสถิติย้อนหลัง — ชุดเดียวกับที่ SignalCard แสดง พูดในรูป "ในอดีต…%"
          ไม่มีข้อมูลถึงเกณฑ์ = ไม่แสดงบล็อกนี้เลย ห้ามเดา */}
      {evidence && (
        <div
          className="rounded-lg bg-surface-1 px-2.5 py-2 text-[11px] leading-relaxed"
          title={`ความถี่ที่วัดจากประวัติช่วง ${evidence.spanYears} ของเซ็ตอัพ SL/TP แบบเดียวกัน — ไม่ใช่การพยากรณ์ผลของสัญญาณนี้`}
        >
          <span className="text-[rgb(var(--text-muted))]">ในอดีตเซ็ตอัพนี้: </span>
          <span className="whitespace-nowrap text-up font-medium">
            ถึง TP ก่อน {Math.round(evidence.tpFirstPct * 100)}%
          </span>
          <span className="text-[rgb(var(--text-muted))]"> · </span>
          <span className="whitespace-nowrap text-red-700 [.dark_&]:text-down font-medium">
            โดน SL ก่อน {Math.round(evidence.slFirstPct * 100)}%
          </span>
          <span className="text-[rgb(var(--text-muted))]"> · </span>
          <span className="whitespace-nowrap text-[rgb(var(--text-muted))]">
            หมดเวลา {Math.round(evidence.timeoutPct * 100)}% (N={evidence.n}, {evidenceTfNote}
            {evidence.level !== 'symbol' ? ', รวมทุกสินทรัพย์ในจักรวาล' : ''})
          </span>
        </div>
      )}
    </div>
  );
}
