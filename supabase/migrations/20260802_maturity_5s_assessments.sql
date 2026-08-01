-- Form 5S is an append-only audit record. One period may legitimately have
-- more than one assessment, so deliberately do not add a period uniqueness
-- constraint. Apply manually to the self-host database after review.
create table if not exists maturity_5s_assessments (
  id text primary key,
  upt text not null,
  gudang_id text,
  gudang_nama text not null default '',
  bulan smallint not null check (bulan between 1 and 12),
  tahun smallint not null check (tahun between 2000 and 2100),
  auditor text not null default '',
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  sample_photos jsonb not null default '[]'::jsonb check (jsonb_typeof(sample_photos) = 'array'),
  total_items smallint not null check (total_items >= 0),
  total_checked smallint not null check (total_checked between 0 and total_items),
  score_percent numeric(5,2) not null check (score_percent between 0 and 100),
  catatan text not null default '',
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  created_by uuid references profiles(id) on delete set null
);
create index if not exists idx_maturity_5s_assessments_history
  on maturity_5s_assessments(upt, gudang_id, tahun desc, bulan desc, created_at desc);

alter table maturity_5s_assessments enable row level security;
drop policy if exists "Authenticated read maturity_5s_assessments" on maturity_5s_assessments;
drop policy if exists "Authenticated write maturity_5s_assessments" on maturity_5s_assessments;
drop policy if exists "Authenticated insert maturity_5s_assessments" on maturity_5s_assessments;
create policy "Authenticated read maturity_5s_assessments" on maturity_5s_assessments for select using (auth.role() = 'authenticated');
create policy "Authenticated insert maturity_5s_assessments" on maturity_5s_assessments for insert with check (auth.role() = 'authenticated');
revoke update, delete on maturity_5s_assessments from authenticated;
grant select, insert on maturity_5s_assessments to authenticated;
grant all on maturity_5s_assessments to service_role;
