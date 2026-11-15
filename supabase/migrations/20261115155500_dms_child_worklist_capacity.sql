BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- All three SELECT policies use the same active-principal and document-view
-- boundary as tags. Check the reviewed policies before using a single check.
DO $readers$
DECLARE spec record; policy record;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Unexpected document child reader owner'; END IF;
  FOR spec IN SELECT * FROM (VALUES
    ('dms_document_events', 'dms_events_select', '4720551104634a14724590bfe3dab60c', 3),
    ('dms_document_versions', 'dms_versions_select', '4720551104634a14724590bfe3dab60c', 3),
    ('dms_document_links', 'dms_links_select', 'd467bd06b3092c4a4a57f4b0dea5ed10', 4)
  ) AS cases(table_name, select_policy, select_hash, policy_count) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.' || spec.table_name)
      AND relrowsecurity AND relforcerowsecurity AND relowner = 'postgres'::regrole
      AND has_table_privilege('authenticated', oid, 'SELECT'))
      OR (SELECT count(*) FROM pg_policy WHERE polrelid = to_regclass('public.' || spec.table_name)
          AND polcmd IN ('r', '*')) <> spec.policy_count THEN
      RAISE EXCEPTION 'Unexpected document child SELECT policy set for %', spec.table_name;
    END IF;
    FOR policy IN SELECT * FROM (VALUES
      (spec.select_policy, 'r', true, spec.select_hash),
      ('f03_document_subject', '*', false, '73771acf9117cc320a918bb957425b02'),
      ('f03_principal', '*', false, '7f2345bb3c7af80f4c0290b3ef9c491c')
    ) AS expected(policy_name, command, permissive, qualifier) LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = to_regclass('public.' || spec.table_name)
        AND polname = policy.policy_name AND polcmd::text = policy.command AND polpermissive = policy.permissive
        AND polroles = ARRAY['authenticated'::regrole::oid]
        AND md5(pg_get_expr(polqual, polrelid)) = policy.qualifier) THEN
        RAISE EXCEPTION 'Document child SELECT policy changed for %.%', spec.table_name, policy.policy_name;
      END IF;
    END LOOP;

    EXECUTE format($sql$
      CREATE FUNCTION erp_private.%1$I(target_document_id bigint)
      RETURNS SETOF public.%2$I LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
      AS $body$
        WITH access AS MATERIALIZED (
          SELECT erp_private.document_permission(target_document_id, 'dms.documents.view') AS allowed
        )
        SELECT child.* FROM access CROSS JOIN public.%2$I child
        WHERE access.allowed AND child.document_id = target_document_id
      $body$
    $sql$, 'read_' || spec.table_name, spec.table_name);
    EXECUTE format($sql$
      CREATE FUNCTION public.%1$I(target_document_id bigint)
      RETURNS SETOF public.%2$I LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
      AS $body$ SELECT * FROM erp_private.%1$I(target_document_id) $body$
    $sql$, 'read_' || spec.table_name, spec.table_name);
    EXECUTE format('REVOKE ALL ON FUNCTION erp_private.%1$I(bigint), public.%1$I(bigint)
      FROM PUBLIC, anon, authenticated, service_role', 'read_' || spec.table_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION erp_private.%1$I(bigint), public.%1$I(bigint)
      TO authenticated', 'read_' || spec.table_name);
  END LOOP;
END $readers$;

-- A linked-record list can contain many different documents. Reuse the tag
-- and file visibility set without asking the point policy for every link.
DO $association$
DECLARE definition text; updated text;
BEGIN
  definition := pg_get_functiondef('erp_private.visible_dms_association_document_ids(text)'::regprocedure);
  updated := replace(definition,
    'WHEN ''tag'' THEN EXISTS (SELECT 1 FROM public.dms_document_tags t WHERE t.document_id=d.id)',
    'WHEN ''tag'' THEN EXISTS (SELECT 1 FROM public.dms_document_tags t WHERE t.document_id=d.id)
      WHEN ''link'' THEN EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id)');
  IF updated = definition THEN RAISE EXCEPTION 'Document association reader changed'; END IF;
  EXECUTE updated;
END $association$;

CREATE FUNCTION erp_private.read_dms_entity_document_links(target_entity_type text, target_entity_id bigint)
RETURNS SETOF public.dms_document_links LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $links$
  SELECT link.* FROM public.dms_document_links link
  JOIN erp_private.visible_dms_association_document_ids('link') visible(id) ON visible.id = link.document_id
  WHERE link.entity_type = target_entity_type AND link.entity_id = target_entity_id;
$links$;

CREATE FUNCTION public.read_dms_entity_document_links(target_entity_type text, target_entity_id bigint)
RETURNS SETOF public.dms_document_links LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $links$
  SELECT * FROM erp_private.read_dms_entity_document_links(target_entity_type, target_entity_id);
$links$;

REVOKE ALL ON FUNCTION erp_private.read_dms_entity_document_links(text, bigint),
  public.read_dms_entity_document_links(text, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.read_dms_entity_document_links(text, bigint),
  public.read_dms_entity_document_links(text, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
