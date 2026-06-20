-- =============================================================================
-- ERP HR.1 — HR Settings Foundation
-- Migration: 20260618100000_erp_hr_1_settings_foundation.sql
-- Date: 2026-06-18
-- =============================================================================
-- Creates 18 HR settings/configuration tables, seeds lookup data,
-- seeds all HR roadmap permissions and role mappings, updates EMP numbering rule,
-- and seeds HR notification templates.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: HR Permissions
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO permissions (permission_code, permission_name, module_code, action_code, description)
VALUES
  -- Employee management
  ('hr.employees.view',            'HR - Employees View',                  'HR', 'view',            'View employee records'),
  ('hr.employees.create',          'HR - Employees Create',                'HR', 'create',          'Create new employee records'),
  ('hr.employees.update',          'HR - Employees Update',                'HR', 'update',          'Update employee records'),
  ('hr.employees.archive',         'HR - Employees Archive',               'HR', 'archive',         'Archive/deactivate employee records'),
  -- Employee profile
  ('hr.employee_profile.view',     'HR - Employee Profile View',           'HR', 'view',            'View employee profile details'),
  ('hr.employee_profile.manage',   'HR - Employee Profile Manage',         'HR', 'manage',          'Manage employee profile details'),
  -- Compliance
  ('hr.compliance.view',           'HR - Compliance View',                 'HR', 'view',            'View employee compliance records'),
  ('hr.compliance.manage',         'HR - Compliance Manage',               'HR', 'manage',          'Manage employee compliance records'),
  -- Medical
  ('hr.medical.view',              'HR - Medical View',                    'HR', 'view',            'View employee medical records'),
  ('hr.medical.manage',            'HR - Medical Manage',                  'HR', 'manage',          'Manage employee medical records'),
  -- Payroll
  ('hr.payroll.view',              'HR - Payroll View',                    'HR', 'view',            'View payroll information'),
  ('hr.payroll.manage',            'HR - Payroll Manage',                  'HR', 'manage',          'Manage payroll information'),
  -- Attendance
  ('hr.attendance.view',           'HR - Attendance View',                 'HR', 'view',            'View attendance records'),
  ('hr.attendance.manage',         'HR - Attendance Manage',               'HR', 'manage',          'Manage attendance records'),
  -- Leave
  ('hr.leave.view',                'HR - Leave View',                      'HR', 'view',            'View leave requests and balances'),
  ('hr.leave.manage',              'HR - Leave Manage',                    'HR', 'manage',          'Manage leave requests and approvals'),
  -- Recruitment
  ('hr.recruitment.view',          'HR - Recruitment View',                'HR', 'view',            'View recruitment records'),
  ('hr.recruitment.manage',        'HR - Recruitment Manage',              'HR', 'manage',          'Manage recruitment and onboarding'),
  -- Assignments
  ('hr.assignments.view',          'HR - Assignments View',                'HR', 'view',            'View employee assignments'),
  ('hr.assignments.manage',        'HR - Assignments Manage',              'HR', 'manage',          'Manage employee assignments'),
  -- Actions
  ('hr.actions.view',              'HR - Actions View',                    'HR', 'view',            'View HR action records'),
  ('hr.actions.manage',            'HR - Actions Manage',                  'HR', 'manage',          'Manage HR actions (warnings, notices, etc.)'),
  -- End of Service
  ('hr.eos.view',                  'HR - EOS View',                        'HR', 'view',            'View end of service records'),
  ('hr.eos.manage',                'HR - EOS Manage',                      'HR', 'manage',          'Manage end of service process and clearance'),
  -- Dashboard and Search
  ('hr.dashboard.view',            'HR - Dashboard View',                  'HR', 'view',            'View HR dashboard'),
  ('hr.search.use',                'HR - Search Use',                      'HR', 'use',             'Use HR search functionality'),
  -- Settings
  ('hr.settings.view',             'HR - Settings View',                   'HR', 'view',            'View HR configuration settings'),
  ('hr.settings.manage',           'HR - Settings Manage',                 'HR', 'manage',          'Manage HR configuration settings'),
  -- AI
  ('hr.ai.review',                 'HR - AI Review',                       'HR', 'review',          'Review HR AI suggestions'),
  ('hr.ai.apply_suggestion',       'HR - AI Apply Suggestion',             'HR', 'apply',           'Apply HR AI suggestions to records'),
  -- Admin
  ('hr.admin',                     'HR - Admin',                           'HR', 'admin',           'Full HR module administrative access')
