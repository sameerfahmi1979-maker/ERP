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
  actor_session uuid, command_hash bytea, consumed_at timestamptz,
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
create table erp_comm_cost.cleanup_resource (
  permit_id uuid not null references erp_comm_cost.reservation(permit_id), endpoint text not null, resource_id text not null,
  max_attempts integer not null check(max_attempts between 1 and 20), closed_at timestamptz,
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
-- Private service operations use one persistent lock shared by every feature and billing scope.
create function erp_comm_cost.command(p_command text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  f erp_comm_cost.feature:=(p_payload->>'feature')::erp_comm_cost.feature;
  sc text:=p_payload->>'scope'; op text:=p_payload->>'operationId'; actor text:=p_payload->>'actorId';
  bound_session uuid; bound_hash bytea; source_op text:=op; from_envelope boolean:=false; owner_id uuid; n timestamptz; a erp_comm_cost.approval%rowtype; p erp_comm_cost.proof%rowtype;
  r erp_comm_cost.reservation%rowtype; e erp_comm_cost.final_evidence%rowtype;
  floor_cost numeric; bound_cost numeric; booked numeric; cap numeric:=0; reason text;
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
  if (end_at is null or f in ('chat','media_upload')) and length(trim(coalesce(p.retained_at_zero_cost_evidence,'')))=0 then
    return jsonb_build_object('ok',false,'reason','continuing_retention_unproven');
  end if;
  if f in ('ptt_live','media_upload') and not exists(select from erp_comm_cost.cleanup_limit l where l.operation_id=source_op
       and l.endpoint=case when f='ptt_live' then 'close_sfu_tracks' else 'discard_partial_upload' end) then
    return jsonb_build_object('ok',false,'reason','cleanup_allocation_unavailable');
  end if;
  required:=array['railway','database']||case
    when f in ('media_upload','media_download','export','ptt_replay') then array['storage']
    when f='ptt_live' then array['sfu_turn']
    when f='push' then array['fcm']
    when f='realtime' then array['realtime'] else array[]::text[] end;
  thru:=greatest(end_at,p.operational_stop_by);
  select array_agg(m.dimension), sum(m.upper_micros), least(min(m.valid_until),min(m.observed_at+p.max_meter_age),p.valid_until,p.operational_stop_by,end_at),
     bool_and(m.complete and m.observed_at<=n and m.observed_at>=n-p.max_meter_age and
       m.valid_until>n and m.covered_until>=thru) into dimensions,bound_cost,cutoff,sound
    from erp_comm_cost.meter m where m.operation_id=source_op;
  if sound is not true or cutoff<=n or (dimensions @> required) is not true then
    return jsonb_build_object('ok',false,'reason','meter_stale_or_incomplete');
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
    return jsonb_build_object('ok',true,'permitId',r.permit_id,'expiresAt',least(cutoff,r.expires_at),'newReservation',false);
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
  end if;
  insert into erp_comm_cost.reservation(operation_id,permit_id,scope,actor_id,feature,approval_id,liability_ends_at,
      floor_micros,reserved_micros,issued_at,expires_at,actor_session,command_hash)
    values(op,gen_random_uuid(),sc,actor,f,p.approval_id,end_at,floor_cost,bound_cost,n,cutoff,bound_session,bound_hash) returning * into r;
  insert into erp_comm_cost.unit_hold(permit_id,capacity_id,units)
    select r.permit_id,m.capacity_id,m.upper_units from erp_comm_cost.meter m where m.operation_id=source_op;
  if cap>0 and (booked+bound_cost+p.headroom_micros)*100>=cap*80 then
    perform erp_comm_cost.enqueue(a.id::text||'/80','budget_early_warning',sc,f);
  end if;
  return jsonb_build_object('ok',true,'permitId',r.permit_id,'expiresAt',r.expires_at,'newReservation',true);
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
  update erp_comm_cost.reservation set consumed_at=n where permit_id=p_permit;
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
    answer:=erp_comm_cost.owner_decision((p_args->>'approvalId')::uuid,sc,null,null,null,true);
  elsif p_op='budget.pause' then
    answer:=erp_comm_cost.command('pause',p_args);
  else
    if jsonb_typeof(p_args->'recipientProfileIds') is distinct from 'array'
       or jsonb_array_length(p_args->'recipientProfileIds')>100 then raise sqlstate '22023'; end if;
    select coalesce(array_agg(t order by t),array[]::text[]) into ids from jsonb_array_elements_text(p_args->'recipientProfileIds') t;
    select coalesce(array_agg(u.id::text order by u.id::text),array[]::text[]) into profiles from public.user_profiles u
      where u.id::text=any(ids) and u.status='active' and u.must_change_password is false and u.auth_user_id is not null
      and u.auth_user_id<>owner_id;
    if ids<>profiles then raise sqlstate '22023' using message='Select distinct active technical recipients'; end if;
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
