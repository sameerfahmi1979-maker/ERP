import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
const sql=readFileSync("supabase/migrations/20261014030458_perf_candidate_document_subject_set.sql","utf8");
const projection=readFileSync("supabase/migrations/20261014040457_perf_candidate_document_read_projection.sql","utf8");
it("candidate document metadata view retains invoker RLS and grants only authenticated SELECT",()=>{
 expect(projection).toContain("WITH (security_invoker=true)");
 expect(projection).toContain("WITH documents AS MATERIALIZED");
 expect(projection).toContain("FROM erp_private.read_documents()");
 expect(projection).toContain("FROM public.hr_candidate_documents c LEFT JOIN documents d ON d.id=c.dms_document_id");
 expect(projection).toContain("REVOKE ALL ON public.perf_hr_candidate_document_reads FROM PUBLIC,anon,authenticated");
 expect(projection).toContain("GRANT SELECT ON public.perf_hr_candidate_document_reads TO authenticated");
 expect(projection).not.toMatch(/GRANT (ALL|INSERT|UPDATE|DELETE)|SECURITY DEFINER|DISABLE ROW LEVEL SECURITY/i);
});
it("projection checks exact visibility-policy and live-principal prerequisites",()=>{
 expect(projection).toContain("md5(qual)='283b1c18b03113eba8630bba7de22140'");
 expect(projection).toContain("policyname='f03_principal'");
 expect(projection).toContain("Reviewed candidate document visibility prerequisite drift");
 expect(projection).toContain("to_regclass('public.perf_hr_candidate_document_reads') IS NOT NULL");
});
it("intersects the candidate and confidential document visibility sets without changing writes",()=>{
 const change=sql.slice(sql.indexOf("ALTER POLICY"));
 expect(change).toContain("candidate_id IN (SELECT id FROM erp_private.read_hr_candidates())");
 expect(change).toContain("AND dms_document_id IN (SELECT id FROM erp_private.read_documents())");
 expect(sql.match(/ALTER POLICY/g)).toHaveLength(1);
 expect(change).not.toMatch(/CREATE|GRANT|REVOKE|DROP|WITH CHECK|FOR (INSERT|UPDATE|DELETE)/i);
});
it("fails closed on helper, policy and live-principal drift without changing grants",()=>{
 expect(sql).toContain("Candidate document authority prerequisite drift");
 expect(sql).toContain("Candidate document SELECT policy or principal gate drift");
 expect(sql).toContain("actual.proretset<>expected.returns_set");
 expect(sql).toContain("actual.prorettype<>to_regtype(expected.return_type)");
 expect(sql).toContain("actual.proconfig IS DISTINCT FROM ARRAY['search_path=\"\"']");
 expect(sql).toContain("policyname='f03_principal'");
 expect(sql).toContain("AND with_check=qual");
 expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY|BYPASSRLS|ALTER ROLE|CREATE.*FUNCTION/i);
});
it("expands only the pinned document projection evidence call and keeps offer payroll and onboarding gates",()=>{
 expect(sql).toContain("pg_get_functiondef('erp_private.read_documents_filtered_v2(bigint[],text[],text[])'::regprocedure)");
 expect(sql).toContain("replace(definition,'AND erp_private.perf_recruitment_document_subjects_allowed(d.id)'");
 expect(sql).toContain("c.candidate_id NOT IN (SELECT id FROM visible_candidates)");
 expect(sql).toContain("WITH visible_candidates AS MATERIALIZED (SELECT id FROM erp_private.read_hr_candidates())");
 expect(sql).toContain("erp_private.permission_in_scope('hr.payroll.view',o.owner_company_id,o.branch_id)");
 expect(sql).toContain("o.offer_document_id IS NOT NULL AND o.offer_document_id=d.id");
 expect(sql).toContain("t.dms_document_id IS NOT NULL AND t.dms_document_id=d.id");
 expect(sql).toContain("NOT erp_private.onboarding_permission(t.candidate_id,t.employee_id,'hr.recruitment.view')");
 expect(sql).toContain("IF expanded=definition THEN RAISE EXCEPTION");
});
