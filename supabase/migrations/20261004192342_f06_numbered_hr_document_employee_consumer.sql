begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- HR.14A only. Business writes remain SECURITY INVOKER and existing F03 RLS.
-- Lock order: actor/operation -> geography -> HR.14A consumer -> source document
-- IDs -> source files/extractions/version/type -> destination company/branch ->
-- allocation -> new employee/children/links/events/audit. No external calls.
create table erp_private.document_employee_receipts(
 actor uuid not null,operation_id uuid not null,request_hash text not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(actor,operation_id)
);
alter table erp_private.document_employee_receipts enable row level security;
revoke all on erp_private.document_employee_receipts from public,anon,authenticated,service_role;

-- INSERT-only proof cannot be manufactured by a caller-set GUC, or by UPDATE
-- of an old employee (which also changes xmin). A deferred check makes an
-- unconsumed proof roll back at commit, so no abandoned proof survives.
create table erp_private.document_employee_insert_proofs(
 actor uuid not null,operation_id uuid not null,transaction_id xid8 not null,
 employee_id bigint not null,reference_id bigint not null,request_hash text not null,
 primary key(actor,operation_id)
);
alter table erp_private.document_employee_insert_proofs enable row level security;
revoke all on erp_private.document_employee_insert_proofs from public,anon,authenticated,service_role;
create function erp_private.prove_document_employee_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_actor bigint;v_hash text;v_reference bigint;
begin
 v_context:=nullif(current_setting('erp.document_employee',true),'')::jsonb;
 if v_context is null then return new;end if;
 v_actor:=public.current_user_profile_id();
 perform erp_private.validate_document_employee_input(v_context->'payload',v_context->'sources');
 v_hash:=encode(sha256(convert_to(jsonb_build_array(v_context->'sources',v_context->'payload')::text,'UTF8')),'hex');
 if auth.uid() is null or v_actor is null or new.created_by is distinct from v_actor or new.updated_by is distinct from v_actor
  or v_context->>'hash' is distinct from v_hash or not erp_private.document_employee_authority(new.owner_company_id,new.branch_id,null,v_context->'payload') then
  raise exception 'Invalid employee insertion proof' using errcode='42501';end if;
 select g.id into v_reference from erp_private.numbering_requests r
 join public.global_numbering_generated_references g on g.id=r.reference_id
 join public.global_numbering_rules rule on rule.id=g.numbering_rule_id
 where r.actor_id=v_actor and r.operation_id=(v_context->>'operation_id')::uuid and rule.rule_code='HR_EMPLOYEE'
  and r.request_hash=md5(jsonb_build_array(null::bigint,'HR_EMPLOYEE'::text,null::text,'reserved'::text,'employees'::text,null::bigint,'F06 HR document employee '||v_hash)::text)
  and g.generated_by=v_actor and g.generation_status='reserved' and g.target_table_name='employees' and g.target_record_id is null
  and g.generated_reference_number=new.employee_code and g.generation_reason='F06 HR document employee '||v_hash;
 if not found then raise exception 'Employee insertion requires its matching reserved number' using errcode='42501';end if;
 insert into erp_private.document_employee_insert_proofs values(auth.uid(),(v_context->>'operation_id')::uuid,pg_current_xact_id(),new.id,v_reference,v_hash);
 return new;
end $$;
revoke all on function erp_private.prove_document_employee_insert() from public,anon,authenticated,service_role;
create trigger f06_document_employee_insert_proof after insert on public.employees for each row execute function erp_private.prove_document_employee_insert();
create function erp_private.require_document_employee_completion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from erp_private.document_employee_insert_proofs p where p.actor=new.actor and p.operation_id=new.operation_id and p.transaction_id=new.transaction_id) then
  raise exception 'Document employee transaction is incomplete' using errcode='23514';end if;
 return null;
end $$;
revoke all on function erp_private.require_document_employee_completion() from public,anon,authenticated,service_role;
create constraint trigger f06_document_employee_proof_completion after insert on erp_private.document_employee_insert_proofs
 deferrable initially deferred for each row execute function erp_private.require_document_employee_completion();

create table erp_private.document_employee_insert_facts(
 actor uuid not null,operation_id uuid not null,table_name text not null,record_id bigint not null,
 primary key(actor,operation_id,table_name,record_id),
 foreign key(actor,operation_id) references erp_private.document_employee_insert_proofs(actor,operation_id) on delete cascade
);
alter table erp_private.document_employee_insert_facts enable row level security;
revoke all on erp_private.document_employee_insert_facts from public,anon,authenticated,service_role;
create function erp_private.prove_document_employee_fact_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_employee bigint;
begin
 v_context:=nullif(current_setting('erp.document_employee',true),'')::jsonb;
 if v_context is null then return new;end if;
 if tg_table_name='dms_document_links' then
  if new.entity_type<>'employee' then return new;end if;v_employee:=new.entity_id;
 elsif tg_table_name='dms_document_events' then v_employee:=(new.metadata_json->>'employee_id')::bigint;
 else v_employee:=new.employee_id;end if;
 if not exists(select 1 from erp_private.document_employee_insert_proofs p where p.actor=auth.uid() and p.operation_id=(v_context->>'operation_id')::uuid
  and p.employee_id=v_employee and p.transaction_id=pg_current_xact_id() and p.request_hash=v_context->>'hash') then
  raise exception 'Document employee fact requires its current INSERT proof' using errcode='42501';end if;
 insert into erp_private.document_employee_insert_facts values(auth.uid(),(v_context->>'operation_id')::uuid,tg_table_name,new.id);
 return new;
