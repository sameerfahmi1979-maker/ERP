BEGIN;
-- F11 confidential record adoption; no employee mappings or operational decisions.
ALTER TABLE public.employee_disciplinary_records ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_disciplinary_records TO authenticated;
REVOKE DELETE ON public.employee_disciplinary_records FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_disciplinary_revision BEFORE INSERT OR UPDATE ON public.employee_disciplinary_records FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CHECK(kind IN('hr-note','pro-process','hr-action','performance','disciplinary'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close'))OR(kind='disciplinary'AND action IN('create','update','archive','acknowledge','close')));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary')AND erp_private.business_principal_is_active()
 AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage'))),false)
$$;

CREATE FUNCTION erp_private.f11_capture_disciplinary()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'disciplinary'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'
 OR NOT erp_private.f11_child_authorized('disciplinary',NEW.employee_id)THEN RAISE EXCEPTION 'Current confidential operation contract required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor OR NEW.acknowledged_by_employee OR NEW.acknowledged_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid disciplinary create' USING ERRCODE='23514';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Opening changed' USING ERRCODE='P0409';END IF;
  IF context->>'action'='archive'THEN
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','deleted_at','deleted_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','deleted_at','deleted_by','updated_at'])THEN RAISE EXCEPTION 'Invalid disciplinary archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='update'THEN
   IF NEW.updated_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','subject','disciplinary_type','record_date','incident_date','severity','status','description','action_taken','creates_operational_block','updated_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','subject','disciplinary_type','record_date','incident_date','severity','status','description','action_taken','creates_operational_block','updated_by','updated_at'])THEN RAISE EXCEPTION 'Unrecognized disciplinary changes' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='acknowledge'THEN
   IF OLD.acknowledged_by_employee OR NOT NEW.acknowledged_by_employee OR NEW.acknowledged_at IS NULL OR NEW.updated_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','acknowledged_by_employee','acknowledged_at','updated_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','acknowledged_by_employee','acknowledged_at','updated_by','updated_at'])THEN RAISE EXCEPTION 'Invalid acknowledgement' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='close'THEN
   IF NEW.status IS DISTINCT FROM 'closed'OR OLD.status NOT IN('open','under_review')OR NEW.updated_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','status','action_taken','updated_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','status','action_taken','updated_by','updated_at'])THEN RAISE EXCEPTION 'Invalid close' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Invalid disciplinary operation' USING ERRCODE='22023';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,'disciplinary',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_disciplinary_records',NEW.id,context->>'action',jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_disciplinary_operation AFTER INSERT OR UPDATE ON public.employee_disciplinary_records FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_disciplinary();

CREATE FUNCTION public.f11_mutate_disciplinary(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;v_status text;v_type text;v_severity text;v_date date;v_incident date;v_flag boolean;
BEGIN
 IF NOT erp_private.f11_child_authorized('disciplinary',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'disciplinary'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','archive','acknowledge','close')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action IN('archive','acknowledge')AND p_data<>'{}')THEN RAISE EXCEPTION 'Invalid disciplinary operation contract' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 IF p_action IN('create','update')THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['subject','disciplinary_type','record_date','incident_date','severity','status','description','action_taken','creates_operational_block']))
  OR jsonb_typeof(p_data->'subject')IS DISTINCT FROM 'string'OR nullif(btrim(p_data->>'subject'),'')IS NULL OR length(p_data->>'subject')>500
  OR jsonb_typeof(p_data->'disciplinary_type')IS DISTINCT FROM 'string'OR jsonb_typeof(p_data->'record_date')IS DISTINCT FROM 'string'OR(p_data->>'record_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR(p_data?'incident_date'AND jsonb_typeof(p_data->'incident_date')NOT IN('string','null'))OR(p_data->>'incident_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR(p_data?'status'AND jsonb_typeof(p_data->'status')IS DISTINCT FROM 'string')OR(p_data?'severity'AND jsonb_typeof(p_data->'severity')IS DISTINCT FROM 'string')
  OR(p_data?'description'AND jsonb_typeof(p_data->'description')NOT IN('string','null'))OR length(p_data->>'description')>5000
  OR(p_data?'action_taken'AND jsonb_typeof(p_data->'action_taken')NOT IN('string','null'))OR length(p_data->>'action_taken')>5000
  OR(p_data?'creates_operational_block'AND jsonb_typeof(p_data->'creates_operational_block')IS DISTINCT FROM 'boolean')THEN RAISE EXCEPTION 'Invalid disciplinary fields' USING ERRCODE='23514';END IF;
  v_type:=p_data->>'disciplinary_type';v_status:=coalesce(p_data->>'status','open');v_severity:=coalesce(p_data->>'severity','medium');v_date:=(p_data->>'record_date')::date;v_incident:=(p_data->>'incident_date')::date;v_flag:=coalesce((p_data->>'creates_operational_block')::boolean,false);
  IF v_type NOT IN('verbal_warning','written_warning','final_warning','suspension_notice','incident','other')OR v_status NOT IN('open','under_review','closed','cancelled')OR v_severity NOT IN('low','medium','high','critical')THEN RAISE EXCEPTION 'Invalid classification' USING ERRCODE='23514';END IF;
 ELSIF p_action='close'THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>'notes')OR(p_data?'notes'AND jsonb_typeof(p_data->'notes')IS DISTINCT FROM 'string')OR length(p_data->>'notes')>5000 THEN RAISE EXCEPTION 'Invalid close fields' USING ERRCODE='23514';END IF;
 END IF;
 IF p_action<>'create'THEN
  SELECT id,workspace_revision,status,acknowledged_by_employee INTO existing FROM public.employee_disciplinary_records WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disciplinary record unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Record changed after opening' USING ERRCODE='P0409';END IF;
  IF(p_action='acknowledge'AND existing.acknowledged_by_employee)OR(p_action='close'AND existing.status NOT IN('open','under_review'))THEN RAISE EXCEPTION 'Status operation is no longer available' USING ERRCODE='23514';END IF;
 END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_disciplinary_records(employee_id,subject,disciplinary_type,record_date,incident_date,severity,status,description,action_taken,creates_operational_block,created_by,updated_by)
  VALUES(p_employee,btrim(p_data->>'subject'),v_type,v_date,v_incident,v_severity,v_status,p_data->>'description',p_data->>'action_taken',v_flag,actor,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSIF p_action='update'THEN
  UPDATE public.employee_disciplinary_records x SET subject=btrim(p_data->>'subject'),disciplinary_type=v_type,record_date=v_date,incident_date=v_incident,severity=v_severity,status=v_status,description=p_data->>'description',action_taken=p_data->>'action_taken',creates_operational_block=v_flag,updated_by=actor
  WHERE x.id=p_id AND x.employee_id=p_employee AND x.workspace_revision=p_revision AND x.deleted_at IS NULL RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSIF p_action='acknowledge'THEN
  UPDATE public.employee_disciplinary_records x SET acknowledged_by_employee=true,acknowledged_at=clock_timestamp(),updated_by=actor
  WHERE x.id=p_id AND x.employee_id=p_employee AND x.workspace_revision=p_revision AND x.deleted_at IS NULL RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSIF p_action='close'THEN
  UPDATE public.employee_disciplinary_records x SET status='closed',action_taken=CASE WHEN nullif(p_data->>'notes','')IS NOT NULL THEN p_data->>'notes'ELSE x.action_taken END,updated_by=actor
  WHERE x.id=p_id AND x.employee_id=p_employee AND x.workspace_revision=p_revision AND x.deleted_at IS NULL RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSE
  UPDATE public.employee_disciplinary_records SET deleted_at=clock_timestamp(),deleted_by=actor WHERE id=p_id AND employee_id=p_employee AND workspace_revision=p_revision AND deleted_at IS NULL RETURNING id,workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized('disciplinary',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_disciplinary(),public.f11_mutate_disciplinary(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_mutate_disciplinary(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
