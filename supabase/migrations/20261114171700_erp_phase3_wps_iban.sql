begin;
set local lock_timeout = '5s';

create function erp_private.valid_uae_iban(p_iban text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  iban text := upper(translate(coalesce(p_iban, ''), chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||' ', ''));
  digits text;
  remainder integer := 0;
begin
  if iban !~ '^AE[0-9]{21}$' then return false; end if;
  digits := substr(iban, 5)||'1014'||substr(iban, 3, 2);
  for i in 1..length(digits) loop
    remainder := (remainder * 10 + substr(digits, i, 1)::integer) % 97;
  end loop;
  return remainder = 1;
end;
$$;
revoke all on function erp_private.valid_uae_iban(text) from public, anon, authenticated, service_role;
grant execute on function erp_private.valid_uae_iban(text) to authenticated, service_role;

-- Existing unverified values remain visible only through existing masking.
-- Unrelated edits may retain them, while new or changed values must pass validation.
create function erp_private.guard_changed_wps_iban()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.iban is not distinct from old.iban then return new; end if;
  if new.iban is not null then
    if not erp_private.valid_uae_iban(new.iban) then
      raise exception 'Enter a UAE IBAN with valid check digits' using errcode = '23514';
    end if;
    new.iban := upper(translate(new.iban, chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||' ', ''));
  end if;
  return new;
end;
$$;
revoke all on function erp_private.guard_changed_wps_iban() from public, anon, authenticated, service_role;
create trigger phase3_wps_iban before insert or update of iban on public.employee_wps_profiles
for each row execute function erp_private.guard_changed_wps_iban();

do $$
declare
  routine regprocedure := 'public.f12_payroll_readiness_facts(bigint[],date)'::regprocedure;
  definition text;
begin
  if (select md5(prosrc) from pg_proc where oid = routine) <> '7bd003ffe7e16d61838d1d80a151340a' then
    raise exception 'Unexpected payroll readiness predecessor';
  end if;
  definition := replace(pg_get_functiondef(routine), 'nullif(btrim(w.iban),'''')IS NULL', 'NOT erp_private.valid_uae_iban(w.iban)');
  execute definition;
end;
$$;
notify pgrst, 'reload schema';
commit;
