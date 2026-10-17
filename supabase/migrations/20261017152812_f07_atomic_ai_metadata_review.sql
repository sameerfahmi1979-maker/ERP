-- Restore the intended history contract where the old migration never created it
-- (it referenced obsolete role tables). Do not fabricate business records.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE TABLE IF NOT EXISTS public.dms_ai_metadata_apply_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 ai_result_id bigint REFERENCES public.dms_ai_extraction_results(id),applied_by bigint NOT NULL REFERENCES public.user_profiles(id),
 apply_status text NOT NULL DEFAULT 'completed',selected_count integer NOT NULL DEFAULT 0,applied_count integer NOT NULL DEFAULT 0,
 skipped_count integer NOT NULL DEFAULT 0,replace_confirmed boolean NOT NULL DEFAULT false,low_confidence_confirmed boolean NOT NULL DEFAULT false,
 error_message text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.dms_ai_metadata_apply_items (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,apply_run_id bigint NOT NULL REFERENCES public.dms_ai_metadata_apply_runs(id),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),definition_id bigint REFERENCES public.dms_metadata_definitions(id),field_code text NOT NULL,
 old_value_summary text,new_value_summary text,confidence_score numeric(5,4),confidence_label text,apply_mode text,
 item_status text NOT NULL DEFAULT 'applied',skip_reason text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS f07_metadata_history_document ON public.dms_ai_metadata_apply_runs(document_id,id);
CREATE INDEX IF NOT EXISTS f07_metadata_history_run ON public.dms_ai_metadata_apply_items(apply_run_id,id);
ALTER TABLE public.dms_ai_metadata_apply_runs ENABLE ROW LEVEL SECURITY;ALTER TABLE public.dms_ai_metadata_apply_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_metadata_apply_items ENABLE ROW LEVEL SECURITY;ALTER TABLE public.dms_ai_metadata_apply_items FORCE ROW LEVEL SECURITY;
-- Old global policies must not broaden the new document-scoped contract.
DO $$ DECLARE p record;BEGIN FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('dms_ai_metadata_apply_runs','dms_ai_metadata_apply_items') LOOP EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename); END LOOP; END $$;
REVOKE ALL ON public.dms_ai_metadata_apply_runs,public.dms_ai_metadata_apply_items FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.dms_ai_metadata_apply_runs,public.dms_ai_metadata_apply_items TO authenticated,service_role;
CREATE POLICY f07_metadata_history_read ON public.dms_ai_metadata_apply_runs FOR SELECT TO authenticated USING(erp_private.document_permission(document_id,'dms.documents.view'));
CREATE POLICY f07_metadata_items_read ON public.dms_ai_metadata_apply_items FOR SELECT TO authenticated USING(erp_private.document_permission(document_id,'dms.documents.view'));

