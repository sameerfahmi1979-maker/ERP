BEGIN;

-- Review drafts are private, actor-owned working copies, not document writes.
CREATE TABLE erp_private.dms_preparation_review_drafts (
 job_id bigint PRIMARY KEY REFERENCES public.dms_ai_job_queue(id) ON DELETE RESTRICT,
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 document_id bigint NOT NULL REFERENCES public.dms_documents(id) ON DELETE RESTRICT,
 source_snapshot text NOT NULL CHECK (source_snapshot ~ '^[a-f0-9]{64}$'),
 revision integer NOT NULL CHECK (revision > 0),
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 review_values jsonb NOT NULL CHECK (jsonb_typeof(review_values)='object'),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE erp_private.dms_preparation_review_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_preparation_review_drafts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.dms_saved_document_review(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); doc bigint; job bigint; s jsonb; recovered jsonb; c jsonb;
 candidate jsonb; draft erp_private.dms_preparation_review_drafts; payload jsonb; selections text[];
 request uuid; digest text; expected integer; state text; approval text;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() THEN
  RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('open','save_draft') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object'
  OR octet_length(p_data::text)>65536 THEN RAISE EXCEPTION 'Invalid review request' USING ERRCODE='22023'; END IF;
 doc:=(p_data->>'documentId')::bigint;
 IF NOT coalesce(erp_private.dms_file_pipeline_manager(doc),false) THEN
  RAISE EXCEPTION 'DMS manager or scoped administrator required' USING ERRCODE='42501';
 END IF;
 IF p_action='open' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k<>'documentId') THEN RAISE EXCEPTION 'Unknown property' USING ERRCODE='22023'; END IF;
  -- One transaction instead of two competing source reads. Neither enqueues work.
  s:=erp_private.ai_mod04_preparation('snapshot',p_data);
  recovered:=erp_private.ai_mod04_preparation('recover',p_data)->'recovery';
  SELECT d.status,d.approval_status INTO state,approval FROM public.dms_documents d WHERE d.id=doc;
  SELECT * INTO draft FROM erp_private.dms_preparation_review_drafts r
   WHERE r.job_id=(recovered->>'jobId')::bigint AND r.actor_id=actor AND r.document_id=doc
   AND recovered->>'state'='review_required';
  RETURN jsonb_build_object('source',s,'recovery',recovered,'documentStatus',state,'approvalStatus',approval,
   'draft',CASE WHEN draft.job_id IS NULL THEN NULL ELSE jsonb_build_object('revision',draft.revision,
    'snapshot',draft.source_snapshot,'values',draft.review_values,'current',draft.source_snapshot=s->>'snapshot') END);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN ('documentId','jobId','snapshot','requestId','expectedRevision','values')) THEN RAISE EXCEPTION 'Unknown property' USING ERRCODE='22023'; END IF;
 job:=(p_data->>'jobId')::bigint; request:=(p_data->>'requestId')::uuid;
 expected:=(p_data->>'expectedRevision')::integer; payload:=p_data->'values';
 IF job IS NULL OR request IS NULL OR expected IS NULL OR expected<0 OR p_data->>'snapshot' IS NULL
  OR p_data->>'snapshot' !~ '^[a-f0-9]{64}$' OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('selections','edits','refreshDerived'))
  OR jsonb_typeof(payload->'selections') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'edits') IS DISTINCT FROM 'object'
  OR jsonb_typeof(payload->'refreshDerived') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid review draft' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(value),'{}'::text[]) INTO selections FROM jsonb_array_elements_text(payload->'selections');
 IF cardinality(selections)>50 OR cardinality(selections)<>(SELECT count(DISTINCT x) FROM unnest(selections) x)
  OR EXISTS(SELECT 1 FROM unnest(selections) x WHERE x IS NULL OR x !~ '^(title|description|issue_date|expiry_date|document_type_id|metadata:[1-9][0-9]*)$')
  OR EXISTS(SELECT 1 FROM jsonb_each(payload->'edits') e WHERE e.key !~ '^(title|description|issue_date|expiry_date|metadata:[1-9][0-9]*)$'
    OR jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>16000) THEN RAISE EXCEPTION 'Invalid draft fields' USING ERRCODE='22023'; END IF;
 -- Worker/apply lock order: queue, claim, document, source, draft.
 PERFORM q.id FROM public.dms_ai_job_queue q WHERE q.id=job AND q.related_document_id=doc AND q.created_by=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501'; END IF;
 SELECT preparation_context INTO c FROM erp_private.f07_job_claims WHERE job_id=job FOR UPDATE;
 s:=erp_private.ai_mod04_preparation('status',jsonb_build_object('documentId',doc,'jobId',job));
 PERFORM erp_private.ai_mod04_lock_profile_authority(actor);
 IF NOT coalesce(erp_private.dms_file_pipeline_manager(doc),false) THEN RAISE EXCEPTION 'Review authority changed' USING ERRCODE='42501'; END IF;
 IF c->>'state' IS DISTINCT FROM 'review_required' OR s->'sourceCurrent' IS DISTINCT FROM 'true'::jsonb
  OR c->>'snapshot' IS DISTINCT FROM p_data->>'snapshot' THEN RAISE EXCEPTION 'Review source changed' USING ERRCODE='PT409'; END IF;
 candidate:=s->'candidate';
 IF jsonb_typeof(candidate->'values') IS DISTINCT FROM 'array'
  OR EXISTS(SELECT 1 FROM unnest(selections) k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(candidate->'values') v WHERE v->>'key'=k))
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload->'edits') k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(candidate->'values') v WHERE v->>'key'=k))
  THEN RAISE EXCEPTION 'Unknown review field' USING ERRCODE='22023'; END IF;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 SELECT * INTO draft FROM erp_private.dms_preparation_review_drafts WHERE job_id=job FOR UPDATE;
 IF FOUND AND (draft.actor_id<>actor OR draft.document_id<>doc) THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501'; END IF;
 IF draft.request_id=request THEN
  IF draft.request_hash<>digest THEN RAISE EXCEPTION 'Original draft request differs' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('documentId',doc,'jobId',job,'requestId',request,'revision',draft.revision,'saved',true);
 END IF;
 IF coalesce(draft.revision,0)<>expected THEN RAISE EXCEPTION 'Draft was changed in another session' USING ERRCODE='PT409'; END IF;
 INSERT INTO erp_private.dms_preparation_review_drafts(job_id,actor_id,document_id,source_snapshot,revision,request_id,request_hash,review_values)
 VALUES(job,actor,doc,p_data->>'snapshot',expected+1,request,digest,payload)
 ON CONFLICT(job_id) DO UPDATE SET revision=EXCLUDED.revision,request_id=EXCLUDED.request_id,
  request_hash=EXCLUDED.request_hash,review_values=EXCLUDED.review_values,updated_at=clock_timestamp();
 RETURN jsonb_build_object('documentId',doc,'jobId',job,'requestId',request,'revision',expected+1,'saved',true);
