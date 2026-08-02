-- GELOMBANG B — menyusul GELOMBANG A (20260802_maturity_rls_hardening.sql).
-- Prasyarat urutan: 20260802_maturity_5s_upt_id_column.sql (B1) SUDAH di-apply,
-- lalu kode frontend yang mengirim `upt_id` SUDAH ter-deploy. Kalau DDL ini
-- mendahului kode, Form 5S gagal NOT NULL; kalau kode mendahului B1, gagal PGRST204.
--
-- CATATAN: bagian `maturity_audits` SENGAJA DIHAPUS dari file ini. Tabel itu kini
-- dikelola 20260802_maturity_approval_chain.sql dengan policy SADAR-JENJANG
-- (UPT -> UIT -> Pusat). Versi lama di sini hanya mengenal ADMIN/TL dan akan
-- MENIMPA jenjang UIT/Pusat kalau ikut dijalankan. Jangan dikembalikan.

-- === 4. maturity_5s_assessments: normalisasi upt_id + scoping (tetap append-only) ===

alter table public.maturity_5s_assessments add column if not exists upt_id text;
update public.maturity_5s_assessments s
set upt_id = u.id
from public.upt u
where s.upt_id is null and u.data->>'nama' = s.upt;
do $$
declare v_orphan int;
begin
  select count(*) into v_orphan from public.maturity_5s_assessments where upt_id is null;
  if v_orphan > 0 then
    raise exception 'Ada % baris maturity_5s_assessments tanpa padanan upt.id — perbaiki manual dulu.', v_orphan;
  end if;
end $$;
alter table public.maturity_5s_assessments alter column upt_id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'maturity_5s_assessments_upt_id_fkey'
  ) then
    alter table public.maturity_5s_assessments
      add constraint maturity_5s_assessments_upt_id_fkey
      foreign key (upt_id) references public.upt(id) on delete restrict;
  end if;
end $$;

alter table public.maturity_5s_assessments enable row level security;
drop policy if exists "Authenticated read maturity_5s_assessments" on public.maturity_5s_assessments;
drop policy if exists "Authenticated insert maturity_5s_assessments" on public.maturity_5s_assessments;
drop policy if exists "Maturity 5s read scoped" on public.maturity_5s_assessments;
drop policy if exists "Maturity 5s insert admin tl" on public.maturity_5s_assessments;
create policy "Maturity 5s read scoped" on public.maturity_5s_assessments
  for select to authenticated using (public.can_read_maturity_upt(upt_id));
create policy "Maturity 5s insert admin tl" on public.maturity_5s_assessments
  for insert to authenticated with check (public.can_write_maturity_upt(upt_id));

-- === 5. maturity_assessments: gate role saja ===
-- Tabel ini belum punya kolom UPT sama sekali (cuma id/data/level/created_by),
-- jadi scoping per-UPT belum bisa ditegakkan di sini. Yang ditutup sekarang
-- adalah lubang terbesarnya: VIEWER bisa UPDATE/DELETE. Penambahan kolom UPT
-- menyusul terpisah setelah dipastikan siapa pemilik "Asesmen Pusat" yang ada.

alter table public.maturity_assessments enable row level security;
drop policy if exists "Authenticated read maturity_assessments" on public.maturity_assessments;
drop policy if exists "Authenticated write maturity_assessments" on public.maturity_assessments;
drop policy if exists "Maturity assessments read" on public.maturity_assessments;
drop policy if exists "Maturity assessments insert admin tl" on public.maturity_assessments;
drop policy if exists "Maturity assessments update admin tl" on public.maturity_assessments;
create policy "Maturity assessments read" on public.maturity_assessments
  for select to authenticated using (true);
create policy "Maturity assessments insert admin tl" on public.maturity_assessments
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('SUPERADMIN', 'ADMIN', 'TL')));
create policy "Maturity assessments update admin tl" on public.maturity_assessments
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('SUPERADMIN', 'ADMIN', 'TL')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('SUPERADMIN', 'ADMIN', 'TL')));

