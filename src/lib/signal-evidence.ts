import rawEvidence from './signal-evidence.data.json';

/**
 * signal-evidence.ts — ตัวอ่าน "หลักฐานย้อนหลัง" ของเซ็ตอัพสัญญาณ
 *
 * ═══ ข้อบังคับความซื่อสัตย์ — อ่านก่อนเอาตัวเลขไปแสดงที่ไหนก็ตาม ═══════════════
 *
 * ตัวเลขจากไฟล์นี้คือ "ความถี่ในอดีต" ของเรขาคณิต SL/TP แบบเดียวกัน
 * (เมื่อเครื่องยนต์จริงยิงเซ็ตอัพแบบนี้ในประวัติ ราคาไป TP ก่อนกี่ %, โดน SL ก่อนกี่ %,
 * หมดเวลากี่ %) — **ไม่ใช่การพยากรณ์** และไม่ใช่คุณสมบัติของสัญญาณใบปัจจุบัน
 *
 * งานวิจัยของ repo นี้วัดแล้ววัดอีก: ไม่มีอินดิเคเตอร์/เซ็ตอัพไหนพิสูจน์ได้ว่ามี edge
 * หลังหักต้นทุน ความถี่ในอดีตจึงห้ามถูกแต่งหน้าเป็นคำสัญญา — ทุก string ที่ผู้ใช้เห็น
 * ต้องพูดในรูป "ในอดีต...%" เท่านั้น ห้ามใช้คำว่า "โอกาสชนะ" หรือ "ความแม่น"
 * (สองคำนั้นอ้างอนาคต ซึ่งข้อมูลนี้ไม่รองรับ — scripts/test-signal-evidence.mjs
 * grep ไฟล์ UI ที่ import ตัวอ่านนี้จริง ๆ เพื่อบังคับกติกานี้ใน CI)
 *
 * ═══ ที่มาของข้อมูล ═══════════════════════════════════════════════════════════
 *
 * สร้างโดย scripts/research/build-signal-evidence.mjs — เดินประวัติ "เต็มช่วงแคช"
 * (รวมช่วง test ของงานวิจัย โดยติดป้ายไว้แล้วในไฟล์ข้อมูล) ด้วยเครื่องยนต์จริง
 * ผ่านประตูจริง แล้วเดินไม้ด้วย SL/TP ของสัญญาณจริง · เฉพาะเซลล์ n >= 30 เท่านั้น
 * ที่ถูกส่งมาไฟล์นี้ — เซลล์เล็กกว่านั้นความถี่แกว่งแรงเกินกว่าจะโชว์
 *
 * ═══ ชั้น fallback ═══════════════════════════════════════════════════════════
 *
 *   1. symbol    : (symbol, timeframe, action, strength) — จำเพาะที่สุด
 *   2. timeframe : (timeframe, action, strength) รวมทุก symbol
 *   3. global    : (timeframe, action) รวมทั้งหมด
 * ไม่มีชั้นไหนถึงเกณฑ์ → คืน null แล้ว UI ต้องไม่แสดงบล็อกนี้เลย (ห้ามเดา)
 *
 * 15m ไม่มีประวัติ (Yahoo ให้ย้อนหลังแค่ 1 เดือน) — ทุกชั้นจะถอยไปอ่านข้อมูลของ 1H
 * และผลลัพธ์แบก sourceTimeframe: '1H' ให้ UI วงเล็บบอกผู้ใช้ตรง ๆ ว่าเป็นค่าประมาณ
 * จากกรอบ 1 ชั่วโมง ไม่ใช่ของ 15m เอง
 */

export interface SignalEvidence {
  /** จำนวนไม้ในอดีตที่เซลล์นี้สรุปมา */
  n: number;
  /** สัดส่วนไม้ที่ราคาไปถึง TP ก่อน (0..1) */
  tpFirstPct: number;
  /** สัดส่วนไม้ที่ราคาโดน SL ก่อน (0..1) — แท่งเดียวแตะทั้งคู่นับเป็น SL (อนุรักษ์นิยม) */
  slFirstPct: number;
  /** สัดส่วนไม้ที่ถือจนครบเพดานเวลาแล้วปิดที่ราคาตลาด (0..1) */
  timeoutPct: number;
  /** ชั้นที่คำตอบมาจริง — ยิ่งถอยชั้นยิ่งจำเพาะน้อยลง UI ควรบอกเมื่อไม่ใช่ 'symbol' */
  level: 'symbol' | 'timeframe' | 'global';
  /** กรอบเวลาของข้อมูลจริง — ต่างจาก timeframe ที่ขอเมื่อขอ 15m (ได้ 1H) */
  sourceTimeframe: string;
  /** ช่วงปี ค.ศ. ของไม้ในเซลล์ เช่น "2003–2026" */
  spanYears: string;
  /** R สุทธิเฉลี่ยต่อไม้ (หลังหักค่าประมาณต้นทุน) — ติดลบได้และมักติดลบ */
  meanR: number;
  /** จำนวนแท่งกลางที่ถือจนจบ */
  medianBarsHeld: number;
}

