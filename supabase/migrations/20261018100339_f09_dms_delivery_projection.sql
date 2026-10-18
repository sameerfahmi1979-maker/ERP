-- F09 owns delivery metadata only. In-app read/dismiss/status and business
-- notification routing remain unchanged (F10). Never equate sent with receipt.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE FUNCTION public.f09_project_dms_delivery() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.source_module<>'DMS' OR NEW.notification_id IS NULL THEN RETURN NEW; END IF;
 UPDATE public.dms_notification_queue d SET
  global_email_queue_id=NEW.id,
  bridge_status=CASE WHEN NEW.status='sent' AND NEW.delivery_state='provider_accepted' THEN 'provider_accepted'
   WHEN NEW.status='sent' THEN 'legacy_sent_unverified' WHEN NEW.status='delivery_unknown' THEN 'email_uncertain'
   WHEN NEW.status='cancelled' THEN 'email_cancelled' WHEN NEW.status='failed' THEN 'failed' ELSE 'email_queued' END,
  email_delivery_status=CASE WHEN NEW.status='sent' AND NEW.delivery_state='provider_accepted' THEN 'provider_accepted'
   WHEN NEW.status='sent' THEN 'legacy_sent_unverified' WHEN NEW.status='delivery_unknown' THEN 'delivery_unknown'
   WHEN NEW.status='cancelled' THEN 'cancelled' WHEN NEW.status='failed' THEN 'failed' WHEN NEW.paused_at IS NOT NULL THEN 'paused'
   WHEN NEW.status='processing' THEN 'processing' WHEN NEW.last_error='F09:retry' THEN 'retry_scheduled'
   WHEN NEW.last_error='F09:provider_quota' THEN 'provider_capacity' ELSE 'queued' END,
  email_sent_at=CASE WHEN NEW.status='sent' THEN NEW.sent_at ELSE NULL END,
  last_bridge_error=CASE WHEN NEW.last_error IS NOT NULL THEN 'Delivery issue recorded; review authorized attempt history.' ELSE NULL END,
  updated_at=clock_timestamp()
 WHERE d.global_notification_id=NEW.notification_id
  AND (d.global_email_queue_id IS NULL OR d.global_email_queue_id=NEW.id)
  AND ((NEW.source_entity_type='dms_documents' AND d.document_id=NEW.source_entity_id)
    OR (NEW.source_entity_type='dms_notification' AND NEW.source_entity_id=NEW.notification_id));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.f09_project_dms_delivery() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f09_dms_delivery AFTER UPDATE OF status,delivery_state,paused_at,next_retry_at,last_error ON public.erp_email_queue
 FOR EACH ROW EXECUTE FUNCTION public.f09_project_dms_delivery();
NOTIFY pgrst,'reload schema';
COMMIT;
