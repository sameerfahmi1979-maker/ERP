BEGIN;
-- F11 EOS process-shell adoption only. No financial certification or employment change.
ALTER TABLE public.employee_eos_cases ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_eos_cases TO authenticated;
REVOKE DELETE ON public.employee_eos_cases FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_eos_case_revision BEFORE INSERT OR UPDATE ON public.employee_eos_cases FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK(kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval','eos-case'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close'))OR(kind='disciplinary'AND action IN('create','update','archive','acknowledge','correct-acknowledgement','close'))OR(kind='approval'AND action IN('create','approve','reject','cancel','archive'))OR(kind='eos-case'AND action IN('create','update','archive','set-status')));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()AND CASE WHEN p_kind='eos-case'THEN
 (erp_private.employee_permission(p_employee,'hr.actions.view')OR erp_private.employee_permission(p_employee,'hr.eos.view'))AND(erp_private.employee_permission(p_employee,'hr.actions.manage')OR erp_private.employee_permission(p_employee,'hr.eos.manage'))
 ELSE p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval')AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage')))END,false)
$$;

CREATE FUNCTION erp_private.f11_capture_eos_case()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;changed text[];
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'eos-case'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'
 OR NOT erp_private.f11_child_authorized('eos-case',NEW.employee_id)THEN RAISE EXCEPTION 'Current scoped operation contract required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor OR NEW.final_settlement_status<>'not_started'OR NEW.clearance_completed OR NEW.dms_document_id IS NOT NULL OR NEW.notes IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN RAISE EXCEPTION 'Invalid EOS creation fields' USING ERRCODE='23514';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Opening changed' USING ERRCODE='P0409';END IF;
  IF NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Current actor is required' USING ERRCODE='23514';END IF;
  IF context->>'action'='archive'THEN
   changed:=ARRAY['workspace_revision','deleted_at','deleted_by','updated_by','updated_at'];
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'IN('update','set-status')THEN
   IF OLD.case_status='closed'THEN RAISE EXCEPTION 'Closed EOS cases cannot be edited' USING ERRCODE='23514';END IF;
   changed:=CASE context->>'action'WHEN'update'THEN ARRAY['workspace_revision','eos_type','case_status','notice_date','last_working_date','reason','updated_by','updated_at']ELSE ARRAY['workspace_revision','case_status','notes','updated_by','updated_at']END;
  ELSE RAISE EXCEPTION 'Invalid case operation' USING ERRCODE='22023';END IF;
  IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Unrecognized case changes' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,'eos-case',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_eos_cases',NEW.id,context->>'action',jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_eos_case_operation AFTER INSERT OR UPDATE ON public.employee_eos_cases FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_eos_case();

CREATE FUNCTION public.f11_mutate_eos_case(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;v_type text;v_status text;notice date;last_day date;
BEGIN
 IF NOT erp_private.f11_child_authorized('eos-case',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'eos-case'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','archive','set-status')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action='archive'AND p_data<>'{}')THEN RAISE EXCEPTION 'Invalid case operation contract' USING ERRCODE='22023';END IF;
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
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['eos_type','case_status','notice_date','last_working_date','reason']))OR jsonb_typeof(p_data->'eos_type')IS DISTINCT FROM 'string'
  OR(p_data?'case_status'AND jsonb_typeof(p_data->'case_status')IS DISTINCT FROM 'string')OR(p_data?'reason'AND jsonb_typeof(p_data->'reason')NOT IN('string','null'))OR length(p_data->>'reason')>5000
  OR(p_data?'notice_date'AND jsonb_typeof(p_data->'notice_date')NOT IN('string','null'))OR(p_data?'last_working_date'AND jsonb_typeof(p_data->'last_working_date')NOT IN('string','null'))
  OR(p_data->>'notice_date'IS NOT NULL AND(p_data->>'notice_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$')OR(p_data->>'last_working_date'IS NOT NULL AND(p_data->>'last_working_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$')THEN RAISE EXCEPTION 'Invalid case fields' USING ERRCODE='23514';END IF;
  v_type:=p_data->>'eos_type';v_status:=coalesce(p_data->>'case_status','draft');notice:=(p_data->>'notice_date')::date;last_day:=(p_data->>'last_working_date')::date;
  IF v_type NOT IN('resignation','termination','contract_end','absconding','death','other')THEN RAISE EXCEPTION 'Invalid EOS type' USING ERRCODE='23514';END IF;
 ELSIF p_action='set-status'THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['case_status','notes']))OR jsonb_typeof(p_data->'case_status')IS DISTINCT FROM 'string'OR(p_data?'notes'AND jsonb_typeof(p_data->'notes')IS DISTINCT FROM 'string')OR length(p_data->>'notes')>5000 THEN RAISE EXCEPTION 'Invalid status fields' USING ERRCODE='23514';END IF;
  v_status:=p_data->>'case_status';
 END IF;
 IF p_action<>'archive'AND v_status NOT IN('draft','notice_served','clearance_in_progress','pending_final_settlement','closed','cancelled')THEN RAISE EXCEPTION 'Invalid case status' USING ERRCODE='23514';END IF;
 IF p_action<>'create'THEN
  SELECT id,workspace_revision,case_status INTO existing FROM public.employee_eos_cases WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Case changed after opening' USING ERRCODE='P0409';END IF;
  IF p_action<>'archive'AND existing.case_status='closed'THEN RAISE EXCEPTION 'Closed EOS cases cannot be edited' USING ERRCODE='23514';END IF;
 END IF;
 IF NOT erp_private.f11_child_authorized('eos-case',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_eos_cases(employee_id,eos_type,case_status,notice_date,last_working_date,reason,created_by,updated_by)
  VALUES(p_employee,v_type,v_status,notice,last_day,p_data->>'reason',actor,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSIF p_action='update'THEN
  UPDATE public.employee_eos_cases x SET eos_type=v_type,case_status=v_status,notice_date=notice,last_working_date=last_day,reason=p_data->>'reason',updated_by=actor
  WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSIF p_action='set-status'THEN
  UPDATE public.employee_eos_cases x SET case_status=v_status,notes=CASE WHEN p_data?'notes'THEN p_data->>'notes'ELSE x.notes END,updated_by=actor
  WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSE
  UPDATE public.employee_eos_cases x SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized('eos-case',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_eos_case(),public.f11_mutate_eos_case(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_mutate_eos_case(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
