begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Intentional label-only authority projection: a finance reader need not gain
-- organization/branch administration or raw lookup-metadata access. Every label
-- is anchored to an independently authorized finance record. No dynamic SQL.
create function erp_private.finance_reference_labels(p_entity text,p_ids bigint[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_entity is null or p_entity not in ('cost_centers','profit_centers')
   or p_ids is null or cardinality(p_ids)>1000 then
  raise exception using errcode='22023',message='Invalid finance label request';
 end if;
 if not erp_private.business_principal_is_active() then return '{}'::jsonb; end if;
 with centres as materialized (
  select id,owner_company_id,branch_id,parent_cost_center_id parent_id,cost_center_type_code type_code
   from public.cost_centers where p_entity='cost_centers' and id=any(p_ids)
  union all
  select id,owner_company_id,branch_id,parent_profit_center_id,profit_center_type_code
   from public.profit_centers where p_entity='profit_centers' and id=any(p_ids)
 ), permitted as materialized (
  select * from centres where
   erp_private.permission_in_scope('master_data.finance_basics.view',owner_company_id,branch_id)
   or erp_private.permission_in_scope('master_data.finance_basics.manage',null,null)
   or erp_private.permission_in_scope('master_data.lookups.lock',null,null)
 ), parents as (
  select id,owner_company_id,branch_id,is_active,cost_center_code code,cost_center_name_en name_en,cost_center_name_ar name_ar
   from public.cost_centers where p_entity='cost_centers'
  union all
  select id,owner_company_id,branch_id,is_active,profit_center_code,profit_center_name_en,profit_center_name_ar
   from public.profit_centers where p_entity='profit_centers'
 )
 select coalesce(jsonb_object_agg(c.id::text,jsonb_build_object(
  'owner_company',case when o.id is not null then jsonb_build_object('company_code',o.company_code,'legal_name_en',o.legal_name_en) end,
  'branch',case when b.id is not null then jsonb_build_object('branch_code',b.branch_code,'branch_name_en',b.branch_name_en,'branch_name_ar',b.branch_name_ar) end,
  'parent',case when p.id is not null then jsonb_build_object('code',p.code,'name_en',p.name_en,'name_ar',p.name_ar) end,
  'type_label',case when v.id is not null then jsonb_build_object('value_code',v.value_code,'value_label_en',v.value_label_en,'value_label_ar',v.value_label_ar) end
 )),'{}'::jsonb) into result
 from permitted c
 left join public.owner_companies o on o.id=c.owner_company_id
 left join public.branches b on b.id=c.branch_id and b.owner_company_id=c.owner_company_id
 left join parents p on p.id=c.parent_id and (
  (p.is_active and p.owner_company_id is null and p.branch_id is null)
  or erp_private.permission_in_scope('master_data.finance_basics.view',p.owner_company_id,p.branch_id)
  or erp_private.permission_in_scope('master_data.finance_basics.manage',null,null)
  or erp_private.permission_in_scope('master_data.lookups.lock',null,null))
 left join public.global_lookup_categories g on g.category_code=case p_entity when 'cost_centers' then 'COST_CENTER_TYPES' else 'PROFIT_CENTER_TYPES' end
 left join public.global_lookup_values v on v.category_id=g.id and v.value_code=c.type_code;
 return result;
end$$;
alter function erp_private.finance_reference_labels(text,bigint[]) owner to postgres;
revoke all on function erp_private.finance_reference_labels(text,bigint[]) from public,anon,service_role;
grant execute on function erp_private.finance_reference_labels(text,bigint[]) to authenticated;

create function public.get_finance_reference_labels(p_entity text,p_ids bigint[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select erp_private.finance_reference_labels(p_entity,p_ids);
$$;
revoke all on function public.get_finance_reference_labels(text,bigint[]) from public,anon,service_role;
grant execute on function public.get_finance_reference_labels(text,bigint[]) to authenticated;
notify pgrst,'reload schema';
commit;
