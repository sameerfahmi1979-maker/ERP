
-- Intended for the guarded T17 synthetic settlement transaction.
\set ON_ERROR_STOP on
DO $$
BEGIN
 IF to_regprocedure('public.t17_delivery_command(uuid,bigint,text,jsonb)') IS NULL
  OR to_regprocedure('public.t17_email_delivery_source(bigint,uuid,uuid)') IS NULL THEN
   RAISE EXCEPTION 'T17 retained payslip delivery is not installed';
 END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.roles(role_code,role_name,is_system_role)
 VALUES('t17_delivery_native','Synthetic payslip delivery Accounts',false);
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
 WHERE r.role_code='t17_delivery_native' AND p.permission_code IN
  ('hr.payroll.view','hr.payroll.payslip.view','hr.payroll.payslip.issue','hr.payroll.payslip.deliver');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
 SELECT pg_temp.t08_profile(x.actor),r.id,x.company,x.branch,true
 FROM public.roles r CROSS JOIN (VALUES (2,920001,920011),(3,920001,920011),(5,920001,920011),
  (6,920001,920012),(9,920002,920021)) x(actor,company,branch)
 WHERE r.role_code='t17_delivery_native';
UPDATE public.employees SET personal_email='t06-5@example.test' WHERE id=980001;
UPDATE public.employees SET personal_email='typed-not-verified@example.test' WHERE id=980002;

DO $$
DECLARE batch uuid:=current_setting('erp.t16_batch')::uuid; operation uuid:=gen_random_uuid();
  s_email bigint; s_print bigint; d_email bigint; d_print bigint; d_resend bigint; id_q bigint;
  expected jsonb; receipt jsonb; q public.erp_email_queue; provider public.erp_email_provider_configs;
  lease_owner_value uuid:=gen_random_uuid(); next_worker uuid:=gen_random_uuid(); decision text; original_payment uuid;
  review_operation uuid:=gen_random_uuid(); later_delivery bigint; review_body jsonb;
  email_object storage.objects; print_object storage.objects;
  destination text:='t06-5@example.test';
