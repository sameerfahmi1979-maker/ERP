-- Communications-only spending authority. Installing this migration enrolls no owner, enables
-- no feature, grants no spending, schedules no job, and contacts no external provider.
begin;

create schema erp_comm_cost;
revoke all on schema erp_comm_cost from public, anon, authenticated, service_role;
create type erp_comm_cost.feature as enum
  ('chat','realtime','media_upload','media_download','export','push','ptt_live','ptt_replay','sos');
create domain erp_comm_cost.micros as numeric(30,0) check (value >= 0 and value <> 'NaN'::numeric);
create table erp_comm_cost.scope (name text primary key);
insert into erp_comm_cost.scope(name) values ('communications');
create table erp_comm_cost.authority (
  singleton boolean primary key default true check (singleton),
  owner_auth_id uuid references auth.users(id),
  owner_binding_evidence text check (length(trim(owner_binding_evidence)) > 0),
  check ((owner_auth_id is null) = (owner_binding_evidence is null))
);
insert into erp_comm_cost.authority(singleton) values (true);
create table erp_comm_cost.alert_recipient (auth_id uuid primary key references auth.users(id));
create table erp_comm_cost.approval (
  id uuid primary key,
  owner_auth_id uuid not null references auth.users(id),
  scope text not null references erp_comm_cost.scope(name),
  features erp_comm_cost.feature[] not null check (cardinality(features)>0),
  currency text not null check (currency='USD'),
  max_micros erp_comm_cost.micros not null check (max_micros>0),
  approved_at timestamptz not null,
  step_up_at timestamptz not null,
  ends_at timestamptz not null,
  revoked_at timestamptz,
  check(isfinite(ends_at) and approved_at < ends_at)
);
create table erp_comm_cost.pause (
  scope text not null references erp_comm_cost.scope(name), feature erp_comm_cost.feature not null, reason text not null,
  paused_at timestamptz not null default clock_timestamp(), primary key(scope,feature)
);

-- Only separately reviewed metering and reconciliation processes may write evidence.
-- For the exact operation each dimension includes a provider/account-specific upper bound.
create table erp_comm_cost.proof (
  operation_id text primary key, scope text not null references erp_comm_cost.scope(name), actor_id text not null, feature erp_comm_cost.feature not null,
  liability_ends_at timestamptz, operational_stop_by timestamptz not null check(isfinite(operational_stop_by)),
  valid_until timestamptz not null check(isfinite(valid_until)),
  max_meter_age interval not null check(max_meter_age > interval '0 seconds'),
  retained_at_zero_cost_evidence text, shutdown_evidence text not null check(length(trim(shutdown_evidence))>0),
  headroom_micros erp_comm_cost.micros not null,
  approval_id uuid references erp_comm_cost.approval(id)
);
-- A unit slot represents a provider-account resource (e.g. CPU-seconds, egress bytes, storage byte-hours).
-- Its net ceiling is after existing ERP load, paid commitments, non-feature usage and explicit headroom.
-- No rollover or restoration of consumed quantities occurs on an application restart or settlement.
create table erp_comm_cost.capacity (
  id bigint generated always as identity primary key, billing_account text not null, dimension text not null, unit text not null,
  valid_from timestamptz not null, valid_until timestamptz not null,
  available_units erp_comm_cost.micros not null, enabled boolean not null default false,
  unique(billing_account,dimension,unit), check(valid_from<valid_until and isfinite(valid_until))
);
create table erp_comm_cost.meter (
  operation_id text not null references erp_comm_cost.proof(operation_id),
  dimension text not null check (dimension in ('railway','database','realtime','storage','sfu_turn','fcm')),
  evidence_id text not null check(length(trim(evidence_id))>0),
  complete boolean not null, observed_at timestamptz not null check(isfinite(observed_at)),
  valid_until timestamptz not null check(isfinite(valid_until)),
  covered_until timestamptz not null check(isfinite(covered_until)),
  upper_micros erp_comm_cost.micros not null,
  capacity_id bigint not null references erp_comm_cost.capacity(id), upper_units erp_comm_cost.micros not null,
  primary key(operation_id,dimension,capacity_id)
);
-- A standing envelope may be installed only after bounding EVERY operation of the feature.
-- The collector refreshes metering evidence. Admission snapshots the exact evidence on first use.
create table erp_comm_cost.standing_envelope(
  scope text not null references erp_comm_cost.scope(name), feature erp_comm_cost.feature not null,
  template_id text not null unique references erp_comm_cost.proof(operation_id), enabled boolean not null default false,
  primary key(scope,feature)
);
create table erp_comm_cost.reservation (
  operation_id text primary key references erp_comm_cost.proof(operation_id), permit_id uuid not null unique,
  scope text not null references erp_comm_cost.scope(name), actor_id text not null, feature erp_comm_cost.feature not null,
  approval_id uuid references erp_comm_cost.approval(id), liability_ends_at timestamptz,
  floor_micros erp_comm_cost.micros not null, reserved_micros erp_comm_cost.micros not null,
  issued_at timestamptz not null, expires_at timestamptz not null,
  actor_session uuid, command_hash bytea, consumed_at timestamptz, consumed_xid xid8,
  check ((actor_session is null)=(command_hash is null)),
  settled_micros erp_comm_cost.micros, settlement_evidence text, settled_at timestamptz,
  check ((settled_micros is null) = (settlement_evidence is null) and
         (settled_micros is null) = (settled_at is null))
);
create index on erp_comm_cost.reservation(approval_id);
create table erp_comm_cost.unit_hold(
  permit_id uuid not null references erp_comm_cost.reservation(permit_id), capacity_id bigint not null references erp_comm_cost.capacity(id),
  units erp_comm_cost.micros not null, primary key(permit_id,capacity_id)
);
create index on erp_comm_cost.unit_hold(capacity_id);
create table erp_comm_cost.final_evidence (
  evidence_id text primary key, permit_id uuid not null unique references erp_comm_cost.reservation(permit_id),
  actual_micros erp_comm_cost.micros not null,
  confirmed_at timestamptz not null check(isfinite(confirmed_at))
);
create table erp_comm_cost.alert (
  event_id bigint generated always as identity primary key, source_uuid uuid not null unique default gen_random_uuid(),
  event_key text not null, recipient_auth_id uuid not null references auth.users(id),
  reason text not null, scope text not null references erp_comm_cost.scope(name), feature erp_comm_cost.feature,
  created_at timestamptz not null default clock_timestamp(),
  unique(event_key,recipient_auth_id)
);
-- Dispatch and open-time eligibility for the shared notification pipeline.
create function erp_private.notification_budget_target(source uuid,recipient bigint) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('kind','budget','id',e.source_uuid) from erp_comm_cost.alert e
    join public.user_profiles u on u.auth_user_id=e.recipient_auth_id where e.source_uuid=source and u.id=recipient
      and u.status='active' and u.must_change_password is false and
      (exists(select from erp_comm_cost.authority o where o.owner_auth_id=e.recipient_auth_id) or
       exists(select from erp_comm_cost.alert_recipient t where t.auth_id=e.recipient_auth_id))
$$;
revoke all on function erp_private.notification_budget_target(uuid,bigint) from public,anon,authenticated,service_role;
create function erp_comm_cost.enqueue(p_key text,p_reason text,p_scope text,p_feature erp_comm_cost.feature)
returns void language sql set search_path='' as $$
  insert into erp_comm_cost.alert(event_key,recipient_auth_id,reason,scope,feature)
  select p_key, auth_id, p_reason, p_scope, p_feature from (
    select t.owner_auth_id as auth_id from erp_comm_cost.authority t union
    select r.auth_id from erp_comm_cost.alert_recipient r
  ) recipients where auth_id is not null on conflict do nothing
$$;

