-- Cancelled intakes retain their history, but must not block a new reviewed upload.
-- Keep the existing invoker/RLS contract and response shape for the deployed app.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $repair$
DECLARE body text; old_filter text := $old$AND s.status NOT IN ('discarded','failed','completed') ORDER BY s.id LIMIT 1;$old$;
BEGIN
 SELECT pg_get_functiondef('public.ai_mod04_duplicate_advisory(text,bigint)'::regprocedure) INTO body;
 IF md5(body) <> 'ac8e2c863be4833e9369a468eb035486' OR strpos(body,old_filter)=0 THEN
  RAISE EXCEPTION 'Duplicate advisory changed; review the current definition before applying this repair';
 END IF;
 EXECUTE replace(body,old_filter,$new$AND s.status NOT IN ('cancelled','expired','discarded','failed','completed')
 AND coalesce(s.intake_status,'uploaded') NOT IN ('discarded','approved')
 AND s.temp_cleaned_at IS NULL ORDER BY s.id LIMIT 1;$new$);
END $repair$;
NOTIFY pgrst, 'reload schema';
COMMIT;
