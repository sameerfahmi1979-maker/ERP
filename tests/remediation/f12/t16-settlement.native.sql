-- Run inside the guarded T16 rollback fixture after exact-version file acceptance.
DO $$
BEGIN
 IF to_regprocedure('public.t16_payroll_payment_command(uuid,bigint,bigint,text,jsonb)') IS NULL
   OR to_regprocedure('erp_private.t16_result_status(uuid,bigint)') IS NULL
   OR to_regprocedure('erp_private.t16_payment_history(uuid,bigint)') IS NULL THEN
   RAISE EXCEPTION 'T16 employee payment, allocation and reversal boundary is unavailable';
 END IF;
END $$;
\if :{?t16_settlement_red}
ROLLBACK;
\else
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DO $$
DECLARE
 package uuid:=current_setting('erp.t16_batch')::uuid;
 approved_version uuid:=current_setting('erp.t16_version')::uuid;
 approved_review uuid:=current_setting('erp.t16_review')::uuid;
 first_employee erp_private.t14_results;
 second_employee erp_private.t14_results;
 basic_line erp_private.t14_lines;
 deduction_line erp_private.t14_lines;
 case_id bigint;
 part numeric:=100;
 first_payment uuid;
 second_payment uuid;
 remaining_payment uuid;
 corrected_payment uuid;
 operation uuid;
 inputs jsonb;
 receipt jsonb;
 remaining_lines jsonb;
 second_lines jsonb;
 history jsonb;
 original_balance numeric;
 reversal_inputs jsonb;
 linked_recovery record;
 verified_actual numeric;
 disposition_lines jsonb;
