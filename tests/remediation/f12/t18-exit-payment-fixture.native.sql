-- Run after the T16 synthetic fixture and before its rollback.
DO $test$
BEGIN
 IF current_database() !~ '^t18_' OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
   RAISE EXCEPTION 'Marked isolated T18 database required';
 END IF;
END;
$test$;

RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES ('t18_test_payer','Synthetic exact exit payer',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.role_code='t18_test_payer'
 AND p.permission_code IN ('hr.eos.view','hr.exit.settlement.view','hr.exit.settlement.pay','hr.payroll.view');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(a.actor),r.id,a.company,a.branch,true
FROM (VALUES (3,920001,920011),(4,920001,920011),(6,920001,920012),(7,920001,920011),(9,920002,920021))
 a(actor,company,branch) CROSS JOIN public.roles r WHERE r.role_code='t18_test_payer';

DO $test$
DECLARE
 exit_employee bigint:=980002;
 eos bigint;
 version_id uuid;
 approval_id uuid;
 earning uuid;
 deduction uuid;
 op uuid:=gen_random_uuid();
 exact_request jsonb;
 payment_input jsonb;
 start_data jsonb;
 correction_input jsonb;
 correction_op uuid;
 allocation jsonb;
 response jsonb;
 payment_status jsonb;
 larger_payment uuid;
 partial_payment uuid;
 wrong_actor integer;
 recovery_proposal jsonb;
 recovery_baseline numeric;
 original_recovery bigint;
 package uuid:=current_setting('erp.t16_batch')::uuid;
BEGIN
 -- Seed the previously verified approved state. Its handoff is tested through
 -- the source-backed lifecycle fixture. This test targets subsequent money.
 INSERT INTO public.employee_eos_cases(employee_id,eos_type,case_status,last_working_date)
 VALUES(exit_employee,'resignation','clearance_in_progress','2026-10-19') RETURNING id INTO eos;
 INSERT INTO erp_private.t18_cases(eos_id,employee_id,employment_id,company_id,branch_id,last_day,last_working_day,opened_by)
 SELECT eos,e.employee_id,e.id,920001,920011,'2026-10-19','2026-10-19',pg_temp.t08_profile(1)
 FROM erp_private.t03_employment_periods e WHERE e.employee_id=exit_employee AND e.work_period @> '2026-10-19'::date;
 INSERT INTO erp_private.t13_cases(id,source_kind,company_id,branch_id,asset_id,occurred_at,source_amount,currency,source_status,
   subject_status,employee_id,employment_id,employer_company_id,employer_branch_id,authority_key,reference_key,reported_by,reported_at)
 OVERRIDING SYSTEM VALUE
 SELECT 995184,'fine',920001,920011,980101,'2026-10-12 10:15+04',300,'AED','reported','verified',
   c.employee_id,c.employment_id,c.company_id,c.branch_id,'synthetic-authority','T18-EXACT-RECOVERY',
   pg_temp.t08_profile(1),'2026-10-13' FROM erp_private.t18_cases c WHERE c.eos_id=eos;
 INSERT INTO erp_private.t13_recovery_proofs(id,case_id,document_id,version_id,file_id) OVERRIDING SYSTEM VALUE
 VALUES(995184,995184,980101,980101,980101);
 INSERT INTO erp_private.t13_hr_reviews(id,case_id,source_digest,policy_id,decision,ceiling,notified_on,notice_id,
   response,reviewed_by,created_at,reason) OVERRIDING SYSTEM VALUE
 VALUES(995184,995184,erp_private.t13_source_digest(995184),995144,'employee',300,'2026-10-14',995184,
  'no-response',pg_temp.t08_profile(4),'2026-10-14','Verified eligibility for the exact exit recovery');
 INSERT INTO erp_private.t13_reconciliations(id,case_id,hr_review_id,source_digest,actual_cost,evidence_id,checked_by,created_at,reason)
 OVERRIDING SYSTEM VALUE VALUES(995184,995184,995184,erp_private.t13_source_digest(995184),300,995184,
   pg_temp.t08_profile(2),'2026-10-15','Verified source cost');
 INSERT INTO erp_private.t13_schedules(id,case_id,hr_review_id,reconciliation_id,mode,principal,prepared_by,created_at,reason)
 OVERRIDING SYSTEM VALUE VALUES (995184,995184,995184,995184,'one-time',300,pg_temp.t08_profile(2),'2026-10-15',
   'Verified recovery plan approved as an exact exit line');
 INSERT INTO erp_private.t13_instalments(schedule_id,due_month,amount) VALUES(995184,'2026-10-01',300);
 recovery_proposal:=erp_private.t13_payroll_proposal(995184,'2026-10-01','deduction');
 recovery_baseline:=(erp_private.t13_financial_summary(995184)->>'outstanding')::numeric;
 IF recovery_proposal->>'status'<>'ready' OR recovery_baseline IS DISTINCT FROM 300::numeric THEN
   RAISE EXCEPTION 'Canonical exit test did not start with an eligible recovery: %',recovery_proposal;
 END IF;

 INSERT INTO erp_private.t18_versions(eos_id,number,cutoff,digest,facts,policy,gross,deductions,currency,calc_by,reason)
 VALUES(eos,1,'2026-10-20 09:00+04',repeat('d',64),'{}','{"payment_channels":["exit-bank-transfer"]}',100,20,
  'AED',pg_temp.t08_profile(2),'Synthetic exact settlement for ledger verification') RETURNING id INTO version_id;
 INSERT INTO erp_private.t18_lines(version_id,key,category,kind,amount,currency,quantity,unit,rate,
  original_on,available_at,source,reason)
 VALUES(version_id,'verification-wages','termination-benefit','earning',100,'AED',1,'item',100,'2026-10-19',
  '2026-10-19 10:00+04',jsonb_build_object('employment',(SELECT c.employment_id FROM erp_private.t18_cases c WHERE c.eos_id=eos)),
  'Approved one-time entitlement') RETURNING id INTO earning;
 INSERT INTO erp_private.t18_lines(version_id,key,category,kind,amount,currency,quantity,unit,rate,
  original_on,available_at,source,reason)
 VALUES(version_id,'recovery:deduction:995184','recovery','deduction',20,'AED',1,'schedule',20,'2026-10-19',
   '2026-10-19 12:00+04',jsonb_build_object('case',995184,'schedule',recovery_proposal->'schedule_id',
     'upstream_id',recovery_proposal->'source_id','recovery_kind','deduction','fingerprint',recovery_proposal->>'digest',
     'proposal_amount',recovery_proposal->'amount','wage_cap',20,'group_headroom',20,'month','2026-10-01'),
   'Separately approved and itemised recovery') RETURNING id INTO deduction;

 PERFORM erp_private.t18_reserve(version_id);
 INSERT INTO erp_private.t18_approvals(eos_id,version_id,digest,decided_by)
 VALUES(eos,version_id,repeat('d',64),pg_temp.t08_profile(7)) RETURNING id INTO approval_id;
 IF NOT erp_private.t18_may_revoke(version_id) THEN RAISE EXCEPTION 'Unstarted exit may not be revoked'; END IF;
 IF has_table_privilege('authenticated','erp_private.t18_exit_payment_events','SELECT')
   OR has_table_privilege('service_role','erp_private.t18_exit_allocations','INSERT')
   OR has_function_privilege('authenticated','erp_private.t18_may_revoke(uuid)','EXECUTE')
   OR has_function_privilege('authenticated','erp_private.t18_payment_status(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Raw exit cash ledger or mutation is exposed';
 END IF;
 exact_request:=jsonb_build_object('settlement_version',version_id,'digest',repeat('d',64));
 start_data:=exact_request||'{"channel":"exit-bank-transfer"}'::jsonb;
 payment_input:=exact_request||jsonb_build_object('reference','SYNTHETIC-EXIT-1001','outcome','pending',
   'amount','0','currency','AED','paid_on','2026-11-19')||pg_temp.t16_proof(998603);

 SET LOCAL ROLE authenticated;
 FOREACH wrong_actor IN ARRAY ARRAY[2,6,7,9] LOOP
   PERFORM pg_temp.t06_actor(wrong_actor);
   BEGIN
     PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'start',start_data);
     RAISE EXCEPTION 'Unauthorised or approving actor opened the exit payment channel';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'start',start_data||jsonb_build_object('digest',repeat('f',64)));
   RAISE EXCEPTION 'Payment accepted a different approved version digest';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'start',start_data||'{"channel":"exit-cheque"}'::jsonb);
   RAISE EXCEPTION 'An unapproved channel was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input);
   RAISE EXCEPTION 'Receipt accepted without retained handoff';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 -- A genuine monthly receipt publishes its ownership before exit tries it.
 PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
   jsonb_build_object('batch',package,'employee',exit_employee,'channel','wps','reference','SYNTHETIC-PRIOR-MONTH-9001',
   'amount','20','currency','AED','paid_on','2026-11-19','outcome','partial')||pg_temp.t16_proof(998602));
 RESET ROLE;
 INSERT INTO erp_private.t18_exit_intents(version_id,approval_id,channel,actor_id)
 VALUES(version_id,approval_id,'exit-bank-transfer',pg_temp.t08_profile(3));
 IF erp_private.t18_may_revoke(version_id) THEN
   RAISE EXCEPTION 'Unknown external payment status released its exact approval';
 END IF;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(4);
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input);
   RAISE EXCEPTION 'An actor without protected bank document authority recorded cash';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input||pg_temp.t16_proof(998606));
   RAISE EXCEPTION 'An out-of-branch finance slip was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',
     payment_input||'{"reference":"synthetic-prior-month-9001"}'::jsonb);
   RAISE EXCEPTION 'Exit reused a monthly bank reference';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',
     payment_input||'{"outcome":"partial","amount":"30"}'::jsonb||pg_temp.t16_proof(998602));
   RAISE EXCEPTION 'Exit reused a monthly cash proof with a different reference';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',
   payment_input||'{"reference":"SYNTHETIC-EXIT-REJECTED"}'::jsonb||pg_temp.t16_proof(998610));
 RESET ROLE;
 IF erp_private.t18_may_revoke(version_id) THEN
   RAISE EXCEPTION 'An unresolved pending provider outcome permitted revocation';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 response:=public.t18_exit_payment(gen_random_uuid(),eos,'receipt',
   payment_input||'{"reference":"SYNTHETIC-EXIT-REJECTED","outcome":"rejected"}'::jsonb||pg_temp.t16_proof(998610));
 RESET ROLE;
 IF response->>'state'<>'rejected' OR NOT erp_private.t18_may_revoke(version_id) THEN
   RAISE EXCEPTION 'Conclusive rejection with zero cash did not release revocation eligibility';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 response:=public.t18_exit_payment(op,eos,'receipt',payment_input);
 partial_payment:=(response->>'payment')::uuid;
 IF response->>'state'<>'pending' OR NOT (public.t18_exit_payment(op,eos,'receipt',payment_input)->>'replayed')::boolean THEN
   RAISE EXCEPTION 'Pending result or exact retry was changed';
 END IF;
 BEGIN
   PERFORM public.t18_exit_payment(op,eos,'receipt',payment_input||'{"outcome":"rejected"}'::jsonb);
   RAISE EXCEPTION 'Changed input reused its exact operation';
 EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL; END;
 payment_input:=payment_input||'{"outcome":"partial","amount":"30"}'::jsonb;
 response:=public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input);
 IF (response->>'payment')::uuid IS DISTINCT FROM partial_payment OR response->>'state'<>'partial'
    OR (public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input)->>'payment')::uuid IS DISTINCT FROM partial_payment THEN
    RAISE EXCEPTION 'Pending confirmation or natural retry created another payment';
 END IF;
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
     jsonb_build_object('batch',package,'employee',exit_employee,'channel','wps','reference','synthetic-exit-1001',
       'amount','20','currency','AED','paid_on','2026-11-19','outcome','partial')||pg_temp.t16_proof(998612));
   RAISE EXCEPTION 'Monthly payment reused a retained exit bank reference';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
     jsonb_build_object('batch',package,'employee',exit_employee,'channel','wps','reference','SYNTHETIC-WPS-OTHER-9001',
       'amount','20','currency','AED','paid_on','2026-11-19','outcome','partial')||pg_temp.t16_proof(998603));
   RAISE EXCEPTION 'Monthly payment reused exit cash proof with a different reference';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input||'{"reference":"OTHER-EXIT-PROOF"}'::jsonb);
   RAISE EXCEPTION 'The same receipt yielded more exit cash under another reference';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input
     ||'{"reference":"EXCESS-MOVEMENT","outcome":"paid","amount":"80"}'::jsonb||pg_temp.t16_proof(998609));
   RAISE EXCEPTION 'Verified cash exceeded the approved net';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

 allocation:=exact_request||jsonb_build_object('payment',partial_payment,'revision',0,
   'reason','Synthetic exact wages and a deduction','lines',jsonb_build_array(jsonb_build_object('line',earning,'amount','50'),
     jsonb_build_object('line',deduction,'amount','20')));
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'allocate',allocation||pg_temp.t16_proof(998603));
   RAISE EXCEPTION 'A net-only receipt proved a deduction';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'allocate',allocation||pg_temp.t16_proof(998602));
   RAISE EXCEPTION 'Another payroll’s net-only cash proof proved a deduction';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'allocate',allocation||pg_temp.t16_proof(998604)
     ||jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('line',earning,'amount','51'),
       jsonb_build_object('line',deduction,'amount','20'))));
   RAISE EXCEPTION 'Allocation exceeded signed cash';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

 op:=gen_random_uuid();
 allocation:=allocation||pg_temp.t16_proof(998604);
 response:=public.t18_exit_payment(op,eos,'allocate',allocation);
 IF (response->>'revision')::int<>1 OR NOT (public.t18_exit_payment(op,eos,'allocate',allocation)->>'replayed')::boolean THEN
   RAISE EXCEPTION 'Allocation retry created a new revision';
 END IF;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'allocate',allocation);
   RAISE EXCEPTION 'Stale revision accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

 PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input
   ||'{"reference":"SYNTHETIC-EXIT-PENDING-1003","outcome":"pending","amount":"0"}'::jsonb||pg_temp.t16_proof(998612));
 response:=public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input
   ||'{"reference":"SYNTHETIC-EXIT-1002","outcome":"paid","amount":"50"}'::jsonb||pg_temp.t16_proof(998609));
 larger_payment:=(response->>'payment')::uuid;
 IF response->>'state'<>'pending' THEN RAISE EXCEPTION 'Verified cash masked an unresolved provider outcome'; END IF;
 response:=public.t18_exit_payment(gen_random_uuid(),eos,'allocate',exact_request
   ||jsonb_build_object('payment',larger_payment,'revision',0,'reason','Match the remaining exact wage line',
     'lines',jsonb_build_array(jsonb_build_object('line',earning,'amount','50'))));
 IF response->>'state'<>'pending' THEN RAISE EXCEPTION 'Allocating all lines cleared an unresolved provider outcome'; END IF;
 response:=public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input
   ||'{"reference":"SYNTHETIC-EXIT-PENDING-1003","outcome":"rejected","amount":"0"}'::jsonb||pg_temp.t16_proof(998612));
 IF response->>'state'<>'reconciled' THEN RAISE EXCEPTION 'Exact wage and deduction reconciliation failed: %',response; END IF;
 RESET ROLE;
 SELECT t.id INTO STRICT original_recovery FROM erp_private.t13_allocations t
  JOIN erp_private.t13_payroll_pins pin ON pin.id=t.pin_id
  WHERE pin.case_id=995184 AND pin.payroll_line_id=deduction;
 IF (erp_private.t13_financial_summary(995184)->>'outstanding')::numeric IS DISTINCT FROM recovery_baseline-20 THEN
   RAISE EXCEPTION 'Exit did not reconcile the deduction in the canonical T13 ledger';
 END IF;
 payment_status:=erp_private.t18_payment_status(version_id);
 IF (payment_status->>'verified_cash')::numeric<>80 OR (payment_status->>'applied_wages')::numeric<>100
    OR (payment_status->>'applied_deductions')::numeric<>20 OR (payment_status->>'unallocated')::numeric<>0
    OR payment_status::text LIKE '%SYNTHETIC-EXIT%' OR payment_status::text LIKE '%99860%'
    OR NOT payment_status->'movements' @> '[{"reference_suffix":"1002","outcome":"paid"}]'
 OR erp_private.t18_may_revoke(version_id) THEN
   RAISE EXCEPTION 'Masked, retained cash projection has incorrect totals or release: %',payment_status;
 END IF;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t13_recovery_reverse(gen_random_uuid(),original_recovery,20,'Bypass exit reconciliation');
   RAISE EXCEPTION 'The standalone recovery RPC bypassed the original exit cash movement';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 allocation:=exact_request||jsonb_build_object('payment',partial_payment,'revision',1,
   'reason','Bank returned the first verified installment');
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'reverse',allocation||pg_temp.t16_proof(998603));
   RAISE EXCEPTION 'Reversal reused its original payment proof';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 op:=gen_random_uuid();
 allocation:=allocation||pg_temp.t16_proof(998605);
 response:=public.t18_exit_payment(op,eos,'reverse',allocation);
 IF response->>'state'<>'partial' OR NOT (public.t18_exit_payment(op,eos,'reverse',allocation)->>'replayed')::boolean THEN
   RAISE EXCEPTION 'Reversal or its exact retry was incorrect: %',response;
 END IF;
 RESET ROLE;
 IF (erp_private.t13_financial_summary(995184)->>'outstanding')::numeric IS DISTINCT FROM recovery_baseline
   OR NOT EXISTS(SELECT 1 FROM erp_private.t13_allocations WHERE reverses_allocation_id=original_recovery AND amount=20) THEN
   RAISE EXCEPTION 'Canonical T13 balance did not reverse with the original exit movement';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'reverse',allocation);
   RAISE EXCEPTION 'One movement was reversed twice';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',payment_input
      ||'{"reference":"EXIT-CORRECTION","outcome":"paid","amount":"30"}'::jsonb);
   RAISE EXCEPTION 'Correction reused reversed cash proof';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 correction_input:=payment_input
   ||'{"reference":"EXIT-CORRECTION","outcome":"paid","amount":"30"}'::jsonb||pg_temp.t16_proof(998611);
 correction_op:=gen_random_uuid();
 response:=public.t18_exit_payment(correction_op,eos,'receipt',correction_input);
 response:=public.t18_exit_payment(gen_random_uuid(),eos,'allocate',exact_request
   ||jsonb_build_object('payment',response->>'payment','revision',0,'reason','Correct approved wages and deductions',
     'lines',jsonb_build_array(jsonb_build_object('line',earning,'amount','50'),
                              jsonb_build_object('line',deduction,'amount','20')))
   ||pg_temp.t16_proof(998604));
 IF response->>'state'<>'reconciled' THEN RAISE EXCEPTION 'Corrected distinct cash did not reconcile'; END IF;

 RESET ROLE;
 IF (erp_private.t13_financial_summary(995184)->>'outstanding')::numeric IS DISTINCT FROM recovery_baseline-20
   OR (SELECT count(*) FROM erp_private.t18_exit_recovery_links l JOIN erp_private.t18_exit_allocations a
       ON a.id=l.allocation_id WHERE a.line_id=deduction)<>2 THEN
   RAISE EXCEPTION 'Corrected exit cash duplicated or failed to restore the canonical recovery';
 END IF;
 IF (SELECT count(*) FROM erp_private.t18_exit_reversals WHERE payment_id=partial_payment)<>1
   OR (SELECT count(*) FROM erp_private.t18_exit_payment_events WHERE payment_id=partial_payment)<>2
   OR erp_private.t18_may_revoke(version_id) THEN
   RAISE EXCEPTION 'Retained exit payment history was rewritten or released';
 END IF;
 BEGIN
   UPDATE public.dms_document_files SET sha256_hash=repeat('f',64) WHERE id=998604;
   RAISE EXCEPTION 'A verified itemisation original could be rewritten';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 BEGIN
   UPDATE public.dms_document_versions SET unlinked_at=now() WHERE id=998605;
   RAISE EXCEPTION 'A verified reversal original could be unlinked';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 BEGIN
   UPDATE public.dms_documents SET is_archived=true WHERE id=998611;
   RAISE EXCEPTION 'The document containing a verified receipt could be archived';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;

 UPDATE public.dms_document_versions SET is_current=false WHERE id=998611;
 INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
 VALUES(998651,998611,2,true);
 INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,
   file_size_bytes,sha256_hash,integrity_status) OVERRIDING SYSTEM VALUE
 VALUES(998651,998611,998651,'original','dms-documents','920001/2026/finance/998611/v2/replacement.pdf','replacement.pdf','application/pdf',
  100,lpad('998651',64,'0'),'verified');
 UPDATE public.dms_documents SET current_version_id=998651 WHERE id=998611;
 IF NOT EXISTS(
    SELECT 1 FROM public.dms_document_files f JOIN public.dms_document_versions v ON v.id=f.version_id
    WHERE f.id=998611 AND f.sha256_hash=lpad('998611',64,'0') AND f.deleted_at IS NULL AND v.unlinked_at IS NULL
 ) THEN RAISE EXCEPTION 'A new current version lost the retained historical receipt'; END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 IF NOT (public.t18_exit_payment(correction_op,eos,'receipt',correction_input)->>'replayed')::boolean THEN
   RAISE EXCEPTION 'An exact authorised retry lost its retained bank original after replacement';
 END IF;
 BEGIN
   PERFORM public.t18_exit_payment(gen_random_uuid(),eos,'receipt',correction_input);
   RAISE EXCEPTION 'A new payment action accepted a historical bank original';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 BEGIN
   PERFORM public.t18_exit_payment(correction_op,eos,'receipt',correction_input);
   RAISE EXCEPTION 'An unauthorised actor reused retained bank proof';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;

 RAISE NOTICE 'T18 exit ledger, exact retries, scope, reversal, corrections, T13 recovery, T16 identities and protected historical originals passed';
END;
$test$;
