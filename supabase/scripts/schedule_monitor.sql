-- ============================================
-- Schedule Position Monitor (idempotent, non-destructive)
--
-- ตั้งเวลาให้ฐานข้อมูลเป็นคนยิงตัวเฝ้าราคาเอง ทุก 30 นาที
--   pg_cron (ตัวจับเวลาในฐานข้อมูล) → pg_net (ยิง HTTP ออกนอก) → Edge Function `monitor-positions`
--
-- ทำไมต้องย้ายมาไว้ในฐานข้อมูล: บัญชี Vercel ของผู้ใช้ถูก pause เพราะเกินโควตาแผน Hobby
-- ทุก endpoint ตอบ HTTP 402 รวมถึง /api/cron/monitor-positions ที่เคยเป็นตัวเฝ้าราคา
-- ส่วน Supabase เป็นแผน Pro ที่จ่ายอยู่แล้ว ซึ่งมี pg_cron + pg_net + Edge Functions ให้ครบ
-- ตัวจับเวลาจึงย้ายมาอยู่ที่นี่ ไม่ต้องพึ่ง Vercel และไม่ต้องพึ่งโควตา GitHub Actions
--
-- ⚠ ระบบนี้เป็นสมุดบันทึกการเทรด ไม่ได้ต่อโบรกเกอร์ — cron ตัวนี้แค่ "ไปกระตุ้นให้บันทึกผล"
--   ว่าถ้ามีคำสั่ง SL/TP จริงจะโดนตัดที่ราคาไหน ไม่มีการส่งคำสั่งซื้อขายออกไปที่ไหนทั้งสิ้น
--
-- ⚠ ต้องแก้ 3 บรรทัดก่อนรัน (มีเครื่องหมาย  <<< แก้บรรทัดนี้  กำกับไว้ในบล็อก Vault ข้างล่าง)
--   ถ้ายังไม่แก้ ไฟล์จะ RAISE EXCEPTION หยุดทันที — ตั้งใจให้พังเสียงดัง
--   ดีกว่าตั้ง cron ยิงไปที่ URL ปลอมแล้วเงียบ ๆ โดยผู้ใช้เข้าใจว่าระบบเฝ้าราคาทำงานอยู่
--
-- ปลอดภัยที่จะรันซ้ำ — extension เป็น IF NOT EXISTS, secret เป็น create/update ตามที่มีอยู่,
-- และ job เดิมถูก unschedule ก่อนตั้งใหม่ทุกครั้ง
--
-- ⚠ ไฟล์นี้ **ไม่ได้อยู่ใน supabase/migrations/ โดยตั้งใจ**
--   มันต้องให้คนแก้ค่า 3 บรรทัดก่อนรัน ถ้าเอาไปวางใน migrations/ แล้ว `supabase db push`
--   หรือ `db reset` ไปรันเจอตอนที่ยังเป็นค่าตัวอย่าง มันจะ raise exception
--   ทำให้ฐานข้อมูลใหม่สร้างไม่สำเร็จ และ migration ตัวอื่นที่ตามหลังก็ไม่ได้รันไปด้วย
--   รันไฟล์นี้ด้วยมือครั้งเดียวตอนติดตั้ง (วางลง SQL Editor) — ไม่ใช่ทุกครั้งที่ deploy
--
-- ต้องมีของพวกนี้พร้อมก่อน ไม่งั้น cron จะยิงแล้วโดนปฏิเสธ (ดูวิธีตรวจท้ายไฟล์):
--   1. Edge Function ชื่อ `monitor-positions` deploy แล้ว
--   2. ตั้ง secret ชื่อ MONITOR_SECRET ให้ Edge Function (Dashboard → Edge Functions → Secrets)
--
-- หมายเหตุเรื่อง "Verify JWT": สวิตช์นั้นเปิดเป็นค่าเริ่มต้นและ **ไม่ต้องไปปิด**
--   ไฟล์นี้แนบ header Authorization: Bearer <anon key> ไปให้ผ่านด่าน gateway แล้ว
--   ส่วนสิทธิ์จริงของงานนี้มาจาก x-monitor-secret ล้วน ๆ (anon key เปิดเผยได้อยู่แล้ว)
--   การปิด Verify JWT จะทำให้ใครก็ยิงฟังก์ชันได้โดยไม่ต้องมี key ของโปรเจกต์เลย — อย่าปิด
--      ให้ตรงกับค่าที่เก็บใน Vault ข้างล่าง — ค่าคนละที่กัน ต้องใส่ให้ตรงกันเอง
-- ============================================

