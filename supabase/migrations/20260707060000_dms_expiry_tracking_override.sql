-- DMS Expiry Tracking Override (DMS EXPIRY.IGNORE.1)
--
-- Adds per-document expiry ignore mechanism so that documents can be
-- excluded from the Expired / Expiring Soon / Missing Expiry dashboards
-- without being renewed or archived.
--
-- Use cases:
--   - One-off documents that have technically expired but are intentionally
--     kept for reference (e.g. old passport copies)
--   - Documents where expiry tracking is not applicable after a business decision
--   - Missing-expiry items that are known to have no expiry by design

ALTER TABLE dms_documents
  ADD COLUMN IF NOT EXISTS expiry_tracking_override  TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expiry_override_reason    TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expiry_override_by        BIGINT      DEFAULT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expiry_override_at        TIMESTAMPTZ DEFAULT NULL;

-- Constraint: only allow known override values
ALTER TABLE dms_documents
  ADD CONSTRAINT dms_documents_expiry_tracking_override_check
    CHECK (expiry_tracking_override IN ('ignored') OR expiry_tracking_override IS NULL);

-- Index so the dashboard stats query is fast when filtering ignored documents
CREATE INDEX IF NOT EXISTS idx_dms_documents_expiry_override
  ON dms_documents (expiry_tracking_override)
  WHERE expiry_tracking_override IS NOT NULL;

COMMENT ON COLUMN dms_documents.expiry_tracking_override IS
  'When set to ''ignored'', this document is excluded from all expiry alert dashboards (Expired, Expiring Soon, Missing Expiry). The document itself is unchanged — only its dashboard visibility is suppressed. Can be reversed at any time.';
COMMENT ON COLUMN dms_documents.expiry_override_reason IS
  'Optional free-text reason explaining why expiry tracking was overridden.';
COMMENT ON COLUMN dms_documents.expiry_override_by IS
  'User who applied the expiry tracking override.';
COMMENT ON COLUMN dms_documents.expiry_override_at IS
  'Timestamp when the expiry tracking override was applied.';
