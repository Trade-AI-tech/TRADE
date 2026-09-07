import { isLiveSignalRow } from './signal-flips';

/**
 * chart-markers.ts — แปลง "แถวสัญญาณ" เป็น "หมุดบนกราฟ"
 *
 * ═══ หมุดแปลว่าอะไร (อ่านก่อนแก้ข้อความหรือเกณฑ์ใด ๆ) ═══════════════════════════
 * หมุดหนึ่งอัน = **ระบบเคยออกสัญญาณตรงจุดนั้น** เท่านั้น ไม่ใช่คำแนะนำให้เข้าไม้
 * และไม่ใช่การบอกว่าราคาจะไปทางไหนต่อ — งานวิจัยของรีโปนี้วัดแล้วว่าไม่มีเซ็ตอัพไหน
 * พิสูจน์ได้ว่ามีขอบหลังหักต้นทุน ทุกข้อความรอบหมุดจึงพูดได้แค่ข้อเท็จจริงที่เกิดไปแล้ว
 *
 * ═══ ทำไมหมุดถึงรวม "ใบที่ปิดบัญชีแล้ว" ด้วย (เปลี่ยนเมื่อ 2026-09-06) ═══════════
 * ของเดิมกรองด้วย isLiveSignalRow แล้วทิ้งใบที่ปิดแล้วทั้งหมด ผลคือวันไหนไม่มีใบเปิดอยู่เลย
 * กราฟจะว่างเปล่าสนิท — เจ้าของเปิดหน้ามาเจอกราฟเปล่าแล้วถามว่า "บอกจุดที่เข้าขึ้นหรือลง
 * ที่กราฟได้ไหม" ทั้งที่ฟีเจอร์มีอยู่แล้ว มันแค่ไม่มีอะไรให้ปักในวินาทีนั้น
 *
 * ใบที่ปิดแล้วคือของที่ **ตรวจสอบได้จริง**: มันบอกว่าระบบเคยชี้ให้เข้าตรงไหน แล้วผลออกมา
 * เป็นอะไร (ถึง TP / โดน SL / หมดเวลา) ซึ่งมีค่ากว่าลูกศรชี้อนาคตที่ไม่มีใครพิสูจน์ได้
 * ⚠ ใบที่โดน SL ต้องเห็นชัดเท่ากับใบที่ถึง TP — การซ่อนใบที่แพ้ทำให้กราฟกลายเป็นโฆษณา
 *   ทั้งที่ข้อมูลชุดเดียวกันนี้แหละคือสิ่งเดียวที่ทำให้เจ้าของตรวจสอบระบบได้
 *
 * isLiveSignalRow ยัง **ต้องอยู่** และยังเป็นตัวตัดสินคำว่า "ยังเปิดอยู่" ตัวเดียวของทั้งระบบ
 * เปลี่ยนแค่บทบาท: จากตัวกรองทิ้ง มาเป็นตัวติดป้ายสถานะให้หมุดแต่ละอัน (ดู markerStatusOf)
 * ห้ามเขียนเงื่อนไข "ยังเปิดอยู่" ใหม่ที่นี่ — ถ้ากราฟกับหน้า /signals ตอบไม่ตรงกันว่า
 * ใบไหนยังเปิด เจ้าของจะเห็นหมุดที่ ledger ปิดไปแล้วติดป้ายว่ายังเปิด ซึ่งคืออาการเดิม
 * ที่เขารายงานเมื่อ 2026-09-01 กลับมาในรูปใหม่
 *
 * ═══ ทำไมต้องเป็นไฟล์ pure ═══════════════════════════════════════════════════════
 * ตรรกะ "สัญญาณใบไหนควรขึ้นกราฟ และควรเกาะแท่งไหน" คือจุดที่ผิดแล้วมองไม่เห็น:
 * หมุดที่วางผิดแท่งดูเหมือนหมุดที่ถูกต้องทุกประการ ไฟล์นี้จึงไม่แตะ DOM ไม่อ่านนาฬิกา
 * ไม่ยิงเน็ต รับข้อมูลเข้ามาตรง ๆ ทั้งหมด เพื่อให้ scripts/test-chart-api.mjs และ
 * scripts/test-chart-markers.mjs ยืนยันด้วย node เปล่า ๆ ได้ (แบบเดียวกับ signal-flips.ts)
 */

