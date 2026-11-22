BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $migration$
DECLARE
  definition text;
  old_gate constant text :=
    'calendar AND directory AND (subject IS NOT NULL OR id IS DISTINCT FROM (SELECT erp_private.mobile_hr_linked_id()))';
  new_gate constant text :=
    'calendar AND (directory OR id = (SELECT erp_private.mobile_hr_linked_id()))';
BEGIN
  -- Align menu admission with the existing calendar subject reader. Self
  -- access still needs the exact employee-scoped leave permission.
  SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p
  WHERE p.oid = 'erp_private.mobile_hr_v5_capabilities(bigint)'::regprocedure
    AND p.proowner = 'postgres'::regrole AND p.prosecdef
    AND p.proconfig = ARRAY['search_path=""']
    AND md5(replace(p.prosrc,E'\r\n',E'\n')) = 'e8e98be72cf2bdcab613e80429096d06';
  IF strpos(definition,old_gate) = 0 THEN
    RAISE EXCEPTION 'Expected Mobile HR calendar capability gate';
  END IF;
  EXECUTE replace(definition,old_gate,new_gate);
END
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
