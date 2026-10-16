begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Fixed recovery metadata only; do not expand ordinary archived-row visibility.
-- A private definer is required to recover rows hidden by the ordinary table RLS.
-- It checks the same active principal/global HR authority as the atomic writer.
create function erp_private.archived_hr_settings(p_entity text)
returns table(id bigint,name text,code text,revision text,owner_company_id bigint,company_name text,
 branch_id bigint,branch_name text,parent_id bigint,archived_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare query text;
begin
 if p_entity is null or not(p_entity=any(erp_private.hr_lookup_tables()||erp_private.hr_specialized_tables())) then
  raise exception 'Invalid HR archive selection' using errcode='22023';end if;
 if auth.uid() is null or not erp_private.business_principal_is_active() or not public.current_user_can_manage_hr_settings() then
  raise exception 'Global HR configuration permission required' using errcode='42501';end if;
 if p_entity='hr_mohre_establishments' then
  return query select t.id,t.establishment_name::text,t.establishment_number::text,t.workspace_revision::text,
   t.owner_company_id,c.legal_name_en::text,null::bigint,null::text,null::bigint,t.deleted_at
  from public.hr_mohre_establishments t left join public.owner_companies c on c.id=t.owner_company_id where t.deleted_at is not null;
 elsif p_entity in ('hr_role_requirement_matrix','hr_site_requirement_matrix') then
  query:=format('select t.id,coalesce(r.rule_name_en,''Requirement (rule not assigned)''),concat(coalesce(r.rule_code,''Requirement''),'' / entry '',t.id),t.workspace_revision::text,
   null::bigint,null::text,null::bigint,null::text,null::bigint,t.deleted_at
   from public.%I t left join public.hr_readiness_rule_templates r on r.id=t.readiness_rule_template_id where t.deleted_at is not null',p_entity);
  return query execute query;
 else
  query:=format('select t.id,coalesce(to_jsonb(t)->>''name_en'',to_jsonb(t)->>''rule_name_en'',to_jsonb(t)->>''workflow_name_en''),
   coalesce(to_jsonb(t)->>''code'',to_jsonb(t)->>''rule_code'',concat(to_jsonb(t)->>''workflow_code'','' / step '',to_jsonb(t)->>''approval_step'')),
   t.workspace_revision::text,null::bigint,null::text,null::bigint,null::text,null::bigint,t.deleted_at
   from public.%I t where t.deleted_at is not null',p_entity);
  return query execute query;
 end if;
end $$;
alter function erp_private.archived_hr_settings(text) owner to postgres;
revoke all on function erp_private.archived_hr_settings(text) from public,anon,service_role;
grant execute on function erp_private.archived_hr_settings(text) to authenticated;
create function public.list_archived_hr_settings(p_entity text)
returns table(id bigint,name text,code text,revision text,owner_company_id bigint,company_name text,
 branch_id bigint,branch_name text,parent_id bigint,archived_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select * from erp_private.archived_hr_settings(p_entity);
$$;
revoke all on function public.list_archived_hr_settings(text) from public,anon,service_role;
grant execute on function public.list_archived_hr_settings(text) to authenticated;
notify pgrst,'reload schema';
commit;
