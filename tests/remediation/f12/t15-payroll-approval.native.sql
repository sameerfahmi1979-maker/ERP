
-- Run after the T14 synthetic ready draft, within the original rollback transaction.
DO $$
BEGIN
 IF to_regprocedure('public.t15_payroll_review_command(uuid,bigint,bigint,text,jsonb)') IS NULL
   OR to_regprocedure('erp_private.t15_sealed_version(uuid,uuid,text)') IS NULL THEN
   RAISE EXCEPTION 'T15 approval, exact claim and sealed version boundary is unavailable';
 END IF;
END $$;
\if :{?t15_red}
ROLLBACK;
\else
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t15_accounts','Synthetic payroll submitter',false),('t15_gm','Synthetic independent payroll decision',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t15_accounts',ARRAY['hr.payroll.run.submit','hr.payroll.view']),
 ('t15_gm',ARRAY['hr.payroll.run.approve','hr.payroll.view'])
) g(role,caps) JOIN public.roles r ON r.role_code=g.role JOIN public.permissions p ON p.permission_code=ANY(g.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(a.actor),r.id,a.company,a.branch,true
FROM (VALUES (2,'t15_accounts',920001,920011),(2,'t15_gm',920001,920011),(3,'t15_gm',920001,920011),
 (5,'t15_gm',920001,920011),(7,'t15_gm',920001,920011),(6,'t15_gm',920001,920012),
 (9,'t15_gm',920002,920021)
) a(actor,role,company,branch) JOIN public.roles r ON r.role_code=a.role;
INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id,linked_by)
VALUES(pg_temp.t08_profile(5),980001,pg_temp.t08_profile(1));

DO $$
DECLARE
 anchor erp_private.t14_runs; version erp_private.t14_versions; next_version erp_private.t14_versions;
 m date:='2026-11-01'; operation uuid:=gen_random_uuid(); bank_nonce uuid:=gen_random_uuid(); bank_proof uuid:=gen_random_uuid();
 review uuid; rejected uuid; replacement uuid; submit_request jsonb; decision_request jsonb; receipt jsonb; view_data jsonb;
 n int; bank_id bigint; result jsonb; expected_fleet bigint:=current_setting('erp.t08_work')::bigint;
 prior_case_pins int; recovery_line erp_private.t14_lines;
 cutoff_text text; revoked_assignment bigint;
