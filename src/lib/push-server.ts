import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Signal } from '@/types';
import { errorMessage } from './errors';
import {
  PUSH_DIGEST_CONFIG,
  buildPushPayloads,
  buildSingleSignalPayload,
  collapseDuplicates,
  rankSignals,
  roundThrottleVerdict,
  throttleVerdict,
} from './push-digest';
import type { SpeedScorer } from './push-digest';
import { flipNotesFromMarkedRows } from './signal-flips';
import type { FlippedOldRow } from './signal-flips';

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

/**
 * แปลงสัญญาณเป็นข้อความแจ้งเตือน
 *
 * ตัวประกอบข้อความจริงย้ายไปอยู่ push-digest.ts แล้ว (ที่นั่นทดสอบด้วย node เปล่าได้
 * เพราะไม่ผูกกับ web-push) — ตัวนี้เหลือเป็นชื่อเดิมให้ผู้เรียกเก่าไม่ต้องแก้
 * ผลลัพธ์เหมือนเดิมทุกตัวอักษร มีเทสต์เทียบไว้ใน scripts/test-push-digest.mjs
 *
 * ⚠ ไม่มีผู้เรียกในเส้นทางจริงแล้ว — /api/cron/scan-markets เลิกยิงทีละสัญญาณ
 *   และหันมาเรียก sendPendingSignalsToUser เหมือนตัวสแกนตัวอื่นทั้งหมด
 *   เหลือไว้ให้เทสต์เทียบข้อความกับฉบับก่อนรีแฟกเตอร์เท่านั้น
 */
export function signalToPush(signal: Signal): PushPayload {
  return buildSingleSignalPayload(signal);
}

// ────────────────────── สถานะ "แจ้งเตือนแล้วหรือยัง" ของแต่ละสัญญาณ ──────────────────────

/**
 * ค่าคงที่ฝั่งฐานข้อมูลของการเก็บตกสัญญาณค้าง
 * (เกณฑ์ฝั่ง "จะรบกวนคนยังไง" อยู่ที่ PUSH_DIGEST_CONFIG ใน push-digest.ts — คนละเรื่องกัน)
 */
export const PUSH_STATE_CONFIG = {
  /**
   * กวาดสัญญาณค้างมาได้สูงสุดกี่แถวต่อคนต่อรอบ
   * 50 = เผื่อไว้ ~7 เท่าของค่าสูงสุดที่วัดได้จริง (7 สัญญาณ/รอบ) เอาไว้รับกรณีที่
   * ส่งไม่ออกติดกันหลายชั่วโมงแล้วค้างสะสม — เกินจากนี้ก็แค่ตกไปตามอายุ ไม่พังอะไร
   */
  PENDING_LIMIT: 50,

  /**
   * สัญญาณค้างที่เก่ากว่านี้ ไม่ต้องเก็บตกแล้ว
   * ตั้งเท่ากับ TTL ของ push (6 ชม. ใน sendPushToUser) ด้วยเหตุผลเดียวกัน:
   * ราคาเข้าที่คำนวณไว้เมื่อ 6 ชม.ก่อนไม่ใช่ราคาที่เทรดได้แล้ว การเด้งไปก็หลอกให้เข้าไม้ผิด
   */
  PENDING_MAX_AGE_MS: 6 * 3600_000,
} as const;

/** รหัสของ Postgres เมื่ออ้างถึงคอลัมน์ที่ไม่มีอยู่ (undefined_column) */
const UNDEFINED_COLUMN = '42703';

/**
 * error นี้แปลว่า "ยังไม่ได้รัน migration 006" หรือเปล่า
 *
 * ต้องแยกให้ออกจาก error อื่น เพราะสองอย่างนี้ต้องทำคนละแบบ:
 *  - คอลัมน์ยังไม่มี  → ถอยไปใช้พฤติกรรมเดิม แล้วบอกเจ้าของว่าต้องรัน SQL
 *  - อ่าน DB ไม่ออก   → รายงานเป็นข้อผิดพลาดจริง ห้ามกลบเป็น "ไม่มีสัญญาณค้าง"
 */
function isMissingPushColumn(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === UNDEFINED_COLUMN) return true;
  const msg = errorMessage(error).toLowerCase();
  return msg.includes('push_sent') && (msg.includes('column') || msg.includes('does not exist'));
}