-- ============================================
-- 1) เปิด extension ที่ต้องใช้
-- ============================================
-- pg_cron = ตัวจับเวลาในฐานข้อมูล (schema `cron`)
-- pg_net  = ยิง HTTP ออกนอกฐานข้อมูลแบบไม่บล็อก (schema `net`)
--
-- ⚠ ถ้ารันบรรทัดพวกนี้แล้วได้ "permission denied to create extension"
--   แปลว่า role ที่ใช้อยู่ไม่มีสิทธิ์สร้าง extension ให้ไปเปิดที่หน้าเว็บแทน:
--     Dashboard → Database → Extensions → ค้นหา "pg_cron" กด toggle เปิด
--                                       → ค้นหา "pg_net"  กด toggle เปิด
--   แล้วค่อยกลับมารันไฟล์นี้ต่อจากข้อ 2 (สองบรรทัดนี้จะกลายเป็น no-op เพราะมีอยู่แล้ว)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================
-- 2) เก็บ URL + secret ไว้ใน Supabase Vault
-- ============================================
-- ทำไมต้องใช้ Vault แทนการฝังค่าลงในคำสั่ง cron ตรง ๆ:
--   pg_cron เก็บคำสั่งไว้เป็น "ข้อความธรรมดา" ในคอลัมน์ cron.job.command
--   ใครก็ตามที่ select ตาราง cron.job ได้ (หรือเปิดหน้า Database → Cron Jobs / ดู backup / ดู
--   log ที่ dump ตารางนี้) จะเห็น MONITOR_SECRET เต็ม ๆ ทันที
--   พอ secret รั่ว ใครก็ยิง Edge Function ให้ไล่ปิดออเดอร์ของผู้ใช้ทุกคนได้ — ย้อนกลับไม่ได้
--   Vault เก็บค่าแบบเข้ารหัส (authenticated encryption) แล้วให้ถอดผ่าน view
--   vault.decrypted_secrets ซึ่งจำกัดสิทธิ์ไว้ ส่วน cron.job.command เก็บแค่ "ชื่อ" ของ secret
--
-- บล็อกนี้เขียนเป็น DO เพราะ Vault ไม่มี "create secret if not exists":
--   vault.create_secret() จะ error ถ้าชื่อซ้ำ → ต้องเช็คก่อนแล้วเลือก create หรือ update เอง
do $$
declare
  -- vvv แก้ 3 บรรทัดนี้เท่านั้น vvv ------------------------------------------------

  -- เอา <PROJECT-REF> มาจาก Dashboard → Project Settings → General → Reference ID
  -- (หรือลอกจาก URL ของ Dashboard: https://supabase.com/dashboard/project/<PROJECT-REF>)
  v_url text := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/monitor-positions';  -- <<< แก้บรรทัดนี้

  -- ค่าเดียวกับ MONITOR_SECRET ที่ตั้งไว้ใน Edge Functions → Secrets (สุ่มยาว ๆ อย่าใช้คำง่าย)
  v_secret text := 'PASTE-MONITOR-SECRET-HERE';                                          -- <<< แก้บรรทัดนี้

  -- anon key ของโปรเจกต์ (Dashboard → Project Settings → API → Project API keys → anon public)
  -- ต้องมีเพราะสวิตช์ "Verify JWT" ของ Edge Function เปิดเป็นค่าเริ่มต้น
  -- ประตูหน้าของ Supabase จะเช็ค header authorization ว่าเป็น JWT ของโปรเจกต์ไหม
  -- **ก่อน** โค้ดในฟังก์ชันได้ทำงาน ถ้าไม่ส่งไป ทุกรอบจะได้ 401 ตั้งแต่ประตู
  -- โดยที่ cron.job_run_details ยังขึ้น succeeded (มันวัดแค่ว่า "ยิงออกไปแล้ว")
  -- anon key ไม่ใช่ตัวยืนยันสิทธิ์ของงานนี้ — ตัวจริงคือ x-monitor-secret ข้างล่าง
  v_anon_key text := 'PASTE-ANON-KEY-HERE';                                              -- <<< แก้บรรทัดนี้

  -- ^^^ แก้ 3 บรรทัดนี้เท่านั้น ^^^ ------------------------------------------------

  v_url_id    uuid;
  v_secret_id uuid;
  v_anon_id   uuid;
begin
  -- อ่านว่าเคยเก็บไว้แล้วหรือยัง (เอาแค่ id ไม่ต้องถอดค่าออกมาโชว์)
  select id into v_url_id    from vault.decrypted_secrets where name = 'monitor_positions_url';
  select id into v_secret_id from vault.decrypted_secrets where name = 'monitor_positions_secret';
  select id into v_anon_id   from vault.decrypted_secrets where name = 'monitor_positions_anon_key';

  -- ยังเป็นค่าตัวอย่าง + ใน Vault ก็ยังไม่มีของจริง = ตั้ง cron ไปก็ยิงผิดที่ 100%
  -- หยุดตรงนี้เลย ไม่ปล่อยให้ไปถึงขั้นตอนตั้งเวลา
  if v_url like '%YOUR-PROJECT-REF%' and v_url_id is null then
    raise exception 'ยังไม่ได้แก้ URL ของ Edge Function — แก้ตัวแปร v_url (บรรทัดที่มี <<< แก้บรรทัดนี้) แล้วรันใหม่';
  end if;
  if v_secret like 'PASTE-MONITOR-SECRET%' and v_secret_id is null then
    raise exception 'ยังไม่ได้แก้ MONITOR_SECRET — แก้ตัวแปร v_secret (บรรทัดที่มี <<< แก้บรรทัดนี้) แล้วรันใหม่';
  end if;
  if v_anon_key like 'PASTE-ANON-KEY%' and v_anon_id is null then
    raise exception 'ยังไม่ได้แก้ anon key — แก้ตัวแปร v_anon_key (บรรทัดที่มี <<< แก้บรรทัดนี้) แล้วรันใหม่ (ต้องมีเพราะ Verify JWT เปิดเป็นค่าเริ่มต้น)';
  end if;

  -- กรณีรันไฟล์เวอร์ชันในโปรเจกต์ซ้ำ (ค่ายังเป็น placeholder แต่ Vault มีของจริงอยู่แล้ว)
  -- ต้อง "ข้าม" ไม่ใช่เขียนทับ ไม่งั้นรันซ้ำทีเดียว cron ที่เคยทำงานอยู่จะพังทันที
  if v_url like '%YOUR-PROJECT-REF%' then
    raise notice 'ข้ามการอัปเดต URL — ใช้ค่าเดิมที่มีอยู่แล้วใน Vault';
  elsif v_url_id is null then
    perform vault.create_secret(v_url, 'monitor_positions_url',
      'ปลายทาง Edge Function monitor-positions ที่ pg_cron ยิงทุก 30 นาที');
  else
    perform vault.update_secret(v_url_id, v_url, 'monitor_positions_url',
      'ปลายทาง Edge Function monitor-positions ที่ pg_cron ยิงทุก 30 นาที');
  end if;

  if v_secret like 'PASTE-MONITOR-SECRET%' then
    raise notice 'ข้ามการอัปเดต secret — ใช้ค่าเดิมที่มีอยู่แล้วใน Vault';
  elsif v_secret_id is null then
    perform vault.create_secret(v_secret, 'monitor_positions_secret',
      'ค่าเดียวกับ env MONITOR_SECRET ของ Edge Function ส่งไปใน header x-monitor-secret');
  else
    perform vault.update_secret(v_secret_id, v_secret, 'monitor_positions_secret',
      'ค่าเดียวกับ env MONITOR_SECRET ของ Edge Function ส่งไปใน header x-monitor-secret');
  end if;

  if v_anon_key like 'PASTE-ANON-KEY%' then
    raise notice 'ข้ามการอัปเดต anon key — ใช้ค่าเดิมที่มีอยู่แล้วใน Vault';
  elsif v_anon_id is null then
    perform vault.create_secret(v_anon_key, 'monitor_positions_anon_key',
      'anon key ของโปรเจกต์ ใช้ผ่านด่าน Verify JWT ของ Edge Function เท่านั้น ไม่ใช่ตัวยืนยันสิทธิ์ของงานนี้');
  else
    perform vault.update_secret(v_anon_id, v_anon_key, 'monitor_positions_anon_key',
      'anon key ของโปรเจกต์ ใช้ผ่านด่าน Verify JWT ของ Edge Function เท่านั้น ไม่ใช่ตัวยืนยันสิทธิ์ของงานนี้');
  end if;
end
$$;

-- ============================================
-- 3) ล้าง job เดิมก่อนตั้งใหม่
-- ============================================
-- pg_cron ตั้งแต่ 1.4 ทำ cron.schedule() แบบ upsert ตาม (jobname, username) อยู่แล้ว
-- ชื่อเดิมเป๊ะ ๆ จึงไม่ซ้อนกันเอง — แต่ที่ซ้อนได้จริงคือกรณีพวกนี้
--   • เคยลองตั้งเองด้วยชื่ออื่น (เช่น 'monitor', 'test-monitor') แล้วลืมลบ
--   • job เก่าที่ยิง URL เดิมยังค้างอยู่
-- ถ้ามี job ซ้อนกัน 2 ตัว ตัวเฝ้าราคาจะรันพร้อมกัน 2 รอบ = มีโอกาสส่ง Telegram แจ้งปิดออเดอร์
-- ซ้ำสองครั้งต่อออเดอร์เดียว ซึ่งเรียกคืนไม่ได้ จึงกวาดให้เกลี้ยงก่อนเสมอ
--
-- เงื่อนไขจงใจแคบ: จับเฉพาะชื่อ job ของเราเอง กับคำสั่งที่อ้างถึง secret ชื่อ
-- monitor_positions_url เท่านั้น จะได้ไม่เผลอไปลบ cron ของงานอื่นที่คนอื่นตั้งไว้
do $$
declare
  j record;
