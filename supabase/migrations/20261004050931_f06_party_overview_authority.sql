begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Ordinary overview editing must not bypass the separately governed lifecycle
-- or assignment transactions. The receipt retains the authority used by a
-- lifecycle change, so retrying after a lost response still reauthorizes it.
-- That internal receipt field is never returned through the public wrapper.
create or replace function erp_private.save_party_record(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 allowed text[]:=array['display_name','legal_name_en','legal_name_ar','trade_name_en','trade_name_ar','short_name','party_nature_id','primary_party_type_id','parent_party_id','main_phone','main_mobile','whatsapp','main_email','alternate_email','website','country_id','emirate_id','city_id','area_zone_id','po_box','full_address_text','google_map_url','latitude','longitude','party_status_id','is_active','remarks'];
 field text;data_type oid;old_row jsonb;candidate jsonb;saved jsonb;payload jsonb;
 previous erp_private.master_lifecycle_receipts%rowtype;h text;result jsonb;assigns text;
 changed boolean;system_admin boolean;requires_lifecycle boolean;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 system_admin:=public.current_user_has_role('system_admin');
 if not (system_admin or public.current_user_has_permission('master_data.parties.view') or public.current_user_has_permission('master_data.party_master.view'))
  or not (system_admin or public.current_user_has_permission('master_data.parties.edit') or public.current_user_has_permission('master_data.party_master.manage')) then
  raise exception 'Permission denied' using errcode='42501';
 end if;
 if p_operation is null or p_id is null or p_id<1 or p_revision is null or p_revision<1
  or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>262144 then
  raise exception 'Invalid party save contract' using errcode='22023';
 end if;
 for field in select jsonb_object_keys(p_data) loop
  if not field=any(allowed) then raise exception 'Protected or unsupported party field' using errcode='22023';end if;
  select atttypid into data_type from pg_attribute where attrelid='public.parties'::regclass and attname=field and not attisdropped;
  if p_data->field<>'null'::jsonb and (
   (data_type='boolean'::regtype and jsonb_typeof(p_data->field)<>'boolean')
   or (data_type in ('bigint'::regtype,'integer'::regtype,'numeric'::regtype,'double precision'::regtype) and jsonb_typeof(p_data->field)<>'number')
   or (data_type='text'::regtype and jsonb_typeof(p_data->field)<>'string')) then
   raise exception 'Invalid party field type' using errcode='22023';
  end if;
 end loop;
 if p_data?'is_active' and jsonb_typeof(p_data->'is_active') is distinct from 'boolean' then
  raise exception 'Invalid party active state' using errcode='22023';
 end if;
 foreach field in array array['display_name','legal_name_en'] loop
  if p_data?field then
   if nullif(btrim(p_data->>field),'') is null then raise exception 'Required party field missing' using errcode='23514';end if;
   p_data:=jsonb_set(p_data,array[field],to_jsonb(btrim(p_data->>field)));
  end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 -- Keep the existing geography -> party -> row order used by relationship
 -- triggers and the assignment/lifecycle transaction, including on replay.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 h:=encode(sha256(convert_to(jsonb_build_array('party-save',p_id,p_revision,p_data)::text,'UTF8')),'hex');
 select * into previous from erp_private.master_lifecycle_receipts where actor=auth.uid() and operation_id=p_operation;
 if found and previous.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
 select to_jsonb(p) into old_row from public.parties p where id=p_id for update;
 if old_row is null then raise exception 'Party not found' using errcode='PT404';end if;
 if old_row->>'is_locked'='true' and not system_admin then raise exception 'Party unavailable' using errcode='42501';end if;
 if previous.operation_id is not null then
  -- Fail closed for a pre-upgrade receipt with an active-state input but no
  -- record of whether that input changed lifecycle. Do not invent its history.
  requires_lifecycle:=coalesce((previous.result->>'_requires_lifecycle')::boolean,p_data?'is_active');
 else
  requires_lifecycle:=p_data?'is_active' and old_row->'is_active' is distinct from p_data->'is_active';
 end if;
 if requires_lifecycle and not (system_admin or public.current_user_has_permission('master_data.parties.deactivate')) then
  raise exception 'Party activation permission required' using errcode='42501';
 end if;
 if previous.operation_id is not null then return (previous.result-'_requires_lifecycle')||jsonb_build_object('replayed',true);end if;
 if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Party changed' using errcode='PT409';end if;
 candidate:=to_jsonb(jsonb_populate_record(null::public.parties,old_row||p_data));
 if candidate->'primary_party_type_id' is distinct from old_row->'primary_party_type_id' then
  raise exception 'Use the party type assignment transaction' using errcode='PT422';
 end if;
 changed:=exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);
 if changed then
  payload:=p_data||jsonb_build_object('updated_by',public.current_user_profile_id());
  if requires_lifecycle then
   payload:=payload||jsonb_build_object('deactivated_at',case when candidate->>'is_active'='false' then clock_timestamp() else null end,
    'deactivated_by',case when candidate->>'is_active'='false' then public.current_user_profile_id() else null end,'deactivation_reason',null);
  end if;
  select string_agg(format('%I=r.%I',k,k),',' order by k) into assigns from jsonb_object_keys(payload) k;
  execute format('update public.parties p set %s from jsonb_populate_record(null::public.parties,$1)r where p.id=$2 returning to_jsonb(p)',assigns) into saved using payload,p_id;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(public.current_user_profile_id(),'MASTER_DATA','parties',p_id,saved->>'party_code','update',
    jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision','fields',(select jsonb_agg(k order by k) from jsonb_object_keys(p_data)k where old_row->k is distinct from candidate->k)));
 else saved:=old_row;
 end if;
 result:=jsonb_build_object('id',p_id,'revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,'parties',p_id,result||jsonb_build_object('_requires_lifecycle',requires_lifecycle));
 return result;
end$$;
alter function erp_private.save_party_record(uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_party_record(uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function erp_private.save_party_record(uuid,bigint,bigint,jsonb) to authenticated;

-- Direct table UPDATE is a separate adoption gate: the accepted-AI-suggestion
-- writer must be integrated before that legacy privilege can be removed.
notify pgrst,'reload schema';
commit;
