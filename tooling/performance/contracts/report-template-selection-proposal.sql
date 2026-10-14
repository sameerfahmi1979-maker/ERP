-- Inert selection-read contract, not an executable migration.
-- Derived from the project reader, DTO and schema; no record data is included.
-- Requires the separately reviewed F06 safe projection and authority helper.
-- Native composition and privilege verification remain required before deployment.
-- List eligibility stays in the reader so authorized existing selections remain visible.

BEGIN;

DO $report_template_selection_contract$
BEGIN
  RAISE EXCEPTION 'Inert report template selection contract: execution is not permitted.';
END;
$report_template_selection_contract$;

CREATE VIEW public.perf_report_template_selection (
  id, template_code, template_name, template_type, is_default,
  governance_status, visual_editor_engine, branding_profile_id,
  branding_profile_name, branding_profile_type, company_name,
  logo_url, owner_company_id, selectable
)
WITH (security_invoker = true, security_barrier = true)
AS SELECT
  t.id,
  t.template_code,
  t.template_name,
  t.template_type,
  COALESCE(t.is_default, false),
  t.governance_status,
  t.visual_editor_engine,
  t.branding_profile_id,
  p.profile_name,
  p.profile_type,
  CASE WHEN p.owner_company_id IS NOT NULL
    THEN COALESCE(p.legal_name_en, p.trade_name_en, p.profile_name)
    ELSE NULL::text END,
  p.logo_url,
  p.owner_company_id,
  COALESCE(t.is_active, false)
    AND (t.branding_profile_id IS NULL OR COALESCE(p.is_active, false))
FROM public.erp_report_templates t
LEFT JOIN public.erp_report_branding_profiles_safe p ON p.id = t.branding_profile_id
WHERE t.deleted_at IS NULL
  AND (SELECT erp_private.business_principal_is_active())
  AND erp_private.can_read_report_template_branding(t.branding_profile_id)
  AND (t.branding_profile_id IS NULL OR p.id IS NOT NULL);

ALTER VIEW public.perf_report_template_selection OWNER TO postgres;
REVOKE ALL ON public.perf_report_template_selection FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.perf_report_template_selection TO authenticated;

ROLLBACK;
