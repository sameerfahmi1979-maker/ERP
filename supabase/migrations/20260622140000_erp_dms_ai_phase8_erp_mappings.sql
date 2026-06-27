-- ============================================================================
-- ERP DMS AI Phase 8 — ERP Mapping Registry
-- Migration: 20260622140000_erp_dms_ai_phase8_erp_mappings.sql
--
-- Creates:
--   dms_metadata_erp_mappings — admin-managed mapping rules from DMS metadata
--                               definitions to ERP target tables/fields
--
-- Strategy: Read-only preview in Phase 8. No ERP target writes yet.
-- Phase 9 adds dms_erp_mapping_apply_runs + dms_erp_mapping_apply_items.
--
-- Safety rules:
--   BIGINT PKs (no UUIDs)
--   CASCADE on metadata_definition delete (mapping rule meaningless without it)
--   CASCADE on document_type delete
--   SET NULL on created_by delete
--   target_table / target_field validated server-side via ERP_MAPPING_TARGET_REGISTRY
--   RLS enabled and forced
--   Soft delete via deleted_at
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dms_metadata_erp_mappings (
  id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Source: which DMS metadata field this maps from
  metadata_definition_id     BIGINT NOT NULL
                               REFERENCES public.dms_metadata_definitions(id) ON DELETE CASCADE,
  document_type_id           BIGINT NOT NULL
                               REFERENCES public.dms_document_types(id) ON DELETE CASCADE,

  -- Target: which ERP table/field to compare/update
  target_module              TEXT NOT NULL,
                               -- 'hr' | 'party'  — validated against server-side allowlist
  target_entity              TEXT NOT NULL,
                               -- human-facing entity name, e.g. 'employee_identity_document'
  target_table               TEXT NOT NULL,
                               -- actual DB table, e.g. 'employee_identity_documents'
  target_field               TEXT NOT NULL,
                               -- actual DB column, e.g. 'document_number'
  target_relation_field      TEXT NOT NULL,
                               -- FK column joining child to parent, e.g. 'employee_id'
  target_record_strategy     TEXT NOT NULL DEFAULT 'link_exact',
                               -- 'link_exact': entity_id IS the target record id
                               -- 'link_parent': entity_id is parent; resolve child via relation_field
  mapping_direction          TEXT NOT NULL DEFAULT 'dms_to_erp',
                               -- always 'dms_to_erp' in Phase 8; reserved for future
  mapping_priority           INT  NOT NULL DEFAULT 10,

  -- Behavior flags
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  allow_apply_to_existing    BOOLEAN NOT NULL DEFAULT FALSE,
                               -- Phase 8: always FALSE (preview only); Phase 9: admin can set TRUE
  requires_confirmation      BOOLEAN NOT NULL DEFAULT TRUE,
  requires_target_permission TEXT    NOT NULL,
                               -- permission code from ERP_MAPPING_TARGET_REGISTRY

  -- Metadata
  notes                      TEXT,
  created_by                 BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                 TIMESTAMPTZ
);

COMMENT ON TABLE public.dms_metadata_erp_mappings IS
  'Admin-configured rules mapping DMS metadata definition fields to ERP target table columns. '
  'Phase 8: read-only preview only. Phase 9: enables apply-to-ERP writes. '
  'target_table and target_field validated against server-side ERP_MAPPING_TARGET_REGISTRY allowlist.';

COMMENT ON COLUMN public.dms_metadata_erp_mappings.target_module IS
  'hr | party — must match a top-level key in ERP_MAPPING_TARGET_REGISTRY';

COMMENT ON COLUMN public.dms_metadata_erp_mappings.target_record_strategy IS
  'link_exact: dms_document_links.entity_id = target record id; '
  'link_parent: entity_id = parent id, resolve child via target_relation_field';

COMMENT ON COLUMN public.dms_metadata_erp_mappings.allow_apply_to_existing IS
  'Phase 8: always false. Phase 9: admin enables per mapping to allow ERP field writes.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_dms_metadata_erp_mappings_definition
  ON public.dms_metadata_erp_mappings(metadata_definition_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_dms_metadata_erp_mappings_document_type
  ON public.dms_metadata_erp_mappings(document_type_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_dms_metadata_erp_mappings_module
  ON public.dms_metadata_erp_mappings(target_module)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_dms_metadata_erp_mappings_active
  ON public.dms_metadata_erp_mappings(is_active, document_type_id)
  WHERE deleted_at IS NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.dms_metadata_erp_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_metadata_erp_mappings FORCE ROW LEVEL SECURITY;

-- SELECT: DMS viewers, reviewers, admin, system_admin
CREATE POLICY "dms_erp_mappings_select_authorized"
  ON public.dms_metadata_erp_mappings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_role_permissions urp ON urp.role_id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND urp.permission_code IN (
          'dms.documents.view',
          'dms.documents.ai.view',
          'dms.documents.review_ai',
          'dms.documents.manage_types',
          'dms.admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_roles ur ON ur.id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND ur.role_code IN ('system_admin', 'group_admin')
    )
  );

-- INSERT: dms.admin or system_admin/group_admin ONLY
CREATE POLICY "dms_erp_mappings_insert_admin_only"
  ON public.dms_metadata_erp_mappings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_role_permissions urp ON urp.role_id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND urp.permission_code IN ('dms.admin', 'dms.documents.manage_types')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_roles ur ON ur.id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND ur.role_code IN ('system_admin', 'group_admin')
    )
  );

-- UPDATE: same admin-only gate
CREATE POLICY "dms_erp_mappings_update_admin_only"
  ON public.dms_metadata_erp_mappings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_role_permissions urp ON urp.role_id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND urp.permission_code IN ('dms.admin', 'dms.documents.manage_types')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_roles ur ON ur.id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND ur.role_code IN ('system_admin', 'group_admin')
    )
  );

-- No DELETE policy: use soft delete (deleted_at) only
