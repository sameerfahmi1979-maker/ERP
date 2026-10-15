import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
const sql=readFileSync("supabase/migrations/20261013110056_perf_hr_payroll_counted_inquiry.sql","utf8");
it("keeps the public payroll API invoker-only and fails closed on authority drift",()=>{
 const api=sql.slice(sql.indexOf("CREATE FUNCTION public.perf_hr_payroll_inquiry"));
 expect(api).toContain("SECURITY INVOKER");expect(api).not.toContain("SECURITY DEFINER");expect(api).toContain("SET search_path = ''");expect(api).toContain("SET row_security = on");
 expect(api).toContain("current_user <> 'authenticated'");expect(api).toContain("f03_current_session_valid()");expect(sql).toContain("Unreviewed F03 payroll authority");expect(sql).toContain("Unreviewed payroll SELECT policy");
 expect(/DISABLE ROW LEVEL SECURITY|BYPASSRLS|CREATE OR REPLACE FUNCTION|ALTER ROLE|GRANT ALL/i.test(sql.replace(/--[^\n]*/g,""))).toBe(false);
});
it("optimizes only five SELECT policies and preserves exact individual assignment and linked-identity boundaries",()=>{
 expect(sql.match(/ALTER POLICY/g)).toHaveLength(5);expect(sql).not.toMatch(/DROP POLICY|FOR (INSERT|UPDATE|DELETE)|WITH CHECK/i);
 expect(sql).toContain("AND e.branch_id IS NOT DISTINCT FROM a.branch_id");expect(sql).toContain("ur.is_active AND p.permission_code IN ($1,$1||'.self',$1||'.team')");
 expect(sql).toContain("g.owner_company_id=e.owner_company_id AND (g.branch_id IS NULL OR g.branch_id=e.branch_id)");expect(sql).toContain("e.id<>e.reporting_manager_id");
 expect(sql).toContain("$1 IN ('hr.payroll.view','hr.banking.view')");expect(sql).toContain("REVOKE ALL ON FUNCTION erp_private.payroll_subject_ids(text) FROM PUBLIC,anon,service_role");
 const wps=sql.split("ALTER POLICY emp_wps_profile_select")[1].split("CREATE FUNCTION public.")[0];expect(wps).toContain("readable_employee_ids()");expect(wps).toContain("payroll_subject_ids('hr.payroll.view')");expect(wps).toContain("payroll_subject_ids('hr.banking.view')");
});
it("counts and orders the complete authorized set before applying a bounded page",()=>{
 expect(sql.match(/'totalCount',\(SELECT COUNT\(\*\) FROM filtered\)/g)).toHaveLength(2);
 expect(sql.match(/LIMIT p_page_size OFFSET v_offset/g)).toHaveLength(2);expect(sql).toContain("p_page_size NOT BETWEEN 1 AND 100");
 expect(sql).toContain("GROUP BY c.employee_id");expect(sql).not.toContain("LIMIT 1000");
});
