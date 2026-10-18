-- A -> B -> A is three committed routing occurrences even if a batch uses
-- the same transaction timestamp. An unchanged assignee still emits nothing.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
DO $migration$DECLARE body text;
 needle text:=$needle$key:='dms-review:'||NEW.id||':'||md5(coalesce(NEW.assigned_at,NEW.updated_at,NEW.created_at)::text||':'||coalesce(NEW.assigned_to::text,''));$needle$;
BEGIN
 SELECT pg_get_functiondef('erp_private.f10_capture_business_event()'::regprocedure) INTO body;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review event capture contract changed; reconcile before migration';END IF;
 EXECUTE replace(body,needle,$replacement$key:='dms-review:'||NEW.id||':'||pg_catalog.gen_random_uuid()::text;$replacement$);
END $migration$;
COMMIT;
