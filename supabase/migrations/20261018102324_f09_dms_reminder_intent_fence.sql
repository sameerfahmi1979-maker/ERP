-- Fence the business-event identity before different producers can create
-- different global notification/email IDs for the very same reminder/person.
-- Historical rows are not deduplicated, deleted, relabelled or replayed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE INDEX f09_dms_reminder_recipient_lookup ON public.dms_notification_queue(reminder_id,document_id,recipient_user_id)
 WHERE reminder_id IS NOT NULL AND recipient_user_id IS NOT NULL;
CREATE FUNCTION erp_private.f09_fence_dms_reminder() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company bigint;branch bigint;found_count bigint;
BEGIN
 IF NEW.reminder_id IS NULL OR NEW.recipient_user_id IS NULL THEN RETURN NEW; END IF;
 SELECT d.owning_company_id,d.owning_branch_id INTO company,branch
 FROM public.dms_expiry_reminders r JOIN public.dms_documents d ON d.id=r.document_id
 WHERE r.id=NEW.reminder_id AND r.document_id=NEW.document_id AND d.deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reminder source unavailable' USING errcode='22023'; END IF;
 IF NOT (current_setting('role',true) IN ('service_role','postgres','supabase_admin')
   OR (session_user IN ('postgres','supabase_admin') AND current_setting('role',true) IN ('none',''))
   OR (erp_private.business_principal_is_active() AND
     (erp_private.permission_in_scope('dms.notifications.manage',company,branch)
      OR erp_private.permission_in_scope('dms.admin',company,branch))))
 THEN RAISE EXCEPTION 'Permission denied' USING errcode='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('f09-dms-reminder:'||NEW.reminder_id::text||':'||NEW.recipient_user_id::text,0));
 SELECT count(*) INTO found_count FROM public.dms_notification_queue n
 WHERE n.reminder_id=NEW.reminder_id AND n.document_id=NEW.document_id AND n.recipient_user_id=NEW.recipient_user_id;
 IF found_count>1 THEN RAISE EXCEPTION 'Ambiguous historical reminder identity; review required' USING errcode='22023'; END IF;
 IF found_count=1 THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f09_fence_dms_reminder() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f09_dms_reminder_intent BEFORE INSERT ON public.dms_notification_queue
 FOR EACH ROW EXECUTE FUNCTION erp_private.f09_fence_dms_reminder();
COMMIT;
