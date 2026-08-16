/**
 * ตรรกะเฝ้าออเดอร์ที่เปิดอยู่ — ตัดสินว่าราคาไปแตะ SL/TP แล้วหรือยัง และคำนวณกำไร/ขาดทุน
 *
 * ไฟล์นี้ตั้งใจให้เป็นตรรกะบริสุทธิ์ ไม่แตะฐานข้อมูลและไม่ยิง network
 * เพราะเป็นกฎที่ชี้ขาดว่าออเดอร์ของผู้ใช้จะถูกบันทึกว่ากำไร/ขาดทุนเท่าไร
 * ต้องเรียกซ้ำกี่ครั้งก็ได้ผลเดิม และทดสอบได้โดยไม่ต้องมี Supabase หรือ Yahoo
 *
 * ย้ำให้ชัด: "ปิดออเดอร์อัตโนมัติ" ในที่นี้คือการบันทึกลงสมุดเทรดว่า
 * ถ้ามีคำสั่ง SL/TP วางไว้จริงกับโบรกเกอร์ ราคาจะโดนตัดตรงไหน
 * ระบบไม่ได้ต่อกับโบรกเกอร์ และไม่เคยส่งคำสั่งซื้อขายจริง
 */

export type CloseReason = 'manual' | 'stop_loss' | 'take_profit';

export interface PriceWindow {
  price: number;
  low: number;
  high: number;
}

export interface PositionInput {
  direction: 'long' | 'short';
  entry_price: number;
  quantity: number;
  fees: number;
  stop_loss: number | null;
  take_profit: number | null;
}

export interface PositionOutcome {
  pnl: number;
  pnl_percent: number;
  hit: CloseReason | null;
  exit_price: number | null;
  /**
   * ด้านที่ถูก "เมิน" เพราะระดับที่ตั้งไว้อยู่ผิดฝั่งของราคาเข้า
   * (เช่น long ที่ตั้ง stop_loss ไว้สูงกว่า entry)
   * ปล่อยออเดอร์ไว้เฉย ๆ ปลอดภัยกว่าปิดทิ้งด้วยป้ายที่ขัดกับตัวเลข
   * แต่ต้องรายงานออกไปให้เห็น ไม่ใช่กลืนเงียบ
   */
  ignored: Array<'stop_loss' | 'take_profit'>;
}

/**
 * ค่าที่ผ่าน PostgREST มาอาจเป็น string (postgres numeric ถูก serialize เป็น string
 * เพื่อกันความแม่นยำหาย) จึงต้อง Number() ทุกครั้งก่อนเอาไปเทียบหรือคำนวณ
 * ไม่งั้น '105' <= 100 จะเทียบแบบ string แล้วได้ผลผิด
 */
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * ระดับราคาที่จะเอาไปตรวจต้องเป็นบวกเสมอ ถ้าเจอ 0 หรือค่าติดลบให้ถือว่า "ไม่ได้ตั้งไว้"
 * เหตุผล: ฝั่ง short ตรวจด้วย high >= stop_loss ถ้าปล่อย stop_loss = 0 หลุดเข้ามา
 * เงื่อนไขจะเป็นจริงตลอดและปิดออเดอร์ทิ้งทันทีทั้งที่ผู้ใช้ไม่ได้ตั้ง SL
 */
function toPriceLevel(value: unknown): number | null {
  const n = toFiniteNumber(value);
  return n !== null && n > 0 ? n : null;
}

/** ปัด 4 ตำแหน่งให้ตรงกับที่ /api/trades PATCH เขียนลง DB ตัวเลขจะได้ไม่ขัดกันระหว่าง 2 ทาง */
function round4(n: number): number {
  return Number.isFinite(n) ? Number(n.toFixed(4)) : 0;
}