create function erp_comm_cost.owner_decision(
  p_id uuid, p_scope text, p_features text[], p_max_micros text, p_ends_at timestamptz, p_revoke boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  bound uuid; actor uuid:=auth.uid(); n timestamptz; recent timestamptz;
  existing erp_comm_cost.approval%rowtype; features erp_comm_cost.feature[];
begin
  select owner_auth_id into strict bound from erp_comm_cost.authority where singleton for update;
  n:=clock_timestamp();
  if actor is null or actor is distinct from bound or public.f03_current_session_valid() is not true
     or erp_private.business_principal_is_active() is not true then
    raise insufficient_privilege using message='Verified spending owner required';
  end if;
  select max(to_timestamp((a->>'timestamp')::double precision)) into recent
  from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
  where a->>'method' in ('password','totp','webauthn','mfa/totp','mfa/phone')
    and (a->>'timestamp') ~ '^[0-9]{1,12}$';
  if recent is null or recent>n or recent<n-interval '5 minutes' then
    raise insufficient_privilege using message='Fresh owner authentication required';
  end if;
  if not exists(select from erp_comm_cost.scope s where s.name=p_scope) then raise sqlstate '22023' using message='Invalid cost scope'; end if;
  select * into existing from erp_comm_cost.approval where id=p_id;
  if p_revoke is true then
    if existing.id is null or existing.owner_auth_id<>actor or existing.scope<>p_scope then raise exception 'Unknown approval'; end if;
    update erp_comm_cost.approval set revoked_at=coalesce(revoked_at,n) where id=p_id;
    perform erp_comm_cost.enqueue(p_id::text||'/revoked','approval_revoked',existing.scope,null);
    return jsonb_build_object('ok',true,'id',p_id);
  end if;
  if p_revoke is distinct from false or p_id is null or length(trim(coalesce(p_scope,''))) not between 1 and 256
     or coalesce(p_max_micros,'') !~ '^[1-9][0-9]{0,29}$' or p_ends_at is null or not isfinite(p_ends_at)
     or n>=p_ends_at or coalesce(cardinality(p_features),0)=0 or array_position(p_features,null) is not null then
    raise exception 'Invalid fixed USD amount, deadline, scope, or features';
  end if;
  select array_agg(distinct f order by f) into features from unnest(p_features::erp_comm_cost.feature[]) f;
  if existing.id is not null then
    if existing.owner_auth_id<>actor or existing.scope<>p_scope or existing.features<>features
       or existing.max_micros<>p_max_micros::numeric or existing.ends_at<>p_ends_at or existing.revoked_at is not null then
      raise exception 'Approval revision conflict';
    end if;
    return jsonb_build_object('ok',true,'id',p_id);
  end if;
  if exists(select from erp_comm_cost.approval where ends_at>n and revoked_at is null) then
    raise exception 'An active approval already exists';
  end if;
  insert into erp_comm_cost.approval(id,owner_auth_id,scope,features,currency,max_micros,approved_at,step_up_at,ends_at)
  values(p_id,actor,p_scope,features,'USD',p_max_micros::numeric,n,recent,p_ends_at);
  perform erp_comm_cost.enqueue(p_id::text||'/approved','approval_recorded',p_scope,null);
  return jsonb_build_object('ok',true,'id',p_id);
end $$;

-- These limits consume the cleanup amount prebooked in the originating proof. They grant no admission.
create table erp_comm_cost.cleanup_limit (
  operation_id text not null references erp_comm_cost.proof(operation_id),endpoint text not null
    check(endpoint in ('close_sfu_tracks','revoke_turn','discard_partial_upload')),
  max_resources integer not null check(max_resources between 1 and 1024),
  max_attempts integer not null check(max_attempts between 1 and 20),primary key(operation_id,endpoint)
);
-- SOS origin also funds a single, bounded and possibly much later cancellation control action.
-- Volume/process count and the maximum period ciphertext can survive must come from verified runtime evidence.
create table erp_comm_cost.export_spool_limit (
  operation_id text primary key references erp_comm_cost.proof(operation_id),
  bytes_per_slot bigint not null check(bytes_per_slot>0),slots_per_volume integer not null check(slots_per_volume>0),
  max_volumes integer not null check(max_volumes>0),cleanup_tail_seconds integer not null check(cleanup_tail_seconds>0),
  export_spool_evidence text not null check(length(trim(export_spool_evidence))>0)
);
create table erp_comm_cost.sos_limit (
  operation_id text primary key references erp_comm_cost.proof(operation_id),
  max_recipients integer not null check(max_recipients>=0),max_devices integer not null check(max_devices>=0),
  cancellation_evidence text not null check(length(trim(cancellation_evidence))>0),
  post_expiry_zero_cost_evidence text not null check(length(trim(post_expiry_zero_cost_evidence))>0),
  max_push_attempts integer not null default 1 check(max_push_attempts between 1 and 20),
  max_control_reads integer not null default 2 check(max_control_reads between 2 and 256)
);
create table erp_comm_cost.sos_claim (
  permit_id uuid primary key references erp_comm_cost.reservation(permit_id),recipients integer not null, devices integer not null
);
create function erp_comm_cost.require_sos_envelope(p_permit uuid,recipient_count integer,device_count integer)
returns void language plpgsql security invoker set search_path='' as $$
declare l erp_comm_cost.sos_limit%rowtype;
begin
  select sl.* into l from erp_comm_cost.reservation r join erp_comm_cost.sos_limit sl on sl.operation_id=r.operation_id
    join erp_comm_cost.proof p on p.operation_id=r.operation_id where r.permit_id=p_permit and r.feature='sos'
    and r.scope='communications' and r.settled_at is null and r.liability_ends_at is null and
    r.consumed_xid=pg_current_xact_id() and length(trim(p.retained_at_zero_cost_evidence))>0;
  if l.operation_id is null or recipient_count is null or device_count is null or
     recipient_count not between 0 and l.max_recipients or device_count not between 0 and l.max_devices then
    raise sqlstate 'PT503' using message='sos_cancellation_envelope_unavailable';
  end if;
  insert into erp_comm_cost.sos_claim values(p_permit,recipient_count,device_count);
end $$;
create table erp_comm_cost.cleanup_resource (
  permit_id uuid not null references erp_comm_cost.reservation(permit_id), endpoint text not null, resource_id text not null,
  max_attempts integer not null check(max_attempts between 1 and 20), closed_at timestamptz, retained_at timestamptz,
  primary key(endpoint,resource_id)
);
create table erp_comm_cost.cleanup_attempt (
  endpoint text not null,resource_id text not null,attempt_id text not null,issued_at timestamptz not null,
  primary key(endpoint,resource_id,attempt_id),foreign key(endpoint,resource_id) references erp_comm_cost.cleanup_resource
);
create function erp_comm_cost.cleanup(p_action text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  rid text:=p->>'resourceId'; ep text:=p->>'endpoint'; attempt text:=p->>'attemptId';
  res erp_comm_cost.reservation%rowtype; link erp_comm_cost.cleanup_resource%rowtype;
  lim erp_comm_cost.cleanup_limit%rowtype;
begin
  select * into res from erp_comm_cost.reservation where permit_id=(p->>'permitId')::uuid;
  if res.permit_id is null or rid is null or rid !~ '^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,255}$'
     or rid like '%..%' or rid like '%//%' or ep is null or ep not in ('close_sfu_tracks','revoke_turn','discard_partial_upload')
     then return jsonb_build_object('ok',false,'reason','invalid_cleanup'); end if;
  select * into link from erp_comm_cost.cleanup_resource c where c.endpoint=ep and c.resource_id=rid;
  if p_action='bind_cleanup' then
    if link.permit_id is not null then
      if link.permit_id<>res.permit_id then return jsonb_build_object('ok',false,'reason','cleanup_conflict'); end if;
      return jsonb_build_object('ok',true);
    end if;
    select * into lim from erp_comm_cost.cleanup_limit l where l.operation_id=res.operation_id and l.endpoint=ep;
    if res.settled_at is not null or lim.operation_id is null or
      (select count(*) from erp_comm_cost.cleanup_resource c where c.permit_id=res.permit_id and c.endpoint=ep)>=lim.max_resources then
      return jsonb_build_object('ok',false,'reason','cleanup_allocation_unavailable');
    end if;
    insert into erp_comm_cost.cleanup_resource(permit_id,endpoint,resource_id,max_attempts)
      values(res.permit_id,ep,rid,lim.max_attempts);
    return jsonb_build_object('ok',true);
  end if;
  if link.permit_id is distinct from res.permit_id or length(trim(coalesce(attempt,''))) not between 1 and 256 then
    return jsonb_build_object('ok',false,'reason','cleanup_unbound');
  end if;
  if link.retained_at is not null then return jsonb_build_object('ok',false,'reason','retained_object_protected'); end if;
  if exists(select from erp_comm_cost.cleanup_attempt t where t.endpoint=ep and t.resource_id=rid and t.attempt_id=attempt) then
    if p_action='confirm_cleanup' then
      update erp_comm_cost.cleanup_resource c set closed_at=coalesce(c.closed_at,clock_timestamp()) where c.endpoint=ep and c.resource_id=rid;
      return jsonb_build_object('ok',true);
    end if;
    return jsonb_build_object('ok',true,'newAttempt',false);
  end if;
  if p_action<>'authorize_cleanup' or link.closed_at is not null or res.settled_at is not null then
    return jsonb_build_object('ok',false,'reason','cleanup_unavailable');
  end if;
  if (select count(*) from erp_comm_cost.cleanup_attempt t where t.endpoint=ep and t.resource_id=rid)>=link.max_attempts then
    return jsonb_build_object('ok',false,'reason','cleanup_allocation_exhausted');
  end if;
  insert into erp_comm_cost.cleanup_attempt values(ep,rid,attempt,clock_timestamp());
  return jsonb_build_object('ok',true,'newAttempt',true);
end $$;
-- These helpers are callable only inside trusted storage business transactions.
create function erp_comm_cost.bind_chat_stage(p_permit uuid,p_upload uuid,p_cleanup_by timestamptz)
returns void language plpgsql set search_path='' as $$
declare ok jsonb;
begin
  if p_upload is null or p_cleanup_by is null or not isfinite(p_cleanup_by) or p_cleanup_by<=clock_timestamp() or not exists(
    select from erp_comm_cost.reservation r join erp_comm_cost.proof p on p.operation_id=r.operation_id
    join erp_comm_cost.cleanup_limit c on c.operation_id=p.operation_id and c.endpoint='discard_partial_upload'
    where r.permit_id=p_permit and r.feature='media_upload' and r.consumed_xid=pg_current_xact_id() and
      p.operational_stop_by>=p_cleanup_by and length(trim(p.retained_at_zero_cost_evidence))>0 and c.max_attempts>=3) then
    raise sqlstate 'PT503' using message='stage_cleanup_unfunded'; end if;
  ok:=erp_comm_cost.cleanup('bind_cleanup',jsonb_build_object('permitId',p_permit,'endpoint','discard_partial_upload',
    'resourceId','erp-chat-media/'||p_upload::text));
  if (ok->>'ok')::boolean is not true then raise sqlstate 'PT503' using message='stage_cleanup_unfunded'; end if;
end $$;
create function erp_comm_cost.release_retained_upload(p_permit uuid,p_resource_id text)
returns void language plpgsql set search_path='' as $$
declare link erp_comm_cost.cleanup_resource%rowtype; n timestamptz:=clock_timestamp();
begin
  perform 1 from erp_comm_cost.authority where singleton for update;
  select c.* into link from erp_comm_cost.cleanup_resource c join erp_comm_cost.reservation r on r.permit_id=c.permit_id
    join erp_comm_cost.proof p on p.operation_id=r.operation_id where c.permit_id=p_permit and c.endpoint='discard_partial_upload'
    and c.resource_id=p_resource_id and length(trim(p.retained_at_zero_cost_evidence))>0 for update of c;
  if link.retained_at is not null then return; end if;
  if link.permit_id is null or link.closed_at is not null or exists(select from erp_comm_cost.cleanup_attempt t
      where t.endpoint='discard_partial_upload' and t.resource_id=p_resource_id) then
    raise sqlstate 'PT503' using message='retained_upload_conflict'; end if;
  update erp_comm_cost.cleanup_resource set closed_at=n,retained_at=n where endpoint='discard_partial_upload' and resource_id=p_resource_id;
end $$;
create function erp_comm_cost.release_attached_chat_stage(p_permit uuid,p_upload uuid)
returns void language sql set search_path='' as $$
  select erp_comm_cost.release_retained_upload(p_permit,'erp-chat-media/'||p_upload::text)
$$;
-- A finite maintenance pool consumes a distinct protected reservation; no pool is seeded.
-- The evidence collector must price each worst-case unit and provide continuing zero-cost coverage after a grant ends.
create table erp_comm_cost.control_pool (
  permit_id uuid primary key references erp_comm_cost.reservation(permit_id),
  kind text not null check(kind in ('chat_stage_poll','ptt_worker_poll','notification_tick','budget_alert','report','block','terms')),
  subject text not null, max_actions integer not null check(max_actions>0), used integer not null default 0 check(used>=0 and used<=max_actions),
  valid_until timestamptz not null check(isfinite(valid_until)), continuing_zero_evidence text not null check(length(trim(continuing_zero_evidence))>0),
  poll_seconds integer not null default 30 check(poll_seconds between 1 and 3600),last_poll timestamptz,
  enabled boolean not null default false
);
create index on erp_comm_cost.control_pool(kind,subject,valid_until) where enabled;
-- Pin a dedicated, already issued reservation to a single immutable class/subject.
create function erp_comm_cost.enroll_pool() returns trigger language plpgsql set search_path='' as $$
declare r erp_comm_cost.reservation%rowtype; n timestamptz:=clock_timestamp();
begin
  if tg_op='UPDATE' then
    if (new.permit_id,new.kind,new.subject,new.max_actions,new.valid_until,new.continuing_zero_evidence,new.poll_seconds)
      is distinct from (old.permit_id,old.kind,old.subject,old.max_actions,old.valid_until,old.continuing_zero_evidence,old.poll_seconds)
      or new.used<old.used then raise sqlstate '22023' using message='Immutable funded control plan'; end if;
    return new;
  end if;
  perform 1 from erp_comm_cost.authority where singleton for update;
  select * into r from erp_comm_cost.reservation where permit_id=new.permit_id for update;
  if r.permit_id is null or r.consumed_at is not null or r.settled_at is not null or r.expires_at<=n or new.used<>0 or new.valid_until<=n or (new.kind='notification_tick' and (new.subject<>'mobile-notifications' or new.max_actions<2))
    or r.scope<>'communications' or r.command_hash is distinct from sha256(convert_to(jsonb_build_object('op','budget.fundControl',
      'kind',new.kind,'subject',new.subject,'maxActions',new.max_actions,'endEpoch',extract(epoch from new.valid_until)::bigint)::text,'UTF8'))
    or r.feature<>(case new.kind when 'budget_alert' then 'push'::erp_comm_cost.feature when 'notification_tick' then 'push'::erp_comm_cost.feature when 'chat_stage_poll' then 'media_upload'::erp_comm_cost.feature when 'ptt_worker_poll' then 'ptt_live'::erp_comm_cost.feature
      else 'chat'::erp_comm_cost.feature end)
    or not exists(select from erp_comm_cost.proof q where q.operation_id=r.operation_id and length(trim(q.retained_at_zero_cost_evidence))>0)
    or not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where h.permit_id=r.permit_id
      and c.unit='funded_'||new.kind||'_actions' and h.units>=new.max_actions)
    or not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where h.permit_id=r.permit_id
      and c.unit='permanent_ledger_bytes' and h.units>=65536::numeric+new.max_actions::numeric*32768)
    or exists(select from erp_comm_cost.pause p where p.scope=r.scope and p.feature=r.feature)
    or (r.approval_id is not null and not exists(select from erp_comm_cost.approval a join erp_comm_cost.authority au on au.owner_auth_id=a.owner_auth_id
       where a.id=r.approval_id and a.revoked_at is null and a.ends_at>n))
    then raise sqlstate 'PT503' using message='control_enrollment_unfunded'; end if;
  update erp_comm_cost.reservation set consumed_at=n,consumed_xid=pg_current_xact_id() where permit_id=r.permit_id;
  return new;
