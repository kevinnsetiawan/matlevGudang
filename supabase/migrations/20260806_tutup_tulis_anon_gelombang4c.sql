-- Apply hanya setelah persetujuan eksplisit user:
--   ssh minipc-gudang-home 'docker exec -i supabase-db psql -U postgres --single-transaction' < <file>
-- Setelah apply WAJIB verifikasi dengan supabase/verify_gelombang4c.sql.
--
-- Fase 0 GELOMBANG 4c — tutup lubang tulis publik role `anon`.
-- Idempoten. Tidak mengubah satu baris data pun; hanya GRANT + policy RLS.
--
-- LATAR BELAKANG: audit production menemukan anon (tanpa login) bisa MENULIS ke
-- katalog, stock_current, tug15_history, warnoto_state, wa_sync_status,
-- tg_agent_logs, dan memegang GRANT INSERT/UPDATE/DELETE/TRUNCATE di 33 tabel
-- skema public. Anon key ada di bundle JS publik. Penyebabnya di KODE:
-- src/lib/supabaseSync.js mengirim anon key sebagai Authorization (bukan token
-- sesi user) di 3 fungsi sync. Itu sudah diperbaiki (commit sebelum migration
-- ini) — semua 3 fungsi sekarang mengirim access token user login, dan
-- melempar error kalau tidak ada sesi. Migration ini yang menutup pintunya.
--
-- AUDIT LANJUTAN (arsitek): lubang BACA anon lebih besar dari lubang tulisnya.
-- warnoto_state.state_data berisi blob seluruh state aplikasi (228 baris) dan
-- bisa dibaca siapa pun tanpa login lewat anon key di bundle JS. forecast_predictions
-- dan stock_scan_log senasib tapi TIDAK dipakai halaman scan publik (diverifikasi
-- grep src/components/ScanPublicView.jsx: hanya baca katalog/tug15_history/
-- stock_current). Ketiganya ditutup ke authenticated di langkah 6.
--
-- KEPUTUSAN SENGAJA — JANGAN "DIRAPIKAN":
--   1. Public read katalog / tug15_history / stock_current TETAP ADA (tidak
--      di-drop). Dipakai src/components/ScanPublicView.jsx — scan QR di rak
--      pakai anon key tanpa login. Yang ditutup HANYA jalur tulis anon.
--   2. wa_sync_status: hanya policy TULIS (FOR ALL) yang dihapus. Ditulis bot
--      Telegram lewat Edge Function (supabase/functions/telegram-webhook/
--      index.ts) yang memakai SERVICE_ROLE — service_role melewati RLS, jadi
--      bot tidak terganggu. Tabelnya sendiri TIDAK di-drop, masih dipakai bot.
--      Tidak dicek dibaca dari src/ (browser) sama sekali — cuma dari script
--      Node (nightly_sync.mjs) dan Edge Function, keduanya service_role — jadi
--      policy SELECT existing (anon) dibiarkan apa adanya, di luar cakupan ini.
--   3. tg_agent_logs: hanya policy UPDATE publik yang dihapus (penulisnya
--      service_role). Policy "Authenticated read tg_agent_logs" TIDAK disentuh.
--   4. katalog TETAP NASIONAL (dipakai bersama semua UPT) — policy tulis baru
--      untuk role authenticated TIDAK diberi filter UPT. Isolasi per-UPT untuk
--      katalog adalah keputusan terpisah, di luar cakupan migration ini.
--   5. Tabel/policy Gelombang 4a (tug_transactions, tug_items, tug_approvals,
--      stock_movements, dan policy tulis stock_current/tug15_history) TIDAK
--      disentuh di sini — 4a ditulis terpisah dan belum di-apply. Pengecualian:
--      REVOKE GRANT anon di langkah 1 memang menyeluruh ke semua tabel
--      (termasuk tabel-tabel 4a), tapi itu hanya mencabut kemampuan MENULIS
--      anon secara global — tidak menambah/mengubah policy RLS tabel 4a.

