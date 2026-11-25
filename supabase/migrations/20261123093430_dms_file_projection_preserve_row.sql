-- Preserve the reviewed DMS file row and clear only withheld preview fields.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE
  expected record;
BEGIN
  IF current_user <> 'postgres'
    OR has_schema_privilege('authenticated','erp_private','CREATE')
    OR has_schema_privilege('anon','erp_private','CREATE')
  THEN RAISE EXCEPTION 'Reviewed DMS projection owner and schema grants required'; END IF;

  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.read_document_files()', '9652d4165b78cf6f42c80e0c13c3574b', 'public.dms_document_files', true,
     ARRAY['authenticated=X/postgres','postgres=X/postgres']),
    ('erp_private.file_document_visibility_scope()', 'c2631a6e3fbfb18d33c74f143914df26', 'record', true,
     ARRAY['postgres=X/postgres']),
    ('public.f03_read_document_files()', 'f1bf936725c7cd379c1181cb4de94ecf', 'public.dms_document_files', false,
     ARRAY['authenticated=X/postgres','postgres=X/postgres']),
    ('erp_private.read_documents()', '6bc7814a408d77990df6e20bb2c58033', 'public.dms_documents', true,
     ARRAY['authenticated=X/postgres','postgres=X/postgres']),
    ('erp_private.read_documents_filtered(bigint[],text[])', 'c95a1a5ba0facbcb902b429be8a29a12', 'public.dms_documents', true,
     ARRAY['authenticated=X/postgres','postgres=X/postgres']),
    ('erp_private.read_documents_filtered_v2(bigint[],text[],text[])', '96419de21552cdc297af58d3c655023e', 'public.dms_documents', true,
     ARRAY['authenticated=X/postgres','postgres=X/postgres']),
    ('erp_private.read_documents_matching(bigint[],text[],text[],bigint[],text,tsquery)', '78a58f1b738d6dcd8455c9d9c288595e', 'public.dms_documents', true,
     ARRAY['authenticated=X/postgres','postgres=X/postgres']),
    ('public.f03_read_document_files_for_document(bigint)', '4dee141c9023c93fb4b3d449e98b55c2', 'public.dms_document_files', false,
     ARRAY['authenticated=X/postgres','postgres=X/postgres'])
  ) AS v(signature, body_hash, row_type, security_definer, acl)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)
      AND p.proowner='postgres'::regrole AND p.prosecdef=expected.security_definer
      AND p.provolatile='s' AND p.proretset AND p.prorettype=to_regtype(expected.row_type)
      AND p.proconfig=ARRAY['search_path=""']
      AND ARRAY(SELECT acl::text FROM unnest(p.proacl) acl ORDER BY acl::text)=expected.acl
      AND md5(replace(p.prosrc,E'\r\n',E'\n'))=expected.body_hash)
    THEN RAISE EXCEPTION 'Reviewed DMS projection preimage mismatch: %', expected.signature; END IF;
  END LOOP;

  PERFORM set_config('qa.file_projection.reader_metadata',
    (SELECT (to_jsonb(p)-'prosrc')::text FROM pg_proc p
     WHERE p.oid='erp_private.read_document_files()'::regprocedure), true);
END $guard$;

CREATE OR REPLACE FUNCTION erp_private.read_document_files()
RETURNS SETOF public.dms_document_files LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $reader$
 WITH principal AS MATERIALIZED(
  SELECT auth.uid()uid,erp_private.business_principal_is_active()active,public.current_user_is_global_admin()global_admin,public.current_user_profile_id()profile_id
 ),preview_scopes AS MATERIALIZED(
  SELECT DISTINCT ur.owner_company_id,ur.branch_id FROM principal actor
  JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id JOIN public.roles r ON r.id=ur.role_id
  JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
  WHERE actor.uid IS NOT NULL AND actor.active AND ur.is_active AND r.is_active AND p.is_active AND p.permission_code='dms.documents.preview'
 ),authorized_documents AS MATERIALIZED(
  -- This is the current F03/PERF reader, including HR, recruitment, clinical,
  -- sensitivity, linked employee/dependent, deleted-row and scope fences.
  SELECT d.id,d.owning_company_id,d.owning_branch_id FROM erp_private.file_document_visibility_scope()d
 )
 SELECT CASE WHEN actor.global_admin OR EXISTS(SELECT 1 FROM preview_scopes s WHERE(s.owner_company_id IS NULL AND s.branch_id IS NULL)OR(s.owner_company_id=d.owning_company_id AND(s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))
   THEN f
   ELSE jsonb_populate_record(f, jsonb_build_object(
     'ocr_text', NULL, 'ocr_error_message', NULL, 'integrity_error_message', NULL
   ))
 END
 FROM principal actor CROSS JOIN public.dms_document_files f
 JOIN authorized_documents d ON d.id=f.document_id
 WHERE actor.uid IS NOT NULL AND actor.active AND f.deleted_at IS NULL;
$reader$;

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
    WHERE p.oid='erp_private.read_document_files()'::regprocedure
      AND (to_jsonb(p)-'prosrc')::text=current_setting('qa.file_projection.reader_metadata')
      AND md5(replace(p.prosrc,E'\r\n',E'\n'))='a1f27f9d9b33db0c7563a0661a46ebe2')
  THEN RAISE EXCEPTION 'DMS file projection metadata or body changed'; END IF;
END $verify$;

COMMIT;