export interface PendingLoad {
  signals: Signal[];
  /** true = ตาราง signals ยังไม่มีคอลัมน์ push_sent (ยังไม่ได้รัน migration 006) */
  columnMissing: boolean;
  /** ข้อผิดพลาดจริงที่ไม่ใช่เรื่องคอลัมน์หาย — null = ไม่มี */
  error: string | null;
}

/**
 * ตาราง signals มีคอลัมน์ push_sent แล้วหรือยัง
 *
 * ตัวสแกนต้องรู้ก่อน insert เพราะถ้าใส่ฟิลด์ที่ไม่มีในตาราง Postgres จะปฏิเสธทั้ง batch
 * = สัญญาณทั้งรอบหายไปเลย ซึ่งแย่กว่าการไม่มีคอลัมน์เสียอีก
 *
 * ตอบไม่ได้ (เน็ตพัง / สิทธิ์ไม่พอ) ให้ตอบ false ไว้ก่อน — ฝั่งที่ตอบ false แล้วผิด
 * เสียแค่ "ไม่ได้เก็บตกรอบหน้า" (พฤติกรรมเดิม) ส่วนฝั่งที่ตอบ true แล้วผิดคือ insert ล้มทั้งรอบ
 */
export async function pushStateColumnAvailable(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('signals').select('id, push_sent').limit(1);
  return !error;
}

/**
 * ดึง "สัญญาณที่ยัง active และยังไม่เคยแจ้งเตือน" ของผู้ใช้คนหนึ่ง
 *
 * นี่คือหัวใจของการแก้บั๊กสัญญาณหายถาวร: ตัวส่งไม่ได้ดูแค่ของที่สแกนเจอรอบนี้
 * แต่ดูจาก "สถานะในฐานข้อมูล" ว่ายังมีตัวไหนที่บันทึกไว้แล้วแต่ยังไม่ได้บอกเจ้าของ
 * รอบไหนส่งไม่สำเร็จหรือถูกกันความถี่ไว้ รอบหน้าจึงกวาดมาแจ้งได้เอง โดยไม่ต้องจำอะไรข้ามรอบ
 * (จำในหน่วยความจำไม่ได้อยู่แล้ว — ตัวสแกนรันบน runner ที่เกิดใหม่ทุกรอบ)
 */
export async function loadPendingSignals(
  supabase: SupabaseClient,
  userId: string,
  nowMs: number
): Promise<PendingLoad> {
  const since = new Date(nowMs - PUSH_STATE_CONFIG.PENDING_MAX_AGE_MS).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('push_sent', false)
    .gte('created_at', since)
    // แถวที่หมดอายุแล้วแต่ยังไม่ถูกปั๊ม expired (ตัวสแกนปั๊มทีหลังการแจ้งเตือน)
    // ต้องไม่ถูกกวาดมาแจ้ง ไม่งั้นเจ้าของได้ราคาเข้าที่ใช้ไม่ได้แล้ว
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(PUSH_STATE_CONFIG.PENDING_LIMIT);

  if (error) {
    if (isMissingPushColumn(error)) return { signals: [], columnMissing: true, error: null };
    return { signals: [], columnMissing: false, error: errorMessage(error) };
  }
  return { signals: (data ?? []) as Signal[], columnMissing: false, error: null };
}

/**
 * error นี้แปลว่า "ยังไม่ได้รัน migration 009" หรือเปล่า (คอลัมน์ flipped_by ไม่มี)
 * แบบแผนเดียวกับ isMissingPushColumn ข้างบน — คอลัมน์หายคือโหมดถอย ไม่ใช่ความล้มเหลว
 */
function isMissingFlipLinkColumn(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === UNDEFINED_COLUMN) return true;
  const msg = errorMessage(error).toLowerCase();
  return msg.includes('flipped_by') && (msg.includes('column') || msg.includes('does not exist'));
}

