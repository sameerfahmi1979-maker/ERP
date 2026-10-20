BEGIN;
-- F11 child adoption only. No identity mapping, worker, provider or shared-app changes.
ALTER TABLE public.employee_hr_actions ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_hr_actions TO authenticated;
REVOKE DELETE ON public.employee_hr_actions FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_hr_action_revision BEFORE INSERT OR UPDATE ON public.employee_hr_actions FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CHECK(kind IN('hr-note','pro-process','hr-action'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel')));

CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND p_kind IN('hr-note','pro-process','hr-action')AND erp_private.business_principal_is_active()
 AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind<>'hr-note'OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage'))),false)
$$;
CREATE FUNCTION erp_private.f11_capture_hr_action()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'hr-action'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'
 OR NOT erp_private.f11_child_authorized('hr-action',NEW.employee_id)THEN RAISE EXCEPTION 'A current scoped operation contract is required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid create actor or contract' USING ERRCODE='42501';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Opening changed' USING ERRCODE='P0409';END IF;
  IF context->>'action'='archive'THEN
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','deleted_at','deleted_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','deleted_at','deleted_by','updated_at'])THEN RAISE EXCEPTION 'Invalid archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='update'THEN
   IF NEW.updated_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','action_title','action_status','action_type','action_date','due_date','notes','updated_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','action_title','action_status','action_type','action_date','due_date','notes','updated_by','updated_at'])THEN RAISE EXCEPTION 'Unrecognized action changes' USING ERRCODE='23514';END IF;
  ELSIF context->>'action' IN('close','cancel')THEN
   IF NEW.action_status IS DISTINCT FROM(CASE WHEN context->>'action'='close'THEN 'closed'ELSE 'cancelled'END)OR NEW.updated_by IS DISTINCT FROM actor OR(to_jsonb(NEW)-ARRAY['workspace_revision','action_status','notes','updated_by','updated_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['workspace_revision','action_status','notes','updated_by','updated_at'])THEN RAISE EXCEPTION 'Invalid status operation' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,'hr-action',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_hr_actions',NEW.id,context->>'action',jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision,'status',NEW.action_status));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_hr_action_operation AFTER INSERT OR UPDATE ON public.employee_hr_actions FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_hr_action();

CREATE FUNCTION public.f11_mutate_hr_action(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;status text;v_action_type text;v_action_date date;v_due_date date;
BEGIN
 IF NOT erp_private.f11_child_authorized('hr-action',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'hr-action'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','archive','close','cancel')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action='archive'AND p_data<>'{}')THEN RAISE EXCEPTION 'Invalid action operation contract' USING ERRCODE='22023';END IF;
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
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['action_title','action_status','action_type','action_date','due_date','notes']))
  OR jsonb_typeof(p_data->'action_title')IS DISTINCT FROM 'string'OR nullif(btrim(p_data->>'action_title'),'')IS NULL OR length(p_data->>'action_title')>500
  OR(p_data?'action_status'AND jsonb_typeof(p_data->'action_status')IS DISTINCT FROM 'string')OR(p_data?'action_type'AND jsonb_typeof(p_data->'action_type')IS DISTINCT FROM 'string')
  OR jsonb_typeof(p_data->'action_date')IS DISTINCT FROM 'string'OR(p_data->>'action_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR(p_data?'due_date'AND jsonb_typeof(p_data->'due_date')NOT IN('string','null'))OR(p_data->>'due_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR(p_data?'notes'AND jsonb_typeof(p_data->'notes')NOT IN('string','null'))OR length(p_data->>'notes')>5000
  THEN RAISE EXCEPTION 'Invalid action fields' USING ERRCODE='23514';END IF;
  status:=coalesce(p_data->>'action_status','open');v_action_type:=coalesce(p_data->>'action_type','general');
  IF status NOT IN('open','in_progress','closed','cancelled')OR v_action_type NOT IN('general','probation_review','transfer','promotion','increment_recommendation','status_change','warning','memo','other')THEN RAISE EXCEPTION 'Invalid classification' USING ERRCODE='23514';END IF;
  v_action_date:=(p_data->>'action_date')::date;v_due_date:=(p_data->>'due_date')::date;
 ELSIF p_action IN('close','cancel')THEN
  IF p_action='close'AND(EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>'notes')OR(p_data?'notes'AND jsonb_typeof(p_data->'notes')IS DISTINCT FROM 'string')OR length(p_data->>'notes')>5000)
  OR p_action='cancel'AND(EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>'reason')OR jsonb_typeof(p_data->'reason')IS DISTINCT FROM 'string'OR nullif(btrim(p_data->>'reason'),'')IS NULL OR length(p_data->>'reason')>5000)
  THEN RAISE EXCEPTION 'Invalid status fields' USING ERRCODE='23514';END IF;
 END IF;
 IF p_action<>'create'THEN
  SELECT id,workspace_revision,action_status INTO existing FROM public.employee_hr_actions WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Action changed after opening' USING ERRCODE='P0409';END IF;
  IF p_action IN('close','cancel')AND existing.action_status NOT IN('open','in_progress')THEN RAISE EXCEPTION 'Action is already closed or cancelled' USING ERRCODE='23514';END IF;
 END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_hr_actions(employee_id,action_title,action_type,action_status,action_date,due_date,notes,created_by,updated_by)
  VALUES(p_employee,btrim(p_data->>'action_title'),v_action_type,status,v_action_date,v_due_date,p_data->>'notes',actor,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSIF p_action='update'THEN
  UPDATE public.employee_hr_actions x SET action_title=btrim(p_data->>'action_title'),action_type=v_action_type,action_status=status,action_date=v_action_date,due_date=v_due_date,notes=p_data->>'notes',updated_by=actor
  WHERE x.id=p_id AND x.employee_id=p_employee AND x.workspace_revision=p_revision AND x.deleted_at IS NULL RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSIF p_action IN('close','cancel')THEN
  UPDATE public.employee_hr_actions x SET action_status=CASE WHEN p_action='close'THEN 'closed'ELSE 'cancelled'END,
   notes=CASE WHEN p_action='cancel'THEN btrim(p_data->>'reason')WHEN nullif(p_data->>'notes','')IS NOT NULL THEN p_data->>'notes'ELSE x.notes END,updated_by=actor
  WHERE x.id=p_id AND x.employee_id=p_employee AND x.workspace_revision=p_revision AND x.deleted_at IS NULL RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSE
  UPDATE public.employee_hr_actions SET deleted_at=clock_timestamp(),deleted_by=actor WHERE id=p_id AND employee_id=p_employee AND workspace_revision=p_revision AND deleted_at IS NULL RETURNING id,workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized('hr-action',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_child_authorized(text,bigint),erp_private.f11_capture_hr_action(),public.f11_mutate_hr_action(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_child_authorized(text,bigint),public.f11_mutate_hr_action(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
