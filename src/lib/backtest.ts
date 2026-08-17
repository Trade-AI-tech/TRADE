import type { CandleData, Signal, SignalStrength } from '@/types';
import { generateSignal } from './signal-engine';

/**
 * Backtest engine — เครื่อง "วัด" ไม่ใช่เครื่อง "พยากรณ์"
 *
 * ไฟล์นี้เดินย้อนข้อมูลจริงทีละแท่ง (walk-forward) แล้วป้อนให้ generateSignal
 * ตัวเดียวกับที่รันจริงในระบบ เพื่อวัดว่ากติกาสัญญาณปัจจุบันเคยให้ผลอย่างไร
 * ในอดีต — ผลลัพธ์คือ "สถิติที่วัดได้จริง" ไม่ใช่คำสัญญา และผลในอดีต
 * ไม่การันตีอนาคตแม้แต่น้อย
 *
 * ทำไมต้อง import generateSignal ตรง ๆ ไม่เขียนตรรกะสัญญาณซ้ำในนี้:
 * ถ้า backtest มีเครื่องคำนวณของตัวเอง มันจะวัด "คนละเครื่อง" กับที่ผู้ใช้
 * ได้สัญญาณจริง แล้วตัวเลขทุกตัวที่รายงานจะกลายเป็นเรื่องแต่งทันที
 *
 * ข้อจำกัดที่ต้องรู้ก่อนเชื่อตัวเลข (บอกตรง ๆ ไม่อ้อม):
 * - ทดสอบบนแท่ง OHLC จึง "ไม่เห็นลำดับราคาภายในแท่ง" — แท่งที่แตะทั้ง SL และ TP
 *   เราบอกไม่ได้ว่าราคาไปทางไหนก่อน จึงนับ SL ก่อนเสมอ (เลือกทางแย่ไว้ก่อน
 *   ตรงกับกฎของ position-monitor — รายงานขาดทุนที่อาจไม่เกิด ดีกว่ารายงานกำไร
 *   ที่อาจไม่เคยเกิด)
 * - ไม่รวม spread / slippage / ค่าคอมจริงของโบรกเกอร์ — มีเพียงพารามิเตอร์ feesR
 *   ให้ผู้ใช้หักเองเป็นสัดส่วนของ R ต่อไม้ (default 0 = ยังไม่หักอะไรเลย)
 * - ไม่มี look-ahead bias: สัญญาณที่แท่ง i เห็นข้อมูลแค่ถึงแท่ง i และเข้าไม้ที่
 *   "ราคาเปิดของแท่ง i+1" เพราะสัญญาณคำนวณจากราคาปิดแท่ง i จะเข้าที่ราคานั้นไม่ได้จริง
 *
 * ไฟล์นี้ pure ล้วน — ไม่แตะ network / DB / เวลาเครื่อง ผู้เรียกต้องหาแท่งมาป้อนเอง
 *
 * ═══════════════════ 1R คืออะไร — และทำไมนิยามเดิมใช้ไม่ได้ ═══════════════════
 *
 * R คือ "กำไร/ขาดทุน หารด้วยเงินที่ตั้งใจเสี่ยงกับไม้นั้น" ตัวหารจึงเป็นหน่วยวัด
 * ไม่ใช่ผลลัพธ์ ถ้าตัวหารเปลี่ยนไปเรื่อย ๆ ตามเหตุบังเอิญ การเอา R มาเฉลี่ยกัน
 * ก็เหมือนเอาราคาสินค้าจากหลายสกุลเงินมาบวกกันโดยไม่แปลงสกุล
 *
 * นิยามเดิม (riskModel = 'realized') ใช้ |ราคาเปิดแท่งถัดไป − SL| เป็นตัวหาร
 * ปัญหา: ราคาเปิดแท่งถัดไปเป็น "ผลของ gap" ซึ่งเป็นตัวแปรสุ่มที่เกิดหลังตัดสินใจแล้ว
 * ถ้าเปิดมากระโดดเกือบทับ SL ตัวหารจะเหลือเศษเสี้ยว แล้ว R ของไม้เดียวก็ใหญ่ได้ไม่จำกัด
 * (วัดจริงในคลังวิจัย: ไม้เดียวเคยได้ R = 166.5 และไม้ 0.1% ที่สุดขั้วที่สุดคิดเป็น
 *  105.7% ของกำไรรวมทั้งชุด — ค่าเฉลี่ยจึงไม่ได้วัดกฎ แต่วัดว่าบังเอิญมีไม้แบบนี้กี่ไม้)
 *
 * นิยามที่ใช้ตอนนี้ (riskModel = 'planned' — ค่าเริ่มต้น) ใช้ |ราคาที่สัญญาณคิดไว้ − SL|
 * คือระยะที่ผู้เทรด "ตกลงจะเสี่ยง" ตอนกดสั่ง ซึ่งเป็นตัวเดียวกับที่ใช้คิดขนาดไม้จริง
 * (ซื้อกี่หน่วย = เงินที่ยอมเสี่ยง ÷ ระยะนี้) ตัวหารจึงถูกล็อกก่อนรู้ผล และ gap
 * กลับไปอยู่ใน "เศษ" ตามความเป็นจริง: เปิดกระโดดหนีจาก SL = ขาดทุนเกิน 1R ได้จริง
 * และเปิดกระโดดเข้าหา SL = ขาดทุนน้อยกว่า 1R จริง เพราะไม้เล็กลงตามระยะที่เหลือไม่ได้
 *
 * รายละเอียดการวัดก่อน/หลัง อยู่ที่ scripts/research/report/metric-fix.md
 * ทั้งสองนิยามถูกคำนวณและเก็บไว้ทุกไม้เสมอ (rPlanned / rRealized) เพื่อให้เทียบกันได้
 */

