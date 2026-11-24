-- Finite existing-infrastructure collector capability. No owner, plan, funding,
-- proof, credential, schedule, provider or runtime is installed or enabled here.
begin;
-- Reviewed immutable accounting bases, not claims about a provider's live bill.
-- Exact rational prices charge the whole pessimistic quantity, ignoring allowances.
create table erp_comm_cost.meter_refresh_basis (
 operation_id text not null references erp_comm_cost.proof(operation_id),capacity_id bigint not null references erp_comm_cost.capacity(id),
 basis text not null check(basis in('protected_counter','prepaid_host','priced_upper_bound','fcm_no_cost')),
 source_evidence_id text not null check(length(trim(source_evidence_id)) between 1 and 2048),
 source_evidence_sha256 text not null check(source_evidence_sha256 ~ '^[0-9a-f]{64}$'),
 max_upper_units erp_comm_cost.micros not null check(max_upper_units>0),max_upper_micros erp_comm_cost.micros not null,
 rate_numerator_micros erp_comm_cost.micros not null,rate_denominator_units erp_comm_cost.micros not null check(rate_denominator_units>0),
 valid_until timestamptz not null check(isfinite(valid_until) and valid_until<='2026-11-30T19:59:00Z'::timestamptz),
 primary key(operation_id,capacity_id)
);
create function erp_comm_cost.meter_refresh_basis_valid(b erp_comm_cost.meter_refresh_basis,p_deployment uuid)
returns boolean language sql volatile set search_path='' as $$
 select exists(select from erp_comm_cost.meter m join erp_comm_cost.capacity c on c.id=m.capacity_id
   join erp_comm_cost.proof p on p.operation_id=m.operation_id
   where m.operation_id=b.operation_id and m.capacity_id=b.capacity_id and m.complete and c.enabled and c.dimension=m.dimension
     and b.valid_until>clock_timestamp() and m.valid_until>=b.valid_until and c.valid_until>=b.valid_until and p.valid_until>=b.valid_until
     and c.valid_from<=clock_timestamp() and m.upper_units=b.max_upper_units and m.upper_micros=b.max_upper_micros
     and (select coalesce(sum(h.units),0) from erp_comm_cost.unit_hold h where h.capacity_id=c.id)+m.upper_units<=c.available_units
     and case b.basis
       when 'protected_counter' then c.dimension='database' and b.rate_numerator_micros=0 and m.upper_micros=0
         and (c.unit in('permanent_ledger_bytes','pilot_reservation_slots','bounded_database_work','sos_discovery_target_checks',
           'funded_ptt_receipt_episodes','funded_ptt_busy_inboxes','funded_ptt_busy_device_jobs','ptt_floor_retained_bytes')
           or c.unit ~ '^effect_[a-z0-9_]+_(items|bytes)$' or c.unit ~ '^funded_[a-z0-9_]+_actions$'
           or c.unit ~ '^profile_[a-f0-9]{24}_reservations$')
       when 'prepaid_host' then c.dimension='railway' and c.unit='prepaid_host_operation_slots' and m.upper_units=1 and m.upper_micros=0
         and b.rate_numerator_micros=0 and m.evidence_id ~ '^prepaid-host:[0-9a-f-]{36}$'
         and erp_comm_cost.host_operation_covered(p.operation_id,p.approval_id,p_deployment,true)
       when 'priced_upper_bound' then c.dimension in('railway','storage','realtime') and b.rate_numerator_micros>0
         and m.upper_micros>=ceil(m.upper_units*b.rate_numerator_micros/b.rate_denominator_units)
       when 'fcm_no_cost' then c.dimension='fcm' and b.rate_numerator_micros=0 and m.upper_micros=0
       else false end)
