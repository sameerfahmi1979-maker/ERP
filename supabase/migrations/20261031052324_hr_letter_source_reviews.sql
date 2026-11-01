BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Additive evidence supplement, not an employee master edit, stock clearance,
-- disciplinary decision or financial settlement. Approved wording is in code.
CREATE TABLE erp_private.hr_letter_source_reviews(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 code text NOT NULL CHECK(code IN('HR_EXPERIENCE_LETTER','HR_WARNING_LETTER','HR_PPE_ISSUE_FORM','HR_HANDOVER_FORM')),
 source_id bigint NOT NULL,receiver_id bigint REFERENCES public.employees(id),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object'),
 fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 created_by bigint NOT NULL REFERENCES public.user_profiles(id),
 operation_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_by bigint REFERENCES public.user_profiles(id),reviewed_at timestamptz,
 UNIQUE(created_by,operation_id),
 CHECK((status='pending')=(reviewed_by IS NULL AND reviewed_at IS NULL)),
 CHECK(reviewed_by IS NULL OR reviewed_by<>created_by));
CREATE INDEX hr_letter_source_subject ON erp_private.hr_letter_source_reviews(employee_id,code,id DESC);
CREATE UNIQUE INDEX hr_letter_source_exact ON erp_private.hr_letter_source_reviews(employee_id,code,source_id,coalesce(receiver_id,0),document_id,version_id,fingerprint,(md5(facts::text)));
ALTER TABLE erp_private.hr_letter_source_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.hr_letter_source_reviews FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.hr_letter_authorized(p_employee bigint,p_code text,p_manage boolean DEFAULT false)RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE caps text[];cap text;
BEGIN
 IF auth.uid()IS NULL OR NOT erp_private.business_principal_is_active()THEN RETURN false;END IF;
 caps:=CASE p_code WHEN 'HR_EXPERIENCE_LETTER'THEN ARRAY['hr.eos.view','hr.payroll.view']
 WHEN 'HR_WARNING_LETTER'THEN ARRAY['hr.actions.view','hr.confidential.view']
 WHEN 'HR_PPE_ISSUE_FORM'THEN ARRAY['hr.assignments.view']
 WHEN 'HR_HANDOVER_FORM'THEN ARRAY['hr.actions.view','hr.assignments.view'] END;
 IF caps IS NULL THEN RETURN false;END IF;
 FOREACH cap IN ARRAY caps||ARRAY['reports.run','reports.pdf.generate']LOOP
  IF NOT erp_private.employee_permission(p_employee,cap)THEN RETURN false;END IF;
 END LOOP;
 IF p_manage THEN
  cap:=CASE p_code WHEN 'HR_EXPERIENCE_LETTER'THEN 'hr.eos.manage' WHEN 'HR_PPE_ISSUE_FORM'THEN 'hr.assignments.manage' ELSE 'hr.actions.manage'END;
  IF NOT erp_private.employee_permission(p_employee,cap)THEN RETURN false;END IF;
  IF p_code='HR_WARNING_LETTER'AND NOT erp_private.employee_permission(p_employee,'hr.confidential.manage')THEN RETURN false;END IF;
 END IF;
 RETURN true;
END$$;

