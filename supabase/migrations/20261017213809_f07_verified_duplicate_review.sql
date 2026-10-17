BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE INDEX f07_existing_original_hash_review ON public.dms_document_files(lower(sha256_hash)) WHERE deleted_at IS NULL AND sha256_hash IS NOT NULL;
-- A caller-supplied allowDuplicate bit or mutable session marker is never an
-- override. Verify the actual source hash against retained document files,
-- require scoped manual review, and serialize equal-hash final admissions.
DO $patch$
DECLARE original text;needle text;addition text;
BEGIN
 SELECT pg_get_functiondef('erp_private.f07_intake_review_snapshot(bigint,bigint,date)'::regprocedure) INTO original;
 needle:='trusted boolean:=false;h text;reason text;token text;';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Duplicate review declaration drift';END IF;
 original:=replace(original,needle,needle||'duplicate_found boolean;');
 needle:=' SELECT * INTO a FROM public.dms_ai_extraction_results WHERE id=s.ai_result_id AND upload_session_id=s.id FOR SHARE;';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Duplicate review source boundary drift';END IF;
 addition:=$body$
 IF NOT pg_try_advisory_xact_lock(hashtextextended('f07-verified-intake:'||proof.sha256,0)) THEN
  RAISE EXCEPTION 'An equal-file operation is in progress. Retain and retry the original request.' USING ERRCODE='PT409';
 END IF;
 duplicate_found:=coalesce(s.is_duplicate,false) OR EXISTS(SELECT 1 FROM public.dms_document_files f JOIN public.dms_documents d ON d.id=f.document_id
  WHERE lower(f.sha256_hash)=proof.sha256 AND f.deleted_at IS NULL AND d.deleted_at IS NULL);
$body$;
 original:=replace(original,needle,addition||E'\n'||needle);
 needle:=' reason:=CASE WHEN NOT trusted THEN';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Duplicate override reason boundary drift';END IF;
 original:=replace(original,needle,' reason:=CASE WHEN duplicate_found THEN ''A matching or flagged original requires a scoped administrator to verify the file and justify the duplicate exception.'' WHEN NOT trusted THEN');
 needle:='''requiresOverride'',reason IS NOT NULL)::text';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Duplicate fingerprint boundary drift';END IF;
 original:=replace(original,needle,'''requiresOverride'',reason IS NOT NULL,''duplicate'',duplicate_found,''reason'',reason)::text');
 EXECUTE original;
END $patch$;
-- A retained operation may not silently swap its reviewed exception witness.
-- Such a changed outcome needs explicit reconciliation, not a new random run.
DO $patch$
DECLARE original text;needle text;addition text;
BEGIN
 SELECT pg_get_functiondef('erp_private.f07_batch_finalization_guard(jsonb)'::regprocedure) INTO original;
 needle:=' PERFORM erp_private.f07_assert_intake_review(sid,(plan.payload->>''document_type_id'')::bigint,(plan.payload->>''expiry_date'')::date);';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Retained duplicate review witness boundary drift';END IF;
 addition:=' IF plan.review_fingerprint IS DISTINCT FROM erp_private.f07_intake_review_snapshot(sid,(plan.payload->>''document_type_id'')::bigint,(plan.payload->>''expiry_date'')::date)->>''fingerprint'' THEN RAISE EXCEPTION ''Original reviewed exception changed; retain this operation for reconciliation'' USING ERRCODE=''PT409'';END IF;';
 EXECUTE replace(original,needle,needle||E'\n'||addition);
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
