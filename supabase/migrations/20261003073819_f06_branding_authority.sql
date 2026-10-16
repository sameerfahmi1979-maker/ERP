begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Branding selection is not business-record authority. A company-wide asset
-- requires a company-wide or global assignment; a branch grant is insufficient.
create function erp_private.report_branding_permission(capability text, company_id bigint)
returns boolean language sql stable security invoker set search_path='' as $$
 select $1 in ('view','manage','sign','upload') and
  erp_private.permission_in_scope(case $1 when 'upload' then 'branding.assets.upload' else 'reports.'||$1 end,$2,null);
$$;
alter function erp_private.report_branding_permission(text,bigint) owner to postgres;
revoke all on function erp_private.report_branding_permission(text,bigint) from public,anon;
grant execute on function erp_private.report_branding_permission(text,bigint) to authenticated,service_role;

create function erp_private.can_read_report_branding(company_id bigint)
returns boolean language sql stable security invoker set search_path='' as $$
 select erp_private.report_branding_permission('view',$1) or erp_private.report_branding_permission('manage',$1);
$$;
alter function erp_private.can_read_report_branding(bigint) owner to postgres;
revoke all on function erp_private.can_read_report_branding(bigint) from public,anon;
grant execute on function erp_private.can_read_report_branding(bigint) to authenticated,service_role;

create function erp_private.can_read_app_branding()
returns boolean language sql stable security invoker set search_path='' as $$
 select erp_private.permission_in_scope('branding.app.view',null,null)
  or erp_private.permission_in_scope('branding.app.manage',null,null)
  or erp_private.permission_in_scope('reports.manage',null,null);
$$;
alter function erp_private.can_read_app_branding() owner to postgres;
revoke all on function erp_private.can_read_app_branding() from public,anon;
grant execute on function erp_private.can_read_app_branding() to authenticated,service_role;

-- Base rows contain legacy confidential image URLs. Expose an explicitly scoped
-- and field-redacted projection instead of granting authenticated SELECT on '*'.
-- This is deliberately a barrier/owner view, not security_invoker: callers have
-- no base-table SELECT. Every row is independently authorized below; no helper
-- trusts user_metadata or a caller-supplied ownership assertion.
create view public.erp_report_branding_profiles_safe with(security_barrier=true) as
 select p.id,p.profile_code,p.profile_name,p.profile_type,p.owner_company_id,
 p.logo_url,p.small_logo_url,
 case when erp_private.report_branding_permission('sign',p.owner_company_id) then p.stamp_url else null::text end as stamp_url,
 case when erp_private.report_branding_permission('sign',p.owner_company_id) then p.signature_url else null::text end as signature_url,
 p.watermark_url,p.watermark_text,p.theme_primary_color,p.theme_secondary_color,p.theme_header_bg_color,p.theme_header_text_color,
 p.legal_name_en,p.legal_name_ar,p.trade_name_en,p.trade_name_ar,p.address_block_en,p.address_block_ar,
 p.phone,p.email,p.website,p.po_box,p.trn,p.trade_license_no,p.footer_text_en,p.footer_text_ar,
 p.signatory_name,p.signatory_title_en,p.signatory_title_ar,p.is_default_for_company,p.is_group_profile,p.is_neutral_profile,
 p.is_active,p.created_at,p.updated_at,p.created_by,p.updated_by,p.deleted_at,p.deleted_by
 from public.erp_report_branding_profiles p
 where p.deleted_at is null and erp_private.can_read_report_branding(p.owner_company_id);
alter view public.erp_report_branding_profiles_safe owner to postgres;
revoke all on public.erp_report_branding_profiles_safe from public,anon,authenticated;
grant select on public.erp_report_branding_profiles_safe to authenticated,service_role;
revoke select,insert,update,delete on public.erp_report_branding_profiles from public,anon,authenticated;

alter policy rpt_branding_select on public.erp_report_branding_profiles to authenticated
 using(deleted_at is null and erp_private.can_read_report_branding(owner_company_id));
drop policy rpt_branding_insert on public.erp_report_branding_profiles;
drop policy rpt_branding_update on public.erp_report_branding_profiles;
drop policy rpt_branding_delete on public.erp_report_branding_profiles;

-- Narrow boolean projection reads the otherwise private profile parent. The
-- caller receives no row/URL and must also hold the actual stored asset scope.
create function erp_private.can_read_branding_asset(a public.erp_branding_assets)
returns boolean language sql stable security definer set search_path='' as $$
 select erp_private.business_principal_is_active() and $1.deleted_at is null and (
  ($1.asset_scope='app' and $1.owner_company_id is null and $1.branding_profile_id is null
   and erp_private.can_read_app_branding() and exists(select 1 from public.erp_app_branding_settings s where s.id=$1.app_settings_id and s.deleted_at is null))
  or ($1.asset_scope='report' and $1.app_settings_id is null
   and erp_private.can_read_report_branding($1.owner_company_id)
   and ($1.asset_type not in ('stamp','signature') or erp_private.report_branding_permission('sign',$1.owner_company_id))
   and exists(select 1 from public.erp_report_branding_profiles p where p.id=$1.branding_profile_id and p.deleted_at is null
    and p.owner_company_id is not distinct from $1.owner_company_id)));
