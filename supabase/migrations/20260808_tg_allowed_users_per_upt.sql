-- Telegram bot fase 2 — scoping per-UPT.
-- tg_allowed_users.upt_id: NULL = global (UIT/Pusat, lihat semua UPT),
-- terisi = user hanya lihat data UPT tsb. Backward-compat: kolom nullable,
-- semua baris lama default NULL (perilaku nasional lama) sampai di-backfill.
--
-- Apply:
--   ssh minipc-gudang-home 'docker exec -i supabase-db psql -U postgres --single-transaction -v ON_ERROR_STOP=1' < supabase/migrations/20260808_tg_allowed_users_per_upt.sql

alter table public.tg_allowed_users add column if not exists upt_id text;

-- Backfill peta awal (dikonfirmasi user 2026-08-08):
--   id=1 Admin WARNOTO  -> NULL (global superadmin)
--   id=6 Fajar (Ketintang), id=7 Sukono, id=8 Abdul Rouuf -> UPT-SBY
update public.tg_allowed_users set upt_id = 'UPT-SBY' where id in (6, 7, 8);
