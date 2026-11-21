-- Prepend the guarded T07 synthetic fixture setup, before authenticated use.
DO $$
DECLARE signature text; api_role text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'erp_private.t13_payroll_pin(bigint,text,bigint,date,uuid,uuid,uuid,bigint,numeric,numeric,text)',
    'erp_private.t13_payroll_receipt(uuid,bigint,date,uuid,uuid,uuid,bigint,numeric,text,text,uuid,boolean)',
    'erp_private.t13_settlement_balance(bigint)',
    'erp_private.t13_refund_capacity(bigint)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'Missing trusted T13 ledger function %', signature;
    END IF;
    FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(api_role,signature,'EXECUTE') THEN
        RAISE EXCEPTION '% can execute trusted T13 ledger function %', api_role, signature;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'erp_private.t13_payroll_pins','erp_private.t13_receipts','erp_private.t13_allocations'
  ] LOOP
    FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(api_role,signature,'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
        RAISE EXCEPTION '% can access private T13 ledger table %', api_role, signature;
      END IF;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
  ('t13_test_settlement_accounts','Synthetic independent Accounts',false),
  ('t13_test_settlement_payroll','Synthetic payroll view',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r JOIN public.permissions p ON
  (r.role_code='t13_test_settlement_accounts' AND p.permission_code='hr.recovery.accounts') OR
  (r.role_code='t13_test_settlement_payroll' AND p.permission_code='hr.payroll.view');

CREATE FUNCTION pg_temp.t13_settlement_profile(p_actor int)
RETURNS bigint LANGUAGE sql AS $$
  SELECT id FROM public.user_profiles WHERE auth_user_id=('98000000-0000-4000-8000-'||lpad(p_actor::text,12,'0'))::uuid;
$$;

INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t13_settlement_profile(g.actor),r.id,g.company_id,g.branch_id,true
FROM (VALUES
  (2,'accounts',920001,920011),(2,'payroll',920001,920011),
  (3,'accounts',920001,920011),(3,'payroll',920002,920021),
  (4,'accounts',920001,920011),(4,'accounts',920002,920021),(4,'payroll',920002,920021),
  (6,'accounts',920001,920012),(6,'payroll',920001,920012),
  (7,'accounts',920001,920011),(7,'payroll',920001,920011),
  (9,'accounts',920001,920011),(9,'accounts',920002,920021),(9,'payroll',920002,920021)
) g(actor,role_code,company_id,branch_id) JOIN public.roles r ON r.role_code='t13_test_settlement_'||g.role_code;
INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id,linked_by)
VALUES (pg_temp.t13_settlement_profile(9),980003,pg_temp.t13_settlement_profile(4));

-- Only the eligibility input is synthetic here. The separate recovery tests
-- exercise the real HR policy, evidence, Accounts proposal and carry workflow.
CREATE TEMP TABLE t13_ledger_proposals(
  case_id bigint,kind text,source_id bigint,schedule_id bigint,amount numeric,digest text,
  PRIMARY KEY (case_id,kind)
) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION erp_private.t13_payroll_proposal(p_case bigint,p_month date,p_kind text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('status','ready','case_id',case_id,'kind',kind,'source_id',source_id,
    'schedule_id',schedule_id,'month',p_month,'amount',amount,'currency','AED','digest',digest)
  FROM pg_temp.t13_ledger_proposals WHERE case_id=p_case AND kind=p_kind;
$$;

CREATE FUNCTION pg_temp.t13_seed_settlement(p_employee bigint,p_reference text)
RETURNS TABLE(case_id bigint,schedule_id bigint,reconciliation_id bigint) LANGUAGE plpgsql AS $$
DECLARE
  employment erp_private.t03_employment_periods;
  proof_id bigint;
  review_id bigint;
BEGIN
  SELECT * INTO STRICT employment FROM erp_private.t03_employment_periods WHERE employee_id=p_employee;
  INSERT INTO erp_private.t13_cases(source_kind,company_id,branch_id,asset_id,occurred_at,source_amount,currency,source_status,
    subject_status,employee_id,employment_id,employer_company_id,employer_branch_id,authority_key,reference_key,reported_by)
  VALUES ('fine',920001,920011,980101,'2026-03-10 10:15+04',150,'AED','reported','verified',p_employee,employment.id,
    employment.company_id,employment.branch_id,'T13-SETTLEMENT-FIXTURE',p_reference,pg_temp.t13_settlement_profile(1))
  RETURNING id INTO case_id;
  INSERT INTO erp_private.t13_recovery_proofs(case_id,document_id,version_id,file_id) VALUES(case_id,980101,980101,980101)
  RETURNING id INTO proof_id;
  INSERT INTO erp_private.t13_hr_reviews(case_id,source_digest,decision,ceiling,reviewed_by,reason)
  VALUES(case_id,repeat('a',64),'unresolved',0,pg_temp.t13_settlement_profile(5),'Synthetic ledger eligibility stub')
  RETURNING id INTO review_id;
  INSERT INTO erp_private.t13_reconciliations(case_id,hr_review_id,source_digest,actual_cost,evidence_id,checked_by,reason)
  VALUES(case_id,review_id,repeat('a',64),150,proof_id,pg_temp.t13_settlement_profile(2),'Synthetic financial evidence')
  RETURNING id INTO reconciliation_id;
  INSERT INTO erp_private.t13_schedules(case_id,hr_review_id,reconciliation_id,mode,principal,prepared_by,reason)
  VALUES(case_id,review_id,reconciliation_id,'instalments',90,pg_temp.t13_settlement_profile(2),'Synthetic schedule')
  RETURNING id INTO schedule_id;
  INSERT INTO pg_temp.t13_ledger_proposals VALUES(case_id,'deduction',schedule_id,schedule_id,90,repeat('a',64));
  RETURN NEXT;
END $$;

DO $$
DECLARE
  own record;
  different_payer record;
  gm bigint:=pg_temp.t13_settlement_profile(7);
  same_run uuid:=pg_temp.t06_op(13000);
  line uuid:=pg_temp.t06_op(13001);
  approval uuid:=pg_temp.t06_op(13002);
  receipt_nonce uuid:=pg_temp.t06_op(13003);
  evidence uuid:=pg_temp.t06_op(13004);
  allocation_nonce uuid:=pg_temp.t06_op(13005);
  reversal_nonce uuid:=pg_temp.t06_op(13006);
  cross_line uuid:=pg_temp.t06_op(13007);
  refund_line uuid:=pg_temp.t06_op(13008);
  mar date:='2026-03-01';
  apr date:='2026-04-01';
  may date:='2026-05-01';
  pin bigint;
  cross_pin bigint;
  refund_pin bigint;
  original_receipt bigint;
  final_receipt bigint;
  correct_receipt bigint;
  original_allocation bigint;
  reversal bigint;
  refund bigint;
  withdrawn_refund bigint;
  result jsonb;
  state jsonb;
  actor int;
BEGIN
  SELECT * INTO own FROM pg_temp.t13_seed_settlement(980001,'INDEPENDENT-PAYROLL');
  SELECT * INTO different_payer FROM pg_temp.t13_seed_settlement(980003,'HISTORICAL-PAYER');
  BEGIN
    PERFORM erp_private.t13_payroll_pin(own.case_id,'deduction',own.schedule_id,mar,same_run,line,approval,gm,75,80,repeat('b',64));
    RAISE EXCEPTION 'Stale proposal digest was pinned';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM erp_private.t13_payroll_pin(own.case_id,'deduction',own.schedule_id,mar,same_run,line,approval,gm,81,80,repeat('a',64));
    RAISE EXCEPTION 'Pin exceeded exact headroom';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM erp_private.t13_payroll_pin(own.case_id,'deduction',own.schedule_id,mar,same_run,line,approval,gm,91,100,repeat('a',64));
    RAISE EXCEPTION 'Pin exceeded exact proposal';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  pin:=erp_private.t13_payroll_pin(own.case_id,'deduction',own.schedule_id,mar,same_run,line,approval,gm,75,80,repeat('a',64));
  IF pin IS DISTINCT FROM erp_private.t13_payroll_pin(own.case_id,'deduction',own.schedule_id,mar,same_run,line,approval,gm,75,80,repeat('a',64)) THEN
    RAISE EXCEPTION 'Exact T15 pin replay differed';
  END IF;
  BEGIN
    PERFORM erp_private.t13_payroll_pin(own.case_id,'deduction',own.schedule_id,mar,same_run,line,gen_random_uuid(),gm,75,80,repeat('a',64));
    RAISE EXCEPTION 'Line replay replaced GM approval';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM erp_private.t13_payroll_pin(own.case_id,'deduction',own.schedule_id,apr,same_run,gen_random_uuid(),approval,gm,75,80,repeat('a',64));
    RAISE EXCEPTION 'An in-flight prior approval allowed a second deduction';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM erp_private.t13_payroll_receipt(receipt_nonce,pin,apr,same_run,line,approval,own.schedule_id,45,'AED','BANK-ONE',evidence,false);
    RAISE EXCEPTION 'Receipt was admitted against the wrong payroll month';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM erp_private.t13_payroll_receipt(receipt_nonce,pin,mar,same_run,gen_random_uuid(),approval,own.schedule_id,45,'AED','BANK-ONE',evidence,false);
    RAISE EXCEPTION 'Receipt was admitted against the wrong approved line';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  original_receipt:=erp_private.t13_payroll_receipt(receipt_nonce,pin,mar,same_run,line,approval,own.schedule_id,45,'AED','BANK-ONE',evidence,false);
  IF original_receipt IS DISTINCT FROM erp_private.t13_payroll_receipt(receipt_nonce,pin,mar,same_run,line,approval,own.schedule_id,45,'AED','BANK-ONE',evidence,false) THEN
    RAISE EXCEPTION 'Identical receipt replay posted twice';
  END IF;
  BEGIN
    PERFORM erp_private.t13_payroll_receipt(receipt_nonce,pin,mar,same_run,line,approval,own.schedule_id,46,'AED','BANK-ONE',evidence,false);
    RAISE EXCEPTION 'Receipt replay accepted a changed amount';
  EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
  END;

  SET LOCAL ROLE authenticated;
  FOREACH actor IN ARRAY ARRAY[6,7,8] LOOP
    PERFORM pg_temp.t06_actor(actor);
    BEGIN
      PERFORM public.t13_recovery_allocate(gen_random_uuid(),original_receipt,pin,own.schedule_id,mar,line,40,'Denied allocation');
      RAISE EXCEPTION 'Unauthorized actor % allocated statutory payroll cash',actor;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  PERFORM pg_temp.t06_actor(2);
  BEGIN
    PERFORM public.t13_recovery_allocate(gen_random_uuid(),original_receipt,pin,different_payer.schedule_id,mar,line,40,'Wrong schedule');
    RAISE EXCEPTION 'Wrong schedule was allocated';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  result:=public.t13_recovery_allocate(allocation_nonce,original_receipt,pin,own.schedule_id,mar,line,40,'Allocate first partial receipt');
  original_allocation:=(result->>'id')::bigint;
  IF NOT result @> '{"replayed":false,"unallocated":5}' OR
     NOT public.t13_recovery_allocate(allocation_nonce,original_receipt,pin,own.schedule_id,mar,line,40,'Allocate first partial receipt')
       @> jsonb_build_object('id',original_allocation,'replayed',true) THEN
    RAISE EXCEPTION 'First allocation or replay balance was incorrect';
  END IF;
  BEGIN
    PERFORM public.t13_recovery_allocate(allocation_nonce,original_receipt,pin,own.schedule_id,mar,line,41,'Allocate first partial receipt');
    RAISE EXCEPTION 'Allocation replay accepted a changed amount';
  EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
  END;
  BEGIN
    PERFORM public.t13_recovery_allocate(gen_random_uuid(),original_receipt,pin,own.schedule_id,mar,line,6,'Exceeds remaining cash');
    RAISE EXCEPTION 'Over-allocation used cash from a different receipt';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  RESET ROLE;
  state:=erp_private.t13_settlement_balance(own.case_id);
  IF NOT state @> '{"actual_deduction":45,"allocated_deduction":40,"pending_deduction":35,"unallocated_deduction":5,"has_open_deduction":true}' THEN
    RAISE EXCEPTION 'An open partial receipt lost distinct balances: %',state;
  END IF;
  final_receipt:=erp_private.t13_payroll_receipt(gen_random_uuid(),pin,mar,same_run,line,approval,own.schedule_id,50,'AED','BANK-TWO',evidence,true);
  BEGIN
    PERFORM erp_private.t13_payroll_receipt(gen_random_uuid(),pin,mar,same_run,line,approval,own.schedule_id,1,'AED','BANK-LATE',evidence,true);
    RAISE EXCEPTION 'Final verified line accepted another receipt';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  BEGIN
    PERFORM public.t13_recovery_allocate(gen_random_uuid(),final_receipt,pin,own.schedule_id,mar,line,36,'Exceeds approved line');
    RAISE EXCEPTION 'Actual receipt increased the approved deduction';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  PERFORM public.t13_recovery_allocate(gen_random_uuid(),final_receipt,pin,own.schedule_id,mar,line,35,'Allocate approved balance');
  result:=public.t13_recovery_reverse(reversal_nonce,original_allocation,10,'Correct part of first allocation');
  reversal:=(result->>'id')::bigint;
  IF NOT public.t13_recovery_reverse(reversal_nonce,original_allocation,10,'Correct part of first allocation')
     @> jsonb_build_object('id',reversal,'reverses_allocation_id',original_allocation,'replayed',true) THEN
    RAISE EXCEPTION 'Reversal retry created a second correction';
  END IF;
  BEGIN
    PERFORM public.t13_recovery_reverse(gen_random_uuid(),reversal,1,'Attempt to reverse a reversal');
    RAISE EXCEPTION 'Nested reversal was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.t13_recovery_reverse(gen_random_uuid(),original_allocation,31,'Exceeds original allocated cash');
    RAISE EXCEPTION 'Reversal exceeded the remaining original allocation';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  RESET ROLE;
  state:=erp_private.t13_settlement_balance(own.case_id);
  IF NOT state @> '{"actual_deduction":95,"allocated_deduction":65,"pending_deduction":0,"unallocated_deduction":30,"latest_paid_month":"2026-03-01","has_open_deduction":false}' THEN
    RAISE EXCEPTION 'A linked reversal changed actual cash or lost excess: %',state;
  END IF;
  IF erp_private.t13_refund_capacity(original_allocation) IS DISTINCT FROM 30
     OR erp_private.t13_refund_capacity(reversal) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Original settlement and reversal refund capacities are incorrect';
  END IF;

  BEGIN
    UPDATE erp_private.t13_payroll_pins SET approved_amount=50 WHERE id=pin;
    RAISE EXCEPTION 'Original approval pin was mutable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM erp_private.t13_receipts WHERE id=final_receipt;
    RAISE EXCEPTION 'Verified cash receipt could be deleted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE erp_private.t13_allocations SET amount=1 WHERE id=reversal;
    RAISE EXCEPTION 'Linked movement was mutable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO erp_private.t13_refunds(case_id,schedule_id,original_allocation_id,reconciliation_id,amount,first_month,prepared_by,reason)
  VALUES(own.case_id,own.schedule_id,original_allocation,own.reconciliation_id,12,apr,pg_temp.t13_settlement_profile(2),'Synthetic linked refund')
  RETURNING id INTO refund;
  INSERT INTO erp_private.t13_refunds(case_id,schedule_id,original_allocation_id,reconciliation_id,amount,first_month,prepared_by,reason)
  VALUES(own.case_id,own.schedule_id,original_allocation,own.reconciliation_id,5,apr,pg_temp.t13_settlement_profile(2),'Synthetic withdrawn refund')
  RETURNING id INTO withdrawn_refund;
  INSERT INTO erp_private.t13_refund_withdrawals(refund_id,withdrawn_by,reason)
  VALUES(withdrawn_refund,pg_temp.t13_settlement_profile(2),'Withdraw before payroll approval');
  IF erp_private.t13_refund_capacity(original_allocation) IS DISTINCT FROM 18 THEN
    RAISE EXCEPTION 'Original refund capacity included a withdrawn request or missed an active one';
  END IF;
  INSERT INTO pg_temp.t13_ledger_proposals VALUES(own.case_id,'refund',withdrawn_refund,own.schedule_id,5,repeat('c',64));
  BEGIN
    PERFORM erp_private.t13_payroll_pin(own.case_id,'refund',withdrawn_refund,apr,same_run,refund_line,approval,gm,5,5,repeat('c',64));
    RAISE EXCEPTION 'Withdrawn refund entered the payroll history';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  UPDATE pg_temp.t13_ledger_proposals p SET source_id=refund,amount=12,digest=repeat('b',64)
  WHERE p.case_id=own.case_id AND p.kind='refund';
  refund_pin:=erp_private.t13_payroll_pin(own.case_id,'refund',refund,apr,same_run,refund_line,approval,gm,12,12,repeat('b',64));
  correct_receipt:=erp_private.t13_payroll_receipt(gen_random_uuid(),refund_pin,apr,same_run,refund_line,approval,own.schedule_id,5,'AED','BANK-REFUND',evidence,true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  BEGIN
    PERFORM public.t13_recovery_reverse(gen_random_uuid(),original_allocation,19,'Would also refund the correction');
    RAISE EXCEPTION 'Reversal invalidated a linked reserved refund';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  PERFORM public.t13_recovery_allocate(gen_random_uuid(),correct_receipt,refund_pin,own.schedule_id,apr,refund_line,5,'Allocate verified partial refund');
  RESET ROLE;
  state:=erp_private.t13_settlement_balance(own.case_id);
  IF NOT state @> '{"allocated_deduction":65,"actual_deduction":95,"allocated_refund":5,"actual_refund":5,"unallocated_refund":0}' THEN
    RAISE EXCEPTION 'Refund overwrote the original receipt or deduction: %',state;
  END IF;
  INSERT INTO erp_private.t13_refund_withdrawals(refund_id,withdrawn_by,reason)
  VALUES(refund,pg_temp.t13_settlement_profile(2),'Withdraw only the remaining seven');
  IF erp_private.t13_refund_capacity(original_allocation) IS DISTINCT FROM 25 THEN
    RAISE EXCEPTION 'Withdrawal released refund cash already paid or kept the unused reserve';
  END IF;

  cross_pin:=erp_private.t13_payroll_pin(different_payer.case_id,'deduction',different_payer.schedule_id,apr,same_run,cross_line,approval,gm,80,80,repeat('a',64));
  BEGIN
    PERFORM erp_private.t13_payroll_receipt(gen_random_uuid(),cross_pin,apr,same_run,cross_line,approval,different_payer.schedule_id,20,'AED',' bank-one ',evidence,true);
    RAISE EXCEPTION 'Normalized bank reference was reused on another case and line';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM erp_private.t13_payroll_receipt(gen_random_uuid(),cross_pin,apr,same_run,cross_line,approval,different_payer.schedule_id,0,'AED',NULL,evidence,false);
    RAISE EXCEPTION 'Zero intermediate receipt treated as a closeout';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM erp_private.t13_payroll_receipt(gen_random_uuid(),cross_pin,apr,same_run,cross_line,approval,different_payer.schedule_id,0,'AED',NULL,evidence,true);
  state:=erp_private.t13_settlement_balance(different_payer.case_id);
  IF NOT state @> '{"allocated_deduction":0,"pending_deduction":0,"has_open_deduction":false}' THEN
    RAISE EXCEPTION 'Final no-collection did not release the next payroll period: %',state;
  END IF;
  cross_line:=pg_temp.t06_op(13009);
  cross_pin:=erp_private.t13_payroll_pin(different_payer.case_id,'deduction',different_payer.schedule_id,may,same_run,cross_line,approval,gm,90,90,repeat('a',64));
  correct_receipt:=erp_private.t13_payroll_receipt(gen_random_uuid(),cross_pin,may,same_run,cross_line,approval,different_payer.schedule_id,25,'AED','BANK-CROSS',evidence,true);
  SET LOCAL ROLE authenticated;
  FOREACH actor IN ARRAY ARRAY[2,3,9] LOOP
    PERFORM pg_temp.t06_actor(actor);
    BEGIN
      PERFORM public.t13_recovery_allocate(gen_random_uuid(),correct_receipt,cross_pin,different_payer.schedule_id,may,cross_line,25,'Denied cross-scope posting');
      RAISE EXCEPTION 'Actor % lacked separate Accounts and payroll authority or was the employee',actor;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  PERFORM pg_temp.t06_actor(4);
  PERFORM public.t13_recovery_allocate(gen_random_uuid(),correct_receipt,cross_pin,different_payer.schedule_id,may,cross_line,25,'Verified cross-scope posting');
  RESET ROLE;
  state:=erp_private.t13_settlement_balance(different_payer.case_id);
  IF NOT state @> '{"actual_deduction":25,"allocated_deduction":25,"pending_deduction":0,"unallocated_deduction":0,"latest_paid_month":"2026-05-01","has_open_deduction":false}' THEN
    RAISE EXCEPTION 'Final partial payment blocked unpaid carry: %',state;
  END IF;
END $$;

SELECT 'T13 recovery settlement native acceptance passed';
ROLLBACK;