begin;

-- ---------------------------------------------------------------------------
-- 1. Cabut GRANT tulis anon di seluruh skema public (RLS bukan satu-satunya
--    pagar — kalau GRANT-nya masih ada, satu policy permisif yang keliru di
--    tabel mana pun langsung jadi lubang tulis publik lagi). SELECT TIDAK
--    dicabut — anon masih boleh baca sesuai policy RLS masing-masing tabel.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;

-- ---------------------------------------------------------------------------
-- 2. katalog — tulis publik -> authenticated. Baca publik dipertahankan.
-- ---------------------------------------------------------------------------
drop policy if exists "Public insert katalog" on public.katalog;
drop policy if exists "Public update katalog" on public.katalog;
drop policy if exists "Authenticated write katalog" on public.katalog;

create policy "Authenticated write katalog" on public.katalog
  for all to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 3. warnoto_state — tulis publik -> authenticated. Baca publik dipertahankan.
-- ---------------------------------------------------------------------------
drop policy if exists "Public insert warnoto_state" on public.warnoto_state;
drop policy if exists "Authenticated insert warnoto_state" on public.warnoto_state;

create policy "Authenticated insert warnoto_state" on public.warnoto_state
  for insert to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- 4. wa_sync_status — hapus policy tulis publik. Bot Telegram tetap jalan
--    lewat service_role (bypass RLS). Policy SELECT existing dibiarkan.
-- ---------------------------------------------------------------------------
drop policy if exists "Public write wa_sync_status" on public.wa_sync_status;

-- ---------------------------------------------------------------------------
-- 5. tg_agent_logs — hapus policy UPDATE publik. Penulisnya service_role.
-- ---------------------------------------------------------------------------
drop policy if exists "Service write tg_agent_logs" on public.tg_agent_logs;

-- ---------------------------------------------------------------------------
-- 6. warnoto_state / forecast_predictions / stock_scan_log — baca publik ->
--    authenticated. Tidak dipakai ScanPublicView.jsx (hanya baca katalog/
--    tug15_history/stock_current), jadi anon tidak butuh baca ketiganya.
--    Catatan stock_scan_log: ScanPublicView memang MENCOBA mencatat scan
--    (fire-and-forget), tapi di production tabel ini TIDAK punya policy INSERT
--    sama sekali — dicek 2026-08-06, satu-satunya policy adalah "Public read".
--    Jadi pencatatan scan sudah gagal senyap sejak awal dan tabelnya 0 baris.
--    Migration ini sengaja TIDAK membuka jalur tulis anon baru untuk itu;
--    kalau fitur log scan mau dihidupkan, itu keputusan terpisah.
-- ---------------------------------------------------------------------------
drop policy if exists "Public read warnoto_state" on public.warnoto_state;
drop policy if exists "Authenticated read warnoto_state" on public.warnoto_state;
create policy "Authenticated read warnoto_state" on public.warnoto_state
  for select to authenticated
  using (true);

drop policy if exists "Public read forecast_predictions" on public.forecast_predictions;
drop policy if exists "Authenticated read forecast_predictions" on public.forecast_predictions;
create policy "Authenticated read forecast_predictions" on public.forecast_predictions
  for select to authenticated
  using (true);

drop policy if exists "Public read stock_scan_log" on public.stock_scan_log;
drop policy if exists "Authenticated read stock_scan_log" on public.stock_scan_log;
create policy "Authenticated read stock_scan_log" on public.stock_scan_log
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 7. Storage buckets material-photos / stock-photos / tug-photos — tulis
--    (INSERT+UPDATE) publik -> authenticated. `revoke ... schema public` di
--    langkah 1 TIDAK menjangkau ini (storage.objects ada di skema `storage`).
--    Pola diambil PERSIS dari bucket tug-docs-private yang sudah live
--    (bucket_id = '<nama>' and auth.role() = 'authenticated') — jangan ganti gaya.
--    Baca (SELECT) TETAP PUBLIK — foto material tampil di halaman scan QR
--    tanpa login (ScanPublicView.jsx) — JANGAN "DIRAPIKAN".
-- ---------------------------------------------------------------------------
drop policy if exists "Public upload material-photos" on storage.objects;
drop policy if exists "Public update material-photos" on storage.objects;
create policy "Public upload material-photos" on storage.objects
  for insert with check (bucket_id = 'material-photos' and auth.role() = 'authenticated');
