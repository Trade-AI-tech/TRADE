import type { MarketType, Signal, SignalAction, SignalStrength } from '@/types';

/**
 * universe.ts — "จักรวาลสัญลักษณ์" ที่ระบบสแกนเอง + เกณฑ์คุณภาพสัญญาณ
 *
 * ไฟล์นี้คือ "ที่เดียว" ที่ตอบสองคำถาม:
 *   1. รอบนี้จะสแกนอะไรบ้าง          → SYMBOL_UNIVERSE / buildScanTargets()
 *   2. สัญญาณแบบไหนถึงควรเด้งเข้ามือถือ → SIGNAL_GATE / selectSignals()
 * ตัวสแกนกับตัวแจ้งเตือนไม่ควรมีเกณฑ์ของตัวเองซ่อนอยู่ ถ้าจะผ่อนหรือขัน ให้แก้ที่นี่ที่เดียว
 *
 * ── ตัวเลขที่วัดจริงและใช้ตัดสินใจในไฟล์นี้ ────────────────────────────────────
 * วัดเมื่อ 2026-08-17 จากเครื่องในไทย ยิง Yahoo v8 chart จริงทีละ symbol
 * (สคริปต์ probe ใช้ toYahooSymbol ตัวจริงจาก market-data.ts ไม่ได้เขียนตัวแปลงใหม่)
 *
 *   - ผู้สมัคร 58 ตัว → ดึงได้จริง 57 ตัว (ตกไป 1 ตัว ดู UNSUPPORTED_SYMBOLS)
 *   - 2026-08-18 ถอดคริปโต 9 + หุ้นสหรัฐ 12 ออกตามที่เจ้าของสั่ง → เหลือ 36 ตัว
 *   - 2026-08-19 ถอดหุ้นไทย 18 ออกตามที่เจ้าของสั่งหลังเห็นตัวเลข → เหลือ 18 ตัว
 *   - 2026-08-19 ถอดคู่เงินบาท 5 ตัวออก (ค่าธรรมเนียมกินขอบหมด) → **เหลือ 13 ตัว**
 *     (โลหะ 2 + ค่าเงิน 11) เหตุผลและตัวเลขเทียบรายตลาดอยู่ในบล็อก ⛔ ข้างล่าง
 *   - 13 symbol × 2 timeframe (1D range 1y + 1H range 3mo) = 26 คำขอ/รอบ
 *     (ตัวเลขเวลาข้างล่างวัดตอนยังมี 57 ตัว = 114 คำขอ ของจริงตอนนี้เร็วกว่านั้นราว 77%)
 *   - แบบเรียงทีละคำขอ ตอน cache เย็น วัด 4 รอบ: 273–282 ms/คำขอ
 *       (p50 267 / p90 286 / max 965) → รอบละ 31.5–32.7 วินาที
 *   - แบบเรียงทีละคำขอ ตอน cache ร้อน: 79 ms/คำขอ → 9.0 วินาที
 *   - แบบขนาน 4 เส้น (cache ร้อน): 2.26 วิ · ขนาน 8 เส้น: 1.25 วิ · ไม่เจอ HTTP 429 เลย
 *       → เทียบบัญญัติไตรยางศ์กับกรณี cache เย็น: ขนาน 4 ≈ 8 วิ, ขนาน 8 ≈ 4.5 วิ
 *
 * ทำไมหยุดที่ 57 ไม่ใช่ 100+:
 *   งานสแกนถูกย้ายออกจาก Vercel เพราะแผน Hobby ให้ Fluid Active CPU แค่ 4 ชม./เดือน
 *   (เคยใช้เกินจนบัญชีถูกระงับมาแล้ว) รายชั่วโมง = 720 รอบ/เดือน
 *   ถ้ารอบละ 32 วิ → 720 × 32 = 6.4 ชม./เดือน = เกินโควตาแน่นอน
 *   ตัวเลข 57 จึงไม่ได้เลือกให้พอดี Vercel แต่เลือกให้ "รอบหนึ่งจบใน ~32 วิแบบเรียง
 *   หรือ ~8 วิแบบขนาน 4 เส้น" ซึ่งยังเหลือที่ว่างพอให้ job ของ GitHub Actions
 *   (checkout + setup-node + npm ci + สแกน) จบภายในนาทีเดียว ไม่ถูกปัดขึ้นเป็น 2 นาที
 *   บนแผนฟรี 2,000 นาที/เดือน: จบใน 1 นาที = 720 นาที/เดือน เหลือ 1,280 ให้ deploy
 *   ต่อให้พลาดเป็น 2 นาที/รอบ = 1,440 นาที ก็ยังไม่ทะลุ 2,000 — มีที่ให้พลาดหนึ่งชั้น
 *
 * ⚠ ข้อควรรู้ก่อนขยายรายชื่อ: ต้นทุนเป็นเชิงเส้นตรงกับจำนวน symbol
 *   ทุก 10 symbol ที่เพิ่ม = +20 คำขอ = +5.6 วิ/รอบ (cache เย็น แบบเรียง)
 *   เพิ่มแล้วต้องยิงทดสอบจริงก่อนเสมอ ห้ามใส่ชื่อลอย ๆ แล้วให้ตัวสแกนไปเจอ error เอง
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. จักรวาลสัญลักษณ์
// ═══════════════════════════════════════════════════════════════════════════

export interface UniverseSymbol {
  /** symbol ภายในระบบ — ตัวเดียวกับที่ toYahooSymbol() รับ */
  symbol: string;
  /** ชื่อที่ผู้ใช้เห็นในแจ้งเตือน (ภาษาไทยสำหรับของที่มีคำไทยใช้จริง) */
  name: string;
  market: MarketType;
}

/**
 * ทุกตัวในรายชื่อนี้ผ่านการยิง Yahoo จริงมาแล้วทั้ง 1D (range 1y) และ 1H (range 3mo)
 * และได้แท่งเกิน 50 แท่งทั้งคู่ (50 คือขั้นต่ำที่ generateSignal ต้องการ)
 * ตัวเลขในวงเล็บท้ายแต่ละกลุ่ม = จำนวนแท่งที่ได้จริงตอนวัด
 */
