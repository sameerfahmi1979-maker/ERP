begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- The Department mutation boundary owns no-op receipts, scope, revision and
-- audit atomically. Ordinary reads still use the existing F03 RLS/PERF path.
create function erp_private.save_department_record(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 allowed text[]:=array['department_code','department_name_en','department_name_ar','owner_company_id','branch_id','parent_department_id','cost_center_id','department_head_user_id','description','is_active','effective_from','effective_to'];
 old_row jsonb;candidate jsonb;saved jsonb;old_receipt erp_private.master_lifecycle_receipts%rowtype;
 h text;legacy jsonb;result jsonb;payload jsonb;cols text;vals text;assigns text;changed boolean;actor_id bigint;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 if p_operation is null or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>65536
  or (p_id is null and p_revision is not null) or (p_id is not null and (p_id<=0 or p_revision is null or p_revision<1))
  or exists(select 1 from jsonb_object_keys(p_data) k where not k=any(allowed)) then raise exception 'Invalid save contract' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 h:=encode(sha256(convert_to(jsonb_build_array('save','departments',p_id,p_revision,p_data)::text,'UTF8')),'hex');
 select * into old_receipt from erp_private.master_lifecycle_receipts where actor=auth.uid() and operation_id=p_operation;
 if found then
  if old_receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  select to_jsonb(d) into saved from public.departments d where id=old_receipt.record_id and deleted_at is null for share;
  if saved is null or not erp_private.master_permission('departments','manage',(saved->>'owner_company_id')::bigint,(saved->>'branch_id')::bigint) then raise exception 'Record unavailable' using errcode='42501';end if;
  return old_receipt.result||jsonb_build_object('replayed',true);
 end if;
 -- Preserve pending pre-F06 operations: retry must not create a second row.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 legacy:=erp_private.workspace_receipt_read(p_operation);
 if legacy is not null then
  if legacy->>'entity'<>'departments' or legacy->>'hash'<>encode(sha256(convert_to(jsonb_build_array('departments',p_id,p_revision,p_data)::text,'UTF8')),'hex') then raise exception 'Operation input changed' using errcode='22023';end if;
  select to_jsonb(d) into saved from public.departments d where id=(legacy->>'id')::bigint and deleted_at is null for share;
  if saved is null or not erp_private.master_permission('departments','manage',(saved->>'owner_company_id')::bigint,(saved->>'branch_id')::bigint) then raise exception 'Record unavailable' using errcode='42501';end if;
  return jsonb_build_object('id',saved->'id','revision',legacy->>'revision','changed',true,'replayed',true,'owner_company_id',saved->'owner_company_id','branch_id',saved->'branch_id');
 end if;
 if p_id is not null then
  select to_jsonb(d) into old_row from public.departments d where id=p_id and deleted_at is null for update;
  if old_row is null or not erp_private.master_permission('departments','manage',(old_row->>'owner_company_id')::bigint,(old_row->>'branch_id')::bigint) then raise exception 'Record unavailable' using errcode='42501';end if;
  if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Record changed' using errcode='P0409';end if;
 end if;
 candidate:=to_jsonb(jsonb_populate_record(null::public.departments,coalesce(old_row,'{}'::jsonb)||p_data));
 if not erp_private.master_permission('departments','manage',(candidate->>'owner_company_id')::bigint,(candidate->>'branch_id')::bigint) then raise exception 'Record unavailable' using errcode='42501';end if;
 if old_row is not null and (old_row->'department_code' is distinct from candidate->'department_code'
  or old_row->'owner_company_id' is distinct from candidate->'owner_company_id' or old_row->'branch_id' is distinct from candidate->'branch_id') then
  raise exception 'Established identity and ownership are immutable' using errcode='22023';
 end if;
 changed:=old_row is null or exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);
 actor_id:=public.current_user_profile_id();
 if changed then
  payload:=p_data||jsonb_build_object('updated_by',actor_id);
  if p_id is null then payload:=payload||jsonb_build_object('created_by',actor_id);end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),string_agg(format('%I=r.%I',k,k),',' order by k)
   into cols,vals,assigns from jsonb_object_keys(payload) k;
  perform set_config('erp.workspace_save','',true);
  if p_id is null then
   execute format('insert into public.departments (%s) select %s from jsonb_populate_record(null::public.departments,$1) r returning to_jsonb(departments)',cols,vals) into saved using payload;
  else
   execute format('update public.departments d set %s from jsonb_populate_record(null::public.departments,$1) r where d.id=$2 returning to_jsonb(d)',assigns) into saved using payload,p_id;
  end if;
  insert into public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor_id,(saved->>'owner_company_id')::bigint,(saved->>'branch_id')::bigint,'common_md','departments',(saved->>'id')::bigint,saved->>'department_code',case when p_id is null then 'create' else 'update' end,
    jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision'));
 else saved:=old_row;
 end if;
 result:=jsonb_build_object('id',saved->'id','revision',saved->>'workspace_revision','changed',changed,'replayed',false,'owner_company_id',saved->'owner_company_id','branch_id',saved->'branch_id');
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result) values(auth.uid(),p_operation,h,'departments',(saved->>'id')::bigint,result);
 return result;
