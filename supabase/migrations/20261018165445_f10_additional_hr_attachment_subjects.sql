-- Close two stored attachment-subject gaps without assigning roles or changing
-- any employee, leave, photo, certificate, document or file record.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
DO $migration$DECLARE body text;
 needle text:='UNION ALL SELECT employee_id,CASE WHEN related_record_type';
BEGIN
 SELECT pg_get_functiondef('erp_private.hr_document_evidence_allowed(bigint)'::regprocedure) INTO body;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'HR evidence contract changed; reconcile before migration';END IF;
 EXECUTE replace(body,needle,$addition$UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_leave_requests WHERE sick_cert_dms_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT id,ARRAY[]::text[] FROM public.employees WHERE photo_dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,CASE WHEN related_record_type$addition$);
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
