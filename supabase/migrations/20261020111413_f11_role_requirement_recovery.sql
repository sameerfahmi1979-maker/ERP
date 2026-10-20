BEGIN;
-- Existing requirement editors and their deterministic refresh. No new readiness/evidence policy.
ALTER TABLE public.employee_role_requirements ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_role_requirements TO authenticated;
REVOKE DELETE ON public.employee_role_requirements FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_role_requirement_revision BEFORE INSERT OR UPDATE ON public.employee_role_requirements FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK(kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval','eos-case','clearance','assignment','asset','ppe','accommodation','operational-block','role-requirement','requirements-refresh'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close'))OR(kind='disciplinary'AND action IN('create','update','archive','acknowledge','correct-acknowledgement','close'))OR(kind='approval'AND action IN('create','approve','reject','cancel','archive'))OR(kind='eos-case'AND action IN('create','update','archive','set-status'))OR(kind='clearance'AND action IN('create','update','clear','block','archive'))OR(kind='assignment'AND action IN('create','update','archive'))OR(kind IN('asset','ppe')AND action IN('create','update','archive','return'))OR(kind='accommodation'AND action IN('create','update','archive','end'))OR(kind='operational-block'AND action IN('create','release','archive'))OR(kind='role-requirement'AND action IN('create','update','waive','archive'))OR(kind='requirements-refresh'AND action='create'));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()AND CASE WHEN p_kind IN('assignment','asset','ppe','accommodation','operational-block','role-requirement','requirements-refresh')THEN
 erp_private.employee_permission(p_employee,'hr.assignments.view')AND erp_private.employee_permission(p_employee,'hr.assignments.manage')
 WHEN p_kind IN('eos-case','clearance')THEN
 (erp_private.employee_permission(p_employee,'hr.actions.view')OR erp_private.employee_permission(p_employee,'hr.eos.view'))AND(erp_private.employee_permission(p_employee,'hr.actions.manage')OR erp_private.employee_permission(p_employee,'hr.eos.manage'))
 ELSE p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval')AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage')))END,false)
