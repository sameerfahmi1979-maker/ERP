\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database() !~ '^(t00_clean|t19_[a-z0-9_]+)$'
   OR current_setting('cron.launch_active_jobs') <> 'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
   RAISE EXCEPTION 'Isolated T00 database required';
 END IF;
 IF to_regprocedure('public.t19_work_queue(bigint,bigint,text,text,integer,integer)') IS NULL
    OR to_regprocedure('public.t19_queue_scopes()') IS NULL THEN
   RAISE EXCEPTION 'T19 role queues are not installed';
 END IF;
 IF has_function_privilege('anon','public.t19_queue_scopes()','EXECUTE')
    OR has_function_privilege('service_role','public.t19_work_queue(bigint,bigint,text,text,integer,integer)','EXECUTE')
    OR has_function_privilege('authenticated','erp_private.t19_queue_rows(bigint,bigint,text[],date,timestamptz)','EXECUTE') THEN
   RAISE EXCEPTION 'Queue boundary uses unexpected grants';
 END IF;
END $$;

INSERT INTO public.owner_companies(id,company_code,legal_name_en) OVERRIDING SYSTEM VALUE VALUES
 (919001,'T19-A','Queue company A'),(919002,'T19-B','Queue company B'),
 (919003,'T19-C','Inactive queue company');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en) OVERRIDING SYSTEM VALUE VALUES
 (919011,919001,'T19-A1','Branch A1'),(919012,919001,'T19-A2','Branch A2'),
 (919013,919001,'T19-A3','Closed branch'),
 (919021,919002,'T19-B1','Branch B1');
UPDATE public.branches SET operating_status='closed' WHERE id=919013;
UPDATE public.owner_companies SET status='inactive' WHERE id=919003;

INSERT INTO auth.users(id,email,aud,role,email_confirmed_at)
SELECT ('91900000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  't19-queue-'||i||'@example.test','authenticated','authenticated',now() FROM generate_series(1,9) i;
INSERT INTO auth.sessions(id,user_id,created_at,not_after)
SELECT replace(id::text,'-8000-','-8001-')::uuid,id,now(),now()+interval '1 day'
 FROM auth.users WHERE email LIKE 't19-queue-%';
INSERT INTO public.user_profiles(auth_user_id,full_name,status,must_change_password)
SELECT id,'Synthetic queue actor','active',false FROM auth.users WHERE email LIKE 't19-queue-%'
 ON CONFLICT(auth_user_id) DO UPDATE SET status='active',must_change_password=false;
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
SELECT code,code,'HR','view','held' FROM unnest(ARRAY['hr.actions.view','hr.employees.view','dashboard.view','hr.payroll.view','hr.eos.view']) code
ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t19_queue_pro','Synthetic PRO',false),('t19_queue_ops','Synthetic role without source access',false),
 ('t19_queue_fleet','Synthetic custodian',false),('t19_queue_workshop','Synthetic workshop',false), ('t19_queue_finance','Synthetic finance and HR',false);
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES ('group_admin','Legacy Group Administrator',true)
ON CONFLICT (role_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM (VALUES
 ('t19_queue_pro',ARRAY['hr.actions.view','hr.employees.view']),
 ('t19_queue_ops',ARRAY['dashboard.view']),
 ('t19_queue_fleet',ARRAY['fleet.assets.view','fleet.custody.manage','fleet.availability.plan','fleet.operations.view','fleet.time.verify']),
 ('t19_queue_workshop',ARRAY['workshop.assess','fleet.maintenance.manage']),
 ('t19_queue_finance',ARRAY['hr.recovery.review','hr.recovery.accounts','hr.payroll.view','hr.payroll.run.manage',
 'hr.payroll.payment.reconcile','hr.exit.settlement.view','hr.eos.view'])
 ) grant_spec(code,caps) JOIN public.roles r ON r.role_code=grant_spec.code
 JOIN public.permissions p ON p.permission_code=ANY(grant_spec.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
 SELECT u.id,r.id,grant_spec.company,grant_spec.branch,true FROM (VALUES
 (1,'t19_queue_pro',919001,919011),(2,'t19_queue_ops',919001,919011),
 (3,'t19_queue_pro',919002,919021),(4,'t19_queue_pro',919001,919011),
 (5,'t19_queue_fleet',919001,919011),(6,'t19_queue_workshop',919001,919011),(7,'t19_queue_finance',919001,919011),
 (8,'system_admin',NULL,NULL),(9,'group_admin',NULL,NULL)
 ) grant_spec(i,code,company,branch)
 JOIN public.user_profiles u ON u.auth_user_id=('91900000-0000-4000-8000-'||lpad(grant_spec.i::text,12,'0'))::uuid
 JOIN public.roles r ON r.role_code=grant_spec.code;
INSERT INTO erp_private.t02_role_validity(assignment_id,valid_until)
 SELECT a.id,now()-interval '1 day' FROM public.user_roles a JOIN public.user_profiles p ON p.id=a.user_profile_id
 WHERE p.auth_user_id='91900000-0000-4000-8000-000000000004';

CREATE FUNCTION pg_temp.t19_actor(i integer) RETURNS text LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'sub','91900000-0000-4000-8000-'||lpad(i::text,12,'0'),
  'session_id','91900000-0000-4000-8001-'||lpad(i::text,12,'0'))::text,true);
$$;

SET LOCAL session_replication_role=replica;
INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,joining_date,actual_joining_date,
 owner_company_id,branch_id,employee_status) OVERRIDING SYSTEM VALUE VALUES
 (919101,'T19-STAFF-1','Queue employee One','male','1992-01-01','2024-01-01','2024-01-01',919001,919011,'active'),
 (919102,'T19-STAFF-2','Queue employee Two','male','1992-01-01','2024-01-01','2024-01-01',919001,919012,'active'),
 (919103,'T19-STAFF-3','Queue employee Three','male','1992-01-01','2024-01-01','2024-01-01',919002,919021,'active');
