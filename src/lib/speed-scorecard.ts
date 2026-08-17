import type { MarketType } from '@/types';
import rawScorecard from './speed-scorecard.client.json';

/**
 * speed-scorecard.ts — ตัวอ่าน "คู่ไหนจบเร็ว" ที่วัดมาแล้วจริง
 *
 * ═══ สร้างข้อมูลใหม่ยังไง ═══════════════════════════════════════════════════
 *   1) node scripts/build-speed-scorecard.mjs            (ใช้เวลา ~2 นาที)
 *      เขียนทับ speed-scorecard.data.json (ก้อนใหญ่ ฝั่ง server/สคริปต์)
 *      และ speed-scorecard.evidence.json (หลักฐานเต็ม ห้าม import — มีไว้เปิดอ่านด้วยตา)
 *   2) node src/lib/speed-scorecard.client.build.mjs     (ใช้เวลาไม่ถึงวินาที)
 *      ย่อก้อนใหญ่ → speed-scorecard.client.json ซึ่งคือไฟล์ที่โมดูลนี้ import
 *   3) node src/lib/speed-scorecard.client.build.mjs --check
 *      พิสูจน์ว่าก้อนย่อยังตรงกับก้อนใหญ่ และ speedScore() ให้ผลเท่ากันทุกเคส
 * ข้ามข้อ 2 = หน้าเว็บยังใช้ตัวเลขชุดเก่าเงียบ ๆ · ข้อ 3 คือสิ่งเดียวที่จับเรื่องนี้ได้
 * ข้อมูลเก่าลงทุกวัน เช็ค scorecardAgeDays() ก่อนเชื่อเสมอ
 *
 * ═══ ทำไมข้อมูลถึงแยกเป็นสองก้อน ════════════════════════════════════════════
 * หน้า /signals เป็น client component และมันดึงโมดูลนี้เข้าไป webpack จึงยัด
 * ไฟล์ที่โมดูลนี้ import ลง chunk ของหน้าเว็บทั้งก้อน
 * วัดด้วย next build จริง สองรอบบนโค้ดชุดเดียวกัน ต่างกันแค่ไฟล์ที่ import:
 *   import ก้อนใหญ่  chunk 119,359 ไบต์ (gzip 23,900) · JSON.parse ก้อนเดียว 96,965 ไบต์
 *   import ก้อนย่อ   chunk  45,990 ไบต์ (gzip 10,427) · JSON.parse ก้อนเดียว 25,762 ไบต์
 * = ผู้ใช้โหลดน้อยลง 13,473 ไบต์หลัง gzip ทุกครั้งที่เปิดหน้า /signals
 * ทั้งที่ตัวอ่านนี้แตะข้อมูลไม่ถึงหนึ่งในห้า (winRate · profitFactor · exitShare ·
 * bars · firstBar/lastBar · ตัวเลข gated รายคู่ ไม่มีบรรทัดไหนในไฟล์นี้อ่านเลย)
 * ก้อนย่อจึงมีเฉพาะช่องที่โค้ดข้างล่างนี้อ่านจริง และเป็น "ซับเซ็ตเชิงโครงสร้าง"
 * ของก้อนใหญ่ — เส้นทางคีย์เหมือนกันเป๊ะ ต่างแค่มีช่องน้อยกว่า
 * ผลคือตัวอ่านตัวเดียวกันรันกับก้อนไหนก็ได้ผลเท่ากัน ซึ่ง --check พิสูจน์ให้ทุกครั้ง
 * ใครอยากได้แถวเต็ม (winRate/exitShare/gated รายคู่) ใช้ speed-scorecard.full.ts
 * ซึ่งเป็นฝั่ง server/สคริปต์เท่านั้น ห้าม import จาก client component
 *
 * ═══ คำถามของเจ้าของ และคำตอบที่วัดได้จริง ═════════════════════════════════
 * เจ้าของสั่งว่า "เรียงลำดับตัวที่ได้กำไรจบภายใน 1 ชั่วโมงให้ผมด้วย"
 * เราวัดจริงด้วย runBacktest ตัวจริง (walk-forward, ไม่มี look-ahead, maxHoldBars = 6)
 * แล้วได้คำตอบสามข้อ ซึ่งข้อที่สองกับสามขัดกับสิ่งที่เจ้าของคาดหวัง
 *
 * ── ข้อ 1: "จบใน 1 ชั่วโมง" เกิดขึ้นน้อยมากในแจ้งเตือนจริง ──────────────────
 * ต้องแยกสองประชากรให้ขาด เพราะตัวเลขต่างกันคนละเรื่อง:
 *   "สัญญาณดิบ"    = ทุกอันที่ generateSignal ยิงออกมา (22,333 ไม้บน 1H)
 *   "ผ่านประตู"    = เฉพาะที่ผ่าน SIGNAL_GATE = สิ่งที่เจ้าของได้รับแจ้งเตือนจริง (2,138 ไม้)
 *
 *   บน 1H (K = จำนวนแท่งที่ไม้กินไป · K=1 คือจบภายใน 1 ชั่วโมงจริง):
 *              สัญญาณดิบ            ผ่านประตู (ของจริงที่เจ้าของเห็น)
 *     K=1      TP 7.0% / SL 3.3%    TP  1.1% / SL  7.5%   ← R ที่รับรู้จริง −0.048
 *     K=2      TP 9.9% / SL 6.8%    TP  3.2% / SL 16.0%   ← R −0.096
 *     K=3      TP 12.4% / SL 9.8%   TP  6.2% / SL 22.0%   ← R −0.082
 *     K=6      TP 18.7% / SL 16.6%  TP 12.7% / SL 36.1%   ← R +0.072
 *
 *   อ่านบรรทัด K=1 ของคอลัมน์ "ผ่านประตู" ให้ตรง: ในการแจ้งเตือน 100 ครั้ง
 *   มีราว 1 ครั้งเท่านั้นที่ปิดกำไรจบภายในชั่วโมงนั้น และมีราว 7 ครั้งที่โดน SL ก่อน
 *   บน 1D ยิ่งหนักกว่า: จบกำไรใน 1 แท่งแค่ 0.5%
 *
 * ── ข้อ 2: กรอบเวลาที่เร็ว คือกรอบที่ระบบขาดทุน ────────────────────────────
 * สังเกตคอลัมน์ R: ติดลบที่ K=1, 2, 3 แล้วพลิกเป็นบวกที่ K=6 เท่านั้น
 * สาเหตุเชิงโครงสร้าง ไม่ใช่ความบังเอิญ และมันคือผลข้างเคียงของประตูคุณภาพเอง:
 *   SIGNAL_GATE บังคับ minRiskReward = 1.5 → สัญญาณที่ผ่านต้องมี TP ไกลกว่า SL
 *   อย่างน้อย 1.5 เท่าเสมอ (ส่วนใหญ่มาจากสูตรสำรอง ATR: TP 3×ATR / SL 1.5×ATR)
 *   แปลว่า "ของที่ผ่านประตู" คือของที่ SL อยู่ใกล้กว่า TP โดยนิยาม
 *   → ราคาไปแตะ SL ก่อนเป็นเรื่องปกติ ไม้ที่จบเร็วจึงเอนไปทางไม้ที่แพ้อย่างเป็นระบบ
 *
 *   ⚠ นี่คือความขัดแย้งที่แก้ด้วยการจัดอันดับไม่ได้: "RR สูง" กับ "จบไว" เป็นสิ่งที่
 *     ตรงข้ามกันในเชิงเรขาคณิต เป้าที่ไกลกว่าย่อมใช้เวลานานกว่าจะไปถึง
 *     ถ้าอยากได้ไม้ที่จบใน 1 ชั่วโมงจริง ๆ ต้องลด minRiskReward ลง ซึ่งจะทำให้
 *     กำไรต่อไม้แย่ลง (สัญญาณดิบที่ RR ต่ำมี avgR +0.008 ส่วนที่ผ่านประตูมี +0.072)
 *     เป็นการแลก ไม่ใช่การปรับปรุง — คนตัดสินใจต้องเป็นเจ้าของ ไม่ใช่โค้ดนี้
 *
 * ── ข้อ 3: จัดอันดับด้วย "ความเร็ว" ได้ · ด้วย "ผลกำไรย้อนหลัง" ไม่ได้ ──────
 * วิธีตรวจ: แบ่งด้วยวันที่จริง (70% แรก = train / 30% ท้าย = test) จัดอันดับด้วย train
 * แล้ววัดว่าอันดับยังใช้ได้ใน test ไหม ตัดสินด้วยการสับไพ่ 10,000 ครั้ง (permutation
 * test) ไม่ใช่เกณฑ์ที่ตั้งเอาเอง เพราะการคัด 10 ตัวที่ดีที่สุดจาก 57 ตัว ยังไงก็ต้องมี
 * ตัวที่ตัวเลขสวยด้วยความบังเอิญ
 *
 *   1H · ความเร็ว (P ถึง TP ใน 2 แท่ง): ✅ รอด
 *        test: top10 0.150 vs ทุกคู่ 0.104 vs bottom10 0.028
 *        p(lift) = 0.008 · Spearman train↔test = 0.775 (p = 0.0001)
 *        → "คู่ไหนจบเร็ว" เป็นคุณสมบัติที่ติดตัวสินทรัพย์ ไม่ใช่โชค ใช้จัดอันดับได้
 *
 *   1H · ผลกำไร (avgR): ❌ ไม่รอด — และกลับหัวด้วย
 *        test: top10 −0.022 vs ทุกคู่ +0.027 vs bottom10 +0.065
 *        p(lift) = 0.91 · Spearman = −0.111 (p = 0.80)
 *        → คู่ที่ทำเงินดีสุดในช่วง train กลายเป็นกลุ่มขาดทุนในช่วง test ส่วนกลุ่มที่แย่สุด
 *          กลับทำได้ดีสุด การเลือกจาก "ผลงานย้อนหลังดี" ไม่ใช่แค่ไม่ช่วย แต่ทำร้ายพอร์ต
 *
 *   1D · ทั้งความเร็วและผลกำไร: ❌ ไม่รอดทั้งคู่ (ความเร็ว p(lift) = 0.072)
 *        → บน 1D ห้ามใช้ตัวเลขรายคู่ ต้องถอยไปใช้ค่ากลางของกลุ่มเท่านั้น
 *
 * ผลตรวจนี้ไม่ได้ hardcode ไว้ — โมดูลนี้อ่าน readerPolicy จากไฟล์ข้อมูล
 * วันที่ใครรันสร้างใหม่แล้วผลพลิก พฤติกรรมของ speedScore() จะเปลี่ยนตามเองทันที
 *
 * ═══ สิ่งที่โมดูลนี้ "ไม่ได้" บอก — อ่านก่อนใช้ ═════════════════════════════
 * - ไม่ได้บอกว่าสัญญาณไหนจะกำไร บอกแค่ว่าคู่ไหน "มักจบเร็ว" ในอดีต
 * - ไม่ดูสัญญาณตรงหน้าเลย (ไม่ดู RR / ความแรง / ราคา ของอันนั้น) ดูแค่ว่าเป็นคู่ไหน
 *   timeframe ไหน ตั้งใจให้เป็น "หนึ่งปัจจัย" ผู้จัดอันดับต้องผสม RR + ความแรง +
 *   ความสดของสัญญาณเข้าไปเอง
 * - คะแนนอันดับ (score) คำนวณจากประชากร "สัญญาณดิบ" เพราะประชากร "ผ่านประตู"
 *   มีไม้ต่อคู่น้อยเกินจะวัดรายคู่ได้ (มัธยฐาน 21 ไม้/คู่ · ถึงเกณฑ์ 30 แค่ 15 จาก 57 คู่)
 *   เราจึงยังพิสูจน์ไม่ได้ว่าอันดับความเร็วที่รอด out-of-sample บนสัญญาณดิบ
 *   จะรอดบนสัญญาณที่ผ่านประตูด้วย — ใช้เป็นการเรียงคร่าว ๆ ได้ แต่ห้ามอ้างว่าพิสูจน์แล้ว
 *   ส่วนตัวเลขในช่อง gated เป็นค่ารวมกอง ซึ่งวัดได้จริงและเชื่อได้ในระดับ "ค่ากลาง"
 * - ตัวเลขทั้งหมดยังไม่หักสเปรด/ค่าคอม/สลิปเพจ ของจริงแย่กว่านี้ทุกช่อง
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. รูปร่างของไฟล์ข้อมูล
// ═══════════════════════════════════════════════════════════════════════════

/** ค่าที่วัดรายระดับ K — คีย์เป็นสตริงเพราะมาจาก JSON ("1" | "2" | "3" | "6") */
export type ByK = Record<string, number>;

