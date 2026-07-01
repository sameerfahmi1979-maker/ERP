-- ============================================================
-- ERP DMS VERSION LINK.1 — RLS Parity Fix for Versions/Files
-- ============================================================
-- dms_document_versions and dms_document_files have had RLS enabled
-- (and forced) since DMS.2, but only SELECT and INSERT policies were
-- ever created. Every UPDATE/DELETE against these tables via the
-- session-bound client (demoting old versions to is_current=false,
-- "Set Current", soft-deleting files, unlinking versions) has been
-- silently affecting 0 rows ever since — no error, just no effect.
-- This is why multiple versions can show is_current=true at once,
-- and why "Set Current" / "Unlink Version" appear to do nothing.
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ── dms_document_versions ────────────────────────────────────────────────────

DROP POLICY IF EXISTS dms_versions_update ON public.dms_document_versions;
CREATE POLICY dms_versions_update ON public.dms_document_versions
  FOR UPDATE TO authenticated
  USING (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS dms_versions_delete ON public.dms_document_versions;
CREATE POLICY dms_versions_delete ON public.dms_document_versions
  FOR DELETE TO authenticated
  USING (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- ── dms_document_files ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS dms_files_update ON public.dms_document_files;
CREATE POLICY dms_files_update ON public.dms_document_files
  FOR UPDATE TO authenticated
  USING (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS dms_files_delete ON public.dms_document_files;
CREATE POLICY dms_files_delete ON public.dms_document_files
  FOR DELETE TO authenticated
  USING (
    current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );
