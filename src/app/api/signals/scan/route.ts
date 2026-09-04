import { NextResponse } from 'next/server';
import { fetchChart } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal-engine';
import { isDemoMode } from '@/lib/supabase';
import { createAdminClient, createRouteClient, getSessionUser } from '@/lib/supabase-server';
import { DEMO_WATCHLIST, DEMO_SIGNALS, DEMO_PRICES } from '@/lib/demo-data';
import type { Signal, MarketPrice } from '@/types';
import { errorMessage } from '@/lib/errors';
import { isInUniverse } from '@/lib/universe';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * ไม่สร้างสัญญาณซ้ำของ symbol+action+timeframe เดิมภายในกี่ชั่วโมง
 * แยกหน้าต่างตาม timeframe: แท่งรายวันออกสัญญาณใหม่วันละครั้งก็พอ (20 ชม.)
 * แต่แท่งรายชั่วโมงตลาดเดินเร็วกว่ามาก ถ้าล็อกไว้ 20 ชม. เท่ากันจะกลายเป็นปิดปาก 1H ทั้งวัน
 */
const DEDUPE_HOURS_1D = 20;
const DEDUPE_HOURS_1H = 4;

/**
 * งบเวลาโดยประมาณก่อนชน maxDuration 60 วิ — การเพิ่ม 1H ทำให้ fetch ต่อ symbol เพิ่มเป็น 2
 * จึงไล่ 1D ให้ครบก่อน แล้วค่อยเก็บ 1H ถ้าเกินงบให้หยุดเพิ่ม 1H และรายงานจำนวนที่ข้าม ไม่เงียบ
 */
const TIME_BUDGET_MS = 45_000;

/**
 * สแกน watchlist ของผู้ใช้ที่ล็อกอินอยู่ → อัปเดตราคา + สร้างสัญญาณ
 * เรียกจากปุ่ม "สแกนตลาด" บน Header
 *
 * ยืนยันตัวตนจาก session cookie จริง (ไม่ใช่ header x-user-id ที่ปลอมได้)
 * และเขียนผ่าน client ที่ติด RLS → เขียนข้ามบัญชีคนอื่นไม่ได้
 */
