BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Mobile v1 uses positive leave IDs for history, receipts and cancellation. Reserve
-- those IDs from the existing leave sequence without writing a second leave record.
CREATE TABLE erp_private.hr_mobile_managed_leave (
 case_id bigint PRIMARY KEY REFERENCES erp_private.t04_cases(id),
 request_id bigint NOT NULL UNIQUE,
 leave_type_id bigint NOT NULL REFERENCES public.hr_leave_types(id),
 submission_reason text NOT NULL,
 withdrawal_reason text,
 document_id bigint REFERENCES public.dms_documents(id),
 version_id bigint REFERENCES public.dms_document_versions(id),
 original_file_id bigint REFERENCES public.dms_document_files(id),
 original_sha256 text,
 original_bytes bigint,
 CHECK (num_nonnulls(document_id,version_id,original_file_id,original_sha256,original_bytes) IN (0,5))
);
ALTER TABLE erp_private.hr_mobile_managed_leave ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE erp_private.hr_mobile_managed_leave FROM PUBLIC,anon,authenticated,service_role;

-- Keep the reviewed T04 state machine, including funding, dated evidence,
-- receipt handling and accounting, in one routine for both entry points.
DO $patch$
DECLARE definition text;
DECLARE revised text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p
 WHERE p.oid='public.t04_leave_command(bigint,bigint,text,jsonb,uuid)'::regprocedure
   AND md5(p.prosrc)='7b9982449e2384672857c11f59e41f8f';
 revised:=replace(definition,
  'public.t04_leave_command(p_employee bigint, p_case bigint, p_action text, p_data jsonb, p_operation uuid)',
  'erp_private.t04_execute_leave_command(p_employee bigint, p_case bigint, p_action text, p_data jsonb, p_operation uuid, p_mobile_self boolean)');
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected T04 command signature'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$ employee:=erp_private.t04_scope(p_employee,needed,true);$old$,
  $new$ IF p_mobile_self THEN
  IF p_action NOT IN ('submit','withdraw') OR NOT erp_private.business_principal_is_active()
    OR NOT erp_private.mobile_hr_self(p_employee)
    OR NOT erp_private.employee_permission(p_employee,'hr.requests.submit')
    OR NOT erp_private.mobile_hr_domain(p_employee,'leave','{}') THEN
   RAISE EXCEPTION 'Current own leave authority required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT employee FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;
 ELSE
  employee:=erp_private.t04_scope(p_employee,needed,true);
 END IF;$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected T04 scope predecessor'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$   RAISE EXCEPTION 'Leave scope changed' USING ERRCODE='42501'; END IF;
 END IF;$old$,$new$   RAISE EXCEPTION 'Leave scope changed' USING ERRCODE='42501'; END IF;
  IF p_mobile_self AND (request.submitted_by IS DISTINCT FROM auth.uid()
    OR NOT EXISTS(SELECT 1 FROM erp_private.hr_mobile_managed_leave l WHERE l.case_id=request.id)) THEN
   RAISE EXCEPTION 'Own Mobile HR request required' USING ERRCODE='42501'; END IF;
 END IF;$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected T04 case scope predecessor'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$ ELSIF p_action='review' AND request.status='pending' THEN$old$,
  $new$ ELSIF p_action='review' AND request.status='pending' THEN
  IF request.submitted_by=auth.uid() AND EXISTS(SELECT 1 FROM erp_private.hr_mobile_managed_leave l WHERE l.case_id=request.id) THEN
   RAISE EXCEPTION 'Independent PRO review required' USING ERRCODE='42501'; END IF;$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected T04 review predecessor'; END IF;
 EXECUTE revised;
