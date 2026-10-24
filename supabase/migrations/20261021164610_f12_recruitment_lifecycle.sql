-- F12-02: additive, versioned hiring commands. No historical decisions/mappings
-- are backfilled. Legacy approvals/required-task facts need explicit review.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
ALTER TABLE public.hr_interviews ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE public.hr_job_requisitions ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE public.hr_offers ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN terms_version bigint NOT NULL DEFAULT 1,
 ADD COLUMN approved_terms_version bigint,ADD COLUMN accepted_terms_version bigint,
 ADD COLUMN terms_changed_by bigint REFERENCES public.user_profiles(id),
 ADD COLUMN approved_by bigint REFERENCES public.user_profiles(id),ADD COLUMN accepted_by bigint REFERENCES public.user_profiles(id),
 ADD COLUMN housing_allowance numeric(12,2),ADD COLUMN transport_allowance numeric(12,2),ADD COLUMN other_allowances numeric(12,2);
ALTER TABLE public.hr_onboarding_tasks ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN checklist_version bigint NOT NULL DEFAULT 1,ADD COLUMN is_required boolean NOT NULL DEFAULT true,
 ADD COLUMN completion_criteria text,ADD COLUMN evidence_required boolean NOT NULL DEFAULT false,
 ADD COLUMN prerequisite_task_id bigint REFERENCES public.hr_onboarding_tasks(id);
ALTER TABLE public.hr_candidates ADD COLUMN joining_status text NOT NULL DEFAULT 'not_started'
 CHECK(joining_status IN('not_started','in_progress','completed','cancelled','no_show'));
GRANT SELECT(workspace_revision)ON public.hr_interviews TO authenticated;
GRANT SELECT(workspace_revision)ON public.hr_job_requisitions TO authenticated;
GRANT SELECT(workspace_revision,terms_version,approved_terms_version,accepted_terms_version,terms_changed_by,approved_by,accepted_by)ON public.hr_offers TO authenticated;
GRANT SELECT(workspace_revision,checklist_version,is_required,completion_criteria,evidence_required,prerequisite_task_id)ON public.hr_onboarding_tasks TO authenticated;
GRANT SELECT(joining_status)ON public.hr_candidates TO authenticated;
-- New compensation components are subject to the same separate salary gates.
DO $$DECLARE definition text;BEGIN
 definition:=pg_get_functiondef('erp_private.protect_recruitment_salary()'::regprocedure);
 IF position('ARRAY[''basic_salary'',''gross_salary'']'IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized salary guard';END IF;
 EXECUTE replace(definition,'ARRAY[''basic_salary'',''gross_salary'']','ARRAY[''basic_salary'',''gross_salary'',''housing_allowance'',''transport_allowance'',''other_allowances'']');
 definition:=pg_get_functiondef('erp_private.read_hr_offers()'::regprocedure);
 IF position('{basic_salary,gross_salary}'IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized masked offer projection';END IF;
 EXECUTE replace(definition,'{basic_salary,gross_salary}','{basic_salary,gross_salary,housing_allowance,transport_allowance,other_allowances}');
END $$;
CREATE TABLE erp_private.f12_recruitment_receipts(
 actor uuid NOT NULL,operation_id uuid NOT NULL,request_hash text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor,operation_id));
CREATE INDEX f12_recruitment_receipts_recent ON erp_private.f12_recruitment_receipts(actor,created_at DESC,operation_id);
CREATE TABLE erp_private.f12_recruitment_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor uuid NOT NULL,actor_id bigint NOT NULL,
 operation_id uuid NOT NULL,kind text NOT NULL,record_id bigint NOT NULL,candidate_id bigint,employee_id bigint,
 action text NOT NULL,reason text NOT NULL,old_values jsonb,new_values jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor,operation_id));
CREATE INDEX f12_recruitment_events_subject ON erp_private.f12_recruitment_events(candidate_id,kind,record_id,id DESC);
CREATE TABLE erp_private.f12_recruitment_proofs(
 actor uuid NOT NULL,transaction_id xid8 NOT NULL,backend integer NOT NULL,table_name text NOT NULL,
 record_id bigint NOT NULL,PRIMARY KEY(actor,transaction_id,backend,table_name,record_id));
ALTER TABLE erp_private.f12_recruitment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.f12_recruitment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.f12_recruitment_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f12_recruitment_receipts,erp_private.f12_recruitment_events,erp_private.f12_recruitment_proofs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f12_subject_allowed(p_candidate bigint,p_employee bigint,p_code text)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()
 AND(p_candidate IS NOT NULL OR p_employee IS NOT NULL)
 -- Reuse the complete F03 predicate, including employee visibility as well
 -- as recruitment scope. A narrower self/team capability is not a new grant.
 AND erp_private.onboarding_permission(p_candidate,p_employee,p_code);
$$;
REVOKE ALL ON FUNCTION erp_private.f12_subject_allowed(bigint,bigint,text)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_subject_allowed(bigint,bigint,text)TO authenticated;
CREATE FUNCTION erp_private.f12_command_subject_allowed(p_kind text,p_id bigint,p_candidate bigint,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN p_kind='requisition'THEN erp_private.business_principal_is_active()AND p_candidate IS NULL AND p_employee IS NULL AND EXISTS(SELECT 1 FROM public.hr_job_requisitions r WHERE r.id=p_id AND erp_private.recruitment_scope(r.owner_company_id,r.branch_id,'hr.recruitment.manage'))ELSE erp_private.f12_subject_allowed(p_candidate,p_employee,'hr.recruitment.manage')END;
$$;
REVOKE ALL ON FUNCTION erp_private.f12_command_subject_allowed(text,bigint,bigint,bigint)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_command_subject_allowed(text,bigint,bigint,bigint)TO authenticated;

-- Validate the actual assignee's recorded roles/scope; never impersonate them,
-- infer a name/email mapping, or grant access to make a task appear ready.
CREATE FUNCTION erp_private.f12_assignee_allowed(p_profile bigint,p_candidate bigint,p_employee bigint)RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE company bigint;branch bigint;other_company bigint;other_branch bigint;
BEGIN
 IF NOT erp_private.f12_subject_allowed(p_candidate,p_employee,'hr.recruitment.manage')THEN RETURN false;END IF;
 IF p_profile IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_profiles p JOIN auth.users a ON a.id=p.auth_user_id WHERE p.id=p_profile AND p.status='active'AND NOT p.must_change_password AND a.deleted_at IS NULL AND(a.banned_until IS NULL OR a.banned_until<=now()))THEN RETURN false;END IF;
 IF p_candidate IS NOT NULL THEN SELECT r.owner_company_id,r.branch_id INTO company,branch FROM public.hr_candidates c LEFT JOIN public.hr_job_requisitions r ON r.id=c.requisition_id AND r.deleted_at IS NULL WHERE c.id=p_candidate AND c.deleted_at IS NULL;IF NOT FOUND THEN RETURN false;END IF;END IF;
 IF p_employee IS NOT NULL THEN SELECT e.owner_company_id,e.branch_id INTO other_company,other_branch FROM public.employees e WHERE e.id=p_employee AND e.deleted_at IS NULL;IF NOT FOUND THEN RETURN false;END IF;
  IF p_candidate IS NOT NULL AND ROW(company,branch)IS DISTINCT FROM ROW(other_company,other_branch)THEN RETURN false;END IF;company:=other_company;branch:=other_branch;END IF;
 RETURN EXISTS(SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
  WHERE u.user_profile_id=p_profile AND u.is_active AND r.is_active AND((u.owner_company_id IS NULL AND u.branch_id IS NULL)OR(u.owner_company_id=company AND(u.branch_id IS NULL OR u.branch_id=branch)))
  AND((r.role_code IN('system_admin','group_admin')AND u.owner_company_id IS NULL AND u.branch_id IS NULL)OR EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id AND p.is_active AND p.permission_code='hr.recruitment.manage')));
END $$;
REVOKE ALL ON FUNCTION erp_private.f12_assignee_allowed(bigint,bigint,bigint)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_assignee_allowed(bigint,bigint,bigint)TO authenticated;

