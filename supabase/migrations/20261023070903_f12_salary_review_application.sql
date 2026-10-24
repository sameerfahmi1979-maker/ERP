BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Legacy new_gross is New Basic. Keep original revision rows immutable.
-- Applied facts are a dated append-only overlay, never a rewrite of components.
CREATE TABLE public.employee_salary_revision_reviews (
  revision_id bigint PRIMARY KEY REFERENCES public.employee_salary_revisions(id),
  employee_id bigint NOT NULL REFERENCES public.employees(id),
  status text NOT NULL CHECK (status IN ('recorded','pending','approved','rejected','withdrawn','applied')),
  workspace_revision bigint NOT NULL DEFAULT 1 CHECK (workspace_revision > 0),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  apply_requested boolean NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  requested_by bigint NOT NULL REFERENCES public.user_profiles(id),
  approved_by bigint REFERENCES public.user_profiles(id),
  approved_at timestamptz,
  applied_by bigint REFERENCES public.user_profiles(id),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CHECK ((status IN ('approved','applied')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX f12_salary_review_subject ON public.employee_salary_revision_reviews(employee_id,revision_id);
CREATE TABLE public.employee_salary_revision_effects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revision_id bigint NOT NULL UNIQUE REFERENCES public.employee_salary_revision_reviews(revision_id),
  employee_id bigint NOT NULL REFERENCES public.employees(id),
  effective_date date NOT NULL,
  new_basic numeric(12,2) NOT NULL CHECK (new_basic >= 0 AND new_basic::text NOT IN ('NaN','Infinity','-Infinity')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  approved_by bigint NOT NULL REFERENCES public.user_profiles(id),
  applied_by bigint NOT NULL REFERENCES public.user_profiles(id),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (employee_id,effective_date)
);
ALTER TABLE public.employee_salary_revision_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_revision_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_revision_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_revision_effects FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_salary_revision_reviews,public.employee_salary_revision_effects FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.employee_salary_revision_reviews,public.employee_salary_revision_effects TO authenticated;
-- Existing server-only scoped-report facade requires read access; it still adds
-- the current actor's authorized employee IDs. No new public/browser key or write grant.
GRANT SELECT ON public.employee_salary_revision_effects TO service_role;
CREATE POLICY f12_salary_reviews_read ON public.employee_salary_revision_reviews FOR SELECT TO authenticated
  USING (public.current_user_can_view_employee_payroll(employee_id));
CREATE POLICY f12_salary_effects_read ON public.employee_salary_revision_effects FOR SELECT TO authenticated
  USING (public.current_user_can_view_employee_payroll(employee_id));

CREATE TABLE erp_private.f12_salary_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revision_id bigint NOT NULL REFERENCES public.employee_salary_revision_reviews(revision_id),
  employee_id bigint NOT NULL,
  actor_id bigint NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  review_revision bigint NOT NULL,
  operation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE erp_private.f12_salary_receipts (
  actor uuid NOT NULL,
  operation_id uuid NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor,operation_id)
);
ALTER TABLE erp_private.f12_salary_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.f12_salary_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f12_salary_events,erp_private.f12_salary_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Every material input, including applied timeline/profile/employment, is pinned.
-- Creating a pending proposal does not itself invalidate another opening.
CREATE OR REPLACE FUNCTION public.f11_salary_revision_opening(p_employee bigint) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result text;
BEGIN
  IF NOT erp_private.f11_child_authorized('salary-revision',p_employee) THEN
    RAISE EXCEPTION 'Current payroll access required' USING ERRCODE='42501';
  END IF;
  SELECT encode(sha256(convert_to(jsonb_build_array(
    (SELECT jsonb_build_array(e.id,e.workspace_revision,e.owner_company_id,e.branch_id,e.employee_status,e.joining_date,e.inactive_date)
      FROM public.employees e WHERE e.id=p_employee AND e.deleted_at IS NULL),
    (SELECT to_jsonb(p) FROM public.employee_payroll_profiles p WHERE p.employee_id=p_employee AND p.deleted_at IS NULL),
    coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.employee_salary_components c WHERE c.employee_id=p_employee AND c.deleted_at IS NULL),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_array(t.id,t.workspace_revision,t.component_kind,t.is_basic,t.is_active,t.deleted_at) ORDER BY t.id) FROM public.hr_salary_component_types t),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.effective_date,a.id) FROM public.employee_salary_revision_effects a WHERE a.employee_id=p_employee),'[]'::jsonb)
  )::text,'UTF8')),'hex') INTO result;
  RETURN result;