export type BacktestExitReason =
  | 'stop_loss'   // ราคาในแท่งแตะระดับ SL → ออกที่ระดับ SL
  | 'take_profit' // ราคาในแท่งแตะระดับ TP → ออกที่ระดับ TP
  | 'time_exit'   // ถือครบ maxHoldBars โดยไม่ชนอะไร → ออกที่ราคาปิดแท่งสุดท้ายของช่วงถือ
  | 'gap_stop'    // แท่งเปิด "ทะลุ" SL ไปแล้ว → ออกที่ราคาเปิด (คำสั่ง stop จริงโดน fill ที่ราคาตลาด)
  | 'gap_target'; // แท่งเปิดทะลุ TP ไปแล้ว → ออกที่ราคาเปิดเช่นกัน

/** ตัวหารของ R — ดูเหตุผลของค่าเริ่มต้นในหัวไฟล์ */
export type RiskModel =
  | 'planned'   // |ราคาที่สัญญาณคิดไว้ − SL| — ล็อกก่อนรู้ผล = หน่วยวัดที่ใช้คิดขนาดไม้จริง
  | 'realized'; // |ราคาเปิดจริง − SL| — นิยามเดิม เก็บไว้เทียบย้อนหลังเท่านั้น

export interface BacktestTrade {
  action: 'BUY' | 'SELL';
  entryIndex: number;
  exitIndex: number;
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  exitReason: BacktestExitReason;
  /** R multiple ตาม riskModel ที่เลือก หลังหัก feesR แล้ว — เท่ากับ rPlanned หรือ rRealized ตัวใดตัวหนึ่งเป๊ะ */
  r: number;
  /** ระยะเสี่ยงที่ "ตั้งใจไว้" ตอนออกสัญญาณ = |signal.entry_price − SL| (> 0 เสมอ) */
  plannedRisk: number;
  /** ระยะเสี่ยงที่ "เหลือจริง" หลังราคาเปิด = |ราคาเข้า − SL| (เป็น 0 ได้ถ้าเปิดทับ SL พอดี) */
  realizedRisk: number;
  /** R เมื่อหารด้วย plannedRisk (หัก feesR แล้ว) */
  rPlanned: number;
  /**
   * R เมื่อหารด้วย realizedRisk (หัก feesR แล้ว) — นิยามเดิม เก็บไว้เทียบย้อนหลัง
   * null = วัดด้วยนิยามเดิมไม่ได้ (ราคาเปิดทับ SL พอดี ตัวหารเป็นศูนย์)
   * ตามกติกาเลขของไฟล์นี้: ไม่มีข้อมูลพอจะวัด = null ห้ามเดาเป็น 0
   */
  rRealized: number | null;
  /** จำนวนแท่งหลังจากแท่งที่เข้า (ออกภายในแท่งเดียวกับที่เข้า = 0) */
  holdBars: number;
  entryTime: string;
  exitTime: string;
  confidence: number;
  strength: SignalStrength;
}

