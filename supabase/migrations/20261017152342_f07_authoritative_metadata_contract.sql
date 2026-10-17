-- F07 T06: document-scoped, typed metadata and complete reviewed-state receipts.
-- This migration changes no provider, worker, historical value or shared Auth setting.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE erp_private.f07_metadata_receipts (
 actor bigint NOT NULL REFERENCES public.user_profiles(id), request_id uuid NOT NULL,
 document_id bigint NOT NULL REFERENCES public.dms_documents(id), payload_hash text NOT NULL,
 receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor,request_id)
);
ALTER TABLE erp_private.f07_metadata_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_metadata_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_metadata_column(p_type text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE p_type WHEN 'number' THEN 'value_number' WHEN 'currency' THEN 'value_number'
 WHEN 'boolean' THEN 'value_boolean' WHEN 'date' THEN 'value_date' WHEN 'datetime' THEN 'value_datetime'
 WHEN 'json' THEN 'value_json' WHEN 'multiselect' THEN 'value_json' WHEN 'multi_select' THEN 'value_json'
 WHEN 'text' THEN 'value_text' WHEN 'textarea' THEN 'value_text' WHEN 'select' THEN 'value_text'
 WHEN 'email' THEN 'value_text' WHEN 'url' THEN 'value_text' WHEN 'phone' THEN 'value_text' END
$$;

CREATE FUNCTION erp_private.f07_validate_metadata_value(p_definition bigint,p_value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.dms_metadata_definitions; col text; v jsonb; txt text; opts jsonb; cfg jsonb; k text;
BEGIN
 SELECT * INTO d FROM public.dms_metadata_definitions WHERE id=p_definition AND is_active AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Metadata definition unavailable' USING ERRCODE='22023'; END IF;
 col:=erp_private.f07_metadata_column(d.field_type);
 IF col IS NULL OR jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR
  EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) x WHERE x NOT IN ('value_text','value_number','value_date','value_datetime','value_boolean','value_json')) THEN
  RAISE EXCEPTION 'Invalid typed metadata' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_value) LOOP
  IF k<>col AND p_value->k IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Metadata type mismatch' USING ERRCODE='22023'; END IF;
 END LOOP;
 v:=p_value->col;txt:=p_value->>col;cfg:=coalesce(d.validation_json,'{}');
 IF v IS NULL OR v='null'::jsonb OR (jsonb_typeof(v)='string' AND btrim(txt)='') OR v='[]'::jsonb THEN
  IF d.is_required THEN RAISE EXCEPTION 'Required metadata is missing: %',d.field_label_en USING ERRCODE='22023'; END IF;
  RETURN;
 END IF;
 IF octet_length(v::text)>65536 THEN RAISE EXCEPTION 'Metadata exceeds size limit' USING ERRCODE='22023'; END IF;
 IF col='value_text' THEN
  IF jsonb_typeof(v)<>'string' OR length(txt)>coalesce((cfg->>'max_length')::int,(cfg->>'maxLength')::int,16000) OR
   length(txt)<coalesce((cfg->>'min_length')::int,(cfg->>'minLength')::int,0) THEN RAISE EXCEPTION 'Invalid metadata text length' USING ERRCODE='22023'; END IF;
  IF cfg->>'pattern' IS NOT NULL AND txt !~ (cfg->>'pattern') THEN RAISE EXCEPTION 'Metadata does not match configured format' USING ERRCODE='22023'; END IF;
  IF d.field_type='email' AND txt !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid metadata email' USING ERRCODE='22023'; END IF;
  IF d.field_type='url' AND txt !~* '^https?://[^[:space:]]+$' THEN RAISE EXCEPTION 'Invalid metadata URL' USING ERRCODE='22023'; END IF;
 ELSIF col='value_number' THEN
  IF jsonb_typeof(v)<>'number' OR txt IN ('NaN','Infinity','-Infinity') OR
   (cfg ? 'min' AND txt::numeric<(cfg->>'min')::numeric) OR (cfg ? 'max' AND txt::numeric>(cfg->>'max')::numeric) THEN RAISE EXCEPTION 'Invalid metadata number' USING ERRCODE='22023'; END IF;
 ELSIF col='value_boolean' THEN
  IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'Invalid metadata boolean' USING ERRCODE='22023'; END IF;
 ELSIF col='value_date' THEN
  IF jsonb_typeof(v)<>'string' OR txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (txt::date)::text<>txt THEN RAISE EXCEPTION 'Invalid metadata calendar date' USING ERRCODE='22023'; END IF;
  IF (cfg->>'date_rule' IN ('past','past_or_today') AND txt::date>current_date) OR (cfg->>'date_rule' IN ('future','future_or_today') AND txt::date<current_date) THEN RAISE EXCEPTION 'Metadata date violates configured rule' USING ERRCODE='22023'; END IF;
 ELSIF col='value_datetime' THEN
  IF jsonb_typeof(v)<>'string' OR txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' OR NOT isfinite(txt::timestamptz) THEN RAISE EXCEPTION 'Invalid metadata datetime with timezone' USING ERRCODE='22023'; END IF;
 ELSIF d.field_type IN ('multiselect','multi_select') THEN
  IF jsonb_typeof(v)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e)<>'string') OR
   jsonb_array_length(v)<>(SELECT count(DISTINCT e) FROM jsonb_array_elements(v) e) THEN RAISE EXCEPTION 'Invalid multiple selections' USING ERRCODE='22023'; END IF;
 END IF;
 opts:=coalesce(d.options_json->'values',d.options_json->'options',CASE WHEN jsonb_typeof(d.options_json)='array' THEN d.options_json END,'[]'::jsonb);
 IF d.field_type='select' AND (jsonb_typeof(opts)<>'array' OR NOT opts @> jsonb_build_array(txt)) THEN RAISE EXCEPTION 'Metadata selection is not allowed' USING ERRCODE='22023'; END IF;
 IF d.field_type IN ('multiselect','multi_select') AND (jsonb_typeof(opts)<>'array' OR NOT opts @> v) THEN RAISE EXCEPTION 'Metadata selections are not allowed' USING ERRCODE='22023'; END IF;
