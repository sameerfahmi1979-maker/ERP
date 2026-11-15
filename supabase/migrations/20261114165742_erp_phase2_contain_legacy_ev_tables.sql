-- ALGT-AUD-0001. The ERP project retains these historical EV tables. The EV
-- application uses its own project. Preserve these tables for owner recovery.
begin;

set local lock_timeout = '5s';

do $migration$
declare
  table_name text;
  target regclass;
  legacy_policy text;
begin
  foreach table_name in array array[
    'audit_log', 'billing_breakdown_items', 'billing_calculations',
    'charging_sessions', 'fixed_charges', 'import_batches', 'maintenance_log',
    'notifications', 'operator_schedules', 'operators', 'rate_periods',
    'rate_structures', 'shifts', 'stations', 'system_settings',
    'tax_configurations'
  ] loop
    target := to_regclass(format('public.%I', table_name));
    legacy_policy := 'authenticated_all_' || table_name;

    if not exists (
      select 1 from pg_class c
      where c.oid = target and c.relkind = 'r' and c.relrowsecurity
        and c.relowner = 'postgres'::regrole
    ) then
      raise exception 'Unexpected legacy table shape for public.%', table_name;
    end if;

    execute format('lock table %s in access exclusive mode', target);

    if not exists (
      select 1 from pg_policy p
      where p.polrelid = target and p.polname = legacy_policy
        and p.polcmd = '*' and p.polpermissive
        and p.polroles = array['authenticated'::regrole::oid]
        and pg_get_expr(p.polqual, target) = 'true'
        and pg_get_expr(p.polwithcheck, target) = 'true'
    ) or (select count(*) from pg_policy where polrelid = target) <> 1
      or exists (select 1 from pg_attribute where attrelid = target and attacl is not null)
    then
      raise exception 'Unexpected legacy ACL or policy for %', target;
    end if;

    execute format('drop policy %I on %s', legacy_policy, target);
    execute format('revoke all privileges on table %s from public, anon, authenticated, service_role', target);
    execute format(
      'create policy legacy_ev_archive_deny on %s as restrictive for all to public using (false) with check (false)',
      target
    );

    if exists (
      select 1
      from pg_class c cross join lateral aclexplode(c.relacl) acl
      where c.oid = target and acl.grantee <> c.relowner
    ) then
      raise exception 'Unexpected retained legacy table grant for %', target;
    end if;
  end loop;
end
$migration$;

commit;