end $$;
revoke all on function erp_private.prove_document_employee_fact_insert() from public,anon,authenticated,service_role;
create trigger f06_document_employee_fact_insert after insert on public.employee_identity_documents for each row execute function erp_private.prove_document_employee_fact_insert();
create trigger f06_document_employee_fact_insert after insert on public.employee_medical_insurances for each row execute function erp_private.prove_document_employee_fact_insert();
create trigger f06_document_employee_fact_insert after insert on public.employee_training_certificates for each row execute function erp_private.prove_document_employee_fact_insert();
create trigger f06_document_employee_fact_insert after insert on public.employee_status_events for each row execute function erp_private.prove_document_employee_fact_insert();
create trigger f06_document_employee_fact_insert after insert on public.dms_document_links for each row execute function erp_private.prove_document_employee_fact_insert();
create trigger f06_document_employee_fact_insert after insert on public.dms_document_events for each row execute function erp_private.prove_document_employee_fact_insert();

create function erp_private.document_employee_enabled() returns boolean
language sql stable security definer set search_path='' as $$
 select erp_private.business_principal_is_active() and (
  exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
   where ur.user_profile_id=public.current_user_profile_id() and ur.is_active and r.is_active and r.role_code='system_admin' and ur.owner_company_id is null and ur.branch_id is null)
  or exists(select 1 from public.erp_ai_feature_flags where feature_code='ERP_AI_HR_DOCUMENT_TO_EMPLOYEE' and is_enabled));
$$;
revoke all on function erp_private.document_employee_enabled() from public,anon,service_role;
grant execute on function erp_private.document_employee_enabled() to authenticated;

