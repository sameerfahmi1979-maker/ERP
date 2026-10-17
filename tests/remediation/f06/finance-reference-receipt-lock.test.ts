// Portable authoring proof only: no migration execution or native acceptance.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {describe,expect,it} from 'vitest';

const filename='20261015203354_f06_finance_receipt_read_privilege.sql';
const read=(name:string)=>fs.readFileSync(path.resolve('supabase/migrations',name),'utf8');
const oldFile='20261015180904_f06_finance_reference_atomic_contract.sql';
const source=read(oldFile),repair=read(filename);
const hash=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
const lf=(text:string)=>text.replace(/\r\n/g,'\n');
const body=source.split("returns jsonb language plpgsql volatile security definer set search_path='' as $$")[1].split('$$;')[0];
const oldRead='select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=actor_uid and r.operation_id=p_operation for share;';
const newRead='select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=actor_uid and r.operation_id=p_operation;';
const oldSha='a33734041c2e9dcf8dc34f69589504c5bc37f292d343c5ae80d3a08aa47ab365';
const newSha='6ee46b2cb060c5b029644a8d44cde5d7628afc2f30af6cfa35a781c51885d1b7';
// Model only the literal/hash admission, not PostgreSQL metadata/privilege behavior.
function admittedPatch(installed:string){
 if(hash(lf(installed))!==oldSha || installed.split(oldRead).length!==2) throw Error('source drift');
 const next=installed.replace(oldRead,newRead);
 if(hash(lf(next))!==newSha)throw Error('candidate drift');
 return next;
}

describe('finance receipt read privilege forward repair (offline source contracts)',()=>{
 it('pins immutable84 canonical LF source and both complete canonical bodies',()=>{
  expect(hash(lf(source))).toBe('a56d60469ceb6da3e8c3a56a62baeb034c20344c570afb1c6c4c0314c371b025');
  expect(hash(lf(body))).toBe(oldSha);expect(hash(lf(admittedPatch(body)))).toBe(newSha);
  expect(repair).toContain(`old_sha constant text := '${oldSha}'`);
  expect(repair).toContain(`new_sha constant text := '${newSha}'`);
 });
 it('accepts LF and CRLF without normalizing stored raw surrounding bytes',()=>{
  for(const text of [lf(body),lf(body).replace(/\n/g,'\r\n')]){
   const patched=admittedPatch(text);expect(patched).toBe(text.replace(oldRead,newRead));
   expect(patched.replace(newRead,oldRead)).toBe(text);
  }
  expect(repair).toContain("pg_catalog.replace(old_source,E'\\r\\n',E'\\n')");
  expect(repair).toContain('new_source := pg_catalog.replace(old_source,old_read,new_read)');
  expect(repair).toContain("after_proc->>'prosrc' is distinct from new_source");
 });
 it.each([
  ['foreign modification',body.replace('actor_uid uuid','foreign_uid uuid')],
  ['duplicate receipt statement',body+oldRead],['missing receipt statement',body.replace(oldRead,'')],
  ['already repaired',body.replace(oldRead,newRead)],['bare CR corruption',lf(body).replace('\n','\r')],
 ])('rejects %s rather than guessing or applying twice',(_name,text)=>{expect(()=>admittedPatch(text)).toThrow('source drift');});
 it('changes only the one receipt clause and preserves all other row locks',()=>{
  const next=admittedPatch(body);
  expect(body.length-next.length).toBe(' for share'.length);
  expect(next.split('for share').length).toBe(body.split('for share').length-1);
  for(const fragment of ["where t.id=$1 for share",'c.category_code=refcategory for share','order by v.id for share',"(candidate->>'country_id')::bigint for share",'where t.id=$1 for update']){
   expect(body).toContain(fragment);expect(next).toContain(fragment);
  }
 });
 it('retains operation/domain lock order, authority rechecks and original receipt protocol verbatim',()=>{
  const next=admittedPatch(body);
  const locks=["'f06-finance-reference:'||actor_uid::text||':'||p_operation::text","'f06-geography-relations'","'f06-finance-relationships'"];
  expect(locks.map(value=>next.indexOf(value))).toEqual(locks.map(value=>body.indexOf(value)));
  expect(next.slice(0,next.indexOf(newRead))).toBe(body.slice(0,body.indexOf(oldRead)));
  expect(next.slice(next.indexOf(newRead)+newRead.length)).toBe(body.slice(body.indexOf(oldRead)+oldRead.length));
  expect(next).toContain('insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)');
  expect(next).not.toMatch(/on conflict|exception\s+when\s+unique_violation/i);
 });
 it('pins accepted owner, ACL, signature, language and security metadata before executing',()=>{
  for(const value of ["<> 'postgres'","<> 'plpgsql'","before_proc->>'prosecdef' <> 'true'","before_proc->>'provolatile' <> 'v'",
   "before_proc->'proconfig' is distinct from '[\"search_path=\\\"\\\"\"]'::jsonb",
   "before_proc->'proacl' is distinct from '[\"postgres=X/postgres\",\"authenticated=X/postgres\"]'::jsonb",
   "before_proc->'proargnames'",'pg_catalog.to_regprocedure(\'erp_private.save_finance_reference_record(text,uuid,bigint,bigint,text,jsonb)\')']){
   expect(repair).toContain(value);expect(repair.indexOf(value)).toBeLessThan(repair.indexOf('execute pg_catalog.replace'));
  }
 });
 it('preserves the complete local pg_proc record and exact OID apart from prosrc',()=>{
  expect(repair).toContain('select pg_catalog.to_jsonb(p), p.prosrc into before_proc, old_source');
  expect(repair).toContain('definition := pg_catalog.pg_get_functiondef(target)');
  expect(repair).toContain('execute pg_catalog.replace(definition,old_read,new_read)');
  expect(repair).toContain("after_proc-'prosrc' is distinct from before_proc-'prosrc'");
  expect(repair).toContain('::oid is distinct from target');
  expect(repair).toContain("message='F06 receipt repair changed metadata, identity or unrelated source'");
 });
 it('bounds exact occurrence checks in both body and installed definition',()=>{
  expect(repair).toContain('pg_catalog.replace(old_source,old_read,\'\')');
  expect(repair).toContain('pg_catalog.replace(definition,old_read,\'\')');
  expect(repair.match(/\/pg_catalog\.length\(old_read\) <> 1/g)).toHaveLength(2);
 });
 it('uses one transactional fail-closed DO block with finite timeouts and no privilege expansion',()=>{
  expect(repair.match(/\$finance_receipt_read\$/g)).toHaveLength(2);
  expect(repair).toMatch(/begin;\s*set local lock_timeout = '5s';\s*set local statement_timeout = '60s';/);
  expect(repair.trim()).toMatch(/end;\s*\$finance_receipt_read\$;\s*commit;$/);
  const executable=repair.replace(/--[^\r\n]*/g,'');
  expect(executable).not.toMatch(/\b(?:grant|revoke|drop|truncate|insert|update|delete|alter\s+(?:role|table|function))\b/i);
  expect(executable).not.toMatch(/public\.save_finance_reference_record|master_lifecycle_receipts\s+(?:set|add)|exception\s+when|has_table_privilege/i);
 });
});
