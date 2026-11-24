begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Operators configure this separately from the runtime. A saved discovery cursor
-- continues to advance when there is no intake policy or intake is disabled.
create table erp_private.agent_pdf_policy (
  connection_id uuid primary key references erp_private.agent_connections(id),
  company_id bigint not null references public.owner_companies(id),
  actor_id bigint not null references public.user_profiles(id),
  officer_id bigint not null references public.user_profiles(id),
  from_time timestamptz not null,
  enabled boolean not null default false,
  check (actor_id <> officer_id)
);

create table erp_private.agent_pdf_work (
  connection_id uuid not null,
  item_id text not null,
  version text not null,
  operation_id uuid not null unique default gen_random_uuid(),
  company_id bigint not null,
  actor_id bigint not null,
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'retry' check (status in ('retry','duplicate','review_pending','reviewed','held')),
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts smallint not null default 0,
  session_id bigint references public.dms_upload_sessions(id),
  review_id bigint references public.dms_review_queue(id),
  reason text,
  primary key (connection_id, item_id, version),
  foreign key (connection_id,item_id,version) references erp_private.agent_source_versions(connection_id,item_id,version)
);

create index agent_pdf_work_due on erp_private.agent_pdf_work (connection_id,next_attempt_at) where status='retry';
create index agent_pdf_discovery_order on erp_private.agent_source_versions (connection_id,discovered_at,item_id,version)
  where mime='application/pdf';
alter table erp_private.agent_pdf_policy enable row level security;
alter table erp_private.agent_pdf_work enable row level security;
revoke all on erp_private.agent_pdf_policy, erp_private.agent_pdf_work from public,anon,authenticated,service_role,erp_agent_discovery_runtime;

