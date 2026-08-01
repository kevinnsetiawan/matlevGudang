-- Delta setelah 20260802_maturity_drive_evidence.sql yang sudah diterapkan.
-- Tidak mengubah struktur folder Drive; hanya mengunci ownership/scope dan
-- menambah state pemulihan assignment yang canonical.

alter table maturity_audits add column if not exists upt_id text references upt(id) on delete restrict;
alter table maturity_audits add column if not exists created_by uuid references profiles(id) on delete set null;
update maturity_audits audit
set upt_id = unit.id
from upt unit
where audit.upt_id is null and unit.data->>'nama' = audit.upt;
update maturity_audits set created_by = updated_by where created_by is null;
alter table maturity_audits alter column upt_id set not null;
-- Actor columns remain nullable so deleting a profile can preserve the audit
-- under the existing ON DELETE SET NULL contract. The RPC/trigger still
-- require actor attribution for every new application write.
alter table maturity_audits alter column created_by drop not null;
drop index if exists idx_maturity_audits_upt_period_key;
create unique index if not exists idx_maturity_audits_upt_id_period_key on maturity_audits(upt_id, period_key);

alter table maturity_audit_evidence add column if not exists upt_id text references upt(id) on delete restrict;
update maturity_audit_evidence evidence
set upt_id = audit.upt_id
from maturity_audits audit
where evidence.upt_id is null and evidence.audit_id = audit.id;
alter table maturity_audit_evidence alter column upt_id set not null;
alter table maturity_audit_evidence add column if not exists assignment_state text not null default 'ACTIVE';
alter table maturity_audit_evidence drop constraint if exists maturity_audit_evidence_assignment_state_check;
alter table maturity_audit_evidence add constraint maturity_audit_evidence_assignment_state_check check (assignment_state in ('ACTIVE', 'NEEDS_REPAIR'));

create table if not exists maturity_audit_drive_unassigned (
  id uuid primary key default gen_random_uuid(),
  audit_id text not null references maturity_audits(id) on delete cascade,
  upt_id text not null references upt(id) on delete restrict,
  period_key text not null check (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  drive_root_id text not null,
  drive_file_id text not null,
  source_folder_id text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check (file_size >= 0),
  md5_checksum text,
  assignment_state text not null default 'UNASSIGNED' check (assignment_state in ('UNASSIGNED', 'ASSIGNING', 'ACTIVE', 'NEEDS_REPAIR')),
  target_folder_id text,
  target_aspect_id text,
  target_item_id text,
  target_item_label text,
  target_category_id text,
  target_category_label text,
  assigned_by uuid references profiles(id) on delete set null,
  assigned_at bigint,
  last_error text,
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  unique (audit_id, drive_file_id)
);
create index if not exists idx_maturity_drive_unassigned_scope
  on maturity_audit_drive_unassigned(audit_id, upt_id, period_key, assignment_state);
alter table maturity_audit_drive_unassigned enable row level security;
revoke all on maturity_audit_drive_unassigned from anon, authenticated;
grant all on maturity_audit_drive_unassigned to service_role;

-- Browser REST writes receive actor IDs only from the authenticated JWT.
create or replace function public.set_maturity_audit_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_maturity_audits_actor on public.maturity_audits;
create trigger trg_maturity_audits_actor
before insert or update on public.maturity_audits
for each row execute function public.set_maturity_audit_actor();

-- Service-role Edge requests supply an actor only after JWT verification.
-- The audit insert and its AUDIT_CREATED trigger event commit atomically.
create or replace function public.create_maturity_drive_stub(
  p_audit_id text,
  p_upt_id text,
  p_period_key text,
  p_created_at bigint,
  p_actor_id uuid
)
returns table(id text, upt text, upt_id text, uit_id text, status text, created_at bigint, period_key text, score numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_upt text;
  v_uit_id text;
begin
  select unit.data->>'nama', unit.uit_id into v_upt, v_uit_id
  from public.upt unit where unit.id = p_upt_id;
  if v_upt is null then raise exception 'UPT tidak ditemukan' using errcode = '22023'; end if;
  begin
    insert into public.maturity_audits (
      id, data, created_at, updated_at, upt, upt_id, period_key, status,
      level, score, created_by, updated_by
    ) values (
      p_audit_id,
      jsonb_build_object('id', p_audit_id, 'upt', v_upt, 'uptId', p_upt_id, 'status', 'DRAFT', 'level', 1, 'score', 1, 'periodKey', p_period_key, 'createdAt', p_created_at, 'updatedAt', p_created_at, 'evidence', '{}'::jsonb, 'maturityDriveDraft', true),
      p_created_at, p_created_at, v_upt, p_upt_id, p_period_key, 'DRAFT',
      1, 1, p_actor_id, p_actor_id
    );
  exception when unique_violation then
    if exists (select 1 from public.maturity_audits where upt_id = p_upt_id and period_key = p_period_key and id <> p_audit_id) then
      raise exception 'UPT ini sudah memiliki audit Maturity untuk periode %.', p_period_key using errcode = '23505';
    end if;
  end;
  return query
  select a.id, a.upt, a.upt_id, unit.uit_id, a.status, a.created_at, a.period_key, a.score
  from public.maturity_audits a join public.upt unit on unit.id = a.upt_id
  where a.id = p_audit_id;
end;
$$;
revoke all on function public.create_maturity_drive_stub(text,text,text,bigint,uuid) from public;
grant execute on function public.create_maturity_drive_stub(text,text,text,bigint,uuid) to service_role;
