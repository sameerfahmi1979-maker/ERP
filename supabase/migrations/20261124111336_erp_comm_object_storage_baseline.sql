-- Additive owner-allocated OBJECT bytes, not GB-hours, free physical disk, or a
-- promise that a provider plan/cap stays unchanged. No enrollment or activation.
begin;

-- Retain the original physical storage path. Only the storage-side FK is widened
-- to its real capacity identity; the typed validator still requires either actual
-- physical evidence or this explicit owner-object basis. DB physical FK unchanged.
alter table erp_comm_cost.baseline_allocation drop constraint baseline_allocation_storage_capacity_id_fkey;
alter table erp_comm_cost.baseline_allocation add constraint baseline_allocation_storage_capacity_id_fkey
 foreign key(storage_capacity_id) references erp_comm_cost.capacity(id);
create table erp_comm_cost.object_storage_allocation_basis (
 allocation_id uuid primary key references erp_comm_cost.baseline_allocation(id) deferrable initially deferred,
 storage_capacity_id bigint not null unique references erp_comm_cost.capacity(id),
 approval_id uuid not null references erp_comm_cost.baseline_approval_receipt(approval_id),
 project_ref text not null unique check(project_ref='mmiefuieduzdiiwnqpie'),
 organization_ref text not null check(length(trim(organization_ref)) between 1 and 256),
 billing_account text not null check(length(trim(billing_account)) between 1 and 2048),
 plan_name text not null check(plan_name='Pro'),spend_cap_observed boolean not null check(spend_cap_observed),
 plan_evidence_id text not null,plan_evidence_sha256 text not null check(plan_evidence_sha256~'^[0-9a-f]{64}$'),
 plan_observed_at timestamptz not null check(isfinite(plan_observed_at)),
 policy_evidence_id text not null,policy_evidence_sha256 text not null check(policy_evidence_sha256~'^[0-9a-f]{64}$'),
 byte_quota erp_comm_cost.micros not null check(byte_quota=268435456),
 admission_ends_at timestamptz not null check(isfinite(admission_ends_at) and admission_ends_at<='2026-11-30T19:59:00Z'::timestamptz),
 enabled boolean not null default false,
 check(plan_evidence_id='sha256:'||plan_evidence_sha256 and policy_evidence_id='sha256:'||policy_evidence_sha256)
);
comment on table erp_comm_cost.object_storage_allocation_basis is
 'Immutable owner-approved own-object allocation in existing ERP buckets, independent of USD5 operating grant. Pro/Spend Cap receipt is authentic enrollment context only; no assertion of current global bytes, forever spend cap or physical free space. Other projects remain unknown.';
create table erp_comm_cost.object_storage_observation (
 allocation_id uuid primary key references erp_comm_cost.object_storage_allocation_basis(allocation_id),
 observed_at timestamptz not null check(isfinite(observed_at)),
 known_object_bytes erp_comm_cost.micros not null,object_count integer not null check(object_count>=0),
 unknown_object_count integer not null check(unknown_object_count>=0),
 unresolved_upper_bytes erp_comm_cost.micros not null,unresolved_count integer not null check(unresolved_count>=0),
 max_measurement_age interval not null default interval '5 minutes' check(max_measurement_age>interval '0 seconds' and max_measurement_age<=interval '5 minutes'),
 last_nonce uuid,enabled boolean not null default false
);

