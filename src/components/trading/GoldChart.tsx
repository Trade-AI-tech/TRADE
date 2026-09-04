'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  MouseEventParams,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import type { ChartBar } from '@/lib/chart-timeframes';
import type { ChartSignalMarker } from '@/lib/chart-markers';

/**
 * GoldChart.tsx — ตัววาดแท่งเทียน + หมุดสัญญาณ
 *
 * ═══ touch-action ต้องเป็น pan-y ไม่ใช่ none (บั๊กจริง วัดแล้ว 2026-09-04) ═══════════
 * ตรวจซอร์สของ lightweight-charts 5.2.1 แล้ว: **มันไม่ตั้ง touch-action ให้เลย**
 * (grep 'touch-action' ใน dist ไม่เจอสักที่) เราจึงต้องตั้งเอง แต่ค่าที่ตั้งต้องสอดคล้อง
 * กับสิ่งที่บอกไลบรารีไว้ ไม่งั้นทัชจะถูก "ทิ้งจากทั้งสองฝั่ง"
 *
 * ── ของเดิม `touch-action: none` + `vertTouchDrag: false` = เขตตายกลางจอ ──────────
 * `vertTouchDrag: false` แปลเป็นภาษาของไลบรารีว่า treatVertTouchDragAsPageScroll ()
 * → true (dist บรรทัด 9107) และตัวจัดการทัชของมันตัดสินแบบนี้ (dist 8166-8175):
 *     isHorzDrag = |dx| × 0.5 > |dy|      ← ลากเอียงเกิน atan(0.5) ≈ 26.6° = ไม่ใช่
 *     isVertDrag = |dy| ≥ |dx| × 0.5 และ treatVert…() === false  ← เราปิดไว้ = ไม่ใช่
 *   ไม่ใช่ทั้งคู่ → มันตั้ง _preventTouchDragProcess แล้ว **ไม่ preventDefault**
 *   คือมัน "ยกให้หน้าเว็บเลื่อนแทน" โดยเจตนา แต่ `touch-action: none` สั่งเบราว์เซอร์
 *   ไว้แล้วว่าห้ามเลื่อน — ผลคือนิ้วที่ปัดชันกว่า 26.6° ไม่เกิดอะไรขึ้นเลยสักอย่าง
 *   วัดบนหน้าจริงที่ 375×812: ลากที่ 0/9.5/18.4/24.6° กราฟเลื่อนปกติ ·
 *   ลากที่ 30.3/45/90° กราฟขยับ 0 แท่ง และหน้าเว็บก็ไม่เลื่อน = แช่แข็ง
 *   กราฟกิน 380px จาก 812px (47% ของจอ) และมีเนื้อหาใต้กราฟอีก 206px ที่ผู้ใช้
 *   ต้องหาแถบแคบ ๆ นอกกราฟให้เจอก่อนถึงจะเลื่อนลงไปดูได้ — นี่คือข้อที่เจ้าของเน้นเอง
 *
 * ── `pan-y` แก้ให้สองฝั่งพูดตรงกัน ────────────────────────────────────────────────
 * pan-y = "เบราว์เซอร์เลื่อนแนวตั้งได้ อย่างอื่นไม่ได้" ซึ่งตรงกับที่ vertTouchDrag:false
 * ขอไว้พอดี · ลากแนวนอน → เบราว์เซอร์ไม่แตะ กราฟเลื่อนเวลาเหมือนเดิม ·
 * ปัดขึ้นลง → หน้าเว็บเลื่อน · **สองนิ้วยังเป็นของกราฟ** เพราะ pan-y ไม่รวม pinch-zoom
 * (ต้องเขียน token `pinch-zoom` แยกถึงจะปล่อยให้เบราว์เซอร์ซูม ซึ่งเราไม่เขียน)
 * ⚠ ห้ามกลับไปเป็น none โดยไม่เปลี่ยน vertTouchDrag เป็น true พร้อมกัน — สองค่านี้
 *   ต้องสอดคล้องกันเสมอ ไม่งั้นเขตตายกลับมาทันทีโดยไม่มี error ให้ใครเห็น
 *
 * iOS Safari ยังมีอีกชั้น: event ตระกูล gesture* (gesturestart/gesturechange) ของ
 * Apple เอง ไม่ได้ถูก touch-action คุม ถ้าไม่ preventDefault หน้าเว็บทั้งหน้าจะซูมตาม
 * นิ้วขณะที่กราฟก็ซูมด้วย = ภาพเบิ้ล จึงต้องดักสามตัวนั้นเองด้วย passive: false
 *
 * หน้านี้ไม่ได้ตั้ง user-scalable=no (viewport ใน src/app/layout.tsx ไม่มี maximumScale
 * และไม่มี userScalable: false) — การซูมหน้าเว็บด้วยสองนิ้วนอกกล่องกราฟจึงยังทำได้ปกติ
 * เราแค่ "กัน" เฉพาะในกล่องกราฟ ไม่ได้ปิดความสามารถของทั้งหน้า
 *
 * ═══ หมุดคืออะไร ═════════════════════════════════════════════════════════════════
 * หมุด = ระบบเคยออกสัญญาณตรงนั้น ไม่ใช่คำแนะนำให้เข้า และไฟล์นี้ไม่วาดเส้นทำนาย
 * อนาคตหรือลูกศรชี้ทิศราคาใด ๆ ทั้งสิ้น — เส้นที่วาดมีแค่ราคาที่สัญญาณระบุไว้จริง
 * (entry / SL / TP) ซึ่งเป็นตัวเลขที่มีอยู่แล้วในฐานข้อมูล ไม่ใช่การคาดการณ์
 */

