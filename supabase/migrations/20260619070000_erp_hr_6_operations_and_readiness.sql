-- ============================================================
-- ERP HR.6 — Operations and Readiness
-- Migration: 20260619070000_erp_hr_6_operations_and_readiness.sql
-- ============================================================

-- ============================================================
-- 1. employee_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_assignments (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  owner_company_id      BIGINT REFERENCES owner_companies(id),
  branch_id             BIGINT REFERENCES branches(id),
  department_id         BIGINT REFERENCES departments(id),
  designation_id        BIGINT REFERENCES designations(id),
  work_site_id          BIGINT REFERENCES work_sites(id),
  assignment_type       TEXT NOT NULL DEFAULT 'primary'
                        CHECK (assignment_type IN ('primary','temporary','project','site','department','relief')),
  assignment_status     TEXT NOT NULL DEFAULT 'active'
                        CHECK (assignment_status IN ('active','planned','completed','cancelled')),
  effective_from        DATE NOT NULL,
  effective_to          DATE,
  reporting_manager_id  BIGINT REFERENCES employees(id),
  supervisor_id         BIGINT REFERENCES employees(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES user_profiles(id),
  updated_by            BIGINT REFERENCES user_profiles(id),
  deleted_at            TIMESTAMPTZ,
  deleted_by            BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_assignments
  BEFORE UPDATE ON employee_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. employee_role_requirements
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_role_requirements (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  designation_id        BIGINT REFERENCES designations(id),
  requirement_type      TEXT NOT NULL
                        CHECK (requirement_type IN ('document','training','medical','access_card','license','other')),
  requirement_source    TEXT,
  required_reference_id BIGINT,
  requirement_name      TEXT NOT NULL,
  is_required           BOOLEAN NOT NULL DEFAULT TRUE,
  is_met                BOOLEAN NOT NULL DEFAULT FALSE,
  met_record_type       TEXT,
  met_record_id         BIGINT,
  expiry_date           DATE,
  status                TEXT NOT NULL DEFAULT 'missing'
                        CHECK (status IN ('met','missing','expired','expiring_soon','waived','not_required')),
  waived_by             BIGINT REFERENCES user_profiles(id),
  waived_at             TIMESTAMPTZ,
  waiver_reason         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES user_profiles(id),
  updated_by            BIGINT REFERENCES user_profiles(id),
  deleted_at            TIMESTAMPTZ,
  deleted_by            BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_role_requirements
  BEFORE UPDATE ON employee_role_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 3. employee_site_readiness
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_site_readiness (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id                 BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_site_id                BIGINT NOT NULL REFERENCES work_sites(id),
  readiness_status            TEXT NOT NULL DEFAULT 'not_ready'
                              CHECK (readiness_status IN ('ready','not_ready','blocked','expired','needs_review')),
  required_access_card_type_id BIGINT REFERENCES hr_access_card_types(id),
  access_card_record_id       BIGINT REFERENCES employee_access_cards(id),
  medical_record_id           BIGINT REFERENCES employee_medical_records(id),
  training_record_ids         BIGINT[],
  missing_requirements_json   JSONB,
  checked_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by                  BIGINT REFERENCES user_profiles(id),
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id),
  UNIQUE(employee_id, work_site_id)
);

CREATE TRIGGER set_updated_at_employee_site_readiness
  BEFORE UPDATE ON employee_site_readiness
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 4. employee_operational_blocks
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_operational_blocks (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  block_type          TEXT NOT NULL
                      CHECK (block_type IN ('compliance','medical','training','access','payroll','hr_hold','operations','safety','other')),
  block_reason        TEXT NOT NULL,
  block_status        TEXT NOT NULL DEFAULT 'active'
                      CHECK (block_status IN ('active','released','expired','cancelled')),
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to        DATE,
  released_by         BIGINT REFERENCES user_profiles(id),
  released_at         TIMESTAMPTZ,
  release_reason      TEXT,
  related_record_type TEXT,
  related_record_id   BIGINT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES user_profiles(id),
  updated_by          BIGINT REFERENCES user_profiles(id),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_operational_blocks
  BEFORE UPDATE ON employee_operational_blocks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 5. employee_assets
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_assets (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  asset_type          TEXT NOT NULL
                      CHECK (asset_type IN ('id_card','phone','sim','laptop','vehicle','tool','key','other')),
  asset_reference     TEXT,
  asset_description   TEXT NOT NULL,
  issued_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  return_due_date     DATE,
  returned_date       DATE,
  status              TEXT NOT NULL DEFAULT 'issued'
                      CHECK (status IN ('issued','returned','lost','damaged','cancelled')),
  condition_on_issue  TEXT,
  condition_on_return TEXT,
  dms_document_id     BIGINT REFERENCES dms_documents(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES user_profiles(id),
  updated_by          BIGINT REFERENCES user_profiles(id),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_assets
  BEFORE UPDATE ON employee_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 6. employee_ppe_issues
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_ppe_issues (
  id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id                BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  ppe_item                   TEXT NOT NULL,
  standard_or_size           TEXT,
  quantity                   NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  issued_date                DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_or_replacement_date DATE,
  returned_date              DATE,
  status                     TEXT NOT NULL DEFAULT 'issued'
                             CHECK (status IN ('issued','returned','expired','lost','damaged','cancelled')),
  issued_by                  BIGINT REFERENCES user_profiles(id),
  dms_document_id            BIGINT REFERENCES dms_documents(id),
  notes                      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                 BIGINT REFERENCES user_profiles(id),
  updated_by                 BIGINT REFERENCES user_profiles(id),
  deleted_at                 TIMESTAMPTZ,
  deleted_by                 BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_ppe_issues
  BEFORE UPDATE ON employee_ppe_issues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 7. employee_accommodation_records
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_accommodation_records (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id            BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  accommodation_type     TEXT
                         CHECK (accommodation_type IN ('company_camp','rented_room','allowance','other')),
  accommodation_location TEXT,
  room_or_bed_no         TEXT,
  assigned_from          DATE NOT NULL,
  assigned_to            DATE,
  status                 TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','ended','cancelled')),
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by             BIGINT REFERENCES user_profiles(id),
  updated_by             BIGINT REFERENCES user_profiles(id),
  deleted_at             TIMESTAMPTZ,
  deleted_by             BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_accommodation_records
  BEFORE UPDATE ON employee_accommodation_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

-- Assignments
CREATE INDEX IF NOT EXISTS idx_emp_assignments_employee
  ON employee_assignments (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assignments_site
  ON employee_assignments (work_site_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assignments_department
  ON employee_assignments (department_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assignments_designation
  ON employee_assignments (designation_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assignments_status
  ON employee_assignments (assignment_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assignments_effective
  ON employee_assignments (employee_id, effective_from, effective_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assignments_active
  ON employee_assignments (employee_id, assignment_status) WHERE deleted_at IS NULL AND assignment_status = 'active';

-- Role Requirements
CREATE INDEX IF NOT EXISTS idx_emp_role_req_employee
  ON employee_role_requirements (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_role_req_designation
  ON employee_role_requirements (designation_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_role_req_status
  ON employee_role_requirements (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_role_req_type
  ON employee_role_requirements (requirement_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_role_req_expiry
  ON employee_role_requirements (expiry_date) WHERE deleted_at IS NULL AND expiry_date IS NOT NULL;

-- Site Readiness
CREATE INDEX IF NOT EXISTS idx_emp_site_readiness_employee
  ON employee_site_readiness (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_site_readiness_site
  ON employee_site_readiness (work_site_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_site_readiness_status
  ON employee_site_readiness (readiness_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_site_readiness_checked
  ON employee_site_readiness (employee_id, checked_at) WHERE deleted_at IS NULL;

-- Operational Blocks
CREATE INDEX IF NOT EXISTS idx_emp_op_blocks_employee
  ON employee_operational_blocks (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_op_blocks_status
  ON employee_operational_blocks (block_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_op_blocks_type
  ON employee_operational_blocks (block_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_op_blocks_effective
  ON employee_operational_blocks (employee_id, effective_from) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_op_blocks_active
  ON employee_operational_blocks (employee_id, block_status) WHERE deleted_at IS NULL AND block_status = 'active';

-- Assets
CREATE INDEX IF NOT EXISTS idx_emp_assets_employee
  ON employee_assets (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assets_type
  ON employee_assets (asset_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assets_status
  ON employee_assets (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assets_issued
  ON employee_assets (employee_id, status) WHERE deleted_at IS NULL AND status = 'issued';

-- PPE Issues
CREATE INDEX IF NOT EXISTS idx_emp_ppe_employee
  ON employee_ppe_issues (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_ppe_status
  ON employee_ppe_issues (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_ppe_expiry
  ON employee_ppe_issues (expiry_or_replacement_date) WHERE deleted_at IS NULL AND expiry_or_replacement_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emp_ppe_active
  ON employee_ppe_issues (employee_id, status) WHERE deleted_at IS NULL AND status = 'issued';

-- Accommodation
CREATE INDEX IF NOT EXISTS idx_emp_accommodation_employee
  ON employee_accommodation_records (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_accommodation_status
  ON employee_accommodation_records (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_accommodation_dates
  ON employee_accommodation_records (employee_id, assigned_from, assigned_to) WHERE deleted_at IS NULL;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE employee_assignments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assignments           FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_role_requirements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_role_requirements     FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_site_readiness        ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_site_readiness        FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_operational_blocks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_operational_blocks    FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_assets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assets                FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_ppe_issues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_ppe_issues            FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_accommodation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_accommodation_records FORCE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Helper Functions
-- ============================================================

CREATE OR REPLACE FUNCTION current_user_can_view_employee_operations(p_employee_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT current_user_can_view_employee(p_employee_id)
    AND (
      current_user_has_permission('hr.assignments.view')
      OR current_user_has_permission('hr.employee_profile.view')
    )
$$;

CREATE OR REPLACE FUNCTION current_user_can_manage_employee_operations(p_employee_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT current_user_can_manage_employee(p_employee_id)
    AND current_user_has_permission('hr.assignments.manage')
$$;

-- ============================================================
-- RLS Policies — employee_assignments
-- ============================================================

CREATE POLICY emp_assignment_select ON employee_assignments
  FOR SELECT USING (current_user_can_view_employee_operations(employee_id));
CREATE POLICY emp_assignment_insert ON employee_assignments
  FOR INSERT WITH CHECK (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_assignment_update ON employee_assignments
  FOR UPDATE USING (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_assignment_delete ON employee_assignments
  FOR DELETE USING (current_user_can_manage_employee_operations(employee_id));

-- ============================================================
-- RLS Policies — employee_role_requirements
-- ============================================================

CREATE POLICY emp_role_req_select ON employee_role_requirements
  FOR SELECT USING (current_user_can_view_employee_operations(employee_id));
CREATE POLICY emp_role_req_insert ON employee_role_requirements
  FOR INSERT WITH CHECK (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_role_req_update ON employee_role_requirements
  FOR UPDATE USING (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_role_req_delete ON employee_role_requirements
  FOR DELETE USING (current_user_can_manage_employee_operations(employee_id));

-- ============================================================
-- RLS Policies — employee_site_readiness
-- ============================================================

CREATE POLICY emp_site_readiness_select ON employee_site_readiness
  FOR SELECT USING (current_user_can_view_employee_operations(employee_id));
CREATE POLICY emp_site_readiness_insert ON employee_site_readiness
  FOR INSERT WITH CHECK (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_site_readiness_update ON employee_site_readiness
  FOR UPDATE USING (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_site_readiness_delete ON employee_site_readiness
  FOR DELETE USING (current_user_can_manage_employee_operations(employee_id));

-- ============================================================
-- RLS Policies — employee_operational_blocks
-- ============================================================

CREATE POLICY emp_op_block_select ON employee_operational_blocks
  FOR SELECT USING (current_user_can_view_employee_operations(employee_id));
CREATE POLICY emp_op_block_insert ON employee_operational_blocks
  FOR INSERT WITH CHECK (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_op_block_update ON employee_operational_blocks
  FOR UPDATE USING (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_op_block_delete ON employee_operational_blocks
  FOR DELETE USING (current_user_can_manage_employee_operations(employee_id));

-- ============================================================
-- RLS Policies — employee_assets
-- ============================================================

CREATE POLICY emp_asset_select ON employee_assets
  FOR SELECT USING (current_user_can_view_employee_operations(employee_id));
CREATE POLICY emp_asset_insert ON employee_assets
  FOR INSERT WITH CHECK (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_asset_update ON employee_assets
  FOR UPDATE USING (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_asset_delete ON employee_assets
  FOR DELETE USING (current_user_can_manage_employee_operations(employee_id));

-- ============================================================
-- RLS Policies — employee_ppe_issues
-- ============================================================

CREATE POLICY emp_ppe_select ON employee_ppe_issues
  FOR SELECT USING (current_user_can_view_employee_operations(employee_id));
CREATE POLICY emp_ppe_insert ON employee_ppe_issues
  FOR INSERT WITH CHECK (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_ppe_update ON employee_ppe_issues
  FOR UPDATE USING (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_ppe_delete ON employee_ppe_issues
  FOR DELETE USING (current_user_can_manage_employee_operations(employee_id));

-- ============================================================
-- RLS Policies — employee_accommodation_records
-- ============================================================

CREATE POLICY emp_accommodation_select ON employee_accommodation_records
  FOR SELECT USING (current_user_can_view_employee_operations(employee_id));
CREATE POLICY emp_accommodation_insert ON employee_accommodation_records
  FOR INSERT WITH CHECK (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_accommodation_update ON employee_accommodation_records
  FOR UPDATE USING (current_user_can_manage_employee_operations(employee_id));
CREATE POLICY emp_accommodation_delete ON employee_accommodation_records
  FOR DELETE USING (current_user_can_manage_employee_operations(employee_id));
