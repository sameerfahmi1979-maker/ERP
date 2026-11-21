-- Run once after each of the T08, T09 and T12 native scenarios, before rollback.
RESET ROLE;
DO $$
DECLARE
 snapshot jsonb; late jsonb; line jsonb; work bigint; filing date;
 anchor_count bigint; trip erp_private.t09_allowance_versions;
BEGIN
 IF current_setting('cron.launch_active_jobs')<>'off'
    OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
       IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
   RAISE EXCEPTION 'Run T14 operational checks only in the isolated database';
 END IF;
 IF to_regprocedure('erp_private.t14_operational_sources(bigint,bigint,bigint,date,timestamp with time zone)') IS NULL THEN
   RAISE EXCEPTION 'T14 payroll is missing the verified operational source reader';
 END IF;
 IF has_function_privilege('authenticated','erp_private.t14_operational_sources(bigint,bigint,bigint,date,timestamp with time zone)','EXECUTE')
    OR has_function_privilege('service_role','erp_private.t14_operational_sources(bigint,bigint,bigint,date,timestamp with time zone)','EXECUTE') THEN
   RAISE EXCEPTION 'An application or service role can call an unrestricted private payroll projection';
 END IF;
 SELECT count(*) INTO anchor_count FROM erp_private.t08_payable_claims;
 IF nullif(current_setting('erp.t08_work',true),'') IS NOT NULL THEN
   work:=current_setting('erp.t08_work')::bigint;
   late:=erp_private.t14_operational_sources(980001,920001,920011,'2026-10-01','2026-10-31 23:59:59+04');
   IF late->'lines' IS DISTINCT FROM '[]'::jsonb OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(late->'exceptions') exception
     WHERE exception->>'code'='fleet-after-cutoff' AND (exception#>>'{source,work}')::bigint=work
       AND exception->>'blocking'='false') THEN
     RAISE EXCEPTION 'Late Fleet verification was not held at the earlier cutoff';
   END IF;
   snapshot:=erp_private.t14_operational_sources(980001,920001,920011,'2026-11-01',statement_timestamp());
   SELECT item INTO STRICT line FROM jsonb_array_elements(snapshot->'lines') item
   WHERE item->>'category'='fleet-overtime' AND (item#>>'{source,work}')::bigint=work;
   IF (line->>'amount')::numeric IS DISTINCT FROM 30 OR (line->>'quantity')::numeric IS DISTINCT FROM 0.75
      OR line->>'original_on' IS DISTINCT FROM '2026-10-03' OR line#>>'{source,alias}' IS NULL
      OR line#>>'{source,digest}' IS NULL OR EXISTS(
       SELECT 1 FROM erp_private.t08_payable_claims c WHERE c.employee_id=980001 AND c.claimed&&(line#>>'{source,interval}')::tstzmultirange) THEN
      RAISE EXCEPTION 'Fleet late carry lost historical work date, claim exclusion or original basis: %',line;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(erp_private.t14_operational_sources(980002,920001,920011,'2026-11-01',statement_timestamp())->'lines') item
      WHERE item#>>'{source,host_company}'='920002')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(erp_private.t14_operational_sources(980002,920002,920021,'2026-11-01',statement_timestamp())->'lines') item
        WHERE item#>>'{source,host_company}'='920002') THEN
      RAISE EXCEPTION 'Cross-company Fleet earnings followed the receiver instead of the employer';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM erp_private.t14_operational_subjects(920001,920011,'2026-11-01',statement_timestamp()) WHERE employee_id=980001)
      OR EXISTS(SELECT 1 FROM erp_private.t14_operational_subjects(920002,920021,'2026-11-01',statement_timestamp()) WHERE employee_id=980001)
      OR EXISTS(SELECT 1 FROM erp_private.t14_operational_subjects(920001,920011,'2026-10-01','2026-10-31 23:59:59+04') WHERE employee_id=980001) THEN
     RAISE EXCEPTION 'The late operational roster failed to preserve historical employment and cutoff';
   END IF;
   RAISE NOTICE 'T14 Fleet operational checks passed';
 ELSIF nullif(current_setting('erp.t09_forward_candidate',true),'') IS NOT NULL THEN
   SELECT * INTO STRICT trip FROM erp_private.t09_allowance_versions WHERE id=current_setting('erp.t09_forward_candidate')::bigint;
   filing:=date_trunc('month',trip.work_day::timestamp)::date;
   late:=erp_private.t14_operational_sources(trip.employee_id,920001,920011,filing,trip.accepted_at-interval '1 microsecond');
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(late->'lines') item WHERE (item#>>'{source,version}')::bigint=trip.id) THEN
     RAISE EXCEPTION 'Loaded leg became payable before Accounts acceptance';
   END IF;
   snapshot:=erp_private.t14_operational_sources(trip.employee_id,920001,920011,filing,statement_timestamp());
   SELECT item INTO STRICT line FROM jsonb_array_elements(snapshot->'lines') item WHERE item->>'key'='trip-allowance:'||trip.actual_id;
   IF (line->>'amount')::numeric IS DISTINCT FROM 140 OR line->>'kind' IS DISTINCT FROM 'earning'
      OR line->>'unit' IS DISTINCT FROM 'loaded-leg' OR line#>>'{source,version}' IS DISTINCT FROM trip.id::text
      OR (SELECT count(*) FROM jsonb_array_elements(snapshot->'lines') item WHERE item->>'category'='trip-allowance')<>1
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'lines') item WHERE item->>'category'='trip-allowance-adjustment'
          AND item->>'kind'='deduction' AND (item->>'amount')::numeric=85 AND item#>>'{source,prior_version}' IS NOT NULL) THEN
     RAISE EXCEPTION 'Wrong directional allowance, duplicate leg, or missing linked reversal: %',snapshot;
   END IF;
   RAISE NOTICE 'T14 trip allowance operational checks passed';
 ELSIF EXISTS(SELECT 1 FROM erp_private.t12_payroll_corrections) THEN
   late:=erp_private.t14_operational_sources(980001,920001,920011,'2026-10-01','2026-10-31 23:59:59+04');
   IF jsonb_array_length(late->'lines')<>0 THEN RAISE EXCEPTION 'Workshop paid unsigned work before the cutoff'; END IF;
   snapshot:=erp_private.t14_operational_sources(980001,920001,920011,'2026-11-01',statement_timestamp());
   SELECT item INTO STRICT line FROM jsonb_array_elements(snapshot->'lines') item WHERE item->>'category'='workshop-correction';
   IF (line->>'amount')::numeric IS DISTINCT FROM 30 OR line->>'kind' IS DISTINCT FROM 'deduction'
      OR line->>'original_on' IS DISTINCT FROM '2026-10-03' OR line#>>'{source,prior_claim}' IS NULL
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'lines') item JOIN erp_private.t12_correction_claims c
        ON c.correction_id=(item#>>'{source,correction}')::bigint WHERE item->>'category'='workshop-correction') THEN
     RAISE EXCEPTION 'Workshop correction lost the original rate, repeated a claim or appeared early: %',snapshot;
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'lines') item JOIN erp_private.t08_payable_claims prior
     ON prior.employee_id=980001 AND prior.claimed&&(item#>>'{source,interval}')::tstzmultirange
     WHERE item->>'category' IN('workshop-overtime','fleet-overtime')) THEN
     RAISE EXCEPTION 'Draft Workshop earnings overlap an existing shared time claim';
   END IF;
   RAISE NOTICE 'T14 Workshop operational checks passed';
 ELSE
   RAISE EXCEPTION 'T14 operational check requires a populated T08, T09 or T12 scenario';
 END IF;
 IF (SELECT count(*) FROM erp_private.t08_payable_claims)<>anchor_count THEN
   RAISE EXCEPTION 'The draft projection consumed payable time';
 END IF;
END;
$$;
ROLLBACK;
