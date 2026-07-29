-- Canonical TUG transactions.  This file is intentionally migration-only:
-- review it and run it on self-host only after an explicit production gate.
-- It does not alter TUG-15 history/reporting.
create extension if not exists pgcrypto;

alter table public.profiles add column if not exists official_phone text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_official_phone_format' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_official_phone_format
      check (official_phone is null or official_phone ~ '^0[0-9]{9,14}$') not valid;
  end if;
end $$;
alter table public.profiles validate constraint profiles_official_phone_format;

-- Seed is deliberately scoped: it never overwrites an existing official contact.
update public.profiles
set official_phone = '081280209297'
where name = 'Widi Ferdian R'
  and role = 'TL'
  and upt_id = 'UPT-SBY'
  and official_phone is null;

create table if not exists public.tug_global_document_counters (
  upt_id text primary key,
  document_unit_code text not null,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);
-- Audited legacy maximum: UPT-SBY official TUG sequence ended at 225 before
-- canonical cutover. Keep a higher existing value on safe reruns.
insert into public.tug_global_document_counters(upt_id,document_unit_code,last_value)
values ('UPT-SBY','SBYA',225)
on conflict (upt_id) do update set
  document_unit_code=coalesce(public.tug_global_document_counters.document_unit_code,excluded.document_unit_code),
  last_value=greatest(public.tug_global_document_counters.last_value,excluded.last_value), updated_at=now();

create table if not exists public.tug_transactions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  doc_type text not null check (doc_type in ('TUG3','TUG5','TUG7','TUG8','TUG9','TUG10')),
  doc_number text not null unique,
  doc_sequence bigint not null,
  upt_id text not null,
  status text not null check (status in ('DRAFT','PENDING','FINAL_APPROVED','REJECTED','CANCELLED','BASELINE_ACCOUNTED','LEGACY_UNVERIFIED')) default 'DRAFT',
  stage text not null,
  version integer not null default 1 check (version > 0),
  document jsonb not null default '{}'::jsonb,
  document_hash text not null,
  identity_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  final_approved_at timestamptz,
  rejected_at timestamptz,
  baseline_accounted_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists tug_transactions_queue_idx on public.tug_transactions(status, stage, upt_id, created_at desc);
create index if not exists tug_transactions_legacy_idx on public.tug_transactions(legacy_id) where legacy_id is not null;

create table if not exists public.tug_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.tug_transactions(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  stock_id text references public.stocks(id) on delete restrict,
  katalog_id text references public.katalog(id) on delete restrict,
  lokasi_id text,
  qty numeric(18,4) not null check (qty > 0),
  unit text,
  snapshot jsonb not null default '{}'::jsonb,
  unique (transaction_id, line_no)
);
create index if not exists tug_items_transaction_idx on public.tug_items(transaction_id);
create index if not exists tug_items_stock_idx on public.tug_items(stock_id) where stock_id is not null;

