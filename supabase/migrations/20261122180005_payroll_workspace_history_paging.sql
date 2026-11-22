BEGIN;

-- Retain the original workspace RPCs for clients deployed before the summary views.
CREATE FUNCTION erp_private.t16_payroll_workspace_read(p_company bigint,p_branch bigint,p_month date,
 p_after bigint,p_selected_review uuid,p_include_history boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' SET timezone='UTC' AS $$
DECLARE
 can_issue boolean:=erp_private.t16_can(p_company,p_branch,'issue');
 can_reconcile boolean:=erp_private.t16_can(p_company,p_branch,'reconcile');
 actor bigint:=public.current_user_profile_id();
 selected uuid; next_after bigint; item record; line_item record; result_row jsonb; payments jsonb;
 batches jsonb:='[]'; batch_data jsonb; file_rows jsonb; items jsonb; event_rows jsonb; alternate_rows jsonb;
 batch_state text; can_change boolean; can_pay boolean; setup_blocker text;
BEGIN
 IF NOT(can_issue OR can_reconcile) THEN
   RAISE EXCEPTION 'Payroll settlement workspace unavailable for this scope' USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) OR extract(day FROM p_month)<>1 OR p_after<=0 THEN
   RAISE EXCEPTION 'Use an exact payroll month and employee page' USING ERRCODE='22023';
 END IF;
 SELECT r.id INTO selected
 FROM erp_private.t15_reviews r JOIN erp_private.t14_runs a ON a.id=r.run_id
 JOIN erp_private.t14_versions v ON v.id=r.version_id
 WHERE a.company_id=p_company AND a.branch_id=p_branch AND a.month=p_month
   AND r.state IN('approved','superseded') AND (p_selected_review IS NULL OR r.id=p_selected_review)
 ORDER BY v.number DESC LIMIT 1;
 IF p_selected_review IS NOT NULL AND selected IS NULL THEN
   RAISE EXCEPTION 'Selected approval is unavailable in this payroll scope' USING ERRCODE='42501';
 END IF;
 FOR item IN
  SELECT r.id AS review,r.state AS review_state,r.decided_by,r.replacement_requested_by,r.version_id,r.digest,v.number,
    b.id AS batch,b.replaces_batch_id
  FROM erp_private.t15_reviews r JOIN erp_private.t14_runs a ON a.id=r.run_id
   JOIN erp_private.t14_versions v ON v.id=r.version_id
   LEFT JOIN erp_private.t16_batches b ON b.review_id=r.id
  WHERE a.company_id=p_company AND a.branch_id=p_branch AND a.month=p_month AND r.state IN('approved','superseded')
  ORDER BY (r.id=selected) DESC,v.number DESC LIMIT 100
 LOOP
   batch_data:=NULL;
   setup_blocker:=NULL;
   IF item.batch IS NULL AND item.review_state='approved' AND can_issue AND EXISTS(
     SELECT 1 FROM erp_private.t14_results r JOIN public.employee_wps_profiles p
       ON p.employee_id=r.employee_id AND p.deleted_at IS NULL AND p.wps_applicable
     WHERE r.version_id=item.version_id AND r.net>0 AND NOT EXISTS(
       SELECT 1 FROM erp_private.t16_formats f WHERE f.company_id=p_company
         AND f.establishment_id=p.mohre_establishment_id AND f.currency=r.currency AND f.effective_month<=p_month
     )
   ) THEN
     setup_blocker:='An approved bank file layout is required for one or more employees. Review WPS readiness.';
   END IF;
   IF item.batch IS NOT NULL THEN
     batch_state:=erp_private.t16_batch_state(item.batch);
     can_change:=item.review_state='approved' AND can_issue;
     SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'establishment',f.establishment_id,
        'filename',f.filename,'sha256',f.sha256,'count',f.row_count,'total',f.net_total::text,'currency',f.currency,
        'replaces',f.replaces_file_id,'superseded',l.wps_file IS NULL,
        'state',coalesce(l.current_state,erp_private.t16_lane_state(item.batch,f.id::text)),
        'actions',CASE WHEN can_change AND l.current_state='rejected' AND batch_state='mixed'
              AND item.replacement_requested_by IS NULL THEN ARRAY['correct-file']
          WHEN can_change AND l.wps_file IS NOT NULL THEN
            erp_private.t16_lane_actions('wps',l.current_state,item.replacement_requested_by IS NOT NULL)
          ELSE ARRAY[]::text[] END,
        'reference',CASE WHEN can_change THEN (SELECT e.reference FROM erp_private.t16_batch_events e
            WHERE e.batch_id=item.batch AND e.lane_key=f.id::text AND e.kind='handoff-pending') END,
        'downloadable',can_change AND coalesce(l.current_state IN('handoff-pending','submitted','acknowledged','accepted'),false))
        ORDER BY f.establishment_id,(l.wps_file IS NOT NULL) DESC,f.id),'[]'::jsonb)
       INTO file_rows FROM erp_private.t16_files f LEFT JOIN erp_private.t16_batch_lanes(item.batch) l ON f.id=l.wps_file
       WHERE f.batch_id=item.batch;
     SELECT coalesce(jsonb_agg(jsonb_build_object('channel',l.lane,'state',l.current_state,
        'actions',CASE WHEN can_change THEN erp_private.t16_lane_actions(l.lane,l.current_state,
          item.replacement_requested_by IS NOT NULL) ELSE ARRAY[]::text[] END) ORDER BY l.lane),'[]'::jsonb)
       INTO alternate_rows FROM erp_private.t16_batch_lanes(item.batch) l WHERE l.lane<>'wps';
     event_rows:='[]';
     IF p_include_history THEN
       SELECT coalesce(jsonb_agg(jsonb_build_object('kind',e.kind,'at',e.recorded_at,'channel',e.lane,'wps_file',e.wps_file_id)
              ORDER BY e.sequence),'[]'::jsonb)
         INTO event_rows FROM erp_private.t16_batch_events e WHERE e.batch_id=item.batch;
     END IF;
     items:='[]';
     IF item.review=selected AND can_reconcile THEN
       FOR line_item IN
         SELECT member.channel,employee.employee_id,employee.employee_name,employee.currency,employee.net,
           row_number() OVER (ORDER BY member.employee_id) AS page_number
         FROM erp_private.t16_batch_results member JOIN erp_private.t14_results employee
          ON employee.version_id=member.version_id AND employee.employee_id=member.employee_id
         WHERE member.batch_id=item.batch AND (p_after IS NULL OR member.employee_id>p_after)
         ORDER BY member.employee_id LIMIT 51
       LOOP
         IF line_item.page_number>50 THEN
           next_after:=(items->49->>'employee')::bigint;
           EXIT;
         END IF;
         can_pay:=item.review_state='approved' AND actor<>item.decided_by
           AND erp_private.t16_channel_ready(item.batch,line_item.employee_id);
         SELECT coalesce(jsonb_agg(p||jsonb_build_object('amount',p->>'amount','can_allocate',can_pay AND NOT (p->>'reversed')::boolean
                  AND p->>'outcome' IN('paid','partial') AND NOT erp_private.t12_is_subject(actor,line_item.employee_id),
                'can_reverse',can_pay AND NOT (p->>'reversed')::boolean AND (p->>'amount')::numeric>0
                  AND p->>'outcome' IN('paid','partial') AND NOT erp_private.t12_is_subject(actor,line_item.employee_id))
                ORDER BY n),'[]'::jsonb) INTO payments
         FROM jsonb_array_elements(erp_private.t16_payment_history(item.batch,line_item.employee_id))
           WITH ORDINALITY q(p,n);
         result_row:=erp_private.t16_result_status(item.batch,line_item.employee_id);
         -- The result text excludes both bank identifiers and underlying
         -- payroll source payloads, including medical and DMS references.
         items:=items||(
           jsonb_build_object('employee',line_item.employee_id,'name',line_item.employee_name,
             'currency',line_item.currency,'net',line_item.net::text,'channel',line_item.channel,'state',result_row->>'status',
             'verified_cash',result_row->>'verified_cash','applied_wages',result_row->>'applied_wages',
             'applied_deductions',result_row->>'applied_deductions','unallocated',result_row->>'unallocated',
             'remaining',result_row->>'remaining',
             'can_record',can_pay AND NOT erp_private.t12_is_subject(actor,line_item.employee_id),'payments',payments,
             'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'category',l.category,
                    'kind',l.kind,'amount',l.amount::text) ORDER BY l.kind,l.category,l.id),'[]'::jsonb)
                    FROM erp_private.t14_lines l WHERE l.version_id=item.version_id AND l.employee_id=line_item.employee_id))
         );
       END LOOP;
     END IF;
     batch_data:=jsonb_build_object('id',item.batch,'state',batch_state,'files',file_rows,'alternate',alternate_rows,
       'results',items,'history',event_rows,'replaces',item.replaces_batch_id);
     IF NOT p_include_history AND item.review=selected THEN
       batch_data:=batch_data||jsonb_build_object('history_count',(
         SELECT count(*) FROM erp_private.t16_batch_events e WHERE e.batch_id=item.batch
       ));
     END IF;
   END IF;
   batches:=batches||jsonb_build_object('review',item.review,'version',item.version_id,'number',item.number,
     'digest',item.digest,'month',p_month,'batch',batch_data,'issue_blocker',setup_blocker,
     'can_issue',can_issue AND item.batch IS NULL AND item.review_state='approved'
       AND item.replacement_requested_by IS NULL AND setup_blocker IS NULL);
 END LOOP;
 RETURN jsonb_build_object('access',jsonb_build_object('issue',can_issue,'reconcile',can_reconcile),'reviews',batches,
   'selected_review',selected,'next_after',next_after);
