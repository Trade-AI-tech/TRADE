import type { Signal, SignalAction, SignalFlipNote } from '@/types';

/**
 * ตรรกะ "แจ้งกลับทิศ" — ใบเก่ายังเปิดอยู่ แล้วเครื่องยนต์ออกสัญญาณทิศตรงข้าม
 * บน symbol+timeframe เดียวกัน ต้องบอกเจ้าของชัด ๆ เพื่อให้เขาพิจารณาปิดไม้เอง
 * (คำสั่งเจ้าของ 2026-08-28: "ควรบอกด้วยว่าสัญญาณที่ส่งมามีการเปลี่ยนแปลง
 * ให้ตัดขายทิ้งหรือตัดขาดทุนได้เลย เพื่อเปลี่ยนทิศทางของสัญญาณกราฟนั้น")
 *
 * ไฟล์นี้ตั้งใจให้ "บริสุทธิ์" แบบเดียวกับ push-digest.ts — ไม่แตะ DB ไม่อ่านนาฬิกาเอง
 * ทุกฟังก์ชันรับข้อมูล/เวลาเข้ามาตรง ๆ เพื่อให้ scripts/test-signal-flips.mjs
 * ทดสอบด้วย node เปล่า ๆ ได้โดยไม่ต้องมีเน็ตหรือ DB จริง
 * ตัวเชื่อมกับ DB มีสองจุด: scripts/scan-universe.mjs (ปั๊ม flipped_at/flipped_by
 * หลัง insert ใบใหม่สำเร็จ — ดู markFlipTargets ที่รับตัวอัปเดตเป็น callback)
 * และ src/lib/push-server.ts (อ่านป้ายกลับมาประกอบโน้ตให้ใบเก็บตก —
 * ดู flipNotesFromMarkedRows ที่รับแถวเข้ามาตรง ๆ ไม่ยิง query เอง)
 *
 * ── กติกาความซื่อสัตย์ของทุกข้อความที่ออกจากไฟล์นี้ ──────────────────────────────
 *  · บอกเฉพาะข้อเท็จจริง: เครื่องยนต์อ่านกลับทิศแล้ว + พิจารณาปิดไม้เอง
 *  · ห้ามอ้างว่าการปิดตอนนี้จะลดขาดทุน/เพิ่มกำไร — ไม่เคยวัด
 *  · ห้ามคำว่า "โอกาสชนะ/ความแม่น" และห้ามสื่อว่าเรียลไทม์
 *    (ความหน่วงจริง = รอบสแกนของ GitHub Actions ~15-56 นาที)
 *
 * ── flipped ≠ closed ─────────────────────────────────────────────────────────────
 * การปั๊มป้ายกลับทิศ **ไม่ปิดบัญชีใบเก่า** — เราไม่รู้ว่าเจ้าของปิดไม้จริงไหม
 * ตัวเก็บผล (scripts/resolve-signals.mjs) ต้อง resolve ใบที่โดนปั๊มตามปกติทุกอย่าง
 * เพื่อให้ ledger บันทึก "สิ่งที่สัญญาณทำ" ต่อไป — ห้ามใครเอา flipped_at ไปเป็น
 * เงื่อนไขข้ามการ resolve หรือข้ามการนับใน scorecard เด็ดขาด
 */

// ─────────────────────────────── รูปร่างข้อมูล ───────────────────────────────

/**
 * แถวจาก query กันซ้ำของตัวสแกน (ขั้นที่ 5 ใน scan-universe.mjs)
 * flipped_at/outcome เป็น optional เพราะสองคอลัมน์นี้มาจาก migration 009/007
 * ที่เจ้าของอาจยังไม่ได้รัน — ตัวสแกน probe ก่อนแล้วเลือก select เฉพาะที่มีจริง
 */
export interface FlipScanRow {
  id: string;
  user_id: string;
  symbol: string;
  action: string;
  timeframe: string;
  created_at: string;
  flipped_at?: string | null;
  outcome?: string | null;
}

/** ผลของการปั๊มป้ายหนึ่งรอบ — ตัวเลขเอาไปรายงานใน log ของตัวสแกนตรง ๆ */
export interface FlipMarkResult {
  /** จำนวนใบเก่าที่ปั๊ม flipped_at/flipped_by สำเร็จ */
  marked: number;
  /** true = เจอ 42703 ระหว่างปั๊ม (ยังไม่ได้รัน migration 009) — ห้ามพัง แค่ข้าม */
  missingColumn: boolean;
  /** ข้อผิดพลาดอื่นที่ไม่ใช่เรื่องคอลัมน์หาย — รายงานเป็น warning ไม่ทำให้รอบล้ม */
  errors: string[];
}

