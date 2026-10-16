begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Health evidence is stored only by the authenticated server test action via a
-- service-only, fixed-field transaction. It cannot edit provider configuration.
create function public.record_provider_health(p_kind text,p_id bigint,p_revision bigint,p_actor bigint,p_ok boolean,p_duration integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare entity text; provider jsonb; saved jsonb; message text; capability text;
begin
 if p_kind is null or p_kind not in ('email','ai') or p_id is null or p_id<1 or p_revision is null or p_revision<1 or p_ok is null
  or p_duration is not null and p_duration not between 0 and 300000 then raise exception 'Invalid health receipt' using errcode='22023';end if;
 capability:='settings.'||p_kind||'.test';
 if not exists(select 1 from public.user_profiles u join public.user_roles a on a.user_profile_id=u.id
  join public.roles r on r.id=a.role_id where u.id=p_actor and u.status='active' and u.must_change_password=false
  and a.is_active and r.is_active and a.owner_company_id is null and a.branch_id is null
  and (r.role_code in ('system_admin','group_admin') or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
    where rp.role_id=r.id and p.is_active and (p.permission_code=capability or p_kind='email' and p.permission_code='settings.email.manage')))) then
  raise exception 'Test permission is no longer available' using errcode='42501';end if;
 entity:='erp_'||p_kind||'_provider_configs';
 execute format('select to_jsonb(t) from public.%I t where id=$1 and deleted_at is null and is_active for update',entity) into provider using p_id;
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
 return jsonb_build_object('ok',p_ok,'message',message,'revision',saved->>'workspace_revision','durationMs',p_duration);
end$$;
alter function public.record_provider_health(text,bigint,bigint,bigint,boolean,integer) owner to postgres;
revoke all on function public.record_provider_health(text,bigint,bigint,bigint,boolean,integer) from public,anon,authenticated;
grant execute on function public.record_provider_health(text,bigint,bigint,bigint,boolean,integer) to service_role;

create function erp_private.invalidate_provider_health() returns trigger language plpgsql set search_path='' as $$
declare before jsonb:=to_jsonb(old); after jsonb:=to_jsonb(new);
begin
 if exists(select 1 from unnest(array['secret_ref','provider_type','tenant_id','client_id','authority_url','graph_base_url','sender_email','auth_mode','send_mode','api_endpoint','model_id','api_version','config_json']) k where before->k is distinct from after->k) then
  new.last_test_status:='not_tested';new.last_test_at:=null;new.last_test_message:=null;
 end if;
 return new;
end$$;
alter function erp_private.invalidate_provider_health() owner to postgres;
revoke all on function erp_private.invalidate_provider_health() from public,anon,authenticated,service_role;
create trigger f06_email_health_invalidation before update on public.erp_email_provider_configs for each row execute function erp_private.invalidate_provider_health();
create trigger f06_ai_health_invalidation before update on public.erp_ai_provider_configs for each row execute function erp_private.invalidate_provider_health();
notify pgrst,'reload schema';
commit;
