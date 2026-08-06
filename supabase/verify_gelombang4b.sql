-- VERIFIKASI READ-ONLY Gelombang 4b.
-- Jalankan sebagai postgres/service role setelah migration (tidak mengubah data).
-- Expected: kolom ada + NOT NULL, unresolved/orphan = 0, policy lama hilang,
-- policy scoped aktif, dan tidak ada policy untuk anon/public.

select table_name, column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('stock_opname', 'stock_count')
  and column_name = 'upt_id'
order by table_name;

select
  (select count(*) from public.stock_opname) as stock_opname_rows,
  (select count(*) from public.stock_opname where upt_id is null) as stock_opname_null_upt,
  (select count(*) from public.stock_opname o left join public.upt u on u.id = o.upt_id where u.id is null) as stock_opname_orphan_upt,
  (select count(*) from public.stock_count) as stock_count_rows,
  (select count(*) from public.stock_count where upt_id is null) as stock_count_null_upt,
  (select count(*) from public.stock_count c left join public.upt u on u.id = c.upt_id where u.id is null) as stock_count_orphan_upt;

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'stock_opname', 'stock_count')
order by tablename, policyname;

-- Harus menghasilkan 0: policy RLS scoped hanya untuk authenticated.
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'stock_opname', 'stock_count')
  and ('anon' = any(roles) or 'public' = any(roles));

select indexname, tablename
from pg_indexes
where schemaname = 'public'
  and indexname in ('idx_stock_opname_upt_id', 'idx_stock_count_upt_id');

select conname, conrelid::regclass as table_name, confrelid::regclass as references_table
from pg_constraint
where conname in ('stock_opname_upt_id_fkey', 'stock_count_upt_id_fkey');

-- Negative anon write/read check (manual, no data mutation): gunakan REST anon key
-- dari client tanpa sesi dan pastikan GET/POST/DELETE ke kedua tabel menerima 401/403.
-- Jangan memakai ID/data produksi untuk percobaan write; migration ini sengaja
-- tidak mengeksekusi INSERT di verifier.
