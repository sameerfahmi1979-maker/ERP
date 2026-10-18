-- F09 forward integration after F08. Supersedes the five deferred Sep 30 files.
-- Stop all legacy producers/consumers before applying. This does not enable workers.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Reviewed predecessor: 20260930095218_f09_email_queue_leases.sql
-- F09 additive foundation. Applying this does NOT enable a worker or replay mail.
-- Cutover must first stop ALL legacy processors (manual, automatic, internal).

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

-- Reviewed predecessor: 20260930100400_f09_atomic_schedule_slot.sql
-- F09 slot reservation, not worker activation. Stop legacy schedule workers at
-- cutover. Existing successful runs and delivery history are never rewritten.

create function public.f09_reserve_schedule_slot(p_schedule_id bigint,
  p_expected_due timestamptz, p_expected_updated_at timestamptz, p_next_due timestamptz)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare s public.erp_report_schedules; run_id bigint; slot_key text;
begin
  if p_expected_due is null or p_expected_updated_at is null or p_next_due is null
    or not isfinite(p_expected_due) or not isfinite(p_next_due)
    or p_next_due<=p_expected_due then raise exception 'invalid schedule slot'; end if;
  select * into s from public.erp_report_schedules e where e.id=p_schedule_id
    and e.next_run_at=p_expected_due and e.updated_at=p_expected_updated_at
    and e.is_active and e.deleted_at is null and e.next_run_at<=clock_timestamp()
    for update skip locked;
  if not found then return null; end if;
  slot_key := 'sched-'||s.id::text||'-'||floor(extract(epoch from p_expected_due)*1000)::bigint::text;
  insert into public.erp_report_schedule_runs(schedule_id,scheduled_for,run_key,status,next_attempt_at)
    values(s.id,p_expected_due,slot_key,'failed_retryable',clock_timestamp())
    on conflict(run_key) do nothing returning id into run_id;
  if run_id is null then
    -- Reconcile the legacy split-write failure: preserve the existing run and
    -- repair its original pointer, regardless of whether the run already sent.
    select id into run_id from public.erp_report_schedule_runs where run_key=slot_key
      and schedule_id=s.id and scheduled_for=p_expected_due;
    if run_id is null then raise exception 'schedule key conflict'; end if;
  end if;
  update public.erp_report_schedules set next_run_at=p_next_due,updated_at=clock_timestamp() where id=s.id;
  -- An UPDATE failure rolls back the reservation in this same transaction.
  return run_id;
