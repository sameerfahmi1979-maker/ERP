BEGIN;

INSERT INTO public.dms_document_categories(category_code,name_en)
VALUES ('FLEET_TIME_EVIDENCE','Fleet time evidence');
INSERT INTO public.dms_document_types(type_code,name_en,category_id,default_confidentiality,allowed_entity_types)
SELECT 'FLEET_SIGNED_INTERNAL_SHEET','Signed internal Fleet timesheet',id,'internal',ARRAY['fleet_asset']
FROM public.dms_document_categories WHERE category_code='FLEET_TIME_EVIDENCE';

-- Internal paper filing uses the Fleet evidence store and its existing exact-file retention guards.
ALTER TABLE erp_private.fleet_operation_evidence DROP CONSTRAINT fleet_operation_evidence_purpose_check;
ALTER TABLE erp_private.fleet_operation_evidence ADD CONSTRAINT fleet_operation_evidence_purpose_check
 CHECK(purpose IN('trip-order','pre-trip','pod','weigh','rental-handover','rental-return',
  'rental-sheet','rental-commercial','agreement','pod-exception','internal-sheet'));
DROP INDEX erp_private.fleet_evidence_unique_paper;
CREATE UNIQUE INDEX fleet_evidence_unique_paper ON erp_private.fleet_operation_evidence(company_id,purpose,paper_reference)
 WHERE purpose NOT IN('rental-sheet','pod-exception','internal-sheet');

CREATE TABLE erp_private.t19_internal_sheets (
 work_id bigint NOT NULL REFERENCES erp_private.t08_fleet_work(id),
 evidence_id bigint NOT NULL REFERENCES erp_private.fleet_operation_evidence(id),
 filed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 filed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(work_id,evidence_id)
);
CREATE INDEX t19_internal_sheets_evidence ON erp_private.t19_internal_sheets(evidence_id);
ALTER TABLE erp_private.t19_internal_sheets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t19_internal_sheets FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t19_internal_sheet_reviewer(w erp_private.t08_fleet_work)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(w.activity='internal'
   AND w.entered_by<>public.current_user_profile_id()
   AND NOT erp_private.t12_is_subject(public.current_user_profile_id(),w.employee_id)
   AND erp_private.t05_scope('fleet.time.verify',w.host_company_id,w.host_branch_id),false);
$$;

CREATE FUNCTION public.t19_internal_sheet_choices(p_work bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(choice) ORDER BY choice.document DESC,choice.file),'[]') FROM (
   SELECT d.id AS document,v.id AS version,f.id AS file,d.document_no AS reference,d.title AS label
   FROM erp_private.t08_fleet_work w JOIN erp_private.fleet_operation_assignments a ON a.id=w.assignment_id
   JOIN erp_private.fleet_assets asset ON asset.id=a.asset_id
   JOIN erp_private.fleet_document_parents parent ON parent.asset_id=a.asset_id
   JOIN public.dms_documents d ON d.id=parent.document_id AND (d.owning_company_id,d.owning_branch_id)=(asset.owner_company_id,asset.home_branch_id)
   JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.type_code='FLEET_SIGNED_INTERNAL_SHEET' AND t.is_active AND t.deleted_at IS NULL
   JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
   JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original'
    AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
   WHERE w.id=p_work AND erp_private.t19_internal_sheet_reviewer(w)
    AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived
    AND erp_private.document_permission(d.id,'dms.documents.preview')
    AND EXISTS(SELECT 1 FROM public.dms_document_links l
      WHERE l.document_id=d.id AND l.entity_type='fleet_asset' AND l.entity_id=a.asset_id AND l.deleted_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence e
      WHERE e.purpose='internal-sheet' AND e.document_id=d.id AND e.version_id=v.id
        AND (e.assignment_id<>a.id OR e.file_id<>f.id OR EXISTS(
          SELECT 1 FROM erp_private.t19_internal_sheets s WHERE s.work_id=w.id AND s.evidence_id=e.id)))
   ORDER BY d.id DESC,f.id LIMIT 40
 ) choice;
