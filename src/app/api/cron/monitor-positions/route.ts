import { NextRequest, NextResponse } from 'next/server';
import { fetchChart } from '@/lib/market-data';
import { resolvePriceWindow, evaluatePosition, resolveSessionStart } from '@/lib/position-monitor';
import { sendTradeClosedAlert, type ClosedTradeSummary } from '@/lib/telegram';
import { isDemoMode } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-server';
import type { MarketPrice, AlertPreferences, MarketType, TradeDirection } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Cron: เฝ้าดูออเดอร์ที่ยังเปิดอยู่ของผู้ใช้ทุกคน → อัปเดตกำไร/ขาดทุนตามราคาล่าสุด
 * และ "ปิด" ออเดอร์ที่ราคาแตะ SL/TP
 *
 * ⚠ ระบบนี้เป็นสมุดบันทึกการเทรด ไม่ได้ต่อกับโบรกเกอร์
 * การปิดออเดอร์ที่นี่คือการ *บันทึกย้อนหลัง* ว่าถ้ามีคำสั่ง SL/TP วางไว้จริง
 * ออเดอร์จะถูกตัดที่ระดับไหน — ไม่มีคำสั่งซื้อขายใดถูกส่งออกไปทั้งสิ้น
 *
 * ทำงานโดยไม่มี session จึงใช้ service-role client
 * ป้องกันด้วย CRON_SECRET header แบบ fail-closed (ไม่ตั้ง secret = ปฏิเสธทุกคำขอ)
 */

/**
 * รูปแถวที่ดึงมาใช้จริง — ประกาศไว้เฉพาะที่นี่เพราะ Trade ใน @/types
 * ยังไม่มีคอลัมน์ current_price / close_reason / last_checked_at ที่ตัวเฝ้าออเดอร์เพิ่มเข้ามา
 */
interface OpenTradeRow {
  id: string;
  user_id: string;
  signal_id: string | null;
  symbol: string;
  name: string;
  market: MarketType;
  direction: TradeDirection;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  quantity: number;
  fees: number | null;
  opened_at: string;
}

interface SymbolTarget {
  symbol: string;
  market: MarketType;
}

interface TelegramProfileRow {
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
  alert_preferences: Partial<AlertPreferences> | null;
}

