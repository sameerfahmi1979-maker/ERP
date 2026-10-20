BEGIN;
DO $$DECLARE name text;definition text;BEGIN
 FOREACH name IN ARRAY ARRAY['employee_payroll_profiles','employee_salary_components','employee_salary_revisions','employee_wps_profiles','employee_payroll_holds']LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0)',name);
  EXECUTE format('GRANT SELECT(workspace_revision)ON public.%I TO authenticated',name);
  EXECUTE format('REVOKE DELETE ON public.%I FROM PUBLIC,anon,authenticated',name);
  IF name<>'employee_salary_revisions'THEN EXECUTE format('CREATE TRIGGER f04_payroll_revision BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision()',name);END IF;
 END LOOP;
 REVOKE UPDATE ON public.employee_salary_revisions FROM PUBLIC,anon,authenticated;
 SELECT regexp_replace(pg_get_constraintdef(oid),'^CHECK ','')INTO STRICT definition FROM pg_constraint WHERE conrelid='erp_private.f11_child_receipts'::regclass AND conname='f11_child_receipts_kind_check';
 ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
 EXECUTE 'ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK('||definition||' OR kind IN(''payroll-profile'',''salary-component'',''salary-revision'',''wps-profile'',''payroll-hold''))';
 SELECT regexp_replace(pg_get_constraintdef(oid),'^CHECK ','')INTO STRICT definition FROM pg_constraint WHERE conrelid='erp_private.f11_child_receipts'::regclass AND conname='f11_child_receipts_operation_check';
 ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
 EXECUTE 'ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK('||definition||' OR(kind IN(''payroll-profile'',''salary-component'',''wps-profile'')AND action IN(''create'',''update'',''archive''))OR(kind=''salary-revision''AND action=''create'')OR(kind=''payroll-hold''AND action IN(''create'',''release'',''archive'')))';
END $$;
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()AND CASE WHEN p_kind IN('payroll-profile','salary-component','salary-revision','wps-profile','payroll-hold')THEN
 erp_private.employee_permission(p_employee,'hr.payroll.view')AND erp_private.employee_permission(p_employee,'hr.payroll.manage')AND(p_kind<>'wps-profile'OR(erp_private.employee_permission(p_employee,'hr.banking.view')AND erp_private.employee_permission(p_employee,'hr.banking.manage')))
 WHEN p_kind='site-readiness'THEN erp_private.employee_permission(p_employee,'hr.assignments.view')AND erp_private.employee_permission(p_employee,'hr.assignments.manage')AND erp_private.employee_permission(p_employee,'hr.compliance.view')AND erp_private.employee_permission(p_employee,'hr.medical.view')
 WHEN p_kind IN('assignment','asset','ppe','accommodation','operational-block','role-requirement','requirements-refresh')THEN erp_private.employee_permission(p_employee,'hr.assignments.view')AND erp_private.employee_permission(p_employee,'hr.assignments.manage')
 WHEN p_kind IN('eos-case','clearance')THEN (erp_private.employee_permission(p_employee,'hr.actions.view')OR erp_private.employee_permission(p_employee,'hr.eos.view'))AND(erp_private.employee_permission(p_employee,'hr.actions.manage')OR erp_private.employee_permission(p_employee,'hr.eos.manage'))
 ELSE p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval')AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage')))END,false)
$$;
CREATE FUNCTION erp_private.f11_payroll_columns(p_kind text)RETURNS text[]LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE p_kind WHEN'payroll-profile'THEN ARRAY['payroll_group_id','effective_date','currency','payroll_status','notes']WHEN'salary-component'THEN ARRAY['component_type_id','amount','effective_from','effective_to','is_active','notes']WHEN'salary-revision'THEN ARRAY['effective_date','revision_reason','new_gross','apply_to_components','fingerprint']WHEN'wps-profile'THEN ARRAY['wps_applicable','wps_status','bank_id','account_holder_name','exchange_house','salary_payment_method','labour_card_number','mohre_person_code','mohre_establishment_id','salary_effective_date','account_number','iban']WHEN'payroll-hold'THEN ARRAY['hold_reason','hold_date','notes']END
$$;
CREATE FUNCTION public.f11_salary_revision_opening(p_employee bigint)RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result text;BEGIN
 IF NOT erp_private.f11_child_authorized('salary-revision',p_employee)THEN RAISE EXCEPTION 'Current payroll access required' USING ERRCODE='42501';END IF;
 SELECT encode(sha256(convert_to(jsonb_build_array(coalesce((SELECT jsonb_agg(to_jsonb(c)ORDER BY c.id)FROM public.employee_salary_components c WHERE c.employee_id=p_employee AND c.deleted_at IS NULL),'[]'::jsonb),coalesce((SELECT jsonb_agg(jsonb_build_array(t.id,t.workspace_revision,t.is_basic,t.is_active,t.deleted_at)ORDER BY t.id)FROM public.hr_salary_component_types t),'[]'::jsonb))::text,'UTF8')),'hex')INTO result;RETURN result;
