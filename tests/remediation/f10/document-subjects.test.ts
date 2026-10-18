import {beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const s=vi.hoisted(()=>({from:vi.fn(),employee:vi.fn(),rows:{} as Record<string,unknown[]>,failed:''}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:s.from})}));
vi.mock('@/lib/rbac/employee-access',()=>({getEmployeeAccess:s.employee}));
import {notificationDocumentSubjectsAllowed} from '@/server/notification-document-authority';
const ctx=syntheticAuthContext(['dms.documents.view']);
beforeEach(()=>{
 vi.clearAllMocks();s.rows={};s.failed='';
 s.employee.mockResolvedValue({subject:{id:7,owner_company_id:1,branch_id:2},allows:()=>false});
 s.from.mockImplementation((table:string)=>{const result=()=>({data:s.rows[table]??[],error:table===s.failed?{message:'private'}:null});const q:Record<string,unknown>={then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};for(const method of ['select','eq','is','limit'])q[method]=()=>q;q.maybeSingle=()=>Promise.resolve({...result(),data:s.rows[table]?.[0]??null});return q;});
});
it('document with no linked subjects does not invent a confidential restriction',async()=>{expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(true);});
it.each(['employee_medical_insurances','employee_medical_records'])('direct %s FK requires medical permission even without generic DMS links',async table=>{
 s.rows[table]=[{employee_id:7}];expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(false);expect(s.employee).toHaveBeenCalledWith(ctx,7);
 s.employee.mockResolvedValue({allows:(code:string)=>code==='hr.medical.view'});expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(true);
});
it('disciplinary evidence requires actions AND separate confidential capability',async()=>{
 s.rows.employee_disciplinary_records=[{employee_id:7}];s.employee.mockResolvedValue({allows:(c:string)=>c==='hr.actions.view'});expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(false);
});
it('employee document medical subtype keeps medical protection',async()=>{
 s.rows.employee_document_links=[{employee_id:7,related_record_type:'medical_record'}];expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(false);
});
it('employee generic link denial is not bypassed by owning the DMS record',async()=>{
 s.rows.dms_document_links=[{entity_type:'employee',entity_id:7}];s.employee.mockRejectedValue(Error('Employee unavailable or access denied'));expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(false);
});
it('authority outage throws retryable failure rather than a false absent link',async()=>{
 s.failed='employee_medical_insurances';await expect(notificationDocumentSubjectsAllowed(ctx,1)).rejects.toThrow('authority unavailable');
});
it('employee lookup outage is not silently omitted as access denial',async()=>{
 s.rows.employee_identity_documents=[{employee_id:7}];s.employee.mockRejectedValue(Error('Employee identity could not be verified'));await expect(notificationDocumentSubjectsAllowed(ctx,1)).rejects.toThrow();
});
it('bounded inventory overflow fails instead of silently truncating evidence',async()=>{
 s.rows.employee_document_links=Array.from({length:501},()=>({employee_id:7,related_record_type:null}));await expect(notificationDocumentSubjectsAllowed(ctx,1)).rejects.toThrow('authority unavailable');
});
it('unknown generic linked entity is held, not optimistically admitted',async()=>{
 s.rows.dms_document_links=[{entity_type:'unreviewed_subject',entity_id:7}];expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(false);
});
it('candidate evidence requires the current candidate requisition scope',async()=>{
 s.rows.hr_candidate_documents=[{candidate_id:9}];s.rows.hr_candidates=[{requisition_id:3}];s.rows.hr_job_requisitions=[{owner_company_id:1,branch_id:2}];
 expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(false);
 const allowed={...ctx,roleAssignments:[{roleId:1,roleCode:'reviewer',ownerCompanyId:1,branchId:2,permissionCodes:['hr.recruitment.view']}]};
 expect(await notificationDocumentSubjectsAllowed(allowed,1)).toBe(true);expect(await notificationDocumentSubjectsAllowed({...allowed,roleAssignments:[{...allowed.roleAssignments[0],branchId:3}]},1)).toBe(false);
});
it('offer evidence also requires scoped payroll rights',async()=>{
 s.rows.hr_offers=[{candidate_id:9,owner_company_id:1,branch_id:2}];s.rows.hr_candidates=[{requisition_id:null}];
 expect(await notificationDocumentSubjectsAllowed(syntheticAuthContext(['hr.recruitment.view']),1)).toBe(false);
});
it('inactive profile cannot query linked subject evidence',async()=>{
 expect(await notificationDocumentSubjectsAllowed({...ctx,isAccountActive:false},1)).toBe(false);expect(s.from).not.toHaveBeenCalled();
});
it('medical leave certificates require medical rights, not just ordinary employee access',async()=>{
 s.rows.employee_leave_requests=[{employee_id:7}];expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(false);
 s.employee.mockResolvedValue({allows:(c:string)=>c==='hr.medical.view'});expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(true);
});
it('stored employee-photo FK cannot bypass the employee subject boundary',async()=>{
 s.rows.employees=[{employee_id:7}];s.employee.mockRejectedValueOnce(Error('Employee unavailable or access denied'));
 expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(false);
 expect(await notificationDocumentSubjectsAllowed(ctx,1)).toBe(true);
});
