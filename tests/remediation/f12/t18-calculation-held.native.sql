-- Run after the T16 fixture approves the exact monthly payroll.
DO $$
DECLARE exit_case erp_private.t18_cases; basis jsonb;
BEGIN
 SELECT * INTO STRICT exit_case FROM erp_private.t18_cases WHERE eos_id=997180;
 basis:=erp_private.t18_pay_basis(exit_case,clock_timestamp());
 IF basis->'salary_claim_months' IS DISTINCT FROM '[]'
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'lines') l WHERE l->>'category' IN ('basic','fleet-overtime'))
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'issues') i
        WHERE i->>'code'='exit-monthly-salary-coverage-review' AND (i->>'blocking')::boolean)
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'issues') i
        WHERE i->>'code'='exit-work-payment-review' AND (i->>'blocking')::boolean) THEN
  RAISE EXCEPTION 'Unreconciled monthly salary or overlapping overtime reached exit calculation: %',basis;
 END IF;
 RAISE NOTICE 'T18 held salary and operational claim remained outside final settlement';
END $$;
