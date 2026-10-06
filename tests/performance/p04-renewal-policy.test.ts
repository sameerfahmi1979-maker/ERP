import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {expect,it} from "vitest";

const migration=readFileSync("supabase/migrations/20261006155439_perf_p04_renewal_read_scope.sql","utf8");
const dependency=readFileSync("supabase/migrations/20261006125436_perf_p03_protected_document_statement_scope.sql","utf8");

it("binds the renewal read policy to the reviewed P03 document projection",()=>{
 const body=dependency.split("AS $$")[1].split("$$;")[0].replaceAll("\r\n","\n");
 const digest=createHash("md5").update(body).digest("hex");
 expect(migration).toContain(`IS DISTINCT FROM '${digest}'`);
 expect(migration).toContain("IS DISTINCT FROM '2190943612f7b95620a97b76fb50fc84'");
 expect(migration).toContain("count(*) FROM pg_policies");
 expect(migration).toContain("P04 renewal security preimage changed; review required");
});

it("keeps a restrictive subject predicate for all four operations",()=>{
 expect(migration).toMatch(/AS RESTRICTIVE FOR SELECT TO authenticated\s+USING \(document_id IN \(SELECT d.id FROM erp_private.read_documents\(\) d\)\)/);
 expect(migration).toMatch(/AS RESTRICTIVE FOR INSERT TO authenticated\s+WITH CHECK \(erp_private.document_permission\(document_id,'dms.documents.view'\)\)/);
 expect(migration).toMatch(/AS RESTRICTIVE FOR UPDATE TO authenticated\s+USING \(erp_private.document_permission\(document_id,'dms.documents.view'\)\)\s+WITH CHECK \(erp_private.document_permission\(document_id,'dms.documents.view'\)\)/);
 expect(migration).toMatch(/AS RESTRICTIVE FOR DELETE TO authenticated\s+USING \(erp_private.document_permission\(document_id,'dms.documents.view'\)\)/);
});

it("does not introduce a privileged endpoint, grant, principal cache or action-policy rewrite",()=>{
 const sql=migration.replace(/--[^\n]*/g,"");
 expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION|GRANT |SECURITY DEFINER|DISABLE ROW LEVEL|ALTER ROLE|ALTER TABLE|UPDATE public\./i);
 expect(sql).not.toMatch(/(?:ALTER|DROP) POLICY (?:dms_renewals_insert|dms_renewals_update|dms_renewals_delete|f03_principal)/i);
 expect(sql.match(/ALTER POLICY /g)).toHaveLength(1);
 expect(sql.match(/DROP POLICY /g)).toHaveLength(1);
 expect(sql).toContain("USING ((SELECT auth.uid()) IS NOT NULL)");
});

it("simplifies only a permissive read expression already dominated by mandatory view",()=>{
 for(const view of [false,true])for(const uid of [false,true])for(const admin of [false,true])for(const legacyRole of [false,true]){
  expect(view&&uid&&(view||admin||legacyRole)).toBe(view&&uid);
 }
});
