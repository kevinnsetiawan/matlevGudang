-- GELOMBANG A — Pengerasan RLS + scoping per-UPT untuk `maturity_audit_history`.
-- Idempoten. TIDAK mengubah isi data selain menormalkan `upt_id` dan menutup
-- semester 1 2026 (keputusan user 2026-08-02).
--
-- Latar: keempat tabel maturity memakai policy `FOR ALL USING (auth.role()='authenticated')`
-- tanpa gate role dan tanpa scoping UPT. Dibuktikan dengan akun VIEWER nyata:
-- bisa UPDATE skor audit dan DELETE baris history. Menutup hanya `maturity_audit_history`
-- akan meninggalkan lubang yang sama di `maturity_audits`/`maturity_assessments`,
-- jadi keempatnya diperbaiki lewat satu pasang helper.

-- === 1. Helper akses (pola sama can_access_material_inspection_scope) ===

create or replace function public.is_maturity_superadmin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'SUPERADMIN');
$$;
revoke all on function public.is_maturity_superadmin() from public;
grant execute on function public.is_maturity_superadmin() to authenticated;

-- Baca: SUPERADMIN lihat semua UPT; selain itu hanya UPT profil sendiri.
create or replace function public.can_read_maturity_upt(p_upt_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid()
      and (actor.role = 'SUPERADMIN' or (p_upt_id is not null and actor.upt_id = p_upt_id))
  );
$$;
revoke all on function public.can_read_maturity_upt(text) from public;
grant execute on function public.can_read_maturity_upt(text) to authenticated;

-- Tulis: hanya ADMIN/TL pada UPT-nya sendiri (keputusan user 2026-08-02);
-- MANAGER/ASMAN/VIEWER/ADMIN_ULTG/MGR_ULTG read-only. SUPERADMIN lintas UPT.
create or replace function public.can_write_maturity_upt(p_upt_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid()
      and (
        actor.role = 'SUPERADMIN'
        or (actor.role in ('ADMIN', 'TL') and p_upt_id is not null and actor.upt_id = p_upt_id)
      )
  );
$$;
revoke all on function public.can_write_maturity_upt(text) from public;
grant execute on function public.can_write_maturity_upt(text) to authenticated;

-- === 2. maturity_audit_history: normalisasi upt_id + scoping ===

alter table public.maturity_audit_history add column if not exists upt_id text;
update public.maturity_audit_history h
set upt_id = u.id
from public.upt u
where h.upt_id is null and u.data->>'nama' = h.upt;
-- Gagal keras kalau ada baris yang tidak bisa dipetakan, jangan diam-diam dilewat.
do $$
declare v_orphan int;
begin
  select count(*) into v_orphan from public.maturity_audit_history where upt_id is null;
  if v_orphan > 0 then
    raise exception 'Ada % baris maturity_audit_history tanpa padanan upt.id — perbaiki manual dulu.', v_orphan;
  end if;
end $$;
alter table public.maturity_audit_history alter column upt_id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'maturity_audit_history_upt_id_fkey'
  ) then
    alter table public.maturity_audit_history
      add constraint maturity_audit_history_upt_id_fkey
      foreign key (upt_id) references public.upt(id) on delete restrict;
  end if;
end $$;
create index if not exists idx_maturity_audit_history_upt_id on public.maturity_audit_history (upt_id, tahun desc, semester desc);

alter table public.maturity_audit_history enable row level security;
drop policy if exists "Authenticated read maturity_audit_history" on public.maturity_audit_history;
drop policy if exists "Authenticated write maturity_audit_history" on public.maturity_audit_history;
drop policy if exists "Maturity history read scoped" on public.maturity_audit_history;
drop policy if exists "Maturity history insert admin tl" on public.maturity_audit_history;
drop policy if exists "Maturity history update unlocked" on public.maturity_audit_history;
create policy "Maturity history read scoped" on public.maturity_audit_history
  for select to authenticated using (public.can_read_maturity_upt(upt_id));
create policy "Maturity history insert admin tl" on public.maturity_audit_history
  for insert to authenticated with check (public.can_write_maturity_upt(upt_id));
-- Boleh diedit selama belum dikunci (FINAL/ARSIP). Koreksi setelah dikunci hanya SUPERADMIN,
-- supaya angka audit yang sudah terbit tidak bisa diam-diam diubah pelaksana.
create policy "Maturity history update unlocked" on public.maturity_audit_history
  for update to authenticated
  using (public.can_write_maturity_upt(upt_id) and (public.is_maturity_superadmin() or status not in ('FINAL', 'ARSIP')))
  with check (public.can_write_maturity_upt(upt_id));
-- Sengaja TIDAK ada policy DELETE: angka audit tidak boleh dihapus lewat aplikasi.

-- === 6. Tutup semester 1 2026 (keputusan user 2026-08-02: audit sudah selesai) ===
update public.maturity_audit_history
set status = 'FINAL', updated_at = (extract(epoch from now()) * 1000)::bigint
where id = 'MAH-UPT-SBY-2026-S1' and status <> 'FINAL';
