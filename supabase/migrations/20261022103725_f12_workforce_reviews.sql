-- F12-03: version-bound human reviews; not new employment, pay or stock facts.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
ALTER TABLE public.hr_readiness_rule_templates ADD COLUMN waiver_allowed boolean NOT NULL DEFAULT false;
GRANT SELECT(waiver_allowed)ON public.hr_readiness_rule_templates TO authenticated;
DO $$DECLARE definition text;needle text:='''is_critical'',''expiry_buffer_days''';BEGIN
 definition:=pg_get_functiondef('erp_private.hr_lookup_fields(text)'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized F06 rule fields';END IF;
 EXECUTE replace(definition,needle,'''is_critical'',''waiver_allowed'',''expiry_buffer_days''');
END$$;
CREATE TABLE erp_private.f12_workforce_reviews(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint NOT NULL,source_kind text NOT NULL,source_id bigint NOT NULL,
 source_hash text NOT NULL,document_id bigint,version_id bigint,rule_id bigint,purpose text NOT NULL,
 requested_by bigint NOT NULL,reviewer_id bigint NOT NULL,responsible_id bigint,medical_required boolean NOT NULL DEFAULT false,valid_from date NOT NULL,valid_until date NOT NULL,
 reason text NOT NULL,data jsonb NOT NULL,status text NOT NULL DEFAULT'pending'CHECK(status IN('pending','approved','rejected','revoked','withdrawn')),
 revision bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),decided_at timestamptz,
 CHECK(valid_until>=valid_from),CHECK(requested_by<>reviewer_id));
CREATE INDEX f12_workforce_subject ON erp_private.f12_workforce_reviews(employee_id,source_kind,source_id,id DESC);
CREATE UNIQUE INDEX f12_workforce_pending ON erp_private.f12_workforce_reviews(employee_id,source_kind,source_id,purpose)WHERE status='pending';
CREATE TABLE erp_private.f12_workforce_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,review_id bigint NOT NULL,entity_type text NOT NULL DEFAULT'review'CHECK(entity_type IN('review','evidence')),actor uuid NOT NULL,operation_id uuid NOT NULL,action text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(actor,operation_id));
CREATE TABLE erp_private.f12_workforce_receipts(actor uuid NOT NULL,operation_id uuid NOT NULL,request_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor,operation_id));
CREATE INDEX f12_workforce_recent ON erp_private.f12_workforce_receipts(actor,created_at DESC,operation_id DESC);
CREATE TABLE erp_private.f12_evidence_verifications(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint NOT NULL,source_kind text NOT NULL,source_id bigint NOT NULL,source_hash text NOT NULL,document_id bigint NOT NULL,version_id bigint NOT NULL,actor uuid NOT NULL,operation_id uuid NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CONSTRAINT f12_evidence_operation UNIQUE(actor,operation_id));
CREATE INDEX f12_evidence_subject ON erp_private.f12_evidence_verifications(employee_id,source_kind,source_id,id DESC);
ALTER TABLE erp_private.f12_evidence_verifications ENABLE ROW LEVEL SECURITY;REVOKE ALL ON erp_private.f12_evidence_verifications FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE erp_private.f12_workforce_reviews ENABLE ROW LEVEL SECURITY;ALTER TABLE erp_private.f12_workforce_events ENABLE ROW LEVEL SECURITY;ALTER TABLE erp_private.f12_workforce_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f12_workforce_reviews,erp_private.f12_workforce_events,erp_private.f12_workforce_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f12_review_authorized(p_kind text,p_employee bigint)RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(CASE WHEN p_kind=ANY(ARRAY['identity-document','access-card','training-certificate','medical-insurance','medical-record'])THEN erp_private.f11_child_authorized(p_kind,p_employee)
 WHEN p_kind='dependent'THEN erp_private.business_principal_is_active()AND erp_private.employee_permission(p_employee,'hr.compliance.view')AND erp_private.employee_permission(p_employee,'hr.compliance.manage')
 WHEN p_kind='leave-balance'THEN erp_private.f11_child_authorized('leave-balance',p_employee)
 ELSE p_kind=ANY(ARRAY['assignment','role-requirement','pro-process','asset','ppe','accommodation'])AND erp_private.f11_child_authorized(p_kind,p_employee)END,false);
