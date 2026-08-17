/**
 * แปลง error ที่โยนมาจากที่ไหนก็ได้ ให้เป็นข้อความที่อ่านรู้เรื่อง
 *
 * ทำไมต้องมี: `String(err)` ใช้ได้เฉพาะกับ Error instance
 * แต่ error จาก Supabase/PostgREST เป็น plain object ธรรมดา ({ message, code, details, hint })
 * ซึ่ง String() จะได้ '[object Object]' — ผู้ใช้เห็นแล้วไม่รู้อะไรเลยว่าเกิดอะไรขึ้น
 * (เจอจริง: กดเปิดแจ้งเตือนแล้วขึ้น '[object Object]' ทั้งที่สาเหตุจริงคือตารางยังไม่ถูกสร้าง)
 *
 * ใส่ code ต่อท้ายด้วยเมื่อมี เพราะรหัสอย่าง 42P01 (ตารางไม่มี) หรือ 42501 (สิทธิ์ไม่พอ)
 * ชี้ต้นเหตุได้ทันทีโดยไม่ต้องเดา
 */
export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;

  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts: string[] = [];
    if (typeof e.message === 'string' && e.message) parts.push(e.message);
    if (typeof e.details === 'string' && e.details && e.details !== e.message) parts.push(e.details);
    if (typeof e.hint === 'string' && e.hint) parts.push(`(${e.hint})`);
    if (typeof e.code === 'string' && e.code) parts.push(`[${e.code}]`);
    if (parts.length) return parts.join(' ');

    // ไม่เข้ารูปแบบไหนเลย — ดีกว่าปล่อยเป็น [object Object] แม้จะอ่านยาก
    try {
      return JSON.stringify(err);
    } catch {
      return 'เกิดข้อผิดพลาดที่อธิบายไม่ได้';
    }
  }

  return String(err);
}
