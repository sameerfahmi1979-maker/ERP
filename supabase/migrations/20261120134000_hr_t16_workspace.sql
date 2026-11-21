
BEGIN;

CREATE FUNCTION public.t16_payroll_scopes() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('company_id',c.id,'branch_id',b.id,'company',c.legal_name_en,
   'branch',b.branch_name_en) ORDER BY c.legal_name_en,b.branch_name_en,b.id),'[]'::jsonb)
 FROM public.owner_companies c JOIN public.branches b ON b.owner_company_id=c.id
 WHERE c.status='active' AND b.status='active' AND b.operating_status='active'
 AND (erp_private.t16_can(c.id,b.id,'issue') OR erp_private.t16_can(c.id,b.id,'reconcile'));
$$;

CREATE FUNCTION public.t16_payroll_evidence_options(p_company bigint,p_branch bigint,p_search text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE search text:=lower(btrim(p_search)); output jsonb;
BEGIN
 IF NOT (erp_private.t16_can(p_company,p_branch,'issue') OR erp_private.t16_can(p_company,p_branch,'reconcile'))
 OR NOT erp_private.t02_has_scope('dms.documents.preview',p_company,p_branch)
 OR NOT erp_private.t02_has_scope('dms.documents.view.finance',p_company,p_branch) THEN
   RAISE EXCEPTION 'Private bank evidence is unavailable in this scope' USING ERRCODE='42501';
 END IF;
 IF search IS NULL OR length(search)>120 THEN RAISE EXCEPTION 'Use a valid bank evidence search' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('document',id,'version',version_id,'file',file_id,
     'label',left(document_no||' - '||title,1000)) ORDER BY id DESC),'[]'::jsonb) INTO output
 FROM (
   SELECT d.id,d.document_no,d.title,v.id AS version_id,f.id AS file_id
   FROM public.dms_documents d
   JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.type_code='T16_BANK_EVIDENCE'
     AND t.is_active AND t.deleted_at IS NULL AND t.category_id=d.category_id
   JOIN public.dms_document_categories c ON c.id=d.category_id AND c.category_code='T16_PAYROLL_EVIDENCE'
     AND c.is_active AND c.deleted_at IS NULL
   JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id
     AND v.is_current AND v.unlinked_at IS NULL
   JOIN public.dms_document_files f ON f.version_id=v.id AND f.document_id=d.id AND f.file_role='original'
     AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
   WHERE d.owning_company_id=p_company AND d.owning_branch_id=p_branch
     AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status='active' AND d.confidentiality_level='finance'
     AND (search='' OR strpos(lower(d.document_no),search)>0 OR strpos(lower(d.title),search)>0)
     AND erp_private.t13_evidence_is_operative(d.id) AND erp_private.document_permission(d.id,'dms.documents.preview')
   ORDER BY d.id DESC LIMIT 25
 ) eligible;
 RETURN output;
END $$;

CREATE FUNCTION erp_private.t16_lane_actions(p_lane text,p_state text,p_replacement_pending boolean)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE
   WHEN p_lane='wps' AND p_state='prepared' AND NOT p_replacement_pending THEN ARRAY['start-handoff','cancel']
   WHEN p_lane='wps' AND p_state='prepared' THEN ARRAY['cancel']
   WHEN p_lane='wps' AND p_state='handoff-pending' THEN ARRAY['record-submission','reject','cancel']
   WHEN p_lane='wps' AND p_state='submitted' THEN ARRAY['acknowledge','accept','reject','cancel']
   WHEN p_lane='wps' AND p_state='acknowledged' THEN ARRAY['accept','reject','cancel']
   WHEN p_lane<>'wps' AND p_state='prepared' AND NOT p_replacement_pending THEN ARRAY['authorize-'||p_lane,'cancel-'||p_lane]
   WHEN p_lane<>'wps' AND p_state='prepared' THEN ARRAY['cancel-'||p_lane]
   ELSE ARRAY[]::text[] END;
$$;

CREATE FUNCTION public.t16_payroll_workspace(p_company bigint,p_branch bigint,p_month date,
 p_after bigint DEFAULT NULL,p_selected_review uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
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
     SELECT coalesce(jsonb_agg(jsonb_build_object('kind',e.kind,'at',e.recorded_at,'channel',e.lane,'wps_file',e.wps_file_id)
            ORDER BY e.sequence),'[]'::jsonb)
       INTO event_rows FROM erp_private.t16_batch_events e WHERE e.batch_id=item.batch;
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
   END IF;
   batches:=batches||jsonb_build_object('review',item.review,'version',item.version_id,'number',item.number,
     'digest',item.digest,'month',p_month,'batch',batch_data,'issue_blocker',setup_blocker,
     'can_issue',can_issue AND item.batch IS NULL AND item.review_state='approved'
       AND item.replacement_requested_by IS NULL AND setup_blocker IS NULL);
 END LOOP;
 RETURN jsonb_build_object('access',jsonb_build_object('issue',can_issue,'reconcile',can_reconcile),'reviews',batches,
   'selected_review',selected,'next_after',next_after);
END $$;

REVOKE ALL ON FUNCTION erp_private.t16_lane_actions(text,text,boolean),public.t16_payroll_scopes(),public.t16_payroll_workspace(bigint,bigint,date,bigint,uuid),
 public.t16_payroll_evidence_options(bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t16_payroll_scopes(),public.t16_payroll_workspace(bigint,bigint,date,bigint,uuid),
 public.t16_payroll_evidence_options(bigint,bigint,text) TO authenticated;
COMMIT;