/** แปลง ISO string เป็น epoch ms — คืน null ถ้าอ่านไม่ได้ */
function toEpoch(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * หาเวลาเริ่มของ "รอบซื้อขายที่ high_24h/low_24h เป็นเจ้าของ"
 *
 * ผู้เรียกมีเบาะแส 2 ทางจาก Yahoo แต่ทั้งคู่เชื่อเดี่ยว ๆ ไม่ได้สักทาง
 * (ตรวจกับข้อมูลจริงทั้ง 5 ตลาดแล้ว):
 *
 *   timestamp ของแท่งรายวันแท่งสุดท้าย
 *     หุ้น US / หุ้นไทย / crypto → เป็นเวลาเปิดรอบจริง ใช้ได้
 *     ทอง (GC=F) และ forex (=X) ตอนตลาดเปิด → Yahoo ใส่ค่าเท่ากับ regularMarketTime
 *       คือ "เวลาปัจจุบัน" ไม่ใช่เวลาเปิดรอบ ใช้แล้วออเดอร์ทุกไม้จะนับว่า "เปิดก่อนรอบ"
 *       แล้วโดนตรวจด้วยช่วงราคาทั้งวันรวมช่วงก่อนที่มันจะมีอยู่จริง
 *
 *   meta.currentTradingPeriod.regular.start
 *     ทอง / forex → ถูกต้อง
 *     หุ้นไทยตอนตลาดปิด → ชี้ไปรอบ "พรุ่งนี้" ซึ่งอยู่ในอนาคต
 *       (เจอจริง: แท่งสุดท้าย 08-11T03:00Z แต่ regular.start = 08-12T03:00Z)
 *       ใช้แล้วพังแบบเดียวกัน
 *
 * กฎที่ถูกกับทุกตลาด: ตัดค่าที่อยู่ในอนาคตทิ้ง แล้วเอาค่าที่ "เร็วกว่า"
 * เร็วกว่าปลอดภัยกว่าเสมอ เพราะ resolvePriceWindow ถือว่า opened_at >= sessionStart
 * แปลว่า "เปิดระหว่างรอบ" → ถอยไปใช้ [price, price] ซึ่งไม่มีทางปิดออเดอร์ผิด
 * ยิ่ง sessionStart เร็ว ยิ่งเข้าเงื่อนไขนั้นบ่อย = อนุรักษ์นิยมขึ้น
 *
 * ไม่เหลือเบาะแสที่ใช้ได้เลย → คืน null ให้ผู้เรียกถอยไปใช้ [price, price]
 */
export function resolveSessionStart(
  lastCandleTimestamp: string | null | undefined,
  regularStart: string | null | undefined,
  now: number = Date.now()
): string | null {
  const usable: number[] = [];
  for (const raw of [lastCandleTimestamp, regularStart]) {
    const t = toEpoch(raw);
    // ค่าที่ยังมาไม่ถึงเป็นรอบถัดไป ไม่ใช่รอบที่ high/low เป็นเจ้าของ
    if (t !== null && t <= now) usable.push(t);
  }
  if (usable.length === 0) return null;
  return new Date(Math.min(...usable)).toISOString();
}

/**
 * เลือกหน้าต่างราคา [low, high] ที่จะใช้ตรวจ SL/TP
 *
 * `sessionStart` คือเวลาเปิดของรอบซื้อขายที่ high_24h/low_24h เป็นเจ้าของ
 * ผู้เรียกต้องส่งมาจาก timestamp ของแท่งเทียนรายวันแท่งล่าสุดที่ Yahoo ให้มา
 *
 * - opened_at เก่ากว่า sessionStart → ใช้ [low_24h, high_24h] จับ wick ที่แทงถึง SL/TP
 *   แล้วเด้งกลับได้ ถ้าดูแต่ราคาปัจจุบันจะพลาดไม้ที่โดน stop ไปแล้วจริง ๆ
 * - opened_at อยู่ "ระหว่าง" รอบเดียวกัน → ใช้ [price, price] เท่านั้น
 *   เพราะ high/low ของรอบนั้นอาจเกิดขึ้นก่อนออเดอร์จะเปิด เอามาตรวจจะปิดออเดอร์ผิดตัว
 * - ไม่รู้ sessionStart หรือ high/low ใช้ไม่ได้ → ถอยมาใช้ [price, price]
 *
 * เคยใช้วิธีเทียบ "วัน UTC" ของ quote.updated_at แทน sessionStart แล้วพัง:
 * updated_at คือเวลาที่ยิง fetch ไม่ใช่วันของรอบซื้อขาย พอ cron รันหลังเที่ยงคืน UTC
 * แต่ตลาดยังไม่เปิดรอบใหม่ ออเดอร์ที่เพิ่งเปิดในรอบเดิมจะถูกตรวจกับช่วงราคาทั้งรอบ
 * รวมช่วงก่อนที่ออเดอร์จะมีอยู่จริง — ซึ่งเป็นสิ่งที่กฎนี้ตั้งใจกันไว้ตั้งแต่แรก
 *
 * หมายเหตุ: ถ้าราคาปัจจุบันใช้ไม่ได้ จะคืนหน้าต่างศูนย์ ซึ่ง evaluatePosition ถือเป็น
 * "ข้อมูลไม่พอ" แล้วปฏิเสธการตัดสิน ไม่ได้แปลว่าราคาเป็น 0 จริง
 */
export function resolvePriceWindow(
  quote: { price: number; low_24h: number; high_24h: number; updated_at: string },
  openedAt: string,
  sessionStart?: string | null
): PriceWindow {
  const price = toPriceLevel(quote?.price);
  if (price === null) return { price: 0, low: 0, high: 0 };

  // ค่า default ที่ปลอดภัยที่สุด: ตรวจด้วยราคาปัจจุบันจุดเดียว
  const flat: PriceWindow = { price, low: price, high: price };

  const low = toPriceLevel(quote.low_24h);
  const high = toPriceLevel(quote.high_24h);
  if (low === null || high === null || high < low) return flat;

  const sessionAt = toEpoch(sessionStart);
  const openAt = toEpoch(openedAt);
  if (sessionAt === null || openAt === null) return flat;
  if (openAt >= sessionAt) return flat;

  // ราคาปัจจุบันเป็นราคาที่ซื้อขายกันจริง ถ้า feed ส่ง high/low มาไม่ครอบราคานี้
  // ให้ขยายหน้าต่างให้ครอบไว้ เพื่อคง invariant low <= price <= high
  return { price, low: Math.min(low, price), high: Math.max(high, price) };
}

/**
 * ตัดสินว่าออเดอร์โดน SL/TP หรือยัง แล้วคำนวณกำไร/ขาดทุน
 * ถ้ายังไม่โดนอะไร pnl ที่ได้คือ unrealized ที่ราคาปัจจุบัน (hit = null, exit_price = null)
 *
 * กฎการตรวจ
 *   long : stopHit = (low  <= stop_loss) ; tpHit = (high >= take_profit)
 *   short: stopHit = (high >= stop_loss) ; tpHit = (low  <= take_profit)
 *
 * โดนทั้ง SL และ TP ในหน้าต่างเดียวกัน → ถือว่า SL โดนก่อนเสมอ
 * เพราะเรามีแค่ช่วง [low, high] ของทั้งวัน เรียงลำดับเวลาไม่ได้ว่าอันไหนมาก่อน
 * เลือกทางที่แย่กว่าไว้ก่อนดีกว่าบันทึกกำไรที่อาจไม่เคยเกิดขึ้นจริง
 *
 * exit_price คือ "ระดับ SL/TP ที่โดน" ไม่ใช่ราคาปัจจุบัน เพราะคำสั่ง stop จริง
 * จะถูกตัดที่ระดับที่ตั้งไว้ ไม่ใช่ราคาตอนที่ cron มาเห็นทีหลัง
 *
 * ด้านที่เป็น null (ไม่ได้ตั้ง SL หรือ TP) จะถูกข้ามไป ไม่ใช่ถือว่าโดน
 */
export function evaluatePosition(pos: PositionInput, win: PriceWindow): PositionOutcome {
  // ข้อมูลไม่พอให้ตัดสิน — คืน hit/exit_price เป็น null เพื่อให้ผู้เรียกปล่อยออเดอร์ไว้เฉย ๆ
  // (pnl ต้องเป็นตัวเลขตามสัญญาของ type จึงเป็น 0 ไม่ใช่การเดาว่ากำไรเท่ากับศูนย์)
  const idle: PositionOutcome = { pnl: 0, pnl_percent: 0, hit: null, exit_price: null, ignored: [] };

  // entry_price เป็น 0 หรือติดลบ จะทำให้ pnl_percent กลายเป็น Infinity/NaN จึงต้องกันตั้งแต่ต้นทาง
  const entry = toPriceLevel(pos?.entry_price);
  const price = toPriceLevel(win?.price);
  if (entry === null || price === null) return idle;

  // จำนวนที่อ่านไม่ได้หรือติดลบให้เป็น 0 ไม่งั้นกำไรจะกลับทิศทั้งที่ทิศทางออเดอร์ไม่ได้เปลี่ยน
  const rawQty = toFiniteNumber(pos.quantity) ?? 0;
  const quantity = rawQty > 0 ? rawQty : 0;
  const fees = toFiniteNumber(pos.fees) ?? 0;

  // หน้าต่างที่ส่งเข้ามาอาจเพี้ยน (มาจากที่อื่นหรือถูกแก้ระหว่างทาง) ตรวจซ้ำอีกชั้น
  let low = price;
  let high = price;
  const rawLow = toPriceLevel(win.low);
  const rawHigh = toPriceLevel(win.high);
  if (rawLow !== null && rawHigh !== null && rawHigh >= rawLow) {
    low = Math.min(rawLow, price);
    high = Math.max(rawHigh, price);
  }

  const isLong = pos.direction === 'long';
  const rawStop = toPriceLevel(pos.stop_loss);
  const rawTake = toPriceLevel(pos.take_profit);

  // ระดับที่อยู่ผิดฝั่งของราคาเข้าต้องถูกเมิน ไม่ใช่เอาไปตัดสิน
  //
  // long ที่ตั้ง stop_loss ไว้ "สูงกว่า" entry จะเข้าเงื่อนไข low <= stop ตั้งแต่วินาทีแรก
  // แล้วปิดออเดอร์ทิ้งพร้อมป้าย "ชน Stop Loss" ทั้งที่ตัวเลขออกมาเป็นกำไร
  // (ทดสอบจริง: entry 100 / stop 100.893 → hit=stop_loss แต่ pnl=+8.93)
  // สาเหตุต้นทางคือ signal-engine เคยเลือกแนวรับที่อยู่เหนือราคามาตั้งเป็น SL ได้
  //
  // ปล่อยออเดอร์ไว้เฉย ๆ ปลอดภัยกว่าปิดผิด เพราะการปิดย้อนกลับไม่ได้
  // และส่ง Telegram ที่ขัดกับความจริงออกไปแล้วเรียกคืนไม่ได้ — แต่ต้องรายงานว่าเมินอะไรไป
  const ignored: Array<'stop_loss' | 'take_profit'> = [];

  const stopOnRightSide = rawStop !== null && (isLong ? rawStop < entry : rawStop > entry);
  const takeOnRightSide = rawTake !== null && (isLong ? rawTake > entry : rawTake < entry);

  if (rawStop !== null && !stopOnRightSide) ignored.push('stop_loss');
  if (rawTake !== null && !takeOnRightSide) ignored.push('take_profit');

  const stop = stopOnRightSide ? rawStop : null;
  const take = takeOnRightSide ? rawTake : null;

  let hit: CloseReason | null = null;
  let exitPrice: number | null = null;

  if (stop !== null && (isLong ? low <= stop : high >= stop)) {
    hit = 'stop_loss';
    exitPrice = stop;
  } else if (take !== null && (isLong ? high >= take : low <= take)) {
    hit = 'take_profit';
    exitPrice = take;
  }

  // สูตรเดียวกับที่ /api/trades PATCH ใช้ตอนผู้ใช้ปิดออเดอร์เอง ตัวเลขจะได้ไม่ขัดกัน
  const sign = isLong ? 1 : -1;
  const settlePrice = exitPrice ?? price;
  const diff = (settlePrice - entry) * sign;
  const pnl = diff * quantity - fees;
  const pnlPercent = (diff / entry) * 100;

  return {
    pnl: round4(pnl),
    pnl_percent: round4(pnlPercent),
    hit,
    // ไม่ปัดระดับ SL/TP เพราะคู่เงิน forex ใช้ทศนิยม 5 ตำแหน่ง ปัดเหลือ 4 แล้วราคาจะเพี้ยน
    exit_price: exitPrice,
    ignored,
  };
}
