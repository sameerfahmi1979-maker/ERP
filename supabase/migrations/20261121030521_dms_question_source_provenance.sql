BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE erp_private.dms_question_artifacts(
 proof_hash text PRIMARY KEY,kind text NOT NULL CHECK(kind IN('file_ocr','prepared_text','content_text','chunk_text','ai_summary')),artifact_key text NOT NULL,document_id bigint NOT NULL REFERENCES public.dms_documents,version_id bigint NOT NULL REFERENCES public.dms_document_versions,content_hash text NOT NULL CHECK(content_hash~'^[a-f0-9]{64}$'),bindings jsonb NOT NULL,parents jsonb NOT NULL,header_hash text,is_latest boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE UNIQUE INDEX dms_question_latest ON erp_private.dms_question_artifacts(document_id,kind,artifact_key) WHERE is_latest;
ALTER TABLE erp_private.dms_question_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_question_artifacts FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.dms_question_text_hash(v text) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$SELECT encode(sha256(convert_to(v,'UTF8')),'hex')$$;
CREATE FUNCTION erp_private.dms_question_artifact_text(a erp_private.dms_question_artifacts) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v text;
BEGIN
 CASE a.kind
 WHEN 'file_ocr' THEN SELECT f.ocr_text INTO v FROM public.dms_document_files f WHERE f.id=a.artifact_key::bigint AND f.document_id=a.document_id AND f.version_id=a.version_id AND f.deleted_at IS NULL AND f.ocr_status='complete';
 WHEN 'prepared_text' THEN SELECT c.preparation_stages->('ocr:'||split_part(a.artifact_key,'/',2))->'value'->>'text' INTO v FROM erp_private.f07_job_claims c JOIN public.dms_ai_job_queue q ON q.id=c.job_id WHERE c.job_id=split_part(a.artifact_key,'/',1)::bigint AND q.related_document_id=a.document_id AND c.preparation_context->>'resultId' IS NOT NULL AND c.preparation_stages->('ocr:'||split_part(a.artifact_key,'/',2))->>'state'='completed';
 WHEN 'content_text' THEN SELECT c.content_text INTO v FROM public.dms_document_content c WHERE c.document_id=a.document_id AND a.artifact_key=a.document_id::text;
 WHEN 'chunk_text' THEN SELECT c.chunk_text INTO v FROM public.dms_document_content_chunks c WHERE c.document_id=a.document_id AND c.id=a.artifact_key::bigint AND c.deleted_at IS NULL AND c.is_active;
 WHEN 'ai_summary' THEN SELECT d.ai_summary INTO v FROM public.dms_documents d WHERE d.id=a.document_id AND a.artifact_key=a.document_id::text AND d.ai_summary_status='complete';
 END CASE;
 RETURN v;
END $$;
CREATE FUNCTION erp_private.dms_question_current(a erp_private.dms_question_artifacts,depth int DEFAULT 0) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF NOT a.is_latest OR depth>3 OR NOT EXISTS(SELECT 1 FROM public.dms_documents d JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id WHERE d.id=a.document_id AND d.current_version_id=a.version_id AND d.deleted_at IS NULL AND v.unlinked_at IS NULL AND v.is_current)
 OR (a.kind='ai_summary' AND NOT EXISTS(SELECT 1 FROM public.dms_documents d LEFT JOIN public.dms_document_types t ON t.id=d.document_type_id LEFT JOIN public.dms_document_categories c ON c.id=d.category_id WHERE d.id=a.document_id AND erp_private.mobile_dms_hash(jsonb_build_object('number',d.document_no,'title',d.title,'type',t.name_en,'category',c.name_en,'issue',d.issue_date,'expiry',d.expiry_date))=a.header_hash))
 OR jsonb_array_length(a.bindings) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.bindings)b WHERE NOT EXISTS(SELECT 1 FROM public.dms_document_files f WHERE f.id=(b->>'fileId')::bigint AND f.version_id=a.version_id AND f.document_id=a.document_id AND f.version_id=(b->>'versionId')::bigint AND f.sha256_hash=b->>'sha256' AND f.file_role IN('original','attachment') AND f.deleted_at IS NULL))
 OR erp_private.dms_question_text_hash(erp_private.dms_question_artifact_text(a)) IS DISTINCT FROM a.content_hash THEN RETURN false; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(a.parents)h WHERE NOT EXISTS(SELECT 1 FROM erp_private.dms_question_artifacts parent WHERE parent.proof_hash=h AND parent.document_id=a.document_id AND parent.version_id=a.version_id AND erp_private.dms_question_current(parent,depth+1)));
