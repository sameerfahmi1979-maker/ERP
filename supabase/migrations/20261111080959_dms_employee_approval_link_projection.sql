BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Preserve caller RLS, existing link mappings and the non-employee fingerprints.
DO $patch$
DECLARE definition text := pg_get_functiondef('erp_private.ai_approval_link_target(text,bigint)'::regprocedure);
 anchor text := ' execute format(''select to_jsonb(t) from public.%I t where id=$1 and %s'',target,predicate) into value using p_id;';
BEGIN
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN
  RAISE EXCEPTION 'Unexpected intake link target definition';
 END IF;
 EXECUTE replace(definition,anchor,$projection$
 if target='employees' then
  select jsonb_build_object('id',e.id,'owner_company_id',e.owner_company_id,
    'branch_id',e.branch_id,'workspace_revision',e.workspace_revision)
  into value from public.employees e where e.id=p_id and e.deleted_at is null;
  -- Mirror the existing employee-link INSERT policy before reserving a number.
  if value is not null and p_kind='employee' and not public.current_user_can_manage_employee(p_id) then
   raise exception 'Employee link requires current HR management access' using errcode='42501';
  end if;
 else
$projection$ || anchor || E'\n end if;');
END $patch$;

COMMIT;
