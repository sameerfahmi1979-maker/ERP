-- Run after verified cash receipts and exact monthly line allocations in T16.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DO $$
DECLARE exit_case erp_private.t18_cases; basis jsonb; status jsonb;
BEGIN
 SELECT * INTO STRICT exit_case FROM erp_private.t18_cases WHERE eos_id=997180;
 status:=erp_private.t18_monthly_payroll_status(exit_case.employment_id,exit_case.employee_id,'2026-11-01');
 basis:=erp_private.t18_pay_basis(exit_case,clock_timestamp());
 IF status->>'state' IS DISTINCT FROM 'settled' OR basis->'salary_claim_months' IS DISTINCT FROM '[]'
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'lines') l WHERE l->>'category' IN ('basic','fleet-overtime'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'issues') i
        WHERE i->>'code' IN ('exit-monthly-salary-coverage-review','exit-work-payment-review'))
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'issues') i
        WHERE i->>'code'='exit-salary-already-settled' AND NOT (i->>'blocking')::boolean) THEN
  RAISE EXCEPTION 'Fully reconciled monthly salary or overtime duplicated or held the exit calculation: % %',status,basis;
 END IF;
 RAISE NOTICE 'T18 fully settled exact monthly salary and overtime stayed outside exit without blocking other earnings';
END $$;
