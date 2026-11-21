
-- Append after retaining the synthetic T16 issue and accepting its bank lane.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t17_issuer','Synthetic payslip issuer',false),('t17_reader','Synthetic payslip reader',false),
 ('t17_deliver','Synthetic payslip delivery',false),('t17_without_view','Synthetic issue without payslip view',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t17_issuer',ARRAY['hr.payroll.view','hr.payroll.payslip.view','hr.payroll.payslip.issue']),
 ('t17_reader',ARRAY['hr.payroll.view','hr.payroll.payslip.view']),
 ('t17_deliver',ARRAY['hr.payroll.view','hr.payroll.payslip.view','hr.payroll.payslip.deliver']),
 ('t17_without_view',ARRAY['hr.payroll.view','hr.payroll.payslip.issue'])
) items(code,caps) JOIN public.roles r ON r.role_code=items.code JOIN public.permissions p ON p.permission_code=ANY(items.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(a.actor),r.id,a.company,a.branch,true
FROM (VALUES (2,'t17_issuer',920001,920011),(3,'t17_without_view',920001,920011),(4,'t17_reader',920001,920011),
 (5,'t17_issuer',920001,920011),(6,'t17_issuer',920001,920012),(7,'t17_deliver',920001,920011),
 (9,'t17_issuer',920002,920021)
) a(actor,role,company,branch) JOIN public.roles r ON r.role_code=a.role;
