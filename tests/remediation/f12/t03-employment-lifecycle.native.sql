\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database()<>'t00_clean' OR current_setting('cron.launch_active_jobs')<>'off'
     OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
        IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
    RAISE EXCEPTION 'Run only in the isolated T00 database';
  END IF;
  IF to_regprocedure('public.t03_employment_as_of(bigint,date)') IS NULL THEN
    RAISE EXCEPTION 'The authorized dated employment resolver is missing';
  END IF;
END;
$$;
INSERT INTO auth.users(id,email,aud,role,email_confirmed_at)
SELECT ('95000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'t03-'||i||'@example.test','authenticated','authenticated',now()
FROM generate_series(1,6) i;
INSERT INTO auth.sessions(id,user_id,created_at,not_after)
SELECT ('95000000-0000-4000-8001-'||lpad(i::text,12,'0'))::uuid,
 ('95000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,now(),now()+interval '1 day' FROM generate_series(1,6) i;
INSERT INTO public.user_profiles(auth_user_id,status,must_change_password)
SELECT id,'active',false FROM auth.users WHERE email LIKE 't03-%@example.test' ON CONFLICT(auth_user_id) DO NOTHING;
UPDATE public.user_profiles SET status='active',must_change_password=false,owner_company_id=920001,branch_id=920011
WHERE auth_user_id IN(SELECT id FROM auth.users WHERE email LIKE 't03-%@example.test');

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
SELECT code,code,'HR','test','held' FROM unnest(ARRAY['hr.recruitment.manage','hr.employees.create','hr.employees.view.self',
 'hr.employees.update','numbering.rules.generate','users.employee_link.manage']) code ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role)
SELECT 't03_'||r,r,false FROM unnest(ARRAY['hr','accept','reader','self','number']) r;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
  ('t03_hr',ARRAY['hr.employment.lifecycle.manage','hr.employment.lifecycle.accept','hr.recruitment.manage','hr.recruitment.view','hr.employees.view','hr.employees.create','hr.employees.update','integrated.policy.view']),
  ('t03_accept',ARRAY['hr.employment.lifecycle.accept','hr.employees.view','integrated.policy.view']),
  ('t03_reader',ARRAY['hr.employees.view']),('t03_self',ARRAY['hr.employees.view.self']),
  ('t03_number',ARRAY['numbering.rules.generate'])
) use_case(code,caps) JOIN public.roles r ON r.role_code=use_case.code
JOIN public.permissions p ON p.permission_code=ANY(use_case.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,a.company,a.branch,true FROM (VALUES
 (1,'t03_hr',920001,920011),(1,'t03_hr',920001,920012),(1,'t03_hr',920002,920021),(1,'t03_number',NULL,NULL),
 (2,'t03_accept',920001,920011),(3,'t03_accept',920002,920021),(4,'t03_reader',920001,920012),(4,'t03_accept',920001,920012),
 (5,'t03_self',920001,920011),(6,'system_admin',NULL,NULL)) a(i,role_code,company,branch)
JOIN public.user_profiles u ON u.auth_user_id=('95000000-0000-4000-8000-'||lpad(a.i::text,12,'0'))::uuid
JOIN public.roles r ON r.role_code=a.role_code;

CREATE FUNCTION pg_temp.t03_actor(i integer) RETURNS text LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'sub','95000000-0000-4000-8000-'||lpad(i::text,12,'0'),
  'session_id','95000000-0000-4000-8001-'||lpad(i::text,12,'0'))::text,true);
