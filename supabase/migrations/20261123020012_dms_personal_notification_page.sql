BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Default My/Unread ordering does not use document labels. Select the exact
-- F10 personal delivery set and decorate only its selected page in one snapshot.
-- Finish the authorized queue lookup for the current recipient before
-- evaluating the actual linked deliveries under their original policies.
CREATE FUNCTION public.perf_dms_personal_notification_page(p_page integer, p_page_size integer, p_unread_only boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $page$
BEGIN
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR p_unread_only IS NULL
  THEN
    RAISE EXCEPTION 'Invalid personal notification page' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH actor AS MATERIALIZED (
      SELECT public.current_user_profile_id() AS id
      WHERE public.f03_current_session_valid()
    ), queue AS MATERIALIZED (
      SELECT id, document_id, recipient_user_id, bridge_status, global_notification_id, global_email_queue_id
      FROM public.dms_notification_queue
      WHERE recipient_user_id = (SELECT id FROM actor)
    ), eligible AS MATERIALIZED (
      SELECT q.id, q.document_id, q.recipient_user_id,
        n.title AS subject, n.message, 'in_app'::text AS channel,
        CASE WHEN n.status = 'unread' THEN 'pending' ELSE n.status END AS status,
        n.scheduled_for, n.read_at, q.bridge_status, q.global_notification_id, q.global_email_queue_id
      FROM queue q
      CROSS JOIN LATERAL (
        SELECT n.title, n.message, n.status, n.scheduled_for, n.read_at
        FROM public.erp_notifications n
        WHERE n.id = q.global_notification_id
          AND n.source_module = 'DMS'
          AND n.source_entity_type = 'dms_documents'
          AND n.source_entity_id = q.document_id
          AND n.recipient_user_id = q.recipient_user_id
          AND n.channel_in_app
          AND n.deleted_at IS NULL
          AND n.scheduled_for <= statement_timestamp()
          AND (NOT p_unread_only OR n.status IN ('unread', 'pending'))
        OFFSET 0
      ) n
    ), page AS MATERIALIZED (
      SELECT * FROM eligible
      ORDER BY scheduled_for DESC NULLS LAST, id ASC
      LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
    ), document_refs AS MATERIALIZED (
      SELECT d.id, d.document_no
      FROM (SELECT DISTINCT document_id FROM page) ids
      CROSS JOIN LATERAL (
        SELECT id, document_no FROM public.dms_documents WHERE id = ids.document_id OFFSET 0
      ) d
    )
    SELECT jsonb_build_object(
      'totalCount', (SELECT count(*) FROM eligible),
      'rows', coalesce(jsonb_agg(
        to_jsonb(page) || jsonb_build_object('visible_document_id', d.id, 'document_no', d.document_no)
        ORDER BY page.scheduled_for DESC NULLS LAST, page.id ASC
      ), '[]'::jsonb)
    )
    FROM page
    LEFT JOIN document_refs d ON d.id = page.document_id
  );
END
$page$;

REVOKE ALL ON FUNCTION public.perf_dms_personal_notification_page(integer, integer, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perf_dms_personal_notification_page(integer, integer, boolean)
  TO authenticated;

DO $acl$
BEGIN
  IF (SELECT ARRAY(SELECT acl::text FROM unnest(proacl) AS acl ORDER BY acl::text)
    FROM pg_proc WHERE oid = 'public.perf_dms_personal_notification_page(integer,integer,boolean)'::regprocedure
      AND proowner = 'postgres'::regrole AND NOT prosecdef)
    IS DISTINCT FROM ARRAY['authenticated=X/postgres', 'postgres=X/postgres']
  THEN RAISE EXCEPTION 'Unexpected personal notification page grants'; END IF;
END
$acl$;

NOTIFY pgrst, 'reload schema';
COMMIT;
