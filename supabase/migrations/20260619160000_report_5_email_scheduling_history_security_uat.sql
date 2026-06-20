-- ─────────────────────────────────────────────────────────────────────────────
-- REPORT.5 — Email / Scheduling / Report History / Security UAT
-- Migration: 20260619160000_report_5_email_scheduling_history_security_uat.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (
  permission_code, permission_name, module_code, action_code,
  description, is_active, is_system_permission, is_visible, sort_order
)
VALUES
  ('reports.schedule.view',          'View Report Schedules',          'REPORTS', 'schedule_view',   'View scheduled report configurations',               true, true, true, 908),
  ('reports.schedule.manage',        'Manage Report Schedules',        'REPORTS', 'schedule_manage', 'Create, edit, delete and run report schedules',      true, true, true, 909),
  ('reports.saved_filters.manage',   'Manage Saved Report Filters',    'REPORTS', 'sf_manage',       'Create and manage saved report filter presets',      true, true, true, 910),
  ('reports.column_profiles.manage', 'Manage Report Column Profiles',  'REPORTS', 'cp_manage',       'Create and manage report column visibility profiles', true, true, true, 911)
ON CONFLICT (permission_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. erp_report_saved_filters
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_report_saved_filters (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id           BIGINT NOT NULL REFERENCES public.erp_report_registry(id) ON DELETE CASCADE,
  user_profile_id     BIGINT NOT NULL REFERENCES public.user_profiles(id),
  filter_name         TEXT NOT NULL,
  filters_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default          BOOLEAN NOT NULL DEFAULT false,
  is_shared           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES public.user_profiles(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. erp_report_column_profiles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_report_column_profiles (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id           BIGINT NOT NULL REFERENCES public.erp_report_registry(id) ON DELETE CASCADE,
  user_profile_id     BIGINT NOT NULL REFERENCES public.user_profiles(id),
  profile_name        TEXT NOT NULL,
  column_config_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default          BOOLEAN NOT NULL DEFAULT false,
  is_shared           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  deleted_by          BIGINT REFERENCES public.user_profiles(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. erp_report_schedules
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_report_schedules (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schedule_code           TEXT UNIQUE,
  report_id               BIGINT NOT NULL REFERENCES public.erp_report_registry(id) ON DELETE CASCADE,
  created_by              BIGINT NOT NULL REFERENCES public.user_profiles(id),
  owner_company_id        BIGINT REFERENCES public.owner_companies(id),
  schedule_name           TEXT NOT NULL,
  filters_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_template_id    BIGINT REFERENCES public.erp_report_templates(id),
  output_format           TEXT NOT NULL DEFAULT 'pdf'
                            CHECK (output_format IN ('pdf', 'excel', 'csv')),
  recipient_to            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  recipient_cc            TEXT[] DEFAULT ARRAY[]::TEXT[],
  email_subject_template  TEXT,
  email_body_template     TEXT,
  frequency               TEXT NOT NULL
                            CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week             INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month            INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
  time_of_day             TIME,
  timezone                TEXT NOT NULL DEFAULT 'Asia/Dubai',
  next_run_at             TIMESTAMPTZ,
  last_run_at             TIMESTAMPTZ,
  last_status             TEXT CHECK (last_status IN ('success', 'failed', 'skipped', 'cancelled')),
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ,
  deleted_by              BIGINT REFERENCES public.user_profiles(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rpt_saved_filters_report_id
  ON public.erp_report_saved_filters(report_id);

CREATE INDEX IF NOT EXISTS idx_rpt_saved_filters_user
  ON public.erp_report_saved_filters(user_profile_id);

CREATE INDEX IF NOT EXISTS idx_rpt_col_profiles_report_id
  ON public.erp_report_column_profiles(report_id);

CREATE INDEX IF NOT EXISTS idx_rpt_col_profiles_user
  ON public.erp_report_column_profiles(user_profile_id);

CREATE INDEX IF NOT EXISTS idx_rpt_schedules_report_id
  ON public.erp_report_schedules(report_id);

CREATE INDEX IF NOT EXISTS idx_rpt_schedules_created_by
  ON public.erp_report_schedules(created_by);

CREATE INDEX IF NOT EXISTS idx_rpt_schedules_next_run_at
  ON public.erp_report_schedules(next_run_at) WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rpt_schedules_owner_company
  ON public.erp_report_schedules(owner_company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ENABLE AND FORCE RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.erp_report_saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_report_saved_filters FORCE ROW LEVEL SECURITY;

ALTER TABLE public.erp_report_column_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_report_column_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.erp_report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_report_schedules FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS POLICIES — erp_report_saved_filters
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "rpt_saved_filters_select"
  ON public.erp_report_saved_filters FOR SELECT
  USING (
    user_profile_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR is_shared = true
    OR public.current_user_has_permission('reports.saved_filters.manage')
  );

CREATE POLICY "rpt_saved_filters_insert"
  ON public.erp_report_saved_filters FOR INSERT
  WITH CHECK (
    user_profile_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    AND public.current_user_has_permission('reports.run')
  );

CREATE POLICY "rpt_saved_filters_update"
  ON public.erp_report_saved_filters FOR UPDATE
  USING (
    user_profile_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR public.current_user_has_permission('reports.saved_filters.manage')
  );

CREATE POLICY "rpt_saved_filters_delete"
  ON public.erp_report_saved_filters FOR DELETE
  USING (
    user_profile_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR public.current_user_has_permission('reports.saved_filters.manage')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RLS POLICIES — erp_report_column_profiles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "rpt_col_profiles_select"
  ON public.erp_report_column_profiles FOR SELECT
  USING (
    user_profile_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR is_shared = true
    OR public.current_user_has_permission('reports.column_profiles.manage')
  );

CREATE POLICY "rpt_col_profiles_insert"
  ON public.erp_report_column_profiles FOR INSERT
  WITH CHECK (
    user_profile_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    AND public.current_user_has_permission('reports.run')
  );

CREATE POLICY "rpt_col_profiles_update"
  ON public.erp_report_column_profiles FOR UPDATE
  USING (
    user_profile_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR public.current_user_has_permission('reports.column_profiles.manage')
  );

CREATE POLICY "rpt_col_profiles_delete"
  ON public.erp_report_column_profiles FOR DELETE
  USING (
    user_profile_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR public.current_user_has_permission('reports.column_profiles.manage')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RLS POLICIES — erp_report_schedules
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "rpt_schedules_select"
  ON public.erp_report_schedules FOR SELECT
  USING (
    created_by = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR public.current_user_has_permission('reports.schedule.view')
    OR public.current_user_has_permission('reports.schedule.manage')
  );

CREATE POLICY "rpt_schedules_insert"
  ON public.erp_report_schedules FOR INSERT
  WITH CHECK (
    public.current_user_has_permission('reports.schedule.manage')
    OR created_by = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "rpt_schedules_update"
  ON public.erp_report_schedules FOR UPDATE
  USING (
    created_by = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR public.current_user_has_permission('reports.schedule.manage')
  );

CREATE POLICY "rpt_schedules_delete"
  ON public.erp_report_schedules FOR DELETE
  USING (
    created_by = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR public.current_user_has_permission('reports.schedule.manage')
  );