export const SYMBOL_UNIVERSE: readonly UniverseSymbol[] = [
  // ── โลหะมีค่า (2) — 1D 251 แท่ง / 1H 1,448 แท่ง ────────────────────────────
  // เจ้าของดูทองเป็นหลัก และ XAUUSD คือตัวเดิมใน watchlist อยู่แล้ว
  // เงินใส่คู่มาด้วยเพราะเดินตามทองแต่แกว่งแรงกว่า มักให้สัญญาณก่อนทองครึ่งก้าว
  { symbol: 'XAUUSD', name: 'ทองคำ', market: 'GOLD' },
  { symbol: 'XAGUSD', name: 'โลหะเงิน', market: 'GOLD' },

  // ── ค่าเงินคู่หลัก (7) — 1D 259 แท่ง / 1H ~1,560 แท่ง ──────────────────────
  // สภาพคล่องสูงสุดในโลก สเปรดแคบสุด เดินตลอด 24 ชม. จันทร์–ศุกร์
  // แปลว่าแท่ง 1H มีของให้สแกนทุกชั่วโมงจริง ไม่เหมือนหุ้นที่ตลาดปิดแล้วนิ่ง
  { symbol: 'EURUSD', name: 'ยูโร/ดอลลาร์', market: 'FOREX' },
  { symbol: 'GBPUSD', name: 'ปอนด์/ดอลลาร์', market: 'FOREX' },
  { symbol: 'USDJPY', name: 'ดอลลาร์/เยน', market: 'FOREX' },
  { symbol: 'AUDUSD', name: 'ดอลลาร์ออสเตรเลีย/ดอลลาร์', market: 'FOREX' },
  { symbol: 'USDCHF', name: 'ดอลลาร์/ฟรังก์สวิส', market: 'FOREX' },
  { symbol: 'USDCAD', name: 'ดอลลาร์/ดอลลาร์แคนาดา', market: 'FOREX' },
  { symbol: 'NZDUSD', name: 'ดอลลาร์นิวซีแลนด์/ดอลลาร์', market: 'FOREX' },

  // ── ค่าเงินคู่ไขว้ (4) ────────────────────────────────────────────────────
  // ไม่มีดอลลาร์อยู่ในคู่ จึงเคลื่อนไหวไม่ซ้ำกับคู่หลักข้างบน
  // ได้ "โอกาสที่ไม่เกี่ยวข้องกัน" เพิ่มโดยไม่ต้องเพิ่มสินทรัพย์ชนิดใหม่
  { symbol: 'EURJPY', name: 'ยูโร/เยน', market: 'FOREX' },
  { symbol: 'GBPJPY', name: 'ปอนด์/เยน', market: 'FOREX' },
  { symbol: 'EURGBP', name: 'ยูโร/ปอนด์', market: 'FOREX' },
  { symbol: 'AUDJPY', name: 'ดอลลาร์ออสเตรเลีย/เยน', market: 'FOREX' },

  // ⛔ ถอดออกจากจักรวาลแล้วสี่กลุ่ม — เหตุผลคนละแบบ อย่ารวมกัน
  //
  //    1) คริปโต (9) + หุ้นสหรัฐ (12) ถอดเมื่อ 2026-08-18 ตามที่เจ้าของสั่งว่าเขาเทรด
  //       แค่หุ้นไทย/ค่าเงิน/ทอง — สแกนตัวที่ไม่มีวันเล่นก็ได้แต่เสียงรบกวน
  //
  //    2) หุ้นไทย (18) ถอดเมื่อ 2026-08-19 ตามที่เจ้าของสั่ง **หลังเห็นตัวเลข**
  //       ต่างจากข้อ 1 ตรงที่ข้อนี้ข้อมูลกับการตัดสินใจไปทางเดียวกัน
  //
  //    3) คู่เงินบาท 5 ตัว (USDTHB EURTHB JPYTHB GBPTHB AUDTHB) ถอดเมื่อ 2026-08-19
  //       ด้วยเหตุผลเชิงโครงสร้างอันเดียวกับหุ้นไทย: ค่าธรรมเนียมกินขอบหมด
  //
  //       ต้นทุนใน R = (bps/10000) ÷ ระยะ SL ดังนั้นเครื่องมือจะคุ้มค่าธรรมเนียมตัวเอง
  //       ได้ก็ต่อเมื่อ **SL กว้างกว่า bps ÷ 350** (350 มาจากขอบดิบทั้งระบบ +0.035 R/ไม้)
  //
  //         XAUUSD      3 bps → ต้องกว้างกว่า 0.86%   ✓ ตั้งได้จริงบ่อย
  //         คู่หลัก   1.5 bps → ต้องกว้างกว่า 0.43%   ✓
  //         USDTHB     15 bps → ต้องกว้างกว่า 4.3%    ✗
  //         ไขว้บาท    20 bps → ต้องกว้างกว่า 5.7%    ✗ ของจริงที่เคยตั้ง 1.43% กับ 2.35%
  //
  //       สองสัญญาณแรกที่ระบบยิงออกมาจริงหลังถอดหุ้นไทย คือ GBPTHB กับ JPYTHB พอดี
  //       และเมื่อคิดต้นทุนถูกต้อง JPYTHB มีต้นทุน 0.1400 R = ใหญ่กว่าขอบดิบทั้งระบบ 4 เท่า
  //       (ก่อนแก้ตารางต้นทุน มันถูกคิดไว้แค่ 0.0105 R เพราะไม่มีค่าของตัวเองจึงตกไปใช้
  //        ค่าประจำตลาด 1.5 bps — ดูคอมเมนต์ในตาราง COST_BPS ของ lab.mjs)
  //
  //       ⚠ ทั้งสองสัญญาณนั้นยังอยู่ในตาราง signals และยังถูกตามผลจนจบโดยตัวเก็บผล
  //         โดยตั้งใจ — สมุดบันทึกต้องบันทึกสิ่งที่ระบบทำจริง ไม่ใช่สิ่งที่เราอยากให้มันทำ
  //
  //    ── ตัวเลขที่ใช้ตัดสิน (validation, out-of-sample, R หลังหักต้นทุน, นิยาม planned) ──
  //      US_STOCK   −0.0008 [−0.0485, +0.0462]  n=3,132  ← ตลาดเดียวที่ CI คร่อมศูนย์
  //      FOREX      −0.0534 [−0.0728, −0.0349]  n=3,889  ← ยังอยู่ในจักรวาล
  //      GOLD       −0.0699 [−0.1279, −0.0108]  n=1,345  ← ยังอยู่ในจักรวาล
  //      CRYPTO     −0.0901 [−0.1229, −0.0550]  n=4,861
  //      TH_STOCK   −0.2082 [−0.2605, −0.1532]  n=2,185  ← แย่ที่สุด แย่ซ้ำทั้งสองชุด
  //
  //    หลักฐานเฉพาะของหุ้นไทย (จากการตรวจ 153 ตัวเลข 2026-08-19):
  //      · ผ่านด่านคัดกรอง 0 จาก 886 ช่อง
  //      · กวาดระยะถือ 7 ค่า (h1→h40) ไม่มีช่องไหนเป็นบวก ดีสุด h20 = −0.1814
  //      · SET50 1H ถือ 1 แท่ง: แม้รู้ทิศถูก 100% ก็ยังขาดทุน −15.61 bps
  //        ต้องแม่น 112.5% ถึงเสมอตัว = ปิดตายเชิงเลขคณิต ไม่ใช่เชิงทักษะ
  //      · ขอบดิบ +0.0178 R เทียบต้นทุนจริงของ SET 0.45–0.77 R
  //        → ขอบจ่ายค่าธรรมเนียมตัวเองได้ 2–4%
  //
  //    ⚠ สิ่งที่ต้องไม่เข้าใจผิด: การถอดหุ้นไทยออก **ไม่ได้ทำให้ระบบกำไร**
  //    ที่เหลืออยู่ (ทอง + ค่าเงิน) ก็ยังติดลบทั้งคู่และช่วงความเชื่อมั่นไม่แตะศูนย์
  //    ทั้งระบบวัดได้ −0.0777 [−0.1030, −0.0508] จาก 15,412 ไม้ เพราะขอบดิบ +0.035 R
  //    เล็กกว่าต้นทุนเฉลี่ย 0.113 R อยู่ 3.2 เท่า — ถอดตัวที่แย่ที่สุดออกคือการ
  //    "เลิกจ่ายค่าธรรมเนียมให้ช่องที่แพงที่สุด" ไม่ใช่การหาขอบเพิ่ม
  //
  //    อยากได้กลับ: ใส่รายชื่อคืนจากประวัติ git ก่อนคอมมิตนี้ แล้วแก้ตัวเลขจำนวน
  //    ตัวในคอมเมนต์หัวไฟล์ให้ตรง (UNIVERSE_SIZE คำนวณเองจากความยาวอาร์เรย์)
];

