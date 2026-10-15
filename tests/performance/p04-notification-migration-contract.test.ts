import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
const migration=readFileSync("supabase/migrations/20261014065706_perf_item4_statement_permission_reads.sql","utf8");
it("constant permission optimization requires exact existing authority and stable helpers",()=>{
 expect(migration).toContain("md5(policy.qual)<>target.hash");expect(migration).toContain("policy.with_check IS NOT NULL");expect(migration).toContain("permissive='RESTRICTIVE'");expect(migration).toContain("provolatile");expect(migration.match(/^ALTER POLICY /gm)).toHaveLength(9);
 expect(migration).not.toMatch(/^\s*(?:CREATE (?:OR REPLACE )?FUNCTION|ALTER TABLE .*DISABLE ROW LEVEL|GRANT |DROP POLICY)/im);
});
it("row-dependent document predicates are not turned into uncorrelated global decisions",()=>{
 expect(migration).toContain("erp_private.document_permission(document_id,'dms.admin')");expect(migration).toContain("recipient_user_id=(SELECT public.current_user_profile_id())");expect(migration).not.toMatch(/ALTER POLICY f03_document_subject/);
});
it("DMS label materialization retains the identical caller-RLS table source",()=>{
 const sql=readFileSync("supabase/migrations/20261014062836_perf_notification_list_projections.sql","utf8");expect(sql).toContain("security_invoker=true,security_barrier=true");expect(sql).toContain("documents AS MATERIALIZED");expect(sql).toContain("SELECT id,document_no FROM public.dms_documents");expect(sql).not.toContain("SECURITY DEFINER");
});
it("subject sets require the exact F03 protected reader and retain original write predicates",()=>{
 const sql=readFileSync('supabase/migrations/20261014072522_perf_dms_notification_subject_sets.sql','utf8');
 expect(sql).toContain("current_user<>'postgres'");expect(sql).toContain("md5(p.prosrc)");
 expect(sql).toContain("erp_private.read_documents() d");expect(sql).toContain("All authorized documents, including ones with no notification yet");
 expect(sql).toContain("AS RESTRICTIVE FOR SELECT");expect(sql).toContain("AS RESTRICTIVE FOR INSERT");expect(sql).toContain("AS RESTRICTIVE FOR UPDATE");expect(sql).toContain("AS RESTRICTIVE FOR DELETE");
 expect(sql).toContain("WITH CHECK(erp_private.document_permission(document_id,'dms.documents.view'))");
 expect(sql).toContain("REVOKE ALL ON FUNCTION erp_private.perf_notification_document_ids(text) FROM PUBLIC,anon,authenticated,service_role");
 expect(sql).not.toMatch(/CREATE OR REPLACE|ALTER POLICY f03_principal|DISABLE ROW LEVEL SECURITY|GRANT.*service_role/);
});
