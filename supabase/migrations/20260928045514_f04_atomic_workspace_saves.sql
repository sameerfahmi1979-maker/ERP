-- F04: pilot saves remain SECURITY INVOKER: existing F03 RLS and field triggers apply.
-- Private receipts contain identifiers/digests only, never form values or credentials.
create table erp_private.workspace_save_receipts (
 actor uuid not null, operation_id uuid not null, request_hash text not null,
 entity text not null check (entity in ('departments','employees','hr_candidates')),
 record_id bigint not null, revision bigint not null, created_at timestamptz not null default now(),
 primary key(actor, operation_id)
);
alter table erp_private.workspace_save_receipts enable row level security;
revoke all on erp_private.workspace_save_receipts from public, anon, authenticated;

alter table public.departments add column workspace_revision bigint not null default 1;
alter table public.employees add column workspace_revision bigint not null default 1;
alter table public.hr_candidates add column workspace_revision bigint not null default 1;
-- Employee reads deliberately use column grants (medical fields stay separately protected).
grant select(workspace_revision) on public.employees to authenticated;
grant select(workspace_revision) on public.hr_candidates to authenticated;

create function erp_private.workspace_revision() returns trigger language plpgsql
set search_path = '' as $$
begin
 new.workspace_revision := case when TG_OP='INSERT' then 1 else old.workspace_revision+1 end;
 return new;
end $$;
revoke all on function erp_private.workspace_revision() from public, anon, authenticated;

-- Only a real, authorized row mutation can mint a receipt. No callable receipt writer.
create function erp_private.workspace_receipt() returns trigger language plpgsql security definer
set search_path = '' as $$
declare c jsonb;
begin
 c := nullif(current_setting('erp.workspace_save',true),'')::jsonb;
 if c is not null and auth.uid() is not null and c->>'entity'=TG_TABLE_NAME then
  insert into erp_private.workspace_save_receipts(actor,operation_id,request_hash,entity,record_id,revision)
  values(auth.uid(),(c->>'operation_id')::uuid,c->>'hash',TG_TABLE_NAME,new.id,new.workspace_revision);
 end if;
 return new;
end $$;
revoke all on function erp_private.workspace_receipt() from public, anon, authenticated;

create function erp_private.workspace_receipt_read(p_operation uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('hash',request_hash,'entity',entity,'id',record_id,'revision',revision::text)
 from erp_private.workspace_save_receipts
 where actor=(select auth.uid()) and operation_id=p_operation
 and (select erp_private.business_principal_is_active())
$$;
revoke all on function erp_private.workspace_receipt_read(uuid) from public, anon;
grant execute on function erp_private.workspace_receipt_read(uuid) to authenticated;

do $$ declare t text; begin
 foreach t in array array['departments','employees','hr_candidates'] loop
  execute format('create trigger f04_revision before insert or update on public.%I for each row execute function erp_private.workspace_revision()',t);
  execute format('create trigger f04_receipt after insert or update on public.%I for each row execute function erp_private.workspace_receipt()',t);
 end loop;
end $$;

create function public.save_workspace_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 allowed text[]; code_field text; rule text; actor_id bigint; h text; receipt jsonb;
 payload jsonb; old_row jsonb; new_row jsonb; cols text; vals text; assigns text; ref text; projection text;
begin
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
revoke all on function public.save_workspace_record(text,uuid,bigint,bigint,jsonb) from public, anon;
grant execute on function public.save_workspace_record(text,uuid,bigint,bigint,jsonb) to authenticated;
notify pgrst, 'reload schema';
