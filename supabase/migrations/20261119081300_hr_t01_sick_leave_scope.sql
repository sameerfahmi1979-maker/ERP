BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The leave catalogue also marks maternity and other types as document-required.
-- This task enforces the existing SICK type's certificate, not other evidence policies.
CREATE FUNCTION erp_private.t01_requires_sick_certificate(p_code text,p_requires_document boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(upper(btrim(p_code)) = 'SICK' AND p_requires_document,false);
$$;
REVOKE ALL ON FUNCTION erp_private.t01_requires_sick_certificate(text,boolean) FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  original text;
  patched text;
BEGIN
  original:=pg_get_functiondef('public.t01_leave_approval_opening(bigint,bigint)'::regprocedure);
  patched:=replace(original,'SELECT t.requires_document INTO requires_document',
    'SELECT erp_private.t01_requires_sick_certificate(t.code,t.requires_document) INTO requires_document');
  IF original=patched THEN RAISE EXCEPTION 'Unexpected certificate opening definition'; END IF;
  EXECUTE patched;

  original:=pg_get_functiondef('erp_private.t01_admit_leave_certificate(bigint,bigint,bigint,uuid,jsonb)'::regprocedure);
  patched:=replace(original,'SELECT t.requires_document, r.sick_cert_dms_id',
    'SELECT erp_private.t01_requires_sick_certificate(t.code,t.requires_document), r.sick_cert_dms_id');
  IF original=patched THEN RAISE EXCEPTION 'Unexpected certificate admission definition'; END IF;
  EXECUTE patched;

  original:=pg_get_functiondef('erp_private.f11_verify_time_admission(text,jsonb,jsonb,jsonb)'::regprocedure);
  patched:=replace(original,'id=(p_new->>''leave_type_id'')::bigint AND requires_document',
    'id=(p_new->>''leave_type_id'')::bigint AND erp_private.t01_requires_sick_certificate(code,requires_document)');
  IF original=patched THEN RAISE EXCEPTION 'Unexpected certificate receipt verification definition'; END IF;
  EXECUTE patched;
END;
$$;

COMMIT;