/** จำนวน symbol ในจักรวาล — ใช้คำนวณงบเวลาในตัวสแกน (× 2 timeframe = จำนวนคำขอ) */
export const UNIVERSE_SIZE = SYMBOL_UNIVERSE.length;

/**
 * ตัวที่ "ทดสอบแล้วใช้ไม่ได้" — เก็บไว้เป็นบันทึก ไม่ให้ใครเผลอใส่กลับเข้ามาอีก
 * ตัวสแกนไม่ต้องอ่าน export ตัวนี้ มีไว้ให้คนอ่าน
 */
export const UNSUPPORTED_SYMBOLS: ReadonlyArray<{ symbol: string; market: MarketType; reason: string }> = [
  {
    symbol: 'CNYTHB',
    market: 'FOREX',
    reason:
      'Yahoo ตอบ 200 แต่ให้แท่งรายวันมาแค่ 1 แท่ง (1H ได้ 1,426 แท่งปกติ) — ชุดข้อมูลรายวันของคู่นี้เสีย ' +
      'ถ้าใส่ไว้ตัวสแกนจะข้ามเงียบ ๆ ทุกรอบเพราะไม่ถึง 50 แท่ง เท่ากับจ่ายค่าคำขอฟรี ๆ',
  },
];

/** คีย์มาตรฐานของ symbol+market — ใช้กันซ้ำ ต้องใช้ตัวเดียวกันทั้งระบบ */
export function symbolKey(symbol: string, market: string): string {
  return `${symbol.trim().toUpperCase()}|${market.trim().toUpperCase()}`;
}

/** เป้าหมายที่จะสแกนหนึ่งรายการ — source บอกว่ามาจากไหน เพื่อให้ log แยกออกได้ */
export interface ScanTarget extends UniverseSymbol {
  source: 'universe' | 'watchlist';
}

/**
 * รวมจักรวาลเข้ากับ watchlist ที่ผู้ใช้เพิ่มเอง
 *
 * ทำไมยังต้องมี watchlist: เจ้าของสั่งว่า "ไม่ต้องรอผมกดเพิ่มเอง" ซึ่งแปลว่าจักรวาลต้อง
 * ทำงานเองโดยไม่ต้องพึ่ง watchlist — ไม่ได้แปลว่าให้ทิ้ง watchlist
 * ของที่ผู้ใช้เคยเพิ่มไว้ต้องยังถูกสแกนอยู่ ไม่งั้นเท่ากับลบของเดิมทิ้งเงียบ ๆ
 *
 * จักรวาลมาก่อนเสมอ เพราะชื่อในจักรวาลถูกเขียนไว้เป็นภาษาไทยและตรวจแล้วว่าดึงข้อมูลได้จริง
 * ส่วนแถวใน watchlist อาจมี market ที่กรอกไว้ไม่ตรง ซึ่งจะกลายเป็น symbol คนละตัวโดยปริยาย
 */
