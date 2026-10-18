BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.notification_open_intents(
 token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id bigint NOT NULL REFERENCES public.erp_notifications(id),
 profile_id bigint NOT NULL REFERENCES public.user_profiles(id),
 target_path text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT (statement_timestamp()+interval '5 minutes'),
 completed_at timestamptz
);
ALTER TABLE erp_private.notification_open_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_open_intents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.notification_open_intents FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX f10_open_expiry ON erp_private.notification_open_intents(expires_at);

-- Authoritative target resolution, never a client-supplied action URL. Unknown
-- or unsupported source types fail closed, rather than claiming an open passed.
CREATE FUNCTION public.f10_notification_target(source_type text,source_id bigint) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE employee_id bigint; document_id bigint;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR $2 IS NULL OR $2<1 THEN RETURN NULL; END IF;
 IF $1='dms_documents' THEN
  IF public.current_user_can_view_dms_document($2) THEN RETURN '/dms/documents/record/'||$2; END IF;
 ELSIF $1='dms_review_queue' THEN
  SELECT q.document_id INTO document_id FROM public.dms_review_queue q WHERE q.id=$2 AND q.deleted_at IS NULL;
  IF document_id IS NOT NULL AND public.current_user_can_view_dms_document(document_id) THEN RETURN '/dms/documents/record/'||document_id; END IF;
 ELSIF $1 IN ('employees','employee_identity_documents','employee_medical_insurances') THEN
  IF $1='employees' THEN employee_id:=$2;
  ELSIF $1='employee_identity_documents' THEN
   SELECT d.employee_id INTO employee_id FROM public.employee_identity_documents d WHERE d.id=$2 AND d.deleted_at IS NULL;
  ELSE SELECT d.employee_id INTO employee_id FROM public.employee_medical_insurances d WHERE d.id=$2 AND d.deleted_at IS NULL;
  END IF;
  IF employee_id IS NOT NULL AND public.current_user_can_view_employee(employee_id)
   AND ($1<>'employee_medical_insurances' OR public.current_user_can_view_employee_medical(employee_id)) THEN
   RETURN '/admin/hr/employees/record/'||employee_id;
  END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.f10_notification_target(text,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_notification_target(text,bigint) TO authenticated;

CREATE POLICY f10_current_source_visibility ON public.erp_notifications AS RESTRICTIVE
FOR SELECT TO authenticated USING (
 source_entity_type IS NULL OR source_entity_type NOT IN
 ('dms_documents','dms_review_queue','employees','employee_identity_documents','employee_medical_insurances')
 OR public.f10_notification_target(source_entity_type,source_entity_id) IS NOT NULL);

CREATE FUNCTION public.f10_prepare_notification_open(notification_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n public.erp_notifications; path text; ticket uuid;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO n FROM public.erp_notifications WHERE id=$1 AND recipient_user_id=public.current_user_profile_id()
  AND deleted_at IS NULL AND channel_in_app AND scheduled_for<=statement_timestamp() AND status IN ('unread','read','dismissed','archived');
 IF NOT FOUND THEN RAISE EXCEPTION 'Notification unavailable' USING ERRCODE='P0002'; END IF;
 path:=public.f10_notification_target(n.source_entity_type,n.source_entity_id);
 IF path IS NULL THEN RAISE EXCEPTION 'Target unavailable or not authorized' USING ERRCODE='P0002'; END IF;
 INSERT INTO erp_private.notification_open_intents(notification_id,profile_id,target_path)
 VALUES(n.id,n.recipient_user_id,path) RETURNING token INTO ticket;
 RETURN jsonb_build_object('id',n.id,'token',ticket,'path',path);
END $$;
REVOKE ALL ON FUNCTION public.f10_prepare_notification_open(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_prepare_notification_open(bigint) TO authenticated;

CREATE FUNCTION public.f10_complete_notification_open(open_token uuid,target_path text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ticket erp_private.notification_open_intents; n public.erp_notifications; path text;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO ticket FROM erp_private.notification_open_intents WHERE token=$1
 AND profile_id=public.current_user_profile_id() AND expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND OR ticket.target_path IS DISTINCT FROM $2 THEN RETURN false; END IF;
 SELECT * INTO n FROM public.erp_notifications WHERE id=ticket.notification_id AND recipient_user_id=ticket.profile_id
 AND deleted_at IS NULL AND channel_in_app AND scheduled_for<=statement_timestamp() AND status IN ('unread','read','dismissed','archived') FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 path:=public.f10_notification_target(n.source_entity_type,n.source_entity_id);
 IF path IS NULL OR path IS DISTINCT FROM ticket.target_path THEN RETURN false; END IF;
 IF ticket.completed_at IS NOT NULL THEN RETURN true; END IF;
 IF n.status='unread' THEN
  UPDATE public.erp_notifications SET status='read',read_at=coalesce(read_at,statement_timestamp()),updated_at=statement_timestamp() WHERE id=n.id;
 END IF;
 UPDATE erp_private.notification_open_intents SET completed_at=statement_timestamp() WHERE token=ticket.token;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.f10_complete_notification_open(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_complete_notification_open(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
