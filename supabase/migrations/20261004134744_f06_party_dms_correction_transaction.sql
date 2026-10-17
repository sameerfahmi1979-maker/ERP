begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Preserve exact before-values for future reviews only. Never reconstruct old
-- values from truncated/masked history or today's record.
alter table erp_private.party_dms_reviews add column before_values jsonb;
create function erp_private.capture_party_dms_before_values() returns trigger
language plpgsql security invoker set search_path='' as $$
declare target jsonb;
begin
 if new.target_table not in ('party_licenses','party_tax_registrations') then raise exception 'Unsupported target' using errcode='22023';end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and party_id=$2 for update',new.target_table) into target using new.target_id,new.party_id;
 if target is null or (target->>'workspace_revision')::bigint<>new.revision then raise exception 'Reviewed target changed' using errcode='PT409';end if;
 select jsonb_object_agg(k,target->k) into new.before_values from jsonb_object_keys(new.fields) k;
 return new;
end$$;
alter function erp_private.capture_party_dms_before_values() owner to postgres;
revoke all on function erp_private.capture_party_dms_before_values() from public,anon,authenticated,service_role;
create trigger f06_capture_party_dms_before before insert on erp_private.party_dms_reviews for each row execute function erp_private.capture_party_dms_before_values();

create table erp_private.party_dms_corrections(
 proposal_id bigint primary key references public.dms_ai_erp_apply_correction_proposals(id),
 actor bigint not null references public.user_profiles(id),
 request_key uuid not null,
 request_hash text not null,
 run_id bigint not null unique references public.dms_ai_erp_apply_runs(id),
 unique(actor,request_key)
);
alter table erp_private.party_dms_corrections owner to postgres;
alter table erp_private.party_dms_corrections enable row level security;
revoke all on erp_private.party_dms_corrections from public,anon,authenticated,service_role;

