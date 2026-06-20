-- =============================================================================
-- ERP HR.8 — Recruitment & Onboarding
-- Migration: 20260619120000_erp_hr_8_recruitment_onboarding.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Numbering Rules
-- ---------------------------------------------------------------------------

INSERT INTO global_numbering_rules (
  rule_code, rule_name, description,
  module_code, module_name,
  document_type_code, document_type_name,
  document_prefix, separator, format_template,
  sequence_length, padding_character,
  starting_sequence_number, current_sequence_number, next_sequence_number,
  reset_policy, reserve_on_draft, reserve_on_submit, allow_manual_override,
  allow_gaps, cancelled_number_policy, duplicate_prevention_scope,
  is_active, is_locked
) VALUES
(
  'HR_JOB_REQUISITION', 'HR Job Requisition', 'Auto-numbering for job requisitions',
  'HR', 'Human Resources',
  'JOB_REQUISITION', 'Job Requisition',
  'REQ', '-', '{DOC}-{SEQ6}',
  6, '0',
  1, 0, 1,
  'never', false, false, false,
  true, 'never_reuse', 'document_type',
  true, false
),
(
  'HR_CANDIDATE', 'HR Candidate', 'Auto-numbering for candidates',
  'HR', 'Human Resources',
  'CANDIDATE', 'Candidate',
  'CAND', '-', '{DOC}-{SEQ6}',
  6, '0',
  1, 0, 1,
  'never', false, false, false,
  true, 'never_reuse', 'document_type',
  true, false
)
ON CONFLICT (rule_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS Helper Functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_user_can_view_hr_recruitment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT current_user_has_permission('hr.recruitment.view')
    OR current_user_has_permission('hr.recruitment.manage')
    OR current_user_has_permission('hr.employees.view');
$$;

CREATE OR REPLACE FUNCTION current_user_can_manage_hr_recruitment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT current_user_has_permission('hr.recruitment.manage');
$$;

-- ---------------------------------------------------------------------------
-- 1. hr_job_requisitions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr_job_requisitions (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requisition_code     TEXT UNIQUE,
  requisition_title    TEXT NOT NULL,
  owner_company_id     BIGINT REFERENCES owner_companies(id),
  branch_id            BIGINT REFERENCES branches(id),
  department_id        BIGINT REFERENCES departments(id),
  designation_id       BIGINT REFERENCES designations(id),
  work_site_id         BIGINT REFERENCES work_sites(id),
  requested_by         BIGINT REFERENCES user_profiles(id),
  hiring_manager_id    BIGINT REFERENCES user_profiles(id),
  employment_type_id   BIGINT REFERENCES hr_employment_types(id),
  employee_category_id BIGINT REFERENCES hr_employee_categories(id),
  vacancies_count      INT NOT NULL DEFAULT 1 CHECK (vacancies_count > 0),
  target_start_date    DATE,
  requisition_status   TEXT NOT NULL DEFAULT 'draft'
                       CHECK (requisition_status IN ('draft','open','on_hold','filled','cancelled','closed')),
  priority             TEXT NOT NULL DEFAULT 'normal'
                       CHECK (priority IN ('low','normal','high','urgent')),
  budgeted_salary_min  NUMERIC(12,2),
  budgeted_salary_max  NUMERIC(12,2),
  job_description      TEXT,
  requirements         TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           BIGINT REFERENCES user_profiles(id),
  updated_by           BIGINT REFERENCES user_profiles(id),
  deleted_at           TIMESTAMPTZ,
  deleted_by           BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_hr_job_requisitions
  BEFORE UPDATE ON hr_job_requisitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE hr_job_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_job_requisitions FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_job_requisitions_select" ON hr_job_requisitions
  FOR SELECT USING (current_user_can_view_hr_recruitment());

CREATE POLICY "hr_job_requisitions_insert" ON hr_job_requisitions
  FOR INSERT WITH CHECK (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_job_requisitions_update" ON hr_job_requisitions
  FOR UPDATE USING (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_job_requisitions_delete" ON hr_job_requisitions
  FOR DELETE USING (current_user_can_manage_hr_recruitment());

-- Indexes
CREATE INDEX idx_hr_job_requisitions_code ON hr_job_requisitions(requisition_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_job_requisitions_status ON hr_job_requisitions(requisition_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_job_requisitions_company ON hr_job_requisitions(owner_company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_job_requisitions_department ON hr_job_requisitions(department_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_job_requisitions_designation ON hr_job_requisitions(designation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_job_requisitions_site ON hr_job_requisitions(work_site_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_job_requisitions_target_date ON hr_job_requisitions(target_start_date) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. hr_candidates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr_candidates (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_code           TEXT UNIQUE,
  requisition_id           BIGINT REFERENCES hr_job_requisitions(id),
  full_name_en             TEXT NOT NULL,
  full_name_ar             TEXT,
  gender                   TEXT CHECK (gender IN ('male','female')),
  nationality_id           BIGINT REFERENCES countries(id),
  date_of_birth            DATE,
  mobile_number            TEXT,
  email                    TEXT,
  current_location         TEXT,
  source                   TEXT CHECK (source IN ('direct','referral','agency','walk_in','online','other')),
  agency_name              TEXT,
  referred_by_employee_id  BIGINT REFERENCES employees(id),
  current_employer         TEXT,
  current_position         TEXT,
  expected_salary          NUMERIC(12,2),
  notice_period_days       INT,
  candidate_status         TEXT NOT NULL DEFAULT 'new'
                           CHECK (candidate_status IN ('new','screening','shortlisted','interview','selected','offered','accepted','rejected','withdrawn','hired','blacklisted')),
  pipeline_stage           TEXT NOT NULL DEFAULT 'new'
                           CHECK (pipeline_stage IN ('new','screening','shortlisted','interview','offer','onboarding','hired','closed')),
  rating                   TEXT CHECK (rating IN ('excellent','good','average','weak','not_suitable')),
  availability_date        DATE,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               BIGINT REFERENCES user_profiles(id),
  updated_by               BIGINT REFERENCES user_profiles(id),
  deleted_at               TIMESTAMPTZ,
  deleted_by               BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_hr_candidates
  BEFORE UPDATE ON hr_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE hr_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_candidates FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_candidates_select" ON hr_candidates
  FOR SELECT USING (current_user_can_view_hr_recruitment());

CREATE POLICY "hr_candidates_insert" ON hr_candidates
  FOR INSERT WITH CHECK (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_candidates_update" ON hr_candidates
  FOR UPDATE USING (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_candidates_delete" ON hr_candidates
  FOR DELETE USING (current_user_can_manage_hr_recruitment());

-- Indexes
CREATE INDEX idx_hr_candidates_code ON hr_candidates(candidate_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_candidates_requisition ON hr_candidates(requisition_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_candidates_status ON hr_candidates(candidate_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_candidates_pipeline ON hr_candidates(pipeline_stage) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_candidates_nationality ON hr_candidates(nationality_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_candidates_mobile ON hr_candidates(mobile_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_candidates_email ON hr_candidates(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_candidates_name_trgm ON hr_candidates USING gin (full_name_en gin_trgm_ops) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. hr_candidate_documents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr_candidate_documents (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id        BIGINT NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  dms_document_id     BIGINT NOT NULL REFERENCES dms_documents(id),
  document_purpose    TEXT CHECK (document_purpose IN ('cv','passport','certificate','offer','photo','other')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified','verified','failed')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES user_profiles(id),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES user_profiles(id),
  UNIQUE (candidate_id, dms_document_id)
);

ALTER TABLE hr_candidate_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_candidate_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_candidate_documents_select" ON hr_candidate_documents
  FOR SELECT USING (current_user_can_view_hr_recruitment());

CREATE POLICY "hr_candidate_documents_insert" ON hr_candidate_documents
  FOR INSERT WITH CHECK (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_candidate_documents_update" ON hr_candidate_documents
  FOR UPDATE USING (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_candidate_documents_delete" ON hr_candidate_documents
  FOR DELETE USING (current_user_can_manage_hr_recruitment());

-- Indexes
CREATE INDEX idx_hr_candidate_docs_candidate ON hr_candidate_documents(candidate_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_candidate_docs_dms ON hr_candidate_documents(dms_document_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_candidate_docs_purpose ON hr_candidate_documents(document_purpose) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. hr_interviews
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr_interviews (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id        BIGINT NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  requisition_id      BIGINT REFERENCES hr_job_requisitions(id),
  interview_round     TEXT NOT NULL DEFAULT 'first'
                      CHECK (interview_round IN ('screening','first','second','technical','final','other')),
  interview_datetime  TIMESTAMPTZ,
  interview_location  TEXT,
  interviewer_id      BIGINT REFERENCES user_profiles(id),
  interview_status    TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (interview_status IN ('scheduled','completed','cancelled','no_show','rescheduled')),
  result              TEXT CHECK (result IN ('pass','hold','fail','pending')),
  score               NUMERIC(5,2),
  feedback            TEXT,
  next_step           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES user_profiles(id),
  updated_by          BIGINT REFERENCES user_profiles(id),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_hr_interviews
  BEFORE UPDATE ON hr_interviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE hr_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_interviews FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_interviews_select" ON hr_interviews
  FOR SELECT USING (current_user_can_view_hr_recruitment());

CREATE POLICY "hr_interviews_insert" ON hr_interviews
  FOR INSERT WITH CHECK (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_interviews_update" ON hr_interviews
  FOR UPDATE USING (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_interviews_delete" ON hr_interviews
  FOR DELETE USING (current_user_can_manage_hr_recruitment());

-- Indexes
CREATE INDEX idx_hr_interviews_candidate ON hr_interviews(candidate_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_interviews_requisition ON hr_interviews(requisition_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_interviews_datetime ON hr_interviews(interview_datetime) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_interviews_status ON hr_interviews(interview_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_interviews_interviewer ON hr_interviews(interviewer_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. hr_offers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr_offers (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id            BIGINT NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  requisition_id          BIGINT REFERENCES hr_job_requisitions(id),
  offer_status            TEXT NOT NULL DEFAULT 'draft'
                          CHECK (offer_status IN ('draft','pending_approval','approved','sent','accepted','rejected','withdrawn','expired','cancelled')),
  offer_date              DATE,
  valid_until             DATE,
  proposed_joining_date   DATE,
  owner_company_id        BIGINT REFERENCES owner_companies(id),
  branch_id               BIGINT REFERENCES branches(id),
  department_id           BIGINT REFERENCES departments(id),
  designation_id          BIGINT REFERENCES designations(id),
  employment_type_id      BIGINT REFERENCES hr_employment_types(id),
  basic_salary            NUMERIC(12,2),
  gross_salary            NUMERIC(12,2),
  currency                TEXT NOT NULL DEFAULT 'AED',
  approval_request_id     BIGINT REFERENCES employee_approval_requests(id),
  offer_document_id       BIGINT REFERENCES dms_documents(id),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              BIGINT REFERENCES user_profiles(id),
  updated_by              BIGINT REFERENCES user_profiles(id),
  deleted_at              TIMESTAMPTZ,
  deleted_by              BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_hr_offers
  BEFORE UPDATE ON hr_offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE hr_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_offers FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_offers_select" ON hr_offers
  FOR SELECT USING (current_user_can_view_hr_recruitment());

CREATE POLICY "hr_offers_insert" ON hr_offers
  FOR INSERT WITH CHECK (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_offers_update" ON hr_offers
  FOR UPDATE USING (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_offers_delete" ON hr_offers
  FOR DELETE USING (current_user_can_manage_hr_recruitment());

-- Indexes
CREATE INDEX idx_hr_offers_candidate ON hr_offers(candidate_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_offers_requisition ON hr_offers(requisition_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_offers_status ON hr_offers(offer_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_offers_valid_until ON hr_offers(valid_until) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_offers_joining_date ON hr_offers(proposed_joining_date) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 6. hr_onboarding_tasks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hr_onboarding_tasks (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id         BIGINT REFERENCES hr_candidates(id) ON DELETE CASCADE,
  employee_id          BIGINT REFERENCES employees(id) ON DELETE CASCADE,
  task_title           TEXT NOT NULL,
  task_category        TEXT CHECK (task_category IN ('document','medical','visa','training','site_access','payroll','it','operations','hr','other')),
  task_status          TEXT NOT NULL DEFAULT 'pending'
                       CHECK (task_status IN ('pending','in_progress','completed','blocked','not_applicable','cancelled')),
  assigned_to          BIGINT REFERENCES user_profiles(id),
  due_date             DATE,
  completed_by         BIGINT REFERENCES user_profiles(id),
  completed_at         TIMESTAMPTZ,
  related_record_type  TEXT,
  related_record_id    BIGINT,
  dms_document_id      BIGINT REFERENCES dms_documents(id),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           BIGINT REFERENCES user_profiles(id),
  updated_by           BIGINT REFERENCES user_profiles(id),
  deleted_at           TIMESTAMPTZ,
  deleted_by           BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_updated_at_hr_onboarding_tasks
  BEFORE UPDATE ON hr_onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE hr_onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_onboarding_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY "hr_onboarding_tasks_select" ON hr_onboarding_tasks
  FOR SELECT USING (current_user_can_view_hr_recruitment());

CREATE POLICY "hr_onboarding_tasks_insert" ON hr_onboarding_tasks
  FOR INSERT WITH CHECK (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_onboarding_tasks_update" ON hr_onboarding_tasks
  FOR UPDATE USING (current_user_can_manage_hr_recruitment());

CREATE POLICY "hr_onboarding_tasks_delete" ON hr_onboarding_tasks
  FOR DELETE USING (current_user_can_manage_hr_recruitment());

-- Indexes
CREATE INDEX idx_hr_onboarding_tasks_candidate ON hr_onboarding_tasks(candidate_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_onboarding_tasks_employee ON hr_onboarding_tasks(employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_onboarding_tasks_status ON hr_onboarding_tasks(task_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_onboarding_tasks_category ON hr_onboarding_tasks(task_category) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_onboarding_tasks_assigned ON hr_onboarding_tasks(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_hr_onboarding_tasks_due_date ON hr_onboarding_tasks(due_date) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 7. employee_recruitment_links
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employee_recruitment_links (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id       BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE UNIQUE,
  candidate_id      BIGINT REFERENCES hr_candidates(id),
  requisition_id    BIGINT REFERENCES hr_job_requisitions(id),
  offer_id          BIGINT REFERENCES hr_offers(id),
  converted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_by      BIGINT REFERENCES user_profiles(id),
  conversion_notes  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        BIGINT REFERENCES user_profiles(id)
);

ALTER TABLE employee_recruitment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_recruitment_links FORCE ROW LEVEL SECURITY;

CREATE POLICY "employee_recruitment_links_select" ON employee_recruitment_links
  FOR SELECT USING (
    current_user_can_view_hr_recruitment()
    OR current_user_has_permission('hr.employees.view')
  );

CREATE POLICY "employee_recruitment_links_insert" ON employee_recruitment_links
  FOR INSERT WITH CHECK (
    current_user_can_manage_hr_recruitment()
    AND current_user_has_permission('hr.employees.create')
  );

CREATE POLICY "employee_recruitment_links_update" ON employee_recruitment_links
  FOR UPDATE USING (current_user_can_manage_hr_recruitment());

CREATE POLICY "employee_recruitment_links_delete" ON employee_recruitment_links
  FOR DELETE USING (current_user_can_manage_hr_recruitment());

-- Indexes
CREATE INDEX idx_emp_recruitment_links_employee ON employee_recruitment_links(employee_id);
CREATE INDEX idx_emp_recruitment_links_candidate ON employee_recruitment_links(candidate_id);
CREATE INDEX idx_emp_recruitment_links_requisition ON employee_recruitment_links(requisition_id);
CREATE INDEX idx_emp_recruitment_links_offer ON employee_recruitment_links(offer_id);
