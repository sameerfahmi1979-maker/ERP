
-- The primary witness follows the guarded T07, T08 and T14 monthly fixtures.
RESET ROLE;
DO $$
DECLARE
 v erp_private.t14_versions;
 prior_version uuid;
 again_version uuid;
 first_review uuid:=gen_random_uuid();
 replacement_review uuid:=gen_random_uuid();
 captured integer;
 copied integer;
 case_no bigint;
 line_time erp_private.t14_lines;
 line_recovery erp_private.t14_lines;
 replacement erp_private.t14_lines;
 record_count bigint;
 pin_id bigint;
 receipt_id bigint;
 allocation_id bigint;
 due_amount numeric:=20;
 reviewer bigint;
 approval_facts jsonb;
BEGIN
 IF current_setting('cron.launch_active_jobs')<>'off'
    OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
       IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
   RAISE EXCEPTION 'Run T15 claim checks only in the isolated database';
 END IF;
 IF to_regprocedure('erp_private.t15_reserve_approval(uuid,uuid)') IS NULL THEN
   RAISE EXCEPTION 'T15 has no shared approval reservation gate';
 END IF;
 IF has_function_privilege('authenticated','erp_private.t15_reserve_approval(uuid,uuid)','execute')
    OR has_function_privilege('service_role','erp_private.t15_release_approval(uuid,uuid,text)','execute')
    OR has_table_privilege('authenticated','erp_private.t15_reserved_lines','select') THEN
   RAISE EXCEPTION 'An ordinary role can use or read the private approval ledger';
 END IF;
 SELECT ver.* INTO v FROM erp_private.t14_versions ver
 JOIN erp_private.t14_runs run ON run.id=ver.run_id AND run.month='2026-11-01'
 WHERE ver.number=2;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT id INTO STRICT reviewer FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000003';
 prior_version:=v.id;
 SELECT * INTO STRICT line_time FROM erp_private.t14_lines WHERE version_id=v.id
   AND category='fleet-overtime' AND original_on='2026-10-03' AND employee_id=980001;
 SELECT * INTO STRICT line_recovery FROM erp_private.t14_lines WHERE version_id=v.id AND category='recovery' AND employee_id=980001;
 case_no:=(line_recovery.source->>'case')::bigint;
 SELECT count(*) INTO record_count FROM erp_private.t08_payable_claims;
 captured:=erp_private.t15_reserve_approval(first_review,v.id);
 IF captured<>(SELECT count(*) FROM erp_private.t14_lines WHERE version_id=v.id AND amount>0) OR captured<4
    OR captured<>erp_private.t15_reserve_approval(first_review,v.id)
    OR (SELECT count(*) FROM erp_private.t08_payable_claims)<>record_count
    OR EXISTS(SELECT 1 FROM erp_private.t13_payroll_pins WHERE case_id=case_no)
    OR EXISTS(SELECT 1 FROM erp_private.t13_receipts WHERE case_id=case_no) THEN
   RAISE EXCEPTION 'Approval failed to reserve exact lines once, or it posted actual payroll activity';
 END IF;
 PERFORM erp_private.t15_assert_reservations(first_review,v.id);
 BEGIN
   PERFORM erp_private.t15_reserve_approval(gen_random_uuid(),v.id);
   RAISE EXCEPTION 'A second approval reused one active payroll run'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
   PERFORM erp_private.t15_assert_employment_available((line_time.source->>'employment')::bigint,'2026-11-01');
   RAISE EXCEPTION 'Final settlement could claim regular employment already held by payroll'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 IF NOT erp_private.t15_other_approval(gen_random_uuid(),line_time.employee_id,to_jsonb(line_time)) OR
    erp_private.t15_other_approval(v.run_id,line_time.employee_id,to_jsonb(line_time)) THEN
   RAISE EXCEPTION 'Draft visibility of the approved interval is wrong';
 END IF;
 BEGIN
   PERFORM erp_private.t08_claim_work((line_time.source->>'candidate')::bigint,(line_time.source->>'alias')::bigint,
                                     gen_random_uuid(),(line_time.source->>'interval')::tstzmultirange);
   RAISE EXCEPTION 'A legacy or exit consumer took the payroll interval'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
   INSERT INTO erp_private.t08_payable_claims(candidate_id,alias_id,employee_id,consumer_key,claimed,amount,currency)
   VALUES((line_time.source->>'candidate')::bigint,(line_time.source->>'alias')::bigint,line_time.employee_id,
          line_time.id,(line_time.source->>'interval')::tstzmultirange,line_time.amount+0.01,line_time.currency);
   RAISE EXCEPTION 'Same consumer changed the approved amount'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
   UPDATE erp_private.t08_payable_candidates SET digest=repeat('a',64) WHERE id=(line_time.source->>'candidate')::bigint;
   PERFORM erp_private.t15_assert_reservations(first_review,v.id);
   RAISE EXCEPTION 'Preflight accepted altered source evidence'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
   PERFORM erp_private.t13_payroll_pin(case_no,'deduction',(line_recovery.source->>'upstream_id')::bigint,'2026-11-01',
     gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),reviewer,line_recovery.amount,line_recovery.amount,line_recovery.source->>'fingerprint');
   RAISE EXCEPTION 'Another batch pinned the same recovery'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 IF NOT erp_private.t15_recovery_conflict(case_no,'2026-12-01',gen_random_uuid()) THEN
   RAISE EXCEPTION 'A later instalment escaped an unsettled earlier reservation';
 END IF;
 copied:=erp_private.t15_release_approval(first_review,v.id,'Verified unused draft replaced');
 IF copied<>captured THEN RAISE EXCEPTION 'Release omitted one or more exact payroll lines'; END IF;
 copied:=erp_private.t15_release_approval(first_review,v.id,'Verified unused draft replaced');
 IF copied<>captured
    OR NOT EXISTS(SELECT 1 FROM erp_private.t15_claim_reservations WHERE review_id=first_review AND released_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines WHERE review_id=first_review AND released_at IS NULL)
    OR erp_private.t15_other_approval(gen_random_uuid(),line_time.employee_id,to_jsonb(line_time)) THEN
   RAISE EXCEPTION 'Unused payroll replacement did not retain and release exact reservations once';
 END IF;

 INSERT INTO erp_private.t14_versions(run_id,number,cutoff,source_digest,rule_digest,digest,totals,exception_count,calculated_by,reason)
 VALUES(v.run_id,4,v.cutoff,v.source_digest,v.rule_digest,v.digest,v.totals,v.exception_count,v.calculated_by,'Synthetic replacement')
 RETURNING id INTO again_version;
 INSERT INTO erp_private.t14_results(version_id,employee_id,employee_name,employment_ids,currency,gross,deductions,state,policy_snapshots,exceptions)
 SELECT again_version,r.employee_id,r.employee_name,r.employment_ids,r.currency,r.gross,r.deductions,r.state,r.policy_snapshots,r.exceptions
 FROM erp_private.t14_results r WHERE r.version_id=prior_version;
 INSERT INTO erp_private.t14_lines(version_id,employee_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
 SELECT again_version,l.employee_id,l.key,l.category,l.kind,l.amount,l.currency,l.quantity,l.unit,l.rate,l.original_on,l.available_at,l.source,l.reason
 FROM erp_private.t14_lines l WHERE l.version_id=prior_version;
 copied:=erp_private.t15_reserve_approval(replacement_review,again_version);
 IF copied<>captured THEN RAISE EXCEPTION 'Replacement lost approved source references'; END IF;
 PERFORM erp_private.t15_assert_reservations(replacement_review,again_version);
 SELECT * INTO STRICT replacement FROM erp_private.t14_lines WHERE version_id=again_version AND key=line_recovery.key;
 approval_facts:=replacement.source;
 BEGIN
   PERFORM erp_private.t13_payroll_pin(case_no,'deduction',(approval_facts->>'upstream_id')::bigint,'2026-11-01',
     again_version,replacement.id,first_review,reviewer,replacement.amount,replacement.amount,approval_facts->>'fingerprint');
   RAISE EXCEPTION 'Retired approval used for the replacement recovery'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 pin_id:=erp_private.t13_payroll_pin(case_no,'deduction',(approval_facts->>'upstream_id')::bigint,'2026-11-01',
    again_version,replacement.id,replacement_review,reviewer,replacement.amount,replacement.amount,approval_facts->>'fingerprint');
 IF erp_private.t15_recovery_closed(replacement.id) THEN RAISE EXCEPTION 'A pin alone marks the recovery paid'; END IF;
 BEGIN
   PERFORM erp_private.t15_release_approval(replacement_review,again_version,'Attempt to bypass an existing pin');
   RAISE EXCEPTION 'Materialized claim was made available again'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 -- Exercise two possible owner-module receipts in protected rollback-only
 -- fixtures. Approval itself never calls the canonical receipt functions.
 BEGIN
   PERFORM erp_private.t13_payroll_receipt(gen_random_uuid(),pin_id,'2026-11-01',again_version,replacement.id,replacement_review,
     (approval_facts->>'schedule')::bigint,0,replacement.currency,NULL,gen_random_uuid(),true);
   IF NOT erp_private.t15_recovery_closed(replacement.id) OR erp_private.t15_recovery_conflict(case_no,'2026-12-01',gen_random_uuid()) THEN
     RAISE EXCEPTION 'An independently verified final zero recovery should open later months';
   END IF;
   RAISE EXCEPTION 'Rollback alternate zero-cash witness' USING ERRCODE='P0002';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;
 receipt_id:=erp_private.t13_payroll_receipt(gen_random_uuid(),pin_id,'2026-11-01',again_version,replacement.id,replacement_review,
     (approval_facts->>'schedule')::bigint,due_amount,replacement.currency,'native-t15-cash',gen_random_uuid(),true);
 IF NOT erp_private.t15_recovery_conflict(case_no,'2026-12-01',gen_random_uuid()) THEN
   RAISE EXCEPTION 'Final cash without an allocation freed the next deduction';
 END IF;
 INSERT INTO erp_private.t13_allocations(case_id,pin_id,receipt_id,amount,authorized_by,reason)
 VALUES(case_no,pin_id,receipt_id,due_amount,reviewer,'Synthetic exact verified recovery') RETURNING id INTO allocation_id;
 IF NOT erp_private.t15_recovery_closed(replacement.id)
    OR erp_private.t15_recovery_conflict(case_no,'2026-12-01',gen_random_uuid())
    OR NOT erp_private.t15_recovery_conflict(case_no,'2026-11-01',gen_random_uuid()) THEN
   RAISE EXCEPTION 'Completed partial cash failed to open only later instalments';
 END IF;
 INSERT INTO erp_private.t13_allocations(case_id,pin_id,receipt_id,amount,reverses_allocation_id,authorized_by,reason)
 VALUES(case_no,pin_id,receipt_id,1,allocation_id,reviewer,'Synthetic linked AED 1 reversal');
 IF erp_private.t15_recovery_closed(replacement.id) OR NOT erp_private.t15_recovery_conflict(case_no,'2026-12-01',gen_random_uuid()) THEN
   RAISE EXCEPTION 'Reversed cash was treated as fully allocated';
 END IF;
 RAISE NOTICE 'T15 shared monthly, exit, historical release, exact recovery and settlement reservations passed';
END;
$$;

-- The two separate operational witnesses reuse the official source-owner
-- scenarios. The synthetic draft envelope is internal to this test.
DO $$
DECLARE
 what text;
 worker bigint;
 company bigint:=920001;
 branch bigint:=920011;
 payroll_month date:='2026-11-01';
 reviewed_trip erp_private.t09_allowance_versions;
 cutoff timestamptz:=clock_timestamp();
 picked jsonb;
 payload jsonb;
 snapshot_lines jsonb:='[]';
 employer_record bigint;
 run_id uuid;
 ver_id uuid;
 review_id uuid:=gen_random_uuid();
 line_item erp_private.t14_lines;
 actor bigint;
 converted bigint;
 old_table_count bigint;
 claim_kind text;
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.t14_versions) THEN RETURN; END IF;
 SELECT id INTO STRICT actor FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000002';
 IF nullif(current_setting('erp.t09_forward_candidate',true),'') IS NOT NULL THEN
   SELECT * INTO STRICT reviewed_trip FROM erp_private.t09_allowance_versions
     WHERE id=current_setting('erp.t09_forward_candidate')::bigint;
   worker:=reviewed_trip.employee_id;
   payroll_month:=date_trunc('month',reviewed_trip.work_day::timestamp)::date;
   what:='trip';
 ELSIF EXISTS(SELECT 1 FROM erp_private.t12_payroll_corrections) THEN
   worker:=980001;
   what:='workshop';
 ELSE
   RAISE EXCEPTION 'T15 source reservation requires the T09 or T12 fixture';
 END IF;
 payload:=erp_private.t14_operational_sources(worker,company,branch,payroll_month,cutoff);
 SELECT jsonb_agg(item) INTO snapshot_lines FROM jsonb_array_elements(payload->'lines') item
 WHERE (what='trip' AND item->>'category' IN('trip-allowance','trip-allowance-adjustment'))
    OR (what='workshop' AND item->>'category'='workshop-correction');
 IF coalesce(jsonb_array_length(snapshot_lines),0)=0
    OR (what='trip' AND NOT(snapshot_lines@>'[{"category":"trip-allowance"},{"category":"trip-allowance-adjustment"}]'::jsonb)) THEN
   RAISE EXCEPTION 'The T15 % witness did not expose reviewed source lines',what;
 END IF;
 employer_record:=(snapshot_lines->0->'source'->>'employment')::bigint;
 INSERT INTO erp_private.t14_runs(company_id,branch_id,month) VALUES(company,branch,payroll_month) RETURNING id INTO run_id;
 INSERT INTO erp_private.t14_versions(run_id,number,cutoff,source_digest,rule_digest,digest,totals,exception_count,calculated_by,reason)
 VALUES(run_id,1,cutoff,repeat('1',64),repeat('2',64),repeat('3',64),'[]',0,actor,'Synthetic source claim envelope')
 RETURNING id INTO ver_id;
 INSERT INTO erp_private.t14_results(version_id,employee_id,employee_name,employment_ids,currency,gross,deductions,state,policy_snapshots,exceptions)
 VALUES(ver_id,worker,'Synthetic source recipient',ARRAY[employer_record],snapshot_lines->0->>'currency',500,100,'ready','[]','[]');
 FOR picked IN SELECT value FROM jsonb_array_elements(snapshot_lines) LOOP
   INSERT INTO erp_private.t14_lines(version_id,employee_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
   VALUES(ver_id,worker,picked->>'key',picked->>'category',picked->>'kind',(picked->>'amount')::numeric,picked->>'currency',
      (picked->>'quantity')::numeric,picked->>'unit',(picked->>'rate')::numeric,(picked->>'original_on')::date,
      (picked->>'available_at')::timestamptz,picked->'source','Synthetic exact source line');
 END LOOP;
 IF erp_private.t15_reserve_approval(review_id,ver_id)<>jsonb_array_length(snapshot_lines) THEN
   RAISE EXCEPTION 'Review did not reserve every % source',what;
 END IF;
 PERFORM erp_private.t15_assert_reservations(review_id,ver_id);
 FOR line_item IN SELECT * FROM erp_private.t14_lines WHERE version_id=ver_id LOOP
   IF what='trip' THEN
     SELECT count(*) INTO old_table_count FROM erp_private.t09_allowance_claims;
     claim_kind:=CASE WHEN line_item.category='trip-allowance' THEN 'base' ELSE 'adjustment' END;
     BEGIN
       INSERT INTO erp_private.t09_allowance_claims(actual_id,version_id,kind,consumer_key)
       VALUES((line_item.source->>'actual')::bigint,(line_item.source->>'version')::bigint,claim_kind,gen_random_uuid());
       RAISE EXCEPTION 'The reserved allowance was acquired by a competing consumer'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
     END;
     IF (SELECT count(*) FROM erp_private.t09_allowance_claims)<>old_table_count THEN RAISE EXCEPTION 'Reservation posted allowance'; END IF;
     converted:=erp_private.t09_claim_allowance((line_item.source->>'version')::bigint,line_item.id);
     IF NOT EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims WHERE id=converted AND consumer_key=line_item.id) THEN
       RAISE EXCEPTION 'The exact approval could not reach the existing trip claim writer';
     END IF;
   ELSE
     SELECT count(*) INTO old_table_count FROM erp_private.t12_correction_claims;
     BEGIN
       PERFORM erp_private.t12_claim_workshop_correction((line_item.source->>'correction')::bigint,gen_random_uuid());
       RAISE EXCEPTION 'The reserved correction was acquired by a competing consumer'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
     END;
     IF (SELECT count(*) FROM erp_private.t12_correction_claims)<>old_table_count THEN RAISE EXCEPTION 'Reservation posted correction'; END IF;
     converted:=erp_private.t12_claim_workshop_correction((line_item.source->>'correction')::bigint,line_item.id);
     IF NOT EXISTS(SELECT 1 FROM erp_private.t12_correction_claims WHERE id=converted AND consumer_key=line_item.id) THEN
       RAISE EXCEPTION 'The exact approval could not reach the existing Workshop correction writer';
     END IF;
   END IF;
 END LOOP;
 RAISE NOTICE 'T15 % canonical owner claims obey their stable approved reservations',what;
END;
$$;
ROLLBACK;
