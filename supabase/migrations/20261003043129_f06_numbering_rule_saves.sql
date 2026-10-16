begin;
alter table public.global_numbering_rules add column workspace_revision bigint not null default 1;
create trigger f06_numbering_revision before insert or update on public.global_numbering_rules
 for each row execute function erp_private.workspace_revision();
grant select,insert on erp_private.master_lifecycle_receipts to postgres;
alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check
 check(entity in ('departments','work_calendars','work_shifts','global_numbering_rules'));

create function public.save_numbering_rule(p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_row jsonb; candidate jsonb; saved jsonb; payload jsonb; receipt erp_private.master_lifecycle_receipts;
 allowed text[]; h text; actor bigint; cols text; vals text; assigns text; changed boolean; result jsonb;
begin
 if not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 if p_action is null or p_action not in ('save','active','lock') or p_operation is null or p_data is null or jsonb_typeof(p_data)<>'object'
  or pg_column_size(p_data)>16000 or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1))
  or (p_id is null and (p_revision is not null or p_action<>'save')) then raise exception 'Invalid save contract' using errcode='22023';end if;
 if not public.current_user_has_permission(case when p_action='lock' then 'numbering.rules.lock' else 'numbering.rules.manage' end) then
  raise exception 'Permission denied' using errcode='42501';end if;
 allowed:=case p_action when 'lock' then array['is_locked'] when 'active' then array['is_active'] else
  array['rule_code','rule_name','description','module_code','module_name','document_type_code','document_type_name','document_prefix','separator','format_template',
  'sequence_length','padding_character','starting_sequence_number','reset_policy','reserve_on_draft','reserve_on_submit','allow_manual_override','manual_override_requires_permission',
  'allow_gaps','cancelled_number_policy','duplicate_prevention_scope','is_active','is_locked','effective_from','effective_to','notes'] end;
 if exists(select 1 from jsonb_object_keys(p_data) k where not k=any(allowed)) or (p_action<>'save' and p_data='{}'::jsonb) then
  raise exception 'Protected or missing fields' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_data) e where
  (e.key=any(array['reserve_on_draft','reserve_on_submit','allow_manual_override','manual_override_requires_permission','allow_gaps','is_active','is_locked']) and jsonb_typeof(e.value)<>'boolean')
  or (e.key=any(array['sequence_length','starting_sequence_number']) and jsonb_typeof(e.value)<>'number')) then
  raise exception 'Use typed numbers and flags' using errcode='22023';end if;
 h:=md5(jsonb_build_array('numbering',p_action,p_id,p_revision,p_data)::text);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation already used for different inputs' using errcode='22023';end if;
  -- Re-evaluate current lock capability before disclosing a replay receipt.
  if exists(select 1 from public.global_numbering_rules where id=receipt.record_id and is_locked) and not public.current_user_has_permission('numbering.rules.lock') then
   raise exception 'Lock permission required' using errcode='42501';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_id is not null then
  select to_jsonb(r) into old_row from public.global_numbering_rules r where id=p_id for update;
  if old_row is null then raise exception 'Numbering rule not found' using errcode='PT404';end if;
  if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Numbering rule changed' using errcode='PT409';end if;
 end if;
 candidate:=coalesce(old_row,'{}'::jsonb)||p_data;
 if coalesce((old_row->>'is_locked')::boolean,false)
  or (candidate->>'is_locked')::boolean is distinct from coalesce((old_row->>'is_locked')::boolean,false) and candidate?'is_locked' then
  if not public.current_user_has_permission('numbering.rules.lock') then raise exception 'Lock permission required' using errcode='42501';end if;
 end if;
 -- Typed normalization matches PostgreSQL equality for effective timestamps.
 select to_jsonb(x) into candidate from jsonb_populate_record(null::public.global_numbering_rules,candidate) x;
 changed:=old_row is null or exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);
 actor:=public.current_user_profile_id();
 if changed then
  payload:=p_data||jsonb_build_object('updated_by',actor);
  if p_id is null then payload:=payload||jsonb_build_object('created_by',actor,'next_sequence_number',coalesce((p_data->>'starting_sequence_number')::bigint,1));end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),string_agg(format('%I=r.%I',k,k),',' order by k)
   into cols,vals,assigns from jsonb_object_keys(payload) k;
  if p_id is null then
   execute format('insert into public.global_numbering_rules (%s) select %s from jsonb_populate_record(null::public.global_numbering_rules,$1) r returning to_jsonb(global_numbering_rules)',cols,vals) into saved using payload;
  else
   execute format('update public.global_numbering_rules t set %s from jsonb_populate_record(null::public.global_numbering_rules,$1) r where t.id=$2 returning to_jsonb(t)',assigns) into saved using payload,p_id;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
  values(actor,'numbering','global_numbering_rules',(saved->>'id')::bigint,saved->>'rule_code',case when p_id is null then 'create' when p_action='lock' then case when (saved->>'is_locked')::boolean then 'lock' else 'unlock' end else 'update' end,
   case when old_row is null then null else jsonb_build_object('revision',old_row->>'workspace_revision') end,
   jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision','changed_fields',to_jsonb(array(select jsonb_object_keys(p_data)))));
 else saved:=old_row;end if;
 result:=jsonb_build_object('id',saved->'id','revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,'global_numbering_rules',(saved->>'id')::bigint,result);
 return result;
end $$;
alter function public.save_numbering_rule(uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function public.save_numbering_rule(uuid,bigint,bigint,text,jsonb) from public,anon,service_role;
grant execute on function public.save_numbering_rule(uuid,bigint,bigint,text,jsonb) to authenticated;
-- All application rule writes now use the narrow RPC. RLS alone cannot require
-- an expected revision or retained operation, and DELETE would erase unused
-- rule history. Keep catalogue reads; retire rules through is_active instead.
revoke insert,update,delete on public.global_numbering_rules from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
