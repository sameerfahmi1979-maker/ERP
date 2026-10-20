BEGIN;
-- F11 confidential child adoption only; no real identity/manager/provider writes.
ALTER TABLE public.employee_performance_records ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_performance_records TO authenticated;
REVOKE DELETE ON public.employee_performance_records FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_performance_revision BEFORE INSERT OR UPDATE ON public.employee_performance_records FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CHECK(kind IN('hr-note','pro-process','hr-action','performance'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close')));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND p_kind IN('hr-note','pro-process','hr-action','performance')AND erp_private.business_principal_is_active()
 AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage'))),false)
$$;

CREATE FUNCTION erp_private.f11_capture_performance()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;expected text;
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'performance'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'
 OR NOT erp_private.f11_child_authorized('performance',NEW.employee_id)THEN RAISE EXCEPTION 'Current confidential operation contract required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor OR NEW.status NOT IN('draft','submitted','cancelled')THEN RAISE EXCEPTION 'Invalid review create' USING ERRCODE='23514';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Opening changed' USING ERRCODE='P0409';END IF;
  IF context->>'action'='archive'THEN
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','deleted_at','deleted_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','deleted_at','deleted_by','updated_at'])THEN RAISE EXCEPTION 'Invalid review archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='update'THEN
   IF OLD.status IN('approved','closed')OR NEW.status NOT IN('draft','submitted','cancelled')OR NEW.updated_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','review_type','review_date','rating','summary','status','updated_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','review_type','review_date','rating','summary','status','updated_by','updated_at'])THEN RAISE EXCEPTION 'Review is immutable or fields are unrecognized' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'IN('submit','approve','close')THEN
   expected:=CASE context->>'action'WHEN'submit'THEN'submitted'WHEN'approve'THEN'approved'ELSE'closed'END;
   IF NEW.status IS DISTINCT FROM expected OR NEW.updated_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','status','updated_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','status','updated_by','updated_at'])
   OR(context->>'action'='submit'AND OLD.status<>'draft')OR(context->>'action'='approve'AND OLD.status<>'submitted')OR(context->>'action'='close'AND OLD.status<>'approved')THEN RAISE EXCEPTION 'Review transition is invalid' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Invalid review operation' USING ERRCODE='22023';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,'performance',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_performance_records',NEW.id,context->>'action',jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_performance_operation AFTER INSERT OR UPDATE ON public.employee_performance_records FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_performance();

CREATE FUNCTION public.f11_mutate_performance(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;v_status text;v_type text;v_rating text;v_date date;
BEGIN
 IF NOT erp_private.f11_child_authorized('performance',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'performance'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','archive','submit','approve','close')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action NOT IN('create','update')AND p_data<>'{}')THEN RAISE EXCEPTION 'Invalid review operation contract' USING ERRCODE='22023';END IF;
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
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['review_type','review_date','rating','summary','status']))
  OR jsonb_typeof(p_data->'review_type')IS DISTINCT FROM 'string'OR jsonb_typeof(p_data->'review_date')IS DISTINCT FROM 'string'OR(p_data->>'review_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR(p_data?'status'AND jsonb_typeof(p_data->'status')IS DISTINCT FROM 'string')OR(p_data?'rating'AND jsonb_typeof(p_data->'rating')NOT IN('string','null'))
  OR(p_data?'summary'AND jsonb_typeof(p_data->'summary')NOT IN('string','null'))OR length(p_data->>'summary')>5000 THEN RAISE EXCEPTION 'Invalid review fields' USING ERRCODE='23514';END IF;
  v_type:=p_data->>'review_type';v_status:=coalesce(p_data->>'status','draft');v_rating:=p_data->>'rating';v_date:=(p_data->>'review_date')::date;
  IF v_type NOT IN('probation','annual','project','incident_followup','other')OR v_status NOT IN('draft','submitted','cancelled')OR(v_rating IS NOT NULL AND v_rating NOT IN('excellent','good','satisfactory','needs_improvement','unsatisfactory'))THEN RAISE EXCEPTION 'Invalid review classification' USING ERRCODE='23514';END IF;
 END IF;
 IF p_action<>'create'THEN
  SELECT id,workspace_revision,status INTO existing FROM public.employee_performance_records WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Review changed after opening' USING ERRCODE='P0409';END IF;
  IF(p_action='update'AND existing.status IN('approved','closed'))OR(p_action='submit'AND existing.status<>'draft')OR(p_action='approve'AND existing.status<>'submitted')OR(p_action='close'AND existing.status<>'approved')THEN RAISE EXCEPTION 'Review transition is invalid' USING ERRCODE='23514';END IF;
 END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_performance_records(employee_id,review_type,review_date,rating,summary,status,created_by,updated_by)
  VALUES(p_employee,v_type,v_date,v_rating,p_data->>'summary',v_status,actor,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSIF p_action='update'THEN
  UPDATE public.employee_performance_records x SET review_type=v_type,review_date=v_date,rating=v_rating,summary=p_data->>'summary',status=v_status,updated_by=actor
  WHERE x.id=p_id AND x.employee_id=p_employee AND x.workspace_revision=p_revision AND x.deleted_at IS NULL RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSIF p_action IN('submit','approve','close')THEN
  UPDATE public.employee_performance_records x SET status=CASE p_action WHEN'submit'THEN'submitted'WHEN'approve'THEN'approved'ELSE'closed'END,updated_by=actor
  WHERE x.id=p_id AND x.employee_id=p_employee AND x.workspace_revision=p_revision AND x.deleted_at IS NULL RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSE
  UPDATE public.employee_performance_records SET deleted_at=clock_timestamp(),deleted_by=actor WHERE id=p_id AND employee_id=p_employee AND workspace_revision=p_revision AND deleted_at IS NULL RETURNING id,workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized('performance',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_performance(),public.f11_mutate_performance(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_mutate_performance(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
