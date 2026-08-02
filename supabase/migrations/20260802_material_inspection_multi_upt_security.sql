-- PROPOSAL ONLY — jangan dijalankan ke self-host production tanpa persetujuan user.
-- Idempoten: mengeraskan scope Inspeksi Material Cadang per UPT/gudang tanpa
-- mengubah data BA/item/foto yang sudah ada.

alter table public.profiles add column if not exists gudang_ids jsonb;

create or replace function public.can_access_material_inspection_scope(p_upt_id text, p_gudang_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and (
        actor.role = 'SUPERADMIN'
        or (
          p_upt_id is not null
          and p_gudang_id is not null
          and exists (select 1 from public.gudang g where g.id = p_gudang_id and g.upt_id = p_upt_id)
          and (
            actor.gudang_ids is null
            or (
              jsonb_typeof(actor.gudang_ids) = 'array'
              and (jsonb_array_length(actor.gudang_ids) = 0 or actor.gudang_ids ? p_gudang_id)
            )
          )
          and (
            actor.upt_id = p_upt_id
            or (actor.uit_id is not null and exists (select 1 from public.upt u where u.id = p_upt_id and u.uit_id = actor.uit_id))
            or (actor.ultg_id is not null and exists (select 1 from public.ultg ul where ul.id = actor.ultg_id and ul.upt_id = p_upt_id))
          )
        )
      )
  );
$$;
revoke all on function public.can_access_material_inspection_scope(text, text) from public;
grant execute on function public.can_access_material_inspection_scope(text, text) to authenticated;

alter table public.material_inspection_batches enable row level security;
alter table public.material_inspections enable row level security;
drop policy if exists "Authenticated read material_inspection_batches" on public.material_inspection_batches;
drop policy if exists "Authenticated read material_inspections" on public.material_inspections;
create policy "Authenticated read material_inspection_batches" on public.material_inspection_batches
  for select to authenticated using (public.can_access_material_inspection_scope(upt_id, gudang_id));
create policy "Authenticated read material_inspections" on public.material_inspections
  for select to authenticated using (
    exists (
      select 1 from public.material_inspection_batches b
      where b.id = material_inspections.batch_id
        and public.can_access_material_inspection_scope(b.upt_id, b.gudang_id)
    )
  );

create or replace function public.create_material_inspection_batch(p_items jsonb, p_header jsonb)
returns jsonb as $$
declare
  v_inspector uuid := auth.uid();
  v_upt text := nullif(p_header->>'upt_id', '');
  v_actor_upt text;
  v_actor_gudang_ids jsonb;
  v_tanggal date := coalesce((p_header->>'tanggal')::date, now()::date);
  v_gudang text := nullif(p_header->>'gudang_id', '');
  v_count int;
  v_seq bigint;
  v_nomor text;
  v_batch_id uuid;
  v_items jsonb;
begin
  if v_inspector is null then
    raise exception 'Tidak terautentikasi.';
  end if;
  if not exists (select 1 from public.profiles where id = v_inspector and role in ('ADMIN', 'TL')) then
    raise exception 'Hanya ADMIN/TL yang boleh membuat BA inspeksi.';
  end if;
  select upt_id, gudang_ids into v_actor_upt, v_actor_gudang_ids
  from public.profiles where id = v_inspector;
  if v_actor_upt is null or v_upt is null or v_upt <> v_actor_upt then
    raise exception 'UPT BA harus sama dengan UPT profil pemeriksa.';
  end if;
  if v_gudang is null or not exists (
    select 1 from public.gudang g where g.id = v_gudang and g.upt_id = v_actor_upt
  ) then
    raise exception 'Gudang BA tidak ditemukan pada UPT pemeriksa.';
  end if;
  if v_actor_gudang_ids is not null and (
    jsonb_typeof(v_actor_gudang_ids) <> 'array'
    or (jsonb_array_length(v_actor_gudang_ids) > 0 and not (v_actor_gudang_ids ? v_gudang))
  ) then
    raise exception 'Gudang BA tidak diizinkan untuk pemeriksa ini.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Daftar material tidak valid.';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 10 then
    raise exception 'Satu BA harus berisi 1 sampai 10 material (diterima %).', v_count;
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where nullif(e.value->>'stock_id', '') is null) then
    raise exception 'Setiap material wajib punya stock_id.';
  end if;
  if (select count(distinct e.value->>'stock_id') from jsonb_array_elements(p_items) e) <> v_count then
    raise exception 'Material duplikat dalam satu BA tidak diperbolehkan.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where not exists (select 1 from public.stocks s where s.id = e.value->>'stock_id')
  ) then
    raise exception 'Ada stock_id yang tidak ditemukan di data stok.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    join public.stocks s on s.id = e.value->>'stock_id'
    left join public.lokasi l on l.id = s.lokasi_id
    left join public.gudang g on g.id = l.gudang_id
    where g.id is null or g.id <> v_gudang or g.upt_id <> v_actor_upt
  ) then
    raise exception 'Setiap material harus berada pada gudang dan UPT BA yang dipilih.';
  end if;

  insert into public.material_inspection_seq (upt_id, tahun, last_seq)
  values (v_upt, extract(year from v_tanggal)::int, 1)
  on conflict (upt_id, tahun) do update set last_seq = material_inspection_seq.last_seq + 1
  returning last_seq into v_seq;
  v_nomor := lpad(v_seq::text, 6, '0') || '/BA-INSPEKSI/' || v_upt || '/'
    || to_char(v_tanggal, 'MM') || '/' || to_char(v_tanggal, 'YYYY');
  insert into public.material_inspection_batches (nomor_ba, upt_id, gudang_id, tanggal, inspector_id, data)
  values (v_nomor, v_upt, v_gudang, v_tanggal, v_inspector, coalesce(p_header, '{}'::jsonb))
  returning id into v_batch_id;
  with inserted as (
    insert into public.material_inspections (batch_id, stock_id, katalog_id, lokasi_id, inspector_id, data)
    select v_batch_id, s.id, s.katalog_id, s.lokasi_id, v_inspector, e.value - 'stock_id'
    from jsonb_array_elements(p_items) e
    join public.stocks s on s.id = e.value->>'stock_id'
    returning id, batch_id, stock_id, katalog_id, lokasi_id, inspector_id, data, created_at
  )
  select coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb) into v_items from inserted;
  return jsonb_build_object('batch_id', v_batch_id, 'nomor_ba', v_nomor, 'items', v_items);
end;
$$ language plpgsql security definer set search_path = public;
revoke all on function public.create_material_inspection_batch(jsonb, jsonb) from public;
grant execute on function public.create_material_inspection_batch(jsonb, jsonb) to authenticated;

drop policy if exists "Authenticated read material-inspection-photos" on storage.objects;
create policy "Authenticated read material-inspection-photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'material-inspection-photos'
    and exists (
      select 1
      from public.material_inspections mi
      join public.material_inspection_batches b on b.id = mi.batch_id
      where coalesce(mi.data->'photoPaths', '[]'::jsonb) ? name
        and public.can_access_material_inspection_scope(b.upt_id, b.gudang_id)
    )
  );
