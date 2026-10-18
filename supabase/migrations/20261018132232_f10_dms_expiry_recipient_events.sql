-- Future per-recipient reminder sources only. F09's existing reminder/person
-- fence remains authoritative. No historic source/notification/email replay.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE FUNCTION erp_private.f10_capture_dms_reminder_recipient() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_notification_settings; feature boolean;
BEGIN
 IF NEW.reminder_id IS NULL OR NEW.document_id IS NULL OR NEW.recipient_user_id IS NULL
  OR NEW.status<>'pending' THEN RETURN NEW; END IF;
 SELECT * INTO s FROM public.dms_notification_settings WHERE id=1;
 SELECT is_enabled INTO feature FROM public.erp_email_feature_flags WHERE feature_code='DMS_EXPIRY_EMAILS';
 INSERT INTO erp_private.notification_events(event_key,source_table,source_id,event_type,actor_id,source_snapshot,next_attempt_at)
 VALUES('dms-reminder-recipient:'||NEW.id,'dms_notification_queue',NEW.id,NEW.notification_type,NULL,
  jsonb_build_object('document_id',NEW.document_id,'reminder_id',NEW.reminder_id,'recipient_user_id',NEW.recipient_user_id,
   'channels_resolved',s.id IS NOT NULL,'channel_in_app',coalesce(s.is_enabled AND s.in_app_enabled,false),
   'channel_email',coalesce(s.is_enabled AND s.email_enabled AND feature,false)),
  greatest(statement_timestamp(),NEW.scheduled_for)) ON CONFLICT(event_key) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f10_capture_dms_reminder_recipient() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f10_dms_expiry_event AFTER INSERT ON public.dms_notification_queue
 FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_dms_reminder_recipient();
-- Recheck cancellation, rescheduling and expiry-cycle changes at dispatch, not
-- merely admission. Applies also to existing linked legacy sources; no resend.
CREATE FUNCTION public.f10_dms_notification_delivery_eligible(notification_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(
  SELECT 1 FROM public.dms_notification_queue q
  LEFT JOIN public.dms_expiry_reminders r ON r.id=q.reminder_id AND r.document_id=q.document_id
  LEFT JOIN public.dms_documents d ON d.id=q.document_id
  WHERE q.global_notification_id=$1 AND (
   q.status NOT IN ('pending','read','dismissed') OR q.scheduled_for>statement_timestamp()
   OR (q.reminder_id IS NOT NULL AND (r.id IS NULL OR r.status<>'pending' OR r.reminder_date>(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date))
   OR d.id IS NULL OR d.deleted_at IS NOT NULL OR d.is_archived OR d.status IN ('archived','superseded','deleted')
   OR d.expiry_tracking_override='ignored'
   OR (q.metadata_json->>'expiry_date' IS NOT NULL AND (q.metadata_json->>'expiry_date') IS DISTINCT FROM d.expiry_date::text)
  ));
$$;
REVOKE ALL ON FUNCTION public.f10_dms_notification_delivery_eligible(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_dms_notification_delivery_eligible(bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
