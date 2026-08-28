-- ============================================
-- 008 — ตัวเฝ้าระวังตัวสแกน (idempotent, non-destructive)
--
-- วางทั้งไฟล์ลง Supabase → SQL Editor → Run · รันซ้ำกี่รอบก็ปลอดภัย
-- ⚠ ต้องแก้ค่าในส่วน "ตั้งค่า" ข้างล่างก่อนรัน (มี GitHub token ที่ต้องใส่เอง)
-- ⚠ ห้ามใส่ DROP TABLE ของตารางฝั่งเทรดลงในไฟล์นี้เด็ดขาด (กติกาเดิมของ repo)
--
-- ── ปัญหาที่ไฟล์นี้มาแก้ ──────────────────────────────────────────────────────────
-- 2026-08-26 เวลา 14:29 UTC ตัวจับเวลาของ GitHub Actions หยุดยิงเอง และไม่ยิงอีกเลย
-- จนถึง 15:00 ของวันถัดไป — เงียบไป 24 ชั่วโมงครึ่ง
--
-- ตอนนั้น: ทุก workflow ยังขึ้นสถานะ active · สั่งรันเองทำงานปกติทุกอย่าง (ได้ 4 สัญญาณ
-- และแจ้งเตือนถึงเครื่องจริง) · ไม่มีรอบไหนล้มเลยสักรอบ · repo เป็น public จึงไม่ติดโควตา
-- และ push ก็ยังทริกเกอร์ CI ได้ตามปกติ — หยุดเฉพาะ trigger ชนิด schedule เท่านั้น
--
-- เจ้าของรู้ตัวเพราะสังเกตเองว่า "วันนี้ไม่มีแจ้งเตือน" ไม่ใช่เพราะระบบบอก
--
-- ── ทำไมต้องเป็น pg_cron ไม่ใช่ตัวสแกนสำรอง ────────────────────────────────────
-- ทางที่ง่ายกว่าคือให้ Vercel route /api/cron/scan-markets สแกนซ้ำอีกตัว แต่ผู้เขียนเดิม
-- บันทึกไว้ในหัวไฟล์ route นั้นว่าทำไมถึงปิด cron ของมันไป: ตัวสแกนสองตัวที่เขียนตาราง
-- signals ใบเดียวกัน ทำให้ตัวกันสัญญาณซ้ำ (อ่านก่อนเขียน) กันไม่อยู่ และเคยเกิดจริงมาแล้ว
--
-- ไฟล์นี้จึงไม่สร้างตัวสแกนตัวที่สอง แต่ไป "กดปุ่ม" ตัวสแกนตัวเดิมที่ทำงานอยู่แล้ว
-- ผ่าน workflow_dispatch ของ GitHub — สัญญาณยังมาจากทางเดียวเหมือนเดิมทุกประการ
--
-- ── ทำไมถึงยิงเฉพาะตอนเงียบ ไม่ยิงตามเวลา ──────────────────────────────────────
-- ถ้ายิงทุก 30 นาทีไม่ว่าอะไรจะเกิดขึ้น ก็จะได้ตัวสแกนสองตัวที่ชนกันเองอีก
-- ตัวนี้จึงเช็คก่อนว่า "รอบล่าสุดเก่าเกินเกณฑ์หรือยัง" แล้วค่อยยิง ปกติมันจะไม่ทำอะไรเลย
-- ============================================

-- ══════════════════════════ ตั้งค่า — แก้ตรงนี้ก่อนรัน ══════════════════════════
--
-- 1. สร้าง GitHub token: github.com/settings/personal-access-tokens/new
--      Repository access → Only select repositories → Trade-AI-tech/TRADE
--      Permissions → Repository permissions → Actions → Read and write
--      อายุ: เลือกได้ตามสบาย แต่ถ้าหมดอายุแล้วตัวเฝ้าระวังจะเงียบไปเอง
--      (ตาราง scan_watchdog_log จะบันทึก http 401 ไว้ให้เห็น)
--
-- 2. แทน 'ใส่_GITHUB_TOKEN_ตรงนี้' ข้างล่างด้วย token ที่ได้มา
--
-- token ถูกเก็บใน Supabase Vault ซึ่งเข้ารหัสไว้ ไม่ได้อยู่ในตารางธรรมดา
-- และไม่มีทางอ่านกลับมาเป็นข้อความได้จาก REST API

do $$
declare
  v_token text := 'ใส่_GITHUB_TOKEN_ตรงนี้';
begin
  if v_token = 'ใส่_GITHUB_TOKEN_ตรงนี้' then
    raise exception 'ยังไม่ได้ใส่ GitHub token — อ่านหมายเหตุข้างบนแล้วแก้บรรทัด v_token ก่อนรัน';
  end if;

  -- ลบของเดิมก่อนถ้ามี เพื่อให้รันไฟล์นี้ซ้ำแล้วได้ค่าใหม่ ไม่ใช่ error ว่าชื่อซ้ำ
  -- ลบจากตารางตรง ๆ แทนการเรียก vault.delete_secret() เพราะชื่อฟังก์ชันของ Vault
  -- เปลี่ยนไปมาระหว่างเวอร์ชันของ Supabase ส่วนตาราง vault.secrets มีมาตลอด
  delete from vault.secrets where name = 'github_actions_token';
  perform vault.create_secret(v_token, 'github_actions_token', 'token สำหรับกดตัวสแกนเมื่อ GitHub หยุดยิง cron เอง');
