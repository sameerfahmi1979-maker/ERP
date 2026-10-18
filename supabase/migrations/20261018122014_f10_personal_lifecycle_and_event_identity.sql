-- F10 personal lifecycle. Additive: no historical notification replay/backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE INDEX f10_personal_due_page ON public.erp_notifications(recipient_user_id,status,created_at DESC,id)
 WHERE deleted_at IS NULL AND channel_in_app;

CREATE FUNCTION public.f10_transition_my_notification(notification_id bigint, transition text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n public.erp_notifications; actor bigint; cutoff timestamptz:=statement_timestamp();
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 actor:=public.current_user_profile_id();
 IF $1 IS NULL OR $1<1 OR $2 IS NULL OR $2 NOT IN ('read','dismissed','archived') THEN
  RAISE EXCEPTION 'Invalid notification change' USING ERRCODE='22023'; END IF;
 SELECT * INTO n FROM public.erp_notifications WHERE id=$1 AND recipient_user_id=actor
  AND deleted_at IS NULL AND channel_in_app AND scheduled_for<=cutoff FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Notification unavailable' USING ERRCODE='P0002'; END IF;
 IF n.status NOT IN ('unread','read','dismissed','archived') THEN RAISE EXCEPTION 'Notification state unavailable' USING ERRCODE='PT409'; END IF;
 -- Terminal personal states do not resurrect through a stale Read/Dismiss.
 IF (n.status='archived' AND $2<>'archived') OR (n.status='dismissed' AND $2='read') THEN
  RAISE EXCEPTION 'Notification state changed; refresh' USING ERRCODE='PT409'; END IF;
 IF n.status<>$2 THEN
  UPDATE public.erp_notifications SET status=$2,
   read_at=CASE WHEN $2='read' THEN coalesce(read_at,cutoff) ELSE read_at END,
   dismissed_at=CASE WHEN $2='dismissed' THEN coalesce(dismissed_at,cutoff) ELSE dismissed_at END,
   archived_at=CASE WHEN $2='archived' THEN coalesce(archived_at,cutoff) ELSE archived_at END,
   updated_at=cutoff WHERE id=n.id RETURNING * INTO n;
 END IF;
 IF n.status NOT IN ('unread','read','dismissed','archived') THEN
  RAISE EXCEPTION 'Notification state unavailable' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('id',n.id,'status',n.status);
END $$;
REVOKE ALL ON FUNCTION public.f10_transition_my_notification(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_transition_my_notification(bigint,text) TO authenticated;

CREATE FUNCTION public.f10_mark_all_my_notifications_read() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE changed bigint; cutoff timestamptz:=statement_timestamp();
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 UPDATE public.erp_notifications SET status='read',read_at=coalesce(read_at,cutoff),updated_at=cutoff
 WHERE recipient_user_id=(SELECT public.current_user_profile_id()) AND status='unread'
 AND channel_in_app AND deleted_at IS NULL AND scheduled_for<=cutoff;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.f10_mark_all_my_notifications_read() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_mark_all_my_notifications_read() TO authenticated;

CREATE FUNCTION public.f10_guard_personal_notification_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user='authenticated' AND NOT (public.current_user_is_global_admin()
  OR public.current_user_has_permission_globally('notifications.admin')
  OR public.current_user_has_permission_globally('dms.notifications.admin')) THEN
  IF OLD.recipient_user_id IS DISTINCT FROM public.current_user_profile_id()
   OR NOT erp_private.business_principal_is_active() OR OLD.deleted_at IS NOT NULL
   OR NOT OLD.channel_in_app OR OLD.scheduled_for>statement_timestamp()
   OR (to_jsonb(NEW)-ARRAY['status','read_at','dismissed_at','archived_at','updated_at'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','read_at','dismissed_at','archived_at','updated_at']) THEN
   RAISE EXCEPTION 'Only personal notification state may change' USING ERRCODE='42501'; END IF;
  IF NEW.status NOT IN ('read','dismissed','archived')
   OR (OLD.status='archived' AND NEW.status<>'archived')
   OR (OLD.status='dismissed' AND NEW.status='read')
   OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at)
   OR (OLD.dismissed_at IS NOT NULL AND NEW.dismissed_at IS DISTINCT FROM OLD.dismissed_at)
   OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at)
   OR (NEW.read_at IS DISTINCT FROM OLD.read_at AND NEW.status<>'read')
   OR (NEW.dismissed_at IS DISTINCT FROM OLD.dismissed_at AND NEW.status<>'dismissed')
   OR (NEW.archived_at IS DISTINCT FROM OLD.archived_at AND NEW.status<>'archived') THEN
   RAISE EXCEPTION 'Invalid personal notification transition' USING ERRCODE='PT409'; END IF;
  IF OLD.read_at IS NULL AND NEW.status='read' THEN NEW.read_at:=statement_timestamp(); END IF;
  IF OLD.dismissed_at IS NULL AND NEW.status='dismissed' THEN NEW.dismissed_at:=statement_timestamp(); END IF;
  IF OLD.archived_at IS NULL AND NEW.status='archived' THEN NEW.archived_at:=statement_timestamp(); END IF;
  NEW.updated_at:=statement_timestamp();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.f10_guard_personal_notification_update() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f10_personal_update BEFORE UPDATE ON public.erp_notifications
 FOR EACH ROW EXECUTE FUNCTION public.f10_guard_personal_notification_update();

-- This restrictive condition supplements, never replaces, the F03 principal
-- and recipient/admin policies. Future and email-only rows are not personal feed.
CREATE POLICY f10_personal_due_visibility ON public.erp_notifications AS RESTRICTIVE
 FOR SELECT TO authenticated USING (
  (recipient_user_id=(SELECT public.current_user_profile_id()) AND channel_in_app
    AND deleted_at IS NULL AND scheduled_for<=statement_timestamp())
  OR (SELECT public.current_user_is_global_admin())
  OR (SELECT public.current_user_has_permission_globally('notifications.admin'))
  OR (SELECT public.current_user_has_permission_globally('notifications.manage'))
  OR (SELECT public.current_user_has_permission_globally('dms.notifications.admin')));

NOTIFY pgrst,'reload schema';
COMMIT;
