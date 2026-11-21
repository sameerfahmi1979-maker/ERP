
-- Transaction-wrapped T07 fixture precedes this suite. All payroll pins and receipts are synthetic.
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
SELECT code,code,upper(split_part(code,'.',1)),'test','held'
FROM unnest(ARRAY['dms.documents.view.hr','dms.documents.view.finance','hr.payroll.view']) code
ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t13_hr','Synthetic recovery HR',false),('t13_accounts','Synthetic recovery Accounts',false),
 ('t13_policy','Synthetic recovery policy',false),('t13_nopay','Synthetic recovery without payroll',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t13_hr',ARRAY['hr.recovery.review','dms.documents.view','dms.documents.preview','dms.documents.view.hr']),
 ('t13_accounts',ARRAY['hr.recovery.accounts','hr.payroll.view','dms.documents.view','dms.documents.preview','dms.documents.view.finance']),
 ('t13_policy',ARRAY['hr.recovery.policy']),('t13_nopay',ARRAY['hr.recovery.accounts'])
) g(role,codes) JOIN public.roles r ON r.role_code=g.role JOIN public.permissions p ON p.permission_code=ANY(g.codes);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.role_code='t06_workshop' AND p.permission_code='workshop.recoveries.intake';
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,a.company,a.branch,true FROM (VALUES
 (2,'t13_policy',920001,920011),(7,'t13_policy',920001,920011),
 (4,'t13_hr',920001,920011),(4,'t13_accounts',920001,920011),(5,'t13_hr',920001,920011),
 (3,'t13_accounts',920001,920011),(6,'t13_accounts',920001,920012),(9,'t13_accounts',920002,920021),
 (7,'t13_nopay',920001,920011)
) a(actor,role,company,branch) JOIN public.user_profiles u
 ON u.auth_user_id=('98000000-0000-4000-8000-'||lpad(a.actor::text,12,'0'))::uuid
JOIN public.roles r ON r.role_code=a.role;

INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
 confidentiality_level,status,current_version_id)
 OVERRIDING SYSTEM VALUE
 SELECT d.id,'T13-RECOVERY-'||d.id,d.title,t.id,t.category_id,920001,d.branch,d.confidentiality,'active',NULL
 FROM (VALUES
 (997401,'T13_RECOVERY_EMPLOYEE_NOTICE','T13 private notice',920011,'hr'),
 (997402,'T13_RECOVERY_EMPLOYEE_RESPONSE','T13 private response',920011,'hr'),
 (997403,'T13_RECOVERY_FINANCIAL_PROOF','T13 private cost',920011,'finance'),
 (997404,'T13_RECOVERY_CASH_RECEIPT','T13 private cash',920011,'finance'),
 (997405,'T13_RECOVERY_FINANCIAL_CORRECTION','T13 private correction',920011,'finance'),
 (997406,'T13_RECOVERY_FINANCIAL_PROOF','T13 sibling cost',920012,'finance'),
 (997407,'T13_RECOVERY_EMPLOYEE_RESPONSE','T13 second private response',920011,'hr'),
 (997408,'DRIVING_LICENSE','T13 unrelated ordinary DMS document',920011,'internal'),
 (997409,'T13_RECOVERY_EMPLOYEE_NOTICE','T13 separately verified cash case notice',920011,'hr'),
 (997410,'T13_RECOVERY_EMPLOYEE_RESPONSE','T13 separately verified cash case response',920011,'hr'),
 (997415,'T13_RECOVERY_EMPLOYEE_NOTICE','T13 independently reviewed later notice',920011,'hr'),
 (997416,'T13_RECOVERY_EMPLOYEE_RESPONSE','T13 independently reviewed later dispute',920011,'hr'),
 (997418,'T13_RECOVERY_EMPLOYEE_NOTICE','T13 signed damage recovery notice',920011,'hr')
 ) d(id,type,title,branch,confidentiality) JOIN public.dms_document_types t ON t.type_code=d.type;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
 SELECT id,id,1,true FROM public.dms_documents WHERE id BETWEEN 997401 AND 997418;
