-- ============================================
-- Schedule Signal Scan (idempotent, non-destructive)
--
-- ตั้งเวลาให้ฐานข้อมูลเป็นคนยิงตัวสแกนสัญญาณเอง ทุกต้นชั่วโมง
--   pg_cron (ตัวจับเวลาในฐานข้อมูล) → pg_net (ยิง HTTP ออกนอก) → Edge Function `scan-signals`
--
-- ไฟล์นี้คือชิ้นที่ทำให้ "มีสัญญาณใหม่อัตโนมัติทุกชั่วโมง + แจ้งเตือนเด้งเข้ามือถือ"
-- โดยไม่พึ่ง Vercel เลยแม้แต่นิดเดียว: ตัวจับเวลาอยู่ในฐานข้อมูล ตัวสแกนอยู่ใน Edge Function
-- และตัวแจ้งเตือนคือ Web Push ที่ยิงเข้าเครื่องผู้ใช้ตรง ๆ ผ่าน APNs/FCM (ไม่ใช่ Telegram)
--
-- ส่วน Vercel Cron รายวันของ /api/cron/scan-markets **ยังอยู่เหมือนเดิม** เป็นตัวสำรอง
-- สองตัววิ่งซ้อนกันได้โดยไม่พัง เพราะกันซ้ำ (dedupe) ไว้เหมือนกันทั้งสองฝั่ง:
-- ทั้งคู่เช็คสัญญาณ active เดิมของ user:symbol:action:timeframe ในตาราง signals
-- ก่อนบันทึกเสมอ (หน้าต่าง 20 ชม. สำหรับ 1D / 4 ชม. สำหรับ 1H) — ใครมาก่อนได้บันทึก
-- ใครมาทีหลังเจอของเดิมแล้วข้าม จึงไม่มีสัญญาณซ้ำและไม่มีแจ้งเตือนเด้งสองรอบ
--
-- ⚠ ต้องแก้ 1 บรรทัดก่อนรัน (มีเครื่องหมาย  <<< แก้บรรทัดนี้  กำกับไว้ในบล็อก Vault ข้างล่าง)
--   แค่บรรทัดเดียวเพราะ secret กับ anon key **ใช้ซ้ำ** ของเดิมจาก schedule_monitor.sql
--   ถ้ายังไม่แก้ ไฟล์จะ RAISE EXCEPTION หยุดทันที — ตั้งใจให้พังเสียงดัง
--   ดีกว่าตั้ง cron ยิงไปที่ URL ปลอมแล้วเงียบ ๆ โดยผู้ใช้เข้าใจว่าระบบสแกนทำงานอยู่
--
-- ปลอดภัยที่จะรันซ้ำ — extension เป็น IF NOT EXISTS, secret เป็น create/update ตามที่มีอยู่,
-- และ job เดิมถูก unschedule ก่อนตั้งใหม่ทุกครั้ง
--
-- ⚠ ไฟล์นี้ **ไม่ได้อยู่ใน supabase/migrations/ โดยตั้งใจ** (เหตุผลเดียวกับ schedule_monitor.sql)
--   มันต้องให้คนแก้ค่าก่อนรัน ถ้าเอาไปวางใน migrations/ แล้ว `supabase db push`
--   หรือ `db reset` ไปรันเจอตอนที่ยังเป็นค่าตัวอย่าง มันจะ raise exception
--   ทำให้ฐานข้อมูลใหม่สร้างไม่สำเร็จ และ migration ตัวอื่นที่ตามหลังก็ไม่ได้รันไปด้วย
--   รันไฟล์นี้ด้วยมือครั้งเดียวตอนติดตั้ง (วางลง SQL Editor) — ไม่ใช่ทุกครั้งที่ deploy
--
-- ต้องมีของพวกนี้พร้อมก่อน ไม่งั้น cron จะยิงแล้วโดนปฏิเสธ (ดูวิธีตรวจท้ายไฟล์):
--   1. รัน supabase/scripts/schedule_monitor.sql ให้ผ่านแล้ว — ไฟล์นี้หยิบ secret กับ anon key
--      จาก Vault ชุดเดียวกัน ถ้ายังไม่มีจะ raise exception บอกให้ไปรันไฟล์นั้นก่อน
--   2. Edge Function ชื่อ `scan-signals` deploy แล้ว (วางผ่าน Dashboard แบบเดียวกับ
--      monitor-positions เพราะโปรเจกต์นี้ไม่มี SUPABASE_ACCESS_TOKEN ให้ CLI)
--   3. env secret ที่ฟังก์ชันต้องใช้ตั้งครบแล้ว (Dashboard → Edge Functions → Secrets)
--      — MONITOR_SECRET ตัวเดิมใช้ได้เลยเพราะ secret ของ Edge Functions เป็นของทั้งโปรเจกต์
--      ไม่ได้ผูกกับฟังก์ชันใดฟังก์ชันหนึ่ง ส่วนกุญแจฝั่ง push (VAPID) ดูรายการที่หัวไฟล์
--      supabase/functions/scan-signals/index.ts — ถ้ายังไม่ได้ตั้ง สแกนจะทำงานแต่ push จะไม่ออก
--
-- ทำไมถึง "ใช้ซ้ำ" MONITOR_SECRET แทนการตั้งตัวใหม่: Edge Function ฝั่งสแกนเช็ค header
--   x-monitor-secret กับ env ตัวเดียวกัน การมี secret ชุดเดียวแปลว่ามีที่ให้เพี้ยนที่เดียว —
--   ถ้าแยกเป็นสองตัว วันไหน rotate ตัวหนึ่งแล้วลืมอีกตัว งานใดงานหนึ่งจะเงียบไปเฉย ๆ
--
-- หมายเหตุเรื่อง "Verify JWT": สวิตช์นั้นเปิดเป็นค่าเริ่มต้นและ **ไม่ต้องไปปิด**
--   ไฟล์นี้แนบ header Authorization: Bearer <anon key> ไปให้ผ่านด่าน gateway แล้ว
--   ส่วนสิทธิ์จริงของงานนี้มาจาก x-monitor-secret ล้วน ๆ (anon key เปิดเผยได้อยู่แล้ว)
--   การปิด Verify JWT จะทำให้ใครก็ยิงฟังก์ชันได้โดยไม่ต้องมี key ของโปรเจกต์เลย — อย่าปิด
-- ============================================

