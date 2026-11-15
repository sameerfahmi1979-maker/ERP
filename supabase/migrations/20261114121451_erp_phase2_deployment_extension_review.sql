BEGIN;
SET LOCAL lock_timeout='5s';

-- The existing scoped-site rewrite joined the boolean keyword to the next
-- token. The real readiness function must run for both activation and review.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO STRICT definition FROM pg_proc
  WHERE oid='erp_private.f11_readiness_sources(bigint,bigint)'::regprocedure
    AND md5(replace(prosrc,E'\r\n',E'\n'))='99c506cb875652d34f5b85cc81dc74f6';
  EXECUTE replace(definition,'WHERE trueAND(', 'WHERE (');
END $$;

-- Row locking an employee through the invoker also demands employee-edit
-- RLS. Assignment authority can lock its own parent without editing it.
CREATE FUNCTION erp_private.lock_assignment_employee(p_employee bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT erp_private.f11_child_authorized('assignment',p_employee) THEN
    RAISE EXCEPTION 'Assignment subject unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT erp_private.f11_child_authorized('assignment',p_employee) THEN
    RAISE EXCEPTION 'Assignment subject unavailable' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.lock_assignment_employee(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.lock_assignment_employee(bigint) TO authenticated;
DO $$
DECLARE definition text;
BEGIN
  SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n') INTO STRICT definition FROM pg_proc
  WHERE oid='public.f11_mutate_assignment(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure
    AND md5(replace(prosrc,E'\r\n',E'\n'))='242f6e702a25140904decd00932c0155';
  definition:=replace(definition,$old$ PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;$old$,
   ' PERFORM erp_private.lock_assignment_employee(p_employee);');
  IF position('erp_private.lock_assignment_employee(p_employee)' IN definition)=0 THEN RAISE EXCEPTION 'Assignment parent lock anchor missing'; END IF;
  EXECUTE definition;
END $$;

-- The existing review stores immutable request data and the source revision
-- and evidence hash. Use its period_end for the exact requested extension.
DO $$
DECLARE definition text;
BEGIN
  SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n') INTO STRICT definition FROM pg_proc
  WHERE oid='erp_private.f12_workforce_commit(jsonb)'::regprocedure
    AND md5(replace(prosrc,E'\r\n',E'\n'))='9e026e7e0c470aefceaece62d46eac4a';
  definition:=replace(definition,$old$  medical:=kind IN('medical-insurance','medical-record')OR snapshot#>>'{source,requirement_type}'='medical';$old$,$new$
  IF kind='assignment' AND data ? 'period_end' AND (
    snapshot#>>'{source,assignment_status}' IS DISTINCT FROM 'active' OR snapshot#>>'{source,work_site_id}' IS NULL
    OR snapshot#>>'{source,effective_to}' IS NULL
    OR (data->>'period_end')::date <= greatest((snapshot#>>'{source,effective_to}')::date,(now() AT TIME ZONE 'Asia/Dubai')::date-1)
    OR (data->>'period_end')::date>until_day
  ) THEN RAISE EXCEPTION 'Select a later end date or explicitly request an open-ended deployment' USING ERRCODE='23514'; END IF;
  medical:=kind IN('medical-insurance','medical-record')OR snapshot#>>'{source,requirement_type}'='medical';$new$);
  definition:=replace(definition,$old$old.purpose='deployment'AND(snapshot#>>'{source,assignment_status}'IS DISTINCT FROM'planned'OR$old$,
    $new$old.purpose='deployment'AND(snapshot#>>'{source,assignment_status}' IS DISTINCT FROM (CASE WHEN old.data ? 'period_end' THEN 'active' ELSE 'planned' END) OR$new$);
  IF position('explicitly request an open-ended deployment' IN definition)=0 OR position('old.data ? ''period_end''' IN definition)=0 THEN
    RAISE EXCEPTION 'Workforce review extension anchors missing';
  END IF;
  EXECUTE definition;
END $$;

DO $$
DECLARE definition text;
BEGIN
  SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n') INTO STRICT definition FROM pg_proc
  WHERE oid='erp_private.f12_deployment_safety()'::regprocedure
    AND md5(replace(prosrc,E'\r\n',E'\n'))='ea58e575fef76f51ab704ffc486b23ca';
  definition:=replace(definition,';BEGIN', $new$;
  extension boolean:=TG_OP='UPDATE' AND OLD.assignment_status='active' AND OLD.work_site_id IS NOT NULL
    AND OLD.effective_to IS NOT NULL AND (NEW.effective_to IS NULL OR NEW.effective_to>OLD.effective_to);
  BEGIN$new$);
  definition:=replace(definition,$old$ IF NEW.assignment_status='active'AND NEW.work_site_id IS NOT NULL AND(TG_OP='INSERT'OR OLD.assignment_status<>'active')THEN
  IF TG_OP='INSERT'OR OLD.assignment_status<>'planned'OR ROW(NEW.work_site_id,NEW.effective_from,NEW.effective_to,NEW.assignment_type,NEW.notes)IS DISTINCT FROM ROW(OLD.work_site_id,OLD.effective_from,OLD.effective_to,OLD.assignment_type,OLD.notes)THEN RAISE EXCEPTION 'Activate the unchanged independently approved planned assignment' USING ERRCODE='23514';END IF;$old$,$new$
 IF extension AND NEW.assignment_status<>'active' THEN
  RAISE EXCEPTION 'Apply the independently reviewed extension before ending the assignment' USING ERRCODE='23514';
 END IF;
 IF NEW.assignment_status='active' AND NEW.work_site_id IS NOT NULL AND (extension OR TG_OP='INSERT' OR OLD.assignment_status<>'active') THEN
  IF NOT extension AND (TG_OP='INSERT' OR OLD.assignment_status<>'planned' OR
    ROW(NEW.work_site_id,NEW.effective_from,NEW.effective_to,NEW.assignment_type,NEW.notes) IS DISTINCT FROM
    ROW(OLD.work_site_id,OLD.effective_from,OLD.effective_to,OLD.assignment_type,OLD.notes)) THEN
    RAISE EXCEPTION 'Activate the unchanged independently approved planned assignment' USING ERRCODE='23514';
  END IF;
  IF extension AND ROW(NEW.assignment_type,NEW.notes) IS DISTINCT FROM ROW(OLD.assignment_type,OLD.notes) THEN
    RAISE EXCEPTION 'Apply the reviewed deployment end date without other edits' USING ERRCODE='23514';
  END IF;$new$);
  definition:=replace(definition,$old$  IF NOT FOUND THEN RAISE EXCEPTION 'Current independent deployment approval required' USING ERRCODE='23514';END IF;$old$,$new$
  IF NOT FOUND OR (r.data ? 'period_end') IS DISTINCT FROM extension OR
    (extension AND (r.data->>'period_end')::date IS DISTINCT FROM NEW.effective_to) OR
    EXISTS (SELECT 1 FROM erp_private.f12_deployment_effects WHERE review_id=r.id) THEN
    RAISE EXCEPTION 'Current independent deployment approval required' USING ERRCODE='23514';
  END IF;$new$);
  definition:=replace(definition,'IF r.reviewer_id=r.requested_by OR',
    'IF r.reviewer_id=r.requested_by OR (extension AND r.reviewer_id=public.current_user_profile_id()) OR');
  definition:=replace(definition,$old$  INSERT INTO erp_private.f12_deployment_effects$old$,$new$
  IF extension AND NEW.effective_to IS NOT NULL AND (
    NEW.effective_to>r.valid_until OR NOT coalesce(erp_private.f11_calculate_readiness(
      jsonb_set(s->'configuration','{day}',to_jsonb(NEW.effective_to)))->>'status'='ready',false)
  ) THEN RAISE EXCEPTION 'Deployment evidence must cover the reviewed extension end' USING ERRCODE='PT409'; END IF;
  INSERT INTO erp_private.f12_deployment_effects$new$);
  IF position('extension boolean' IN definition)=0 OR position('r.data ? ''period_end''' IN definition)=0
    OR position('NOT extension AND' IN definition)=0 THEN RAISE EXCEPTION 'Deployment extension anchors missing'; END IF;
  EXECUTE definition;
END $$;

-- The reviewer needs to see the proposed date before making a decision.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO STRICT definition FROM pg_proc
  WHERE oid='erp_private.f12_workforce_list(bigint,text,bigint)'::regprocedure
    AND md5(replace(prosrc,E'\r\n',E'\n'))='29752ca937096f91970da57555f4b24a';
  definition:=replace(definition,'r.valid_from,r.valid_until,r.created_at FROM',
    'r.valid_from,r.valid_until,r.created_at, (r.purpose=''deployment'' AND r.data ? ''period_end'') AS is_extension, CASE WHEN r.purpose=''deployment'' THEN r.data->>''period_end'' END AS proposed_end FROM');
  IF position('AS proposed_end' IN definition)=0 THEN RAISE EXCEPTION 'Deployment review output anchor missing'; END IF;
  EXECUTE definition;
END $$;
COMMIT;