-- Exact employee, source and current evidence version are locked together.
-- Only the digest leaves this helper; unrelated employee fields never do.
CREATE FUNCTION erp_private.hr_letter_fingerprint(p_employee bigint,p_code text,p_source bigint,p_receiver bigint,p_document bigint,p_version bigint)RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.employees;receiver public.employees;d public.dms_documents;v public.dms_document_versions;s jsonb;files jsonb;salary_source jsonb;
BEGIN
 IF NOT erp_private.hr_letter_authorized(p_employee,p_code)THEN RAISE EXCEPTION 'Current letter authority required' USING ERRCODE='42501';END IF;
 SELECT *INTO e FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 IF p_code='HR_EXPERIENCE_LETTER'THEN
  SELECT to_jsonb(t)INTO s FROM public.employee_eos_cases t WHERE id=p_source AND employee_id=e.id AND deleted_at IS NULL AND case_status='closed' AND employment_end_date IS NOT NULL FOR SHARE;
 ELSIF p_code='HR_WARNING_LETTER'THEN
  SELECT to_jsonb(t)INTO s FROM public.employee_disciplinary_records t WHERE id=p_source AND employee_id=e.id AND deleted_at IS NULL AND status='closed' AND disciplinary_type IN('written_warning','final_warning') FOR SHARE;
 ELSIF p_code='HR_PPE_ISSUE_FORM'THEN
  SELECT to_jsonb(t)INTO s FROM public.employee_ppe_issues t WHERE id=p_source AND employee_id=e.id AND deleted_at IS NULL AND status='issued' FOR SHARE;
 ELSE
  IF p_source<>p_employee OR p_receiver IS NULL OR p_receiver=p_employee OR NOT erp_private.employee_permission(p_receiver,'hr.employees.view')THEN RAISE EXCEPTION 'Explicit permitted receiver required' USING ERRCODE='42501';END IF;
  SELECT *INTO receiver FROM public.employees WHERE id=p_receiver AND deleted_at IS NULL FOR SHARE;
  IF receiver.id IS NULL OR receiver.owner_company_id<>e.owner_company_id THEN RAISE EXCEPTION 'Same-company receiver required' USING ERRCODE='42501';END IF;
  s:=jsonb_build_array(to_jsonb(e),to_jsonb(receiver));
 END IF;
 IF s IS NULL THEN RAISE EXCEPTION 'Current original source unavailable' USING ERRCODE='PT409';END IF;
 SELECT *INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL AND NOT is_archived FOR SHARE;
 IF d.id IS NULL OR d.current_version_id IS DISTINCT FROM p_version OR d.owning_company_id IS DISTINCT FROM e.owner_company_id
 OR(d.owning_branch_id IS NOT NULL AND d.owning_branch_id IS DISTINCT FROM e.branch_id)
 OR NOT erp_private.document_permission(d.id,'dms.documents.view')OR NOT erp_private.document_permission(d.id,'dms.documents.preview')THEN RAISE EXCEPTION 'Current permitted source evidence required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.dms_document_links WHERE document_id=d.id AND entity_type='employee'AND entity_id=e.id AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evidence must be linked to this employee' USING ERRCODE='42501';END IF;
 IF p_receiver IS NOT NULL THEN
  PERFORM 1 FROM public.dms_document_links WHERE document_id=d.id AND entity_type='employee'AND entity_id=p_receiver AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Handover evidence must identify both employees' USING ERRCODE='42501';END IF;
 END IF;
 SELECT *INTO v FROM public.dms_document_versions WHERE id=p_version AND document_id=d.id AND unlinked_at IS NULL FOR SHARE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Original evidence version unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.dms_document_files WHERE document_id=d.id AND version_id=v.id AND deleted_at IS NULL AND file_role='original' FOR SHARE;
 SELECT jsonb_agg(jsonb_build_object('id',id,'hash',sha256_hash,'bytes',file_size_bytes,'integrity',integrity_status)ORDER BY id)INTO files FROM public.dms_document_files WHERE document_id=d.id AND version_id=v.id AND deleted_at IS NULL AND file_role='original';
 IF files IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(files)f WHERE f->>'integrity'IS DISTINCT FROM'verified'OR coalesce((f->>'bytes')::bigint,0)<=0 OR coalesce(f->>'hash','')!~'^[a-f0-9]{64}$')THEN RAISE EXCEPTION 'Verified evidence bytes required' USING ERRCODE='23514';END IF;

 IF p_code='HR_EXPERIENCE_LETTER'THEN
  PERFORM 1 FROM public.employee_payroll_profiles WHERE employee_id=e.id FOR SHARE;
  PERFORM 1 FROM public.employee_salary_components WHERE employee_id=e.id ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.employee_salary_revision_effects WHERE employee_id=e.id ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.hr_salary_component_types WHERE id IN(SELECT component_type_id FROM public.employee_salary_components WHERE employee_id=e.id)ORDER BY id FOR SHARE;
  SELECT jsonb_build_array(
   (SELECT to_jsonb(p)FROM public.employee_payroll_profiles p WHERE employee_id=e.id AND deleted_at IS NULL),
   (SELECT jsonb_agg(to_jsonb(c)ORDER BY c.id)FROM public.employee_salary_components c WHERE employee_id=e.id),
   (SELECT jsonb_agg(to_jsonb(r)ORDER BY r.id)FROM public.employee_salary_revision_effects r WHERE employee_id=e.id),
   (SELECT jsonb_agg(to_jsonb(k)ORDER BY k.id)FROM public.hr_salary_component_types k WHERE id IN(SELECT component_type_id FROM public.employee_salary_components WHERE employee_id=e.id)))INTO salary_source;
 END IF;
 RETURN encode(sha256(convert_to(jsonb_build_array(to_jsonb(e),s,d.id,v.id,d.updated_at,files,salary_source)::text,'UTF8')),'hex');
