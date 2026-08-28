/**
 * ตัวสแกนยังเดินอยู่ไหม — ตัดสินจากเวลาที่ราคาถูกอัปเดตล่าสุด
 *
 * ── ทำไมหน้านี้ต้องมี ────────────────────────────────────────────────────────
 * เมื่อ 2026-08-26 ตัวจับเวลาของ GitHub Actions หยุดยิงเองเงียบ ๆ นานกว่า 24 ชั่วโมง
 * ทุก workflow ยังขึ้นสถานะ active · สั่งรันเองก็ทำงานปกติ · ไม่มี error ที่ไหนเลย
 * แต่ไม่มีรอบไหนเกิดขึ้นจริง และเจ้าของรู้ตัวก็ต่อเมื่อสังเกตเองว่า "วันนี้ไม่มีแจ้งเตือน"
 *
 * ระบบที่เงียบเพราะไม่มีสัญญาณ กับระบบที่เงียบเพราะมันตายไปแล้ว หน้าตาเหมือนกันทุกประการ
 * จากฝั่งผู้ใช้ ตัวชี้วัดนี้จึงมีไว้แยกสองอย่างนั้นออกจากกัน
 *
 * ใช้ market_prices.updated_at เป็นตัวชี้ เพราะตัวสแกนเขียนราคาทุกรอบเสมอ
 * แม้รอบนั้นจะไม่มีสัญญาณผ่านเกณฑ์เลยก็ตาม — ต่างจากตาราง signals ที่ว่างได้ตามปกติ
 */

export type ScanHealthLevel = 'ok' | 'slow' | 'stalled' | 'unknown';

export interface ScanHealth {
  level: ScanHealthLevel;
  /** อายุของข้อมูลล่าสุด หน่วยนาที — null เมื่อยังไม่รู้ */
  ageMinutes: number | null;
  label: string;
  detail: string;
}

/**
 * เกณฑ์มาจากพฤติกรรมที่วัดจริง ไม่ใช่ตัวเลขที่ตั้งเอาเอง — และไม่ใช่จากหน้าปัด cron
 *
 * หน้าปัดตั้งไว้ทุก 15 นาที (เปลี่ยนเมื่อ 2026-08-28 · เดิมทุก 30 นาที) แต่ตอนวัดจริง
 * ภายใต้หน้าปัด 30 นาที GitHub ส่งเฉลี่ยราว 56 นาที และเคยวัดช่องว่างระหว่างรอบได้
 * ตั้งแต่ 15 ถึง 95 นาทีในการใช้งานปกติ (ดูบันทึกใน scan-universe.yml)
 * การหมุนหน้าปัดให้ถี่ขึ้นไม่ได้ทำให้ GitHub ตรงเวลาขึ้น เกณฑ์สองตัวนี้จึงคงเดิม
 * ตามพฤติกรรมที่วัดได้ ไม่ใช่ตามหน้าปัด:
 * 2 ชั่วโมงยังอยู่ในวิสัยของ "ช้าตามปกติของ GitHub"
 * 6 ชั่วโมงคือเกินกว่าที่เคยเห็นตอนระบบยังดีอยู่มาก จึงถือว่าหยุดทำงาน
 */
const SLOW_AFTER_MIN = 120;
const STALLED_AFTER_MIN = 360;

export function scanHealth(lastUpdatedIso: string | null | undefined, nowMs = Date.now()): ScanHealth {
  if (!lastUpdatedIso) {
    return {
      level: 'unknown',
      ageMinutes: null,
      label: 'ยังไม่รู้สถานะ',
      detail: 'ยังไม่มีข้อมูลราคาในระบบ — อาจเป็นเพราะตัวสแกนยังไม่เคยรันสำเร็จเลย',
    };
  }

  const t = Date.parse(lastUpdatedIso);
  if (!Number.isFinite(t)) {
    return { level: 'unknown', ageMinutes: null, label: 'ยังไม่รู้สถานะ', detail: 'เวลาที่บันทึกไว้อ่านไม่ออก' };
  }

  const ageMinutes = Math.max(0, Math.round((nowMs - t) / 60000));
  const human =
    ageMinutes < 60
      ? `${ageMinutes} นาทีที่แล้ว`
      : ageMinutes < 60 * 48
        ? `${Math.floor(ageMinutes / 60)} ชั่วโมง ${ageMinutes % 60} นาทีที่แล้ว`
        : `${Math.floor(ageMinutes / 1440)} วันที่แล้ว`;

  if (ageMinutes >= STALLED_AFTER_MIN) {
    return {
      level: 'stalled',
      ageMinutes,
      label: 'ตัวสแกนหยุดทำงาน',
      detail: `รอบล่าสุดเมื่อ ${human} ซึ่งนานเกินกว่าที่เคยเห็นตอนระบบปกติมาก — ความเงียบตอนนี้ไม่ได้แปลว่าไม่มีสัญญาณ แต่แปลว่าไม่มีใครมองตลาดอยู่`,
    };
  }
  if (ageMinutes >= SLOW_AFTER_MIN) {
    return {
      level: 'slow',
      ageMinutes,
      label: 'รอบสแกนห่างกว่าปกติ',
      detail: `รอบล่าสุดเมื่อ ${human} · หน้าปัดตั้งไว้ทุก 15 นาทีแต่ GitHub ส่งจริงเฉลี่ยราว 56 นาที และทิ้งรอบไปบ้างเป็นปกติ`,
    };
  }
  return {
    level: 'ok',
    ageMinutes,
    label: 'ตัวสแกนทำงานปกติ',
    detail: `รอบล่าสุดเมื่อ ${human}`,
  };
}
