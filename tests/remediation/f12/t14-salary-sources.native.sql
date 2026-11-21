\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database() NOT IN ('t00_clean','t14_hr_work','t14_native_work') OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM 'Isolated HR T00 20261119'
 THEN RAISE EXCEPTION 'Isolated T14 test database required'; END IF;
 IF to_regprocedure('erp_private.t14_salary_sources(bigint,bigint,bigint,bigint,date,timestamp with time zone,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'T14 salary, leave and attendance projection is missing'; END IF;
 IF has_function_privilege('authenticated','erp_private.t14_salary_sources(bigint,bigint,bigint,bigint,date,timestamp with time zone,jsonb)','execute')
   OR has_function_privilege('service_role','erp_private.t14_salary_profile(bigint,date,timestamp with time zone)','execute')
 THEN RAISE EXCEPTION 'T14 HR private sources must never be exposed to client roles'; END IF;
END;
$$;

-- Fixtures stand in for previously verified facts from T03, T04 and F12.
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,aud,role,email_confirmed_at) VALUES
 ('99414000-0000-4000-8000-000000000001','t14-hr-a@example.test','authenticated','authenticated',now()),
 ('99414000-0000-4000-8000-000000000002','t14-hr-b@example.test','authenticated','authenticated',now());
INSERT INTO public.user_profiles(id,auth_user_id,status,must_change_password) OVERRIDING SYSTEM VALUE VALUES
 (994140,'99414000-0000-4000-8000-000000000001','active',false),
 (994141,'99414000-0000-4000-8000-000000000002','active',false);
INSERT INTO public.currencies(currency_code,currency_name_en,decimal_places)
VALUES ('AED','Synthetic United Arab Emirates dirhams',2) ON CONFLICT (currency_code) DO NOTHING;
INSERT INTO public.hr_payroll_groups(id,code,name_en,pay_frequency,created_at,updated_at) OVERRIDING SYSTEM VALUE
VALUES (994140,'T14-HR-MONTH','T14 monthly staff','monthly','2026-09-01','2026-09-01');
INSERT INTO public.hr_salary_component_types(id,code,name_en,component_kind,is_basic,created_at,updated_at) OVERRIDING SYSTEM VALUE
VALUES (994140,'T14-HR-BASIC','Basic salary','earning',true,'2026-09-01','2026-09-01'),
 (994141,'T14-HR-HOUSING','Housing allowance','earning',false,'2026-09-01','2026-09-01'),
 (994142,'T14-HR-RECURRING','Recurring deduction','deduction',false,'2026-09-01','2026-09-01');
INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,joining_date,actual_joining_date,
 owner_company_id,branch_id,employee_status,employee_category_id) OVERRIDING SYSTEM VALUE VALUES
 (994140,'T14-HR-001','T14 payroll sample','male','1990-01-01','2024-10-19','2024-10-19',920002,920021,'active',920001),
 (994141,'T14-HR-002','T14 partial joiner','male','1990-01-01','2026-10-16','2026-10-16',920001,920011,'active',920001);
INSERT INTO erp_private.t03_employment_changes(id,employee_id,source_revision,kind,effective_on,source_company,source_branch,
 destination_company,destination_branch,reason,digest,proposed_by,applied_by,applied_at) OVERRIDING SYSTEM VALUE VALUES
 (994140,994140,1,'confirm','2024-10-19',920001,920011,920001,920011,'Verified opening',repeat('a',64),
 '99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-09-01'),
 (994141,994140,1,'transfer','2026-11-01',920001,920011,920002,920021,'Verified transfer',repeat('a',64),
 '99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-11-01'),
 (994142,994141,1,'confirm','2026-10-16',920001,920011,920001,920011,'Verified opening',repeat('a',64),
 '99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-10-16');
INSERT INTO erp_private.t03_employment_periods(id,employee_id,company_id,branch_id,employee_category_id,work_period,
 contractual_start,actual_start,source_revision,change_id,closed_by_change_id) OVERRIDING SYSTEM VALUE VALUES
 (994140,994140,920001,920011,920001,'[2024-10-19,2026-11-01)','2024-10-19','2024-10-19',1,994140,994141),
 (994141,994140,920002,920021,920001,'[2026-11-01,)','2024-10-19','2026-11-01',2,994141,NULL),
 (994142,994141,920001,920011,920001,'[2026-10-16,)','2026-10-16','2026-10-16',1,994142,NULL);