/**
 * สถิติของกลุ่มเทรดหนึ่งชุด
 * กติกาเลข: ค่าที่ "ไม่มีข้อมูลพอจะวัด" เป็น null เสมอ ห้ามเดาเป็น 0
 * (0 แปลว่าวัดแล้วได้ศูนย์ ซึ่งคนละความหมายกับยังไม่เคยวัด)
 */
export interface BacktestStats {
  count: number;
  /** ไม้ที่ R > 0 */
  wins: number;
  /** ไม้ที่ R < 0 — ไม้เสมอตัว (R = 0) ไม่นับเป็นทั้งชนะและแพ้ แต่ยังอยู่ใน count */
  losses: number;
  /** wins / count — null เมื่อไม่มีเทรดให้วัด */
  winRate: number | null;
  /**
   * grossWinR / grossLossR — null เมื่อไม่มีไม้แพ้เลย (ไม่ใช่ Infinity)
   * เพราะอัตราส่วนที่ตัวหารเป็นศูนย์ไม่ใช่ตัวเลขที่เอาไปเทียบกับใครได้
   */
  profitFactor: number | null;
  avgR: number | null;
  /**
   * winRate*avgWinR - lossRate*avgLossR — ทางคณิตศาสตร์เท่ากับ avgR เป๊ะ
   * ใส่แยกไว้เพราะเป็นชื่อที่นักเทรดใช้เรียกค่านี้ ไม่ใช่ค่าที่วัดคนละอย่าง
   */
  expectancyR: number | null;
  /** drawdown ลึกสุดของ equity curve สะสมเป็น R (เรียงตามลำดับไม้) — null เมื่อไม่มีเทรด */
  maxDrawdownR: number | null;
  maxConsecutiveLosses: number;
  /** ผลรวม R ของไม้ชนะ (≥ 0) */
  grossWinR: number;
  /** ผลรวม |R| ของไม้แพ้ เก็บเป็นค่าบวก (≥ 0) */
  grossLossR: number;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  /**
   * ตัวหารของ R ที่ใช้ในผลชุดนี้ — ผู้แสดงผลต้องบอกผู้ใช้เสมอว่า "1R" หมายถึงอะไร
   * ไม่งั้นตัวเลขเดียวกันจะถูกอ่านผิดความหมายเมื่อเทียบกับผลเก่า
   */
  riskModel: RiskModel;
  /** จำนวนแท่งทั้งหมดที่ใช้ทดสอบ */
  bars: number;
  trades: BacktestTrade[];
  /**
   * สัญญาณ BUY/SELL ที่ต้องทิ้งเพราะเข้าไม้ไม่ได้จริง:
   * แท่งเข้าข้อมูลเสีย หรือระยะเสี่ยงตาม riskModel เป็น 0/ใช้ไม่ได้ (หาร R ไม่ได้)
   * ไม่รวมสัญญาณที่ถูกข้ามเพราะกำลังถือไม้อยู่ (อันนั้นคือกติกา ไม่ใช่ข้อมูลเสีย)
   */
  skipped: number;
  stats: BacktestStats & {
    byAction: { BUY: BacktestStats; SELL: BacktestStats };
  };
}

export interface BacktestInput {
  symbol: string;
  name: string;
  market: Signal['market'];
  timeframe: string;
  candles: CandleData[];
  /** ถือได้นานสุดกี่แท่ง (นับแท่งเข้าเป็นแท่งแรก) — default 10 */
  maxHoldBars?: number;
  /**
   * จำนวนแท่งขั้นต่ำก่อนเริ่มยิงสัญญาณ — default 60
   * ต้องพอให้ MA50 + Bollinger(20) มีค่าจริง ไม่ใช่ NaN ช่วงอุ่นเครื่อง
   */
  minHistory?: number;
  /**
   * ต้นทุนต่อไม้คิดเป็นสัดส่วนของ R (หักออกจาก R ของทุกไม้)
   * default 0 = ยังไม่รวมค่าธรรมเนียม/สลิปเพจใด ๆ — ผู้แสดงผลต้องบอกผู้ใช้ชัด ๆ
   */
  feesR?: number;
  /**
   * ตัวหารของ R — default 'planned' (เหตุผลอยู่ในหัวไฟล์)
   * ใส่ 'realized' เมื่อต้องการ "ตัวเลขแบบเดิมเป๊ะ" เพื่อเทียบย้อนหลังเท่านั้น
   */
  riskModel?: RiskModel;
}