$$;
CREATE FUNCTION pg_temp.t03_op(i integer) RETURNS uuid LANGUAGE sql AS $$
 SELECT ('95000000-0000-4000-8002-'||lpad(i::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.t03_day(delta integer) RETURNS date LANGUAGE sql STABLE AS $$
 SELECT (now() AT TIME ZONE 'Asia/Dubai')::date + delta;
$$;

-- Seed synthetic accepted facts. Both conversion and checklist completion use the real commands below.
SET LOCAL session_replication_role=replica;
INSERT INTO public.global_numbering_rules(rule_code,rule_name,module_code,module_name,document_type_code,document_type_name,
 document_prefix,separator,format_template,sequence_length,padding_character,starting_sequence_number,current_sequence_number,
 next_sequence_number,reset_policy,is_active,is_locked)
VALUES('HR_EMPLOYEE','Synthetic employee numbering','HR','Human Resources','EMPLOYEE','Employee','T03EMP','-','{DOC}-{SEQ4}',4,'0',1,0,1,'never',true,false)
ON CONFLICT(rule_code) DO NOTHING;
INSERT INTO public.hr_job_requisitions(id,requisition_code,requisition_title,owner_company_id,branch_id,vacancies_count,requisition_status)
 OVERRIDING SYSTEM VALUE VALUES(950001,'T03-REQ','Synthetic Hiring',920001,920011,1,'open');
INSERT INTO public.hr_candidates(id,candidate_code,requisition_id,full_name_en,gender,date_of_birth,mobile_number,candidate_status,pipeline_stage)
 OVERRIDING SYSTEM VALUE VALUES(950001,'T03-CANDIDATE',950001,'Synthetic Joining','male','1990-01-01','0500000010','accepted','onboarding');
INSERT INTO public.hr_offers(id,candidate_id,requisition_id,offer_status,offer_date,valid_until,proposed_joining_date,
 owner_company_id,branch_id,basic_salary,gross_salary,terms_version,approved_terms_version,accepted_terms_version,terms_changed_by,approved_by,accepted_by)
 OVERRIDING SYSTEM VALUE
 SELECT 950001,950001,950001,'accepted',pg_temp.t03_day(-40),pg_temp.t03_day(30),pg_temp.t03_day(-25),920001,920011,
  2500,3000,1,1,1,terms_actor.id,approver.id,approver.id
 FROM public.user_profiles terms_actor,public.user_profiles approver
 WHERE terms_actor.auth_user_id='95000000-0000-4000-8000-000000000001' AND approver.auth_user_id='95000000-0000-4000-8000-000000000002';
INSERT INTO public.hr_onboarding_tasks(id,candidate_id,task_title,task_status,assigned_to,due_date,is_required,completion_criteria)
 OVERRIDING SYSTEM VALUE SELECT 950001,950001,'Verify synthetic starter','pending',p.id,pg_temp.t03_day(-22),true,'Check signed starter sheet'
 FROM public.user_profiles p WHERE p.auth_user_id='95000000-0000-4000-8000-000000000001';
SET LOCAL session_replication_role=origin;
INSERT INTO erp_private.t02_work_rule_versions(company_id,category,effective_period,facts,digest,phase,prepared_by,reviewed_by,approved_by)
SELECT company,'overtime.standard',daterange(pg_temp.t03_day(-100),pg_temp.t03_day(1),'[)'),
 jsonb_build_object('salary_basis','basic','component_type_ids','[]'::jsonb,'rate_multiplier',multiplier,'monthly_hours',208),
 repeat('1',64),'approved','95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000003'
FROM (VALUES (920001,1.25),(920002,1.75)) AS rates(company,multiplier);

SET LOCAL ROLE authenticated;
DO $$
DECLARE opening jsonb;
DECLARE conversion jsonb;
DECLARE receipt jsonb;
DECLARE joining jsonb;
DECLARE facts jsonb;
DECLARE subject bigint;
DECLARE revision text;
BEGIN
 PERFORM pg_temp.t03_actor(1);
 opening:=jsonb_build_object('owner_company_id',920001,'branch_id',920011,'employee_category_id',920001,
   'joining_date',pg_temp.t03_day(-25),'employee_status','inactive',
   'offer_id',950001,'offer_revision','1','offer_terms_version','1','requisition_id',950001,
   'emergency_contact_name','Synthetic contact','emergency_contact_mobile','0500000101');
 BEGIN
  PERFORM public.convert_candidate_to_employee_atomic(950001,pg_temp.t03_op(91),1,opening||'{"employee_status":"active"}'::jsonb);
  RAISE EXCEPTION 'Conversion can still activate employee before onboarding';
 EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE '%remains pending%' THEN RAISE; END IF;
 END;
 conversion:=public.convert_candidate_to_employee_atomic(950001,pg_temp.t03_op(1),1,opening);
 subject:=(conversion->>'employee_id')::bigint;
 PERFORM set_config('t03.subject',subject::text,true);
 PERFORM set_config('t03.employee_code',conversion->>'employee_code',true);
 IF public.convert_candidate_to_employee_atomic(950001,pg_temp.t03_op(1),1,opening)->>'employee_code' IS DISTINCT FROM conversion->>'employee_code'
   OR NOT EXISTS(SELECT 1 FROM public.employees WHERE id=subject AND employee_status='inactive' AND actual_joining_date IS NULL)
   OR public.t03_employment_as_of(subject,pg_temp.t03_day(-24))->>'status' IS DISTINCT FROM 'unresolved' THEN
  RAISE EXCEPTION 'Conversion or replay did not preserve a pending single employee';
 END IF;
 revision:=(SELECT workspace_revision::text FROM public.hr_candidates WHERE id=950001);
 joining:=jsonb_build_object('kind','joining','candidateId',950001,'id',950001,'revision',revision,
  'action','start','values','{}'::jsonb,'reason','Start employee checklist');
 receipt:=public.f12_mutate_recruitment(pg_temp.t03_op(2),joining);
 joining:=joining||jsonb_build_object('action','finish','revision',receipt->>'revision',
  'values',jsonb_build_object('actual_joining_date',pg_temp.t03_day(-23)),'reason','Actual starter date verified');
 BEGIN
  PERFORM public.f12_mutate_recruitment(pg_temp.t03_op(93),joining);
  RAISE EXCEPTION 'Incomplete mandatory checklist allowed activation';
 EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE '%Required joining work%' THEN RAISE; END IF;
 END;
 PERFORM public.f12_mutate_recruitment(pg_temp.t03_op(3),jsonb_build_object('kind','task','candidateId',950001,
  'employeeId',subject,'id',950001,'revision',(SELECT workspace_revision::text FROM public.hr_onboarding_tasks WHERE id=950001),
  'action','complete','values','{}'::jsonb,'reason','Signed starter sheet checked'));
 receipt:=public.f12_mutate_recruitment(pg_temp.t03_op(4),joining);
 IF public.f12_mutate_recruitment(pg_temp.t03_op(4),joining) IS DISTINCT FROM (receipt||'{"replayed":true}'::jsonb)
    OR NOT EXISTS(SELECT 1 FROM public.employees WHERE id=subject AND employee_status='active' AND actual_joining_date=pg_temp.t03_day(-23)) THEN
  RAISE EXCEPTION 'Joining and exact replay did not activate the original employee';
 END IF;
 facts:=public.t03_employment_as_of(subject,pg_temp.t03_day(-23));
 IF facts->>'status' IS DISTINCT FROM 'resolved' OR facts->>'contractual_start' IS DISTINCT FROM pg_temp.t03_day(-25)::text
   OR facts->>'actual_start' IS DISTINCT FROM pg_temp.t03_day(-23)::text
   OR facts ?| ARRAY['basic_salary','medical','iban','name','reason'] THEN
  RAISE EXCEPTION 'Dated joining projection lost facts or disclosed restricted information';
 END IF;
 BEGIN
  UPDATE public.employees SET owner_company_id=920002,branch_id=920021 WHERE employees.id=subject;
  RAISE EXCEPTION 'Generic employee edit bypassed independent transfer approval';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%reviewed employment lifecycle%' THEN RAISE; END IF;
 END;
END;
$$;
RESET ROLE;

-- Existing verified identity link path: a matching role does not infer a link.
SET LOCAL ROLE authenticated;
DO $$
DECLARE profile_id bigint;
DECLARE subject bigint:=current_setting('t03.subject')::bigint;
BEGIN
 PERFORM pg_temp.t03_actor(5);
 IF public.f03_has_employee_permission(subject,'hr.employees.view') THEN RAISE EXCEPTION 'Self access inferred from matching scope'; END IF;
 RESET ROLE;
 SELECT id INTO profile_id FROM public.user_profiles WHERE auth_user_id='95000000-0000-4000-8000-000000000005';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t03_actor(6);
 PERFORM public.f03_set_employee_link(profile_id,subject);
 PERFORM pg_temp.t03_actor(5);
 IF NOT public.f03_has_employee_permission(subject,'hr.employees.view') THEN RAISE EXCEPTION 'Verified employee link did not resolve'; END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
DECLARE subject bigint:=current_setting('t03.subject')::bigint;
DECLARE proposal jsonb;
DECLARE receipt jsonb;
DECLARE earlier jsonb;
DECLARE later jsonb;
DECLARE id bigint;
BEGIN
 PERFORM pg_temp.t03_actor(1);
 proposal:=public.t03_propose_employment_change(subject,(SELECT workspace_revision FROM public.employees WHERE employees.id=subject),
   'transfer',pg_temp.t03_day(-14),920002,920021,pg_temp.t03_day(-14),NULL,'Accepted permanent transfer',pg_temp.t03_op(10));
 id:=(proposal->>'id')::bigint;
 PERFORM set_config('t03.transfer_digest',proposal->>'digest',true);
 BEGIN
  PERFORM public.t03_decide_employment_change(id,proposal->>'digest','source','Self approval',pg_temp.t03_op(94));
  RAISE EXCEPTION 'Transfer maker approved their own change';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t03_actor(2);
 PERFORM public.t03_decide_employment_change(id,proposal->>'digest','source','Source acceptance',pg_temp.t03_op(11));
 PERFORM pg_temp.t03_actor(1);
 BEGIN
  PERFORM public.t03_decide_employment_change(id,proposal->>'digest','apply','One side only',pg_temp.t03_op(95));
  RAISE EXCEPTION 'Transfer applied without destination approval';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 PERFORM pg_temp.t03_actor(3);
 IF public.t03_read_employment_change(id)->>'source_accepted' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'The receiving officer cannot review the exact source acceptance'; END IF;
 PERFORM public.t03_decide_employment_change(id,proposal->>'digest','destination','Receiving acceptance',pg_temp.t03_op(12));
 PERFORM pg_temp.t03_actor(1);
 receipt:=public.t03_decide_employment_change(id,proposal->>'digest','apply','Effective handover',pg_temp.t03_op(13));
 IF public.t03_decide_employment_change(id,proposal->>'digest','apply','Effective handover',pg_temp.t03_op(13))
    IS DISTINCT FROM (receipt||'{"replayed":true}'::jsonb) THEN RAISE EXCEPTION 'Transfer replay differs'; END IF;
 PERFORM set_config('t03.applied_transfer', id::text, true);
 PERFORM pg_temp.t03_actor(2);
 earlier:=public.t03_employment_as_of(subject,pg_temp.t03_day(-15));
 IF earlier->>'company_id' IS DISTINCT FROM '920001' OR earlier->>'effective_until' IS DISTINCT FROM pg_temp.t03_day(-14)::text THEN
  RAISE EXCEPTION 'Source company period lost at transfer';
 END IF;
 IF (public.t02_resolve_work_rule(subject,pg_temp.t03_day(-15),'overtime.standard')#>>'{facts,rate_multiplier}')::numeric IS DISTINCT FROM 1.25 THEN
  RAISE EXCEPTION 'Work policy lost the earlier employer'; END IF;
 BEGIN
  PERFORM public.t03_employment_as_of(subject,pg_temp.t03_day(-14));
  RAISE EXCEPTION 'Old employer could view new employer period';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t03_actor(3);
 later:=public.t03_employment_as_of(subject,pg_temp.t03_day(-14));
 IF later->>'company_id' IS DISTINCT FROM '920002' OR later->>'branch_id' IS DISTINCT FROM '920021' THEN
  RAISE EXCEPTION 'Destination was incorrect at handover';
 END IF;
 IF (public.t02_resolve_work_rule(subject,pg_temp.t03_day(-14),'overtime.standard')#>>'{facts,rate_multiplier}')::numeric IS DISTINCT FROM 1.75
  OR EXISTS(SELECT 1 FROM public.employee_employment_events WHERE employee_id=subject AND operation_id=pg_temp.t03_op(13)) THEN
  RAISE EXCEPTION 'Destination work policy or private transfer journal boundary failed'; END IF;
 BEGIN
  PERFORM public.t03_employment_as_of(subject,pg_temp.t03_day(-15));
  RAISE EXCEPTION 'Destination-only actor retrieved source history';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t03_actor(4);
 BEGIN
  PERFORM public.t03_employment_as_of(subject,pg_temp.t03_day(-15));
  RAISE EXCEPTION 'Sibling branch accessed verified employment period';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.t03_read_employment_change(id);
  RAISE EXCEPTION 'Sibling branch could read an employment decision';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t03_actor(5);
 IF public.f03_has_employee_permission(subject,'hr.employees.view') THEN
  RAISE EXCEPTION 'A stale identity link granted scope after the employee transferred';
 END IF;
END;
$$;
RESET ROLE;
-- Historical verified exit evidence is synthetic. The T18 settlement gate stays in force.
SET LOCAL session_replication_role=replica;
INSERT INTO public.employee_eos_cases(id,employee_id,eos_type,case_status,employment_end_date,clearance_completed,final_settlement_status)
 OVERRIDING SYSTEM VALUE VALUES(950001,current_setting('t03.subject')::bigint,'resignation','closed',pg_temp.t03_day(-8),true,'completed');
SET LOCAL session_replication_role=origin;

SET LOCAL ROLE authenticated;
DO $$
DECLARE subject bigint:=current_setting('t03.subject')::bigint;
DECLARE proposal jsonb;
DECLARE id bigint;
DECLARE former_period text;
DECLARE result jsonb;
BEGIN
 PERFORM pg_temp.t03_actor(1);
 former_period:=public.t03_employment_as_of(subject,pg_temp.t03_day(-8))->>'period_id';
 proposal:=public.t03_propose_employment_change(subject,(SELECT workspace_revision FROM public.employees WHERE employees.id=subject),
  'end',pg_temp.t03_day(-7),NULL,NULL,NULL,950001,'Close verified employer period',pg_temp.t03_op(20));
 id:=(proposal->>'id')::bigint;
 PERFORM pg_temp.t03_actor(3);
 PERFORM public.t03_decide_employment_change(id,proposal->>'digest','source','Verified final work date',pg_temp.t03_op(21));
 PERFORM pg_temp.t03_actor(1);
 PERFORM public.t03_decide_employment_change(id,proposal->>'digest','apply','Employment ended',pg_temp.t03_op(22));
 IF public.t03_employment_as_of(subject,pg_temp.t03_day(-7))->>'status' IS DISTINCT FROM 'unresolved' THEN
  RAISE EXCEPTION 'Exit did not end employment coverage'; END IF;
 proposal:=public.t03_propose_employment_change(subject,(SELECT workspace_revision FROM public.employees WHERE employees.id=subject),
  'rehire',pg_temp.t03_day(-2),920002,920021,pg_temp.t03_day(-3),950001,'Verified return of same employee',pg_temp.t03_op(23));
 id:=(proposal->>'id')::bigint;
 PERFORM pg_temp.t03_actor(3);
 PERFORM public.t03_decide_employment_change(id,proposal->>'digest','source','Identity and next contract checked',pg_temp.t03_op(24));
 PERFORM pg_temp.t03_actor(1);
 PERFORM public.t03_decide_employment_change(id,proposal->>'digest','apply','Confirm actual return',pg_temp.t03_op(25));
 result:=public.t03_employment_as_of(subject,pg_temp.t03_day(-2));
 IF result->>'status' IS DISTINCT FROM 'resolved' OR result->>'period_id' IS NOT DISTINCT FROM former_period
    OR result->>'employee_id' IS DISTINCT FROM current_setting('t03.subject')
    OR public.t03_employment_as_of(subject,pg_temp.t03_day(-4))->>'status' IS DISTINCT FROM 'unresolved'
    OR (SELECT e.employee_code FROM public.employees e WHERE e.id=subject) IS DISTINCT FROM current_setting('t03.employee_code') THEN
  RAISE EXCEPTION 'Rehire did not preserve one employee, the gap and a new period';
 END IF;
END;
$$;
RESET ROLE;
SET LOCAL session_replication_role=replica;
UPDATE public.employees SET actual_joining_date=pg_temp.t03_day(-60) WHERE id=920001;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
DO $$
DECLARE draft jsonb;
BEGIN
 PERFORM pg_temp.t03_actor(1);
 draft:=public.t03_propose_employment_change(920001,(SELECT workspace_revision FROM public.employees WHERE id=920001),
  'confirm',pg_temp.t03_day(-15),NULL,NULL,NULL,NULL,'Existing staff record verified from this date',pg_temp.t03_op(30));
 PERFORM pg_temp.t03_actor(2);
 PERFORM public.t03_decide_employment_change((draft->>'id')::bigint,draft->>'digest','source','Original record checked',pg_temp.t03_op(31));
 PERFORM pg_temp.t03_actor(1);
 PERFORM public.t03_decide_employment_change((draft->>'id')::bigint,draft->>'digest','apply','Start verified coverage',pg_temp.t03_op(32));
 IF public.t03_employment_as_of(920001,pg_temp.t03_day(-16))->>'status' IS DISTINCT FROM 'unresolved'
   OR public.t03_employment_as_of(920001,pg_temp.t03_day(-15))->>'status' IS DISTINCT FROM 'resolved' THEN
  RAISE EXCEPTION 'Verification guessed earlier coverage or lost the confirmed period';
 END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
DECLARE draft jsonb;
DECLARE earlier jsonb;
DECLARE later jsonb;
BEGIN
 PERFORM pg_temp.t03_actor(1);
 earlier:=public.t03_employment_as_of(920001,pg_temp.t03_day(-13));
 draft:=public.t03_propose_employment_change(920001,(SELECT workspace_revision FROM public.employees WHERE id=920001),
  'transfer',pg_temp.t03_day(-12),920001,920012,NULL,NULL,'Same employer, different branch',pg_temp.t03_op(40));
 PERFORM pg_temp.t03_actor(2);
 PERFORM public.t03_decide_employment_change((draft->>'id')::bigint,draft->>'digest','source','Source branch acceptance',pg_temp.t03_op(41));
 PERFORM pg_temp.t03_actor(4);
 PERFORM public.t03_decide_employment_change((draft->>'id')::bigint,draft->>'digest','destination','Receiving branch acceptance',pg_temp.t03_op(42));
 PERFORM pg_temp.t03_actor(1);
 PERFORM public.t03_decide_employment_change((draft->>'id')::bigint,draft->>'digest','apply','Internal handover',pg_temp.t03_op(43));
 later:=public.t03_employment_as_of(920001,pg_temp.t03_day(-12));
 IF later->>'branch_id' IS DISTINCT FROM '920012' OR earlier->>'branch_id' IS DISTINCT FROM '920011'
   OR later->>'contractual_start' IS DISTINCT FROM earlier->>'contractual_start'
   OR later->>'actual_start' IS DISTINCT FROM earlier->>'actual_start'
   OR (SELECT actual_joining_date FROM public.employees WHERE id=920001) IS DISTINCT FROM pg_temp.t03_day(-60) THEN
  RAISE EXCEPTION 'An internal branch move reset service dates';
 END IF;
END;
$$;
RESET ROLE;
UPDATE public.user_roles SET is_active=false WHERE owner_company_id=920002 AND user_profile_id=
 (SELECT id FROM public.user_profiles WHERE auth_user_id='95000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 PERFORM pg_temp.t03_actor(1);
 BEGIN
  PERFORM public.t03_decide_employment_change(current_setting('t03.applied_transfer')::bigint,current_setting('t03.transfer_digest'),
   'apply','Effective handover',pg_temp.t03_op(13));
  RAISE EXCEPTION 'Transferred receipt disclosed after destination revocation';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$$;
RESET ROLE;
DO $$
DECLARE subject bigint:=current_setting('t03.subject')::bigint;
BEGIN
 IF (SELECT count(*) FROM erp_private.t03_employment_periods WHERE employee_id=subject)<>3
  OR (SELECT count(*) FROM erp_private.t03_employment_acceptances WHERE change_id=current_setting('t03.applied_transfer')::bigint)<>2
  OR (SELECT count(*) FROM public.employee_recruitment_links WHERE candidate_id=950001 AND employee_id=subject)<>1
  OR NOT EXISTS(SELECT 1 FROM public.hr_offers WHERE id=950001 AND approved_terms_version=1 AND accepted_terms_version=1)
  OR NOT EXISTS(SELECT 1 FROM public.employee_status_events WHERE employee_id=subject AND new_status='terminated' AND employment_event_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM erp_private.t03_employee_write_proofs)
  OR has_table_privilege('authenticated','erp_private.t03_employment_periods','INSERT')
  OR has_function_privilege('anon','public.t03_employment_as_of(bigint,date)','EXECUTE') THEN
  RAISE EXCEPTION 'One identity, approvals or authoritative event linkage was lost';
 END IF;
END;
$$;
SELECT 'PASS: one numbered employee, verified identity link, checklist and activation, independent transfer, dated scope, closed exit and rehire';
ROLLBACK;
