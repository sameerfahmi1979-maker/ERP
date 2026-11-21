\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database() <> 't00_clean' OR current_setting('cron.launch_active_jobs') <> 'off'
     OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
        IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
    RAISE EXCEPTION 'Run only in the isolated T00 database';
  END IF;
  IF to_regprocedure('public.t02_resolve_work_rule(bigint,date,text)') IS NULL THEN
    RAISE EXCEPTION 'T02 work-date policy resolution is absent';
  END IF;
END;
$$;
-- All fixture principals and assignments are rolled back.
INSERT INTO auth.users(id,email,aud,role,email_confirmed_at)
SELECT ('94000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'t02-'||i||'@example.test','authenticated','authenticated',now()
FROM generate_series(1,7) AS i;
INSERT INTO auth.sessions(id,user_id,created_at,not_after)
SELECT ('94000000-0000-4000-8001-'||lpad(i::text,12,'0'))::uuid,
       ('94000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,now(),now()+interval '1 day'
FROM generate_series(1,7) AS i;
UPDATE public.user_profiles SET status='active',must_change_password=false
WHERE auth_user_id IN (SELECT id FROM auth.users WHERE email LIKE 't02-%@example.test');
INSERT INTO public.user_profiles(auth_user_id,status,must_change_password)
SELECT id,'active',false FROM auth.users WHERE email LIKE 't02-%@example.test' ON CONFLICT(auth_user_id) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role)
VALUES ('t02_accounts','Synthetic Accounts',false),('t02_hr','Synthetic HR',false),
       ('t02_gm','Synthetic GM',false),('t02_branch','Synthetic branch reader',false),('t02_ops','Synthetic Ops Manager',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t02_accounts',ARRAY['integrated.policy.view','integrated.policy.prepare','integrated.policy.review','integrated.policy.approve','integrated.policy.exception','hr.employees.view']),
 ('t02_hr',ARRAY['integrated.policy.view','integrated.policy.review','integrated.policy.approve','hr.employees.view']),
 ('t02_gm',ARRAY['integrated.policy.view','integrated.policy.approve','integrated.policy.exception','hr.employees.view']),
 ('t02_branch',ARRAY['integrated.policy.view','hr.employees.view','hr.employees.update','hr.attendance.view','hr.attendance.manage','integrated.custody.transfer']),
 ('t02_ops',ARRAY['integrated.custody.transfer'])
) AS mapping(code,caps) JOIN public.roles r ON r.role_code=mapping.code
JOIN public.permissions p ON p.permission_code=ANY(mapping.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,grant_spec.company,grant_spec.branch,true
FROM (VALUES (1,'t02_accounts',920001,NULL::bigint),
 (2,'t02_hr',920001,NULL),(3,'t02_gm',920001,NULL),
 (4,'t02_branch',920001,920011),(5,'t02_ops',920001,NULL),(5,'t02_ops',920002,NULL),
 (6,'system_admin',NULL,NULL),(7,'t02_branch',920001,920011)) AS grant_spec(i,code,company,branch)
JOIN public.user_profiles u ON u.auth_user_id=('94000000-0000-4000-8000-'||lpad(grant_spec.i::text,12,'0'))::uuid
JOIN public.roles r ON r.role_code=grant_spec.code;
INSERT INTO erp_private.t02_role_validity(assignment_id,valid_until)
SELECT a.id,now()-interval '1 day' FROM public.user_roles a JOIN public.user_profiles p ON p.id=a.user_profile_id
WHERE p.auth_user_id='94000000-0000-4000-8000-000000000007';
INSERT INTO public.hr_salary_component_types(id,code,name_en,component_kind) OVERRIDING SYSTEM VALUE
VALUES (940001,'T02_EARNING','Synthetic included earning','earning'),
       (940002,'T02_DEDUCTION','Synthetic excluded deduction','deduction');

CREATE FUNCTION pg_temp.t02_actor(i integer) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
    'sub','94000000-0000-4000-8000-'||lpad(i::text,12,'0'),
    'session_id','94000000-0000-4000-8001-'||lpad(i::text,12,'0'))::text,true);