/** แท่งที่เชื่อถือได้พอจะใช้ตัดสินการชน SL/TP — ราคาทุกตัวเป็นบวกจริงและ low ไม่กลับหัว */
function isUsableBar(c: CandleData): boolean {
  return (
    Number.isFinite(c.open) && c.open > 0 &&
    Number.isFinite(c.high) && c.high > 0 &&
    Number.isFinite(c.low) && c.low > 0 &&
    Number.isFinite(c.close) && c.close > 0 &&
    c.low <= c.high
  );
}

/**
 * คำนวณสถิติจากรายการเทรด (เรียงตามลำดับเวลาอยู่แล้วเพราะ walk-forward ถือทีละไม้)
 * แยกเป็นฟังก์ชันเพราะต้องคิดทั้งภาพรวมและแยกฝั่ง BUY/SELL ด้วยกติกาเดียวกันเป๊ะ
 */
function computeStats(trades: BacktestTrade[]): BacktestStats {
  const count = trades.length;
  let wins = 0;
  let losses = 0;
  let sumR = 0;
  let grossWinR = 0;
  let grossLossR = 0;

  // equity curve สะสมเป็น R — วัด drawdown จากจุดสูงสุดที่เคยไปถึง
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;

  let maxConsecutiveLosses = 0;
  let streak = 0;

  for (const t of trades) {
    sumR += t.r;
    if (t.r > 0) {
      wins++;
      grossWinR += t.r;
    } else if (t.r < 0) {
      losses++;
      grossLossR += -t.r;
    }
    // ไม้เสมอตัว (r = 0) ตัดสตรีคแพ้ — มันไม่ได้เสียเงิน จึงไม่ต่อสตรีค
    streak = t.r < 0 ? streak + 1 : 0;
    if (streak > maxConsecutiveLosses) maxConsecutiveLosses = streak;

    equity += t.r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdownR) maxDrawdownR = dd;
  }

  const avgR = count > 0 ? sumR / count : null;

  return {
    count,
    wins,
    losses,
    winRate: count > 0 ? wins / count : null,
    profitFactor: count > 0 && grossLossR > 0 ? grossWinR / grossLossR : null,
    avgR,
    // นิยาม expectancy = P(win)*avgWin - P(loss)*avgLoss
    //                  = (grossWinR - grossLossR) / count = avgR — เท่ากันเสมอ
    expectancyR: avgR,
    maxDrawdownR: count > 0 ? maxDrawdownR : null,
    maxConsecutiveLosses,
    grossWinR,
    grossLossR,
  };
}

/**
 * รัน backtest แบบ walk-forward ทีละแท่ง
 *
 * ลำดับเหตุการณ์ต่อหนึ่งไม้ (ตัวอย่างฝั่ง BUY — SELL กลับด้านทุกเงื่อนไข):
 * 1. ที่แท่ง i: สัญญาณเห็นข้อมูลแค่ candles[0..i] (ห้ามเห็นอนาคตเด็ดขาด)
 * 2. ได้ BUY → เข้าที่ "ราคาเปิดของแท่ง i+1" — SL/TP จากสัญญาณกลายเป็นระดับราคา
 *    ตายตัว เหมือนคำสั่งที่วางค้างไว้กับโบรกเกอร์
 * 3. ไล่ตรวจทีละแท่งตั้งแต่แท่งเข้า:
 *    - เปิดทะลุ SL (open <= SL) → ออกที่ open ทันที ไม่ใช่ระดับ SL
 *      เพราะคำสั่ง stop จริงโดน fill ที่ราคาตลาด ไม่ใช่ราคาที่ตั้งไว้ (gap realism)
 *    - เปิดทะลุ TP (open >= TP) → ออกที่ open เช่นกัน
 *    - low แตะ SL → ออกที่ระดับ SL / high แตะ TP → ออกที่ระดับ TP
 *    - แตะทั้งคู่ในแท่งเดียว → นับ SL ก่อนเสมอ (OHLC ไม่บอกลำดับภายในแท่ง)
 * 4. ไม่ชนอะไรจนครบ maxHoldBars → ปิดที่ราคาปิดแท่งสุดท้ายของช่วงถือ
 * 5. ระหว่างถือ สัญญาณใหม่ถูกข้าม (ทีละไม้ ไม่ทบไม้) — กลับมาหาสัญญาณได้อีกครั้ง
 *    ที่แท่งที่ปิดไม้ เพราะ ณ ราคาปิดแท่งนั้นสถานะว่างแล้ว และสัญญาณที่คำนวณจาก
 *    ราคาปิดแท่งเดียวกันจะเข้าไม้ใหม่ที่แท่งถัดไป จึงไม่มี look-ahead
 */
