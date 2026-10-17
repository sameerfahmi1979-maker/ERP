// Offline source contract only: not a substitute for actual PostgreSQL execution.
import {expect,it} from 'vitest';import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261004170344_f06_party_admin_master_atomic.sql','utf8');
it('protects both catalogues and all live references with BEFORE STATEMENT ordering',()=>{
 expect(sql).toContain("array['party_service_categories_master','party_relationship_types','party_service_category_assignments','party_relationships','party_government_authority_profiles']");
 expect(sql).toContain('for each statement execute function erp_private.lock_party_admin_master_relations()');
 const lock=sql.slice(sql.indexOf('create function erp_private.lock_party_admin_master_relations'),sql.indexOf('create function erp_private.validate_party_admin_master'));
 expect(lock.indexOf('f06-geography-relations')).toBeLessThan(lock.indexOf('f06-party-relations'));
 expect(lock.indexOf('f06-party-relations')).toBeLessThan(lock.indexOf('f06-party-admin-masters-relations'));
});
it('rechecks exact global authority after waits and before final receipt',()=>{
 const save=sql.slice(sql.indexOf('create function erp_private.save_party_admin_master'));
 expect(save.match(/erp_private\.permission_in_scope\(permission,null,null\)/g)).toHaveLength(3);
 expect(save).not.toContain('current_user_has_permission');
 expect(save.indexOf("hashtextextended('f06-party-admin-masters-relations'")).toBeLessThan(save.indexOf('for update'));
 expect(save.lastIndexOf('erp_private.permission_in_scope')).toBeLessThan(save.indexOf('insert into erp_private.master_lifecycle_receipts'));
});
it('retains trusted identity/history and removes table plus column write bypasses',()=>{
 expect(sql).toContain('Catalogue code and system flag are immutable');expect(sql).toContain('public.party_government_authority_profiles where service_category_id=new.id');
 expect(sql).toContain('revoke insert,update,delete on public.party_service_categories_master,public.party_relationship_types from public,anon,authenticated');
 expect(sql).toContain('has_any_column_privilege');expect(sql).toContain('security invoker set search_path');expect(sql).not.toContain('grant insert');
});
