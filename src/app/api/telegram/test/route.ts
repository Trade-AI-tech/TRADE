import { NextRequest, NextResponse } from 'next/server';
import { testTelegramConnection } from '@/lib/telegram';
import { isDemoMode } from '@/lib/supabase';
import { createRouteClient, getSessionUser } from '@/lib/supabase-server';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

/**
 * ทดสอบส่งข้อความ Telegram
 * ถ้าไม่ได้ส่ง botToken มา จะใช้ค่าที่บันทึกไว้ในโปรไฟล์ (ผู้ใช้ไม่ต้องพิมพ์ token ซ้ำ)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let botToken: string = String(body.botToken ?? '').trim();
    let chatId: string = String(body.chatId ?? '').trim();

    if ((!botToken || !chatId) && !isDemoMode()) {
      const supabase = createRouteClient();
      const user = await getSessionUser();
      if (supabase && user) {
        const { data } = await supabase
          .from('profiles')
          .select('telegram_bot_token, telegram_chat_id')
          .eq('id', user.id)
          .maybeSingle();
        botToken = botToken || (data?.telegram_bot_token ?? '');
        chatId = chatId || (data?.telegram_chat_id ?? '');
      }
    }

    if (!botToken || !chatId) {
      return NextResponse.json(
        { success: false, error: 'ยังไม่มี Bot Token หรือ Chat ID — กรอกแล้วกดบันทึกก่อน' },
        { status: 400 }
      );
    }

    const result = await testTelegramConnection({ botToken, chatId });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'ส่งข้อความทดสอบสำเร็จ' });
  } catch (err) {
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
