begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Do not choose a winner among historical duplicates. Deployment preflight
-- must report them and obtain an explicit repair decision before this index.
do $$begin
 if exists(select 1 from public.erp_email_provider_configs where is_default and deleted_at is null group by is_default having count(*)>1) then
  raise exception 'Provider preflight required: multiple email defaults exist' using errcode='23505';
 end if;
end$$;
create unique index f06_email_one_default on public.erp_email_provider_configs(is_default)
 where is_default and deleted_at is null;
alter table public.erp_email_provider_configs add column workspace_revision bigint not null default 1;
alter table public.erp_ai_provider_configs add column workspace_revision bigint not null default 1;
create trigger f06_email_provider_revision before insert or update on public.erp_email_provider_configs
 for each row execute function erp_private.workspace_revision();
create trigger f06_ai_provider_revision before insert or update on public.erp_ai_provider_configs
 for each row execute function erp_private.workspace_revision();
alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check
 check(entity in ('departments','work_calendars','work_shifts','global_numbering_rules','erp_email_provider_configs','erp_ai_provider_configs'));

create function erp_private.validate_provider_configuration(kind text, v jsonb) returns void
language plpgsql set search_path='' as $$
declare k text; code text; provider text:=v->>'provider_type'; endpoint text; endpoint_port text;
begin
 code:=v->>case kind when 'email' then 'provider_code' else 'config_code' end;
 if code is null or code !~ '^[A-Z0-9_]{1,100}$' or nullif(btrim(v->>'provider_name'),'') is null or length(v->>'provider_name')>200 then
  raise exception 'Provider code or name is invalid' using errcode='22023';end if;
 foreach k in array array['is_default','is_enabled','is_active'] loop
  if jsonb_typeof(v->k) is distinct from 'boolean' then raise exception 'Use typed provider flags' using errcode='22023';end if;
 end loop;
 if (v->>'is_default')::boolean and not (v->>'is_active')::boolean then raise exception 'Choose a replacement default before deactivating this provider' using errcode='22023';end if;
 -- Provider JSON is reserved; no current adapter consumes configurable keys.
 -- A later adapter must introduce an explicit schema, not a secret store.
 if v->'config_json' is not null and v->'config_json' not in ('null'::jsonb,'{}'::jsonb) then
  raise exception 'Unrecognized provider configuration fields' using errcode='22023';end if;
 if kind='email' then
  if provider is null or provider not in ('microsoft_graph','smtp','sendgrid','mailgun','aws_ses','local_dev','custom')
   or v->>'auth_mode' is null or v->>'auth_mode' not in ('client_credentials','certificate','delegated_future')
   or v->>'send_mode' is null or v->>'send_mode' not in ('graph_send_mail','smtp_future') then
   raise exception 'Unsupported email configuration' using errcode='22023';end if;
  if (v->>'is_enabled')::boolean and (provider<>'microsoft_graph' or v->>'auth_mode'<>'client_credentials' or v->>'send_mode'<>'graph_send_mail') then
   raise exception 'This email adapter or authentication mode cannot be enabled yet' using errcode='22023';end if;
  foreach k in array array['sender_email','reply_to_email','default_recipient_for_tests'] loop
   if v->>k is not null and (length(v->>k)>254 or v->>k !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Invalid email address' using errcode='22023';end if;
  end loop;
  foreach k in array array['throttle_per_minute','daily_send_limit'] loop
   if v->>k is not null and (jsonb_typeof(v->k)<>'number' or v->>k !~ '^[0-9]+$' or (v->>k)::numeric not between 1 and 2147483647) then
    raise exception 'Provider limits must be positive integers or unset' using errcode='22023';end if;
  end loop;
  foreach k in array array['tenant_id','client_id'] loop
   if v->>k is not null and v->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Tenant and client identifiers must be UUIDs' using errcode='22023';end if;
  end loop;
  if v->>'graph_base_url' is not null and v->>'graph_base_url'<>'https://graph.microsoft.com/v1.0' then
   raise exception 'Graph endpoint must use the supported Microsoft endpoint' using errcode='22023';end if;
  if v->>'authority_url' is not null and v->>'authority_url' is distinct from 'https://login.microsoftonline.com/'||(v->>'tenant_id')||'/oauth2/v2.0/token' then
   raise exception 'Authority must match the configured Microsoft tenant' using errcode='22023';end if;
  if (v->>'is_enabled')::boolean and (v->>'tenant_id' is null or v->>'client_id' is null or v->>'sender_email' is null or v->>'secret_ref' is null) then
   raise exception 'Configure tenant, client, sender and protected credentials before enabling' using errcode='22023';end if;
 else
  if provider is null or provider not in ('openai','azure_openai','azure_document_intelligence','google_document_ai','aws_textract','tesseract','local_ollama','local_custom')
   or v->>'purpose' is null or v->>'purpose' not in ('general','chat','ocr','classification','extraction','embedding','dms','assistant') then
   raise exception 'Unsupported AI provider or purpose' using errcode='22023';end if;
  if jsonb_typeof(v->'requires_human_review') is distinct from 'boolean' or jsonb_typeof(v->'confidence_threshold') is distinct from 'number'
   or (v->>'confidence_threshold')::numeric not between 0 and 1 then raise exception 'Invalid AI review or confidence settings' using errcode='22023';end if;
  endpoint:=v->>'api_endpoint';
  if v->>'api_version' is not null and v->>'api_version' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-preview)?$' then
   raise exception 'API version must use YYYY-MM-DD or YYYY-MM-DD-preview' using errcode='22023';end if;
  if length(endpoint)>500 or length(v->>'model_id')>200 or length(v->>'notes')>1000 then
   raise exception 'Provider field exceeds its supported length' using errcode='22023';end if;
  if endpoint is not null and not (
   provider='openai' and endpoint ~ '^https://api\.openai\.com/v1/?$'
   or provider='azure_openai' and endpoint ~ '^https://[a-zA-Z0-9-]+\.openai\.azure\.com/?$'
   or provider='azure_document_intelligence' and endpoint ~ '^https://[a-zA-Z0-9-]+\.cognitiveservices\.azure\.com/?$'
   or provider='local_ollama' and endpoint ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?/?$'
  ) then raise exception 'Endpoint is not supported for this provider' using errcode='22023';end if;
  if provider='local_ollama' and endpoint is not null then
   endpoint_port:=substring(endpoint from ':([0-9]{1,5})/?$');
   if endpoint_port is not null and endpoint_port::integer not between 1 and 65535 then
    raise exception 'Local provider port must be between 1 and 65535' using errcode='22023';end if;
  end if;
  if (v->>'is_enabled')::boolean then
   if provider in ('google_document_ai','aws_textract','local_custom') then raise exception 'This AI adapter cannot be enabled yet' using errcode='22023';end if;
   if provider in ('openai','azure_openai','azure_document_intelligence') and v->>'secret_ref' is null then raise exception 'Configure protected credentials before enabling' using errcode='22023';end if;
   if provider in ('azure_openai','azure_document_intelligence') and endpoint is null then raise exception 'Provider endpoint is required' using errcode='22023';end if;
  end if;
 end if;