/**
 * แถวรายคู่ "เท่าที่ตัวอ่านนี้ใช้จริง" — คือทั้งหมดที่ก้อนย่อฝั่งเบราว์เซอร์มี
 * ⚠ pTpWithin / realizedRWithin ในก้อนย่อมีแค่คีย์ "2" (ระดับ K ที่สอบผ่าน out-of-sample)
 *   อ่านคีย์อื่นจะได้ undefined — ถ้าวันหนึ่งต้องใช้ K อื่นจริง ต้องไปเพิ่มใน
 *   projectClient() ของ speed-scorecard.client.build.mjs แล้วสร้างก้อนย่อใหม่
 */
export interface ScorecardPairLite {
  symbol: string;
  market: MarketType;
  timeframe: string;
  /** จำนวนไม้ที่ใช้วัดแถวนี้ (ประชากรสัญญาณดิบ) = ขนาดกลุ่มตัวอย่าง */
  trades: number;
  /** trades >= minReliableTrades — false แปลว่าตัวเลขแถวนี้ไม่มีความหมายทางสถิติ */
  reliable: boolean;
  /** มัธยฐานจำนวนแท่งของ "ไม้ที่ชนะ" — หน้า /signals ใช้ตัวนี้เรียง "จบเร็วที่สุด" */
  medianHoldBarsWin: number | null;
  /** P(ถึง TP ก่อนโดน SL ภายใน K แท่ง) */
  pTpWithin: ByK;
  /** R เฉลี่ยต่อสัญญาณที่ "รับรู้จริงแล้ว" ณ แท่งที่ K (ไม้ที่ยังไม่จบนับเป็น 0) */
  realizedRWithin: ByK;
}

