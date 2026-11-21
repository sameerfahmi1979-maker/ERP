BEGIN;

CREATE FUNCTION erp_private.fa_recovery_history_owner(p_receipt bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 closure_decision uuid;
 payroll_record record;
 exit_record record;
 pin erp_private.t13_payroll_pins;
 can_reconcile boolean:=false;
BEGIN
 -- WPS and Exit share the final-zero receipt table. Its retained evidence
 -- identifies the payment decision that owns the closure.
 SELECT r.evidence_id INTO closure_decision
 FROM erp_private.t16_recovery_closures c
 JOIN erp_private.t13_receipts r ON r.id=c.receipt_id
 WHERE c.receipt_id=p_receipt;

 SELECT b.company_id,b.branch_id,b.month,b.review_id,p.employee_id,p.id AS payment_id,review.state INTO payroll_record
 FROM (
   SELECT a.decision_id FROM erp_private.t16_recovery_links l
   JOIN erp_private.t16_payment_allocations a ON a.id=l.allocation_id WHERE l.receipt_id=p_receipt
   UNION ALL SELECT closure_decision WHERE closure_decision IS NOT NULL
 ) owner
 JOIN erp_private.t16_allocation_decisions d ON d.id=owner.decision_id
 JOIN erp_private.t16_payments p ON p.id=d.payment_id
 JOIN erp_private.t16_batches b ON b.id=p.batch_id
 JOIN erp_private.t15_reviews review ON review.id=b.review_id;

 IF FOUND THEN
   RETURN jsonb_build_object('kind','payroll','destination',CASE
     WHEN payroll_record.state IN ('approved','superseded') AND
          erp_private.t16_can(payroll_record.company_id,payroll_record.branch_id,'reconcile')
     THEN jsonb_build_object('company',payroll_record.company_id,'branch',payroll_record.branch_id,
       'month',payroll_record.month,'review',payroll_record.review_id,'employee',payroll_record.employee_id,
       'payment',payroll_record.payment_id) END);
 END IF;

 SELECT c.company_id,c.branch_id,c.eos_id,c.employee_id,p.version_id,p.id AS payment_id INTO exit_record
 FROM (
   SELECT a.decision_id FROM erp_private.t18_exit_recovery_links l
   JOIN erp_private.t18_exit_allocations a ON a.id=l.allocation_id WHERE l.receipt_id=p_receipt
   UNION ALL SELECT closure_decision WHERE closure_decision IS NOT NULL
 ) owner
 JOIN erp_private.t18_exit_allocation_decisions d ON d.id=owner.decision_id
 JOIN erp_private.t18_exit_payments p ON p.id=d.payment_id
 JOIN erp_private.t18_versions v ON v.id=p.version_id
 JOIN erp_private.t18_cases c ON c.eos_id=v.eos_id;

 IF FOUND THEN
   RETURN jsonb_build_object('kind','exit','destination',CASE
     WHEN erp_private.t18_can(exit_record.company_id,exit_record.branch_id,'view')
       AND EXISTS(SELECT 1 FROM public.employee_eos_cases e
         JOIN public.employees employee ON employee.id=e.employee_id AND employee.deleted_at IS NULL
         WHERE e.id=exit_record.eos_id AND e.employee_id=exit_record.employee_id AND e.deleted_at IS NULL)
       AND EXISTS(SELECT 1 FROM erp_private.t18_approvals a
         WHERE a.eos_id=exit_record.eos_id AND a.version_id=exit_record.version_id AND a.state='approved')
     THEN jsonb_build_object('company',exit_record.company_id,'branch',exit_record.branch_id,'eos',exit_record.eos_id,
       'payment',exit_record.payment_id) END);
 END IF;

 IF closure_decision IS NOT NULL THEN RETURN jsonb_build_object('kind','settlement'); END IF;

 SELECT p.* INTO pin FROM erp_private.t13_receipts r JOIN erp_private.t13_payroll_pins p ON p.id=r.pin_id
 WHERE r.id=p_receipt;
 BEGIN
   PERFORM erp_private.t13_allocation_actor(pin);
   can_reconcile:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RETURN jsonb_build_object('kind','recovery','can_reconcile',can_reconcile);
END $$;

REVOKE ALL ON FUNCTION erp_private.fa_recovery_history_owner(bigint) FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE
 definition text:=pg_get_functiondef('public.t13_recovery_workspace(bigint,date,bigint,bigint)'::regprocedure);
 receipt_field constant text:='''approved'',p.approved_amount)';
 allocation_field constant text:='''reverses'',a.reverses_allocation_id)';
BEGIN
 IF array_length(string_to_array(definition,receipt_field),1)<>2 OR
    array_length(string_to_array(definition,allocation_field),1)<>2 THEN
   RAISE EXCEPTION 'Expected one recovery receipt and one allocation history projection';
 END IF;
 definition:=replace(definition,receipt_field,
   '''approved'',p.approved_amount,''owner'',erp_private.fa_recovery_history_owner(r.id))');
 definition:=replace(definition,allocation_field,
   '''reverses'',a.reverses_allocation_id,''owner'',erp_private.fa_recovery_history_owner(a.receipt_id))');
 EXECUTE definition;
END $$;

COMMIT;