$$;
CREATE FUNCTION public.f11_requirement_refresh_fingerprint(p_employee bigint)RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result text;
BEGIN
 IF p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR NOT erp_private.f11_child_authorized('requirements-refresh',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 SELECT encode(sha256(convert_to(jsonb_build_array((current_timestamp AT TIME ZONE 'UTC')::date,coalesce(jsonb_agg(jsonb_build_array(r.id,r.workspace_revision)ORDER BY r.id),'[]'::jsonb))::text,'UTF8')),'hex')INTO result
 FROM public.employee_role_requirements r WHERE r.employee_id=p_employee AND r.deleted_at IS NULL;
 RETURN result;
END $$;
CREATE TABLE erp_private.f11_requirement_refresh_runs(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint NOT NULL REFERENCES public.employees(id),actor uuid NOT NULL,operation_id uuid NOT NULL,
 workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision=1),source_fingerprint text NOT NULL CHECK(source_fingerprint~'^[0-9a-f]{64}$'),changed_count integer NOT NULL CHECK(changed_count>=0),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(actor,operation_id)
);
ALTER TABLE erp_private.f11_requirement_refresh_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY f11_requirement_refresh_runs_actor ON erp_private.f11_requirement_refresh_runs FOR SELECT TO authenticated USING(actor=(SELECT auth.uid())AND erp_private.f11_child_authorized('requirements-refresh',employee_id));
CREATE POLICY f11_requirement_refresh_runs_insert ON erp_private.f11_requirement_refresh_runs FOR INSERT TO authenticated WITH CHECK(actor=(SELECT auth.uid())AND erp_private.f11_child_authorized('requirements-refresh',employee_id));
REVOKE ALL ON erp_private.f11_requirement_refresh_runs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(id,employee_id,actor,operation_id,workspace_revision,source_fingerprint,changed_count,created_at),INSERT(employee_id,actor,operation_id,source_fingerprint,changed_count)ON erp_private.f11_requirement_refresh_runs TO authenticated;
GRANT USAGE ON SEQUENCE erp_private.f11_requirement_refresh_runs_id_seq TO authenticated;
CREATE FUNCTION erp_private.f11_capture_requirement_refresh()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;subject record;actor_id bigint;
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'requirements-refresh'OR context->>'action'IS DISTINCT FROM 'create'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR(context->>'operation_id')::uuid IS DISTINCT FROM NEW.operation_id OR(context->>'changed_count')::integer IS DISTINCT FROM NEW.changed_count OR context->>'fingerprint'IS DISTINCT FROM NEW.source_fingerprint
 OR NEW.actor IS DISTINCT FROM auth.uid()OR NEW.workspace_revision<>1 OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'OR NOT erp_private.f11_child_authorized('requirements-refresh',NEW.employee_id)THEN RAISE EXCEPTION 'Current original requirements refresh contract required' USING ERRCODE='42501';END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;actor_id:=public.current_user_profile_id();
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),NEW.operation_id,'requirements-refresh','create',NEW.employee_id,NEW.id,1,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor_id,subject.owner_company_id,subject.branch_id,'HR','employee_role_requirement_refresh_runs',NEW.id,'requirements_refreshed',jsonb_build_object('operation_id',NEW.operation_id,'employee_id',NEW.employee_id,'changed_count',NEW.changed_count));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_requirement_refresh_capture AFTER INSERT ON erp_private.f11_requirement_refresh_runs FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_requirement_refresh();
CREATE FUNCTION erp_private.f11_capture_role_requirement()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;changed text[];computed_status text;
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS NULL OR context->>'kind'NOT IN('role-requirement','requirements-refresh')OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'OR NOT erp_private.f11_child_authorized(context->>'kind',NEW.employee_id)THEN RAISE EXCEPTION 'Current original requirement contract required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF context->>'kind'='requirements-refresh'THEN
  IF TG_OP<>'UPDATE'OR OLD.deleted_at IS NOT NULL OR NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid requirement refresh' USING ERRCODE='23514';END IF;
  computed_status:=CASE WHEN OLD.status='waived'THEN OLD.status WHEN OLD.expiry_date<(current_timestamp AT TIME ZONE 'UTC')::date THEN'expired'WHEN OLD.is_met THEN'met'ELSE OLD.status END;
  changed:=ARRAY['workspace_revision','status','updated_by','updated_at'];
  IF NEW.status IS DISTINCT FROM computed_status OR(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Refresh cannot replace evidence or exception facts' USING ERRCODE='23514';END IF;
 ELSIF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor OR NEW.designation_id IS NOT NULL OR NEW.requirement_source IS NOT NULL OR NEW.required_reference_id IS NOT NULL
  OR NEW.met_record_type IS NOT NULL OR NEW.met_record_id IS NOT NULL OR NEW.is_met IS DISTINCT FROM false OR NEW.status='waived'OR NEW.waived_by IS NOT NULL OR NEW.waived_at IS NOT NULL OR NEW.waiver_reason IS NOT NULL OR NEW.notes IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN RAISE EXCEPTION 'Unrendered requirement facts cannot be created' USING ERRCODE='23514';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Original requirement changed' USING ERRCODE='P0409';END IF;
  IF NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Current actor required' USING ERRCODE='23514';END IF;
  IF context->>'action'='archive'THEN
   changed:=ARRAY['workspace_revision','deleted_at','deleted_by','updated_by','updated_at'];IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid requirement archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='waive'THEN
   changed:=ARRAY['workspace_revision','status','is_met','waived_by','waived_at','waiver_reason','updated_by','updated_at'];
   IF OLD.status='waived'OR NEW.status IS DISTINCT FROM 'waived'OR NEW.is_met IS DISTINCT FROM true OR NEW.waived_by IS DISTINCT FROM actor OR NEW.waived_at IS NULL OR NEW.waiver_reason IS NULL THEN RAISE EXCEPTION 'Invalid requirement waiver' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='update'THEN
   changed:=ARRAY['workspace_revision','requirement_name','requirement_type','status','expiry_date','is_required','updated_by','updated_at'];
   IF NEW.status='waived'AND OLD.status<>'waived'THEN RAISE EXCEPTION 'A new waiver requires its reviewed reason' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Unsupported requirement action' USING ERRCODE='22023';END IF;
  IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Unrecognized evidence or requirement changes' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 IF context->>'kind'='role-requirement'THEN
  INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
  VALUES(auth.uid(),(context->>'operation_id')::uuid,'role-requirement',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_role_requirements',NEW.id,CASE WHEN context->>'kind'='requirements-refresh'THEN'recalculated'ELSE context->>'action'END,jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision,'status',NEW.status,'is_required',NEW.is_required));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_role_requirement_capture AFTER INSERT OR UPDATE ON public.employee_role_requirements FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_role_requirement();
CREATE FUNCTION public.f11_mutate_role_requirement(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;v_type text;v_status text;v_expiry date;reason text;changed integer;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('role-requirement','requirements-refresh')OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','waive','archive')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action='archive'AND p_data<>'{}')OR(p_kind='requirements-refresh'AND p_action<>'create')THEN RAISE EXCEPTION 'Invalid requirement operation contract' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 IF NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current requirement access changed' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF p_kind='requirements-refresh'THEN
  IF NOT p_data?'fingerprint'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>'fingerprint')OR jsonb_typeof(p_data->'fingerprint')IS DISTINCT FROM 'string'OR(p_data->>'fingerprint')!~'^[0-9a-f]{64}$'THEN RAISE EXCEPTION 'Invalid complete requirement set fingerprint' USING ERRCODE='22023';END IF;
  PERFORM 1 FROM public.employee_role_requirements r WHERE r.employee_id=p_employee AND r.deleted_at IS NULL ORDER BY r.id FOR UPDATE;
  IF public.f11_requirement_refresh_fingerprint(p_employee)IS DISTINCT FROM p_data->>'fingerprint'THEN RAISE EXCEPTION 'Requirement set changed after opening' USING ERRCODE='P0409';END IF;
  PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'operation_id',p_operation,'action',p_action,'hash',digest,'fingerprint',p_data->>'fingerprint')::text,true);
  UPDATE public.employee_role_requirements r SET status=CASE WHEN r.expiry_date<(current_timestamp AT TIME ZONE 'UTC')::date THEN'expired'WHEN r.is_met THEN'met'ELSE r.status END,updated_by=actor
  WHERE r.employee_id=p_employee AND r.deleted_at IS NULL AND r.status<>'waived'AND r.status IS DISTINCT FROM(CASE WHEN r.expiry_date<(current_timestamp AT TIME ZONE 'UTC')::date THEN'expired'WHEN r.is_met THEN'met'ELSE r.status END);
  GET DIAGNOSTICS changed=ROW_COUNT;
  PERFORM set_config('erp.f11_child_save',(current_setting('erp.f11_child_save')::jsonb||jsonb_build_object('changed_count',changed))::text,true);
  INSERT INTO erp_private.f11_requirement_refresh_runs(employee_id,actor,operation_id,source_fingerprint,changed_count)VALUES(p_employee,auth.uid(),p_operation,p_data->>'fingerprint',changed)RETURNING id,workspace_revision INTO target,revision;
 ELSE
  IF p_action IN('create','update')THEN
   IF NOT p_data?&ARRAY['requirement_name','requirement_type','status','expiry_date','is_required']OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['requirement_name','requirement_type','status','expiry_date','is_required']))
   OR jsonb_typeof(p_data->'requirement_name')IS DISTINCT FROM 'string'OR length(p_data->>'requirement_name')>500 OR btrim(translate(p_data->>'requirement_name',chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(8195)||chr(12288),'        '))=''
   OR jsonb_typeof(p_data->'requirement_type')IS DISTINCT FROM 'string'OR(p_data->>'requirement_type')NOT IN('document','training','medical','access_card','license','other')
   OR jsonb_typeof(p_data->'status')IS DISTINCT FROM 'string'OR(p_data->>'status')NOT IN('met','missing','expired','expiring_soon','waived','not_required')
   OR jsonb_typeof(p_data->'expiry_date')NOT IN('string','null')OR(p_data->>'expiry_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR jsonb_typeof(p_data->'is_required')IS DISTINCT FROM 'boolean'THEN RAISE EXCEPTION 'Invalid visible requirement fields' USING ERRCODE='23514';END IF;
   v_type:=p_data->>'requirement_type';v_status:=p_data->>'status';v_expiry:=(p_data->>'expiry_date')::date;
   IF p_action='create'AND v_status='waived'THEN RAISE EXCEPTION 'Create first, then waive with a reason' USING ERRCODE='23514';END IF;
  ELSIF p_action='waive'THEN
   IF NOT p_data?'waiver_reason'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>'waiver_reason')OR jsonb_typeof(p_data->'waiver_reason')IS DISTINCT FROM 'string'OR length(p_data->>'waiver_reason')>2000 OR btrim(translate(p_data->>'waiver_reason',chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(8195)||chr(12288),'        '))=''THEN RAISE EXCEPTION 'A reviewed waiver reason is required' USING ERRCODE='23514';END IF;
   reason:=p_data->>'waiver_reason';
  END IF;
  IF p_action<>'create'THEN
   SELECT * INTO existing FROM public.employee_role_requirements WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Original requirement unavailable' USING ERRCODE='42501';END IF;
   IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Requirement changed after opening' USING ERRCODE='P0409';END IF;
   IF(p_action='waive'AND existing.status='waived')OR(p_action='update'AND v_status='waived'AND existing.status<>'waived')THEN RAISE EXCEPTION 'Invalid waiver transition' USING ERRCODE='23514';END IF;
  END IF;
  IF NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current requirement access changed' USING ERRCODE='42501';END IF;
  PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
  IF p_action='create'THEN
   INSERT INTO public.employee_role_requirements(employee_id,requirement_name,requirement_type,status,expiry_date,is_required,created_by,updated_by)VALUES(p_employee,btrim(p_data->>'requirement_name'),v_type,v_status,v_expiry,(p_data->>'is_required')::boolean,actor,actor)RETURNING id,workspace_revision INTO target,revision;
  ELSIF p_action='update'THEN
   UPDATE public.employee_role_requirements r SET requirement_name=btrim(p_data->>'requirement_name'),requirement_type=v_type,status=v_status,expiry_date=v_expiry,is_required=(p_data->>'is_required')::boolean,updated_by=actor WHERE r.id=p_id AND r.workspace_revision=p_revision RETURNING r.id,r.workspace_revision INTO target,revision;
  ELSIF p_action='waive'THEN
   UPDATE public.employee_role_requirements r SET status='waived',is_met=true,waived_by=actor,waived_at=clock_timestamp(),waiver_reason=btrim(reason),updated_by=actor WHERE r.id=p_id AND r.workspace_revision=p_revision RETURNING r.id,r.workspace_revision INTO target,revision;
  ELSE UPDATE public.employee_role_requirements r SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE r.id=p_id AND r.workspace_revision=p_revision RETURNING r.id,r.workspace_revision INTO target,revision;
  END IF;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current requirement access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.f11_requirement_refresh_fingerprint(bigint),public.f11_mutate_role_requirement(text,bigint,bigint,bigint,uuid,text,jsonb),erp_private.f11_capture_role_requirement(),erp_private.f11_capture_requirement_refresh()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_requirement_refresh_fingerprint(bigint),public.f11_mutate_role_requirement(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
