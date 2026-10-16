begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- New reviews bind a concrete row/revision captured before generation. Do not
-- guess targets for historical suggestions: those must be generated/reviewed again.
alter table public.erp_ai_field_suggestions
 add column reviewed_target_id bigint,
 add column reviewed_target_revision bigint,
 add constraint f06_suggestion_target_pair check (
  (reviewed_target_id is null and reviewed_target_revision is null) or
  (reviewed_target_id>0 and reviewed_target_revision>0 and reviewed_target_id is not null and reviewed_target_revision is not null));

create function erp_private.guard_party_suggestion_target() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.entity_type='party' and old.target_table in ('party_licenses','party_tax_registrations')
  and (new.entity_type,new.entity_id,new.target_table,new.reviewed_target_id,new.reviewed_target_revision)
   is distinct from (old.entity_type,old.entity_id,old.target_table,old.reviewed_target_id,old.reviewed_target_revision) then
  raise exception 'Generate a new suggestion for a changed target' using errcode='PT409';
 end if;
 return new;
end$$;
revoke all on function erp_private.guard_party_suggestion_target() from public,anon,authenticated,service_role;
create trigger f06_party_suggestion_target before update on public.erp_ai_field_suggestions
 for each row execute function erp_private.guard_party_suggestion_target();

