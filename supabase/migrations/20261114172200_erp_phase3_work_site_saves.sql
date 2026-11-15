begin;
set local lock_timeout = '5s';

alter table public.work_sites add column workspace_revision bigint not null default 1;
alter table public.work_sites add constraint phase3_work_site_geography
  check ((latitude is null or latitude between -90 and 90) and (longitude is null or longitude between -180 and 180)) not valid;
alter table public.work_sites add constraint phase3_work_site_dates
  check ((opening_date is null or isfinite(opening_date)) and (closing_date is null or isfinite(closing_date))
    and (opening_date is null or closing_date is null or opening_date <= closing_date)) not valid;

create function erp_private.phase3_work_site_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.workspace_revision := old.workspace_revision + 1;
  return new;
end;
$$;
revoke all on function erp_private.phase3_work_site_revision() from public, anon, authenticated, service_role;
create trigger phase3_work_site_revision before update on public.work_sites
for each row execute function erp_private.phase3_work_site_revision();

create table erp_private.phase3_work_site_receipts (
  actor_id bigint not null,
  operation_id uuid not null,
  fingerprint text not null,
  result jsonb not null,
  primary key (actor_id, operation_id)
);
revoke all on erp_private.phase3_work_site_receipts from public, anon, authenticated, service_role;
alter table erp_private.phase3_work_site_receipts enable row level security;

create function public.phase3_save_work_site(p_id bigint, p_revision bigint, p_operation uuid, p_data jsonb, p_archive boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  allowed constant text[] := array['site_code','site_name','site_type','owner_company_id','branch_id',
    'available_to_all_organizations','party_id','country_id','emirate_id','city_id','area_zone_id',
    'address_line_1','address_line_2','po_box','makani_number','latitude','longitude','site_contact_name',
    'site_contact_phone','site_contact_email','is_restricted_area','cicpa_required','adnoc_required',
    'work_calendar_id','access_notes','status','opening_date','closing_date','description'];
  actor bigint := public.current_user_profile_id();
  before_row public.work_sites;
  updated public.work_sites;
  receipt erp_private.phase3_work_site_receipts;
  stamp text;
  columns text;
  result jsonb;
  tuple_company bigint;
  tuple_branch bigint;
begin
  if actor is null or not erp_private.business_principal_is_active() then
    raise exception 'Work site access denied' using errcode = '42501';
  end if;
  if p_operation is null or p_archive is null or jsonb_typeof(p_data) is distinct from 'object'
     or octet_length(p_data::text) > 16384 or p_data - allowed <> '{}'::jsonb
     or (p_id is null and (p_revision is not null or p_archive))
     or (p_id is not null and (p_revision is null or p_revision < 1))
     or (p_archive and p_data <> '{}'::jsonb) then
    raise exception 'Invalid work site operation' using errcode = '22023';
  end if;
  stamp := encode(sha256(convert_to(jsonb_build_array(p_id,p_revision,p_data,p_archive)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('work-site:'||actor||':'||p_operation,0));
  select * into receipt from erp_private.phase3_work_site_receipts where actor_id = actor and operation_id = p_operation;
  if found and receipt.fingerprint is distinct from stamp then
    raise exception 'Operation was used for different data' using errcode = '22023';
  end if;
  if p_id is not null or receipt.result is not null then
    select * into before_row from public.work_sites where id = coalesce(p_id,(receipt.result->>'id')::bigint) for update;
    if not found or not erp_private.administrator_work_site_permission('manage',before_row.owner_company_id,before_row.branch_id)
      or (receipt.result is null and before_row.deleted_at is not null) then
      raise exception 'Work site access denied' using errcode = '42501';
    end if;
    if receipt.result is not null then
      if before_row.owner_company_id is distinct from (receipt.result->>'owner_company_id')::bigint
        or before_row.branch_id is distinct from (receipt.result->>'branch_id')::bigint then
        raise exception 'Work site ownership changed' using errcode = '42501';
      end if;
      return receipt.result || jsonb_build_object('replayed',true);
    end if;
    if before_row.workspace_revision <> p_revision then raise exception 'Work site changed' using errcode = 'P0409'; end if;
  end if;
  tuple_company := case when p_data ? 'owner_company_id' then (p_data->>'owner_company_id')::bigint else before_row.owner_company_id end;
  tuple_branch := case when p_data ? 'branch_id' then (p_data->>'branch_id')::bigint else before_row.branch_id end;
  if tuple_company is null or not erp_private.administrator_work_site_permission('manage',tuple_company,tuple_branch)
    or (tuple_branch is not null and not exists(select 1 from public.branches b where b.id=tuple_branch and b.owner_company_id=tuple_company)) then
    raise exception 'Work site destination denied' using errcode = '42501';
  end if;
  if (p_data ? 'available_to_all_organizations') and not public.current_user_has_role('system_admin') then
    raise exception 'Sharing permission required' using errcode = '42501';
  end if;

  select string_agg(format('%I', key), ', ' order by key) into columns from jsonb_object_keys(p_data) key;
  if p_archive then
    update public.work_sites set deleted_at = clock_timestamp(), deleted_by = actor, status = 'closed',
      updated_at = clock_timestamp(), updated_by = actor where id = p_id returning * into updated;
  elsif p_id is null then
    if columns is null then raise exception 'Work site values required' using errcode = '22023'; end if;
    execute format('insert into public.work_sites (%1$s, created_by, updated_by)
      select %1$s, $2, $2 from jsonb_populate_record(null::public.work_sites, $1) returning *', columns)
      into updated using p_data, actor;
  else
    if columns is null then raise exception 'Work site values required' using errcode = '22023'; end if;
    execute format('update public.work_sites set (%1$s) = (select %1$s from jsonb_populate_record(null::public.work_sites, $1)),
      updated_by = $2, updated_at = clock_timestamp() where id = $3 returning *', columns)
      into updated using p_data, actor, p_id;
  end if;

  insert into public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
  values(actor,updated.owner_company_id,updated.branch_id,'common_md','work_sites',updated.id,updated.site_code,
    case when p_archive then 'delete' when p_id is null then 'create' else 'update' end,
    case when p_id is not null then jsonb_build_object('revision',before_row.workspace_revision,'owner_company_id',before_row.owner_company_id,'branch_id',before_row.branch_id) end,
    jsonb_build_object('revision',updated.workspace_revision,'operation_id',p_operation,'changed_fields',coalesce(to_jsonb(array(select jsonb_object_keys(p_data))), '[]'::jsonb)));
  result := jsonb_build_object('id',updated.id,'revision',updated.workspace_revision::text,'replayed',false,
    'owner_company_id',updated.owner_company_id,'branch_id',updated.branch_id,'available_to_all_organizations',updated.available_to_all_organizations);
  insert into erp_private.phase3_work_site_receipts values(actor,p_operation,stamp,result);
  return result;
end;
$$;
revoke all on function public.phase3_save_work_site(bigint,bigint,uuid,jsonb,boolean) from public, anon, authenticated, service_role;
grant execute on function public.phase3_save_work_site(bigint,bigint,uuid,jsonb,boolean) to authenticated;
revoke insert, update, delete, truncate on public.work_sites from authenticated;
notify pgrst, 'reload schema';
commit;