-- Actual protected catalogs only. H is deliberately permanent; accepted objects
-- may also be counted in C. No settlement/expiry/revocation/retained handoff frees H.
-- Preexisting unresolved unbound stages use upper byte bounds, never optimistic
-- state labels. A chat cleanup is proven only by closed cleanup AND object absence.
create function erp_comm_cost.object_storage_totals(p_capacity bigint,p_max_objects integer default 100000)
returns table(known_bytes numeric,objects integer,unknown_objects integer,unresolved_bytes numeric,unresolved integer)
language plpgsql volatile set search_path='' as $$
declare x record;n timestamptz:=clock_timestamp();scanned integer:=0;
begin
 known_bytes:=0;objects:=0;unknown_objects:=0;unresolved_bytes:=0;unresolved:=0;
 if p_max_objects not between 1 and 100000 then raise sqlstate '22023';end if;
 for x in select bucket_id,metadata->>'size' as bytes from storage.objects
   where bucket_id in('erp-chat-media','erp-ptt-recordings') limit p_max_objects+1 loop
   objects:=objects+1;
   if objects>p_max_objects or clock_timestamp()>=n+interval '3 seconds' then raise sqlstate '57014' using message='Bounded own-object observation exhausted';end if;
   if x.bytes is null or x.bytes!~'^(0|[1-9][0-9]{0,29})$' then unknown_objects:=unknown_objects+1;
   else known_bytes:=known_bytes+x.bytes::numeric;end if;
 end loop;
 for x in select u.id,u.size_bytes,u.stage_permit,u.cleanup_phase from erp_private.chat_uploads u
   where not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.cleanup_resource cr on cr.permit_id=h.permit_id
     where h.permit_id=u.stage_permit and h.capacity_id=p_capacity and h.units>=u.size_bytes
       and cr.endpoint='discard_partial_upload' and cr.resource_id='erp-chat-media/'||u.id::text)
   and not(coalesce(u.cleanup_phase='cleaned',false) and exists(select from erp_comm_cost.cleanup_resource cr
     where cr.endpoint='discard_partial_upload' and cr.resource_id='erp-chat-media/'||u.id::text and cr.closed_at is not null and cr.retained_at is null)
     and not exists(select from storage.objects o where o.bucket_id='erp-chat-media' and o.name=u.id::text))
   limit p_max_objects+1 loop
   scanned:=scanned+1;if scanned>p_max_objects or clock_timestamp()>=n+interval '3 seconds' then raise sqlstate '57014';end if;
   if x.size_bytes is null or x.size_bytes not between 1 and 52428800 then raise sqlstate '22023' using message='Unknown pending chat upper bound';end if;
   unresolved_bytes:=unresolved_bytes+x.size_bytes;unresolved:=unresolved+1;
 end loop;
 for x in select u.id from erp_private.ptt_recording_uploads u
   where not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.cleanup_resource cr on cr.permit_id=h.permit_id
     where h.permit_id=u.permit_id and h.capacity_id=p_capacity and h.units>=52428800
       and cr.endpoint='discard_partial_upload' and cr.resource_id=u.id::text)
   limit p_max_objects+1 loop
   scanned:=scanned+1;if scanned>p_max_objects or clock_timestamp()>=n+interval '3 seconds' then raise sqlstate '57014';end if;
   unresolved_bytes:=unresolved_bytes+52428800;unresolved:=unresolved+1;
 end loop;
 return next;
end $$;
create function erp_comm_cost.observe_object_storage_allocation(p_allocation uuid,p_nonce uuid)
returns boolean language plpgsql set search_path='' as $$
declare a erp_comm_cost.object_storage_allocation_basis%rowtype;t record;n timestamptz:=clock_timestamp();
begin
 perform 1 from erp_comm_cost.authority where singleton for update;
 select * into strict a from erp_comm_cost.object_storage_allocation_basis where allocation_id=p_allocation;
 select * into strict t from erp_comm_cost.object_storage_totals(a.storage_capacity_id);
 insert into erp_comm_cost.object_storage_observation(allocation_id,observed_at,known_object_bytes,object_count,unknown_object_count,unresolved_upper_bytes,unresolved_count,last_nonce,enabled)
 values(a.allocation_id,n,t.known_bytes,t.objects,t.unknown_objects,t.unresolved_bytes,t.unresolved,p_nonce,
   a.enabled and t.unknown_objects=0 and t.known_bytes+t.unresolved_bytes+coalesce((select sum(h.units)from erp_comm_cost.unit_hold h where h.capacity_id=a.storage_capacity_id),0)<=a.byte_quota)
 on conflict(allocation_id)do update set observed_at=excluded.observed_at,known_object_bytes=excluded.known_object_bytes,
   object_count=excluded.object_count,unknown_object_count=excluded.unknown_object_count,unresolved_upper_bytes=excluded.unresolved_upper_bytes,
   unresolved_count=excluded.unresolved_count,last_nonce=excluded.last_nonce,enabled=excluded.enabled;
 return (select enabled from erp_comm_cost.object_storage_observation where allocation_id=a.allocation_id);