end$$;
alter function erp_private.validate_provider_configuration(text,jsonb) owner to postgres;
revoke all on function erp_private.validate_provider_configuration(text,jsonb) from public,anon,authenticated,service_role;

create function public.save_provider_configuration(p_kind text,p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entity text; identifier text; old_row jsonb; candidate jsonb; saved jsonb; payload jsonb; demoted jsonb;
 receipt erp_private.master_lifecycle_receipts; allowed text[]; h text; actor bigint; cols text; vals text; assigns text;
 changed boolean; result jsonb; purpose text; defaults jsonb;
begin
 if not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
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
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation already used for different inputs' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 -- Serialize only short configuration transactions, never HTTP/provider calls.
 -- No queue rows are locked here; F09 queue->provider admission order is retained.
 perform pg_advisory_xact_lock(hashtextextended('f06-provider:'||p_kind,0));
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 and deleted_at is null for update',entity) into old_row using p_id;
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
 if old_row->>'secret_ref' is not null and exists(select 1 from unnest(array['provider_type','tenant_id','client_id','authority_url','graph_base_url','api_endpoint','sender_email']) k where old_row->k is distinct from candidate->k)
  and not public.current_user_has_permission('settings.'||p_kind||'.secrets.manage') then
  raise exception 'Credential administration is required to change a credential-bound destination or identity' using errcode='42501';end if;
 -- Typed normalization before equality preserves false, zero and numeric no-ops.
 execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I,$1) r',entity) into candidate using candidate;
 changed:=old_row is null or exists(select 1 from jsonb_object_keys(payload) k where old_row->k is distinct from candidate->k);
 actor:=public.current_user_profile_id();
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
 return result;
end$$;
alter function public.save_provider_configuration(text,uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function public.save_provider_configuration(text,uuid,bigint,bigint,text,jsonb) from public,anon,service_role;
grant execute on function public.save_provider_configuration(text,uuid,bigint,bigint,text,jsonb) to authenticated;
-- CRUD must carry a revision and retained request. Existing narrow privileged
-- credential/health writers remain separate; no broad authenticated fallback.
revoke insert,update,delete on public.erp_email_provider_configs,public.erp_ai_provider_configs from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
