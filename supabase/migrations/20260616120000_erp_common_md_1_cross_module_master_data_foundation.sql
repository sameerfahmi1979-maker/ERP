-- ERP COMMON MD.1 — Cross-Module Master Data Foundation
-- Migration created: 2026-06-16
-- Phase: COMMON MD.1
-- Scope: Extend owner_companies/branches, create departments, designations,
--        work_sites, work_calendars, work_shifts, approval_roles,
--        owner_company_signatories, dms_required_document_rules
-- Note: area_zones table in live DB is named areas_zones

-- =============================================================================
-- SECTION 1: EXTEND owner_companies
-- =============================================================================

ALTER TABLE owner_companies
  ADD COLUMN IF NOT EXISTS trade_name TEXT,
  ADD COLUMN IF NOT EXISTS main_activity TEXT,
  ADD COLUMN IF NOT EXISTS established_date DATE,
  ADD COLUMN IF NOT EXISTS default_tax_type_id BIGINT REFERENCES tax_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_bank_id BIGINT REFERENCES banks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'compliant',
  ADD COLUMN IF NOT EXISTS office_address_line_1 TEXT,
  ADD COLUMN IF NOT EXISTS office_address_line_2 TEXT,
  ADD COLUMN IF NOT EXISTS office_emirate_id BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS office_city_id BIGINT REFERENCES cities(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'owner_companies_compliance_status_check'
  ) THEN
    ALTER TABLE owner_companies
      ADD CONSTRAINT owner_companies_compliance_status_check
      CHECK (compliance_status IN ('compliant','non_compliant','under_review','suspended'));
  END IF;
END $$;

-- =============================================================================
-- SECTION 2: CREATE work_calendars
-- =============================================================================

