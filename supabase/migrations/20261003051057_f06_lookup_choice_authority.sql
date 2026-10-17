begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Administrative catalogues stay private. A form may consume shared reference
-- labels without receiving arbitrary metadata, audit identities or edit rights.
-- COMPANY/BRANCH categories have no ownership columns in the legacy schema, so
-- do not infer their owner or expose them through the ordinary shared projection.
create function erp_private.can_manage_lookup_catalogue() returns boolean
language sql stable security definer set search_path='' as $$
 select erp_private.business_principal_is_active() and (
  public.current_user_has_permission('master_data.lookups.view') or
  public.current_user_has_permission('master_data.lookups.manage') or
  public.current_user_has_permission('master_data.lookups.lock'));
$$;
alter function erp_private.can_manage_lookup_catalogue() owner to postgres;
revoke all on function erp_private.can_manage_lookup_catalogue() from public,anon,service_role;
grant execute on function erp_private.can_manage_lookup_catalogue() to authenticated;

create function erp_private.can_use_shared_lookup(p_scope text,p_module text) returns boolean
language sql stable security definer set search_path='' as $$
 select erp_private.business_principal_is_active() and p_scope in ('GLOBAL','MODULE') and exists(
  select 1 from public.user_profiles u
  join public.user_roles ur on ur.user_profile_id=u.id and ur.is_active
  join public.roles r on r.id=ur.role_id and r.is_active
  join public.role_permissions rp on rp.role_id=r.id
  join public.permissions p on p.id=rp.permission_id and p.is_active
  where u.auth_user_id=auth.uid() and (p_scope='GLOBAL' or lower(p.module_code)=lower(p_module))
 );
$$;
alter function erp_private.can_use_shared_lookup(text,text) owner to postgres;
revoke all on function erp_private.can_use_shared_lookup(text,text) from public,anon,service_role;
grant execute on function erp_private.can_use_shared_lookup(text,text) to authenticated;

-- An explicit global administrator needs no manufactured permission links.
-- Existing principal restriction remains in place; ordinary base-table SELECT
-- stays denied. Write policies are not broadened by these read projections.
drop policy select_lookup_categories_admin on public.global_lookup_categories;
create policy select_lookup_categories_admin on public.global_lookup_categories
 for select to authenticated using ((select erp_private.can_manage_lookup_catalogue()));
drop policy select_lookup_values_admin on public.global_lookup_values;
create policy select_lookup_values_admin on public.global_lookup_values
 for select to authenticated using ((select erp_private.can_manage_lookup_catalogue()));

-- These private definer functions are intentional, narrowly projected reads:
-- they independently verify the live session and capabilities. No supplied
-- actor, table, company or SQL argument can widen the projection or authority.
create function erp_private.lookup_category_choices()
returns table(id bigint,category_code text,is_active boolean)
language sql stable security definer set search_path='' as $$
 select c.id,c.category_code,c.is_active from public.global_lookup_categories c
 where (select erp_private.can_manage_lookup_catalogue())
  or (c.is_active and erp_private.can_use_shared_lookup(c.category_scope,c.module_code));
$$;
create function erp_private.lookup_value_choices()
returns table(id bigint,category_id bigint,value_code text,value_label_en text,value_label_ar text,
 color_hex text,icon_name text,badge_variant text,sort_order integer,is_default boolean,parent_value_id bigint,is_active boolean)
language sql stable security definer set search_path='' as $$
 select v.id,v.category_id,v.value_code,v.value_label_en,v.value_label_ar,v.color_hex,v.icon_name,v.badge_variant,
  v.sort_order,v.is_default,v.parent_value_id,v.is_active
 from public.global_lookup_values v join public.global_lookup_categories c on c.id=v.category_id
 where (select erp_private.can_manage_lookup_catalogue()) or
  (c.is_active and v.is_active and erp_private.can_use_shared_lookup(c.category_scope,c.module_code)
   and (not c.supports_effective_dates or
    ((v.effective_from is null or v.effective_from<=(now() at time zone 'UTC')::date)
     and (v.effective_to is null or v.effective_to>=(now() at time zone 'UTC')::date))));
$$;
alter function erp_private.lookup_category_choices() owner to postgres;
alter function erp_private.lookup_value_choices() owner to postgres;
revoke all on function erp_private.lookup_category_choices(),erp_private.lookup_value_choices() from public,anon,service_role;
grant execute on function erp_private.lookup_category_choices(),erp_private.lookup_value_choices() to authenticated;

-- Invoker views expose only the private functions' safe fixed shape. They have
-- no writable base relation and no default grants to anonymous clients.
create view public.erp_lookup_category_choices with(security_invoker=true,security_barrier=true)
 as select * from erp_private.lookup_category_choices();
create view public.erp_lookup_value_choices with(security_invoker=true,security_barrier=true)
 as select * from erp_private.lookup_value_choices();
revoke all on public.erp_lookup_category_choices,public.erp_lookup_value_choices from public,anon,authenticated,service_role;
grant select on public.erp_lookup_category_choices,public.erp_lookup_value_choices to authenticated;
notify pgrst,'reload schema';
commit;
