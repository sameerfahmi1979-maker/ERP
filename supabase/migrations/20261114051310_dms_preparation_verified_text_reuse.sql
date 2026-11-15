BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- The current original and its text are already included in the reviewed
-- snapshot. Record which originals have a verified, completed OCR result.
DO $$
DECLARE body text; anchor text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
 WHERE oid='erp_private.ai_mod04_source(bigint)'::regprocedure AND md5(prosrc)='cc11aa31f643ba7a9d87cb754902f9b1';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown preparation source predecessor'; END IF;
 anchor:=$anchor$'size',f.file_size_bytes,'text',left(f.ocr_text,100000),'bucket'$anchor$;
 IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Unknown preparation file projection'; END IF;
 body:=replace(body,anchor,$projection$'size',f.file_size_bytes,'text',left(f.ocr_text,100000),
   'verifiedText',coalesce(f.integrity_status='verified' AND f.ocr_status='complete' AND f.ocr_completed_at IS NOT NULL
     AND nullif(btrim(f.ocr_text),'') IS NOT NULL AND f.sha256_hash ~ '^[a-f0-9]{64}$',false),'bucket'$projection$);
 EXECUTE body;
END $$;

-- A qualified source can become unqualified without changing its text. Fence
-- that case before every stage and publication without invalidating old jobs.
DO $$
DECLARE body text; anchor text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
 WHERE oid='erp_private.ai_mod05_preparation_worker_base(text,jsonb)'::regprocedure AND md5(prosrc)='d8fceb6fe529f7ee7e4d68baf682334a';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown preparation worker predecessor'; END IF;
 anchor:=$anchor$ IF p_action='context' THEN RETURN jsonb_build_object('success',true,'preparation',true,'context',c); END IF;$anchor$;
 IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Unknown preparation source check'; END IF;
 EXECUTE replace(body,anchor,$guard$
 IF c->>'mode'='reuse_text' AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(c->'source'->'files') stored
  WHERE stored->'verifiedText'='true'::jsonb AND c->'fileIds' @> jsonb_build_array(stored->'id')
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(actual->'files') fresh
    WHERE fresh->'id'=stored->'id' AND fresh->'verifiedText'='true'::jsonb)) THEN
  RAISE EXCEPTION 'Saved text verification changed' USING ERRCODE='PT409';
 END IF;
$guard$||anchor);
END $$;
COMMIT;