-- ============================================
-- 1) เปิด extension ที่ต้องใช้
-- ============================================
-- pg_cron = ตัวจับเวลาในฐานข้อมูล (schema `cron`)
-- pg_net  = ยิง HTTP ออกนอกฐานข้อมูลแบบไม่บล็อก (schema `net`)
-- ถ้ารัน schedule_monitor.sql ผ่านแล้ว สองบรรทัดนี้เป็น no-op — คงไว้เผื่อกรณีที่
-- extension ถูกปิดไปทีหลัง จะได้พังตรงนี้พร้อมข้อความชัด ๆ ไม่ใช่ไปพังเงียบตอน cron รัน
--
-- ⚠ ถ้ารันแล้วได้ "permission denied to create extension"
--   ให้ไปเปิดที่ Dashboard → Database → Extensions → เปิด "pg_cron" และ "pg_net"
--   แล้วค่อยกลับมารันไฟล์นี้ต่อจากข้อ 2 (สองบรรทัดนี้จะกลายเป็น no-op เพราะมีอยู่แล้ว)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================
-- 2) เก็บ URL ไว้ใน Supabase Vault (secret กับ anon key ใช้ของเดิม)
-- ============================================
-- ทำไมต้องใช้ Vault แทนการฝังค่าลงในคำสั่ง cron ตรง ๆ:
--   pg_cron เก็บคำสั่งไว้เป็น "ข้อความธรรมดา" ในคอลัมน์ cron.job.command
--   ใครก็ตามที่ select ตาราง cron.job ได้จะเห็นค่าเต็ม ๆ ทันที Vault เก็บแบบเข้ารหัส
--   แล้ว cron.job.command เก็บแค่ "ชื่อ" ของ secret (เหตุผลเต็มอยู่ใน schedule_monitor.sql)
--
-- ไฟล์นี้เพิ่ม secret ใหม่แค่ตัวเดียว: 'scan_signals_url'
-- ส่วน 'monitor_positions_secret' กับ 'monitor_positions_anon_key' แค่ "เช็คว่ามีจริง"
-- ไม่สร้างไม่เขียนทับ — ค่าพวกนั้นเป็นของ schedule_monitor.sql ที่เดียว จะได้ไม่มี
-- สองไฟล์แย่งกันเขียนค่าเดียวกันแล้วเพี้ยนกันเองตอนรัน rotate
--
-- บล็อกนี้เขียนเป็น DO เพราะ Vault ไม่มี "create secret if not exists":
--   vault.create_secret() จะ error ถ้าชื่อซ้ำ → ต้องเช็คก่อนแล้วเลือก create หรือ update เอง
do $$
declare
  -- vvv แก้ 1 บรรทัดนี้เท่านั้น vvv ------------------------------------------------

  -- เอา <PROJECT-REF> มาจาก Dashboard → Project Settings → General → Reference ID
  -- (หรือลอกจาก URL ของ Dashboard: https://supabase.com/dashboard/project/<PROJECT-REF>)
  v_url text := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/scan-signals';  -- <<< แก้บรรทัดนี้

  -- ^^^ แก้ 1 บรรทัดนี้เท่านั้น ^^^ ------------------------------------------------

  v_url_id    uuid;
  v_secret_id uuid;
  v_anon_id   uuid;
begin
  -- เช็คของที่ "ใช้ซ้ำ" ก่อนอย่างอื่น — ถ้าไม่มี ตั้งอะไรต่อไปก็ยิงไม่ผ่านอยู่ดี
  -- (เอาแค่ id ไม่ต้องถอดค่าออกมาโชว์)
  select id into v_secret_id from vault.decrypted_secrets where name = 'monitor_positions_secret';
  select id into v_anon_id   from vault.decrypted_secrets where name = 'monitor_positions_anon_key';

  if v_secret_id is null then
    raise exception 'ยังไม่มี secret ชื่อ monitor_positions_secret ใน Vault — ไปรัน supabase/scripts/schedule_monitor.sql ให้ผ่านก่อน แล้วค่อยกลับมารันไฟล์นี้ (ไฟล์นี้ใช้ secret ชุดเดียวกัน ไม่ตั้งเองซ้ำ)';
  end if;
  if v_anon_id is null then
    raise exception 'ยังไม่มี secret ชื่อ monitor_positions_anon_key ใน Vault — ไปรัน supabase/scripts/schedule_monitor.sql ให้ผ่านก่อน แล้วค่อยกลับมารันไฟล์นี้ (ไฟล์นี้ใช้ anon key ชุดเดียวกัน ไม่ตั้งเองซ้ำ)';
  end if;

  select id into v_url_id from vault.decrypted_secrets where name = 'scan_signals_url';

  -- ยังเป็นค่าตัวอย่าง + ใน Vault ก็ยังไม่มีของจริง = ตั้ง cron ไปก็ยิงผิดที่ 100%
  -- หยุดตรงนี้เลย ไม่ปล่อยให้ไปถึงขั้นตอนตั้งเวลา
  if v_url like '%YOUR-PROJECT-REF%' and v_url_id is null then
    raise exception 'ยังไม่ได้แก้ URL ของ Edge Function — แก้ตัวแปร v_url (บรรทัดที่มี <<< แก้บรรทัดนี้) แล้วรันใหม่';
  end if;

  -- กรณีรันไฟล์เวอร์ชันในโปรเจกต์ซ้ำ (ค่ายังเป็น placeholder แต่ Vault มีของจริงอยู่แล้ว)
  -- ต้อง "ข้าม" ไม่ใช่เขียนทับ ไม่งั้นรันซ้ำทีเดียว cron ที่เคยทำงานอยู่จะพังทันที
  if v_url like '%YOUR-PROJECT-REF%' then
    raise notice 'ข้ามการอัปเดต URL — ใช้ค่าเดิมที่มีอยู่แล้วใน Vault';
  elsif v_url_id is null then
    perform vault.create_secret(v_url, 'scan_signals_url',
      'ปลายทาง Edge Function scan-signals ที่ pg_cron ยิงทุกต้นชั่วโมง');
  else
    perform vault.update_secret(v_url_id, v_url, 'scan_signals_url',
      'ปลายทาง Edge Function scan-signals ที่ pg_cron ยิงทุกต้นชั่วโมง');
  end if;
end
$$;

-- ============================================
-- 3) ล้าง job เดิมก่อนตั้งใหม่
-- ============================================
-- pg_cron ตั้งแต่ 1.4 ทำ cron.schedule() แบบ upsert ตาม (jobname, username) อยู่แล้ว
-- ชื่อเดิมเป๊ะ ๆ จึงไม่ซ้อนกันเอง — แต่ที่ซ้อนได้จริงคือกรณีพวกนี้
--   • เคยลองตั้งเองด้วยชื่ออื่น (เช่น 'scan', 'test-scan') แล้วลืมลบ
--   • job เก่าที่ยิง URL เดิมยังค้างอยู่
-- ถ้ามี job ซ้อนกัน 2 ตัว ตัวสแกนจะรันพร้อมกัน 2 รอบในวินาทีเดียวกัน — dedupe ฝั่งฟังก์ชัน
-- อ่านตาราง signals "ก่อน" ที่อีกรอบจะทันเขียน จึงกันไม่อยู่ (race) มีโอกาสได้สัญญาณซ้ำ
-- และแจ้งเตือนเด้งซ้ำสองครั้งต่อเครื่อง ซึ่งเรียกคืนไม่ได้ จึงกวาดให้เกลี้ยงก่อนเสมอ
--
-- เงื่อนไขจงใจแคบ: จับเฉพาะชื่อ job ของเราเอง กับคำสั่งที่อ้างถึง secret ชื่อ
-- scan_signals_url เท่านั้น จะได้ไม่เผลอไปลบ 'monitor-positions-30m' หรือ cron ของงานอื่น
do $$
declare
  j record;
