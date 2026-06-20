-- ============================================================================
-- ERP HR.4 — Time Foundation
-- Migration: 20260618220000_erp_hr_4_time_foundation.sql
-- Scope:
--   1. employee_attendance_punches    (raw, semi-immutable)
--   2. employee_attendance_daily_summary (approved per-day, UNIQUE employee/date)
--   3. employee_attendance_corrections   (append-only audit)
--   4. employee_shift_assignments     (references work_calendars, work_shifts)
--   5. employee_leave_requests        (references hr_leave_types)
--   6. employee_leave_balances        (UNIQUE employee/type/year, computed balance_days)
--   7. employee_overtime_records
--   + Indexes (enterprise-scale, 25 total)
--   + RLS ENABLED + FORCED on all 7 tables
--   + Reuses HR.2 RLS helpers: current_user_can_view_employee / current_user_can_manage_employee
--   + Does NOT create: employee_leave_types, employee_shifts, employee_attendance_logs
--   + Does NOT create: payroll/WPS/assignments/readiness/recruitment tables
-- ============================================================================

-- ============================================================================
-- 1. employee_attendance_punches
--    Raw biometric/manual/import punches. Multiple per employee per day allowed.
--    Semi-immutable: only INSERT and SELECT policies (no UPDATE/DELETE).
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_attendance_punches (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  punch_datetime      TIMESTAMPTZ NOT NULL,
  punch_type          TEXT NOT NULL CHECK (punch_type IN ('in','out','break_start','break_end')),
  work_site_id        BIGINT REFERENCES work_sites(id),
  punch_source        TEXT CHECK (punch_source IN ('biometric','mobile','manual','import')),
  device_reference    TEXT,
  external_reference  TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES user_profiles(id)
);

-- ============================================================================
-- 2. employee_attendance_daily_summary
--    One approved/working summary per employee per date.
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_attendance_daily_summary (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date     DATE NOT NULL,
  attendance_type     TEXT NOT NULL
    CHECK (attendance_type IN ('site','office','yard','workshop','remote','on_leave','absent','holiday')),
  work_site_id        BIGINT REFERENCES work_sites(id),
  first_in_at         TIMESTAMPTZ,
  last_out_at         TIMESTAMPTZ,
  total_hours         NUMERIC(5,2),
  overtime_hours      NUMERIC(5,2) NOT NULL DEFAULT 0,
  late_minutes        INT NOT NULL DEFAULT 0,
  early_out_minutes   INT NOT NULL DEFAULT 0,
  is_missing_punch    BOOLEAN NOT NULL DEFAULT FALSE,
  approval_status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','queried')),
  approved_by         BIGINT REFERENCES user_profiles(id),
  approved_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES user_profiles(id),
  updated_by          BIGINT REFERENCES user_profiles(id),
  UNIQUE(employee_id, attendance_date)
);