/**
 * เติม field `flip` คืนให้ "ใบเก็บตก" ที่อ่านกลับมาจากตาราง signals
 *
 * ทำไมต้องมี: field `flip` เป็นของในหน่วยความจำ ถูกถอดก่อน insert เสมอ (ดู @/types)
 * สัญญาณที่รอบของมันถูกกันความถี่หรือ push ล้ม จะถูกส่งจริงรอบถัดไปจากแถวใน DB
 * ซึ่งไม่มี field นี้ — ถ้าไม่ประกอบคืน บรรทัดเตือนกลับทิศจะหายจากใบแจ้งเตือน
 * ที่ถึงมือจริง ทั้งที่การกลับทิศเกิดจริงและป้ายถูกปั๊มไว้แล้วตั้งแต่รอบ insert
 * (ป้ายอยู่บน "ใบเก่า": flipped_by ชี้กลับมาที่ใบใหม่ จึง query ย้อนทางได้)
 *
 * โหมดถอย (ยังไม่ได้รัน 009): query ตอบ 42703 → คืน columnMissing ไม่แตะสัญญาณ
 * ในโหมดนั้นไม่มีป้ายให้ประกอบคืน ใบเก็บตกจึงแจ้งโดยไม่มีบรรทัดเตือน — ผู้เรียก
 * เป็นคนบอกความจริงข้อนี้ใน log (ห้ามเงียบ เพราะเจ้าของจะเข้าใจว่าไม่มีการกลับทิศ)
 */
async function attachFlipNotesFromDb(
  supabase: SupabaseClient,
  signals: Signal[]
): Promise<{ attached: number; columnMissing: boolean; error: string | null }> {
  if (!signals.length) return { attached: 0, columnMissing: false, error: null };

  const { data, error } = await supabase
    .from('signals')
    .select('id, action, created_at, flipped_by')
    .in('flipped_by', signals.map((s) => s.id));

  if (error) {
    if (isMissingFlipLinkColumn(error)) return { attached: 0, columnMissing: true, error: null };
    return { attached: 0, columnMissing: false, error: errorMessage(error) };
  }

  const notes = flipNotesFromMarkedRows((data ?? []) as FlippedOldRow[]);
  let attached = 0;
  for (const s of signals) {
    const note = notes.get(s.id);
    if (note) {
      s.flip = note;
      attached++;
    }
  }
  return { attached, columnMissing: false, error: null };
}

/**
 * ปั๊มว่า "แจ้งเตือนแล้ว" — เรียกหลังส่งถึงเครื่องผู้ใช้สำเร็จเท่านั้น
 *
 * ลำดับนี้สำคัญ: ส่งก่อน แล้วค่อยปั๊ม ไม่ใช่ปั๊มก่อนส่ง
 * ถ้าปั๊มก่อนแล้วส่งล้ม สัญญาณจะหายถาวรแบบเดิมเป๊ะ ๆ
 * ทางกลับกัน ปั๊มไม่สำเร็จหลังส่งสำเร็จ = รอบหน้าเด้งซ้ำหนึ่งครั้ง ซึ่งรำคาญแต่ไม่เสียหาย
 * เลือกข้าง "ยอมซ้ำ ดีกว่ายอมหาย" ทุกครั้ง
 */
export async function markSignalsNotified(
  supabase: SupabaseClient,
  signalIds: string[],
  nowMs: number
): Promise<string | null> {
  if (signalIds.length === 0) return null;
  const { error } = await supabase
    .from('signals')
    .update({ push_sent: true, push_sent_at: new Date(nowMs).toISOString() })
    .in('id', signalIds);
  return error ? errorMessage(error) : null;
}

/**
 * เวลาที่ "แจ้งเตือนสัญญาณ" ออกไปสำเร็จครั้งล่าสุดของผู้ใช้คนนี้
 *
 * ใช้ signals.push_sent_at ไม่ใช่ push_subscriptions.last_used_at ด้วยเหตุผลเดียว:
 * last_used_at ขยับทุกครั้งที่มี push ออกไป "ชนิดไหนก็ได้" รวมถึงปุ่มทดสอบที่ผู้ใช้กดเอง
 * ถ้าใช้ตัวนั้นเป็นนาฬิกา กดปุ่มทดสอบตอน 10:20 จะกันแจ้งเตือนสัญญาณจริงของช่วง 10:00
 * ทิ้งไปทั้งช่อง — ผู้ใช้ทำร้ายตัวเองด้วยการทดสอบว่าระบบทำงานไหม ซึ่งไร้เหตุผลสิ้นดี
 */