create function erp_private.party_dms_correction_source(p_item bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item public.dms_ai_erp_apply_items%rowtype;run public.dms_ai_erp_apply_runs%rowtype;review erp_private.party_dms_reviews%rowtype;
 target jsonb;party bigint;current_value text;before_value text;applied_value text;
begin
 select * into item from public.dms_ai_erp_apply_items where id=p_item and status='applied' for share;
 if not found or item.target_table not in ('party_licenses','party_tax_registrations') then raise exception 'Applied party item unavailable' using errcode='PT404';end if;
 select * into run from public.dms_ai_erp_apply_runs where id=item.apply_run_id and target_module='party' and deleted_at is null and status in ('completed','completed_with_warnings') for share;
 if not found or run.target_table<>item.target_table then raise exception 'Applied party run unavailable' using errcode='PT404';end if;
 execute format('select party_id from public.%I where id=$1',item.target_table) into party using item.target_record_id;
 target:=erp_private.check_party_dms_authority(run.document_id,party,item.target_table,item.target_record_id);
 if (item.target_table='party_licenses' and item.target_field not in ('license_number','license_name','license_activity_text','issue_date','expiry_date','remarks')) or
 (item.target_table='party_tax_registrations' and item.target_field not in ('tax_registration_number','effective_from','effective_to','remarks')) then raise exception 'Unsupported correction field' using errcode='22023';end if;
 if not exists(select 1 from public.erp_ai_feature_flags where feature_code='DMS_AI_APPLY_CORRECTION_PROPOSALS' and is_enabled) or not
 (erp_private.document_permission(run.document_id,'dms.apply_correction.view') or erp_private.document_permission(run.document_id,'dms.apply_correction.create') or erp_private.document_permission(run.document_id,'dms.apply_correction.run') or erp_private.document_permission(run.document_id,'dms.admin')) then raise exception 'Correction access denied' using errcode='42501';end if;
 select * into review from erp_private.party_dms_reviews where run_id=run.id and target_table=item.target_table and target_id=item.target_record_id and applied_result is not null;
 before_value:=review.before_values->>item.target_field;applied_value:=review.fields->>item.target_field;current_value:=target->>item.target_field;
 return jsonb_build_object('originalApplyItemId',item.id,'originalApplyRunId',run.id,'documentId',run.document_id,'partyId',party,
 'targetModule','party','targetTable',item.target_table,'targetField',item.target_field,'targetRecordId',item.target_record_id,
 'targetDisplayLabel',item.target_display_label,'valueType',item.value_type,'reviewedRevision',target->>'workspace_revision',
 'originalBeforeSummary',item.current_value_summary,'originalAppliedSummary',item.applied_value_summary,
 'currentValueSummary',case when item.target_field='tax_registration_number' and current_value is not null then repeat('*',greatest(length(current_value)-4,0))||right(current_value,4) when length(current_value)>200 then left(current_value,197)||'...' else current_value end,
 'originalBeforeValue',before_value,'originalAppliedValue',applied_value,
 'restorePreviousEnabled',before_value is not null and exists(select 1 from public.erp_ai_feature_flags where feature_code='DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS' and is_enabled),
 'restorePreviousWarning',case when before_value is null then 'An exact non-empty previous value is unavailable. Enter a verified correction manually.' end,
 'reapplyAvailable',applied_value is not null);
end$$;
alter function erp_private.party_dms_correction_source(bigint) owner to postgres;
revoke all on function erp_private.party_dms_correction_source(bigint) from public,anon,authenticated,service_role;

-- The original source validator stays intact for all ordinary DMS reviews.
alter function erp_private.check_party_dms_source(text,bigint,bigint,bigint) rename to check_party_dms_standard_source;
create function erp_private.check_party_dms_source(p_kind text,p_source bigint,p_document bigint,p_party bigint) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_kind is distinct from 'correction_proposal' then perform erp_private.check_party_dms_standard_source(p_kind,p_source,p_document,p_party);return;end if;
 perform 1 from erp_private.party_dms_corrections c
 join public.dms_ai_erp_apply_correction_proposals p on p.id=c.proposal_id
 join public.dms_ai_erp_apply_items i on i.id=p.original_apply_item_id and i.apply_run_id=p.original_apply_run_id
 join public.dms_ai_erp_apply_runs r on r.id=i.apply_run_id
 join erp_private.party_dms_reviews v on v.run_id=c.run_id
 where p.id=p_source and p.document_id=p_document and v.party_id=p_party and i.status='applied' and r.deleted_at is null
 and r.status in ('completed','completed_with_warnings') and p.status='draft' and c.actor=public.current_user_profile_id() for share of p,i,r;
 if not found then raise exception 'Correction source unavailable' using errcode='PT409';end if;
 if not exists(select 1 from public.erp_ai_feature_flags where feature_code='DMS_AI_APPLY_CORRECTION_PROPOSALS' and is_enabled) or not
 (erp_private.document_permission(p_document,'dms.apply_correction.run') or erp_private.document_permission(p_document,'dms.admin')) then raise exception 'Correction execution denied' using errcode='42501';end if;
end$$;
alter function erp_private.check_party_dms_source(text,bigint,bigint,bigint) owner to postgres;
revoke all on function erp_private.check_party_dms_source(text,bigint,bigint,bigint) from public,anon,authenticated,service_role;

create function erp_private.party_dms_correction(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor_id bigint:=public.current_user_profile_id();src jsonb;proposal public.dms_ai_erp_apply_correction_proposals%rowtype;
 bound erp_private.party_dms_corrections%rowtype;request uuid;h text;result jsonb;prepared jsonb;val text;mode text;runid bigint;proposalid bigint;itemid bigint;summary text;ids jsonb;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() or actor_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_action is null or p_action not in ('source','prepare','apply','cancel') or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>32768 then raise exception 'Invalid correction request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 if p_action in ('source','prepare') then
  itemid:=(p_data->>'originalApplyItemId')::bigint;
 else
  proposalid:=(p_data->>'proposalId')::bigint;
  select * into proposal from public.dms_ai_erp_apply_correction_proposals where id=proposalid for update;
  if not found then raise exception 'Proposal unavailable' using errcode='PT404';end if;
  itemid:=proposal.original_apply_item_id;
 end if;
 src:=erp_private.party_dms_correction_source(itemid);
 if p_action='source' then return src;end if;
 if not (erp_private.document_permission((src->>'documentId')::bigint,case when p_action='apply' then 'dms.apply_correction.run' else 'dms.apply_correction.create' end) or erp_private.document_permission((src->>'documentId')::bigint,'dms.admin')) then raise exception 'Correction action denied' using errcode='42501';end if;
 if p_action='prepare' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('originalApplyItemId','requestId','snapshot','mode','value')) then raise exception 'Unexpected correction input' using errcode='22023';end if;
  request:=(p_data->>'requestId')::uuid;
  if request is null then raise exception 'Stable correction request required' using errcode='22023';end if;
  h:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
  select * into bound from erp_private.party_dms_corrections where actor=actor_id and request_key=request for update;
  if found then
   if bound.request_hash<>h then raise exception 'Correction request changed' using errcode='PT409';end if;
   return jsonb_build_object('proposalId',bound.proposal_id,'status','draft');
  end if;
  if exists(select 1 from unnest(array['originalApplyItemId','originalApplyRunId','documentId','targetModule','targetTable','targetField','targetRecordId','valueType','reviewedRevision']) k where (p_data->'snapshot'->k) is distinct from (src->k)) then raise exception 'Correction source changed or redirected' using errcode='PT409';end if;
  mode:=p_data->>'mode';
  if mode='manual' then val:=p_data->>'value';
  elsif mode='restore_previous' and src->'restorePreviousEnabled'='true'::jsonb then val:=src->>'originalBeforeValue';
  elsif mode='reapply_ai_value' and src->'reapplyAvailable'='true'::jsonb then val:=src->>'originalAppliedValue';
  else raise exception 'Exact correction value unavailable for this mode' using errcode='22023';end if;
  prepared:=erp_private.party_dms_apply_internal('prepare',jsonb_build_object('requestId',request,'documentId',src->'documentId','partyId',src->'partyId','targetTable',src->'targetTable','targetId',src->'targetRecordId','revision',src->'reviewedRevision','fields',jsonb_build_object(src->>'targetField',val),'sourceType','dms_metadata_apply','sourceId',null));
  runid:=(prepared->>'runId')::bigint;
  select proposed_value_summary into summary from public.dms_ai_erp_apply_items where apply_run_id=runid;
  insert into public.dms_ai_erp_apply_correction_proposals(proposal_code,original_apply_run_id,original_apply_item_id,document_id,target_module,target_table,target_field,target_record_id,value_type,original_before_summary,original_applied_summary,current_value_summary,proposed_correction_summary,correction_value_json,correction_mode,status,requested_by)
  values('CORR-'||request::text,(src->>'originalApplyRunId')::bigint,itemid,(src->>'documentId')::bigint,'party',src->>'targetTable',src->>'targetField',(src->>'targetRecordId')::bigint,src->>'valueType',src->>'originalBeforeSummary',src->>'originalAppliedSummary',src->>'currentValueSummary',summary,null,mode,'draft',actor_id) returning id into proposalid;
  insert into erp_private.party_dms_corrections(proposal_id,actor,request_key,request_hash,run_id) values(proposalid,actor_id,request,h,runid);
  update public.dms_ai_erp_apply_runs set source_type='correction_proposal',source_id=proposalid where id=runid;
  update public.dms_ai_erp_apply_items set source_type='correction_proposal',source_id=proposalid where apply_run_id=runid;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)
   values(actor_id,'dms_ai','dms_ai_erp_apply_correction_proposals',proposalid,'dms_apply_correction_proposal_created',jsonb_build_object('originalApplyItemId',itemid,'runId',runid,'mode',mode));
  return jsonb_build_object('proposalId',proposalid,'status','draft');
 end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('proposalId','humanReviewConfirmed','replaceExistingConfirmed')) then raise exception 'Unexpected correction confirmation' using errcode='22023';end if;
 select * into bound from erp_private.party_dms_corrections where proposal_id=proposalid for update;
 if not found then raise exception 'Historical proposal has no bound review. Create a new correction.' using errcode='PT409';end if;
 if bound.actor<>actor_id then raise exception 'Only the original reviewer may confirm this correction' using errcode='42501';end if;
 if p_action='cancel' then
  if proposal.status='cancelled' then return jsonb_build_object('proposalId',proposalid,'status','cancelled');end if;
  if proposal.status<>'draft' then raise exception 'Correction cannot be cancelled' using errcode='PT409';end if;
  perform erp_private.party_dms_apply_internal('cancel',jsonb_build_object('runId',bound.run_id));
  update public.dms_ai_erp_apply_correction_proposals set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp() where id=proposalid;
 else
  if proposal.status not in ('draft','applied') then raise exception 'Correction cannot be applied' using errcode='PT409';end if;
  select jsonb_agg(id order by id) into ids from public.dms_ai_erp_apply_items where apply_run_id=bound.run_id;
  result:=erp_private.party_dms_apply_internal('apply',jsonb_build_object('runId',bound.run_id,'confirmedItemIds',ids,'humanReviewConfirmed',p_data->'humanReviewConfirmed','replaceExistingConfirmed',p_data->'replaceExistingConfirmed'));
  if proposal.status='applied' then return jsonb_build_object('proposalId',proposalid,'status','applied');end if;
  update public.dms_ai_erp_apply_correction_proposals set status='applied',correction_apply_run_id=bound.run_id,confirmed_by=actor_id,applied_by=actor_id,confirmed_at=clock_timestamp(),applied_at=clock_timestamp(),updated_at=clock_timestamp() where id=proposalid;
 end if;
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)
 values(actor_id,'dms_ai','dms_ai_erp_apply_correction_proposals',proposalid,case when p_action='cancel' then 'dms_apply_correction_cancelled' else 'dms_apply_correction_applied' end,jsonb_build_object('runId',bound.run_id));
 return jsonb_build_object('proposalId',proposalid,'status',case when p_action='cancel' then 'cancelled' else 'applied' end);
