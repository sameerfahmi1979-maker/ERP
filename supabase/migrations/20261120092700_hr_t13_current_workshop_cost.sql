
BEGIN;

-- Recovery uses a separately reviewed repair snapshot. Any later Workshop
-- change holds a new payroll proposal until the snapshot is refreshed and reviewed.
CREATE FUNCTION erp_private.t13_current_damage_facts(c erp_private.t13_cases)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t10_assessments a
   LEFT JOIN LATERAL (
     SELECT r.employee_id,r.employment_id,r.company_id,r.branch_id
     FROM erp_private.t10_hr_referrals r
     JOIN erp_private.t03_employment_periods p ON p.id=r.employment_id AND p.employee_id=r.employee_id
       AND p.company_id=r.company_id AND p.branch_id=r.branch_id
       AND p.work_period @> (a.occurred_at AT TIME ZONE 'Asia/Dubai')::date
     JOIN public.dms_document_files f ON f.id=a.file_id AND f.document_id=a.document_id AND f.version_id=a.version_id
       AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.sha256_hash~'^[0-9a-f]{64}$'
     WHERE r.assessment_id=a.id
   ) referral ON true
   WHERE a.id=c.assessment_id AND a.outcome IS NOT NULL AND a.source_kind<>'planned-service'
     AND ROW(a.asset_id,a.company_id,a.branch_id,a.occurred_at)=ROW(c.asset_id,c.company_id,c.branch_id,c.occurred_at)
     AND ROW(referral.employee_id,referral.employment_id,referral.company_id,referral.branch_id)
         IS NOT DISTINCT FROM ROW(c.employee_id,c.employment_id,c.employer_company_id,c.employer_branch_id)
     AND c.source_facts->>'assessment_source'=a.source_kind AND c.source_facts->>'assessment_reference'=a.source_ref
     AND c.source_facts->>'assessment_outcome'=a.outcome
     AND (c.source_facts->>'assessed_at')::timestamptz IS NOT DISTINCT FROM a.assessed_at
     AND c.source_facts->'repair_cycles'=(SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'revision',j.revision,
        'state',j.state,'estimate',j.estimate_aed,'actual',CASE WHEN j.state='closed' THEN j.actual_cost_aed END)
        ORDER BY j.cycle),'[]'::jsonb) FROM erp_private.t10_job_cycles j WHERE j.assessment_id=a.id)
 );
$$;

CREATE OR REPLACE FUNCTION erp_private.t13_source_digest(p_case bigint) RETURNS text
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
 SELECT erp_private.t02_digest(jsonb_build_object('source',to_jsonb(c),'evidence',
   (SELECT coalesce(jsonb_agg(jsonb_build_array(v.revision,e.document_id,e.version_id,e.file_id,e.sha256)
     ORDER BY v.revision),'[]'::jsonb) FROM erp_private.t13_case_versions v
    JOIN erp_private.t13_intake_evidence e ON e.id=v.evidence_id WHERE v.case_id=c.id)))
 FROM erp_private.t13_cases c WHERE c.id=p_case
   AND (c.source_kind<>'damage' OR erp_private.t13_current_damage_facts(c));
$$;

CREATE OR REPLACE FUNCTION erp_private.t13_lock_settlement(p_case bigint)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE assessment bigint;
BEGIN
  SELECT assessment_id INTO assessment FROM erp_private.t13_cases WHERE id=p_case FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery case is unavailable' USING ERRCODE='42501';
  END IF;
  IF assessment IS NOT NULL THEN
    PERFORM 1 FROM erp_private.t10_assessments WHERE id=assessment FOR UPDATE;
    PERFORM 1 FROM erp_private.t10_job_cycles WHERE assessment_id=assessment ORDER BY id FOR SHARE;
  END IF;
  INSERT INTO erp_private.t13_settlement_writes(case_id) VALUES (p_case)
  ON CONFLICT (case_id) DO UPDATE SET case_id=excluded.case_id;
END $$;

CREATE FUNCTION erp_private.t13_require_current_source() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.source_digest IS NULL THEN
   RAISE EXCEPTION 'Refresh the current Workshop assessment and repair costs before reviewing this case' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t13_current_hr_basis BEFORE INSERT ON erp_private.t13_hr_reviews
 FOR EACH ROW EXECUTE FUNCTION erp_private.t13_require_current_source();
CREATE TRIGGER t13_current_accounts_basis BEFORE INSERT ON erp_private.t13_reconciliations
 FOR EACH ROW EXECUTE FUNCTION erp_private.t13_require_current_source();

REVOKE ALL ON FUNCTION erp_private.t13_current_damage_facts(erp_private.t13_cases),erp_private.t13_require_current_source()
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
