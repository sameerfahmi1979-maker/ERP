import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const original = readFileSync('supabase/migrations/20261004153827_f06_administration_atomic_saves.sql', 'utf8').replaceAll('\r\n', '\n');
const migration = readFileSync('supabase/migrations/20261004162445_f06_branding_lock_authority_recheck.sql', 'utf8').replaceAll('\r\n', '\n');
const body = (sql: string) => sql.match(/create (?:or replace )?function erp_private\.initialize_company_branding[\s\S]*?end\$\$;/)![0];
const check = ` if not erp_private.business_principal_is_active()
   or not erp_private.permission_in_scope('organizations.manage',p_company,null)
   or not erp_private.report_branding_permission('manage',p_company) then
   raise exception 'Company and branding management authority required' using errcode='42501';end if;`;
const added = `
 -- A request may wait while its live account or role authority is revoked.
 -- Recheck after admission locks and before even returning a previous receipt.
${check}`;
const finalAdded = `
 -- Profile/template/trigger work can also wait after admission. Rejecting here
 -- rolls back every earlier bootstrap mutation and audit in this transaction.
${check}`;

it('changes only the accepted branding body by adding the same authority after admission and before committing its receipt', () => {
  const updated = body(migration);
  expect(updated.match(/if not erp_private\.business_principal_is_active\(\)/g)).toHaveLength(3);
  expect(updated.replace('create or replace function', 'create function').replace(added, '').replace(finalAdded, '')).toBe(body(original));
  const targetLock = updated.indexOf('where c.id=p_company for update;');
  const recheck = updated.indexOf(check, targetLock);
  expect(recheck).toBeGreaterThan(targetLock);
  expect(recheck).toBeLessThan(updated.indexOf('return receipt.result'));
  expect(recheck).toBeLessThan(updated.indexOf('insert into public.erp_report_branding_profiles'));
  expect(updated.lastIndexOf(check)).toBeGreaterThan(updated.lastIndexOf('insert into public.audit_logs'));
  expect(updated.lastIndexOf(check)).toBeLessThan(updated.indexOf('insert into erp_private.master_lifecycle_receipts'));
});
it('preserves explicit private ownership and restricted execute privileges', () => {
  expect(migration).toContain('alter function erp_private.initialize_company_branding(bigint,text,uuid) owner to postgres');
  expect(migration).toContain('revoke all on function erp_private.initialize_company_branding(bigint,text,uuid) from public,anon,service_role');
  expect(migration).toContain('grant execute on function erp_private.initialize_company_branding(bigint,text,uuid) to authenticated');
  expect(migration).not.toContain('create or replace function public.');
});