create function erp_private.claim_agent_pdf(p_connection uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  policy erp_private.agent_pdf_policy%rowtype;
  work erp_private.agent_pdf_work%rowtype;
begin
  select p.* into policy from erp_private.agent_pdf_policy p
    join erp_private.agent_connections c on c.id=p.connection_id
    join erp_private.agent_sync_checkpoints s on s.connection_id=c.id
    where c.id=p_connection and c.runtime_login=session_user and p.enabled and not s.paused
    for update of p skip locked;
  if not found then return null; end if;
  if exists (select 1 from erp_private.agent_pdf_work
    where connection_id=p_connection and status='retry' and lease_until>now()) then return null; end if;

  select * into work from erp_private.agent_pdf_work
    where connection_id=p_connection and status='retry' and next_attempt_at<=now()
    order by next_attempt_at,item_id,version limit 1 for update;
  if not found then
    insert into erp_private.agent_pdf_work (connection_id,item_id,version,company_id,actor_id)
      select v.connection_id,v.item_id,v.version,policy.company_id,policy.actor_id
      from erp_private.agent_source_versions v
      join erp_private.agent_source_items i using(connection_id,item_id,version)
      where v.connection_id=p_connection and v.mime='application/pdf' and v.discovered_at>=policy.from_time
        and i.available and not exists (
          select 1 from erp_private.agent_pdf_work w
          where (w.connection_id,w.item_id,w.version)=(v.connection_id,v.item_id,v.version))
      order by v.discovered_at,v.item_id,v.version limit 1 returning * into work;
    if not found then return null; end if;
  end if;
  update erp_private.agent_pdf_work
    set lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes'
    where operation_id=work.operation_id returning * into work;
  return jsonb_build_object('operation_id',work.operation_id,'item_id',work.item_id,
    'version',work.version,'lease_token',work.lease_token);
end $$;

create function erp_private.advance_agent_pdf(
  p_connection uuid,p_operation uuid,p_lease uuid,p_step text,p_hash text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  policy erp_private.agent_pdf_policy%rowtype;
  work erp_private.agent_pdf_work%rowtype;
  intake public.dms_upload_sessions%rowtype;
  new_review_id bigint;
  current_pdf boolean;
  state text;
  detail text;
begin
  select p.* into policy from erp_private.agent_pdf_policy p
    join erp_private.agent_connections c on c.id=p.connection_id
    join erp_private.agent_sync_checkpoints s on s.connection_id=c.id
    where c.id=p_connection and c.runtime_login=session_user and p.enabled and not s.paused for share of p;
  if not found then return 'paused'; end if;
  select * into work from erp_private.agent_pdf_work
    where connection_id=p_connection and operation_id=p_operation and lease_token=p_lease and lease_until>now()
      and status='retry' for update;
  if not found then return 'stale'; end if;
  if (work.company_id,work.actor_id) is distinct from (policy.company_id,policy.actor_id) then
    return 'paused';
  end if;

  select exists (select 1 from erp_private.agent_source_items i
     join erp_private.agent_source_versions v using(connection_id,item_id,version)
     where (i.connection_id,i.item_id,i.version)=(work.connection_id,work.item_id,work.version) and i.available
       and v.mime='application/pdf' and v.size_bytes between 1 and 3145728) into current_pdf;
  if p_step='fence' then
    return case when current_pdf and work.sha256 is not null then 'ready' else 'stale' end;
  end if;

  if work.sha256 is not null then
    select s.* into intake from erp_private.f07_single_upload_admissions a
       join public.dms_upload_sessions s on s.id=a.upload_session_id
       where a.actor_id=work.actor_id and a.operation_id=work.operation_id for update of s;
  end if;

  if intake.id is not null and (intake.uploaded_by is distinct from work.actor_id or
     intake.owning_company_id is distinct from work.company_id or intake.owning_branch_id is not null or
     intake.sha256_hash is distinct from work.sha256 or intake.origin_entity_type is not null) then
    state:='held'; detail:='intake_binding_mismatch';
  elsif intake.id is not null and (intake.deleted_at is not null or intake.status in ('cancelled','expired')) then
    state:='held'; detail:='intake_no_longer_available';
  elsif intake.document_id is not null or intake.intake_status in ('approved','rejected') then
    state:='reviewed';
  elsif intake.intake_status in ('review_pending','review_in_progress')
     and exists (select 1 from public.dms_ai_extraction_results r
       where r.id=intake.ai_result_id and r.upload_session_id=intake.id and r.ai_status='pending_review') then
    if not exists (select 1 from public.user_profiles u where u.id=policy.officer_id and u.status='active')
       or not exists (select 1 from public.erp_ai_feature_flags f where f.feature_code='DMS_AI_REVIEW' and f.is_enabled) then
      p_step:='defer';
    else
      -- Use the ERP review assignment trigger and existing notification delivery.
      insert into public.dms_review_queue (
        upload_session_id,ai_result_id,assigned_to,assigned_at,status,priority,review_type,source_type,source_id,
        idempotency_key,reason_code,reason_message,created_by)
      values (intake.id,intake.ai_result_id,policy.officer_id,now(),'assigned','normal','intake_metadata_review',
        'intake',intake.id::text,'sharepoint-agent:'||intake.id,'sharepoint_intake_ready',
        'A SharePoint PDF completed AI Fill and is ready for officer review.',work.actor_id)
      returning id into new_review_id;
      state:='review_pending';
    end if;
  elsif intake.intake_status in ('failed','ocr_failed','ai_failed') then
    state:='held'; detail:='intake_processing_failed';
  elsif intake.intake_status in ('ocr_processing','ai_processing') then
    if p_step <> 'defer' then return 'waiting'; end if;
  elsif not current_pdf or p_step='invalid_pdf' then
    state:='held'; detail:='source_changed_or_unsupported';
  elsif p_step='inspect' then
    return 'download';
  elsif p_step='prepare' then
    if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or (work.sha256 is not null and work.sha256<>p_hash) then
      state:='held'; detail:='source_fingerprint_mismatch';
    elsif exists (select 1 from public.dms_document_files f join public.dms_documents d on d.id=f.document_id
      where f.sha256_hash=p_hash and f.file_role='original' and f.deleted_at is null and d.deleted_at is null
        and d.owning_company_id=work.company_id)
      or exists (select 1 from public.dms_upload_sessions s
        where s.sha256_hash=p_hash and s.owning_company_id=work.company_id and s.deleted_at is null
          and s.status not in ('cancelled','expired') and s.expires_at>now()
          and s.id is distinct from intake.id) then
      state:='duplicate'; detail:='existing_dms_fingerprint';
    else
      update erp_private.agent_pdf_work set sha256=p_hash where operation_id=p_operation;
      return 'ready';
    end if;
  elsif p_step is distinct from 'defer' then
    raise exception 'Invalid intake step' using errcode='22023';
  end if;

  if state is null and p_step='defer' then
    if work.attempts<7 then
      update erp_private.agent_pdf_work set attempts=attempts+1, lease_token=null, lease_until=null,
        next_attempt_at=now()+interval '2 minutes' where operation_id=p_operation;
      return 'deferred';
    end if;
    state:='held'; detail:='retry_limit';
  end if;
  update erp_private.agent_pdf_work set status=state,reason=detail,session_id=intake.id,
    review_id=new_review_id,lease_token=null,lease_until=null where operation_id=p_operation;
  return state;
end $$;

revoke all on function erp_private.claim_agent_pdf(uuid),
  erp_private.advance_agent_pdf(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function erp_private.claim_agent_pdf(uuid),
  erp_private.advance_agent_pdf(uuid,uuid,uuid,text,text) to erp_agent_discovery_runtime;

commit;