begin
  for j in
    select jobid, jobname
    from cron.job
    where jobname = 'monitor-positions-30m'
       or command like '%monitor_positions_url%'
  loop
    -- unschedule ด้วย jobid (ไม่ใช่ชื่อ) เพราะเรียกจาก loop ที่หามาแล้วว่ามีจริง
    -- จึงไม่มีทางเจอ error "could not find valid entry for job" แบบเรียกด้วยชื่อลอย ๆ
    perform cron.unschedule(j.jobid);
    raise notice 'ลบ cron job เดิมทิ้งก่อน: % (jobid=%)', j.jobname, j.jobid;
  end loop;
end
$$;

-- ============================================
-- 4) ตั้งเวลา: ทุก 30 นาที
-- ============================================
-- '*/30 * * * *' = นาทีที่ 0 และ 30 ของทุกชั่วโมง ทุกวัน
-- pg_cron อ่านเวลาตาม timezone ของเซิร์ฟเวอร์ (Supabase = UTC) แต่รอบนี้เป็นทุกครึ่งชั่วโมง
-- เท่ากันหมดทั้งวัน timezone จึงไม่มีผลกับตารางนี้
--
-- คำสั่งข้างในถูกเก็บเป็นข้อความใน cron.job.command — ตรงนี้จึงมีแค่ "ชื่อ" ของ secret
-- ส่วนค่าจริงถูกถอดจาก Vault ตอนถึงเวลารันแต่ละรอบ (ไม่ใช่ตอนตั้ง) แปลว่าถ้าเปลี่ยน
-- MONITOR_SECRET ทีหลัง แค่รันบล็อก Vault ข้างบนซ้ำก็พอ ไม่ต้องมาตั้ง cron ใหม่
--
-- job นี้รันด้วยสิทธิ์ของ role ที่ตั้งมัน (ปกติคือ postgres เมื่อรันจาก SQL Editor)
-- role นั้นต้องอ่าน vault.decrypted_secrets ได้ ไม่งั้นทุกรอบจะล้มด้วย permission denied
-- (เห็นได้ที่ cron.job_run_details.return_message — ดูวิธีตรวจข้อ 5)
select cron.schedule(
  'monitor-positions-30m',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'monitor_positions_url'
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
      -- โค้ดอ่าน x-monitor-secret ก่อน authorization เสมอ สองตัวนี้จึงอยู่ด้วยกันได้
      -- anon key เปิดเผยได้ (อยู่ใน bundle ฝั่ง browser อยู่แล้ว) สิทธิ์จริงมาจากตัวนี้เท่านั้น
      'x-monitor-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'monitor_positions_secret'
      )
    ),
    body := '{}'::jsonb,
    -- ตัวเฝ้าราคาต้องไปดึงราคาจาก Yahoo ทีละสัญลักษณ์ ค่า default ของ pg_net (5 วินาที)
    -- สั้นเกินไปจนตัดกลางคัน ให้เวลา 60 วินาที
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
-- 5.1 job ถูกตั้งไว้จริงไหม — ควรเห็น 'monitor-positions-30m' แถวเดียว และ active = true
--     ถ้ามีหลายแถวที่ยิงงานเดียวกัน = ซ้อนกัน ให้รันไฟล์นี้ใหม่ (ข้อ 3 จะกวาดให้)
--     ถ้า active = false คือถูกปิดไว้ มันจะไม่ทำงานเลยแม้จะมีแถวอยู่
--
--   select jobid, jobname, schedule, active, username from cron.job;
--
--
-- 5.2 แต่ละรอบรันแล้วเป็นยังไง — ควรมีแถวใหม่เพิ่มทุก 30 นาที
--     status = 'succeeded' แปลว่า "คำสั่ง SQL รันผ่าน" คือ pg_net รับเข้าคิวแล้วเท่านั้น
--     ⚠ ไม่ได้แปลว่า Edge Function ทำงานสำเร็จ — ต้องไปดู 5.3 ต่อ
--     status = 'failed' → อ่าน return_message จะบอกสาเหตุ เช่น
--       "permission denied for view decrypted_secrets" = role ที่ตั้ง job อ่าน Vault ไม่ได้
--       "schema net does not exist"                    = pg_net ยังไม่ได้เปิด (ย้อนไปข้อ 1)
--     ไม่มีแถวเพิ่มเลยหลังผ่านนาทีที่ 0/30 ไปแล้ว = ตัวจับเวลาไม่ทำงาน (pg_cron ไม่ได้เปิด
--       หรือ job ถูก unschedule ไปแล้ว)
--
--   select jobid, status, return_message, start_time, end_time
--   from cron.job_run_details
--   order by start_time desc
--   limit 10;
--
--
-- 5.3 ปลายทางตอบว่าอะไร — อันนี้คือหลักฐานจริงว่าตัวเฝ้าราคาทำงาน
--     status_code = 200        → Edge Function รันจบ ดู content เพื่อเช็คว่าเช็คไปกี่ออเดอร์
--     status_code = 401        → header x-monitor-secret ไม่ตรงกับ env MONITOR_SECRET
--                                หรือ anon key ใน Vault ผิด/หมดอายุ
--     status_code = 404        → URL ผิด / ชื่อฟังก์ชันไม่ตรง / ยังไม่ได้ deploy
--     status_code = 5xx        → ฟังก์ชัน deploy แล้วแต่พังข้างใน ดู log ที่
--                                Dashboard → Edge Functions → monitor-positions → Logs
--     error_msg มีข้อความ      → ยิงไม่ถึงปลายทางเลย (timeout / DNS / เชื่อมต่อไม่ได้)
--     ไม่มีแถวเลย              → pg_net ไม่ได้ส่งอะไรออกไป หรือแถวหมดอายุไปแล้ว
--                                (pg_net เก็บ response ไว้ไม่กี่ชั่วโมงแล้วลบทิ้งเอง
--                                 ถ้าเพิ่งตั้ง cron ใหม่ ๆ ให้รอถึงนาทีที่ 0 หรือ 30 ก่อน
--                                 หรือใช้วิธียิงทดสอบทันทีในข้อ 5.4)
--
--   select id, status_code, error_msg, created, left(content, 500) as content_preview
--   from net._http_response
--   order by created desc
--   limit 5;
--
--
-- 5.4 อยากทดสอบเดี๋ยวนี้ ไม่ต้องรอถึงนาทีที่ 0/30 — ยิงเองหนึ่งครั้งด้วยคำสั่งชุดเดียวกัน
--     ⚠ นี่คือการกระตุ้นตัวเฝ้าราคาจริง มันจะบันทึกปิดออเดอร์ที่ราคาแตะ SL/TP และส่ง Telegram จริง
--     รันแล้วรอสัก 5-10 วินาทีค่อยรัน query ข้อ 5.3 ดูผล (pg_net ส่งแบบไม่รอผลตอบกลับ)
--
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_positions_url'),
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-monitor-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_positions_secret')
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 60000
--   );
--
--
-- 5.5 อยากหยุดตัวเฝ้าราคาชั่วคราว (เช่นกำลังแก้ Edge Function อยู่)
--
--   select cron.unschedule('monitor-positions-30m');   -- ลบทิ้ง กลับมาเปิดใหม่ด้วยการรันไฟล์นี้ซ้ำ
--   update cron.job set active = false where jobname = 'monitor-positions-30m';  -- แค่พักไว้
