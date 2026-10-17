begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- The raw branding table contains confidential legacy signing URLs, so this
-- private boolean lookup deliberately reads only its ownership/lifecycle fields.
-- It never returns profile data or trusts ownership supplied by an API caller.
create function erp_private.can_read_report_template_branding(profile_id bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select erp_private.business_principal_is_active() and case when $1 is null
  then erp_private.can_read_report_branding(null)
  else exists(select 1 from public.erp_report_branding_profiles p
   where p.id=$1 and p.deleted_at is null
   and erp_private.can_read_report_branding(p.owner_company_id)
   and (p.owner_company_id is null or exists(select 1 from public.owner_companies c
    where c.id=p.owner_company_id and c.status='active'))) end;
$$;
alter function erp_private.can_read_report_template_branding(bigint) owner to postgres;
revoke all on function erp_private.can_read_report_template_branding(bigint) from public,anon;
grant execute on function erp_private.can_read_report_template_branding(bigint) to authenticated;

alter table public.erp_report_templates enable row level security;
alter policy rpt_templates_select on public.erp_report_templates to authenticated
 using(deleted_at is null and erp_private.can_read_report_template_branding(branding_profile_id));

-- Client-side writes must not sidestep template governance/audit and snapshots.
-- Existing server mutations require their own scoped governance acceptance;
-- revoking this bypass is not a claim that those legacy actions are complete.
revoke all on public.erp_report_templates from public,anon,authenticated;
grant select on public.erp_report_templates to authenticated;
drop policy rpt_templates_insert on public.erp_report_templates;
drop policy rpt_templates_update on public.erp_report_templates;
drop policy rpt_templates_delete on public.erp_report_templates;

-- A template's audit history must use the same stored company boundary, even
-- when the caller goes directly to the Data API. History is never client-authored.
alter policy template_events_select on public.erp_report_template_events to authenticated
 using(exists(select 1 from public.erp_report_templates t where t.id=template_id));
drop policy template_events_insert on public.erp_report_template_events;
revoke all on public.erp_report_template_events from public,anon,authenticated;
grant select on public.erp_report_template_events to authenticated;
notify pgrst,'reload schema';
commit;
