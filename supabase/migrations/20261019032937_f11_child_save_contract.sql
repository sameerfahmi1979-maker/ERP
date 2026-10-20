BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';

ALTER TABLE public.employee_hr_notes ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1;
GRANT SELECT(workspace_revision)ON public.employee_hr_notes TO authenticated;
-- The ERP exposes archive, not permanent note disposal. No retention policy is invented.
REVOKE DELETE ON public.employee_hr_notes FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_revision BEFORE INSERT OR UPDATE ON public.employee_hr_notes FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();

CREATE TABLE erp_private.f11_child_receipts(
 actor uuid NOT NULL,operation_id uuid NOT NULL,kind text NOT NULL CHECK(kind='hr-note'),action text NOT NULL CHECK(action IN('create','archive')),
 employee_id bigint NOT NULL,record_id bigint NOT NULL,revision bigint NOT NULL,
 request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor,operation_id)
);
ALTER TABLE erp_private.f11_child_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f11_child_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX f11_child_receipts_actor_created ON erp_private.f11_child_receipts(actor,created_at DESC,operation_id DESC);

-- A narrow actor-owned receipt lookup, not a business-row/wording bypass.
CREATE FUNCTION erp_private.f11_child_receipt(p_operation uuid)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('kind',r.kind,'employee_id',r.employee_id,'id',r.record_id,'revision',r.revision::text,'operation_id',r.operation_id,'hash',r.request_hash)
 FROM erp_private.f11_child_receipts r JOIN public.employees e ON e.id=r.employee_id AND e.deleted_at IS NULL
 WHERE r.actor=(SELECT auth.uid())AND r.operation_id=p_operation AND(SELECT erp_private.business_principal_is_active())
 AND erp_private.employee_permission(r.employee_id,'hr.actions.manage')
 AND erp_private.employee_permission(r.employee_id,'hr.actions.view')
 AND erp_private.employee_permission(r.employee_id,'hr.confidential.manage')
 AND erp_private.employee_permission(r.employee_id,'hr.confidential.view');
$$;

CREATE FUNCTION erp_private.f11_capture_hr_note()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF NOT erp_private.business_principal_is_active()OR context IS NULL OR context->>'kind'<>'hr-note'
 OR(context->>'employee_id')::bigint<>NEW.employee_id OR nullif(context->>'operation_id','')IS NULL
 OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'A current operation contract is required' USING ERRCODE='42501';END IF;
 IF NOT erp_private.employee_permission(NEW.employee_id,'hr.actions.manage')OR NOT erp_private.employee_permission(NEW.employee_id,'hr.confidential.manage')OR NOT erp_private.employee_permission(NEW.employee_id,'hr.actions.view')OR NOT erp_private.employee_permission(NEW.employee_id,'hr.confidential.view')THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE'AND(to_jsonb(NEW)-ARRAY['workspace_revision','deleted_at','deleted_by'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','deleted_at','deleted_by'])THEN RAISE EXCEPTION 'Notes are append-only; archive with the opening revision' USING ERRCODE='23514';END IF;
 IF(TG_OP='INSERT'AND context->>'action'<>'create')OR(TG_OP='UPDATE'AND(context->>'action'<>'archive'OR OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL))THEN RAISE EXCEPTION 'Invalid note operation' USING ERRCODE='23514';END IF;
 actor:=public.current_user_profile_id();
 IF(TG_OP='INSERT'AND NEW.created_by IS DISTINCT FROM actor)OR(TG_OP='UPDATE'AND NEW.deleted_by IS DISTINCT FROM actor)THEN RAISE EXCEPTION 'Note audit actor mismatch' USING ERRCODE='42501';END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,'hr-note',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_hr_notes',NEW.id,context->>'action',jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision,'note_type',NEW.note_type,'visibility',NEW.visibility));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_note_operation AFTER INSERT OR UPDATE ON public.employee_hr_notes FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_hr_note();

