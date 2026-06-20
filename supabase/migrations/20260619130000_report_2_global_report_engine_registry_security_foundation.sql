-- =============================================================================
-- REPORT.2 — Global Report Engine + Registry + Security Foundation
-- Date: 2026-06-19
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SEED PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active, is_system_permission, is_visible, sort_order)
VALUES
  ('reports.view',         'View Reports',         'REPORTS', 'view',   'View report registry, templates, and branding profiles',   true, true, true, 901),
  ('reports.run',          'Run Reports',          'REPORTS', 'run',    'Generate and run reports',                                  true, true, true, 902),
  ('reports.export',       'Export Reports',       'REPORTS', 'export', 'Export reports to PDF, Excel, CSV, or print',              true, true, true, 903),
  ('reports.email',        'Email Reports',        'REPORTS', 'email',  'Send reports via email and create delivery logs',          true, true, true, 904),
  ('reports.manage',       'Manage Reports',       'REPORTS', 'manage', 'Create and update report templates, branding and registry', true, true, true, 905),
  ('reports.history.view', 'View Report History',  'REPORTS', 'view',   'View all report run history',                              true, true, true, 906),
  ('reports.sign',         'Sign Reports',         'REPORTS', 'sign',   'Include stamp and signature in report output',             true, true, true, 907)
