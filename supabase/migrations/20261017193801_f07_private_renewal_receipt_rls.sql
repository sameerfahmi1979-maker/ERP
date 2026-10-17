-- Defense in depth only: the private receipt table already revokes every API
-- role. Its existing owner-checked renewal functions and ACLs remain unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
ALTER TABLE erp_private.f07_renewal_receipts ENABLE ROW LEVEL SECURITY;
COMMIT;