/** ป้ายภาษาไทยของสาเหตุที่ปิด ใช้ในบันทึก telegram_alerts */
const REASON_LABEL: Record<'stop_loss' | 'take_profit', string> = {
  stop_loss: 'ชน Stop Loss',
  take_profit: 'ชน Take Profit',
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  // fail-closed: ไม่มี CRON_SECRET = ปฏิเสธ ไม่ใช่ปล่อยผ่าน
  //
  // route นี้เข้มกว่า scan-markets โดยตั้งใจ เพราะ scan-markets แค่ "สร้าง signal เพิ่ม"
  // ซึ่งลบทิ้งได้ แต่ route นี้เขียนทับ trades ของผู้ใช้ทุกคน (status/exit_price/pnl/closed_at)
  // ด้วย service-role — ปิดออเดอร์ไปแล้วย้อนกลับไม่ได้ และ Telegram ที่ส่งออกไปก็เรียกคืนไม่ได้
  // ถ้าลืมตั้ง env ใน production แล้วเปิดโล่ง ใครก็ยิงปิดออเดอร์ของทุกคนได้
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoMode()) {
    return NextResponse.json({
      success: true,
      demo: true,
      message: 'โหมดเดโม — ไม่ได้ตรวจสอบออเดอร์จริง',
      timestamp: new Date().toISOString(),
    });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase unavailable' }, { status: 500 });
  }

  try {
    // 1. ออเดอร์ที่ยังเปิดอยู่ของทุกผู้ใช้
    const { data: tradeRows, error: tradeErr } = await supabase
      .from('trades')
      .select(
        'id, user_id, signal_id, symbol, name, market, direction, entry_price, stop_loss, take_profit, quantity, fees, opened_at'
      )
      .eq('status', 'open');

    if (tradeErr) throw tradeErr;
    const openTrades = (tradeRows ?? []) as OpenTradeRow[];

    // 2. สัญญาณที่ยัง active — ต้องรีเฟรช current_price ให้ด้วย ถึงจะไม่มีออเดอร์เปิดอยู่เลยก็ตาม
    const { data: signalRows, error: signalErr } = await supabase
      .from('signals')
      .select('symbol, market')
      .eq('status', 'active');

    if (signalErr) throw signalErr;
    const activeSignals = (signalRows ?? []) as SymbolTarget[];

    // 3. ดึงราคาครั้งเดียวต่อ symbol แล้วใช้ซ้ำทั้งกับออเดอร์และสัญญาณ
    const uniqueKeys = new Map<string, SymbolTarget>();
    const signalKeys = new Map<string, SymbolTarget>();

    for (const t of openTrades) {
      uniqueKeys.set(`${t.symbol}|${t.market}`, { symbol: t.symbol, market: t.market });
    }
    for (const s of activeSignals) {
      const key = `${s.symbol}|${s.market}`;
      uniqueKeys.set(key, { symbol: s.symbol, market: s.market });
      signalKeys.set(key, { symbol: s.symbol, market: s.market });
    }

    const quotes = new Map<string, MarketPrice>();
    /**
     * เวลาเปิดของ "รอบซื้อขาย" ที่ high_24h/low_24h เป็นเจ้าของ
     * resolvePriceWindow ต้องใช้ค่านี้ตัดสินว่าเอาช่วง [low, high] มาตรวจ SL/TP ได้ไหม
     * ไม่มีค่า → null แล้วมันจะถอยไปใช้ [price, price] เอง (ปลอดภัย แค่จับ wick ไม่ได้)
     *
     * ห้ามใช้ timestamp ของแท่งสุดท้ายเดี่ยว ๆ — ทอง/forex ตอนตลาดเปิด Yahoo ใส่ค่านั้น
     * เท่ากับเวลาปัจจุบัน ทำให้ออเดอร์ทุกไม้ถูกนับว่า "เปิดก่อนรอบ" แล้วปิดผิด
     * resolveSessionStart รวมเบาะแสสองทางแล้วเลือกให้ถูกทุกตลาด
     */
    const sessionStarts = new Map<string, string | null>();
    const prices: MarketPrice[] = [];
    const skipped = new Set<string>();

    for (const [key, target] of uniqueKeys) {
      try {
        // ต้องเป็น interval '1d' เพราะแท่งล่าสุดคือ "รอบวันนี้" ที่ high_24h/low_24h อ้างถึง
        // range สั้นสุดที่ ChartRange รองรับก็พอ — ใช้แค่แท่งสุดท้าย ไม่ได้ใช้ประวัติย้อนหลัง
        const chart = await fetchChart(target.symbol, target.market, '1d', '1mo');
        if (!chart.quote) {
          skipped.add(target.symbol);
          continue;
        }
        quotes.set(key, chart.quote);
        sessionStarts.set(
          key,
          resolveSessionStart(
            chart.candles[chart.candles.length - 1]?.timestamp ?? null,
            chart.regularStart
          )
        );
        prices.push(chart.quote);
      } catch (e) {
        // symbol เดียวล้มไม่ควรทำให้ทั้ง job ตาย ออเดอร์ตัวอื่นยังต้องได้รับการตรวจ
        console.error('fetchChart failed for', target.symbol, e);
        skipped.add(target.symbol);
      }
    }

    /**
     * ยุบให้เหลือแถวเดียวต่อ symbol ก่อน upsert
     *
     * market_prices มี primary key เป็น symbol อย่างเดียว แต่ prices ถูกเก็บมาจากคีย์ `symbol|market`
     * symbol เดียวกันที่ผู้ใช้คนละคนตั้ง market ไว้ไม่ตรงกัน (เช่น XAUUSD คนหนึ่งตั้ง GOLD อีกคนตั้ง FOREX)
     * จะกลายเป็นสองแถวใน batch เดียว แล้ว postgres โยน
     * "ON CONFLICT DO UPDATE command cannot affect row a second time" → ราคาทั้ง batch หายหมด
     */
    const uniquePrices = [...new Map(prices.map((p) => [p.symbol, p])).values()];

    let pricesUpdated = 0;
    if (uniquePrices.length > 0) {
      const { error: priceErr } = await supabase
        .from('market_prices')
        .upsert(uniquePrices, { onConflict: 'symbol' });
      // นับเฉพาะตอนเขียนสำเร็จจริง ไม่งั้นจะรายงานเลขที่ไม่เคยลง DB
      if (priceErr) console.error('market_prices upsert failed:', priceErr);
      else pricesUpdated = uniquePrices.length;
    }

    // 4. ตรวจออเดอร์ทีละตัว
    const now = new Date().toISOString();

    let checked = 0;
    let stopLoss = 0;
    let takeProfit = 0;
    let alertsSent = 0;
    let alertsFailed = 0;

    /**
     * ระดับ SL/TP ที่ evaluatePosition เมินเพราะตั้งไว้ผิดฝั่งของ entry
     * (เช่น long ที่ตั้ง stop_loss สูงกว่าราคาเข้า) — ออเดอร์พวกนี้จะไม่มีวันถูก cron ปิดให้
     * ต้องรายงานออกไป ไม่ใช่กลืนเงียบ ไม่งั้นจะดีบักไม่ได้ว่าทำไมออเดอร์ค้างอยู่ตลอด
     */
    const ignoredLevels: Array<{
      tradeId: string;
      symbol: string;
      ignored: Array<'stop_loss' | 'take_profit'>;
    }> = [];

    // ดึง profiles ครั้งเดียวต่อ user แล้วใช้ซ้ำ — คนเดียวปิดหลายไม้ในรอบเดียวไม่ต้องยิงซ้ำ
    const profiles = new Map<string, TelegramProfileRow | null>();

    /**
     * แจ้งเตือนไม้ที่เพิ่งปิด — ต้องเรียก "ทันที" หลังเขียน DB สำเร็จ
     *
     * ถ้าเก็บสะสมไว้แล้วส่งรวดเดียวตอนท้ายไฟล์ แล้วฟังก์ชันถูกตัดที่ maxDuration 60 วิ ระหว่างกลาง
     * ออเดอร์จะปิดไปแล้วแต่ผู้ใช้ไม่ได้รับแจ้ง และรอบถัดไปจะหาไม้นั้นไม่เจอ
     * เพราะไม่ใช่ status='open' อีกต่อไป → การแจ้งเตือนหายถาวร กู้ไม่ได้
     */
    const notifyClosed = async (
      trade: OpenTradeRow,
      hit: 'stop_loss' | 'take_profit',
      exitPrice: number,
      summary: ClosedTradeSummary
    ) => {
      if (!profiles.has(trade.user_id)) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('telegram_bot_token, telegram_chat_id, telegram_enabled, alert_preferences')
          .eq('id', trade.user_id)
          .maybeSingle();
        profiles.set(trade.user_id, (profile as TelegramProfileRow) ?? null);
      }

      const profile = profiles.get(trade.user_id);
      if (!profile?.telegram_enabled || !profile.telegram_bot_token || !profile.telegram_chat_id) return;

      // ไม่ได้ตั้งค่าไว้ = ส่ง, ตั้งเป็น false เท่านั้นถึงจะเงียบ
      const prefs = (profile.alert_preferences ?? {}) as Partial<AlertPreferences>;
      if (hit === 'stop_loss' && prefs.stop_loss_hit === false) return;
      if (hit === 'take_profit' && prefs.take_profit_hit === false) return;

      const res = await sendTradeClosedAlert(
        { botToken: profile.telegram_bot_token, chatId: profile.telegram_chat_id },
        summary,
        hit,
        exitPrice
      );

      // บันทึกทุกครั้งไม่ว่าสำเร็จหรือไม่ — signal_id เป็น null ได้ถ้าผู้ใช้เปิดออเดอร์เอง
      await supabase.from('telegram_alerts').insert({
        user_id: trade.user_id,
        signal_id: trade.signal_id,
        message: `${REASON_LABEL[hit]} ${trade.symbol} @ ${exitPrice}`,
        success: res.success,
        error: res.error ?? null,
      });

      if (res.success) {
        alertsSent++;
      } else {
        alertsFailed++;
        console.error('telegram send failed:', res.error);
      }
    };

    for (const trade of openTrades) {
      const key = `${trade.symbol}|${trade.market}`;
      const quote = quotes.get(key);
      // ไม่มีราคาก็ไม่ตัดสินอะไรทั้งนั้น ดีกว่าเดาแล้วปิดออเดอร์ผิด (symbol อยู่ใน skipped แล้ว)
      if (!quote) continue;

      const entryPrice = Number(trade.entry_price);
      if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
        // entry ใช้ไม่ได้ → pnl_percent จะกลายเป็น Infinity/NaN แล้วเขียนลง numeric ไม่ได้
        console.error('invalid entry_price on trade', trade.id);
        skipped.add(trade.symbol);
        continue;
      }

      try {
        // พารามิเตอร์ที่ 3 คือ sessionStart — ขาดไปแล้วจะตกกลับไปใช้ตรรกะ [price, price] เสมอ
        const priceWindow = resolvePriceWindow(quote, trade.opened_at, sessionStarts.get(key) ?? null);
        // ราคาใช้ไม่ได้ → evaluatePosition จะคืน pnl 0 ตามสัญญาของ type ซึ่งไม่ใช่กำไรจริง
        // เขียนทับของเดิมไปจะกลายเป็นการเดาค่าให้ผู้ใช้ ปล่อยแถวไว้เฉย ๆ ดีกว่า
        if (!Number.isFinite(priceWindow.price) || priceWindow.price <= 0) {
          skipped.add(trade.symbol);
          continue;
        }

        const out = evaluatePosition(
          {
            direction: trade.direction,
            entry_price: entryPrice,
            quantity: Number(trade.quantity),
            fees: Number(trade.fees ?? 0),
            stop_loss: trade.stop_loss === null ? null : Number(trade.stop_loss),
            take_profit: trade.take_profit === null ? null : Number(trade.take_profit),
          },
          priceWindow
        );

        checked++;

        // เก็บก่อนแตกกิ่ง เพราะไม้ที่มีระดับผิดฝั่งมักไม่เข้ากิ่งปิดออเดอร์เลย
        if (out.ignored.length > 0) {
          ignoredLevels.push({ tradeId: trade.id, symbol: trade.symbol, ignored: out.ignored });
        }

        // cron ปิดออเดอร์ได้เฉพาะเพราะราคาแตะ SL/TP เท่านั้น 'manual' เป็นของผู้ใช้กดเอง
        // และถ้าไม่มี exit_price ก็ไม่มีระดับราคาให้บันทึก → ถือว่ายังไม่โดน ปล่อยออเดอร์ไว้
        const hit = out.hit === 'stop_loss' || out.hit === 'take_profit' ? out.hit : null;
        const exitPrice = out.exit_price;

        if (hit === null || exitPrice === null) {
          // ยังไม่โดนอะไร — อัปเดตกำไร/ขาดทุนลอยตัวเท่านั้น
          const { error: updErr } = await supabase
            .from('trades')
            .update({
              pnl: out.pnl,
              pnl_percent: out.pnl_percent,
              current_price: priceWindow.price,
              last_checked_at: now,
            })
            .eq('id', trade.id)
            .eq('status', 'open');
          if (updErr) console.error('update open trade failed:', trade.id, updErr);
          continue;
        }

        // .eq('status','open') กัน job สองรอบทับกัน / ผู้ใช้เพิ่งกดปิดเอง — ปิดซ้ำจะทับ exit_price ของจริง
        const { data: updated, error: closeErr } = await supabase
          .from('trades')
          .update({
            status: 'closed',
            exit_price: exitPrice,
            pnl: out.pnl,
            pnl_percent: out.pnl_percent,
            close_reason: hit,
            closed_at: now,
            current_price: priceWindow.price,
            last_checked_at: now,
          })
          .eq('id', trade.id)
          .eq('status', 'open')
          .select();

        if (closeErr) {
          console.error('close trade failed:', trade.id, closeErr);
          continue;
        }
        // ไม่โดนแถว = มีคนปิดไปก่อนแล้ว ห้ามนับและห้ามแจ้งเตือนซ้ำ
        if (!updated || updated.length === 0) continue;

        if (hit === 'stop_loss') stopLoss++;
        else takeProfit++;

        // แจ้งเตือนทันทีหลังปิดสำเร็จ ก่อนจะไปยุ่งกับ signals หรือไม้ถัดไป (เหตุผลอยู่ที่ notifyClosed)
        // ห่อ try ไว้เพราะ Telegram ล้มไม่ควรทำให้ไม้ที่เหลือไม่ได้ตรวจ — ออเดอร์ปิดไปแล้วเรียกคืนไม่ได้
        try {
          await notifyClosed(trade, hit, exitPrice, {
            // ประกอบเองจากค่าที่เพิ่งเขียนลงไป ไม่ใช้แถวดิบจาก PostgREST
            // เพราะ numeric ถูก serialize เป็น string ข้อความแจ้งเตือนจะกลายเป็น "คำนวณไม่ได้"
            symbol: trade.symbol,
            name: trade.name,
            market: trade.market,
            direction: trade.direction,
            entry_price: entryPrice,
            quantity: Number(trade.quantity),
            pnl: out.pnl,
            pnl_percent: out.pnl_percent,
          });
        } catch (e) {
          console.error('notify closed trade failed:', trade.id, e);
        }
      } catch (e) {
        console.error('evaluate position failed for', trade.symbol, e);
      }
    }

    // 5. รีเฟรชราคาปัจจุบันของสัญญาณที่ยัง active (อัปเดตทีเดียวต่อ symbol)
    for (const [key, target] of signalKeys) {
      const quote = quotes.get(key);
      if (!quote) continue;

      const { error: sigErr } = await supabase
        .from('signals')
        .update({ current_price: quote.price })
        .eq('status', 'active')
        .eq('symbol', target.symbol)
        .eq('market', target.market);
      if (sigErr) console.error('signals current_price update failed:', target.symbol, sigErr);
    }

    return NextResponse.json({
      success: true,
      // นับเฉพาะออเดอร์ที่มีราคาให้ตรวจจริง ตัวที่ดึงราคาไม่ได้อยู่ใน skipped
      checked,
      closed: stopLoss + takeProfit,
      stopLoss,
      takeProfit,
      pricesUpdated,
      alertsSent,
      alertsFailed,
      skipped: [...skipped],
      // ว่าง = ไม่มีไม้ไหนตั้ง SL/TP ผิดฝั่ง
      ignoredLevels,
      ...(openTrades.length === 0 ? { message: 'ไม่มีออเดอร์ที่เปิดอยู่' } : {}),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('cron error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
