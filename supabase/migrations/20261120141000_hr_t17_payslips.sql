
BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('hr.payroll.payslip.view','Read and retrieve scoped original payslips','hr','payroll_payslip_view','held'),
 ('hr.payroll.payslip.issue','Issue a payslip for an exact reconciled payroll result','hr','payroll_payslip_issue','held'),
 ('hr.payroll.payslip.deliver','Route, reprint and resend the original scoped payslip','hr','payroll_payslip_deliver','held');

CREATE TABLE erp_private.t17_slips (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 batch_id uuid NOT NULL,
 version_id uuid NOT NULL,
 employee_id bigint NOT NULL,
 company_id bigint NOT NULL REFERENCES public.owner_companies,
 branch_id bigint NOT NULL REFERENCES public.branches,
 review_id uuid NOT NULL REFERENCES erp_private.t15_reviews,
 approval_digest text NOT NULL CHECK(approval_digest~'^[0-9a-f]{64}$'),
 month date NOT NULL CHECK(isfinite(month) AND extract(day FROM month)=1),
 employee_code text NOT NULL CHECK(length(btrim(employee_code)) BETWEEN 1 AND 100),
 renderer_version text NOT NULL DEFAULT 't17-payslip-v1' CHECK(renderer_version~'^[a-zA-Z0-9._-]{1,60}$'),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 storage_path text NOT NULL UNIQUE CHECK(storage_path~'^hr/payslips/[0-9]+/[0-9]+/[a-f0-9-]{36}\.pdf$'),
 file_name text NOT NULL CHECK(file_name~'^Payslip-[0-9]{4}-[0-9]{2}-[0-9]+\.pdf$'),
 issued_by bigint NOT NULL REFERENCES public.user_profiles,
 prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(batch_id,version_id) REFERENCES erp_private.t16_batches(id,version_id),
 FOREIGN KEY(batch_id,employee_id) REFERENCES erp_private.t16_batch_results(batch_id,employee_id),
 FOREIGN KEY(version_id,employee_id) REFERENCES erp_private.t14_results(version_id,employee_id),
 UNIQUE(version_id,employee_id),
 UNIQUE(batch_id,employee_id)
);
CREATE INDEX t17_payslip_history ON erp_private.t17_slips(company_id,branch_id,month,employee_id);
CREATE INDEX t17_payslip_employee_code ON erp_private.t17_slips(company_id,branch_id,month,lower(employee_code));
CREATE TABLE erp_private.t17_staged_artifacts (
 slip_id bigint PRIMARY KEY REFERENCES erp_private.t17_slips,
 storage_object_id uuid NOT NULL,
 storage_version text NOT NULL CHECK(length(storage_version)>0),
 storage_updated_at timestamptz NOT NULL,
 checksum text NOT NULL CHECK(checksum~'^[0-9a-f]{64}$'),
 size_bytes int NOT NULL CHECK(size_bytes BETWEEN 100 AND 2800000),
 renderer_version text NOT NULL CHECK(renderer_version~'^[a-zA-Z0-9._-]{1,60}$'),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE erp_private.t17_artifacts (
 slip_id bigint PRIMARY KEY REFERENCES erp_private.t17_slips,
 storage_object_id uuid NOT NULL,
 storage_version text NOT NULL CHECK(length(storage_version)>0),
 storage_updated_at timestamptz NOT NULL,
 checksum text NOT NULL CHECK(checksum~'^[0-9a-f]{64}$'),
 size_bytes int NOT NULL CHECK(size_bytes BETWEEN 100 AND 2800000),
 renderer_version text NOT NULL CHECK(renderer_version~'^[a-zA-Z0-9._-]{1,60}$'),
 finalized_by bigint NOT NULL REFERENCES public.user_profiles,
 finalized_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE erp_private.t17_file_access (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 slip_id bigint NOT NULL REFERENCES erp_private.t17_slips,
 actor_id bigint NOT NULL REFERENCES public.user_profiles,
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX t17_file_access_slip ON erp_private.t17_file_access(slip_id,id);

DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['t17_slips','t17_staged_artifacts','t17_artifacts','t17_file_access'] LOOP
   EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',table_name);
   EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON erp_private.%I
    FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history()',table_name||'_retain',table_name);
 END LOOP;
END $$;

CREATE FUNCTION erp_private.t17_can(p_company bigint,p_branch bigint,p_mode text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 RETURN p_company IS NOT NULL AND p_branch IS NOT NULL AND coalesce(p_mode IN('view','issue','deliver'),false)
    AND erp_private.t02_has_scope('hr.payroll.view',p_company,p_branch)
    AND erp_private.t02_has_scope('hr.payroll.payslip.view',p_company,p_branch)
    AND (p_mode='view' OR erp_private.t02_has_scope('hr.payroll.payslip.'||p_mode,p_company,p_branch));
END $$;

CREATE FUNCTION erp_private.t17_eligible(p_batch uuid,p_employee bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t16_batches b JOIN erp_private.t15_reviews h
     ON h.id=b.review_id AND h.version_id=b.version_id AND h.digest=b.digest AND h.state='approved'
       AND h.replacement_requested_by IS NULL
   JOIN erp_private.t16_batch_results m ON m.batch_id=b.id AND m.version_id=b.version_id AND m.employee_id=p_employee
   JOIN erp_private.t14_results r ON r.version_id=m.version_id AND r.employee_id=m.employee_id AND r.state='ready'
   WHERE b.id=p_batch AND erp_private.t16_channel_ready(b.id,p_employee)
     AND erp_private.t16_result_status(b.id,p_employee)->>'status'='reconciled'
 );
$$;

CREATE FUNCTION erp_private.t17_assert_eligible(p_batch uuid,p_employee bigint)
RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF NOT erp_private.t17_eligible(p_batch,p_employee) THEN
   RAISE EXCEPTION 'Verify complete employee payment and resolve payroll allocations before issuing or delivering a payslip'
     USING ERRCODE='PT409';
 END IF;
END $$;

CREATE FUNCTION erp_private.t17_assert_issuer(p_company bigint,p_branch bigint,p_employee bigint)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();
BEGIN
 IF actor IS NULL OR NOT erp_private.t17_can(p_company,p_branch,'issue') OR erp_private.t12_is_subject(actor,p_employee) THEN
   RAISE EXCEPTION 'Payslip issuance is unavailable in this payroll scope' USING ERRCODE='42501';
 END IF;
 RETURN actor;
END $$;

-- The retained T09 version is matched by exact approved employee, branch,
-- original date, currency and signed amount. Only route labels and vehicle type
-- belong on the payslip, never customer evidence or any bank identifiers.
CREATE FUNCTION erp_private.t17_trip_lines(p_version uuid,p_company bigint,p_branch bigint,p_employee bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('day',l.original_on,
     'reference',o.order_no||' / Leg '||leg.sequence,
     'direction',origin.site_name||' to '||destination.site_name,
     'truck_type',coalesce(v.basis->>'truck_type',v.basis#>>'{source,truck_type}',prior.basis->>'truck_type'),
     'amount',v.amount::numeric(20,2)::text) ORDER BY l.original_on,o.order_no,leg.sequence,l.id),'[]'::jsonb)
 FROM erp_private.t14_lines l
 JOIN erp_private.t09_allowance_versions v ON v.id=(l.source->>'version')::bigint
   AND v.work_day=l.original_on AND v.employee_id=l.employee_id AND v.employer_id=p_company
   AND v.employer_branch_id=p_branch AND v.currency=l.currency
   AND v.amount=CASE l.kind WHEN 'earning' THEN l.amount ELSE -l.amount END
   AND (l.category='trip-allowance')=(v.kind='base')
 LEFT JOIN erp_private.t09_allowance_versions prior ON prior.id=v.prior_version_id
 JOIN erp_private.fleet_trip_leg_actuals actual ON actual.id=v.actual_id AND actual.load='loaded'
 JOIN erp_private.fleet_trip_legs leg ON leg.id=actual.leg_id
 JOIN erp_private.fleet_operation_orders o ON o.id=leg.order_id
 JOIN public.work_sites origin ON origin.id=actual.origin
 JOIN public.work_sites destination ON destination.id=actual.destination
 WHERE l.version_id=p_version AND l.employee_id=p_employee AND l.category IN('trip-allowance','trip-allowance-adjustment');
$$;

CREATE FUNCTION erp_private.t17_payslip_facts(p_batch erp_private.t16_batches,p_employee bigint,p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
 employee erp_private.t14_results; company_title text; branch_title text;
 component_rows jsonb; late_rows jsonb; trips jsonb; trip_lines bigint; trip_total numeric; selected_total numeric;
 lines_gross numeric; lines_deductions numeric;
BEGIN
 SELECT * INTO STRICT employee FROM erp_private.t14_results WHERE version_id=p_batch.version_id AND employee_id=p_employee;
 SELECT company.legal_name_en,branch.branch_name_en INTO STRICT company_title,branch_title
 FROM public.owner_companies company JOIN public.branches branch ON branch.owner_company_id=company.id
 WHERE company.id=p_batch.company_id AND branch.id=p_batch.branch_id;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('category',x.category,'kind',x.kind,
    'amount',x.amount::text,'label',x.label))
     ORDER BY x.kind,x.category,x.component,x.label),'[]'::jsonb),
   coalesce(sum(x.amount) FILTER(WHERE x.kind='earning'),0),coalesce(sum(x.amount) FILTER(WHERE x.kind='deduction'),0)
 INTO component_rows,lines_gross,lines_deductions FROM (
   SELECT l.kind,l.category,l.source->>'type_id' AS component,
      CASE WHEN l.category IN('basic','salary-component','salary-deduction') AND l.source->>'type_id' IS NOT NULL
        THEN l.reason END AS label,sum(l.amount)::numeric(20,2) AS amount
   FROM erp_private.t14_lines l WHERE l.version_id=p_batch.version_id AND l.employee_id=p_employee
   GROUP BY 1,2,3,4
 ) x;
 IF ROW(lines_gross,lines_deductions) IS DISTINCT FROM ROW(employee.gross,employee.deductions)
    OR nullif(btrim(company_title),'') IS NULL OR nullif(btrim(branch_title),'') IS NULL THEN
   RAISE EXCEPTION 'Approved payslip totals or the legal employer identity require reconciliation' USING ERRCODE='PT409';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('month',x.work_month,'hours',x.hours::text,'amount',x.amount::text)
       ORDER BY x.work_month),'[]'::jsonb) INTO late_rows
 FROM (
   SELECT date_trunc('month',l.original_on::timestamp)::date AS work_month,
      round(sum(CASE l.kind WHEN 'earning' THEN l.quantity ELSE -l.quantity END),4) AS hours,
      sum(CASE l.kind WHEN 'earning' THEN l.amount ELSE -l.amount END)::numeric(20,2) AS amount
   FROM erp_private.t14_lines l
   WHERE l.version_id=p_batch.version_id AND l.employee_id=p_employee AND l.original_on<p_batch.month
     AND l.category IN('fleet-overtime','workshop-overtime','internal-overtime','overtime','workshop-correction')
     AND l.unit='hour' GROUP BY 1
 ) x;
 SELECT count(*),coalesce(sum(CASE l.kind WHEN 'earning' THEN l.amount ELSE -l.amount END),0)
 INTO trip_lines,trip_total FROM erp_private.t14_lines l
 WHERE l.version_id=p_batch.version_id AND l.employee_id=p_employee AND l.category IN('trip-allowance','trip-allowance-adjustment');
 trips:=erp_private.t17_trip_lines(p_batch.version_id,p_batch.company_id,p_batch.branch_id,p_employee);
 SELECT coalesce(sum((x->>'amount')::numeric),0) INTO selected_total FROM jsonb_array_elements(trips) x;
 IF trip_lines<>jsonb_array_length(trips) OR selected_total<>trip_total
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(trips) x WHERE nullif(btrim(x->>'truck_type'),'') IS NULL) THEN
   RAISE EXCEPTION 'The approved trip allowance detail does not reconcile to the payslip' USING ERRCODE='PT409';
 END IF;
 RETURN jsonb_build_object('company',company_title,'branch',branch_title,'employee',employee.employee_name,
   'employee_code',p_code,'month',p_batch.month,'currency',employee.currency,'gross',employee.gross::text,
   'deductions',employee.deductions::text,'net',employee.net::text,'trip_total',trip_total::numeric(20,2)::text,
   'components',component_rows,'late_overtime',late_rows,'trips',trips);