END $$;
CREATE FUNCTION erp_private.f11_validate_payroll(p_kind text,p_data jsonb)RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE columns text[]:=erp_private.f11_payroll_columns(p_kind);key text;value jsonb;number numeric;limit_length integer;
BEGIN
 IF columns IS NULL OR jsonb_typeof(p_data)IS DISTINCT FROM'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(columns))OR EXISTS(SELECT 1 FROM unnest(columns)k WHERE NOT p_data?k AND NOT(p_kind='wps-profile'AND k IN('account_number','iban')))THEN RAISE EXCEPTION 'Complete visible payroll fields required' USING ERRCODE='23514';END IF;
 FOR key,value IN SELECT * FROM jsonb_each(p_data)LOOP
  IF key IN('wps_applicable','is_active','apply_to_components')THEN IF jsonb_typeof(value)IS DISTINCT FROM'boolean'THEN RAISE EXCEPTION 'Invalid payroll flag' USING ERRCODE='23514';END IF;
  ELSIF key IN('payroll_group_id','component_type_id','bank_id','mohre_establishment_id')THEN
   IF value='null'::jsonb AND key<>'component_type_id'THEN CONTINUE;END IF;
   IF jsonb_typeof(value)IS DISTINCT FROM'number'OR(value#>>'{}')!~'^[1-9][0-9]*$'OR(value#>>'{}')::numeric>9007199254740991 THEN RAISE EXCEPTION 'Invalid payroll selection' USING ERRCODE='23514';END IF;
  ELSIF key IN('amount','new_gross')THEN
   IF jsonb_typeof(value)IS DISTINCT FROM'number'THEN RAISE EXCEPTION 'Invalid salary amount' USING ERRCODE='23514';END IF;
   number:=(value#>>'{}')::numeric;IF number<0 OR number>9999999999.99 OR number*100<>trunc(number*100)THEN RAISE EXCEPTION 'Use a nonnegative two-decimal salary amount' USING ERRCODE='23514';END IF;
  ELSIF key IN('effective_date','effective_from','effective_to','salary_effective_date','hold_date')THEN
   IF value='null'::jsonb AND key IN('effective_to','salary_effective_date')THEN CONTINUE;END IF;
   IF jsonb_typeof(value)IS DISTINCT FROM'string'OR(value#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RAISE EXCEPTION 'Invalid payroll date' USING ERRCODE='23514';END IF;PERFORM(value#>>'{}')::date;
  ELSE
   IF value='null'::jsonb AND key IN('notes','revision_reason','account_holder_name','exchange_house','labour_card_number','mohre_person_code','account_number','iban')THEN CONTINUE;END IF;
   IF jsonb_typeof(value)IS DISTINCT FROM'string'THEN RAISE EXCEPTION 'Invalid payroll text' USING ERRCODE='23514';END IF;
   limit_length:=CASE key WHEN'currency'THEN 10 WHEN'hold_reason'THEN 500 WHEN'notes'THEN CASE WHEN p_kind='payroll-profile'THEN 2000 ELSE 1000 END WHEN'revision_reason'THEN 1000 WHEN'account_number'THEN 50 WHEN'iban'THEN 34 WHEN'account_holder_name'THEN 200 WHEN'exchange_house'THEN 200 WHEN'labour_card_number'THEN 100 WHEN'mohre_person_code'THEN 100 ELSE 100 END;
   IF length(value#>>'{}')>limit_length OR(key IN('currency','hold_reason','account_number','iban')AND btrim(translate(value#>>'{}',chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(8195)||chr(12288),'        '))='')THEN RAISE EXCEPTION 'Invalid payroll text length or required wording' USING ERRCODE='23514';END IF;
  END IF;
 END LOOP;
 IF p_kind='payroll-profile'AND(p_data->>'payroll_status')NOT IN('active','hold','inactive','not_configured')OR p_kind='wps-profile'AND((p_data->>'wps_status')NOT IN('active','hold','exempt','not_enrolled')OR(p_data->>'salary_payment_method')NOT IN('bank_transfer','exchange_house','cheque')OR(left(p_data->>'iban',2)='AE'AND length(p_data->>'iban')<>23))OR p_kind='salary-component'AND(p_data->>'effective_to')::date<(p_data->>'effective_from')::date OR p_kind='salary-revision'AND(p_data->>'fingerprint')!~'^[0-9a-f]{64}$'THEN RAISE EXCEPTION 'Invalid payroll chronology, status or opening' USING ERRCODE='23514';END IF;
END $$;
CREATE FUNCTION erp_private.f11_capture_payroll_child()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actual_kind text;actor bigint;subject record;changed text[];subsidiary boolean:=false;row_data jsonb:=to_jsonb(NEW);
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 actual_kind:=CASE TG_TABLE_NAME WHEN'employee_payroll_profiles'THEN'payroll-profile'WHEN'employee_salary_components'THEN'salary-component'WHEN'employee_salary_revisions'THEN'salary-revision'WHEN'employee_wps_profiles'THEN'wps-profile'WHEN'employee_payroll_holds'THEN'payroll-hold'END;
 IF context IS NULL OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'OR NOT erp_private.f11_child_authorized(context->>'kind',NEW.employee_id)OR NOT erp_private.f11_child_authorized(actual_kind,NEW.employee_id)THEN RAISE EXCEPTION 'Original current payroll contract required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 subsidiary:=(context->>'kind'='salary-revision'AND actual_kind='salary-component')OR(context->>'kind'='payroll-hold'AND actual_kind='payroll-profile');
 IF NOT subsidiary AND context->>'kind'IS DISTINCT FROM actual_kind THEN RAISE EXCEPTION 'Payroll child kind mismatch' USING ERRCODE='42501';END IF;
 IF actual_kind<>'salary-revision'AND(row_data->>'updated_by')::bigint IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Current payroll actor required' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT'THEN
  IF NEW.created_by IS DISTINCT FROM actor OR NEW.workspace_revision<>1 OR(actual_kind<>'salary-revision'AND(row_data->>'deleted_at'IS NOT NULL OR row_data->>'deleted_by'IS NOT NULL))OR(actual_kind='salary-revision'AND row_data->>'approved_by'IS NOT NULL)THEN RAISE EXCEPTION 'Unrendered payroll attribution cannot be created' USING ERRCODE='23514';END IF;
 ELSE
  IF actual_kind='salary-revision'THEN RAISE EXCEPTION 'Salary revisions are append-only' USING ERRCODE='42501';END IF;
  IF OLD.deleted_at IS NOT NULL OR NOT subsidiary AND((context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision)THEN RAISE EXCEPTION 'Original payroll row changed' USING ERRCODE='P0409';END IF;
  IF subsidiary THEN changed:=CASE actual_kind WHEN'payroll-profile'THEN ARRAY['payroll_status']ELSE ARRAY['is_active','effective_to']END;
  ELSIF context->>'action'='archive'THEN changed:=ARRAY['deleted_at','deleted_by'];IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid payroll archive' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='release'AND actual_kind='payroll-hold'THEN
   changed:=ARRAY['is_active','release_date','released_by'];IF OLD.is_active IS DISTINCT FROM true OR NEW.is_active IS DISTINCT FROM false OR NEW.released_by IS DISTINCT FROM actor OR NEW.release_date IS NULL THEN RAISE EXCEPTION 'Invalid payroll hold release' USING ERRCODE='23514';END IF;
  ELSIF context->>'action'='update'THEN changed:=erp_private.f11_payroll_columns(actual_kind);
  ELSE RAISE EXCEPTION 'Invalid payroll transition' USING ERRCODE='23514';END IF;
  changed:=changed||ARRAY['workspace_revision','updated_by','updated_at'];IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Unrendered payroll facts changed' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 IF NOT subsidiary THEN INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)VALUES(auth.uid(),(context->>'operation_id')::uuid,actual_kind,context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)VALUES(actor,subject.owner_company_id,subject.branch_id,'HR',TG_TABLE_NAME,NEW.id,CASE WHEN subsidiary THEN'linked_payroll_change'ELSE context->>'action'END,jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision));
 RETURN NEW;
END $$;
DO $$DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['employee_payroll_profiles','employee_salary_components','employee_salary_revisions','employee_wps_profiles','employee_payroll_holds']LOOP EXECUTE format('CREATE TRIGGER f11_payroll_child_capture AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_payroll_child()',name);END LOOP;END $$;
CREATE FUNCTION public.f11_mutate_payroll_child(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE table_name text;receipt jsonb;digest text;existing jsonb;typed jsonb;actor bigint;target bigint;revision bigint;columns text[];column_sql text;context jsonb;basic numeric;basic_type bigint;component record;company bigint;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('payroll-profile','salary-component','salary-revision','wps-profile','payroll-hold')OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current payroll authority required' USING ERRCODE='42501';END IF;
 IF p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update','archive','release')OR jsonb_typeof(p_data)IS DISTINCT FROM'object'OR octet_length(p_data::text)>65536 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_revision IS NULL OR p_revision<1))OR(p_action IN('archive','release')AND p_data<>'{}')OR(p_kind='salary-revision'AND p_action<>'create')OR(p_action='release'AND p_kind<>'payroll-hold')OR(p_kind='payroll-hold'AND p_action='update')THEN RAISE EXCEPTION 'Invalid payroll operation contract' USING ERRCODE='22023';END IF;
 table_name:=CASE p_kind WHEN'payroll-profile'THEN'employee_payroll_profiles'WHEN'salary-component'THEN'employee_salary_components'WHEN'salary-revision'THEN'employee_salary_revisions'WHEN'wps-profile'THEN'employee_wps_profiles'ELSE'employee_payroll_holds'END;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;RETURN(receipt-'hash')||jsonb_build_object('replayed',true);END IF;
 SELECT owner_company_id INTO company FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 IF p_action<>'create'THEN
  EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND employee_id=$2 AND deleted_at IS NULL FOR UPDATE',table_name)INTO existing USING p_id,p_employee;
  IF existing IS NULL THEN RAISE EXCEPTION 'Original payroll row unavailable' USING ERRCODE='42501';END IF;
  IF(existing->>'workspace_revision')::bigint<>p_revision THEN RAISE EXCEPTION 'Payroll changed after opening' USING ERRCODE='P0409';END IF;
  IF p_action='release'AND(existing->>'is_active')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Hold already released' USING ERRCODE='23514';END IF;
 ELSIF p_kind IN('payroll-profile','wps-profile')THEN
  EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE employee_id=$1',table_name)INTO existing USING p_employee;
  IF existing IS NOT NULL THEN RAISE EXCEPTION 'An original profile already exists; reopen it' USING ERRCODE='P0409';END IF;
 END IF;
 IF p_action IN('create','update')THEN PERFORM erp_private.f11_validate_payroll(p_kind,p_data);END IF;
 IF NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current payroll authority changed' USING ERRCODE='42501';END IF;actor:=public.current_user_profile_id();
 IF p_kind='payroll-profile'AND p_data->>'payroll_group_id'IS NOT NULL AND p_data->>'payroll_group_id'IS DISTINCT FROM existing->>'payroll_group_id'AND NOT EXISTS(SELECT 1 FROM public.hr_payroll_groups WHERE id=(p_data->>'payroll_group_id')::bigint AND is_active AND deleted_at IS NULL)THEN RAISE EXCEPTION 'Current payroll group unavailable' USING ERRCODE='23514';END IF;
 IF p_kind='salary-component'AND p_action IN('create','update')AND p_data->>'component_type_id'IS DISTINCT FROM existing->>'component_type_id'AND NOT EXISTS(SELECT 1 FROM public.hr_salary_component_types WHERE id=(p_data->>'component_type_id')::bigint AND is_active AND deleted_at IS NULL)THEN RAISE EXCEPTION 'Current salary component type unavailable' USING ERRCODE='23514';END IF;
 IF p_kind='wps-profile'AND p_data->>'mohre_establishment_id'IS NOT NULL AND p_data->>'mohre_establishment_id'IS DISTINCT FROM existing->>'mohre_establishment_id'AND NOT EXISTS(SELECT 1 FROM public.hr_mohre_establishments WHERE id=(p_data->>'mohre_establishment_id')::bigint AND owner_company_id=company AND status='active'AND deleted_at IS NULL)THEN RAISE EXCEPTION 'Current company MOHRE establishment unavailable' USING ERRCODE='23514';END IF;
 context:=jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest);PERFORM set_config('erp.f11_child_save',context::text,true);
 columns:=erp_private.f11_payroll_columns(p_kind);typed:=coalesce(existing,'{}'::jsonb)||p_data||jsonb_build_object('employee_id',p_employee,'created_by',coalesce((existing->>'created_by')::bigint,actor),'updated_by',actor);
 IF p_kind='salary-revision'THEN
  PERFORM 1 FROM public.employee_salary_components WHERE employee_id=p_employee AND deleted_at IS NULL ORDER BY id FOR UPDATE;
  IF public.f11_salary_revision_opening(p_employee)IS DISTINCT FROM p_data->>'fingerprint'THEN RAISE EXCEPTION 'Salary components changed after opening' USING ERRCODE='P0409';END IF;
  SELECT coalesce(sum(c.amount),0)INTO basic FROM public.employee_salary_components c JOIN public.hr_salary_component_types t ON t.id=c.component_type_id WHERE c.employee_id=p_employee AND c.deleted_at IS NULL AND c.is_active AND t.is_basic;
  IF(p_data->>'apply_to_components')::boolean AND(p_data->>'new_gross')::numeric<>basic THEN
   SELECT c.component_type_id INTO basic_type FROM public.employee_salary_components c JOIN public.hr_salary_component_types t ON t.id=c.component_type_id WHERE c.employee_id=p_employee AND c.deleted_at IS NULL AND c.is_active AND t.is_basic ORDER BY c.id LIMIT 1;
   IF basic_type IS NULL THEN SELECT id INTO basic_type FROM public.hr_salary_component_types WHERE is_basic AND is_active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1;END IF;
   IF basic_type IS NULL THEN RAISE EXCEPTION 'No current Basic Salary component type available' USING ERRCODE='23514';END IF;
   -- Existing supersession convention retained; F14 effective-date policy is not redesigned here.
   UPDATE public.employee_salary_components c SET is_active=false,effective_to=greatest(c.effective_from,(p_data->>'effective_date')::date-1),updated_by=actor FROM public.hr_salary_component_types t WHERE c.component_type_id=t.id AND c.employee_id=p_employee AND c.is_active AND c.deleted_at IS NULL AND t.is_basic;
   INSERT INTO public.employee_salary_components(employee_id,component_type_id,amount,effective_from,is_active,notes,created_by,updated_by)VALUES(p_employee,basic_type,(p_data->>'new_gross')::numeric,(p_data->>'effective_date')::date,true,'Applied from salary revision',actor,actor);
  END IF;
  typed:=(typed-'fingerprint'-'apply_to_components'-'updated_by')||jsonb_build_object('old_gross',basic,'approved_by',NULL);columns:=ARRAY['effective_date','revision_reason','old_gross','new_gross','approved_by'];
 ELSIF p_kind='payroll-hold'THEN
  IF p_action='release'THEN UPDATE public.employee_payroll_holds SET is_active=false,release_date=(current_timestamp AT TIME ZONE 'UTC')::date,released_by=actor,updated_by=actor WHERE id=p_id RETURNING id,workspace_revision INTO target,revision;
  ELSIF p_action='create'THEN typed:=typed||jsonb_build_object('is_active',true);END IF;
 END IF;
 IF target IS NULL THEN
  IF p_action='archive'THEN EXECUTE format('UPDATE public.%I SET deleted_at=clock_timestamp(),deleted_by=$1,updated_by=$1 WHERE id=$2 RETURNING id,workspace_revision',table_name)INTO target,revision USING actor,p_id;
  ELSE
   SELECT string_agg(format('%I',name),',')INTO column_sql FROM unnest(columns)name;
   IF p_action='create'THEN
    column_sql:=column_sql||',employee_id,created_by'||CASE WHEN p_kind='salary-revision'THEN''ELSE',updated_by'END;
    EXECUTE format('INSERT INTO public.%I(%s)SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)RETURNING id,workspace_revision',table_name,column_sql,column_sql,table_name)INTO target,revision USING typed;
   ELSE EXECUTE format('UPDATE public.%I SET(%s,updated_by)=(SELECT %s,updated_by FROM jsonb_populate_record(NULL::public.%I,$1))WHERE id=$2 RETURNING id,workspace_revision',table_name,column_sql,column_sql,table_name)INTO target,revision USING typed,p_id;END IF;
  END IF;
 END IF;
 IF p_kind='payroll-hold'THEN
  IF p_action='create'THEN UPDATE public.employee_payroll_profiles SET payroll_status='hold',updated_by=actor WHERE employee_id=p_employee AND deleted_at IS NULL AND payroll_status<>'hold';
  ELSIF p_action='release'AND NOT EXISTS(SELECT 1 FROM public.employee_payroll_holds WHERE employee_id=p_employee AND is_active AND deleted_at IS NULL)THEN UPDATE public.employee_payroll_profiles SET payroll_status='active',updated_by=actor WHERE employee_id=p_employee AND deleted_at IS NULL AND payroll_status='hold';END IF;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);IF target IS NULL OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Payroll save not confirmed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_payroll_columns(text),erp_private.f11_validate_payroll(text,jsonb),erp_private.f11_capture_payroll_child(),public.f11_salary_revision_opening(bigint),public.f11_mutate_payroll_child(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_payroll_columns(text),erp_private.f11_validate_payroll(text,jsonb),public.f11_salary_revision_opening(bigint),public.f11_mutate_payroll_child(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