CREATE FUNCTION erp_private.f07_ai_metadata_apply(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<ai>>
DECLARE d public.dms_documents; actor bigint; key uuid; h text; saved erp_private.f07_metadata_receipts; a public.dms_ai_extraction_results;
 def public.dms_metadata_definitions; selection jsonb; val jsonb; currentval jsonb; col text; values jsonb:='[]'; fields jsonb:='[]'; source_hash text;
 r jsonb; runid bigint; n integer; confidence numeric; threshold numeric; history jsonb:='[]'; entry jsonb;
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>1048576 THEN RAISE EXCEPTION 'Invalid metadata review' USING ERRCODE='22023'; END IF;
 d:=erp_private.f07_metadata_authority((p_data->>'documentId')::bigint,false);actor:=public.current_user_profile_id();
 IF NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin')) THEN RAISE EXCEPTION 'Edit permission required' USING ERRCODE='42501'; END IF;
 key:=(p_data->>'requestId')::uuid;h:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 IF key IS NULL THEN RAISE EXCEPTION 'Retain metadata review identity' USING ERRCODE='22023'; END IF;
 SELECT * INTO saved FROM erp_private.f07_metadata_receipts WHERE f07_metadata_receipts.actor=ai.actor AND request_id=key;
 IF FOUND THEN IF saved.payload_hash<>h OR saved.document_id<>d.id THEN RAISE EXCEPTION 'Metadata request reused' USING ERRCODE='PT409'; END IF;RETURN saved.receipt; END IF;
 d:=erp_private.f07_metadata_authority(d.id,true);
 IF p_data->>'snapshot' IS DISTINCT FROM erp_private.f07_metadata_snapshot(d.id) THEN RAISE EXCEPTION 'Reviewed metadata or schema changed' USING ERRCODE='PT409'; END IF;
 SELECT * INTO a FROM public.dms_ai_extraction_results WHERE id=(p_data->>'aiResultId')::bigint AND document_id=d.id FOR UPDATE;
 IF NOT FOUND OR a.ai_status NOT IN ('pending_review','accepted','partially_accepted') OR coalesce(a.review_action,'') IN ('rejected','dismissed') THEN RAISE EXCEPTION 'AI suggestion unavailable' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.f07_check_ai_source(a.id,d.id);
 source_hash:=encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex');
 IF p_data->>'sourceSnapshot' IS DISTINCT FROM source_hash THEN RAISE EXCEPTION 'AI suggestion changed since review' USING ERRCODE='PT409'; END IF;
 IF a.file_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dms_document_files f JOIN public.dms_documents doc ON doc.current_version_id=f.version_id WHERE f.id=a.file_id AND f.document_id=d.id AND doc.id=d.id AND f.deleted_at IS NULL) THEN RAISE EXCEPTION 'AI source file was replaced' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p_data->'selections') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'selections') NOT BETWEEN 1 AND 50 OR
  (SELECT count(*) FROM jsonb_array_elements(p_data->'selections'))<>(SELECT count(DISTINCT x->>'definitionId') FROM jsonb_array_elements(p_data->'selections') x) THEN RAISE EXCEPTION 'Invalid or duplicate selected fields' USING ERRCODE='22023'; END IF;
 FOR selection IN SELECT x FROM jsonb_array_elements(p_data->'selections') x ORDER BY (x->>'definitionId')::bigint LOOP
  SELECT * INTO def FROM public.dms_metadata_definitions WHERE id=(selection->>'definitionId')::bigint AND document_type_id=d.document_type_id AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR NOT def.is_ai_extractable OR def.field_code IS DISTINCT FROM selection->>'fieldCode' THEN RAISE EXCEPTION 'AI field definition changed or not extractable' USING ERRCODE='22023'; END IF;
  col:=erp_private.f07_metadata_column(def.field_type);val:=a.extracted_fields_json->def.field_code;
  -- Only exact known types are coerced. Never parse a numeric prefix or invent a calendar date.
  IF jsonb_typeof(val)='string' THEN
   IF col='value_number' THEN IF val#>>'{}' !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION 'Invalid AI number' USING ERRCODE='22023'; END IF;val:=to_jsonb((val#>>'{}')::numeric);
   ELSIF col='value_boolean' THEN IF lower(val#>>'{}') NOT IN ('true','false','yes','no','1','0') THEN RAISE EXCEPTION 'Invalid AI boolean' USING ERRCODE='22023'; END IF;val:=to_jsonb(lower(val#>>'{}') IN ('true','yes','1'));
   ELSIF col='value_json' THEN val:=(val#>>'{}')::jsonb; END IF;
  END IF;
  PERFORM erp_private.f07_validate_metadata_value(def.id,jsonb_build_object(col,val));
  IF val IS NULL OR val='null'::jsonb THEN RAISE EXCEPTION 'No AI value to apply' USING ERRCODE='22023'; END IF;
  SELECT to_jsonb(m)->col INTO currentval FROM public.dms_document_metadata_values m WHERE document_id=d.id AND definition_id=def.id AND deleted_at IS NULL;
  IF selection->>'applyMode' NOT IN ('fill_missing_only','replace_selected') OR selection->>'applyMode' IS NULL THEN RAISE EXCEPTION 'Invalid apply mode' USING ERRCODE='22023'; END IF;
  IF currentval IS NOT NULL AND currentval<>'null'::jsonb AND currentval<>val AND (selection->>'applyMode'='fill_missing_only' OR p_data->'confirmation'->'replaceExistingConfirmed' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'Explicit replacement confirmation required' USING ERRCODE='22023'; END IF;
  confidence:=nullif(a.field_confidence_json->def.field_code->>'score','')::numeric;threshold:=coalesce(def.ai_confidence_threshold,0.8);
  IF (confidence IS NULL OR confidence<threshold OR def.review_required_if_low_confidence) AND p_data->'confirmation'->'lowConfidenceConfirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Low-confidence review confirmation required' USING ERRCODE='22023'; END IF;
  values:=values||jsonb_build_array(jsonb_build_object('definition_id',def.id,col,val));fields:=fields||jsonb_build_array(def.field_code);
  history:=history||jsonb_build_array(jsonb_build_object('definitionId',def.id,'fieldCode',def.field_code,'old',left(currentval#>>'{}',100),'new',left(val#>>'{}',100),'confidence',confidence,'label',a.field_confidence_json->def.field_code->>'label','mode',selection->>'applyMode'));
 END LOOP;
 n:=erp_private.f07_write_metadata(d.id,values,actor);
 INSERT INTO public.dms_ai_metadata_apply_runs(document_id,ai_result_id,applied_by,apply_status,selected_count,applied_count,skipped_count,replace_confirmed,low_confidence_confirmed,completed_at)
 VALUES(d.id,a.id,actor,'completed',n,n,0,coalesce((p_data->'confirmation'->>'replaceExistingConfirmed')::boolean,false),coalesce((p_data->'confirmation'->>'lowConfidenceConfirmed')::boolean,false),clock_timestamp()) RETURNING id INTO runid;
 FOR entry IN SELECT x FROM jsonb_array_elements(history) x LOOP
  INSERT INTO public.dms_ai_metadata_apply_items(apply_run_id,document_id,definition_id,field_code,old_value_summary,new_value_summary,confidence_score,confidence_label,apply_mode,item_status)
  VALUES(runid,d.id,(entry->>'definitionId')::bigint,entry->>'fieldCode',entry->>'old',entry->>'new',(entry->>'confidence')::numeric,entry->>'label',entry->>'mode','applied');
 END LOOP;
 UPDATE public.dms_ai_extraction_results SET ai_status='partially_accepted',reviewed_by=actor,reviewed_at=clock_timestamp(),review_action='metadata_selected_fields_applied' WHERE id=a.id;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(d.id,'ai_metadata_applied',n||' human-reviewed AI fields applied',actor);
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values) VALUES(actor,'DMS','dms_ai_metadata_apply_runs',runid,'ai_metadata_applied',jsonb_build_object('documentId',d.id,'count',n,'requestId',key));
 r:=jsonb_build_object('documentId',d.id,'requestId',key,'appliedCount',n,'skippedCount',0,'appliedFields',fields,'skippedFields','[]'::jsonb,'aiResultStatus','partially_accepted');
 INSERT INTO erp_private.f07_metadata_receipts(actor,request_id,document_id,payload_hash,receipt) VALUES(actor,key,d.id,h,r);RETURN r;
END $$;
CREATE FUNCTION public.f07_ai_metadata_apply(p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_ai_metadata_apply(p_data) $$;
REVOKE ALL ON FUNCTION erp_private.f07_ai_metadata_apply(jsonb),public.f07_ai_metadata_apply(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_ai_metadata_apply(jsonb),public.f07_ai_metadata_apply(jsonb) TO authenticated;
COMMIT;
