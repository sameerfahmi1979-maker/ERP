BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- A change of branch splits scope coverage but does not start new service
-- with the same legal employer. Keep the original contractual and actual dates.
DO $$
DECLARE definition text;
DECLARE patched text;
BEGIN
 definition:=pg_get_functiondef('public.t03_propose_employment_change(bigint,bigint,text,date,bigint,bigint,date,bigint,text,uuid)'::regprocedure);
 patched:=replace(definition,
  $old$   OR (p_kind IN('transfer','rehire') AND (p_company IS NULL OR NOT coalesce(isfinite(p_contract),false)))$old$,
  $new$   OR (p_kind IN('transfer','rehire') AND p_company IS NULL)
   OR ((p_kind='rehire' OR (p_kind='transfer' AND p_company IS DISTINCT FROM e.owner_company_id))
      AND NOT coalesce(isfinite(p_contract),false))
   OR (p_kind='transfer' AND p_company=e.owner_company_id AND p_contract IS NOT NULL)$new$);
 IF definition=patched THEN RAISE EXCEPTION 'Unexpected branch change proposal predecessor'; END IF;
 EXECUTE patched;

 definition:=pg_get_functiondef('public.t03_decide_employment_change(bigint,text,text,text,uuid)'::regprocedure);
 patched:=replace(definition,
  $old$CASE WHEN c.kind='transfer' THEN c.effective_on ELSE e.actual_joining_date END,next_status$old$,
  $new$CASE WHEN c.kind='transfer' AND c.source_company<>c.destination_company THEN c.effective_on ELSE e.actual_joining_date END,next_status$new$);
 IF definition=patched THEN RAISE EXCEPTION 'Unexpected current branch transfer predecessor'; END IF;
 definition:=patched;
 patched:=replace(definition,
  $old$CASE WHEN c.kind='confirm' THEN e.actual_joining_date ELSE c.effective_on END,revision,c.id$old$,
  $new$CASE WHEN c.kind='confirm' OR (c.kind='transfer' AND c.source_company=c.destination_company)
      THEN e.actual_joining_date ELSE c.effective_on END,revision,c.id$new$);
 IF definition=patched THEN RAISE EXCEPTION 'Unexpected historical branch transfer predecessor'; END IF;
 EXECUTE patched;
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
