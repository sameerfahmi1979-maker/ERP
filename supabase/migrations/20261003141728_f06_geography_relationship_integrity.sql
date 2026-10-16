begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Do not rewrite historical/null geography mappings. Serialize these small
-- catalogue mutations before row locks so two concurrent moves cannot each
-- validate an obsolete parent/child snapshot. Reads are not serialized.
create function erp_private.lock_geography_relations() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 return null;
end$$;
revoke all on function erp_private.lock_geography_relations() from public,anon,authenticated,service_role;

create function erp_private.validate_geography_relations() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 code_field text;changed_reference boolean;parent_country bigint;parent_active boolean;
begin
 code_field:=case TG_TABLE_NAME when 'countries' then 'country_code' when 'emirates' then 'emirate_code'
  when 'cities' then 'city_code' when 'areas_zones' then 'area_code' when 'ports' then 'port_code' end;
 if code_field is null then raise exception 'Unsupported geography table' using errcode='22023';end if;
 if TG_OP='UPDATE' and (n->code_field is distinct from o->code_field or n->'is_system' is distinct from o->'is_system'
   or (TG_TABLE_NAME='countries' and n->'iso3_code' is distinct from o->'iso3_code')) then
  raise exception 'Geography identity and system status are immutable' using errcode='22023';end if;
 if TG_OP='INSERT' or n->'name_en' is distinct from o->'name_en' then
  new.name_en:=btrim(new.name_en);
  if new.name_en is null or length(new.name_en) not between 2 and 255 then
   raise exception 'Enter a valid geography name' using errcode='22023';end if;
 end if;
 if new.sort_order<0 then raise exception 'Sort order cannot be negative' using errcode='22023';end if;

 if TG_TABLE_NAME in ('emirates','cities','ports') then
  changed_reference:=TG_OP='INSERT' or n->'country_id' is distinct from o->'country_id'
   or n->'emirate_id' is distinct from o->'emirate_id' or (new.is_active and o->>'is_active'='false');
  if changed_reference and n->>'country_id' is not null then
   select is_active into parent_active from public.countries where id=(n->>'country_id')::bigint;
   if not found or not parent_active then raise exception 'Choose an active country' using errcode='23503';end if;
  end if;
  if changed_reference and TG_TABLE_NAME in ('cities','ports') then
   select country_id,is_active into parent_country,parent_active from public.emirates where id=(n->>'emirate_id')::bigint;
   if not found or not parent_active then raise exception 'Choose an active region' using errcode='23503';end if;
   if n->>'country_id' is not null and (n->>'country_id')::bigint is distinct from parent_country then
    raise exception 'Country must match the selected region' using errcode='23514';end if;
  end if;
 elsif TG_TABLE_NAME='areas_zones' and (TG_OP='INSERT' or n->'city_id' is distinct from o->'city_id' or (new.is_active and o->>'is_active'='false')) then
  select is_active into parent_active from public.cities where id=(n->>'city_id')::bigint;
  if not found or not parent_active then raise exception 'Choose an active city' using errcode='23503';end if;
 end if;

 if TG_OP='UPDATE' and TG_TABLE_NAME='emirates' and n->'country_id' is distinct from o->'country_id'
  and (exists(select 1 from public.cities where emirate_id=new.id) or exists(select 1 from public.ports where emirate_id=new.id)) then
  raise exception 'Referenced region cannot move to a different country; retain its history' using errcode='23503';end if;
 if TG_OP='UPDATE' and old.is_active and not new.is_active then
  if TG_TABLE_NAME='countries' and (exists(select 1 from public.emirates where country_id=new.id and is_active)
    or exists(select 1 from public.cities where country_id=new.id and is_active)
    or exists(select 1 from public.ports where country_id=new.id and is_active)) then
   raise exception 'Country has active geography dependencies' using errcode='23503';
  elsif TG_TABLE_NAME='emirates' and (exists(select 1 from public.cities where emirate_id=new.id and is_active)
    or exists(select 1 from public.ports where emirate_id=new.id and is_active)) then
   raise exception 'Region has active geography dependencies' using errcode='23503';
  elsif TG_TABLE_NAME='cities' and exists(select 1 from public.areas_zones where city_id=new.id and is_active) then
   raise exception 'City has active areas' using errcode='23503';
  end if;
 end if;
 return new;
end$$;
alter function erp_private.validate_geography_relations() owner to postgres;
revoke all on function erp_private.validate_geography_relations() from public,anon,authenticated,service_role;

do $$declare table_name text;
begin
 foreach table_name in array array['countries','emirates','cities','areas_zones','ports'] loop
  execute format('create trigger f06_geography_mutation_lock before insert or update or delete on public.%I for each statement execute function erp_private.lock_geography_relations()',table_name);
  execute format('create trigger f06_geography_integrity before insert or update on public.%I for each row execute function erp_private.validate_geography_relations()',table_name);
 end loop;
end$$;
-- No RLS relaxation, data rewrite, invented country assignment or hard deletion.
notify pgrst,'reload schema';
commit;