BEGIN
 SELECT * INTO STRICT first_employee FROM erp_private.t14_results WHERE version_id=approved_version AND employee_id=980001;
 SELECT * INTO STRICT second_employee FROM erp_private.t14_results WHERE version_id=approved_version AND employee_id=980002;
 SELECT * INTO STRICT deduction_line FROM erp_private.t14_lines
 WHERE version_id=approved_version AND employee_id=980001 AND category='recovery';
 SELECT * INTO STRICT basic_line FROM erp_private.t14_lines
 WHERE version_id=approved_version AND employee_id=980001 AND category='basic';
 case_id:=(deduction_line.source->>'case')::bigint;
 original_balance:=(erp_private.t13_financial_summary(case_id)->>'outstanding')::numeric;
 IF erp_private.t16_batch_state(package)<>'accepted'
    OR erp_private.t16_result_status(package,980001)->>'status'<>'unpaid'
    OR first_employee.net<=part OR basic_line.amount<=part
    OR has_table_privilege('authenticated','erp_private.t16_payment_events','SELECT')
    OR has_table_privilege('service_role','erp_private.t16_payment_allocations','INSERT')
    OR has_function_privilege('anon','public.t16_payroll_payment_command(uuid,bigint,bigint,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Retained file issuance must leave employee cash unpaid and private'; END IF;
 inputs:=jsonb_build_object('batch',package,'employee',980001,'channel','wps','reference','T16-SHARED-RECEIPT-1201',
    'amount','0','currency','AED','paid_on','2026-11-19','outcome','pending')||pg_temp.t16_proof(998603);
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',inputs);
   RAISE EXCEPTION 'Issue-only actor reconciled cash'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(5);
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',inputs);
   RAISE EXCEPTION 'Linked subject reconciled own salary'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920012,'receipt',inputs);
   RAISE EXCEPTION 'Sibling scope viewed an employee payment'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(9);
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920002,920021,'receipt',inputs);
   RAISE EXCEPTION 'Foreign company scope viewed an employee payment'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',inputs||pg_temp.t16_proof(998606));
   RAISE EXCEPTION 'Sibling branch finance slip accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',inputs||jsonb_build_object('channel','cheque'));
   RAISE EXCEPTION 'An employee was reconciled outside the approved channel'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 operation:=gen_random_uuid();
 receipt:=public.t16_payroll_payment_command(operation,920001,920011,'receipt',inputs);
 first_payment:=(receipt->>'payment')::uuid;
 IF receipt->>'state'<>'pending' THEN RAISE EXCEPTION 'Pending outcome recorded cash'; END IF;
 IF NOT (public.t16_payroll_payment_command(operation,920001,920011,'receipt',inputs)->>'replayed')::boolean THEN
   RAISE EXCEPTION 'Exact pending payment retry lost its receipt';
 END IF;
 BEGIN
   PERFORM public.t16_payroll_payment_command(operation,920001,920011,'receipt',inputs||jsonb_build_object('outcome','rejected'));
   RAISE EXCEPTION 'Changed payment retry was accepted'; EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
 END;

 inputs:=inputs||jsonb_build_object('amount',part::text,'outcome','partial');
 operation:=gen_random_uuid();
 receipt:=public.t16_payroll_payment_command(operation,920001,920011,'receipt',inputs);
 IF (receipt->>'payment')::uuid IS DISTINCT FROM first_payment OR receipt->>'state'<>'partial'
    OR (public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',inputs)->>'payment')::uuid
       IS DISTINCT FROM first_payment
 THEN RAISE EXCEPTION 'Natural and operation retries must retain the same reference and confirmed payment'; END IF;
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
      inputs||jsonb_build_object('amount',first_employee.net::text,'outcome','paid','reference','T16-EXCESS-1201'));
   RAISE EXCEPTION 'Cash beyond the approved remainder was accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
      inputs||jsonb_build_object('reference','T16-ALTERED-PAYMENT-1201'));
   RAISE EXCEPTION 'A changed reference reused the same verified cash proof'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 -- The same batch transfer evidence may cover two employees. Each is matched
 -- to its own amount and employee-level receipt.
 receipt:=public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
   inputs||jsonb_build_object('employee',980002,'amount',second_employee.net::text,'outcome','paid'));
 second_payment:=(receipt->>'payment')::uuid;
 IF second_payment IS NOT DISTINCT FROM first_payment THEN RAISE EXCEPTION 'Shared evidence lost its per-employee identity'; END IF;
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'allocate',
     jsonb_build_object('batch',package,'payment',second_payment,'revision',0,
       'lines',jsonb_build_array(jsonb_build_object('line',basic_line.id,'amount',100))));
   RAISE EXCEPTION 'Another employee’s line was accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'allocate',
     jsonb_build_object('batch',package,'payment',first_payment,'revision',0,'reason','Net-only bank slip',
       'lines',jsonb_build_array(jsonb_build_object('line',basic_line.id,'amount',part+1),
         jsonb_build_object('line',deduction_line.id,'amount',1)))||pg_temp.t16_proof(998603));
   RAISE EXCEPTION 'Net-only partial cash proved a recovery deduction'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 inputs:=jsonb_build_object('batch',package,'payment',first_payment,'revision',0,
   'lines',jsonb_build_array(jsonb_build_object('line',basic_line.id,'amount',part::text)));
 operation:=gen_random_uuid();
 receipt:=public.t16_payroll_payment_command(operation,920001,920011,'allocate',inputs);
 IF receipt->>'revision'<>'1' OR NOT (public.t16_payroll_payment_command(operation,920001,920011,'allocate',inputs)->>'replayed')::boolean
   THEN RAISE EXCEPTION 'A repeated allocation changed its revision or claimed another amount'; END IF;
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'allocate',inputs);
   RAISE EXCEPTION 'A stale allocation revision created a duplicate'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 RESET ROLE;
 IF erp_private.t16_result_status(package,980001)->>'status'<>'partial'
    OR (erp_private.t16_result_status(package,980001)->>'applied_deductions')::numeric<>0
    OR (erp_private.t13_financial_summary(case_id)->>'outstanding')::numeric<>original_balance
 THEN RAISE EXCEPTION 'Partial cash altered the outstanding recovery'; END IF;

 FOR verified_actual IN SELECT amount FROM (VALUES (0::numeric),(least(20,deduction_line.amount-.01))) v(amount) LOOP
   BEGIN
     disposition_lines:=CASE WHEN verified_actual=0 THEN '[]'::jsonb ELSE jsonb_build_array(
       jsonb_build_object('line',basic_line.id,'amount',verified_actual::text),
       jsonb_build_object('line',deduction_line.id,'amount',verified_actual::text)) END;
     inputs:=jsonb_build_object('batch',package,'payment',first_payment,'revision',1,
       'lines',disposition_lines,'close_recoveries',jsonb_build_array(
         jsonb_build_object('line',deduction_line.id,'amount',verified_actual::text)),
       'reason','Verified final amount and approved review of the remaining balance');
     SET LOCAL ROLE authenticated;
     PERFORM pg_temp.t06_actor(3);
     BEGIN
       PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'allocate',inputs||pg_temp.t16_proof(998603));
       RAISE EXCEPTION 'A net-only slip closed a recovery shortfall'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
     END;
     operation:=gen_random_uuid();
     receipt:=public.t16_payroll_payment_command(operation,920001,920011,'allocate',inputs||pg_temp.t16_proof(998604));
     IF receipt->>'revision'<>'2'
        OR NOT (public.t16_payroll_payment_command(operation,920001,920011,'allocate',inputs||pg_temp.t16_proof(998604))->>'replayed')::boolean
     THEN RAISE EXCEPTION 'Final amount retry changed the recovery disposition'; END IF;
     RESET ROLE;
     IF (erp_private.t13_financial_summary(case_id)->>'outstanding')::numeric<>original_balance-verified_actual
        OR NOT erp_private.t15_recovery_closed(deduction_line.id)
        OR erp_private.t15_recovery_conflict(case_id,'2026-12-01',gen_random_uuid())
     THEN RAISE EXCEPTION 'Evidence did not close the exact collected amount and unblock the remaining balance'; END IF;

     SET LOCAL ROLE authenticated;
     PERFORM pg_temp.t06_actor(3);
     PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'reverse',
       jsonb_build_object('batch',package,'payment',first_payment,'revision',2,'reason','Linked reversal of partial wage payment')
          ||pg_temp.t16_proof(998605));
     RESET ROLE;
     IF (erp_private.t13_financial_summary(case_id)->>'outstanding')::numeric<>original_balance
        OR erp_private.t15_recovery_closed(deduction_line.id)
        OR NOT erp_private.t15_recovery_conflict(case_id,'2026-12-01',gen_random_uuid())
     THEN RAISE EXCEPTION 'Reversing the supporting payment did not reopen its exact recovery disposition'; END IF;
     RAISE EXCEPTION 'Rollback independent shortfall scenario' USING ERRCODE='P1616';
   EXCEPTION WHEN SQLSTATE 'P1616' THEN NULL;
   END;
 END LOOP;

 SELECT jsonb_agg(jsonb_build_object('line',l.id,'amount',(l.amount-CASE WHEN l.id=basic_line.id THEN part ELSE 0 END)::text)
   ORDER BY l.id) INTO remaining_lines FROM erp_private.t14_lines l
 WHERE l.version_id=approved_version AND l.employee_id=980001 AND l.amount>0;
 SELECT jsonb_agg(jsonb_build_object('line',l.id,'amount',l.amount::text) ORDER BY l.id)
 INTO second_lines FROM erp_private.t14_lines l WHERE l.version_id=approved_version AND l.employee_id=980002 AND l.amount>0;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 inputs:=jsonb_build_object('batch',package,'employee',980001,'channel','wps','reference','T16-LATER-PAYMENT-1202',
   'amount',(first_employee.net-part)::text,'currency','AED','paid_on','2026-11-19','outcome','paid')||pg_temp.t16_proof(998609);
 receipt:=public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
   inputs||jsonb_build_object('reference','T16-REJECTED-DELIVERY-1202','outcome','rejected','amount','0')||pg_temp.t16_proof(998610));
 IF receipt->>'state'<>'rejected' THEN RAISE EXCEPTION 'A documented rejection did not retain its distinct outcome'; END IF;
 remaining_payment:=(public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',inputs)->>'payment')::uuid;
 RESET ROLE;
 IF erp_private.t16_result_status(package,980001)->>'status'<>'paid-unallocated'
    OR (erp_private.t13_financial_summary(case_id)->>'outstanding')::numeric<>original_balance
 THEN RAISE EXCEPTION 'A net receipt inferred a deduction or complete allocation'; END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'allocate',jsonb_build_object('batch',package,
   'payment',second_payment,'revision',0,'lines',second_lines,'reason','Reviewed exact wage rows')||pg_temp.t16_proof(998604));
 receipt:=public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'allocate',jsonb_build_object('batch',package,
   'payment',remaining_payment,'revision',0,'lines',remaining_lines,'reason','Verified wage and recovery allocations')||pg_temp.t16_proof(998604));
 RESET ROLE;
 IF receipt->>'revision'<>'1'
    OR erp_private.t16_result_status(package,980001)->>'status'<>'reconciled'
    OR erp_private.t16_result_status(package,980002)->>'status'<>'reconciled'
    OR (erp_private.t13_financial_summary(case_id)->>'outstanding')::numeric<>original_balance-deduction_line.amount
    OR NOT erp_private.t15_recovery_closed(deduction_line.id)
 THEN RAISE EXCEPTION 'Exact verified allocation did not settle both employee and T13 balances'; END IF;
 history:=erp_private.t16_payment_history(package,980001);
 IF history::text ~ 'T16-(SHARED|LATER)|998603|998609|sha256'
    OR jsonb_array_length(history)<>3
    OR (SELECT count(*) FROM erp_private.t16_payment_events WHERE payment_id=first_payment)<>2
 THEN RAISE EXCEPTION 'Masked history exposed evidence or duplicated the pending/partial outcome'; END IF;
 SELECT r.*,a.pin_id INTO STRICT linked_recovery FROM erp_private.t16_recovery_links r
 JOIN erp_private.t13_allocations a ON a.id=r.recovery_allocation_id;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t13_recovery_reverse(gen_random_uuid(),linked_recovery.recovery_allocation_id,1,'Bypass payroll reversal');
   RAISE EXCEPTION 'A canonical recovery reversal bypassed the linked payroll correction'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 operation:=gen_random_uuid();
 reversal_inputs:=jsonb_build_object('batch',package,'payment',remaining_payment,'revision',1,
   'reason','Verified bank settlement reversal')||pg_temp.t16_proof(998605);
 receipt:=public.t16_payroll_payment_command(operation,920001,920011,'reverse',reversal_inputs);
 IF receipt->>'state'<>'reversed'
    OR NOT (public.t16_payroll_payment_command(operation,920001,920011,'reverse',reversal_inputs)->>'replayed')::boolean
 THEN RAISE EXCEPTION 'Exact linked reversal was not idempotent'; END IF;
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'reverse',reversal_inputs);
   RAISE EXCEPTION 'A fresh operation reversed the same payment twice'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 RESET ROLE;
 IF erp_private.t16_result_status(package,980001)->>'status'<>'partial'
    OR (erp_private.t16_result_status(package,980001)->>'verified_cash')::numeric<>part
    OR (erp_private.t13_financial_summary(case_id)->>'outstanding')::numeric<>original_balance
    OR (erp_private.t13_financial_summary(case_id)->>'unallocated_deduction')::numeric<>0
    OR erp_private.t15_recovery_closed(deduction_line.id) OR erp_private.t15_bank_state(approved_review)<>'reversed'
 THEN RAISE EXCEPTION 'Linked reversal did not restore exact employee and canonical recovery balances'; END IF;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 corrected_payment:=(public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
   inputs||jsonb_build_object('reference','T16-CORRECTED-PAYMENT-1203')||pg_temp.t16_proof(998611))->>'payment')::uuid;
 PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'allocate',jsonb_build_object('batch',package,
   'payment',corrected_payment,'revision',0,'lines',remaining_lines,'reason','Reconcile corrected verified payment')||pg_temp.t16_proof(998604));
 RESET ROLE;
 IF erp_private.t16_result_status(package,980001)->>'status'<>'reconciled'
   OR (erp_private.t13_financial_summary(case_id)->>'outstanding')::numeric<>original_balance-deduction_line.amount
   OR NOT erp_private.t15_recovery_closed(deduction_line.id)
 THEN RAISE EXCEPTION 'Corrected cash failed to reapply exact outstanding balance'; END IF;
END $$;
SELECT 'PASS: signed employee payments, shared slip, pending, rejected and partial, exact line and T13 recovery allocation and evidenced zero/partial carry, permissions, safe retries, full reversal and corrected receipt.';
\endif
