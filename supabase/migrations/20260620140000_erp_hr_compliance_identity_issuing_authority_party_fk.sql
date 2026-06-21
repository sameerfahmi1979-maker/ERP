-- HR Compliance — link issuing authority to Party Master (government authorities)
ALTER TABLE employee_identity_documents
  ADD COLUMN IF NOT EXISTS issuing_authority_party_id BIGINT REFERENCES parties(id);

CREATE INDEX IF NOT EXISTS idx_employee_identity_documents_issuing_authority_party_id
  ON employee_identity_documents (issuing_authority_party_id)
  WHERE deleted_at IS NULL AND issuing_authority_party_id IS NOT NULL;

COMMENT ON COLUMN employee_identity_documents.issuing_authority_party_id IS
  'Issuing authority — FK to parties (GOVERNMENT_AUTHORITY, LICENSE_ISSUER, FREE_ZONE_AUTHORITY).';
COMMENT ON COLUMN employee_identity_documents.issuing_authority IS
  'Legacy free-text issuing authority. Prefer issuing_authority_party_id for new records.';
