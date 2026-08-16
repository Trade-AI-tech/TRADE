import { NextResponse } from 'next/server';
import { fetchChart, type ChartInterval, type ChartRange } from '@/lib/market-data';
import { runBacktest } from '@/lib/backtest';
import { isDemoMode } from '@/lib/supabase';
import { getSessionUser } from '@/lib/supabase-server';
import { DEMO_PRICES, generateCandleData } from '@/lib/demo-data';
import type { MarketType } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MARKETS: MarketType[] = ['GOLD', 'FOREX', 'TH_STOCK', 'US_STOCK', 'CRYPTO'];

/**
 * 60 = ค่า default ของ minHistory ใน runBacktest (lib/backtest) — จำนวนแท่งอุ่นเครื่อง
 * ก่อนเริ่มยิงสัญญาณ (MA50 + Bollinger ต้องมีค่าจริง ไม่ใช่ NaN)
 * บวกอีก 20 เพื่อให้เหลือแท่ง "อนาคต" พอสำหรับ walk-forward เปิด-ปิดไม้ได้จริง
 * ไม่ใช่แค่พอคำนวณสัญญาณแรกได้แล้วจบ — ต่ำกว่านี้ผลทดสอบไม่มีความหมายเชิงสถิติเลย
 */
const MIN_HISTORY = 60;
const MIN_CANDLES = MIN_HISTORY + 20;

/**
 * ช่วงข้อมูลต่อ timeframe:
 * - 1D ใช้ 2 ปี → ได้ราว 500 แท่ง พอให้ MA200 มีความหมายและมีไม้ให้วัดจริง
 * - 1H ใช้ 3 เดือน → เพดานของ Yahoo สำหรับข้อมูลรายชั่วโมง ขอมากกว่านี้ไม่ได้
 */
const FETCH_PLAN: Record<'1D' | '1H', { interval: ChartInterval; range: ChartRange }> = {
  '1D': { interval: '1d', range: '2y' },
  '1H': { interval: '1h', range: '3mo' },
};

/**
 * POST /api/backtest — รัน walk-forward backtest ของ signal engine บนข้อมูลย้อนหลังจริง
 * body: { symbol, market, timeframe: '1D'|'1H', feesR? }
 *
 * ตรรกะเงินทั้งหมด (เข้า/ออก/gap/SL-ก่อน-TP) อยู่ใน lib/backtest — route นี้มีหน้าที่แค่
 * ตรวจ input, ดึงแท่งเทียน, แล้วส่งผลกลับตรง ๆ โดยไม่แต่งตัวเลขใด ๆ
 */
export async function POST(req: Request) {
  try {
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      /* body ไม่ใช่ JSON — ปล่อยให้ validation ด้านล่างตอบ 400 */
    }
    const b = (body ?? {}) as Record<string, unknown>;

    const symbol = typeof b.symbol === 'string' ? b.symbol.trim().toUpperCase() : '';
    const marketRaw = typeof b.market === 'string' ? b.market : '';
    const timeframeRaw = typeof b.timeframe === 'string' ? b.timeframe : '';

    if (!symbol) {
      return NextResponse.json({ success: false, error: 'กรุณาระบุ symbol ที่ต้องการทดสอบ' }, { status: 400 });
    }
    if (!MARKETS.includes(marketRaw as MarketType)) {
      return NextResponse.json(
        { success: false, error: `ตลาดไม่ถูกต้อง — ต้องเป็นหนึ่งใน: ${MARKETS.join(', ')}` },
        { status: 400 }
      );
    }
    if (timeframeRaw !== '1D' && timeframeRaw !== '1H') {
      return NextResponse.json(
        { success: false, error: 'timeframe ต้องเป็น 1D หรือ 1H เท่านั้น' },
        { status: 400 }
      );
    }
    const market = marketRaw as MarketType;
    const timeframe = timeframeRaw;

    // feesR = ต้นทุนต่อไม้คิดเป็นสัดส่วนของ R (ค่าคอม+slippage) — default 0
    // เราไม่เดาตัวเลขให้ เพราะต้นทุนจริงต่างกันตามโบรกเกอร์/ตลาด ผู้ใช้ต้องใส่เอง
    // และ UI ฝั่งหน้าเว็บมีหน้าที่บอกชัดว่า 0 = ผลทดสอบยังไม่รวมค่าธรรมเนียม
    const feesR =
      b.feesR === undefined || b.feesR === null || b.feesR === '' ? 0 : Number(b.feesR);
    if (!Number.isFinite(feesR) || feesR < 0) {
      return NextResponse.json(
        { success: false, error: 'feesR ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป (สัดส่วนของ R ต่อไม้)' },
        { status: 400 }
      );
    }

    // Demo mode — ใช้แท่งเทียนสังเคราะห์ให้เห็นหน้าตาผลลัพธ์ พร้อมประกาศชัดว่าไม่ใช่ราคาจริง
    if (isDemoMode()) {
      const basePrice = DEMO_PRICES.find((p) => p.symbol === symbol)?.price ?? 100;
      const candles = generateCandleData(symbol, basePrice, 300);
      const result = runBacktest({ symbol, name: symbol, market, candles, timeframe, feesR });
      return NextResponse.json({
        success: true,
        demo: true,
        symbol,
        market,
        timeframe,
        feesR,
        candleCount: candles.length,
        period: { from: candles[0].timestamp, to: candles[candles.length - 1].timestamp },
        result,
        message: 'รันบนข้อมูลจำลอง (Demo Mode) — ไม่ใช่ราคาตลาดจริง',
      });
    }

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const { interval, range } = FETCH_PLAN[timeframe];
    const { quote, candles } = await fetchChart(symbol, market, interval, range);

    if (candles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `ดึงข้อมูล ${symbol} ไม่สำเร็จ — ตรวจสอบว่า symbol และตลาดถูกต้อง`,
        },
        { status: 422 }
      );
    }
    if (candles.length < MIN_CANDLES) {
      return NextResponse.json(
        {
          success: false,
          error: `ข้อมูลย้อนหลังไม่พอสำหรับ backtest: ${symbol} (${timeframe}) มี ${candles.length} แท่ง ต้องการอย่างน้อย ${MIN_CANDLES} แท่ง`,
        },
        { status: 422 }
      );
    }

    const result = runBacktest({
      symbol,
      name: quote?.name ?? symbol,
      market,
      candles,
      timeframe,
      feesR,
    });

    return NextResponse.json({
      success: true,
      symbol,
      market,
      timeframe,
      feesR,
      candleCount: candles.length,
      // ช่วงเวลาที่ทดสอบจริง — เอาไปโชว์คู่กับผล เพื่อให้ผู้ใช้รู้ว่าตัวเลขวัดจากช่วงไหน
      period: { from: candles[0].timestamp, to: candles[candles.length - 1].timestamp },
      result,
    });
  } catch (err) {
    console.error('backtest route error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
