import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode, createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Create a new trade (usually from a signal)
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

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase unavailable' }, { status: 500 });
    }

    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const trade = {
      user_id: userId,
      signal_id: body.signal_id || null,
      symbol: body.symbol,
      name: body.name,
      market: body.market,
      direction: body.direction,
      status: 'open',
      entry_price: body.entry_price,
      exit_price: null,
      stop_loss: body.stop_loss,
      take_profit: body.take_profit,
      quantity: body.quantity,
      pnl: 0,
      pnl_percent: 0,
      fees: 0,
      notes: body.notes || null,
      opened_at: new Date().toISOString(),
      closed_at: null,
    };

    const { data, error } = await supabase
      .from('trades')
      .insert(trade)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, trade: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
