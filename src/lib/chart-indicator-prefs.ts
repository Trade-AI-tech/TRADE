/**
 * chart-indicator-prefs.ts — "ผู้ใช้เปิดเส้นไหนไว้" และการจำค่านั้นข้ามการเปิดหน้าใหม่
 *
 * แยกเป็นโมดูลของตัวเองเพราะสองเหตุผล:
 *   1. ตรรกะการอ่านค่าเก่าที่ "รูปไม่ตรง" (ผู้ใช้เคยเปิดหน้านี้ตอนที่ยังไม่มีตัวเลือกนี้ ·
 *      มีคนแก้ค่าใน localStorage เอง · ค่าเป็นขยะจากเวอร์ชันก่อน) ต้องไม่ทำให้ทั้งหน้าพัง
 *      และต้องทดสอบด้วย node เปล่า ๆ ได้ จึงต้องเป็นฟังก์ชัน pure ที่ไม่แตะ DOM
 *   2. การเขียน/อ่าน localStorage ต้องมี try/catch **ทุกจุด** — Safari โหมดส่วนตัวและ
 *      เบราว์เซอร์ที่ปิดคุกกี้ของเว็บ โยน error ตั้งแต่ตอน "อ่าน" ไม่ใช่แค่ตอนเขียน
 *      (รีโปนี้เจอมาแล้วกับธีม — ดู src/hooks/useStore.ts)
 *
 * ค่าที่เก็บอยู่ในเครื่องของผู้ใช้เท่านั้น ไม่ผูกกับบัญชี ไม่ส่งขึ้นเซิร์ฟเวอร์
 */

/** แผงล่างเปิดได้ทีละหนึ่ง — เหตุผลเรื่องความสูงบนมือถืออยู่ที่ GoldChart.tsx */
export type LowerPaneKey = 'none' | 'rsi' | 'macd';

export interface ChartIndicatorPrefs {
  /** EMA 20 (คีย์ในฐานข้อมูลชื่อ ma20) */
  ma20: boolean;
  /** SMA 50 */
  ma50: boolean;
  /** SMA 200 — ขึ้นเฉพาะเมื่อมีแท่งปิดครบ 200 แท่ง */
  ma200: boolean;
  /** Bollinger Bands 20 / 2sd (บน–กลาง–ล่าง) */
  bb: boolean;
  /** แนวรับ-แนวต้านจากแท่งชุดที่โหลดอยู่ */
  sr: boolean;
  lowerPane: LowerPaneKey;
}

/**
 * ค่าเริ่มต้น — เปิดเท่าที่จำเป็นเพื่อไม่ให้จอมือถือรก
 *
 * ทำไมเลือกชุดนี้ (ทุกตัวเป็นตัวที่ **เครื่องยนต์ใช้ตัดสินจริง** ไม่ใช่ของแถม):
 *   · ma20 + ma50 — เป็นคู่ที่ determineTrend() ใช้เสมอ ทั้งตอนมี MA200 และตอนไม่มี
 *     และกฎเทรนด์คือกฎที่มีน้ำหนักมากที่สุดในเครื่องยนต์ (±2 เมื่อมี MA200 ครบ, ±1 เมื่อไม่มี)
 *   · rsi — เป็นกฎเดียวที่ยิงเหตุผลออกมาบ่อยที่สุดสามแบบ (Oversold / Overbought / Cross 50)
 *     และต้องใช้แผงแยกเพราะสเกล 0-100 อยู่บนแผงราคาไม่ได้
 * ที่ **ปิด** ไว้ตอนแรกและเหตุผล:
 *   · ma200 — ต้องมีแท่งปิดครบ 200 แท่งถึงจะมีเส้น เปิดค้างไว้แล้วผู้ใช้บางคนจะไม่เห็นอะไรเลย
 *     โดยไม่รู้ว่าทำไม (เลน 15m ขอมา ~1,000 แท่งจึงมักครบ แต่ก็มีรอบที่ไม่ครบ)
 *   · bb — สามเส้นพร้อมกันบนจอ 375px ทับแท่งเทียนจนอ่านตัวแท่งไม่ออก
 *   · sr — เป็นเส้นแนวนอนพาดทั้งจอ 6 เส้น รกกว่าทุกตัว และเป็นระดับที่ขึ้นกับหน้าต่างข้อมูล
 *     ที่โหลดอยู่ จึงต้องอ่านคำกำกับก่อนถึงจะตีความถูก — เหมาะเป็นตัวที่ผู้ใช้ "เลือกเปิด"
 *   · macd — แผงล่างเปิดได้ทีละหนึ่ง และ RSI มีประโยชน์กว่าเมื่อดูตัวเดียว
 */
