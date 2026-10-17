begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Serialize relationship writers before row locks. Use the existing geography
-- lock first, so a catalogue move and a party/address assignment cannot both
-- commit against stale ancestry. No read/cache framework or RLS change.
create function erp_private.lock_party_relations() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 return null;
end$$;
revoke all on function erp_private.lock_party_relations() from public,anon,authenticated,service_role;

-- Integrity-only private trigger: reads catalogue ancestry independently of a
-- caller's field visibility, returns no fetched data, and never performs a
-- business write. Original table RLS still authorizes the triggering mutation.
create function erp_private.validate_party_relations() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 changed_geo boolean;activated boolean;region public.emirates%rowtype;city public.cities%rowtype;area public.areas_zones%rowtype;
 parent public.parties%rowtype;code_field text;valid boolean;
begin
 if TG_TABLE_NAME not in ('parties','party_addresses') then raise exception 'Unsupported party relationship' using errcode='22023';end if;
 code_field:=case when TG_TABLE_NAME='parties' then 'party_code' else 'address_code' end;
 activated:=n->>'is_active'='true' and o->>'is_active'='false';
 if TG_OP='UPDATE' and (n->code_field is distinct from o->code_field
  or (TG_TABLE_NAME='party_addresses' and n->'party_id' is distinct from o->'party_id')) then
  raise exception 'Party record identity is immutable' using errcode='22023';
 end if;
 if TG_TABLE_NAME='parties' then
  if TG_OP='INSERT' or new.display_name is distinct from old.display_name then
   new.display_name:=btrim(new.display_name);
   if nullif(new.display_name,'') is null then raise exception 'Display name is required' using errcode='23514';end if;
  end if;
  if TG_OP='INSERT' or new.legal_name_en is distinct from old.legal_name_en then
   new.legal_name_en:=btrim(new.legal_name_en);
   if nullif(new.legal_name_en,'') is null then raise exception 'Legal name is required' using errcode='23514';end if;
  end if;
  if TG_OP='INSERT' or activated or new.party_nature_id is distinct from old.party_nature_id then
   perform 1 from public.party_natures where id=new.party_nature_id and is_active for share;
   if not found then raise exception 'Choose an active party nature' using errcode='23503';end if;
  end if;
  if TG_OP='INSERT' or activated or new.party_status_id is distinct from old.party_status_id then
   perform 1 from public.party_statuses where id=new.party_status_id and is_active for share;
   if not found then raise exception 'Choose an active party status' using errcode='23503';end if;
  end if;
  if new.parent_party_id is not null and (TG_OP='INSERT' or activated or new.parent_party_id is distinct from old.parent_party_id) then
   select * into parent from public.parties where id=new.parent_party_id for share;
   if not found or not parent.is_active then raise exception 'Choose an active parent party' using errcode='23503';end if;
   with recursive ancestors as (
    select id,parent_party_id from public.parties where id=new.parent_party_id
    union select p.id,p.parent_party_id from public.parties p join ancestors a on p.id=a.parent_party_id
   ) select not exists(select 1 from ancestors where id=new.id) into valid;
   if not valid then raise exception 'Party hierarchy cannot contain a cycle' using errcode='23514';end if;
  end if;
 else
  if TG_OP='INSERT' or activated then
   perform 1 from public.parties where id=new.party_id and is_active and not is_locked for share;
   if not found then raise exception 'Choose an active available party' using errcode='23503';end if;
  end if;
  if TG_OP='INSERT' or activated or new.address_type_id is distinct from old.address_type_id then
   perform 1 from public.party_address_types where id=new.address_type_id and is_active for share;
   if not found then raise exception 'Choose an active address type' using errcode='23503';end if;
  end if;
 end if;
 -- Validate changed fields only: historical mappings are not invented or
 -- rewritten and an unrelated edit preserves an inactive selected value.
 if TG_OP='INSERT' or n->'latitude' is distinct from o->'latitude' or n->'longitude' is distinct from o->'longitude' then
  if new.latitude not between -90 and 90 or new.longitude not between -180 and 180 then
   raise exception 'Coordinates are outside their permitted range' using errcode='23514';end if;
 end if;
 changed_geo:=TG_OP='INSERT' or activated or (n->'country_id',n->'emirate_id',n->'city_id',n->'area_zone_id')
  is distinct from (o->'country_id',o->'emirate_id',o->'city_id',o->'area_zone_id');
 if changed_geo then
  perform 1 from public.countries where id=new.country_id and is_active for share;
  if not found then raise exception 'Choose an active country' using errcode='23503';end if;
  if new.emirate_id is not null then
   select * into region from public.emirates where id=new.emirate_id for share;
   if not found or not region.is_active then raise exception 'Choose an active region' using errcode='23503';end if;
   if region.country_id is distinct from new.country_id then raise exception 'Region and country do not match' using errcode='23514';end if;
  end if;
  if new.city_id is not null then
   select * into city from public.cities where id=new.city_id for share;
   if not found or not city.is_active then raise exception 'Choose an active city' using errcode='23503';end if;
   if new.emirate_id is null or city.emirate_id is distinct from new.emirate_id
    or (city.country_id is not null and city.country_id is distinct from new.country_id) then
    raise exception 'City, region and country do not match' using errcode='23514';end if;
  end if;
  if new.area_zone_id is not null then
   select * into area from public.areas_zones where id=new.area_zone_id for share;
   if not found or not area.is_active then raise exception 'Choose an active area' using errcode='23503';end if;
   if new.city_id is null or area.city_id is distinct from new.city_id then raise exception 'Area and city do not match' using errcode='23514';end if;
  end if;
 end if;
 return new;
end$$;
alter function erp_private.validate_party_relations() owner to postgres;
revoke all on function erp_private.validate_party_relations() from public,anon,authenticated,service_role;

create trigger f06_party_mutation_lock before insert or update or delete on public.parties
 for each statement execute function erp_private.lock_party_relations();
create trigger f06_party_mutation_lock before insert or update or delete on public.party_addresses
 for each statement execute function erp_private.lock_party_relations();
create trigger f06_party_relationship_integrity before insert or update on public.parties
 for each row execute function erp_private.validate_party_relations();
create trigger f06_party_relationship_integrity before insert or update on public.party_addresses
 for each row execute function erp_private.validate_party_relations();

create function erp_private.preserve_party_geography_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text;changed boolean;dependent boolean;n jsonb:=to_jsonb(new);o jsonb:=to_jsonb(old);
begin
 field:=case TG_TABLE_NAME when 'emirates' then 'emirate_id' when 'cities' then 'city_id' when 'areas_zones' then 'area_zone_id' end;
 if field is null then raise exception 'Unsupported geography dependency' using errcode='22023';end if;
 changed:=TG_OP='DELETE' or (n->'country_id',n->'emirate_id',n->'city_id') is distinct from (o->'country_id',o->'emirate_id',o->'city_id');
 if changed then
  execute format('select exists(select 1 from public.parties where %I=$1) or exists(select 1 from public.party_addresses where %I=$1)',field,field)
   into dependent using old.id;
  if dependent then raise exception 'Retain referenced geography and its historical ownership' using errcode='23503';end if;
 end if;
 if TG_OP='DELETE' then return old;end if;return new;
end$$;
alter function erp_private.preserve_party_geography_history() owner to postgres;
revoke all on function erp_private.preserve_party_geography_history() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['emirates','cities','areas_zones'] loop
  execute format('create trigger f06_party_geography_history before update or delete on public.%I for each row execute function erp_private.preserve_party_geography_history()',t);
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
