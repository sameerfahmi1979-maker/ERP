-- ============================================================
-- ERP HR.5 — Payroll & WPS Readiness
-- Migration: 20260618230000_erp_hr_5_payroll_wps_readiness.sql
-- ============================================================

-- ============================================================
-- 1. employee_payroll_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_payroll_profiles (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id       BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE UNIQUE,
  payroll_group_id  BIGINT REFERENCES hr_payroll_groups(id),
  effective_date    DATE NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'AED',
  payroll_status    TEXT NOT NULL DEFAULT 'active'
                    CHECK (payroll_status IN ('active','hold','inactive','not_configured')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        BIGINT REFERENCES user_profiles(id),
  updated_by        BIGINT REFERENCES user_profiles(id),
  deleted_at        TIMESTAMPTZ,
  deleted_by        BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_payroll_profiles
  BEFORE UPDATE ON employee_payroll_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. employee_salary_components
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_salary_components (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  component_type_id     BIGINT NOT NULL REFERENCES hr_salary_component_types(id),
  amount                NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  effective_from        DATE NOT NULL,
  effective_to          DATE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES user_profiles(id),
  updated_by            BIGINT REFERENCES user_profiles(id),
  deleted_at            TIMESTAMPTZ,
  deleted_by            BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_salary_components
  BEFORE UPDATE ON employee_salary_components
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 3. employee_salary_revisions (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_salary_revisions (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id      BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_date   DATE NOT NULL,
  revision_reason  TEXT,
  old_gross        NUMERIC(12,2),
  new_gross        NUMERIC(12,2),
  approved_by      BIGINT REFERENCES user_profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       BIGINT REFERENCES user_profiles(id)
);
-- No updated_at trigger — append-only

-- ============================================================
-- 4. employee_payroll_holds
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_payroll_holds (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  hold_reason  TEXT NOT NULL,
  hold_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  release_date DATE,
  released_by  BIGINT REFERENCES user_profiles(id),
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   BIGINT REFERENCES user_profiles(id),
  updated_by   BIGINT REFERENCES user_profiles(id),
  deleted_at   TIMESTAMPTZ,
  deleted_by   BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_payroll_holds
  BEFORE UPDATE ON employee_payroll_holds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 5. employee_wps_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_wps_profiles (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id              BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE UNIQUE,
  wps_applicable           BOOLEAN NOT NULL DEFAULT TRUE,
  wps_status               TEXT NOT NULL DEFAULT 'active'
                           CHECK (wps_status IN ('active','hold','exempt','not_enrolled')),
  bank_id                  BIGINT REFERENCES banks(id),
  account_holder_name      TEXT,
  account_number           TEXT,
  iban                     TEXT,
  exchange_house           TEXT,
  salary_payment_method    TEXT NOT NULL DEFAULT 'bank_transfer'
                           CHECK (salary_payment_method IN ('bank_transfer','exchange_house','cheque')),
  labour_card_number       TEXT,
  mohre_person_code        TEXT,
  mohre_establishment_id   BIGINT REFERENCES hr_mohre_establishments(id),
  salary_effective_date    DATE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               BIGINT REFERENCES user_profiles(id),
  updated_by               BIGINT REFERENCES user_profiles(id),
  deleted_at               TIMESTAMPTZ,
  deleted_by               BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_wps_profiles
  BEFORE UPDATE ON employee_wps_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

-- Payroll profiles
CREATE INDEX IF NOT EXISTS idx_emp_payroll_profiles_employee
  ON employee_payroll_profiles (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_payroll_profiles_group
  ON employee_payroll_profiles (payroll_group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_payroll_profiles_status
  ON employee_payroll_profiles (payroll_status) WHERE deleted_at IS NULL;

-- Salary components
CREATE INDEX IF NOT EXISTS idx_emp_salary_components_employee
  ON employee_salary_components (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_salary_components_type
  ON employee_salary_components (component_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_salary_components_effective
  ON employee_salary_components (effective_from, effective_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_salary_components_active
  ON employee_salary_components (employee_id, is_active) WHERE deleted_at IS NULL;

-- Salary revisions
CREATE INDEX IF NOT EXISTS idx_emp_salary_revisions_employee
  ON employee_salary_revisions (employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_salary_revisions_effective
  ON employee_salary_revisions (employee_id, effective_date);

-- Payroll holds
CREATE INDEX IF NOT EXISTS idx_emp_payroll_holds_employee
  ON employee_payroll_holds (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_payroll_holds_active
  ON employee_payroll_holds (employee_id, is_active) WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_emp_payroll_holds_hold_date
  ON employee_payroll_holds (hold_date) WHERE deleted_at IS NULL;

-- WPS profiles
CREATE INDEX IF NOT EXISTS idx_emp_wps_profiles_employee
  ON employee_wps_profiles (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_wps_profiles_status
  ON employee_wps_profiles (wps_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_wps_profiles_bank
  ON employee_wps_profiles (bank_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_wps_profiles_mohre
  ON employee_wps_profiles (mohre_establishment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_wps_profiles_wps_applicable
  ON employee_wps_profiles (wps_applicable) WHERE deleted_at IS NULL;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE employee_payroll_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_payroll_profiles    FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_components   ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_components   FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_revisions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_revisions    FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_payroll_holds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_payroll_holds       FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_wps_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_wps_profiles        FORCE ROW LEVEL SECURITY;

-- ============================================================
-- Payroll RLS helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION current_user_can_view_employee_payroll(p_employee_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT current_user_can_view_employee(p_employee_id)
    AND current_user_has_permission('hr.payroll.view')
$$;

CREATE OR REPLACE FUNCTION current_user_can_manage_employee_payroll(p_employee_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT current_user_can_manage_employee(p_employee_id)
    AND current_user_has_permission('hr.payroll.manage')
$$;

-- ============================================================
-- RLS Policies — employee_payroll_profiles
-- ============================================================

CREATE POLICY emp_payroll_profile_select ON employee_payroll_profiles
  FOR SELECT USING (current_user_can_view_employee_payroll(employee_id));

CREATE POLICY emp_payroll_profile_insert ON employee_payroll_profiles
  FOR INSERT WITH CHECK (current_user_can_manage_employee_payroll(employee_id));

CREATE POLICY emp_payroll_profile_update ON employee_payroll_profiles
  FOR UPDATE USING (current_user_can_manage_employee_payroll(employee_id));

CREATE POLICY emp_payroll_profile_delete ON employee_payroll_profiles
  FOR DELETE USING (current_user_can_manage_employee_payroll(employee_id));

-- ============================================================
-- RLS Policies — employee_salary_components
-- ============================================================

CREATE POLICY emp_salary_comp_select ON employee_salary_components
  FOR SELECT USING (current_user_can_view_employee_payroll(employee_id));

CREATE POLICY emp_salary_comp_insert ON employee_salary_components
  FOR INSERT WITH CHECK (current_user_can_manage_employee_payroll(employee_id));

CREATE POLICY emp_salary_comp_update ON employee_salary_components
  FOR UPDATE USING (current_user_can_manage_employee_payroll(employee_id));

CREATE POLICY emp_salary_comp_delete ON employee_salary_components
  FOR DELETE USING (current_user_can_manage_employee_payroll(employee_id));

-- ============================================================
-- RLS Policies — employee_salary_revisions (append-only)
-- ============================================================

CREATE POLICY emp_salary_rev_select ON employee_salary_revisions
  FOR SELECT USING (current_user_can_view_employee_payroll(employee_id));

CREATE POLICY emp_salary_rev_insert ON employee_salary_revisions
  FOR INSERT WITH CHECK (current_user_can_manage_employee_payroll(employee_id));

-- No UPDATE policy — append-only
-- No DELETE policy — append-only

-- ============================================================
-- RLS Policies — employee_payroll_holds
-- ============================================================

CREATE POLICY emp_payroll_hold_select ON employee_payroll_holds
  FOR SELECT USING (current_user_can_view_employee_payroll(employee_id));

CREATE POLICY emp_payroll_hold_insert ON employee_payroll_holds
  FOR INSERT WITH CHECK (current_user_can_manage_employee_payroll(employee_id));

CREATE POLICY emp_payroll_hold_update ON employee_payroll_holds
  FOR UPDATE USING (current_user_can_manage_employee_payroll(employee_id));

CREATE POLICY emp_payroll_hold_delete ON employee_payroll_holds
  FOR DELETE USING (current_user_can_manage_employee_payroll(employee_id));

-- ============================================================
-- RLS Policies — employee_wps_profiles
-- ============================================================

CREATE POLICY emp_wps_profile_select ON employee_wps_profiles
  FOR SELECT USING (current_user_can_view_employee_payroll(employee_id));

CREATE POLICY emp_wps_profile_insert ON employee_wps_profiles
  FOR INSERT WITH CHECK (current_user_can_manage_employee_payroll(employee_id));

CREATE POLICY emp_wps_profile_update ON employee_wps_profiles
  FOR UPDATE USING (current_user_can_manage_employee_payroll(employee_id));

CREATE POLICY emp_wps_profile_delete ON employee_wps_profiles
  FOR DELETE USING (current_user_can_manage_employee_payroll(employee_id));
