BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$DECLARE name text;definition text;BEGIN
 FOREACH name IN ARRAY ARRAY['employee_identity_documents','employee_medical_insurances','employee_access_cards','employee_training_certificates','employee_medical_records'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0)',name);
  EXECUTE format('GRANT SELECT(workspace_revision) ON public.%I TO authenticated',name);
  EXECUTE format('REVOKE DELETE ON public.%I FROM PUBLIC,anon,authenticated',name);
  EXECUTE format('CREATE TRIGGER f04_compliance_revision BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision()',name);
 END LOOP;
 SELECT regexp_replace(pg_get_constraintdef(oid),'^CHECK ','')INTO STRICT definition FROM pg_constraint WHERE conrelid='erp_private.f11_child_receipts'::regclass AND conname='f11_child_receipts_kind_check';
 ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
 EXECUTE 'ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK('||definition||'OR kind IN(''identity-document'',''medical-insurance'',''access-card'',''training-certificate'',''medical-record''))';
 SELECT regexp_replace(pg_get_constraintdef(oid),'^CHECK ','')INTO STRICT definition FROM pg_constraint WHERE conrelid='erp_private.f11_child_receipts'::regclass AND conname='f11_child_receipts_operation_check';
 ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
 EXECUTE 'ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK('||definition||'OR(kind IN(''identity-document'',''medical-insurance'',''access-card'',''training-certificate'',''medical-record'')AND action IN(''create'',''update'',''archive'',''verify'',''renewal'')))';
 SELECT pg_get_functiondef('erp_private.f11_child_authorized(text,bigint)'::regprocedure)INTO definition;
 IF position('CASE WHEN p_kind IN(''attendance-summary'''IN definition)=0 THEN RAISE EXCEPTION 'Previous authority identity mismatch';END IF;
 definition:=replace(definition,'CASE WHEN p_kind IN(''attendance-summary''','CASE WHEN p_kind IN(''identity-document'',''access-card'',''training-certificate'')THEN erp_private.employee_permission(p_employee,''hr.compliance.view'')AND erp_private.employee_permission(p_employee,''hr.compliance.manage'')WHEN p_kind IN(''medical-insurance'',''medical-record'')THEN erp_private.employee_permission(p_employee,''hr.medical.view'')AND erp_private.employee_permission(p_employee,''hr.medical.manage'')WHEN p_kind IN(''attendance-summary''');
 EXECUTE definition;
