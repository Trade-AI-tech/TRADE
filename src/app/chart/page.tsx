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
import ChartIndicatorToggles from '@/components/trading/ChartIndicatorToggles';
import SignalEngineSnapshot from '@/components/trading/SignalEngineSnapshot';
import { useSignals } from '@/hooks/useData';
import {
  buildSignalMarkerSet,
  countMarkerStatuses,
  MARKER_STATUS_ALWAYS_SHOWN,
  MARKER_STATUS_META,
  MARKER_STATUS_ORDER,
} from '@/lib/chart-markers';
import type { ChartSignalMarker } from '@/lib/chart-markers';
import {
  CHART_TIMEFRAMES,
  DEFAULT_TIMEFRAME_KEY,
  resolveTimeframe,
} from '@/lib/chart-timeframes';
import type { ChartBar, ChartTimeframe } from '@/lib/chart-timeframes';
import { computeChartIndicators } from '@/lib/chart-indicators';
import {
  DEFAULT_CHART_INDICATOR_PREFS,
  loadChartIndicatorPrefs,
  saveChartIndicatorPrefs,
} from '@/lib/chart-indicator-prefs';
import type { ChartIndicatorPrefs } from '@/lib/chart-indicator-prefs';
import { lookupEvidence } from '@/lib/signal-evidence';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { MarketPrice, Signal } from '@/types';

