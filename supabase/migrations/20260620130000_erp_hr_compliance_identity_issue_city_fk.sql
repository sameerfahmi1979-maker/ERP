-- HR Compliance — link place of issue to cities master data
ALTER TABLE employee_identity_documents
  ADD COLUMN IF NOT EXISTS issue_city_id BIGINT REFERENCES cities(id);

CREATE INDEX IF NOT EXISTS idx_employee_identity_documents_issue_city_id
  ON employee_identity_documents (issue_city_id)
  WHERE deleted_at IS NULL AND issue_city_id IS NOT NULL;

COMMENT ON COLUMN employee_identity_documents.issue_city_id IS
  'Place of issue — FK to geography cities master. Replaces free-text place_of_issue for new records.';
COMMENT ON COLUMN employee_identity_documents.place_of_issue IS
  'Legacy free-text place of issue. Prefer issue_city_id for new records.';
