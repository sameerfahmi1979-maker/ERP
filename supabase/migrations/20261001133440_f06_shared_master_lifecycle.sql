begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Company-owned masters use assignment-bound capabilities. NULL company means
-- genuinely shared configuration, requiring a global capability, not any scope.
create function erp_private.master_permission(entity text, capability text, company_id bigint, branch_id bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select erp_private.business_principal_is_active()
 and $1 in ('departments','work_calendars','work_shifts') and $2 in ('view','manage')
 and (erp_private.permission_in_scope('common_md.'||$2,$3,$4)
   or erp_private.permission_in_scope('common_md.'||case when $1='departments' then 'departments' else 'work_calendars' end||'.'||$2,$3,$4));
$$;
revoke all on function erp_private.master_permission(text,text,bigint,bigint) from public,anon;
grant execute on function erp_private.master_permission(text,text,bigint,bigint) to authenticated;

create function erp_private.shift_permission(calendar bigint, capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.work_calendars c where c.id=$1 and
  erp_private.master_permission('work_shifts',$2,c.owner_company_id,null));
$$;
revoke all on function erp_private.shift_permission(bigint,text) from public,anon;
grant execute on function erp_private.shift_permission(bigint,text) to authenticated;

alter policy departments_select on public.departments to authenticated
 using(deleted_at is null and erp_private.master_permission('departments','view',owner_company_id,branch_id));
alter policy departments_insert on public.departments to authenticated
 with check(deleted_at is null and erp_private.master_permission('departments','manage',owner_company_id,branch_id));
alter policy departments_update on public.departments to authenticated
 using(deleted_at is null and erp_private.master_permission('departments','manage',owner_company_id,branch_id))
 with check(deleted_at is null and erp_private.master_permission('departments','manage',owner_company_id,branch_id));
alter policy work_calendars_select on public.work_calendars to authenticated
 using(deleted_at is null and erp_private.master_permission('work_calendars','view',owner_company_id,null));
alter policy work_calendars_insert on public.work_calendars to authenticated
 with check(deleted_at is null and erp_private.master_permission('work_calendars','manage',owner_company_id,null));
alter policy work_calendars_update on public.work_calendars to authenticated
 using(deleted_at is null and erp_private.master_permission('work_calendars','manage',owner_company_id,null))
 with check(deleted_at is null and erp_private.master_permission('work_calendars','manage',owner_company_id,null));
alter policy work_shifts_select on public.work_shifts to authenticated
 using(deleted_at is null and erp_private.shift_permission(calendar_id,'view'));
alter policy work_shifts_insert on public.work_shifts to authenticated
 with check(deleted_at is null and erp_private.shift_permission(calendar_id,'manage'));
alter policy work_shifts_update on public.work_shifts to authenticated
 using(deleted_at is null and erp_private.shift_permission(calendar_id,'manage'))
 with check(deleted_at is null and erp_private.shift_permission(calendar_id,'manage'));
-- Only auditable retirement is supported. Existing historical rows stay intact.
revoke delete on public.departments,public.work_calendars,public.work_shifts from authenticated;

alter table public.work_calendars add column workspace_revision bigint not null default 1;
alter table public.work_shifts add column workspace_revision bigint not null default 1;
create trigger f06_revision before insert or update on public.work_calendars
 for each row execute function erp_private.workspace_revision();
create trigger f06_revision before insert or update on public.work_shifts
 for each row execute function erp_private.workspace_revision();

create table erp_private.master_lifecycle_receipts (
 actor uuid not null, operation_id uuid not null, request_hash text not null,
 entity text not null check(entity in ('departments','work_calendars','work_shifts')),
 record_id bigint not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(actor,operation_id)
);
alter table erp_private.master_lifecycle_receipts enable row level security;
revoke all on erp_private.master_lifecycle_receipts from public,anon,authenticated;

-- Narrow SECURITY DEFINER boundary: active-only SELECT policies intentionally
-- prevent exposing archived rows. No service-client fallback or global RLS bypass
-- is added to the application. The RPC reauthorizes the actual stored scope.
create function public.set_master_record_archived(p_entity text,p_id bigint,p_archived boolean,p_revision bigint,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target jsonb; company_id bigint; branch_id bigint; old_receipt erp_private.master_lifecycle_receipts%rowtype;
 h text; result jsonb; code text; changed boolean; dependency record; used boolean; predicate text; parent public.work_calendars%rowtype;
begin
 if not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_entity is null or p_entity not in ('departments','work_calendars','work_shifts')
  or p_id is null or p_id<=0 or p_archived is null or p_revision is null or p_revision<1 or p_operation is null then
  raise exception 'Invalid lifecycle contract' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into target using p_id;
 if target is null then raise exception 'Record unavailable' using errcode='42501'; end if;
 company_id:=(target->>'owner_company_id')::bigint;branch_id:=(target->>'branch_id')::bigint;
 if p_entity='work_shifts' then
  select * into parent from public.work_calendars where id=(target->>'calendar_id')::bigint for share;
  company_id:=parent.owner_company_id;
 end if;
 if not erp_private.master_permission(p_entity,'manage',company_id,branch_id) then
  raise exception 'Record unavailable' using errcode='42501';
 end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_entity,p_id,p_archived,p_revision)::text,'UTF8')),'hex');
 select * into old_receipt from erp_private.master_lifecycle_receipts where actor=auth.uid() and operation_id=p_operation;
 if found then
  if old_receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  return old_receipt.result||jsonb_build_object('replayed',true);
 end if;
 if (target->>'workspace_revision')::bigint<>p_revision then raise exception 'Record changed' using errcode='P0409';end if;
 changed:=(target->>'deleted_at' is not null) is distinct from p_archived;
 if changed and p_archived then
  -- Conservative retirement: a referenced, non-deleted record is retained until
  -- its dependency is explicitly resolved. No cascading archive or history erase.
  for dependency in
   select ns.nspname,cl.relname,a.attname,exists(select 1 from pg_attribute x where x.attrelid=cl.oid and x.attname='deleted_at' and not x.attisdropped) as soft_deletable
   from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.confrelid=to_regclass('public.'||p_entity) and array_length(c.conkey,1)=1
   order by c.conrelid,c.oid
  loop
   predicate:=case when dependency.soft_deletable then ' and deleted_at is null' else '' end;
   execute format('select exists(select 1 from %I.%I where %I=$1%s)',dependency.nspname,dependency.relname,dependency.attname,predicate) into used using p_id;
   if used then raise exception 'Referenced record cannot be archived' using errcode='23503';end if;
  end loop;
 end if;
 if changed and not p_archived and p_entity='work_shifts' and (parent.deleted_at is not null or not parent.is_active) then
  raise exception 'Restore the parent calendar first' using errcode='23503';
 end if;
 if changed then
  execute format('update public.%I set deleted_at=$1,is_active=false,updated_by=$2,updated_at=clock_timestamp() where id=$3 returning to_jsonb(%I)',p_entity,p_entity)
   into target using case when p_archived then clock_timestamp() else null::timestamptz end,public.current_user_profile_id(),p_id;
  code:=target->>case p_entity when 'departments' then 'department_code' when 'work_calendars' then 'calendar_code' else 'shift_code' end;
  insert into public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(public.current_user_profile_id(),company_id,branch_id,'common_md',p_entity,p_id,code,'update',
    jsonb_build_object('operation_id',p_operation,'lifecycle',case when p_archived then 'archive' else 'restore_inactive' end,'revision',target->>'workspace_revision'));
 end if;
 result:=jsonb_build_object('id',p_id,'revision',target->>'workspace_revision','archived',p_archived,'changed',changed,'replayed',false,'owner_company_id',company_id,'calendar_id',target->'calendar_id');
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,p_entity,p_id,result);
 return result;
