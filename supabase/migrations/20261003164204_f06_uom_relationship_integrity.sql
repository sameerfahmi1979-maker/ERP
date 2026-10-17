begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Future writes only. No historical unit factor, category or conversion is
-- guessed, normalized or rewritten. Existing unique base-unit index stays intact.
-- Serialize low-frequency catalogue writers before row locks: assigning a unit
-- or conversion cannot race its parent's dependency check and retirement.
create function erp_private.lock_uom_relationships() returns trigger
language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('f06-uom-relationships',0));
 return null;
end$$;
alter function erp_private.lock_uom_relationships() owner to postgres;
revoke all on function erp_private.lock_uom_relationships() from public,anon,authenticated,service_role;

create function erp_private.validate_uom_relationships() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 field text;parent_active boolean;activated boolean:=TG_OP='INSERT' or (new.is_active and not old.is_active);
begin
 if TG_TABLE_SCHEMA<>'public' or TG_TABLE_NAME not in('uom_categories','units_of_measure','uom_conversions') then
  raise exception 'Unsupported units catalogue' using errcode='22023';
 end if;
 if TG_OP='UPDATE' and n->'is_system' is distinct from o->'is_system' then
  raise exception 'System marker is immutable' using errcode='22023';
 end if;
 if new.sort_order<0 or length(new.notes)>2000 or length(new.deactivation_reason)>500 then
  raise exception 'Invalid catalogue order, notes or retirement reason' using errcode='23514';
 end if;
 if TG_TABLE_NAME in('uom_categories','units_of_measure') then
  field:=case TG_TABLE_NAME when 'uom_categories' then 'category_name_en' else 'unit_name_en' end;
  if length(btrim(coalesce(n->>field,'')))<(case when TG_TABLE_NAME='uom_categories' then 2 else 1 end)
   or length(n->>field)>255 then raise exception 'A valid English name is required' using errcode='23514';end if;
  field:=case TG_TABLE_NAME when 'uom_categories' then 'category_name_ar' else 'unit_name_ar' end;
  if length(n->>field)>255 or length(n->>'description_en')>1000 or length(n->>'description_ar')>1000 then
   raise exception 'Catalogue description is too long' using errcode='23514';end if;
 end if;
 if TG_TABLE_NAME='uom_categories' then
  if TG_OP='UPDATE' and new.category_code is distinct from old.category_code then
   raise exception 'Category code is immutable' using errcode='22023';end if;
  if TG_OP='UPDATE' and old.is_active and not new.is_active
   and exists(select 1 from public.units_of_measure where uom_category_id=new.id and is_active) then
   raise exception 'Retire active units before retiring their category' using errcode='23503';end if;
 elsif TG_TABLE_NAME='units_of_measure' then
  if TG_OP='UPDATE' and (new.unit_code is distinct from old.unit_code or new.uom_category_id is distinct from old.uom_category_id) then
   raise exception 'Unit code and established category are immutable' using errcode='22023';end if;
  if new.conversion_factor_to_base::text in('NaN','Infinity','-Infinity') or new.conversion_factor_to_base<=0
   or (new.is_base_unit and new.conversion_factor_to_base<>1) then
   raise exception 'Use a finite positive factor; base units must have factor 1' using errcode='23514';end if;
  if length(new.symbol)>20 then raise exception 'Unit symbol is too long' using errcode='23514';end if;
  if activated then
   select is_active into parent_active from public.uom_categories where id=new.uom_category_id for share;
   if parent_active is distinct from true then raise exception 'Choose an active unit category' using errcode='23503';end if;
  end if;
  if TG_OP='UPDATE' and old.is_active and not new.is_active
   and exists(select 1 from public.uom_conversions where (from_uom_id=new.id or to_uom_id=new.id) and is_active) then
   raise exception 'Retire active conversions before retiring their unit' using errcode='23503';end if;
  if TG_OP='UPDATE' and old.is_base_unit and ((old.is_active and not new.is_active) or not new.is_base_unit)
   and exists(select 1 from public.units_of_measure where uom_category_id=new.uom_category_id and id<>new.id and is_active) then
   raise exception 'Retire the other active units before removing their base unit' using errcode='23503';end if;
 else
  if TG_OP='UPDATE' and (new.from_uom_id is distinct from old.from_uom_id or new.to_uom_id is distinct from old.to_uom_id) then
   raise exception 'Established conversion endpoints are immutable' using errcode='22023';end if;
  if new.conversion_factor::text in('NaN','Infinity','-Infinity') or new.conversion_factor<=0 then
   raise exception 'Conversion factor must be finite and positive' using errcode='23514';end if;
  if length(new.conversion_formula_code)>50 then raise exception 'Conversion formula code is too long' using errcode='23514';end if;
  if activated then
   if (select count(*) from public.units_of_measure u join public.uom_categories c on c.id=u.uom_category_id
    where u.id in(new.from_uom_id,new.to_uom_id) and u.is_active and c.is_active)<>2 then
    raise exception 'Choose two different active units in active categories' using errcode='23503';end if;
  end if;
  -- Cross-category compatibility governance is a separate explicit rule. Do
  -- not fabricate a density, packaging ratio or formula from a category name.
 end if;
 return new;
end$$;
alter function erp_private.validate_uom_relationships() owner to postgres;
revoke all on function erp_private.validate_uom_relationships() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['uom_categories','units_of_measure','uom_conversions'] loop
  execute format('create trigger f06_uom_relationship_lock before insert or update or delete on public.%I for each statement execute function erp_private.lock_uom_relationships()',t);
  execute format('create trigger f06_uom_relationship_validation before insert or update on public.%I for each row execute function erp_private.validate_uom_relationships()',t);
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
