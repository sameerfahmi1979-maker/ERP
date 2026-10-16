begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- These two consumers retain F03 caller RLS, salary field protection and the
-- independent numbering capability. No policy or numbering implementation changes.
create table erp_private.recruitment_consumer_receipts (
 actor uuid not null,operation_id uuid not null,kind text not null check(kind in ('requisition','conversion')),
 request_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor,operation_id)
);
alter table erp_private.recruitment_consumer_receipts enable row level security;
revoke all on erp_private.recruitment_consumer_receipts from public,anon,authenticated,service_role;
-- Transient INSERT/completion evidence. Caller-set GUC JSON is never proof.
-- Only target/fact row triggers write these rows; completion consumes them.
create table erp_private.recruitment_consumer_proofs(
 actor uuid not null,operation_id uuid not null,actor_id bigint not null,kind text not null,
 transaction_id xid8 not null,request_hash text not null,input_json jsonb not null,
 target_id bigint not null,reference_id bigint not null,target_hash text not null,source_json jsonb not null,
 primary key(actor,operation_id)
);
create table erp_private.recruitment_consumer_facts(
 actor uuid not null,operation_id uuid not null,table_name text not null,record_id bigint not null,row_hash text not null,
 primary key(actor,operation_id,table_name,record_id),
 foreign key(actor,operation_id) references erp_private.recruitment_consumer_proofs(actor,operation_id) on delete cascade
);
alter table erp_private.recruitment_consumer_proofs enable row level security;
alter table erp_private.recruitment_consumer_facts enable row level security;
revoke all on erp_private.recruitment_consumer_proofs,erp_private.recruitment_consumer_facts from public,anon,authenticated,service_role;

create function erp_private.prove_recruitment_target_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_data jsonb;v_kind text;v_hash text;v_actor bigint;v_rule text;v_table text;v_reason text;v_number bigint;
 v_candidate public.hr_candidates;v_offer public.hr_offers;v_source jsonb:='{}';v_expected jsonb;v_tasks bigint[];
begin
 v_context:=nullif(current_setting('erp.recruitment_consumer',true),'')::jsonb;v_kind:=v_context->>'kind';
 if v_context is null or not ((tg_table_name='hr_job_requisitions' and v_kind='requisition') or (tg_table_name='employees' and v_kind='conversion')) then return new;end if;
 v_actor:=public.current_user_profile_id();v_data:=v_context->'payload';
 perform erp_private.validate_recruitment_consumer_input(v_kind,v_data);
 if auth.uid() is null or v_actor is null or not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or new.created_by is distinct from v_actor or new.updated_by is distinct from v_actor then raise exception 'Invalid recruitment INSERT actor' using errcode='42501';end if;
 perform erp_private.lock_recruitment_scope((v_data->>'owner_company_id')::bigint,(v_data->>'branch_id')::bigint);
 if v_kind='requisition' then
  v_hash:=encode(sha256(convert_to(jsonb_build_array('requisition',v_data)::text,'UTF8')),'hex');v_rule:='HR_JOB_REQUISITION';v_table:='hr_job_requisitions';v_reason:='F06 requisition '||v_hash;
  -- Every request-owned business field participates, including omitted nullable
  -- fields. Containment of only supplied keys would bless extra INSERT values.
  -- System identity/history/default fields remain outside this request projection.
  v_expected:=jsonb_build_object('owner_company_id',null,'branch_id',null,'department_id',null,'designation_id',null,'work_site_id',null,
   'requested_by',null,'hiring_manager_id',null,'employment_type_id',null,'employee_category_id',null,'target_start_date',null,
   'budgeted_salary_min',null,'budgeted_salary_max',null,'job_description',null,'requirements',null,'notes',null,
   'vacancies_count',1,'requisition_status','draft','priority','normal')||v_data||jsonb_build_object('requisition_title',btrim(v_data->>'requisition_title'),'created_by',v_actor,'updated_by',v_actor);
  if not to_jsonb(new) @> v_expected or ((v_data->>'budgeted_salary_min' is not null or v_data->>'budgeted_salary_max' is not null) and not
   (erp_private.permission_in_scope('hr.payroll.view',new.owner_company_id,new.branch_id) and erp_private.permission_in_scope('hr.payroll.manage',new.owner_company_id,new.branch_id))) then raise exception 'Requisition does not match authorized payload' using errcode='42501';end if;
 else
  v_hash:=encode(sha256(convert_to(jsonb_build_array('conversion',(v_context->>'candidate_id')::bigint,(v_context->>'revision')::bigint,v_data)::text,'UTF8')),'hex');v_rule:='HR_EMPLOYEE';v_table:='employees';v_reason:='F06 candidate conversion '||v_hash;
  if not erp_private.permission_in_scope('hr.employees.create',new.owner_company_id,new.branch_id) or not erp_private.candidate_permission((v_context->>'candidate_id')::bigint,'hr.recruitment.manage') then raise exception 'Conversion source unavailable' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('f06-recruitment-conversion',0));
  select c.* into v_candidate from public.hr_candidates c where c.id=(v_context->>'candidate_id')::bigint and c.deleted_at is null for update;
  if not found or v_candidate.workspace_revision is distinct from (v_context->>'revision')::bigint then raise exception 'Candidate changed since review' using errcode='P0409';end if;
  perform 1 from public.hr_job_requisitions r where r.id in(v_candidate.requisition_id,(v_data->>'requisition_id')::bigint) order by r.id for share;
  if not erp_private.requisition_permission(v_candidate.requisition_id,'hr.recruitment.manage') or (v_data->>'requisition_id' is not null and not erp_private.requisition_permission((v_data->>'requisition_id')::bigint,'hr.recruitment.manage')) then raise exception 'Requisition unavailable' using errcode='42501';end if;
  if v_data->>'offer_id' is not null then
   select o.* into v_offer from public.hr_offers o where o.id=(v_data->>'offer_id')::bigint and o.deleted_at is null for share;
   if not found or v_offer.candidate_id is distinct from v_candidate.id or v_offer.requisition_id is distinct from (v_data->>'requisition_id')::bigint
    or not erp_private.recruitment_scope(v_offer.owner_company_id,v_offer.branch_id,'hr.recruitment.manage') then raise exception 'Offer unavailable or unrelated' using errcode='42501';end if;
  elsif (v_data->>'requisition_id')::bigint is distinct from v_candidate.requisition_id then raise exception 'Requisition does not match reviewed candidate' using errcode='22023';end if;
  v_tasks:=erp_private.lock_conversion_children(v_candidate.id,null);
  v_source:=jsonb_build_object('candidate_id',v_candidate.id,'candidate_code',v_candidate.candidate_code,'revision',v_candidate.workspace_revision,
   'source_requisition',v_candidate.requisition_id,'tasks',to_jsonb(v_tasks));
  v_expected:=jsonb_build_object('full_name_en',v_candidate.full_name_en,'full_name_ar',v_candidate.full_name_ar,'gender',coalesce(v_candidate.gender,'male'),
   'nationality_id',v_candidate.nationality_id,'date_of_birth',coalesce(v_candidate.date_of_birth,(v_data->>'joining_date')::date),'mobile_number',coalesce(v_candidate.mobile_number,''),'personal_email',v_candidate.email,
   'owner_company_id',(v_data->>'owner_company_id')::bigint,'branch_id',(v_data->>'branch_id')::bigint,'department_id',(v_data->>'department_id')::bigint,'designation_id',(v_data->>'designation_id')::bigint,
   'employment_type_id',(v_data->>'employment_type_id')::bigint,'employee_category_id',(v_data->>'employee_category_id')::bigint,'joining_date',(v_data->>'joining_date')::date,
   'employee_status',coalesce(v_data->>'employee_status','active'),'reporting_manager_id',(v_data->>'reporting_manager_id')::bigint,'primary_work_site_id',(v_data->>'primary_work_site_id')::bigint,
   'emergency_contact_name',btrim(v_data->>'emergency_contact_name'),'emergency_contact_mobile',btrim(v_data->>'emergency_contact_mobile'),'created_by',v_actor,'updated_by',v_actor);
  if not to_jsonb(new) @> v_expected then raise exception 'Employee does not match reviewed conversion' using errcode='42501';end if;
 end if;
 if v_context->>'hash' is distinct from v_hash then raise exception 'Recruitment context hash mismatch' using errcode='42501';end if;
 select g.id into v_number from erp_private.numbering_requests r join public.global_numbering_generated_references g on g.id=r.reference_id
 where r.actor_id=v_actor and r.operation_id=(v_context->>'operation_id')::uuid
  and r.request_hash=md5(jsonb_build_array(null::bigint,v_rule,null::text,'reserved'::text,v_table,null::bigint,v_reason)::text)
  and g.generated_by=v_actor and g.generation_status='reserved' and g.target_table_name=v_table and g.target_record_id is null and g.generation_reason=v_reason
  and g.generated_reference_number=case when v_kind='requisition' then to_jsonb(new)->>'requisition_code' else to_jsonb(new)->>'employee_code' end;
 if not found or v_number is distinct from (v_context->>'reference_id')::bigint then raise exception 'Recruitment INSERT requires its matching reserved number' using errcode='42501';end if;
 insert into erp_private.recruitment_consumer_proofs values(auth.uid(),(v_context->>'operation_id')::uuid,v_actor,v_kind,pg_current_xact_id(),v_hash,v_data,new.id,v_number,encode(sha256(convert_to(to_jsonb(new)::text,'UTF8')),'hex'),v_source);
 return new;
