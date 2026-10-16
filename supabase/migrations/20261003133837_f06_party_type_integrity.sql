begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Shared classification catalogue: no invented company mapping or role grants.
-- Existing records are retained; new writes use a revision/operation receipt.
alter table public.party_types add column workspace_revision bigint not null default 1;
create trigger f06_party_type_revision before insert or update on public.party_types
 for each row execute function erp_private.workspace_revision();
create function erp_private.validate_party_type() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.type_code is distinct from old.type_code or new.is_system is distinct from old.is_system) then
  raise exception 'Party type identity and system flag are immutable' using errcode='22023';end if;
 new.type_name:=btrim(new.type_name);
 if new.type_code is null or new.type_code !~ '^[A-Z0-9_]{1,100}$'
  or new.type_name is null or length(new.type_name) not between 1 and 200
  or coalesce(length(new.type_name_ar),0)>200 or coalesce(length(new.description),0)>2000
  or coalesce(length(new.icon_name),0)>100 or coalesce(length(new.color_token),0)>100
  or new.sort_order<0 then raise exception 'Invalid party type values' using errcode='22023';end if;
 if TG_OP='UPDATE' and old.is_active and not new.is_active and (
  exists(select 1 from public.party_type_assignments where party_type_id=new.id and is_active)
  or exists(select 1 from public.parties where primary_party_type_id=new.id and is_active)) then
  raise exception 'Party type has active dependencies' using errcode='23503';end if;
 return new;
end$$;
alter function erp_private.validate_party_type() owner to postgres;
revoke all on function erp_private.validate_party_type() from public,anon,authenticated,service_role;
create trigger f06_party_type_integrity before insert or update on public.party_types
 for each row execute function erp_private.validate_party_type();

-- A new/activated assignment takes a shared lock on the type. Retirement holds
-- its update lock before dependency inspection, so concurrent use cannot slip in.
create function erp_private.validate_party_type_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 field text:=TG_ARGV[0]; target public.party_types%rowtype;
begin
 if TG_TABLE_NAME not in ('parties','party_type_assignments') or field not in ('primary_party_type_id','party_type_id') then
  raise exception 'Unsupported classification reference' using errcode='22023';end if;
 if n->>field is null or n->>'is_active'='false' or (TG_OP='UPDATE' and n->field is not distinct from o->field and o->>'is_active'='true') then return new;end if;
 select * into target from public.party_types where id=(n->>field)::bigint for share;
 if not found or not target.is_active then raise exception 'Choose an active party type' using errcode='23503';end if;
 return new;
end$$;
alter function erp_private.validate_party_type_reference() owner to postgres;
revoke all on function erp_private.validate_party_type_reference() from public,anon,authenticated,service_role;
create trigger f06_party_type_reference before insert or update on public.parties
 for each row execute function erp_private.validate_party_type_reference('primary_party_type_id');
create trigger f06_party_type_reference before insert or update on public.party_type_assignments
 for each row execute function erp_private.validate_party_type_reference('party_type_id');

alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check(entity in (
 'departments','work_calendars','work_shifts','global_numbering_rules','erp_email_provider_configs','erp_ai_provider_configs',
 'erp_email_feature_flags','erp_ai_feature_flags','erp_report_branding_profiles','erp_app_branding_settings',
 'erp_branding_assets','owner_company_branding','currencies','erp_report_templates','party_types'));