INSERT INTO public.employee_payroll_profiles(id,employee_id,payroll_group_id,effective_date,currency,payroll_status,created_at,updated_at)
OVERRIDING SYSTEM VALUE VALUES
 (994140,994140,994140,'2026-09-01','AED','active','2026-09-01','2026-09-01'),
 (994141,994141,994140,'2026-10-16','AED','active','2026-10-16','2026-10-16');
INSERT INTO public.employee_salary_components(id,employee_id,component_type_id,amount,effective_from,created_at,updated_at) OVERRIDING SYSTEM VALUE VALUES
 (994140,994140,994140,3100,'2026-09-01','2026-09-01','2026-09-01'),
 (994141,994140,994141,620,'2026-09-01','2026-09-01','2026-09-01'),
 (994142,994140,994142,31,'2026-09-01','2026-09-01','2026-09-01'),
 (994143,994141,994140,3000,'2026-10-16','2026-10-16','2026-10-16');
INSERT INTO public.employee_salary_revisions(id,employee_id,effective_date,new_gross,created_by,created_at) OVERRIDING SYSTEM VALUE
VALUES (994140,994140,'2026-10-16',3731,994140,'2026-10-14'),(994141,994140,'2026-10-24',4000,994140,'2026-10-22');
INSERT INTO public.employee_salary_revision_reviews(revision_id,employee_id,status,source_fingerprint,apply_requested,currency,
 requested_by,approved_by,approved_at,applied_by,applied_at,created_at) VALUES
 (994140,994140,'applied',repeat('a',64),true,'AED',994140,994141,'2026-10-17',994140,'2026-10-18','2026-10-14'),
 (994141,994140,'applied',repeat('b',64),true,'AED',994140,994141,'2026-10-27',994140,'2026-11-03','2026-10-22');
INSERT INTO public.employee_salary_revision_effects(id,revision_id,employee_id,effective_date,new_basic,currency,
 approved_by,applied_by,applied_at,source_fingerprint) OVERRIDING SYSTEM VALUE VALUES
 (994140,994140,994140,'2026-10-16',3731,'AED',994141,994140,'2026-10-18',repeat('a',64)),
 (994141,994141,994140,'2026-10-24',4000,'AED',994141,994140,'2026-11-03',repeat('b',64));

INSERT INTO erp_private.t04_setup(id,kind,company_id,branch_id,employee_id,facts,digest,proposed_by,approved_by,approved_at) OVERRIDING SYSTEM VALUE
VALUES (994140,'policy',920001,NULL,NULL,'{}',repeat('a',64),'99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-09-01'),
 (994141,'opening',920001,920011,994140,'{}',repeat('b',64),'99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-09-01'),
 (994142,'opening',920001,920011,994140,'{}',repeat('c',64),'99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-09-01');
INSERT INTO erp_private.t04_policies(id,company_id,effective,facts)
VALUES (994140,920001,'[2026-09-01,2027-09-01)','{}');
INSERT INTO erp_private.t04_periods(id,setup_id,employee_id,company_id,service_start,coverage,policy_id,cutoff,
  full_entitlement,opening_earned,opening_used,opening_sick) OVERRIDING SYSTEM VALUE VALUES
 (994141,994141,994140,920001,'2024-10-19','[2025-10-19,2026-10-19)',994140,'2026-09-01',30,30,30,0),
 (994142,994142,994140,920001,'2024-10-19','[2026-10-19,2027-10-19)',994140,'2026-10-19',30,30,0,0);