end $$;
revoke all on function erp_private.prove_recruitment_target_insert() from public,anon,authenticated,service_role;
create trigger f06_00_recruitment_insert_proof after insert on public.hr_job_requisitions for each row execute function erp_private.prove_recruitment_target_insert();
create trigger f06_00_recruitment_insert_proof after insert on public.employees for each row execute function erp_private.prove_recruitment_target_insert();
create function erp_private.recruitment_consumer_receipt(p_operation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_receipt erp_private.recruitment_consumer_receipts;v_actor bigint;v_target bigint;v_code text;v_table text;v_rule text;v_reason text;v_link public.employee_recruitment_links;
begin
 select r.* into v_receipt from erp_private.recruitment_consumer_receipts r where r.actor=auth.uid() and r.operation_id=p_operation and erp_private.business_principal_is_active();
 if not found then return null;end if;v_actor:=public.current_user_profile_id();
 if not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Receipt authority unavailable' using errcode='42501';end if;
 if v_receipt.kind='requisition' then
  v_target:=(v_receipt.result->>'id')::bigint;v_code:=v_receipt.result->>'requisition_code';v_table:='hr_job_requisitions';v_rule:='HR_JOB_REQUISITION';v_reason:='F06 requisition '||v_receipt.request_hash;
  if not erp_private.requisition_permission(v_target,'hr.recruitment.manage') or not exists(select 1 from public.hr_job_requisitions r where r.id=v_target and r.deleted_at is null and r.requisition_code=v_code) then raise exception 'Receipt authority unavailable' using errcode='42501';end if;
 else
  v_target:=(v_receipt.result->>'employee_id')::bigint;v_code:=v_receipt.result->>'employee_code';v_table:='employees';v_rule:='HR_EMPLOYEE';v_reason:='F06 candidate conversion '||v_receipt.request_hash;
  select l.* into v_link from public.employee_recruitment_links l where l.id=(v_receipt.result->>'link_id')::bigint and l.employee_id=v_target and l.candidate_id=(v_receipt.result->>'candidate_id')::bigint;
  if not found or not erp_private.candidate_permission(v_link.candidate_id,'hr.recruitment.manage') or (v_link.requisition_id is not null and not erp_private.requisition_permission(v_link.requisition_id,'hr.recruitment.manage'))
   or not public.current_user_can_view_employee(v_target) or not public.current_user_can_manage_employee(v_target) or not erp_private.employee_permission(v_target,'hr.recruitment.manage') or not erp_private.employee_permission(v_target,'hr.recruitment.view')
   or not exists(select 1 from public.employees e where e.id=v_target and e.deleted_at is null and e.employee_code=v_code and erp_private.permission_in_scope('hr.employees.create',e.owner_company_id,e.branch_id) and erp_private.recruitment_scope(e.owner_company_id,e.branch_id,'hr.recruitment.manage')) then raise exception 'Receipt authority unavailable' using errcode='42501';end if;
  if v_link.offer_id is not null and not exists(select 1 from public.hr_offers o where o.id=v_link.offer_id and o.deleted_at is null and o.candidate_id=v_link.candidate_id and o.requisition_id is not distinct from v_link.requisition_id and erp_private.recruitment_scope(o.owner_company_id,o.branch_id,'hr.recruitment.manage')) then raise exception 'Receipt source unavailable' using errcode='42501';end if;
 end if;
 if not exists(select 1 from erp_private.numbering_requests r join public.global_numbering_generated_references g on g.id=r.reference_id
  where r.actor_id=v_actor and r.operation_id=p_operation and r.reference_id=(v_receipt.result->>'reference_id')::bigint
   and r.request_hash=md5(jsonb_build_array(null::bigint,v_rule,null::text,'reserved'::text,v_table,null::bigint,v_reason)::text)
   and g.generated_by=v_actor and g.target_table_name=v_table and g.generated_reference_number=v_code and g.generation_reason=v_reason
   and ((g.generation_status='consumed' and g.target_record_id=v_target) or (g.generation_status='reserved' and g.target_record_id is null and exists(select 1 from erp_private.recruitment_consumer_proofs p where p.actor=auth.uid() and p.operation_id=p_operation and p.transaction_id=pg_current_xact_id() and p.target_id=v_target and p.reference_id=g.id)))) then raise exception 'Receipt allocation facts unavailable' using errcode='42501';end if;
 return jsonb_build_object('kind',v_receipt.kind,'hash',v_receipt.request_hash,'result',v_receipt.result);
end;
$$;
revoke all on function erp_private.recruitment_consumer_receipt(uuid) from public,anon,service_role;
grant execute on function erp_private.recruitment_consumer_receipt(uuid) to authenticated;

-- Receipt creation is a row trigger, not a callable receipt-writing API. The
-- invoker must first pass the existing target INSERT policy. Only IDs/digests
-- and immutable committed codes/revisions are retained, never salary or PII.
create function erp_private.capture_recruitment_consumer_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
declare context jsonb;result jsonb;employee public.employees;candidate_revision bigint;v_proof erp_private.recruitment_consumer_proofs;
begin
 context:=nullif(current_setting('erp.recruitment_consumer',true),'')::jsonb;
 if context is null or auth.uid() is null then return new;end if;
 select p.* into v_proof from erp_private.recruitment_consumer_proofs p where p.actor=auth.uid() and p.operation_id=(context->>'operation_id')::uuid and p.transaction_id=pg_current_xact_id();
 if not found or v_proof.kind is distinct from context->>'kind' or v_proof.request_hash is distinct from context->>'hash'
  or v_proof.reference_id is distinct from (context->>'reference_id')::bigint then raise exception 'Receipt requires current authoritative INSERT proof' using errcode='42501';end if;
 if context->>'kind'='requisition' and TG_TABLE_NAME='hr_job_requisitions' then
  if new.id<>v_proof.target_id then raise exception 'Requisition receipt target mismatch' using errcode='42501';end if;
  result:=jsonb_build_object('id',new.id,'requisition_code',new.requisition_code);
 elsif context->>'kind'='conversion' and TG_TABLE_NAME='employee_recruitment_links' then
  if new.employee_id is distinct from v_proof.target_id or new.candidate_id is distinct from (v_proof.source_json->>'candidate_id')::bigint
   or new.requisition_id is distinct from (v_proof.input_json->>'requisition_id')::bigint or new.offer_id is distinct from (v_proof.input_json->>'offer_id')::bigint
   or new.converted_by is distinct from v_proof.actor_id or new.created_by is distinct from v_proof.actor_id or new.conversion_notes is distinct from v_proof.input_json->>'conversion_notes' then
   raise exception 'Conversion link does not match actual employee INSERT' using errcode='42501';end if;
  select e.id,e.employee_code,e.workspace_revision into employee.id,employee.employee_code,employee.workspace_revision from public.employees e where e.id=new.employee_id;
  select c.workspace_revision into candidate_revision from public.hr_candidates c where c.id=new.candidate_id;
  result:=jsonb_build_object('employee_id',new.employee_id,'employee_code',employee.employee_code,'employee_revision',employee.workspace_revision::text,
   'candidate_id',new.candidate_id,'candidate_revision',candidate_revision::text,'link_id',new.id);
 else return new;end if;
 result:=result||jsonb_build_object('operation_id',context->>'operation_id','reference_id',(context->>'reference_id')::bigint,'replayed',false);
 insert into erp_private.recruitment_consumer_receipts(actor,operation_id,kind,request_hash,result)
 values(auth.uid(),(context->>'operation_id')::uuid,context->>'kind',context->>'hash',result);
 return new;
end $$;
revoke all on function erp_private.capture_recruitment_consumer_receipt() from public,anon,authenticated,service_role;
create trigger f06_requisition_consumer_receipt after insert on public.hr_job_requisitions for each row execute function erp_private.capture_recruitment_consumer_receipt();
create trigger f06_conversion_consumer_receipt after insert on public.employee_recruitment_links for each row execute function erp_private.capture_recruitment_consumer_receipt();

create function erp_private.prove_recruitment_fact() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_proof erp_private.recruitment_consumer_proofs;
begin
 v_context:=nullif(current_setting('erp.recruitment_consumer',true),'')::jsonb;if v_context is null then return new;end if;
 select p.* into v_proof from erp_private.recruitment_consumer_proofs p where p.actor=auth.uid() and p.operation_id=(v_context->>'operation_id')::uuid and p.transaction_id=pg_current_xact_id();
 if not found then return new;end if;
 if tg_table_name='audit_logs' then
  if new.new_values->>'operation_id' is distinct from v_proof.operation_id::text or not
   ((v_proof.kind='requisition' and new.entity_name='hr_job_requisitions') or (v_proof.kind='conversion' and new.entity_name in ('employees','employee_recruitment_links','hr_candidates'))) then return new;end if;
 elsif v_proof.kind<>'conversion' then return new;
 elsif tg_table_name='employee_status_events' then
  if new.employee_id is distinct from v_proof.target_id then return new;end if;
 elsif tg_table_name='hr_candidates' then
  if new.id is distinct from (v_proof.source_json->>'candidate_id')::bigint then return new;end if;
  if old.workspace_revision is distinct from (v_proof.source_json->>'revision')::bigint or new.candidate_status<>'hired' or new.pipeline_stage<>'hired' or new.updated_by is distinct from v_proof.actor_id
   or (to_jsonb(new)-array['candidate_status','pipeline_stage','updated_by','updated_at','workspace_revision']) is distinct from (to_jsonb(old)-array['candidate_status','pipeline_stage','updated_by','updated_at','workspace_revision']) then
   raise exception 'Candidate completion differs from reviewed conversion' using errcode='42501';end if;
 elsif tg_table_name='hr_onboarding_tasks' then
  if not v_proof.source_json->'tasks' @> jsonb_build_array(new.id) then return new;end if;
  if old.employee_id is not null or new.employee_id is distinct from v_proof.target_id or new.updated_by is distinct from v_proof.actor_id
   or (to_jsonb(new)-array['employee_id','updated_by','updated_at']) is distinct from (to_jsonb(old)-array['employee_id','updated_by','updated_at']) then
   raise exception 'Onboarding completion differs from reviewed conversion' using errcode='42501';end if;
 end if;
 insert into erp_private.recruitment_consumer_facts values(auth.uid(),v_proof.operation_id,tg_table_name,new.id,encode(sha256(convert_to(to_jsonb(new)::text,'UTF8')),'hex'));
 return new;
end $$;
revoke all on function erp_private.prove_recruitment_fact() from public,anon,authenticated,service_role;
create trigger f06_recruitment_fact after insert on public.employee_status_events for each row execute function erp_private.prove_recruitment_fact();
create trigger f06_recruitment_fact after insert on public.audit_logs for each row execute function erp_private.prove_recruitment_fact();
create trigger f06_recruitment_fact after update on public.hr_candidates for each row execute function erp_private.prove_recruitment_fact();
create trigger f06_recruitment_fact after update on public.hr_onboarding_tasks for each row execute function erp_private.prove_recruitment_fact();

-- Provisional receipts cannot commit until actual business/history completion
-- is proven. This trigger has no externally callable completion shortcut.
create function erp_private.complete_recruitment_consumer_proof() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_proof erp_private.recruitment_consumer_proofs;v_receipt erp_private.recruitment_consumer_receipts;v_target jsonb;v_candidate public.hr_candidates;
 v_link public.employee_recruitment_links;v_number public.global_numbering_generated_references;v_rule text;v_table text;v_reason text;v_code text;v_fact record;v_hash text;v_count bigint;v_tasks jsonb;
 v_expected jsonb;v_company bigint;v_branch bigint;
begin
 select p.* into v_proof from erp_private.recruitment_consumer_proofs p where p.actor=new.actor and p.operation_id=new.operation_id;
 if not found then return null;end if;
 if v_proof.actor is distinct from auth.uid() or v_proof.actor_id is distinct from public.current_user_profile_id() or v_proof.transaction_id<>pg_current_xact_id()
  or not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Recruitment completion authority unavailable' using errcode='42501';end if;
 select r.* into v_receipt from erp_private.recruitment_consumer_receipts r where r.actor=v_proof.actor and r.operation_id=v_proof.operation_id;
 if not found or v_receipt.kind<>v_proof.kind or v_receipt.request_hash<>v_proof.request_hash then raise exception 'Recruitment transaction is incomplete' using errcode='23514';end if;
 v_company:=(v_proof.input_json->>'owner_company_id')::bigint;v_branch:=(v_proof.input_json->>'branch_id')::bigint;
 if not erp_private.recruitment_scope(v_company,v_branch,'hr.recruitment.manage') then raise exception 'Recruitment completion authority unavailable' using errcode='42501';end if;
 if v_proof.kind='requisition' then
  v_table:='hr_job_requisitions';v_rule:='HR_JOB_REQUISITION';v_reason:='F06 requisition '||v_proof.request_hash;
  select to_jsonb(r) into v_target from public.hr_job_requisitions r where r.id=v_proof.target_id and r.deleted_at is null;
  v_code:=v_target->>'requisition_code';
  if not erp_private.requisition_permission(v_proof.target_id,'hr.recruitment.manage') or ((v_proof.input_json->>'budgeted_salary_min' is not null or v_proof.input_json->>'budgeted_salary_max' is not null) and not
   (erp_private.permission_in_scope('hr.payroll.view',v_company,v_branch) and erp_private.permission_in_scope('hr.payroll.manage',v_company,v_branch))) then raise exception 'Requisition completion authority unavailable' using errcode='42501';end if;
  v_expected:=jsonb_build_object('id',v_proof.target_id,'requisition_code',v_code,'operation_id',v_proof.operation_id,'reference_id',v_proof.reference_id,'replayed',false);
 else
  v_table:='employees';v_rule:='HR_EMPLOYEE';v_reason:='F06 candidate conversion '||v_proof.request_hash;
  select to_jsonb(e) into v_target from public.employees e where e.id=v_proof.target_id and e.deleted_at is null;v_code:=v_target->>'employee_code';
  select c.* into v_candidate from public.hr_candidates c where c.id=(v_proof.source_json->>'candidate_id')::bigint and c.deleted_at is null;
  if not found or v_candidate.candidate_status<>'hired' or v_candidate.pipeline_stage<>'hired' or v_candidate.requisition_id is distinct from (v_proof.source_json->>'source_requisition')::bigint
   or not erp_private.candidate_permission(v_candidate.id,'hr.recruitment.manage') or not erp_private.requisition_permission(v_candidate.requisition_id,'hr.recruitment.manage')
   or (v_proof.input_json->>'requisition_id' is not null and not erp_private.requisition_permission((v_proof.input_json->>'requisition_id')::bigint,'hr.recruitment.manage'))
   or not erp_private.permission_in_scope('hr.employees.create',v_company,v_branch) or not public.current_user_can_view_employee(v_proof.target_id) or not public.current_user_can_manage_employee(v_proof.target_id)
   or not erp_private.employee_permission(v_proof.target_id,'hr.recruitment.manage') or not erp_private.employee_permission(v_proof.target_id,'hr.recruitment.view') then raise exception 'Conversion completion authority unavailable' using errcode='42501';end if;
  if v_proof.input_json->>'offer_id' is not null and not exists(select 1 from public.hr_offers o where o.id=(v_proof.input_json->>'offer_id')::bigint and o.deleted_at is null and o.candidate_id=v_candidate.id
   and o.requisition_id is not distinct from (v_proof.input_json->>'requisition_id')::bigint and erp_private.recruitment_scope(o.owner_company_id,o.branch_id,'hr.recruitment.manage')) then raise exception 'Offer completion authority unavailable' using errcode='42501';end if;
  select l.* into v_link from public.employee_recruitment_links l where l.id=(v_receipt.result->>'link_id')::bigint and l.employee_id=v_proof.target_id and l.candidate_id=v_candidate.id
   and l.requisition_id is not distinct from (v_proof.input_json->>'requisition_id')::bigint and l.offer_id is not distinct from (v_proof.input_json->>'offer_id')::bigint
   and l.converted_by=v_proof.actor_id and l.created_by=v_proof.actor_id and l.conversion_notes is not distinct from v_proof.input_json->>'conversion_notes';
  if not found or (select count(*) from public.employee_recruitment_links l where l.candidate_id=v_candidate.id)<>1 then raise exception 'Conversion link completion is incomplete' using errcode='23514';end if;
  select coalesce(jsonb_agg(t.id order by t.id),'[]') into v_tasks from public.hr_onboarding_tasks t where t.candidate_id=v_candidate.id and t.deleted_at is null;
  if v_tasks is distinct from v_proof.source_json->'tasks' or exists(select 1 from public.hr_onboarding_tasks t where t.candidate_id=v_candidate.id and t.deleted_at is null and
   (t.employee_id is distinct from v_proof.target_id or not erp_private.onboarding_permission(v_candidate.id,v_proof.target_id,'hr.recruitment.manage') or not erp_private.onboarding_permission(v_candidate.id,v_proof.target_id,'hr.recruitment.view'))) then raise exception 'Onboarding completion is incomplete' using errcode='23514';end if;
  select count(*) into v_count from public.employee_status_events s where s.employee_id=v_proof.target_id;
  if v_count<>1 or not exists(select 1 from public.employee_status_events s where s.employee_id=v_proof.target_id and s.old_status is null and s.new_status=coalesce(v_proof.input_json->>'employee_status','active')
   and s.effective_date=(v_proof.input_json->>'joining_date')::date and s.reason='Converted from candidate '||coalesce(v_proof.source_json->>'candidate_code','') and s.created_by=v_proof.actor_id) then raise exception 'Initial status completion is incomplete' using errcode='23514';end if;
  v_expected:=jsonb_build_object('employee_id',v_proof.target_id,'employee_code',v_code,'employee_revision',v_target->>'workspace_revision','candidate_id',v_candidate.id,
   'candidate_revision',v_candidate.workspace_revision::text,'link_id',v_link.id,'operation_id',v_proof.operation_id,'reference_id',v_proof.reference_id,'replayed',false);
 end if;
 if v_target is null or encode(sha256(convert_to(v_target::text,'UTF8')),'hex')<>v_proof.target_hash or v_receipt.result is distinct from v_expected then raise exception 'Receipt target facts changed or incomplete' using errcode='23514';end if;
 select g.* into v_number from erp_private.numbering_requests r join public.global_numbering_generated_references g on g.id=r.reference_id where r.actor_id=v_proof.actor_id and r.operation_id=v_proof.operation_id
  and r.reference_id=v_proof.reference_id and r.request_hash=md5(jsonb_build_array(null::bigint,v_rule,null::text,'reserved'::text,v_table,null::bigint,v_reason)::text)
  and g.generated_by=v_proof.actor_id and g.generation_status='consumed' and g.target_table_name=v_table and g.target_record_id=v_proof.target_id and g.generated_reference_number=v_code and g.generation_reason=v_reason;
 if not found then raise exception 'Receipt requires consumed matching allocation and target' using errcode='23514';end if;
 -- Every proof row must still match the actual row; no UPDATE can impersonate
 -- an INSERT, and omitted onboarding/status/audit facts cannot pass by count.
 for v_fact in select * from erp_private.recruitment_consumer_facts f where f.actor=v_proof.actor and f.operation_id=v_proof.operation_id loop
  if v_fact.table_name not in ('audit_logs','employee_status_events','hr_candidates','hr_onboarding_tasks') then raise exception 'Unexpected fact table' using errcode='23514';end if;
  execute format('select encode(sha256(convert_to(to_jsonb(r)::text,''UTF8'')),''hex'') from public.%I r where r.id=$1',v_fact.table_name) into v_hash using v_fact.record_id;
  if v_hash is distinct from v_fact.row_hash then raise exception 'Recruitment completion fact changed' using errcode='23514';end if;
 end loop;
 select count(*) into v_count from erp_private.recruitment_consumer_facts f where f.actor=v_proof.actor and f.operation_id=v_proof.operation_id;
 if v_count<>(case when v_proof.kind='requisition' then 1 else jsonb_array_length(v_tasks)+5 end) then raise exception 'Recruitment completion fact count is incomplete' using errcode='23514';end if;
 if v_proof.kind='conversion' then
  if not exists(select 1 from erp_private.recruitment_consumer_facts f where f.actor=v_proof.actor and f.operation_id=v_proof.operation_id and f.table_name='hr_candidates' and f.record_id=v_candidate.id)
   or not exists(select 1 from erp_private.recruitment_consumer_facts f join public.employee_status_events s on s.id=f.record_id where f.actor=v_proof.actor and f.operation_id=v_proof.operation_id and f.table_name='employee_status_events' and s.employee_id=v_proof.target_id)
   or exists(select 1 from jsonb_array_elements(v_tasks) t where not exists(select 1 from erp_private.recruitment_consumer_facts f where f.actor=v_proof.actor and f.operation_id=v_proof.operation_id and f.table_name='hr_onboarding_tasks' and f.record_id=t::text::bigint)) then raise exception 'Actual conversion update/insert proof missing' using errcode='23514';end if;
 end if;
 -- Exact audit metadata and INSERT facts are both necessary.
 for v_fact in select * from (values
  (v_table,v_proof.target_id,v_code,'create'::text,case when v_proof.kind='requisition' then jsonb_build_object('operation_id',v_proof.operation_id) else jsonb_build_object('operation_id',v_proof.operation_id,'candidate_id',v_candidate.id,'source','candidate_conversion') end),
  ('employee_recruitment_links',v_link.id,v_code,'create',jsonb_build_object('operation_id',v_proof.operation_id,'candidate_id',v_candidate.id,'employee_id',v_proof.target_id)),
  ('hr_candidates',v_candidate.id,v_candidate.candidate_code,'update',jsonb_build_object('operation_id',v_proof.operation_id,'candidate_status','hired','pipeline_stage','hired','revision',v_candidate.workspace_revision::text))
 ) expected(entity_name,entity_id,entity_reference,action,new_values) where v_proof.kind='conversion' or expected.entity_name='hr_job_requisitions' loop
  if not exists(select 1 from public.audit_logs a join erp_private.recruitment_consumer_facts f on f.record_id=a.id and f.table_name='audit_logs' and f.actor=v_proof.actor and f.operation_id=v_proof.operation_id
   where a.actor_user_profile_id=v_proof.actor_id and a.owner_company_id is not distinct from v_company and a.branch_id is not distinct from v_branch and a.module_code='HR'
    and a.entity_name=v_fact.entity_name and a.entity_id=v_fact.entity_id and a.entity_reference is not distinct from v_fact.entity_reference and a.action=v_fact.action and a.new_values=v_fact.new_values) then raise exception 'Recruitment audit completion is incomplete' using errcode='23514';end if;
 end loop;
 delete from erp_private.recruitment_consumer_proofs p where p.actor=v_proof.actor and p.operation_id=v_proof.operation_id;
 return null;
end $$;
revoke all on function erp_private.complete_recruitment_consumer_proof() from public,anon,authenticated,service_role;
create constraint trigger f06_recruitment_consumer_completion after insert on erp_private.recruitment_consumer_proofs
 deferrable initially deferred for each row execute function erp_private.complete_recruitment_consumer_proof();

-- Membership writers acquire this statement lock before any offer/task/link
-- rows. The consumer takes geography -> conversion domain -> candidate ->
-- requisitions (ID order) -> offer -> onboarding (ID order), then numbering.
-- This closes a concurrent onboarding insert/update and duplicate-link race
-- without altering the F04 candidate save contract or historical rows.
create function erp_private.lock_recruitment_conversion() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-recruitment-conversion',0));
 return null;
end $$;
revoke all on function erp_private.lock_recruitment_conversion() from public,anon,authenticated,service_role;
create trigger f06_conversion_domain before insert or update or delete on public.hr_offers for each statement execute function erp_private.lock_recruitment_conversion();
create trigger f06_conversion_domain before insert or update or delete on public.hr_onboarding_tasks for each statement execute function erp_private.lock_recruitment_conversion();
create trigger f06_conversion_domain before insert or update or delete on public.employee_recruitment_links for each statement execute function erp_private.lock_recruitment_conversion();
create function erp_private.guard_recruitment_conversion_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.candidate_id is not null and (TG_OP='INSERT' or new.candidate_id is distinct from old.candidate_id) then
  perform 1 from public.hr_candidates where id=new.candidate_id for update;
  if exists(select 1 from public.employee_recruitment_links where candidate_id=new.candidate_id and id<>new.id) then
   raise exception 'Candidate already has a conversion link' using errcode='PT409';
  end if;
 end if;
 return new;
end $$;
revoke all on function erp_private.guard_recruitment_conversion_link() from public,anon,authenticated,service_role;
create trigger f06_conversion_one_link before insert or update on public.employee_recruitment_links for each row execute function erp_private.guard_recruitment_conversion_link();

-- Integrity-only scope locks: company DML is intentionally revoked, so an HR
-- invoker cannot acquire FOR SHARE directly. This helper never returns company
-- data, never mutates, and authorizes the exact supplied HR scope before/after waits.
create function erp_private.lock_recruitment_scope(p_company bigint,p_branch bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not erp_private.recruitment_scope(p_company,p_branch,'hr.recruitment.manage')
  or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Recruitment permission denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 if p_company is not null then
  perform 1 from public.owner_companies where id=p_company for share;
  if not found then raise exception 'Company unavailable' using errcode='23503';end if;
 end if;
 if p_branch is not null then
  perform 1 from public.branches where id=p_branch and owner_company_id=p_company for share;
  if not found then raise exception 'Branch/company mismatch' using errcode='23503';end if;
 end if;
 if not erp_private.recruitment_scope(p_company,p_branch,'hr.recruitment.manage')
  or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Recruitment permission denied' using errcode='42501';end if;
end $$;
revoke all on function erp_private.lock_recruitment_scope(bigint,bigint) from public,anon,service_role;
grant execute on function erp_private.lock_recruitment_scope(bigint,bigint) to authenticated;

create function erp_private.validate_recruitment_consumer_input(p_kind text,p_data jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare allowed text[];k text;v jsonb;d date;
begin
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>65536 then raise exception 'Invalid input' using errcode='22023';end if;
 if p_kind='requisition' then
  allowed:=array['requisition_title','owner_company_id','branch_id','department_id','designation_id','work_site_id','requested_by','hiring_manager_id','employment_type_id','employee_category_id','vacancies_count','target_start_date','requisition_status','priority','budgeted_salary_min','budgeted_salary_max','job_description','requirements','notes'];
  if coalesce(btrim(p_data->>'requisition_title'),'')='' or coalesce(p_data->>'requisition_status','draft') not in ('draft','open','on_hold','filled','cancelled','closed')
   or coalesce(p_data->>'priority','normal') not in ('low','normal','high','urgent') then raise exception 'Invalid requisition' using errcode='22023';end if;
 else
  allowed:=array['owner_company_id','branch_id','department_id','designation_id','employment_type_id','employee_category_id','joining_date','employee_status','reporting_manager_id','primary_work_site_id','conversion_notes','offer_id','requisition_id','emergency_contact_name','emergency_contact_mobile'];
  if p_kind<>'conversion' or p_data->>'owner_company_id' is null or p_data->>'joining_date' is null
   or coalesce(btrim(p_data->>'emergency_contact_name'),'')='' or coalesce(btrim(p_data->>'emergency_contact_mobile'),'')=''
   or coalesce(p_data->>'employee_status','active') not in ('active','probation','suspended','inactive','terminated') then raise exception 'Invalid conversion' using errcode='22023';end if;
 end if;
 for k,v in select * from jsonb_each(p_data) loop
  if not k=any(allowed) then raise exception 'Unsupported field' using errcode='22023';end if;
  if right(k,3)='_id' or k in ('requested_by','hiring_manager_id') then
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v::text)::numeric<>trunc((v::text)::numeric) or (v::text)::numeric<1 or (v::text)::numeric>9007199254740991) then raise exception 'Invalid ID' using errcode='22023';end if;
  elsif k='vacancies_count' then
   if jsonb_typeof(v)<>'number' or (v::text)::numeric<>trunc((v::text)::numeric) or (v::text)::numeric<1 or (v::text)::numeric>2147483647 then raise exception 'Invalid vacancies' using errcode='22023';end if;
  elsif k in ('budgeted_salary_min','budgeted_salary_max') then
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>9999999999.99) then raise exception 'Invalid salary' using errcode='22023';end if;
  elsif v<>'null'::jsonb then
   if jsonb_typeof(v)<>'string' then raise exception 'Invalid text' using errcode='22023';end if;
   if k in ('joining_date','target_start_date') then
    if p_data->>k !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date' using errcode='22023';end if;
    d:=(p_data->>k)::date;if to_char(d,'YYYY-MM-DD')<>p_data->>k then raise exception 'Invalid date' using errcode='22023';end if;
   end if;
  end if;
 end loop;
 if p_data->>'branch_id' is not null and p_data->>'owner_company_id' is null then raise exception 'Branch requires company' using errcode='22023';end if;
 if (p_data->>'budgeted_salary_min')::numeric>(p_data->>'budgeted_salary_max')::numeric then raise exception 'Salary interval invalid' using errcode='22023';end if;