end $$;
revoke all on function public.f09_reserve_schedule_slot(bigint,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.f09_reserve_schedule_slot(bigint,timestamptz,timestamptz,timestamptz) to service_role;

-- Reviewed predecessor: 20260930102553_f09_delivery_adapter_integration.sql
-- F09 integration: pause legacy consumers before applying. No worker is enabled here.



-- Full uniqueness permits PostgREST ignore-duplicate INSERT without a predicate.
drop index public.erp_email_queue_intent_key;
create unique index erp_email_queue_intent_key on public.erp_email_queue(intent_key);
-- Never let the rollout flag implicitly replay unresolved legacy mail. A release
-- operator must reconcile and explicitly approve any individual backlog release.
update public.erp_email_queue set paused_at=coalesce(paused_at,clock_timestamp())
 where status in ('pending','processing','failed') and deleted_at is null;
alter table public.erp_email_queue
  add column report_schedule_run_id bigint references public.erp_report_schedule_runs(id),
  add column source_revision text;
create unique index f09_queue_schedule_run on public.erp_email_queue(report_schedule_run_id)
  where report_schedule_run_id is not null;
alter table public.erp_report_schedule_runs add column delivery_engine text;
alter table public.erp_report_schedule_runs drop constraint chk_schedule_run_status;
alter table public.erp_report_schedule_runs add constraint chk_schedule_run_status check (
 status in ('queued','leased','running','succeeded','skipped','failed_retryable','failed_terminal'));
-- Explicitly distinguish new reservations from unresolved historical retry jobs.
alter table public.erp_report_schedule_runs alter column delivery_engine set default 'f09';
alter table public.erp_report_delivery_logs add column email_queue_id bigint references public.erp_email_queue(id);
create unique index f09_report_delivery_queue on public.erp_report_delivery_logs(email_queue_id);
alter table public.erp_report_delivery_logs drop constraint erp_report_delivery_logs_delivery_status_check;
alter table public.erp_report_delivery_logs add constraint erp_report_delivery_logs_delivery_status_check
 check(delivery_status in ('queued','sent','failed','cancelled','provider_accepted','delivery_unknown'));

create function public.f09_schedule_revision(s public.erp_report_schedules)
returns text language sql immutable security invoker set search_path='' as $$
 select md5(jsonb_build_array(s.report_id,s.created_by,s.owner_company_id,s.filters_json,
   s.selected_template_id,s.output_format,s.recipient_to,s.recipient_cc,
   s.email_subject_template,s.email_body_template,s.is_active,s.deleted_at)::text);
$$;
revoke all on function public.f09_schedule_revision(public.erp_report_schedules) from public,anon,authenticated;
grant execute on function public.f09_schedule_revision(public.erp_report_schedules) to service_role;

-- Browser clients must use permission-checked actions, never forge trusted producers,
-- worker state, principals or recipients via the Data API.
-- Adopt only unambiguous historical notification intent identities. Preserve
-- their status, provider evidence, payload and timestamps; never resend them.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.erp_email_queue WHERE notification_id IS NOT NULL GROUP BY notification_id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'F09 requires review of ambiguous historical notification intents before cutover'; END IF;
END $$;
UPDATE public.erp_email_queue SET intent_key='notification-'||notification_id
 WHERE notification_id IS NOT NULL AND intent_key IS NULL;
CREATE UNIQUE INDEX f09_queue_notification_intent ON public.erp_email_queue(notification_id) WHERE notification_id IS NOT NULL;
revoke insert,update,delete,truncate,references,trigger on public.erp_email_queue from public,anon,authenticated;
do $$ declare c record; begin
 for c in select column_name from information_schema.columns
   where table_schema='public' and table_name='erp_email_queue' loop
   execute format('revoke insert (%I), update (%I), references (%I) on public.erp_email_queue from public,anon,authenticated',
     c.column_name,c.column_name,c.column_name);
 end loop;
end $$;
create function public.f09_freeze_email_payload()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-array['status','processing_started_at','sent_at','cancelled_at','attempt_count',
 'next_retry_at','last_error','external_message_id','updated_at','deleted_at','lease_owner',
 'lease_token','lease_expires_at','dispatch_started_at','delivery_state','paused_at'])
 is distinct from
 (to_jsonb(old)-array['status','processing_started_at','sent_at','cancelled_at','attempt_count',
 'next_retry_at','last_error','external_message_id','updated_at','deleted_at','lease_owner',
 'lease_token','lease_expires_at','dispatch_started_at','delivery_state','paused_at']) then
   raise exception 'Email intent is immutable; cancel and create a new intent' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.f09_freeze_email_payload() from public,anon,authenticated;
create trigger f09_email_payload before update on public.erp_email_queue
 for each row execute function public.f09_freeze_email_payload();

