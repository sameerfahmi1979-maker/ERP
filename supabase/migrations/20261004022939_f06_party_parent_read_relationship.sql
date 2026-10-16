begin;

-- Disambiguate the recursive many-to-one relationship: the automatic self-FK
-- embedding returns children, not this party's parent. This function preserves
-- caller RLS, does not elevate privileges, and does not fetch/cache whole lists.
create function public.erp_party_parent(public.parties)
returns setof public.parties rows 1
language sql stable security invoker set search_path='' as $$
  select p.* from public.parties p
  where p.id = ($1).parent_party_id
    and erp_private.business_principal_is_active()
$$;
revoke all on function public.erp_party_parent(public.parties) from public,anon,service_role;
grant execute on function public.erp_party_parent(public.parties) to authenticated;
comment on function public.erp_party_parent(public.parties) is
  'F06 recursive parent read, caller RLS only. Applications select display_name, not a privileged parent record.';
notify pgrst, 'reload schema';
commit;
