BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- For an authenticated SELECT, the tag-link policies reduce to the active
-- principal and document_permission(document_id, 'dms.documents.view').
-- The permissive SELECT already grants that exact set. The manage policy
-- cannot extend it through the two restrictive policies.
DO $guard$
DECLARE expected record;
BEGIN
  IF current_user <> 'postgres'
    OR has_schema_privilege('authenticated', 'erp_private', 'CREATE')
    OR has_schema_privilege('anon', 'erp_private', 'CREATE')
    OR NOT EXISTS (SELECT 1 FROM pg_class
      WHERE oid = 'public.dms_document_tags'::regclass AND relrowsecurity AND relforcerowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_class
      WHERE oid = 'public.dms_document_content'::regclass AND relrowsecurity AND relforcerowsecurity)
    OR EXISTS (SELECT 1 FROM (VALUES ('public.dms_document_tags'::regclass),
      ('public.dms_document_content'::regclass)) tables(oid)
      WHERE (SELECT count(*) FROM pg_policy WHERE polrelid = tables.oid AND polcmd IN ('r', '*')) <> 4) THEN
    RAISE EXCEPTION 'DMS list association SELECT prerequisites changed';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('dms_document_tags', 'dms_doc_tags_manage', '*', true, '56c137c68006980cfed2274faaf54098'),
    ('dms_document_tags', 'dms_doc_tags_select', 'r', true, 'd467bd06b3092c4a4a57f4b0dea5ed10'),
    ('dms_document_tags', 'f03_document_subject', '*', false, '73771acf9117cc320a918bb957425b02'),
    ('dms_document_tags', 'f03_principal', '*', false, '7f2345bb3c7af80f4c0290b3ef9c491c'),
    ('dms_document_content', 'dms_doc_content_manage', '*', true, '56c137c68006980cfed2274faaf54098'),
    ('dms_document_content', 'dms_doc_content_select', 'r', true, 'd467bd06b3092c4a4a57f4b0dea5ed10'),
    ('dms_document_content', 'f03_document_subject', '*', false, 'f6aa2bca6aba03d6709fe67a98f01928'),
    ('dms_document_content', 'f03_principal', '*', false, '7f2345bb3c7af80f4c0290b3ef9c491c')
  ) AS rules(table_name, policy_name, command, permissive, qualifier) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy
      WHERE polrelid = to_regclass('public.' || expected.table_name) AND polname = expected.policy_name
        AND polcmd::text = expected.command AND polpermissive = expected.permissive
        AND polroles = ARRAY['authenticated'::regrole::oid]
        AND md5(pg_get_expr(polqual, polrelid)) = expected.qualifier) THEN
      RAISE EXCEPTION 'DMS list association SELECT policy changed: %.%', expected.table_name, expected.policy_name;
    END IF;
  END LOOP;
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.document_permission(bigint,text)', '061d9460f9bde9a449e558d242fc4038', true),
    ('public.current_user_can_view_dms_document(bigint)', 'd991b0195f38b55711cde71f72bfb1e6', false),
    ('erp_private.visible_dms_file_document_ids()', '46cb2066d7ef81996b19bd85471f95bc', true)
  ) AS readers(signature, body_hash, definer) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure(expected.signature)
      AND md5(prosrc) = expected.body_hash AND prosecdef = expected.definer
      AND provolatile = 's' AND proowner = 'postgres'::regrole AND proconfig = ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'DMS tag visibility prerequisite changed: %', expected.signature;
    END IF;
  END LOOP;
END $guard$;

