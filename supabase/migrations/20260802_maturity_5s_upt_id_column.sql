-- GELOMBANG B1 — pemecah kebuntuan urutan deploy untuk `maturity_5s_assessments`.
--
-- Masalahnya: GELOMBANG B menjadikan `upt_id` NOT NULL + RLS per-UPT, sedangkan
-- kode frontend harus mengirim `upt_id`. Kedua urutan sama-sama memutus Form 5S:
--   * DDL dulu  -> kode lama tidak mengirim upt_id  -> gagal NOT NULL.
--   * kode dulu -> kolomnya belum ada               -> gagal PGRST204.
-- Jadi kolomnya ditambahkan NULLABLE lebih dulu di sini. Kode lama tetap jalan
-- (kolom nullable yang tidak diisi), kode baru juga jalan (mengirim upt_id).
-- Pengetatan NOT NULL + policy menyusul di GELOMBANG B setelah kode ter-deploy.
--
-- Idempoten. Aman dijalankan kapan saja; tabel ini 0 baris di production.

alter table public.maturity_5s_assessments add column if not exists upt_id text;

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

create index if not exists idx_maturity_5s_assessments_upt_id
  on public.maturity_5s_assessments (upt_id, tahun desc, bulan desc);
