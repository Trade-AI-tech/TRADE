import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/supabase';
import { createRouteClient, getSessionUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const DIRECTIONS = ['long', 'short'] as const;

/**
 * เปิดออเดอร์ใหม่ (ปกติมาจากการกด "เพิ่มเข้าพอร์ต" บนการ์ดสัญญาณ)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        trade: {
          id: `trade-${Date.now()}`,
          ...body,
          status: 'open',
          pnl: 0,
          pnl_percent: 0,
          created_at: new Date().toISOString(),
        },
        message: 'สร้างออเดอร์สำเร็จ (Demo Mode)',
      });
    }

    const supabase = createRouteClient();
    const user = await getSessionUser();
    if (!supabase || !user) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const entryPrice = Number(body.entry_price);
    const quantity = Number(body.quantity);
    if (!body.symbol || !Number.isFinite(entryPrice) || entryPrice <= 0) {
      return NextResponse.json({ success: false, error: 'ราคาเข้าไม่ถูกต้อง' }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ success: false, error: 'จำนวนไม่ถูกต้อง' }, { status: 400 });
    }
    if (!DIRECTIONS.includes(body.direction)) {
      return NextResponse.json({ success: false, error: 'ทิศทางไม่ถูกต้อง' }, { status: 400 });
    }

    const trade = {
      user_id: user.id,
      signal_id: body.signal_id || null,
      symbol: body.symbol,
      name: body.name ?? body.symbol,
      market: body.market,
      direction: body.direction,
      status: 'open',
      entry_price: entryPrice,
      exit_price: null,
      stop_loss: body.stop_loss ?? null,
      take_profit: body.take_profit ?? null,
      quantity,
      pnl: 0,
      pnl_percent: 0,
      fees: 0,
      notes: body.notes || null,
      opened_at: new Date().toISOString(),
      closed_at: null,
    };

    const { data, error } = await supabase.from('trades').insert(trade).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, trade: data, message: 'เพิ่มเข้าพอร์ตเรียบร้อย' });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/**
 * ปิดออเดอร์ — คำนวณกำไร/ขาดทุนจากราคาปิดที่ระบุ
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    if (isDemoMode()) {
      return NextResponse.json({ success: true, demo: true, message: 'ปิดออเดอร์แล้ว (Demo Mode)' });
    }

    const supabase = createRouteClient();
    const user = await getSessionUser();
    if (!supabase || !user) {
      return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const id = String(body.id ?? '');
    const exitPrice = Number(body.exit_price);
    if (!id) {
      return NextResponse.json({ success: false, error: 'ต้องระบุ id' }, { status: 400 });
    }
    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      return NextResponse.json({ success: false, error: 'ราคาปิดไม่ถูกต้อง' }, { status: 400 });
    }

    // RLS จำกัดให้เห็นเฉพาะออเดอร์ของตัวเองอยู่แล้ว
    const { data: existing, error: findErr } = await supabase
      .from('trades')
      .select('*')
      .eq('id', id)
      .single();

    if (findErr || !existing) {
      return NextResponse.json({ success: false, error: 'ไม่พบออเดอร์นี้' }, { status: 404 });
    }
    if (existing.status !== 'open') {
      return NextResponse.json({ success: false, error: 'ออเดอร์นี้ปิดไปแล้ว' }, { status: 400 });
    }

    const sign = existing.direction === 'long' ? 1 : -1;
    const diff = (exitPrice - Number(existing.entry_price)) * sign;
    const pnl = diff * Number(existing.quantity) - Number(existing.fees ?? 0);
    const pnlPercent = (diff / Number(existing.entry_price)) * 100;

    const { data, error } = await supabase
      .from('trades')
      .update({
        status: 'closed',
        exit_price: exitPrice,
        pnl: Number(pnl.toFixed(4)),
        pnl_percent: Number(pnlPercent.toFixed(4)),
        closed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, trade: data, message: 'ปิดออเดอร์เรียบร้อย' });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
