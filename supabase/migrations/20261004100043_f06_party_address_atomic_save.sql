begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $$declare existing text;begin
 select pg_get_expr(conbin,conrelid) into existing from pg_constraint
  where conrelid='erp_private.master_lifecycle_receipts'::regclass and conname='master_lifecycle_receipts_entity_check';
 if existing is null then raise exception 'Expected receipt constraint unavailable';end if;
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute format('alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check ((%s) or entity=''party_addresses'')',existing);
end$$;

-- Explicit global catalogue view + address-management authority, not an
-- unrestricted privileged client. The invoker API exposes only a receipt.
-- Audit, revision and retry receipt commit together, or all roll back.
create function erp_private.save_party_address(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 allowed text[]:=array['party_id','address_type_id','address_name','country_id','emirate_id','city_id','area_zone_id','street','building','floor','office_no','po_box','landmark','google_map_url','latitude','longitude','is_primary','is_billing_address','is_shipping_address','is_site_address','is_active','notes'];
 field text;data_type oid;old_row jsonb;candidate jsonb;saved jsonb;payload jsonb;
 previous erp_private.master_lifecycle_receipts%rowtype;h text;result jsonb;assigns text;changed boolean;system_admin boolean;parent public.parties%rowtype;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 system_admin:=public.current_user_has_role('system_admin');
 if not (system_admin or public.current_user_has_permission('master_data.parties.view'))
  or not (system_admin or public.current_user_has_permission('master_data.parties.manage_addresses')) then
  raise exception 'Permission denied' using errcode='42501';
 end if;
 if p_operation is null or p_id is null or p_id<1 or p_id>9007199254740991 or p_revision is null or p_revision<1
  or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>262144 then
  raise exception 'Invalid address save contract' using errcode='22023';
 end if;
 for field in select jsonb_object_keys(p_data) loop
  if not field=any(allowed) then raise exception 'Protected or unsupported address field' using errcode='22023';end if;
  select atttypid into data_type from pg_attribute where attrelid='public.party_addresses'::regclass and attname=field and not attisdropped;
  if p_data->field<>'null'::jsonb and (
   (data_type='boolean'::regtype and jsonb_typeof(p_data->field)<>'boolean')
   or (data_type in ('bigint'::regtype,'numeric'::regtype) and jsonb_typeof(p_data->field)<>'number')
   or (data_type='text'::regtype and jsonb_typeof(p_data->field)<>'string')) then
   raise exception 'Invalid address field type' using errcode='22023';
  end if;
  if data_type='bigint'::regtype and p_data->field<>'null'::jsonb and
   ((p_data->>field)::numeric<>trunc((p_data->>field)::numeric) or (p_data->>field)::numeric not between 1 and 9007199254740991) then
   raise exception 'Invalid address reference' using errcode='22023';
  end if;
 end loop;
 if not p_data?'party_id' or p_data->'party_id'='null'::jsonb then raise exception 'Parent identity required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 -- Match the existing relationship writers before acquiring row locks.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 h:=encode(sha256(convert_to(jsonb_build_array('party-address-save',p_id,p_revision,p_data)::text,'UTF8')),'hex');
 select * into previous from erp_private.master_lifecycle_receipts where actor=auth.uid() and operation_id=p_operation;
 if found and previous.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
 select * into parent from public.parties where id=(p_data->>'party_id')::bigint for share;
 if not found or (parent.is_locked and not system_admin) then raise exception 'Parent unavailable' using errcode='42501';end if;
 select to_jsonb(a) into old_row from public.party_addresses a where id=p_id for update;
 if old_row is null then raise exception 'Address not found' using errcode='PT404';end if;
 if old_row->'party_id' is distinct from p_data->'party_id' then raise exception 'Parent identity is immutable' using errcode='22023';end if;
 -- Current authority, parent availability and original identity are rechecked
 -- before a replay; never turn an old receipt into continuing permission.
 if previous.operation_id is not null then return previous.result||jsonb_build_object('replayed',true);end if;
 if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Address changed' using errcode='PT409';end if;
 candidate:=to_jsonb(jsonb_populate_record(null::public.party_addresses,old_row||p_data));
 changed:=exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);
 if changed then
  payload:=p_data||jsonb_build_object('updated_by',public.current_user_profile_id());
  select string_agg(format('%I=r.%I',k,k),',' order by k) into assigns from jsonb_object_keys(payload) k;
  execute format('update public.party_addresses a set %s from jsonb_populate_record(null::public.party_addresses,$1)r where a.id=$2 returning to_jsonb(a)',assigns) into saved using payload,p_id;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(public.current_user_profile_id(),'MASTER_DATA','party_addresses',p_id,saved->>'address_code','update',
    jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision','fields',(select jsonb_agg(k order by k) from jsonb_object_keys(p_data)k where old_row->k is distinct from candidate->k)));
 else saved:=old_row;
 end if;
 result:=jsonb_build_object('id',p_id,'revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,'party_addresses',p_id,result);
 return result;
end$$;
alter function erp_private.save_party_address(uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_party_address(uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function erp_private.save_party_address(uuid,bigint,bigint,jsonb) to authenticated;
create function public.save_party_address(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.save_party_address(p_operation,p_id,p_revision,p_data);
$$;
revoke all on function public.save_party_address(uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_party_address(uuid,bigint,bigint,jsonb) to authenticated;
-- Remaining child lifecycle and alternate writers must be ported and tested
-- before raw child UPDATE/DELETE is revoked. This is not boundary closure.
notify pgrst,'reload schema';
commit;
