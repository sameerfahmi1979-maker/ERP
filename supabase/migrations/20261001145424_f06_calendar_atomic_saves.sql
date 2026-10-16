begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- F06 uses F04's operation/revision contract. A narrow database mutation boundary
-- owns private receipts (including true no-ops), scope validation and the audit
-- transaction. It cannot address arbitrary tables or accept protected fields.
-- No service credential is exposed or used by the application.
create function public.save_master_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 allowed text[]; code_field text; old_row jsonb; candidate jsonb; saved jsonb;
 old_receipt erp_private.master_lifecycle_receipts%rowtype; result jsonb; h text;
 cols text; vals text; assigns text; payload jsonb; actor_id bigint;
 company_id bigint; old_company_id bigint; parent public.work_calendars%rowtype;
 changed boolean;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then
  raise exception 'Permission denied' using errcode='42501';
 end if;
 if p_entity is null or p_entity not in ('work_calendars','work_shifts') or p_operation is null
  or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>65536
  or (p_id is null and p_revision is not null) or (p_id is not null and (p_id<=0 or p_revision is null or p_revision<1)) then
  raise exception 'Invalid save contract' using errcode='22023';
 end if;
 if p_entity='work_calendars' then
  code_field:='calendar_code';
  allowed:=array['calendar_code','calendar_name','calendar_type','owner_company_id','working_days','weekend_days','has_ramadan_timing','has_summer_timing','effective_from','effective_to','is_active','notes'];
 else
  code_field:='shift_code';
  allowed:=array['shift_code','shift_name','calendar_id','shift_start_time','shift_end_time','break_start_time','break_end_time','total_hours','is_overnight','ramadan_start_time','ramadan_end_time','summer_start_time','summer_end_time','is_active'];
 end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where not k=any(allowed)) then
  raise exception 'Unsupported field' using errcode='22023';
 end if;
 -- Share the lifecycle operation namespace; an operation cannot be reused for
 -- save versus archive, even if the caller supplies identical identifiers.
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 h:=encode(sha256(convert_to(jsonb_build_array('save',p_entity,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 select * into old_receipt from erp_private.master_lifecycle_receipts where actor=auth.uid() and operation_id=p_operation;
 if found then
  if old_receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and deleted_at is null for share',p_entity)
   into saved using old_receipt.record_id;
  if saved is null then raise exception 'Record unavailable' using errcode='42501';end if;
  company_id:=(saved->>'owner_company_id')::bigint;
  if p_entity='work_shifts' then
   select * into parent from public.work_calendars where id=(saved->>'calendar_id')::bigint for share;
   company_id:=parent.owner_company_id;
  end if;
  if not erp_private.master_permission(p_entity,'manage',company_id,null) then raise exception 'Record unavailable' using errcode='42501';end if;
  return old_receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 and deleted_at is null for update',p_entity) into old_row using p_id;
  if old_row is null then raise exception 'Record unavailable' using errcode='42501';end if;
  old_company_id:=(old_row->>'owner_company_id')::bigint;
  if p_entity='work_shifts' then
   select * into parent from public.work_calendars where id=(old_row->>'calendar_id')::bigint for share;
   old_company_id:=parent.owner_company_id;
  end if;
  if not erp_private.master_permission(p_entity,'manage',old_company_id,null) then raise exception 'Record unavailable' using errcode='42501';end if;
  if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Record changed' using errcode='P0409';end if;
 end if;
 -- Convert supplied scalar values through the real row type before comparing,
 -- so an unchanged time '08:00' versus stored '08:00:00' remains a true no-op.
 execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',p_entity)
  into candidate using coalesce(old_row,'{}'::jsonb)||p_data;
 company_id:=(candidate->>'owner_company_id')::bigint;
 if p_entity='work_shifts' then
  select * into parent from public.work_calendars where id=(candidate->>'calendar_id')::bigint for share;
  if not found then raise exception 'Parent unavailable' using errcode='23503';end if;
  company_id:=parent.owner_company_id;
 end if;
 if not erp_private.master_permission(p_entity,'manage',company_id,null) then raise exception 'Record unavailable' using errcode='42501';end if;
 if old_row is not null and old_row->>code_field is distinct from candidate->>code_field then
  raise exception 'Identifier is immutable' using errcode='22023';
 end if;
 -- Moving an established calendar/shift would silently change the meaning of
 -- historical attendance and assignments. Create a new one instead.
 if old_row is not null and ((p_entity='work_calendars' and old_row->'owner_company_id' is distinct from candidate->'owner_company_id')
  or (p_entity='work_shifts' and old_row->'calendar_id' is distinct from candidate->'calendar_id')) then
  raise exception 'Established ownership is immutable' using errcode='22023';
 end if;
 changed:=old_row is null or exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);
 actor_id:=public.current_user_profile_id();
 if changed then
  payload:=p_data||jsonb_build_object('updated_by',actor_id);
  if p_id is null then payload:=payload||jsonb_build_object('created_by',actor_id);end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),string_agg(format('%I=r.%I',k,k),',' order by k)
   into cols,vals,assigns from jsonb_object_keys(payload) k;
  if p_id is null then
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I)',p_entity,cols,vals,p_entity,p_entity)
    into saved using payload;
  else
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t)',p_entity,assigns,p_entity)
    into saved using payload,p_id;
  end if;
  insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor_id,company_id,'common_md',p_entity,(saved->>'id')::bigint,saved->>code_field,case when p_id is null then 'create' else 'update' end,
    jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision'));
 else saved:=old_row;
 end if;
 result:=jsonb_build_object('id',saved->'id','revision',saved->>'workspace_revision','changed',changed,'replayed',false,
  'owner_company_id',company_id,'calendar_id',saved->'calendar_id');
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,p_entity,(saved->>'id')::bigint,result);
 return result;
end $$;
revoke all on function public.save_master_record(text,uuid,bigint,bigint,jsonb) from public,anon;
grant execute on function public.save_master_record(text,uuid,bigint,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
