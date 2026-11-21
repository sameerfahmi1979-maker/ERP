
BEGIN;

CREATE FUNCTION erp_private.t15_review_summary(p_review erp_private.t15_reviews,p_version erp_private.t14_versions,p_month date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_review.id,'run',p_review.run_id,'version',p_version.id,'number',p_version.number,
   'month',p_month,'cutoff',p_version.cutoff,'digest',p_review.digest,'state',p_review.state,
   'submitted_at',p_review.submitted_at,'decision_at',p_review.decided_at,
   'bank_state',erp_private.t15_bank_state(p_review.id));
$$;

CREATE FUNCTION public.t15_payroll_review_scopes() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('company_id',c.id,'branch_id',b.id,'company',c.legal_name_en,
      'branch',b.branch_name_en,'can_submit',rights.can_submit,'can_approve',rights.can_approve)
    ORDER BY c.legal_name_en,b.branch_name_en,b.id),'[]')
 FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
 CROSS JOIN LATERAL (SELECT erp_private.t15_review_permissions(c.id,b.id,'submit') AS can_submit,
       erp_private.t15_review_permissions(c.id,b.id,'approve') AS can_approve) rights
 WHERE b.status='active' AND b.operating_status='active' AND c.status='active' AND (rights.can_submit OR rights.can_approve);
$$;