/** รูปแถวที่ฟังก์ชันนี้อ่านจริง — แคบไว้เพื่อให้เทสต์ป้อน object ธรรมดาได้ */
export interface MarkerSourceSignal {
  id: string;
  symbol: string;
  action: string;
  timeframe?: string | null;
  status?: string | null;
  outcome?: string | null;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  strength?: string | null;
  confidence?: number | null;
  cost_r?: number | null;
  created_at: string;
  // ── ผลจริงที่ตัวเก็บผลเขียนไว้ (migration 007) ──────────────────────────────
  // ทุกช่องเป็น optional เพราะโหมดถอย: ยังไม่ได้รัน 007 = คอลัมน์ไม่ถูก select มา
  // = field เป็น undefined ทั้งชุด · ห้ามให้กรณีนั้นทำให้หมุดหายหรือหน้าพัง
  realized_r?: number | null;
  exit_price?: number | null;
  resolved_at?: string | null;
  bars_held?: number | null;
}

/**
 * ใบนี้จบยังไง — ตามที่ ledger บันทึกไว้ ไม่ใช่การประเมินของหน้าเว็บ
 *
 * open          = ยังเปิดอยู่จริงตาม isLiveSignalRow (ตัวเดียวกับหน้า /signals และแจ้งเตือน)
 * tp/sl/timeout/unresolvable = ค่าที่ตัวเก็บผลเขียนลงคอลัมน์ outcome ตรง ๆ
 * unknown       = **ไม่มีคำตัดสินให้อ่าน** เช่นยังไม่ได้รัน migration 007 (ไม่มีคอลัมน์เลย)
 *                 หรือใบที่หมดอายุไปโดยที่ ledger ยังไม่ได้ปิดบัญชีให้
 *                 ห้ามแปลงเป็น 'open' หรือเดาเป็นผลอื่น — "ไม่รู้" เป็นคำตอบที่ซื่อสัตย์
 */
export type ChartMarkerStatus = 'open' | 'tp' | 'sl' | 'timeout' | 'unresolvable' | 'unknown';

export interface MarkerStatusMeta {
  /** คำไทยที่ผู้ใช้เห็น — พูดถึงสิ่งที่เกิดไปแล้วเท่านั้น ห้ามมีคำที่อ้างอนาคต */
  label: string;
  /**
   * ชื่อตัวแปรสีของแอป (เก็บเป็นช่อง RGB ดิบใน src/styles/globals.css)
   *
   * ตัววาดกราฟกับคำอธิบายสัญลักษณ์ใต้กราฟอ่าน **ตัวเดียวกันจากที่นี่** ไม่ใช่ต่างคนต่าง
   * เลือกสีเอง — สองฝั่งที่เลือกสีเองจะเพี้ยนจากกันวันไหนก็ได้ แล้วคำอธิบายจะชี้ผิดสี
   * โดยไม่มี error ให้ใครเห็น
   * ⚠ สีของ sl ต้องเข้มเท่าของ tp เสมอ (ทั้งธีมสว่างและมืด) — ใบที่แพ้จางกว่าใบที่ชนะ
   *   คือการโกหกด้วยน้ำหนักสายตา
   * ⚠ ห้ามให้สองสถานะใช้ colorVar ตัวเดียวกัน — หน้าเว็บพิมพ์ไว้เองว่า "สีของหมุดบอกว่า
   *   ใบนั้นจบยังไง" ถ้าสีซ้ำกัน ลูกศรสีนั้นบนกราฟจะชี้กลับไปได้สองแถวในคำอธิบายพร้อมกัน
   *   = ประโยคนั้นกลายเป็นคำอ้างที่แมปกลับไม่ได้ (scripts/test-chart-markers.mjs คุมไว้)
   */
  colorVar: string;
}