interface RawCell {
  n: number;
  tpFirstPct: number;
  slFirstPct: number;
  timeoutPct: number;
  meanR: number;
  medianBarsHeld: number;
  spanYears: string;
  sourceTimeframe: string;
}

interface EvidenceFile {
  generatedAt: string;
  note: string;
  minN: number;
  cells: {
    symbol: Record<string, RawCell>;
    timeframe: Record<string, RawCell>;
    global: Record<string, RawCell>;
  };
}

// ไฟล์ JSON ใหญ่เกินกว่าที่ TS จะ infer literal type อย่างมีประโยชน์ — cast ผ่าน
// โครงสร้างแคบ ๆ ที่โค้ดนี้อ่านจริง (แบบเดียวกับ speed-scorecard.ts)
const DATA = rawEvidence as unknown as EvidenceFile;

/**
 * timeframe ที่ขอ → timeframe ของข้อมูล
 * 15m ไม่มีประวัติให้เดิน จึงตอบด้วยข้อมูล 1H — ผู้เรียกรู้ได้จาก sourceTimeframe
 * ที่ติดมากับผลลัพธ์เสมอ ไม่มีการแอบเนียน
 */
function dataTimeframeFor(timeframe: string): string | null {
  const tf = String(timeframe ?? '').trim();
  if (/^15m$/i.test(tf)) return '1H';
  if (/^1h$/i.test(tf)) return '1H';
  if (/^1d$/i.test(tf)) return '1D';
  return null; // กรอบเวลาที่ไม่รู้จัก — ไม่เดา
}

/** เซลล์ต้องมีเลขครบและ n ถึงเกณฑ์ — ไฟล์ข้อมูลถูกกรองมาแล้ว แต่กันไฟล์เพี้ยนอีกชั้น */
function usable(cell: RawCell | undefined): cell is RawCell {
  return !!cell
    && Number.isFinite(cell.n) && cell.n >= (DATA.minN ?? 30)
    && Number.isFinite(cell.tpFirstPct)
    && Number.isFinite(cell.slFirstPct)
    && Number.isFinite(cell.timeoutPct);
}

/**
 * หา "ความถี่ในอดีต" ของเซ็ตอัพแบบเดียวกับสัญญาณนี้ — เดินชั้น fallback จากจำเพาะสุด
 * ไปกว้างสุด แล้วคืนชั้นแรกที่มีข้อมูลถึงเกณฑ์ · ไม่มีเลย = null (UI ต้องไม่แสดงอะไร)
 */
export function lookupEvidence(
  symbol: string,
  timeframe: string,
  action: string,
  strength: string
): SignalEvidence | null {
  // ตารางมีเฉพาะไม้ที่มีทิศทาง — HOLD/CLOSE ไม่มีเรขาคณิต SL/TP ให้เทียบ
  if (action !== 'BUY' && action !== 'SELL') return null;

  const tf = dataTimeframeFor(timeframe);
  if (!tf) return null;
  const sym = String(symbol ?? '').trim().toUpperCase();
  const cells = DATA.cells;
  if (!cells) return null;

  const attempts: Array<{ level: SignalEvidence['level']; cell: RawCell | undefined }> = [
    { level: 'symbol', cell: cells.symbol?.[`${sym}|${tf}|${action}|${strength}`] },
    { level: 'timeframe', cell: cells.timeframe?.[`${tf}|${action}|${strength}`] },
    { level: 'global', cell: cells.global?.[`${tf}|${action}`] },
  ];

  for (const { level, cell } of attempts) {
    if (!usable(cell)) continue;
    return {
      n: cell.n,
      tpFirstPct: cell.tpFirstPct,
      slFirstPct: cell.slFirstPct,
      timeoutPct: cell.timeoutPct,
      level,
      sourceTimeframe: cell.sourceTimeframe,
      spanYears: cell.spanYears,
      meanR: cell.meanR,
      medianBarsHeld: cell.medianBarsHeld,
    };
  }
  return null;
}