CREATE FUNCTION public.t15_payroll_review_workspace(p_company bigint,p_branch bigint,p_month date,p_review uuid DEFAULT NULL,
 p_employee bigint DEFAULT NULL,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 can_submit boolean; can_approve boolean; candidate_available boolean; independent boolean; allow_replacement boolean;
 anchor erp_private.t14_runs; latest erp_private.t14_versions; selected erp_private.t14_versions;
 current_review erp_private.t15_reviews; person erp_private.t14_results; actor bigint:=public.current_user_profile_id();
 draft jsonb; item jsonb; detail jsonb; held_count int; cursor_id bigint;
 reviews jsonb:='[]'; employees jsonb:='[]'; events jsonb:='[]'; actions text[]:=ARRAY[]::text[];
BEGIN
 can_submit:=erp_private.t15_review_permissions(p_company,p_branch,'submit');
 can_approve:=erp_private.t15_review_permissions(p_company,p_branch,'approve');
 IF NOT(can_submit OR can_approve) THEN RAISE EXCEPTION 'Payroll review workspace unavailable for this scope' USING ERRCODE='42501'; END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) OR p_month<>date_trunc('month',p_month::timestamp)::date
    OR p_before<=0 OR p_employee<=0 THEN
   RAISE EXCEPTION 'Use an exact monthly payroll scope and valid employee selection' USING ERRCODE='22023';
 END IF;
 SELECT * INTO anchor FROM erp_private.t14_runs WHERE company_id=p_company AND branch_id=p_branch AND month=p_month;
 SELECT * INTO latest FROM erp_private.t14_versions WHERE run_id=anchor.id ORDER BY number DESC LIMIT 1;
 IF latest.id IS NOT NULL THEN
   SELECT count(*) INTO held_count FROM erp_private.t14_results WHERE version_id=latest.id AND state<>'ready';
   candidate_available:=can_submit AND held_count=0 AND NOT EXISTS(
     SELECT 1 FROM erp_private.t15_reviews r WHERE r.run_id=anchor.id AND (r.version_id=latest.id OR r.state IN('submitted','approved'))
   );
   draft:=jsonb_build_object('run',anchor.id,'version',latest.id,'number',latest.number,'month',anchor.month,'cutoff',latest.cutoff,
     'digest',latest.digest,'source_digest',latest.source_digest,'rule_digest',latest.rule_digest,'totals',latest.totals,
     'exception_count',latest.exception_count,'blocking_count',held_count,'can_submit',candidate_available);
 END IF;
 SELECT coalesce(jsonb_agg(erp_private.t15_review_summary(chosen,v,anchor.month)
    ORDER BY v.number DESC),'[]') INTO reviews
 FROM (SELECT r.* FROM erp_private.t15_reviews r WHERE r.run_id=anchor.id ORDER BY r.submitted_at DESC LIMIT 100) chosen
 JOIN erp_private.t14_versions v ON v.id=chosen.version_id;
 IF p_review IS NOT NULL THEN
   SELECT * INTO current_review FROM erp_private.t15_reviews WHERE id=p_review AND run_id=anchor.id;
   IF current_review.id IS NULL THEN RAISE EXCEPTION 'Payroll review unavailable for this scope' USING ERRCODE='42501'; END IF;
   SELECT * INTO selected FROM erp_private.t14_versions WHERE id=current_review.version_id;
   independent:=can_approve AND erp_private.t15_independent(selected.id,actor,current_review.submitted_by);
   allow_replacement:=erp_private.t15_replacement_eligible(current_review.id);
   IF current_review.state='submitted' THEN
     IF can_submit THEN actions:=array_append(actions,'withdraw'); END IF;
     IF independent THEN actions:=actions||ARRAY['approve','reject']; END IF;
   ELSIF current_review.state='approved' THEN
     IF can_submit AND allow_replacement AND current_review.replacement_requested_by IS NULL THEN
       actions:=array_append(actions,'request-release');
     END IF;
     IF independent AND current_review.replacement_requested_by IS NOT NULL AND actor<>current_review.replacement_requested_by THEN
       IF allow_replacement THEN actions:=array_append(actions,'release'); END IF;
       actions:=array_append(actions,'decline-release');
     END IF;
   END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'date',x.recorded_at,'reason',x.reason)
      ORDER BY x.recorded_at,x.id),'[]') INTO events
   FROM (
     SELECT e.kind,e.recorded_at,e.reason,e.id FROM erp_private.t15_review_events e WHERE e.review_id=p_review
     UNION ALL
     SELECT 'bank-'||b.kind,b.recorded_at,'Verified payroll transfer status',b.id
       FROM erp_private.t15_bank_events b WHERE b.review_id=p_review
   ) x;
   SELECT count(*) INTO held_count FROM erp_private.t14_results WHERE version_id=selected.id AND state<>'ready';
   item:=erp_private.t15_review_summary(current_review,selected,anchor.month)
     ||jsonb_build_object('totals',selected.totals,'exception_count',selected.exception_count,'blocking_count',held_count,
       'source_digest',selected.source_digest,'rule_digest',selected.rule_digest,'actions',actions,'events',events,
       'claims_count',current_review.claim_count,
       'submitter_label',(SELECT full_name FROM public.user_profiles WHERE id=current_review.submitted_by),
       'approver_label',(SELECT full_name FROM public.user_profiles WHERE id=current_review.decided_by));
 ELSE
   selected:=latest;
 END IF;
 IF selected.id IS NOT NULL THEN
   WITH page AS(
     SELECT e.*,row_number() OVER(ORDER BY e.employee_id) AS position
     FROM erp_private.t14_results e WHERE e.version_id=selected.id AND (p_before IS NULL OR e.employee_id>p_before)
     ORDER BY e.employee_id LIMIT 51
   )
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.employee_id,'name',e.employee_name,'employment_ids',e.employment_ids,
       'currency',e.currency,'gross',e.gross::text,'deductions',e.deductions::text,'net',e.net::text,
       'state',e.state,'exception_count',jsonb_array_length(e.exceptions)) ORDER BY e.employee_id) FILTER(WHERE e.position<=50),'[]'),
     CASE WHEN count(*)>50 THEN max(e.employee_id) FILTER(WHERE e.position<=50) END
   INTO employees,cursor_id FROM page e;
 END IF;
 IF p_employee IS NOT NULL THEN
   SELECT * INTO person FROM erp_private.t14_results e WHERE e.version_id=selected.id AND e.employee_id=p_employee;
   IF person.employee_id IS NULL THEN RAISE EXCEPTION 'Employee payroll detail unavailable for this scope' USING ERRCODE='42501'; END IF;
   detail:=jsonb_build_object('id',p_employee,'name',person.employee_name,'policies',person.policy_snapshots,
     'exceptions',(SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x.value->'source')='object'
         THEN jsonb_set(x.value,'{source}',(x.value->'source')-'evidence_version') ELSE x.value END ORDER BY x.ordinal),'[]')
       FROM jsonb_array_elements(person.exceptions) WITH ORDINALITY x(value,ordinal)),
     'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'key',l.key,'category',l.category,'kind',l.kind,
          'amount',l.amount::text,'currency',l.currency,'quantity',l.quantity::text,'unit',l.unit,'rate',l.rate::text,
          'original_on',l.original_on,'available_at',l.available_at,'source',l.source-'evidence_version','reason',l.reason)
          ORDER BY l.original_on,l.category,l.key),'[]')
       FROM erp_private.t14_lines l WHERE l.version_id=selected.id AND l.employee_id=p_employee));
 END IF;
 RETURN jsonb_build_object('can_submit',can_submit,'can_approve',can_approve,'draft',draft,'reviews',reviews,'review',item,
  'employees',employees,'detail',detail,'next_before',cursor_id);
END $$;

REVOKE ALL ON FUNCTION erp_private.t15_review_summary(erp_private.t15_reviews,erp_private.t14_versions,date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t15_payroll_review_scopes(),public.t15_payroll_review_workspace(bigint,bigint,date,uuid,bigint,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t15_payroll_review_scopes(),public.t15_payroll_review_workspace(bigint,bigint,date,uuid,bigint,bigint)
  TO authenticated;
NOTIFY pgrst,'reload schema';

COMMIT;