CREATE FUNCTION erp_private.f12_guard_recruitment_write()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid()IS NULL THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE'THEN RAISE EXCEPTION 'Permanent recruitment disposal is unavailable' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM erp_private.f12_recruitment_proofs WHERE actor=auth.uid()AND transaction_id=pg_current_xact_id()AND backend=pg_backend_pid()AND table_name=TG_TABLE_NAME AND record_id=NEW.id)THEN RETURN NEW;END IF;
 -- Preserve only the proven F06 conversion's candidate/employee task linkage.
 IF TG_TABLE_NAME='hr_onboarding_tasks'AND TG_OP='UPDATE'AND(to_jsonb(NEW)-ARRAY['employee_id','updated_at','updated_by'])=(to_jsonb(OLD)-ARRAY['employee_id','updated_at','updated_by'])
 AND EXISTS(SELECT 1 FROM erp_private.recruitment_consumer_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.kind='conversion'AND (p.input_json->>'offer_id')IS NOT NULL AND p.source_json->'tasks' @> to_jsonb(ARRAY[NEW.id]))THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'A versioned recruitment command and original opening are required' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION erp_private.f12_guard_recruitment_write()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_command_guard BEFORE INSERT OR UPDATE OR DELETE ON public.hr_interviews FOR EACH ROW EXECUTE FUNCTION erp_private.f12_guard_recruitment_write();
CREATE TRIGGER f12_command_guard BEFORE INSERT OR UPDATE OR DELETE ON public.hr_offers FOR EACH ROW EXECUTE FUNCTION erp_private.f12_guard_recruitment_write();
CREATE TRIGGER f12_command_guard BEFORE INSERT OR UPDATE OR DELETE ON public.hr_onboarding_tasks FOR EACH ROW EXECUTE FUNCTION erp_private.f12_guard_recruitment_write();

