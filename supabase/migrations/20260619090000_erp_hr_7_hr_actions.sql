-- =============================================================================
-- ERP HR.7 — HR Actions
-- Migration: 20260619090000_erp_hr_7_hr_actions.sql
--
-- Creates 8 HR action tables:
--   1. employee_pro_processes
--   2. employee_hr_actions
--   3. employee_performance_records
--   4. employee_disciplinary_records
--   5. employee_hr_notes
--   6. employee_approval_requests
--   7. employee_eos_cases
--   8. employee_clearance_items
--
-- All tables: BIGINT PK, RLS ENABLED + FORCED, set_updated_at() triggers
-- Indexes in same migration (unlimited/scalable enterprise design)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_can_view_employee_hr_actions(p_employee_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_can_view_employee(p_employee_id)
    AND public.current_user_has_permission('hr.actions.view');
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_employee_hr_actions(p_employee_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_can_manage_employee(p_employee_id)
    AND public.current_user_has_permission('hr.actions.manage');
$$;

-- ---------------------------------------------------------------------------
-- 1. employee_pro_processes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_pro_processes (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  process_type_id       BIGINT REFERENCES public.hr_pro_process_types(id),
  process_title         TEXT NOT NULL,
  process_status        TEXT NOT NULL DEFAULT 'draft'
    CHECK (process_status IN ('draft','requested','in_progress','waiting_for_document','submitted','approved','rejected','cancelled','completed')),
  priority              TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  request_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  target_date           DATE,
  submitted_date        DATE,
  completed_date        DATE,
  assigned_to           BIGINT REFERENCES public.user_profiles(id),
  related_document_id   BIGINT REFERENCES public.dms_documents(id),
  related_record_type   TEXT,
  related_record_id     BIGINT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES public.user_profiles(id),
  updated_by            BIGINT REFERENCES public.user_profiles(id),
  deleted_at            TIMESTAMPTZ,
  deleted_by            BIGINT REFERENCES public.user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_pro_processes
  BEFORE UPDATE ON public.employee_pro_processes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_pro_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_pro_processes FORCE ROW LEVEL SECURITY;

CREATE POLICY pro_select ON public.employee_pro_processes
  FOR SELECT USING (public.current_user_can_view_employee_hr_actions(employee_id));

CREATE POLICY pro_insert ON public.employee_pro_processes
  FOR INSERT WITH CHECK (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY pro_update ON public.employee_pro_processes
  FOR UPDATE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY pro_delete ON public.employee_pro_processes
  FOR DELETE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emp_pro_employee    ON public.employee_pro_processes (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_pro_status      ON public.employee_pro_processes (process_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_pro_type        ON public.employee_pro_processes (process_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_pro_target      ON public.employee_pro_processes (target_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_pro_assigned    ON public.employee_pro_processes (assigned_to) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. employee_hr_actions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_hr_actions (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  action_type           TEXT NOT NULL
    CHECK (action_type IN ('general','probation_review','transfer','promotion','increment_recommendation','status_change','warning','memo','other')),
  action_title          TEXT NOT NULL,
  action_status         TEXT NOT NULL DEFAULT 'open'
    CHECK (action_status IN ('open','in_progress','closed','cancelled')),
  action_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date              DATE,
  assigned_to           BIGINT REFERENCES public.user_profiles(id),
  related_record_type   TEXT,
  related_record_id     BIGINT,
  dms_document_id       BIGINT REFERENCES public.dms_documents(id),
  requires_approval     BOOLEAN NOT NULL DEFAULT FALSE,
  approval_request_id   BIGINT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES public.user_profiles(id),
  updated_by            BIGINT REFERENCES public.user_profiles(id),
  deleted_at            TIMESTAMPTZ,
  deleted_by            BIGINT REFERENCES public.user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_hr_actions
  BEFORE UPDATE ON public.employee_hr_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_hr_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_hr_actions FORCE ROW LEVEL SECURITY;

CREATE POLICY hr_action_select ON public.employee_hr_actions
  FOR SELECT USING (public.current_user_can_view_employee_hr_actions(employee_id));

CREATE POLICY hr_action_insert ON public.employee_hr_actions
  FOR INSERT WITH CHECK (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY hr_action_update ON public.employee_hr_actions
  FOR UPDATE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY hr_action_delete ON public.employee_hr_actions
  FOR DELETE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emp_hra_employee  ON public.employee_hr_actions (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_hra_status    ON public.employee_hr_actions (action_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_hra_type      ON public.employee_hr_actions (action_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_hra_due       ON public.employee_hr_actions (due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_hra_assigned  ON public.employee_hr_actions (assigned_to) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. employee_performance_records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_performance_records (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  review_type           TEXT NOT NULL
    CHECK (review_type IN ('probation','annual','project','incident_followup','other')),
  review_period_start   DATE,
  review_period_end     DATE,
  review_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  reviewer_id           BIGINT REFERENCES public.user_profiles(id),
  rating                TEXT CHECK (rating IN ('excellent','good','satisfactory','needs_improvement','unsatisfactory')),
  summary               TEXT,
  strengths             TEXT,
  improvement_areas     TEXT,
  next_review_date      DATE,
  status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','closed','cancelled')),
  dms_document_id       BIGINT REFERENCES public.dms_documents(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES public.user_profiles(id),
  updated_by            BIGINT REFERENCES public.user_profiles(id),
  deleted_at            TIMESTAMPTZ,
  deleted_by            BIGINT REFERENCES public.user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_performance_records
  BEFORE UPDATE ON public.employee_performance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_performance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_performance_records FORCE ROW LEVEL SECURITY;

CREATE POLICY perf_select ON public.employee_performance_records
  FOR SELECT USING (public.current_user_can_view_employee_hr_actions(employee_id));

CREATE POLICY perf_insert ON public.employee_performance_records
  FOR INSERT WITH CHECK (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY perf_update ON public.employee_performance_records
  FOR UPDATE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY perf_delete ON public.employee_performance_records
  FOR DELETE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emp_perf_employee     ON public.employee_performance_records (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_perf_type         ON public.employee_performance_records (review_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_perf_status       ON public.employee_performance_records (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_perf_review_date  ON public.employee_performance_records (review_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_perf_reviewer     ON public.employee_performance_records (reviewer_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. employee_disciplinary_records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_disciplinary_records (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id               BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  disciplinary_type         TEXT NOT NULL
    CHECK (disciplinary_type IN ('verbal_warning','written_warning','final_warning','suspension_notice','incident','other')),
  incident_date             DATE,
  record_date               DATE NOT NULL DEFAULT CURRENT_DATE,
  severity                  TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  subject                   TEXT NOT NULL,
  description               TEXT,
  action_taken              TEXT,
  status                    TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','closed','cancelled')),
  issued_by                 BIGINT REFERENCES public.user_profiles(id),
  acknowledged_by_employee  BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at           TIMESTAMPTZ,
  dms_document_id           BIGINT REFERENCES public.dms_documents(id),
  creates_operational_block BOOLEAN NOT NULL DEFAULT FALSE,
  operational_block_id      BIGINT REFERENCES public.employee_operational_blocks(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                BIGINT REFERENCES public.user_profiles(id),
  updated_by                BIGINT REFERENCES public.user_profiles(id),
  deleted_at                TIMESTAMPTZ,
  deleted_by                BIGINT REFERENCES public.user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_disciplinary_records
  BEFORE UPDATE ON public.employee_disciplinary_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_disciplinary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_disciplinary_records FORCE ROW LEVEL SECURITY;

CREATE POLICY disc_select ON public.employee_disciplinary_records
  FOR SELECT USING (public.current_user_can_view_employee_hr_actions(employee_id));

CREATE POLICY disc_insert ON public.employee_disciplinary_records
  FOR INSERT WITH CHECK (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY disc_update ON public.employee_disciplinary_records
  FOR UPDATE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY disc_delete ON public.employee_disciplinary_records
  FOR DELETE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emp_disc_employee    ON public.employee_disciplinary_records (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_disc_type        ON public.employee_disciplinary_records (disciplinary_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_disc_status      ON public.employee_disciplinary_records (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_disc_severity    ON public.employee_disciplinary_records (severity) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_disc_record_date ON public.employee_disciplinary_records (record_date) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. employee_hr_notes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_hr_notes (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  note_type           TEXT NOT NULL DEFAULT 'general'
    CHECK (note_type IN ('general','confidential','management','legal','other')),
  note_text           TEXT NOT NULL,
  visibility          TEXT NOT NULL DEFAULT 'hr_only'
    CHECK (visibility IN ('hr_only','management','restricted')),
  related_record_type TEXT,
  related_record_id   BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES public.user_profiles(id),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES public.user_profiles(id)
);

ALTER TABLE public.employee_hr_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_hr_notes FORCE ROW LEVEL SECURITY;

CREATE POLICY notes_select ON public.employee_hr_notes
  FOR SELECT USING (public.current_user_can_view_employee_hr_actions(employee_id));

CREATE POLICY notes_insert ON public.employee_hr_notes
  FOR INSERT WITH CHECK (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY notes_update ON public.employee_hr_notes
  FOR UPDATE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY notes_delete ON public.employee_hr_notes
  FOR DELETE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

-- Indexes (no updated_at trigger — append-like)
CREATE INDEX IF NOT EXISTS idx_emp_notes_employee   ON public.employee_hr_notes (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_notes_type       ON public.employee_hr_notes (note_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_notes_visibility ON public.employee_hr_notes (visibility) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_notes_created    ON public.employee_hr_notes (created_at DESC) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 6. employee_approval_requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_approval_requests (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  approval_type       TEXT NOT NULL
    CHECK (approval_type IN ('hr_action','pro_process','performance','disciplinary','eos','clearance','other')),
  request_title       TEXT NOT NULL,
  request_status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (request_status IN ('pending','approved','rejected','cancelled')),
  approval_role_id    BIGINT REFERENCES public.approval_roles(id),
  requested_by        BIGINT REFERENCES public.user_profiles(id),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by         BIGINT REFERENCES public.user_profiles(id),
  approved_at         TIMESTAMPTZ,
  rejected_by         BIGINT REFERENCES public.user_profiles(id),
  rejected_at         TIMESTAMPTZ,
  cancelled_by        BIGINT REFERENCES public.user_profiles(id),
  cancelled_at        TIMESTAMPTZ,
  decision_reason     TEXT,
  related_record_type TEXT,
  related_record_id   BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES public.user_profiles(id),
  updated_by          BIGINT REFERENCES public.user_profiles(id),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES public.user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_approval_requests
  BEFORE UPDATE ON public.employee_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_approval_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY appr_select ON public.employee_approval_requests
  FOR SELECT USING (public.current_user_can_view_employee_hr_actions(employee_id));

CREATE POLICY appr_insert ON public.employee_approval_requests
  FOR INSERT WITH CHECK (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY appr_update ON public.employee_approval_requests
  FOR UPDATE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

CREATE POLICY appr_delete ON public.employee_approval_requests
  FOR DELETE USING (public.current_user_can_manage_employee_hr_actions(employee_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emp_appr_employee  ON public.employee_approval_requests (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_appr_status    ON public.employee_approval_requests (request_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_appr_type      ON public.employee_approval_requests (approval_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_appr_role      ON public.employee_approval_requests (approval_role_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_appr_requested ON public.employee_approval_requests (requested_at DESC) WHERE deleted_at IS NULL;

-- Now add FK from employee_hr_actions.approval_request_id
ALTER TABLE public.employee_hr_actions
  ADD CONSTRAINT fk_hr_actions_approval_request
  FOREIGN KEY (approval_request_id)
  REFERENCES public.employee_approval_requests(id);

-- ---------------------------------------------------------------------------
-- 7. employee_eos_cases
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_eos_cases (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id               BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  eos_type                  TEXT NOT NULL
    CHECK (eos_type IN ('resignation','termination','contract_end','absconding','death','other')),
  case_status               TEXT NOT NULL DEFAULT 'draft'
    CHECK (case_status IN ('draft','notice_served','clearance_in_progress','pending_final_settlement','closed','cancelled')),
  notice_date               DATE,
  last_working_date         DATE,
  reason                    TEXT,
  final_settlement_status   TEXT NOT NULL DEFAULT 'not_started'
    CHECK (final_settlement_status IN ('not_started','pending_finance','completed')),
  clearance_completed       BOOLEAN NOT NULL DEFAULT FALSE,
  dms_document_id           BIGINT REFERENCES public.dms_documents(id),
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                BIGINT REFERENCES public.user_profiles(id),
  updated_by                BIGINT REFERENCES public.user_profiles(id),
  deleted_at                TIMESTAMPTZ,
  deleted_by                BIGINT REFERENCES public.user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_eos_cases
  BEFORE UPDATE ON public.employee_eos_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_eos_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_eos_cases FORCE ROW LEVEL SECURITY;

CREATE POLICY eos_select ON public.employee_eos_cases
  FOR SELECT USING (
    public.current_user_can_view_employee(employee_id)
    AND (
      public.current_user_has_permission('hr.eos.view')
      OR public.current_user_has_permission('hr.actions.view')
    )
  );

CREATE POLICY eos_insert ON public.employee_eos_cases
  FOR INSERT WITH CHECK (
    public.current_user_can_manage_employee(employee_id)
    AND (
      public.current_user_has_permission('hr.eos.manage')
      OR public.current_user_has_permission('hr.actions.manage')
    )
  );

CREATE POLICY eos_update ON public.employee_eos_cases
  FOR UPDATE USING (
    public.current_user_can_manage_employee(employee_id)
    AND (
      public.current_user_has_permission('hr.eos.manage')
      OR public.current_user_has_permission('hr.actions.manage')
    )
  );

CREATE POLICY eos_delete ON public.employee_eos_cases
  FOR DELETE USING (
    public.current_user_can_manage_employee(employee_id)
    AND (
      public.current_user_has_permission('hr.eos.manage')
      OR public.current_user_has_permission('hr.actions.manage')
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emp_eos_employee         ON public.employee_eos_cases (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_eos_status           ON public.employee_eos_cases (case_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_eos_type             ON public.employee_eos_cases (eos_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_eos_last_working     ON public.employee_eos_cases (last_working_date) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 8. employee_clearance_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_clearance_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  eos_case_id         BIGINT NOT NULL REFERENCES public.employee_eos_cases(id) ON DELETE CASCADE,
  employee_id         BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clearance_area      TEXT NOT NULL
    CHECK (clearance_area IN ('hr','operations','it','finance','camp','workshop','store','hse','other')),
  item_title          TEXT NOT NULL,
  item_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (item_status IN ('pending','cleared','not_applicable','blocked')),
  responsible_user_id BIGINT REFERENCES public.user_profiles(id),
  cleared_by          BIGINT REFERENCES public.user_profiles(id),
  cleared_at          TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES public.user_profiles(id),
  updated_by          BIGINT REFERENCES public.user_profiles(id),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES public.user_profiles(id)
);

CREATE TRIGGER set_updated_at_employee_clearance_items
  BEFORE UPDATE ON public.employee_clearance_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_clearance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_clearance_items FORCE ROW LEVEL SECURITY;

CREATE POLICY clearance_select ON public.employee_clearance_items
  FOR SELECT USING (
    public.current_user_can_view_employee(employee_id)
    AND (
      public.current_user_has_permission('hr.eos.view')
      OR public.current_user_has_permission('hr.actions.view')
    )
  );

CREATE POLICY clearance_insert ON public.employee_clearance_items
  FOR INSERT WITH CHECK (
    public.current_user_can_manage_employee(employee_id)
    AND (
      public.current_user_has_permission('hr.eos.manage')
      OR public.current_user_has_permission('hr.actions.manage')
    )
  );

CREATE POLICY clearance_update ON public.employee_clearance_items
  FOR UPDATE USING (
    public.current_user_can_manage_employee(employee_id)
    AND (
      public.current_user_has_permission('hr.eos.manage')
      OR public.current_user_has_permission('hr.actions.manage')
    )
  );

CREATE POLICY clearance_delete ON public.employee_clearance_items
  FOR DELETE USING (
    public.current_user_can_manage_employee(employee_id)
    AND (
      public.current_user_has_permission('hr.eos.manage')
      OR public.current_user_has_permission('hr.actions.manage')
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emp_cl_eos_case   ON public.employee_clearance_items (eos_case_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_cl_employee   ON public.employee_clearance_items (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_cl_status     ON public.employee_clearance_items (item_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_cl_area       ON public.employee_clearance_items (clearance_area) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_cl_resp_user  ON public.employee_clearance_items (responsible_user_id) WHERE deleted_at IS NULL;
