-- Apply hanya setelah persetujuan eksplisit user:
--   ssh minipc-gudang-home 'docker exec -i supabase-db psql -U postgres --single-transaction' < <file>
-- Setelah apply WAJIB verifikasi: select policyname from pg_policies where tablename in
-- ('gudang','sub_gudang','lokasi','stocks') — pastikan policy "Authenticated write *" BENAR-BENAR hilang.
--
-- Fase 0 GELOMBANG 3 — isolasi multi-UPT untuk Data Stok + Gudang/Sub Gudang/Lokasi.
-- Idempoten. Tidak mengubah satu baris data pun; hanya mengganti policy RLS.
--
-- KONDISI SEBELUM: keempat tabel RLS enabled tapi hanya punya SATU policy permisif
-- "Authenticated write <tabel>" (FOR ALL, roles=public) — siapa pun yang login bisa
-- membaca DAN menulis data stok UPT mana pun lewat API. Filter UPT di UI murni kosmetik.
--
-- JANGKAR UPT per tabel (dipakai apa adanya, tidak ada logika izin baru ditulis):
--   gudang      -> langsung: can_access_upt(gudang.upt_id)
--   sub_gudang  -> via gudang_id: can_access_upt(gudang.upt_id)
--   lokasi      -> via gudang_id: can_access_upt(gudang.upt_id)
--   stocks      -> via lokasi_id -> lokasi.gudang_id -> gudang.upt_id
--
-- katalog/mara SENGAJA TIDAK ikut diisolasi — keduanya adalah data referensi
-- nasional/bersama (katalog barang & master data), dipakai lintas UPT, bukan
-- data transaksional milik satu UPT.

begin;

-- ---------------------------------------------------------------------------
-- Guard: batalkan migration kalau masih ada baris yatim di rantai gudang.
-- ---------------------------------------------------------------------------
do $$
declare
  v_gudang_null_upt int;
  v_lokasi_null_gudang int;
  v_stocks_null_lokasi int;
  v_lokasi_orphan int;
  v_stocks_orphan int;
begin
  select count(*) into v_gudang_null_upt from public.gudang where upt_id is null;
  select count(*) into v_lokasi_null_gudang from public.lokasi where gudang_id is null;
  select count(*) into v_stocks_null_lokasi from public.stocks where lokasi_id is null;
  select count(*) into v_lokasi_orphan
    from public.lokasi l
    where l.gudang_id is not null
      and not exists (select 1 from public.gudang g where g.id = l.gudang_id);
  select count(*) into v_stocks_orphan
    from public.stocks s
    where s.lokasi_id is not null
      and not exists (select 1 from public.lokasi l where l.id = s.lokasi_id);

  if v_gudang_null_upt > 0 or v_lokasi_null_gudang > 0 or v_stocks_null_lokasi > 0
     or v_lokasi_orphan > 0 or v_stocks_orphan > 0 then
    raise exception
      'Gelombang 3 dibatalkan — baris yatim ditemukan: gudang.upt_id null=%, lokasi.gudang_id null=%, stocks.lokasi_id null=%, lokasi->gudang hilang=%, stocks->lokasi hilang=%',
      v_gudang_null_upt, v_lokasi_null_gudang, v_stocks_null_lokasi, v_lokasi_orphan, v_stocks_orphan;
  end if;
end $$;

alter table public.gudang enable row level security;
alter table public.sub_gudang enable row level security;
alter table public.lokasi enable row level security;
alter table public.stocks enable row level security;

-- ---------------------------------------------------------------------------
-- 1. gudang — jangkar langsung upt_id.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated write gudang" on public.gudang;
drop policy if exists "Scoped read gudang" on public.gudang;
drop policy if exists "Scoped write gudang" on public.gudang;
drop policy if exists "Scoped all gudang" on public.gudang;

create policy "Scoped all gudang" on public.gudang
  for all to authenticated
  using (public.can_access_upt(upt_id))
  with check (public.can_access_upt(upt_id));

-- ---------------------------------------------------------------------------
-- 2. sub_gudang — jangkar via gudang_id -> gudang.upt_id.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated write sub_gudang" on public.sub_gudang;
drop policy if exists "Scoped read sub_gudang" on public.sub_gudang;
drop policy if exists "Scoped write sub_gudang" on public.sub_gudang;
drop policy if exists "Scoped all sub_gudang" on public.sub_gudang;

create policy "Scoped all sub_gudang" on public.sub_gudang
  for all to authenticated
  using (
    exists (
      select 1 from public.gudang g
      where g.id = sub_gudang.gudang_id
        and public.can_access_upt(g.upt_id)
    )
  )
  with check (
    exists (
      select 1 from public.gudang g
      where g.id = sub_gudang.gudang_id
        and public.can_access_upt(g.upt_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. lokasi — jangkar via gudang_id -> gudang.upt_id.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated write lokasi" on public.lokasi;
drop policy if exists "Scoped read lokasi" on public.lokasi;
drop policy if exists "Scoped write lokasi" on public.lokasi;
drop policy if exists "Scoped all lokasi" on public.lokasi;

create policy "Scoped all lokasi" on public.lokasi
  for all to authenticated
  using (
    exists (
      select 1 from public.gudang g
      where g.id = lokasi.gudang_id
        and public.can_access_upt(g.upt_id)
    )
  )
  with check (
    exists (
      select 1 from public.gudang g
      where g.id = lokasi.gudang_id
        and public.can_access_upt(g.upt_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. stocks — jangkar via lokasi_id -> lokasi.gudang_id -> gudang.upt_id.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated write stocks" on public.stocks;
drop policy if exists "Scoped read stocks" on public.stocks;
drop policy if exists "Scoped write stocks" on public.stocks;
drop policy if exists "Scoped all stocks" on public.stocks;

create policy "Scoped all stocks" on public.stocks
  for all to authenticated
  using (
    exists (
      select 1 from public.lokasi l
      join public.gudang g on g.id = l.gudang_id
      where l.id = stocks.lokasi_id
        and public.can_access_upt(g.upt_id)
    )
  )
  with check (
    exists (
      select 1 from public.lokasi l
      join public.gudang g on g.id = l.gudang_id
      where l.id = stocks.lokasi_id
        and public.can_access_upt(g.upt_id)
    )
  );

commit;
