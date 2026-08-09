-- 20260809_stocks_upt_id_scoping.sql
-- Tujuan: stok BISA disimpan tanpa lokasi_id (gudang diisi belakangan manual via app).
-- Sebelumnya RLS write `stocks` WAJIB lokasi_id valid -> gudang -> can_access_upt,
-- jadi baris migrasi dengan lokasi_id NULL (UPT baru belum punya gudang/lokasi)
-- ditolak diam-diam -> "data hilang" saat reload. Fix: kolom scoping eksplisit
-- `upt_id`; RLS scope via lokasi->gudang KALAU ada lokasi, else via kolom upt_id.
-- Aman: baris lama ter-backfill dari lokasi (scoping identik); can_access_upt(NULL)=false
-- (diverifikasi) jadi baris tanpa lokasi & tanpa upt_id tetap ditolak.
-- Idempoten (add column if not exists + drop policy if exists).

begin;

-- 1. kolom scoping eksplisit
alter table public.stocks add column if not exists upt_id text;

-- 2. backfill baris lama dari lokasi -> gudang.upt_id
update public.stocks s
set upt_id = g.upt_id
from public.lokasi l
join public.gudang g on g.id = l.gudang_id
where l.id = s.lokasi_id and s.upt_id is null;

-- 3. RLS: pakai lokasi->gudang kalau ada lokasi, else kolom upt_id
drop policy if exists "Scoped all stocks" on public.stocks;
create policy "Scoped all stocks" on public.stocks for all to authenticated
  using ( public.can_access_upt( coalesce(
    (select g.upt_id from public.lokasi l join public.gudang g on g.id = l.gudang_id where l.id = stocks.lokasi_id),
    stocks.upt_id ) ) )
  with check ( public.can_access_upt( coalesce(
    (select g.upt_id from public.lokasi l join public.gudang g on g.id = l.gudang_id where l.id = stocks.lokasi_id),
    stocks.upt_id ) ) );

commit;