ON CONFLICT (permission_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: Role Mappings
-- Map permissions to roles that exist in the DB.
-- Note: hr_officer, payroll_officer, pro_officer, supervisor are not in DB yet.
-- Mapping to: system_admin, group_admin, company_admin, hr_manager,
--             hse_manager (maps to hse_officer intent), operations_manager
-- ─────────────────────────────────────────────────────────────────────────────

-- system_admin and group_admin: all HR permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code IN ('system_admin', 'group_admin')
  AND p.permission_code IN (
    'hr.employees.view', 'hr.employees.create', 'hr.employees.update', 'hr.employees.archive',
    'hr.employee_profile.view', 'hr.employee_profile.manage',
    'hr.compliance.view', 'hr.compliance.manage',
    'hr.medical.view', 'hr.medical.manage',
    'hr.payroll.view', 'hr.payroll.manage',
    'hr.attendance.view', 'hr.attendance.manage',
    'hr.leave.view', 'hr.leave.manage',
    'hr.recruitment.view', 'hr.recruitment.manage',
    'hr.assignments.view', 'hr.assignments.manage',
    'hr.actions.view', 'hr.actions.manage',
    'hr.eos.view', 'hr.eos.manage',
    'hr.dashboard.view', 'hr.search.use',
    'hr.settings.view', 'hr.settings.manage',
    'hr.ai.review', 'hr.ai.apply_suggestion',
    'hr.admin'
  )
ON CONFLICT DO NOTHING;

-- company_admin: view-heavy, limited sensitive manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'company_admin'
  AND p.permission_code IN (
    'hr.employees.view', 'hr.employees.create', 'hr.employees.update', 'hr.employees.archive',
    'hr.employee_profile.view', 'hr.employee_profile.manage',
    'hr.compliance.view', 'hr.compliance.manage',
    'hr.medical.view',
    'hr.payroll.view',
    'hr.attendance.view', 'hr.attendance.manage',
    'hr.leave.view', 'hr.leave.manage',
    'hr.recruitment.view', 'hr.recruitment.manage',
    'hr.assignments.view', 'hr.assignments.manage',
    'hr.actions.view', 'hr.actions.manage',
    'hr.eos.view', 'hr.eos.manage',
    'hr.dashboard.view', 'hr.search.use',
    'hr.settings.view', 'hr.settings.manage',
    'hr.ai.review'
  )
ON CONFLICT DO NOTHING;

-- hr_manager: all HR operational permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'hr_manager'
  AND p.permission_code IN (
    'hr.employees.view', 'hr.employees.create', 'hr.employees.update', 'hr.employees.archive',
    'hr.employee_profile.view', 'hr.employee_profile.manage',
    'hr.compliance.view', 'hr.compliance.manage',
    'hr.medical.view', 'hr.medical.manage',
    'hr.payroll.view', 'hr.payroll.manage',
    'hr.attendance.view', 'hr.attendance.manage',
    'hr.leave.view', 'hr.leave.manage',
    'hr.recruitment.view', 'hr.recruitment.manage',
    'hr.assignments.view', 'hr.assignments.manage',
    'hr.actions.view', 'hr.actions.manage',
    'hr.eos.view', 'hr.eos.manage',
    'hr.dashboard.view', 'hr.search.use',
    'hr.settings.view', 'hr.settings.manage',
    'hr.ai.review', 'hr.ai.apply_suggestion'
  )
ON CONFLICT DO NOTHING;

-- hse_manager: medical/training/readiness view and manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'hse_manager'
  AND p.permission_code IN (
    'hr.employees.view',
    'hr.compliance.view', 'hr.compliance.manage',
    'hr.medical.view', 'hr.medical.manage',
    'hr.attendance.view',
    'hr.dashboard.view', 'hr.search.use',
    'hr.settings.view'
  )
ON CONFLICT DO NOTHING;

-- operations_manager: assignments/readiness/attendance view and manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'operations_manager'
  AND p.permission_code IN (
    'hr.employees.view',
    'hr.employee_profile.view',
    'hr.compliance.view',
    'hr.attendance.view', 'hr.attendance.manage',
    'hr.leave.view',
    'hr.assignments.view', 'hr.assignments.manage',
    'hr.dashboard.view', 'hr.search.use',
    'hr.settings.view'
  )
ON CONFLICT DO NOTHING;

-- finance_manager: payroll and EOS view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'finance_manager'
  AND p.permission_code IN (
    'hr.employees.view',
    'hr.payroll.view', 'hr.payroll.manage',
    'hr.eos.view',
    'hr.settings.view'
  )
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: RLS Helper Functions for HR Settings
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_user_can_view_hr_settings()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY INVOKER
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN user_roles ur ON ur.role_id = rp.role_id
      AND ur.user_profile_id = (
        SELECT id FROM user_profiles WHERE auth_user_id = auth.uid() LIMIT 1
      )
    JOIN permissions perm ON perm.id = rp.permission_id
    WHERE perm.permission_code IN (
      'hr.settings.view','hr.settings.manage','hr.admin',
      'hr.employees.view','hr.employees.create','hr.employees.update',
      'hr.compliance.view','hr.payroll.view','hr.leave.view',
      'hr.attendance.view','hr.recruitment.view','hr.dashboard.view',
      'hr.medical.view','hr.assignments.view','hr.actions.view',
      'hr.eos.view','hr.search.use',
      'system_admin','group_admin'
    )
  );
$$;

CREATE OR REPLACE FUNCTION current_user_can_manage_hr_settings()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY INVOKER
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN user_roles ur ON ur.role_id = rp.role_id
      AND ur.user_profile_id = (
        SELECT id FROM user_profiles WHERE auth_user_id = auth.uid() LIMIT 1
      )
    JOIN permissions perm ON perm.id = rp.permission_id
    WHERE perm.permission_code IN (
      'hr.settings.manage','hr.admin','system_admin','group_admin'
    )
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: HR Settings Tables
-- Standard columns: BIGINT PK, code, name_en, name_ar, description,
--                   is_active, sort_order, audit cols, soft-delete
-- ─────────────────────────────────────────────────────────────────────────────

