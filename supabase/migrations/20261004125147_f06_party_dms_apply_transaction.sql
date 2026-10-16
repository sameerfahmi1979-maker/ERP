begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Full reviewed values are private. Public history contains display summaries
-- only. Historical runs are not silently rebound to today's record revision.
create table erp_private.party_dms_reviews (
 run_id bigint primary key references public.dms_ai_erp_apply_runs(id),
 actor bigint not null references public.user_profiles(id),
 request_key uuid not null,
 request_hash text not null,
 document_id bigint not null references public.dms_documents(id),
 party_id bigint not null references public.parties(id),
 target_table text not null check(target_table in ('party_licenses','party_tax_registrations')),
 target_id bigint not null,
 revision bigint not null check(revision>0),
 fields jsonb not null,
 prepared_result jsonb not null,
 confirmation_hash text,
 applied_result jsonb,
 unique(actor,request_key)
);
alter table erp_private.party_dms_reviews owner to postgres;
alter table erp_private.party_dms_reviews enable row level security;
revoke all on erp_private.party_dms_reviews from public,anon,authenticated,service_role;

create function erp_private.check_party_dms_authority(p_document bigint,p_party bigint,p_table text,p_child bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare doc public.dms_documents%rowtype; parent public.parties%rowtype; target jsonb;capability text;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Authentication required' using errcode='42501';end if;
 if p_table not in ('party_licenses','party_tax_registrations') or p_table is null then raise exception 'Unsupported party target' using errcode='22023';end if;
 capability:=case p_table when 'party_licenses' then 'master_data.parties.manage_licenses' else 'master_data.parties.manage_tax' end;
 if not (public.current_user_has_role('system_admin') or (public.current_user_has_permission('master_data.parties.view') and public.current_user_has_permission(capability))) then
  raise exception 'Global party read and child management required' using errcode='42501';end if;
 if not exists(select 1 from public.erp_ai_feature_flags where feature_code='DMS_AI_APPLY_TO_ERP' and is_enabled)
  or not exists(select 1 from public.erp_ai_feature_flags where feature_code='DMS_AI_APPLY_TO_ERP_PARTY' and is_enabled)
  or not exists(select 1 from public.erp_ai_feature_flags where feature_code=case p_table when 'party_licenses' then 'DMS_AI_APPLY_TO_ERP_PARTY_LICENSES' else 'DMS_AI_APPLY_TO_ERP_PARTY_TAX' end and is_enabled) then
  raise exception 'Party document apply is disabled' using errcode='42501';end if;
 select * into doc from public.dms_documents where id=p_document and deleted_at is null and not is_archived for share;
 if not found or not erp_private.document_permission(p_document,'dms.documents.view') or not
  (erp_private.document_permission(p_document,'dms.apply_to_erp.run') or erp_private.document_permission(p_document,'dms.apply_to_erp.admin') or erp_private.document_permission(p_document,'dms.admin')) then
  raise exception 'Source document access denied' using errcode='42501';end if;
 select * into parent from public.parties where id=p_party for update;
 if not found or not parent.is_active or parent.is_locked then raise exception 'Party unavailable or locked' using errcode='PT409';end if;
 if not (coalesce(doc.party_id=p_party,false) or exists(select 1 from public.dms_document_links where document_id=p_document and entity_type='party' and entity_id=p_party and deleted_at is null)) then
  raise exception 'Document is not linked to the party' using errcode='42501';end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and party_id=$2 for update',p_table) into target using p_child,p_party;
 if target is null then raise exception 'Selected target unavailable' using errcode='PT404';end if;
 if not (target->>'is_active')::boolean or target->>'archived_at' is not null then raise exception 'Selected target retired' using errcode='PT409';end if;
 return target;
end$$;
alter function erp_private.check_party_dms_authority(bigint,bigint,text,bigint) owner to postgres;
revoke all on function erp_private.check_party_dms_authority(bigint,bigint,text,bigint) from public,anon,authenticated,service_role;

-- Lock source evidence through first commit so a concurrent withdrawal cannot
-- race an accepted review. Completed receipts remain recoverable without a new write.
create function erp_private.check_party_dms_source(p_kind text,p_source bigint,p_document bigint,p_party bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_kind is null or p_kind not in ('extraction_result','validation_finding','entity_match_candidate','dms_metadata_apply') then raise exception 'Invalid source type' using errcode='22023';end if;
 if p_source is null then return;end if;
 if p_kind='extraction_result' then
  perform 1 from public.dms_ai_extraction_results where id=p_source and document_id=p_document
   and ai_status in ('pending_review','accepted','partially_accepted') and coalesce(review_action,'') not in ('rejected','dismissed') for share;
 elsif p_kind='entity_match_candidate' then
  perform 1 from public.dms_ai_entity_match_candidates where id=p_source and document_id=p_document and target_entity_type='party' and target_entity_id=p_party and status='accepted' and deleted_at is null for share;
 elsif p_kind='validation_finding' then
  perform 1 from public.dms_ai_validation_findings where id=p_source and document_id=p_document and status in ('open','reviewed') and deleted_at is null for share;
 else raise exception 'Unsupported source identity' using errcode='22023';end if;
 if not found then raise exception 'Source evidence unavailable for this document and party' using errcode='42501';end if;
end$$;
alter function erp_private.check_party_dms_source(text,bigint,bigint,bigint) owner to postgres;
revoke all on function erp_private.check_party_dms_source(text,bigint,bigint,bigint) from public,anon,authenticated,service_role;

create function erp_private.party_dms_apply(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<operation>>
declare
 actor_id bigint:=public.current_user_profile_id();review erp_private.party_dms_reviews%rowtype;
 run public.dms_ai_erp_apply_runs%rowtype;item public.dms_ai_erp_apply_items%rowtype;
 target jsonb;next_target jsonb;fields jsonb;entry record;request uuid;h text;result jsonb;items_result jsonb:='[]';
 doc_id bigint;party bigint;kind text;child bigint;revision bigint;source_kind text;source_id bigint;
 field text;value text;old_value text;maxlen integer;isdate boolean;run_id bigint;run_code text;item_id bigint;
 ids bigint[];all_ids bigint[];item_ids bigint[]:='{}';applied integer:=0;skipped integer:=0;changed boolean:=false;sets text:='';
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() or actor_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_action not in ('prepare','apply','cancel') or p_action is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>32768 then
  raise exception 'Invalid reviewed operation' using errcode='22023';end if;
 -- Keep the same lock order as party edit/lifecycle/AI transactions.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 if p_action='prepare' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('requestId','documentId','partyId','targetTable','targetId','revision','fields','sourceType','sourceId')) then raise exception 'Unexpected review field' using errcode='22023';end if;
  request:=(p_data->>'requestId')::uuid;doc_id:=(p_data->>'documentId')::bigint;party:=(p_data->>'partyId')::bigint;kind:=p_data->>'targetTable';child:=(p_data->>'targetId')::bigint;revision:=(p_data->>'revision')::bigint;
  if request is null or doc_id is null or doc_id<1 or party is null or party<1 or child is null or child<1 or revision is null or revision<1 then raise exception 'Invalid review identity' using errcode='22023';end if;
  target:=erp_private.check_party_dms_authority(doc_id,party,kind,child);
  h:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
  select * into review from erp_private.party_dms_reviews where actor=actor_id and request_key=request for update;
  if found then
   if review.request_hash<>h then raise exception 'Request identity reused for different review' using errcode='PT409';end if;
   return review.prepared_result;
  end if;
  if revision<>(target->>'workspace_revision')::bigint then raise exception 'Selected record changed before review' using errcode='PT409';end if;
  source_kind:=p_data->>'sourceType';source_id:=(p_data->>'sourceId')::bigint;
  perform erp_private.check_party_dms_source(source_kind,source_id,doc_id,party);
  fields:=p_data->'fields';
  if jsonb_typeof(fields) is distinct from 'object' or fields='{}'::jsonb then raise exception 'Select reviewed fields' using errcode='22023';end if;
  for entry in select * from jsonb_each(fields) loop
   field:=entry.key;value:=btrim(fields->>field);isdate:=field in ('issue_date','expiry_date','effective_from','effective_to');
   if (kind='party_licenses' and field not in ('license_number','license_name','license_activity_text','issue_date','expiry_date','remarks')) or
      (kind='party_tax_registrations' and field not in ('tax_registration_number','effective_from','effective_to','remarks')) or jsonb_typeof(entry.value)<>'string' or value is null or value='' then
    raise exception 'Unsupported or empty reviewed value' using errcode='22023';end if;
   maxlen:=case field when 'license_number' then 100 when 'license_name' then 300 when 'license_activity_text' then 500 when 'remarks' then 1000 when 'tax_registration_number' then 15 else 10 end;
   if char_length(value)>maxlen then raise exception 'Reviewed value exceeds field limit' using errcode='22023';end if;
   if isdate and (value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (value::date)::text<>value) then raise exception 'Invalid reviewed date' using errcode='22023';end if;
   if field='tax_registration_number' and value !~ '^[0-9]{15}$' then raise exception 'Expected a 15 digit registration' using errcode='22023';end if;
   fields:=jsonb_set(fields,array[field],to_jsonb(value));
  end loop;
  next_target:=target||fields;
  if (next_target->>'issue_date')::date>(next_target->>'expiry_date')::date or (next_target->>'effective_from')::date>(next_target->>'effective_to')::date then raise exception 'Reviewed dates are reversed' using errcode='22023';end if;
  run_code:='APPLY-'||request::text;
  insert into public.dms_ai_erp_apply_runs(run_code,source_type,source_id,document_id,status,target_module,target_table,target_record_id,requested_by)
   values(run_code,source_kind,source_id,doc_id,'pending','party',kind,party,actor_id) returning id into run_id;
  for entry in select * from jsonb_each_text(fields) order by key loop
   field:=entry.key;value:=entry.value;old_value:=target->>field;
   insert into public.dms_ai_erp_apply_items(apply_run_id,source_type,source_id,source_field_code,target_table,target_field,target_record_id,target_display_label,current_value_summary,proposed_value_summary,value_type,status,requires_confirmation,confirmed)
    values(run_id,source_kind,source_id,field,kind,field,child,replace(initcap(replace(field,'_',' ')),'Tax Registration Number','Tax Registration Number'),
     case when field='tax_registration_number' and old_value is not null then repeat('*',greatest(length(old_value)-4,0))||right(old_value,4) when length(old_value)>200 then left(old_value,197)||'...' else old_value end,
     case when field='tax_registration_number' then repeat('*',greatest(length(value)-4,0))||right(value,4) when length(value)>200 then left(value,197)||'...' else value end,
     case when field in ('issue_date','expiry_date','effective_from','effective_to') then 'date' else 'text' end,'proposed',true,false) returning id into item_id;
   item_ids:=array_append(item_ids,item_id);
  end loop;
  result:=jsonb_build_object('runId',run_id,'runCode',run_code);
  insert into erp_private.party_dms_reviews(run_id,actor,request_key,request_hash,document_id,party_id,target_table,target_id,revision,fields,prepared_result)
   values(run_id,actor_id,request,h,doc_id,party,kind,child,revision,fields,result);
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)
   values(actor_id,'dms_ai','dms_ai_erp_apply_runs',run_id,'dms_apply_to_erp_run_created',jsonb_build_object('partyId',party,'targetId',child,'revision',revision,'itemCount',cardinality(item_ids)));
  return result;
 end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('runId','confirmedItemIds','humanReviewConfirmed','replaceExistingConfirmed')) then raise exception 'Unexpected confirmation field' using errcode='22023';end if;
 run_id:=(p_data->>'runId')::bigint;
 select * into review from erp_private.party_dms_reviews where party_dms_reviews.run_id=operation.run_id for update;
 if not found then raise exception 'Create a new reviewed run; historical review has no bound target' using errcode='PT409';end if;
 target:=erp_private.check_party_dms_authority(review.document_id,review.party_id,review.target_table,review.target_id);
 if review.actor<>actor_id then raise exception 'Only the reviewer can execute this review' using errcode='42501';end if;
 select * into run from public.dms_ai_erp_apply_runs where id=run_id and deleted_at is null for update;
 if not found or run.target_module<>'party' or run.document_id<>review.document_id or run.target_record_id<>review.party_id or run.target_table<>review.target_table then raise exception 'Run changed or unavailable' using errcode='PT409';end if;
 if p_action='cancel' then
  if run.status='cancelled' then return jsonb_build_object('cancelled',true);end if;
  if run.status<>'pending' then raise exception 'Completed review cannot be cancelled' using errcode='PT409';end if;
  update public.dms_ai_erp_apply_runs set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp() where id=run_id;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values) values(actor_id,'dms_ai','dms_ai_erp_apply_runs',run_id,'dms_apply_to_erp_run_cancelled','{}');
  return jsonb_build_object('cancelled',true);
 end if;
 if p_data->'humanReviewConfirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_data->'replaceExistingConfirmed') is distinct from 'boolean' or jsonb_typeof(p_data->'confirmedItemIds') is distinct from 'array' then raise exception 'Explicit human confirmation required' using errcode='22023';end if;
 select array_agg(v::bigint order by v::bigint) into ids from jsonb_array_elements_text(p_data->'confirmedItemIds') v;
 select array_agg(id order by id) into all_ids from public.dms_ai_erp_apply_items where apply_run_id=run_id;
 if coalesce(cardinality(ids),0)=0 or not ids<@all_ids or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then raise exception 'Invalid confirmed item selection' using errcode='22023';end if;
 h:=encode(sha256(convert_to(jsonb_build_array(ids,p_data->'replaceExistingConfirmed')::text,'UTF8')),'hex');
 if review.applied_result is not null then
  if review.confirmation_hash<>h or run.status not in ('completed','completed_with_warnings') then raise exception 'Confirmation changed after apply' using errcode='PT409';end if;
  return review.applied_result;
 end if;
 if run.status<>'pending' or review.revision<>(target->>'workspace_revision')::bigint then raise exception 'Reviewed record changed or run unavailable' using errcode='PT409';end if;
 perform erp_private.check_party_dms_source(run.source_type,run.source_id,review.document_id,review.party_id);
 next_target:=target;
 for item in select * from public.dms_ai_erp_apply_items where apply_run_id=run_id order by id for update loop
  if item.target_table<>review.target_table or item.target_record_id<>review.target_id or not review.fields ? item.target_field then raise exception 'Review item changed' using errcode='PT409';end if;
  if item.id=any(ids) then
   value:=review.fields->>item.target_field;old_value:=target->>item.target_field;
   if old_value is distinct from value and nullif(btrim(old_value),'') is not null and p_data->'replaceExistingConfirmed'<>'true'::jsonb then raise exception 'Confirm replacement of existing values' using errcode='PT409';end if;
   next_target:=jsonb_set(next_target,array[item.target_field],to_jsonb(value));
   if old_value is distinct from value then
    changed:=true;sets:=sets||case when sets='' then '' else ',' end||format('%I=($1->>%L)%s',item.target_field,item.target_field,case when item.value_type='date' then '::date' else '' end);
   end if;
   update public.dms_ai_erp_apply_items set status='applied',confirmed=true,applied_by=actor_id,applied_at=clock_timestamp(),applied_value_summary=proposed_value_summary,updated_at=clock_timestamp() where id=item.id;
   applied:=applied+1;
  else
   update public.dms_ai_erp_apply_items set status='skipped',skip_reason='Not selected by reviewer',updated_at=clock_timestamp() where id=item.id;skipped:=skipped+1;
  end if;
  items_result:=items_result||jsonb_build_array(jsonb_build_object('itemId',item.id,'targetTable',item.target_table,'targetField',item.target_field,'targetRecordId',item.target_record_id,'status',case when item.id=any(ids) then 'applied' else 'skipped' end,'appliedValueSummary',case when item.id=any(ids) then item.proposed_value_summary end,'skipReason',case when not item.id=any(ids) then 'Not selected by reviewer' end,'failureReason',null));
 end loop;
 if (next_target->>'issue_date')::date>(next_target->>'expiry_date')::date or (next_target->>'effective_from')::date>(next_target->>'effective_to')::date then raise exception 'Confirmed dates are reversed' using errcode='22023';end if;
 if changed then
  execute format('update public.%I set %s,updated_by=$2 where id=$3',review.target_table,sets) using next_target,actor_id,review.target_id;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)
   values(actor_id,'MASTER_DATA',review.target_table,review.target_id,'update',jsonb_build_object('source','reviewed_dms_run','runId',run_id,'itemCount',applied,'revision',review.revision+1));
 end if;
 update public.dms_ai_erp_apply_runs set status=case when skipped=0 then 'completed' else 'completed_with_warnings' end,confirmed_by=actor_id,started_at=clock_timestamp(),completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=run_id;
 result:=jsonb_build_object('runId',run_id,'runCode',run.run_code,'status',case when skipped=0 then 'completed' else 'completed_with_warnings' end,'appliedCount',applied,'skippedCount',skipped,'conflictCount',0,'failedCount',0,'items',items_result,'errorMessage',null);
 update erp_private.party_dms_reviews set confirmation_hash=h,applied_result=result where party_dms_reviews.run_id=operation.run_id;
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values) values(actor_id,'dms_ai','dms_ai_erp_apply_runs',run_id,'dms_apply_to_erp_run_completed',jsonb_build_object('appliedCount',applied,'skippedCount',skipped,'changed',changed));
 return result;