END $$;

-- Private mutation authority is required for immutable review/event/receipt
-- writes. It never edits employee, role, salary-component or bank records.
CREATE FUNCTION erp_private.f12_capture_salary_proposal(p_revision bigint,p_data jsonb,p_operation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.employee_salary_revisions; actor bigint:=public.current_user_profile_id(); expected text; unit text;
BEGIN
  SELECT * INTO original FROM public.employee_salary_revisions WHERE id=p_revision;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT erp_private.f11_child_authorized('salary-revision',original.employee_id)
    OR original.created_by IS DISTINCT FROM actor OR original.approved_by IS NOT NULL
  THEN RAISE EXCEPTION 'Original scoped salary proposal required' USING ERRCODE='42501'; END IF;
  expected:=encode(sha256(convert_to(jsonb_build_array('salary-revision',original.employee_id,NULL,NULL,'create',p_data)::text,'UTF8')),'hex');
  IF NOT EXISTS(SELECT 1 FROM erp_private.f11_child_receipts r WHERE r.actor=auth.uid() AND r.operation_id=p_operation
    AND r.kind='salary-revision' AND r.action='create' AND r.employee_id=original.employee_id
    AND r.record_id=original.id AND r.request_hash=expected)
  THEN RAISE EXCEPTION 'Verified original salary receipt required' USING ERRCODE='42501'; END IF;
  SELECT currency INTO unit FROM public.employee_payroll_profiles WHERE employee_id=original.employee_id AND deleted_at IS NULL;
  IF unit IS NULL OR unit !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Salary currency unavailable' USING ERRCODE='23514'; END IF;
  INSERT INTO public.employee_salary_revision_reviews(revision_id,employee_id,status,source_fingerprint,apply_requested,currency,requested_by)
  VALUES(original.id,original.employee_id,CASE WHEN (p_data->>'apply_to_components')::boolean THEN 'pending' ELSE 'recorded' END,
    p_data->>'fingerprint',(p_data->>'apply_to_components')::boolean,unit,actor);
  INSERT INTO erp_private.f12_salary_events(revision_id,employee_id,actor_id,action,reason,review_revision,operation_id)
  VALUES(original.id,original.employee_id,actor,'propose',coalesce(original.revision_reason,''),1,p_operation);
END $$;
REVOKE ALL ON FUNCTION erp_private.f12_capture_salary_proposal(bigint,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_capture_salary_proposal(bigint,jsonb,uuid) TO authenticated;

-- Remove immediate application, pin the exact reviewed predecessor, and retain
-- F11 actor/revision/advisory/employee locks, receipt and mandatory audit controls.
DO $adopt$
DECLARE original text; changed text; first integer; last integer; block text;
BEGIN
  SELECT pg_get_functiondef('public.f11_mutate_payroll_child(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure) INTO original;
  IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'2a094812439c7d154e64c96538f21540885f8ec1afd2e6a67f0cc4561a08e21c'
  THEN RAISE EXCEPTION 'Unreviewed hold-safe payroll predecessor'; END IF;
  first:=strpos(original,$begin$ IF p_kind='salary-revision'THEN
  PERFORM 1 FROM public.employee_salary_components$begin$);
  last:=strpos(original,$end$ ELSIF p_kind='payroll-hold'THEN
  IF p_action='release'THEN$end$);
  IF first=0 OR last<=first THEN RAISE EXCEPTION 'Expected salary branch missing'; END IF;
  block:=$replacement$ IF p_kind='salary-revision'THEN
  PERFORM 1 FROM public.employee_salary_components WHERE employee_id=p_employee AND deleted_at IS NULL ORDER BY id FOR UPDATE;
  IF public.f11_salary_revision_opening(p_employee)IS DISTINCT FROM p_data->>'fingerprint'THEN RAISE EXCEPTION 'Salary sources changed after opening' USING ERRCODE='P0409';END IF;
  basic:=(public.f12_salary_as_of(p_employee,(p_data->>'effective_date')::date)->>'basic')::numeric;
  typed:=(typed-'fingerprint'-'apply_to_components'-'updated_by')||jsonb_build_object('old_gross',basic,'approved_by',NULL);columns:=ARRAY['effective_date','revision_reason','old_gross','new_gross','approved_by'];
$replacement$;
  changed:=substr(original,1,first-1)||block||substr(original,last);
  IF strpos(changed,'PERFORM set_config(''erp.f11_child_save'','''',true);')=0 THEN RAISE EXCEPTION 'Original completion anchor missing'; END IF;
  changed:=replace(changed,'PERFORM set_config(''erp.f11_child_save'','''',true);',
    'IF p_kind=''salary-revision'' THEN PERFORM erp_private.f12_capture_salary_proposal(target,p_data,p_operation); END IF; PERFORM set_config(''erp.f11_child_save'','''',true);');
  EXECUTE changed;
END $adopt$;

CREATE FUNCTION erp_private.f12_salary_review_command(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee bigint; source_id bigint; operation uuid; action text; expected_revision bigint; reason text;
  actor bigint:=public.current_user_profile_id(); digest text; prior erp_private.f12_salary_receipts;
  review public.employee_salary_revision_reviews; original public.employee_salary_revisions;
  current_fingerprint text; result jsonb; next_status text; subject record;
BEGIN
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>8192
    OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>7
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k<>ALL(ARRAY['employee_id','revision_id','operation_id','action','review_revision','fingerprint','reason']))
    OR jsonb_typeof(p_request->'employee_id') IS DISTINCT FROM 'number' OR (p_request->>'employee_id')!~'^[1-9][0-9]*$'
    OR jsonb_typeof(p_request->'revision_id') IS DISTINCT FROM 'number' OR (p_request->>'revision_id')!~'^[1-9][0-9]*$'
    OR (p_request->>'employee_id')::numeric>9007199254740991 OR (p_request->>'revision_id')::numeric>9007199254740991
    OR jsonb_typeof(p_request->'review_revision') IS DISTINCT FROM 'string' OR (p_request->>'review_revision')!~'^[1-9][0-9]{0,17}$'
    OR jsonb_typeof(p_request->'fingerprint') IS DISTINCT FROM 'string' OR (p_request->>'fingerprint')!~'^[0-9a-f]{64}$'
    OR jsonb_typeof(p_request->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_request->>'reason')) NOT BETWEEN 1 AND 1000
    OR jsonb_typeof(p_request->'operation_id') IS DISTINCT FROM 'string' OR (p_request->>'operation_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_request->'action') IS DISTINCT FROM 'string' OR p_request->>'action' NOT IN ('approve','reject','withdraw','apply')
  THEN RAISE EXCEPTION 'Invalid original salary review contract' USING ERRCODE='22023'; END IF;
  employee:=(p_request->>'employee_id')::bigint; source_id:=(p_request->>'revision_id')::bigint;
  operation:=(p_request->>'operation_id')::uuid; action:=p_request->>'action'; expected_revision:=(p_request->>'review_revision')::bigint; reason:=btrim(p_request->>'reason');
  IF auth.uid() IS NULL OR NOT erp_private.f11_child_authorized('salary-revision',employee)
    OR NOT public.current_user_can_view_employee(employee)
  THEN RAISE EXCEPTION 'Current scoped payroll manager required' USING ERRCODE='42501'; END IF;
  digest:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||operation::text,0));
  SELECT * INTO prior FROM erp_private.f12_salary_receipts r WHERE r.actor=auth.uid() AND r.operation_id=operation;
  IF FOUND THEN
    IF prior.request_hash<>digest THEN RAISE EXCEPTION 'Original operation input changed' USING ERRCODE='22023'; END IF;
    RETURN prior.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current employee unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO review FROM public.employee_salary_revision_reviews WHERE revision_id=source_id AND employee_id=employee FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original review unavailable; legacy history needs review' USING ERRCODE='23514'; END IF;
  IF review.workspace_revision<>expected_revision THEN RAISE EXCEPTION 'Salary review changed' USING ERRCODE='P0409'; END IF;
  SELECT * INTO STRICT original FROM public.employee_salary_revisions WHERE id=source_id AND employee_id=employee;
  IF action IN ('approve','apply') THEN
    current_fingerprint:=public.f11_salary_revision_opening(employee);
    IF current_fingerprint IS DISTINCT FROM review.source_fingerprint OR current_fingerprint IS DISTINCT FROM p_request->>'fingerprint'
    THEN RAISE EXCEPTION 'Salary sources changed; a new proposal is required' USING ERRCODE='P0409'; END IF;
  END IF;
  IF action IN ('approve','reject') THEN
    IF review.status<>'pending' OR actor=review.requested_by THEN
      RAISE EXCEPTION 'A different authorized payroll manager must decide a pending proposal' USING ERRCODE='23514'; END IF;
    next_status:=CASE WHEN action='approve' THEN 'approved' ELSE 'rejected' END;
  ELSIF action='withdraw' THEN
    IF actor<>review.requested_by OR review.status NOT IN ('pending','approved') THEN
      RAISE EXCEPTION 'Only the requester can withdraw an unapplied proposal' USING ERRCODE='23514'; END IF;
    next_status:='withdrawn';
  ELSE
    IF review.status<>'approved' OR NOT review.apply_requested OR review.approved_by IS NULL OR review.approved_by=review.requested_by
      OR original.effective_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dubai')::date
    THEN RAISE EXCEPTION 'Independently approved, currently due salary required' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM public.employee_salary_revision_effects WHERE employee_id=employee AND effective_date=original.effective_date) THEN
      RAISE EXCEPTION 'An applied salary already uses this effective date' USING ERRCODE='P0409'; END IF;
    INSERT INTO public.employee_salary_revision_effects(revision_id,employee_id,effective_date,new_basic,currency,approved_by,applied_by,source_fingerprint)
    VALUES(source_id,employee,original.effective_date,original.new_gross,review.currency,review.approved_by,actor,review.source_fingerprint);
    next_status:='applied';
  END IF;
  UPDATE public.employee_salary_revision_reviews SET status=next_status,workspace_revision=workspace_revision+1,
    approved_by=CASE WHEN action='approve' THEN actor WHEN action='withdraw' THEN NULL ELSE approved_by END,
    approved_at=CASE WHEN action='approve' THEN clock_timestamp() WHEN action='withdraw' THEN NULL ELSE approved_at END,
    applied_by=CASE WHEN action='apply' THEN actor ELSE applied_by END,
    applied_at=CASE WHEN action='apply' THEN clock_timestamp() ELSE applied_at END
  WHERE revision_id=source_id RETURNING * INTO review;
  INSERT INTO erp_private.f12_salary_events(revision_id,employee_id,actor_id,action,reason,review_revision,operation_id)
  VALUES(source_id,employee,actor,action,reason,review.workspace_revision,operation);
  INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
  VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_salary_revision_reviews',source_id,action,
    jsonb_build_object('employee_id',employee,'operation_id',operation,'revision',review.workspace_revision,'status',review.status));
  result:=jsonb_build_object('employee_id',employee,'revision_id',source_id,'review_revision',review.workspace_revision::text,'operation_id',operation,'action',action,'status',review.status,'replayed',false);
  INSERT INTO erp_private.f12_salary_receipts(actor,operation_id,request_hash,result) VALUES(auth.uid(),operation,digest,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION erp_private.f12_salary_review_command(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_salary_review_command(jsonb) TO authenticated;
CREATE FUNCTION public.f12_salary_review(p_request jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f12_salary_review_command(p_request); $$;
REVOKE ALL ON FUNCTION public.f12_salary_review(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_salary_review(jsonb) TO authenticated;

CREATE FUNCTION erp_private.f12_salary_reconcile(p_operation uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT r.result FROM erp_private.f12_salary_receipts r WHERE r.actor=auth.uid() AND r.operation_id=p_operation
    AND erp_private.f11_child_authorized('salary-revision',(r.result->>'employee_id')::bigint);
$$;
REVOKE ALL ON FUNCTION erp_private.f12_salary_reconcile(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_salary_reconcile(uuid) TO authenticated;
CREATE FUNCTION public.f12_salary_reconcile(p_operation uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f12_salary_reconcile(p_operation); $$;
REVOKE ALL ON FUNCTION public.f12_salary_reconcile(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_salary_reconcile(uuid) TO authenticated;

-- Native current/as-of facts include only actually applied, independently
-- approved dated effects. No component or legacy revision history is rewritten.
DO $facts$
DECLARE original text; changed text;
BEGIN
  SELECT pg_get_functiondef('public.f12_salary_as_of(bigint,date)'::regprocedure) INTO original;
  IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'cced762138e9e2b28a56e95cfd4c5e435b935de3e1d838c91d15a29c5a2cd7c2'
  THEN RAISE EXCEPTION 'Unreviewed salary-as-of predecessor'; END IF;
  changed:=replace(original,'  component record;','  component record; effect public.employee_salary_revision_effects;');
  IF changed=original THEN RAISE EXCEPTION 'Salary declaration anchor missing'; END IF;
  IF strpos(changed,'  IF deductions > gross THEN')=0 THEN RAISE EXCEPTION 'Salary sum anchor missing'; END IF;
  changed:=replace(changed,'  IF deductions > gross THEN',$effect$
  SELECT * INTO effect FROM public.employee_salary_revision_effects
    WHERE employee_id=p_employee AND effective_date<=p_as_of ORDER BY effective_date DESC,id DESC LIMIT 1;
  IF FOUND THEN
    IF effect.currency<>profile.currency THEN RAISE EXCEPTION 'Applied salary currency changed' USING ERRCODE='23514'; END IF;
    gross:=gross-basic+effect.new_basic; basic:=effect.new_basic;
    IF item_count=0 THEN item_count:=1; END IF;
    sources:=sources||jsonb_build_array(to_jsonb(effect));
  END IF;
  IF deductions > gross THEN$effect$);
  EXECUTE changed;
END $facts$;

-- F12-04 opening/recovery APIs: all inputs remain references, not trusted rows.
CREATE FUNCTION public.f12_salary_review_opening(p_employee bigint,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE current_source text; result jsonb;
BEGIN
  IF p_employee IS NULL OR p_revision IS NULL OR p_employee<=0 OR p_revision<=0
    OR NOT erp_private.f11_child_authorized('salary-revision',p_employee)
    OR NOT public.current_user_can_view_employee(p_employee)
  THEN RAISE EXCEPTION 'Current scoped payroll manager required' USING ERRCODE='42501'; END IF;
  current_source:=public.f11_salary_revision_opening(p_employee);
  SELECT jsonb_build_object('employee_id',r.employee_id,'revision_id',r.revision_id,'review_revision',r.workspace_revision::text,
    'status',r.status,'requested_by',r.requested_by,'approved_by',r.approved_by,'effective_date',s.effective_date,
    'new_basic',round(s.new_gross,2)::text,'currency',r.currency,'fingerprint',current_source,
    'source_current',current_source=r.source_fingerprint,'today',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dubai')::date)
  INTO result FROM public.employee_salary_revision_reviews r JOIN public.employee_salary_revisions s ON s.id=r.revision_id AND s.employee_id=r.employee_id
  WHERE r.employee_id=p_employee AND r.revision_id=p_revision;
  IF result IS NULL THEN RAISE EXCEPTION 'Original review unavailable; legacy revision is not an approved proposal' USING ERRCODE='23514'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.f12_salary_review_opening(bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_salary_review_opening(bigint,bigint) TO authenticated;

CREATE FUNCTION erp_private.f12_salary_recent(p_employee bigint,p_before timestamptz,p_cursor uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC,t.operation_id DESC),'[]'::jsonb) FROM (
    SELECT r.result AS receipt,r.created_at,r.operation_id FROM erp_private.f12_salary_receipts r
    WHERE r.actor=auth.uid() AND (r.result->>'employee_id')::bigint=p_employee
      AND erp_private.f11_child_authorized('salary-revision',p_employee)
      AND ((p_before IS NULL AND p_cursor IS NULL) OR (p_before IS NOT NULL AND p_cursor IS NOT NULL AND (r.created_at,r.operation_id)<(p_before,p_cursor)))
    ORDER BY r.created_at DESC,r.operation_id DESC LIMIT 26
  ) t;
$$;
REVOKE ALL ON FUNCTION erp_private.f12_salary_recent(bigint,timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_salary_recent(bigint,timestamptz,uuid) TO authenticated;
CREATE FUNCTION public.f12_salary_recent(p_employee bigint,p_before timestamptz DEFAULT NULL,p_cursor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_employee IS NULL OR p_employee<=0 OR (p_before IS NULL)<>(p_cursor IS NULL) THEN RAISE EXCEPTION 'Complete original receipt cursor required' USING ERRCODE='22023'; END IF;
  IF NOT erp_private.f11_child_authorized('salary-revision',p_employee) THEN RAISE EXCEPTION 'Current scoped payroll manager required' USING ERRCODE='42501'; END IF;
  RETURN erp_private.f12_salary_recent(p_employee,p_before,p_cursor);
END $$;
REVOKE ALL ON FUNCTION public.f12_salary_recent(bigint,timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_salary_recent(bigint,timestamptz,uuid) TO authenticated;

CREATE FUNCTION erp_private.f12_salary_history(p_employee bigint,p_revision bigint,p_after bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) FROM (
    SELECT e.id,e.revision_id,e.employee_id,e.actor_id,e.action,e.reason,e.review_revision::text,e.operation_id,e.created_at
    FROM erp_private.f12_salary_events e WHERE e.employee_id=p_employee AND e.revision_id=p_revision AND e.id>p_after
      AND erp_private.f11_child_authorized('salary-revision',p_employee)
    ORDER BY e.id LIMIT 26
  ) t;
$$;
REVOKE ALL ON FUNCTION erp_private.f12_salary_history(bigint,bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_salary_history(bigint,bigint,bigint) TO authenticated;
CREATE FUNCTION public.f12_salary_history(p_employee bigint,p_revision bigint,p_after bigint DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_employee IS NULL OR p_revision IS NULL OR p_after IS NULL OR p_employee<=0 OR p_revision<=0 OR p_after<0 THEN RAISE EXCEPTION 'Original salary history identity required' USING ERRCODE='22023'; END IF;
  IF NOT erp_private.f11_child_authorized('salary-revision',p_employee) THEN RAISE EXCEPTION 'Current scoped payroll manager required' USING ERRCODE='42501'; END IF;
  RETURN erp_private.f12_salary_history(p_employee,p_revision,p_after);
END $$;
REVOKE ALL ON FUNCTION public.f12_salary_history(bigint,bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_salary_history(bigint,bigint,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
