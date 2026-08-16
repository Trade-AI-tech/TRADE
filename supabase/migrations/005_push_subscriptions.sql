-- ============================================
-- Push Subscriptions (idempotent, non-destructive)
--
-- เก็บ Web Push subscription ของเบราว์เซอร์/มือถือแต่ละเครื่องที่ผู้ใช้กดอนุญาตแจ้งเตือน
-- ตัวส่ง (Edge Function ฝั่งสแกนสัญญาณ) อ่านตารางนี้แล้วยิงแจ้งเตือนเข้าเครื่องตรง ๆ
-- ผ่านบริการ push ของระบบปฏิบัติการ (APNs/FCM) — ไม่พึ่ง Telegram
--
-- ⚠ ห้ามใส่ DROP TABLE ของตารางฝั่งเทรดลงในไฟล์นี้เด็ดขาด (กติกาเดิมของ repo)
-- ============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- endpoint เป็น URL เฉพาะเครื่อง+เบราว์เซอร์ ใช้เป็นตัวแยกเครื่อง (เครื่องเดียวสมัครซ้ำ = อัปเดตแถวเดิม)
  endpoint text UNIQUE NOT NULL,
  -- คู่กุญแจเข้ารหัส payload ของ subscription นั้น (มาตรฐาน RFC 8291)
  p256dh text NOT NULL,
  auth text NOT NULL,
  -- ไว้ดูว่าเครื่องไหนเป็นเครื่องไหนตอนไล่ปัญหา ("iPhone Safari" vs "Chrome เดสก์ท็อป")
  user_agent text,
  created_at timestamptz DEFAULT now(),
  -- ตัวส่งอัปเดตทุกครั้งที่ส่งสำเร็จ — subscription ที่ตายแล้ว (410 Gone) จะถูกลบทิ้ง
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ผู้ใช้จัดการ subscription ของตัวเองเท่านั้น — ตัวส่ง (service role) ข้าม RLS อยู่แล้ว
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
