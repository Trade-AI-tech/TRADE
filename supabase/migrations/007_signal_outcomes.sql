-- ============================================
-- 007 — บันทึกผลลัพธ์จริงของทุกสัญญาณ (idempotent, non-destructive)
--
-- วางทั้งไฟล์ลง Supabase → SQL Editor → Run ครั้งเดียวจบ · รันซ้ำกี่รอบก็ปลอดภัย
-- ⚠ ห้ามใส่ DROP TABLE ของตารางฝั่งเทรดลงในไฟล์นี้เด็ดขาด (กติกาเดิมของ repo)
--
-- ── ช่องโหว่ที่ไฟล์นี้มาปิด ────────────────────────────────────────────────────────
-- ตาราง signals เดิมมีแค่ status (active/triggered/expired/cancelled) ซึ่งบอกได้แค่ว่า
-- "สัญญาณยังใช้ได้อยู่ไหม" แต่ **ไม่มีคอลัมน์ไหนเลยที่บอกว่ามันถูกหรือผิด**
-- ผลคือต่อให้ระบบยิงสัญญาณครบร้อยตัว เจ้าของก็ยังตอบไม่ได้ว่าชนะกี่ตัว ได้กี่ R
-- และไม่มีทางรู้ว่าตัวเลขจากงานวิจัย (ที่วัดบนอดีต) ตรงกับของจริงหรือเปล่า
--
-- ตั้งแต่มีคอลัมน์ชุดนี้ ตัวเก็บผล (scripts/resolve-signals.mjs) จะเดินราคาไปข้างหน้า
-- ทีละแท่งหลังเวลาที่สัญญาณเกิด แล้วปิดบัญชีให้เองว่าไปแตะ TP ก่อน หรือ SL ก่อน
-- หรือหมดเวลาไปเฉย ๆ — เก็บเป็น R ทั้งก่อนและหลังหักต้นทุน
--
-- ── กติกาที่ฝังไว้ในตัวเลข (สำคัญมาก อย่าเปลี่ยนโดยไม่อ่าน) ──────────────────────
--  · แท่งเดียวแตะทั้ง SL และ TP → นับ SL เสมอ เพราะข้อมูลรายแท่งไม่บอกว่าอะไรมาก่อน
--    การเดาเข้าข้างตัวเองตรงนี้คือวิธีที่ backtest ทั่วโลกใช้โกหกเจ้าของมันเอง
--  · raw_r หารด้วย "ระยะเสี่ยงที่ตั้งใจ" (entry − stop ตอนออกสัญญาณ) ไม่ใช่ระยะจริง
--    หลังราคากระโดด — ตรงกับ riskModel:'planned' ใน src/lib/backtest.ts
--  · cost_r = (ต้นทุน bps/10000 × ราคาเข้า) ÷ ระยะเสี่ยง — ไม้ที่ SL ชิดโดนต้นทุนหนักกว่ามาก
--    ตารางต้นทุนต้องตรงกับ COST_BPS ใน scripts/research/lab.mjs เสมอ
--  · realized_r = raw_r − cost_r ← ตัวเลขนี้เท่านั้นที่ใช้ตัดสินว่าระบบทำเงินได้ไหม
-- ============================================

-- 0. ตารางที่จะแก้ต้องมีอยู่จริงก่อน
do $$
begin
  if to_regclass('public.signals') is null then
    raise exception 'ยังไม่มีตาราง signals — ให้รัน supabase/migrations/002_trading_schema.sql ก่อนแล้วค่อยรันไฟล์นี้';
  end if;
end $$;

-- ============================================
-- 1. คอลัมน์ผลลัพธ์
-- ============================================
alter table public.signals add column if not exists outcome      text;
alter table public.signals add column if not exists exit_price   numeric;
alter table public.signals add column if not exists resolved_at  timestamptz;
alter table public.signals add column if not exists raw_r        numeric;
alter table public.signals add column if not exists cost_r       numeric;
alter table public.signals add column if not exists realized_r   numeric;
alter table public.signals add column if not exists mfe_r        numeric;
alter table public.signals add column if not exists mae_r        numeric;
alter table public.signals add column if not exists bars_held    integer;
alter table public.signals add column if not exists resolve_note text;

-- ค่าเริ่มต้นตั้งหลังเพิ่มคอลัมน์ เพื่อให้แถวเก่าที่มีอยู่แล้วได้ค่าด้วย
update public.signals set outcome = 'open' where outcome is null;
alter table public.signals alter column outcome set default 'open';

-- CHECK ต้องเพิ่มแบบไม่ล้มถ้ามีอยู่แล้ว (Postgres ไม่มี ADD CONSTRAINT IF NOT EXISTS)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.signals'::regclass and conname = 'signals_outcome_check'
  ) then
    alter table public.signals
      add constraint signals_outcome_check
      check (outcome in ('open', 'tp', 'sl', 'timeout', 'unresolvable'));
  end if;
end $$;

-- ============================================
-- 2. ดัชนี — ตัวเก็บผลถามคำถามเดียวซ้ำ ๆ: "แถวไหนยังไม่ปิดบัญชี"
-- ============================================
create index if not exists idx_signals_outcome_open
  on public.signals (created_at)
  where outcome = 'open';

create index if not exists idx_signals_resolved
  on public.signals (market, resolved_at desc)
  where outcome is not null and outcome <> 'open';

comment on column public.signals.realized_r is
  'R ต่อไม้หลังหักต้นทุนแล้ว = raw_r − cost_r · ตัวเลขเดียวที่ใช้ตัดสินว่าระบบทำเงินได้จริงไหม';
comment on column public.signals.outcome is
  'open=ยังไม่ปิด · tp=แตะเป้า · sl=โดนตัดขาดทุน · timeout=หมดเวลาก่อน · unresolvable=ข้อมูลราคาไม่พอ';