export async function POST() {
  const startedAt = Date.now();
  try {
    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        scanned: DEMO_WATCHLIST.length,
        prices: DEMO_PRICES,
        signals: DEMO_SIGNALS.filter(s => s.action !== 'HOLD'),
        message: 'สแกนตลาดเสร็จสิ้น (Demo Mode)',
      });
    }

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const supabase = createRouteClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase unavailable' }, { status: 500 });
    }

    // watchlist ที่เปิดใช้งาน — แล้วกรองให้เหลือเฉพาะจักรวาลที่สแกนจริง
    //
    // ประตูนี้เป็นประตูที่สามที่อ่านตาราง watchlist ตรง ๆ (อีกสองคือ /api/cron/scan-markets
    // กับ Edge Function scan-signals) และมันเป็นประตูที่ "ผู้ใช้กดเองได้" — ปุ่ม "สแกนตลาด"
    // บน Header เรียกมาที่นี่ ถ้าไม่กรอง คู่เงินที่ค้างอยู่ใน watchlist จากก่อน 2026-08-29
    // จะถูกสร้างสัญญาณลงตาราง signals ใบเดียวกับตัวสแกนหลักได้ด้วยการกดปุ่มครั้งเดียว
    // = คำสั่งเจ้าของ "เทรดทองอย่างเดียว" ถูกฝ่าฝืนผ่านเส้นทางที่ไม่มีใครมอง
    // → ใช้กติกาเดียวกับ buildScanTargets(): สแกนเฉพาะสิ่งที่อยู่ใน SYMBOL_UNIVERSE
    //   ไม่ลบแถวของผู้ใช้ แค่ไม่สแกน (แถวยังอยู่ให้ใส่กลับได้ทันทีถ้าเจ้าของเปลี่ยนใจ)
    const { data: watchlistAll, error: wlErr } = await supabase
      .from('watchlist')
      .select('*')
      .eq('is_active', true);

    if (wlErr) throw wlErr;
    const watchlist = (watchlistAll ?? []).filter((w) => isInUniverse(w.symbol, w.market));
    const skippedOutsideUniverse = (watchlistAll?.length ?? 0) - watchlist.length;
    if (!watchlist.length) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        prices: [],
        signals: [],
        // แถวที่ไม่ได้สแกนเพราะอยู่นอกจักรวาล ต้องเห็น ไม่ใช่หายเงียบจนดูเหมือน watchlist ว่าง
        skippedOutsideUniverse,
        message: skippedOutsideUniverse
          ? `watchlist มีแต่ symbol นอกจักรวาล ${skippedOutsideUniverse} รายการ — ไม่สแกน (เจ้าของสั่งเมื่อ 2026-08-29 ว่าเทรดทองอย่างเดียว)`
          : 'ยังไม่มี symbol ใน watchlist — เพิ่มที่หน้า "ตลาด" ก่อน',
      });
    }

    // สัญญาณที่ยังไม่หมดอายุ ใช้กันสร้างซ้ำ — query ด้วยหน้าต่างที่กว้างสุด (ของ 1D)
    // แล้วกรองหน้าต่างแคบของ 1H ในโค้ด เพราะ timeframe เป็น text ใน DB
    // การผูกเงื่อนไข or ตาม timeframe ใน query อ่านยากและพังเงียบได้ง่ายกว่า
    // ไม่กรอง status ตั้งแต่ 2026-09-03 — เหตุผลเดียวกับ /api/cron/scan-markets:
    // ตัวเก็บผลปั๊ม status ให้ใบที่ปิดบัญชีแล้ว ถ้ากรอง active ใบพวกนั้นจะหลุดจากตัวกันซ้ำ
    const since = new Date(Date.now() - DEDUPE_HOURS_1D * 3600_000).toISOString();
    const { data: recent } = await supabase
      .from('signals')
      .select('symbol, action, timeframe, created_at')
      .gte('created_at', since);

    const cutoff1H = Date.now() - DEDUPE_HOURS_1H * 3600_000;
    const seen = new Set<string>();
    for (const r of recent ?? []) {
      // แถว 1H ที่เก่ากว่าหน้าต่าง 4 ชม. ไม่นับเป็นตัวกันซ้ำ — ปล่อยให้ออกสัญญาณใหม่ได้
      if (r.timeframe === '1H' && new Date(r.created_at).getTime() < cutoff1H) continue;
      seen.add(`${r.symbol}:${r.action}:${r.timeframe}`);
    }

    const prices: MarketPrice[] = [];
    const signals: Signal[] = [];
    const skipped: string[] = [];

    for (const item of watchlist) {
      try {
        const { quote, candles } = await fetchChart(item.symbol, item.market, '1d', '1y');
        if (quote) prices.push(quote);

        if (candles.length < 50) {
          skipped.push(`${item.symbol} (ข้อมูลย้อนหลังไม่พอ)`);
          continue;
        }

        const signal = generateSignal({
          symbol: item.symbol,
          name: item.name,
          market: item.market,
          candles,
          timeframe: '1D',
        });

        if (!signal || signal.action === 'HOLD') continue;
        if (seen.has(`${signal.symbol}:${signal.action}:${signal.timeframe}`)) {
          skipped.push(`${item.symbol} (มีสัญญาณ ${signal.action} อยู่แล้ว)`);
          continue;
        }

        signal.user_id = user.id;
        signals.push(signal);
        seen.add(`${signal.symbol}:${signal.action}:${signal.timeframe}`);
      } catch (e) {
        console.error('scan error for', item.symbol, e);
        skipped.push(`${item.symbol} (ดึงข้อมูลไม่สำเร็จ)`);
      }
    }

    // เฟส 2: สแกน 1H — เริ่มหลัง 1D ครบทุกตัวแล้วเท่านั้น
    // เหตุผลของลำดับ: ถ้าสลับ 1D/1H ต่อ symbol แล้วเวลาหมดกลางทาง จะเสียครึ่ง ๆ กลาง ๆ
    // ทั้งสองความละเอียด — แบบนี้อย่างแย่ที่สุด 1D ยังครบเหมือนพฤติกรรมเดิม
    let hourlySkippedForTime = 0;
    for (let i = 0; i < watchlist.length; i++) {
      // เกินงบเวลา → หยุดเพิ่ม 1H แล้วรายงานจำนวนที่ข้ามใน response ห้ามเงียบ
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        hourlySkippedForTime = watchlist.length - i;
        break;
      }

      const item = watchlist[i];
      try {
        // ไม่เก็บ quote ซ้ำ — ราคาปัจจุบันถูก push จากรอบ 1D ไปแล้ว
        // (push ซ้ำจะทำให้ batch upsert มี symbol ซ้ำแล้ว Postgres ทิ้งทั้งชุด)
        const { candles: hourly } = await fetchChart(item.symbol, item.market, '1h', '3mo');

        // แท่งรายชั่วโมงไม่ถึง 50 → วิเคราะห์ไม่ได้ (Yahoo ให้ intraday ย้อนหลังจำกัด
        // และบาง symbol ไม่มีข้อมูลรายชั่วโมงเลย) บันทึกใน skipped ไม่ถือเป็น error
        if (hourly.length < 50) {
          skipped.push(`${item.symbol} 1H (แท่งรายชั่วโมงไม่พอ)`);
          continue;
        }

        const signal = generateSignal({
          symbol: item.symbol,
          name: item.name,
          market: item.market,
          candles: hourly,
          timeframe: '1H',
        });

        if (!signal || signal.action === 'HOLD') continue;
        if (seen.has(`${signal.symbol}:${signal.action}:${signal.timeframe}`)) {
          skipped.push(`${item.symbol} 1H (มีสัญญาณ ${signal.action} อยู่แล้ว)`);
          continue;
        }

        signal.user_id = user.id;
        signals.push(signal);
        seen.add(`${signal.symbol}:${signal.action}:${signal.timeframe}`);
      } catch (e) {
        console.error('scan 1H error for', item.symbol, e);
        skipped.push(`${item.symbol} 1H (ดึงข้อมูลไม่สำเร็จ)`);
      }
    }

    // market_prices เป็น cache กลาง (public read, ไม่มี write policy) → ต้องเขียนด้วย admin client
    // payload ประกอบขึ้นจากคำตอบของ Yahoo ล้วน ไม่มีอะไรที่ผู้ใช้ส่งเข้ามาโดยตรง
    if (prices.length > 0) {
      const admin = createAdminClient();
      if (admin) {
        const { error: priceErr } = await admin
          .from('market_prices')
          .upsert(prices, { onConflict: 'symbol' });
        if (priceErr) console.error('market_prices upsert failed:', priceErr);
      }
    }

    if (signals.length > 0) {
      const { error: insErr } = await supabase.from('signals').insert(signals);
      if (insErr) throw insErr;
    }

    // ถ้าข้าม 1H เพราะเวลาใกล้หมด ต้องบอกผู้ใช้ตรง ๆ ในข้อความ ไม่ใช่แค่ field เงียบ ๆ
    const timeoutNote = hourlySkippedForTime > 0
      ? ` (เวลาใกล้หมด ข้ามสแกน 1H ไป ${hourlySkippedForTime} ตัว)`
      : '';

    // แถวที่ถูกกรองทิ้งเพราะอยู่นอกจักรวาล ต้องบอกในข้อความด้วย ไม่ใช่แค่ field เงียบ ๆ
    // ไม่งั้นผู้ใช้ที่มี 10 แถวใน watchlist จะเห็น "สแกน 1 รายการ" แล้วนึกว่าระบบพัง
    const universeNote = skippedOutsideUniverse > 0
      ? ` · ข้าม ${skippedOutsideUniverse} รายการที่อยู่นอกจักรวาล (เทรดทองอย่างเดียว)`
      : '';

    return NextResponse.json({
      success: true,
      scanned: watchlist.length,
      prices,
      signals,
      skipped,
      skippedOutsideUniverse,
      hourlySkippedForTime,
      message: `สแกน ${watchlist.length} รายการ พบสัญญาณใหม่ ${signals.length} รายการ${timeoutNote}${universeNote}`,
    });
  } catch (err) {
    console.error('scan route error:', err);
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
