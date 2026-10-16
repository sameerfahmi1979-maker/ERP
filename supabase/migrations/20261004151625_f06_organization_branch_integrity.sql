begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Future writes only. Historical text/IDs are not guessed, merged or repaired.
-- Existing geography lock precedes finance's statement lock and all row locks.
create trigger f06_0_administration_geography_lock before insert or update or delete on public.owner_companies
 for each statement execute function erp_private.lock_geography_relations();
create trigger f06_0_administration_geography_lock before insert or update or delete on public.branches
 for each statement execute function erp_private.lock_geography_relations();

-- Private integrity-only trigger: RLS still authorizes the business mutation.
-- Definer visibility checks ancestry without exposing restricted catalogue rows.
create function erp_private.validate_organization_branch() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 company boolean:=TG_TABLE_NAME='owner_companies';code_field text;name_field text;pair text[];field text;limit_value integer;
 changed boolean;reactivating boolean;group_name text;region_field text;city_field text;area_field text;
 region public.emirates%rowtype;city public.cities%rowtype;area public.areas_zones%rowtype;
 country public.countries%rowtype;
begin
 if TG_TABLE_NAME not in ('owner_companies','branches') then raise exception 'Unsupported administration target' using errcode='22023';end if;
 code_field:=case when company then 'company_code' else 'branch_code' end;
 name_field:=case when company then 'legal_name_en' else 'branch_name_en' end;
 if TG_OP='UPDATE' and (new.id is distinct from old.id or n->code_field is distinct from o->code_field
  or (not company and n->'owner_company_id' is distinct from o->'owner_company_id')) then
  raise exception '%',case when company then 'Organization identity is immutable' else 'Branch identity and ownership are immutable' end using errcode='22023';
 end if;
 reactivating:=TG_OP='UPDATE' and n->>'status'='active' and o->>'status' is distinct from 'active';
 if TG_OP='INSERT' then
  if coalesce(n->>code_field,'') !~ '^[A-Z0-9_-]{1,50}$' then raise exception 'Invalid administration value' using errcode='23514',detail=code_field;end if;
 end if;
 if TG_OP='INSERT' or n->name_field is distinct from o->name_field then
  n:=jsonb_set(n,array[name_field],to_jsonb(btrim(n->>name_field)));
  if nullif(n->>name_field,'') is null or length(n->>name_field)>255 then raise exception 'Invalid administration value' using errcode='23514',detail=name_field;end if;
 end if;
 -- The currently rendered fields previously discarded by action schemas.
 foreach field in array case when company then array['trade_name','main_activity','office_address_line_1','office_address_line_2']
  else array['legal_branch_name','trade_license_branch_ref'] end loop
  limit_value:=case when field='trade_license_branch_ref' then 100 when field in ('main_activity','office_address_line_1','office_address_line_2') then 500 else 255 end;
  if (TG_OP='INSERT' or n->field is distinct from o->field) and length(n->>field)>limit_value then
   raise exception 'Invalid administration value' using errcode='23514',detail=field;end if;
 end loop;
 if company and (TG_OP='INSERT' or n->'compliance_status' is distinct from o->'compliance_status')
  and n->>'compliance_status' is not null and n->>'compliance_status' not in ('compliant','non_compliant','under_review','suspended') then
  raise exception 'Invalid administration value' using errcode='23514',detail='compliance_status';end if;
 foreach pair slice 1 in array array[['opening_date','closing_date'],['trade_license_issue_date','trade_license_expiry_date'],['icv_issue_date','icv_expiry_date']] loop
  if TG_OP='INSERT' or reactivating or n->pair[1] is distinct from o->pair[1] or n->pair[2] is distinct from o->pair[2] then
   if n->>pair[1] is not null and n->>pair[2] is not null and (n->>pair[2])::date<(n->>pair[1])::date then
    raise exception 'Invalid administration date range' using errcode='23514',detail=pair[2];end if;
  end if;
 end loop;
 if not company and (TG_OP='INSERT' or n->'latitude' is distinct from o->'latitude' or n->'longitude' is distinct from o->'longitude')
  and ((n->>'latitude')::numeric not between -90 and 90 or (n->>'longitude')::numeric not between -180 and 180) then
  raise exception 'Invalid administration value' using errcode='23514',detail='coordinates';end if;
 foreach group_name in array case when company then array['legal','office'] else array['legal'] end loop
  region_field:=case when group_name='office' then 'office_emirate_id' else 'emirate_id' end;
  city_field:=case when group_name='office' then 'office_city_id' else 'city_id' end;
  area_field:=case when group_name='office' then null else 'area_zone_id' end;
  changed:=TG_OP='INSERT' or reactivating or n->region_field is distinct from o->region_field or n->city_field is distinct from o->city_field
   or (area_field is not null and n->area_field is distinct from o->area_field)
   or (company and group_name='legal' and n->'country_id' is distinct from o->'country_id');
  if not changed then continue;end if;
  country:=null;region:=null;city:=null;area:=null;
  if company and group_name='legal' and n->>'country_id' is not null then
   select * into country from public.countries where id=(n->>'country_id')::bigint for share;
   if not found or not country.is_active then raise exception 'Choose active administration geography' using errcode='23503',detail='country_id';end if;
   n:=jsonb_set(n,'{country}',to_jsonb(country.name_en));
  elsif TG_OP='UPDATE' and company and group_name='legal' and n->'country_id' is distinct from o->'country_id' then
   n:=jsonb_set(n,'{country}','null');
  end if;
  if n->>region_field is not null then
   select * into region from public.emirates where id=(n->>region_field)::bigint for share;
   if not found or not region.is_active then raise exception 'Choose active administration geography' using errcode='23503',detail=region_field;end if;
   if company and group_name='legal' and region.country_id is distinct from country.id then raise exception 'Invalid administration geography' using errcode='23514',detail=region_field;end if;
  end if;
  if n->>city_field is not null then
   select * into city from public.cities where id=(n->>city_field)::bigint for share;
   if not found or not city.is_active then raise exception 'Choose active administration geography' using errcode='23503',detail=city_field;end if;
   if region.id is null or city.emirate_id is distinct from region.id or (city.country_id is not null and city.country_id is distinct from region.country_id) then
    raise exception 'Invalid administration geography' using errcode='23514',detail=city_field;end if;
  end if;
  if area_field is not null and n->>area_field is not null then
   select * into area from public.areas_zones where id=(n->>area_field)::bigint for share;
   if not found or not area.is_active then raise exception 'Choose active administration geography' using errcode='23503',detail=area_field;end if;
   if city.id is null or area.city_id is distinct from city.id then raise exception 'Invalid administration geography' using errcode='23514',detail=area_field;end if;
  end if;
  if group_name='legal' then
   if region.id is not null or (TG_OP='UPDATE' and n->region_field is distinct from o->region_field) then n:=jsonb_set(n,'{emirate}',coalesce(to_jsonb(region.name_en),'null'));end if;
   if city.id is not null or (TG_OP='UPDATE' and n->city_field is distinct from o->city_field) then n:=jsonb_set(n,'{city}',coalesce(to_jsonb(city.name_en),'null'));end if;
   if area.id is not null or (TG_OP='UPDATE' and n->area_field is distinct from o->area_field) then n:=jsonb_set(n,'{area}',coalesce(to_jsonb(area.name_en),'null'));end if;
  end if;
 end loop;
 new:=jsonb_populate_record(new,n);return new;