$$;

CREATE FUNCTION public.t19_file_internal_sheet(p_operation uuid,p_work bigint,p_original jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w erp_private.t08_fleet_work; d public.dms_documents;
 original_id bigint; original_version bigint; original_file bigint; evidence_id bigint;
 receipt jsonb; request_hash text;
BEGIN
 IF NOT erp_private.t05_fields(p_original,ARRAY['document','version','file']) THEN
   RAISE EXCEPTION 'Select the exact signed internal timesheet' USING ERRCODE='22023';
 END IF;
 SELECT * INTO w FROM erp_private.t08_fleet_work WHERE id=p_work FOR UPDATE;
 IF NOT erp_private.t19_internal_sheet_reviewer(w)
   OR NOT erp_private.t02_has_scope('fleet.time.verify',w.host_company_id,w.host_branch_id) THEN
   RAISE EXCEPTION 'Internal timesheet filing is outside your authority' USING ERRCODE='42501';
 END IF;
 original_id:=(p_original->>'document')::bigint;
 original_version:=(p_original->>'version')::bigint;
 original_file:=(p_original->>'file')::bigint;
 SELECT doc.* INTO d FROM public.dms_documents doc
 JOIN erp_private.fleet_document_parents parent ON parent.document_id=doc.id
 JOIN erp_private.fleet_operation_assignments a ON a.id=w.assignment_id AND a.asset_id=parent.asset_id
 JOIN erp_private.fleet_assets asset ON asset.id=a.asset_id
 WHERE doc.id=original_id AND (doc.owning_company_id,doc.owning_branch_id)=(asset.owner_company_id,asset.home_branch_id)
 FOR SHARE OF doc;
 IF d.id IS NULL OR erp_private.t19_print_evidence(original_id,original_version,original_file,'Internal sheet') IS NULL THEN
   RAISE EXCEPTION 'Signed original is unavailable in this scope' USING ERRCODE='42501';
 END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(w.id,original_id,original_version,original_file));
 receipt:=erp_private.t02_replay('fleet-internal-sheet',p_operation,request_hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t19_internal_sheet_choices(w.id)) item
   WHERE (item->>'document')::bigint=original_id AND (item->>'version')::bigint=original_version AND (item->>'file')::bigint=original_file)
 THEN RAISE EXCEPTION 'Refresh and select the verified original for this asset and work site' USING ERRCODE='PT409'; END IF;

 evidence_id:=erp_private.t07_record_evidence(w.order_id,w.assignment_id,'internal-sheet',
  p_original||jsonb_build_object('reference',d.document_no));
 INSERT INTO erp_private.t19_internal_sheets(work_id,evidence_id,filed_by)
 VALUES(w.id,evidence_id,public.current_user_profile_id());
 RETURN erp_private.t02_save_receipt('fleet-internal-sheet',p_operation,request_hash,jsonb_build_object('work',w.id,'evidence',evidence_id));
END;
$$;

-- A PDF link always identifies the exact retained original, including historical
-- versions still readable under the document's current access rules.
CREATE FUNCTION erp_private.t19_print_evidence(p_document bigint,p_version bigint,p_file bigint,p_label text)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('document',d.id,'version',v.id,'file',f.id,'label',p_label,
   'reference',d.document_no,'checksum',f.sha256_hash,'current',d.current_version_id=v.id AND v.is_current)
 FROM public.dms_documents d
 JOIN public.dms_document_versions v ON v.id=p_version AND v.document_id=d.id AND v.unlinked_at IS NULL
 JOIN public.dms_document_files f ON f.id=p_file AND f.document_id=d.id AND f.version_id=v.id
  AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status='verified'
  AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
 WHERE d.id=p_document AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived
  AND erp_private.document_permission(d.id,'dms.documents.preview');
$$;