END $$;

-- Stable canonical state: all live definitions and values, never display summaries.
CREATE FUNCTION erp_private.f07_metadata_snapshot(p_document bigint) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object(
  'document',(SELECT to_jsonb(d)-ARRAY['ocr_status','ocr_last_run_at','updated_at'] FROM public.dms_documents d WHERE id=p_document),
  'definitions',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.dms_metadata_definitions m JOIN public.dms_documents d ON d.document_type_id=m.document_type_id WHERE d.id=p_document AND m.deleted_at IS NULL AND m.is_active),
  'values',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.definition_id),'[]') FROM public.dms_document_metadata_values v WHERE document_id=p_document AND deleted_at IS NULL)
 )::text,'UTF8')),'hex')
$$;

CREATE FUNCTION erp_private.f07_metadata_authority(p_document bigint,p_write boolean) RETURNS public.dms_documents
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.dms_documents;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT erp_private.document_permission(d.id,'dms.documents.view') OR
  (p_write AND NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin'))) THEN RAISE EXCEPTION 'Document access denied' USING ERRCODE='42501'; END IF;
 IF p_write AND (d.is_archived OR d.status IN ('archived','superseded','deleted') OR d.approval_status='pending_approval') THEN RAISE EXCEPTION 'Document is not editable; withdraw active review first' USING ERRCODE='PT409'; END IF;
 RETURN d;
END $$;

-- Row-level invariant protects callers outside the new editor as well.
CREATE FUNCTION erp_private.f07_guard_metadata_value() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; def public.dms_metadata_definitions; v jsonb;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.document_id<>OLD.document_id OR NEW.definition_id<>OLD.definition_id) THEN RAISE EXCEPTION 'Metadata identity is immutable' USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=NEW.document_id FOR UPDATE;
 SELECT * INTO def FROM public.dms_metadata_definitions WHERE id=NEW.definition_id FOR SHARE;
 IF d.id IS NULL OR def.document_type_id IS DISTINCT FROM d.document_type_id OR NOT def.is_active OR def.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Metadata definition does not belong to this document type' USING ERRCODE='22023'; END IF;
 IF NEW.deleted_at IS NULL THEN
  v:=jsonb_build_object('value_text',NEW.value_text,'value_number',NEW.value_number,'value_date',NEW.value_date,'value_datetime',NEW.value_datetime,'value_boolean',NEW.value_boolean,'value_json',NEW.value_json);
  PERFORM erp_private.f07_validate_metadata_value(def.id,v);
  IF def.is_unique THEN
   -- Serialise unique checks even when the other document has no value row yet.
   PERFORM pg_advisory_xact_lock(hashtextextended('f07-metadata-unique:'||def.id::text,0));
   IF EXISTS(SELECT 1 FROM public.dms_document_metadata_values m JOIN public.dms_documents parent ON parent.id=m.document_id
     WHERE m.definition_id=def.id AND m.document_id<>NEW.document_id AND m.deleted_at IS NULL AND parent.deleted_at IS NULL
      AND parent.owning_company_id IS NOT DISTINCT FROM d.owning_company_id AND
      (to_jsonb(m)->erp_private.f07_metadata_column(def.field_type)) IS NOT DISTINCT FROM v->erp_private.f07_metadata_column(def.field_type)
      AND v->erp_private.f07_metadata_column(def.field_type) IS DISTINCT FROM 'null'::jsonb) THEN RAISE EXCEPTION 'Metadata value must be unique within this company and type' USING ERRCODE='23505'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER f07_guard_metadata_value BEFORE INSERT OR UPDATE ON public.dms_document_metadata_values FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_metadata_value();