/**
 * แถวรายคู่แบบเต็มใน speed-scorecard.data.json — มีเฉพาะฝั่ง server/สคริปต์
 * อ่านผ่าน speed-scorecard.full.ts เท่านั้น (ก้อนใหญ่ห้ามหลุดเข้า bundle เบราว์เซอร์)
 */
export interface ScorecardPair extends ScorecardPairLite {
  name: string;
  /** วันที่วัดแถวนี้ — ติดมากับทุกแถว เพื่อให้แถวที่ถูกคัดลอกออกไปยังบอกอายุตัวเองได้ */
  measuredAt: string;
  bars: number;
  firstBar: string;
  lastBar: string;
  winRate: number | null;
  avgR: number | null;
  profitFactor: number | null;
  /** P(โดน SL ก่อนถึง TP ภายใน K แท่ง) */
  pSlWithin: ByK;
  exitShare: Record<string, number>;
  /** ไม้เฉพาะที่ผ่าน SIGNAL_GATE — มักน้อยกว่า 30 ต่อคู่ ห้ามอ่านรายคู่ ให้ใช้ค่ารวมกอง */
  gatedTrades: number;
  gatedWinRate: number | null;
  gatedAvgR: number | null;
  gatedPTpWithin: ByK;
  gatedRealizedRWithin: ByK;
}

