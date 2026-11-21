
-- Appended after the synthetic T07 and full T08 transaction, before rollback.
RESET ROLE;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
SELECT code,code,'DMS','test','held' FROM unnest(ARRAY['dms.documents.view.finance']) code
ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t14_accounts','Synthetic Accounts draft role',false),
 ('t14_rule_owner','Synthetic payroll rule owner',false),
 ('t14_view_only','Synthetic payroll view only',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t14_accounts',ARRAY['hr.payroll.run.manage','hr.payroll.view','dms.documents.view','dms.documents.preview','dms.documents.view.finance']),
 ('t14_rule_owner',ARRAY['hr.payroll.run.policy']),
 ('t14_view_only',ARRAY['hr.payroll.view'])
) facts(role,caps) JOIN public.roles r ON r.role_code=facts.role JOIN public.permissions p ON p.permission_code=ANY(facts.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(f.actor),r.id,f.company,f.branch,true
FROM (VALUES (2,'t14_accounts',920001,920011),(3,'t14_accounts',920001,920011),
 (4,'t14_rule_owner',920001,920011),(7,'t14_rule_owner',920001,920011),
 (6,'t14_accounts',920001,920012),(9,'t14_accounts',920002,920021),(5,'t14_view_only',920001,920011)
) f(actor,role,company,branch) JOIN public.roles r ON r.role_code=f.role;

INSERT INTO public.hr_payroll_groups(id,code,name_en,pay_frequency,created_at,updated_at)
OVERRIDING SYSTEM VALUE VALUES(995140,'T14-TEST-MONTHLY','T14 test monthly group','monthly','2026-08-01','2026-08-01');
SET LOCAL session_replication_role=replica;
UPDATE public.hr_salary_component_types SET created_at='2026-08-01',updated_at='2026-08-01' WHERE id IN(991900,991901);
UPDATE public.employee_payroll_profiles SET payroll_group_id=995140,created_at='2026-08-01',updated_at='2026-08-01'
 WHERE employee_id IN(980001,980002);
UPDATE public.employee_salary_components SET created_at='2026-08-01',updated_at='2026-08-01' WHERE employee_id IN(980001,980002);
UPDATE erp_private.t03_employment_changes SET applied_at='2026-08-01' WHERE employee_id IN(980001,980002) AND kind='confirm';
SET LOCAL session_replication_role=origin;
INSERT INTO erp_private.t14_rules(company_id,branch_id,validity,facts,prepared_by,approved_by,approved_at,reason,decision_reason)
VALUES(920001,920011,'[2026-10-01,2026-12-01)',
 '{"proration":"calendar-days","fixed_days":null,"absence":"unpaid-only","leave_wage_basis":"basic",
    "daily_recovery_basis":"basic","rounding":"line-half-up","recovery_fraction":0.10,"net_floor":0}',
 pg_temp.t08_profile(4),pg_temp.t08_profile(7),'2026-09-15','Synthetic dated review','Synthetic dated approval');

INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
 confidentiality_level,status) OVERRIDING SYSTEM VALUE
SELECT s.id,'T14-EVIDENCE-'||s.id,s.title,t.id,t.category_id,920001,s.branch,'finance','active'
FROM (VALUES(995141,920011,'Typed signed adjustment'),(995142,920012,'Sibling adjustment'),
 (995143,920011,'Second signed adjustment')) s(id,branch,title)
JOIN public.dms_document_types t ON t.type_code='T14_PAYROLL_ADJUSTMENT';
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
SELECT id,id,1,true FROM public.dms_documents WHERE id IN(995141,995142,995143);
UPDATE public.dms_documents SET current_version_id=id WHERE id IN(995141,995142,995143);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,
 file_size_bytes,sha256_hash,integrity_status)
OVERRIDING SYSTEM VALUE SELECT id,id,id,'original','dms-documents','920001/2026/finance/'||id||'/v1/original.pdf','original.pdf','application/pdf',
 102,repeat('a',64),'verified' FROM public.dms_documents WHERE id IN(995141,995142,995143);