$$;
alter function erp_private.can_read_branding_asset(public.erp_branding_assets) owner to postgres;
revoke all on function erp_private.can_read_branding_asset(public.erp_branding_assets) from public,anon;
grant execute on function erp_private.can_read_branding_asset(public.erp_branding_assets) to authenticated,service_role;

alter policy branding_assets_select on public.erp_branding_assets to authenticated
 using(erp_private.can_read_branding_asset(erp_branding_assets));
drop policy branding_assets_insert on public.erp_branding_assets;
drop policy branding_assets_update on public.erp_branding_assets;
drop policy branding_assets_no_hard_delete on public.erp_branding_assets;
revoke insert,update,delete on public.erp_branding_assets from public,anon,authenticated;

alter policy branding_app_settings_select on public.erp_app_branding_settings to authenticated
 using(deleted_at is null and (select erp_private.can_read_app_branding()));
drop policy branding_app_settings_insert on public.erp_app_branding_settings;
drop policy branding_app_settings_update on public.erp_app_branding_settings;
drop policy branding_app_settings_no_delete on public.erp_app_branding_settings;
revoke insert,update,delete on public.erp_app_branding_settings from public,anon,authenticated;

-- A stored path must be the canonical object of the selected company/profile,
-- never a way to mint access to another bucket, company or confidential type.
create function erp_private.branding_storage_identity(a public.erp_branding_assets)
returns boolean language sql immutable security invoker set search_path='' as $$
 select $1.storage_bucket='erp-branding-assets' and $1.version_no>0 and
 $1.mime_type in ('image/png','image/jpeg','image/jpg','image/webp','image/svg+xml','image/x-icon','image/vnd.microsoft.icon') and
 $1.storage_path=(case when $1.asset_scope='app' then 'app/settings-'||$1.app_settings_id::text
  else 'report/company-'||coalesce($1.owner_company_id,0)::text||'/profile-'||$1.branding_profile_id::text end)
  ||'/'||$1.asset_type||'/v'||$1.version_no::text||'.'||case $1.mime_type
   when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/svg+xml' then 'svg'
   when 'image/jpeg' then 'jpg' when 'image/jpg' then 'jpg' else 'ico' end;
$$;
alter function erp_private.branding_storage_identity(public.erp_branding_assets) owner to postgres;
revoke all on function erp_private.branding_storage_identity(public.erp_branding_assets) from public,anon;
grant execute on function erp_private.branding_storage_identity(public.erp_branding_assets) to authenticated,service_role;

create function erp_private.can_read_branding_object(object_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select erp_private.business_principal_is_active() and exists(
  select 1 from public.erp_branding_assets a
  where a.storage_bucket='erp-branding-assets' and a.storage_path=$1 and a.is_active and a.deleted_at is null
   and erp_private.can_read_branding_asset(a) and erp_private.branding_storage_identity(a)
   and (a.asset_scope='app' or exists(select 1 from public.erp_report_branding_profiles p where p.id=a.branding_profile_id and p.is_active)));
$$;
alter function erp_private.can_read_branding_object(text) owner to postgres;
revoke all on function erp_private.can_read_branding_object(text) from public,anon;
grant execute on function erp_private.can_read_branding_object(text) to authenticated,service_role;

drop policy branding_storage_select on storage.objects;
drop policy branding_storage_insert on storage.objects;
drop policy branding_storage_update on storage.objects;
drop policy branding_storage_delete on storage.objects;
create policy f06_branding_storage_select on storage.objects for select to authenticated
 using(bucket_id='erp-branding-assets' and erp_private.can_read_branding_object(name));
-- Restrictive guards also prevent another permissive storage policy from
-- accidentally admitting this bucket. All other buckets keep their policies.
create policy f06_branding_storage_read_guard on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'erp-branding-assets' or erp_private.can_read_branding_object(name));
create policy f06_branding_storage_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'erp-branding-assets');
create policy f06_branding_storage_update_guard on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'erp-branding-assets') with check(bucket_id<>'erp-branding-assets');
create policy f06_branding_storage_delete_guard on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'erp-branding-assets');

-- Minimal issuing-company choices for branding editors, not a general company
-- catalogue or a business-data grant. Branch-only assignments are insufficient.
create view public.erp_branding_company_choices with(security_barrier=true) as
 select c.id,c.company_code,c.legal_name_en,
 erp_private.report_branding_permission('sign',c.id) as can_sign
 from public.owner_companies c where c.status='active'
 and erp_private.report_branding_permission('manage',c.id);
alter view public.erp_branding_company_choices owner to postgres;
revoke all on public.erp_branding_company_choices from public,anon,authenticated,service_role;
grant select on public.erp_branding_company_choices to authenticated;

notify pgrst,'reload schema';
commit;
