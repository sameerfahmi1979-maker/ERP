begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create table erp_private.party_suggestion_applications (
 suggestion_id bigint primary key references public.erp_ai_field_suggestions(id),
 party_id bigint not null references public.parties(id),
 actor bigint not null references public.user_profiles(id),
 request_hash text not null,
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table erp_private.party_suggestion_applications owner to postgres;
alter table erp_private.party_suggestion_applications enable row level security;
revoke all on erp_private.party_suggestion_applications from public,anon,authenticated,service_role;

-- An accepted suggestion is the stable operation identity. The input comes
-- from its locked persisted review, never client-supplied AI output or actor.
create function erp_private.apply_party_field_suggestion(p_suggestion bigint,p_accept_pending boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.erp_ai_field_suggestions%rowtype;party public.parties%rowtype;
 receipt erp_private.party_suggestion_applications%rowtype;
 field text;value text;old_value text;limit_length integer;h text;changed boolean;result jsonb;actor bigint;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not (public.current_user_has_role('system_admin') or public.current_user_has_permission('ai.field_suggestions.apply') or public.current_user_has_permission('ai.common.admin'))
  or not (public.current_user_has_role('system_admin') or public.current_user_has_permission('master_data.parties.view') or public.current_user_has_permission('master_data.party_master.view'))
  or not (public.current_user_has_role('system_admin') or public.current_user_has_permission('master_data.parties.edit') or public.current_user_has_permission('master_data.party_master.manage')) then
  raise exception 'Party suggestion permission denied' using errcode='42501';
 end if;
 if p_suggestion is null or p_suggestion<1 then raise exception 'Invalid suggestion identity' using errcode='22023';end if;
 actor:=public.current_user_profile_id();
 -- Identical order to the party save/type paths. No audit/status writer is
 -- allowed to make the successful business change only partially observable.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 select * into s from public.erp_ai_field_suggestions where id=p_suggestion and deleted_at is null for update;
 if not found or s.entity_type<>'party' or s.target_table<>'parties' then raise exception 'Party suggestion unavailable' using errcode='PT404';end if;
 select * into party from public.parties where id=s.entity_id for update;
 if not found then raise exception 'Party unavailable' using errcode='PT404';end if;
 if party.is_locked and not public.current_user_has_role('system_admin') then raise exception 'Party locked' using errcode='42501';end if;
 field:=case s.target_field when 'primary_email' then 'main_email' when 'primary_phone' then 'main_phone' else s.target_field end;
 if field not in ('display_name','legal_name_en','legal_name_ar','main_email','main_phone','website') or s.field_type<>'text' then
  raise exception 'Unsupported party suggestion field' using errcode='22023';
 end if;
 -- Batch accept-and-apply is an explicit user action, not AI auto-application.
 -- Keep its pending -> accepted transition in this transaction too, preventing
 -- a concurrent stale acceptance from resetting an already-applied review.
 if s.status='pending' and p_accept_pending is true then
  s.status:='accepted';s.accepted_by:=actor;s.accepted_at:=clock_timestamp();
  update public.erp_ai_field_suggestions set status=s.status,accepted_by=s.accepted_by,accepted_at=s.accepted_at where id=s.id;
  insert into public.erp_ai_field_suggestion_events(suggestion_id,event_type,actor_user_id,event_data_json)
   values(s.id,'accepted',actor,jsonb_build_object('targetTable','parties','targetField',field,'batchOperation',true));
 end if;
 h:=encode(sha256(convert_to(jsonb_build_array(s.entity_id,s.target_table,s.target_field,s.field_type,s.current_value,s.suggested_value,s.suggested_value_json,s.accepted_by,s.accepted_at)::text,'UTF8')),'hex');
 select * into receipt from erp_private.party_suggestion_applications where suggestion_id=p_suggestion;
 if found then
  if receipt.request_hash<>h or receipt.party_id<>party.id or s.status<>'applied' then raise exception 'Reviewed suggestion changed' using errcode='PT409';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if s.status<>'accepted' or s.accepted_by is null or s.accepted_at is null then
  raise exception 'Suggestion needs human acceptance' using errcode='PT409';
 end if;
 value:=btrim(s.suggested_value);
 limit_length:=case field when 'website' then 500 when 'main_phone' then 50 else 255 end;
 if value is null or value='' or char_length(value)>limit_length or s.suggested_value_json is not null then
  raise exception 'Invalid suggested value' using errcode='22023';
 end if;
 if field='main_email' then
  value:=lower(value);
  if value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid suggested email' using errcode='22023';end if;
 end if;
 if field='website' and value !~* '^https?://[^[:space:]]+$' then raise exception 'Invalid suggested website' using errcode='22023';end if;
 old_value:=nullif(btrim(to_jsonb(party)->>field),'');
 if old_value is distinct from nullif(btrim(s.current_value),'') then
  raise exception 'Party value changed since review' using errcode='PT409';
 end if;
 -- Email/phone registrations explicitly disallow replacing a populated value.
 if field in ('main_email','main_phone') and old_value is not null and old_value is distinct from value then
  raise exception 'Existing contact value requires manual editing' using errcode='PT409';
 end if;
 changed:=(to_jsonb(party)->>field) is distinct from value;
 if changed then
  execute format('update public.parties set %I=$1,updated_by=$2 where id=$3 returning *',field) into party using value,actor,party.id;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'MASTER_DATA','parties',party.id,party.party_code,'update',
    jsonb_build_object('source','accepted_ai_suggestion','suggestion_id',s.id,'fields',jsonb_build_array(field),'revision',party.workspace_revision::text));
 end if;
 update public.erp_ai_field_suggestions set status='applied',applied_by=actor,applied_at=clock_timestamp(),apply_error=null,updated_by=actor,updated_at=clock_timestamp() where id=s.id;
 insert into public.erp_ai_field_suggestion_events(suggestion_id,event_type,actor_user_id,event_data_json)
  values(s.id,'applied',actor,jsonb_build_object('targetTable','parties','targetField',field,'changed',changed,'revision',party.workspace_revision::text));
 result:=jsonb_build_object('suggestionId',s.id,'partyId',party.id,'field',field,'changed',changed,'revision',party.workspace_revision::text,'replayed',false);
 insert into erp_private.party_suggestion_applications(suggestion_id,party_id,actor,request_hash,result) values(s.id,party.id,actor,h,result);
 return result;
end$$;
alter function erp_private.apply_party_field_suggestion(bigint,boolean) owner to postgres;
revoke all on function erp_private.apply_party_field_suggestion(bigint,boolean) from public,anon,service_role;
grant execute on function erp_private.apply_party_field_suggestion(bigint,boolean) to authenticated;
create function public.apply_party_field_suggestion(p_suggestion bigint,p_accept_pending boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.apply_party_field_suggestion(p_suggestion,p_accept_pending);
$$;
revoke all on function public.apply_party_field_suggestion(bigint,boolean) from public,anon,service_role;
grant execute on function public.apply_party_field_suggestion(bigint,boolean) to authenticated;

-- Numbered child creation previously used caller SELECT FOR SHARE, which also
-- requires an UPDATE table privilege. Keep that narrow read/lock available
-- without leaving arbitrary parent UPDATE enabled. No business data is returned
-- or written by this helper; the outer caller-invoker create still enforces
-- each child table's RLS and numbering/create permissions.
create function erp_private.lock_party_creation_parent(p_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not (public.current_user_has_role('system_admin') or public.current_user_has_permission('master_data.parties.view') or public.current_user_has_permission('master_data.party_master.view')) then
  raise exception 'Party read permission denied' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 perform 1 from public.parties where id=p_id and is_active and not is_locked for share;
 if not found then raise exception 'Parent party is unavailable or inactive' using errcode='42501';end if;
end$$;
alter function erp_private.lock_party_creation_parent(bigint) owner to postgres;
revoke all on function erp_private.lock_party_creation_parent(bigint) from public,anon,service_role;
grant execute on function erp_private.lock_party_creation_parent(bigint) to authenticated;
do $$declare body text;old_lock text;begin
 body:=pg_get_functiondef('erp_private.create_numbered_party_record(text,uuid,jsonb)'::regprocedure);
 old_lock:=E'perform 1 from public.parties where id=parent_id and is_active and not is_locked for share;\n  if not found then raise exception ''Parent party is unavailable or inactive'' using errcode=''42501'';end if;';
 if position(old_lock in body)=0 then raise exception 'Expected numbered parent lock requires review';end if;
 execute replace(body,old_lock,'perform erp_private.lock_party_creation_parent(parent_id);');
end$$;
revoke update,delete on public.parties from public,anon,authenticated;
revoke insert,update,delete on public.party_type_assignments from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