// ─────────────────────────────── การหาใบที่โดนกลับทิศ ───────────────────────────────

/** BUY ↔ SELL เท่านั้น — HOLD/CLOSE ไม่มี "ทิศ" ให้กลับ จึงคืน null */
export function oppositeAction(action: string): SignalAction | null {
  if (action === 'BUY') return 'SELL';
  if (action === 'SELL') return 'BUY';
  return null;
}

/**
 * ตัวเก็บผล (scripts/resolve-signals.mjs) ยังไม่ปิดบัญชีใบนี้ใช่ไหม
 *
 * ── ทำไมทุกฝั่งที่ "แสดง/แจ้งเตือน" ต้องถามคำถามนี้ ─────────────────────────────
 * เจ้าของรายงานเมื่อ 2026-09-01 ว่า "สัญญาณที่แจ้งเตือนมาไม่ตรงกับสถานะกราฟปัจจุบัน"
 * สาเหตุหนึ่งคือ ledger ปิดใบไปแล้ว (outcome='sl'/'tp'/'timeout') แต่หน้าเว็บ/แจ้งเตือน
 * ดูแค่ status ซึ่งตอนนั้นยังค้างเป็น 'active' อยู่ ผลคือไม้ที่โดนตัดขาดทุนไปแล้ว
 * ยังขึ้นเป็น "โอกาสที่เปิดอยู่" และยังถูกป้อนราคาสดทุกรอบจนดูเหมือนมีชีวิต
 *
 * โหมดถอย (ยังไม่ได้รัน migration 007 = ไม่มีคอลัมน์ outcome): select('*') คืน undefined
 * ให้คอลัมน์ที่ไม่มี → เงื่อนไข `== null` ผ่านเอง = ทุกใบนับว่ายังเปิด ซึ่งจริงตามระบบ
 * เพราะในโหมดนั้นไม่มีการปิดบัญชีเกิดขึ้นเลย (พฤติกรรมเดิมเป๊ะ ไม่ต้อง probe ไม่ต้องแตกกิ่ง)
 *
 * ⚠ ห้ามย้ายเงื่อนไขนี้ไปอยู่ใน query ของ Supabase (.or('outcome.is.null,outcome.eq.open'))
 *   บน DB ที่ยังไม่ได้รัน 007 จะได้ 42703 แล้วผู้เรียกที่ไม่ได้แยก error ชนิดนี้ออกมา
 *   (เช่น loadPendingSignals ที่ isMissingPushColumn จับได้เฉพาะคำว่า push_sent)
 *   จะตกลง branch error แล้วคืนชุดว่าง = การเก็บตกแจ้งเตือนดับเงียบทั้งระบบ
 */
export function ledgerStillOpen(row: { outcome?: string | null }): boolean {
  return row.outcome == null || row.outcome === 'open';
}

/**
 * ใบนี้ยังเป็น "โอกาสที่เปิดอยู่" จริงไหม — ใช้เป็นตัวกรองเดียวของทุกทางที่แสดงผล/แจ้งเตือน
 *
 * ต้องผ่านสองด่านพร้อมกัน เพราะสองคอลัมน์ตอบคนละคำถาม:
 *   status  = ใบยังไม่หมดอายุ/ไม่ถูกยกเลิก (ตัวสแกนปั๊ม 'expired' เมื่อเลย expires_at)
 *   outcome = ledger ยังไม่ปิดบัญชี
 * ก่อน 2026-09-03 หน้า /signals ไม่มีตัวกรองทั้งสองตัวเลย จึงโชว์ทุกแถวในตาราง signals
 * รวมใบที่หมดอายุไปแล้วและใบที่ ledger ปิดไปแล้ว
 *
 * flipped ≠ closed — ใบที่โดนปั๊มป้ายกลับทิศยังเป็นโอกาสที่เปิดอยู่ (ป้ายเป็นแค่คำเตือน
 * ให้เจ้าของพิจารณาปิดไม้เอง เราไม่รู้ว่าเขาปิดจริงไหม) จึงจงใจไม่ตรวจ flipped_at ที่นี่
 */