UPDATE public.dms_documents SET current_version_id=id WHERE id BETWEEN 997401 AND 997418;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,
 file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE
 SELECT id,id,id,'original','dms-documents','test/t13-hr-'||id||'.pdf','original.pdf','application/pdf',100,repeat('a',64),'verified'
 FROM public.dms_documents WHERE id BETWEEN 997401 AND 997418;

INSERT INTO erp_private.t13_cases(id,source_kind,company_id,branch_id,asset_id,occurred_at,source_amount,currency,
 source_status,subject_status,employee_id,employment_id,employer_company_id,employer_branch_id,
 authority_key,reference_key,reported_by) OVERRIDING SYSTEM VALUE
SELECT d.id,'fine',920001,920011,980101,d.occurrence::timestamptz,d.amount,'AED','reported','verified',
 p.employee_id,p.id,p.company_id,p.branch_id,'synthetic-authority',d.id::text,u.id
FROM (VALUES(997411,300,'2026-11-18 10:15+04'),(997412,100,'2026-11-18 10:15+04'),
   (997413,200,'2026-11-18 10:15+04'),(997417,120,'2026-11-19 10:15+04')) d(id,amount,occurrence)
CROSS JOIN erp_private.t03_employment_periods p CROSS JOIN public.user_profiles u
WHERE p.employee_id=980001 AND u.auth_user_id='98000000-0000-4000-8000-000000000001';

WITH hold AS (
 INSERT INTO erp_private.fleet_asset_holds(asset_id,kind,placed_at,placed_by,reason)
 SELECT id,'workshop','2026-11-18 10:25+04',created_by,'Synthetic recovery assessment' FROM erp_private.fleet_assets WHERE id=980101
 RETURNING *
)
INSERT INTO erp_private.t10_assessments(id,asset_id,company_id,branch_id,source_kind,source_ref,document_id,version_id,file_id,
 occurred_at,reported_by,finding,first_hold_id,outcome,assessed_by,assessed_at,diagnosis) OVERRIDING SYSTEM VALUE
SELECT 997420,asset_id,920001,920011,'incident','T13-EXACT-DAMAGE',980101,980101,980101,'2026-11-18 10:15+04',
 placed_by,'Synthetic signed report',id,'repair',placed_by,'2026-11-18 10:25+04','Synthetic assessed damage' FROM hold;
INSERT INTO erp_private.t10_hr_referrals(assessment_id,employee_id,employment_id,company_id,branch_id,referred_by,reason)
SELECT a.id,p.employee_id,p.id,p.company_id,p.branch_id,a.assessed_by,'Synthetic verified referral'
FROM erp_private.t10_assessments a CROSS JOIN erp_private.t03_employment_periods p WHERE a.id=997420 AND p.employee_id=980002;
INSERT INTO erp_private.t10_job_cycles(id,assessment_id,cycle,hold_id,state,opened_by,scope_of_work,estimate_aed,actual_cost_aed,closed_at)
 OVERRIDING SYSTEM VALUE
SELECT 997420,id,1,first_hold_id,'closed',assessed_by,'Synthetic scoped repair',260,200,'2026-11-18 18:00+04'
FROM erp_private.t10_assessments WHERE id=997420;

