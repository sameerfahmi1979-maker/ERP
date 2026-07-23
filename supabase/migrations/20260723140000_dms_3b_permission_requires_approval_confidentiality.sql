-- ============================================================
-- DMS.3B — Permission, Requires Approval & Confidentiality
-- Migration: 20260723140000_dms_3b_permission_requires_approval_confidentiality.sql
-- Phase: DMS.3B
-- Date: 2026-07-23
-- Purpose:
--   1. requires_approval column on dms_document_types — idempotent (may already exist)
--   2. confidentiality_level CHECK constraint on dms_documents
--   3. Seed dms.notifications.view_own and dms.notifications.admin permissions
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. dms_document_types.requires_approval
--    Column may already exist — ADD COLUMN IF NOT EXISTS is safe.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.dms_document_types
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false;

-- Partial index: only partial rows where requires_approval = true
-- (avoids index on every row for the common false case)
CREATE INDEX IF NOT EXISTS idx_dms_document_types_requires_approval
  ON public.dms_document_types(requires_approval)
  WHERE requires_approval = true;

-- ──────────────────────────────────────────────────────────────
-- 2. dms_documents.confidentiality_level CHECK constraint
--
-- Existing values verified before applying:
--   company, finance, hr, internal, legal — all within allowed set.
--   No invalid values exist. Safe to add constraint.
--
-- Allowed values match the application enum:
--   internal | company | hr | finance | legal | executive
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Only add constraint if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.dms_documents'::regclass
      AND contype = 'c'
      AND conname = 'dms_documents_confidentiality_level_chk'
  ) THEN
    -- Safety check: ensure no invalid values exist before adding constraint
    IF EXISTS (
      SELECT 1 FROM public.dms_documents
      WHERE confidentiality_level NOT IN ('internal','company','hr','finance','legal','executive')
        AND confidentiality_level IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Cannot add confidentiality_level CHECK: invalid values exist in dms_documents. Inspect and clean before re-running migration.';
    END IF;

    ALTER TABLE public.dms_documents
      ADD CONSTRAINT dms_documents_confidentiality_level_chk
      CHECK (confidentiality_level IN ('internal','company','hr','finance','legal','executive'));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 3. Seed notification security permissions
--
-- dms.notifications.view_own — for recipient-scoped notification RLS (DMS.3E)
-- dms.notifications.admin   — for admin notification management (DMS.3E)
--
-- No role grants in this phase (DMS.3E will assign roles after RLS is hardened).
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code)
VALUES
  ('dms.notifications.view_own', 'View Own DMS Notifications', 'DMS', 'view_own'),
  ('dms.notifications.admin',    'Admin DMS Notifications',    'DMS', 'admin')
ON CONFLICT (permission_code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 4. Validation block
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- requires_approval column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dms_document_types'
      AND column_name = 'requires_approval'
  ) THEN
    RAISE EXCEPTION 'VALIDATION FAILED: requires_approval column not found on dms_document_types';
  END IF;

  -- confidentiality CHECK constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.dms_documents'::regclass
      AND contype = 'c'
      AND conname = 'dms_documents_confidentiality_level_chk'
  ) THEN
    RAISE EXCEPTION 'VALIDATION FAILED: dms_documents_confidentiality_level_chk constraint not found';
  END IF;

  -- notification permissions exist
  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE permission_code = 'dms.notifications.view_own') THEN
    RAISE EXCEPTION 'VALIDATION FAILED: dms.notifications.view_own not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE permission_code = 'dms.notifications.admin') THEN
    RAISE EXCEPTION 'VALIDATION FAILED: dms.notifications.admin not found';
  END IF;

  RAISE NOTICE 'DMS.3B validation PASSED: requires_approval column ✓, confidentiality CHECK constraint ✓, notification permissions ✓';
END $$;
