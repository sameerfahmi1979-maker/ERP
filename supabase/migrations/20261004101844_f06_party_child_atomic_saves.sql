begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$declare existing text;begin
 select pg_get_expr(conbin,conrelid) into existing from pg_constraint
  where conrelid='erp_private.master_lifecycle_receipts'::regclass and conname='master_lifecycle_receipts_entity_check';
 if existing is null then raise exception 'Expected receipt constraint unavailable';end if;
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute format('alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check ((%s) or entity in (''party_contacts'',''party_bank_details'',''party_licenses'',''party_tax_registrations'',''party_documents'',''party_notes''))',existing);
end$$;

-- Six explicit capabilities, not a general table writer. The existing RLS
-- read/manage/author rules are rechecked before lookup and receipt replay.
-- Caller cannot write ownership, verification, DMS/storage or audit metadata.
create function erp_private.save_party_child_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 allowed text[];required_field text;permission_code text;code_field text;field text;data_type oid;
 old_row jsonb;candidate jsonb;saved jsonb;payload jsonb;previous erp_private.master_lifecycle_receipts%rowtype;
 h text;result jsonb;assigns text;changed boolean;system_admin boolean;parent public.parties%rowtype;actor bigint;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 actor:=public.current_user_profile_id();system_admin:=public.current_user_has_role('system_admin');
 case p_entity
 when 'party_contacts' then
  permission_code:='master_data.parties.manage_contacts';code_field:='contact_code';required_field:='full_name';
  allowed:=array['party_id','full_name','designation','department_id','contact_role_id','email','phone','mobile','whatsapp','is_primary','is_accounts_contact','is_sales_contact','is_operations_contact','is_hse_contact','is_documents_contact','is_active','notes'];
 when 'party_bank_details' then
  permission_code:='master_data.parties.manage_bank_details';code_field:='bank_detail_code';required_field:='account_holder_name';
  allowed:=array['party_id','bank_id','bank_name_text','account_holder_name','account_number','iban','swift_code','currency_id','branch_name','country_id','is_primary','is_active','remarks'];
 when 'party_licenses' then
  permission_code:='master_data.parties.manage_licenses';code_field:='license_code';required_field:='license_number';
  allowed:=array['party_id','license_type_id','license_number','license_name','issuing_authority_party_id','issuing_country_id','issuing_emirate_id','issue_date','expiry_date','renewal_required','renewal_notice_days','license_status_id','license_activity_text','license_document_id','is_primary','is_active','remarks'];
 when 'party_tax_registrations' then
  permission_code:='master_data.parties.manage_tax';code_field:='tax_registration_code';required_field:='tax_registration_number';
  allowed:=array['party_id','tax_type_id','tax_registration_number','tax_country_id','tax_status_id','effective_from','effective_to','certificate_document_id','reverse_charge_applicable','vat_exempt','is_primary','is_active','remarks'];
 when 'party_documents' then
  permission_code:='master_data.parties.manage_documents';code_field:='document_code';required_field:='document_title';
  allowed:=array['party_id','document_type_id','document_title','document_number','issue_date','expiry_date','issuing_authority_party_id','expiry_required','renewal_notice_days','document_status_id','remarks'];
 when 'party_notes' then
  permission_code:='master_data.parties.edit';code_field:='note_code';required_field:='note_body';
  allowed:=array['party_id','note_type_id','note_title','note_body','is_private','follow_up_date'];
 else raise exception 'Unsupported child record' using errcode='22023';
 end case;
 if not (system_admin or public.current_user_has_permission(permission_code)) then raise exception 'Permission denied' using errcode='42501';end if;
 if p_entity not in ('party_bank_details','party_notes') and not (system_admin or public.current_user_has_permission('master_data.parties.view')) then
  raise exception 'Read permission denied' using errcode='42501';
 end if;
 if p_operation is null or p_id is null or p_id not between 1 and 9007199254740991 or p_revision is null or p_revision<1
  or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>262144 then
  raise exception 'Invalid child save contract' using errcode='22023';
 end if;
 for field in select jsonb_object_keys(p_data) loop
  if not field=any(allowed) then raise exception 'Protected or unsupported child field' using errcode='22023';end if;
  select atttypid into data_type from pg_attribute where attrelid=to_regclass('public.'||p_entity) and attname=field and not attisdropped;
  if data_type is null then raise exception 'Unsupported field' using errcode='22023';end if;
  if p_data->field<>'null'::jsonb and (
   (data_type='boolean'::regtype and jsonb_typeof(p_data->field)<>'boolean')
   or (data_type in ('bigint'::regtype,'integer'::regtype,'numeric'::regtype) and jsonb_typeof(p_data->field)<>'number')
   or (data_type in ('text'::regtype,'date'::regtype) and jsonb_typeof(p_data->field)<>'string')) then
   raise exception 'Invalid field type' using errcode='22023';
  end if;
  if data_type in ('bigint'::regtype,'integer'::regtype) and p_data->field<>'null'::jsonb and
   ((p_data->>field)::numeric<>trunc((p_data->>field)::numeric) or (p_data->>field)::numeric>9007199254740991 or (p_data->>field)::numeric<case when field='renewal_notice_days' then 0 else 1 end) then
   raise exception 'Invalid integer value' using errcode='22023';
  end if;
  if data_type='date'::regtype and p_data->field<>'null'::jsonb and (p_data->>field)!~'^\d{4}-\d{2}-\d{2}$' then
   raise exception 'Use an ISO calendar date' using errcode='22023';
  end if;
 end loop;
 if p_data?required_field and nullif(btrim(p_data->>required_field),'') is null then raise exception 'Required field missing' using errcode='23514';end if;
 if not p_data?'party_id' or p_data->'party_id'='null'::jsonb then raise exception 'Parent identity required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 h:=encode(sha256(convert_to(jsonb_build_array('party-child-save',p_entity,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 select r.* into previous from erp_private.master_lifecycle_receipts r where r.actor=auth.uid() and r.operation_id=p_operation;
 if found and previous.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
 select * into parent from public.parties where id=(p_data->>'party_id')::bigint for share;
 if not found or (parent.is_locked and not system_admin) then raise exception 'Parent unavailable' using errcode='42501';end if;
 execute format('select to_jsonb(c) from public.%I c where id=$1 for update',p_entity) into old_row using p_id;
 if old_row is null then raise exception 'Record not found' using errcode='PT404';end if;
 if old_row->'party_id' is distinct from p_data->'party_id' then raise exception 'Parent identity is immutable' using errcode='22023';end if;
 if p_entity='party_notes' and not system_admin then
  if (old_row->>'created_by')::bigint is distinct from actor then raise exception 'Only the note author can edit this note' using errcode='42501';end if;
  if old_row->>'is_private'<>'true' and not public.current_user_has_permission('master_data.parties.view') then raise exception 'Read permission denied' using errcode='42501';end if;
 end if;
 if previous.operation_id is not null then return previous.result||jsonb_build_object('replayed',true);end if;
 if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Record changed' using errcode='PT409';end if;
 execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',p_entity) into candidate using old_row||p_data;
 changed:=exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);
 if changed then
  payload:=p_data||jsonb_build_object('updated_by',actor);
  select string_agg(format('%I=r.%I',k,k),',' order by k) into assigns from jsonb_object_keys(payload) k;
  execute format('update public.%I c set %s from jsonb_populate_record(null::public.%I,$1)r where c.id=$2 returning to_jsonb(c)',p_entity,assigns,p_entity) into saved using payload,p_id;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'MASTER_DATA',p_entity,p_id,saved->>code_field,'update',jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision',
    'fields',(select jsonb_agg(k order by k) from jsonb_object_keys(p_data)k where old_row->k is distinct from candidate->k)));
 else saved:=old_row;
 end if;
 result:=jsonb_build_object('id',p_id,'revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)values(auth.uid(),p_operation,h,p_entity,p_id,result);
 return result;
end$$;
alter function erp_private.save_party_child_record(text,uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_party_child_record(text,uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function erp_private.save_party_child_record(text,uuid,bigint,bigint,jsonb) to authenticated;
create function public.save_party_child_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.save_party_child_record(p_entity,p_operation,p_id,p_revision,p_data);
$$;
revoke all on function public.save_party_child_record(text,uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_party_child_record(text,uuid,bigint,bigint,jsonb) to authenticated;
-- Child lifecycle, linked DMS writes and bank verification remain separate
-- adoption requirements. Do not claim raw UPDATE/DELETE closure here.
notify pgrst,'reload schema';
commit;