export const MARKER_STATUS_META: Record<ChartMarkerStatus, MarkerStatusMeta> = {
  open: { label: 'ยังเปิดอยู่', colorVar: '--accent-glow' },
  tp: { label: 'ถึง TP', colorVar: '--up' },
  sl: { label: 'โดน SL', colorVar: '--down' },
  timeout: { label: 'หมดเวลา', colorVar: '--accent-gold' },
  // สองสถานะข้างล่างคือกลุ่ม "ไม่มีคำตัดสิน" จึงใช้สีกลาง ๆ ทั้งคู่โดยตั้งใจ (สีที่มีเฉด
  // เช่นเขียว/แดง/ทอง อ่านเป็นผลลัพธ์ ซึ่งทั้งสองสถานะนี้ไม่ใช่) แต่ต้องคนละน้ำหนัก
  // ไม่งั้นแมปสีกลับเป็นสถานะไม่ได้ — ก่อน 2026-09-06 ทั้งคู่เป็น --text-secondary เท่ากันเป๊ะ
  // (วัดจริง: rgb(75,85,99) ธีมสว่าง · rgb(156,163,175) ธีมมืด เหมือนกันทั้งสองค่า)
  // ทั้งสองยังไม่ใช่สีจาง: --text-primary คือสีตัวหนังสือที่เข้มที่สุดของแอป
  // และ --text-secondary อยู่ที่ 6.8:1 บนธีมสว่าง จึงไม่มีใบไหนถูกทำให้มองไม่เห็น
  unresolvable: { label: 'ข้อมูลไม่พอสรุป', colorVar: '--text-primary' },
  unknown: { label: 'ไม่มีผลบันทึกไว้', colorVar: '--text-secondary' },
};

/** ลำดับที่คำอธิบายสัญลักษณ์และบรรทัดสรุปเดินตาม */
export const MARKER_STATUS_ORDER: readonly ChartMarkerStatus[] = [
  'open',
  'tp',
  'sl',
  'timeout',
  'unresolvable',
  'unknown',
];

/**
 * สถานะที่ต้องอยู่ในคำอธิบาย/บรรทัดสรุปเสมอ แม้รอบนี้จะนับได้ 0 ใบ
 * (เลข 0 ที่เขียนไว้ชัด ๆ ต่างจากการไม่พูดถึงเลย — อย่างหลังอ่านได้ว่า "ไม่มีข้อมูล")
 * สองสถานะที่เหลือเป็นกรณีขอบ ขึ้นเฉพาะตอนมีจริง ไม่งั้นแถวคำอธิบายจะยาวโดยไม่ได้ความ
 */
export const MARKER_STATUS_ALWAYS_SHOWN: readonly ChartMarkerStatus[] = ['open', 'tp', 'sl', 'timeout'];

