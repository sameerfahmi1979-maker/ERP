BEGIN;
-- PERF-P04 history read projection: no base-table ACL or RLS changes.
-- Contract RH-NATURAL-ICU-UTF8-V1. Deployment must separately accept the
-- native collation version, label masking, query plans and response serialization.
DO $history_preflight$
DECLARE c record;
BEGIN
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'Report history contract requires UTF8';
  END IF;
  SELECT collprovider, collisdeterministic, collversion,
         pg_collation_actual_version(oid) AS actual
  INTO c FROM pg_collation WHERE oid = 'pg_catalog."und-x-icu"'::regcollation;
  IF c.collprovider <> 'i' OR NOT c.collisdeterministic
     OR c.collversion IS NULL OR c.collversion IS DISTINCT FROM c.actual THEN
    RAISE EXCEPTION 'Report history ICU contract needs verified deterministic current collation';
  END IF;
END;
$history_preflight$;

CREATE FUNCTION erp_private.perf_report_history_natural_key(value text)
RETURNS bytea[]
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER
SET search_path = ''
AS $report_history_key$
  SELECT coalesce(
    pg_catalog.array_agg(
      CASE WHEN part COLLATE pg_catalog."C" ~ '^[0-9]+$'
        THEN pg_catalog.decode('01', 'hex')
          || pg_catalog.int4send(pg_catalog.length(digits))
          || pg_catalog.convert_to(digits, 'UTF8')
        ELSE pg_catalog.decode('00', 'hex')
          || pg_catalog.convert_to(part, 'UTF8')
      END ORDER BY ordinal
    ),
    ARRAY[]::bytea[]
  )
  FROM (
    SELECT pieces[1] AS part, ordinal,
      coalesce(nullif(pg_catalog.ltrim(pieces[1], '0'), ''), '0') AS digits
    FROM pg_catalog.regexp_matches(
      pg_catalog.lower(value COLLATE pg_catalog."und-x-icu") COLLATE pg_catalog."C",
      '([0-9]+|[^0-9]+)', 'g'
    ) WITH ORDINALITY AS tokens(pieces, ordinal)
  ) AS components;
$report_history_key$;

-- New-object privileges only; never alter a source table, source ACL, policy,
-- existing function, role, role membership, or default privilege configuration.
REVOKE ALL ON FUNCTION erp_private.perf_report_history_natural_key(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.perf_report_history_natural_key(text)
  TO authenticated;

CREATE VIEW public.perf_report_history_read
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  d.id,
  d.report_code,
  d.run_reference,
  d.run_status,
  d.output_format,
  d.row_count,
  d.duration_ms,
  d.run_by,
  d.started_at,
  d.sensitive_data_included,
  d.was_multi_company,
  d.report,
  d.runner,
  d.report_display COLLATE pg_catalog."und-x-icu" AS report_display,
  d.runner_display COLLATE pg_catalog."und-x-icu" AS runner_display,
  coalesce(d.duration_ms, 0) AS duration_sort,
  erp_private.perf_report_history_natural_key(d.report_display) AS report_sort,
  erp_private.perf_report_history_natural_key(d.runner_display) AS runner_sort,
  d.output_format COLLATE pg_catalog."und-x-icu" AS format_search,
  d.run_status COLLATE pg_catalog."und-x-icu" AS status_search,
  d.row_count::text COLLATE pg_catalog."und-x-icu" AS rows_search,
  coalesce(d.duration_ms, 0)::text COLLATE pg_catalog."und-x-icu" AS duration_search,
  -- Mirrors the raw JSON timestamp accessor, not a localized cell/relative date.
  -- Native gate must compare this value with the same response's started_at
  -- serialization under the exact PostgREST request timezone and precision.
  (pg_catalog.to_jsonb(d.started_at) #>> '{}') COLLATE pg_catalog."und-x-icu" AS started_search,
  -- Preserve the candidate's explicit reference/code search additions too.
  d.report_code COLLATE pg_catalog."und-x-icu" AS code_search,
  d.run_reference COLLATE pg_catalog."und-x-icu" AS reference_search
FROM (
  SELECT
    r.id, r.report_code, r.run_reference, r.run_status, r.output_format,
    r.row_count, r.duration_ms, r.run_by, r.started_at,
    r.sensitive_data_included, r.was_multi_company,
    CASE WHEN registry.id IS NULL THEN NULL
      ELSE pg_catalog.jsonb_build_object(
        'report_name_en', registry.report_name_en, 'module_code', registry.module_code
      ) END AS report,
    CASE WHEN runner.id IS NULL THEN NULL
      ELSE pg_catalog.jsonb_build_object('display_name', runner.display_name)
      END AS runner,
    -- JavaScript ?? means NULL fallback, never empty-string/truthiness fallback.
    coalesce(registry.report_name_en, r.report_code) AS report_display,
    coalesce(runner.display_name, r.run_by::text, 'null') AS runner_display
  FROM public.erp_report_runs AS r
  LEFT JOIN public.erp_report_registry AS registry ON registry.id = r.report_id
  LEFT JOIN public.user_profiles AS runner ON runner.id = r.run_by
) AS d;

REVOKE ALL ON TABLE public.perf_report_history_read
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.perf_report_history_read TO authenticated;


COMMENT ON VIEW public.perf_report_history_read IS
  'PERF-P04 caller-RLS history list projection; RH-NATURAL-ICU-UTF8-V1; no report filters or sensitive payloads.';
COMMIT;