export const DEFAULT_CHART_INDICATOR_PREFS: Readonly<ChartIndicatorPrefs> = {
  ma20: true,
  ma50: true,
  ma200: false,
  bb: false,
  sr: false,
  lowerPane: 'rsi',
};

/** คีย์ใน localStorage — ขึ้นต้นด้วย trading-ai- เหมือนคีย์ธีมของแอป */
export const CHART_PREFS_STORAGE_KEY = 'trading-ai-chart-indicators';

const LOWER_PANES: readonly LowerPaneKey[] = ['none', 'rsi', 'macd'];

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/**
 * อ่านค่าที่เก็บไว้ให้กลายเป็นค่าที่ใช้ได้เสมอ — ช่องไหนอ่านไม่ออกก็ถอยไปใช้ค่าเริ่มต้น
 * ของช่องนั้น **ทีละช่อง** ไม่ใช่ทิ้งทั้งก้อน เพราะการเพิ่มตัวเลือกใหม่ในอนาคตไม่ควร
 * ล้างสิ่งที่ผู้ใช้ตั้งไว้แล้วทิ้งทั้งหมด
 */
export function parseChartIndicatorPrefs(raw: unknown): ChartIndicatorPrefs {
  const d = DEFAULT_CHART_INDICATOR_PREFS;
  let obj: Record<string, unknown> | null = null;

  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      // ข้อความที่ไม่ใช่ JSON (ค่าจากเวอร์ชันก่อน / มีคนแก้เอง) → ใช้ค่าเริ่มต้นทั้งชุด
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }

  if (!obj) return { ...d };

  const pane = obj.lowerPane;
  return {
    ma20: bool(obj.ma20, d.ma20),
    ma50: bool(obj.ma50, d.ma50),
    ma200: bool(obj.ma200, d.ma200),
    bb: bool(obj.bb, d.bb),
    sr: bool(obj.sr, d.sr),
    lowerPane: LOWER_PANES.includes(pane as LowerPaneKey) ? (pane as LowerPaneKey) : d.lowerPane,
  };
}

/** อ่านจากเครื่องผู้ใช้ — อ่านไม่ได้ด้วยเหตุผลใดก็ตาม = ใช้ค่าเริ่มต้น ไม่ใช่พัง */
export function loadChartIndicatorPrefs(): ChartIndicatorPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_CHART_INDICATOR_PREFS };
  try {
    return parseChartIndicatorPrefs(window.localStorage.getItem(CHART_PREFS_STORAGE_KEY));
  } catch {
    // โหมดส่วนตัวของ Safari โยนตั้งแต่ตอนแตะ localStorage — ไม่ใช่เหตุให้หน้ากราฟพัง
    return { ...DEFAULT_CHART_INDICATOR_PREFS };
  }
}

/** เขียนกลับ — เขียนไม่ได้ก็แค่ "เปิดใหม่แล้วจำไม่ได้" ห้ามให้ทั้งหน้าล้ม */
export function saveChartIndicatorPrefs(prefs: ChartIndicatorPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHART_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // เจตนาเงียบ: การจำค่าไว้เป็นของแถม ไม่ใช่หน้าที่หลักของหน้านี้
  }
}
