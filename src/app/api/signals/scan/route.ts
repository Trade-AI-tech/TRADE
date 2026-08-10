import { NextResponse } from 'next/server';
import { fetchChart } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal-engine';
import { isDemoMode } from '@/lib/supabase';
import { createAdminClient, createRouteClient, getSessionUser } from '@/lib/supabase-server';
import { DEMO_WATCHLIST, DEMO_SIGNALS, DEMO_PRICES } from '@/lib/demo-data';
import type { Signal, MarketPrice } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** ไม่สร้างสัญญาณซ้ำของ symbol+action เดิมภายในกี่ชั่วโมง */
const DEDUPE_HOURS = 20;

/**
 * สแกน watchlist ของผู้ใช้ที่ล็อกอินอยู่ → อัปเดตราคา + สร้างสัญญาณ
 * เรียกจากปุ่ม "สแกนตลาด" บน Header
 *
 * ยืนยันตัวตนจาก session cookie จริง (ไม่ใช่ header x-user-id ที่ปลอมได้)
 * และเขียนผ่าน client ที่ติด RLS → เขียนข้ามบัญชีคนอื่นไม่ได้
 */
export async function POST() {
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

    const { data: watchlist, error: wlErr } = await supabase
      .from('watchlist')
      .select('*')
      .eq('is_active', true);

    if (wlErr) throw wlErr;
    if (!watchlist?.length) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        prices: [],
        signals: [],
        message: 'ยังไม่มี symbol ใน watchlist — เพิ่มที่หน้า "ตลาด" ก่อน',
      });
    }

    // สัญญาณที่ยังไม่หมดอายุ ใช้กันสร้างซ้ำ
    const since = new Date(Date.now() - DEDUPE_HOURS * 3600_000).toISOString();
    const { data: recent } = await supabase
      .from('signals')
      .select('symbol, action')
      .eq('status', 'active')
      .gte('created_at', since);
    const seen = new Set((recent ?? []).map(r => `${r.symbol}:${r.action}`));

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
        if (seen.has(`${signal.symbol}:${signal.action}`)) {
          skipped.push(`${item.symbol} (มีสัญญาณ ${signal.action} อยู่แล้ว)`);
          continue;
        }

        signal.user_id = user.id;
        signals.push(signal);
        seen.add(`${signal.symbol}:${signal.action}`);
      } catch (e) {
        console.error('scan error for', item.symbol, e);
        skipped.push(`${item.symbol} (ดึงข้อมูลไม่สำเร็จ)`);
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

    return NextResponse.json({
      success: true,
      scanned: watchlist.length,
      prices,
      signals,
      skipped,
      message: `สแกน ${watchlist.length} รายการ พบสัญญาณใหม่ ${signals.length} รายการ`,
    });
  } catch (err) {
    console.error('scan route error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
