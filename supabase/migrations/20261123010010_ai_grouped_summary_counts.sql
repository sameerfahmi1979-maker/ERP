BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Use the session's existing table policies and require the same global
-- capability as the corresponding dashboard before reading one snapshot.
CREATE FUNCTION public.erp_ai_summary_counts(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  permission_code text;
  counts jsonb;
BEGIN
  permission_code := CASE p_kind
    WHEN 'risk' THEN 'ai.risk.view'
    WHEN 'compliance' THEN 'ai.compliance.view'
    WHEN 'duplicate' THEN 'ai.duplicates.view'
  END;
  IF permission_code IS NULL THEN
    RAISE EXCEPTION 'Invalid AI summary kind' USING ERRCODE = '22023';
  END IF;
  IF NOT erp_private.business_principal_is_active()
     OR NOT (
       public.current_user_has_permission(permission_code)
       OR public.current_user_has_permission('ai.common.admin')
     ) THEN
    RAISE EXCEPTION 'AI summary denied' USING ERRCODE = '42501';
  END IF;

  CASE p_kind
  WHEN 'risk' THEN
    SELECT jsonb_build_object(
      'critical', count(*) FILTER (WHERE risk_level = 'critical'),
      'high', count(*) FILTER (WHERE risk_level = 'high'),
      'stale', count(*) FILTER (WHERE status = 'stale' OR stale_at IS NOT NULL),
      'unreviewed', count(*) FILTER (WHERE reviewed_at IS NULL AND status IN ('calculated', 'stale'))
    ) INTO counts
    FROM public.erp_ai_risk_scores
    WHERE deleted_at IS NULL;
  WHEN 'compliance' THEN
    SELECT jsonb_build_object(
      'open', count(*) FILTER (WHERE status = 'open'),
      'critical', count(*) FILTER (WHERE status = 'open' AND severity = 'critical'),
      'high', count(*) FILTER (WHERE status = 'open' AND severity = 'high'),
      'waivedResolved', count(*) FILTER (WHERE status IN ('waived', 'resolved', 'false_positive'))
    ) INTO counts
    FROM public.erp_ai_compliance_findings
    WHERE deleted_at IS NULL;
  WHEN 'duplicate' THEN
    SELECT jsonb_build_object(
      'pending', count(*) FILTER (WHERE status = 'pending'),
      'highConfidence', count(*) FILTER (WHERE status = 'pending' AND confidence_score >= 0.9),
      'confirmed', count(*) FILTER (WHERE status IN ('confirmed_duplicate', 'confirmed_conflict')),
      'ignoredResolved', count(*) FILTER (WHERE status IN ('ignored', 'resolved'))
    ) INTO counts
    FROM public.erp_ai_duplicate_candidates
    WHERE deleted_at IS NULL;
  END CASE;
  RETURN counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.erp_ai_summary_counts(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.erp_ai_summary_counts(text) TO authenticated;

COMMIT;