BEGIN
 IF has_function_privilege('authenticated','public.t17_email_delivery_source(bigint,uuid,uuid)','execute')
   OR has_function_privilege('anon','public.t17_delivery_command(uuid,bigint,text,jsonb)','execute')
   OR has_table_privilege('authenticated','erp_private.t17_payslip_deliveries','select')
   OR has_table_privilege('authenticated','erp_private.t17_payslip_delivery_events','select') THEN
   RAISE EXCEPTION 'Payslip destination or evidence privileges are too broad';
 END IF;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 s_email:=(public.t17_issue_prepare(gen_random_uuid(),batch,980001)->>'id')::bigint;
 s_print:=(public.t17_issue_prepare(gen_random_uuid(),batch,980002)->>'id')::bigint;
 BEGIN
   PERFORM public.t17_delivery_command(operation,s_email,'initial','{}');
   RAISE EXCEPTION 'An unfinalized artifact could enter delivery';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 INSERT INTO storage.buckets(id,name,public) VALUES('erp-generated-pdfs','erp-generated-pdfs',false)
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO storage.objects(bucket_id,name,metadata,version)
 SELECT 'erp-generated-pdfs',storage_path,'{"size":115,"mimetype":"application/pdf"}',gen_random_uuid()::text
 FROM erp_private.t17_slips WHERE id=s_email RETURNING * INTO email_object;
 INSERT INTO storage.objects(bucket_id,name,metadata,version)
 SELECT 'erp-generated-pdfs',storage_path,'{"size":116,"mimetype":"application/pdf"}',gen_random_uuid()::text
 FROM erp_private.t17_slips WHERE id=s_print RETURNING * INTO print_object;
 SET LOCAL ROLE service_role;
 PERFORM public.t17_attest_original(s_email,email_object.id,email_object.version,
   date_trunc('milliseconds',email_object.updated_at),repeat('a',64),115,'t17-payslip-v1');
 PERFORM public.t17_attest_original(s_print,print_object.id,print_object.version,
   date_trunc('milliseconds',print_object.updated_at),repeat('b',64),116,'t17-payslip-v1');

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t17_issue_finalize(s_email);
 PERFORM public.t17_issue_finalize(s_print);
 FOR decision IN SELECT unnest(ARRAY['5','6','9']) LOOP
   PERFORM pg_temp.t06_actor(decision::int);
   BEGIN
     PERFORM public.t17_delivery_command(operation,s_email,'initial','{}');
     RAISE EXCEPTION 'Self, sibling branch or other company obtained delivery';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
   PERFORM public.t17_delivery_command(operation,s_email,'initial','{"recipient":"other@example.test"}');
   RAISE EXCEPTION 'Caller replaced the verified recipient';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 receipt:=public.t17_delivery_command(operation,s_email,'initial','{}');
 d_email:=(receipt->>'id')::bigint;
 IF receipt->>'state'<>'queued' OR receipt->>'channel'<>'email'
   OR (public.t17_delivery_command(operation,s_email,'initial','{}')->>'replayed')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Initial confirmed email did not retain one replay-safe queue intent';
 END IF;
 PERFORM pg_temp.t06_actor(3);
 IF (public.t17_delivery_command(gen_random_uuid(),s_email,'initial','{}')->>'id')::bigint<>d_email THEN
   RAISE EXCEPTION 'A second delivery actor did not reuse the original intent';
 END IF;
 d_print:=(public.t17_delivery_command(gen_random_uuid(),s_print,'initial','{}')->>'id')::bigint;
 BEGIN
   PERFORM public.t17_delivery_command(gen_random_uuid(),s_email,'resend','{"reason":"Pending original"}');
   RAISE EXCEPTION 'A pending original was resent';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   PERFORM public.t17_delivery_command(gen_random_uuid(),s_email,'handover',
     jsonb_build_object('delivery',d_print,'reason','Wrong archived employee'));
   RAISE EXCEPTION 'A different employee delivery was handed over';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 receipt:=public.t17_delivery_command(gen_random_uuid(),s_print,'handover',
   jsonb_build_object('delivery',d_print,'reason','Confirmed in-person handover'));
 IF receipt->>'state'<>'handed_over' THEN RAISE EXCEPTION 'Print handover was not retained'; END IF;
 RESET ROLE;
 IF (SELECT count(*) FROM public.erp_email_queue WHERE source_module='HR_PAYSLIP')<>1
   OR (SELECT recipient FROM erp_private.t17_payslip_deliveries WHERE id=d_email)<>destination
   OR (SELECT channel FROM erp_private.t17_payslip_deliveries WHERE id=d_print)<>'print'
 THEN RAISE EXCEPTION 'Unverified employee profile mailbox entered the queue or duplicated the initial'; END IF;

 INSERT INTO public.erp_email_provider_configs(provider_code,provider_type,provider_name,is_default,is_enabled,
   throttle_per_minute,daily_send_limit)
 VALUES('T17_SYNTHETIC','microsoft_graph','Synthetic outcome only - no transport',true,true,25,100)
 RETURNING * INTO provider;
 SET LOCAL ROLE service_role;
 SELECT * INTO STRICT q FROM public.f09_claim_email(lease_owner_value,NULL,'HR_PAYSLIP');
 id_q:=q.id;
 IF public.f09_cancel_email(id_q) THEN
   RAISE EXCEPTION 'Generic global cancellation modified a confidential payslip intent';
 END IF;
 expected:=public.t17_email_delivery_source(id_q,lease_owner_value,q.lease_token);
 IF expected IS NULL OR expected->>'recipient'<>destination OR expected->>'checksum'<>repeat('a',64)
   OR (expected->>'size_bytes')::int<>115 OR expected ? 'bank_slip'
   OR public.t17_email_delivery_source(id_q,gen_random_uuid(),q.lease_token) IS NOT NULL THEN
   RAISE EXCEPTION 'F09 source binding did not match the private verified mailbox and exact retained artifact';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(8);
 IF EXISTS(SELECT 1 FROM public.erp_email_queue WHERE id=id_q) THEN
   RAISE EXCEPTION 'Generic global queue exposed a payroll mail intent';
 END IF;
 RESET ROLE;

 -- Simulate state changes after a preparer has read the original, before F09 marks a dispatch.
 BEGIN
   UPDATE storage.objects SET version=gen_random_uuid()::text WHERE id=email_object.id;
   SET LOCAL ROLE service_role;
   IF public.t17_email_delivery_source(id_q,lease_owner_value,q.lease_token) IS NOT NULL THEN
     RAISE EXCEPTION 'An object replacement retained its original mail authority';
   END IF;
   BEGIN
     PERFORM public.f09_admit_email_dispatch(id_q,lease_owner_value,q.lease_token,provider.id,to_jsonb(provider));
     RAISE EXCEPTION 'A replaced original crossed the final dispatch gate';
   EXCEPTION WHEN SQLSTATE 'P1710' THEN NULL; END;
   RAISE EXCEPTION USING ERRCODE='T1700',MESSAGE='rollback synthetic object replacement';
 EXCEPTION WHEN SQLSTATE 'T1700' THEN NULL; END;
 BEGIN
   UPDATE public.employees SET personal_email='retargeted@example.test' WHERE id=980001;
   SET LOCAL ROLE service_role;
   BEGIN
     PERFORM public.f09_admit_email_dispatch(id_q,lease_owner_value,q.lease_token,provider.id,to_jsonb(provider));
     RAISE EXCEPTION 'A stale recipient crossed the final dispatch gate';
   EXCEPTION WHEN SQLSTATE 'P1710' THEN NULL; END;
   RAISE EXCEPTION USING ERRCODE='T1700',MESSAGE='rollback synthetic address change';
 EXCEPTION WHEN SQLSTATE 'T1700' THEN NULL; END;
 BEGIN
   UPDATE public.user_roles SET is_active=false
    WHERE user_profile_id=pg_temp.t08_profile(2)
     AND role_id=(SELECT id FROM public.roles WHERE role_code='t17_delivery_native');
   SET LOCAL ROLE service_role;
   IF public.t17_email_delivery_source(id_q,lease_owner_value,q.lease_token) IS NOT NULL THEN
     RAISE EXCEPTION 'Revoked Accounts authority still prepared a queued send';
   END IF;
   BEGIN
     PERFORM public.f09_admit_email_dispatch(id_q,lease_owner_value,q.lease_token,provider.id,to_jsonb(provider));
     RAISE EXCEPTION 'Revoked Accounts authority crossed the final send gate';
   EXCEPTION WHEN SQLSTATE 'P1710' THEN NULL; END;
   RAISE EXCEPTION USING ERRCODE='T1700', MESSAGE='rollback synthetic grant revocation';
 EXCEPTION WHEN SQLSTATE 'T1700' THEN NULL; END;
 BEGIN
   SELECT p.id INTO STRICT original_payment FROM erp_private.t16_payments p
   JOIN erp_private.t16_current_payment_events e ON e.payment_id=p.id
   WHERE p.batch_id=batch AND p.employee_id=980001 AND e.outcome='paid'
     AND NOT EXISTS(SELECT 1 FROM erp_private.t16_payment_reversals r WHERE r.payment_id=p.id);
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(3);
   PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'reverse',
     jsonb_build_object('batch',batch,'payment',original_payment,'revision',1,'reason','Synthetic payment reversed')||pg_temp.t16_proof(998612));
   BEGIN
     PERFORM public.t17_delivery_command(gen_random_uuid(),s_email,'print','{"reason":"Payment reversed"}');
     RAISE EXCEPTION 'A reversed payslip remained eligible for fresh delivery';
   EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
   SET LOCAL ROLE service_role;
   IF public.t17_email_delivery_source(id_q,lease_owner_value,q.lease_token) IS NOT NULL THEN
     RAISE EXCEPTION 'Reversed payment remained eligible for queued send';
   END IF;
   RAISE EXCEPTION USING ERRCODE='T1700',MESSAGE='rollback synthetic reversal';
 EXCEPTION WHEN SQLSTATE 'T1700' THEN NULL; END;
 SET LOCAL ROLE service_role;
 IF public.f09_admit_email_dispatch(id_q,lease_owner_value,q.lease_token,provider.id,to_jsonb(provider))<>'allowed'
   OR NOT public.f09_finish_provider_email(id_q,lease_owner_value,q.lease_token,'accepted',NULL) THEN
   RAISE EXCEPTION 'Synthetic original was not durably recorded as provider accepted';
 END IF;
 IF public.t17_email_delivery_source(id_q,lease_owner_value,q.lease_token) IS NOT NULL THEN
   RAISE EXCEPTION 'A finished original source was prepared again';
 END IF;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 receipt:=public.t17_delivery_command(gen_random_uuid(),s_email,'bounce',
   jsonb_build_object('delivery',d_email,'reference','SYNTH-BOUNCE-1','reason','Confirmed provider nondelivery'));
 IF receipt->>'state'<>'bounced' THEN RAISE EXCEPTION 'Verified bounce did not update delivery history'; END IF;
 receipt:=public.t17_delivery_command(gen_random_uuid(),s_email,'resend','{"reason":"Verified mailbox still current"}');
 d_resend:=(receipt->>'id')::bigint;
 IF d_resend=d_email THEN RAISE EXCEPTION 'Authorized distinct resend lost its history'; END IF;

 SET LOCAL ROLE service_role;
 SELECT * INTO STRICT q FROM public.f09_claim_email(next_worker,NULL,'HR_PAYSLIP');
 expected:=public.t17_email_delivery_source(q.id,next_worker,q.lease_token);
 IF expected IS NULL OR expected->>'checksum'<>repeat('a',64)
   OR public.f09_admit_email_dispatch(q.id,next_worker,q.lease_token,provider.id,to_jsonb(provider))<>'allowed'
   OR NOT public.f09_finish_provider_email(q.id,next_worker,q.lease_token,'unknown',NULL) THEN
   RAISE EXCEPTION 'Uncertain resend did not retain the same PDF and hold the uncertain outcome';
 END IF;
 RESET ROLE;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
   PERFORM public.t17_delivery_command(gen_random_uuid(),s_email,'resend','{"reason":"Uncertain original must remain held"}');
   RAISE EXCEPTION 'An uncertain send was blindly retried';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 RESET ROLE;
 review_body:=jsonb_build_object('delivery',d_resend,'disposition','not-accepted',
   'reference','SYNTH-UNKNOWN-TRACE','reason','Confirmed provider did not accept this send');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t17_delivery_command(review_operation,s_email,'reconcile-email',review_body);
   RAISE EXCEPTION 'A sibling branch reconciled uncertain payslip delivery';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(2);
 receipt:=public.t17_delivery_command(review_operation,s_email,'reconcile-email',review_body);
 IF receipt->>'state'<>'provider_not_accepted_confirmed'
   OR (public.t17_delivery_command(review_operation,s_email,'reconcile-email',review_body)->>'replayed')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'One trace-backed confirmed nonacceptance was not retained';
 END IF;
 BEGIN
   PERFORM public.t17_delivery_command(gen_random_uuid(),s_email,'reconcile-email',
     review_body||jsonb_build_object('disposition','accepted'));
   RAISE EXCEPTION 'Contradictory evidence overwrote a retained reconciliation';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 later_delivery:=(public.t17_delivery_command(gen_random_uuid(),s_email,'resend',
   '{"reason":"Deliberate resend after confirmed nonacceptance"}')->>'id')::bigint;
 IF later_delivery=d_resend THEN RAISE EXCEPTION 'Explicit later resend did not create its own history'; END IF;
 SET LOCAL ROLE service_role;
 SELECT * INTO STRICT q FROM public.f09_claim_email(next_worker,NULL,'HR_PAYSLIP');
 expected:=public.t17_email_delivery_source(q.id,next_worker,q.lease_token);
 IF expected IS NULL OR expected->>'checksum'<>repeat('a',64)
   OR public.f09_admit_email_dispatch(q.id,next_worker,q.lease_token,provider.id,to_jsonb(provider))<>'allowed'
   OR NOT public.f09_finish_provider_email(q.id,next_worker,q.lease_token,'unknown',NULL) THEN
   RAISE EXCEPTION 'The later resend changed the original or did not isolate the uncertain provider result';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 receipt:=public.t17_delivery_command(gen_random_uuid(),s_email,'reconcile-email',
   jsonb_build_object('delivery',later_delivery,'disposition','accepted',
      'reference','SYNTH-ACCEPTED-TRACE','reason','Provider trace confirmed acceptance'));
 IF receipt->>'state'<>'provider_accepted_confirmed' THEN
   RAISE EXCEPTION 'Confirmed accepted evidence was confused with nonacceptance';
 END IF;
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(s_email) WHERE id=d_email AND state='bounced')
   OR NOT EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(s_email) WHERE id=d_resend AND state='provider_not_accepted_confirmed')
   OR NOT EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(s_email) WHERE id=later_delivery AND state='provider_accepted_confirmed')
   OR NOT EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(s_email) WHERE kind='print' AND state='print_ready')
   OR erp_private.t17_delivery_history(s_email)::text ~ 'example[.]test|SYNTH-BOUNCE|checksum|storage_path' THEN
   RAISE EXCEPTION 'Retained delivery history masked privacy or omitted a factual outcome';
 END IF;
END;
$$;
SELECT 'PASS: delivery exact original, one initial intent, print and handover, scoped worker and original-bound dispatch, synthetic bounce, distinct resend and confirmed uncertain outcomes.';
