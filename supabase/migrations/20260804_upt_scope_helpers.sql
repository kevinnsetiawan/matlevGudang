-- Gelombang 1 (fondasi isolasi multi-UPT), 2026-08-04.
-- Helper SQL scope UPT — HANYA definisi fungsi, TIDAK ada create/drop policy atau DDL lain
-- di file ini. Belum dipakai policy mana pun; pemakaiannya (mengganti policy RLS tabel
-- operasional) menyusul di gelombang berikutnya. Pola diikuti dari
-- public.can_access_material_inspection_scope (lihat supabase/schema.sql).

create or replace function public.can_access_upt(p_upt_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from profiles actor
    where actor.id = auth.uid()
      and (
        actor.role = 'SUPERADMIN'
        or actor.role = 'ADMIN_LOG_PUSAT'
        or (
          p_upt_id is not null
          and (
            actor.upt_id = p_upt_id
            or (
              actor.role in ('ADMIN_UIT','ASMAN_LOG_UIT','MGR_LOGISTIK_UIT')
              and actor.uit_id is not null
              and exists (select 1 from upt u where u.id = p_upt_id and u.uit_id = actor.uit_id)
            )
            or (
              actor.role in ('ADMIN_ULTG','MGR_ULTG')
              and actor.ultg_id is not null
              and exists (select 1 from ultg ul where ul.id = actor.ultg_id and ul.upt_id = p_upt_id)
            )
          )
        )
      )
  );
$$;
revoke all on function public.can_access_upt(text) from public;
grant execute on function public.can_access_upt(text) to authenticated;

-- Untuk tabel yang menyimpan NAMA UPT (bukan id): heavy_equipment.upt, attb_list.upt,
-- warehouse_capacity.upt, heavy_equipment_loans.owner_upt. Resolve nama -> id lalu
-- delegasikan ke can_access_upt (tidak menduplikasi logika role).
create or replace function public.can_access_upt_nama(p_upt_nama text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_access_upt(
    (select u.id from upt u where u.data->>'nama' = p_upt_nama limit 1)
  );
$$;
revoke all on function public.can_access_upt_nama(text) from public;
grant execute on function public.can_access_upt_nama(text) to authenticated;