$$;
create function erp_comm_cost.enroll_meter_refresh_basis() returns trigger language plpgsql set search_path='' as $$
declare deployment uuid;
begin
 if tg_op<>'INSERT' then raise exception 'Immutable meter refresh basis';end if;
 perform 1 from erp_comm_cost.authority where singleton for update;
 select w.deployment_id into deployment from erp_comm_cost.host_proof_link l join erp_comm_cost.host_window w on w.funding_permit=l.funding_permit where l.operation_id=new.operation_id;
 if exists(select from erp_comm_cost.reservation where operation_id=new.operation_id)
   or not exists(select from erp_comm_cost.proof p join erp_comm_cost.baseline_allocation a on p.retained_at_zero_cost_evidence='existing-plan:'||a.id::text
      where p.operation_id=new.operation_id and p.approval_id=a.approval_id and erp_comm_cost.baseline_allocation_valid(a))
   or not erp_comm_cost.meter_refresh_basis_valid(new,deployment) then raise sqlstate '22023' using message='Invalid reviewed meter refresh basis';end if;
 return new;
end $$;
create trigger meter_refresh_basis_enrollment before insert or update or delete on erp_comm_cost.meter_refresh_basis
 for each row execute function erp_comm_cost.enroll_meter_refresh_basis();
create function erp_comm_cost.meter_refresh_bounds_current(p_operation text,p_deployment uuid)
returns boolean language sql volatile set search_path='' as $$
 select not exists(select from erp_comm_cost.meter_refresh_basis b where b.operation_id=p_operation
   and not erp_comm_cost.meter_refresh_basis_valid(b,p_deployment))
