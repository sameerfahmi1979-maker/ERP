import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/20261017092052_perf_upload_inbox_authority_set.sql','utf8');

it('keeps the original point authority and authenticates the private statement-local ID set',()=>{
 expect(sql).toContain('WHERE (SELECT auth.uid()) IS NOT NULL');
 expect(sql).toContain('(SELECT erp_private.business_principal_is_active())');
 expect(sql).toContain('WHERE erp_private.upload_row_allowed(k.uploaded_by,k.owning_company_id,k.owning_branch_id,k.document_id)');
 expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION erp_private\.(upload_row_allowed|permission_in_scope|business_principal_is_active)/i);
 expect(sql).toContain('REVOKE ALL ON FUNCTION erp_private.readable_upload_session_ids() FROM PUBLIC,anon,authenticated,service_role');
 expect(sql).toContain('GRANT EXECUTE ON FUNCTION erp_private.readable_upload_session_ids() TO authenticated');
 expect(sql).toContain("SET search_path = ''");
});

it('groups the complete nullable authorization tuple without mixing assignment scopes',()=>{
 expect(sql).toContain('WITH scope_keys AS MATERIALIZED');
 expect(sql).toContain('allowed_keys AS MATERIALIZED');
 expect(sql).toContain('SELECT DISTINCT s.uploaded_by,s.owning_company_id,s.owning_branch_id,s.document_id');
 for(const column of ['uploaded_by','owning_company_id','owning_branch_id','document_id']){
  expect(sql).toContain(`s.${column} IS NOT DISTINCT FROM k.${column}`);
 }
 expect(sql).toContain('USING (id IN (SELECT erp_private.readable_upload_session_ids()))');
 expect(sql).not.toMatch(/CREATE (?:UNLOGGED )?TABLE|MATERIALIZED VIEW|DISABLE ROW LEVEL SECURITY/i);
});

it('preserves every original restrictive write predicate and does not grant new table access',()=>{
 for(const operation of ['INSERT','UPDATE','DELETE']){
  expect(sql).toContain(`AS RESTRICTIVE FOR ${operation} TO authenticated`);
 }
 expect(sql.match(/WITH CHECK \(erp_private\.upload_row_allowed\(uploaded_by,owning_company_id,owning_branch_id,document_id\)\)/g)).toHaveLength(2);
 expect(sql.match(/USING \(erp_private\.upload_row_allowed\(uploaded_by,owning_company_id,owning_branch_id,document_id\)\)/g)).toHaveLength(2);
 expect(sql).not.toMatch(/(?:DROP|ALTER) POLICY f03_principal|GRANT (?:SELECT|ALL) ON (?:TABLE )?public\./i);
 expect(sql).toContain("RAISE EXCEPTION 'Inbox authority preimage changed; reconcile before applying'");
});