interface Props {
  /** แท่งที่ปิดแล้ว เรียงเวลาขึ้น ไม่ซ้ำ (/api/chart รับประกันไว้แล้ว) */
  bars: readonly ChartBar[];
  /** แท่งที่ยังก่อตัว — ต่อท้ายเพื่อให้ผู้ใช้เห็นราคาปัจจุบัน null = รอบปิดอยู่ */
  forming: ChartBar | null;
  markers: readonly ChartSignalMarker[];
  /** id ของหมุดที่ถูกเลือก — ตัวที่ได้เส้น entry/SL/TP */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** เปลี่ยนค่านี้ = ข้อมูลคนละชุด ต้องจัดกรอบมองใหม่ (ห้ามคงซูมเดิมข้ามกรอบเวลา) */
  timeframeKey: string;
  /**
   * ขยับค่านี้ = ผู้ใช้กดปุ่ม "คืนมุมมอง" — จัดกรอบมองกลับเป็นค่าเริ่มต้นทันที
   *
   * ต้องมีปุ่มที่มองเห็นได้ ไม่ใช่พึ่งท่าทางอย่างเดียว เพราะแถบแกนเวลาสูง 28px
   * อยู่ติดขอบล่างของกราฟพอดี ลากโดนโดยไม่ตั้งใจแล้วแท่งถูกบีบจนอ่านไม่ออก
   * (วัดจริง: ลากแนวนอน 120px บนแถบนั้น ระยะห่างแท่งเหลือ 0.97px) ผู้ใช้ต้องมีทาง
   * กลับที่ "เห็นด้วยตา" เสมอ — ท่าทางที่ต้องรู้ล่วงหน้าไม่ใช่ทางออกสำหรับคนที่ติดอยู่
   */
  resetToken?: number;
  heightClass?: string;
}

/** ไทยไม่มี DST มาตั้งแต่ พ.ศ. 2488 — บวกตายตัวได้ ผลจึงเท่ากันทุกเครื่องทุก runtime */
const TH_OFFSET_MS = 7 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

function thDate(sec: number): Date {
  return new Date(sec * 1000 + TH_OFFSET_MS);
}

/** "3 ก.ย. 14:45" — ป้ายเส้นเล็งของกราฟ (โซนไทย ไม่ใช่ UTC ที่ไลบรารีใช้เป็นค่าเริ่มต้น) */
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function thCrosshairLabel(sec: number, intraday: boolean): string {
  const d = thDate(sec);
  const day = `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`;
  return intraday ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
}

/**
 * ป้ายบนแกนเวลา — ต้องเป็นโซนไทยเหมือนป้ายเส้นเล็งและเหมือนทุกหน้าในระบบ
 *
 * ทำไมต้องเขียนเอง: localization.timeFormatter ของไลบรารีคุมเฉพาะป้ายเส้นเล็ง
 * ส่วนตัวเลขบนแกนใช้ตัวจัดรูปแบบภายในที่อ่านเวลาเป็น UTC เสมอ ผลคือจอเดียวกัน
 * แสดงสองโซนเวลาต่างกัน 7 ชั่วโมง (ตัวตรวจสอบจับได้เมื่อ 2026-09-04) — คนอ่านกราฟ
 * เทียบเวลากับหน้าสัญญาณไม่ได้เลย ซึ่งเป็นอาการเดียวกับที่เจ้าของเคยรายงานว่า
 * "สัญญาณไม่ตรงกับกราฟ"
 *
 * tickMarkType: 0=ปี 1=เดือน 2=วันที่ 3=เวลา 4=เวลาพร้อมวินาที
 */