end $$;
create function erp_comm_cost.enroll_object_storage_basis()returns trigger language plpgsql set search_path='' as $$
declare t record;
begin
 perform 1 from erp_comm_cost.authority where singleton for update;
 if tg_op='DELETE' then raise exception 'Immutable object allocation; no quota reset';end if;
 if tg_op='UPDATE' then
   if(to_jsonb(new)-'enabled')is distinct from(to_jsonb(old)-'enabled')or(new.enabled and not old.enabled)then raise exception 'Immutable object allocation; no expansion or renewal';end if;
   return new;
 end if;
 if new.plan_observed_at>clock_timestamp() or new.admission_ends_at<=clock_timestamp()
   or not exists(select from erp_comm_cost.capacity c where c.id=new.storage_capacity_id and c.dimension='storage'
     and c.unit='allocated_storage_object_bytes' and c.billing_account=new.billing_account and c.available_units=new.byte_quota
     and c.enabled and c.valid_from<=clock_timestamp() and c.valid_until>=new.admission_ends_at)
   or not exists(select from erp_comm_cost.baseline_approval_receipt r join erp_comm_cost.approval a on a.id=r.approval_id
     join erp_comm_cost.authority o on o.singleton and o.owner_auth_id=a.owner_auth_id
     where a.id=new.approval_id and r.fingerprint=erp_comm_cost.baseline_approval_fingerprint(a)
       and a.revoked_at is null and a.ends_at>=new.admission_ends_at) then raise sqlstate '22023' using message='Invalid object allocation basis';end if;
 select * into strict t from erp_comm_cost.object_storage_totals(new.storage_capacity_id);
 if t.unknown_objects<>0 or t.unresolved<>0 or t.known_bytes+coalesce((select sum(h.units)from erp_comm_cost.unit_hold h where h.capacity_id=new.storage_capacity_id),0)>new.byte_quota then
   raise sqlstate '22023' using message='Object allocation enrollment has unknown objects or unbound unresolved writes';end if;
 return new;
end $$;
create trigger object_storage_basis_guard before insert or update or delete on erp_comm_cost.object_storage_allocation_basis
 for each row execute function erp_comm_cost.enroll_object_storage_basis();
create function erp_comm_cost.initialize_object_storage_observation()returns trigger language plpgsql set search_path='' as $$
begin perform erp_comm_cost.observe_object_storage_allocation(new.allocation_id,null);return new;end $$;
create trigger object_storage_initial_observation after insert on erp_comm_cost.object_storage_allocation_basis
 for each row execute function erp_comm_cost.initialize_object_storage_observation();

create function erp_comm_cost.object_storage_basis_valid(b erp_comm_cost.baseline_allocation)
returns boolean language sql volatile set search_path='' as $$
 select exists(select from erp_comm_cost.object_storage_allocation_basis a join erp_comm_cost.object_storage_observation v using(allocation_id)
   join erp_comm_cost.capacity c on c.id=a.storage_capacity_id
 where a.allocation_id=b.id and a.storage_capacity_id=b.storage_capacity_id and a.approval_id=b.approval_id
   and a.enabled and v.enabled and a.admission_ends_at=b.valid_until and a.byte_quota=b.storage_quota_bytes
   and a.policy_evidence_id=b.policy_evidence and a.plan_observed_at<=clock_timestamp()
   and c.dimension='storage' and c.unit='allocated_storage_object_bytes' and c.billing_account=a.billing_account
   and c.enabled and c.available_units=a.byte_quota and c.valid_from<=clock_timestamp() and c.valid_until>=b.valid_until
   and v.observed_at<=clock_timestamp() and v.observed_at>=clock_timestamp()-v.max_measurement_age and v.unknown_object_count=0)
