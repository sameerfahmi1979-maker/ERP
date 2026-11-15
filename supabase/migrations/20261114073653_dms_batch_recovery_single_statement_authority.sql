BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

-- Keep the ordinary RLS read and fail closed on hidden seals in the same
-- statement. The visible row already proves existence. The receipt and graph
-- loop still check its source, authority, manifest and exact operation.
DO $guard$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO STRICT definition
  FROM pg_proc
  WHERE oid = 'public.read_dms_batch_draft_recovery(uuid)'::regprocedure
    AND md5(replace(prosrc, E'\r\n', E'\n')) = '55d2a6587a5deb13f82abc426229acd6'
    AND NOT prosecdef AND proowner = 'postgres'::regrole
    AND proconfig = ARRAY['search_path=""'];

  EXECUTE replace(definition,
    'case when s.batch_draft_operation_id is null then null else erp_private.batch_draft_preparation_exists(s.id) end',
    'case when s.batch_draft_operation_id is null then null when p.upload_session_id is not null then true else erp_private.batch_draft_preparation_exists(s.id) end');
END;
$guard$;

-- The transition row is the anchor after FK and row waits. Force a point
-- lookup for its ordinary-RLS seal, retaining the visibility and exact-row
-- comparisons in the same statement.
DO $guard$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO STRICT definition
  FROM pg_proc
  WHERE oid = 'erp_private.batch_draft_preparation_guard()'::regprocedure
    AND md5(replace(prosrc, E'\r\n', E'\n')) = '3b77745d1abe529a36efc46de9712cab'
    AND NOT prosecdef AND proowner = 'postgres'::regrole
    AND proconfig = ARRAY['search_path=""'];

  EXECUTE replace(definition,
    $before$from batch_draft_inserted n left join erp_private.dms_batch_draft_preparations p
    on p.upload_session_id=n.upload_session_id$before$,
    $after$from batch_draft_inserted n left join lateral (
    select prepared.* from erp_private.dms_batch_draft_preparations prepared
    where prepared.upload_session_id=n.upload_session_id offset 0
   ) p on true$after$);
END;
$guard$;

-- Most numbered drafts have no employee links. Avoid building the actor's
-- complete readable-employee set in that case. Retain the existing set-based
-- predicate for documents with employee links, using the same stable snapshot.
DO $guard$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO STRICT definition
  FROM pg_proc
  WHERE oid = 'erp_private.document_permission(bigint,text)'::regprocedure
    AND md5(replace(prosrc, E'\r\n', E'\n')) = '1c6c7a6c40749c9bea0e28cc99e03595'
    AND prosecdef AND provolatile = 's' AND proowner = 'postgres'::regrole
    AND proconfig = ARRAY['search_path=""'];

  EXECUTE replace(definition,
    $before$ IF EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=$1 AND l.deleted_at IS NULL AND l.entity_type='employee'
   AND l.entity_id NOT IN (SELECT erp_private.readable_employee_ids())) THEN RETURN false; END IF;$before$,
    $after$ IF EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=$1 AND l.deleted_at IS NULL AND l.entity_type='employee') THEN
  IF EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=$1 AND l.deleted_at IS NULL AND l.entity_type='employee'
   AND l.entity_id NOT IN (SELECT erp_private.readable_employee_ids())) THEN RETURN false; END IF;
 END IF;$after$);
END;
$guard$;

COMMIT;
