-- A document's new type and its required metadata must commit together.
-- No existing records, definitions, policies, workers or provider settings change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE erp_private.dms_type_change_receipts (
 actor bigint NOT NULL REFERENCES public.user_profiles(id),
 request_id uuid NOT NULL,
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 payload_hash text NOT NULL,
 receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor,request_id)
);
ALTER TABLE erp_private.dms_type_change_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_type_change_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.dms_type_change(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<operation>>
DECLARE d public.dms_documents; t public.dms_document_types; actor bigint;
 target jsonb; definitions jsonb; fingerprint text; h text; key uuid;
 saved erp_private.dms_type_change_receipts; input jsonb; field text; item jsonb; result jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('review','save') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object'
  OR octet_length(p_data::text)>1048576 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k
   WHERE k NOT IN ('documentId','documentTypeId','snapshot','requestId','document','values')) THEN
  RAISE EXCEPTION 'Invalid type change request' USING ERRCODE='22023';
 END IF;
 actor:=public.current_user_profile_id();
 IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.ai_mod04_lock_profile_authority(actor);
 d:=erp_private.f07_metadata_authority((p_data->>'documentId')::bigint,false);
 -- Match the normal document UPDATE policy, including exact source scope.
 IF NOT erp_private.document_permission(d.id,'dms.documents.edit') THEN
  RAISE EXCEPTION 'Document edit access denied' USING ERRCODE='42501';
 END IF;
 IF p_action='save' THEN
  key:=(p_data->>'requestId')::uuid;
  IF key IS NULL OR p_data->>'snapshot' IS NULL THEN RAISE EXCEPTION 'Retain the reviewed request' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dms-type-change:'||actor||':'||key,0));
  h:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
  SELECT * INTO saved FROM erp_private.dms_type_change_receipts r WHERE r.actor=operation.actor AND r.request_id=key;
  IF FOUND THEN
   IF saved.document_id<>d.id OR saved.payload_hash<>h THEN RAISE EXCEPTION 'Retained request differs' USING ERRCODE='PT409'; END IF;
   RETURN saved.receipt;
  END IF;
 END IF;
 d:=erp_private.f07_metadata_authority(d.id,true);
 -- Parent type lock prevents definitions from being inserted/changed mid-review.
 PERFORM x.id FROM public.dms_document_types x WHERE x.id IN (d.document_type_id,(p_data->>'documentTypeId')::bigint) ORDER BY x.id FOR SHARE;
 SELECT * INTO t FROM public.dms_document_types WHERE id=(p_data->>'documentTypeId')::bigint AND is_active AND deleted_at IS NULL;
 IF t.id IS NULL OR t.id=d.document_type_id THEN RAISE EXCEPTION 'Select a different available document type' USING ERRCODE='22023'; END IF;
 target:=erp_private.ai_mod04_target_type(d.id,t.type_code);
 IF target->'canApply' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Type change requires owning workflow or processing-rule review' USING ERRCODE='55000'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('is_required',m.is_required OR coalesce(target->'profile'->'requiredFields' ? m.field_code,false)) ORDER BY m.sort_order,m.id),'[]'::jsonb)
 INTO definitions FROM public.dms_metadata_definitions m WHERE m.document_type_id=t.id AND m.is_active AND m.deleted_at IS NULL;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('source',erp_private.f07_metadata_snapshot(d.id),'target',target,'definitions',definitions)::text,'UTF8')),'hex');
 IF p_action='review' THEN
  RETURN jsonb_build_object('documentId',d.id,'documentTypeId',t.id,'snapshot',fingerprint,'definitions',definitions,
   'values',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.definition_id),'[]'::jsonb) FROM public.dms_document_metadata_values v
    JOIN public.dms_metadata_definitions m ON m.id=v.definition_id AND m.document_type_id=t.id WHERE v.document_id=d.id AND v.deleted_at IS NULL));
 END IF;
 IF fingerprint IS DISTINCT FROM p_data->>'snapshot' THEN RAISE EXCEPTION 'Document or target definitions changed; review again' USING ERRCODE='PT409'; END IF;
 input:=p_data->'document';
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(input) k WHERE k NOT IN
  ('title','description','document_type_id','category_id','status','confidentiality_level','owning_company_id','owning_branch_id','party_id','issue_date','expiry_date'))
  OR nullif(btrim(input->>'title'),'') IS NULL OR length(input->>'title')>500
  OR (input->>'document_type_id')::bigint IS DISTINCT FROM t.id OR (input->>'category_id')::bigint IS DISTINCT FROM t.category_id THEN
  RAISE EXCEPTION 'Invalid document type change fields' USING ERRCODE='22023';
 END IF;
 -- Keep transfers, classification and lifecycle transitions in their existing
 -- authorized workflows. A type edit is not a route around their policies.
 FOREACH field IN ARRAY ARRAY['status','confidentiality_level','owning_company_id','owning_branch_id','party_id'] LOOP
  IF input->field IS DISTINCT FROM to_jsonb(d)->field THEN
   RAISE EXCEPTION 'Save ownership, confidentiality and status changes separately before changing document type' USING ERRCODE='22023';
  END IF;
 END LOOP;
 IF NOT erp_private.permission_in_scope('dms.documents.edit',d.owning_company_id,d.owning_branch_id)
  OR (d.confidentiality_level NOT IN ('internal','company') AND NOT erp_private.permission_in_scope('dms.documents.view.'||d.confidentiality_level,d.owning_company_id,d.owning_branch_id)) THEN
  RAISE EXCEPTION 'Document destination access denied' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_data->'values') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Metadata review required' USING ERRCODE='22023'; END IF;
 UPDATE public.dms_documents SET title=input->>'title',description=input->>'description',document_type_id=t.id,category_id=t.category_id,
  issue_date=(input->>'issue_date')::date,expiry_date=(input->>'expiry_date')::date,updated_by=actor,updated_at=clock_timestamp() WHERE id=d.id;
 PERFORM erp_private.f07_write_metadata(d.id,p_data->'values',actor);
 -- Include approved processing-profile requirements, not just definition flags.
 FOR item IN SELECT value FROM jsonb_array_elements(definitions) WHERE value->'is_required'='true'::jsonb LOOP
  IF NOT EXISTS(SELECT 1 FROM public.dms_document_metadata_values v WHERE v.document_id=d.id AND v.definition_id=(item->>'id')::bigint AND v.deleted_at IS NULL
   AND nullif(btrim(coalesce(v.value_text,v.value_number::text,v.value_date::text,v.value_datetime::text,v.value_boolean::text,nullif(v.value_json,'null'::jsonb)::text)),'') IS NOT NULL
   AND v.value_json IS DISTINCT FROM '[]'::jsonb) THEN
   RAISE EXCEPTION 'Required metadata is missing: %',item->>'field_label_en' USING ERRCODE='22023';
  END IF;
 END LOOP;
 PERFORM erp_private.f07_assert_document_completion(d.id);
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by)
 VALUES(d.id,'document_updated','Document type and reviewed metadata saved together',actor);
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,old_values,new_values)
 VALUES(actor,'DMS','dms_documents',d.id,'update',jsonb_build_object('document_type_id',d.document_type_id),jsonb_build_object('document_type_id',t.id,'requestId',key));
 result:=jsonb_build_object('documentId',d.id,'documentTypeId',t.id,'requestId',key);
 INSERT INTO erp_private.dms_type_change_receipts(actor,request_id,document_id,payload_hash,receipt) VALUES(actor,key,d.id,h,result);
 RETURN result;
END $$;
CREATE FUNCTION public.dms_type_change(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.dms_type_change(p_action,p_data)$$;
REVOKE ALL ON FUNCTION erp_private.dms_type_change(text,jsonb),public.dms_type_change(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_type_change(text,jsonb),public.dms_type_change(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