$$;
create function erp_comm_cost.baseline_storage_valid(b erp_comm_cost.baseline_allocation)
returns boolean language sql volatile set search_path='' as $$
 select case when exists(select from erp_comm_cost.object_storage_allocation_basis a where a.allocation_id=b.id or a.storage_capacity_id=b.storage_capacity_id)
   then erp_comm_cost.object_storage_basis_valid(b)
   else erp_comm_cost.baseline_measurement_valid(b.storage_capacity_id,b.valid_until)end
$$;
create function erp_comm_cost.object_storage_retention_covered(p erp_comm_cost.proof,b erp_comm_cost.baseline_allocation)
returns boolean language plpgsql volatile set search_path='' as $$
declare t record;db_ok boolean;st_ok boolean;
begin
 if not erp_comm_cost.baseline_allocation_valid(b) or p.approval_id is distinct from b.approval_id or p.scope<>'communications'
   or greatest(p.operational_stop_by,p.liability_ends_at,p.valid_until)>b.valid_until
   or not exists(select from erp_comm_cost.approval a where a.id=b.approval_id and p.feature=any(a.features))then return false;end if;
 select * into strict t from erp_comm_cost.object_storage_totals(b.storage_capacity_id);
 if t.unknown_objects<>0 then return false;end if;
 select coalesce(bool_and(m.complete and m.upper_units>0 and m.dimension='database' and m.observed_at<=clock_timestamp()
   and m.observed_at>=clock_timestamp()-p.max_meter_age and m.valid_until>clock_timestamp()and m.covered_until>=greatest(p.operational_stop_by,p.liability_ends_at)
   and e.observed_communications_bytes+coalesce((select sum(h.units)from erp_comm_cost.unit_hold h join erp_comm_cost.reservation r using(permit_id)
     where h.capacity_id=b.database_capacity_id and r.operation_id<>p.operation_id),0)+m.upper_units<=least(c.available_units,b.database_quota_bytes)),false)
 into db_ok from erp_comm_cost.meter m join erp_comm_cost.capacity c on c.id=m.capacity_id join erp_comm_cost.baseline_capacity_evidence e on e.capacity_id=c.id
 where m.operation_id=p.operation_id and m.capacity_id=b.database_capacity_id;
 select coalesce(bool_and(m.complete and m.upper_units>0 and m.dimension='storage' and m.observed_at<=clock_timestamp()
   and m.observed_at>=clock_timestamp()-p.max_meter_age and m.valid_until>clock_timestamp()and m.covered_until>=greatest(p.operational_stop_by,p.liability_ends_at)
   and t.known_bytes+t.unresolved_bytes+coalesce((select sum(h.units)from erp_comm_cost.unit_hold h join erp_comm_cost.reservation r using(permit_id)
     where h.capacity_id=b.storage_capacity_id and r.operation_id<>p.operation_id),0)+m.upper_units<=least(c.available_units,b.storage_quota_bytes)),false)
 into st_ok from erp_comm_cost.meter m join erp_comm_cost.capacity c on c.id=m.capacity_id
 where m.operation_id=p.operation_id and m.capacity_id=b.storage_capacity_id;
 return db_ok and st_ok;
exception when others then return false;
end $$;
-- Deferred FK pairs cannot be left unattached or scope-mismatched even if disabled.
create function erp_comm_cost.check_object_storage_binding()returns trigger language plpgsql set search_path=''as $$
begin
 if not exists(select from erp_comm_cost.object_storage_allocation_basis a join erp_comm_cost.baseline_allocation b on b.id=a.allocation_id
   where a.allocation_id=new.allocation_id and a.storage_capacity_id=b.storage_capacity_id and a.approval_id=b.approval_id
     and a.byte_quota=b.storage_quota_bytes and a.admission_ends_at=b.valid_until and a.policy_evidence_id=b.policy_evidence)then
   raise exception 'Unbound immutable object allocation';end if;return null;