$$;
do $bounds$
declare source text;needle text:='if p.valid_until<=n or p.operational_stop_by<=n then';
begin
 source:=pg_get_functiondef('erp_comm_cost.command(text,jsonb)'::regprocedure);
 if position(needle in source)=0 then raise exception 'Unexpected refresh accounting guard source';end if;
 execute replace(source,needle,'if not erp_comm_cost.meter_refresh_bounds_current(source_op,nullif(p_payload->>''hostDeploymentId'','''')::uuid) then return jsonb_build_object(''ok'',false,''reason'',''meter_accounting_bound_unavailable'');end if; '||needle);
end $bounds$;
create table erp_comm_cost.baseline_collector_plan (
 id uuid primary key,pool uuid not null unique references erp_comm_cost.control_pool(permit_id),
 allocation_id uuid not null references erp_comm_cost.baseline_allocation(id),deployment_id uuid not null,
 manifest text not null check(length(manifest) between 1 and 16384),plan_hash text not null check(plan_hash ~ '^[0-9a-f]{64}$'),
 starts_at timestamptz not null,until_at timestamptz not null,
 max_ticks integer not null check(max_ticks between 1 and 120),max_physical_starts integer not null check(max_physical_starts between 1 and 16),
 max_storage_objects integer not null check(max_storage_objects between 1 and 100000),max_relations integer not null check(max_relations between 1 and 8192),
 nonces uuid[] not null,tick_tokens text[] not null, database_source_evidence text not null default '',storage_source_evidence text not null default '',
 ticks integer not null default 0 check(ticks between 0 and max_ticks),phase text not null default 'prepared' check(phase in('prepared','running','stopped')),
 job_id bigint,retirement_receipt uuid,last_at timestamptz,stopped_at timestamptz,
 check(isfinite(starts_at) and isfinite(until_at) and starts_at<until_at and until_at<=starts_at+interval '2 hours'
   and until_at<='2026-11-30T19:59:00Z'::timestamptz and starts_at=date_trunc('minute',starts_at)),
 check(cardinality(nonces)=max_ticks and array_position(nonces,null) is null
   and cardinality(tick_tokens)=max_ticks and array_position(tick_tokens,null) is null)
);
create table erp_comm_cost.baseline_collector_nonce (
 nonce uuid primary key,plan_id uuid not null references erp_comm_cost.baseline_collector_plan(id),ordinal integer not null,
 token_sha256 text not null check(token_sha256 ~ '^[0-9a-f]{64}$'),
 queued_at timestamptz,request_id bigint,claimed_at timestamptz,finished_at timestamptz,claim_attempts integer not null default 0 check(claim_attempts between 0 and 16),
 response_sha256 text check(response_sha256 ~ '^[0-9a-f]{64}$'),success boolean,
 disk_size_bytes bigint,disk_available_bytes bigint,database_communications_bytes bigint,
 storage_total_bytes numeric(30,0),storage_communications_bytes numeric(30,0),objects_read integer,relations_read integer,
 unique(plan_id,ordinal)
);
create table erp_comm_cost.baseline_meter_observation (
 operation_id text not null references erp_comm_cost.proof(operation_id),capacity_id bigint not null references erp_comm_cost.capacity(id),
 original_evidence_id text not null,last_nonce uuid not null references erp_comm_cost.baseline_collector_nonce(nonce),
 observation_kind text not null check(observation_kind in('physical_database','physical_storage','protected_counter','prepaid_host','priced_upper_bound','fcm_no_cost')),
 observed_at timestamptz not null,primary key(operation_id,capacity_id)
);
create function erp_comm_cost.baseline_collector_clock() returns timestamptz language sql volatile set search_path='' as $$select clock_timestamp()$$;
create function erp_comm_cost.enroll_baseline_collector_plan() returns trigger language plpgsql set search_path='' as $$
declare cp erp_comm_cost.control_pool%rowtype;r erp_comm_cost.reservation%rowtype;b erp_comm_cost.baseline_allocation%rowtype;
 body jsonb;tick_body jsonb;raw bytea;segment text;through_at timestamptz:=new.until_at;idx integer;tick_token text;
begin
 if tg_op='UPDATE' then
   if (to_jsonb(new)-array['ticks','phase','job_id','retirement_receipt','last_at','stopped_at']) is distinct from
      (to_jsonb(old)-array['ticks','phase','job_id','retirement_receipt','last_at','stopped_at']) or new.ticks<old.ticks then
     raise exception 'Immutable baseline collector plan';end if;
   return new;
 end if;
 perform 1 from erp_comm_cost.authority where singleton for update;
 select * into cp from erp_comm_cost.control_pool where permit_id=new.pool for update;
 select * into r from erp_comm_cost.reservation where permit_id=new.pool;
 select * into b from erp_comm_cost.baseline_allocation where id=new.allocation_id;
 if new.phase<>'prepared' or new.ticks<>0 or new.job_id is not null or new.retirement_receipt is not null
   or new.starts_at<date_trunc('minute',clock_timestamp()) or new.starts_at>date_trunc('minute',clock_timestamp())+interval '1 minute'
   or new.until_at<=clock_timestamp()+interval '60 seconds'
   or new.max_ticks<>ceil(extract(epoch from new.until_at-new.starts_at)/60)::integer
   or (select count(distinct x) from unnest(new.nonces)x)<>new.max_ticks
   or cp.permit_id is null or not cp.enabled or cp.kind<>'baseline_poll' or cp.subject<>'communication-baseline'
   or cp.poll_seconds<>60 or cp.used<>0 or cp.max_actions<>new.max_ticks+1 or cp.valid_until<through_at
   or b.id is null or not erp_comm_cost.baseline_allocation_valid(b) or b.valid_until<through_at
   or r.host_deployment_id is distinct from new.deployment_id or r.approval_id is distinct from b.approval_id
   or not erp_comm_cost.permit_prepaid_current(new.pool) or not erp_comm_cost.host_reservation_covered(r)
   or not exists(select from erp_comm_cost.proof p where p.operation_id=r.operation_id and p.retained_at_zero_cost_evidence='existing-plan:'||b.id::text)
   or not exists(select from erp_comm_cost.host_proof_link l join erp_comm_cost.host_window w on w.funding_permit=l.funding_permit
     where l.operation_id=r.operation_id and w.deployment_id=new.deployment_id and w.approval_id=b.approval_id and w.ends_at>=through_at)
   or not exists(select from erp_comm_cost.baseline_prepaid_hold h where h.permit_id=new.pool and h.control_enrolled and h.operating_until>=through_at)
   or (select count(distinct c.dimension) from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
     where h.permit_id=new.pool and c.unit='funded_baseline_nonce_claim_attempts' and c.dimension in('railway','database')
       and c.enabled and c.valid_from<=clock_timestamp() and c.valid_until>=through_at
       and h.units>=new.max_ticks*new.max_physical_starts)<>2
   or not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where h.permit_id=new.pool
     and c.unit='funded_baseline_metrics_reads' and c.dimension='database' and h.units>=new.max_ticks)
   or not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where h.permit_id=new.pool
     and c.unit='baseline_metrics_response_bytes' and c.dimension='railway' and h.units>=2097152::numeric*new.max_ticks)
   or not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where h.permit_id=new.pool
     and c.unit='permanent_ledger_bytes' and c.dimension='database' and h.units>=131072::numeric+32768::numeric*(new.max_ticks+1+new.max_ticks*new.max_physical_starts)) then
   raise sqlstate 'PT503' using message='baseline_collector_unfunded';end if;
 segment:=split_part(new.manifest,'.',1);
 if new.manifest !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then raise sqlstate '22023';end if;
 raw:=decode(rpad(translate(segment,'-_','+/'),((length(segment)+3)/4)*4,'='),'base64');
 body:=convert_from(raw,'UTF8')::jsonb;
 if body<>jsonb_build_object('v',1,'purpose','erp-communication-baseline-plan','planId',new.id,
   'deploymentId',new.deployment_id,'poolId',new.pool,'allocationId',new.allocation_id,
   'startsAt',to_char(new.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'until',to_char(new.until_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'maxTicks',new.max_ticks,'maxPhysicalStarts',new.max_physical_starts,'maxStorageObjects',new.max_storage_objects,
   'maxRelations',new.max_relations,'planHash',new.plan_hash,'nonces',to_jsonb(new.nonces)) then
   raise sqlstate '22023' using message='Baseline collector manifest mismatch';end if;
 -- The HTTP queue is not a private credential store. Keep every future token in
 -- this RLS-protected plan and publish only the current single-use measurement cap.
 for idx in 1..new.max_ticks loop
   tick_token:=new.tick_tokens[idx];
   if length(tick_token)>4096 or tick_token !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then raise sqlstate '22023';end if;
   segment:=split_part(tick_token,'.',1);
   raw:=decode(rpad(translate(segment,'-_','+/'),((length(segment)+3)/4)*4,'='),'base64');
   tick_body:=convert_from(raw,'UTF8')::jsonb;
   if tick_body<>((body-'nonces')||jsonb_build_object('purpose','erp-communication-baseline-tick','intent','measure-baseline',
     'nonce',new.nonces[idx],'ordinal',idx,'scheduledAt',to_char((new.starts_at+make_interval(secs=>(idx-1)*60))at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) then
     raise sqlstate '22023' using message='Single-use baseline tick capability mismatch';end if;
 end loop;
 select evidence_id into strict new.database_source_evidence from erp_comm_cost.baseline_capacity_evidence where capacity_id=b.database_capacity_id;
 select evidence_id into strict new.storage_source_evidence from erp_comm_cost.baseline_capacity_evidence where capacity_id=b.storage_capacity_id;
 return new;
end $$;
create trigger baseline_collector_enrollment before insert or update on erp_comm_cost.baseline_collector_plan
 for each row execute function erp_comm_cost.enroll_baseline_collector_plan();
create function erp_comm_cost.debit_baseline_control(p_pool uuid,p_nonce uuid,p_lane text) returns boolean language plpgsql set search_path='' as $$
declare paid timestamptz;actual uuid;
begin
 begin
   paid:=erp_comm_cost.debit_control('baseline_poll','communication-baseline',p_nonce,p_lane);
   select pool into actual from erp_comm_cost.control_debit where command_id=p_nonce;
   if actual is not null and actual<>p_pool then raise sqlstate 'PT409';end if;
 exception when sqlstate 'PT409' then return false;end;
 return paid is not null and actual=p_pool;
end $$;
create function erp_comm_cost.retire_baseline_collector(p_plan uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.baseline_collector_plan%rowtype;
begin
 select * into p from erp_comm_cost.baseline_collector_plan where id=p_plan for update;
 if p.id is null or p.retirement_receipt is null then return false;end if;
 if p.phase='stopped' then return true;end if;
 if p.job_id is not null then
   begin perform cron.unschedule(p.job_id);exception when others then perform cron.alter_job(p.job_id,active:=false);end;
 end if;
 update erp_comm_cost.baseline_collector_plan set phase='stopped',stopped_at=erp_comm_cost.baseline_collector_clock() where id=p.id;
 update erp_comm_cost.control_pool set enabled=false where permit_id=p.pool and kind='baseline_poll';return true;
end $$;
create function erp_comm_cost.baseline_collector_tick(p_plan uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.baseline_collector_plan%rowtype;n timestamptz;v_nonce uuid;paid timestamptz;actual uuid;v_request_id bigint;
begin
 select * into p from erp_comm_cost.baseline_collector_plan where id=p_plan for update;
 if p.id is null or p.phase<>'running' then return false;end if;
 n:=erp_comm_cost.baseline_collector_clock();
 if n>=p.until_at or p.ticks>=p.max_ticks then return erp_comm_cost.retire_baseline_collector(p.id);end if;
 v_nonce:=p.nonces[p.ticks+1];
 if not erp_comm_cost.debit_baseline_control(p.pool,v_nonce,'collect') then return erp_comm_cost.retire_baseline_collector(p.id);end if;
 update erp_comm_cost.baseline_collector_plan set ticks=ticks+1,last_at=n where id=p.id;
 if n>=p.starts_at+make_interval(secs=>p.ticks*60) and (p.last_at is null or n>=p.last_at+interval '59 seconds') then
   insert into erp_comm_cost.baseline_collector_nonce(nonce,plan_id,ordinal,queued_at,token_sha256)
   values(v_nonce,p.id,p.ticks+1,n,encode(sha256(convert_to(p.tick_tokens[p.ticks+1],'UTF8')),'hex'));
   begin
     v_request_id:=net.http_post(url:='https://erp.algt.net/api/internal/communications/refresh-baseline',body:='{}'::jsonb,params:='{}'::jsonb,
       headers:=jsonb_build_object('Authorization','Bearer '||p.tick_tokens[p.ticks+1],'X-ERP-Baseline-Nonce',v_nonce::text,'Content-Type','application/json'),timeout_milliseconds:=25000);
   exception when others then v_request_id:=null;end;
   update erp_comm_cost.baseline_collector_nonce set request_id=v_request_id where nonce=v_nonce;
   if v_request_id is null then update erp_comm_cost.baseline_capacity_evidence set enabled=false where capacity_id in
     (select database_capacity_id from erp_comm_cost.baseline_allocation where id=p.allocation_id union all
      select storage_capacity_id from erp_comm_cost.baseline_allocation where id=p.allocation_id);end if;
 end if;
 if p.ticks+1>=p.max_ticks then return erp_comm_cost.retire_baseline_collector(p.id);end if;return true;
end $$;
create function erp_comm_cost.start_baseline_collector(p_plan uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.baseline_collector_plan%rowtype;receipt uuid:=gen_random_uuid();job bigint;paid timestamptz;actual uuid;
begin
 select * into p from erp_comm_cost.baseline_collector_plan where id=p_plan for update;
 if p.id is null or p.phase<>'prepared' or p.until_at<=clock_timestamp()+interval '60 seconds' then return false;end if;
 if to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('cron.unschedule(bigint)') is null
   or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then raise sqlstate 'PT503';end if;
 if not erp_comm_cost.debit_baseline_control(p.pool,receipt,'retire') then return false;end if;
 job:=cron.schedule('erp-comm-baseline-'||p.id::text,'* * * * *','select erp_comm_cost.baseline_collector_tick('''||p.id::text||'''::uuid)');
 update erp_comm_cost.baseline_collector_plan set phase='running',retirement_receipt=receipt,job_id=job where id=p.id;return true;
end $$;
create function public.erp_comm_baseline_collector_claim(p_plan uuid,p_nonce uuid,p_deployment uuid,p_pool uuid,p_allocation uuid,p_until timestamptz,p_token_sha256 text)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare p erp_comm_cost.baseline_collector_plan%rowtype;q erp_comm_cost.baseline_collector_nonce%rowtype;b erp_comm_cost.baseline_allocation%rowtype;n timestamptz:=clock_timestamp();
begin
 select * into p from erp_comm_cost.baseline_collector_plan where id=p_plan for update;
 select * into q from erp_comm_cost.baseline_collector_nonce where nonce=p_nonce and plan_id=p_plan for update;
 n:=clock_timestamp();
 if p.id is null or q.nonce is null or q.claim_attempts>=p.max_physical_starts then return false;end if;
 update erp_comm_cost.baseline_collector_nonce set claim_attempts=claim_attempts+1 where nonce=q.nonce;
 if p.id is null or q.nonce is null or p.deployment_id is distinct from p_deployment or p.pool is distinct from p_pool
   or p.allocation_id is distinct from p_allocation or p.until_at is distinct from p_until or n+interval '15 seconds'>=p.until_at
   or q.request_id is null or q.claimed_at is not null or q.queued_at>n or q.queued_at<n-interval '30 seconds'
   or p_token_sha256 is distinct from q.token_sha256
   or not exists(select from erp_comm_cost.control_debit d where d.command_id=q.nonce and d.pool=p.pool and d.lane='collect')
   or not erp_comm_cost.permit_prepaid_current(p.pool)
   or not exists(select from erp_comm_cost.reservation r where r.permit_id=p.pool and erp_comm_cost.host_reservation_covered(r)) then return false;end if;
 select * into strict b from erp_comm_cost.baseline_allocation where id=p.allocation_id;
 update erp_comm_cost.baseline_collector_nonce set claimed_at=n where nonce=q.nonce;
 -- Fail closed before any provider call: a missing/failing/lost completion leaves new
 -- admissions held immediately. Original prepaid safety snapshots are independent.
 update erp_comm_cost.baseline_capacity_evidence set enabled=false where capacity_id in(b.database_capacity_id,b.storage_capacity_id);
 return true;
end $$;
create function public.erp_comm_baseline_collector_record(p_plan uuid,p_nonce uuid,p_size text,p_available text,p_digest text)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare p erp_comm_cost.baseline_collector_plan%rowtype;q erp_comm_cost.baseline_collector_nonce%rowtype;b erp_comm_cost.baseline_allocation%rowtype;
 db_e erp_comm_cost.baseline_capacity_evidence%rowtype;st_e erp_comm_cost.baseline_capacity_evidence%rowtype;
 size_bytes bigint;avail_bytes bigint;comm_bytes bigint:=0;storage_total numeric:=0;storage_comm numeric:=0;objects integer:=0;relations integer:=0;
 row_data record;n timestamptz:=clock_timestamp();receipt text;row_size numeric;meter_data record;kind text;meters_read integer:=0;
begin
 select * into p from erp_comm_cost.baseline_collector_plan where id=p_plan for update;
 select * into q from erp_comm_cost.baseline_collector_nonce where nonce=p_nonce and plan_id=p_plan for update;
 n:=clock_timestamp();
 if p.id is null or q.claimed_at is null or q.finished_at is not null or q.claimed_at>n or q.claimed_at<n-interval '15 seconds'
   or n+interval '4 seconds'>=p.until_at or p_digest is null or p_size is null or p_available is null
   or p_digest !~ '^[0-9a-f]{64}$' or p_size !~ '^[1-9][0-9]{0,15}$' or p_available !~ '^(0|[1-9][0-9]{0,15})$'
   or not erp_comm_cost.permit_prepaid_current(p.pool) then return false;end if;
 update erp_comm_cost.baseline_collector_nonce set finished_at=n,success=false,response_sha256=p_digest where nonce=q.nonce;
 begin
   size_bytes:=p_size::bigint;avail_bytes:=p_available::bigint;if avail_bytes>size_bytes then return false;end if;
   select * into strict b from erp_comm_cost.baseline_allocation where id=p.allocation_id;
   select * into strict db_e from erp_comm_cost.baseline_capacity_evidence where capacity_id=b.database_capacity_id;
   select * into strict st_e from erp_comm_cost.baseline_capacity_evidence where capacity_id=b.storage_capacity_id;
   for row_data in select c.oid,c.relname,c.relkind,nsp.nspname from pg_catalog.pg_class c join pg_catalog.pg_namespace nsp on nsp.oid=c.relnamespace limit p.max_relations+1 loop
     if clock_timestamp()>=n+interval '3 seconds' then return false;end if;
     relations:=relations+1;if relations>p.max_relations then return false;end if;
     if row_data.relkind in('r','m') and (row_data.nspname='erp_comm_cost' or
       (row_data.nspname='erp_private' and row_data.relname ~ '^(chat_|ptt_|sos_|comms_|notification_)') or
       (row_data.nspname='public' and row_data.relname='erp_notifications')) then
       comm_bytes:=comm_bytes+pg_catalog.pg_total_relation_size(row_data.oid);
     end if;
   end loop;
   for row_data in select bucket_id,metadata->>'size' as byte_size from storage.objects limit p.max_storage_objects+1 loop
     if clock_timestamp()>=n+interval '3 seconds' then return false;end if;
     objects:=objects+1;if objects>p.max_storage_objects or row_data.byte_size is null or row_data.byte_size !~ '^(0|[1-9][0-9]{0,29})$' then return false;end if;
     row_size:=row_data.byte_size::numeric;storage_total:=storage_total+row_size;
     if row_data.bucket_id in('erp-chat-media','erp-ptt-recordings') then storage_comm:=storage_comm+row_size;end if;
   end loop;
   -- Original plan ceilings/quotas/headroom never increase. A changed/smaller disk,
   -- incomplete catalog or exhausted actual physical allocation stays held.
   if size_bytes<db_e.physical_limit_bytes or comm_bytes>size_bytes-avail_bytes
     or db_e.allocated_bytes>db_e.physical_limit_bytes-((size_bytes-avail_bytes)-comm_bytes)-db_e.reserved_other_bytes-db_e.safety_headroom_bytes
     or st_e.allocated_bytes>st_e.physical_limit_bytes-(storage_total-storage_comm)-st_e.reserved_other_bytes-st_e.safety_headroom_bytes
     or comm_bytes>b.database_quota_bytes or storage_comm>b.storage_quota_bytes then return false;end if;
   receipt:='collector:'||p.id::text||'/'||q.nonce::text||'/'||p_digest;
   if clock_timestamp()+interval '1 second'>=p.until_at then return false;end if;
   update erp_comm_cost.baseline_capacity_evidence set observed_at=q.claimed_at,evidence_id=receipt,
     observed_total_bytes=size_bytes-avail_bytes,observed_communications_bytes=comm_bytes,enabled=true where capacity_id=b.database_capacity_id;
   update erp_comm_cost.baseline_capacity_evidence set observed_at=q.claimed_at,evidence_id=receipt,
     observed_total_bytes=storage_total,observed_communications_bytes=storage_comm,enabled=true where capacity_id=b.storage_capacity_id;
   -- Re-observe only actual measured physical usage or reviewed immutable accounting
   -- bases. No generic provider usage series, price, quantity or deadline is refreshed.
   for meter_data in select m.*,c.unit,c.dimension as actual_dimension,rb as reviewed_basis
     from (select template_id from erp_comm_cost.standing_envelope where enabled
       union select template_id from erp_comm_cost.command_envelope where enabled) s
     join erp_comm_cost.proof pr on pr.operation_id=s.template_id
     join erp_comm_cost.meter m on m.operation_id=pr.operation_id join erp_comm_cost.capacity c on c.id=m.capacity_id
     left join erp_comm_cost.meter_refresh_basis rb on rb.operation_id=m.operation_id and rb.capacity_id=m.capacity_id
     where pr.approval_id=b.approval_id and pr.retained_at_zero_cost_evidence='existing-plan:'||b.id::text
       and m.complete and m.valid_until>n and pr.valid_until>n and c.enabled and c.valid_from<=n and c.valid_until>n
     limit p.max_relations+1
   loop
     meters_read:=meters_read+1;
     if meters_read>p.max_relations or clock_timestamp()>=n+interval '3 seconds' then raise sqlstate '57014' using message='Bounded baseline refresh exhausted';end if;
     kind:=null;
     if meter_data.capacity_id=b.database_capacity_id then kind:='physical_database';
     elsif meter_data.capacity_id=b.storage_capacity_id then kind:='physical_storage';
     elsif (meter_data.reviewed_basis).operation_id is not null and erp_comm_cost.meter_refresh_basis_valid(meter_data.reviewed_basis,p.deployment_id) then kind:=(meter_data.reviewed_basis).basis;
     end if;
     if kind is not null then
       insert into erp_comm_cost.baseline_meter_observation(operation_id,capacity_id,original_evidence_id,last_nonce,observation_kind,observed_at)
       values(meter_data.operation_id,meter_data.capacity_id,meter_data.evidence_id,q.nonce,kind,q.claimed_at)
       on conflict(operation_id,capacity_id) do update set last_nonce=excluded.last_nonce,observation_kind=excluded.observation_kind,observed_at=excluded.observed_at;
       update erp_comm_cost.meter set observed_at=q.claimed_at where operation_id=meter_data.operation_id and capacity_id=meter_data.capacity_id;
     end if;
   end loop;
   update erp_comm_cost.baseline_collector_nonce set success=true,disk_size_bytes=size_bytes,disk_available_bytes=avail_bytes,
     database_communications_bytes=comm_bytes,storage_total_bytes=storage_total,storage_communications_bytes=storage_comm,
     objects_read=objects,relations_read=relations where nonce=q.nonce;
   return true;
 exception when others then return false;end;
end $$;
alter table erp_comm_cost.baseline_collector_plan enable row level security;
alter table erp_comm_cost.baseline_collector_nonce enable row level security;
alter table erp_comm_cost.meter_refresh_basis enable row level security;
alter table erp_comm_cost.baseline_meter_observation enable row level security;
revoke all on erp_comm_cost.baseline_collector_plan,erp_comm_cost.baseline_collector_nonce,erp_comm_cost.meter_refresh_basis,erp_comm_cost.baseline_meter_observation from public,anon,authenticated,service_role;
revoke all on function erp_comm_cost.baseline_collector_clock(),erp_comm_cost.enroll_baseline_collector_plan(),
 erp_comm_cost.retire_baseline_collector(uuid),erp_comm_cost.baseline_collector_tick(uuid),erp_comm_cost.start_baseline_collector(uuid),
 erp_comm_cost.debit_baseline_control(uuid,uuid,text),
 erp_comm_cost.meter_refresh_basis_valid(erp_comm_cost.meter_refresh_basis,uuid),erp_comm_cost.enroll_meter_refresh_basis(),erp_comm_cost.meter_refresh_bounds_current(text,uuid),
 public.erp_comm_baseline_collector_claim(uuid,uuid,uuid,uuid,uuid,timestamptz,text),public.erp_comm_baseline_collector_record(uuid,uuid,text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.erp_comm_baseline_collector_claim(uuid,uuid,uuid,uuid,uuid,timestamptz,text),
 public.erp_comm_baseline_collector_record(uuid,uuid,text,text,text) to service_role;
commit;
