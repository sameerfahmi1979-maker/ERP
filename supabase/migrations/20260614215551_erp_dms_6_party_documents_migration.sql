-- =============================================================================
-- ERP DMS.6 — Party Master Integration and party_documents Migration
-- Phase:  ERP DMS.6
-- Date:   2026-06-14
-- Notes:  party_documents table has 0 rows at migration time (confirmed by audit).
--         Migration is idempotent and safe to rerun.
--         party_documents, party_document_types, party_document_statuses NOT dropped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Create dms_party_document_migration_map (idempotent)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dms_party_document_migration_map (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_document_id     BIGINT UNIQUE NOT NULL REFERENCES public.party_documents(id),
  dms_document_id       BIGINT UNIQUE NOT NULL REFERENCES public.dms_documents(id),
  party_id              BIGINT NOT NULL,
  legacy_document_code  TEXT   NULL,
  migrated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  migration_notes       TEXT   NULL
);

COMMENT ON TABLE public.dms_party_document_migration_map IS
  'Mapping table for party_documents → dms_documents migration during DMS.6 soak period. Do not drop until ERP DMS.CLEANUP.1.';

CREATE INDEX IF NOT EXISTS dms_party_doc_map_party_doc_idx  ON public.dms_party_document_migration_map (party_document_id);
CREATE INDEX IF NOT EXISTS dms_party_doc_map_dms_doc_idx    ON public.dms_party_document_migration_map (dms_document_id);
CREATE INDEX IF NOT EXISTS dms_party_doc_map_party_id_idx   ON public.dms_party_document_migration_map (party_id);

-- -----------------------------------------------------------------------------
-- STEP 2: Add dms_document_id cross-reference to party_documents (idempotent)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'party_documents' AND column_name = 'dms_document_id'
  ) THEN
    ALTER TABLE public.party_documents
      ADD COLUMN dms_document_id BIGINT NULL REFERENCES public.dms_documents(id);
    COMMENT ON COLUMN public.party_documents.dms_document_id IS
      'DMS.6 cross-reference: points to the migrated dms_documents row. Legacy column — do not drop until ERP DMS.CLEANUP.1.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 3: Add dms_license_document_id to party_licenses (idempotent)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'party_licenses' AND column_name = 'dms_license_document_id'
  ) THEN
    ALTER TABLE public.party_licenses
      ADD COLUMN dms_license_document_id BIGINT NULL REFERENCES public.dms_documents(id);
    COMMENT ON COLUMN public.party_licenses.dms_license_document_id IS
      'DMS.6: new DMS document link replacing legacy license_document_id. Do not drop license_document_id yet.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 4: Add dms_certificate_document_id to party_tax_registrations (idempotent)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'party_tax_registrations' AND column_name = 'dms_certificate_document_id'
  ) THEN
    ALTER TABLE public.party_tax_registrations
      ADD COLUMN dms_certificate_document_id BIGINT NULL REFERENCES public.dms_documents(id);
    COMMENT ON COLUMN public.party_tax_registrations.dms_certificate_document_id IS
      'DMS.6: new DMS document link replacing legacy certificate_document_id. Do not drop certificate_document_id yet.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 5: Migrate party_documents rows to dms_documents (idempotent)
-- Skipped at migration time because party_documents has 0 rows.
-- This block will run correctly if rows are added before migration runs again.
-- Maps:
--   document_code       → legacy_document_code
--   document_title      → title
--   remarks             → description
--   document_type_id    → resolved via party_document_types.document_type_code → dms_document_types.type_code
--   document_status_id  → (dms_documents.status = 'active' by default; legacy status_id stored in notes)
--   issue_date          → issue_date
--   expiry_date         → expiry_date
--   party_id            → dms_document_links(entity_type='party')
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec         RECORD;
  v_dms_type_id BIGINT;
  v_dms_doc_id  BIGINT;
  v_doc_no      TEXT;
  v_counter     BIGINT;
