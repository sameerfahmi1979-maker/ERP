-- OUTPUT.4 (WP8) — Allow one-time checksum FINALIZATION under the lifecycle.
--
-- The PDF.1 trigger made checksum fully immutable after INSERT. The OUTPUT.2
-- issuance lifecycle intentionally inserts the row with a 'pending' placeholder
-- and writes the real SHA-256 (computed from the VERIFIED stored bytes) at the
-- uploaded → issued transition. Correct invariant:
--   • checksum may move exactly once: NULL/'pending' → real hash
--   • a real hash can never change afterwards

CREATE OR REPLACE FUNCTION public.prevent_checksum_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.checksum IS DISTINCT FROM NEW.checksum THEN
    -- One-time finalization from the lifecycle placeholder is allowed.
    IF OLD.checksum IS NULL OR OLD.checksum = 'pending' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'erp_generated_pdf_documents.checksum is immutable after finalization.';
  END IF;
  RETURN NEW;
END;
$function$;