$$;
REVOKE ALL ON FUNCTION erp_private.f12_review_authorized(text,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_review_authorized(text,bigint)TO authenticated;
CREATE FUNCTION erp_private.f12_review_visible(p_kind text,p_employee bigint)RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active()AND erp_private.employee_permission(p_employee,CASE WHEN p_kind IN('medical-record','medical-insurance')THEN'hr.medical.view'WHEN p_kind IN('identity-document','access-card','training-certificate','dependent')THEN'hr.compliance.view'WHEN p_kind='pro-process'THEN'hr.actions.view'WHEN p_kind='leave-balance'THEN'hr.leave.view'ELSE'hr.assignments.view'END);
$$;
REVOKE ALL ON FUNCTION erp_private.f12_review_visible(text,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_review_visible(text,bigint)TO authenticated;

-- Verifies a named existing reviewer; never changes roles or guesses identity.
CREATE FUNCTION erp_private.f12_review_person(p_profile bigint,p_kind text,p_employee bigint,p_medical boolean DEFAULT false)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.f12_review_authorized(p_kind,p_employee)AND EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=p_profile AND p.status='active'AND NOT p.must_change_password AND p.auth_user_id IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM unnest((CASE WHEN p_kind IN('medical-insurance','medical-record')THEN ARRAY['hr.medical.view','hr.medical.manage']WHEN p_kind='pro-process'THEN ARRAY['hr.actions.view','hr.actions.manage']WHEN p_kind='leave-balance'THEN ARRAY['hr.leave.view','hr.leave.manage']WHEN p_kind IN('identity-document','access-card','training-certificate','dependent')THEN ARRAY['hr.compliance.view','hr.compliance.manage']ELSE ARRAY['hr.assignments.view','hr.assignments.manage']END)||CASE WHEN coalesce(p_medical,false)THEN ARRAY['hr.medical.view','hr.medical.manage']ELSE ARRAY[]::text[]END)needed WHERE NOT EXISTS(
 SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions x ON x.id=rp.permission_id JOIN public.employees e ON e.id=p_employee WHERE u.user_profile_id=p_profile AND u.is_active AND r.is_active AND x.is_active AND x.permission_code=needed AND(u.owner_company_id IS NULL OR u.owner_company_id=e.owner_company_id)AND(u.branch_id IS NULL OR u.branch_id=e.branch_id)));
$$;
REVOKE ALL ON FUNCTION erp_private.f12_review_person(bigint,text,bigint,boolean)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_review_person(bigint,text,bigint,boolean)TO authenticated;

CREATE FUNCTION erp_private.f12_workforce_source(p_kind text,p_employee bigint,p_source bigint,p_document bigint DEFAULT NULL,p_rule bigint DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE relation text;projection text:='s.*';row jsonb;e public.employees;d public.dms_documents;rule public.hr_readiness_rule_templates;configuration jsonb;parent_link boolean;BEGIN
 IF NOT erp_private.f12_review_visible(p_kind,p_employee)THEN RAISE EXCEPTION 'Current complete source authority required' USING ERRCODE='42501';END IF;
 relation:=CASE p_kind WHEN'identity-document'THEN'employee_identity_documents'WHEN'medical-insurance'THEN'employee_medical_insurances'WHEN'medical-record'THEN'employee_medical_records'WHEN'access-card'THEN'employee_access_cards'WHEN'training-certificate'THEN'employee_training_certificates'WHEN'dependent'THEN'employee_dependents'WHEN'role-requirement'THEN'employee_role_requirements'WHEN'pro-process'THEN'employee_pro_processes'WHEN'assignment'THEN'employee_assignments'WHEN'asset'THEN'employee_assets'WHEN'ppe'THEN'employee_ppe_issues'WHEN'accommodation'THEN'employee_accommodation_records'WHEN'leave-balance'THEN'employee_leave_balances'END;
 IF relation IS NULL THEN RAISE EXCEPTION 'Unsupported source kind' USING ERRCODE='22023';END IF;
 -- Dependent medical columns have separate column privileges: do not SELECT
 -- them first and strip them afterwards. Only existing readable fields enter.
 IF p_kind='dependent'THEN SELECT string_agg(format('s.%I',a.attname),','ORDER BY a.attnum)INTO projection FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.employee_dependents'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attname<>ALL(ARRAY['is_covered_on_medical','medical_insurance_provider','medical_insurance_policy','medical_insurance_card','medical_insurance_expiry']);END IF;
 EXECUTE format('SELECT to_jsonb(x)FROM(SELECT %s FROM public.%I s WHERE s.id=$1 AND s.employee_id=$2 AND %s)x',projection,relation,CASE WHEN p_kind='leave-balance'THEN'true'ELSE's.deleted_at IS NULL'END)INTO row USING p_source,p_employee;
 IF row IS NULL THEN RAISE EXCEPTION 'Original source unavailable' USING ERRCODE='42501';END IF;
 IF p_document IS NULL AND p_kind=ANY(ARRAY['identity-document','medical-insurance','medical-record','access-card','training-certificate','dependent'])THEN p_document:=(row->>'dms_document_id')::bigint;END IF;
 SELECT id,owner_company_id,branch_id,employee_category_id,designation_id,primary_work_site_id,workspace_revision,joining_date INTO e.id,e.owner_company_id,e.branch_id,e.employee_category_id,e.designation_id,e.primary_work_site_id,e.workspace_revision,e.joining_date FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;IF NOT FOUND THEN RAISE EXCEPTION 'Subject unavailable' USING ERRCODE='42501';END IF;
 -- Dependent identity review deliberately excludes separately protected medical fields.
 IF p_kind='dependent'THEN row:=row-ARRAY['is_covered_on_medical','medical_insurance_provider','medical_insurance_policy','medical_insurance_card','medical_insurance_expiry'];END IF;
 IF p_document IS NOT NULL THEN
  SELECT id,current_version_id,owning_company_id,owning_branch_id,updated_at,expiry_date,issue_date INTO d.id,d.current_version_id,d.owning_company_id,d.owning_branch_id,d.updated_at,d.expiry_date,d.issue_date FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL AND NOT is_archived;
  parent_link:=EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=p_document AND l.deleted_at IS NULL AND CASE WHEN p_kind='dependent'THEN l.entity_type='employee_dependent'AND l.entity_id=p_source ELSE l.entity_type='employee'AND l.entity_id=p_employee END);
  IF d.id IS NULL OR d.current_version_id IS NULL OR d.owning_company_id IS DISTINCT FROM e.owner_company_id OR(d.owning_branch_id IS NOT NULL AND d.owning_branch_id IS DISTINCT FROM e.branch_id)OR NOT parent_link OR NOT erp_private.document_permission(d.id,'dms.documents.view')OR NOT erp_private.document_permission(d.id,'dms.documents.preview')OR NOT EXISTS(SELECT 1 FROM public.dms_document_versions v JOIN public.dms_document_files f ON f.version_id=v.id AND f.document_id=v.document_id WHERE v.id=d.current_version_id AND v.document_id=d.id AND v.unlinked_at IS NULL AND f.deleted_at IS NULL AND f.file_role='original' AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$')THEN RAISE EXCEPTION 'Exact permitted subject/version evidence required' USING ERRCODE='42501';END IF;
  IF p_kind=ANY(ARRAY['identity-document','access-card','training-certificate','medical-insurance','medical-record','dependent'])AND(row->>'dms_document_id')::bigint IS DISTINCT FROM d.id THEN RAISE EXCEPTION 'Evidence does not belong to this exact source' USING ERRCODE='23514';END IF;
 END IF;
 IF p_rule IS NOT NULL THEN
  IF NOT public.current_user_can_view_hr_settings()THEN RAISE EXCEPTION 'Rule configuration unavailable' USING ERRCODE='42501';END IF;
  SELECT *INTO rule FROM public.hr_readiness_rule_templates WHERE id=p_rule AND is_active AND deleted_at IS NULL;
  IF rule.id IS NULL OR(rule.applies_to_category_id IS NOT NULL AND rule.applies_to_category_id IS DISTINCT FROM e.employee_category_id)OR(rule.applies_to_designation_id IS NOT NULL AND rule.applies_to_designation_id IS DISTINCT FROM e.designation_id)OR(rule.applies_to_work_site_id IS NOT NULL AND rule.applies_to_work_site_id IS DISTINCT FROM e.primary_work_site_id)THEN RAISE EXCEPTION 'Current applicable rule required' USING ERRCODE='23514';END IF;
  IF p_kind='role-requirement'AND(row->>'requirement_source'IS DISTINCT FROM'readiness_rule'OR(row->>'required_reference_id')::bigint IS DISTINCT FROM rule.id OR CASE row->>'requirement_type'WHEN'document'THEN'identity_document'WHEN'medical'THEN'medical_record'ELSE row->>'requirement_type'END IS DISTINCT FROM rule.requirement_type)THEN RAISE EXCEPTION 'Exact configured requirement/rule link required; no inferred exemptions' USING ERRCODE='23514';END IF;
 END IF;
 IF p_kind='assignment'AND row->>'work_site_id'IS NOT NULL THEN configuration:=erp_private.f11_readiness_sources(p_employee,(row->>'work_site_id')::bigint);END IF;
 IF p_kind='leave-balance'THEN configuration:=(SELECT to_jsonb(t)FROM public.hr_leave_types t WHERE id=(row->>'leave_type_id')::bigint AND deleted_at IS NULL);END IF;
 RETURN jsonb_build_object('employee_id',p_employee,'source_kind',p_kind,'source_id',p_source,'revision',row->>'workspace_revision','document_id',d.id,'version_id',d.current_version_id,'rule',to_jsonb(rule),'source',row,'configuration',configuration,'employee_revision',e.workspace_revision,'joining_date',e.joining_date,'document_updated',d.updated_at,'document_expiry',d.expiry_date,'document_issue',d.issue_date,'evidence_files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'version_id',f.version_id,'bytes',f.file_size_bytes,'hash',f.sha256_hash,'integrity',f.integrity_status)ORDER BY f.id)FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=d.current_version_id AND f.deleted_at IS NULL AND f.file_role='original'),'[]'));
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_workforce_source(text,bigint,bigint,bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_workforce_source(text,bigint,bigint,bigint,bigint)TO authenticated;

CREATE FUNCTION public.f12_workforce_opening(p_kind text,p_employee bigint,p_source bigint,p_document bigint DEFAULT NULL,p_rule bigint DEFAULT NULL)RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH s AS(SELECT erp_private.f12_workforce_source(p_kind,p_employee,p_source,p_document,p_rule)v)
 SELECT jsonb_build_object('employee_id',p_employee,'source_kind',p_kind,'source_id',p_source,'revision',v->>'revision','fingerprint',encode(sha256(convert_to(v::text,'UTF8')),'hex'),'document_id',v->'document_id','version_id',v->'version_id','rule_id',p_rule,'label',coalesce(v#>>'{source,requirement_name}',v#>>'{source,process_title}',p_kind||' #'||p_source),'state',coalesce(v#>>'{source,status}',v#>>'{source,assignment_status}',v#>>'{source,process_status}'))FROM s;
$$;
REVOKE ALL ON FUNCTION public.f12_workforce_opening(text,bigint,bigint,bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.f12_workforce_opening(text,bigint,bigint,bigint,bigint)TO authenticated;

CREATE FUNCTION erp_private.f12_workforce_commit(p_request jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee bigint:=(p_request->>'employee_id')::bigint;kind text:=p_request->>'source_kind';subject_source_id bigint:=(p_request->>'source_id')::bigint;op uuid:=(p_request->>'operation_id')::uuid;action text:=p_request->>'action';data jsonb:=p_request->'data';actor bigint:=public.current_user_profile_id();old erp_private.f12_workforce_reviews;prior erp_private.f12_workforce_receipts;snapshot jsonb;digest text;result jsonb;review_id bigint;reviewer bigint;responsible bigint;from_day date;until_day date;reason text:=btrim(p_request->>'reason');medical boolean;BEGIN
 IF NOT erp_private.f12_review_authorized(kind,employee)THEN RAISE EXCEPTION 'Current workforce review authority required' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_request)IS DISTINCT FROM'object'OR octet_length(p_request::text)>32768 OR op IS NULL OR employee NOT BETWEEN 1 AND 9007199254740991 OR subject_source_id NOT BETWEEN 1 AND 9007199254740991 OR action IS NULL OR action NOT IN('verify','request','approve','reject','revoke','withdraw')OR reason IS NULL OR length(reason)NOT BETWEEN 1 AND 2000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request)k WHERE k<>ALL(ARRAY['employee_id','source_kind','source_id','operation_id','action','reason','fingerprint','data','review_id','review_revision']))THEN RAISE EXCEPTION 'Invalid original review operation' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));PERFORM 1 FROM public.employees WHERE id=employee AND deleted_at IS NULL FOR UPDATE;
 PERFORM 1 FROM public.user_profiles WHERE id=actor FOR SHARE;PERFORM 1 FROM public.user_roles u WHERE u.user_profile_id=actor ORDER BY u.id FOR SHARE;
 -- Keep the actual current authority and original session stable until the
 -- mandatory proof/event/audit/receipt commit. Profile locks alone do not
 -- serialize logout or permission revocation. Roles precede permission rows,
 -- matching role-administration's role-before-permission update order.
 PERFORM 1 FROM public.roles r WHERE r.id IN(SELECT u.role_id FROM public.user_roles u WHERE u.user_profile_id=actor)ORDER BY r.id FOR SHARE;
 PERFORM 1 FROM public.role_permissions rp WHERE rp.role_id IN(SELECT u.role_id FROM public.user_roles u WHERE u.user_profile_id=actor)ORDER BY rp.role_id,rp.permission_id FOR SHARE;
 PERFORM 1 FROM public.permissions p WHERE p.id IN(SELECT rp.permission_id FROM public.role_permissions rp JOIN public.user_roles u ON u.role_id=rp.role_id WHERE u.user_profile_id=actor)ORDER BY p.id FOR SHARE;
 PERFORM 1 FROM auth.sessions s WHERE s.user_id=auth.uid()AND s.id=(auth.jwt()->>'session_id')::uuid FOR SHARE;
 IF NOT erp_private.f12_review_authorized(kind,employee)THEN RAISE EXCEPTION 'Workforce authority or original session changed before admission' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('f12-review:'||employee||':'||kind||':'||subject_source_id,0));PERFORM pg_advisory_xact_lock(hashtextextended('f12-review-op:'||auth.uid()||':'||op,0));
 digest:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');SELECT *INTO prior FROM erp_private.f12_workforce_receipts r WHERE r.actor=auth.uid()AND r.operation_id=op;
 IF FOUND THEN IF prior.request_hash<>digest THEN RAISE EXCEPTION 'Original review operation changed' USING ERRCODE='22023';END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 IF action='verify'THEN
  IF kind<>ALL(ARRAY['identity-document','medical-insurance','medical-record','access-card','training-certificate','dependent'])OR p_request->>'review_id'IS NOT NULL OR p_request->>'review_revision'IS NOT NULL OR jsonb_typeof(data)IS DISTINCT FROM'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(data)k WHERE k<>ALL(ARRAY['document_id','version_id']))THEN RAISE EXCEPTION 'Exact ordinary verification fields required' USING ERRCODE='22023';END IF;
  snapshot:=erp_private.f12_workforce_source(kind,employee,subject_source_id,(data->>'document_id')::bigint,NULL);
  IF snapshot->>'document_id'IS NULL OR snapshot->>'version_id'IS DISTINCT FROM data->>'version_id'OR encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')IS DISTINCT FROM p_request->>'fingerprint'THEN RAISE EXCEPTION 'Original evidence version changed' USING ERRCODE='PT409';END IF;
  IF kind=ANY(ARRAY['identity-document','medical-insurance','training-certificate'])THEN
   PERFORM public.f11_mutate_compliance_child(kind,employee,subject_source_id,(snapshot->>'revision')::bigint,op,'verify','{}'::jsonb);
   snapshot:=erp_private.f12_workforce_source(kind,employee,subject_source_id,(data->>'document_id')::bigint,NULL);
  END IF;
  INSERT INTO erp_private.f12_evidence_verifications(employee_id,source_kind,source_id,source_hash,document_id,version_id,actor,operation_id,reason)VALUES(employee,kind,subject_source_id,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),(snapshot->>'document_id')::bigint,(snapshot->>'version_id')::bigint,auth.uid(),op,reason)ON CONFLICT ON CONSTRAINT f12_evidence_operation DO NOTHING RETURNING id INTO review_id;
  IF review_id IS NULL THEN SELECT v.id INTO review_id FROM erp_private.f12_evidence_verifications v WHERE v.actor=auth.uid()AND v.operation_id=op AND v.employee_id=employee AND v.source_kind=kind AND v.source_id=subject_source_id AND v.source_hash=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');IF NOT FOUND THEN RAISE EXCEPTION 'Verification identity mismatch' USING ERRCODE='PT409';END IF;END IF;
  INSERT INTO erp_private.f12_workforce_events(review_id,entity_type,actor,operation_id,action,reason)VALUES(review_id,'evidence',auth.uid(),op,'verify',reason);
  INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)VALUES(actor,'HR','f12_evidence_verification',review_id,'verify',jsonb_build_object('employee_id',employee,'source_kind',kind,'source_id',subject_source_id,'version_id',snapshot->'version_id','operation_id',op));
  result:=jsonb_build_object('employee_id',employee,'source_kind',kind,'source_id',subject_source_id,'review_id',review_id,'revision','1','status','verified','operation_id',op,'replayed',false);
  INSERT INTO erp_private.f12_workforce_receipts VALUES(auth.uid(),op,digest,result,clock_timestamp());RETURN result;
 END IF;
 IF kind NOT IN('role-requirement','assignment')THEN RAISE EXCEPTION 'Ordinary evidence uses single authorized version verification' USING ERRCODE='22023';END IF;
 IF action='request'THEN
  IF p_request->>'review_id'IS NOT NULL OR p_request->>'review_revision'IS NOT NULL OR jsonb_typeof(data)IS DISTINCT FROM'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(data)k WHERE k<>ALL(ARRAY['purpose','document_id','version_id','rule_id','reviewer_id','responsible_id','valid_from','valid_until','period_start','period_end']))THEN RAISE EXCEPTION 'Invalid reviewed request fields' USING ERRCODE='22023';END IF;
  reviewer:=(data->>'reviewer_id')::bigint;responsible:=(data->>'responsible_id')::bigint;from_day:=(data->>'valid_from')::date;until_day:=(data->>'valid_until')::date;
  IF data->>'purpose'IS NULL OR data->>'purpose'<>(CASE kind WHEN'role-requirement'THEN'waiver'WHEN'pro-process'THEN'renewal'WHEN'assignment'THEN'deployment'WHEN'leave-balance'THEN'period'WHEN'asset'THEN'custody'WHEN'ppe'THEN'custody'WHEN'accommodation'THEN'custody'ELSE'evidence'END) OR reviewer IS NULL OR reviewer=actor OR from_day IS NULL OR until_day IS NULL OR until_day<from_day OR from_day<(now()AT TIME ZONE'Asia/Dubai')::date THEN RAISE EXCEPTION 'Independent reviewer and explicit current review period required' USING ERRCODE='23514';END IF;
  snapshot:=erp_private.f12_workforce_source(kind,employee,subject_source_id,(data->>'document_id')::bigint,(data->>'rule_id')::bigint);
  medical:=kind IN('medical-insurance','medical-record')OR snapshot#>>'{source,requirement_type}'='medical';
  IF NOT erp_private.f12_review_person(reviewer,kind,employee,medical)OR medical AND NOT erp_private.employee_permission(employee,'hr.medical.manage')THEN RAISE EXCEPTION 'Verified currently authorized independent reviewer required' USING ERRCODE='42501';END IF;
  IF responsible IS NOT NULL AND NOT erp_private.f12_review_person(responsible,kind,employee,medical)THEN RAISE EXCEPTION 'Responsible person cannot be inferred or borrowed from another scope' USING ERRCODE='42501';END IF;
  IF snapshot->>'document_id'IS NULL OR snapshot->>'version_id'IS DISTINCT FROM data->>'version_id'OR encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')IS DISTINCT FROM p_request->>'fingerprint'THEN RAISE EXCEPTION 'Original subject/evidence/version changed or unavailable' USING ERRCODE='PT409';END IF;
  INSERT INTO erp_private.f12_workforce_reviews(employee_id,source_kind,source_id,source_hash,document_id,version_id,rule_id,purpose,requested_by,reviewer_id,responsible_id,medical_required,valid_from,valid_until,reason,data)VALUES(employee,kind,subject_source_id,p_request->>'fingerprint',(data->>'document_id')::bigint,(data->>'version_id')::bigint,(data->>'rule_id')::bigint,data->>'purpose',actor,reviewer,responsible,coalesce(medical,false),from_day,until_day,reason,data)RETURNING id INTO review_id;
 ELSE
  IF data IS DISTINCT FROM'{}'::jsonb THEN RAISE EXCEPTION 'Decision cannot alter original review fields' USING ERRCODE='22023';END IF;
  SELECT *INTO old FROM erp_private.f12_workforce_reviews r WHERE r.id=(p_request->>'review_id')::bigint AND r.employee_id=employee AND r.source_kind=kind AND r.source_id=subject_source_id FOR UPDATE;
  IF NOT FOUND OR old.revision IS DISTINCT FROM(p_request->>'review_revision')::bigint THEN RAISE EXCEPTION 'Original review revision changed' USING ERRCODE='PT409';END IF;
  IF action='withdraw'THEN
   IF old.status<>'pending'OR actor<>old.requested_by THEN RAISE EXCEPTION 'Only the current authorized requester may withdraw its pending proposal' USING ERRCODE='42501';END IF;
  ELSIF action='revoke'THEN
   IF old.status<>'approved'OR actor NOT IN(old.requested_by,old.reviewer_id)THEN RAISE EXCEPTION 'Current approved review owner required for revocation' USING ERRCODE='42501';END IF;
  ELSE
   IF old.status<>'pending'OR actor<>old.reviewer_id OR actor=old.requested_by THEN RAISE EXCEPTION 'Assigned independent reviewer required' USING ERRCODE='42501';END IF;
  END IF;
  IF action='approve'THEN snapshot:=erp_private.f12_workforce_source(kind,employee,subject_source_id,old.document_id,old.rule_id);END IF;
  medical:=old.medical_required OR kind IN('medical-insurance','medical-record');
  IF medical AND NOT erp_private.employee_permission(employee,'hr.medical.manage')THEN RAISE EXCEPTION 'Separate medical authority required' USING ERRCODE='42501';END IF;
  IF action='approve'THEN
   IF NOT erp_private.f12_review_person(actor,kind,employee,medical)OR old.source_hash IS DISTINCT FROM encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')OR old.source_hash IS DISTINCT FROM p_request->>'fingerprint'OR old.valid_from>(now()AT TIME ZONE'Asia/Dubai')::date OR old.valid_until<(now()AT TIME ZONE'Asia/Dubai')::date THEN RAISE EXCEPTION 'Current exact sources and review period required' USING ERRCODE='PT409';END IF;
   IF old.purpose='waiver'AND(NOT coalesce((snapshot#>>'{rule,waiver_allowed}')::boolean,false)OR snapshot#>>'{rule,id}'IS NULL OR snapshot#>>'{rule,requirement_type}'='medical_record')THEN RAISE EXCEPTION 'Unsupported exemption held; no medical fitness override' USING ERRCODE='23514';END IF;
   IF old.purpose IN('renewal','custody')AND(old.responsible_id IS NULL OR NOT erp_private.f12_review_person(old.responsible_id,kind,employee,medical))THEN RAISE EXCEPTION 'Current source-owner responsibility required; no stock clearance inferred' USING ERRCODE='23514';END IF;
   IF old.purpose='deployment'AND(snapshot#>>'{source,assignment_status}'IS DISTINCT FROM'planned'OR snapshot#>>'{source,work_site_id}'IS NULL OR erp_private.f11_calculate_readiness(snapshot->'configuration')->>'status'<>'ready')THEN RAISE EXCEPTION 'Planned assignment and complete current Ready evidence required' USING ERRCODE='23514';END IF;
  END IF;
  UPDATE erp_private.f12_workforce_reviews SET status=CASE action WHEN'approve'THEN'approved'WHEN'reject'THEN'rejected'WHEN'withdraw'THEN'withdrawn'ELSE'revoked'END,revision=revision+1,decided_at=clock_timestamp()WHERE id=old.id RETURNING id INTO review_id;
 END IF;
 INSERT INTO erp_private.f12_workforce_events(review_id,actor,operation_id,action,reason)VALUES(review_id,auth.uid(),op,action,reason);
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)VALUES(actor,'HR','f12_workforce_review',review_id,action,jsonb_build_object('employee_id',employee,'source_kind',kind,'source_id',subject_source_id,'operation_id',op));
 SELECT jsonb_build_object('employee_id',employee,'source_kind',kind,'source_id',subject_source_id,'review_id',r.id,'revision',r.revision::text,'status',r.status,'operation_id',op,'replayed',false)INTO result FROM erp_private.f12_workforce_reviews r WHERE r.id=review_id;
 INSERT INTO erp_private.f12_workforce_receipts VALUES(auth.uid(),op,digest,result,clock_timestamp());RETURN result;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_workforce_commit(jsonb)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_workforce_commit(jsonb)TO authenticated;
CREATE FUNCTION public.f12_workforce_mutate(p_request jsonb)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.f12_workforce_commit(p_request);$$;
REVOKE ALL ON FUNCTION public.f12_workforce_mutate(jsonb)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.f12_workforce_mutate(jsonb)TO authenticated;
CREATE FUNCTION erp_private.f12_workforce_reconcile(p_operation uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT r.result FROM erp_private.f12_workforce_receipts r WHERE r.actor=auth.uid()AND r.operation_id=p_operation AND erp_private.f12_review_authorized(r.result->>'source_kind',(r.result->>'employee_id')::bigint);$$;
REVOKE ALL ON FUNCTION erp_private.f12_workforce_reconcile(uuid)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_workforce_reconcile(uuid)TO authenticated;
CREATE FUNCTION public.f12_workforce_reconcile(p_operation uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.f12_workforce_reconcile(p_operation);$$;
REVOKE ALL ON FUNCTION public.f12_workforce_reconcile(uuid)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.f12_workforce_reconcile(uuid)TO authenticated;
CREATE FUNCTION erp_private.f12_verified_evidence(p_kind text,p_employee bigint,p_source bigint)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE review erp_private.f12_evidence_verifications;s jsonb;BEGIN
 IF p_kind<>ALL(ARRAY['identity-document','medical-record','medical-insurance','access-card','training-certificate','dependent'])OR NOT erp_private.f12_review_visible(p_kind,p_employee)THEN RETURN false;END IF;
 SELECT *INTO review FROM erp_private.f12_evidence_verifications r WHERE r.employee_id=p_employee AND r.source_kind=p_kind AND r.source_id=p_source ORDER BY r.id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN false;END IF;
 s:=erp_private.f12_workforce_source(p_kind,p_employee,p_source,review.document_id,NULL);RETURN review.source_hash=encode(sha256(convert_to(s::text,'UTF8')),'hex');
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN RETURN false;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_verified_evidence(text,bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_verified_evidence(text,bigint,bigint)TO authenticated;

-- Preserve existing single-person Verify entry points. F11's immutable command
-- admission/capture runs first; this only binds that authorized decision to the
-- exact current source/file version in the same transaction.
CREATE FUNCTION erp_private.f12_capture_evidence_verification()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE context jsonb:=nullif(current_setting('erp.f11_compliance_save',true),'')::jsonb;kind text:=TG_ARGV[0];s jsonb;BEGIN
 IF auth.uid()IS NULL OR context->>'action'IS DISTINCT FROM'verify'THEN RETURN NEW;END IF;
 IF NOT erp_private.f12_review_authorized(kind,NEW.employee_id)OR context->>'kind'IS DISTINCT FROM kind OR(context->>'id')::bigint IS DISTINCT FROM NEW.id OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id THEN RAISE EXCEPTION 'Original authorized verification required' USING ERRCODE='42501';END IF;
 s:=erp_private.f12_workforce_source(kind,NEW.employee_id,NEW.id,NEW.dms_document_id,NULL);
 IF s->>'document_id'IS NULL OR s->>'version_id'IS NULL THEN RAISE EXCEPTION 'Current source evidence required for verification' USING ERRCODE='23514';END IF;
 INSERT INTO erp_private.f12_evidence_verifications(employee_id,source_kind,source_id,source_hash,document_id,version_id,actor,operation_id,reason)VALUES(NEW.employee_id,kind,NEW.id,encode(sha256(convert_to(s::text,'UTF8')),'hex'),(s->>'document_id')::bigint,(s->>'version_id')::bigint,auth.uid(),(context->>'operation_id')::uuid,'Existing authorized evidence verification');RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_capture_evidence_verification()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_identity_verification AFTER UPDATE ON public.employee_identity_documents FOR EACH ROW EXECUTE FUNCTION erp_private.f12_capture_evidence_verification('identity-document');
CREATE TRIGGER f12_insurance_verification AFTER UPDATE ON public.employee_medical_insurances FOR EACH ROW EXECUTE FUNCTION erp_private.f12_capture_evidence_verification('medical-insurance');
CREATE TRIGGER f12_training_verification AFTER UPDATE ON public.employee_training_certificates FOR EACH ROW EXECUTE FUNCTION erp_private.f12_capture_evidence_verification('training-certificate');

CREATE FUNCTION erp_private.f12_readiness_rules(p_employee bigint,p_site bigint)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$DECLARE result jsonb;BEGIN
 IF NOT erp_private.f11_child_authorized('site-readiness',p_employee)OR NOT public.current_user_can_view_hr_settings()THEN RAISE EXCEPTION 'Complete rule configuration unavailable' USING ERRCODE='42501';END IF;
 WITH subject AS(SELECT employee_category_id,designation_id FROM public.employees WHERE id=p_employee),applicable AS(
 SELECT 'role:'||m.id key,m.is_required required,to_jsonb(m)matrix,to_jsonb(r)rule,(m.employee_category_id IS NULL AND m.designation_id IS NULL OR r.id IS NULL)unresolved FROM public.hr_role_requirement_matrix m LEFT JOIN public.hr_readiness_rule_templates r ON r.id=m.readiness_rule_template_id CROSS JOIN subject e WHERE m.is_active AND m.deleted_at IS NULL AND(m.employee_category_id IS NULL OR m.employee_category_id=e.employee_category_id)AND(m.designation_id IS NULL OR m.designation_id=e.designation_id)
 UNION ALL SELECT 'site:'||m.id,m.is_required,to_jsonb(m),to_jsonb(r),(m.work_site_id IS NULL)FROM public.hr_site_requirement_matrix m LEFT JOIN public.hr_readiness_rule_templates r ON r.id=m.readiness_rule_template_id WHERE m.is_active AND m.deleted_at IS NULL AND(m.work_site_id=p_site OR m.work_site_id IS NULL)
 UNION ALL SELECT 'rule:'||r.id,true,NULL,to_jsonb(r),false FROM public.hr_readiness_rule_templates r CROSS JOIN subject e WHERE r.is_active AND r.deleted_at IS NULL AND(r.applies_to_category_id IS NOT NULL OR r.applies_to_designation_id IS NOT NULL OR r.applies_to_work_site_id IS NOT NULL)AND(r.applies_to_category_id IS NULL OR r.applies_to_category_id=e.employee_category_id)AND(r.applies_to_designation_id IS NULL OR r.applies_to_designation_id=e.designation_id)AND(r.applies_to_work_site_id IS NULL OR r.applies_to_work_site_id=p_site))
 SELECT coalesce(jsonb_agg(to_jsonb(a)ORDER BY key),'[]')INTO result FROM applicable a;RETURN result;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_readiness_rules(bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_readiness_rules(bigint,bigint)TO authenticated;
DO $$DECLARE definition text;needle text;BEGIN
 definition:=pg_get_functiondef('erp_private.f11_readiness_sources(bigint,bigint)'::regprocedure);
 FOREACH needle IN ARRAY ARRAY['identity','medical','access']LOOP
  definition:=replace(definition,'erp_private.f12_readiness_evidence(p_employee,(s#>>''{'||needle||',dms_document_id}'')::bigint)',
    'erp_private.f12_verified_evidence('''||CASE needle WHEN'identity'THEN'identity-document'WHEN'medical'THEN'medical-record'ELSE'access-card'END||''',p_employee,(s#>>''{'||needle||',id}'')::bigint)');
 END LOOP;
 definition:=replace(definition,'erp_private.f12_readiness_evidence(p_employee,t.dms_document_id)','erp_private.f12_verified_evidence(''training-certificate'',p_employee,t.id)');
 needle:='RETURN s||jsonb_build_object(';IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized source composition';END IF;
 definition:=replace(definition,needle,needle||'''rules'',erp_private.f12_readiness_rules(p_employee,p_site),''config_reviewed'',true,');
 EXECUTE definition;
END$$;

-- A waiver is source-backed, dated and invalidated by any rule/source/version
-- change. It is not a medical fitness statement and never overrides a block.
CREATE FUNCTION erp_private.f12_current_waiver(p_employee bigint,p_source bigint)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE r erp_private.f12_workforce_reviews;s jsonb;BEGIN
 IF NOT erp_private.f12_review_visible('role-requirement',p_employee)THEN RETURN false;END IF;
 SELECT *INTO r FROM erp_private.f12_workforce_reviews WHERE employee_id=p_employee AND source_kind='role-requirement'AND source_id=p_source AND purpose='waiver'AND status IN('approved','revoked')ORDER BY id DESC LIMIT 1;
 IF NOT FOUND OR r.status<>'approved'OR r.valid_from>(now()AT TIME ZONE'Asia/Dubai')::date OR r.valid_until<(now()AT TIME ZONE'Asia/Dubai')::date THEN RETURN false;END IF;
 s:=erp_private.f12_workforce_source('role-requirement',p_employee,p_source,r.document_id,r.rule_id);
 RETURN coalesce((s#>>'{rule,waiver_allowed}')::boolean,false)AND s#>>'{rule,requirement_type}'<>'medical_record'AND r.source_hash=encode(sha256(convert_to(s::text,'UTF8')),'hex');
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN RETURN false;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_current_waiver(bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_current_waiver(bigint,bigint)TO authenticated;

ALTER FUNCTION erp_private.f11_readiness_sources(bigint,bigint)RENAME TO f12_readiness_sources_evidence;
CREATE FUNCTION erp_private.f12_requirement_met_current(p_employee bigint,p_source bigint)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE r public.employee_role_requirements;kind text;s jsonb;day date:=(now()AT TIME ZONE'Asia/Dubai')::date;BEGIN
 IF NOT erp_private.f12_review_visible('role-requirement',p_employee)THEN RETURN false;END IF;
 SELECT *INTO r FROM public.employee_role_requirements WHERE id=p_source AND employee_id=p_employee AND deleted_at IS NULL;IF NOT FOUND OR r.met_record_id IS NULL OR r.status<>'met'OR NOT r.is_met THEN RETURN false;END IF;
 kind:=CASE WHEN r.requirement_type='document'AND r.met_record_type IN('identity-document','employee_identity_documents')THEN'identity-document'WHEN r.requirement_type='training'AND r.met_record_type IN('training-certificate','employee_training_certificates')THEN'training-certificate'WHEN r.requirement_type='access_card'AND r.met_record_type IN('access-card','employee_access_cards')THEN'access-card'WHEN r.requirement_type='medical'AND r.met_record_type IN('medical-record','employee_medical_records')THEN'medical-record'END;
 IF kind IS NULL OR NOT erp_private.f12_verified_evidence(kind,p_employee,r.met_record_id)THEN RETURN false;END IF;
 s:=erp_private.f12_workforce_source(kind,p_employee,r.met_record_id,NULL,NULL)->'source';
 IF kind='medical-record'THEN RETURN(s->>'examination_date')::date<=day AND(s->>'next_examination_date')::date>=day AND s->>'result'='fit'AND coalesce((s->>'fit_for_work')::boolean,false)AND NOT coalesce((s->>'work_restrictions')::boolean,true);END IF;
 IF(s->>'expiry_date')IS NULL OR(s->>'expiry_date')::date<day THEN RETURN false;END IF;
 IF kind='training-certificate'THEN RETURN(s->>'completion_date')::date<=day AND s->>'verification_status'='verified'AND s->>'status'='valid';END IF;
 RETURN(s->>'issue_date')::date<=day AND s->>'status'='active'AND(kind='access-card'OR s->>'verification_status'='verified');
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN RETURN false;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_requirement_met_current(bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_requirement_met_current(bigint,bigint)TO authenticated;
CREATE FUNCTION erp_private.f11_readiness_sources(p_employee bigint,p_site bigint)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$DECLARE s jsonb;item jsonb;day date:=(now()AT TIME ZONE'Asia/Dubai')::date;BEGIN
 s:=erp_private.f12_readiness_sources_evidence(p_employee,p_site);
 s:=s||jsonb_build_object('eligibility_reviewed',true,
 'employee_current',EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee AND e.deleted_at IS NULL AND e.joining_date<=day AND(e.inactive_date IS NULL OR e.inactive_date>day)AND(e.employee_status IN('active','probation','on_leave')OR e.inactive_date>day)),
 'site_current',EXISTS(SELECT 1 FROM public.work_sites w WHERE w.id=p_site AND w.deleted_at IS NULL AND w.status='active'AND(w.opening_date IS NULL OR w.opening_date<=day)AND(w.closing_date IS NULL OR w.closing_date>=day)),
 'identity_sources',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('evidence_current',erp_private.f12_verified_evidence('identity-document',p_employee,t.id))ORDER BY t.id)FROM public.employee_identity_documents t WHERE t.employee_id=p_employee AND t.deleted_at IS NULL),'[]'),
 'medical_sources',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('evidence_current',erp_private.f12_verified_evidence('medical-record',p_employee,t.id))ORDER BY t.id)FROM public.employee_medical_records t WHERE t.employee_id=p_employee AND t.deleted_at IS NULL),'[]'),
 'access_sources',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('evidence_current',erp_private.f12_verified_evidence('access-card',p_employee,t.id))ORDER BY t.id)FROM public.employee_access_cards t WHERE t.employee_id=p_employee AND t.deleted_at IS NULL),'[]'),
 'insurance_sources',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('evidence_current',erp_private.f12_verified_evidence('medical-insurance',p_employee,t.id))ORDER BY t.id)FROM public.employee_medical_insurances t WHERE t.employee_id=p_employee AND t.deleted_at IS NULL),'[]'),
 'requirements',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('waiver_current',erp_private.f12_current_waiver(p_employee,t.id),'met_current',erp_private.f12_requirement_met_current(p_employee,t.id))ORDER BY t.id)FROM public.employee_role_requirements t WHERE t.employee_id=p_employee AND t.deleted_at IS NULL),'[]'));
 SELECT value INTO item FROM jsonb_array_elements(s->'identity_sources')WHERE value->>'status'='active'AND value->>'verification_status'='verified'AND coalesce((value->>'evidence_current')::boolean,false)AND(value->>'issue_date')::date<=(s->>'day')::date AND(value->>'expiry_date')::date>=(s->>'day')::date ORDER BY(value->>'issue_date')::date DESC,(value->>'id')::bigint DESC LIMIT 1;
 IF item IS NOT NULL THEN s:=s||jsonb_build_object('identity',item,'identity_current',item->'evidence_current');END IF;
 -- The most recent effective examination wins, even when restricted/unfit.
 -- Never select an older Fit result merely because the current result blocks.
 SELECT value INTO item FROM jsonb_array_elements(s->'medical_sources')WHERE(value->>'examination_date')::date<=(s->>'day')::date ORDER BY(value->>'examination_date')::date DESC,(value->>'id')::bigint DESC LIMIT 1;
 IF item IS NOT NULL THEN s:=s||jsonb_build_object('medical',item,'medical_current',item->'evidence_current');END IF;RETURN s;
