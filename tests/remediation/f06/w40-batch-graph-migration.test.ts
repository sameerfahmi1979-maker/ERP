import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

// Offline source checks only; native77c cases independently verify behavior.
const old=fs.readFileSync('supabase/migrations/20261005153627_f06_durable_batch_draft_recovery.sql','utf8').replaceAll('\r','');
const fix=fs.readFileSync('supabase/migrations/20261014035305_f06_batch_graph_record_dispatch.sql','utf8').replaceAll('\r','');
const body=(text:string)=>text.slice(text.indexOf('create or replace function erp_private.batch_graph_guard()'),text.indexOf('$$;',text.indexOf('create or replace function erp_private.batch_graph_guard()'))+3);
describe('W40 batch graph forward repair source contract',()=>{
 it('changes only table-specific NEW record dispatch in the latest graph function',()=>{
  const expected=body(old).replace(" bid:=case when tg_table_name='dms_upload_batches' then new.id else new.batch_id end;"," if tg_table_name='dms_upload_batches' then\n  bid:=new.id;\n else\n  bid:=new.batch_id;\n end if;");
  expect(body(fix)).toBe(expected);
 });
 it('retains graph integrity checks, trigger-only rights, and transactional forward migration',()=>{
  expect(fix.trim()).toMatch(/^begin;/);expect(fix.trim()).toMatch(/commit;$/);
  expect(fix).toContain('alter function erp_private.batch_graph_guard() owner to postgres;');
  expect(fix).toContain('revoke all on function erp_private.batch_graph_guard() from public,anon,authenticated,service_role;');
  expect(fix).not.toMatch(/disable trigger|session_replication_role|drop (?:trigger|table|constraint)|grant .* to|exception when/i);
  for(const message of ['Incomplete admission graph','Missing admission audit','Invalid admission graph'])expect(fix).toContain(message);
 });
});