BEGIN
  FOR v_rec IN
    SELECT pd.*,
           pdt.document_type_code
    FROM   public.party_documents pd
    JOIN   public.party_document_types pdt ON pdt.id = pd.document_type_id
    -- Only migrate rows not yet in the map
    WHERE  pd.id NOT IN (SELECT party_document_id FROM public.dms_party_document_migration_map)
  LOOP
    -- Resolve dms_document_types by type_code
    SELECT id INTO v_dms_type_id
    FROM   public.dms_document_types
    WHERE  type_code = v_rec.document_type_code
    LIMIT  1;

    -- Fallback: first available dms type
    IF v_dms_type_id IS NULL THEN
      SELECT id INTO v_dms_type_id FROM public.dms_document_types WHERE is_active = TRUE LIMIT 1;
    END IF;

    -- Generate a placeholder document_no (MIGRATED-<id> pattern)
    v_doc_no := 'MIGRATED-' || v_rec.id;

    -- Check if already migrated (double-safety)
    SELECT dms_document_id INTO v_dms_doc_id
    FROM   public.dms_party_document_migration_map
    WHERE  party_document_id = v_rec.id;

    IF v_dms_doc_id IS NULL THEN
      -- Insert into dms_documents
      INSERT INTO public.dms_documents (
        document_no,
        title,
        description,
        document_type_id,
        status,
        confidentiality_level,
        issue_date,
        expiry_date,
        legacy_document_code,
        migrated_from_table,
        created_at,
        updated_at
      ) VALUES (
        v_doc_no,
        v_rec.document_title,
        v_rec.remarks,
        v_dms_type_id,
        'active',
        'internal',
        v_rec.issue_date,
        v_rec.expiry_date,
        v_rec.document_code,
        'party_documents',
        COALESCE(v_rec.created_at, now()),
        COALESCE(v_rec.updated_at, now())
      )
      RETURNING id INTO v_dms_doc_id;

      -- Create dms_document_links for this party
      INSERT INTO public.dms_document_links (document_id, entity_type, entity_id, is_primary, created_at)
      VALUES (v_dms_doc_id, 'party', v_rec.party_id, TRUE, now())
      ON CONFLICT DO NOTHING;

      -- Record in migration map
      INSERT INTO public.dms_party_document_migration_map
        (party_document_id, dms_document_id, party_id, legacy_document_code, migration_notes)
      VALUES
        (v_rec.id, v_dms_doc_id, v_rec.party_id, v_rec.document_code, 'Migrated by DMS.6 migration');

      -- Update cross-reference on party_documents
      UPDATE public.party_documents
      SET    dms_document_id = v_dms_doc_id
      WHERE  id = v_rec.id;
    END IF;
  END LOOP;

  -- Populate party_licenses.dms_license_document_id where license_document_id exists
  UPDATE public.party_licenses pl
  SET    dms_license_document_id = m.dms_document_id
  FROM   public.dms_party_document_migration_map m
  WHERE  pl.license_document_id  = m.party_document_id
  AND    pl.dms_license_document_id IS NULL;

  -- Populate party_tax_registrations.dms_certificate_document_id where certificate_document_id exists
  UPDATE public.party_tax_registrations ptr
  SET    dms_certificate_document_id = m.dms_document_id
  FROM   public.dms_party_document_migration_map m
  WHERE  ptr.certificate_document_id      = m.party_document_id
  AND    ptr.dms_certificate_document_id  IS NULL;

END $$;

-- -----------------------------------------------------------------------------
-- STEP 6: Add legacy deprecation comments to old FK columns
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.party_licenses.license_document_id IS
  'LEGACY DMS.6: references party_documents. Use dms_license_document_id instead. Do not drop until ERP DMS.CLEANUP.1.';

COMMENT ON COLUMN public.party_tax_registrations.certificate_document_id IS
  'LEGACY DMS.6: references party_documents. Use dms_certificate_document_id instead. Do not drop until ERP DMS.CLEANUP.1.';

-- =============================================================================
-- END DMS.6 Migration
-- =============================================================================