CREATE FUNCTION public.f11_mutate_hr_child(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;note_type text;visibility text;
BEGIN
 IF auth.uid()IS NULL OR NOT erp_private.business_principal_is_active()OR NOT erp_private.employee_permission(p_employee,'hr.actions.manage')OR NOT erp_private.employee_permission(p_employee,'hr.confidential.manage')OR NOT erp_private.employee_permission(p_employee,'hr.actions.view')OR NOT erp_private.employee_permission(p_employee,'hr.confidential.view')THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'hr-note'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','archive')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action='archive'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1 OR p_data<>'{}'))THEN RAISE EXCEPTION 'Invalid child operation contract' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF p_action='create'THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['note_type','note_text','visibility','related_record_type','related_record_id']))
  OR jsonb_typeof(p_data->'note_text')IS DISTINCT FROM 'string'OR nullif(btrim(p_data->>'note_text'),'')IS NULL OR length(p_data->>'note_text')>10000
  OR(p_data?'note_type'AND jsonb_typeof(p_data->'note_type')IS DISTINCT FROM 'string')OR(p_data?'visibility'AND jsonb_typeof(p_data->'visibility')IS DISTINCT FROM 'string')
  OR(p_data?'related_record_type'AND jsonb_typeof(p_data->'related_record_type')NOT IN('string','null'))OR length(p_data->>'related_record_type')>100
  OR(p_data?'related_record_id'AND(jsonb_typeof(p_data->'related_record_id')NOT IN('number','null')OR jsonb_typeof(p_data->'related_record_id')<>'null'AND((p_data->>'related_record_id')!~'^[1-9][0-9]*$'OR(p_data->>'related_record_id')::numeric>9007199254740991)))
  THEN RAISE EXCEPTION 'Invalid note fields' USING ERRCODE='23514';END IF;
  note_type:=coalesce(p_data->>'note_type','general');visibility:=coalesce(p_data->>'visibility','hr_only');
  IF note_type NOT IN('general','confidential','management','legal','other')OR visibility NOT IN('hr_only','management','restricted')THEN RAISE EXCEPTION 'Invalid note classification' USING ERRCODE='23514';END IF;
 ELSE
  SELECT id,workspace_revision INTO existing FROM public.employee_hr_notes WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Note unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Note changed after opening' USING ERRCODE='P0409';END IF;
 END IF;
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_hr_notes(employee_id,note_type,note_text,visibility,related_record_type,related_record_id,created_by)
  VALUES(p_employee,note_type,btrim(p_data->>'note_text'),visibility,p_data->>'related_record_type',(p_data->>'related_record_id')::bigint,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSE
  UPDATE public.employee_hr_notes SET deleted_at=clock_timestamp(),deleted_by=actor WHERE id=p_id AND employee_id=p_employee AND workspace_revision=p_revision AND deleted_at IS NULL RETURNING id,workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.business_principal_is_active()OR NOT erp_private.employee_permission(p_employee,'hr.actions.manage')OR NOT erp_private.employee_permission(p_employee,'hr.confidential.manage')OR NOT erp_private.employee_permission(p_employee,'hr.actions.view')OR NOT erp_private.employee_permission(p_employee,'hr.confidential.view')THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;

CREATE FUNCTION public.f11_reconcile_hr_child(p_operation uuid)RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT(s.receipt-'hash')||jsonb_build_object('replayed',true)FROM(SELECT erp_private.f11_child_receipt(p_operation)AS receipt)s WHERE s.receipt IS NOT NULL$$;

CREATE FUNCTION erp_private.f11_recent_child_receipts(p_before timestamptz,p_before_operation uuid,p_limit integer)RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid()IS NULL OR NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR(p_before IS NULL)<>(p_before_operation IS NULL)THEN RAISE EXCEPTION 'Invalid recovery cursor' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT jsonb_build_object('kind',r.kind,'action',r.action,'employee_id',r.employee_id,'id',r.record_id,'revision',r.revision::text,'operation_id',r.operation_id,'created_at',r.created_at,'replayed',true)
 FROM erp_private.f11_child_receipts r JOIN public.employees e ON e.id=r.employee_id AND e.deleted_at IS NULL
 WHERE r.actor=auth.uid()AND(p_before IS NULL OR(r.created_at,r.operation_id)<(p_before,p_before_operation))
 AND erp_private.employee_permission(r.employee_id,'hr.actions.manage')AND erp_private.employee_permission(r.employee_id,'hr.actions.view')AND erp_private.employee_permission(r.employee_id,'hr.confidential.manage')AND erp_private.employee_permission(r.employee_id,'hr.confidential.view')
 ORDER BY r.created_at DESC,r.operation_id DESC LIMIT p_limit;
END $$;
CREATE FUNCTION public.f11_recent_hr_child_receipts(p_before timestamptz DEFAULT NULL,p_before_operation uuid DEFAULT NULL,p_limit integer DEFAULT 26)RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT * FROM erp_private.f11_recent_child_receipts(p_before,p_before_operation,p_limit)$$;
REVOKE ALL ON FUNCTION erp_private.f11_recent_child_receipts(timestamptz,uuid,integer),public.f11_recent_hr_child_receipts(timestamptz,uuid,integer)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_recent_child_receipts(timestamptz,uuid,integer),public.f11_recent_hr_child_receipts(timestamptz,uuid,integer)TO authenticated;
REVOKE ALL ON FUNCTION erp_private.f11_capture_hr_note(),erp_private.f11_child_receipt(uuid),public.f11_mutate_hr_child(text,bigint,bigint,bigint,uuid,text,jsonb),public.f11_reconcile_hr_child(uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_child_receipt(uuid),public.f11_mutate_hr_child(text,bigint,bigint,bigint,uuid,text,jsonb),public.f11_reconcile_hr_child(uuid)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