END$$;
REVOKE ALL ON FUNCTION erp_private.f11_readiness_sources(bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f11_readiness_sources(bigint,bigint)TO authenticated;

ALTER FUNCTION erp_private.f11_calculate_readiness(jsonb)RENAME TO f12_calculate_readiness_source_guards;
CREATE FUNCTION erp_private.f11_calculate_readiness(s jsonb)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$DECLARE corrected jsonb:=s;r jsonb;missing jsonb;entry jsonb;rule jsonb;matrix jsonb;req jsonb;candidate jsonb;kind text;items jsonb;field text;wanted text;valid boolean;waived boolean;critical boolean;day date:=(s->>'day')::date;buffer integer;expiry date;BEGIN
 IF day IS NULL THEN RETURN jsonb_build_object('status','not_ready','missing',jsonb_build_array(jsonb_build_object('code','EFFECTIVE_DATE_UNAVAILABLE','label','Current effective date unavailable','category','other','severity','critical')));END IF;
 -- Only a current independently reviewed exception may satisfy an exact
 -- linked requirement. Legacy status strings alone remain held.
 corrected:=jsonb_set(corrected,'{requirements}',coalesce((SELECT jsonb_agg(CASE WHEN coalesce((x->>'waiver_current')::boolean,false)THEN x||jsonb_build_object('status','met','is_met',true,'met_record_id',x->'id','met_record_type','dated_review','expiry_date',NULL)WHEN x->>'status'='met'AND NOT coalesce((x->>'met_current')::boolean,false)THEN x||jsonb_build_object('status','missing','is_met',false)ELSE x END)FROM jsonb_array_elements(coalesce(s->'requirements','[]'))x),'[]'));
 r:=erp_private.f12_calculate_readiness_source_guards(corrected);IF r->>'status'='blocked'THEN RETURN r;END IF;missing:=r->'missing';
 IF s->>'eligibility_reviewed'IS DISTINCT FROM'true'OR s->>'employee_current'IS DISTINCT FROM'true'OR s->>'site_current'IS DISTINCT FROM'true'THEN missing:=missing||jsonb_build_object('code','CURRENT_ELIGIBILITY_REVIEW','label','Current employment and site-date eligibility must be verified','category','assignment','severity','critical');END IF;
 IF s#>>'{identity,status}'IS DISTINCT FROM'active'THEN missing:=missing||jsonb_build_object('code','IDENTITY_STATUS_REVIEW','label','Active identity evidence required','category','document','severity','critical');END IF;
 IF s#>>'{medical,examination_date}'IS NULL OR s#>>'{medical,result}'IS DISTINCT FROM'fit'OR NOT coalesce((s#>>'{medical,fit_for_work}')::boolean,false)OR coalesce((s#>>'{medical,work_restrictions}')::boolean,true)THEN missing:=missing||jsonb_build_object('code','MEDICAL_DECISION_REVIEW','label','Current authorized medical decision is incomplete or restricted','category','medical','severity','warning');END IF;
 IF s#>>'{readiness,required_access_card_type_id}'IS NOT NULL AND(s#>>'{access,status}'IS DISTINCT FROM'active'OR s#>>'{access,issue_date}'IS NULL OR(s#>>'{access,issue_date}')::date>day)THEN missing:=missing||jsonb_build_object('code','ACCESS_VALIDITY_REVIEW','label','Active date-valid site access evidence required','category','access_card','severity','critical');END IF;
 IF s->>'config_reviewed'IS DISTINCT FROM'true'THEN missing:=missing||jsonb_build_object('code','RULE_CONFIGURATION_REVIEW','label','Complete current rule configuration needs authorized review','category','other','severity','critical');END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(s->'rules','[]'))LOOP
  IF NOT coalesce((entry->>'required')::boolean,true)THEN CONTINUE;END IF;
  rule:=entry->'rule';matrix:=entry->'matrix';kind:=NULL;critical:=coalesce((rule->>'is_critical')::boolean,true);valid:=false;waived:=false;buffer:=coalesce((rule->>'expiry_buffer_days')::integer,0);
  IF NOT coalesce((entry->>'unresolved')::boolean,false)AND(rule IS NULL OR rule='null'::jsonb OR coalesce((rule->>'is_active')::boolean,false)AND rule->>'deleted_at'IS NULL)THEN
   kind:=coalesce(rule->>'requirement_type',CASE WHEN matrix->>'access_card_type_id'IS NOT NULL THEN'access_card'WHEN matrix->>'training_type_id'IS NOT NULL THEN'training'WHEN matrix->>'medical_record_type_id'IS NOT NULL THEN'medical_record'END);
   items:=CASE kind WHEN'identity_document'THEN s->'identity_sources'WHEN'medical_record'THEN s->'medical_sources'WHEN'access_card'THEN s->'access_sources'WHEN'training'THEN s->'training'WHEN'insurance'THEN s->'insurance_sources'ELSE'[]'::jsonb END;
   field:=CASE kind WHEN'identity_document'THEN'document_type_id'WHEN'medical_record'THEN'medical_record_type_id'WHEN'access_card'THEN'access_type_id'WHEN'training'THEN'training_type_id'END;
   wanted:=CASE kind WHEN'identity_document'THEN rule->>'required_document_type_id'WHEN'medical_record'THEN coalesce(rule->>'required_medical_record_type_id',matrix->>'medical_record_type_id')WHEN'access_card'THEN coalesce(rule->>'required_access_card_type_id',matrix->>'access_card_type_id')WHEN'training'THEN coalesce(rule->>'required_training_type_id',matrix->>'training_type_id')WHEN'insurance'THEN'*'END;
   IF wanted IS NOT NULL THEN
    FOR candidate IN SELECT value FROM jsonb_array_elements(coalesce(items,'[]'))LOOP
     expiry:=CASE WHEN kind='medical_record'THEN(candidate->>'next_examination_date')::date ELSE(candidate->>'expiry_date')::date END;
     IF(kind='insurance'OR candidate->>field=wanted)AND coalesce((candidate->>'evidence_current')::boolean,false)AND expiry IS NOT NULL AND expiry>=day+greatest(buffer,0)THEN
      IF kind='medical_record'THEN valid:=(candidate->>'examination_date')::date<=day AND coalesce((candidate->>'fit_for_work')::boolean,false)AND candidate->>'result'='fit'AND NOT coalesce((candidate->>'work_restrictions')::boolean,true);
      ELSIF kind='training'THEN valid:=(candidate->>'completion_date')::date<=day AND candidate->>'verification_status'='verified'AND candidate->>'status'='valid';
      ELSIF kind='access_card'THEN valid:=(candidate->>'issue_date')::date<=day AND candidate->>'status'='active';
      ELSE valid:=(candidate->>'issue_date')::date<=day AND candidate->>'verification_status'='verified'AND candidate->>'status'='active'AND(kind<>'insurance'OR coalesce((candidate->>'employee_covered')::boolean,false));END IF;
     END IF;IF coalesce(valid,false)THEN EXIT;END IF;
    END LOOP;
   END IF;
   IF rule->>'id'IS NOT NULL AND kind<>'medical_record'AND coalesce((rule->>'waiver_allowed')::boolean,false)THEN SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s->'requirements','[]'))q WHERE q->>'requirement_source'='readiness_rule'AND q->>'required_reference_id'=rule->>'id'AND coalesce((q->>'waiver_current')::boolean,false))INTO waived;END IF;
  END IF;
  IF NOT coalesce(valid,false)AND NOT waived THEN missing:=missing||jsonb_build_object('code','CONFIGURED_REQUIREMENT_REVIEW','label','Configured requirement '||coalesce(rule->>'rule_name_en',entry->>'key','unknown')||' needs current typed evidence or supported independent review','category',CASE WHEN kind='medical_record'THEN'medical'WHEN kind='training'THEN'training'WHEN kind='access_card'THEN'access_card'ELSE'document'END,'severity',CASE WHEN critical THEN'critical'ELSE'warning'END,'rule_key',entry->>'key');END IF;
 END LOOP;
 RETURN jsonb_build_object('status',CASE WHEN r->>'status'='expired'THEN'expired'WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(missing)m WHERE m->>'severity'='critical')THEN'not_ready'WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(missing)m WHERE m->>'severity'='warning')THEN'needs_review'ELSE'ready'END,'missing',missing);
