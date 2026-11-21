BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.t04_scope(p_employee bigint,p_capabilities text[],p_lock boolean DEFAULT false)
RETURNS public.employees LANGUAGE plpgsql SET search_path='' AS $$
DECLARE employee public.employees;
DECLARE capability text;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Leave scope unavailable' USING ERRCODE='42501'; END IF;
 IF p_lock THEN
  SELECT * INTO employee FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;
 ELSE
  SELECT * INTO employee FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 END IF;
 IF employee.id IS NOT NULL THEN
  FOREACH capability IN ARRAY p_capabilities LOOP
   IF erp_private.t02_has_scope(capability,employee.owner_company_id,employee.branch_id) THEN RETURN employee; END IF;
  END LOOP;
 END IF;
 RAISE EXCEPTION 'Leave scope unavailable' USING ERRCODE='42501';
END;
$$;

CREATE FUNCTION erp_private.t04_quote(p_employee bigint,p_category text,p_from date,p_to date,p_exclude bigint)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d date;
DECLARE today date:=erp_private.t04_today();
DECLARE employee public.employees;
DECLARE employment erp_private.t03_employment_periods;
DECLARE policy erp_private.t04_policies;
DECLARE entitlement erp_private.t04_periods;
DECLARE anchor date;
DECLARE fund bigint;
DECLARE available numeric;
DECLARE used integer;
DECLARE rate numeric;
DECLARE booked integer;
DECLARE identified bigint;
DECLARE facts jsonb:='[]'::jsonb;
DECLARE result jsonb;
BEGIN
 IF p_category IS NULL OR p_category NOT IN('annual','unpaid','sick') OR NOT coalesce(isfinite(p_from) AND isfinite(p_to)
   AND p_to>=p_from AND p_to-p_from<366,false) THEN RAISE EXCEPTION 'Choose a valid leave span' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT employee FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;
 employment:=erp_private.t04_employment(p_employee,p_from);
 IF employment.id IS NULL OR employee.owner_company_id<>employment.company_id OR employee.branch_id IS DISTINCT FROM employment.branch_id
  OR NOT (employment.work_period @> p_to) THEN
  RETURN jsonb_build_object('status','review-required','reason','Employment coverage for these dates needs review.');
 END IF;
 IF EXISTS(SELECT 1 FROM public.employee_leave_requests r WHERE r.employee_id=p_employee AND r.deleted_at IS NULL
    AND r.approval_status IN('pending','approved') AND r.start_date<=p_to AND r.end_date>=p_from) THEN
  RETURN jsonb_build_object('status','review-required','reason','A legacy leave request overlaps these dates.');
 END IF;
 IF EXISTS(SELECT 1 FROM public.employee_attendance_daily_summary a WHERE a.employee_id=p_employee AND a.attendance_date BETWEEN p_from AND p_to
    AND (coalesce(a.total_hours,0)>0 OR coalesce(jsonb_array_length(a.entered_intervals),0)>0)) THEN
  RETURN jsonb_build_object('status','review-required','reason','Recorded attendance overlaps these dates.');
 END IF;
 FOR d IN SELECT p_from+i FROM generate_series(0,p_to-p_from) i LOOP
  policy:=erp_private.t04_policy(employment.company_id,p_employee,d);
  IF policy.id IS NULL THEN RETURN jsonb_build_object('status','review-required','reason','An approved policy is missing for part of this range.'); END IF;
  IF policy.facts->'excluded_dates' ? d::text THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM erp_private.t04_days x WHERE x.employee_id=p_employee AND x.day=d
     AND x.state IN('posted','reserved') AND x.case_id IS DISTINCT FROM p_exclude) THEN
   RETURN jsonb_build_object('status','review-required','reason','Another request already covers a requested day.');
  END IF;
  fund:=NULL; rate:=0; entitlement:=NULL;
  IF p_category<>'unpaid' THEN
   anchor:=erp_private.t04_service_start(employment,policy.facts);
   SELECT * INTO entitlement FROM erp_private.t04_periods p WHERE p.employee_id=p_employee AND p.company_id=employment.company_id
    AND p.service_start=anchor AND p.coverage @> d AND p.cutoff<=d;
   IF entitlement.id IS NULL OR entitlement.cutoff>today THEN
    RETURN jsonb_build_object('status','review-required','reason','The reviewed opening balance is unavailable for part of the request.');
   END IF;
   IF p_category='annual' AND d>=(anchor+make_interval(months=>(policy.facts->>'annual_wait_months')::int))::date THEN
    -- Carried funds retain the original source order and their approved expiry.
    FOR identified IN SELECT m.id FROM erp_private.f12_leave_movements m
      JOIN erp_private.f12_leave_movements prior ON prior.id=m.paired_movement_id
     WHERE m.entitlement_id=entitlement.id AND m.effect='carry-in' AND m.expires_before>greatest(today,d)
     ORDER BY prior.period_start,m.id LOOP
      SELECT count(*) INTO booked FROM jsonb_array_elements(facts) x WHERE (x->>'fund_id')::bigint=identified AND (x->>'rate')::numeric=1;
      IF erp_private.t04_funds_remaining(entitlement.id,identified,today,p_exclude)-booked>=1 THEN fund:=identified;rate:=1;EXIT; END IF;
    END LOOP;
    IF fund IS NULL THEN
     SELECT count(*) INTO booked FROM jsonb_array_elements(facts) x
       WHERE (x->>'period_id')::bigint=entitlement.id AND x->>'fund_id' IS NULL AND (x->>'rate')::numeric=1;
     available:=erp_private.t04_funds_remaining(entitlement.id,NULL,today,p_exclude)-booked;
     IF available>=1 THEN rate:=1; END IF;
    END IF;
   ELSIF p_category='sick' THEN
    IF EXISTS(SELECT 1 FROM erp_private.t04_days x JOIN erp_private.t04_cases c ON c.id=x.case_id
       WHERE x.period_id=entitlement.id AND x.day>d AND x.state='posted' AND c.category='sick'
        AND x.case_id IS DISTINCT FROM p_exclude) THEN
     RETURN jsonb_build_object('status','review-required','reason','A later approved sick band needs reconciliation first.');
    END IF;
    SELECT count(*) INTO used FROM erp_private.t04_days x JOIN erp_private.t04_cases c ON c.id=x.case_id
     WHERE x.period_id=entitlement.id AND x.day<d AND x.state='posted' AND c.category='sick';
    SELECT count(*) INTO booked FROM jsonb_array_elements(facts) x WHERE (x->>'period_id')::bigint=entitlement.id;
    used:=used+booked+entitlement.opening_sick;
    IF d>=(anchor+make_interval(months=>(policy.facts->>'sick_wait_months')::int))::date THEN
     IF used<(policy.facts->>'sick_full_days')::int THEN rate:=1;
     ELSIF used<(policy.facts->>'sick_full_days')::int+(policy.facts->>'sick_partial_days')::int THEN rate:=(policy.facts->>'sick_partial_rate')::numeric;
     END IF;
    END IF;
   END IF;
  END IF;
  facts:=facts||jsonb_build_array(jsonb_build_object('day',d,'period_id',entitlement.id,'fund_id',fund,'rate',rate,'policy_id',policy.id));
 END LOOP;
 IF jsonb_array_length(facts)=0 THEN RETURN jsonb_build_object('status','review-required','reason','The policy excludes every requested date.'); END IF;
 result:=jsonb_build_object('status','ready','employment_id',employment.id,'category',p_category,'from',p_from,'to',p_to,'days',facts,
    'paid_days',(SELECT count(*) FROM jsonb_array_elements(facts) x WHERE (x->>'rate')::numeric=1),
    'partial_days',(SELECT count(*) FROM jsonb_array_elements(facts) x WHERE (x->>'rate')::numeric BETWEEN 0.0001 AND 0.9999),
    'unpaid_days',(SELECT count(*) FROM jsonb_array_elements(facts) x WHERE (x->>'rate')::numeric=0));
 -- The allocation is the snapshot. Identical quotes retain the same digest;
 -- a changed rate, source bucket, eligible date or policy version requires PRO review.
 RETURN result||jsonb_build_object('fingerprint',erp_private.t02_digest(result),'as_of_date',today);