CREATE FUNCTION erp_private.t19_print_at(p_at timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_char(p_at AT TIME ZONE 'Asia/Dubai','YYYY-MM-DD HH24:MI');
$$;

CREATE FUNCTION erp_private.t19_internal_sheet_originals(p_work bigint) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(original.item ORDER BY s.filed_at,e.id) FILTER(WHERE original.item IS NOT NULL),'[]')
 FROM erp_private.t19_internal_sheets s JOIN erp_private.fleet_operation_evidence e ON e.id=s.evidence_id
 CROSS JOIN LATERAL (SELECT erp_private.t19_print_evidence(e.document_id,e.version_id,e.file_id,
   'Filed signed internal sheet') AS item) original WHERE s.work_id=p_work;
$$;

CREATE OR REPLACE FUNCTION erp_private.t19_internal_sheet_evidence(p_work bigint) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN bool_or(original.visible) THEN 'available' WHEN count(*)>0 THEN 'restricted' ELSE 'missing' END
 FROM erp_private.t19_internal_sheets s JOIN erp_private.fleet_operation_evidence e ON e.id=s.evidence_id
 CROSS JOIN LATERAL (SELECT erp_private.document_permission(e.document_id,'dms.documents.preview') AS visible) original
 WHERE s.work_id=p_work AND erp_private.t07_evidence_is_current(e.id);
$$;