/** หนึ่งหมุดที่พร้อมส่งให้ตัววาดกราฟ — ทุกช่องเป็นค่าที่ยืนยันแล้วว่าใช้ได้ */
export interface ChartSignalMarker {
  id: string;
  action: 'BUY' | 'SELL';
  /**
   * เวลาของ **แท่งที่หมุดไปเกาะ** เป็น epoch วินาที ไม่ใช่เวลาที่สัญญาณเกิด
   * (ตัววาดกราฟรับได้เฉพาะเวลาที่มีแท่งอยู่จริง — เวลาที่ไม่ตรงแท่งจะถูกทิ้งเงียบ ๆ)
   */
  time: number;
  /** เวลาที่สัญญาณเกิดจริง เป็น epoch วินาที — ใช้แสดงในกล่องรายละเอียด */
  createdSec: number;
  createdAt: string;
  entry: number;
  /** null = แถวนั้นไม่มีเลขที่ใช้ได้ ตัววาดต้องไม่ลากเส้น (ห้ามเดา) */
  stopLoss: number | null;
  takeProfit: number | null;
  strength: string;
  confidence: number | null;
  costR: number | null;
  /** timeframe ของสัญญาณตามที่อยู่ใน DB (ตัวพิมพ์ใหญ่) */
  timeframe: string;
  /**
   * true = สัญญาณใบนี้มาจากกรอบเวลาอื่นกับที่กำลังดูอยู่
   * UI **ต้อง** บอกผู้ใช้ตรง ๆ เมื่อค่านี้เป็น true — หมุดของ 1D ที่ลอยอยู่บนกราฟ 15m
   * โดยไม่มีป้ายกำกับ อ่านได้ว่า "ระบบออกสัญญาณนี้จากกราฟที่คุณกำลังดู" ซึ่งไม่จริง
   */
  foreign: boolean;
  /** ใบนี้จบยังไงตาม ledger — ตัวที่ตัดสินทั้งสีของหมุดและคำในกล่องรายละเอียด */
  status: ChartMarkerStatus;
  /**
   * ผลจริงเป็นหน่วย R (raw_r หักต้นทุนแล้ว) ตามที่ตัวเก็บผลเขียนไว้ · null = ไม่มีค่าให้แสดง
   * ห้ามคำนวณเองจากราคา — ตัวเลขนี้มีกติกาของมันอยู่ใน scripts/resolve-signals.mjs
   */
  realizedR: number | null;
  /** ราคาที่ ledger ปิดบัญชีให้ · null = ไม่มีค่าที่ใช้ได้ */
  exitPrice: number | null;
  /** เวลาที่ปิดบัญชี (ISO ตามที่อยู่ใน DB) · null = ไม่มี */
  resolvedAt: string | null;
  /** ถือกี่แท่งก่อนจบ · null = ไม่มีค่าที่ใช้ได้ */
  barsHeld: number | null;
}

/** ผลของการจัดหมุดหนึ่งรอบ — มีทั้งของที่วาดจริงและ "ของที่ถูกตัดออก" ให้ UI พูดถึงได้ */
export interface ChartMarkerSet {
  /** หมุดที่จะวาดจริง เรียงเวลาขึ้น (ตัดด้วยเพดานแล้ว) */
  markers: ChartSignalMarker[];
  /** จำนวนใบที่ผ่านทุกด่านในช่วงที่กราฟครอบคลุม — ก่อนตัดด้วยเพดาน */
  matched: number;
  /** เพดานที่ใช้จริงในรอบนี้ */
  cap: number;
  /** จำนวนใบเก่าที่ถูกตัดออกเพราะเกินเพดาน — มากกว่า 0 เมื่อไหร่ UI ต้องบอกผู้ใช้ตรง ๆ */
  hidden: number;
}