export function isLiveSignalRow(row: { status?: string | null; outcome?: string | null }): boolean {
  return row.status === 'active' && ledgerStillOpen(row);
}

/**
 * หาใบ active เดิมของ user+symbol+timeframe เดียวกัน ที่ action ตรงข้ามกับใบใหม่
 *
 * เงื่อนไขครบสี่ข้อ (ตกข้อเดียว = ไม่ใช่การกลับทิศ):
 *   1. เจ้าของเดียวกัน + symbol เดียวกัน + timeframe เดียวกัน — คนละ timeframe คือ
 *      คนละมุมมอง ไม่ใช่การกลับทิศ (1H SELL ไม่ได้แปลว่าใบ 1D BUY ผิด)
 *   2. action ตรงข้ามกันจริง (BUY↔SELL) — ทิศเดียวกันคือการยืนยัน ไม่ใช่การกลับ
 *   3. ยังไม่เคยถูกปั๊มป้าย (flipped_at เป็น null/ไม่มีค่า) — ใบที่ปั๊มแล้วไม่ปั๊มซ้ำ
 *      หมายเหตุโหมดถอย: ยังไม่ได้รัน 009 = คอลัมน์ไม่ถูก select มา (undefined) = ผ่านข้อนี้
 *      ซึ่งถูกต้อง เพราะในโหมดนั้นไม่มีใบไหนถูกปั๊มได้อยู่แล้ว คำเตือนต้องยังออก
 *   4. ledger ยังไม่ปิดบัญชีใบนั้น (outcome เป็น null/'open') — แถวที่ตัวเก็บผลปิดแล้ว
 *      (เช่น outcome='sl') ยังมี status='active' ค้างอยู่ได้ เพราะ resolver ไม่แตะ status
 *      การเตือนให้ "ปิดไม้" ที่ ledger ปิดไปแล้วคือการเตือนผิดใบ
 *      หมายเหตุโหมดถอย: ยังไม่ได้รัน 007 = ไม่มีคอลัมน์ outcome = ไม่เคยมีการปิดบัญชีเลย
 *      ทุกใบจึงนับว่ายังเปิด — จริงตามระบบ ไม่ใช่การเดา
 *
 * เรียงใบใหม่สุดขึ้นก่อน — ข้อความเตือนอ้าง "ใบล่าสุด" ที่โดนกลับทิศเสมอ
 */
