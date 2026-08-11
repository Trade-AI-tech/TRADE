-- ============================================
-- Position Monitoring Schema (idempotent, non-destructive)
--
-- เพิ่มฟิลด์ที่ตัวเฝ้าราคา (cron) ต้องใช้บันทึกผลการตรวจ SL/TP ของออเดอร์ที่ยังเปิดอยู่
-- ⚠ ระบบนี้เป็นสมุดบันทึกการเทรด ไม่ได้ต่อโบรกเกอร์ — "ปิดออเดอร์อัตโนมัติ" คือการบันทึกว่า
--   ถ้ามีคำสั่ง SL/TP จริงจะโดนตัดที่ราคาไหน ไม่มีการส่งคำสั่งซื้อขายออกไปที่ไหนทั้งสิ้น
--
-- ปลอดภัยที่จะรันซ้ำ — ทุกอย่างเป็น ALTER ... IF NOT EXISTS / CREATE ... IF NOT EXISTS
-- ⚠ ห้ามใส่ DROP TABLE ของตารางฝั่งเทรด (watchlist / signals / trades /
--   telegram_alerts / market_prices / news) ลงในไฟล์นี้เด็ดขาด
--   `supabase db push` หรือ `db reset` จะรันไฟล์นี้ซ้ำ แล้วลบข้อมูลผู้ใช้ทิ้งทั้งหมด
--   ถ้าต้องเปลี่ยนโครงสร้างตาราง ให้เขียน migration ใหม่เป็น ALTER TABLE แทน
-- ============================================

-- ============================================
-- Trades: ฟิลด์สำหรับตัวเฝ้าราคา
-- ============================================
ALTER TABLE trades
  -- เหตุผลที่ปิด — แยกให้ออกว่าผู้ใช้กดปิดเอง หรือตัวเฝ้าราคาเห็นว่าราคาแตะ SL/TP
  -- ออเดอร์เก่าที่ปิดไปก่อนมี migration นี้จะเป็น NULL (ไม่รู้เหตุผลจริง ห้ามเดาว่า 'manual')
  ADD COLUMN IF NOT EXISTS close_reason text,
  -- ราคาล่าสุดที่ตัวเฝ้าราคาเห็น ใช้กับออเดอร์ที่ยังเปิดอยู่เพื่อคำนวณ unrealized P/L
  -- NULL = ยังไม่เคยเฝ้าสำเร็จ (ดึงราคาไม่ได้) ต่างจาก 0 ซึ่งจะทำให้ P/L เพี้ยนไปทั้งพอร์ต
  ADD COLUMN IF NOT EXISTS current_price numeric,
  -- เวลาที่เฝ้าล่าสุด ไว้ให้ UI บอกได้ว่าตัวเลขที่เห็นสดแค่ไหน และไว้ไล่ดูว่า cron ตายรึเปล่า
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

-- Postgres ไม่มี ADD CONSTRAINT IF NOT EXISTS — ต้อง DROP ก่อนเสมอ ไฟล์ถึงจะรันซ้ำได้
-- (ตอน ADD จะไล่ตรวจแถวเดิมด้วย แต่แถวเดิม close_reason เป็น NULL ซึ่ง CHECK ปล่อยผ่านอยู่แล้ว)
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_close_reason_check;
ALTER TABLE trades
  ADD CONSTRAINT trades_close_reason_check
  CHECK (close_reason IS NULL OR close_reason IN ('manual', 'stop_loss', 'take_profit'));

-- ตัวเฝ้าราคาวิ่งทุกรอบเพื่อดึง "ออเดอร์ที่ยังเปิดอยู่" เท่านั้น
-- partial index เก็บเฉพาะแถว status='open' ซึ่งมักเป็นส่วนน้อยของตาราง — เล็กและสแกนไว
-- กว่า idx_trades_status ที่ครอบทุกสถานะ
CREATE INDEX IF NOT EXISTS idx_trades_open ON trades(user_id) WHERE status = 'open';

-- ============================================
-- RPC: Portfolio summary (เพิ่ม unrealized / realized)
-- ============================================
-- return type เปลี่ยน (เพิ่ม 2 คอลัมน์) — CREATE OR REPLACE ทำไม่ได้ ต้อง DROP ก่อน
-- ฟังก์ชันไม่เก็บข้อมูล ลบทิ้งแล้วสร้างใหม่จึงปลอดภัย ต่างจากตาราง
DROP FUNCTION IF EXISTS get_portfolio_stats CASCADE;

