import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const source = readFileSync('supabase/migrations/20261004154941_f06_company_suggestion_atomic.sql', 'utf8').replaceAll('\r\n', '\n');
const migration = readFileSync('supabase/migrations/20261004163146_f06_company_suggestion_lock_authority_recheck.sql', 'utf8').replaceAll('\r\n', '\n');
const body = (sql: string) => sql.match(/create (?:or replace )?function erp_private\.apply_company_field_suggestions[\s\S]*?end\$\$;/)![0];
const gate = ` -- Every source row/link/file lock is now held. Capability or source-role
 -- revocation during any of those waits must also invalidate receipt replay.
 if not erp_private.business_principal_is_active()
  or not (erp_private.permission_in_scope('ai.field_suggestions.apply',null,null) or erp_private.permission_in_scope('ai.common.admin',null,null))
  or not erp_private.permission_in_scope('organizations.view',p_company,null)
  or not erp_private.permission_in_scope('organizations.manage',p_company,null) then
  raise exception 'Company suggestion permission denied' using errcode='42501';end if;
 for s in select * from public.erp_ai_field_suggestions where id=any(p_suggestions) order by id loop
  if not erp_private.document_permission(s.source_document_id,'dms.documents.view') then
   raise exception 'Source document unavailable' using errcode='42501';end if;
 end loop;
`;

it('preserves the accepted transaction byte-for-byte apart from the post-source-lock authority gate', () => {
  const updated = body(migration);
  expect(updated.replace('create or replace function', 'create function').replace(gate, '')).toBe(body(source));
  const position = updated.indexOf(gate);
  expect(position).toBeGreaterThan(updated.lastIndexOf('for share;'));
  expect(position).toBeGreaterThan(updated.indexOf('results:=results||jsonb_build_array(receipt.result'));
  expect(position).toBeLessThan(updated.indexOf('if batch_changed then'));
  expect(position).toBeLessThan(updated.indexOf('return results;'));
});
it('retains private ownership, scoped capabilities and authenticated-only execution', () => {
  expect(migration).toContain("permission_in_scope('ai.field_suggestions.apply',null,null)");
  expect(migration).toContain("permission_in_scope('organizations.manage',p_company,null)");
  expect(migration).toContain('alter function erp_private.apply_company_field_suggestions(bigint,bigint[],boolean) owner to postgres');
  expect(migration).toContain('revoke all on function erp_private.apply_company_field_suggestions(bigint,bigint[],boolean) from public,anon,service_role');
  expect(migration).toContain('grant execute on function erp_private.apply_company_field_suggestions(bigint,bigint[],boolean) to authenticated');
  expect(migration).not.toMatch(/create or replace function public\.|current_user_has_permission/);
});