end$$;
alter function erp_private.validate_organization_branch() owner to postgres;
revoke all on function erp_private.validate_organization_branch() from public,anon,authenticated,service_role;
create trigger f06_organization_integrity before insert or update on public.owner_companies for each row execute function erp_private.validate_organization_branch();
create trigger f06_branch_integrity before insert or update on public.branches for each row execute function erp_private.validate_organization_branch();

-- The same lock protects the opposite writer: geography reassignment cannot
-- invalidate already-referenced company/branch ancestry, including history.
create function erp_private.protect_administration_geography() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=to_jsonb(old);referenced boolean:=false;
begin
 if TG_TABLE_NAME='emirates' and n->'country_id' is distinct from o->'country_id' then
  select exists(select 1 from public.owner_companies where emirate_id=old.id or office_emirate_id=old.id)
   or exists(select 1 from public.branches where emirate_id=old.id) into referenced;
 elsif TG_TABLE_NAME='cities' and (n->'country_id',n->'emirate_id') is distinct from (o->'country_id',o->'emirate_id') then
  select exists(select 1 from public.owner_companies where city_id=old.id or office_city_id=old.id)
   or exists(select 1 from public.branches where city_id=old.id) into referenced;
 elsif TG_TABLE_NAME='areas_zones' and n->'city_id' is distinct from o->'city_id' then
  select exists(select 1 from public.owner_companies where area_zone_id=old.id)
   or exists(select 1 from public.branches where area_zone_id=old.id) into referenced;
 end if;
 if referenced then raise exception 'Referenced administration geography cannot be reassigned' using errcode='23514';end if;
 return new;
end$$;
alter function erp_private.protect_administration_geography() owner to postgres;
revoke all on function erp_private.protect_administration_geography() from public,anon,authenticated,service_role;
create trigger f06_administration_geography_history before update on public.emirates for each row execute function erp_private.protect_administration_geography();
create trigger f06_administration_geography_history before update on public.cities for each row execute function erp_private.protect_administration_geography();
create trigger f06_administration_geography_history before update on public.areas_zones for each row execute function erp_private.protect_administration_geography();
notify pgrst,'reload schema';
commit;
