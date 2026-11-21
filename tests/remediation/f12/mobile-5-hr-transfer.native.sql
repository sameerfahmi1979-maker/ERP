-- Append to t03-employment-lifecycle.native.sql before its ROLLBACK.
-- T03 has applied the independently approved 920011 -> 920012 branch transfer.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.hr_leave_types(code,name_en,requires_document,reset_basis)
 VALUES ('M5_T03','Synthetic transfer leave',false,'calendar_year');
CREATE TEMP TABLE transfer_mobile_event AS
 WITH saved AS (
  INSERT INTO public.employee_leave_requests(employee_id,leave_type_id,start_date,end_date,total_days,approval_status)
   SELECT 920001,id,pg_temp.t03_day(-5),pg_temp.t03_day(-5),1,'approved'
   FROM public.hr_leave_types WHERE code='M5_T03' RETURNING id
 ) SELECT id FROM saved;
GRANT SELECT ON transfer_mobile_event TO authenticated;
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
 WHERE r.role_code='t03_accept' AND p.permission_code='hr.leave.view' ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 PERFORM pg_temp.t03_actor(2);
 BEGIN
  PERFORM public.mobile_hr_v5_calendar(pg_temp.t03_day(-12),pg_temp.t03_day(0),1,920001,920011,920001,'');
  RAISE EXCEPTION 'Former branch retained a selected Mobile HR leave opening';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t03_actor(4);
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(public.mobile_hr_v5_calendar(
   pg_temp.t03_day(-12),pg_temp.t03_day(0),1,920001,920012,920001,'')) r
   JOIN transfer_mobile_event e ON e.id=(r->>'id')::bigint
   WHERE r->>'employeeId'='920001' AND r->>'label'='Synthetic transfer leave') THEN
  RAISE EXCEPTION 'Receiving branch lost the transferred employee leave event'; END IF;
 RAISE NOTICE 'PASS: mobile authority follows canonical independently approved T03 branch transfer';
END $$;
RESET ROLE;
