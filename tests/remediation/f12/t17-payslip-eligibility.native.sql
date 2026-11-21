
DO $$
DECLARE selected uuid:=current_setting('erp.t16_batch')::uuid; paid_request jsonb;
BEGIN
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
   PERFORM public.t17_issue_prepare(gen_random_uuid(),selected,980001);
   RAISE EXCEPTION 'T17 issued after bank acceptance without verified employee cash';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(3);
 paid_request:=jsonb_build_object('batch',selected,'employee',980001,'channel','wps','reference','T17-ONLY-PROOF',
    'amount','0.00','currency','AED','paid_on','2026-11-15','outcome','pending')||pg_temp.t16_proof(998612);
 BEGIN
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',paid_request);
   PERFORM pg_temp.t06_actor(2);
   BEGIN
     PERFORM public.t17_issue_prepare(gen_random_uuid(),selected,980001);
     RAISE EXCEPTION 'T17 issued a pending employee payslip'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
   END;
   PERFORM pg_temp.t06_actor(3);
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
     paid_request||'{"amount":"100.00","outcome":"partial"}');
   PERFORM pg_temp.t06_actor(2);
   BEGIN
     PERFORM public.t17_issue_prepare(gen_random_uuid(),selected,980001);
     RAISE EXCEPTION 'T17 issued a partial employee payslip'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
   END;
   RAISE EXCEPTION USING ERRCODE='T1701',MESSAGE='Rollback pending/partial test';
 EXCEPTION WHEN SQLSTATE 'T1701' THEN NULL;
 END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 IF EXISTS (SELECT 1 FROM erp_private.t17_slips) THEN RAISE EXCEPTION 'An unpaid or partial order retained an issuance'; END IF;
 RAISE NOTICE 'PASS: accepted file, pending bank line and net-only partial pay cannot prepare a payslip';
END $$;
