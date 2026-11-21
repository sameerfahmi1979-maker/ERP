
DO $$
BEGIN
 IF to_regprocedure('public.t17_payroll_finance_report(bigint,bigint,date)') IS NULL
   OR to_regprocedure('public.t17_payroll_finance_scopes()') IS NULL THEN
   RAISE EXCEPTION 'T17 scoped Finance payroll reconciliation contract is unavailable';
 END IF;
END $$;
-- VERIFIED WORKFLOW
SAVEPOINT t17_finance_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
-- The schema-only fixture omits the baseline report permission records.
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
VALUES ('reports.view','Synthetic View Reports','REPORTS','view','branch'),
 ('reports.run','Synthetic Run Reports','REPORTS','run','branch')
ON CONFLICT (permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t17_finance_all','Synthetic T17 aggregate finance',false),
 ('t17_finance_cap','Synthetic T17 aggregate capability only',false),
 ('t17_finance_report_rights','Synthetic T17 report access without finance',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t17_finance_all',ARRAY['hr.payroll.finance.reconcile','reports.view','reports.run']),
 ('t17_finance_cap',ARRAY['hr.payroll.finance.reconcile']),
 ('t17_finance_report_rights',ARRAY['reports.view','reports.run'])
) g(role,caps) JOIN public.roles r ON r.role_code=g.role
 JOIN public.permissions p ON p.permission_code=ANY(g.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(a.actor),r.id,a.company,a.branch,true
FROM (VALUES (1,'t17_finance_all',920001,NULL),(4,'t17_finance_all',920001,920011),(6,'t17_finance_all',920001,920012),
 (9,'t17_finance_all',920002,920021),(5,'t17_finance_cap',920001,920011),
 (5,'t17_finance_report_rights',920002,920021)
) a(actor,role,company,branch) JOIN public.roles r ON r.role_code=a.role;

DO $$
DECLARE
 report jsonb;
 totals jsonb;
 wps jsonb;
 scope jsonb;
 expired bigint;
 approved_line_count integer;
 approved_version uuid:=current_setting('erp.t16_version')::uuid;
 package uuid:=current_setting('erp.t16_batch')::uuid;
 employee_net numeric;
 approved_net numeric;
 approved_gross numeric;
 approved_deductions numeric;
 approved_recoveries numeric;
 reversal_amount numeric;
 payment uuid;
 corrected_file uuid;
BEGIN
 IF has_function_privilege('anon','public.t17_payroll_finance_report(bigint,bigint,date)','EXECUTE')
   OR has_function_privilege('service_role','public.t17_payroll_finance_report(bigint,bigint,date)','EXECUTE')
   OR has_function_privilege('service_role','public.t17_payroll_finance_scopes()','EXECUTE')
   OR has_table_privilege('authenticated','erp_private.t16_files','SELECT')
   OR EXISTS(SELECT 1 FROM public.permissions WHERE permission_code='hr.payroll.finance.reconcile' AND administrator_scope<>'held')
   OR NOT EXISTS(SELECT 1 FROM public.erp_report_registry WHERE report_code='FIN_PAYROLL_RECONCILIATION'
        AND NOT supports_scheduling AND default_output_formats=ARRAY['screen'])
 THEN RAISE EXCEPTION 'Finance report capability inheritance or output policy is unsafe'; END IF;
 SELECT count(*) INTO approved_line_count FROM erp_private.t14_lines WHERE version_id=approved_version;
 SELECT sum(net),sum(gross),sum(deductions) INTO approved_net,approved_gross,approved_deductions
 FROM erp_private.t14_results WHERE version_id=approved_version;
 SELECT net INTO STRICT employee_net FROM erp_private.t14_results
 WHERE version_id=approved_version AND employee_id=980002;
 SELECT sum(amount) INTO approved_recoveries FROM erp_private.t14_lines
 WHERE version_id=approved_version AND kind='deduction' AND category='recovery';

 -- Model retained file correction history without overwriting the accepted ledger.
 SELECT f.id INTO STRICT corrected_file FROM erp_private.t16_files f WHERE f.batch_id=package;
 INSERT INTO erp_private.t16_files(id,batch_id,establishment_id,format_id,filename,content,row_count,net_total,currency,routing_digest,
   replaces_file_id,correction_evidence_id,correction_evidence_sha256,corrected_by)
 SELECT gen_random_uuid(),batch_id,establishment_id,format_id,'WPS_REPORT_CORRECTED.sif',content||decode('0a','hex'),
 row_count,net_total,currency,routing_digest,id,998610,repeat('a',64),pg_temp.t08_profile(2)
 FROM erp_private.t16_files WHERE id=corrected_file RETURNING id INTO corrected_file;
 INSERT INTO erp_private.t16_batch_events(batch_id,company_id,lane,wps_file_id,kind,reference,actor_id,
  document_id,version_id,file_id,proof_sha256)
 VALUES(package,920001,'wps',corrected_file,'accepted','T17 TEST CORRECTED FILE',pg_temp.t08_profile(2),
 998610,998610,998610,repeat('a',64));

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(4);
 scope:=public.t17_payroll_finance_scopes();
 report:=public.t17_payroll_finance_report(920001,920011,'2026-11-01');
 totals:=report->'totals'->0;
 wps:=report->'files';
 IF jsonb_array_length(scope)<>1 OR (scope->0->>'branch_id')::bigint<>920011
    OR jsonb_array_length(report->'totals')<>1 OR totals->>'currency'<>'AED'
    OR jsonb_typeof(totals->'approved_net')<>'string'
    OR (totals->>'employee_count')::int<>2 OR (totals->>'reconciled_count')::int<>2
    OR (totals->>'approved_gross')::numeric<>approved_gross
    OR (totals->>'approved_deductions')::numeric<>approved_deductions
    OR (totals->>'approved_net')::numeric<>approved_net
    OR (totals->>'verified_cash')::numeric<>approved_net
    OR (totals->>'applied_deductions')::numeric<>approved_deductions
    OR (totals->>'unallocated_cash')::numeric<>0 OR (totals->>'outstanding_cash')::numeric<>0
    OR (totals->>'recovery_approved')::numeric<>approved_recoveries
    OR (totals->>'recovery_applied')::numeric<>approved_recoveries
    OR (totals->>'unexplained_difference')::numeric<>0
    OR (totals->>'wps_current_total')::numeric<>approved_net
    OR (totals->>'wps_accepted_total')::numeric<>approved_net
    OR jsonb_array_length(wps)<>2
    OR NOT wps @> '[{"file_reference":"WPS_REPORT_CORRECTED.sif","state":"accepted","scope":"current"}]'
    OR NOT wps @> '[{"scope":"superseded"}]'
    OR NOT report->'components' @> '[{"category":"fleet-overtime","work_month":"2026-10-01","approved":"30.00"}]'
    OR NOT report->'components' @> '[{"category":"adjustment","approved":"25.00"}]'
    OR report::text ~ 'employee.?code|T16-BANK-998603|AE0703312345678|T16-SHARED|T17 TEST CORRECTED FILE|sha256|document_id|employee_id|employee_name'
 THEN RAISE EXCEPTION 'Masked exact aggregate or correction lineage did not reconcile'; END IF;
 RAISE NOTICE 'Finance fixture reconciled % employee results, % approved lines, % component groups and % WPS files. Gross %, deductions %, net %, cash % AED.',
   totals->>'employee_count',approved_line_count,jsonb_array_length(report->'components'),jsonb_array_length(wps),
   approved_gross,approved_deductions,approved_net,totals->>'verified_cash';
 BEGIN
  PERFORM public.t17_payroll_finance_report(920001,NULL,'2026-11-01');
  RAISE EXCEPTION 'A branch assignment obtained a company roll-up'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF public.t17_payroll_finance_report(920001,920011,'2026-09-01')->'totals'<>'[]'::jsonb
 THEN RAISE EXCEPTION 'An unapproved month was reported as approved'; END IF;
 BEGIN
  PERFORM public.t17_payroll_finance_report(920001,920011,'2026-11-19');
  RAISE EXCEPTION 'Non-month-start parameter was accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(1);
 report:=public.t17_payroll_finance_report(920001,NULL,'2026-11-01');
 totals:=report->'totals'->0;
 IF (totals->>'wps_current_total')::numeric<>approved_net
   OR (totals->>'wps_accepted_total')::numeric<>approved_net
   OR jsonb_array_length(report->'files')<>2
   OR NOT report->'files' @> '[{"scope":"superseded"}]'
 THEN RAISE EXCEPTION 'Company roll-up double-counted corrected WPS history'; END IF;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
  PERFORM public.t17_payroll_finance_report(920001,920011,'2026-11-01');
  RAISE EXCEPTION 'Sibling branch obtained Finance aggregates'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(9);
 BEGIN
  PERFORM public.t17_payroll_finance_report(920001,920011,'2026-11-01');
  RAISE EXCEPTION 'Another employer obtained Finance aggregates'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(5);
 IF public.t17_payroll_finance_scopes()<>'[]'::jsonb THEN RAISE EXCEPTION 'Report and Finance permissions were mixed across assignments'; END IF;
 PERFORM pg_temp.t06_actor(8);
 IF public.t17_payroll_finance_scopes()<>'[]'::jsonb THEN RAISE EXCEPTION 'Global administrator inherited held business capability'; END IF;
 RESET ROLE;
 SELECT ur.id INTO STRICT expired FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
 WHERE r.role_code='t17_finance_all' AND ur.user_profile_id=pg_temp.t08_profile(4);
 INSERT INTO erp_private.t02_role_validity(assignment_id,valid_until) VALUES(expired,clock_timestamp()-interval '1 minute');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(4);
 BEGIN
  PERFORM public.t17_payroll_finance_report(920001,920011,'2026-11-01');
  RAISE EXCEPTION 'Expired Finance assignment could re-read the report'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
 DELETE FROM erp_private.t02_role_validity WHERE assignment_id=expired;

 -- Reverse the corrected exact payroll payment and prove the aggregate reopens.
 SELECT p.id,e.amount INTO STRICT payment,reversal_amount
 FROM erp_private.t16_payments p JOIN erp_private.t16_current_payment_events e ON e.payment_id=p.id
 WHERE p.batch_id=package AND p.employee_id=980001 AND p.reference='T16-CORRECTED-PAYMENT-1203';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'reverse',
   jsonb_build_object('batch',package,'payment',payment,'revision',1,'reason','Synthetic Finance verification of reopened balance')||pg_temp.t16_proof(998605));
 PERFORM pg_temp.t06_actor(4);
 report:=public.t17_payroll_finance_report(920001,920011,'2026-11-01');
 totals:=report->'totals'->0;
 IF (totals->>'verified_cash')::numeric<>approved_net-reversal_amount
   OR (totals->>'outstanding_cash')::numeric<>reversal_amount OR (totals->>'reconciled_count')::int<>1
   OR (totals->>'reconciled_cash')::numeric<>employee_net OR (totals->>'partial_count')::int<>1
   OR (totals->>'recovery_applied')::numeric<>0 OR (totals->>'applied_deductions')::numeric<>0
 THEN RAISE EXCEPTION 'Masked settlement reversal failed to reopen Finance reconciliation'; END IF;
 PERFORM pg_temp.t06_actor(3);
 PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
   jsonb_build_object('batch',package,'employee',980001,'channel','wps','reference','T17-RECEIPT-ONLY-CHECK',
    'amount',reversal_amount::text,'currency','AED','paid_on','2026-11-19','outcome','paid')||pg_temp.t16_proof(998612));
 PERFORM pg_temp.t06_actor(4);
 totals:=public.t17_payroll_finance_report(920001,920011,'2026-11-01')->'totals'->0;
 IF (totals->>'verified_cash')::numeric<>approved_net
   OR (totals->>'outstanding_cash')::numeric<>0 OR (totals->>'unallocated_cash')::numeric<>reversal_amount
   OR (totals->>'paid_unallocated_count')::int<>1 OR (totals->>'reconciled_count')::int<>1
   OR (totals->>'recovery_outstanding')::numeric<>approved_recoveries
 THEN RAISE EXCEPTION 'A net receipt was counted as fully allocated or as a collected recovery'; END IF;
 RESET ROLE;