INSERT INTO erp_private.t04_cases(id,employee_id,company_id,branch_id,employment_id,category,dates,status,revision,fingerprint,submitted_by,approved_by,created_at) OVERRIDING SYSTEM VALUE VALUES
 (994140,994140,920001,920011,994140,'annual','[2026-10-18,2026-10-20)','approved',3,repeat('a',64),'99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-10-18'),
 (994141,994140,920001,920011,994140,'sick','[2026-10-20,2026-10-21)','approved',3,repeat('b',64),'99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-10-18'),
 (994142,994140,920001,920011,994140,'annual','[2026-10-21,2026-10-22)','cancelled',4,repeat('c',64),'99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-10-18'),
 (994143,994140,920001,920011,994140,'unpaid','[2026-10-23,2026-10-24)','approved',3,repeat('d',64),'99414000-0000-4000-8000-000000000001','99414000-0000-4000-8000-000000000002','2026-10-18');
INSERT INTO erp_private.t04_days(id,case_id,employee_id,request_revision,day,policy_id,period_id,rate,state) OVERRIDING SYSTEM VALUE VALUES
 (994144,994140,994140,1,'2026-10-18',994140,994141,0,'posted'),
 (994140,994140,994140,1,'2026-10-19',994140,994142,1,'posted'),
 (994141,994141,994140,1,'2026-10-20',994140,994142,0.5,'posted'),
 (994142,994142,994140,1,'2026-10-21',994140,994142,0,'released'),
 (994143,994143,994140,1,'2026-10-23',994140,NULL,0,'posted');
INSERT INTO erp_private.t04_case_events(case_id,actor,operation_id,action,revision,input,created_at) VALUES
 (994140,'99414000-0000-4000-8000-000000000002','99414000-0000-4000-8001-000000000001','approve',3,'{}','2026-10-19'),
 (994141,'99414000-0000-4000-8000-000000000002','99414000-0000-4000-8001-000000000002','approve',3,'{}','2026-10-20'),
 (994142,'99414000-0000-4000-8000-000000000002','99414000-0000-4000-8001-000000000003','approve',3,'{}','2026-10-21'),
 (994142,'99414000-0000-4000-8000-000000000002','99414000-0000-4000-8001-000000000004','cancel',4,'{}','2026-11-04'),
 (994143,'99414000-0000-4000-8000-000000000002','99414000-0000-4000-8001-000000000005','approve',3,'{}','2026-11-03');
INSERT INTO public.employee_attendance_daily_summary(id,employee_id,attendance_date,attendance_type,approval_status,
 approved_by,approved_at,created_at,updated_at) OVERRIDING SYSTEM VALUE VALUES
 (994140,994140,'2026-10-20','absent','approved',994141,'2026-10-20','2026-10-20','2026-10-20'),
 (994141,994140,'2026-10-22','absent','approved',994141,'2026-10-22','2026-10-22','2026-10-22'),
 (994142,994140,'2026-10-23','absent','approved',994141,'2026-10-23','2026-10-23','2026-10-23'),
 (994143,994140,'2026-10-25','absent','approved',994141,'2026-11-03','2026-10-25','2026-11-03'),
 (994144,994140,'2026-10-26','absent','queried',NULL,NULL,'2026-10-26','2026-10-26');
SET LOCAL session_replication_role=origin;

CREATE FUNCTION pg_temp.t14_hr_salary(p_employee bigint,p_employment bigint,p_cutoff timestamptz,p_proration text DEFAULT 'calendar-days')
RETURNS jsonb LANGUAGE sql AS $$
 SELECT erp_private.t14_salary_sources(p_employee,p_employment,920001,920011,'2026-10-01',p_cutoff,
   jsonb_build_object('proration',p_proration,'fixed_days',30,'absence','verified-absence','rounding','line-half-up','leave_wage_basis','basic'));
$$;