/**
 * เพดานจำนวนหมุดต่อกราฟหนึ่งใบ — เอาใบใหม่สุดก่อนเสมอ
 *
 * ── ทำไมต้องมีเพดาน (คำนวณจากของที่วัดไว้แล้วในรีโปนี้ ไม่ใช่เลขที่ชอบ) ─────────────
 * ตอนนี้หมุดรวมใบที่ปิดแล้วด้วย จำนวนจึงโตตามอายุระบบ ไม่ได้จำกัดด้วย TTL อีกต่อไป
 * ช่วงที่กราฟครอบคลุม = CHART_MAX_BARS (1,000) × ความยาวแท่ง คือ 10.4 วันซื้อขายบนเลน 15m
 * และ 41.7 วันบนเลน 1H (ดู CHART_MAX_BARS ใน chart-timeframes.ts) ที่อัตราสัญญาณของทอง
 * ราว 2-3 ใบ/วัน เลน 1H เดียวก็เกินร้อยใบได้สบาย ๆ เมื่อระบบเดินไปสักพัก
 *
 * ── 60 มาจากไหน ────────────────────────────────────────────────────────────────
 * ความหนาแน่นที่ยังอ่านออกคือตัวคุม ไม่ใช่ความจุของหน่วยความจำ:
 *   · จอ 375px → แถบเวลาเหลือ ~258px และมุมมองเริ่มต้นกว้าง 45 แท่ง (ดู MIN_VISIBLE_BARS
 *     ใน GoldChart.tsx ซึ่งวัดมาจากหน้าจริง) · ป้ายหมุดหนึ่งอัน ("BUY 15m") กว้าง ~44px
 *     → ในมุมมองเริ่มต้นมีที่ให้หมุดยืนไม่ทับกันราว 258/44 ≈ 5 อัน
 *   · 60 หมุดที่กระจายทั่ว 1,000 แท่ง = หนึ่งหมุดต่อ ~16.7 แท่ง → ในมุมมอง 45 แท่ง
 *     ตกราว 2.7 อัน ซึ่งอยู่ใต้เพดาน 5 อันข้างบนพอสมควร แม้หมุดจะกระจุกเป็นช่วง ๆ บ้าง
 *   · แถบชิปใต้กราฟก็ต้องกดถึงจริง: ชิปกว้าง ~170px → 60 ชิป ≈ 10,200px ≈ 27 ความกว้างจอ
 *     ซึ่งยังกวาดถึงได้ ส่วน 140 ใบ (เลน 1H สองเดือน) ≈ 63 ความกว้างจอ คือกวาดจนหมดแรง
 * ⚠ เพดานนี้ **ห้ามตัดเงียบ ๆ** — buildSignalMarkerSet คืน matched/hidden มาให้เสมอ
 *   และหน้าเว็บต้องพิมพ์ออกจอว่าแสดงกี่ใบจากทั้งหมดกี่ใบ (scripts/test-chart-markers.mjs คุมไว้)
 */
export const MARKER_CAP = 60;

const parseSec = (iso: string): number => {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
};

/** เลขราคาที่ใช้ได้จริง — 0/ติดลบ/NaN คือ "ไม่มีข้อมูล" ไม่ใช่ราคา */
const price = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/** เลขทั่วไปที่ใช้ได้ (ติดลบได้ — ผลเป็น R ติดลบคือเรื่องปกติและต้องแสดง) */
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** ข้อความที่มีเนื้อจริง — '' / null / undefined ถือว่าไม่มี */
const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
};

/** ผลที่ ledger ถือว่า "ปิดบัญชีแล้ว" — ชุดเดียวกับ SignalOutcome ใน src/types */
const CLOSED_OUTCOMES = new Set(['tp', 'sl', 'timeout', 'unresolvable']);

