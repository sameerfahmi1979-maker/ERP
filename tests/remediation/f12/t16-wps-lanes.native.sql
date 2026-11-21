
-- Run after the isolated T16 fixture, before preparing the primary issue.
DO $$
DECLARE
 review_id uuid:=current_setting('erp.t16_review')::uuid;
 version_id uuid:=current_setting('erp.t16_version')::uuid;
 version_digest text:=current_setting('erp.t16_digest');
 cmd jsonb:=jsonb_build_object('review',review_id,'version',version_id,'digest',version_digest);
 batch uuid; old_file uuid; accepted_file uuid; new_file uuid; operation uuid:=gen_random_uuid();
 mixed_layout uuid; state jsonb; old_payload jsonb; accepted_payload jsonb; alternate_payload jsonb;
 original_amount numeric; retained_sha text; payable numeric; paid jsonb;
BEGIN
 BEGIN
  PERFORM pg_temp.t16_configuration();
  INSERT INTO public.hr_mohre_establishments(id,owner_company_id,establishment_number,establishment_name,status)
    OVERRIDING SYSTEM VALUE VALUES(998602,920001,'0000000998602','Synthetic second establishment','active');
  INSERT INTO erp_private.t16_formats(company_id,establishment_id,effective_month,format_version,employer_code,payer_routing,
      identifier_kind,identifier_width,account_kind,account_width,routing_width,currency,detail_fields,control_fields,date_style,line_end,
      suffix,specification_file_id,specification_sha256)
  SELECT company_id,998602,effective_month,'synthetic-second','0000000998602',payer_routing,
      identifier_kind,identifier_width,account_kind,account_width,routing_width,currency,detail_fields,control_fields,date_style,line_end,
      suffix,specification_file_id,specification_sha256 FROM erp_private.t16_formats WHERE establishment_id=998601 RETURNING id INTO mixed_layout;
  INSERT INTO erp_private.t16_bank_routes(format_id,bank_id,routing_code) VALUES(mixed_layout,998601,'333000445');
  UPDATE public.employee_wps_profiles SET mohre_establishment_id=998602 WHERE employee_id=980002;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  state:=public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'issue',cmd);
  batch:=(state->>'batch')::uuid;
  RESET ROLE;
  SELECT f.id,f.sha256 INTO STRICT accepted_file,retained_sha FROM erp_private.t16_files f WHERE f.batch_id=batch AND f.establishment_id=998601;
  SELECT f.id,f.net_total INTO STRICT old_file,original_amount FROM erp_private.t16_files f WHERE f.batch_id=batch AND f.establishment_id=998602;
  accepted_payload:=jsonb_build_object('batch',batch,'wps_file',accepted_file,'reference','SYNTHETIC-A');
  old_payload:=jsonb_build_object('batch',batch,'wps_file',old_file,'reference','SYNTHETIC-B');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'start-handoff',accepted_payload);
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'record-submission',accepted_payload||pg_temp.t16_proof(998602));
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'accept',accepted_payload||pg_temp.t16_proof(998602));
  RESET ROLE;
  IF NOT erp_private.t16_channel_ready(batch,980001) OR erp_private.t16_channel_ready(batch,980002) THEN
    RAISE EXCEPTION 'One establishment acceptance unlocked an unrelated file';
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'start-handoff',old_payload);
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'reject',old_payload||pg_temp.t16_proof(998610));
  BEGIN
    PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'correct-file',
         old_payload||pg_temp.t16_proof(998610)||'{"reference":"WRONG"}');
    RAISE EXCEPTION 'A correction used the wrong movement reference'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}',true);
  UPDATE public.employee_wps_profiles SET mohre_person_code='00112233445588' WHERE employee_id=980002;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  state:=public.t16_wps_issue_command(operation,920001,920011,'correct-file',old_payload||pg_temp.t16_proof(998610));
  new_file:=(state->>'file')::uuid;
  IF new_file=old_file OR public.t16_wps_issue_command(operation,920001,920011,'correct-file',
         old_payload||pg_temp.t16_proof(998610)) IS DISTINCT FROM state||'{"replayed":true}'
     OR public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'correct-file',
         old_payload||pg_temp.t16_proof(998610))->>'file'<>new_file::text THEN
    RAISE EXCEPTION 'Correction retries created different file identity';
  END IF;
  BEGIN
    PERFORM public.t16_wps_download(old_file);
    RAISE EXCEPTION 'The rejected file is still available for handoff'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.t16_wps_download(new_file);
    RAISE EXCEPTION 'The corrected file bypassed a fresh handoff'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  RESET ROLE;
  IF (SELECT count(*) FROM erp_private.t16_files f WHERE f.batch_id=batch)<>3
   OR NOT EXISTS(SELECT 1 FROM erp_private.t16_files f WHERE f.id=new_file AND f.replaces_file_id=old_file
        AND f.net_total=original_amount AND f.correction_evidence_id=998610
        AND convert_from(f.content,'UTF8') LIKE 'EDR,00112233445588,%')
   OR NOT EXISTS(SELECT 1 FROM erp_private.t16_files f WHERE f.id=accepted_file AND f.sha256=retained_sha)
   OR NOT erp_private.t16_channel_ready(batch,980001) OR erp_private.t16_channel_ready(batch,980002) THEN
     RAISE EXCEPTION 'Mixed correction changed accepted scope, duplicate file, or approved amounts';
  END IF;
  old_payload:=jsonb_build_object('batch',batch,'wps_file',new_file,'reference','SYNTHETIC-B-REPLACEMENT');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'start-handoff',old_payload);
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'record-submission',old_payload||pg_temp.t16_proof(998602));
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'accept',old_payload||pg_temp.t16_proof(998602));
  RESET ROLE;
  IF NOT erp_private.t16_channel_ready(batch,980001) OR NOT erp_private.t16_channel_ready(batch,980002) THEN
     RAISE EXCEPTION 'Corrected file result did not resolve to the new acceptance';
  END IF;
  RAISE EXCEPTION USING ERRCODE='T1601',MESSAGE='Rollback mixed file branch';
 EXCEPTION WHEN SQLSTATE 'T1601' THEN NULL;
 END;
 BEGIN
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM pg_temp.t16_configuration();
  UPDATE public.employee_wps_profiles SET wps_applicable=false,wps_status='exempt',salary_payment_method='cheque'
   WHERE employee_id=980002;
  INSERT INTO erp_private.t16_alternate_channels(company_id,branch_id,channel,effective_month,policy_file_id,policy_sha256)
  VALUES(920001,920011,'cheque','2026-01-01',998614,lpad('998614',64,'0'));
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  state:=public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'issue',cmd);
  batch:=(state->>'batch')::uuid;
  alternate_payload:=jsonb_build_object('batch',batch,'reference','SYNTHETIC-CHEQUE')||pg_temp.t16_proof(998602);
  PERFORM public.t16_wps_issue_command(gen_random_uuid(),920001,920011,'authorize-cheque',alternate_payload);
  RESET ROLE;
  IF NOT erp_private.t16_channel_ready(batch,980002) OR erp_private.t16_channel_ready(batch,980001)
    OR erp_private.t15_bank_state(review_id)<>'submitted'
    OR EXISTS(SELECT 1 FROM erp_private.t16_batch_results m WHERE m.batch_id=batch AND m.employee_id=980002
       AND (m.channel IS DISTINCT FROM 'cheque' OR m.file_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Approved cheque did not use an independently protected non-WPS channel';
  END IF;
  IF to_regprocedure('public.t16_payroll_payment_command(uuid,bigint,bigint,text,jsonb)') IS NOT NULL THEN
    SELECT r.net INTO STRICT payable FROM erp_private.t14_results r WHERE r.version_id=current_setting('erp.t16_version')::uuid AND r.employee_id=980002;
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.t06_actor(3);
    paid:=public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'receipt',
      jsonb_build_object('batch',batch,'employee',980002,'channel','cheque','reference','CHEQUE-NOV-002',
        'amount',payable::text,'currency','AED','paid_on','2026-11-14','outcome','paid')||pg_temp.t16_proof(998603));
    RESET ROLE;
    IF paid->>'state'<>'paid' OR erp_private.t16_result_status(batch,980002)->>'status'<>'paid-unallocated' OR (erp_private.t16_result_status(batch,980002)->>'verified_cash')::numeric<>payable
       OR erp_private.t16_channel_ready(batch,980001) THEN
      RAISE EXCEPTION 'Cheque could not retain a verified employee payment while WPS was still pending';
    END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE='T1602',MESSAGE='Rollback alternate channel branch';
 EXCEPTION WHEN SQLSTATE 'T1602' THEN NULL;
 END;
 PERFORM set_config('request.jwt.claims','{}',true);
 RAISE NOTICE 'PASS: independent establishment acceptance, exact linked correction with retained sibling, and non-WPS authorization';
END $$;