/** แถวรวมกองเท่าที่ตัวอ่านใช้ — เก็บเส้นโค้ง K ครบทุกระดับเพราะมีแค่ 24 แถว ไม่กินที่ */
export interface ScorecardPooledLite {
  trades: number;
  pTpWithin: ByK;
  pSlWithin: ByK;
  realizedRWithin: ByK;
}

export interface ScorecardPooled extends ScorecardPooledLite {
  pairs: number;
  winRate: number | null;
  avgR: number | null;
  medianHoldBarsWin: number | null;
}

export interface ReaderPolicy {
  /** ใช้ตัวเลขความเร็วรายคู่จัดอันดับได้ไหม (จริงเมื่อสอบผ่าน out-of-sample เท่านั้น) */
  usePerPairSpeed: boolean;
  /** ใช้ผลกำไรรายคู่จัดอันดับได้ไหม — วัดแล้วเป็น false ทุก timeframe */
  usePerPairProfit: boolean;
  /** timeframe นี้ตอบคำถาม "จบใน 1 ชั่วโมง" ได้ไหม (1D ตอบไม่ได้ หนึ่งแท่งคือหนึ่งวัน) */
  speedMeasurable: boolean;
}

export interface ValidationSummaryEntry {
  verdict: string;
  trustPerPairSpeed: boolean;
  trustPerPairProfit: boolean;
  usablePairs: number;
  note: string;
}

/**
 * รูปร่างของ speed-scorecard.client.json = "ทุกช่องที่ตัวอ่านนี้อ่าน ไม่มีช่องเกิน"
 * ทุกช่องที่เพิ่มเข้ามาตรงนี้ ผู้ใช้ต้องโหลดผ่านเน็ตจริงทุกครั้งที่เปิดหน้า /signals
 * เพิ่มเมื่อมีโค้ดข้างล่างอ่านมันจริงเท่านั้น แล้วต้องไปเพิ่มใน projectClient()
 * ของ speed-scorecard.client.build.mjs ให้ตรงกันด้วย ไม่งั้น --check จะแดง
 */
export interface SpeedScorecardClientFile {
  schemaVersion: number;
  measuredAt: string;
  rebuildCommand: string;
  method: {
    maxHoldBars: number;
    minReliableTrades: number;
    barMinutesByTimeframe: Record<string, number>;
    caveats: string[];
  };
  readerPolicy: Record<string, ReaderPolicy>;
  scoreReference: Record<string, { metric: string; sortedValues: number[] }>;
  validationSummary: Record<string, ValidationSummaryEntry>;
  pooled: {
    byMarketTimeframe: Record<string, ScorecardPooledLite>;
    byTimeframe: Record<string, ScorecardPooledLite>;
    /** ค่ารวมกองของ "เฉพาะที่ผ่านประตู" = ประชากรที่เจ้าของได้รับแจ้งเตือนจริง */
    gatedByMarketTimeframe: Record<string, ScorecardPooledLite>;
    gatedByTimeframe: Record<string, ScorecardPooledLite>;
  };
  pairs: ScorecardPairLite[];
}

/**
 * รูปร่างของ speed-scorecard.data.json (ก้อนใหญ่) — ประกาศไว้ที่นี่เพราะเป็นสัญญาเดียวกัน
 * แต่ตัวไฟล์ถูก import จาก speed-scorecard.full.ts เท่านั้น ห้ามที่นี่
 *
 * คำว่า `extends SpeedScorecardClientFile` ตรงนี้ไม่ใช่แค่ประหยัดการพิมพ์ — มันคือ
 * ตัวบังคับตอนคอมไพล์ว่า "ก้อนใหญ่ต้องครอบก้อนย่อได้เสมอ" ซึ่งเป็นสมมติฐานที่ทั้งเรื่อง
 * ยืนอยู่บนมัน (ตัวอ่านตัวเดียวรันกับก้อนไหนก็ต้องได้ผลเท่ากัน)
 * วันไหนมีคนแก้ชนิดจนก้อนใหญ่ไม่ครอบก้อนย่อ tsc จะฟ้องที่บรรทัดนี้ก่อนใครเจอตอนรัน
 * ส่วนการพิสูจน์ตอนรันอยู่ที่ speed-scorecard.client.build.mjs --check
 */
export interface SpeedScorecardFile extends SpeedScorecardClientFile {
  generator: string;
  evidenceFile: string;
  method: SpeedScorecardClientFile['method'] & {
    engine: string;
    feesR: number;
    kMeaning: string;
    testFraction: number;
    windowDaysByTimeframe: Record<string, number>;
    speedMeasurableByTimeframe: Record<string, boolean>;
  };
  pooled: {
    byMarketTimeframe: Record<string, ScorecardPooled>;
    byTimeframe: Record<string, ScorecardPooled>;
    gatedByMarketTimeframe: Record<string, ScorecardPooled>;
    gatedByTimeframe: Record<string, ScorecardPooled>;
  };
  pairs: ScorecardPair[];
  unmeasured: Array<{ symbol: string; market: string; timeframe: string; bars: number; fetched: boolean }>;
}

