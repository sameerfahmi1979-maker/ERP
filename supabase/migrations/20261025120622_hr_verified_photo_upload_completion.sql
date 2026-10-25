BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Both finalizers already require a service-only byte-copy attestation and
-- revalidate object identity, size, hash, MIME and caller scope before insert.
-- Retain that verified fact on the new file instead of the legacy pending default.
-- No historical file is upgraded and no permission or proof check is removed.
DO $$DECLARE body text; old_columns text; new_columns text; old_values text; new_values text;
BEGIN
 SELECT pg_get_functiondef('public.finish_numbered_dms_upload(uuid,jsonb,text)'::regprocedure)INTO body;
 old_columns:='file_size_bytes,sha256_hash,created_by)';new_columns:='file_size_bytes,sha256_hash,created_by,integrity_status)';
 old_values:=$v$p_request#>>'{prepared,content_sha256}',actor) returning id into file_id;$v$;
 new_values:=$v$p_request#>>'{prepared,content_sha256}',actor,'verified') returning id into file_id;$v$;
 IF position(old_columns IN body)=0 OR position(old_values IN body)=0 OR position('perform erp_private.assert_verified_upload_copy' IN body)=0 THEN RAISE EXCEPTION 'Unknown numbered upload predecessor; review required';END IF;
 body:=replace(replace(body,old_columns,new_columns),old_values,new_values);EXECUTE body;
 SELECT pg_get_functiondef('erp_private.f07_finish_attachment(bigint,bigint,text,text)'::regprocedure)INTO body;
 old_columns:='file_size_bytes,sha256_hash,created_by,created_at)';new_columns:='file_size_bytes,sha256_hash,created_by,created_at,integrity_status)';
 old_values:='intent.verified_sha256,actor,at_time) RETURNING id INTO file_id;';new_values:='intent.verified_sha256,actor,at_time,''verified'') RETURNING id INTO file_id;';
 IF position(old_columns IN body)=0 OR position(old_values IN body)=0 OR position('No trusted copy verification' IN body)=0 OR position('Verified copy changed' IN body)=0 THEN RAISE EXCEPTION 'Unknown attachment predecessor; review required';END IF;
 body:=replace(replace(body,old_columns,new_columns),old_values,new_values);EXECUTE body;
END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
