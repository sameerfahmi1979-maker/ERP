-- ERP HR.3 — Align employee_medical_insurances with compliance UI / server actions
-- Live DB was created with an older shape (effective_date, no dependent_count_covered / renewal_status).
-- App expects: issue_date, dependent_count_covered, renewal_status (per 20260618210000).

-- issue_date (legacy live column may be effective_date)
ALTER TABLE employee_medical_insurances
  ADD COLUMN IF NOT EXISTS issue_date DATE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employee_medical_insurances'
      AND column_name = 'effective_date'
  ) THEN
    UPDATE employee_medical_insurances
    SET issue_date = effective_date
    WHERE issue_date IS NULL AND effective_date IS NOT NULL;
  END IF;
END $$;

-- dependent count on policy
ALTER TABLE employee_medical_insurances
  ADD COLUMN IF NOT EXISTS dependent_count_covered INT;

COMMENT ON COLUMN employee_medical_insurances.dependent_count_covered IS
  'Number of dependents covered under this medical insurance policy';

-- renewal workflow status
ALTER TABLE employee_medical_insurances
  ADD COLUMN IF NOT EXISTS renewal_status TEXT;

UPDATE employee_medical_insurances
SET renewal_status = 'pending'
WHERE renewal_status IS NULL;

ALTER TABLE employee_medical_insurances
  ALTER COLUMN renewal_status SET DEFAULT 'pending';

ALTER TABLE employee_medical_insurances
  ALTER COLUMN renewal_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employee_medical_insurances_renewal_status_check'
  ) THEN
    ALTER TABLE employee_medical_insurances
      ADD CONSTRAINT employee_medical_insurances_renewal_status_check
      CHECK (renewal_status IN ('not_required', 'pending', 'in_progress', 'complete'));
  END IF;
END $$;