create function erp_private.document_employee_receipt(p_operation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_receipt jsonb;v_employee public.employees;
begin
 select jsonb_build_object('hash',r.request_hash,'result',r.result) into v_receipt from erp_private.document_employee_receipts r
 where r.actor=auth.uid() and r.operation_id=p_operation and erp_private.business_principal_is_active();
 if v_receipt is null then return null;end if;
 select e.* into v_employee from public.employees e where e.id=(v_receipt->'result'->>'employeeId')::bigint and e.deleted_at is null;
 if not found or not erp_private.document_employee_authority(v_employee.owner_company_id,v_employee.branch_id,v_employee.id,
  jsonb_build_object('selectedDocumentIds',v_receipt->'result'->'sourceDocumentIds','complianceRecords',v_receipt->'result'->'childRecords')) then
  raise exception 'Committed result unavailable' using errcode='42501';end if;
 return v_receipt;
end;
$$;
revoke all on function erp_private.document_employee_receipt(uuid) from public,anon,service_role;
grant execute on function erp_private.document_employee_receipt(uuid) to authenticated;

-- Only an actual caller-authorized employee audit INSERT captures the receipt;
-- there is no callable privileged business writer or receipt-write function.
create function erp_private.capture_document_employee_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_data jsonb;v_sources jsonb;v_result jsonb;v_hash text;v_actor bigint;v_employee public.employees;
 v_number public.global_numbering_generated_references;v_expected jsonb;v_child jsonb;v_fact jsonb;v_table text;v_index bigint;
 v_links jsonb;v_warnings jsonb:='[]';v_source jsonb;v_now_xid xid;v_count bigint;v_type text;
begin
 v_context:=nullif(current_setting('erp.document_employee',true),'')::jsonb;
 if v_context is null or auth.uid() is null or new.action<>'document_to_employee.create' or new.entity_name<>'employees' then return new;end if;
 v_actor:=public.current_user_profile_id();v_data:=v_context->'payload';v_sources:=v_context->'sources';v_result:=v_context->'result';
 perform erp_private.validate_document_employee_input(v_data,v_sources);
 v_hash:=encode(sha256(convert_to(jsonb_build_array(v_sources,v_data)::text,'UTF8')),'hex');
 v_now_xid:=(mod(pg_current_xact_id()::text::numeric,4294967296))::text::xid;
 if v_actor is null or new.actor_user_profile_id is distinct from v_actor
  or new.new_values->>'operation_id' is distinct from v_context->>'operation_id' or v_context->>'hash' is distinct from v_hash then
  raise exception 'Receipt context is not proof of a mutation' using errcode='42501';end if;
 select e.* into v_employee from public.employees e where e.id=new.entity_id and e.created_by=v_actor and e.deleted_at is null and e.xmin=v_now_xid;
 if not found or not erp_private.document_employee_authority(v_employee.owner_company_id,v_employee.branch_id,v_employee.id,v_data) then
  raise exception 'Receipt requires an authorized employee created in this transaction' using errcode='42501';end if;
 select g.* into v_number from erp_private.numbering_requests r join public.global_numbering_generated_references g on g.id=r.reference_id
 join erp_private.document_employee_insert_proofs proof on proof.actor=auth.uid() and proof.operation_id=r.operation_id
  and proof.transaction_id=pg_current_xact_id() and proof.employee_id=v_employee.id and proof.reference_id=g.id and proof.request_hash=v_hash
 where r.actor_id=v_actor and r.operation_id=(v_context->>'operation_id')::uuid and g.generated_by=v_actor
  and r.request_hash=md5(jsonb_build_array(null::bigint,'HR_EMPLOYEE'::text,null::text,'reserved'::text,'employees'::text,null::bigint,'F06 HR document employee '||v_hash)::text)
  and g.generation_status='consumed' and g.target_table_name='employees' and g.target_record_id=v_employee.id
  and g.generated_reference_number=v_employee.employee_code and g.generation_reason='F06 HR document employee '||v_hash;
 if not found then raise exception 'Receipt requires its consumed matching number' using errcode='42501';end if;
 v_expected:=(v_data-array['selectedDocumentIds','complianceRecords','conflictsReviewed','totalDocumentsSelected'])
  ||jsonb_build_object('employee_code',v_employee.employee_code,'created_by',v_actor,'updated_by',v_actor);
 if not to_jsonb(v_employee) @> v_expected then raise exception 'Employee does not match reviewed payload' using errcode='42501';end if;
 select count(*) into v_count from public.employee_status_events s where s.employee_id=v_employee.id;
 if v_count<>1 or not exists(select 1 from public.employee_status_events s where s.employee_id=v_employee.id and s.created_by=v_actor
  and s.old_status is null and s.new_status=coalesce(v_data->>'employee_status','active') and s.effective_date=(v_data->>'joining_date')::date
  and s.reason='Employee created from DMS documents (HR.14A)' and s.xmin=v_now_xid
  and exists(select 1 from erp_private.document_employee_insert_facts f where f.actor=auth.uid() and f.operation_id=(v_context->>'operation_id')::uuid and f.table_name='employee_status_events' and f.record_id=s.id)) then raise exception 'Initial employee status is incomplete' using errcode='42501';end if;
 if jsonb_typeof(v_result->'childRecords') is distinct from 'array' or jsonb_array_length(v_result->'childRecords')<>jsonb_array_length(v_data->'complianceRecords')
  or (select count(distinct (c->>'kind')||':'||(c->>'id')) from jsonb_array_elements(v_result->'childRecords') c)<>jsonb_array_length(v_result->'childRecords') then raise exception 'Receipt children mismatch' using errcode='42501';end if;
 for v_child,v_index in select value,ordinality-1 from jsonb_array_elements(v_data->'complianceRecords') with ordinality loop
  v_fact:=v_result->'childRecords'->(v_index::int);
  if v_fact->>'kind' is distinct from v_child->>'kind' or v_fact->'sourceDocumentId' is distinct from v_child->'sourceDocumentId'
   or v_fact-array['kind','id','sourceDocumentId']<>'{}'::jsonb then raise exception 'Receipt child identity mismatch' using errcode='42501';end if;
  v_table:=case v_child->>'kind' when 'identity_document' then 'employee_identity_documents' when 'medical_insurance' then 'employee_medical_insurances' else 'employee_training_certificates' end;
  v_expected:=(v_child-array['kind','tempId','sourceDocumentId'])||jsonb_build_object('employee_id',v_employee.id,'created_by',v_actor,'updated_by',v_actor);
  execute format('select count(*) from public.%I c where c.id=$1 and c.employee_id=$2 and c.deleted_at is null and c.xmin=$3 and to_jsonb(c) @> $4 and exists(select 1 from erp_private.document_employee_insert_facts f where f.actor=auth.uid() and f.operation_id=$5 and f.table_name=$6 and f.record_id=c.id)',v_table)
   into v_count using (v_fact->>'id')::bigint,v_employee.id,v_now_xid,v_expected,(v_context->>'operation_id')::uuid,v_table;
  if v_count<>1 then raise exception 'Receipt requires every actual matching included child' using errcode='42501';end if;
 end loop;
 for v_child in select value from jsonb_array_elements(v_data->'complianceRecords') where value->>'kind'='identity_document' loop
  select upper(t.code) into v_type from public.hr_identity_document_types t where t.id=(v_child->>'document_type_id')::bigint;
  if v_type in ('PASSPORT','EMIRATES_ID') and exists(select 1 from public.employee_identity_documents i
   where i.employee_id<>v_employee.id and i.deleted_at is null and i.status in ('active','pending')
    and public.current_user_can_view_employee(i.employee_id) and erp_private.employee_permission(i.employee_id,'hr.compliance.view')
    and i.document_type_id=(v_child->>'document_type_id')::bigint
    and regexp_replace(upper(btrim(i.document_number)),'[\s-]','','g')=regexp_replace(upper(btrim(v_child->>'document_number')),'[\s-]','','g')) then
   raise exception 'Identity document already exists' using errcode='PT409';end if;
 end loop;
 foreach v_table in array array['employee_identity_documents','employee_medical_insurances','employee_training_certificates'] loop
  execute format('select count(*) from public.%I where employee_id=$1',v_table) into v_count using v_employee.id;
  if v_count<>(select count(*) from jsonb_array_elements(v_data->'complianceRecords') c where c->>'kind'=case v_table when 'employee_identity_documents' then 'identity_document' when 'employee_medical_insurances' then 'medical_insurance' else 'training_certificate' end) then raise exception 'Unexpected employee child facts' using errcode='42501';end if;
 end loop;
 select jsonb_agg(l.id order by l.document_id) into v_links from public.dms_document_links l where l.entity_type='employee' and l.entity_id=v_employee.id
  and l.document_id in(select value::text::bigint from jsonb_array_elements(v_data->'selectedDocumentIds') value)
  and l.deleted_at is null and l.linked_by=v_actor and l.link_role='hr14a_source' and not l.is_primary and l.xmin=v_now_xid
  and exists(select 1 from erp_private.document_employee_insert_facts f where f.actor=auth.uid() and f.operation_id=(v_context->>'operation_id')::uuid and f.table_name='dms_document_links' and f.record_id=l.id);
 if v_links is null or jsonb_array_length(v_links)<>jsonb_array_length(v_data->'selectedDocumentIds') then raise exception 'Receipt requires actual source links' using errcode='42501';end if;
 select count(*) into v_count from public.dms_document_events e join public.dms_document_links l on l.id::text=e.metadata_json->>'link_id'
 where e.performed_by=v_actor and e.event_type='party_document_link_created' and e.xmin=v_now_xid and e.metadata_json->>'operation_id'=v_context->>'operation_id'
  and e.document_id=l.document_id and l.entity_type='employee' and l.entity_id=v_employee.id and v_links @> jsonb_build_array(l.id)
  and e.metadata_json->>'employee_id'=v_employee.id::text
  and exists(select 1 from erp_private.document_employee_insert_facts f where f.actor=auth.uid() and f.operation_id=(v_context->>'operation_id')::uuid and f.table_name='dms_document_events' and f.record_id=e.id);
 if v_count<>jsonb_array_length(v_links) then raise exception 'Receipt requires actual source events' using errcode='42501';end if;
 select count(*) into v_count from erp_private.document_employee_insert_facts f where f.actor=auth.uid() and f.operation_id=(v_context->>'operation_id')::uuid;
 if v_count<>1+jsonb_array_length(v_data->'complianceRecords')+2*jsonb_array_length(v_links) then raise exception 'Unexpected inserted transaction facts' using errcode='42501';end if;
 -- A user-settable GUC cannot vouch for source or warning facts either.
 v_source:=erp_private.document_employee_sources(v_data->'selectedDocumentIds');
 perform erp_private.lock_document_employee_destination(v_employee.owner_company_id,v_employee.branch_id);
 if exists(select 1 from jsonb_array_elements(v_sources) expected left join jsonb_array_elements(v_source) actual on actual->'documentId'=expected->'documentId'
  where actual is null or actual->>'fingerprint'<>expected->>'fingerprint') then raise exception 'Reviewed source changed' using errcode='P0409';end if;
 if exists(select 1 from public.employees e where e.id<>v_employee.id and e.deleted_at is null and public.current_user_can_view_employee(e.id) and e.mobile_number=v_data->>'mobile_number') then v_warnings:=v_warnings||jsonb_build_array('An accessible employee has the same mobile number.');end if;
 if nullif(v_data->>'personal_email','') is not null and exists(select 1 from public.employees e where e.id<>v_employee.id and e.deleted_at is null and public.current_user_can_view_employee(e.id) and e.personal_email=v_data->>'personal_email') then v_warnings:=v_warnings||jsonb_build_array('An accessible employee has the same personal email.');end if;
 if exists(select 1 from public.employees e where e.id<>v_employee.id and e.deleted_at is null and public.current_user_can_view_employee(e.id) and e.full_name_en ilike v_data->>'full_name_en' and e.date_of_birth=(v_data->>'date_of_birth')::date) then v_warnings:=v_warnings||jsonb_build_array('An accessible employee has the same name and date of birth.');end if;
 v_expected:=jsonb_build_object('employeeId',v_employee.id,'employeeCode',v_employee.employee_code,'employeeRevision',v_employee.workspace_revision::text,
  'referenceId',v_number.id,'operationId',v_context->>'operation_id','sourceDocumentIds',v_data->'selectedDocumentIds','linkIds',v_links,
  'childRecords',v_result->'childRecords','complianceRecordsCreated',jsonb_array_length(v_data->'complianceRecords'),'documentsLinked',jsonb_array_length(v_links),'warnings',v_warnings,'replayed',false);
 if v_result is distinct from v_expected or new.entity_reference is distinct from v_employee.employee_code or new.owner_company_id is distinct from v_employee.owner_company_id
  or new.branch_id is distinct from v_employee.branch_id or new.new_values is distinct from jsonb_build_object('operation_id',v_context->>'operation_id',
   'selected_document_ids',v_data->'selectedDocumentIds','created_child_record_counts',jsonb_array_length(v_data->'complianceRecords'),
   'documents_linked',jsonb_array_length(v_links),'conflict_count',v_data->'conflictsReviewed','source','HR.14A') then raise exception 'Receipt does not match actual mutation facts' using errcode='42501';end if;
 if public.current_user_profile_id() is distinct from v_actor or not erp_private.document_employee_authority(v_employee.owner_company_id,v_employee.branch_id,v_employee.id,v_data) then
  raise exception 'Permission denied' using errcode='42501';end if;
 insert into erp_private.document_employee_receipts(actor,operation_id,request_hash,result)
 values(auth.uid(),(v_context->>'operation_id')::uuid,v_hash,v_expected);
 delete from erp_private.document_employee_insert_proofs p where p.actor=auth.uid() and p.operation_id=(v_context->>'operation_id')::uuid and p.transaction_id=pg_current_xact_id();
 return new;
end $$;
revoke all on function erp_private.capture_document_employee_receipt() from public,anon,authenticated,service_role;
create trigger f06_document_employee_receipt after insert on public.audit_logs for each row execute function erp_private.capture_document_employee_receipt();

-- Exact reviewed data and fingerprint are returned from the same locked read.
-- Parent FOR UPDATE blocks new FK children; existing file/extraction rows are
-- locked too, so source membership/content cannot change during the consumer.
create function erp_private.document_employee_sources(p_ids jsonb,p_validate_extraction boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id bigint;v_doc jsonb;v_files jsonb;v_extractions jsonb;v_extraction jsonb;v_type jsonb;v_version jsonb;v_result jsonb:='[]';v_hash text;
begin
 if not erp_private.document_employee_enabled() or not public.current_user_has_permission_any_scope('hr.employees.create')
  or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Permission denied' using errcode='42501';end if;
 if p_ids is null or jsonb_typeof(p_ids)<>'array' or jsonb_array_length(p_ids) not between 1 and 200
  or exists(select 1 from jsonb_array_elements(p_ids) value where jsonb_typeof(value)<>'number' or value::text!~'^[1-9][0-9]*$' or (value::text)::numeric>9007199254740991)
  or (select count(distinct value) from jsonb_array_elements(p_ids) value)<>jsonb_array_length(p_ids) then raise exception 'Invalid selected sources' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 for v_id in select value::text::bigint from jsonb_array_elements(p_ids) value order by value::text::bigint loop
  if not public.f03_has_document_permission(v_id,'dms.documents.preview') or not public.f03_has_document_permission(v_id,'dms.documents.edit') then raise exception 'Source unavailable' using errcode='42501';end if;
  perform 1 from public.dms_documents d where d.id=v_id and d.deleted_at is null and d.status<>'deleted' for update;
  if not found then raise exception 'Source unavailable' using errcode='42501';end if;
 end loop;
 for v_id in select value::text::bigint from jsonb_array_elements(p_ids) value order by value::text::bigint loop
  select jsonb_build_object('id',d.id,'document_no',d.document_no,'title',d.title,'document_type_id',d.document_type_id,'status',d.status,
   'expiry_date',d.expiry_date,'issue_date',d.issue_date,'created_at',d.created_at,'updated_at',d.updated_at,'current_version_id',d.current_version_id,
   'owning_company_id',d.owning_company_id,'owning_branch_id',d.owning_branch_id,'confidentiality_level',d.confidentiality_level)
   into v_doc from public.dms_documents d where d.id=v_id;
  perform 1 from public.dms_document_files f where f.document_id=v_id order by f.id for share;
  perform 1 from public.dms_ai_extraction_results a where a.document_id=v_id order by a.id for share;
  perform 1 from public.dms_document_versions v where v.document_id=v_id order by v.id for share;
  perform 1 from public.dms_document_types t where t.id=(v_doc->>'document_type_id')::bigint for share;
  select jsonb_build_object('id',t.id,'name_en',t.name_en,'type_code',t.type_code) into v_type from public.dms_document_types t where t.id=(v_doc->>'document_type_id')::bigint;
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'version_id',f.version_id,'sha256_hash',f.sha256_hash,'storage_bucket',f.storage_bucket,'storage_path',f.storage_path,
   'created_at',f.created_at,'deleted_at',f.deleted_at) order by f.id),'[]') into v_files from public.dms_document_files f where f.document_id=v_id;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id desc),'[]') into v_extractions from public.dms_ai_extraction_results a where a.document_id=v_id;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]') into v_version from public.dms_document_versions v where v.document_id=v_id;
  select value into v_extraction from jsonb_array_elements(v_extractions) value where value->>'ai_status'<>'superseded' limit 1;
  if p_validate_extraction and v_extraction->>'file_id' is not null and not exists(select 1 from jsonb_array_elements(v_files) f where f->>'id'=v_extraction->>'file_id' and f->>'deleted_at' is null
   and (v_doc->>'current_version_id' is null or f->>'version_id'=v_doc->>'current_version_id')) then raise exception 'Extraction file is unavailable or replaced' using errcode='P0409';end if;
  if not public.f03_has_document_permission(v_id,'dms.documents.preview') or not public.f03_has_document_permission(v_id,'dms.documents.edit') then raise exception 'Source unavailable' using errcode='42501';end if;
  v_hash:=encode(sha256(convert_to(jsonb_build_array(v_doc,v_files,v_extractions,v_version,v_type)::text,'UTF8')),'hex');
  v_result:=v_result||jsonb_build_array(jsonb_build_object('documentId',v_id,'fingerprint',v_hash,'document',v_doc||jsonb_build_object('document_type',v_type),
   'extraction',case when v_extraction is null then null else jsonb_build_object('extracted_fields_json',v_extraction->'extracted_fields_json','field_confidence_json',v_extraction->'field_confidence_json') end));
 end loop;
 for v_id in select value::text::bigint from jsonb_array_elements(p_ids) value loop
  if not public.f03_has_document_permission(v_id,'dms.documents.preview') or not public.f03_has_document_permission(v_id,'dms.documents.edit') then raise exception 'Source unavailable' using errcode='42501';end if;
 end loop;
 if not erp_private.document_employee_enabled() or not public.current_user_has_permission_any_scope('hr.employees.create') or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Permission denied' using errcode='42501';end if;
 return v_result;