export function buildScanTargets(
  watchlistRows: ReadonlyArray<{ symbol: string; name?: string | null; market: MarketType }> = []
): ScanTarget[] {
  const byKey = new Map<string, ScanTarget>();

  for (const u of SYMBOL_UNIVERSE) {
    byKey.set(symbolKey(u.symbol, u.market), { ...u, source: 'universe' });
  }

  for (const row of watchlistRows) {
    if (!row?.symbol || !row?.market) continue;
    const symbol = row.symbol.trim().toUpperCase();
    const key = symbolKey(symbol, row.market);
    if (byKey.has(key)) continue; // อยู่ในจักรวาลแล้ว ไม่ต้องดึงซ้ำ
    byKey.set(key, { symbol, name: row.name?.trim() || symbol, market: row.market, source: 'watchlist' });
  }

  return [...byKey.values()];
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. เกณฑ์คุณภาพสัญญาณ
// ═══════════════════════════════════════════════════════════════════════════

/** ลำดับความแรง — ใช้เทียบว่า "แรงพอ" หรือยัง ไม่ใช้เทียบตรง ๆ ด้วย string */
export const STRENGTH_RANK: Record<SignalStrength, number> = {
  weak: 0,
  moderate: 1,
  strong: 2,
  very_strong: 3,
};

export interface SignalGateConfig {
  minStrength: SignalStrength;
  minConfidence: number;
  minRiskReward: number;
  /** null = ปิดอยู่ (ไม่จำกัดเพดานบน) */
  maxRiskReward: number | null;
  minStopDistancePct: number;
  maxStopDistancePct: number;
  maxSignalsPerRun: number;
  /**
   * เกณฑ์ที่ต่างออกไปเฉพาะบาง timeframe — ทับเฉพาะช่องที่ระบุ ที่เหลือใช้ค่าหลัก
   * ไม่มีคีย์ของ timeframe ไหน = timeframe นั้นใช้ค่าหลักทั้งชุด
   */
  perTimeframe?: Partial<Record<string, Partial<Omit<SignalGateConfig, 'perTimeframe'>>>>;
}

/**
 * รวมเกณฑ์หลักกับส่วนที่ทับเฉพาะ timeframe นั้น
 * แยกเป็นฟังก์ชันเพื่อให้ทั้ง evaluateSignal และตัวเรียกภายนอกได้ผลเดียวกันเสมอ
 */
export function gateForTimeframe(timeframe: string | undefined, gate: SignalGateConfig = SIGNAL_GATE): SignalGateConfig {
  const override = timeframe ? gate.perTimeframe?.[timeframe] : undefined;
  return override ? { ...gate, ...override } : gate;
}

/**
 * ═══ เกณฑ์คุณภาพ — จุดเดียวที่คุมว่าอะไรควรเด้งเข้ามือถือ ═══
 *
 * ── ทำไมต้องขันให้แน่นก่อน ────────────────────────────────────────────────
 * ระบบยัง "ไม่มี edge" — วัดจริงล่าสุด 674 ไม้ profit factor 0.98 avg R -0.009
 * และนั่นคือตอนยังไม่หักสเปรด การขยายจาก 3 symbol เป็น 57 symbol คือการคูณ
 * จำนวนสัญญาณ ไม่ใช่คูณความแม่นยำ ถ้าไม่ขันเกณฑ์ = คูณเสียงรบกวน 20 เท่า
 * มีงานวิจัยแยกกำลังรันอยู่เพื่อแก้เรื่อง edge — เมื่อผลออกแล้วค่อยผ่อนค่าที่นี่
 *
 * ── ผลของเกณฑ์ชุดนี้ วัดจริง ไม่ใช่ประมาณ ────────────────────────────────
 * วิธีวัด: เดินย้อนหลังบนแท่งจริงของทั้ง 57 symbol × 2 timeframe เรียก generateSignal
 * ตัวจริงทีละแท่ง แล้วตัดสินด้วย evaluateSignal() ในไฟล์นี้เอง (ไม่ใช่สูตรที่เขียนซ้ำ)
 * รวม 26,354 จุดตัดสินใจ ได้สัญญาณ non-HOLD 3,842 อัน
 *
 *   เกณฑ์เดิม (action !== HOLD && strength !== weak):
 *     ผ่าน 3,842 อัน → เฉลี่ย 16.9 สัญญาณ/รอบสแกน · รอบที่แย่สุด 18 อัน · p95 = 11 อัน
 *     แปลว่าโทรศัพท์สั่น 11 ครั้งขึ้นไปเป็นเรื่องปกติ ไม่ใช่กรณีสุดโต่ง
 *
 *   เกณฑ์ชุดนี้:
 *     ผ่าน 355 อัน (9.2% ของ non-HOLD) → เฉลี่ย 1.56 สัญญาณ/รอบ
 *     รอบที่แย่สุด 6 อัน · p95 = 3 อัน · ครึ่งหนึ่งของรอบที่มีสัญญาณ มีแค่ 1 อัน
 *     ลดปริมาณลง 10.8 เท่า และไม่มีรอบไหนเกิน 6 เลย
 *     กระจายตัว: 1D 182 / 1H 173 · BUY 186 / SELL 169 (ไม่เอนไปทางใดทางหนึ่ง)
 *
 * ⚠ ตัวเลขชุดนี้ขยับได้วันละเล็กน้อยเมื่อวัดใหม่ เพราะแท่งล่าสุดยังก่อตัวไม่เสร็จ
 *   และหน้าต่างข้อมูลย้อนหลังของ Yahoo เลื่อนตามวัน — ที่บันทึกไว้คือรอบวันที่ 2026-08-17
 *
 * ⚠ สิ่งที่ตัวเลขข้างบน "ไม่ได้" บอก: มันบอกว่ากรองแล้วเหลือเท่าไร ไม่ได้บอกว่า
 *   ที่เหลือทำเงินได้ ยังไม่มีใครวัดว่าเกณฑ์ชุดนี้ทำให้ profit factor ดีขึ้นหรือแย่ลง
 *   ทุกค่าด้านล่างที่เขียนว่า [รอผลวิจัย] คือการเดาอย่างมีเหตุผล ไม่ใช่ของที่พิสูจน์แล้ว
 */
export const SIGNAL_GATE: SignalGateConfig = {
  /**
   * ความแรงขั้นต่ำ = 'strong'
   *
   * เดิมรับ 'moderate' ขึ้นไป ซึ่งกินสัญญาณไป 74% ของทั้งหมด (2,857 จาก 3,842)
   * ขยับขึ้นมาที่ strong ตัดทิ้งกลุ่มนั้นทั้งก้อน เหลือ 985 อัน
   *
   * ทำไมไม่ขันถึง 'very_strong': วัดแล้วทั้ง 26,354 จุดตัดสินใจมี very_strong แค่ 10 อัน
   * และไม่มีอันไหนผ่านเกณฑ์ RR เลยสักอัน → ตั้ง very_strong = ปิดระบบแจ้งเตือนทิ้งทั้งระบบ
   * 'strong' คือค่าที่ขันได้แน่นสุดโดยที่ระบบยังส่งอะไรออกมาบ้าง
   * [รอผลวิจัย] ว่าความแรงตามนิยามของ signal-engine สัมพันธ์กับผลกำไรจริงหรือไม่
   */
  minStrength: 'strong',

  /**
   * ความมั่นใจขั้นต่ำ = 70
   *
   * ⚠ ตอนนี้ค่านี้ "ไม่ได้กรองอะไรเพิ่ม" โดยพฤตินัย เพราะ signal-engine คำนวณ
   *   confidence = min(95, 40 + totalScore × 6) จาก totalScore ตัวเดียวกับที่กำหนด strength
   *   strong (totalScore ≥ 5) จึงได้ confidence ≥ 70 เสมอ — วัดจริงพบว่าสัญญาณที่ผ่าน
   *   เกณฑ์ทั้งชุดมี confidence แค่ 3 ค่าเท่านั้น: 70 (275 อัน), 76 (72 อัน), 82 (8 อัน)
   *
   * ยังตั้งแยกไว้เพราะสองเรื่องนี้ "ควร" แยกจากกันในเชิงความหมาย และวันที่สูตร confidence
   * เปลี่ยน (เช่น งานวิจัยเอาปัจจัยอื่นมาผสม) ปุ่มนี้จะเริ่มทำงานทันทีโดยไม่ต้องแก้โครงสร้าง
   */
  minConfidence: 70,

  /**
   * RR ขั้นต่ำ = 1.5  ← ตัวที่หายไปและน่าจะสำคัญที่สุด
   *
   * RR = |TP − entry| / |entry − SL| — เดิมไม่มีการตรวจเลย ผลคือสัญญาณที่เสี่ยง 1.4%
   * เพื่อกำไร 0.2% (RR 0.14) ถูกส่งออกไปได้ ซึ่งต้องชนะ 88% ของไม้ถึงจะเสมอตัว
   *
   * การกระจายของ RR ที่วัดได้จริง (3,842 สัญญาณ): p10 = 0.26 · p25 = 0.44 · p50 = 1.55
   * · p75 = 2.00 · p90 = 2.27 · สูงสุด 31.6
   * เป็นการกระจายแบบ "สองยอด" ชัดเจน และรู้สาเหตุ:
   *   - ยอดต่ำ มาจากสัญญาณที่ SL/TP ถูกดึงจากแนวรับ/แนวต้านคนละระดับที่ไม่สัมพันธ์กัน
   *   - ยอดที่ 2.00 พอดีเป๊ะ มาจากสูตรสำรอง ATR ของ signal-engine (TP = 3×ATR, SL = 1.5×ATR)
   *
   * ที่ 1.5 ตัดยอดล่างทิ้งเกือบหมด เหลือ 50.4% ของสัญญาณ และ RR กลางของที่ผ่านคือ 2.00
   * เหตุผลของเลข 1.5: ต้องชนะเพียง 40% ของไม้ถึงจะเสมอตัวก่อนหักต้นทุน ซึ่งเป็นระดับที่
   * ระบบยังพอมีทางไปถึง ต่างจาก RR 0.14 ที่ไม่มีทางเป็นไปได้ในทางคณิตศาสตร์
   *
   * ⚠ [รอผลวิจัย] และต้องพูดให้ตรง: การขันที่ 1.5 มีผลข้างเคียงคือมันเลือก "สัญญาณที่ใช้
   *   สูตรสำรอง ATR" มากกว่า "สัญญาณที่อิงแนวรับแนวต้านจริง" โดยอ้อม ยังไม่มีใครพิสูจน์ว่า
   *   เรขาคณิตแบบ ATR ทำเงินได้ดีกว่า — รู้แค่ว่าคณิตศาสตร์ของมันไม่สิ้นหวังตั้งแต่ต้น
   */
  minRiskReward: 1.5,

  /**
   * เพดาน RR = ปิดอยู่ (null)
   *
   * ทำไมมีปุ่มนี้: RR สูงสุดที่วัดได้คือ 31.6 และมันไม่ได้เกิดจาก SL แคบผิดปกติ
   * (SL ห่าง 0.53% ซึ่งปกติ) แต่เกิดจาก TP ไกลถึง 16.6% ของราคา — เป็นเคสผสมที่
   * SL มาจากแนวรับใกล้ ๆ ส่วน TP มาจากสูตร ATR ที่ยิงไปไกล เป้าแบบนี้ในกรอบเวลาสั้น
   * แทบไม่มีทางไปถึง แต่ RR สวยจนถูกจัดอันดับขึ้นมาก่อนเพื่อนใน rankSignals()
   *
   * ทำไมยังปิดไว้: ยังไม่มีข้อมูลว่าควรตัดที่เท่าไร การเดาเลขมั่ว ๆ แล้วเขียนคอมเมนต์
   * ให้ดูมีเหตุผล แย่กว่าการเปิดปุ่มทิ้งไว้พร้อมบอกตรง ๆ ว่ายังไม่รู้
   * [รอผลวิจัย] — ถ้าพบว่าไม้ RR สูงแพ้บ่อย ให้ตั้งค่านี้ (น่าจะราว 4–6)
   */
  maxRiskReward: null,

  /**
   * ระยะ SL ขั้นต่ำ = 0.15% ของราคาเข้า
   *
   * กัน SL ที่แคบจนแทบติดราคาเข้า ซึ่งทำสองเรื่องพร้อมกัน: (1) โดนสเปรดกับความผันผวน
   * ปกติเขี่ยออกก่อนที่ไม้จะได้เดิน (2) ทำให้ตัวหาร RR เล็กจน RR พองเกินจริง
   * แล้วสัญญาณห่วย ๆ ลอยขึ้นมาอยู่หัวตารางแทนที่จะถูกกรองทิ้ง
   *
   * วัดจริง: ตัดทิ้งแค่ 1 จาก 356 อันที่ผ่านเกณฑ์อื่นครบ (0.3%) — เป็นกันชน ไม่ใช่ตัวกรองหลัก
   * signal-engine มีการกันไว้ชั้นหนึ่งแล้ว (ปฏิเสธเมื่อ SL ปัดแล้วเท่ากับ entry พอดี)
   * แต่นั่นกันแค่ "เท่ากันเป๊ะ" ไม่ได้กัน "ใกล้จนไร้ประโยชน์"
   * [รอผลวิจัย] ค่าที่ถูกต้องควรผูกกับสเปรดจริงของแต่ละตลาด ไม่ใช่เลขเดียวใช้ทั้งระบบ
   */
  minStopDistancePct: 0.15,

  /**
   * ระยะ SL สูงสุด = 8% ของราคาเข้า
   *
   * เจ้าของเทรดสั้น ไม้ที่ต้องยอมขาดทุน 19.6% (ค่าสูงสุดที่วัดได้จริง) ไม่ใช่ไม้ที่เทรดได้
   * เกิดจากกรณีที่ SL ถูกดึงจากแนวรับที่อยู่ไกลมาก นี่คือเพดานกันของพัง ไม่ใช่ตัวกรองคุณภาพ
   *
   * ทำไม 8 ไม่ใช่ 6: การกระจายของระยะ SL ต่างกันมากตามตลาด (วัดจากสัญญาณที่ strong
   * และ RR ≥ 1.5) — FOREX p75 = 1.7% · หุ้นไทย p75 = 2.1% · หุ้นสหรัฐ p75 = 3.0%
   * แต่คริปโต p75 = 5.8% ตั้ง 6% จึงไม่ใช่ "เกณฑ์คุณภาพ" แต่กลายเป็น "ตัวปิดคริปโต"
   * โดยที่ไม่มีใครตั้งใจ ที่ 8% ตัดทิ้ง 1.9% ของสัญญาณ คือเฉพาะหางที่ผิดปกติจริง ๆ
   * [รอผลวิจัย] ที่ถูกต้องควรเป็นเพดานแยกรายตลาด (หรือคิดเป็นจำนวนเท่าของ ATR
   * แทนเปอร์เซ็นต์ของราคา) — แต่นั่นคือ 5 ตัวเลขที่ยังไม่มีข้อมูลรองรับสักตัว
   */
  maxStopDistancePct: 8,

  /**
   * จำนวนสัญญาณสูงสุดต่อรอบ = 5
   *
   * เหตุผล: โทรศัพท์สั่นรัว ๆ = เจ้าของปิดแจ้งเตือนทิ้งภายในวันเดียว แล้วระบบไร้ค่าทันที
   * และ iOS ตัดสิทธิ์ push เงียบ ๆ ถ้าส่งถี่เกิน ต่อให้เกณฑ์คุณภาพดีแค่ไหนก็ไม่ถึงมือ
   *
   * ทำไม 5 พอดี: วัดจากรอบจริง 252 รอบที่มีสัญญาณผ่านเกณฑ์ — รอบที่ได้เกิน 5 อัน
   * มีแค่ 2 รอบ (0.8%) และเกิน 3 อันมี 6 รอบ (2.4%) เพดานนี้จึง "ไม่แตะ" 99.2% ของรอบ
   * มันมีไว้กันหางกรณีที่ตลาดขยับพร้อมกันทั้งกระดาน (ข่าวใหญ่ ดอลลาร์แข็งทีเดียวทุกคู่)
   * ซึ่งเป็นกรณีที่สัญญาณ 15 อันบอกเรื่องเดียวกัน ไม่ใช่ 15 โอกาสที่ต่างกัน
   *
   * ⚠ เพดานนี้ทำงานเฉพาะเมื่อเรียกผ่าน selectSignals() เท่านั้น — passesGate() เป็นการ
   *   ตัดสิน "ทีละสัญญาณ" จึงไม่รู้จักโควตาต่อรอบโดยธรรมชาติ ใครที่กรองด้วย passesGate()
   *   แล้วต้องการคุมจำนวนแจ้งเตือน ต้องคุมที่ชั้นแจ้งเตือนของตัวเอง (เช่น รวบเป็นข้อความเดียว)
   * ⚠ เพดานนับ "ต่อการเรียกหนึ่งครั้ง" ถ้ามีผู้ใช้หลายคนต้องเรียกแยกรายคน
   *   ไม่งั้นผู้ใช้คนแรกจะกินโควตาของคนอื่นหมด
   */
  maxSignalsPerRun: 5,

  /**
   * ── เลน 15m: เกณฑ์คนละชุดกับ 1D/1H โดยตั้งใจ ────────────────────────────
   *
   * เจ้าของขอเมื่อ 2026-08-25 ว่าอยากได้สัญญาณถี่ขึ้นบน TF เล็ก
   * ที่ 'strong' เลน 15m ให้ผลเท่ากับ 1H/1D คือ **ศูนย์** — วัดจริงจากรอบ dry run
   * 39 คำขอ มีทิศทาง 7 ตัว และทั้ง 7 ตกที่ "ไม่แรงพอ" ทุกตัว
   * ถ้าไม่ผ่อนตรงนี้ การเพิ่ม 15m เข้ามาก็ไม่เปลี่ยนอะไรเลยนอกจากเปลืองคำขอ
   *
   * ⚠ สิ่งที่ต้องรู้ก่อนอ่านตัวเลขจากเลนนี้:
   *   · 'moderate' วัดบน validation ได้ −0.0564 R/ไม้ เทียบ 'strong' −0.0481
   *     คือแย่กว่า ไม่ใช่ดีกว่า — ผ่อนเกณฑ์ = ได้จำนวน ไม่ได้ความแม่น
   *   · Yahoo ให้ข้อมูล 15m ย้อนหลังแค่ 1 เดือน จึงแบ่ง train/validation/test ไม่ได้
   *     เลนนี้ **ไม่เคยถูกตรวจสอบนอกตัวอย่างเลย** ต่างจาก 1H/1D ที่มีข้อมูลพอตรวจ
   *   · RR ขั้นต่ำลดจาก 1.5 เหลือ 1.2 เพราะบน TF เล็กเป้าที่ไปถึงได้จริงสั้นกว่า
   *     แต่การลด RR ก็คือการลดกำไรต่อไม้ที่ชนะ ไม่ใช่การเพิ่มโอกาสชนะ
   *   · SL ขั้นต่ำ 0.15% ยังคงไว้ และตัวสแกนขยาย SL ของ 15m ให้ถึงเพดานต้นทุน
   *     0.05 R ก่อนถึงด่านนี้อยู่แล้ว (ดู applyStopFloor ใน src/lib/costs.ts)
   *
   * อยากปิดเลนนี้: ลบบล็อก perTimeframe ทิ้ง แล้วเอา 15m ออกจาก --timeframes ของ workflow
   */
  perTimeframe: {
    '15m': {
      minStrength: 'moderate',
      minConfidence: 55,
      minRiskReward: 1.2,
      maxSignalsPerRun: 8,
    },
  },
};

// ── เหตุผลที่ตก ───────────────────────────────────────────────────────────

export type GateRejectCode =
  | 'no_signal'
  | 'action_hold'
  | 'invalid_levels'
  | 'below_min_strength'
  | 'below_min_confidence'
  | 'below_min_rr'
  | 'above_max_rr'
  | 'stop_too_tight'
  | 'stop_too_wide'
  | 'over_run_limit';

/** ป้ายสั้นภาษาไทย สำหรับสรุปลง log หรือแสดงในหน้าเว็บ */
export const GATE_REJECT_LABELS: Record<GateRejectCode, string> = {
  no_signal: 'ไม่มีสัญญาณ',
  action_hold: 'เป็น HOLD',
  invalid_levels: 'ราคา SL/TP ใช้ไม่ได้',
  below_min_strength: 'ไม่แรงพอ',
  below_min_confidence: 'ความมั่นใจต่ำ',
  below_min_rr: 'RR ต่ำเกิน',
  above_max_rr: 'RR สูงผิดปกติ',
  stop_too_tight: 'SL แคบเกิน',
  stop_too_wide: 'SL กว้างเกิน',
  over_run_limit: 'เกินโควตาต่อรอบ',
};

export interface GateRejection {
  code: GateRejectCode;
  /** ข้อความเต็มพร้อมตัวเลขจริง เพื่อให้ไล่ปัญหาได้โดยไม่ต้องเดา */
  message: string;
}

export interface GateVerdict {
  passed: boolean;
  /** null = คำนวณไม่ได้ (ไม่มีสัญญาณ / เป็น HOLD / ราคาผิดรูป) */
  riskReward: number | null;
  stopDistancePct: number | null;
  /** เก็บ "ทุก" เกณฑ์ที่ตก ไม่ใช่แค่อันแรก — จะได้รู้ว่าห่างจากผ่านแค่ไหน */
  rejections: GateRejection[];
}

/**
 * RR ของสัญญาณ — null เมื่อคำนวณไม่ได้
 * export ไว้ให้ตัวแจ้งเตือนเอาไปแสดงในข้อความได้ ไม่ต้องคำนวณเองให้สูตรแตกกัน
 */
export function riskRewardOf(signal: Signal): number | null {
  const risk = Math.abs(signal.entry_price - signal.stop_loss);
  const reward = Math.abs(signal.take_profit - signal.entry_price);
  if (!Number.isFinite(risk) || !Number.isFinite(reward) || risk <= 0) return null;
  return reward / risk;
}

/** ระยะ SL คิดเป็น % ของราคาเข้า — null เมื่อคำนวณไม่ได้ */
export function stopDistancePctOf(signal: Signal): number | null {
  const entry = signal.entry_price;
  const risk = Math.abs(entry - signal.stop_loss);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(risk)) return null;
  return (risk / entry) * 100;
}

