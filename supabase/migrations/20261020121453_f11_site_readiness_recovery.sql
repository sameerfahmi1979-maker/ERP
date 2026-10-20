BEGIN;
ALTER TABLE public.employee_site_readiness ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
GRANT SELECT(workspace_revision)ON public.employee_site_readiness TO authenticated;
REVOKE DELETE ON public.employee_site_readiness FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f04_site_readiness_revision BEFORE INSERT OR UPDATE ON public.employee_site_readiness FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK(kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval','eos-case','clearance','assignment','asset','ppe','accommodation','operational-block','role-requirement','requirements-refresh','site-readiness'));
ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK((kind='hr-note'AND action IN('create','archive'))OR(kind='pro-process'AND action IN('create','update','archive'))OR(kind='hr-action'AND action IN('create','update','archive','close','cancel'))OR(kind='performance'AND action IN('create','update','archive','submit','approve','close'))OR(kind='disciplinary'AND action IN('create','update','archive','acknowledge','correct-acknowledgement','close'))OR(kind='approval'AND action IN('create','approve','reject','cancel','archive'))OR(kind='eos-case'AND action IN('create','update','archive','set-status'))OR(kind='clearance'AND action IN('create','update','clear','block','archive'))OR(kind='assignment'AND action IN('create','update','archive'))OR(kind IN('asset','ppe')AND action IN('create','update','archive','return'))OR(kind='accommodation'AND action IN('create','update','archive','end'))OR(kind='operational-block'AND action IN('create','release','archive'))OR(kind='role-requirement'AND action IN('create','update','waive','archive'))OR(kind='requirements-refresh'AND action='create')OR(kind='site-readiness'AND action IN('create','update')));
CREATE OR REPLACE FUNCTION erp_private.f11_child_authorized(p_kind text,p_employee bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(auth.uid()IS NOT NULL AND erp_private.business_principal_is_active()AND CASE WHEN p_kind='site-readiness'THEN
 erp_private.employee_permission(p_employee,'hr.assignments.view')AND erp_private.employee_permission(p_employee,'hr.assignments.manage')AND erp_private.employee_permission(p_employee,'hr.compliance.view')AND erp_private.employee_permission(p_employee,'hr.medical.view')
 WHEN p_kind IN('assignment','asset','ppe','accommodation','operational-block','role-requirement','requirements-refresh')THEN
 erp_private.employee_permission(p_employee,'hr.assignments.view')AND erp_private.employee_permission(p_employee,'hr.assignments.manage')
 WHEN p_kind IN('eos-case','clearance')THEN
 (erp_private.employee_permission(p_employee,'hr.actions.view')OR erp_private.employee_permission(p_employee,'hr.eos.view'))AND(erp_private.employee_permission(p_employee,'hr.actions.manage')OR erp_private.employee_permission(p_employee,'hr.eos.manage'))
 ELSE p_kind IN('hr-note','pro-process','hr-action','performance','disciplinary','approval')AND erp_private.employee_permission(p_employee,'hr.actions.view')AND erp_private.employee_permission(p_employee,'hr.actions.manage')
 AND(p_kind NOT IN('hr-note','performance','disciplinary')OR(erp_private.employee_permission(p_employee,'hr.confidential.view')AND erp_private.employee_permission(p_employee,'hr.confidential.manage')))END,false)
$$;
-- All reads remain ordinary-actor/RLS reads. Missing authority is not an empty healthy source.
-- The snapshot is one statement's complete recorded-data view, not a future site-clearance guarantee.
CREATE FUNCTION erp_private.f11_readiness_sources(p_employee bigint,p_site bigint)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE subject record;site record;result jsonb;
BEGIN
 IF p_employee IS NULL OR p_employee<1 OR p_site IS NULL OR p_site<1 OR NOT erp_private.f11_child_authorized('site-readiness',p_employee)THEN RAISE EXCEPTION 'Current complete-source authority required' USING ERRCODE='42501';END IF;
 SELECT id,owner_company_id,branch_id,workspace_revision INTO subject FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 SELECT id,owner_company_id,branch_id,updated_at INTO site FROM public.work_sites WHERE id=p_site AND deleted_at IS NULL AND status='active';
 IF NOT FOUND OR site.owner_company_id IS DISTINCT FROM subject.owner_company_id OR(site.branch_id IS NOT NULL AND site.branch_id IS DISTINCT FROM subject.branch_id)THEN RAISE EXCEPTION 'Current site unavailable within employee scope' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('day',(current_timestamp AT TIME ZONE 'UTC')::date,'employee',to_jsonb(subject),'site',to_jsonb(site),
 'readiness',(SELECT to_jsonb(r)FROM public.employee_site_readiness r WHERE r.employee_id=p_employee AND r.work_site_id=p_site),
 'assignments',coalesce((SELECT jsonb_agg(to_jsonb(r)ORDER BY r.id)FROM public.employee_assignments r WHERE r.employee_id=p_employee AND r.deleted_at IS NULL),'[]'::jsonb),
 'blocks',coalesce((SELECT jsonb_agg(to_jsonb(r)ORDER BY r.id)FROM public.employee_operational_blocks r WHERE r.employee_id=p_employee AND r.deleted_at IS NULL),'[]'::jsonb),
 'requirements',coalesce((SELECT jsonb_agg(to_jsonb(r)ORDER BY r.id)FROM public.employee_role_requirements r WHERE r.employee_id=p_employee AND r.deleted_at IS NULL),'[]'::jsonb),
 'identity',(SELECT to_jsonb(r)FROM public.employee_identity_documents r WHERE r.employee_id=p_employee AND r.deleted_at IS NULL ORDER BY r.created_at DESC,r.id DESC LIMIT 1),
 'access',(SELECT to_jsonb(r)FROM public.employee_access_cards r WHERE r.employee_id=p_employee AND r.work_site_id=p_site AND r.deleted_at IS NULL ORDER BY r.created_at DESC,r.id DESC LIMIT 1),
 'medical',(SELECT to_jsonb(r)FROM public.employee_medical_records r WHERE r.employee_id=p_employee AND r.deleted_at IS NULL ORDER BY r.created_at DESC,r.id DESC LIMIT 1),
 'insurance',(SELECT to_jsonb(r)FROM public.employee_medical_insurances r WHERE r.employee_id=p_employee AND r.deleted_at IS NULL ORDER BY r.created_at DESC,r.id DESC LIMIT 1))INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.f11_site_readiness_opening(p_employee bigint,p_site bigint)RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('work_site_id',p_site,'fingerprint',encode(sha256(convert_to(erp_private.f11_readiness_sources(p_employee,p_site)::text,'UTF8')),'hex'))
$$;
-- Same existing readiness codes/severity/precedence; no guessed training, access or evidence policy.
CREATE FUNCTION erp_private.f11_calculate_readiness(s jsonb)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE missing jsonb:='[]';status text;blocks integer;required_card boolean:=(s#>>'{readiness,required_access_card_type_id}')IS NOT NULL;day date:=(s->>'day')::date;expired_count integer;missing_count integer;
BEGIN
 SELECT count(*)INTO blocks FROM jsonb_array_elements(s->'blocks')r WHERE r->>'block_status'='active'AND(r->>'effective_from')::date<=day AND((r->>'effective_to')IS NULL OR(r->>'effective_to')::date>=day);
 IF blocks>0 THEN RETURN jsonb_build_object('status','blocked','missing',jsonb_build_array(jsonb_build_object('code','ACTIVE_BLOCK','label',blocks||' active operational block(s) preventing readiness','category','block','severity','critical')));END IF;
 IF(s#>>'{identity,expiry_date}')::date<day THEN missing:=missing||jsonb_build_object('code','IDENTITY_EXPIRED','label','Identity document has expired','category','document','severity','critical');END IF;
 IF required_card AND(s#>>'{access,expiry_date}')::date<day THEN missing:=missing||jsonb_build_object('code','ACCESS_CARD_EXPIRED','label','Site access card has expired','category','access_card','severity','critical');END IF;
 IF(s#>>'{medical,expiry_date}')::date<day THEN missing:=missing||jsonb_build_object('code','MEDICAL_EXPIRED','label','Medical fitness certificate has expired','category','medical','severity','critical');END IF;
 IF(s#>>'{insurance,expiry_date}')::date<day THEN missing:=missing||jsonb_build_object('code','INSURANCE_EXPIRED','label','Medical insurance has expired','category','medical','severity','warning');END IF;
 SELECT count(*)INTO expired_count FROM jsonb_array_elements(s->'requirements')r WHERE(r->>'is_required')::boolean AND r->>'status'NOT IN('waived','not_required')AND(r->>'expiry_date')::date<day;
 IF expired_count>0 THEN missing:=missing||jsonb_build_object('code','ROLE_REQ_EXPIRED','label',expired_count||' role requirement(s) expired','category','document','severity','critical');END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(missing)r WHERE r->>'severity'='critical')THEN RETURN jsonb_build_object('status','expired','missing',missing);END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'assignments')r WHERE r->>'assignment_status'='active'AND(r->>'work_site_id')::bigint=(s#>>'{site,id}')::bigint AND(r->>'effective_from')::date<=day AND((r->>'effective_to')IS NULL OR(r->>'effective_to')::date>=day))THEN missing:=missing||jsonb_build_object('code','NO_ASSIGNMENT','label','No current active assignment','category','assignment','severity','info');END IF;
 IF s->'identity'='null'::jsonb THEN missing:=missing||jsonb_build_object('code','MISSING_IDENTITY','label','No valid identity document on record','category','document','severity','critical');END IF;
 IF required_card AND(s->'access'='null'::jsonb OR(s#>>'{access,access_card_type_id}')IS DISTINCT FROM(s#>>'{readiness,required_access_card_type_id}'))THEN missing:=missing||jsonb_build_object('code','MISSING_ACCESS_CARD','label','Required site access card not issued','category','access_card','severity','critical');END IF;
 IF s->'medical'='null'::jsonb OR NOT coalesce((s#>>'{medical,fit_for_work}')::boolean,false)THEN missing:=missing||jsonb_build_object('code','MISSING_MEDICAL','label','Medical fitness status: missing','category','medical','severity','warning');END IF;
 IF coalesce((s#>>'{medical,work_restrictions}')::boolean,false)OR s#>>'{medical,result}'='unfit'THEN missing:=missing||jsonb_build_object('code','MEDICAL_RESTRICTED','label','Medical fitness status: restricted','category','medical','severity','warning');END IF;
 SELECT count(*)INTO missing_count FROM jsonb_array_elements(s->'requirements')r WHERE(r->>'is_required')::boolean AND r->>'status'NOT IN('waived','not_required','met')AND NOT(r->>'is_met')::boolean;
 IF missing_count>0 THEN missing:=missing||jsonb_build_object('code','ROLE_REQ_MISSING','label',missing_count||' critical role requirement(s) not met','category','document','severity','critical');END IF;
 status:=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(missing)r WHERE r->>'severity'='critical')THEN'not_ready'WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(missing)r WHERE r->>'severity'='warning')THEN'needs_review'ELSE'ready'END;
 RETURN jsonb_build_object('status',status,'missing',missing);
END $$;
CREATE FUNCTION erp_private.f11_capture_site_readiness()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;actor bigint;subject record;changed text[];
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF context IS NULL OR context->>'kind'IS DISTINCT FROM'site-readiness'OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'OR NOT erp_private.f11_child_authorized('site-readiness',NEW.employee_id)THEN RAISE EXCEPTION 'Original current readiness contract required' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF NEW.updated_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Current readiness actor required' USING ERRCODE='23514';END IF;
 IF context->>'action'='create'THEN
  IF NEW.checked_by IS DISTINCT FROM actor OR NEW.work_site_id IS DISTINCT FROM(context->>'site_id')::bigint OR NEW.readiness_status IS DISTINCT FROM(context#>>'{computed,status}')OR coalesce(NEW.missing_requirements_json,'[]')IS DISTINCT FROM(context#>'{computed,missing}')THEN RAISE EXCEPTION 'Only the server calculation can be saved' USING ERRCODE='23514';END IF;
  changed:=ARRAY['workspace_revision','readiness_status','missing_requirements_json','checked_at','checked_by','updated_by','updated_at'];
  IF TG_OP='INSERT'THEN
   IF NEW.created_by IS DISTINCT FROM actor OR NEW.notes IS NOT NULL OR NEW.required_access_card_type_id IS NOT NULL OR NEW.access_card_record_id IS NOT NULL OR NEW.medical_record_id IS NOT NULL OR NEW.training_record_ids IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN RAISE EXCEPTION 'Unrendered readiness configuration cannot be created' USING ERRCODE='23514';END IF;
  END IF;
 ELSIF context->>'action'='update'AND TG_OP='UPDATE'THEN changed:=ARRAY['workspace_revision','notes','updated_by','updated_at'];
 ELSE RAISE EXCEPTION 'Unsupported readiness mutation' USING ERRCODE='22023';END IF;
 IF TG_OP='UPDATE'THEN
  IF OLD.deleted_at IS NOT NULL OR(context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision THEN RAISE EXCEPTION 'Readiness changed after opening' USING ERRCODE='P0409';END IF;
  IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Readiness history/configuration must remain intact' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)VALUES(auth.uid(),(context->>'operation_id')::uuid,'site-readiness',context->>'action',NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_site_readiness',NEW.id,CASE WHEN context->>'action'='create'THEN'site_readiness_recalculated'ELSE'notes_updated'END,jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision));
 RETURN NEW;
END $$;
CREATE TRIGGER f11_site_readiness_capture AFTER INSERT OR UPDATE ON public.employee_site_readiness FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_site_readiness();
CREATE FUNCTION public.f11_mutate_site_readiness(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;digest text;snapshot jsonb;computed jsonb;original public.employee_site_readiness;target bigint;revision bigint;site bigint;actor bigint;
BEGIN
 IF p_kind IS DISTINCT FROM'site-readiness'OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN('create','update')OR jsonb_typeof(p_data)IS DISTINCT FROM'object'OR octet_length(p_data::text)>65536 OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action='update'AND(p_id IS NULL OR p_id<1 OR p_revision IS NULL OR p_revision<1))THEN RAISE EXCEPTION 'Invalid readiness contract' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current employee access changed' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF p_action='create'THEN
  IF NOT p_data?&ARRAY['work_site_id','fingerprint']OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>ALL(ARRAY['work_site_id','fingerprint']))OR jsonb_typeof(p_data->'work_site_id')IS DISTINCT FROM'number'OR(p_data->>'work_site_id')!~'^[1-9][0-9]*$'OR(p_data->>'work_site_id')::numeric>9007199254740991 OR jsonb_typeof(p_data->'fingerprint')IS DISTINCT FROM'string'OR(p_data->>'fingerprint')!~'^[0-9a-f]{64}$'THEN RAISE EXCEPTION 'Invalid readiness opening' USING ERRCODE='23514';END IF;
  site:=(p_data->>'work_site_id')::bigint;
  SELECT * INTO original FROM public.employee_site_readiness WHERE employee_id=p_employee AND work_site_id=site FOR UPDATE;
  IF original.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Archived readiness cannot be revived by recalculation' USING ERRCODE='23514';END IF;
  snapshot:=erp_private.f11_readiness_sources(p_employee,site);
  IF encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')IS DISTINCT FROM p_data->>'fingerprint'THEN RAISE EXCEPTION 'Readiness sources changed after opening' USING ERRCODE='P0409';END IF;
  computed:=erp_private.f11_calculate_readiness(snapshot);
 ELSE
  IF NOT p_data?'notes'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE k<>'notes')OR jsonb_typeof(p_data->'notes')NOT IN('string','null')OR length(p_data->>'notes')>5000 THEN RAISE EXCEPTION 'Invalid readiness notes' USING ERRCODE='23514';END IF;
  SELECT * INTO original FROM public.employee_site_readiness WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original readiness unavailable' USING ERRCODE='42501';END IF;
  IF original.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Readiness changed after opening' USING ERRCODE='P0409';END IF;
 END IF;
 IF NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current readiness authority changed' USING ERRCODE='42501';END IF;
 PERFORM set_config('erp.f11_child_save',jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',original.id,'revision',original.workspace_revision,'site_id',site,'computed',computed,'operation_id',p_operation,'action',p_action,'hash',digest)::text,true);
 IF p_action='update'THEN UPDATE public.employee_site_readiness r SET notes=p_data->>'notes',updated_by=actor WHERE r.id=original.id RETURNING r.id,r.workspace_revision INTO target,revision;
 ELSIF original.id IS NOT NULL THEN UPDATE public.employee_site_readiness r SET readiness_status=computed->>'status',missing_requirements_json=nullif(computed->'missing','[]'),checked_at=clock_timestamp(),checked_by=actor,updated_by=actor WHERE r.id=original.id RETURNING r.id,r.workspace_revision INTO target,revision;
 ELSE INSERT INTO public.employee_site_readiness(employee_id,work_site_id,readiness_status,missing_requirements_json,checked_at,checked_by,created_by,updated_by)VALUES(p_employee,site,computed->>'status',nullif(computed->'missing','[]'),clock_timestamp(),actor,actor,actor)RETURNING id,workspace_revision INTO target,revision;END IF;
 PERFORM set_config('erp.f11_child_save','',true);
 IF target IS NULL OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Readiness save not confirmed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_readiness_sources(bigint,bigint),erp_private.f11_calculate_readiness(jsonb),erp_private.f11_capture_site_readiness(),public.f11_site_readiness_opening(bigint,bigint),public.f11_mutate_site_readiness(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_readiness_sources(bigint,bigint),erp_private.f11_calculate_readiness(jsonb),public.f11_site_readiness_opening(bigint,bigint),public.f11_mutate_site_readiness(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