/**
 * ใบนี้จบยังไง — อ่านจาก ledger เท่านั้น ไม่มีการเดาแทนสักทาง
 *
 * ลำดับการตัดสิน (ตกลงมาทีละชั้น):
 *   1. outcome เป็นผลปิดบัญชีที่รู้จัก (tp/sl/timeout/unresolvable) → ใช้ค่านั้นตรง ๆ
 *   2. ที่เหลือ → ให้ isLiveSignalRow ตัดสิน เพราะ "ยังเปิดอยู่" ต้องผ่าน status='active'
 *      ด้วย ไม่ใช่แค่ ledger ยังไม่ปิด
 *   3. ตกทั้งสองชั้น (เช่น status='expired' โดยที่ ledger ยังไม่ปิดบัญชีให้) → 'unknown'
 *
 * ═══ โหมดถอย (ยังไม่ได้รัน migration 007 = ไม่มีคอลัมน์ outcome เลย) ═══════════
 * outcome เป็น undefined ทั้งชุด → ตกลงชั้นที่ 2 → isLiveSignalRow ตอบตามปกติ
 * (`row.outcome == null` เป็นจริงสำหรับ undefined ด้วย) แปลว่าใบที่ status='active'
 * ได้ป้าย 'open' เหมือนกับที่ /signals · /dashboard และแจ้งเตือนตอบเรื่องใบเดียวกัน
 *
 * ⚠ ห้ามใส่ทางลัด `if (row.outcome === undefined) return 'unknown'` กลับมา — เคยมีอยู่
 *   และมันคือการเขียนเงื่อนไข "ยังเปิดอยู่" ตัวที่สองซ้อนบน isLiveSignalRow ซึ่งหัวไฟล์นี้
 *   ห้ามไว้ · ผลบนจอในโหมดถอย: หมุดทุกใบติดป้าย "ไม่มีผลบันทึกไว้" และบรรทัดสรุป
 *   พิมพ์ "ยังเปิดอยู่ 0" ออกมา ทั้งที่หน้า /signals บอกว่ามีใบใช้งานอยู่จากข้อมูลชุดเดียวกัน
 *   — คือหน้าสองหน้าตอบไม่ตรงกันว่าใบไหนยังเปิด ซึ่งเป็นอาการที่เจ้าของรายงานเมื่อ 2026-09-01
 *   ความ "ไม่รู้" ของโหมดถอยเป็นเรื่องจริง แต่มันไม่รู้เท่ากันทั้งระบบ ที่นี่จึงไม่ใช่ที่
 *   ที่จะไปตอบต่างจากที่อื่นตามลำพัง
 */
export function markerStatusOf(row: { status?: string | null; outcome?: string | null }): ChartMarkerStatus {
  const code = String(row.outcome ?? '').trim().toLowerCase();
  if (CLOSED_OUTCOMES.has(code)) return code as ChartMarkerStatus;
  if (isLiveSignalRow(row)) return 'open';
  return 'unknown';
}

/**
 * นับหมุดตามสถานะ — ตัวเดียวที่ทั้งบรรทัดสรุปบนหน้าเว็บและเทสต์ใช้
 * (ถ้าหน้าเว็บนับเอง ตัวเลขบนจอกับหมุดบนกราฟจะเพี้ยนจากกันวันไหนก็ได้)
 */
export function countMarkerStatuses(
  markers: readonly ChartSignalMarker[]
): Record<ChartMarkerStatus, number> {
  const out = {
    open: 0,
    tp: 0,
    sl: 0,
    timeout: 0,
    unresolvable: 0,
    unknown: 0,
  } as Record<ChartMarkerStatus, number>;
  for (const m of markers) out[m.status] += 1;
  return out;
}

/**
 * หาแท่งที่เวลาไม่เกิน `sec` แท่งท้ายสุด — คืน index หรือ -1 เมื่อ sec อยู่ก่อนแท่งแรก
 * ค้นแบบทวิภาค เพราะเลน 15m มีได้ถึง ~2,600 แท่ง และหน้าเว็บเรียกใหม่ทุกครั้งที่ poll
 * ต้องการให้ bars เรียงจากเก่าไปใหม่ ซึ่งเป็นสิ่งที่ /api/chart รับประกันไว้แล้ว
 */
