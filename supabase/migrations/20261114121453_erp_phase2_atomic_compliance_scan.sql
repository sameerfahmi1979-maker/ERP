BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE erp_private.compliance_scan_receipts (
  operation_id uuid PRIMARY KEY,
  actor_id bigint NOT NULL,
  request_hash text NOT NULL,
  receipt jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE erp_private.compliance_scan_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.compliance_scan_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON erp_private.compliance_scan_receipts TO service_role;

-- Full and individual scans share one generation because their coverage can
-- overlap. Every commit checks the generation captured before source reads.
CREATE FUNCTION public.erp_compliance_scan_generation()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(max(committed_at),'epoch'::timestamptz) FROM erp_private.compliance_scan_receipts;
$$;
REVOKE ALL ON FUNCTION public.erp_compliance_scan_generation() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_compliance_scan_generation() TO service_role;

CREATE FUNCTION public.erp_commit_compliance_scan(p_operation uuid,p_actor bigint,p_generation timestamptz,
  p_entity_type text,p_entity_id bigint,p_coverage jsonb,p_findings jsonb,p_replace boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  old erp_private.compliance_scan_receipts;
  digest text;
  receipt jsonb;
  changed integer:=0;
  inserted integer:=0;
  scanned integer;
BEGIN
  IF current_user<>'service_role' OR p_operation IS NULL OR p_actor IS NULL OR p_generation IS NULL OR p_replace IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='ERP_AI_COMPLIANCE' AND is_enabled)
    OR NOT EXISTS (SELECT 1 FROM public.user_profiles u JOIN public.user_roles a ON a.user_profile_id=u.id
      JOIN public.roles r ON r.id=a.role_id WHERE u.id=p_actor AND u.status='active' AND NOT u.must_change_password
      AND a.is_active AND r.is_active AND a.owner_company_id IS NULL AND a.branch_id IS NULL
      AND (r.role_code IN ('system_admin','group_admin') OR EXISTS (SELECT 1 FROM public.role_permissions rp
        JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id AND p.is_active AND p.permission_code='ai.common.admin'))) THEN
    RAISE EXCEPTION 'Compliance scan unavailable' USING ERRCODE='42501';
  END IF;
  IF (p_entity_type IS NULL)<>(p_entity_id IS NULL) OR p_entity_id<1
    OR (p_entity_type IS NOT NULL AND p_entity_type NOT IN ('company','party','branch','site'))
    OR jsonb_typeof(p_coverage) IS DISTINCT FROM 'array' OR jsonb_typeof(p_findings) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_coverage)>100000 OR jsonb_array_length(p_findings)>2000
    OR octet_length(p_findings::text)>4194304 THEN
    RAISE EXCEPTION 'Invalid compliance scan payload' USING ERRCODE='22023';
  END IF;
  digest:=encode(sha256(convert_to(jsonb_build_array(p_actor,p_generation,p_entity_type,p_entity_id,p_coverage,p_findings,p_replace)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('erp:compliance-scan-commit',0));
  SELECT * INTO old FROM erp_private.compliance_scan_receipts WHERE operation_id=p_operation;
  IF FOUND THEN
    IF old.actor_id IS DISTINCT FROM p_actor OR old.request_hash IS DISTINCT FROM digest THEN
      RAISE EXCEPTION 'Compliance scan identity changed' USING ERRCODE='PT409';
    END IF;
    RETURN old.receipt||jsonb_build_object('replayed',true);
  END IF;
  IF p_generation IS DISTINCT FROM public.erp_compliance_scan_generation() THEN
    RAISE EXCEPTION 'Another compliance scan completed. Refresh and retry.' USING ERRCODE='PT409';
  END IF;

  -- Stabilize the four subject inventories while checking coverage and
  -- replacing prior findings. Other scans cannot commit over this snapshot.
  LOCK TABLE public.owner_companies,public.parties,public.branches,public.work_sites IN SHARE MODE;
  WITH expected AS MATERIALIZED (
    SELECT 'company'::text AS entity_type,id AS entity_id FROM public.owner_companies WHERE p_entity_type IS NULL OR (p_entity_type='company' AND id=p_entity_id)
    UNION ALL SELECT 'party',id FROM public.parties WHERE p_entity_type IS NULL OR (p_entity_type='party' AND id=p_entity_id)
    UNION ALL SELECT 'branch',id FROM public.branches WHERE p_entity_type IS NULL OR (p_entity_type='branch' AND id=p_entity_id)
    UNION ALL SELECT 'site',id FROM public.work_sites WHERE deleted_at IS NULL AND (p_entity_type IS NULL OR (p_entity_type='site' AND id=p_entity_id))
  ), supplied AS MATERIALIZED (SELECT x.* FROM jsonb_to_recordset(p_coverage) x(entity_type text,entity_id bigint)),
  differences AS ((SELECT * FROM expected EXCEPT ALL SELECT * FROM supplied) UNION ALL (SELECT * FROM supplied EXCEPT ALL SELECT * FROM expected))
  SELECT CASE WHEN EXISTS(SELECT 1 FROM differences) THEN -1 ELSE (SELECT count(*)::integer FROM expected) END INTO scanned;
  IF scanned<0 OR (p_entity_type IS NOT NULL AND scanned<>1) THEN
    RAISE EXCEPTION 'Compliance scan did not cover its complete current scope' USING ERRCODE='PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_findings) f(finding_key text,entity_type text,entity_id bigint)
    WHERE f.finding_key IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_coverage) c(entity_type text,entity_id bigint)
      WHERE c.entity_type=f.entity_type AND c.entity_id=f.entity_id)) THEN
    RAISE EXCEPTION 'Compliance finding outside the scanned scope' USING ERRCODE='22023';
  END IF;
  IF p_replace THEN
    UPDATE public.erp_ai_compliance_findings f SET status='superseded',updated_by=p_actor
    WHERE f.status='open' AND f.deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_coverage) c(entity_type text,entity_id bigint)
      WHERE c.entity_type=f.entity_type AND c.entity_id=f.entity_id);
    GET DIAGNOSTICS changed=ROW_COUNT;
  END IF;
  INSERT INTO public.erp_ai_compliance_findings(finding_type,severity,detection_method,finding_key,entity_type,entity_id,
    document_id,source_rule_id,source_duplicate_candidate_id,source_field_suggestion_id,field_code,expected_value,actual_value,
    confidence_score,evidence_json,ai_reason,recommended_action,status,created_by,updated_by)
  SELECT f.finding_type,f.severity,f.detection_method,f.finding_key,f.entity_type,f.entity_id,
    f.document_id,f.source_rule_id,f.source_duplicate_candidate_id,f.source_field_suggestion_id,f.field_code,f.expected_value,f.actual_value,
    f.confidence_score,f.evidence_json,f.ai_reason,f.recommended_action,'open',p_actor,p_actor
  FROM jsonb_to_recordset(p_findings) f(finding_type text,severity text,detection_method text,finding_key text,entity_type text,entity_id bigint,
    document_id bigint,source_rule_id bigint,source_duplicate_candidate_id bigint,source_field_suggestion_id bigint,field_code text,
    expected_value text,actual_value text,confidence_score numeric,evidence_json jsonb,ai_reason text,recommended_action text)
  ON CONFLICT (finding_key) WHERE status='open' AND deleted_at IS NULL DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  receipt:=jsonb_build_object('inserted',inserted,'superseded',changed,'skippedExisting',jsonb_array_length(p_findings)-inserted,'replayed',false);
  INSERT INTO erp_private.compliance_scan_receipts(operation_id,actor_id,request_hash,receipt)
  VALUES(p_operation,p_actor,digest,receipt);
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.erp_commit_compliance_scan(uuid,bigint,timestamptz,text,bigint,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_commit_compliance_scan(uuid,bigint,timestamptz,text,bigint,jsonb,jsonb,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
