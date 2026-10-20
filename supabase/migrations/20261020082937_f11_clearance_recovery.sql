BEGIN;
-- F11 nested clearance metadata only; no financial certification or user mappings.
ALTER TABLE public.employee_clearance_items ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_clearance_items TO authenticated;
REVOKE DELETE ON public.employee_clearance_items FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_clearance_revision BEFORE INSERT OR UPDATE ON public.employee_clearance_items FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
CREATE TRIGGER f11_clearance_required_text BEFORE INSERT OR UPDATE OF item_title ON public.employee_clearance_items FOR EACH ROW EXECUTE FUNCTION erp_private.f11_require_child_text('item_title','500');
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK(kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval','eos-case','clearance'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close'))OR(kind='disciplinary'AND action IN('create','update','archive','acknowledge','correct-acknowledgement','close'))OR(kind='approval'AND action IN('create','approve','reject','cancel'))OR(kind='eos-case'AND action IN('create','update','archive','set-status'))OR(kind='clearance'AND action IN('create','update','clear','block','archive')));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()AND CASE WHEN p_kind IN('eos-case','clearance')THEN
 (erp_private.employee_permission(p_employee,'hr.actions.view')OR erp_private.employee_permission(p_employee,'hr.eos.view'))AND(erp_private.employee_permission(p_employee,'hr.actions.manage')OR erp_private.employee_permission(p_employee,'hr.eos.manage'))
 ELSE p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval')AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage')))END,false)
$$;

CREATE FUNCTION erp_private.f11_capture_clearance()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;parent record;changed text[];
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'clearance'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR(context->>'eos_case_id')::bigint IS DISTINCT FROM NEW.eos_case_id OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'
 OR NOT erp_private.f11_child_authorized('clearance',NEW.employee_id)THEN RAISE EXCEPTION 'Current case-bound operation required' USING ERRCODE='42501';END IF;
 SELECT id,case_status INTO parent FROM public.employee_eos_cases WHERE id=NEW.eos_case_id AND employee_id=NEW.employee_id AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original case unavailable' USING ERRCODE='42501';END IF;
 IF parent.case_status IN('closed','cancelled')THEN RAISE EXCEPTION 'Closed or cancelled clearance history is read-only' USING ERRCODE='23514';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor OR NEW.item_status<>'pending'OR NEW.cleared_at IS NOT NULL OR NEW.cleared_by IS NOT NULL OR NEW.responsible_user_id IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN RAISE EXCEPTION 'Invalid clearance creation' USING ERRCODE='23514';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Opening changed' USING ERRCODE='P0409';END IF;
  IF NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Current actor required' USING ERRCODE='23514';END IF;
  IF context->>'action'='archive'THEN
   changed:=ARRAY['workspace_revision','deleted_at','deleted_by','updated_by','updated_at'];
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'IN('update','clear','block')THEN
   changed:=CASE context->>'action'WHEN'update'THEN ARRAY['workspace_revision','clearance_area','item_title','item_status','notes','cleared_by','cleared_at','updated_by','updated_at']ELSE ARRAY['workspace_revision','item_status','notes','cleared_by','cleared_at','updated_by','updated_at']END;
   IF(context->>'action'IN('clear','block')AND OLD.item_status<>'pending')OR(context->>'action'='clear'AND NEW.item_status<>'cleared')OR(context->>'action'='block'AND NEW.item_status<>'blocked')THEN RAISE EXCEPTION 'Invalid clearance transition' USING ERRCODE='23514';END IF;
   IF NEW.item_status IS DISTINCT FROM OLD.item_status THEN
    IF NEW.item_status='cleared'AND(NEW.cleared_by IS DISTINCT FROM actor OR NEW.cleared_at IS NULL)OR NEW.item_status<>'cleared'AND(NEW.cleared_by IS NOT NULL OR NEW.cleared_at IS NOT NULL)THEN RAISE EXCEPTION 'Invalid decision attribution' USING ERRCODE='23514';END IF;
   ELSIF NEW.cleared_by IS DISTINCT FROM OLD.cleared_by OR NEW.cleared_at IS DISTINCT FROM OLD.cleared_at THEN RAISE EXCEPTION 'Unchanged clearance attribution must be retained' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Invalid clearance operation' USING ERRCODE='22023';END IF;
  IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Unrecognized clearance changes' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)VALUES(auth.uid(),(context->>'operation_id')::uuid,'clearance',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,old_values,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_clearance_items',NEW.id,context->>'action',CASE WHEN TG_OP='UPDATE'THEN jsonb_build_object('item_status',OLD.item_status,'cleared_by',OLD.cleared_by,'cleared_at',OLD.cleared_at)ELSE NULL END,jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'eos_case_id',NEW.eos_case_id,'revision',NEW.workspace_revision,'item_status',NEW.item_status,'cleared_by',NEW.cleared_by,'cleared_at',NEW.cleared_at));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_clearance_operation AFTER INSERT OR UPDATE ON public.employee_clearance_items FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_clearance();

