begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Future-write validation only: no historical values are inferred or repaired.
create function erp_private.validate_master_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 target jsonb; field text:=TG_ARGV[0]; parent_table text:=TG_ARGV[1]; activated boolean; employee_company bigint;
begin
 if parent_table not in ('departments','work_calendars','work_shifts') then raise exception 'Unsupported parent' using errcode='22023';end if;
 activated:=(n->>'deleted_at' is null and o->>'deleted_at' is not null) or (n->>'is_active'='true' and o->>'is_active'='false')
  or (n->>'status'='active' and o->>'status' is distinct from 'active');
 if n->>field is null or (TG_OP='UPDATE' and n->field is not distinct from o->field and not coalesce(activated,false)
  and n->'owner_company_id' is not distinct from o->'owner_company_id'
  and n->'work_calendar_id' is not distinct from o->'work_calendar_id'
  and n->'employee_id' is not distinct from o->'employee_id') then return new;end if;
 -- SHARE conflicts with retirement's row UPDATE lock. A racing new assignment
 -- cannot attach after dependency inspection has allowed retirement to commit.
 execute format('select to_jsonb(t) from public.%I t where id=$1 for share',parent_table) into target using (n->>field)::bigint;
 if target is null or target->>'deleted_at' is not null or target->>'is_active' is distinct from 'true' then
  raise exception 'Choose an active, available parent record' using errcode='23503';
 end if;
 if n->>'owner_company_id' is not null and target->>'owner_company_id' is not null
  and n->>'owner_company_id'<>target->>'owner_company_id' then
  raise exception 'Parent must belong to the same company' using errcode='23514';
 end if;
 if TG_TABLE_NAME='employee_shift_assignments' and parent_table='work_shifts'
  and n->>'work_calendar_id' is not null and n->>'work_calendar_id'<>target->>'calendar_id' then
  raise exception 'Shift and calendar do not match' using errcode='23514';
 end if;
 if TG_TABLE_NAME='employee_shift_assignments' then
  select owner_company_id into employee_company from public.employees where id=(n->>'employee_id')::bigint for share;
  if parent_table='work_shifts' then
   if exists(select 1 from public.work_calendars where id=(target->>'calendar_id')::bigint and owner_company_id is not null and owner_company_id is distinct from employee_company) then
    raise exception 'Employee and shift company do not match' using errcode='23514';
   end if;
  elsif target->>'owner_company_id' is not null and (target->>'owner_company_id')::bigint is distinct from employee_company then
   raise exception 'Employee and calendar company do not match' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
revoke all on function erp_private.validate_master_reference() from public,anon,authenticated;
do $$ declare dependency record; begin
 for dependency in
  select c.oid,ns.nspname,cl.relname,a.attname,target.relname as parent_table
  from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
  join pg_class target on target.oid=c.confrelid join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid in ('public.departments'::regclass,'public.work_calendars'::regclass,'public.work_shifts'::regclass)
   and array_length(c.conkey,1)=1 and ns.nspname='public'
 loop
  execute format('create trigger %I before insert or update on %I.%I for each row execute function erp_private.validate_master_reference(%L,%L)',
   'f06_reference_'||dependency.attname,dependency.nspname,dependency.relname,dependency.attname,dependency.parent_table);
 end loop;
end $$;

create function erp_private.validate_department() returns trigger
language plpgsql security definer set search_path='' as $$
declare branch public.branches%rowtype; parent public.departments%rowtype; is_cycle boolean;
begin
 if TG_OP='UPDATE' and new.department_code is distinct from old.department_code then raise exception 'Department code is immutable' using errcode='22023';end if;
 new.department_code:=btrim(new.department_code);new.department_name_en:=btrim(new.department_name_en);
 if coalesce(new.department_code,'')='' or coalesce(new.department_name_en,'')='' or length(new.department_code)>20 or length(new.department_name_en)>200 then raise exception 'Department code and name are required' using errcode='23514';end if;
 if new.effective_from is not null and new.effective_to is not null and new.effective_to<new.effective_from then raise exception 'Invalid effective interval' using errcode='23514';end if;
 if new.branch_id is not null then
  select * into branch from public.branches where id=new.branch_id for share;
  if branch.id is null or branch.owner_company_id<>new.owner_company_id then raise exception 'Branch does not belong to company' using errcode='23514';end if;
  if (TG_OP='INSERT' or new.branch_id is distinct from old.branch_id) and branch.status<>'active' then raise exception 'Choose an active branch' using errcode='23503';end if;
 end if;
 if new.parent_department_id is not null then
  -- One bounded hierarchy writer at a time; concurrent cycles cannot commit.
  perform pg_advisory_xact_lock(hashtextextended('f06-department-hierarchy',0));
  select * into parent from public.departments where id=new.parent_department_id for share;
  if parent.id is null or parent.owner_company_id<>new.owner_company_id or (parent.branch_id is not null and parent.branch_id is distinct from new.branch_id) then raise exception 'Invalid department hierarchy scope' using errcode='23514';end if;
  with recursive ancestors as (
   select d.id,d.parent_department_id from public.departments d where d.id=new.parent_department_id
   union select d.id,d.parent_department_id from public.departments d join ancestors a on d.id=a.parent_department_id
  ) select exists(select 1 from ancestors where id=new.id) into is_cycle;
  if is_cycle then raise exception 'Department hierarchy cannot contain a cycle' using errcode='23514';end if;
 end if;
 return new;
