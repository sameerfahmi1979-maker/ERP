-- Approved policy capability only. No owner/approval, measurement, allocation, service,
-- amount, feature, provider, worker or runtime is enrolled or enabled by this migration.
begin;

comment on column erp_comm_cost.proof.retained_at_zero_cost_evidence is
 'Legacy evidence name: independent continuing zero-extra-cost evidence, or canonical existing-plan:<allocation UUID> for measured, finite owner-approved existing-plan baseline coverage. The typed marker is not a perpetual free-storage promise.';

-- An approval row alone cannot establish provenance. Only successful fresh authenticated
-- owner decisions capture this immutable financial fingerprint, including idempotent approval.
create table erp_comm_cost.baseline_approval_receipt (
 approval_id uuid primary key references erp_comm_cost.approval(id),
 owner_auth_id uuid not null unique references auth.users(id),
 approved_at timestamptz not null,
 fingerprint bytea not null,
 confirmed_at timestamptz not null default clock_timestamp() check(isfinite(confirmed_at))
);
create function erp_comm_cost.baseline_approval_fingerprint(a erp_comm_cost.approval)
returns bytea language sql immutable set search_path='' as $$
 select sha256(convert_to(jsonb_build_array(a.id,a.owner_auth_id,a.scope,a.features,a.currency,
   a.max_micros,extract(epoch from a.approved_at),extract(epoch from a.step_up_at),extract(epoch from a.ends_at))::text,'UTF8'))
$$;
create function erp_comm_cost.record_baseline_owner_approval(p_id uuid)
returns void language plpgsql set search_path='' as $$
declare a erp_comm_cost.approval%rowtype; n timestamptz:=clock_timestamp(); recent timestamptz;
begin
 select * into a from erp_comm_cost.approval where id=p_id;
 -- This finite policy is EXACTLY the owner's USD 5 total, nine-feature pilot.
 -- Unrelated historical financial grants retain their independent zero-cost policy.
 if a.id is null or a.scope<>'communications' or a.currency<>'USD' or a.max_micros<>5000000
   or a.ends_at<>'2026-11-30T19:59:00Z'::timestamptz
   or a.features<>array['chat','realtime','media_upload','media_download','export','push','ptt_live','ptt_replay','sos']::erp_comm_cost.feature[] then
   return;
 end if;
 select max(to_timestamp((x->>'timestamp')::double precision)) into recent
 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) x
 where x->>'method' in ('password','totp','webauthn','mfa/totp','mfa/phone')
   and (x->>'timestamp') ~ '^[0-9]{1,12}$';
 if auth.uid() is null or auth.uid() is distinct from a.owner_auth_id
   or not exists(select from erp_comm_cost.authority o where o.singleton and o.owner_auth_id=auth.uid())
   or public.f03_current_session_valid() is not true or erp_private.business_principal_is_active() is not true
   or recent is null or recent>n or recent<n-interval '5 minutes'
   or a.approved_at>n or a.ends_at<=n or a.revoked_at is not null then
   raise insufficient_privilege using message='Fresh authenticated baseline owner approval required';
 end if;
 if exists(select from erp_comm_cost.baseline_approval_receipt r where r.owner_auth_id=a.owner_auth_id and r.approval_id<>a.id)
   or exists(select from erp_comm_cost.approval prior where prior.owner_auth_id=a.owner_auth_id and prior.id<>a.id
     and prior.scope='communications' and prior.currency='USD' and prior.max_micros=5000000
     and prior.ends_at='2026-11-30T19:59:00Z'::timestamptz
     and prior.features=array['chat','realtime','media_upload','media_download','export','push','ptt_live','ptt_replay','sos']::erp_comm_cost.feature[]) then
   raise sqlstate '22023' using message='Pilot baseline total already approved; new approval cannot reset USD 5';
 end if;
 insert into erp_comm_cost.baseline_approval_receipt(approval_id,owner_auth_id,approved_at,fingerprint)
 values(a.id,a.owner_auth_id,a.approved_at,erp_comm_cost.baseline_approval_fingerprint(a))
 on conflict(approval_id) do nothing;
 if not exists(select from erp_comm_cost.baseline_approval_receipt r where r.approval_id=a.id
   and r.owner_auth_id=a.owner_auth_id and r.fingerprint=erp_comm_cost.baseline_approval_fingerprint(a)) then
   raise exception 'Immutable baseline approval receipt conflict';
 end if;
