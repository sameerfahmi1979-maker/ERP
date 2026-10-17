begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- A type-set change is part of the parent edit boundary, even when its primary
-- type is unchanged. The existing revision trigger owns workspace_revision.
alter table public.parties add column type_assignment_version bigint not null default 0 check(type_assignment_version>=0);

create function erp_private.validate_party_retirement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.is_active and not new.is_active and exists(select 1 from public.parties where parent_party_id=new.id and is_active) then
  raise exception 'Retire or reassign active child parties first' using errcode='23503';
 end if;
 return new;
end$$;
alter function erp_private.validate_party_retirement() owner to postgres;
revoke all on function erp_private.validate_party_retirement() from public,anon,authenticated,service_role;
create trigger f06_party_retirement before update on public.parties for each row execute function erp_private.validate_party_retirement();

-- Bounded API, never a privileged-client fallback. It repeats current global
-- read/action authority and protected-row rules before consulting any receipt.
create function erp_private.change_party_state(p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.parties%rowtype;saved public.parties%rowtype;previous erp_private.master_lifecycle_receipts%rowtype;
 result jsonb;h text;changed boolean;system_admin boolean;selected bigint[];primary_id bigint;active_ids bigint[];
 item bigint;target_active boolean;reason text;actor bigint;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 if p_action is null or p_action not in ('active','types') then raise exception 'Invalid party action' using errcode='22023';end if;
 system_admin:=public.current_user_has_role('system_admin');
 if not(system_admin or public.current_user_has_permission('master_data.parties.view') or public.current_user_has_permission('master_data.party_master.view'))
  or not(system_admin or (p_action='active' and public.current_user_has_permission('master_data.parties.deactivate'))
   or (p_action='types' and public.current_user_has_permission('master_data.parties.manage_types'))) then
  raise exception 'Permission denied' using errcode='42501';end if;
 if p_action='types' and not(system_admin or public.current_user_has_permission('master_data.parties.view')) then raise exception 'Assignment read permission required' using errcode='42501';end if;
 actor:=public.current_user_profile_id();
 if p_operation is null or p_id is null or p_id<1 or p_revision is null or p_revision<1
  or p_action not in ('active','types') or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000 then
  raise exception 'Invalid party state contract' using errcode='22023';end if;
 if p_action='active' then
  if jsonb_typeof(p_data->'is_active') is distinct from 'boolean'
   or exists(select 1 from jsonb_object_keys(p_data)k where k not in ('is_active','reason'))
   or (p_data?'reason' and jsonb_typeof(p_data->'reason') not in ('string','null'))
   or coalesce(length(p_data->>'reason'),0)>1000 then raise exception 'Invalid lifecycle values' using errcode='22023';end if;
  target_active:=(p_data->>'is_active')::boolean;reason:=nullif(btrim(p_data->>'reason'),'');
  p_data:=jsonb_build_object('is_active',target_active,'reason',case when target_active then null else reason end);
 else
  if jsonb_typeof(p_data->'selected') is distinct from 'array' or not(p_data?'primary')
   or exists(select 1 from jsonb_object_keys(p_data)k where k not in ('selected','primary')) then raise exception 'Invalid type selection' using errcode='22023';end if;
  if jsonb_array_length(p_data->'selected')>100 or exists(select 1 from jsonb_array_elements(p_data->'selected')v where jsonb_typeof(v)<>'number' or v::text !~ '^[1-9][0-9]*$')
   or (p_data->'primary'<>'null'::jsonb and (jsonb_typeof(p_data->'primary')<>'number' or (p_data->'primary')::text !~ '^[1-9][0-9]*$')) then raise exception 'Invalid type identifiers' using errcode='22023';end if;
  select coalesce(array_agg(v::text::bigint order by v::text::bigint),'{}'::bigint[]) into selected from jsonb_array_elements(p_data->'selected')v;
  primary_id:=(p_data->>'primary')::bigint;
  if cardinality(selected)<>(select count(distinct id) from unnest(selected)id)
   or (primary_id is not null and not primary_id=any(selected)) then raise exception 'Primary type must be selected; duplicates are not allowed' using errcode='22023';end if;
  p_data:=jsonb_build_object('selected',selected,'primary',primary_id);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 h:=encode(sha256(convert_to(jsonb_build_array('party-state',p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 select m.* into previous from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found and previous.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
 select * into prior from public.parties where id=p_id for update;
 if not found then raise exception 'Party not found' using errcode='PT404';end if;
 if prior.is_locked and not system_admin then raise exception 'Party locked' using errcode='42501';end if;
 if previous.operation_id is not null then return previous.result||jsonb_build_object('replayed',true);end if;
 if prior.workspace_revision<>p_revision then raise exception 'Party changed' using errcode='PT409';end if;
 if p_action='active' then
  changed:=prior.is_active is distinct from target_active;
  if changed then
   update public.parties set is_active=target_active,deactivated_at=case when target_active then null else clock_timestamp() end,
    deactivated_by=case when target_active then null else actor end,deactivation_reason=case when target_active then null else reason end,updated_by=actor
    where id=p_id returning * into saved;
  end if;
 else
  -- Do not silently merge historical duplicate assignments or choose a primary.
  if exists(select 1 from public.party_type_assignments where party_id=p_id and is_active group by party_type_id having count(*)>1)
   or (select count(*) from public.party_type_assignments where party_id=p_id and is_active and is_primary)>1 then
   raise exception 'Historical type assignments require review' using errcode='PT422';end if;
  select coalesce(array_agg(party_type_id order by party_type_id),'{}'::bigint[]) into active_ids from public.party_type_assignments where party_id=p_id and is_active;
  changed:=selected is distinct from active_ids or primary_id is distinct from prior.primary_party_type_id
   or exists(select 1 from public.party_type_assignments where party_id=p_id and is_active and is_primary is distinct from (party_type_id is not distinct from primary_id));
  -- Retained historical inactive types may be removed or left unchanged, but
  -- never newly assigned or promoted. Ordered type locks prevent retirement races.
  foreach item in array selected loop
   perform 1 from public.party_types where id=item and (is_active or (item=any(active_ids) and (item is distinct from primary_id or primary_id is not distinct from prior.primary_party_type_id))) for share;
   if not found then raise exception 'Selected party type unavailable' using errcode='23503';end if;
  end loop;
  if changed then
   update public.party_type_assignments set is_active=false,is_primary=false,updated_by=actor
    where party_id=p_id and is_active and not(party_type_id=any(selected));
   update public.party_type_assignments set is_primary=(party_type_id is not distinct from primary_id),updated_by=actor
    where party_id=p_id and is_active and is_primary is distinct from (party_type_id is not distinct from primary_id);
   insert into public.party_type_assignments(party_id,party_type_id,is_primary,is_active,assigned_date,assigned_by,created_by,updated_by)
    select p_id,id,id is not distinct from primary_id,true,current_date,actor,actor,actor from unnest(selected)id where not id=any(active_ids);
   update public.parties set primary_party_type_id=primary_id,type_assignment_version=type_assignment_version+1,updated_by=actor where id=p_id returning * into saved;
  end if;
 end if;
 if not changed then saved:=prior;
 else
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'MASTER_DATA','parties',p_id,saved.party_code,case when p_action='types' then 'update' when target_active then 'reactivate' else 'deactivate' end,
    jsonb_build_object('operation_id',p_operation,'revision',saved.workspace_revision::text,'change',p_action));
 end if;
 result:=jsonb_build_object('id',p_id,'revision',saved.workspace_revision::text,'changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result) values(auth.uid(),p_operation,h,'parties',p_id,result);
 return result;
end$$;
alter function erp_private.change_party_state(uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function erp_private.change_party_state(uuid,bigint,bigint,text,jsonb) from public,anon,service_role;
grant execute on function erp_private.change_party_state(uuid,bigint,bigint,text,jsonb) to authenticated;
create function public.change_party_state(p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$select erp_private.change_party_state(p_operation,p_id,p_revision,p_action,p_data);$$;
revoke all on function public.change_party_state(uuid,bigint,bigint,text,jsonb) from public,anon,service_role;
grant execute on function public.change_party_state(uuid,bigint,bigint,text,jsonb) to authenticated;

-- One statement snapshot: the selected set and opening revision cannot come
-- from different moments. Caller RLS remains authoritative; no new cache.
create function public.get_party_type_state(p_id bigint) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id,'revision',p.workspace_revision::text,'primary',p.primary_party_type_id,
  'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'typeId',a.party_type_id,'primary',a.is_primary,'name',t.type_name,'code',t.type_code,'active',t.is_active) order by a.id),'[]'::jsonb)
    from public.party_type_assignments a left join public.party_types t on t.id=a.party_type_id where a.party_id=p.id and a.is_active))
 from public.parties p where p.id=p_id;
$$;
revoke all on function public.get_party_type_state(bigint) from public,anon,service_role;
grant execute on function public.get_party_type_state(bigint) to authenticated;

-- Direct write retirement follows UI adoption and full writer inventory; this
-- migration is not, by itself, complete party/child authorization acceptance.
notify pgrst,'reload schema';
commit;
