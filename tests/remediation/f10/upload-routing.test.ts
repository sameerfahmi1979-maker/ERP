import {beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const s=vi.hoisted(()=>({rows:{} as Record<string,Record<string,unknown>>,failed:'',employee:vi.fn(),subjects:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{const q:Record<string,unknown>={};for(const m of ['select','eq','is'])q[m]=()=>q;q.maybeSingle=async()=>({data:s.rows[table]??null,error:table===s.failed?{message:'private'}:null});return q;}})}));
vi.mock('@/lib/rbac/employee-access',()=>({getEmployeeAccess:s.employee}));
vi.mock('@/server/notification-document-authority',()=>({notificationDocumentSubjectsAllowed:s.subjects}));
import {notificationUploadReviewAllowed} from '@/server/notification-upload-authority';
const codes=['notifications.view','dms.review_queue.view','dms.documents.review_ai'];
function ctx(branch=2,extra:string[]=[]){const permissions=[...codes,...extra];return {...syntheticAuthContext(permissions,{id:1}),globalPermissionCodes:[],roleAssignments:[{roleId:1,roleCode:'synthetic',ownerCompanyId:1,branchId:branch,permissionCodes:permissions}]};}
beforeEach(()=>{vi.clearAllMocks();s.failed='';s.rows={dms_upload_sessions:{id:5,uploaded_by:1,document_id:null,batch_id:null,origin_entity_type:null,origin_entity_id:null,owning_company_id:1,owning_branch_id:2}};s.subjects.mockResolvedValue(true);s.employee.mockResolvedValue({subject:{owner_company_id:1,branch_id:2},allows:()=>true});});
it('allows permitted original generic intake but not another branch',async()=>{expect(await notificationUploadReviewAllowed(ctx(),5)).toBe(true);expect(await notificationUploadReviewAllowed(ctx(3),5)).toBe(false);});
it('later document linking cannot be interpreted as the old unlinked source',async()=>{s.rows.dms_upload_sessions.document_id=7;expect(await notificationUploadReviewAllowed(ctx(),5)).toBe(false);});
it('original employee subject uses real scoped employee admission and original organization',async()=>{
 Object.assign(s.rows.dms_upload_sessions,{origin_entity_type:'employee',origin_entity_id:9});expect(await notificationUploadReviewAllowed(ctx(),5)).toBe(true);
 s.employee.mockResolvedValue({subject:{owner_company_id:1,branch_id:3},allows:()=>true});expect(await notificationUploadReviewAllowed(ctx(),5)).toBe(false);
});
it('inaccessible employee is denied; an authority outage stays retryable',async()=>{
 Object.assign(s.rows.dms_upload_sessions,{origin_entity_type:'employee',origin_entity_id:9});s.employee.mockRejectedValueOnce(Error('Employee unavailable or access denied'));
 expect(await notificationUploadReviewAllowed(ctx(),5)).toBe(false);s.employee.mockRejectedValueOnce(Error('authority unavailable'));await expect(notificationUploadReviewAllowed(ctx(),5)).rejects.toThrow('authority unavailable');
});
it('dependent origin requires compliance permission in addition to employee access',async()=>{
 Object.assign(s.rows.dms_upload_sessions,{origin_entity_type:'employee_dependent',origin_entity_id:9});s.rows.employee_dependents={employee_id:7};s.employee.mockResolvedValue({subject:{owner_company_id:1,branch_id:2},allows:()=>false});expect(await notificationUploadReviewAllowed(ctx(),5)).toBe(false);
});
it('batch organization changes and unknown origin kinds fail closed',async()=>{
 Object.assign(s.rows.dms_upload_sessions,{batch_id:2});s.rows.dms_upload_batches={entity_type:null,entity_id:null,owning_company_id:2,owning_branch_id:2};expect(await notificationUploadReviewAllowed(ctx(),5)).toBe(false);
 Object.assign(s.rows.dms_upload_sessions,{batch_id:null,origin_entity_type:'unreviewed',origin_entity_id:9});expect(await notificationUploadReviewAllowed(ctx(),5)).toBe(false);
});
it('linked intake retains the full DMS subject check and original source binding',async()=>{
 s.rows.dms_upload_sessions.document_id=7;s.rows.dms_documents={owning_company_id:1,owning_branch_id:2,confidentiality_level:'internal'};
 expect(await notificationUploadReviewAllowed(ctx(2,['dms.documents.view']),5,7)).toBe(true);
 s.subjects.mockResolvedValue(false);expect(await notificationUploadReviewAllowed(ctx(2,['dms.documents.view']),5,7)).toBe(false);
});
it('source query failure is not proof of a missing source',async()=>{s.failed='dms_upload_sessions';await expect(notificationUploadReviewAllowed(ctx(),5)).rejects.toThrow('authority unavailable');});
