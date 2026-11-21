
BEGIN;

CREATE FUNCTION public.t14_payroll_command(p_operation uuid,p_company bigint,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 actor bigint:=public.current_user_profile_id(); note text:=btrim(p_data->>'reason');
 request_hash text; prior jsonb; result jsonb; rule_action boolean;
BEGIN
 IF actor IS NULL OR p_operation IS NULL OR p_company IS NULL OR p_branch IS NULL
    OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR NOT coalesce(length(note) BETWEEN 1 AND 2000,false)
    OR p_action IS NULL OR p_action NOT IN('calculate','prepare-rule','approve-rule','prepare-adjustment','verify-adjustment','reject-adjustment') THEN
   RAISE EXCEPTION 'Select an authenticated payroll action and give the reason' USING ERRCODE='22023';
 END IF;
 rule_action:=p_action IN('prepare-rule','approve-rule');
 IF (rule_action AND NOT erp_private.t02_has_scope('hr.payroll.run.policy',p_company,p_branch))
    OR (NOT rule_action AND NOT erp_private.t14_run_authorized(p_company,p_branch)) THEN
   RAISE EXCEPTION 'Scoped payroll authority is unavailable' USING ERRCODE='42501';
 END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(p_company,p_branch,p_action,p_data));
 prior:=erp_private.t02_replay('t14-payroll',p_operation,request_hash);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF rule_action THEN
   result:=jsonb_build_object('id',erp_private.t14_rule_write(p_company,p_branch,p_action,p_data,actor,note));
 ELSIF p_action='calculate' THEN
   IF NOT (p_data ? 'expected_version') OR coalesce(p_data->>'cutoff','')
        !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
     RAISE EXCEPTION 'Use the exact draft version and a cutoff with an explicit time zone' USING ERRCODE='22023';
   END IF;
   result:=erp_private.t14_calculate(p_company,p_branch,(p_data->>'month')::date,(p_data->>'cutoff')::timestamptz,
      (p_data->>'expected_version')::uuid,actor,note);
 ELSE
   PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||p_company,0));
   result:=jsonb_build_object('id',erp_private.t14_adjustment_write(p_company,p_branch,p_action,p_data,actor,note));
 END IF;
 RETURN erp_private.t02_save_receipt('t14-payroll',p_operation,request_hash,result||jsonb_build_object('action',p_action));
END $$;

CREATE FUNCTION public.t14_payroll_scopes() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('company_id',c.id,'branch_id',b.id,'company',c.legal_name_en,
       'branch',b.branch_name_en,'can_calculate',perm.can_run,'can_policy',perm.can_policy)
       ORDER BY c.legal_name_en,b.branch_name_en,b.id),'[]'::jsonb)
 FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
 CROSS JOIN LATERAL (
   SELECT erp_private.t14_run_authorized(c.id,b.id) AS can_run,
     erp_private.t02_has_scope('hr.payroll.run.policy',c.id,b.id) AS can_policy
 ) perm
 WHERE b.status='active' AND b.operating_status='active' AND c.status='active' AND (perm.can_run OR perm.can_policy);
$$;

