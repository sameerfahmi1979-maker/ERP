BEGIN;
-- Adopt the existing five-field assignment form, not identity or workflow rollout.
ALTER TABLE public.employee_assignments ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_assignments TO authenticated;
REVOKE DELETE ON public.employee_assignments FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_assignment_revision BEFORE INSERT OR UPDATE ON public.employee_assignments FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK(kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval','eos-case','clearance','assignment'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close'))OR(kind='disciplinary'AND action IN('create','update','archive','acknowledge','correct-acknowledgement','close'))OR(kind='approval'AND action IN('create','approve','reject','cancel','archive'))OR(kind='eos-case'AND action IN('create','update','archive','set-status'))OR(kind='clearance'AND action IN('create','update','clear','block','archive'))OR(kind='assignment'AND action IN('create','update','archive')));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()AND CASE WHEN p_kind='assignment'THEN
 erp_private.employee_permission(p_employee,'hr.assignments.view')AND erp_private.employee_permission(p_employee,'hr.assignments.manage')
 WHEN p_kind IN('eos-case','clearance')THEN
 (erp_private.employee_permission(p_employee,'hr.actions.view')OR erp_private.employee_permission(p_employee,'hr.eos.view'))AND(erp_private.employee_permission(p_employee,'hr.actions.manage')OR erp_private.employee_permission(p_employee,'hr.eos.manage'))
 ELSE p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval')AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage')))END,false)
$$;
CREATE FUNCTION erp_private.f11_capture_assignment()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;changed text[];
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'assignment'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'OR NOT erp_private.f11_child_authorized('assignment',NEW.employee_id)THEN RAISE EXCEPTION 'Current original assignment operation required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor
  OR NEW.owner_company_id IS NOT NULL OR NEW.branch_id IS NOT NULL OR NEW.department_id IS NOT NULL OR NEW.designation_id IS NOT NULL OR NEW.work_site_id IS NOT NULL OR NEW.reporting_manager_id IS NOT NULL OR NEW.supervisor_id IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN RAISE EXCEPTION 'Unrendered assignment mappings cannot be created' USING ERRCODE='23514';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Assignment opening changed' USING ERRCODE='P0409';END IF;
  IF NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Current actor required' USING ERRCODE='23514';END IF;
  IF context->>'action'='archive'THEN
   changed:=ARRAY['workspace_revision','deleted_at','deleted_by','updated_by','updated_at'];
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid assignment archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='update'THEN changed:=ARRAY['workspace_revision','assignment_type','assignment_status','effective_from','effective_to','notes','updated_by','updated_at'];
  ELSE RAISE EXCEPTION 'Invalid assignment action' USING ERRCODE='22023';END IF;
  IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Unrecognized assignment mapping changes' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,'assignment',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_assignments',NEW.id,context->>'action',jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision,'assignment_type',NEW.assignment_type,'assignment_status',NEW.assignment_status));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_assignment_operation AFTER INSERT OR UPDATE ON public.employee_assignments FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_assignment();
CREATE FUNCTION public.f11_mutate_assignment(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;v_type text;v_status text;v_from date;v_to date;
BEGIN
 IF NOT erp_private.f11_child_authorized('assignment',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'assignment'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','archive')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action='archive'AND p_data<>'{}')THEN RAISE EXCEPTION 'Invalid assignment operation contract' USING ERRCODE='22023';END IF;
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
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['assignment_type','assignment_status','effective_from','effective_to','notes']))
  OR(p_data?'assignment_type'AND jsonb_typeof(p_data->'assignment_type')IS DISTINCT FROM 'string')OR(p_data?'assignment_status'AND jsonb_typeof(p_data->'assignment_status')IS DISTINCT FROM 'string')
  OR jsonb_typeof(p_data->'effective_from')IS DISTINCT FROM 'string'OR(p_data->>'effective_from')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR(p_data?'effective_to'AND jsonb_typeof(p_data->'effective_to')NOT IN('string','null'))OR(p_data->>'effective_to')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR(p_data?'notes'AND jsonb_typeof(p_data->'notes')NOT IN('string','null'))OR length(p_data->>'notes')>2000 THEN RAISE EXCEPTION 'Invalid visible assignment fields' USING ERRCODE='23514';END IF;
  v_type:=coalesce(p_data->>'assignment_type','primary');v_status:=coalesce(p_data->>'assignment_status','active');
  IF v_type NOT IN('primary','temporary','project','site','department','relief')OR v_status NOT IN('active','planned','completed','cancelled')THEN RAISE EXCEPTION 'Invalid assignment classification' USING ERRCODE='23514';END IF;
  v_from:=(p_data->>'effective_from')::date;v_to:=(p_data->>'effective_to')::date;
  IF v_to<v_from THEN RAISE EXCEPTION 'Assignment dates are reversed' USING ERRCODE='23514';END IF;
 END IF;
 IF p_action<>'create'THEN
  SELECT * INTO existing FROM public.employee_assignments WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original assignment unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Assignment changed after opening' USING ERRCODE='P0409';END IF;
 END IF;
 IF NOT erp_private.f11_child_authorized('assignment',p_employee)THEN RAISE EXCEPTION 'Current assignment access changed' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_assignments(employee_id,assignment_type,assignment_status,effective_from,effective_to,notes,created_by,updated_by)
  VALUES(p_employee,v_type,v_status,v_from,v_to,p_data->>'notes',actor,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSIF p_action='update'THEN
  UPDATE public.employee_assignments x SET assignment_type=v_type,assignment_status=v_status,effective_from=v_from,effective_to=v_to,notes=p_data->>'notes',updated_by=actor
  WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSE UPDATE public.employee_assignments x SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized('assignment',p_employee)THEN RAISE EXCEPTION 'Current assignment access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_assignment(),public.f11_mutate_assignment(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_mutate_assignment(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
