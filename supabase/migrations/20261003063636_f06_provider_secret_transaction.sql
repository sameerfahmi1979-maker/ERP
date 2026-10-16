begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Reassert F01's ERP-only Vault boundary; never widen unrelated Vault access.
revoke all on function public.erp_vault_create_secret(text,text,text),public.erp_vault_get_secret(uuid),public.erp_vault_update_secret(uuid,text) from public,anon,authenticated;
grant execute on function public.erp_vault_create_secret(text,text,text),public.erp_vault_get_secret(uuid),public.erp_vault_update_secret(uuid,text) to service_role;

create table erp_private.provider_secret_receipts(
 actor_id bigint not null references public.user_profiles(id),
 operation_id uuid not null,
 provider_id bigint not null references public.erp_email_provider_configs(id),
 expected_revision bigint not null check(expected_revision>0),
 request_hash bytea not null,
 receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,operation_id)
);
alter table erp_private.provider_secret_receipts owner to postgres;
alter table erp_private.provider_secret_receipts enable row level security;
revoke all on erp_private.provider_secret_receipts from public,anon,authenticated;
grant select,insert on erp_private.provider_secret_receipts to service_role;

-- Auth tables are deliberately not granted to service_role. This private,
-- service-only boolean projection exposes no session/user data and cannot mutate
-- authentication. The calling transaction separately rechecks the ERP grant.
create function erp_private.provider_actor_session_valid(p_actor bigint,p_session uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_profiles p join auth.users u on u.id=p.auth_user_id
  join auth.sessions s on s.user_id=u.id and s.id=p_session where p.id=p_actor
  and (s.not_after is null or s.not_after>now()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<now()));
$$;
alter function erp_private.provider_actor_session_valid(bigint,uuid) owner to postgres;
revoke all on function erp_private.provider_actor_session_valid(bigint,uuid) from public,anon,authenticated;
grant execute on function erp_private.provider_actor_session_valid(bigint,uuid) to service_role;

-- Only the server supplies the authenticated actor/session. Null secret is a
-- read-only receipt probe, enabling recovery without retaining browser secrets.
create function public.save_email_provider_secret(p_actor bigint,p_session uuid,p_id bigint,p_revision bigint,p_operation uuid,p_secret text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.erp_email_provider_configs%rowtype; prior erp_private.provider_secret_receipts%rowtype;
 secret_id uuid; previous_secret text; fingerprint bytea; result jsonb; changed boolean;
begin
 if p_actor is null or p_session is null or p_id is null or p_id<1 or p_revision is null or p_revision<1 or p_operation is null
  or p_secret is not null and (length(p_secret)>500 or length(btrim(p_secret))=0) then raise exception 'Invalid protected credential request' using errcode='22023';end if;
 if not erp_private.provider_actor_session_valid(p_actor,p_session) or not exists(select 1 from public.user_profiles u
  join public.user_roles a on a.user_profile_id=u.id join public.roles r on r.id=a.role_id
  where u.id=p_actor and u.status='active' and u.must_change_password=false
  and a.is_active and r.is_active and a.owner_company_id is null and a.branch_id is null
  and (r.role_code in ('system_admin','group_admin') or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id=r.id and p.is_active and p.permission_code='settings.email.secrets.manage'))) then
  raise exception 'Active global credential administration is required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-email-secret:'||p_actor||':'||p_operation,0));
 select * into target from public.erp_email_provider_configs where id=p_id and deleted_at is null and is_active for update;
 if not found then raise exception 'Provider unavailable' using errcode='PT404';end if;
 if target.provider_type<>'microsoft_graph' then raise exception 'Credential storage is unsupported for this provider' using errcode='22023';end if;
 -- This digest is only in a private service-only receipt; no raw credential,
 -- reference or fingerprint is placed in audit logs or client responses.
 if p_secret is not null then fingerprint:=extensions.digest(convert_to(p_actor||':'||p_id||':'||p_revision||':'||p_operation||':'||p_secret,'UTF8'),'sha256');end if;
 select * into prior from erp_private.provider_secret_receipts where actor_id=p_actor and operation_id=p_operation;
 if found then
  if prior.provider_id<>p_id or prior.expected_revision<>p_revision or p_secret is not null and prior.request_hash is distinct from fingerprint then
   raise exception 'Save identity was reused with different inputs' using errcode='PT409';end if;
  return prior.receipt||jsonb_build_object('replayed',true);
 end if;
 if p_secret is null then raise exception 'No completed save was found for this operation' using errcode='PT404';end if;
 if target.workspace_revision<>p_revision then raise exception 'Provider changed before credential save' using errcode='PT409';end if;
 if target.secret_ref ~* '^vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  secret_id:=substring(target.secret_ref from 7)::uuid;
  previous_secret:=public.erp_vault_get_secret(secret_id);
  if previous_secret is null then raise exception 'Existing protected credential unavailable; reconciliation required' using errcode='22023';end if;
 end if;
 changed:=previous_secret is distinct from p_secret;
 if changed then
  if secret_id is null then
   secret_id:=public.erp_vault_create_secret(p_secret,'erp_email_provider_'||p_id||'_'||p_operation,'ERP protected email credential');
  else
   -- Vault update, provider revision/health and audit commit or roll back together.
   perform public.erp_vault_update_secret(secret_id,p_secret);
  end if;
  update public.erp_email_provider_configs set secret_ref='vault:'||secret_id,masked_secret_preview='Configured',
   last_test_status='not_tested',last_test_at=null,last_test_message=null,updated_by=p_actor,updated_at=clock_timestamp()
   where id=p_id returning * into target;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  values(p_actor,'SETTINGS','erp_email_provider_configs',p_id,target.provider_code,'update',jsonb_build_object('credential_updated',true,'operation_id',p_operation,'revision',target.workspace_revision));
 end if;
 result:=jsonb_build_object('id',p_id,'revision',target.workspace_revision::text,'changed',changed,'replayed',false);
 insert into erp_private.provider_secret_receipts(actor_id,operation_id,provider_id,expected_revision,request_hash,receipt)
 values(p_actor,p_operation,p_id,p_revision,fingerprint,result);
 return result;
end$$;
alter function public.save_email_provider_secret(bigint,uuid,bigint,bigint,uuid,text) owner to postgres;
revoke all on function public.save_email_provider_secret(bigint,uuid,bigint,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.save_email_provider_secret(bigint,uuid,bigint,bigint,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
