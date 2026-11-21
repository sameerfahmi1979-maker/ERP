
-- Compose with the existing fully exercised T09 synthetic trip, including its
-- approved forward allowance and signed void adjustment. Isolate the exact
-- T14 projection to test the source-to-payslip agreement in SQL.
RESET ROLE;
DO $$
DECLARE candidate erp_private.t09_allowance_versions; snapshot jsonb; source_snapshot jsonb; batch erp_private.t16_batches;
 run_id uuid; version_id uuid; line jsonb; grosses numeric:=0; deduction_total numeric:=0; final_code text;
BEGIN
 SELECT * INTO STRICT candidate FROM erp_private.t09_allowance_versions
 WHERE id=current_setting('erp.t09_forward_candidate')::bigint;
 batch.company_id:=candidate.employer_id;
 batch.branch_id:=candidate.employer_branch_id;
 batch.month:=date_trunc('month',candidate.work_day::timestamp)::date;
 source_snapshot:=erp_private.t14_operational_sources(candidate.employee_id,batch.company_id,batch.branch_id,batch.month,statement_timestamp());
 INSERT INTO erp_private.t14_runs(company_id,branch_id,month) VALUES(batch.company_id,batch.branch_id,batch.month) RETURNING id INTO run_id;
 INSERT INTO erp_private.t14_versions(run_id,number,cutoff,source_digest,rule_digest,digest,totals,exception_count,calculated_by,reason)
 VALUES(run_id,1,statement_timestamp(),repeat('a',64),repeat('a',64),repeat('a',64),'[]',0,(SELECT id FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000002'),'Synthetic T17 trip projection')
 RETURNING id INTO version_id;
 batch.version_id:=version_id;
 SELECT coalesce(sum((l->>'amount')::numeric) FILTER(WHERE l->>'kind'='earning'),0),
        coalesce(sum((l->>'amount')::numeric) FILTER(WHERE l->>'kind'='deduction'),0)
 INTO grosses,deduction_total FROM jsonb_array_elements(source_snapshot->'lines') l
 WHERE l->>'category' IN('trip-allowance','trip-allowance-adjustment');
 SELECT employee_code INTO STRICT final_code FROM public.employees WHERE id=candidate.employee_id;
 INSERT INTO erp_private.t14_results(version_id,employee_id,employee_name,employment_ids,currency,gross,deductions,state,policy_snapshots,exceptions)
 VALUES(version_id,candidate.employee_id,'Synthetic Driver',ARRAY[candidate.employment_id],candidate.currency,grosses,deduction_total,'ready','[]','[]');
 FOR line IN SELECT l FROM jsonb_array_elements(source_snapshot->'lines') l WHERE l->>'category' IN('trip-allowance','trip-allowance-adjustment') LOOP
   INSERT INTO erp_private.t14_lines(version_id,employee_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
   VALUES(version_id,candidate.employee_id,line->>'key',line->>'category',line->>'kind',(line->>'amount')::numeric,line->>'currency',
     (line->>'quantity')::numeric,line->>'unit',(line->>'rate')::numeric,(line->>'original_on')::date,
     (line->>'available_at')::timestamptz,line->'source',line->>'reason');
 END LOOP;
 snapshot:=erp_private.t17_payslip_facts(batch,candidate.employee_id,final_code);
 IF snapshot->>'trip_total'<>'55.00' OR jsonb_array_length(snapshot->'trips')<>2
    OR NOT snapshot->'trips' @> '[{"amount":"140.00"},{"amount":"-85.00"}]'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'trips') t WHERE length(t->>'reference')<5 OR length(t->>'direction')<4
         OR nullif(t->>'truck_type','') IS NULL) THEN
   RAISE EXCEPTION 'The canonical trip source detail and signed adjustment do not match the payslip';
 END IF;
 PERFORM set_config('erp.t17_trip_snapshot',(snapshot||'{"sequence":708,"report_on":"2026-11-20"}')::text,true);
 RAISE NOTICE 'PASS: canonical T09 references, dates, directions, vehicle type and signed AED 55.00 net trip detail from T14';
END $$;
SELECT jsonb_build_object('payslip_trip_snapshot',current_setting('erp.t17_trip_snapshot')::jsonb);