end $$;
revoke all on function erp_private.validate_recruitment_consumer_input(text,jsonb) from public,anon,service_role;
grant execute on function erp_private.validate_recruitment_consumer_input(text,jsonb) to authenticated;

create function public.create_numbered_job_requisition(p_operation uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor bigint;company bigint;branch bigint;h text;receipt jsonb;allocation jsonb;payload jsonb;target bigint;code text;cols text;vals text;
begin
 perform erp_private.validate_recruitment_consumer_input('requisition',p_data);
 if p_operation is null or auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Invalid actor/operation' using errcode='42501';end if;
 actor:=public.current_user_profile_id();company:=(p_data->>'owner_company_id')::bigint;branch:=(p_data->>'branch_id')::bigint;
 if not erp_private.recruitment_scope(company,branch,'hr.recruitment.manage') or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Permission denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-numbering:'||actor||':'||p_operation,0));
 h:=encode(sha256(convert_to(jsonb_build_array('requisition',p_data)::text,'UTF8')),'hex');
 perform erp_private.lock_recruitment_scope(company,branch);
 allocation:=public.allocate_numbering_reference(p_operation,null,'HR_JOB_REQUISITION',null,'reserved','hr_job_requisitions',null,'F06 requisition '||h);
 receipt:=erp_private.recruitment_consumer_receipt(p_operation);
 if receipt is not null then
  if receipt->>'kind'<>'requisition' or receipt->>'hash'<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  target:=(receipt->'result'->>'id')::bigint;
  select r.requisition_code into code from public.hr_job_requisitions r where r.id=target and r.deleted_at is null
   and erp_private.recruitment_scope(r.owner_company_id,r.branch_id,'hr.recruitment.manage') for share;
  if code is null or code is distinct from receipt->'result'->>'requisition_code' then raise exception 'Requisition unavailable' using errcode='42501';end if;
  perform public.finish_numbering_reservation(p_operation,'consumed','hr_job_requisitions',target,null);
 else
  if allocation->>'generation_status'<>'reserved' then raise exception 'Number already consumed without this receipt' using errcode='PT409';end if;
  if public.current_user_profile_id() is distinct from actor or not erp_private.recruitment_scope(company,branch,'hr.recruitment.manage') or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Permission denied' using errcode='42501';end if;
  payload:=jsonb_build_object('vacancies_count',1,'requisition_status','draft','priority','normal')||p_data||jsonb_build_object('requisition_title',btrim(p_data->>'requisition_title'),'requisition_code',allocation->>'generated_reference_number','created_by',actor,'updated_by',actor);
  perform set_config('erp.recruitment_consumer',jsonb_build_object('kind','requisition','operation_id',p_operation,'hash',h,'reference_id',allocation->'id','payload',p_data)::text,true);
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k) into cols,vals from jsonb_object_keys(payload) k;
  execute format('insert into public.hr_job_requisitions (%s) select %s from jsonb_populate_record(null::public.hr_job_requisitions,$1) r',cols,vals) using payload;
  receipt:=erp_private.recruitment_consumer_receipt(p_operation);target:=(receipt->'result'->>'id')::bigint;
  if target is null or not exists(select 1 from public.hr_job_requisitions where id=target and deleted_at is null) then raise exception 'Created requisition unavailable' using errcode='42501';end if;
  perform public.finish_numbering_reservation(p_operation,'consumed','hr_job_requisitions',target,null);
  insert into public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,company,branch,'HR','hr_job_requisitions',target,receipt->'result'->>'requisition_code','create',jsonb_build_object('operation_id',p_operation));
 end if;
 -- All allocator, FK, reference, audit and receipt waits precede this recheck.
 if public.current_user_profile_id() is distinct from actor or not erp_private.requisition_permission(target,'hr.recruitment.manage')
  or not erp_private.recruitment_scope(company,branch,'hr.recruitment.manage') or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Permission denied' using errcode='42501';end if;
 if (p_data->>'budgeted_salary_min' is not null or p_data->>'budgeted_salary_max' is not null) and not
  (erp_private.permission_in_scope('hr.payroll.view',company,branch) and erp_private.permission_in_scope('hr.payroll.manage',company,branch)) then raise exception 'Salary permission denied' using errcode='42501';end if;
 perform set_config('erp.recruitment_consumer','',true);
 return receipt->'result'||jsonb_build_object('replayed',(allocation->>'replayed')::boolean);
