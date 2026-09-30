-- F09 provider admission: rolling 60 seconds / rolling 24 hours, per provider
-- configuration, counting dispatch attempts (not recipients or inbox receipts).
-- Null limits remain unlimited; invalid non-positive limits fail closed.
begin;
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
notify pgrst,'reload schema';
commit;
