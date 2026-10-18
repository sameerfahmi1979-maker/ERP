BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE FUNCTION erp_private.f10_review_notification_target(item_id bigint) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.dms_review_queue;cap text;allowed boolean:=false;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR $1 IS NULL OR $1<1 THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_REVIEW' AND is_enabled) THEN RETURN NULL;END IF;
 SELECT * INTO q FROM public.dms_review_queue WHERE id=$1 AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF q.upload_session_id IS NOT NULL AND NOT erp_private.f07_upload_subject_allowed(q.upload_session_id) THEN RETURN NULL;END IF;
 IF q.document_id IS NOT NULL THEN
  IF NOT public.current_user_can_view_dms_document(q.document_id) THEN RETURN NULL;END IF;
 ELSE
  IF q.upload_session_id IS NULL OR NOT erp_private.upload_session_allowed(q.upload_session_id) THEN RETURN NULL;END IF;
 END IF;
 FOREACH cap IN ARRAY ARRAY['dms.review_queue.view','dms.review_queue.manage','dms.documents.review_ai','dms.admin'] LOOP
  allowed:=allowed OR CASE WHEN q.document_id IS NOT NULL THEN erp_private.document_permission(q.document_id,cap)
   ELSE erp_private.upload_session_permission(q.upload_session_id,cap) END;
 END LOOP;
 IF allowed OR public.current_user_is_global_admin() THEN RETURN '/dms/review-queue?item_id='||$1;END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.f10_review_notification_target(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f10_review_notification_target(bigint) TO authenticated;
DO $$DECLARE body text;needle text:=$old$  SELECT q.document_id INTO document_id FROM public.dms_review_queue q WHERE q.id=$2 AND q.deleted_at IS NULL;
  IF document_id IS NOT NULL AND public.current_user_can_view_dms_document(document_id) THEN RETURN '/dms/documents/record/'||document_id; END IF;$old$;BEGIN
 SELECT pg_get_functiondef('public.f10_notification_target(text,bigint)'::regprocedure) INTO body;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Canonical target contract changed; review before migration';END IF;
 EXECUTE replace(body,needle,'  RETURN erp_private.f10_review_notification_target($2);');
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
