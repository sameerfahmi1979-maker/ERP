import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261015184500_perf_advisory_risk_select_initplans.sql","utf8");
it("optimizes only one SELECT policy without granting rights or changing writes/helpers",()=>{
 expect(sql.match(/ALTER POLICY/g)).toHaveLength(1);expect(sql).toContain("ALTER POLICY erp_ai_risk_scores_select");
 expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|CREATE FUNCTION|CREATE OR REPLACE FUNCTION|DROP POLICY|ALTER TABLE)\b/i);
 expect(sql).toContain("helper.provolatile<>'s'");expect(sql).toContain("Risk SELECT authority preimage changed");
 for(const expression of ["(SELECT public.current_user_has_permission('ai.risk.view'))","(SELECT public.current_user_has_permission('ai.common.admin'))","(SELECT public.current_user_has_role('system_admin'))"])expect(sql).toContain(expression);
 expect(sql).toContain("with_check=qual");expect(sql).toContain("Risk authority changed beyond SELECT evaluation shape");
});
it("audit optimization caches only global admission and keeps company/branch checks row-dependent",()=>{
 const audit=readFileSync("supabase/migrations/20261015190000_perf_audit_global_select_initplan.sql","utf8");
 expect(audit.match(/ALTER POLICY/g)).toHaveLength(1);expect(audit).toContain("(SELECT public.current_user_is_global_admin())");
 expect(audit).toContain("OR public.current_user_has_permission_in_company('audit.view',owner_company_id)");
 expect(audit).toContain("OR (branch_id IS NOT NULL AND public.current_user_has_permission_in_branch('audit.view',branch_id))");
 expect(audit).not.toMatch(/SELECT public.current_user_has_permission_in_(?:company|branch)/);
 expect(audit).toContain("Audit SELECT authority preimage changed");expect(audit).toContain("Audit authority changed beyond SELECT evaluation shape");
});