end $$;
create constraint trigger object_storage_binding after insert or update on erp_comm_cost.object_storage_allocation_basis
 deferrable initially deferred for each row execute function erp_comm_cost.check_object_storage_binding();

do $admission$
declare s text;needle text;
begin
 s:=pg_get_functiondef('erp_comm_cost.baseline_allocation_valid(erp_comm_cost.baseline_allocation)'::regprocedure);
 needle:='erp_comm_cost.baseline_measurement_valid(b.storage_capacity_id,b.valid_until)';
 if strpos(s,needle)=0 then raise exception 'Unexpected baseline allocation source';end if;
 s:=replace(s,needle,'erp_comm_cost.baseline_storage_valid(b)');
 needle:='s.dimension=''storage'' and s.unit=''physical_storage_bytes''';
 if strpos(s,needle)=0 then raise exception 'Unexpected storage dimension source';end if;
 s:=replace(s,needle,'s.dimension=''storage'' and (s.unit=''physical_storage_bytes'' or (s.unit=''allocated_storage_object_bytes'' and erp_comm_cost.object_storage_basis_valid(b)))');execute s;
 s:=pg_get_functiondef('erp_comm_cost.retention_covered(erp_comm_cost.proof)'::regprocedure);
 needle:='select * into b from erp_comm_cost.baseline_allocation where id=substring(marker from 15)::uuid;';
 if strpos(s,needle)=0 then raise exception 'Unexpected baseline retention source';end if;
 execute replace(s,needle,needle||' if exists(select from erp_comm_cost.object_storage_allocation_basis a where a.allocation_id=b.id or a.storage_capacity_id=b.storage_capacity_id)then return erp_comm_cost.object_storage_retention_covered(p,b);end if;');
end $admission$;

