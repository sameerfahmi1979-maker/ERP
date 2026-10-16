-- F06 current authority after concurrent waits. Source-only until isolated verification.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.save_provider_configuration(p_kind text,p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entity text; identifier text; old_row jsonb; candidate jsonb; saved jsonb; payload jsonb; demoted jsonb;
 receipt erp_private.master_lifecycle_receipts; allowed text[]; h text; actor bigint; cols text; vals text; assigns text;
 changed boolean; result jsonb; purpose text; defaults jsonb;actor_uid uuid;requires_secret_authority boolean:=false;
begin
 actor_uid:=auth.uid();actor:=public.current_user_profile_id();
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('email','ai') or p_operation is null or p_action is null or p_action not in ('save','default','archive')
  or p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>16000
  or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1))
  or (p_id is null and (p_revision is not null or p_action<>'save')) then raise exception 'Invalid save contract' using errcode='22023';end if;
 if not public.current_user_has_permission('settings.'||p_kind||'.manage') then raise exception 'Global provider management permission required' using errcode='42501';end if;
 entity:='erp_'||p_kind||'_provider_configs';identifier:=case p_kind when 'email' then 'provider_code' else 'config_code' end;
 allowed:=array[identifier,'provider_type','provider_name','is_default','is_enabled','is_active','config_json','notes']||case p_kind when 'email' then
  array['tenant_id','client_id','authority_url','graph_base_url','sender_email','sender_display_name','reply_to_email','auth_mode','send_mode','default_recipient_for_tests','throttle_per_minute','daily_send_limit']
  else array['api_endpoint','model_id','api_version','purpose','requires_human_review','confidence_threshold'] end;
 if exists(select 1 from jsonb_object_keys(p_data) k where not k=any(allowed)) or (p_action<>'save' and p_data<>'{}'::jsonb) then
  raise exception 'Protected configuration fields' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_data) e where
  (e.key=any(array['is_default','is_enabled','is_active','requires_human_review']) and jsonb_typeof(e.value)<>'boolean')
  or (e.key=any(array['throttle_per_minute','daily_send_limit','confidence_threshold']) and jsonb_typeof(e.value) not in ('number','null'))
  or (not e.key=any(array['is_default','is_enabled','is_active','requires_human_review','throttle_per_minute','daily_send_limit','confidence_threshold','config_json']) and jsonb_typeof(e.value) not in ('string','null'))) then
  raise exception 'Use typed configuration values' using errcode='22023';end if;
 h:=md5(jsonb_build_array('provider',p_kind,p_action,p_id,p_revision,p_data)::text);
 -- Validate before record coercion: a numeric column's scale must not round an
 -- out-of-range confidence into an apparently valid value.
 if exists(select 1 from jsonb_each(p_data) e where e.key=any(array['throttle_per_minute','daily_send_limit']) and e.value<>'null'::jsonb and e.value::text !~ '^[0-9]+$')
  or p_data?'confidence_threshold' and (p_data->>'confidence_threshold' is null or (p_data->>'confidence_threshold')::numeric not between 0 and 1) then
  raise exception 'Invalid provider numeric value' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 -- F06 current-authority operation begin
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 if public.current_user_has_permission('settings.'||p_kind||'.manage') is not true then
  raise exception 'Global provider management permission required' using errcode='42501';end if;
 -- F06 current-authority operation end

 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation already used for different inputs' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 -- Serialize only short configuration transactions, never HTTP/provider calls.
 -- No queue rows are locked here; F09 queue->provider admission order is retained.
 perform pg_advisory_xact_lock(hashtextextended('f06-provider:'||p_kind,0));
 -- F06 current-authority kind begin
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 if public.current_user_has_permission('settings.'||p_kind||'.manage') is not true then
  raise exception 'Global provider management permission required' using errcode='42501';end if;
 -- F06 current-authority kind end

 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 and deleted_at is null for update',entity) into old_row using p_id;
 -- F06 current-authority target begin
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 if public.current_user_has_permission('settings.'||p_kind||'.manage') is not true then
  raise exception 'Global provider management permission required' using errcode='42501';end if;
 -- F06 current-authority target end

  if old_row is null then raise exception 'Provider configuration not found' using errcode='PT404';end if;
  if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Provider configuration changed' using errcode='PT409';end if;
  if p_data?identifier and p_data->identifier is distinct from old_row->identifier then raise exception 'Provider code cannot be changed' using errcode='22023';end if;
 end if;
 defaults:=jsonb_build_object('is_default',false,'is_enabled',false,'is_active',true,'config_json',null)||case p_kind when 'email' then
  jsonb_build_object('auth_mode','client_credentials','send_mode','graph_send_mail','graph_base_url','https://graph.microsoft.com/v1.0')
  else jsonb_build_object('purpose','general','requires_human_review',true,'confidence_threshold',0.85) end;
 payload:=case when old_row is null then defaults else '{}'::jsonb end||p_data;
 if p_action='default' then payload:=payload||jsonb_build_object('is_default',true);end if;
 if p_action='archive' then payload:=payload||jsonb_build_object('deleted_at',clock_timestamp(),'is_enabled',false,'is_active',false);end if;
 candidate:=coalesce(old_row,'{}'::jsonb)||payload;
 if old_row is not null and (old_row->>'is_default')::boolean and
  (not (candidate->>'is_default')::boolean or p_action='archive' or old_row->'purpose' is distinct from candidate->'purpose') then
  raise exception 'Choose a replacement default before retiring or changing its purpose' using errcode='22023';end if;
 requires_secret_authority:=old_row->>'secret_ref' is not null and exists(select 1 from unnest(array['provider_type','tenant_id','client_id','authority_url','graph_base_url','api_endpoint','sender_email']) k where old_row->k is distinct from candidate->k);
 if requires_secret_authority and public.current_user_has_permission('settings.'||p_kind||'.secrets.manage') is not true then
  raise exception 'Credential administration is required to change a credential-bound destination or identity' using errcode='42501';end if;
 -- Typed normalization before equality preserves false, zero and numeric no-ops.
 execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I,$1) r',entity) into candidate using candidate;
 changed:=old_row is null or exists(select 1 from jsonb_object_keys(payload) k where old_row->k is distinct from candidate->k);
 if changed then
  -- Retirement preserves legacy payload/history without requiring unrelated
  -- obsolete settings to be repaired. All normal saves validate the candidate.
  if p_action<>'archive' then perform erp_private.validate_provider_configuration(p_kind,candidate);end if;
  purpose:=coalesce(candidate->>'purpose','email');
  if (candidate->>'is_default')::boolean then
   for demoted in execute format('update public.%I t set is_default=false,updated_by=$1,updated_at=clock_timestamp() where is_default and deleted_at is null and ($2 is null or id<>$2) and %s returning to_jsonb(t)',entity,case p_kind when 'email' then 'true' else 'purpose=$3' end) using actor,p_id,purpose loop
    insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
    values(actor,'SETTINGS',entity,(demoted->>'id')::bigint,demoted->>identifier,'update',jsonb_build_object('operation_id',p_operation,'is_default',false,'revision',demoted->>'workspace_revision'));
   end loop;
  end if;
  payload:=payload||jsonb_build_object('updated_by',actor,'updated_at',clock_timestamp());
  if p_id is null then payload:=payload||jsonb_build_object('created_by',actor);end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),string_agg(format('%I=r.%I',k,k),',' order by k)
   into cols,vals,assigns from jsonb_object_keys(payload) k;
  if p_id is null then
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I)',entity,cols,vals,entity,entity) into saved using payload;
  else
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t)',entity,assigns,entity) into saved using payload,p_id;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
  values(actor,'SETTINGS',entity,(saved->>'id')::bigint,saved->>identifier,case when p_id is null then 'create' when p_action='archive' then 'archive' else 'update' end,
   case when old_row is null then null else jsonb_build_object('revision',old_row->>'workspace_revision') end,
   jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision','changed_fields',to_jsonb(array(select jsonb_object_keys(payload)))));
 else saved:=old_row;end if;
 result:=jsonb_build_object('id',saved->'id','revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,entity,(saved->>'id')::bigint,result);
 -- F06 current-authority terminal begin
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 if public.current_user_has_permission('settings.'||p_kind||'.manage') is not true then
  raise exception 'Global provider management permission required' using errcode='42501';end if;
 if requires_secret_authority and public.current_user_has_permission('settings.'||p_kind||'.secrets.manage') is not true then
  raise exception 'Credential administration is required to change a credential-bound destination or identity' using errcode='42501';end if;
 -- F06 current-authority terminal end

 return result;
end$$;
alter function public.save_provider_configuration(text,uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function public.save_provider_configuration(text,uuid,bigint,bigint,text,jsonb) from public,anon,service_role;
grant execute on function public.save_provider_configuration(text,uuid,bigint,bigint,text,jsonb) to authenticated;
create or replace function public.save_provider_feature_flag(p_kind text,p_code text,p_operation uuid,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entity text; old_row jsonb; candidate jsonb; saved jsonb; result jsonb; h text; allowed text[]; changed boolean; actor bigint;actor_uid uuid;
 receipt erp_private.master_lifecycle_receipts; assigns text; payload jsonb;
begin
 actor_uid:=auth.uid();actor:=public.current_user_profile_id();
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
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
 -- F06 current-authority operation begin
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 if (public.current_user_has_permission('settings.'||p_kind||'.manage')
  or p_kind='email' and public.current_user_has_permission('settings.email.feature_flags.manage')) is not true then
  raise exception 'Global flag administration required' using errcode='42501';end if;
 -- F06 current-authority operation end

 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation already used with other values' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 execute format('select to_jsonb(t) from public.%I t where feature_code=$1 for update',entity) into old_row using p_code;
 -- F06 current-authority target begin
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 if (public.current_user_has_permission('settings.'||p_kind||'.manage')
  or p_kind='email' and public.current_user_has_permission('settings.email.feature_flags.manage')) is not true then
  raise exception 'Global flag administration required' using errcode='42501';end if;
 -- F06 current-authority target end

 if old_row is null then raise exception 'Feature flag not found' using errcode='PT404';end if;
 if (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Feature flag changed' using errcode='PT409';end if;
 execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I,$1) r',entity) into candidate using old_row||p_data;
 changed:=exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);
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
 -- F06 current-authority terminal begin
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 if (public.current_user_has_permission('settings.'||p_kind||'.manage')
  or p_kind='email' and public.current_user_has_permission('settings.email.feature_flags.manage')) is not true then
  raise exception 'Global flag administration required' using errcode='42501';end if;
 -- F06 current-authority terminal end

 return result;
end$$;
alter function public.save_provider_feature_flag(text,text,uuid,bigint,jsonb) owner to postgres;
revoke all on function public.save_provider_feature_flag(text,text,uuid,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_provider_feature_flag(text,text,uuid,bigint,jsonb) to authenticated;
create or replace function public.save_email_provider_secret(p_actor bigint,p_session uuid,p_id bigint,p_revision bigint,p_operation uuid,p_secret text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.erp_email_provider_configs%rowtype; prior erp_private.provider_secret_receipts%rowtype;
 secret_id uuid; previous_secret text; fingerprint bytea; result jsonb; changed boolean;
begin
 if p_actor is null or p_session is null or p_id is null or p_id<1 or p_revision is null or p_revision<1 or p_operation is null
  or p_secret is not null and (length(p_secret)>500 or length(btrim(p_secret))=0) then raise exception 'Invalid protected credential request' using errcode='22023';end if;
 if erp_private.provider_actor_session_valid(p_actor,p_session) is not true or not exists(select 1 from public.user_profiles u
  join public.user_roles a on a.user_profile_id=u.id join public.roles r on r.id=a.role_id
  where u.id=p_actor and u.status='active' and u.must_change_password=false
  and a.is_active and r.is_active and a.owner_company_id is null and a.branch_id is null
  and (r.role_code in ('system_admin','group_admin') or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id=r.id and p.is_active and p.permission_code='settings.email.secrets.manage'))) then
  raise exception 'Active global credential administration is required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-email-secret:'||p_actor||':'||p_operation,0));
 -- F06 current-authority operation begin
 if erp_private.provider_actor_session_valid(p_actor,p_session) is not true or not exists(select 1 from public.user_profiles u
  join public.user_roles a on a.user_profile_id=u.id join public.roles r on r.id=a.role_id
  where u.id=p_actor and u.status='active' and u.must_change_password=false
  and a.is_active and r.is_active and a.owner_company_id is null and a.branch_id is null
  and (r.role_code in ('system_admin','group_admin') or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id=r.id and p.is_active and p.permission_code='settings.email.secrets.manage'))) then
  raise exception 'Active global credential administration is required' using errcode='42501';end if;
 -- F06 current-authority operation end

 select * into target from public.erp_email_provider_configs where id=p_id and deleted_at is null and is_active for update;
 -- F06 current-authority target begin
 if erp_private.provider_actor_session_valid(p_actor,p_session) is not true or not exists(select 1 from public.user_profiles u
  join public.user_roles a on a.user_profile_id=u.id join public.roles r on r.id=a.role_id
  where u.id=p_actor and u.status='active' and u.must_change_password=false
  and a.is_active and r.is_active and a.owner_company_id is null and a.branch_id is null
  and (r.role_code in ('system_admin','group_admin') or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id=r.id and p.is_active and p.permission_code='settings.email.secrets.manage'))) then
  raise exception 'Active global credential administration is required' using errcode='42501';end if;
 -- F06 current-authority target end

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
 -- F06 current-authority terminal begin
 if erp_private.provider_actor_session_valid(p_actor,p_session) is not true or not exists(select 1 from public.user_profiles u
  join public.user_roles a on a.user_profile_id=u.id join public.roles r on r.id=a.role_id
  where u.id=p_actor and u.status='active' and u.must_change_password=false
  and a.is_active and r.is_active and a.owner_company_id is null and a.branch_id is null
  and (r.role_code in ('system_admin','group_admin') or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id=r.id and p.is_active and p.permission_code='settings.email.secrets.manage'))) then
  raise exception 'Active global credential administration is required' using errcode='42501';end if;
 -- F06 current-authority terminal end

 return result;