END $$;

CREATE OR REPLACE FUNCTION public.t16_payroll_workspace(p_company bigint,p_branch bigint,p_month date,
 p_after bigint DEFAULT NULL,p_selected_review uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
 SELECT erp_private.t16_payroll_workspace_read(p_company,p_branch,p_month,p_after,p_selected_review,true);
$$;

CREATE FUNCTION public.t16_payroll_workspace_summary(p_company bigint,p_branch bigint,p_month date,
 p_after bigint DEFAULT NULL,p_selected_review uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
 SELECT erp_private.t16_payroll_workspace_read(p_company,p_branch,p_month,p_after,p_selected_review,false);
$$;

CREATE FUNCTION public.t16_payroll_bank_history(p_company bigint,p_branch bigint,p_month date,p_review uuid,
 p_after bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE batch uuid; result jsonb;
BEGIN
 IF NOT (erp_private.t16_can(p_company,p_branch,'issue') OR erp_private.t16_can(p_company,p_branch,'reconcile')) THEN
   RAISE EXCEPTION 'Bank history unavailable for this payroll scope' USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) OR extract(day FROM p_month)<>1 OR p_after<=0 THEN
   RAISE EXCEPTION 'Use an exact payroll month and history cursor' USING ERRCODE='22023';
 END IF;
 SELECT b.id INTO batch
 FROM erp_private.t15_reviews h JOIN erp_private.t14_runs a ON a.id=h.run_id
 JOIN erp_private.t16_batches b ON b.review_id=h.id AND b.version_id=h.version_id
 WHERE h.id=p_review AND h.state IN('approved','superseded')
 AND (a.company_id,a.branch_id,a.month)=(p_company,p_branch,p_month)
 AND (b.company_id,b.branch_id,b.month)=(p_company,p_branch,p_month);
 IF batch IS NULL THEN RAISE EXCEPTION 'Bank history unavailable for this payroll scope' USING ERRCODE='42501'; END IF;
 WITH page AS MATERIALIZED (
   SELECT e.sequence,e.kind,e.recorded_at,e.lane,e.wps_file_id
   FROM erp_private.t16_batch_events e WHERE e.batch_id=batch AND (p_after IS NULL OR e.sequence>p_after)
   ORDER BY e.sequence LIMIT 51
 ), visible AS (
   SELECT * FROM page ORDER BY sequence LIMIT 50
 )
 SELECT jsonb_build_object(
    'rows',coalesce(jsonb_agg(jsonb_build_object('sequence',v.sequence,'kind',v.kind,
      'at',v.recorded_at,'channel',v.lane,'wps_file',v.wps_file_id) ORDER BY v.sequence),'[]'::jsonb),
    'count',(SELECT count(*) FROM erp_private.t16_batch_events e WHERE e.batch_id=batch),
    'next_after',CASE WHEN (SELECT count(*) FROM page)>50 THEN max(v.sequence) END
 ) INTO result FROM visible v;
 RETURN result;
END $$;

CREATE FUNCTION erp_private.t17_delivery_rows_page(p_slip bigint,p_before bigint,p_limit integer)
RETURNS TABLE(id bigint,kind text,channel text,state text,at timestamptz,completed_at timestamptz)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT d.id,d.kind,d.channel,
   CASE WHEN v.kind IS NOT NULL THEN v.kind
        WHEN d.channel='print' THEN 'print_ready'
        WHEN q.id IS NULL OR q.deleted_at IS NOT NULL THEN 'cancelled'
        WHEN q.status='sent' AND q.delivery_state='provider_accepted' THEN 'provider_accepted'
        WHEN q.status='delivery_unknown' THEN 'delivery_unknown'
        WHEN q.status='failed' THEN 'failed'
        WHEN q.status='cancelled' THEN 'cancelled'
        WHEN q.paused_at IS NOT NULL THEN 'paused'
        WHEN q.status='processing' THEN 'processing'
        WHEN q.next_retry_at IS NOT NULL THEN 'retry_scheduled'
        ELSE 'queued' END,
   d.created_at,coalesce(v.created_at,q.sent_at,q.cancelled_at,CASE WHEN q.status='failed' THEN q.updated_at END)

 FROM (
   SELECT x.id,x.kind,x.channel,x.created_at
   FROM erp_private.t17_payslip_deliveries x
   WHERE x.slip_id=p_slip AND (p_before IS NULL OR x.id<p_before)
   ORDER BY x.id DESC LIMIT p_limit
 ) d
 LEFT JOIN LATERAL (
   SELECT event.kind,event.created_at FROM erp_private.t17_payslip_delivery_events event
   WHERE event.delivery_id=d.id
   ORDER BY event.created_at DESC,(event.kind='bounced') DESC LIMIT 1
 ) v ON true
 LEFT JOIN public.erp_email_queue q ON q.source_module='HR_PAYSLIP' AND q.source_entity_id=d.id
;
$$;
CREATE FUNCTION erp_private.t17_payslip_workspace_read(p_company bigint,p_branch bigint,p_month date,
 p_employee text,p_after bigint,p_include_history boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' SET timezone='UTC' AS $$
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
     FROM jsonb_array_elements(CASE WHEN p_include_history THEN erp_private.t17_delivery_history(person_row.slip_id)
          ELSE (SELECT coalesce(jsonb_agg(to_jsonb(item)),'[]'::jsonb)
            FROM erp_private.t17_delivery_rows_page(person_row.slip_id,NULL,1) item)
          END) WITH ORDINALITY event(value,seq);
     SELECT coalesce(array_agg(candidate.action ORDER BY candidate.idx),ARRAY[]::text[]) INTO actions
     FROM unnest(ARRAY['initial','resend','print']) WITH ORDINALITY candidate(action,idx)
     WHERE coalesce((action_permissions->>candidate.action)::boolean,false);
     slip:=jsonb_build_object('id',person_row.slip_id,'issued_at',person_row.finalized_at,
       'checksum',person_row.checksum,'filename',person_row.file_name,
       'delivery',jsonb_build_object('history',history,'actions',to_jsonb(actions)));
     IF NOT p_include_history THEN
       slip:=jsonb_set(slip,'{delivery,history_count}',to_jsonb((
         SELECT count(*) FROM erp_private.t17_payslip_deliveries d WHERE d.slip_id=person_row.slip_id
       )));
     END IF;
   END IF;
   items:=items||jsonb_build_object('employee',person_row.employee_id,'name',person_row.employee_name,'code',person_row.code,
     'month',p_month,'batch',batch.id,'version',batch.version_id,'state',row_status,'slip',slip,
     'can_issue',can_issue AND eligible AND person_row.finalized_at IS NULL AND NOT erp_private.t12_is_subject(actor,person_row.employee_id));
 END LOOP;
 RETURN jsonb_build_object('access',jsonb_build_object('view',true,'issue',can_issue,'deliver',can_deliver),
   'rows',items,'next_after',next_after);
END $$;

CREATE OR REPLACE FUNCTION public.t17_payslip_workspace(p_company bigint,p_branch bigint,p_month date,
 p_employee text DEFAULT NULL,p_after bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
 SELECT erp_private.t17_payslip_workspace_read(p_company,p_branch,p_month,p_employee,p_after,true);
$$;

CREATE FUNCTION public.t17_payslip_workspace_summary(p_company bigint,p_branch bigint,p_month date,
 p_employee text DEFAULT NULL,p_after bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
 SELECT erp_private.t17_payslip_workspace_read(p_company,p_branch,p_month,p_employee,p_after,false);
$$;

CREATE FUNCTION public.t17_payslip_delivery_history(p_company bigint,p_branch bigint,p_month date,p_slip bigint,
 p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE batch uuid; result jsonb; permissions jsonb;
BEGIN
 IF NOT erp_private.t17_can(p_company,p_branch,'view') THEN
   RAISE EXCEPTION 'Payslip history unavailable in this scope' USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) OR extract(day FROM p_month)<>1 OR p_slip<=0 OR p_before<=0 THEN
   RAISE EXCEPTION 'Choose an exact payroll month and delivery cursor' USING ERRCODE='22023';
 END IF;
 SELECT b.id INTO batch FROM erp_private.t16_batches b JOIN erp_private.t15_reviews h ON h.id=b.review_id
 WHERE b.company_id=p_company AND b.branch_id=p_branch AND b.month=p_month AND h.state='approved'
 ORDER BY b.issued_at DESC,b.id LIMIT 1;
 IF NOT EXISTS(
   SELECT 1 FROM erp_private.t17_slips s
   JOIN erp_private.t16_batch_results m ON (m.batch_id,m.employee_id)=(s.batch_id,s.employee_id)
   JOIN erp_private.t14_results r ON (r.version_id,r.employee_id)=(m.version_id,m.employee_id)
   JOIN public.employees employee ON employee.id=m.employee_id
   WHERE s.id=p_slip AND s.batch_id=batch
 ) THEN
   RAISE EXCEPTION 'Payslip history unavailable in this scope' USING ERRCODE='42501';
 END IF;
 permissions:=erp_private.t17_delivery_actions(p_slip);
 WITH page AS MATERIALIZED (
   SELECT * FROM erp_private.t17_delivery_rows_page(p_slip,p_before,51)
 ), visible AS (
   SELECT * FROM page ORDER BY id DESC LIMIT 50
 )
 SELECT jsonb_build_object(
   'rows',coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object(
     'can_handover',(permissions->>'handover')::boolean AND v.state='print_ready',
     'can_bounce',(permissions->>'bounce')::boolean AND v.state IN('provider_accepted','provider_accepted_confirmed'),
     'can_reconcile',(permissions->>'reconcile_email')::boolean AND v.state='delivery_unknown'
   ) ORDER BY v.id DESC),'[]'::jsonb),
   'count',(SELECT count(*) FROM erp_private.t17_payslip_deliveries d WHERE d.slip_id=p_slip),
   'next_before',CASE WHEN (SELECT count(*) FROM page)>50 THEN min(v.id) END
 ) INTO result FROM visible v;
 RETURN result;
END $$;


REVOKE ALL ON FUNCTION
 erp_private.t16_payroll_workspace_read(bigint,bigint,date,bigint,uuid,boolean),
 erp_private.t17_delivery_rows_page(bigint,bigint,integer),
 erp_private.t17_payslip_workspace_read(bigint,bigint,date,text,bigint,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
 public.t16_payroll_workspace_summary(bigint,bigint,date,bigint,uuid),
 public.t16_payroll_bank_history(bigint,bigint,date,uuid,bigint),
 public.t17_payslip_workspace_summary(bigint,bigint,date,text,bigint),
 public.t17_payslip_delivery_history(bigint,bigint,date,bigint,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.t16_payroll_workspace_summary(bigint,bigint,date,bigint,uuid),
 public.t16_payroll_bank_history(bigint,bigint,date,uuid,bigint),
 public.t17_payslip_workspace_summary(bigint,bigint,date,text,bigint),
 public.t17_payslip_delivery_history(bigint,bigint,date,bigint,bigint)
 TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
