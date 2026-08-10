-- Apply hanya setelah persetujuan eksplisit user:
--   ssh minipc-gudang-home 'docker exec -i supabase-db psql -U postgres --single-transaction' < <file>
-- Setelah apply WAJIB verifikasi: select policyname from pg_policies where tablename in
-- ('stock_current','tug15_history','tug_transactions','tug_items','tug_approvals',
--  'tug_review_tokens','stock_movements') — pastikan policy "Public insert/update *" dan
-- "Authenticated read tug_transactions" lama BENAR-BENAR hilang.
--
-- Fase 0 GELOMBANG 4a — isolasi multi-UPT untuk TUG (Tanda Uji Gudang) + stock_current/tug15_history.
-- Idempoten. Tidak mengubah satu baris data pun; hanya mengganti policy RLS.
--
-- KONDISI SEBELUM:
--   - stock_current & tug15_history: SELECT publik (disengaja, lihat poin di bawah) tapi
--     INSERT/UPDATE juga qual=true untuk role public — anon (tanpa login) bisa MENULIS.
--   - tug_transactions: SELECT hanya mengenal profiles.upt_id + SUPERADMIN — akun UIT
--     (ADMIN_UIT/ASMAN_LOG_UIT/MGR_LOGISTIK_UIT), ADMIN_LOG_PUSAT, dan role ULTG BUTA
--     total terhadap data TUG. ini bug, bukan cuma longgar.
--   - tug_items/tug_approvals/tug_review_tokens/stock_movements: SELECT tanpa jangkar UPT
--     sama sekali — siapa pun yang login bisa baca TUG UPT mana pun.
--
-- KEPUTUSAN SENGAJA — JANGAN "DIRAPIKAN":
--   1. Public read stock_current & Public read tug15_history TETAP ADA (tidak di-drop).
--      Dipakai src/components/ScanPublicView.jsx — scan QR di rak pakai anon key tanpa
--      login. Yang ditutup di sini HANYA jalur tulis anon, bukan bacanya.
--   2. stock_current berkunci katalog_id (katalog nasional) dan tug15_history juga tidak
--      punya jangkar UPT — keduanya SENGAJA TIDAK di-scope per UPT di migration ini.
--   3. Tabel tug_* di sini TIDAK diberi policy write sama sekali (sama seperti sebelumnya).
--      Tulis hanya lewat service_role (Edge Function) yang mem-bypass RLS. Menambah policy
--      write di sini akan MEMBUKA jalur yang sekarang tertutup — jangan lakukan.
--   4. tug_idempotency_keys & tug_global_document_counters: RLS enabled, nol policy,
--      dibiarkan apa adanya — di luar cakupan migration ini.
--   5. tug_review_tokens TIDAK disentuh sama sekali. Policy live-nya `actor_id = auth.uid()`
--      sudah lebih ketat daripada jangkar UPT — menggantinya justru melonggarkan. Tabel ini
--      juga tidak punya GRANT untuk anon/authenticated/service_role, jadi sudah tak
--      terjangkau lewat API.
--   6. tug_items & tug_approvals sebelumnya ber-qual `exists (select 1 from tug_transactions
--      t where t.id = ...)`, jadi keduanya sudah MEWARISI isolasi dari RLS tug_transactions —
--      bukan bocor telanjang. Yang ditambah di sini: jangkar UPT eksplisit, sekaligus ikut
--      memperbaiki kebutaan akun UIT/Pusat yang berasal dari policy tug_transactions lama.
--
-- CATATAN TEMUAN (di luar cakupan, jangan dikerjakan di sini): role `anon` punya GRANT
-- DELETE/INSERT/UPDATE/TRUNCATE pada profiles, stock_opname, stock_count, stock_current,
-- dan tug15_history. Yang menahan hanya RLS, jadi satu policy permisif yang keliru di
-- tabel-tabel itu langsung berubah jadi lubang tulis publik. Pengetatan GRANT dipertimbangkan
-- terpisah karena menyentuh semua jalur PostgREST sekaligus.

begin;

-- ---------------------------------------------------------------------------
-- Guard: batalkan migration kalau ada baris yatim di rantai TUG.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tx_null_upt int;
  v_items_orphan int;
  v_approvals_orphan int;
  v_tokens_orphan int;
  v_movements_orphan int;