END $$;
REVOKE ALL ON FUNCTION erp_private.dms_saved_document_review(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_saved_document_review(text,jsonb) TO authenticated;
CREATE FUNCTION public.dms_saved_document_review(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.dms_saved_document_review(p_action,p_data) $$;
REVOKE ALL ON FUNCTION public.dms_saved_document_review(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.dms_saved_document_review(text,jsonb) TO authenticated;

-- Same role gate at final apply, including a previously prepared review.
DO $$ DECLARE body text; needle text:=' d:=erp_private.f07_metadata_authority(j.related_document_id,false);'; authority_lock text:=' PERFORM erp_private.ai_mod04_lock_profile_authority(actor);'; gate text:=E' IF NOT coalesce(erp_private.dms_file_pipeline_manager(j.related_document_id),false) THEN RAISE EXCEPTION \'DMS manager or scoped administrator required\' USING ERRCODE=\'42501\'; END IF;\n'; BEGIN
 body:=pg_get_functiondef('erp_private.ai_mod04_apply_preparation(jsonb)'::regprocedure);
 IF position(needle IN body)=0 OR position(authority_lock IN body)=0 THEN RAISE EXCEPTION 'Review apply prerequisite differs'; END IF;
 EXECUTE replace(replace(body,needle,gate||needle),authority_lock,authority_lock||E'\n'||gate);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
