BEGIN;
-- Existing operational-block form and purpose-specific release; no F14 policy rollout.
ALTER TABLE public.employee_operational_blocks ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_operational_blocks TO authenticated;
REVOKE DELETE ON public.employee_operational_blocks FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_operational_block_revision BEFORE INSERT OR UPDATE ON public.employee_operational_blocks FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK(kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval','eos-case','clearance','assignment','asset','ppe','accommodation','operational-block'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close'))OR(kind='disciplinary'AND action IN('create','update','archive','acknowledge','correct-acknowledgement','close'))OR(kind='approval'AND action IN('create','approve','reject','cancel','archive'))OR(kind='eos-case'AND action IN('create','update','archive','set-status'))OR(kind='clearance'AND action IN('create','update','clear','block','archive'))OR(kind='assignment'AND action IN('create','update','archive'))OR(kind IN('asset','ppe')AND action IN('create','update','archive','return'))OR(kind='accommodation'AND action IN('create','update','archive','end'))OR(kind='operational-block'AND action IN('create','release','archive')));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()AND CASE WHEN p_kind IN('assignment','asset','ppe','accommodation','operational-block')THEN
 erp_private.employee_permission(p_employee,'hr.assignments.view')AND erp_private.employee_permission(p_employee,'hr.assignments.manage')
 WHEN p_kind IN('eos-case','clearance')THEN
 (erp_private.employee_permission(p_employee,'hr.actions.view')OR erp_private.employee_permission(p_employee,'hr.eos.view'))AND(erp_private.employee_permission(p_employee,'hr.actions.manage')OR erp_private.employee_permission(p_employee,'hr.eos.manage'))
 ELSE p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval')AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage')))END,false)
$$;
CREATE FUNCTION erp_private.f11_capture_operational_block()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;changed text[];
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'operational-block'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'OR NOT erp_private.f11_child_authorized('operational-block',NEW.employee_id)THEN RAISE EXCEPTION 'Current original block operation required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor
  OR NEW.block_status IS DISTINCT FROM 'active'OR NEW.released_by IS NOT NULL OR NEW.released_at IS NOT NULL OR NEW.release_reason IS NOT NULL
  OR NEW.related_record_type IS NOT NULL OR NEW.related_record_id IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN RAISE EXCEPTION 'Unrendered block fields cannot be created' USING ERRCODE='23514';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Original block changed' USING ERRCODE='P0409';END IF;
  IF NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Current actor required' USING ERRCODE='23514';END IF;
  IF context->>'action'='archive'THEN
   changed:=ARRAY['workspace_revision','deleted_at','deleted_by','updated_by','updated_at'];
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid block archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='release'THEN
   changed:=ARRAY['workspace_revision','block_status','released_by','released_at','release_reason','updated_by','updated_at'];
   IF OLD.block_status IS DISTINCT FROM 'active'OR NEW.block_status IS DISTINCT FROM 'released'OR NEW.released_by IS DISTINCT FROM actor OR NEW.released_at IS NULL OR NEW.release_reason IS NULL THEN RAISE EXCEPTION 'Invalid block release' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Invalid block action' USING ERRCODE='22023';END IF;
  IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Unrecognized block or evidence changes' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,'operational-block',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_operational_blocks',NEW.id,context->>'action',jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision,'block_type',NEW.block_type,'block_status',NEW.block_status));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_operational_block_operation AFTER INSERT OR UPDATE ON public.employee_operational_blocks FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_operational_block();
CREATE FUNCTION public.f11_mutate_operational_block(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;v_from date;v_to date;reason text;
BEGIN
 IF NOT erp_private.f11_child_authorized('operational-block',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'operational-block'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','release','archive')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action='archive'AND p_data<>'{}')THEN RAISE EXCEPTION 'Invalid operational block contract' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 IF p_action='create'THEN
  IF NOT p_data?&ARRAY['block_type','block_reason','effective_from','effective_to','notes']OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['block_type','block_reason','effective_from','effective_to','notes']))
  OR jsonb_typeof(p_data->'block_type')IS DISTINCT FROM 'string'OR(p_data->>'block_type')NOT IN('compliance','medical','training','access','payroll','hr_hold','operations','safety','other')
  OR jsonb_typeof(p_data->'block_reason')IS DISTINCT FROM 'string'OR length(p_data->>'block_reason')>2000
  OR jsonb_typeof(p_data->'effective_from')IS DISTINCT FROM 'string'OR(p_data->>'effective_from')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR jsonb_typeof(p_data->'effective_to')NOT IN('string','null')OR(p_data->>'effective_to')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR jsonb_typeof(p_data->'notes')NOT IN('string','null')OR length(p_data->>'notes')>2000 THEN RAISE EXCEPTION 'Invalid visible block fields' USING ERRCODE='23514';END IF;
  v_from:=(p_data->>'effective_from')::date;v_to:=(p_data->>'effective_to')::date;
  IF v_to<v_from THEN RAISE EXCEPTION 'Block dates are reversed' USING ERRCODE='23514';END IF;
  reason:=p_data->>'block_reason';
 ELSIF p_action='release'THEN
  IF NOT p_data?'release_reason'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>'release_reason')OR jsonb_typeof(p_data->'release_reason')IS DISTINCT FROM 'string'OR length(p_data->>'release_reason')>2000 THEN RAISE EXCEPTION 'Release reason is required' USING ERRCODE='23514';END IF;
  reason:=p_data->>'release_reason';
 END IF;
 IF p_action<>'archive'AND btrim(translate(reason,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(8195)||chr(12288),'         '))=''THEN RAISE EXCEPTION 'Block reason cannot be blank' USING ERRCODE='23514';END IF;
 IF p_action<>'create'THEN
  SELECT * INTO existing FROM public.employee_operational_blocks WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original block unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Original block changed after opening' USING ERRCODE='P0409';END IF;
  IF p_action='release'AND existing.block_status<>'active'THEN RAISE EXCEPTION 'Only active blocks can be released' USING ERRCODE='23514';END IF;
 END IF;
 IF NOT erp_private.f11_child_authorized('operational-block',p_employee)THEN RAISE EXCEPTION 'Current block access changed' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_operational_blocks(employee_id,block_type,block_reason,block_status,effective_from,effective_to,notes,created_by,updated_by)
  VALUES(p_employee,p_data->>'block_type',btrim(reason),'active',v_from,v_to,p_data->>'notes',actor,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSIF p_action='release'THEN
  UPDATE public.employee_operational_blocks x SET block_status='released',released_by=actor,released_at=clock_timestamp(),release_reason=btrim(reason),updated_by=actor
  WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSE UPDATE public.employee_operational_blocks x SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized('operational-block',p_employee)THEN RAISE EXCEPTION 'Current block access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_operational_block(),public.f11_mutate_operational_block(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_mutate_operational_block(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
