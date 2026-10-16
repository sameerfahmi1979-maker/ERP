begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Historical display labels, not a geography catalogue. The caller supplies
-- authorized business-record IDs, never arbitrary geography IDs. The private
-- projection intentionally reads inactive lookup names, after rechecking the
-- exact party/address read authority and the F03 active-principal boundary.
create function erp_private.party_reference_labels(p_entity text,p_ids bigint[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_entity is null or p_entity not in ('parties','party_addresses')
   or p_ids is null or cardinality(p_ids)>1000
   or exists(select 1 from unnest(p_ids) id where id is null or id<=0) then
  raise exception using errcode='22023',message='Invalid party label request';
 end if;
 if auth.uid() is null or erp_private.business_principal_is_active() is not true then return '{}'::jsonb; end if;
 if (public.current_user_has_permission('master_data.parties.view')
   or public.current_user_has_role('system_admin')
   or (p_entity='parties' and public.current_user_has_permission('master_data.party_master.view'))) is not true then
  return '{}'::jsonb;
 end if;
 with records as materialized (
  select id,country_id,emirate_id,city_id,area_zone_id from public.parties
   where p_entity='parties' and id=any(p_ids)
  union all
  select id,country_id,emirate_id,city_id,area_zone_id from public.party_addresses
   where p_entity='party_addresses' and id=any(p_ids)
 )
 select coalesce(jsonb_object_agg(r.id::text,jsonb_build_object(
  'country_id',r.country_id,'emirate_id',r.emirate_id,'city_id',r.city_id,'area_zone_id',r.area_zone_id,
  'country_name',c.name_en,'emirate_name',e.name_en,'city_name',t.name_en,'area_zone_name',a.name_en
 )),'{}'::jsonb) into result
 from records r
 left join public.countries c on c.id=r.country_id
 left join public.emirates e on e.id=r.emirate_id
 left join public.cities t on t.id=r.city_id
 left join public.areas_zones a on a.id=r.area_zone_id;
 return result;
end$$;
alter function erp_private.party_reference_labels(text,bigint[]) owner to postgres;
revoke all on function erp_private.party_reference_labels(text,bigint[]) from public,anon,service_role;
grant execute on function erp_private.party_reference_labels(text,bigint[]) to authenticated;

create function public.get_party_reference_labels(p_entity text,p_ids bigint[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select erp_private.party_reference_labels(p_entity,p_ids);
$$;
revoke all on function public.get_party_reference_labels(text,bigint[]) from public,anon,service_role;
grant execute on function public.get_party_reference_labels(text,bigint[]) to authenticated;
notify pgrst,'reload schema';
commit;