END $$;

-- A separate exact approval neither inherits the November bank facts nor
-- nets unlike currencies together while a payroll remains unissued.
DO $$
DECLARE
 run_id uuid; version_id uuid;
 report jsonb;
BEGIN
 PERFORM set_config('request.jwt.claims','{}',true);
 INSERT INTO public.currencies(currency_code,currency_name_en,decimal_places)
 VALUES('USD','Synthetic test dollar',2) ON CONFLICT(currency_code) DO NOTHING;
 INSERT INTO erp_private.t14_runs(company_id,branch_id,month) VALUES(920001,920011,'2026-12-01') RETURNING id INTO run_id;
 INSERT INTO erp_private.t14_versions(run_id,number,cutoff,digest,source_digest,rule_digest,totals,exception_count,calculated_by,reason)
 VALUES(run_id,1,'2026-11-19',repeat('a',64),repeat('b',64),repeat('c',64),'[]',0,pg_temp.t08_profile(2),'Finance currency verification')
 RETURNING id INTO version_id;
 INSERT INTO erp_private.t14_results(version_id,employee_id,employee_name,employment_ids,currency,gross,deductions,state,policy_snapshots,exceptions)
 VALUES(version_id,980001,'Synthetic treasury name A','{}','USD',2440.19,0,'ready','[]','[]'),
       (version_id,980002,'Synthetic treasury name B','{}','AED',631.08,0,'ready','[]','[]');
 INSERT INTO erp_private.t14_lines(version_id,employee_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
 VALUES(version_id,980001,'synthetic-finance-usd','basic','earning',2440.19,'USD',1,'month',2440.19,'2026-12-01','2026-11-19','{}','Finance test'),
       (version_id,980002,'synthetic-finance-aed','basic','earning',500,'AED',1,'month',500,'2026-12-01','2026-11-19','{}','Finance test'),
       (version_id,980002,'synthetic-finance-housing','salary-component','earning',80,'AED',1,'month',80,'2026-12-01','2026-11-19',
         '{"type_id":998801,"component_code":"HOUSING_RETAINED"}','Housing allowance at approval'),
       (version_id,980002,'synthetic-finance-transport','salary-component','earning',51.08,'AED',1,'month',51.08,'2026-12-01','2026-11-19',
         '{"type_id":998802,"component_code":"TRANSPORT_RETAINED"}','Transport allowance at approval');
 INSERT INTO erp_private.t15_reviews(run_id,version_id,digest,state,submitted_by,acknowledged_count,decided_by,decided_at)
 VALUES(run_id,version_id,repeat('a',64),'approved',pg_temp.t08_profile(2),0,pg_temp.t08_profile(7),clock_timestamp());

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(4);
 report:=public.t17_payroll_finance_report(920001,920011,'2026-12-01');
 IF jsonb_array_length(report->'totals')<>2
 OR NOT report->'totals' @> '[{"currency":"AED","approved_net":"631.08","verified_cash":"0.00","outstanding_cash":"631.08","unexplained_difference":"0.00"}]'
 OR NOT report->'totals' @> '[{"currency":"USD","approved_net":"2440.19","verified_cash":"0.00","outstanding_cash":"2440.19","unexplained_difference":"0.00"}]'
 OR report->'files'<>'[]'::jsonb
 OR NOT report->'components' @> '[{"currency":"AED","category":"salary-component","component_code":"HOUSING_RETAINED","component_name":"Housing allowance at approval","approved":"80.00"}]'
 OR NOT report->'components' @> '[{"currency":"AED","category":"salary-component","component_code":"TRANSPORT_RETAINED","component_name":"Transport allowance at approval","approved":"51.08"}]'
 OR report::text LIKE '%998801%' OR report::text LIKE '%998802%'
 OR report::text LIKE '%Synthetic treasury name%'
 THEN RAISE EXCEPTION 'Exact approval month, currency or retained salary component did not reconcile'; END IF;
 RAISE NOTICE 'Second-month Finance fixture reconciled 2 employee results, 4 approved lines and % component groups in 2 separate currencies.',
    jsonb_array_length(report->'components');
 RESET ROLE;
 -- A late result for the same employee in a sibling branch belongs to its
 -- own approval and must contribute once to the exact company scope.
 PERFORM set_config('request.jwt.claims','{}',true);
 INSERT INTO erp_private.t14_runs(company_id,branch_id,month) VALUES(920001,920012,'2026-12-01') RETURNING id INTO run_id;
 INSERT INTO erp_private.t14_versions(run_id,number,cutoff,digest,source_digest,rule_digest,totals,exception_count,calculated_by,reason)
 VALUES(run_id,1,'2026-11-19',repeat('d',64),repeat('e',64),repeat('f',64),'[]',0,pg_temp.t08_profile(2),'Finance sibling branch')
 RETURNING id INTO version_id;
 INSERT INTO erp_private.t14_results(version_id,employee_id,employee_name,employment_ids,currency,gross,deductions,state,policy_snapshots,exceptions)
 VALUES(version_id,980001,'Synthetic cross-branch late item','{}','USD',50.10,0,'ready','[]','[]');
 INSERT INTO erp_private.t14_lines(version_id,employee_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
 VALUES(version_id,980001,'synthetic-finance-usd-late','fleet-overtime','earning',50.10,'USD',1,'h',50.10,'2026-11-19','2026-11-19','{}','Finance scope test');
 INSERT INTO erp_private.t15_reviews(run_id,version_id,digest,state,submitted_by,acknowledged_count,decided_by,decided_at)
 VALUES(run_id,version_id,repeat('d',64),'approved',pg_temp.t08_profile(2),0,pg_temp.t08_profile(7),clock_timestamp());

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 IF NOT public.t17_payroll_finance_scopes() @> '[{"company_id":920001,"branch_id":null}]'::jsonb
 THEN RAISE EXCEPTION 'Explicit company-wide Finance authority did not expose the roll-up'; END IF;
 report:=public.t17_payroll_finance_report(920001,NULL,'2026-12-01');
 IF report->'branch_id' IS DISTINCT FROM 'null'::jsonb
 OR NOT report->'totals' @> '[{"currency":"AED","approved_net":"631.08","employee_count":1}]'
 OR NOT report->'totals' @> '[{"currency":"USD","approved_net":"2490.29","outstanding_cash":"2490.29","unexplained_difference":"0.00","employee_count":2}]'
 OR NOT report->'components' @> '[{"currency":"USD","category":"fleet-overtime","work_month":"2026-11-01","approved":"50.10"}]'
 THEN RAISE EXCEPTION 'Company roll-up failed to add each current active branch result once'; END IF;
 RAISE NOTICE 'Company roll-up reconciled 3 employee payroll results and 5 approved lines across 2 branches and 2 separate currencies.';
 RESET ROLE;
END $$;

SELECT 'PASS: T17 Finance reconciled approved amounts, late overtime, current/corrected WPS, cash, recovery, separate currency, unallocated cash and linked reversal with exact scoped denial and masked output.';
ROLLBACK TO SAVEPOINT t17_finance_fixture;
RELEASE SAVEPOINT t17_finance_fixture;
