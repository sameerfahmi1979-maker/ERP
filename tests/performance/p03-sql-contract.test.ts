import {expect,it} from "vitest";
import fs from "node:fs";
const read=(name:string)=>fs.readFileSync(`supabase/migrations/${name}.sql`,"utf8");
const source=read("20261006125436_perf_p03_protected_document_statement_scope");
const computed=read("20261006123609_perf_p03_document_tag_count");
it("guards reviewed security preimages and preserves statement-local authorization",()=>{
 for(const name of ["read_documents()","hr_document_evidence_allowed(bigint)","recruitment_document_evidence_allowed(bigint)","candidate_permission(bigint,text)","readable_employee_ids()"])
  expect(source).toContain(`'erp_private.${name}'::regprocedure`);
 expect(source).toContain("RAISE EXCEPTION");expect(source).toContain("principal AS MATERIALIZED");
 expect(source).toContain("actor.uid IS NOT NULL AND actor.active");
 expect(source.replace(/--[^\n]*/g,"")).not.toMatch(/ALTER POLICY|DISABLE.*TRIGGER|GRANT /i);
});
it("every frozen HR evidence table remains in the optimized linked-subject gate",()=>{
 const frozen=read("20260923084150_f03_medical_insurance_and_linked_evidence");
 const body=frozen.split("CREATE OR REPLACE FUNCTION erp_private.hr_document_evidence_allowed")[1].split("$$;")[0];
 const tables=[...body.matchAll(/FROM public\.(\w+)/g)].map(m=>m[1]);expect(tables).toHaveLength(14);
 for(const table of tables)expect(source).toContain(`FROM public.${table} WHERE deleted_at IS NULL`);
 expect(source).toContain("THEN erp_private.hr_document_evidence_allowed(d.id) ELSE true END");
 for(const table of ["hr_candidate_documents","hr_candidates","hr_offers","hr_onboarding_tasks","employee_medical_records","employee_dependents","dms_document_links"])expect(source).toContain(`public.${table}`);
 expect(source).toContain("THEN erp_private.recruitment_document_evidence_allowed(d.id) ELSE true END");
});
it("retains all frozen protected-content masks and assignment-local preview scope",()=>{
 for(const field of ["ai_summary","content_tsv","summary_embedding","ai_summary_error","summary_embedding_error","ai_warnings_json","ai_risk_reasons_json"])expect(source).toContain(`'${field}'`);
 expect(source).toContain("s.permission_code='dms.documents.preview'");
 expect(source).toContain("s.owner_company_id=d.owning_company_id");expect(source).toContain("s.branch_id=d.owning_branch_id");
});
it("computed predicates and content search are invokers with no anonymous or service grant",()=>{
 expect(computed.match(/SECURITY INVOKER/g)).toHaveLength(4);
 expect(computed).not.toContain("SECURITY DEFINER");
 expect(computed.match(/TO authenticated/g)).toHaveLength(3);
 expect(computed).toContain("FROM PUBLIC,anon,service_role");
 expect(computed).toContain("FROM public.f03_read_documents() d");expect(computed).toContain("BETWEEN 1 AND 200");
 expect(computed).not.toMatch(/TO (anon|service_role|PUBLIC)/);
});
