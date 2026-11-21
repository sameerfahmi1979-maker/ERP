-- Run after the T04 and Mobile managed-leave fixtures in their rollback transaction.
CREATE FUNCTION pg_temp.mobile_active_annual() RETURNS jsonb LANGUAGE sql AS $$
 SELECT r FROM jsonb_array_elements(public.mobile_hr_leave_read(920001,'balances',0)) r
 WHERE r->>'source'='t04' AND pg_temp.t04_day(0) BETWEEN (r->>'period_start')::date AND (r->>'period_end')::date;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS mobile_balance_claims \gset
DO $$
BEGIN
 IF pg_temp.mobile_active_annual()->>'known' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Mobile HR did not return the verified T04 annual balance';
 END IF;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{}',true);
-- Use a self-service employee with leave access and without a profile grant.
DELETE FROM public.user_roles ur USING public.user_profiles u,public.roles r
 WHERE ur.user_profile_id=u.id AND ur.role_id=r.id AND r.role_code IN ('t04_pro','t04_roster')
  AND u.auth_user_id='96000000-0000-4000-8000-000000000006';
DELETE FROM public.role_permissions rp USING public.roles r,public.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.role_code='employee_self_service' AND p.permission_code='hr.employees.view.self';
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
 WHERE r.role_code IN ('t04_sibling','t04_payroll') AND p.permission_code='hr.leave.view' ON CONFLICT DO NOTHING;
INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,owner_company_id,branch_id,joining_date,employee_category_id)
 OVERRIDING SYSTEM VALUE VALUES(920004,'T00-E04','Synthetic same-branch coworker','male','1994-02-01',920001,920011,'2024-03-04',920001);

SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS mobile_balance_claims \gset
DO $$
DECLARE before jsonb := pg_temp.mobile_active_annual();
DECLARE after_expiry jsonb;
DECLARE pending jsonb;
DECLARE approved jsonb;
DECLARE cancelled jsonb;
DECLARE quote jsonb;
DECLARE submit jsonb;
DECLARE cancel jsonb;
DECLARE mobile_request jsonb;
DECLARE case_id bigint;
DECLARE paid numeric;
DECLARE day_from date := pg_temp.t04_day(76);
DECLARE day_to date;
DECLARE carried numeric := (before->>'carry_forward_days')::numeric;
BEGIN
 IF public.current_user_can_view_employee(920001) OR before->>'known' IS DISTINCT FROM 'true'
   OR carried IS NULL OR carried<=0 OR before->>'earned_days' IS NULL THEN
  RAISE EXCEPTION 'Verified own-domain balance did not include earned and carried-forward days'; END IF;
 PERFORM pg_temp.t04_actor(3);
 IF pg_temp.mobile_active_annual() IS DISTINCT FROM before
   OR (public.t04_leave_balance(920001,pg_temp.t04_day(0))->>'available') IS DISTINCT FROM before->>'available_days' THEN
  RAISE EXCEPTION 'Scoped staff, Employee HR and Mobile HR disagree about the ledger'; END IF;
 PERFORM pg_temp.t04_actor(5);
 BEGIN PERFORM public.mobile_hr_leave_read(920001,'balances',0);
  RAISE EXCEPTION 'Sibling branch read an employee balance'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t04_actor(4);
 BEGIN PERFORM public.mobile_hr_leave_read(920003,'balances',0);
  RAISE EXCEPTION 'Scoped ordinary role opened another company'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t04_actor(6);
 BEGIN PERFORM public.mobile_hr_leave_read(920004,'balances',0);
  RAISE EXCEPTION 'Self-service actor read a same-branch coworker'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Move the synthetic carry fund to its expiry boundary. The approved T04
 -- movement remains present, and only the available carry and total change.
 RESET ROLE;
 UPDATE erp_private.f12_leave_movements SET expires_before=pg_temp.t04_day(0)
 WHERE entitlement_id=current_setting('t04.active')::bigint AND effect='carry-in';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t04_actor(6);
 after_expiry:=pg_temp.mobile_active_annual();
 IF (after_expiry->>'carry_forward_days')::numeric IS DISTINCT FROM 0
   OR (after_expiry->>'available_days')::numeric IS DISTINCT FROM (before->>'available_days')::numeric-carried
   OR after_expiry->'used_days' IS DISTINCT FROM before->'used_days' THEN
  RAISE EXCEPTION 'Expired carry changed posted usage or remained available'; END IF;

 day_to:=day_from+floor((after_expiry->>'available_days')::numeric)::integer;
 PERFORM pg_temp.t04_actor(1);
 quote:=public.t04_leave_preview(920001,'annual',day_from,day_to);
 paid:=(quote->>'paid_days')::numeric;
 IF paid IS NULL OR paid<=0 OR (quote->>'unpaid_days')::numeric IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'Mixed paid/unpaid scenario did not resolve'; END IF;
 submit:=jsonb_build_object('employeeId',920001,'operationId',pg_temp.t04_op(950),'leaveTypeId',960001,
  'startDate',day_from,'endDate',day_to,'reason','Synthetic mixed balance test');
 PERFORM pg_temp.t04_actor(6);
 mobile_request:=public.mobile_hr_command_v1('leave.submit',submit);
 pending:=pg_temp.mobile_active_annual();
 IF (pending->>'reserved_days')::numeric IS DISTINCT FROM (after_expiry->>'reserved_days')::numeric+paid
   OR (pending->>'available_days')::numeric IS DISTINCT FROM (after_expiry->>'available_days')::numeric-paid
   OR pending->'used_days' IS DISTINCT FROM after_expiry->'used_days'
   OR public.mobile_hr_command_v1('leave.submit',submit) IS DISTINCT FROM mobile_request||'{"replayed":true}'
   OR pg_temp.mobile_active_annual() IS DISTINCT FROM pending THEN
  RAISE EXCEPTION 'Pending mixed leave did not reserve only the verified paid dates once'; END IF;

 PERFORM pg_temp.t04_actor(1);
 SELECT (r->>'id')::bigint INTO STRICT case_id FROM jsonb_array_elements(public.t04_list_leave_requests(920001)) r
 WHERE r->>'from'=day_from::text AND r->>'status'='pending';
 PERFORM public.t04_leave_command(920001,case_id,'review','{"revision":1}',pg_temp.t04_op(951));
 PERFORM pg_temp.t04_actor(2);
 approved:=public.t04_leave_command(920001,case_id,'approve','{"revision":2}',pg_temp.t04_op(952));
 IF public.t04_leave_command(920001,case_id,'approve','{"revision":2}',pg_temp.t04_op(952)) IS DISTINCT FROM approved||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Approval retry lost its original receipt'; END IF;
 PERFORM pg_temp.t04_actor(6);
 approved:=pg_temp.mobile_active_annual();
 IF approved->'reserved_days' IS DISTINCT FROM after_expiry->'reserved_days'
   OR approved->'available_days' IS DISTINCT FROM pending->'available_days'
   OR (approved->>'used_days')::numeric IS DISTINCT FROM (after_expiry->>'used_days')::numeric+paid THEN
  RAISE EXCEPTION 'Mobile balance charged the reservation twice or included unpaid dates'; END IF;

 PERFORM pg_temp.t04_actor(2);
 cancel:=jsonb_build_object('revision',3,'reason','Synthetic reversal of the approved request');
 cancelled:=public.t04_leave_command(920001,case_id,'cancel',cancel,pg_temp.t04_op(953));
 IF public.t04_leave_command(920001,case_id,'cancel',cancel,pg_temp.t04_op(953)) IS DISTINCT FROM cancelled||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Reversal retry lost its original receipt'; END IF;
 PERFORM pg_temp.t04_actor(6);
 IF pg_temp.mobile_active_annual() IS DISTINCT FROM after_expiry THEN RAISE EXCEPTION 'Approved reversal did not restore the same available balance'; END IF;

 mobile_request:=public.mobile_hr_command_v1('leave.submit',submit||jsonb_build_object('operationId',pg_temp.t04_op(954)));
 IF pg_temp.mobile_active_annual() IS DISTINCT FROM pending THEN RAISE EXCEPTION 'New authorized reservation did not reach the card'; END IF;
 cancel:=jsonb_build_object('employeeId',920001,'operationId',pg_temp.t04_op(955),'id',mobile_request->'id',
  'revision',mobile_request->'revision','reason','Synthetic withdrawal');
 cancelled:=public.mobile_hr_command_v1('leave.cancel',cancel);
 IF public.mobile_hr_command_v1('leave.cancel',cancel) IS DISTINCT FROM cancelled||'{"replayed":true}'
  OR pg_temp.mobile_active_annual() IS DISTINCT FROM after_expiry THEN RAISE EXCEPTION 'Withdrawal or retry failed to release exactly the reservation'; END IF;
 RAISE NOTICE 'PASS: mobile balances follow T04 for self and authorized staff, carry expiry, mixed reservation, approval, reversal and withdrawal';
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL session_replication_role=replica;
-- Three historical shapes were already supported by the legacy source.
INSERT INTO public.employee_leave_balances(employee_id,leave_type_id,leave_year,entitled_days,used_days,period_start,period_end,period_basis)
VALUES (920001,960001,2026,30,0,'2026-02-28','2027-02-27','joining_anniversary'),
       (920001,960001,2027,30,0,'2027-01-01','2027-12-31','calendar_year'),
       (920001,960001,2025,30,0,NULL,NULL,NULL);