export function findFlipTargets(
  fresh: { user_id: string; symbol: string; action: string; timeframe: string },
  recentActiveRows: readonly FlipScanRow[]
): FlipScanRow[] {
  const opp = oppositeAction(fresh.action);
  if (!opp) return [];
  return recentActiveRows
    .filter(
      (r) =>
        r.user_id === fresh.user_id &&
        r.symbol === fresh.symbol &&
        r.timeframe === fresh.timeframe &&
        r.action === opp &&
        r.flipped_at == null &&
        ledgerStillOpen(r)
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

// ─────────────────────────────── การประกอบข้อความ ───────────────────────────────

/**
 * เวลาแบบ "HH:mm" ในโซนไทย — คำนวณเองด้วย UTC+7 ตายตัว ไม่พึ่ง Intl/ICU ของเครื่อง
 * ทำได้เพราะไทยไม่มี DST (เลิกไปตั้งแต่ พ.ศ. 2488) ผลจึงเท่ากันทุก runtime ทุกเครื่อง
 * — สำคัญกับทั้งเทสต์ (ตัวเลขต้องซ้ำได้) และ SSR (server กับ browser ต้องพิมพ์ตรงกัน)
 * parse ไม่ได้คืน null — ห้ามเดาเวลา
 */
export function thTimeHHmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const th = new Date(t + 7 * 3600_000);
  return `${String(th.getUTCHours()).padStart(2, '0')}:${String(th.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * บรรทัดเตือนกลับทิศในใบแจ้งเตือน — หนึ่งการกลับทิศ = หนึ่งบรรทัด ห้ามเกิน
 *
 * รูปเต็ม: "⚠ กลับทิศจาก BUY ที่ส่งเมื่อ 14:32 — ถ้ายังถือใบเดิมอยู่ พิจารณาปิด/ตัดขาดทุน"
 *   · action เดิมเป็นของจริงจากใบที่โดนกลับทิศ ไม่ใช่คำกลาง ๆ
 *   · เวลาเป็นโซนไทย · parse เวลาไม่ได้ = ตัดส่วนเวลาทิ้ง ไม่ใช่ใส่เลขมั่ว
 *   · "พิจารณาปิด/ตัดขาดทุน" คือการส่งการตัดสินใจคืนเจ้าของ — จงใจไม่พูดว่าการปิดตอนนี้
 *     จะได้ผลดีกว่า เพราะไม่เคยวัด
 *   · symbol ใส่เฉพาะตอนใบแจ้งเตือนมีหลายสัญญาณ (เหตุผลเดียวกับเลขอันดับใน signalLine:
 *     มีตัวเดียวไม่ต้องบอกชื่อซ้ำ เปลืองที่) — ผู้เรียกเป็นคนส่ง symbol เข้ามาเอง
 */
export function flipWarningLine(
  prevAction: SignalAction,
  prevCreatedAt: string | null | undefined,
  symbol?: string | null
): string {
  const time = thTimeHHmm(prevCreatedAt);
  const name = symbol ? `${symbol} ` : '';
  const when = time ? ` ที่ส่งเมื่อ ${time}` : '';
  return `⚠ ${name}กลับทิศจาก ${prevAction}${when} — ถ้ายังถือใบเดิมอยู่ พิจารณาปิด/ตัดขาดทุน`;
}

// ─────────────────────────────── การปั๊มป้ายลง DB ───────────────────────────────

/** รหัส Postgres เมื่ออ้างถึงคอลัมน์ที่ไม่มีอยู่ — แบบเดียวกับ push-server.ts */
const UNDEFINED_COLUMN = '42703';

/**
 * error นี้แปลว่า "ยังไม่ได้รัน migration 009" หรือเปล่า
 * ต้องแยกจาก error อื่นเพราะสองอย่างทำคนละแบบ: คอลัมน์ยังไม่มี → ข้ามการปั๊มทั้งรอบ
 * แล้วบอกเจ้าของให้รัน SQL (คำเตือนในแจ้งเตือนยังออกตามปกติ — มันไม่พึ่งคอลัมน์นี้)
 * ส่วน error อื่น → รายงานเป็น warning รายใบ แล้วลองใบถัดไปต่อ
 */
function isMissingFlipColumn(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === UNDEFINED_COLUMN) return true;
  const msg = String(error.message ?? '').toLowerCase();
  return (msg.includes('flipped_at') || msg.includes('flipped_by')) && (msg.includes('column') || msg.includes('does not exist'));
}

/** รูปของตัวอัปเดต — scan-universe.mjs ส่ง closure ครอบ supabase client เข้ามา */
export type FlipUpdater = (
  targetIds: string[],
  patch: { flipped_at: string; flipped_by: string }
) => Promise<{
  error: { code?: string | null; message?: string | null } | null;
  /**
   * แถวที่ถูกอัปเดตจริง (updater ของตัวสแกนต่อ .select('id') ท้าย update)
   * ไม่ส่งมา = นับจากจำนวน id ที่ขอ — ตัวเลข "ปั๊มแล้ว" ใน log ต้องไม่โกหก
   * เมื่อแถวโดนรอบสแกนที่ซ้อนกัน (watchdog + cron) ปั๊มตัดหน้าไปแล้ว
   */
  data?: { id: string }[] | null;
}>;

/**
 * ปั๊มป้ายกลับทิศให้ใบเก่าทุกใบที่ใบใหม่ในรอบนี้ชี้ถึง
 *
 * เรียก "หลัง insert ใบใหม่สำเร็จ" เท่านั้น — flipped_by ต้องชี้ไปแถวที่มีอยู่จริง
 * ถ้าปั๊มก่อนแล้ว insert ล้ม จะได้ป้ายที่ชี้ไปใบที่ไม่เคยเกิด
 *
 * โหมดถอย (ยังไม่ได้รัน 009): update ตอบ 42703 → หยุดปั๊มทั้งรอบทันที ไม่โยน error
 * ไม่ทำให้ตัวสแกนล้ม — คำเตือนของ "รอบที่ตรวจพบ" ยังออกครบเพราะประกอบจาก field
 * ในหน่วยความจำ (signal.flip) ไม่ใช่จากคอลัมน์ (แบบแผนเดียวกับ push_sent ใน 006)
 * ⚠ แต่สิ่งที่ขาดมีสองอย่าง ไม่ใช่แค่ป้ายบนหน้าเว็บ: ไม่มีป้ายในตาราง = ใบเก็บตก
 * (รอบที่ถูกกันความถี่/ส่งล้ม) ประกอบคำเตือนคืนไม่ได้ด้วย (ดู flipNotesFromMarkedRows)
 * ใบแจ้งเตือนที่ถึงมือจริงของสัญญาณนั้นจะไม่มีบรรทัดเตือน — รัน 009 แล้วหายทั้งสองอาการ
 */
export async function markFlipTargets(
  rows: readonly { id: string; flip?: SignalFlipNote | null }[],
  update: FlipUpdater,
  nowIso: string
): Promise<FlipMarkResult> {
  const out: FlipMarkResult = { marked: 0, missingColumn: false, errors: [] };
  for (const row of rows) {
    const ids = row.flip?.target_ids ?? [];
    if (!ids.length) continue;
    try {
      const { error, data } = await update(ids, { flipped_at: nowIso, flipped_by: row.id });
      if (!error) {
        // นับจากแถวที่ DB ตอบว่าอัปเดตจริงเมื่อ updater ส่งกลับมา — id ที่ขอไป
        // อาจโดนรอบสแกนที่ซ้อนกันปั๊มตัดหน้า (guard .is('flipped_at', null) กันทับ)
        // แล้วไม่แมตช์ ตัวเลขใน log ต้องรายงานสิ่งที่เกิดจริง ไม่ใช่สิ่งที่ตั้งใจ
        out.marked += Array.isArray(data) ? data.length : ids.length;
      } else if (isMissingFlipColumn(error)) {
        out.missingColumn = true;
        return out; // คอลัมน์ไม่มี = ใบถัดไปก็ล้มเหมือนกัน ไม่ต้องยิงซ้ำให้เปลือง
      } else {
        out.errors.push(`ปั๊มป้ายกลับทิศไม่สำเร็จ (ใบใหม่ ${row.id}): ${error.message ?? JSON.stringify(error)}`);
      }
    } catch (e) {
      out.errors.push(`ปั๊มป้ายกลับทิศไม่สำเร็จ (ใบใหม่ ${row.id}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

// ──────────────────────── ประกอบโน้ตคืนจากป้าย (ใบเก็บตก) ────────────────────────

/**
 * แถว "ใบเก่าที่ถูกปั๊มป้ายแล้ว" จาก query ของ push-server
 * (select id, action, created_at, flipped_by from signals where flipped_by in (...))
 */
export interface FlippedOldRow {
  id: string;
  action: string;
  created_at?: string | null;
  flipped_by?: string | null;
}

/**
 * ประกอบ SignalFlipNote คืนจาก "ป้ายบนใบเก่า" (flipped_at/flipped_by — migration 009)
 *
 * ทำไมต้องมี: field `flip` อยู่ในหน่วยความจำของรอบสแกนเท่านั้น ถูกถอดก่อน insert เสมอ
 * สัญญาณที่รอบของมันถูกกันความถี่หรือ push ล้ม จะถูกส่งจริงรอบถัดไปผ่าน
 * loadPendingSignals ซึ่งอ่านกลับจากตาราง — ถ้าไม่ประกอบโน้ตคืน ใบแจ้งเตือน
 * ที่ถึงมือจริงของสัญญาณนั้นจะไม่มีบรรทัดเตือนกลับทิศ ทั้งที่การกลับทิศเกิดจริง
 * (บั๊กจริงที่เคยเกิด) โชคดีที่ป้ายถูกปั๊มตั้งแต่รอบ insert ไม่ได้รอรอบแจ้งเตือน
 * ข้อมูลที่ต้องใช้ (action + created_at ของใบเก่า) จึงอยู่ใน DB ครบแล้ว
 *
 * คืน map: id ใบใหม่ (ค่าใน flipped_by) → โน้ตที่ประกอบคืน
 *  · ใบใหม่ใบเดียวกลับทิศใบเก่าได้หลายใบ — prev_action/prev_created_at อ้าง
 *    "ใบล่าสุด" เสมอ (นโยบายเดียวกับ findFlipTargets) ส่วน target_ids เก็บครบทุกใบ
 *  · action ที่ไม่ใช่ BUY/SELL ไม่มีทิศให้กลับ — ข้ามแบบเดียวกับ flipReversalIndex
 *  · โหมดถอย (ยังไม่ได้รัน 009): ฝั่ง query เจอ 42703 ก่อนถึงฟังก์ชันนี้ —
 *    map ที่นี่ไม่มีวันถูกเรียกด้วยข้อมูลเดา ฟังก์ชันนี้แค่แปลงแถวจริงที่อ่านได้
 */
export function flipNotesFromMarkedRows(oldRows: readonly FlippedOldRow[]): Map<string, SignalFlipNote> {
  const byNew = new Map<string, { latestMs: number; note: SignalFlipNote }>();
  for (const r of oldRows) {
    if (!r.flipped_by) continue;
    const act: SignalAction | null = r.action === 'BUY' ? 'BUY' : r.action === 'SELL' ? 'SELL' : null;
    if (!act) continue;
    const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
    const cur = byNew.get(r.flipped_by);
    if (!cur) {
      byNew.set(r.flipped_by, {
        latestMs: t,
        note: { prev_action: act, prev_created_at: r.created_at ?? null, target_ids: [r.id] },
      });
      continue;
    }
    cur.note.target_ids = [...(cur.note.target_ids ?? []), r.id];
    // เวลาเทียบไม่ได้ (parse ไม่ออก) = ไม่มีหลักฐานว่าใหม่กว่า — ไม่แทนที่ ไม่เดา
    if (Number.isFinite(t) && (!Number.isFinite(cur.latestMs) || t > cur.latestMs)) {
      cur.latestMs = t;
      cur.note.prev_action = act;
      cur.note.prev_created_at = r.created_at ?? null;
    }
  }
  return new Map([...byNew].map(([id, v]) => [id, v.note]));
}

// ─────────────────────────────── ตัวช่วยฝั่งหน้าเว็บ ───────────────────────────────

/** ป้ายบนใบใหม่ที่เป็นตัวกลับทิศ — หน้าเว็บส่งเข้า SignalCard เป็น prop */
export interface FlipReversalNote {
  /** action ของใบเก่าที่โดนกลับทิศ (ของจริงจากแถวนั้น) */
  prevAction: SignalAction;
  /**
   * ใบเก่ายัง "เปิด" ตาม ledger ไหม (outcome เป็น null/'open')
   * false = ตัวเก็บผลปิดบัญชีใบเก่าไปแล้ว — ห้ามอ้างว่า "ยังเปิดอยู่" บนจอ
   */
  prevStillOpen: boolean;
}

/**
 * สร้าง map: id ของใบใหม่ที่เป็นตัวกลับทิศ → ข้อมูลใบเก่าที่มันกลับ
 *
 * ทำไมต้องมี: SignalCard เห็นสัญญาณทีละใบ มันบอกเองไม่ได้ว่าใบไหน "เป็นตัวกลับทิศ"
 * เพราะป้าย (flipped_by) อยู่บนใบเก่า ไม่ใช่ใบใหม่ — หน้าที่โหลดสัญญาณทั้งชุดจึงต้อง
 * ประกอบ map นี้ครั้งเดียวแล้วส่งค่าเข้าการ์ดเป็น prop
 *
 * ใบใหม่ใบเดียวกลับทิศใบเก่าได้หลายใบ (BUY ค้างสองใบโดน SELL ใบเดียว) —
 * เก็บเฉพาะใบเก่าล่าสุด ให้ตรงกับที่ข้อความแจ้งเตือนอ้าง
 * โหมดถอย: ยังไม่ได้รัน 009 = ไม่มีแถวไหนมี flipped_by = map ว่าง = ไม่ขึ้นป้าย ไม่พัง
 */
export function flipReversalIndex(signals: readonly Signal[]): Map<string, FlipReversalNote> {
  const latest = new Map<string, { createdAt: string; note: FlipReversalNote }>();
  for (const s of signals) {
    if (!s.flipped_by) continue;
    if (s.action !== 'BUY' && s.action !== 'SELL') continue; // ใบเก่าที่กลับทิศได้มีแค่สองทิศนี้
    const cur = latest.get(s.flipped_by);
    if (cur && cur.createdAt >= s.created_at) continue;
    latest.set(s.flipped_by, {
      createdAt: s.created_at,
      note: {
        prevAction: s.action,
        prevStillOpen: s.outcome == null || s.outcome === 'open',
      },
    });
  }
  return new Map([...latest].map(([id, v]) => [id, v.note]));
}
