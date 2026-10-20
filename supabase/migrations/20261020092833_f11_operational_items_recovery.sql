BEGIN;
-- Existing employee-owned operational forms only. No identity, payroll or new business-policy rollout.
ALTER TABLE public.employee_assets ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
ALTER TABLE public.employee_ppe_issues ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
ALTER TABLE public.employee_accommodation_records ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_assets,public.employee_ppe_issues,public.employee_accommodation_records TO authenticated;
REVOKE DELETE ON public.employee_assets,public.employee_ppe_issues,public.employee_accommodation_records FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_asset_revision BEFORE INSERT OR UPDATE ON public.employee_assets FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
CREATE TRIGGER f04_ppe_revision BEFORE INSERT OR UPDATE ON public.employee_ppe_issues FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
CREATE TRIGGER f04_accommodation_revision BEFORE INSERT OR UPDATE ON public.employee_accommodation_records FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK(kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval','eos-case','clearance','assignment','asset','ppe','accommodation'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close'))OR(kind='disciplinary'AND action IN('create','update','archive','acknowledge','correct-acknowledgement','close'))OR(kind='approval'AND action IN('create','approve','reject','cancel','archive'))OR(kind='eos-case'AND action IN('create','update','archive','set-status'))OR(kind='clearance'AND action IN('create','update','clear','block','archive'))OR(kind='assignment'AND action IN('create','update','archive'))OR(kind IN('asset','ppe')AND action IN('create','update','archive','return'))OR(kind='accommodation'AND action IN('create','update','archive','end')));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()AND CASE WHEN p_kind IN('assignment','asset','ppe','accommodation')THEN
 erp_private.employee_permission(p_employee,'hr.assignments.view')AND erp_private.employee_permission(p_employee,'hr.assignments.manage')
 WHEN p_kind IN('eos-case','clearance')THEN
 (erp_private.employee_permission(p_employee,'hr.actions.view')OR erp_private.employee_permission(p_employee,'hr.eos.view'))AND(erp_private.employee_permission(p_employee,'hr.actions.manage')OR erp_private.employee_permission(p_employee,'hr.eos.manage'))
 ELSE p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval')AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage')))END,false)
$$;

CREATE FUNCTION erp_private.f11_capture_operation_item()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;kind text;changed text[];after_row jsonb:=to_jsonb(NEW);before_row jsonb;
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 kind:=CASE TG_TABLE_NAME WHEN'employee_assets'THEN'asset'WHEN'employee_ppe_issues'THEN'ppe'WHEN'employee_accommodation_records'THEN'accommodation'ELSE NULL END;
 IF kind IS NULL OR context IS NULL OR context->>'kind'IS DISTINCT FROM kind OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'OR NOT erp_private.f11_child_authorized(kind,NEW.employee_id)THEN RAISE EXCEPTION 'Current original operational item contract required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL
  OR after_row->>'dms_document_id'IS NOT NULL OR after_row->>'issued_by'IS NOT NULL OR after_row->>'condition_on_return'IS NOT NULL OR after_row->>'returned_date'IS NOT NULL
  OR after_row->>'status'IS DISTINCT FROM(CASE WHEN kind='accommodation'THEN'active'ELSE'issued'END)THEN RAISE EXCEPTION 'Unrendered operational state or linkage cannot be created' USING ERRCODE='23514';END IF;
 ELSE
  before_row:=to_jsonb(OLD);
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Operational item opening changed' USING ERRCODE='P0409';END IF;
  IF NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Current actor required' USING ERRCODE='23514';END IF;
  changed:=ARRAY['workspace_revision','updated_by','updated_at'];
  IF context->>'action'='archive'THEN
   changed:=changed||ARRAY['deleted_at','deleted_by'];
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid operational archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='update'THEN
   changed:=changed||CASE kind WHEN'asset'THEN ARRAY['asset_type','asset_reference','asset_description','issued_date','return_due_date','condition_on_issue','notes']WHEN'ppe'THEN ARRAY['ppe_item','standard_or_size','quantity','issued_date','expiry_or_replacement_date','notes']ELSE ARRAY['accommodation_type','accommodation_location','room_or_bed_no','assigned_from','assigned_to','notes']END;
  ELSIF context->>'action'='return'AND kind IN('asset','ppe')THEN
   changed:=changed||ARRAY['status','returned_date']||CASE WHEN kind='asset'THEN ARRAY['condition_on_return']ELSE ARRAY[]::text[]END;
   IF before_row->>'status'<>'issued'OR after_row->>'status'<>'returned'OR after_row->>'returned_date'IS NULL THEN RAISE EXCEPTION 'Invalid return transition' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='end'AND kind='accommodation'THEN
   changed:=changed||ARRAY['status','assigned_to'];
   IF before_row->>'status'<>'active'OR after_row->>'status'<>'ended'OR after_row->>'assigned_to'IS NULL THEN RAISE EXCEPTION 'Invalid accommodation end transition' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Invalid operational item action' USING ERRCODE='22023';END IF;
  IF(after_row-changed)IS DISTINCT FROM(before_row-changed)THEN RAISE EXCEPTION 'Unrecognized operational linkage or history change' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,kind,context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,old_values,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR',TG_TABLE_NAME,NEW.id,context->>'action',CASE WHEN TG_OP='UPDATE'THEN jsonb_build_object('status',before_row->>'status','returned_date',before_row->>'returned_date','assigned_to',before_row->>'assigned_to')ELSE NULL END,jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision,'status',after_row->>'status','returned_date',after_row->>'returned_date','assigned_to',after_row->>'assigned_to'));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_asset_operation AFTER INSERT OR UPDATE ON public.employee_assets FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_operation_item();
