DO $verify$
BEGIN
 IF current_database() NOT IN('t18_native_work','t18_exact_replay','t00_clean') OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
  RAISE EXCEPTION 'Marked isolated T18 database required';
 END IF;
 IF to_regprocedure('public.t18_exit_command(uuid,bigint,bigint,bigint,text,jsonb)') IS NULL THEN
   RAISE EXCEPTION 'The T18 exact exit settlement workflow is unavailable';
 END IF;
END $verify$;

-- Run inside the synthetic T08/T14 baseline with calculation policy and verified exit originals.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.employee_eos_cases SET employment_end_date='2026-11-05' WHERE id=997180;

INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t18_integrated_hr','Synthetic exit HR',false),('t18_integrated_payment','Synthetic exit payments',false),
 ('t18_integrated_combined','Synthetic incompatible permissions',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t18_integrated_hr',ARRAY['hr.exit.settlement.view','hr.exit.settlement.hr','hr.payroll.view','hr.eos.view','hr.eos.manage']),
 ('t18_integrated_payment',ARRAY['hr.exit.settlement.view','hr.exit.settlement.pay','hr.payroll.view','hr.eos.view',
   'dms.documents.view','dms.documents.preview','dms.documents.view.finance','hr.recovery.accounts']),
 ('t18_integrated_combined',ARRAY['hr.exit.settlement.view','hr.exit.settlement.pay','hr.payroll.view','hr.eos.view',
   'dms.documents.view','dms.documents.preview','dms.documents.view.finance','hr.recovery.accounts'])
) g(role,caps) JOIN public.roles r ON r.role_code=g.role JOIN public.permissions p ON p.permission_code=ANY(g.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(a.actor),r.id,a.company,a.branch,true
FROM (VALUES (4,'t18_integrated_hr',920001,920011),(3,'t18_integrated_payment',920001,920011),
 (7,'t18_integrated_combined',920001,920011),(6,'t18_integrated_payment',920001,920012),
 (9,'t18_integrated_hr',920002,920021)) a(actor,role,company,branch)
JOIN public.roles r ON r.role_code=a.role;

DO $workflow$
DECLARE
 eos bigint:=997180; c bigint:=920001; b bigint:=920011;
 screened jsonb; held jsonb; draft jsonb; rec jsonb; accepted jsonb; approval jsonb;
 config jsonb; payment jsonb; receipt jsonb; test_after jsonb; movement uuid; exact jsonb; had jsonb;
 op uuid:=gen_random_uuid(); close_op uuid:=gen_random_uuid(); body jsonb; initial_ready text;
 accepted_net numeric; allocations jsonb;
BEGIN
 IF has_function_privilege('anon','public.t18_exit_workspace(bigint,bigint,bigint,bigint)','EXECUTE')
   OR has_table_privilege('authenticated','erp_private.t18_versions','SELECT')
   OR has_function_privilege('service_role','public.t18_exit_scoped_change(uuid,bigint,bigint,bigint,text,text,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Final settlement or original records exposed outside scoped contract';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t18_exit_workspace(c,b,eos);
   RAISE EXCEPTION 'Sibling branch could read old exit data'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(9);
 BEGIN
   PERFORM public.t18_exit_workspace(920002,920021,eos);
   RAISE EXCEPTION 'New company could read prior employer exit'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(8);
 BEGIN
   PERFORM public.t18_exit_workspace(c,b,eos);
   RAISE EXCEPTION 'Global system actor acquired protected exit scope'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(4);
 body:='{"reason":"Synthetic activation"}';
 receipt:=public.t18_exit_command(op,c,b,eos,'activate',body);
 IF receipt->>'state' IS DISTINCT FROM 'activated' OR public.t18_exit_command(op,c,b,eos,'activate',body)
    IS DISTINCT FROM receipt||'{"replayed":true}' THEN RAISE EXCEPTION 'Exact activation retry mismatch'; END IF;

 PERFORM pg_temp.t06_actor(2);
 held:=public.t18_exit_command(gen_random_uuid(),c,b,eos,'calculate','{"reason":"Unresolved case draft"}');
 screened:=public.t18_exit_workspace(c,b,eos);
 IF screened#>>'{selected,draft,version}' IS DISTINCT FROM held->>'version'
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(screened#>'{selected,draft,issues}') i WHERE i->>'code'='exit-recovery-review') THEN
   RAISE EXCEPTION 'Unresolved recovery was absent from the held calculation: %',screened#>'{selected,draft,issues}';
 END IF;
 PERFORM pg_temp.t06_actor(4);
 exact:=(held-ARRAY['id','state','replayed'])||'{"reason":"Unresolved evidence review"}';
 BEGIN
   PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'review',exact);
   RAISE EXCEPTION 'Unresolved recovery passed HR review'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 SELECT r INTO STRICT rec FROM jsonb_array_elements(screened#>'{selected,cases}') r WHERE r->>'id'='995144';
 body:=jsonb_build_object('case',rec->'id','fingerprint',rec->'fingerprint','disposition','separate',
   'reason','Synthetic continuing case review independently of final pay');
 receipt:=public.t18_exit_command(gen_random_uuid(),c,b,eos,'recommend-case',body);
 PERFORM pg_temp.t06_actor(2);
 accepted:=public.t18_exit_command(gen_random_uuid(),c,b,eos,'accept-case',(body-'disposition')||(receipt-ARRAY['id','state','replayed']));
 IF accepted->>'state' IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Explicit separate review was not accepted'; END IF;

 draft:=public.t18_exit_command(gen_random_uuid(),c,b,eos,'calculate','{"reason":"Recalculate after verified separate disposition"}');
 exact:=(draft-ARRAY['id','state','replayed'])||'{"reason":"Reviewed sealed exit version"}';
 screened:=public.t18_exit_workspace(c,b,eos);
 IF (screened#>>'{selected,draft,net}')::numeric<=0 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(screened#>'{selected,draft,issues}') i WHERE (i->>'blocking')::boolean)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(screened#>'{selected,draft,lines}') l WHERE l->>'category'='leave-cashout')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(screened#>'{selected,draft,lines}') l WHERE l->>'category'='recovery')
 THEN RAISE EXCEPTION 'Exact held-to-ready calculation differed: %',screened#>'{selected,draft,issues}'; END IF;
 accepted_net:=(screened#>>'{selected,draft,net}')::numeric;
 PERFORM pg_temp.t06_actor(4);
 PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'review',exact);
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'submit',exact);
 BEGIN
   PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'approve',exact);
   RAISE EXCEPTION 'A preparer also approved final pay'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'approve',exact||jsonb_build_object('digest',repeat('0',64)));
   RAISE EXCEPTION 'A different digest was approved'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 UPDATE public.employee_eos_cases SET notes='Synthetic later exit case revision' WHERE id=eos;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'approve',exact);
   RAISE EXCEPTION 'A stale exit case version was approved'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'withdraw',exact);
 draft:=public.t18_exit_command(gen_random_uuid(),c,b,eos,'calculate','{"reason":"Recalculate after source change"}');
 exact:=(draft-ARRAY['id','state','replayed'])||'{"reason":"Revised exact version"}';
 PERFORM pg_temp.t06_actor(4);
 PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'review',exact);
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'submit',exact);
 PERFORM pg_temp.t06_actor(7);
 approval:=public.t18_exit_command(gen_random_uuid(),c,b,eos,'approve',exact);
 IF approval->>'state' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Current exact approval failed'; END IF;
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'request-revoke',exact);
 PERFORM pg_temp.t06_actor(7);
 receipt:=public.t18_exit_command(gen_random_uuid(),c,b,eos,'revoke',exact);
 IF receipt->>'state' IS DISTINCT FROM 'revoked' THEN RAISE EXCEPTION 'Unused approval revocation failed'; END IF;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t18_exit_scoped_change(gen_random_uuid(),c,b,eos,'payment','start',
      jsonb_build_object('settlement_version',draft->'version','digest',draft->'digest','channel','exit-cheque'));
   RAISE EXCEPTION 'Revoked approval could start payment'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(2);
 draft:=public.t18_exit_command(gen_random_uuid(),c,b,eos,'calculate','{"reason":"Fresh review after revocation"}');
 exact:=(draft-ARRAY['id','state','replayed'])||'{"reason":"New current version"}';
 PERFORM pg_temp.t06_actor(4);
 PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'review',exact);
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t18_exit_command(gen_random_uuid(),c,b,eos,'submit',exact);
 PERFORM pg_temp.t06_actor(7);
 approval:=public.t18_exit_command(gen_random_uuid(),c,b,eos,'approve',exact);
 body:=jsonb_build_object('settlement_version',draft->'version','digest',draft->'digest');
 BEGIN
   PERFORM public.t18_exit_scoped_change(gen_random_uuid(),c,b,eos,'payment','start',body||'{"channel":"exit-cheque"}');
   RAISE EXCEPTION 'Approver could release the same settlement'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t18_exit_scoped_change(gen_random_uuid(),c,920012,eos,'payment','start',body||'{"channel":"exit-cheque"}');
   RAISE EXCEPTION 'Wrong selected scope accepted for payment'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 receipt:=public.t18_exit_scoped_change(gen_random_uuid(),c,b,eos,'payment','start',body||'{"channel":"exit-cheque"}');
 IF receipt->>'state' IS DISTINCT FROM 'handoff-pending' THEN RAISE EXCEPTION 'Exact handoff failed: %',receipt; END IF;
 op:=gen_random_uuid();
 config:=body||jsonb_build_object('reference','SYN-T18-INTEGRATED-7821','outcome','paid','amount',accepted_net,
       'currency','AED','paid_on','2026-11-07')||pg_temp.t16_proof(998611);
 receipt:=public.t18_exit_scoped_change(op,c,b,eos,'payment','receipt',config);
 movement:=(receipt->>'payment')::uuid;
 payment:=public.t18_exit_scoped_change(op,c,b,eos,'payment','receipt',config);
 IF payment IS DISTINCT FROM receipt||'{"replayed":true}' OR receipt->>'state' IS DISTINCT FROM 'paid-unallocated' THEN
   RAISE EXCEPTION 'Exact outcome retry or allocation hold differed: %',receipt;
 END IF;
 BEGIN
   PERFORM public.t18_exit_scoped_change(gen_random_uuid(),c,b,eos,'payment','receipt',
      config||'{"reference":"SYN-T18-INTEGRATED-COPY"}');
   RAISE EXCEPTION 'Identical bank evidence created a second confirmation'; EXCEPTION WHEN SQLSTATE 'PT409' OR unique_violation THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(4);
 BEGIN
   PERFORM public.t18_exit_command(close_op,c,b,eos,'close-exit',exact);
   RAISE EXCEPTION 'A bank outcome closed exit before line allocation'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(3);
 screened:=public.t18_exit_workspace(c,b,eos);
 SELECT jsonb_agg(jsonb_build_object('line',l->'id','amount',l->'amount')) INTO allocations
 FROM jsonb_array_elements(screened#>'{selected,draft,lines}') l WHERE (l->>'amount')::numeric>0;
 payment:=public.t18_exit_scoped_change(gen_random_uuid(),c,b,eos,'payment','allocate',body||
   jsonb_build_object('payment',movement,'revision',0,'lines',allocations,'reason','Allocate exact verified exit lines')||pg_temp.t16_proof(998604));
 IF payment->>'state' IS DISTINCT FROM 'reconciled' THEN RAISE EXCEPTION 'Line allocation did not reconcile: %',payment; END IF;
 PERFORM pg_temp.t06_actor(4);
 receipt:=public.t18_exit_command(close_op,c,b,eos,'close-exit',exact);
 IF receipt->>'state' IS DISTINCT FROM 'closed' OR public.t18_exit_command(close_op,c,b,eos,'close-exit',exact)
     IS DISTINCT FROM receipt||'{"replayed":true}' THEN RAISE EXCEPTION 'Exact historical close or retry differed: %',receipt; END IF;
 screened:=public.t18_exit_workspace(c,b,eos);
 IF screened#>>'{selected,state}' IS DISTINCT FROM 'closed' OR screened#>>'{selected,payment,state}' IS DISTINCT FROM 'reconciled'
   OR screened::text LIKE '%SYN-T18-INTEGRATED-%' OR screened::text LIKE '%998611%'
   OR jsonb_array_length(screened#>'{selected,history}')<>4 THEN
   RAISE EXCEPTION 'Closed case history or private bank masking differed';
 END IF;
 PERFORM pg_temp.t06_actor(9);
 BEGIN
   PERFORM public.t18_exit_workspace(920002,920021,eos);
   RAISE EXCEPTION 'Reconciled exit leaked to the subsequent employer'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 IF NOT EXISTS(SELECT 1 FROM public.employee_eos_cases WHERE id=eos AND case_status='closed'
       AND clearance_completed AND final_settlement_status='completed')
    OR (SELECT count(*) FROM erp_private.t18_close_receipts WHERE eos_id=eos)<>1
    OR (SELECT count(*) FROM erp_private.t18_exit_payments p JOIN erp_private.t18_versions v ON v.id=p.version_id WHERE v.eos_id=eos)<>1
    OR NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE entity_name='employee_eos_cases' AND entity_id=eos
              AND action='verified-settlement-close' AND owner_company_id=c AND branch_id=b)
 THEN RAISE EXCEPTION 'Closure or unique payment did not persist in the correct exact audit scope'; END IF;
 RAISE NOTICE 'T18 exact integrated workflow passed. Employee 980001, net AED %, 4 retained versions, 1 payment movement and 1 close.',accepted_net;
END $workflow$;