DO $$
DECLARE actual jsonb; total numeric;
BEGIN
 actual := pg_temp.t14_hr_salary(994140,994140,'2026-11-02');
 IF actual->>'currency'<>'AED' OR (actual->>'group_id')::int<>994140 OR (actual->>'divisor')::int<>31
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'exceptions') v WHERE (v->>'blocking')::boolean)
 THEN RAISE EXCEPTION 'The historical branch and salary profile should be eligible: %',actual; END IF;
 SELECT sum((v->>'amount')::numeric) INTO total FROM jsonb_array_elements(actual->'lines') v WHERE v->>'kind'='earning';
 IF total IS DISTINCT FROM 4045.68 THEN RAISE EXCEPTION 'Dated basic and housing should total 4045.68, got %',total; END IF;
 SELECT sum((v->>'amount')::numeric) INTO total FROM jsonb_array_elements(actual->'lines') v WHERE v->>'kind'='deduction';
 IF total IS DISTINCT FROM 452.23 THEN RAISE EXCEPTION 'Recurring, unpaid, sick and one absence should total 452.23, got %',total; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'lines') v WHERE v->>'original_on'='2026-10-18'
   AND (v->>'amount')::numeric=120.35 AND v->'source'->>'entitlement_period_id'='994141')
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'lines') v WHERE v->>'original_on'='2026-10-19'
   AND (v->>'amount')::numeric=0 AND v->'source'->>'entitlement_period_id'='994142')
 THEN RAISE EXCEPTION 'The annual leave anniversary split did not retain its distinct dates and entitlement periods'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'lines') v WHERE v->>'original_on'='2026-10-20'
      AND v->>'category'='sick-leave' AND (v->>'amount')::numeric=60.18
      AND (v->'source'->>'paid_fraction')::numeric=0.5)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'lines') v WHERE v->>'category'='absence' AND v->>'original_on'<>'2026-10-22')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'exceptions') v WHERE v->>'code'='leave-approval-after-cutoff')
 THEN RAISE EXCEPTION 'Sick band, double absence or future cutoff is wrong: %',actual; END IF;
 actual:=pg_temp.t14_hr_salary(994140,994140,'2026-11-05');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'lines') v WHERE v->>'category'='unpaid-leave' AND v->>'original_on'='2026-10-21')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'lines') v WHERE v->>'category'='unpaid-leave' AND v->>'original_on'='2026-10-23')
 THEN RAISE EXCEPTION 'Later return or late approval was not reflected: %',actual; END IF;
 actual:=pg_temp.t14_hr_salary(994141,994142,'2026-11-02','fixed-days');
 IF (actual->>'divisor')::int<>30
   OR (actual->'lines'->0->>'amount')::numeric IS DISTINCT FROM 1600.00
 THEN RAISE EXCEPTION 'Fixed-day proration of the new starter failed: %',actual; END IF;
 BEGIN
  PERFORM erp_private.t14_salary_sources(994140,994141,920001,920011,'2026-10-01','2026-11-02','{}');
  RAISE EXCEPTION 'A different branch period was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

SET LOCAL session_replication_role=replica;
INSERT INTO public.employee_salary_components(id,employee_id,component_type_id,amount,effective_from,created_at,updated_at) OVERRIDING SYSTEM VALUE
VALUES (994144,994140,994141,10,'2026-10-01','2026-10-01','2026-10-01');
INSERT INTO public.employee_payroll_holds(id,employee_id,hold_reason,hold_date,is_active,created_at,updated_at) OVERRIDING SYSTEM VALUE
VALUES (994140,994141,'Private hold reason must not appear','2026-10-20',true,'2026-10-20','2026-10-20');
SET LOCAL session_replication_role=origin;
DO $$
DECLARE actual jsonb;
BEGIN
 actual:=pg_temp.t14_hr_salary(994140,994140,'2026-11-02');
 IF actual->'lines'<>'[]' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'exceptions') v
   WHERE v->>'code'='overlapping-salary-components' AND (v->>'blocking')::boolean) THEN RAISE EXCEPTION 'Conflicting salary was payable: %',actual; END IF;
 actual:=pg_temp.t14_hr_salary(994141,994142,'2026-11-02');
 IF actual->'lines'<>'[]' OR actual::text LIKE '%Private hold reason%'
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'exceptions') v WHERE v->>'code'='payroll-hold' AND (v->>'blocking')::boolean)
 THEN RAISE EXCEPTION 'Payroll hold provenance or confidentiality failed: %',actual; END IF;
END;
$$;
SELECT 'T14 HR salary, cutoff, matching annual leave anniversary, sick fraction, absence, historical employer, proration, hold and private grants passed.';
ROLLBACK;
