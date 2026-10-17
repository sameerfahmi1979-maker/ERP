-- Row-level append-only guards cannot intercept TRUNCATE. Preserve submissions
-- and decisions even for API service-role callers; owner-superuser recovery is
-- separate from an application capability and is not granted by this phase.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
REVOKE TRUNCATE ON public.dms_document_approvals FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
