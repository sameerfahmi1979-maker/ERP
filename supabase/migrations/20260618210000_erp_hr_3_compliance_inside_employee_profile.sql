-- ============================================================================
-- ERP HR.3 — Compliance Inside Employee Profile
-- Migration: 20260618210000_erp_hr_3_compliance_inside_employee_profile.sql
-- Scope:
--   - employee_identity_documents
--   - employee_medical_insurances
--   - employee_dependents
--   - employee_access_cards
--   - employee_training_certificates
--   - employee_medical_records
--   - RLS helper functions for medical data
--   - Indexes (enterprise-scale)
--   - RLS ENABLED + FORCED on all 6 tables
--   - DMS required document rules seed for employee entity
-- ============================================================================

-- Ensure pg_trgm is available for trigram indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 1. employee_identity_documents
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_identity_documents (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id                 BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type_id            BIGINT NOT NULL REFERENCES hr_identity_document_types(id),
  document_number             TEXT NOT NULL,
  issue_date                  DATE,
  expiry_date                 DATE,
  issuing_authority           TEXT,
  issue_country_id            BIGINT REFERENCES countries(id),
  issuing_emirate_id          BIGINT REFERENCES emirates(id),
  status                      TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','expired','cancelled','pending')),
  verification_status         TEXT NOT NULL DEFAULT 'unverified'
                                CHECK (verification_status IN ('unverified','verified','failed')),
  verified_by                 BIGINT REFERENCES user_profiles(id),
  verified_at                 TIMESTAMPTZ,
  dms_document_id             BIGINT REFERENCES dms_documents(id),
  renewal_status              TEXT NOT NULL DEFAULT 'not_required'
                                CHECK (renewal_status IN ('not_required','pending','in_progress','complete')),
  emirates_id_application_no  TEXT,
  visa_file_number            TEXT,
  uid_number                  TEXT,
  labour_card_number          TEXT,
  work_permit_number          TEXT,
  mohre_person_code           TEXT,
  profession_on_document      TEXT,
  sponsor_company_id          BIGINT REFERENCES owner_companies(id),
  place_of_issue              TEXT,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id)
);

-- ============================================================================
-- 2. employee_medical_insurances
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_medical_insurances (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id                 BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  insurance_provider          TEXT NOT NULL,
  tpa                         TEXT,
  policy_number               TEXT NOT NULL,
  insurance_card_number       TEXT,
  network_class               TEXT,
  issue_date                  DATE,
  expiry_date                 DATE NOT NULL,
  employee_covered            BOOLEAN NOT NULL DEFAULT TRUE,
  dependent_coverage_included BOOLEAN NOT NULL DEFAULT FALSE,
  dependent_count_covered     INT,
  status                      TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','expired','cancelled','pending')),
  verification_status         TEXT NOT NULL DEFAULT 'unverified'
                                CHECK (verification_status IN ('unverified','verified','failed')),
  renewal_status              TEXT NOT NULL DEFAULT 'pending'
                                CHECK (renewal_status IN ('not_required','pending','in_progress','complete')),
  dms_document_id             BIGINT REFERENCES dms_documents(id),
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id)
);

-- ============================================================================
-- 3. employee_dependents
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_dependents (
  id                            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id                   BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  dependent_name_en             TEXT NOT NULL,
  dependent_name_ar             TEXT,
  relationship_type_id          BIGINT NOT NULL REFERENCES hr_relationship_types(id),
  date_of_birth                 DATE,
  nationality_id                BIGINT REFERENCES countries(id),
  passport_number               TEXT,
  passport_expiry               DATE,
  emirates_id_number            TEXT,
  emirates_id_expiry            DATE,
  residence_visa_number         TEXT,
  residence_visa_expiry         DATE,
  medical_insurance_provider    TEXT,
  medical_insurance_policy      TEXT,
  medical_insurance_card        TEXT,
  medical_insurance_expiry      DATE,
  sponsored_by                  TEXT CHECK (sponsored_by IN ('employee','company')),
  is_active                     BOOLEAN NOT NULL DEFAULT TRUE,
  notes                         TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                    BIGINT REFERENCES user_profiles(id),
  updated_by                    BIGINT REFERENCES user_profiles(id),
  deleted_at                    TIMESTAMPTZ,
  deleted_by                    BIGINT REFERENCES user_profiles(id)
);

