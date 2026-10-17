begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Forward-only authority fix; retain the accepted company application body.
create or replace function erp_private.apply_company_field_suggestions(p_company bigint,p_suggestions bigint[],p_accept_pending boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.erp_ai_field_suggestions%rowtype;company public.owner_companies%rowtype;
 receipt erp_private.company_suggestion_applications%rowtype;doc public.dms_documents%rowtype;
 actor bigint;field text;value text;old_value text;h text;limit_length integer;
 patch jsonb:='{}';results jsonb:='[]';item jsonb;changes jsonb:='{}';new_ids bigint[]:='{}';
 assignments text;batch_changed boolean:=false;changed boolean;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not (erp_private.permission_in_scope('ai.field_suggestions.apply',null,null) or erp_private.permission_in_scope('ai.common.admin',null,null))
  or not erp_private.permission_in_scope('organizations.view',p_company,null)
  or not erp_private.permission_in_scope('organizations.manage',p_company,null) then
  raise exception 'Company suggestion permission denied' using errcode='42501';end if;
 if p_company is null or p_company<1 or p_suggestions is null or cardinality(p_suggestions) not between 1 and 50
  or exists(select 1 from unnest(p_suggestions) i where i is null or i<1 or i>9007199254740991)
  or (select count(distinct i) from unnest(p_suggestions) i)<>cardinality(p_suggestions) then
  raise exception 'Invalid company suggestion identities' using errcode='22023';end if;
 actor:=public.current_user_profile_id();
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
 perform 1 from public.erp_ai_field_suggestions where id=any(p_suggestions) order by id for update;
 if (select count(*) from public.erp_ai_field_suggestions where id=any(p_suggestions) and deleted_at is null
   and entity_type='company' and entity_id=p_company and target_table='owner_companies')<>cardinality(p_suggestions) then
  raise exception 'Company suggestion unavailable' using errcode='PT404';end if;
 select * into company from public.owner_companies where id=p_company for no key update;
 if not found then raise exception 'Company unavailable' using errcode='PT404';end if;
 -- Recheck after lock waits; revoked authority must not survive admission.
 if not erp_private.business_principal_is_active()
  or not (erp_private.permission_in_scope('ai.field_suggestions.apply',null,null) or erp_private.permission_in_scope('ai.common.admin',null,null))
  or not erp_private.permission_in_scope('organizations.view',p_company,null)
  or not erp_private.permission_in_scope('organizations.manage',p_company,null) then
  raise exception 'Company suggestion permission denied' using errcode='42501';end if;

 for s in select * from public.erp_ai_field_suggestions where id=any(p_suggestions) order by id loop
  field:=s.target_field;
  if field not in ('trade_name','main_activity','established_date','office_address_line_1','office_address_line_2')
   or s.field_type<>(case field when 'established_date' then 'date' else 'text' end) then
   raise exception 'Unsupported company suggestion field' using errcode='22023';end if;
  if s.reviewed_target_id is distinct from p_company or s.reviewed_target_revision is null then
   raise exception 'Generate and review a company suggestion with its revision' using errcode='PT409';end if;
  -- Recheck the current source and its exact link, including on receipt replay.
  -- No document text is read or returned by this transaction.
  select * into doc from public.dms_documents where id=s.source_document_id and deleted_at is null and not is_archived for share;
  if not found or not erp_private.document_permission(doc.id,'dms.documents.view') then
   raise exception 'Source document unavailable' using errcode='42501';end if;
  perform 1 from public.dms_document_links where document_id=doc.id and entity_type='company' and entity_id=p_company and deleted_at is null for share;
  if not found then raise exception 'Source document is unrelated' using errcode='42501';end if;
  if s.source_file_id is not null then
   perform 1 from public.dms_document_files where id=s.source_file_id and document_id=doc.id and deleted_at is null for share;
   if not found then raise exception 'Source file is unrelated' using errcode='42501';end if;
  end if;
  h:=encode(sha256(convert_to(jsonb_build_array(s.entity_id,s.target_table,s.target_field,s.field_type,s.reviewed_target_id,s.reviewed_target_revision,
   s.current_value,s.suggested_value,s.suggested_value_json,s.source_document_id,s.source_file_id,s.accepted_by,s.accepted_at)::text,'UTF8')),'hex');
  select * into receipt from erp_private.company_suggestion_applications where suggestion_id=s.id;
  if found then
   if receipt.company_id<>p_company or receipt.request_hash<>h or s.status<>'applied' then
    raise exception 'Reviewed company suggestion changed' using errcode='PT409';end if;
   results:=results||jsonb_build_array(receipt.result||jsonb_build_object('replayed',true));continue;
  end if;
  if not (s.status='pending' and p_accept_pending is true) and
   (s.status<>'accepted' or s.accepted_by is null or s.accepted_at is null) then
   raise exception 'Company suggestion needs human acceptance' using errcode='PT409';end if;
  if company.workspace_revision<>s.reviewed_target_revision then raise exception 'Reviewed company changed' using errcode='PT409';end if;
  old_value:=to_jsonb(company)->>field;
  if old_value is distinct from s.current_value then raise exception 'Company value changed since review' using errcode='PT409';end if;
  -- The current AI registry allows 255 for office-address fields even though
  -- manual company forms permit 500. Preserve that reviewed AI field contract.
  value:=btrim(s.suggested_value);limit_length:=case field when 'main_activity' then 500 when 'established_date' then 10 else 255 end;
  if value is null or value='' or char_length(value)>limit_length or s.suggested_value_json is not null then
   raise exception 'Invalid company suggested value' using errcode='22023';end if;
  if field='established_date' then
   if value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not isfinite(value::date) or to_char(value::date,'YYYY-MM-DD')<>value then
    raise exception 'Invalid establishment date' using errcode='22023';end if;
   if nullif(btrim(old_value),'') is not null and old_value is distinct from value then
    raise exception 'Existing establishment date requires manual editing' using errcode='PT409';end if;
  end if;
  if patch?field then raise exception 'Select only one company suggestion per field' using errcode='22023';end if;
  changed:=old_value is distinct from value;batch_changed:=batch_changed or changed;
  patch:=patch||jsonb_build_object(field,value);changes:=changes||jsonb_build_object(s.id::text,changed);new_ids:=array_append(new_ids,s.id);
 end loop;
 -- Every source row/link/file lock is now held. Capability or source-role
 -- revocation during any of those waits must also invalidate receipt replay.
 if not erp_private.business_principal_is_active()
  or not (erp_private.permission_in_scope('ai.field_suggestions.apply',null,null) or erp_private.permission_in_scope('ai.common.admin',null,null))
  or not erp_private.permission_in_scope('organizations.view',p_company,null)
  or not erp_private.permission_in_scope('organizations.manage',p_company,null) then
  raise exception 'Company suggestion permission denied' using errcode='42501';end if;
 for s in select * from public.erp_ai_field_suggestions where id=any(p_suggestions) order by id loop
  if not erp_private.document_permission(s.source_document_id,'dms.documents.view') then
   raise exception 'Source document unavailable' using errcode='42501';end if;
 end loop;
 if batch_changed then
  select string_agg(format('%I=v.%I',k,k),',') into assignments from jsonb_object_keys(patch) k;
  execute format('update public.owner_companies c set %s,updated_by=$2 from jsonb_populate_record(null::public.owner_companies,$1) v where c.id=$3 returning c.*',assignments)
   into company using patch,actor,p_company;
 end if;
 for s in select * from public.erp_ai_field_suggestions where id=any(new_ids) order by id loop
  if s.status='pending' then
   update public.erp_ai_field_suggestions set status='accepted',accepted_by=actor,accepted_at=clock_timestamp(),updated_by=actor where id=s.id returning * into s;
   insert into public.erp_ai_field_suggestion_events(suggestion_id,event_type,actor_user_id,event_data_json)
    values(s.id,'accepted',actor,jsonb_build_object('targetTable','owner_companies','targetField',s.target_field,'batchOperation',true));
  end if;
  h:=encode(sha256(convert_to(jsonb_build_array(s.entity_id,s.target_table,s.target_field,s.field_type,s.reviewed_target_id,s.reviewed_target_revision,
   s.current_value,s.suggested_value,s.suggested_value_json,s.source_document_id,s.source_file_id,s.accepted_by,s.accepted_at)::text,'UTF8')),'hex');
  changed:=(changes->>s.id::text)::boolean;
  if changed then
   insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
    values(actor,p_company,'organizations','owner_companies',p_company,company.company_code,'update',
     jsonb_build_object('source','accepted_ai_suggestion','suggestion_id',s.id,'fields',jsonb_build_array(s.target_field),'revision',company.workspace_revision::text));
  end if;
  update public.erp_ai_field_suggestions set status='applied',applied_by=actor,applied_at=clock_timestamp(),apply_error=null,updated_by=actor,updated_at=clock_timestamp() where id=s.id;
  insert into public.erp_ai_field_suggestion_events(suggestion_id,event_type,actor_user_id,event_data_json)
   values(s.id,'applied',actor,jsonb_build_object('targetTable','owner_companies','targetField',s.target_field,'changed',changed,'revision',company.workspace_revision::text));
  item:=jsonb_build_object('suggestionId',s.id,'companyId',p_company,'field',s.target_field,'changed',changed,'revision',company.workspace_revision::text,'replayed',false);
  insert into erp_private.company_suggestion_applications(suggestion_id,company_id,actor,request_hash,result) values(s.id,p_company,actor,h,item);
  results:=results||jsonb_build_array(item);
 end loop;
 return results;
end$$;
alter function erp_private.apply_company_field_suggestions(bigint,bigint[],boolean) owner to postgres;
revoke all on function erp_private.apply_company_field_suggestions(bigint,bigint[],boolean) from public,anon,service_role;
grant execute on function erp_private.apply_company_field_suggestions(bigint,bigint[],boolean) to authenticated;
notify pgrst,'reload schema';
commit;