end$$;
alter function erp_private.party_dms_correction(text,jsonb) owner to postgres;
revoke all on function erp_private.party_dms_correction(text,jsonb) from public,anon,service_role;
grant execute on function erp_private.party_dms_correction(text,jsonb) to authenticated;
create function public.party_dms_correction(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select erp_private.party_dms_correction(p_action,p_data);$$;
revoke all on function public.party_dms_correction(text,jsonb) from public,anon,service_role;
grant execute on function public.party_dms_correction(text,jsonb) to authenticated;

-- Corrections must finish their linked proposal and audit in the same call.
alter function erp_private.party_dms_apply(text,jsonb) rename to party_dms_apply_internal;
revoke all on function erp_private.party_dms_apply_internal(text,jsonb) from public,anon,authenticated,service_role;
create function erp_private.party_dms_apply(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Authentication required' using errcode='42501';end if;
 if p_action in ('apply','cancel') and exists(select 1 from public.dms_ai_erp_apply_runs where id=(p_data->>'runId')::bigint and source_type='correction_proposal') then raise exception 'Use the correction confirmation workflow' using errcode='42501';end if;
 return erp_private.party_dms_apply_internal(p_action,p_data);
end$$;
alter function erp_private.party_dms_apply(text,jsonb) owner to postgres;
revoke all on function erp_private.party_dms_apply(text,jsonb) from public,anon,service_role;
grant execute on function erp_private.party_dms_apply(text,jsonb) to authenticated;
create or replace function public.party_dms_apply(p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin return erp_private.party_dms_apply(p_action,p_data);end$$;
create policy f06_party_correction_insert on public.dms_ai_erp_apply_correction_proposals as restrictive for insert to authenticated with check(target_module<>'party' and target_table not in ('party_licenses','party_tax_registrations'));
create policy f06_party_correction_update on public.dms_ai_erp_apply_correction_proposals as restrictive for update to authenticated using(target_module<>'party' and target_table not in ('party_licenses','party_tax_registrations')) with check(target_module<>'party' and target_table not in ('party_licenses','party_tax_registrations'));
create policy f06_party_correction_delete on public.dms_ai_erp_apply_correction_proposals as restrictive for delete to authenticated using(target_module<>'party' and target_table not in ('party_licenses','party_tax_registrations'));
create policy f06_party_correction_read on public.dms_ai_erp_apply_correction_proposals as restrictive for select to authenticated using(target_module<>'party' or (exists(select 1 from public.dms_ai_erp_apply_items i where i.id=original_apply_item_id) and (public.current_user_has_role('system_admin') or public.current_user_has_permission('master_data.parties.view'))));
notify pgrst,'reload schema';
commit;