CREATE TABLE IF NOT EXISTS work_calendars (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  calendar_code      TEXT NOT NULL UNIQUE,
  calendar_name      TEXT NOT NULL,
  calendar_type      TEXT NOT NULL DEFAULT 'standard'
    CHECK (calendar_type IN ('standard','ramadan','summer','project','custom')),
  owner_company_id   BIGINT REFERENCES owner_companies(id) ON DELETE SET NULL,
  working_days       TEXT[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  weekend_days       TEXT[] NOT NULL DEFAULT ARRAY['sat','sun'],
  has_ramadan_timing BOOLEAN NOT NULL DEFAULT false,
  has_summer_timing  BOOLEAN NOT NULL DEFAULT false,
  effective_from     DATE,
  effective_to       DATE,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at         TIMESTAMPTZ
);

-- =============================================================================
-- SECTION 3: CREATE work_shifts
-- =============================================================================

CREATE TABLE IF NOT EXISTS work_shifts (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_code         TEXT NOT NULL,
  shift_name         TEXT NOT NULL,
  calendar_id        BIGINT NOT NULL REFERENCES work_calendars(id) ON DELETE CASCADE,
  shift_start_time   TIME NOT NULL,
  shift_end_time     TIME NOT NULL,
  break_start_time   TIME,
  break_end_time     TIME,
  total_hours        NUMERIC(4,2),
  is_overnight       BOOLEAN NOT NULL DEFAULT false,
  ramadan_start_time TIME,
  ramadan_end_time   TIME,
  summer_start_time  TIME,
  summer_end_time    TIME,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at         TIMESTAMPTZ,
  UNIQUE (calendar_id, shift_code)
);

-- =============================================================================
-- SECTION 4: EXTEND branches
-- =============================================================================

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS opening_date DATE,
  ADD COLUMN IF NOT EXISTS closing_date DATE,
  ADD COLUMN IF NOT EXISTS cost_center_id BIGINT REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profit_center_id BIGINT REFERENCES profit_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_work_calendar_id BIGINT REFERENCES work_calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_manager_user_id BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legal_branch_name TEXT,
  ADD COLUMN IF NOT EXISTS trade_license_branch_ref TEXT,
  ADD COLUMN IF NOT EXISTS emirate_id BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS city_id BIGINT REFERENCES cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_zone_id BIGINT REFERENCES areas_zones(id) ON DELETE SET NULL;

-- =============================================================================
-- SECTION 5: CREATE owner_company_signatories
-- =============================================================================

CREATE TABLE IF NOT EXISTS owner_company_signatories (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id      BIGINT NOT NULL REFERENCES owner_companies(id) ON DELETE CASCADE,
  user_id         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL,
  designation     TEXT,
  signature_scope TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  effective_from  DATE,
  effective_to    DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at      TIMESTAMPTZ
);

-- =============================================================================
-- SECTION 6: CREATE departments
-- =============================================================================

CREATE TABLE IF NOT EXISTS departments (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_code         TEXT NOT NULL,
  department_name_en      TEXT NOT NULL,
  department_name_ar      TEXT,
  owner_company_id        BIGINT NOT NULL REFERENCES owner_companies(id) ON DELETE RESTRICT,
  branch_id               BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  parent_department_id    BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  cost_center_id          BIGINT REFERENCES cost_centers(id) ON DELETE SET NULL,
  department_head_user_id BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  description             TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  effective_from          DATE,
  effective_to            DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at              TIMESTAMPTZ,
  UNIQUE (owner_company_id, department_code)
);

-- =============================================================================
-- SECTION 7: CREATE designations
-- =============================================================================

CREATE TABLE IF NOT EXISTS designations (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  designation_code        TEXT NOT NULL,
  designation_name_en     TEXT NOT NULL,
  designation_name_ar     TEXT,
  owner_company_id        BIGINT REFERENCES owner_companies(id) ON DELETE SET NULL,
  department_id           BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  job_level               TEXT,
  management_level        TEXT CHECK (management_level IN ('staff','supervisor','manager','senior_manager','director','executive','c_level')),
  is_supervisor           BOOLEAN NOT NULL DEFAULT false,
  is_authorized_signatory BOOLEAN NOT NULL DEFAULT false,
  has_approval_authority  BOOLEAN NOT NULL DEFAULT false,
  is_safety_critical      BOOLEAN NOT NULL DEFAULT false,
  description             TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at              TIMESTAMPTZ,
  UNIQUE (designation_code)
);

-- =============================================================================
-- SECTION 8: CREATE work_sites
-- (DMS entity type: "site" — do NOT use "work_site")
-- =============================================================================

CREATE TABLE IF NOT EXISTS work_sites (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_code          TEXT NOT NULL UNIQUE,
  site_name          TEXT NOT NULL,
  site_type          TEXT NOT NULL
    CHECK (site_type IN ('office','yard','workshop','camp','warehouse','project_site','client_site','weighbridge','fuel_point','storage_area','other')),
  owner_company_id   BIGINT NOT NULL REFERENCES owner_companies(id) ON DELETE RESTRICT,
  branch_id          BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  party_id           BIGINT REFERENCES parties(id) ON DELETE SET NULL,
  country_id         BIGINT REFERENCES countries(id) ON DELETE SET NULL,
  emirate_id         BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  city_id            BIGINT REFERENCES cities(id) ON DELETE SET NULL,
  area_zone_id       BIGINT REFERENCES areas_zones(id) ON DELETE SET NULL,
  address_line_1     TEXT,
  address_line_2     TEXT,
  po_box             TEXT,
  makani_number      TEXT,
  latitude           NUMERIC(10,7),
  longitude          NUMERIC(10,7),
  site_contact_name  TEXT,
  site_contact_phone TEXT,
  site_contact_email TEXT,
  is_restricted_area BOOLEAN NOT NULL DEFAULT false,
  cicpa_required     BOOLEAN NOT NULL DEFAULT false,
  adnoc_required     BOOLEAN NOT NULL DEFAULT false,
  work_calendar_id   BIGINT REFERENCES work_calendars(id) ON DELETE SET NULL,
  access_notes       TEXT,
  status             TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','closed','decommissioned')),
  opening_date       DATE,
  closing_date       DATE,
  description        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at         TIMESTAMPTZ
);

-- =============================================================================
-- SECTION 9: CREATE approval_roles
-- =============================================================================

CREATE TABLE IF NOT EXISTS approval_roles (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_code          TEXT NOT NULL UNIQUE,
  role_name          TEXT NOT NULL,
  level_number       INT NOT NULL CHECK (level_number > 0),
  scope              TEXT NOT NULL DEFAULT 'company'
    CHECK (scope IN ('company','branch','department','site','module','global')),
  module_code        TEXT,
  amount_limit       NUMERIC(18,4),
  currency_code      TEXT DEFAULT 'AED',
  can_approve        BOOLEAN NOT NULL DEFAULT true,
  can_reject         BOOLEAN NOT NULL DEFAULT true,
  can_delegate       BOOLEAN NOT NULL DEFAULT false,
  escalation_role_id BIGINT REFERENCES approval_roles(id) ON DELETE SET NULL,
  owner_company_id   BIGINT REFERENCES owner_companies(id) ON DELETE SET NULL,
  description        TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at         TIMESTAMPTZ
);

-- =============================================================================
-- SECTION 10: CREATE dms_required_document_rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS dms_required_document_rules (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_code                   TEXT NOT NULL UNIQUE,
  rule_name                   TEXT NOT NULL,
  entity_type                 TEXT NOT NULL,
  entity_subtype              TEXT,
  document_type_id            BIGINT REFERENCES dms_document_types(id) ON DELETE RESTRICT,
  is_required                 BOOLEAN NOT NULL DEFAULT true,
  requires_expiry_date        BOOLEAN NOT NULL DEFAULT false,
  requires_issue_date         BOOLEAN NOT NULL DEFAULT false,
  blocks_activation           BOOLEAN NOT NULL DEFAULT false,
  reminder_days_before_expiry INT[],
  owner_company_id            BIGINT REFERENCES owner_companies(id) ON DELETE SET NULL,
  branch_id                   BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  department_id               BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  effective_from              DATE,
  effective_to                DATE,
  notes                       TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at                  TIMESTAMPTZ
);

-- =============================================================================
-- SECTION 11: ENABLE + FORCE RLS ON ALL NEW TABLES
-- =============================================================================

ALTER TABLE work_calendars              ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_calendars              FORCE ROW LEVEL SECURITY;
ALTER TABLE work_shifts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_shifts                 FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_company_signatories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_company_signatories   FORCE ROW LEVEL SECURITY;
ALTER TABLE departments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments                 FORCE ROW LEVEL SECURITY;
ALTER TABLE designations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations                FORCE ROW LEVEL SECURITY;
ALTER TABLE work_sites                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sites                  FORCE ROW LEVEL SECURITY;
ALTER TABLE approval_roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_roles              FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_required_document_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_required_document_rules FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 12: RLS POLICIES
-- Pattern: SELECT requires common_md.view or system_admin
--          INSERT/UPDATE/DELETE requires common_md.manage or system_admin
-- =============================================================================

-- ── work_calendars ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS work_calendars_select ON work_calendars;
CREATE POLICY work_calendars_select ON work_calendars FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND (
    current_user_has_permission('common_md.view')
    OR current_user_has_permission('common_md.work_calendars.view')
    OR current_user_has_role('system_admin')
  ));

