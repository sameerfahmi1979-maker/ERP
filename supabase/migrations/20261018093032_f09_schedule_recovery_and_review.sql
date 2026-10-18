-- F09 adopts F04's receipt pattern without changing F06's entity whitelist.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.erp_report_schedules ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1;
GRANT SELECT(workspace_revision) ON public.erp_report_schedules TO authenticated;

CREATE TABLE erp_private.f09_schedule_save_receipts (
 actor uuid NOT NULL,operation_id uuid NOT NULL,request_hash text NOT NULL,
 record_id bigint NOT NULL,revision bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor,operation_id)
);
ALTER TABLE erp_private.f09_schedule_save_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f09_schedule_save_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f09_schedule_config_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.workspace_revision:=1;
 ELSIF (to_jsonb(NEW)-ARRAY['workspace_revision','updated_at','last_run_at','last_status','next_run_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['workspace_revision','updated_at','last_run_at','last_status','next_run_at'])
   OR (auth.uid() IS NOT NULL AND NEW.next_run_at IS DISTINCT FROM OLD.next_run_at)
 THEN NEW.workspace_revision:=OLD.workspace_revision+1;
 ELSE NEW.workspace_revision:=OLD.workspace_revision; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f09_schedule_config_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f09_config_revision BEFORE INSERT OR UPDATE ON public.erp_report_schedules
 FOR EACH ROW EXECUTE FUNCTION erp_private.f09_schedule_config_revision();

CREATE FUNCTION erp_private.f09_schedule_receipt_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb;
BEGIN
 c:=nullif(current_setting('erp.f09_schedule_save',true),'')::jsonb;
 IF c IS NOT NULL AND auth.uid() IS NOT NULL THEN
  INSERT INTO erp_private.f09_schedule_save_receipts(actor,operation_id,request_hash,record_id,revision)
   VALUES(auth.uid(),(c->>'operation')::uuid,c->>'hash',NEW.id,NEW.workspace_revision);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f09_schedule_receipt_capture() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f09_save_receipt AFTER INSERT OR UPDATE ON public.erp_report_schedules
 FOR EACH ROW EXECUTE FUNCTION erp_private.f09_schedule_receipt_capture();
CREATE FUNCTION erp_private.f09_schedule_receipt_read(p_operation uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('hash',request_hash,'id',record_id,'revision',revision::text)
 FROM erp_private.f09_schedule_save_receipts WHERE actor=(SELECT auth.uid()) AND operation_id=p_operation
 AND (SELECT erp_private.business_principal_is_active());
$$;
REVOKE ALL ON FUNCTION erp_private.f09_schedule_receipt_read(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f09_schedule_receipt_read(uuid) TO authenticated;

-- Catalog eligibility only, never report contents. Same current principal and
-- company delivery checks as the source adapter; no caller-supplied grants.
CREATE FUNCTION erp_private.f09_report_schedulable(p_report bigint,p_company bigint) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.erp_report_registry; code text;
BEGIN
 IF NOT erp_private.f09_schedule_delivery_scope(p_company) THEN RETURN false; END IF;
 SELECT * INTO r FROM public.erp_report_registry WHERE id=p_report AND is_active AND deleted_at IS NULL;
 IF NOT FOUND OR r.supports_scheduling IS NOT TRUE OR coalesce(r.document_class,'') NOT IN ('','E','F','G') THEN RETURN false; END IF;
 FOREACH code IN ARRAY coalesce(r.required_permissions,ARRAY[]::text[]) LOOP
  IF NOT (erp_private.permission_in_scope(code,p_company,NULL) OR erp_private.permission_in_scope(code||'.self',p_company,NULL)
   OR erp_private.permission_in_scope(code||'.team',p_company,NULL)) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION erp_private.f09_report_schedulable(bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f09_report_schedulable(bigint,bigint) TO authenticated;

CREATE FUNCTION public.f09_save_schedule(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed text[]:=ARRAY['report_id','owner_company_id','schedule_name','filters_json','selected_template_id','output_format',
 'recipient_to','recipient_cc','email_subject_template','email_body_template','frequency','day_of_week','day_of_month','time_of_day','timezone','next_run_at','is_active'];
 actor_id bigint;h text;receipt jsonb;s public.erp_report_schedules;payload jsonb;new_row jsonb;
 cols text;vals text;assigns text;target_company bigint;target_report bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING errcode='42501'; END IF;
 IF p_operation IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR p_data='{}' OR octet_length(p_data::text)>65536
  OR (p_id IS NULL AND p_revision IS NOT NULL) OR (p_id IS NOT NULL AND (p_id<=0 OR p_revision IS NULL OR p_revision<1))
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT k=ANY(allowed))
  OR (p_id IS NOT NULL AND p_data ? 'report_id') THEN RAISE EXCEPTION 'Invalid save contract' USING errcode='22023'; END IF;
 actor_id:=public.current_user_profile_id();
 -- next_run_at is derived from the same timing configuration. A retry after a
 -- clock boundary recovers the original committed due slot, never a second save.
 h:=encode(sha256(convert_to(jsonb_build_array(p_id,p_revision,p_data-'next_run_at')::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':f09:'||p_operation::text,0));
 receipt:=erp_private.f09_schedule_receipt_read(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>h THEN RAISE EXCEPTION 'Operation already used for different input' USING errcode='22023'; END IF;
  SELECT * INTO s FROM public.erp_report_schedules WHERE id=(receipt->>'id')::bigint AND deleted_at IS NULL;
  IF NOT FOUND OR NOT erp_private.f09_schedule_delivery_scope(s.owner_company_id)
   OR NOT (s.created_by=actor_id OR erp_private.permission_in_scope('reports.schedule.manage',s.owner_company_id,NULL))
   THEN RAISE EXCEPTION 'Record unavailable' USING errcode='42501'; END IF;
  RETURN jsonb_build_object('id',receipt->'id','revision',receipt->>'revision','replayed',true);
 END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO s FROM public.erp_report_schedules WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record unavailable' USING errcode='42501'; END IF;
  IF s.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Record changed' USING errcode='P0409'; END IF;
  IF NOT erp_private.f09_schedule_delivery_scope(s.owner_company_id)
   OR NOT (s.created_by=actor_id OR erp_private.permission_in_scope('reports.schedule.manage',s.owner_company_id,NULL))
   THEN RAISE EXCEPTION 'Permission denied' USING errcode='42501'; END IF;
 END IF;
 target_company:=CASE WHEN p_data ? 'owner_company_id' THEN (p_data->>'owner_company_id')::bigint ELSE s.owner_company_id END;
 target_report:=CASE WHEN p_id IS NULL THEN (p_data->>'report_id')::bigint ELSE s.report_id END;
 IF NOT erp_private.f09_report_schedulable(target_report,target_company) THEN RAISE EXCEPTION 'Delivery unavailable' USING errcode='42501'; END IF;
 IF p_data ? 'timezone' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_data->>'timezone') THEN RAISE EXCEPTION 'Invalid timezone' USING errcode='22023'; END IF;
 IF p_data ? 'recipient_to' AND (jsonb_typeof(p_data->'recipient_to')<>'array' OR jsonb_array_length(p_data->'recipient_to') NOT BETWEEN 1 AND 100)
  OR p_data ? 'recipient_cc' AND p_data->'recipient_cc'<>'null' AND (jsonb_typeof(p_data->'recipient_cc')<>'array' OR jsonb_array_length(p_data->'recipient_cc')>100)
  THEN RAISE EXCEPTION 'Invalid recipients' USING errcode='22023'; END IF;
 payload:=p_data;
 IF p_id IS NULL THEN payload:=payload||jsonb_build_object('created_by',actor_id,'schedule_code','SCH-'||actor_id||'-'||p_operation);
 ELSE payload:=payload||jsonb_build_object('updated_at',clock_timestamp()); END IF;
 PERFORM set_config('erp.f09_schedule_save',jsonb_build_object('operation',p_operation,'hash',h)::text,true);
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k),
  string_agg(format('%I=r.%I',k,k),',' ORDER BY k) INTO cols,vals,assigns FROM jsonb_object_keys(payload) k;
 IF p_id IS NULL THEN
  EXECUTE format('INSERT INTO public.erp_report_schedules(%s) SELECT %s FROM jsonb_populate_record(NULL::public.erp_report_schedules,$1) r',cols,vals) USING payload;
  receipt:=erp_private.f09_schedule_receipt_read(p_operation);
  SELECT jsonb_build_object('id',id,'revision',workspace_revision::text) INTO new_row FROM public.erp_report_schedules WHERE id=(receipt->>'id')::bigint AND deleted_at IS NULL;
 ELSE
  EXECUTE format('UPDATE public.erp_report_schedules t SET %s FROM jsonb_populate_record(NULL::public.erp_report_schedules,$1) r WHERE t.id=$2 AND t.workspace_revision=$3 AND t.deleted_at IS NULL RETURNING jsonb_build_object(''id'',t.id,''revision'',t.workspace_revision::text)',assigns)
   INTO new_row USING payload,p_id,p_revision;
 END IF;
 PERFORM set_config('erp.f09_schedule_save','',true);
 IF new_row IS NULL THEN RAISE EXCEPTION 'Save unavailable' USING errcode='42501'; END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor_id,target_company,'REPORTS','erp_report_schedules',(new_row->>'id')::bigint,CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,
  jsonb_build_object('operation_id',p_operation,'revision',new_row->>'revision'));
 RETURN new_row||jsonb_build_object('replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.f09_save_schedule(uuid,bigint,bigint,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f09_save_schedule(uuid,bigint,bigint,jsonb) TO authenticated;

CREATE FUNCTION public.f09_remove_schedule(p_operation uuid,p_id bigint,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor_id bigint;h text;receipt jsonb;s public.erp_report_schedules;result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING errcode='42501'; END IF;
 IF p_operation IS NULL OR p_id IS NULL OR p_id<=0 OR p_revision IS NULL OR p_revision<1 THEN RAISE EXCEPTION 'Invalid removal contract' USING errcode='22023'; END IF;
 actor_id:=public.current_user_profile_id();h:=encode(sha256(convert_to(jsonb_build_array('remove',p_id,p_revision)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':f09:'||p_operation::text,0));
 receipt:=erp_private.f09_schedule_receipt_read(p_operation);
 IF receipt IS NOT NULL AND receipt->>'hash'<>h THEN RAISE EXCEPTION 'Operation already used for different input' USING errcode='22023'; END IF;
 SELECT * INTO s FROM public.erp_report_schedules WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT erp_private.f09_schedule_delivery_scope(s.owner_company_id)
  OR NOT(s.created_by=actor_id OR erp_private.permission_in_scope('reports.schedule.manage',s.owner_company_id,NULL))
  THEN RAISE EXCEPTION 'Record unavailable' USING errcode='42501'; END IF;
 IF receipt IS NOT NULL THEN RETURN jsonb_build_object('id',receipt->'id','revision',receipt->>'revision','replayed',true); END IF;
 IF s.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Schedule already removed by another operation' USING errcode='22023'; END IF;
 IF s.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Record changed' USING errcode='P0409'; END IF;
 PERFORM set_config('erp.f09_schedule_save',jsonb_build_object('operation',p_operation,'hash',h)::text,true);
 UPDATE public.erp_report_schedules SET deleted_at=clock_timestamp(),deleted_by=actor_id,is_active=false,updated_at=clock_timestamp()
 WHERE id=p_id AND workspace_revision=p_revision AND deleted_at IS NULL
 RETURNING jsonb_build_object('id',id,'revision',workspace_revision::text,'replayed',false) INTO result;
 PERFORM set_config('erp.f09_schedule_save','',true);
 IF result IS NULL THEN RAISE EXCEPTION 'Removal unavailable' USING errcode='42501'; END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 VALUES(actor_id,s.owner_company_id,'REPORTS','erp_report_schedules',p_id,s.schedule_code,'delete',jsonb_build_object('operation_id',p_operation,'revision',result->>'revision'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.f09_remove_schedule(uuid,bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f09_remove_schedule(uuid,bigint,bigint) TO authenticated;

-- Operator reviews are append-only facts. They NEVER convert unknown to sent,
-- recall mail, reset attempts or create another send intent.
CREATE TABLE public.erp_email_delivery_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,queue_id bigint NOT NULL REFERENCES public.erp_email_queue(id),
 actor_user_profile_id bigint NOT NULL REFERENCES public.user_profiles(id),operation_id uuid NOT NULL,
 disposition text NOT NULL CHECK(disposition IN ('investigating','provider_accepted_confirmed','provider_not_accepted_confirmed')),
 trace_reference text NOT NULL CHECK(length(trace_reference) BETWEEN 3 AND 200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(actor_user_profile_id,operation_id)
);
ALTER TABLE public.erp_email_delivery_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_email_delivery_reviews FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX f09_email_delivery_reviews_queue ON public.erp_email_delivery_reviews(queue_id,id);
CREATE FUNCTION public.f09_record_delivery_review(p_queue bigint,p_operation uuid,p_disposition text,p_trace text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id bigint;prior public.erp_email_delivery_reviews;review_id bigint;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR NOT (public.current_user_is_global_admin()
  OR public.current_user_has_permission_globally('notifications.admin')
  OR (public.current_user_has_permission_globally('notifications.email_queue.manage') AND public.current_user_has_permission_globally('notifications.email_queue.process')))
  THEN RAISE EXCEPTION 'Permission denied' USING errcode='42501'; END IF;
 IF p_operation IS NULL OR p_queue IS NULL OR p_queue<=0 OR p_disposition IS NULL
  OR p_disposition NOT IN ('investigating','provider_accepted_confirmed','provider_not_accepted_confirmed')
  OR p_trace IS NULL OR p_trace !~ '^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{2,199}$'
  THEN RAISE EXCEPTION 'Invalid review reference' USING errcode='22023'; END IF;
 actor_id:=public.current_user_profile_id();
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':f09review:'||p_operation::text,0));
 SELECT * INTO prior FROM public.erp_email_delivery_reviews WHERE actor_user_profile_id=actor_id AND operation_id=p_operation;
 IF FOUND THEN
  IF prior.queue_id<>p_queue OR prior.disposition<>p_disposition OR prior.trace_reference<>p_trace THEN RAISE EXCEPTION 'Operation already used' USING errcode='22023'; END IF;
  RETURN prior.id;
 END IF;
 PERFORM 1 FROM public.erp_email_queue WHERE id=p_queue AND status='delivery_unknown' AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review requires a held uncertain delivery' USING errcode='22023'; END IF;
 INSERT INTO public.erp_email_delivery_reviews(queue_id,actor_user_profile_id,operation_id,disposition,trace_reference)
 VALUES(p_queue,actor_id,p_operation,p_disposition,p_trace) RETURNING id INTO review_id;
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor_id,'NOTIFICATIONS','erp_email_delivery_reviews',review_id,'create',jsonb_build_object('queue_id',p_queue,'disposition',p_disposition,'operation_id',p_operation));
 RETURN review_id;
END $$;
REVOKE ALL ON FUNCTION public.f09_record_delivery_review(bigint,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f09_record_delivery_review(bigint,uuid,text,text) TO authenticated;
GRANT SELECT ON public.erp_email_delivery_reviews TO authenticated;
CREATE POLICY f09_delivery_review_read ON public.erp_email_delivery_reviews FOR SELECT TO authenticated USING(
 (SELECT erp_private.business_principal_is_active()) AND ((SELECT public.current_user_is_global_admin())
 OR (SELECT public.current_user_has_permission_globally('notifications.email_queue.view'))
 OR (SELECT public.current_user_has_permission_globally('notifications.email_queue.manage'))
 OR (SELECT public.current_user_has_permission_globally('notifications.admin'))));
NOTIFY pgrst,'reload schema';
COMMIT;