CREATE FUNCTION public.t14_payroll_workspace(p_company bigint,p_branch bigint,p_month date,p_version uuid DEFAULT NULL,
 p_employee bigint DEFAULT NULL,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 can_run boolean; can_policy boolean; anchor erp_private.t14_runs; chosen erp_private.t14_versions;
 selected_employee erp_private.t14_results; version_record jsonb; detail jsonb; cursor_id bigint;
 copies jsonb:='[]'; employees jsonb:='[]'; rules jsonb:='[]'; groups jsonb:='[]'; adjustments jsonb:='[]'; evidence jsonb:='[]';
BEGIN
 can_run:=erp_private.t14_run_authorized(p_company,p_branch);
 can_policy:=erp_private.t02_has_scope('hr.payroll.run.policy',p_company,p_branch);
 IF NOT(can_run OR can_policy) THEN RAISE EXCEPTION 'Payroll workspace unavailable for this scope' USING ERRCODE='42501'; END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) OR p_month<>date_trunc('month',p_month::timestamp)::date OR p_before<=0 OR p_employee<=0 THEN
   RAISE EXCEPTION 'Use a payroll month and a valid employee selection' USING ERRCODE='22023';
 END IF;
 IF can_policy THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'group_id',x.group_id,'validity',x.validity,
     'facts',x.facts,'approved_at',x.approved_at) ORDER BY x.id DESC),'[]') INTO rules
   FROM (SELECT p.* FROM erp_private.t14_rules p WHERE p.company_id=p_company AND p.branch_id=p_branch ORDER BY id DESC LIMIT 100) x;
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name_en) ORDER BY g.name_en,g.id),'[]') INTO groups
   FROM public.hr_payroll_groups g WHERE g.is_active AND g.deleted_at IS NULL AND g.pay_frequency='monthly';
 END IF;
 IF can_run THEN
   SELECT * INTO anchor FROM erp_private.t14_runs WHERE company_id=p_company AND branch_id=p_branch AND month=p_month;
   SELECT * INTO chosen FROM erp_private.t14_versions s WHERE s.run_id=anchor.id AND (p_version IS NULL OR s.id=p_version)
   ORDER BY s.number DESC LIMIT 1;
   IF (p_version IS NOT NULL OR p_employee IS NOT NULL) AND chosen.id IS NULL THEN
     RAISE EXCEPTION 'Payroll version unavailable for this scope' USING ERRCODE='42501';
   END IF;
   IF chosen.id IS NOT NULL THEN
     version_record:=jsonb_build_object('id',chosen.id,'number',chosen.number,'month',anchor.month,'cutoff',chosen.cutoff,
       'digest',chosen.digest,'source_digest',chosen.source_digest,'rule_digest',chosen.rule_digest,'totals',chosen.totals,
       'exception_count',chosen.exception_count);
     SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'number',s.number,'cutoff',s.cutoff,'created_at',s.created_at)
           ORDER BY s.number DESC),'[]') INTO copies
     FROM (SELECT v.* FROM erp_private.t14_versions v WHERE v.run_id=anchor.id ORDER BY v.number DESC LIMIT 100) s;
     WITH page AS(
       SELECT e.*,row_number() OVER(ORDER BY e.employee_id) AS position
       FROM erp_private.t14_results e WHERE e.version_id=chosen.id AND (p_before IS NULL OR e.employee_id>p_before)
       ORDER BY e.employee_id LIMIT 51
     )
     SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.employee_id,'name',e.employee_name,'employment_ids',e.employment_ids,
         'currency',e.currency,'gross',e.gross::text,'deductions',e.deductions::text,'net',e.net::text,
         'state',e.state,'exception_count',jsonb_array_length(e.exceptions)) ORDER BY e.employee_id) FILTER(WHERE e.position<=50),'[]'),
       CASE WHEN count(*)>50 THEN max(e.employee_id) FILTER(WHERE e.position<=50) END
     INTO employees,cursor_id FROM page e;
     IF p_employee IS NOT NULL THEN
       SELECT * INTO selected_employee FROM erp_private.t14_results e WHERE e.version_id=chosen.id AND e.employee_id=p_employee;
       IF selected_employee.employee_id IS NULL THEN RAISE EXCEPTION 'Employee payroll detail is unavailable' USING ERRCODE='42501'; END IF;
       detail:=jsonb_build_object('id',p_employee,'name',selected_employee.employee_name,'policies',selected_employee.policy_snapshots,
         'exceptions',(SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x.value->'source')='object'
            THEN jsonb_set(x.value,'{source}',(x.value->'source')-'evidence_version') ELSE x.value END ORDER BY x.ordinal),'[]')
            FROM jsonb_array_elements(selected_employee.exceptions) WITH ORDINALITY x(value,ordinal)),
         'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'key',l.key,'category',l.category,'kind',l.kind,
            'amount',l.amount::text,'currency',l.currency,'quantity',l.quantity::text,'unit',l.unit,'rate',l.rate::text,
            'original_on',l.original_on,'available_at',l.available_at,'source',l.source-'evidence_version','reason',l.reason)
            ORDER BY l.original_on,l.category,l.key),'[]') FROM erp_private.t14_lines l
            WHERE l.version_id=chosen.id AND l.employee_id=p_employee));
       SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'kind',a.kind,'amount',a.amount::text,
           'currency',a.currency,'month',anchor.month,'reason',a.reason,'status',coalesce(a.decision,'pending'),'source_key',l.key)
           ORDER BY a.id DESC),'[]') INTO adjustments
       FROM erp_private.t14_adjustments a JOIN erp_private.t14_lines l ON l.id=a.original_line_id
       WHERE a.run_id=anchor.id AND a.employee_id=p_employee;
       SELECT coalesce(jsonb_agg(jsonb_build_object('document',d.id,'version',d.current_version_id,'file',d.file,'label',d.label)
          ORDER BY d.id DESC),'[]') INTO evidence
       FROM (
         SELECT doc.id,doc.current_version_id,f.id AS file,doc.document_no||' · '||doc.title AS label
         FROM public.dms_documents doc JOIN public.dms_document_types t ON t.id=doc.document_type_id AND t.type_code='T14_PAYROLL_ADJUSTMENT'
         JOIN LATERAL (SELECT o.id FROM public.dms_document_files o WHERE o.document_id=doc.id AND o.version_id=doc.current_version_id
            AND o.file_role='original' AND o.deleted_at IS NULL AND o.integrity_status='verified' ORDER BY o.id LIMIT 1) f ON true
         WHERE doc.owning_company_id=p_company AND doc.owning_branch_id=p_branch AND doc.deleted_at IS NULL
           AND NOT EXISTS(SELECT 1 FROM erp_private.t14_adjustments a WHERE a.file_id=f.id)
           AND erp_private.t14_adjustment_original(p_company,p_branch,doc.id,doc.current_version_id,f.id)
         ORDER BY doc.id DESC LIMIT 100
       ) d;
     END IF;
   END IF;
 END IF;
 RETURN jsonb_build_object('can_calculate',can_run,'can_policy',can_policy,'run',anchor.id,'version',version_record,
    'versions',copies,'employees',employees,'detail',detail,'rules',rules,'groups',groups,'adjustments',adjustments,
    'evidence',evidence,'next_before',cursor_id);
END $$;

REVOKE ALL ON FUNCTION public.t14_payroll_command(uuid,bigint,bigint,text,jsonb),public.t14_payroll_scopes(),
 public.t14_payroll_workspace(bigint,bigint,date,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t14_payroll_command(uuid,bigint,bigint,text,jsonb),public.t14_payroll_scopes(),
 public.t14_payroll_workspace(bigint,bigint,date,uuid,bigint,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';

COMMIT;