INSERT INTO public.employee_pro_processes(id,employee_id,process_title,process_status,request_date,target_date,notes,assigned_to)
 OVERRIDING SYSTEM VALUE
 SELECT v.id,v.employee,v.title,v.state,(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date-10,
  (statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date+due,'Secret text outside T19',p.id
 FROM (VALUES
 (919201,919101,'Visa review 100%','submitted',-2),
 (919202,919101,'Visa scan','waiting_for_document',0),
 (919203,919101,'Visa filing','approved',2),
 (919204,919101,'Completed visa','completed',-4),
 (919205,919102,'Sibling visa','requested',-5),
 (919206,919103,'Other company visa','requested',-6)
 ) v(id,employee,title,state,due)
 CROSS JOIN public.user_profiles p WHERE p.auth_user_id='91900000-0000-4000-8000-000000000001';
SET LOCAL session_replication_role=origin;

SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb;
BEGIN
 PERFORM pg_temp.t19_actor(1);
 result:=public.t19_queue_scopes();
 IF jsonb_array_length(result)<>1 OR result#>>'{0,branch}'<>'919011' OR result#>'{0,kinds}'<>'["pro"]' THEN
   RAISE EXCEPTION 'PRO choices did not match assigned branch: %',result;
 END IF;
 result:=public.t19_work_queue(919001,919011,'all','visa',1,2);
 IF result->>'total'<>'3' OR jsonb_array_length(result->'rows')<>2
    OR result#>>'{rows,0,source_id}'<>'919201' OR result#>>'{rows,0,age_days}'<>'10'
    OR result#>>'{rows,0,overdue_days}'<>'2' OR result#>>'{rows,1,overdue_days}'<>'0'
    OR result#>>'{rows,0,href}'<>'/admin/hr/actions/pro?record=919201'
    OR result#>>'{rows,0,assignee}' IS NULL
    OR result::text LIKE '%Secret text%' THEN
   RAISE EXCEPTION 'Queue ordering, scope, aging, ownership, or masking mismatch: %',result;
 END IF;
 result:=public.t19_work_queue(919001,919011,'pro','%',1,20);
 IF result->>'total'<>'1' OR result#>>'{rows,0,source_id}'<>'919201' THEN
   RAISE EXCEPTION 'Search did not match literal percent: %',result;
 END IF;
 IF public.t19_work_queue(919001,919011,'all','visa',2,2)#>>'{rows,0,source_id}'<>'919203'
    OR public.t19_work_queue(919001,919011,'all','visa',4,2)->>'total'<>'3'
    OR public.t19_work_queue(919001,919011,'pro','Secret text',1,20)->>'total'<>'0' THEN
   RAISE EXCEPTION 'Exact page total or masked search failed';
 END IF;
 BEGIN PERFORM public.t19_work_queue(919001,919012,'all','',1,20);
   RAISE EXCEPTION 'Sibling scope was accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.t19_work_queue(919001,919021,'all','',1,20);
   RAISE EXCEPTION 'Foreign branch was accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.t19_work_queue(919001,919011,'payment','',1,20);
   RAISE EXCEPTION 'Restricted queue was accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.t19_work_queue(919001,919011,'all','',0,20);
   RAISE EXCEPTION 'Invalid page was accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM pg_temp.t19_actor(2);
 IF public.t19_queue_scopes()<>'[]' THEN RAISE EXCEPTION 'Viewer without source access received scope choices'; END IF;
 PERFORM pg_temp.t19_actor(3);
 IF public.t19_work_queue(919002,919021,'pro','',1,20)->>'total'<>'1' THEN
   RAISE EXCEPTION 'Other-company actor could not see its own company';
 END IF;
 PERFORM pg_temp.t19_actor(4);
 IF public.t19_queue_scopes()<>'[]' THEN RAISE EXCEPTION 'Expired assignment received scope choices'; END IF;
END $$;
RESET ROLE;


CREATE FUNCTION pg_temp.t19_profile(i integer) RETURNS bigint LANGUAGE sql AS $$
 SELECT id FROM public.user_profiles WHERE auth_user_id=('91900000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;

INSERT INTO public.work_sites(id,site_code,site_name,site_type,owner_company_id,branch_id) OVERRIDING SYSTEM VALUE VALUES
 (919301,'T19-YARD','Synthetic queue yard','yard',919001,919011),
 (919302,'T19-DEST','Synthetic queue destination','yard',919001,919011);
INSERT INTO erp_private.fleet_assets(id,asset_no,owner_company_id,home_branch_id,category,name,status,created_by)
 OVERRIDING SYSTEM VALUE VALUES
 (919301,'T19-TRUCK','919001',919011,'truck','Synthetic asset','active',pg_temp.t19_profile(5)),
 (919302,'T19-HIDDEN','919001',919012,'truck','Sibling asset','active',pg_temp.t19_profile(5));

-- Fix the source state for each branch. Owning-workflow mutation tests are in T06–T18.
SET LOCAL session_replication_role=replica;
INSERT INTO erp_private.fleet_commitments(id,asset_id,employee_id,employment_period_id,company_id,branch_id,site_id,kind,status,
 committed_during,planned_return,policy_id,created_by) OVERRIDING SYSTEM VALUE VALUES
 (919311,919301,919101,919101,919001,919011,919301,'custody','active',
  tstzrange(now()-interval '8 days',NULL,'[)'),now()-interval '3 days',919301,pg_temp.t19_profile(5)),
 (919312,919302,919102,919102,919001,919012,919301,'custody','active',
  tstzrange(now()-interval '8 days',NULL,'[)'),now()-interval '3 days',919301,pg_temp.t19_profile(5));
INSERT INTO erp_private.fleet_asset_holds(id,asset_id,kind,placed_at,placed_by,reason)
 OVERRIDING SYSTEM VALUE VALUES
 (919311,919301,'workshop',now()-interval '2 days',pg_temp.t19_profile(5),'Secret workshop finding'),
 (919312,919302,'hse',now()-interval '2 days',pg_temp.t19_profile(5),'Secret sibling hold');
INSERT INTO erp_private.fleet_operation_orders(id,order_no,kind,company_id,branch_id,site_id,request_reference,subject,status,raised_by)
 OVERRIDING SYSTEM VALUE VALUES
 (919301,'FOP-T19-301','trip',919001,919011,919301,'Request ref','Private trip description','active',pg_temp.t19_profile(5));
INSERT INTO erp_private.fleet_trip_legs(id,order_id,sequence,planned_origin,planned_destination,planned_load)
 OVERRIDING SYSTEM VALUE VALUES(919301,919301,1,919301,919302,'loaded');
INSERT INTO erp_private.fleet_trip_leg_actuals(id,leg_id,assignment_id,origin,destination,departed_at,arrived_at,load)
 OVERRIDING SYSTEM VALUE VALUES(919301,919301,919301,919301,919302,now()-interval '3 days',now()-interval '2 days','loaded');
INSERT INTO erp_private.t08_fleet_work(id,order_id,assignment_id,commitment_id,employee_id,employment_id,employer_company_id,employer_branch_id,
 host_company_id,host_branch_id,site_id,day,work_period,overnight,activity,entered_by,reason) OVERRIDING SYSTEM VALUE VALUES
 (919301,919301,919301,919311,919101,919101,919001,919011,919001,919011,919301,
  (statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date-2,tstzrange(now()-interval '50 hours',now()-interval '49 hours','[)'),
  false,'customer-rental',pg_temp.t19_profile(6),'Secret unreconciled facts');
INSERT INTO erp_private.t08_fleet_work(id,order_id,assignment_id,commitment_id,employee_id,employment_id,employer_company_id,employer_branch_id,
 host_company_id,host_branch_id,site_id,day,work_period,overnight,activity,entered_by,reason) OVERRIDING SYSTEM VALUE
 SELECT 919400+i,w.order_id,w.assignment_id,w.commitment_id,w.employee_id,w.employment_id,w.employer_company_id,w.employer_branch_id,
 w.host_company_id,w.host_branch_id,w.site_id,w.day,
 tstzrange(upper(w.work_period)+i*interval '1 minute',upper(w.work_period)+(i+1)*interval '1 minute','[)'),
 false,w.activity,w.entered_by,'Synthetic newer work for owner paging'
 FROM erp_private.t08_fleet_work w CROSS JOIN generate_series(0,25) i WHERE w.id=919301;
INSERT INTO erp_private.t10_assessments(id,asset_id,company_id,branch_id,source_kind,source_ref,occurred_at,reported_by,finding,first_hold_id)
 OVERRIDING SYSTEM VALUE VALUES(919301,919301,919001,919011,'reported-failure','T19-FINDING',now()-interval '2 days',
 pg_temp.t19_profile(5),'Secret diagnosis',919311);
INSERT INTO erp_private.t10_service_clocks(id,asset_id,label,unit) OVERRIDING SYSTEM VALUE VALUES
 (919301,919301,'Overdue PM','days'),(919302,919301,'Inactive upcoming reminder','days');
INSERT INTO erp_private.t10_service_versions(clock_id,base_day,base_value,interval_value,notice,tolerance,reading_max_age,
 block_overdue,reminder_active,created_by,action,reason)
 SELECT s.id,(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date-s.age,0,10,3,0,30,true,s.remind,
  pg_temp.t19_profile(5),'create','Secret service description'
 FROM (VALUES (919301,12,true),(919302,8,false)) s(id,age,remind);
INSERT INTO erp_private.t13_cases(id,source_kind,company_id,branch_id,asset_id,occurred_at,source_amount,currency,source_status,
 subject_status,employee_id,employment_id,employer_company_id,employer_branch_id,authority_key,reference_key,reported_by)
 OVERRIDING SYSTEM VALUE VALUES
 (919301,'fine',919001,919011,919301,now()-interval '2 days',1234.78,'AED','reported','verified',919101,919101,
  919001,919011,'SYNTH AUTHORITY','SECRET-FINE-REFERENCE',pg_temp.t19_profile(5)),
 (919302,'fine',919001,919011,919301,now()-interval '2 days',0,'AED','cancelled','verified',919101,919101,
  919001,919011,'SYNTH AUTHORITY','CANCELLED-FINE-REFERENCE',pg_temp.t19_profile(5));
INSERT INTO erp_private.t14_runs(id,company_id,branch_id,month) VALUES
 ('91900000-0000-4000-8002-000000000001',919001,919011,'2026-10-01'),
 ('91900000-0000-4000-8002-000000000002',919001,919011,'2026-11-01');
INSERT INTO erp_private.t14_versions(id,run_id,number,cutoff,source_digest,rule_digest,digest,totals,exception_count,
 calculated_by,reason) VALUES
 ('91900000-0000-4000-8003-000000000001','91900000-0000-4000-8002-000000000001',1,now(),
   repeat('a',64),repeat('b',64),repeat('c',64),'[]',1,pg_temp.t19_profile(5),'Secret payroll gaps'),
 ('91900000-0000-4000-8003-000000000002','91900000-0000-4000-8002-000000000002',1,now(),
   repeat('a',64),repeat('b',64),repeat('c',64),'[]',0,pg_temp.t19_profile(5),'Secret payroll reason');
INSERT INTO erp_private.t14_results(version_id,employee_id,employee_name,employment_ids,currency,gross,deductions,state,policy_snapshots,exceptions) VALUES
 ('91900000-0000-4000-8003-000000000002',919101,'Secret payroll employee',ARRAY[919101],'AED',1999.37,0,'ready','[]','[]'),
 ('91900000-0000-4000-8003-000000000002',919102,'Secret zero employee',ARRAY[919102],'AED',0,0,'ready','[]','[]');
INSERT INTO erp_private.t15_reviews(id,run_id,version_id,digest,state,submitted_by,acknowledged_count,decided_by,decided_at)
 VALUES('91900000-0000-4000-8004-000000000001','91900000-0000-4000-8002-000000000002','91900000-0000-4000-8003-000000000002',
 repeat('c',64),'approved',pg_temp.t19_profile(5),0,pg_temp.t19_profile(6),now());
INSERT INTO erp_private.t16_batches(id,review_id,version_id,company_id,branch_id,month,digest,issued_by) VALUES
 ('91900000-0000-4000-8005-000000000001','91900000-0000-4000-8004-000000000001','91900000-0000-4000-8003-000000000002',
 919001,919011,'2026-11-01',repeat('c',64),pg_temp.t19_profile(5));
INSERT INTO erp_private.t16_batch_results(batch_id,version_id,employee_id,channel,routing_digest) VALUES
 ('91900000-0000-4000-8005-000000000001','91900000-0000-4000-8003-000000000002',919101,'cheque',repeat('a',64)),
 ('91900000-0000-4000-8005-000000000001','91900000-0000-4000-8003-000000000002',919102,'zero',repeat('a',64));
INSERT INTO erp_private.t16_batch_events(batch_id,company_id,lane,kind,reference,actor_id,document_id,version_id,file_id,proof_sha256) VALUES
 ('91900000-0000-4000-8005-000000000001',919001,'cheque','accepted','SECRET BANK PROOF',pg_temp.t19_profile(5),919301,919301,919301,repeat('b',64)),
 ('91900000-0000-4000-8005-000000000001',919001,'zero','accepted','SECRET ZERO PROOF',pg_temp.t19_profile(5),919302,919302,919302,repeat('b',64));
INSERT INTO erp_private.t16_payments(id,batch_id,company_id,version_id,employee_id,channel,reference,currency) VALUES
 ('91900000-0000-4000-8006-000000000001','91900000-0000-4000-8005-000000000001',919001,'91900000-0000-4000-8003-000000000002',
  919101,'cheque','SECRET PENDING REFERENCE','AED'),
 ('91900000-0000-4000-8006-000000000002','91900000-0000-4000-8005-000000000001',919001,'91900000-0000-4000-8003-000000000002',
  919102,'zero','SECRET PAID REFERENCE','AED');
INSERT INTO erp_private.t16_payment_events(payment_id,company_id,employee_id,outcome,amount,paid_on,document_id,version_id,file_id,checksum,actor_id) VALUES
 ('91900000-0000-4000-8006-000000000001',919001,919101,'pending',0,current_date,919301,919301,919301,repeat('b',64),pg_temp.t19_profile(5)),
 ('91900000-0000-4000-8006-000000000002',919001,919102,'paid',0,current_date,919302,919302,919302,repeat('b',64),pg_temp.t19_profile(5));
INSERT INTO public.employee_eos_cases(id,employee_id,eos_type,case_status,reason,final_settlement_status)
 OVERRIDING SYSTEM VALUE VALUES
 (919301,919101,'resignation','notice_served','Secret exit reason','not_started'),
 (919302,919101,'termination','closed','Secret closed exit','completed'),
 (919303,919102,'resignation','notice_served','Secret sibling exit','not_started');
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb;
BEGIN
 PERFORM pg_temp.t19_actor(5);
 result:=public.t19_work_queue(919001,919011,'custody','',1,20);
 IF result->>'total'<>'1' OR result#>>'{rows,0,source_id}'<>'919311' OR result#>>'{rows,0,overdue_days}'<>'3'
    OR result#>>'{rows,0,href}'<>'/modules/fleet/919301?custodyBefore=919312' THEN
   RAISE EXCEPTION 'Overdue custody source mismatch: %',result;
 END IF;
 result:=public.t19_work_queue(919001,919011,'readiness','',1,20);
 IF result->>'total'<>'2' OR result::text NOT LIKE '%policy-missing%' OR result::text NOT LIKE '%workshop-hold%'
    OR result::text LIKE '%Secret%' OR result::text LIKE '%T19-HIDDEN%' THEN
   RAISE EXCEPTION 'Readiness policy or protected hold mismatch: %',result;
 END IF;
 result:=public.t19_work_queue(919001,919011,'proof','FOP-T19-301',1,20);
 IF result->>'total'<>'1' OR result#>>'{rows,0,state}'<>'signed-proof-required'
    OR result#>>'{rows,0,href}'<>'/modules/fleet/operations/919301'
    OR result::text LIKE '%Private trip%' THEN
   RAISE EXCEPTION 'Signed delivery follow-up mismatch: %',result;
 END IF;
 IF public.t19_work_queue(919001,919011,'discrepancy','',2,20)->>'total'<>'27' THEN
   RAISE EXCEPTION 'Fleet queue lost the exact total across 20-row pages';
 END IF;
 result:=public.t19_work_queue(919001,919011,'discrepancy','Fleet work #919301',1,20);
 IF result->>'total'<>'1' OR result#>>'{rows,0,state}'<>'signed-proof-required'
    OR result#>>'{rows,0,href}'<>'/modules/fleet/time?order=919301&before=919302' THEN
   RAISE EXCEPTION 'Signed Fleet timesheet follow-up mismatch: %',result;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.t08_fleet_order_time(919301)->'work') row
     WHERE row->>'id'='919301')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t08_fleet_order_time(919301,919302)->'work') row
     WHERE row->>'id'='919301') THEN
   RAISE EXCEPTION 'Queue source cursor did not land on an older item absent from the owner first page';
 END IF;
 BEGIN PERFORM public.t19_work_queue(919001,919011,'workshop','',1,20);
   RAISE EXCEPTION 'Custody could read workshop findings'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t19_actor(6);
 result:=public.t19_work_queue(919001,919011,'workshop','',1,20);
 IF result->>'total'<>'2' OR result#>>'{rows,0,state}'<>'overdue' OR result#>>'{rows,0,overdue_days}'<>'2'
    OR result#>>'{rows,1,state}'<>'assessment-due'
    OR result#>>'{rows,1,href}'<>'/modules/workshop?asset=919301&before=919302' OR result::text LIKE '%Secret%' THEN
   RAISE EXCEPTION 'Workshop source, inactive reminder or PM age mismatch: %',result;
 END IF;
 PERFORM pg_temp.t19_actor(7);
 result:=public.t19_work_queue(919001,919011,'recovery','',1,20);
 IF result->>'total'<>'1' OR result#>>'{rows,0,state}'<>'hr-review'
    OR result#>>'{rows,0,href}' NOT LIKE '%&case=919301' OR result::text LIKE '%1234.78%'
    OR result::text LIKE '%SECRET%' THEN
   RAISE EXCEPTION 'Recovery mapping or amount masking mismatch: %',result;
 END IF;
 result:=public.t19_work_queue(919001,919011,'payroll','',1,20);
 IF result->>'total'<>'1' OR result#>>'{rows,0,state}'<>'review-required'
    OR result#>>'{rows,0,href}' NOT LIKE '%month=2026-10&version=91900000-0000-4000-8003-000000000001' THEN
   RAISE EXCEPTION 'Payroll gap source mismatch: %',result;
 END IF;
 result:=public.t19_work_queue(919001,919011,'payment','',1,20);
 IF result->>'total'<>'1' OR result#>>'{rows,0,state}'<>'pending'
    OR result#>>'{rows,0,href}' NOT LIKE '%&employee=919101&after=919100' OR result::text LIKE '%SECRET%'
    OR result::text LIKE '%1999.37%' OR result::text LIKE '%919102%' THEN
   RAISE EXCEPTION 'Payment status, paid removal or sensitive-data masking mismatch: %',result;
 END IF;
 result:=public.t19_work_queue(919001,919011,'exit','',1,20);
 IF result->>'total'<>'1' OR result#>>'{rows,0,state}'<>'notice_served'
    OR result#>>'{rows,0,href}'<>'/admin/hr/actions/final-settlement?scope=919001.919011&eos=919301'
    OR result::text LIKE '%Secret%' THEN
   RAISE EXCEPTION 'Exit case scope or open state mismatch: %',result;
 END IF;
END $$;
DO $global$
DECLARE scopes jsonb; result jsonb; fixture_scope_count integer; lane text;
BEGIN
 PERFORM pg_temp.t19_actor(8);
 IF NOT public.current_user_has_role('system_admin') THEN
   RAISE EXCEPTION 'Fixture did not receive the reserved Global System role';
 END IF;
 scopes:=public.t19_queue_scopes();
 SELECT count(*) INTO fixture_scope_count FROM jsonb_array_elements(scopes) s
 WHERE (s->>'company')::bigint IN(919001,919002,919003);
 IF fixture_scope_count<>5 OR NOT(scopes @> '[
   {"company":919001,"branch":null,"kinds":["pro"]},
   {"company":919001,"branch":919011,"kinds":["pro","custody","readiness","proof","discrepancy","workshop","recovery","payroll","payment","exit"]},
   {"company":919001,"branch":919012},
   {"company":919002,"branch":null},
   {"company":919002,"branch":919021}]') THEN
   RAISE EXCEPTION 'Global System Administrator should discover all active queue scopes: %',scopes;
 END IF;

 IF public.t19_work_queue(919001,919012,'pro','',1,20)#>>'{rows,0,source_id}' IS DISTINCT FROM '919205'
    OR public.t19_work_queue(919002,919021,'pro','',1,20)#>>'{rows,0,source_id}' IS DISTINCT FROM '919206' THEN
   RAISE EXCEPTION 'Global queue could not read the sibling branch and other company';
 END IF;
 FOREACH lane IN ARRAY ARRAY['pro','custody','readiness','proof','discrepancy','workshop','recovery','payroll','payment','exit'] LOOP
   result:=public.t19_work_queue(919001,919011,lane,'',1,20);
   IF (result->>'total')::int<1 OR result::text ILIKE ANY(ARRAY['%secret%','%1234.78%','%1999.37%','%Private trip%','%Visa review 100%%']) THEN
     RAISE EXCEPTION 'Global queue lane % was empty or exposed restricted detail: %',lane,result;
   END IF;
 END LOOP;
 result:=public.t19_work_queue(919001,919011,'pro','PRO process',2,2);
 IF result->>'total' IS DISTINCT FROM '3' OR result#>>'{rows,0,source_id}' IS DISTINCT FROM '919203'
    OR result#>>'{rows,0,assignee}' IS NOT NULL
    OR public.t19_work_queue(919001,919011,'pro','Visa review',1,20)->>'total' IS DISTINCT FROM '0' THEN
   RAISE EXCEPTION 'Global queue did not page and search only the masked summary: %',result;
 END IF;

 BEGIN PERFORM public.t19_work_queue(919001,919021,'all','',1,20);
   RAISE EXCEPTION 'Global queue accepted a mismatched company and branch'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.t19_work_queue(919001,919013,'all','',1,20);
   RAISE EXCEPTION 'Global queue accepted a closed branch'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.t19_work_queue(919003,NULL,'all','',1,20);
   RAISE EXCEPTION 'Global queue accepted an inactive company'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.t15_payroll_review_command(gen_random_uuid(),919001,919011,'approve',jsonb_build_object('reason','Synthetic queue observer','digest',repeat('a',64)));
   RAISE EXCEPTION 'Global queue access granted payroll approval'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM pg_temp.t19_actor(9);
 IF public.t19_queue_scopes()<>'[]' THEN RAISE EXCEPTION 'Legacy group role received the global queue overview'; END IF;
END $global$;
RESET ROLE;
UPDATE public.user_roles SET is_active=false WHERE user_profile_id=pg_temp.t19_profile(8);
SET LOCAL ROLE authenticated;
DO $revoked_global$
BEGIN
 PERFORM pg_temp.t19_actor(8);
 IF public.t19_queue_scopes()<>'[]' THEN RAISE EXCEPTION 'Revoked global role retained queue scopes'; END IF;
 BEGIN PERFORM public.t19_work_queue(919001,919011,'all','',1,20);
   RAISE EXCEPTION 'Revoked global role retained queue reads'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $revoked_global$;
RESET ROLE;
DELETE FROM auth.sessions WHERE user_id='91900000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 PERFORM pg_temp.t19_actor(1);
 BEGIN PERFORM public.t19_queue_scopes();
   RAISE EXCEPTION 'Revoked session was accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
\echo T19 role queues native assertions passed
