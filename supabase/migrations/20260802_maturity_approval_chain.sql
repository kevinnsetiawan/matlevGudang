-- Jenjang review & approval Maturity Level — TERPISAH dari pola TUG
-- (keputusan user 2026-08-02: ini jenjang yang berbeda, jangan disamakan).
--
-- Alur yang disepakati:
--   UPT (ADMIN/TL, UPT sendiri)      : DRAFT / SELF_ASSESSMENT / REVISION  -> submit
--   UIT (level Asman, SEMUA UPT)     : REVIEW_UIT   -> review + edit + submit
--   Pusat (SEMUA UPT)                : REVIEW_PUSAT -> review + submit nilai final
--   FINAL                            : terkunci; baris history terbit OTOMATIS
--
-- Prasyarat: 20260802_maturity_rls_hardening.sql (GELOMBANG A) sudah di-apply.
-- Idempoten.

-- === 1. Tahap baru REVIEW_PUSAT ===

alter table public.maturity_audits drop constraint if exists maturity_audits_status_check;
alter table public.maturity_audits add constraint maturity_audits_status_check
  check (status in ('DRAFT', 'SELF_ASSESSMENT', 'REVIEW_UIT', 'REVIEW_PUSAT', 'REVISION', 'FINAL'));

-- === 2. Helper per jenjang ===
-- can_write_maturity_upt() dari GELOMBANG A tetap dipakai apa adanya untuk
-- jenjang UPT (ADMIN/TL, terkunci ke UPT profil sendiri).

-- Hirarki peran (ditetapkan user 2026-08-02):
--   UPT   : ADMIN, TL, ASMAN, MANAGER, MGR_ULTG, ADMIN_ULTG  -> HANYA UPT sendiri
--   UIT   : ADMIN_UIT, ASMAN_LOG_UIT, MGR_LOGISTIK_UIT       -> semua UPT
--   Pusat : ADMIN_LOG_PUSAT                                  -> semua UPT + UIT
-- Catatan: MANAGER UPT hanya melihat 1 UPT-nya sendiri — jangan diperlakukan
-- sebagai peninjau lintas UPT seperti pada kode lama.

-- UIT bekerja lintas UPT — sengaja TIDAK discope ke upt_id.
-- SUPERADMIN ikut disertakan: tanpa itu audit yang macet di meja UIT tidak bisa
-- ditolong siapa pun, padahal SUPERADMIN toh sudah berkuasa penuh di tahap
-- Pusat/FINAL — mengunci dia hanya di sini kontrol semu, bukan pemisahan wewenang.
create or replace function public.can_review_maturity_uit()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('ADMIN_UIT', 'ASMAN_LOG_UIT', 'MGR_LOGISTIK_UIT', 'SUPERADMIN')
  );
$$;
revoke all on function public.can_review_maturity_uit() from public;
grant execute on function public.can_review_maturity_uit() to authenticated;

-- Pusat = ADMIN_LOG_PUSAT (akun tersendiri, dibuat menyusul). MANAGER SENGAJA
-- TIDAK di sini: tiap UPT punya 1 MANAGER yang cakupannya hanya UPT itu, jadi
-- memasukkannya berarti UPT menilai final dirinya sendiri.
create or replace function public.can_review_maturity_pusat()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN_LOG_PUSAT', 'SUPERADMIN')
  );
$$;
revoke all on function public.can_review_maturity_pusat() from public;
grant execute on function public.can_review_maturity_pusat() to authenticated;

-- GELOMBANG A menulis can_read_maturity_upt() hanya berbasis upt_id, padahal akun
-- UIT/Pusat tidak punya upt_id — tanpa perbaikan ini mereka melihat 0 baris di
-- `maturity_audit_history` dan `maturity_5s_assessments`. Ditimpa di sini.
create or replace function public.can_read_maturity_upt(p_upt_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid()
      and (
        actor.role in ('SUPERADMIN', 'ADMIN_LOG_PUSAT', 'ADMIN_UIT', 'ASMAN_LOG_UIT', 'MGR_LOGISTIK_UIT')
        or (p_upt_id is not null and actor.upt_id = p_upt_id)
      )
  );