end $$;
create trigger control_pool_enrollment before insert or update on erp_comm_cost.control_pool
for each row execute function erp_comm_cost.enroll_pool();
create table erp_comm_cost.control_debit (
  pool uuid not null references erp_comm_cost.control_pool(permit_id), command_id uuid not null, lane text, primary key(pool,command_id)
);
create function erp_comm_cost.debit_control(k text,s text,nonce uuid,p_lane text default null)
returns timestamptz language plpgsql set search_path='' as $$
declare p erp_comm_cost.control_pool%rowtype; n timestamptz:=clock_timestamp();
begin
  if nonce is null then return null; end if;
  select cp.* into p from erp_comm_cost.control_pool cp join erp_comm_cost.reservation r on r.permit_id=cp.permit_id
    join erp_comm_cost.proof q on q.operation_id=r.operation_id
    where cp.enabled and cp.kind=k and cp.subject=s and cp.valid_until>n and cp.used<cp.max_actions
    and r.feature=case k when 'budget_alert' then 'push'::erp_comm_cost.feature when 'notification_tick' then 'push'::erp_comm_cost.feature when 'chat_stage_poll' then 'media_upload'::erp_comm_cost.feature when 'ptt_worker_poll' then 'ptt_live'::erp_comm_cost.feature
      else 'chat'::erp_comm_cost.feature end and r.settled_at is null and length(trim(q.retained_at_zero_cost_evidence))>0
    and r.command_hash=sha256(convert_to(jsonb_build_object('op','budget.fundControl','kind',k,'subject',s,
      'maxActions',cp.max_actions,'endEpoch',extract(epoch from cp.valid_until)::bigint)::text,'UTF8'))
    and exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
      where h.permit_id=cp.permit_id and c.unit='funded_'||k||'_actions' and h.units>=cp.max_actions)
    and exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
      where h.permit_id=cp.permit_id and c.unit='permanent_ledger_bytes' and h.units>=65536::numeric+cp.max_actions::numeric*32768)
    order by cp.valid_until,cp.permit_id limit 1 for update of cp;
  if p.permit_id is null or (k in ('chat_stage_poll','ptt_worker_poll','notification_tick') and p_lane is distinct from 'boot' and p.last_poll+make_interval(secs=>p.poll_seconds)>n) or
    exists(select from erp_comm_cost.control_debit d join erp_comm_cost.control_pool c on c.permit_id=d.pool
      where c.kind=k and c.subject=s and d.command_id=nonce) then return null; end if;
  if k='budget_alert' and (p_lane is null or p_lane not in ('read','push') or
    (select count(*) from erp_comm_cost.control_debit x where x.pool=p.permit_id and x.lane=p_lane)>=
      (case p_lane when 'push' then p.max_actions/2 else p.max_actions-p.max_actions/2 end)) then return null; end if;
  insert into erp_comm_cost.control_debit values(p.permit_id,nonce,p_lane);
  update erp_comm_cost.control_pool set used=used+1,last_poll=case when k in ('chat_stage_poll','ptt_worker_poll','notification_tick') and p_lane is distinct from 'boot' then n else last_poll end where permit_id=p.permit_id;
  if k in ('chat_stage_poll','ptt_worker_poll','notification_tick') and p_lane is distinct from 'boot' then return least(p.valid_until,n+make_interval(secs=>p.poll_seconds::double precision*(p.max_actions-p.used-1))); end if;
  return p.valid_until;
end $$;
create function erp_comm_cost.take_chat_stage_poll(p_worker uuid,p_poll uuid)
returns timestamptz language sql set search_path='' as $$
  select erp_comm_cost.debit_control('chat_stage_poll',p_worker::text,p_poll)