-- Share the existing set-based association scope, including the exact HR and
-- recruitment evidence checks. Keep the established file RPC and its signature.
DO $association$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('erp_private.visible_dms_file_document_ids()'::regprocedure);
  definition := replace(definition, 'visible_dms_file_document_ids()', 'visible_dms_association_document_ids(association text)');
  definition := replace(definition,
    'AND EXISTS (SELECT 1 FROM public.dms_document_files f WHERE f.document_id=d.id AND f.deleted_at IS NULL)',
    'AND CASE association
      WHEN ''file'' THEN EXISTS (SELECT 1 FROM public.dms_document_files f WHERE f.document_id=d.id AND f.deleted_at IS NULL)
      WHEN ''tag'' THEN EXISTS (SELECT 1 FROM public.dms_document_tags t WHERE t.document_id=d.id)
      WHEN ''text'' THEN EXISTS (SELECT 1 FROM public.dms_document_content c WHERE c.document_id=d.id AND c.content_text IS NOT NULL)
      ELSE false END');
  definition := replace(definition, '''dms.documents.view.executive'')',
    '''dms.documents.view.executive'',''dms.documents.preview'')');
  definition := replace(definition, 'AND (actor.global_admin OR (',
    'AND (association <> ''text'' OR actor.global_admin OR EXISTS (
      SELECT 1 FROM scopes s WHERE s.permission_code = ''dms.documents.preview''
        AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
          OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))))
    AND (actor.global_admin OR (');
  EXECUTE definition;
END $association$;
REVOKE ALL ON FUNCTION erp_private.visible_dms_association_document_ids(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.visible_dms_association_document_ids(text) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.visible_dms_file_document_ids()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $reader$
  SELECT erp_private.visible_dms_association_document_ids('file');
$reader$;

-- For a page of documents, authorize each lookup once even when the document
-- has several tags. The invoker still resolves taxonomy labels under its RLS.
CREATE FUNCTION erp_private.visible_dms_tag_links(target_document_id bigint)
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $links$
  WITH visible AS MATERIALIZED (
    SELECT erp_private.document_permission(target_document_id, 'dms.documents.view') AS allowed
    WHERE EXISTS (SELECT 1 FROM public.dms_document_tags WHERE document_id = target_document_id)
  )
  SELECT link.tag_id FROM visible CROSS JOIN public.dms_document_tags link
  WHERE visible.allowed AND link.document_id = target_document_id;
$links$;
REVOKE ALL ON FUNCTION erp_private.visible_dms_tag_links(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.visible_dms_tag_links(bigint) TO authenticated;

CREATE FUNCTION public.dms_tag_details_for_documents(document_ids bigint[])
RETURNS TABLE (document_id bigint, tags jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $details$
  WITH requested AS MATERIALIZED (
    SELECT DISTINCT id FROM unnest(document_ids) id
    WHERE cardinality(document_ids) BETWEEN 1 AND 100 AND id > 0
  ), links AS MATERIALIZED (
    SELECT requested.id AS document_id, link.tag_id
    FROM requested CROSS JOIN LATERAL erp_private.visible_dms_tag_links(requested.id) link(tag_id)
  ), labels AS MATERIALIZED (
    SELECT id, tag_name, color_hex FROM public.dms_tags
    WHERE id IN (SELECT links.tag_id FROM links)
  )
  SELECT link.document_id, jsonb_agg(jsonb_build_object('tag_id', link.tag_id, 'tag',
    CASE WHEN tag.id IS NOT NULL THEN jsonb_build_object('tag_name', tag.tag_name, 'color_hex', tag.color_hex) END)
    ORDER BY link.tag_id)
  FROM links link LEFT JOIN labels tag ON tag.id = link.tag_id
  GROUP BY link.document_id;
$details$;
REVOKE ALL ON FUNCTION public.dms_tag_details_for_documents(bigint[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_tag_details_for_documents(bigint[]) TO authenticated;

-- A row type for PostgREST. The document columns retain their base relations
-- for taxonomy embeds. Rows are available only from the protected search.
CREATE VIEW public.dms_tag_sort_row WITH (security_invoker = true) AS
SELECT d.*, 0::bigint AS visible_tag_count FROM public.dms_documents d WHERE false;
REVOKE ALL ON public.dms_tag_sort_row FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.dms_visible_tag_counts_for_documents()
RETURNS TABLE (document_id bigint, tag_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $counts$
  SELECT link.document_id, count(*)
  FROM public.dms_document_tags link
  JOIN erp_private.visible_dms_association_document_ids('tag') visible(id) ON visible.id = link.document_id
  GROUP BY link.document_id;
$counts$;
REVOKE ALL ON FUNCTION erp_private.dms_visible_tag_counts_for_documents() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_visible_tag_counts_for_documents() TO authenticated;

CREATE FUNCTION public.dms_search_documents_for_worklist(
  text_query text DEFAULT '', include_content boolean DEFAULT false,
  subject_type text DEFAULT NULL, subject_id bigint DEFAULT NULL,
  document_type_ids bigint[] DEFAULT '{}'::bigint[], linked_type text DEFAULT NULL,
  expiry_state text DEFAULT NULL, metadata_filters jsonb DEFAULT '[]'::jsonb,
  has_files boolean DEFAULT NULL, has_extracted_text boolean DEFAULT NULL, sort_by_tags boolean DEFAULT false
) RETURNS SETOF public.dms_tag_sort_row LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $search$
  WITH documents AS (
    SELECT * FROM public.ai_mod02_search_documents(text_query, include_content, subject_type, subject_id,
      document_type_ids, linked_type, expiry_state, metadata_filters) WHERE has_files IS NULL
    UNION ALL
    SELECT * FROM public.dms_search_documents_by_file_presence(has_files, text_query, include_content, subject_type, subject_id,
      document_type_ids, linked_type, expiry_state, metadata_filters) WHERE has_files IS NOT NULL
  ), counts AS MATERIALIZED (
    SELECT * FROM erp_private.dms_visible_tag_counts_for_documents() WHERE sort_by_tags
  ), extracted AS MATERIALIZED (
    SELECT id FROM erp_private.visible_dms_association_document_ids('text') id WHERE has_extracted_text IS NOT NULL
  )
  SELECT d.*, coalesce(counts.tag_count, 0) FROM documents d LEFT JOIN counts ON counts.document_id = d.id
  WHERE has_extracted_text IS NULL OR has_extracted_text = (d.id IN (SELECT id FROM extracted));
$search$;
REVOKE ALL ON FUNCTION public.dms_search_documents_for_worklist(text, boolean, text, bigint, bigint[], text, text, jsonb, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_search_documents_for_worklist(text, boolean, text, bigint, bigint[], text, text, jsonb, boolean, boolean, boolean)
  TO authenticated;

-- Catalogue counts return aggregates, so the list never downloads the entire
-- document/tag relation and repeatedly counts it as it pages.
CREATE FUNCTION erp_private.dms_visible_catalogue_tag_counts(tag_ids bigint[])
RETURNS TABLE (tag_id bigint, document_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $counts$
  SELECT link.tag_id, count(*)
  FROM public.dms_document_tags link
  JOIN erp_private.visible_dms_association_document_ids('tag') visible(id) ON visible.id = link.document_id
  WHERE cardinality(tag_ids) BETWEEN 1 AND 100 AND link.tag_id = ANY(tag_ids)
  GROUP BY link.tag_id;
$counts$;
REVOKE ALL ON FUNCTION erp_private.dms_visible_catalogue_tag_counts(bigint[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_visible_catalogue_tag_counts(bigint[]) TO authenticated;

CREATE FUNCTION public.dms_catalogue_tag_counts(tag_ids bigint[])
RETURNS TABLE (tag_id bigint, document_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $counts$
  SELECT * FROM erp_private.dms_visible_catalogue_tag_counts(tag_ids);
$counts$;
REVOKE ALL ON FUNCTION public.dms_catalogue_tag_counts(bigint[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_catalogue_tag_counts(bigint[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