END $$;

CREATE FUNCTION erp_private.t17_original_present(p_slip bigint)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM erp_private.t17_slips s JOIN erp_private.t17_artifacts a ON a.slip_id=s.id
 JOIN storage.objects o ON o.bucket_id='erp-generated-pdfs' AND o.name=s.storage_path
   AND ROW(o.id,o.version,o.updated_at)=ROW(a.storage_object_id,a.storage_version,a.storage_updated_at)
   AND o.metadata->>'mimetype'='application/pdf' AND (o.metadata->>'size')::bigint=a.size_bytes
 WHERE s.id=p_slip FOR SHARE OF o;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.t17_issue_prepare(p_operation uuid,p_batch uuid,p_employee bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 batch erp_private.t16_batches; slip erp_private.t17_slips; actor bigint; code text; facts jsonb; id_out bigint;
 prior jsonb; hash text; finalized boolean; stage erp_private.t17_staged_artifacts; effective_date date:=(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
 IF p_operation IS NULL OR p_batch IS NULL OR p_employee IS NULL OR p_employee<=0 THEN
   RAISE EXCEPTION 'Choose one exact employee payroll result' USING ERRCODE='22023';
 END IF;
 SELECT * INTO batch FROM erp_private.t16_batches WHERE id=p_batch;
 actor:=erp_private.t17_assert_issuer(batch.company_id,batch.branch_id,p_employee);
 batch:=erp_private.t16_lock_batch(batch.id,batch.company_id,batch.branch_id);
 PERFORM erp_private.t16_touch_batch(batch.id);
 PERFORM erp_private.t17_assert_issuer(batch.company_id,batch.branch_id,p_employee);
 hash:=erp_private.t02_digest(jsonb_build_array(p_batch,p_employee));
 prior:=erp_private.t02_replay('t17-issue',p_operation,hash);
 SELECT * INTO slip FROM erp_private.t17_slips WHERE batch_id=p_batch AND employee_id=p_employee;
 finalized:=EXISTS(SELECT 1 FROM erp_private.t17_artifacts a WHERE a.slip_id=slip.id);
 IF finalized AND NOT erp_private.t17_original_present(slip.id) THEN
   RAISE EXCEPTION 'The issued original requires file reconciliation' USING ERRCODE='PT409';
 ELSIF NOT finalized THEN
   PERFORM erp_private.t17_assert_eligible(batch.id,p_employee);
 END IF;
 IF slip.id IS NULL THEN
   SELECT e.employee_code INTO code FROM public.employees e WHERE e.id=p_employee FOR SHARE;
   IF nullif(btrim(code),'') IS NULL THEN RAISE EXCEPTION 'Employee code is required on the original payslip' USING ERRCODE='PT409'; END IF;
   id_out:=nextval(pg_get_serial_sequence('erp_private.t17_slips','id')::regclass);
   facts:=erp_private.t17_payslip_facts(batch,p_employee,code);
   INSERT INTO erp_private.t17_slips(id,batch_id,version_id,employee_id,company_id,branch_id,review_id,approval_digest,
     month,employee_code,snapshot,storage_path,file_name,issued_by) OVERRIDING SYSTEM VALUE
   VALUES(id_out,batch.id,batch.version_id,p_employee,batch.company_id,batch.branch_id,batch.review_id,batch.digest,
     batch.month,code,facts||jsonb_build_object('sequence',id_out,'report_on',effective_date),
     'hr/payslips/'||batch.company_id||'/'||batch.branch_id||'/'||gen_random_uuid()||'.pdf',
     'Payslip-'||to_char(batch.month,'YYYY-MM')||'-'||id_out||'.pdf',actor) RETURNING * INTO slip;
 END IF;
 PERFORM erp_private.t17_assert_issuer(batch.company_id,batch.branch_id,p_employee);
 IF prior IS NULL THEN
   PERFORM erp_private.t02_save_receipt('t17-issue',p_operation,hash,jsonb_build_object('id',slip.id));
 END IF;
 SELECT * INTO stage FROM erp_private.t17_staged_artifacts WHERE slip_id=slip.id;
 RETURN jsonb_build_object('id',slip.id,'finalized',finalized,'renderer',slip.renderer_version,
   'proof',CASE WHEN stage.slip_id IS NOT NULL AND NOT finalized THEN
      jsonb_build_object('checksum',stage.checksum,'size',stage.size_bytes,'object_id',stage.storage_object_id,
        'version',stage.storage_version) END,
   'can_deliver',erp_private.t17_can(batch.company_id,batch.branch_id,'deliver') AND erp_private.t17_eligible(batch.id,p_employee),
   'snapshot',CASE WHEN NOT finalized THEN slip.snapshot END,
   'path',CASE WHEN NOT finalized THEN slip.storage_path END);
END $$;

-- Only the application storage coordinator can attest a read-back. Current
-- scoped user authority and payment eligibility are rechecked at finalization.
CREATE FUNCTION public.t17_attest_original(p_slip bigint,p_object uuid,p_version text,p_updated timestamptz,
 p_checksum text,p_size int,p_renderer text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE stored erp_private.t17_staged_artifacts; object_row storage.objects; path text; required_renderer text;
BEGIN
 IF p_slip IS NULL OR p_object IS NULL OR nullif(btrim(p_version),'') IS NULL OR p_updated IS NULL OR NOT coalesce(p_checksum~'^[0-9a-f]{64}$',false) OR NOT coalesce(p_size BETWEEN 100 AND 2800000,false)
    OR NOT coalesce(p_renderer~'^[a-zA-Z0-9._-]{1,60}$',false) THEN
   RAISE EXCEPTION 'Verified retained original metadata is required' USING ERRCODE='22023';
 END IF;
 SELECT s.storage_path,s.renderer_version INTO path,required_renderer FROM erp_private.t17_slips s WHERE s.id=p_slip FOR UPDATE;
 IF NOT FOUND OR required_renderer<>p_renderer THEN
   RAISE EXCEPTION 'Prepared payslip or its pinned renderer version is unavailable' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO object_row FROM storage.objects o WHERE o.bucket_id='erp-generated-pdfs' AND o.name=path FOR SHARE;
 IF NOT FOUND OR ROW(object_row.id,object_row.version,date_trunc('milliseconds',object_row.updated_at))
   IS DISTINCT FROM ROW(p_object,p_version,p_updated) OR (object_row.metadata->>'size')::bigint IS DISTINCT FROM p_size::bigint
   OR object_row.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf' THEN
   RAISE EXCEPTION 'The verified payslip object changed before attestation' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO stored FROM erp_private.t17_staged_artifacts WHERE slip_id=p_slip;
 IF FOUND THEN
   IF ROW(stored.storage_object_id,stored.storage_version,stored.storage_updated_at,stored.checksum,stored.size_bytes,stored.renderer_version)
     IS DISTINCT FROM ROW(object_row.id,object_row.version,object_row.updated_at,p_checksum,p_size,p_renderer) THEN
     RAISE EXCEPTION 'The prepared original failed reconciliation' USING ERRCODE='PT409';
   END IF;
 ELSE
   INSERT INTO erp_private.t17_staged_artifacts(slip_id,storage_object_id,storage_version,storage_updated_at,checksum,size_bytes,renderer_version)
   VALUES(p_slip,object_row.id,object_row.version,object_row.updated_at,p_checksum,p_size,p_renderer);
 END IF;
END $$;

CREATE FUNCTION public.t17_issue_finalize(p_slip bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 slip erp_private.t17_slips; stage erp_private.t17_staged_artifacts; artifact erp_private.t17_artifacts; object_row storage.objects; actor bigint;
BEGIN
 SELECT * INTO slip FROM erp_private.t17_slips WHERE id=p_slip;
 actor:=erp_private.t17_assert_issuer(slip.company_id,slip.branch_id,slip.employee_id);
 PERFORM erp_private.t16_lock_batch(slip.batch_id,slip.company_id,slip.branch_id);
 PERFORM erp_private.t16_touch_batch(slip.batch_id);
 PERFORM erp_private.t17_assert_issuer(slip.company_id,slip.branch_id,slip.employee_id);
 SELECT * INTO artifact FROM erp_private.t17_artifacts WHERE slip_id=p_slip;
 IF NOT FOUND THEN
   PERFORM erp_private.t17_assert_eligible(slip.batch_id,slip.employee_id);
   SELECT * INTO stage FROM erp_private.t17_staged_artifacts WHERE slip_id=p_slip;
   IF NOT FOUND THEN RAISE EXCEPTION 'Read back and verify the retained payslip PDF first' USING ERRCODE='PT409'; END IF;
   SELECT * INTO object_row FROM storage.objects o WHERE o.bucket_id='erp-generated-pdfs'
    AND o.name=slip.storage_path FOR SHARE;
   IF NOT FOUND OR ROW(object_row.id,object_row.version,object_row.updated_at)
     IS DISTINCT FROM ROW(stage.storage_object_id,stage.storage_version,stage.storage_updated_at)
     OR (object_row.metadata->>'size')::bigint IS DISTINCT FROM stage.size_bytes::bigint
     OR object_row.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf' THEN
     RAISE EXCEPTION 'The verified payslip object changed before finalization' USING ERRCODE='PT409';
   END IF;
   INSERT INTO erp_private.t17_artifacts(slip_id,storage_object_id,storage_version,storage_updated_at,
       checksum,size_bytes,renderer_version,finalized_by)
   VALUES(p_slip,stage.storage_object_id,stage.storage_version,stage.storage_updated_at,
     stage.checksum,stage.size_bytes,stage.renderer_version,actor) RETURNING * INTO artifact;
 ELSIF NOT erp_private.t17_original_present(slip.id) THEN
   RAISE EXCEPTION 'The issued original requires file reconciliation' USING ERRCODE='PT409';
 END IF;
 PERFORM erp_private.t17_assert_issuer(slip.company_id,slip.branch_id,slip.employee_id);
 RETURN jsonb_build_object('id',artifact.slip_id,'checksum',artifact.checksum,
   'can_deliver',erp_private.t17_can(slip.company_id,slip.branch_id,'deliver') AND erp_private.t17_eligible(slip.batch_id,slip.employee_id));
END $$;

CREATE FUNCTION public.t17_file_manifest(p_slip bigint,p_record_access boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE slip erp_private.t17_slips; artifact erp_private.t17_artifacts;
BEGIN
 SELECT * INTO slip FROM erp_private.t17_slips WHERE id=p_slip;
 IF NOT erp_private.t17_can(slip.company_id,slip.branch_id,'view') THEN
   RAISE EXCEPTION 'Payslip unavailable in this scope' USING ERRCODE='42501';
 END IF;
 SELECT * INTO artifact FROM erp_private.t17_artifacts WHERE slip_id=p_slip;
 IF NOT FOUND OR NOT erp_private.t17_original_present(slip.id) THEN
   RAISE EXCEPTION 'Original payslip unavailable' USING ERRCODE='42501';
 END IF;
 IF p_record_access IS TRUE THEN
   INSERT INTO erp_private.t17_file_access(slip_id,actor_id) VALUES(p_slip,public.current_user_profile_id());
 END IF;
 RETURN jsonb_build_object('path',slip.storage_path,'filename',slip.file_name,'checksum',artifact.checksum,'size',artifact.size_bytes,'object_id',artifact.storage_object_id);
END $$;

REVOKE ALL ON FUNCTION erp_private.t17_can(bigint,bigint,text),erp_private.t17_eligible(uuid,bigint),
 erp_private.t17_assert_eligible(uuid,bigint),erp_private.t17_original_present(bigint),erp_private.t17_assert_issuer(bigint,bigint,bigint),
 erp_private.t17_trip_lines(uuid,bigint,bigint,bigint),erp_private.t17_payslip_facts(erp_private.t16_batches,bigint,text),
 public.t17_issue_prepare(uuid,uuid,bigint),public.t17_issue_finalize(bigint),
 public.t17_attest_original(bigint,uuid,text,timestamptz,text,int,text),public.t17_file_manifest(bigint,boolean)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t17_issue_prepare(uuid,uuid,bigint),public.t17_issue_finalize(bigint),
 public.t17_file_manifest(bigint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.t17_attest_original(bigint,uuid,text,timestamptz,text,int,text) TO service_role;
COMMIT;