-- Reserve manual requests idempotently without advancing the recurring pointer.
create function public.f09_manual_schedule_run(p_schedule_id bigint,p_request_id uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare s public.erp_report_schedules; rid bigint;
begin
 if p_request_id is null then raise exception 'Request key required'; end if;
 select * into s from public.erp_report_schedules where id=p_schedule_id and is_active and deleted_at is null for update;
 if not found then return null; end if;
 insert into public.erp_report_schedule_runs(schedule_id,scheduled_for,run_key,status,next_attempt_at,delivery_engine)
 values(s.id,clock_timestamp(),'manual-'||s.id||'-'||p_request_id,'failed_retryable',clock_timestamp(),'f09')
 on conflict(run_key) do nothing returning id into rid;
 if rid is null then select id into rid from public.erp_report_schedule_runs
   where run_key='manual-'||s.id||'-'||p_request_id and schedule_id=s.id; end if;
 return rid;
end $$;

-- One durable intent per new-engine run, including repair after response loss.
create function public.f09_enqueue_schedule_run(p_run_id bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare r public.erp_report_schedule_runs; s public.erp_report_schedules; qid bigint;
begin
 select * into r from public.erp_report_schedule_runs where id=p_run_id for update;
 if not found or r.delivery_engine is distinct from 'f09' then return null; end if;
 select id into qid from public.erp_email_queue where report_schedule_run_id=r.id;
 if qid is not null then return qid; end if;
 if r.status<>'failed_retryable' or r.attempt_count<>0 then return null; end if;
 select * into s from public.erp_report_schedules where id=r.schedule_id and is_active and deleted_at is null for share;
 if not found then
   update public.erp_report_schedule_runs set status='skipped',failure_reason='F09:source_unavailable',
     finished_at=clock_timestamp() where id=r.id;
   return null;
 end if;
 insert into public.erp_email_queue(source_module,source_entity_type,source_entity_id,
   report_schedule_run_id,source_revision,intent_key,created_by,to_emails,cc_emails,subject,text_body,max_attempts)
 values('REPORTS','erp_report_schedules',s.id,r.id,public.f09_schedule_revision(s),'report-run-'||r.id,
   s.created_by,s.recipient_to,s.recipient_cc,'Scheduled report','Generated by the authorized report adapter',r.max_attempts)
 returning id into qid;
 update public.erp_report_schedule_runs set status='queued',next_attempt_at=null where id=r.id;
 return qid;
end $$;

-- This projection participates in the queue transaction. Projection/log errors roll
-- back finalization; a dispatched expired lease becomes unknown, never blind resend.
create function public.f09_project_report_delivery()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.erp_report_schedule_runs; log_id bigint;
begin
 if new.report_schedule_run_id is null then return new; end if;
 update public.erp_report_schedule_runs set
   status=case new.status when 'processing' then 'running' when 'sent' then 'succeeded'
     when 'pending' then 'failed_retryable' when 'cancelled' then 'skipped' else 'failed_terminal' end,
   attempt_count=new.attempt_count,next_attempt_at=new.next_retry_at,
   leased_by=new.lease_owner::text,leased_until=new.lease_expires_at,
   started_at=coalesce(started_at,new.processing_started_at),
   finished_at=case when new.status in ('sent','cancelled','failed','delivery_unknown') then clock_timestamp() else null end,
   failure_reason=case when new.status='sent' then 'F09:provider_accepted_not_delivery_confirmation'
     when new.status='delivery_unknown' then 'F09:delivery_unknown_manual_reconciliation' else new.last_error end
 where id=new.report_schedule_run_id returning * into r;
 if new.status is distinct from old.status and new.status<>'processing' then
   insert into public.erp_report_delivery_logs(email_queue_id,run_id,delivery_type,
     recipient_to,recipient_cc,attachment_filename,attachment_size_bytes,provider,
     delivery_status,provider_response_code,success,sent_at,error_message,created_by)
   values(new.id,r.report_run_id,'scheduled_email',new.to_emails,new.cc_emails,
     r.attachment_filename,r.attachment_size_bytes,'microsoft_graph',
     case new.status when 'sent' then 'provider_accepted' when 'delivery_unknown' then 'delivery_unknown'
       when 'pending' then 'queued' when 'cancelled' then 'cancelled' else 'failed' end,
     case when new.status='sent' then '202' end,new.status='sent',new.sent_at,r.failure_reason,new.created_by)
   on conflict(email_queue_id) do update set run_id=excluded.run_id,delivery_status=excluded.delivery_status,
     attachment_filename=excluded.attachment_filename,attachment_size_bytes=excluded.attachment_size_bytes,
     provider_response_code=excluded.provider_response_code,success=excluded.success,
     sent_at=excluded.sent_at,error_message=excluded.error_message
   returning id into log_id;
   update public.erp_report_schedule_runs set delivery_log_id=log_id where id=r.id;
   if new.status in ('sent','failed','cancelled','delivery_unknown') then
     update public.erp_report_schedules set last_run_at=clock_timestamp(),
       last_status=case new.status when 'sent' then 'success' when 'cancelled' then 'cancelled' else 'failed' end
       where id=r.schedule_id;
   end if;
 end if;
 return new;
end $$;
revoke all on function public.f09_project_report_delivery() from public,anon,authenticated;
create trigger f09_report_delivery after update on public.erp_email_queue
 for each row execute function public.f09_project_report_delivery();

-- Existing notification history remains populated. Canonical immutable attempt
-- events remain the authority; this compatibility log never stores message bodies.
create function public.f09_project_notification_delivery()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status<>'processing'
   and (old.status='processing' or new.status='cancelled') then
  insert into public.erp_notification_delivery_logs(notification_id,email_queue_id,provider_config_id,
   delivery_channel,status,message,attempt_number,metadata_json,created_by)
  values(new.notification_id,new.id,new.provider_config_id,'email',
   case new.status when 'sent' then 'provider_accepted' when 'pending' then 'retry_scheduled' else new.status end,
   case new.status when 'sent' then 'Provider accepted; inbox delivery is not confirmed.' else 'F09 queue outcome' end,
   new.attempt_count,jsonb_build_object('engine','f09','lease_token',old.lease_token),new.created_by);
 end if;
 return new;
end $$;
revoke all on function public.f09_project_notification_delivery() from public,anon,authenticated;
create trigger f09_notification_delivery after update on public.erp_email_queue
 for each row execute function public.f09_project_notification_delivery();

create function public.f09_cancel_email(p_id bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed bigint;
begin
 update public.erp_email_queue set status='cancelled',cancelled_at=clock_timestamp(),
   updated_at=clock_timestamp(),lease_owner=null,lease_token=null,lease_expires_at=null
 where id=p_id and deleted_at is null and dispatch_started_at is null
   and status in ('pending','processing') returning id into changed;
 return changed is not null;
end $$;

-- Retry button cannot bypass provider cooldown, claim budget, cancellation or
-- uncertain/permanent outcomes. It only confirms an already retryable intent.
create function public.f09_retry_email(p_id bigint)
returns boolean language sql security invoker set search_path='' as $$
 select exists(select 1 from public.erp_email_queue where id=p_id and status='pending'
   and last_error='F09:retry' and deleted_at is null and cancelled_at is null and paused_at is null
   and attempt_count<max_attempts);
$$;
revoke all on function public.f09_manual_schedule_run(bigint,uuid),
 public.f09_enqueue_schedule_run(bigint),public.f09_cancel_email(bigint),public.f09_retry_email(bigint)
 from public,anon,authenticated;
grant execute on function public.f09_manual_schedule_run(bigint,uuid),
 public.f09_enqueue_schedule_run(bigint),public.f09_cancel_email(bigint),public.f09_retry_email(bigint)
 to service_role;

-- Recheck the source snapshot atomically at the last pre-network transition.
create or replace function public.f09_begin_email_dispatch(p_id bigint,p_owner uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.erp_email_queue;
begin
 update public.erp_email_queue e set dispatch_started_at=clock_timestamp(),updated_at=clock_timestamp()
 where e.id=p_id and e.status='processing' and e.lease_owner=p_owner and e.lease_token=p_token
   and e.lease_expires_at>clock_timestamp() and e.dispatch_started_at is null
   and e.deleted_at is null and e.cancelled_at is null and e.paused_at is null
   and (e.report_schedule_run_id is null or exists(
     select 1 from public.erp_report_schedules s where s.id=e.source_entity_id
       and s.is_active and s.deleted_at is null and public.f09_schedule_revision(s)=e.source_revision))
 returning * into q;
 if not found then return false; end if;
 insert into public.erp_email_attempt_events(queue_id,attempt_number,lease_token,event,correlation_id)
 values(q.id,q.attempt_count,q.lease_token,'dispatching',q.lease_token);
 return true;
end $$;
create function public.f09_schedule_is_current(p_id bigint,p_revision text)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.erp_report_schedules s where s.id=p_id and s.is_active
   and s.deleted_at is null and public.f09_schedule_revision(s)=p_revision);
$$;
revoke all on function public.f09_schedule_is_current(bigint,text) from public,anon,authenticated;
grant execute on function public.f09_schedule_is_current(bigint,text) to service_role;
create function public.f09_record_report_preparation(p_id bigint,p_owner uuid,p_token uuid,
 p_report_run_id bigint,p_filename text,p_size integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.erp_email_queue;
begin
 if p_size is null or p_size<0 or p_size>3000000 or p_report_run_id is null then
   raise exception 'Invalid prepared report metadata'; end if;
 select * into q from public.erp_email_queue where id=p_id and status='processing'
   and lease_owner=p_owner and lease_token=p_token and lease_expires_at>clock_timestamp()
   and dispatch_started_at is null and report_schedule_run_id is not null for update;
 if not found then return false; end if;
 update public.erp_report_schedule_runs set report_run_id=p_report_run_id,
   attachment_filename=p_filename,attachment_size_bytes=p_size,
   recipient_count=cardinality(q.to_emails)+coalesce(cardinality(q.cc_emails),0)
   where id=q.report_schedule_run_id;
 return true;
end $$;
revoke all on function public.f09_record_report_preparation(bigint,uuid,uuid,bigint,text,integer) from public,anon,authenticated;
grant execute on function public.f09_record_report_preparation(bigint,uuid,uuid,bigint,text,integer) to service_role;


-- Reviewed predecessor: 20260930111612_f09_provider_admission.sql
-- F09 provider admission: rolling 60 seconds / rolling 24 hours, per provider
-- configuration, counting dispatch attempts (not recipients or inbox receipts).
-- Null limits remain unlimited; invalid non-positive limits fail closed.

create table public.erp_email_provider_dispatches (
 lease_token uuid primary key,
 queue_id bigint not null references public.erp_email_queue(id),
 provider_id bigint not null references public.erp_email_provider_configs(id),
 admitted_at timestamptz not null default clock_timestamp()
);
create index f09_provider_dispatch_window on public.erp_email_provider_dispatches(provider_id,admitted_at);
create table public.erp_email_provider_cooldowns (
 provider_id bigint primary key references public.erp_email_provider_configs(id),
 retry_at timestamptz not null
);
alter table public.erp_email_provider_dispatches enable row level security;
alter table public.erp_email_provider_cooldowns enable row level security;
revoke all on public.erp_email_provider_dispatches,public.erp_email_provider_cooldowns
 from public,anon,authenticated,service_role;
grant select,insert on public.erp_email_provider_dispatches to service_role;
grant select,insert,update on public.erp_email_provider_cooldowns to service_role;
alter table public.erp_email_attempt_events drop constraint erp_email_attempt_events_event_check;
alter table public.erp_email_attempt_events add constraint erp_email_attempt_events_event_check
 check(event in ('claimed','dispatching','accepted','retry','permanent','unknown','cancelled','lease_expired','quota_deferred'));

-- Old binaries cannot bypass the new admission boundary during a bad rollout.
create or replace function public.f09_begin_email_dispatch(p_id bigint,p_owner uuid,p_token uuid)
returns boolean language sql security invoker set search_path='' as $$ select false $$;

create function public.f09_admit_email_dispatch(p_id bigint,p_owner uuid,p_token uuid,
 p_provider_id bigint,p_expected jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare q public.erp_email_queue; p public.erp_email_provider_configs;
 t timestamptz; due timestamptz; boundary timestamptz; n bigint;
begin
 select * into q from public.erp_email_queue where id=p_id and status='processing'
  and lease_owner=p_owner and lease_token=p_token and lease_expires_at>clock_timestamp()
  and dispatch_started_at is null and deleted_at is null and cancelled_at is null and paused_at is null
  for update;
 if not found then return 'lease_lost'; end if;
 -- Serialize all admission/limit checks for this provider; never hold over HTTP.
 select * into p from public.erp_email_provider_configs where id=p_provider_id for update;
 if not found or p_expected is distinct from to_jsonb(p) or not p.is_active or not p.is_enabled
  or p.deleted_at is not null or (q.provider_config_id is not null and q.provider_config_id<>p.id)
  or (q.provider_config_id is null and (not p.is_default or
    (select count(*) from public.erp_email_provider_configs where is_default and is_active and is_enabled and deleted_at is null)<>1))
  or p.throttle_per_minute is null or p.daily_send_limit is null
  or p.throttle_per_minute<=0 or p.daily_send_limit<=0 then return 'rejected'; end if;
 t:=clock_timestamp();
 if q.lease_expires_at<=t then return 'lease_lost'; end if;
 if q.report_schedule_run_id is not null and not exists(select 1 from public.erp_report_schedules s
  where s.id=q.source_entity_id and s.is_active and s.deleted_at is null and public.f09_schedule_revision(s)=q.source_revision)
  then return 'rejected'; end if;
 select retry_at into due from public.erp_email_provider_cooldowns where provider_id=p.id;
 if p.throttle_per_minute is not null then
  select count(*),min(admitted_at)+interval '60 seconds' into n,boundary
   from public.erp_email_provider_dispatches where provider_id=p.id and admitted_at>t-interval '60 seconds';
  if n>=p.throttle_per_minute then due:=greatest(due,boundary); end if;
 end if;
 if p.daily_send_limit is not null then
  select count(*),min(admitted_at)+interval '24 hours' into n,boundary
   from public.erp_email_provider_dispatches where provider_id=p.id and admitted_at>t-interval '24 hours';
  if n>=p.daily_send_limit then due:=greatest(due,boundary); end if;
 end if;
 if due>t then
  insert into public.erp_email_attempt_events(queue_id,attempt_number,lease_token,event)
   values(q.id,q.attempt_count,q.lease_token,'quota_deferred');
  -- No send was attempted. Keep the claim fact, refund only this fenced claim.
  update public.erp_email_queue set status='pending',attempt_count=attempt_count-1,
   next_retry_at=due+interval '1 second',last_error='F09:provider_quota',updated_at=t,
   lease_owner=null,lease_token=null,lease_expires_at=null where id=q.id;
  return 'deferred';
 end if;
 insert into public.erp_email_provider_dispatches(lease_token,queue_id,provider_id,admitted_at)
  values(q.lease_token,q.id,p.id,t);
 update public.erp_email_queue set dispatch_started_at=t,updated_at=t where id=q.id;
 insert into public.erp_email_attempt_events(queue_id,attempt_number,lease_token,event,correlation_id)
  values(q.id,q.attempt_count,q.lease_token,'dispatching',q.lease_token);
 return 'allowed';
end $$;

-- Provider Retry-After becomes a provider-wide cooldown, including the last
-- exhausted attempt. A stale worker cannot extend it after its fence is lost.
create function public.f09_finish_provider_email(p_id bigint,p_owner uuid,p_token uuid,
 p_outcome text,p_retry_after timestamptz default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.erp_email_queue; provider bigint; done boolean;
begin
 select * into q from public.erp_email_queue where id=p_id and status='processing'
  and lease_owner=p_owner and lease_token=p_token and lease_expires_at>clock_timestamp() for update;
 if not found then return false; end if;
 select provider_id into provider from public.erp_email_provider_dispatches where lease_token=p_token;
 done:=public.f09_finish_email(p_id,p_owner,p_token,p_outcome,p_retry_after);
 if done and provider is not null and p_outcome='retry' then
  perform 1 from public.erp_email_provider_configs where id=provider for update;
  insert into public.erp_email_provider_cooldowns(provider_id,retry_at)
   values(provider,greatest(p_retry_after,clock_timestamp()+interval '5 minutes'))
   on conflict(provider_id) do update set retry_at=greatest(erp_email_provider_cooldowns.retry_at,excluded.retry_at);
 end if;
 return done;
end $$;
revoke all on function public.f09_admit_email_dispatch(bigint,uuid,uuid,bigint,jsonb),
 public.f09_finish_provider_email(bigint,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.f09_admit_email_dispatch(bigint,uuid,uuid,bigint,jsonb),
 public.f09_finish_provider_email(bigint,uuid,uuid,text,timestamptz) to service_role;
-- A confirmed retryable rejection is no longer in flight. Its dispatch marker
-- belongs to the previous attempt; preserve it as evidence without preventing
-- cancellation of a future retry. Uncertain/in-flight outcomes remain fenced.
create or replace function public.f09_cancel_email(p_id bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed bigint;
begin
 update public.erp_email_queue set status='cancelled',cancelled_at=clock_timestamp(),
   updated_at=clock_timestamp(),lease_owner=null,lease_token=null,lease_expires_at=null
 where id=p_id and deleted_at is null and (
   (status in ('pending','processing') and dispatch_started_at is null)
   or (status='pending' and last_error='F09:retry' and delivery_state is null
       and lease_token is null and lease_owner is null)
 ) returning id into changed;
 return changed is not null;
end $$;


-- Reviewed predecessor: 20260930115829_f09_schedule_scope_boundary.sql

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Ownership never survives loss of delivery authority; company scope is not global.
CREATE FUNCTION erp_private.f09_schedule_delivery_scope(company_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.permission_in_scope('reports.run',$1,NULL)
    AND erp_private.permission_in_scope('reports.export',$1,NULL)
    AND erp_private.permission_in_scope('reports.email',$1,NULL);
$$;
REVOKE ALL ON FUNCTION erp_private.f09_schedule_delivery_scope(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f09_schedule_delivery_scope(bigint) TO authenticated;
ALTER TABLE public.erp_report_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rpt_schedules_select ON public.erp_report_schedules;
DROP POLICY IF EXISTS rpt_schedules_insert ON public.erp_report_schedules;
DROP POLICY IF EXISTS rpt_schedules_update ON public.erp_report_schedules;
DROP POLICY IF EXISTS rpt_schedules_delete ON public.erp_report_schedules;
CREATE POLICY f09_schedule_read ON public.erp_report_schedules FOR SELECT TO authenticated USING (
 erp_private.permission_in_scope('reports.schedule.view',owner_company_id,NULL)
 OR erp_private.permission_in_scope('reports.schedule.manage',owner_company_id,NULL)
 OR (created_by=public.current_user_profile_id() AND erp_private.f09_schedule_delivery_scope(owner_company_id))
);
CREATE POLICY f09_schedule_create ON public.erp_report_schedules FOR INSERT TO authenticated WITH CHECK (
 created_by=public.current_user_profile_id() AND erp_private.f09_schedule_delivery_scope(owner_company_id)
 AND deleted_at IS NULL AND deleted_by IS NULL
);
CREATE POLICY f09_schedule_update ON public.erp_report_schedules FOR UPDATE TO authenticated USING (
 erp_private.f09_schedule_delivery_scope(owner_company_id)
 AND (created_by=public.current_user_profile_id() OR erp_private.permission_in_scope('reports.schedule.manage',owner_company_id,NULL))
) WITH CHECK (
 erp_private.f09_schedule_delivery_scope(owner_company_id)
 AND (created_by=public.current_user_profile_id() OR erp_private.permission_in_scope('reports.schedule.manage',owner_company_id,NULL))
 AND (deleted_by IS NULL OR deleted_by=public.current_user_profile_id())
);
-- Browser JWTs cannot forge creator/report identity or worker outcome facts.
-- Deletion is audited soft deletion, not a public hard-delete capability.
REVOKE ALL ON public.erp_report_schedules FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE ON public.erp_report_schedules FROM authenticated;
GRANT SELECT ON public.erp_report_schedules TO authenticated;
GRANT INSERT(schedule_code,report_id,created_by,owner_company_id,schedule_name,filters_json,
 selected_template_id,output_format,recipient_to,recipient_cc,email_subject_template,email_body_template,
 frequency,day_of_week,day_of_month,time_of_day,timezone,next_run_at,is_active)
 ON public.erp_report_schedules TO authenticated;
GRANT UPDATE(owner_company_id,schedule_name,filters_json,selected_template_id,output_format,
 recipient_to,recipient_cc,email_subject_template,email_body_template,frequency,day_of_week,
 day_of_month,time_of_day,timezone,next_run_at,is_active,updated_at,deleted_at,deleted_by)
 ON public.erp_report_schedules TO authenticated;

-- Global unpartitioned queue: a company/branch assignment must not expose it.
DROP POLICY IF EXISTS erp_email_queue_scoped_select ON public.erp_email_queue;
DROP POLICY IF EXISTS erp_email_queue_scoped_insert ON public.erp_email_queue;
DROP POLICY IF EXISTS erp_email_queue_scoped_update ON public.erp_email_queue;
CREATE POLICY f09_global_queue_read ON public.erp_email_queue FOR SELECT TO authenticated USING (
 (SELECT public.current_user_is_global_admin()) OR
 (SELECT public.current_user_has_permission_globally('notifications.email_queue.view')) OR
 (SELECT public.current_user_has_permission_globally('notifications.email_queue.manage')) OR
 (SELECT public.current_user_has_permission_globally('notifications.admin'))
);

-- Extend, do not replace, PERF's caller-RLS projection. Existing column order
-- remains stable; raw provider errors, bodies and CC/BCC are never returned.
CREATE OR REPLACE VIEW public.perf_email_queue_read
WITH (security_invoker=true,security_barrier=true) AS SELECT
 q.id,q.queue_code,q.notification_id,q.provider_config_id,q.source_module,
 q.source_entity_type,q.source_entity_id,q.priority,q.status,q.from_email,
 q.to_emails,q.subject,q.template_code,q.scheduled_for,q.sent_at,q.cancelled_at,
 q.attempt_count,q.max_attempts,q.next_retry_at,q.external_message_id,q.created_at,q.deleted_at,
 CASE WHEN q.last_error IN ('F09:retry','F09:provider_quota','F09:unknown','F09:permanent','F09:lease_expired','F09:cancelled') THEN q.last_error
 WHEN q.last_error IS NOT NULL AND q.last_error<>'' THEN 'Delivery error recorded; inspect the authorized diagnostic record.'::text ELSE NULL::text END AS last_error,
 q.id::text AS id_search,pg_catalog.array_to_string(q.to_emails,' ') AS recipients_search,
 q.delivery_state,q.paused_at,q.dispatch_started_at
FROM public.erp_email_queue q;
REVOKE ALL ON public.perf_email_queue_read FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.perf_email_queue_read TO authenticated;
COMMENT ON VIEW public.perf_email_queue_read IS 'F09/PERF metadata only; caller RLS, bounded paging, safe outcome codes, no bodies/CC/BCC/raw errors.';
NOTIFY pgrst,'reload schema';
COMMIT;