-- 7 คอลัมน์แรกต้องคงชื่อและลำดับเดิมไว้ทั้งหมด — useData.ts อ่านผลลัพธ์ด้วยชื่อฟิลด์
-- และ total_pnl ยังหมายถึง "ที่ปิดแล้ว" เหมือนเดิม ไม่งั้นตัวเลขบนหน้า dashboard จะกระโดด
CREATE OR REPLACE FUNCTION get_portfolio_stats(p_user_id uuid)
RETURNS TABLE (
  total_trades bigint,
  open_trades bigint,
  closed_trades bigint,
  total_pnl numeric,
  win_rate numeric,
  active_signals bigint,
  signals_today bigint,
  unrealized_pnl numeric,
  realized_pnl numeric
) AS $$
BEGIN
  -- ⚠ ด่านสำคัญ: ฟังก์ชันนี้เป็น SECURITY DEFINER แปลว่ามันรันด้วยสิทธิ์ของ "เจ้าของฟังก์ชัน"
  --   ไม่ใช่สิทธิ์ของคนเรียก → RLS บน trades/signals ถูกข้ามไปทั้งหมด ไม่มีผลอะไรกับ query ข้างล่างเลย
  --   ตัวกรองเดียวที่เหลือคือ `user_id = p_user_id` ซึ่ง p_user_id มาจากคนเรียกล้วน ๆ
  --   ถ้าไม่เทียบกับ auth.uid() ผู้ใช้ที่ล็อกอินแล้วเปิด DevTools ยิง
  --     supabase.rpc('get_portfolio_stats', { p_user_id: '<uuid ของคนอื่น>' })
  --   จะได้สถิติพอร์ตของคนอื่นครบทั้งชุด ทั้งที่ RLS เปิดอยู่ (RLS ไม่ได้ช่วยตรงนี้)
  --   จึงต้องบังคับด้วยมือว่า "ขอดูได้เฉพาะของตัวเองเท่านั้น"
  --   ใช้ IS DISTINCT FROM เพื่อให้กรณี auth.uid() เป็น NULL (ไม่มี JWT) ก็ถูกปฏิเสธด้วย
  --   คงพารามิเตอร์ p_user_id ไว้เพื่อไม่ให้ฝั่ง client (useData.ts) พัง — แค่บังคับว่าต้องส่งของตัวเองมา
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: ดูสถิติของผู้ใช้อื่นไม่ได้';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM trades WHERE user_id = p_user_id),
    (SELECT count(*) FROM trades WHERE user_id = p_user_id AND status = 'open'),
    (SELECT count(*) FROM trades WHERE user_id = p_user_id AND status = 'closed'),
    COALESCE((SELECT sum(pnl) FROM trades WHERE user_id = p_user_id AND status = 'closed'), 0),
    COALESCE((
      SELECT (count(*) FILTER (WHERE pnl > 0))::numeric * 100 / NULLIF(count(*), 0)
      FROM trades WHERE user_id = p_user_id AND status = 'closed'
    ), 0),
    (SELECT count(*) FROM signals WHERE user_id = p_user_id AND status = 'active'),
    (SELECT count(*) FROM signals WHERE user_id = p_user_id AND created_at >= current_date),
    -- ยังไม่ปิด = กำไร/ขาดทุนบนกระดาษ คอลัมน์ pnl ของออเดอร์เปิดถูกตัวเฝ้าราคาอัปเดตเป็น unrealized
    -- ไม่มีออเดอร์เปิดเลยให้เป็น 0 (ผลรวมของเซ็ตว่าง ไม่ใช่การเดาค่าที่ไม่รู้)
    COALESCE((SELECT sum(pnl) FROM trades WHERE user_id = p_user_id AND status = 'open'), 0),
    -- ตัวเดียวกับ total_pnl — แยกชื่อไว้ให้ UI ใหม่เรียกได้ตรงความหมาย โดยไม่ต้องแตะของเดิม
    COALESCE((SELECT sum(pnl) FROM trades WHERE user_id = p_user_id AND status = 'closed'), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
-- SET search_path เป็นมาตรฐานบังคับของฟังก์ชัน SECURITY DEFINER — กัน search_path hijack
-- ถ้าไม่ตรึงไว้ คนเรียกตั้ง search_path ของ session ตัวเองให้ชี้ไปสคีมาที่ตัวเองสร้าง
-- แล้ววาง table/function ชื่อ trades, signals, auth.uid ปลอมไว้ได้ ฟังก์ชันจะไปอ่านของปลอม
-- ทั้งที่รันด้วยสิทธิ์เจ้าของฟังก์ชัน (= ยกสิทธิ์ให้ผู้โจมตี)
-- วาง pg_temp ไว้ท้ายสุดเสมอ ไม่งั้น temp table ของคนเรียกจะบังตารางจริงใน public
SET search_path = public, pg_temp;

-- ============================================
-- สิทธิ์เรียกฟังก์ชัน
-- ============================================
-- ค่า default ของ Postgres คือ PUBLIC ได้ EXECUTE ทุกฟังก์ชันใหม่ — แปลว่า role `anon`
-- (ผู้ใช้ที่ยังไม่ล็อกอิน) ก็ยิง RPC ตัวนี้ได้ ต้องถอนคืนก่อนแล้วค่อยให้เฉพาะ `authenticated`
-- REVOKE/GRANT เป็นการ "ตั้งค่าให้เป็นสถานะนี้" ไม่ใช่การเพิ่มของซ้ำ จึงรันกี่รอบก็ผลเท่าเดิม
-- (ต้องอยู่หลัง CREATE FUNCTION เสมอ เพราะ DROP ด้านบนล้างสิทธิ์เดิมทิ้งไปพร้อมฟังก์ชัน)
REVOKE ALL ON FUNCTION get_portfolio_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_portfolio_stats(uuid) TO authenticated;