end $$;
revoke all on function erp_private.document_employee_sources(jsonb,boolean) from public,anon,service_role;
grant execute on function erp_private.document_employee_sources(jsonb,boolean) to authenticated;
create function public.prepare_document_employee_sources(p_ids jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select erp_private.document_employee_sources(p_ids); $$;
revoke all on function public.prepare_document_employee_sources(jsonb) from public,anon,service_role;
grant execute on function public.prepare_document_employee_sources(jsonb) to authenticated;

create function erp_private.validate_document_employee_input(p_data jsonb,p_sources jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare v_key text;v_value jsonb;v_child jsonb;v_allowed text[];v_required text[];v_kind text;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_sources is null or jsonb_typeof(p_sources)<>'array' then raise exception 'Invalid request' using errcode='22023';end if;
 v_allowed:=array['selectedDocumentIds','full_name_en','full_name_ar','gender','date_of_birth','nationality_id','mobile_number','personal_email','owner_company_id','branch_id','department_id','designation_id','employee_category_id','employment_type_id','joining_date','employee_status','reporting_manager_id','emergency_contact_name','emergency_contact_mobile','emergency_contact_relationship_type_id','complianceRecords','conflictsReviewed','totalDocumentsSelected'];
 if exists(select 1 from jsonb_object_keys(p_data) key where not key=any(v_allowed)) then raise exception 'Unknown field' using errcode='22023';end if;
 if jsonb_typeof(p_data->'selectedDocumentIds') is distinct from 'array' or jsonb_typeof(p_data->'complianceRecords') is distinct from 'array'
  or jsonb_array_length(p_data->'selectedDocumentIds') not between 1 and 200
  or (select count(distinct d) from jsonb_array_elements(p_data->'selectedDocumentIds') d)<>jsonb_array_length(p_data->'selectedDocumentIds')
  or jsonb_array_length(p_data->'complianceRecords')>200 or jsonb_array_length(p_sources)<>jsonb_array_length(p_data->'selectedDocumentIds') then raise exception 'Invalid source/child list' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_sources) s where jsonb_typeof(s)<>'object' or jsonb_typeof(s->'documentId') is distinct from 'number'
  or (s->>'documentId')!~'^[1-9][0-9]*$' or (s->>'documentId')::numeric>9007199254740991 or coalesce(s->>'fingerprint','')!~'^[a-f0-9]{64}$'
  or exists(select 1 from jsonb_object_keys(s) k where k not in ('documentId','fingerprint')))
  or (select count(distinct s->>'documentId') from jsonb_array_elements(p_sources) s)<>jsonb_array_length(p_sources)
  or exists(select 1 from jsonb_array_elements(p_data->'selectedDocumentIds') d where not exists(select 1 from jsonb_array_elements(p_sources) s where s->'documentId'=d)) then raise exception 'Invalid reviewed sources' using errcode='22023';end if;
 v_required:=array['full_name_en','gender','date_of_birth','mobile_number','owner_company_id','joining_date','emergency_contact_name','emergency_contact_mobile','totalDocumentsSelected'];
 foreach v_key in array v_required loop if p_data->>v_key is null or btrim(p_data->>v_key)='' then raise exception 'Required employee value missing' using errcode='22023';end if;end loop;
 if p_data->>'gender' not in ('male','female') or coalesce(p_data->>'employee_status','active') not in ('active','inactive','on_leave','probation','suspended','terminated','archived') then raise exception 'Invalid employee state' using errcode='22023';end if;
 for v_key,v_value in select key,value from jsonb_each(p_data) loop
  if v_value='null'::jsonb then continue;end if;
  if v_key like '%\_id' escape '\' then
   if jsonb_typeof(v_value)<>'number' or v_value::text!~'^[1-9][0-9]*$' or v_value::text::numeric>9007199254740991 then raise exception 'Invalid identifier' using errcode='22023';end if;
  elsif v_key in ('conflictsReviewed','totalDocumentsSelected') then
   if jsonb_typeof(v_value)<>'number' or v_value::text!~'^[0-9]+$' or v_value::text::numeric>9007199254740991 then raise exception 'Invalid count' using errcode='22023';end if;
  elsif v_key not in ('selectedDocumentIds','complianceRecords') and jsonb_typeof(v_value)<>'string' then raise exception 'Invalid text' using errcode='22023';end if;
 end loop;
 if (p_data->>'totalDocumentsSelected')::int<>jsonb_array_length(p_data->'selectedDocumentIds') then raise exception 'Source count mismatch' using errcode='22023';end if;
 foreach v_key in array array['date_of_birth','joining_date'] loop
  if p_data->>v_key!~'^\d{4}-\d{2}-\d{2}$' or ((p_data->>v_key)::date)::text<>p_data->>v_key then raise exception 'Invalid date' using errcode='22023';end if;
 end loop;
 if coalesce(p_data->>'personal_email','')<>'' and p_data->>'personal_email'!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid email' using errcode='22023';end if;
 if (select count(distinct c->>'tempId') from jsonb_array_elements(p_data->'complianceRecords') c)<>jsonb_array_length(p_data->'complianceRecords') then raise exception 'Duplicate child identity' using errcode='22023';end if;
 for v_child in select value from jsonb_array_elements(p_data->'complianceRecords') loop
  if jsonb_typeof(v_child)<>'object' then raise exception 'Invalid child' using errcode='22023';end if;
  v_kind:=v_child->>'kind';
  v_allowed:=array['kind','tempId','sourceDocumentId','dms_document_id','verification_status','renewal_status','notes','status','issue_date','expiry_date'];
  v_required:=array['kind','tempId','sourceDocumentId','dms_document_id'];
  if v_kind='identity_document' then
   v_allowed:=v_allowed||array['document_type_id','document_number','issuing_authority','issuing_authority_party_id','issue_country_id','issuing_emirate_id','emirates_id_application_no','visa_file_number','uid_number','labour_card_number','work_permit_number','mohre_person_code','profession_on_document','sponsor_company_id','place_of_issue'];
   v_required:=v_required||array['document_type_id','document_number'];
  elsif v_kind='medical_insurance' then
   v_allowed:=v_allowed||array['insurance_provider','policy_number','tpa','insurance_card_number','network_class','employee_covered','dependent_coverage_included'];
   v_required:=v_required||array['insurance_provider','policy_number','expiry_date','employee_covered','dependent_coverage_included'];
  elsif v_kind='training_certificate' then
   v_allowed:=v_allowed||array['training_type_id','training_category_id','provider','certificate_number'];v_required:=v_required||array['training_type_id'];
  else raise exception 'Invalid child kind' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(v_child) key where not key=any(v_allowed)) then raise exception 'Unknown child field' using errcode='22023';end if;
  foreach v_key in array v_required loop if v_child->>v_key is null or btrim(v_child->>v_key)='' then raise exception 'Required included child value missing' using errcode='22023';end if;end loop;
  if v_child->'sourceDocumentId' is distinct from v_child->'dms_document_id' or not p_data->'selectedDocumentIds' @> jsonb_build_array(v_child->'sourceDocumentId') then raise exception 'Child source mismatch' using errcode='22023';end if;
  for v_key,v_value in select key,value from jsonb_each(v_child) loop
   if v_value='null'::jsonb then continue;end if;
   if v_key like '%\_id' escape '\' or v_key='sourceDocumentId' then
    if jsonb_typeof(v_value)<>'number' or v_value::text!~'^[1-9][0-9]*$' or v_value::text::numeric>9007199254740991 then raise exception 'Invalid child identifier' using errcode='22023';end if;
   elsif v_key in ('employee_covered','dependent_coverage_included') then
    if jsonb_typeof(v_value)<>'boolean' then raise exception 'Invalid child boolean' using errcode='22023';end if;
   elsif jsonb_typeof(v_value)<>'string' then raise exception 'Invalid child text' using errcode='22023';end if;
  end loop;
  foreach v_key in array array['issue_date','expiry_date'] loop if v_child->>v_key is not null and (v_child->>v_key!~'^\d{4}-\d{2}-\d{2}$' or ((v_child->>v_key)::date)::text<>v_child->>v_key) then raise exception 'Invalid child date' using errcode='22023';end if;end loop;
 end loop;
