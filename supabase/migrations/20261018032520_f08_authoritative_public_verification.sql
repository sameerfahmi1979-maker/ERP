BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Public disclosure is a flat, output-specific allowlist. Nested objects and
-- arrays are rejected as a whole, not flattened into accidental disclosures.
CREATE OR REPLACE FUNCTION erp_private.f08_public_fields(payload jsonb, output_type text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT COALESCE(jsonb_object_agg(key, to_jsonb(left(value #>> '{}', 256))), '{}'::jsonb)
 FROM jsonb_each(CASE WHEN jsonb_typeof(payload) = 'object' THEN payload ELSE '{}'::jsonb END)
 WHERE key = ANY(ARRAY['document_type','document_title','document_ref','document_date','issuing_company','issuing_company_trn','valid_from','valid_until','status']::text[]
   || CASE WHEN output_type IN ('letter','certificate','form') THEN ARRAY['subject_name','subject_role']::text[] ELSE ARRAY[]::text[] END)
 AND jsonb_typeof(value) IN ('string','number','boolean','null');
$$;
REVOKE ALL ON FUNCTION erp_private.f08_public_fields(jsonb,text) FROM PUBLIC, anon, authenticated, service_role;

-- Replaces the old public RPC without changing token identities or old rows.
-- Parent truth wins even if a previous link-status update was lost/failed.
CREATE OR REPLACE FUNCTION public.get_public_verification_by_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 link public.erp_output_public_links;
 parent public.erp_generated_pdf_documents;
 actual_status text;
 summary jsonb := '{}'::jsonb;
 payload jsonb := '{}'::jsonb;
BEGIN
 IF p_token IS NULL OR length(p_token) NOT BETWEEN 32 AND 256 OR p_token !~ '^[A-Za-z0-9_-]+$' THEN RETURN NULL; END IF;
 SELECT * INTO link FROM public.erp_output_public_links WHERE public_token = p_token AND deleted_at IS NULL;
 IF NOT FOUND OR link.status = 'pending_activation' THEN RETURN NULL; END IF;
 actual_status := link.status;
 IF link.generated_pdf_document_id IS NULL THEN
   IF actual_status = 'valid' THEN actual_status := 'legacy_metadata'; END IF;
 ELSE
   SELECT * INTO parent FROM public.erp_generated_pdf_documents WHERE id = link.generated_pdf_document_id;
   IF NOT FOUND OR parent.lifecycle_state <> 'issued' OR parent.archived_at IS NOT NULL THEN RETURN NULL; END IF;
   IF parent.owner_company_id IS DISTINCT FROM link.owner_company_id
     OR parent.source_record_type IS DISTINCT FROM link.source_entity_type
     OR parent.source_record_id IS DISTINCT FROM link.source_entity_id
     OR parent.checksum !~ '^[a-f0-9]{64}$' OR parent.file_size_bytes IS NULL OR parent.file_size_bytes <= 0
     OR parent.issued_at IS NULL THEN RETURN NULL; END IF;
   IF parent.revoked_at IS NOT NULL THEN actual_status := 'cancelled';
   ELSIF parent.superseded_by_id IS NOT NULL THEN actual_status := 'superseded';
   ELSIF parent.expires_at IS NOT NULL AND parent.expires_at <= statement_timestamp() THEN actual_status := 'expired';
   END IF;
 END IF;
 IF actual_status IN ('valid','legacy_metadata') AND link.expires_at IS NOT NULL AND link.expires_at <= statement_timestamp() THEN actual_status := 'expired'; END IF;
 IF actual_status = 'valid' THEN
   summary := erp_private.f08_public_fields(link.verification_summary_json, link.output_type);
   IF link.access_level IN ('full_view','full_view_download_ready') THEN
     payload := erp_private.f08_public_fields(link.public_payload_json, link.output_type);
   ELSIF link.access_level = 'summary' THEN payload := summary;
   END IF;
 END IF;
 -- No public binary capability is manufactured from a stale storage path.
 -- Official originals still use the authenticated, current-scope download API.
 RETURN jsonb_build_object(
   'status', actual_status, 'access_level', CASE WHEN actual_status = 'valid' THEN link.access_level ELSE 'verify_only' END,
   'output_type', link.output_type, 'document_title', left(link.document_title,256),
   'document_subtitle', NULL, 'document_ref', left(link.document_ref,256), 'document_date', link.document_date,
   'issued_at', link.issued_at, 'expires_at', link.expires_at,
   'cancelled_at', CASE WHEN actual_status = 'cancelled' THEN COALESCE(parent.revoked_at,link.cancelled_at) ELSE NULL END,
   'cancel_reason', NULL, 'verification_summary', summary, 'public_payload', payload,
   'download_enabled', false, 'superseded_by_token', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_verification_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_verification_by_token(text) TO anon, authenticated, service_role;
COMMIT;