-- Privileged only to protect immutable journals/receipts and masked salary
-- columns. Every command validates current principal, source and destination
-- native subject authority; no service-role application client is involved.
CREATE FUNCTION erp_private.f12_apply_recruitment(p_operation uuid,p_request jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE kind text:=p_request->>'kind';action text:=p_request->>'action';data jsonb:=coalesce(p_request->'values','{}');
 candidate bigint:=(p_request->>'candidateId')::bigint;employee bigint:=(p_request->>'employeeId')::bigint;target bigint:=(p_request->>'id')::bigint;
 revision bigint:=(p_request->>'revision')::bigint;why text:=btrim(p_request->>'reason');v_table text;actor bigint;old jsonb;next jsonb;rec jsonb;hash text;result jsonb;
 allowed text[];k text;v jsonb;cols text;vals text;company bigint;branch bigint;req bigint;material boolean:=false;status text;today date:=(now()AT TIME ZONE'Asia/Dubai')::date;
BEGIN
 IF auth.uid()IS NULL OR NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Current recruitment session unavailable' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL OR why IS NULL OR length(why)NOT BETWEEN 1 AND 2000 OR jsonb_typeof(p_request)IS DISTINCT FROM'object'OR jsonb_typeof(data)IS DISTINCT FROM'object'OR kind IS NULL OR action IS NULL OR octet_length(p_request::text)>65536
 OR jsonb_typeof(p_request->'kind')IS DISTINCT FROM'string'OR jsonb_typeof(p_request->'action')IS DISTINCT FROM'string'OR jsonb_typeof(p_request->'reason')IS DISTINCT FROM'string'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request)key WHERE key<>ALL(ARRAY['kind','candidateId','employeeId','id','revision','action','values','reason']))THEN RAISE EXCEPTION 'Invalid recruitment command' USING ERRCODE='22023';END IF;
 actor:=public.current_user_profile_id();v_table:=CASE kind WHEN'interview'THEN'hr_interviews'WHEN'offer'THEN'hr_offers'WHEN'task'THEN'hr_onboarding_tasks'WHEN'joining'THEN'hr_candidates'WHEN'pipeline'THEN'hr_candidates'WHEN'requisition'THEN'hr_job_requisitions'END;
 IF v_table IS NULL OR NOT erp_private.f12_command_subject_allowed(kind,target,candidate,employee)THEN RAISE EXCEPTION 'Recruitment unavailable' USING ERRCODE='42501';END IF;
 IF kind NOT IN('task','requisition')AND(candidate IS NULL OR employee IS NOT NULL)THEN RAISE EXCEPTION 'Candidate subject required' USING ERRCODE='22023';END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_request)WHERE key IN('candidateId','employeeId','id')LOOP
  IF v<>'null'::jsonb AND(jsonb_typeof(v)<>'number'OR(v::text)::numeric<>trunc((v::text)::numeric)OR(v::text)::numeric NOT BETWEEN 1 AND 9007199254740991)THEN RAISE EXCEPTION 'Invalid original subject identity' USING ERRCODE='22023';END IF;
 END LOOP;
 IF p_request->>'revision'IS NOT NULL AND(jsonb_typeof(p_request->'revision')<>'string'OR(p_request->>'revision')!~'^[1-9][0-9]{0,15}$'OR revision>9007199254740991)THEN RAISE EXCEPTION 'Invalid original revision' USING ERRCODE='22023';END IF;
 -- Same ordering as the F06 conversion/child statement guards.
 PERFORM pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('f06-recruitment-conversion',0));
 -- Hold the current principal and its grants through commit; a concurrent
 -- revocation must serialize before admission or after this transaction.
 PERFORM 1 FROM public.user_profiles WHERE id=actor FOR SHARE;
 PERFORM 1 FROM public.user_roles u WHERE u.user_profile_id=actor ORDER BY u.id FOR SHARE;
 PERFORM 1 FROM public.role_permissions p WHERE p.role_id IN(SELECT role_id FROM public.user_roles WHERE user_profile_id=actor)ORDER BY p.role_id,p.permission_id FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('f12-recruitment-op:'||auth.uid()||':'||p_operation,0));
 IF candidate IS NOT NULL THEN PERFORM 1 FROM public.hr_candidates WHERE id=candidate AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Recruitment unavailable' USING ERRCODE='42501';END IF;END IF;
 IF employee IS NOT NULL THEN PERFORM 1 FROM public.employees WHERE id=employee AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Recruitment unavailable' USING ERRCODE='42501';END IF;END IF;
 hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 IF NOT(action=ANY(CASE kind WHEN'interview'THEN ARRAY['create','update','archive','complete','cancel','reschedule','no-show']WHEN'offer'THEN ARRAY['create','update','archive','submit','approve','send','accept','reject','withdraw','cancel','expire']WHEN'task'THEN ARRAY['create','update','archive','complete','reopen','not-applicable','cancel','block','start']WHEN'requisition'THEN ARRAY['update','archive']WHEN'pipeline'THEN ARRAY['update']ELSE ARRAY['start','finish','cancel','reopen','no-show']END))THEN RAISE EXCEPTION 'Unsupported recruitment action' USING ERRCODE='22023';END IF;
 SELECT to_jsonb(r) INTO rec FROM erp_private.f12_recruitment_receipts r WHERE r.actor=auth.uid()AND r.operation_id=p_operation;
 IF rec IS NOT NULL THEN
  IF rec->>'request_hash'<>hash THEN RAISE EXCEPTION 'Original operation payload changed' USING ERRCODE='22023';END IF;
  RETURN(rec->'result')||jsonb_build_object('replayed',true);
 END IF;
 IF action='create'THEN
  IF target IS NOT NULL OR revision IS NOT NULL OR kind='joining'THEN RAISE EXCEPTION 'Invalid creation opening' USING ERRCODE='22023';END IF;
  EXECUTE format('SELECT nextval(pg_get_serial_sequence(%L,''id''))','public.'||v_table)INTO target;
  next:=jsonb_build_object('id',target,'candidate_id',candidate,'workspace_revision',1,'created_by',actor,'updated_by',actor);
  IF kind='task'THEN next:=next||jsonb_build_object('employee_id',employee,'task_status','pending','is_required',true,'evidence_required',false,'checklist_version',1);END IF;
  IF kind='offer'THEN next:=next||jsonb_build_object('offer_status','draft','currency','AED','terms_version',1,'terms_changed_by',actor);END IF;
  IF kind='interview'THEN next:=next||jsonb_build_object('interview_status','scheduled','interview_round','first');END IF;
 ELSE
  IF target IS NULL OR revision IS NULL OR revision<1 THEN RAISE EXCEPTION 'Original revision required' USING ERRCODE='22023';END IF;
  EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',v_table)INTO old USING target;
  IF old IS NULL OR(kind IN('joining','pipeline')AND target IS DISTINCT FROM candidate)OR(kind NOT IN('joining','pipeline')AND(old->>'candidate_id')::bigint IS DISTINCT FROM candidate)
  OR(kind='task'AND(old->>'employee_id')::bigint IS DISTINCT FROM employee)THEN RAISE EXCEPTION 'Recruitment unavailable' USING ERRCODE='42501';END IF;
  -- A stale opening is a permanent business conflict, not an engine
  -- serialization failure. 40001 makes PostgREST retry an impossible request.
  IF(old->>'workspace_revision')::bigint<>revision THEN RAISE EXCEPTION 'Recruitment changed since opening' USING ERRCODE='PT409';END IF;
  next:=old||jsonb_build_object('workspace_revision',revision+1,'updated_by',actor,'updated_at',clock_timestamp());
 END IF;
 IF kind='interview'THEN allowed:=ARRAY['interview_round','interview_datetime','interview_location','interviewer_id','requisition_id','interview_status','result','score','feedback','next_step'];
 ELSIF kind='offer'THEN allowed:=ARRAY['requisition_id','offer_date','valid_until','proposed_joining_date','owner_company_id','branch_id','department_id','designation_id','employment_type_id','basic_salary','gross_salary','housing_allowance','transport_allowance','other_allowances','currency','offer_document_id','notes','offer_status'];
 ELSIF kind='task'THEN allowed:=ARRAY['candidate_id','employee_id','task_title','task_category','task_status','assigned_to','due_date','dms_document_id','notes','is_required','completion_criteria','evidence_required','prerequisite_task_id'];
 ELSIF kind='requisition'THEN allowed:=ARRAY['requisition_title','vacancies_count','requisition_status','priority','target_start_date','job_description','requirements','notes'];
 ELSIF kind='pipeline'THEN allowed:=ARRAY['candidate_status','pipeline_stage'];
 ELSE allowed:=ARRAY[]::text[];END IF;
 IF action IN('create','update')OR(kind='interview'AND action IN('complete','reschedule'))THEN
  FOR k,v IN SELECT * FROM jsonb_each(data)LOOP
   IF NOT k=ANY(allowed)THEN RAISE EXCEPTION 'Unsupported recruitment field' USING ERRCODE='22023';END IF;
   IF k IN('candidate_id','employee_id')AND v IS DISTINCT FROM next->k THEN RAISE EXCEPTION 'Cannot relink a hiring task' USING ERRCODE='42501';END IF;
   IF k='vacancies_count'THEN IF jsonb_typeof(v)<>'number'OR(v::text)::numeric<>trunc((v::text)::numeric)OR(v::text)::numeric NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION 'Invalid vacancy count' USING ERRCODE='22023';END IF;
   ELSIF right(k,3)='_id'OR k IN('assigned_to')THEN IF v<>'null'::jsonb AND(jsonb_typeof(v)<>'number'OR(v::text)::numeric<>trunc((v::text)::numeric)OR(v::text)::numeric NOT BETWEEN 1 AND 9007199254740991)THEN RAISE EXCEPTION 'Invalid reference' USING ERRCODE='22023';END IF;
   ELSIF k IN('basic_salary','gross_salary','housing_allowance','transport_allowance','other_allowances','score')THEN
    IF v<>'null'::jsonb AND(jsonb_typeof(v)<>'number'OR(v::text)::numeric NOT BETWEEN 0 AND CASE WHEN k='score'THEN 100 ELSE 9999999999.99 END)THEN RAISE EXCEPTION 'Invalid score or amount' USING ERRCODE='22023';END IF;
   ELSIF k IN('is_required','evidence_required')THEN IF jsonb_typeof(v)<>'boolean'THEN RAISE EXCEPTION 'Invalid checklist flag' USING ERRCODE='22023';END IF;
   ELSIF v<>'null'::jsonb AND(jsonb_typeof(v)<>'string'OR length(v#>>'{}')>5000)THEN RAISE EXCEPTION 'Invalid field text' USING ERRCODE='22023';END IF;
   IF k IN('offer_date','valid_until','proposed_joining_date','due_date','target_start_date')AND v<>'null'::jsonb THEN
    IF(v#>>'{}')!~'^\d{4}-\d{2}-\d{2}$'OR to_char((v#>>'{}')::date,'YYYY-MM-DD')<>v#>>'{}'THEN RAISE EXCEPTION 'Invalid calendar date' USING ERRCODE='22023';END IF;
   END IF;
   next:=next||jsonb_build_object(k,v);
  END LOOP;
 ELSIF data<>'{}'::jsonb THEN RAISE EXCEPTION 'Decision cannot edit material terms' USING ERRCODE='22023';END IF;
 IF candidate IS NOT NULL THEN SELECT c.requisition_id INTO req FROM public.hr_candidates c WHERE c.id=candidate;
  IF action='create'AND next->>'requisition_id'IS NULL AND kind IN('interview','offer')THEN next:=next||jsonb_build_object('requisition_id',req);END IF;
  IF kind IN('interview','offer')AND(next->>'requisition_id')::bigint IS DISTINCT FROM req THEN RAISE EXCEPTION 'Candidate requisition mismatch' USING ERRCODE='23514';END IF;
  SELECT r.owner_company_id,r.branch_id INTO company,branch FROM public.hr_job_requisitions r WHERE r.id=req AND r.deleted_at IS NULL;
 END IF;
 IF employee IS NOT NULL AND candidate IS NULL THEN SELECT e.owner_company_id,e.branch_id INTO company,branch FROM public.employees e WHERE e.id=employee;END IF;
 IF candidate IS NOT NULL AND kind IN('interview','offer','task')AND action NOT IN('archive','cancel','withdraw','reject','expire','not-applicable','block')AND EXISTS(SELECT 1 FROM public.hr_candidates c WHERE c.id=candidate AND(c.candidate_status IN('rejected','withdrawn','blacklisted')OR c.pipeline_stage='closed'OR c.joining_status IN('cancelled','no_show')))THEN RAISE EXCEPTION 'Reopen the candidate/joining journey before continuing work' USING ERRCODE='23514';END IF;
 IF candidate IS NOT NULL AND action='create'AND kind IN('interview','offer')AND EXISTS(SELECT 1 FROM public.employee_recruitment_links WHERE candidate_id=candidate)THEN RAISE EXCEPTION 'Use the employee journey after conversion' USING ERRCODE='23514';END IF;
 IF kind='task'AND action='create'AND candidate IS NOT NULL AND EXISTS(SELECT 1 FROM public.employee_recruitment_links l WHERE l.candidate_id=candidate AND l.employee_id IS DISTINCT FROM employee)THEN RAISE EXCEPTION 'Open the actual converted employee task subject first' USING ERRCODE='23514';END IF;
 IF kind='task'AND candidate IS NOT NULL AND EXISTS(SELECT 1 FROM public.hr_candidates WHERE id=candidate AND joining_status='completed')THEN RAISE EXCEPTION 'Reopen joining before changing its checklist' USING ERRCODE='23514';END IF;
 IF kind IN('interview','task')THEN
  PERFORM 1 FROM public.user_profiles p WHERE p.id=coalesce((next->>'interviewer_id')::bigint,(next->>'assigned_to')::bigint)FOR SHARE;
  PERFORM 1 FROM public.user_roles u WHERE u.user_profile_id=coalesce((next->>'interviewer_id')::bigint,(next->>'assigned_to')::bigint)ORDER BY u.id FOR SHARE;
  PERFORM 1 FROM public.role_permissions p WHERE p.role_id IN(SELECT role_id FROM public.user_roles WHERE user_profile_id=coalesce((next->>'interviewer_id')::bigint,(next->>'assigned_to')::bigint))ORDER BY p.role_id,p.permission_id FOR SHARE;
 END IF;
 IF kind='requisition'THEN
  company:=(next->>'owner_company_id')::bigint;branch:=(next->>'branch_id')::bigint;
  IF coalesce(btrim(next->>'requisition_title'),'')=''OR coalesce(next->>'requisition_status','')NOT IN('draft','open','on_hold','filled','cancelled','closed')OR coalesce(next->>'priority','')NOT IN('low','normal','high','urgent')THEN RAISE EXCEPTION 'Invalid requisition fields' USING ERRCODE='23514';END IF;
  IF NOT erp_private.recruitment_scope(company,branch,'hr.recruitment.manage')THEN RAISE EXCEPTION 'Requisition scope unavailable' USING ERRCODE='42501';END IF;
 END IF;
 IF kind='offer'THEN
  IF next->>'department_id'IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.departments d WHERE d.id=(next->>'department_id')::bigint AND d.deleted_at IS NULL AND(d.owner_company_id IS NULL OR d.owner_company_id=company)AND(d.branch_id IS NULL OR d.branch_id=branch)AND(d.is_active OR old->'department_id'=next->'department_id'))THEN RAISE EXCEPTION 'Department unavailable in employer scope' USING ERRCODE='42501';END IF;
  IF next->>'designation_id'IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.designations d WHERE d.id=(next->>'designation_id')::bigint AND d.deleted_at IS NULL AND(d.owner_company_id IS NULL OR d.owner_company_id=company)AND(d.department_id IS NULL OR d.department_id=(next->>'department_id')::bigint)AND(d.is_active OR old->'designation_id'=next->'designation_id'))THEN RAISE EXCEPTION 'Designation unavailable in department scope' USING ERRCODE='42501';END IF;
  IF next->>'employment_type_id'IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hr_employment_types t WHERE t.id=(next->>'employment_type_id')::bigint AND t.deleted_at IS NULL AND(t.is_active OR old->'employment_type_id'=next->'employment_type_id'))THEN RAISE EXCEPTION 'Employment type unavailable' USING ERRCODE='42501';END IF;
 END IF;
 IF coalesce(next->>'dms_document_id',next->>'offer_document_id')IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.dms_documents d WHERE d.id=coalesce(next->>'dms_document_id',next->>'offer_document_id')::bigint AND d.deleted_at IS NULL AND NOT d.is_archived AND d.owning_company_id IS NOT DISTINCT FROM company AND(d.owning_branch_id IS NULL OR d.owning_branch_id=branch)AND erp_private.document_permission(d.id,'dms.documents.view')AND erp_private.document_permission(d.id,'dms.documents.preview'))THEN RAISE EXCEPTION 'Evidence unavailable in subject scope' USING ERRCODE='42501';END IF;
  IF kind='task'AND NOT(EXISTS(SELECT 1 FROM public.hr_candidate_documents d WHERE d.candidate_id=candidate AND d.dms_document_id=(next->>'dms_document_id')::bigint AND d.deleted_at IS NULL)OR EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=(next->>'dms_document_id')::bigint AND l.entity_type='employee'AND l.entity_id=employee AND l.deleted_at IS NULL))THEN RAISE EXCEPTION 'Evidence must be linked to the actual candidate or employee' USING ERRCODE='23514';END IF;
 END IF;
 IF kind='offer'THEN
  IF action='create'THEN
   SELECT jsonb_build_object('department_id',r.department_id,'designation_id',r.designation_id,'employment_type_id',r.employment_type_id)INTO rec FROM public.hr_job_requisitions r WHERE r.id=req AND r.deleted_at IS NULL;
   next:=coalesce(rec,'{}'::jsonb)||jsonb_build_object('owner_company_id',company,'branch_id',branch)||next;
  END IF;
  IF NOT erp_private.recruitment_scope((next->>'owner_company_id')::bigint,(next->>'branch_id')::bigint,'hr.recruitment.manage')OR ROW((next->>'owner_company_id')::bigint,(next->>'branch_id')::bigint)IS DISTINCT FROM ROW(company,branch)THEN RAISE EXCEPTION 'Offer employer/branch mismatch' USING ERRCODE='42501';END IF;
  IF(next->>'currency')!~'^[A-Z]{3}$'OR(next->>'valid_until')::date<(next->>'offer_date')::date OR(next->>'gross_salary')::numeric<(next->>'basic_salary')::numeric THEN RAISE EXCEPTION 'Invalid offer terms' USING ERRCODE='23514';END IF;
  IF coalesce((next->>'basic_salary')::numeric,0)+coalesce((next->>'housing_allowance')::numeric,0)+coalesce((next->>'transport_allowance')::numeric,0)+coalesce((next->>'other_allowances')::numeric,0)>(next->>'gross_salary')::numeric THEN RAISE EXCEPTION 'Recorded compensation components exceed inclusive gross' USING ERRCODE='23514';END IF;
  material:=old IS NOT NULL AND(next-ARRAY['workspace_revision','updated_at','updated_by','notes','offer_status','approved_terms_version','accepted_terms_version','approved_by','accepted_by'])IS DISTINCT FROM(old-ARRAY['workspace_revision','updated_at','updated_by','notes','offer_status','approved_terms_version','accepted_terms_version','approved_by','accepted_by']);
  IF old IS NOT NULL AND EXISTS(SELECT 1 FROM public.employee_recruitment_links WHERE offer_id=target)AND(material OR action<>'update')THEN RAISE EXCEPTION 'Converted offer terms/acceptance are historical; use employee/joining changes' USING ERRCODE='23514';END IF;
  IF action='create'AND next->>'offer_status'<>'draft'THEN RAISE EXCEPTION 'New offers start as draft' USING ERRCODE='23514';END IF;
  IF action='update'THEN
   IF next->>'offer_status'IS DISTINCT FROM old->>'offer_status'THEN RAISE EXCEPTION 'Use an explicit offer decision' USING ERRCODE='23514';END IF;
   IF material THEN next:=next||jsonb_build_object('terms_version',(old->>'terms_version')::bigint+1,'terms_changed_by',actor,'offer_status','draft','approved_terms_version',null,'accepted_terms_version',null,'approved_by',null,'accepted_by',null,'offer_document_id',null);END IF;
  ELSIF action NOT IN('create','archive')THEN
   status:=old->>'offer_status';
   IF action='submit'AND status IN('draft','rejected')THEN next:=next||jsonb_build_object('offer_status','pending_approval');
   ELSIF action='approve'AND status='pending_approval'THEN
    IF(old->>'terms_changed_by')IS NULL OR(old->>'terms_changed_by')::bigint=actor THEN RAISE EXCEPTION 'An independent authorized HR approver is required' USING ERRCODE='42501';END IF;
    IF NOT(erp_private.permission_in_scope('hr.payroll.view',company,branch)AND erp_private.permission_in_scope('hr.payroll.manage',company,branch))THEN RAISE EXCEPTION 'Separate compensation authority required' USING ERRCODE='42501';END IF;
    next:=next||jsonb_build_object('offer_status','approved','approved_terms_version',next->'terms_version','approved_by',actor);
   ELSIF action='send'AND status='approved'AND next->'approved_terms_version'=next->'terms_version'THEN next:=next||jsonb_build_object('offer_status','sent');
   ELSIF action='accept'AND status IN('approved','sent')AND next->'approved_terms_version'=next->'terms_version'THEN
    IF next->>'valid_until'IS NULL OR(next->>'valid_until')::date<today THEN RAISE EXCEPTION 'A current valid offer is required' USING ERRCODE='23514';END IF;
    next:=next||jsonb_build_object('offer_status','accepted','accepted_terms_version',next->'terms_version','accepted_by',actor);
   ELSIF action IN('reject','withdraw','cancel')AND status NOT IN('withdrawn','cancelled','expired')THEN next:=next||jsonb_build_object('offer_status',CASE action WHEN'reject'THEN'rejected'WHEN'withdraw'THEN'withdrawn'ELSE'cancelled'END,'accepted_terms_version',null);
   ELSIF action='expire'AND next->>'valid_until'IS NOT NULL AND(next->>'valid_until')::date<today THEN next:=next||jsonb_build_object('offer_status','expired','accepted_terms_version',null);
   ELSE RAISE EXCEPTION 'Offer transition unavailable' USING ERRCODE='23514';END IF;
  END IF;
  IF action IN('submit','approve','send','accept')AND(next->>'offer_date'IS NULL OR next->>'valid_until'IS NULL OR next->>'proposed_joining_date'IS NULL OR next->>'owner_company_id'IS NULL OR next->>'basic_salary'IS NULL OR next->>'gross_salary'IS NULL)THEN RAISE EXCEPTION 'Complete reviewed offer terms are required' USING ERRCODE='23514';END IF;
 ELSIF kind='interview'THEN
  IF next->>'interview_round'<>ALL(ARRAY['screening','first','second','technical','final','other'])OR next->>'interview_status'<>ALL(ARRAY['scheduled','completed','cancelled','no_show','rescheduled'])THEN RAISE EXCEPTION 'Invalid interview vocabulary' USING ERRCODE='23514';END IF;
  IF action='create'AND next->>'interview_status'<>'scheduled'THEN RAISE EXCEPTION 'New interview starts scheduled' USING ERRCODE='23514';END IF;
  IF action='update'AND(next->>'interview_status'IS DISTINCT FROM old->>'interview_status'OR(next->>'interview_datetime')::timestamptz IS DISTINCT FROM(old->>'interview_datetime')::timestamptz)THEN RAISE EXCEPTION 'Use a reasoned interview transition/reschedule' USING ERRCODE='23514';END IF;
  IF action='complete'AND(next->>'interview_datetime')::timestamptz IS DISTINCT FROM(old->>'interview_datetime')::timestamptz THEN RAISE EXCEPTION 'Reschedule separately before recording an outcome' USING ERRCODE='23514';END IF;
  IF action IN('complete','reschedule','cancel','no-show')THEN
   IF old->>'interview_status'NOT IN('scheduled','rescheduled')THEN RAISE EXCEPTION 'Interview transition unavailable' USING ERRCODE='23514';END IF;
   next:=next||jsonb_build_object('interview_status',CASE action WHEN'complete'THEN'completed'WHEN'reschedule'THEN'rescheduled'WHEN'no-show'THEN'no_show'ELSE'cancelled'END);
  END IF;
  IF action<>'archive'THEN
   IF NOT erp_private.f12_assignee_allowed((next->>'interviewer_id')::bigint,candidate,null)OR next->>'interview_datetime'IS NULL OR next->>'interview_datetime'!~'(Z|[+-][0-9]{2}:[0-9]{2})$'THEN RAISE EXCEPTION 'A verified interviewer and zoned appointment are required' USING ERRCODE='23514';END IF;
   PERFORM(next->>'interview_datetime')::timestamptz;
   IF action='complete'AND(coalesce(next->>'result','')NOT IN('pass','hold','fail')OR coalesce(btrim(next->>'feedback'),'')=''OR(next->>'interview_datetime')::timestamptz>clock_timestamp())THEN RAISE EXCEPTION 'Actual feedback/result and a reached appointment are required' USING ERRCODE='23514';END IF;
  END IF;
 ELSIF kind='task'THEN
  IF coalesce(btrim(next->>'task_title'),'')=''OR coalesce(btrim(next->>'completion_criteria'),'')=''THEN RAISE EXCEPTION 'Task title and completion criteria are required' USING ERRCODE='23514';END IF;
  IF action='create'AND next->>'task_status'NOT IN('pending','in_progress','blocked')THEN RAISE EXCEPTION 'New task cannot claim completion' USING ERRCODE='23514';END IF;
  IF action='update'AND(old->>'task_status'IN('completed','not_applicable','cancelled')OR next->>'task_status'IS DISTINCT FROM old->>'task_status')THEN RAISE EXCEPTION 'Use an explicit task transition/reopen' USING ERRCODE='23514';END IF;
  IF action='update'AND(next-ARRAY['workspace_revision','updated_at','updated_by','notes'])IS DISTINCT FROM(old-ARRAY['workspace_revision','updated_at','updated_by','notes'])THEN next:=next||jsonb_build_object('checklist_version',(old->>'checklist_version')::bigint+1);END IF;
  IF action IN('complete','start','block','cancel','not-applicable','reopen')THEN
   IF action='reopen'THEN IF old->>'task_status'NOT IN('completed','not_applicable','cancelled','blocked')THEN RAISE EXCEPTION 'Only resolved/blocked tasks can reopen' USING ERRCODE='23514';END IF;
   ELSIF old->>'task_status'IN('completed','not_applicable','cancelled')THEN RAISE EXCEPTION 'First completion cannot be overwritten; reopen explicitly' USING ERRCODE='23514';END IF;
   next:=next||jsonb_build_object('task_status',CASE action WHEN'complete'THEN'completed'WHEN'start'THEN'in_progress'WHEN'block'THEN'blocked'WHEN'not-applicable'THEN'not_applicable'WHEN'cancel'THEN'cancelled'ELSE'pending'END);
   IF action='complete'THEN
    IF(next->>'assigned_to')::bigint IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the recorded authorized assignee can complete the task' USING ERRCODE='42501';END IF;
    IF(next->>'evidence_required')::boolean AND next->>'dms_document_id'IS NULL THEN RAISE EXCEPTION 'Required task evidence is missing' USING ERRCODE='23514';END IF;
    IF next->>'prerequisite_task_id'IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hr_onboarding_tasks t WHERE t.id=(next->>'prerequisite_task_id')::bigint AND t.deleted_at IS NULL AND t.task_status IN('completed','not_applicable')AND t.candidate_id IS NOT DISTINCT FROM candidate AND t.employee_id IS NOT DISTINCT FROM employee)THEN RAISE EXCEPTION 'Required prerequisite is unresolved' USING ERRCODE='23514';END IF;
    next:=next||jsonb_build_object('completed_by',coalesce((old->>'completed_by')::bigint,actor),'completed_at',coalesce((old->>'completed_at')::timestamptz,clock_timestamp()));
   END IF;
  END IF;
  IF action<>'archive'AND(next->>'is_required')::boolean AND(NOT erp_private.f12_assignee_allowed((next->>'assigned_to')::bigint,candidate,employee)OR next->>'due_date'IS NULL)THEN RAISE EXCEPTION 'Required task assignee/due date is unresolved' USING ERRCODE='23514';END IF;
  IF next->>'assigned_to'IS NOT NULL AND NOT erp_private.f12_assignee_allowed((next->>'assigned_to')::bigint,candidate,employee)THEN RAISE EXCEPTION 'Task assignee unavailable in subject scope' USING ERRCODE='42501';END IF;
  IF next->>'prerequisite_task_id'IS NOT NULL AND(NOT EXISTS(SELECT 1 FROM public.hr_onboarding_tasks t WHERE t.id=(next->>'prerequisite_task_id')::bigint AND t.deleted_at IS NULL AND t.candidate_id IS NOT DISTINCT FROM candidate AND t.employee_id IS NOT DISTINCT FROM employee)
   OR EXISTS(WITH RECURSIVE chain AS(SELECT id,prerequisite_task_id,ARRAY[id]path FROM public.hr_onboarding_tasks WHERE id=(next->>'prerequisite_task_id')::bigint UNION ALL SELECT t.id,t.prerequisite_task_id,c.path||t.id FROM public.hr_onboarding_tasks t JOIN chain c ON t.id=c.prerequisite_task_id WHERE NOT t.id=ANY(c.path)AND cardinality(c.path)<128)SELECT 1 FROM chain WHERE id=target OR cardinality(path)>=128))THEN RAISE EXCEPTION 'Invalid/cyclic task prerequisite' USING ERRCODE='23514';END IF;
 ELSIF kind='pipeline'THEN
  IF coalesce(next->>'candidate_status','')NOT IN('new','screening','shortlisted','interview','selected','offered','accepted','rejected','withdrawn','blacklisted')OR coalesce(next->>'pipeline_stage','')NOT IN('new','screening','shortlisted','interview','offer','onboarding','closed')THEN RAISE EXCEPTION 'Invalid candidate progress' USING ERRCODE='23514';END IF;
  IF(next->>'candidate_status')IN('rejected','withdrawn','blacklisted')AND next->>'pipeline_stage'<>'closed'THEN RAISE EXCEPTION 'Rejected/withdrawn progress must explicitly close the pipeline' USING ERRCODE='23514';END IF;
  IF next->>'pipeline_stage'='onboarding'AND NOT EXISTS(SELECT 1 FROM public.hr_offers o WHERE o.candidate_id=candidate AND o.deleted_at IS NULL AND o.offer_status='accepted'AND o.approved_terms_version=o.terms_version AND o.accepted_terms_version=o.terms_version AND o.valid_until>=today)THEN RAISE EXCEPTION 'Onboarding progress requires a current accepted offer' USING ERRCODE='23514';END IF;
 ELSIF kind='joining'THEN
  status:=old->>'joining_status';
  IF action='start'AND status='not_started'THEN next:=next||jsonb_build_object('joining_status','in_progress');
  ELSIF action='finish'AND status='in_progress'THEN
   PERFORM 1 FROM public.hr_onboarding_tasks t WHERE t.candidate_id=candidate AND t.deleted_at IS NULL AND t.is_required ORDER BY t.id FOR SHARE;
   PERFORM 1 FROM public.user_profiles p WHERE p.id IN(SELECT t.assigned_to FROM public.hr_onboarding_tasks t WHERE t.candidate_id=candidate AND t.deleted_at IS NULL AND t.is_required)ORDER BY p.id FOR SHARE;
   PERFORM 1 FROM public.user_roles u WHERE u.user_profile_id IN(SELECT t.assigned_to FROM public.hr_onboarding_tasks t WHERE t.candidate_id=candidate AND t.deleted_at IS NULL AND t.is_required)ORDER BY u.id FOR SHARE;
   IF NOT EXISTS(SELECT 1 FROM public.employee_recruitment_links WHERE candidate_id=candidate)OR NOT EXISTS(SELECT 1 FROM public.hr_onboarding_tasks WHERE candidate_id=candidate AND deleted_at IS NULL AND is_required)
    OR EXISTS(SELECT 1 FROM public.hr_onboarding_tasks t WHERE t.candidate_id=candidate AND t.deleted_at IS NULL AND t.is_required AND(t.task_status NOT IN('completed','not_applicable')OR coalesce(btrim(t.completion_criteria),'')=''OR t.due_date IS NULL OR NOT erp_private.f12_assignee_allowed(t.assigned_to,t.candidate_id,t.employee_id)OR(t.evidence_required AND NOT EXISTS(SELECT 1 FROM public.dms_documents d WHERE d.id=t.dms_document_id AND d.deleted_at IS NULL AND NOT d.is_archived AND d.owning_company_id IS NOT DISTINCT FROM company AND erp_private.document_permission(d.id,'dms.documents.view')AND erp_private.document_permission(d.id,'dms.documents.preview')AND(EXISTS(SELECT 1 FROM public.hr_candidate_documents c WHERE c.candidate_id=candidate AND c.dms_document_id=d.id AND c.deleted_at IS NULL)OR EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='employee'AND l.entity_id=t.employee_id AND l.deleted_at IS NULL))))))THEN RAISE EXCEPTION 'Required joining work is unresolved' USING ERRCODE='23514';END IF;
   next:=next||jsonb_build_object('joining_status','completed');
  ELSIF action IN('cancel','no-show')AND status IN('not_started','in_progress')THEN next:=next||jsonb_build_object('joining_status',CASE action WHEN'cancel'THEN'cancelled'ELSE'no_show'END);
  ELSIF action='reopen'AND status IN('completed','cancelled','no_show')THEN next:=next||jsonb_build_object('joining_status','in_progress');
  ELSE RAISE EXCEPTION 'Joining transition unavailable' USING ERRCODE='23514';END IF;
 END IF;
 IF action='archive'THEN
  IF kind='requisition'AND(EXISTS(SELECT 1 FROM public.hr_candidates WHERE requisition_id=target)OR EXISTS(SELECT 1 FROM public.employee_recruitment_links WHERE requisition_id=target))THEN RAISE EXCEPTION 'Keep a referenced requisition available; close or hold it instead' USING ERRCODE='23514';END IF;
  IF kind='offer'AND EXISTS(SELECT 1 FROM public.employee_recruitment_links WHERE offer_id=target)THEN RAISE EXCEPTION 'The conversion source offer must remain available' USING ERRCODE='23514';END IF;
  IF kind='offer'AND EXISTS(SELECT 1 FROM public.employee_recruitment_links WHERE offer_id=target)THEN RAISE EXCEPTION 'The conversion source offer must remain available' USING ERRCODE='23514';END IF;
  IF kind='task'AND(next->>'is_required')::boolean THEN RAISE EXCEPTION 'Required work must be resolved/waived explicitly, not hidden' USING ERRCODE='23514';END IF;
  next:=next||jsonb_build_object('deleted_at',clock_timestamp(),'deleted_by',actor);
 END IF;
 -- All reference-specific and F03 salary/file guards still run on real DML.
 INSERT INTO erp_private.f12_recruitment_proofs VALUES(auth.uid(),pg_current_xact_id(),pg_backend_pid(),v_table,target);
 IF action='create'THEN
  SELECT string_agg(quote_ident(key),','),string_agg(format('(jsonb_populate_record(NULL::public.%I,$1)).%I',v_table,key),',')INTO cols,vals FROM jsonb_object_keys(next)key;
  EXECUTE format('INSERT INTO public.%I(%s)OVERRIDING SYSTEM VALUE SELECT %s RETURNING to_jsonb(%I)',v_table,cols,vals,v_table)INTO next USING next;
 ELSE
  SELECT string_agg(format('%I=(jsonb_populate_record(NULL::public.%I,$1)).%I',key,v_table,key),',')INTO cols FROM jsonb_object_keys(next)key WHERE key<>'id';
  EXECUTE format('UPDATE public.%I SET %s WHERE id=$2 RETURNING to_jsonb(%I)',v_table,cols,v_table)INTO next USING next,target;
 END IF;
 DELETE FROM erp_private.f12_recruitment_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.backend=pg_backend_pid()AND p.record_id=target AND p.table_name=v_table;
 -- Recheck principal and source after actual writes before confirming receipt.
 IF NOT erp_private.f12_command_subject_allowed(kind,target,candidate,employee)THEN RAISE EXCEPTION 'Recruitment access changed' USING ERRCODE='42501';END IF;
 INSERT INTO erp_private.f12_recruitment_events(actor,actor_id,operation_id,kind,record_id,candidate_id,employee_id,action,reason,old_values,new_values)VALUES(auth.uid(),actor,p_operation,kind,target,candidate,employee,action,why,old,next);
 IF kind IN('joining','pipeline')OR(kind='offer'AND material AND old->>'offer_status'=next->>'offer_status')THEN
  INSERT INTO erp_private.notification_events(event_key,source_table,source_id,event_type,actor_id,source_snapshot)
  VALUES('f12:'||auth.uid()||':'||p_operation,v_table,target,CASE kind WHEN'joining'THEN'joining_changed'WHEN'pipeline'THEN'candidate_progress_changed'ELSE'offer_terms_changed'END,actor,jsonb_strip_nulls(jsonb_build_object('candidate_id',candidate,'employee_id',employee,'joining_status',CASE WHEN kind='joining'THEN next->>'joining_status'END,'candidate_status',CASE WHEN kind='pipeline'THEN next->>'candidate_status'END,'pipeline_stage',CASE WHEN kind='pipeline'THEN next->>'pipeline_stage'END)))ON CONFLICT(event_key)DO NOTHING;
 END IF;
 result:=jsonb_build_object('kind',kind,'id',target,'candidate_id',candidate,'employee_id',employee,'operation_id',p_operation,'revision',next->>'workspace_revision','replayed',false);
 INSERT INTO erp_private.f12_recruitment_receipts(actor,operation_id,request_hash,result)VALUES(auth.uid(),p_operation,hash,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION erp_private.f12_apply_recruitment(uuid,jsonb)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_apply_recruitment(uuid,jsonb)TO authenticated;
CREATE FUNCTION public.f12_mutate_recruitment(p_operation uuid,p_request jsonb)RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.f12_apply_recruitment(p_operation,p_request);$$;
REVOKE ALL ON FUNCTION public.f12_mutate_recruitment(uuid,jsonb)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_mutate_recruitment(uuid,jsonb)TO authenticated;
CREATE FUNCTION public.f12_reconcile_recruitment(p_operation uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 SELECT result INTO r FROM erp_private.f12_recruitment_receipts WHERE actor=auth.uid()AND operation_id=p_operation;
 IF r IS NULL THEN RETURN NULL;END IF;
 IF NOT erp_private.f12_command_subject_allowed(r->>'kind',(r->>'id')::bigint,(r->>'candidate_id')::bigint,(r->>'employee_id')::bigint)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 RETURN r||jsonb_build_object('replayed',true);
END $$;
REVOKE ALL ON FUNCTION public.f12_reconcile_recruitment(uuid)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_reconcile_recruitment(uuid)TO authenticated;
-- Extend, never replace, the existing F06 numbering/proof/receipt consumer.
CREATE FUNCTION public.f12_recruitment_assignees(p_candidate bigint,p_employee bigint,p_search text DEFAULT'',p_after bigint DEFAULT 0)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT erp_private.f12_subject_allowed(p_candidate,p_employee,'hr.recruitment.manage')THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_after IS NULL OR p_after<0 OR p_search IS NULL OR length(p_search)>100 THEN RAISE EXCEPTION 'Invalid lookup' USING ERRCODE='22023';END IF;
 RETURN(SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY x.id),'[]')FROM(SELECT p.id,p.full_name FROM public.user_profiles p WHERE p.id>p_after AND(position(lower(p_search)IN lower(coalesce(p.full_name,'')))>0)AND erp_private.f12_assignee_allowed(p.id,p_candidate,p_employee)ORDER BY p.id LIMIT 26)x);