$$;
create unique index on erp_comm_cost.control_pool(kind,subject) where enabled;
create table erp_comm_cost.stage_poll_hold (
  stage_permit uuid primary key references erp_comm_cost.reservation(permit_id), pool uuid not null references erp_comm_cost.control_pool(permit_id),
  until_at timestamptz not null
);
create index on erp_comm_cost.stage_poll_hold(pool);
create function erp_comm_cost.chat_stage_worker_covers(p_worker uuid,p_until timestamptz)
returns boolean language sql set search_path='' as $$
  select exists(select from erp_comm_cost.control_pool p where p.kind='chat_stage_poll' and p.subject=p_worker::text and p.enabled
    and p.last_poll>clock_timestamp()-interval '2 minutes' and p.valid_until>=p_until and p_until>clock_timestamp() and
    (select count(*)*3+3 from erp_comm_cost.stage_poll_hold sh join erp_comm_cost.cleanup_resource c
      on c.permit_id=sh.stage_permit and c.endpoint='discard_partial_upload' and c.closed_at is null where sh.pool=p.permit_id)
       <= least(floor(3600::numeric/p.poll_seconds),p.max_actions-p.used-ceil(extract(epoch from p_until-clock_timestamp())/p.poll_seconds)))
$$;
create function erp_comm_cost.claim_chat_stage_window(p_worker uuid,p_permit uuid,p_until timestamptz)
returns void language plpgsql set search_path='' as $$
declare pool_id uuid;
begin
  perform 1 from erp_comm_cost.authority where singleton for update;
  select cp.permit_id into pool_id from erp_comm_cost.control_pool cp where cp.kind='chat_stage_poll' and cp.subject=p_worker::text
    and cp.enabled for update;
  if pool_id is null or not erp_comm_cost.chat_stage_worker_covers(p_worker,p_until) or
    not exists(select from erp_comm_cost.reservation r join erp_comm_cost.cleanup_resource c on c.permit_id=r.permit_id and
      c.endpoint='discard_partial_upload' and c.closed_at is null where r.permit_id=p_permit and r.consumed_xid=pg_current_xact_id()) then
    raise sqlstate 'PT503' using message='stage_worker_unfunded'; end if;
  insert into erp_comm_cost.stage_poll_hold values(p_permit,pool_id,p_until);
end $$;
-- An idle replica cannot poll without a finite prepaid boot and poll allowance. No fleet is installed.
create table erp_comm_cost.ptt_worker_fleet (
  singleton boolean primary key check(singleton), max_instances integer not null check(max_instances>0),
  max_boots integer not null check(max_boots>=max_instances),
  busy_tick_seconds integer not null check(busy_tick_seconds>=30), restart_seconds integer not null check(restart_seconds>0),
  valid_until timestamptz not null check(isfinite(valid_until)), enabled boolean not null default false,
  bounded_fleet_evidence text not null check(length(trim(bounded_fleet_evidence))>0), retry_seconds integer not null default 60 check(retry_seconds>=0)
);
create table erp_comm_cost.ptt_worker_boot (
  boot uuid primary key,worker uuid not null,pool uuid not null references erp_comm_cost.control_pool(permit_id),
  until_at timestamptz not null,lease_until timestamptz not null,poll_limit integer not null,polls integer not null default 0
);
create index on erp_comm_cost.ptt_worker_boot(worker,lease_until);
create table erp_comm_cost.ptt_drain_hold (
  permit_id uuid primary key references erp_comm_cost.reservation(permit_id),worker uuid not null,polls integer not null,ready_at timestamptz not null,until_at timestamptz not null
);
create index on erp_comm_cost.ptt_drain_hold(worker);
create function erp_comm_cost.start_ptt_worker(p_worker uuid,p_boot uuid,p_local_until timestamptz,p_local_max_polls integer)
returns timestamptz language plpgsql set search_path='' as $$
declare f erp_comm_cost.ptt_worker_fleet%rowtype;p erp_comm_cost.control_pool%rowtype; n timestamptz:=clock_timestamp(); cutoff timestamptz;
begin
  perform 1 from erp_comm_cost.authority where singleton for update;
  select * into f from erp_comm_cost.ptt_worker_fleet where singleton and enabled and valid_until>n for update;
  select * into p from erp_comm_cost.control_pool where kind='ptt_worker_poll' and subject=p_worker::text and enabled for update;
  if f.singleton is null or p.permit_id is null or p_boot is null or p_local_until is null or not isfinite(p_local_until) or p_local_until<=n
    or p_local_max_polls is null or p_local_max_polls<1 or p.max_actions-p.used<=1 or
    exists(select from erp_comm_cost.ptt_worker_boot b where b.boot=p_boot or (b.worker=p_worker and b.lease_until>n))
    or (select count(*) from erp_comm_cost.ptt_worker_boot)>=f.max_boots
    or (select count(*) from erp_comm_cost.ptt_worker_boot where lease_until>n)>=f.max_instances then return null; end if;
  if erp_comm_cost.debit_control('ptt_worker_poll',p_worker::text,p_boot,'boot') is null then return null; end if;
  cutoff:=least(p_local_until,f.valid_until,p.valid_until,n+make_interval(secs=>p.poll_seconds::double precision*least(p_local_max_polls,p.max_actions-p.used-1)));
  insert into erp_comm_cost.ptt_worker_boot values(p_boot,p_worker,p.permit_id,cutoff,
     least(cutoff,n+make_interval(secs=>f.busy_tick_seconds+f.restart_seconds+p.poll_seconds)),least(p_local_max_polls,p.max_actions-p.used-1),0);
  return cutoff;
end $$;
create function erp_comm_cost.take_ptt_worker_poll(p_worker uuid,p_boot uuid,p_poll uuid)
returns timestamptz language plpgsql set search_path='' as $$
declare b erp_comm_cost.ptt_worker_boot%rowtype; f erp_comm_cost.ptt_worker_fleet%rowtype; cutoff timestamptz; sec integer; n timestamptz:=clock_timestamp();
begin
  perform 1 from erp_comm_cost.authority where singleton for update;
  select * into f from erp_comm_cost.ptt_worker_fleet where singleton and enabled and valid_until>n for update;
  select * into b from erp_comm_cost.ptt_worker_boot where boot=p_boot and worker=p_worker for update;
  if f.singleton is null or b.boot is null or b.until_at<=n or b.lease_until<=n or b.polls>=b.poll_limit then return null; end if;
  select poll_seconds into sec from erp_comm_cost.control_pool where permit_id=b.pool and enabled;
  if sec is null then return null; end if;
  cutoff:=erp_comm_cost.debit_control('ptt_worker_poll',p_worker::text,p_poll,'poll');
  if cutoff is null then return null; end if;
  cutoff:=least(f.valid_until,cutoff,b.until_at,n+make_interval(secs=>sec::double precision*(b.poll_limit-b.polls-1)));
  update erp_comm_cost.ptt_worker_boot set polls=polls+1,lease_until=least(cutoff,n+make_interval(secs=>f.busy_tick_seconds+f.restart_seconds+sec)) where boot=b.boot;
  return cutoff;
end $$;
create function erp_comm_cost.ptt_worker_covers(p_worker uuid,p_until timestamptz)
returns boolean language sql set search_path='' as $$
  select exists(select from erp_comm_cost.ptt_worker_boot b join erp_comm_cost.control_pool p on p.permit_id=b.pool
    cross join erp_comm_cost.ptt_worker_fleet f cross join lateral (select coalesce(sum(h.polls),0) as required
      from erp_comm_cost.ptt_drain_hold h join erp_comm_cost.reservation r on r.permit_id=h.permit_id where
        h.worker=p_worker and r.settled_at is null and (not exists(select from erp_comm_cost.cleanup_resource c where c.permit_id=h.permit_id)
         or exists(select from erp_comm_cost.cleanup_resource c where c.permit_id=h.permit_id and c.closed_at is null))) backlog
    where b.worker=p_worker and p_until>clock_timestamp() and p.enabled and f.singleton and f.enabled and
      least(p.valid_until,b.until_at,f.valid_until)>=p_until and b.lease_until>clock_timestamp() and
      p.last_poll>=clock_timestamp()-make_interval(secs=>f.busy_tick_seconds+p.poll_seconds) and
      least(b.poll_limit-b.polls,p.max_actions-p.used)>=ceil(extract(epoch from p_until-clock_timestamp())/p.poll_seconds)+backlog.required and
      extract(epoch from p_until-clock_timestamp())>=backlog.required*f.busy_tick_seconds+f.restart_seconds)
$$;
create function erp_comm_cost.claim_ptt_drain(p_worker uuid,p_permit uuid,p_until timestamptz)
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
     or least(b.poll_limit-b.polls,p.max_actions-p.used)<ceil(extract(epoch from horizon-n)/p.poll_seconds)+jobs+outstanding
     or extract(epoch from earliest_stop-last_ready)<(jobs+outstanding)*(cfg.busy_tick_seconds::bigint+cfg.retry_seconds)+cfg.restart_seconds
     then raise sqlstate 'PT503' using message='ptt_drain_capacity_unavailable'; end if;
  if current_hold.permit_id is null then insert into erp_comm_cost.ptt_drain_hold values(p_permit,p_worker,jobs,p_until,horizon); end if;
end $$;
create function erp_comm_cost.take_policy_control(p_profile bigint,p_kind text)
returns void language plpgsql set search_path='' as $$
begin
  if p_kind is null or p_kind not in ('report','block','terms') or
    erp_comm_cost.debit_control(p_kind,p_profile::text,gen_random_uuid()) is null then
    raise sqlstate 'PT503' using message='policy_control_allocation_unavailable'; end if;
