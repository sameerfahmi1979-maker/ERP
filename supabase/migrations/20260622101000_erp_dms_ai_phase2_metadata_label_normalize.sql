-- ERP DMS AI Phase 2 Step 1 — Normalize duplicate Arabic label column

UPDATE public.dms_metadata_definitions
SET field_label_ar = label_ar
WHERE field_label_ar IS NULL AND label_ar IS NOT NULL;

ALTER TABLE public.dms_metadata_definitions
  DROP COLUMN IF EXISTS label_ar;
