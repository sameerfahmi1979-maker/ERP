
DO $$
BEGIN
 IF to_regprocedure('public.t17_issue_prepare(uuid,uuid,bigint)') IS NULL THEN
   RAISE EXCEPTION 'The T17 exact payslip issuance boundary is unavailable';
 END IF;
END $$;

DO $$
DECLARE
 package uuid:=current_setting('erp.t16_batch')::uuid; selected erp_private.t16_batches;
 nonce uuid:=gen_random_uuid(); result jsonb; artifact_result jsonb; manifest jsonb; facts jsonb;
 original bigint; second bigint; pay uuid; allocation_revision int; pdf storage.objects;
 original_checksum text:=repeat('a',64);
BEGIN
 IF has_table_privilege('authenticated','erp_private.t17_slips','SELECT')
    OR has_function_privilege('authenticated','public.t17_attest_original(bigint,uuid,text,timestamp with time zone,text,integer,text)','EXECUTE')
    OR has_function_privilege('anon','public.t17_file_manifest(bigint,boolean)','EXECUTE') THEN
   RAISE EXCEPTION 'Private payroll or trusted PDF attestation was exposed';
 END IF;
 SELECT * INTO STRICT selected FROM erp_private.t16_batches WHERE id=package;
 IF erp_private.t16_result_status(package,980001)->>'status'<>'reconciled'
 OR erp_private.t16_result_status(package,980002)->>'status'<>'reconciled' THEN
   RAISE EXCEPTION 'T17 requires the two fully reconciled T16 predecessor results';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t17_issue_prepare(nonce,package,980001);
   RAISE EXCEPTION 'Issue grant without payslip read scope was honoured'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(5);
 BEGIN
   PERFORM public.t17_issue_prepare(nonce,package,980001);
   RAISE EXCEPTION 'Issuer prepared their own payslip'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t17_issue_prepare(nonce,package,980001);
   RAISE EXCEPTION 'Sibling could prepare payslip'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(2);
 result:=public.t17_issue_prepare(nonce,package,980001);
 original:=(result->>'id')::bigint;
 facts:=result->'snapshot';
 IF (result->>'finalized')::boolean OR (result->>'can_deliver')::boolean
    OR NOT (facts->'late_overtime' @> '[{"month":"2026-10-01","amount":"30.00"}]')
    OR facts->>'month'<>'2026-11-01' OR facts->>'currency'<>'AED' OR facts::text LIKE '%AE07033%' THEN
   RAISE EXCEPTION 'The original did not contain the retained late OT and private facts';
 END IF;
 IF public.t17_issue_prepare(nonce,package,980001) IS DISTINCT FROM result
    OR public.t17_issue_prepare(gen_random_uuid(),package,980001) IS DISTINCT FROM result THEN
   RAISE EXCEPTION 'Repeated preparation generated a different payslip';
 END IF;
 BEGIN
   PERFORM public.t17_issue_prepare(nonce,package,980002);
   RAISE EXCEPTION 'Changed request version or employee won a retained operation'; EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
 END;
 BEGIN
   PERFORM public.t17_issue_finalize(original);
   RAISE EXCEPTION 'Finalized without verified storage readback'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(4);
 BEGIN
   PERFORM public.t17_file_manifest(original);
   RAISE EXCEPTION 'Unfinalized payslip was downloadable'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
 INSERT INTO storage.objects(bucket_id,name,version,metadata)
 SELECT 'erp-generated-pdfs',s.storage_path,gen_random_uuid()::text,'{"size":1234,"mimetype":"application/pdf"}'::jsonb
 FROM erp_private.t17_slips s WHERE s.id=original RETURNING * INTO pdf;
 SET LOCAL ROLE service_role;
 PERFORM public.t17_attest_original(original,pdf.id,pdf.version,date_trunc('milliseconds',pdf.updated_at),original_checksum,1234,'t17-payslip-v1');
 PERFORM public.t17_attest_original(original,pdf.id,pdf.version,date_trunc('milliseconds',pdf.updated_at),original_checksum,1234,'t17-payslip-v1');
 BEGIN
   PERFORM public.t17_attest_original(original,pdf.id,pdf.version,date_trunc('milliseconds',pdf.updated_at),repeat('b',64),1234,'t17-payslip-v1');
   RAISE EXCEPTION 'A different readback changed retained artifact metadata'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 RESET ROLE;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
   RESET ROLE;
   UPDATE storage.objects SET version=gen_random_uuid()::text WHERE id=pdf.id;
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(2);
   PERFORM public.t17_issue_finalize(original);
   RAISE EXCEPTION 'Replaced storage object finalized'; EXCEPTION WHEN SQLSTATE 'PT409' THEN
     IF SQLERRM NOT LIKE 'The verified payslip object changed%' THEN RAISE; END IF;
 END;
 artifact_result:=public.t17_issue_finalize(original);
 IF artifact_result->>'checksum'<>original_checksum OR public.t17_issue_finalize(original) IS DISTINCT FROM artifact_result
 OR NOT (public.t17_issue_prepare(nonce,package,980001)->>'finalized')::boolean THEN
    RAISE EXCEPTION 'Original payslip did not finalize immutably';
 END IF;
 PERFORM pg_temp.t06_actor(4);
 manifest:=public.t17_file_manifest(original,true);
 IF manifest->>'checksum'<>original_checksum OR (manifest->>'size')::int<>1234 OR (manifest->>'object_id')::uuid<>pdf.id THEN
   RAISE EXCEPTION 'Historical read did not resolve original verified bytes metadata';
 END IF;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t17_file_manifest(original,true);
   RAISE EXCEPTION 'Sibling downloaded payslip'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(9);
 BEGIN
   PERFORM public.t17_file_manifest(original,true);
   RAISE EXCEPTION 'Other company downloaded payslip'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 -- A payment may reverse while the renderer is outside the database transaction.
 PERFORM pg_temp.t06_actor(2);
 second:=(public.t17_issue_prepare(gen_random_uuid(),package,980002)->>'id')::bigint;
 RESET ROLE;
 INSERT INTO storage.objects(bucket_id,name,version,metadata)
 SELECT 'erp-generated-pdfs',s.storage_path,gen_random_uuid()::text,'{"size":987,"mimetype":"application/pdf"}'::jsonb
 FROM erp_private.t17_slips s WHERE s.id=second RETURNING * INTO pdf;
 SET LOCAL ROLE service_role;
 PERFORM public.t17_attest_original(second,pdf.id,pdf.version,date_trunc('milliseconds',pdf.updated_at),repeat('c',64),987,'t17-payslip-v1');
 RESET ROLE;
 SELECT p.id,erp_private.t16_payment_revision(p.id) INTO STRICT pay,allocation_revision
 FROM erp_private.t16_payments p JOIN erp_private.t16_current_payment_events e ON e.payment_id=p.id
 WHERE p.batch_id=package AND p.employee_id=980002 AND e.outcome='paid';
 BEGIN
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(3);
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'reverse',
     jsonb_build_object('batch',package,'payment',pay,'revision',allocation_revision,'reason','Synthetic reversal while rendering')
     ||pg_temp.t16_proof(998612));
   PERFORM pg_temp.t06_actor(2);
   BEGIN
     PERFORM public.t17_issue_finalize(second);
     RAISE EXCEPTION 'A reversed payment finalized a prepared file'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
   END;
   PERFORM pg_temp.t06_actor(4);
   IF public.t17_file_manifest(original)->>'checksum'<>original_checksum THEN
     RAISE EXCEPTION 'A separate employee reversal changed the original';
   END IF;
   RAISE EXCEPTION USING ERRCODE='T1702',MESSAGE='Rollback reversal witness';
 EXCEPTION WHEN SQLSTATE 'T1702' THEN NULL;
 END;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t17_issue_finalize(second);
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 IF (SELECT count(*) FROM erp_private.t17_artifacts)<>2 OR (SELECT count(*) FROM erp_private.t17_file_access)<>1 THEN
   RAISE EXCEPTION 'Retries produced duplicate originals or denied access was recorded';
 END IF;
 PERFORM set_config('erp.t17_employee_a',original::text,true);
 PERFORM set_config('erp.t17_employee_b',second::text,true);
 RAISE NOTICE 'PASS: exact retained source, late overtime, permissions, immutable DB readback, replay and reversal between prepare and finalize';
END $$;

SELECT jsonb_build_object('payslip_snapshot',s.snapshot) FROM erp_private.t17_slips s WHERE id=current_setting('erp.t17_employee_a')::bigint;