END;
$patch$;
REVOKE ALL ON FUNCTION erp_private.t04_execute_leave_command(bigint,bigint,text,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.t04_leave_command(p_employee bigint,p_case bigint,p_action text,p_data jsonb,p_operation uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.t04_execute_leave_command($1,$2,$3,$4,$5,false);
$$;

CREATE FUNCTION erp_private.mobile_hr_managed_leave(p_employee bigint,p_operation uuid,p_action text,p_data jsonb,p_category text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE outcome jsonb;
DECLARE quote jsonb;
DECLARE managed erp_private.hr_mobile_managed_leave;
DECLARE file public.dms_document_files;
DECLARE from_day date;
DECLARE to_day date;
BEGIN
 IF p_action='leave.submit' THEN
  from_day:=(p_data->>'startDate')::date;
  to_day:=(p_data->>'endDate')::date;
  -- Match the existing T04 legacy guard so cross-boundary dates remain subject
  -- to the canonical quote, including verified openings for the entire span.
  IF p_category IS NULL OR NOT EXISTS(
    SELECT 1 FROM erp_private.t04_periods p WHERE p.employee_id=p_employee
    AND from_day<upper(p.coverage) AND to_day>=lower(p.coverage)) THEN RETURN NULL; END IF;
  quote:=erp_private.t04_quote(p_employee,p_category,from_day,to_day,NULL);
  IF quote->>'status' IS DISTINCT FROM 'ready' THEN
   RAISE EXCEPTION 'Managed leave requires PRO review before it can be submitted' USING ERRCODE='23514'; END IF;
  IF p_data?'documentId' THEN
   SELECT f.* INTO STRICT file FROM public.dms_document_files f
   WHERE f.document_id=(p_data->>'documentId')::bigint AND f.version_id=(p_data->>'documentVersionId')::bigint
    AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status<>'failed'
    AND f.file_size_bytes>0 AND f.sha256_hash~'^[a-f0-9]{64}$' FOR SHARE;
  END IF;
  outcome:=erp_private.t04_execute_leave_command(p_employee,NULL,'submit',
    jsonb_build_object('category',p_category,'from',from_day,'to',to_day,'fingerprint',quote->>'fingerprint'),p_operation,true);
  INSERT INTO erp_private.hr_mobile_managed_leave(case_id,request_id,leave_type_id,submission_reason,
    document_id,version_id,original_file_id,original_sha256,original_bytes)
  VALUES ((outcome->>'id')::bigint,nextval('public.employee_leave_requests_id_seq'::regclass),
    (p_data->>'leaveTypeId')::bigint,p_data->>'reason',file.document_id,file.version_id,file.id,file.sha256_hash,file.file_size_bytes)
  RETURNING * INTO managed;
 ELSE
  SELECT * INTO managed FROM erp_private.hr_mobile_managed_leave WHERE request_id=(p_data->>'id')::bigint;
  IF NOT FOUND THEN RETURN NULL; END IF;
  outcome:=erp_private.t04_execute_leave_command(p_employee,managed.case_id,'withdraw',
    jsonb_build_object('revision',p_data->'revision'),p_operation,true);
  UPDATE erp_private.hr_mobile_managed_leave SET withdrawal_reason=p_data->>'reason' WHERE case_id=managed.case_id;
 END IF;
 RETURN jsonb_build_object('id',managed.request_id,'caseId',managed.case_id,'revision',outcome->'revision',
    'status',CASE WHEN p_action='leave.submit' THEN 'pending' ELSE 'cancelled' END);
END;
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_managed_leave(bigint,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

-- The pinned submission is retained separately from the independent reviewerâ€™s proof.
CREATE FUNCTION erp_private.t04_mobile_evidence_matches(p_case bigint,p_document bigint,p_version bigint,p_file bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT NOT EXISTS (
  SELECT 1 FROM erp_private.hr_mobile_managed_leave l WHERE l.case_id=p_case AND l.document_id IS NOT NULL
  AND (l.document_id IS DISTINCT FROM p_document OR l.version_id IS DISTINCT FROM p_version
    OR (p_file IS NOT NULL AND l.original_file_id IS DISTINCT FROM p_file)
    OR NOT EXISTS (SELECT 1 FROM public.dms_document_files f WHERE f.id=l.original_file_id
      AND f.document_id=l.document_id AND f.version_id=l.version_id AND f.file_role='original'
      AND f.deleted_at IS NULL AND f.integrity_status='verified'
      AND f.file_size_bytes=l.original_bytes AND f.sha256_hash=l.original_sha256)));
$$;
REVOKE ALL ON FUNCTION erp_private.t04_mobile_evidence_matches(bigint,bigint,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

-- For unmanaged SICK approvals, resolve the one already reviewed medical
-- record for the submitted original. F11 still validates and consumes T01 proof.
CREATE FUNCTION erp_private.mobile_hr_legacy_sick_payload(p_leave public.employee_leave_requests)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE certificate erp_private.hr_self_leave_evidence;
DECLARE medical_id bigint;
DECLARE medical_count bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.hr_leave_types t WHERE t.id=p_leave.leave_type_id
    AND erp_private.t01_requires_sick_certificate(t.code,t.requires_document)) THEN RETURN '{}'::jsonb; END IF;
 IF NOT erp_private.t01_leave_certificate_authorized(p_leave.employee_id) THEN
  RAISE EXCEPTION 'Current medical certificate reviewer required' USING ERRCODE='42501'; END IF;
 SELECT * INTO certificate FROM erp_private.hr_self_leave_evidence WHERE leave_id=p_leave.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current verified certificate required' USING ERRCODE='23514'; END IF;
 SELECT min(m.id),count(*) INTO medical_id,medical_count FROM public.employee_medical_records m
 WHERE m.employee_id=p_leave.employee_id AND m.deleted_at IS NULL AND m.dms_document_id=certificate.document_id
   AND erp_private.f12_verified_evidence('medical-record',p_leave.employee_id,m.id);
 IF medical_count<>1 THEN RAISE EXCEPTION 'One matching verified medical record is required' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('medical_record_id',medical_id,'version_id',certificate.version_id);
END;
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_legacy_sick_payload(public.employee_leave_requests) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE definition text;
DECLARE revised text;
BEGIN
 SELECT replace(pg_get_functiondef(p.oid),E'\r\n',E'\n') INTO STRICT definition FROM pg_proc p
 WHERE p.oid='erp_private.mobile_hr_command(text,jsonb,boolean)'::regprocedure
   AND md5(p.prosrc)='4bd9fab8e43e36b7d157eac3a416d00d';
 revised:=replace(definition,$old$ attachments boolean; evidence erp_private.hr_self_leave_evidence; is_officer boolean;$old$,
   $new$ attachments boolean; evidence erp_private.hr_self_leave_evidence; is_officer boolean;
 managed jsonb; managed_case bigint;$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR declaration'; END IF;
 definition:=revised;
 revised:=replace(definition,
  $old$  INSERT INTO erp_private.hr_self_leave_admissions VALUES(auth.uid(),pg_current_xact_id(),pg_backend_pid(),eid,op,d,action,digest);
  IF action='leave.submit' THEN$old$,$new$   IF action='leave.submit' THEN$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR admission predecessor'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$   INSERT INTO public.employee_leave_requests(employee_id,leave_type_id,start_date,end_date,total_days,reason,approval_status,created_by,updated_by,sick_cert_dms_id)$old$,
  $new$    managed:=erp_private.mobile_hr_managed_leave(eid,op,action,d,
      CASE WHEN typ.code IN ('ANNUAL','UNPAID','SICK') THEN lower(typ.code) END);
    IF managed IS NULL THEN
    INSERT INTO erp_private.hr_self_leave_admissions VALUES(auth.uid(),pg_current_xact_id(),pg_backend_pid(),eid,op,d,action,digest);
    INSERT INTO public.employee_leave_requests(employee_id,leave_type_id,start_date,end_date,total_days,reason,approval_status,created_by,updated_by,sick_cert_dms_id)$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR submit predecessor'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$   status:='pending';
  ELSE
   SELECT * INTO original FROM public.employee_leave_requests WHERE id=target_id AND employee_id=eid AND deleted_at IS NULL FOR UPDATE;$old$,
  $new$    status:='pending';
    END IF;
   ELSE
    managed:=erp_private.mobile_hr_managed_leave(eid,op,action,d,NULL);
    IF managed IS NULL THEN
    INSERT INTO erp_private.hr_self_leave_admissions VALUES(auth.uid(),pg_current_xact_id(),pg_backend_pid(),eid,op,d,action,digest);
    SELECT * INTO original FROM public.employee_leave_requests WHERE id=target_id AND employee_id=eid AND deleted_at IS NULL FOR UPDATE;$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR cancel predecessor'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$   status:='cancelled';
  END IF;
  IF EXISTS(SELECT FROM erp_private.hr_self_leave_admissions$old$,
  $new$    status:='cancelled';
    END IF;
   END IF;
   IF managed IS NOT NULL THEN
    target_id:=(managed->>'id')::bigint; rev:=(managed->>'revision')::bigint;
    status:=managed->>'status'; managed_case:=(managed->>'caseId')::bigint;
   END IF;
   IF EXISTS(SELECT FROM erp_private.hr_self_leave_admissions$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR result predecessor'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$  fhash:=encode(sha256(convert_to(jsonb_build_array(fkind,eid,target_id,original_rev,decision,payload)::text,'UTF8')),'hex');$old$,
  $new$   IF domain='leave' AND decision='approve' THEN
    PERFORM erp_private.mobile_hr_check_leave_certificate(original);
    payload:=erp_private.mobile_hr_legacy_sick_payload(original);
   END IF;
   fhash:=encode(sha256(convert_to(jsonb_build_array(fkind,eid,target_id,original_rev,decision,payload)::text,'UTF8')),'hex');$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR legacy decision predecessor'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$   IF domain='leave' AND decision='approve' THEN PERFORM erp_private.mobile_hr_check_leave_certificate(original); END IF;
   $old$,'');
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR certificate predecessor'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$,'HR',CASE domain WHEN 'leave' THEN 'employee_leave_requests'$old$,
  $new$,'HR',CASE domain WHEN 'leave' THEN CASE WHEN managed_case IS NULL THEN 'employee_leave_requests' ELSE 't04_cases' END$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR audit entity predecessor'; END IF;
 definition:=revised;
 revised:=replace(definition,$old$END,target_id,action,result);$old$,$new$END,coalesce(managed_case,target_id),action,result);$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR audit ID predecessor'; END IF;
 EXECUTE revised;

 SELECT replace(pg_get_functiondef(p.oid),E'\r\n',E'\n') INTO STRICT definition FROM pg_proc p
 WHERE p.oid='erp_private.mobile_hr_leave_read(bigint,text,bigint)'::regprocedure
   AND md5(p.prosrc)='ad471929eab5feb4dfaa4b095e03043a';
 revised:=replace(definition,$old$       WHERE l.employee_id=p_employee AND l.deleted_at IS NULL ORDER BY l.start_date DESC,l.id DESC LIMIT 26 OFFSET (p_cursor-1)*25) x);$old$,
  $new$       WHERE l.employee_id=p_employee AND l.deleted_at IS NULL
       UNION ALL
       SELECT ml.request_id,c.revision::text,coalesce(t.name_en,'Leave request'),lower(c.dates),upper(c.dates)-1,
         CASE c.status WHEN 'reviewed' THEN 'pending' WHEN 'withdrawn' THEN 'cancelled' ELSE c.status END,
         (c.status IN('pending','reviewed') AND c.submitted_by=auth.uid() AND p_employee=erp_private.mobile_hr_linked_id()
           AND erp_private.employee_permission(p_employee,'hr.requests.submit'))
       FROM erp_private.t04_cases c JOIN erp_private.hr_mobile_managed_leave ml ON ml.case_id=c.id
       JOIN public.employees e ON e.id=c.employee_id AND e.deleted_at IS NULL AND e.owner_company_id=c.company_id
        AND e.branch_id IS NOT DISTINCT FROM c.branch_id
       LEFT JOIN public.hr_leave_types t ON t.id=ml.leave_type_id
       WHERE c.employee_id=p_employee ORDER BY "startDate" DESC,id DESC LIMIT 26 OFFSET (p_cursor-1)*25) x);$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR leave history predecessor'; END IF;
 EXECUTE revised;

 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p
 WHERE p.oid='public.t04_read_leave_request(bigint,bigint)'::regprocedure
   AND md5(p.prosrc)='c7b94a141b6cd1eb8e26fe4daf6a6b09';
 revised:=replace(definition,$old$  'from',lower(request.dates),'to',upper(request.dates)-1,$old$,
  $new$  'from',lower(request.dates),'to',upper(request.dates)-1,
  'employee_reason',CASE WHEN erp_private.employee_permission(p_employee,'hr.medical.view') THEN
    (SELECT l.submission_reason FROM erp_private.hr_mobile_managed_leave l WHERE l.case_id=request.id) END,$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected T04 request detail predecessor'; END IF;
 EXECUTE revised;

 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p
 WHERE p.oid='public.t04_leave_certificate_choices(bigint,bigint)'::regprocedure
   AND md5(p.prosrc)='0281b68cecaab01a9fd69fb9c86759ff';
 revised:=replace(definition,$old$    AND erp_private.f12_verified_evidence('medical-record',p_employee,m.id)$old$,
  $new$    AND erp_private.f12_verified_evidence('medical-record',p_employee,m.id)
    AND erp_private.t04_mobile_evidence_matches(request.id,d.id,d.current_version_id,NULL)$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected T04 certificate choices predecessor'; END IF;
 EXECUTE revised;

 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p
 WHERE p.oid='public.t04_verify_sick_evidence(bigint,bigint,bigint,bigint,bigint,uuid)'::regprocedure
   AND md5(p.prosrc)='6ca87ee29bf0d5e2aeeba5be7edfc073';
 revised:=replace(definition,$old$  AND erp_private.f12_verified_evidence('medical-record',p_employee,p_medical)$old$,
  $new$  AND erp_private.f12_verified_evidence('medical-record',p_employee,p_medical)
  AND erp_private.t04_mobile_evidence_matches(request.id,d.id,v.id,f.id)$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected T04 evidence review predecessor'; END IF;
 EXECUTE revised;

 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p
 WHERE p.oid='erp_private.t04_current_evidence(bigint,bigint)'::regprocedure
   AND md5(p.prosrc)='afeaab40f26348b66d15aae82cdf8b8b';
 revised:=replace(definition,$old$   AND erp_private.t02_digest(to_jsonb(r))=evidence.medical_digest$old$,
  $new$   AND erp_private.t02_digest(to_jsonb(r))=evidence.medical_digest
   AND erp_private.t04_mobile_evidence_matches(p_case,d.id,v.id,f.id)$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected T04 evidence verification predecessor'; END IF;
 EXECUTE revised;
END;
$patch$;

NOTIFY pgrst,'reload schema';
COMMIT;
