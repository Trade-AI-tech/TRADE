import { NextRequest, NextResponse } from 'next/server';
import { testTelegramConnection } from '@/lib/telegram';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { botToken, chatId } = body;

    if (!botToken || !chatId) {
      return NextResponse.json(
        { success: false, error: 'botToken และ chatId จำเป็นต้องระบุ' },
        { status: 400 }
      );
    }

    const result = await testTelegramConnection({ botToken, chatId });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: 'ส่งข้อความทดสอบสำเร็จ' });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
