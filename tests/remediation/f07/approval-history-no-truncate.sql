-- Run only against an isolated synthetic F07 schema. Transactional permission
-- regression, not a command to truncate a live history table.
BEGIN;
SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='1s';
SET LOCAL ROLE service_role;
DO $$BEGIN
 BEGIN
  TRUNCATE public.dms_document_approvals;
  RAISE EXCEPTION 'Approval-history TRUNCATE bypass remains';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
