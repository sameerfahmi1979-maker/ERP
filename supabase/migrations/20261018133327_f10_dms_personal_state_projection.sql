BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- Global personal state is authoritative. The DMS source worklist keeps its
-- legacy enum: archived personal notices project to dismissed, never disposed.
CREATE FUNCTION erp_private.f10_project_dms_personal_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.source_module<>'DMS' OR NEW.source_entity_type<>'dms_documents' OR NEW.recipient_user_id IS NULL
  OR NEW.status NOT IN ('read','dismissed','archived') THEN RETURN NEW; END IF;
 UPDATE public.dms_notification_queue q SET
  status=CASE WHEN NEW.status='read' THEN 'read' ELSE 'dismissed' END,
  read_at=coalesce(q.read_at,NEW.read_at),dismissed_at=coalesce(q.dismissed_at,NEW.dismissed_at,NEW.archived_at),
  updated_at=statement_timestamp()
 WHERE q.global_notification_id=NEW.id AND q.document_id=NEW.source_entity_id AND q.recipient_user_id=NEW.recipient_user_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f10_project_dms_personal_state() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f10_dms_personal_state AFTER UPDATE OF status ON public.erp_notifications
 FOR EACH ROW EXECUTE FUNCTION erp_private.f10_project_dms_personal_state();

CREATE FUNCTION public.f10_transition_my_dms_notification(dms_notification_id bigint,transition text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.dms_notification_queue; n public.erp_notifications; actor bigint; changed bigint;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF $1 IS NULL OR $1<1 OR $2 IS NULL OR $2 NOT IN ('read','dismissed') THEN RAISE EXCEPTION 'Invalid state change' USING ERRCODE='22023'; END IF;
 actor:=public.current_user_profile_id();
 -- Lock ordering stays notification -> DMS source, matching the projection.
 SELECT * INTO q FROM public.dms_notification_queue WHERE id=$1 AND recipient_user_id=actor AND scheduled_for<=statement_timestamp();
 IF NOT FOUND OR q.global_notification_id IS NULL THEN RAISE EXCEPTION 'Personal delivery not available' USING ERRCODE='P0002'; END IF;
 -- Narrow definer boundary: ordinary recipients do not gain general DMS queue
 -- editing permission. Reauthorize both the exact personal delivery and source.
 SELECT * INTO n FROM public.erp_notifications WHERE id=q.global_notification_id AND recipient_user_id=actor
  AND source_module='DMS' AND source_entity_type='dms_documents' AND source_entity_id=q.document_id
  AND channel_in_app AND deleted_at IS NULL AND scheduled_for<=statement_timestamp();
 IF NOT FOUND OR public.f10_notification_target('dms_documents',q.document_id) IS NULL THEN
  RAISE EXCEPTION 'Personal source unavailable' USING ERRCODE='P0002'; END IF;
 PERFORM public.f10_transition_my_notification(q.global_notification_id,$2);
 SELECT * INTO n FROM public.erp_notifications WHERE id=q.global_notification_id AND recipient_user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Personal state unavailable' USING ERRCODE='P0002'; END IF;
 -- Targeted reconciliation also covers a legacy source whose global state was
 -- already changed before this migration. Never bulk-rewrite old receipts.
 UPDATE public.dms_notification_queue SET status=$2,read_at=coalesce(read_at,n.read_at),dismissed_at=coalesce(dismissed_at,n.dismissed_at),updated_at=statement_timestamp()
 WHERE id=q.id AND recipient_user_id=actor AND global_notification_id=n.id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Source state changed; refresh' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('id',q.id,'status',$2);
END $$;
REVOKE ALL ON FUNCTION public.f10_transition_my_dms_notification(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_transition_my_dms_notification(bigint,text) TO authenticated;
-- Personal DMS inbox is a projection of the SAME authorized global delivery,
-- not a second independently-read producer queue. Admin operational reads keep
-- the original PERF view and its source/bridge states.
CREATE VIEW public.f10_dms_personal_notification_read WITH(security_invoker=true) AS
 SELECT v.id,v.document_id,v.recipient_user_id,n.title AS subject,n.message,'in_app'::text AS channel,
  CASE WHEN n.status='unread' THEN 'pending' ELSE n.status END AS status,n.scheduled_for,n.read_at,
  v.bridge_status,v.global_notification_id,v.global_email_queue_id,v.visible_document_id,v.document_no
 FROM public.perf_dms_notification_read v JOIN public.erp_notifications n ON n.id=v.global_notification_id
  AND n.source_module='DMS' AND n.source_entity_type='dms_documents' AND n.source_entity_id=v.document_id
  AND n.recipient_user_id=v.recipient_user_id
 WHERE n.channel_in_app AND n.deleted_at IS NULL AND n.scheduled_for<=statement_timestamp();
REVOKE ALL ON public.f10_dms_personal_notification_read FROM PUBLIC,anon,service_role;
GRANT SELECT ON public.f10_dms_personal_notification_read TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