/**
 * JSON ที่ import เข้ามา TypeScript จะเดาชนิดจากค่าที่บังเอิญอยู่ในไฟล์วันนั้น
 * (เช่น winRate เป็น number เพราะไม่มีแถวไหนเป็น null) พอสร้างไฟล์ใหม่แล้วมี null
 * โผล่มา ชนิดจะเปลี่ยนเงียบ ๆ แล้วโค้ดที่ยังคอมไพล์ผ่านจะพังตอนรัน
 * cast ผ่าน unknown ครั้งเดียวตรงนี้ เพื่อผูกทั้งไฟล์ไว้กับสัญญาที่เราประกาศเอง
 */
const DATA = rawScorecard as unknown as SpeedScorecardClientFile;

// ═══════════════════════════════════════════════════════════════════════════
// 2. ค่าคงที่ที่ผู้เรียกควรแสดงให้ผู้ใช้เห็น
// ═══════════════════════════════════════════════════════════════════════════

export const SCORECARD_MEASURED_AT = DATA.measuredAt;
export const SCORECARD_REBUILD_COMMAND = DATA.rebuildCommand;
export const SCORECARD_MAX_HOLD_BARS = DATA.method.maxHoldBars;
export const SCORECARD_MIN_RELIABLE_TRADES = DATA.method.minReliableTrades;
/** ข้อจำกัดที่ต้องบอกผู้ใช้ก่อนให้เขาเชื่อตัวเลข — ผู้เรียกควรแสดงอย่างน้อยข้อแรก */
export const SCORECARD_CAVEATS: readonly string[] = DATA.method.caveats;