CREATE FUNCTION public.f11_mutate_clearance(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;parent record;case_id bigint;v_status text;trim_chars text:=E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF NOT erp_private.f11_child_authorized('clearance',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'clearance'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','clear','block','archive')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))
 OR jsonb_typeof(p_data->'eos_case_id')IS DISTINCT FROM 'number'OR(p_data->>'eos_case_id')!~'^[1-9][0-9]*$'OR(p_data->>'eos_case_id')::numeric>9007199254740991 THEN RAISE EXCEPTION 'Invalid case-bound clearance contract' USING ERRCODE='22023';END IF;
 case_id:=(p_data->>'eos_case_id')::bigint;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 SELECT id,case_status INTO parent FROM public.employee_eos_cases WHERE id=case_id AND employee_id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original case unavailable' USING ERRCODE='42501';END IF;
 IF parent.case_status IN('closed','cancelled')THEN RAISE EXCEPTION 'Closed or cancelled clearance history is read-only' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(CASE p_action WHEN'create'THEN ARRAY['eos_case_id','clearance_area','item_title','item_status','notes','responsible_user_id']WHEN'update'THEN ARRAY['eos_case_id','clearance_area','item_title','item_status','notes']WHEN'archive'THEN ARRAY['eos_case_id']ELSE ARRAY['eos_case_id','notes']END))
 OR(p_data?'notes'AND jsonb_typeof(p_data->'notes')NOT IN('string','null'))OR length(p_data->>'notes')>2000
 OR(p_data?'clearance_area'AND(jsonb_typeof(p_data->'clearance_area')IS DISTINCT FROM 'string'OR(p_data->>'clearance_area')NOT IN('hr','operations','it','finance','camp','workshop','store','hse','other')))
 OR(p_data?'item_title'AND(jsonb_typeof(p_data->'item_title')IS DISTINCT FROM 'string'OR length(btrim(p_data->>'item_title',trim_chars))NOT BETWEEN 1 AND 500))
 OR(p_data?'item_status'AND(jsonb_typeof(p_data->'item_status')IS DISTINCT FROM 'string'OR(p_data->>'item_status')NOT IN('pending','cleared','not_applicable','blocked')))
 OR(p_action='create'AND(jsonb_typeof(p_data->'clearance_area')IS DISTINCT FROM 'string'OR jsonb_typeof(p_data->'item_title')IS DISTINCT FROM 'string'OR(p_data?'item_status'AND p_data->>'item_status'<>'pending')OR(p_data?'responsible_user_id'AND p_data->'responsible_user_id'<>'null'::jsonb)))
 OR(p_action='update'AND NOT(p_data?'clearance_area'OR p_data?'item_title'OR p_data?'item_status'OR p_data?'notes'))
 OR(p_action IN('clear','block')AND p_data?'notes'AND jsonb_typeof(p_data->'notes')IS DISTINCT FROM 'string')THEN RAISE EXCEPTION 'Invalid clearance fields or unresolved assignment' USING ERRCODE='23514';END IF;
 IF p_action<>'create'THEN
  SELECT * INTO existing FROM public.employee_clearance_items WHERE id=p_id AND employee_id=p_employee AND eos_case_id=case_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original clearance item unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Clearance changed after opening' USING ERRCODE='P0409';END IF;
  IF p_action IN('clear','block')AND existing.item_status<>'pending'THEN RAISE EXCEPTION 'Only pending clearance may be decided' USING ERRCODE='23514';END IF;
  v_status:=CASE p_action WHEN'clear'THEN'cleared'WHEN'block'THEN'blocked'ELSE coalesce(p_data->>'item_status',existing.item_status)END;
 END IF;
 IF NOT erp_private.f11_child_authorized('clearance',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'eos_case_id',case_id,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_clearance_items(employee_id,eos_case_id,clearance_area,item_title,item_status,notes,created_by,updated_by)VALUES(p_employee,case_id,p_data->>'clearance_area',btrim(p_data->>'item_title',trim_chars),'pending',p_data->>'notes',actor,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSIF p_action IN('update','clear','block')THEN
  UPDATE public.employee_clearance_items x SET clearance_area=coalesce(p_data->>'clearance_area',x.clearance_area),item_title=CASE WHEN p_data?'item_title'THEN btrim(p_data->>'item_title',trim_chars)ELSE x.item_title END,item_status=v_status,notes=CASE WHEN p_data?'notes'THEN p_data->>'notes'ELSE x.notes END,updated_by=actor,
  cleared_by=CASE WHEN v_status IS DISTINCT FROM x.item_status THEN CASE WHEN v_status='cleared'THEN actor ELSE NULL END ELSE x.cleared_by END,cleared_at=CASE WHEN v_status IS DISTINCT FROM x.item_status THEN CASE WHEN v_status='cleared'THEN clock_timestamp()ELSE NULL END ELSE x.cleared_at END
  WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSE
  UPDATE public.employee_clearance_items x SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized('clearance',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_clearance(),public.f11_mutate_clearance(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_mutate_clearance(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