CREATE FUNCTION erp_private.f07_write_metadata(p_document bigint,p_values jsonb,p_actor bigint) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e jsonb; metadata_id bigint; d public.dms_documents; def public.dms_metadata_definitions; supplied jsonb; actual jsonb; n integer:=0;
BEGIN
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document FOR UPDATE;
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'array' OR jsonb_array_length(p_values)>250 OR
  (SELECT count(*) FROM jsonb_array_elements(p_values))<>(SELECT count(DISTINCT x->>'definition_id') FROM jsonb_array_elements(p_values) x) THEN RAISE EXCEPTION 'Invalid or duplicate metadata fields' USING ERRCODE='22023'; END IF;
 -- Lock definitions in a consistent order before individual typed writes.
 PERFORM m.id FROM public.dms_metadata_definitions m WHERE m.document_type_id=d.document_type_id AND m.is_active AND m.deleted_at IS NULL ORDER BY m.id FOR SHARE;
 FOR e IN SELECT x FROM jsonb_array_elements(p_values) x ORDER BY (x->>'definition_id')::bigint LOOP
  metadata_id:=(e->>'definition_id')::bigint;
  SELECT * INTO def FROM public.dms_metadata_definitions WHERE dms_metadata_definitions.id=metadata_id AND document_type_id=d.document_type_id AND is_active AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Metadata definition unavailable for this type' USING ERRCODE='22023'; END IF;
  supplied:=e-'definition_id';PERFORM erp_private.f07_validate_metadata_value(metadata_id,supplied);
  INSERT INTO public.dms_document_metadata_values(document_id,definition_id,value_text,value_number,value_date,value_datetime,value_boolean,value_json,created_by,updated_by)
  VALUES(p_document,metadata_id,e->>'value_text',(e->>'value_number')::numeric,(e->>'value_date')::date,(e->>'value_datetime')::timestamptz,(e->>'value_boolean')::boolean,nullif(e->'value_json','null'),p_actor,p_actor)
  ON CONFLICT(document_id,definition_id) DO UPDATE SET value_text=excluded.value_text,value_number=excluded.value_number,value_date=excluded.value_date,value_datetime=excluded.value_datetime,value_boolean=excluded.value_boolean,value_json=excluded.value_json,updated_by=p_actor,updated_at=clock_timestamp(),deleted_at=NULL;
  n:=n+1;
 END LOOP;
 FOR def IN SELECT * FROM public.dms_metadata_definitions WHERE document_type_id=d.document_type_id AND is_active AND deleted_at IS NULL AND is_required ORDER BY id LOOP
  SELECT to_jsonb(m)-ARRAY['id','document_id','definition_id','created_by','updated_by','created_at','updated_at','deleted_at'] INTO actual FROM public.dms_document_metadata_values m WHERE document_id=p_document AND definition_id=def.id AND deleted_at IS NULL;
  PERFORM erp_private.f07_validate_metadata_value(def.id,coalesce(actual,'{}'));
 END LOOP;
 RETURN n;
