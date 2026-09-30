-- F09 additive foundation. Applying this does NOT enable a worker or replay mail.
-- Cutover must first stop ALL legacy processors (manual, automatic, internal).
begin;
alter table public.erp_email_queue
  add column lease_owner uuid,
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column dispatch_started_at timestamptz,
  add column delivery_state text,
  add column paused_at timestamptz,
  add column intent_key text;

create unique index erp_email_queue_intent_key on public.erp_email_queue(intent_key)
  where intent_key is not null;
create index erp_email_queue_f09_due on public.erp_email_queue(scheduled_for, id)
  where status = 'pending' and deleted_at is null and paused_at is null;
create index erp_email_queue_f09_leases on public.erp_email_queue(lease_expires_at)
  where status = 'processing' and lease_token is not null;

-- Append-only events: claim, dispatch and outcome are distinct facts. No message
-- bodies, recipients, credentials or raw provider error strings belong here.
create table public.erp_email_attempt_events (
  id bigint generated always as identity primary key,
  queue_id bigint not null references public.erp_email_queue(id),
  attempt_number integer not null check (attempt_number > 0),
  lease_token uuid not null,
  event text not null check (event in ('claimed','dispatching','accepted','retry','permanent','unknown','cancelled','lease_expired')),
  correlation_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique (lease_token, event)
);
alter table public.erp_email_attempt_events enable row level security;
revoke all on public.erp_email_attempt_events from public, anon, authenticated, service_role;
grant select, insert on public.erp_email_attempt_events to service_role;
grant usage on sequence public.erp_email_attempt_events_id_seq to service_role;
create index erp_email_attempt_events_queue on public.erp_email_attempt_events(queue_id, id);

-- SECURITY INVOKER: only the machine service role can call these functions.
-- Keep claims short; external provider calls always happen after commit.
create function public.f09_claim_email(p_owner uuid, p_id bigint default null, p_module text default null)
returns setof public.erp_email_queue language plpgsql security invoker set search_path = '' as $$
declare q public.erp_email_queue;
begin
  if p_owner is null then raise exception 'worker owner is required'; end if;
  select * into q from public.erp_email_queue e
    where e.status = 'pending' and e.deleted_at is null and e.cancelled_at is null
      and e.paused_at is null and e.scheduled_for <= clock_timestamp()
      and (e.next_retry_at is null or e.next_retry_at <= clock_timestamp())
      and e.attempt_count < e.max_attempts
      and (p_id is null or e.id = p_id) and (p_module is null or e.source_module = p_module)
    order by case e.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      greatest(e.scheduled_for, coalesce(e.next_retry_at, e.scheduled_for)), e.id
    limit 1 for update skip locked;
  if not found then return; end if;
  update public.erp_email_queue e set status='processing', lease_owner=p_owner,
    lease_token=gen_random_uuid(), lease_expires_at=clock_timestamp()+interval '120 seconds',
    dispatch_started_at=null, processing_started_at=clock_timestamp(),
    attempt_count=e.attempt_count+1, updated_at=clock_timestamp()
    where e.id=q.id returning * into q;
  insert into public.erp_email_attempt_events(queue_id,attempt_number,lease_token,event)
    values(q.id,q.attempt_count,q.lease_token,'claimed');
  return next q;
end $$;

