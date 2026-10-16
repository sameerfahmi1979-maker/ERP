import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const old=fs.readFileSync('supabase/migrations/20261005083645_f06_atomic_batch_admission.sql','utf8').replaceAll('\r','');
const fix=fs.readFileSync('supabase/migrations/20261014042017_f06_batch_context_active_status.sql','utf8').replaceAll('\r','');
const body=(text:string)=>{const start=text.search(/create(?: or replace)? function erp_private\.batch_fresh_context\(/);return text.slice(start,text.indexOf('$$;',start)+3).replace('create or replace function','create function');};
describe('W40 organization status repair (offline source only)',()=>{
 it('changes only the company and branch activity predicates, leaving party rules intact',()=>{
  const before=body(old),expected=before.replace('from public.owner_companies where id=company and is_active',"from public.owner_companies where id=company and status='active'").replace('from public.branches where id=branch and owner_company_id=company and is_active',"from public.branches where id=branch and owner_company_id=company and status='active'");
  expect(expected).not.toBe(before);expect(body(fix)).toBe(expected);expect(fix).toContain('and is_active and not is_locked');
 });
 it('preserves locks, scope checks, empty search path, ownership and exact caller rights',()=>{
  expect(fix.trim()).toMatch(/^begin;/);expect(fix.trim()).toMatch(/commit;$/);expect(fix).toContain("security definer set search_path='' set lock_timeout='5s'");
  expect(fix.match(/for share;/g)).toHaveLength(4);
  expect(fix).toContain('alter function erp_private.batch_fresh_context(bigint,bigint,jsonb,boolean) owner to postgres;');
  expect(fix).toContain('revoke all on function erp_private.batch_fresh_context(bigint,bigint,jsonb,boolean) from public,anon,service_role;');
  expect(fix).toContain('grant execute on function erp_private.batch_fresh_context(bigint,bigint,jsonb,boolean) to authenticated;');
  expect(fix).not.toMatch(/disable trigger|session_replication_role|exception when|alter (?:table|policy)|drop (?:function|table|trigger)/i);
 });
});
