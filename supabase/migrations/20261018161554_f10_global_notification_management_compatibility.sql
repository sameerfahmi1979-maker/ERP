-- Narrow channel-intent compatibility, not a grant to edit personal payloads.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE FUNCTION public.f10_enable_legacy_notification_email(source_id bigint,notification_id bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.dms_notification_queue;n public.erp_notifications;d public.dms_documents;
BEGIN
 IF NOT erp_private.business_principal_is_active()
  OR NOT(public.current_user_has_permission_globally('notifications.manage') OR public.current_user_has_permission_globally('notifications.admin'))
  OR NOT(public.current_user_has_permission_globally('notifications.admin') OR
   (public.current_user_has_permission_globally('notifications.email_queue.manage') AND public.current_user_has_permission_globally('notifications.email_queue.process')))
  THEN RAISE EXCEPTION 'Global delivery authority required' USING ERRCODE='42501';END IF;
 -- Same lock order as personal-state projection and held-channel recovery.
 SELECT * INTO n FROM public.erp_notifications WHERE id=$2 FOR UPDATE;
 IF NOT FOUND OR n.deleted_at IS NOT NULL THEN RETURN false;END IF;
 SELECT * INTO q FROM public.dms_notification_queue WHERE id=$1 FOR UPDATE;
 IF NOT FOUND OR q.global_notification_id IS DISTINCT FROM $2 OR q.status<>'pending' OR q.scheduled_for>statement_timestamp() THEN RETURN false;END IF;
 IF NOT public.current_user_can_view_dms_document(q.document_id)
  OR NOT(erp_private.document_permission(q.document_id,'dms.notifications.manage') OR erp_private.document_permission(q.document_id,'dms.admin')) THEN
  RAISE EXCEPTION 'Current document delivery scope required' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=q.document_id AND deleted_at IS NULL;
 IF NOT FOUND OR d.is_archived OR d.status IN ('archived','superseded','deleted') OR d.expiry_tracking_override='ignored'
  OR (q.metadata_json ? 'expiry_date' AND q.metadata_json->>'expiry_date' IS DISTINCT FROM d.expiry_date::text)
  OR NOT EXISTS(SELECT 1 FROM public.dms_notification_settings s WHERE s.id=1 AND s.is_enabled AND s.email_enabled)
  THEN RETURN false;END IF;
 IF n.notification_code IS DISTINCT FROM 'DMS_BRIDGE_'||q.id
  OR n.source_module IS DISTINCT FROM 'DMS' OR n.source_entity_type IS DISTINCT FROM 'dms_documents'
  OR n.source_entity_id IS DISTINCT FROM q.document_id OR n.recipient_user_id IS DISTINCT FROM coalesce(q.recipient_user_id,CASE WHEN q.recipient_email IS NULL OR q.recipient_email='' THEN d.owner_user_id END)
  OR n.scheduled_for>statement_timestamp() THEN RETURN false;END IF;
 -- No content/recipient/lifecycle change, queue insertion or provider call.
 UPDATE public.erp_notifications SET channel_email=true,updated_at=statement_timestamp() WHERE id=n.id AND channel_email IS DISTINCT FROM true;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.f10_enable_legacy_notification_email(bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_enable_legacy_notification_email(bigint,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
