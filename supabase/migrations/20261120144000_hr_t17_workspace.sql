
BEGIN;

CREATE FUNCTION public.t17_payslip_scopes()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('company_id',c.id,'branch_id',b.id,'company',c.legal_name_en,
   'branch',b.branch_name_en) ORDER BY c.legal_name_en,b.branch_name_en,b.id),'[]'::jsonb)
 FROM public.owner_companies c JOIN public.branches b ON b.owner_company_id=c.id
 WHERE c.status='active' AND b.status='active' AND b.operating_status='active'
   AND erp_private.t17_can(c.id,b.id,'view');
$$;

CREATE FUNCTION public.t17_payslip_workspace(p_company bigint,p_branch bigint,p_month date,
 p_employee text DEFAULT NULL,p_after bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 can_issue boolean; can_deliver boolean; actor bigint:=public.current_user_profile_id();
 person text:=nullif(btrim(p_employee),''); batch erp_private.t16_batches; person_row record;
 count_rows int:=0; items jsonb:='[]'::jsonb; history jsonb; action_permissions jsonb; actions text[];
 row_status text; next_after bigint; previous_id bigint; slip jsonb; eligible boolean;
BEGIN
 IF NOT erp_private.t17_can(p_company,p_branch,'view') THEN
   RAISE EXCEPTION 'Payslip workspace unavailable in this scope' USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) OR extract(day FROM p_month)<>1 OR p_after<=0 OR length(person)>100 THEN
   RAISE EXCEPTION 'Choose an exact payroll month and employee code or number' USING ERRCODE='22023';
 END IF;
 can_issue:=erp_private.t17_can(p_company,p_branch,'issue');
 can_deliver:=erp_private.t17_can(p_company,p_branch,'deliver');
 SELECT b.* INTO batch FROM erp_private.t16_batches b JOIN erp_private.t15_reviews h ON h.id=b.review_id
 WHERE b.company_id=p_company AND b.branch_id=p_branch AND b.month=p_month AND h.state='approved'
 ORDER BY b.issued_at DESC,b.id LIMIT 1;
 FOR person_row IN
  SELECT m.employee_id,r.employee_name,coalesce(s.employee_code,e.employee_code) AS code,s.id AS slip_id,
    s.file_name,a.finalized_at,a.checksum
  FROM erp_private.t16_batch_results m JOIN erp_private.t14_results r
   ON r.version_id=m.version_id AND r.employee_id=m.employee_id
  JOIN public.employees e ON e.id=m.employee_id
  LEFT JOIN erp_private.t17_slips s ON s.batch_id=m.batch_id AND s.employee_id=m.employee_id
  LEFT JOIN erp_private.t17_artifacts a ON a.slip_id=s.id
  WHERE m.batch_id=batch.id AND (p_after IS NULL OR m.employee_id>p_after)
    AND (person IS NULL OR lower(person)=lower(coalesce(s.employee_code,e.employee_code)) OR person=m.employee_id::text)
  ORDER BY m.employee_id LIMIT 51
 LOOP
   count_rows:=count_rows+1;
   IF count_rows>50 THEN next_after:=previous_id; EXIT; END IF;
   previous_id:=person_row.employee_id;
   row_status:=coalesce(erp_private.t16_result_status(batch.id,person_row.employee_id)->>'status','unpaid');
   eligible:=row_status='reconciled' AND erp_private.t17_eligible(batch.id,person_row.employee_id);
   slip:=NULL;
   IF person_row.slip_id IS NOT NULL THEN
     action_permissions:=erp_private.t17_delivery_actions(person_row.slip_id);
     SELECT coalesce(jsonb_agg(event.value||jsonb_build_object(
         'can_handover',(action_permissions->>'handover')::boolean AND event.value->>'state'='print_ready',
         'can_bounce',(action_permissions->>'bounce')::boolean AND event.value->>'state' IN ('provider_accepted','provider_accepted_confirmed'),
         'can_reconcile',(action_permissions->>'reconcile_email')::boolean AND event.value->>'state'='delivery_unknown')
         ORDER BY event.seq),'[]'::jsonb) INTO history
     FROM jsonb_array_elements(erp_private.t17_delivery_history(person_row.slip_id)) WITH ORDINALITY event(value,seq);
     SELECT coalesce(array_agg(candidate.action ORDER BY candidate.idx),ARRAY[]::text[]) INTO actions
     FROM unnest(ARRAY['initial','resend','print']) WITH ORDINALITY candidate(action,idx)
     WHERE coalesce((action_permissions->>candidate.action)::boolean,false);
     slip:=jsonb_build_object('id',person_row.slip_id,'issued_at',person_row.finalized_at,
       'checksum',person_row.checksum,'filename',person_row.file_name,
       'delivery',jsonb_build_object('history',history,'actions',to_jsonb(actions)));
   END IF;
   items:=items||jsonb_build_object('employee',person_row.employee_id,'name',person_row.employee_name,'code',person_row.code,
     'month',p_month,'batch',batch.id,'version',batch.version_id,'state',row_status,'slip',slip,
     'can_issue',can_issue AND eligible AND person_row.finalized_at IS NULL AND NOT erp_private.t12_is_subject(actor,person_row.employee_id));
 END LOOP;
 RETURN jsonb_build_object('access',jsonb_build_object('view',true,'issue',can_issue,'deliver',can_deliver),
   'rows',items,'next_after',next_after);
END $$;

REVOKE ALL ON FUNCTION public.t17_payslip_scopes(),public.t17_payslip_workspace(bigint,bigint,date,text,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t17_payslip_scopes(),public.t17_payslip_workspace(bigint,bigint,date,text,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