END$$;
REVOKE ALL ON FUNCTION erp_private.f11_calculate_readiness(jsonb)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f11_calculate_readiness(jsonb)TO authenticated;

CREATE FUNCTION erp_private.f12_workforce_list(p_employee bigint,p_kind text,p_after bigint)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),'[]')FROM(SELECT r.id,r.source_id,r.source_kind,r.purpose,r.status,r.revision::text,r.source_hash fingerprint,r.document_id,r.version_id,r.rule_id,r.requested_by,r.reviewer_id,r.responsible_id,r.valid_from,r.valid_until,r.created_at FROM erp_private.f12_workforce_reviews r WHERE r.employee_id=p_employee AND r.source_kind=p_kind AND r.id>p_after AND erp_private.f12_review_visible(r.source_kind,r.employee_id)AND(NOT r.medical_required OR erp_private.employee_permission(r.employee_id,'hr.medical.view'))ORDER BY r.id LIMIT 26)x;
$$;
REVOKE ALL ON FUNCTION erp_private.f12_workforce_list(bigint,text,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_workforce_list(bigint,text,bigint)TO authenticated;
CREATE FUNCTION public.f12_workforce_list(p_employee bigint,p_kind text,p_after bigint DEFAULT 0)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$BEGIN IF NOT erp_private.f12_review_visible(p_kind,p_employee)THEN RAISE EXCEPTION 'Current review authority required' USING ERRCODE='42501';END IF;IF p_after IS NULL OR p_after<0 THEN RAISE EXCEPTION 'Invalid review cursor' USING ERRCODE='22023';END IF;RETURN erp_private.f12_workforce_list(p_employee,p_kind,p_after);END$$;
REVOKE ALL ON FUNCTION public.f12_workforce_list(bigint,text,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.f12_workforce_list(bigint,text,bigint)TO authenticated;

-- Bounded typed choices: a label never confers permission or chooses a person.
CREATE FUNCTION erp_private.f12_workforce_choices(p_employee bigint,p_kind text,p_source bigint,p_choice text,p_search text,p_after bigint)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE s jsonb;medical boolean;result jsonb;BEGIN
 IF NOT erp_private.f12_review_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current review authority required' USING ERRCODE='42501';END IF;
 IF p_choice IS NULL OR p_choice NOT IN('document','rule','reviewer','responsible')OR p_search IS NULL OR length(p_search)>100 OR p_after IS NULL OR p_after<0 THEN RAISE EXCEPTION 'Invalid review choice' USING ERRCODE='22023';END IF;
 s:=erp_private.f12_workforce_source(p_kind,p_employee,p_source,NULL,NULL);medical:=p_kind IN('medical-insurance','medical-record')OR coalesce(s#>>'{source,requirement_type}'='medical',false);
 IF p_choice IN('reviewer','responsible')THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),'[]')INTO result FROM(SELECT p.id,coalesce(nullif(p.display_name,''),nullif(p.full_name,''),'User #'||p.id)label FROM public.user_profiles p WHERE p.id>p_after AND(p_choice<>'reviewer'OR p.id<>public.current_user_profile_id())AND erp_private.f12_review_person(p.id,p_kind,p_employee,medical)AND position(lower(p_search)IN lower(coalesce(p.display_name,'')||' '||coalesce(p.full_name,'')||' #'||p.id))>0 ORDER BY p.id LIMIT 26)x;
 ELSIF p_choice='document'THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),'[]')INTO result FROM(SELECT d.id,d.document_no||' — '||d.title label FROM public.dms_documents d JOIN public.employees e ON e.id=p_employee WHERE d.id>p_after AND d.deleted_at IS NULL AND NOT d.is_archived AND d.current_version_id IS NOT NULL AND d.owning_company_id=e.owner_company_id AND(d.owning_branch_id IS NULL OR d.owning_branch_id=e.branch_id)AND erp_private.document_permission(d.id,'dms.documents.view')AND erp_private.document_permission(d.id,'dms.documents.preview')AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL AND CASE WHEN p_kind='dependent'THEN l.entity_type='employee_dependent'AND l.entity_id=p_source ELSE l.entity_type='employee'AND l.entity_id=p_employee END)AND(p_kind<>ALL(ARRAY['identity-document','medical-insurance','medical-record','training-certificate','access-card','dependent'])OR d.id=(s#>>'{source,dms_document_id}')::bigint)AND position(lower(p_search)IN lower(d.document_no||' '||d.title))>0 ORDER BY d.id LIMIT 26)x;
 ELSE
  IF p_kind<>'role-requirement'OR NOT public.current_user_can_view_hr_settings()THEN RAISE EXCEPTION 'Current requirement-rule authority required' USING ERRCODE='42501';END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),'[]')INTO result FROM(SELECT r.id,r.rule_code||' — '||r.rule_name_en label FROM public.hr_readiness_rule_templates r WHERE r.id>p_after AND r.is_active AND r.deleted_at IS NULL AND r.waiver_allowed AND r.requirement_type<>'medical_record'AND s#>>'{source,requirement_source}'='readiness_rule'AND r.id=(s#>>'{source,required_reference_id}')::bigint AND position(lower(p_search)IN lower(r.rule_code||' '||r.rule_name_en))>0 ORDER BY r.id LIMIT 26)x;
 END IF;RETURN result;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_workforce_choices(bigint,text,bigint,text,text,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_workforce_choices(bigint,text,bigint,text,text,bigint)TO authenticated;
CREATE FUNCTION public.f12_workforce_choices(p_employee bigint,p_kind text,p_source bigint,p_choice text,p_search text DEFAULT'',p_after bigint DEFAULT 0)RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.f12_workforce_choices(p_employee,p_kind,p_source,p_choice,p_search,p_after);$$;
REVOKE ALL ON FUNCTION public.f12_workforce_choices(bigint,text,bigint,text,text,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.f12_workforce_choices(bigint,text,bigint,text,text,bigint)TO authenticated;
CREATE FUNCTION erp_private.f12_workforce_recent(p_employee bigint,p_kind text,p_before timestamptz,p_cursor uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY created_at DESC,operation_id DESC),'[]')FROM(SELECT r.result receipt,r.created_at,r.operation_id FROM erp_private.f12_workforce_receipts r WHERE r.actor=auth.uid()AND(r.result->>'employee_id')::bigint=p_employee AND r.result->>'source_kind'=p_kind AND erp_private.f12_review_authorized(p_kind,p_employee)AND(p_before IS NULL OR(r.created_at,r.operation_id)<(p_before,p_cursor))ORDER BY r.created_at DESC,r.operation_id DESC LIMIT 26)x;
$$;
REVOKE ALL ON FUNCTION erp_private.f12_workforce_recent(bigint,text,timestamptz,uuid)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_workforce_recent(bigint,text,timestamptz,uuid)TO authenticated;
CREATE FUNCTION public.f12_workforce_recent(p_employee bigint,p_kind text,p_before timestamptz DEFAULT NULL,p_cursor uuid DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF NOT erp_private.f12_review_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current review authority required' USING ERRCODE='42501';END IF;IF(p_before IS NULL)<>(p_cursor IS NULL)THEN RAISE EXCEPTION 'Complete receipt cursor required' USING ERRCODE='22023';END IF;RETURN erp_private.f12_workforce_recent(p_employee,p_kind,p_before,p_cursor);END$$;
REVOKE ALL ON FUNCTION public.f12_workforce_recent(bigint,text,timestamptz,uuid)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.f12_workforce_recent(bigint,text,timestamptz,uuid)TO authenticated;
DO $$DECLARE definition text;needle text:='PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;';BEGIN
 definition:=pg_get_functiondef('public.f11_mutate_role_requirement(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized predecessor waiver admission';END IF;
 EXECUTE replace(definition,needle,'IF p_action=''waive''THEN RAISE EXCEPTION ''Use a source-backed dated independent waiver review'' USING ERRCODE=''23514'';END IF;'||needle);
END$$;
-- Same existing F11 callers/receipts; optional rendered fields preserve old input
-- identities. No legacy source, person or work-site link is inferred.
ALTER TABLE public.employee_pro_processes
 ADD COLUMN f12_source_kind text CHECK(f12_source_kind IN('identity-document','medical-insurance','access-card')),
 ADD COLUMN f12_source_id bigint, ADD COLUMN f12_source_version bigint,
 ADD COLUMN f12_source_expiry date, ADD COLUMN f12_source_hash text,
 ADD COLUMN f12_replacement_id bigint;
GRANT SELECT(f12_source_kind,f12_source_id,f12_source_version,f12_source_expiry,f12_source_hash,f12_replacement_id)ON public.employee_pro_processes TO authenticated;
CREATE UNIQUE INDEX f12_pro_once_per_cycle ON public.employee_pro_processes(employee_id,f12_source_kind,f12_source_id,f12_source_version,f12_source_expiry)WHERE f12_source_id IS NOT NULL;

CREATE FUNCTION erp_private.f12_pro_cycle()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb;replacement jsonb;day date:=(now()AT TIME ZONE'Asia/Dubai')::date;BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE'AND ROW(NEW.f12_source_kind,NEW.f12_source_id,NEW.f12_source_version,NEW.f12_source_expiry,NEW.f12_source_hash)IS DISTINCT FROM ROW(OLD.f12_source_kind,OLD.f12_source_id,OLD.f12_source_version,OLD.f12_source_expiry,OLD.f12_source_hash)THEN RAISE EXCEPTION 'Original renewal cycle is immutable; no historical relink' USING ERRCODE='23514';END IF;
 IF(NEW.f12_source_kind IS NULL)<>(NEW.f12_source_id IS NULL)THEN RAISE EXCEPTION 'Complete original renewal source required' USING ERRCODE='23514';END IF;
 -- Cancellation may release a stale source dependency, never date integrity.
 IF NEW.target_date IS NOT NULL AND NEW.target_date<NEW.request_date THEN RAISE EXCEPTION 'Renewal due date precedes request' USING ERRCODE='23514';END IF;
 -- Cancellation may release a stale source dependency, never date integrity.
 IF NEW.f12_source_kind IS NULL THEN
  IF NEW.f12_replacement_id IS NOT NULL THEN RAISE EXCEPTION 'Replacement requires a recorded original cycle' USING ERRCODE='23514';END IF;RETURN NEW;
 END IF;
 IF TG_OP='UPDATE'AND NEW.process_status IN('cancelled','rejected')AND OLD.process_status<>'completed'THEN RETURN NEW;END IF;
 IF NOT erp_private.f12_review_authorized(NEW.f12_source_kind,NEW.employee_id)THEN RAISE EXCEPTION 'Source and process authority required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.employees WHERE id=NEW.employee_id FOR UPDATE;
 source:=erp_private.f12_workforce_source(NEW.f12_source_kind,NEW.employee_id,NEW.f12_source_id,NULL,NULL);
 IF TG_OP='INSERT'THEN
  NEW.f12_source_version:=(source->>'version_id')::bigint;NEW.f12_source_expiry:=(source#>>'{source,expiry_date}')::date;
  NEW.f12_source_hash:=encode(sha256(convert_to(source::text,'UTF8')),'hex');
  IF NEW.f12_source_version IS NULL OR NEW.f12_source_expiry IS NULL THEN RAISE EXCEPTION 'Verified source version and expiry required; unknown cycle held' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.deleted_at IS NOT NULL AND NEW.process_status NOT IN('cancelled','completed','rejected')THEN RAISE EXCEPTION 'Resolve or cancel renewal before archiving' USING ERRCODE='23514';END IF;
 IF NEW.process_status NOT IN('draft','cancelled','rejected')THEN
  IF NEW.assigned_to IS NULL OR NEW.target_date IS NULL OR NOT erp_private.f12_review_person(NEW.assigned_to,'pro-process',NEW.employee_id,false)THEN RAISE EXCEPTION 'Current named authorized owner and explicit due date required' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_OP='UPDATE'AND OLD.process_status='completed'AND ROW(NEW.process_status,NEW.f12_replacement_id,NEW.assigned_to,NEW.target_date)IS DISTINCT FROM ROW(OLD.process_status,OLD.f12_replacement_id,OLD.assigned_to,OLD.target_date)THEN RAISE EXCEPTION 'Completed renewal facts are immutable' USING ERRCODE='23514';END IF;
 IF NEW.process_status='completed'AND(TG_OP='INSERT'OR OLD.process_status<>'completed')THEN
  IF NEW.f12_source_hash IS DISTINCT FROM encode(sha256(convert_to(source::text,'UTF8')),'hex')OR NEW.f12_replacement_id IS NULL OR NEW.f12_replacement_id=NEW.f12_source_id THEN RAISE EXCEPTION 'Current original cycle and distinct replacement evidence required' USING ERRCODE='PT409';END IF;
  replacement:=erp_private.f12_workforce_source(NEW.f12_source_kind,NEW.employee_id,NEW.f12_replacement_id,NULL,NULL);
  IF ROW(replacement->>'document_id',replacement->>'version_id')IS NOT DISTINCT FROM ROW(source->>'document_id',source->>'version_id')THEN RAISE EXCEPTION 'Original evidence cannot impersonate replacement evidence' USING ERRCODE='23514';END IF;
  IF NOT erp_private.f12_verified_evidence(NEW.f12_source_kind,NEW.employee_id,NEW.f12_replacement_id)
   OR(replacement#>>'{source,issue_date}')::date>day OR replacement#>>'{source,issue_date}'IS NULL
   OR(replacement#>>'{source,expiry_date}')::date<=greatest(day,NEW.f12_source_expiry)
   OR(replacement#>>'{source,expiry_date}')IS NULL
   OR replacement#>>'{source,status}'IS DISTINCT FROM'active'
   OR(CASE NEW.f12_source_kind WHEN'identity-document'THEN source#>>'{source,document_type_id}'IS DISTINCT FROM replacement#>>'{source,document_type_id}'WHEN'access-card'THEN source#>>'{source,access_type_id}'IS DISTINCT FROM replacement#>>'{source,access_type_id}'ELSE false END)
  THEN RAISE EXCEPTION 'Exact current verified replacement and validity required' USING ERRCODE='23514';END IF;
  NEW.completed_date:=day;
 END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_pro_cycle()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_pro_cycle BEFORE INSERT OR UPDATE ON public.employee_pro_processes FOR EACH ROW EXECUTE FUNCTION erp_private.f12_pro_cycle();

DO $$DECLARE d text;n text;BEGIN
 d:=pg_get_functiondef('public.f11_mutate_pro_process(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure);
 n:='ARRAY[''process_title'',''process_status'',''priority'',''request_date'',''target_date'',''notes'']';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown PRO predecessor fields';END IF;
 d:=replace(d,n,'ARRAY[''process_title'',''process_status'',''priority'',''request_date'',''target_date'',''notes'',''assigned_to'',''f12_source_kind'',''f12_source_id'',''f12_replacement_id'']');
 d:=replace(d,'IF p_action=''create''THEN'||chr(10)||'  INSERT','IF p_action=''create''THEN'||chr(10)||'  INSERT');
 n:='employee_id,process_title,process_status,priority,request_date,target_date,notes,submitted_date';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown PRO insert';END IF;
 d:=replace(d,n,'employee_id,assigned_to,f12_source_kind,f12_source_id,f12_replacement_id,process_title,process_status,priority,request_date,target_date,notes,submitted_date');
 d:=replace(d,'VALUES(p_employee,btrim(p_data->>''process_title'')','VALUES(p_employee,(p_data->>''assigned_to'')::bigint,p_data->>''f12_source_kind'',(p_data->>''f12_source_id'')::bigint,(p_data->>''f12_replacement_id'')::bigint,btrim(p_data->>''process_title'')');
 d:=replace(d,'SET process_title=btrim','SET assigned_to=CASE WHEN p_data?''assigned_to''THEN(p_data->>''assigned_to'')::bigint ELSE x.assigned_to END,f12_replacement_id=CASE WHEN p_data?''f12_replacement_id''THEN(p_data->>''f12_replacement_id'')::bigint ELSE x.f12_replacement_id END,process_title=btrim');
 -- Updates may carry unchanged original source fields but may never relink them.
 n:='actor:=public.current_user_profile_id();';
 d:=replace(d,n,'IF p_action=''update''AND EXISTS(SELECT 1 FROM public.employee_pro_processes x WHERE x.id=p_id AND((p_data?''f12_source_kind''AND p_data->>''f12_source_kind''IS DISTINCT FROM x.f12_source_kind)OR(p_data?''f12_source_id''AND(p_data->>''f12_source_id'')::bigint IS DISTINCT FROM x.f12_source_id)))THEN RAISE EXCEPTION ''Original renewal cycle cannot change'' USING ERRCODE=''23514'';END IF;'||n);EXECUTE d;
 d:=pg_get_functiondef('erp_private.f11_capture_pro_process()'::regprocedure);
 n:='''process_title'',''process_status'',''priority''';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown PRO capture';END IF;
 EXECUTE replace(d,n,'''assigned_to'',''f12_replacement_id'',''process_title'',''process_status'',''priority''');
END$$;

-- Extending the existing assignment editor never modifies employee org/manager facts.
CREATE TABLE erp_private.f12_deployment_effects(review_id bigint PRIMARY KEY REFERENCES erp_private.f12_workforce_reviews(id),assignment_id bigint NOT NULL,actor uuid NOT NULL,operation_id uuid NOT NULL,source_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(actor,operation_id));
ALTER TABLE erp_private.f12_deployment_effects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f12_deployment_effects FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE d text;n text;BEGIN
 d:=pg_get_functiondef('public.f11_mutate_assignment(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure);
 n:='ARRAY[''assignment_type'',''assignment_status'',''effective_from'',''effective_to'',''notes'']';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown assignment fields';END IF;
 IF position('k<>ALL('||n||')'IN d)=0 THEN RAISE EXCEPTION 'Unknown assignment input allowlist';END IF;
 d:=replace(d,'k<>ALL('||n||')','k<>ALL(ARRAY[''assignment_type'',''assignment_status'',''effective_from'',''effective_to'',''notes'',''work_site_id'',''deployment_review_id''])');
 d:=replace(d,'''hash'',digest)::text,true)', '''hash'',digest,''deployment_review_id'',p_data->''deployment_review_id'')::text,true)');
 d:=replace(d,'employee_id,assignment_type,assignment_status','employee_id,work_site_id,assignment_type,assignment_status');
 d:=replace(d,'VALUES(p_employee,v_type,v_status','VALUES(p_employee,(p_data->>''work_site_id'')::bigint,v_type,v_status');
 d:=replace(d,'SET assignment_type=v_type','SET work_site_id=CASE WHEN p_data?''work_site_id''THEN(p_data->>''work_site_id'')::bigint ELSE x.work_site_id END,assignment_type=v_type');EXECUTE d;
 d:=pg_get_functiondef('erp_private.f11_capture_assignment()'::regprocedure);
 d:=replace(d,'OR NEW.work_site_id IS NOT NULL ','');
 n:='''assignment_type'',''assignment_status'',''effective_from''';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown assignment capture';END IF;
 EXECUTE replace(d,n,'''work_site_id'',''assignment_type'',''assignment_status'',''effective_from''');
END$$;
CREATE FUNCTION erp_private.f12_deployment_safety()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;r erp_private.f12_workforce_reviews;s jsonb;day date:=(now()AT TIME ZONE'Asia/Dubai')::date;BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF NEW.work_site_id IS NOT NULL AND(NOT(public.current_user_has_permission('common_md.view')OR public.current_user_has_permission('common_md.work_sites.view')OR public.current_user_has_role('system_admin'))OR NOT EXISTS(SELECT 1 FROM public.work_sites w JOIN public.employees e ON e.id=NEW.employee_id WHERE w.id=NEW.work_site_id AND w.deleted_at IS NULL AND w.status='active'AND(w.owner_company_id IS NULL OR w.owner_company_id=e.owner_company_id)AND(w.branch_id IS NULL OR w.branch_id=e.branch_id)AND(w.opening_date IS NULL OR w.opening_date<=NEW.effective_from)AND(w.closing_date IS NULL OR NEW.effective_to IS NOT NULL AND w.closing_date>=NEW.effective_to)))THEN RAISE EXCEPTION 'Current compatible site and complete site dates required' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE'AND OLD.assignment_status IN('completed','cancelled')AND NEW.assignment_status IS DISTINCT FROM OLD.assignment_status THEN RAISE EXCEPTION 'Ended assignment cannot be reactivated' USING ERRCODE='23514';END IF;
 IF NEW.assignment_status IN('completed','cancelled')AND NEW.work_site_id IS NOT NULL AND NEW.effective_to IS NULL THEN RAISE EXCEPTION 'Explicit assignment end date required' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE'AND OLD.assignment_status='active'AND OLD.work_site_id IS NOT NULL THEN
  IF NEW.deleted_at IS NOT NULL OR NEW.work_site_id IS DISTINCT FROM OLD.work_site_id OR NEW.effective_from IS DISTINCT FROM OLD.effective_from OR NEW.assignment_status='planned'THEN RAISE EXCEPTION 'End original effective deployment before replacing it' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.assignment_status='active'AND NEW.work_site_id IS NOT NULL AND(TG_OP='INSERT'OR OLD.assignment_status<>'active')THEN
  IF TG_OP='INSERT'OR OLD.assignment_status<>'planned'OR ROW(NEW.work_site_id,NEW.effective_from,NEW.effective_to,NEW.assignment_type,NEW.notes)IS DISTINCT FROM ROW(OLD.work_site_id,OLD.effective_from,OLD.effective_to,OLD.assignment_type,OLD.notes)THEN RAISE EXCEPTION 'Activate the unchanged independently approved planned assignment' USING ERRCODE='23514';END IF;
  SELECT *INTO r FROM erp_private.f12_workforce_reviews WHERE id=(context->>'deployment_review_id')::bigint AND employee_id=NEW.employee_id AND source_kind='assignment'AND source_id=NEW.id AND purpose='deployment'AND status='approved'FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current independent deployment approval required' USING ERRCODE='23514';END IF;
  -- The review row is not its reviewer's current authority. Keep the named
  -- person's profile and scoped grants stable through the actual deployment
  -- effect, then recheck. No active reviewer session is invented or required.
  PERFORM 1 FROM public.user_profiles WHERE id=r.reviewer_id FOR SHARE;
  PERFORM 1 FROM public.user_roles u WHERE u.user_profile_id=r.reviewer_id ORDER BY u.id FOR SHARE;
  PERFORM 1 FROM public.roles x WHERE x.id IN(SELECT u.role_id FROM public.user_roles u WHERE u.user_profile_id=r.reviewer_id)ORDER BY x.id FOR SHARE;
  PERFORM 1 FROM public.role_permissions rp WHERE rp.role_id IN(SELECT u.role_id FROM public.user_roles u WHERE u.user_profile_id=r.reviewer_id)ORDER BY rp.role_id,rp.permission_id FOR SHARE;
  PERFORM 1 FROM public.permissions p WHERE p.id IN(SELECT rp.permission_id FROM public.role_permissions rp JOIN public.user_roles u ON u.role_id=rp.role_id WHERE u.user_profile_id=r.reviewer_id)ORDER BY p.id FOR SHARE;
  IF r.reviewer_id=r.requested_by OR r.valid_from>day OR r.valid_until<day OR NOT erp_private.f12_review_person(r.reviewer_id,'assignment',NEW.employee_id,false)THEN RAISE EXCEPTION 'Current independent deployment approval required' USING ERRCODE='23514';END IF;
  s:=erp_private.f12_workforce_source('assignment',NEW.employee_id,NEW.id,r.document_id,NULL);
  IF r.source_hash IS DISTINCT FROM encode(sha256(convert_to(s::text,'UTF8')),'hex')OR erp_private.f11_calculate_readiness(s->'configuration')->>'status'<>'ready'THEN RAISE EXCEPTION 'Deployment evidence changed; review current sources' USING ERRCODE='PT409';END IF;
  INSERT INTO erp_private.f12_deployment_effects(review_id,assignment_id,actor,operation_id,source_hash)VALUES(r.id,NEW.id,auth.uid(),(context->>'operation_id')::uuid,r.source_hash);
 END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_deployment_safety()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_deployment_safety BEFORE INSERT OR UPDATE ON public.employee_assignments FOR EACH ROW EXECUTE FUNCTION erp_private.f12_deployment_safety();

CREATE FUNCTION erp_private.f12_resource_safety()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.employees;from_day date;to_day date;BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 SELECT id,joining_date,inactive_date INTO e.id,e.joining_date,e.inactive_date FROM public.employees WHERE id=NEW.employee_id FOR UPDATE;
 IF TG_TABLE_NAME='employee_accommodation_records'THEN
  from_day:=NEW.assigned_from;to_day:=NEW.assigned_to;
  IF NEW.status='active'AND NEW.deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.employee_accommodation_records a WHERE a.employee_id=NEW.employee_id AND a.id<>NEW.id AND a.status='active'AND a.deleted_at IS NULL AND daterange(a.assigned_from,a.assigned_to,'[]')&&daterange(NEW.assigned_from,NEW.assigned_to,'[]'))THEN RAISE EXCEPTION 'Overlapping active accommodation; end original first' USING ERRCODE='23514';END IF;
  IF TG_OP='UPDATE'AND NEW.deleted_at IS NOT NULL AND OLD.status='active'THEN RAISE EXCEPTION 'End accommodation before archiving' USING ERRCODE='23514';END IF;
 ELSE
  from_day:=NEW.issued_date;to_day:=NEW.returned_date;
  IF TG_OP='UPDATE'AND NEW.deleted_at IS NOT NULL AND OLD.returned_date IS NULL AND OLD.status<>'cancelled'THEN RAISE EXCEPTION 'Outstanding custody cannot be hidden by archive; record authoritative return' USING ERRCODE='23514';END IF;
 END IF;
 IF from_day<e.joining_date OR to_day<from_day THEN RAISE EXCEPTION 'Resource chronology conflicts with employment/issue' USING ERRCODE='23514';END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_resource_safety()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_resource_safety BEFORE INSERT OR UPDATE ON public.employee_assets FOR EACH ROW EXECUTE FUNCTION erp_private.f12_resource_safety();
CREATE TRIGGER f12_resource_safety BEFORE INSERT OR UPDATE ON public.employee_ppe_issues FOR EACH ROW EXECUTE FUNCTION erp_private.f12_resource_safety();
CREATE TRIGGER f12_resource_safety BEFORE INSERT OR UPDATE ON public.employee_accommodation_records FOR EACH ROW EXECUTE FUNCTION erp_private.f12_resource_safety();
DO $$DECLARE f text;d text;BEGIN
 FOREACH f IN ARRAY ARRAY['public.f11_mutate_assignment(text,bigint,bigint,bigint,uuid,text,jsonb)','public.f11_mutate_pro_process(text,bigint,bigint,bigint,uuid,text,jsonb)','public.f11_mutate_operation_item(text,bigint,bigint,bigint,uuid,text,jsonb)']LOOP
  d:=pg_get_functiondef(f::regprocedure);IF position('WHERE id=p_employee AND deleted_at IS NULL FOR SHARE'IN d)=0 THEN RAISE EXCEPTION 'Unknown employee serialization boundary';END IF;
  EXECUTE replace(d,'WHERE id=p_employee AND deleted_at IS NULL FOR SHARE','WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE');
 END LOOP;
END$$;
CREATE FUNCTION erp_private.f12_editor_choices(p_employee bigint,p_kind text,p_field text,p_source bigint,p_source_kind text,p_search text,p_after bigint)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE relation text;result jsonb;e public.employees;BEGIN
 IF p_kind NOT IN('assignment','pro-process')OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current editor authority required' USING ERRCODE='42501';END IF;
 IF p_search IS NULL OR length(p_search)>100 OR p_after IS NULL OR p_after<0 THEN RAISE EXCEPTION 'Invalid editor cursor' USING ERRCODE='22023';END IF;
 SELECT id,owner_company_id,branch_id INTO e.id,e.owner_company_id,e.branch_id FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;
 IF p_kind='pro-process'AND p_field='assigned_to'THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),'[]')INTO result FROM(SELECT p.id,coalesce(nullif(p.display_name,''),nullif(p.full_name,''),'User #'||p.id)label FROM public.user_profiles p WHERE p.id>p_after AND erp_private.f12_review_person(p.id,'pro-process',p_employee,false)AND position(lower(p_search)IN lower(coalesce(p.display_name,p.full_name,'')||' #'||p.id))>0 ORDER BY p.id LIMIT 26)x;
 ELSIF p_kind='assignment'AND p_field='deployment_review_id'THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),'[]')INTO result FROM(SELECT r.id,'Approved deployment #'||r.id||' — '||r.valid_from||' to '||r.valid_until label FROM erp_private.f12_workforce_reviews r WHERE r.employee_id=p_employee AND r.source_kind='assignment'AND r.source_id=p_source AND r.status='approved'AND r.id>p_after AND NOT EXISTS(SELECT 1 FROM erp_private.f12_deployment_effects d WHERE d.review_id=r.id)AND position(lower(p_search)IN lower('Approved deployment #'||r.id))>0 ORDER BY r.id LIMIT 26)x;
 ELSIF p_kind='pro-process'AND p_field IN('f12_source_id','f12_replacement_id')THEN
  IF p_source_kind IS NULL OR p_source_kind NOT IN('identity-document','medical-insurance','access-card')OR NOT erp_private.f12_review_authorized(p_source_kind,p_employee)THEN RAISE EXCEPTION 'Current source-specific authority required' USING ERRCODE='42501';END IF;
  relation:=CASE p_source_kind WHEN'identity-document'THEN'employee_identity_documents'WHEN'medical-insurance'THEN'employee_medical_insurances'ELSE'employee_access_cards'END;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),''[]'')FROM(SELECT id,%L||'' #''||id||'' — ''||coalesce(expiry_date::text,''Expiry unknown'')label FROM public.%I WHERE employee_id=$1 AND deleted_at IS NULL AND id>$2 AND position(lower($3)IN lower(%L||'' #''||id))>0 ORDER BY id LIMIT 26)x',p_source_kind,relation,p_source_kind)INTO result USING p_employee,p_after,p_search;
 ELSE RAISE EXCEPTION 'Unsupported editor field' USING ERRCODE='22023';END IF;RETURN result;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_editor_choices(bigint,text,text,bigint,text,text,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_editor_choices(bigint,text,text,bigint,text,text,bigint)TO authenticated;
CREATE FUNCTION public.f12_editor_choices(p_employee bigint,p_kind text,p_field text,p_source bigint DEFAULT NULL,p_source_kind text DEFAULT NULL,p_search text DEFAULT'',p_after bigint DEFAULT 0)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$DECLARE result jsonb;BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('assignment','pro-process')OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current editor authority required' USING ERRCODE='42501';END IF;
 IF p_search IS NULL OR length(p_search)>100 OR p_after IS NULL OR p_after<0 THEN RAISE EXCEPTION 'Invalid editor cursor' USING ERRCODE='22023';END IF;
 IF p_kind='assignment'AND p_field='work_site_id'THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),'[]')INTO result FROM(SELECT w.id,w.site_code||' — '||w.site_name label FROM public.work_sites w JOIN public.employees e ON e.id=p_employee WHERE w.id>p_after AND w.deleted_at IS NULL AND w.status='active'AND(w.owner_company_id IS NULL OR w.owner_company_id=e.owner_company_id)AND(w.branch_id IS NULL OR w.branch_id=e.branch_id)AND position(lower(p_search)IN lower(w.site_code||' '||w.site_name))>0 ORDER BY w.id LIMIT 26)x;RETURN result;
 END IF;RETURN erp_private.f12_editor_choices(p_employee,p_kind,p_field,p_source,p_source_kind,p_search,p_after);
END$$;
REVOKE ALL ON FUNCTION public.f12_editor_choices(bigint,text,text,bigint,text,text,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.f12_editor_choices(bigint,text,text,bigint,text,text,bigint)TO authenticated;
-- The boolean evidence guard must check every distinct subject/capability pair,
-- not repeat expensive authorization for every historical link to that pair.
-- Materialization keeps the authorization predicates above the deduplication.
-- No policy, capability, foreign-subject or medical check is removed.
DO $$DECLARE definition text;opening text;closing text;BEGIN
 definition:=pg_get_functiondef('erp_private.hr_document_evidence_allowed(bigint)'::regprocedure);
 opening:=E'SELECT (SELECT erp_private.business_principal_is_active()) AND NOT EXISTS (\n  SELECT 1 FROM (';
 closing:=') linked WHERE NOT public.current_user_can_view_employee(linked.employee_id)';
 IF position(opening IN definition)=0 OR position(closing IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized linked HR evidence authorization boundary';END IF;
 definition:=replace(definition,opening,'WITH linked AS MATERIALIZED (SELECT DISTINCT employee_id,caps FROM (');
 definition:=replace(definition,closing,') raw_links) SELECT (SELECT erp_private.business_principal_is_active()) AND NOT EXISTS (SELECT 1 FROM linked WHERE NOT public.current_user_can_view_employee(linked.employee_id)');
 EXECUTE definition;
END$$;
NOTIFY pgrst,'reload schema';COMMIT;
