import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const old=fs.readFileSync('supabase/migrations/20261005083645_f06_atomic_batch_admission.sql','utf8').replaceAll('\r','');
const fix=fs.readFileSync('supabase/migrations/20261014041444_f06_batch_authority_record_binding.sql','utf8').replaceAll('\r','');
const body=(text:string)=>{const start=text.search(/create(?: or replace)? function erp_private\.lock_batch_admission_authority\(/);return text.slice(start,text.indexOf('$$;',start)+3).replace('create or replace function','create function');};
describe('W40 batch authority record-binding repair (offline source only)',()=>{
 it('renames only the PL/pgSQL lock variable and preserves SQL role aliases',()=>{
  const before=body(old);expect(before.match(/ for r in /g)).toHaveLength(4);expect(before.match(/where id=r\.id for share/g)).toHaveLength(4);
  const expected=before.replace('; r record;','; locked_row record;').replaceAll(' for r in ',' for locked_row in ').replaceAll('where id=r.id for share','where id=locked_row.id for share');
  expect(body(fix)).toBe(expected);expect(fix).toContain('select ur.id assignment,r.id role,rp.id pair,p.id permission');expect(fix).toContain('join public.roles r on r.id=');
 });
 it('preserves exact security, lock settings, ownership and caller grants',()=>{
  expect(fix.trim()).toMatch(/^begin;/);expect(fix.trim()).toMatch(/commit;$/);expect(fix).toContain("security definer set search_path='' set lock_timeout='5s'");
  expect(fix).toContain('alter function erp_private.lock_batch_admission_authority(boolean) owner to postgres;');
  expect(fix).toContain('revoke all on function erp_private.lock_batch_admission_authority(boolean) from public,anon,service_role;');
  expect(fix).toContain('grant execute on function erp_private.lock_batch_admission_authority(boolean) to authenticated;');
  expect(fix).not.toMatch(/disable trigger|session_replication_role|exception when|alter (?:table|policy)|drop (?:function|table|trigger)/i);
 });
});