CREATE FUNCTION public.t19_operational_output(p_kind text,p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 company bigint; branch bigint; legal_name text; legal_ar text; branch_name text;
 title text; reference text; revision text; rows jsonb; evidence jsonb:='[]'; report jsonb;
 c erp_private.fleet_commitments; w erp_private.t08_fleet_work; r erp_private.t08_time_reviews;
 a erp_private.t10_assessments; j erp_private.t10_job_cycles; f erp_private.t13_cases;
 h erp_private.t13_hr_reviews; financial jsonb; source jsonb;
 hr boolean; accounts boolean; allowed boolean;
BEGIN
 IF p_id IS NULL OR p_id<=0 OR NOT erp_private.business_principal_is_active() THEN RETURN NULL; END IF;

 CASE p_kind
 WHEN 'custody' THEN
  SELECT * INTO c FROM erp_private.fleet_commitments WHERE id=p_id AND kind IN('custody','dispatch');
  IF c.id IS NULL OR NOT erp_private.t06_custody_visible(c.asset_id) THEN RETURN NULL; END IF;
  company:=c.company_id; branch:=c.branch_id;
  IF NOT erp_private.t02_has_scope('reports.pdf.generate',company,branch)
     OR NOT erp_private.t06_custody_reader(company,branch) THEN RETURN NULL; END IF;
  title:='Custody acknowledgement'; reference:='Custody #'||c.id; revision:=c.revision::text;
  rows:=jsonb_build_array(
    jsonb_build_array('Asset',(SELECT asset_no||' · '||name FROM erp_private.fleet_assets WHERE id=c.asset_id)),
    jsonb_build_array('Custodian',(SELECT full_name_en FROM public.employees WHERE id=c.employee_id)),
    jsonb_build_array('Site',(SELECT site_name FROM public.work_sites WHERE id=c.site_id)),
    jsonb_build_array('Commitment type',c.kind),jsonb_build_array('State',c.status),
    jsonb_build_array('Actual handover',erp_private.t19_print_at(lower(c.committed_during))),
    jsonb_build_array('Planned return',erp_private.t19_print_at(c.planned_return)),
    jsonb_build_array('Actual return',erp_private.t19_print_at(upper(c.committed_during))));
  rows:=rows||(SELECT coalesce(jsonb_agg(jsonb_build_array('Recorded '||event.kind,
    concat_ws(' · ',erp_private.t19_print_at(event.occurred_at),event.condition,
      CASE WHEN event.meter IS NOT NULL THEN event.meter::text||' '||event.meter_unit END,
      CASE WHEN event.discrepancy THEN 'Discrepancy recorded' END,event.reason)) ORDER BY event.id),'[]')
    FROM erp_private.fleet_custody_events event WHERE event.commitment_id=c.id);
  SELECT coalesce(jsonb_agg(proof.item ORDER BY event.id) FILTER(WHERE proof.item IS NOT NULL),'[]') INTO evidence
  FROM erp_private.fleet_custody_events event
  CROSS JOIN LATERAL (SELECT erp_private.t19_print_evidence(event.evidence_document_id,event.evidence_version_id,
      event.evidence_file_id,'Signed '||event.kind) AS item) proof WHERE event.commitment_id=c.id;

 WHEN 'timesheet' THEN
  SELECT * INTO w FROM erp_private.t08_fleet_work WHERE id=p_id;
  IF w.id IS NULL THEN RETURN NULL; END IF;
  company:=w.host_company_id; branch:=w.host_branch_id;
  IF NOT erp_private.t02_has_scope('reports.pdf.generate',company,branch)
     OR NOT erp_private.t08_ops_readable(w.order_id,company,branch) THEN RETURN NULL; END IF;
  SELECT * INTO r FROM erp_private.t08_time_reviews WHERE work_id=w.id ORDER BY id DESC LIMIT 1;
  title:=CASE w.activity WHEN 'customer-rental' THEN 'Customer equipment timesheet' ELSE 'Internal work timesheet' END;
  reference:='Work interval #'||w.id;
  revision:=CASE WHEN r.id IS NOT NULL THEN 'Review #'||r.id ELSE 'Recorded interval' END;
  rows:=jsonb_build_array(
    jsonb_build_array('Operating order',(SELECT order_no FROM erp_private.fleet_operation_orders WHERE id=w.order_id)),
    jsonb_build_array('Asset',(SELECT asset.asset_no||' · '||asset.name FROM erp_private.fleet_operation_assignments assignment
      JOIN erp_private.fleet_assets asset ON asset.id=assignment.asset_id WHERE assignment.id=w.assignment_id)),
    jsonb_build_array('Operator',(SELECT full_name_en FROM public.employees WHERE id=w.employee_id)),
    jsonb_build_array('Work site',(SELECT site_name FROM public.work_sites WHERE id=w.site_id)),
    jsonb_build_array('Work date',w.day::text),
    jsonb_build_array('Started',erp_private.t19_print_at(lower(w.work_period))),
    jsonb_build_array('Ended',erp_private.t19_print_at(upper(w.work_period))),
    jsonb_build_array('Recorded minutes',trim_scale(erp_private.t08_minutes(tstzmultirange(w.work_period)))::text),
    jsonb_build_array('Matched minutes',CASE WHEN r.id IS NOT NULL THEN trim_scale(erp_private.t08_minutes(erp_private.t08_current_match(w.id,r.id)))::text END),
    jsonb_build_array('Operations verification',CASE WHEN r.id IS NULL THEN 'Pending' ELSE erp_private.t19_print_at(r.reviewed_at) END));
  IF w.activity='customer-rental' THEN
   -- Read current and last-reconciled source identities. A corrected document
   -- is never substituted for the exact file that the earlier review bound.
   SELECT coalesce(jsonb_agg(item ORDER BY file) FILTER(WHERE item IS NOT NULL),'[]') INTO evidence
   FROM (
    SELECT linked.file,erp_private.t19_print_evidence(linked.document,linked.version,linked.file,
      CASE WHEN bool_or(linked.reconciled) THEN 'Reconciled signed customer sheet' ELSE 'Filed signed customer sheet' END) item
    FROM (
     SELECT (x->>'document')::bigint AS document,(x->>'version')::bigint AS version,
        (x->>'file')::bigint AS file,false AS reconciled
     FROM jsonb_array_elements(erp_private.t08_sheet_sources(w.id)) x
     UNION ALL
     SELECT (x->>'document')::bigint,(x->>'version')::bigint,(x->>'file')::bigint,true
     FROM jsonb_array_elements(coalesce(r.sources,'[]')) x
    ) linked GROUP BY linked.document,linked.version,linked.file
   ) originals;
  ELSE
   rows:=rows||jsonb_build_array(jsonb_build_array('Evidence basis','Internal Operations verification'));
   evidence:=erp_private.t19_internal_sheet_originals(w.id);
  END IF;

 WHEN 'assessment','job-card' THEN
  IF p_kind='job-card' THEN
   SELECT * INTO j FROM erp_private.t10_job_cycles WHERE id=p_id;
   SELECT * INTO a FROM erp_private.t10_assessments WHERE id=j.assessment_id;
  ELSE
   SELECT * INTO a FROM erp_private.t10_assessments WHERE id=p_id;
  END IF;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  company:=a.company_id; branch:=a.branch_id;
  IF NOT erp_private.t02_has_scope('reports.pdf.generate',company,branch)
    OR NOT erp_private.t10_case_visible(company,branch) THEN RETURN NULL; END IF;
  allowed:=erp_private.t05_scope('workshop.assess',company,branch)
    OR erp_private.t05_scope('workshop.jobs.manage',company,branch)
    OR erp_private.t05_scope('workshop.jobs.release',company,branch);
  title:='Workshop assessment'; reference:='Assessment #'||a.id;
  revision:=CASE WHEN a.assessed_at IS NULL THEN 'Finding recorded' ELSE 'Assessment decision' END;
  rows:=jsonb_build_array(
    jsonb_build_array('Asset',(SELECT asset_no||' · '||name FROM erp_private.fleet_assets WHERE id=a.asset_id)),
    jsonb_build_array('Finding source',a.source_kind),jsonb_build_array('Finding reference',a.source_ref),
    jsonb_build_array('Occurrence',erp_private.t19_print_at(a.occurred_at)),
    jsonb_build_array('Finding',a.finding),
    jsonb_build_array('Assessment decision',coalesce(a.outcome,'Pending')),
    jsonb_build_array('Diagnosis',a.diagnosis),
    jsonb_build_array('Assessed',erp_private.t19_print_at(a.assessed_at)));
  evidence:=jsonb_build_array(erp_private.t19_print_evidence(a.document_id,a.version_id,a.file_id,'Assessment evidence'));
  IF p_kind='job-card' THEN
   title:='Workshop job card'; reference:='WO-'||a.id||'/'||j.cycle; revision:=j.revision::text;
   rows:=rows||jsonb_build_array(
    jsonb_build_array('Job status',j.state),jsonb_build_array('Scope of work',j.scope_of_work),
    jsonb_build_array('Planned start',erp_private.t19_print_at(j.planned_start)),
    jsonb_build_array('Planned finish',erp_private.t19_print_at(j.planned_end)),
    jsonb_build_array('Actual start',erp_private.t19_print_at(j.actual_start)),
    jsonb_build_array('Actual finish',erp_private.t19_print_at(j.actual_end)),
    jsonb_build_array('Technical return',erp_private.t19_print_at(j.returned_at)));
   IF allowed THEN
    rows:=rows||jsonb_build_array(
     jsonb_build_array('Technician',(SELECT full_name_en FROM public.employees WHERE id=j.assigned_employee_id)),
     jsonb_build_array('Work completed',j.actual_work),jsonb_build_array('Work estimate (AED)',j.estimate_aed::text),
     jsonb_build_array('Recorded work cost (AED)',j.actual_cost_aed::text),jsonb_build_array('QC notes',j.qc_notes));
   END IF;
   evidence:=evidence||jsonb_build_array(
    erp_private.t19_print_evidence(j.return_document_id,j.return_version_id,j.return_file_id,'Technical release evidence'));
  END IF;

 WHEN 'fine','recovery' THEN
  SELECT * INTO f FROM erp_private.t13_cases WHERE id=p_id;
  IF f.id IS NULL THEN RETURN NULL; END IF;
  company:=f.company_id; branch:=f.branch_id; reference:='Case #'||f.id; revision:=f.source_revision::text;
  IF p_kind='fine' THEN
   IF NOT erp_private.t02_has_scope('reports.pdf.generate',company,branch) THEN RETURN NULL; END IF;
   allowed:=CASE WHEN f.source_kind='fine' THEN
      erp_private.t05_scope('fleet.fines.view',company,branch) OR erp_private.t05_scope('fleet.fines.record',company,branch)
      OR erp_private.t05_scope('fleet.fines.match',company,branch) OR erp_private.t05_scope('fleet.fines.verify',company,branch)
     ELSE erp_private.t05_scope('workshop.recoveries.intake',company,branch) END;
   IF NOT allowed THEN RETURN NULL; END IF;
   title:=CASE f.source_kind WHEN 'fine' THEN 'Fleet fine case summary' ELSE 'Fleet damage case summary' END;
   source:=erp_private.t13_case_workspace(f,false,false);
   SELECT coalesce(jsonb_agg(original.item ORDER BY ev.id) FILTER(WHERE original.item IS NOT NULL),'[]') INTO evidence
   FROM erp_private.t13_intake_evidence ev CROSS JOIN LATERAL
      (SELECT erp_private.t19_print_evidence(ev.document_id,ev.version_id,ev.file_id,'Authority '||ev.proof_role) AS item) original
   WHERE ev.case_id=f.id AND ev.proof_role IN('notice','authority-revision')
    AND erp_private.t05_scope('dms.documents.preview',company,branch);
   rows:=jsonb_build_array(jsonb_build_array('Authority',source->>'authority'),
    jsonb_build_array('Source reference',source->>'reference'),jsonb_build_array('Occurrence',erp_private.t19_print_at(f.occurred_at)),
    jsonb_build_array('Authority notice date',source->>'notice_on'),jsonb_build_array('Appeal deadline',source->>'appeal_deadline'),
    jsonb_build_array('Payment deadline',source->>'payment_deadline'),jsonb_build_array('Place',source->>'location'),
    jsonb_build_array('Offence',source->>'offence'),jsonb_build_array('Source status',f.source_status),
    jsonb_build_array('Source amount ('||f.currency||')',f.source_amount::text),
    jsonb_build_array('Driver review status',f.subject_status));
  ELSE
   company:=coalesce(f.employer_company_id,f.company_id); branch:=coalesce(f.employer_branch_id,f.branch_id);
   IF NOT erp_private.t02_has_scope('reports.pdf.generate',company,branch) THEN RETURN NULL; END IF;
   hr:=erp_private.t05_scope('hr.recovery.review',company,branch);
   accounts:=erp_private.t05_scope('hr.recovery.accounts',company,branch) AND erp_private.t05_scope('hr.payroll.view',company,branch);
   IF NOT (hr OR accounts) OR erp_private.t12_is_subject(public.current_user_profile_id(),f.employee_id) THEN RETURN NULL; END IF;
   title:='Restricted recovery review';
   SELECT * INTO h FROM erp_private.t13_hr_reviews WHERE case_id=f.id ORDER BY id DESC LIMIT 1;
   rows:=jsonb_build_array(jsonb_build_array('Source',f.source_kind),jsonb_build_array('Authority status',f.source_status),
    jsonb_build_array('Occurrence',erp_private.t19_print_at(f.occurred_at)),jsonb_build_array('Subject review',f.subject_status),
    jsonb_build_array('Case employee', (SELECT employee_code FROM public.employees WHERE id=f.employee_id)),
    jsonb_build_array('Source amount ('||f.currency||')',f.source_amount::text),
    jsonb_build_array('Latest HR review',h.id::text),jsonb_build_array('Decision',h.decision),
    jsonb_build_array('Review currency',f.currency));
   IF accounts THEN
    financial:=erp_private.t13_financial_summary(f.id);
    rows:=rows||jsonb_build_array(jsonb_build_array('Reconciliation',financial->>'reconciliation_id'),
      jsonb_build_array('Reconciled cost',financial->>'reconciled_cost'),jsonb_build_array('Recovery collected',financial->>'collected'),
      jsonb_build_array('Recovery outstanding',financial->>'outstanding'),jsonb_build_array('Current eligible remainder',financial->>'remaining'),
      jsonb_build_array('Refund due',financial->>'refund_due'));
   END IF;
   IF hr THEN
    rows:=rows||jsonb_build_array(jsonb_build_array('HR decision notes',h.reason));
   END IF;
   SELECT coalesce(jsonb_agg(original.item ORDER BY proof.id) FILTER(WHERE original.item IS NOT NULL),'[]') INTO evidence
   FROM erp_private.t13_recovery_proofs proof
   JOIN public.dms_documents doc ON doc.id=proof.document_id
   JOIN public.dms_document_types doc_type ON doc_type.id=doc.document_type_id
   CROSS JOIN LATERAL (SELECT erp_private.t19_print_evidence(proof.document_id,proof.version_id,proof.file_id,
     doc_type.name_en) AS item) original
   WHERE proof.case_id=f.id AND ((hr AND doc_type.type_code IN('T13_RECOVERY_EMPLOYEE_NOTICE','T13_RECOVERY_EMPLOYEE_RESPONSE'))
      OR (accounts AND doc_type.type_code IN('T13_RECOVERY_FINANCIAL_PROOF','T13_RECOVERY_CASH_RECEIPT','T13_RECOVERY_FINANCIAL_CORRECTION')
          AND ((doc.owning_company_id,doc.owning_branch_id)=(company,branch)
          OR erp_private.t05_scope('hr.recovery.accounts',doc.owning_company_id,doc.owning_branch_id))));
  END IF;

 ELSE RETURN NULL;
 END CASE;

 SELECT legal_name_en,nullif(btrim(legal_name_ar),''),(SELECT branch_name_en FROM public.branches WHERE id=branch)
 INTO legal_name,legal_ar,branch_name FROM public.owner_companies WHERE id=company;
 IF nullif(btrim(legal_name),'') IS NULL OR nullif(btrim(branch_name),'') IS NULL THEN RETURN NULL; END IF;
 evidence:=(SELECT coalesce(jsonb_agg(item),'[]') FROM jsonb_array_elements(evidence) item WHERE item<>'null'::jsonb);
 report:=jsonb_build_object('kind',p_kind,'source',p_id,'title',title,'reference',reference,
   'company',legal_name,'company_ar',legal_ar,'branch',branch_name,'revision',revision,'rows',rows,'evidence',evidence);
 RETURN report||jsonb_build_object('as_of',erp_private.t19_print_at(statement_timestamp()),
   'source_checksum',erp_private.t02_digest(report));
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t19_internal_sheet_reviewer(erp_private.t08_fleet_work),
 erp_private.t19_print_evidence(bigint,bigint,bigint,text),erp_private.t19_print_at(timestamptz),
 erp_private.t19_internal_sheet_evidence(bigint),erp_private.t19_internal_sheet_originals(bigint),
 public.t19_operational_output(text,bigint),public.t19_internal_sheet_choices(bigint),public.t19_file_internal_sheet(uuid,bigint,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t19_operational_output(text,bigint),public.t19_internal_sheet_choices(bigint),
 public.t19_file_internal_sheet(uuid,bigint,jsonb) TO authenticated;

-- Keep links in the owning workspaces aligned with the actual print scope.
-- Preserve signatures and grants on the replaced projections.
DO $$
DECLARE patch record; ddl text;
BEGIN
 FOR patch IN SELECT * FROM (VALUES
  ('public.t06_fleet_custody_workspace(bigint,bigint)',
   $a$'assigned_driver',c.verified_driver_id,$a$,
   $b$'assigned_driver',c.verified_driver_id,
    'can_print',c.kind IN('custody','dispatch') AND erp_private.t06_custody_reader(c.company_id,c.branch_id)
      AND erp_private.t05_scope('reports.pdf.generate',c.company_id,c.branch_id),$b$),
  ('public.t08_fleet_order_time(bigint,bigint)',
   $a$'activity',w.activity,$a$,
   $b$'activity',w.activity,'can_print',erp_private.t05_scope('reports.pdf.generate',w.host_company_id,w.host_branch_id),
    'can_file_sheet',erp_private.t19_internal_sheet_reviewer(w),
    'internal_sheets',CASE WHEN w.activity='internal' THEN erp_private.t19_internal_sheet_originals(w.id) ELSE '[]'::jsonb END,$b$),
  ('public.t10_workshop_workspace(bigint,bigint)',
   $a$'id',f.id,'kind',f.source_kind,$a$,
   $b$'id',f.id,'kind',f.source_kind,'can_print',erp_private.t05_scope('reports.pdf.generate',f.company_id,f.branch_id),$b$),
  ('public.t13_fleet_workspace_page(bigint,bigint)',
   $a$'can_intake_damage',can_intake_damage,$a$,
   $b$'can_print',erp_private.t05_scope('reports.pdf.generate',company,p_branch),'can_intake_damage',can_intake_damage,$b$),
  ('public.t13_recovery_workspace(bigint,date,bigint,bigint)',
   $a$'can_review',hr,'can_reconcile',accounts,$a$,
   $b$'can_print',(hr OR accounts) AND erp_private.t05_scope('reports.pdf.generate',company,p_branch),
    'can_review',hr,'can_reconcile',accounts,$b$),
  ('erp_private.t07_record_evidence(bigint,bigint,text,jsonb)',
   $a$WHEN 'rental-sheet' THEN ARRAY['FLEET_SIGNED_RENTAL_SHEET']$a$,
   $b$WHEN 'rental-sheet' THEN ARRAY['FLEET_SIGNED_RENTAL_SHEET']
  WHEN 'internal-sheet' THEN ARRAY['FLEET_SIGNED_INTERNAL_SHEET']$b$),
  ('erp_private.t07_record_evidence(bigint,bigint,text,jsonb)',
   $a$INSERT INTO erp_private.fleet_operation_evidence(order_id,assignment_id,purpose,company_id,paper_reference,document_id,version_id,file_id,recorded_by)$a$,
   $b$IF p_purpose='internal-sheet' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('fleet-internal-sheet:'||d_id||':'||v_id,0));
   SELECT ev.id INTO evidence_id FROM erp_private.fleet_operation_evidence ev WHERE ev.purpose=p_purpose AND ev.order_id=o.id
    AND ev.assignment_id=a.id AND ev.document_id=d_id AND ev.version_id=v_id AND ev.file_id=f_id AND ev.paper_reference=reference;
   IF evidence_id IS NOT NULL THEN RETURN evidence_id; END IF;
 END IF;
 INSERT INTO erp_private.fleet_operation_evidence(order_id,assignment_id,purpose,company_id,paper_reference,document_id,version_id,file_id,recorded_by)$b$),
  ('erp_private.t07_trip_action(uuid,bigint,text,jsonb,text)',
   $a$'branch',(SELECT branch_name_en FROM public.branches WHERE id=o.branch_id),$a$,
   $b$'branch',(SELECT branch_name_en FROM public.branches WHERE id=o.branch_id),
    'employer_ar',(SELECT nullif(btrim(legal_name_ar),'') FROM public.owner_companies WHERE id=o.company_id),$b$),
  ('erp_private.t07_trip_action(uuid,bigint,text,jsonb,text)',
   $a$'origin',s.site_name,'destination',d.site_name,$a$,
   $b$'origin',s.site_name,'destination',d.site_name,
       'pickup_address',nullif(concat_ws(', ',nullif(btrim(s.address_line_1),''),nullif(btrim(s.address_line_2),'')), ''),
       'delivery_address',nullif(concat_ws(', ',nullif(btrim(d.address_line_1),''),nullif(btrim(d.address_line_2),'')), ''),$b$)
 ) AS changes(signature,anchor,replacement) LOOP
   ddl:=pg_get_functiondef(patch.signature::regprocedure);
   IF (length(ddl)-length(replace(ddl,patch.anchor,'')))/length(patch.anchor)<>1 THEN
     RAISE EXCEPTION 'Unexpected output source definition for %',patch.signature;
   END IF;
   EXECUTE replace(ddl,patch.anchor,patch.replacement);
 END LOOP;
END
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