END $$;
REVOKE ALL ON FUNCTION public.f12_recruitment_assignees(bigint,bigint,text,bigint)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_recruitment_assignees(bigint,bigint,text,bigint)TO authenticated;
CREATE FUNCTION public.f12_requisition_capacity(p_id bigint)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE vacancies bigint;filled bigint;
BEGIN
 IF NOT erp_private.requisition_permission(p_id,'hr.recruitment.view')THEN RAISE EXCEPTION 'Requisition unavailable' USING ERRCODE='42501';END IF;
 SELECT vacancies_count INTO vacancies FROM public.hr_job_requisitions WHERE id=p_id AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Requisition unavailable' USING ERRCODE='42501';END IF;
 SELECT count(*)INTO filled FROM public.employee_recruitment_links WHERE requisition_id=p_id;
 RETURN jsonb_build_object('id',p_id,'vacancies',vacancies,'filled',filled,'remaining',greatest(0,vacancies-filled));
END $$;
REVOKE ALL ON FUNCTION public.f12_requisition_capacity(bigint)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_requisition_capacity(bigint)TO authenticated;
CREATE FUNCTION public.f12_prepare_joining_task(p_candidate bigint)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE employee bigint;
BEGIN
 IF NOT erp_private.candidate_permission(p_candidate,'hr.recruitment.manage')THEN RAISE EXCEPTION 'Candidate unavailable' USING ERRCODE='42501';END IF;
 SELECT l.employee_id INTO employee FROM public.employee_recruitment_links l WHERE l.candidate_id=p_candidate;
 IF employee IS NOT NULL AND NOT erp_private.f12_subject_allowed(p_candidate,employee,'hr.recruitment.manage')THEN RAISE EXCEPTION 'Converted task subject unavailable' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('candidate_id',p_candidate,'employee_id',employee);