end $$;
revoke all on function erp_private.validate_document_employee_input(jsonb,jsonb) from public,anon,service_role;
grant execute on function erp_private.validate_document_employee_input(jsonb,jsonb) to authenticated;

create function erp_private.document_employee_authority(p_company bigint,p_branch bigint,p_employee bigint,p_data jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select erp_private.document_employee_enabled() and public.current_user_has_permission('numbering.rules.generate')
  and erp_private.permission_in_scope('hr.employees.create',p_company,p_branch)
  and (p_employee is null or (public.current_user_can_view_employee(p_employee) and public.current_user_can_manage_employee(p_employee)))
  and not exists(select 1 from jsonb_array_elements(p_data->'selectedDocumentIds') d
   where not public.f03_has_document_permission(d::text::bigint,'dms.documents.preview') or not public.f03_has_document_permission(d::text::bigint,'dms.documents.edit'))
  and not exists(select 1 from jsonb_array_elements(p_data->'complianceRecords') c where
   case when p_employee is null then not erp_private.permission_in_scope(case when c->>'kind'='medical_insurance' then 'hr.medical.manage' else 'hr.compliance.manage' end,p_company,p_branch)
   else not (erp_private.employee_permission(p_employee,case when c->>'kind'='medical_insurance' then 'hr.medical.manage' else 'hr.compliance.manage' end)
    and erp_private.employee_permission(p_employee,case when c->>'kind'='medical_insurance' then 'hr.medical.view' else 'hr.compliance.view' end)) end);
$$;
revoke all on function erp_private.document_employee_authority(bigint,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function erp_private.document_employee_authority(bigint,bigint,bigint,jsonb) to authenticated;

-- An integrity-only projection: owning-company administration SELECT is not
-- a new prerequisite for an otherwise scoped HR creator. Never returns data.
create function erp_private.lock_document_employee_destination(p_company bigint,p_branch bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not erp_private.document_employee_enabled() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.permission_in_scope('hr.employees.create',p_company,p_branch) then raise exception 'Permission denied' using errcode='42501';end if;
 perform 1 from public.owner_companies c where c.id=p_company for share;
 if not found then raise exception 'Company unavailable' using errcode='23503';end if;
 if p_branch is not null then
  perform 1 from public.branches b where b.id=p_branch and b.owner_company_id=p_company for share;
  if not found then raise exception 'Branch does not belong to company' using errcode='23503';end if;
 end if;
 if not erp_private.document_employee_enabled() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.permission_in_scope('hr.employees.create',p_company,p_branch) then raise exception 'Permission denied' using errcode='42501';end if;
end $$;
revoke all on function erp_private.lock_document_employee_destination(bigint,bigint) from public,anon,service_role;
grant execute on function erp_private.lock_document_employee_destination(bigint,bigint) to authenticated;

create function public.create_numbered_document_employee(p_operation uuid,p_sources jsonb,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_actor bigint;v_company bigint;v_branch bigint;v_employee bigint;v_code text;v_revision bigint;v_hash text;v_receipt jsonb;v_sources jsonb;
 v_allocation jsonb;v_payload jsonb;v_child jsonb;v_table text;v_columns text;v_select text;v_id bigint;v_doc bigint;v_link bigint;v_children jsonb:='[]';v_links jsonb:='[]';v_warnings jsonb:='[]';v_result jsonb;v_type text;
begin
 perform erp_private.validate_document_employee_input(p_data,p_sources);
 if p_operation is null then raise exception 'Operation required' using errcode='22023';end if;
 v_actor:=public.current_user_profile_id();v_company:=(p_data->>'owner_company_id')::bigint;v_branch:=(p_data->>'branch_id')::bigint;
 if auth.uid() is null or v_actor is null or not erp_private.document_employee_authority(v_company,v_branch,null,p_data) then raise exception 'Permission denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-numbering:'||v_actor||':'||p_operation,0));
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-document-employee',0));
 v_hash:=encode(sha256(convert_to(jsonb_build_array(p_sources,p_data)::text,'UTF8')),'hex');
 v_receipt:=erp_private.document_employee_receipt(p_operation);
 v_sources:=erp_private.document_employee_sources(p_data->'selectedDocumentIds',v_receipt is null);
 perform erp_private.lock_document_employee_destination(v_company,v_branch);
 if v_receipt is not null then
  if v_receipt->>'hash'<>v_hash then raise exception 'Operation input changed' using errcode='22023';end if;
  v_employee:=(v_receipt->'result'->>'employeeId')::bigint;
  perform 1 from public.employees e where e.id=v_employee and e.deleted_at is null and e.employee_code=v_receipt->'result'->>'employeeCode'
   and e.owner_company_id=v_company and e.branch_id is not distinct from v_branch for share;
  if not found or not erp_private.document_employee_authority(v_company,v_branch,v_employee,p_data) then raise exception 'Committed result unavailable' using errcode='42501';end if;
  return v_receipt->'result'||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from jsonb_array_elements(p_sources) expected left join jsonb_array_elements(v_sources) actual on actual->'documentId'=expected->'documentId'
  where actual is null or actual->>'fingerprint'<>expected->>'fingerprint') then raise exception 'Reviewed source changed' using errcode='P0409';end if;
 if public.current_user_profile_id() is distinct from v_actor or not erp_private.document_employee_authority(v_company,v_branch,null,p_data) then raise exception 'Permission denied' using errcode='42501';end if;
 -- Preserve current duplicate business rules: accessible mobile/email/name+DOB
 -- are warnings; accessible active/pending passport/EID matches are blocking.
 if exists(select 1 from public.employees e where e.deleted_at is null and e.mobile_number=p_data->>'mobile_number') then v_warnings:=v_warnings||jsonb_build_array('An accessible employee has the same mobile number.');end if;
 if nullif(p_data->>'personal_email','') is not null and exists(select 1 from public.employees e where e.deleted_at is null and e.personal_email=p_data->>'personal_email') then v_warnings:=v_warnings||jsonb_build_array('An accessible employee has the same personal email.');end if;
 if exists(select 1 from public.employees e where e.deleted_at is null and e.full_name_en ilike p_data->>'full_name_en' and e.date_of_birth=(p_data->>'date_of_birth')::date) then v_warnings:=v_warnings||jsonb_build_array('An accessible employee has the same name and date of birth.');end if;
 for v_child in select value from jsonb_array_elements(p_data->'complianceRecords') where value->>'kind'='identity_document' loop
  select upper(t.code) into v_type from public.hr_identity_document_types t where t.id=(v_child->>'document_type_id')::bigint;
  if not found then raise exception 'Identity type unavailable' using errcode='42501';end if;
  if v_type in ('PASSPORT','EMIRATES_ID') and exists(select 1 from public.employee_identity_documents i
   where i.deleted_at is null and i.status in ('active','pending') and i.document_type_id=(v_child->>'document_type_id')::bigint
    and regexp_replace(upper(btrim(i.document_number)),'[\s-]','','g')=regexp_replace(upper(btrim(v_child->>'document_number')),'[\s-]','','g')) then raise exception 'Identity document already exists' using errcode='PT409';end if;
 end loop;
 v_allocation:=public.allocate_numbering_reference(p_operation,null,'HR_EMPLOYEE',null,'reserved','employees',null,'F06 HR document employee '||v_hash);
 if v_allocation->>'generation_status'<>'reserved' then raise exception 'Number already used by another consumer' using errcode='PT409';end if;
 v_code:=v_allocation->>'generated_reference_number';
 perform set_config('erp.document_employee',jsonb_build_object('operation_id',p_operation,'hash',v_hash,'payload',p_data,'sources',p_sources)::text,true);
 v_payload:=(p_data-array['selectedDocumentIds','complianceRecords','conflictsReviewed','totalDocumentsSelected'])||jsonb_build_object('employee_code',v_code,'created_by',v_actor,'updated_by',v_actor);
 select string_agg(format('%I',key),',' order by key),string_agg(format('r.%I',key),',' order by key) into v_columns,v_select from jsonb_object_keys(v_payload) key;
 execute format('insert into public.employees(%s) select %s from jsonb_populate_record(null::public.employees,$1) r',v_columns,v_select) using v_payload;
 -- Separate read preserves F03 readable_employee_ids() stable snapshot semantics.
 select e.id,e.workspace_revision into v_employee,v_revision from public.employees e where e.employee_code=v_code and e.created_by=v_actor and e.deleted_at is null;
 if v_employee is null or not erp_private.document_employee_authority(v_company,v_branch,v_employee,p_data) then raise exception 'Employee unavailable or not manageable' using errcode='42501';end if;
 insert into public.employee_status_events(employee_id,old_status,new_status,reason,effective_date,created_by)
 values(v_employee,null,coalesce(p_data->>'employee_status','active'),'Employee created from DMS documents (HR.14A)',(p_data->>'joining_date')::date,v_actor);
 for v_child in select value from jsonb_array_elements(p_data->'complianceRecords') loop
  v_table:=case v_child->>'kind' when 'identity_document' then 'employee_identity_documents' when 'medical_insurance' then 'employee_medical_insurances' else 'employee_training_certificates' end;
  v_payload:=(v_child-array['kind','tempId','sourceDocumentId'])||jsonb_build_object('employee_id',v_employee,'created_by',v_actor,'updated_by',v_actor);
  select string_agg(format('%I',key),',' order by key),string_agg(format('r.%I',key),',' order by key) into v_columns,v_select from jsonb_object_keys(v_payload) key;
  execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning id',v_table,v_columns,v_select,v_table) into v_id using v_payload;
  if v_id is null then raise exception 'Included child not saved' using errcode='P0002';end if;
  v_children:=v_children||jsonb_build_array(jsonb_build_object('kind',v_child->>'kind','id',v_id,'sourceDocumentId',(v_child->>'sourceDocumentId')::bigint));
 end loop;
 for v_doc in select value::text::bigint from jsonb_array_elements(p_data->'selectedDocumentIds') value order by value::text::bigint loop
  insert into public.dms_document_links(document_id,entity_type,entity_id,is_primary,link_role,notes,linked_by)
  values(v_doc,'employee',v_employee,false,'hr14a_source','Linked during HR.14A Employee Creation wizard',v_actor) returning id into v_link;
  v_links:=v_links||jsonb_build_array(v_link);
  insert into public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
  values(v_doc,'party_document_link_created','Linked to employee via HR.14A wizard',v_actor,jsonb_build_object('operation_id',p_operation,'employee_id',v_employee,'link_id',v_link));
 end loop;
 perform public.finish_numbering_reservation(p_operation,'consumed','employees',v_employee,null);
 v_result:=jsonb_build_object('employeeId',v_employee,'employeeCode',v_code,'employeeRevision',v_revision::text,'referenceId',(v_allocation->>'id')::bigint,'operationId',p_operation,
  'sourceDocumentIds',p_data->'selectedDocumentIds','linkIds',v_links,'childRecords',v_children,'complianceRecordsCreated',jsonb_array_length(v_children),'documentsLinked',jsonb_array_length(v_links),'warnings',v_warnings,'replayed',false);
 perform set_config('erp.document_employee',jsonb_build_object('operation_id',p_operation,'hash',v_hash,'result',v_result,'payload',p_data,'sources',p_sources)::text,true);
 insert into public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(v_actor,v_company,v_branch,'HR','employees',v_employee,v_code,'document_to_employee.create',jsonb_build_object('operation_id',p_operation,'selected_document_ids',p_data->'selectedDocumentIds',
  'created_child_record_counts',jsonb_array_length(v_children),'documents_linked',jsonb_array_length(v_links),'conflict_count',p_data->'conflictsReviewed','source','HR.14A'));
 perform set_config('erp.document_employee','',true);
 if public.current_user_profile_id() is distinct from v_actor or not erp_private.document_employee_authority(v_company,v_branch,v_employee,p_data) then raise exception 'Permission denied' using errcode='42501';end if;
 v_receipt:=erp_private.document_employee_receipt(p_operation);
 if v_receipt is null then raise exception 'Receipt missing' using errcode='P0002';end if;
 return v_receipt->'result';
end $$;
revoke all on function public.create_numbered_document_employee(uuid,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.create_numbered_document_employee(uuid,jsonb,jsonb) to authenticated;

alter table erp_private.document_employee_receipts owner to postgres;
alter table erp_private.document_employee_insert_proofs owner to postgres;
alter table erp_private.document_employee_insert_facts owner to postgres;
alter function erp_private.document_employee_enabled() owner to postgres;
alter function erp_private.document_employee_sources(jsonb,boolean) owner to postgres;
alter function erp_private.document_employee_receipt(uuid) owner to postgres;
alter function erp_private.capture_document_employee_receipt() owner to postgres;
alter function erp_private.prove_document_employee_insert() owner to postgres;
alter function erp_private.require_document_employee_completion() owner to postgres;
alter function erp_private.prove_document_employee_fact_insert() owner to postgres;
alter function erp_private.lock_document_employee_destination(bigint,bigint) owner to postgres;
notify pgrst,'reload schema';
commit;