-- Import a supported T13 hand-off with a recovery decision available in November.
INSERT INTO erp_private.t13_cases(id,source_kind,company_id,branch_id,asset_id,occurred_at,source_amount,currency,source_status,
 subject_status,employee_id,employment_id,employer_company_id,employer_branch_id,authority_key,reference_key,reported_by,reported_at)
OVERRIDING SYSTEM VALUE
SELECT 995144,'fine',920001,920011,980101,'2026-10-12 10:15+04',300,'AED','reported','verified',ep.employee_id,ep.id,
 ep.company_id,ep.branch_id,'synthetic-authority','T14-LATE-RECOVERY',pg_temp.t08_profile(1),'2026-11-17'
FROM erp_private.t03_employment_periods ep WHERE ep.employee_id=980001 AND ep.company_id=920001 AND ep.work_period@>'2026-10-12'::date;
INSERT INTO erp_private.t13_policies(id,company_id,branch_id,kind,validity,legal_basis,currency,case_limit,period_limit,
 wage_basis,priority,allow_deduct_correct,prepared_by,approved_by,approved_at,reason)
OVERRIDING SYSTEM VALUE VALUES (995144,920001,920011,'fine','[2026-09-01,2026-12-01)','Synthetic approved case basis',
 'AED',300,300,'fixed-amount',1,false,pg_temp.t08_profile(4),pg_temp.t08_profile(7),'2026-09-15','Synthetic rule');
INSERT INTO erp_private.t13_recovery_proofs(id,case_id,document_id,version_id,file_id) OVERRIDING SYSTEM VALUE
VALUES (995144,995144,980101,980101,980101);
INSERT INTO erp_private.t13_hr_reviews(id,case_id,source_digest,policy_id,decision,ceiling,notified_on,notice_id,
 response,reviewed_by,created_at,reason) OVERRIDING SYSTEM VALUE
VALUES(995144,995144,erp_private.t13_source_digest(995144),995144,'employee',300,'2026-11-18',995144,
 'no-response',pg_temp.t08_profile(4),'2026-11-18','Synthetic verified eligibility');
INSERT INTO erp_private.t13_reconciliations(id,case_id,hr_review_id,source_digest,actual_cost,evidence_id,checked_by,created_at,reason)
OVERRIDING SYSTEM VALUE
VALUES(995144,995144,995144,erp_private.t13_source_digest(995144),300,995144,pg_temp.t08_profile(2),'2026-11-19','Synthetic exact amount');
INSERT INTO erp_private.t13_schedules(id,case_id,hr_review_id,reconciliation_id,mode,principal,prepared_by,created_at,reason)
OVERRIDING SYSTEM VALUE VALUES(995144,995144,995144,995144,'one-time',300,pg_temp.t08_profile(2),'2026-11-19','Synthetic proposal');
INSERT INTO erp_private.t13_instalments(schedule_id,due_month,amount) VALUES(995144,'2026-10-01',300);

