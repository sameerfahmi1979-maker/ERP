BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- Extend the existing checked discard, not a second cancellation engine. Only
-- the original reviewer can retire an uncommitted, still-unlinked attachment.
-- The destination, original intent/history and every copied byte are retained.
DO $patch$
DECLARE original text;needle text;addition text;
BEGIN
 SELECT pg_get_functiondef('erp_private.f07_discard_intake(bigint,bigint,text)'::regprocedure) INTO original;
 needle:=' reason text:=nullif(btrim(p_reason),''''); result jsonb;';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Discard declaration drift';END IF;
 original:=replace(original,needle,needle||'attachment erp_private.f07_attachment_intents;');
 needle:=' IF s.status=''completed'' OR s.intake_status IN (''approved'',''discarded'',''ocr_processing'',''ai_processing'') OR';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Discard attachment admission drift';END IF;
 addition:=$body$
 SELECT * INTO attachment FROM erp_private.f07_attachment_intents WHERE upload_session_id=s.id FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF p_document IS NOT NULL OR attachment.actor_id IS DISTINCT FROM actor OR attachment.receipt IS NOT NULL OR
   NOT erp_private.f07_upload_subject_allowed(s.id) OR
   NOT erp_private.document_permission(attachment.document_id,'dms.documents.upload') OR
   NOT erp_private.document_permission(attachment.document_id,'dms.documents.edit') OR
   NOT erp_private.document_permission(attachment.document_id,'dms.documents.preview') OR
   attachment.source IS DISTINCT FROM jsonb_build_object('path',s.temp_storage_path,'name',s.original_filename,'mime',s.mime_type,'size',s.file_size_bytes,
    'sha256',s.sha256_hash,'company',s.owning_company_id,'branch',s.owning_branch_id,'aiResult',s.ai_result_id) THEN
   RAISE EXCEPTION 'Only the original authorized reviewer may cancel this uncommitted attachment' USING ERRCODE='42501';
  END IF;
 END IF;
$body$;
 original:=replace(original,needle,addition||E'\n'||needle);
 needle:='  EXISTS(SELECT 1 FROM erp_private.f07_attachment_intents a WHERE a.upload_session_id=s.id) THEN';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Discard original intent fence drift';END IF;
 original:=replace(original,needle,'  EXISTS(SELECT 1 FROM erp_private.f07_attachment_intents a WHERE a.upload_session_id=s.id AND a.receipt IS NOT NULL) THEN');
 needle:='''update'',result);';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Discard audit boundary drift';END IF;
 original:=replace(original,needle,'''update'',result||CASE WHEN attachment.upload_session_id IS NOT NULL THEN jsonb_build_object(''attachmentOperationId'',attachment.operation_id,''destinationUnchanged'',true,''copiedFilePolicy'',''retained_no_deletion'') ELSE ''{}''::jsonb END);');
 needle:=' IF NOT erp_private.business_principal_is_active() OR public.current_user_profile_id() IS DISTINCT FROM actor OR';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Discard final attachment authority drift';END IF;
 original:=replace(original,needle,' IF attachment.upload_session_id IS NOT NULL AND (NOT erp_private.f07_upload_subject_allowed(s.id) OR NOT erp_private.document_permission(attachment.document_id,''dms.documents.upload'') OR NOT erp_private.document_permission(attachment.document_id,''dms.documents.edit'') OR NOT erp_private.document_permission(attachment.document_id,''dms.documents.preview'')) THEN RAISE EXCEPTION ''Attachment cancellation authority changed'' USING ERRCODE=''42501'';END IF;'||E'\n'||needle);
 EXECUTE original;
END $patch$;
CREATE FUNCTION erp_private.f07_attachment_cancelled(p_session bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.f07_attachment_intents i JOIN erp_private.f07_intake_discard_receipts r ON r.upload_session_id=i.upload_session_id
  AND r.actor_id=i.actor_id AND r.document_id IS NULL WHERE i.upload_session_id=p_session AND i.receipt IS NULL)
$$;
REVOKE ALL ON FUNCTION erp_private.f07_attachment_cancelled(bigint) FROM PUBLIC,anon,authenticated,service_role;
DO $patch$
DECLARE original text;needle text;
BEGIN
 SELECT pg_get_functiondef('erp_private.f07_read_attachment_recovery(bigint,bigint,integer)'::regprocedure) INTO original;
 needle:='count(*) FILTER(WHERE receipt IS NULL)';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Recovery pending count boundary drift';END IF;
 original:=replace(original,needle,'count(*) FILTER(WHERE receipt IS NULL AND NOT erp_private.f07_attachment_cancelled(upload_session_id))');
 needle:='''completed'',i.receipt IS NOT NULL';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>2 THEN RAISE EXCEPTION 'Recovery closed-state projection drift';END IF;
 original:=replace(original,needle,'''completed'',i.receipt IS NOT NULL,''closed'',erp_private.f07_attachment_cancelled(i.upload_session_id)');
 EXECUTE original;
 SELECT pg_get_functiondef('erp_private.f07_attachment_source(bigint,bigint)'::regprocedure) INTO original;
 needle:=' IF s.status=''completed'' AND s.document_id=d.id THEN';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Cancelled source replay boundary drift';END IF;
 EXECUTE replace(original,needle,' IF erp_private.f07_attachment_cancelled(s.id) THEN RAISE EXCEPTION ''This original upload was cancelled; its bytes and request remain retained'' USING ERRCODE=''PT409'';END IF;'||E'\n'||needle);
END $patch$;
CREATE FUNCTION erp_private.f07_guard_discarded_upload() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.f07_intake_discard_receipts WHERE upload_session_id=OLD.id) AND
  ROW(NEW.status,NEW.intake_status,NEW.document_id,NEW.temp_storage_path,NEW.original_filename,NEW.mime_type,NEW.file_size_bytes,NEW.sha256_hash,NEW.uploaded_by,NEW.owning_company_id,NEW.owning_branch_id)
  IS DISTINCT FROM ROW(OLD.status,OLD.intake_status,OLD.document_id,OLD.temp_storage_path,OLD.original_filename,OLD.mime_type,OLD.file_size_bytes,OLD.sha256_hash,OLD.uploaded_by,OLD.owning_company_id,OLD.owning_branch_id) THEN
  RAISE EXCEPTION 'A discarded original cannot be resurrected or rebound; its receipt and files remain retained' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_guard_discarded_upload() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_guard_discarded_upload BEFORE UPDATE ON public.dms_upload_sessions FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_discarded_upload();
NOTIFY pgrst,'reload schema';
COMMIT;
