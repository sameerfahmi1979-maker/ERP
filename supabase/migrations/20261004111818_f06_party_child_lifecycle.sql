begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Retain child records, number references, evidence and audit history. Archive
-- is distinct from ordinary inactive status; restoration never activates a row.
do $$declare entity text;begin
 foreach entity in array array['party_contacts','party_addresses','party_bank_details','party_licenses','party_tax_registrations','party_documents','party_notes'] loop
  execute format('alter table public.%I add column archived_at timestamptz, add column archived_by bigint references public.user_profiles(id)',entity);
  execute format('alter table public.%I add constraint f06_child_archive_actor check ((archived_at is null)=(archived_by is null))',entity);
  if entity not in ('party_documents','party_notes') then
   execute format('alter table public.%I add constraint f06_child_archive_inactive check (archived_at is null or not is_active)',entity);
  end if;
  execute format('revoke delete on public.%I from public,anon,authenticated',entity);
 end loop;
end$$;

-- SECURITY INVOKER is deliberate: only an explicitly authorized postgres-owned
-- transaction may change archive metadata. Caller-controlled session settings
-- are not an authorization mechanism. Archived content itself is immutable.
create function erp_private.guard_party_child_archive() returns trigger
language plpgsql security invoker set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
 if (n->'archived_at',n->'archived_by') is distinct from (o->'archived_at',o->'archived_by')
  and (TG_OP='UPDATE' or n->>'archived_at' is not null or n->>'archived_by' is not null)
  and current_user<>'postgres' then raise exception 'Use the authorized archive action' using errcode='42501';end if;
 if TG_OP='UPDATE' and o->>'archived_at' is not null
  and (n-array['archived_at','archived_by','updated_at','updated_by','workspace_revision']) is distinct from
      (o-array['archived_at','archived_by','updated_at','updated_by','workspace_revision']) then
  raise exception 'Restore the archived record before editing it' using errcode='PT409';
 end if;
 return new;
end$$;
revoke all on function erp_private.guard_party_child_archive() from public,anon,authenticated,service_role;
do $$declare entity text;begin
 foreach entity in array array['party_contacts','party_addresses','party_bank_details','party_licenses','party_tax_registrations','party_documents','party_notes'] loop
  execute format('create trigger f06_child_archive_guard before insert or update on public.%I for each row execute function erp_private.guard_party_child_archive()',entity);
 end loop;
end$$;

-- Future evidence selections cannot reintroduce archived documents. Existing
-- links are retained, never detached or silently repaired by this migration.
create function erp_private.guard_party_archived_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text:=case TG_TABLE_NAME when 'party_bank_details' then 'verification_document_id' when 'party_licenses' then 'license_document_id' when 'party_tax_registrations' then 'certificate_document_id' end;
 n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
 if n->>field is not null and (TG_OP='INSERT' or n->field is distinct from o->field or (o->>'archived_at' is not null and n->>'archived_at' is null)) then
  perform 1 from public.party_documents where id=(n->>field)::bigint and party_id=new.party_id and archived_at is null for share;
  if not found then raise exception 'Evidence document is unavailable or archived' using errcode='23503';end if;
 end if;
 return new;
end$$;
alter function erp_private.guard_party_archived_evidence() owner to postgres;
revoke all on function erp_private.guard_party_archived_evidence() from public,anon,authenticated,service_role;
do $$declare entity text;begin
 foreach entity in array array['party_bank_details','party_licenses','party_tax_registrations'] loop
  execute format('create trigger f06_archived_evidence_guard before insert or update on public.%I for each row execute function erp_private.guard_party_archived_evidence()',entity);
 end loop;
end$$;

