-- Append to t03-employment-lifecycle.native.sql before its ROLLBACK.
-- T03 has applied the independently approved 920011 -> 920012 branch transfer.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
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
 IF public.mobile_hr_v5_calendar(pg_temp.t03_day(-12),pg_temp.t03_day(0),1,920001,920012,920001,'') IS NULL THEN
  RAISE EXCEPTION 'Receiving branch lost the selected Mobile HR leave opening'; END IF;
 RAISE NOTICE 'PASS: mobile authority follows canonical independently approved T03 branch transfer';
END $$;
RESET ROLE;
