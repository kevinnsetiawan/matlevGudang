-- Google Drive remains the binary repository.  These tables hold only stable
-- Drive IDs and audit metadata; no bytes/base64 may be stored in Postgres.
-- This migration is intentionally NOT applied automatically.

-- One canonical audit per UPT/calendar month. Backfill derives its period from
-- the existing millisecond timestamp in Asia/Jakarta; it never rewrites audit
-- scores or workflow status.
alter table maturity_audits add column if not exists period_key text;
-- Keeps the migration-first/deploy-later rollout safe for an older browser
-- bundle that still upserts maturity_audits without period_key.
alter table maturity_audits alter column period_key set default to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM');
alter table maturity_audits add column if not exists score numeric(4,2) not null default 1 check (score between 0 and 5);
update maturity_audits
set period_key = to_char(to_timestamp(created_at / 1000.0) at time zone 'Asia/Jakarta', 'YYYY-MM')
where period_key is null or period_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$';
alter table maturity_audits alter column period_key set not null;
alter table maturity_audits drop constraint if exists maturity_audits_period_key_format;
alter table maturity_audits add constraint maturity_audits_period_key_format check (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
create unique index if not exists idx_maturity_audits_upt_period_key on maturity_audits(upt, period_key);

create table if not exists maturity_audit_events (
  id uuid primary key default gen_random_uuid(),
  audit_id text not null,
  event_type text not null check (event_type in ('AUDIT_CREATED', 'AUDIT_SAVED', 'STATUS_CHANGED', 'TREE_ENSURED', 'EVIDENCE_UPLOADED', 'EVIDENCE_SYNCED', 'EVIDENCE_ASSIGNED', 'EVIDENCE_UNLINKED', 'EVIDENCE_DOWNLOADED')),
  actor_id uuid references profiles(id) on delete set null,
  event_data jsonb not null default '{}'::jsonb,
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint)
);
create index if not exists idx_maturity_audit_events_audit_created on maturity_audit_events(audit_id, created_at desc);
alter table maturity_audit_events drop constraint if exists maturity_audit_events_event_type_check;
alter table maturity_audit_events add constraint maturity_audit_events_event_type_check check (event_type in ('AUDIT_CREATED', 'AUDIT_SAVED', 'STATUS_CHANGED', 'TREE_ENSURED', 'EVIDENCE_UPLOADED', 'EVIDENCE_SYNCED', 'EVIDENCE_ASSIGNED', 'EVIDENCE_UNLINKED', 'EVIDENCE_DOWNLOADED'));

-- Canonical history for every audit write. SECURITY DEFINER is required
-- because authenticated clients intentionally have no direct events-table RLS.
create or replace function public.log_maturity_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.maturity_audit_events (audit_id, event_type, actor_id, event_data)
    values (new.id, 'AUDIT_CREATED', new.updated_by,
      jsonb_build_object('status', new.status, 'score', new.score, 'level', new.level, 'period_key', new.period_key, 'audit_updated_at', new.updated_at));
  else
    insert into public.maturity_audit_events (audit_id, event_type, actor_id, event_data)
    values (new.id,
      case when new.status is distinct from old.status then 'STATUS_CHANGED' else 'AUDIT_SAVED' end,
      new.updated_by,
      jsonb_build_object('status_from', old.status, 'status_to', new.status, 'score_from', old.score, 'score_to', new.score, 'level_from', old.level, 'level_to', new.level, 'period_key', new.period_key, 'audit_updated_at', new.updated_at));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_maturity_audits_events on public.maturity_audits;
create trigger trg_maturity_audits_events
after insert or update on public.maturity_audits
for each row execute function public.log_maturity_audit_event();

-- FK is deliberately omitted: evidence can be uploaded while a new audit is
-- still an unsaved draft in the existing UI.  Its client-generated audit ID is
-- later persisted by maturity_audits without changing the current workflow.
create table if not exists maturity_audit_evidence (
  id uuid primary key default gen_random_uuid(),
  audit_id text not null,
  aspect_id text not null,
  item_id text not null,
  item_label text not null default '',
  category_id text not null default '',
  category_label text not null default '',
  upt text not null,
  drive_file_id text not null unique,
  drive_folder_id text,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check (file_size >= 0),
  md5_checksum text,
  source text not null default 'UPLOAD' check (source in ('UPLOAD', 'SYNC', 'ASSIGN')),
  linked_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  linked_by uuid references profiles(id) on delete set null,
  unlinked_at bigint,
  unlinked_by uuid references profiles(id) on delete set null
);
create unique index if not exists idx_maturity_audit_evidence_active_item
  on maturity_audit_evidence(audit_id, drive_file_id) where unlinked_at is null;
create index if not exists idx_maturity_audit_evidence_audit_aspect
  on maturity_audit_evidence(audit_id, aspect_id) where unlinked_at is null;

create table if not exists maturity_audit_drive_folders (
  id uuid primary key default gen_random_uuid(),
  mapping_key text not null unique,
  audit_id text,
  period_key text,
  folder_type text not null check (folder_type in ('ROOT', 'PERIOD', 'UPT', 'CATEGORY', 'ASPECT', 'ITEM')),
  parent_mapping_key text,
  drive_folder_id text not null unique,
  drive_root_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from now()) * 1000)::bigint)
);
create index if not exists idx_maturity_audit_drive_folders_audit on maturity_audit_drive_folders(audit_id, folder_type);

alter table maturity_audit_events enable row level security;
alter table maturity_audit_evidence enable row level security;
alter table maturity_audit_drive_folders enable row level security;
revoke all on maturity_audit_events, maturity_audit_evidence, maturity_audit_drive_folders from anon, authenticated;
grant all on maturity_audit_events, maturity_audit_evidence, maturity_audit_drive_folders to service_role;