DO $$
DECLARE
 october date:='2026-10-01'; november date:='2026-11-01';
 request jsonb; rule_input jsonb; adjustment_input jsonb; receipt jsonb; review jsonb; row_detail jsonb; next_review jsonb;
 first uuid; first_nov uuid; second_nov uuid; held_version uuid; run_id uuid; operation uuid:=gen_random_uuid();
 rule_identity bigint; salary_key text; adjustment bigint; old_work bigint:=current_setting('erp.t08_work')::bigint;
 tot numeric; late_cutoff text:=to_char((statement_timestamp()-interval '1 millisecond') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
 before_claims bigint;
BEGIN
 SELECT count(*) INTO before_claims FROM erp_private.t08_payable_claims;
 IF has_table_privilege('authenticated','erp_private.t14_results','SELECT')
   OR has_function_privilege('authenticated','erp_private.t14_calculate(bigint,bigint,date,timestamp with time zone,uuid,bigint,text)','EXECUTE')
   OR has_function_privilege('anon','public.t14_payroll_scopes()','EXECUTE') THEN
   RAISE EXCEPTION 'Direct payroll data or private calculation leaked';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(8);
 IF public.t14_payroll_scopes()<>'[]'::jsonb THEN RAISE EXCEPTION 'Global administration inherited business payroll rights'; END IF;
 PERFORM pg_temp.t06_actor(5);
 BEGIN
   PERFORM public.t14_payroll_workspace(920001,920011,october);
   RAISE EXCEPTION 'Ordinary salary view opened monthly drafts'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM pg_temp.t06_actor(4);
 rule_input:='{"from":"2026-12-01","until":"2027-02-01","proration":"calendar-days","absence":"unpaid-only",
  "leave_wage_basis":"basic","daily_recovery_basis":"basic","recovery_fraction":"0.10","net_floor":"0",
  "reason":"Synthetic next policy"}';
 BEGIN
   PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'prepare-rule',rule_input||'{"from":"2026-12-03"}');
   RAISE EXCEPTION 'Midmonth monthly-policy change was accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 rule_identity:=(public.t14_payroll_command(gen_random_uuid(),920001,920011,'prepare-rule',rule_input)->>'id')::bigint;
 BEGIN
   PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'approve-rule',
      jsonb_build_object('rule',rule_identity,'reason','Synthetic self decision'));
   RAISE EXCEPTION 'Policy author approved own rules'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(7);
 PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'approve-rule',jsonb_build_object('rule',rule_identity,'reason','Independent review'));
 review:=public.t14_payroll_workspace(920001,920011,november);
 IF NOT (review->>'can_policy')::boolean OR (review->>'can_calculate')::boolean
    OR review->'employees'<>'[]'::jsonb OR review->'version'<>'null'::jsonb THEN RAISE EXCEPTION 'Policy actor obtained payroll data'; END IF;

 PERFORM pg_temp.t06_actor(2);
 request:=jsonb_build_object('month',october,'cutoff','2026-10-31T23:59:00+04:00','expected_version',NULL,'reason','October approved cutoff');
 receipt:=public.t14_payroll_command(operation,920001,920011,'calculate',request);
 first:=(receipt->>'version')::uuid;
 IF public.t14_payroll_command(operation,920001,920011,'calculate',request) IS DISTINCT FROM receipt||'{"replayed":true}'::jsonb THEN
   RAISE EXCEPTION 'Exact retry did not return original draft version';
 END IF;
 BEGIN
   PERFORM public.t14_payroll_command(operation,920001,920011,'calculate',request||'{"reason":"Changed retry"}');
   RAISE EXCEPTION 'Changed replay was accepted'; EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
 END;
 review:=public.t14_payroll_workspace(920001,920011,october,first,980001);
 SELECT cell INTO row_detail FROM jsonb_array_elements(review->'employees') cell WHERE cell->>'id'='980001';
 IF (row_detail->>'gross')::numeric IS DISTINCT FROM 4000 OR row_detail->>'state' IS DISTINCT FROM 'ready'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(review->'detail'->'lines') v WHERE v->>'category' IN('fleet-overtime','recovery'))
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review->'detail'->'exceptions') v WHERE v->>'code'='recovery-held') THEN
   RAISE EXCEPTION 'October should pay AED 4000 and hold late inputs: %',review;
 END IF;
 BEGIN
   PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'calculate',
         request||jsonb_build_object('cutoff',late_cutoff,'expected_version',first));
   RAISE EXCEPTION 'The prior payroll cutoff could be overwritten'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 request:=jsonb_build_object('month',november,'cutoff',late_cutoff,'expected_version',NULL,'reason','November approved cutoff');
 receipt:=public.t14_payroll_command(gen_random_uuid(),920001,920011,'calculate',request);
 first_nov:=(receipt->>'version')::uuid; run_id:=(receipt->>'run')::uuid;
 review:=public.t14_payroll_workspace(920001,920011,november,first_nov,980001);
 SELECT cell INTO row_detail FROM jsonb_array_elements(review->'employees') cell WHERE cell->>'id'='980001';
 SELECT coalesce(sum((v->>'amount')::numeric),0) INTO tot FROM jsonb_array_elements(review->'detail'->'lines') v
 WHERE v->>'key' LIKE ('fleet-overtime:'||old_work||':%') AND v->>'original_on'='2026-10-03';
 IF tot<>30 OR row_detail->>'state' IS DISTINCT FROM 'ready'
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review->'detail'->'lines') v
         WHERE v->>'category'='recovery' AND (v->'source'->>'case')::bigint=995144
           AND (v->>'amount')::numeric=(v->'source'->>'group_headroom')::numeric AND (v->>'amount')::numeric<300)
    OR review::text~*'(iban|account_number|medical|bank_reference)' THEN
   RAISE EXCEPTION 'Late contractual wages, recovery headroom, or protected projection failed: %',review;
 END IF;
 SELECT v->>'key' INTO salary_key FROM jsonb_array_elements(review->'detail'->'lines') v WHERE v->>'category'='basic' LIMIT 1;
 adjustment_input:=jsonb_build_object('month',november,'employee',980001,'version',first_nov,'source_key',salary_key,
      'kind','earning','amount',25,'currency','AED','reason','Documented synthetic difference',
      'evidence',jsonb_build_object('document',995142,'version',995142,'file',995142));
 BEGIN
   PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'prepare-adjustment',adjustment_input);
   RAISE EXCEPTION 'Sibling original accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 adjustment_input:=adjustment_input||jsonb_build_object('evidence',jsonb_build_object('document',995141,'version',995141,'file',995141));
 adjustment:=(public.t14_payroll_command(gen_random_uuid(),920001,920011,'prepare-adjustment',adjustment_input)->>'id')::bigint;
 BEGIN
   PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'verify-adjustment',
        jsonb_build_object('adjustment',adjustment,'reason','Same actor decision'));
   RAISE EXCEPTION 'Adjustment author verified own adjustment'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(3);
 PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'verify-adjustment',
        jsonb_build_object('adjustment',adjustment,'reason','Independent adjustment evidence review'));
 PERFORM pg_temp.t06_actor(2);
 second_nov:=(public.t14_payroll_command(gen_random_uuid(),920001,920011,'calculate',
          request||jsonb_build_object('expected_version',first_nov))->>'version')::uuid;
 next_review:=public.t14_payroll_workspace(920001,920011,november,second_nov,980001);
 IF second_nov=first_nov OR jsonb_array_length(next_review->'versions')<>2 OR
   (SELECT count(*) FROM jsonb_array_elements(next_review->'detail'->'lines') v
    WHERE v->>'key'='adjustment:'||adjustment AND (v->>'amount')::numeric=25)<>1 OR
   NOT EXISTS(SELECT 1 FROM jsonb_array_elements(next_review->'detail'->'exceptions') v WHERE v->>'code'='review-adjustment-after-cutoff') OR
   next_review::text LIKE '%evidence_version%' OR jsonb_array_length(next_review->'detail'->'policies')<>1 OR
   EXISTS(SELECT 1 FROM jsonb_array_elements(public.t14_payroll_workspace(920001,920011,november,first_nov,980001)->'detail'->'lines') v
    WHERE v->>'category'='adjustment') THEN
   RAISE EXCEPTION 'Independent adjustment was not retained once in a new draft';
 END IF;
 BEGIN
   PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'prepare-adjustment',adjustment_input||
     jsonb_build_object('version',second_nov,'evidence',jsonb_build_object('document',995143,'version',995143,'file',995143)));
   RAISE EXCEPTION 'The same adjustment was repeated against a new snapshot'; EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
   PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'calculate',request||jsonb_build_object('expected_version',first_nov));
   RAISE EXCEPTION 'Concurrent stale draft calculation was accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t14_payroll_workspace(920001,920012,november,second_nov,980001);
   RAISE EXCEPTION 'Sibling could read another branch version'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(9);
 BEGIN
   PERFORM public.t14_payroll_workspace(920002,920021,november,second_nov,980001);
   RAISE EXCEPTION 'Receiving company could read original payroll versions'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
 IF (SELECT count(*) FROM erp_private.t08_payable_claims)<>before_claims OR EXISTS(SELECT 1 FROM erp_private.t13_payroll_pins) THEN
   RAISE EXCEPTION 'A draft assigned an actual claim or approved a recovery';
 END IF;
 SELECT to_jsonb(l) INTO row_detail FROM erp_private.t14_lines l WHERE l.version_id=second_nov AND l.employee_id=980001
    AND l.key LIKE ('fleet-overtime:'||old_work||':%') LIMIT 1;
 IF row_detail IS NULL OR NOT erp_private.t14_other_draft(gen_random_uuid(),980001,row_detail)
    OR erp_private.t14_other_draft(run_id,980001,row_detail)
    OR NOT erp_private.t14_other_draft(gen_random_uuid(),980001,row_detail||'{"key":"revised-shared-overtime-key"}') THEN
   RAISE EXCEPTION 'Another draft could reserve the same source or an overlapping Fleet/Workshop interval';
 END IF;
 PERFORM set_config('request.jwt.claims','{}',true);
 INSERT INTO public.employee_payroll_holds(employee_id,hold_reason,hold_date,created_at,updated_at)
 VALUES(980001,'T14 TEST confidential cause','2026-11-19','2026-11-19','2026-11-19');
 row_detail:=erp_private.t14_employee_basis(gen_random_uuid(),980001,920001,920011,'2026-12-01',late_cutoff::timestamptz);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(row_detail->'exceptions') e WHERE e->>'code'='payroll-hold' AND (e->>'blocking')::boolean)
    OR row_detail::text LIKE '%confidential cause%' THEN RAISE EXCEPTION 'An independent payroll hold was ignored or exposed'; END IF;
 DELETE FROM public.employee_payroll_holds WHERE employee_id=980001 AND hold_reason='T14 TEST confidential cause';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 adjustment:=(public.t14_payroll_command(gen_random_uuid(),920001,920011,'prepare-adjustment',adjustment_input||
     jsonb_build_object('version',second_nov,'kind','deduction','amount',10000,
       'evidence',jsonb_build_object('document',995143,'version',995143,'file',995143)))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(3);
 PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'verify-adjustment',
    jsonb_build_object('adjustment',adjustment,'reason','Independent evidence for deliberately invalid fixture'));
 held_version:=(public.t14_payroll_command(gen_random_uuid(),920001,920011,'calculate',
    request||jsonb_build_object('expected_version',second_nov))->>'version')::uuid;
 review:=public.t14_payroll_workspace(920001,920011,november,held_version,980001);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review->'detail'->'exceptions') v WHERE v->>'code'='negative-net' AND (v->>'blocking')::boolean)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review->'employees') v WHERE v->>'id'='980001' AND v->>'state'='held')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(review->'version'->'totals') v WHERE (v->>'net')::numeric<0) THEN
   RAISE EXCEPTION 'Invalid net entered ready payroll totals';
 END IF;
 RESET ROLE;
 BEGIN
   UPDATE erp_private.t14_versions SET reason='Change frozen results' WHERE id=first_nov;
   RAISE EXCEPTION 'A retained version was mutable'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
END $$;
SELECT 'PASS: October basic pay, original-date November overtime and late recovery headroom, independent rules and adjustment, exact retries, immutable versions, draft overlap, payroll hold and invalid net.';
ROLLBACK;
