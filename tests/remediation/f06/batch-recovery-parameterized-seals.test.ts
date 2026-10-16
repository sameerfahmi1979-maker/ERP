import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const original=readFileSync('supabase/migrations/20261005153627_f06_durable_batch_draft_recovery.sql','utf8');
const migration=readFileSync('supabase/migrations/20261014082836_f06_batch_recovery_parameterized_seals.sql','utf8');
const source=original.slice(original.indexOf('create function public.read_dms_batch_draft_recovery('),original.indexOf('revoke all on function public.read_dms_batch_draft_recovery(')).trim();
const actual=migration.slice(migration.indexOf('create or replace function public.read_dms_batch_draft_recovery('),migration.lastIndexOf('commit;')).trim();
it('changes only the ordinary-RLS preparation join in the complete existing function',()=>{
 const expected=source.replace('create function public.','create or replace function public.').replace('left join erp_private.dms_batch_draft_preparations p on p.upload_session_id=s.id','left join lateral (\n  select prepared.* from erp_private.dms_batch_draft_preparations prepared\n  where prepared.upload_session_id=s.id offset 0\n ) p on true');
 expect(actual.replaceAll('\r\n','\n')).toBe(expected.replaceAll('\r\n','\n'));
});
it('anchors every point lookup to the current source without flattening',()=>{
 expect(actual).toContain('where prepared.upload_session_id=s.id offset 0');
 expect(actual.match(/left join lateral/g)).toHaveLength(1);
 expect(actual).toContain('security invoker');
 expect(actual).not.toContain('security definer');
});
it('keeps the hidden-seal discriminator and payload in the exact same statement',()=>{
 expect(actual).toContain("'has_seal',case when s.batch_draft_operation_id is null then null else erp_private.batch_draft_preparation_exists(s.id) end");
 expect(actual).toContain("'seal',to_jsonb(p)");
 expect(actual).toContain("if graph is null or jsonb_array_length(graph)<>jsonb_array_length(receipt->'members') then");
});
it('preserves original-principal and after-wait current-authority checks',()=>{
 expect(actual).toContain('receipt:=public.read_dms_upload_batch_admission(p_admission_operation)');
 expect(actual).toContain("not erp_private.upload_session_permission(source_id,'dms.documents.upload')");
 expect(actual).toContain('or receipt is distinct from public.read_dms_upload_batch_admission(p_admission_operation)');
 expect(actual).toContain("raise exception 'Batch preparation unavailable' using errcode='42501'");
});
it('does not alter grants, policies, rows, numbering or trigger checks',()=>{
 expect(migration).not.toMatch(/\b(?:grant|revoke|alter policy|drop policy|create policy|insert into|update public|delete from|disable trigger)\b/i);
 expect(migration.trim()).toMatch(/^begin;/);
 expect(migration.trim()).toMatch(/commit;$/);
});