end $$;

-- Original SOS bindings fund both delivery phases and a bounded control inbox.
create table erp_comm_cost.notice_binding (
  source uuid not null, profile bigint not null, origin uuid not null references erp_comm_cost.sos_claim(permit_id),
  phase text not null check(phase in ('original','cancelled')),
  primary key(source,profile), unique(origin,phase,profile)
);
create index on erp_comm_cost.notice_binding(profile,source);
create table erp_comm_cost.notice_attempt (
  kind text not null,source uuid not null,profile bigint not null, device uuid not null,job uuid not null,lease uuid not null,
  valid_until timestamptz not null,primary key(kind,source,profile,lease)
);
create table erp_comm_cost.control_read_receipt (
  profile bigint not null, request uuid not null, primary key(profile,request)
);
create table erp_comm_cost.notice_read (
  source uuid not null,profile bigint not null,request uuid not null,primary key(source,profile,request)
);
create function erp_comm_cost.bind_sos_notice(p_permit uuid,p_source uuid,p_phase text,p_profile bigint)
returns void language plpgsql set search_path='' as $$
declare claim erp_comm_cost.sos_claim%rowtype;
begin
  select * into claim from erp_comm_cost.sos_claim where permit_id=p_permit for update;
  if claim.permit_id is null or p_source is null or p_profile is null or p_phase is null or p_phase not in ('original','cancelled')
    then raise sqlstate 'PT503'; end if;
  if exists(select from erp_comm_cost.notice_binding b where b.origin=p_permit and b.source=p_source and b.profile=p_profile and b.phase=p_phase) then return; end if;
  if (p_phase='original' and not exists(select from erp_comm_cost.reservation r where r.permit_id=p_permit and r.consumed_xid=pg_current_xact_id()))
    or (p_phase='cancelled' and not exists(select from erp_comm_cost.notice_binding b where b.origin=p_permit and b.profile=p_profile and b.phase='original'))
    or exists(select from erp_comm_cost.notice_binding b where b.origin=p_permit and b.phase=p_phase and b.source<>p_source)
    or (select count(*) from erp_comm_cost.notice_binding b where b.origin=p_permit and b.phase=p_phase)>=claim.recipients
    then raise sqlstate 'PT503' using message='sos_notice_unfunded'; end if;
  insert into erp_comm_cost.notice_binding values(p_source,p_profile,p_permit,p_phase);
end $$;
create function erp_comm_cost.take_notice_attempt(p_kind text,p_source uuid,p_profile bigint,p_device uuid,p_job uuid,p_lease uuid)
returns boolean language plpgsql set search_path='' as $$
declare b erp_comm_cost.notice_binding%rowtype; max_attempts int; devices int; eligible jsonb;
begin
  if p_kind is null or p_kind not in ('sos','budget') or p_source is null or p_profile is null or p_device is null or p_job is null or p_lease is null then return false; end if;
  perform 1 from erp_comm_cost.authority where singleton for update;
  if exists(select from erp_comm_cost.notice_attempt a where a.kind=p_kind and a.source=p_source and a.profile=p_profile
    and (a.lease=p_lease or (p_kind='sos' and (a.device<>p_device or a.job<>p_job)) or (a.device=p_device and a.job<>p_job))) then return false; end if;
  if p_kind='sos' then
    select * into b from erp_comm_cost.notice_binding where source=p_source and profile=p_profile;
    if b.origin is null or to_regprocedure('erp_private.notification_sos_target(uuid,bigint)') is null then return false; end if;
    execute 'select erp_private.notification_sos_target($1,$2)' into eligible using p_source,p_profile;
    if eligible->'pushEligible' is distinct from 'true'::jsonb then return false; end if;
    select l.max_push_attempts,cl.devices into max_attempts,devices from erp_comm_cost.sos_claim cl
      join erp_comm_cost.reservation r on r.permit_id=cl.permit_id join erp_comm_cost.sos_limit l on l.operation_id=r.operation_id
      where cl.permit_id=b.origin;
    if (select count(*) from erp_comm_cost.notice_attempt a where a.kind='sos' and a.source=p_source and a.profile=p_profile)>=max_attempts
      or (select count(distinct a.profile) from erp_comm_cost.notice_attempt a where a.kind='sos' and a.source=p_source and a.profile<>p_profile)>=devices
      then return false; end if;
  else
    if erp_private.notification_budget_target(p_source,p_profile) is null or
      erp_comm_cost.debit_control('budget_alert',p_profile::text,p_lease,'push') is null then return false; end if;
  end if;
  insert into erp_comm_cost.notice_attempt values(p_kind,p_source,p_profile,p_device,p_job,p_lease,clock_timestamp()+interval '110 seconds');
  return true;
end $$;
create function erp_comm_cost.notice_attempt_valid(p_kind text,p_source uuid,p_profile bigint,p_device uuid,p_job uuid,p_lease uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select from erp_comm_cost.notice_attempt a where a.kind=p_kind and a.source=p_source and a.profile=p_profile
    and a.device=p_device and a.job=p_job and a.lease=p_lease and a.valid_until>statement_timestamp())
    and (p_kind<>'budget' or erp_private.notification_budget_target(p_source,p_profile) is not null)
$$;
create function erp_comm_cost.take_control_read(p_kind text,p_source uuid,p_profile bigint,p_session uuid,p_request uuid)
returns boolean language plpgsql set search_path='' as $$
declare b record; eligible jsonb;
begin
  if p_kind is null or p_kind not in ('sos','budget','control') or (p_source is not null and p_kind='control') or p_request is null
     or p_session is null or p_profile is null or erp_private.provider_actor_session_valid(p_profile,p_session) is not true then return false; end if;
  perform 1 from erp_comm_cost.authority where singleton for update;
  if exists(select from erp_comm_cost.control_read_receipt x where x.profile=p_profile and x.request=p_request) then return false; end if;
  if p_kind in ('control','budget') and (p_source is null or erp_private.notification_budget_target(p_source,p_profile) is not null)
    and exists(select from public.user_profiles u where u.id=p_profile and
      (exists(select from erp_comm_cost.authority o where o.owner_auth_id=u.auth_user_id)
       or exists(select from erp_comm_cost.alert_recipient t where t.auth_id=u.auth_user_id)))
    and erp_comm_cost.debit_control('budget_alert',p_profile::text,p_request,'read') is not null then
    insert into erp_comm_cost.control_read_receipt values(p_profile,p_request); return true; end if;
  if p_kind='budget' or to_regprocedure('erp_private.notification_sos_target(uuid,bigint)') is null then return false; end if;
  for b in select nb.source,l.max_control_reads from erp_comm_cost.notice_binding nb join erp_comm_cost.reservation r on r.permit_id=nb.origin
    join erp_comm_cost.sos_limit l on l.operation_id=r.operation_id where nb.profile=p_profile and (p_source is null or nb.source=p_source)
    order by nb.source desc limit 16 loop
    execute 'select erp_private.notification_sos_target($1,$2)' into eligible using b.source,p_profile;
    if eligible is not null and (select count(*) from erp_comm_cost.notice_read nr where nr.source=b.source and nr.profile=p_profile)<b.max_control_reads
      and not exists(select from erp_comm_cost.notice_read nr where nr.profile=p_profile and nr.request=p_request) then
      insert into erp_comm_cost.notice_read values(b.source,p_profile,p_request); insert into erp_comm_cost.control_read_receipt values(p_profile,p_request); return true;
    end if;
  end loop;
  return false;
