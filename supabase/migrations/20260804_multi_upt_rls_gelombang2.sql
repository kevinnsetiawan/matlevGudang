-- PROPOSAL ONLY — jangan dijalankan ke self-host production tanpa persetujuan user.
-- Fase 0 GELOMBANG 2 — isolasi multi-UPT untuk Alat Berat, Peminjaman, ATTB, Kapasitas Gudang.
-- Idempoten. Tidak mengubah satu baris data pun; hanya mengganti policy RLS.
--
-- PRASYARAT: 20260804_upt_scope_nama_normalisasi.sql WAJIB sudah di-apply lebih dulu.
-- Tanpa itu can_access_upt_nama('Surabaya') mengembalikan false untuk semua orang dan
-- keempat tabel di bawah menjadi kosong bagi seluruh pengguna non-SUPERADMIN.
--
-- KONDISI SEBELUM: keempat tabel RLS enabled tapi hanya punya SATU policy permisif
-- "Authenticated write <tabel>" (FOR ALL, roles=public) — siapa pun yang login bisa
-- membaca DAN menulis baris UPT mana pun lewat API. Filter UPT yang ada di UI murni
-- kosmetik. Ini bukan risiko teoretis: heavy_equipment sudah berisi data 6 UPT
-- (Bali 12, Surabaya 12, Madiun 8, Malang 7, Gresik 6, Probolinggo 6).
--
-- CATATAN NULL: baris dengan upt NULL/tak dikenal tetap terlihat oleh SUPERADMIN dan
-- ADMIN_LOG_PUSAT (kedua role itu lolos sebelum p_upt_id diperiksa), sehingga baris
-- yatim selalu punya jalan untuk diperbaiki dan tidak hilang dari semua orang.

alter table public.heavy_equipment enable row level security;
alter table public.heavy_equipment_loans enable row level security;
alter table public.attb_list enable row level security;
alter table public.warehouse_capacity enable row level security;

-- ---------------------------------------------------------------------------
-- 1. heavy_equipment — baca: pemilik ATAU UPT yang sedang meminjam alat itu.
--    tulis: pemilik saja. Peminjam boleh melihat alat yang dipegangnya (kalau tidak,
--    tampilan peminjaman miliknya kehilangan detail alat), tapi tidak boleh mengubah
--    data milik UPT lain.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated write heavy_equipment" on public.heavy_equipment;
drop policy if exists "Scoped read heavy_equipment" on public.heavy_equipment;
drop policy if exists "Scoped write heavy_equipment" on public.heavy_equipment;

create policy "Scoped read heavy_equipment" on public.heavy_equipment
  for select to authenticated
  using (
    public.can_access_upt_nama(upt)
    or exists (
      select 1 from public.heavy_equipment_loans l
      where l.equipment_id = heavy_equipment.id
        and public.can_access_upt_nama(l.requester_upt)
    )
  );

create policy "Scoped write heavy_equipment" on public.heavy_equipment
  for all to authenticated
  using (public.can_access_upt_nama(upt))
  with check (public.can_access_upt_nama(upt));

-- ---------------------------------------------------------------------------
-- 2. heavy_equipment_loans — pemilik ATAU peminjam, untuk baca dan tulis.
--    Satu transaksi peminjaman sah menjadi urusan dua UPT: pemilik menyetujui,
--    peminjam mengajukan dan mengembalikan. UPT ketiga tetap tidak melihat apa pun.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated write heavy_equipment_loans" on public.heavy_equipment_loans;
drop policy if exists "Scoped all heavy_equipment_loans" on public.heavy_equipment_loans;

create policy "Scoped all heavy_equipment_loans" on public.heavy_equipment_loans
  for all to authenticated
  using (
    public.can_access_upt_nama(owner_upt)
    or public.can_access_upt_nama(requester_upt)
  )
  with check (
    public.can_access_upt_nama(owner_upt)
    or public.can_access_upt_nama(requester_upt)
  );

-- ---------------------------------------------------------------------------
-- 3. attb_list — UPT sendiri saja.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated write attb_list" on public.attb_list;
drop policy if exists "Scoped all attb_list" on public.attb_list;

create policy "Scoped all attb_list" on public.attb_list
  for all to authenticated
  using (public.can_access_upt_nama(upt))
  with check (public.can_access_upt_nama(upt));

-- ---------------------------------------------------------------------------
-- 4. warehouse_capacity — UPT sendiri saja.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated write warehouse_capacity" on public.warehouse_capacity;
drop policy if exists "Scoped all warehouse_capacity" on public.warehouse_capacity;

create policy "Scoped all warehouse_capacity" on public.warehouse_capacity
  for all to authenticated
  using (public.can_access_upt_nama(upt))
  with check (public.can_access_upt_nama(upt));