create function public.f09_begin_email_dispatch(p_id bigint,p_owner uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare q public.erp_email_queue;
begin
  update public.erp_email_queue e set dispatch_started_at=clock_timestamp(),updated_at=clock_timestamp()
    where e.id=p_id and e.status='processing' and e.lease_owner=p_owner and e.lease_token=p_token
      and e.lease_expires_at>clock_timestamp() and e.dispatch_started_at is null
      and e.deleted_at is null and e.cancelled_at is null and e.paused_at is null
    returning * into q;
  if not found then return false; end if;
  insert into public.erp_email_attempt_events(queue_id,attempt_number,lease_token,event,correlation_id)
    values(q.id,q.attempt_count,q.lease_token,'dispatching',q.lease_token);
  return true;
end $$;

create function public.f09_finish_email(p_id bigint,p_owner uuid,p_token uuid,p_outcome text,
  p_retry_after timestamptz default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare q public.erp_email_queue; retry_at timestamptz; actual text;
begin
  if p_outcome is null or p_outcome not in ('accepted','retry','permanent','unknown','cancelled') then
    raise exception 'invalid email outcome'; end if;
  select * into q from public.erp_email_queue e where e.id=p_id and e.status='processing'
    and e.lease_owner=p_owner and e.lease_token=p_token and e.lease_expires_at>clock_timestamp()
    for update;
  if not found then return false; end if;
  if p_outcome in ('accepted','unknown') and q.dispatch_started_at is null then
    raise exception 'outcome requires a dispatch marker'; end if;
  if p_outcome='cancelled' and q.dispatch_started_at is not null then
    raise exception 'cannot cancel dispatched mail'; end if;
  actual := case when p_outcome='retry' and q.attempt_count>=q.max_attempts then 'permanent' else p_outcome end;
  if actual='retry' then
    retry_at := greatest(clock_timestamp()+
      (case when q.attempt_count=1 then 300 when q.attempt_count=2 then 900
        when q.attempt_count=3 then 3600 when q.attempt_count=4 then 14400 else 86400 end)*interval '1 second',
      coalesce(p_retry_after,clock_timestamp()));
  end if;
  update public.erp_email_queue set
    status=case actual when 'accepted' then 'sent' when 'retry' then 'pending'
      when 'unknown' then 'delivery_unknown' when 'cancelled' then 'cancelled' else 'failed' end,
    delivery_state=case actual when 'accepted' then 'provider_accepted' when 'unknown' then 'unknown' else null end,
    sent_at=case when actual='accepted' then clock_timestamp() else sent_at end,
    cancelled_at=case when actual='cancelled' then clock_timestamp() else cancelled_at end,
    next_retry_at=retry_at,last_error=case actual when 'accepted' then null else 'F09:'||actual end,
    lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where id=q.id;
  insert into public.erp_email_attempt_events(queue_id,attempt_number,lease_token,event,correlation_id)
    values(q.id,q.attempt_count,p_token,actual,case when q.dispatch_started_at is not null then p_token end);
  return true;
end $$;

create function public.f09_reap_email_leases(p_limit integer default 100)
returns integer language plpgsql security invoker set search_path = '' as $$
declare q public.erp_email_queue; n integer:=0; new_status text;
begin
  if p_limit is null or p_limit<1 or p_limit>500 then raise exception 'invalid reap limit'; end if;
  for q in select * from public.erp_email_queue e where e.status='processing'
    and e.lease_token is not null and e.lease_expires_at<=clock_timestamp()
    order by e.lease_expires_at limit p_limit for update skip locked loop
    new_status := case when q.dispatch_started_at is not null then 'delivery_unknown'
      when q.cancelled_at is not null or q.deleted_at is not null then 'cancelled'
      when q.attempt_count>=q.max_attempts then 'failed' else 'pending' end;
    update public.erp_email_queue set status=new_status,
      delivery_state=case when new_status='delivery_unknown' then 'unknown' else null end,
      next_retry_at=case when new_status='pending' then clock_timestamp()+interval '5 minutes' end,
      last_error='F09:lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,
      updated_at=clock_timestamp() where id=q.id;
    insert into public.erp_email_attempt_events(queue_id,attempt_number,lease_token,event)
      values(q.id,q.attempt_count,q.lease_token,'lease_expired');
    n:=n+1;
  end loop;
  return n;
end $$;

revoke all on function public.f09_claim_email(uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.f09_begin_email_dispatch(bigint,uuid,uuid) from public,anon,authenticated;
revoke all on function public.f09_finish_email(bigint,uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.f09_reap_email_leases(integer) from public,anon,authenticated;
grant execute on function public.f09_claim_email(uuid,bigint,text) to service_role;
grant execute on function public.f09_begin_email_dispatch(bigint,uuid,uuid) to service_role;
grant execute on function public.f09_finish_email(bigint,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.f09_reap_email_leases(integer) to service_role;
commit;