END$$;

CREATE FUNCTION public.hr_letter_source_review(p_employee bigint,p_code text,p_action text,p_id bigint DEFAULT NULL,p_operation uuid DEFAULT NULL,p_data jsonb DEFAULT NULL,p_after bigint DEFAULT 0)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r erp_private.hr_letter_source_reviews;actor bigint;hash text;keys text[];key text;facts jsonb;src bigint;receiver bigint;doc bigint;ver bigint;day date;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','read','submit','approve','reject','options')OR p_after IS NULL OR p_after<0 THEN RAISE EXCEPTION 'Invalid source review action' USING ERRCODE='22023';END IF;
 IF NOT erp_private.hr_letter_authorized(p_employee,p_code,p_action IN('submit','approve','reject'))THEN RAISE EXCEPTION 'Current source review authority required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF p_action='options'THEN
  IF p_data->>'kind'='evidence'THEN
   RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)ORDER BY x.id)FROM(
    SELECT d.id,d.current_version_id AS version,d.document_no||' · '||d.title AS label FROM public.dms_documents d
    JOIN public.employees e ON e.id=p_employee
    WHERE d.id>p_after AND d.deleted_at IS NULL AND NOT d.is_archived AND d.current_version_id IS NOT NULL
    AND d.owning_company_id=e.owner_company_id AND(d.owning_branch_id IS NULL OR d.owning_branch_id=e.branch_id)
    AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='employee'AND l.entity_id=e.id AND l.deleted_at IS NULL)
    AND erp_private.document_permission(d.id,'dms.documents.view')AND erp_private.document_permission(d.id,'dms.documents.preview')ORDER BY d.id LIMIT 26)x),'[]');
  ELSIF p_data->>'kind'='receiver'AND p_code='HR_HANDOVER_FORM'THEN
   RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)ORDER BY x.id)FROM(
    SELECT e.id,e.employee_code||' · '||e.full_name_en AS label FROM public.employees e
    WHERE e.id>p_after AND e.id<>p_employee AND e.deleted_at IS NULL
    AND e.owner_company_id=(SELECT owner_company_id FROM public.employees WHERE id=p_employee)
    AND erp_private.employee_permission(e.id,'hr.employees.view')ORDER BY e.id LIMIT 26)x),'[]');
  ELSE RAISE EXCEPTION 'Invalid source options' USING ERRCODE='22023';END IF;
 END IF;

 IF p_action='list'THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'operation_id' ORDER BY x.id)FROM(SELECT *FROM erp_private.hr_letter_source_reviews WHERE employee_id=p_employee AND code=p_code AND id>p_after AND erp_private.document_permission(document_id,'dms.documents.view')AND erp_private.document_permission(document_id,'dms.documents.preview') ORDER BY id LIMIT 26)x),'[]');END IF;
 IF p_action='submit'THEN
  IF p_operation IS NULL OR jsonb_typeof(p_data)IS DISTINCT FROM'object'OR octet_length(p_data::text)>12000
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['source_id','receiver_id','document_id','version_id','facts']))THEN RAISE EXCEPTION 'Invalid source review payload' USING ERRCODE='22023';END IF;
  FOREACH key IN ARRAY ARRAY['source_id','document_id','version_id']LOOP
   IF coalesce(p_data->>key,'')!~'^[1-9][0-9]{0,15}$'OR(p_data->>key)::numeric>9007199254740991 THEN RAISE EXCEPTION 'Invalid source identity' USING ERRCODE='22023';END IF;
  END LOOP;
  src:=(p_data->>'source_id')::bigint;doc:=(p_data->>'document_id')::bigint;ver:=(p_data->>'version_id')::bigint;
  IF p_data->>'receiver_id'IS NOT NULL AND(coalesce(p_data->>'receiver_id','')!~'^[1-9][0-9]{0,15}$'OR(p_data->>'receiver_id')::numeric>9007199254740991)THEN RAISE EXCEPTION 'Invalid receiver' USING ERRCODE='22023';END IF;
  receiver:=(p_data->>'receiver_id')::bigint;
  IF(p_code='HR_HANDOVER_FORM')IS DISTINCT FROM(receiver IS NOT NULL)THEN RAISE EXCEPTION 'Unexpected receiver' USING ERRCODE='22023';END IF;
  keys:=CASE p_code WHEN'HR_EXPERIENCE_LETTER'THEN ARRAY['termination_reason_ar','designation_en','designation_ar']
  WHEN'HR_WARNING_LETTER'THEN ARRAY['warning_subject_ar','verified_conduct_description_ar','policy_reference_en','policy_reference_ar','specific_corrective_action_ar','corrective_deadline','response_channel_en','response_channel_ar','response_period','response_period_ar']
  WHEN'HR_PPE_ISSUE_FORM'THEN ARRAY['condition','condition_ar','ppe_item_ar']
  ELSE ARRAY['handover_date','description_en','description_ar','reference','owner_name','status_en','status_ar']END;
  facts:=p_data->'facts';
  IF jsonb_typeof(facts)IS DISTINCT FROM'object'OR NOT facts?&keys OR EXISTS(SELECT 1 FROM jsonb_object_keys(facts)k WHERE k<>ALL(keys))THEN RAISE EXCEPTION 'Complete original source facts required' USING ERRCODE='23514';END IF;
  FOREACH key IN ARRAY keys LOOP IF jsonb_typeof(facts->key)IS DISTINCT FROM'string'OR length(btrim(facts->>key))NOT BETWEEN 1 AND 500 OR(facts->>key)~'[[:cntrl:]]'THEN RAISE EXCEPTION 'Invalid review text' USING ERRCODE='23514';END IF;END LOOP;
  key:=CASE p_code WHEN'HR_WARNING_LETTER'THEN'corrective_deadline'WHEN'HR_HANDOVER_FORM'THEN'handover_date'END;
  IF key IS NOT NULL THEN IF(facts->>key)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RAISE EXCEPTION 'Invalid review date' USING ERRCODE='23514';END IF;day:=(facts->>key)::date;IF NOT isfinite(day)THEN RAISE EXCEPTION 'Invalid date' USING ERRCODE='23514';END IF;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr-letter-review:'||actor||':'||p_operation,0));
  SELECT *INTO r FROM erp_private.hr_letter_source_reviews WHERE created_by=actor AND operation_id=p_operation;
  IF FOUND THEN
   IF r.employee_id<>p_employee OR r.code<>p_code OR r.source_id<>src OR r.receiver_id IS DISTINCT FROM receiver OR r.document_id<>doc OR r.version_id<>ver OR r.facts<>facts THEN RAISE EXCEPTION 'Original request values changed' USING ERRCODE='22023';END IF;
   RETURN(to_jsonb(r)-'operation_id')||jsonb_build_object('replayed',true);
  END IF;
  hash:=erp_private.hr_letter_fingerprint(p_employee,p_code,src,receiver,doc,ver);
  INSERT INTO erp_private.hr_letter_source_reviews(employee_id,code,source_id,receiver_id,document_id,version_id,facts,fingerprint,created_by,operation_id)
  VALUES(p_employee,p_code,src,receiver,doc,ver,facts,hash,actor,p_operation)ON CONFLICT DO NOTHING RETURNING *INTO r;
  IF NOT FOUND THEN
   SELECT *INTO r FROM erp_private.hr_letter_source_reviews WHERE employee_id=p_employee AND code=p_code AND source_id=src AND receiver_id IS NOT DISTINCT FROM receiver AND document_id=doc AND version_id=ver AND fingerprint=hash AND hr_letter_source_reviews.facts=(p_data->'facts') FOR SHARE;
   IF r.id IS NULL OR r.created_by<>actor THEN RAISE EXCEPTION 'Matching source review already exists; select or review the original' USING ERRCODE='23514';END IF;
   RETURN(to_jsonb(r)-'operation_id')||jsonb_build_object('replayed',true);
  END IF;
 ELSE
  SELECT *INTO r FROM erp_private.hr_letter_source_reviews WHERE id=p_id AND employee_id=p_employee AND code=p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source review unavailable' USING ERRCODE='42501';END IF;
  hash:=erp_private.hr_letter_fingerprint(r.employee_id,r.code,r.source_id,r.receiver_id,r.document_id,r.version_id);
  IF hash<>r.fingerprint THEN RAISE EXCEPTION 'Source or evidence changed; submit a new reviewed version' USING ERRCODE='PT409';END IF;
  IF p_action IN('approve','reject')THEN
   IF actor=r.created_by OR NOT erp_private.employee_permission(p_employee,'reports.pdf.approve')THEN RAISE EXCEPTION 'Different authorised reviewer required' USING ERRCODE='42501';END IF;
   IF r.status<>'pending'THEN
    IF r.reviewed_by=actor AND r.status=(CASE p_action WHEN'approve'THEN'approved'ELSE'rejected'END) THEN RETURN(to_jsonb(r)-'operation_id')||jsonb_build_object('replayed',true);END IF;
    RAISE EXCEPTION 'Review already decided' USING ERRCODE='PT409';
   END IF;
   UPDATE erp_private.hr_letter_source_reviews SET status=CASE p_action WHEN'approve'THEN'approved'ELSE'rejected'END,reviewed_by=actor,reviewed_at=clock_timestamp()WHERE id=r.id RETURNING *INTO r;
  ELSIF r.status<>'approved'THEN RAISE EXCEPTION 'Approved source review required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN to_jsonb(r)-'operation_id';
