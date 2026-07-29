-- OUTPUT.5 (WP9) — Hardening: official serials must be unique at the database level.
-- Serial format already embeds the issuance id, but the uniqueness guarantee for
-- "serials are never recycled" must not depend on application logic alone.

DROP INDEX IF EXISTS idx_gen_pdf_serial_no;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gen_pdf_serial_no
  ON public.erp_generated_pdf_documents (serial_no)
  WHERE serial_no IS NOT NULL;