ON CONFLICT (permission_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CREATE erp_report_branding_profiles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.erp_report_branding_profiles (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_code           TEXT UNIQUE NOT NULL,
  profile_name           TEXT NOT NULL,
  profile_type           TEXT NOT NULL DEFAULT 'company'
                           CHECK (profile_type IN ('company','group','neutral','custom')),
  owner_company_id       BIGINT REFERENCES public.owner_companies(id),
  logo_url               TEXT,
  small_logo_url         TEXT,
  stamp_url              TEXT,
  signature_url          TEXT,
  watermark_url          TEXT,
  watermark_text         TEXT,
  theme_primary_color    TEXT DEFAULT '#1e293b',
  theme_secondary_color  TEXT DEFAULT '#475569',
  theme_header_bg_color  TEXT DEFAULT '#1e293b',
  theme_header_text_color TEXT DEFAULT '#ffffff',
  legal_name_en          TEXT,
  legal_name_ar          TEXT,
  trade_name_en          TEXT,
  trade_name_ar          TEXT,
  address_block_en       TEXT,
  address_block_ar       TEXT,
  phone                  TEXT,
  email                  TEXT,
  website                TEXT,
  po_box                 TEXT,
  trn                    TEXT,
  trade_license_no       TEXT,
  footer_text_en         TEXT,
  footer_text_ar         TEXT,
  signatory_name         TEXT,
  signatory_title_en     TEXT,
  signatory_title_ar     TEXT,
  is_default_for_company BOOLEAN DEFAULT false,
  is_group_profile       BOOLEAN DEFAULT false,
  is_neutral_profile     BOOLEAN DEFAULT false,
  is_active              BOOLEAN DEFAULT true,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  created_by             BIGINT REFERENCES public.user_profiles(id),
  updated_by             BIGINT REFERENCES public.user_profiles(id),
  deleted_at             TIMESTAMPTZ,
  deleted_by             BIGINT REFERENCES public.user_profiles(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CREATE erp_report_templates
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.erp_report_templates (
  id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_code              TEXT UNIQUE NOT NULL,
  template_name              TEXT NOT NULL,
  template_type              TEXT NOT NULL
                               CHECK (template_type IN ('report','letter','certificate','form','checklist','badge','external_submission','group_summary')),
  branding_profile_id        BIGINT REFERENCES public.erp_report_branding_profiles(id),
  default_orientation        TEXT DEFAULT 'portrait'
                               CHECK (default_orientation IN ('portrait','landscape')),
  page_size                  TEXT DEFAULT 'a4'
                               CHECK (page_size IN ('a4','letter','legal')),
  font_family                TEXT DEFAULT 'Inter',
  language_mode              TEXT DEFAULT 'en'
                               CHECK (language_mode IN ('en','ar','bilingual')),
  show_logo                  BOOLEAN DEFAULT true,
  show_small_logo            BOOLEAN DEFAULT false,
  show_address               BOOLEAN DEFAULT true,
  show_trn                   BOOLEAN DEFAULT true,
  show_license               BOOLEAN DEFAULT true,
  show_signatory             BOOLEAN DEFAULT false,
  show_stamp                 BOOLEAN DEFAULT false,
  show_watermark             BOOLEAN DEFAULT false,
  requires_stamp_permission  BOOLEAN DEFAULT false,
  watermark_text             TEXT,
  body_html_en               TEXT,
  body_html_ar               TEXT,
  custom_css                 TEXT,
  header_layout_json         JSONB DEFAULT '{}'::jsonb,
  footer_layout_json         JSONB DEFAULT '{}'::jsonb,
  body_layout_json           JSONB DEFAULT '{}'::jsonb,
  style_json                 JSONB DEFAULT '{}'::jsonb,
  version_no                 INTEGER DEFAULT 1,
  is_default                 BOOLEAN DEFAULT false,
  is_active                  BOOLEAN DEFAULT true,
  created_at                 TIMESTAMPTZ DEFAULT now(),
  updated_at                 TIMESTAMPTZ DEFAULT now(),
  created_by                 BIGINT REFERENCES public.user_profiles(id),
  updated_by                 BIGINT REFERENCES public.user_profiles(id),
  deleted_at                 TIMESTAMPTZ,
  deleted_by                 BIGINT REFERENCES public.user_profiles(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CREATE erp_report_registry
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.erp_report_registry (
  id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_code                TEXT UNIQUE NOT NULL,
  report_name_en             TEXT NOT NULL,
  report_name_ar             TEXT,
  module_code                TEXT NOT NULL,
  report_category            TEXT NOT NULL
                               CHECK (report_category IN ('list','summary','detail','dashboard_snapshot','letter','certificate','form','checklist','compliance','audit','export','badge','external_submission','group_summary')),
  description_en             TEXT,
  description_ar             TEXT,
  default_template_id        BIGINT REFERENCES public.erp_report_templates(id),
  default_output_formats     TEXT[] DEFAULT ARRAY['screen','pdf','excel','csv','print'],
  default_orientation        TEXT DEFAULT 'portrait'
                               CHECK (default_orientation IN ('portrait','landscape')),
  branding_strategy          TEXT DEFAULT 'auto_by_owner_company'
                               CHECK (branding_strategy IN ('auto_by_owner_company','manual_required','group_default','template_fixed','none')),
  branding_source_path       TEXT,
  required_permissions       TEXT[] DEFAULT ARRAY[]::TEXT[],
  sensitive_profile          TEXT DEFAULT 'normal'
                               CHECK (sensitive_profile IN ('normal','payroll','medical','disciplinary','recruitment','dms_confidential','mixed_sensitive')),
  sensitive_field_rules_json JSONB DEFAULT '{}'::jsonb,
  filter_schema_json         JSONB DEFAULT '{}'::jsonb,
  column_schema_json         JSONB DEFAULT '{}'::jsonb,
  supports_numbering         BOOLEAN DEFAULT false,
  numbering_rule_code        TEXT,
  supports_scheduling        BOOLEAN DEFAULT false,
  is_letter_type             BOOLEAN DEFAULT false,
  sort_order                 INTEGER DEFAULT 100,
  is_system                  BOOLEAN DEFAULT false,
  is_active                  BOOLEAN DEFAULT true,
  created_at                 TIMESTAMPTZ DEFAULT now(),
  updated_at                 TIMESTAMPTZ DEFAULT now(),
  created_by                 BIGINT REFERENCES public.user_profiles(id),
  updated_by                 BIGINT REFERENCES public.user_profiles(id),
  deleted_at                 TIMESTAMPTZ,
  deleted_by                 BIGINT REFERENCES public.user_profiles(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CREATE erp_report_runs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.erp_report_runs (
  id                            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_reference                 TEXT UNIQUE,
  report_id                     BIGINT REFERENCES public.erp_report_registry(id),
  report_code                   TEXT NOT NULL,
  run_by                        BIGINT REFERENCES public.user_profiles(id),
  run_status                    TEXT DEFAULT 'success'
                                  CHECK (run_status IN ('success','failed','cancelled','running')),
  output_format                 TEXT NOT NULL
                                  CHECK (output_format IN ('screen','pdf','excel','csv','print','email')),
  filters_json                  JSONB DEFAULT '{}'::jsonb,
  selected_template_id          BIGINT REFERENCES public.erp_report_templates(id),
  resolved_branding_profile_id  BIGINT REFERENCES public.erp_report_branding_profiles(id),
  owner_company_ids             BIGINT[] DEFAULT ARRAY[]::BIGINT[],
  was_multi_company             BOOLEAN DEFAULT false,
  template_selected_manually    BOOLEAN DEFAULT false,
  row_count                     INTEGER,
  sensitive_profile             TEXT,
  sensitive_data_included       BOOLEAN DEFAULT false,
  redaction_summary_json        JSONB DEFAULT '{}'::jsonb,
  email_sent                    BOOLEAN DEFAULT false,
  email_to                      TEXT[],
  email_delivery_status         TEXT,
  numbering_issued              TEXT,
  started_at                    TIMESTAMPTZ DEFAULT now(),
  completed_at                  TIMESTAMPTZ,
  duration_ms                   INTEGER,
  error_message                 TEXT,
  created_at                    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CREATE erp_report_delivery_logs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.erp_report_delivery_logs (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id                 BIGINT REFERENCES public.erp_report_runs(id) ON DELETE SET NULL,
  delivery_type          TEXT DEFAULT 'email'
                           CHECK (delivery_type IN ('email','scheduled_email','download','print')),
  recipient_to           TEXT[],
  recipient_cc           TEXT[],
  recipient_bcc          TEXT[],
  subject                TEXT,
  body_preview           TEXT,
  attachment_format      TEXT,
  attachment_filename    TEXT,
  attachment_size_bytes  BIGINT,
  provider               TEXT DEFAULT 'microsoft_graph',
  delivery_status        TEXT DEFAULT 'queued'
                           CHECK (delivery_status IN ('queued','sent','failed','cancelled')),
  provider_response_code TEXT,
  success                BOOLEAN,
  sent_at                TIMESTAMPTZ,
  error_message          TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  created_by             BIGINT REFERENCES public.user_profiles(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. EXTEND owner_companies WITH REPORT BRANDING COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.owner_companies
  ADD COLUMN IF NOT EXISTS small_logo_url                TEXT,
  ADD COLUMN IF NOT EXISTS stamp_url                     TEXT,
  ADD COLUMN IF NOT EXISTS signature_url                 TEXT,
  ADD COLUMN IF NOT EXISTS watermark_url                 TEXT,
  ADD COLUMN IF NOT EXISTS report_theme_primary_color    TEXT,
  ADD COLUMN IF NOT EXISTS report_theme_secondary_color  TEXT,
  ADD COLUMN IF NOT EXISTS report_footer_text_en         TEXT,
  ADD COLUMN IF NOT EXISTS report_footer_text_ar         TEXT,
  ADD COLUMN IF NOT EXISTS report_signatory_name         TEXT,
  ADD COLUMN IF NOT EXISTS report_signatory_title_en     TEXT,
  ADD COLUMN IF NOT EXISTS report_signatory_title_ar     TEXT,
  ADD COLUMN IF NOT EXISTS default_report_template_id    BIGINT,
  ADD COLUMN IF NOT EXISTS default_letter_template_id    BIGINT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- erp_report_branding_profiles
CREATE INDEX IF NOT EXISTS idx_rpt_branding_owner_company
  ON public.erp_report_branding_profiles(owner_company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rpt_branding_profile_type
  ON public.erp_report_branding_profiles(profile_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rpt_branding_is_active
  ON public.erp_report_branding_profiles(is_active)
  WHERE deleted_at IS NULL;

-- erp_report_templates
CREATE INDEX IF NOT EXISTS idx_rpt_templates_template_type
  ON public.erp_report_templates(template_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rpt_templates_branding_profile
  ON public.erp_report_templates(branding_profile_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rpt_templates_is_active
  ON public.erp_report_templates(is_active)
  WHERE deleted_at IS NULL;

-- erp_report_registry
CREATE INDEX IF NOT EXISTS idx_rpt_registry_report_code
  ON public.erp_report_registry(report_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rpt_registry_module_code
  ON public.erp_report_registry(module_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rpt_registry_report_category
  ON public.erp_report_registry(report_category)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rpt_registry_is_active
  ON public.erp_report_registry(is_active)
  WHERE deleted_at IS NULL;

-- erp_report_runs
CREATE INDEX IF NOT EXISTS idx_rpt_runs_report_code
  ON public.erp_report_runs(report_code);

CREATE INDEX IF NOT EXISTS idx_rpt_runs_report_id
  ON public.erp_report_runs(report_id);

CREATE INDEX IF NOT EXISTS idx_rpt_runs_run_by
  ON public.erp_report_runs(run_by);

CREATE INDEX IF NOT EXISTS idx_rpt_runs_started_at
  ON public.erp_report_runs(started_at);

CREATE INDEX IF NOT EXISTS idx_rpt_runs_selected_template
  ON public.erp_report_runs(selected_template_id);

CREATE INDEX IF NOT EXISTS idx_rpt_runs_was_multi_company
  ON public.erp_report_runs(was_multi_company);

-- erp_report_delivery_logs
CREATE INDEX IF NOT EXISTS idx_rpt_delivery_run_id
  ON public.erp_report_delivery_logs(run_id);

CREATE INDEX IF NOT EXISTS idx_rpt_delivery_status
  ON public.erp_report_delivery_logs(delivery_status);

CREATE INDEX IF NOT EXISTS idx_rpt_delivery_created_at
  ON public.erp_report_delivery_logs(created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ENABLE AND FORCE RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.erp_report_branding_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_report_branding_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.erp_report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_report_templates FORCE ROW LEVEL SECURITY;

ALTER TABLE public.erp_report_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_report_registry FORCE ROW LEVEL SECURITY;

ALTER TABLE public.erp_report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_report_runs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.erp_report_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_report_delivery_logs FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- erp_report_branding_profiles
CREATE POLICY "rpt_branding_select"
  ON public.erp_report_branding_profiles FOR SELECT
  USING (public.current_user_has_permission('reports.view'));

CREATE POLICY "rpt_branding_insert"
  ON public.erp_report_branding_profiles FOR INSERT
  WITH CHECK (public.current_user_has_permission('reports.manage'));

CREATE POLICY "rpt_branding_update"
  ON public.erp_report_branding_profiles FOR UPDATE
  USING (public.current_user_has_permission('reports.manage'));

CREATE POLICY "rpt_branding_delete"
  ON public.erp_report_branding_profiles FOR DELETE
  USING (public.current_user_has_permission('reports.manage'));

-- erp_report_templates
CREATE POLICY "rpt_templates_select"
  ON public.erp_report_templates FOR SELECT
  USING (public.current_user_has_permission('reports.view'));

CREATE POLICY "rpt_templates_insert"
  ON public.erp_report_templates FOR INSERT
  WITH CHECK (public.current_user_has_permission('reports.manage'));

CREATE POLICY "rpt_templates_update"
  ON public.erp_report_templates FOR UPDATE
  USING (public.current_user_has_permission('reports.manage'));

CREATE POLICY "rpt_templates_delete"
  ON public.erp_report_templates FOR DELETE
  USING (public.current_user_has_permission('reports.manage'));

-- erp_report_registry
CREATE POLICY "rpt_registry_select"
  ON public.erp_report_registry FOR SELECT
  USING (public.current_user_has_permission('reports.view'));

CREATE POLICY "rpt_registry_insert"
  ON public.erp_report_registry FOR INSERT
  WITH CHECK (public.current_user_has_permission('reports.manage'));

CREATE POLICY "rpt_registry_update"
  ON public.erp_report_registry FOR UPDATE
  USING (public.current_user_has_permission('reports.manage'));

CREATE POLICY "rpt_registry_delete"
  ON public.erp_report_registry FOR DELETE
  USING (public.current_user_has_permission('reports.manage'));

-- erp_report_runs: users can see their own runs; history viewers see all
CREATE POLICY "rpt_runs_select_own"
  ON public.erp_report_runs FOR SELECT
  USING (
    run_by = (
      SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1
    )
    OR public.current_user_has_permission('reports.history.view')
  );

CREATE POLICY "rpt_runs_insert"
  ON public.erp_report_runs FOR INSERT
  WITH CHECK (public.current_user_has_permission('reports.run'));

-- No UPDATE or DELETE by normal users — immutable audit log
CREATE POLICY "rpt_runs_no_update"
  ON public.erp_report_runs FOR UPDATE
  USING (public.current_user_is_global_admin());

CREATE POLICY "rpt_runs_no_delete"
  ON public.erp_report_runs FOR DELETE
  USING (public.current_user_is_global_admin());

-- erp_report_delivery_logs
CREATE POLICY "rpt_delivery_select"
  ON public.erp_report_delivery_logs FOR SELECT
  USING (public.current_user_has_permission('reports.history.view'));

CREATE POLICY "rpt_delivery_insert"
  ON public.erp_report_delivery_logs FOR INSERT
  WITH CHECK (public.current_user_has_permission('reports.email'));

CREATE POLICY "rpt_delivery_no_update"
  ON public.erp_report_delivery_logs FOR UPDATE
  USING (public.current_user_is_global_admin());

CREATE POLICY "rpt_delivery_no_delete"
  ON public.erp_report_delivery_logs FOR DELETE
  USING (public.current_user_is_global_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. SEED: GROUP + NEUTRAL BRANDING PROFILES
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.erp_report_branding_profiles (
  profile_code, profile_name, profile_type,
  theme_primary_color, theme_secondary_color,
  theme_header_bg_color, theme_header_text_color,
  is_group_profile, is_neutral_profile, is_default_for_company, is_active
)
VALUES
  (
    'GROUP_DEFAULT', 'Group Default Profile', 'group',
    '#1e293b', '#475569', '#1e293b', '#ffffff',
    true, false, false, true
  ),
  (
    'NEUTRAL_DEFAULT', 'Neutral Default Profile', 'neutral',
    '#374151', '#6b7280', '#374151', '#ffffff',
    false, true, false, true
  )
ON CONFLICT (profile_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. SEED: BRANDING PROFILES FROM ACTIVE OWNER COMPANIES (DYNAMIC)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  _company RECORD;
  _code    TEXT;
BEGIN
  FOR _company IN
    SELECT id, legal_name_en, legal_name_ar, company_code,
           logo_url, primary_email, primary_phone, website,
           po_box, trn, trade_license_no,
           address_line_1, city, emirate
    FROM public.owner_companies
    WHERE status = 'active'
  LOOP
    _code := 'COMPANY_' || _company.id || '_DEFAULT';

    INSERT INTO public.erp_report_branding_profiles (
      profile_code, profile_name, profile_type,
      owner_company_id,
      logo_url,
      legal_name_en, legal_name_ar,
      email, phone, website,
      po_box, trn, trade_license_no,
      address_block_en,
      theme_primary_color, theme_secondary_color,
      theme_header_bg_color, theme_header_text_color,
      is_default_for_company, is_group_profile, is_neutral_profile, is_active
    )
    VALUES (
      _code,
      COALESCE(_company.legal_name_en, 'Company ' || _company.id) || ' — Default',
      'company',
      _company.id,
      _company.logo_url,
      _company.legal_name_en,
      _company.legal_name_ar,
      _company.primary_email,
      _company.primary_phone,
      _company.website,
      _company.po_box,
      _company.trn,
      _company.trade_license_no,
      CONCAT_WS(', ',
        NULLIF(_company.address_line_1, ''),
        NULLIF(_company.city, ''),
        NULLIF(_company.emirate, ''),
        'UAE'
      ),
      '#1e293b', '#475569', '#1e293b', '#ffffff',
      true, false, false, true
    )
    ON CONFLICT (profile_code) DO NOTHING;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. SEED: DEFAULT TEMPLATES
-- ─────────────────────────────────────────────────────────────────────────────

-- Link to neutral or group profiles
WITH group_profile AS (
  SELECT id FROM public.erp_report_branding_profiles WHERE profile_code = 'GROUP_DEFAULT' LIMIT 1
),
neutral_profile AS (
  SELECT id FROM public.erp_report_branding_profiles WHERE profile_code = 'NEUTRAL_DEFAULT' LIMIT 1
)
INSERT INTO public.erp_report_templates (
  template_code, template_name, template_type,
  branding_profile_id,
  default_orientation, page_size, font_family, language_mode,
  show_logo, show_address, show_trn, show_license,
  is_default, is_active
)
SELECT v.template_code, v.template_name, v.template_type,
       CASE WHEN v.use_group THEN (SELECT id FROM group_profile) ELSE (SELECT id FROM neutral_profile) END,
       v.orientation, 'a4', 'Inter', 'en',
       true, true, true, true,
       true, true
FROM (VALUES
  ('DEFAULT_REPORT_TEMPLATE',               'Default Report Template',               'report',               false, 'portrait'),
  ('DEFAULT_LETTER_TEMPLATE',               'Default Letter Template',               'letter',               false, 'portrait'),
  ('DEFAULT_CERTIFICATE_TEMPLATE',          'Default Certificate Template',          'certificate',          true,  'landscape'),
  ('DEFAULT_FORM_TEMPLATE',                 'Default Form Template',                 'form',                 false, 'portrait'),
  ('DEFAULT_CHECKLIST_TEMPLATE',            'Default Checklist Template',            'checklist',            false, 'portrait'),
  ('DEFAULT_BADGE_TEMPLATE',                'Default Badge Template',                'badge',                false, 'portrait'),
  ('DEFAULT_EXTERNAL_SUBMISSION_TEMPLATE',  'Default External Submission Template',  'external_submission',  false, 'portrait'),
  ('GROUP_REPORT_TEMPLATE',                 'Group Report Template',                 'group_summary',        true,  'landscape')
) AS v(template_code, template_name, template_type, use_group, orientation)
ON CONFLICT (template_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. SEED: COMPANY-SPECIFIC TEMPLATES (REPORT + LETTER PER COMPANY)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  _company RECORD;
  _profile_id BIGINT;
  _report_code TEXT;
  _letter_code TEXT;
BEGIN
  FOR _company IN
    SELECT id, legal_name_en FROM public.owner_companies WHERE status = 'active'
  LOOP
    SELECT id INTO _profile_id
      FROM public.erp_report_branding_profiles
      WHERE profile_code = 'COMPANY_' || _company.id || '_DEFAULT'
      LIMIT 1;

    IF _profile_id IS NULL THEN CONTINUE; END IF;

    _report_code := 'COMPANY_' || _company.id || '_REPORT_TEMPLATE';
    _letter_code := 'COMPANY_' || _company.id || '_LETTER_TEMPLATE';

    INSERT INTO public.erp_report_templates (
      template_code, template_name, template_type,
      branding_profile_id,
      default_orientation, page_size, font_family, language_mode,
      show_logo, show_address, show_trn, show_license,
      is_default, is_active
    )
    VALUES
      (
        _report_code,
        COALESCE(_company.legal_name_en, 'Company ' || _company.id) || ' — Report Template',
        'report', _profile_id,
        'portrait', 'a4', 'Inter', 'en',
        true, true, true, true, false, true
      ),
      (
        _letter_code,
        COALESCE(_company.legal_name_en, 'Company ' || _company.id) || ' — Letter Template',
        'letter', _profile_id,
        'portrait', 'a4', 'Inter', 'en',
        true, true, true, true, false, true
      )
    ON CONFLICT (template_code) DO NOTHING;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. SET owner_companies DEFAULT TEMPLATES
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  _company RECORD;
  _report_tmpl_id BIGINT;
  _letter_tmpl_id BIGINT;
BEGIN
  FOR _company IN SELECT id FROM public.owner_companies WHERE status = 'active' LOOP
    SELECT id INTO _report_tmpl_id FROM public.erp_report_templates
      WHERE template_code = 'COMPANY_' || _company.id || '_REPORT_TEMPLATE' LIMIT 1;
    SELECT id INTO _letter_tmpl_id FROM public.erp_report_templates
      WHERE template_code = 'COMPANY_' || _company.id || '_LETTER_TEMPLATE' LIMIT 1;

    UPDATE public.owner_companies
    SET default_report_template_id = _report_tmpl_id,
        default_letter_template_id = _letter_tmpl_id
    WHERE id = _company.id
      AND (default_report_template_id IS NULL OR default_letter_template_id IS NULL);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. ADD FK CONSTRAINTS ON owner_companies FOR TEMPLATE IDs
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.owner_companies
  ADD CONSTRAINT fk_owner_companies_default_report_template
    FOREIGN KEY (default_report_template_id) REFERENCES public.erp_report_templates(id),
  ADD CONSTRAINT fk_owner_companies_default_letter_template
    FOREIGN KEY (default_letter_template_id) REFERENCES public.erp_report_templates(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. SEED: STARTER REPORT REGISTRY ENTRIES
-- ─────────────────────────────────────────────────────────────────────────────

WITH default_tmpl AS (
  SELECT id FROM public.erp_report_templates WHERE template_code = 'DEFAULT_REPORT_TEMPLATE' LIMIT 1
)
INSERT INTO public.erp_report_registry (
  report_code, report_name_en, report_name_ar,
  module_code, report_category,
  description_en,
  default_template_id,
  default_output_formats,
  branding_strategy,
  required_permissions,
  sensitive_profile,
  is_system, is_active, sort_order
)
SELECT v.report_code, v.report_name_en, v.report_name_ar,
       v.module_code, v.report_category, v.description_en,
       (SELECT id FROM default_tmpl),
       v.output_formats,
       v.branding_strategy,
       v.required_permissions,
       v.sensitive_profile,
       true, true, v.sort_order
FROM (VALUES
  (
    'ADMIN_PERMISSION_MATRIX',
    'Permission Matrix Report',
    'تقرير مصفوفة الصلاحيات',
    'ADMIN',
    'list',
    'Full matrix of all roles, permissions, and assignments across the ERP.',
    ARRAY['screen','pdf','excel','csv']::TEXT[],
    'group_default',
    ARRAY['reports.view','reports.run']::TEXT[],
    'normal',
    10
  ),
  (
    'HR_EMPLOYEE_LIST',
    'HR Employee List Report',
    'تقرير قائمة الموظفين',
    'HR',
    'list',
    'Full list of all employees with key profile information. Placeholder — implemented in REPORT.4.',
    ARRAY['screen','pdf','excel','csv']::TEXT[],
    'auto_by_owner_company',
    ARRAY['reports.view','reports.run','hr.employees.view']::TEXT[],
    'normal',
    20
  ),
  (
    'HR_EMPLOYEE_PROFILE',
    'HR Employee Profile Report',
    'تقرير ملف الموظف',
    'HR',
    'detail',
    'Full profile report for a single employee. Placeholder — implemented in REPORT.4.',
    ARRAY['screen','pdf','print']::TEXT[],
    'auto_by_owner_company',
    ARRAY['reports.view','reports.run','hr.employees.view']::TEXT[],
    'normal',
    30
  )
) AS v(report_code, report_name_en, report_name_ar, module_code, report_category, description_en, output_formats, branding_strategy, required_permissions, sensitive_profile, sort_order)
ON CONFLICT (report_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. SEED: RPT_RUN NUMBERING RULE
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.global_numbering_rules (
  rule_code, rule_name, description, module_code, module_name,
  document_type_code, document_type_name,
  document_prefix, separator, format_template,
  sequence_length, padding_character, starting_sequence_number,
  current_sequence_number, next_sequence_number,
  reset_policy, reserve_on_draft, reserve_on_submit,
  allow_manual_override, manual_override_requires_permission,
  allow_gaps, cancelled_number_policy,
  duplicate_prevention_scope, is_active, is_locked
)
VALUES (
  'REPORT_RUN',
  'Report Run Reference Number',
  'Auto-generated reference number for each report run log entry.',
  'REPORTS',
  'Report Center',
  'RPT_RUN',
  'Report Run',
  'RPT',
  '-',
  '{DOC}-{SEQ6}',
  6, '0', 1, 0, 1,
  'never', false, true,
  false, false, false, 'retain',
  'global', true, false
)
ON CONFLICT (rule_code) DO NOTHING;