END$$;
REVOKE ALL ON FUNCTION erp_private.hr_letter_authorized(bigint,text,boolean),erp_private.hr_letter_fingerprint(bigint,text,bigint,bigint,bigint,bigint),public.hr_letter_source_review(bigint,text,text,bigint,uuid,jsonb,bigint)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hr_letter_source_review(bigint,text,text,bigint,uuid,jsonb,bigint)TO authenticated;
COMMENT ON TABLE erp_private.hr_letter_source_reviews IS 'Version-bound, independently reviewed supplemental facts. Does not grant stock/IT authority, change employee data, or certify payment.';

-- Preserve existing capabilities and ensure history/downloads enforce the new data classification too.
UPDATE public.erp_report_registry r SET required_permissions=(SELECT array_agg(DISTINCT c ORDER BY c)FROM unnest(coalesce(r.required_permissions,ARRAY[]::text[])||v.caps)c)
FROM(VALUES('HR_EXPERIENCE_LETTER',ARRAY['hr.eos.view','hr.payroll.view']),('HR_WARNING_LETTER',ARRAY['hr.actions.view','hr.confidential.view']),('HR_BANK_SALARY_TRANSFER',ARRAY['hr.payroll.view','hr.banking.view']),('HR_SALARY_CERT_WITH_AMOUNT',ARRAY['hr.payroll.view']),('HR_PPE_ISSUE_FORM',ARRAY['hr.assignments.view']),('HR_CLEARANCE_FORM',ARRAY['hr.eos.view']),('HR_HANDOVER_FORM',ARRAY['hr.actions.view','hr.assignments.view']),('HR_LEAVE_CONFIRMATION',ARRAY['hr.leave.view']))v(code,caps)
WHERE r.report_code=v.code AND r.deleted_at IS NULL;