CREATE FUNCTION pg_temp.t13_recovery_proof(p_id bigint) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('document',p_id,'version',p_id,'file',p_id)
$$;
CREATE FUNCTION pg_temp.t13_recovery_send(p_case bigint,p_action text,p_data jsonb,p_accounts boolean,
 p_operation uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t13_recovery_command(p_operation,p_case,p_action,p_data||jsonb_build_object(
   'reason','Synthetic exact recovery verification','basis',
   public.t13_recovery_workspace(920011,'2026-11-01',p_case)->'case'->>
     CASE WHEN p_accounts THEN 'accounts_basis' ELSE 'hr_basis' END))
$$;

DO $$
DECLARE
 main_case bigint:=997411; employer_case bigint:=997412; cash_case bigint:=997413; correct_case bigint:=997417;
 month_one date:='2026-11-01'; month_two date:='2026-12-01'; month_three date:='2027-01-01';
 policy_data jsonb:='{"kind":"fine","from":"2026-01-01","until":"2026-11-19","currency":"AED",
 "legal_basis":"Synthetic reviewed policy for native verification","case_limit":500,"period_limit":200,
 "wage_basis":"fixed-amount","priority":2,"allow_deduct_correct":false,"reason":"Synthetic reason"}';
 review_data jsonb; approval_data jsonb; first jsonb; result jsonb; panel jsonb; basis jsonb; totals jsonb;
 approval_nonce uuid:=gen_random_uuid(); policy bigint; dispute bigint; id_schedule bigint; correction bigint; allocation bigint;
 id_cash bigint; nonce uuid:=gen_random_uuid(); run uuid:=gen_random_uuid(); line uuid:=gen_random_uuid();
 approval uuid:=gen_random_uuid(); bank_proof uuid:=gen_random_uuid(); pin bigint; receipt bigint; gm bigint;
 damage_case bigint;
