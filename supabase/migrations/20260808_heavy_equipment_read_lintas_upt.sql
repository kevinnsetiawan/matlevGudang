-- Fix: inventaris alat berat harus terlihat LINTAS-UPT untuk fitur peminjaman
-- antar-UPT (dropdown "Alat di luar UPT-ku" butuh alat UPT lain). Policy scoped
-- lama membatasi baca ke UPT sendiri sehingga dropdown selalu kosong.
--
-- SELECT dibuka utk semua authenticated; WRITE tetap scoped (can_access_upt_nama).
-- Disetujui user 2026-08-08 (baca lintas-UPT bukan risiko, sejalan keputusan scan QR).
--
-- Apply:
--   ssh minipc-gudang-home 'docker exec -i supabase-db psql -U postgres --single-transaction -v ON_ERROR_STOP=1' < supabase/migrations/20260808_heavy_equipment_read_lintas_upt.sql

drop policy if exists "Scoped read heavy_equipment" on public.heavy_equipment;
create policy "Read heavy_equipment authenticated" on public.heavy_equipment
  for select to authenticated using (true);
