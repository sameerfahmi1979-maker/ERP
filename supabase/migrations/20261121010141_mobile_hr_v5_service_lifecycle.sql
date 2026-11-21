BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

ALTER TABLE erp_private.hr_self_service_requests DROP CONSTRAINT hr_self_service_requests_kind_check,
 DROP CONSTRAINT hr_self_service_requests_status_check,DROP CONSTRAINT hr_self_service_requests_check;
ALTER TABLE erp_private.hr_self_service_requests ADD CHECK(kind IN ('profile-correction','attendance-correction','compliance-renewal','letter','issue-replacement','issue-return',
 'task-evidence','dependent-change','accommodation-issue','overtime','shift-change','pro-follow-up','clearance-evidence','issue-acknowledgement')),
 ADD CHECK (kind NOT IN ('profile-correction','attendance-correction','compliance-renewal') OR status IN ('pending','approved','rejected')),
 ADD CHECK ((kind='issue-acknowledgement' AND status='recorded' AND revision=1 AND decided_by IS NULL AND decided_at IS NULL) OR
 (kind<>'issue-acknowledgement' AND ((status='pending' AND revision=1 AND decided_by IS NULL AND decided_at IS NULL) OR
 (status IN ('approved','rejected','fulfilled') AND revision=CASE status WHEN 'fulfilled' THEN 3 ELSE 2 END AND decided_by IS NOT NULL AND decided_by<>requester AND decided_at IS NOT NULL))));
ALTER TABLE erp_private.hr_self_service_requests ADD COLUMN mobile_evidence_proof jsonb;
CREATE UNIQUE INDEX mobile_hr_issue_one_confirmation ON erp_private.hr_self_service_requests(employee_id,(proposal->'source'->>'kind'),(proposal->'source'->>'id'),(proposal->'source'->>'revision'),(proposal->>'statementVersion')) WHERE kind='issue-acknowledgement';

