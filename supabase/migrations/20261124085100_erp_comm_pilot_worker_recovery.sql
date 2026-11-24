-- Finite pilot handoff only. Installs no plan, owner approval, proof, grant, worker or schedule.
-- A private operator publishes already-debited, offline-signed receipts. The app never receives an issuer key.
begin;

-- Only the dedicated kind is added. Existing enrollment/debit functions (including baseline safety
-- snapshots) remain authoritative and retain their generic, exact-bound chat funding branch.
alter table erp_comm_cost.control_pool drop constraint control_pool_kind_check;
alter table erp_comm_cost.control_pool add constraint control_pool_kind_check check(kind in
 ('chat_stage_poll','ptt_worker_poll','notification_tick','budget_alert','report','block','terms','supervisor_delivery','baseline_poll'));

create table erp_comm_cost.worker_lookup_plan (
  pool uuid primary key references erp_comm_cost.worker_probe_plan(pool),
  max_lookups integer not null check(max_lookups between 1 and 2147483647),
  used integer not null default 0 check(used between 0 and max_lookups),
  valid_until timestamptz not null check(isfinite(valid_until) and valid_until<='2026-11-30T19:59:00Z'::timestamptz),
  evidence_id text not null check(length(trim(evidence_id)) between 1 and 256)
);
create table erp_comm_cost.worker_signed_delivery (
  boot uuid primary key references erp_comm_cost.worker_launch_ticket(boot),
  token text not null check(length(token) between 1 and 4096),
  receipt_sha256 text not null check(receipt_sha256 ~ '^[0-9a-f]{64}$'),
  taken_at timestamptz
);
alter table erp_comm_cost.worker_lookup_plan enable row level security;
alter table erp_comm_cost.worker_signed_delivery enable row level security;
revoke all on erp_comm_cost.worker_lookup_plan,erp_comm_cost.worker_signed_delivery from public,anon,authenticated,service_role;

create function erp_comm_cost.worker_lookups_funded(p_pool uuid,p_max integer,p_through timestamptz)
returns boolean language sql stable set search_path='' as $$
  select exists(select from erp_comm_cost.worker_probe_plan e
    join erp_comm_cost.control_pool cp on cp.permit_id=e.pool
    join erp_comm_cost.reservation r on r.permit_id=e.pool
    join erp_comm_cost.proof q using(operation_id)
    where e.pool=p_pool and cp.enabled and cp.kind in('chat_stage_poll','ptt_worker_poll') and r.settled_at is null
      and e.max_replicas=1 and e.max_deployments=1 and e.max_restarts_per_deployment between 1 and 15
      -- This pilot schema and signed manifest require bootCount=physicalStarts. In general use
      -- physicalStarts*bootCount*(1+supervisorRetries); the square below is valid only for that equality.
      and p_max between (1+e.max_restarts_per_deployment)*(1+e.max_restarts_per_deployment)
        and 4*(1+e.max_restarts_per_deployment)*(1+e.max_restarts_per_deployment)
      and p_max % ((1+e.max_restarts_per_deployment)*(1+e.max_restarts_per_deployment))=0
      and least(e.valid_until,cp.valid_until)>=p_through and p_through<='2026-11-30T19:59:00Z'::timestamptz
      and length(trim(q.retained_at_zero_cost_evidence))>0 and length(trim(q.shutdown_evidence))>0
      and r.reserved_micros>=greatest(r.floor_micros,(select coalesce(sum(price.upper_micros),0) from erp_comm_cost.meter price where price.operation_id=q.operation_id))
      and erp_comm_cost.worker_recovery_funded(e.pool,p_through,3600)
      and exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
        where h.permit_id=e.pool and c.dimension='database' and c.unit='permanent_ledger_bytes'
          and c.enabled and c.valid_from<=statement_timestamp() and c.valid_until>=p_through
          and h.units>=65536::numeric+32768::numeric*(cp.max_actions::numeric+p_max+2*(1+e.max_restarts_per_deployment))
          and (select coalesce(sum(total.units),0) from erp_comm_cost.unit_hold total where total.capacity_id=c.id)<=c.available_units)
      and (select count(distinct c.dimension) from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
        where h.permit_id=e.pool and c.unit='funded_worker_delivery_lookups' and c.dimension in('railway','database')
          and c.enabled and c.valid_from<=statement_timestamp() and c.valid_until>=p_through and h.units>=p_max
          and (select coalesce(sum(total.units),0) from erp_comm_cost.unit_hold total where total.capacity_id=c.id)<=c.available_units)=2
  )
$$;
revoke all on function erp_comm_cost.worker_lookups_funded(uuid,integer,timestamptz) from public,anon,authenticated,service_role;

create function erp_comm_cost.protect_worker_lookup_plan() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if (new.pool,new.max_lookups,new.valid_until,new.evidence_id) is distinct from (old.pool,old.max_lookups,old.valid_until,old.evidence_id)
      or new.used<old.used then raise sqlstate '22023' using message='Immutable funded worker lookup plan'; end if;
  elsif new.used<>0 or new.valid_until<=clock_timestamp()
    or not exists(select from erp_comm_cost.worker_probe_plan e where e.pool=new.pool and e.evidence_id=new.evidence_id)
    or not erp_comm_cost.worker_lookups_funded(new.pool,new.max_lookups,new.valid_until) then
    raise sqlstate 'PT503' using message='worker_delivery_lookups_unfunded';
  end if;
  return new;
