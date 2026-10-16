begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- New/changed relationships are checked; historical inactive selections and
-- legacy chronology are not silently rewritten on an unrelated edit.
-- Integrity-only trigger returns no catalogue data and adds no user grants.
create function erp_private.validate_party_child_relations() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 refs jsonb;pair record;field text;code_field text;required_field text;valid boolean;
 activated boolean:=n->>'is_active'='true' and o->>'is_active'='false';
 start_key text;end_key text;document_key text;
begin
 case TG_TABLE_NAME
 when 'party_contacts' then
  code_field:='contact_code';required_field:='full_name';refs:='{"department_id":"party_contact_departments","contact_role_id":"party_contact_roles"}';
 when 'party_bank_details' then
  code_field:='bank_detail_code';required_field:='account_holder_name';refs:='{"bank_id":"banks","currency_id":"currencies","country_id":"countries"}';document_key:='verification_document_id';
 when 'party_licenses' then
  code_field:='license_code';required_field:='license_number';refs:='{"license_type_id":"party_license_types","license_status_id":"party_license_statuses","issuing_country_id":"countries","issuing_emirate_id":"emirates","issuing_authority_party_id":"parties"}';
  start_key:='issue_date';end_key:='expiry_date';document_key:='license_document_id';
 when 'party_tax_registrations' then
  code_field:='tax_registration_code';required_field:='tax_registration_number';refs:='{"tax_type_id":"tax_types","tax_status_id":"party_tax_statuses","tax_country_id":"countries"}';
  start_key:='effective_from';end_key:='effective_to';document_key:='certificate_document_id';
 when 'party_documents' then
  code_field:='document_code';required_field:='document_title';refs:='{"document_type_id":"party_document_types","document_status_id":"party_document_statuses","issuing_authority_party_id":"parties"}';start_key:='issue_date';end_key:='expiry_date';
 when 'party_notes' then
  code_field:='note_code';required_field:='note_body';refs:='{"note_type_id":"party_note_types"}';
 else raise exception 'Unsupported party child' using errcode='22023';
 end case;
 if TG_OP='UPDATE' and (n->'party_id' is distinct from o->'party_id' or n->code_field is distinct from o->code_field) then
  raise exception 'Child record identity is immutable' using errcode='22023';
 end if;
 if (TG_OP='INSERT' or n->required_field is distinct from o->required_field) and nullif(btrim(n->>required_field),'') is null then
  raise exception 'Required child field is missing' using errcode='23514';
 end if;
 for pair in select key,value from jsonb_each_text(refs) order by value,key loop
  if n->>pair.key is not null and (TG_OP='INSERT' or activated or n->pair.key is distinct from o->pair.key) then
   valid:=null;
   execute format('select is_active from public.%I where id=$1 for share',pair.value) into valid using (n->>pair.key)::bigint;
   if valid is distinct from true then raise exception 'Choose an active available reference' using errcode='23503';end if;
  end if;
 end loop;
 if start_key is not null and (TG_OP='INSERT' or n->start_key is distinct from o->start_key or n->end_key is distinct from o->end_key) then
  if (n->>start_key)::date>(n->>end_key)::date then raise exception 'End date cannot precede start date' using errcode='23514';end if;
 end if;
 if n?'renewal_notice_days' and (TG_OP='INSERT' or n->'renewal_notice_days' is distinct from o->'renewal_notice_days') and (n->>'renewal_notice_days')::integer<0 then
  raise exception 'Renewal notice days cannot be negative' using errcode='23514';
 end if;
 if TG_TABLE_NAME='party_documents' and (TG_OP='INSERT' or (n->'expiry_required',n->'expiry_date') is distinct from (o->'expiry_required',o->'expiry_date'))
  and n->>'expiry_required'='true' and n->>'expiry_date' is null then raise exception 'An expiry date is required' using errcode='23514';end if;
 if TG_TABLE_NAME='party_licenses' and (TG_OP='INSERT' or activated or (n->'issuing_country_id',n->'issuing_emirate_id') is distinct from (o->'issuing_country_id',o->'issuing_emirate_id')) and n->>'issuing_emirate_id' is not null then
  perform 1 from public.emirates where id=(n->>'issuing_emirate_id')::bigint and country_id=(n->>'issuing_country_id')::bigint for share;
  if not found then raise exception 'Choose the country belonging to this issuing region' using errcode='23514';end if;
 end if;
 if document_key is not null and n->>document_key is not null and (TG_OP='INSERT' or n->document_key is distinct from o->document_key) then
  perform 1 from public.party_documents where id=(n->>document_key)::bigint and party_id=new.party_id for share;
  if not found then raise exception 'Evidence must belong to the same party' using errcode='23503';end if;
 end if;
 if TG_TABLE_NAME='party_bank_details' and TG_OP='UPDATE' then
  foreach field in array array['bank_id','bank_name_text','account_holder_name','account_number','iban','swift_code','currency_id','branch_name','country_id'] loop
   if n->field is distinct from o->field then
    new.is_verified:=false;new.verified_by:=null;new.verified_at:=null;exit;
   end if;
  end loop;
 end if;
 return new;
end$$;
alter function erp_private.validate_party_child_relations() owner to postgres;
revoke all on function erp_private.validate_party_child_relations() from public,anon,authenticated,service_role;
do $$declare entity text;begin
 foreach entity in array array['party_contacts','party_bank_details','party_licenses','party_tax_registrations','party_documents','party_notes'] loop
  execute format('create trigger f06_child_relationship_lock before insert or update or delete on public.%I for each statement execute function erp_private.lock_party_relations()',entity);
  execute format('create trigger f06_child_relationships before insert or update on public.%I for each row execute function erp_private.validate_party_child_relations()',entity);
 end loop;
end$$;
-- No rows/backfills, numbering changes, role assignments or policy relaxation.
commit;