end $$;
do $patch_owner$
declare source text; needle text:='return jsonb_build_object(''ok'',true,''id'',p_id);';
begin
 source:=pg_get_functiondef('erp_comm_cost.owner_decision(uuid,text,text[],text,timestamp with time zone,boolean)'::regprocedure);
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>3 then
   raise exception 'Unexpected owner-decision source; baseline approval provenance not installed';
 end if;
 source:=replace(source,needle,'if p_revoke is false then perform erp_comm_cost.record_baseline_owner_approval(p_id); end if; '||needle);
 execute source;
 -- Previously approved records need fresh owner re-confirmation through the same
 -- authenticated operator endpoint. Preserve historical expired/revoked replay results.
 source:=pg_get_functiondef('erp_comm_cost.operator(text,uuid,text,jsonb)'::regprocedure);
 needle:='return old.outcome;';
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then
   raise exception 'Unexpected owner operator source';
 end if;
 execute replace(source,needle,'if p_op=''budget.approve''
   and not exists(select from erp_comm_cost.baseline_approval_receipt br where br.approval_id=mutation_id)
   and exists(select from erp_comm_cost.approval ba where ba.id=mutation_id and ba.owner_auth_id=uid and ba.revoked_at is null and ba.ends_at>n) then
     select array_agg(t) into ids from jsonb_array_elements_text(p_args->''features'') t;
     perform erp_comm_cost.owner_decision(mutation_id,sc,ids,p_args->>''maxMicros'',(p_args->>''endsAt'')::timestamptz,false);
   end if; '||needle);
end $patch_owner$;

-- These are independently measured PHYSICAL byte slots of the existing subscriptions,
-- not provider request allowances, price estimates, byte-hours, or application row sizes.
-- A trusted commissioner refreshes observations; client/API roles have no write access.
create table erp_comm_cost.baseline_capacity_evidence (
 capacity_id bigint primary key references erp_comm_cost.capacity(id),
 plan_reference text not null check(length(trim(plan_reference)) between 1 and 2048),
 evidence_id text not null check(length(trim(evidence_id)) between 1 and 2048),
 observed_at timestamptz not null check(isfinite(observed_at)),
 valid_until timestamptz not null check(isfinite(valid_until)),
 max_measurement_age interval not null check(max_measurement_age>interval '0 seconds' and max_measurement_age<=interval '5 minutes'),
 physical_limit_bytes erp_comm_cost.micros not null check(physical_limit_bytes>0),
 observed_total_bytes erp_comm_cost.micros not null,
 observed_communications_bytes erp_comm_cost.micros not null,
 reserved_other_bytes erp_comm_cost.micros not null,
 safety_headroom_bytes erp_comm_cost.micros not null check(safety_headroom_bytes>0),
 allocated_bytes erp_comm_cost.micros not null check(allocated_bytes>0),
 enabled boolean not null default false,
 check(observed_at<valid_until),
 check(observed_communications_bytes<=observed_total_bytes)
);
create function erp_comm_cost.baseline_measurement_valid(p_capacity bigint,p_through timestamptz)
returns boolean language sql volatile set search_path='' as $$
 select exists(select from erp_comm_cost.baseline_capacity_evidence e join erp_comm_cost.capacity c on c.id=e.capacity_id
 where c.id=p_capacity and c.enabled and e.enabled and c.valid_from<=clock_timestamp()
   and c.valid_until>=p_through and e.valid_until>=p_through and e.valid_until>clock_timestamp()
   and e.observed_at<=clock_timestamp() and e.observed_at>=clock_timestamp()-e.max_measurement_age
   and ((c.dimension='database' and c.unit='physical_database_bytes')
     or (c.dimension='storage' and c.unit='physical_storage_bytes'))
   and c.available_units<=e.allocated_bytes and e.observed_communications_bytes<=e.allocated_bytes
   and e.allocated_bytes<=e.physical_limit_bytes-(e.observed_total_bytes-e.observed_communications_bytes)
       -e.reserved_other_bytes-e.safety_headroom_bytes)
$$;
create function erp_comm_cost.validate_baseline_measurement()
returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from erp_comm_cost.authority where singleton for update;
 if tg_op='UPDATE' and new.capacity_id<>old.capacity_id then raise exception 'Immutable baseline capacity identity'; end if;
 if new.enabled and (new.observed_at>clock_timestamp() or new.valid_until<=clock_timestamp()
   or new.allocated_bytes>new.physical_limit_bytes-(new.observed_total_bytes-new.observed_communications_bytes)
      -new.reserved_other_bytes-new.safety_headroom_bytes
   or not exists(select from erp_comm_cost.capacity c where c.id=new.capacity_id and c.enabled
     and c.valid_from<=clock_timestamp() and c.valid_until>=new.valid_until and c.available_units<=new.allocated_bytes
     and ((c.dimension='database' and c.unit='physical_database_bytes') or (c.dimension='storage' and c.unit='physical_storage_bytes')))) then
   raise sqlstate '22023' using message='Invalid baseline physical measurement';
 end if;
 return new;
end $$;
create trigger baseline_measurement_validation before insert or update on erp_comm_cost.baseline_capacity_evidence
 for each row execute function erp_comm_cost.validate_baseline_measurement();

create table erp_comm_cost.baseline_allocation (
 id uuid primary key,
 approval_id uuid not null unique references erp_comm_cost.baseline_approval_receipt(approval_id),
 database_capacity_id bigint not null references erp_comm_cost.baseline_capacity_evidence(capacity_id),
 storage_capacity_id bigint not null references erp_comm_cost.baseline_capacity_evidence(capacity_id),
 database_quota_bytes erp_comm_cost.micros not null check(database_quota_bytes>0),
 storage_quota_bytes erp_comm_cost.micros not null check(storage_quota_bytes>0),
 valid_from timestamptz not null check(isfinite(valid_from)),
 valid_until timestamptz not null check(isfinite(valid_until)),
 policy_evidence text not null check(length(trim(policy_evidence)) between 1 and 2048),
 enabled boolean not null default false,
 check(valid_from<valid_until and valid_until<='2026-11-30T19:59:00Z'::timestamptz),
 check(database_capacity_id<>storage_capacity_id)
);
create index baseline_allocation_database on erp_comm_cost.baseline_allocation(database_capacity_id) where enabled;
create index baseline_allocation_storage on erp_comm_cost.baseline_allocation(storage_capacity_id) where enabled;
create function erp_comm_cost.baseline_allocation_valid(b erp_comm_cost.baseline_allocation)
returns boolean language sql volatile set search_path='' as $$
 select coalesce(b.enabled and b.valid_from<=clock_timestamp() and b.valid_until>clock_timestamp()
   and b.valid_until<='2026-11-30T19:59:00Z'::timestamptz
   and erp_comm_cost.baseline_measurement_valid(b.database_capacity_id,b.valid_until)
   and erp_comm_cost.baseline_measurement_valid(b.storage_capacity_id,b.valid_until)
   and exists(select from erp_comm_cost.approval a join erp_comm_cost.authority o on o.singleton and o.owner_auth_id=a.owner_auth_id
     join erp_comm_cost.baseline_approval_receipt r on r.approval_id=a.id
     join public.user_profiles u on u.auth_user_id=a.owner_auth_id
     where a.id=b.approval_id and a.scope='communications' and a.currency='USD' and a.max_micros=5000000
       and a.features=array['chat','realtime','media_upload','media_download','export','push','ptt_live','ptt_replay','sos']::erp_comm_cost.feature[]
       and a.approved_at<=clock_timestamp() and a.step_up_at<=a.approved_at
       and a.step_up_at>=a.approved_at-interval '5 minutes' and a.revoked_at is null and a.ends_at>=b.valid_until
       and a.ends_at='2026-11-30T19:59:00Z'::timestamptz and u.status='active' and u.must_change_password is false
       and r.owner_auth_id=a.owner_auth_id and r.approved_at=a.approved_at and r.confirmed_at>=a.approved_at
       and r.confirmed_at<=clock_timestamp() and r.fingerprint=erp_comm_cost.baseline_approval_fingerprint(a))
   and exists(select from erp_comm_cost.capacity d cross join erp_comm_cost.capacity s
     where d.id=b.database_capacity_id and d.dimension='database' and d.unit='physical_database_bytes'
       and s.id=b.storage_capacity_id and s.dimension='storage' and s.unit='physical_storage_bytes'
       and d.available_units>=b.database_quota_bytes and s.available_units>=b.storage_quota_bytes),false)
$$;
create function erp_comm_cost.enroll_baseline_allocation()
returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from erp_comm_cost.authority where singleton for update;
 if tg_op='UPDATE' then
   if (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') or (new.enabled and not old.enabled) then
     raise exception 'Immutable baseline allocation; expansion/renewal requires new owner approval';
   end if;
 end if;
 if new.enabled and (not erp_comm_cost.baseline_allocation_valid(new)
   or (select coalesce(sum(b.database_quota_bytes),0) from erp_comm_cost.baseline_allocation b
       where b.enabled and b.database_capacity_id=new.database_capacity_id and b.id<>new.id)+new.database_quota_bytes
       >(select available_units from erp_comm_cost.capacity where id=new.database_capacity_id)
   or (select coalesce(sum(b.storage_quota_bytes),0) from erp_comm_cost.baseline_allocation b
       where b.enabled and b.storage_capacity_id=new.storage_capacity_id and b.id<>new.id)+new.storage_quota_bytes
       >(select available_units from erp_comm_cost.capacity where id=new.storage_capacity_id)) then
   raise sqlstate '22023' using message='Invalid baseline allocation: actual owner approval and measured existing-plan capacity required';
 end if;
 return new;
end $$;
create trigger baseline_allocation_enrollment before insert or update on erp_comm_cost.baseline_allocation
 for each row execute function erp_comm_cost.enroll_baseline_allocation();
-- Origin-bound prepaid shutdown, owner-control and cancellation obligations must drain
-- even after new admissions pause. Quantities are captured once from the originating
-- reservation; only its original bound control-pool enrollment may set the final tail.
create table erp_comm_cost.baseline_prepaid_hold (
 permit_id uuid primary key references erp_comm_cost.reservation(permit_id),
 allocation_id uuid not null references erp_comm_cost.baseline_allocation(id),
 database_bytes erp_comm_cost.micros not null check(database_bytes>0),
 storage_bytes erp_comm_cost.micros not null check(storage_bytes>0),
 issued_at timestamptz not null check(isfinite(issued_at)),
 operating_until timestamptz not null check(isfinite(operating_until) and operating_until>issued_at),
 control_enrolled boolean not null default false
);

-- Only this exact typed prefix opts into the baseline policy. A malformed/case/space
-- variant cannot fall through as legacy evidence. This function is checked on admission,
-- permit consumption, effects, retained attachments, control debits, worker funding and recording readiness.
create function erp_comm_cost.retention_covered(p erp_comm_cost.proof)
returns boolean language plpgsql volatile set search_path='' as $$
declare marker text:=p.retained_at_zero_cost_evidence; b erp_comm_cost.baseline_allocation%rowtype;
begin
 if length(trim(coalesce(marker,'')))=0 then return false; end if;
 if lower(ltrim(marker)) not like 'existing-plan:%' then return true; end if;
 if marker !~ '^existing-plan:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 select * into b from erp_comm_cost.baseline_allocation where id=substring(marker from 15)::uuid;
 if b.id is null or not erp_comm_cost.baseline_allocation_valid(b) or p.approval_id is distinct from b.approval_id
   or p.scope<>'communications' or greatest(p.operational_stop_by,p.liability_ends_at,p.valid_until)>b.valid_until
   or not exists(select from erp_comm_cost.approval a where a.id=b.approval_id and p.feature=any(a.features)) then return false; end if;
 return (select count(*)=2 and bool_and(m.complete and m.upper_units>0 and m.observed_at<=clock_timestamp()
     and m.observed_at>=clock_timestamp()-p.max_meter_age and m.valid_until>clock_timestamp()
     and m.covered_until>=greatest(p.operational_stop_by,p.liability_ends_at)
     and e.observed_communications_bytes+coalesce((select sum(h.units) from erp_comm_cost.unit_hold h
       join erp_comm_cost.reservation r on r.permit_id=h.permit_id where h.capacity_id=c.id and r.operation_id<>p.operation_id),0)
       +m.upper_units<=least(c.available_units,case c.id when b.database_capacity_id then b.database_quota_bytes else b.storage_quota_bytes end))
   from erp_comm_cost.meter m join erp_comm_cost.capacity c on c.id=m.capacity_id
     join erp_comm_cost.baseline_capacity_evidence e on e.capacity_id=c.id
   where m.operation_id=p.operation_id and m.capacity_id in (b.database_capacity_id,b.storage_capacity_id)
     and m.dimension=c.dimension);
end $$;
create function erp_comm_cost.capture_baseline_prepaid_hold()
returns trigger language plpgsql set search_path='' as $$
declare p erp_comm_cost.proof%rowtype; b erp_comm_cost.baseline_allocation%rowtype;
begin
 select * into strict p from erp_comm_cost.proof where operation_id=new.operation_id;
 if lower(ltrim(p.retained_at_zero_cost_evidence)) like 'existing-plan:%' then
   if not erp_comm_cost.retention_covered(p) then raise exception 'Invalid baseline prepaid origin'; end if;
   select * into strict b from erp_comm_cost.baseline_allocation where id=substring(p.retained_at_zero_cost_evidence from 15)::uuid;
   insert into erp_comm_cost.baseline_prepaid_hold(permit_id,allocation_id,database_bytes,storage_bytes,issued_at,operating_until)
   select new.permit_id,b.id,d.upper_units,s.upper_units,new.issued_at,p.operational_stop_by
     from erp_comm_cost.meter d cross join erp_comm_cost.meter s where d.operation_id=p.operation_id and s.operation_id=p.operation_id
       and d.capacity_id=b.database_capacity_id and s.capacity_id=b.storage_capacity_id;
   if not found then raise exception 'Invalid baseline prepaid byte snapshot'; end if;
 end if;
 return new;
end $$;
create trigger baseline_prepaid_origin after insert on erp_comm_cost.reservation
 for each row execute function erp_comm_cost.capture_baseline_prepaid_hold();
create function erp_comm_cost.enroll_baseline_prepaid_pool(p_permit uuid,p_until timestamptz)
returns void language plpgsql set search_path='' as $$
declare p erp_comm_cost.proof%rowtype; h erp_comm_cost.baseline_prepaid_hold%rowtype; b erp_comm_cost.baseline_allocation%rowtype;
begin
 select proof.* into strict p from erp_comm_cost.reservation r join erp_comm_cost.proof proof using(operation_id) where r.permit_id=p_permit;
 if lower(ltrim(p.retained_at_zero_cost_evidence)) not like 'existing-plan:%' or p.retained_at_zero_cost_evidence is null then return; end if;
 select * into strict h from erp_comm_cost.baseline_prepaid_hold where permit_id=p_permit for update;
 select * into strict b from erp_comm_cost.baseline_allocation where id=h.allocation_id;
 if h.control_enrolled or not erp_comm_cost.retention_covered(p) or p_until<=clock_timestamp() or p_until>b.valid_until
   or (select count(*) from erp_comm_cost.meter m join erp_comm_cost.unit_hold u on u.capacity_id=m.capacity_id and u.permit_id=p_permit
       where m.operation_id=p.operation_id and m.capacity_id in(b.database_capacity_id,b.storage_capacity_id)
         and m.covered_until>=p_until and m.upper_units=u.units and u.units=case m.capacity_id when b.database_capacity_id then h.database_bytes else h.storage_bytes end)<>2 then
   raise sqlstate '22023' using message='baseline_prepaid_tail_unfunded';
 end if;
 update erp_comm_cost.baseline_prepaid_hold set operating_until=p_until,control_enrolled=true where permit_id=p_permit;
end $$;
create function erp_comm_cost.permit_prepaid_current(p_permit uuid)
returns boolean language plpgsql volatile set search_path='' as $$
declare p erp_comm_cost.proof%rowtype; r erp_comm_cost.reservation%rowtype; h erp_comm_cost.baseline_prepaid_hold%rowtype; b erp_comm_cost.baseline_allocation%rowtype;
begin
 select * into r from erp_comm_cost.reservation where permit_id=p_permit;
 if r.permit_id is null then return false; end if;
 select * into strict p from erp_comm_cost.proof where operation_id=r.operation_id;
 if lower(ltrim(p.retained_at_zero_cost_evidence)) not like 'existing-plan:%' or p.retained_at_zero_cost_evidence is null then return true; end if;
 select * into h from erp_comm_cost.baseline_prepaid_hold where permit_id=p_permit;
 select * into b from erp_comm_cost.baseline_allocation where id=h.allocation_id;
 return coalesce(h.permit_id is not null and b.id=substring(p.retained_at_zero_cost_evidence from 15)::uuid
   and p.approval_id=b.approval_id and r.approval_id=b.approval_id and r.scope='communications' and r.consumed_at is not null
   and h.issued_at=r.issued_at and h.issued_at>=b.valid_from and h.operating_until<=b.valid_until and clock_timestamp()<h.operating_until
   and exists(select from erp_comm_cost.baseline_approval_receipt a where a.approval_id=b.approval_id)
   and (select count(*) from erp_comm_cost.unit_hold u where u.permit_id=p_permit
       and u.capacity_id in(b.database_capacity_id,b.storage_capacity_id)
       and u.units=case u.capacity_id when b.database_capacity_id then h.database_bytes else h.storage_bytes end)=2,false);
end $$;
-- Previously funded work can outlive the original RPC. Recheck only typed baseline
-- obligations here; legacy prepaid safety/notification behavior remains unchanged.
create function erp_comm_cost.permit_baseline_current(p_permit uuid)
returns boolean language sql volatile set search_path='' as $$
 select exists(select from erp_comm_cost.reservation r join erp_comm_cost.proof p using(operation_id)
   where r.permit_id=p_permit and case when lower(ltrim(p.retained_at_zero_cost_evidence)) like 'existing-plan:%'
     then erp_comm_cost.retention_covered(p) else true end)
$$;
create function erp_comm_cost.notice_retention_current(p_kind text,p_source uuid,p_profile bigint,p_attempt uuid)
returns boolean language sql volatile set search_path='' as $$
 select case p_kind when 'budget' then exists(select from erp_comm_cost.control_debit d
   join erp_comm_cost.control_pool cp on cp.permit_id=d.pool where cp.kind='budget_alert' and cp.subject=p_profile::text
     and d.command_id=p_attempt and d.lane='push' and erp_comm_cost.permit_prepaid_current(cp.permit_id))
 when 'sos' then exists(select from erp_comm_cost.notice_binding b where b.source=p_source and b.profile=p_profile
     and erp_comm_cost.permit_prepaid_current(b.origin)) else false end
$$;
create function erp_comm_cost.guard_baseline_proof()
returns trigger language plpgsql set search_path='' as $$
declare b erp_comm_cost.baseline_allocation%rowtype; marker text:=new.retained_at_zero_cost_evidence;
begin
 if tg_op='UPDATE' and lower(ltrim(old.retained_at_zero_cost_evidence)) like 'existing-plan:%'
   and (new.retained_at_zero_cost_evidence,new.approval_id) is distinct from (old.retained_at_zero_cost_evidence,old.approval_id) then
   raise exception 'Immutable baseline proof allocation';
 end if;
 if lower(ltrim(marker)) like 'existing-plan:%' then
   perform 1 from erp_comm_cost.authority where singleton for update;
   if marker !~ '^existing-plan:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
     raise sqlstate '22023' using message='Invalid baseline evidence marker';
   end if;
   select * into b from erp_comm_cost.baseline_allocation where id=substring(marker from 15)::uuid;
   if b.id is null or not erp_comm_cost.baseline_allocation_valid(b) or new.approval_id is distinct from b.approval_id
     or new.scope<>'communications' or greatest(new.operational_stop_by,new.liability_ends_at,new.valid_until)>b.valid_until
     or not exists(select from erp_comm_cost.approval a where a.id=b.approval_id and new.feature=any(a.features)) then
     raise sqlstate '22023' using message='Invalid baseline proof owner approval or capacity';
   end if;
 end if;
 return new;
end $$;
create trigger baseline_proof_enrollment before insert or update on erp_comm_cost.proof
 for each row execute function erp_comm_cost.guard_baseline_proof();
-- Proof creation precedes its meter rows (including standing clones); commit is the
-- boundary that must have both positive conservative physical byte meters present.
create function erp_comm_cost.check_baseline_proof_meters()
returns trigger language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.proof%rowtype;
begin
 select * into p from erp_comm_cost.proof where operation_id=case when tg_op='DELETE' then old.operation_id else new.operation_id end;
 if lower(ltrim(p.retained_at_zero_cost_evidence)) like 'existing-plan:%' and not erp_comm_cost.retention_covered(p) then
   raise sqlstate '22023' using message='Invalid baseline physical byte meters, quota or fresh approval';
 end if;
 return null;
end $$;
create constraint trigger baseline_proof_meter_check after insert or update on erp_comm_cost.proof
 deferrable initially deferred for each row execute function erp_comm_cost.check_baseline_proof_meters();
create constraint trigger baseline_meter_check after insert or update or delete on erp_comm_cost.meter
 deferrable initially deferred for each row execute function erp_comm_cost.check_baseline_proof_meters();

-- Reuse the existing guards without replacing their money, unit, command, session,
-- cleanup and one-use logic. Fail on source drift instead of silently leaving a bypass.
-- The recording predicate is patched when its optional feature migration is installed.
do $patch_guards$
declare f record; source text; changed text; total integer:=0; needle text; alias text;
begin
 for f in select p.oid,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('erp_comm_cost','erp_private') and p.prokind='f'
     and p.proname not in ('retention_covered','guard_baseline_proof','check_baseline_proof_meters')
     and p.prosrc like '%retained_at_zero_cost_evidence%'
 loop
   source:=pg_get_functiondef(f.oid); changed:=source;
   foreach alias in array array['p','q','original','e'] loop
     needle:='length(trim('||alias||'.retained_at_zero_cost_evidence))>0';
     changed:=replace(changed,needle,'erp_comm_cost.retention_covered('||alias||')');
   end loop;
   changed:=replace(changed,'length(trim(coalesce(p.retained_at_zero_cost_evidence,'''')))=0',
     'not erp_comm_cost.retention_covered(p)');
   if changed<>source then execute changed; total:=total+1; end if;
 end loop;
 if total<>(case when to_regprocedure('erp_private.ptt_recording_ready(uuid,bigint,uuid)') is null then 9 else 10 end) then
   raise exception 'Unexpected retention guard source count (%); baseline policy not installed',total;
 end if;
 source:=pg_get_functiondef('erp_comm_cost.take_service_permit(uuid,text,text,text,uuid,jsonb)'::regprocedure);
 needle:='or exists(select from erp_comm_cost.pause q where q.scope=r.scope and q.feature=r.feature)';
 if position(needle in source)=0 then raise exception 'Unexpected permit guard source'; end if;
 execute replace(source,needle,'or not erp_comm_cost.permit_baseline_current(p_permit) '||needle);
 source:=pg_get_functiondef('erp_comm_cost.debit_control(text,text,uuid,text)'::regprocedure);
 needle:='erp_comm_cost.retention_covered(q)';
 if position(needle in source)=0 then raise exception 'Unexpected prepaid control guard source'; end if;
 execute replace(source,needle,'(length(trim(q.retained_at_zero_cost_evidence))>0 and erp_comm_cost.permit_prepaid_current(r.permit_id))');
 source:=pg_get_functiondef('erp_comm_cost.worker_probes_funded(uuid,timestamp with time zone)'::regprocedure);
 needle:='erp_comm_cost.retention_covered(original)';
 if position(needle in source)=0 then raise exception 'Unexpected prepaid worker guard source'; end if;
 execute replace(source,needle,'(length(trim(original.retained_at_zero_cost_evidence))>0 and erp_comm_cost.permit_prepaid_current(r.permit_id))');
 source:=pg_get_functiondef('erp_comm_cost.release_retained_upload(uuid,text)'::regprocedure);
 needle:='erp_comm_cost.retention_covered(p)';
 if position(needle in source)=0 then raise exception 'Unexpected retained upload guard source'; end if;
 execute replace(source,needle,'(length(trim(p.retained_at_zero_cost_evidence))>0 and erp_comm_cost.permit_prepaid_current(r.permit_id))');
 source:=pg_get_functiondef('erp_comm_cost.enroll_pool()'::regprocedure);
 needle:='update erp_comm_cost.reservation set consumed_at=n,consumed_xid=pg_current_xact_id()';
 if position(needle in source)=0 then raise exception 'Unexpected prepaid pool enrollment source'; end if;
 execute replace(source,needle,'perform erp_comm_cost.enroll_baseline_prepaid_pool(new.permit_id,new.valid_until); '||needle);
 source:=pg_get_functiondef('erp_comm_cost.take_notice_attempt(text,uuid,bigint,uuid,uuid,uuid)'::regprocedure);
 needle:='if b.origin is null or to_regprocedure';
 if position(needle in source)=0 then raise exception 'Unexpected notice admission guard source'; end if;
 execute replace(source,needle,'if b.origin is null or not erp_comm_cost.permit_prepaid_current(b.origin) or to_regprocedure');
 source:=pg_get_functiondef('erp_comm_cost.notice_attempt_valid(text,uuid,bigint,uuid,uuid,uuid)'::regprocedure);
 needle:='and (p_kind<>''budget''';
 if position(needle in source)=0 then raise exception 'Unexpected notice dispatch guard source'; end if;
 execute replace(source,needle,'and erp_comm_cost.notice_retention_current(p_kind,p_source,p_profile,p_lease) '||needle);
 source:=pg_get_functiondef('erp_comm_cost.take_control_read(text,uuid,bigint,uuid,uuid)'::regprocedure);
 needle:='x.remaining_reads>0';
 if position(needle in source)=0 then raise exception 'Unexpected SOS control read guard source'; end if;
 execute replace(source,needle,needle||' and erp_comm_cost.permit_prepaid_current(x.origin)');
 source:=pg_get_functiondef('erp_comm_cost.bind_sos_notice(uuid,uuid,text,bigint)'::regprocedure);
 needle:='select * into claim from erp_comm_cost.sos_claim';
 if position(needle in source)=0 then raise exception 'Unexpected SOS binding guard source'; end if;
 execute replace(source,needle,'if not erp_comm_cost.permit_prepaid_current(p_permit) then raise sqlstate ''PT503'' using message=''baseline_retention_unavailable''; end if; '||needle);
end $patch_guards$;

alter table erp_comm_cost.baseline_approval_receipt enable row level security;
alter table erp_comm_cost.baseline_capacity_evidence enable row level security;
alter table erp_comm_cost.baseline_allocation enable row level security;
alter table erp_comm_cost.baseline_prepaid_hold enable row level security;
revoke all on erp_comm_cost.baseline_approval_receipt,erp_comm_cost.baseline_capacity_evidence,erp_comm_cost.baseline_allocation,erp_comm_cost.baseline_prepaid_hold
 from public,anon,authenticated,service_role;
revoke all on function erp_comm_cost.baseline_approval_fingerprint(erp_comm_cost.approval),
 erp_comm_cost.record_baseline_owner_approval(uuid),erp_comm_cost.baseline_measurement_valid(bigint,timestamptz),
 erp_comm_cost.validate_baseline_measurement(),erp_comm_cost.baseline_allocation_valid(erp_comm_cost.baseline_allocation),
 erp_comm_cost.enroll_baseline_allocation(),erp_comm_cost.retention_covered(erp_comm_cost.proof),
 erp_comm_cost.permit_baseline_current(uuid),erp_comm_cost.notice_retention_current(text,uuid,bigint,uuid),
 erp_comm_cost.capture_baseline_prepaid_hold(),erp_comm_cost.enroll_baseline_prepaid_pool(uuid,timestamptz),erp_comm_cost.permit_prepaid_current(uuid),
 erp_comm_cost.guard_baseline_proof(),erp_comm_cost.check_baseline_proof_meters()
 from public,anon,authenticated,service_role;
commit;