-- Append-only events include normal approval, review, rejection, and the minimal
-- internal signature evidence.  There is no reusable profile signature here.
create table if not exists public.tug_approvals (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.tug_transactions(id) on delete restrict,
  event_type text not null check (event_type in ('CREATED','SUBMITTED','PREPARED','REVIEWED','APPROVED','REJECTED','DRAWN_ACK')),
  decision text check (decision in ('APPROVE','REJECT')),
  stage text,
  actor_id uuid references public.profiles(id),
  actor_snapshot jsonb not null default '{}'::jsonb,
  document_hash text,
  transaction_version integer,
  review_token uuid,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists tug_approvals_once_per_decision
  on public.tug_approvals(transaction_id, stage, actor_id, decision)
  where decision is not null;
-- A review token first records PREPARED and, after attestations, REVIEWED.
-- Recreate rather than IF NOT EXISTS so rerunning this migration repairs the
-- earlier overly-broad unique index on installations that received it.
drop index if exists public.tug_approvals_review_token_idx;
create unique index tug_approvals_review_token_idx
  on public.tug_approvals(review_token) where review_token is not null and event_type = 'REVIEWED';
create index if not exists tug_approvals_transaction_idx on public.tug_approvals(transaction_id, created_at);

create table if not exists public.tug_review_tokens (
  token uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.tug_transactions(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),
  transaction_version integer not null,
  document_hash text not null,
  stock_snapshot jsonb not null default '[]'::jsonb,
  attestations jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tug_review_tokens_transaction_idx on public.tug_review_tokens(transaction_id, actor_id, expires_at);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.tug_transactions(id) on delete restrict,
  tug_item_id uuid not null references public.tug_items(id) on delete restrict,
  stock_id text not null references public.stocks(id) on delete restrict,
  direction text not null check (direction in ('IN','OUT')),
  qty numeric(18,4) not null check (qty > 0),
  before_qty numeric(18,4) not null,
  after_qty numeric(18,4) not null,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (transaction_id, tug_item_id, direction)
);
create index if not exists stock_movements_stock_idx on public.stock_movements(stock_id, created_at desc);

create table if not exists public.tug_idempotency_keys (
  key uuid primary key,
  operation text not null check (operation in ('CREATE','SUBMIT','DECIDE')),
  actor_id uuid not null references public.profiles(id),
  response jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.tug_global_document_counters enable row level security;
alter table public.tug_transactions enable row level security;
alter table public.tug_items enable row level security;
alter table public.tug_approvals enable row level security;
alter table public.tug_review_tokens enable row level security;
alter table public.stock_movements enable row level security;
alter table public.tug_idempotency_keys enable row level security;

-- Reads are internal.  Writes are exclusively through SECURITY DEFINER RPCs.
do $$ declare t text; begin
  foreach t in array array['tug_global_document_counters','tug_transactions','tug_items','tug_approvals','tug_review_tokens','stock_movements','tug_idempotency_keys'] loop
    execute format('drop policy if exists "Authenticated read %s" on public.%I', t, t);
    execute format('drop policy if exists "No direct write %s" on public.%I', t, t);
    execute format('create policy "Authenticated read %s" on public.%I for select using (auth.role() = ''authenticated'')', t, t);
  end loop;
end $$;

-- Transactions are visible only inside the actor's UPT; SUPERADMIN is the
-- explicit cross-UPT exception. Child/audit rows inherit that boundary.
drop policy if exists "Authenticated read tug_transactions" on public.tug_transactions;
create policy "Authenticated read tug_transactions" on public.tug_transactions for select using (
  auth.uid() is not null and (
    upt_id = (select upt_id from public.profiles where id=auth.uid()) or
    (select role from public.profiles where id=auth.uid()) = 'SUPERADMIN'
  )
);
drop policy if exists "Authenticated read tug_items" on public.tug_items;
create policy "Authenticated read tug_items" on public.tug_items for select using (exists (select 1 from public.tug_transactions t where t.id=transaction_id));
drop policy if exists "Authenticated read tug_approvals" on public.tug_approvals;
create policy "Authenticated read tug_approvals" on public.tug_approvals for select using (exists (select 1 from public.tug_transactions t where t.id=transaction_id));
drop policy if exists "Authenticated read tug_review_tokens" on public.tug_review_tokens;
create policy "Authenticated read tug_review_tokens" on public.tug_review_tokens for select using (actor_id=auth.uid());
drop policy if exists "Authenticated read stock_movements" on public.stock_movements;
create policy "Authenticated read stock_movements" on public.stock_movements for select using (exists (select 1 from public.tug_transactions t where t.id=transaction_id));
drop policy if exists "Authenticated read tug_global_document_counters" on public.tug_global_document_counters;
drop policy if exists "Authenticated read tug_idempotency_keys" on public.tug_idempotency_keys;

create or replace function public.tug_actor()
returns public.profiles
language plpgsql stable security definer set search_path = public
as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'TUG_AUTH_REQUIRED' using errcode = '42501'; end if;
  return p;
end $$;

create or replace function public.tug_assert_upt_scope(p_actor public.profiles, p_upt_id text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_actor.role <> 'SUPERADMIN' and (p_actor.upt_id is null or p_actor.upt_id <> p_upt_id) then
    raise exception 'TUG_UPT_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
end $$;

create or replace function public.tug_hash(p_document jsonb, p_items jsonb, p_doc_number text, p_identity_snapshot jsonb)
returns text language sql immutable as $$
  select encode(digest(coalesce(p_document, '{}'::jsonb)::text || '|' || coalesce(p_items, '[]'::jsonb)::text || '|' || coalesce(p_doc_number,'') || '|' || coalesce(p_identity_snapshot,'{}'::jsonb)::text, 'sha256'), 'hex')
$$;

create or replace function public.tug_doc_code(p_doc_type text)
returns text language sql immutable as $$
  select case when p_doc_type in ('TUG3','TUG10') then 'LOG.00.01' else 'LOG.00.02' end
$$;

-- Keep p_upt_id parameter name for CREATE OR REPLACE compatibility with the
-- earlier scratch function; its value is now the explicit document unit code.
create or replace function public.tug_doc_number(p_seq bigint, p_doc_type text, p_upt_id text, p_at timestamptz default now())
returns text language plpgsql stable as $$
declare suffix text; u text := nullif(p_upt_id,'');
begin
  if u is null then raise exception 'TUG_UPT_REQUIRED'; end if;
  -- FM removes PostgreSQL's padding from RM (otherwise July is `VII `).
  suffix := to_char(p_at at time zone 'Asia/Jakarta', 'FMRM/YYYY');
  if p_doc_type = 'TUG5' then return p_seq::text || '.TUG-5/LOG-' || u || '/' || suffix; end if;
  if p_doc_type = 'TUG7' then return lpad(p_seq::text, 3, '0') || '.TUG7/LOG/UIT-JBM/' || suffix; end if;
  return p_seq::text || '.' || replace(p_doc_type, 'TUG', 'TUG-') || '/' || public.tug_doc_code(p_doc_type) || '/' || u || '/' || suffix;
end $$;

create or replace function public.tug_initial_stage(p_doc_type text, p_actor_role text)
returns text language plpgsql immutable as $$
begin
  if p_doc_type = 'TUG3' then return 'PENDING_TL'; end if;
  if p_doc_type = 'TUG5' then return 'PENDING_ASMAN'; end if;
  if p_doc_type = 'TUG7' then return 'PENDING_MGR_LOGISTIK'; end if;
  if p_doc_type in ('TUG8','TUG9') then return case when p_actor_role='TL' then 'PENDING_ASMAN' else 'PENDING_TL' end; end if;
  return case when p_actor_role = 'ADMIN' then 'PENDING_TL' else 'PENDING_ASMAN' end;
end $$;

create or replace function public.tug_required_role(p_stage text)
returns text language sql immutable as $$
  select case p_stage
    when 'PENDING_TL' then 'TL'
    when 'PENDING_ASMAN' then 'ASMAN'
    when 'PENDING_MANAGER' then 'MANAGER'
    when 'PENDING_MGR_LOGISTIK' then 'MGR_LOGISTIK_UIT'
    when 'PENDING_MGR_ULTG' then 'MGR_ULTG'
    else null end
$$;

create or replace function public.tug_next_stage(p_doc_type text, p_stage text)
returns text language plpgsql immutable as $$
begin
  if p_doc_type = 'TUG3' and p_stage = 'PENDING_TL' then return 'PENDING_MANAGER'; end if;
  if p_doc_type = 'TUG3' and p_stage = 'PENDING_MANAGER' then return 'PENDING_ASMAN'; end if;
  if p_doc_type = 'TUG5' and p_stage = 'PENDING_ASMAN' then return 'PENDING_MANAGER'; end if;
  if p_doc_type in ('TUG8','TUG9') and p_stage = 'PENDING_TL' then return 'PENDING_ASMAN'; end if;
  return 'FINAL_APPROVED';
end $$;

create or replace function public.tug_stock_direction(p_doc_type text)
returns text language sql immutable as $$
  select case when p_doc_type in ('TUG8','TUG9') then 'OUT'
              when p_doc_type in ('TUG3','TUG10') then 'IN'
              else 'NONE' end
$$;

-- Outgoing stock must physically belong to the transaction UPT.  Rows without
-- a location are intentionally rejected rather than guessed into a warehouse.
create or replace function public.tug_assert_outgoing_stock_scope(p_transaction_id uuid, p_upt_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item record;
begin
  for v_item in select stock_id from public.tug_items where transaction_id=p_transaction_id loop
    if v_item.stock_id is null then raise exception 'TUG_LOCATION_REQUIRED'; end if;
    if exists (select 1 from public.stocks st where st.id=v_item.stock_id and st.lokasi_id is null) then
      raise exception 'TUG_LOCATION_REQUIRED';
    end if;
    if not exists (
      select 1 from public.stocks st
      join public.lokasi loc on loc.id=st.lokasi_id
      join public.gudang gd on gd.id=loc.gudang_id
      where st.id=v_item.stock_id and gd.upt_id=p_upt_id
    ) then raise exception 'TUG_STOCK_UPT_MISMATCH'; end if;
  end loop;
end $$;

create or replace function public.tug_create_transaction(
  p_document jsonb,
  p_items jsonb,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare a public.profiles := public.tug_actor(); v_doc_type text := upper(coalesce(p_document->>'docType', ''));
  v_upt_id text := coalesce(nullif(p_document->>'uptId',''), nullif(p_document->>'upt_id',''), a.upt_id);
  v_seq bigint; v_id uuid; v_hash text; v_doc_number text; v_identity jsonb; v_unit_code text;
  v_response jsonb;
begin
  if p_idempotency_key is null then raise exception 'TUG_IDEMPOTENCY_REQUIRED'; end if;
  select response into v_response from public.tug_idempotency_keys where key = p_idempotency_key;
  if v_response is not null then return v_response; end if;
  if v_doc_type not in ('TUG3','TUG5','TUG7','TUG8','TUG9','TUG10') then raise exception 'TUG_DOC_TYPE_INVALID'; end if;
  if v_upt_id is null then raise exception 'TUG_UPT_REQUIRED'; end if;
  perform public.tug_assert_upt_scope(a, v_upt_id);
  if a.role not in ('ADMIN','TL','ADMIN_UIT','ADMIN_ULTG','SUPERADMIN') then raise exception 'TUG_CREATE_FORBIDDEN' using errcode='42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'TUG_ITEMS_REQUIRED'; end if;
  update public.tug_global_document_counters set last_value=last_value+1,updated_at=now() where upt_id=v_upt_id returning last_value,document_unit_code into v_seq,v_unit_code;
  if v_seq is null or v_unit_code is null then raise exception 'TUG_DOCUMENT_UNIT_CONFIG_REQUIRED'; end if;
  v_doc_number := public.tug_doc_number(v_seq,v_doc_type,v_unit_code);
  select coalesce(jsonb_build_object('tl_name',p.name,'tl_phone',p.official_phone,'tl_id',p.id),'{}'::jsonb) into v_identity
  from public.profiles p where p.role='TL' and p.upt_id=v_upt_id order by p.created_at limit 1;
  v_identity := coalesce(v_identity,'{}'::jsonb);
  v_hash := public.tug_hash(p_document, p_items, v_doc_number, v_identity);
  insert into public.tug_transactions(doc_type,doc_number,doc_sequence,upt_id,stage,document,document_hash,identity_snapshot,created_by)
  values(v_doc_type, v_doc_number, v_seq, v_upt_id, 'DRAFT', p_document, v_hash, v_identity, a.id)
  returning id into v_id;
  insert into public.tug_items(transaction_id,line_no,stock_id,katalog_id,lokasi_id,qty,unit,snapshot)
  select v_id, ord::integer, nullif(x.value->>'stockId',''), nullif(x.value->>'katalogId',''), coalesce(nullif(x.value->>'lokasiId',''),nullif(x.value->>'lokasiTujuanId','')), (x.value->>'qty')::numeric, x.value->>'unit', x.value
  from jsonb_array_elements(p_items) with ordinality as x(value,ord);
  if v_doc_type in ('TUG8','TUG9') then perform public.tug_assert_outgoing_stock_scope(v_id,v_upt_id); end if;
  insert into public.tug_approvals(transaction_id,event_type,actor_id,actor_snapshot,document_hash,transaction_version,evidence)
  values(v_id,'CREATED',a.id,jsonb_build_object('name',a.name,'role',a.role,'upt_id',a.upt_id),v_hash,1,jsonb_build_object('internal_signature','approval evidence only; not PSrE certified'));
  v_response := jsonb_build_object('id',v_id,'docNumber',v_doc_number,'docSequence',v_seq,'status','DRAFT','version',1,'identitySnapshot',v_identity);
  insert into public.tug_idempotency_keys(key,operation,actor_id,response) values(p_idempotency_key,'CREATE',a.id,v_response);
  return v_response;
end $$;

create or replace function public.tug_submit_transaction(p_transaction_id uuid, p_expected_version integer, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.profiles := public.tug_actor(); t public.tug_transactions; r jsonb;
begin
  select response into r from public.tug_idempotency_keys where key=p_idempotency_key; if r is not null then return r; end if;
  select * into t from public.tug_transactions where id=p_transaction_id for update;
  if t.id is null or t.created_by <> a.id then raise exception 'TUG_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
  perform public.tug_assert_upt_scope(a, t.upt_id);
  if t.status <> 'DRAFT' or t.version <> p_expected_version then raise exception 'TUG_VERSION_MISMATCH'; end if;
  update public.tug_transactions set status='PENDING', stage=public.tug_initial_stage(t.doc_type,a.role), submitted_at=now(), version=version+1, updated_at=now() where id=t.id returning * into t;
  insert into public.tug_approvals(transaction_id,event_type,stage,actor_id,actor_snapshot,document_hash,transaction_version)
  values(t.id,'SUBMITTED',t.stage,a.id,jsonb_build_object('name',a.name,'role',a.role,'upt_id',a.upt_id),t.document_hash,t.version);
  if t.doc_type in ('TUG8','TUG9') and a.role='TL' then
    insert into public.tug_approvals(transaction_id,event_type,decision,stage,actor_id,actor_snapshot,document_hash,transaction_version,evidence)
    values(t.id,'APPROVED','APPROVE','PENDING_TL',a.id,jsonb_build_object('name',a.name,'role',a.role,'upt_id',a.upt_id),t.document_hash,t.version,jsonb_build_object('explicit_submit_approval',true));
  end if;
  r := jsonb_build_object('id',t.id,'status',t.status,'stage',t.stage,'version',t.version,'docNumber',t.doc_number);
  insert into public.tug_idempotency_keys(key,operation,actor_id,response) values(p_idempotency_key,'SUBMIT',a.id,r); return r;
end $$;

create or replace function public.tug_prepare_review(p_transaction_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.profiles := public.tug_actor(); t public.tug_transactions; snap jsonb; tok uuid;
begin
  select * into t from public.tug_transactions where id=p_transaction_id;
  if t.id is null then raise exception 'TUG_NOT_FOUND'; end if;
  perform public.tug_assert_upt_scope(a, t.upt_id);
  if t.status <> 'PENDING' or t.version <> p_expected_version then raise exception 'TUG_VERSION_MISMATCH'; end if;
  if a.role <> 'SUPERADMIN' and a.role <> public.tug_required_role(t.stage) then raise exception 'TUG_APPROVER_FORBIDDEN' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('stock_id',s.id,'qty',coalesce((s.data->>'qty')::numeric,0)) order by s.id),'[]'::jsonb) into snap
  from public.stocks s join public.tug_items i on i.stock_id=s.id where i.transaction_id=t.id;
  insert into public.tug_review_tokens(transaction_id,actor_id,transaction_version,document_hash,stock_snapshot,expires_at)
  values(t.id,a.id,t.version,t.document_hash,snap,now()+interval '15 minutes') returning token into tok;
  insert into public.tug_approvals(transaction_id,event_type,stage,actor_id,actor_snapshot,document_hash,transaction_version,review_token,evidence)
  values(t.id,'PREPARED',t.stage,a.id,jsonb_build_object('name',a.name,'role',a.role,'upt_id',a.upt_id),t.document_hash,t.version,tok,jsonb_build_object('stock_snapshot',snap));
  return jsonb_build_object(
    'reviewToken',tok,'transactionId',t.id,'version',t.version,'documentHash',t.document_hash,
    'docNumber',t.doc_number,'docType',t.doc_type,'uptId',t.upt_id,'createdBy',t.created_by,
    'stockSnapshot',snap,'expiresAt',now()+interval '15 minutes','stage',t.stage,
    'document',t.document,'identitySnapshot',t.identity_snapshot,
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',item_row.id,'stockId',item_row.stock_id,'katalogId',item_row.katalog_id,'lokasiId',item_row.lokasi_id,'qty',item_row.qty,'unit',item_row.unit,'snapshot',item_row.snapshot) order by item_row.line_no),'[]'::jsonb) from public.tug_items item_row where item_row.transaction_id=t.id),
    'approvalProgress',(select coalesce(jsonb_agg(jsonb_build_object('eventType',a2.event_type,'decision',a2.decision,'stage',a2.stage,'actorId',a2.actor_id,'actor',a2.actor_snapshot,'createdAt',a2.created_at) order by a2.created_at),'[]'::jsonb) from public.tug_approvals a2 where a2.transaction_id=t.id)
  );
end $$;

create or replace function public.tug_decide(
  p_transaction_id uuid, p_expected_version integer, p_decision text, p_review_token uuid default null,
  p_reason text default null, p_idempotency_key uuid default null, p_attestations jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.profiles := public.tug_actor(); t public.tug_transactions; rt public.tug_review_tokens; r jsonb;
  v_next text; v_direction text; i record; v_stock_row public.stocks; v_before numeric; v_after numeric; v_stock_id text;
begin
  if p_decision not in ('APPROVE','REJECT') then raise exception 'TUG_DECISION_INVALID'; end if;
  if p_idempotency_key is null then raise exception 'TUG_IDEMPOTENCY_REQUIRED'; end if;
  select response into r from public.tug_idempotency_keys where key=p_idempotency_key; if r is not null then return r; end if;
  select * into t from public.tug_transactions where id=p_transaction_id for update;
  if t.id is null or t.status <> 'PENDING' or t.version <> p_expected_version then raise exception 'TUG_VERSION_MISMATCH'; end if;
  perform public.tug_assert_upt_scope(a, t.upt_id);
  if a.role <> 'SUPERADMIN' and a.role <> public.tug_required_role(t.stage) then raise exception 'TUG_APPROVER_FORBIDDEN' using errcode='42501'; end if;
  if p_decision='REJECT' and nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'TUG_REJECT_REASON_REQUIRED'; end if;
  if p_decision='REJECT' then
    update public.tug_transactions set status='REJECTED',stage='REJECTED',rejected_at=now(),version=version+1,updated_at=now() where id=t.id returning * into t;
    insert into public.tug_approvals(transaction_id,event_type,decision,stage,actor_id,actor_snapshot,document_hash,transaction_version,reason)
    values(t.id,'REJECTED','REJECT',t.stage,a.id,jsonb_build_object('name',a.name,'role',a.role,'upt_id',a.upt_id),t.document_hash,t.version,p_reason);
    r:=jsonb_build_object('id',t.id,'status',t.status,'stage',t.stage,'version',t.version);
    insert into public.tug_idempotency_keys(key,operation,actor_id,response) values(p_idempotency_key,'DECIDE',a.id,r); return r;
  end if;
  v_next := public.tug_next_stage(t.doc_type,t.stage);
  if v_next='FINAL_APPROVED' then
    select * into rt from public.tug_review_tokens where token=p_review_token and transaction_id=t.id and actor_id=a.id for update;
    if rt.token is null or rt.consumed_at is not null or rt.expires_at < now() or rt.transaction_version<>t.version or rt.document_hash<>t.document_hash then raise exception 'TUG_REVIEW_REQUIRED'; end if;
    if coalesce((p_attestations->>'items')::boolean,false) is not true
       or coalesce((p_attestations->>'parties')::boolean,false) is not true
       or coalesce((p_attestations->>'document')::boolean,false) is not true
       or coalesce((p_attestations->>'impact')::boolean,false) is not true then raise exception 'TUG_ATTESTATIONS_REQUIRED'; end if;
    if public.tug_stock_direction(t.doc_type) = 'OUT' then perform public.tug_assert_outgoing_stock_scope(t.id,t.upt_id); end if;
    -- Lock every explicitly referenced stock row in deterministic order before changing any qty.
    perform 1 from public.stocks st where exists (
      select 1 from public.tug_items ti where ti.transaction_id=t.id and ti.stock_id=st.id
    ) order by st.id for update;
    v_direction:=public.tug_stock_direction(t.doc_type);
    if v_direction <> 'NONE' then
      for i in select * from public.tug_items where transaction_id=t.id order by coalesce(stock_id,''), line_no loop
        v_stock_id:=i.stock_id;
        if v_stock_id is null and v_direction='IN' and i.katalog_id is not null and i.lokasi_id is not null then
          select id into v_stock_id from public.stocks where katalog_id=i.katalog_id and lokasi_id=i.lokasi_id order by id limit 1 for update;
          if v_stock_id is null then
            v_stock_id:='STK-TUG-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
            insert into public.stocks(id,katalog_id,lokasi_id,data,created_at) values(v_stock_id,i.katalog_id,i.lokasi_id,jsonb_build_object('qty',0,'minQty',0,'createdAt',(extract(epoch from now())*1000)::bigint),(extract(epoch from now())*1000)::bigint);
          end if;
        end if;
        if v_stock_id is null then raise exception 'TUG_STOCK_REFERENCE_REQUIRED'; end if;
        select * into v_stock_row from public.stocks where id=v_stock_id for update;
        if v_stock_row.id is null then raise exception 'TUG_STOCK_NOT_FOUND'; end if;
        v_before:=coalesce((v_stock_row.data->>'qty')::numeric,0);
        v_after:=case when v_direction='OUT' then v_before-i.qty else v_before+i.qty end;
        if v_after < 0 then raise exception 'TUG_INSUFFICIENT_STOCK stock_id=% requested=% available=%',v_stock_id,i.qty,v_before; end if;
        insert into public.stock_movements(transaction_id,tug_item_id,stock_id,direction,qty,before_qty,after_qty,actor_id)
        values(t.id,i.id,v_stock_id,v_direction,i.qty,v_before,v_after,a.id);
        update public.stocks set data=jsonb_set(coalesce(data,'{}'::jsonb),'{qty}',to_jsonb(v_after),true) where id=v_stock_id;
      end loop;
    end if;
    update public.tug_review_tokens set consumed_at=now(), attestations=p_attestations where token=rt.token;
    insert into public.tug_approvals(transaction_id,event_type,stage,actor_id,actor_snapshot,document_hash,transaction_version,review_token,evidence)
    values(t.id,'REVIEWED',t.stage,a.id,jsonb_build_object('name',a.name,'role',a.role,'upt_id',a.upt_id),t.document_hash,t.version,rt.token,jsonb_build_object('attestations',p_attestations));
    update public.tug_transactions set status='FINAL_APPROVED',stage='FINAL_APPROVED',final_approved_at=now(),version=version+1,updated_at=now() where id=t.id returning * into t;
  else
    update public.tug_transactions set stage=v_next,version=version+1,updated_at=now() where id=t.id returning * into t;
  end if;
  insert into public.tug_approvals(transaction_id,event_type,decision,stage,actor_id,actor_snapshot,document_hash,transaction_version,evidence)
  values(t.id,'APPROVED','APPROVE',t.stage,a.id,jsonb_build_object('name',a.name,'role',a.role,'upt_id',a.upt_id),t.document_hash,t.version,
    jsonb_build_object('internal_signature','approval evidence only; not PSrE certified','approved_at',now()));
  r:=jsonb_build_object('id',t.id,'status',t.status,'stage',t.stage,'version',t.version,'docNumber',t.doc_number,'stockDirection',public.tug_stock_direction(t.doc_type));
  insert into public.tug_idempotency_keys(key,operation,actor_id,response) values(p_idempotency_key,'DECIDE',a.id,r); return r;
end $$;

-- Legacy imports are deliberately baseline-only: final legacy documents never replay stock.
create or replace function public.tug_import_legacy_baseline(p_legacy_id text, p_document jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.profiles := public.tug_actor(); existing public.tug_transactions; idv uuid; h text; v_doc_number text;
begin
  if a.role not in ('ADMIN','SUPERADMIN') then raise exception 'TUG_LEGACY_IMPORT_FORBIDDEN' using errcode='42501'; end if;
  if nullif(p_document->>'uptId','') is null then raise exception 'TUG_UPT_REQUIRED'; end if;
  perform public.tug_assert_upt_scope(a, p_document->>'uptId');
  select * into existing from public.tug_transactions where legacy_id=p_legacy_id;
  if existing.id is not null then return jsonb_build_object('id',existing.id,'status',existing.status,'deduped',true); end if;
  v_doc_number:=coalesce(p_document->>'docNumber','LEGACY-'||p_legacy_id);
  h:=public.tug_hash(p_document,p_items,v_doc_number,'{}'::jsonb);
  insert into public.tug_transactions(legacy_id,doc_type,doc_number,doc_sequence,upt_id,status,stage,document,document_hash,created_by,baseline_accounted_at)
  values(p_legacy_id,upper(p_document->>'docType'),v_doc_number,0,nullif(p_document->>'uptId',''),'BASELINE_ACCOUNTED','BASELINE_ACCOUNTED',p_document,h,a.id,now()) returning id into idv;
  insert into public.tug_items(transaction_id,line_no,stock_id,katalog_id,lokasi_id,qty,unit,snapshot)
  select idv,ord::integer,nullif(x.value->>'stockId',''),nullif(x.value->>'katalogId',''),nullif(x.value->>'lokasiId',''),(x.value->>'qty')::numeric,x.value->>'unit',x.value from jsonb_array_elements(p_items) with ordinality x(value,ord);
  return jsonb_build_object('id',idv,'status','BASELINE_ACCOUNTED','deduped',false);
end $$;

revoke all on public.tug_global_document_counters, public.tug_transactions, public.tug_items, public.tug_approvals, public.tug_review_tokens, public.stock_movements, public.tug_idempotency_keys from anon, authenticated;
grant select on public.tug_global_document_counters, public.tug_transactions, public.tug_items, public.tug_approvals, public.stock_movements to authenticated;
grant execute on function public.tug_create_transaction(jsonb,jsonb,uuid), public.tug_submit_transaction(uuid,integer,uuid), public.tug_prepare_review(uuid,integer), public.tug_decide(uuid,integer,text,uuid,text,uuid,jsonb), public.tug_import_legacy_baseline(text,jsonb,jsonb) to authenticated;