-- Applied 085300 runtime stays compatible: same funded once-only claim/record API.
-- Patch only the typed branch; original physical catalog algorithm remains intact.
do $collector$
declare s text;needle text;original text;
begin
 if to_regprocedure('public.erp_comm_baseline_collector_record(uuid,uuid,text,text,text)')is null then return;end if;
 s:=pg_get_functiondef('erp_comm_cost.enroll_baseline_collector_plan()'::regprocedure);
 needle:='select evidence_id into strict new.storage_source_evidence from erp_comm_cost.baseline_capacity_evidence where capacity_id=b.storage_capacity_id;';
 if strpos(s,needle)=0 then raise exception 'Unexpected baseline collector enrollment';end if;
 execute replace(s,needle,'if exists(select from erp_comm_cost.object_storage_allocation_basis a where a.allocation_id=b.id)then select plan_evidence_id into strict new.storage_source_evidence from erp_comm_cost.object_storage_allocation_basis where allocation_id=b.id;else '||needle||'end if;');
 s:=pg_get_functiondef('public.erp_comm_baseline_collector_claim(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text)'::regprocedure);
 needle:='update erp_comm_cost.baseline_capacity_evidence set enabled=false where capacity_id in(b.database_capacity_id,b.storage_capacity_id);';
 if strpos(s,needle)=0 then raise exception 'Unexpected baseline collector claim';end if;
 execute replace(s,needle,needle||'update erp_comm_cost.object_storage_observation set enabled=false where allocation_id=b.id;');
 s:=pg_get_functiondef('public.erp_comm_baseline_collector_record(uuid,uuid,text,text,text)'::regprocedure);original:=s;
 -- A separate helper preserves the full exact physical implementation and its ACL.
 execute replace(s,'FUNCTION public.erp_comm_baseline_collector_record(','FUNCTION erp_comm_cost.object_storage_collector_record(');
 s:=pg_get_functiondef('erp_comm_cost.object_storage_collector_record(uuid,uuid,text,text,text)'::regprocedure);
 s:=replace(s,'row_data record;n timestamptz','own_totals record;row_data record;n timestamptz');
 needle:='select * into strict st_e from erp_comm_cost.baseline_capacity_evidence where capacity_id=b.storage_capacity_id;';
 if strpos(s,needle)=0 then raise exception 'Unexpected baseline collector storage select';end if;
 s:=replace(s,needle,'select * into strict own_totals from erp_comm_cost.object_storage_totals(b.storage_capacity_id,p.max_storage_objects);');
 needle:=substring(s from '   for row_data in select bucket_id,metadata->>''size'' as byte_size from storage.objects limit p.max_storage_objects\+1 loop[\s\S]*?   end loop;');
 if needle is null then raise exception 'Unexpected baseline collector catalog loop';end if;
 s:=replace(s,needle,'   storage_total:=null;storage_comm:=own_totals.known_bytes;objects:=own_totals.objects;if own_totals.unknown_objects<>0 then return false;end if;');
 needle:='or st_e.allocated_bytes>st_e.physical_limit_bytes-(storage_total-storage_comm)-st_e.reserved_other_bytes-st_e.safety_headroom_bytes';
 if strpos(s,needle)=0 then raise exception 'Unexpected physical storage headroom source';end if;
 s:=replace(s,needle,'or storage_comm+own_totals.unresolved_bytes+coalesce((select sum(h.units)from erp_comm_cost.unit_hold h where h.capacity_id=b.storage_capacity_id),0)>b.storage_quota_bytes');
 needle:='update erp_comm_cost.baseline_capacity_evidence set observed_at=q.claimed_at,evidence_id=receipt,
     observed_total_bytes=storage_total,observed_communications_bytes=storage_comm,enabled=true where capacity_id=b.storage_capacity_id;';
 if strpos(s,needle)=0 then raise exception 'Unexpected collector storage observation update';end if;
 s:=replace(s,needle,'perform erp_comm_cost.observe_object_storage_allocation(b.id,q.nonce);update erp_comm_cost.object_storage_observation set observed_at=q.claimed_at where allocation_id=b.id;');
 s:=replace(s,'then kind:=''physical_storage''','then kind:=''object_storage_allocation''');execute s;
 needle:='begin'||chr(10)||' select * into p from erp_comm_cost.baseline_collector_plan where id=p_plan for update;';
 if strpos(original,needle)=0 then raise exception 'Unexpected collector dispatch source';end if;
 execute replace(original,needle,'begin if exists(select from erp_comm_cost.baseline_collector_plan cp join erp_comm_cost.object_storage_allocation_basis a on a.allocation_id=cp.allocation_id where cp.id=p_plan)then return erp_comm_cost.object_storage_collector_record(p_plan,p_nonce,p_size,p_available,p_digest);end if;'||chr(10)||' select * into p from erp_comm_cost.baseline_collector_plan where id=p_plan for update;');
 alter table erp_comm_cost.baseline_meter_observation drop constraint baseline_meter_observation_observation_kind_check;
 alter table erp_comm_cost.baseline_meter_observation add constraint baseline_meter_observation_observation_kind_check
   check(observation_kind in('physical_database','physical_storage','object_storage_allocation','protected_counter','prepaid_host','priced_upper_bound','fcm_no_cost'));
 revoke all on function erp_comm_cost.object_storage_collector_record(uuid,uuid,text,text,text)from public,anon,authenticated,service_role;
end $collector$;

alter table erp_comm_cost.object_storage_allocation_basis enable row level security;
alter table erp_comm_cost.object_storage_observation enable row level security;
revoke all on erp_comm_cost.object_storage_allocation_basis,erp_comm_cost.object_storage_observation from public,anon,authenticated,service_role;
revoke all on function erp_comm_cost.object_storage_totals(bigint,integer),erp_comm_cost.observe_object_storage_allocation(uuid,uuid),
 erp_comm_cost.enroll_object_storage_basis(),erp_comm_cost.initialize_object_storage_observation(),
 erp_comm_cost.object_storage_basis_valid(erp_comm_cost.baseline_allocation),erp_comm_cost.baseline_storage_valid(erp_comm_cost.baseline_allocation),
 erp_comm_cost.object_storage_retention_covered(erp_comm_cost.proof,erp_comm_cost.baseline_allocation),erp_comm_cost.check_object_storage_binding()
 from public,anon,authenticated,service_role;
commit;