end $$;

-- ══════════════════════════ ส่วนที่ไม่ต้องแก้ ══════════════════════════

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ── สมุดบันทึกของตัวเฝ้าระวัง ────────────────────────────────────────────────
-- ต้องมี ไม่งั้นตัวเฝ้าระวังที่พังจะเงียบแบบเดียวกับปัญหาที่มันมาแก้พอดี
create table if not exists public.scan_watchdog_log (
  id bigserial primary key,
  checked_at timestamptz not null default now(),
  /** อายุของราคาล่าสุด ณ ตอนตรวจ (นาที) — null = ยังไม่มีราคาในระบบเลย */
  age_minutes numeric,
  /** ยิงไปหรือเปล่า */
  fired boolean not null,
  /** id ของคำขอฝั่ง pg_net เอาไว้ตามผลทีหลังใน net._http_response */
  request_id bigint,
  note text
);

comment on table public.scan_watchdog_log is
  'ทุกครั้งที่ตัวเฝ้าระวังตรวจ จะบันทึกไว้ที่นี่ ไม่ว่าจะยิงหรือไม่ยิง — ถ้าตารางนี้หยุดโต แปลว่าตัวเฝ้าระวังเองตายแล้ว';

alter table public.scan_watchdog_log enable row level security;
drop policy if exists "Public read watchdog log" on public.scan_watchdog_log;
create policy "Public read watchdog log" on public.scan_watchdog_log for select using (true);

create index if not exists idx_watchdog_checked on public.scan_watchdog_log (checked_at desc);

-- ── ตัวตรวจและตัวยิง ─────────────────────────────────────────────────────────
--
-- เกณฑ์ 120 นาที มาจากพฤติกรรมที่วัดจริง ไม่ใช่ตัวเลขที่ตั้งเอาเอง:
-- หน้าปัด cron ตั้งไว้ทุก 15 นาที (เดิม 30) แต่ GitHub ส่งจริงเฉลี่ยราว 56 นาที และช่องว่างระหว่างรอบ
-- เคยวัดได้ตั้งแต่ 15 ถึง 95 นาทีตอนระบบยังปกติ · 120 จึงยังไม่ทับกับการทำงานปกติ
-- (ตัวเลขเดียวกับ SLOW_AFTER_MIN ใน src/lib/scan-health.ts — ถ้าแก้ที่หนึ่งควรแก้ทั้งสองที่)
create or replace function public.check_scan_freshness()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_age numeric;
  v_token text;
  v_req bigint;
begin
  select extract(epoch from (now() - max(updated_at))) / 60 into v_age from public.market_prices;

  -- ยังปกติดี — บันทึกไว้ว่าตรวจแล้ว แล้วจบ
  if v_age is not null and v_age < 120 then
    insert into public.scan_watchdog_log (age_minutes, fired, note)
    values (v_age, false, 'ยังปกติ ไม่ต้องยิง');
    return;
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'github_actions_token';
  if v_token is null then
    insert into public.scan_watchdog_log (age_minutes, fired, note)
    values (v_age, false, 'ไม่มี token ใน vault — ยิงไม่ได้');
    return;
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/Trade-AI-tech/TRADE/actions/workflows/scan-universe.yml/dispatches',
    body := '{"ref":"main"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      -- GitHub ปฏิเสธคำขอที่ไม่มี User-Agent ด้วย 403 โดยไม่บอกเหตุผลที่อ่านรู้เรื่อง
      'User-Agent', 'supabase-scan-watchdog',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 8000
  ) into v_req;

  insert into public.scan_watchdog_log (age_minutes, fired, request_id, note)
  values (v_age, true, v_req,
    case when v_age is null then 'ไม่มีราคาในระบบเลย — ยิงตัวสแกน'
         else 'ราคาเก่าเกิน 120 นาที — ยิงตัวสแกน' end);
end $$;

comment on function public.check_scan_freshness is
  'ตรวจว่าตัวสแกนยังเดินอยู่ไหม ถ้าเงียบเกิน 120 นาทีจะกด workflow_dispatch ของ GitHub ให้';

-- ── ตั้งเวลา ─────────────────────────────────────────────────────────────────
-- ทุก 20 นาที: ถี่พอให้ตรวจเจอเร็ว แต่ตัวมันเองแทบไม่ทำอะไรเลยเมื่อระบบปกติ
select cron.unschedule('scan-watchdog') where exists (select 1 from cron.job where jobname = 'scan-watchdog');
select cron.schedule('scan-watchdog', '*/20 * * * *', $$select public.check_scan_freshness()$$);

-- ── ตรวจผลหลังรัน ────────────────────────────────────────────────────────────
-- select * from cron.job where jobname = 'scan-watchdog';
-- select * from public.scan_watchdog_log order by checked_at desc limit 20;
-- select id, status_code, content from net._http_response order by id desc limit 5;
--
-- อยากทดสอบเดี๋ยวนี้โดยไม่ต้องรอ 20 นาที:  select public.check_scan_freshness();
-- (ถ้าราคายังสด มันจะบันทึกว่า "ยังปกติ ไม่ต้องยิง" ซึ่งก็คือทำงานถูกแล้ว)
