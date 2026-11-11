-- Owner-approved policy: a certificate number is optional when the source has none.
-- Preserve all stored values, other identification fields and authorization rules.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.dms_metadata_definitions m WHERE m.field_code='certificate_number' AND m.is_active AND m.deleted_at IS NULL AND coalesce(erp_private.ai_mod04_profile(m.document_type_id,true)->'requiredFields' ? 'certificate_number',false)) THEN
  RAISE EXCEPTION 'A processing profile independently requires certificate_number; review its policy first';
 END IF;
END $$;
UPDATE public.dms_metadata_definitions
 SET is_required=false,review_required_if_missing=false,updated_at=clock_timestamp()
 WHERE field_code='certificate_number' AND is_active AND deleted_at IS NULL
 AND (is_required OR review_required_if_missing);
COMMIT;
