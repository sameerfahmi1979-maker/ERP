import {expect,it} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const sql=fs.readFileSync('supabase/migrations/20261004174935_f06_party_service_assignment_atomic.sql','utf8');
it('keeps accepted catalogue62 unchanged',()=>{expect(createHash('sha256').update(fs.readFileSync('supabase/migrations/20261004170344_f06_party_admin_master_atomic.sql')).digest('hex')).toBe('821871df43b7c9cc2ea4632613eddb0236afaea0420ea86f7a4ac700762a10ae');});
it('takes shared domains before all target rows in the accepted order',()=>{
 const body=sql.slice(sql.indexOf('create function erp_private.save_party_service_assignment'));
 const geo=body.indexOf("'f06-geography-relations'"),party=body.indexOf("'f06-party-relations'"),catalogue=body.indexOf("'f06-party-admin-masters-relations'"),row=body.indexOf('for update');
 expect(geo).toBeGreaterThan(0);expect(party).toBeGreaterThan(geo);expect(catalogue).toBeGreaterThan(party);expect(row).toBeGreaterThan(catalogue);
});
it('checks exact global system_admin before replay and after late writes',()=>{expect(sql.match(/r\.role_code='system_admin'/g)).toHaveLength(3);expect(sql).not.toContain('current_user_is_global_admin');expect(sql.match(/permission_in_scope\('master_data.parties.manage_services',null,null\)/g)).toHaveLength(3);});
it('cuts over exposed table/column writes without deleting history',()=>{expect(sql).toContain('revoke insert,update,delete on public.party_service_category_assignments from public,anon,authenticated');expect(sql).toContain('revoke insert (%s),update (%s)');expect(sql).not.toMatch(/delete from public\.party_service_category_assignments/i);expect(sql).toContain('set is_active=false');});
it('requires exact request/identity/revision and stores mutation/audit/receipt together',()=>{for(const snippet of ['receipt.request_hash<>h','prior.workspace_revision is distinct from p_revision','and party_id=p_party for update','insert into public.audit_logs','insert into erp_private.master_lifecycle_receipts','security invoker set search_path'])expect(sql).toContain(snippet);expect(sql).not.toContain('set is_primary=false');});
