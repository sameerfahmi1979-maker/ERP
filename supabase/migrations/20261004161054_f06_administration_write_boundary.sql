-- F06 administration adapters now save through permission-checked, revisioned
-- transactions. Direct Data API writes must not bypass their audit/receipt rules.
-- Keep existing SELECT/RLS and trusted internal service privileges unchanged.
begin;

revoke insert, update, delete on public.owner_companies, public.branches
  from public, anon, authenticated;

-- Table revocation does not remove independently granted column privileges.
-- Cover the exact two tables only, including installations with such grants.
do $$
declare
  target text;
  columns text;
begin
  foreach target in array array['owner_companies', 'branches'] loop
    select string_agg(quote_ident(a.attname), ',' order by a.attnum)
      into columns
      from pg_attribute a
      where a.attrelid = format('public.%I', target)::regclass
        and a.attnum > 0 and not a.attisdropped;
    execute format(
      'revoke insert (%s), update (%s) on public.%I from public, anon, authenticated',
      columns, columns, target);
    if has_table_privilege('anon', format('public.%I', target), 'INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated', format('public.%I', target), 'INSERT,UPDATE,DELETE')
       or has_any_column_privilege('anon', format('public.%I', target), 'INSERT,UPDATE')
       or has_any_column_privilege('authenticated', format('public.%I', target), 'INSERT,UPDATE') then
      raise exception 'Unexpected inherited administration write grant; review before release';
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
