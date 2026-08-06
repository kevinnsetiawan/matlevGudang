-- Verifikasi PASCA-APPLY Gelombang 4c. Read-only, aman dijalankan kapan saja.
--   ssh minipc-gudang-home 'docker exec -i supabase-db psql -U postgres -At' < supabase/verify_gelombang4c.sql
--
-- Setiap baris hasil sudah memuat angka harapannya. Kalau ada yang meleset,
-- skrip pemulihan ada di komentar bawah supabase/migrations/20260806_tutup_tulis_anon_gelombang4c.sql.

\echo '=== 1. GRANT tulis anon di schema public (harus 0 baris) ==='
select table_name || ' | ' || privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');

\echo ''
\echo '=== 2. anon masih punya SELECT pada katalog/tug15_history/stock_current (harus 3 baris) ==='
select table_name
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and privilege_type = 'SELECT'
  and table_name in ('katalog','tug15_history','stock_current')
order by table_name;

\echo ''
\echo '=== 2b. Policy SELECT publik/anon tanpa syarat auth.* — HARUS TEPAT 3 baris:'
\echo '        katalog, tug15_history, stock_current (dipakai ScanPublicView.jsx).'
\echo '        Kalau warnoto_state/forecast_predictions/stock_scan_log muncul di sini,'
\echo '        migration 4c belum ke-apply atau policy-nya belum ganti. ==='
select tablename || ' | ' || policyname || ' | roles=' || array_to_string(roles,',')
from pg_policies
where schemaname = 'public'
  and cmd = 'SELECT'
  and (roles @> array['public']::name[] or roles @> array['anon']::name[])
  and coalesce(qual,'') !~ 'auth\.'
order by tablename, policyname;

\echo ''
\echo '=== 3. Policy tulis publik tanpa syarat auth.* (harus 0 baris) ==='
select tablename || ' | ' || policyname || ' | ' || cmd || ' | roles=' || array_to_string(roles,',')
from pg_policies
where schemaname = 'public'
  and cmd <> 'SELECT'
  and (roles @> array['public']::name[] or roles @> array['anon']::name[])
  and coalesce(qual,'') !~ 'auth\.'
  and coalesce(with_check,'') !~ 'auth\.'
order by tablename, policyname;

\echo ''
\echo '=== 4. ANON — scan QR publik harus tetap hidup ==='
begin;
set local role anon;
select 'katalog=' || (select count(*) from katalog)
    || ' tug15_history=' || (select count(*) from tug15_history)
    || ' stock_current=' || (select count(*) from stock_current)
    || '   [harapan > 0 utk ketiganya]';
rollback;

\echo ''
\echo '=== 5. ANON — tulis harus GAGAL (harapan: ERROR permission denied / RLS) ==='
begin;
set local role anon;
insert into warnoto_state (state_data) values ('{"__verify_4c_probe__":true}'::jsonb);
rollback;

\echo ''
\echo '=== 5b. storage.objects — policy INSERT/UPDATE publik tanpa syarat auth.* (harus 0 baris).'
\echo '        Sebelum 4c: material-photos/stock-photos/tug-photos bisa diupload/ditimpa'
\echo '        anon tanpa login. Baca (SELECT) publik ketiga bucket TETAP ADA, tidak dicek di sini. ==='
select policyname || ' | ' || cmd || ' | roles=' || array_to_string(roles,',')
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and cmd in ('INSERT','UPDATE')
  and (roles @> array['public']::name[] or roles @> array['anon']::name[])
  and coalesce(qual,'') !~ 'auth\.'
  and coalesce(with_check,'') !~ 'auth\.'
order by policyname;

\echo ''
\echo '=== 6. ANON — baca warnoto_state/forecast_predictions/stock_scan_log harus 0 baris'
\echo '        (bukan error — RLS SELECT tanpa policy yang cocok = hasil kosong senyap) ==='
begin;
set local role anon;
select 'warnoto_state=' || (select count(*) from warnoto_state)
    || ' forecast_predictions=' || (select count(*) from forecast_predictions)
    || ' stock_scan_log=' || (select count(*) from stock_scan_log)
    || '   [harapan 0 / 0 / 0]';
rollback;