end $$;
revoke all on function public.create_numbered_job_requisition(uuid,jsonb) from public,anon,service_role;
grant execute on function public.create_numbered_job_requisition(uuid,jsonb) to authenticated;

-- Inspect every source child, including otherwise invisible rows. A partial
-- RLS update must never be mistaken for a complete conversion. No PII returned.
create function erp_private.lock_conversion_children(p_candidate bigint,p_employee bigint default null) returns bigint[]
language plpgsql security definer set search_path='' as $$
declare child record;ids bigint[]:='{}';
begin
 if auth.uid() is null or not erp_private.candidate_permission(p_candidate,'hr.recruitment.manage') then raise exception 'Source unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-recruitment-conversion',0));
 if p_employee is null and exists(select 1 from public.employee_recruitment_links where candidate_id=p_candidate) then raise exception 'Candidate already converted' using errcode='PT409';end if;
 for child in select id,employee_id from public.hr_onboarding_tasks where candidate_id=p_candidate and deleted_at is null order by id for update loop
  if (child.employee_id is not null and child.employee_id is distinct from p_employee)
   or not erp_private.onboarding_permission(p_candidate,child.employee_id,'hr.recruitment.manage')
   or not erp_private.onboarding_permission(p_candidate,child.employee_id,'hr.recruitment.view') then raise exception 'Onboarding source unavailable or bound elsewhere' using errcode='42501';end if;
  ids:=array_append(ids,child.id);
 end loop;
 if not erp_private.candidate_permission(p_candidate,'hr.recruitment.manage') then raise exception 'Source unavailable' using errcode='42501';end if;
 return ids;