/**
 * ตัดสินสัญญาณเดียวเทียบกับเกณฑ์
 *
 * หลักการ: ถ้าตกด้วยเหตุผล "โครงสร้าง" (ไม่มีสัญญาณ / HOLD / ราคาผิดรูป) จะคืนเหตุผลเดียว
 * เพราะเกณฑ์ตัวเลขที่เหลือไม่มีความหมายกับกรณีนั้น ส่วนกรณีปกติจะเก็บทุกเกณฑ์ที่ตก
 */
export function evaluateSignal(
  signal: Signal | null | undefined,
  gate: SignalGateConfig = SIGNAL_GATE
): GateVerdict {
  const structural = (code: GateRejectCode, message: string): GateVerdict => ({
    passed: false,
    riskReward: null,
    stopDistancePct: null,
    rejections: [{ code, message }],
  });

  if (!signal) return structural('no_signal', 'generateSignal ไม่คืนสัญญาณ (ข้อมูลแท่งไม่พอหรือราคาผิดรูป)');

  // เกณฑ์ของ timeframe นี้อาจถูกทับไว้ (ดู perTimeframe ใน SIGNAL_GATE)
  gate = gateForTimeframe(signal.timeframe, gate);

  const action: SignalAction = signal.action;
  if (action !== 'BUY' && action !== 'SELL') {
    return structural('action_hold', `ไม่ใช่สัญญาณเข้าไม้ (action = ${action})`);
  }

  const entry = signal.entry_price;
  const risk = Math.abs(entry - signal.stop_loss);
  const reward = Math.abs(signal.take_profit - entry);

  // ตรวจ "ทิศ" ด้วย ไม่ใช่แค่ว่าเป็นตัวเลข — signal-engine บังคับ invariant นี้ไว้ 3 ชั้นแล้ว
  // แต่สัญญาณอาจมาจากที่อื่น (แถวเก่าใน DB, โค้ดที่แก้ในอนาคต) ตรวจซ้ำที่ประตูจึงคุ้ม
  const directionOk =
    action === 'BUY'
      ? signal.stop_loss < entry && signal.take_profit > entry
      : signal.stop_loss > entry && signal.take_profit < entry;

  if (
    !Number.isFinite(entry) || entry <= 0 ||
    !Number.isFinite(risk) || risk <= 0 ||
    !Number.isFinite(reward) || reward <= 0 ||
    !directionOk
  ) {
    return structural(
      'invalid_levels',
      `ราคาไม่สมเหตุสมผลสำหรับ ${action}: entry ${entry} / SL ${signal.stop_loss} / TP ${signal.take_profit}`
    );
  }

  const riskReward = reward / risk;
  const stopDistancePct = (risk / entry) * 100;
  const rejections: GateRejection[] = [];

  if (STRENGTH_RANK[signal.strength] < STRENGTH_RANK[gate.minStrength]) {
    rejections.push({
      code: 'below_min_strength',
      message: `ความแรง ${signal.strength} ต่ำกว่าขั้นต่ำ ${gate.minStrength}`,
    });
  }

  if (!(signal.confidence >= gate.minConfidence)) {
    rejections.push({
      code: 'below_min_confidence',
      message: `ความมั่นใจ ${signal.confidence} ต่ำกว่าขั้นต่ำ ${gate.minConfidence}`,
    });
  }

  if (riskReward < gate.minRiskReward) {
    rejections.push({
      code: 'below_min_rr',
      message: `RR ${riskReward.toFixed(2)} ต่ำกว่าขั้นต่ำ ${gate.minRiskReward} (เสี่ยง ${stopDistancePct.toFixed(2)}% เพื่อกำไร ${((reward / entry) * 100).toFixed(2)}%)`,
    });
  }

  if (gate.maxRiskReward !== null && riskReward > gate.maxRiskReward) {
    rejections.push({
      code: 'above_max_rr',
      message: `RR ${riskReward.toFixed(2)} สูงกว่าเพดาน ${gate.maxRiskReward} — เป้ากำไรน่าจะไกลเกินกรอบเวลา`,
    });
  }

  if (stopDistancePct < gate.minStopDistancePct) {
    rejections.push({
      code: 'stop_too_tight',
      message: `ระยะ SL ${stopDistancePct.toFixed(3)}% แคบกว่าขั้นต่ำ ${gate.minStopDistancePct}%`,
    });
  }

  if (stopDistancePct > gate.maxStopDistancePct) {
    rejections.push({
      code: 'stop_too_wide',
      message: `ระยะ SL ${stopDistancePct.toFixed(2)}% กว้างกว่าเพดาน ${gate.maxStopDistancePct}%`,
    });
  }

  return { passed: rejections.length === 0, riskReward, stopDistancePct, rejections };
}