async function lastSignalNotifiedAtMs(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('signals')
    .select('push_sent_at')
    .eq('user_id', userId)
    .not('push_sent_at', 'is', null)
    .order('push_sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // อ่านไม่ได้ = ไม่รู้ว่าเพิ่งแจ้งไปหรือยัง เลือกข้างที่ "แจ้ง" ไว้ก่อน
  // เพราะการเงียบเพราะอ่าน DB ไม่ออก คือความล้มเหลวที่ผู้ใช้มองไม่เห็น
  if (error || !data?.push_sent_at) return null;
  const ms = new Date(data.push_sent_at as string).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ────────────────────────── ส่งสัญญาณทั้งรอบเป็นชุดเดียว ──────────────────────────

export interface SignalPushResult extends PushResult {
  /** จำนวนสัญญาณที่จะแจ้งรอบนี้ (รวมของค้างจากรอบก่อน · ก่อนยุบตัวซ้ำ) */
  signalCount: number;
  /** จำนวนแจ้งเตือนที่ยิงจริงในรอบนี้ — คือจำนวนครั้งที่โทรศัพท์จะสั่น */
  notifications: number;
  /** true = รวมเป็นชุดเดียว · false = สัญญาณเดี่ยวส่งแบบเดิม */
  digested: boolean;
  /** true = ถูกตัวจำกัดความถี่กันไว้ ไม่ได้ส่ง (สัญญาณยังค้างรอรอบหน้า ไม่หาย) */
  throttled: boolean;
  /** จำนวนสัญญาณค้างจากรอบก่อนที่กวาดมาแจ้งรอบนี้ */
  pendingPicked: number;
  /** false = ตาราง signals ยังไม่มีคอลัมน์ push_sent → ทำงานในโหมดถอย (สัญญาณที่พลาดจะหาย) */
  pushStateReady: boolean;
  /** จำนวนแถวที่ปั๊มว่า "แจ้งแล้ว" สำเร็จในรอบนี้ */
  marked: number;
  /** เหตุผลภาษาไทยของการตัดสินใจรอบนี้ — ใส่ log ของ cron ได้เลย */
  reason: string;
}

/** เผื่อผู้เรียกที่อยากคุมการส่งเอง และเผื่อเทสต์ที่ต้องรันโดยไม่มีเน็ต/ไม่มีกุญแจ VAPID */
export type PushSender = (payload: PushPayload) => Promise<PushResult>;

export interface SendSignalsOptions {
  /** เวลาอ้างอิง — ฉีดเข้ามาได้เพื่อให้เทสต์คุมนาฬิกาได้ */
  now?: number;
  sender?: PushSender;
  /** ข้ามตัวจำกัดความถี่ (เช่นปุ่มทดสอบที่ผู้ใช้กดเอง ต้องเด้งทันทีเสมอ) */
  ignoreThrottle?: boolean;
  /**
   * ตัวให้คะแนน "โอกาสจบใน ~1 ชม." จาก src/lib/speed-scorecard.ts
   * ไม่ส่งมา = เรียงด้วยเกณฑ์คุณภาพเดิม (ระบบต้องทำงานได้แม้ไฟล์นั้นยังไม่มี)
   */
  speedScore?: SpeedScorer | null;
}

export interface SendPendingOptions extends SendSignalsOptions {
  /**
   * ตัวกรองตามความชอบของผู้ใช้ (alert_preferences)
   * ต้องส่งเข้ามาเป็นฟังก์ชัน ไม่ใช่กรองมาก่อนแล้วส่งเฉพาะที่ผ่าน
   * เพราะของค้างจากรอบก่อนถูกอ่านขึ้นมาข้างในนี้ ผู้เรียกกรองมันล่วงหน้าไม่ได้
   */
  filter?: (signal: Signal) => boolean;
}

function emptyResult(signalCount: number): SignalPushResult {
  return {
    sent: 0,
    failed: 0,
    pruned: 0,
    noSubscriptions: false,
    errors: [],
    signalCount,
    notifications: 0,
    digested: false,
    throttled: false,
    pendingPicked: 0,
    pushStateReady: false,
    marked: 0,
    reason: '',
  };
}

/** ส่ง payload ที่ประกอบเสร็จแล้วออกไป แล้วรวมตัวเลขกลับเข้า result — ใช้ร่วมกันสองเส้นทาง */
async function deliver(result: SignalPushResult, payloads: PushPayload[], send: PushSender): Promise<void> {
  for (const payload of payloads) {
    const res = await send(payload);
    result.notifications++;
    result.sent += res.sent;
    result.failed += res.failed;
    result.pruned += res.pruned;
    // ไม่มี subscription เลยแม้แต่ payload เดียว = ผู้ใช้ยังไม่ได้เปิดแจ้งเตือน
    if (res.noSubscriptions) result.noSubscriptions = true;
    for (const e of res.errors) if (!result.errors.includes(e)) result.errors.push(e);
  }
}

/**
 * ⚠ เส้นทางเดิม — ใช้เฉพาะโหมดถอย (ยังไม่ได้รัน migration 006) และในเทสต์
 *   เส้นทางปกติของตัวสแกนคือ sendPendingSignalsToUser
 *
 * ส่งเฉพาะสัญญาณที่ผู้เรียกยื่นมา ไม่รู้จักของค้างจากรอบก่อน
 * ถ้าถูกจำกัดความถี่ = สัญญาณชุดนั้นไม่มีวันได้แจ้งอีกเลย (นี่คือบั๊กที่ migration 006 มาแก้)
 *
 * ตั้งแต่รอบแก้ 2026-08-17 ตัวจำกัดความถี่ของเส้นทางนี้ใช้กติกาเดียวกับเส้นทางปกติแล้ว
 * (ช่องชั่วโมง + ระยะห่างขั้นต่ำ ไม่มีประตูหนีให้ very_strong) เพราะสเปก "ชั่วโมงละ 1 ครั้ง"
 * ของเจ้าของไม่ได้ยกเว้นโหมดถอยไว้ — รายละเอียดและสิ่งที่ยอมแลกอยู่ที่ throttleVerdict
 */
export async function sendSignalsToUser(
  supabase: SupabaseClient,
  userId: string,
  signals: Signal[],
  options: SendSignalsOptions = {}
): Promise<SignalPushResult> {
  const now = options.now ?? Date.now();
  const send: PushSender = options.sender ?? ((payload) => sendPushToUser(supabase, userId, payload));

  const result = emptyResult(signals.length);

  const ranked = collapseDuplicates(rankSignals(signals, options.speedScore));
  if (ranked.length === 0) {
    result.reason = 'ไม่มีสัญญาณให้แจ้ง';
    return result;
  }

  if (!options.ignoreThrottle) {
    const verdict = throttleVerdict({
      nowMs: now,
      lastPushAtMs: await lastAnyPushAtMs(supabase, userId),
      signals: ranked,
    });
    if (!verdict.send) {
      result.throttled = true;
      result.reason = verdict.reason;
      return result;
    }
    result.reason = verdict.reason;
  } else {
    result.reason = 'ข้ามการจำกัดความถี่ตามที่ผู้เรียกสั่ง';
  }

  // อ่านเกณฑ์จาก config ตัวเดียวกับที่ buildPushPayloads ใช้ — ถ้าฮาร์ดโค้ดไว้ตรงนี้
  // วันไหนปรับเกณฑ์ในไฟล์เดียว ตัวเลขที่รายงานใน log จะโกหกทันทีโดยไม่มีอะไรจับได้
  result.digested = ranked.length >= PUSH_DIGEST_CONFIG.DIGEST_MIN_SIGNALS;
  await deliver(result, buildPushPayloads(ranked, now, options.speedScore), send);

  return result;
}

/**
 * นาฬิกาของโหมดถอย: เวลาที่ push ชนิดไหนก็ได้ถึงเครื่องผู้ใช้สำเร็จครั้งล่าสุด
 *
 * ข้อจำกัดที่ต้องรู้ (และเป็นเหตุผลที่เส้นทางปกติเลิกใช้ตัวนี้):
 * นาฬิกาเป็นของ "ผู้ใช้" ไม่ใช่ของ "ชนิดแจ้งเตือน" — ปุ่มทดสอบก็ขยับนาฬิกานี้ด้วย
 */
async function lastAnyPushAtMs(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('last_used_at')
    .eq('user_id', userId)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.last_used_at) return null;

  const ms = new Date(data.last_used_at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * ส่งสัญญาณของผู้ใช้หนึ่งคนเป็นแจ้งเตือน "ครั้งเดียวต่อชั่วโมง" และไม่ทิ้งสัญญาณสักตัว
 *
 * นี่คือทางที่ตัวสแกนต้องเรียก (scripts/scan-universe.mjs)
 * ลำดับการทำงาน และเหตุผลของลำดับ:
 *   1. กวาดของค้าง (push_sent = false) จาก DB → ผสมกับของที่เพิ่งสแกนเจอรอบนี้
 *      กวาดก่อนเสมอ ไม่ใช่เฉพาะตอนรอบนี้ไม่มีสัญญาณ — ของค้างกับของใหม่ต้องอยู่ในใบเดียวกัน
 *      ไม่งั้นจะกลายเป็นสองใบในชั่วโมงเดียว ซึ่งขัดสเปก
 *   2. กรองตามความชอบผู้ใช้ → จัดลำดับ → ยุบตัวซ้ำ
 *   3. เช็กว่าชั่วโมงนี้แจ้งไปหรือยัง (ถูกกัน = ไม่ปั๊มอะไรเลย ของค้างอยู่ครบ รอบหน้าเอาใหม่)
 *   4. ส่ง แล้ว "ถ้าถึงเครื่องจริงอย่างน้อยหนึ่งเครื่อง" จึงปั๊มว่าแจ้งแล้ว
 *
 * ⚠ ถ้าตารางยังไม่มีคอลัมน์ push_sent (ยังไม่ได้รัน migration 006) จะถอยไปใช้
 *   sendSignalsToUser ของเดิมทั้งดุ้น พร้อมติดเหตุผลไว้ใน reason ให้เห็นใน log ของ CI
 *   โค้ดจะขึ้นก่อนที่เจ้าของจะรัน SQL เสมอ เส้นทางนี้จึงต้องเดินได้จริง ไม่ใช่แค่ไม่พัง
 */
export async function sendPendingSignalsToUser(
  supabase: SupabaseClient,
  userId: string,
  freshSignals: Signal[],
  options: SendPendingOptions = {}
): Promise<SignalPushResult> {
  const now = options.now ?? Date.now();
  const send: PushSender = options.sender ?? ((payload) => sendPushToUser(supabase, userId, payload));
  const allow = options.filter ?? (() => true);

  const pending = await loadPendingSignals(supabase, userId, now);

  // ── โหมดถอย: ยังไม่ได้รัน migration 006 ─────────────────────────────────────────
  if (pending.columnMissing) {
    const legacy = await sendSignalsToUser(supabase, userId, freshSignals.filter(allow), options);
    legacy.pushStateReady = false;
    legacy.reason =
      'ยังไม่ได้รัน supabase/migrations/006_signal_push_state.sql — ' +
      'ทำงานแบบเดิม (สัญญาณที่ถูกกันความถี่หรือส่งไม่สำเร็จจะไม่ได้เก็บตกรอบหน้า) · ' +
      legacy.reason;
    return legacy;
  }

  const result = emptyResult(0);
  result.pushStateReady = true;
  if (pending.error) result.errors.push(`อ่านสัญญาณค้างไม่สำเร็จ: ${pending.error}`);

  // ผสมของค้างกับของใหม่ แล้วตัด id ซ้ำ (ของที่เพิ่ง insert รอบนี้จะโผล่ทั้งสองฝั่ง)
  const byId = new Map<string, Signal>();
  for (const s of pending.signals) byId.set(s.id, s);
  let pickedFromDb = byId.size;
  for (const s of freshSignals) {
    if (byId.has(s.id)) pickedFromDb--; // นับเป็น "ของรอบนี้" ไม่ใช่ของค้าง
    byId.set(s.id, s);
  }

  const wanted = [...byId.values()].filter(allow);
  result.signalCount = wanted.length;
  result.pendingPicked = Math.max(0, pickedFromDb);

  // ── ประกอบคำเตือนกลับทิศคืนให้ใบเก็บตก ─────────────────────────────────────────
  // ของใหม่รอบนี้ถือ field `flip` ในหน่วยความจำมาแล้ว แต่ของค้างจากรอบก่อน
  // (รอบที่ถูกกันความถี่/ส่งล้ม) อ่านกลับจากตารางซึ่งไม่มี field นี้ — ประกอบคืน
  // จากป้าย flipped_by ก่อนจัดลำดับ/ยุบซ้ำ เพื่อให้ collapseDuplicates ย้ายคำเตือน
  // ไปเกาะใบที่รอดได้ · รอบปกติที่ไม่มีของค้าง = ไม่ยิง query เพิ่มเลย
  const freshIds = new Set(freshSignals.map((s) => s.id));
  const carried = wanted.filter((s) => !freshIds.has(s.id) && !s.flip);
  if (carried.length) {
    const flipBack = await attachFlipNotesFromDb(supabase, carried);
    if (flipBack.error) {
      // ประกอบคืนไม่ได้ = ใบเก็บตกรอบนี้อาจไม่มีบรรทัดเตือนทั้งที่ควรมี — ต้องเห็นใน log
      result.errors.push(`อ่านป้ายกลับทิศของใบเก็บตกไม่สำเร็จ (ใบแจ้งเตือนรอบนี้อาจไม่มีบรรทัดเตือน): ${flipBack.error}`);
    } else if (flipBack.columnMissing) {
      result.errors.push(
        'ยังไม่ได้รัน supabase/migrations/009_signal_flips.sql — ' +
          'ใบเก็บตกจากรอบก่อนแจ้งโดยไม่มีบรรทัดเตือนกลับทิศ (ไม่มีป้ายในตารางให้ตรวจย้อน)'
      );
    }
  }

  const ranked = collapseDuplicates(rankSignals(wanted, options.speedScore));
  if (ranked.length === 0) {
    result.reason = 'ไม่มีสัญญาณให้แจ้ง';
    return result;
  }

  if (!options.ignoreThrottle) {
    const verdict = roundThrottleVerdict({
      nowMs: now,
      lastNotifiedAtMs: await lastSignalNotifiedAtMs(supabase, userId),
      signalCount: ranked.length,
    });
    if (!verdict.send) {
      result.throttled = true;
      result.reason = verdict.reason;
      return result;
    }
    result.reason = verdict.reason;
  } else {
    result.reason = 'ข้ามการจำกัดความถี่ตามที่ผู้เรียกสั่ง';
  }

  result.digested = ranked.length >= PUSH_DIGEST_CONFIG.DIGEST_MIN_SIGNALS;
  await deliver(result, buildPushPayloads(ranked, now, options.speedScore), send);

  // ── ปั๊มว่าแจ้งแล้ว เฉพาะเมื่อถึงเครื่องจริง ──────────────────────────────────────
  //
  // ปั๊มทุกตัวที่ "อยู่ในใบนี้" รวมถึงตัวที่ถูกยุบเพราะซ้ำ และตัวที่ล้นบรรทัดจนแสดงไม่หมด
  // (ใบนั้นบอกจำนวนที่เหลือไว้แล้ว และหน้า /signals เรียงลำดับเดียวกันให้กดดูต่อได้)
  // ถ้าไม่ปั๊มตัวที่แสดงไม่หมด รอบหน้ามันจะกลับมาเป็น "ของค้าง" แล้ววนซ้ำไม่จบ
  //
  // ตัวที่ถูกตัวกรองความชอบผู้ใช้คัดออก จะไม่ถูกปั๊ม — ปล่อยค้างไว้ตามอายุแล้วหลุดไปเอง
  // ถ้าปั๊มมันด้วย แล้ววันหนึ่งผู้ใช้เปลี่ยนใจเปิดรับ BUY อีกครั้ง ของที่เคยถูกคัดจะหายไปแล้ว
  if (result.sent > 0) {
    const err = await markSignalsNotified(supabase, wanted.map((s) => s.id), now);
    if (err) {
      // ปั๊มไม่ลง = รอบหน้าเด้งซ้ำหนึ่งครั้ง ต้องเห็นใน log ไม่ใช่เงียบ
      result.errors.push(`ปั๊มสถานะ "แจ้งแล้ว" ไม่สำเร็จ (รอบหน้าอาจเด้งซ้ำ): ${err}`);
    } else {
      result.marked = wanted.length;
    }
  } else if (result.notifications > 0) {
    result.reason += ' · ส่งไม่ถึงเครื่องเลย จึงยังไม่ปั๊มว่าแจ้งแล้ว รอบหน้าจะลองใหม่';
  }

  return result;
}
