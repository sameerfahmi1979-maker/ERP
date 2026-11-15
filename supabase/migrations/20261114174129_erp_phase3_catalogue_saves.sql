begin;
set local lock_timeout = '5s';

do $$
declare relation text;
begin
  foreach relation in array array['designations','approval_roles','dms_required_document_rules'] loop
    execute format('alter table public.%I add column workspace_revision bigint not null default 1',relation);
    execute format('create trigger phase3_catalogue_revision before update on public.%I for each row execute function erp_private.phase3_work_site_revision()',relation);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated',relation);
  end loop;
end;
$$;

create function public.phase3_save_catalogue(p_relation text, p_id bigint, p_revision bigint, p_operation uuid, p_data jsonb, p_archive boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  fields text[];
  code_column text;
  actor bigint := public.current_user_profile_id();
  before_row jsonb;
  saved jsonb;
  receipt erp_private.phase3_work_site_receipts;
  stamp text;
  columns text;
  company bigint;
  branch bigint;
begin
  case p_relation
    when 'designations' then
      code_column := 'designation_code';
      fields := array['designation_code','designation_name_en','designation_name_ar','owner_company_id','department_id','job_level','management_level',
        'is_supervisor','is_authorized_signatory','has_approval_authority','is_safety_critical','description','is_active'];
    when 'approval_roles' then
      code_column := 'role_code';
      fields := array['role_code','role_name','level_number','scope','module_code','amount_limit','currency_code','can_approve','can_reject','can_delegate',
        'escalation_role_id','owner_company_id','description','is_active'];
    when 'dms_required_document_rules' then
      code_column := 'rule_code';
      fields := array['rule_code','rule_name','entity_type','entity_subtype','document_type_id','is_required','requires_expiry_date','requires_issue_date',
        'blocks_activation','reminder_days_before_expiry','owner_company_id','branch_id','department_id','effective_from','effective_to','notes','is_active'];
    else raise exception 'Unknown catalogue' using errcode = '22023';
  end case;
  if actor is null or not erp_private.business_principal_is_active()
    or not (public.current_user_has_permission('common_md.manage')
      or public.current_user_has_permission('common_md.'||case p_relation when 'dms_required_document_rules' then 'dms_required_documents' else p_relation end||'.manage')) then
    raise exception 'Catalogue access denied' using errcode = '42501';
  end if;
  if p_operation is null or p_archive is null or jsonb_typeof(p_data) is distinct from 'object'
    or octet_length(p_data::text)>16384 or p_data-fields<>'{}'::jsonb
    or (p_id is null and (p_revision is not null or p_archive))
    or (p_id is not null and (p_revision is null or p_revision<1))
    or (p_archive is distinct from (p_data='{}'::jsonb)) then
    raise exception 'Invalid catalogue operation' using errcode = '22023';
  end if;

  stamp := encode(sha256(convert_to(jsonb_build_array(p_relation,p_id,p_revision,p_data,p_archive)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('catalogue:'||actor||':'||p_operation,0));
  select * into receipt from erp_private.phase3_work_site_receipts where actor_id=actor and operation_id=p_operation;
  if found and receipt.fingerprint is distinct from stamp then raise exception 'Operation was used for different data' using errcode='22023'; end if;

  if p_id is not null or receipt.result is not null then
    execute format('select to_jsonb(r) from public.%I r where id=$1 for update',p_relation)
      into before_row using coalesce(p_id,(receipt.result->>'id')::bigint);
    if before_row is null or (receipt.result is null and before_row->>'deleted_at' is not null) then
      raise exception 'Catalogue record unavailable' using errcode='42501';
    end if;
    if receipt.result is not null then return receipt.result||jsonb_build_object('replayed',true); end if;
    if (before_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Catalogue record changed' using errcode='P0409'; end if;
  end if;

  company := ((coalesce(before_row,'{}'::jsonb)||p_data)->>'owner_company_id')::bigint;
  branch := ((coalesce(before_row,'{}'::jsonb)||p_data)->>'branch_id')::bigint;
  if branch is not null and not exists(select 1 from public.branches b where b.id=branch and b.owner_company_id=company) then
    raise exception 'Catalogue scope is invalid' using errcode = '23514';
  end if;
  select string_agg(format('%I',key),', ' order by key) into columns from jsonb_object_keys(p_data) key;
  if p_archive then
    execute format('update public.%I r set deleted_at=clock_timestamp(),is_active=false,updated_by=$1,updated_at=clock_timestamp() where id=$2 returning to_jsonb(r)',p_relation)
      into saved using actor,p_id;
  elsif p_id is null then
    execute format('insert into public.%1$I as r (%2$s,created_by,updated_by)
      select %2$s,$2,$2 from jsonb_populate_record(null::public.%1$I,$1) returning to_jsonb(r)',p_relation,columns)
      into saved using p_data,actor;
  else
    execute format('update public.%1$I r set (%2$s)=(select %2$s from jsonb_populate_record(null::public.%1$I,$1)),
      updated_by=$2,updated_at=clock_timestamp() where id=$3 returning to_jsonb(r)',p_relation,columns)
      into saved using p_data,actor,p_id;
  end if;

  insert into public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
  values(actor,company,branch,'common_md',p_relation,(saved->>'id')::bigint,saved->>code_column,
    case when p_archive then 'delete' when p_id is null then 'create' else 'update' end,
    case when before_row is not null then jsonb_build_object('revision',before_row->>'workspace_revision','owner_company_id',before_row->'owner_company_id','branch_id',before_row->'branch_id') end,
    jsonb_build_object('revision',saved->>'workspace_revision','operation_id',p_operation,'changed_fields',coalesce(to_jsonb(array(select jsonb_object_keys(p_data))),'[]'::jsonb)));
  saved := jsonb_build_object('id',saved->'id','revision',saved->>'workspace_revision','replayed',false);
  insert into erp_private.phase3_work_site_receipts values(actor,p_operation,stamp,saved);
  return saved;
end;
$$;
revoke all on function public.phase3_save_catalogue(text,bigint,bigint,uuid,jsonb,boolean) from public, anon, authenticated, service_role;
grant execute on function public.phase3_save_catalogue(text,bigint,bigint,uuid,jsonb,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