END $$;
CREATE FUNCTION erp_private.dms_question_record(p_kind text,p_key text,doc bigint,ver bigint,h text,b jsonb,ps jsonb,header text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.dms_question_artifacts;
BEGIN
 a.kind:=p_kind;a.artifact_key:=p_key;a.document_id:=doc;a.version_id:=ver;a.content_hash:=h;a.bindings:=b;a.parents:=ps;a.is_latest:=true;a.header_hash:=header;
 a.proof_hash:=erp_private.mobile_dms_hash(jsonb_build_array('dms-question-artifact/1',doc,ver,p_kind,p_key,h,b,ps,header));
 PERFORM pg_advisory_xact_lock(hashtextextended('dms-question/'||doc||'/'||p_kind||'/'||p_key,0));
 IF NOT erp_private.dms_question_current(a) THEN RETURN false; END IF;
 UPDATE erp_private.dms_question_artifacts t SET is_latest=false WHERE t.document_id=doc AND t.kind=p_kind AND t.artifact_key=p_key AND t.is_latest AND t.proof_hash<>a.proof_hash;
 INSERT INTO erp_private.dms_question_artifacts AS t(proof_hash,kind,artifact_key,document_id,version_id,content_hash,bindings,parents,header_hash) VALUES(a.proof_hash,p_kind,p_key,doc,ver,h,b,ps,header)
 ON CONFLICT(proof_hash) DO UPDATE SET is_latest=true WHERE NOT t.is_latest;
 RETURN true;
END $$;
-- The preparation worker has already locked/rechecked the original claim and document
-- and verified the selected bytes. Only a newly completed, fingerprinted extraction qualifies.
CREATE FUNCTION erp_private.dms_question_capture_prepared() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; f jsonb; d bigint; h text; b jsonb;
BEGIN
 IF NEW.preparation_context->>'resultId' IS NULL OR OLD.preparation_context->>'resultId' IS NOT NULL THEN RETURN NEW; END IF;
 d:=(NEW.preparation_context->'source'->>'documentId')::bigint;
 FOR f IN SELECT value FROM jsonb_array_elements(NEW.preparation_context->'source'->'files') LOOP
  v:=NEW.preparation_stages->('ocr:'||(f->>'id'))->'value';
  IF NEW.preparation_context->'fileIds' @> jsonb_build_array(f->'id') AND NEW.preparation_stages->('ocr:'||(f->>'id'))->>'state'='completed' AND v->>'sha256'=f->>'sha256' AND v->>'versionId'=f->>'versionId' AND v->>'fileId'=f->>'id' AND v->>'artifactContentHash'=erp_private.dms_question_text_hash(v->>'text') THEN
   h:=v->>'artifactContentHash';b:=jsonb_build_array(jsonb_build_object('fileId',f->'id','versionId',f->'versionId','sha256',v->'sha256'));
   IF NOT erp_private.dms_question_record('prepared_text',NEW.job_id::text||'/'||(f->>'id'),d,(f->>'versionId')::bigint,h,b,'[]') THEN RAISE EXCEPTION 'Verified preparation source changed' USING ERRCODE='PT409'; END IF;
  END IF;
 END LOOP; RETURN NEW;
END $$;
CREATE TRIGGER dms_question_prepared AFTER UPDATE OF preparation_context ON erp_private.f07_job_claims FOR EACH ROW EXECUTE FUNCTION erp_private.dms_question_capture_prepared();
-- Trusted writes can retain an input snapshot before slow work. The service receives only a boolean.
CREATE TABLE erp_private.dms_question_inputs(id uuid PRIMARY KEY,document_id bigint NOT NULL,version_id bigint NOT NULL,parents jsonb NOT NULL,header_hash text,expires_at timestamptz NOT NULL);
CREATE INDEX dms_question_input_expiry ON erp_private.dms_question_inputs(expires_at);
ALTER TABLE erp_private.dms_question_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_question_inputs FROM PUBLIC,anon,authenticated,service_role;
-- Writer-only attestation. A normal PostgREST caller cannot publish provenance.
CREATE FUNCTION erp_private.dms_question_publish(p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc bigint:=(p_data->>'documentId')::bigint; ver bigint:=(p_data->>'versionId')::bigint; k text:=p_data->>'kind'; key text:=p_data->>'artifactId'; b jsonb; ps jsonb:=coalesce(p_data->'derivationHashes','[]'); parents int; input erp_private.dms_question_inputs; hdr jsonb; refs jsonb:=p_data->'refs';
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted writer required' USING ERRCODE='42501'; END IF;
 IF k='reserve_input' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','kind','inputId','refs','header']);
  IF jsonb_typeof(refs) IS DISTINCT FROM 'array' OR jsonb_array_length(refs) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
  SELECT d.current_version_id,jsonb_build_object('number',d.document_no,'title',d.title,'type',t.name_en,'category',c.name_en,'issue',d.issue_date,'expiry',d.expiry_date) INTO ver,hdr FROM public.dms_documents d LEFT JOIN public.dms_document_types t ON t.id=d.document_type_id LEFT JOIN public.dms_document_categories c ON c.id=d.category_id WHERE d.id=doc AND d.deleted_at IS NULL FOR SHARE OF d;
  IF ver IS NULL OR (p_data->'header'<>'null'::jsonb AND hdr IS DISTINCT FROM p_data->'header') THEN RETURN false; END IF;
  SELECT count(*),jsonb_agg(a.proof_hash ORDER BY ref.ordinality) INTO parents,ps FROM jsonb_array_elements(refs) WITH ORDINALITY ref(v,ordinality) JOIN erp_private.dms_question_artifacts a ON a.document_id=doc AND a.version_id=ver AND a.kind=ref.v->>'kind' AND a.artifact_key=ref.v->>'artifactId' AND a.content_hash=ref.v->>'artifactContentHash' WHERE a.is_latest AND erp_private.dms_question_current(a);
  IF parents<>jsonb_array_length(refs) THEN RETURN false; END IF;
  DELETE FROM erp_private.dms_question_inputs WHERE expires_at<=clock_timestamp();
  INSERT INTO erp_private.dms_question_inputs VALUES((p_data->>'inputId')::uuid,doc,ver,ps,CASE WHEN p_data->'header'<>'null'::jsonb THEN erp_private.mobile_dms_hash(hdr) END,clock_timestamp()+interval '30 minutes');
  RETURN true;
 ELSIF k IN ('content_text','chunk_text','ai_summary') THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','kind','artifactId','artifactContentHash','inputId']);
  SELECT * INTO input FROM erp_private.dms_question_inputs WHERE id=(p_data->>'inputId')::uuid AND document_id=doc AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RETURN false; END IF;
  ver:=input.version_id;ps:=input.parents;p_data:=(p_data-'inputId')||jsonb_build_object('versionId',ver,'derivationHashes',ps,'headerHash',input.header_hash);
 END IF;
 PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','versionId','kind','artifactId','artifactContentHash','derivationHashes'],ARRAY['fileBindings','headerHash']);
 IF k NOT IN ('file_ocr','content_text','chunk_text','ai_summary') OR jsonb_typeof(ps)<>'array' OR jsonb_array_length(ps)>100 OR NOT coalesce(p_data->>'artifactContentHash'~'^[a-f0-9]{64}$',false) THEN RAISE EXCEPTION 'Invalid lineage' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.dms_documents WHERE id=doc AND current_version_id=ver AND deleted_at IS NULL FOR SHARE; IF NOT FOUND THEN RETURN false; END IF;
 IF k='ai_summary' AND NOT EXISTS(SELECT 1 FROM public.dms_documents d LEFT JOIN public.dms_document_types t ON t.id=d.document_type_id LEFT JOIN public.dms_document_categories c ON c.id=d.category_id WHERE d.id=doc AND erp_private.mobile_dms_hash(jsonb_build_object('number',d.document_no,'title',d.title,'type',t.name_en,'category',c.name_en,'issue',d.issue_date,'expiry',d.expiry_date))=p_data->>'headerHash') THEN RETURN false; END IF;
 IF k='file_ocr' THEN
  b:=p_data->'fileBindings';
  IF jsonb_typeof(b) IS DISTINCT FROM 'array' OR jsonb_array_length(b)<>1 OR b->0->>'fileId' IS DISTINCT FROM key OR jsonb_array_length(ps)<>0 THEN RETURN false; END IF;
 ELSE
  IF jsonb_array_length(ps)=0 THEN RETURN false;END IF;
  SELECT count(*) INTO parents FROM erp_private.dms_question_artifacts a WHERE a.document_id=doc AND a.version_id=ver AND ps ? a.proof_hash AND
  CASE WHEN k='content_text' THEN a.kind='file_ocr' ELSE a.kind='content_text' END AND erp_private.dms_question_current(a);
  IF parents<>jsonb_array_length(ps) OR (k IN('ai_summary','chunk_text') AND parents<>1) THEN RETURN false; END IF;
  SELECT jsonb_agg(v ORDER BY (v->>'fileId')::bigint) INTO b FROM (SELECT DISTINCT x v FROM erp_private.dms_question_artifacts a CROSS JOIN LATERAL jsonb_array_elements(a.bindings)x WHERE a.document_id=doc AND a.version_id=ver AND ps ? a.proof_hash) s;
 END IF;
 RETURN erp_private.dms_question_record(k,key,doc,ver,p_data->>'artifactContentHash',b,ps,p_data->>'headerHash');
END $$;
CREATE FUNCTION public.dms_question_publish(p_data jsonb) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.dms_question_publish(p_data)$$;
-- A one-time server authorization binds the caller and selection to this read.
CREATE TABLE erp_private.dms_question_tickets(ticket uuid PRIMARY KEY,subject uuid NOT NULL,session_id uuid NOT NULL,selection jsonb NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX dms_question_ticket_expiry ON erp_private.dms_question_tickets(expires_at);
ALTER TABLE erp_private.dms_question_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_question_tickets FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.dms_question_authorize(p_ticket uuid,p_subject uuid,p_session uuid,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server operation required' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','sourceHash','contextMode']);
 DELETE FROM erp_private.dms_question_tickets WHERE expires_at<=clock_timestamp();
 INSERT INTO erp_private.dms_question_tickets VALUES(p_ticket,p_subject,p_session,p_data,clock_timestamp()+interval '20 seconds');
 RETURN true;
END $$;
CREATE FUNCTION public.dms_question_authorize(p_ticket uuid,p_subject uuid,p_session uuid,p_data jsonb) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.dms_question_authorize(p_ticket,p_subject,p_session,p_data)$$;
REVOKE ALL ON FUNCTION public.dms_question_authorize(uuid,uuid,uuid,jsonb),erp_private.dms_question_authorize(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dms_question_authorize(uuid,uuid,uuid,jsonb),erp_private.dms_question_authorize(uuid,uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION erp_private.mobile_dms_question_context(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc bigint:=(p_data->>'documentId')::bigint; src jsonb; mode text:=p_data->>'contextMode'; d public.dms_documents; meta jsonb; artifacts jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT (p_data?'ticket') THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 DELETE FROM erp_private.dms_question_tickets WHERE ticket=(p_data->>'ticket')::uuid AND subject=auth.uid() AND session_id=(auth.jwt()->>'session_id')::uuid AND selection=p_data-'ticket' AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'Server authorization expired' USING ERRCODE='42501'; END IF;
 p_data:=p_data-'ticket';
 IF NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_DOCUMENT_QA' AND is_enabled) THEN RAISE EXCEPTION 'Question feature unavailable' USING ERRCODE='55000'; END IF;
 IF coalesce(mode,'') NOT IN('metadata_only','verified_text') THEN RAISE EXCEPTION 'Invalid grounding mode' USING ERRCODE='22023';END IF;
 src:=erp_private.mobile_dms_source(p_data-'contextMode',ARRAY['dms.documents.view','dms.documents.preview']);
 SELECT * INTO STRICT d FROM public.dms_documents WHERE id=doc;
 IF d.confidentiality_level IN('hr','legal','executive') AND NOT erp_private.mobile_dms_can(doc,'dms.admin') THEN RAISE EXCEPTION 'Confidential source' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('number',d.document_no,'title',d.title,'issue',d.issue_date,'expiry',d.expiry_date,'type',(SELECT name_en FROM public.dms_document_types WHERE id=d.document_type_id),'fields',coalesce(jsonb_agg(jsonb_build_object('code',f.field_code,'label',f.field_label_en,'value',coalesce(v.value_json,to_jsonb(v.value_boolean),to_jsonb(v.value_date),to_jsonb(v.value_datetime),to_jsonb(v.value_number),to_jsonb(v.value_text))) ORDER BY f.id) FILTER(WHERE f.id IS NOT NULL),'[]'))
 INTO meta FROM public.dms_document_metadata_values v JOIN public.dms_metadata_definitions f ON f.id=v.definition_id WHERE v.document_id=doc AND v.deleted_at IS NULL AND f.document_type_id=d.document_type_id AND f.deleted_at IS NULL AND f.is_active;
 IF octet_length(meta::text)>65536 OR jsonb_array_length(meta->'fields')>250 THEN RAISE EXCEPTION 'Grounding limit' USING ERRCODE='54000'; END IF;
 IF mode='verified_text' THEN
  WITH verified AS MATERIALIZED(SELECT a.*,erp_private.dms_question_artifact_text(a) content FROM erp_private.dms_question_artifacts a WHERE a.document_id=doc AND a.version_id=d.current_version_id AND erp_private.dms_question_current(a) ORDER BY CASE a.kind WHEN 'prepared_text' THEN 0 WHEN 'file_ocr' THEN 1 WHEN 'content_text' THEN 2 WHEN 'chunk_text' THEN 3 ELSE 4 END,a.artifact_key LIMIT 251)
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind',v.kind,'artifactId',v.artifact_key,'documentId',doc,'versionId',v.version_id,'artifactContentHash',v.content_hash,'proofHash',v.proof_hash,'fileBindings',v.bindings,'derivationHashes',v.parents,'text',left(v.content,8000),'truncated',length(v.content)>8000)||CASE WHEN v.kind='chunk_text' THEN jsonb_build_object('chunkIndex',(SELECT c.chunk_index FROM public.dms_document_content_chunks c WHERE c.id=v.artifact_key::bigint AND c.document_id=v.document_id AND c.is_active)) ELSE '{}'::jsonb END ORDER BY v.kind,v.artifact_key),'[]') INTO artifacts FROM verified v;
  IF jsonb_array_length(artifacts)>250 OR octet_length(artifacts::text)>1048576 THEN RAISE EXCEPTION 'Grounding limit' USING ERRCODE='54000'; END IF;
 ELSE artifacts:='[]'; END IF;
 RETURN jsonb_build_object('source',src,'metadata',meta,'artifacts',artifacts);
END $$;
CREATE FUNCTION public.mobile_dms_question_context(p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.mobile_dms_question_context(p_data)$$;
REVOKE ALL ON FUNCTION erp_private.dms_question_text_hash(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.dms_question_artifact_text(erp_private.dms_question_artifacts) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.dms_question_current(erp_private.dms_question_artifacts,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.dms_question_record(text,text,bigint,bigint,text,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.dms_question_capture_prepared() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.dms_question_publish(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.dms_question_publish(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_question_context(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_question_context(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_question_context(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_question_context(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dms_question_publish(jsonb),erp_private.dms_question_publish(jsonb) TO service_role;
COMMIT;