create function erp_private.set_party_child_archived(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_archived boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare permission_code text;code_field text;actor bigint;system_admin boolean;old_row jsonb;saved jsonb;
 parent_id bigint;parent public.parties%rowtype;previous erp_private.master_lifecycle_receipts%rowtype;
 h text;result jsonb;changed boolean;extra text;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 actor:=public.current_user_profile_id();system_admin:=public.current_user_has_role('system_admin');
 case p_entity
 when 'party_contacts' then permission_code:='master_data.parties.manage_contacts';code_field:='contact_code';
 when 'party_addresses' then permission_code:='master_data.parties.manage_addresses';code_field:='address_code';
 when 'party_bank_details' then permission_code:='master_data.parties.manage_bank_details';code_field:='bank_detail_code';
 when 'party_licenses' then permission_code:='master_data.parties.manage_licenses';code_field:='license_code';
 when 'party_tax_registrations' then permission_code:='master_data.parties.manage_tax';code_field:='tax_registration_code';
 when 'party_documents' then permission_code:='master_data.parties.manage_documents';code_field:='document_code';
 when 'party_notes' then permission_code:='master_data.parties.edit';code_field:='note_code';
 else raise exception 'Unsupported child record' using errcode='22023';
 end case;
 if not(system_admin or public.current_user_has_permission(permission_code)) or
  (p_entity not in ('party_bank_details','party_notes') and not(system_admin or public.current_user_has_permission('master_data.parties.view'))) then
  raise exception 'Permission denied' using errcode='42501';end if;
 if p_operation is null or p_archived is null or p_id is null or p_id not between 1 and 9007199254740991 or p_revision is null or p_revision<1 then
  raise exception 'Invalid lifecycle contract' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 h:=encode(sha256(convert_to(jsonb_build_array('party-child-archive',p_entity,p_id,p_revision,p_archived)::text,'UTF8')),'hex');
 select r.* into previous from erp_private.master_lifecycle_receipts r where r.actor=auth.uid() and r.operation_id=p_operation;
 if found and previous.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
 execute format('select party_id from public.%I where id=$1',p_entity) into parent_id using p_id;
 if parent_id is null then raise exception 'Record not found' using errcode='PT404';end if;
 select * into parent from public.parties where id=parent_id for share;
 if not found or (parent.is_locked and not system_admin) then raise exception 'Parent unavailable' using errcode='42501';end if;
 execute format('select to_jsonb(c) from public.%I c where id=$1 for update',p_entity) into old_row using p_id;
 if old_row is null then raise exception 'Record not found' using errcode='PT404';end if;
 if p_entity='party_notes' and not system_admin then
  if (old_row->>'created_by')::bigint is distinct from actor then raise exception 'Only the note author can archive or restore this note' using errcode='42501';end if;
  if old_row->>'is_private'<>'true' and not public.current_user_has_permission('master_data.parties.view') then raise exception 'Read permission denied' using errcode='42501';end if;
 end if;
 if previous.operation_id is not null then return previous.result||jsonb_build_object('replayed',true);end if;
 if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Record changed' using errcode='PT409';end if;
 changed:=(old_row->>'archived_at' is not null) is distinct from p_archived;
 if changed then
  if not p_archived and not parent.is_active then raise exception 'Restore the active parent first' using errcode='23503';end if;
  if p_archived and p_entity='party_documents' and (
   exists(select 1 from public.party_bank_details where verification_document_id=p_id and archived_at is null)
   or exists(select 1 from public.party_licenses where license_document_id=p_id and archived_at is null)
   or exists(select 1 from public.party_tax_registrations where certificate_document_id=p_id and archived_at is null)) then
   raise exception 'Document is still used as evidence; archive or replace its referring records first' using errcode='23503';end if;
  extra:=case when p_entity in ('party_documents','party_notes') then '' else ',is_active=false' end;
  execute format('update public.%I set archived_at=case when $1 then clock_timestamp() else null end,archived_by=case when $1 then $2 else null end,updated_by=$2%s where id=$3 returning to_jsonb(%I)',p_entity,extra,p_entity)
   into saved using p_archived,actor,p_id;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'MASTER_DATA',p_entity,p_id,saved->>code_field,case when p_archived then 'archive' else 'restore' end,
    jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision','archived',p_archived));
 else saved:=old_row;end if;
 result:=jsonb_build_object('id',p_id,'revision',saved->>'workspace_revision','changed',changed,'replayed',false,'archived',p_archived);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,p_entity,p_id,result);
 return result;
end$$;
alter function erp_private.set_party_child_archived(text,uuid,bigint,bigint,boolean) owner to postgres;
revoke all on function erp_private.set_party_child_archived(text,uuid,bigint,bigint,boolean) from public,anon,service_role;
grant execute on function erp_private.set_party_child_archived(text,uuid,bigint,bigint,boolean) to authenticated;
create function public.set_party_child_archived(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_archived boolean)
returns jsonb language sql security invoker set search_path='' as $$select erp_private.set_party_child_archived(p_entity,p_operation,p_id,p_revision,p_archived);$$;
revoke all on function public.set_party_child_archived(text,uuid,bigint,bigint,boolean) from public,anon,service_role;
grant execute on function public.set_party_child_archived(text,uuid,bigint,bigint,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
