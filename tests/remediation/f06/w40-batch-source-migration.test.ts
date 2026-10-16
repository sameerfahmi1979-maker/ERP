import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const old=fs.readFileSync('supabase/migrations/20261005083645_f06_atomic_batch_admission.sql','utf8').replaceAll('\r','');
const fix=fs.readFileSync('supabase/migrations/20261014040817_f06_legacy_batch_source_dispatch.sql','utf8').replaceAll('\r','');
const body=(text:string)=>{const start=text.search(/create(?: or replace)? function erp_private\.batch_source\(/);return text.slice(start,text.indexOf('$$;',start)+3).replace('create or replace function','create function');};
const anchor=" if b.admission_version=1 and (b.total_files<>jsonb_array_length(b.admission_manifest->'files')\n  or b.admission_fingerprint is distinct from encode(sha256(convert_to(erp_private.batch_manifest_bytes(b.admission_manifest),'UTF8')),'hex')\n  or b.entity_type is distinct from b.admission_manifest#>>'{context,type}'\n  or b.entity_id is distinct from (b.admission_manifest#>>'{context,id}')::numeric::bigint) then\n  raise exception 'Invalid admission anchor' using errcode='PT409';end if;";
const replacement=" if b.admission_version=1 then\n  if b.total_files<>jsonb_array_length(b.admission_manifest->'files')\n   or b.admission_fingerprint is distinct from encode(sha256(convert_to(erp_private.batch_manifest_bytes(b.admission_manifest),'UTF8')),'hex')\n   or b.entity_type is distinct from b.admission_manifest#>>'{context,type}'\n   or b.entity_id is distinct from (b.admission_manifest#>>'{context,id}')::numeric::bigint then\n   raise exception 'Invalid admission anchor' using errcode='PT409';end if;\n end if;";
describe('W40 legacy batch source forward repair (offline source only)',()=>{
 it('changes only the modern-version procedural dispatch and retains every anchor check',()=>{expect(body(old)).toContain(anchor);expect(body(fix)).toBe(body(old).replace(anchor,replacement));});
 it('preserves invoker, empty search path, caller rights and a complete forward transaction',()=>{
  expect(fix.trim()).toMatch(/^begin;/);expect(fix.trim()).toMatch(/commit;$/);expect(fix).toContain("security invoker set search_path=''");
  expect(fix).toContain('revoke all on function erp_private.batch_source(bigint) from public,anon,service_role;');expect(fix).toContain('grant execute on function erp_private.batch_source(bigint) to authenticated;');
  expect(fix).not.toMatch(/security definer|disable trigger|session_replication_role|exception when|alter (?:table|policy)|drop (?:function|table|trigger)/i);
 });
});
