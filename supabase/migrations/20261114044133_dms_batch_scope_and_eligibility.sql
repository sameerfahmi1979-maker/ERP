BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE expected record;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.protect_upload_intake_scope()', 'b8134bbaf41fb512046317f466137b01'),
    ('erp_private.batch_identity_guard()', 'c9fed38712adb2cb7ffc5ae68b9a99c2'),
    ('erp_private.batch_graph_guard()', '38aa6589a0f84e96c968f63a0243d721'),
    ('erp_private.batch_source(bigint)', 'cd59afcbf093e0d3db23908479bfc833'),
    ('public.dms_upload_batch_eligibility(uuid)', '2f58dad1d9c93c2696d2893c9149ccbe')
  ) AS routines(signature, body_hash) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid=pg_catalog.to_regprocedure(expected.signature)
        AND (pg_catalog.md5(p.prosrc)=expected.body_hash
          -- The hosted copy of this one predecessor uses LF line endings.
          OR (expected.signature='erp_private.protect_upload_intake_scope()'
              AND pg_catalog.md5(p.prosrc)='16c217361823d9dab4bcf55ee61e471a'))) THEN
      RAISE EXCEPTION 'DMS batch prerequisite changed: %', expected.signature;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION erp_private.protect_upload_intake_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();
BEGIN
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NOT NULL AND NEW.uploaded_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Upload identity must match current actor' USING ERRCODE='42501'; END IF;
  IF NEW.origin_entity_type IS NOT NULL OR NEW.origin_entity_id IS NOT NULL THEN
   IF NEW.batch_id IS NOT NULL THEN RAISE EXCEPTION 'Batch context uses its existing admission contract' USING ERRCODE='22023'; END IF;
   SELECT company,branch INTO NEW.owning_company_id,NEW.owning_branch_id FROM erp_private.f07_upload_origin_scope(NEW.origin_entity_type,NEW.origin_entity_id);
  ELSIF NEW.batch_id IS NOT NULL AND NEW.admission_position IS NOT NULL THEN
   -- The admission validates and locks the context. The member and graph
   -- guards independently require this exact parent scope, actor and manifest.
   SELECT b.owning_company_id,b.owning_branch_id INTO NEW.owning_company_id,NEW.owning_branch_id
   FROM public.dms_upload_batches b
   WHERE b.id=NEW.batch_id AND b.admission_version=1 AND b.deleted_at IS NULL
     AND b.created_by=actor AND b.admission_auth_user_id=auth.uid();
   IF NOT FOUND THEN RAISE EXCEPTION 'Batch unavailable' USING ERRCODE='42501'; END IF;
  ELSIF NEW.batch_id IS NULL AND NEW.owning_company_id IS NOT NULL THEN
   PERFORM erp_private.f07_validate_upload_scope(NEW.owning_company_id,NEW.owning_branch_id);
  ELSE SELECT owner_company_id,branch_id INTO NEW.owning_company_id,NEW.owning_branch_id FROM public.user_profiles WHERE id=NEW.uploaded_by;
  END IF;
 ELSE
  IF ROW(NEW.origin_entity_type,NEW.origin_entity_id) IS DISTINCT FROM ROW(OLD.origin_entity_type,OLD.origin_entity_id) THEN
   RAISE EXCEPTION 'Upload origin is immutable; no historical origin is inferred' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NOT NULL THEN
   IF ROW(NEW.uploaded_by,NEW.owning_company_id,NEW.owning_branch_id,NEW.session_code,NEW.temp_storage_path)
    IS DISTINCT FROM ROW(OLD.uploaded_by,OLD.owning_company_id,OLD.owning_branch_id,OLD.session_code,OLD.temp_storage_path) THEN
    RAISE EXCEPTION 'Upload identity, scope and storage binding are immutable' USING ERRCODE='42501'; END IF;
   IF OLD.document_id IS NOT NULL AND NEW.document_id IS DISTINCT FROM OLD.document_id THEN RAISE EXCEPTION 'Completed upload document binding is immutable' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.dms_upload_batch_eligibility(p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb; b public.dms_upload_batches%rowtype; positions jsonb; visible_members bigint;
BEGIN
 receipt:=public.read_dms_upload_batch_admission(p_operation);
 -- On the fresh snapshot, use the same invoker RLS to count all retained
 -- members and select eligible positions together. The validated identity and
 -- manifest are immutable, so the second read need not serialize them again.
 SELECT count(*),coalesce(jsonb_agg(s.admission_position ORDER BY s.admission_position) FILTER (
  WHERE s.document_id IS NULL AND s.deleted_at IS NULL AND s.temp_cleaned_at IS NULL
    AND s.expires_at>clock_timestamp() AND s.status NOT IN ('completed','cancelled','expired')
    AND s.intake_status NOT IN ('approved','discarded','cancelled','expired')),'[]'::jsonb)
 INTO visible_members,positions
 FROM public.dms_upload_sessions s WHERE s.batch_id=(receipt->>'batch_id')::bigint;

 SELECT * INTO b FROM public.dms_upload_batches
 WHERE id=(receipt->>'batch_id')::bigint AND admission_version=1
   AND admission_operation_id=p_operation AND admission_auth_user_id=auth.uid()
   AND created_by=public.current_user_profile_id();
 IF NOT FOUND OR visible_members IS DISTINCT FROM b.total_files::bigint THEN
  RAISE EXCEPTION 'Batch unavailable' USING ERRCODE='42501';
 END IF;
 IF b.deleted_at IS NOT NULL OR b.status IN ('completed','cancelled')
  OR NOT erp_private.batch_fresh_context(b.owning_company_id,b.owning_branch_id,b.admission_manifest->'context',false)
  OR (b.entity_type='party' AND NOT EXISTS(SELECT 1 FROM public.parties WHERE id=b.entity_id AND is_active AND NOT is_locked)) THEN
  RETURN jsonb_build_object('eligible',false,'positions','[]'::jsonb);
 END IF;
 RETURN jsonb_build_object('eligible',true,'positions',positions);
END $$;

COMMIT;
