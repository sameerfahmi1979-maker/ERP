begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Currency is a shared catalogue, not company-owned. Company/branch grants must
-- not mutate it globally. Preserve the existing single-base unique index; this
-- migration does not choose or silently switch a business's base currency.
alter table public.currencies add column workspace_revision bigint not null default 1;
create trigger f06_currency_revision before insert or update on public.currencies
 for each row execute function erp_private.workspace_revision();
-- Future writes are checked without rewriting or inventing historical values.
alter table public.currencies add constraint f06_currency_values check(
 length(btrim(currency_name_en)) between 2 and 255 and
 coalesce(length(currency_name_ar),0)<=255 and coalesce(length(symbol),0)<=10 and
 coalesce(length(description_en),0)<=1000 and coalesce(length(description_ar),0)<=1000 and
 coalesce(length(notes),0)<=2000 and sort_order>=0
) not valid;
create function erp_private.currency_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.currency_code is distinct from old.currency_code then
  raise exception 'Currency code is immutable' using errcode='22023';
 end if;
 return new;
end$$;
alter function erp_private.currency_identity() owner to postgres;
revoke all on function erp_private.currency_identity() from public,anon,authenticated;
create trigger f06_currency_identity before update on public.currencies
 for each row execute function erp_private.currency_identity();

alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check(entity in (
 'departments','work_calendars','work_shifts','global_numbering_rules','erp_email_provider_configs','erp_ai_provider_configs',
 'erp_email_feature_flags','erp_ai_feature_flags','erp_report_branding_profiles','erp_app_branding_settings',
 'erp_branding_assets','owner_company_branding','currencies'));

