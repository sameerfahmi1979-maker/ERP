-- =============================================================================
-- BRANDING.1 — Unified Branding Assets and Storage Foundation
-- Date: 2026-07-04
-- Depends on: REPORT.2 (erp_report_branding_profiles), ERP base (owner_companies)
-- =============================================================================
-- HARD RULES:
--   1. BIGINT GENERATED ALWAYS AS IDENTITY PKs only — no UUID, no SERIAL
--   2. RLS enabled and forced on all new tables
--   3. Private storage bucket only — stamp/signature never public
--   4. Do NOT drop existing URL columns on erp_report_branding_profiles / owner_companies
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (
  permission_code, permission_name, module_code, action_code, description,
  is_active, is_system_permission, is_visible, sort_order
)
VALUES
  (
    'branding.app.view', 'View App Branding', 'BRANDING', 'view',
    'View tenant-global app shell branding settings and app-scoped assets',
    true, true, true, 801
  ),
  (
    'branding.app.manage', 'Manage App Branding', 'BRANDING', 'manage',
    'Update tenant-global app shell branding settings',
    true, true, true, 802
  ),
  (
    'branding.assets.upload', 'Upload Branding Assets', 'BRANDING', 'upload',
    'Upload and replace branding assets (logos, favicon, report stamps, etc.)',
    true, true, true, 803
  ),
  (
    'branding.assets.approve', 'Approve Branding Assets', 'BRANDING', 'approve',
    'Approve branding profiles and assets for production use',
    true, true, true, 804
  )
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to system_admin (all) and group_admin (view + upload for operational use)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code IN (
    'branding.app.view', 'branding.app.manage',
    'branding.assets.upload', 'branding.assets.approve'
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code IN ('branding.app.view', 'branding.assets.upload')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. erp_app_branding_settings (singleton tenant-global app shell config)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_app_branding_settings (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  settings_code         TEXT NOT NULL CONSTRAINT erp_app_branding_settings_code_uq UNIQUE,
  app_name              TEXT NOT NULL DEFAULT 'ALGT ERP',
  app_short_name        TEXT NULL DEFAULT 'ALGT',
  tagline               TEXT NULL,
  support_email         TEXT NULL,
  support_phone         TEXT NULL,
  footer_text           TEXT NULL,
  theme_primary_color   TEXT NULL,
  theme_secondary_color TEXT NULL,
  theme_accent_color    TEXT NULL,
  login_title           TEXT NULL,
  login_subtitle        TEXT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deleted_at            TIMESTAMPTZ NULL,
  deleted_by            BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.erp_app_branding_settings IS
  'Tenant-global app shell branding configuration (login, sidebar, favicon, theme). One active row per deployment.';

CREATE INDEX IF NOT EXISTS idx_erp_app_branding_settings_active
  ON public.erp_app_branding_settings (is_active)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. erp_branding_assets (unified metadata for app + report branding files)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_branding_assets (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_scope           TEXT NOT NULL
                          CHECK (asset_scope IN ('app', 'report')),
  app_settings_id       BIGINT NULL
                          REFERENCES public.erp_app_branding_settings(id) ON DELETE RESTRICT,
  branding_profile_id   BIGINT NULL
                          REFERENCES public.erp_report_branding_profiles(id) ON DELETE RESTRICT,
  owner_company_id      BIGINT NULL
                          REFERENCES public.owner_companies(id) ON DELETE SET NULL,
  asset_type            TEXT NOT NULL,
  storage_bucket        TEXT NOT NULL DEFAULT 'erp-branding-assets',
  storage_path          TEXT NOT NULL,
  original_filename     TEXT NULL,
  mime_type             TEXT NOT NULL,
  file_size_bytes       BIGINT NULL,
  width_px              INT NULL,
  height_px             INT NULL,
  version_no            INT NOT NULL DEFAULT 1,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  replaced_by_asset_id  BIGINT NULL
                          REFERENCES public.erp_branding_assets(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deleted_at            TIMESTAMPTZ NULL,
  deleted_by            BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT erp_branding_assets_scope_fk_check CHECK (
    (asset_scope = 'app' AND app_settings_id IS NOT NULL AND branding_profile_id IS NULL)
    OR
    (asset_scope = 'report' AND branding_profile_id IS NOT NULL AND app_settings_id IS NULL)
  ),
  CONSTRAINT erp_branding_assets_type_scope_check CHECK (
    (asset_scope = 'app' AND asset_type IN (
      'app_logo', 'app_logo_small', 'favicon', 'login_background',
      'pwa_icon_192', 'pwa_icon_512'
    ))
    OR
    (asset_scope = 'report' AND asset_type IN (
      'report_logo', 'report_logo_small', 'stamp', 'signature',
      'watermark', 'letterhead_background'
    ))
  )
);

COMMENT ON TABLE public.erp_branding_assets IS
  'Metadata for uploaded branding assets. Files stored in private Supabase Storage bucket erp-branding-assets. No binary blobs in Postgres.';

COMMENT ON COLUMN public.erp_branding_assets.owner_company_id IS
  'Denormalized filter column for report-scoped assets. Populated from erp_report_branding_profiles.owner_company_id.';

CREATE INDEX IF NOT EXISTS idx_erp_branding_assets_app_settings
  ON public.erp_branding_assets (app_settings_id, asset_type)
  WHERE asset_scope = 'app' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_branding_assets_profile
  ON public.erp_branding_assets (branding_profile_id, asset_type)
  WHERE asset_scope = 'report' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_branding_assets_owner_company
  ON public.erp_branding_assets (owner_company_id)
  WHERE owner_company_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_branding_assets_storage_path
  ON public.erp_branding_assets (storage_bucket, storage_path);

-- One active non-deleted asset per app settings + type
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_branding_assets_app_active
  ON public.erp_branding_assets (app_settings_id, asset_type)
  WHERE asset_scope = 'app' AND is_active = true AND deleted_at IS NULL;

-- One active non-deleted asset per report profile + type
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_branding_assets_report_active
  ON public.erp_branding_assets (branding_profile_id, asset_type)
  WHERE asset_scope = 'report' AND is_active = true AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SEED DEFAULT APP BRANDING SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.erp_app_branding_settings (
  settings_code, app_name, app_short_name, tagline, is_active
)
VALUES (
  'DEFAULT_APP_BRANDING',
  'ALGT ERP',
  'ALGT',
  'Alliance Gulf Transport ERP',
  true
)
ON CONFLICT (settings_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ENABLE AND FORCE RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.erp_app_branding_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_app_branding_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.erp_branding_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_branding_assets FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS POLICIES — erp_app_branding_settings
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "branding_app_settings_select"
  ON public.erp_app_branding_settings FOR SELECT
  USING (
    public.current_user_has_permission('branding.app.view')
    OR public.current_user_has_permission('reports.manage')
    OR public.current_user_is_global_admin()
  );

CREATE POLICY "branding_app_settings_insert"
  ON public.erp_app_branding_settings FOR INSERT
  WITH CHECK (
    public.current_user_has_permission('branding.app.manage')
    OR public.current_user_is_global_admin()
  );

CREATE POLICY "branding_app_settings_update"
  ON public.erp_app_branding_settings FOR UPDATE
  USING (
    public.current_user_has_permission('branding.app.manage')
    OR public.current_user_is_global_admin()
  );

CREATE POLICY "branding_app_settings_no_delete"
  ON public.erp_app_branding_settings FOR DELETE
  USING (public.current_user_is_global_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS POLICIES — erp_branding_assets
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "branding_assets_select"
  ON public.erp_branding_assets FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      (
        asset_scope = 'app'
        AND (
          public.current_user_has_permission('branding.app.view')
          OR public.current_user_has_permission('reports.manage')
        )
      )
      OR
      (
        asset_scope = 'report'
        AND public.current_user_has_permission('reports.view')
      )
      OR public.current_user_is_global_admin()
    )
  );

CREATE POLICY "branding_assets_insert"
  ON public.erp_branding_assets FOR INSERT
  WITH CHECK (
    public.current_user_has_permission('branding.assets.upload')
    AND (
      (asset_scope = 'app' AND public.current_user_has_permission('branding.app.manage'))
      OR (asset_scope = 'report' AND public.current_user_has_permission('reports.manage'))
      OR public.current_user_is_global_admin()
    )
  );

CREATE POLICY "branding_assets_update"
  ON public.erp_branding_assets FOR UPDATE
  USING (
    public.current_user_has_permission('branding.assets.upload')
    AND (
      (asset_scope = 'app' AND public.current_user_has_permission('branding.app.manage'))
      OR (asset_scope = 'report' AND public.current_user_has_permission('reports.manage'))
      OR public.current_user_is_global_admin()
    )
  );

CREATE POLICY "branding_assets_no_hard_delete"
  ON public.erp_branding_assets FOR DELETE
  USING (public.current_user_is_global_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. STORAGE BUCKET — erp-branding-assets (private)
-- ─────────────────────────────────────────────────────────────────────────────
-- Note: DMS buckets (dms-documents, dms-temp) are created outside SQL in this
-- project. BRANDING.1 declares the bucket here for reproducibility. If INSERT
-- fails (insufficient privileges), create manually in Supabase Dashboard:
--   Name: erp-branding-assets | Public: false | File size limit: 10 MB
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'erp-branding-assets',
  'erp-branding-assets',
  false,
  10485760,
  ARRAY[
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
    'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'
  ]::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. STORAGE RLS — storage.objects for erp-branding-assets
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "branding_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'erp-branding-assets'
    AND (
      (
        name LIKE 'app/%'
        AND (
          public.current_user_has_permission('branding.app.view')
          OR public.current_user_has_permission('reports.manage')
        )
      )
      OR
      (
        name LIKE 'report/%'
        AND name NOT LIKE '%/stamp/%'
        AND name NOT LIKE '%/signature/%'
        AND public.current_user_has_permission('reports.view')
      )
      OR
      (
        name LIKE 'report/%'
        AND (name LIKE '%/stamp/%' OR name LIKE '%/signature/%')
        AND public.current_user_has_permission('reports.sign')
      )
      OR public.current_user_is_global_admin()
    )
  );

CREATE POLICY "branding_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'erp-branding-assets'
    AND public.current_user_has_permission('branding.assets.upload')
    AND (
      public.current_user_has_permission('branding.app.manage')
      OR public.current_user_has_permission('reports.manage')
      OR public.current_user_is_global_admin()
    )
  );

CREATE POLICY "branding_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'erp-branding-assets'
    AND public.current_user_has_permission('branding.assets.upload')
  );

CREATE POLICY "branding_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'erp-branding-assets'
    AND (
      public.current_user_has_permission('branding.assets.upload')
      OR public.current_user_is_global_admin()
    )
  );
