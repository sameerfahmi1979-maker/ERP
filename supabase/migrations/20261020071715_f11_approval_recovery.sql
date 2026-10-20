BEGIN;
-- F11 approval metadata only. No real role mapping or business-event application.
ALTER TABLE public.employee_approval_requests ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_approval_requests TO authenticated;
REVOKE DELETE ON public.employee_approval_requests FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_approval_revision BEFORE INSERT OR UPDATE ON public.employee_approval_requests FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
CREATE TRIGGER f11_approval_required_text BEFORE INSERT OR UPDATE OF request_title ON public.employee_approval_requests FOR EACH ROW EXECUTE FUNCTION erp_private.f11_require_child_text('request_title','500');
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK(kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close'))OR(kind='disciplinary'AND action IN('create','update','archive','acknowledge','correct-acknowledgement','close'))OR(kind='approval'AND action IN('create','approve','reject','cancel','archive')));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval')AND erp_private.business_principal_is_active()
 AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage'))),false)
$$;

CREATE FUNCTION erp_private.f11_capture_approval()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;expected text;changed text[];
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM 'approval'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id
 OR nullif(context->>'operation_id','')IS NULL OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'
 OR NOT erp_private.f11_child_authorized('approval',NEW.employee_id)THEN RAISE EXCEPTION 'Current scoped operation contract required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF TG_OP='INSERT'THEN
  IF context->>'action'IS DISTINCT FROM 'create'OR NEW.created_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor OR NEW.requested_by IS DISTINCT FROM actor OR NEW.request_status<>'pending'
  OR NEW.approval_role_id IS NOT NULL OR NEW.related_record_id IS NOT NULL OR NEW.related_record_type IS NOT NULL
  OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.cancelled_by IS NOT NULL OR NEW.cancelled_at IS NOT NULL OR NEW.decision_reason IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL
  THEN RAISE EXCEPTION 'Invalid request creation' USING ERRCODE='23514';END IF;
 ELSE
  IF(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Opening changed' USING ERRCODE='P0409';END IF;
  IF context->>'action'='archive'THEN
   changed:=ARRAY['workspace_revision','deleted_at','deleted_by','updated_by','updated_at'];
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor OR NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'IN('approve','reject','cancel')THEN
   IF OLD.request_status<>'pending'THEN RAISE EXCEPTION 'Only pending requests can be decided' USING ERRCODE='23514';END IF;
   IF context->>'action'IN('approve','reject')AND(OLD.approval_role_id IS NOT NULL OR OLD.requested_by IS NULL OR OLD.created_by IS NULL OR actor IN(OLD.requested_by,OLD.created_by))THEN RAISE EXCEPTION 'Independent reviewer or mapping review required' USING ERRCODE='23514';END IF;
   expected:=CASE context->>'action'WHEN'approve'THEN'approved'WHEN'reject'THEN'rejected'ELSE'cancelled'END;
   changed:=ARRAY['workspace_revision','request_status','decision_reason','updated_by','updated_at']||CASE context->>'action'WHEN'approve'THEN ARRAY['approved_by','approved_at']WHEN'reject'THEN ARRAY['rejected_by','rejected_at']ELSE ARRAY['cancelled_by','cancelled_at']END;
   IF NEW.request_status IS DISTINCT FROM expected OR NEW.updated_by IS DISTINCT FROM actor
   OR(context->>'action'='approve'AND(NEW.approved_by IS DISTINCT FROM actor OR NEW.approved_at IS NULL))
   OR(context->>'action'='reject'AND(NEW.rejected_by IS DISTINCT FROM actor OR NEW.rejected_at IS NULL))
   OR(context->>'action'='cancel'AND(NEW.cancelled_by IS DISTINCT FROM actor OR NEW.cancelled_at IS NULL))THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Invalid approval operation' USING ERRCODE='22023';END IF;
  IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Unrecognized request changes' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),(context->>'operation_id')::uuid,'approval',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_approval_requests',NEW.id,context->>'action',jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_approval_operation AFTER INSERT OR UPDATE ON public.employee_approval_requests FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_approval();

CREATE FUNCTION public.f11_mutate_approval(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;actor bigint;target bigint;revision bigint;existing record;v_type text;reason text;trim_chars text:=E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF NOT erp_private.f11_child_authorized('approval',p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_kind IS DISTINCT FROM 'approval'OR p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','approve','reject','cancel','archive')OR jsonb_typeof(p_data)IS DISTINCT FROM 'object'OR octet_length(p_data::text)>65536
 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_id>9007199254740991 OR p_revision IS NULL OR p_revision<1))OR(p_action='archive'AND p_data<>'{}')THEN RAISE EXCEPTION 'Invalid approval operation contract' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF p_action='create'THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['approval_type','request_title']))OR jsonb_typeof(p_data->'approval_type')IS DISTINCT FROM 'string'OR jsonb_typeof(p_data->'request_title')IS DISTINCT FROM 'string'THEN RAISE EXCEPTION 'Invalid approval fields' USING ERRCODE='23514';END IF;
  v_type:=p_data->>'approval_type';
  IF v_type NOT IN('hr_action','pro_process','performance','disciplinary','eos','clearance','other')THEN RAISE EXCEPTION 'Invalid approval type' USING ERRCODE='23514';END IF;
 ELSIF p_action IN('approve','reject','cancel')THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>'reason')OR(p_data?'reason'AND jsonb_typeof(p_data->'reason')IS DISTINCT FROM 'string')THEN RAISE EXCEPTION 'Invalid reason fields' USING ERRCODE='23514';END IF;
  reason:=btrim(coalesce(p_data->>'reason',''),trim_chars);
  IF length(reason)>5000 OR(p_action IN('reject','cancel')AND reason='')THEN RAISE EXCEPTION 'Reason required or too long' USING ERRCODE='23514';END IF;
 END IF;
 IF p_action<>'create'THEN
  SELECT * INTO existing FROM public.employee_approval_requests WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Request changed after opening' USING ERRCODE='P0409';END IF;
  IF p_action IN('approve','reject','cancel')AND existing.request_status<>'pending'THEN RAISE EXCEPTION 'Only pending requests can be decided' USING ERRCODE='23514';END IF;
  IF p_action IN('approve','reject')AND(existing.approval_role_id IS NOT NULL OR existing.requested_by IS NULL OR existing.created_by IS NULL OR actor IN(existing.requested_by,existing.created_by))THEN RAISE EXCEPTION 'Independent reviewer or mapping review required' USING ERRCODE='23514';END IF;
 END IF;
 -- Recheck current authority after possible waits, before either receipt or data writes.
 IF NOT erp_private.f11_child_authorized('approval',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='create'THEN
  INSERT INTO public.employee_approval_requests(employee_id,approval_type,request_title,request_status,requested_by,requested_at,created_by,updated_by)
  VALUES(p_employee,v_type,btrim(p_data->>'request_title',trim_chars),'pending',actor,clock_timestamp(),actor,actor)RETURNING id,workspace_revision INTO target,revision;
 ELSIF p_action='approve'THEN
  UPDATE public.employee_approval_requests x SET request_status='approved',approved_by=actor,approved_at=clock_timestamp(),decision_reason=nullif(reason,''),updated_by=actor WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSIF p_action='reject'THEN
  UPDATE public.employee_approval_requests x SET request_status='rejected',rejected_by=actor,rejected_at=clock_timestamp(),decision_reason=reason,updated_by=actor WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSIF p_action='cancel'THEN
  UPDATE public.employee_approval_requests x SET request_status='cancelled',cancelled_by=actor,cancelled_at=clock_timestamp(),decision_reason=reason,updated_by=actor WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 ELSE
  UPDATE public.employee_approval_requests x SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE x.id=p_id AND x.workspace_revision=p_revision RETURNING x.id,x.workspace_revision INTO target,revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized('approval',p_employee)THEN RAISE EXCEPTION 'Current access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_approval(),public.f11_mutate_approval(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_mutate_approval(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