export function findBarIndexAtOrBefore(barTimes: readonly number[], sec: number): number {
  let lo = 0;
  let hi = barTimes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (barTimes[mid] <= sec) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export interface BuildMarkerOptions {
  symbol: string;
  timeframe: string;
  /**
   * 'all'  (ค่าเริ่มต้น) = ทุกใบที่อยู่ในช่วงเวลาของกราฟ ไม่ว่าจะปิดบัญชีไปแล้วหรือยัง
   *                       — นี่คือ "บันทึกภาพว่าระบบเคยบอกให้เข้าตรงไหน และผลออกมาอย่างไร"
   * 'open' = เฉพาะใบที่ยังเปิดอยู่จริงตาม isLiveSignalRow (พฤติกรรมเดิมก่อน 2026-09-06)
   *          เหลือไว้ให้ที่ที่ต้องการเฉพาะ "โอกาสที่ยังเปิด" เรียกใช้ได้โดยไม่ต้องกรองเอง
   */
  include?: 'open' | 'all';
  /** เพดานจำนวนหมุด — ไม่ส่ง = MARKER_CAP · ค่าที่ใช้ไม่ได้ก็ถอยไป MARKER_CAP */
  cap?: number;
}

/**
 * แปลงชุดสัญญาณเป็นหมุด พร้อมยอดที่ถูกตัดออก
 *
 * ด่านที่ใบหนึ่งต้องผ่าน (ตกข้อเดียว = ไม่ขึ้นกราฟ):
 *   1. symbol ตรงกับที่กราฟกำลังแสดง (เทียบแบบไม่สนตัวพิมพ์/ช่องว่าง)
 *   2. action เป็น BUY หรือ SELL — HOLD/CLOSE ไม่มี "จุดเข้า" ให้ปัก
 *   3. ผ่านตัวเลือก include: โหมด 'open' ต้อง isLiveSignalRow เป็นจริง
 *      โหมด 'all' ไม่กรองด้วยสถานะเลย แต่ **ทุกใบต้องติดป้ายว่าจบยังไง** (markerStatusOf)
 *      หมุดที่ไม่มีป้ายคือหมุดที่อ่านได้ว่า "ยังเปิดอยู่" ทั้งกระดาน ซึ่งไม่จริง
 *   4. created_at อ่านเป็นเวลาได้
 *   5. มีราคาเข้าที่ใช้ได้ (> 0) — ไม่มีจุดเข้าก็ไม่มีอะไรให้ปัก
 *   6. เวลาที่เกิดต้องอยู่ในช่วงที่กราฟครอบคลุม คือ **ไม่เก่ากว่าแท่งแรก**
 *      ใบที่เก่ากว่านั้นถูกตัดทิ้ง ไม่ใช่ดันไปกองที่แท่งแรก — หมุดที่กองอยู่ขอบซ้าย
 *      อ่านได้ว่าระบบออกสัญญาณตอนนั้นจริง ซึ่งเป็นการโกหกด้วยตำแหน่ง
 *
 * การเกาะแท่ง: ใบหนึ่งเกาะ "แท่งท้ายสุดที่เปิดไปแล้วตอนสัญญาณเกิด" เสมอ
 * ใบที่เกิดหลังแท่งท้ายสุดของกราฟ (เช่นตลาดปิดอยู่ ยังไม่มีแท่งใหม่) จึงเกาะแท่งท้ายสุด
 * ซึ่งคือแท่งที่ตลาดเคลื่อนไหวล่าสุดจริง ๆ — ตรงกับที่ตาคนคาดหวัง
 *
 * ผลลัพธ์เรียงตามเวลาแท่งจากเก่าไปใหม่ (ตัววาดกราฟบังคับให้หมุดเรียงเวลาขึ้น
 * ถ้าเรียงผิดมันจะโยน error ทั้งชุด) ใบที่ตกแท่งเดียวกันเรียงตาม created_at จริง
 * เกินเพดาน = ตัด **ของเก่าทิ้ง เก็บของใหม่ไว้** แล้วรายงานยอดที่ตัดออกกลับไปด้วยเสมอ
 */
export function buildSignalMarkerSet(
  signals: readonly MarkerSourceSignal[],
  barTimes: readonly number[],
  opts: BuildMarkerOptions
): ChartMarkerSet {
  const capRaw = opts.cap;
  const cap =
    typeof capRaw === 'number' && Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : MARKER_CAP;
  if (!barTimes.length) return { markers: [], matched: 0, cap, hidden: 0 };

  const wantSymbol = String(opts.symbol ?? '').trim().toUpperCase();
  const viewTf = String(opts.timeframe ?? '').trim().toUpperCase();
  const onlyOpen = opts.include === 'open';
  const firstBar = barTimes[0];

  const out: ChartSignalMarker[] = [];

  for (const s of signals) {
    if (String(s.symbol ?? '').trim().toUpperCase() !== wantSymbol) continue;
    if (s.action !== 'BUY' && s.action !== 'SELL') continue;
    if (onlyOpen && !isLiveSignalRow(s)) continue;

    const createdSec = parseSec(s.created_at);
    if (!Number.isFinite(createdSec)) continue;
    if (createdSec < firstBar) continue; // เก่ากว่าช่วงที่กราฟครอบคลุม

    const entry = price(s.entry_price);
    if (entry === null) continue;

    const idx = findBarIndexAtOrBefore(barTimes, createdSec);
    if (idx < 0) continue; // ผ่านด่าน 6 มาแล้วจึงไม่ควรเกิด แต่ไม่เดาแทน

    const tf = String(s.timeframe ?? '').trim().toUpperCase();
    out.push({
      id: s.id,
      action: s.action,
      time: barTimes[idx],
      createdSec,
      createdAt: s.created_at,
      entry,
      stopLoss: price(s.stop_loss),
      takeProfit: price(s.take_profit),
      strength: String(s.strength ?? '').trim() || 'unknown',
      confidence:
        typeof s.confidence === 'number' && Number.isFinite(s.confidence) ? s.confidence : null,
      costR: typeof s.cost_r === 'number' && Number.isFinite(s.cost_r) ? s.cost_r : null,
      timeframe: tf,
      // กรอบเวลาที่อ่านไม่ออก (แถวเก่าที่ timeframe เป็น NULL) ถือว่าไม่ใช่กรอบนี้
      // ปลอดภัยกว่าเดาว่าใช่ — ผลคือ UI ติดป้ายบอกที่มา ซึ่งไม่มีทางผิดฝั่ง
      foreign: tf !== viewTf,
      status: markerStatusOf(s),
      realizedR: num(s.realized_r),
      exitPrice: price(s.exit_price),
      resolvedAt: text(s.resolved_at),
      // ถือ 0 แท่งเป็นค่าที่ใช้ได้ (ปิดในแท่งเดียวกับที่ออก) แต่ค่าติดลบคือข้อมูลเสีย
      barsHeld:
        typeof s.bars_held === 'number' && Number.isFinite(s.bars_held) && s.bars_held >= 0
          ? s.bars_held
          : null,
    });
  }

  out.sort((a, b) => a.time - b.time || a.createdSec - b.createdSec || (a.id < b.id ? -1 : 1));

  const matched = out.length;
  // เกินเพดาน → เก็บท้ายอาร์เรย์ (ใหม่สุด) ไว้ · ยังเรียงเวลาขึ้นเหมือนเดิม
  const markers = matched > cap ? out.slice(matched - cap) : out;
  return { markers, matched, cap, hidden: matched - markers.length };
}

/**
 * รูปย่อของ buildSignalMarkerSet สำหรับผู้เรียกที่ต้องการแค่รายการหมุด
 * ⚠ ผู้เรียกที่ **แสดงผลให้ผู้ใช้เห็น** ต้องใช้ buildSignalMarkerSet แทน เพื่อจะได้บอกได้ว่า
 *   มีใบไหนถูกตัดออกเพราะเพดานบ้าง — การตัดเงียบ ๆ คือการซ่อนข้อมูลจากเจ้าของ
 */
export function buildSignalMarkers(
  signals: readonly MarkerSourceSignal[],
  barTimes: readonly number[],
  opts: BuildMarkerOptions
): ChartSignalMarker[] {
  return buildSignalMarkerSet(signals, barTimes, opts).markers;
}
