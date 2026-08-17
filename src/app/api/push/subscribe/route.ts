import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/supabase';
import { createRouteClient, getSessionUser } from '@/lib/supabase-server';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

/**
 * ลงทะเบียน/ถอน Web Push subscription ของเครื่องนี้
 *
 * เครื่อง+เบราว์เซอร์หนึ่งตัว = subscription หนึ่งแถว (unique ที่ endpoint)
 * ตัวส่งแจ้งเตือนอยู่ฝั่ง Supabase Edge Function อ่านตารางนี้ด้วย service role
 * ทุก query ที่นี่วิ่งผ่าน RLS — ยุ่งกับ subscription ของคนอื่นไม่ได้
 */

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(
      { success: false, error: 'โหมด Demo ลงทะเบียนแจ้งเตือนไม่ได้' },
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
    const endpoint = String(body?.endpoint ?? '');
    const p256dh = String(body?.keys?.p256dh ?? '');
    const auth = String(body?.keys?.auth ?? '');

    // ต้องเป็น URL ของบริการ push จริง ไม่ใช่ค่าที่ผู้ใช้ประกอบเอง
    if (!endpoint.startsWith('https://') || !p256dh || !auth) {
      return NextResponse.json(
        { success: false, error: 'subscription ไม่ครบถ้วน — ลองปิดแล้วเปิดแจ้งเตือนใหม่' },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
      },
      { onConflict: 'endpoint' }
    );
    if (error) throw error;

    return NextResponse.json({ success: true, message: 'เปิดแจ้งเตือนบนเครื่องนี้แล้ว' });
  } catch (err) {
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ success: false, error: 'โหมด Demo' }, { status: 400 });
  }

  const supabase = createRouteClient();
  const user = await getSessionUser();
  if (!supabase || !user) {
    return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const endpoint = String(body?.endpoint ?? '');
    if (!endpoint) {
      return NextResponse.json({ success: false, error: 'ต้องระบุ endpoint' }, { status: 400 });
    }

    // RLS กรองให้เหลือเฉพาะของ user นี้อยู่แล้ว — ลบของคนอื่นไม่ได้ต่อให้รู้ endpoint
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) throw error;

    return NextResponse.json({ success: true, message: 'ปิดแจ้งเตือนบนเครื่องนี้แล้ว' });
  } catch (err) {
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