end $$;
revoke all on function erp_comm_cost.protect_worker_lookup_plan() from public,anon,authenticated,service_role;
create trigger worker_lookup_plan_funding before insert or update on erp_comm_cost.worker_lookup_plan
  for each row execute function erp_comm_cost.protect_worker_lookup_plan();

-- One existing funded delivery call also verifies the supervisor lookup enrollment before committing.
-- Private operator only; preserves the exact original receipt format and manual launcher contract.
create function erp_comm_cost.take_supervised_worker_delivery(p_boot uuid,p_attempt uuid)
returns jsonb language plpgsql set search_path='' as $$
declare t erp_comm_cost.worker_launch_ticket%rowtype; lp erp_comm_cost.worker_lookup_plan%rowtype;
begin
  select * into t from erp_comm_cost.worker_launch_ticket where boot=p_boot;
  select * into lp from erp_comm_cost.worker_lookup_plan where pool=t.pool;
  if lp.pool is null or lp.used>=lp.max_lookups or lp.valid_until<t.until_at
    or not erp_comm_cost.worker_lookups_funded(lp.pool,lp.max_lookups,t.until_at) then return null; end if;
  return erp_comm_cost.take_worker_delivery(p_boot,p_attempt);
end $$;
revoke all on function erp_comm_cost.take_supervised_worker_delivery(uuid,uuid) from public,anon,authenticated,service_role;

create function erp_comm_cost.protect_worker_signed_delivery() returns trigger language plpgsql set search_path='' as $$
declare t erp_comm_cost.worker_launch_ticket%rowtype; e erp_comm_cost.worker_probe_plan%rowtype;
  cp erp_comm_cost.control_pool%rowtype; lp erp_comm_cost.worker_lookup_plan%rowtype;
  payload text; bytes bytea; body jsonb; signature bytea;