BEGIN
 SELECT * INTO STRICT anchor FROM erp_private.t14_runs WHERE company_id=920001 AND branch_id=920011 AND month=m;
 SELECT * INTO version FROM erp_private.t14_versions WHERE run_id=anchor.id ORDER BY number DESC LIMIT 1;
 IF version.number<>2 OR version.exception_count=0 THEN RAISE EXCEPTION 'Use the retained ready T14 draft with nonblocking exceptions'; END IF;
 cutoff_text:=to_char(version.cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
 IF has_table_privilege('authenticated','erp_private.t15_reviews','SELECT')
   OR has_function_privilege('authenticated','erp_private.t15_sealed_version(uuid,uuid,text)','EXECUTE')
   OR has_function_privilege('service_role','erp_private.t15_record_bank_event(uuid,uuid,uuid,text,text,uuid,text)','EXECUTE')
   OR has_function_privilege('anon','public.t15_payroll_review_command(uuid,bigint,bigint,text,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Payroll review or private lifecycle access leaked';
 END IF;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(8);
 IF public.t15_payroll_review_scopes()<>'[]'::jsonb THEN RAISE EXCEPTION 'Global admin inherited scoped payroll approval'; END IF;
 PERFORM pg_temp.t06_actor(1);
 BEGIN
   PERFORM public.t15_payroll_review_workspace(920001,920011,m);
   RAISE EXCEPTION 'Fleet worker obtained payroll review'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(2);
 view_data:=public.t15_payroll_review_workspace(920001,920011,m,NULL,980001);
 IF (view_data->'draft'->>'version')::uuid<>version.id OR NOT (view_data->'draft'->>'can_submit')::boolean
   OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(view_data->'detail'->'lines') l WHERE l->>'key' LIKE ('fleet-overtime:'||expected_fleet||':%'))
 THEN RAISE EXCEPTION 'The Accounts preview did not match the T14 version'; END IF;
 submit_request:=jsonb_build_object('run',anchor.id,'version',version.id,'digest',version.digest,
   'acknowledge_exceptions',true,'reason','Accounts reviewed exact payroll and carried exceptions');
 BEGIN
   RESET ROLE;
   PERFORM set_config('request.jwt.claims','{}',true);
   INSERT INTO public.employee_payroll_holds(employee_id,hold_reason,hold_date,created_at,updated_at)
   VALUES(980001,'Synthetic hold on this review','2026-11-02','2026-11-19','2026-11-19');
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(2);
   result:=public.t14_payroll_command(gen_random_uuid(),920001,920011,'calculate',
      jsonb_build_object('month',m,'cutoff',cutoff_text,'expected_version',version.id,'reason','Test blocking hold'));
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'submit',submit_request||
      jsonb_build_object('version',result->>'version','digest',result->>'digest'));
   RAISE EXCEPTION 'An unresolved payroll hold was submitted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
   IF SQLERRM NOT LIKE 'Resolve payroll holds%' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'submit',submit_request||'{"acknowledge_exceptions":false}');
   RAISE EXCEPTION 'Accounts submitted without acknowledging exceptions'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 receipt:=public.t15_payroll_review_command(operation,920001,920011,'submit',submit_request);
 review:=(receipt->>'review')::uuid;
 IF receipt->>'state'<>'submitted' OR public.t15_payroll_review_command(operation,920001,920011,'submit',submit_request)
     IS DISTINCT FROM receipt||'{"replayed":true}' THEN RAISE EXCEPTION 'Submission retry did not return the original receipt'; END IF;
 BEGIN
   PERFORM public.t15_payroll_review_command(operation,920001,920011,'submit',submit_request||'{"reason":"An unsafe changed retry"}');
   RAISE EXCEPTION 'Changed retry accepted'; EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
 END;
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'submit',submit_request);
   RAISE EXCEPTION 'The same version submitted twice'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
   PERFORM public.t14_payroll_command(gen_random_uuid(),920001,920011,'calculate',
      jsonb_build_object('month',m,'cutoff',cutoff_text,'expected_version',version.id,'reason','Attempted change to submitted version'));
   RAISE EXCEPTION 'T14 could revise a submitted version'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 decision_request:=jsonb_build_object('review',review,'version',version.id,'digest',version.digest,'reason','GM reviewed exact version',
   'recovery_schedule_digest',public.t15_payroll_review_workspace(920001,920011,m,review)
      #>> '{review,recovery_schedule_snapshot,digest}');
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'approve',decision_request);
   RAISE EXCEPTION 'Dual-role submitter self-approved'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'approve',decision_request);
   RAISE EXCEPTION 'The underlying adjustment verifier approved the same pay'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(5);
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'approve',decision_request);
   RAISE EXCEPTION 'The linked employee approved their own payroll'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920012,'approve',decision_request);
   RAISE EXCEPTION 'The sibling branch approved this payroll'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(9);
 BEGIN
   PERFORM public.t15_payroll_review_workspace(920002,920021,m,review,980001);
   RAISE EXCEPTION 'The receiving company read exact original-payer payroll'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'approve',decision_request||jsonb_build_object('version',gen_random_uuid()));
   RAISE EXCEPTION 'GM approved the wrong version UUID'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'approve',decision_request||jsonb_build_object('digest',repeat('f',64)));
   RAISE EXCEPTION 'GM approved an incorrect content digest'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 -- A real change after Accounts review must block approval. This synthetic
 -- mutation rolls back in the expected error's subtransaction.
 BEGIN
   RESET ROLE;
   PERFORM set_config('request.jwt.claims','{}',true);
   UPDATE public.employee_salary_components SET amount=amount+10 WHERE employee_id=980001;
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(7);
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'approve',decision_request);
   RAISE EXCEPTION 'The GM approved a materially changed source';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
   IF SQLERRM NOT LIKE 'Payroll facts changed.%' THEN RAISE; END IF;
 END;
 operation:=gen_random_uuid();
 RESET ROLE;
 INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
 SELECT pg_temp.t08_profile(7),id,920002,920021,true FROM public.roles WHERE role_code='t15_gm';
 UPDATE public.user_roles SET is_active=false WHERE user_profile_id=pg_temp.t08_profile(7)
   AND role_id=(SELECT id FROM public.roles WHERE role_code='t15_gm') AND owner_company_id=920001 AND branch_id=920011
 RETURNING id INTO STRICT revoked_assignment;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(7);
 view_data:=public.t15_payroll_review_scopes();
 IF view_data @> '[{"company_id":920001,"branch_id":920011,"can_approve":true}]'::jsonb
    OR NOT view_data @> '[{"company_id":920002,"branch_id":920021,"can_approve":true}]'::jsonb THEN
   RAISE EXCEPTION 'Revocation removed another assignment or left the revoked branch available'; END IF;
 BEGIN
   PERFORM public.t15_payroll_review_command(operation,920001,920011,'approve',decision_request);
   RAISE EXCEPTION 'GM approved a submitted version after the branch assignment was revoked';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
 IF (SELECT r.state FROM erp_private.t15_reviews r WHERE r.id=review) IS DISTINCT FROM 'submitted'
    OR EXISTS(SELECT 1 FROM erp_private.t15_claim_reservations q WHERE q.review_id=review)
    OR EXISTS(SELECT 1 FROM erp_private.t15_review_events e WHERE e.review_id=review AND e.kind='approved')
    OR EXISTS(SELECT 1 FROM erp_private.t02_operation_receipts WHERE operation_id=operation) THEN
   RAISE EXCEPTION 'Denied first approval retained a state, claim, audit or receipt effect'; END IF;
 UPDATE public.user_roles SET is_active=true WHERE id=revoked_assignment;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(7);
 receipt:=public.t15_payroll_review_command(operation,920001,920011,'approve',decision_request);
 n:=(receipt->>'claims_count')::int;
 IF n<=0 OR receipt->>'state'<>'approved' OR public.t15_payroll_review_command(operation,920001,920011,'approve',decision_request)
   IS DISTINCT FROM receipt||'{"replayed":true}' THEN RAISE EXCEPTION 'Approval retry duplicated or lost exclusive sources'; END IF;
 RESET ROLE;
 IF (SELECT count(*) FROM erp_private.t15_reviews r WHERE r.id=review AND r.state='approved' AND r.claim_count=n)<>1
    OR (SELECT count(*) FROM erp_private.t15_claim_reservations q WHERE q.review_id=review AND q.released_at IS NULL)<>1
    OR (SELECT count(*) FROM erp_private.t15_review_events e WHERE e.review_id=review AND e.kind='approved')<>1
    OR (SELECT count(*) FROM erp_private.t02_operation_receipts WHERE operation_id=operation AND domain='t15-payroll-review')<>1 THEN
   RAISE EXCEPTION 'Reauthorized approval and lost-response retry did not retain one business state, claim, audit and receipt'; END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   RESET ROLE;
   PERFORM set_config('request.jwt.claims','{}',true);
   UPDATE public.user_roles SET is_active=false WHERE user_profile_id=pg_temp.t08_profile(7)
     AND role_id=(SELECT id FROM public.roles WHERE role_code='t15_gm');
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(7);
   PERFORM public.t15_payroll_review_command(operation,920001,920011,'approve',decision_request);
   RAISE EXCEPTION 'Revoked GM permission replayed a protected approval';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'approve',decision_request);
   RAISE EXCEPTION 'A second approval with another operation was accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 view_data:=public.t15_payroll_review_workspace(920001,920011,m,review,980001);
 IF view_data->'review'->>'state'<>'approved' OR (view_data->'review'->>'claims_count')::int<>n
   OR view_data::text ~* '(iban|account_number|bank_reference|evidence_version)' THEN
   RAISE EXCEPTION 'The exact approval was hidden or the payroll projection exposed restricted evidence';
 END IF;

 -- Exercise an unissued replacement, then roll that event back so the same
 -- original can exercise retained uncertain and verified bank outcomes.
 BEGIN
   PERFORM pg_temp.t06_actor(2);
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'request-release',decision_request);
   PERFORM pg_temp.t06_actor(7);
   result:=public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'release',decision_request);
   IF result->>'state'<>'superseded' THEN RAISE EXCEPTION 'Unissued approved payroll could not be superseded'; END IF;
   RAISE SQLSTATE 'P0411' USING MESSAGE='Rollback the synthetic unissued replacement';
 EXCEPTION WHEN SQLSTATE 'P0411' THEN NULL;
 END;

 -- The private lifecycle exercises future trusted attestations with synthetic
 -- IDs. It creates no WPS envelope, bank connection, or payment amounts.
 RESET ROLE;
 SELECT count(*) INTO prior_case_pins FROM erp_private.t13_payroll_pins;
 SELECT * INTO STRICT recovery_line FROM erp_private.t14_lines WHERE version_id=version.id AND category='recovery';
 BEGIN
   PERFORM erp_private.t13_payroll_pin((recovery_line.source->>'case')::bigint,'deduction',
     (recovery_line.source->>'upstream_id')::bigint,m,version.id,recovery_line.id,review,pg_temp.t08_profile(6),
     recovery_line.amount,recovery_line.amount,recovery_line.source->>'fingerprint');
   RAISE EXCEPTION 'A different GM identity could bind the approved recovery line';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
   IF SQLERRM<>'The recovery pin must match the retained GM decision' THEN RAISE; END IF;
 END;
 result:=erp_private.t15_sealed_version(review,version.id,version.digest);
 IF (result->>'company')::bigint<>920001 OR (result->>'gm_actor')::bigint<>pg_temp.t08_profile(7)
   OR (result->>'version')::uuid<>version.id THEN RAISE EXCEPTION 'Sealed version does not bind exact payer, reviewer and draft'; END IF;
 bank_id:=erp_private.t15_record_bank_event(bank_nonce,review,version.id,version.digest,'prepared',bank_proof,'Synthetic reserved file identity');
 IF erp_private.t15_record_bank_event(bank_nonce,review,version.id,version.digest,'prepared',bank_proof,'Synthetic reserved file identity')<>bank_id
 THEN RAISE EXCEPTION 'The private lifecycle retry duplicated the receipt'; END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'request-release',decision_request);
 RESET ROLE;
 PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),review,version.id,version.digest,'unknown',gen_random_uuid(),'Synthetic uncertain submission');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'release',decision_request);
   RAISE EXCEPTION 'A replacement decision ignored newly uncertain submission'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'decline-release',decision_request);
 PERFORM pg_temp.t06_actor(2);
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'request-release',decision_request);
   RAISE EXCEPTION 'An unknown submission allowed replacement'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 RESET ROLE;
 BEGIN
   PERFORM erp_private.t15_sealed_version(review,version.id,version.digest);
   RAISE EXCEPTION 'An unknown submission allowed a second issue'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),review,version.id,version.digest,'rejected',gen_random_uuid(),'Synthetic confirmed rejection');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'request-release',decision_request||'{"reason":"Accounts reviewed confirmed rejection"}');
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'release',decision_request);
   RAISE EXCEPTION 'Accounts approved its own replacement'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(7);
 receipt:=public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'release',decision_request||'{"reason":"Independent replacement after confirmed rejection"}');
 IF receipt->>'state'<>'superseded' THEN RAISE EXCEPTION 'Approved version not superseded after verified rejection'; END IF;
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM erp_private.t15_claim_reservations a WHERE a.review_id=review AND a.released_at IS NOT NULL)
   OR (SELECT count(*) FROM erp_private.t15_review_events e WHERE e.review_id=review)<>6
   OR (SELECT count(*) FROM erp_private.t15_bank_events e WHERE e.review_id=review)<>3
   OR (SELECT count(*) FROM erp_private.t13_payroll_pins)<>prior_case_pins THEN
   RAISE EXCEPTION 'Supersession lost approval history or manufactured settlement activity';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 receipt:=public.t14_payroll_command(gen_random_uuid(),920001,920011,'calculate',jsonb_build_object('month',m,
   'cutoff',cutoff_text,'expected_version',version.id,'reason','Fresh calculation for verified replacement'));
 submit_request:=submit_request||jsonb_build_object('version',receipt->>'version','digest',receipt->>'digest');
 result:=public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'submit',submit_request);
 rejected:=(result->>'review')::uuid;
 decision_request:=jsonb_build_object('review',rejected,'version',result->>'version','digest',result->>'digest','reason','GM rejected replacement for review');
 PERFORM pg_temp.t06_actor(7);
 IF public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'reject',decision_request)->>'state'<>'rejected'
 THEN RAISE EXCEPTION 'GM rejection not recorded'; END IF;

 PERFORM pg_temp.t06_actor(2);
 receipt:=public.t14_payroll_command(gen_random_uuid(),920001,920011,'calculate',jsonb_build_object('month',m,
   'cutoff',cutoff_text,'expected_version',result->>'version','reason','Recalculated after GM rejection'));
 submit_request:=submit_request||jsonb_build_object('version',receipt->>'version','digest',receipt->>'digest');
 result:=public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'submit',submit_request);
 replacement:=(result->>'review')::uuid;
 decision_request:=jsonb_build_object('review',replacement,'version',result->>'version','digest',result->>'digest',
   'reason','GM reviewed the new exact calculation',
   'recovery_schedule_digest',public.t15_payroll_review_workspace(920001,920011,m,replacement)
      #>> '{review,recovery_schedule_snapshot,digest}');
 PERFORM pg_temp.t06_actor(7);
 receipt:=public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'approve',decision_request);
 IF receipt->>'state'<>'approved' OR (receipt->>'claims_count')::int<>n THEN
   RAISE EXCEPTION 'Replacement did not re-reserve the exact underlying facts';
 END IF;
 RESET ROLE;
 SELECT * INTO next_version FROM erp_private.t14_versions WHERE id=(result->>'version')::uuid;
 PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),replacement,next_version.id,next_version.digest,'prepared',gen_random_uuid(),'Synthetic preparation');
 PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),replacement,next_version.id,next_version.digest,'submitted',gen_random_uuid(),'Synthetic confirmed submission');
 PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),replacement,next_version.id,next_version.digest,'partially-settled',gen_random_uuid(),'Synthetic partial result');
 PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),replacement,next_version.id,next_version.digest,'reversed',gen_random_uuid(),'Synthetic linked reversal status');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
   PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'request-release',decision_request);
   RAISE EXCEPTION 'A partial settlement or linked reversal reopened already approved payroll'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 RESET ROLE;
 IF EXISTS(SELECT 1 FROM erp_private.t15_claim_reservations a WHERE a.review_id=replacement AND a.released_at IS NOT NULL)
   OR (SELECT count(*) FROM erp_private.t13_payroll_pins)<>prior_case_pins THEN
   RAISE EXCEPTION 'Subsequent bank states released claims or posted a payment in T15';
 END IF;
 BEGIN
   UPDATE erp_private.t15_review_events SET reason='Attempted history rewrite' WHERE review_id=review;
   RAISE EXCEPTION 'Approval history could be rewritten';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
END $$;
SELECT 'PASS: exact submitted and approved version, live source revalidation, scoped independent actors, retries, exclusive claims, unknown hold, verified replacement, partial and reversal retention.';
ROLLBACK;
\endif
