-- Preserve bounded diagnostic categories from preparation workers; no business data,
-- authority, retry policy, provider, worker or document changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $repair$
DECLARE
  definition text := pg_get_functiondef('erp_private.f07_ai_worker(text,jsonb)'::regprocedure);
  original text := $old$'provider_timeout','provider_rate_limit','provider_unavailable','network_error','database_error','stale_lock','unexpected','validation_error','provider_not_configured','handler_not_found','publication_rejected'$old$;
  revised text;
BEGIN
  revised := original || $new$,'provider_authentication','provider_request_rejected','provider_refusal','provider_output_incomplete','provider_output_invalid','quality_evaluation_held','preparation_outcome_unconfirmed','source_changed'$new$;
  IF strpos(definition, 'IN (' || revised || ')') > 0 THEN RETURN; END IF;
  IF length(definition)-length(replace(definition,'IN (' || original || ')','')) <> length('IN (' || original || ')') THEN
    RAISE EXCEPTION 'AI diagnostic allowlist changed; review the current worker before applying' USING ERRCODE='55000';
  END IF;
  EXECUTE replace(definition,'IN (' || original || ')','IN (' || revised || ')');
END $repair$;
COMMIT;
