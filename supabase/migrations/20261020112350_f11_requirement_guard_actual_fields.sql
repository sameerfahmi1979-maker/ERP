BEGIN;
-- Forward-only repair: this existing table has no notes column. Preserve every other guard.
CREATE OR REPLACE FUNCTION erp_private.f11_capture_role_requirement()RETURNS trigger
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
  OR NEW.met_record_type IS NOT NULL OR NEW.met_record_id IS NOT NULL OR NEW.is_met IS DISTINCT FROM false OR NEW.status='waived'OR NEW.waived_by IS NOT NULL OR NEW.waived_at IS NOT NULL OR NEW.waiver_reason IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN RAISE EXCEPTION 'Unrendered requirement facts cannot be created' USING ERRCODE='23514';END IF;
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
COMMIT;