CREATE TABLE erp_private.mobile_hr_service_attempts(
 request_id bigint NOT NULL REFERENCES erp_private.hr_self_service_requests, actor uuid NOT NULL, operation_id uuid NOT NULL,
 request_revision bigint NOT NULL, command jsonb NOT NULL, command_hash text NOT NULL, proposal_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), canonical jsonb, fulfilled_at timestamptz,
 no_effect_at timestamptz, reserved_output_id bigint UNIQUE, issuance_key text UNIQUE, PRIMARY KEY(actor,operation_id), CHECK(no_effect_at IS NULL OR canonical IS NULL), CHECK((canonical IS NULL)=(fulfilled_at IS NULL))
);
CREATE UNIQUE INDEX mobile_hr_one_active_attempt ON erp_private.mobile_hr_service_attempts(request_id) WHERE no_effect_at IS NULL;
CREATE TABLE erp_private.mobile_hr_operation_bindings(
 actor uuid NOT NULL, operation_id uuid NOT NULL, action text NOT NULL, command_hash text NOT NULL, PRIMARY KEY(actor,operation_id)
);
ALTER TABLE erp_private.mobile_hr_operation_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_hr_operation_bindings FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO erp_private.mobile_hr_operation_bindings SELECT actor,operation_id,action,request_hash FROM erp_private.hr_self_operation_receipts;
CREATE FUNCTION erp_private.mobile_hr_bind(action_name text,op uuid,digest text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO erp_private.mobile_hr_operation_bindings VALUES(auth.uid(),op,action_name,digest) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT FROM erp_private.mobile_hr_operation_bindings b WHERE b.actor=auth.uid() AND b.operation_id=op AND b.action=action_name AND b.command_hash=digest)
 THEN RAISE EXCEPTION 'Operation already bound' USING ERRCODE='PT409'; END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_bind(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE erp_private.mobile_hr_service_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_hr_service_attempts FROM PUBLIC,anon,authenticated,service_role;
CREATE UNIQUE INDEX mobile_hr_service_one_output ON erp_private.mobile_hr_service_attempts(((canonical->>'issuanceId')::bigint)) WHERE canonical->>'issuanceId' IS NOT NULL;
CREATE UNIQUE INDEX mobile_hr_service_one_proof ON erp_private.mobile_hr_service_attempts(actor,((canonical->>'operationId')::uuid)) WHERE canonical->>'operationId' IS NOT NULL;

-- Guard the reviewed v4.1 definitions in place so the old list filters before LIMIT,
-- old direct openings/decisions reject v5 rows, and old receipts cannot replay a new action.
DO $$
DECLARE original text; body text; definition text; kinds text:='(''profile-correction'',''attendance-correction'',''compliance-renewal'')';
BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid='erp_private.mobile_hr_read(text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'4b802654ac80b6f00b885a4858077a29b87e36c92f5ce6a434d9002362771d6b' THEN RAISE EXCEPTION 'Unreviewed legacy list definition'; END IF;
 body:=replace(original,'IF NOT FOUND OR NOT(erp_private.mobile_hr_request_visible','IF NOT FOUND OR r.kind NOT IN '||kinds||' OR NOT(erp_private.mobile_hr_request_visible');
 body:=replace(body,'WHERE s.id>after_id','WHERE s.kind IN '||kinds||' AND s.id>after_id');
 EXECUTE replace(definition,original,body);
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid='erp_private.mobile_hr_command(text,jsonb,boolean)'::regprocedure;
 -- Reviewed integrated T04 dispatcher. Every patch point must occur exactly once.
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '254bf4de75cf6471efc517907620624189e4271851c27062106982a5df0a90b5'
    OR EXISTS (SELECT FROM unnest(ARRAY['domain:=r.kind; proposal:=r.proposal;',
       'eid:=CASE WHEN action=''receipt''','IF action=''receipt'' AND rec.actor IS NULL']) anchor
       WHERE cardinality(string_to_array(original,anchor))<>2)
 THEN RAISE EXCEPTION 'Unreviewed integrated mobile command definition or patch point'; END IF;
 body:=replace(original,'domain:=r.kind; proposal:=r.proposal;', 'IF r.kind NOT IN '||kinds||' THEN RAISE EXCEPTION ''Unsupported legacy request'' USING ERRCODE=''22023''; END IF; domain:=r.kind; proposal:=r.proposal;');
 body:=replace(body,'eid:=CASE WHEN action=''receipt''','IF action<>''receipt'' THEN PERFORM erp_private.mobile_hr_bind(action,op,digest); END IF; eid:=CASE WHEN action=''receipt''');
 body:=replace(body,'IF action=''receipt'' AND rec.actor IS NULL','IF action=''receipt'' AND (rec.actor IS NULL OR rec.action LIKE ''v5.%'')');
 EXECUTE replace(definition,original,body);
END $$;

CREATE FUNCTION erp_private.mobile_hr_v5_keys(j jsonb,required text,optional text DEFAULT '') RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE req text[]:=string_to_array(required,' '); allowed text[]:=req||string_to_array(optional,' ');
BEGIN
 IF jsonb_typeof(j) IS DISTINCT FROM 'object' OR NOT(j ?& req) OR EXISTS(SELECT FROM jsonb_object_keys(j) k WHERE NOT(k=ANY(allowed))) THEN
   RAISE EXCEPTION 'Unexpected service fields' USING ERRCODE='22023';
 END IF;
END $$;

CREATE FUNCTION erp_private.mobile_hr_v5_values(j jsonb,spec jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE f record; t text; v jsonb; s text; ok boolean;
BEGIN
 FOR f IN SELECT * FROM jsonb_each_text(spec) LOOP
  IF NOT j?f.key THEN CONTINUE; END IF;
  t:=f.value; v:=j->f.key; s:=j->>f.key;
  IF right(t,1)='?' THEN IF v='null' THEN CONTINUE; END IF; t:=left(t,-1); END IF;
  ok:=CASE
   WHEN t='id' THEN jsonb_typeof(v)='number' AND s~'^[1-9][0-9]{0,15}$' AND v::numeric<=9007199254740991
   WHEN t='revision' THEN jsonb_typeof(v)='string' AND s~'^[1-9][0-9]{0,18}$' AND s::numeric<=9223372036854775807
   WHEN t='date' THEN jsonb_typeof(v)='string' AND s~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND (s::date)::text=s
   WHEN t='bool' THEN jsonb_typeof(v)='boolean'
   WHEN t='hours' THEN jsonb_typeof(v)='number' AND v::numeric>0 AND v::numeric<=24 AND round(v::numeric,2)=v::numeric
   WHEN t='uuid' THEN jsonb_typeof(v)='string' AND s~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   WHEN t='sha' THEN jsonb_typeof(v)='string' AND s~'^[a-f0-9]{64}$'
   WHEN left(t,1)='=' THEN jsonb_typeof(v)='string' AND s=ANY(string_to_array(substr(t,2),'|'))
   ELSE jsonb_typeof(v)='string' AND s=btrim(s) AND s!~'[[:cntrl:]]' AND length(s) BETWEEN CASE WHEN left(t,1)='*' THEN 0 ELSE 1 END AND trim(leading '*' from t)::integer END;
  IF ok IS NOT TRUE THEN RAISE EXCEPTION 'Invalid service field' USING ERRCODE='22023'; END IF;
 END LOOP;
END $$;

CREATE FUNCTION erp_private.mobile_hr_v5_domain(eid bigint,k text,p jsonb,manage boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(erp_private.business_principal_is_active() AND
  CASE WHEN k='clearance-evidence' THEN erp_private.employee_permission(eid,'hr.actions.view') OR erp_private.employee_permission(eid,'hr.eos.view')
   ELSE erp_private.employee_permission(eid,CASE WHEN k IN('issue-replacement','issue-return','issue-acknowledgement','accommodation-issue') THEN 'hr.assignments.view'
    WHEN k IN('shift-change','overtime') THEN 'hr.attendance.view' WHEN k='pro-follow-up' THEN 'hr.actions.view'
    WHEN k='dependent-change' THEN 'hr.compliance.view' WHEN k IN ('letter','task-evidence') THEN 'hr.employees.view' END) END
  AND (k<>'task-evidence' OR EXISTS(SELECT FROM public.hr_onboarding_tasks t WHERE t.employee_id=eid
    AND t.id=coalesce((p#>>'{source,id}')::bigint,t.id) AND t.deleted_at IS NULL
    AND ((erp_private.mobile_hr_self(eid) AND erp_private.employee_permission(eid,'hr.requests.submit')) OR erp_private.onboarding_permission(t.candidate_id,eid,'hr.recruitment.view'))
    AND (t.task_category IS DISTINCT FROM 'medical' OR erp_private.employee_permission(eid,'hr.medical.view')) AND (t.task_category IS DISTINCT FROM 'payroll' OR erp_private.employee_permission(eid,'hr.payroll.view'))))
  AND (NOT manage OR (public.current_user_can_view_employee(eid) AND erp_private.f11_child_authorized('approval',eid)
    AND NOT EXISTS(SELECT FROM public.erp_user_employee_links l WHERE l.employee_id=eid AND l.user_profile_id=public.current_user_profile_id())
    AND CASE WHEN k IN ('issue-return','issue-replacement') THEN erp_private.f11_child_authorized(coalesce(p#>>'{source,kind}','asset'),eid)
      WHEN k='accommodation-issue' THEN erp_private.f11_child_authorized('accommodation',eid)
      WHEN k='dependent-change' THEN erp_private.employee_permission(eid,'hr.compliance.manage')
      WHEN k='letter' THEN erp_private.employee_permission(eid,'reports.run') AND erp_private.employee_permission(eid,'reports.pdf.generate')
        AND NOT EXISTS(SELECT FROM public.erp_report_registry r CROSS JOIN LATERAL unnest(r.required_permissions) perm
          WHERE r.report_code=p->>'outputCode' AND NOT erp_private.employee_permission(eid,perm))
        AND CASE p->>'outputCode' WHEN 'HR_BANK_SALARY_TRANSFER' THEN erp_private.employee_permission(eid,'hr.payroll.view') AND erp_private.employee_permission(eid,'hr.banking.view')
          WHEN 'HR_SALARY_CERT_WITH_AMOUNT' THEN erp_private.employee_permission(eid,'hr.payroll.view')
          WHEN 'HR_WARNING_LETTER' THEN erp_private.employee_permission(eid,'hr.actions.view') AND erp_private.employee_permission(eid,'hr.confidential.view')
          WHEN 'HR_EXPERIENCE_LETTER' THEN erp_private.employee_permission(eid,'hr.eos.view') AND erp_private.employee_permission(eid,'hr.payroll.view')
          WHEN 'HR_PPE_ISSUE_FORM' THEN erp_private.employee_permission(eid,'hr.assignments.view')
          WHEN 'HR_CLEARANCE_FORM' THEN erp_private.employee_permission(eid,'hr.eos.view')
          WHEN 'HR_HANDOVER_FORM' THEN erp_private.employee_permission(eid,'hr.actions.view') AND erp_private.employee_permission(eid,'hr.assignments.view')
          WHEN 'HR_LEAVE_CONFIRMATION' THEN erp_private.employee_permission(eid,'hr.leave.view') ELSE true END
      WHEN k='task-evidence' THEN EXISTS(SELECT FROM public.hr_onboarding_tasks t WHERE t.employee_id=eid AND t.deleted_at IS NULL
        AND t.id=coalesce((p#>>'{source,id}')::bigint,t.id) AND erp_private.onboarding_permission(t.candidate_id,eid,'hr.recruitment.manage'))
      ELSE erp_private.f11_child_authorized(CASE k WHEN 'overtime' THEN 'overtime' WHEN 'shift-change' THEN 'shift-assignment' WHEN 'pro-follow-up' THEN 'pro-process' WHEN 'clearance-evidence' THEN 'clearance' END,eid) END)),false)
$$;

CREATE FUNCTION erp_private.mobile_hr_v5_source(eid bigint,src jsonb,lock_it boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE tbl text; subject text; found_row jsonb;
BEGIN
 IF src IS NULL OR src='null' THEN RETURN NULL; END IF;
 PERFORM erp_private.mobile_hr_v5_keys(src,'kind id revision');
 PERFORM erp_private.mobile_hr_v5_values(src,'{"id":"id","revision":"revision"}');
 tbl:=CASE src->>'kind' WHEN 'asset' THEN 'employee_assets' WHEN 'ppe' THEN 'employee_ppe_issues' WHEN 'dependent' THEN 'employee_dependents'
   WHEN 'accommodation' THEN 'employee_accommodation_records' WHEN 'onboarding-task' THEN 'hr_onboarding_tasks'
   WHEN 'shift-assignment' THEN 'employee_shift_assignments' WHEN 'pro-process' THEN 'employee_pro_processes' WHEN 'clearance' THEN 'employee_clearance_items' END;
 IF tbl IS NULL THEN RAISE EXCEPTION 'Invalid service source' USING ERRCODE='22023'; END IF;
 EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE id=$1 AND employee_id=$2 AND deleted_at IS NULL %s',tbl,CASE WHEN lock_it THEN 'FOR SHARE' ELSE '' END)
   INTO found_row USING (src->>'id')::bigint,eid;
 RETURN found_row;
END $$;

CREATE FUNCTION erp_private.mobile_hr_v5_evidence(eid bigint,p jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN p->>'evidence' IS NULL THEN true
 WHEN p#>>'{source,kind}' IS DISTINCT FROM 'dependent' THEN erp_private.mobile_hr_evidence(eid,(p#>>'{evidence,documentId}')::bigint,(p#>>'{evidence,documentVersionId}')::bigint)
 ELSE EXISTS(SELECT FROM public.dms_documents d JOIN public.employees e ON e.id=eid AND e.deleted_at IS NULL
  JOIN public.employee_dependents dep ON dep.id=(p#>>'{source,id}')::bigint AND dep.employee_id=eid AND dep.deleted_at IS NULL
  JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.unlinked_at IS NULL
  WHERE d.id=(p#>>'{evidence,documentId}')::bigint AND d.current_version_id=(p#>>'{evidence,documentVersionId}')::bigint
   AND d.owning_company_id=e.owner_company_id AND(d.owning_branch_id IS NULL OR d.owning_branch_id=e.branch_id)
   AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status IN('active','approved') AND public.current_user_can_view_dms_document(d.id)
   AND erp_private.document_permission(d.id,'dms.documents.view') AND erp_private.document_permission(d.id,'dms.documents.preview')
   AND (SELECT count(*)=1 AND bool_and(f.file_size_bytes>0 AND f.integrity_status<>'failed') FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=v.id AND f.file_role='original' AND f.deleted_at IS NULL)
   AND EXISTS(SELECT FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='employee_dependent' AND l.entity_id=dep.id AND l.deleted_at IS NULL)
   AND NOT EXISTS(SELECT FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL
    AND ((l.entity_type='employee' AND l.entity_id IS DISTINCT FROM eid) OR(l.entity_type='employee_dependent' AND l.entity_id IS DISTINCT FROM dep.id)))) END
$$;
CREATE FUNCTION erp_private.mobile_hr_v5_evidence_facts(eid bigint,p jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'version',f.version_id,'document',f.document_id,'bytes',f.file_size_bytes,'sha256',f.sha256_hash)
 FROM public.dms_document_files f WHERE f.document_id=(p#>>'{evidence,documentId}')::bigint AND f.version_id=(p#>>'{evidence,documentVersionId}')::bigint
 AND f.deleted_at IS NULL AND f.file_role='original' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
 AND erp_private.mobile_hr_v5_evidence(eid,p) AND erp_private.mobile_hr_v5_disclose_evidence(eid,f.document_id)
$$;

CREATE FUNCTION erp_private.mobile_hr_v5_validate(eid bigint,p jsonb,check_revision boolean DEFAULT true,evidence_source jsonb DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text:=p->>'kind'; keys text; expected text; src jsonb:=p->'source'; ev jsonb:=p->'evidence'; r jsonb; changes jsonb:=p->'changes';
BEGIN
 keys:=CASE k WHEN 'letter' THEN 'employeeRevision outputCode language recipient purpose neededBy evidence'
  WHEN 'issue-replacement' THEN 'source reason evidence' WHEN 'issue-return' THEN 'source requestedDate reason evidence'
  WHEN 'task-evidence' THEN 'source evidence note' WHEN 'dependent-change' THEN 'source employeeRevision changes evidence'
  WHEN 'accommodation-issue' THEN 'source employeeRevision category description evidence' WHEN 'overtime' THEN 'employeeRevision date hours reason evidence'
  WHEN 'shift-change' THEN 'source employeeRevision shiftId from to reason' WHEN 'pro-follow-up' THEN 'source message evidence'
  WHEN 'clearance-evidence' THEN 'source caseId evidence note' WHEN 'issue-acknowledgement' THEN 'source statementVersion confirmed' END;
 IF keys IS NULL THEN RAISE EXCEPTION 'Unknown service' USING ERRCODE='22023'; END IF;
 PERFORM erp_private.mobile_hr_v5_keys(p,'kind '||keys,CASE WHEN k='letter' THEN 'recipientAr purposeAr validUntil' ELSE '' END);
 PERFORM erp_private.mobile_hr_v5_values(p,'{"employeeRevision":"revision","outputCode":"100","language":"=en|ar|bilingual","recipient":"200","purpose":"500","neededBy":"date?","reason":"2000","requestedDate":"date","note":"*2000","category":"=maintenance|room|transport|safety|other","description":"2000","date":"date","hours":"hours","shiftId":"id","from":"date","to":"date?","message":"2000","caseId":"id","statementVersion":"=receipt-v1","confirmed":"bool"}');
 IF k='overtime' THEN PERFORM erp_private.mobile_hr_v5_values(p,'{"reason":"500"}'); END IF;
 IF k='issue-acknowledgement' AND p->'confirmed'<>'true' THEN RAISE EXCEPTION 'Explicit acknowledgment required' USING ERRCODE='22023'; END IF;
 IF p?'employeeRevision' AND NOT EXISTS(SELECT FROM public.employees e WHERE e.id=eid AND e.deleted_at IS NULL AND e.workspace_revision=(p->>'employeeRevision')::bigint) THEN
  RAISE EXCEPTION 'Employee changed' USING ERRCODE='PT409'; END IF;
 IF k IN ('task-evidence','clearance-evidence') AND ev='null' THEN RAISE EXCEPTION 'Evidence required' USING ERRCODE='22023'; END IF;
 IF ev IS NOT NULL AND ev<>'null' THEN
  PERFORM erp_private.mobile_hr_v5_keys(ev,'documentId documentVersionId');
  PERFORM erp_private.mobile_hr_v5_values(ev,'{"documentId":"id","documentVersionId":"id"}');
  PERFORM 1 FROM public.dms_documents WHERE id=(ev->>'documentId')::bigint FOR SHARE;
  PERFORM 1 FROM public.dms_document_versions WHERE id=(ev->>'documentVersionId')::bigint FOR SHARE;
  PERFORM 1 FROM public.dms_document_links WHERE document_id=(ev->>'documentId')::bigint AND deleted_at IS NULL FOR SHARE;
  PERFORM 1 FROM public.dms_document_files WHERE document_id=(ev->>'documentId')::bigint AND version_id=(ev->>'documentVersionId')::bigint FOR SHARE;
  IF erp_private.mobile_hr_v5_evidence_facts(eid,CASE WHEN evidence_source IS NULL THEN p ELSE p||jsonb_build_object('source',evidence_source) END) IS NULL THEN RAISE EXCEPTION 'Evidence unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF k IN ('issue-return','issue-replacement','issue-acknowledgement','task-evidence','pro-follow-up','clearance-evidence') AND src->>'kind' IS NULL THEN
  RAISE EXCEPTION 'Current service source required' USING ERRCODE='22023'; END IF;
 IF src IS NOT NULL AND src<>'null' THEN
  expected:=CASE k WHEN 'task-evidence' THEN 'onboarding-task' WHEN 'pro-follow-up' THEN 'pro-process' WHEN 'shift-change' THEN 'shift-assignment'
    WHEN 'dependent-change' THEN 'dependent' WHEN 'accommodation-issue' THEN 'accommodation' WHEN 'clearance-evidence' THEN 'clearance' END;
  IF (expected IS NOT NULL AND src->>'kind' IS DISTINCT FROM expected) OR (expected IS NULL AND coalesce(src->>'kind','') NOT IN ('asset','ppe')) THEN
   RAISE EXCEPTION 'Incorrect service source' USING ERRCODE='22023'; END IF;
  r:=erp_private.mobile_hr_v5_source(eid,src,true);
  IF r IS NULL OR (check_revision AND r->>'workspace_revision' IS DISTINCT FROM src->>'revision') THEN RAISE EXCEPTION 'Original source changed' USING ERRCODE='PT409'; END IF;
  IF src->>'kind' IN ('asset','ppe') AND check_revision AND (r->>'status' IS DISTINCT FROM 'issued' OR r->>'returned_date' IS NOT NULL) THEN RAISE EXCEPTION 'Item no longer issued' USING ERRCODE='PT409'; END IF;
  IF k='issue-return' AND (p->>'requestedDate')::date<(r->>'issued_date')::date THEN RAISE EXCEPTION 'Invalid return date' USING ERRCODE='22023'; END IF;
  IF k='clearance-evidence' AND r->'eos_case_id' IS DISTINCT FROM p->'caseId' THEN RAISE EXCEPTION 'Incorrect EOS case' USING ERRCODE='42501'; END IF;
 END IF;
 IF k='shift-change' THEN
  IF p->>'to'<p->>'from' OR NOT EXISTS(SELECT FROM public.work_shifts w WHERE w.id=(p->>'shiftId')::bigint AND w.is_active AND w.deleted_at IS NULL
     AND EXISTS(SELECT FROM public.work_calendars c JOIN public.employees e ON e.id=eid WHERE c.id=w.calendar_id AND c.is_active AND c.deleted_at IS NULL AND (c.owner_company_id IS NULL OR c.owner_company_id=e.owner_company_id)))
   THEN RAISE EXCEPTION 'Invalid shift assignment' USING ERRCODE='22023'; END IF;
 END IF;
 -- Fixed definitions in src/lib/official-documents/registry.ts support all three reviewed languages.
 -- Legacy catalogue outputs without a fixed language definition offer English.
 IF k='letter' AND p->>'language'<>'en' AND (p->>'outputCode') NOT IN ('HR_EMPLOYMENT_LETTER','HR_EMPLOYMENT_CONFIRMATION','HR_EXPERIENCE_LETTER','HR_SALARY_CERT_WITH_AMOUNT','HR_SALARY_CERT_GENERAL','HR_NOC','HR_WARNING_LETTER','HR_CLEARANCE_FORM','HR_JOINING_CHECKLIST','HR_PPE_ISSUE_FORM','HR_BANK_SALARY_TRANSFER','HR_EMBASSY_LETTER','HR_HANDOVER_FORM','HR_LEAVE_CONFIRMATION') THEN RAISE EXCEPTION 'Unsupported catalogue language' USING ERRCODE='22023'; END IF;
 IF k='letter' THEN
  PERFORM erp_private.mobile_hr_v5_values(p,'{"recipientAr":"200","purposeAr":"500","validUntil":"date"}');
  IF ((p->>'outputCode'='HR_NOC') IS DISTINCT FROM (p?'validUntil')) OR
    ((p->>'language'<>'en' AND p->>'outputCode' IN('HR_NOC','HR_SALARY_CERT_WITH_AMOUNT','HR_EMBASSY_LETTER','HR_EMPLOYMENT_CONFIRMATION')) IS DISTINCT FROM (p?'recipientAr')) OR
    ((p->>'language'<>'en' AND p->>'outputCode' IN('HR_NOC','HR_SALARY_CERT_WITH_AMOUNT','HR_EMBASSY_LETTER')) IS DISTINCT FROM (p?'purposeAr'))
  THEN RAISE EXCEPTION 'Explicit letter particulars required for the selected language and definition' USING ERRCODE='22023'; END IF;
  IF (p->>'outputCode'='HR_NOC' AND length(p->>'purpose')>200) OR
     (p->>'outputCode'='HR_SALARY_CERT_WITH_AMOUNT' AND p->>'language'<>'ar' AND length(p->>'recipient')>120)
   THEN RAISE EXCEPTION 'Official letter input length exceeded' USING ERRCODE='22023'; END IF;
  IF (p->>'outputCode'='HR_EMPLOYMENT_CONFIRMATION' AND greatest(length(p->>'recipient'),length(p->>'recipientAr'))>180) OR
     (p->>'outputCode' IN('HR_NOC','HR_SALARY_CERT_WITH_AMOUNT','HR_EMBASSY_LETTER') AND greatest(length(p->>'purpose'),length(p->>'purposeAr'))>250)
  THEN RAISE EXCEPTION 'Official letter input length exceeded' USING ERRCODE='22023'; END IF;
 END IF;
 IF k='letter' AND NOT EXISTS(SELECT FROM public.erp_report_registry g WHERE g.report_code=p->>'outputCode' AND g.is_active AND g.deleted_at IS NULL AND lower(g.module_code)='hr' AND g.document_class IN('A','B','C','D')) THEN
  RAISE EXCEPTION 'Current employee catalogue entry required' USING ERRCODE='22023'; END IF;
 IF k='dependent-change' THEN
  PERFORM erp_private.mobile_hr_v5_keys(changes,'','nameEn nameAr relationshipId dateOfBirth nationalityId passportNumber passportExpiry emiratesIdNumber emiratesIdExpiry visaNumber visaExpiry sponsoredBy active');
  PERFORM erp_private.mobile_hr_v5_values(changes,'{"nameEn":"160","nameAr":"160","relationshipId":"id","dateOfBirth":"date?","nationalityId":"id?","passportNumber":"100?","passportExpiry":"date?","emiratesIdNumber":"100?","emiratesIdExpiry":"date?","visaNumber":"100?","visaExpiry":"date?","sponsoredBy":"=employee|company","active":"bool"}');
  IF changes='{}' OR (src='null' AND NOT(changes ?& ARRAY['nameEn','relationshipId'])) OR (changes->>'dateOfBirth')::date>(now() AT TIME ZONE 'Asia/Dubai')::date
   OR (changes?'relationshipId' AND NOT EXISTS(SELECT FROM public.hr_relationship_types WHERE id=(changes->>'relationshipId')::bigint AND is_active AND deleted_at IS NULL))
   OR (changes->>'nationalityId' IS NOT NULL AND NOT EXISTS(SELECT FROM public.countries WHERE id=(changes->>'nationalityId')::bigint AND is_active)) THEN
   RAISE EXCEPTION 'Invalid dependent change' USING ERRCODE='22023'; END IF;
 END IF;
END $$;

-- Validation acquires subject, source and all evidence locks. This separate statement
-- obtains a fresh READ COMMITTED snapshot after any wait, before the write.
CREATE FUNCTION erp_private.mobile_hr_v5_locked_authority(r erp_private.hr_self_service_requests,right_name text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (erp_private.mobile_hr_v5_rights(r)->>right_name)::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Original evidence or authority changed' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_v5_locked_authority(erp_private.hr_self_service_requests,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_hr_v5_lock_actor() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();
BEGIN
 PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id WHERE s.user_id=auth.uid() AND s.id::text=auth.jwt()->>'session_id' FOR SHARE OF s,u;
 PERFORM 1 FROM public.user_profiles WHERE id=actor FOR SHARE;
 PERFORM 1 FROM public.erp_user_employee_links WHERE user_profile_id=actor FOR SHARE;
 PERFORM 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
  WHERE ur.user_profile_id=actor AND ur.is_active AND r.is_active AND p.is_active ORDER BY ur.id,rp.permission_id FOR SHARE OF ur,r,rp,p;
 PERFORM erp_private.mobile_hr_v5_active();
END $$;

-- Creation can legitimately add the new dependent link to the admitted evidence.
-- Only its unique matching canonical save may establish this new source identity.
CREATE FUNCTION erp_private.mobile_hr_v5_evidence_source(r erp_private.hr_self_service_requests) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE updated_source jsonb;
BEGIN
 IF r.kind='dependent-change' AND r.proposal->'source'='null' AND r.proposal->>'evidence' IS NOT NULL THEN
  SELECT jsonb_build_object('kind','dependent','id',d.id,'revision',f.revision::text) INTO updated_source
  FROM erp_private.mobile_hr_verified_proofs f JOIN public.employee_dependents d ON d.id=f.record_id AND d.employee_id=r.employee_id AND d.deleted_at IS NULL AND d.workspace_revision=f.revision
  WHERE f.request_id=r.id AND f.kind='dependent' AND f.original_revision IS NULL AND f.source_hash=encode(sha256(convert_to(r.proposal::text,'UTF8')),'hex')
    AND EXISTS(SELECT FROM public.dms_document_links l WHERE l.document_id=(r.proposal#>>'{evidence,documentId}')::bigint AND l.entity_type='employee_dependent' AND l.entity_id=d.id AND l.deleted_at IS NULL)
  ORDER BY f.id LIMIT 1;
 END IF;
 RETURN updated_source;
END $$;

CREATE FUNCTION erp_private.mobile_hr_v5_rights(r erp_private.hr_self_service_requests) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH rights AS(SELECT
   EXISTS(SELECT FROM public.employees e WHERE e.id=r.employee_id AND e.owner_company_id=r.company_id AND e.branch_id IS NOT DISTINCT FROM r.branch_id AND e.deleted_at IS NULL)
     AND erp_private.mobile_hr_v5_domain(r.employee_id,r.kind,r.proposal) AS domain,
   r.requester=auth.uid() AND erp_private.mobile_hr_self(r.employee_id) AND erp_private.employee_permission(r.employee_id,'hr.requests.submit') AS own,
   r.requester<>auth.uid() AND erp_private.mobile_hr_v5_domain(r.employee_id,r.kind,r.proposal,true) AS officer,
   erp_private.employee_permission(r.employee_id,'hr.actions.view') AND EXISTS(SELECT FROM public.employees e WHERE e.id=r.employee_id AND e.reporting_manager_id<>e.id AND erp_private.mobile_hr_self(e.reporting_manager_id)) AS team,
   (r.proposal->>'evidence' IS NULL OR (r.mobile_evidence_proof IS NOT NULL AND r.mobile_evidence_proof IS NOT DISTINCT FROM erp_private.mobile_hr_v5_evidence_facts(r.employee_id,r.proposal||jsonb_build_object('source',coalesce(erp_private.mobile_hr_v5_evidence_source(r),r.proposal->'source'))))) AS evidence)
 SELECT jsonb_build_object('own',domain AND own,'officer',domain AND officer,'team',domain AND team,'full',domain AND evidence AND (officer OR own),
 'decide',domain AND evidence AND officer AND r.status='pending','fulfil',domain AND evidence AND officer AND r.status='approved') FROM rights
$$;

CREATE FUNCTION erp_private.mobile_hr_v5_summary(r erp_private.hr_self_service_requests,a jsonb,opening boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE full_access boolean:=(a->>'full')::boolean; attempt erp_private.mobile_hr_service_attempts; j jsonb;
BEGIN
 SELECT * INTO attempt FROM erp_private.mobile_hr_service_attempts WHERE no_effect_at IS NULL AND request_id=r.id;
 j:=jsonb_build_object('id',r.id,'employeeId',r.employee_id,'employeeLabel',(SELECT full_name_en FROM public.employees WHERE id=r.employee_id AND public.current_user_can_view_employee(id)),
 'revision',r.revision::text,'kind',CASE WHEN full_access THEN r.kind END,'title',CASE WHEN full_access THEN initcap(replace(r.kind,'-',' ')) ELSE 'Employee service' END,'createdAt',r.created_at,
 'review',CASE r.status WHEN 'fulfilled' THEN 'approved' WHEN 'recorded' THEN 'not-required' ELSE r.status END,
 'fulfilment',CASE WHEN r.status='fulfilled' THEN 'fulfilled' WHEN r.status IN('recorded','rejected') THEN 'not-applicable' WHEN attempt.request_id IS NOT NULL THEN 'pending' ELSE 'not-started' END,
 'canRead',full_access,'canDecide',a->'decide','canFulfil',coalesce((a->>'fulfil')::boolean AND (attempt.request_id IS NULL OR attempt.actor=auth.uid()),false));
 IF opening THEN
  j:=j||jsonb_build_object('visibility',CASE WHEN full_access THEN 'full' ELSE 'summary' END,'proposal',CASE WHEN full_access THEN r.proposal END,
   'decidedAt',CASE WHEN full_access THEN r.decided_at END,'decisionReason',CASE WHEN full_access THEN r.decision_reason END,
   'fulfilledAt',CASE WHEN full_access THEN attempt.fulfilled_at END,
   'result',CASE WHEN full_access AND attempt.canonical IS NOT NULL THEN jsonb_build_object('canonical',attempt.canonical,'at',attempt.fulfilled_at,'actorLabel',NULL) END,'fields',CASE WHEN full_access AND (a->>'officer')::boolean AND r.status='approved' AND r.kind IN('issue-replacement','accommodation-issue')
     THEN jsonb_build_array(jsonb_build_object('key','canonical_reference','label','Controlled ERP reference','value','[HR service '||r.id||']')) ELSE '[]'::jsonb END);
 END IF;
 RETURN j;
END $$;
CREATE FUNCTION erp_private.mobile_hr_v5_options(d jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE eid bigint:=(d->>'employeeId')::bigint; k text:=d->>'kind'; mode text:=d->>'op'; domain text; needle text:=d->>'search';
 cursor_id bigint:=(d->>'after')::bigint; src jsonb:=d->'source'; r jsonb; expected text; results jsonb;
BEGIN
 IF erp_private.mobile_hr_self(eid) IS NOT TRUE OR erp_private.employee_permission(eid,'hr.requests.submit') IS NOT TRUE THEN RAISE EXCEPTION 'Current linked employee required' USING ERRCODE='42501'; END IF;
 domain:=CASE WHEN mode='serviceChoices' THEN CASE k WHEN 'relationship' THEN 'dependent-change' WHEN 'nationality' THEN 'dependent-change' WHEN 'shift' THEN 'shift-change' WHEN 'shift-assignment' THEN 'shift-change' WHEN 'letter' THEN 'letter' END ELSE k END;
 IF mode='serviceOptions' THEN
  RETURN jsonb_build_object('employeeId',eid,'employeeRevision',(SELECT workspace_revision::text FROM public.employees WHERE id=eid),'kind',k,'canSubmit',erp_private.mobile_hr_v5_domain(eid,k,'{}'),
   'evidenceAllowed',erp_private.mobile_hr_v5_domain(eid,k,'{}') AND k<>'shift-change' AND erp_private.employee_permission(eid,'dms.documents.view') AND erp_private.employee_permission(eid,'dms.documents.preview'),
   'requiresSource',k IN('issue-return','issue-replacement','task-evidence','pro-follow-up','clearance-evidence'));
 END IF;
 IF cursor_id IS NULL OR cursor_id<0 OR needle IS NULL OR length(needle)>100 THEN RAISE EXCEPTION 'Invalid cursor' USING ERRCODE='22023'; END IF;
 IF erp_private.mobile_hr_v5_domain(eid,domain,d) IS NOT TRUE THEN RAISE EXCEPTION 'Service domain required' USING ERRCODE='42501'; END IF;
 IF mode='serviceEvidence' THEN
  IF k='shift-change' OR (k IN ('issue-return','issue-replacement','task-evidence','pro-follow-up','clearance-evidence') AND src->>'kind' IS NULL) THEN RAISE EXCEPTION 'Invalid evidence purpose' USING ERRCODE='22023'; END IF;
  IF src IS NOT NULL AND src<>'null' THEN
   expected:=CASE k WHEN 'task-evidence' THEN 'onboarding-task' WHEN 'pro-follow-up' THEN 'pro-process' WHEN 'clearance-evidence' THEN 'clearance'
    WHEN 'accommodation-issue' THEN 'accommodation' WHEN 'dependent-change' THEN 'dependent' END;
   IF (expected IS NULL AND (k NOT IN ('issue-return','issue-replacement') OR src->>'kind' NOT IN ('asset','ppe'))) OR (expected IS NOT NULL AND src->>'kind' IS DISTINCT FROM expected) THEN RAISE EXCEPTION 'Invalid evidence source' USING ERRCODE='22023'; END IF;
   r:=erp_private.mobile_hr_v5_source(eid,src,false);
   IF r IS NULL OR r->>'workspace_revision' IS DISTINCT FROM src->>'revision' THEN RAISE EXCEPTION 'Evidence source changed' USING ERRCODE='PT409'; END IF;
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM (
   SELECT doc.id,doc.document_no||' â€” '||doc.title label,doc.current_version_id "versionId" FROM public.dms_documents doc
   WHERE doc.id>cursor_id AND strpos(lower(doc.document_no||' '||doc.title),lower(needle))>0
    AND erp_private.mobile_hr_v5_evidence_facts(eid,d||jsonb_build_object('evidence',jsonb_build_object('documentId',doc.id,'documentVersionId',doc.current_version_id))) IS NOT NULL ORDER BY doc.id LIMIT 26)x);
 END IF;
 RETURN (WITH choices AS (
  SELECT id,report_name_en label,jsonb_build_object('code',report_code) extra FROM public.erp_report_registry
   WHERE k='letter' AND lower(module_code)='hr' AND document_class IN('A','B','C','D') AND is_active AND deleted_at IS NULL
  UNION ALL SELECT id,shift_name,jsonb_build_object('calendarId',calendar_id) FROM public.work_shifts WHERE k='shift' AND is_active AND deleted_at IS NULL
   AND (calendar_id IS NULL OR EXISTS(SELECT FROM public.work_calendars c JOIN public.employees e ON e.id=eid WHERE c.id=calendar_id AND c.is_active AND c.deleted_at IS NULL
     AND (c.owner_company_id IS NULL OR c.owner_company_id=e.owner_company_id)))
  UNION ALL SELECT a.id,coalesce(w.shift_name,'Shift assignment')||' / '||a.effective_from,jsonb_build_object('source',jsonb_build_object('kind','shift-assignment','id',a.id,'revision',a.workspace_revision::text)) FROM public.employee_shift_assignments a LEFT JOIN public.work_shifts w ON w.id=a.work_shift_id WHERE k='shift-assignment' AND a.employee_id=eid AND a.deleted_at IS NULL
  UNION ALL SELECT id,name_en,'{}'::jsonb FROM public.hr_relationship_types WHERE k='relationship' AND is_active AND deleted_at IS NULL
  UNION ALL SELECT id,coalesce(nationality_en,name_en),'{}'::jsonb FROM public.countries WHERE k='nationality' AND is_active)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.label)||x.extra ORDER BY x.id),'[]') FROM
   (SELECT * FROM choices WHERE id>cursor_id AND strpos(lower(label),lower(needle))>0 ORDER BY id LIMIT 26)x);
END $$;

CREATE FUNCTION erp_private.mobile_hr_v5_service(d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE mode text:=d->>'op'; eid bigint:=(d->>'employeeId')::bigint; target bigint:=(d->>'id')::bigint; op uuid:=(d->>'operationId')::uuid;
 r erp_private.hr_self_service_requests; rec erp_private.hr_self_operation_receipts; e public.employees;
 a jsonb; p jsonb; k text; h text:=encode(sha256(convert_to(d::text,'UTF8')),'hex'); effect text; result jsonb;
 original bigint:=(d->>'revision')::bigint; attempt erp_private.mobile_hr_service_attempts; lock_actor boolean:=op IS NOT NULL;
 duplicate_ack boolean:=false; legacy text[]:=ARRAY['profile-correction','attendance-correction','compliance-renewal']; scope text:=d->>'scope'; filter text:=d->>'status';
BEGIN
 PERFORM erp_private.mobile_hr_v5_active();
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>32768 THEN RAISE EXCEPTION 'Invalid service command' USING ERRCODE='22023'; END IF;
 CASE mode
 WHEN 'serviceSubmit' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId operationId proposal');
 WHEN 'issueAcknowledge' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId operationId source statementVersion confirmed');
 WHEN 'serviceDecision' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId id revision operationId decision reason');
 WHEN 'serviceReceipt' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op operationId');
 WHEN 'serviceOpening','serviceAttempt' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId id revision');
 WHEN 'serviceRequests' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId scope after status');
 WHEN 'serviceOptions' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId kind');
 WHEN 'serviceChoices' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId kind search after');
 WHEN 'serviceEvidence' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId kind source search after');
 WHEN 'serviceActionChoices' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId id revision kind search after');
 WHEN 'serviceFulfil' THEN PERFORM erp_private.mobile_hr_v5_keys(d,'op employeeId id revision operationId command');
 ELSE RAISE EXCEPTION 'Unknown service command' USING ERRCODE='22023'; END CASE;
 PERFORM erp_private.mobile_hr_v5_values(d,'{"revision":"revision","operationId":"uuid","id":"id","decision":"=approve|reject","reason":"*500","search":"*100"}');
 IF d?'employeeId' AND (mode<>'serviceRequests' OR d->>'employeeId' IS NOT NULL) THEN PERFORM erp_private.mobile_hr_v5_values(d,'{"employeeId":"id"}'); END IF;
 IF mode IN ('serviceOptions','serviceChoices','serviceEvidence') THEN RETURN erp_private.mobile_hr_v5_options(d); END IF;
 IF mode='serviceRequests' THEN
  IF scope IS NULL OR scope NOT IN ('own','review','team') OR filter IS NULL OR filter NOT IN ('all','pending','approved','rejected','fulfilled','recorded')
   OR (d->>'after')::bigint<0 OR d->>'after' IS NULL THEN RAISE EXCEPTION 'Invalid request page' USING ERRCODE='22023'; END IF;
  IF scope='own' AND (erp_private.mobile_hr_self(eid) AND erp_private.employee_permission(eid,'hr.requests.submit')) IS NOT TRUE THEN RAISE EXCEPTION 'Exact own link required' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]') FROM (
   SELECT s.id,erp_private.mobile_hr_v5_summary(s,authz.rights,false) item FROM erp_private.hr_self_service_requests s
   CROSS JOIN LATERAL (SELECT erp_private.mobile_hr_v5_rights(s) rights) authz
   WHERE s.kind<>ALL(legacy) AND s.id>(d->>'after')::bigint AND (eid IS NULL OR s.employee_id=eid) AND (filter='all' OR s.status=filter OR (filter='approved' AND s.status='fulfilled'))
    AND (authz.rights->>CASE scope WHEN 'review' THEN 'officer' ELSE scope END)::boolean ORDER BY s.id LIMIT 26)x);
 END IF;
 IF lock_actor THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||op::text,0));
  PERFORM erp_private.mobile_hr_v5_lock_actor();
  IF mode<>'serviceReceipt' THEN PERFORM erp_private.mobile_hr_bind('v5.'||mode,op,h); END IF;
  IF EXISTS(SELECT FROM erp_private.mobile_hr_service_attempts t WHERE t.actor=auth.uid() AND t.operation_id=op AND t.no_effect_at IS NOT NULL) THEN RAISE EXCEPTION 'Original issuance definitively closed without effect' USING ERRCODE='22023'; END IF;
  SELECT * INTO rec FROM erp_private.hr_self_operation_receipts WHERE actor=auth.uid() AND operation_id=op;
  IF rec.actor IS NOT NULL THEN
   IF rec.action NOT LIKE 'v5.%' OR (mode<>'serviceReceipt' AND rec.request_hash<>h) THEN RAISE EXCEPTION 'Operation already bound' USING ERRCODE='PT409'; END IF;
   eid:=(rec.result->>'employeeId')::bigint; target:=(rec.result->>'id')::bigint;
  ELSIF mode='serviceReceipt' THEN RETURN NULL; END IF;
  SELECT * INTO e FROM public.employees WHERE id=eid AND deleted_at IS NULL FOR UPDATE;
  PERFORM erp_private.mobile_hr_v5_active();
 ELSE SELECT * INTO e FROM public.employees WHERE id=eid AND deleted_at IS NULL; END IF;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501'; END IF;
 IF target IS NOT NULL THEN
  SELECT * INTO r FROM erp_private.hr_self_service_requests s WHERE s.id=target AND s.employee_id=eid AND s.kind<>ALL(legacy) AND s.company_id=e.owner_company_id AND s.branch_id IS NOT DISTINCT FROM e.branch_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501'; END IF;
  a:=erp_private.mobile_hr_v5_rights(r);
  IF (a->>'own')::boolean IS NOT TRUE AND (a->>'team')::boolean IS NOT TRUE AND (a->>'officer')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501'; END IF;
  IF rec.actor IS NOT NULL THEN
   IF ((CASE rec.action WHEN 'v5.serviceSubmit' THEN a->>'own' WHEN 'v5.issueAcknowledge' THEN a->>'own' ELSE a->>'officer' END)::boolean AND (a->>'full')::boolean) IS NOT TRUE THEN RAISE EXCEPTION 'Current receipt authority required' USING ERRCODE='42501'; END IF;
   RETURN rec.result||'{"replayed":true}';
  END IF;
  IF original IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'Request changed' USING ERRCODE='PT409'; END IF;
  IF mode='serviceOpening' THEN RETURN erp_private.mobile_hr_v5_summary(r,a,true); END IF;
  IF (a->>'officer')::boolean IS NOT TRUE OR (a->>'full')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Independent officer authority required' USING ERRCODE='42501'; END IF;
  IF mode='serviceAttempt' THEN
    SELECT * INTO attempt FROM erp_private.mobile_hr_service_attempts WHERE no_effect_at IS NULL AND request_id=r.id AND actor=auth.uid();
    RETURN jsonb_build_object('id',r.id,'employeeId',eid,'revision',r.revision::text,'attempt',CASE WHEN attempt.request_id IS NOT NULL THEN jsonb_build_object('operationId',attempt.operation_id,'command',attempt.command,'state',CASE WHEN attempt.canonical IS NULL THEN 'pending' ELSE 'fulfilled' END) END);
  END IF;
  IF mode='serviceActionChoices' THEN RETURN erp_private.mobile_hr_v5_action_choices(r,d); END IF;
  IF mode='serviceFulfil' THEN RETURN erp_private.mobile_hr_v5_reserve(r,d,h); END IF;
  IF mode<>'serviceDecision' OR (a->>'decide')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Independent pending decision required' USING ERRCODE='42501'; END IF;
  PERFORM erp_private.mobile_hr_v5_validate(eid,r.proposal);
  PERFORM erp_private.mobile_hr_v5_locked_authority(r,'decide');
  effect:=CASE WHEN d->>'decision'='approve' THEN 'approved' ELSE 'rejected' END;
  IF effect='rejected' AND length(d->>'reason')=0 THEN RAISE EXCEPTION 'Rejection reason required' USING ERRCODE='22023'; END IF;
  UPDATE erp_private.hr_self_service_requests SET status=effect,revision=revision+1,decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason=d->>'reason' WHERE id=r.id RETURNING * INTO r;
 ELSE
  IF mode NOT IN ('serviceSubmit','issueAcknowledge') OR erp_private.mobile_hr_self(eid) IS NOT TRUE OR erp_private.employee_permission(eid,'hr.requests.submit') IS NOT TRUE THEN RAISE EXCEPTION 'Current own subject required' USING ERRCODE='42501'; END IF;
  p:=CASE WHEN mode='serviceSubmit' THEN d->'proposal' ELSE (d-'op'-'operationId'-'employeeId')||'{"kind":"issue-acknowledgement"}' END;
  k:=p->>'kind';
  IF (mode='issueAcknowledge') IS DISTINCT FROM (k='issue-acknowledgement') OR erp_private.mobile_hr_v5_domain(eid,k,p) IS NOT TRUE THEN RAISE EXCEPTION 'Current service authority required' USING ERRCODE='42501'; END IF;
  PERFORM erp_private.mobile_hr_v5_validate(eid,p);
  IF mode='issueAcknowledge' THEN SELECT * INTO r FROM erp_private.hr_self_service_requests s WHERE s.employee_id=eid AND s.kind=k AND s.proposal=p; END IF;
  IF r.id IS NULL THEN
   INSERT INTO erp_private.hr_self_service_requests(employee_id,company_id,branch_id,requester,kind,proposal,mobile_evidence_proof,status)
    VALUES(eid,e.owner_company_id,e.branch_id,auth.uid(),k,p,erp_private.mobile_hr_v5_evidence_facts(eid,p),CASE WHEN mode='issueAcknowledge' THEN 'recorded' ELSE 'pending' END) RETURNING * INTO r;
  ELSIF r.requester IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Attestation already recorded' USING ERRCODE='PT409'; ELSE duplicate_ack:=true; END IF;
  effect:=CASE WHEN mode='issueAcknowledge' THEN 'acknowledged' ELSE 'submitted' END;
 END IF;
 result:=jsonb_build_object('effect',effect,'employeeId',eid,'id',r.id,'revision',r.revision::text,'operationId',op,'replayed',duplicate_ack,'canonical',NULL);
 INSERT INTO erp_private.hr_self_operation_receipts(actor,operation_id,action,request_hash,result) VALUES(auth.uid(),op,'v5.'||mode,h,result);
 IF NOT duplicate_ack THEN INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 VALUES(public.current_user_profile_id(),e.owner_company_id,'hr','hr_self_service_requests',r.id,r.id::text,CASE WHEN effect IN('approved','rejected') THEN 'update' ELSE 'create' END,jsonb_build_object('event',mode,'effect',effect,'operationId',op)); END IF;
 RETURN result;
END $$;
-- Narrow evidence of a controlled ERP mutation. Keep only identifiers, revisions and
-- hashes. Source employee, custody and dependent data remain in their original tables.
CREATE TABLE erp_private.mobile_hr_verified_proofs(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,request_id bigint NOT NULL REFERENCES erp_private.hr_self_service_requests,
 actor uuid NOT NULL,operation_id uuid NOT NULL,kind text NOT NULL,record_id bigint NOT NULL,revision bigint NOT NULL,
 original_revision bigint,source_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor,operation_id,request_id)
);
ALTER TABLE erp_private.mobile_hr_verified_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_hr_verified_proofs FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX mobile_hr_verified_proof_request ON erp_private.mobile_hr_verified_proofs(request_id,actor,id);
-- Preserve the canonical normalized input and link deltas until its existing receipt
-- trigger completes. The signed receipt hash verifies this transaction-local data.
DO $$ DECLARE original text; definition text; BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid='public.f11_save_dependent(uuid,bigint,bigint,bigint,text,jsonb,bigint[],bigint[])'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'893ea6a2c1021a4d113e46b1c109eefb5b68d7f5f5fa6d16857eafc64dc0dd96' THEN RAISE EXCEPTION 'Unreviewed dependent predecessor'; END IF;
 EXECUTE replace(definition,'''hash'',digest)::text,true);','''hash'',digest,''data'',p_data,''add'',p_add,''remove'',p_remove)::text,true);');
END $$;
CREATE FUNCTION erp_private.mobile_hr_v5_capture_proof() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x jsonb:=to_jsonb(NEW); oldrow jsonb; r erp_private.hr_self_service_requests; changes jsonb; verified boolean; proof uuid; child erp_private.f11_child_receipts;
 dep erp_private.f11_dependent_receipts; dep_input jsonb; doc_id bigint; before_revision bigint; candidate_count integer:=0; match_id bigint; proposed jsonb; source_kind text; request_kind text;
 mapping jsonb:='{"nameEn":"dependent_name_en","nameAr":"dependent_name_ar","relationshipId":"relationship_type_id","dateOfBirth":"date_of_birth","nationalityId":"nationality_id","passportNumber":"passport_number","passportExpiry":"passport_expiry","emiratesIdNumber":"emirates_id_number","emiratesIdExpiry":"emirates_id_expiry","visaNumber":"residence_visa_number","visaExpiry":"residence_visa_expiry","sponsoredBy":"sponsored_by","active":"is_active"}';
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN oldrow:=to_jsonb(OLD);before_revision:=OLD.workspace_revision; END IF;
 source_kind:=CASE TG_TABLE_NAME WHEN 'employee_dependents' THEN 'dependent' WHEN 'employee_assets' THEN 'asset' WHEN 'employee_ppe_issues' THEN 'ppe' WHEN 'employee_accommodation_records' THEN 'accommodation' WHEN 'employee_hr_actions' THEN 'hr-action' END;
 IF source_kind='dependent' THEN
  dep_input:=nullif(current_setting('erp.f11_dependent_save',true),'')::jsonb; proof:=(dep_input->>'operation_id')::uuid;
  SELECT * INTO dep FROM erp_private.f11_dependent_receipts WHERE actor=auth.uid() AND operation_id=proof AND employee_id=NEW.employee_id AND record_id=NEW.id AND revision=NEW.workspace_revision AND kind='save';
  IF dep.actor IS NULL THEN RETURN NEW; END IF;
  request_kind:='dependent-change';
 ELSE
  proof:=(nullif(current_setting('erp.f11_child_save',true),'')::jsonb->>'operation_id')::uuid;
  SELECT * INTO child FROM erp_private.f11_child_receipts WHERE actor=auth.uid() AND operation_id=proof AND employee_id=NEW.employee_id AND record_id=NEW.id AND revision=NEW.workspace_revision AND kind=source_kind;
  IF child.actor IS NULL THEN RETURN NEW; END IF;
  request_kind:=CASE WHEN source_kind IN('asset','ppe') THEN 'issue-replacement' ELSE 'accommodation-issue' END;
 END IF;
 FOR r IN SELECT * FROM erp_private.hr_self_service_requests s WHERE s.employee_id=NEW.employee_id AND s.status='approved' AND s.kind=request_kind AND requester<>auth.uid() LOOP
  IF (erp_private.mobile_hr_v5_rights(r)->>'fulfil')::boolean IS NOT TRUE THEN CONTINUE; END IF;
  IF source_kind='dependent' THEN
   SELECT jsonb_object_agg(mapping->>key,value) INTO changes FROM jsonb_each(r.proposal->'changes');
   doc_id:=(r.proposal#>>'{evidence,documentId}')::bigint;
   verified:=dep.request_hash=encode(sha256(convert_to(jsonb_build_array('f11_dependent',NEW.employee_id,(r.proposal#>>'{source,id}')::bigint,before_revision,'save',dep_input->'data',dep_input->'add',dep_input->'remove')::text,'UTF8')),'hex')
    AND dep_input->'remove'='[]' AND (dep_input->'add'='[]' OR (doc_id IS NOT NULL AND dep_input->'add'=jsonb_build_array(doc_id)))
    -- A later DMS link cannot retrospectively prove a create carried evidence.
    -- An existing dependent may already have the admitted link before its F11 save.
    AND (doc_id IS NULL OR dep_input->'add'=jsonb_build_array(doc_id) OR dep_input#>'{data,dms_document_id}'=to_jsonb(doc_id)
      OR (TG_OP='UPDATE' AND EXISTS(SELECT FROM public.dms_document_links l WHERE l.document_id=doc_id AND l.entity_type='employee_dependent'
        AND l.entity_id=NEW.id AND l.deleted_at IS NULL)))

    AND dep_input->'data' @> changes AND NOT EXISTS(SELECT FROM jsonb_each(dep_input->'data') input
     WHERE NOT (changes?input.key OR input.value IS NOT DISTINCT FROM coalesce(oldrow->input.key,CASE input.key WHEN 'is_active' THEN 'true'::jsonb ELSE 'null'::jsonb END)
       OR (input.key='dms_document_id' AND doc_id IS NOT NULL AND input.value=to_jsonb(doc_id))))
    AND x @> changes AND ((TG_OP='INSERT' AND r.proposal->'source'='null') OR
    (TG_OP='UPDATE' AND (r.proposal#>>'{source,id}')::bigint=NEW.id AND (r.proposal#>>'{source,revision}')::bigint=before_revision
     AND x-ARRAY['workspace_revision','updated_by','updated_at']-ARRAY(SELECT jsonb_object_keys(changes))=
       oldrow-ARRAY['workspace_revision','updated_by','updated_at']-ARRAY(SELECT jsonb_object_keys(changes))));
  ELSIF source_kind IN ('asset','ppe') THEN
   -- A replacement must explicitly identify the approved service in the issue note.
   verified:=child.action='create' AND source_kind=r.proposal#>>'{source,kind}' AND NEW.id<>(r.proposal#>>'{source,id}')::bigint
    AND strpos(coalesce(x->>'notes',''),'[HR service '||r.id||']')>0 AND x->>'status'='issued';
  ELSIF source_kind='hr-action' THEN
   verified:=(((x->>'related_record_type'='hr_self_service_request' AND (x->>'related_record_id')=r.id::text)
    OR strpos(coalesce(x->>'action_title',''),'[HR service '||r.id||']')>0) AND x->>'action_status'='closed' AND child.action='close' AND (r.proposal->>'source' IS NULL OR erp_private.mobile_hr_v5_source(r.employee_id,r.proposal->'source',true)->>'workspace_revision'=r.proposal#>>'{source,revision}'));
  ELSE
   verified:=child.action IN('update','end') AND (r.proposal#>>'{source,id}')::bigint=NEW.id AND (r.proposal#>>'{source,revision}')::bigint=before_revision
   AND strpos(coalesce(x->>'notes',''),'[HR service '||r.id||']')>0
   AND EXISTS(SELECT FROM unnest(ARRAY['accommodation_type','accommodation_location','room_or_bed_no','assigned_from','assigned_to','status']) material(k)
     WHERE x->material.k IS DISTINCT FROM oldrow->material.k);
  END IF;
  IF verified IS TRUE THEN candidate_count:=candidate_count+1;match_id:=r.id;proposed:=r.proposal; END IF;
 END LOOP;
 IF candidate_count=1 THEN
  INSERT INTO erp_private.mobile_hr_verified_proofs(request_id,actor,operation_id,kind,record_id,revision,original_revision,source_hash)
   VALUES(match_id,auth.uid(),proof,source_kind,NEW.id,NEW.workspace_revision,before_revision,encode(sha256(convert_to(proposed::text,'UTF8')),'hex'));
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['employee_dependents','employee_assets','employee_ppe_issues','employee_accommodation_records','employee_hr_actions'] LOOP
 EXECUTE format('CREATE TRIGGER zzzz_mobile_hr_v5_proof AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_private.mobile_hr_v5_capture_proof()',tbl);
 END LOOP;
END $$;

CREATE FUNCTION erp_private.mobile_hr_v5_current_proof(r erp_private.hr_self_service_requests,f erp_private.mobile_hr_verified_proofs) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE current_rev bigint; old_item jsonb; issue jsonb; tbl text;
BEGIN
 IF f.actor IS DISTINCT FROM auth.uid() OR f.request_id IS DISTINCT FROM r.id OR f.source_hash<>encode(sha256(convert_to(r.proposal::text,'UTF8')),'hex') THEN RETURN false; END IF;
 tbl:=CASE f.kind WHEN 'asset' THEN 'employee_assets' WHEN 'ppe' THEN 'employee_ppe_issues' WHEN 'dependent' THEN 'employee_dependents'
   WHEN 'hr-action' THEN 'employee_hr_actions' WHEN 'accommodation' THEN 'employee_accommodation_records' END;
 EXECUTE format('SELECT workspace_revision,to_jsonb(x) FROM public.%I x WHERE id=$1 AND employee_id=$2 AND deleted_at IS NULL',tbl)
 INTO current_rev,issue USING f.record_id,r.employee_id;
 IF current_rev IS DISTINCT FROM f.revision THEN RETURN false; END IF;
 IF f.kind='hr-action' AND r.proposal->>'source' IS NOT NULL AND (erp_private.mobile_hr_v5_source(r.employee_id,r.proposal->'source',false)->>'workspace_revision') IS DISTINCT FROM r.proposal#>>'{source,revision}' THEN RETURN false; END IF;
 IF f.kind='dependent' AND r.proposal->>'evidence' IS NOT NULL AND NOT EXISTS(SELECT FROM public.dms_document_links l WHERE l.entity_type='employee_dependent'
  AND l.entity_id=f.record_id AND l.document_id=(r.proposal#>>'{evidence,documentId}')::bigint AND l.deleted_at IS NULL) THEN RETURN false; END IF;
 IF f.kind IN('ppe','asset') THEN
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE id=$1 AND employee_id=$2 AND deleted_at IS NULL',tbl) INTO old_item USING (r.proposal#>>'{source,id}')::bigint,r.employee_id;
  RETURN old_item->>'status'='returned' AND old_item->>CASE WHEN f.kind='asset' THEN 'asset_type' ELSE 'ppe_item' END=issue->>CASE WHEN f.kind='asset' THEN 'asset_type' ELSE 'ppe_item' END
   AND (old_item->>'workspace_revision')::bigint=(r.proposal#>>'{source,revision}')::bigint+1 AND EXISTS(SELECT FROM erp_private.f11_child_receipts c WHERE c.kind=f.kind
    AND c.action='return' AND c.employee_id=r.employee_id AND c.record_id=(old_item->>'id')::bigint AND c.revision=(old_item->>'workspace_revision')::bigint AND c.created_at>=r.decided_at);
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION erp_private.mobile_hr_v5_review_valid(review_id bigint,eid bigint,code text) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v erp_private.hr_letter_source_reviews;
BEGIN
 SELECT * INTO v FROM erp_private.hr_letter_source_reviews x WHERE x.id=review_id AND x.employee_id=eid AND x.code=mobile_hr_v5_review_valid.code AND x.status='approved';
 IF v.id IS NULL OR erp_private.mobile_hr_v5_disclose_evidence(eid,v.document_id) IS NOT TRUE THEN RETURN false; END IF;
 RETURN v.fingerprint IS NOT DISTINCT FROM erp_private.hr_letter_fingerprint(eid,code,v.source_id,v.receiver_id,v.document_id,v.version_id);
EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR check_violation OR SQLSTATE 'PT409' THEN RETURN false;
END $$;
-- Match the effective rendered fields. A request-bound issuance key can bind
-- request-only context for fixed text, but cannot substitute for printed fields.
CREATE FUNCTION erp_private.mobile_hr_v5_particulars(p jsonb,inputs jsonb,request_origin boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE code text:=p->>'outputCode'; lang text:=p->>'language'; v text; rec text; purpose text; suffix text;
BEGIN
 IF code NOT IN('HR_EMPLOYMENT_CONFIRMATION','HR_NOC','HR_EMBASSY_LETTER','HR_SALARY_CERT_WITH_AMOUNT') THEN RETURN request_origin; END IF;
 FOR v IN SELECT unnest(CASE lang WHEN 'bilingual' THEN ARRAY['en','ar'] ELSE ARRAY[lang] END) LOOP
  suffix:=CASE v WHEN 'ar' THEN '_ar' ELSE '' END;
  rec:=CASE WHEN code='HR_EMPLOYMENT_CONFIRMATION' THEN concat_ws(' — ',nullif(btrim(inputs->>('recipient_organization_'||v)),''),nullif(btrim(inputs->>('recipient_department_'||v)),''))
    ELSE inputs->>('addressee'||suffix) END;
  IF rec IS DISTINCT FROM p->>(CASE v WHEN 'ar' THEN 'recipientAr' ELSE 'recipient' END) THEN RETURN false; END IF;
  IF code<>'HR_EMPLOYMENT_CONFIRMATION' THEN
   purpose:=inputs->>('purpose'||suffix);
   IF purpose IS DISTINCT FROM p->>(CASE v WHEN 'ar' THEN 'purposeAr' ELSE 'purpose' END) THEN RETURN false; END IF;
  END IF;
 END LOOP;
 IF code='HR_EMPLOYMENT_CONFIRMATION' THEN RETURN request_origin AND inputs->>'recipient_mode'='specific'; END IF;
 IF code='HR_NOC' THEN RETURN inputs->>'valid_until'=p->>'validUntil' AND coalesce(inputs->>'approved_conditions_en','')='' AND coalesce(inputs->>'approved_conditions_ar','')=''; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_v5_particulars(jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_hr_v5_output_matches(r erp_private.hr_self_service_requests,o public.erp_generated_pdf_documents) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(r.kind='letter' AND o.source_record_type='employee' AND o.source_record_id=r.employee_id AND o.output_code=r.proposal->>'outputCode'
  AND o.data_snapshot_json->>'language'=r.proposal->>'language' AND public.f03_has_generated_pdf_permission(o.id,'download')
  AND (o.output_code NOT IN ('HR_EXPERIENCE_LETTER','HR_WARNING_LETTER','HR_PPE_ISSUE_FORM','HR_HANDOVER_FORM') OR
    erp_private.mobile_hr_v5_review_valid((o.data_snapshot_json#>>'{inputs,source_review_id}')::bigint,r.employee_id,o.output_code))
  AND erp_private.mobile_hr_v5_particulars(r.proposal,o.data_snapshot_json->'inputs',
    EXISTS(SELECT FROM erp_private.mobile_hr_service_attempts a WHERE a.request_id=r.id AND a.no_effect_at IS NULL AND a.issuance_key=o.request_key)),false)
$$;
CREATE FUNCTION erp_private.mobile_hr_v5_action_choices(r erp_private.hr_self_service_requests,d jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE typ text:=d->>'kind'; cursor_id bigint:=(d->>'after')::bigint; needle text:=lower(d->>'search');
BEGIN
 IF r.status<>'approved' OR cursor_id IS NULL OR cursor_id<0 OR needle IS NULL OR length(needle)>100 THEN RAISE EXCEPTION 'Invalid approved request opening' USING ERRCODE='22023'; END IF;
 RETURN (WITH choices AS (
  SELECT f.id,initcap(f.kind)||' #'||f.record_id label,jsonb_build_object('canonical',jsonb_build_object('kind',f.kind,'id',f.record_id,'revision',f.revision::text,'operationId',f.operation_id,'issuanceId',NULL),
   'source',CASE WHEN f.kind<>'hr-action' THEN jsonb_build_object('kind',f.kind,'id',f.record_id,'revision',f.revision::text) END) extra
  FROM erp_private.mobile_hr_verified_proofs f WHERE typ='canonical-proof' AND f.request_id=r.id AND f.actor=auth.uid() AND erp_private.mobile_hr_v5_current_proof(r,f)
  UNION ALL SELECT o.id,o.file_name,jsonb_build_object('issuanceId',o.id,'checksum',CASE WHEN o.lifecycle_state='issued' THEN o.checksum END) FROM public.erp_generated_pdf_documents o
   WHERE typ='issuance' AND r.kind='letter' AND o.source_record_id=r.employee_id AND o.source_record_type='employee' AND o.output_code=r.proposal->>'outputCode'
   AND NOT EXISTS(SELECT FROM erp_private.mobile_hr_service_attempts used WHERE used.request_id<>r.id AND used.no_effect_at IS NULL
    AND (used.reserved_output_id=o.id OR used.issuance_key=o.request_key))
   AND erp_private.mobile_hr_v5_output_matches(r,o) AND o.archived_at IS NULL AND o.revoked_at IS NULL AND o.superseded_by_id IS NULL AND (o.expires_at IS NULL OR o.expires_at>now())
   AND (o.lifecycle_state='issued' OR (o.generated_by=public.current_user_profile_id() AND o.lifecycle_state IN('rendering','uploaded','pending','failed_retryable','reconciliation_required')))
  UNION ALL SELECT v.id,'Approved source review #'||v.id,jsonb_build_object('sourceReviewId',v.id,'sourceId',v.source_id)
   FROM erp_private.hr_letter_source_reviews v WHERE typ='letter-source' AND r.kind='letter' AND v.employee_id=r.employee_id AND v.code=r.proposal->>'outputCode' AND v.status='approved' AND erp_private.mobile_hr_v5_review_valid(v.id,r.employee_id,v.code)
    AND erp_private.document_permission(v.document_id,'dms.documents.view') AND erp_private.document_permission(v.document_id,'dms.documents.preview') AND erp_private.mobile_hr_v5_disclose_evidence(r.employee_id,v.document_id)
  UNION ALL SELECT e.id,'EOS case #'||e.id,jsonb_build_object('sourceId',e.id,'sourceReviewId',NULL) FROM public.employee_eos_cases e WHERE typ='letter-source' AND r.kind='letter' AND r.proposal->>'outputCode'='HR_CLEARANCE_FORM' AND e.employee_id=r.employee_id AND e.deleted_at IS NULL
  UNION ALL SELECT l.id,'Approved leave #'||l.id,jsonb_build_object('sourceId',l.id,'sourceReviewId',NULL) FROM public.employee_leave_requests l WHERE typ='letter-source' AND r.kind='letter' AND r.proposal->>'outputCode'='HR_LEAVE_CONFIRMATION' AND l.employee_id=r.employee_id AND l.approval_status='approved' AND l.deleted_at IS NULL
  UNION ALL SELECT t.id,t.template_name,jsonb_build_object('templateId',t.id) FROM public.erp_report_templates t JOIN public.erp_report_branding_profiles bp ON bp.id=t.branding_profile_id CROSS JOIN public.erp_report_registry reg
   WHERE typ='letter-template' AND r.kind='letter' AND reg.report_code=r.proposal->>'outputCode' AND reg.is_active AND reg.deleted_at IS NULL AND t.is_active AND t.deleted_at IS NULL AND t.governance_status='published'
    AND bp.is_active AND bp.deleted_at IS NULL AND (bp.owner_company_id=r.company_id OR (bp.owner_company_id IS NULL AND (bp.is_group_profile OR bp.is_neutral_profile)))
    AND erp_private.can_read_report_template_branding(t.branding_profile_id) AND erp_private.employee_permission(r.employee_id,'reports.branding.override'))
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind',typ,'label',x.label,'id',x.id)||x.extra ORDER BY x.id),'[]') FROM
   (SELECT * FROM choices WHERE id>cursor_id AND strpos(lower(label),needle)>0 ORDER BY id LIMIT 26)x);
END $$;
ALTER TABLE erp_private.mobile_hr_service_attempts ADD COLUMN plan jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN external_proof_id bigint REFERENCES erp_private.mobile_hr_verified_proofs;

CREATE FUNCTION erp_private.mobile_hr_v5_reserve(r erp_private.hr_self_service_requests,d jsonb,h text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cmd jsonb:=d->'command'; cmd_kind text:=cmd->>'kind'; p jsonb:=r.proposal; src jsonb:=p->'source'; row_data jsonb;
 op uuid:=(d->>'operationId')::uuid; a erp_private.mobile_hr_service_attempts; f erp_private.mobile_hr_verified_proofs;
 plan jsonb:='[]'; kind text; action text; data jsonb; original_id bigint:=(src->>'id')::bigint; original_revision bigint:=(src->>'revision')::bigint;
 step_id uuid:=extensions.uuid_generate_v5(op,'canonical-1'); selection jsonb; long_note text; command_keys text;
BEGIN
 IF r.status<>'approved' OR (erp_private.mobile_hr_v5_rights(r)->>'fulfil')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Approved independent request required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM erp_private.mobile_hr_service_attempts WHERE no_effect_at IS NULL AND request_id=r.id;
 IF FOUND THEN
  IF a.actor IS DISTINCT FROM auth.uid() OR a.operation_id<>op OR a.command_hash<>h THEN RAISE EXCEPTION 'Another attempt owns the original operation' USING ERRCODE='PT409'; END IF;
  PERFORM erp_private.mobile_hr_v5_validate(r.employee_id,p,(cmd_kind NOT IN('save-dependent','record-replacement','resolve-accommodation') OR (cmd_kind='resolve-accommodation' AND cmd#>>'{canonical,kind}'='hr-action')),erp_private.mobile_hr_v5_evidence_source(r));
  PERFORM erp_private.mobile_hr_v5_locked_authority(r,'fulfil');
  RETURN jsonb_build_object('pending',true,'plan',a.plan,'proposal',p,'command',cmd);
 END IF;
 IF NOT coalesce(CASE r.kind WHEN 'letter' THEN cmd_kind IN('issue-letter','link-issued-letter','recover-letter') WHEN 'issue-return' THEN cmd_kind='record-return'
 WHEN 'issue-replacement' THEN cmd_kind='record-replacement' WHEN 'task-evidence' THEN cmd_kind='complete-task' WHEN 'dependent-change' THEN cmd_kind='save-dependent'
 WHEN 'accommodation-issue' THEN cmd_kind='resolve-accommodation' WHEN 'overtime' THEN cmd_kind='create-overtime' WHEN 'shift-change' THEN cmd_kind='change-shift'
 WHEN 'pro-follow-up' THEN cmd_kind='record-pro-follow-up' WHEN 'clearance-evidence' THEN cmd_kind='record-clearance' END,false) THEN RAISE EXCEPTION 'Command mismatches approved service' USING ERRCODE='22023'; END IF;
 command_keys:=CASE cmd_kind WHEN 'issue-letter' THEN ' outputCode language sourceReviewId sourceId templateId' WHEN 'link-issued-letter' THEN ' issuanceId checksum'
 WHEN 'recover-letter' THEN ' issuanceId' WHEN 'record-return' THEN ' source returnedDate condition' WHEN 'record-replacement' THEN ' source newSource canonicalOperationId'
 WHEN 'complete-task' THEN ' source' WHEN 'save-dependent' THEN ' source canonicalOperationId' WHEN 'resolve-accommodation' THEN ' canonical'
 WHEN 'change-shift' THEN ' source' WHEN 'record-pro-follow-up' THEN ' source' WHEN 'record-clearance' THEN ' source caseId' ELSE '' END;
 PERFORM erp_private.mobile_hr_v5_keys(cmd,'kind'||command_keys);
 PERFORM erp_private.mobile_hr_v5_values(cmd,'{"returnedDate":"date","condition":"500?","checksum":"sha","issuanceId":"id","canonicalOperationId":"uuid","caseId":"id","sourceReviewId":"id?","sourceId":"id?","templateId":"id?"}');
 IF cmd?'source' AND cmd->'source' IS DISTINCT FROM src OR cmd?'caseId' AND cmd->'caseId' IS DISTINCT FROM p->'caseId' THEN RAISE EXCEPTION 'Wrong original service source' USING ERRCODE='PT409'; END IF;
 PERFORM erp_private.mobile_hr_v5_validate(r.employee_id,p,(cmd_kind NOT IN('save-dependent','record-replacement','resolve-accommodation') OR (cmd_kind='resolve-accommodation' AND cmd#>>'{canonical,kind}'='hr-action')),erp_private.mobile_hr_v5_evidence_source(r));
  PERFORM erp_private.mobile_hr_v5_locked_authority(r,'fulfil');
 IF cmd_kind IN('save-dependent','record-replacement','resolve-accommodation') THEN
  SELECT * INTO f FROM erp_private.mobile_hr_verified_proofs x WHERE x.request_id=r.id AND x.actor=auth.uid()
    AND x.operation_id=coalesce((cmd->>'canonicalOperationId')::uuid,(cmd#>>'{canonical,operationId}')::uuid) AND erp_private.mobile_hr_v5_current_proof(r,x);
  IF f.id IS NULL OR (cmd_kind='record-replacement' AND cmd->'newSource' IS DISTINCT FROM jsonb_build_object('kind',f.kind,'id',f.record_id,'revision',f.revision::text))
    OR (cmd_kind='resolve-accommodation' AND cmd->'canonical' IS DISTINCT FROM jsonb_build_object('kind',f.kind,'id',f.record_id,'revision',f.revision::text,'operationId',f.operation_id,'issuanceId',NULL)) THEN RAISE EXCEPTION 'No matching canonical proof' USING ERRCODE='PT409'; END IF;
 ELSIF cmd_kind IN('issue-letter','link-issued-letter','recover-letter') THEN
  IF cmd_kind='issue-letter' THEN
   IF NOT EXISTS(SELECT FROM public.erp_report_registry reg JOIN public.erp_output_class_policies pol ON pol.document_class=reg.document_class WHERE reg.report_code=p->>'outputCode') THEN RAISE EXCEPTION 'Current official output policy required' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT FROM public.erp_report_registry reg JOIN public.erp_output_class_policies pol ON pol.document_class=reg.document_class WHERE reg.report_code=p->>'outputCode'
    AND coalesce(reg.approval_required_override,pol.approval_required) AND NOT erp_private.employee_permission(r.employee_id,'reports.pdf.approve')) THEN RAISE EXCEPTION 'Current official issuer approval required' USING ERRCODE='42501'; END IF;
   IF p->>'outputCode' IN('HR_EXPERIENCE_LETTER','HR_WARNING_LETTER','HR_PPE_ISSUE_FORM','HR_HANDOVER_FORM') AND cmd->>'sourceReviewId' IS NULL THEN RAISE EXCEPTION 'Approved source review required' USING ERRCODE='22023'; END IF;
   IF p->>'outputCode' IN('HR_CLEARANCE_FORM','HR_LEAVE_CONFIRMATION') AND cmd->>'sourceId' IS NULL THEN RAISE EXCEPTION 'Original source selection required' USING ERRCODE='22023'; END IF;
   IF cmd->'outputCode' IS DISTINCT FROM p->'outputCode' OR cmd->'language' IS DISTINCT FROM p->'language' THEN RAISE EXCEPTION 'Approved letter differs' USING ERRCODE='22023'; END IF;
   IF cmd->>'templateId' IS NOT NULL AND NOT EXISTS(SELECT FROM jsonb_array_elements(erp_private.mobile_hr_v5_action_choices(r,jsonb_build_object('kind','letter-template','after',(cmd->>'templateId')::bigint-1,'search',''))) v WHERE v->'id'=cmd->'templateId') THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='42501'; END IF;
   IF cmd->>'sourceReviewId' IS NOT NULL OR cmd->>'sourceId' IS NOT NULL THEN
    SELECT v INTO selection FROM jsonb_array_elements(erp_private.mobile_hr_v5_action_choices(r,jsonb_build_object('kind','letter-source','after',coalesce((cmd->>'sourceReviewId')::bigint,(cmd->>'sourceId')::bigint)-1,'search',''))) v WHERE v->'sourceReviewId'=cmd->'sourceReviewId' AND v->'sourceId'=cmd->'sourceId';
    IF selection IS NULL THEN RAISE EXCEPTION 'Official source unavailable' USING ERRCODE='42501'; END IF;
   END IF;
  ELSE
   PERFORM 1 FROM public.erp_generated_pdf_documents WHERE id=(cmd->>'issuanceId')::bigint AND source_record_type='employee' AND source_record_id=r.employee_id FOR UPDATE;
   IF NOT EXISTS(SELECT FROM jsonb_array_elements(erp_private.mobile_hr_v5_action_choices(r,jsonb_build_object('kind','issuance','after',(cmd->>'issuanceId')::bigint-1,'search',''))) v WHERE v->'id'=cmd->'issuanceId' AND (cmd_kind<>'link-issued-letter' OR v->'checksum'=cmd->'checksum')) THEN RAISE EXCEPTION 'Original output unavailable' USING ERRCODE='42501'; END IF;
  END IF;
 ELSE
  row_data:=erp_private.mobile_hr_v5_source(r.employee_id,src,true);
  CASE cmd_kind
   WHEN 'record-return' THEN
    kind:=src->>'kind';action:='return';data:=jsonb_build_object('returned_date',cmd->'returnedDate');
    IF kind='asset' AND cmd->>'condition' IS NOT NULL THEN data:=data||jsonb_build_object('condition_on_return',cmd->'condition');
    ELSIF kind='ppe' AND cmd->>'condition' IS NOT NULL THEN RAISE EXCEPTION 'PPE return has no condition field' USING ERRCODE='22023'; END IF;
   WHEN 'create-overtime' THEN kind:='overtime';action:='create';data:=jsonb_build_object('overtime_date',p->'date','hours',p->'hours','reason',p->'reason','notes',NULL);
   WHEN 'change-shift' THEN
    kind:='shift-assignment';action:=CASE WHEN original_id IS NULL THEN 'create' ELSE 'update' END;
    SELECT jsonb_build_object('work_calendar_id',w.calendar_id,'work_shift_id',w.id,'effective_from',p->'from','effective_to',p->'to',
     'overtime_eligible',coalesce(row_data->'overtime_eligible','false'),'attendance_required',coalesce(row_data->'attendance_required','true'),
     'weekly_off_day',row_data->'weekly_off_day','notes',row_data->'notes') INTO data FROM public.work_shifts w WHERE w.id=(p->>'shiftId')::bigint AND w.is_active AND w.deleted_at IS NULL
      AND (w.calendar_id IS NULL OR EXISTS(SELECT FROM public.work_calendars c WHERE c.id=w.calendar_id AND c.is_active AND c.deleted_at IS NULL AND (c.owner_company_id IS NULL OR c.owner_company_id=r.company_id))) FOR SHARE;
    IF data IS NULL THEN RAISE EXCEPTION 'Shift or calendar changed' USING ERRCODE='PT409'; END IF;
   WHEN 'record-pro-follow-up' THEN
    kind:='pro-process';action:='update';long_note:=concat_ws(E'\n',nullif(row_data->>'notes',''),p->>'message');
    data:=jsonb_build_object('process_title',row_data->'process_title','priority',row_data->'priority','request_date',row_data->'request_date','target_date',row_data->'target_date','process_status',row_data->'process_status','notes',long_note);
    IF p->>'evidence' IS NOT NULL THEN
     IF row_data->>'related_document_id' IS NOT NULL AND row_data->'related_document_id'<>p#>'{evidence,documentId}' THEN RAISE EXCEPTION 'Existing PRO evidence must be preserved' USING ERRCODE='PT409'; END IF;
     data:=data||jsonb_build_object('related_document_id',p#>'{evidence,documentId}','related_document_version_id',p#>'{evidence,documentVersionId}');
    END IF;
   WHEN 'record-clearance' THEN
    data:=jsonb_build_object('eos_case_id',p->'caseId','evidence_document_id',p#>'{evidence,documentId}','evidence_version_id',p#>'{evidence,documentVersionId}');
    plan:=jsonb_build_array(jsonb_build_object('rpc','clearance','operationId',step_id,'employeeId',r.employee_id,'id',original_id,'revision',original_revision,'action','update','data',data),
      jsonb_build_object('rpc','clearance','operationId',extensions.uuid_generate_v5(op,'canonical-2'),'employeeId',r.employee_id,'id',original_id,'revision',original_revision+1,'action','clear','data',jsonb_build_object('eos_case_id',p->'caseId')));
   WHEN 'complete-task' THEN
    selection:=jsonb_build_object('kind','task','candidateId',row_data->'candidate_id','employeeId',r.employee_id,'id',original_id,'revision',original_revision::text,'reason','Evidence accepted for HR service #'||r.id);
    plan:=jsonb_build_array(jsonb_build_object('rpc','task','operationId',step_id,'body',selection||jsonb_build_object('action','update','values',jsonb_build_object('dms_document_id',p#>'{evidence,documentId}'))),
       jsonb_build_object('rpc','task','operationId',extensions.uuid_generate_v5(op,'canonical-2'),'body',selection||jsonb_build_object('revision',(original_revision+1)::text,'action','complete','values','{}'::jsonb)));
  END CASE;
  IF kind IS NOT NULL THEN plan:=jsonb_build_array(jsonb_build_object('rpc',kind,'operationId',step_id,'employeeId',r.employee_id,'id',original_id,'revision',original_revision,'action',action,'data',data)); END IF;
 END IF;
 INSERT INTO erp_private.mobile_hr_service_attempts(request_id,actor,operation_id,request_revision,command,command_hash,proposal_hash,plan,external_proof_id,reserved_output_id,issuance_key)
 VALUES(r.id,auth.uid(),op,r.revision,cmd,h,encode(sha256(convert_to(p::text,'UTF8')),'hex'),plan,f.id,(cmd->>'issuanceId')::bigint,CASE WHEN cmd_kind='issue-letter' THEN 'req_'||left(encode(sha256(convert_to((p->>'outputCode')||'|'||r.employee_id||'|'||public.current_user_profile_id()||'|'||op,'UTF8')),'hex'),48) END);
 RETURN jsonb_build_object('pending',true,'plan',plan,'proposal',p,'command',cmd);
END $$;

-- Extend the existing F11 operation and receipt checks to permit a pinned
-- evidence attachment only for the exact approved, executing service step.
DO $$ DECLARE original text; definition text; guard text; BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid='public.f11_mutate_pro_process(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'8e4c8f43690b442b80bf176eccdda07e9602e2be40cd56ee06fa19bcd56079cf' THEN RAISE EXCEPTION 'Unreviewed F11 PRO operation'; END IF;
 definition:=replace(definition,'''f12_source_kind'',''f12_source_id'',''f12_replacement_id'']','''f12_source_kind'',''f12_source_id'',''f12_replacement_id'',''related_document_id'',''related_document_version_id'']');
 definition:=replace(definition,'IF p_action<>''archive''THEN','IF (p_data?''related_document_id'' OR p_data?''related_document_version_id'') AND (p_action<>''update'' OR NOT(p_data ?& ARRAY[''related_document_id'',''related_document_version_id'']) OR jsonb_typeof(p_data->''related_document_id'') IS DISTINCT FROM ''number'' OR jsonb_typeof(p_data->''related_document_version_id'') IS DISTINCT FROM ''number'') THEN RAISE EXCEPTION ''Use both identifiers on an approved evidence update'' USING ERRCODE=''22023''; END IF; IF p_action<>''archive''THEN');
 definition:=replace(definition,'SET assigned_to=CASE','SET related_document_id=CASE WHEN p_data?''related_document_id'' THEN (p_data->>''related_document_id'')::bigint ELSE x.related_document_id END,related_document_version_id=CASE WHEN p_data?''related_document_version_id'' THEN (p_data->>''related_document_version_id'')::bigint ELSE x.related_document_version_id END,assigned_to=CASE');
 EXECUTE definition;
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid='erp_private.f11_capture_pro_process()'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'df2987f637359cd10c7e83f98101d24cda53bddf263293c4c1b6b6ebf2f4a9f3' THEN RAISE EXCEPTION 'Unreviewed F11 PRO trigger'; END IF;
 guard:=$guard$
   IF (NEW.related_document_id,NEW.related_document_version_id) IS DISTINCT FROM (OLD.related_document_id,OLD.related_document_version_id) AND NOT EXISTS(
    SELECT FROM erp_private.mobile_hr_service_attempts a JOIN erp_private.hr_self_service_requests r ON r.id=a.request_id
    WHERE a.actor=auth.uid() AND a.no_effect_at IS NULL AND a.canonical IS NULL AND r.status='approved' AND r.employee_id=NEW.employee_id AND r.kind='pro-follow-up'
     AND a.plan#>>'{0,operationId}'=context->>'operation_id' AND (r.proposal#>>'{source,id}')::bigint=NEW.id AND (r.proposal#>>'{source,revision}')::bigint=OLD.workspace_revision
     AND NEW.related_document_id=(r.proposal#>>'{evidence,documentId}')::bigint AND NEW.related_document_version_id=(r.proposal#>>'{evidence,documentVersionId}')::bigint
     AND r.mobile_evidence_proof IS NOT NULL AND r.mobile_evidence_proof=erp_private.mobile_hr_v5_evidence_facts(r.employee_id,r.proposal)
     AND (erp_private.mobile_hr_v5_rights(r)->>'fulfil')::boolean) THEN RAISE EXCEPTION 'Authorized PRO evidence operation required' USING ERRCODE='42501'; END IF;
 $guard$;
 definition:=replace(definition,'ELSIF context->>''action''=''update''THEN','ELSIF context->>''action''=''update''THEN'||guard);
 definition:=replace(definition,'''workspace_revision'',''assigned_to'',''f12_replacement_id''','''workspace_revision'',''related_document_id'',''related_document_version_id'',''assigned_to'',''f12_replacement_id''');
 EXECUTE definition;
END $$;

CREATE FUNCTION erp_private.mobile_hr_v5_finish(d jsonb,output_id bigint DEFAULT NULL,output_sha text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid bigint:=(d->>'employeeId')::bigint; r erp_private.hr_self_service_requests; a erp_private.mobile_hr_service_attempts; e public.employees;
 native erp_private.f11_child_receipts; recruitment erp_private.f12_recruitment_receipts; f erp_private.mobile_hr_verified_proofs; o public.erp_generated_pdf_documents;
 s jsonb; expected text; subject_kind text; native_id bigint; native_revision bigint; operation uuid; verified_canonical jsonb; outcome jsonb;
 tbl text; final_row jsonb;
BEGIN
 PERFORM erp_private.mobile_hr_v5_active();PERFORM erp_private.mobile_hr_v5_lock_actor();
 SELECT * INTO e FROM public.employees WHERE id=eid AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO r FROM erp_private.hr_self_service_requests WHERE id=(d->>'id')::bigint AND employee_id=eid AND company_id=e.owner_company_id AND branch_id IS NOT DISTINCT FROM e.branch_id FOR UPDATE;
 SELECT * INTO a FROM erp_private.mobile_hr_service_attempts WHERE no_effect_at IS NULL AND request_id=r.id AND actor=auth.uid() AND operation_id=(d->>'operationId')::uuid FOR UPDATE;
 IF a.request_id IS NULL OR r.status<>'approved' OR r.revision<>a.request_revision OR (erp_private.mobile_hr_v5_rights(r)->>'fulfil')::boolean IS NOT TRUE OR a.command_hash<>encode(sha256(convert_to(d::text,'UTF8')),'hex')
 OR a.proposal_hash<>encode(sha256(convert_to(r.proposal::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Original service attempt required' USING ERRCODE='42501'; END IF;
 IF r.kind='letter' THEN
  PERFORM erp_private.mobile_hr_v5_validate(eid,r.proposal);
  PERFORM erp_private.mobile_hr_v5_locked_authority(r,'fulfil');
  IF output_id IS NULL THEN RAISE EXCEPTION 'Verified output bytes required' USING ERRCODE='42501'; END IF;
  SELECT * INTO o FROM public.erp_generated_pdf_documents WHERE id=output_id FOR SHARE;
  IF o.id IS NULL OR erp_private.mobile_hr_v5_output_matches(r,o) IS NOT TRUE OR o.lifecycle_state<>'issued' OR o.revoked_at IS NOT NULL OR o.archived_at IS NOT NULL OR o.superseded_by_id IS NOT NULL OR o.expires_at<=now() OR o.checksum IS DISTINCT FROM output_sha OR coalesce(o.file_size_bytes,0)<=0
  OR (a.command->>'kind'='issue-letter' AND (o.generated_by IS DISTINCT FROM public.current_user_profile_id() OR o.request_key IS DISTINCT FROM 'req_'||left(encode(sha256(convert_to(o.output_code||'|'||eid||'|'||o.generated_by||'|'||a.operation_id,'UTF8')),'hex'),48)))
  OR (a.command->>'kind'<>'issue-letter' AND (a.command->>'issuanceId')::bigint IS DISTINCT FROM o.id) THEN RAISE EXCEPTION 'Original output changed' USING ERRCODE='PT409'; END IF;
  verified_canonical:=jsonb_build_object('kind','issued-document','id',o.id,'revision',NULL,'operationId',NULL,'issuanceId',o.id);
 ELSIF a.external_proof_id IS NOT NULL THEN
  SELECT * INTO f FROM erp_private.mobile_hr_verified_proofs WHERE id=a.external_proof_id;
  IF erp_private.mobile_hr_v5_current_proof(r,f) IS NOT TRUE THEN RAISE EXCEPTION 'Canonical result changed' USING ERRCODE='PT409'; END IF;
  verified_canonical:=jsonb_build_object('kind',f.kind,'id',f.record_id,'revision',f.revision::text,'operationId',f.operation_id,'issuanceId',NULL);
 ELSE
  FOR s IN SELECT value FROM jsonb_array_elements(a.plan) LOOP
   operation:=(s->>'operationId')::uuid;subject_kind:=s->>'rpc';
   IF subject_kind='task' THEN
    SELECT * INTO recruitment FROM erp_private.f12_recruitment_receipts WHERE actor=auth.uid() AND operation_id=operation;
    IF recruitment.actor IS NULL OR recruitment.request_hash<>encode(sha256(convert_to((s->'body')::text,'UTF8')),'hex') OR recruitment.result->>'employee_id' IS DISTINCT FROM eid::text THEN RAISE EXCEPTION 'Task step unconfirmed' USING ERRCODE='PT409'; END IF;
    native_id:=(recruitment.result->>'id')::bigint;native_revision:=(recruitment.result->>'revision')::bigint;
   ELSE
    expected:=encode(sha256(convert_to(jsonb_build_array(subject_kind,eid,s->'id',s->'revision',s->'action',s->'data')::text,'UTF8')),'hex');
    SELECT * INTO native FROM erp_private.f11_child_receipts WHERE actor=auth.uid() AND operation_id=operation AND employee_id=eid AND kind=subject_kind AND request_hash=expected;
    IF native.actor IS NULL THEN RAISE EXCEPTION 'Canonical receipt unconfirmed' USING ERRCODE='PT409'; END IF;
    native_id:=native.record_id;native_revision:=native.revision;
   END IF;
  END LOOP;
  tbl:=CASE subject_kind WHEN 'task' THEN 'hr_onboarding_tasks' WHEN 'asset' THEN 'employee_assets' WHEN 'ppe' THEN 'employee_ppe_issues'
    WHEN 'pro-process' THEN 'employee_pro_processes' WHEN 'shift-assignment' THEN 'employee_shift_assignments' WHEN 'overtime' THEN 'employee_overtime_records' WHEN 'clearance' THEN 'employee_clearance_items' END;
  IF tbl IS NULL THEN RAISE EXCEPTION 'Missing canonical result' USING ERRCODE='PT409'; END IF;
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE id=$1 AND employee_id=$2 AND workspace_revision=$3 AND deleted_at IS NULL FOR SHARE',tbl) INTO final_row USING native_id,eid,native_revision;
  IF final_row IS NULL OR (subject_kind='pro-process' AND r.proposal->>'evidence' IS NOT NULL AND
    (final_row->'related_document_id' IS DISTINCT FROM r.proposal#>'{evidence,documentId}' OR final_row->'related_document_version_id' IS DISTINCT FROM r.proposal#>'{evidence,documentVersionId}')) OR(subject_kind='overtime' AND final_row->>'approval_status' IS DISTINCT FROM 'pending') OR(subject_kind='task' AND (final_row->>'task_status' IS DISTINCT FROM 'completed' OR final_row->'dms_document_id' IS DISTINCT FROM r.proposal#>'{evidence,documentId}')) OR(subject_kind='clearance' AND (final_row->'eos_case_id' IS DISTINCT FROM r.proposal->'caseId' OR final_row->'evidence_version_id' IS DISTINCT FROM r.proposal#>'{evidence,documentVersionId}'))
    THEN RAISE EXCEPTION 'Canonical outcome changed' USING ERRCODE='PT409'; END IF;
  verified_canonical:=jsonb_build_object('kind',CASE WHEN subject_kind='task' THEN 'onboarding-task' ELSE subject_kind END,'id',native_id,'revision',native_revision::text,'operationId',operation,'issuanceId',NULL);
 END IF;
 IF r.proposal->>'evidence' IS NOT NULL AND r.mobile_evidence_proof IS DISTINCT FROM erp_private.mobile_hr_v5_evidence_facts(eid,r.proposal||jsonb_build_object('source',coalesce(erp_private.mobile_hr_v5_evidence_source(r),r.proposal->'source'))) THEN RAISE EXCEPTION 'Evidence changed' USING ERRCODE='42501'; END IF;
 UPDATE erp_private.mobile_hr_service_attempts SET canonical=verified_canonical,reserved_output_id=output_id,fulfilled_at=clock_timestamp() WHERE actor=a.actor AND operation_id=a.operation_id;
 UPDATE erp_private.hr_self_service_requests SET status='fulfilled',revision=3 WHERE id=r.id;
 outcome:=jsonb_build_object('effect','fulfilled','employeeId',eid,'id',r.id,'revision','3','operationId',a.operation_id,'replayed',false,'canonical',verified_canonical);
 INSERT INTO erp_private.hr_self_operation_receipts(actor,operation_id,action,request_hash,result) VALUES(auth.uid(),a.operation_id,'v5.serviceFulfil',a.command_hash,outcome);
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  VALUES(public.current_user_profile_id(),e.owner_company_id,'hr','hr_self_service_requests',r.id,r.id::text,'update',jsonb_build_object('event','serviceFulfil','operationId',a.operation_id,'canonical',verified_canonical));
 RETURN outcome;
END $$;
CREATE FUNCTION erp_private.mobile_hr_v5_finish_native(p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.mobile_hr_v5_finish(p_data,NULL,NULL)
$$;
-- Serialise cancellation with late/in-flight canonical issuance inserts. The
-- tombstone remains authoritative even if an earlier external worker resumes.
CREATE FUNCTION erp_private.mobile_hr_v5_guard_issuance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reserved erp_private.mobile_hr_service_attempts;
BEGIN
 IF NEW.request_key IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO reserved FROM erp_private.mobile_hr_service_attempts WHERE issuance_key=NEW.request_key FOR SHARE;
 IF reserved.no_effect_at IS NOT NULL THEN RAISE EXCEPTION 'Original issue attempt closed without effect' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_v5_guard_issuance() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER mobile_hr_guard_issue BEFORE INSERT OR UPDATE OF request_key ON public.erp_generated_pdf_documents FOR EACH ROW EXECUTE FUNCTION erp_private.mobile_hr_v5_guard_issuance();
CREATE FUNCTION public.mobile_hr_v5_close_unissued(p_claims jsonb,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous text:=current_setting('request.jwt.claims',true); reserved erp_private.mobile_hr_service_attempts; r erp_private.hr_self_service_requests;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_data#>>'{command,kind}' IS DISTINCT FROM 'issue-letter' THEN RAISE EXCEPTION 'Trusted pre-issuance outcome required' USING ERRCODE='42501'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_claims->>'sub','session_id',p_claims->>'session_id','role','authenticated')::text,true);
 PERFORM erp_private.mobile_hr_v5_lock_actor();
 SELECT * INTO r FROM erp_private.hr_self_service_requests WHERE id=(p_data->>'id')::bigint AND employee_id=(p_data->>'employeeId')::bigint FOR UPDATE;
 SELECT * INTO reserved FROM erp_private.mobile_hr_service_attempts WHERE request_id=r.id AND actor=auth.uid() AND operation_id=(p_data->>'operationId')::uuid FOR UPDATE;
 IF reserved.issuance_key IS NULL OR reserved.command_hash<>encode(sha256(convert_to(p_data::text,'UTF8')),'hex') OR reserved.canonical IS NOT NULL
   OR (erp_private.mobile_hr_v5_rights(r)->>'fulfil')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Current original attempt required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM public.erp_generated_pdf_documents WHERE request_key=reserved.issuance_key) THEN
  PERFORM set_config('request.jwt.claims',previous,true); RETURN false;
 END IF;
 UPDATE erp_private.mobile_hr_service_attempts SET no_effect_at=coalesce(no_effect_at,clock_timestamp()) WHERE actor=reserved.actor AND operation_id=reserved.operation_id;
 PERFORM set_config('request.jwt.claims',previous,true); RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mobile_hr_v5_close_unissued(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_hr_v5_close_unissued(jsonb,jsonb) TO service_role;

CREATE FUNCTION public.mobile_hr_v5_attest_output(p_claims jsonb,p_data jsonb,p_issuance bigint,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous text:=current_setting('request.jwt.claims',true); outcome jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_data->>'op' IS DISTINCT FROM 'serviceFulfil' OR p_sha IS NULL OR p_sha!~'^[a-f0-9]{64}$' OR p_issuance IS NULL THEN RAISE EXCEPTION 'Trusted verified output required' USING ERRCODE='42501'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_claims->>'sub','session_id',p_claims->>'session_id','role','authenticated')::text,true);
 outcome:=erp_private.mobile_hr_v5_finish(p_data,p_issuance,p_sha);
 PERFORM set_config('request.jwt.claims',previous,true);
 RETURN outcome;
END $$;
CREATE FUNCTION public.mobile_hr_service_v5(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE admission jsonb; s jsonb; k text; eid bigint; sid bigint; rev bigint; op uuid; action text; data jsonb;
BEGIN
 admission:=erp_private.mobile_hr_v5_service(p_data);
 IF p_data->>'op'<>'serviceFulfil' OR admission->>'effect'='fulfilled' OR admission#>>'{proposal,kind}'='letter' THEN RETURN admission; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(admission->'plan') LOOP
  k:=s->>'rpc';eid:=(s->>'employeeId')::bigint;sid:=(s->>'id')::bigint;rev:=(s->>'revision')::bigint;op:=(s->>'operationId')::uuid;action:=s->>'action';data:=s->'data';
  CASE k WHEN 'asset','ppe' THEN PERFORM public.f11_mutate_operation_item(k,eid,sid,rev,op,action,data);
    WHEN 'overtime','shift-assignment' THEN PERFORM public.f11_mutate_time_child(k,eid,sid,rev,op,action,data);
    WHEN 'pro-process' THEN PERFORM public.f11_mutate_pro_process(k,eid,sid,rev,op,action,data);
    WHEN 'clearance' THEN PERFORM public.f11_mutate_clearance(k,eid,sid,rev,op,action,data);
    WHEN 'task' THEN PERFORM public.f12_mutate_recruitment(op,s->'body');
    ELSE RAISE EXCEPTION 'Unexpected canonical step' USING ERRCODE='22023'; END CASE;
 END LOOP;
 RETURN erp_private.mobile_hr_v5_finish_native(p_data);
END $$;
-- Only the dispatcher, finish-with-native-proof wrapper and caller-facing RPC are executable by authenticated users.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp_private' AND p.proname IN (
 'mobile_hr_v5_keys','mobile_hr_v5_evidence_source','mobile_hr_v5_evidence_facts','mobile_hr_v5_values','mobile_hr_v5_domain','mobile_hr_v5_evidence','mobile_hr_v5_source','mobile_hr_v5_validate','mobile_hr_v5_options',
 'mobile_hr_v5_rights','mobile_hr_v5_summary','mobile_hr_v5_service','mobile_hr_v5_lock_actor','mobile_hr_v5_current_proof','mobile_hr_v5_capture_proof',
 'mobile_hr_v5_review_valid','mobile_hr_v5_output_matches','mobile_hr_v5_action_choices','mobile_hr_v5_reserve','mobile_hr_v5_finish','mobile_hr_v5_finish_native') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.mobile_hr_v5_attest_output(jsonb,jsonb,bigint,text),public.mobile_hr_service_v5(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_hr_service_v5(jsonb),erp_private.mobile_hr_v5_service(jsonb),erp_private.mobile_hr_v5_finish_native(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_hr_v5_attest_output(jsonb,jsonb,bigint,text) TO service_role;
CREATE FUNCTION erp_private.mobile_hr_v5_capabilities(subject bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM erp_private.mobile_hr_v5_active();
 WITH grants AS (SELECT e.id,
  public.current_user_can_view_employee(e.id) directory,
  erp_private.employee_permission(e.id,'hr.assignments.view') work,
  erp_private.employee_permission(e.id,'hr.leave.view') calendar,
  erp_private.employee_permission(e.id,'hr.compliance.view') dependents,
  erp_private.employee_permission(e.id,'hr.actions.view') pro,
  erp_private.employee_permission(e.id,'hr.actions.view') OR erp_private.employee_permission(e.id,'hr.eos.view') offboarding,
  (erp_private.mobile_hr_self(e.id) AND erp_private.employee_permission(e.id,'hr.requests.submit')) self_services,
  erp_private.employee_permission(e.id,'hr.recruitment.view') recruitment,
  erp_private.employee_permission(e.id,'hr.employees.view') employee_view,
  erp_private.employee_permission(e.id,'hr.attendance.view') attendance,
  (erp_private.employee_permission(e.id,'reports.view') OR erp_private.employee_permission(e.id,'reports.pdf.view_history') OR erp_private.employee_permission(e.id,'outputs.ops.view')) wallet,
  (erp_private.f11_child_authorized('approval',e.id) AND NOT EXISTS(SELECT FROM public.erp_user_employee_links l WHERE l.employee_id=e.id AND l.user_profile_id=public.current_user_profile_id())
    AND (erp_private.f11_child_authorized('pro-process',e.id) OR erp_private.f11_child_authorized('asset',e.id))) review
  FROM public.employees e WHERE e.deleted_at IS NULL AND (subject IS NULL OR e.id=subject))
 SELECT jsonb_build_object('directory',coalesce(bool_or(directory),false),'employeeRecord',coalesce(bool_or(directory),false),
  'work',coalesce(bool_or(work),false),'teamReadiness',coalesce(bool_or(work AND directory),false),
  'services',coalesce(bool_or(self_services AND (employee_view OR attendance OR work OR dependents OR pro OR offboarding)),false),
  'serviceReview',coalesce(bool_or(review AND directory),false),'issuedDocuments',coalesce(bool_or(wallet AND directory),false),
  'ppeAssets',coalesce(bool_or(work),false),'onboarding',coalesce(bool_or((self_services AND employee_view) OR recruitment),false),
  'pro',coalesce(bool_or(pro),false),'teamCalendar',coalesce(bool_or(calendar),false),'dependents',coalesce(bool_or(dependents),false),
  'accommodation',coalesce(bool_or(work),false),'offboarding',coalesce(bool_or(offboarding),false)) INTO result FROM grants;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_v5_capabilities(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_hr_v5_capabilities(bigint) TO authenticated;
-- Preserve the v4 no-argument function byte-for-byte. Only the v5 backend requests the expanded menus.
CREATE FUNCTION public.mobile_hr_staff_capabilities(p_expanded boolean,p_subject bigint,p_own boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.mobile_hr_staff_capabilities()||CASE WHEN p_expanded THEN jsonb_build_object('expanded',
  erp_private.mobile_hr_v5_capabilities(CASE WHEN p_own THEN (public.mobile_hr_own_access()->>'employeeId')::bigint ELSE p_subject END)) ELSE '{}'::jsonb END
$$;
REVOKE ALL ON FUNCTION public.mobile_hr_staff_capabilities(boolean,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_hr_staff_capabilities(boolean,bigint,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