END $$;
REVOKE ALL ON FUNCTION public.f12_prepare_joining_task(bigint)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_prepare_joining_task(bigint)TO authenticated;
CREATE FUNCTION public.f12_recruitment_history(p_candidate bigint,p_employee bigint,p_kind text,p_record bigint,p_before bigint DEFAULT 9223372036854775807)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT erp_private.f12_command_subject_allowed(p_kind,p_record,p_candidate,p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind NOT IN('interview','offer','task','joining','requisition','pipeline')OR p_record IS NULL OR p_before IS NULL THEN RAISE EXCEPTION 'Invalid history request' USING ERRCODE='22023';END IF;
 -- History never exports raw offer terms or free-text reasons to a salary-
 -- restricted reader. Full immutable snapshots remain private native evidence.
 RETURN(SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY x.id DESC),'[]')FROM(SELECT e.id,e.action,e.actor_id,e.created_at,CASE WHEN p_kind='offer'THEN NULL ELSE e.reason END reason,e.new_values->>'workspace_revision'revision FROM erp_private.f12_recruitment_events e WHERE e.candidate_id IS NOT DISTINCT FROM p_candidate AND(e.employee_id IS NOT DISTINCT FROM p_employee OR(p_employee IS NOT NULL AND e.employee_id IS NULL))AND e.kind=p_kind AND e.record_id=p_record AND e.id<p_before ORDER BY e.id DESC LIMIT 26)x);