CREATE FUNCTION erp_private.hr_letter_registry_guard()RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE caps text[];
BEGIN
 caps:=CASE NEW.report_code WHEN'HR_EXPERIENCE_LETTER'THEN ARRAY['hr.eos.view','hr.payroll.view'] WHEN'HR_WARNING_LETTER'THEN ARRAY['hr.actions.view','hr.confidential.view'] WHEN'HR_BANK_SALARY_TRANSFER'THEN ARRAY['hr.payroll.view','hr.banking.view'] WHEN'HR_SALARY_CERT_WITH_AMOUNT'THEN ARRAY['hr.payroll.view'] WHEN'HR_PPE_ISSUE_FORM'THEN ARRAY['hr.assignments.view'] WHEN'HR_CLEARANCE_FORM'THEN ARRAY['hr.eos.view'] WHEN'HR_HANDOVER_FORM'THEN ARRAY['hr.actions.view','hr.assignments.view'] WHEN'HR_LEAVE_CONFIRMATION'THEN ARRAY['hr.leave.view'] ELSE ARRAY[]::text[] END;
 IF cardinality(caps)>0 THEN NEW.required_permissions:=(SELECT array_agg(DISTINCT c ORDER BY c)FROM unnest(coalesce(NEW.required_permissions,ARRAY[]::text[])||caps)c);END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.hr_letter_registry_guard()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER hr_letter_registry_caps BEFORE INSERT OR UPDATE OF required_permissions,report_code ON public.erp_report_registry FOR EACH ROW EXECUTE FUNCTION erp_private.hr_letter_registry_guard();

