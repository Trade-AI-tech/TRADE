import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/supabase';
import { createRouteClient, getSessionUser } from '@/lib/supabase-server';
import type { AlertPreferences } from '@/types';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

/**
 * โปรไฟล์ผู้ใช้ + การตั้งค่าแจ้งเตือน
 *
 * สำคัญ: cron อ่านค่า Telegram จากตาราง profiles
 * ถ้าเก็บไว้แค่ localStorage ฝั่ง browser การแจ้งเตือนอัตโนมัติจะไม่มีวันทำงาน
 */

const DEFAULT_PREFS: AlertPreferences = {
  buy_signals: true,
  sell_signals: true,
  stop_loss_hit: true,
  take_profit_hit: true,
  news_alerts: true,
  strong_signals_only: false,
};

export async function GET() {
  if (isDemoMode()) {
    return NextResponse.json({
      success: true,
      demo: true,
      profile: {
        full_name: 'Demo User',
        email: 'demo@example.com',
        timezone: 'Asia/Bangkok',
        telegram_chat_id: '',
        telegram_enabled: false,
        has_bot_token: false,
        alert_preferences: DEFAULT_PREFS,
      },
    });
  }

  const supabase = createRouteClient();
  const user = await getSessionUser();
  if (!supabase || !user) {
    return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, timezone, currency, telegram_chat_id, telegram_bot_token, telegram_enabled, alert_preferences')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    profile: {
      full_name: data?.full_name ?? '',
      email: data?.email ?? user.email ?? '',
      timezone: data?.timezone ?? 'Asia/Bangkok',
      currency: data?.currency ?? 'USD',
      telegram_chat_id: data?.telegram_chat_id ?? '',
      telegram_enabled: data?.telegram_enabled ?? false,
      // ไม่ส่ง bot token กลับออกไป บอกแค่ว่าตั้งไว้แล้วหรือยัง
      has_bot_token: Boolean(data?.telegram_bot_token),
      alert_preferences: { ...DEFAULT_PREFS, ...(data?.alert_preferences ?? {}) },
    },
  });
}

export async function PATCH(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(
      { success: false, error: 'โหมด Demo บันทึกการตั้งค่าไม่ได้' },
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
    const patch: Record<string, unknown> = {
      id: user.id,
      email: user.email,
      updated_at: new Date().toISOString(),
    };

    if (typeof body.full_name === 'string') patch.full_name = body.full_name;
    if (typeof body.timezone === 'string') patch.timezone = body.timezone;
    if (typeof body.currency === 'string') patch.currency = body.currency;
    if (typeof body.telegram_chat_id === 'string') patch.telegram_chat_id = body.telegram_chat_id.trim();
    if (typeof body.telegram_enabled === 'boolean') patch.telegram_enabled = body.telegram_enabled;
    if (body.alert_preferences && typeof body.alert_preferences === 'object') {
      patch.alert_preferences = { ...DEFAULT_PREFS, ...body.alert_preferences };
    }
    // ช่องว่าง = ไม่แตะของเดิม (หน้าเว็บไม่เคยได้ token กลับไปแสดง)
    if (typeof body.telegram_bot_token === 'string' && body.telegram_bot_token.trim()) {
      patch.telegram_bot_token = body.telegram_bot_token.trim();
    }

    const { error } = await supabase.from('profiles').upsert(patch, { onConflict: 'id' });
    if (error) throw error;

    return NextResponse.json({ success: true, message: 'บันทึกเรียบร้อย' });
  } catch (err) {
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
