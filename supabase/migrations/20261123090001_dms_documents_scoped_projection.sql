BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- These three private pass-through readers supply NULL at every step. Reuse
-- the innermost security definer for this same no-argument public endpoint.
DO $guard$
DECLARE
  expected record;
BEGIN
  IF current_user <> 'postgres'
    OR has_schema_privilege('authenticated','erp_private','CREATE')
    OR has_schema_privilege('anon','erp_private','CREATE')
    OR NOT has_schema_privilege('authenticated','erp_private','USAGE')
  THEN RAISE EXCEPTION 'Reviewed reader owner and private schema ACL required'; END IF;

  FOR expected IN SELECT * FROM (VALUES
    ('public.f03_read_documents()', '186cffe865d0c445a0bab55f9f1a9723', false),
    ('erp_private.read_documents()', '6bc7814a408d77990df6e20bb2c58033', true),
    ('erp_private.read_documents_filtered(bigint[],text[])', 'c95a1a5ba0facbcb902b429be8a29a12', true),
    ('erp_private.read_documents_filtered_v2(bigint[],text[],text[])', '96419de21552cdc297af58d3c655023e', true),
    ('erp_private.read_documents_matching(bigint[],text[],text[],bigint[],text,tsquery)', '78a58f1b738d6dcd8455c9d9c288595e', true)
  ) AS paths(signature, body_hash, definer)
  LOOP
    IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)
      AND md5(replace(p.prosrc,E'\r\n',E'\n'))=expected.body_hash
      AND p.prosecdef=expected.definer AND p.proretset AND p.provolatile='s'
      AND p.prorettype='public.dms_documents'::regtype AND p.proowner='postgres'::regrole
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql')
      AND p.proconfig=ARRAY['search_path=""'] AND NOT p.proisstrict
      AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)
          =ARRAY['authenticated=X/postgres','postgres=X/postgres'])
    THEN RAISE EXCEPTION 'Reviewed Documents reader changed: %',expected.signature; END IF;
  END LOOP;
  PERFORM set_config('qa_dms_read.wrapper_metadata',(SELECT (to_jsonb(p)-'prosrc'-'proconfig')::text
    FROM pg_proc p WHERE p.oid='public.f03_read_documents()'::regprocedure),true);
END $guard$;


DO $scope_guard$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='erp_private.file_document_visibility_scope()'::regprocedure
    AND md5(replace(prosrc,E'\r\n',E'\n'))='c2631a6e3fbfb18d33c74f143914df26'
    AND proowner='postgres'::regrole AND prosecdef AND provolatile='s'
    AND proacl=ARRAY['postgres=X/postgres']::aclitem[] AND proconfig=ARRAY['search_path=""'])
  THEN RAISE EXCEPTION 'Reviewed document identity scope required'; END IF;
END $scope_guard$;

-- IDs alone are already available to this role from the public projection.
CREATE FUNCTION erp_private.documents_read_ids() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $ids$
  SELECT d.id FROM erp_private.file_document_visibility_scope() AS d;
$ids$;
REVOKE ALL ON FUNCTION erp_private.documents_read_ids() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.documents_read_ids() TO authenticated;

-- This single composite column contains the same masked document returned by
-- the legacy matcher. Keeping it composite follows future changes to its type.
CREATE VIEW erp_private.documents_read_projection WITH (security_barrier=true) AS
WITH principal AS MATERIALIZED (
  SELECT public.current_user_is_global_admin() AS global_admin, public.current_user_profile_id() AS profile_id
), preview_scopes AS MATERIALIZED (
  SELECT DISTINCT ur.owner_company_id,ur.branch_id FROM principal actor
  JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id
  JOIN public.roles r ON r.id=ur.role_id
  JOIN public.role_permissions rp ON rp.role_id=r.id
  JOIN public.permissions p ON p.id=rp.permission_id
  WHERE ur.is_active AND r.is_active AND p.is_active AND p.permission_code='dms.documents.preview'
)
SELECT CASE WHEN (SELECT global_admin FROM principal) OR EXISTS (
    SELECT FROM preview_scopes s WHERE (s.owner_company_id IS NULL AND s.branch_id IS NULL)
      OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))
  THEN d ELSE jsonb_populate_record(d,jsonb_build_object(
    'ai_summary',NULL,'content_tsv',to_tsvector('simple',concat_ws(' ',d.document_no,d.title,d.description,d.legacy_document_code)),
    'summary_embedding',NULL,'ai_summary_error',NULL,'summary_embedding_error',NULL,'ai_warnings_json',NULL,'ai_risk_reasons_json',NULL))
  END AS document
FROM erp_private.documents_read_ids() AS ids(id) JOIN public.dms_documents d ON d.id=ids.id;
REVOKE ALL ON erp_private.documents_read_projection FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON erp_private.documents_read_projection TO authenticated;

CREATE OR REPLACE FUNCTION public.f03_read_documents()
RETURNS SETOF public.dms_documents LANGUAGE sql STABLE SECURITY INVOKER AS $reader$
  SELECT (v.document).* FROM erp_private.documents_read_projection AS v;
$reader$;

DO $verify$
BEGIN
  IF (SELECT (to_jsonb(p)-'prosrc'-'proconfig')::text
      FROM pg_proc p WHERE p.oid='public.f03_read_documents()'::regprocedure)
      IS DISTINCT FROM current_setting('qa_dms_read.wrapper_metadata')
    OR (SELECT proconfig IS NOT NULL FROM pg_proc WHERE oid='public.f03_read_documents()'::regprocedure)
  THEN RAISE EXCEPTION 'Documents wrapper identity, grants or security attributes changed'; END IF;

  -- REVOKE from the application roles above does not remove installation-
  -- specific ALTER DEFAULT PRIVILEGES grants to additional roles. Refuse
  -- that catalog drift before exposing either new private read surface.
  IF NOT EXISTS (SELECT FROM pg_proc p
    WHERE p.oid='erp_private.documents_read_ids()'::regprocedure
      AND p.proowner='postgres'::regrole AND p.prosecdef AND p.provolatile='s'
      AND p.proretset AND p.prorettype='bigint'::regtype AND NOT p.proisstrict
      AND p.proconfig=ARRAY['search_path=""']
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql')
      AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)
        =ARRAY['authenticated=X/postgres','postgres=X/postgres'])
  THEN RAISE EXCEPTION 'Unexpected Documents ID reader owner, security attributes or grants'; END IF;

  IF NOT EXISTS (SELECT FROM pg_class v
    WHERE v.oid='erp_private.documents_read_projection'::regclass
      AND v.relkind='v' AND v.relowner='postgres'::regrole AND v.reloptions=ARRAY['security_barrier=true']
      AND ARRAY(SELECT a::text FROM unnest(v.relacl) a ORDER BY a::text)
        =ARRAY(SELECT a::text FROM unnest(acldefault('r',v.relowner) ||
          ARRAY['authenticated=r/postgres']::aclitem[]) a ORDER BY a::text)
      AND NOT EXISTS(SELECT FROM pg_attribute c WHERE c.attrelid=v.oid AND c.attnum>0
        AND cardinality(c.attacl)>0))
  THEN RAISE EXCEPTION 'Unexpected Documents projection view owner, barrier or grants'; END IF;
END $verify$;
COMMIT;
