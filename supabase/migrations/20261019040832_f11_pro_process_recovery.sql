BEGIN;
-- F11 child adoption only. No identity mapping, worker, provider or shared-app changes.
ALTER TABLE public.employee_pro_processes ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_pro_processes TO authenticated;
REVOKE DELETE ON public.employee_pro_processes FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_pro_revision BEFORE INSERT OR UPDATE ON public.employee_pro_processes FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CHECK(kind IN('hr-note','pro-process'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_action_check;
ALTER TABLE erp_private.f11_child_receipts ADD CHECK(action IN('create','update','archive')AND(kind<>'hr-note'OR action<>'update'));

CREATE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND p_kind IN('hr-note','pro-process')AND erp_private.business_principal_is_active()
 AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind<>'hr-note'OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage'))),false)
$$;
CREATE OR REPLACE FUNCTION erp_private.f11_child_receipt(p_operation uuid)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('kind',r.kind,'employee_id',r.employee_id,'id',r.record_id,'revision',r.revision::text,'operation_id',r.operation_id,'hash',r.request_hash)
 FROM erp_private.f11_child_receipts r JOIN public.employees e ON e.id=r.employee_id AND e.deleted_at IS NULL
 WHERE r.actor=(SELECT auth.uid())AND r.operation_id=p_operation AND erp_private.f11_child_authorized(r.kind,r.employee_id)
$$;
CREATE OR REPLACE FUNCTION erp_private.f11_recent_child_receipts(p_before timestamptz,p_before_operation uuid,p_limit integer)RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid()IS NULL OR NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR(p_before IS NULL)<>(p_before_operation IS NULL)THEN RAISE EXCEPTION 'Invalid recovery cursor' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT jsonb_build_object('kind',r.kind,'action',r.action,'employee_id',r.employee_id,'id',r.record_id,'revision',r.revision::text,'operation_id',r.operation_id,'created_at',r.created_at,'replayed',true)
 FROM erp_private.f11_child_receipts r JOIN public.employees e ON e.id=r.employee_id AND e.deleted_at IS NULL
 WHERE r.actor=(SELECT auth.uid())AND(p_before IS NULL OR(r.created_at,r.operation_id)<(p_before,p_before_operation))AND erp_private.f11_child_authorized(r.kind,r.employee_id)
 ORDER BY r.created_at DESC,r.operation_id DESC LIMIT p_limit;
END $$;

CREATE FUNCTION erp_private.f11_capture_pro_process()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'pro-process'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'
 OR NOT erp_private.f11_child_authorized('pro-process',NEW.employee_id)THEN RAISE EXCEPTION 'A current scoped operation contract is required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid create actor or contract' USING ERRCODE='42501';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Opening changed' USING ERRCODE='P0409';END IF;
  IF context->>'action'='archive'THEN
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','deleted_at','deleted_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','deleted_at','deleted_by','updated_at'])THEN RAISE EXCEPTION 'Invalid archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='update'THEN
   IF NEW.updated_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','process_title','process_status','priority','request_date','target_date','notes','submitted_date','completed_date','updated_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','process_title','process_status','priority','request_date','target_date','notes','submitted_date','completed_date','updated_by','updated_at'])THEN RAISE EXCEPTION 'Unrecognized process changes' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,'pro-process',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_pro_processes',NEW.id,context->>'action',jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision,'status',NEW.process_status));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_pro_operation AFTER INSERT OR UPDATE ON public.employee_pro_processes FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_pro_process();

CREATE FUNCTION public.f11_mutate_pro_process(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;status text;v_priority text;v_request_date date;v_target_date date;
BEGIN
 IF NOT erp_private.f11_child_authorized('pro-process',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'pro-process'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','archive')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action='archive'AND p_data<>'{}')THEN RAISE EXCEPTION 'Invalid process operation contract' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 IF p_action<>'archive'THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['process_title','process_status','priority','request_date','target_date','notes']))
  OR jsonb_typeof(p_data->'process_title')IS DISTINCT FROM 'string'OR nullif(btrim(p_data->>'process_title'),'')IS NULL OR length(p_data->>'process_title')>500
  OR(p_data?'process_status'AND jsonb_typeof(p_data->'process_status')IS DISTINCT FROM 'string')OR(p_data?'priority'AND jsonb_typeof(p_data->'priority')IS DISTINCT FROM 'string')
  OR jsonb_typeof(p_data->'request_date')IS DISTINCT FROM 'string'OR(p_data->>'request_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR(p_data?'target_date'AND jsonb_typeof(p_data->'target_date')NOT IN('string','null'))OR(p_data->>'target_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR(p_data?'notes'AND jsonb_typeof(p_data->'notes')NOT IN('string','null'))OR length(p_data->>'notes')>5000
  THEN RAISE EXCEPTION 'Invalid process fields' USING ERRCODE='23514';END IF;
  status:=coalesce(p_data->>'process_status','draft');v_priority:=coalesce(p_data->>'priority','normal');
  IF status NOT IN('draft','requested','in_progress','waiting_for_document','submitted','approved','rejected','cancelled','completed')OR v_priority NOT IN('low','normal','high','urgent')THEN RAISE EXCEPTION 'Invalid classification' USING ERRCODE='23514';END IF;
  v_request_date:=(p_data->>'request_date')::date;v_target_date:=(p_data->>'target_date')::date;
 END IF;
 IF p_action<>'create'THEN
  SELECT id,workspace_revision,process_status INTO existing FROM public.employee_pro_processes WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Process unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Process changed after opening' USING ERRCODE='P0409';END IF;
 END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_pro_processes(employee_id,process_title,process_status,priority,request_date,target_date,notes,submitted_date,completed_date,created_by,updated_by)
  VALUES(p_employee,btrim(p_data->>'process_title'),status,v_priority,v_request_date,v_target_date,p_data->>'notes',CASE WHEN status='submitted'THEN current_date END,CASE WHEN status='completed'THEN current_date END,actor,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSIF p_action='update'THEN
  UPDATE public.employee_pro_processes x SET process_title=btrim(p_data->>'process_title'),process_status=status,priority=v_priority,request_date=v_request_date,target_date=v_target_date,notes=p_data->>'notes',
   submitted_date=CASE WHEN status='submitted'AND x.process_status<>'submitted'THEN current_date ELSE x.submitted_date END,completed_date=CASE WHEN status='completed'AND x.process_status<>'completed'THEN current_date ELSE x.completed_date END,updated_by=actor
  WHERE x.id=p_id AND x.employee_id=p_employee AND x.workspace_revision=p_revision AND x.deleted_at IS NULL RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSE
  UPDATE public.employee_pro_processes SET deleted_at=clock_timestamp(),deleted_by=actor WHERE id=p_id AND employee_id=p_employee AND workspace_revision=p_revision AND deleted_at IS NULL RETURNING id,workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized('pro-process',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_child_authorized(text,bigint),erp_private.f11_capture_pro_process(),public.f11_mutate_pro_process(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_child_authorized(text,bigint),public.f11_mutate_pro_process(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
