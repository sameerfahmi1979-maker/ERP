BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Held with the existing supervised BR1 renewal guard and notice migration.
DO $require_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.dms_renewal_requests'::regclass
      AND tgname = 'dms_br1_labour_card_renewal_guard'
      AND tgenabled = 'O' AND tgdeferrable AND tginitdeferred
  ) THEN
    RAISE EXCEPTION 'Install the supervised BR1 renewal guard first';
  END IF;
END $require_guard$;

CREATE FUNCTION erp_private.dms_br1_labour_card_renewal_originals_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  predecessor_hash text;
  replacement_hash text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'renewed' THEN RETURN NULL; END IF;

  -- Keep the native renewal document lock order across metadata/file changes.
  PERFORM d.id FROM public.dms_documents d
  WHERE d.id IN (NEW.document_id, NEW.replacement_document_id)
  ORDER BY d.id FOR UPDATE;

  SELECT CASE WHEN count(*) = 1 AND bool_and(
      f.file_size_bytes > 0 AND f.sha256_hash ~ '^[0-9A-Fa-f]{64}$'
    ) THEN min(lower(f.sha256_hash)) END
    INTO predecessor_hash
  FROM public.dms_documents d
  JOIN public.dms_document_versions v
    ON v.id = d.current_version_id AND v.document_id = d.id
    AND v.is_current AND v.unlinked_at IS NULL
  JOIN public.dms_document_files f
    ON f.document_id = d.id AND f.version_id = v.id
    AND f.file_role = 'original' AND f.deleted_at IS NULL
  WHERE d.id = NEW.document_id;

  IF predecessor_hash IS NULL THEN
    RAISE EXCEPTION 'Renewal requires the exact hashed predecessor original' USING ERRCODE = 'PT409';
  END IF;

  SELECT CASE WHEN count(*) = 1 AND bool_and(
      f.file_size_bytes > 0 AND f.sha256_hash ~ '^[0-9A-Fa-f]{64}$'
    ) THEN min(lower(f.sha256_hash)) END
    INTO replacement_hash
  FROM public.dms_document_files f
  WHERE f.document_id = NEW.replacement_document_id AND f.version_id = NEW.replacement_version_id
    AND f.file_role = 'original' AND f.deleted_at IS NULL;

  IF replacement_hash IS NULL OR replacement_hash = predecessor_hash THEN
    RAISE EXCEPTION 'Renewal requires verified replacement bytes distinct from the predecessor original'
      USING ERRCODE = 'PT409';
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION erp_private.dms_br1_labour_card_renewal_originals_guard()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER dms_br1_labour_card_renewal_originals_guard
  AFTER INSERT OR UPDATE OF status ON public.dms_renewal_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.document_id = 127 AND NEW.status = 'renewed')
  EXECUTE FUNCTION erp_private.dms_br1_labour_card_renewal_originals_guard();

COMMIT;
