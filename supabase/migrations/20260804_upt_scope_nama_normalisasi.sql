-- PROPOSAL ONLY — jangan dijalankan ke self-host production tanpa persetujuan user.
-- Perbaikan can_access_upt_nama (Gelombang 1, 2026-08-04). HANYA satu
-- create or replace function; nol policy, nol DDL.
--
-- MASALAH: TIGA konvensi nama UPT hidup berdampingan di production.
--   attb_list.upt / heavy_equipment.upt = 'Surabaya'      (terpangkas, title case)
--   upt.data->>'nama' (master)          = 'UPT Surabaya'  (utuh, title case)
--   warehouse_capacity.upt              = 'SURABAYA'      (terpangkas, HURUF BESAR)
-- Versi awal mencocokkan persis sehingga lookup 'Surabaya' menghasilkan NULL, dan
-- can_access_upt(NULL) mengembalikan false untuk semua role kecuali SUPERADMIN /
-- ADMIN_LOG_PUSAT. Kalau policy Gelombang 2 dipasang di atas versi itu, SELURUH
-- pengguna kehilangan akses ATTB & Alat Berat tanpa pesan error (RLS menyaring diam-diam).
--
-- PERBAIKAN: normalkan KEDUA sisi perbandingan — buang prefix 'UPT ' (case-insensitive),
-- rapikan spasi tepi, lalu samakan huruf besar-kecil. Fungsi jadi menerima ketiga
-- konvensi sekaligus dan tidak peduli sisi mana yang berubah nanti. Aman karena nama
-- ternormalisasi terbukti masih unik di production: 6 nama unik dari 6 UPT.
-- Tidak ada migrasi data dan tidak ada perubahan kode aplikasi yang dibutuhkan.

create or replace function public.can_access_upt_nama(p_upt_nama text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_access_upt(
    (
      select u.id from upt u
      where upper(btrim(regexp_replace(u.data->>'nama', '^UPT\s+', '', 'i')))
          = upper(btrim(regexp_replace(p_upt_nama, '^UPT\s+', '', 'i')))
      limit 1
    )
  );
$$;
revoke all on function public.can_access_upt_nama(text) from public;
grant execute on function public.can_access_upt_nama(text) to authenticated;