-- Table 1: hr_employee_categories
CREATE TABLE IF NOT EXISTS hr_employee_categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name_en     TEXT NOT NULL,
  name_ar     TEXT,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  BIGINT REFERENCES user_profiles(id),
  updated_by  BIGINT REFERENCES user_profiles(id),
  deleted_at  TIMESTAMPTZ,
  deleted_by  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_emp_categories_active ON hr_employee_categories (is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_emp_categories_deleted ON hr_employee_categories (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE hr_employee_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_categories FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_emp_cats_select" ON hr_employee_categories FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_emp_cats_insert" ON hr_employee_categories FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_emp_cats_update" ON hr_employee_categories FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_emp_cats_delete" ON hr_employee_categories FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_employee_categories_updated_at ON hr_employee_categories;
CREATE TRIGGER trg_hr_employee_categories_updated_at
  BEFORE UPDATE ON hr_employee_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 2: hr_employment_types
CREATE TABLE IF NOT EXISTS hr_employment_types (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name_en     TEXT NOT NULL,
  name_ar     TEXT,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  BIGINT REFERENCES user_profiles(id),
  updated_by  BIGINT REFERENCES user_profiles(id),
  deleted_at  TIMESTAMPTZ,
  deleted_by  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_emp_types_active ON hr_employment_types (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_employment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_types FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_emp_types_select" ON hr_employment_types FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_emp_types_insert" ON hr_employment_types FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_emp_types_update" ON hr_employment_types FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_emp_types_delete" ON hr_employment_types FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_employment_types_updated_at ON hr_employment_types;
CREATE TRIGGER trg_hr_employment_types_updated_at
  BEFORE UPDATE ON hr_employment_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 3: hr_grades
CREATE TABLE IF NOT EXISTS hr_grades (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name_en     TEXT NOT NULL,
  name_ar     TEXT,
  grade_level INT,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  BIGINT REFERENCES user_profiles(id),
  updated_by  BIGINT REFERENCES user_profiles(id),
  deleted_at  TIMESTAMPTZ,
  deleted_by  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_grades_active ON hr_grades (is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_grades_level ON hr_grades (grade_level);

ALTER TABLE hr_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_grades FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_grades_select" ON hr_grades FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_grades_insert" ON hr_grades FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_grades_update" ON hr_grades FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_grades_delete" ON hr_grades FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_grades_updated_at ON hr_grades;
CREATE TRIGGER trg_hr_grades_updated_at
  BEFORE UPDATE ON hr_grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 4: hr_identity_document_types
CREATE TABLE IF NOT EXISTS hr_identity_document_types (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                        TEXT NOT NULL UNIQUE,
  name_en                     TEXT NOT NULL,
  name_ar                     TEXT,
  requires_issue_date         BOOLEAN NOT NULL DEFAULT TRUE,
  requires_expiry_date        BOOLEAN NOT NULL DEFAULT TRUE,
  requires_document_number    BOOLEAN NOT NULL DEFAULT TRUE,
  default_expiry_alert_days   INT NOT NULL DEFAULT 60,
  is_government_document      BOOLEAN NOT NULL DEFAULT TRUE,
  is_sensitive                BOOLEAN NOT NULL DEFAULT TRUE,
  description                 TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                  INT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_id_doc_types_active ON hr_identity_document_types (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_identity_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_identity_document_types FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_id_doc_types_select" ON hr_identity_document_types FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_id_doc_types_insert" ON hr_identity_document_types FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_id_doc_types_update" ON hr_identity_document_types FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_id_doc_types_delete" ON hr_identity_document_types FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_identity_doc_types_updated_at ON hr_identity_document_types;
CREATE TRIGGER trg_hr_identity_doc_types_updated_at
  BEFORE UPDATE ON hr_identity_document_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 5: hr_access_card_types
CREATE TABLE IF NOT EXISTS hr_access_card_types (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                        TEXT NOT NULL UNIQUE,
  name_en                     TEXT NOT NULL,
  name_ar                     TEXT,
  default_expiry_alert_days   INT NOT NULL DEFAULT 60,
  scope_type                  TEXT NOT NULL DEFAULT 'configurable'
                              CHECK (scope_type IN ('global','site','client','configurable')),
  requires_work_site          BOOLEAN NOT NULL DEFAULT FALSE,
  requires_client_authority   BOOLEAN NOT NULL DEFAULT TRUE,
  description                 TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                  INT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_access_card_types_active ON hr_access_card_types (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_access_card_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_access_card_types FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_access_card_types_select" ON hr_access_card_types FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_access_card_types_insert" ON hr_access_card_types FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_access_card_types_update" ON hr_access_card_types FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_access_card_types_delete" ON hr_access_card_types FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_access_card_types_updated_at ON hr_access_card_types;
CREATE TRIGGER trg_hr_access_card_types_updated_at
  BEFORE UPDATE ON hr_access_card_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 6: hr_training_categories
CREATE TABLE IF NOT EXISTS hr_training_categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name_en     TEXT NOT NULL,
  name_ar     TEXT,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  BIGINT REFERENCES user_profiles(id),
  updated_by  BIGINT REFERENCES user_profiles(id),
  deleted_at  TIMESTAMPTZ,
  deleted_by  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_training_cats_active ON hr_training_categories (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_training_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_training_categories FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_training_cats_select" ON hr_training_categories FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_training_cats_insert" ON hr_training_categories FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_training_cats_update" ON hr_training_categories FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_training_cats_delete" ON hr_training_categories FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_training_categories_updated_at ON hr_training_categories;
CREATE TRIGGER trg_hr_training_categories_updated_at
  BEFORE UPDATE ON hr_training_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 7: hr_training_types
CREATE TABLE IF NOT EXISTS hr_training_types (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                        TEXT NOT NULL UNIQUE,
  name_en                     TEXT NOT NULL,
  name_ar                     TEXT,
  training_category_id        BIGINT REFERENCES hr_training_categories(id),
  default_validity_months     INT,
  default_expiry_alert_days   INT NOT NULL DEFAULT 60,
  requires_certificate_number BOOLEAN NOT NULL DEFAULT TRUE,
  requires_provider           BOOLEAN NOT NULL DEFAULT FALSE,
  is_site_required            BOOLEAN NOT NULL DEFAULT FALSE,
  is_designation_required     BOOLEAN NOT NULL DEFAULT FALSE,
  description                 TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                  INT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_training_types_active ON hr_training_types (is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_training_types_cat ON hr_training_types (training_category_id);

ALTER TABLE hr_training_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_training_types FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_training_types_select" ON hr_training_types FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_training_types_insert" ON hr_training_types FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_training_types_update" ON hr_training_types FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_training_types_delete" ON hr_training_types FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_training_types_updated_at ON hr_training_types;
CREATE TRIGGER trg_hr_training_types_updated_at
  BEFORE UPDATE ON hr_training_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 8: hr_medical_record_types
CREATE TABLE IF NOT EXISTS hr_medical_record_types (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                      TEXT NOT NULL UNIQUE,
  name_en                   TEXT NOT NULL,
  name_ar                   TEXT,
  default_validity_months   INT,
  default_expiry_alert_days INT NOT NULL DEFAULT 60,
  is_confidential           BOOLEAN NOT NULL DEFAULT TRUE,
  requires_dms_document     BOOLEAN NOT NULL DEFAULT TRUE,
  description               TEXT,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT REFERENCES user_profiles(id),
  updated_by                BIGINT REFERENCES user_profiles(id),
  deleted_at                TIMESTAMPTZ,
  deleted_by                BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_med_rec_types_active ON hr_medical_record_types (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_medical_record_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_medical_record_types FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_med_rec_types_select" ON hr_medical_record_types FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_med_rec_types_insert" ON hr_medical_record_types FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_med_rec_types_update" ON hr_medical_record_types FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_med_rec_types_delete" ON hr_medical_record_types FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_medical_record_types_updated_at ON hr_medical_record_types;
CREATE TRIGGER trg_hr_medical_record_types_updated_at
  BEFORE UPDATE ON hr_medical_record_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 9: hr_leave_types
CREATE TABLE IF NOT EXISTS hr_leave_types (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                    TEXT NOT NULL UNIQUE,
  name_en                 TEXT NOT NULL,
  name_ar                 TEXT,
  is_paid                 BOOLEAN NOT NULL DEFAULT TRUE,
  requires_document       BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval       BOOLEAN NOT NULL DEFAULT TRUE,
  default_entitlement_days NUMERIC(5,1),
  reset_basis             TEXT NOT NULL DEFAULT 'joining_anniversary'
                          CHECK (reset_basis IN ('joining_anniversary','calendar_year','manual')),
  allow_half_day          BOOLEAN NOT NULL DEFAULT TRUE,
  description             TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order              INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT REFERENCES user_profiles(id),
  updated_by              BIGINT REFERENCES user_profiles(id),
  deleted_at              TIMESTAMPTZ,
  deleted_by              BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_types_active ON hr_leave_types (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_types FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_leave_types_select" ON hr_leave_types FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_leave_types_insert" ON hr_leave_types FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_leave_types_update" ON hr_leave_types FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_leave_types_delete" ON hr_leave_types FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_leave_types_updated_at ON hr_leave_types;
CREATE TRIGGER trg_hr_leave_types_updated_at
  BEFORE UPDATE ON hr_leave_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 10: hr_relationship_types
CREATE TABLE IF NOT EXISTS hr_relationship_types (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name_en     TEXT NOT NULL,
  name_ar     TEXT,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  BIGINT REFERENCES user_profiles(id),
  updated_by  BIGINT REFERENCES user_profiles(id),
  deleted_at  TIMESTAMPTZ,
  deleted_by  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_rel_types_active ON hr_relationship_types (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_relationship_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_relationship_types FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_rel_types_select" ON hr_relationship_types FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_rel_types_insert" ON hr_relationship_types FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_rel_types_update" ON hr_relationship_types FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_rel_types_delete" ON hr_relationship_types FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_relationship_types_updated_at ON hr_relationship_types;
CREATE TRIGGER trg_hr_relationship_types_updated_at
  BEFORE UPDATE ON hr_relationship_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 11: hr_salary_component_types
CREATE TABLE IF NOT EXISTS hr_salary_component_types (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  component_kind  TEXT NOT NULL DEFAULT 'earning'
                  CHECK (component_kind IN ('earning','deduction','info')),
  is_basic        BOOLEAN NOT NULL DEFAULT FALSE,
  is_wps_component BOOLEAN NOT NULL DEFAULT TRUE,
  is_taxable      BOOLEAN NOT NULL DEFAULT FALSE,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id),
  updated_by      BIGINT REFERENCES user_profiles(id),
  deleted_at      TIMESTAMPTZ,
  deleted_by      BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_salary_comp_types_active ON hr_salary_component_types (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_salary_component_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_salary_component_types FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_sal_comp_types_select" ON hr_salary_component_types FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_sal_comp_types_insert" ON hr_salary_component_types FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_sal_comp_types_update" ON hr_salary_component_types FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_sal_comp_types_delete" ON hr_salary_component_types FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_salary_component_types_updated_at ON hr_salary_component_types;
CREATE TRIGGER trg_hr_salary_component_types_updated_at
  BEFORE UPDATE ON hr_salary_component_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 12: hr_payroll_groups
CREATE TABLE IF NOT EXISTS hr_payroll_groups (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                    TEXT NOT NULL UNIQUE,
  name_en                 TEXT NOT NULL,
  name_ar                 TEXT,
  pay_frequency           TEXT NOT NULL DEFAULT 'monthly'
                          CHECK (pay_frequency IN ('monthly','weekly','biweekly','manual')),
  wps_applicable_default  BOOLEAN NOT NULL DEFAULT TRUE,
  description             TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order              INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT REFERENCES user_profiles(id),
  updated_by              BIGINT REFERENCES user_profiles(id),
  deleted_at              TIMESTAMPTZ,
  deleted_by              BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_groups_active ON hr_payroll_groups (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_payroll_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_groups FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_payroll_groups_select" ON hr_payroll_groups FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_payroll_groups_insert" ON hr_payroll_groups FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_payroll_groups_update" ON hr_payroll_groups FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_payroll_groups_delete" ON hr_payroll_groups FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_payroll_groups_updated_at ON hr_payroll_groups;
CREATE TRIGGER trg_hr_payroll_groups_updated_at
  BEFORE UPDATE ON hr_payroll_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 13: hr_mohre_establishments
CREATE TABLE IF NOT EXISTS hr_mohre_establishments (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_company_id     BIGINT NOT NULL REFERENCES owner_companies(id),
  establishment_number TEXT NOT NULL,
  establishment_name   TEXT NOT NULL,
  emirate_id           BIGINT REFERENCES emirates(id),
  status               TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','inactive')),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           BIGINT REFERENCES user_profiles(id),
  updated_by           BIGINT REFERENCES user_profiles(id),
  deleted_at           TIMESTAMPTZ,
  deleted_by           BIGINT REFERENCES user_profiles(id),
  CONSTRAINT uq_mohre_establishment UNIQUE (owner_company_id, establishment_number)
);
CREATE INDEX IF NOT EXISTS idx_hr_mohre_est_company ON hr_mohre_establishments (owner_company_id);
CREATE INDEX IF NOT EXISTS idx_hr_mohre_est_number ON hr_mohre_establishments (establishment_number);
CREATE INDEX IF NOT EXISTS idx_hr_mohre_est_status ON hr_mohre_establishments (status);

ALTER TABLE hr_mohre_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_mohre_establishments FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_mohre_est_select" ON hr_mohre_establishments FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_mohre_est_insert" ON hr_mohre_establishments FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_mohre_est_update" ON hr_mohre_establishments FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_mohre_est_delete" ON hr_mohre_establishments FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_mohre_establishments_updated_at ON hr_mohre_establishments;
CREATE TRIGGER trg_hr_mohre_establishments_updated_at
  BEFORE UPDATE ON hr_mohre_establishments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 14: hr_pro_process_types
CREATE TABLE IF NOT EXISTS hr_pro_process_types (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                      TEXT NOT NULL UNIQUE,
  name_en                   TEXT NOT NULL,
  name_ar                   TEXT,
  default_due_days          INT,
  default_expiry_alert_days INT NOT NULL DEFAULT 60,
  requires_dms_document     BOOLEAN NOT NULL DEFAULT FALSE,
  description               TEXT,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT REFERENCES user_profiles(id),
  updated_by                BIGINT REFERENCES user_profiles(id),
  deleted_at                TIMESTAMPTZ,
  deleted_by                BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_pro_proc_types_active ON hr_pro_process_types (is_active) WHERE deleted_at IS NULL;

ALTER TABLE hr_pro_process_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_pro_process_types FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_pro_proc_types_select" ON hr_pro_process_types FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_pro_proc_types_insert" ON hr_pro_process_types FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_pro_proc_types_update" ON hr_pro_process_types FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_pro_proc_types_delete" ON hr_pro_process_types FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_pro_process_types_updated_at ON hr_pro_process_types;
CREATE TRIGGER trg_hr_pro_process_types_updated_at
  BEFORE UPDATE ON hr_pro_process_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 15: hr_readiness_rule_templates
CREATE TABLE IF NOT EXISTS hr_readiness_rule_templates (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_code                   TEXT NOT NULL UNIQUE,
  rule_name_en                TEXT NOT NULL,
  rule_name_ar                TEXT,
  readiness_dimension         TEXT NOT NULL
                              CHECK (readiness_dimension IN (
                                'legal','medical','training','cicpa','adnoc',
                                'offshore','driver','insurance','general'
                              )),
  requirement_type            TEXT NOT NULL
                              CHECK (requirement_type IN (
                                'identity_document','training','access_card',
                                'medical_record','insurance','custom'
                              )),
  required_document_type_id   BIGINT REFERENCES hr_identity_document_types(id),
  required_training_type_id   BIGINT REFERENCES hr_training_types(id),
  required_access_card_type_id BIGINT REFERENCES hr_access_card_types(id),
  required_medical_record_type_id BIGINT REFERENCES hr_medical_record_types(id),
  applies_to_category_id      BIGINT REFERENCES hr_employee_categories(id),
  applies_to_designation_id   BIGINT REFERENCES designations(id),
  applies_to_work_site_id     BIGINT REFERENCES work_sites(id),
  is_critical                 BOOLEAN NOT NULL DEFAULT TRUE,
  expiry_buffer_days          INT NOT NULL DEFAULT 60,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                  INT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_readiness_rules_active ON hr_readiness_rule_templates (is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_readiness_rules_dim ON hr_readiness_rule_templates (readiness_dimension);
CREATE INDEX IF NOT EXISTS idx_hr_readiness_rules_req_type ON hr_readiness_rule_templates (requirement_type);
CREATE INDEX IF NOT EXISTS idx_hr_readiness_rules_category ON hr_readiness_rule_templates (applies_to_category_id);
CREATE INDEX IF NOT EXISTS idx_hr_readiness_rules_site ON hr_readiness_rule_templates (applies_to_work_site_id);

ALTER TABLE hr_readiness_rule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_readiness_rule_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_readiness_rules_select" ON hr_readiness_rule_templates FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_readiness_rules_insert" ON hr_readiness_rule_templates FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_readiness_rules_update" ON hr_readiness_rule_templates FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_readiness_rules_delete" ON hr_readiness_rule_templates FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_readiness_rule_templates_updated_at ON hr_readiness_rule_templates;
CREATE TRIGGER trg_hr_readiness_rule_templates_updated_at
  BEFORE UPDATE ON hr_readiness_rule_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 16: hr_role_requirement_matrix
CREATE TABLE IF NOT EXISTS hr_role_requirement_matrix (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_category_id        BIGINT REFERENCES hr_employee_categories(id),
  designation_id              BIGINT REFERENCES designations(id),
  readiness_rule_template_id  BIGINT NOT NULL REFERENCES hr_readiness_rule_templates(id),
  is_required                 BOOLEAN NOT NULL DEFAULT TRUE,
  notes                       TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_role_req_matrix_category ON hr_role_requirement_matrix (employee_category_id);
CREATE INDEX IF NOT EXISTS idx_hr_role_req_matrix_desig ON hr_role_requirement_matrix (designation_id);
CREATE INDEX IF NOT EXISTS idx_hr_role_req_matrix_rule ON hr_role_requirement_matrix (readiness_rule_template_id);

ALTER TABLE hr_role_requirement_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_role_requirement_matrix FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_role_req_matrix_select" ON hr_role_requirement_matrix FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_role_req_matrix_insert" ON hr_role_requirement_matrix FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_role_req_matrix_update" ON hr_role_requirement_matrix FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_role_req_matrix_delete" ON hr_role_requirement_matrix FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_role_requirement_matrix_updated_at ON hr_role_requirement_matrix;
CREATE TRIGGER trg_hr_role_requirement_matrix_updated_at
  BEFORE UPDATE ON hr_role_requirement_matrix
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 17: hr_site_requirement_matrix
CREATE TABLE IF NOT EXISTS hr_site_requirement_matrix (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_site_id                BIGINT REFERENCES work_sites(id),
  access_card_type_id         BIGINT REFERENCES hr_access_card_types(id),
  training_type_id            BIGINT REFERENCES hr_training_types(id),
  medical_record_type_id      BIGINT REFERENCES hr_medical_record_types(id),
  readiness_rule_template_id  BIGINT REFERENCES hr_readiness_rule_templates(id),
  is_required                 BOOLEAN NOT NULL DEFAULT TRUE,
  notes                       TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hr_site_req_matrix_site ON hr_site_requirement_matrix (work_site_id);
CREATE INDEX IF NOT EXISTS idx_hr_site_req_matrix_access ON hr_site_requirement_matrix (access_card_type_id);
CREATE INDEX IF NOT EXISTS idx_hr_site_req_matrix_training ON hr_site_requirement_matrix (training_type_id);
CREATE INDEX IF NOT EXISTS idx_hr_site_req_matrix_medical ON hr_site_requirement_matrix (medical_record_type_id);

ALTER TABLE hr_site_requirement_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_site_requirement_matrix FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_site_req_matrix_select" ON hr_site_requirement_matrix FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_site_req_matrix_insert" ON hr_site_requirement_matrix FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_site_req_matrix_update" ON hr_site_requirement_matrix FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_site_req_matrix_delete" ON hr_site_requirement_matrix FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_site_requirement_matrix_updated_at ON hr_site_requirement_matrix;
CREATE TRIGGER trg_hr_site_requirement_matrix_updated_at
  BEFORE UPDATE ON hr_site_requirement_matrix
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Table 18: hr_approval_workflows
CREATE TABLE IF NOT EXISTS hr_approval_workflows (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_code       TEXT NOT NULL,
  workflow_name_en    TEXT NOT NULL,
  workflow_name_ar    TEXT,
  workflow_type       TEXT NOT NULL
                      CHECK (workflow_type IN (
                        'leave','payroll_change','pro_process','eos','recruitment','general'
                      )),
  approval_step       INT NOT NULL DEFAULT 1,
  approval_role_id    BIGINT REFERENCES approval_roles(id),
  is_required         BOOLEAN NOT NULL DEFAULT TRUE,
  sla_hours           INT,
  escalation_role_id  BIGINT REFERENCES approval_roles(id),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT REFERENCES user_profiles(id),
  updated_by          BIGINT REFERENCES user_profiles(id),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES user_profiles(id),
  CONSTRAINT uq_hr_approval_workflow_step UNIQUE (workflow_code, approval_step)
);
CREATE INDEX IF NOT EXISTS idx_hr_approval_workflows_type ON hr_approval_workflows (workflow_type);
CREATE INDEX IF NOT EXISTS idx_hr_approval_workflows_code ON hr_approval_workflows (workflow_code);
CREATE INDEX IF NOT EXISTS idx_hr_approval_workflows_role ON hr_approval_workflows (approval_role_id);

ALTER TABLE hr_approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_approval_workflows FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_approval_workflows_select" ON hr_approval_workflows FOR SELECT USING (current_user_can_view_hr_settings());
CREATE POLICY "hr_approval_workflows_insert" ON hr_approval_workflows FOR INSERT WITH CHECK (current_user_can_manage_hr_settings());
CREATE POLICY "hr_approval_workflows_update" ON hr_approval_workflows FOR UPDATE USING (current_user_can_manage_hr_settings());
CREATE POLICY "hr_approval_workflows_delete" ON hr_approval_workflows FOR DELETE USING (current_user_can_manage_hr_settings());

DROP TRIGGER IF EXISTS trg_hr_approval_workflows_updated_at ON hr_approval_workflows;
CREATE TRIGGER trg_hr_approval_workflows_updated_at
  BEFORE UPDATE ON hr_approval_workflows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Seed Data — HR Employee Categories
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_employee_categories (code, name_en, sort_order) VALUES
  ('DRIVER',      'Driver',       1),
  ('OPERATOR',    'Operator',     2),
  ('TECHNICIAN',  'Technician',   3),
  ('SUPERVISOR',  'Supervisor',   4),
  ('ADMIN',       'Administrative', 5),
  ('ENGINEER',    'Engineer',     6),
  ('LABORER',     'Laborer',      7),
  ('HSE',         'HSE Officer',  8),
  ('SECURITY',    'Security',     9),
  ('PRO',         'PRO Officer',  10),
  ('WORKSHOP',    'Workshop',     11),
  ('YARD',        'Yard',         12)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: Seed Data — HR Employment Types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_employment_types (code, name_en, sort_order) VALUES
  ('FULL_TIME',    'Full Time',    1),
  ('PART_TIME',    'Part Time',    2),
  ('CONTRACT',     'Contract',     3),
  ('SECONDMENT',   'Secondment',   4),
  ('TEMPORARY',    'Temporary',    5),
  ('PROBATION',    'Probation',    6),
  ('CASUAL',       'Casual',       7)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: Seed Data — HR Grades
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_grades (code, name_en, grade_level, sort_order) VALUES
  ('A1', 'A1', 1, 1), ('A2', 'A2', 2, 2), ('A3', 'A3', 3, 3), ('A4', 'A4', 4, 4), ('A5', 'A5', 5, 5),
  ('B1', 'B1', 6, 6), ('B2', 'B2', 7, 7), ('B3', 'B3', 8, 8), ('B4', 'B4', 9, 9), ('B5', 'B5', 10, 10),
  ('C1', 'C1', 11, 11), ('C2', 'C2', 12, 12), ('C3', 'C3', 13, 13)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: Seed Data — HR Identity Document Types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_identity_document_types
  (code, name_en, requires_issue_date, requires_expiry_date, requires_document_number,
   default_expiry_alert_days, is_government_document, is_sensitive, sort_order)
VALUES
  ('EMIRATES_ID',         'Emirates ID',              TRUE,  TRUE,  TRUE, 60,  TRUE, TRUE,  1),
  ('PASSPORT',            'Passport',                 TRUE,  TRUE,  TRUE, 90,  TRUE, TRUE,  2),
  ('RESIDENCE_VISA',      'Residence Visa',           TRUE,  TRUE,  TRUE, 60,  TRUE, TRUE,  3),
  ('LABOUR_CARD',         'Labour Card',              TRUE,  TRUE,  TRUE, 60,  TRUE, FALSE, 4),
  ('WORK_PERMIT',         'Work Permit',              TRUE,  TRUE,  TRUE, 60,  TRUE, FALSE, 5),
  ('EMPLOYMENT_CONTRACT', 'Employment Contract',      TRUE,  FALSE, FALSE,90,  FALSE, TRUE, 6),
  ('HEALTH_CARD',         'Health Card',              TRUE,  TRUE,  TRUE, 60,  FALSE, FALSE,7),
  ('DRIVING_LICENSE',     'Driving License',          TRUE,  TRUE,  TRUE, 60,  TRUE, FALSE, 8)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: Seed Data — HR Access Card Types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_access_card_types
  (code, name_en, default_expiry_alert_days, scope_type, requires_work_site, requires_client_authority, sort_order)
VALUES
  ('CICPA',         'CICPA Pass',              60, 'configurable', FALSE, TRUE,  1),
  ('ADNOC_PLANT',   'ADNOC Plant Card',        60, 'configurable', TRUE,  TRUE,  2),
  ('CLIENT_SITE',   'Client Site Pass',        60, 'configurable', TRUE,  TRUE,  3),
  ('PORT',          'Port Access Card',        60, 'configurable', TRUE,  TRUE,  4),
  ('OFFSHORE',      'Offshore Pass',           60, 'configurable', TRUE,  TRUE,  5),
  ('PROJECT_GATE',  'Project Gate Pass',       60, 'configurable', TRUE,  TRUE,  6),
  ('YARD_ACCESS',   'Yard Access Card',        30, 'configurable', TRUE,  FALSE, 7),
  ('VISITOR_PASS',  'Visitor Pass',            7,  'configurable', FALSE, FALSE, 8)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: Seed Data — HR Training Categories
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_training_categories (code, name_en, sort_order) VALUES
  ('SAFETY',       'Safety',                1),
  ('HSE',          'Health, Safety & Env.', 2),
  ('OPERATOR',     'Operator',              3),
  ('DRIVING',      'Driving',               4),
  ('ENVIRONMENTAL','Environmental',         5),
  ('SITE_SPECIFIC','Site Specific',         6),
  ('EQUIPMENT',    'Equipment',             7),
  ('FIRST_AID',    'First Aid',             8),
  ('FIRE_SAFETY',  'Fire Safety',           9)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: Seed Data — HR Training Types (after categories)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_training_types
  (code, name_en, training_category_id, default_validity_months, default_expiry_alert_days,
   requires_certificate_number, requires_provider, is_site_required, is_designation_required, sort_order)
SELECT
  t.code, t.name_en,
  (SELECT id FROM hr_training_categories WHERE code = t.cat_code LIMIT 1),
  t.validity, 60, TRUE, FALSE, FALSE, FALSE, t.seq
FROM (VALUES
  ('H2S',                  'H2S Safety',                         'SAFETY',       12, 1),
  ('ADSD',                 'ADSD Training',                      'SAFETY',       12, 2),
  ('WMS_PTW',              'WMS / Permit to Work',               'HSE',          12, 3),
  ('ADNOC_ATA',            'ADNOC ATA',                          'SITE_SPECIFIC',12, 4),
  ('CICPA_INDUCTION',      'CICPA Induction',                    'SITE_SPECIFIC',12, 5),
  ('OFFSHORE',             'Offshore Safety',                    'SAFETY',       12, 6),
  ('RIGGER',               'Rigger Certification',               'EQUIPMENT',    24, 7),
  ('SCAFFOLDING',          'Scaffolding Safety',                 'SAFETY',       12, 8),
  ('FIRST_AID',            'First Aid',                          'FIRST_AID',    12, 9),
  ('FIRE_WATCH',           'Fire Watch',                         'FIRE_SAFETY',  12, 10),
  ('CONFINED_SPACE',       'Confined Space Entry',               'SAFETY',       12, 11),
  ('FORKLIFT',             'Forklift Operator',                  'EQUIPMENT',    24, 12),
  ('CRANE',                'Crane Operator',                     'EQUIPMENT',    24, 13),
  ('DEFENSIVE_DRIVING',    'Defensive Driving',                  'DRIVING',      24, 14),
  ('WASTE_ENV',            'Waste & Environmental',              'ENVIRONMENTAL',12, 15),
  ('AGT',                  'Authorized Gas Tester (AGT)',        'SAFETY',       12, 16),
  ('HOT_WORK',             'Hot Work Safety',                    'SAFETY',       12, 17),
  ('LOTO',                 'Lockout/Tagout (LOTO)',              'SAFETY',       12, 18),
  ('WORK_AT_HEIGHT',       'Work at Height',                     'SAFETY',       12, 19),
  ('BANKSMAN',             'Banksman Certification',             'EQUIPMENT',    12, 20),
  ('SIGNALMAN',            'Signalman Certification',            'EQUIPMENT',    12, 21),
  ('HEAVY_EQUIPMENT_OPERATOR','Heavy Equipment Operator',        'OPERATOR',     24, 22),
  ('EXCAVATOR_OPERATOR',   'Excavator Operator',                 'OPERATOR',     24, 23),
  ('LOADER_OPERATOR',      'Loader Operator',                    'OPERATOR',     24, 24),
  ('DOZER_OPERATOR',       'Dozer Operator',                     'OPERATOR',     24, 25)
) AS t(code, name_en, cat_code, validity, seq)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12: Seed Data — HR Medical Record Types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_medical_record_types
  (code, name_en, default_validity_months, default_expiry_alert_days,
   is_confidential, requires_dms_document, sort_order)
VALUES
  ('VISA_MEDICAL',    'Visa Medical',             NULL, 60, TRUE,  TRUE,  1),
  ('PRE_EMPLOYMENT',  'Pre-Employment Medical',   12,   60, TRUE,  TRUE,  2),
  ('PERIODIC',        'Periodic Medical',         12,   60, TRUE,  TRUE,  3),
  ('OFFSHORE',        'Offshore Medical',         12,   60, TRUE,  TRUE,  4),
  ('DRIVER',          'Driver Medical',           12,   60, TRUE,  TRUE,  5),
  ('SICK_LEAVE',      'Sick Leave Certificate',   NULL, 30, TRUE,  TRUE,  6),
  ('RESTRICTION',     'Medical Restriction',      NULL, 30, TRUE,  TRUE,  7),
  ('RETURN_TO_WORK',  'Return to Work Clearance', NULL, 30, TRUE,  TRUE,  8),
  ('INCIDENT',        'Incident Medical Report',  NULL, 30, TRUE,  TRUE,  9),
  ('FITNESS_TO_WORK', 'Fitness to Work',          12,   60, TRUE,  TRUE,  10)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13: Seed Data — HR Leave Types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_leave_types
  (code, name_en, is_paid, requires_document, requires_approval,
   default_entitlement_days, reset_basis, allow_half_day, sort_order)
VALUES
  ('ANNUAL',        'Annual Leave',       TRUE,  FALSE, TRUE,  30,   'joining_anniversary', TRUE,  1),
  ('SICK',          'Sick Leave',         TRUE,  TRUE,  TRUE,  15,   'calendar_year',       FALSE, 2),
  ('EMERGENCY',     'Emergency Leave',    TRUE,  FALSE, TRUE,  3,    'joining_anniversary', FALSE, 3),
  ('MATERNITY',     'Maternity Leave',    TRUE,  TRUE,  TRUE,  45,   'joining_anniversary', FALSE, 4),
  ('PATERNITY',     'Paternity Leave',    TRUE,  TRUE,  TRUE,  3,    'joining_anniversary', FALSE, 5),
  ('UNPAID',        'Unpaid Leave',       FALSE, FALSE, TRUE,  NULL, 'manual',              TRUE,  6),
  ('HAJJ',          'Hajj Leave',         TRUE,  TRUE,  TRUE,  30,   'manual',              FALSE, 7),
  ('COMPASSIONATE', 'Compassionate Leave',TRUE,  TRUE,  TRUE,  3,    'joining_anniversary', FALSE, 8),
  ('COMPENSATORY',  'Compensatory Leave', TRUE,  FALSE, TRUE,  NULL, 'manual',              TRUE,  9),
  ('PUBLIC_HOLIDAY','Public Holiday',     TRUE,  FALSE, FALSE, NULL, 'calendar_year',       FALSE, 10)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 14: Seed Data — HR Relationship Types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_relationship_types (code, name_en, sort_order) VALUES
  ('SPOUSE',   'Spouse',   1),
  ('CHILD',    'Child',    2),
  ('FATHER',   'Father',   3),
  ('MOTHER',   'Mother',   4),
  ('PARENT',   'Parent',   5),
  ('SIBLING',  'Sibling',  6),
  ('BROTHER',  'Brother',  7),
  ('SISTER',   'Sister',   8),
  ('FRIEND',   'Friend',   9),
  ('OTHER',    'Other',    10)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 15: Seed Data — HR Salary Component Types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_salary_component_types
  (code, name_en, component_kind, is_basic, is_wps_component, is_taxable, sort_order)
VALUES
  ('BASIC',              'Basic Salary',         'earning',   TRUE,  TRUE,  FALSE, 1),
  ('HOUSING_ALLOWANCE',  'Housing Allowance',    'earning',   FALSE, TRUE,  FALSE, 2),
  ('TRANSPORT_ALLOWANCE','Transport Allowance',  'earning',   FALSE, TRUE,  FALSE, 3),
  ('FOOD_ALLOWANCE',     'Food Allowance',       'earning',   FALSE, TRUE,  FALSE, 4),
  ('OVERTIME',           'Overtime',             'earning',   FALSE, TRUE,  FALSE, 5),
  ('OTHER_ALLOWANCE',    'Other Allowance',      'earning',   FALSE, FALSE, FALSE, 6),
  ('DEDUCTION',          'Deduction',            'deduction', FALSE, FALSE, FALSE, 7),
  ('BONUS',              'Bonus',                'earning',   FALSE, FALSE, FALSE, 8)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 16: Seed Data — HR Payroll Groups
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_payroll_groups
  (code, name_en, pay_frequency, wps_applicable_default, sort_order)
VALUES
  ('MONTHLY', 'Monthly Payroll', 'monthly', TRUE,  1),
  ('WEEKLY',  'Weekly Payroll',  'weekly',  TRUE,  2)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 17: Seed Data — HR PRO Process Types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_pro_process_types
  (code, name_en, default_due_days, default_expiry_alert_days, requires_dms_document, sort_order)
VALUES
  ('VISA_RENEWAL',       'Visa Renewal',             30, 60, TRUE,  1),
  ('EID_RENEWAL',        'Emirates ID Renewal',      30, 60, TRUE,  2),
  ('LABOUR_CARD',        'Labour Card',              30, 60, TRUE,  3),
  ('WORK_PERMIT',        'Work Permit',              30, 60, TRUE,  4),
  ('MEDICAL_FITNESS',    'Medical Fitness',          14, 60, TRUE,  5),
  ('INSURANCE_RENEWAL',  'Insurance Renewal',        30, 60, FALSE, 6),
  ('CICPA_APPLICATION',  'CICPA Application',        14, 60, TRUE,  7),
  ('PLANT_CARD',         'Plant Card Application',   14, 60, TRUE,  8),
  ('TRAINING_RENEWAL',   'Training Renewal',         30, 60, TRUE,  9),
  ('VISA_CANCELLATION',  'Visa Cancellation',        NULL,30,TRUE,  10),
  ('LABOUR_CANCELLATION','Labour Card Cancellation', NULL,30,TRUE,  11)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 18: Seed Data — HR Approval Workflows
-- Seed LEAVE_DEFAULT workflow (step 1, role TBD by user configuration)
-- Note: hr_manager role from approval_roles table may or may not exist.
-- We seed without role FK; user must configure the approval_role_id in settings.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO hr_approval_workflows
  (workflow_code, workflow_name_en, workflow_type, approval_step, approval_role_id, is_required, sla_hours)
VALUES
  ('LEAVE_DEFAULT', 'Default Leave Approval', 'leave', 1,
   (SELECT id FROM approval_roles WHERE LOWER(role_name) LIKE '%hr%manager%' LIMIT 1),
   TRUE, 24)
ON CONFLICT (workflow_code, approval_step) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 19: Update EMP Numbering Rule
-- Existing rule HR_EMPLOYEE uses {DOC}-{SEQ4} → EMP-0001
-- Update to confirmed format {DOC}-{SEQ6} → EMP-000001
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE global_numbering_rules
SET
  format_template  = '{DOC}-{SEQ6}',
  sequence_length  = 6,
  description      = 'Employee number. Format: EMP-{SEQ6} → EMP-000001. Updated HR.1 (2026-06-18).',
  updated_at       = now()
WHERE rule_code = 'HR_EMPLOYEE'
  AND document_prefix = 'EMP';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 20: HR Notification Templates
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO erp_notification_templates
  (template_code, template_name, source_module, notification_type,
   subject_template, text_template,
   default_severity, default_channel_in_app, default_channel_email, is_system, is_active)
VALUES
  ('HR_OFFER_LETTER',
   'HR Offer Letter',
   'HR', 'hr_offer',
   'Job Offer — {{position_title}} at {{company_name}}',
   'Dear {{candidate_name}},\n\nWe are pleased to offer you the position of {{position_title}} at {{company_name}}.\n\nStart Date: {{start_date}}\nDepartment: {{department_name}}\n\nPlease confirm your acceptance within 3 business days.\n\nBest regards,\n{{hr_contact_name}}',
   'info', TRUE, TRUE, TRUE, TRUE),

  ('HR_INTERVIEW_INVITE',
   'HR Interview Invitation',
   'HR', 'hr_recruitment',
   'Interview Invitation — {{position_title}}',
   'Dear {{candidate_name}},\n\nYou are invited for an interview for the position of {{position_title}}.\n\nDate: {{interview_date}}\nTime: {{interview_time}}\nLocation: {{interview_location}}\n\nPlease confirm your attendance.\n\nBest regards,\n{{hr_contact_name}}',
   'info', TRUE, TRUE, TRUE, TRUE),

  ('HR_JOINING_INSTRUCTIONS',
   'HR Joining Instructions',
   'HR', 'hr_onboarding',
   'Joining Instructions — {{employee_name}}',
   'Dear {{employee_name}},\n\nWelcome to {{company_name}}! Please find your joining instructions below.\n\nJoining Date: {{joining_date}}\nReport To: {{reporting_manager_name}}\nLocation: {{work_location}}\n\nPlease bring the following documents on your first day:\n- Original Emirates ID\n- Original Passport\n- 2 Passport Photos\n\nBest regards,\nHR Team',
   'info', TRUE, TRUE, TRUE, TRUE),

  ('HR_DOCUMENT_RENEWAL_REMINDER',
   'HR Document Renewal Reminder',
   'HR', 'hr_expiry_reminder',
   'Document Renewal Reminder — {{document_type}} expires {{expiry_date}}',
   'Dear {{employee_name}},\n\nThis is a reminder that your {{document_type}} is due to expire on {{expiry_date}}.\n\nPlease arrange renewal at your earliest convenience.\n\nDocument Number: {{document_number}}\nDays Remaining: {{days_remaining}}\n\nContact HR for assistance.\n\nBest regards,\nHR Team',
   'warning', TRUE, TRUE, TRUE, TRUE),

  ('HR_LEAVE_DECISION',
   'HR Leave Decision',
   'HR', 'hr_leave',
   'Leave Request {{decision}} — {{leave_type}} ({{start_date}} to {{end_date}})',
   'Dear {{employee_name}},\n\nYour leave request has been {{decision}}.\n\nLeave Type: {{leave_type}}\nPeriod: {{start_date}} to {{end_date}}\nDays: {{leave_days}}\nDecision by: {{approver_name}}\n\n{{decision_notes}}\n\nBest regards,\nHR Team',
   'info', TRUE, TRUE, TRUE, TRUE),

  ('HR_SALARY_CERTIFICATE',
   'HR Salary Certificate',
   'HR', 'hr_document',
   'Salary Certificate — {{employee_name}}',
   'TO WHOM IT MAY CONCERN\n\nThis is to certify that {{employee_name}}, holding Employee No. {{employee_code}}, is employed with {{company_name}} as {{designation}} since {{joining_date}}.\n\nMonthly Salary: {{currency}} {{total_salary}}\n\nThis certificate is issued upon the request of the employee for official purposes only.\n\n{{issuer_name}}\n{{issuer_title}}\n{{issue_date}}',
   'info', TRUE, TRUE, TRUE, TRUE),

  ('HR_EOS_CLEARANCE',
   'HR End of Service Clearance',
   'HR', 'hr_eos',
   'End of Service Clearance — {{employee_name}}',
   'Dear {{employee_name}},\n\nThis is to confirm that your End of Service clearance process has been {{eos_status}}.\n\nLast Working Day: {{last_working_day}}\nClearance Status: {{clearance_status}}\n\nAll outstanding items must be cleared before your final settlement.\n\nBest regards,\nHR Team',
   'info', TRUE, TRUE, TRUE, TRUE),

  ('HR_DOCUMENT_REQUEST',
   'HR Document Request',
   'HR', 'hr_document',
   'Document Request — {{document_type}} required for {{employee_name}}',
   'Dear {{employee_name}},\n\nWe require the following document for your HR records:\n\nDocument Type: {{document_type}}\nRequired By: {{required_by_date}}\nReason: {{reason}}\n\nPlease submit the document to HR at your earliest convenience.\n\nBest regards,\nHR Team',
   'warning', TRUE, TRUE, TRUE, TRUE),

  ('HR_NOC_LETTER',
   'HR No Objection Certificate',
   'HR', 'hr_document',
   'No Objection Certificate — {{employee_name}}',
   'TO WHOM IT MAY CONCERN\n\nThis is to certify that {{company_name}} has no objection to {{employee_name}} (Employee No. {{employee_code}}) for the purpose of {{noc_purpose}}.\n\nThis NOC is valid for {{validity_period}} from the date of issue.\n\n{{issuer_name}}\n{{issuer_title}}\n{{issue_date}}',
   'info', TRUE, TRUE, TRUE, TRUE),

  ('HR_WARNING_LETTER',
   'HR Warning Letter',
   'HR', 'hr_action',
   'Official Warning — {{employee_name}} — {{warning_reason}}',
   'Dear {{employee_name}},\n\nThis letter serves as an official {{warning_level}} warning regarding: {{warning_reason}}.\n\nIncident Date: {{incident_date}}\nDescription: {{incident_description}}\n\nYou are required to improve your conduct immediately. Further violations may result in disciplinary action up to and including termination.\n\nEmployee Acknowledgment Required.\n\n{{issuer_name}}\n{{issuer_title}}\n{{issue_date}}',
   'high', TRUE, TRUE, TRUE, TRUE)

ON CONFLICT (template_code) DO NOTHING;

-- =============================================================================
-- END OF HR.1 MIGRATION
-- =============================================================================
-- Summary:
-- - 31 HR permissions seeded
-- - Role mappings: system_admin, group_admin, company_admin, hr_manager,
--                  hse_manager, operations_manager, finance_manager
-- - 2 RLS helper functions: current_user_can_view_hr_settings(),
--                           current_user_can_manage_hr_settings()
-- - 18 HR settings tables created (all BIGINT PK, RLS ENABLED+FORCED)
-- - All 18 tables have SELECT/INSERT/UPDATE/DELETE policies
-- - All 18 tables have updated_at triggers
-- - Seed data: 12 categories, 7 employment types, 13 grades,
--              8 identity doc types, 8 access card types,
--              9 training categories, 25 training types,
--              10 medical record types, 10 leave types,
--              10 relationship types, 8 salary component types,
--              2 payroll groups, 11 PRO process types,
--              1 approval workflow (LEAVE_DEFAULT)
-- - EMP numbering rule (HR_EMPLOYEE) format updated: {DOC}-{SEQ4} → {DOC}-{SEQ6}
-- - 10 HR notification templates seeded
-- =============================================================================
