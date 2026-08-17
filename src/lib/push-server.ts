import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Signal } from '@/types';
import { errorMessage } from './errors';

/**
 * ตัวส่ง Web Push ฝั่งเซิร์ฟเวอร์ — ยิงแจ้งเตือนเข้าเครื่องผู้ใช้ตรง ๆ
 * ผ่านบริการ push ของ OS (APNs บน iPhone / FCM บน Android) ไม่พึ่ง Telegram
 *
 * ต้องรันบน runtime = 'nodejs' เท่านั้น (web-push ใช้ crypto ของ Node ในการเซ็น VAPID
 * และเข้ารหัส payload ตาม RFC 8291) — เรียกจาก edge runtime จะพังตอน build
 */

/** ต้องเรียกก่อนส่งทุกครั้ง — คืน false เมื่อยังไม่ได้ตั้งกุญแจ VAPID */
function configure(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  // subject ต้องเป็น mailto: หรือ URL ตามสเปก VAPID — บริการ push บางเจ้าปฏิเสธถ้าผิดรูป
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@trading-ai.app';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** แจ้งเตือน tag เดียวกันจะทับกันบนเครื่อง — ใช้กันเด้งรัวจากสัญญาณตัวเดิม */
  tag?: string;
  /** หน้าที่จะเปิดเมื่อผู้ใช้กดแจ้งเตือน */
  url?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** subscription ที่ตายแล้วและถูกลบทิ้งในรอบนี้ */
  pruned: number;
  /** ไม่มีเครื่องไหนสมัครไว้เลย — ต่างจาก "ส่งแล้วล้ม" คนละเรื่องกัน */
  noSubscriptions: boolean;
  errors: string[];
}

/**
 * ส่งแจ้งเตือนไปทุกเครื่องที่ผู้ใช้คนนี้เปิดไว้
 *
 * ใช้ client สิทธิ์ service-role เพราะทำงานในบริบท cron ที่ไม่มี session
 * — ผู้เรียกต้องมั่นใจเองว่า userId มาจาก DB ไม่ใช่จาก request ของผู้ใช้
 */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, pruned: 0, noSubscriptions: false, errors: [] };

  if (!configure()) {
    result.errors.push('ยังไม่ได้ตั้ง VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY บนเซิร์ฟเวอร์');
    return result;
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) {
    result.errors.push(errorMessage(error));
    return result;
  }
  if (!subs?.length) {
    result.noSubscriptions = true;
    return result;
  }

  const body = JSON.stringify(payload);
  // endpoint ที่บริการ push บอกว่าตายแล้ว — เก็บไว้ลบทีเดียวตอนจบ
  const dead: string[] = [];
  const delivered: string[] = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        // TTL 6 ชม. — สัญญาณเทรดที่ค้างนานกว่านี้ส่งไปก็ไม่ทันแล้ว
        // ปล่อยให้บริการ push ทิ้งเองดีกว่าไปเด้งตอนราคาเปลี่ยนไปคนละเรื่อง
        { TTL: 6 * 3600 }
      );
      result.sent++;
      delivered.push(sub.endpoint);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;

      // 404 = endpoint ไม่มีอยู่แล้ว · 410 Gone = ผู้ใช้ถอนสิทธิ์/ลบแอป
      // ทั้งสองกรณีจะไม่มีวันส่งสำเร็จอีก ต้องลบทิ้ง ไม่งั้นทุกรอบ cron
      // จะเสียเวลายิงไปที่ตายซ้ำ ๆ แล้วนับเป็น failed ตลอดกาลจนอ่าน log ไม่รู้เรื่อง
      if (status === 404 || status === 410) {
        dead.push(sub.endpoint);
        continue;
      }

      result.failed++;
      result.errors.push(`${status ?? '?'}: ${errorMessage(err)}`);
    }
  }

  if (dead.length) {
    const { error: delErr } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', dead);
    if (delErr) result.errors.push(`ลบ subscription ที่ตายแล้วไม่สำเร็จ: ${errorMessage(delErr)}`);
    else result.pruned = dead.length;
  }

  if (delivered.length) {
    // ไว้ดูตอนไล่ปัญหาว่าเครื่องไหนยังได้รับจริงล่าสุดเมื่อไหร่
    // อัปเดตเฉพาะเครื่องที่ส่งสำเร็จรอบนี้ ไม่ใช่ทุกแถวของ user
    // ไม่งั้นเครื่องที่ส่งล้มจะดูเหมือนยังใช้งานได้อยู่ แล้วไล่ปัญหาผิดตัว
    await supabase
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('endpoint', delivered);
  }

  return result;
}

/** ตัวเลขราคาในแจ้งเตือนต้องอ่านออกทั้ง XAUUSD (4 หลัก) และ EURUSD (ทศนิยม 5 ตำแหน่ง) */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return n.toPrecision(4);
}

/**
 * แปลงสัญญาณเป็นข้อความแจ้งเตือน
 *
 * หน้าจอล็อกของ iPhone ตัดข้อความค่อนข้างสั้น จึงเรียงของสำคัญไว้หน้าสุด:
 * ทิศทาง → สัญลักษณ์ → ราคาเข้า แล้วค่อยตามด้วย SL/TP
 */
export function signalToPush(signal: Signal): PushPayload {
  const arrow = signal.action === 'BUY' ? '🟢 ซื้อ' : '🔴 ขาย';
  const strong = signal.strength === 'very_strong' || signal.strength === 'strong';

  return {
    title: `${arrow} ${signal.symbol} @ ${fmt(signal.entry_price)}`,
    body:
      `TP ${fmt(signal.take_profit)} · SL ${fmt(signal.stop_loss)}\n` +
      `ความมั่นใจ ${signal.confidence}%${strong ? ' · สัญญาณแรง' : ''} · ${signal.timeframe}`,
    // ผูก tag กับ id ของสัญญาณ ไม่ใช่แค่ symbol — สัญญาณคนละตัวของ symbol เดียวกัน
    // ต้องเด้งแยกกัน ไม่ใช่ตัวใหม่ไปทับตัวเก่าจนพลาดไปหนึ่งสัญญาณ
    tag: `signal-${signal.id}`,
    url: '/signals',
  };
}
