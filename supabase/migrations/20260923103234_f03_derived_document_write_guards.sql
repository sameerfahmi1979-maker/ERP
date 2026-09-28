BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Reading metadata does not authorize replacing hidden content. Existing RLS
-- still supplies edit/upload permission; these guards additionally require
-- scoped preview. This preserves authorized manual OCR/AI/content-edit flows.
CREATE OR REPLACE FUNCTION erp_private.protect_document_derived_content()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE fields text[]; field text; changed boolean:=false; next_row jsonb:=to_jsonb(NEW); previous_row jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 fields:=CASE WHEN TG_TABLE_NAME='dms_documents' THEN
   ARRAY['ai_summary','summary_embedding','ai_summary_error','summary_embedding_error','ai_warnings_json','ai_risk_reasons_json']
   ELSE ARRAY['ocr_text','ocr_error_message','integrity_error_message'] END;
 IF TG_OP='UPDATE' THEN previous_row:=to_jsonb(OLD); END IF;
 FOREACH field IN ARRAY fields LOOP
   IF TG_OP='INSERT' THEN
     changed:=changed OR (next_row->field IS NOT NULL AND next_row->field NOT IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb));
   ELSE
     changed:=changed OR (next_row->field IS DISTINCT FROM previous_row->field);
   END IF;
 END LOOP;
 IF TG_TABLE_NAME='dms_documents' THEN
   IF changed AND (TG_OP='INSERT' OR NOT erp_private.document_permission(OLD.id,'dms.documents.preview')) THEN
     RAISE EXCEPTION 'Document content requires scoped preview; create metadata before adding content' USING ERRCODE='42501';
   END IF;
 ELSE
   -- Reparenting an existing OCR payload also needs content access at both ends.
   IF TG_OP='UPDATE' AND NEW.document_id IS DISTINCT FROM OLD.document_id THEN
     IF NOT erp_private.document_permission(OLD.document_id,'dms.documents.preview') THEN
       RAISE EXCEPTION 'Moving file content requires source preview permission' USING ERRCODE='42501';
     END IF;
     changed:=true;
   END IF;
   IF changed AND NOT erp_private.document_permission(NEW.document_id,'dms.documents.preview') THEN
     RAISE EXCEPTION 'File content requires scoped preview permission' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_document_derived_content() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f03_document_derived_content BEFORE INSERT OR UPDATE ON public.dms_documents
 FOR EACH ROW EXECUTE FUNCTION erp_private.protect_document_derived_content();
CREATE TRIGGER f03_file_derived_content BEFORE INSERT OR UPDATE ON public.dms_document_files
 FOR EACH ROW EXECUTE FUNCTION erp_private.protect_document_derived_content();

-- Always derive the index from authoritative source fields, even when a caller
-- tries to update only the index. No stored business content is rewritten here.
CREATE OR REPLACE TRIGGER trg_dms_documents_content_tsv
 BEFORE INSERT OR UPDATE OF document_no,title,description,ai_summary,content_tsv
 ON public.dms_documents FOR EACH ROW EXECUTE FUNCTION public.update_dms_document_content_tsv();

-- Correct only F03-added capability labels, not codes or assignments.
UPDATE public.permissions SET module_code='users',action_code='manage'
 WHERE permission_code='users.employee_link.manage';
UPDATE public.permissions SET action_code='manage'
 WHERE permission_code IN ('hr.banking.manage','hr.confidential.manage');
NOTIFY pgrst,'reload schema';
COMMIT;