BEGIN
 SELECT id INTO STRICT gm FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000002';
 IF has_function_privilege('authenticated','erp_private.t13_payroll_proposal(bigint,date,text)','EXECUTE')
    OR has_table_privilege('authenticated','erp_private.t13_hr_reviews','SELECT')
    OR has_function_privilege('anon','public.t13_recovery_workspace(bigint,date,bigint,bigint)','EXECUTE') THEN
   RAISE EXCEPTION 'Restricted recovery contract is exposed';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
   PERFORM public.t13_recovery_command(gen_random_uuid(),920011,'prepare-policy',policy_data||'{"wage_basis":"gross-wage"}');
   RAISE EXCEPTION 'A wage-based policy could omit its wage factor'; EXCEPTION WHEN check_violation THEN NULL;
 END;
 policy:=(public.t13_recovery_command(gen_random_uuid(),920011,'prepare-policy',policy_data)->>'id')::bigint;
 approval_data:=jsonb_build_object('policy',policy,'reason','Synthetic independent rule review');
 BEGIN
   PERFORM public.t13_recovery_command(gen_random_uuid(),920011,'approve-policy',approval_data);
   RAISE EXCEPTION 'Prepared policy could self-approve'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(7);
 first:=public.t13_recovery_command(approval_nonce,920011,'approve-policy',approval_data);
 IF public.t13_recovery_command(approval_nonce,920011,'approve-policy',approval_data) IS DISTINCT FROM first||'{"replayed":true}'::jsonb THEN
   RAISE EXCEPTION 'Policy approval replay did not recover original receipt';
 END IF;
 PERFORM pg_temp.t06_actor(2);
 policy:=(public.t13_recovery_command(gen_random_uuid(),920011,'prepare-policy',policy_data)->>'id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM public.t13_recovery_command(gen_random_uuid(),920011,'approve-policy',approval_data||jsonb_build_object('policy',policy));
   RAISE EXCEPTION 'Overlapping effective policy approved'; EXCEPTION WHEN exclusion_violation THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(2);
 policy:=(public.t13_recovery_command(gen_random_uuid(),920011,'prepare-policy',policy_data||
   '{"from":"2026-11-19","until":"2027-01-01","allow_deduct_correct":true}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM public.t13_recovery_command(gen_random_uuid(),920011,'approve-policy',approval_data||jsonb_build_object('policy',policy));
 BEGIN
   PERFORM pg_temp.t13_recovery_send(main_case,'reconcile','{"actual_cost":300}',true);
   RAISE EXCEPTION 'Accounts without payroll scope admitted'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM pg_temp.t06_actor(5);
 review_data:=jsonb_build_object('decision','employee','ceiling',300,'notified_on','2026-11-18','response','disputed',
    'response_note','CONFIDENTIAL EMPLOYEE RESPONSE','route','defer','disputed_amount',80,
    'notice',pg_temp.t13_recovery_proof(997401),'response_evidence',pg_temp.t13_recovery_proof(997402),
    'reason','Synthetic reasons','basis',public.t13_recovery_workspace(920011,month_one,main_case)->'case'->>'hr_basis');
 BEGIN
    PERFORM public.t13_recovery_command(gen_random_uuid(),main_case,'review',review_data||'{"route":"deduct-correct"}');
    RAISE EXCEPTION 'Deduct and correct bypassed dated policy'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 first:=public.t13_recovery_command(nonce,main_case,'review',review_data);
 IF public.t13_recovery_command(nonce,main_case,'review',review_data) IS DISTINCT FROM first||'{"replayed":true}'::jsonb THEN
   RAISE EXCEPTION 'Reviewed notice was duplicated on retry';
 END IF;
 BEGIN
   PERFORM public.t13_recovery_command(nonce,main_case,'review',review_data||'{"ceiling":299}');
   RAISE EXCEPTION 'Changed recovery nonce was accepted'; EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
 END;
 BEGIN
   PERFORM public.t13_recovery_command(gen_random_uuid(),main_case,'review',review_data);
   RAISE EXCEPTION 'Stale review basis was silently accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 panel:=public.t13_recovery_workspace(920011,month_one,main_case)->'case';
 dispute:=(panel->'disputes'->0->>'id')::bigint;
 IF panel ? 'totals' OR panel::text LIKE '%T13 private cost%' OR panel::text NOT LIKE '%CONFIDENTIAL EMPLOYEE RESPONSE%' THEN
    RAISE EXCEPTION 'HR and finance evidence separation is wrong: %',panel;
 END IF;
 BEGIN
    PERFORM pg_temp.t13_recovery_send(main_case,'resolve-dispute',jsonb_build_object('dispute',dispute,'upheld',40,
       'evidence',pg_temp.t13_recovery_proof(997407)),false);
    RAISE EXCEPTION 'HR self-approved the dispute'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM pg_temp.t06_actor(3);
 panel:=public.t13_recovery_workspace(920011,month_one,main_case)->'case';
 IF panel::text LIKE '%CONFIDENTIAL EMPLOYEE RESPONSE%' OR panel::text LIKE '%T13 private response%'
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(panel->'evidence') WHERE value->>'file'='997403') THEN
   RAISE EXCEPTION 'Accounts projection leaked HR evidence or hid its own: %',panel;
 END IF;
 BEGIN
   PERFORM pg_temp.t13_recovery_send(main_case,'reconcile',jsonb_build_object('actual_cost',300,'evidence',pg_temp.t13_recovery_proof(997406)),true);
   RAISE EXCEPTION 'Sibling financial proof was accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t13_recovery_send(main_case,'reconcile',jsonb_build_object('actual_cost',300,'evidence',pg_temp.t13_recovery_proof(997403)),true);
 PERFORM pg_temp.t13_recovery_send(main_case,'record-money',jsonb_build_object('kind','authority-paid','amount',100,
   'reference','AUTH-PAYMENT-01','date','2026-11-19','evidence',pg_temp.t13_recovery_proof(997403)),true);
 id_schedule:=(pg_temp.t13_recovery_send(main_case,'propose-schedule','{"mode":"instalments","instalments":[
   {"month":"2026-11-01","amount":100},{"month":"2026-12-01","amount":200}]}',true)->>'id')::bigint;
 panel:=public.t13_recovery_workspace(920011,month_one,main_case)->'case';
 IF (panel->'totals'->>'authority_payable')::numeric<>200 OR (panel->'totals'->>'principal')::numeric<>300
    OR (panel->'totals'->>'disputed')::numeric<>80 OR (panel->'deduction'->>'amount')::numeric<>100
    OR (panel->'totals'->>'collected')::numeric<>0 THEN
   RAISE EXCEPTION 'Authority, liability, disputed portion or proposal were conflated: %',panel;
 END IF;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t13_recovery_workspace(920012,month_one,main_case);
   RAISE EXCEPTION 'Sibling scope could inspect a case'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(9);
 BEGIN
   PERFORM public.t13_recovery_workspace(920021,month_one,main_case);
   RAISE EXCEPTION 'Separate company could inspect a case'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(8);
 IF public.t13_recovery_scopes()<>'[]'::jsonb THEN RAISE EXCEPTION 'Global administrator inherited a held role'; END IF;
 RESET ROLE;
 basis:=erp_private.t13_payroll_proposal(main_case,month_one,'deduction');
 pin:=erp_private.t13_payroll_pin(main_case,'deduction',id_schedule,month_one,run,line,approval,gm,100,100,basis->>'digest');
 receipt:=erp_private.t13_payroll_receipt(gen_random_uuid(),pin,month_one,run,line,approval,id_schedule,60,'AED','T13-HR-PAID-001',bank_proof,true);
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 panel:=public.t13_recovery_workspace(920011,month_two,main_case)->'case';
 IF (panel->'totals'->>'unallocated_deduction')::numeric<>60 OR (panel->'totals'->>'collected')::numeric<>0
    OR panel->'deduction'->>'status'<>'held' THEN RAISE EXCEPTION 'A payment was counted without exact line allocation'; END IF;
 nonce:=gen_random_uuid();
 first:=public.t13_recovery_allocate(nonce,receipt,pin,id_schedule,month_one,line,60,'Synthetic signed line allocation');
 allocation:=(first->>'id')::bigint;
 IF public.t13_recovery_allocate(nonce,receipt,pin,id_schedule,month_one,line,60,'Synthetic signed line allocation')
      IS DISTINCT FROM first||'{"replayed":true}'::jsonb THEN RAISE EXCEPTION 'Collection allocation was duplicated'; END IF;
 panel:=public.t13_recovery_workspace(920011,month_one,main_case)->'case';
 IF (panel->'totals'->>'outstanding')::numeric<>240 OR (panel->'totals'->>'collected')::numeric<>60
    OR (panel->'deduction'->>'open_due')::numeric<>40 OR panel->'deduction'->>'status'<>'held' THEN
    RAISE EXCEPTION 'Partial collection or pending instalment is wrong: %',panel;
 END IF;
 panel:=public.t13_recovery_workspace(920011,month_two,main_case)->'case';
 IF (panel->'deduction'->>'amount')::numeric<>160 THEN RAISE EXCEPTION 'Deferred amount or earlier shortfall was lost: %',panel; END IF;

 -- An independent HR response updates a deduction proposal and invalidates the previously disclosed basis.
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t13_recovery_send(main_case,'resolve-dispute',jsonb_build_object('dispute',dispute,'upheld',40,
    'evidence',pg_temp.t13_recovery_proof(997407)),false);
 BEGIN
   PERFORM pg_temp.t13_recovery_send(main_case,'reconcile',jsonb_build_object('actual_cost',300,'evidence',pg_temp.t13_recovery_proof(997403)),true);
   RAISE EXCEPTION 'HR dispute approver acted as Accounts on that case'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(3);
 panel:=public.t13_recovery_workspace(920011,month_two,main_case)->'case';
 IF (panel->'totals'->>'principal')::numeric<>260 OR (panel->'deduction'->>'amount')::numeric<>200 THEN
   RAISE EXCEPTION 'Independent partial dispute adjustment was not reflected';
 END IF;
 basis:=panel->'accounts_basis';
 RESET ROLE;
 UPDATE erp_private.t13_cases SET source_revision=2,source_status='revised' WHERE id=main_case;
 UPDATE public.dms_documents SET title='Ordinary DMS update works' WHERE id=997408;
 BEGIN
   UPDATE public.dms_document_files SET sha256_hash=repeat('b',64) WHERE id=997401;
   RAISE EXCEPTION 'Retained private original could change hash'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t13_recovery_command(gen_random_uuid(),main_case,'reconcile',jsonb_build_object('basis',basis,
     'reason','Stale old revision','actual_cost',300,'evidence',pg_temp.t13_recovery_proof(997403)));
   RAISE EXCEPTION 'Changed official source revision was silently adopted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 RESET ROLE;
 UPDATE erp_private.t13_cases SET source_revision=3,source_amount=0,source_status='cancelled' WHERE id=main_case;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 PERFORM pg_temp.t13_recovery_send(main_case,'reconcile',jsonb_build_object('actual_cost',0,'evidence',pg_temp.t13_recovery_proof(997403)),true);
 panel:=public.t13_recovery_workspace(920011,month_two,main_case)->'case';
 IF (panel->'totals'->>'refund_due')::numeric<>60 OR (panel->'totals'->>'authority_payable')::numeric<>0
    OR panel->'deduction'->>'status'<>'held' THEN RAISE EXCEPTION 'Cancellation did not preserve and isolate prior collection'; END IF;
 correction:=(pg_temp.t13_recovery_send(main_case,'propose-refund',jsonb_build_object('allocation',allocation,
    'month',month_two,'amount',60),true)->>'id')::bigint;
 RESET ROLE;
 basis:=erp_private.t13_payroll_proposal(main_case,month_two,'refund');
 IF basis->>'status'<>'ready' OR (basis->>'source_id')::bigint<>correction THEN RAISE EXCEPTION 'Linked refund unavailable'; END IF;
 line:=gen_random_uuid(); approval:=gen_random_uuid(); run:=gen_random_uuid();
 pin:=erp_private.t13_payroll_pin(main_case,'refund',correction,month_two,run,line,approval,gm,60,60,basis->>'digest');
 receipt:=erp_private.t13_payroll_receipt(gen_random_uuid(),pin,month_two,run,line,approval,id_schedule,30,'AED','T13-HR-REFUND-001',bank_proof,true);
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 PERFORM public.t13_recovery_allocate(gen_random_uuid(),receipt,pin,id_schedule,month_two,line,30,'Synthetic partial approved refund');
 PERFORM pg_temp.t13_recovery_send(main_case,'reconcile',jsonb_build_object('actual_cost',0,'evidence',pg_temp.t13_recovery_proof(997403)),true);
 panel:=public.t13_recovery_workspace(920011,month_three,main_case)->'case';
 IF (panel->'refund'->>'amount')::numeric<>30 THEN RAISE EXCEPTION 'Partial refund did not carry after rechecked finance'; END IF;
 PERFORM pg_temp.t13_recovery_send(main_case,'withdraw-refund',jsonb_build_object('refund',correction),true);
 BEGIN
    PERFORM pg_temp.t13_recovery_send(main_case,'propose-refund',jsonb_build_object('allocation',allocation,'month',month_three,'amount',31),true);
    RAISE EXCEPTION 'Withdrawing unpaid refund released already refunded cash'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 PERFORM pg_temp.t13_recovery_send(main_case,'propose-refund',jsonb_build_object('allocation',allocation,'month',month_three,'amount',30),true);

 -- A non-employee outcome retains authority actual cost while the employee principal remains zero.
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t13_recovery_send(employer_case,'review','{"decision":"employer","ceiling":0}',false);
 PERFORM pg_temp.t06_actor(3);
 PERFORM pg_temp.t13_recovery_send(employer_case,'reconcile',jsonb_build_object('actual_cost',100,'evidence',pg_temp.t13_recovery_proof(997403)),true);
 panel:=public.t13_recovery_workspace(920011,month_one,employer_case)->'case';
 IF (panel->'totals'->>'reconciled_cost')::numeric<>100 OR (panel->'totals'->>'principal')::numeric<>0 THEN
    RAISE EXCEPTION 'Nonemployee cost was charged to the employee or omitted';
 END IF;

 -- Manual cash is a separate receipt. Fully deferred amounts cannot be applied yet.
 PERFORM pg_temp.t06_actor(5);
 BEGIN
   PERFORM pg_temp.t13_recovery_send(cash_case,'review',review_data||'{"ceiling":200,"disputed_amount":200}',false);
   RAISE EXCEPTION 'A retained employee notice was attached to a different case'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM pg_temp.t13_recovery_send(cash_case,'review',review_data||jsonb_build_object('ceiling',200,'disputed_amount',200,
   'notice',pg_temp.t13_recovery_proof(997409),'response_evidence',pg_temp.t13_recovery_proof(997410)),false);
 PERFORM pg_temp.t06_actor(3);
 PERFORM pg_temp.t13_recovery_send(cash_case,'reconcile',jsonb_build_object('actual_cost',200,'evidence',pg_temp.t13_recovery_proof(997403)),true);
 id_cash:=(pg_temp.t13_recovery_send(cash_case,'record-money',jsonb_build_object('kind','employee-cash','amount',20,
     'reference','EMP-CASH-01','date','2026-11-19','evidence',pg_temp.t13_recovery_proof(997404)),true)->>'id')::bigint;
 BEGIN
   PERFORM pg_temp.t13_recovery_send(cash_case,'record-money',jsonb_build_object('kind','employee-cash-allocated','cash',id_cash,
     'amount',20,'reference','EMP-ALLOC-01','date','2026-11-19','evidence',pg_temp.t13_recovery_proof(997404)),true);
   RAISE EXCEPTION 'Fully contested case automatically consumed manual cash'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 panel:=public.t13_recovery_workspace(920011,month_one,cash_case)->'case';
 IF (panel->'totals'->>'employee_cash_received')::numeric<>20 OR (panel->'totals'->>'employee_cash_allocated')::numeric<>0 THEN
   RAISE EXCEPTION 'Cash receipt and allocation were conflated';
 END IF;
 BEGIN
   PERFORM pg_temp.t13_recovery_send(employer_case,'record-money',jsonb_build_object('kind','employee-cash','amount',20,
     'reference','emp-cash-01','date','2026-11-19','evidence',pg_temp.t13_recovery_proof(997404)),true);
   RAISE EXCEPTION 'The same employee payment reference posted to another case'; EXCEPTION WHEN unique_violation THEN NULL;
 END;
 dispute:=(panel->'disputes'->0->>'id')::bigint;
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t13_recovery_send(cash_case,'resolve-dispute',jsonb_build_object('dispute',dispute,'upheld',200,
   'evidence',pg_temp.t13_recovery_proof(997410)),false);
 PERFORM pg_temp.t06_actor(3);
 allocation:=(pg_temp.t13_recovery_send(cash_case,'record-money',jsonb_build_object('kind','employee-cash-allocated','cash',id_cash,
   'amount',20,'reference','EMP-ALLOC-01','date','2026-11-19','evidence',pg_temp.t13_recovery_proof(997404)),true)->>'id')::bigint;
 PERFORM pg_temp.t13_recovery_send(cash_case,'reverse-money',jsonb_build_object('event',allocation,'amount',5,
   'reference','EMP-ALLOC-REVERSE','date','2026-11-19','evidence',pg_temp.t13_recovery_proof(997405)),true);
 panel:=public.t13_recovery_workspace(920011,month_one,cash_case)->'case';
 IF (panel->'totals'->>'employee_cash_allocated')::numeric<>15 OR (panel->'totals'->>'outstanding')::numeric<>185
   OR NOT (panel->'totals'->>'unallocated')::boolean THEN
   RAISE EXCEPTION 'Cash allocation reversal failed to restore outstanding and unallocated balances';
 END IF;
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t13_recovery_send(correct_case,'review',review_data||jsonb_build_object('ceiling',120,'disputed_amount',80,
   'notified_on','2026-11-19','route','deduct-correct','notice',pg_temp.t13_recovery_proof(997415),
   'response_evidence',pg_temp.t13_recovery_proof(997416)),false);
 PERFORM pg_temp.t06_actor(3);
 PERFORM pg_temp.t13_recovery_send(correct_case,'reconcile',jsonb_build_object('actual_cost',120,'evidence',pg_temp.t13_recovery_proof(997403)),true);
 PERFORM pg_temp.t13_recovery_send(correct_case,'propose-schedule','{"mode":"one-time","instalments":[{"month":"2026-11-01","amount":120}]}',true);
 panel:=public.t13_recovery_workspace(920011,month_one,correct_case)->'case';
 IF (panel->'deduction'->>'amount')::numeric<>120 OR (panel->'totals'->>'collected')::numeric<>0
   OR panel->'disputes'->0->>'route'<>'deduct-correct' THEN
    RAISE EXCEPTION 'The independently approved deduct-and-correct policy failed or applied a collection';
 END IF;

 PERFORM pg_temp.t06_actor(2);
 policy:=(public.t13_recovery_command(gen_random_uuid(),920011,'prepare-policy',policy_data||'{"kind":"damage"}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM public.t13_recovery_command(gen_random_uuid(),920011,'approve-policy',approval_data||jsonb_build_object('policy',policy));
 PERFORM pg_temp.t06_actor(4);
 damage_case:=(public.t13_fleet_command(gen_random_uuid(),920011,'open-damage','{"assessment":997420}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(5);
 review_data:=jsonb_build_object('decision','employee','ceiling',200,'notified_on','2026-11-18','response','no-response',
   'response_note','Documented synthetic follow-up','notice',pg_temp.t13_recovery_proof(997418));
 PERFORM pg_temp.t13_recovery_send(damage_case,'review',review_data,false);
 PERFORM pg_temp.t06_actor(3);
 PERFORM pg_temp.t13_recovery_send(damage_case,'reconcile',jsonb_build_object('actual_cost',200,'evidence',pg_temp.t13_recovery_proof(997403)),true);
 PERFORM pg_temp.t13_recovery_send(damage_case,'record-money',jsonb_build_object('kind','insurer-offset',
    'amount',50,'reference','T13-DAMAGE-CREDIT','date','2026-11-19','evidence',pg_temp.t13_recovery_proof(997403)),true);
 PERFORM pg_temp.t13_recovery_send(damage_case,'propose-schedule','{"mode":"one-time","instalments":[{"month":"2026-11-01","amount":150}]}',true);
 panel:=public.t13_recovery_workspace(920011,month_one,damage_case)->'case';
 IF panel->>'source_kind'<>'damage' OR (panel->>'source_amount')::numeric<>200 OR (panel->'deduction'->>'amount')::numeric<>150
    OR (panel->'totals'->>'authority_payable')::numeric<>0 THEN RAISE EXCEPTION 'Damage amount, estimate and insurance credit were conflated: %',panel; END IF;
 RESET ROLE;
 UPDATE erp_private.t10_job_cycles SET revision=revision+1,actual_cost_aed=180 WHERE id=997420;
 IF erp_private.t13_payroll_proposal(damage_case,month_one,'deduction')->>'status'<>'held' THEN
   RAISE EXCEPTION 'Changed Workshop cost was still payable without a source refresh';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(5);
 BEGIN
   PERFORM pg_temp.t13_recovery_send(damage_case,'review',review_data||'{"ceiling":180}',false);
   RAISE EXCEPTION 'Stale Workshop snapshot allowed another review'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(4);
 PERFORM public.t13_fleet_command(gen_random_uuid(),damage_case,'refresh-damage','{"revision":1}');
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t13_recovery_send(damage_case,'review',review_data||'{"ceiling":180}',false);
 PERFORM pg_temp.t06_actor(3);
 PERFORM pg_temp.t13_recovery_send(damage_case,'reconcile',jsonb_build_object('actual_cost',180,'evidence',pg_temp.t13_recovery_proof(997403)),true);
 PERFORM pg_temp.t13_recovery_send(damage_case,'propose-schedule','{"mode":"one-time","instalments":[{"month":"2026-11-01","amount":130}]}',true);
 panel:=public.t13_recovery_workspace(920011,month_one,damage_case)->'case';
 IF (panel->'deduction'->>'amount')::numeric<>130 OR jsonb_array_length(panel->'schedules')<>2 THEN
   RAISE EXCEPTION 'Fresh repair cost or original schedule was lost';
 END IF;
 RESET ROLE;
END $$;
SELECT 'PASS: T13 protected policy and proof, disputes, replay, AED 60 partial collection, AED 40 shortfall, cancellation, partial refund, damage credits and stale Workshop cost.';
ROLLBACK;
