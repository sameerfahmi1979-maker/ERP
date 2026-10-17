BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE INDEX f07_attachment_recovery_owner_document ON erp_private.f07_attachment_intents(actor_id,document_id,created_at DESC,upload_session_id DESC);
CREATE INDEX f07_attachment_recovery_pending ON erp_private.f07_attachment_intents(actor_id,document_id) WHERE receipt IS NULL;
CREATE FUNCTION erp_private.f07_read_attachment_recovery(p_session bigint,p_document bigint,p_page integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();i erp_private.f07_attachment_intents;
 rows jsonb:='[]';allowed boolean;total bigint;pending bigint;
BEGIN
 IF (p_session IS NULL)=(p_document IS NULL) OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR
  coalesce(p_session,p_document) NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Invalid recovery selector' USING ERRCODE='22023';END IF;
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Recovery principal unavailable' USING ERRCODE='42501';END IF;
 IF p_session IS NOT NULL THEN
  IF NOT erp_private.f07_upload_subject_allowed(p_session) OR NOT erp_private.upload_session_permission(p_session,'dms.documents.upload') THEN RAISE EXCEPTION 'Original upload recovery unavailable' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM erp_private.f07_attachment_intents WHERE upload_session_id=p_session AND actor_id<>actor) THEN
   RAISE EXCEPTION 'Original attachment belongs to another reviewer' USING ERRCODE='42501';END IF;
 ELSIF NOT erp_private.document_permission(p_document,'dms.documents.upload') OR NOT erp_private.document_permission(p_document,'dms.documents.edit') OR
  NOT erp_private.document_permission(p_document,'dms.documents.preview') THEN RAISE EXCEPTION 'Document recovery unavailable' USING ERRCODE='42501';END IF;
 SELECT count(*),count(*) FILTER(WHERE receipt IS NULL) INTO total,pending FROM erp_private.f07_attachment_intents
  WHERE actor_id=actor AND (p_session IS NULL OR upload_session_id=p_session) AND (p_document IS NULL OR document_id=p_document);
 FOR i IN SELECT * FROM erp_private.f07_attachment_intents WHERE actor_id=actor AND (p_session IS NULL OR upload_session_id=p_session)
  AND (p_document IS NULL OR document_id=p_document) ORDER BY created_at DESC,upload_session_id DESC LIMIT 25 OFFSET ((p_page-1)*25) LOOP
  allowed:=erp_private.f07_upload_subject_allowed(i.upload_session_id) AND erp_private.upload_session_permission(i.upload_session_id,'dms.documents.upload') AND
   erp_private.document_permission(i.document_id,'dms.documents.upload') AND erp_private.document_permission(i.document_id,'dms.documents.edit') AND erp_private.document_permission(i.document_id,'dms.documents.preview');
  IF NOT coalesce(allowed,false) THEN
   -- An explicit opaque owned footprint, never an empty-success substitute for
   -- a denied original request. No target, file name or personal wording leaks.
   rows:=rows||jsonb_build_array(jsonb_build_object('unavailable',true,'uploadSessionId',i.upload_session_id,'operationId',i.operation_id,'completed',i.receipt IS NOT NULL));
  ELSE
   rows:=rows||jsonb_build_array(jsonb_build_object('unavailable',false,'uploadSessionId',i.upload_session_id,'documentId',i.document_id,'operationId',i.operation_id,
    'changeNotes',i.request->'notes','versionLabel',i.request->'label','completed',i.receipt IS NOT NULL,'originalFilename',i.source->>'name'));
  END IF;
 END LOOP;
 IF NOT erp_private.business_principal_is_active() OR public.current_user_profile_id() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Recovery principal changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('rows',rows,'totalCount',total,'pendingCount',pending,'page',p_page,'pageSize',25);
END $$;
CREATE FUNCTION public.f07_read_attachment_recovery(p_session bigint DEFAULT NULL,p_document bigint DEFAULT NULL,p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_read_attachment_recovery($1,$2,$3) $$;
REVOKE ALL ON FUNCTION erp_private.f07_read_attachment_recovery(bigint,bigint,integer),public.f07_read_attachment_recovery(bigint,bigint,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_read_attachment_recovery(bigint,bigint,integer),public.f07_read_attachment_recovery(bigint,bigint,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