export function runBacktest(input: BacktestInput): BacktestResult {
  const { symbol, name, market, timeframe, candles } = input;
  const maxHoldBars = Math.max(1, Math.floor(input.maxHoldBars ?? 10));
  // ต่ำกว่า 50 สัญญาณไม่ยอมออกอยู่แล้ว (generateSignal ต้องการ 50 แท่ง) บังคับพื้นไว้กันหลงลืม
  const minHistory = Math.max(50, Math.floor(input.minHistory ?? 60));
  const feesR = Number.isFinite(input.feesR) ? (input.feesR as number) : 0;
  const riskModel: RiskModel = input.riskModel === 'realized' ? 'realized' : 'planned';

  const trades: BacktestTrade[] = [];
  let skipped = 0;

  // เดินจาก minHistory ถึง candles.length - 2 — ต้องเหลือแท่ง i+1 ให้เข้าไม้เสมอ
  let i = minHistory;
  while (i <= candles.length - 2) {
    // สัญญาณเห็นเฉพาะอดีต: slice ถึงแท่ง i เท่านั้น
    const hist = candles.slice(0, i + 1);
    const sig = generateSignal({ symbol, name, market, candles: hist, timeframe });

    if (!sig || (sig.action !== 'BUY' && sig.action !== 'SELL')) {
      i++;
      continue;
    }

    const entryIndex = i + 1;
    const entryBar = candles[entryIndex];

    // แท่งเข้าข้อมูลเสีย (Yahoo คืน null มาเป็น 0 ได้) → เข้าไม้กับราคาผีไม่ได้
    if (!isUsableBar(entryBar)) {
      skipped++;
      i++;
      continue;
    }

    const isLong = sig.action === 'BUY';
    const dir = isLong ? 1 : -1;
    const entry = entryBar.open;
    const stopLoss = sig.stop_loss;
    const takeProfit = sig.take_profit;

    // ── ตัวหารของ R: คิดทั้งสองนิยามเสมอ เลือกใช้ตาม riskModel ──
    //
    // plannedRisk  ระยะที่ตกลงจะเสี่ยงตอนกดสั่ง (คิดจากราคาที่สัญญาณเห็น = ปิดแท่ง i)
    //              signal-engine การันตีว่า SL อยู่ถูกฝั่งและไม่ยุบเท่า entry หลังปัดทศนิยม
    //              (ถ้ายุบ มันคืน null ไปแล้ว) ค่านี้จึงเป็นบวกเสมอสำหรับสัญญาณที่ออกมาจริง
    // realizedRisk ระยะที่เหลือหลังราคาเปิดแท่ง i+1 — เป็น 0 ได้เมื่อเปิดมาทับ SL พอดี
    //              และ "เกือบ 0" ได้บ่อยกว่านั้นมาก ซึ่งคือต้นเหตุที่นิยามเดิมพัง
    const plannedRisk = Math.abs(sig.entry_price - stopLoss);
    const realizedRisk = Math.abs(entry - stopLoss);
    const riskPerUnit = riskModel === 'realized' ? realizedRisk : plannedRisk;
    if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) {
      skipped++;
      i++;
      continue;
    }

    // ช่วงถือ: แท่ง entryIndex ถึง entryIndex + maxHoldBars - 1 (นับแท่งเข้าเป็นแท่งแรก)
    // ข้อมูลหมดก่อนครบช่วง → ตัดจบที่แท่งสุดท้ายที่มีจริง ไม่แต่งแท่งเพิ่ม
    const lastHoldIndex = Math.min(entryIndex + maxHoldBars - 1, candles.length - 1);

    let exitIndex = -1;
    let exit = NaN;
    let exitReason: BacktestExitReason = 'time_exit';
    // แท่งสุดท้ายที่ข้อมูลใช้ได้ — เผื่อ time exit ไปตกแท่งเสีย (อย่างน้อยมีแท่งเข้าเสมอ)
    let lastUsableIndex = entryIndex;

    for (let j = entryIndex; j <= lastHoldIndex; j++) {
      const bar = candles[j];
      // แท่งข้อมูลเสียตัดสินการชนไม่ได้ — ข้ามไปแท่งถัดไปแทนที่จะเดาผล
      if (!isUsableBar(bar)) continue;
      lastUsableIndex = j;

      if (isLong) {
        if (bar.open <= stopLoss) {
          exitIndex = j; exit = bar.open; exitReason = 'gap_stop'; break;
        }
        if (bar.open >= takeProfit) {
          exitIndex = j; exit = bar.open; exitReason = 'gap_target'; break;
        }
        // เช็ค SL ก่อน TP เสมอ — แท่งที่แตะทั้งคู่ต้องจบเป็นขาดทุน (worst case)
        if (bar.low <= stopLoss) {
          exitIndex = j; exit = stopLoss; exitReason = 'stop_loss'; break;
        }
        if (bar.high >= takeProfit) {
          exitIndex = j; exit = takeProfit; exitReason = 'take_profit'; break;
        }
      } else {
        if (bar.open >= stopLoss) {
          exitIndex = j; exit = bar.open; exitReason = 'gap_stop'; break;
        }
        if (bar.open <= takeProfit) {
          exitIndex = j; exit = bar.open; exitReason = 'gap_target'; break;
        }
        if (bar.high >= stopLoss) {
          exitIndex = j; exit = stopLoss; exitReason = 'stop_loss'; break;
        }
        if (bar.low <= takeProfit) {
          exitIndex = j; exit = takeProfit; exitReason = 'take_profit'; break;
        }
      }
    }

    if (exitIndex === -1) {
      // ไม่ชนอะไรเลยตลอดช่วงถือ → ปิดที่ราคาปิดของแท่งใช้ได้แท่งสุดท้ายในช่วง
      exitIndex = lastUsableIndex;
      exit = candles[lastUsableIndex].close;
      exitReason = 'time_exit';
    }

    // เศษของ R เหมือนกันทุกนิยาม — ต่างกันแค่ตัวหาร จึงคำนวณครั้งเดียวแล้วหารสองแบบ
    const pnlPerUnit = (exit - entry) * dir;
    const rPlanned = pnlPerUnit / plannedRisk - feesR;
    // realizedRisk = 0 → null: "วัดด้วยนิยามเดิมไม่ได้" ไม่ใช่ "วัดได้เท่ากับ 0"
    // (ไม้แบบนี้ยังนับได้ตามปกติภายใต้ riskModel = 'planned' และมันคือกรณีที่นิยามเดิมทิ้งทิ้งไป)
    const rRealized = realizedRisk > 0 ? pnlPerUnit / realizedRisk - feesR : null;
    // riskModel = 'realized' จะไม่มีทางมาถึงบรรทัดนี้พร้อม rRealized = null
    // เพราะไม้ที่ realizedRisk = 0 ถูกนับเป็น skipped ไปแล้วข้างบน
    const r = riskModel === 'realized' ? (rRealized as number) : rPlanned;

    trades.push({
      action: sig.action,
      entryIndex,
      exitIndex,
      entry,
      exit,
      stopLoss,
      takeProfit,
      exitReason,
      r,
      plannedRisk,
      realizedRisk,
      rPlanned,
      rRealized,
      holdBars: exitIndex - entryIndex,
      entryTime: entryBar.timestamp,
      exitTime: candles[exitIndex].timestamp,
      confidence: sig.confidence,
      strength: sig.strength,
    });

    // กลับมาหาสัญญาณต่อที่แท่งที่ปิดไม้ (สถานะว่างแล้ว ณ ราคาปิดแท่งนั้น)
    // exitIndex >= i + 1 เสมอ ลูปจึงเดินหน้าแน่นอน ไม่วนติดที่เดิม
    i = exitIndex;
  }

  const all = computeStats(trades);

  return {
    symbol,
    timeframe,
    riskModel,
    bars: candles.length,
    trades,
    skipped,
    stats: {
      ...all,
      byAction: {
        BUY: computeStats(trades.filter((t) => t.action === 'BUY')),
        SELL: computeStats(trades.filter((t) => t.action === 'SELL')),
      },
    },
  };
}
