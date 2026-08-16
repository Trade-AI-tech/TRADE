/**
 * ฝั่ง client ของ Web Push — สมัคร/ถอนการแจ้งเตือนของเครื่องนี้
 *
 * เงื่อนไขที่ต้องครบก่อนใช้ได้ (ตรวจด้วย pushSupportStatus ก่อนเรียก subscribe):
 * - เบราว์เซอร์รองรับ ServiceWorker + PushManager
 * - หน้าเว็บเป็น secure context (HTTPS หรือ localhost)
 * - iOS: ต้อง "เพิ่มไปยังหน้าจอโฮม" แล้วเปิดจากไอคอนนั้น (ข้อบังคับของ Apple, iOS 16.4+)
 */

// กุญแจสาธารณะ VAPID — เปิดเผยได้โดยธรรมชาติ (ฝั่งลับอยู่ใน Supabase Edge Function Secrets)
// ถ้าหมุนกุญแจใหม่ ต้องเปลี่ยนทั้งคู่พร้อมกัน และผู้ใช้ทุกเครื่องต้องกดสมัครแจ้งเตือนใหม่
export const VAPID_PUBLIC_KEY =
  'BJ5rraVBry2126riFyLp_kt2DdVMdzddMbfdMcGIOe6syMh2KkJkW6-js-kBXbhW0H6k6SvrcLBojW6gYjAeZ28';

/**
 * PushManager ต้องการกุญแจเป็น BufferSource — แปลงจาก base64url
 * ประกาศ buffer เป็น ArrayBuffer ตรง ๆ เพราะ TS 5.7 แยก Uint8Array<ArrayBufferLike>
 * ออกจาก BufferSource แล้ว (SharedArrayBuffer ใช้กับ subscribe ไม่ได้)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: string };

/** ตรวจว่าเครื่อง/เบราว์เซอร์นี้ใช้ push ได้ไหม — คืนเหตุผลภาษาไทยที่เอาไปโชว์ได้เลย */
export function pushSupportStatus(): PushSupport {
  if (typeof window === 'undefined') return { ok: false, reason: 'ยังไม่พร้อม' };
  if (!('serviceWorker' in navigator)) {
    return { ok: false, reason: 'เบราว์เซอร์นี้ไม่รองรับ Service Worker' };
  }
  if (!('PushManager' in window)) {
    // iOS Safari ที่ยังไม่ได้เพิ่มไปหน้าจอโฮมจะเข้าเคสนี้
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return {
      ok: false,
      reason: isIOS
        ? 'บน iPhone ต้องกด แชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิดแอปจากไอคอนนั้นก่อน ถึงจะเปิดแจ้งเตือนได้ (ข้อบังคับของ Apple)'
        : 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบ push',
    };
  }
  if (!window.isSecureContext) {
    return { ok: false, reason: 'ต้องเปิดผ่าน HTTPS (หรือ localhost) เท่านั้น' };
  }
  return { ok: true };
}

/** สถานะการสมัครปัจจุบันของเครื่องนี้ */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const support = pushSupportStatus();
  if (!support.ok) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/**
 * เปิดแจ้งเตือนบนเครื่องนี้: ลงทะเบียน SW → ขอสิทธิ์ → สมัครกับบริการ push ของ OS
 * → ส่ง subscription ให้ server เก็บ
 * คืน error เป็นข้อความไทยพร้อมโชว์ — ไม่โยน exception ให้ UI ต้องแกะเอง
 */
export async function enablePush(): Promise<{ success: boolean; error?: string }> {
  const support = pushSupportStatus();
  if (!support.ok) return { success: false, error: support.reason };

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error:
          permission === 'denied'
            ? 'การแจ้งเตือนถูกปิดไว้ในตั้งค่าเบราว์เซอร์ — ต้องไปเปิดใน Settings ของเครื่องก่อน'
            : 'ยังไม่ได้อนุญาตการแจ้งเตือน',
      };
    }

    // แยกสองกิ่งให้รู้ว่า subscription "สร้างใหม่รอบนี้" หรือหยิบของเดิม —
    // ถ้าสร้างใหม่แล้ว server บันทึกล้ม (401/500) ต้องถอนทิ้ง ไม่งั้นเบราว์เซอร์ถือ
    // subscription ที่ server ไม่รู้จักค้างไว้ หน้า settings จะโชว์ "เปิดอยู่" ทั้งที่
    // ไม่มีวันได้รับแจ้งเตือนจริงสักครั้ง (สถานะโกหกถาวรจนกว่าจะกดปิดเอง)
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    const createdThisCall = existing === null;

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    const data = await res.json();
    if (!data.success) {
      if (createdThisCall) {
        try { await sub.unsubscribe(); } catch { /* best-effort — อย่าให้การถอนล้มกลบ error จริง */ }
      }
      return { success: false, error: data.error ?? 'บันทึกไม่สำเร็จ' };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** ปิดแจ้งเตือนของเครื่องนี้ — ถอนทั้งฝั่งเบราว์เซอร์และลบแถวใน server */
export async function disablePush(): Promise<{ success: boolean; error?: string }> {
  try {
    const sub = await getExistingSubscription();
    if (!sub) return { success: true };

    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
