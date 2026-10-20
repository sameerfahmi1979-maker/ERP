BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
ALTER TABLE public.employee_dependents ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1;
GRANT SELECT(workspace_revision) ON public.employee_dependents TO authenticated;
CREATE TRIGGER f04_revision BEFORE INSERT OR UPDATE ON public.employee_dependents FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision();
CREATE TABLE erp_private.f11_dependent_receipts(
 actor uuid NOT NULL,operation_id uuid NOT NULL,request_hash text NOT NULL,kind text NOT NULL,
 employee_id bigint NOT NULL,record_id bigint NOT NULL,revision bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor,operation_id)
);
ALTER TABLE erp_private.f11_dependent_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f11_dependent_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f11_dependent_receipt_read(p_operation uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('hash',r.request_hash,'kind',r.kind,'employee_id',r.employee_id,'id',r.record_id,'revision',r.revision::text)
 FROM erp_private.f11_dependent_receipts r JOIN public.employee_dependents d ON d.id=r.record_id AND d.employee_id=r.employee_id
 WHERE r.actor=(SELECT auth.uid()) AND r.operation_id=p_operation AND (SELECT erp_private.business_principal_is_active())
 AND (erp_private.employee_permission(d.employee_id,'hr.compliance.manage') OR erp_private.employee_permission(d.employee_id,'hr.admin'));
$$;
CREATE FUNCTION erp_private.f11_dependent_facts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN RAISE EXCEPTION 'A dependent cannot be moved to another employee' USING ERRCODE='42501';END IF;
 IF nullif(btrim(NEW.dependent_name_en),'') IS NULL OR NEW.relationship_type_id IS NULL THEN RAISE EXCEPTION 'Dependent name and relationship are required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER f11_dependent_facts BEFORE INSERT OR UPDATE ON public.employee_dependents FOR EACH ROW EXECUTE FUNCTION erp_private.f11_dependent_facts();
CREATE FUNCTION erp_private.f11_capture_dependent_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_dependent_save',true),'')::jsonb;
BEGIN
 IF context IS NOT NULL AND auth.uid() IS NOT NULL AND (context->>'employee_id')::bigint=NEW.employee_id THEN
  INSERT INTO erp_private.f11_dependent_receipts(actor,operation_id,request_hash,kind,employee_id,record_id,revision)
  VALUES(auth.uid(),(context->>'operation_id')::uuid,context->>'hash',context->>'kind',NEW.employee_id,NEW.id,NEW.workspace_revision);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER f11_dependent_receipt AFTER INSERT OR UPDATE ON public.employee_dependents FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_dependent_receipt();
REVOKE ALL ON FUNCTION erp_private.f11_dependent_facts(),erp_private.f11_capture_dependent_receipt(),erp_private.f11_dependent_receipt_read(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_dependent_receipt_read(uuid) TO authenticated;

CREATE FUNCTION public.f11_save_dependent(p_operation uuid,p_employee bigint,p_id bigint,p_revision bigint,p_kind text,p_data jsonb,p_add bigint[] DEFAULT '{}',p_remove bigint[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor bigint;digest text;receipt jsonb;company bigint;subject record;existing record;document record;primary_doc bigint;
 payload jsonb;cols text;vals text;assigns text;target bigint;revision bigint;doc_id bigint;changed bigint;
 allowed text[]:=ARRAY['dependent_name_en','dependent_name_ar','relationship_type_id','date_of_birth','nationality_id','passport_number','passport_expiry','emirates_id_number','emirates_id_expiry','residence_visa_number','residence_visa_expiry','medical_insurance_provider','medical_insurance_policy','medical_insurance_card','medical_insurance_expiry','sponsored_by','is_active','dms_document_id','notes'];
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR NOT(erp_private.employee_permission(p_employee,'hr.compliance.manage') OR erp_private.employee_permission(p_employee,'hr.admin')) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL OR p_employee IS NULL OR p_employee<=0 OR p_kind IS NULL OR p_kind NOT IN('save','archive') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>65536 OR (p_id IS NULL AND(p_revision IS NOT NULL OR p_kind<>'save')) OR (p_id IS NOT NULL AND(p_id<=0 OR p_revision IS NULL OR p_revision<1)) OR p_add IS NULL OR p_remove IS NULL OR cardinality(p_add)>100 OR cardinality(p_remove)>100 OR EXISTS(SELECT 1 FROM unnest(p_add||p_remove)x WHERE x IS NULL OR x<=0) OR cardinality(p_add)<>(SELECT count(DISTINCT x)FROM unnest(p_add)x) OR cardinality(p_remove)<>(SELECT count(DISTINCT x)FROM unnest(p_remove)x) OR p_add&&p_remove OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Invalid dependent save contract' USING ERRCODE='22023';END IF;
 IF p_kind='archive' AND(p_data<>'{}' OR cardinality(p_add)>0 OR cardinality(p_remove)>0) THEN RAISE EXCEPTION 'Invalid archive payload' USING ERRCODE='22023';END IF;
 actor:=public.current_user_profile_id();digest:=encode(sha256(convert_to(jsonb_build_array('f11_dependent',p_employee,p_id,p_revision,p_kind,p_data,p_add,p_remove)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 receipt:=erp_private.f11_dependent_receipt_read(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'hash'<>digest OR (receipt->>'employee_id')::bigint<>p_employee OR receipt->>'kind'<>p_kind THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN (receipt-'hash'-'kind')||jsonb_build_object('operation_id',p_operation,'replayed',true);
 END IF;
 SELECT id,owner_company_id,branch_id INTO subject FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;company:=subject.owner_company_id;
 IF p_id IS NOT NULL THEN
  SELECT id,employee_id,workspace_revision,dms_document_id INTO existing FROM public.employee_dependents WHERE id=p_id AND employee_id=p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dependent unavailable' USING ERRCODE='42501';END IF;
  IF existing.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Dependent changed; reopen before saving' USING ERRCODE='P0409';END IF;
  primary_doc:=existing.dms_document_id;
 END IF;
 IF p_data?'dms_document_id' THEN primary_doc:=(p_data->>'dms_document_id')::bigint;END IF;
 IF primary_doc=ANY(p_remove) THEN RAISE EXCEPTION 'Clear or replace the primary document before unlinking it' USING ERRCODE='23514';END IF;
 -- Lock sources in deterministic order; no bypass of F07 reviewed-document locks.
 FOR doc_id IN SELECT DISTINCT x FROM unnest(p_add||p_remove||CASE WHEN primary_doc IS NULL OR p_kind='archive' THEN '{}'::bigint[] ELSE ARRAY[primary_doc] END)x ORDER BY x LOOP
  SELECT id,owning_company_id INTO document FROM public.dms_documents WHERE id=doc_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR document.owning_company_id IS DISTINCT FROM company OR NOT erp_private.document_permission(doc_id,'dms.documents.view') OR NOT erp_private.document_permission(doc_id,'dms.documents.preview') OR NOT(erp_private.document_permission(doc_id,'dms.documents.edit') OR erp_private.document_permission(doc_id,'dms.admin')) THEN RAISE EXCEPTION 'Evidence document unavailable or outside employee company' USING ERRCODE='42501';END IF;
 END LOOP;
 payload:=p_data||jsonb_build_object('updated_by',actor);
 IF p_id IS NULL THEN payload:=payload||jsonb_build_object('employee_id',p_employee,'created_by',actor);END IF;
 IF p_kind='archive' THEN payload:=payload||jsonb_build_object('deleted_at',clock_timestamp(),'deleted_by',actor,'is_active',false);END IF;
 PERFORM set_config('erp.f11_dependent_save',jsonb_build_object('operation_id',p_operation,'employee_id',p_employee,'kind',p_kind,'hash',digest)::text,true);
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k),string_agg(format('%I=r.%I',k,k),',' ORDER BY k) INTO cols,vals,assigns FROM jsonb_object_keys(payload)k;
 IF p_id IS NULL THEN
  EXECUTE format('INSERT INTO public.employee_dependents(%s)SELECT %s FROM jsonb_populate_record(NULL::public.employee_dependents,$1)r RETURNING id,workspace_revision',cols,vals)INTO target,revision USING payload;
 ELSE
  EXECUTE format('UPDATE public.employee_dependents d SET %s FROM jsonb_populate_record(NULL::public.employee_dependents,$1)r WHERE d.id=$2 AND d.employee_id=$3 AND d.workspace_revision=$4 AND d.deleted_at IS NULL RETURNING d.id,d.workspace_revision',assigns)INTO target,revision USING payload,p_id,p_employee,p_revision;
 END IF;
 PERFORM set_config('erp.f11_dependent_save','',true);
 IF target IS NULL THEN RAISE EXCEPTION 'Dependent save denied or conflicted' USING ERRCODE='42501';END IF;
 IF p_kind='save' THEN
  FOR doc_id IN SELECT DISTINCT x FROM unnest(p_add||CASE WHEN primary_doc IS NULL THEN '{}'::bigint[] ELSE ARRAY[primary_doc] END)x ORDER BY x LOOP
   SELECT id,deleted_at INTO existing FROM public.dms_document_links WHERE document_id=doc_id AND entity_type='employee_dependent' AND entity_id=target ORDER BY deleted_at NULLS FIRST,id DESC LIMIT 1 FOR UPDATE;
   IF FOUND THEN
    IF existing.deleted_at IS NOT NULL THEN UPDATE public.dms_document_links SET deleted_at=NULL WHERE id=existing.id;IF NOT FOUND THEN RAISE EXCEPTION 'Evidence link denied' USING ERRCODE='42501';END IF;END IF;
   ELSE INSERT INTO public.dms_document_links(document_id,entity_type,entity_id,link_role)VALUES(doc_id,'employee_dependent',target,'dependent');END IF;
  END LOOP;
  FOREACH doc_id IN ARRAY p_remove LOOP
   UPDATE public.dms_document_links SET deleted_at=clock_timestamp() WHERE document_id=doc_id AND entity_type='employee_dependent' AND entity_id=target AND deleted_at IS NULL;
   GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>1 THEN RAISE EXCEPTION 'Evidence link unavailable or changed' USING ERRCODE='42501';END IF;
  END LOOP;
 END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,subject.owner_company_id,subject.branch_id,'HR','employee_dependents',target,CASE WHEN p_kind='archive' THEN 'archive' WHEN p_id IS NULL THEN 'create' ELSE 'update' END,jsonb_build_object('operation_id',p_operation,'revision',revision,'linked_count',cardinality(p_add),'unlinked_count',cardinality(p_remove)));
 IF NOT erp_private.business_principal_is_active() OR NOT(erp_private.employee_permission(p_employee,'hr.compliance.manage') OR erp_private.employee_permission(p_employee,'hr.admin')) THEN RAISE EXCEPTION 'Dependent access changed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('id',target,'employee_id',p_employee,'operation_id',p_operation,'revision',revision::text,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.f11_save_dependent(uuid,bigint,bigint,bigint,text,jsonb,bigint[],bigint[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_save_dependent(uuid,bigint,bigint,bigint,text,jsonb,bigint[],bigint[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
