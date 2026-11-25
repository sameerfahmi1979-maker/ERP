BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Use the same protected projection as the dashboard's ordinary client.
-- These stages overlap and include archived content the projection admits.
CREATE FUNCTION public.perf_dms_dashboard_ai_pipeline()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $pipeline$
  SELECT jsonb_build_array(
    count(*) FILTER (WHERE d.ocr_status IN ('pending', 'queued')),
    count(*) FILTER (WHERE d.ocr_status IN ('complete', 'skipped')
      AND d.ai_status IN ('pending', 'not_applicable', 'skipped')),
    count(*) FILTER (WHERE d.ai_status = 'complete'),
    count(*) FILTER (WHERE d.review_status IN ('pending', 'in_review'))
  )
  FROM public.f03_read_documents() d
  WHERE d.deleted_at IS NULL;
$pipeline$;

-- Input is the dashboard's existing Dubai business date. Keep the SQL range
-- semantics and measure the five disjoint bins over one authorized snapshot.
CREATE FUNCTION public.perf_dms_dashboard_expiry_buckets(p_today date)
RETURNS jsonb
LANGUAGE sql STABLE STRICT SECURITY INVOKER SET search_path = ''
AS $expiry$
  SELECT jsonb_build_array(
    count(*) FILTER (WHERE d.expiry_date <= p_today + 7),
    count(*) FILTER (WHERE d.expiry_date > p_today + 7 AND d.expiry_date <= p_today + 14),
    count(*) FILTER (WHERE d.expiry_date > p_today + 14 AND d.expiry_date <= p_today + 30),
    count(*) FILTER (WHERE d.expiry_date > p_today + 30 AND d.expiry_date <= p_today + 60),
    count(*) FILTER (WHERE d.expiry_date > p_today + 60)
  )
  FROM public.f03_read_documents() d
  WHERE d.deleted_at IS NULL
    AND d.expiry_date BETWEEN p_today AND p_today + 90
    AND d.status <> 'superseded';
$expiry$;

REVOKE ALL ON FUNCTION public.perf_dms_dashboard_ai_pipeline(), public.perf_dms_dashboard_expiry_buckets(date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perf_dms_dashboard_ai_pipeline(), public.perf_dms_dashboard_expiry_buckets(date)
  TO authenticated;

DO $acl$
DECLARE
  widget regprocedure;
BEGIN
  FOREACH widget IN ARRAY ARRAY[
    'public.perf_dms_dashboard_ai_pipeline()'::regprocedure,
    'public.perf_dms_dashboard_expiry_buckets(date)'::regprocedure
  ] LOOP
    IF (SELECT ARRAY(SELECT acl::text FROM unnest(proacl) AS acl ORDER BY acl::text)
      FROM pg_proc WHERE oid = widget AND proowner = 'postgres'::regrole AND NOT prosecdef)
      IS DISTINCT FROM ARRAY['authenticated=X/postgres', 'postgres=X/postgres']
    THEN RAISE EXCEPTION 'Unexpected dashboard widget grants: %', widget; END IF;
  END LOOP;
END
$acl$;

NOTIFY pgrst, 'reload schema';
COMMIT;
