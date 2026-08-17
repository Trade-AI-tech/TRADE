import { NextRequest, NextResponse } from 'next/server';
import { fetchChart } from '@/lib/market-data';
import { isDemoMode } from '@/lib/supabase';
import { createAdminClient, createRouteClient, getSessionUser } from '@/lib/supabase-server';
import { DEMO_WATCHLIST } from '@/lib/demo-data';
import type { MarketType } from '@/types';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MARKETS: MarketType[] = ['GOLD', 'FOREX', 'TH_STOCK', 'US_STOCK', 'CRYPTO'];

/**
 * รายการ symbol ที่ผู้ใช้ติดตาม
 * ทุก query วิ่งผ่าน client ที่ติด RLS → เห็นและแก้ได้เฉพาะของตัวเอง
 */
export async function GET() {
  if (isDemoMode()) {
    return NextResponse.json({ success: true, demo: true, watchlist: DEMO_WATCHLIST });
  }

  const supabase = createRouteClient();
  const user = await getSessionUser();
  if (!supabase || !user) {
    return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, watchlist: data ?? [] });
}

/**
 * เพิ่ม symbol — ตรวจกับ Yahoo ก่อนว่ามีจริงและดึงราคาได้
 */
export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(
      { success: false, error: 'โหมด Demo แก้ watchlist ไม่ได้' },
      { status: 400 }
    );
  }

  const supabase = createRouteClient();
  const user = await getSessionUser();
  if (!supabase || !user) {
    return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const symbol = String(body.symbol ?? '').trim().toUpperCase();
    const market = String(body.market ?? '') as MarketType;

    if (!symbol) {
      return NextResponse.json({ success: false, error: 'กรุณาระบุ symbol' }, { status: 400 });
    }
    if (!MARKETS.includes(market)) {
      return NextResponse.json({ success: false, error: 'ประเภทตลาดไม่ถูกต้อง' }, { status: 400 });
    }

    const { quote, candles } = await fetchChart(symbol, market, '1d', '3mo');
    if (!quote) {
      return NextResponse.json(
        { success: false, error: `ไม่พบข้อมูลราคาของ ${symbol} — ตรวจสอบชื่อ symbol และประเภทตลาดอีกครั้ง` },
        { status: 400 }
      );
    }

    const name = String(body.name ?? '').trim() || quote.name || symbol;

    const { data, error } = await supabase
      .from('watchlist')
      .upsert(
        {
          user_id: user.id,
          symbol,
          name,
          market,
          exchange: body.exchange ?? null,
          is_active: true,
        },
        { onConflict: 'user_id,symbol' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // เก็บราคาลง cache กลางทันที เพื่อให้หน้าตลาดมีตัวเลขให้ดูโดยไม่ต้องรอสแกน
    const admin = createAdminClient();
    if (admin) {
      const { error: priceErr } = await admin
        .from('market_prices')
        .upsert(quote, { onConflict: 'symbol' });
      if (priceErr) console.error('market_prices upsert failed:', priceErr);
    }

    return NextResponse.json({
      success: true,
      item: data,
      price: quote,
      candles: candles.length,
      message: `เพิ่ม ${symbol} เรียบร้อย`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}

/**
 * ลบ symbol ออกจาก watchlist
 */
export async function DELETE(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(
      { success: false, error: 'โหมด Demo แก้ watchlist ไม่ได้' },
      { status: 400 }
    );
  }

  const supabase = createRouteClient();
  const user = await getSessionUser();
  if (!supabase || !user) {
    return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, error: 'ต้องระบุ id' }, { status: 400 });
  }

  const { error } = await supabase.from('watchlist').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: 'ลบเรียบร้อย' });
}
