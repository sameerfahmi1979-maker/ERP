begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter policy erp_ai_configs_select on public.erp_ai_provider_configs using (
 (select public.current_user_has_permission('settings.ai.view')) or (select public.current_user_has_permission('settings.ai.manage'))
 or (select public.current_user_has_permission('settings.ai.test')) or (select public.current_user_has_permission('settings.ai.secrets.manage')));
alter policy erp_ai_flags_select on public.erp_ai_feature_flags using (
 (select public.current_user_has_permission('settings.ai.view')) or (select public.current_user_has_permission('settings.ai.manage')));
alter table public.erp_email_feature_flags add column workspace_revision bigint not null default 1;
alter table public.erp_ai_feature_flags add column workspace_revision bigint not null default 1;
create trigger f06_email_flag_revision before insert or update on public.erp_email_feature_flags for each row execute function erp_private.workspace_revision();
create trigger f06_ai_flag_revision before insert or update on public.erp_ai_feature_flags for each row execute function erp_private.workspace_revision();
alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check
 check(entity in ('departments','work_calendars','work_shifts','global_numbering_rules','erp_email_provider_configs','erp_ai_provider_configs','erp_email_feature_flags','erp_ai_feature_flags'));

create function public.save_provider_feature_flag(p_kind text,p_code text,p_operation uuid,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entity text; old_row jsonb; candidate jsonb; saved jsonb; result jsonb; h text; allowed text[]; changed boolean; actor bigint;
 receipt erp_private.master_lifecycle_receipts; assigns text; payload jsonb;
begin
 if not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('email','ai') or p_code is null or length(p_code) not between 1 and 100 or p_revision is null or p_revision<1
  or p_operation is null or p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>5000 then raise exception 'Invalid flag save contract' using errcode='22023';end if;
 if not(public.current_user_has_permission('settings.'||p_kind||'.manage') or p_kind='email' and public.current_user_has_permission('settings.email.feature_flags.manage')) then
  raise exception 'Global flag administration required' using errcode='42501';end if;
 allowed:=case p_kind when 'email' then array['is_enabled','notes'] else array['is_enabled','requires_human_review','min_confidence_threshold'] end;
 if exists(select 1 from jsonb_each(p_data) e where not e.key=any(allowed)
  or e.key=any(array['is_enabled','requires_human_review']) and jsonb_typeof(e.value)<>'boolean'
  or e.key='min_confidence_threshold' and (jsonb_typeof(e.value)<>'number' or (e.value::text)::numeric not between 0 and 1)
  or e.key='notes' and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>2000)) then raise exception 'Invalid or protected flag fields' using errcode='22023';end if;
 if p_kind='ai' and p_code like 'DMS\_%' escape '\' and p_data->'requires_human_review'='false'::jsonb then
  raise exception 'DMS human review remains required until separately approved' using errcode='22023';end if;
 entity:='erp_'||p_kind||'_feature_flags';h:=md5(jsonb_build_array('provider_flag',p_kind,p_code,p_revision,p_data)::text);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation already used with other values' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 execute format('select to_jsonb(t) from public.%I t where feature_code=$1 for update',entity) into old_row using p_code;
 if old_row is null then raise exception 'Feature flag not found' using errcode='PT404';end if;
 if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Feature flag changed' using errcode='PT409';end if;
 execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I,$1) r',entity) into candidate using old_row||p_data;
 changed:=exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);actor:=public.current_user_profile_id();
 if changed then
  payload:=p_data||jsonb_build_object('updated_at',clock_timestamp());
  select string_agg(format('%I=r.%I',k,k),',' order by k) into assigns from jsonb_object_keys(payload) k;
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t)',entity,assigns,entity) into saved using payload,(old_row->>'id')::bigint;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
  values(actor,'SETTINGS',entity,(old_row->>'id')::bigint,p_code,'update',jsonb_build_object('revision',old_row->>'workspace_revision'),
   jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision','changed_fields',to_jsonb(array(select jsonb_object_keys(p_data)))));
 else saved:=old_row;end if;
 result:=jsonb_build_object('id',saved->'id','revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,entity,(saved->>'id')::bigint,result);
 return result;
end$$;
alter function public.save_provider_feature_flag(text,text,uuid,bigint,jsonb) owner to postgres;
revoke all on function public.save_provider_feature_flag(text,text,uuid,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_provider_feature_flag(text,text,uuid,bigint,jsonb) to authenticated;
revoke insert,update,delete on public.erp_email_feature_flags,public.erp_ai_feature_flags from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