/** อายุข้อมูลเป็นวัน — เกิน 30 วันควรสร้างใหม่ก่อนใช้ตัดสินใจอะไรจริงจัง */
export function scorecardAgeDays(now: Date = new Date()): number {
  const ms = now.getTime() - Date.parse(DATA.measuredAt);
  return Number.isFinite(ms) ? ms / 86400000 : Number.POSITIVE_INFINITY;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ฟังก์ชันหลัก
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ที่มาของคะแนน — ผู้เรียกต้องแยกออกว่ากำลังดูของจริงหรือของถอยหลัง
 *   'pair'      ตัวเลขของคู่นี้เอง วัดจากไม้ของมันจริง ๆ (เชื่อได้มากสุด)
 *   'market'    ค่ากลางของตลาด+timeframe เดียวกัน (คู่นี้ไม้ไม่พอ หรืออันดับรายคู่สอบไม่ผ่าน)
 *   'timeframe' ค่ากลางของทั้ง timeframe (ไม่มีข้อมูลระดับตลาดด้วยซ้ำ)
 *   'none'      ไม่มีข้อมูลอะไรเลย คะแนนที่คืนคือค่ากลาง 50 ซึ่งไม่ได้แปลว่าอะไร
 */
export type SpeedBasis = 'pair' | 'market' | 'timeframe' | 'none';

/** อินพุตขั้นต่ำ — Signal เต็ม ๆ ใส่เข้ามาได้เลยเพราะมีครบสามช่องนี้อยู่แล้ว */
export interface SpeedScoreInput {
  symbol: string;
  market: MarketType;
  timeframe: string;
}

/**
 * ตัวเลขของ "ประชากรที่ผ่านประตู" = สิ่งที่เจ้าของได้รับแจ้งเตือนจริง
 * เป็นค่ารวมกองเสมอ ไม่มีระดับ 'pair' เพราะไม้ต่อคู่น้อยเกินไป (มัธยฐาน 21 ไม้)
 */
export interface GatedSpeedStats {
  basis: 'market' | 'timeframe' | 'none';
  sampleSize: number;
  /** โอกาสปิดกำไรจบภายใน 1 แท่ง — บน 1H คือ "จบใน 1 ชั่วโมง" ตามที่เจ้าของถามเป๊ะ */
  pTpWithin1: number | null;
  pSlWithin1: number | null;
  pTpWithin2: number | null;
  pSlWithin2: number | null;
  /** R ที่รับรู้จริงภายใน 2 แท่ง — วัดได้ติดลบ */
  expectedRWithin2: number | null;
  /** R ที่รับรู้จริงภายใน 6 แท่ง — จุดที่ค่าคาดหวังพลิกเป็นบวก */
  expectedRWithin6: number | null;
}

export interface SpeedScoreResult {
  /**
   * 0–100 = เปอร์เซ็นไทล์ของ "ความน่าจะเป็นที่จะถึง TP ภายใน 2 แท่ง"
   * เทียบกับคู่อื่นทั้งหมดใน timeframe เดียวกัน
   * 90 = เร็วกว่า 90% ของคู่ที่วัดได้ · ไม่ได้แปลว่าโอกาสกำไร 90%
   */
  score: number;
  basis: SpeedBasis;
  /** จำนวนไม้ที่คะแนนนี้วัดมาจาก — basis 'none' คือ 0 */
  sampleSize: number;
  measuredAt: string;
  /** P(ถึง TP ก่อน SL ภายใน 2 แท่ง) ของประชากรสัญญาณดิบ — null เมื่อไม่มีข้อมูล */
  pTpWithin2: number | null;
  /** R ที่รับรู้จริงภายใน 2 แท่ง ของประชากรสัญญาณดิบ */
  expectedRWithin2: number | null;
  /**
   * ตัวเลขของแจ้งเตือนจริง (ผ่านประตูแล้ว) — นี่คือชุดที่ควรเอาไปแสดงให้เจ้าของเห็น
   * ห้ามแสดงแต่ score เปล่า ๆ เพราะ score บอกแค่ "เร็วกว่าตัวอื่น" ไม่ได้บอกว่าคุ้ม
   */
  gated: GatedSpeedStats;
  /** กรอบเวลาของ 1 แท่งคิดเป็นนาที (1H = 60 · 1D = 1,440) */
  barMinutes: number | null;
  /** timeframe นี้ตอบคำถาม "จบใน 1 ชั่วโมง" ได้ไหม */
  speedMeasurable: boolean;
  /** ข้อความไทยที่ควรแสดงคู่กับคะแนน — ปกติมีอย่างน้อยหนึ่งข้อ */
  warnings: string[];
}

const keyOf = (symbol: string, market: string, timeframe: string) =>
  `${symbol.trim().toUpperCase()}|${market.trim().toUpperCase()}|${timeframe.trim().toUpperCase()}`;

/** ดัชนีคู่ สร้างครั้งเดียวตอนโหลดโมดูล — ไม่ต้องไล่หาในอาเรย์ทุกครั้งที่จัดอันดับ */
const PAIR_INDEX: Map<string, ScorecardPairLite> = new Map(
  DATA.pairs.map((p) => [keyOf(p.symbol, p.market, p.timeframe), p])
);

/**
 * แถวของคู่หนึ่งเท่าที่ก้อนย่อมี — null เมื่อไม่เคยวัดคู่นี้
 * อยากได้แถวเต็ม (winRate · profitFactor · exitShare · gated รายคู่) ต้องใช้
 * scorecardPairFull() จาก speed-scorecard.full.ts ซึ่งเป็นฝั่ง server/สคริปต์เท่านั้น
 */
export function scorecardPair(input: SpeedScoreInput): ScorecardPairLite | null {
  return PAIR_INDEX.get(keyOf(input.symbol, input.market, input.timeframe)) ?? null;
}

/**
 * แปลงค่าดิบเป็นเปอร์เซ็นไทล์ 0–100 เทียบกับการกระจายของ timeframe นั้น
 * ใช้ "สัดส่วนของคู่ที่ค่าน้อยกว่าเรา" ตรง ๆ — ไม่มีการยืด/บีบสเกลให้ตัวเลขดูดี
 */
function percentileScore(value: number, timeframe: string): number {
  const ref = DATA.scoreReference[timeframe.toUpperCase()];
  if (!ref || ref.sortedValues.length === 0) return 50;
  const sorted = ref.sortedValues;
  let below = 0;
  for (const v of sorted) {
    if (v < value) below++;
    else break; // เรียงจากน้อยไปมากแล้ว เจอตัวแรกที่ไม่น้อยกว่าก็หยุดได้
  }
  return Math.round((below / sorted.length) * 100);
}

const num = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * ตัวเลขของแจ้งเตือนจริง (ผ่าน SIGNAL_GATE) สำหรับตลาด+timeframe หนึ่ง
 * export แยกไว้ให้หน้าเว็บ/ตัวแจ้งเตือนเรียกได้โดยไม่ต้องมีสัญญาณในมือ
 */
export function gatedSpeedStats(market: string, timeframe: string): GatedSpeedStats {
  const tf = timeframe.trim().toUpperCase();
  const byMarket = DATA.pooled.gatedByMarketTimeframe[`${market.trim().toUpperCase()}|${tf}`];
  const byTf = DATA.pooled.gatedByTimeframe[tf];
  const src = byMarket ?? byTf;
  if (!src) {
    return {
      basis: 'none', sampleSize: 0,
      pTpWithin1: null, pSlWithin1: null, pTpWithin2: null, pSlWithin2: null,
      expectedRWithin2: null, expectedRWithin6: null,
    };
  }
  return {
    basis: byMarket ? 'market' : 'timeframe',
    sampleSize: src.trades,
    pTpWithin1: num(src.pTpWithin['1']),
    pSlWithin1: num(src.pSlWithin['1']),
    pTpWithin2: num(src.pTpWithin['2']),
    pSlWithin2: num(src.pSlWithin['2']),
    expectedRWithin2: num(src.realizedRWithin['2']),
    expectedRWithin6: num(src.realizedRWithin['6']),
  };
}

/**
 * ให้คะแนนความเร็วของสัญญาณสดหนึ่งอัน
 *
 * ลำดับการถอยของ score (อ่านให้จบก่อนใช้):
 *   1. ไฟล์ข้อมูลบอกว่า timeframe นี้ "อันดับรายคู่สอบผ่าน" และคู่นี้มีไม้ถึงเกณฑ์
 *      → ใช้ตัวเลขของคู่นี้เอง (basis 'pair')
 *   2. ไม่งั้นถอยไปใช้ค่ากลางของ ตลาด+timeframe (basis 'market')
 *   3. ไม่งั้นถอยไปใช้ค่ากลางของทั้ง timeframe (basis 'timeframe')
 *   4. ไม่มีอะไรเลย → 50 กลาง ๆ พร้อม basis 'none'
 *
 * ข้อ 1 ตกได้ด้วยสองเหตุผลที่ต่างกันมาก และทั้งคู่จบที่ 'market' เหมือนกัน:
 *   - ไม้น้อยกว่าเกณฑ์ → ตัวเลขคู่นั้นเป็นเสียงรบกวน (เช่น GULF บน 1D มี 17 ไม้)
 *   - อันดับรายคู่สอบไม่ผ่าน out-of-sample → ตัวเลขมีเยอะแต่ทำนายอนาคตไม่ได้ (1D ทั้งหมด)
 * เหตุผลอยู่ใน warnings เสมอ ผู้เรียกจึงแยกสองกรณีนี้ได้ถ้าต้องการ
 */
export function speedScore(input: SpeedScoreInput): SpeedScoreResult {
  const tf = input.timeframe.trim().toUpperCase();
  const policy: ReaderPolicy = DATA.readerPolicy[tf] ?? {
    usePerPairSpeed: false,
    usePerPairProfit: false,
    speedMeasurable: false,
  };
  const barMinutes = num(DATA.method.barMinutesByTimeframe[tf]);
  const warnings: string[] = [];
  const gated = gatedSpeedStats(input.market, tf);

  if (!policy.speedMeasurable) {
    warnings.push(
      `กราฟ ${tf} ตอบคำถาม "จบภายใน 1 ชั่วโมง" ไม่ได้ — หนึ่งแท่งของมันยาวกว่า 1 ชั่วโมง คะแนนความเร็วจึงคนละหน่วยกับ 1H`
    );
  }

  const pair = scorecardPair(input);

  // ── เลือกแหล่งข้อมูลของคะแนนอันดับ ──────────────────────────────────────
  let source: { pTp2: number | null; rWithin2: number | null; sampleSize: number } | null = null;
  let basis: SpeedBasis = 'none';

  if (pair && policy.usePerPairSpeed && pair.trades >= DATA.method.minReliableTrades) {
    source = { pTp2: num(pair.pTpWithin['2']), rWithin2: num(pair.realizedRWithin['2']), sampleSize: pair.trades };
    basis = 'pair';
  } else {
    if (pair && pair.trades < DATA.method.minReliableTrades) {
      warnings.push(
        `คู่นี้มีไม้แค่ ${pair.trades} ไม้ (ต่ำกว่าเกณฑ์ ${DATA.method.minReliableTrades}) — ใช้ค่ากลางของกลุ่มแทนตัวเลขของมันเอง`
      );
    } else if (!policy.usePerPairSpeed) {
      warnings.push(
        `ผลตรวจ out-of-sample บอกว่าอันดับรายคู่ของ ${tf} ทำนายช่วงถัดไปไม่ได้ — ใช้ค่ากลางของกลุ่มแทน`
      );
    } else if (!pair) {
      warnings.push(`ไม่เคยวัดคู่ ${input.symbol} บน ${tf} — ใช้ค่ากลางของกลุ่มแทน`);
    }

    const byMarket = DATA.pooled.byMarketTimeframe[`${input.market}|${tf}`];
    const byTf = DATA.pooled.byTimeframe[tf];
    if (byMarket) {
      source = { pTp2: num(byMarket.pTpWithin['2']), rWithin2: num(byMarket.realizedRWithin['2']), sampleSize: byMarket.trades };
      basis = 'market';
    } else if (byTf) {
      source = { pTp2: num(byTf.pTpWithin['2']), rWithin2: num(byTf.realizedRWithin['2']), sampleSize: byTf.trades };
      basis = 'timeframe';
    }
  }

  // ── คำเตือนที่ต้องติดไปกับทุกสัญญาณ ─────────────────────────────────────
  // ตัวเลข gated คือของจริงที่เจ้าของจะเจอ ถ้าไม่พูดถึงมัน การแสดง "อันดับความเร็ว"
  // เฉย ๆ จะทำให้เข้าใจว่าอันดับต้น ๆ คือของที่กำไรไวสุด ซึ่งไม่จริง
  if (gated.pTpWithin1 !== null && gated.pSlWithin1 !== null && policy.speedMeasurable) {
    warnings.push(
      `จากแจ้งเตือนจริง ${gated.sampleSize} ครั้งที่วัดได้ มีเพียง ${(gated.pTpWithin1 * 100).toFixed(1)}% ที่ปิดกำไรจบภายใน 1 แท่ง ` +
      `(${(gated.pSlWithin1 * 100).toFixed(1)}% โดน SL ก่อน) — "จบใน 1 ชั่วโมง" เป็นกรณีส่วนน้อยมาก ไม่ใช่กรณีปกติ`
    );
  }
  if (gated.expectedRWithin2 !== null && gated.expectedRWithin2 < 0) {
    const hours = barMinutes !== null ? `${Math.round((barMinutes * 2) / 60)} ชั่วโมง` : '2 แท่ง';
    warnings.push(
      `จบเร็วไม่ได้แปลว่ากำไร: ในกรอบ ${hours} ค่าคาดหวังของแจ้งเตือนจริงคือ ${gated.expectedRWithin2.toFixed(3)} R ต่อสัญญาณ (ติดลบ) ` +
      `เพราะประตูคุณภาพบังคับ RR ≥ 1.5 ทำให้ TP อยู่ไกลกว่า SL เสมอ ไม้ที่จบเร็วจึงมักเป็นไม้ที่โดน SL`
      // ⛔ เคยต่อท้ายว่า "ค่าคาดหวังพลิกเป็นบวก (X R) เมื่อรอถึงแท่งที่ 6" — ลบทิ้งแล้ว ห้ามใส่กลับ
      //
      // สองเหตุผล ทั้งคู่วัดมาแล้ว:
      //   1. มัน "พลิกเป็นบวก" ไม่จริงในหลายกอง — วัดจาก speed-scorecard.data.json
      //      มี 3 กองที่ expectedRWithin6 ติดลบ (FOREX|1H -0.076 · FOREX|1D -0.116 · TH_STOCK|1D -0.008)
      //      ประโยคจึงพิมพ์คำว่า "พลิกเป็นบวก" คู่กับเลขติดลบต่อหน้าผู้ใช้
      //   2. ต่อให้กองไหนเป็นบวก มันคือเลข "ก่อนหักต้นทุน" (feesR = 0 ทั้งไฟล์ข้อมูล)
      //      งานวิจัย 60,959 ไม้ วัดได้ว่าหักต้นทุนจริงแล้ว avgR = -0.083 ถึง -0.088
      //      ช่วงความเชื่อมั่นอยู่ใต้ศูนย์ทั้งช่วง — การชวนให้ "รอต่อแล้วจะเป็นบวก"
      //      ด้วยเลขก่อนหักต้นทุน คือการชี้นำให้ถือไม้ขาดทุนต่อ
      //
      // ถ้าอยากบอกเรื่องระยะเวลาถือจริง ๆ ต้องวัดใหม่หลังหักต้นทุนก่อน แล้วค่อยพูด
    );
  }

  if (!source || source.pTp2 === null) {
    warnings.push('ไม่มีข้อมูลที่วัดได้สำหรับคู่นี้เลย — คะแนน 50 คือค่ากลางที่ตั้งไว้เฉย ๆ ไม่ได้วัดมา');
    return {
      score: 50,
      basis: 'none',
      sampleSize: 0,
      measuredAt: DATA.measuredAt,
      pTpWithin2: null,
      expectedRWithin2: null,
      gated,
      barMinutes,
      speedMeasurable: policy.speedMeasurable,
      warnings,
    };
  }

  return {
    score: percentileScore(source.pTp2, tf),
    basis,
    sampleSize: source.sampleSize,
    measuredAt: DATA.measuredAt,
    pTpWithin2: source.pTp2,
    expectedRWithin2: source.rWithin2,
    gated,
    barMinutes,
    speedMeasurable: policy.speedMeasurable,
    warnings,
  };
}

/**
 * ห้ามใช้ผลงานกำไรรายตัวจัดอันดับ — ตัวนี้มีไว้ให้ผู้เรียก "ถามก่อนทำ"
 * วัดจริงแล้วได้ false ทุก timeframe: คู่ที่ avgR ดีสุดในช่วง train กลายเป็นกลุ่มขาดทุน
 * ในช่วง test (1H: top10 −0.022 vs bottom10 +0.065) ถ้าวันหนึ่งค่านี้กลายเป็น true
 * แปลว่ามีคนสร้างข้อมูลใหม่แล้วผลตรวจพลิก ค่อยไปอ่าน validationSummary ก่อนเชื่อ
 */
export function mayRankByHistoricalProfit(timeframe: string): boolean {
  return DATA.readerPolicy[timeframe.trim().toUpperCase()]?.usePerPairProfit ?? false;
}

/** สรุปผลตรวจ out-of-sample ของ timeframe หนึ่ง — ให้หน้าเว็บเอาไปแสดงได้ตรง ๆ */
export function validationNote(timeframe: string): string | null {
  return DATA.validationSummary[timeframe.trim().toUpperCase()]?.note ?? null;
}

/**
 * ข้อความไทยบรรทัดเดียวสำหรับแสดงใต้อันดับ
 * จงใจพูดถึง basis ทุกครั้ง เพราะ "อันดับที่มาจากค่ากลางของกลุ่ม" กับ "อันดับที่มาจาก
 * ตัวเลขของคู่นั้นเอง" หน้าตาเหมือนกันเป๊ะบนหน้าจอ แต่เชื่อถือได้ไม่เท่ากันเลย
 */
export function explainSpeedScore(result: SpeedScoreResult): string {
  const label: Record<SpeedBasis, string> = {
    pair: 'วัดจากไม้ของคู่นี้เอง',
    market: 'ค่ากลางของตลาดเดียวกัน (ไม่ใช่ตัวเลขของคู่นี้)',
    timeframe: 'ค่ากลางของทั้ง timeframe (ไม่ใช่ตัวเลขของคู่นี้)',
    none: 'ไม่มีข้อมูลวัด',
  };
  const fast = result.gated.pTpWithin1 !== null ? `${(result.gated.pTpWithin1 * 100).toFixed(1)}%` : '—';
  return `ความเร็ว ${result.score}/100 · ${label[result.basis]} จาก ${result.sampleSize} ไม้ · จบกำไรใน 1 แท่งจริง ${fast}`;
}
