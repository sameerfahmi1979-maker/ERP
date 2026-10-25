BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- Company administrators use existing idempotent/revision-checked RPCs.
-- Ordinary roles, direct-table writes and branch authority stay unchanged.
CREATE FUNCTION erp_private.company_signatory_admitted(p_write boolean,p_company_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.company_signatory_admitted($1) OR (
 erp_private.business_principal_is_active() AND EXISTS(SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id JOIN public.owner_companies c ON c.id=a.owner_company_id
 WHERE a.user_profile_id=public.current_user_profile_id() AND a.is_active AND r.is_active AND r.is_system_role AND r.role_code='company_admin'
 AND a.owner_company_id=$2 AND a.branch_id IS NULL AND c.status='active')
 AND erp_private.permission_in_scope('organizations.view',$2,NULL)
 AND (NOT $1 OR erp_private.permission_in_scope('organizations.manage',$2,NULL)));
$$;
REVOKE ALL ON FUNCTION erp_private.company_signatory_admitted(boolean,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.read_company_signatories(p_company_id bigint, p_after bigint, p_limit integer)
 RETURNS SETOF owner_company_signatories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if not erp_private.company_signatory_admitted(false,p_company_id) then raise exception 'Company signatory read permission required' using errcode='42501';end if;
 if p_company_id is null or p_company_id not between 1 and 9007199254740991 or p_after is null or p_after not between 0 and 9007199254740991 or p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid signatory read request' using errcode='22023';end if;
 if not exists(select 1 from public.owner_companies where id=p_company_id) then raise exception 'Company unavailable' using errcode='PT404';end if;
 return query select s.* from public.owner_company_signatories s where s.company_id=p_company_id and s.id>p_after order by s.id limit p_limit;
end$function$
;
CREATE OR REPLACE FUNCTION erp_private.save_company_signatory(p_operation uuid, p_company_id bigint, p_id bigint, p_revision bigint, p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 prior public.owner_company_signatories%rowtype;candidate public.owner_company_signatories%rowtype;saved public.owner_company_signatories%rowtype;
 receipt erp_private.master_lifecycle_receipts%rowtype; actor bigint;h text;payload jsonb;k text;result jsonb;changed boolean;
 allowed text[]:=array['full_name','user_id','designation','signature_scope','is_primary','is_active','effective_from','effective_to','notes'];
 required text[]:=array['full_name','designation','signature_scope','is_primary','is_active','effective_from','effective_to','notes'];
begin
 if not erp_private.company_signatory_admitted(true,p_company_id) then raise exception 'Company signatory read and management permission required' using errcode='42501';end if;
 if p_operation is null or p_company_id is null or p_company_id not between 1 and 9007199254740991
  or (p_id is not null and p_id not between 1 and 9007199254740991) or (p_revision is not null and p_revision<1)
  or ((p_id is null)<>(p_revision is null)) or p_action is null or p_action not in ('save','archive','restore')
  or (p_id is null and p_action<>'save') or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>20000
  then raise exception 'Invalid signatory save contract' using errcode='22023';end if;
 if p_action<>'save' and p_data<>'{}'::jsonb then raise exception 'Lifecycle fields are protected' using errcode='22023';end if;
 if p_action='save' then
  if not(p_data ?& required) or exists(select 1 from jsonb_object_keys(p_data) f where not(f=any(allowed))) then raise exception 'Incomplete or protected signatory fields' using errcode='22023';end if;
  if jsonb_typeof(p_data->'full_name')<>'string' or jsonb_typeof(p_data->'is_primary')<>'boolean' or jsonb_typeof(p_data->'is_active')<>'boolean'
   or exists(select 1 from jsonb_each(p_data) e where e.key in ('designation','signature_scope','effective_from','effective_to','notes') and jsonb_typeof(e.value) not in ('string','null'))
   or (p_data ? 'user_id' and jsonb_typeof(p_data->'user_id')<>'null' and (jsonb_typeof(p_data->'user_id')<>'number'
     or (p_data->>'user_id')::numeric<>trunc((p_data->>'user_id')::numeric) or (p_data->>'user_id')::numeric not between 1 and 9007199254740991)) then raise exception 'Use typed signatory values' using errcode='22023';end if;
  foreach k in array array['effective_from','effective_to'] loop
   if p_data->>k is not null and (p_data->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or substring(p_data->>k,1,4)::integer<1 or to_char((p_data->>k)::date,'YYYY-MM-DD')<>p_data->>k) then raise exception 'Invalid signatory calendar date' using errcode='22023';end if;
  end loop;
 end if;
 actor:=public.current_user_profile_id();
 h:=encode(sha256(convert_to(jsonb_build_array('company-signatory',p_company_id,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 -- Match administration lock order before taking the ordinary parent row lock.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
 select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=auth.uid() and r.operation_id=p_operation;
 if found and (receipt.request_hash<>h or receipt.entity<>'owner_company_signatories') then raise exception 'Operation input changed' using errcode='22023';end if;
 perform 1 from public.owner_companies where id=p_company_id for update;
 if not found then raise exception 'Company unavailable' using errcode='PT404';end if;
 select * into prior from public.owner_company_signatories where id=coalesce(p_id,receipt.record_id) for update;
 if (p_id is not null or receipt.record_id is not null) and (prior.id is null or prior.company_id<>p_company_id) then raise exception 'Signatory unavailable for this company' using errcode='PT404';end if;
 if not erp_private.company_signatory_admitted(true,p_company_id) then raise exception 'Signatory permission changed' using errcode='42501';end if;
 if receipt.operation_id is not null then return receipt.result||jsonb_build_object('replayed',true);end if;
 if prior.id is not null and prior.workspace_revision is distinct from p_revision then raise exception 'Signatory changed' using errcode='PT409';end if;
 if p_action='save' then
  if prior.deleted_at is not null then raise exception 'Restore this signatory before editing' using errcode='23514';end if;
  payload:=p_data;
  foreach k in array array['full_name','designation','signature_scope','notes'] loop
   if jsonb_typeof(payload->k)='string' then payload:=jsonb_set(payload,array[k],coalesce(to_jsonb(nullif(regexp_replace(payload->>k,'^[[:space:]]+|[[:space:]]+$','','g'),'')),'null'::jsonb));end if;
  end loop;
  candidate:=jsonb_populate_record(prior,payload);
  if candidate.full_name is null or length(candidate.full_name)>200 or coalesce(length(candidate.designation),0)>200
   or coalesce(length(candidate.signature_scope),0)>500 or coalesce(length(candidate.notes),0)>2000
   or (candidate.effective_from is not null and candidate.effective_to is not null and candidate.effective_to<candidate.effective_from) then raise exception 'Invalid signatory fields or dates' using errcode='23514';end if;
  -- user_id is a reference only: no membership or signing authority is inferred.
  if candidate.user_id is not null and candidate.user_id is distinct from prior.user_id then
   perform 1 from public.user_profiles where id=candidate.user_id for key share;
   if not found then raise exception 'Referenced user unavailable' using errcode='23503';end if;
   if not public.current_user_is_global_admin() and not erp_private.company_signatory_admitted(true) and not public.administrator_can_manage_identity(candidate.user_id,'users.view') then raise exception 'Referenced user outside company authority' using errcode='42501';end if;
  end if;
  changed:=prior.id is null or exists(select 1 from jsonb_object_keys(payload) f where to_jsonb(prior)->f is distinct from to_jsonb(candidate)->f);
 else
  candidate:=prior;
  if p_action='archive' then candidate.deleted_at:=coalesce(prior.deleted_at,clock_timestamp());candidate.is_active:=false;
  else candidate.deleted_at:=null;end if;
  -- Restore retains the inactive state; activation is a separate explicit edit.
  changed:=candidate.deleted_at is distinct from prior.deleted_at or candidate.is_active is distinct from prior.is_active;
 end if;
 if changed then
  if prior.id is null then
   insert into public.owner_company_signatories(company_id,user_id,full_name,designation,signature_scope,is_primary,is_active,effective_from,effective_to,notes,created_by,updated_by)
    values(p_company_id,candidate.user_id,candidate.full_name,candidate.designation,candidate.signature_scope,candidate.is_primary,candidate.is_active,candidate.effective_from,candidate.effective_to,candidate.notes,actor,actor) returning * into saved;
  else
   update public.owner_company_signatories set user_id=candidate.user_id,full_name=candidate.full_name,designation=candidate.designation,signature_scope=candidate.signature_scope,
    is_primary=candidate.is_primary,is_active=candidate.is_active,effective_from=candidate.effective_from,effective_to=candidate.effective_to,notes=candidate.notes,
    deleted_at=candidate.deleted_at,updated_by=actor,updated_at=clock_timestamp() where id=prior.id returning * into saved;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,owner_company_id,action,old_values,new_values)
   values(actor,'COMMON_MD','owner_company_signatories',saved.id,'company_'||p_company_id||'_signatory_'||saved.id,p_company_id,
    case when prior.id is null then 'create' when p_action='archive' then 'delete' else 'update' end,
    case when prior.id is null then null else jsonb_build_object('revision',prior.workspace_revision,'archived',prior.deleted_at is not null) end,
    jsonb_build_object('operation_id',p_operation,'operation',p_action,'revision',saved.workspace_revision,'archived',saved.deleted_at is not null,
      'fields',case when p_action='save' then (select jsonb_agg(f order by f) from jsonb_object_keys(payload) f where to_jsonb(prior)->f is distinct from to_jsonb(candidate)->f) else jsonb_build_array('deleted_at','is_active') end));
 else saved:=prior;end if;
 if not erp_private.company_signatory_admitted(true,p_company_id) then raise exception 'Signatory permission changed' using errcode='42501';end if;
 result:=jsonb_build_object('id',saved.id,'revision',saved.workspace_revision::text,'changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result) values(auth.uid(),p_operation,h,'owner_company_signatories',saved.id,result);
 return result;
end$function$
;
NOTIFY pgrst,'reload schema';
COMMIT;