end $$;
revoke all on function public.set_master_record_archived(text,bigint,boolean,bigint,uuid) from public,anon;
grant execute on function public.set_master_record_archived(text,bigint,boolean,bigint,uuid) to authenticated;

-- HR configuration is shared, unlike employee rows. Global admins are legitimate
-- maintainers even without explicit permission links. Scoped grants never imply
-- permission to change a shared global catalogue.
create or replace function public.current_user_can_manage_hr_settings()
returns boolean language sql stable security definer set search_path='' as $$
 select erp_private.business_principal_is_active() and
  (public.current_user_has_permission('hr.settings.manage') or public.current_user_has_permission('hr.admin'));
$$;
create or replace function public.current_user_can_view_hr_settings()
returns boolean language sql stable security definer set search_path='' as $$
 select erp_private.business_principal_is_active() and (public.current_user_is_global_admin() or exists(
  select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  join public.role_permissions rp on rp.role_id=r.id join public.permissions p on p.id=rp.permission_id
  where ur.user_profile_id=public.current_user_profile_id() and ur.is_active and r.is_active and p.is_active
   and p.permission_code in ('hr.settings.view','hr.settings.manage','hr.admin','hr.employees.view','hr.employees.create','hr.employees.update',
    'hr.compliance.view','hr.payroll.view','hr.leave.view','hr.attendance.view','hr.recruitment.view','hr.dashboard.view',
    'hr.medical.view','hr.assignments.view','hr.actions.view','hr.eos.view','hr.search.use')));
$$;
revoke all on function public.current_user_can_manage_hr_settings(),public.current_user_can_view_hr_settings() from public,anon;
grant execute on function public.current_user_can_manage_hr_settings(),public.current_user_can_view_hr_settings() to authenticated;
notify pgrst,'reload schema';
commit;