end $$;
alter function erp_private.save_department_record(uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_department_record(uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function erp_private.save_department_record(uuid,bigint,bigint,jsonb) to authenticated;

create function public.save_department_record(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.save_department_record(p_operation,p_id,p_revision,p_data);
$$;
revoke all on function public.save_department_record(uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_department_record(uuid,bigint,bigint,jsonb) to authenticated;
-- Existing clients retain the old RPC signature, but cannot bypass the new
-- Department transaction by calling it or writing the table directly.
revoke insert,update,delete on public.departments from authenticated,anon;
create or replace function public.save_workspace_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 allowed text[]; code_field text; rule text; actor_id bigint; h text; receipt jsonb;
 payload jsonb; old_row jsonb; new_row jsonb; cols text; vals text; assigns text; ref text; projection text;
begin
 if p_entity='departments' then return erp_private.save_department_record(p_operation,p_id,p_revision,p_data);end if;
 if auth.uid() is null or not erp_private.business_principal_is_active() then
  raise exception 'Permission denied' using errcode='42501';
 end if;
 if p_operation is null or p_entity is null or jsonb_typeof(p_data) is distinct from 'object'
    or octet_length(p_data::text)>65536 or (p_id is not null and (p_id<=0 or p_revision is null or p_revision<1))
    or (p_id is null and p_revision is not null) then
  raise exception 'Invalid save contract' using errcode='22023';
 end if;
 case p_entity
 when 'departments' then
  allowed:=array['department_code','department_name_en','department_name_ar','owner_company_id','branch_id','parent_department_id','cost_center_id','department_head_user_id','description','is_active','effective_from','effective_to']; code_field:='department_code';
 when 'employees' then
  allowed:=array['full_name_en','full_name_ar','known_name','gender','nationality_id','date_of_birth','marital_status','mobile_number','personal_email','uae_address','home_country_address','blood_group','photo_dms_document_id','owner_company_id','branch_id','department_id','designation_id','employee_category_id','employment_type_id','joining_date','actual_joining_date','employee_status','reporting_manager_id','supervisor_id','primary_work_site_id','sponsor_company_id','mohre_establishment_id','probation_start_date','probation_end_date','contract_type','contract_start_date','contract_end_date','notice_period_days','inactive_date','inactive_reason','emergency_contact_name','emergency_contact_mobile','emergency_contact_relationship_type_id']; code_field:='employee_code'; rule:='HR_EMPLOYEE';
 when 'hr_candidates' then
  allowed:=array['requisition_id','full_name_en','full_name_ar','gender','nationality_id','date_of_birth','mobile_number','email','current_location','source','agency_name','referred_by_employee_id','current_employer','current_position','expected_salary','notice_period_days','candidate_status','pipeline_stage','rating','availability_date','notes']; code_field:='candidate_code'; rule:='HR_CANDIDATE';
 else raise exception 'Unsupported entity' using errcode='22023';
 end case;
 projection:=format('jsonb_build_object(''id'',t.id,''workspace_revision'',t.workspace_revision,%L,t.%I)',code_field,code_field);
 if p_entity in ('departments','employees') then
  projection:=projection||' || jsonb_build_object(''owner_company_id'',t.owner_company_id,''branch_id'',t.branch_id)';
 end if;
 if p_entity='employees' then
  projection:=projection||' || jsonb_build_object(''employee_status'',t.employee_status,''joining_date'',t.joining_date,''inactive_reason'',t.inactive_reason,''inactive_date'',t.inactive_date)';
 end if;
 if p_data='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_data) k where not k=any(allowed)) then
  raise exception 'Unsupported field' using errcode='22023';
 end if;
 actor_id:=public.current_user_profile_id();
 h:=encode(sha256(convert_to(jsonb_build_array(p_entity,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 -- Same actor/operation serialized, including concurrent initial submissions. Lock ends with transaction.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.workspace_receipt_read(p_operation);
 if receipt is not null then
  if receipt->>'hash'<>h or receipt->>'entity'<>p_entity then
   raise exception 'Operation already used for different input' using errcode='22023';
  end if;
  -- Recheck current row visibility before returning even a minimal old receipt.
  execute format('select %s from public.%I t where id=$1 and deleted_at is null',projection,p_entity)
   into new_row using (receipt->>'id')::bigint;
  if new_row is null then raise exception 'Record unavailable' using errcode='42501'; end if;
  return jsonb_build_object('id',receipt->'id','revision',receipt->>'revision',code_field,new_row->>code_field,'replayed',true);
 end if;
 if p_id is not null then
  execute format('select %s from public.%I t where id=$1 and deleted_at is null for update',projection,p_entity) into old_row using p_id;
  if old_row is null then raise exception 'Record unavailable' using errcode='42501'; end if;
  if (old_row->>'workspace_revision')::bigint<>p_revision then
   raise exception 'Record changed since it was opened. Reopen it before saving; your draft has been retained.' using errcode='P0409';
  end if;
 end if;
 payload:=p_data||jsonb_build_object('updated_by',actor_id);
 if p_id is null then
  payload:=payload||jsonb_build_object('created_by',actor_id);
  if rule is not null then
   select generated_reference_number into strict ref from public.generate_next_reference_number(rule,null,p_entity,null,'Workspace create',actor_id);
   payload:=payload||jsonb_build_object(code_field,ref);
  end if;
 end if;
 perform set_config('erp.workspace_save',jsonb_build_object('operation_id',p_operation,'entity',p_entity,'hash',h)::text,true);
 select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),
  string_agg(format('%I=r.%I',k,k),',' order by k) into cols,vals,assigns from jsonb_object_keys(payload) k;
 if p_id is null then
  -- Existing readable_employee_ids() uses a STABLE snapshot. Read only after
  -- the insert statement completes, so its new row can be authorized normally.
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r',p_entity,cols,vals,p_entity) using payload;
  receipt:=erp_private.workspace_receipt_read(p_operation);
  execute format('select %s from public.%I t where id=$1 and deleted_at is null',projection,p_entity) into new_row using (receipt->>'id')::bigint;
 else
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 and t.deleted_at is null and t.workspace_revision=$3 returning %s',p_entity,assigns,p_entity,projection) into new_row using payload,p_id,p_revision;
 end if;
 perform set_config('erp.workspace_save','',true);
 if new_row is null then raise exception 'Record unavailable or no update permitted' using errcode='42501'; end if;
 if p_entity='employees' and (p_id is null or old_row->>'employee_status' is distinct from new_row->>'employee_status') then
  insert into public.employee_status_events(employee_id,old_status,new_status,reason,effective_date,created_by)
  values((new_row->>'id')::bigint,old_row->>'employee_status',new_row->>'employee_status',
   case when p_id is null then 'Employee created' else coalesce(new_row->>'inactive_reason','Status updated') end,
   (case when p_id is null then new_row->>'joining_date' else new_row->>'inactive_date' end)::date,actor_id);
 end if;
 -- An audit failure rolls back the business row, receipt and numbering together. No PII payload in log.
 insert into public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(actor_id,(new_row->>'owner_company_id')::bigint,(new_row->>'branch_id')::bigint,
  case when p_entity='departments' then 'common_master_data' else 'HR' end,p_entity,(new_row->>'id')::bigint,
  new_row->>code_field,case when p_id is null then 'create' else 'update' end,
  jsonb_build_object('operation_id',p_operation,'revision',new_row->>'workspace_revision'));
 return jsonb_build_object('id',new_row->'id','revision',new_row->>'workspace_revision',code_field,new_row->>code_field,'replayed',false);
end $$;

notify pgrst,'reload schema';
commit;