/**
 * จัดอันดับสัญญาณที่ผ่านเกณฑ์แล้ว — ใช้ตอนต้องเลือกว่าอันไหนได้ไปต่อเมื่อเกินโควตา
 *
 * ลำดับการเรียง:
 *   1. confidence มากก่อน — เป็นตัวเดียวที่ signal-engine คำนวณขึ้นมาเพื่อบอก "มีหลักฐานแค่ไหน"
 *      (แม้จะหยาบ: สัญญาณที่ผ่านเกณฑ์มี confidence แค่ 3 ค่า คือ 70 / 76 / 82)
 *   2. RR มากก่อน — เมื่อหลักฐานเท่ากัน อันที่จ่ายมากกว่าต่อความเสี่ยงหนึ่งหน่วยคือเดิมพันที่ดีกว่า
 *      ภายใต้สมมติฐานว่าอัตราชนะของทั้งคู่ใกล้เคียงกัน
 *   3. symbol แล้วตามด้วย timeframe (เรียงตัวอักษร) — ไม่ได้มีความหมายทางการเทรด
 *      แต่ทำให้ผลลัพธ์ "เหมือนเดิมทุกครั้ง" ไม่ขึ้นกับลำดับที่ตัวสแกนบังเอิญดึงข้อมูลมาได้
 *      ซึ่งจำเป็นตอนไล่ปัญหาย้อนหลัง
 *
 * ⚠ [รอผลวิจัย] ลำดับนี้เป็นการตัดสินใจเชิงเหตุผล ยังไม่ได้พิสูจน์ว่าเรียงแบบนี้แล้ว
 *   ได้ไม้ที่ดีกว่าเรียงแบบอื่น ข่าวดีคือมันแทบไม่มีผล เพราะเพดาน 5 อัน/รอบ ไปแตะแค่
 *   0.8% ของรอบทั้งหมด — 99.2% ของรอบทุกอันได้ผ่านหมดอยู่แล้ว ลำดับจึงไม่ถูกใช้
 */