end $$;
revoke all on function erp_private.lock_conversion_children(bigint,bigint) from public,anon,service_role;
grant execute on function erp_private.lock_conversion_children(bigint,bigint) to authenticated;

create function public.convert_candidate_to_employee_atomic(p_candidate bigint,p_operation uuid,p_revision bigint,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
<<conversion_state>>
declare actor bigint;company bigint;branch bigint;h text;receipt jsonb;allocation jsonb;c record;o record;employee_id bigint;employee_code text;
 source_requisition bigint;offer_id bigint;req_id bigint;tasks bigint[];affected bigint;candidate_revision bigint;employee_revision bigint;replay boolean;
begin
 perform erp_private.validate_recruitment_consumer_input('conversion',p_data);
 if p_operation is null or p_candidate is null or p_candidate<1 or p_candidate>9007199254740991 or p_revision is null or p_revision<1 or p_revision>9007199254740991 then raise exception 'Invalid conversion contract' using errcode='22023';end if;
 actor:=public.current_user_profile_id();company:=(p_data->>'owner_company_id')::bigint;branch:=(p_data->>'branch_id')::bigint;
 req_id:=(p_data->>'requisition_id')::bigint;offer_id:=(p_data->>'offer_id')::bigint;
 if auth.uid() is null or actor is null or not erp_private.candidate_permission(p_candidate,'hr.recruitment.manage')
  or not erp_private.permission_in_scope('hr.employees.create',company,branch) or not erp_private.recruitment_scope(company,branch,'hr.recruitment.manage')
  or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Permission denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-numbering:'||actor||':'||p_operation,0));
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-recruitment-conversion',0));
 h:=encode(sha256(convert_to(jsonb_build_array('conversion',p_candidate,p_revision,p_data)::text,'UTF8')),'hex');
 select id,candidate_code,requisition_id,full_name_en,full_name_ar,gender,nationality_id,date_of_birth,mobile_number,email,workspace_revision into c
  from public.hr_candidates where id=p_candidate and deleted_at is null for update;
 if not found then raise exception 'Candidate unavailable' using errcode='42501';end if;
 source_requisition:=c.requisition_id;
 perform 1 from public.hr_job_requisitions where id in (source_requisition,req_id) and deleted_at is null order by id for share;
 if not erp_private.requisition_permission(source_requisition,'hr.recruitment.manage') or (req_id is not null and not erp_private.requisition_permission(req_id,'hr.recruitment.manage')) then raise exception 'Requisition unavailable' using errcode='42501';end if;
 if offer_id is not null then
  select id,candidate_id,requisition_id,owner_company_id,branch_id into o from public.hr_offers where id=offer_id and deleted_at is null for share;
  if not found or o.candidate_id<>p_candidate or o.requisition_id is distinct from req_id
   or not erp_private.recruitment_scope(o.owner_company_id,o.branch_id,'hr.recruitment.manage') then raise exception 'Offer unavailable or unrelated' using errcode='42501';end if;
 elsif req_id is distinct from source_requisition then raise exception 'Requisition does not match reviewed candidate' using errcode='22023';end if;
 perform erp_private.lock_recruitment_scope(company,branch);
 receipt:=erp_private.recruitment_consumer_receipt(p_operation);replay:=receipt is not null;
 if replay then
  if receipt->>'kind'<>'conversion' or receipt->>'hash'<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  employee_id:=(receipt->'result'->>'employee_id')::bigint;
  select e.employee_code into employee_code from public.employees e where e.id=conversion_state.employee_id and e.deleted_at is null for share;
  if employee_code is null or employee_code is distinct from receipt->'result'->>'employee_code' or not exists(select 1 from public.employee_recruitment_links l
   where l.id=(receipt->'result'->>'link_id')::bigint and l.employee_id=conversion_state.employee_id and l.candidate_id=p_candidate and l.offer_id is not distinct from conversion_state.offer_id and l.requisition_id is not distinct from conversion_state.req_id) then raise exception 'Conversion result unavailable' using errcode='42501';end if;
 else
  if c.workspace_revision<>p_revision then raise exception 'Candidate changed since review' using errcode='P0409';end if;
 end if;
 tasks:=erp_private.lock_conversion_children(p_candidate,employee_id);
 -- Recheck every current source and destination authority after source waits,
 -- before allocation/mutation AND before a replay can return identifiers.
 if public.current_user_profile_id() is distinct from actor or not erp_private.candidate_permission(p_candidate,'hr.recruitment.manage')
  or not erp_private.requisition_permission(source_requisition,'hr.recruitment.manage') or (req_id is not null and not erp_private.requisition_permission(req_id,'hr.recruitment.manage'))
  or (offer_id is not null and not exists(select 1 from public.hr_offers x where x.id=offer_id and x.deleted_at is null and erp_private.recruitment_scope(x.owner_company_id,x.branch_id,'hr.recruitment.manage')))
  or not erp_private.permission_in_scope('hr.employees.create',company,branch) or not erp_private.recruitment_scope(company,branch,'hr.recruitment.manage')
  or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Permission denied' using errcode='42501';end if;
 allocation:=public.allocate_numbering_reference(p_operation,null,'HR_EMPLOYEE',null,'reserved','employees',null,'F06 candidate conversion '||h);
 if not replay then
  if allocation->>'generation_status'<>'reserved' then raise exception 'Number already consumed without this receipt' using errcode='PT409';end if;
  employee_code:=allocation->>'generated_reference_number';
  perform set_config('erp.recruitment_consumer',jsonb_build_object('kind','conversion','operation_id',p_operation,'hash',h,'reference_id',allocation->'id','payload',p_data,'candidate_id',p_candidate,'revision',p_revision)::text,true);
  insert into public.employees(employee_code,full_name_en,full_name_ar,gender,nationality_id,date_of_birth,mobile_number,personal_email,
   owner_company_id,branch_id,department_id,designation_id,employment_type_id,employee_category_id,joining_date,employee_status,reporting_manager_id,primary_work_site_id,
   emergency_contact_name,emergency_contact_mobile,created_by,updated_by)
  values(employee_code,c.full_name_en,c.full_name_ar,coalesce(c.gender,'male'),c.nationality_id,coalesce(c.date_of_birth,(p_data->>'joining_date')::date),coalesce(c.mobile_number,''),c.email,
   company,branch,(p_data->>'department_id')::bigint,(p_data->>'designation_id')::bigint,(p_data->>'employment_type_id')::bigint,(p_data->>'employee_category_id')::bigint,
   (p_data->>'joining_date')::date,coalesce(p_data->>'employee_status','active'),(p_data->>'reporting_manager_id')::bigint,(p_data->>'primary_work_site_id')::bigint,
   btrim(p_data->>'emergency_contact_name'),btrim(p_data->>'emergency_contact_mobile'),actor,actor);
  -- Separate SELECT preserves F03 readable_employee_ids() snapshot semantics.
  select e.id,e.workspace_revision into employee_id,employee_revision from public.employees e where e.employee_code=conversion_state.employee_code and e.created_by=actor and e.deleted_at is null;
  if employee_id is null or not public.current_user_can_manage_employee(employee_id) then raise exception 'Employee unavailable or not manageable' using errcode='42501';end if;
  insert into public.employee_status_events(employee_id,old_status,new_status,reason,effective_date,created_by)
   values(employee_id,null,coalesce(p_data->>'employee_status','active'),'Converted from candidate '||coalesce(c.candidate_code,''),(p_data->>'joining_date')::date,actor);
  update public.hr_candidates set candidate_status='hired',pipeline_stage='hired',updated_by=actor where id=p_candidate and workspace_revision=p_revision and deleted_at is null returning workspace_revision into candidate_revision;
  if candidate_revision is null then raise exception 'Candidate changed or update unavailable' using errcode='P0409';end if;
  update public.hr_onboarding_tasks t set employee_id=conversion_state.employee_id,updated_by=actor where t.id=any(tasks) and t.candidate_id=p_candidate and t.deleted_at is null;
  get diagnostics affected=row_count;if affected<>cardinality(tasks) then raise exception 'Onboarding update incomplete' using errcode='42501';end if;
  insert into public.employee_recruitment_links(employee_id,candidate_id,requisition_id,offer_id,converted_by,conversion_notes,created_by)
   values(employee_id,p_candidate,req_id,offer_id,actor,p_data->>'conversion_notes',actor);
  receipt:=erp_private.recruitment_consumer_receipt(p_operation);
  if receipt is null then raise exception 'Conversion receipt missing' using errcode='P0002';end if;
  insert into public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values) values
   (actor,company,branch,'HR','employees',employee_id,employee_code,'create',jsonb_build_object('operation_id',p_operation,'candidate_id',p_candidate,'source','candidate_conversion')),
   (actor,company,branch,'HR','employee_recruitment_links',(receipt->'result'->>'link_id')::bigint,employee_code,'create',jsonb_build_object('operation_id',p_operation,'candidate_id',p_candidate,'employee_id',employee_id)),
   (actor,company,branch,'HR','hr_candidates',p_candidate,c.candidate_code,'update',jsonb_build_object('operation_id',p_operation,'candidate_status','hired','pipeline_stage','hired','revision',candidate_revision::text));
 end if;
 perform public.finish_numbering_reservation(p_operation,'consumed','employees',employee_id,null);
 -- Late FK/event/audit/numbering waits cannot preserve a revoked grant. Repeat
 -- the same source and destination tests, including actual employee/link RLS.
 if public.current_user_profile_id() is distinct from actor or not erp_private.candidate_permission(p_candidate,'hr.recruitment.manage')
  or not erp_private.requisition_permission(source_requisition,'hr.recruitment.manage') or (req_id is not null and not erp_private.requisition_permission(req_id,'hr.recruitment.manage'))
  or (offer_id is not null and not exists(select 1 from public.hr_offers x where x.id=offer_id and x.deleted_at is null and erp_private.recruitment_scope(x.owner_company_id,x.branch_id,'hr.recruitment.manage')))
  or not erp_private.permission_in_scope('hr.employees.create',company,branch) or not erp_private.recruitment_scope(company,branch,'hr.recruitment.manage')
  or not public.current_user_has_permission('numbering.rules.generate') or not public.current_user_can_view_employee(employee_id) or not public.current_user_can_manage_employee(employee_id)
  or not erp_private.employee_permission(employee_id,'hr.recruitment.manage') or not erp_private.employee_permission(employee_id,'hr.recruitment.view')
  or exists(select 1 from unnest(tasks) task_id where not erp_private.onboarding_permission(p_candidate,employee_id,'hr.recruitment.manage')) then raise exception 'Permission denied' using errcode='42501';end if;
 perform set_config('erp.recruitment_consumer','',true);
 return receipt->'result'||jsonb_build_object('replayed',replay);