end $$;
-- Private service operations use one persistent lock shared by every feature and billing scope.
create function erp_comm_cost.command(p_command text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  f erp_comm_cost.feature:=(p_payload->>'feature')::erp_comm_cost.feature;
  sc text:=p_payload->>'scope'; op text:=p_payload->>'operationId'; actor text:=p_payload->>'actorId';
  bound_session uuid; bound_hash bytea; source_op text:=op; from_envelope boolean:=false; owner_id uuid; n timestamptz; a erp_comm_cost.approval%rowtype; p erp_comm_cost.proof%rowtype;
  r erp_comm_cost.reservation%rowtype; e erp_comm_cost.final_evidence%rowtype;
  spool_info jsonb:='{}'::jsonb; floor_cost numeric; bound_cost numeric; booked numeric; cap numeric:=0; reason text;
  end_at timestamptz; thru timestamptz; cutoff timestamptz; required text[]; dimensions text[]; sound boolean;
begin
  select owner_auth_id into strict owner_id from erp_comm_cost.authority where singleton for update;
  n:=clock_timestamp();
  if p_command in ('bind_cleanup','authorize_cleanup','confirm_cleanup') then return erp_comm_cost.cleanup(p_command,p_payload); end if;
  if f is null or not exists(select from erp_comm_cost.scope s where s.name=sc) then raise exception 'Invalid feature scope'; end if;
  if p_command='pause' then
    reason:=p_payload->>'reason';
    if length(trim(coalesce(reason,''))) not between 1 and 256 then raise exception 'Invalid pause reason'; end if;
    insert into erp_comm_cost.pause(scope,feature,reason) values(sc,f,reason)
      on conflict(scope,feature) do update set reason=excluded.reason;
    perform erp_comm_cost.enqueue(jsonb_build_array(sc,f,'pause',reason)::text,'feature_paused',sc,f);
    return jsonb_build_object('ok',true);
  end if;
  if length(trim(coalesce(op,''))) not between 1 and 256 then raise exception 'Invalid operation'; end if;
  select * into r from erp_comm_cost.reservation where operation_id=op;
  if p_command='settle' then
    if r.permit_id is null or r.permit_id::text is distinct from p_payload->>'permitId' or r.scope<>sc or r.feature<>f then
      return jsonb_build_object('ok',false,'reason','unknown_permit');
    end if;
    select * into e from erp_comm_cost.final_evidence where evidence_id=p_payload->>'evidenceId' and permit_id=r.permit_id;
    if e.permit_id is null or e.confirmed_at>n or e.confirmed_at<r.issued_at or
       (p_payload->>'actualMicros') is distinct from e.actual_micros::text then
      return jsonb_build_object('ok',false,'reason','settlement_unconfirmed');
    end if;
    if r.settlement_evidence is not null and (r.settlement_evidence<>e.evidence_id or r.settled_micros<>e.actual_micros) then
      return jsonb_build_object('ok',false,'reason','settlement_conflict');
    end if;
    if exists(select from erp_comm_cost.control_pool cp where cp.permit_id=r.permit_id and cp.used<cp.max_actions and cp.valid_until>n) then
      return jsonb_build_object('ok',false,'reason','funded_control_outstanding'); end if;
    if exists(select from erp_comm_cost.cleanup_resource c where c.permit_id=r.permit_id and c.closed_at is null) then
      return jsonb_build_object('ok',false,'reason','cleanup_outstanding');
    end if;
    update erp_comm_cost.reservation set settled_micros=e.actual_micros, settlement_evidence=e.evidence_id,
      settled_at=coalesce(settled_at,n) where permit_id=r.permit_id;
    if e.actual_micros>r.reserved_micros then
      insert into erp_comm_cost.pause(scope,feature,reason) values(sc,f,'cost_bound_exceeded')
        on conflict(scope,feature) do update set reason='cost_bound_exceeded';
      perform erp_comm_cost.enqueue(op||'/over','cost_bound_exceeded',sc,f);
      return jsonb_build_object('ok',false,'reason','cost_bound_exceeded');
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if p_command is distinct from 'reserve' then raise exception 'Unknown operation'; end if;
  if coalesce(p_payload->>'upperBoundMicros','') !~ '^(0|[1-9][0-9]{0,29})$'
      or length(trim(coalesce(actor,''))) not between 1 and 256 or not (p_payload ? 'liabilityEndsAt') then
    raise exception 'Invalid reservation input';
  end if;
  if owner_id is null or not exists(select from public.user_profiles u where u.auth_user_id=owner_id
    and u.status='active' and u.must_change_password is false) then
    return jsonb_build_object('ok',false,'reason','owner_binding_unverified');
  end if;
  if p_payload ? 'binding' then
    if jsonb_typeof(p_payload->'binding'->'command') is distinct from 'object' or
       pg_column_size(p_payload->'binding'->'command')>524288 or not (p_payload->'binding' ? 'actorSessionId')
       then raise sqlstate '22023'; end if;
    bound_session:=(p_payload->'binding'->>'actorSessionId')::uuid;
    bound_hash:=sha256(convert_to((p_payload->'binding'->'command')::text,'UTF8'));
  end if;
  floor_cost:=(p_payload->>'upperBoundMicros')::numeric;
  end_at:=(p_payload->>'liabilityEndsAt')::timestamptz;
  if end_at is not null and (not isfinite(end_at) or end_at<=n) then
    return jsonb_build_object('ok',false,'reason','liability_expired');
  end if;
  if exists(select from erp_comm_cost.pause where scope=sc and feature=f) then
    return jsonb_build_object('ok',false,'reason','feature_paused');
  end if;
  select * into p from erp_comm_cost.proof where operation_id=op for share;
  if exists(select from erp_comm_cost.standing_envelope s where s.template_id=op) then
    return jsonb_build_object('ok',false,'reason','operation_conflict');
  end if;
  if p.operation_id is null then
    select s.template_id into source_op from erp_comm_cost.standing_envelope s
      where s.scope=sc and s.feature=f and s.enabled for share;
    select * into p from erp_comm_cost.proof where operation_id=source_op for share;
    if p.operation_id is null then return jsonb_build_object('ok',false,'reason','billing_evidence_unavailable'); end if;
    from_envelope:=true;
    if end_at>p.operational_stop_by then return jsonb_build_object('ok',false,'reason','operation_exceeds_envelope'); end if;
  end if;
  if p.scope<>sc or p.feature<>f or (not from_envelope and (p.actor_id<>actor or p.liability_ends_at is distinct from end_at)) then
    return jsonb_build_object('ok',false,'reason','operation_conflict');
  end if;
  if p.valid_until<=n or p.operational_stop_by<=n then return jsonb_build_object('ok',false,'reason','proof_expired'); end if;
  if length(trim(coalesce(p.retained_at_zero_cost_evidence,'')))=0 then
    return jsonb_build_object('ok',false,'reason','continuing_retention_unproven');
  end if;
  if f in ('ptt_live','media_upload') and not exists(select from erp_comm_cost.cleanup_limit l where l.operation_id=source_op
       and l.endpoint=case when f='ptt_live' then 'close_sfu_tracks' else 'discard_partial_upload' end) then
    return jsonb_build_object('ok',false,'reason','cleanup_allocation_unavailable');
  end if;
  if f='sos' and (end_at is not null or not exists(select from erp_comm_cost.sos_limit l where l.operation_id=source_op)) then
    return jsonb_build_object('ok',false,'reason','sos_cancellation_envelope_unavailable');
  end if;
  required:=array['railway','database']||case
    when f in ('media_upload','media_download','export','ptt_replay') then array['storage']
    when f='ptt_live' then array['sfu_turn']
    when f in ('sos','push') then array['fcm']
    when f='realtime' then array['realtime'] else array[]::text[] end;
  thru:=greatest(end_at,p.operational_stop_by);
  select array_agg(m.dimension), sum(m.upper_micros), least(min(m.valid_until),min(m.observed_at+p.max_meter_age),p.valid_until,p.operational_stop_by,end_at),
     bool_and(m.complete and m.observed_at<=n and m.observed_at>=n-p.max_meter_age and
       m.valid_until>n and m.covered_until>=thru) into dimensions,bound_cost,cutoff,sound
    from erp_comm_cost.meter m where m.operation_id=source_op;
  if sound is not true or cutoff<=n or (dimensions @> required) is not true then
    return jsonb_build_object('ok',false,'reason','meter_stale_or_incomplete');
  end if;
  -- Even an ephemeral heartbeat creates durable financial evidence and physical-unit holds.
  -- Require a metered positive byte reservation for each independent ledger operation.
  if not exists(select from erp_comm_cost.meter m join erp_comm_cost.capacity c on c.id=m.capacity_id
    where m.operation_id=source_op and m.dimension='database' and c.dimension='database' and c.unit='permanent_ledger_bytes'
      and m.upper_units >= 65536 + octet_length(to_jsonb(p)::text) +
        (select coalesce(sum(16384+octet_length(to_jsonb(x)::text)),0) from erp_comm_cost.meter x where x.operation_id=source_op) +
        (select coalesce(sum(16384::numeric*l.max_resources*(1+l.max_attempts)),0) from erp_comm_cost.cleanup_limit l where l.operation_id=source_op) +
        (select coalesce(sum(32768::numeric*(l.max_recipients+l.max_devices::numeric)*(1+l.max_push_attempts+l.max_control_reads)),0)
            from erp_comm_cost.sos_limit l where l.operation_id=source_op)) then
    return jsonb_build_object('ok',false,'reason','ledger_retention_capacity_unproven');
  end if;
  if f='export' and not exists(select from erp_comm_cost.export_spool_limit sl join erp_comm_cost.meter mm on mm.operation_id=sl.operation_id
    join erp_comm_cost.capacity c on c.id=mm.capacity_id where sl.operation_id=source_op and c.dimension='railway' and
    c.unit='encrypted_spool_byte_hours' and p.operational_stop_by>=n+make_interval(secs=>sl.cleanup_tail_seconds) and
    mm.upper_units>=ceil(sl.bytes_per_slot::numeric*sl.slots_per_volume*sl.max_volumes*sl.cleanup_tail_seconds/3600))
    then return jsonb_build_object('ok',false,'reason','export_spool_lifetime_unproven'); end if;
  if f='export' then
    select jsonb_build_object('spool',jsonb_build_object('bytesPerSlot',s.bytes_per_slot::text,'slotsPerVolume',s.slots_per_volume,
      'maxVolumes',s.max_volumes,'cleanupTailSeconds',s.cleanup_tail_seconds)) into spool_info
    from erp_comm_cost.export_spool_limit s where s.operation_id=source_op;
  end if;
  bound_cost:=greatest(bound_cost,floor_cost);
  if p.approval_id is not null then
    select * into a from erp_comm_cost.approval where id=p.approval_id;
    if owner_id is null or a.id is null or a.owner_auth_id<>owner_id or a.scope<>sc or not(f=any(a.features))
       or not exists(select from public.user_profiles u where u.auth_user_id=owner_id and u.status='active' and u.must_change_password is false)
       or a.revoked_at is not null or a.approved_at>n or a.ends_at<=n then
      return jsonb_build_object('ok',false,'reason','owner_approval_invalid');
    end if;
    if thru>a.ends_at then return jsonb_build_object('ok',false,'reason','liability_exceeds_approval'); end if;
    cap:=a.max_micros; cutoff:=least(cutoff,a.ends_at);
  elsif bound_cost>0 or p.headroom_micros>0 then
    return jsonb_build_object('ok',false,'reason','owner_approval_required');
  end if;
  if exists(select from erp_comm_cost.meter m join erp_comm_cost.capacity c on c.id=m.capacity_id
    where m.operation_id=source_op and (not c.enabled or c.dimension<>m.dimension or c.valid_from>n or c.valid_until<thru
      or (select coalesce(sum(h.units),0) from erp_comm_cost.unit_hold h where h.capacity_id=c.id
            and h.permit_id is distinct from r.permit_id)+m.upper_units>c.available_units)) then
    return jsonb_build_object('ok',false,'reason','provider_capacity_exhausted');
  end if;
  -- Every active billing recipient must already have independent read and push capacity.
  -- A bound funding-only RPC can provision a missing alert pool. That permit is unusable as a user/work RPC.
  if coalesce((p_payload->'binding'->'command'->>'op'='budget.fundControl' and
              p_payload->'binding'->'command'->>'kind'='budget_alert' and f='push'),false) is false and exists (
    select from (select owner_id as id union select t.auth_id from erp_comm_cost.alert_recipient t) as recipients
    left join public.user_profiles u on u.auth_user_id=recipients.id where
      not exists(select from erp_comm_cost.control_pool cp where cp.kind='budget_alert' and cp.subject=u.id::text
        and cp.enabled and cp.valid_until>=thru and cp.used<cp.max_actions
        and (select count(*) from erp_comm_cost.control_debit cd where cd.pool=cp.permit_id and cd.lane='push')<cp.max_actions/2
        and (select count(*) from erp_comm_cost.control_debit cd where cd.pool=cp.permit_id and cd.lane='read')<cp.max_actions-cp.max_actions/2)
  ) then return jsonb_build_object('ok',false,'reason','owner_alert_capacity_unavailable'); end if;
  if r.permit_id is not null then
    if exists(select m.capacity_id,m.upper_units from erp_comm_cost.meter m where m.operation_id=source_op
      except select h.capacity_id,h.units from erp_comm_cost.unit_hold h where h.permit_id=r.permit_id) then
      return jsonb_build_object('ok',false,'reason','operation_closed_or_changed');
    end if;
    if r.settlement_evidence is not null or r.consumed_at is not null or r.expires_at<=n or r.floor_micros<>floor_cost
         or r.actor_session is distinct from bound_session or r.command_hash is distinct from bound_hash
         or r.approval_id is distinct from p.approval_id or r.reserved_micros<bound_cost then
      return jsonb_build_object('ok',false,'reason','operation_closed_or_changed');
    end if;
    return jsonb_build_object('ok',true,'permitId',r.permit_id,'expiresAt',least(cutoff,r.expires_at),'newReservation',false)||spool_info;
  end if;
  select coalesce(sum(coalesce(x.settled_micros,x.reserved_micros)),0) into booked
    from erp_comm_cost.reservation x where x.approval_id is not distinct from p.approval_id;
  if booked+p.headroom_micros+bound_cost>cap then
    perform erp_comm_cost.enqueue(coalesce(a.id::text,'free')||'/exhausted','budget_exhausted',sc,f);
    return jsonb_build_object('ok',false,'reason','budget_exhausted');
  end if;
  if from_envelope then
    insert into erp_comm_cost.proof
    (operation_id,scope,actor_id,feature,liability_ends_at,operational_stop_by,valid_until,max_meter_age,
      retained_at_zero_cost_evidence,shutdown_evidence,headroom_micros,approval_id)
    values(op,sc,actor,f,end_at,p.operational_stop_by,p.valid_until,p.max_meter_age,
      p.retained_at_zero_cost_evidence,p.shutdown_evidence,p.headroom_micros,p.approval_id);
    insert into erp_comm_cost.meter(operation_id,dimension,evidence_id,complete,observed_at,valid_until,covered_until,
      upper_micros,capacity_id,upper_units)
    select op,m.dimension,m.evidence_id,m.complete,m.observed_at,m.valid_until,m.covered_until,m.upper_micros,m.capacity_id,m.upper_units
    from erp_comm_cost.meter m where m.operation_id=source_op;
    insert into erp_comm_cost.cleanup_limit(operation_id,endpoint,max_resources,max_attempts)
      select op,l.endpoint,l.max_resources,l.max_attempts from erp_comm_cost.cleanup_limit l where l.operation_id=source_op;
    insert into erp_comm_cost.export_spool_limit
      select op,sl.bytes_per_slot,sl.slots_per_volume,sl.max_volumes,sl.cleanup_tail_seconds,sl.export_spool_evidence
      from erp_comm_cost.export_spool_limit sl where sl.operation_id=source_op;
    insert into erp_comm_cost.sos_limit
      select op,l.max_recipients,l.max_devices,l.cancellation_evidence,l.post_expiry_zero_cost_evidence,l.max_push_attempts,l.max_control_reads
      from erp_comm_cost.sos_limit l where l.operation_id=source_op;
  end if;
  insert into erp_comm_cost.reservation(operation_id,permit_id,scope,actor_id,feature,approval_id,liability_ends_at,
      floor_micros,reserved_micros,issued_at,expires_at,actor_session,command_hash)
    values(op,gen_random_uuid(),sc,actor,f,p.approval_id,end_at,floor_cost,bound_cost,n,cutoff,bound_session,bound_hash) returning * into r;
  insert into erp_comm_cost.unit_hold(permit_id,capacity_id,units)
    select r.permit_id,m.capacity_id,m.upper_units from erp_comm_cost.meter m where m.operation_id=source_op;
  if cap>0 and (booked+bound_cost+p.headroom_micros)*100>=cap*80 then
    perform erp_comm_cost.enqueue(a.id::text||'/80','budget_early_warning',sc,f);
  end if;
  return jsonb_build_object('ok',true,'permitId',r.permit_id,'expiresAt',r.expires_at,'newReservation',true)||spool_info;
end $$;

create function public.erp_comm_budget_command(p_command text,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select erp_comm_cost.command(p_command,p_payload)
$$;

-- Security-definer feature RPCs invoke these within their own effect transaction.
-- No client role, including service_role, receives execute permission on these private helpers.
create function erp_comm_cost.take_service_permit(
  p_permit uuid,p_feature text,p_scope text,p_profile text,p_session uuid,p_command jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare o uuid; n timestamptz; r erp_comm_cost.reservation%rowtype;
begin
  select owner_auth_id into strict o from erp_comm_cost.authority where singleton for update;
  n:=clock_timestamp();
  if o is null or p_session is null or p_permit is null or coalesce(p_profile,'') !~ '^[1-9][0-9]{0,18}$'
     or jsonb_typeof(p_command) is distinct from 'object' or
     erp_private.provider_actor_session_valid(p_profile::bigint,p_session) is not true
     or not exists(select from public.user_profiles u where u.auth_user_id=o and u.status='active' and u.must_change_password is false)
     then raise sqlstate 'PT503' using message='budget_permit_unavailable'; end if;
  select * into r from erp_comm_cost.reservation where permit_id=p_permit;
  if r.permit_id is null or r.consumed_at is not null or r.settled_at is not null or r.expires_at<=n
    or r.scope is distinct from p_scope or r.feature::text is distinct from p_feature or r.actor_id is distinct from p_profile
    or r.actor_session is distinct from p_session or r.command_hash is distinct from sha256(convert_to(p_command::text,'UTF8'))
    or exists(select from erp_comm_cost.pause q where q.scope=r.scope and q.feature=r.feature)
    or exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
      where h.permit_id=p_permit and (not c.enabled or c.valid_until<=n))
    or (r.approval_id is not null and not exists(select from erp_comm_cost.approval a where a.id=r.approval_id and
      a.owner_auth_id=o and a.revoked_at is null and a.ends_at>n))
    then raise sqlstate 'PT503' using message='budget_permit_unavailable'; end if;
  update erp_comm_cost.reservation set consumed_at=n, consumed_xid=pg_current_xact_id() where permit_id=p_permit;
end $$;
create function erp_comm_cost.take_permit(
  p_permit uuid,p_feature text,p_scope text,p_profile text,p_command jsonb
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or public.f03_current_session_valid() is not true or erp_private.business_principal_is_active() is not true
    or not exists(select from public.user_profiles u where u.id::text=p_profile and u.auth_user_id=auth.uid()
      and u.status='active' and u.must_change_password is false) then raise insufficient_privilege; end if;
  perform erp_comm_cost.take_service_permit(p_permit,p_feature,p_scope,p_profile,(auth.jwt()->>'session_id')::uuid,p_command);
end $$;
create table erp_comm_cost.operator_receipt (
  actor uuid not null, id uuid not null, op text not null, args jsonb not null, outcome jsonb not null,
  primary key(actor,id)
);
create function erp_comm_cost.operator(p_profile text,p_session uuid,p_op text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); owner_id uuid; is_owner boolean; allowed boolean;
  sc text:=p_args->>'scope'; n timestamptz; mutation_id uuid; ids text[]; profiles text[]; target text;
  old erp_comm_cost.operator_receipt%rowtype; a erp_comm_cost.approval%rowtype;
  answer jsonb; details jsonb; pauses jsonb; approval_sum numeric; reservation_sum numeric;
begin
  if uid is null or p_session is null or (auth.jwt()->>'session_id') is distinct from p_session::text
    or public.f03_current_session_valid() is not true or erp_private.business_principal_is_active() is not true
    or not exists(select from public.user_profiles u where u.id::text=p_profile and u.auth_user_id=uid
      and u.status='active' and u.must_change_password is false) then raise insufficient_privilege; end if;
  if not exists(select from erp_comm_cost.scope s where s.name=sc) then raise sqlstate '22023'; end if;
  select owner_auth_id into strict owner_id from erp_comm_cost.authority where singleton for update;
  n:=clock_timestamp(); is_owner:=coalesce(uid=owner_id,false);
  allowed:=owner_id is not null and (is_owner or exists(select from erp_comm_cost.alert_recipient r where r.auth_id=uid));
  if p_op='budget.status' then
    if not allowed then
      return jsonb_build_object('scope',sc,'canApprove',false,'canMonitor',false,'heldReasons',jsonb_build_array('communications_controlled'));
    end if;
    select * into a from erp_comm_cost.approval x where x.scope=sc and x.owner_auth_id=owner_id and x.revoked_at is null
      and x.ends_at>n order by x.approved_at desc limit 1;
    if found then
      select coalesce(sum(r.settled_micros),0),coalesce(sum(r.reserved_micros) filter(where r.settled_at is null),0)
        into approval_sum,reservation_sum from erp_comm_cost.reservation r where r.approval_id=a.id;
      details:=jsonb_build_object('id',a.id,'maxMicros',a.max_micros::text,'spentMicros',approval_sum::text,
        'reservedMicros',reservation_sum::text,'endsAt',a.ends_at,'currency','USD','features',a.features);
    end if;
    select coalesce(jsonb_object_agg(q.feature,q.reason),'{}'::jsonb) into pauses from erp_comm_cost.pause q where q.scope=sc;
    return jsonb_build_object('scope',sc,'canApprove',is_owner,'canMonitor',allowed,'ownerBound',true,'approval',details,
      'paused',pauses,'heldReasons',case when exists(select from erp_comm_cost.standing_envelope e join erp_comm_cost.proof p
        on p.operation_id=e.template_id where e.scope=sc and e.enabled and p.valid_until>n)
        then '[]'::jsonb else jsonb_build_array('provider_evidence_required') end);
  end if;
  if not allowed then raise insufficient_privilege; end if;
  if p_op='budget.monitor' and not (p_args ? 'recipientProfileIds') then
    select coalesce(array_agg(u.id::text order by u.id),array[]::text[]) into ids
      from public.user_profiles u join erp_comm_cost.alert_recipient r on r.auth_id=u.auth_user_id
      where u.status='active' and u.must_change_password is false;
    return jsonb_build_object('scope',sc,'recipientProfileIds',ids,'canEdit',is_owner);
  end if;
  if p_op is null or p_op not in ('budget.approve','budget.pause','budget.revoke','budget.monitor') then raise sqlstate '22023'; end if;
  if p_op<>'budget.pause' and not is_owner then raise insufficient_privilege; end if;
  mutation_id:=(p_args->>'clientMutationId')::uuid;
  if mutation_id is null then raise sqlstate '22023'; end if;
  if p_op<>'budget.pause' and not exists(select from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) amr
    where amr->>'method' in ('password','totp','webauthn','mfa/totp','mfa/phone') and
    case when amr->>'timestamp' ~ '^[0-9]{1,12}$' then to_timestamp((amr->>'timestamp')::double precision)
      between n-interval '5 minutes' and n else false end) then raise insufficient_privilege; end if;
  select * into old from erp_comm_cost.operator_receipt r where r.actor=uid and r.id=mutation_id;
  if found then
    if old.op<>p_op or old.args<>p_args then raise sqlstate 'PT409'; end if;
    return old.outcome;
  end if;
  if p_op='budget.approve' then
    if (p_args->>'currency') is distinct from 'USD' then raise sqlstate '22023'; end if;
    select array_agg(t) into ids from jsonb_array_elements_text(p_args->'features') t;
    answer:=erp_comm_cost.owner_decision(mutation_id,sc,ids,p_args->>'maxMicros',(p_args->>'endsAt')::timestamptz,false);
  elsif p_op='budget.revoke' then
    if exists(select from erp_comm_cost.approval v where v.id=(p_args->>'approvalId')::uuid and v.scope=sc and
      v.owner_auth_id=uid and v.revoked_at is not null) then return jsonb_build_object('ok',true,'id',p_args->'approvalId'); end if;
    answer:=erp_comm_cost.owner_decision((p_args->>'approvalId')::uuid,sc,null,null,null,true);
  elsif p_op='budget.pause' then
    if exists(select from erp_comm_cost.pause x where x.scope=sc and x.feature::text=p_args->>'feature') then return jsonb_build_object('ok',true); end if;
    answer:=erp_comm_cost.command('pause',p_args);
  else
    if jsonb_typeof(p_args->'recipientProfileIds') is distinct from 'array'
       or jsonb_array_length(p_args->'recipientProfileIds')>100 then raise sqlstate '22023'; end if;
    select coalesce(array_agg(t order by t),array[]::text[]) into ids from jsonb_array_elements_text(p_args->'recipientProfileIds') t;
    select coalesce(array_agg(u.id::text order by u.id::text),array[]::text[]) into profiles from public.user_profiles u
      where u.id::text=any(ids) and u.status='active' and u.must_change_password is false and u.auth_user_id is not null
      and u.auth_user_id<>owner_id;
    if ids<>profiles then raise sqlstate '22023' using message='Select distinct active technical recipients'; end if;
    if ids=coalesce((select array_agg(u.id::text order by u.id::text) from erp_comm_cost.alert_recipient r
      join public.user_profiles u on u.auth_user_id=r.auth_id),array[]::text[]) then
      return jsonb_build_object('ok',true,'scope',sc,'recipientProfileIds',ids); end if;
    delete from erp_comm_cost.alert_recipient;
    insert into erp_comm_cost.alert_recipient select u.auth_user_id from public.user_profiles u where u.id::text=any(ids);
    answer:=jsonb_build_object('ok',true,'scope',sc,'recipientProfileIds',ids);
  end if;
  insert into erp_comm_cost.operator_receipt values(uid,mutation_id,p_op,p_args,answer);
  return answer;
end $$;

create function public.erp_comm_budget_operator(p_profile text,p_session uuid,p_op text,p_args jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select erp_comm_cost.operator(p_profile,p_session,p_op,p_args)
$$;
revoke all on function public.erp_comm_budget_operator(text,uuid,text,jsonb) from public,anon,authenticated,service_role;
-- Feed the existing notification pipeline by durable event ID. No scheduler is installed.
create function erp_comm_cost.monitor_events(p_after bigint,p_take integer)
returns table(event_id bigint, recipient_auth_id uuid, reason text, scope text, feature text, created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare item erp_comm_cost.approval%rowtype; n timestamptz;
begin
  if p_after is null or p_after<0 or p_take is null or p_take not between 1 and 100 then raise exception 'Invalid event page'; end if;
  perform 1 from erp_comm_cost.authority where singleton for update;
  n:=clock_timestamp();
  for item in select a.* from erp_comm_cost.approval a where a.revoked_at is null and a.ends_at<=n+interval '24 hours'
  loop
    if item.ends_at<=n then
      perform erp_comm_cost.enqueue(item.id::text||'/expired','approval_expired',item.scope,null);
    else
      perform erp_comm_cost.enqueue(item.id::text||'/expiring','approval_ending_soon',item.scope,null);
    end if;
  end loop;
  return query select e.event_id,e.recipient_auth_id,e.reason,e.scope,e.feature::text,e.created_at
    from erp_comm_cost.alert e where e.event_id>p_after and exists (
      select from public.user_profiles u where u.auth_user_id=e.recipient_auth_id and u.status='active' and u.must_change_password is false
    ) and (exists(select from erp_comm_cost.authority o where o.owner_auth_id=e.recipient_auth_id)
       or exists(select from erp_comm_cost.alert_recipient r where r.auth_id=e.recipient_auth_id))
    order by e.event_id limit p_take;
end $$;
create function public.erp_comm_budget_monitor_events(p_after bigint,p_take integer)
returns table(event_id bigint, recipient_auth_id uuid, reason text, scope text, feature text, created_at timestamptz)
language sql security invoker set search_path='' as $$
  select * from erp_comm_cost.monitor_events(p_after,p_take)
$$;
revoke all on function public.erp_comm_budget_monitor_events(bigint,integer) from public,anon,authenticated,service_role;
revoke all on all tables in schema erp_comm_cost from public,anon,authenticated,service_role;
revoke all on all functions in schema erp_comm_cost from public,anon,authenticated,service_role;
revoke all on function public.erp_comm_budget_command(text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema erp_comm_cost to authenticated,service_role;
grant execute on function public.erp_comm_budget_operator(text,uuid,text,jsonb),erp_comm_cost.operator(text,uuid,text,jsonb) to authenticated;
grant execute on function public.erp_comm_budget_monitor_events(bigint,integer),erp_comm_cost.monitor_events(bigint,integer) to service_role;
grant execute on function public.erp_comm_budget_command(text,jsonb),erp_comm_cost.command(text,jsonb) to service_role;

commit;