END;
$$;

CREATE FUNCTION public.t04_leave_preview(p_employee bigint,p_category text,p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM erp_private.t04_scope(p_employee,ARRAY['hr.leave.assist','hr.leave.approve','hr.leave.sick.review']);
 RETURN erp_private.t04_quote(p_employee,p_category,p_from,p_to,NULL);
END;
$$;

CREATE FUNCTION public.t04_leave_balance(p_employee bigint,p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee public.employees;
DECLARE employment erp_private.t03_employment_periods;
DECLARE policy erp_private.t04_policies;
DECLARE period erp_private.t04_periods;
DECLARE today date:=erp_private.t04_today();
DECLARE carry numeric;
DECLARE reserved integer;
DECLARE used numeric;
BEGIN
 employee:=erp_private.t04_scope(p_employee,ARRAY['hr.leave.view','hr.leave.assist','hr.leave.approve','hr.leave.sick.review']);
 employment:=erp_private.t04_employment(p_employee,p_day);
 policy:=erp_private.t04_policy(employee.owner_company_id,p_employee,p_day);
 SELECT * INTO period FROM erp_private.t04_periods p WHERE p.employee_id=p_employee AND p.company_id=employee.owner_company_id
  AND p.service_start=erp_private.t04_service_start(employment,policy.facts) AND p.coverage @> p_day;
 IF employment.company_id IS DISTINCT FROM employee.owner_company_id OR employment.branch_id IS DISTINCT FROM employee.branch_id
   OR period.id IS NULL OR period.cutoff>today THEN
  RETURN jsonb_build_object('status','review-required','as_of_date',today,'reason','Verified opening balance unavailable.');
 END IF;
 SELECT coalesce(sum(erp_private.t04_funds_remaining(period.id,m.id,today,NULL)),0) INTO carry
 FROM erp_private.f12_leave_movements m WHERE m.entitlement_id=period.id AND m.effect='carry-in' AND m.expires_before>today;
 SELECT count(*) INTO reserved FROM erp_private.t04_days x JOIN erp_private.t04_cases c ON c.id=x.case_id
  WHERE x.period_id=period.id AND x.state='reserved' AND x.rate=1 AND c.category='annual';
 SELECT period.opening_used-coalesce(sum(days),0) INTO used FROM erp_private.f12_leave_movements
  WHERE entitlement_id=period.id AND movement_version=2 AND effect IN('consume','reverse');
 RETURN jsonb_build_object('status','ready','as_of_date',today,'id',period.id,'period_start',lower(period.coverage),
    'period_end',upper(period.coverage)-1,'opening_cutoff',period.cutoff,'full_entitlement',period.full_entitlement,
    'earned',erp_private.t04_earned(period,today),'reserved',reserved,'approved_usage',used,'carry_available',carry,
    'available',CASE WHEN today<upper(period.coverage) THEN erp_private.t04_funds_remaining(period.id,NULL,today,NULL)+carry ELSE 0 END);
END;
$$;

-- Reuse the F12 verified medical record at evidence review. Operational
-- approval can check whether that exact proof is current without exposing it.
CREATE FUNCTION erp_private.t04_current_evidence(p_case bigint,p_employee bigint)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE evidence erp_private.t04_sick_evidence;
BEGIN
 SELECT * INTO evidence FROM erp_private.t04_sick_evidence WHERE case_id=p_case ORDER BY id DESC LIMIT 1;
 IF evidence.id IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.employee_medical_records r
 JOIN public.dms_documents d ON d.id=r.dms_document_id
 JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id
 JOIN public.dms_document_files f ON f.id=evidence.file_id AND f.version_id=v.id AND f.document_id=d.id
 WHERE r.id=evidence.medical_id AND r.employee_id=p_employee AND r.deleted_at IS NULL
   AND d.id=evidence.document_id AND d.deleted_at IS NULL AND NOT d.is_archived AND v.id=evidence.version_id AND v.unlinked_at IS NULL
   AND f.deleted_at IS NULL AND f.file_role='original' AND f.integrity_status='verified'
   AND f.file_size_bytes>0 AND f.sha256_hash=evidence.file_digest
 FOR SHARE OF r,d,v,f;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN evidence.verification_id IS NOT DISTINCT FROM (
   SELECT h.id FROM erp_private.f12_evidence_verifications h WHERE h.employee_id=p_employee
    AND h.source_kind='medical-record' AND h.source_id=evidence.medical_id ORDER BY h.id DESC LIMIT 1);
END;
$$;

CREATE FUNCTION public.t04_verify_sick_evidence(p_employee bigint,p_case bigint,p_revision bigint,
  p_medical bigint,p_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee public.employees;
DECLARE request erp_private.t04_cases;
DECLARE certificate record;
DECLARE hashed text;
DECLARE saved jsonb;
BEGIN
 employee:=erp_private.t04_scope(p_employee,ARRAY['hr.leave.sick.review'],true);
 IF NOT erp_private.employee_permission(p_employee,'hr.medical.view') OR NOT erp_private.employee_permission(p_employee,'hr.medical.manage') THEN
  RAISE EXCEPTION 'Medical evidence authority required' USING ERRCODE='42501'; END IF;
 SELECT * INTO request FROM erp_private.t04_cases c WHERE c.id=p_case AND c.employee_id=p_employee
   AND c.company_id=employee.owner_company_id AND c.branch_id IS NOT DISTINCT FROM employee.branch_id AND c.category='sick' FOR UPDATE;
 IF request.id IS NULL THEN RAISE EXCEPTION 'Sick request unavailable' USING ERRCODE='42501'; END IF;
 hashed:=erp_private.t02_digest(jsonb_build_array('sick-evidence',p_employee,p_case,p_revision,p_medical,p_version));
 saved:=erp_private.t02_replay('assisted-leave',p_operation,hashed);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 IF request.revision IS DISTINCT FROM p_revision OR request.status NOT IN('pending','reviewed') THEN
  RAISE EXCEPTION 'Sick request changed' USING ERRCODE='P0409'; END IF;
 SELECT d.id AS doc,v.id AS version,f.id AS file_id,f.sha256_hash,h.id AS verification_id INTO certificate
 FROM public.employee_medical_records m JOIN public.dms_documents d ON d.id=m.dms_document_id
 JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id
 JOIN public.dms_document_files f ON f.version_id=v.id AND f.document_id=d.id
 JOIN LATERAL (SELECT * FROM erp_private.f12_evidence_verifications x WHERE x.employee_id=p_employee
     AND x.source_kind='medical-record' AND x.source_id=p_medical ORDER BY id DESC LIMIT 1) h ON h.document_id=d.id AND h.version_id=v.id
 WHERE m.id=p_medical AND m.employee_id=p_employee AND m.deleted_at IS NULL AND d.deleted_at IS NULL AND NOT d.is_archived
  AND v.id=p_version AND v.unlinked_at IS NULL AND f.deleted_at IS NULL AND f.file_role='original'
  AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[a-f0-9]{64}$'
  AND erp_private.document_permission(d.id,'dms.documents.preview')
  AND erp_private.f12_verified_evidence('medical-record',p_employee,p_medical)
 ORDER BY f.id LIMIT 1 FOR SHARE OF m,d,v,f;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current verified sick evidence unavailable' USING ERRCODE='23514'; END IF;
 INSERT INTO erp_private.t04_sick_evidence(case_id,medical_id,document_id,version_id,file_id,file_digest,verification_id,actor,operation_id)
 VALUES(request.id,p_medical,certificate.doc,certificate.version,certificate.file_id,certificate.sha256_hash,
     certificate.verification_id,auth.uid(),p_operation);
 RETURN erp_private.t02_save_receipt('assisted-leave',p_operation,hashed,
    jsonb_build_object('id',request.id,'revision',request.revision,'status',request.status,'evidence_status','verified'));
END;
$$;

CREATE FUNCTION erp_private.t04_reserve(p_case bigint,p_employee bigint,p_revision bigint,p_quote jsonb)
RETURNS void LANGUAGE sql VOLATILE SET search_path='' AS $$
 INSERT INTO erp_private.t04_days(case_id,employee_id,request_revision,day,policy_id,period_id,fund_id,rate)
 SELECT p_case,p_employee,p_revision,x.day,x.policy_id,x.period_id,x.fund_id,x.rate
 FROM jsonb_to_recordset(p_quote->'days') AS x(day date,policy_id bigint,period_id bigint,fund_id bigint,rate numeric);
$$;

CREATE FUNCTION public.t04_leave_command(p_employee bigint,p_case bigint,p_action text,p_data jsonb,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee public.employees;
DECLARE request erp_private.t04_cases;
DECLARE needed text[];
DECLARE hashed text;
DECLARE saved jsonb;
DECLARE quote jsonb;
DECLARE old_mode text;
DECLARE from_day date;
DECLARE to_day date;
DECLARE line erp_private.t04_days;
DECLARE movement erp_private.f12_leave_movements;
DECLARE new_state text;
DECLARE allowed text[];
BEGIN
 IF p_action IS NULL OR p_action NOT IN('submit','review','revise','approve','approve-exception','reject','withdraw','return','cancel')
  OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>8192 THEN
  RAISE EXCEPTION 'Unsupported leave command' USING ERRCODE='22023'; END IF;
 allowed:=CASE p_action WHEN 'submit' THEN ARRAY['category','from','to','fingerprint']
  WHEN 'revise' THEN ARRAY['from','to','fingerprint','revision'] WHEN 'return' THEN ARRAY['from','revision','reason']
  WHEN 'approve-exception' THEN ARRAY['revision','reason'] WHEN 'reject' THEN ARRAY['revision','reason']
  WHEN 'cancel' THEN ARRAY['revision','reason'] ELSE ARRAY['revision'] END;
 IF p_data-allowed<>'{}'::jsonb OR (p_case IS NULL) IS DISTINCT FROM (p_action='submit') THEN
  RAISE EXCEPTION 'Choose an exact leave request and action' USING ERRCODE='22023'; END IF;
 IF p_case IS NOT NULL THEN
  SELECT * INTO request FROM erp_private.t04_cases WHERE id=p_case AND employee_id=p_employee;
  IF request.id IS NULL THEN RAISE EXCEPTION 'Leave scope unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 needed:=CASE
  WHEN p_action IN('submit','review','revise','withdraw') THEN ARRAY['hr.leave.assist']
  WHEN p_action<>'approve-exception' AND request.category='sick' THEN ARRAY['hr.leave.sick.review']
  ELSE ARRAY['hr.leave.approve'] END;
 employee:=erp_private.t04_scope(p_employee,needed,true);
 IF p_case IS NOT NULL THEN
  SELECT * INTO request FROM erp_private.t04_cases WHERE id=p_case AND employee_id=p_employee FOR UPDATE;
  IF request.company_id IS DISTINCT FROM employee.owner_company_id OR request.branch_id IS DISTINCT FROM employee.branch_id THEN
   RAISE EXCEPTION 'Leave scope changed' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action='approve-exception' AND NOT erp_private.t02_has_scope('hr.leave.sick.exception',employee.owner_company_id,employee.branch_id) THEN
  RAISE EXCEPTION 'Sick evidence exception scope unavailable' USING ERRCODE='42501'; END IF;
 hashed:=erp_private.t02_digest(jsonb_build_array('case',p_employee,p_case,p_action,p_data));
 saved:=erp_private.t02_replay('assisted-leave',p_operation,hashed);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 IF p_case IS NOT NULL AND ((p_data->>'revision')::bigint IS DISTINCT FROM request.revision) THEN
  RAISE EXCEPTION 'Leave request changed' USING ERRCODE='P0409'; END IF;
 IF p_action IN('return','cancel','reject','approve-exception') AND NOT coalesce(length(btrim(p_data->>'reason')) BETWEEN 1 AND 1000,false) THEN
  RAISE EXCEPTION 'A reviewed decision reason is required' USING ERRCODE='22023'; END IF;
 IF p_action IN('submit','revise') THEN
  from_day:=(p_data->>'from')::date;to_day:=(p_data->>'to')::date;
  old_mode:=CASE WHEN p_action='submit' THEN p_data->>'category' ELSE request.category END;
  IF p_action='revise' AND request.status NOT IN('pending','reviewed') THEN RAISE EXCEPTION 'Only pending leave dates can be revised' USING ERRCODE='23514'; END IF;
  quote:=erp_private.t04_quote(p_employee,old_mode,from_day,to_day,p_case);
  IF quote->>'status'<>'ready' OR quote->>'fingerprint' IS DISTINCT FROM p_data->>'fingerprint' THEN
   RAISE EXCEPTION 'Refresh the reviewed leave preview' USING ERRCODE='P0409'; END IF;
  IF p_action='submit' THEN
   INSERT INTO erp_private.t04_cases(employee_id,company_id,branch_id,employment_id,category,dates,fingerprint,submitted_by)
    VALUES(employee.id,employee.owner_company_id,employee.branch_id,(quote->>'employment_id')::bigint,old_mode,
      daterange(from_day,to_day,'[]'),quote->>'fingerprint',auth.uid()) RETURNING * INTO request;
  ELSE
   UPDATE erp_private.t04_days SET state='released' WHERE case_id=request.id AND state='reserved';
   UPDATE erp_private.t04_cases SET status='pending',pro_reviewed_by=NULL,dates=daterange(from_day,to_day,'[]'),
    revision=revision+1,fingerprint=quote->>'fingerprint',employment_id=(quote->>'employment_id')::bigint WHERE id=request.id RETURNING * INTO request;
  END IF;
  PERFORM erp_private.t04_reserve(request.id,p_employee,request.revision,quote);
 ELSIF p_action='review' AND request.status='pending' THEN
  UPDATE erp_private.t04_cases SET status='reviewed',revision=revision+1,pro_reviewed_by=auth.uid() WHERE id=request.id RETURNING * INTO request;
 ELSIF p_action IN('approve','approve-exception') AND request.status='reviewed' THEN
  IF auth.uid() IN(request.submitted_by,request.pro_reviewed_by) THEN RAISE EXCEPTION 'Independent decision required' USING ERRCODE='42501'; END IF;
  quote:=erp_private.t04_quote(p_employee,request.category,lower(request.dates),upper(request.dates)-1,request.id);
  IF quote->>'status'<>'ready' OR quote->>'fingerprint' IS DISTINCT FROM request.fingerprint THEN
   RAISE EXCEPTION 'The funding or dated allocation changed and needs a new PRO review' USING ERRCODE='P0409'; END IF;
  IF request.category='sick' THEN
   IF EXISTS(SELECT 1 FROM erp_private.t04_days other JOIN erp_private.t04_cases c ON c.id=other.case_id
      JOIN erp_private.t04_days own ON own.case_id=request.id AND own.period_id=other.period_id AND own.state='reserved'
      WHERE other.state='reserved' AND other.day<own.day AND other.case_id<>request.id AND c.category='sick') THEN
    RAISE EXCEPTION 'Earlier pending sick days need a decision first' USING ERRCODE='23514'; END IF;
   IF p_action='approve-exception' THEN
    IF EXISTS(SELECT 1 FROM erp_private.t04_days x JOIN erp_private.t04_policies p ON p.id=x.policy_id
      WHERE x.case_id=request.id AND x.state='reserved' AND NOT (p.facts->>'sick_exception')::boolean)
      OR upper(request.dates)>erp_private.t04_today() THEN
       RAISE EXCEPTION 'The sick evidence exception is unavailable under this dated policy' USING ERRCODE='23514'; END IF;
   ELSIF NOT erp_private.t04_current_evidence(request.id,p_employee) THEN
    RAISE EXCEPTION 'Current verified sick evidence is required' USING ERRCODE='23514'; END IF;
  ELSIF p_action='approve-exception' THEN RAISE EXCEPTION 'This exception is only for sick leave' USING ERRCODE='23514'; END IF;
  FOR line IN SELECT * FROM erp_private.t04_days WHERE case_id=request.id AND state='reserved' ORDER BY day FOR UPDATE LOOP
   IF request.category='annual' AND line.rate=1 THEN
    PERFORM erp_private.t04_post_movement(line.period_id,'consume',-1,'t04:consume:'||line.id,p_operation,line.id,request.revision+1,line.fund_id);
   END IF;
   UPDATE erp_private.t04_days SET state='posted' WHERE id=line.id;
  END LOOP;
  UPDATE erp_private.t04_cases SET status='approved',revision=revision+1,approved_by=auth.uid(),
    cutoff_review=CASE WHEN p_action='approve-exception' THEN btrim(p_data->>'reason') END WHERE id=request.id RETURNING * INTO request;
 ELSIF p_action IN('return','cancel') AND request.status='approved' THEN
  IF auth.uid() IN(request.submitted_by,request.pro_reviewed_by) THEN RAISE EXCEPTION 'Independent reversal required' USING ERRCODE='42501'; END IF;
  from_day:=CASE WHEN p_action='return' THEN (p_data->>'from')::date ELSE lower(request.dates) END;
  IF from_day IS NULL OR NOT isfinite(from_day) OR NOT (request.dates @> from_day)
   OR NOT EXISTS(SELECT 1 FROM erp_private.t04_days WHERE case_id=request.id AND state='posted' AND day>=from_day) THEN
   RAISE EXCEPTION 'No original active dates remain at this return boundary' USING ERRCODE='23514'; END IF;
  IF request.category='sick' AND EXISTS(SELECT 1 FROM erp_private.t04_days other JOIN erp_private.t04_cases c ON c.id=other.case_id
     JOIN erp_private.t04_days own ON own.case_id=request.id AND own.period_id=other.period_id AND own.state='posted'
     WHERE other.case_id<>request.id AND other.state='posted' AND c.category='sick' AND other.day>own.day AND own.day>=from_day) THEN
   RAISE EXCEPTION 'A later approved sick band requires reconciliation before reversing this one' USING ERRCODE='23514'; END IF;
  FOR line IN SELECT * FROM erp_private.t04_days WHERE case_id=request.id AND state='posted' AND day>=from_day ORDER BY day FOR UPDATE LOOP
   IF request.category='annual' AND line.rate=1 THEN
    SELECT * INTO movement FROM erp_private.f12_leave_movements WHERE allocation_id=line.id AND effect='consume' AND movement_version=2 FOR UPDATE;
    IF movement.id IS NULL OR movement.days<>-1 OR EXISTS(SELECT 1 FROM erp_private.f12_leave_movements m WHERE m.reverses_movement_id=movement.id) THEN
     RAISE EXCEPTION 'The original posted allocation does not reconcile' USING ERRCODE='23514'; END IF;
    PERFORM erp_private.t04_post_movement(line.period_id,'reverse',1,'t04:reverse:'||line.id,p_operation,
      line.id,request.revision+1,line.fund_id,movement.id);
   END IF;
   UPDATE erp_private.t04_days SET state='released' WHERE id=line.id;
  END LOOP;
  new_state:=CASE WHEN EXISTS(SELECT 1 FROM erp_private.t04_days WHERE case_id=request.id AND state='posted') THEN 'approved' ELSE 'cancelled' END;
  UPDATE erp_private.t04_cases SET status=new_state,revision=revision+1 WHERE id=request.id RETURNING * INTO request;
 ELSIF p_action IN('withdraw','reject') AND request.status IN('pending','reviewed') THEN
  IF p_action='reject' AND auth.uid() IN(request.submitted_by,request.pro_reviewed_by) THEN
   RAISE EXCEPTION 'Independent decision required' USING ERRCODE='42501'; END IF;
  UPDATE erp_private.t04_days SET state='released' WHERE case_id=request.id AND state='reserved';
  UPDATE erp_private.t04_cases SET status=CASE WHEN p_action='withdraw' THEN 'withdrawn' ELSE 'rejected' END,
   revision=revision+1 WHERE id=request.id RETURNING * INTO request;
 ELSE
  RAISE EXCEPTION 'The leave request is not ready for this action' USING ERRCODE='23514';
 END IF;
 RETURN erp_private.t02_save_receipt('assisted-leave',p_operation,hashed,
   jsonb_build_object('id',request.id,'revision',request.revision,'status',request.status));
END;
$$;

CREATE FUNCTION public.t04_read_leave_request(p_employee bigint,p_case bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee public.employees;
DECLARE request erp_private.t04_cases;
BEGIN
 employee:=erp_private.t04_scope(p_employee,ARRAY['hr.leave.assist','hr.leave.approve','hr.leave.sick.review','hr.leave.view']);
 SELECT * INTO request FROM erp_private.t04_cases WHERE id=p_case AND employee_id=p_employee
  AND company_id=employee.owner_company_id AND branch_id IS NOT DISTINCT FROM employee.branch_id;
 IF request.id IS NULL THEN RAISE EXCEPTION 'Leave request unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',request.id,'revision',request.revision,'category',request.category,'status',request.status,
  'from',lower(request.dates),'to',upper(request.dates)-1,
  'days',(SELECT coalesce(jsonb_agg(jsonb_build_object('day',day,'rate',rate) ORDER BY day),'[]'::jsonb)
   FROM erp_private.t04_days WHERE case_id=request.id AND state IN('reserved','posted')),
  'evidence_status',CASE WHEN request.category='sick' THEN CASE
    WHEN request.cutoff_review IS NOT NULL THEN 'exception'
    WHEN erp_private.t04_current_evidence(request.id,p_employee) THEN 'verified'
    ELSE 'pending' END END);
END;
$$;

CREATE FUNCTION public.t04_pay_leave(p_employee bigint,p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
DECLARE c record;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Leave payroll scope unavailable' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(isfinite(p_from) AND isfinite(p_to) AND p_from<=p_to AND p_to-p_from<93,false) THEN
  RAISE EXCEPTION 'Choose a bounded payroll period' USING ERRCODE='22023'; END IF;
 -- Check every recorded scope used by this bounded payable projection. A
 -- transfer never implicitly authorizes a previous employer.
 FOR c IN SELECT DISTINCT x.company_id,x.branch_id FROM erp_private.t04_cases x JOIN erp_private.t04_days d ON d.case_id=x.id
   WHERE x.employee_id=p_employee AND d.day BETWEEN p_from AND p_to AND d.state='posted' LOOP
  IF NOT erp_private.t02_has_scope('hr.leave.payroll.read',c.company_id,c.branch_id) THEN
   RAISE EXCEPTION 'Leave payroll scope unavailable' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF NOT FOUND THEN PERFORM erp_private.t04_scope(p_employee,ARRAY['hr.leave.payroll.read']); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('request_id',x.id,'request_revision',x.revision,'employment_id',x.employment_id,
   'company_id',x.company_id,'day',d.day,'category',x.category,'rate',d.rate) ORDER BY d.day,x.id),'[]'::jsonb)
 INTO result FROM erp_private.t04_cases x JOIN erp_private.t04_days d ON d.case_id=x.id
 WHERE x.employee_id=p_employee AND x.status='approved' AND d.state='posted' AND d.day BETWEEN p_from AND p_to;
 RETURN result;
END;
$$;

CREATE FUNCTION erp_private.t04_guard_legacy_leave()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.t04_periods p JOIN public.hr_leave_types t ON t.id=NEW.leave_type_id
   WHERE p.employee_id=NEW.employee_id AND t.code IN('ANNUAL','UNPAID','SICK')
    AND NEW.start_date<upper(p.coverage) AND NEW.end_date>=lower(p.coverage))
  AND (TG_OP='INSERT' OR ROW(OLD.approval_status,OLD.start_date,OLD.end_date,OLD.deleted_at)
          IS DISTINCT FROM ROW(NEW.approval_status,NEW.start_date,NEW.end_date,NEW.deleted_at)) THEN
   RAISE EXCEPTION 'Use the reviewed assisted leave workflow for this period' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t04_guard_legacy_leave BEFORE INSERT OR UPDATE ON public.employee_leave_requests
 FOR EACH ROW EXECUTE FUNCTION erp_private.t04_guard_legacy_leave();

REVOKE ALL ON FUNCTION erp_private.t04_scope(bigint,text[],boolean),erp_private.t04_quote(bigint,text,date,date,bigint),
 erp_private.t04_current_evidence(bigint,bigint),erp_private.t04_reserve(bigint,bigint,bigint,jsonb),erp_private.t04_guard_legacy_leave()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t04_leave_preview(bigint,text,date,date),public.t04_leave_balance(bigint,date),
 public.t04_leave_command(bigint,bigint,text,jsonb,uuid),public.t04_read_leave_request(bigint,bigint),
 public.t04_verify_sick_evidence(bigint,bigint,bigint,bigint,bigint,uuid),public.t04_pay_leave(bigint,date,date)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t04_leave_preview(bigint,text,date,date),public.t04_leave_balance(bigint,date),
 public.t04_leave_command(bigint,bigint,text,jsonb,uuid),public.t04_read_leave_request(bigint,bigint),
 public.t04_verify_sick_evidence(bigint,bigint,bigint,bigint,bigint,uuid),public.t04_pay_leave(bigint,date,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