export function rankSignals(signals: readonly Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const ra = riskRewardOf(a) ?? 0;
    const rb = riskRewardOf(b) ?? 0;
    if (rb !== ra) return rb - ra;
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return a.timeframe.localeCompare(b.timeframe);
  });
}

/** สัญญาณที่ถูกกรองทิ้ง — เก็บพอให้รายงานได้ว่าตกอะไรไปเพราะอะไร โดยไม่ต้องแบก Signal ทั้งก้อน */
export interface RejectedSignal {
  symbol: string;
  market: MarketType;
  timeframe: string;
  action: SignalAction;
  strength: SignalStrength;
  riskReward: number | null;
  stopDistancePct: number | null;
  rejections: GateRejection[];
}

export interface GateSelection {
  /** ผ่านเกณฑ์และอยู่ในโควตา เรียงตาม rankSignals() แล้ว — เอาไปบันทึก/แจ้งเตือนได้เลย */
  accepted: Signal[];
  rejected: RejectedSignal[];
  /** จำนวนสัญญาณที่พิจารณาทั้งหมดในรอบนี้ */
  evaluated: number;
  /**
   * นับตามรหัสเหตุผล — ผลรวมของตัวเลขในนี้ "มากกว่า" rejected.length ได้
   * เพราะสัญญาณเดียวตกได้หลายเกณฑ์พร้อมกัน (เช่น ไม่แรงพอ + RR ต่ำ)
   */
  summary: Partial<Record<GateRejectCode, number>>;
}