function thAxisTick(sec: number, tickMarkType: number): string {
  const d = thDate(sec);
  if (tickMarkType <= 1) return `${TH_MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear() + 543).slice(-2)}`;
  if (tickMarkType === 2) return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`;
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * อ่านสีจากตัวแปรธีมของแอปเอง แทนการฮาร์ดโค้ดสีไว้ในไฟล์นี้
 * ทำแบบนี้เพื่อให้กราฟเปลี่ยนตามธีมสว่าง/มืดโดยอัตโนมัติ และวันไหนมีคนปรับพาเลตต์
 * ใน globals.css กราฟจะตามไปเองโดยไม่ต้องมาแก้ที่นี่ (สีที่ตั้งซ้ำจะเพี้ยนจากแอปวันไหนก็ได้)
 */
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const dark = document.documentElement.classList.contains('dark');
  const token = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v ? `rgb(${v})` : fallback;
  };
  return {
    dark,
    up: token('--up', dark ? 'rgb(52 211 153)' : 'rgb(4 120 87)'),
    down: token('--down', dark ? 'rgb(248 113 113)' : 'rgb(220 38 38)'),
    text: token('--text-muted', dark ? 'rgb(161 161 170)' : 'rgb(82 82 91)'),
    accent: token('--accent-glow', dark ? 'rgb(37 244 238)' : 'rgb(14 116 144)'),
    // เส้นกริดกับขอบใช้สีตัวหนังสือแบบจาง ๆ — คำนวณเองแทนการอ่าน --border-subtle
    // เพราะตัวแปรนั้นเก็บเป็น rgb(... / a) ทั้งก้อน ไม่ใช่ช่องสีดิบเหมือนตัวอื่น
    grid: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    border: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)',
  };
}

type Palette = ReturnType<typeof readPalette>;

/**
 * ═══ กี่แท่งถึงจะ "อ่านออก" ในความกว้างที่มีอยู่จริง ═══════════════════════════════
 *
 * ── บั๊กจริงที่ค่าพวกนี้มาปิด (วัดบนหน้าจริง 2026-09-04) ──────────────────────────
 * ของเดิมตั้งตายตัวว่า "เปิดมาให้เห็น 120 แท่งท้าย" ซึ่งเป็นเลขที่ใช้ได้บนจอคอม
 * แต่บนจอ iPhone กว้าง 375px แถบเวลาเหลือ 258px → 123 แท่ง = **2.08 พิกเซลต่อแท่ง**
 * ที่ความกว้างเท่านั้นตัวแท่งกับไส้เทียนแยกกันไม่ออก ภาพที่ออกมาอ่านเป็น "เส้น"
 * ไม่ใช่ "แท่งเทียน" ซึ่งเป็นสิ่งเดียวที่หน้านี้มีหน้าที่แสดง (วัดได้เท่ากันทั้ง 15m/1H/1D)
 *
 * จำนวนแท่งจึงต้องมาจากความกว้างจริง ไม่ใช่ค่าคงที่ ตั้งเป้า ~6.5 พิกเซลต่อแท่ง
 * (ตัวแท่งกว้าง ~5px + ช่องไฟ = แยกตัวแท่งกับไส้ออกจากกันได้) แล้วคุมเพดานสองข้าง
 * กันค่าสุดโต่ง: จอแคบมากต้องไม่เหลือแท่งน้อยจนไม่เห็นบริบท จอกว้างมากต้องไม่กวาด
 * ทั้งเดือนมากองในจอเดียว
 *   375px → แถบเวลา ~258px → 258/6.5 ≈ 40 → ดันขึ้นเป็น 45 แท่ง (11 ชม. ของเลน 15m)
 *   จอคอม ~1000px → 154 → ตัดลงเป็น 140 แท่ง
 */
const PX_PER_BAR = 6.5;
const MIN_VISIBLE_BARS = 45;
const MAX_VISIBLE_BARS = 140;
/** เว้นที่ทางขวาไว้กี่ช่องแท่ง ให้แท่งสดไม่ติดขอบจนอ่านราคาไม่ออก (= rightOffset) */
const RIGHT_PAD = 3;

function visibleBarCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return MIN_VISIBLE_BARS;
  const slots = Math.round(width / PX_PER_BAR) - RIGHT_PAD;
  return Math.min(MAX_VISIBLE_BARS, Math.max(MIN_VISIBLE_BARS, slots));
}

export default function GoldChart({
  bars,
  forming,
  markers,
  selectedId,
  onSelect,
  timeframeKey,
  resetToken = 0,
  heightClass = 'h-[380px] sm:h-[440px]',
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  /** กรอบเวลาที่ชุดข้อมูลบนจอตอนนี้เป็นของมัน — ต่างเมื่อไหร่ = ต้องจัดกรอบมองใหม่ */
  const drawnTfRef = useRef<string | null>(null);
  /**
   * ไลบรารีโหลดเสร็จและกราฟถูกสร้างแล้วหรือยัง
   *
   * ต้องเป็น state ไม่ใช่ ref: การโหลดไลบรารีเป็น dynamic import จึงเสร็จ "หลัง" เรนเดอร์แรก
   * เสมอ ขณะที่ข้อมูลจาก /api/chart มาถึงเมื่อไหร่ก็ได้ ถ้าข้อมูลมาก่อนกราฟถูกสร้าง
   * effect ที่ป้อนข้อมูลจะเจอ chartRef เป็น null แล้วออกไปเฉย ๆ และจะไม่ถูกเรียกอีกเลย
   * เพราะ deps ของมันไม่มีอะไรเปลี่ยนอีกแล้ว = กราฟว่างเปล่าถาวรโดยไม่มี error ให้เห็น
   * (บั๊กจริงที่เจอตอนทดสอบบนเครื่อง — หน้าโหลดครบ ราคาขึ้นครบ แต่ในกรอบไม่มีแท่งเลย)
   */
  const [ready, setReady] = useState(false);

  /** ตัวเฝ้ารอให้กล่องมีความกว้างจริงก่อนจัดกรอบมองครั้งแรก (ดู frameWhenSized) */
  const sizeWaitRef = useRef<ResizeObserver | null>(null);

  /** callback ล่าสุด เก็บใน ref เพื่อให้ effect ที่สร้างกราฟรันครั้งเดียวจริง ๆ */
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const markersDataRef = useRef<readonly ChartSignalMarker[]>(markers);
  markersDataRef.current = markers;

  /**
   * ทำ `fn` เมื่อกล่องกราฟมีความกว้างจริงแล้วเท่านั้น
   *
   * ── บั๊กจริงที่ฟังก์ชันนี้มาปิด (เจอตอนทดสอบบนเครื่อง 2026-09-04) ─────────────
   * การสั่ง "ให้เห็น N แท่งท้าย" ถูกไลบรารีแปลงเป็น **ระยะห่างต่อแท่งเป็นพิกเซล**
   * ทันทีที่สั่ง ถ้าตอนนั้นกล่องกว้าง 0 ระยะห่างจะถูกคำนวณจากศูนย์ แล้วมันค้างอย่างนั้น
   * ต่อไป — พอกล่องได้ความกว้างจริง ไลบรารีรักษา "ระยะห่างต่อแท่ง" ไว้ ไม่ใช่
   * "จำนวนแท่งที่เห็น" ผลคือแท่งทั้งชุดกองเป็นเส้นบาง ๆ ชิดขวา เหลือจอว่างทั้งฝั่งซ้าย
   *
   * กล่องกว้าง 0 ตอนโหลดเกิดจริงเมื่อหน้าถูกเรนเดอร์ในแท็บที่ยังไม่ถูกแสดง
   * (เปิดลิงก์ในแท็บหลัง · PWA ที่ระบบปลุกกลับมาจากพื้นหลัง) — ไม่ใช่เคสสมมติ
   */
  // useCallback ว่างเปล่า: ฟังก์ชันนี้อ่านแต่ ref จึงไม่มีอะไรให้ผูก — ทำให้ effect
  // ที่ป้อนข้อมูลไม่ต้องรันใหม่ทุกครั้งที่คอมโพเนนต์เรนเดอร์
  const frameWhenSized = useCallback((fn: () => void) => {
    sizeWaitRef.current?.disconnect();
    sizeWaitRef.current = null;
    const box = boxRef.current;
    if (!box) return;
    if (box.clientWidth > 0 || typeof ResizeObserver === 'undefined') {
      fn();
      return;
    }
    const ro = new ResizeObserver(() => {
      if (!boxRef.current || boxRef.current.clientWidth <= 0) return;
      ro.disconnect();
      if (sizeWaitRef.current === ro) sizeWaitRef.current = null;
      fn();
    });
    ro.observe(box);
    sizeWaitRef.current = ro;
  }, []);

  /** จำนวนแท่งของชุดที่วาดอยู่บนจอตอนนี้ — ปุ่มคืนมุมมองต้องรู้ว่าจะจัดกรอบรอบอะไร */
  const dataLenRef = useRef(0);

  /**
   * จัดกรอบมองกลับไปที่ "ท้ายชุด กว้างเท่าที่จอนี้อ่านออก"
   *
   * ใช้ทั้งตอนเปิดกรอบเวลาใหม่และตอนผู้ใช้กดปุ่มคืนมุมมอง — เส้นทางเดียวกันทั้งคู่
   * โดยตั้งใจ ไม่งั้นวันไหนแก้สูตรความกว้างจะมีทางหนึ่งที่ตามไม่ทันโดยไม่มีใครเห็น
   *
   * ความกว้างที่ใช้คิดคือความกว้างของ **แถบเวลา** ไม่ใช่ของทั้งกล่อง เพราะกล่องรวม
   * แกนราคาทางขวา (~55px บนจอมือถือ) ซึ่งไม่มีแท่งวางอยู่ ถ้าคิดรวมไปด้วยจะได้จำนวน
   * แท่งมากกว่าที่พื้นที่จริงรับไหวทุกครั้ง
   */
  const frameLatest = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // รอให้กล่องมีความกว้างจริงก่อนเสมอ — เหตุผลเต็มอยู่ที่ frameWhenSized
    frameWhenSized(() => {
      if (chartRef.current !== chart) return; // กราฟถูกทิ้งไประหว่างรอ
      const n = dataLenRef.current;
      if (n <= 0) return;
      const ts = chart.timeScale();
      const width = ts.width() || boxRef.current?.clientWidth || 0;
      const span = visibleBarCount(width);
      ts.setVisibleLogicalRange({ from: Math.max(0, n - span), to: n - 1 + RIGHT_PAD });
    });
  }, [frameWhenSized]);

  // ── 1. สร้างกราฟครั้งเดียวตลอดอายุคอมโพเนนต์ ────────────────────────────────
  useEffect(() => {
    let disposed = false;
    const box = boxRef.current;
    if (!box) return;

    // โหลดไลบรารีแบบ dynamic: มันแตะ DOM ตอนสร้างกราฟ และเป็นก้อนที่ใหญ่ที่สุด
    // ของหน้านี้ — โหลดในเบราว์เซอร์เท่านั้น หน้าอื่นในแอปจึงไม่ต้องแบกไปด้วย
    import('lightweight-charts')
      .then((LWC) => {
        if (disposed || !boxRef.current) return;
        const p = readPalette();
        const intraday = timeframeKey !== '1D';

        const chart = LWC.createChart(boxRef.current, {
          // autoSize ให้ไลบรารีเฝ้าขนาดกล่องเอง (มี ResizeObserver ในตัว)
          // ⚠ ห้ามกลับไปตั้ง width/height เองแล้วเฝ้าขนาดด้วย ResizeObserver ของเรา:
          //   ตอนกล่องยังไม่ได้ขนาดจริง กราฟจะถูกสร้างด้วยความกว้างเล็กจิ๋ว แล้วการจัด
          //   กรอบมองครั้งแรกจะบีบแท่งทั้งชุดลงในความกว้างนั้น (ระยะห่างแท่ง ~0.5px)
          //   พอกล่องขยายทีหลัง ไลบรารีรักษา "ระยะห่างแท่ง" ไว้ ไม่ใช่ "จำนวนแท่งที่เห็น"
          //   ผลคือแท่งทั้งหมดกองเป็นเส้นบาง ๆ ชิดขวา เหลือพื้นที่ว่างทั้งจอ (เจอจริงตอนทดสอบ)
          autoSize: true,
          layout: {
            // โปร่งใส เพื่อให้พื้นการ์ดของแอปเป็นพื้นกราฟ (ธีมไหนก็ตรงกันเอง)
            background: { color: 'transparent' },
            textColor: p.text,
            attributionLogo: false,
            fontFamily: 'inherit',
          },
          grid: {
            vertLines: { color: p.grid },
            horzLines: { color: p.grid },
          },
          rightPriceScale: { borderColor: p.border },
          timeScale: {
            borderColor: p.border,
            timeVisible: intraday,
            secondsVisible: false,
            // แกนเวลาต้องเป็นโซนไทย ไม่ใช่ UTC ที่ไลบรารีใช้เป็นค่าเริ่มต้น (ดู thAxisTick)
            tickMarkFormatter: (t: Time, tickMarkType: number) => thAxisTick(Number(t), tickMarkType),
            // เว้นที่ขวาไว้หน่อย ให้แท่งสดไม่ติดขอบจนอ่านราคาไม่ออกบนจอแคบ
            rightOffset: RIGHT_PAD,
            barSpacing: 8,
            /**
             * พื้นระยะห่างแท่ง — กันไม่ให้ผู้ใช้ "ติด" ในมุมมองที่อ่านอะไรไม่ได้เลย
             *
             * ค่าเริ่มต้นของไลบรารีคือ 0.5px/แท่ง และแถบแกนเวลาสูง 28px อยู่ติดขอบล่าง
             * ของกราฟ ซึ่งเป็นบริเวณที่นิ้วโป้งกวาดผ่านตอนเลื่อนเวลาพอดี — วัดจริงแล้ว
             * ลากแนวนอน 120px บนแถบนั้นทำให้ระยะห่างแท่งเหลือ 0.97px คือเส้นขนแมว
             * ที่ไม่มีข้อมูลอะไรเหลืออยู่ · 2px เป็นขอบล่างที่ยังพอเห็นว่าเป็นแท่ง และยัง
             * ปล่อยให้ซูมออกได้กว้างกว่ามุมมองเริ่มต้นกว่าสามเท่า
             * (ทางกลับที่แน่นอนคือปุ่ม "คืนมุมมอง" — ดู resetToken)
             */
            minBarSpacing: 2,
          },
          /**
           * กดค้างแล้วปล่อยนิ้ว = ออกจากโหมดอ่านค่าทันที (บั๊กจริง วัดแล้ว 2026-09-04)
           *
           * ค่าเริ่มต้นของไลบรารีคือ OnNextTap (dist บรรทัด 12495) แปลว่า พอกดค้างครบ
           * 240ms (Delay.LongTap — dist 8342 ไม่ใช่ 500ms อย่างที่คนคุ้น) กราฟจะเข้า
           * "โหมดติดตามเส้นเล็ง" แล้ว **ค้างอยู่อย่างนั้น** จนกว่าผู้ใช้จะบังเอิญแตะเปล่า ๆ
           * หนึ่งครั้ง ระหว่างนั้นลากนิ้วเดียวจะขยับแต่เส้นเล็ง กราฟไม่เลื่อนเลย
           *   วัดจริง: ขณะติดโหมดนี้ ลากแนวนอน 25px หกครั้ง กราฟเลื่อน 0 แท่ง
           *   (กรอบค้างที่ from=140 ทุกครั้ง) · แตะเปล่าหนึ่งครั้งแล้วลากท่าเดิม เลื่อนปกติ
           * อาการที่ผู้ใช้เจอคือ "กราฟค้าง ลากไม่ไป" โดยไม่มีอะไรบนจอบอกวิธีออก —
           * และการกดแล้วค่อยลากคือท่าปกติของคนที่ตั้งใจเล็ง ไม่ใช่ท่าแปลก
           * OnTouchEnd ทำให้โหมดนี้จบลงพร้อมการยกนิ้ว = กดค้างอ่านค่า ปล่อยแล้วหาย
           */
          trackingMode: { exitMode: LWC.TrackingModeExitMode.OnTouchEnd },
          crosshair: {
            // โหมด Normal: เส้นเล็งตามนิ้วจริง ไม่ดูดเข้าแท่ง — บนมือถือแตะแล้วเห็นค่า
            // ตรงจุดที่แตะ ซึ่งอ่านง่ายกว่าเส้นที่กระโดดไปมา
            mode: LWC.CrosshairMode.Normal,
            vertLine: { color: p.accent, width: 1, style: LWC.LineStyle.Dotted, labelBackgroundColor: p.accent },
            horzLine: { color: p.accent, width: 1, style: LWC.LineStyle.Dotted, labelBackgroundColor: p.accent },
          },
          localization: {
            locale: 'th-TH',
            timeFormatter: (t: Time) => thCrosshairLabel(Number(t), intraday),
          },
          // ── หัวใจของ "ซูม/ลากบนมือถือให้ลื่น" ──────────────────────────────
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            // ปิดการลากแนวตั้งด้วยนิ้วโดยตั้งใจ: ถ้าเปิดไว้ นิ้วเดียวที่เอียงนิดเดียว
            // จะไปยืด/หดแกนราคาแทนที่จะเลื่อนเวลา ผู้ใช้รู้สึกว่ากราฟ "เพี้ยนเอง"
            // การซูมยังทำได้ครบด้วยสองนิ้ว (pinch) ซึ่งเป็นท่าที่คนคาดหวังบนมือถือ
            vertTouchDrag: false,
          },
          handleScale: {
            mouseWheel: true,
            pinch: true,
            axisPressedMouseMove: { time: true, price: true },
            axisDoubleClickReset: { time: true, price: true },
          },
        });

        const series = chart.addSeries(LWC.CandlestickSeries, {
          upColor: p.up,
          downColor: p.down,
          borderUpColor: p.up,
          borderDownColor: p.down,
          wickUpColor: p.up,
          wickDownColor: p.down,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });

        chartRef.current = chart;
        seriesRef.current = series;
        markersRef.current = LWC.createSeriesMarkers(series, []);

        // แตะหมุดแล้วเลือกใบนั้น — ลองอ่าน id ที่ไลบรารีบอกก่อน ถ้าไม่มี
        // (นิ้วแตะพลาดไปนิดเดียวบนจอเล็ก) ค่อยถอยไปหาหมุดที่เวลาใกล้ที่สุด
        chart.subscribeClick((param: MouseEventParams<Time>) => {
          const hovered = param.hoveredInfo?.objectId ?? param.hoveredObjectId;
          const list = markersDataRef.current;
          if (typeof hovered === 'string' && list.some((m) => m.id === hovered)) {
            onSelectRef.current(hovered);
            return;
          }
          if (param.time == null || list.length === 0) return;
          const at = Number(param.time);
          let best: ChartSignalMarker | null = null;
          let bestGap = Infinity;
          for (const m of list) {
            const gap = Math.abs(m.time - at);
            if (gap < bestGap) {
              bestGap = gap;
              best = m;
            }
          }
          // ยอมพลาดได้ไม่เกินสองแท่ง — กว้างกว่านั้นคือผู้ใช้แตะที่ว่าง ไม่ได้เล็งหมุด
          const tolerance = 2 * barSecondsOf(timeframeKey);
          if (best && bestGap <= tolerance) onSelectRef.current(best.id);
        });

        // ปลุก effect ที่ป้อนข้อมูล/หมุด ให้รันซ้ำหลังกราฟมีตัวตนจริงแล้ว
        setReady(true);
      })
      .catch((err) => {
        console.error('โหลดไลบรารีกราฟไม่สำเร็จ:', err);
      });

    return () => {
      disposed = true;
      sizeWaitRef.current?.disconnect();
      sizeWaitRef.current = null;
      priceLinesRef.current = [];
      markersRef.current = null;
      seriesRef.current = null;
      drawnTfRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
      setReady(false);
    };
    // สร้างครั้งเดียว — การเปลี่ยน timeframe จัดการที่ effect ข้อมูลข้างล่าง
    // (สร้างกราฟใหม่ทุกครั้งที่สลับปุ่มจะทำให้จอกระพริบและเสียซูมโดยไม่จำเป็น)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. กันทัชของกราฟไว้กับกราฟ (iOS Safari) ─────────────────────────────────
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // touch-action: none ปิด pan/pinch/double-tap ของเบราว์เซอร์ได้ทุกที่ ยกเว้น
    // gesture* ของ iOS ซึ่งต้องดักเอง ไม่งั้นหน้าเว็บจะซูมซ้อนกับกราฟ
    const stop = (e: Event) => e.preventDefault();
    const opts = { passive: false } as const;
    box.addEventListener('gesturestart', stop, opts);
    box.addEventListener('gesturechange', stop, opts);
    box.addEventListener('gestureend', stop, opts);
    return () => {
      box.removeEventListener('gesturestart', stop);
      box.removeEventListener('gesturechange', stop);
      box.removeEventListener('gestureend', stop);
    };
  }, []);

  // ── 3. ธีมเปลี่ยน → ทาสีใหม่ (ไม่สร้างกราฟใหม่ ซูมของผู้ใช้จึงไม่หาย) ────────
  useEffect(() => {
    const apply = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;
      const p: Palette = readPalette();
      chart.applyOptions({
        layout: { textColor: p.text },
        grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
        rightPriceScale: { borderColor: p.border },
        timeScale: { borderColor: p.border },
        crosshair: {
          vertLine: { color: p.accent, labelBackgroundColor: p.accent },
          horzLine: { color: p.accent, labelBackgroundColor: p.accent },
        },
      });
      series.applyOptions({
        upColor: p.up,
        downColor: p.down,
        borderUpColor: p.up,
        borderDownColor: p.down,
        wickUpColor: p.up,
        wickDownColor: p.down,
      });
    };
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // ── 4. ป้อนข้อมูล — รักษาซูม/ตำแหน่งที่ผู้ใช้เลื่อนไว้ทุกครั้งที่ poll ───────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || bars.length === 0) return;

    const data = [...bars, ...(forming ? [forming] : [])].map((b) => ({
      time: b.t as UTCTimestamp,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }));

    const ts = chart.timeScale();
    const fresh = drawnTfRef.current !== timeframeKey;
    // scrollPosition() = จำนวนแท่งที่เหลือทางขวาของแท่งท้ายสุด · >= 0 แปลว่าผู้ใช้
    // ยังดูขอบขวาอยู่ → หลังเติมแท่งใหม่ต้องเลื่อนตามให้เขาเห็นของสด
    // ติดลบแปลว่าเขาเลื่อนไปดูอดีต → ห้ามกระชากกลับ ต้องคงกรอบเวลาเดิมไว้
    const followRight = !fresh && ts.scrollPosition() >= 0;
    const keepRange = !fresh && !followRight ? ts.getVisibleRange() : null;

    series.setData(data);
    dataLenRef.current = data.length;

    if (fresh) {
      drawnTfRef.current = timeframeKey;
      // เปิดมาให้เห็นเฉพาะท้ายชุด ไม่ใช่ทั้งชุด — เลน 15m ส่งมาเป็นพันแท่ง
      // ถ้า fitContent จะได้เส้นขนแมวที่อ่านอะไรไม่ได้เลยบนจอมือถือ
      // จำนวนแท่งมาจากความกว้างจริงของจอ ไม่ใช่ค่าคงที่ (ดู visibleBarCount)
      frameLatest();
    } else if (followRight) {
      ts.scrollToRealTime();
    } else if (keepRange) {
      // คืนกรอบด้วย "เวลา" ไม่ใช่ดัชนี — ช่วงที่ Yahoo ส่งมาเป็นหน้าต่างเลื่อน
      // แท่งเก่าหลุดออกทางซ้ายได้ทุกรอบ ดัชนีเดิมจึงชี้คนละที่ แต่เวลาไม่มีวันเพี้ยน
      try {
        ts.setVisibleRange(keepRange);
      } catch {
        // ช่วงเวลาเดิมหลุดออกนอกข้อมูลไปแล้ว — ปล่อยให้กราฟอยู่ที่เดิมของมัน ดีกว่าพัง
      }
    }
  }, [ready, bars, forming, timeframeKey, frameLatest]);

  // ── 4.5 ปุ่ม "คืนมุมมอง" ─────────────────────────────────────────────────────
  // เทียบกับค่าที่เห็นรอบก่อนแทนการเช็ก `> 0` เพื่อให้เจ้าของหน้าเลือกค่าเริ่มต้นอะไรก็ได้
  // และเพื่อไม่ให้ effect นี้จัดกรอบใหม่ตอน mount (ซึ่งเป็นหน้าที่ของ effect ข้อ 4)
  const lastResetRef = useRef(resetToken);
  useEffect(() => {
    if (lastResetRef.current === resetToken) return;
    lastResetRef.current = resetToken;
    frameLatest();
  }, [ready, resetToken, frameLatest]);

  // ── 5. หมุด ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const plugin = markersRef.current;
    if (!plugin) return;
    const p = readPalette();
    const list: SeriesMarker<Time>[] = markers.map((m) => {
      const on = m.id === selectedId;
      return {
        id: m.id,
        time: m.time as UTCTimestamp,
        // ลูกศรอยู่ "ใต้แท่ง" สำหรับ BUY และ "เหนือแท่ง" สำหรับ SELL ตามธรรมเนียมกราฟ
        // ทิศของหัวลูกศรบอกทิศของคำสั่งที่ระบบเคยออก ไม่ได้บอกว่าราคาจะไปทางไหน
        position: m.action === 'BUY' ? 'belowBar' : 'aboveBar',
        shape: m.action === 'BUY' ? 'arrowUp' : 'arrowDown',
        color: on ? p.accent : m.action === 'BUY' ? p.up : p.down,
        size: on ? 2 : 1,
        // ป้ายบอกกรอบเวลาต้นทางเสมอ — หมุดของ 1D ที่ลอยบนกราฟ 15m โดยไม่บอกที่มา
        // อ่านได้ว่ามันเกิดจากกราฟที่กำลังดูอยู่ ซึ่งไม่จริง
        text: `${m.action} ${m.timeframe || '?'}`,
      };
    });
    plugin.setMarkers(list);
  }, [ready, markers, selectedId]);

  // ── 6. เส้น entry / SL / TP ของใบที่เลือก ────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // ซีรีส์ถูกทิ้งไปแล้วระหว่างนี้ — ไม่มีอะไรต้องเก็บกวาดต่อ
      }
    }
    priceLinesRef.current = [];

    const picked = markers.find((m) => m.id === selectedId);
    if (!picked) return;

    const p = readPalette();
    const specs: Array<{ price: number | null; color: string; title: string }> = [
      { price: picked.entry, color: p.accent, title: 'จุดเข้า' },
      { price: picked.stopLoss, color: p.down, title: 'SL ตัดขาดทุน' },
      { price: picked.takeProfit, color: p.up, title: 'TP เป้าหมาย' },
    ];

    for (const s of specs) {
      // ไม่มีเลขที่ใช้ได้ = ไม่ลากเส้น (แถวเก่าบางใบไม่มี SL/TP) — เส้นที่ลากจากค่าเดา
      // คือการบอกราคาที่สัญญาณไม่เคยระบุ
      if (s.price === null) continue;
      priceLinesRef.current.push(
        series.createPriceLine({
          price: s.price,
          color: s.color,
          lineWidth: 2,
          lineStyle: 2, // LineStyle.Dashed — เส้นประเพื่อไม่ให้ปนกับเส้นราคาจริง
          axisLabelVisible: true,
          title: s.title,
        })
      );
    }

    // เลื่อนให้เห็นหมุดที่เพิ่งเลือก ถ้ามันอยู่นอกกรอบที่มองอยู่
    const chart = chartRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleRange();
    if (!range) return;
    const from = Number(range.from);
    const to = Number(range.to);
    if (picked.time >= from && picked.time <= to) return;
    const half = Math.max(1, Math.floor((to - from) / 2));
    try {
      ts.setVisibleRange({
        from: (picked.time - half) as UTCTimestamp,
        to: (picked.time + half) as UTCTimestamp,
      });
    } catch {
      // เลื่อนไม่ได้ (หมุดอยู่นอกข้อมูลที่โหลดมา) — ไม่ใช่เหตุให้ทั้งหน้าพัง
    }
  }, [ready, markers, selectedId]);

  return (
    <div
      ref={boxRef}
      className={`w-full ${heightClass} rounded-xl overflow-hidden`}
      style={{
        // pan-y = แนวตั้งเป็นของหน้าเว็บ (เลื่อนอ่านเนื้อหาใต้กราฟได้) · แนวนอนกับ
        // สองนิ้วเป็นของกราฟ · **ห้ามเปลี่ยนเป็น none** โดยไม่เปิด vertTouchDrag พร้อมกัน
        // เหตุผลเต็ม + ตัวเลขที่วัดมา อยู่ในบล็อกคอมเมนต์หัวไฟล์
        touchAction: 'pan-y',
        // ⚠ เคยตั้ง overscrollBehavior: 'contain' ไว้ตรงนี้ ถอดออกแล้วโดยตั้งใจ:
        // className มี overflow-hidden (ต้องมี เพื่อครอบ canvas ให้เข้ามุมโค้ง) ซึ่งทำให้
        // กล่องนี้นับเป็น scroll container ในสายตาเบราว์เซอร์ พอสั่ง contain ทับเข้าไป
        // การสกรอลที่เริ่มบนกราฟจะถูก "กลืน" ไม่ส่งต่อขึ้นไปให้หน้าเว็บ = ปัดขึ้นลงแล้ว
        // ไม่เกิดอะไรขึ้น ซึ่งคือเขตตายเดิมที่ pan-y เพิ่งมาแก้ กลับมาทางประตูหลัง
        WebkitUserSelect: 'none',
        userSelect: 'none',
        // ปิดแว่นขยาย/เมนูคัดลอกตอนกดค้าง — ไม่งั้นลากค้างนาน ๆ บน iOS จะเด้งขึ้นมาบัง
        WebkitTouchCallout: 'none',
      }}
    />
  );
}

/** ความยาวหนึ่งแท่งของกรอบที่กำลังดู — ใช้คิดระยะยอมพลาดตอนแตะหมุด */
function barSecondsOf(key: string): number {
  if (key === '15m') return 900;
  if (key === '1H') return 3600;
  return 86_400;
}