create policy "Public update material-photos" on storage.objects
  for update using (bucket_id = 'material-photos' and auth.role() = 'authenticated');

drop policy if exists "Public upload stock-photos" on storage.objects;
drop policy if exists "Public update stock-photos" on storage.objects;
create policy "Public upload stock-photos" on storage.objects
  for insert with check (bucket_id = 'stock-photos' and auth.role() = 'authenticated');
create policy "Public update stock-photos" on storage.objects
  for update using (bucket_id = 'stock-photos' and auth.role() = 'authenticated');

drop policy if exists "Public upload tug-photos" on storage.objects;
drop policy if exists "Public update tug-photos" on storage.objects;
create policy "Public upload tug-photos" on storage.objects
  for insert with check (bucket_id = 'tug-photos' and auth.role() = 'authenticated');
create policy "Public update tug-photos" on storage.objects
  for update using (bucket_id = 'tug-photos' and auth.role() = 'authenticated');

commit;

-- ---------------------------------------------------------------------------
-- PEMULIHAN DARURAT (kembalikan GRANT + policy persis seperti sebelum 4c):
--
--   begin;
--   grant insert, update, delete, truncate on all tables in schema public to anon;
--   alter default privileges in schema public grant insert, update, delete, truncate on tables to anon;
--   drop policy if exists "Authenticated write katalog" on public.katalog;
--   drop policy if exists "Authenticated insert warnoto_state" on public.warnoto_state;
--   create policy "Public insert katalog" on public.katalog for insert with check (true);
--   create policy "Public update katalog" on public.katalog for update using (true);
--   create policy "Public insert warnoto_state" on public.warnoto_state for insert with check (true);
--   create policy "Public write wa_sync_status" on public.wa_sync_status for all using (true) with check (true);
--   create policy "Service write tg_agent_logs" on public.tg_agent_logs for update using (true) with check (true);
--   drop policy if exists "Authenticated read warnoto_state" on public.warnoto_state;
--   drop policy if exists "Authenticated read forecast_predictions" on public.forecast_predictions;
--   drop policy if exists "Authenticated read stock_scan_log" on public.stock_scan_log;
--   create policy "Public read warnoto_state" on public.warnoto_state for select using (true);
--   create policy "Public read forecast_predictions" on public.forecast_predictions for select using (true);
--   create policy "Public read stock_scan_log" on public.stock_scan_log for select using (true);
--   drop policy if exists "Public upload material-photos" on storage.objects;
--   drop policy if exists "Public update material-photos" on storage.objects;
--   drop policy if exists "Public upload stock-photos" on storage.objects;
--   drop policy if exists "Public update stock-photos" on storage.objects;
--   drop policy if exists "Public upload tug-photos" on storage.objects;
--   drop policy if exists "Public update tug-photos" on storage.objects;
--   create policy "Public upload material-photos" on storage.objects for insert with check (bucket_id = 'material-photos');
--   create policy "Public update material-photos" on storage.objects for update using (bucket_id = 'material-photos');
--   create policy "Public upload stock-photos" on storage.objects for insert with check (bucket_id = 'stock-photos');
--   create policy "Public update stock-photos" on storage.objects for update using (bucket_id = 'stock-photos');
--   create policy "Public upload tug-photos" on storage.objects for insert with check (bucket_id = 'tug-photos');
--   create policy "Public update tug-photos" on storage.objects for update using (bucket_id = 'tug-photos');
--   commit;
-- ---------------------------------------------------------------------------