/**
 * ประตูหลัก: รับสัญญาณดิบทั้งรอบ → คืนตัวที่ควรแจ้งเตือน + รายการที่ตกพร้อมเหตุผล
 *
 * ตัวสแกนควรเรียกตัวนี้ตัวเดียว แล้วเอา summary ใส่ response ของ cron
 * เพื่อให้ตอบได้ว่า "รอบนี้กรองอะไรทิ้งไปเพราะอะไร" ไม่ใช่เงียบแล้วเดาเอาว่าตลาดนิ่ง
 *
 * ⚠ เรียกแยกต่อผู้ใช้หนึ่งคน — maxSignalsPerRun เป็นโควตาต่อการเรียกหนึ่งครั้ง
 */
export function selectSignals(
  candidates: ReadonlyArray<Signal | null | undefined>,
  gate: SignalGateConfig = SIGNAL_GATE
): GateSelection {
  const passed: Signal[] = [];
  const rejected: RejectedSignal[] = [];
  const summary: Partial<Record<GateRejectCode, number>> = {};

  const note = (codes: readonly GateRejectCode[]) => {
    for (const c of codes) summary[c] = (summary[c] ?? 0) + 1;
  };

  for (const candidate of candidates) {
    const verdict = evaluateSignal(candidate, gate);
    if (verdict.passed && candidate) {
      passed.push(candidate);
      continue;
    }
    note(verdict.rejections.map((r) => r.code));
    // ไม่มีสัญญาณ = ไม่มีอะไรให้รายงานเป็นรายตัว นับรวมใน summary พอ
    if (!candidate) continue;
    rejected.push({
      symbol: candidate.symbol,
      market: candidate.market,
      timeframe: candidate.timeframe,
      action: candidate.action,
      strength: candidate.strength,
      riskReward: verdict.riskReward,
      stopDistancePct: verdict.stopDistancePct,
      rejections: verdict.rejections,
    });
  }

  const ranked = rankSignals(passed);
  const accepted = ranked.slice(0, gate.maxSignalsPerRun);

  // ที่เกินโควตา "ผ่านคุณภาพแล้วแต่ไม่ได้ไปต่อ" — ต้องรายงานแยกจากที่ตกคุณภาพ
  // เพราะสองอย่างนี้บอกคนละเรื่อง: อันนี้แปลว่าเกณฑ์หลวมไป หรือตลาดขยับพร้อมกันทั้งกระดาน
  for (const overflow of ranked.slice(gate.maxSignalsPerRun)) {
    const rejection: GateRejection = {
      code: 'over_run_limit',
      message: `ผ่านเกณฑ์แล้วแต่เกินโควตา ${gate.maxSignalsPerRun} สัญญาณ/รอบ`,
    };
    note(['over_run_limit']);
    rejected.push({
      symbol: overflow.symbol,
      market: overflow.market,
      timeframe: overflow.timeframe,
      action: overflow.action,
      strength: overflow.strength,
      riskReward: riskRewardOf(overflow),
      stopDistancePct: stopDistancePctOf(overflow),
      rejections: [rejection],
    });
  }

  return { accepted, rejected, evaluated: candidates.length, summary };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. หน้าสัญญาแบบย่อ สำหรับตัวสแกน
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ชื่อย่อของ SYMBOL_UNIVERSE
 *
 * scripts/scan-universe.mjs โหลดไฟล์นี้ตอนรันแล้วมองหา export ชื่อ `UNIVERSE` กับ
 * `passesGate` ตรง ๆ (ถ้าไม่เจอมันจะหยุดทำงานทันทีโดยเจตนา ไม่มีเกณฑ์สำรอง)
 * จึงต้องมีชื่อนี้อยู่ด้วย ไม่ใช่แค่ SYMBOL_UNIVERSE
 * ทั้งสองชื่อชี้ของก้อนเดียวกัน แก้รายชื่อที่เดียวคือ SYMBOL_UNIVERSE ข้างบน
 */
export const UNIVERSE = SYMBOL_UNIVERSE;

/** ผลตัดสินแบบย่อ — รูปแบบที่ตัวสแกนคาดหวัง */
export interface GateOutcome {
  ok: boolean;
  /** ป้ายสั้น ๆ ใช้เป็น "คีย์" ในการนับสถิติ จึงต้องไม่มีตัวเลขของแต่ละสัญญาณปนมา */
  reason?: string;
  /** ข้อความเต็มพร้อมตัวเลขจริง สำหรับไล่ปัญหาทีละอัน */
  detail?: string;
}

/**
 * ประตูแบบสัญญาณเดียว → { ok, reason } — เป็นหน้าบางของ evaluateSignal()
 *
 * ทำไมต้องมีทั้งสองแบบ: ตัวสแกนต้องการเอา reason ไปเป็นคีย์ของ Map เพื่อนับว่า
 * "รอบนี้ตกเพราะอะไรกี่อัน" ถ้าคืนข้อความเต็มที่มีตัวเลขของแต่ละสัญญาณปนอยู่
 * (เช่น "RR 1.18 ต่ำกว่าขั้นต่ำ 1.5") ทุกคีย์จะไม่ซ้ำกันเลย สถิติก็จะกลายเป็น
 * รายการยาวเหยียดที่นับอะไรไม่ได้ — reason จึงเป็นป้ายสั้นจาก GATE_REJECT_LABELS
 * ส่วนข้อความเต็มย้ายไปอยู่ใน detail ให้ใช้ตอนไล่ปัญหาทีละอัน
 *
 * เมื่อตกหลายเกณฑ์พร้อมกัน reason จะรายงานเกณฑ์แรกตามลำดับใน evaluateSignal()
 * (ความแรง → ความมั่นใจ → RR → เพดาน RR → SL แคบ → SL กว้าง) ซึ่งเรียงจาก
 * "พื้นฐานที่สุด" ไปหา "รายละเอียดที่สุด" จงใจ เพราะสถิติที่อ่านแล้วมีประโยชน์คือ
 * "ตกเพราะไม่แรงพอ 71 อัน" ไม่ใช่ "ตกเพราะ SL กว้างเกิน" ของสัญญาณที่ไม่แรงพออยู่แล้ว
 */
export function passesGate(
  signal: Signal | null | undefined,
  gate: SignalGateConfig = SIGNAL_GATE
): GateOutcome {
  const verdict = evaluateSignal(signal, gate);
  if (verdict.passed) return { ok: true };
  const first = verdict.rejections[0];
  return { ok: false, reason: GATE_REJECT_LABELS[first.code], detail: first.message };
}

/**
 * สรุป summary เป็นข้อความไทยบรรทัดเดียว สำหรับใส่ log ของ cron
 * เช่น "กรองทิ้ง: ไม่แรงพอ 71, RR ต่ำเกิน 33, SL กว้างเกิน 4"
 */
export function describeRejections(summary: Partial<Record<GateRejectCode, number>>): string {
  const parts = (Object.entries(summary) as Array<[GateRejectCode, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `${GATE_REJECT_LABELS[code]} ${n}`);
  if (parts.length === 0) return 'ไม่มีสัญญาณที่ถูกกรองทิ้ง';
  return `กรองทิ้ง: ${parts.join(', ')}`;
}
