begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- F06 numbered creation is the only supported application INSERT boundary for
-- these eight records. Direct INSERT could previously forge an issued code or
-- bypass operation replay, number consumption and audit. The public wrapper
-- remains invoker; only this private, allowlisted operation has table authority.
-- Its explicit checks reproduce the prior RLS creation/read requirements and
-- retain current actor, global scope, numbering, active parent and field guards.
-- No role assignments or permissive table policies are added.
create or replace function erp_private.create_numbered_party_record(p_entity text,p_operation uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 rule_code text; code_column text; permission_code text; allowed text[]; required text[];
 actor bigint; allocation jsonb; values_json jsonb; columns_sql text; projection_sql text;
 record_id bigint; reference text; parent_id bigint; field text; data_type oid;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then
  raise exception 'Party creation permission denied' using errcode='42501';
 end if;
 actor:=public.current_user_profile_id();
 case p_entity
 when 'parties' then
  rule_code:='MASTER_PARTY';code_column:='party_code';permission_code:='master_data.parties.create';
  required:=array['display_name','legal_name_en'];
  allowed:=array['display_name','legal_name_en','legal_name_ar','trade_name_en','trade_name_ar','short_name','party_nature_id','primary_party_type_id','parent_party_id','main_phone','main_mobile','whatsapp','main_email','alternate_email','website','country_id','emirate_id','city_id','area_zone_id','po_box','full_address_text','google_map_url','latitude','longitude','party_status_id','is_active','remarks'];
 when 'party_contacts' then
  rule_code:='MASTER_PARTY_CONTACT';code_column:='contact_code';permission_code:='master_data.parties.manage_contacts';required:=array['full_name'];
  allowed:=array['party_id','full_name','designation','department_id','contact_role_id','email','phone','mobile','whatsapp','is_primary','is_accounts_contact','is_sales_contact','is_operations_contact','is_hse_contact','is_documents_contact','is_active','notes'];
 when 'party_addresses' then
  rule_code:='MASTER_PARTY_ADDRESS';code_column:='address_code';permission_code:='master_data.parties.manage_addresses';required:='{}';
  allowed:=array['party_id','address_type_id','address_name','country_id','emirate_id','city_id','area_zone_id','street','building','floor','office_no','po_box','landmark','google_map_url','latitude','longitude','is_primary','is_billing_address','is_shipping_address','is_site_address','is_active','notes'];
 when 'party_bank_details' then
  rule_code:='MASTER_PARTY_BANK';code_column:='bank_detail_code';permission_code:='master_data.parties.manage_bank_details';required:=array['account_holder_name'];
  allowed:=array['party_id','bank_id','bank_name_text','account_holder_name','account_number','iban','swift_code','currency_id','branch_name','country_id','is_primary','is_active','remarks'];
 when 'party_licenses' then
  rule_code:='MASTER_PARTY_LICENSE';code_column:='license_code';permission_code:='master_data.parties.manage_licenses';required:=array['license_number'];
  allowed:=array['party_id','license_type_id','license_number','license_name','issuing_authority_party_id','issuing_country_id','issuing_emirate_id','issue_date','expiry_date','renewal_required','renewal_notice_days','license_status_id','license_activity_text','license_document_id','is_primary','is_active','remarks'];
 when 'party_tax_registrations' then
  rule_code:='MASTER_PARTY_TAX';code_column:='tax_registration_code';permission_code:='master_data.parties.manage_tax';required:=array['tax_registration_number'];
  allowed:=array['party_id','tax_type_id','tax_registration_number','tax_country_id','tax_status_id','effective_from','effective_to','certificate_document_id','reverse_charge_applicable','vat_exempt','is_primary','is_active','remarks'];
 when 'party_documents' then
  rule_code:='MASTER_PARTY_DOCUMENT';code_column:='document_code';permission_code:='master_data.parties.manage_documents';required:=array['document_title'];
  allowed:=array['party_id','document_type_id','document_title','document_number','issue_date','expiry_date','issuing_authority_party_id','expiry_required','renewal_notice_days','document_status_id','remarks'];
 when 'party_notes' then
  rule_code:='MASTER_PARTY_NOTE';code_column:='note_code';permission_code:='master_data.parties.edit';required:=array['note_body'];
  allowed:=array['party_id','note_type_id','note_title','note_body','is_private','follow_up_date'];
 else raise exception 'Unsupported party creation' using errcode='22023';
 end case;
 if not (public.current_user_has_role('system_admin') or public.current_user_has_permission(permission_code))
  or not (public.current_user_has_role('system_admin') or public.current_user_has_permission('numbering.rules.generate')) then
  raise exception 'Party creation permission denied' using errcode='42501';
 end if;
 -- Repeat the previous INSERT + SELECT RLS contract explicitly; a privileged
 -- INSERT helper must never turn a scoped assignment into global access.
 -- Private notes are created only by the current actor; no note body is returned.
 if not (public.current_user_has_role('system_admin')
  or (p_entity='parties' and (public.current_user_has_permission('master_data.parties.view') or public.current_user_has_permission('master_data.party_master.view')))
  or (p_entity='party_bank_details' and public.current_user_has_permission('master_data.parties.manage_bank_details'))
  or (p_entity not in ('parties','party_bank_details') and public.current_user_has_permission('master_data.parties.view'))) then
  raise exception 'Party read permission denied' using errcode='42501';
 end if;
 if p_operation is null or p_data is null or jsonb_typeof(p_data)<>'object'
  or octet_length(p_data::text)>262144 then
  raise exception 'Invalid party creation request' using errcode='22023';
 end if;
 foreach field in array required loop
  if jsonb_typeof(p_data->field) is distinct from 'string' or nullif(btrim(p_data->>field),'') is null then
   raise exception 'Required party field is missing' using errcode='22023';
  end if;
 end loop;
 for field in select jsonb_object_keys(p_data) loop
  if not field=any(allowed) then raise exception 'Protected or unsupported party field' using errcode='22023';end if;
  select a.atttypid into data_type from pg_attribute a
   where a.attrelid=to_regclass('public.'||p_entity) and a.attname=field and not a.attisdropped;
  if data_type is null then raise exception 'Unsupported party field' using errcode='22023';end if;
  if p_data->field<>'null'::jsonb and (
   (data_type='boolean'::regtype and jsonb_typeof(p_data->field)<>'boolean')
   or (data_type in ('bigint'::regtype,'integer'::regtype,'numeric'::regtype,'double precision'::regtype) and jsonb_typeof(p_data->field)<>'number')
   or (data_type in ('text'::regtype,'date'::regtype) and jsonb_typeof(p_data->field)<>'string')) then
   raise exception 'Invalid party field type' using errcode='22023';
  end if;
 end loop;

 -- Same shared relationship-lock order as edits and lifecycle transitions.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));

 -- The canonical JSON fingerprint binds entity, values and operation identity.
 -- The existing actor/operation advisory lock serializes duplicate submissions.
 allocation:=public.allocate_numbering_reference(p_operation,null,rule_code,
  case when p_entity='parties' then 'PARTY' else null end,'reserved',p_entity,null,
  'F06 party creation '||md5(p_data::text));
 reference:=allocation->>'generated_reference_number';
 if allocation->>'generation_status'='consumed' then
  -- Current global business/read authority was rechecked above before replay.
  -- Never expose another creator's record or recreate one deleted externally.
  execute format('select id from public.%I where %I=$1 and created_by=$2',p_entity,code_column)
   into record_id using reference,actor;
  if record_id is null then raise exception 'Created record is unavailable' using errcode='42501';end if;
  -- A deleted/recreated row with the same code is not the original target.
  -- Verify the immutable consumption link, rather than rebinding history.
  perform public.finish_numbering_reservation(p_operation,'consumed',p_entity,record_id,null);
  return jsonb_build_object('id',record_id,'entity',p_entity,'reference',reference,
   'reference_id',(allocation->>'id')::bigint,'operation_id',p_operation,'replayed',true);
 end if;
 if allocation->>'generation_status'<>'reserved' then
  raise exception 'Number reservation was already completed differently' using errcode='PT409';
 end if;

 if p_entity<>'parties' then
  parent_id:=(p_data->>'party_id')::bigint;
  perform erp_private.lock_party_creation_parent(parent_id);
 end if;
 values_json:=p_data||jsonb_build_object(code_column,reference,'created_by',actor,'updated_by',actor);
 if p_entity='party_documents' then values_json:=values_json||jsonb_build_object('uploaded_by',actor,'uploaded_at',now());end if;
 select string_agg(format('%I',key),',' order by key),string_agg(format('r.%I',key),',' order by key)
  into columns_sql,projection_sql from jsonb_object_keys(values_json)key;
 execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1)r returning id',
  p_entity,columns_sql,projection_sql,p_entity) into record_id using values_json;
 perform public.finish_numbering_reservation(p_operation,'consumed',p_entity,record_id,null);
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  values(actor,'MASTER_DATA',p_entity,record_id,reference,'create',
   (values_json-'created_by'-'updated_by')||case when p_entity='party_bank_details' then jsonb_build_object('iban','[REDACTED]','account_number','[REDACTED]')
    when p_entity='party_notes' and coalesce((p_data->>'is_private')::boolean,false) then jsonb_build_object('note_body','[PRIVATE]','note_title','[PRIVATE]') else '{}'::jsonb end);
 return jsonb_build_object('id',record_id,'entity',p_entity,'reference',reference,
  'reference_id',(allocation->>'id')::bigint,'operation_id',p_operation,'replayed',false);
end $$;
alter function erp_private.create_numbered_party_record(text,uuid,jsonb) owner to postgres;
revoke all on function erp_private.create_numbered_party_record(text,uuid,jsonb) from public,anon,service_role;
grant execute on function erp_private.create_numbered_party_record(text,uuid,jsonb) to authenticated;

revoke insert on public.parties,public.party_contacts,public.party_addresses,
 public.party_bank_details,public.party_licenses,public.party_tax_registrations,
 public.party_documents,public.party_notes from public,anon,authenticated;
comment on function public.create_numbered_party_record(text,uuid,jsonb) is
 'F06 checked atomic creation with retained numbering and audit; public invoker wrapper over a private allowlisted mutation. No direct application INSERT.';

notify pgrst,'reload schema';
commit;