END $$;

CREATE FUNCTION erp_private.f07_metadata_operation(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<meta>>
DECLARE d public.dms_documents; actor bigint; key uuid; h text; saved erp_private.f07_metadata_receipts; r jsonb; n integer;
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>1048576 OR p_action NOT IN ('snapshot','save') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid metadata request' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN ('documentId','snapshot','requestId','values','aiResultId')) THEN RAISE EXCEPTION 'Unexpected metadata request property' USING ERRCODE='22023'; END IF;
 -- Read is checked before private data is hydrated; write state is checked after replay.
 d:=erp_private.f07_metadata_authority((p_data->>'documentId')::bigint,false);actor:=public.current_user_profile_id();
 IF p_action='snapshot' THEN
  IF p_data->>'aiResultId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dms_ai_extraction_results a WHERE a.id=(p_data->>'aiResultId')::bigint AND a.document_id=d.id) THEN RAISE EXCEPTION 'AI source unavailable' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('documentId',d.id,'snapshot',erp_private.f07_metadata_snapshot(d.id),'sourceSnapshot',(SELECT encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex') FROM public.dms_ai_extraction_results a WHERE a.id=(p_data->>'aiResultId')::bigint AND a.document_id=d.id),'values',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.definition_id),'[]') FROM public.dms_document_metadata_values m WHERE document_id=d.id AND deleted_at IS NULL));
 END IF;
 IF NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin')) THEN RAISE EXCEPTION 'Edit permission denied' USING ERRCODE='42501'; END IF;
 key:=(p_data->>'requestId')::uuid;
 IF key IS NULL OR p_data->>'snapshot' IS NULL THEN RAISE EXCEPTION 'Retain the reviewed metadata identity' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 SELECT * INTO saved FROM erp_private.f07_metadata_receipts WHERE f07_metadata_receipts.actor=meta.actor AND request_id=key;
 IF FOUND THEN IF saved.payload_hash<>h OR saved.document_id<>d.id THEN RAISE EXCEPTION 'Request reused for different metadata' USING ERRCODE='PT409'; END IF;RETURN saved.receipt; END IF;
 d:=erp_private.f07_metadata_authority(d.id,true);
 IF p_data->>'snapshot'<>erp_private.f07_metadata_snapshot(d.id) THEN RAISE EXCEPTION 'Document, metadata or definitions changed; review again' USING ERRCODE='PT409'; END IF;
 n:=erp_private.f07_write_metadata(d.id,p_data->'values',actor);
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(d.id,'metadata_updated',n||' reviewed metadata fields saved',actor);
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values) VALUES(actor,'DMS','dms_document_metadata_values',d.id,'update',jsonb_build_object('count',n,'requestId',key));
 r:=jsonb_build_object('documentId',d.id,'savedCount',n,'requestId',key,'snapshot',erp_private.f07_metadata_snapshot(d.id));
 INSERT INTO erp_private.f07_metadata_receipts(actor,request_id,document_id,payload_hash,receipt) VALUES(actor,key,d.id,h,r);
 RETURN r;
END $$;

CREATE FUNCTION public.f07_metadata_operation(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_metadata_operation(p_action,p_data) $$;
-- Helpers are private implementation, not APIs. Grant only the one checked dispatcher.
REVOKE ALL ON FUNCTION erp_private.f07_metadata_column(text),erp_private.f07_validate_metadata_value(bigint,jsonb),erp_private.f07_metadata_snapshot(bigint),erp_private.f07_metadata_authority(bigint,boolean),erp_private.f07_guard_metadata_value(),erp_private.f07_write_metadata(bigint,jsonb,bigint),erp_private.f07_metadata_operation(text,jsonb),public.f07_metadata_operation(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_metadata_operation(text,jsonb),public.f07_metadata_operation(text,jsonb) TO authenticated;
COMMIT;