begin
  for j in
    select jobid, jobname
    from cron.job
    where jobname = 'scan-signals-hourly'
       or command like '%scan_signals_url%'
  loop
    -- unschedule ด้วย jobid (ไม่ใช่ชื่อ) เพราะเรียกจาก loop ที่หามาแล้วว่ามีจริง
    -- จึงไม่มีทางเจอ error "could not find valid entry for job" แบบเรียกด้วยชื่อลอย ๆ
    perform cron.unschedule(j.jobid);
    raise notice 'ลบ cron job เดิมทิ้งก่อน: % (jobid=%)', j.jobname, j.jobid;
  end loop;
end
$$;

-- ============================================
-- 4) ตั้งเวลา: ทุกต้นชั่วโมง
-- ============================================
-- '0 * * * *' = นาทีที่ 0 ของทุกชั่วโมง ทุกวัน
-- ทำไมชั่วโมงละครั้งก็พอ: ความละเอียดสูงสุดของตัวสแกนคือแท่งเทียนราย 1 ชั่วโมง
-- ยิงถี่กว่านั้นก็เจอแท่งเดิม ได้สัญญาณเดิม แล้วโดน dedupe ทิ้งอยู่ดี — เปลืองโควตา
-- ยิง Yahoo เปล่า ๆ ส่วน timezone ไม่มีผล เพราะ "ต้นชั่วโมง" ตรงกันทุก timezone
--
-- คำสั่งข้างในถูกเก็บเป็นข้อความใน cron.job.command — ตรงนี้จึงมีแค่ "ชื่อ" ของ secret
-- ส่วนค่าจริงถูกถอดจาก Vault ตอนถึงเวลารันแต่ละรอบ (ไม่ใช่ตอนตั้ง) แปลว่าถ้า rotate
-- MONITOR_SECRET ทีหลัง แค่รันบล็อก Vault ของ schedule_monitor.sql ซ้ำ ไฟล์นี้ได้ค่าใหม่
-- ตามไปเองอัตโนมัติ ไม่ต้องมาตั้ง cron ใหม่ — ข้อดีตรง ๆ ของการใช้ secret ชุดเดียวร่วมกัน
--
-- job นี้รันด้วยสิทธิ์ของ role ที่ตั้งมัน (ปกติคือ postgres เมื่อรันจาก SQL Editor)
-- role นั้นต้องอ่าน vault.decrypted_secrets ได้ ไม่งั้นทุกรอบจะล้มด้วย permission denied
-- (เห็นได้ที่ cron.job_run_details.return_message — ดูวิธีตรวจข้อ 5)
select cron.schedule(
  'scan-signals-hourly',
  '0 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'scan_signals_url'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- ด่านที่ 1: ประตูหน้าของ Supabase (สวิตช์ Verify JWT เปิดเป็นค่าเริ่มต้น)
      -- ถ้าไม่ส่ง header นี้ จะโดนปฏิเสธ 401 ตั้งแต่ก่อนโค้ดในฟังก์ชันได้ทำงาน
      -- และ cron.job_run_details จะยังขึ้น succeeded ทำให้ดูเหมือนทุกอย่างปกติ
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'monitor_positions_anon_key'
      ),
      -- ด่านที่ 2 (ตัวจริง): Edge Function เทียบ header ตัวนี้กับ env MONITOR_SECRET ของตัวเอง
      -- ตัวเดียวกับที่ monitor-positions ใช้ (env ของ Edge Functions เป็นของทั้งโปรเจกต์)
      -- anon key เปิดเผยได้ (อยู่ใน bundle ฝั่ง browser อยู่แล้ว) สิทธิ์จริงมาจากตัวนี้เท่านั้น
      'x-monitor-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'monitor_positions_secret'
      )
    ),
    body := '{}'::jsonb,
    -- ตัวสแกนต้องดึงแท่งเทียนจาก Yahoo ทีละ symbol (1D + 1H) ค่า default ของ pg_net
    -- (5 วินาที) สั้นเกินไปจนตัดกลางคัน ให้เวลา 60 วินาทีเท่ากับฝั่ง monitor
    -- ⚠ pg_net ทำงานแบบ fire-and-forget: บรรทัดนี้แค่ "เข้าคิว" แล้ว return ทันที
    --   cron จะขึ้นว่า succeeded เสมอแม้ Edge Function จะตอบ 401/404/500
    --   ต้องไปดูผลจริงที่ net._http_response (ดูข้อ 5)
    timeout_milliseconds := 60000
  );
  $cron$
);

