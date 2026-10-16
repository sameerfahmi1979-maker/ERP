begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Verification is a separate capability from editing an account. Only this
-- narrow transaction may set its identity, time and authoritative audit.
create function erp_private.verify_party_bank_record(p_operation uuid,p_id bigint,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor bigint;system_admin boolean;parent_id bigint;parent public.parties%rowtype;
 current_row public.party_bank_details%rowtype;previous erp_private.master_lifecycle_receipts%rowtype;
 h text;result jsonb;changed boolean;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 actor:=public.current_user_profile_id();system_admin:=public.current_user_has_role('system_admin');
 if not (system_admin or public.current_user_has_permission('master_data.parties.verify_bank_details'))
  or not (system_admin or public.current_user_has_permission('master_data.parties.view_bank_details') or public.current_user_has_permission('master_data.parties.manage_bank_details')) then
  raise exception 'Verification and read permission required' using errcode='42501';
 end if;
 if p_operation is null or p_id is null or p_id not between 1 and 9007199254740991 or p_revision is null or p_revision<1 then
  raise exception 'Invalid verification contract' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 h:=encode(sha256(convert_to(jsonb_build_array('party-bank-verification',p_id,p_revision)::text,'UTF8')),'hex');
 select r.* into previous from erp_private.master_lifecycle_receipts r where r.actor=auth.uid() and r.operation_id=p_operation;
 if found and previous.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
 select party_id into parent_id from public.party_bank_details where id=p_id;
 if not found then raise exception 'Record not found' using errcode='PT404';end if;
 select * into parent from public.parties where id=parent_id for share;
 if not found or (parent.is_locked and not system_admin) then raise exception 'Parent unavailable' using errcode='42501';end if;
 select * into current_row from public.party_bank_details where id=p_id for update;
 if not found then raise exception 'Record not found' using errcode='PT404';end if;
 if previous.operation_id is not null then return previous.result||jsonb_build_object('replayed',true);end if;
 if current_row.workspace_revision<>p_revision then raise exception 'Record changed since review' using errcode='PT409';end if;
 changed:=not current_row.is_verified;
 if changed then
  update public.party_bank_details set is_verified=true,verified_by=actor,verified_at=clock_timestamp(),updated_by=actor
   where id=p_id returning * into current_row;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'MASTER_DATA','party_bank_details',p_id,current_row.bank_detail_code,'verify',
    jsonb_build_object('operation_id',p_operation,'revision',current_row.workspace_revision::text,'is_verified',true));
 end if;
 result:=jsonb_build_object('id',p_id,'revision',current_row.workspace_revision::text,'changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,'party_bank_details',p_id,result);
 return result;
end$$;
alter function erp_private.verify_party_bank_record(uuid,bigint,bigint) owner to postgres;
revoke all on function erp_private.verify_party_bank_record(uuid,bigint,bigint) from public,anon,service_role;
grant execute on function erp_private.verify_party_bank_record(uuid,bigint,bigint) to authenticated;
create function public.verify_party_bank_record(p_operation uuid,p_id bigint,p_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.verify_party_bank_record(p_operation,p_id,p_revision);
$$;
revoke all on function public.verify_party_bank_record(uuid,bigint,bigint) from public,anon,service_role;
grant execute on function public.verify_party_bank_record(uuid,bigint,bigint) to authenticated;

-- Creation and ordinary edits already use checked transactions (45/48). DMS
-- forbids bank targets; the reviewed AI registry has no child-bank writer.
-- Close both table- and column-grant escape routes, retaining read/lifecycle
-- permissions and all existing rows/history. DELETE adoption is separate.
revoke update on public.party_bank_details from public,anon,authenticated;
do $$declare columns text;begin
 select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute
  where attrelid='public.party_bank_details'::regclass and attnum>0 and not attisdropped;
 execute format('revoke update (%s) on public.party_bank_details from public,anon,authenticated',columns);
end$$;
notify pgrst,'reload schema';
commit;