end$$;
alter function public.save_email_provider_secret(bigint,uuid,bigint,bigint,uuid,text) owner to postgres;
revoke all on function public.save_email_provider_secret(bigint,uuid,bigint,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.save_email_provider_secret(bigint,uuid,bigint,bigint,uuid,text) to service_role;
-- Sessionless health evidence is deliberately removed. Deploy the matching server wrapper together.
revoke all on function public.record_provider_health(text,bigint,bigint,bigint,boolean,integer) from public,anon,authenticated,service_role;
drop function public.record_provider_health(text,bigint,bigint,bigint,boolean,integer);
create function public.record_provider_health(p_kind text,p_id bigint,p_revision bigint,p_actor bigint,p_session uuid,p_ok boolean,p_duration integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare entity text; provider jsonb; saved jsonb; message text; capability text;
begin
 if p_kind is null or p_kind not in ('email','ai') or p_id is null or p_id<1 or p_revision is null or p_revision<1 or p_ok is null
  or p_duration is not null and p_duration not between 0 and 300000 then raise exception 'Invalid health receipt' using errcode='22023';end if;
 capability:='settings.'||p_kind||'.test';
 if p_actor is null or p_session is null or erp_private.provider_actor_session_valid(p_actor,p_session) is not true or not exists(select 1 from public.user_profiles u join public.user_roles a on a.user_profile_id=u.id
  join public.roles r on r.id=a.role_id where u.id=p_actor and u.status='active' and u.must_change_password=false
  and a.is_active and r.is_active and a.owner_company_id is null and a.branch_id is null
  and (r.role_code in ('system_admin','group_admin') or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
    where rp.role_id=r.id and p.is_active and (p.permission_code=capability or p_kind='email' and p.permission_code='settings.email.manage')))) then
  raise exception 'Test permission is no longer available' using errcode='42501';end if;
 entity:='erp_'||p_kind||'_provider_configs';
 execute format('select to_jsonb(t) from public.%I t where id=$1 and deleted_at is null and is_active for update',entity) into provider using p_id;
 -- F06 current-authority target begin
 if p_actor is null or p_session is null or erp_private.provider_actor_session_valid(p_actor,p_session) is not true or not exists(select 1 from public.user_profiles u join public.user_roles a on a.user_profile_id=u.id
  join public.roles r on r.id=a.role_id where u.id=p_actor and u.status='active' and u.must_change_password=false
  and a.is_active and r.is_active and a.owner_company_id is null and a.branch_id is null
  and (r.role_code in ('system_admin','group_admin') or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
    where rp.role_id=r.id and p.is_active and (p.permission_code=capability or p_kind='email' and p.permission_code='settings.email.manage')))) then
  raise exception 'Test permission is no longer available' using errcode='42501';end if;
 -- F06 current-authority target end

 if provider is null then raise exception 'Provider unavailable' using errcode='PT404';end if;
 if (provider->>'workspace_revision')::bigint<>p_revision then raise exception 'Configuration changed during the test; result not recorded' using errcode='PT409';end if;
 message:=case when p_ok then 'Connection check passed. This is not proof of email delivery or a complete AI business operation.'
  else 'Connection check failed. Review supported provider, endpoint and credential settings; external error details are withheld.' end;
 execute format('update public.%I t set last_test_status=$1,last_test_at=clock_timestamp(),last_test_message=$2,updated_by=$3,updated_at=clock_timestamp() where id=$4 returning to_jsonb(t)',entity)
  into saved using case when p_ok then 'success' else 'failed' end,message,p_actor,p_id;
 if p_kind='email' then
  insert into public.erp_email_send_logs(provider_config_id,feature_area,operation_type,status,duration_ms,last_error,created_by,metadata_json)
  values(p_id,'settings_test','test_connection','skipped',p_duration,case when p_ok then null else message end,p_actor,jsonb_build_object('connection_ok',p_ok,'email_sent',false));
 else
  insert into public.erp_ai_usage_logs(provider_config_id,feature_area,operation_type,status,duration_ms,error_message,created_by)
  values(p_id,'settings_test','test_connection',case when p_ok then 'success' else 'failed' end,p_duration,case when p_ok then null else message end,p_actor);
 end if;
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(p_actor,'SETTINGS',entity,p_id,provider->>case p_kind when 'email' then 'provider_code' else 'config_code' end,
  case when p_ok then 'test_success' else 'test_failed' end,jsonb_build_object('ok',p_ok,'revision',saved->>'workspace_revision','delivery_verified',false));
 -- F06 current-authority terminal begin
 if p_actor is null or p_session is null or erp_private.provider_actor_session_valid(p_actor,p_session) is not true or not exists(select 1 from public.user_profiles u join public.user_roles a on a.user_profile_id=u.id
  join public.roles r on r.id=a.role_id where u.id=p_actor and u.status='active' and u.must_change_password=false
  and a.is_active and r.is_active and a.owner_company_id is null and a.branch_id is null
  and (r.role_code in ('system_admin','group_admin') or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
    where rp.role_id=r.id and p.is_active and (p.permission_code=capability or p_kind='email' and p.permission_code='settings.email.manage')))) then
  raise exception 'Test permission is no longer available' using errcode='42501';end if;
 -- F06 current-authority terminal end

 return jsonb_build_object('ok',p_ok,'message',message,'revision',saved->>'workspace_revision','durationMs',p_duration);
end$$;
alter function public.record_provider_health(text,bigint,bigint,bigint,uuid,boolean,integer) owner to postgres;
revoke all on function public.record_provider_health(text,bigint,bigint,bigint,uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.record_provider_health(text,bigint,bigint,bigint,uuid,boolean,integer) to service_role;
notify pgrst,'reload schema';
commit;