$$;

-- === 3. Policy maturity_audits sadar-jenjang ===
-- Baca: UPT sendiri, ATAU peninjau UIT/Pusat (lintas UPT).
-- Tulis: yang boleh bertindak ditentukan status BARIS SAAT INI (klausa USING).
-- WITH CHECK sengaja longgar soal status tujuan — kalau tidak, submit yang
-- memindahkan status ke jenjang berikutnya akan ditolak oleh policy-nya sendiri.

drop policy if exists "Maturity audits read scoped" on public.maturity_audits;
drop policy if exists "Maturity audits insert admin tl" on public.maturity_audits;
drop policy if exists "Maturity audits update unlocked" on public.maturity_audits;
drop policy if exists "Maturity audits read chain" on public.maturity_audits;
drop policy if exists "Maturity audits insert upt" on public.maturity_audits;
drop policy if exists "Maturity audits update by stage" on public.maturity_audits;

create policy "Maturity audits read chain" on public.maturity_audits
  for select to authenticated using (
    public.can_read_maturity_upt(upt_id)
    or public.can_review_maturity_uit()
    or public.can_review_maturity_pusat()
  );

-- Audit hanya LAHIR di UPT-nya sendiri.
create policy "Maturity audits insert upt" on public.maturity_audits
  for insert to authenticated with check (public.can_write_maturity_upt(upt_id));

create policy "Maturity audits update by stage" on public.maturity_audits
  for update to authenticated
  using (
    (public.can_write_maturity_upt(upt_id) and status in ('DRAFT', 'SELF_ASSESSMENT', 'REVISION'))
    or (public.can_review_maturity_uit() and status = 'REVIEW_UIT')
    or (public.can_review_maturity_pusat() and status in ('REVIEW_PUSAT', 'FINAL'))
  )
  with check (
    public.can_write_maturity_upt(upt_id)
    or public.can_review_maturity_uit()
    or public.can_review_maturity_pusat()
  );
-- Tidak ada policy DELETE: angka audit tidak dihapus lewat aplikasi.

-- === 4. Publikasi otomatis ke history saat FINAL ===
-- Keputusan user: baris history TERBIT SENDIRI setelah audit final disetujui
-- Pusat — bukan diketik manual. SECURITY DEFINER supaya trigger tetap bisa
-- menulis meski penulisnya tidak punya hak tulis ke tabel history.

create or replace function public.publish_maturity_audit_history()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tahun smallint;
  v_semester smallint;
  v_upt_nama text;
begin
  if new.status <> 'FINAL' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'FINAL' then return new; end if;

  v_tahun := split_part(new.period_key, '-', 1)::smallint;
  v_semester := case when split_part(new.period_key, '-', 2)::int <= 6 then 1 else 2 end;
  select coalesce(u.data->>'nama', new.upt) into v_upt_nama from public.upt u where u.id = new.upt_id;

  insert into public.maturity_audit_history (id, upt, upt_id, tahun, semester, score, status, source, notes)
  values (
    'MAH-' || new.upt_id || '-' || v_tahun || '-S' || v_semester,
    coalesce(v_upt_nama, new.upt), new.upt_id, v_tahun, v_semester,
    greatest(0, least(5, new.score)), 'FINAL', 'AUDIT_FINAL',
    'Terbit otomatis dari audit ' || new.id
  )
  on conflict (upt, tahun, semester) do update
    set score = excluded.score,
        status = 'FINAL',
        source = 'AUDIT_FINAL',
        notes = excluded.notes,
        upt_id = excluded.upt_id,
        updated_at = (extract(epoch from now()) * 1000)::bigint,
        updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_publish_maturity_audit_history on public.maturity_audits;
create trigger trg_publish_maturity_audit_history
  after insert or update of status on public.maturity_audits
  for each row execute function public.publish_maturity_audit_history();
