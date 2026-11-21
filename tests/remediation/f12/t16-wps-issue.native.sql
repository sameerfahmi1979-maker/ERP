
-- Intended for t16-wps-fixture.sql within the isolated predecessor transaction.
\set ON_ERROR_STOP on
DO $$
BEGIN
 IF to_regprocedure('public.t16_wps_issue_command(uuid,bigint,bigint,text,jsonb)') IS NULL THEN
   RAISE EXCEPTION 'T16 WPS issue and employee reconciliation are not installed';
 END IF;
END $$;

DO $$
DECLARE
 exact_review uuid:=current_setting('erp.t16_review')::uuid;
 exact_version uuid:=current_setting('erp.t16_version')::uuid;
 exact_digest text:=current_setting('erp.t16_digest');
 batch_id_out uuid; original erp_private.t16_files; output jsonb; handoff jsonb; receipt jsonb;
 preview jsonb; file_value jsonb; stage jsonb;
 issue_op uuid:=gen_random_uuid(); handoff_op uuid:=gen_random_uuid();
 request jsonb:=jsonb_build_object('review',exact_review,'version',exact_version,'digest',exact_digest);
 expected_lines int; expected_net numeric; content_text text;
BEGIN
 IF has_table_privilege('authenticated','erp_private.t16_files','SELECT')
    OR has_table_privilege('service_role','erp_private.t16_files','SELECT')
    OR has_function_privilege('anon','public.t16_wps_download(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','erp_private.t16_route_result(bigint,bigint,date,bigint,text,numeric,bigint[])','EXECUTE') THEN
   RAISE EXCEPTION 'Raw bank data privileges leaked';
 END IF;
 SELECT count(*),sum(net) INTO expected_lines,expected_net
 FROM erp_private.t14_results WHERE version_id=exact_version AND net>0;
 IF expected_lines<>2 THEN RAISE EXCEPTION 'Expected two payable employees in the T15 approval'; END IF;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
  PERFORM public.t16_wps_issue_command(issue_op,920001,920011,'issue',request||jsonb_build_object('version',gen_random_uuid()));
  RAISE EXCEPTION 'A different payroll version was issued'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM public.t16_wps_issue_command(issue_op,920001,920011,'issue',request||jsonb_build_object('digest',repeat('f',64)));
  RAISE EXCEPTION 'A different payroll digest was issued'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM public.t16_wps_issue_command(issue_op,920001,920011,'issue',request);
  RAISE EXCEPTION 'An unconfigured bank file was issued';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
  IF SQLERRM NOT LIKE 'A verified bank file layout%' THEN RAISE; END IF;
 END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 PERFORM pg_temp.t16_configuration();
 BEGIN
  UPDATE public.employee_wps_profiles SET iban=NULL WHERE employee_id=980002;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  PERFORM public.t16_wps_issue_command(issue_op,920001,920011,'issue',request);
  RAISE EXCEPTION 'An invalid IBAN produced an original';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
  IF SQLERRM NOT LIKE 'An approved payroll recipient%' THEN RAISE; END IF;
 END;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
  PERFORM public.t16_wps_issue_command(issue_op,920001,920011,'issue',request);
  RAISE EXCEPTION 'Reconciler could issue files'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
  PERFORM public.t16_wps_issue_command(issue_op,920001,920012,'issue',request);
  RAISE EXCEPTION 'Sibling branch could submit an approval it did not own'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(9);
 BEGIN
  PERFORM public.t16_wps_issue_command(issue_op,920002,920021,'issue',request);
  RAISE EXCEPTION 'The other company could issue for the employing branch'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(2);
 receipt:=public.t16_wps_issue_command(issue_op,920001,920011,'issue',request);
 batch_id_out:=(receipt->>'batch')::uuid;
 IF receipt->>'state'<>'prepared'
   OR public.t16_wps_issue_command(issue_op,920001,920011,'issue',request) IS DISTINCT FROM receipt||'{"replayed":true}'
   OR public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'issue',request)->>'batch'<>batch_id_out::text THEN
   RAISE EXCEPTION 'Issue retry or new operation did not preserve the original file identity';
 END IF;
 BEGIN
   PERFORM public.t16_wps_issue_command(issue_op,920001,920011,'issue',request||jsonb_build_object('digest',repeat('e',64)));
   RAISE EXCEPTION 'Changed issue operation key was accepted'; EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
 END;
 RESET ROLE;
 SELECT * INTO STRICT original FROM erp_private.t16_files f WHERE f.batch_id=batch_id_out;
 content_text:=convert_from(original.content,'UTF8');
 IF original.row_count<>expected_lines OR original.net_total<>expected_net OR original.currency<>'AED'
   OR original.sha256<>encode(extensions.digest(original.content,'sha256'),'hex')
   OR char_length(content_text)-char_length(replace(content_text,chr(13),''))<>3
   OR length(content_text)-length(replace(content_text,chr(10),''))<>3
   OR split_part(content_text,chr(13)||chr(10),3) IS DISTINCT FROM
      'SCR,0000000998601,111000222,112026,2,'||expected_net::numeric(20,2)::text||',AED,original'
   OR NOT EXISTS(SELECT 1 FROM erp_private.t14_results r WHERE r.version_id=exact_version AND r.employee_id=980001
     AND split_part(content_text,chr(13)||chr(10),1)=
     'EDR,00112233445566,333000444,AE070331234567890123456,2026-11-01,2026-11-30,30,'||r.net::text)
   OR NOT EXISTS(SELECT 1 FROM erp_private.t14_results r WHERE r.version_id=exact_version AND r.employee_id=980002
     AND split_part(content_text,chr(13)||chr(10),2)=
     'EDR,00112233445577,333000444,AE070331234567890123456,2026-11-01,2026-11-30,30,'||r.net::text) THEN
   RAISE EXCEPTION 'WPS rows or control totals did not match the exact approved payroll';
 END IF;
 IF (SELECT count(*) FROM erp_private.t16_batches)<>1 THEN RAISE EXCEPTION 'Duplicate issue'; END IF;

 handoff:=jsonb_build_object('batch',batch_id_out,'wps_file',original.id,'reference','SYNTHETIC-01');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
   PERFORM public.t16_wps_download(original.id);
   RAISE EXCEPTION 'The original bytes were available before the durable handoff'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
   RESET ROLE;
   PERFORM set_config('request.jwt.claims','{}',true);
   UPDATE public.employee_wps_profiles SET mohre_person_code='00000000001000' WHERE employee_id=980002;
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(2);
   PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'start-handoff',handoff);
   RAISE EXCEPTION 'A stale bank route was handed off';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN IF SQLERRM NOT LIKE 'Bank setup changed%' THEN RAISE; END IF;
 END;
 output:=public.t16_wps_issue_command(handoff_op,920001,920011,'start-handoff',handoff);
 IF output->>'state'<>'handoff-pending'
  OR public.t16_wps_issue_command(handoff_op,920001,920011,'start-handoff',handoff) IS DISTINCT FROM output||'{"replayed":true}' THEN
   RAISE EXCEPTION 'The uncertain handoff was not retained independently from a retry';
 END IF;
 BEGIN
  PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'request-release',
    request||jsonb_build_object('reason','Try to reissue while external result unknown'));
  RAISE EXCEPTION 'A replacement is possible with uncertain external handoff'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 file_value:=public.t16_wps_download(original.id);
 IF file_value->>'sha256'<>original.sha256 OR file_value->>'filename'<>original.filename
  OR decode(file_value->>'base64','base64')<>original.content THEN RAISE EXCEPTION 'Retained WPS download bytes differ'; END IF;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
  PERFORM public.t16_wps_download(original.id);
  RAISE EXCEPTION 'Reconciliation role downloaded raw WPS bytes'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
  PERFORM public.t16_wps_download(original.id);
  RAISE EXCEPTION 'Sibling downloaded raw WPS bytes'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(4);
 BEGIN
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'record-submission',handoff||pg_temp.t16_proof(998602));
  RAISE EXCEPTION 'Actor missing finance permission submitted evidence'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'accept',handoff||pg_temp.t16_proof(998602));
  RAISE EXCEPTION 'Acceptance skipped the retained evidence of submission'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'record-submission',handoff||pg_temp.t16_proof(998606));
  RAISE EXCEPTION 'Sibling evidence attached to bank submission'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'record-submission',handoff||pg_temp.t16_proof(998607));
  RAISE EXCEPTION 'Unverified evidence attached to bank submission'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 stage:=public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'record-submission',handoff||pg_temp.t16_proof(998602));
 IF stage->>'state'<>'submitted' THEN RAISE EXCEPTION 'Verified submission was not retained'; END IF;
 stage:=public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'acknowledge',handoff||pg_temp.t16_proof(998602));
 IF stage->>'state'<>'acknowledged' THEN RAISE EXCEPTION 'Bank acknowledgment was not retained'; END IF;
 stage:=public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'accept',handoff||pg_temp.t16_proof(998602));
 IF stage->>'state'<>'accepted' THEN RAISE EXCEPTION 'Bank acceptance was not retained'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 IF (SELECT count(*) FROM erp_private.t16_batch_events e WHERE e.batch_id=batch_id_out)<>4
 OR (SELECT count(*) FROM erp_private.t16_downloads d WHERE d.file_id=original.id)<>1
 OR erp_private.t15_bank_state(exact_review)<>'submitted'
 OR EXISTS(SELECT 1 FROM erp_private.t13_payroll_pins p WHERE p.gm_approval_id=exact_review) THEN
   RAISE EXCEPTION 'File actions mistakenly created payment allocations or duplicate lifecycle records';
 END IF;
 PERFORM set_config('erp.t16_batch',batch_id_out::text,true);
 RAISE NOTICE 'PASS: exact WPS bytes, routing readiness, control totals, retained retries, permissions, durable handoff and distinct bank events';
END $$;
