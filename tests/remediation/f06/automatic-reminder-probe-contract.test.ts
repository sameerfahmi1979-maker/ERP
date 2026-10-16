import {expect,it} from 'vitest';
import {assertAutomaticReminderSchema,automaticReminderColumns,automaticReminderSchemaPreflightSql,automaticReminderDates,pendingReminderProbeSql,reminderRowsSql,reminderSnapshotSql} from './automatic-reminder-probe-contract';
const fixture={documentId:7,sourceId:8,operationId:'11111111-1111-4111-8111-111111111111'};
it('schema preflight accepts the exact reviewed reminder columns and real profile status',()=>{
 expect(()=>assertAutomaticReminderSchema({reminderColumns:automaticReminderColumns,profileStateType:'text',profileHasLegacyActive:false})).not.toThrow();
 const sql=automaticReminderSchemaPreflightSql();expect(sql).toContain('information_schema.columns');expect(sql).toContain("column_name='status'");
 expect(sql).not.toMatch(/\b(?:insert|update|delete|alter|create|drop|grant|revoke)\b/i);
});
it.each([
 {reminderColumns:[...automaticReminderColumns,'next_retry_at'],profileStateType:'text',profileHasLegacyActive:false},
 {reminderColumns:automaticReminderColumns.slice(1),profileStateType:'text',profileHasLegacyActive:false},
 {reminderColumns:automaticReminderColumns,profileStateType:null,profileHasLegacyActive:true},
 {reminderColumns:automaticReminderColumns,profileStateType:'boolean',profileHasLegacyActive:false},
 null,
])('schema preflight rejects unsupported or missing fixture columns before any writes (%#)',schema=>{
 expect(()=>assertAutomaticReminderSchema(schema)).toThrow('fixture schema differs');
});
it('uses exactly the approved six fixed UTC date offsets, not manual eight-day defaults',()=>{
 expect(automaticReminderDates('2027-01-01')).toEqual([
  {days:1,date:'2026-12-31',status:'pending'},{days:7,date:'2026-12-25',status:'pending'},
  {days:14,date:'2026-12-18',status:'pending'},{days:30,date:'2026-12-02',status:'pending'},
  {days:60,date:'2026-11-02',status:'pending'},{days:90,date:'2026-10-03',status:'pending'},
 ]);
 for(const invalid of ['2027-02-30','2027-1-01','invalid',''])expect(()=>automaticReminderDates(invalid)).toThrow();
});
it('hashes all exact business/proof/reminder row values in PostgreSQL, not lossy JS numbers',()=>{
 const source=reminderSnapshotSql(fixture);
 for(const name of ['dms_documents','dms_upload_sessions','dms_ai_extraction_results','dms_approve_runs','ai_approval_plans','ai_approval_verified_copies','global_numbering_generated_references','audit_logs','dms_document_versions','dms_document_files','dms_document_metadata_values','dms_document_tags','dms_document_links','dms_document_events','dms_expiry_reminders'])expect(source).toContain(name);
 expect(source).toContain('sha256(convert_to(jsonb_build_object(');
 expect(source).toContain('order by to_jsonb(r)::text');
 expect(reminderRowsSql(7)).toContain('to_jsonb(r) order by r.id');
});
it('pending setup pins an already completed source/document/operation and never commits',()=>{
 const source=pendingReminderProbeSql(fixture);
 expect(source).toContain('result is not null');expect(source).toContain('document_id=7 and upload_session_id=8');
 expect(source).toContain('delete from public.dms_expiry_reminders where document_id=7');
 expect(pendingReminderProbeSql(fixture,true)).not.toContain('delete from');
 expect(source).not.toMatch(/\bcommit\b/i);
});
it('rejects non-exact identifiers and SQL-shaped operations before constructing SQL',()=>{
 for(const value of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]){
  expect(()=>reminderRowsSql(value)).toThrow();expect(()=>pendingReminderProbeSql({...fixture,documentId:value})).toThrow();
  expect(()=>reminderSnapshotSql({...fixture,sourceId:value})).toThrow();
 }
 expect(()=>reminderSnapshotSql({...fixture,operationId:"x';commit;"})).toThrow();
});