CREATE TRIGGER f11_ppe_operation AFTER INSERT OR UPDATE ON public.employee_ppe_issues FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_operation_item();
CREATE TRIGGER f11_accommodation_operation AFTER INSERT OR UPDATE ON public.employee_accommodation_records FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_operation_item();

CREATE FUNCTION public.f11_mutate_operation_item(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing jsonb;fields text[];v_from date;v_to date;v_done date;v_quantity numeric;trim_chars text:=E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('asset','ppe','accommodation')OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','archive',CASE WHEN p_kind='accommodation'THEN'end'ELSE'return'END)OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action='archive'AND p_data<>'{}')THEN RAISE EXCEPTION 'Invalid operational item contract' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 fields:=CASE p_kind WHEN'asset'THEN ARRAY['asset_type','asset_reference','asset_description','issued_date','return_due_date','condition_on_issue','notes']WHEN'ppe'THEN ARRAY['ppe_item','standard_or_size','quantity','issued_date','expiry_or_replacement_date','notes']ELSE ARRAY['accommodation_type','accommodation_location','room_or_bed_no','assigned_from','assigned_to','notes']END;
 IF p_action IN('create','update')THEN
  IF NOT(p_data ?& fields)OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(fields))OR jsonb_typeof(p_data->'notes')NOT IN('string','null')OR length(p_data->>'notes')>2000 THEN RAISE EXCEPTION 'Complete visible operational fields required' USING ERRCODE='23514';END IF;
  IF p_kind='asset'THEN
   IF jsonb_typeof(p_data->'asset_type')IS DISTINCT FROM 'string'OR(p_data->>'asset_type')NOT IN('id_card','phone','sim','laptop','vehicle','tool','key','other')
   OR jsonb_typeof(p_data->'asset_reference')NOT IN('string','null')OR length(p_data->>'asset_reference')>200 OR jsonb_typeof(p_data->'asset_description')IS DISTINCT FROM 'string'OR length(btrim(p_data->>'asset_description',trim_chars))NOT BETWEEN 1 AND 1000
   OR jsonb_typeof(p_data->'condition_on_issue')NOT IN('string','null')OR length(p_data->>'condition_on_issue')>500 THEN RAISE EXCEPTION 'Invalid visible asset fields' USING ERRCODE='23514';END IF;
  ELSIF p_kind='ppe'THEN
   IF jsonb_typeof(p_data->'ppe_item')IS DISTINCT FROM 'string'OR length(btrim(p_data->>'ppe_item',trim_chars))NOT BETWEEN 1 AND 500 OR jsonb_typeof(p_data->'standard_or_size')NOT IN('string','null')OR length(p_data->>'standard_or_size')>200 OR jsonb_typeof(p_data->'quantity')IS DISTINCT FROM 'number'THEN RAISE EXCEPTION 'Invalid visible PPE fields' USING ERRCODE='23514';END IF;
   v_quantity:=(p_data->>'quantity')::numeric;
   IF v_quantity<=0 OR v_quantity>99999999.99 OR trunc(v_quantity,2)<>v_quantity THEN RAISE EXCEPTION 'PPE quantity must be positive and fit two decimals' USING ERRCODE='23514';END IF;
  ELSE
   IF jsonb_typeof(p_data->'accommodation_type')NOT IN('string','null')OR(p_data->>'accommodation_type')NOT IN('company_camp','rented_room','allowance','other')OR jsonb_typeof(p_data->'accommodation_location')NOT IN('string','null')OR length(p_data->>'accommodation_location')>500 OR jsonb_typeof(p_data->'room_or_bed_no')NOT IN('string','null')OR length(p_data->>'room_or_bed_no')>100 THEN RAISE EXCEPTION 'Invalid visible accommodation fields' USING ERRCODE='23514';END IF;
  END IF;
  IF p_kind='accommodation'THEN
   IF jsonb_typeof(p_data->'assigned_from')IS DISTINCT FROM 'string'OR(p_data->>'assigned_from')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR jsonb_typeof(p_data->'assigned_to')NOT IN('string','null')OR(p_data->>'assigned_to')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RAISE EXCEPTION 'Invalid accommodation dates' USING ERRCODE='23514';END IF;
   v_from:=(p_data->>'assigned_from')::date;v_to:=(p_data->>'assigned_to')::date;
  ELSE
   IF jsonb_typeof(p_data->'issued_date')IS DISTINCT FROM 'string'OR(p_data->>'issued_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RAISE EXCEPTION 'Invalid issue date' USING ERRCODE='23514';END IF;
   v_from:=(p_data->>'issued_date')::date;
   IF p_kind='asset'THEN
    IF jsonb_typeof(p_data->'return_due_date')NOT IN('string','null')OR(p_data->>'return_due_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RAISE EXCEPTION 'Invalid due date' USING ERRCODE='23514';END IF;
    v_to:=(p_data->>'return_due_date')::date;
   ELSE
    IF jsonb_typeof(p_data->'expiry_or_replacement_date')NOT IN('string','null')OR(p_data->>'expiry_or_replacement_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RAISE EXCEPTION 'Invalid PPE expiry date' USING ERRCODE='23514';END IF;
    v_to:=(p_data->>'expiry_or_replacement_date')::date;
   END IF;
  END IF;
  IF v_to<v_from THEN RAISE EXCEPTION 'Operational dates are reversed' USING ERRCODE='23514';END IF;
 ELSIF p_action IN('return','end')THEN
  fields:=CASE WHEN p_action='end'THEN ARRAY['assigned_to']WHEN p_kind='asset'THEN ARRAY['returned_date','condition_on_return']ELSE ARRAY['returned_date']END;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(fields))OR(p_kind='asset'AND p_data?'condition_on_return'AND(jsonb_typeof(p_data->'condition_on_return')IS DISTINCT FROM 'string'OR length(p_data->>'condition_on_return')>500))THEN RAISE EXCEPTION 'Invalid purpose-specific transition fields' USING ERRCODE='23514';END IF;
  IF p_action='end'THEN
   IF jsonb_typeof(p_data->'assigned_to')IS DISTINCT FROM 'string'OR(p_data->>'assigned_to')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RAISE EXCEPTION 'End date required' USING ERRCODE='23514';END IF;v_done:=(p_data->>'assigned_to')::date;
  ELSE
   IF jsonb_typeof(p_data->'returned_date')IS DISTINCT FROM 'string'OR(p_data->>'returned_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RAISE EXCEPTION 'Return date required' USING ERRCODE='23514';END IF;v_done:=(p_data->>'returned_date')::date;
  END IF;
 END IF;
 IF p_action<>'create'THEN
  CASE p_kind
   WHEN'asset'THEN SELECT to_jsonb(t)INTO existing FROM public.employee_assets t WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
   WHEN'ppe'THEN SELECT to_jsonb(t)INTO existing FROM public.employee_ppe_issues t WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
   ELSE SELECT to_jsonb(t)INTO existing FROM public.employee_accommodation_records t WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  END CASE;
  IF existing IS NULL THEN RAISE EXCEPTION 'Original operational item unavailable' USING ERRCODE='42501';END IF;
  IF(existing->>'workspace_revision')::bigint<>p_revision THEN RAISE EXCEPTION 'Operational item changed after opening' USING ERRCODE='P0409';END IF;
  IF p_action='return'AND(existing->>'status'<>'issued'OR v_done<(existing->>'issued_date')::date)OR p_action='end'AND(existing->>'status'<>'active'OR v_done<(existing->>'assigned_from')::date)THEN RAISE EXCEPTION 'Invalid current-state operational transition or chronology' USING ERRCODE='23514';END IF;
  IF p_action='update'AND((p_kind IN('asset','ppe')AND v_from>(existing->>'returned_date')::date)OR(p_kind='accommodation'AND existing->>'status'='ended'AND v_to IS NULL))THEN RAISE EXCEPTION 'Existing operational history must remain valid' USING ERRCODE='23514';END IF;
 END IF;
 IF NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current operational access changed' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_kind='asset'THEN
  IF p_action='create'THEN INSERT INTO public.employee_assets(employee_id,asset_type,asset_reference,asset_description,issued_date,return_due_date,condition_on_issue,notes,status,created_by,updated_by)VALUES(p_employee,p_data->>'asset_type',p_data->>'asset_reference',btrim(p_data->>'asset_description',trim_chars),v_from,v_to,p_data->>'condition_on_issue',p_data->>'notes','issued',actor,actor)RETURNING id,workspace_revision INTO target,revision;
  ELSIF p_action='update'THEN UPDATE public.employee_assets t SET asset_type=p_data->>'asset_type',asset_reference=p_data->>'asset_reference',asset_description=btrim(p_data->>'asset_description',trim_chars),issued_date=v_from,return_due_date=v_to,condition_on_issue=p_data->>'condition_on_issue',notes=p_data->>'notes',updated_by=actor WHERE id=p_id AND workspace_revision=p_revision RETURNING id,workspace_revision INTO target,revision;
  ELSIF p_action='return'THEN UPDATE public.employee_assets t SET status='returned',returned_date=v_done,condition_on_return=CASE WHEN p_data?'condition_on_return'THEN p_data->>'condition_on_return'ELSE t.condition_on_return END,updated_by=actor WHERE id=p_id AND workspace_revision=p_revision RETURNING id,workspace_revision INTO target,revision;
  ELSE UPDATE public.employee_assets t SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE id=p_id AND workspace_revision=p_revision RETURNING id,workspace_revision INTO target,revision;END IF;
 ELSIF p_kind='ppe'THEN
  IF p_action='create'THEN INSERT INTO public.employee_ppe_issues(employee_id,ppe_item,standard_or_size,quantity,issued_date,expiry_or_replacement_date,notes,status,created_by,updated_by)VALUES(p_employee,btrim(p_data->>'ppe_item',trim_chars),p_data->>'standard_or_size',v_quantity,v_from,v_to,p_data->>'notes','issued',actor,actor)RETURNING id,workspace_revision INTO target,revision;
  ELSIF p_action='update'THEN UPDATE public.employee_ppe_issues t SET ppe_item=btrim(p_data->>'ppe_item',trim_chars),standard_or_size=p_data->>'standard_or_size',quantity=v_quantity,issued_date=v_from,expiry_or_replacement_date=v_to,notes=p_data->>'notes',updated_by=actor WHERE id=p_id AND workspace_revision=p_revision RETURNING id,workspace_revision INTO target,revision;
  ELSIF p_action='return'THEN UPDATE public.employee_ppe_issues t SET status='returned',returned_date=v_done,updated_by=actor WHERE id=p_id AND workspace_revision=p_revision RETURNING id,workspace_revision INTO target,revision;
  ELSE UPDATE public.employee_ppe_issues t SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE id=p_id AND workspace_revision=p_revision RETURNING id,workspace_revision INTO target,revision;END IF;
 ELSE
  IF p_action='create'THEN INSERT INTO public.employee_accommodation_records(employee_id,accommodation_type,accommodation_location,room_or_bed_no,assigned_from,assigned_to,notes,status,created_by,updated_by)VALUES(p_employee,p_data->>'accommodation_type',p_data->>'accommodation_location',p_data->>'room_or_bed_no',v_from,v_to,p_data->>'notes','active',actor,actor)RETURNING id,workspace_revision INTO target,revision;
  ELSIF p_action='update'THEN UPDATE public.employee_accommodation_records t SET accommodation_type=p_data->>'accommodation_type',accommodation_location=p_data->>'accommodation_location',room_or_bed_no=p_data->>'room_or_bed_no',assigned_from=v_from,assigned_to=v_to,notes=p_data->>'notes',updated_by=actor WHERE id=p_id AND workspace_revision=p_revision RETURNING id,workspace_revision INTO target,revision;
  ELSIF p_action='end'THEN UPDATE public.employee_accommodation_records t SET status='ended',assigned_to=v_done,updated_by=actor WHERE id=p_id AND workspace_revision=p_revision RETURNING id,workspace_revision INTO target,revision;
  ELSE UPDATE public.employee_accommodation_records t SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE id=p_id AND workspace_revision=p_revision RETURNING id,workspace_revision INTO target,revision;END IF;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current operational access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_operation_item(),public.f11_mutate_operation_item(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_mutate_operation_item(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
