-- Verifikasi PASCA-APPLY Gelombang 4a. Read-only, aman dijalankan kapan saja.
--   ssh minipc-gudang-home 'docker exec -i supabase-db psql -U postgres -At' < supabase/verify_gelombang4a.sql
--
-- Setiap baris hasil sudah memuat angka harapannya. Kalau ada yang meleset,
-- skrip pemulihan ada di komentar bawah file ini.

\echo '=== 1. POLICY SEKARANG ==='
select tablename || ' | ' || policyname || ' | ' || cmd || ' | roles=' || array_to_string(roles,',')
from pg_policies
where tablename in ('stock_current','tug15_history','tug_transactions','tug_items','tug_approvals','stock_movements')
order by tablename, policyname;

\echo ''
\echo '=== 2. SISA POLICY LAMA (harus 0) ==='
select count(*) from pg_policies
where tablename in ('stock_current','tug15_history')
  and policyname like 'Public %' and cmd <> 'SELECT';

\echo ''
\echo '=== 3. ANON — scan QR publik harus tetap hidup ==='
begin;
set local role anon;
select 'stock_current=' || (select count(*) from stock_current)
    || ' tug15_history=' || (select count(*) from tug15_history)
    || '   [harapan 253 / 13]';
rollback;

\echo ''
\echo '=== 4. VIEWER UPT-SBY ==='
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7d1f3ef2-c227-4f01-a161-8e2dc65c27c3","role":"authenticated"}',true);
select 'tug_transactions=' || (select count(*) from tug_transactions)
    || ' tug_items=' || (select count(*) from tug_items)
    || ' tug_approvals=' || (select count(*) from tug_approvals)
    || ' stock_movements=' || (select count(*) from stock_movements)
    || '   [harapan 3 / 4 / 38 / 2]';
rollback;

\echo ''
\echo '=== 5. ADMIN_LOG_PUSAT — sebelum 4a angkanya 0 (bug), sesudah harus 3 ==='
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"3437604b-8a4d-45e9-9966-d741428460aa","role":"authenticated"}',true);
select 'tug_transactions=' || (select count(*) from tug_transactions) || '   [harapan 3]';
rollback;

\echo ''
\echo '=== 6. ASMAN_LOG_UIT — idem ==='
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"1dd25b70-18c6-4ee6-b3fc-bb5b4d970ac9","role":"authenticated"}',true);
select 'tug_transactions=' || (select count(*) from tug_transactions) || '   [harapan 3]';
rollback;

-- ---------------------------------------------------------------------------
-- PEMULIHAN DARURAT (kembalikan policy persis seperti sebelum 4a):
--
--   begin;
--   drop policy if exists "Authenticated insert stock_current" on public.stock_current;
--   drop policy if exists "Authenticated update stock_current" on public.stock_current;
--   drop policy if exists "Authenticated insert tug15_history" on public.tug15_history;
--   drop policy if exists "Scoped read tug_transactions" on public.tug_transactions;
--   drop policy if exists "Scoped read tug_items" on public.tug_items;
--   drop policy if exists "Scoped read tug_approvals" on public.tug_approvals;
--   drop policy if exists "Scoped read stock_movements" on public.stock_movements;
--   create policy "Public insert stock_current" on public.stock_current for insert with check (true);
--   create policy "Public update stock_current" on public.stock_current for update using (true);
--   create policy "Public insert tug15_history" on public.tug15_history for insert with check (true);
--   create policy "Authenticated read tug_transactions" on public.tug_transactions for select
--     using (auth.uid() is not null and ((upt_id = (select upt_id from profiles where id = auth.uid()))
--            or ((select role from profiles where id = auth.uid()) = 'SUPERADMIN')));
--   create policy "Authenticated read tug_items" on public.tug_items for select
--     using (exists (select 1 from tug_transactions t where t.id = tug_items.transaction_id));
--   create policy "Authenticated read tug_approvals" on public.tug_approvals for select
--     using (exists (select 1 from tug_transactions t where t.id = tug_approvals.transaction_id));
--   create policy "Authenticated read stock_movements" on public.stock_movements for select
--     using (exists (select 1 from tug_transactions t where t.id = stock_movements.transaction_id));
--   commit;
-- ---------------------------------------------------------------------------