end$$;
alter function erp_private.party_dms_apply(text,jsonb) owner to postgres;
revoke all on function erp_private.party_dms_apply(text,jsonb) from public,anon,service_role;
grant execute on function erp_private.party_dms_apply(text,jsonb) to authenticated;
create function public.party_dms_apply(p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select erp_private.party_dms_apply(p_action,p_data);$$;
revoke all on function public.party_dms_apply(text,jsonb) from public,anon,service_role;
grant execute on function public.party_dms_apply(text,jsonb) to authenticated;

-- Stop direct API edits of the reviewed party history, but retain non-party
-- DMS workflows. Postgres-owned transactions above bypass these restrictions.
create policy f06_party_review_insert on public.dms_ai_erp_apply_runs as restrictive for insert to authenticated with check(target_module<>'party' and target_table not in ('party_licenses','party_tax_registrations'));
create policy f06_party_review_update on public.dms_ai_erp_apply_runs as restrictive for update to authenticated using(target_module<>'party' and target_table not in ('party_licenses','party_tax_registrations')) with check(target_module<>'party' and target_table not in ('party_licenses','party_tax_registrations'));
create policy f06_party_review_delete on public.dms_ai_erp_apply_runs as restrictive for delete to authenticated using(target_module<>'party' and target_table not in ('party_licenses','party_tax_registrations'));
create policy f06_party_review_read on public.dms_ai_erp_apply_runs as restrictive for select to authenticated using(target_module<>'party' or public.current_user_has_role('system_admin') or public.current_user_has_permission('master_data.parties.view'));
create policy f06_party_review_item_insert on public.dms_ai_erp_apply_items as restrictive for insert to authenticated with check(target_table not in ('party_licenses','party_tax_registrations') and exists(select 1 from public.dms_ai_erp_apply_runs r where r.id=apply_run_id and r.target_module<>'party'));
create policy f06_party_review_item_update on public.dms_ai_erp_apply_items as restrictive for update to authenticated using(target_table not in ('party_licenses','party_tax_registrations') and exists(select 1 from public.dms_ai_erp_apply_runs r where r.id=apply_run_id and r.target_module<>'party')) with check(target_table not in ('party_licenses','party_tax_registrations') and exists(select 1 from public.dms_ai_erp_apply_runs r where r.id=apply_run_id and r.target_module<>'party'));
create policy f06_party_review_item_delete on public.dms_ai_erp_apply_items as restrictive for delete to authenticated using(target_table not in ('party_licenses','party_tax_registrations') and exists(select 1 from public.dms_ai_erp_apply_runs r where r.id=apply_run_id and r.target_module<>'party'));
create policy f06_review_item_document_read on public.dms_ai_erp_apply_items as restrictive for select to authenticated using(exists(select 1 from public.dms_ai_erp_apply_runs r where r.id=apply_run_id));
notify pgrst,'reload schema';
commit;