end $$;
revoke all on function erp_private.validate_department() from public,anon,authenticated;
create trigger f06_validate_department before insert or update on public.departments for each row execute function erp_private.validate_department();

create function erp_private.validate_work_calendar() returns trigger
language plpgsql security definer set search_path='' as $$
declare company public.owner_companies%rowtype;
begin
 if TG_OP='UPDATE' and new.calendar_code is distinct from old.calendar_code then raise exception 'Calendar code is immutable' using errcode='22023';end if;
 if TG_OP='UPDATE' and new.owner_company_id is distinct from old.owner_company_id then raise exception 'Established calendar ownership is immutable' using errcode='22023';end if;
 if new.owner_company_id is not null and (TG_OP='INSERT' or (new.is_active and not old.is_active)) then
  select * into company from public.owner_companies where id=new.owner_company_id for share;
  if company.id is null or company.status is distinct from 'active' then raise exception 'Choose an active company' using errcode='23503';end if;
 end if;
 new.calendar_code:=btrim(new.calendar_code);new.calendar_name:=btrim(new.calendar_name);
 if coalesce(new.calendar_code,'')='' or coalesce(new.calendar_name,'')='' or length(new.calendar_code)>20 or length(new.calendar_name)>200 then raise exception 'Calendar code and name are required' using errcode='23514';end if;
 if new.effective_from is not null and new.effective_to is not null and new.effective_to<new.effective_from then raise exception 'Invalid effective interval' using errcode='23514';end if;
 if new.working_days is null or new.weekend_days is null
  or exists(select 1 from unnest(new.working_days||new.weekend_days) d where d is null or d not in ('mon','tue','wed','thu','fri','sat','sun'))
  or cardinality(new.working_days)<>(select count(distinct d) from unnest(new.working_days) d)
  or cardinality(new.weekend_days)<>(select count(distinct d) from unnest(new.weekend_days) d)
  or new.working_days&&new.weekend_days then raise exception 'Invalid weekday selection' using errcode='23514';end if;
 return new;
end $$;
revoke all on function erp_private.validate_work_calendar() from public,anon,authenticated;
create trigger f06_validate_calendar before insert or update on public.work_calendars for each row execute function erp_private.validate_work_calendar();

create function erp_private.validate_work_shift() returns trigger
language plpgsql set search_path='' as $$
declare start_sec numeric;end_sec numeric;span_sec numeric;break_start_sec numeric;break_end_sec numeric;
begin
 if TG_OP='UPDATE' and new.shift_code is distinct from old.shift_code then raise exception 'Shift code is immutable' using errcode='22023';end if;
 if TG_OP='UPDATE' and new.calendar_id is distinct from old.calendar_id then raise exception 'Established shift ownership is immutable' using errcode='22023';end if;
 new.shift_code:=btrim(new.shift_code);new.shift_name:=btrim(new.shift_name);
 if coalesce(new.shift_code,'')='' or coalesce(new.shift_name,'')='' or length(new.shift_code)>20 or length(new.shift_name)>200 then raise exception 'Shift code and name are required' using errcode='23514';end if;
 start_sec:=extract(epoch from new.shift_start_time);end_sec:=extract(epoch from new.shift_end_time);span_sec:=mod(end_sec-start_sec+86400,86400);
 if start_sec is null or end_sec is null or start_sec>=86400 or end_sec>=86400 or span_sec<=0 or new.is_overnight is distinct from (end_sec<start_sec) then raise exception 'Invalid shift interval or overnight flag' using errcode='23514';end if;
 if new.total_hours is not null and (new.total_hours<=0 or new.total_hours>span_sec/3600) then raise exception 'Invalid shift hours' using errcode='23514';end if;
 if (new.break_start_time is null)<>(new.break_end_time is null)
  or (new.ramadan_start_time is null)<>(new.ramadan_end_time is null)
  or (new.summer_start_time is null)<>(new.summer_end_time is null) then raise exception 'Both interval endpoints are required' using errcode='23514';end if;
 if new.break_start_time is not null then
  break_start_sec:=mod(extract(epoch from new.break_start_time)-start_sec+86400,86400);
  break_end_sec:=mod(extract(epoch from new.break_end_time)-start_sec+86400,86400);
  if break_start_sec>=break_end_sec or break_end_sec>span_sec then raise exception 'Break must be inside shift' using errcode='23514';end if;
 end if;
 if new.ramadan_start_time=new.ramadan_end_time or new.summer_start_time=new.summer_end_time then raise exception 'Seasonal endpoints must differ' using errcode='23514';end if;
 if exists(select 1 from unnest(array[new.break_start_time,new.break_end_time,new.ramadan_start_time,new.ramadan_end_time,new.summer_start_time,new.summer_end_time]) t where extract(epoch from t)>=86400) then raise exception 'Time must be before 24:00' using errcode='23514';end if;
 return new;
end $$;
revoke all on function erp_private.validate_work_shift() from public,anon,authenticated;
create trigger f06_validate_shift before insert or update on public.work_shifts for each row execute function erp_private.validate_work_shift();
notify pgrst,'reload schema';
commit;
