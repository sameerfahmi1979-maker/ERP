-- ============================================================================
-- ERP BASE 002F.3C.1 — Geography & Locations Completion Fix
-- ============================================================================
-- Created: 2026-06-05
-- Purpose: Add missing permissions, fix role assignments, fix RLS for global admin delete
-- Changes:
--   - Add master_data.geography.export permission
--   - Add master_data.geography.audit_view permission
--   - Fix role assignments for all roles
--   - Update delete RLS policies to allow global admin/system_admin full delete access
-- ============================================================================

-- ============================================================================
-- PERMISSIONS: Add Missing Permissions
-- ============================================================================

insert into public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
values
  ('master_data.geography.export', 'Export Geography & Locations', 'master_data', 'export', 'Export geography and location data to Excel/CSV', true),
  ('master_data.geography.audit_view', 'View Geography Audit Logs', 'master_data', 'audit_view', 'View audit logs for geography and location changes', true)
on conflict (permission_code) do nothing;

-- ============================================================================
-- ROLE ASSIGNMENTS: Fix All Role Permission Assignments
-- ============================================================================

do $$
declare
  v_system_admin_role_id bigint;
  v_group_admin_role_id bigint;
  v_company_admin_role_id bigint;
  v_branch_admin_role_id bigint;
begin
  -- Get role IDs
  select id into v_system_admin_role_id from public.roles where role_code = 'system_admin' limit 1;
  select id into v_group_admin_role_id from public.roles where role_code = 'group_admin' limit 1;
  select id into v_company_admin_role_id from public.roles where role_code = 'company_admin' limit 1;
  select id into v_branch_admin_role_id from public.roles where role_code = 'branch_admin' limit 1;

  -- ========================================
  -- system_admin: Full access (view, manage, export, audit_view)
  -- ========================================
  if v_system_admin_role_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_system_admin_role_id, id from public.permissions
    where permission_code in (
      'master_data.geography.view',
      'master_data.geography.manage',
      'master_data.geography.export',
      'master_data.geography.audit_view'
    )
    on conflict (role_id, permission_id) do nothing;
  end if;

  -- ========================================
  -- group_admin: View, Manage, Export, Audit View (no hard delete)
  -- ========================================
  if v_group_admin_role_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_group_admin_role_id, id from public.permissions
    where permission_code in (
      'master_data.geography.view',
      'master_data.geography.manage',
      'master_data.geography.export',
      'master_data.geography.audit_view'
    )
    on conflict (role_id, permission_id) do nothing;
  end if;

  -- ========================================
  -- company_admin: View, Export only (no manage)
  -- ========================================
  if v_company_admin_role_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_company_admin_role_id, id from public.permissions
    where permission_code in (
      'master_data.geography.view',
      'master_data.geography.export'
    )
    on conflict (role_id, permission_id) do nothing;
  end if;

  -- ========================================
  -- branch_admin: View only (no manage, no export)
  -- ========================================
  if v_branch_admin_role_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    select v_branch_admin_role_id, id from public.permissions
    where permission_code in (
      'master_data.geography.view'
    )
    on conflict (role_id, permission_id) do nothing;
  end if;

end $$;

-- ============================================================================
-- RLS POLICIES: Fix Delete Policies for Global Admin
-- ============================================================================

-- Drop existing restrictive delete policies
drop policy if exists delete_countries on public.countries;
drop policy if exists delete_emirates on public.emirates;
drop policy if exists delete_cities on public.cities;
drop policy if exists delete_areas_zones on public.areas_zones;
drop policy if exists delete_ports on public.ports;

-- Create new delete policies allowing global admin/system_admin full delete access
-- Note: system_admin role has permission 'master_data.geography.manage'
-- We allow delete for system_admin (who has manage permission) without restrictions

-- COUNTRIES delete policy
create policy delete_countries
  on public.countries
  for delete
  using (
    -- system_admin can delete all records (global admin rule)
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_profile_id = public.current_user_profile_id()
        and r.role_code = 'system_admin'
        and ur.is_active = true
    )
  );

-- EMIRATES delete policy
create policy delete_emirates
  on public.emirates
  for delete
  using (
    -- system_admin can delete all records (global admin rule)
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_profile_id = public.current_user_profile_id()
        and r.role_code = 'system_admin'
        and ur.is_active = true
    )
  );

-- CITIES delete policy
create policy delete_cities
  on public.cities
  for delete
  using (
    -- system_admin can delete all records (global admin rule)
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_profile_id = public.current_user_profile_id()
        and r.role_code = 'system_admin'
        and ur.is_active = true
    )
  );

-- AREAS_ZONES delete policy
create policy delete_areas_zones
  on public.areas_zones
  for delete
  using (
    -- system_admin can delete all records (global admin rule)
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_profile_id = public.current_user_profile_id()
        and r.role_code = 'system_admin'
        and ur.is_active = true
    )
  );

-- PORTS delete policy
create policy delete_ports
  on public.ports
  for delete
  using (
    -- system_admin can delete all records (global admin rule)
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_profile_id = public.current_user_profile_id()
        and r.role_code = 'system_admin'
        and ur.is_active = true
    )
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
