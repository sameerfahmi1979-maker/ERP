-- Recover the normal search input proof from current, already attested originals.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.f07_semantic_refresh_content_proof(
 p_document bigint,p_version bigint,p_content bigint,p_source_hash text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 stored public.dms_document_content;
 original public.dms_document_files;
 artifact erp_private.dms_question_artifacts;
 source_texts text[]:=ARRAY[]::text[];
 parent_hashes text[]:=ARRAY[]::text[];
 file_bindings jsonb:='[]'::jsonb;
 binding jsonb;
 combined text;
BEGIN
 -- The semantic caller has already locked the running job, claim, and document.
 PERFORM 1 FROM public.dms_documents d JOIN public.dms_document_versions v
  ON v.id=d.current_version_id AND v.document_id=d.id
 WHERE d.id=p_document AND v.id=p_version AND v.is_current AND v.unlinked_at IS NULL
  AND d.deleted_at IS NULL FOR SHARE OF d,v;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO stored FROM public.dms_document_content c
  WHERE c.id=p_content AND c.document_id=p_document FOR SHARE;
 IF stored.id IS NULL OR nullif(btrim(stored.content_text),'') IS NULL
  OR stored.content_text_source IS NULL
  OR stored.content_text_source NOT IN ('ocr','truncated','system_resync')
  OR p_source_hash IS NULL
  OR erp_private.dms_question_text_hash(stored.content_text) IS DISTINCT FROM p_source_hash THEN
  RETURN false;
 END IF;

 FOR original IN
  SELECT f.* FROM public.dms_document_files f
  WHERE f.document_id=p_document AND f.version_id=p_version AND f.file_role='original'
    AND f.deleted_at IS NULL AND f.ocr_text IS NOT NULL
    AND (stored.content_text_source='system_resync'
      OR (stored.content_text_source='ocr' AND f.ocr_text=stored.content_text)
      OR (stored.content_text_source='truncated' AND char_length(f.ocr_text)>char_length(stored.content_text)
        AND left(f.ocr_text,char_length(stored.content_text))=stored.content_text))
  ORDER BY f.id FOR SHARE
 LOOP
  binding:=jsonb_build_array(jsonb_build_object('fileId',original.id,'versionId',p_version,
    'sha256',original.sha256_hash));
  SELECT a.* INTO artifact FROM erp_private.dms_question_artifacts a
  WHERE a.document_id=p_document AND a.version_id=p_version AND a.is_latest
   AND ((a.kind='file_ocr' AND a.artifact_key=original.id::text)
     OR (stored.content_text_source='system_resync' AND a.kind='prepared_text'
       AND split_part(a.artifact_key,'/',2)=original.id::text))
   AND original.ocr_status='complete' AND a.bindings=binding
   AND a.content_hash=erp_private.dms_question_text_hash(original.ocr_text)
   AND erp_private.dms_question_current(a)
  ORDER BY (a.kind='file_ocr') DESC,a.created_at DESC,a.proof_hash LIMIT 1 FOR SHARE;
  IF artifact.proof_hash IS NULL OR cardinality(parent_hashes)>=100 THEN RETURN false; END IF;
  source_texts:=array_append(source_texts,original.ocr_text);
  parent_hashes:=array_append(parent_hashes,artifact.proof_hash);
  file_bindings:=file_bindings||binding;
 END LOOP;
 IF cardinality(parent_hashes)=0 THEN RETURN false; END IF;

 IF stored.content_text_source='system_resync' THEN
  combined:=left(array_to_string(source_texts,E'\n\n'),500000);
  IF stored.content_text IS DISTINCT FROM combined
   OR stored.is_truncated IS DISTINCT FROM (char_length(combined)>=500000) THEN RETURN false; END IF;
 ELSIF cardinality(parent_hashes)<>1 THEN
  RETURN false;
 ELSIF stored.content_text_source='truncated' THEN
  IF NOT coalesce(stored.is_truncated,false)
   OR (char_length(stored.content_text)+regexp_count(stored.content_text COLLATE "C",U&'[\+010000-\+10FFFF]'))<>500000
    THEN RETURN false; END IF;
 ELSIF coalesce(stored.is_truncated,false) THEN
  RETURN false;
 END IF;

 RETURN erp_private.dms_question_record('content_text',p_document::text,p_document,p_version,
  p_source_hash,file_bindings,to_jsonb(parent_hashes));
END $$;

REVOKE ALL ON FUNCTION erp_private.f07_semantic_refresh_content_proof(bigint,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