begin
  select count(*) into v_tx_null_upt from public.tug_transactions where upt_id is null;
  select count(*) into v_items_orphan
    from public.tug_items i
    where not exists (select 1 from public.tug_transactions t where t.id = i.transaction_id);
  select count(*) into v_approvals_orphan
    from public.tug_approvals a
    where not exists (select 1 from public.tug_transactions t where t.id = a.transaction_id);
  select count(*) into v_tokens_orphan
    from public.tug_review_tokens r
    where not exists (select 1 from public.tug_transactions t where t.id = r.transaction_id);
  select count(*) into v_movements_orphan
    from public.stock_movements m
    where not exists (select 1 from public.tug_transactions t where t.id = m.transaction_id);

  if v_tx_null_upt > 0 or v_items_orphan > 0 or v_approvals_orphan > 0
     or v_tokens_orphan > 0 or v_movements_orphan > 0 then
    raise exception
      'Gelombang 4a dibatalkan — baris yatim ditemukan: tug_transactions.upt_id null=%, tug_items->tx hilang=%, tug_approvals->tx hilang=%, tug_review_tokens->tx hilang=%, stock_movements->tx hilang=%',
      v_tx_null_upt, v_items_orphan, v_approvals_orphan, v_tokens_orphan, v_movements_orphan;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. stock_current — tutup tulis anon, baca publik dipertahankan.
-- ---------------------------------------------------------------------------
drop policy if exists "Public insert stock_current" on public.stock_current;
drop policy if exists "Public update stock_current" on public.stock_current;
drop policy if exists "Authenticated insert stock_current" on public.stock_current;
drop policy if exists "Authenticated update stock_current" on public.stock_current;

create policy "Authenticated insert stock_current" on public.stock_current
  for insert to authenticated
  with check (true);

create policy "Authenticated update stock_current" on public.stock_current
  for update to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 2. tug15_history — tutup tulis anon, baca publik dipertahankan.
-- ---------------------------------------------------------------------------
drop policy if exists "Public insert tug15_history" on public.tug15_history;
drop policy if exists "Authenticated insert tug15_history" on public.tug15_history;

create policy "Authenticated insert tug15_history" on public.tug15_history
  for insert to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- 3. tug_transactions — jangkar can_access_upt(upt_id).
--    Perbaikan bug: policy lama buta terhadap UIT/ULTG/ADMIN_LOG_PUSAT.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated read tug_transactions" on public.tug_transactions;
drop policy if exists "Scoped read tug_transactions" on public.tug_transactions;

create policy "Scoped read tug_transactions" on public.tug_transactions
  for select to authenticated
  using (public.can_access_upt(upt_id));

-- ---------------------------------------------------------------------------
-- 4. tug_items — jangkar via transaction_id -> tug_transactions.upt_id.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated read tug_items" on public.tug_items;
drop policy if exists "Scoped read tug_items" on public.tug_items;

create policy "Scoped read tug_items" on public.tug_items
  for select to authenticated
  using (
    exists (
      select 1 from public.tug_transactions t
      where t.id = tug_items.transaction_id
        and public.can_access_upt(t.upt_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. tug_approvals — jangkar via transaction_id -> tug_transactions.upt_id.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated read tug_approvals" on public.tug_approvals;
drop policy if exists "Scoped read tug_approvals" on public.tug_approvals;

create policy "Scoped read tug_approvals" on public.tug_approvals
  for select to authenticated
  using (
    exists (
      select 1 from public.tug_transactions t
      where t.id = tug_approvals.transaction_id
        and public.can_access_upt(t.upt_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 6. tug_review_tokens — SENGAJA TIDAK DISENTUH.
--    Policy live-nya `actor_id = auth.uid()` sudah LEBIH KETAT daripada jangkar UPT:
--    hanya pemilik token yang bisa membacanya. Menggantinya dengan can_access_upt()
--    justru MELONGGARKAN (semua orang se-UPT bisa melihat token review orang lain).
--    Dibiarkan apa adanya.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 7. stock_movements — jangkar via transaction_id -> tug_transactions.upt_id.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated read stock_movements" on public.stock_movements;
drop policy if exists "Scoped read stock_movements" on public.stock_movements;

create policy "Scoped read stock_movements" on public.stock_movements
  for select to authenticated
  using (
    exists (
      select 1 from public.tug_transactions t
      where t.id = stock_movements.transaction_id
        and public.can_access_upt(t.upt_id)
    )
  );

commit;