create function erp_private.apply_party_child_field_suggestion(p_suggestion bigint,p_accept_pending boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.erp_ai_field_suggestions%rowtype;parent public.parties%rowtype;doc public.dms_documents%rowtype;
 receipt erp_private.party_suggestion_applications%rowtype;
 target jsonb;field text;capability text;value text;old_value text;h text;changed boolean;result jsonb;actor bigint;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not (public.current_user_has_role('system_admin') or public.current_user_has_permission('ai.field_suggestions.apply') or public.current_user_has_permission('ai.common.admin'))
  or not (public.current_user_has_role('system_admin') or public.current_user_has_permission('master_data.parties.view')) then
  raise exception 'Party suggestion permission denied' using errcode='42501';
 end if;
 if p_suggestion is null or p_suggestion<1 then raise exception 'Invalid suggestion identity' using errcode='22023';end if;
 actor:=public.current_user_profile_id();
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 select * into s from public.erp_ai_field_suggestions where id=p_suggestion and deleted_at is null for update;
 if not found or s.entity_type<>'party' or s.target_table not in ('party_licenses','party_tax_registrations') then
  raise exception 'Party child suggestion unavailable' using errcode='PT404';end if;
 field:=case when s.target_table='party_tax_registrations' and s.target_field='trn' then 'tax_registration_number' else s.target_field end;
 capability:=case s.target_table when 'party_licenses' then 'master_data.parties.manage_licenses' else 'master_data.parties.manage_tax' end;
 if not (public.current_user_has_role('system_admin') or public.current_user_has_permission(capability)) then
  raise exception 'Child management permission denied' using errcode='42501';end if;
 if (s.target_table='party_licenses' and field not in ('license_number','expiry_date'))
  or (s.target_table='party_tax_registrations' and field<>'tax_registration_number')
  or s.field_type<>(case field when 'expiry_date' then 'date' else 'text' end) then
  raise exception 'Unsupported child suggestion field' using errcode='22023';end if;
 if s.reviewed_target_id is null or s.reviewed_target_revision is null then
  raise exception 'Generate and review a new suggestion with its target identity' using errcode='PT409';end if;
 select * into parent from public.parties where id=s.entity_id for update;
 if not found or not parent.is_active or parent.is_locked then raise exception 'Party unavailable or locked' using errcode='42501';end if;
 select * into doc from public.dms_documents where id=s.source_document_id and deleted_at is null and not is_archived for share;
 if not found or not erp_private.document_permission(s.source_document_id,'dms.documents.view')
  or not (coalesce(doc.party_id=parent.id,false) or exists(select 1 from public.dms_document_links l where l.document_id=doc.id and l.entity_type='party' and l.entity_id=parent.id and l.deleted_at is null)) then
  raise exception 'Source document unavailable or unrelated' using errcode='42501';end if;
 if s.source_file_id is not null and not exists(select 1 from public.dms_document_files where id=s.source_file_id and document_id=doc.id) then
  raise exception 'Source file does not belong to the reviewed document' using errcode='42501';end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and party_id=$2 for update',s.target_table)
  into target using s.reviewed_target_id,parent.id;
 if target is null then raise exception 'Reviewed child target unavailable' using errcode='PT404';end if;
 if not (target->>'is_active')::boolean or target->>'archived_at' is not null then
  raise exception 'Reviewed child target is retired' using errcode='PT409';end if;
 if s.status='pending' and p_accept_pending is true then
  s.status:='accepted';s.accepted_by:=actor;s.accepted_at:=clock_timestamp();
  update public.erp_ai_field_suggestions set status=s.status,accepted_by=s.accepted_by,accepted_at=s.accepted_at where id=s.id;
  insert into public.erp_ai_field_suggestion_events(suggestion_id,event_type,actor_user_id,event_data_json)
   values(s.id,'accepted',actor,jsonb_build_object('targetTable',s.target_table,'targetField',field,'batchOperation',true));
 end if;
 h:=encode(sha256(convert_to(jsonb_build_array(s.entity_id,s.target_table,s.target_field,s.field_type,s.reviewed_target_id,s.reviewed_target_revision,s.current_value,s.suggested_value,s.suggested_value_json,s.source_document_id,s.source_file_id,s.accepted_by,s.accepted_at)::text,'UTF8')),'hex');
 select * into receipt from erp_private.party_suggestion_applications where suggestion_id=s.id;
 if found then
  if receipt.request_hash<>h or receipt.party_id<>parent.id or s.status<>'applied' then raise exception 'Reviewed suggestion changed' using errcode='PT409';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if s.status<>'accepted' or s.accepted_by is null or s.accepted_at is null then raise exception 'Suggestion needs human acceptance' using errcode='PT409';end if;
 if (target->>'workspace_revision')::bigint<>s.reviewed_target_revision then raise exception 'Reviewed child changed' using errcode='PT409';end if;
 old_value:=nullif(btrim(target->>field),'');
 if old_value is distinct from nullif(btrim(s.current_value),'') then raise exception 'Child value changed since review' using errcode='PT409';end if;
 value:=btrim(s.suggested_value);
 if value is null or value='' or s.suggested_value_json is not null then raise exception 'Invalid suggested value' using errcode='22023';end if;
 if field='tax_registration_number' and value !~ '^[0-9]{15}$' then raise exception 'Expected a 15-digit TRN' using errcode='22023';end if;
 if field='license_number' and char_length(value)>100 then raise exception 'Licence number is too long' using errcode='22023';end if;
 if field='expiry_date' then
  if value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (value::date)::text<>value then raise exception 'Invalid expiry date' using errcode='22023';end if;
  if target->>'issue_date' is not null and value::date<(target->>'issue_date')::date then raise exception 'Expiry precedes issue date' using errcode='22023';end if;
 elsif old_value is not null and old_value is distinct from value then
  raise exception 'Existing registration identifier requires manual editing' using errcode='PT409';
 end if;
 changed:=(target->>field) is distinct from value;
 if changed then
  execute format('update public.%I set %I=$1%s,updated_by=$2 where id=$3 returning to_jsonb(%I)',s.target_table,field,case field when 'expiry_date' then '::date' else '' end,s.target_table)
   into target using value,actor,s.reviewed_target_id;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'MASTER_DATA',s.target_table,s.reviewed_target_id,parent.party_code,'update',jsonb_build_object('source','accepted_ai_suggestion','suggestion_id',s.id,'fields',jsonb_build_array(field),'revision',target->>'workspace_revision'));
 end if;
 update public.erp_ai_field_suggestions set status='applied',applied_by=actor,applied_at=clock_timestamp(),apply_error=null,updated_by=actor,updated_at=clock_timestamp() where id=s.id;
 insert into public.erp_ai_field_suggestion_events(suggestion_id,event_type,actor_user_id,event_data_json)
  values(s.id,'applied',actor,jsonb_build_object('targetTable',s.target_table,'targetField',field,'changed',changed,'revision',target->>'workspace_revision'));
 result:=jsonb_build_object('suggestionId',s.id,'partyId',parent.id,'targetTable',s.target_table,'targetId',s.reviewed_target_id,'field',field,'changed',changed,'revision',target->>'workspace_revision','replayed',false);
 insert into erp_private.party_suggestion_applications(suggestion_id,party_id,actor,request_hash,result) values(s.id,parent.id,actor,h,result);
 return result;
end$$;
alter function erp_private.apply_party_child_field_suggestion(bigint,boolean) owner to postgres;
revoke all on function erp_private.apply_party_child_field_suggestion(bigint,boolean) from public,anon,service_role;
grant execute on function erp_private.apply_party_child_field_suggestion(bigint,boolean) to authenticated;
create function public.apply_party_child_field_suggestion(p_suggestion bigint,p_accept_pending boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.apply_party_child_field_suggestion(p_suggestion,p_accept_pending);
$$;
revoke all on function public.apply_party_child_field_suggestion(bigint,boolean) from public,anon,service_role;
grant execute on function public.apply_party_child_field_suggestion(bigint,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
