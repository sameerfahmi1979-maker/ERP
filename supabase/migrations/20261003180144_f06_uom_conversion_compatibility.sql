begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Existing rows are not rewritten or assigned a fabricated compatibility rule.
-- The existing permission-checked save/audit transaction remains authoritative.
-- FIXED_RATIO is a documented constant multiplication rule, not executable code.
create function erp_private.validate_uom_conversion_compatibility() returns trigger
language plpgsql security definer set search_path='' as $$
declare from_category bigint;to_category bigint;rule text:=nullif(btrim(new.conversion_formula_code),'');
begin
 if TG_OP='UPDATE' and not (
  row(new.from_uom_id,new.to_uom_id,new.conversion_factor,new.conversion_formula_code,new.notes,new.is_bidirectional)
   is distinct from row(old.from_uom_id,old.to_uom_id,old.conversion_factor,old.conversion_formula_code,old.notes,old.is_bidirectional)
  or (new.is_active and not old.is_active)) then return new;end if;
 select uom_category_id into from_category from public.units_of_measure where id=new.from_uom_id;
 select uom_category_id into to_category from public.units_of_measure where id=new.to_uom_id;
 if from_category is null or to_category is null then
  raise exception 'Choose two available units before defining a conversion' using errcode='23503',detail='from_uom_id';end if;
 if rule is not null and rule<>'FIXED_RATIO' then
  raise exception 'Choose a supported conversion rule; arbitrary formulas are not executed' using errcode='23514',detail='conversion_formula_code';end if;
 if from_category<>to_category and rule is distinct from 'FIXED_RATIO' then
  raise exception 'Cross-category conversion requires an explicit fixed-ratio rule' using errcode='23514',detail='conversion_formula_code';end if;
 if rule='FIXED_RATIO' and length(btrim(coalesce(new.notes,'')))<10 then
  raise exception 'Document the fixed-ratio source and when it is valid' using errcode='23514',detail='notes';end if;
 return new;
end$$;
alter function erp_private.validate_uom_conversion_compatibility() owner to postgres;
revoke all on function erp_private.validate_uom_conversion_compatibility() from public,anon,authenticated,service_role;
create trigger f06_uom_conversion_compatibility before insert or update on public.uom_conversions
for each row execute function erp_private.validate_uom_conversion_compatibility();
comment on column public.uom_conversions.conversion_formula_code is
'NULL: same-category special conversion. FIXED_RATIO: quantity multiplied by conversion_factor, with a documented source/applicability in notes; mandatory across categories. No arbitrary formula execution or inferred density. Historical unsupported references are retained for explicit review.';
notify pgrst,'reload schema';
commit;