-- ============================================================================
-- 4. employee_access_cards
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_access_cards (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  access_type_id        BIGINT NOT NULL REFERENCES hr_access_card_types(id),
  client_authority      TEXT,
  work_site_id          BIGINT REFERENCES work_sites(id),
  card_number           TEXT,
  application_reference TEXT,
  issue_date            DATE,
  expiry_date           DATE,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('active','expired','cancelled','suspended','pending','in_application')),
  access_level          TEXT,
  renewal_status        TEXT NOT NULL DEFAULT 'not_required'
                          CHECK (renewal_status IN ('not_required','pending','in_progress','complete')),
  dms_document_id       BIGINT REFERENCES dms_documents(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES user_profiles(id),
  updated_by            BIGINT REFERENCES user_profiles(id),
  deleted_at            TIMESTAMPTZ,
  deleted_by            BIGINT REFERENCES user_profiles(id)
);

-- ============================================================================
-- 5. employee_training_certificates
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_training_certificates (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id                 BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  training_category_id        BIGINT REFERENCES hr_training_categories(id),
  training_type_id            BIGINT NOT NULL REFERENCES hr_training_types(id),
  provider                    TEXT,
  approval_body               TEXT,
  certificate_number          TEXT,
  issue_date                  DATE,
  expiry_date                 DATE,
  validity_months             INT,
  required_for_designation    BOOLEAN NOT NULL DEFAULT FALSE,
  required_for_site           BOOLEAN NOT NULL DEFAULT FALSE,
  status                      TEXT NOT NULL DEFAULT 'valid'
                                CHECK (status IN ('valid','expired','pending','in_progress')),
  verification_status         TEXT NOT NULL DEFAULT 'unverified'
                                CHECK (verification_status IN ('unverified','verified','failed')),
  renewal_status              TEXT NOT NULL DEFAULT 'not_required'
                                CHECK (renewal_status IN ('not_required','pending','in_progress','complete')),
  dms_document_id             BIGINT REFERENCES dms_documents(id),
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  BIGINT REFERENCES user_profiles(id),
  updated_by                  BIGINT REFERENCES user_profiles(id),
  deleted_at                  TIMESTAMPTZ,
  deleted_by                  BIGINT REFERENCES user_profiles(id)
);

