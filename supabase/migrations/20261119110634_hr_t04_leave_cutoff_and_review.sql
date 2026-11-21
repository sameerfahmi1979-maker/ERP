BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.t04_sick_cutoff(p_case bigint)
RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN bool_and((p.facts->>'sick_exception')::boolean AND p.facts ? 'sick_cutoff_day')
    THEN max(
      (date_trunc('month',d.day::timestamp)
       + CASE WHEN extract(day FROM d.day)>(p.facts->>'sick_cutoff_day')::int THEN interval '1 month' ELSE interval '0 days' END)::date
      + ((p.facts->>'sick_cutoff_day')::int-1)
    ) END
 FROM erp_private.t04_days d JOIN erp_private.t04_policies p ON p.id=d.policy_id
 WHERE d.case_id=p_case AND d.state IN('reserved','posted');
$$;

CREATE FUNCTION public.t04_leave_certificate_choices(p_employee bigint,p_case bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee public.employees;
DECLARE request erp_private.t04_cases;
BEGIN
 employee:=erp_private.t04_scope(p_employee,ARRAY['hr.leave.sick.review']);
 IF NOT erp_private.employee_permission(p_employee,'hr.medical.view') OR NOT erp_private.employee_permission(p_employee,'hr.medical.manage') THEN
  RAISE EXCEPTION 'Medical evidence authority required' USING ERRCODE='42501'; END IF;
 SELECT * INTO request FROM erp_private.t04_cases WHERE id=p_case AND employee_id=p_employee
   AND company_id=employee.owner_company_id AND branch_id IS NOT DISTINCT FROM employee.branch_id
   AND category='sick' AND status IN('pending','reviewed');
 IF request.id IS NULL THEN RAISE EXCEPTION 'Sick leave request unavailable' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.medical_id),'[]'::jsonb) FROM (
  SELECT m.id AS medical_id,d.current_version_id AS version_id,d.document_no AS label
  FROM public.employee_medical_records m JOIN public.dms_documents d ON d.id=m.dms_document_id
  WHERE m.employee_id=p_employee AND m.deleted_at IS NULL AND request.dates @> m.examination_date
    AND d.deleted_at IS NULL AND NOT d.is_archived AND d.current_version_id IS NOT NULL
    AND erp_private.document_permission(d.id,'dms.documents.preview')
    AND erp_private.f12_verified_evidence('medical-record',p_employee,m.id)
  ORDER BY m.id LIMIT 100) item);
END;
$$;

CREATE FUNCTION public.t04_read_leave_setup(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry erp_private.t04_setup;
BEGIN
 SELECT * INTO entry FROM erp_private.t04_setup WHERE id=p_id;
 IF entry.id IS NULL OR NOT (erp_private.t02_has_scope('hr.leave.approve',entry.company_id,entry.branch_id)
     OR erp_private.t02_has_scope(CASE WHEN entry.kind='policy' THEN 'hr.leave.policy.prepare' ELSE 'hr.leave.assist' END,
       entry.company_id,entry.branch_id)) THEN RAISE EXCEPTION 'Leave setup unavailable' USING ERRCODE='42501'; END IF;
 IF entry.employee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=entry.employee_id
   AND e.owner_company_id=entry.company_id AND e.branch_id IS NOT DISTINCT FROM entry.branch_id AND e.deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Leave setup unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',entry.id,'kind',entry.kind,'employee_id',entry.employee_id,'company_id',entry.company_id,
  'digest',entry.digest,'facts',entry.facts,'approved',entry.approved_at IS NOT NULL);
END;
$$;

DO $$
DECLARE original text;
DECLARE revised text;
BEGIN
 original:=pg_get_functiondef('erp_private.t04_validate_policy(jsonb)'::regprocedure);
 revised:=replace(original,$old$'sick_exception','excluded_dates','first_year_days']$old$,
  $new$'sick_exception','excluded_dates','first_year_days','sick_cutoff_day']$new$);
 IF revised=original THEN RAISE EXCEPTION 'Unknown sick policy predecessor'; END IF;
 original:=revised;
 revised:=replace(original,
 $old$ IF (p->>'sick_partial_rate')::numeric NOT BETWEEN 0 AND 1$old$,
 $new$ IF ((p->>'sick_exception')::boolean OR p ? 'sick_cutoff_day')
   AND (jsonb_typeof(p->'sick_cutoff_day') IS DISTINCT FROM 'number'
    OR coalesce((p->>'sick_cutoff_day') !~ '^([1-9]|1[0-9]|2[0-8])$',true)) THEN
  RAISE EXCEPTION 'An approved payroll cutoff day from 1 through 28 is required' USING ERRCODE='22023'; END IF;
 IF (p->>'sick_partial_rate')::numeric NOT BETWEEN 0 AND 1$new$);
 IF revised=original THEN RAISE EXCEPTION 'Unknown sick cutoff policy predecessor'; END IF;
 EXECUTE revised;
 original:=pg_get_functiondef('public.t04_leave_command(bigint,bigint,text,jsonb,uuid)'::regprocedure);
 revised:=replace(original,$old$      OR upper(request.dates)>erp_private.t04_today() THEN$old$,
  $new$      OR upper(request.dates)>erp_private.t04_today()
      OR NOT coalesce(erp_private.t04_sick_cutoff(request.id)<=erp_private.t04_today(),false) THEN$new$);
 IF revised=original THEN RAISE EXCEPTION 'Unknown exception decision predecessor'; END IF;
 EXECUTE revised;
 original:=pg_get_functiondef('public.t04_read_leave_request(bigint,bigint)'::regprocedure);
 revised:=replace(original,$old$  'evidence_status',CASE$old$,
   $new$  'cutoff_due',CASE WHEN request.category='sick' AND request.status IN('pending','reviewed')
    THEN erp_private.t04_sick_cutoff(request.id) END,
  'evidence_status',CASE$new$);
 IF revised=original THEN RAISE EXCEPTION 'Unknown request cutoff read predecessor'; END IF;
 EXECUTE revised;
 original:=pg_get_functiondef('public.t04_pay_leave(bigint,date,date)'::regprocedure);
 revised:=replace(original,$old$'employment_id',x.employment_id,$old$,
  $new$'employment_id',x.employment_id,'allocation_id',d.id,$new$);
 IF revised=original THEN RAISE EXCEPTION 'Unknown leave payroll allocation predecessor'; END IF;
 EXECUTE revised;
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t04_sick_cutoff(bigint),public.t04_leave_certificate_choices(bigint,bigint),
 public.t04_read_leave_setup(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t04_leave_certificate_choices(bigint,bigint),public.t04_read_leave_setup(bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