begin
  if tg_op='UPDATE' then
    if (new.boot,new.token,new.receipt_sha256) is distinct from (old.boot,old.token,old.receipt_sha256)
      or old.taken_at is not null or new.taken_at is null then
      raise sqlstate '22023' using message='Immutable signed worker delivery'; end if;
    return new;
  end if;
  select * into t from erp_comm_cost.worker_launch_ticket where boot=new.boot for update;
  select * into e from erp_comm_cost.worker_probe_plan where pool=t.pool;
  select * into cp from erp_comm_cost.control_pool where permit_id=t.pool;
  select * into lp from erp_comm_cost.worker_lookup_plan where pool=t.pool;
  if t.boot is null or t.delivery_id is null or t.delivered_receipt_at is null or t.attempted_at is not null or new.taken_at is not null
    or t.register_by<=clock_timestamp()+interval '10 seconds' or lp.pool is null
    or least(lp.valid_until,e.valid_until,cp.valid_until)<t.until_at
    or not erp_comm_cost.worker_lookups_funded(lp.pool,lp.max_lookups,t.until_at)
    or new.token !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise sqlstate 'PT503' using message='signed_worker_delivery_unfunded'; end if;
  payload:=split_part(new.token,'.',1);
  bytes:=decode(rpad(translate(payload,'-_','+/'),((length(payload)+3)/4)*4,'='),'base64');
  payload:=split_part(new.token,'.',2);
  signature:=decode(rpad(translate(payload,'-_','+/'),((length(payload)+3)/4)*4,'='),'base64');
  body:=convert_from(bytes,'UTF8')::jsonb;
  if length(signature)<>64 or encode(sha256(bytes),'hex')<>new.receipt_sha256 or body is distinct from jsonb_build_object(
    'v',1,'kind',case cp.kind when 'chat_stage_poll' then 'chat_stage' when 'ptt_worker_poll' then 'ptt' end,
    'deploymentId',t.deployment_id,'worker',cp.subject,'boot',t.boot,'maxPolls',t.poll_limit,'maxReplicas',e.max_replicas,
    'notBefore',to_char(t.not_before at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'registerBy',to_char(t.register_by at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'until',to_char(t.until_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'maxRestartsPerDeployment',e.max_restarts_per_deployment,'maxDeployments',e.max_deployments,
    'evidenceId',e.evidence_id,'prepaidProbes',e.max_replicas::numeric*(1+e.max_restarts_per_deployment::numeric)*e.max_deployments) then
    raise sqlstate '22023' using message='Signed worker receipt mismatch'; end if;
  -- The database checks exact body/ticket/digest. The app verifies Ed25519 before spending its one-use startup probe.
  return new;
end $$;
revoke all on function erp_comm_cost.protect_worker_signed_delivery() from public,anon,authenticated,service_role;
create trigger worker_signed_delivery_funding before insert or update on erp_comm_cost.worker_signed_delivery
  for each row execute function erp_comm_cost.protect_worker_signed_delivery();

create function public.erp_comm_worker_boot_delivery(p_kind text,p_worker uuid,p_deployment uuid,p_boot uuid)
returns text language plpgsql security definer set search_path='' as $$
declare cp erp_comm_cost.control_pool%rowtype; lp erp_comm_cost.worker_lookup_plan%rowtype;
  t erp_comm_cost.worker_launch_ticket%rowtype; signed text; n timestamptz; held timestamptz;
begin
  if p_kind is null or p_kind not in('chat_stage','ptt') or p_worker is null or p_deployment is null or p_boot is null then return null; end if;
  select * into cp from erp_comm_cost.control_pool where enabled and subject=p_worker::text
    and kind=case p_kind when 'chat_stage' then 'chat_stage_poll' else 'ptt_worker_poll' end;
  if cp.permit_id is null then return null; end if;
  select * into lp from erp_comm_cost.worker_lookup_plan where pool=cp.permit_id for update;
  n:=clock_timestamp();
  if lp.pool is null or lp.used>=lp.max_lookups or lp.valid_until<=n
    or not erp_comm_cost.worker_lookups_funded(lp.pool,lp.max_lookups,lp.valid_until) then return null; end if;
  -- This debit survives null results, a taken/missing boot, wrong deployment and lost response.
  update erp_comm_cost.worker_lookup_plan set used=used+1 where pool=lp.pool;
  select * into t from erp_comm_cost.worker_launch_ticket where boot=p_boot and pool=lp.pool;
  if t.boot is null or t.deployment_id<>p_deployment or t.not_before>n or t.register_by<=n+interval '10 seconds'
    or t.until_at>lp.valid_until or t.attempted_at is not null or t.delivery_id is null then return null; end if;
  if not exists(select from erp_comm_cost.worker_signed_delivery where boot=p_boot and taken_at is null) then return null; end if;
  if p_kind='chat_stage' then select max(lease_until) into held from erp_comm_cost.chat_stage_boot where worker=p_worker and lease_until>n;
  else select max(lease_until) into held from erp_comm_cost.ptt_worker_boot where worker=p_worker and lease_until>n; end if;
  if held is not null then return 'hold:'||to_char(held at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); end if;
  update erp_comm_cost.worker_signed_delivery set taken_at=n where boot=p_boot and taken_at is null returning token into signed;
  return signed;
end $$;
revoke all on function public.erp_comm_worker_boot_delivery(text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.erp_comm_worker_boot_delivery(text,uuid,uuid,uuid) to service_role;

-- Legacy manual commissioners retain their existing undelivered-ticket contract. An enrolled supervisor
-- instead needs an already-published untaken signature AND remaining funded lookup capacity.
create function erp_comm_cost.worker_standby_lookups_cover(p_pool uuid,p_attempts bigint,p_through timestamptz)
returns boolean language sql stable set search_path='' as $$
  select p_attempts>0 and (not exists(select from erp_comm_cost.worker_lookup_plan where pool=p_pool)
    or exists(select from erp_comm_cost.worker_lookup_plan lp where lp.pool=p_pool
      and lp.valid_until>=p_through and lp.max_lookups::bigint-lp.used>=p_attempts
      and erp_comm_cost.worker_lookups_funded(lp.pool,lp.max_lookups,p_through)))
$$;
create function erp_comm_cost.worker_standby_available(p_boot uuid,p_through timestamptz)
returns boolean language sql stable set search_path='' as $$
  select exists(select from erp_comm_cost.worker_launch_ticket t where t.boot=p_boot and t.attempted_at is null
    and t.not_before<=statement_timestamp() and t.register_by>=p_through and t.until_at>=p_through
    and erp_comm_cost.worker_standby_lookups_cover(t.pool,1,p_through)
    and ((not exists(select from erp_comm_cost.worker_lookup_plan where pool=t.pool) and t.delivery_id is null)
      or exists(select from erp_comm_cost.worker_lookup_plan lp join erp_comm_cost.worker_signed_delivery d on d.boot=t.boot
        where lp.pool=t.pool and t.delivery_id is not null and d.taken_at is null)))
$$;
revoke all on function erp_comm_cost.worker_standby_lookups_cover(uuid,bigint,timestamptz),
  erp_comm_cost.worker_standby_available(uuid,timestamptz) from public,anon,authenticated,service_role;

-- Preserve every original physical drain check; change only what counts as an available standby.
create or replace function erp_comm_cost.chat_stage_worker_covers(p_worker uuid,p_until timestamptz,p_new_attempts integer)
returns boolean language sql set search_path='' as $$
  select exists(select from erp_comm_cost.control_pool p join erp_comm_cost.chat_stage_boot b on b.worker=p_worker and b.pool=p.permit_id
    cross join erp_comm_cost.chat_stage_fleet f cross join lateral (
      select coalesce(sum(c.max_attempts),0)+p_new_attempts as jobs,
        greatest(max(h.until_at),p_until) as latest,least(min(h.until_at),p_until) as earliest
      from erp_comm_cost.stage_poll_hold h join erp_comm_cost.cleanup_resource c on c.permit_id=h.stage_permit
        and c.endpoint='discard_partial_upload' and c.closed_at is null where h.pool=p.permit_id
    ) q cross join lateral (select ceil(extract(epoch from q.latest-clock_timestamp())/30)+q.jobs+4 as ticks) required
    where p.kind='chat_stage_poll' and p.subject=p_worker::text and p.enabled and f.enabled and p.poll_seconds=30 and (p_new_attempts between 3 and 20 or (p_new_attempts=0 and q.jobs>=3))
      and p.last_poll>clock_timestamp()-interval '2 minutes' and b.lease_until>clock_timestamp() and p_until>clock_timestamp()
      and least(f.valid_until,p.valid_until,b.until_at)>=q.latest and least(p.max_actions-p.used,b.poll_limit-b.polls)>=required.ticks
      and erp_comm_cost.worker_recovery_funded(p.permit_id,q.latest,f.restart_seconds)
      and erp_comm_cost.worker_standby_lookups_cover(p.permit_id,q.jobs,q.latest)
      and (select count(*) from erp_comm_cost.chat_stage_boot spare join erp_comm_cost.worker_launch_ticket t on t.boot=spare.boot
        where spare.worker=p_worker and spare.pool=p.permit_id and spare.attempted_at is null
        and erp_comm_cost.worker_standby_available(t.boot,q.latest)
        and spare.until_at>=q.latest and spare.poll_limit>=required.ticks)>=q.jobs
      and extract(epoch from q.earliest-greatest(q.latest-interval '1 hour',clock_timestamp()))>=q.jobs*(f.busy_seconds::numeric+30+f.retry_seconds+
        f.busy_seconds+30+f.registration_seconds+f.restart_seconds+f.registration_seconds))
$$;
create or replace function erp_comm_cost.ptt_worker_covers(p_worker uuid,p_until timestamptz)
returns boolean language sql set search_path='' as $$
  select exists(select from erp_comm_cost.ptt_worker_boot b join erp_comm_cost.control_pool p on p.permit_id=b.pool
    cross join erp_comm_cost.ptt_worker_fleet f cross join lateral (select coalesce(sum(h.polls),0) as required
      from erp_comm_cost.ptt_drain_hold h join erp_comm_cost.reservation r on r.permit_id=h.permit_id where
        h.worker=p_worker and r.settled_at is null and (not exists(select from erp_comm_cost.cleanup_resource c where c.permit_id=h.permit_id)
         or exists(select from erp_comm_cost.cleanup_resource c where c.permit_id=h.permit_id and c.closed_at is null))) backlog
    where b.worker=p_worker and p_until>clock_timestamp() and p.enabled and f.singleton and f.enabled and
      least(p.valid_until,b.until_at,f.valid_until)>=p_until and b.lease_until>clock_timestamp() and
      p.last_poll>=clock_timestamp()-make_interval(secs=>f.busy_tick_seconds+p.poll_seconds) and
      least(b.poll_limit-b.polls,p.max_actions-p.used-1)>=ceil(extract(epoch from p_until-clock_timestamp())/p.poll_seconds)+backlog.required and
      f.max_boots>=(select count(*) from erp_comm_cost.ptt_worker_boot)+1+erp_comm_cost.pending_ptt_workers_except(p_worker) and
      erp_comm_cost.worker_recovery_funded(p.permit_id,p_until,f.restart_seconds) and exists(select from erp_comm_cost.worker_launch_ticket t where t.pool=p.permit_id
        and erp_comm_cost.worker_standby_available(t.boot,p_until)
        and t.poll_limit>=ceil(extract(epoch from p_until-clock_timestamp())/p.poll_seconds)+backlog.required) and
      extract(epoch from p_until-clock_timestamp())>=backlog.required*(f.busy_tick_seconds::bigint+f.retry_seconds+p.poll_seconds)+
        extract(epoch from b.lease_until-clock_timestamp())+f.restart_seconds)
$$;
create or replace function erp_comm_cost.claim_ptt_drain(p_worker uuid,p_permit uuid,p_until timestamptz)
returns void language plpgsql set search_path='' as $$
declare n timestamptz:=clock_timestamp();b erp_comm_cost.ptt_worker_boot%rowtype; cfg erp_comm_cost.ptt_worker_fleet%rowtype;
  p erp_comm_cost.control_pool%rowtype; horizon timestamptz; last_ready timestamptz; earliest_stop timestamptz; jobs bigint; outstanding bigint; current_hold erp_comm_cost.ptt_drain_hold%rowtype;
begin
  perform 1 from erp_comm_cost.authority where singleton for update;
  select * into cfg from erp_comm_cost.ptt_worker_fleet where singleton and enabled and valid_until>n;
  select * into b from erp_comm_cost.ptt_worker_boot where worker=p_worker and lease_until>n for update;
  select * into p from erp_comm_cost.control_pool where permit_id=b.pool and enabled and last_poll is not null;
  select q.operational_stop_by, sum(cl.max_resources::bigint*cl.max_attempts) into horizon,jobs
    from erp_comm_cost.reservation r join erp_comm_cost.proof q on q.operation_id=r.operation_id
    join erp_comm_cost.cleanup_limit cl on cl.operation_id=q.operation_id where r.permit_id=p_permit and r.settled_at is null and r.expires_at>n
    and r.feature in ('ptt_live','media_upload','ptt_replay') group by q.operational_stop_by;
  select * into current_hold from erp_comm_cost.ptt_drain_hold where permit_id=p_permit;
  if current_hold.permit_id is not null and (current_hold.worker is distinct from p_worker or current_hold.until_at is distinct from horizon or p_until>current_hold.ready_at) then
    raise sqlstate 'PT503' using message='ptt_drain_conflict'; end if;
  select coalesce(sum(h.polls),0),greatest(max(h.ready_at),p_until,n),least(min(h.until_at),horizon) into outstanding,last_ready,earliest_stop from erp_comm_cost.ptt_drain_hold h join erp_comm_cost.reservation rr on rr.permit_id=h.permit_id
    where h.worker=p_worker and h.permit_id<>p_permit and rr.settled_at is null and
      (not exists(select from erp_comm_cost.cleanup_resource c where c.permit_id=h.permit_id) or
        exists(select from erp_comm_cost.cleanup_resource c where c.permit_id=h.permit_id and c.closed_at is null));
  if p_until is null or not isfinite(p_until) or cfg.singleton is null or b.boot is null or p.permit_id is null or horizon is null or jobs is null
     or horizon<=n or least(cfg.valid_until,p.valid_until,b.until_at)<horizon or
     p.last_poll<n-make_interval(secs=>cfg.busy_tick_seconds+p.poll_seconds)
     or cfg.max_boots<(select count(*) from erp_comm_cost.ptt_worker_boot)+1+erp_comm_cost.pending_ptt_workers_except(p_worker)
     or not erp_comm_cost.worker_recovery_funded(p.permit_id,horizon,cfg.restart_seconds) or not exists(select from erp_comm_cost.worker_launch_ticket t where t.pool=p.permit_id
       and erp_comm_cost.worker_standby_available(t.boot,horizon)
       and t.poll_limit>=ceil(extract(epoch from horizon-n)/p.poll_seconds)+jobs+outstanding)
     or least(b.poll_limit-b.polls,p.max_actions-p.used-1)<ceil(extract(epoch from horizon-n)/p.poll_seconds)+jobs+outstanding
     or extract(epoch from earliest_stop-last_ready)<(jobs+outstanding)*(cfg.busy_tick_seconds::bigint+cfg.retry_seconds+p.poll_seconds)+
       extract(epoch from b.lease_until-n)+cfg.restart_seconds
     then raise sqlstate 'PT503' using message='ptt_drain_capacity_unavailable'; end if;
  if current_hold.permit_id is null then insert into erp_comm_cost.ptt_drain_hold values(p_permit,p_worker,jobs,p_until,horizon); end if;
end $$;

create table erp_comm_cost.supervisor_delivery_plan (
  id uuid primary key, pool uuid not null unique references erp_comm_cost.control_pool(permit_id),
  deployment_id uuid not null, manifest text not null check(length(manifest) between 1 and 16384),
  manifest_sha256 text not null check(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  config_hash text not null check(config_hash ~ '^[0-9a-f]{64}$'),
  max_claims_per_process integer not null default 3 check(max_claims_per_process between 1 and 3),
  max_claims integer not null check(max_claims between 2 and 48), claims integer not null default 0 check(claims between 0 and max_claims),
  not_before timestamptz not null, deliver_until timestamptz not null, retire_by timestamptz not null,
  cadence_seconds integer not null check(cadence_seconds between 10 and 30),
  max_deliveries integer not null check(max_deliveries between 1 and 4095),
  deliveries integer not null default 0 check(deliveries between 0 and max_deliveries),
  phase text not null default 'prepared' check(phase in('prepared','running','stopped')),
  retirement_receipt uuid, job_id bigint, last_at timestamptz, stopped_at timestamptz, last_request_id bigint,
  evidence_id text not null check(length(trim(evidence_id)) between 1 and 256),
  check(isfinite(not_before) and not_before<deliver_until and deliver_until+make_interval(secs=>cadence_seconds+5)<=retire_by
    and isfinite(retire_by) and retire_by<='2026-11-30T19:59:00Z'::timestamptz)
);
alter table erp_comm_cost.supervisor_delivery_plan enable row level security;
revoke all on erp_comm_cost.supervisor_delivery_plan from public,anon,authenticated,service_role;
create table erp_comm_cost.supervisor_wake_ticket (
  nonce uuid primary key,plan uuid not null references erp_comm_cost.supervisor_delivery_plan(id),ordinal integer not null check(ordinal>=0),
  scheduled_at timestamptz not null,expires_at timestamptz not null,wake text not null check(length(wake) between 1 and 4096),
  queued_at timestamptz,claimed_at timestamptz,unique(plan,ordinal),check(scheduled_at<expires_at)
);
create index supervisor_wake_due on erp_comm_cost.supervisor_wake_ticket(plan,scheduled_at desc) where queued_at is null;
alter table erp_comm_cost.supervisor_wake_ticket enable row level security;
revoke all on erp_comm_cost.supervisor_wake_ticket from public,anon,authenticated,service_role;

create function erp_comm_cost.protect_supervisor_delivery_plan() returns trigger language plpgsql set search_path='' as $$
declare cp erp_comm_cost.control_pool%rowtype; body jsonb; bytes bytea; segment text; item jsonb; token uuid;
begin
  if tg_op='UPDATE' then
    if (new.id,new.pool,new.deployment_id,new.manifest,new.manifest_sha256,new.config_hash,new.max_claims_per_process,new.max_claims,new.not_before,new.deliver_until,new.retire_by,new.cadence_seconds,new.max_deliveries,new.evidence_id)
      is distinct from (old.id,old.pool,old.deployment_id,old.manifest,old.manifest_sha256,old.config_hash,old.max_claims_per_process,old.max_claims,old.not_before,old.deliver_until,old.retire_by,old.cadence_seconds,old.max_deliveries,old.evidence_id)
      or new.claims<old.claims or new.claims>old.claims+1
      or new.deliveries<old.deliveries or new.deliveries>old.deliveries+1
      or (old.job_id is not null and new.job_id is distinct from old.job_id)
      or (old.retirement_receipt is not null and new.retirement_receipt is distinct from old.retirement_receipt)
      or (old.stopped_at is not null and new.stopped_at is distinct from old.stopped_at)
      or (old.phase='running' and new.phase='prepared')
      or (old.phase='stopped' and new.phase<>'stopped') or (old.last_at is not null and (new.last_at is null or new.last_at<old.last_at)) then
      raise sqlstate '22023' using message='Immutable funded supervisor delivery plan'; end if;
    if old.phase='prepared' and new.phase='running' and (new.retirement_receipt is null or new.job_id is null
      or not exists(select from erp_comm_cost.control_debit d where d.pool=new.pool and d.command_id=new.retirement_receipt and d.lane='retire')
      or not exists(select from cron.job j where j.jobid=new.job_id and j.jobname='erp-comm-supervisor-'||new.id::text
        and j.command='select erp_comm_cost.supervisor_delivery_tick('''||new.id::text||'''::uuid)')) then
      raise sqlstate 'PT503' using message='Prepaid owned supervisor cron retirement missing'; end if;
    return new;
  end if;
  select * into cp from erp_comm_cost.control_pool where permit_id=new.pool and enabled and kind='supervisor_delivery'
    and subject='communication-supervisor' and poll_seconds=new.cadence_seconds and max_actions=new.max_deliveries+1;
  if cp.permit_id is null or cp.used<>0 or cp.valid_until<new.retire_by or new.deliver_until<=clock_timestamp()+interval '90 seconds'
    or new.phase<>'prepared' or new.deliveries<>0 or new.claims<>0 or new.retirement_receipt is not null or new.job_id is not null or new.last_at is not null
    or new.stopped_at is not null or new.last_request_id is not null
    or new.max_deliveries<ceil(extract(epoch from new.deliver_until-new.not_before)/new.cadence_seconds)+1
    or new.manifest !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
    or encode(sha256(convert_to(new.manifest,'UTF8')),'hex')<>new.manifest_sha256
    or not exists(select from erp_comm_cost.reservation r join erp_comm_cost.proof q using(operation_id)
      where r.permit_id=new.pool and r.feature='chat' and r.settled_at is null and q.operational_stop_by>=new.retire_by)
    or not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
      where h.permit_id=new.pool and c.unit='permanent_ledger_bytes' and c.dimension='database' and c.enabled
        and c.valid_from<=clock_timestamp() and c.valid_until>=new.retire_by
        and h.units>=98304::numeric+32768::numeric*(cp.max_actions::numeric+new.max_claims))
    or (select count(distinct c.dimension) from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
      where h.permit_id=new.pool and c.unit='funded_supervisor_manifest_probes' and c.dimension in('railway','database')
        and c.enabled and c.valid_from<=clock_timestamp() and c.valid_until>=new.retire_by and h.units>=new.max_claims)<>2 then
    raise sqlstate 'PT503' using message='supervisor_redelivery_unfunded'; end if;
  segment:=split_part(new.manifest,'.',1);
  bytes:=decode(rpad(translate(segment,'-_','+/'),((length(segment)+3)/4)*4,'='),'base64');
  body:=convert_from(bytes,'UTF8')::jsonb;
  if body->>'purpose' is distinct from 'erp-communication-supervisor' or body->>'v' is distinct from '1' or body->>'deploymentId' is distinct from new.deployment_id::text
    or (body->>'until')::timestamptz is distinct from new.deliver_until or jsonb_typeof(body->'workers') is distinct from 'array'
    or coalesce(jsonb_array_length(body->'workers') not between 1 and 2,true)
    or new.max_claims<>(body->>'maxPhysicalStarts')::integer*new.max_claims_per_process then raise sqlstate '22023' using message='Supervisor manifest mismatch'; end if;
  for item in select value from jsonb_array_elements(body->'workers') loop
    if coalesce(item->>'kind' not in('chat_stage','ptt'),true) or jsonb_typeof(item->'boots') is distinct from 'array'
      or jsonb_array_length(item->'boots')<>(body->>'maxPhysicalStarts')::integer then raise sqlstate '22023'; end if;
    for token in select value::uuid from jsonb_array_elements_text(item->'boots') loop
      if not exists(select from erp_comm_cost.worker_launch_ticket t join erp_comm_cost.control_pool p on p.permit_id=t.pool
        join erp_comm_cost.worker_probe_plan e on e.pool=t.pool join erp_comm_cost.worker_lookup_plan lp on lp.pool=t.pool
        where t.boot=token and t.deployment_id=new.deployment_id and t.until_at=new.deliver_until
          and p.subject=item->>'worker' and p.kind=case item->>'kind' when 'chat_stage' then 'chat_stage_poll' else 'ptt_worker_poll' end
          and t.poll_limit=(item->>'maxPolls')::integer and e.max_replicas=(body->>'maxReplicas')::integer
          and e.max_deployments=(body->>'maxDeployments')::integer and e.max_restarts_per_deployment=(body->>'maxRestartsPerDeployment')::integer
          and lp.max_lookups=(item->>'maxLookups')::integer and lp.max_lookups=(body->>'maxPhysicalStarts')::integer*jsonb_array_length(item->'boots')*(1+(item->>'retries')::integer)
          and erp_comm_cost.worker_lookups_funded(lp.pool,lp.max_lookups,new.deliver_until)) then
        raise sqlstate 'PT503' using message='Supervisor manifest has an unfunded boot'; end if;
    end loop;
  end loop;
  return new;
end $$;
revoke all on function erp_comm_cost.protect_supervisor_delivery_plan() from public,anon,authenticated,service_role;
create trigger supervisor_delivery_plan_funding before insert or update on erp_comm_cost.supervisor_delivery_plan
 for each row execute function erp_comm_cost.protect_supervisor_delivery_plan();

create function erp_comm_cost.protect_supervisor_wake_ticket() returns trigger language plpgsql set search_path='' as $$
declare p erp_comm_cost.supervisor_delivery_plan%rowtype; segment text;body jsonb;bytes bytea;
begin
 if tg_op='UPDATE' then
  if (new.nonce,new.plan,new.ordinal,new.scheduled_at,new.expires_at,new.wake) is distinct from (old.nonce,old.plan,old.ordinal,old.scheduled_at,old.expires_at,old.wake)
    or (old.queued_at is not null and new.queued_at is distinct from old.queued_at)
    or (old.claimed_at is not null and new.claimed_at is distinct from old.claimed_at) then raise sqlstate '22023' using message='Immutable supervisor wake';end if;
  return new;
 end if;
 select * into p from erp_comm_cost.supervisor_delivery_plan where id=new.plan;
 if p.id is null or p.phase<>'prepared' or new.queued_at is not null or new.claimed_at is not null
   or new.ordinal>=ceil(extract(epoch from p.deliver_until-p.not_before)/p.cadence_seconds)
   or new.scheduled_at<>p.not_before+make_interval(secs=>new.ordinal*p.cadence_seconds)
   or new.expires_at<>least(p.deliver_until,new.scheduled_at+make_interval(secs=>p.cadence_seconds+5))
   or new.wake !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then raise sqlstate '22023' using message='Invalid finite wake ticket';end if;
 segment:=split_part(new.wake,'.',1);bytes:=decode(rpad(translate(segment,'-_','+/'),((length(segment)+3)/4)*4,'='),'base64');body:=convert_from(bytes,'UTF8')::jsonb;
 if body is distinct from jsonb_build_object('v',1,'purpose','erp-communication-supervisor-wake','planId',p.id,'deploymentId',p.deployment_id,'nonce',new.nonce,
   'scheduledAt',to_char(new.scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'expiresAt',to_char(new.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'cutoff',to_char(p.deliver_until at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'configHash',p.config_hash,'manifestHash',p.manifest_sha256,'maxClaimsPerProcess',p.max_claims_per_process,'maxPhysicalStarts',p.max_claims/p.max_claims_per_process)
 then raise sqlstate '22023' using message='Signed wake body mismatch';end if;
 return new;
end $$;
revoke all on function erp_comm_cost.protect_supervisor_wake_ticket() from public,anon,authenticated,service_role;
create trigger supervisor_wake_immutable before insert or update on erp_comm_cost.supervisor_wake_ticket for each row execute function erp_comm_cost.protect_supervisor_wake_ticket();

create function public.erp_comm_supervisor_manifest(p_plan uuid,p_nonce uuid,p_deployment uuid,p_manifest_sha256 text,p_config_hash text)
returns text language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.supervisor_delivery_plan%rowtype;w erp_comm_cost.supervisor_wake_ticket%rowtype;n timestamptz;
begin
 select * into p from erp_comm_cost.supervisor_delivery_plan where id=p_plan for update;
 n:=clock_timestamp();
 if p.id is null or p.phase<>'running' or p.deployment_id is distinct from p_deployment or n>=p.deliver_until or p.claims>=p.max_claims then return null;end if;
 if not exists(select from erp_comm_cost.control_pool cp join erp_comm_cost.reservation r on r.permit_id=cp.permit_id
   where cp.permit_id=p.pool and cp.enabled and cp.kind='supervisor_delivery' and cp.subject='communication-supervisor' and r.settled_at is null)
 then return null;end if;
 -- Independent original-pool probe holds cover failed/taken claims across every frozen physical start.
 update erp_comm_cost.supervisor_delivery_plan set claims=claims+1 where id=p.id;
 select * into w from erp_comm_cost.supervisor_wake_ticket where nonce=p_nonce and plan=p.id for update;
 if w.nonce is null or w.queued_at is null or w.claimed_at is not null or w.scheduled_at>n+interval '1 second' or w.expires_at<=n
   or p.manifest_sha256 is distinct from p_manifest_sha256 or p.config_hash is distinct from p_config_hash then return null;end if;
 update erp_comm_cost.supervisor_wake_ticket set claimed_at=n where nonce=w.nonce;
 return p.manifest; -- service-role only; receiver never returns or logs this private value
end $$;
revoke all on function public.erp_comm_supervisor_manifest(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.erp_comm_supervisor_manifest(uuid,uuid,uuid,text,text) to service_role;

create function erp_comm_cost.supervisor_delivery_clock() returns timestamptz language sql volatile set search_path='' as $$select clock_timestamp()$$;
revoke all on function erp_comm_cost.supervisor_delivery_clock() from public,anon,authenticated,service_role;

create function erp_comm_cost.debit_supervisor_control(p_pool uuid,p_nonce uuid,p_lane text) returns boolean language plpgsql set search_path='' as $$
declare paid timestamptz; actual uuid;
begin
  begin
    paid:=erp_comm_cost.debit_control('supervisor_delivery','communication-supervisor',p_nonce,p_lane);
    select pool into actual from erp_comm_cost.control_debit where command_id=p_nonce;
    if actual is not null and actual<>p_pool then raise sqlstate 'PT409'; end if;
  exception when sqlstate 'PT409' then return false; end;
  return coalesce(paid is not null and actual=p_pool,false);
end $$;
revoke all on function erp_comm_cost.debit_supervisor_control(uuid,uuid,text) from public,anon,authenticated,service_role;

create function erp_comm_cost.retire_supervisor_delivery(p_plan uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.supervisor_delivery_plan%rowtype;
begin
  select * into p from erp_comm_cost.supervisor_delivery_plan where id=p_plan for update;
  if p.id is null or p.retirement_receipt is null then return false; end if;
  if p.phase='stopped' then return true; end if;
  -- This exact retirement action was debited BEFORE any recurring job was installed. No new grant is needed at expiry.
  if p.job_id is not null then
    begin perform cron.unschedule(p.job_id);
    exception when others then
      -- Fixed owned job only. A disabled retained cron row is also a terminal state.
      perform cron.alter_job(p.job_id,active:=false);
    end;
  end if;
  update erp_comm_cost.supervisor_delivery_plan set phase='stopped',stopped_at=erp_comm_cost.supervisor_delivery_clock() where id=p.id;
  update erp_comm_cost.control_pool set enabled=false where permit_id=p.pool and kind='supervisor_delivery';
  return true;
end $$;
revoke all on function erp_comm_cost.retire_supervisor_delivery(uuid) from public,anon,authenticated,service_role;

create function erp_comm_cost.supervisor_delivery_tick(p_plan uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.supervisor_delivery_plan%rowtype; n timestamptz; request_id bigint;w erp_comm_cost.supervisor_wake_ticket%rowtype;
begin
  select * into p from erp_comm_cost.supervisor_delivery_plan where id=p_plan for update;
  if p.id is null or p.phase<>'running' then return false; end if;
  n:=erp_comm_cost.supervisor_delivery_clock();
  if p.deliveries>=p.max_deliveries or n>=p.deliver_until then return erp_comm_cost.retire_supervisor_delivery(p.id); end if;
  -- Every wake spends a slot, including early/duplicate wakes and a failed queue submission.
  if not erp_comm_cost.debit_supervisor_control(p.pool,gen_random_uuid(),'deliver') then return erp_comm_cost.retire_supervisor_delivery(p.id); end if;
  update erp_comm_cost.supervisor_delivery_plan set deliveries=deliveries+1 where id=p.id;
  if n>=p.not_before and (p.last_at is null or n>=p.last_at+make_interval(secs=>p.cadence_seconds)) then
    select * into w from erp_comm_cost.supervisor_wake_ticket where plan=p.id and queued_at is null and scheduled_at<=n and expires_at>n
      order by scheduled_at desc limit 1 for update;
    begin
      if w.nonce is not null then
      update erp_comm_cost.supervisor_wake_ticket set queued_at=n where nonce=w.nonce;
      request_id:=net.http_post(url:='https://erp.algt.net/api/internal/communications/supervisor-launch',
        body:='{}'::jsonb,params:='{}'::jsonb,
        headers:=jsonb_build_object('X-ERP-Signed-Wake',w.wake,'Content-Type','application/json'),timeout_milliseconds:=5000);
      end if;
    exception when others then request_id:=null; end;
    update erp_comm_cost.supervisor_delivery_plan set last_at=n,last_request_id=request_id where id=p.id;
  end if;
  if p.deliveries+1>=p.max_deliveries then return erp_comm_cost.retire_supervisor_delivery(p.id); end if;
  return true;
end $$;
revoke all on function erp_comm_cost.supervisor_delivery_tick(uuid) from public,anon,authenticated,service_role;

create function erp_comm_cost.start_supervisor_delivery(p_plan uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.supervisor_delivery_plan%rowtype; receipt uuid:=gen_random_uuid(); job bigint;
begin
  select * into p from erp_comm_cost.supervisor_delivery_plan where id=p_plan for update;
  if p.id is null or p.phase<>'prepared' or p.deliver_until<=clock_timestamp()+interval '90 seconds' then return false; end if;
  if (select count(*) from erp_comm_cost.supervisor_wake_ticket where plan=p.id)<>ceil(extract(epoch from p.deliver_until-p.not_before)/p.cadence_seconds)
    then raise sqlstate 'PT503' using message='Finite current-only wake coverage missing';end if;
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('cron.unschedule(bigint)') is null
    or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise sqlstate 'PT503' using message='Existing finite cron/net delivery unavailable'; end if;
  if not erp_comm_cost.debit_supervisor_control(p.pool,receipt,'retire') then return false; end if;
  -- Job command contains a UUID only, never a manifest, credential, caller URL or arbitrary SQL.
  job:=cron.schedule('erp-comm-supervisor-'||p.id::text,p.cadence_seconds::text||' seconds',
    'select erp_comm_cost.supervisor_delivery_tick('''||p.id::text||'''::uuid)');
  update erp_comm_cost.supervisor_delivery_plan set phase='running',retirement_receipt=receipt,job_id=job where id=p.id;
  return erp_comm_cost.supervisor_delivery_tick(p.id);
end $$;
revoke all on function erp_comm_cost.start_supervisor_delivery(uuid) from public,anon,authenticated,service_role;

commit;
