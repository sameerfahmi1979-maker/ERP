BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Serialize discards on their parent. An older workflow holding the parent
-- cannot deadlock this member-first path because it takes the parent NOWAIT.
DO $$
DECLARE body text; anchor text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
 WHERE oid='erp_private.f07_discard_intake(bigint,bigint,text)'::regprocedure AND md5(prosrc)='677df32ce8cadc74f465cd126eed24f1';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown intake discard predecessor'; END IF;
 anchor:=' SELECT * INTO old FROM erp_private.f07_intake_discard_receipts WHERE upload_session_id=s.id;';
 IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Missing retained intake receipt boundary'; END IF;
 body:=replace(body,anchor,$lock$
 IF s.batch_id IS NOT NULL THEN
  PERFORM 1 FROM public.dms_upload_batches WHERE id=s.batch_id AND deleted_at IS NULL FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch unavailable' USING ERRCODE='PT409'; END IF;
 END IF;
$lock$||anchor);
 anchor:=' result:=jsonb_build_object(';
 IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Missing intake discard result boundary'; END IF;
 body:=replace(body,anchor,$parent$
 IF s.batch_id IS NOT NULL THEN
  UPDATE public.dms_upload_batches b SET status='cancelled', updated_at=clock_timestamp()
  WHERE b.id=s.batch_id AND b.status NOT IN ('completed','cancelled') AND b.approved_files=0
    AND EXISTS(SELECT 1 FROM public.dms_upload_sessions m WHERE m.batch_id=b.id AND m.deleted_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM public.dms_upload_sessions m WHERE m.batch_id=b.id AND m.deleted_at IS NULL
      AND (m.status IS DISTINCT FROM 'cancelled' OR m.intake_status IS DISTINCT FROM 'discarded'));
 END IF;
$parent$||anchor);
 EXECUTE body;
END $$;
COMMIT;
