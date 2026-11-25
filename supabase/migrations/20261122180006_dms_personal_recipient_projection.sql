BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE
  expected record;
  actual record;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed notification view owner required'; END IF;
  FOR expected IN SELECT * FROM (VALUES
    -- The retained Supabase defaults also granted authenticated CRUD/MAINTAIN on the old F10 join view.
    ('public.f10_dms_personal_notification_read', 'f689fe364b87edf7868cac705ec585b2', ARRAY['security_invoker=true'], ARRAY['authenticated=r/postgres','authenticated=arwdm/postgres']),
    ('public.perf_dms_notification_read', 'cb898caca279d0c22ed727ed45b5869d', ARRAY['security_invoker=true','security_barrier=true'], ARRAY['authenticated=r/postgres'])
  ) AS v(relation, definition_hash, options, authenticated_acl)
  LOOP
    SELECT c.relkind, c.relowner, c.reloptions, c.relacl, md5(pg_get_viewdef(c.oid, false)) AS definition_hash
    INTO STRICT actual FROM pg_class c WHERE c.oid = to_regclass(expected.relation);
    IF actual.relkind <> 'v' OR actual.relowner <> 'postgres'::regrole
      OR actual.definition_hash IS DISTINCT FROM expected.definition_hash
      OR actual.reloptions IS DISTINCT FROM expected.options
      OR NOT EXISTS (
        SELECT 1 FROM unnest(expected.authenticated_acl) AS acl_variant(entry)
        WHERE ARRAY(SELECT acl::text FROM unnest(actual.relacl) AS acl ORDER BY acl::text)
          = ARRAY[acl_variant.entry,'postgres=arwdDxtm/postgres']
      )
    THEN RAISE EXCEPTION 'Reviewed notification projection drift: %', expected.relation; END IF;
  END LOOP;
END $guard$;

-- Bind the recipient before building the document set. Every source relation
-- still uses the invoker's current policies, including due and source visibility.
CREATE VIEW public.perf_dms_my_notification_read
WITH (security_invoker = true, security_barrier = true) AS
WITH queue AS MATERIALIZED (
  SELECT q.id, q.document_id, q.recipient_user_id, q.bridge_status,
    q.global_notification_id, q.global_email_queue_id
  FROM public.dms_notification_queue q
  WHERE q.recipient_user_id = (SELECT public.current_user_profile_id())
), document_refs AS MATERIALIZED (
  SELECT d.id, d.document_no
  FROM (SELECT DISTINCT document_id FROM queue) ids
  CROSS JOIN LATERAL (
    SELECT id, document_no FROM public.dms_documents WHERE id = ids.document_id OFFSET 0
  ) d
)
SELECT q.id, q.document_id, q.recipient_user_id, n.title AS subject, n.message, 'in_app'::text AS channel,
  CASE WHEN n.status = 'unread' THEN 'pending' ELSE n.status END AS status,
  n.scheduled_for, n.read_at, q.bridge_status, q.global_notification_id, q.global_email_queue_id,
  d.id AS visible_document_id, d.document_no
FROM queue q
LEFT JOIN document_refs d ON d.id = q.document_id
JOIN public.erp_notifications n ON n.id = q.global_notification_id
  AND n.source_module = 'DMS' AND n.source_entity_type = 'dms_documents'
  AND n.source_entity_id = q.document_id AND n.recipient_user_id = q.recipient_user_id
WHERE n.channel_in_app AND n.deleted_at IS NULL AND n.scheduled_for <= statement_timestamp();

REVOKE ALL ON public.perf_dms_my_notification_read FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.perf_dms_my_notification_read TO authenticated;

DO $acl$
BEGIN
  IF (SELECT ARRAY(SELECT acl::text FROM unnest(relacl) AS acl ORDER BY acl::text)
      FROM pg_class WHERE oid = 'public.perf_dms_my_notification_read'::regclass)
    IS DISTINCT FROM ARRAY['authenticated=r/postgres','postgres=arwdDxtm/postgres']
  THEN RAISE EXCEPTION 'Unexpected recipient projection grants'; END IF;
END $acl$;

NOTIFY pgrst, 'reload schema';
COMMIT;