$$;
CREATE FUNCTION pg_temp.t02_op(i integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('94000000-0000-4000-8002-'||lpad(i::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.t02_rule(i integer,individual boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('salary_basis','basic','rate_multiplier',1+i::numeric/10,'component_type_ids','[]'::jsonb,'monthly_hours',208)
       || CASE WHEN individual THEN '{"exception_reason":"Synthetic private exception"}'::jsonb ELSE '{}'::jsonb END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated','erp_private.t02_work_rule_versions','SELECT')
     OR has_table_privilege('authenticated','erp_private.t02_operation_receipts','INSERT')
     OR has_table_privilege('authenticated','erp_private.t02_role_validity','UPDATE')
     OR has_function_privilege('anon','public.t02_resolve_work_rule(bigint,date,text)','EXECUTE')
     OR has_function_privilege('service_role','public.t02_prepare_work_rule(bigint,bigint,bigint,text,date,date,jsonb,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','erp_private.t02_replay(text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected direct permission to a T02 boundary';
  END IF;
  IF EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE r.role_code IN ('company_admin','branch_admin') AND p.permission_code LIKE 'integrated.%') THEN
    RAISE EXCEPTION 'An inherited administrator grant appeared';
  END IF;
END;
$$;
-- The custody check is private and is called by the custody transaction. Exercise its
-- real session and role evaluation under the same claims as the policy calls.
DO $$
BEGIN
  PERFORM pg_temp.t02_actor(4);
  IF erp_private.t02_cross_company_custody_allowed(920001,920011,920002,920021) THEN
    RAISE EXCEPTION 'One side of a transfer granted both';
  END IF;
  PERFORM pg_temp.t02_actor(5);
  IF NOT erp_private.t02_cross_company_custody_allowed(920001,920011,920002,920021)
     OR NOT erp_private.t02_cross_company_custody_allowed(920002,920021,920001,920012)
     OR erp_private.t02_cross_company_custody_allowed(920001,920021,920002,920021) THEN
    RAISE EXCEPTION 'Two exact companies or actual branch ownership were not enforced';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE draft jsonb;
DECLARE sample jsonb;
DECLARE id bigint;
DECLARE upper_date date := (now() AT TIME ZONE 'Asia/Dubai')::date + 31;
DECLARE lower_date date := upper_date - 30;
BEGIN
  PERFORM pg_temp.t02_actor(1);
  draft := public.t02_prepare_work_rule(920001,NULL,NULL,'overtime.standard',lower_date,upper_date,pg_temp.t02_rule(1),pg_temp.t02_op(1));
  id := (draft->>'id')::bigint;
  sample := public.t02_prepare_work_rule(920001,NULL,NULL,'overtime.standard',lower_date,upper_date,pg_temp.t02_rule(1),pg_temp.t02_op(1));
  IF sample IS DISTINCT FROM (draft || '{"replayed":true}'::jsonb) THEN RAISE EXCEPTION 'Prepare replay differs'; END IF;
  BEGIN
    PERFORM public.t02_prepare_work_rule(920001,NULL,NULL,'overtime.standard',lower_date,upper_date,pg_temp.t02_rule(2),pg_temp.t02_op(1));
    RAISE EXCEPTION 'Changed input reused operation';
  EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
  END;
  BEGIN
    PERFORM public.t02_prepare_work_rule(920001,NULL,NULL,'overtime.standard',lower_date,upper_date,
      '{"salary_basis":"approved_components","rate_multiplier":1.25,"component_type_ids":[],"monthly_hours":208}',pg_temp.t02_op(99));
    RAISE EXCEPTION 'Invalid salary basis accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  sample := public.t02_prepare_work_rule(920001,NULL,NULL,'overtime.ramadan',lower_date,upper_date,
    '{"salary_basis":"approved_components","rate_multiplier":1.25,"component_type_ids":[940001],"monthly_hours":208}',pg_temp.t02_op(100));
  IF sample->>'phase' IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Allowed earning basis was rejected'; END IF;
  BEGIN
    PERFORM public.t02_prepare_work_rule(920001,NULL,NULL,'overtime.ramadan',lower_date,upper_date,
      '{"salary_basis":"approved_components","rate_multiplier":1.25,"component_type_ids":[940002],"monthly_hours":208}',pg_temp.t02_op(101));
    RAISE EXCEPTION 'A deduction was accepted as salary basis';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.t02_decide_work_rule(id,1,draft->>'digest','review','Self review',pg_temp.t02_op(17));
    RAISE EXCEPTION 'Self-review accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF public.t02_resolve_work_rule(920001,lower_date,'overtime.standard')->>'status' IS DISTINCT FROM 'missing' THEN
    RAISE EXCEPTION 'Draft configured an effective rate';
  END IF;
  PERFORM pg_temp.t02_actor(2);
  sample := public.t02_decide_work_rule(id,1,draft->>'digest','review','Terms checked',pg_temp.t02_op(2));
  IF (sample->>'revision')::integer<>2 OR sample->>'digest' IS DISTINCT FROM draft->>'digest' THEN
    RAISE EXCEPTION 'Review changed the immutable facts';
  END IF;
  BEGIN
    PERFORM public.t02_decide_work_rule(id,2,draft->>'digest','approve','Self approval',pg_temp.t02_op(18));
    RAISE EXCEPTION 'Reviewer approved own review';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.t02_actor(1);
  BEGIN
    PERFORM public.t02_decide_work_rule(id,2,draft->>'digest','approve','Maker approval',pg_temp.t02_op(102));
    RAISE EXCEPTION 'Maker approved their own policy';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.t02_actor(3);
  BEGIN
    PERFORM public.t02_decide_work_rule(id,2,repeat('0',64),'approve','Invalid digest',pg_temp.t02_op(19));
    RAISE EXCEPTION 'Approval ignored pinned digest';
  EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
  END;
  sample := public.t02_decide_work_rule(id,2,draft->>'digest','approve','Approved for work dates',pg_temp.t02_op(3));
  IF sample->>'phase' IS DISTINCT FROM 'approved' OR sample->>'digest' IS DISTINCT FROM draft->>'digest' THEN
    RAISE EXCEPTION 'Approval did not bind the review facts';
  END IF;
  IF public.t02_decide_work_rule(id,2,draft->>'digest','approve','Approved for work dates',pg_temp.t02_op(3))
     IS DISTINCT FROM (sample || '{"replayed":true}'::jsonb) THEN RAISE EXCEPTION 'Approval replay differs'; END IF;
  PERFORM set_config('t02.base_id',id::text,true);
  PERFORM set_config('t02.base_digest',draft->>'digest',true);
END;
$$;

DO $$
DECLARE draft jsonb;
DECLARE item record;
DECLARE a date := (now() AT TIME ZONE 'Asia/Dubai')::date + 1;
DECLARE b date := a+30;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    (1,NULL::bigint,NULL::bigint,b,b+30,2),                 -- following policy
    (2,920001,NULL,a+7,a+28,3),                            -- group priority before company
    (3,NULL,920001,a+10,a+12,4),                           -- individual before group
    (4,NULL,NULL,a+10,a+16,5),                             -- same-priority overlap
    (5,NULL,NULL,a-2,a,6)                                  -- already effective at approval
  ) AS v(n,grp,employee,from_date,until_date,rate) LOOP
    PERFORM pg_temp.t02_actor(1);
    draft := public.t02_prepare_work_rule(920001,item.grp,item.employee,'overtime.standard',
      item.from_date,item.until_date,pg_temp.t02_rule(item.rate,item.employee IS NOT NULL),pg_temp.t02_op(20+item.n*3));
    PERFORM pg_temp.t02_actor(2);
    PERFORM public.t02_decide_work_rule((draft->>'id')::bigint,1,draft->>'digest','review','Terms checked',pg_temp.t02_op(21+item.n*3));
    PERFORM pg_temp.t02_actor(3);
    BEGIN
      PERFORM public.t02_decide_work_rule((draft->>'id')::bigint,2,draft->>'digest','approve','Approved',pg_temp.t02_op(22+item.n*3));
      IF item.n IN (4,5) THEN RAISE EXCEPTION 'Invalid or overlapping approval accepted'; END IF;
    EXCEPTION WHEN exclusion_violation THEN
      IF item.n<>4 THEN RAISE; END IF;
    WHEN check_violation THEN
      IF item.n<>5 THEN RAISE; END IF;
    END;
  END LOOP;
  PERFORM pg_temp.t02_actor(4);
  IF (public.t02_resolve_work_rule(920001,a,'overtime.standard')->>'digest') IS DISTINCT FROM current_setting('t02.base_digest')
     OR (public.t02_resolve_work_rule(920001,b,'overtime.standard')#>>'{facts,rate_multiplier}')::numeric IS DISTINCT FROM 1.2
     OR (public.t02_resolve_work_rule(920001,a+8,'overtime.standard')#>>'{facts,rate_multiplier}')::numeric IS DISTINCT FROM 1.3
     OR (public.t02_resolve_work_rule(920001,a+10,'overtime.standard')#>>'{facts,rate_multiplier}')::numeric IS DISTINCT FROM 1.4
     OR public.t02_resolve_work_rule(920001,a+10,'overtime.standard')#>'{facts,exception_reason}' IS NOT NULL THEN
    RAISE EXCEPTION 'Work date, priority or protected exception disclosure was wrong';
  END IF;
  IF public.t02_list_work_rules(920001,920011,'overtime.standard',0,1)->>'totalCount' IS DISTINCT FROM '1'
     OR public.t02_list_work_rules(920001,920011,'overtime.standard',0,1)#>'{rows,0,facts,exception_reason}' IS NOT NULL
     OR public.t02_list_work_rules(920001,920011,'overtime.standard',1,1)->'rows' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Scoped list/count, restricted fields or paging was wrong';
  END IF;
  BEGIN
    PERFORM public.t02_list_work_rules(920001,920012,'overtime.standard',0,10);
    RAISE EXCEPTION 'List admitted sibling branch';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.t02_resolve_work_rule(920003,a,'overtime.standard');
    RAISE EXCEPTION 'Read admitted other company';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.t02_actor(6);
  BEGIN
    PERFORM public.t02_list_work_rules(920001,NULL,'overtime.standard',0,10);
    RAISE EXCEPTION 'Global System implied business approval scope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.t02_actor(7);
  BEGIN
    PERFORM public.t02_resolve_work_rule(920001,a,'overtime.standard');
    RAISE EXCEPTION 'Expired assignment could resolve policy';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- Exercise the existing attendance business command and its real retry path.
DO $$
DECLARE original jsonb;
DECLARE values jsonb := '{"punch_datetime":"2026-11-18T08:03:00+04:00","punch_type":"in","punch_source":"manual","notes":"Synthetic T02 punch"}';
BEGIN
  PERFORM pg_temp.t02_actor(4);
  original := public.f11_mutate_time_child('attendance-punch',920001,NULL,NULL,pg_temp.t02_op(71),'create',values);
  IF public.f11_mutate_time_child('attendance-punch',920001,NULL,NULL,pg_temp.t02_op(71),'create',values)
     IS DISTINCT FROM (original || '{"replayed":true}'::jsonb) THEN RAISE EXCEPTION 'Attendance replay differs'; END IF;
END;
$$;
RESET ROLE;
UPDATE public.user_roles SET is_active=false WHERE user_profile_id IN
 (SELECT id FROM public.user_profiles WHERE auth_user_id IN
  ('94000000-0000-4000-8000-000000000003','94000000-0000-4000-8000-000000000004'))
 OR (user_profile_id=(SELECT id FROM public.user_profiles WHERE auth_user_id='94000000-0000-4000-8000-000000000005')
     AND owner_company_id=920002);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.employee_attendance_punches WHERE notes='Synthetic T02 punch')<>1
     OR (SELECT count(*) FROM erp_private.t02_work_rule_versions WHERE phase='approved' AND company_id=920001)<>4
     OR EXISTS(SELECT 1 FROM erp_private.t02_operation_receipts WHERE operation_id IN(pg_temp.t02_op(34),pg_temp.t02_op(37))) THEN
    RAISE EXCEPTION 'Retry or denied decision left duplicate/mismatched effects';
  END IF;
  PERFORM pg_temp.t02_actor(5);
  IF erp_private.t02_cross_company_custody_allowed(920001,920011,920002,920021)
     OR NOT erp_private.t02_has_scope('integrated.custody.transfer',920001,920011) THEN
    RAISE EXCEPTION 'Destination revocation changed the wrong scope or retained cross-company access';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.t02_actor(3);
  BEGIN
    PERFORM public.t02_decide_work_rule(current_setting('t02.base_id')::bigint,2,current_setting('t02.base_digest'),
      'approve','Approved for work dates',pg_temp.t02_op(3));
    RAISE EXCEPTION 'An approval receipt was disclosed after revocation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.t02_actor(4);
  BEGIN
    PERFORM public.f11_mutate_time_child('attendance-punch',920001,NULL,NULL,pg_temp.t02_op(71),'create',
      '{"punch_datetime":"2026-11-18T08:03:00+04:00","punch_type":"in","punch_source":"manual","notes":"Synthetic T02 punch"}');
    RAISE EXCEPTION 'Attendance replay was disclosed after revocation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;
SELECT 'PASS: T02 scoped policy, exact list/count, dated priority, independent review and approval, custody authority, and retry/revocation';
ROLLBACK;
