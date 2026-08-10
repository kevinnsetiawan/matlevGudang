-- Fase 0 GELOMBANG 4b — Stock Opname/Count + profil scoped read.
-- Draft saja: jangan apply sebelum review dan persetujuan user.
-- Idempoten, satu transaksi, tidak mengubah isi JSONB/data bisnis.
--
-- URUTAN WAJIB:
--   1. deploy kode frontend yang sudah melakukan schema probe read-only;
--   2. jalankan migration ini;
--   3. verifikasi supabase/verify_gelombang4b.sql;
--   4. reload browser dan uji akun UPT/UIT/Pusat.
--
-- ROLLBACK darurat (manual, hanya bila verifikasi gagal):
--   begin;
--   drop policy if exists "Scoped read stock_opname" on public.stock_opname;
--   drop policy if exists "Scoped write stock_opname" on public.stock_opname;
--   drop policy if exists "Scoped read stock_count" on public.stock_count;
--   drop policy if exists "Scoped write stock_count" on public.stock_count;
--   create policy "Authenticated read stock_opname" on public.stock_opname for select using (auth.role() = 'authenticated');
--   create policy "Authenticated write stock_opname" on public.stock_opname for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
--   create policy "Authenticated read stock_count" on public.stock_count for select using (auth.role() = 'authenticated');
--   create policy "Authenticated write stock_count" on public.stock_count for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
--   commit;
--   (Kolom upt_id dan NOT NULL tidak dihapus otomatis; rollback RLS tidak
--    mengembalikan data/schema dan harus diputuskan terpisah.)

begin;

do $$
begin
  if to_regprocedure('public.can_access_upt(text)') is null then
    raise exception 'Gelombang 4b membutuhkan public.can_access_upt(text) dari migration Gelombang 1';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Kolom typed + backfill dari actor pada JSONB.
-- ---------------------------------------------------------------------------
alter table public.stock_opname add column if not exists upt_id text;
alter table public.stock_count add column if not exists upt_id text;

-- Regex mencegah cast UUID gagal bila cache lama berisi actor non-UUID.
update public.stock_opname o
set upt_id = p.upt_id
from public.profiles p
where o.upt_id is null
  and nullif(trim(o.data->>'dibuatOleh'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and p.id = (o.data->>'dibuatOleh')::uuid;

update public.stock_count c
set upt_id = p.upt_id
from public.profiles p
where c.upt_id is null
  and nullif(trim(c.data->>'uploadedBy'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and p.id = (c.data->>'uploadedBy')::uuid;

-- Jangan membuat NOT NULL/policy setengah jadi. Satu baris unresolved = batal
-- seluruh migration; caller harus memperbaiki actor/profile lalu menjalankan ulang.
do $$
declare
  v_opname_null integer;
  v_count_null integer;
  v_opname_orphan integer;
  v_count_orphan integer;
begin
  select count(*) into v_opname_null from public.stock_opname where upt_id is null;
  select count(*) into v_count_null from public.stock_count where upt_id is null;
  select count(*) into v_opname_orphan
    from public.stock_opname o
    left join public.upt u on u.id = o.upt_id
    where u.id is null;
  select count(*) into v_count_orphan
    from public.stock_count c
    left join public.upt u on u.id = c.upt_id
    where u.id is null;
  if v_opname_null > 0 or v_count_null > 0
     or v_opname_orphan > 0 or v_count_orphan > 0 then
    raise exception
      'Gelombang 4b dibatalkan — upt_id unresolved/orphan: stock_opname null=% orphan=%, stock_count null=% orphan=%',
      v_opname_null, v_opname_orphan, v_count_null, v_count_orphan;
  end if;
end $$;

alter table public.stock_opname alter column upt_id set not null;
alter table public.stock_count alter column upt_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_opname_upt_id_fkey'
      and conrelid = 'public.stock_opname'::regclass
  ) then
    alter table public.stock_opname
      add constraint stock_opname_upt_id_fkey
      foreign key (upt_id) references public.upt(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_count_upt_id_fkey'
      and conrelid = 'public.stock_count'::regclass
  ) then
    alter table public.stock_count
      add constraint stock_count_upt_id_fkey
      foreign key (upt_id) references public.upt(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_stock_opname_upt_id on public.stock_opname (upt_id);
create index if not exists idx_stock_count_upt_id on public.stock_count (upt_id);

-- ---------------------------------------------------------------------------
-- 2. Profil read helper + policy.
--    Self-read selalu lolos. Pusat/SUPERADMIN nasional; UIT membaca profil
--    dalam UIT-nya; user UPT membaca profil UPT yang sama. Tidak ada write policy.
-- ---------------------------------------------------------------------------
create or replace function public.can_read_profile(
  p_profile_id uuid,
  p_upt_id text,
  p_uit_id text
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and (
        actor.id = p_profile_id
        or actor.role in ('SUPERADMIN', 'ADMIN_LOG_PUSAT')
        or (
          actor.role in ('ADMIN_UIT', 'ASMAN_LOG_UIT', 'MGR_LOGISTIK_UIT')
          and actor.uit_id is not null
          and actor.uit_id = p_uit_id
        )
        or public.can_access_upt(p_upt_id)
      )
  );
$$;
revoke all on function public.can_read_profile(uuid, text, text) from public;
grant execute on function public.can_read_profile(uuid, text, text) to authenticated;

alter table public.profiles enable row level security;
drop policy if exists "Authenticated read profiles" on public.profiles;
drop policy if exists "Scoped read profiles" on public.profiles;
create policy "Scoped read profiles" on public.profiles
  for select to authenticated
  using (public.can_read_profile(id, upt_id, uit_id));

-- ---------------------------------------------------------------------------
-- 3. RLS Stock Opname/Count — read/write hanya actor yang punya UPT scope.
-- ---------------------------------------------------------------------------
alter table public.stock_opname enable row level security;
alter table public.stock_count enable row level security;

drop policy if exists "Authenticated read stock_opname" on public.stock_opname;
drop policy if exists "Authenticated write stock_opname" on public.stock_opname;
drop policy if exists "Scoped read stock_opname" on public.stock_opname;
drop policy if exists "Scoped write stock_opname" on public.stock_opname;
create policy "Scoped read stock_opname" on public.stock_opname
  for select to authenticated
  using (public.can_access_upt(upt_id));
create policy "Scoped write stock_opname" on public.stock_opname
  for all to authenticated
  using (public.can_access_upt(upt_id))
  with check (public.can_access_upt(upt_id));

drop policy if exists "Authenticated read stock_count" on public.stock_count;
drop policy if exists "Authenticated write stock_count" on public.stock_count;
drop policy if exists "Scoped read stock_count" on public.stock_count;
drop policy if exists "Scoped write stock_count" on public.stock_count;
create policy "Scoped read stock_count" on public.stock_count
  for select to authenticated
  using (public.can_access_upt(upt_id));
create policy "Scoped write stock_count" on public.stock_count
  for all to authenticated
  using (public.can_access_upt(upt_id))
  with check (public.can_access_upt(upt_id));

commit;
