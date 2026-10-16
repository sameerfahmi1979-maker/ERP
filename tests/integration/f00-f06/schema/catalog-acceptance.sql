-- Read-only acceptance after separately authorized isolated application.
-- Run with ON_ERROR_STOP. This is not a migration or a deployment script.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
DO $catalog_acceptance$
DECLARE actual_columns text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.perf_report_template_selection')
      AND relkind = 'v' AND relowner = 'postgres'::regrole
      AND reloptions @> ARRAY['security_invoker=true','security_barrier=true']) THEN
    RAISE EXCEPTION 'FAIL: selector owner/invoker/barrier contract';
  END IF;
  SELECT array_agg(attname::text ORDER BY attnum) INTO actual_columns FROM pg_attribute
    WHERE attrelid = 'public.perf_report_template_selection'::regclass AND attnum > 0 AND NOT attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id','template_code','template_name','template_type','is_default','governance_status','visual_editor_engine',
    'branding_profile_id','branding_profile_name','branding_profile_type','company_name','logo_url','owner_company_id','selectable'] THEN
    RAISE EXCEPTION 'FAIL: selector minimal metadata columns';
  END IF;
  IF NOT has_table_privilege('authenticated','public.perf_report_template_selection','SELECT')
    OR has_table_privilege('anon','public.perf_report_template_selection','SELECT')
    OR has_table_privilege('authenticated','public.perf_report_template_selection','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('service_role','public.perf_report_template_selection','SELECT')
    OR has_table_privilege('authenticated','public.erp_report_branding_profiles','SELECT')
    OR has_any_column_privilege('authenticated','public.erp_report_branding_profiles','SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege('authenticated','public.erp_report_templates','INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege('anon','public.erp_report_branding_profiles','SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege('anon','public.erp_report_branding_profiles_safe','SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege('anon','public.erp_report_templates','SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege('anon','public.perf_report_template_selection','SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege('service_role','public.perf_report_template_selection','SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege('authenticated','public.perf_report_template_selection','INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'FAIL: selector ACL or raw branding leak';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.erp_report_templates'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'FAIL: native template RLS';
  END IF;
  IF position('erp_private.can_read_report_template_branding(t.branding_profile_id)' IN
      pg_get_viewdef('public.perf_report_template_selection'::regclass,false)) = 0 THEN
    RAISE EXCEPTION 'FAIL: template branding authority missing';
  END IF;
END;
$catalog_acceptance$;
SELECT 'PASS: selector catalog/ACL/minimal-metadata invariants' AS result;
ROLLBACK;
