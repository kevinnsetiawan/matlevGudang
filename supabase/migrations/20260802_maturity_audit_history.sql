-- Maturity audit history canonical storage. Apply manually to the self-host DB;
-- this repository change intentionally does not execute SQL remotely.
create table if not exists maturity_audit_history (
  id text primary key,
  upt text not null,
  tahun smallint not null check (tahun between 2000 and 2100),
  semester smallint not null check (semester in (1, 2)),
  score numeric(4,2) not null check (score between 0 and 5),
  status text not null check (status in ('ARSIP', 'FINAL', 'BERJALAN')),
  source text not null default 'HISTORIS_TERVERIFIKASI',
  notes text not null default '',
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  updated_by uuid references profiles(id) on delete set null,
  unique (upt, tahun, semester)
);
create index if not exists idx_maturity_audit_history_upt_period on maturity_audit_history(upt, tahun desc, semester desc);

alter table maturity_audit_history enable row level security;
drop policy if exists "Authenticated read maturity_audit_history" on maturity_audit_history;
drop policy if exists "Authenticated write maturity_audit_history" on maturity_audit_history;
create policy "Authenticated read maturity_audit_history" on maturity_audit_history for select using (auth.role() = 'authenticated');
create policy "Authenticated write maturity_audit_history" on maturity_audit_history for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on maturity_audit_history to authenticated;
grant all on maturity_audit_history to service_role;

insert into maturity_audit_history (id, upt, tahun, semester, score, status, source) values
  ('MAH-UPT-SBY-2024-S1', 'UPT Surabaya', 2024, 1, 3.58, 'ARSIP', 'HISTORIS_TERVERIFIKASI'),
  ('MAH-UPT-SBY-2024-S2', 'UPT Surabaya', 2024, 2, 3.74, 'ARSIP', 'HISTORIS_TERVERIFIKASI'),
  ('MAH-UPT-SBY-2025-S1', 'UPT Surabaya', 2025, 1, 3.86, 'FINAL', 'HISTORIS_TERVERIFIKASI'),
  ('MAH-UPT-SBY-2025-S2', 'UPT Surabaya', 2025, 2, 4.12, 'FINAL', 'HISTORIS_TERVERIFIKASI'),
  ('MAH-UPT-SBY-2026-S1', 'UPT Surabaya', 2026, 1, 4.26, 'BERJALAN', 'HISTORIS_TERVERIFIKASI')
on conflict (upt, tahun, semester) do nothing;
