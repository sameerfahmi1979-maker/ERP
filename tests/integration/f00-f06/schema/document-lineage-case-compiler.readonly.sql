-- Coordinator-only native syntax witness. No schema or data mutation.
-- Run before the new bridge positive rollback and catalog acceptance checks.
BEGIN READ ONLY;
DO $case_compiler$
DECLARE expected record; acl text[]; mismatch boolean; checks integer:=0;
BEGIN
 FOR expected IN SELECT * FROM (VALUES (true,true),(false,true),(true,false),(false,false)) cases(owner_only,matching) LOOP
  acl:=CASE WHEN NOT expected.matching THEN ARRAY['unexpected=X/postgres']
       WHEN expected.owner_only THEN ARRAY['postgres=X/postgres']
       ELSE ARRAY['authenticated=X/postgres','postgres=X/postgres'] END;
  mismatch:=false;
  IF false
   OR acl IS DISTINCT FROM (CASE WHEN expected.owner_only THEN ARRAY['postgres=X/postgres'] ELSE ARRAY['authenticated=X/postgres','postgres=X/postgres'] END)::text[]
  THEN mismatch:=true; END IF;
  IF mismatch IS NOT DISTINCT FROM expected.matching THEN RAISE EXCEPTION 'ACL CASE compiler witness mismatch'; END IF;
  checks:=checks+1;
 END LOOP;
 IF checks<>4 THEN RAISE EXCEPTION 'ACL CASE compiler witness incomplete'; END IF;
END $case_compiler$;
ROLLBACK;
SELECT 'PASS: ACL CASE native compiler witness (not migration acceptance)' AS result;