end conversion_state;
$$;
revoke all on function public.convert_candidate_to_employee_atomic(bigint,uuid,bigint,jsonb) from public,anon,service_role;
grant execute on function public.convert_candidate_to_employee_atomic(bigint,uuid,bigint,jsonb) to authenticated;

-- A candidate manager may know that conversion already exists without reading
-- the employee it produced. Never turn a hidden link into "not converted".
create function erp_private.candidate_conversion_exists(p_candidate bigint) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not erp_private.candidate_permission(p_candidate,'hr.recruitment.manage') then raise exception 'Candidate unavailable' using errcode='42501';end if;
 return exists(select 1 from public.employee_recruitment_links where candidate_id=p_candidate);
end $$;
revoke all on function erp_private.candidate_conversion_exists(bigint) from public,anon,service_role;
grant execute on function erp_private.candidate_conversion_exists(bigint) to authenticated;
create function public.prepare_numbered_candidate_conversion(p_candidate bigint) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare candidate jsonb;offer jsonb;converted boolean;
begin
 converted:=erp_private.candidate_conversion_exists(p_candidate);
 select jsonb_build_object('id',id,'workspace_revision',workspace_revision,'requisition_id',requisition_id) into candidate
  from public.hr_candidates where id=p_candidate and deleted_at is null;
 if candidate is null then raise exception 'Candidate unavailable' using errcode='42501';end if;
 if not converted then
  select jsonb_build_object('id',id,'requisition_id',requisition_id,'department_id',department_id,'designation_id',designation_id,
   'employment_type_id',employment_type_id,'owner_company_id',owner_company_id,'branch_id',branch_id,'proposed_joining_date',proposed_joining_date) into offer
  from public.hr_offers where candidate_id=p_candidate and offer_status in ('accepted','approved') and deleted_at is null order by created_at desc,id desc limit 1;
 end if;
 return jsonb_build_object('candidate',candidate,'latest_offer',offer,'already_converted',converted);
end $$;
revoke all on function public.prepare_numbered_candidate_conversion(bigint) from public,anon,service_role;
grant execute on function public.prepare_numbered_candidate_conversion(bigint) to authenticated;
alter table erp_private.recruitment_consumer_receipts owner to postgres;
alter table erp_private.recruitment_consumer_proofs owner to postgres;
alter table erp_private.recruitment_consumer_facts owner to postgres;
alter function erp_private.prove_recruitment_target_insert() owner to postgres;
alter function erp_private.prove_recruitment_fact() owner to postgres;
alter function erp_private.complete_recruitment_consumer_proof() owner to postgres;
alter function erp_private.recruitment_consumer_receipt(uuid) owner to postgres;
alter function erp_private.capture_recruitment_consumer_receipt() owner to postgres;
alter function erp_private.guard_recruitment_conversion_link() owner to postgres;
alter function erp_private.lock_recruitment_scope(bigint,bigint) owner to postgres;
alter function erp_private.lock_conversion_children(bigint,bigint) owner to postgres;
alter function erp_private.candidate_conversion_exists(bigint) owner to postgres;
notify pgrst,'reload schema';
commit;