END $$;
REVOKE ALL ON FUNCTION public.f12_recruitment_history(bigint,bigint,text,bigint,bigint)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_recruitment_history(bigint,bigint,text,bigint,bigint)TO authenticated;
CREATE FUNCTION public.f12_recent_recruitment_receipts(p_candidate bigint,p_employee bigint,p_before timestamptz DEFAULT NULL,p_operation uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT erp_private.business_principal_is_active()OR((p_candidate IS NOT NULL OR p_employee IS NOT NULL)AND NOT erp_private.f12_subject_allowed(p_candidate,p_employee,'hr.recruitment.manage'))THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF(p_before IS NULL)<>(p_operation IS NULL)THEN RAISE EXCEPTION 'Invalid receipt cursor' USING ERRCODE='22023';END IF;
 RETURN(SELECT coalesce(jsonb_agg(jsonb_build_object('receipt',x.result||jsonb_build_object('replayed',true),'created_at',x.created_at)ORDER BY x.created_at DESC,x.operation_id DESC),'[]')FROM(SELECT r.result,r.created_at,r.operation_id FROM erp_private.f12_recruitment_receipts r WHERE r.actor=auth.uid()AND(r.result->>'candidate_id')::bigint IS NOT DISTINCT FROM p_candidate AND(r.result->>'employee_id')::bigint IS NOT DISTINCT FROM p_employee AND erp_private.f12_command_subject_allowed(r.result->>'kind',(r.result->>'id')::bigint,p_candidate,p_employee)AND(p_before IS NULL OR(r.created_at,r.operation_id)<(p_before,p_operation))ORDER BY r.created_at DESC,r.operation_id DESC LIMIT 26)x);
END $$;
REVOKE ALL ON FUNCTION public.f12_recent_recruitment_receipts(bigint,bigint,timestamptz,uuid)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_recent_recruitment_receipts(bigint,bigint,timestamptz,uuid)TO authenticated;
ALTER FUNCTION erp_private.validate_recruitment_consumer_input(text,jsonb)RENAME TO f12_validate_recruitment_predecessor;
REVOKE ALL ON FUNCTION erp_private.f12_validate_recruitment_predecessor(text,jsonb)FROM authenticated;
CREATE FUNCTION erp_private.validate_recruitment_consumer_input(p_kind text,p_data jsonb)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_kind='conversion'THEN
  PERFORM erp_private.f12_validate_recruitment_predecessor(p_kind,p_data-ARRAY['offer_revision','offer_terms_version']);
  IF(p_data?'offer_revision'AND coalesce(p_data->>'offer_revision','')!~'^[1-9][0-9]{0,15}$')OR(p_data?'offer_terms_version'AND coalesce(p_data->>'offer_terms_version','')!~'^[1-9][0-9]{0,15}$')THEN RAISE EXCEPTION 'Invalid reviewed offer version' USING ERRCODE='22023';END IF;
 ELSE PERFORM erp_private.f12_validate_recruitment_predecessor(p_kind,p_data);END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.validate_recruitment_consumer_input(text,jsonb)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.validate_recruitment_consumer_input(text,jsonb)TO authenticated;
CREATE FUNCTION erp_private.f12_require_accepted_offer(p_candidate bigint,p_data jsonb)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.hr_offers;c public.hr_candidates;r public.hr_job_requisitions;
BEGIN
 IF NOT erp_private.candidate_permission(p_candidate,'hr.recruitment.manage')THEN RAISE EXCEPTION 'Candidate unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.hr_candidates WHERE id=p_candidate AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO r FROM public.hr_job_requisitions WHERE id=c.requisition_id AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO o FROM public.hr_offers WHERE id=(p_data->>'offer_id')::bigint AND deleted_at IS NULL FOR SHARE;
 IF o.id IS NULL OR r.id IS NULL OR r.requisition_status<>'open'OR c.candidate_status IN('hired','rejected','withdrawn','blacklisted')OR c.pipeline_stage='closed'OR o.candidate_id IS DISTINCT FROM p_candidate OR o.requisition_id IS DISTINCT FROM c.requisition_id
 OR o.requisition_id IS DISTINCT FROM(p_data->>'requisition_id')::bigint OR ROW(o.owner_company_id,o.branch_id)IS DISTINCT FROM ROW((p_data->>'owner_company_id')::bigint,(p_data->>'branch_id')::bigint)
 OR ROW(o.department_id,o.designation_id,o.employment_type_id,o.proposed_joining_date)IS DISTINCT FROM ROW((p_data->>'department_id')::bigint,(p_data->>'designation_id')::bigint,(p_data->>'employment_type_id')::bigint,(p_data->>'joining_date')::date)
 OR o.offer_status<>'accepted'OR o.valid_until IS NULL OR o.valid_until<(now()AT TIME ZONE'Asia/Dubai')::date
 OR o.approved_terms_version IS DISTINCT FROM o.terms_version OR o.accepted_terms_version IS DISTINCT FROM o.terms_version OR o.approved_by IS NULL OR o.accepted_by IS NULL OR o.approved_by IS NOT DISTINCT FROM o.terms_changed_by
 OR o.workspace_revision::text IS DISTINCT FROM p_data->>'offer_revision'OR o.terms_version::text IS DISTINCT FROM p_data->>'offer_terms_version'
 OR NOT erp_private.recruitment_scope(o.owner_company_id,o.branch_id,'hr.recruitment.manage')THEN RAISE EXCEPTION 'A current independently approved and accepted exact offer version is required' USING ERRCODE='23514';END IF;
 IF(SELECT count(*)FROM public.employee_recruitment_links WHERE requisition_id=r.id)>=r.vacancies_count THEN RAISE EXCEPTION 'No unfilled approved vacancy remains' USING ERRCODE='23514';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.f12_require_accepted_offer(bigint,jsonb)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_require_accepted_offer(bigint,jsonb)TO authenticated;
DO $$DECLARE definition text;needle text;BEGIN
 definition:=pg_get_functiondef('public.convert_candidate_to_employee_atomic(bigint,uuid,bigint,jsonb)'::regprocedure);
 needle:='if c.workspace_revision<>p_revision then';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized conversion predecessor';END IF;
 EXECUTE replace(definition,needle,'perform erp_private.f12_require_accepted_offer(p_candidate,p_data); '||needle);
 definition:=pg_get_functiondef('erp_private.prove_recruitment_target_insert()'::regprocedure);
 needle:='v_tasks:=erp_private.lock_conversion_children(v_candidate.id,null);';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized conversion insert proof';END IF;
 EXECUTE replace(definition,needle,'perform erp_private.f12_require_accepted_offer(v_candidate.id,v_data); '||needle);
 -- Verify the authoritative insert proof retains the accepted-offer gate.
 -- Do not inject the same check twice: the preceding block already installed it.
 definition:=pg_get_functiondef('erp_private.prove_recruitment_target_insert()'::regprocedure);
 IF position('perform erp_private.f12_require_accepted_offer(v_candidate.id,v_data); 'IN definition)=0 THEN RAISE EXCEPTION 'Accepted-offer insert proof gate missing';END IF;
 definition:=pg_get_functiondef('public.prepare_numbered_candidate_conversion(bigint)'::regprocedure);
 IF position('offer_status in (''accepted'',''approved'')'IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized conversion preparation';END IF;
 definition:=replace(definition,'offer_status in (''accepted'',''approved'')','offer_status=''accepted'' and approved_terms_version=terms_version and accepted_terms_version=terms_version and approved_by is not null and accepted_by is not null and approved_by<>terms_changed_by and valid_until>=(now()at time zone''Asia/Dubai'')::date');
 definition:=replace(definition,'''proposed_joining_date'',proposed_joining_date)','''proposed_joining_date'',proposed_joining_date,''offer_revision'',workspace_revision::text,''offer_terms_version'',terms_version::text)');
 EXECUTE definition;
END $$;
CREATE FUNCTION erp_private.f12_guard_hiring_state()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='hr_candidates'THEN
  IF TG_OP='INSERT'THEN
   IF NEW.candidate_status='hired'OR NEW.pipeline_stage='hired'OR NEW.joining_status<>'not_started'THEN RAISE EXCEPTION 'A candidate cannot start as a completed hire' USING ERRCODE='23514';END IF;
   RETURN NEW;
  END IF;
  IF NEW.joining_status IS DISTINCT FROM OLD.joining_status AND NOT EXISTS(SELECT 1 FROM erp_private.f12_recruitment_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.backend=pg_backend_pid()AND p.table_name=TG_TABLE_NAME AND p.record_id=NEW.id)THEN RAISE EXCEPTION 'A versioned joining decision is required' USING ERRCODE='42501';END IF;
  IF ROW(NEW.candidate_status,NEW.pipeline_stage)IS DISTINCT FROM ROW(OLD.candidate_status,OLD.pipeline_stage)AND NEW.candidate_status<>'hired'AND NOT EXISTS(SELECT 1 FROM erp_private.f12_recruitment_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.backend=pg_backend_pid()AND p.table_name=TG_TABLE_NAME AND p.record_id=NEW.id)THEN RAISE EXCEPTION 'A versioned candidate progress decision is required' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM public.employee_recruitment_links WHERE candidate_id=NEW.id)AND ROW(NEW.candidate_status,NEW.pipeline_stage)IS DISTINCT FROM ROW('hired'::text,'hired'::text)THEN RAISE EXCEPTION 'Preserve the recorded conversion; use explicit joining cancellation/reopen decisions' USING ERRCODE='23514';END IF;
  IF(NEW.candidate_status='hired'OR NEW.pipeline_stage='hired')AND(NEW.candidate_status IS DISTINCT FROM OLD.candidate_status OR NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage)
   AND NOT EXISTS(SELECT 1 FROM erp_private.recruitment_consumer_proofs p WHERE p.actor=auth.uid()AND p.kind='conversion'AND p.transaction_id=pg_current_xact_id()AND(p.source_json->>'candidate_id')::bigint=NEW.id)THEN RAISE EXCEPTION 'Hiring requires the atomic accepted-offer conversion' USING ERRCODE='42501';END IF;
 ELSE
  IF NEW.vacancies_count<(SELECT count(*)FROM public.employee_recruitment_links WHERE requisition_id=NEW.id)OR(NEW.requisition_status='filled'AND NEW.vacancies_count>(SELECT count(*)FROM public.employee_recruitment_links WHERE requisition_id=NEW.id))THEN RAISE EXCEPTION 'Vacancy/filled state disagrees with actual conversions' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f12_guard_hiring_state()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_hiring_state BEFORE INSERT OR UPDATE ON public.hr_candidates FOR EACH ROW EXECUTE FUNCTION erp_private.f12_guard_hiring_state();
CREATE TRIGGER f12_hiring_state BEFORE INSERT OR UPDATE ON public.hr_job_requisitions FOR EACH ROW EXECUTE FUNCTION erp_private.f12_guard_hiring_state();
CREATE TRIGGER f12_command_guard BEFORE UPDATE OR DELETE ON public.hr_job_requisitions FOR EACH ROW EXECUTE FUNCTION erp_private.f12_guard_recruitment_write();
-- F10 retains its frozen roster, current authority and in-app-only HR defaults.
-- Add only the candidate joining source; do not activate any dispatcher.
DO $$DECLARE definition text;needle text;BEGIN
 definition:=pg_get_functiondef('public.f10_notification_target(text,bigint)'::regprocedure);
 -- The accepted F10 target already resolves candidates through current
 -- candidate_permission. Do not inject into both its statement CASE and its
 -- later URL-expression CASE (their WHEN labels intentionally overlap).
 IF position('WHEN ''hr_candidates'' THEN candidate_id:=$2;'IN definition)=0 OR position('erp_private.candidate_permission(candidate_id,''hr.recruitment.view'')'IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized candidate notification target';END IF;
 definition:=pg_get_functiondef('public.f10_record_notification_recipient(bigint,uuid,bigint,boolean)'::regprocedure);
 needle:='''hr_interviews'',''hr_offers'',''hr_onboarding_tasks''';
 IF(length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unrecognized HR in-app event adapter';END IF;
 EXECUTE replace(definition,needle,needle||',''hr_candidates''');
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