create function erp_private.save_currency_record(p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 prior public.currencies%rowtype; candidate public.currencies%rowtype; saved public.currencies%rowtype;
 receipt erp_private.master_lifecycle_receipts%rowtype; allowed text[]; k text; payload jsonb;
 h text; changed boolean; result jsonb; actor bigint; sysadmin boolean;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 actor:=public.current_user_profile_id();
 select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null
   and ur.branch_id is null and r.role_code='system_admin') into sysadmin;
 if p_action is null or p_action not in ('save','active','lock','retire') or p_operation is null
  or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>16000
  or (p_id is null and (p_revision is not null or p_action<>'save'))
  or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1)) then
  raise exception 'Invalid currency save contract' using errcode='22023';end if;
 if (p_action='retire' and not sysadmin) or (p_action='lock' and not erp_private.permission_in_scope('master_data.lookups.lock',null,null))
  or (p_action in ('save','active') and not erp_private.permission_in_scope('master_data.finance_basics.manage',null,null)) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;
 allowed:=case p_action when 'lock' then array['is_locked'] when 'active' then array['is_active','deactivation_reason']
  when 'retire' then array['is_active'] else array['currency_code','currency_name_en','currency_name_ar','symbol','decimal_places',
   'is_base_currency','description_en','description_ar','notes','sort_order','is_active'] end;
 if exists(select 1 from jsonb_object_keys(p_data) x where not x=any(allowed))
  or (p_action='lock' and not p_data?'is_locked') or (p_action='active' and not p_data?'is_active')
  or (p_action='retire' and p_data<>jsonb_build_object('is_active',false)) then
  raise exception 'Protected or missing currency fields' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_data) e where
  (e.key=any(array['is_active','is_base_currency','is_locked']) and jsonb_typeof(e.value)<>'boolean') or
  (e.key=any(array['decimal_places','sort_order']) and (jsonb_typeof(e.value)<>'number' or (e.value#>>'{}')::numeric<>trunc((e.value#>>'{}')::numeric))) or
  (e.key=any(array['currency_code','currency_name_en']) and jsonb_typeof(e.value)<>'string') or
  (e.key=any(array['currency_name_ar','symbol','description_en','description_ar','notes','deactivation_reason']) and jsonb_typeof(e.value) not in ('string','null'))) then
  raise exception 'Use typed currency fields' using errcode='22023';end if;
 h:=encode(sha256(convert_to(jsonb_build_array('currencies',p_action,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-currency:'||auth.uid()::text||':'||p_operation::text,0));
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  select * into saved from public.currencies where id=receipt.record_id for share;
  if not found or (saved.is_locked and p_action<>'lock' and not sysadmin) then raise exception 'Currency unavailable' using errcode='42501';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_id is not null then
  select * into prior from public.currencies where id=p_id for update;
  if not found then raise exception 'Currency unavailable' using errcode='PT404';end if;
  if prior.is_locked and p_action<>'lock' and not sysadmin then raise exception 'Currency is locked' using errcode='42501';end if;
  if prior.workspace_revision<>p_revision then raise exception 'Currency changed' using errcode='PT409';end if;
  if p_data?'currency_code' and p_data->>'currency_code' is distinct from prior.currency_code then raise exception 'Currency code is immutable' using errcode='22023';end if;
 end if;
 payload:=p_data;
 foreach k in array array['currency_name_en','currency_name_ar','symbol','description_en','description_ar','notes','deactivation_reason'] loop
  if payload?k and jsonb_typeof(payload->k)='string' then
   payload:=jsonb_set(payload,array[k],case when k='currency_name_en' then to_jsonb(btrim(payload->>k)) else coalesce(to_jsonb(nullif(btrim(payload->>k),'')),'null'::jsonb) end);
  end if;
 end loop;
 if p_id is null then
  payload:=jsonb_build_object('decimal_places',2,'is_base_currency',false,'is_active',true,'sort_order',0)||payload;
 end if;
 candidate:=jsonb_populate_record(prior,payload);
 if candidate.currency_code is null or candidate.currency_name_en is null or length(candidate.currency_name_en)<2
  or coalesce(length(candidate.deactivation_reason),0)>2000 then raise exception 'Invalid currency values' using errcode='22023';end if;
 if candidate.is_active then candidate.deactivated_at:=null;candidate.deactivated_by:=null;candidate.deactivation_reason:=null;
 elsif p_id is null or prior.is_active then candidate.deactivated_at:=clock_timestamp();candidate.deactivated_by:=actor;
 end if;
 changed:=p_id is null or exists(select 1 from jsonb_object_keys(payload) x where to_jsonb(prior)->x is distinct from to_jsonb(candidate)->x);
 if changed then
  -- The row and status metadata are written in one transaction. Retiring never
  -- deletes a currency or nulls financial/document references to it.
  if p_id is null then
   insert into public.currencies(currency_code,currency_name_en,currency_name_ar,symbol,decimal_places,is_base_currency,
    description_en,description_ar,notes,sort_order,is_active,created_by,updated_by,deactivated_at,deactivated_by,deactivation_reason)
   values(candidate.currency_code,candidate.currency_name_en,candidate.currency_name_ar,candidate.symbol,candidate.decimal_places,candidate.is_base_currency,
    candidate.description_en,candidate.description_ar,candidate.notes,candidate.sort_order,candidate.is_active,actor,actor,candidate.deactivated_at,candidate.deactivated_by,candidate.deactivation_reason)
   returning * into saved;
  else
   update public.currencies set currency_name_en=candidate.currency_name_en,currency_name_ar=candidate.currency_name_ar,symbol=candidate.symbol,
    decimal_places=candidate.decimal_places,is_base_currency=candidate.is_base_currency,description_en=candidate.description_en,description_ar=candidate.description_ar,
    notes=candidate.notes,sort_order=candidate.sort_order,is_active=candidate.is_active,is_locked=candidate.is_locked,updated_by=actor,
    deactivated_at=candidate.deactivated_at,deactivated_by=candidate.deactivated_by,deactivation_reason=candidate.deactivation_reason
   where id=p_id returning * into saved;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
   values(actor,'master_data','currencies',saved.id,saved.currency_code,case when p_id is null then 'create' when p_action='retire' then 'retire'
    when p_action='lock' then case when saved.is_locked then 'currency.lock' else 'currency.unlock' end
    when prior.is_active<>saved.is_active then case when saved.is_active then 'activate' else 'deactivate' end else 'update' end,
    case when p_id is not null then to_jsonb(prior)-array['created_at','updated_at'] else null end,
    (to_jsonb(saved)-array['created_at','updated_at'])||jsonb_build_object('operation_id',p_operation));
 else saved:=prior;
 end if;
 result:=jsonb_build_object('id',saved.id,'revision',saved.workspace_revision::text,'changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,'currencies',saved.id,result);
 return result;
end$$;
alter function erp_private.save_currency_record(uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function erp_private.save_currency_record(uuid,bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function erp_private.save_currency_record(uuid,bigint,bigint,text,jsonb) to authenticated;
create function public.save_currency_record(p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.save_currency_record(p_operation,p_id,p_revision,p_action,p_data);
$$;
alter function public.save_currency_record(uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function public.save_currency_record(uuid,bigint,bigint,text,jsonb) from public,anon;
grant execute on function public.save_currency_record(uuid,bigint,bigint,text,jsonb) to authenticated;
revoke insert,update,delete on public.currencies from public,anon,authenticated;
alter policy select_currencies_authenticated on public.currencies to authenticated using(
 (select erp_private.business_principal_is_active()) and (is_active or public.current_user_has_permission('master_data.finance_basics.view')
  or erp_private.permission_in_scope('master_data.finance_basics.manage',null,null)
  or erp_private.permission_in_scope('master_data.lookups.lock',null,null)));
notify pgrst,'reload schema';
commit;