CREATE TRIGGER set_employee_attendance_daily_summary_updated_at
  BEFORE UPDATE ON employee_attendance_daily_summary
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. employee_attendance_corrections
--    Append-only correction audit for daily summaries.
--    SELECT + INSERT policies only. No UPDATE. No DELETE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_attendance_corrections (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  summary_id        BIGINT NOT NULL REFERENCES employee_attendance_daily_summary(id) ON DELETE CASCADE,
  employee_id       BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  correction_reason TEXT NOT NULL,
  old_values_json   JSONB,
  new_values_json   JSONB,
  corrected_by      BIGINT NOT NULL REFERENCES user_profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- No set_updated_at trigger (append-only — no updates)

-- ============================================================================
-- 4. employee_shift_assignments
--    References global work_calendars and work_shifts from COMMON MD.1.
--    Do NOT create shift/calendar masters here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_shift_assignments (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id          BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_calendar_id     BIGINT REFERENCES work_calendars(id),
  work_shift_id        BIGINT REFERENCES work_shifts(id),
  weekly_off_day       TEXT,
  overtime_eligible    BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_required  BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from       DATE NOT NULL,
  effective_to         DATE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           BIGINT REFERENCES user_profiles(id),
  updated_by           BIGINT REFERENCES user_profiles(id),
  deleted_at           TIMESTAMPTZ,
  deleted_by           BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_employee_shift_assignments_updated_at
  BEFORE UPDATE ON employee_shift_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 5. employee_leave_requests
--    References HR.1 hr_leave_types. Basic approval: pending → approved/rejected/cancelled.
--    sick_cert_dms_id references dms_documents for medical certificate (DMS readiness).
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_leave_requests (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id       BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id     BIGINT NOT NULL REFERENCES hr_leave_types(id),
  request_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  total_days        NUMERIC(5,1),
  reason            TEXT,
  approval_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','cancelled')),
  approved_by       BIGINT REFERENCES user_profiles(id),
  approved_at       TIMESTAMPTZ,
  rejected_by       BIGINT REFERENCES user_profiles(id),
  rejected_at       TIMESTAMPTZ,
  cancelled_by      BIGINT REFERENCES user_profiles(id),
  cancelled_at      TIMESTAMPTZ,
  sick_cert_dms_id  BIGINT REFERENCES dms_documents(id),
  return_date       DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        BIGINT REFERENCES user_profiles(id),
  updated_by        BIGINT REFERENCES user_profiles(id),
  deleted_at        TIMESTAMPTZ,
  deleted_by        BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_employee_leave_requests_updated_at
  BEFORE UPDATE ON employee_leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 6. employee_leave_balances
--    Per employee / leave type / year. balance_days is GENERATED ALWAYS AS STORED.
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_leave_balances (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id   BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id BIGINT NOT NULL REFERENCES hr_leave_types(id),
  leave_year    INT NOT NULL,
  entitled_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days     NUMERIC(5,1) NOT NULL DEFAULT 0,
  balance_days  NUMERIC(5,1) GENERATED ALWAYS AS (entitled_days - used_days) STORED,
  carry_forward NUMERIC(5,1) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    BIGINT REFERENCES user_profiles(id),
  updated_by    BIGINT REFERENCES user_profiles(id),
  UNIQUE(employee_id, leave_type_id, leave_year)
);

CREATE TRIGGER set_employee_leave_balances_updated_at
  BEFORE UPDATE ON employee_leave_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 7. employee_overtime_records
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_overtime_records (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  overtime_date   DATE NOT NULL,
  hours           NUMERIC(4,1) NOT NULL CHECK (hours >= 0),
  reason          TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','cancelled')),
  approved_by     BIGINT REFERENCES user_profiles(id),
  approved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      BIGINT REFERENCES user_profiles(id),
  updated_by      BIGINT REFERENCES user_profiles(id),
  deleted_at      TIMESTAMPTZ,
  deleted_by      BIGINT REFERENCES user_profiles(id)
);

CREATE TRIGGER set_employee_overtime_records_updated_at
  BEFORE UPDATE ON employee_overtime_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Indexes — employee_attendance_punches
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_emp_att_punches_employee_datetime
  ON employee_attendance_punches (employee_id, punch_datetime);
CREATE INDEX IF NOT EXISTS idx_emp_att_punches_datetime
  ON employee_attendance_punches (punch_datetime);
CREATE INDEX IF NOT EXISTS idx_emp_att_punches_site
  ON employee_attendance_punches (work_site_id);

-- ============================================================================
-- Indexes — employee_attendance_daily_summary
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_emp_att_summary_employee_date
  ON employee_attendance_daily_summary (employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_emp_att_summary_date
  ON employee_attendance_daily_summary (attendance_date);
CREATE INDEX IF NOT EXISTS idx_emp_att_summary_status
  ON employee_attendance_daily_summary (approval_status, attendance_date);
CREATE INDEX IF NOT EXISTS idx_emp_att_summary_site
  ON employee_attendance_daily_summary (work_site_id);

-- ============================================================================
-- Indexes — employee_attendance_corrections
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_emp_att_corrections_summary
  ON employee_attendance_corrections (summary_id);
CREATE INDEX IF NOT EXISTS idx_emp_att_corrections_employee
  ON employee_attendance_corrections (employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_att_corrections_created
  ON employee_attendance_corrections (created_at);

-- ============================================================================
-- Indexes — employee_shift_assignments
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_emp_shift_assign_employee
  ON employee_shift_assignments (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_shift_assign_calendar
  ON employee_shift_assignments (work_calendar_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_shift_assign_shift
  ON employee_shift_assignments (work_shift_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_shift_assign_effective
  ON employee_shift_assignments (effective_from, effective_to) WHERE deleted_at IS NULL;

-- ============================================================================
-- Indexes — employee_leave_requests
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_emp_leave_req_employee
  ON employee_leave_requests (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_leave_req_type
  ON employee_leave_requests (leave_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_leave_req_dates
  ON employee_leave_requests (start_date, end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_leave_req_status
  ON employee_leave_requests (approval_status, start_date) WHERE deleted_at IS NULL;

-- ============================================================================
-- Indexes — employee_leave_balances
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_emp_leave_bal_employee_year
  ON employee_leave_balances (employee_id, leave_year);
CREATE INDEX IF NOT EXISTS idx_emp_leave_bal_type_year
  ON employee_leave_balances (leave_type_id, leave_year);

-- ============================================================================
-- Indexes — employee_overtime_records
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_emp_overtime_employee_date
  ON employee_overtime_records (employee_id, overtime_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_overtime_date
  ON employee_overtime_records (overtime_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emp_overtime_status
  ON employee_overtime_records (approval_status, overtime_date) WHERE deleted_at IS NULL;

-- ============================================================================
-- RLS ENABLE + FORCE on all 7 tables
-- ============================================================================

ALTER TABLE employee_attendance_punches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_attendance_punches        FORCE ROW LEVEL SECURITY;

ALTER TABLE employee_attendance_daily_summary  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_attendance_daily_summary  FORCE ROW LEVEL SECURITY;

ALTER TABLE employee_attendance_corrections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_attendance_corrections    FORCE ROW LEVEL SECURITY;

ALTER TABLE employee_shift_assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shift_assignments         FORCE ROW LEVEL SECURITY;

ALTER TABLE employee_leave_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_leave_requests            FORCE ROW LEVEL SECURITY;

ALTER TABLE employee_leave_balances            ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_leave_balances            FORCE ROW LEVEL SECURITY;

ALTER TABLE employee_overtime_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_overtime_records          FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies — employee_attendance_punches (SELECT + INSERT only — semi-immutable)
-- ============================================================================

CREATE POLICY emp_att_punch_select
  ON employee_attendance_punches FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.attendance.view')
  );

CREATE POLICY emp_att_punch_insert
  ON employee_attendance_punches FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  );

-- ============================================================================
-- RLS Policies — employee_attendance_daily_summary
-- ============================================================================

CREATE POLICY emp_att_summary_select
  ON employee_attendance_daily_summary FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.attendance.view')
  );

CREATE POLICY emp_att_summary_insert
  ON employee_attendance_daily_summary FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  );

CREATE POLICY emp_att_summary_update
  ON employee_attendance_daily_summary FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  );

-- ============================================================================
-- RLS Policies — employee_attendance_corrections (APPEND-ONLY: SELECT + INSERT only)
-- ============================================================================

CREATE POLICY emp_att_correction_select
  ON employee_attendance_corrections FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.attendance.view')
  );

CREATE POLICY emp_att_correction_insert
  ON employee_attendance_corrections FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  );
-- NO UPDATE policy
-- NO DELETE policy

-- ============================================================================
-- RLS Policies — employee_shift_assignments
-- ============================================================================

CREATE POLICY emp_shift_assign_select
  ON employee_shift_assignments FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.attendance.view')
  );

CREATE POLICY emp_shift_assign_insert
  ON employee_shift_assignments FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  );

CREATE POLICY emp_shift_assign_update
  ON employee_shift_assignments FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  );

-- ============================================================================
-- RLS Policies — employee_leave_requests
-- ============================================================================

CREATE POLICY emp_leave_req_select
  ON employee_leave_requests FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.leave.view')
  );

CREATE POLICY emp_leave_req_insert
  ON employee_leave_requests FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.leave.manage')
  );

CREATE POLICY emp_leave_req_update
  ON employee_leave_requests FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.leave.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.leave.manage')
  );

-- ============================================================================
-- RLS Policies — employee_leave_balances
-- ============================================================================

CREATE POLICY emp_leave_bal_select
  ON employee_leave_balances FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.leave.view')
  );

CREATE POLICY emp_leave_bal_insert
  ON employee_leave_balances FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.leave.manage')
  );

CREATE POLICY emp_leave_bal_update
  ON employee_leave_balances FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.leave.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.leave.manage')
  );

-- ============================================================================
-- RLS Policies — employee_overtime_records
-- ============================================================================

CREATE POLICY emp_overtime_select
  ON employee_overtime_records FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND current_user_has_permission('hr.attendance.view')
  );

CREATE POLICY emp_overtime_insert
  ON employee_overtime_records FOR INSERT
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  );

CREATE POLICY emp_overtime_update
  ON employee_overtime_records FOR UPDATE
  USING (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  )
  WITH CHECK (
    current_user_can_manage_employee(employee_id)
    AND current_user_has_permission('hr.attendance.manage')
  );
