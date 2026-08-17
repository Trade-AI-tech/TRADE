import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/supabase';
import { createAdminClient, getSessionUser } from '@/lib/supabase-server';
import { sendPushToUser } from '@/lib/push-server';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

/**
 * ยิงแจ้งเตือนทดสอบเข้าเครื่องของผู้ใช้ที่ล็อกอินอยู่
 *
 * มีไว้เพื่อพิสูจน์ว่า "สายส่งทั้งเส้นใช้ได้จริง" ก่อนจะไปรอสัญญาณจริง —
 * ถ้าไม่มีปุ่มนี้ ผู้ใช้ต้องรอ cron รอบถัดไปแล้วเดาเองว่าไม่เด้งเพราะไม่มีสัญญาณ
 * หรือเพราะระบบแจ้งเตือนพัง ซึ่งแยกไม่ออกเลย
 *
 * ใช้ admin client ในการ "ส่ง" (sendPushToUser ต้องอ่าน subscription ข้าม RLS)
 * แต่ user id มาจาก session cookie ที่ verify กับ Supabase แล้วเท่านั้น
 * ไม่รับ user id จาก body — ไม่งั้นใครก็ยิงแจ้งเตือนใส่คนอื่นได้
 */
export async function POST() {
  if (isDemoMode()) {
    return NextResponse.json({ success: false, error: 'โหมด Demo ส่งแจ้งเตือนจริงไม่ได้' }, { status: 400 });
  }

  const user = await getSessionUser();
  const supabase = createAdminClient();
  if (!user || !supabase) {
    return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  try {
    const res = await sendPushToUser(supabase, user.id, {
      title: '🔔 ทดสอบแจ้งเตือน',
      body: 'ถ้าเห็นข้อความนี้บนโทรศัพท์ แปลว่าระบบแจ้งเตือนสัญญาณพร้อมใช้งานแล้ว',
      tag: 'test',
      url: '/signals',
    });

    if (res.noSubscriptions) {
      return NextResponse.json({
        success: false,
        error: 'ยังไม่มีเครื่องไหนเปิดแจ้งเตือนไว้ — กดปุ่ม "เปิดแจ้งเตือน" บนเครื่องที่ต้องการก่อน',
      });
    }

    if (res.sent === 0) {
      return NextResponse.json({
        success: false,
        // บอกสาเหตุจริงเสมอ ไม่กลบเป็น "ส่งไม่สำเร็จ" ลอย ๆ
        error: res.errors[0] ?? `ส่งไม่สำเร็จทั้ง ${res.failed} เครื่อง`,
      });
    }

    return NextResponse.json({
      success: true,
      message:
        `ส่งแล้ว ${res.sent} เครื่อง` +
        (res.pruned ? ` (ล้างเครื่องที่ถอนแจ้งเตือนไปแล้ว ${res.pruned} เครื่อง)` : ''),
      sent: res.sent,
      failed: res.failed,
      pruned: res.pruned,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
