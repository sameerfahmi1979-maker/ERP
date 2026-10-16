begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Branch administration needs an ownership label, not organization record
-- access. Keep base owner_companies grants/RLS unchanged. Creation choices
-- require company-wide branch authority; a branch-only assignment must never
-- become authority to create a sibling. An existing branch may retain an
-- inactive company's label, but only within that exact branch's read scope.
create function erp_private.branch_company_choices(p_branch_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not erp_private.business_principal_is_active() then
  raise exception using errcode='42501',message='An active account is required.';
 end if;
 if p_branch_id is not null and (p_branch_id<=0 or p_branch_id>9007199254740991) then
  raise exception using errcode='22023',message='Choose a valid branch.';
 end if;

 if p_branch_id is null then
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'legal_name_en',c.legal_name_en,'company_code',c.company_code
  ) order by c.id),'[]'::jsonb) into result
  from public.owner_companies c
  where c.status='active'
   and erp_private.permission_in_scope('branches.manage',c.id,null);
 else
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'legal_name_en',c.legal_name_en,'company_code',c.company_code
  ) order by c.id),'[]'::jsonb) into result
  from public.branches b
  join public.owner_companies c on c.id=b.owner_company_id
  where b.id=p_branch_id and (
   erp_private.permission_in_scope('branches.view',b.owner_company_id,b.id)
   or erp_private.permission_in_scope('branches.manage',b.owner_company_id,b.id)
  );
 end if;
 return result;
end;
$$;
alter function erp_private.branch_company_choices(bigint) owner to postgres;
revoke all on function erp_private.branch_company_choices(bigint) from public,anon,service_role;
grant execute on function erp_private.branch_company_choices(bigint) to authenticated;

-- JSON aggregation deliberately avoids PostgREST's set-returning row cap, so
-- the UI cannot mistake a truncated ownership catalogue for a complete one.
create function public.get_branch_company_choices(p_branch_id bigint default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select erp_private.branch_company_choices(p_branch_id);
$$;
revoke all on function public.get_branch_company_choices(bigint) from public,anon,service_role;
grant execute on function public.get_branch_company_choices(bigint) to authenticated;
notify pgrst,'reload schema';
commit;