DROP POLICY IF EXISTS work_calendars_insert ON work_calendars;
CREATE POLICY work_calendars_insert ON work_calendars FOR INSERT
  WITH CHECK (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.work_calendars.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS work_calendars_update ON work_calendars;
CREATE POLICY work_calendars_update ON work_calendars FOR UPDATE
  USING (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.work_calendars.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS work_calendars_delete ON work_calendars;
CREATE POLICY work_calendars_delete ON work_calendars FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ── work_shifts ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS work_shifts_select ON work_shifts;
CREATE POLICY work_shifts_select ON work_shifts FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND (
    current_user_has_permission('common_md.view')
    OR current_user_has_permission('common_md.work_calendars.view')
    OR current_user_has_role('system_admin')
  ));

DROP POLICY IF EXISTS work_shifts_insert ON work_shifts;
CREATE POLICY work_shifts_insert ON work_shifts FOR INSERT
  WITH CHECK (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.work_calendars.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS work_shifts_update ON work_shifts;
CREATE POLICY work_shifts_update ON work_shifts FOR UPDATE
  USING (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.work_calendars.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS work_shifts_delete ON work_shifts;
CREATE POLICY work_shifts_delete ON work_shifts FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ── owner_company_signatories ─────────────────────────────────────────────────
DROP POLICY IF EXISTS owner_company_signatories_select ON owner_company_signatories;
CREATE POLICY owner_company_signatories_select ON owner_company_signatories FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND (
    current_user_has_permission('common_md.view')
    OR current_user_has_permission('common_md.organizations.view')
    OR current_user_has_permission('organizations.view')
    OR current_user_has_role('system_admin')
  ));

DROP POLICY IF EXISTS owner_company_signatories_insert ON owner_company_signatories;
CREATE POLICY owner_company_signatories_insert ON owner_company_signatories FOR INSERT
  WITH CHECK (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.organizations.manage')
    OR current_user_has_permission('organizations.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS owner_company_signatories_update ON owner_company_signatories;
CREATE POLICY owner_company_signatories_update ON owner_company_signatories FOR UPDATE
  USING (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.organizations.manage')
    OR current_user_has_permission('organizations.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS owner_company_signatories_delete ON owner_company_signatories;
CREATE POLICY owner_company_signatories_delete ON owner_company_signatories FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ── departments ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS departments_select ON departments;
CREATE POLICY departments_select ON departments FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND (
    current_user_has_permission('common_md.view')
    OR current_user_has_permission('common_md.departments.view')
    OR current_user_has_role('system_admin')
  ));

DROP POLICY IF EXISTS departments_insert ON departments;
CREATE POLICY departments_insert ON departments FOR INSERT
  WITH CHECK (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.departments.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS departments_update ON departments;
CREATE POLICY departments_update ON departments FOR UPDATE
  USING (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.departments.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS departments_delete ON departments;
CREATE POLICY departments_delete ON departments FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ── designations ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS designations_select ON designations;
CREATE POLICY designations_select ON designations FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND (
    current_user_has_permission('common_md.view')
    OR current_user_has_permission('common_md.designations.view')
    OR current_user_has_role('system_admin')
  ));

DROP POLICY IF EXISTS designations_insert ON designations;
CREATE POLICY designations_insert ON designations FOR INSERT
  WITH CHECK (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.designations.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS designations_update ON designations;
CREATE POLICY designations_update ON designations FOR UPDATE
  USING (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.designations.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS designations_delete ON designations;
CREATE POLICY designations_delete ON designations FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ── work_sites ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS work_sites_select ON work_sites;
CREATE POLICY work_sites_select ON work_sites FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND (
    current_user_has_permission('common_md.view')
    OR current_user_has_permission('common_md.work_sites.view')
    OR current_user_has_role('system_admin')
  ));

DROP POLICY IF EXISTS work_sites_insert ON work_sites;
CREATE POLICY work_sites_insert ON work_sites FOR INSERT
  WITH CHECK (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.work_sites.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS work_sites_update ON work_sites;
CREATE POLICY work_sites_update ON work_sites FOR UPDATE
  USING (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.work_sites.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS work_sites_delete ON work_sites;
CREATE POLICY work_sites_delete ON work_sites FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ── approval_roles ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS approval_roles_select ON approval_roles;
CREATE POLICY approval_roles_select ON approval_roles FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND (
    current_user_has_permission('common_md.view')
    OR current_user_has_permission('common_md.approval_roles.view')
    OR current_user_has_role('system_admin')
  ));

DROP POLICY IF EXISTS approval_roles_insert ON approval_roles;
CREATE POLICY approval_roles_insert ON approval_roles FOR INSERT
  WITH CHECK (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.approval_roles.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS approval_roles_update ON approval_roles;
CREATE POLICY approval_roles_update ON approval_roles FOR UPDATE
  USING (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.approval_roles.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS approval_roles_delete ON approval_roles;
CREATE POLICY approval_roles_delete ON approval_roles FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ── dms_required_document_rules ───────────────────────────────────────────────
DROP POLICY IF EXISTS dms_required_document_rules_select ON dms_required_document_rules;
CREATE POLICY dms_required_document_rules_select ON dms_required_document_rules FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND (
    current_user_has_permission('common_md.view')
    OR current_user_has_permission('common_md.dms_required_documents.view')
    OR current_user_has_role('system_admin')
  ));

DROP POLICY IF EXISTS dms_required_document_rules_insert ON dms_required_document_rules;
CREATE POLICY dms_required_document_rules_insert ON dms_required_document_rules FOR INSERT
  WITH CHECK (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.dms_required_documents.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS dms_required_document_rules_update ON dms_required_document_rules;
CREATE POLICY dms_required_document_rules_update ON dms_required_document_rules FOR UPDATE
  USING (
    current_user_has_permission('common_md.manage')
    OR current_user_has_permission('common_md.dms_required_documents.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS dms_required_document_rules_delete ON dms_required_document_rules;
CREATE POLICY dms_required_document_rules_delete ON dms_required_document_rules FOR DELETE
  USING (current_user_has_role('system_admin'));

-- =============================================================================
-- SECTION 13: INDEXES
-- =============================================================================

-- departments
CREATE INDEX IF NOT EXISTS idx_departments_owner_company_id      ON departments(owner_company_id);
CREATE INDEX IF NOT EXISTS idx_departments_branch_id             ON departments(branch_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent_department_id  ON departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_departments_is_active             ON departments(is_active) WHERE deleted_at IS NULL;

-- designations
CREATE INDEX IF NOT EXISTS idx_designations_owner_company_id     ON designations(owner_company_id);
CREATE INDEX IF NOT EXISTS idx_designations_department_id        ON designations(department_id);

-- work_sites
CREATE INDEX IF NOT EXISTS idx_work_sites_owner_company_id       ON work_sites(owner_company_id);
CREATE INDEX IF NOT EXISTS idx_work_sites_branch_id              ON work_sites(branch_id);
CREATE INDEX IF NOT EXISTS idx_work_sites_site_type              ON work_sites(site_type);
CREATE INDEX IF NOT EXISTS idx_work_sites_status                 ON work_sites(status) WHERE deleted_at IS NULL;

-- work_calendars
CREATE INDEX IF NOT EXISTS idx_work_calendars_owner_company_id   ON work_calendars(owner_company_id);
CREATE INDEX IF NOT EXISTS idx_work_calendars_is_active          ON work_calendars(is_active) WHERE deleted_at IS NULL;

-- work_shifts
CREATE INDEX IF NOT EXISTS idx_work_shifts_calendar_id           ON work_shifts(calendar_id);

-- approval_roles
CREATE INDEX IF NOT EXISTS idx_approval_roles_owner_company_id   ON approval_roles(owner_company_id);
CREATE INDEX IF NOT EXISTS idx_approval_roles_scope              ON approval_roles(scope);
CREATE INDEX IF NOT EXISTS idx_approval_roles_module_code        ON approval_roles(module_code);

-- dms_required_document_rules
CREATE INDEX IF NOT EXISTS idx_dms_req_doc_rules_entity_type     ON dms_required_document_rules(entity_type);
CREATE INDEX IF NOT EXISTS idx_dms_req_doc_rules_doc_type_id     ON dms_required_document_rules(document_type_id);
CREATE INDEX IF NOT EXISTS idx_dms_req_doc_rules_is_active       ON dms_required_document_rules(is_active) WHERE deleted_at IS NULL;

-- owner_company_signatories
CREATE INDEX IF NOT EXISTS idx_oc_signatories_company_id         ON owner_company_signatories(company_id);

-- =============================================================================
-- SECTION 14: SEED COMMON_MD PERMISSIONS
-- =============================================================================

INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES
  -- Global common_md permissions (broad access gates)
  ('common_md.view',                        'View Common Master Data',            'View all common master data records',                    'COMMON_MD', 'view',   true),
  ('common_md.manage',                      'Manage Common Master Data',          'Create/edit all common master data records',             'COMMON_MD', 'manage', true),
  -- Organizations (new granular)
  ('common_md.organizations.view',          'View Organizations (CMD)',           'View organization records via COMMON MD',                 'COMMON_MD', 'view',   true),
  ('common_md.organizations.manage',        'Manage Organizations (CMD)',         'Create/edit organization records via COMMON MD',          'COMMON_MD', 'manage', true),
  -- Branches (new granular)
  ('common_md.branches.view',               'View Branches (CMD)',                'View branch records via COMMON MD',                      'COMMON_MD', 'view',   true),
  ('common_md.branches.manage',             'Manage Branches (CMD)',              'Create/edit branch records via COMMON MD',               'COMMON_MD', 'manage', true),
  -- Departments
  ('common_md.departments.view',            'View Departments',                   'View department records',                                'COMMON_MD', 'view',   true),
  ('common_md.departments.manage',          'Manage Departments',                 'Create/edit/deactivate department records',               'COMMON_MD', 'manage', true),
  -- Designations
  ('common_md.designations.view',           'View Designations',                  'View designation/job title records',                     'COMMON_MD', 'view',   true),
  ('common_md.designations.manage',         'Manage Designations',                'Create/edit/deactivate designation records',              'COMMON_MD', 'manage', true),
  -- Work Sites
  ('common_md.work_sites.view',             'View Work Sites',                    'View work site/location records',                        'COMMON_MD', 'view',   true),
  ('common_md.work_sites.manage',           'Manage Work Sites',                  'Create/edit/deactivate work site records',               'COMMON_MD', 'manage', true),
  -- Work Calendars
  ('common_md.work_calendars.view',         'View Work Calendars',                'View work calendar and shift records',                   'COMMON_MD', 'view',   true),
  ('common_md.work_calendars.manage',       'Manage Work Calendars',              'Create/edit work calendars and shifts',                  'COMMON_MD', 'manage', true),
  -- Approval Roles
  ('common_md.approval_roles.view',         'View Approval Roles',                'View approval authority role records',                   'COMMON_MD', 'view',   true),
  ('common_md.approval_roles.manage',       'Manage Approval Roles',              'Create/edit approval authority role records',            'COMMON_MD', 'manage', true),
  -- DMS Required Documents
  ('common_md.dms_required_documents.view', 'View DMS Required Document Rules',   'View required document compliance rules',                'COMMON_MD', 'view',   true),
  ('common_md.dms_required_documents.manage','Manage DMS Required Document Rules','Create/edit required document compliance rules',         'COMMON_MD', 'manage', true)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description,
  action_code     = EXCLUDED.action_code,
  is_active       = EXCLUDED.is_active,
  updated_at      = now();

-- Grant all COMMON_MD permissions to system_admin and group_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code LIKE 'common_md.%'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code LIKE 'common_md.%'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'common_md.view',
  'common_md.organizations.view','common_md.branches.view',
  'common_md.departments.view','common_md.designations.view',
  'common_md.work_sites.view','common_md.work_calendars.view',
  'common_md.approval_roles.view','common_md.dms_required_documents.view'
)
WHERE r.role_code = 'company_admin'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 15: SEED DMS REQUIRED DOCUMENT RULES (verified codes only)
-- Audited active document types in live DB:
--   TRADE_LICENSE (1), TRN_CERTIFICATE (4), VAT_CERTIFICATE (5),
--   INSURANCE_CERTIFICATE (6), POWER_OF_ATTORNEY (8), SITE_ACCESS_PERMIT (25),
--   CICPA_PASS (23), ADNOC_GATE_PASS (24)
-- Not seeding: TENANCY_CONTRACT (not exist), MUNICIPALITY_APPROVAL (not exist)
-- =============================================================================

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, requires_issue_date, blocks_activation, is_active)
SELECT
  'COMP-TRADE-LICENSE', 'Company Trade License', 'company', id, true, true, true, false, true
FROM dms_document_types WHERE type_code = 'TRADE_LICENSE'
ON CONFLICT (rule_code) DO UPDATE SET rule_name = EXCLUDED.rule_name, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, requires_issue_date, blocks_activation, is_active)
SELECT
  'COMP-VAT-CERT', 'Company VAT Registration Certificate', 'company', id, true, false, true, false, true
FROM dms_document_types WHERE type_code = 'VAT_CERTIFICATE'
ON CONFLICT (rule_code) DO UPDATE SET rule_name = EXCLUDED.rule_name, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, requires_issue_date, blocks_activation, is_active)
SELECT
  'COMP-TRN-CERT', 'Company TRN Certificate', 'company', id, false, false, false, false, true
FROM dms_document_types WHERE type_code = 'TRN_CERTIFICATE'
ON CONFLICT (rule_code) DO UPDATE SET rule_name = EXCLUDED.rule_name, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, requires_issue_date, blocks_activation, is_active)
SELECT
  'COMP-INSURANCE', 'Company Insurance Certificate', 'company', id, true, true, true, false, true
FROM dms_document_types WHERE type_code = 'INSURANCE_CERTIFICATE'
ON CONFLICT (rule_code) DO UPDATE SET rule_name = EXCLUDED.rule_name, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, requires_issue_date, blocks_activation, is_active)
SELECT
  'COMP-POA', 'Company Power of Attorney', 'company', id, false, true, true, false, true
FROM dms_document_types WHERE type_code = 'POWER_OF_ATTORNEY'
ON CONFLICT (rule_code) DO UPDATE SET rule_name = EXCLUDED.rule_name, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, requires_issue_date, blocks_activation, is_active)
SELECT
  'SITE-ACCESS-PERMIT', 'Work Site Access Permit', 'site', id, false, true, true, false, true
FROM dms_document_types WHERE type_code = 'SITE_ACCESS_PERMIT'
ON CONFLICT (rule_code) DO UPDATE SET rule_name = EXCLUDED.rule_name, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, requires_issue_date, blocks_activation, is_active)
SELECT
  'SITE-CICPA-PASS', 'Work Site CICPA Gate Pass', 'site', id, false, true, true, false, true
FROM dms_document_types WHERE type_code = 'CICPA_PASS'
ON CONFLICT (rule_code) DO UPDATE SET rule_name = EXCLUDED.rule_name, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, requires_issue_date, blocks_activation, is_active)
SELECT
  'SITE-ADNOC-PASS', 'Work Site ADNOC Gate Pass', 'site', id, false, true, true, false, true
FROM dms_document_types WHERE type_code = 'ADNOC_GATE_PASS'
ON CONFLICT (rule_code) DO UPDATE SET rule_name = EXCLUDED.rule_name, is_active = EXCLUDED.is_active, updated_at = now();