create function erp_private.save_party_type(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.party_types%rowtype; candidate public.party_types%rowtype; saved public.party_types%rowtype;
 receipt erp_private.master_lifecycle_receipts%rowtype; payload jsonb; k text; h text; actor bigint; changed boolean; result jsonb;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('master_data.parties.manage_types') then raise exception 'Global classification permission required' using errcode='42501';end if;
 actor:=public.current_user_profile_id();
 if p_operation is null or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb
  or octet_length(p_data::text)>16000 or (p_id is null and p_revision is not null)
  or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1)) then raise exception 'Invalid party type save contract' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_data) field where field not in ('type_code','type_name','type_name_ar','description','icon_name','color_token','is_active','sort_order')) then
  raise exception 'Protected party type fields' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_data) e where
  (e.key in ('type_code','type_name') and jsonb_typeof(e.value)<>'string') or
  (e.key in ('type_name_ar','description','icon_name','color_token') and jsonb_typeof(e.value) not in ('string','null')) or
  (e.key='is_active' and jsonb_typeof(e.value)<>'boolean') or
  (e.key='sort_order' and (jsonb_typeof(e.value)<>'number' or (e.value#>>'{}')::numeric<>trunc((e.value#>>'{}')::numeric)))) then
  raise exception 'Use typed party type fields' using errcode='22023';end if;
 h:=encode(sha256(convert_to(jsonb_build_array('party_types',p_id,p_revision,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-party-type:'||auth.uid()::text||':'||p_operation::text,0));
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  if not exists(select 1 from public.party_types where id=receipt.record_id) then raise exception 'Party type unavailable' using errcode='PT404';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_id is not null then
  select * into prior from public.party_types where id=p_id for update;
  if not found then raise exception 'Party type unavailable' using errcode='PT404';end if;
  if prior.workspace_revision<>p_revision then raise exception 'Party type changed' using errcode='PT409';end if;
  if p_data?'type_code' and p_data->>'type_code' is distinct from prior.type_code then raise exception 'Party type code is immutable' using errcode='22023';end if;
 end if;
 payload:=p_data;
 foreach k in array array['type_name','type_name_ar','description','icon_name','color_token'] loop
  if payload?k and jsonb_typeof(payload->k)='string' then
   payload:=jsonb_set(payload,array[k],case when k='type_name' then to_jsonb(btrim(payload->>k)) else coalesce(to_jsonb(nullif(btrim(payload->>k),'')),'null'::jsonb) end);
  end if;
 end loop;
 if p_id is null then payload:=jsonb_build_object('is_active',true,'is_system',false,'sort_order',0)||payload;end if;
 candidate:=jsonb_populate_record(prior,payload);
 if candidate.type_code is null or candidate.type_name is null then raise exception 'Code and name required' using errcode='22023';end if;
 changed:=p_id is null or exists(select 1 from jsonb_object_keys(payload) x where to_jsonb(prior)->x is distinct from to_jsonb(candidate)->x);
 if changed then
  if p_id is null then
   insert into public.party_types(type_code,type_name,type_name_ar,description,icon_name,color_token,is_system,is_active,sort_order,created_by,updated_by)
   values(candidate.type_code,candidate.type_name,candidate.type_name_ar,candidate.description,candidate.icon_name,candidate.color_token,false,candidate.is_active,candidate.sort_order,actor,actor) returning * into saved;
  else
   update public.party_types set type_name=candidate.type_name,type_name_ar=candidate.type_name_ar,description=candidate.description,
    icon_name=candidate.icon_name,color_token=candidate.color_token,is_active=candidate.is_active,sort_order=candidate.sort_order,
    updated_by=actor,updated_at=clock_timestamp() where id=p_id returning * into saved;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
   values(actor,'master_data','party_types',saved.id,saved.type_code,case when p_id is null then 'create'
    when prior.is_active<>saved.is_active then case when saved.is_active then 'activate' else 'deactivate' end else 'update' end,
    case when p_id is not null then to_jsonb(prior)-array['created_at','updated_at'] else null end,
    (to_jsonb(saved)-array['created_at','updated_at'])||jsonb_build_object('operation_id',p_operation));
 else saved:=prior;end if;
 result:=jsonb_build_object('id',saved.id,'revision',saved.workspace_revision::text,'changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,'party_types',saved.id,result);
 return result;
end$$;
alter function erp_private.save_party_type(uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_party_type(uuid,bigint,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.save_party_type(uuid,bigint,bigint,jsonb) to authenticated;
create function public.save_party_type(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.save_party_type(p_operation,p_id,p_revision,p_data);
$$;
alter function public.save_party_type(uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function public.save_party_type(uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_party_type(uuid,bigint,bigint,jsonb) to authenticated;
-- No hard deletion that nulls historical primary classification. No alternate
-- client write path may bypass the atomic audit/revision contract.
revoke insert,update,delete on public.party_types from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
