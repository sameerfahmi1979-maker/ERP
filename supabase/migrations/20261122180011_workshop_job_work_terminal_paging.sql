-- Return terminal-page state while retaining the existing Job Work reader for older clients.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog;

-- The scope predicates below correspond to the latest audited Job Work reader.
-- Verify the installed procedure before adding this alternate paged interface.
DO $guard$
DECLARE predecessor regprocedure:=to_regprocedure('public.t12_job_work_index(bigint)');
BEGIN
 IF current_user <> 'postgres' OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  WHERE p.oid=predecessor AND p.prokind='f' AND p.provolatile='s'
    AND p.proowner='postgres'::regrole AND p.prosecdef AND l.lanname='sql' AND p.prorettype='jsonb'::regtype
    AND p.proargnames=ARRAY['p_before'] AND p.pronargdefaults=1
    AND pg_get_function_arguments(p.oid)='p_before bigint DEFAULT NULL::bigint'
    AND p.proconfig=ARRAY['search_path=""']
    AND encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')
      ='ec12c3bd9c5fe76e8c325f0103b5579e2671b348c655dc2c24aacfaa2197bf7e'
    AND (SELECT array_agg(item::text ORDER BY item::text) FROM unnest(p.proacl) AS item)
      =ARRAY['authenticated=X/postgres','postgres=X/postgres']
 ) OR NOT has_function_privilege('authenticated',predecessor,'EXECUTE')
   OR has_function_privilege('anon',predecessor,'EXECUTE')
   OR has_function_privilege('service_role',predecessor,'EXECUTE') THEN
  RAISE EXCEPTION 'Workshop Job Work reader differs from the audited predecessor' USING ERRCODE='55000';
 END IF;
END
$guard$;

CREATE FUNCTION public.fa_workshop_job_index_page(p_before bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH eligible AS MATERIALIZED (
   SELECT j.id,j.assessment_id,j.cycle,j.state,a.asset_no,a.name AS asset_name,j.scope_of_work AS title
   FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments f ON f.id=j.assessment_id
   JOIN erp_private.fleet_assets a ON a.id=f.asset_id
   WHERE (p_before IS NULL OR j.id<p_before) AND (
     EXISTS (SELECT 1 FROM unnest(ARRAY['workshop.labour.record','workshop.labour.approve','workshop.labour.cost',
         'workshop.jobs.manage','workshop.jobs.release','workshop.outside.manage','workshop.finance.intake']) code
       WHERE erp_private.t05_scope(code,f.company_id,f.branch_id))
     OR (erp_private.t05_scope('supply.purchase.approve',f.company_id,f.branch_id) AND EXISTS (
       SELECT 1 FROM erp_private.t12_outside_orders item WHERE item.job_cycle_id=j.id))
   )
   ORDER BY j.id DESC LIMIT 41
 ), page_rows AS (
   SELECT * FROM eligible ORDER BY id DESC LIMIT 40
 )
 SELECT jsonb_build_object(
   'rows',coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id DESC),'[]'::jsonb),
   'next_before',CASE WHEN (SELECT count(*) FROM eligible)>40 THEN min(r.id) END
 )
 FROM page_rows r;
$$;

REVOKE ALL ON FUNCTION public.fa_workshop_job_index_page(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fa_workshop_job_index_page(bigint) TO authenticated;
DO $acl$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid='public.fa_workshop_job_index_page(bigint)'::regprocedure
    AND p.proowner='postgres'::regrole
    AND (SELECT array_agg(item::text ORDER BY item::text) FROM unnest(p.proacl) AS item)
      =ARRAY['authenticated=X/postgres','postgres=X/postgres']
 ) THEN
  RAISE EXCEPTION 'Workshop Job Work paging has unexpected effective grants' USING ERRCODE='55000';
 END IF;
END
$acl$;

NOTIFY pgrst,'reload schema';
COMMIT;

