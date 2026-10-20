import {describe,it,expect} from 'vitest';
import {childMutationSchema} from '@/lib/hr/child-save-contract';
import {complianceOperationValues,COMPLIANCE_CHILD_ACTIONS} from '@/lib/hr/compliance-child-contract';
const command=(kind:string,action:string,values:unknown,revision:string|null='3',id:number|null=17)=>({kind,action,values,employeeId:7,revision,id});
describe('F11 compliance original-operation contract',()=>{
 it.each(Object.keys(COMPLIANCE_CHILD_ACTIONS))('requires the original revision for %s updates',kind=>{
  expect(childMutationSchema.safeParse(command(kind,'update',{},null)).success).toBe(false);
  expect(childMutationSchema.safeParse(command(kind,'archive',{})).success).toBe(true);
 });
 it('retains omitted legacy identity text but distinguishes explicit clearing',()=>{
  expect(complianceOperationValues('identity-document','update').parse({notes:null})).toEqual({notes:null});
  expect(complianceOperationValues('identity-document','update').parse({})).toEqual({});
 });
 it.each(['2026-02-30','2026-13-01','tomorrow'])('rejects invalid calendar date %s',issue_date=>{
  expect(complianceOperationValues('identity-document','create').safeParse({document_type_id:1,document_number:'Synthetic',issue_date}).success).toBe(false);
 });
 it('rejects blank required identity/provider/policy wording',()=>{
  expect(complianceOperationValues('identity-document','create').safeParse({document_type_id:1,document_number:'  '}).success).toBe(false);
  expect(complianceOperationValues('medical-insurance','create').safeParse({insurance_provider:'  ',policy_number:'P',expiry_date:'2027-01-01'}).success).toBe(false);
 });
 it('rejects reversed dates and missing restriction detail',()=>{
  expect(complianceOperationValues('access-card','create').safeParse({access_type_id:1,issue_date:'2027-01-02',expiry_date:'2027-01-01'}).success).toBe(false);
  expect(complianceOperationValues('medical-record','create').safeParse({medical_record_type_id:1,examination_date:'2026-10-20',result:'fit',work_restrictions:true}).success).toBe(false);
 });
 it('includes unique evidence identities in the original command',()=>{
  expect(complianceOperationValues('identity-document','create').safeParse({document_type_id:1,document_number:'S',source_document_ids:[3,3]}).success).toBe(false);
 });
 it('does not invent certificate renewal or permit medical verification',()=>{
  expect(childMutationSchema.safeParse(command('training-certificate','renewal',{renewal_status:'pending'})).success).toBe(false);
  expect(childMutationSchema.safeParse(command('medical-record','verify',{})).success).toBe(false);
 });
 it('rejects unrendered authority, subject and audit fields',()=>{
  for(const values of [{employee_id:8},{verified_by:9},{workspace_revision:8},{deleted_at:'2026-10-20'}])expect(childMutationSchema.safeParse(command('identity-document','update',values)).success).toBe(false);
 });
});
