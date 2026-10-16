begin;

-- Keep the PL/pgSQL lock-row variable distinct from the SQL roles alias r.
-- Preserve witness capture/rechecks, lock order, scope and callable rights.
create or replace function erp_private.lock_batch_admission_authority(needs_party boolean default false)
returns table(actor bigint,company bigint,branch bigint) language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare uid uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; locked_row record; witnesses jsonb; dms_allowed boolean; party_allowed boolean;
begin
 if uid is null or current_setting('transaction_isolation')<>'read committed' then raise exception 'Batch permission denied' using errcode='42501';end if;
 perform 1 from auth.users where id=uid for share;
 perform 1 from auth.sessions where user_id=uid and id::text=sid for share;
 select id,owner_company_id,branch_id into actor,company,branch from public.user_profiles where auth_user_id=uid for share;
 if actor is null then raise exception 'Batch permission denied' using errcode='42501';end if;
 -- Capture complete chains ONCE. Final authorization may use only these
 -- captured IDs, never a newly inserted assignment found by a later snapshot.
 -- Capture all self chains as a conservative superset, including party-read
 -- dependencies when context needs them; only matching live chains authorize.
 select coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) into witnesses from (
  select ur.id assignment,r.id role,rp.id pair,p.id permission
  from public.user_roles ur join public.roles r on r.id=ur.role_id
  left join public.role_permissions rp on rp.role_id=r.id left join public.permissions p on p.id=rp.permission_id
  where ur.user_profile_id=actor
 ) w;
 for locked_row in select distinct (value->>'assignment')::bigint id from jsonb_array_elements(witnesses) order by id loop
  perform 1 from public.user_roles where id=locked_row.id for share;
 end loop;
 for locked_row in select distinct (value->>'role')::bigint id from jsonb_array_elements(witnesses) order by id loop
  perform 1 from public.roles where id=locked_row.id for share;
 end loop;
 for locked_row in select distinct (value->>'pair')::bigint id from jsonb_array_elements(witnesses) where value->>'pair' is not null order by id loop
  perform 1 from public.role_permissions where id=locked_row.id for share;
 end loop;
 for locked_row in select distinct (value->>'permission')::bigint id from jsonb_array_elements(witnesses) where value->>'permission' is not null order by id loop
  perform 1 from public.permissions where id=locked_row.id for share;
 end loop;
 -- A second statement after every possible wait rebinds the locked self tuple.
 select p.id,p.owner_company_id,p.branch_id into actor,company,branch from public.user_profiles p where p.auth_user_id=uid;
 -- Rejoin every captured edge after waits; a changed role/pair association,
 -- revocation or scope move cannot borrow a new uncaptured complete witness.
 select coalesce(bool_or(
   (r.role_code in ('system_admin','group_admin') and ur.owner_company_id is null and ur.branch_id is null)
   or (p.is_active and p.permission_code in ('dms.documents.upload','dms.admin')
    and ((ur.owner_company_id is null and ur.branch_id is null) or (ur.owner_company_id=company and (ur.branch_id is null or ur.branch_id=branch))))),false),
  coalesce(bool_or(
   (r.role_code in ('system_admin','group_admin') and ur.owner_company_id is null and ur.branch_id is null)
   or (p.is_active and p.permission_code in ('master_data.parties.view','master_data.party_master.view')
    and ur.owner_company_id is null and ur.branch_id is null)),false)
 into dms_allowed,party_allowed
 from jsonb_array_elements(witnesses) w
 join public.user_roles ur on ur.id=(w.value->>'assignment')::bigint and ur.user_profile_id=actor and ur.is_active
 join public.roles r on r.id=(w.value->>'role')::bigint and ur.role_id=r.id and r.is_active
 left join public.role_permissions rp on rp.id=(w.value->>'pair')::bigint and rp.role_id=r.id
 left join public.permissions p on p.id=(w.value->>'permission')::bigint and rp.permission_id=p.id;
 if actor is null or not erp_private.business_principal_is_active() or not dms_allowed or (needs_party and not party_allowed) then
  raise exception 'Batch permission denied' using errcode='42501';end if;
 return next;
end $$;
alter function erp_private.lock_batch_admission_authority(boolean) owner to postgres;
revoke all on function erp_private.lock_batch_admission_authority(boolean) from public,anon,service_role;
grant execute on function erp_private.lock_batch_admission_authority(boolean) to authenticated;

commit;