INSERT INTO public.hr_leave_types(id,code,name_en,requires_document,reset_basis) OVERRIDING SYSTEM VALUE
VALUES (960004,'MHR_CAL','Synthetic calendar leave',false,'calendar_year');
INSERT INTO public.employee_leave_balances(employee_id,leave_type_id,leave_year,entitled_days,used_days,period_start,period_end,period_basis)
 SELECT 920001,960004,y,10,0,make_date(y,1,1),make_date(y,12,31),'calendar_year' FROM generate_series(1950,1979) y;
SET LOCAL session_replication_role=origin;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS mobile_balance_claims \gset
DO $$
DECLARE first_page jsonb := public.mobile_hr_leave_read(920001,'balances',0);
DECLARE cursor_id bigint := (first_page->24->>'id')::bigint;
DECLARE second_page jsonb := public.mobile_hr_leave_read(920001,'balances',cursor_id);
DECLARE complete jsonb := (first_page-25)||second_page;
BEGIN
 IF jsonb_array_length(first_page)<>26 OR jsonb_array_length(second_page)<2 OR second_page->0 IS DISTINCT FROM first_page->25
   OR jsonb_array_length(complete)<>(SELECT count(DISTINCT r->'id') FROM jsonb_array_elements(complete) r)
   OR (SELECT count(*) FROM jsonb_array_elements(complete) r WHERE r->>'label'='Synthetic calendar leave'
      AND r->>'known'='true' AND (r->>'entitled_days')::numeric=10 AND (r->>'used_days')::numeric=0)<>30 THEN
  RAISE EXCEPTION 'Mixed balances duplicated or skipped an ID, or changed the unmanaged calculation'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(complete) r WHERE r->>'label'='Annual leave' AND r->>'period_start'='2026-02-28')<>1
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(complete) r WHERE r->>'source'='legacy' AND r->>'period_start'='2026-02-28')
   OR (SELECT count(*) FROM jsonb_array_elements(complete) r WHERE r->>'source'='legacy' AND r->>'review_reason' IS NOT NULL
     AND r->'entitled_days'='null' AND r->'used_days'='null' AND r->'reserved_days'='null')<>2
   OR (SELECT count(*) FROM jsonb_array_elements(complete) r WHERE r->>'source'='t04' AND r->>'period_end'='2026-02-27'
     AND r->>'known'='true' AND (r->>'available_days')::numeric=0)<>1 THEN
  RAISE EXCEPTION 'Exact overlaps, partial/unknown-date overlaps or ended periods rendered incorrect balances'; END IF;
 IF public.mobile_hr_leave_read(920001,'balances',(complete->-1->>'id')::bigint)<>'[]' THEN
  RAISE EXCEPTION 'The last page did not exhaust the sorted keys'; END IF;
 IF has_function_privilege('authenticated','erp_private.mobile_hr_balance_page(bigint,bigint)','EXECUTE')
  OR has_function_privilege('anon','public.mobile_hr_leave_read(bigint,text,bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'Balance projection bypasses the existing Mobile HR access boundary'; END IF;
 PERFORM pg_temp.t04_actor(3);
 IF (SELECT r-'label'-'source' FROM jsonb_array_elements(complete) r WHERE r->>'leave_type_id'='960002')
   IS DISTINCT FROM (SELECT r FROM jsonb_array_elements(public.f12_leave_period_balances(920001,0)) r WHERE r->>'leave_type_id'='960002') THEN
  RAISE EXCEPTION 'Unmanaged approved sick period differs from the canonical F12 calculation'; END IF;
 RAISE NOTICE 'PASS: historical period boundaries, overlapping legacy warnings, exact suppression, unmanaged balances and stable paging';
END;
$$;
RESET ROLE;