CREATE FUNCTION erp_private.hr_letter_issue_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb;review_id bigint;
BEGIN
 IF NEW.lifecycle_state='issued'AND OLD.lifecycle_state IS DISTINCT FROM'issued'
 AND NEW.output_code IN('HR_EXPERIENCE_LETTER','HR_WARNING_LETTER','HR_PPE_ISSUE_FORM','HR_HANDOVER_FORM')THEN
  IF coalesce(NEW.data_snapshot_json#>>'{row,source_review_id}','')!~'^[1-9][0-9]{0,15}$'THEN RAISE EXCEPTION 'Approved original source review required' USING ERRCODE='23514';END IF;
  review_id:=(NEW.data_snapshot_json#>>'{row,source_review_id}')::bigint;
  r:=public.hr_letter_source_review(NEW.source_record_id,NEW.output_code,'read',review_id);
  IF r->>'fingerprint'IS DISTINCT FROM NEW.data_snapshot_json#>>'{row,source_review_fingerprint}'THEN RAISE EXCEPTION 'Source changed; original output cannot be issued' USING ERRCODE='PT409';END IF;
 END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.hr_letter_issue_guard()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER hr_letter_original_source BEFORE UPDATE OF lifecycle_state ON public.erp_generated_pdf_documents FOR EACH ROW EXECUTE FUNCTION erp_private.hr_letter_issue_guard();

CREATE FUNCTION erp_private.hr_letter_review_immutable()RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE'THEN RAISE EXCEPTION 'Source review history cannot be deleted' USING ERRCODE='42501';END IF;
 IF( to_jsonb(NEW)-ARRAY['status','reviewed_by','reviewed_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','reviewed_by','reviewed_at'])
 OR OLD.status<>'pending'OR NEW.status NOT IN('approved','rejected')THEN RAISE EXCEPTION 'Original source review is immutable' USING ERRCODE='42501';END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.hr_letter_review_immutable()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER hr_letter_review_history BEFORE UPDATE OR DELETE ON erp_private.hr_letter_source_reviews FOR EACH ROW EXECUTE FUNCTION erp_private.hr_letter_review_immutable();

CREATE FUNCTION public.hr_letter_integration_version()RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()THEN 1 END;
$$;
REVOKE ALL ON FUNCTION public.hr_letter_integration_version()FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hr_letter_integration_version()TO authenticated;
COMMIT;