/**
 * /chart — หน้ากราฟทอง
 *
 * ═══ หมุดบนกราฟหมายความว่าอะไร ═══════════════════════════════════════════════
 * หมุดหนึ่งอัน = "ระบบเคยออกสัญญาณตรงจุดนี้" เท่านั้น ไม่ใช่คำแนะนำให้เข้าไม้
 * และหน้านี้ไม่วาดเส้นทำนายอนาคตหรือลูกศรชี้ทิศราคาใด ๆ — เส้นประที่ขึ้นเมื่อเลือกหมุด
 * คือราคาสามค่าที่สัญญาณใบนั้นระบุไว้จริงในฐานข้อมูล (จุดเข้า / SL / TP) ไม่ใช่การคาดการณ์
 *
 * ═══ หมุดรวมใบที่ปิดบัญชีแล้วด้วย (2026-09-06) ═══════════════════════════════════
 * กราฟแสดงสัญญาณทุกใบที่อยู่ในช่วงเวลาที่มันครอบคลุม พร้อมบอกว่าแต่ละใบจบยังไง
 * (ยังเปิด / ถึง TP / โดน SL / หมดเวลา) — ใบที่แพ้กับใบที่ชนะเห็นชัดเท่ากันเสมอ
 * ตัวเลขในบรรทัดสรุปนับจาก **หมุดที่แสดงอยู่จริง** เท่านั้น (countMarkerStatuses
 * ตัวเดียวกับที่เทสต์ใช้) และหน้านี้ไม่ตีความว่าตัวเลขชุดนั้นดีหรือแย่ — ปล่อยให้มันพูดเอง
 * ถ้าใบในช่วงนั้นเกินเพดาน MARKER_CAP หน้าเว็บต้องพิมพ์ยอดเต็มไว้ด้วย ห้ามตัดเงียบ ๆ
 *
 * ═══ อินดิเคเตอร์บนกราฟ ═════════════════════════════════════════════════════════
 * เส้นที่วาดทับกราฟคือชุดเดียวกับที่เครื่องยนต์ใช้ตัดสิน คำนวณด้วยฟังก์ชันตัวเดียวกัน
 * (src/lib/indicators.ts) และคาบชุดเดียวกัน — ดู src/lib/chart-indicators.ts
 * มันคำนวณจากราคาย้อนหลังล้วน ๆ ไม่ใช่การคาดการณ์ และหน้านี้ไม่รวมคะแนนอะไรขึ้นมาเอง
 * ส่วนตัวเลขในกล่อง "ค่าที่เครื่องยนต์เห็นตอนออกใบนี้" มาจากคอลัมน์ signals.indicators
 * ของแถวนั้นตรง ๆ ไม่ได้คำนวณใหม่ — นั่นคือของชิ้นเดียวที่ตรวจสอบเครื่องยนต์ได้จริง
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

/** ISO จาก DB → เวลาโซนไทย · อ่านไม่ออก/ไม่มีค่า = null (ห้ามเดาเวลาแล้วพิมพ์ออกจอ) */
function thDateTimeIso(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? thDateTime(ms) : null;
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
  /**
   * เส้นอินดิเคเตอร์ที่ผู้ใช้เปิดไว้
   *
   * เริ่มด้วยค่าเริ่มต้นเสมอ แล้วค่อยอ่านของจริงจากเครื่องใน effect — ห้ามอ่าน
   * localStorage ตอน render แรก เพราะ server ไม่มีทางรู้ค่านั้น เนื้อหาที่ render
   * ออกมาจะไม่ตรงกัน (hydration mismatch) แล้ว React จะทิ้ง DOM ฝั่ง server ทั้งก้อน
   * วิธีเดียวกับที่ ThemeToggle ของรีโปนี้ใช้อยู่แล้ว
   */
  const [prefs, setPrefs] = useState<ChartIndicatorPrefs>(DEFAULT_CHART_INDICATOR_PREFS);
  /** อ่านค่าจากเครื่องมาแล้วหรือยัง (ref เพราะตัวอ่านต้องเห็นค่าล่าสุดทันที ไม่ใช่รอเรนเดอร์) */
  const prefsHydrated = useRef(false);
  /**
   * ค่าล่าสุดแบบอ่านได้ทันที — ตัวจัดการปุ่มต้องผสมจากของจริง ไม่ใช่จากรอบเรนเดอร์เก่า
   * (กดสองปุ่มรัว ๆ ในเฟรมเดียวกันแล้วปุ่มแรกหายไป คือบั๊กที่ ref ตัวนี้ปิดอยู่)
   */
  const prefsRef = useRef<ChartIndicatorPrefs>(DEFAULT_CHART_INDICATOR_PREFS);

  /**
   * ═══ การเขียนลงเครื่องเกิดตอน "ผู้ใช้กดปุ่ม" เท่านั้น ไม่ใช่ใน effect ═══════════
   *
   * ⚠ ห้ามย้ายการเรียก saveChartIndicatorPrefs กลับเข้าไปใน useEffect ที่ผูกกับ prefs
   *   ของเดิมทำแบบนั้นแล้วอ้างว่า "ประกาศ effect ตัวเขียนก่อนตัวโหลด" ปิดปัญหาได้
   *   คำอ้างนั้นไม่จริง และวัดมาแล้วว่าพังจริงบน `npm run dev`:
   *     React StrictMode ของ Next dev รัน effect รอบสองทันทีหลังรอบแรก โดยที่ผลของ
   *     setPrefs() จากตัวโหลดยังไม่ถูกนำไปใช้ — ตอนนั้น prefsHydrated เป็น true แล้ว
   *     แต่ state ยังเป็นค่าเริ่มต้น ตัวเขียนจึงเขียน "ค่าเริ่มต้น" ทับสิ่งที่ผู้ใช้ตั้งไว้
   *     ทดสอบตรง ๆ: ตั้ง {ma20:false, lowerPane:'macd'} แล้วรีโหลด → ได้ค่าเริ่มต้นคืนมา
   *     ทั้งชุด (บิลด์โปรดักชันไม่มีอาการ เพราะไม่มี StrictMode — จึงเป็นบั๊กที่เจ้าของ
   *     เจอก่อนใครเพื่อน เพราะเปิดด้วย dev)
   *   การเขียนตอนกดปุ่มไม่มีช่องนั้นเลย: ไม่มี effect ไหนเขียนได้ตอน mount อีกต่อไป
   *   ลำดับการประกาศ effect จึงไม่ใช่เรื่องที่ต้องมาระวังอีก
   */
  useEffect(() => {
    // StrictMode เรียกซ้ำ (หรือผู้ใช้กดปุ่มทันก่อน effect แรก) → อ่านซ้ำไม่มีประโยชน์
    // และที่สำคัญคือ **ไม่เขียนอะไรทั้งนั้น** จึงทับของผู้ใช้ไม่ได้ไม่ว่ารันกี่รอบ
    if (prefsHydrated.current) return;
    const stored = loadChartIndicatorPrefs();
    prefsHydrated.current = true;
    prefsRef.current = stored;
    setPrefs(stored);
  }, []);

  /**
   * รับเป็น "ส่วนที่เปลี่ยน" ไม่ใช่ก้อนใหม่ทั้งชุด แล้วผสมกับค่าล่าสุดใน ref
   * เพื่อให้การกดสองปุ่มรัว ๆ ในจังหวะเดียวกันไม่ทำให้ปุ่มแรกหายไป
   */
  const changePrefs = useCallback((patch: Partial<ChartIndicatorPrefs>) => {
    // กดเร็วกว่า effect แรกได้ในทางทฤษฎี (passive effect รันหลังวาดจอ) — ถ้าเกิดขึ้น
    // ต้องอ่านของเก่าจากเครื่องมาเป็นฐานก่อน ไม่ใช่ผสมทับค่าเริ่มต้นแล้วลบของผู้ใช้ทิ้ง
    const base = prefsHydrated.current ? prefsRef.current : loadChartIndicatorPrefs();
    prefsHydrated.current = true;
    const next: ChartIndicatorPrefs = { ...base, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    saveChartIndicatorPrefs(next);
  }, []);

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

  /**
   * ชุดหมุดของรอบนี้ — ทั้งของที่วาดจริงและยอดที่ถูกตัดออกเพราะเพดาน
   * ต้องใช้ buildSignalMarkerSet (ไม่ใช่ buildSignalMarkers) เพราะหน้านี้ต้องพิมพ์ให้ผู้ใช้
   * เห็นว่าแสดงกี่ใบจากทั้งหมดกี่ใบ — การตัดเงียบ ๆ คือการซ่อนข้อมูลจากเจ้าของ
   */
  const markerSet = useMemo(
    () =>
      buildSignalMarkerSet(signals, barTimes, {
        symbol: shown?.symbol ?? 'XAUUSD',
        timeframe: tfKey,
        // 'all' = ใบที่ปิดบัญชีแล้วก็ยังปักอยู่ พร้อมป้ายว่าจบยังไง (ดูหัวไฟล์)
        include: 'all',
      }),
    [signals, barTimes, shown?.symbol, tfKey]
  );
  const markers = markerSet.markers;
  /** นับจากหมุดที่แสดงอยู่จริงเท่านั้น — ห้ามนับจากชุดก่อนตัดเพดาน */
  const statusCounts = useMemo(() => countMarkerStatuses(markers), [markers]);
  /** แถวคำอธิบายสัญลักษณ์: สี่สถานะหลักขึ้นเสมอ ที่เหลือขึ้นเฉพาะตอนมีจริง */
  const legendRows = useMemo(
    () =>
      MARKER_STATUS_ORDER.filter(
        (s) => MARKER_STATUS_ALWAYS_SHOWN.includes(s) || statusCounts[s] > 0
      ),
    [statusCounts]
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

  /**
   * แถวสัญญาณตัวเต็มของใบที่เลือก — ต้องใช้ `indicators` กับ `reasons` ที่หมุดไม่ได้พกมา
   * (ChartSignalMarker เก็บเฉพาะสิ่งที่ตัววาดกราฟต้องใช้ โดยตั้งใจ)
   */
  const selectedRow = useMemo<Signal | null>(
    () => (selectedId ? signals.find((s) => s.id === selectedId) ?? null : null),
    [signals, selectedId]
  );

  /**
   * ค่าอินดิเคเตอร์ของกราฟ — คำนวณจาก **แท่งปิดแล้วเท่านั้น** (ไม่ต่อ shown.forming)
   * เหตุผลเต็มอยู่ที่หัวไฟล์ src/lib/chart-indicators.ts
   * useMemo ผูกกับชุดแท่งอย่างเดียว จึงไม่คำนวณใหม่ตอนผู้ใช้เปิด/ปิดเส้นหรือเลือกหมุด
   * (คำนวณใหม่รอบละ ~1,000 แท่งทุกครั้งที่แตะปุ่ม จะทำให้ปุ่มหน่วงบนมือถือรุ่นเก่า)
   * ชุดแท่งเป็นอาร์เรย์ก้อนใหม่ทุกรอบ poll อยู่แล้ว ค่าจึงสดตามข้อมูลเสมอ
   */
  const bars = shown?.bars;
  const indicators = useMemo(
    () => (bars && bars.length ? computeChartIndicators(bars) : null),
    [bars]
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
            {shown?.name ?? 'ทองคำ'} · {shown?.symbol ?? 'XAUUSD'} · แท่งเทียนพร้อมหมุดสัญญาณที่ระบบเคยออกในช่วงนี้
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
        {/*
          ⚠ error ต้องมาก่อน busy เสมอ — สลับลำดับเมื่อไหร่บั๊กเดิมกลับมาทันที
          ตัวจับเวลา poll ตั้ง busy = true ทุกนาที ถ้าเช็ค busy ก่อน ตัวหมุนจะชนะ
          ข้อความ error ตลอดกาล ผู้ใช้เห็น "กำลังโหลดแท่งเทียน…" ค้างไปเรื่อย ๆ
          โดยไม่มีทางรู้ว่าจริง ๆ แล้วดึงข้อมูลไม่ได้ (เจอบน production 2026-09-04
          ตอน session หมดอายุ: /api/chart ตอบ 401 แต่จอขึ้นตัวหมุนอย่างเดียว)
        */}
        {!shown && error ? (
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
        ) : !shown && busy ? (
          <div className="h-[380px] sm:h-[440px] flex flex-col items-center justify-center gap-3 text-[rgb(var(--text-muted))]">
            <RefreshCw className="w-7 h-7 animate-spin" />
            <span className="text-sm">กำลังโหลดแท่งเทียน…</span>
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
              prefs={prefs}
              indicators={indicators}
            />
            <ChartIndicatorToggles
              prefs={prefs}
              onChange={changePrefs}
              ma200Available={indicators?.hasMA200 ?? false}
              closedBars={indicators?.closedBars ?? 0}
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

        {barTimes.length === 0 ? (
          // ยังไม่มีแท่งให้ปักหมุด (กำลังโหลด / ดึงไม่สำเร็จ / กรอบนี้ไม่มีข้อมูล)
          // ต้องแยกจากกรณี "ไม่มีสัญญาณ" ให้ชัด ไม่งั้นตอนโหลดหน้าจะขึ้นข้อความที่ยังไม่จริง
          <p className="text-sm text-[rgb(var(--text-secondary))]">
            ยังไม่มีแท่งเทียนให้ปักหมุด — เมื่อกราฟโหลดเสร็จ หมุดของสัญญาณในช่วงนั้นจะขึ้นเอง
          </p>
        ) : markers.length === 0 ? (
          <p className="text-sm text-[rgb(var(--text-secondary))]">
            ในช่วงเวลาที่กราฟนี้ครอบคลุม ยังไม่มีสัญญาณของ {shown?.symbol ?? 'XAUUSD'} ที่ระบบออกไว้เลย
            ทั้งใบที่ยังเปิดอยู่และใบที่ปิดบัญชีไปแล้ว — ลองสลับกรอบเวลาเพื่อดูช่วงที่ยาวกว่านี้
          </p>
        ) : (
          <>
            {/* ── บรรทัดสรุป + คำอธิบายสัญลักษณ์ ─────────────────────────────
                ตัวเลขทุกตัวมาจาก countMarkerStatuses ซึ่งนับจากหมุดที่แสดงอยู่จริง
                ห้ามเติมคำตีความว่าดีหรือแย่ลงในบล็อกนี้ — ตัวเลขพูดเองได้แล้ว */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-surface-2 px-2.5 py-2 space-y-1.5">
              <p className="text-[11px] leading-relaxed text-[rgb(var(--text-secondary))]">
                {markerSet.hidden > 0 ? (
                  <>
                    ในช่วงที่กราฟนี้ครอบคลุม ระบบออกสัญญาณ{' '}
                    <span className="font-mono tabular-nums text-[rgb(var(--text-primary))]">{markerSet.matched}</span> ใบ ·
                    กราฟปักไว้ {markers.length} ใบใหม่สุด (อีก {markerSet.hidden} ใบเก่ากว่านั้นไม่ได้ปัก)
                    ตัวเลขข้างล่างนับจากหมุดที่ปักอยู่เท่านั้น
                  </>
                ) : (
                  <>
                    ในช่วงที่กราฟนี้ครอบคลุม ระบบออกสัญญาณ{' '}
                    <span className="font-mono tabular-nums text-[rgb(var(--text-primary))]">{markers.length}</span> ใบ
                    นับจากหมุดที่ปักอยู่ทั้งหมด
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {legendRows.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 text-[rgb(var(--text-muted))]">
                    {/* จุดสีอ่านค่าจากตัวแปรเดียวกับที่ตัววาดกราฟอ่าน — สองฝั่งจึงเพี้ยนจากกันไม่ได้ */}
                    <span
                      aria-hidden
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: `rgb(var(${MARKER_STATUS_META[s].colorVar}))` }}
                    />
                    {MARKER_STATUS_META[s].label}{' '}
                    <span className="font-mono tabular-nums text-[rgb(var(--text-primary))] font-medium">
                      {statusCounts[s]}
                    </span>
                  </span>
                ))}
              </div>
              <p className="text-[10px] leading-relaxed text-[rgb(var(--text-dim))]">
                ▲ ใต้แท่ง = BUY · ▼ เหนือแท่ง = SELL · สีของหมุดบอกว่าใบนั้นจบยังไงตามที่ระบบบันทึกไว้
                ไม่ได้บอกว่าราคาจะไปทางไหนต่อ
              </p>
            </div>

            {/* แถวหมุดแบบเลื่อนแนวนอน — บนมือถือแตะที่นี่ง่ายกว่าเล็งหมุดบนกราฟ
                เรียงใบใหม่สุดไว้ซ้าย (สลับทางกับกราฟโดยตั้งใจ) เพราะแถวนี้ยาวได้ถึง
                60 ชิป ถ้าเรียงตามกราฟ ใบล่าสุดจะไปอยู่สุดขวาซึ่งต้องกวาดหลายสิบจอถึงจะถึง */}
            <p className="text-[10px] text-[rgb(var(--text-dim))]">แถวหมุดข้างล่างเรียงใบใหม่สุดก่อน</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {[...markers].reverse().map((m) => {
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
                    {/* ผลของใบนี้ต้องอยู่บนชิปด้วย ไม่ใช่รอให้แตะเข้าไปดู — ใบที่โดน SL
                        ต้องอ่านออกตั้งแต่แถวนี้ เท่ากับใบที่ถึง TP */}
                    <span
                      className="ml-1.5 font-medium"
                      style={{ color: `rgb(var(${MARKER_STATUS_META[m.status].colorVar}))` }}
                    >
                      {MARKER_STATUS_META[m.status].label}
                    </span>
                    <span className="ml-1.5 opacity-70">
                      {m.timeframe || '?'} · {thDateTime(m.createdSec * 1000)}
                    </span>
                  </button>
                );
              })}
            </div>

            {selected ? (
              <SignalDetail
                marker={selected}
                symbol={shown?.symbol ?? 'XAUUSD'}
                viewTf={tfKey}
                row={selectedRow}
              />
            ) : (
              <p className="text-xs text-[rgb(var(--text-muted))]">
                แตะหมุดบนกราฟหรือปุ่มด้านบน เพื่อดูราคาเข้า/SL/TP ของสัญญาณใบนั้น
                พร้อมค่าอินดิเคเตอร์ที่เครื่องยนต์บันทึกไว้ตอนออกใบนั้น
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
  row,
}: {
  marker: ChartSignalMarker;
  symbol: string;
  viewTf: string;
  /** แถวเต็มของสัญญาณใบนี้ — null = หาไม่เจอในชุดที่โหลดมา (กล่องค่าจะบอกตรง ๆ) */
  row: Signal | null;
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

      {/* ── ใบนี้จบยังไง ────────────────────────────────────────────────────
          ทุกช่องอ่านจากคอลัมน์ที่ scripts/resolve-signals.mjs เขียนไว้ตรง ๆ
          ไม่มีช่องไหนคำนวณใหม่ที่นี่ · ค่าที่ไม่มีจะไม่แสดงเลย ไม่ใช่เติมด้วยการเดา */}
      <MarkerOutcome marker={marker} />

      {/* ── ค่าที่เครื่องยนต์เห็นตอนออกใบนี้ ─────────────────────────────────
          อ่านจากคอลัมน์ signals.indicators / signals.reasons ของแถวนั้นตรง ๆ
          ไม่คำนวณใหม่ที่นี่ — เป็นของชิ้นเดียวในหน้านี้ที่ตรวจสอบเครื่องยนต์ได้จริง */}
      <SignalEngineSnapshot
        indicators={row?.indicators}
        reasons={row?.reasons}
        rowMissing={row === null}
        signalTimeframe={marker.timeframe}
        viewTimeframe={viewTf}
        foreign={marker.foreign}
      />

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

/**
 * "ใบนี้จบยังไง" — บล็อกเดียวในหน้านี้ที่พูดถึงผลลัพธ์ของสัญญาณใบหนึ่ง
 *
 * ═══ กติกาของบล็อกนี้ ═══════════════════════════════════════════════════════════
 * · ทุกช่องอ่านจากคอลัมน์ที่ scripts/resolve-signals.mjs เขียนไว้ (outcome / realized_r /
 *   exit_price / bars_held / resolved_at) **ไม่คำนวณใหม่ที่นี่** — ตัวเลข R มีกติกาของมัน
 *   อยู่ในตัวเก็บผล (หักต้นทุนแล้ว) ถ้าหน้าเว็บคิดเอง จะได้เลขที่ไม่มีใครตรวจสอบได้
 * · ค่าที่ไม่มี = ไม่แสดงช่องนั้น ไม่ใช่เติมด้วยการเดาหรือขีดกลางที่ดูเหมือนมีข้อมูล
 * · ใบที่โดน SL ต้องอ่านออกด้วยน้ำหนักสายตาเท่ากับใบที่ถึง TP — สีคนละสีได้ แต่ความเข้ม
 *   ต้องเท่ากัน และห้ามซ่อนบล็อกนี้เมื่อผลออกมาไม่สวย
 * · ห้ามตีความว่าผลนี้ดีหรือแย่ และห้ามโยงไปถึงผลของใบถัดไปไม่ว่าทางใด
 */
function MarkerOutcome({ marker }: { marker: ChartSignalMarker }) {
  const meta = MARKER_STATUS_META[marker.status];
  const color = `rgb(var(${meta.colorVar}))`;
  const resolvedTh = thDateTimeIso(marker.resolvedAt);
  const r = marker.realizedR;

  return (
    <div className="rounded-lg bg-surface-1 px-2.5 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        <span className="text-[rgb(var(--text-muted))]">
          ผลของใบนี้{' '}
          <span className="font-semibold" style={{ color }}>
            {meta.label}
          </span>
        </span>

        {r !== null && (
          <span
            className="text-[rgb(var(--text-muted))]"
            title="ผลจริงเป็นหน่วย R ที่ตัวเก็บผลบันทึกไว้ = ผลดิบหักต้นทุนไป-กลับแล้ว (1R = เงินที่เสี่ยงไว้ตั้งแต่แรก)"
          >
            ผลจริง{' '}
            <span className="font-mono tabular-nums font-medium" style={{ color }}>
              {r > 0 ? '+' : ''}
              {r.toFixed(2)}R
            </span>
          </span>
        )}

        {marker.exitPrice !== null && (
          <span className="text-[rgb(var(--text-muted))]">
            ราคาออก{' '}
            <span className="font-mono tabular-nums text-[rgb(var(--text-primary))] font-medium">
              {marker.exitPrice.toFixed(2)}
            </span>
          </span>
        )}

        {marker.barsHeld !== null && (
          <span className="text-[rgb(var(--text-muted))]" title="จำนวนแท่งที่ถือไว้ก่อนใบนี้จบ นับด้วยแท่งของกรอบเวลาที่ออกใบ">
            ถือ{' '}
            <span className="font-mono tabular-nums text-[rgb(var(--text-primary))] font-medium">
              {marker.barsHeld}
            </span>{' '}
            แท่ง
          </span>
        )}

        {resolvedTh !== null && (
          <span className="text-[rgb(var(--text-muted))]">ปิดบัญชี {resolvedTh} น.</span>
        )}
      </div>

      {/* ใบที่ยังเปิด: คงคำเดิมของหน้านี้ไว้ — ยังไม่มีผล ไม่ใช่ผลเป็นศูนย์ */}
      {marker.status === 'open' && (
        <p className="text-[10px] leading-relaxed text-[rgb(var(--text-dim))]">
          ใบนี้ยังเปิดอยู่ในบัญชีของระบบ จึงยังไม่มีผลปิดบัญชีให้ดู
        </p>
      )}
      {marker.status === 'unknown' && (
        <p className="text-[10px] leading-relaxed text-[rgb(var(--text-dim))]">
          ระบบไม่มีผลของใบนี้บันทึกไว้ — เป็นได้ทั้งแถวที่สร้างก่อนระบบเริ่มเก็บผล
          และใบที่พ้นอายุไปโดยที่ตัวเก็บผลยังไม่ได้ปิดบัญชีให้
        </p>
      )}
      {marker.status === 'unresolvable' && (
        <p className="text-[10px] leading-relaxed text-[rgb(var(--text-dim))]">
          ตัวเก็บผลเดินราคาไปข้างหน้าแล้วแต่ข้อมูลไม่พอจะสรุปว่าใบนี้จบแบบไหน จึงบันทึกไว้ตามนั้น
        </p>
      )}
    </div>
  );
}