-- ============================================
-- 5) ตรวจว่ามันทำงานจริงหรือเงียบ  (คัดลอกไปรันใน SQL Editor)
-- ============================================
--
-- 5.1 job ถูกตั้งไว้จริงไหม — ควรเห็น 'scan-signals-hourly' หนึ่งแถว active = true
--     (และ 'monitor-positions-30m' อีกแถวถ้าตั้งฝั่ง monitor ไว้แล้ว — สองแถวนี้คนละงานกัน)
--     ถ้ามีหลายแถวที่ยิงงานสแกนเหมือนกัน = ซ้อนกัน ให้รันไฟล์นี้ใหม่ (ข้อ 3 จะกวาดให้)
--     ถ้า active = false คือถูกปิดไว้ มันจะไม่ทำงานเลยแม้จะมีแถวอยู่
--
--   select jobid, jobname, schedule, active, username from cron.job;
--
--
-- 5.2 แต่ละรอบรันแล้วเป็นยังไง — ควรมีแถวใหม่เพิ่มทุกต้นชั่วโมง
--     status = 'succeeded' แปลว่า "คำสั่ง SQL รันผ่าน" คือ pg_net รับเข้าคิวแล้วเท่านั้น
--     ⚠ ไม่ได้แปลว่า Edge Function ทำงานสำเร็จ — ต้องไปดู 5.3 ต่อ
--     status = 'failed' → อ่าน return_message จะบอกสาเหตุ เช่น
--       "permission denied for view decrypted_secrets" = role ที่ตั้ง job อ่าน Vault ไม่ได้
--       "schema net does not exist"                    = pg_net ยังไม่ได้เปิด (ย้อนไปข้อ 1)
--     ไม่มีแถวเพิ่มเลยหลังผ่านนาทีที่ 0 ของชั่วโมงไปแล้ว = ตัวจับเวลาไม่ทำงาน
--       (pg_cron ไม่ได้เปิด หรือ job ถูก unschedule ไปแล้ว)
--
--   select jobid, status, return_message, start_time, end_time
--   from cron.job_run_details
--   order by start_time desc
--   limit 10;
--
--
-- 5.3 ปลายทางตอบว่าอะไร — อันนี้คือหลักฐานจริงว่าตัวสแกนทำงาน
--     status_code = 200        → Edge Function รันจบ ดู content ว่าสแกนกี่ตัว ได้สัญญาณกี่ตัว
--     status_code = 401        → header x-monitor-secret ไม่ตรงกับ env MONITOR_SECRET
--                                หรือ anon key ใน Vault ผิด/หมดอายุ
--     status_code = 404        → URL ผิด / ชื่อฟังก์ชันไม่ตรง / scan-signals ยังไม่ได้ deploy
--     status_code = 5xx        → ฟังก์ชัน deploy แล้วแต่พังข้างใน ดู log ที่
--                                Dashboard → Edge Functions → scan-signals → Logs
--     error_msg มีข้อความ      → ยิงไม่ถึงปลายทางเลย (timeout / DNS / เชื่อมต่อไม่ได้)
--     ไม่มีแถวเลย              → pg_net ไม่ได้ส่งอะไรออกไป หรือแถวหมดอายุไปแล้ว
--                                (pg_net เก็บ response ไว้ไม่กี่ชั่วโมงแล้วลบทิ้งเอง
--                                 ถ้าเพิ่งตั้ง cron ใหม่ ๆ ให้รอถึงนาทีที่ 0 ของชั่วโมงก่อน
--                                 หรือใช้วิธียิงทดสอบทันทีในข้อ 5.5)
--
--   select id, status_code, error_msg, created, left(content, 500) as content_preview
--   from net._http_response
--   order by created desc
--   limit 5;
--
--
-- 5.4 แจ้งเตือนเด้งเข้ามือถือจริงไหม — ดูที่ตาราง push_subscriptions
--     ตัวส่ง push อัปเดต last_used_at ทุกครั้งที่ "ส่งถึงบริการ push สำเร็จ" ดังนั้น
--       last_used_at ขยับหลังรอบที่มีสัญญาณใหม่ → push ออกจริง
--       last_used_at เป็น null              → เครื่องนั้นยังไม่เคยรับสำเร็จเลย
--                                             (null คือ "ยังไม่เคยวัด" — ไม่ใช่ค่า 0 ปลอม)
--       ไม่มีแถวเลย                          → ยังไม่มีเครื่องไหนกดเปิดแจ้งเตือนในแอป
--                                             ต้องเข้าเว็บจากมือถือแล้วกดอนุญาตก่อน
--     ⚠ รอบที่ "ไม่มีสัญญาณใหม่" จะไม่ส่ง push จึงไม่มีอะไรขยับ — อันนั้นปกติ ไม่ใช่พัง
--       (แยกให้ออกจากกรณีพังด้วย 5.3: ถ้า 200 และ content บอก signalsGenerated = 0 คือปกติ)
--     subscription ที่ตายแล้ว (บริการ push ตอบ 410 Gone เช่นผู้ใช้ถอนสิทธิ์) จะถูกลบแถวทิ้ง
--     ดังนั้นแถวที่หายไปเอง = เครื่องนั้นเลิกรับแจ้งเตือนแล้ว ไม่ใช่ข้อมูลพัง
--
--   select user_id, left(endpoint, 60) as endpoint_preview, user_agent, created_at, last_used_at
--   from push_subscriptions
--   order by last_used_at desc nulls last;
--
--
-- 5.5 อยากทดสอบเดี๋ยวนี้ ไม่ต้องรอถึงต้นชั่วโมง — ยิงเองหนึ่งครั้งด้วยคำสั่งชุดเดียวกัน
--     ⚠ นี่คือการสแกนจริง ถ้าเจอสัญญาณใหม่มันจะบันทึกลงตาราง signals และแจ้งเตือนจริง
--     รันแล้วรอสัก 10-15 วินาทีค่อยรัน query ข้อ 5.3 ดูผล (pg_net ส่งแบบไม่รอผลตอบกลับ)
--
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'scan_signals_url'),
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_positions_anon_key'),
--       'x-monitor-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_positions_secret')
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 60000
--   );
--
--
-- 5.6 อยากหยุดตัวสแกนชั่วคราว (เช่นกำลังแก้ Edge Function อยู่)
--
--   select cron.unschedule('scan-signals-hourly');   -- ลบทิ้ง กลับมาเปิดใหม่ด้วยการรันไฟล์นี้ซ้ำ
--   update cron.job set active = false where jobname = 'scan-signals-hourly';  -- แค่พักไว้