END$$;
CREATE FUNCTION erp_private.f11_compliance_columns(p_kind text)RETURNS text[]LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ SELECT CASE p_kind WHEN 'identity-document' THEN ARRAY['document_type_id','document_number','issue_date','expiry_date','issuing_authority','issuing_authority_party_id','issue_country_id','issuing_emirate_id','issue_city_id','status','verification_status','renewal_status','emirates_id_application_no','visa_file_number','uid_number','labour_card_number','work_permit_number','mohre_person_code','profession_on_document','sponsor_company_id','place_of_issue','notes','dms_document_id']
WHEN 'medical-insurance' THEN ARRAY['insurance_provider','tpa','policy_number','insurance_card_number','network_class','issue_date','expiry_date','employee_covered','dependent_coverage_included','dependent_count_covered','status','verification_status','renewal_status','notes','dms_document_id']
WHEN 'access-card' THEN ARRAY['access_type_id','client_authority','work_site_id','card_number','application_reference','issue_date','expiry_date','status','renewal_status','notes','dms_document_id']
WHEN 'training-certificate' THEN ARRAY['training_category_id','training_type_id','provider','approval_body','certificate_number','completion_date','expiry_date','required_for_designation','required_for_site','status','verification_status','notes','dms_document_id']
WHEN 'medical-record' THEN ARRAY['medical_record_type_id','medical_center','report_number','examination_date','result','fit_for_work','work_restrictions','restriction_details','next_examination_date','required_for_visa','required_for_site','required_for_noc','notes','dms_document_id'] END $$;
CREATE FUNCTION erp_private.f11_compliance_table(p_kind text)RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ SELECT CASE p_kind WHEN 'identity-document' THEN 'employee_identity_documents'
WHEN 'medical-insurance' THEN 'employee_medical_insurances'
WHEN 'access-card' THEN 'employee_access_cards'
WHEN 'training-certificate' THEN 'employee_training_certificates'
WHEN 'medical-record' THEN 'employee_medical_records' END $$;
CREATE FUNCTION erp_private.f11_validate_compliance(p_kind text,p_action text,p_data jsonb)RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed text[];key text;value jsonb;typ oid;d text;BEGIN
 allowed:=CASE WHEN p_action IN('archive','verify')THEN ARRAY[]::text[] WHEN p_action='renewal'THEN ARRAY['renewal_status']ELSE erp_private.f11_compliance_columns(p_kind)||ARRAY['source_document_ids','entry_source']END;
 IF allowed IS NULL OR jsonb_typeof(p_data)IS DISTINCT FROM'object'OR octet_length(p_data::text)>65536 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE NOT k=ANY(allowed))OR p_action NOT IN('create','update','archive','verify','renewal')OR p_action='verify'AND p_kind NOT IN('identity-document','medical-insurance','training-certificate')OR p_action='renewal'AND p_kind NOT IN('identity-document','medical-insurance','access-card')THEN RAISE EXCEPTION 'Invalid compliance command' USING ERRCODE='22023';END IF;
 FOR key,value IN SELECT *FROM jsonb_each(p_data)LOOP
  IF key='entry_source'THEN IF p_action<>'create'OR value<>'"document"'::jsonb THEN RAISE EXCEPTION 'Invalid document entry' USING ERRCODE='22023';END IF;CONTINUE;END IF;
  IF key='source_document_ids'THEN
   IF jsonb_typeof(value)<>'array'OR jsonb_array_length(value)>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(value)v WHERE jsonb_typeof(v)<>'number'OR(v::text)::numeric<1 OR(v::text)::numeric>9007199254740991 OR(v::text)::numeric<>trunc((v::text)::numeric))OR jsonb_array_length(value)<>(SELECT count(DISTINCT v)FROM jsonb_array_elements(value)v)THEN RAISE EXCEPTION 'Invalid source documents' USING ERRCODE='22023';END IF;CONTINUE;
  END IF;
  IF value='null'::jsonb THEN CONTINUE;END IF;
  SELECT atttypid INTO typ FROM pg_catalog.pg_attribute WHERE attrelid=('public.'||erp_private.f11_compliance_table(p_kind))::regclass AND attname=key AND NOT attisdropped;
  IF typ='date'::regtype THEN
   d:=value#>>'{}';IF jsonb_typeof(value)<>'string'OR d!~'^\d{4}-\d{2}-\d{2}$'THEN RAISE EXCEPTION 'Invalid compliance date' USING ERRCODE='23514';END IF;
   BEGIN PERFORM d::date;EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid calendar date' USING ERRCODE='23514';END;
  ELSIF typ='boolean'::regtype THEN IF jsonb_typeof(value)<>'boolean'THEN RAISE EXCEPTION 'Invalid compliance flag' USING ERRCODE='23514';END IF;
  ELSIF typ IN('bigint'::regtype,'integer'::regtype)THEN
   IF jsonb_typeof(value)<>'number'OR(value::text)::numeric<>trunc((value::text)::numeric)OR(value::text)::numeric>(CASE WHEN typ='integer'::regtype THEN 2147483647 ELSE 9007199254740991 END)OR(value::text)::numeric<(CASE WHEN key='dependent_count_covered'THEN 0 ELSE 1 END)THEN RAISE EXCEPTION 'Invalid compliance reference or number' USING ERRCODE='23514';END IF;
  ELSIF typ='text'::regtype THEN IF jsonb_typeof(value)<>'string'OR length(value#>>'{}')>10000 THEN RAISE EXCEPTION 'Invalid compliance wording' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Unrecognized compliance field' USING ERRCODE='23514';END IF;
 END LOOP;
 IF p_action='renewal'AND(NOT p_data?'renewal_status'OR p_data->>'renewal_status'IS NULL OR p_data->>'renewal_status'NOT IN('not_required','pending','in_progress','complete'))THEN RAISE EXCEPTION 'Invalid renewal status' USING ERRCODE='23514';END IF;
END$$;
CREATE TABLE erp_private.f11_compliance_admissions(transaction_id xid8 NOT NULL,actor uuid NOT NULL,operation_id uuid NOT NULL,kind text NOT NULL,employee_id bigint NOT NULL,record_id bigint,revision bigint,action text NOT NULL,request_hash text NOT NULL,payload_hash text NOT NULL,columns text[]NOT NULL,documents bigint[]NOT NULL,PRIMARY KEY(transaction_id,actor,operation_id));
ALTER TABLE erp_private.f11_compliance_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f11_compliance_admissions FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f11_admit_compliance(p_context jsonb,p_data jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text:=p_context->>'kind';emp bigint:=(p_context->>'employee_id')::bigint;op uuid:=(p_context->>'operation_id')::uuid;digest text;BEGIN
 IF auth.uid()IS NULL OR NOT erp_private.f11_child_authorized(k,emp)THEN RAISE EXCEPTION 'Current compliance authority required' USING ERRCODE='42501';END IF;
 PERFORM erp_private.f11_validate_compliance(k,p_context->>'action',p_data);
 digest:=encode(sha256(convert_to(jsonb_build_array(k,emp,(p_context->>'id')::bigint,(p_context->>'revision')::bigint,p_context->>'action',p_data)::text,'UTF8')),'hex');
 IF digest IS DISTINCT FROM p_context->>'hash'THEN RAISE EXCEPTION 'Compliance admission identity mismatch' USING ERRCODE='22023';END IF;
 INSERT INTO erp_private.f11_compliance_admissions VALUES(pg_current_xact_id(),auth.uid(),op,k,emp,(p_context->>'id')::bigint,(p_context->>'revision')::bigint,p_context->>'action',digest,encode(sha256(convert_to((p_data-'source_document_ids'-'entry_source')::text,'UTF8')),'hex'),ARRAY(SELECT key FROM jsonb_object_keys(p_data-'source_document_ids'-'entry_source')key ORDER BY key),ARRAY(SELECT DISTINCT x::bigint FROM jsonb_array_elements_text(coalesce(p_data->'source_document_ids','[]'::jsonb))x ORDER BY x::bigint));
END$$;
CREATE FUNCTION erp_private.f11_compliance_reference_facts(p_kind text,p_employee bigint,p_new jsonb,p_old jsonb,p_action text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE table_name text:=erp_private.f11_compliance_table(p_kind);ref record;choice jsonb;company bigint;type_row jsonb;normal text;duplicate boolean;number_field text;type_field text;BEGIN
 IF NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current compliance reference authority required' USING ERRCODE='42501';END IF;
 IF p_action NOT IN('create','update')THEN RETURN;END IF;
 SELECT owner_company_id INTO company FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;
 IF company IS NULL THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 FOR ref IN SELECT a.attname,n.nspname,c.relname FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=f.conkey[1]JOIN pg_class c ON c.oid=f.confrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE f.contype='f'AND f.conrelid=('public.'||table_name)::regclass AND cardinality(f.conkey)=1 LOOP
  IF ref.attname=ANY(erp_private.f11_compliance_columns(p_kind))AND p_new->>ref.attname IS NOT NULL AND p_new->>ref.attname IS DISTINCT FROM p_old->>ref.attname AND ref.attname<>'dms_document_id'THEN
   EXECUTE format('SELECT to_jsonb(r)FROM %I.%I r WHERE id=$1',ref.nspname,ref.relname)INTO choice USING(p_new->>ref.attname)::bigint;
   IF choice IS NULL OR choice->>'deleted_at'IS NOT NULL OR choice->>'is_active'='false'OR choice->>'owner_company_id'IS NOT NULL AND(choice->>'owner_company_id')::bigint<>company THEN RAISE EXCEPTION 'Active compatible reference required' USING ERRCODE='23514';END IF;
  END IF;
 END LOOP;
 IF p_kind='identity-document'THEN
  SELECT to_jsonb(t)INTO type_row FROM public.hr_identity_document_types t WHERE id=(p_new->>'document_type_id')::bigint;
  IF (type_row->>'requires_issue_date')::boolean AND p_new->>'issue_date'IS NULL OR(type_row->>'requires_expiry_date')::boolean AND p_new->>'expiry_date'IS NULL THEN RAISE EXCEPTION 'Required identity dates missing' USING ERRCODE='23514';END IF;
  IF p_action='create'OR p_new->'issue_country_id'IS DISTINCT FROM p_old->'issue_country_id'OR p_new->'issuing_emirate_id'IS DISTINCT FROM p_old->'issuing_emirate_id'OR p_new->'issue_city_id'IS DISTINCT FROM p_old->'issue_city_id'THEN
   IF p_new->>'issuing_emirate_id'IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.emirates WHERE id=(p_new->>'issuing_emirate_id')::bigint AND country_id=(p_new->>'issue_country_id')::bigint)OR p_new->>'issue_city_id'IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cities WHERE id=(p_new->>'issue_city_id')::bigint AND emirate_id=(p_new->>'issuing_emirate_id')::bigint)THEN RAISE EXCEPTION 'Incompatible identity geography' USING ERRCODE='23514';END IF;
  END IF;
 ELSIF p_kind='access-card'THEN
  SELECT to_jsonb(t)INTO type_row FROM public.hr_access_card_types t WHERE id=(p_new->>'access_type_id')::bigint;
  IF(type_row->>'requires_work_site')::boolean AND p_new->>'work_site_id'IS NULL OR(type_row->>'requires_client_authority')::boolean AND nullif(btrim(p_new->>'client_authority'),'')IS NULL THEN RAISE EXCEPTION 'Required access-card facts missing' USING ERRCODE='23514';END IF;
 ELSIF p_kind='training-certificate'THEN
  SELECT to_jsonb(t)INTO type_row FROM public.hr_training_types t WHERE id=(p_new->>'training_type_id')::bigint;
  IF(type_row->>'requires_certificate_number')::boolean AND nullif(btrim(p_new->>'certificate_number'),'')IS NULL OR(type_row->>'requires_provider')::boolean AND nullif(btrim(p_new->>'provider'),'')IS NULL OR p_new->>'training_category_id'IS NOT NULL AND type_row->>'training_category_id'IS DISTINCT FROM p_new->>'training_category_id'THEN RAISE EXCEPTION 'Required or compatible training facts missing' USING ERRCODE='23514';END IF;
 ELSIF p_kind='medical-record'THEN
  SELECT to_jsonb(t)INTO type_row FROM public.hr_medical_record_types t WHERE id=(p_new->>'medical_record_type_id')::bigint;
  IF(type_row->>'requires_dms_document')::boolean AND p_new->>'dms_document_id'IS NULL THEN RAISE EXCEPTION 'Required medical evidence missing' USING ERRCODE='23514';END IF;
 END IF;
 number_field:=CASE p_kind WHEN'identity-document'THEN'document_number'WHEN'medical-insurance'THEN'policy_number'WHEN'access-card'THEN'card_number'WHEN'training-certificate'THEN'certificate_number'ELSE'report_number'END;
 type_field:=CASE p_kind WHEN'identity-document'THEN'document_type_id'WHEN'medical-insurance'THEN'insurance_provider'WHEN'access-card'THEN'access_type_id'WHEN'training-certificate'THEN'training_type_id'ELSE'medical_record_type_id'END;
 normal:=upper(regexp_replace(coalesce(p_new->>number_field,''),'[[:space:]-]','','g'));
 IF normal<>''AND(p_action='create'OR p_new->>number_field IS DISTINCT FROM p_old->>number_field OR p_new->>type_field IS DISTINCT FROM p_old->>type_field)THEN
  -- One normalized identity lock serializes competing subjects without exposing
  -- another person's matching record in the rejection.
  PERFORM pg_advisory_xact_lock(hashtextextended('f11-compliance-number:'||p_kind||':'||coalesce(p_new->>type_field,'')||':'||normal,0));
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I r WHERE r.deleted_at IS NULL AND r.id<>$1 AND upper(regexp_replace(coalesce(to_jsonb(r)->>%L,''''),''[[:space:]-]'','''',''g''))=$2 AND to_jsonb(r)->>%L=$3 AND($4 OR r.employee_id=$5))',table_name,number_field,type_field)INTO duplicate USING(p_new->>'id')::bigint,normal,p_new->>type_field,p_kind='identity-document'AND upper(coalesce(type_row->>'code',''))IN('PASSPORT','EMIRATES_ID'),p_employee;
  IF duplicate THEN RAISE EXCEPTION 'A matching compliance record already exists' USING ERRCODE='23505';END IF;
 END IF;
END$$;
CREATE FUNCTION erp_private.f11_capture_compliance()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_compliance_save',true),'')::jsonb;gate erp_private.f11_compliance_admissions;kind text;actual jsonb;permitted text[];subject record;actor bigint:=public.current_user_profile_id();BEGIN
 kind:=CASE TG_TABLE_NAME WHEN 'employee_identity_documents'THEN'identity-document' WHEN 'employee_medical_insurances'THEN'medical-insurance' WHEN 'employee_access_cards'THEN'access-card' WHEN 'employee_training_certificates'THEN'training-certificate' WHEN 'employee_medical_records'THEN'medical-record' END;
 IF auth.uid()IS NULL AND current_user='postgres'THEN RETURN NEW;END IF;
 -- Existing numbered creation proves its own employee INSERT and settles its
 -- separate F06 transaction. A caller-controlled flag cannot mint this proof.
 IF TG_OP='INSERT'AND context IS NULL AND EXISTS(SELECT 1 FROM erp_private.document_employee_insert_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.employee_id=NEW.employee_id)THEN RETURN NEW;END IF;
 SELECT a.*INTO gate FROM erp_private.f11_compliance_admissions a WHERE a.transaction_id=pg_current_xact_id()AND a.actor=auth.uid()AND a.operation_id=(context->>'operation_id')::uuid;
 IF NOT FOUND OR gate.kind IS DISTINCT FROM kind OR gate.employee_id IS DISTINCT FROM NEW.employee_id OR gate.request_hash IS DISTINCT FROM context->>'hash'OR NOT erp_private.f11_child_authorized(kind,NEW.employee_id)THEN RAISE EXCEPTION 'Original admitted compliance operation required' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT'THEN
  IF gate.action<>'create'OR gate.record_id IS NOT NULL OR gate.revision IS NOT NULL OR NEW.workspace_revision<>1 OR NEW.created_by IS DISTINCT FROM actor OR NEW.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid compliance creation' USING ERRCODE='23514';END IF;
 ELSE
  IF gate.action='create'OR gate.record_id IS DISTINCT FROM OLD.id OR gate.revision IS DISTINCT FROM OLD.workspace_revision OR NEW.workspace_revision<>OLD.workspace_revision+1 OR NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN RAISE EXCEPTION 'Compliance original changed' USING ERRCODE='P0409';END IF;
  permitted:=gate.columns||ARRAY['workspace_revision','updated_at','updated_by'];
  IF kind='identity-document'AND 'verification_status'=ANY(gate.columns)THEN permitted:=permitted||ARRAY['verified_at','verified_by'];END IF;
  IF gate.action='archive'THEN permitted:=permitted||ARRAY['deleted_at','deleted_by'];IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Invalid archive' USING ERRCODE='23514';END IF;
  ELSIF gate.action='verify'THEN permitted:=permitted||ARRAY['verification_status']||CASE WHEN kind='identity-document'THEN ARRAY['verified_at','verified_by']ELSE ARRAY[]::text[]END;
   IF to_jsonb(NEW)->>'verification_status'IS DISTINCT FROM'verified'THEN RAISE EXCEPTION 'Invalid verification' USING ERRCODE='23514';END IF;
  END IF;
  IF(to_jsonb(NEW)-permitted)IS DISTINCT FROM(to_jsonb(OLD)-permitted)THEN RAISE EXCEPTION 'Unrendered compliance facts changed' USING ERRCODE='23514';END IF;
 END IF;
 IF kind='identity-document'AND(gate.action='verify'OR gate.action IN('create','update')AND 'verification_status'=ANY(gate.columns))THEN
  IF to_jsonb(NEW)->>'verification_status'='verified'THEN IF(to_jsonb(NEW)->>'verified_by')::bigint IS DISTINCT FROM actor OR to_jsonb(NEW)->>'verified_at'IS NULL THEN RAISE EXCEPTION 'Verified identity requires its actual verifier' USING ERRCODE='23514';END IF;
  ELSIF to_jsonb(NEW)->>'verified_by'IS NOT NULL OR to_jsonb(NEW)->>'verified_at'IS NOT NULL THEN RAISE EXCEPTION 'Unverified identity cannot retain a verification stamp' USING ERRCODE='23514';END IF;
 END IF;
 actual:=coalesce((SELECT jsonb_object_agg(k,to_jsonb(NEW)->k)FROM unnest(gate.columns)k),'{}'::jsonb);
 IF encode(sha256(convert_to(actual::text,'UTF8')),'hex')IS DISTINCT FROM gate.payload_hash THEN RAISE EXCEPTION 'Compliance fields differ from admitted command' USING ERRCODE='23514';END IF;
 IF gate.action IN('create','update')AND kind='identity-document'AND(nullif(btrim(to_jsonb(NEW)->>'document_number'),'')IS NULL)THEN RAISE EXCEPTION 'Document number required' USING ERRCODE='23514';END IF;
 IF gate.action IN('create','update')AND kind='medical-insurance'AND(nullif(btrim(to_jsonb(NEW)->>'insurance_provider'),'')IS NULL OR nullif(btrim(to_jsonb(NEW)->>'policy_number'),'')IS NULL OR to_jsonb(NEW)->>'expiry_date'IS NULL)THEN RAISE EXCEPTION 'Insurance facts required' USING ERRCODE='23514';END IF;
 IF gate.action IN('create','update')AND kind='medical-record'AND(to_jsonb(NEW)->>'examination_date'IS NULL OR(to_jsonb(NEW)->>'work_restrictions')::boolean AND nullif(btrim(to_jsonb(NEW)->>'restriction_details'),'')IS NULL)THEN RAISE EXCEPTION 'Medical examination or restriction details required' USING ERRCODE='23514';END IF;
 IF gate.action IN('create','update')AND coalesce(to_jsonb(NEW)->>'expiry_date',to_jsonb(NEW)->>'next_examination_date')IS NOT NULL AND coalesce(to_jsonb(NEW)->>'issue_date',to_jsonb(NEW)->>'completion_date',to_jsonb(NEW)->>'examination_date')IS NOT NULL AND coalesce(to_jsonb(NEW)->>'expiry_date',to_jsonb(NEW)->>'next_examination_date')::date<coalesce(to_jsonb(NEW)->>'issue_date',to_jsonb(NEW)->>'completion_date',to_jsonb(NEW)->>'examination_date')::date THEN RAISE EXCEPTION 'Invalid compliance chronology' USING ERRCODE='23514';END IF;
 PERFORM erp_private.f11_compliance_reference_facts(kind,NEW.employee_id,to_jsonb(NEW),CASE WHEN TG_OP='UPDATE'THEN to_jsonb(OLD)ELSE'{}'::jsonb END,gate.action);
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)VALUES(auth.uid(),gate.operation_id,kind,gate.action,NEW.employee_id,NEW.id,NEW.workspace_revision,gate.request_hash);
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)VALUES(actor,subject.owner_company_id,subject.branch_id,'HR',TG_TABLE_NAME,NEW.id,gate.action,jsonb_build_object('operation_id',gate.operation_id,'revision',NEW.workspace_revision));
 RETURN NEW;
END$$;
DO $$DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['employee_identity_documents','employee_medical_insurances','employee_access_cards','employee_training_certificates','employee_medical_records'] LOOP
 EXECUTE format('CREATE TRIGGER f11_compliance_capture AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_compliance()',name);
END LOOP;END$$;
CREATE FUNCTION erp_private.f11_settle_compliance(p_operation uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gate erp_private.f11_compliance_admissions;receipt erp_private.f11_child_receipts;row_data jsonb;doc bigint;BEGIN
 SELECT *INTO gate FROM erp_private.f11_compliance_admissions WHERE transaction_id=pg_current_xact_id()AND actor=auth.uid()AND operation_id=p_operation;
 IF NOT FOUND OR NOT erp_private.f11_child_authorized(gate.kind,gate.employee_id)THEN RAISE EXCEPTION 'Current compliance settlement required' USING ERRCODE='42501';END IF;
 SELECT *INTO receipt FROM erp_private.f11_child_receipts WHERE actor=auth.uid()AND operation_id=p_operation AND request_hash=gate.request_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'Compliance receipt missing' USING ERRCODE='23514';END IF;
 EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND employee_id=$2',erp_private.f11_compliance_table(gate.kind))INTO row_data USING receipt.record_id,gate.employee_id;
 IF row_data IS NULL OR(row_data->>'workspace_revision')::bigint<>receipt.revision THEN RAISE EXCEPTION 'Compliance settlement record mismatch' USING ERRCODE='23514';END IF;
 IF gate.action<>'archive'THEN FOR doc IN SELECT DISTINCT x FROM unnest(gate.documents||CASE WHEN row_data->>'dms_document_id'IS NULL THEN ARRAY[]::bigint[]ELSE ARRAY[(row_data->>'dms_document_id')::bigint]END)x LOOP
  IF NOT EXISTS(SELECT 1 FROM public.dms_documents d JOIN public.employees e ON e.id=gate.employee_id WHERE d.id=doc AND d.deleted_at IS NULL AND d.owning_company_id=e.owner_company_id AND erp_private.document_permission(doc,'dms.documents.view')AND erp_private.document_permission(doc,'dms.documents.preview')AND(erp_private.document_permission(doc,'dms.documents.edit')OR erp_private.document_permission(doc,'dms.admin')))THEN RAISE EXCEPTION 'Evidence access changed' USING ERRCODE='42501';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dms_document_links WHERE document_id=doc AND entity_type='employee'AND entity_id=gate.employee_id AND deleted_at IS NULL)THEN RAISE EXCEPTION 'Atomic employee evidence link missing' USING ERRCODE='23514';END IF;
 END LOOP;END IF;
 DELETE FROM erp_private.f11_compliance_admissions WHERE transaction_id=gate.transaction_id AND actor=gate.actor AND operation_id=gate.operation_id;
END$$;
CREATE FUNCTION erp_private.f11_compliance_must_settle()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.f11_compliance_admissions WHERE transaction_id=NEW.transaction_id AND actor=NEW.actor AND operation_id=NEW.operation_id)THEN RAISE EXCEPTION 'Compliance operation did not settle' USING ERRCODE='23514';END IF;RETURN NULL;
END$$;
CREATE CONSTRAINT TRIGGER f11_compliance_settlement AFTER INSERT ON erp_private.f11_compliance_admissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.f11_compliance_must_settle();
CREATE FUNCTION public.f11_mutate_compliance_child(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE table_name text:=erp_private.f11_compliance_table(p_kind);digest text;receipt jsonb;original jsonb;payload jsonb;context jsonb;cols text;vals text;assigns text;target bigint;revision bigint;actor bigint;subject record;doc_id bigint;document record;link record;ref record;reference_row jsonb;BEGIN
 IF table_name IS NULL OR p_operation IS NULL OR p_employee IS NULL OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current scoped compliance access required' USING ERRCODE='42501';END IF;
 IF(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_revision IS NULL OR p_revision<1))THEN RAISE EXCEPTION 'Original revision required' USING ERRCODE='22023';END IF;
 PERFORM erp_private.f11_validate_compliance(p_kind,p_action,p_data);
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.f11_child_receipt(p_operation);IF receipt IS NOT NULL THEN
  IF receipt->>'hash'IS DISTINCT FROM digest OR receipt->>'kind'IS DISTINCT FROM p_kind THEN RAISE EXCEPTION 'Operation reused for changed input' USING ERRCODE='22023';END IF;
  RETURN(receipt-'hash')||jsonb_build_object('replayed',true);
 END IF;
 SELECT id,owner_company_id,branch_id INTO subject FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 IF p_id IS NOT NULL THEN EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND employee_id=$2 AND deleted_at IS NULL FOR UPDATE',table_name)INTO original USING p_id,p_employee;
  IF original IS NULL THEN RAISE EXCEPTION 'Compliance record unavailable' USING ERRCODE='42501';END IF;
  IF(original->>'workspace_revision')::bigint<>p_revision THEN RAISE EXCEPTION 'Compliance changed after opening' USING ERRCODE='P0409';END IF;
 END IF;
 actor:=public.current_user_profile_id();payload:=p_data-'source_document_ids'-'entry_source';
 -- Selected references use ordinary RLS, accept retained historical selections,
 -- and require active compatible facts for newly selected references.
 FOR ref IN SELECT a.attname,n.nspname,c.relname FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=f.conkey[1]JOIN pg_class c ON c.oid=f.confrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE f.contype='f'AND f.conrelid=('public.'||table_name)::regclass AND cardinality(f.conkey)=1 LOOP
  IF payload?ref.attname AND payload->>ref.attname IS NOT NULL AND payload->>ref.attname IS DISTINCT FROM original->>ref.attname AND ref.attname<>'dms_document_id'THEN
   EXECUTE format('SELECT to_jsonb(r)FROM %I.%I r WHERE id=$1',ref.nspname,ref.relname)INTO reference_row USING(payload->>ref.attname)::bigint;
   IF reference_row IS NULL OR reference_row->>'deleted_at'IS NOT NULL OR reference_row->>'is_active'='false'OR reference_row?'owner_company_id'AND reference_row->>'owner_company_id'IS NOT NULL AND(reference_row->>'owner_company_id')::bigint<>subject.owner_company_id THEN RAISE EXCEPTION 'Current compatible reference unavailable' USING ERRCODE='23514';END IF;
  END IF;
 END LOOP;
 IF p_action='archive'THEN payload:=jsonb_build_object('deleted_at',clock_timestamp(),'deleted_by',actor);
 ELSIF p_action='verify'THEN payload:=jsonb_build_object('verification_status','verified')||CASE WHEN p_kind='identity-document'THEN jsonb_build_object('verified_at',clock_timestamp(),'verified_by',actor)ELSE'{}'::jsonb END;
 END IF;
 FOR doc_id IN SELECT DISTINCT x FROM unnest(ARRAY(SELECT d::bigint FROM jsonb_array_elements_text(coalesce(p_data->'source_document_ids','[]'::jsonb))d)||CASE WHEN (CASE WHEN payload?'dms_document_id'THEN payload->>'dms_document_id'ELSE original->>'dms_document_id'END)IS NULL OR p_action='archive'THEN ARRAY[]::bigint[]ELSE ARRAY[(CASE WHEN payload?'dms_document_id'THEN payload->>'dms_document_id'ELSE original->>'dms_document_id'END)::bigint]END)x ORDER BY x LOOP
  SELECT id,owning_company_id INTO document FROM public.dms_documents WHERE id=doc_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR document.owning_company_id IS DISTINCT FROM subject.owner_company_id OR NOT erp_private.document_permission(doc_id,'dms.documents.view')OR NOT erp_private.document_permission(doc_id,'dms.documents.preview')OR NOT(erp_private.document_permission(doc_id,'dms.documents.edit')OR erp_private.document_permission(doc_id,'dms.admin'))THEN RAISE EXCEPTION 'Evidence access unavailable' USING ERRCODE='42501';END IF;
 END LOOP;
 IF p_kind='identity-document'AND p_action IN('create','update')AND p_data?'verification_status'THEN payload:=payload||CASE WHEN p_data->>'verification_status'='verified'THEN jsonb_build_object('verified_by',actor,'verified_at',clock_timestamp())ELSE jsonb_build_object('verified_by',NULL,'verified_at',NULL)END;END IF;
 context:=jsonb_build_object('operation_id',p_operation,'kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'action',p_action,'hash',digest);
 PERFORM erp_private.f11_admit_compliance(context,p_data);PERFORM set_config('erp.f11_compliance_save',context::text,true);
 payload:=payload||jsonb_build_object('updated_by',actor);
 IF p_id IS NULL THEN payload:=payload||jsonb_build_object('employee_id',p_employee,'created_by',actor)||CASE WHEN p_kind='medical-insurance'THEN jsonb_build_object('owner_company_id',subject.owner_company_id)ELSE'{}'::jsonb END;END IF;
 SELECT string_agg(format('%I',k),','ORDER BY k),string_agg(format('r.%I',k),','ORDER BY k),string_agg(format('%1$I=r.%1$I',k),','ORDER BY k)INTO cols,vals,assigns FROM jsonb_object_keys(payload)k;
 IF p_id IS NULL THEN EXECUTE format('INSERT INTO public.%1$I(%2$s)SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I,$1)r RETURNING id,workspace_revision',table_name,cols,vals)INTO target,revision USING payload;
 ELSE EXECUTE format('UPDATE public.%1$I d SET %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1)r WHERE d.id=$2 AND d.employee_id=$3 AND d.workspace_revision=$4 AND d.deleted_at IS NULL RETURNING d.id,d.workspace_revision',table_name,assigns)INTO target,revision USING payload,p_id,p_employee,p_revision;END IF;
 PERFORM set_config('erp.f11_compliance_save','',true);
 IF target IS NULL THEN RAISE EXCEPTION 'Compliance save unavailable' USING ERRCODE='42501';END IF;
 IF p_action<>'archive'THEN FOR doc_id IN SELECT DISTINCT x FROM unnest(ARRAY(SELECT d::bigint FROM jsonb_array_elements_text(coalesce(p_data->'source_document_ids','[]'::jsonb))d)||CASE WHEN (CASE WHEN payload?'dms_document_id'THEN payload->>'dms_document_id'ELSE original->>'dms_document_id'END)IS NULL THEN ARRAY[]::bigint[]ELSE ARRAY[(CASE WHEN payload?'dms_document_id'THEN payload->>'dms_document_id'ELSE original->>'dms_document_id'END)::bigint]END)x ORDER BY x LOOP
  SELECT id,deleted_at INTO link FROM public.dms_document_links WHERE document_id=doc_id AND entity_type='employee'AND entity_id=p_employee ORDER BY deleted_at NULLS FIRST,id DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN IF link.deleted_at IS NOT NULL THEN UPDATE public.dms_document_links SET deleted_at=NULL WHERE id=link.id;IF NOT FOUND THEN RAISE EXCEPTION 'Evidence revival denied' USING ERRCODE='42501';END IF;END IF;
  ELSE INSERT INTO public.dms_document_links(document_id,entity_type,entity_id,link_role)VALUES(doc_id,'employee',p_employee,'compliance');END IF;
 END LOOP;END IF;
 PERFORM erp_private.f11_settle_compliance(p_operation);
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END$$;
REVOKE ALL ON FUNCTION erp_private.f11_compliance_reference_facts(text,bigint,jsonb,jsonb,text),erp_private.f11_compliance_columns(text),erp_private.f11_compliance_table(text),erp_private.f11_validate_compliance(text,text,jsonb),erp_private.f11_admit_compliance(jsonb,jsonb),erp_private.f11_capture_compliance(),erp_private.f11_settle_compliance(uuid),erp_private.f11_compliance_must_settle(),public.f11_mutate_compliance_child(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_compliance_columns(text),erp_private.f11_compliance_table(text),erp_private.f11_validate_compliance(text,text,jsonb),erp_private.f11_admit_compliance(jsonb,jsonb),erp_private.f11_settle_compliance(uuid),public.f11_mutate_compliance_child(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
