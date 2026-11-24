-- Current-only offline signed notifications. No grant, plan, cron, provider,
-- credential, queue content or enabled flag is installed/read by this migration.
begin;
set local lock_timeout='5s';

-- Retire only the communications self-chain. Existing ERP event, DMS/HR and
-- employment sources/recipient checks remain untouched. Never read Vault here.
create or replace function erp_private.notification_queue_tick(p_run uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin perform erp_private.notification_stop_scheduler(p_run);return false;end $$;
revoke all on function erp_private.notification_queue_tick(uuid) from public,anon,authenticated,service_role;
do $$begin
 if to_regprocedure('public.erp_notification_tick(text,uuid,uuid)') is not null then
  revoke all on function public.erp_notification_tick(text,uuid,uuid) from public,anon,authenticated,service_role;
 end if;
end $$;

-- Installed before compiling funding SQL. Only the protected compiler funding
-- transaction supplies the actual database-assigned permit and reviewed manifest.
create table erp_comm_cost.notification_tick_authorization(
 pool uuid primary key references erp_comm_cost.control_pool(permit_id), manifest jsonb not null,
 check(jsonb_typeof(manifest)='object'));
create trigger notification_tick_authorization_immutable before update or delete on erp_comm_cost.notification_tick_authorization
 for each row execute function erp_comm_cost.immutable_host_link();
alter table erp_comm_cost.notification_tick_authorization enable row level security;
revoke all on table erp_comm_cost.notification_tick_authorization from public,anon,authenticated,service_role;
create function erp_comm_cost.notification_tick_funding_receipt(p_pool uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('poolId',pool,'manifest',manifest,'planHash',encode(sha256(convert_to(concat_ws(E'\n',
  'signed-notifications-v2',pool::text,manifest->>'v',manifest->>'planId',manifest->>'deploymentId',manifest->>'allocationId',
  manifest->>'approvalId',manifest->>'approvalFingerprint',manifest->>'startsAt',manifest->>'until',manifest->>'controlUntil',
  manifest->>'maxPhysicalStarts',manifest->>'calendarEnabled',manifest->>'pushEnabled',manifest->>'profileSha256','60','1','125'),'UTF8')),'hex'))
 from erp_comm_cost.notification_tick_authorization where pool=p_pool
$$;
create table erp_comm_cost.notification_tick_plan(
 id uuid primary key,pool uuid not null unique references erp_comm_cost.control_pool(permit_id),
 allocation_id uuid not null references erp_comm_cost.baseline_allocation(id),deployment_id uuid not null,
 starts_at timestamptz not null,until_at timestamptz not null,max_ticks integer not null check(max_ticks between 1 and 120),
 max_physical_starts integer not null check(max_physical_starts between 1 and 16),
 calendar_enabled boolean not null,push_enabled boolean not null,plan_hash text not null check(plan_hash ~ '^[0-9a-f]{64}$'),
 nonces uuid[] not null,tick_tokens text[] not null,ticks integer not null default 0 check(ticks between 0 and max_ticks),
 phase text not null default 'prepared' check(phase in('prepared','running','stopped')),job_id bigint,retirement_receipt uuid,
 active_nonce uuid,active_until timestamptz,last_at timestamptz,stopped_at timestamptz,
 check(isfinite(starts_at) and isfinite(until_at) and starts_at=date_trunc('minute',starts_at)
  and until_at=date_trunc('minute',until_at) and starts_at<until_at and until_at<=starts_at+interval '2 hours'
  and until_at<='2026-11-30T19:59:00Z'::timestamptz),
 check(cardinality(nonces)=max_ticks and array_position(nonces,null) is null
  and cardinality(tick_tokens)=max_ticks and array_position(tick_tokens,null) is null)
);
create table erp_comm_cost.notification_tick_nonce(
 nonce uuid primary key,plan_id uuid not null references erp_comm_cost.notification_tick_plan(id),ordinal integer not null,
 token_sha256 text not null check(token_sha256 ~ '^[0-9a-f]{64}$'),queued_at timestamptz,request_id bigint,
 claim_attempts integer not null default 0 check(claim_attempts between 0 and 16),claimed_at timestamptz,
 work_until timestamptz,finished_at timestamptz,success boolean,unique(plan_id,ordinal)
);
create function erp_comm_cost.notification_tick_clock() returns timestamptz language sql volatile set search_path='' as $$select clock_timestamp()$$;
-- Preserve each original source/recipient predicate, expose only a single-row
-- page per source for this paid pilot, and leave the original helpers untouched.
do $page$
declare name text;original text;needle text;expected integer;candidate text;expected_hash text;actual_hash text;
begin
 for name,needle,expected,expected_hash in values ('notification_project_chat','limit 100',1,'20480101f053966e8865a26bdcd1bc128083360ba5e16999e85e90469175176b'),('notification_collect_due','limit 100',2,'7b34a93b4d61bcfaf9c28d3070ed300d767fff682743f8d686fed7b572b86afc'),
  ('notification_recover','limit 32',1,'be3ec97638a1489883a1e9cf851757a3124f8996631b6998745698a6e2cf8b71') loop
  original:=pg_get_functiondef(('erp_private.'||name||'()')::regprocedure);
  select encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex') into actual_hash
   from pg_proc p where p.oid=('erp_private.'||name||'()')::regprocedure;
  if expected_hash<>actual_hash or (length(original)-length(replace(original,needle,'')))/length(needle)<>expected then
   raise exception 'Unexpected projection source shape for %',name;
  end if;
  candidate:=replace(original,'FUNCTION erp_private.'||name||'()', 'FUNCTION erp_comm_cost.signed_'||name||'()');
  if candidate=original then raise exception 'Unexpected projection identity';end if;
  execute replace(candidate,needle,'limit 1');
 end loop;
end $page$;
-- Preserve original device eligibility/uniqueness and cap new jobs at one per
-- tick. Each class independently checks due rows. Future retries do not block
-- control projection. The ordinary worker retains its original recipient check.
create function erp_comm_cost.signed_notification_project_devices(p_ordinary boolean,p_control boolean)
returns void language sql set search_path='' as $$
 with classes(control,enabled) as (values (false,p_ordinary),(true,p_control)), ready as (
  select c.control from classes c where c.enabled and not exists(
   select from erp_private.notification_push_jobs j join erp_private.notification_inbox e on e.id=j.event
   where j.state in ('pending','working') and j.next_try<=clock_timestamp() and (e.kind in ('budget','sos'))=c.control
   offset 1 limit 1))
 insert into erp_private.notification_push_jobs(event,device)
 select i.id,d.id from ready r join erp_private.notification_inbox i on (i.kind='budget')=r.control
 join erp_private.notification_devices d on d.profile_id=i.profile_id and d.registered_at<=i.created_at
 where i.kind in ('chat','erp','intake','timesheet','leaveStart','employeeExpiry','leaveChange','budget')
  and i.read_at is null and not exists(select from erp_private.notification_push_jobs j where j.event=i.id and j.device=d.id)
 order by r.control desc,i.n,d.id limit 1 on conflict(event,device) do nothing
$$;
create function erp_comm_cost.enroll_notification_tick_plan() returns trigger language plpgsql set search_path='' as $$
declare cp erp_comm_cost.control_pool%rowtype;r erp_comm_cost.reservation%rowtype;b erp_comm_cost.baseline_allocation%rowtype;
 through_at timestamptz:=new.until_at+interval '125 seconds';receipt jsonb;manifest jsonb;idx integer;body jsonb;segment text;raw bytea;
begin
 if tg_op='UPDATE' then
  if (to_jsonb(new)-array['ticks','phase','job_id','retirement_receipt','active_nonce','active_until','last_at','stopped_at']) is distinct from
     (to_jsonb(old)-array['ticks','phase','job_id','retirement_receipt','active_nonce','active_until','last_at','stopped_at']) or new.ticks<old.ticks then
   raise exception 'Immutable signed notification plan';end if;return new;
 end if;
 perform 1 from erp_comm_cost.authority where singleton for update;
 select * into cp from erp_comm_cost.control_pool where permit_id=new.pool for update;
 select * into r from erp_comm_cost.reservation where permit_id=new.pool;
 select * into b from erp_comm_cost.baseline_allocation where id=new.allocation_id;
 receipt:=erp_comm_cost.notification_tick_funding_receipt(new.pool);manifest:=receipt->'manifest';
 if receipt is null or receipt->>'planHash' is distinct from new.plan_hash or coalesce(manifest->>'profileSha256','') !~ '^[a-f0-9]{64}$'
  or not exists(select from erp_comm_cost.baseline_approval_receipt br join erp_comm_cost.approval a on a.id=br.approval_id
   where br.approval_id=r.approval_id and br.fingerprint=erp_comm_cost.baseline_approval_fingerprint(a)
    and manifest=jsonb_build_object('v',1,'planId',new.id,'deploymentId',new.deployment_id,'allocationId',new.allocation_id,
     'approvalId',a.id,'approvalFingerprint',encode(br.fingerprint,'hex'),'profileSha256',manifest->>'profileSha256',
     'startsAt',to_char(new.starts_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
     'until',to_char(new.until_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
     'controlUntil',to_char(cp.valid_until at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
     'maxPhysicalStarts',new.max_physical_starts,'calendarEnabled',new.calendar_enabled,'pushEnabled',new.push_enabled)) then
  raise sqlstate 'PT503' using message='signed_notification_review_mismatch';end if;
 if new.phase<>'prepared' or new.ticks<>0 or new.job_id is not null or new.retirement_receipt is not null or new.active_nonce is not null or new.active_until is not null
  or new.starts_at<>date_trunc('minute',erp_comm_cost.notification_tick_clock())+interval '1 minute'
  or new.until_at<=erp_comm_cost.notification_tick_clock()+interval '60 seconds' or new.max_ticks<>extract(epoch from new.until_at-new.starts_at)::integer/60
  or (select count(distinct x) from unnest(new.nonces)x)<>new.max_ticks
  or cp.permit_id is null or not cp.enabled or cp.kind<>'notification_tick' or cp.subject<>'mobile-notifications'
  or cp.used<>0 or cp.max_actions<>new.max_ticks+1 or cp.poll_seconds<>60 or cp.valid_until<through_at
  or b.id is null or not erp_comm_cost.baseline_allocation_valid(b) or b.valid_until<through_at
  or r.host_deployment_id is distinct from new.deployment_id or r.approval_id is distinct from b.approval_id
  or not erp_comm_cost.permit_prepaid_current(new.pool) or not erp_comm_cost.host_reservation_covered(r)
  or not exists(select from erp_comm_cost.proof p where p.operation_id=r.operation_id and p.retained_at_zero_cost_evidence='existing-plan:'||b.id::text)
  or not exists(select from erp_comm_cost.host_proof_link l join erp_comm_cost.host_window w on w.funding_permit=l.funding_permit
   where l.operation_id=r.operation_id and w.deployment_id=new.deployment_id and w.approval_id=b.approval_id and w.ends_at>=through_at
    and w.admission_ends_at>=new.until_at and erp_comm_cost.host_window_funded(w,true))
  or not exists(select from erp_comm_cost.baseline_prepaid_hold h where h.permit_id=new.pool and h.control_enrolled and h.operating_until>=through_at)
  or (select count(distinct c.dimension) from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
   where h.permit_id=new.pool and c.unit='funded_notification_tick_claim_attempts' and c.dimension in('railway','database')
    and ((c.dimension='database' and c.billing_account=(select db.billing_account from erp_comm_cost.capacity db where db.id=b.database_capacity_id))
     or (c.dimension='railway' and exists(select from erp_comm_cost.host_proof_link link join erp_comm_cost.unit_hold hu on hu.permit_id=link.funding_permit
      join erp_comm_cost.capacity hc on hc.id=hu.capacity_id where link.operation_id=r.operation_id and hc.dimension='railway'
       and hc.unit='funded_host_wall_seconds' and hc.billing_account=c.billing_account)))
    and c.enabled and c.valid_from<=clock_timestamp() and c.valid_until>=through_at and h.units>=new.max_ticks*new.max_physical_starts)<>2
  or not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where h.permit_id=new.pool
   and c.unit='permanent_ledger_bytes' and c.dimension='database'
   and exists(select from erp_comm_cost.unit_hold storage where storage.permit_id=new.pool and storage.capacity_id=b.database_capacity_id
    and storage.units>=h.units+8388608::numeric*new.max_ticks)
   and h.units>=131072::numeric+32768::numeric*(new.max_ticks+1+new.max_ticks*new.max_physical_starts)) then
  raise sqlstate 'PT503' using message='signed_notification_plan_unfunded';end if;
 for idx in 1..new.max_ticks loop
  if length(new.tick_tokens[idx])>4096 or new.tick_tokens[idx] !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then raise sqlstate '22023';end if;
  segment:=split_part(new.tick_tokens[idx],'.',1);
  raw:=decode(rpad(translate(segment,'-_','+/'),((length(segment)+3)/4)*4,'='),'base64');body:=convert_from(raw,'UTF8')::jsonb;
  if body<>jsonb_build_object('v',1,'purpose','erp-communication-notification-tick','intent','dispatch-notifications',
   'planId',new.id,'deploymentId',new.deployment_id,'poolId',new.pool,'allocationId',new.allocation_id,
   'startsAt',to_char(new.starts_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'until',to_char(new.until_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'maxTicks',new.max_ticks,'maxPhysicalStarts',new.max_physical_starts,'maxClaims',1,'calendarEnabled',new.calendar_enabled,
   'pushEnabled',new.push_enabled,'planHash',new.plan_hash,'nonce',new.nonces[idx],'ordinal',idx,
   'scheduledAt',to_char((new.starts_at+make_interval(secs=>(idx-1)*60))at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) then
   raise sqlstate '22023' using message='Current notification tick capability mismatch';end if;
 end loop;
 return new;
end $$;
create trigger notification_tick_plan_enrollment before insert or update on erp_comm_cost.notification_tick_plan
 for each row execute function erp_comm_cost.enroll_notification_tick_plan();
create function erp_comm_cost.debit_signed_notification(p_pool uuid,p_nonce uuid,p_lane text) returns boolean language plpgsql set search_path='' as $$
declare paid timestamptz;actual uuid;
begin
 begin
  if p_pool is null or p_nonce is null or p_lane is null or p_lane not in ('retire','signed_tick') then return false;end if;
  -- The original 'boot' lane performs every physical, financial and host check
  -- without the legacy chained wait. Label only this transaction's new receipt.
  paid:=erp_comm_cost.debit_control('notification_tick','mobile-notifications',p_nonce,'boot');
  if paid is null then return false;end if;
  select pool into actual from erp_comm_cost.control_debit where command_id=p_nonce;
  if actual is distinct from p_pool then raise sqlstate 'PT409';end if;
  update erp_comm_cost.control_debit set lane=p_lane,notification_projection_until=null
   where pool=p_pool and command_id=p_nonce and lane='boot';
  if not found then raise sqlstate 'PT409';end if;
 exception when sqlstate 'PT409' then return false;end;
 return paid is not null and actual=p_pool;
end $$;
-- New projections and dispatch require active admission. A paid retirement
-- remains available if the owner closes the gate after enrollment.
create function erp_comm_cost.notification_tick_work_open(p erp_comm_cost.notification_tick_plan)
returns boolean language sql volatile set search_path='' as $$
 select exists(select from erp_comm_cost.reservation r join erp_comm_cost.host_proof_link l using(operation_id)
  join erp_comm_cost.host_window w on w.funding_permit=l.funding_permit join erp_comm_cost.control_pool cp on cp.permit_id=r.permit_id
  where r.permit_id=p.pool and r.host_deployment_id=p.deployment_id and w.deployment_id=p.deployment_id
   and w.approval_id=r.approval_id and cp.enabled and clock_timestamp()<w.admission_ends_at and p.until_at<=w.admission_ends_at
   and erp_comm_cost.host_window_funded(w,true) and erp_comm_cost.host_reservation_covered(r)
   and erp_comm_cost.permit_prepaid_current(r.permit_id) and erp_comm_cost.permit_baseline_current(r.permit_id)
   and exists(select from erp_comm_cost.baseline_allocation b where b.id=p.allocation_id and erp_comm_cost.baseline_allocation_valid(b))
   and not exists(select from erp_comm_cost.pause q where q.scope=r.scope and q.feature=r.feature))
$$;
create function erp_comm_cost.retire_notification_tick_plan(p_plan uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.notification_tick_plan%rowtype;
begin
 select * into p from erp_comm_cost.notification_tick_plan where id=p_plan for update;
 if p.id is null or p.retirement_receipt is null then return false;end if;if p.phase='stopped' then return true;end if;
 if p.job_id is not null then
  begin
   if not cron.unschedule(p.job_id) and exists(select from cron.job where jobid=p.job_id and active) then
    perform cron.alter_job(p.job_id,active:=false);
   end if;
  exception when others then
   if exists(select from cron.job where jobid=p.job_id and active) then perform cron.alter_job(p.job_id,active:=false);end if;
  end;
 end if;
 update erp_comm_cost.notification_tick_plan set phase='stopped',stopped_at=erp_comm_cost.notification_tick_clock() where id=p.id;
 update erp_comm_cost.control_pool set enabled=false where permit_id=p.pool and kind='notification_tick';return true;
end $$;
create function erp_comm_cost.signed_notification_tick(p_plan uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.notification_tick_plan%rowtype;n timestamptz;v_nonce uuid;v_request bigint;
begin
 select * into p from erp_comm_cost.notification_tick_plan where id=p_plan for update;
 if p.id is null or p.phase<>'running' then return false;end if;n:=erp_comm_cost.notification_tick_clock();
 if n>=p.until_at or p.ticks>=p.max_ticks or not erp_comm_cost.notification_tick_work_open(p) then return erp_comm_cost.retire_notification_tick_plan(p.id);end if;
 v_nonce:=p.nonces[p.ticks+1];
 if not erp_comm_cost.debit_signed_notification(p.pool,v_nonce,'signed_tick') then return erp_comm_cost.retire_notification_tick_plan(p.id);end if;
 update erp_comm_cost.notification_tick_plan set ticks=ticks+1,last_at=n where id=p.id;
 insert into erp_comm_cost.notification_tick_nonce(nonce,plan_id,ordinal,token_sha256)
 values(v_nonce,p.id,p.ticks+1,encode(sha256(convert_to(p.tick_tokens[p.ticks+1],'UTF8')),'hex'));
 -- Early/late/missed wakes still consume their one original paid action. They
 -- cannot publish a future/expired capability or scan for another token.
 if n>=p.starts_at+make_interval(secs=>p.ticks*60) and n<p.starts_at+make_interval(secs=>p.ticks*60)+interval '10 seconds' then
  begin
   v_request:=net.http_post(url:='https://erp.algt.net/api/internal/communications/notification-tick',body:='{}'::jsonb,params:='{}'::jsonb,
    headers:=jsonb_build_object('Authorization','Bearer '||p.tick_tokens[p.ticks+1],'X-ERP-Notification-Nonce',v_nonce::text,'Content-Type','application/json'),timeout_milliseconds:=45000);
  exception when others then v_request:=null;end;
  update erp_comm_cost.notification_tick_nonce set queued_at=n,request_id=v_request where nonce=v_nonce;
 end if;
 return true;
end $$;
create function erp_comm_cost.start_notification_tick_plan(p_plan uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p erp_comm_cost.notification_tick_plan%rowtype;receipt uuid:=gen_random_uuid();job bigint;
begin
 select * into p from erp_comm_cost.notification_tick_plan where id=p_plan for update;
 if p.id is null or p.phase<>'prepared' or p.starts_at<=erp_comm_cost.notification_tick_clock() or not erp_comm_cost.notification_tick_work_open(p) then return false;end if;
 if to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('cron.unschedule(bigint)') is null
  or (to_regprocedure('cron.alter_job(bigint,boolean)') is null and to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is null)
  or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then raise sqlstate 'PT503';end if;
 if not erp_comm_cost.debit_signed_notification(p.pool,receipt,'retire') then return false;end if;
 job:=cron.schedule('erp-comm-notification-'||p.id::text,'* * * * *','set statement_timeout=''5s'';select erp_comm_cost.signed_notification_tick('''||p.id::text||'''::uuid)');
 update erp_comm_cost.notification_tick_plan set phase='running',retirement_receipt=receipt,job_id=job where id=p.id;return true;
end $$;
create function public.erp_comm_notification_tick_claim(p_plan uuid,p_nonce uuid,p_deployment uuid,p_pool uuid,p_allocation uuid,p_until timestamptz,p_token_sha256 text,p_ordinary boolean,p_control boolean)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare p erp_comm_cost.notification_tick_plan%rowtype;q erp_comm_cost.notification_tick_nonce%rowtype;n timestamptz;scheduled timestamptz;deadline timestamptz;
begin
 select * into p from erp_comm_cost.notification_tick_plan where id=p_plan for update;
 select * into q from erp_comm_cost.notification_tick_nonce where nonce=p_nonce and plan_id=p_plan for update;
 -- This must already be a bounded top-level statement. A timeout applied
 -- inside a running function or JS-side transport timeout is insufficient.
 if (select setting::bigint from pg_settings where name='statement_timeout') not between 1 and 5000 then return null;end if;
 if p.id is null or q.nonce is null or q.claim_attempts>=p.max_physical_starts then return null;end if;
 update erp_comm_cost.notification_tick_nonce set claim_attempts=claim_attempts+1 where nonce=q.nonce;
 n:=erp_comm_cost.notification_tick_clock();scheduled:=p.starts_at+make_interval(secs=>(q.ordinal-1)*60);deadline:=least(scheduled+interval '45 seconds',p.until_at);
 if p.phase<>'running' or p.deployment_id is distinct from p_deployment or p.pool is distinct from p_pool
  or p.allocation_id is distinct from p_allocation or p.until_at is distinct from p_until or q.request_id is null or q.claimed_at is not null
  or q.queued_at>n or n<scheduled or n>=scheduled+interval '15 seconds' or n+interval '27 seconds'>=deadline
  or p_ordinary is null or p_control is null or p_token_sha256 is distinct from q.token_sha256 or p.active_until>n
  or not exists(select from erp_comm_cost.control_debit d where d.pool=p.pool and d.command_id=q.nonce and d.lane='signed_tick')
  or not erp_comm_cost.notification_tick_work_open(p) then return null;end if;
 update erp_comm_cost.notification_tick_nonce set claimed_at=n,work_until=deadline where nonce=q.nonce;
 update erp_comm_cost.notification_tick_plan set active_nonce=q.nonce,active_until=deadline where id=p.id;
 -- Same original bounded projections and recipient checks. Failure burns this
 -- claimed tick, never a business transaction or another work successor.
 begin
  update erp_comm_cost.control_debit set notification_projection_until=deadline where pool=p.pool and command_id=q.nonce;
  if exists(select from erp_private.notification_capture_gate where controls) then perform erp_comm_cost.project_due_alerts(p.pool,q.nonce,1);end if;
  if exists(select from erp_private.notification_capture_gate where enabled or controls) then perform erp_comm_cost.signed_notification_recover();end if;
  if p.calendar_enabled and exists(select from erp_private.notification_capture_gate where enabled) then perform erp_comm_cost.signed_notification_collect_due();end if;
  perform erp_comm_cost.signed_notification_project_chat();
  if p.push_enabled then perform erp_comm_cost.signed_notification_project_devices(p_ordinary,p_control);end if;
 exception when others then
  update erp_comm_cost.notification_tick_nonce set finished_at=n,success=false where nonce=q.nonce;return null;
 end;
 return jsonb_build_object('pushEnabled',p.push_enabled,'workUntilMs',floor(extract(epoch from deadline)*1000)::bigint);
end $$;
create function public.erp_comm_notification_tick_finish(p_plan uuid,p_nonce uuid,p_success boolean) returns boolean
language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare p erp_comm_cost.notification_tick_plan%rowtype;q erp_comm_cost.notification_tick_nonce%rowtype;n timestamptz;
begin
 select * into p from erp_comm_cost.notification_tick_plan where id=p_plan for update;
 select * into q from erp_comm_cost.notification_tick_nonce where plan_id=p_plan and nonce=p_nonce for update;n:=erp_comm_cost.notification_tick_clock();
 if p.id is null or q.claimed_at is null or q.finished_at is not null or q.work_until<=n or p.active_nonce is distinct from q.nonce or p_success is null then return false;end if;
 update erp_comm_cost.notification_tick_nonce set finished_at=n,success=p_success where nonce=q.nonce;
 update erp_comm_cost.notification_tick_plan set active_nonce=null,active_until=null where id=p.id;return true;
end $$;
alter table erp_comm_cost.notification_tick_plan enable row level security;
alter table erp_comm_cost.notification_tick_nonce enable row level security;
revoke all on table erp_comm_cost.notification_tick_plan,erp_comm_cost.notification_tick_nonce from public,anon,authenticated,service_role;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_comm_cost'
  and p.proname=any(array['signed_notification_recover','signed_notification_project_chat','signed_notification_collect_due','signed_notification_project_devices','notification_tick_funding_receipt','notification_tick_clock','enroll_notification_tick_plan','debit_signed_notification','notification_tick_work_open','retire_notification_tick_plan','signed_notification_tick','start_notification_tick_plan']) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);end loop;
end $$;
revoke all on function public.erp_comm_notification_tick_claim(uuid,uuid,uuid,uuid,uuid,timestamptz,text,boolean,boolean),public.erp_comm_notification_tick_finish(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.erp_comm_notification_tick_claim(uuid,uuid,uuid,uuid,uuid,timestamptz,text,boolean,boolean),public.erp_comm_notification_tick_finish(uuid,uuid,boolean) to service_role;
commit;