-- ============================================================================
-- 6. employee_medical_records  (CONFIDENTIAL TABLE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_medical_records (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id             BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  medical_record_type_id  BIGINT NOT NULL REFERENCES hr_medical_record_types(id),
  medical_center          TEXT,
  report_number           TEXT,
  examination_date        DATE NOT NULL,
  result                  TEXT NOT NULL
                            CHECK (result IN ('fit','unfit','conditionally_fit','under_review')),
  fit_for_work            BOOLEAN NOT NULL DEFAULT FALSE,
  work_restrictions       BOOLEAN NOT NULL DEFAULT FALSE,
  restriction_details     TEXT,
  expiry_date             DATE,
  required_for_visa       BOOLEAN NOT NULL DEFAULT FALSE,
  required_for_site       BOOLEAN NOT NULL DEFAULT FALSE,
  required_for_offshore   BOOLEAN NOT NULL DEFAULT FALSE,
  dms_document_id         BIGINT REFERENCES dms_documents(id),
  confidentiality_level   TEXT NOT NULL DEFAULT 'restricted'
                            CHECK (confidentiality_level IN ('internal','restricted','medical_only')),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              BIGINT REFERENCES user_profiles(id),
  updated_by              BIGINT REFERENCES user_profiles(id),
  deleted_at              TIMESTAMPTZ,
  deleted_by              BIGINT REFERENCES user_profiles(id)
);

-- ============================================================================
-- 7. updated_at triggers
-- ============================================================================

CREATE OR REPLACE TRIGGER set_employee_identity_documents_updated_at
  BEFORE UPDATE ON employee_identity_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_employee_medical_insurances_updated_at
  BEFORE UPDATE ON employee_medical_insurances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_employee_dependents_updated_at
  BEFORE UPDATE ON employee_dependents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_employee_access_cards_updated_at
  BEFORE UPDATE ON employee_access_cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_employee_training_certificates_updated_at
  BEFORE UPDATE ON employee_training_certificates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_employee_medical_records_updated_at
  BEFORE UPDATE ON employee_medical_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 8. Indexes
-- ============================================================================

-- Identity documents
CREATE INDEX IF NOT EXISTS idx_employee_identity_documents_employee_id
  ON employee_identity_documents (employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_identity_documents_type
  ON employee_identity_documents (document_type_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_identity_documents_expiry
  ON employee_identity_documents (expiry_date) WHERE deleted_at IS NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_employee_identity_documents_status
  ON employee_identity_documents (employee_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_identity_documents_number_trgm
  ON employee_identity_documents USING GIN (document_number gin_trgm_ops);

-- Medical insurance
CREATE INDEX IF NOT EXISTS idx_employee_medical_insurances_employee_id
  ON employee_medical_insurances (employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_medical_insurances_expiry
  ON employee_medical_insurances (expiry_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_medical_insurances_status
  ON employee_medical_insurances (employee_id, status) WHERE deleted_at IS NULL;

-- Dependents
CREATE INDEX IF NOT EXISTS idx_employee_dependents_employee_id
  ON employee_dependents (employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_dependents_passport_expiry
  ON employee_dependents (passport_expiry) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_dependents_eid_expiry
  ON employee_dependents (emirates_id_expiry) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_dependents_visa_expiry
  ON employee_dependents (residence_visa_expiry) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_dependents_insurance_expiry
  ON employee_dependents (medical_insurance_expiry) WHERE deleted_at IS NULL;

-- Access cards
CREATE INDEX IF NOT EXISTS idx_employee_access_cards_employee_id
  ON employee_access_cards (employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_access_cards_type
  ON employee_access_cards (access_type_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_access_cards_work_site
  ON employee_access_cards (work_site_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_access_cards_expiry
  ON employee_access_cards (expiry_date) WHERE deleted_at IS NULL AND status = 'active';

-- Training certificates
CREATE INDEX IF NOT EXISTS idx_employee_training_certificates_employee_id
  ON employee_training_certificates (employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_training_certificates_type
  ON employee_training_certificates (training_type_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_training_certificates_category
  ON employee_training_certificates (training_category_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_training_certificates_expiry
  ON employee_training_certificates (expiry_date) WHERE deleted_at IS NULL AND status = 'valid';

-- Medical records
CREATE INDEX IF NOT EXISTS idx_employee_medical_records_employee_id
  ON employee_medical_records (employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_medical_records_type
  ON employee_medical_records (medical_record_type_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_medical_records_expiry
  ON employee_medical_records (expiry_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_medical_records_result
  ON employee_medical_records (result) WHERE deleted_at IS NULL;

-- ============================================================================
-- 9. Enable and Force RLS on all 6 tables
-- ============================================================================

ALTER TABLE employee_identity_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_identity_documents      FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_medical_insurances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_medical_insurances      FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_dependents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_dependents              FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_access_cards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_access_cards            FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_training_certificates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_training_certificates   FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_medical_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_medical_records         FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. Medical RLS Helper Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION current_user_can_view_employee_medical(p_employee_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (
    current_user_is_global_admin()
    OR (
      current_user_can_view_employee(p_employee_id)
      AND current_user_has_permission('hr.medical.view')
    )
  );
$$;

CREATE OR REPLACE FUNCTION current_user_can_manage_employee_medical(p_employee_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (
    current_user_is_global_admin()
    OR (
      current_user_can_manage_employee(p_employee_id)
      AND current_user_has_permission('hr.medical.manage')
    )
  );
$$;

-- ============================================================================
-- 11. RLS Policies — employee_identity_documents
-- ============================================================================

CREATE POLICY eid_docs_select
  ON employee_identity_documents FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.compliance.view')
  );

CREATE POLICY eid_docs_insert
  ON employee_identity_documents FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

CREATE POLICY eid_docs_update
  ON employee_identity_documents FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

-- ============================================================================
-- 12. RLS Policies — employee_medical_insurances
-- ============================================================================

CREATE POLICY emp_ins_select
  ON employee_medical_insurances FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.compliance.view')
  );

CREATE POLICY emp_ins_insert
  ON employee_medical_insurances FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

CREATE POLICY emp_ins_update
  ON employee_medical_insurances FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

-- ============================================================================
-- 13. RLS Policies — employee_dependents
-- ============================================================================

CREATE POLICY emp_dep_select
  ON employee_dependents FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.compliance.view')
  );

CREATE POLICY emp_dep_insert
  ON employee_dependents FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

CREATE POLICY emp_dep_update
  ON employee_dependents FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

-- ============================================================================
-- 14. RLS Policies — employee_access_cards
-- ============================================================================

CREATE POLICY emp_ac_select
  ON employee_access_cards FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.compliance.view')
  );

CREATE POLICY emp_ac_insert
  ON employee_access_cards FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

CREATE POLICY emp_ac_update
  ON employee_access_cards FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

-- ============================================================================
-- 15. RLS Policies — employee_training_certificates
-- ============================================================================

CREATE POLICY emp_tc_select
  ON employee_training_certificates FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.compliance.view')
  );

CREATE POLICY emp_tc_insert
  ON employee_training_certificates FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

CREATE POLICY emp_tc_update
  ON employee_training_certificates FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.compliance.manage')
  );

-- ============================================================================
-- 16. RLS Policies — employee_medical_records  (MEDICAL RESTRICTED)
-- ============================================================================

CREATE POLICY emp_med_select
  ON employee_medical_records FOR SELECT
  USING (current_user_can_view_employee_medical(employee_id));

CREATE POLICY emp_med_insert
  ON employee_medical_records FOR INSERT
  WITH CHECK (current_user_can_manage_employee_medical(employee_id));

CREATE POLICY emp_med_update
  ON employee_medical_records FOR UPDATE
  USING (current_user_can_manage_employee_medical(employee_id))
  WITH CHECK (current_user_can_manage_employee_medical(employee_id));

-- ============================================================================
-- 17. DMS Required Document Rules — employee entity
--     Uses existing dms_document_types with closest matching codes:
--     EMIRATES_ID (10), PASSPORT_COPY (9), VISA (15),
--     OFFSHORE_ONSHORE_MEDICAL_REPORT (39), CONTRACT (13)
-- ============================================================================

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id,
   is_required, requires_expiry_date, requires_issue_date,
   blocks_activation, reminder_days_before_expiry, is_active)
VALUES
  ('EMP_EMIRATES_ID',        'Employee Emirates ID',        'employee', 10,  TRUE, TRUE,  TRUE,  FALSE, ARRAY[90,60,30], TRUE),
  ('EMP_PASSPORT',           'Employee Passport',           'employee', 9,   TRUE, TRUE,  TRUE,  FALSE, ARRAY[90,60,30], TRUE),
  ('EMP_UAE_VISA',           'Employee UAE Visa',           'employee', 15,  TRUE, TRUE,  TRUE,  FALSE, ARRAY[90,60,30], TRUE),
  ('EMP_MEDICAL_CERTIFICATE','Employee Medical Certificate','employee', 39,  TRUE, TRUE,  TRUE,  FALSE, ARRAY[30],       TRUE),
  ('EMP_LABOUR_CONTRACT',    'Employee Labour Contract',    'employee', 13,  TRUE, FALSE, TRUE,  FALSE, ARRAY[]::integer[], TRUE)
ON CONFLICT (rule_code) DO NOTHING;
